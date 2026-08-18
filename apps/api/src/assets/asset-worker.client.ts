import { Injectable } from '@nestjs/common';
import { ErrorCode, VeyraError, type ProcessOperation } from '@veyra/types';
import { AppConfigService } from '../config/config.service';

export interface ProcessRequest {
  jobId: string;
  sourceKey: string;
  operations: ProcessOperation[];
  outputFormats: string[];
  lodLevels?: number[];
  generateCollider?: boolean;
}

export interface ProcessedFile {
  format: string;
  key: string;
  sizeBytes: number;
  role: 'model' | 'texture' | 'metadata' | 'preview';
  channel?: string;
}

export interface ProcessResponse {
  workerJobId: string;
  files: ProcessedFile[];
  metrics: Record<string, number>;
  runtimeSeconds: number;
}

/** HTTP transport to the Python asset-worker (spec §9: never Blender in the API). */
@Injectable()
export class AssetWorkerClient {
  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.env.ASSET_WORKER_URL);
  }

  async process(req: ProcessRequest): Promise<ProcessResponse> {
    const baseUrl = this.config.env.ASSET_WORKER_URL;
    if (!baseUrl) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'Asset-worker is not configured');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);
    try {
      const res = await fetch(`${baseUrl}/process`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.env.WORKER_SHARED_SECRET}`,
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new VeyraError(
          ErrorCode.ASSET_PROCESSING_FAILED,
          `Asset-worker responded ${res.status}: ${body.slice(0, 300)}`,
          { retryable: res.status >= 500 },
        );
      }
      return (await res.json()) as ProcessResponse;
    } catch (err) {
      if (err instanceof VeyraError) throw err;
      throw new VeyraError(ErrorCode.ASSET_PROCESSING_FAILED, 'Asset-worker request failed', {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
