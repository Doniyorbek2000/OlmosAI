import type { Capability, QualityTier } from './capabilities.js';
import type { ModelFormat } from './assets.js';

/** Health of a provider/worker, used for routing + circuit breaking. */
export const ProviderHealthStatus = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNHEALTHY: 'UNHEALTHY',
} as const;
export type ProviderHealthStatus =
  (typeof ProviderHealthStatus)[keyof typeof ProviderHealthStatus];

export interface ProviderHealth {
  status: ProviderHealthStatus;
  /** Free VRAM in MB across the provider's workers, if known. */
  freeVramMb?: number;
  /** Number of jobs currently queued/running for this provider. */
  queueDepth?: number;
  latencyMs?: number;
  message?: string;
  checkedAt: string;
}

/** Immutable metadata about a provider integration for auditability. */
export interface ProviderMeta {
  id: string;
  displayName: string;
  /** e.g. "TRELLIS", "TripoSR". */
  family: string;
  /** Exact model/checkpoint version deployed. */
  modelVersion: string;
  /** Pinned upstream commit SHA the worker was built from. */
  upstreamCommit?: string;
  codeLicense: string;
  weightsLicense: string;
  commercialUse: 'yes' | 'no' | 'restricted' | 'review_required';
  recommendedGpu?: string;
  minVramMb?: number;
}

/** Reference to an input image already stored in object storage. */
export interface ImageRef {
  /** Object storage key. */
  key: string;
  /** Optional view label for multi-image (front/back/left/right/...). */
  view?: string;
  width?: number;
  height?: number;
}

/** Normalised input passed to any provider's generate(). */
export interface GenerationInput {
  kind: 'image' | 'multi-image' | 'shape-from-latent';
  images: ImageRef[];
  quality: QualityTier;
  requirePbr: boolean;
  targetPolygons?: number;
  outputFormats: ModelFormat[];
  /** Deterministic seed when supported. */
  seed?: number;
  /** Provider-specific tuning, validated by the adapter. */
  params?: Record<string, unknown>;
}

export interface CostEstimate {
  /** Internal credits this generation will cost. */
  credits: number;
  /** Estimated wall-clock seconds. */
  estimatedSeconds: number;
  /** Estimated raw GPU cost in USD (for margin tracking). */
  estimatedGpuUsd?: number;
}

/** A single output file produced by a generation. */
export interface OutputFile {
  format: ModelFormat | 'PNG' | 'JSON';
  /** Object storage key where the worker uploaded the file. */
  key: string;
  sizeBytes: number;
  role: 'model' | 'texture' | 'metadata' | 'preview';
  channel?: string;
}

export interface JobResult {
  jobId: string;
  providerId: string;
  files: OutputFile[];
  /** Raw metrics reported by the worker (validated separately). */
  reportedMetrics?: Record<string, number>;
  seed?: number;
  /** Actual runtime seconds, for cost finalisation. */
  runtimeSeconds: number;
}

/** Context handed to a provider so it can report progress + check cancellation. */
export interface JobContext {
  jobId: string;
  /** Report real stage progress (0..100). */
  reportProgress(progress: number, stage?: string, message?: string): Promise<void>;
  /** True if the job was cancelled and the provider should abort. */
  isCancelled(): boolean;
  signal: AbortSignal;
}

/**
 * The single interface every AI 3D model is adapted to. Adapters are thin
 * transports to an isolated worker; no ML runs in this Node process.
 */
export interface ThreeDProvider {
  readonly meta: ProviderMeta;
  capabilities(): Capability[];
  healthCheck(): Promise<ProviderHealth>;
  estimateCost(input: GenerationInput): Promise<CostEstimate>;
  generate(input: GenerationInput, ctx: JobContext): Promise<JobResult>;
  cancel(jobId: string): Promise<void>;
}
