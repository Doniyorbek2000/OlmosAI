import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BullJobQueue } from '@veyra/queue';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { WEBHOOK_QUEUE, type WebhookDeliveryJobData } from './webhook.queue';
import { generateWebhookSecret, WEBHOOK_EVENTS, type WebhookEventType } from './webhook-signing';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WEBHOOK_QUEUE) private readonly queue: BullJobQueue<WebhookDeliveryJobData>,
  ) {}

  async create(userId: string, url: string, events: string[]) {
    const invalid = events.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEventType));
    if (invalid.length) {
      throw new VeyraError(ErrorCode.INVALID_INPUT, `Unknown events: ${invalid.join(', ')}`);
    }
    if (!/^https:\/\//.test(url)) {
      throw new VeyraError(ErrorCode.INVALID_INPUT, 'Webhook URL must be https');
    }
    const secret = generateWebhookSecret();
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: { userId, url, events: events.length ? events : [...WEBHOOK_EVENTS], secret },
    });
    // The signing secret is returned once at creation.
    return { id: endpoint.id, url: endpoint.url, events: endpoint.events, secret };
  }

  list(userId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, events: true, enabled: true, createdAt: true },
    });
  }

  async delete(userId: string, id: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, userId } });
    if (!endpoint) throw new VeyraError(ErrorCode.NOT_FOUND, 'Webhook endpoint not found');
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { ok: true };
  }

  recentDeliveries(userId: string, endpointId: string) {
    return this.prisma.webhookDelivery.findMany({
      where: { endpoint: { id: endpointId, userId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, event: true, status: true, attempts: true, responseStatus: true, createdAt: true, deliveredAt: true },
    });
  }

  /**
   * Fan out an event to the user's subscribed, enabled endpoints. Creates a
   * WebhookDelivery per endpoint and enqueues delivery. Never throws into the
   * caller (a generation must not fail because a webhook could not be queued).
   */
  async emit(userId: string, event: WebhookEventType, data: Record<string, unknown>): Promise<void> {
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { userId, enabled: true, events: { has: event } },
      });
      if (endpoints.length === 0) return;
      const payload = { event, createdAt: new Date().toISOString(), data };
      for (const endpoint of endpoints) {
        const delivery = await this.prisma.webhookDelivery.create({
          data: { endpointId: endpoint.id, event, payload: payload as object, status: 'PENDING' },
        });
        await this.queue.add(
          event,
          { deliveryId: delivery.id },
          { jobId: delivery.id, attempts: 1 },
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to emit webhook ${event}: ${(err as Error).message}`);
    }
  }
}
