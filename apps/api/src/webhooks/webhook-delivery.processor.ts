import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BullJobQueue } from '@veyra/queue';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { WEBHOOK_QUEUE, type WebhookDeliveryJobData } from './webhook.queue';
import { retryDelayMs, signWebhook, WEBHOOK_MAX_ATTEMPTS } from './webhook-signing';

/**
 * Delivers a single webhook: HMAC-signed POST to the endpoint. On failure it
 * retries with exponential backoff up to WEBHOOK_MAX_ATTEMPTS, updating the
 * WebhookDelivery log each time; after the last attempt it marks FAILED
 * (spec §32).
 */
@Injectable()
export class WebhookDeliveryProcessor {
  private readonly logger = new Logger('WebhookDelivery');

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @Inject(WEBHOOK_QUEUE) private readonly queue: BullJobQueue<WebhookDeliveryJobData>,
  ) {}

  async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true },
    });
    if (!delivery || delivery.status === 'DELIVERED') return;
    const endpoint = delivery.endpoint;
    if (!endpoint || !endpoint.enabled) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED' },
      });
      return;
    }

    const body = JSON.stringify(delivery.payload);
    const ts = Math.floor(Date.now() / 1000);
    const signature = signWebhook(endpoint.secret, body, ts);
    const attempt = delivery.attempts + 1;

    let responseStatus: number | undefined;
    let ok = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(endpoint.url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            'veyra-event': delivery.event,
            'veyra-signature': signature,
            'user-agent': 'Veyra-Webhooks/1',
          },
          body,
        });
        responseStatus = res.status;
        ok = res.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      this.logger.warn(`Delivery ${deliveryId} attempt ${attempt} error: ${(err as Error).message}`);
    }

    if (ok) {
      this.metrics.recordWebhookDelivery('delivered');
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'DELIVERED', attempts: attempt, responseStatus, deliveredAt: new Date() },
      });
      return;
    }

    if (attempt < WEBHOOK_MAX_ATTEMPTS) {
      const delay = retryDelayMs(attempt);
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'PENDING',
          attempts: attempt,
          responseStatus,
          nextRetryAt: new Date(Date.now() + delay),
        },
      });
      await this.queue.add(delivery.event, { deliveryId }, { jobId: `${deliveryId}:${attempt}`, delayMs: delay });
    } else {
      this.metrics.recordWebhookDelivery('failed');
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED', attempts: attempt, responseStatus },
      });
    }
  }
}
