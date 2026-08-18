import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, JobStatus, VeyraError, type JobProgressEvent } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { JobEventsService } from '../jobs/job-events.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { MetricsService } from '../metrics/metrics.service';
import { MotionWorkerClient } from './motion-worker.client';

interface MotionInput {
  prompt: string;
  durationSeconds: number;
  fps: number;
  seed?: number;
  characterAssetId?: string;
  name?: string;
}

/**
 * Runs a text→motion job: call the HY-Motion worker, then create an
 * AnimationAsset (skeleton + animated GLB + clip), optionally attached to a
 * character. Credits captured on success / refunded on failure.
 */
@Injectable()
export class MotionProcessor {
  private readonly logger = new Logger('MotionProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly events: JobEventsService,
    private readonly webhooks: WebhooksService,
    private readonly metrics: MetricsService,
    private readonly worker: MotionWorkerClient,
  ) {}

  async process(jobId: string): Promise<void> {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (job.status === JobStatus.CANCELLED) {
      await this.credits.release(job.userId, job.id, job.reservedCredits, 'cancelled');
      return;
    }
    if (job.status === JobStatus.COMPLETED) return;

    const input = job.input as unknown as MotionInput;
    const startedAtMs = Date.now();
    await this.emit(job.id, JobStatus.RUNNING, 15, 'MOTION_GENERATION', 'Generating motion');

    try {
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.RUNNING, startedAt: new Date(), progress: 15, providerId: 'hymotion' },
      });

      const result = await this.worker.generate({
        jobId: job.id,
        prompt: input.prompt,
        durationSeconds: input.durationSeconds,
        fps: input.fps,
        seed: input.seed,
      });

      const glb = result.files.find((f) => f.format === 'GLB');
      const clip = result.files.find((f) => f.format === 'JSON');
      if (!glb || glb.sizeBytes <= 0) {
        throw new VeyraError(ErrorCode.GENERATION_FAILED, 'Motion worker produced no animation');
      }

      await this.emit(job.id, JobStatus.POST_PROCESSING, 90, 'FINALIZE', 'Saving animation');
      const anim = await this.prisma.animationAsset.create({
        data: {
          userId: job.userId,
          characterAssetId: input.characterAssetId,
          projectId: job.projectId,
          name: input.name ?? input.prompt.slice(0, 60),
          source: 'TEXT_MOTION',
          prompt: input.prompt,
          providerId: 'hymotion',
          modelFamily: 'HY-Motion',
          modelVersion: 'hymotion-1.0',
          seed: result.seed,
          durationSeconds: result.durationSeconds,
          fps: result.fps,
          frameCount: result.frameCount,
          skeleton: result.skeleton as object,
          generationParams: { prompt: input.prompt, durationSeconds: input.durationSeconds } as object,
          glbKey: glb.key,
          clipKey: clip?.key,
          fileSizeBytes: glb.sizeBytes,
          jobId: job.id,
        },
      });

      await this.credits.capture(job.userId, job.id, job.reservedCredits, job.reservedCredits);
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
          resultAssetId: anim.id,
          chargedCredits: job.reservedCredits,
          cost: { create: { providerId: 'hymotion', runtimeSeconds: result.runtimeSeconds, creditsCharged: job.reservedCredits } },
        },
      });
      this.metrics.recordGeneration('MOTION', 'completed', (Date.now() - startedAtMs) / 1000);
      this.metrics.recordCreditsCaptured(job.reservedCredits);
      await this.emit(job.id, JobStatus.COMPLETED, 100, 'COMPLETED', 'Animation ready');
      await this.webhooks.emit(job.userId, 'asset.created', { animationId: anim.id, jobId: job.id, kind: 'animation' });
    } catch (err) {
      const verr = err instanceof VeyraError ? err : new VeyraError(ErrorCode.GENERATION_FAILED, String(err));
      this.logger.error(`Motion job ${job.id} failed: ${verr.code} ${verr.message}`);
      await this.credits.release(job.userId, job.id, job.reservedCredits, verr.code);
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.FAILED, errorCode: verr.code, errorMessage: verr.message, completedAt: new Date() },
      });
      this.metrics.recordGeneration('MOTION', 'failed');
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
