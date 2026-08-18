import {
  Capability,
  type CostEstimate,
  type GenerationInput,
  type JobContext,
  type JobResult,
  type ProviderHealth,
  ProviderHealthStatus,
  type ProviderMeta,
  type ThreeDProvider,
} from '@veyra/types';

/**
 * In-process mock provider for development and CI. Simulates staged progress
 * and returns a deterministic result pointing at a pre-seeded placeholder GLB.
 *
 * MUST NOT run in production — `packages/config` fails validation if the mock
 * provider is enabled while NODE_ENV=production.
 */
export class MockProvider implements ThreeDProvider {
  readonly meta: ProviderMeta = {
    id: 'mock',
    displayName: 'Mock Provider (dev)',
    family: 'mock',
    modelVersion: 'mock-1',
    codeLicense: 'Proprietary',
    weightsLicense: 'n/a',
    commercialUse: 'no',
  };

  /** How long the simulated stages take in total. Overridable for fast tests. */
  constructor(private readonly totalMs = 400) {}

  capabilities(): Capability[] {
    return [
      Capability.IMAGE_TO_3D,
      Capability.TEXT_TO_3D,
      Capability.FAST_GENERATION,
      Capability.MESH,
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      status: ProviderHealthStatus.HEALTHY,
      freeVramMb: 999_999,
      queueDepth: 0,
      latencyMs: 1,
      checkedAt: new Date().toISOString(),
    };
  }

  async estimateCost(_input: GenerationInput): Promise<CostEstimate> {
    return { credits: 1, estimatedSeconds: 1, estimatedGpuUsd: 0 };
  }

  async generate(input: GenerationInput, ctx: JobContext): Promise<JobResult> {
    const stages: Array<[number, string, string]> = [
      [10, 'PREPROCESS', 'Preprocessing input'],
      [35, 'SHAPE_GENERATION', 'Generating geometry'],
      [70, 'TEXTURE_GENERATION', 'Applying textures'],
      [90, 'POSTPROCESS', 'Optimizing mesh'],
      [98, 'FINALIZE', 'Finalizing'],
    ];
    const step = Math.max(1, Math.floor(this.totalMs / stages.length));
    for (const [progress, stage, message] of stages) {
      if (ctx.isCancelled()) break;
      await delay(step, ctx.signal);
      await ctx.reportProgress(progress, stage, message);
    }
    const seed = input.seed ?? 42;
    return {
      jobId: ctx.jobId,
      providerId: this.meta.id,
      // Points at a seeded placeholder object the storage layer serves in dev.
      files: [
        {
          format: 'GLB',
          key: `_placeholders/mock-cube.glb`,
          sizeBytes: 2048,
          role: 'model',
        },
      ],
      reportedMetrics: { vertexCount: 24, faceCount: 12, triangleCount: 12 },
      seed,
      runtimeSeconds: this.totalMs / 1000,
    };
  }

  async cancel(_jobId: string): Promise<void> {
    // no-op; cancellation is observed via JobContext.isCancelled()
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}
