import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, JobStatus, VeyraError, type JobProgressEvent } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { JobEventsService } from '../jobs/job-events.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { MetricsService } from '../metrics/metrics.service';
import { WorldWorkerClient } from './world-worker.client';

interface WorldInput {
  prompt: string;
  name?: string;
  seed?: number;
}

/**
 * Runs a world-generation job on the ISOLATED HY-World worker and materializes a
 * World + its WorldObjects (terrain/meshes/lights/cameras/environment). Kept
 * entirely separate from object-generation workers (spec §39).
 */
@Injectable()
export class WorldProcessor {
  private readonly logger = new Logger('WorldProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly events: JobEventsService,
    private readonly webhooks: WebhooksService,
    private readonly metrics: MetricsService,
    private readonly worker: WorldWorkerClient,
  ) {}

  async process(jobId: string): Promise<void> {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (job.status === JobStatus.CANCELLED) {
      await this.credits.release(job.userId, job.id, job.reservedCredits, 'cancelled');
      return;
    }
    if (job.status === JobStatus.COMPLETED) return;

    const input = job.input as unknown as WorldInput;
    const startedAtMs = Date.now();
    await this.emit(job.id, JobStatus.RUNNING, 15, 'WORLD_GENERATION', 'Generating world');

    try {
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.RUNNING, startedAt: new Date(), progress: 15, providerId: 'hyworld' },
      });

      const result = await this.worker.generate({
        jobId: job.id,
        prompt: input.prompt,
        seed: input.seed,
      });
      if (!result.glb?.key || result.glb.sizeBytes <= 0) {
        throw new VeyraError(ErrorCode.GENERATION_FAILED, 'World worker produced no scene');
      }

      await this.emit(job.id, JobStatus.POST_PROCESSING, 90, 'FINALIZE', 'Saving world');
      const world = await this.prisma.world.create({
        data: {
          userId: job.userId,
          projectId: job.projectId,
          name: input.name ?? input.prompt.slice(0, 60),
          prompt: input.prompt,
          status: 'READY',
          providerId: 'hyworld',
          modelFamily: 'HY-World',
          modelVersion: 'hyworld-2.0',
          seed: result.seed,
          environment: result.environment as object,
          metadata: result.metadata as object,
          glbKey: result.glb.key,
          previewKey: result.preview?.key,
          fileSizeBytes: result.glb.sizeBytes,
          jobId: job.id,
          objects: {
            create: result.objects.map((o) => ({
              type: o.type,
              name: o.name,
              transform: (o.transform ?? {}) as object,
              data: (o.data ?? {}) as object,
              assetKey: o.assetKey,
            })),
          },
        },
      });

      await this.credits.capture(job.userId, job.id, job.reservedCredits, job.reservedCredits);
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
          resultAssetId: world.id,
          chargedCredits: job.reservedCredits,
          cost: { create: { providerId: 'hyworld', runtimeSeconds: result.runtimeSeconds, creditsCharged: job.reservedCredits } },
        },
      });
      this.metrics.recordGeneration('WORLD', 'completed', (Date.now() - startedAtMs) / 1000);
      this.metrics.recordCreditsCaptured(job.reservedCredits);
      await this.emit(job.id, JobStatus.COMPLETED, 100, 'COMPLETED', 'World ready');
      await this.webhooks.emit(job.userId, 'asset.created', { worldId: world.id, jobId: job.id, kind: 'world' });
    } catch (err) {
      const verr = err instanceof VeyraError ? err : new VeyraError(ErrorCode.GENERATION_FAILED, String(err));
      this.logger.error(`World job ${job.id} failed: ${verr.code} ${verr.message}`);
      await this.credits.release(job.userId, job.id, job.reservedCredits, verr.code);
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, errorCode: verr.code, errorMessage: verr.message, completedAt: new Date() },
      });
      this.metrics.recordGeneration('WORLD', 'failed');
      await this.emit(job.id, JobStatus.FAILED, 0, 'FAILED', verr.message);
      await this.webhooks.emit(job.userId, 'generation.failed', { jobId: job.id, code: verr.code });
    }
  }

  private async emit(jobId: string, status: JobStatus, progress: number, stage: string, message?: string) {
    const event: JobProgressEvent = { jobId, status, progress, stage, message, at: new Date().toISOString() };
    await this.prisma.generationJob.update({ where: { id: jobId }, data: { status, progress } }).catch(() => undefined);
    await this.events.publish(event);
  }
}
