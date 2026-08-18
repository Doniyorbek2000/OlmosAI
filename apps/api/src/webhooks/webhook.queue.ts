import { Global, Module } from '@nestjs/common';
import { BullJobQueue, QUEUE_NAMES } from '@veyra/queue';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface WebhookDeliveryJobData {
  deliveryId: string;
}

export const WEBHOOK_QUEUE = Symbol('WEBHOOK_QUEUE');

@Global()
@Module({
  providers: [
    {
      provide: WEBHOOK_QUEUE,
      inject: [REDIS],
      useFactory: (redis: Redis): BullJobQueue<WebhookDeliveryJobData> =>
        new BullJobQueue<WebhookDeliveryJobData>(QUEUE_NAMES.WEBHOOK, redis),
    },
  ],
  exports: [WEBHOOK_QUEUE],
})
export class WebhookQueueModule {}
