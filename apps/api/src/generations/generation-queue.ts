import { Global, Module } from '@nestjs/common';
import { BullJobQueue, QUEUE_NAMES } from '@veyra/queue';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

/** Payload placed on the generation queue and consumed by the worker. */
export interface GenerationJobData {
  jobId: string;
  userId: string;
}

export const GENERATION_QUEUE = Symbol('GENERATION_QUEUE');

@Global()
@Module({
  providers: [
    {
      provide: GENERATION_QUEUE,
      inject: [REDIS],
      useFactory: (redis: Redis): BullJobQueue<GenerationJobData> =>
        new BullJobQueue<GenerationJobData>(QUEUE_NAMES.GENERATION, redis),
    },
  ],
  exports: [GENERATION_QUEUE],
})
export class GenerationQueueModule {}
