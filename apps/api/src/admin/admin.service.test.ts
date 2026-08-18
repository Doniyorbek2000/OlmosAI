import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service';

function makeFake() {
  const providers = new Map<string, any>([
    ['triposr', { providerId: 'triposr', enabled: true, priority: 60, costMultiplier: 1, draining: false }],
  ]);
  const prisma: any = {
    user: {
      count: async (args: any = {}) => (args.where?.sessions ? 4 : 10),
    },
    generationJob: {
      count: async (args: any = {}) => {
        const where = args.where;
        if (!where) return 100;
        if (where.status === 'FAILED') return 5;
        if (where.status?.in) return 3; // queue depth
        return 0;
      },
      groupBy: async () => [
        { status: 'COMPLETED', _count: 90 },
        { status: 'FAILED', _count: 5 },
      ],
    },
    assetFile: { aggregate: async () => ({ _sum: { sizeBytes: 123456 } }) },
    apiUsage: { count: async () => 42 },
    aIProvider: {
      findMany: async () => [...providers.values()],
      findUnique: async ({ where }: any) => providers.get(where.providerId) ?? null,
      update: async ({ where, data }: any) => {
        const p = providers.get(where.providerId);
        Object.assign(p, data);
        return p;
      },
    },
    gPUWorker: { findMany: async () => [] },
  };
  return { prisma, providers };
}

const billingAdmin: any = {
  overview: async () => ({
    revenueCents: 50000,
    mrrCents: 12000,
    creditsGranted: 5000,
    creditsConsumed: 1200,
    activeSubscriptions: 8,
    planBreakdown: [{ plan: 'PRO', count: 8 }],
    recentPayments: [],
  }),
};

describe('AdminService', () => {
  let fake: ReturnType<typeof makeFake>;
  let reload: ReturnType<typeof vi.fn>;
  let service: AdminService;

  beforeEach(() => {
    fake = makeFake();
    reload = vi.fn(async () => {});
    service = new AdminService(fake.prisma as never, billingAdmin, { reload } as never);
  });

  it('aggregates a platform overview', async () => {
    const o = await service.overview();
    expect(o.users).toEqual({ total: 10, activeLast30d: 4 });
    expect(o.revenue.mrrCents).toBe(12000);
    expect(o.jobs.total).toBe(100);
    expect(o.jobs.failed).toBe(5);
    expect(o.jobs.queueDepth).toBe(3);
    expect(o.jobs.byStatus).toEqual({ COMPLETED: 90, FAILED: 5 });
    expect(o.storageBytes).toBe(123456);
    expect(o.apiCalls).toBe(42);
    expect(o.providers).toHaveLength(1);
  });

  it('updates a provider and rebuilds the live registry', async () => {
    const updated = await service.updateProvider('triposr', { enabled: false, priority: 10 });
    expect(updated.enabled).toBe(false);
    expect(updated.priority).toBe(10);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('throws when updating an unknown provider', async () => {
    await expect(service.updateProvider('nope', { enabled: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(reload).not.toHaveBeenCalled();
  });
});
