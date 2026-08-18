import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES, startWorker } from '@veyra/queue';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { GenerationProcessor } from './orchestrator/generation-processor.service';
import { ProviderRegistryService } from './orchestrator/provider-registry.service';
import { AssetProcessingProcessor } from './assets/asset-processing.processor';
import { WebhookDeliveryProcessor } from './webhooks/webhook-delivery.processor';
import { MotionProcessor } from './motion/motion.processor';
import { WorldProcessor } from './world/world.processor';
import type { GenerationJobData } from './generations/generation-queue';
import type { AssetProcessingJobData } from './assets/asset-processing.queue';
import type { WebhookDeliveryJobData } from './webhooks/webhook.queue';
import type { MotionJobData } from './motion/motion.queue';
import type { WorldJobData } from './world/world.queue';
import { REDIS } from './redis/redis.module';

/**
 * Generation worker process. Consumes the BullMQ generation queue and runs each
 * job through the GenerationProcessor. Runs separately from the HTTP API so GPU
 * dispatch never blocks web requests (spec §85). Scale horizontally.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);
  const processor = app.get(GenerationProcessor);
  const assetProcessor = app.get(AssetProcessingProcessor);
  const webhookProcessor = app.get(WebhookDeliveryProcessor);
  const motionProcessor = app.get(MotionProcessor);
  const worldProcessor = app.get(WorldProcessor);
  const orchestrator = app.get(ProviderRegistryService);
  const redis = app.get<Redis>(REDIS);

  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
  const worker = startWorker<GenerationJobData>(
    QUEUE_NAMES.GENERATION,
    redis,
    async (job) => {
      logger.log(`Processing generation job ${job.data.jobId}`);
      await processor.process(job.data.jobId);
    },
    concurrency,
  );
  worker.on('failed', (job, err) => {
    logger.error(`Generation job ${job?.data?.jobId} failed at queue level: ${err.message}`);
  });

  const assetWorker = startWorker<AssetProcessingJobData>(
    QUEUE_NAMES.ASSET_PROCESSING,
    redis,
    async (job) => {
      logger.log(`Processing asset job ${job.data.jobId}`);
      await assetProcessor.process(job.data.jobId);
    },
    concurrency,
  );
  assetWorker.on('failed', (job, err) => {
    logger.error(`Asset job ${job?.data?.jobId} failed at queue level: ${err.message}`);
  });

  const webhookWorker = startWorker<WebhookDeliveryJobData>(
    QUEUE_NAMES.WEBHOOK,
    redis,
    async (job) => {
      await webhookProcessor.deliver(job.data.deliveryId);
    },
    concurrency,
  );
  webhookWorker.on('failed', (job, err) => {
    logger.error(`Webhook delivery ${job?.data?.deliveryId} failed: ${err.message}`);
  });

  // Restricted providers (HY-Motion / HY-World) — isolated queues + workers.
  const motionWorker = startWorker<MotionJobData>(
    QUEUE_NAMES.MOTION,
    redis,
    async (job) => {
      logger.log(`Processing motion job ${job.data.jobId}`);
      await motionProcessor.process(job.data.jobId);
    },
    concurrency,
  );
  motionWorker.on('failed', (job, err) => {
    logger.error(`Motion job ${job?.data?.jobId} failed: ${err.message}`);
  });

  const worldWorker = startWorker<WorldJobData>(
    QUEUE_NAMES.WORLD,
    redis,
    async (job) => {
      logger.log(`Processing world job ${job.data.jobId}`);
      await worldProcessor.process(job.data.jobId);
    },
    // World generation is heavy; keep it to one at a time per worker process.
    1,
  );
  worldWorker.on('failed', (job, err) => {
    logger.error(`World job ${job?.data?.jobId} failed: ${err.message}`);
  });

  // Periodic provider health refresh feeds routing + circuit breaking.
  const healthTimer = setInterval(() => {
    void orchestrator.refreshAllHealth();
  }, 15_000);

  logger.log(`[${config.branding.name}] generation worker started (concurrency=${concurrency})`);

  const shutdown = async () => {
    clearInterval(healthTimer);
    await Promise.all([
      worker.close(),
      assetWorker.close(),
      webhookWorker.close(),
      motionWorker.close(),
      worldWorker.close(),
    ]);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void bootstrap();
