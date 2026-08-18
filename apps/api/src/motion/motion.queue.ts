import { Global, Module } from '@nestjs/common';
import { BullJobQueue, QUEUE_NAMES } from '@veyra/queue';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface MotionJobData {
  jobId: string;
  userId: string;
}

export const MOTION_QUEUE = Symbol('MOTION_QUEUE');

@Global()
@Module({
  providers: [
    {
      provide: MOTION_QUEUE,
      inject: [REDIS],
      useFactory: (redis: Redis): BullJobQueue<MotionJobData> =>
        new BullJobQueue<MotionJobData>(QUEUE_NAMES.MOTION, redis),
    },
  ],
  exports: [MOTION_QUEUE],
})
export class MotionQueueModule {}
