import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, JobStatus, VeyraError, type JobProgressEvent } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { AssetQualityService } from './asset-quality.service';
import { JobEventsService } from '../jobs/job-events.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AssetWorkerClient, type ProcessedFile } from './asset-worker.client';
import type { ProcessingPlan } from './game-ready';

interface ProcessingInput {
  assetId: string;
  sourceVersionId: string;
  sourceKey: string;
  plan: ProcessingPlan;
}

/**
 * Runs an asset-processing job: call the asset-worker, quality-gate the output,
 * and record a NEW AssetVersion (parent = source version) — originals are never
 * overwritten (spec §21). Credits are captured on success, refunded on failure.
 */
@Injectable()
export class AssetProcessingProcessor {
  private readonly logger = new Logger('AssetProcessing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly quality: AssetQualityService,
    private readonly events: JobEventsService,
    private readonly worker: AssetWorkerClient,
    private readonly webhooks: WebhooksService,
  ) {}

  async process(jobId: string): Promise<void> {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (job.status === JobStatus.CANCELLED) {
      await this.credits.release(job.userId, job.id, job.reservedCredits, 'cancelled');
      return;
    }
    if (job.status === JobStatus.COMPLETED) return;

    const input = job.input as unknown as ProcessingInput;
    await this.emit(job.id, JobStatus.RUNNING, 10, 'DISPATCH', 'Sending to asset-worker');

    try {
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.RUNNING, startedAt: new Date(), progress: 10 },
      });

      await this.emit(job.id, JobStatus.RUNNING, 40, 'PROCESSING', 'Processing geometry');
      const result = await this.worker.process({
        jobId: job.id,
        sourceKey: input.sourceKey,
        operations: input.plan.operations,
        outputFormats: input.plan.outputFormats,
        lodLevels: input.plan.lodLevels,
        generateCollider: input.plan.generateCollider,
      });

      await this.emit(job.id, JobStatus.POST_PROCESSING, 88, 'QUALITY_CHECK', 'Validating output');
      const mainFile = result.files.find((f) => f.role === 'model' && !f.channel);
      if (!mainFile) throw new VeyraError(ErrorCode.ASSET_PROCESSING_FAILED, 'No processed model produced');
      const report = await this.quality.validate(mainFile.key, result.metrics);
      if (!report.passed) {
        throw new VeyraError(ErrorCode.QUALITY_CHECK_FAILED, `Quality check failed: ${report.issues.join(', ')}`, {
          retryable: false,
        });
      }

      const version = await this.persistVersion(input, result.files, report);

      await this.credits.capture(job.userId, job.id, job.reservedCredits, job.reservedCredits);
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
          resultAssetId: input.assetId,
          chargedCredits: job.reservedCredits,
          cost: {
            create: { runtimeSeconds: result.runtimeSeconds, creditsCharged: job.reservedCredits },
          },
        },
      });
      await this.emit(job.id, JobStatus.COMPLETED, 100, 'COMPLETED', `Created v${version.version}`);
      await this.webhooks.emit(job.userId, 'asset.created', {
        assetId: input.assetId,
        versionId: version.id,
        version: version.version,
        jobId: job.id,
      });
    } catch (err) {
      const verr = err instanceof VeyraError ? err : new VeyraError(ErrorCode.ASSET_PROCESSING_FAILED, String(err));
      this.logger.error(`Asset job ${job.id} failed: ${verr.code} ${verr.message}`);
      await this.credits.release(job.userId, job.id, job.reservedCredits, verr.code);
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, errorCode: verr.code, errorMessage: verr.message, completedAt: new Date() },
      });
      await this.emit(job.id, JobStatus.FAILED, 0, 'FAILED', verr.message);
    }
  }

  private async persistVersion(
    input: ProcessingInput,
    files: ProcessedFile[],
    report: Awaited<ReturnType<AssetQualityService['validate']>>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.assetVersion.findFirst({
        where: { assetId: input.assetId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (last?.version ?? 0) + 1;

      const version = await tx.assetVersion.create({
        data: {
          assetId: input.assetId,
          version: nextVersion,
          label: input.plan.label,
          parentId: input.sourceVersionId,
          qualityScore: report.score,
          vertexCount: report.metrics.vertexCount,
          faceCount: report.metrics.faceCount,
          triangleCount: report.metrics.triangleCount,
          materialCount: report.metrics.materialCount,
          textureCount: report.metrics.textureCount,
          fileSizeBytes: report.metrics.fileSizeBytes,
          files: {
            create: files.map((f) => ({
              role: f.role.toUpperCase() as 'MODEL' | 'TEXTURE' | 'METADATA' | 'PREVIEW',
              format: f.format,
              storageKey: f.key,
              sizeBytes: f.sizeBytes,
              channel: f.channel,
            })),
          },
        },
      });
      await tx.asset.update({
        where: { id: input.assetId },
        data: { currentVersionId: version.id },
      });
      return version;
    });
  }

  private async emit(
    jobId: string,
    status: JobStatus,
    progress: number,
    stage: string,
    message?: string,
  ): Promise<void> {
    const event: JobProgressEvent = { jobId, status, progress, stage, message, at: new Date().toISOString() };
    await this.events.publish(event);
  }
}
