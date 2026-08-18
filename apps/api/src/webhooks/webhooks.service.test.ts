import { describe, expect, it, beforeEach, vi } from 'vitest';
import { WebhooksService } from './webhooks.service';

function makeFake(endpoints: any[]) {
  const deliveries: any[] = [];
  const prisma: any = {
    webhookEndpoint: {
      findMany: async ({ where }: any) =>
        endpoints.filter(
          (e) => e.userId === where.userId && e.enabled && e.events.includes(where.events.has),
        ),
      create: async ({ data }: any) => ({ id: 'wh_1', secret: 'whsec_x', ...data }),
    },
    webhookDelivery: {
      create: async ({ data }: any) => {
        const row = { id: `del_${deliveries.length + 1}`, ...data };
        deliveries.push(row);
        return row;
      },
    },
  };
  return { prisma, deliveries };
}

describe('WebhooksService.emit', () => {
  let queueAdd: ReturnType<typeof vi.fn>;
  const queue: any = { add: (...a: unknown[]) => queueAdd(...a) };

  beforeEach(() => {
    queueAdd = vi.fn(async () => 'job');
  });

  it('delivers only to enabled endpoints subscribed to the event', async () => {
    const fake = makeFake([
      { id: 'a', userId: 'u1', enabled: true, events: ['generation.completed'] },
      { id: 'b', userId: 'u1', enabled: true, events: ['generation.failed'] },
      { id: 'c', userId: 'u1', enabled: false, events: ['generation.completed'] },
    ]);
    const svc = new WebhooksService(fake.prisma as never, queue);
    await svc.emit('u1', 'generation.completed', { jobId: 'j1' });

    expect(fake.deliveries).toHaveLength(1);
    expect(fake.deliveries[0].endpointId).toBe('a');
    expect(queueAdd).toHaveBeenCalledOnce();
  });

  it('does nothing when no endpoint matches', async () => {
    const fake = makeFake([{ id: 'a', userId: 'u1', enabled: true, events: ['asset.created'] }]);
    const svc = new WebhooksService(fake.prisma as never, queue);
    await svc.emit('u1', 'generation.completed', {});
    expect(fake.deliveries).toHaveLength(0);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('never throws into the caller if persistence fails', async () => {
    const prisma: any = {
      webhookEndpoint: { findMany: async () => { throw new Error('db down'); } },
    };
    const svc = new WebhooksService(prisma, queue);
    await expect(svc.emit('u1', 'generation.completed', {})).resolves.toBeUndefined();
  });
});
