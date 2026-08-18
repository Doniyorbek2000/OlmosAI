import { Injectable } from '@nestjs/common';
import { ErrorCode, VeyraError } from '@veyra/types';
import { AppConfigService } from '../config/config.service';

export interface WorldRequest {
  jobId: string;
  prompt: string;
  seed?: number;
  size?: number;
}

export interface WorldObjectSpec {
  type: string; // TERRAIN | MESH | LIGHT | CAMERA | ENVIRONMENT
  name: string;
  transform?: Record<string, unknown>;
  data?: Record<string, unknown>;
  assetKey?: string;
}

export interface WorldResponse {
  workerJobId: string;
  glb: { key: string; sizeBytes: number };
  preview?: { key: string };
  environment: Record<string, unknown>;
  objects: WorldObjectSpec[];
  metadata: Record<string, unknown>;
  seed: number;
  runtimeSeconds: number;
}

/** HTTP transport to the ISOLATED HY-World worker (never shares the mesh path). */
@Injectable()
export class WorldWorkerClient {
  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.env.HYWORLD_WORKER_URL);
  }

  async generate(req: WorldRequest): Promise<WorldResponse> {
    const baseUrl = this.config.env.HYWORLD_WORKER_URL;
    if (!baseUrl) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'World worker is not configured');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600_000);
    try {
      const res = await fetch(`${baseUrl}/generate`, {
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
        throw new VeyraError(ErrorCode.GENERATION_FAILED, `World worker ${res.status}: ${body.slice(0, 300)}`, {
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as WorldResponse;
    } catch (err) {
      if (err instanceof VeyraError) throw err;
      throw new VeyraError(ErrorCode.GENERATION_FAILED, 'World worker request failed', {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
