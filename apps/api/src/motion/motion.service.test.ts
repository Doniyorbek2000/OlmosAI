import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MotionService } from './motion.service';

function makeFake() {
  const state = { jobs: [] as any[], anims: new Map<string, any>(), reserved: [] as any[] };
  const prisma: any = {
    generationJob: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        const job = { id: `job_${state.jobs.length + 1}`, ...data };
        state.jobs.push(job);
        return job;
      },
      update: async ({ where, data }: any) => {
        const j = state.jobs.find((x) => x.id === where.id);
        if (j) Object.assign(j, data);
        return j;
      },
    },
    asset: { findFirst: async ({ where }: any) => (where.id === 'char1' ? { id: 'char1' } : null) },
    animationAsset: {
      findFirst: async ({ where }: any) => state.anims.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const a = state.anims.get(where.id);
        Object.assign(a, data);
        return a;
      },
    },
  };
  return { prisma, state };
}

const creditsOk: any = { reserve: vi.fn(async () => {}) };
const storage: any = { presignDownload: async () => 'http://signed' };

describe('MotionService.createTextToMotion', () => {
  let fake: ReturnType<typeof makeFake>;
  let queueAdd: ReturnType<typeof vi.fn>;
  const queue: any = { add: (...a: unknown[]) => queueAdd(...a) };

  beforeEach(() => {
    fake = makeFake();
    queueAdd = vi.fn(async () => 'j');
    creditsOk.reserve.mockClear();
  });

  function svc(opts: { motion: boolean; workerEnabled: boolean }) {
    const config: any = { featureFlags: { MOTION: opts.motion } };
    const worker: any = { enabled: opts.workerEnabled, generate: async () => ({}) };
    return new MotionService(fake.prisma as never, creditsOk, config, worker, storage, queue);
  }

  it('is forbidden when the motion feature is off', async () => {
    await expect(svc({ motion: false, workerEnabled: true }).createTextToMotion('u1', { prompt: 'wave' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('is unavailable when the worker is not configured', async () => {
    await expect(svc({ motion: true, workerEnabled: false }).createTextToMotion('u1', { prompt: 'wave' })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('reserves credits and enqueues on the happy path', async () => {
    const job = await svc({ motion: true, workerEnabled: true }).createTextToMotion('u1', { prompt: 'a character walking', characterAssetId: 'char1' });
    expect(job.kind).toBe('MOTION');
    expect(creditsOk.reserve).toHaveBeenCalledWith('u1', job.id, 2);
    expect(queueAdd).toHaveBeenCalledOnce();
  });

  it('rejects an unknown character asset', async () => {
    await expect(svc({ motion: true, workerEnabled: true }).createTextToMotion('u1', { prompt: 'x', characterAssetId: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('MotionService.attach/detach', () => {
  it('attaches an animation to a character and detaches it', async () => {
    const fake = makeFake();
    fake.state.anims.set('a1', { id: 'a1', characterAssetId: null });
    const config: any = { featureFlags: { MOTION: true } };
    const worker: any = { enabled: true };
    const s = new MotionService(fake.prisma as never, creditsOk, config, worker, storage, { add: async () => 'j' } as never);
    const attached = await s.attach('u1', 'a1', 'char1');
    expect(attached.characterAssetId).toBe('char1');
    const detached = await s.detach('u1', 'a1');
    expect(detached.characterAssetId).toBeNull();
  });
});
