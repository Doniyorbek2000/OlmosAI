import { Global, Module } from '@nestjs/common';
import { BullJobQueue, QUEUE_NAMES } from '@veyra/queue';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface WorldJobData {
  jobId: string;
  userId: string;
}

export const WORLD_QUEUE = Symbol('WORLD_QUEUE');

@Global()
@Module({
  providers: [
    {
      provide: WORLD_QUEUE,
      inject: [REDIS],
      useFactory: (redis: Redis): BullJobQueue<WorldJobData> =>
        new BullJobQueue<WorldJobData>(QUEUE_NAMES.WORLD, redis),
    },
  ],
  exports: [WORLD_QUEUE],
})
export class WorldQueueModule {}
