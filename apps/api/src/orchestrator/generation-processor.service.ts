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
  type JobResult,
  type QualityReport,
} from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { AssetQualityService } from '../assets/asset-quality.service';
import { JobEventsService } from '../jobs/job-events.service';
import { TextTo3DWorkflow, type TextTo3DInput } from '../workflows/text-to-3d.workflow';
import { ProviderRegistryService } from './provider-registry.service';
import { resolveMode } from './mode-resolver';

interface Provenance {
  sourceKind: string;
  quality: string;
  requirePbr: boolean;
  prompt?: string;
  conceptImageKey?: string;
  generationParams: Record<string, unknown>;
}

interface Produced {
  result: JobResult;
  report: QualityReport;
  provenance: Provenance;
}

/**
 * Executes a generation job end-to-end. Image-to-3D runs the route→provider→
 * quality path directly; Text-to-3D runs the resumable workflow. Both converge
 * on a shared finalize: persist asset+version+files, capture credits, complete.
 * Corrupt output is not billed; failures refund the reservation.
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
    private readonly textWorkflow: TextTo3DWorkflow,
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

    await this.setStatus(job.id, JobStatus.RUNNING, 3, 'DISPATCH', 'Starting');
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
      attemptNo = await this.recordAttempt(job.id);

      const produced =
        job.kind === 'TEXT_TO_3D'
          ? await this.runTextTo3D(job, ctx)
          : await this.runImageTo3D(job, ctx);

      if (cancelled) {
        await this.finishCancelled(job.id, job.userId, job.reservedCredits);
        return;
      }

      const asset = await this.persistResult(job, produced);
      await this.credits.capture(job.userId, job.id, job.reservedCredits, job.reservedCredits);
      await this.completeAttempt(attemptNo, job.id, 'succeeded', produced.result.providerId);
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
          resultAssetId: asset.id,
          providerId: produced.result.providerId,
          chargedCredits: job.reservedCredits,
          cost: {
            create: {
              providerId: produced.result.providerId,
              runtimeSeconds: produced.result.runtimeSeconds,
              creditsCharged: job.reservedCredits,
            },
          },
        },
      });
      await this.emit(job.id, JobStatus.COMPLETED, 100, 'COMPLETED', 'Generation complete');
    } catch (err) {
      if (cancelled) {
        await this.finishCancelled(job.id, job.userId, job.reservedCredits);
        return;
      }
      const verr = err instanceof VeyraError ? err : new VeyraError(ErrorCode.GENERATION_FAILED, String(err));
      this.logger.error(`Job ${job.id} failed: ${verr.code} ${verr.message}`);
      await this.credits.release(job.userId, job.id, job.reservedCredits, verr.code);
      if (attemptNo) await this.completeAttempt(attemptNo, job.id, 'failed', undefined, verr.code, verr.message);
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

  /** Image-to-3D: route → run provider (fallback) → quality gate. */
  private async runImageTo3D(
    job: { id: string; input: unknown; mode: string | null },
    ctx: JobContext,
  ): Promise<Produced> {
    const input = job.input as GenerationInput;
    const mode = (job.mode as GenerationMode) ?? GenerationMode.BALANCED;
    const resolved = resolveMode(mode, {
      requirePbr: input.requirePbr,
      targetPolygons: input.targetPolygons,
    });
    const decision = this.orchestrator.router.route({
      required: resolved.required,
      preference: resolved.preference,
      input,
    });
    const result = await executeWithFallback(this.orchestrator.registry, decision, input, ctx);

    await this.setStatus(job.id, JobStatus.POST_PROCESSING, 92, 'QUALITY_CHECK', 'Validating output');
    const modelFile = result.files.find((f) => f.role === 'model');
    if (!modelFile) throw new VeyraError(ErrorCode.GENERATION_FAILED, 'No model file produced');
    const report = await this.quality.validate(modelFile.key, result.reportedMetrics ?? {});
    if (!report.passed) {
      throw new VeyraError(ErrorCode.QUALITY_CHECK_FAILED, `Quality check failed: ${report.issues.join(', ')}`, {
        retryable: false,
      });
    }
    return {
      result,
      report,
      provenance: {
        sourceKind: input.kind,
        quality: resolved.preference.quality,
        requirePbr: input.requirePbr,
        generationParams: { mode, requirePbr: input.requirePbr, targetPolygons: input.targetPolygons },
      },
    };
  }

  /** Text-to-3D: run the resumable workflow, then converge on finalize. */
  private async runTextTo3D(
    job: { id: string; userId: string; input: unknown },
    ctx: JobContext,
  ): Promise<Produced> {
    const input = job.input as TextTo3DInput;
    const outcome = await this.textWorkflow.run({ id: job.id, userId: job.userId, input }, ctx);
    return {
      result: outcome.result,
      report: outcome.report,
      provenance: {
        sourceKind: 'text',
        quality: outcome.provenance.effectiveInput.quality,
        requirePbr: outcome.provenance.effectiveInput.requirePbr,
        prompt: outcome.provenance.prompt,
        conceptImageKey: outcome.provenance.conceptImageKey,
        generationParams: {
          prompt: outcome.provenance.prompt,
          parsed: outcome.provenance.parsed,
        },
      },
    };
  }

  private async persistResult(
    job: { id: string; userId: string; projectId: string | null },
    produced: Produced,
  ) {
    const { result, report, provenance } = produced;
    const providerEntry = this.orchestrator.registry.get(result.providerId);
    const meta = providerEntry?.provider.meta;

    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId: job.userId,
          projectId: job.projectId,
          name: provenance.prompt
            ? provenance.prompt.slice(0, 60)
            : `Generation ${new Date().toISOString().slice(0, 19)}`,
          type: 'MODEL',
          sourceKind: provenance.sourceKind,
          prompt: provenance.prompt,
          providerId: result.providerId,
          modelFamily: meta?.family,
          modelVersion: meta?.modelVersion,
          seed: result.seed,
          generationParams: provenance.generationParams as object,
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
      await tx.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } });
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
    providerId?: string,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.jobAttempt.updateMany({
      where: { jobId, attempt },
      data: { status, providerId, errorCode, errorMessage, endedAt: new Date() },
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
    await this.prisma.generationJob.update({ where: { id: jobId }, data: { status, progress } });
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
