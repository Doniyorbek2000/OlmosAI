import { Global, Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { WebhookQueueModule } from './webhook.queue';

@Global()
@Module({
  imports: [WebhookQueueModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryProcessor],
  exports: [WebhooksService, WebhookDeliveryProcessor],
})
export class WebhooksModule {}
