import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES, startWorker } from '@veyra/queue';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { GenerationProcessor } from './orchestrator/generation-processor.service';
import { ProviderRegistryService } from './orchestrator/provider-registry.service';
import type { GenerationJobData } from './generations/generation-queue';
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
  const orchestrator = app.get(ProviderRegistryService);
  const redis = app.get<Redis>(REDIS);

  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
  const worker = startWorker<GenerationJobData>(
    QUEUE_NAMES.GENERATION,
    redis,
    async (job) => {
      logger.log(`Processing job ${job.data.jobId}`);
      await processor.process(job.data.jobId);
    },
    concurrency,
  );

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.data?.jobId} failed at queue level: ${err.message}`);
  });

  // Periodic provider health refresh feeds routing + circuit breaking.
  const healthTimer = setInterval(() => {
    void orchestrator.refreshAllHealth();
  }, 15_000);

  logger.log(`[${config.branding.name}] generation worker started (concurrency=${concurrency})`);

  const shutdown = async () => {
    clearInterval(healthTimer);
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void bootstrap();
