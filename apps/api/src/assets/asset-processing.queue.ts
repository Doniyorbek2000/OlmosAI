import { Global, Module } from '@nestjs/common';
import { BullJobQueue, QUEUE_NAMES } from '@veyra/queue';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface AssetProcessingJobData {
  jobId: string;
  userId: string;
}

export const ASSET_PROCESSING_QUEUE = Symbol('ASSET_PROCESSING_QUEUE');

@Global()
@Module({
  providers: [
    {
      provide: ASSET_PROCESSING_QUEUE,
      inject: [REDIS],
      useFactory: (redis: Redis): BullJobQueue<AssetProcessingJobData> =>
        new BullJobQueue<AssetProcessingJobData>(QUEUE_NAMES.ASSET_PROCESSING, redis),
    },
  ],
  exports: [ASSET_PROCESSING_QUEUE],
})
export class AssetProcessingQueueModule {}
