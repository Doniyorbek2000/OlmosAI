import type { ProviderHealth } from '@veyra/types';

/**
 * Transport abstraction between a Node adapter and its isolated Python worker.
 * The real implementation is HTTP; tests inject a mock so adapters can be
 * verified without a GPU (spec §47: "Use mocks only for expensive GPU
 * execution in normal CI").
 */
export interface WorkerTransport {
  health(): Promise<ProviderHealth>;
  /** POST a generation request; returns the worker job id/handle. */
  generate(payload: WorkerGeneratePayload): Promise<WorkerGenerateResponse>;
  cancel(workerJobId: string): Promise<void>;
}

export interface WorkerGeneratePayload {
  jobId: string;
  images: { key: string; view?: string }[];
  quality: string;
  requirePbr: boolean;
  targetPolygons?: number;
  outputFormats: string[];
  seed?: number;
  params?: Record<string, unknown>;
  /** Callback URL the worker POSTs progress to. */
  progressCallbackUrl?: string;
}

export interface WorkerGenerateResponse {
  workerJobId: string;
  files: {
    format: string;
    key: string;
    sizeBytes: number;
    role: 'model' | 'texture' | 'metadata' | 'preview';
    channel?: string;
  }[];
  metrics?: Record<string, number>;
  seed?: number;
  runtimeSeconds: number;
}

export interface HttpWorkerTransportOptions {
  baseUrl: string;
  /** Shared secret used to authenticate to the worker (WORKER_SHARED_SECRET). */
  sharedSecret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Production HTTP transport to a worker's FastAPI service. */
export class HttpWorkerTransport implements WorkerTransport {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpWorkerTransportOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 600_000);
    try {
      const res = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.sharedSecret}`,
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`worker ${path} responded ${res.status}: ${body.slice(0, 500)}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  health(): Promise<ProviderHealth> {
    return this.request<ProviderHealth>('/health');
  }

  generate(payload: WorkerGeneratePayload): Promise<WorkerGenerateResponse> {
    return this.request<WorkerGenerateResponse>('/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async cancel(workerJobId: string): Promise<void> {
    await this.request<{ ok: boolean }>('/cancel', {
      method: 'POST',
      body: JSON.stringify({ workerJobId }),
    });
  }
}
