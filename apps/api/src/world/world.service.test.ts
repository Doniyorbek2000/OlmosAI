import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WorldService } from './world.service';

function makeFake() {
  const jobs: any[] = [];
  const prisma: any = {
    generationJob: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        const job = { id: `job_${jobs.length + 1}`, ...data };
        jobs.push(job);
        return job;
      },
      update: async ({ where, data }: any) => {
        const j = jobs.find((x) => x.id === where.id);
        if (j) Object.assign(j, data);
        return j;
      },
    },
    project: { findFirst: async () => ({ id: 'p1' }) },
    world: {
      findMany: async () => [],
      findFirst: async () => null,
    },
  };
  return { prisma, jobs };
}

const credits: any = { reserve: vi.fn(async () => {}) };
const storage: any = {};

describe('WorldService.create', () => {
  let fake: ReturnType<typeof makeFake>;
  let queueAdd: ReturnType<typeof vi.fn>;
  const queue: any = { add: (...a: unknown[]) => queueAdd(...a) };

  beforeEach(() => {
    fake = makeFake();
    queueAdd = vi.fn(async () => 'j');
    credits.reserve.mockClear();
  });

  function svc(opts: { world: boolean; workerEnabled: boolean }) {
    const flags: any = { get: () => opts.world };
    const worker: any = { enabled: opts.workerEnabled };
    return new WorldService(fake.prisma as never, credits, flags, worker, storage, queue);
  }

  it('is forbidden when the world feature is off', async () => {
    await expect(svc({ world: false, workerEnabled: true }).create('u1', { prompt: 'a forest' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('is unavailable when the worker is not configured', async () => {
    await expect(svc({ world: true, workerEnabled: false }).create('u1', { prompt: 'a forest' })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('reserves the world cost and enqueues on the happy path', async () => {
    const job = await svc({ world: true, workerEnabled: true }).create('u1', { prompt: 'a floating island' });
    expect(job.kind).toBe('WORLD');
    expect(credits.reserve).toHaveBeenCalledWith('u1', job.id, 5);
    expect(queueAdd).toHaveBeenCalledOnce();
  });
});
