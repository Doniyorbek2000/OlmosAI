import { Injectable } from '@nestjs/common';
import { ErrorCode, VeyraError } from '@veyra/types';
import { AppConfigService } from '../config/config.service';

export interface MotionRequest {
  jobId: string;
  prompt: string;
  durationSeconds: number;
  fps: number;
  seed?: number;
}

export interface MotionFile {
  format: string;
  key: string;
  sizeBytes: number;
  role: string;
  channel?: string;
}

export interface MotionResponse {
  workerJobId: string;
  files: MotionFile[];
  skeleton: Record<string, unknown>;
  durationSeconds: number;
  fps: number;
  frameCount: number;
  seed: number;
  runtimeSeconds: number;
}

/** HTTP transport to the isolated HY-Motion worker. */
@Injectable()
export class MotionWorkerClient {
  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.env.HYMOTION_WORKER_URL);
  }

  async generate(req: MotionRequest): Promise<MotionResponse> {
    const baseUrl = this.config.env.HYMOTION_WORKER_URL;
    if (!baseUrl) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'Motion worker is not configured');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);
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
        throw new VeyraError(ErrorCode.GENERATION_FAILED, `Motion worker ${res.status}: ${body.slice(0, 300)}`, {
          retryable: res.status >= 500,
        });
      }
      return (await res.json()) as MotionResponse;
    } catch (err) {
      if (err instanceof VeyraError) throw err;
      throw new VeyraError(ErrorCode.GENERATION_FAILED, 'Motion worker request failed', {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
