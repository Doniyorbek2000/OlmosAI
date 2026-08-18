import { describe, expect, it, vi } from 'vitest';
import { StageStatus } from '@veyra/types';
import { runWorkflow, type StageStore, type WorkflowStage } from './workflow-engine';

/** In-memory stage store for testing resume semantics. */
function memoryStore(seed: Record<string, { status: StageStatus; output: unknown }> = {}): StageStore & {
  rows: Record<string, { status: StageStatus; output: unknown }>;
} {
  const rows: Record<string, { status: StageStatus; output: unknown }> = { ...seed };
  return {
    rows,
    async ensure(_jobId, stages) {
      for (const s of stages) rows[s.name] ??= { status: StageStatus.PENDING, output: null };
    },
    async get(_jobId, name) {
      return rows[name] ?? null;
    },
    async start(_jobId, name) {
      rows[name] = { ...rows[name], status: StageStatus.RUNNING };
    },
    async complete(_jobId, name, output) {
      rows[name] = { status: StageStatus.COMPLETED, output };
    },
    async fail(_jobId, name) {
      rows[name] = { ...rows[name], status: StageStatus.FAILED };
    },
  };
}

type Ctx = Record<string, unknown> & { a?: number; b?: number; c?: number };

describe('runWorkflow', () => {
  it('runs stages in order, accumulating context', async () => {
    const store = memoryStore();
    const stages: WorkflowStage<Ctx>[] = [
      { name: 'A', targetProgress: 33, run: async () => ({ a: 1 }) },
      { name: 'B', targetProgress: 66, run: async (ctx) => ({ b: (ctx.a ?? 0) + 1 }) },
      { name: 'C', targetProgress: 100, run: async (ctx) => ({ c: (ctx.b ?? 0) + 1 }) },
    ];
    const ctx = await runWorkflow('job1', stages, store, {} as Ctx);
    expect(ctx).toMatchObject({ a: 1, b: 2, c: 3 });
    expect(store.rows.C.status).toBe(StageStatus.COMPLETED);
  });

  it('resumes from the last successful stage without re-running completed ones', async () => {
    // Seed A + B as already completed with persisted output.
    const store = memoryStore({
      A: { status: StageStatus.COMPLETED, output: { a: 10 } },
      B: { status: StageStatus.COMPLETED, output: { b: 20 } },
    });
    const runA = vi.fn(async () => ({ a: 1 }));
    const runB = vi.fn(async () => ({ b: 2 }));
    const runC = vi.fn(async (ctx: Ctx) => ({ c: (ctx.b ?? 0) + 5 }));
    const stages: WorkflowStage<Ctx>[] = [
      { name: 'A', targetProgress: 33, run: runA },
      { name: 'B', targetProgress: 66, run: runB },
      { name: 'C', targetProgress: 100, run: runC },
    ];
    const ctx = await runWorkflow('job1', stages, store, {} as Ctx);

    expect(runA).not.toHaveBeenCalled();
    expect(runB).not.toHaveBeenCalled();
    expect(runC).toHaveBeenCalledOnce();
    // C sees the persisted output of B (20), not a re-run value.
    expect(ctx).toMatchObject({ a: 10, b: 20, c: 25 });
  });

  it('marks a stage FAILED and stops when it throws', async () => {
    const store = memoryStore();
    const runC = vi.fn();
    const stages: WorkflowStage<Ctx>[] = [
      { name: 'A', targetProgress: 33, run: async () => ({ a: 1 }) },
      {
        name: 'B',
        targetProgress: 66,
        run: async () => {
          throw new Error('boom');
        },
      },
      { name: 'C', targetProgress: 100, run: runC },
    ];
    await expect(runWorkflow('job1', stages, store, {} as Ctx)).rejects.toThrow('boom');
    expect(store.rows.B.status).toBe(StageStatus.FAILED);
    expect(runC).not.toHaveBeenCalled();
  });

  it('reports progress at each stage boundary', async () => {
    const store = memoryStore();
    const onProgress = vi.fn(async () => {});
    const stages: WorkflowStage<Ctx>[] = [
      { name: 'A', targetProgress: 50, run: async () => ({ a: 1 }) },
      { name: 'B', targetProgress: 100, run: async () => ({ b: 2 }) },
    ];
    await runWorkflow('job1', stages, store, {} as Ctx, { onProgress });
    expect(onProgress).toHaveBeenCalledWith(50, 'A');
    expect(onProgress).toHaveBeenCalledWith(100, 'B');
  });
});
