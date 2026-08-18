import {
  type Capability,
  type CostEstimate,
  type GenerationInput,
  type JobContext,
  type JobResult,
  type ProviderHealth,
  type ProviderMeta,
  type ThreeDProvider,
  ErrorCode,
  VeyraError,
} from '@veyra/types';
import type { WorkerTransport } from '../worker-transport.js';

export interface WorkerProviderConfig {
  meta: ProviderMeta;
  capabilities: Capability[];
  transport: WorkerTransport;
  /** Base credits for a STANDARD generation; scaled by quality/pbr. */
  baseCredits: number;
  /** Base seconds for a STANDARD generation; scaled by quality. */
  baseSeconds: number;
  /** Rough USD/second GPU cost for margin tracking. */
  gpuUsdPerSecond?: number;
}

const QUALITY_MULTIPLIER: Record<string, number> = {
  DRAFT: 0.5,
  STANDARD: 1,
  HIGH: 2,
  ULTRA: 3.5,
};

/**
 * Generic adapter that turns a WorkerTransport into a ThreeDProvider. Concrete
 * providers (TripoSR, TRELLIS.2, ...) are instances of this with their own meta,
 * capabilities, and cost curve — no ML in this process.
 */
export class WorkerProvider implements ThreeDProvider {
  readonly meta: ProviderMeta;
  private readonly caps: Capability[];
  private readonly transport: WorkerTransport;

  constructor(private readonly config: WorkerProviderConfig) {
    this.meta = config.meta;
    this.caps = config.capabilities;
    this.transport = config.transport;
  }

  capabilities(): Capability[] {
    return [...this.caps];
  }

  healthCheck(): Promise<ProviderHealth> {
    return this.transport.health();
  }

  async estimateCost(input: GenerationInput): Promise<CostEstimate> {
    const q = QUALITY_MULTIPLIER[input.quality] ?? 1;
    const pbr = input.requirePbr ? 1.4 : 1;
    const credits = Math.max(1, Math.ceil(this.config.baseCredits * q * pbr));
    const estimatedSeconds = Math.ceil(this.config.baseSeconds * q);
    return {
      credits,
      estimatedSeconds,
      estimatedGpuUsd: this.config.gpuUsdPerSecond
        ? Number((estimatedSeconds * this.config.gpuUsdPerSecond).toFixed(4))
        : undefined,
    };
  }

  async generate(input: GenerationInput, ctx: JobContext): Promise<JobResult> {
    if (ctx.isCancelled()) {
      throw new VeyraError(ErrorCode.GENERATION_FAILED, 'Job cancelled before start', {
        retryable: false,
      });
    }
    await ctx.reportProgress(2, 'DISPATCH', `Dispatching to ${this.meta.id}`);
    try {
      const res = await this.transport.generate({
        jobId: ctx.jobId,
        images: input.images.map((i) => ({ key: i.key, view: i.view })),
        quality: input.quality,
        requirePbr: input.requirePbr,
        targetPolygons: input.targetPolygons,
        outputFormats: input.outputFormats,
        seed: input.seed,
        params: input.params,
      });
      await ctx.reportProgress(98, 'FINALIZE', 'Worker finished, finalizing');
      return {
        jobId: ctx.jobId,
        providerId: this.meta.id,
        files: res.files.map((f) => ({
          format: f.format as JobResult['files'][number]['format'],
          key: f.key,
          sizeBytes: f.sizeBytes,
          role: f.role,
          channel: f.channel,
        })),
        reportedMetrics: res.metrics,
        seed: res.seed,
        runtimeSeconds: res.runtimeSeconds,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/out of memory|cuda oom|oom/i.test(message)) {
        throw new VeyraError(ErrorCode.GPU_OOM, 'GPU ran out of memory', {
          retryable: true,
          cause: err,
        });
      }
      throw new VeyraError(ErrorCode.GENERATION_FAILED, `Provider ${this.meta.id} failed`, {
        details: { providerId: this.meta.id, reason: message },
        retryable: true,
        cause: err,
      });
    }
  }

  cancel(jobId: string): Promise<void> {
    return this.transport.cancel(jobId);
  }
}
