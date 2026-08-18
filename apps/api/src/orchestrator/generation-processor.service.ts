import { Injectable, Logger } from '@nestjs/common';
import { executeWithFallback } from '@veyra/ai-sdk';
import {
  ErrorCode,
  GenerationMode,
  JobStatus,
  VeyraError,
  type GenerationInput,
  type JobContext,
  type JobProgressEvent,
} from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { AssetQualityService } from '../assets/asset-quality.service';
import { JobEventsService } from '../jobs/job-events.service';
import { ProviderRegistryService } from './provider-registry.service';
import { resolveMode } from './mode-resolver';

/**
 * Executes a single generation job end-to-end (the first-milestone spine):
 * route → run provider (with fallback) → validate quality → persist asset +
 * version + files → finalize credits → emit completion. Corrupt output is not
 * billed; server/provider failures refund the reservation.
 */
@Injectable()
export class GenerationProcessor {
  private readonly logger = new Logger('GenerationProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly quality: AssetQualityService,
    private readonly events: JobEventsService,
    private readonly orchestrator: ProviderRegistryService,
  ) {}

  async process(jobId: string): Promise<void> {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`Job ${jobId} not found`);
      return;
    }
    if (job.status === JobStatus.CANCELLED) {
      await this.credits.release(job.userId, job.id, job.reservedCredits, 'cancelled');
      return;
    }
    if (job.status === JobStatus.COMPLETED) return; // idempotent

    const input = job.input as unknown as GenerationInput;
    const mode = (job.mode as GenerationMode) ?? GenerationMode.BALANCED;
    const resolved = resolveMode(mode, {
      requirePbr: input.requirePbr,
      targetPolygons: input.targetPolygons,
    });

    await this.setStatus(job.id, JobStatus.RUNNING, 5, 'DISPATCH', 'Selecting provider');
    await this.prisma.generationJob.update({
      where: { id: job.id },
      data: { startedAt: new Date() },
    });

    const controller = new AbortController();
    let cancelled = false;
    const ctx: JobContext = {
      jobId: job.id,
      isCancelled: () => cancelled,
      signal: controller.signal,
      reportProgress: async (progress, stage, message) => {
        // Honor mid-flight cancellation.
        const fresh = await this.prisma.generationJob.findUnique({
          where: { id: job.id },
          select: { status: true },
        });
        if (fresh?.status === JobStatus.CANCELLED) {
          cancelled = true;
          controller.abort();
          return;
        }
        await this.setStatus(job.id, JobStatus.RUNNING, progress, stage ?? 'PROCESSING', message);
      },
    };

    let attemptNo = 0;
    try {
      const decision = this.orchestrator.router.route({
        required: resolved.required,
        preference: resolved.preference,
        input,
      });

      attemptNo = await this.recordAttempt(job.id, decision.chain[0]?.meta.id);

      const result = await executeWithFallback(
        this.orchestrator.registry,
        decision,
        input,
        ctx,
        { attemptsPerProvider: 1 },
      );

      if (cancelled) {
        await this.finishCancelled(job.id, job.userId, job.reservedCredits);
        return;
      }

      // Quality gate.
      await this.setStatus(job.id, JobStatus.POST_PROCESSING, 92, 'QUALITY_CHECK', 'Validating output');
      const modelFile = result.files.find((f) => f.role === 'model');
      if (!modelFile) throw new VeyraError(ErrorCode.GENERATION_FAILED, 'No model file produced');
      const report = await this.quality.validate(modelFile.key, result.reportedMetrics ?? {});
      if (!report.passed) {
        throw new VeyraError(ErrorCode.QUALITY_CHECK_FAILED, `Quality check failed: ${report.issues.join(', ')}`, {
          retryable: false,
        });
      }

      // Persist asset + version + files, finalize credits, complete — atomically.
      const asset = await this.persistResult(job, result, report, resolved.preference.quality);

      await this.credits.capture(job.userId, job.id, job.reservedCredits, job.reservedCredits);
      await this.completeAttempt(attemptNo, job.id, 'succeeded');
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
          resultAssetId: asset.id,
          providerId: result.providerId,
          chargedCredits: job.reservedCredits,
          cost: {
            create: {
              providerId: result.providerId,
              runtimeSeconds: result.runtimeSeconds,
              creditsCharged: job.reservedCredits,
            },
          },
        },
      });
      await this.emit(job.id, JobStatus.COMPLETED, 100, 'COMPLETED', 'Generation complete');
    } catch (err) {
      const verr = err instanceof VeyraError ? err : new VeyraError(ErrorCode.GENERATION_FAILED, String(err));
      this.logger.error(`Job ${job.id} failed: ${verr.code} ${verr.message}`);
      // Server/provider failure → refund the reservation (spec §28).
      await this.credits.release(job.userId, job.id, job.reservedCredits, verr.code);
      if (attemptNo) await this.completeAttempt(attemptNo, job.id, 'failed', verr.code, verr.message);
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorCode: verr.code,
          errorMessage: verr.message,
          completedAt: new Date(),
        },
      });
      await this.emit(job.id, JobStatus.FAILED, 0, 'FAILED', verr.message);
    }
  }

  private async persistResult(
    job: { id: string; userId: string; projectId: string | null; input: unknown },
    result: Awaited<ReturnType<typeof executeWithFallback>>,
    report: Awaited<ReturnType<AssetQualityService['validate']>>,
    quality: string,
  ) {
    const input = job.input as GenerationInput;
    const providerEntry = this.orchestrator.registry.get(result.providerId);
    const meta = providerEntry?.provider.meta;

    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId: job.userId,
          projectId: job.projectId,
          name: `Generation ${new Date().toISOString().slice(0, 19)}`,
          type: 'MODEL',
          sourceKind: input.kind,
          providerId: result.providerId,
          modelFamily: meta?.family,
          modelVersion: meta?.modelVersion,
          seed: result.seed,
          generationParams: { quality, requirePbr: input.requirePbr } as object,
        },
      });
      const version = await tx.assetVersion.create({
        data: {
          assetId: asset.id,
          version: 1,
          label: 'original',
          qualityScore: report.score,
          vertexCount: report.metrics.vertexCount,
          faceCount: report.metrics.faceCount,
          triangleCount: report.metrics.triangleCount,
          materialCount: report.metrics.materialCount,
          textureCount: report.metrics.textureCount,
          fileSizeBytes: report.metrics.fileSizeBytes,
          files: {
            create: result.files.map((f) => ({
              role: f.role.toUpperCase() as 'MODEL' | 'TEXTURE' | 'METADATA' | 'PREVIEW',
              format: f.format,
              storageKey: f.key,
              sizeBytes: f.sizeBytes,
              channel: f.channel,
            })),
          },
          materials: { create: [{ name: 'Material' }] },
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { currentVersionId: version.id },
      });
      return asset;
    });
  }

  private async recordAttempt(jobId: string, providerId?: string): Promise<number> {
    const count = await this.prisma.jobAttempt.count({ where: { jobId } });
    const attempt = count + 1;
    await this.prisma.jobAttempt.create({
      data: { jobId, attempt, providerId, status: 'running' },
    });
    return attempt;
  }

  private async completeAttempt(
    attempt: number,
    jobId: string,
    status: string,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.jobAttempt.updateMany({
      where: { jobId, attempt },
      data: { status, errorCode, errorMessage, endedAt: new Date() },
    });
  }

  private async finishCancelled(jobId: string, userId: string, reserved: number): Promise<void> {
    await this.credits.release(userId, jobId, reserved, 'cancelled');
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status: JobStatus.CANCELLED, completedAt: new Date() },
    });
    await this.emit(jobId, JobStatus.CANCELLED, 0, 'CANCELLED', 'Cancelled');
  }

  private async setStatus(
    jobId: string,
    status: JobStatus,
    progress: number,
    stage: string,
    message?: string,
  ): Promise<void> {
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status, progress },
    });
    await this.emit(jobId, status, progress, stage, message);
  }

  private async emit(
    jobId: string,
    status: JobStatus,
    progress: number,
    stage: string,
    message?: string,
  ): Promise<void> {
    const event: JobProgressEvent = {
      jobId,
      status,
      progress,
      stage,
      message,
      at: new Date().toISOString(),
    };
    await this.events.publish(event);
  }
}
