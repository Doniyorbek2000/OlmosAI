import { StageStatus } from '@veyra/types';

/** Serializable state accumulated across stages. */
export type WorkflowContext = Record<string, unknown>;

export interface WorkflowStage<Ctx extends WorkflowContext> {
  name: string;
  /** Job progress (0..100) reported when this stage completes. */
  targetProgress: number;
  /** Produce a partial context patch. Must be JSON-serializable (persisted). */
  run(ctx: Ctx): Promise<Partial<Ctx>>;
  /** If true, the stage re-runs on resume even if previously COMPLETED. */
  alwaysRun?: boolean;
}

/**
 * Persistence for stage state. The Prisma-backed implementation stores rows in
 * GenerationStage; an in-memory implementation is used in tests. Keeping the
 * store injectable makes the engine's resume logic unit-testable without a DB.
 */
export interface StageStore {
  ensure(jobId: string, stages: { name: string; order: number }[]): Promise<void>;
  get(jobId: string, name: string): Promise<{ status: StageStatus; output: unknown } | null>;
  start(jobId: string, name: string): Promise<void>;
  complete(jobId: string, name: string, output: unknown): Promise<void>;
  fail(jobId: string, name: string, error: string): Promise<void>;
}

export interface WorkflowRunOptions {
  onProgress?: (progress: number, stage: string, message?: string) => Promise<void>;
  isCancelled?: () => boolean;
}

/**
 * Runs an ordered list of stages with resume semantics: a COMPLETED stage is
 * skipped and its persisted output is merged back into the context, so a worker
 * that crashed mid-workflow continues from the last successful stage rather than
 * restarting (spec §6). Stage output is the unit of durability.
 */
export async function runWorkflow<Ctx extends WorkflowContext>(
  jobId: string,
  stages: WorkflowStage<Ctx>[],
  store: StageStore,
  initialContext: Ctx,
  options: WorkflowRunOptions = {},
): Promise<Ctx> {
  await store.ensure(
    jobId,
    stages.map((s, i) => ({ name: s.name, order: i })),
  );

  let ctx = { ...initialContext };

  for (const stage of stages) {
    if (options.isCancelled?.()) {
      throw new WorkflowCancelledError(stage.name);
    }

    const existing = await store.get(jobId, stage.name);
    if (existing?.status === StageStatus.COMPLETED && !stage.alwaysRun) {
      // Resume: merge persisted output and skip execution.
      if (existing.output && typeof existing.output === 'object') {
        ctx = { ...ctx, ...(existing.output as Partial<Ctx>) };
      }
      await options.onProgress?.(stage.targetProgress, stage.name, 'resumed');
      continue;
    }

    await store.start(jobId, stage.name);
    try {
      const patch = await stage.run(ctx);
      await store.complete(jobId, stage.name, patch);
      ctx = { ...ctx, ...patch };
      await options.onProgress?.(stage.targetProgress, stage.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await store.fail(jobId, stage.name, message);
      throw err;
    }
  }

  return ctx;
}

export class WorkflowCancelledError extends Error {
  constructor(public readonly stage: string) {
    super(`Workflow cancelled at stage ${stage}`);
    this.name = 'WorkflowCancelledError';
  }
}
