import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { StorageService, buildUploadKey } from '@veyra/storage';
import { STORAGE } from '../storage/storage.module';
import { AppConfigService } from '../config/config.service';
import { encodePng } from './png';

export interface ConceptImage {
  key: string;
  width: number;
  height: number;
  provider: string;
}

/**
 * Turns a prompt into a concept image stored in object storage. If a real
 * text-to-image worker is configured (CONCEPT_IMAGE_WORKER_URL), it is used;
 * otherwise a deterministic procedural image is rendered in-process so the
 * Text-to-3D workflow runs end-to-end without a GPU (dev/CI). Either way the
 * output is a real PNG the image-to-3D stage consumes.
 */
@Injectable()
export class ConceptImageService {
  constructor(
    @Inject(STORAGE) private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  async generate(userId: string, prompt: string, seed?: number): Promise<ConceptImage> {
    const workerUrl = process.env.CONCEPT_IMAGE_WORKER_URL;
    if (workerUrl) {
      return this.viaWorker(userId, prompt, workerUrl, seed);
    }
    return this.procedural(userId, prompt, seed);
  }

  /** Real path: delegate to a text-to-image worker that uploads the PNG. */
  private async viaWorker(
    userId: string,
    prompt: string,
    workerUrl: string,
    seed?: number,
  ): Promise<ConceptImage> {
    const res = await fetch(`${workerUrl}/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.env.WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify({ userId, prompt, seed, width: 768, height: 768 }),
    });
    if (!res.ok) {
      throw new Error(`concept-image worker responded ${res.status}`);
    }
    const data = (await res.json()) as { key: string; width: number; height: number };
    return { key: data.key, width: data.width, height: data.height, provider: 'concept-worker' };
  }

  /** Deterministic in-process renderer (dev/CI fallback). */
  private async procedural(userId: string, prompt: string, seed?: number): Promise<ConceptImage> {
    const size = 512;
    const png = renderConceptPng(prompt, seed, size);
    const key = buildUploadKey(userId, `concept-${randomUUID()}`, 'concept.png');
    await this.storage.putObject(key, png, 'image/png');
    return { key, width: size, height: size, provider: 'procedural' };
  }
}

/** Render a deterministic radial-blob concept image seeded by the prompt. */
export function renderConceptPng(prompt: string, seed: number | undefined, size: number): Buffer {
  const digest = createHash('sha256').update(`${prompt}:${seed ?? ''}`).digest();
  const hue = digest[0] / 255;
  const [r1, g1, b1] = hslToRgb(hue, 0.55, 0.55);
  const [r2, g2, b2] = hslToRgb((hue + 0.5) % 1, 0.4, 0.12);
  const cx = size / 2 + (digest[1] - 128) / 12;
  const cy = size / 2 + (digest[2] - 128) / 12;
  const radius = size * (0.28 + (digest[3] / 255) * 0.12);
  const lobes = 3 + (digest[4] % 4);

  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const wobble = 1 + 0.15 * Math.sin(angle * lobes + digest[5]);
      const edge = radius * wobble;
      const inside = dist < edge;
      const t = Math.min(1, dist / (size / 2)); // background gradient
      const i = (y * size + x) * 4;
      if (inside) {
        const shade = 1 - dist / edge; // simple center highlight
        rgba[i] = clamp(r1 * (0.6 + 0.5 * shade));
        rgba[i + 1] = clamp(g1 * (0.6 + 0.5 * shade));
        rgba[i + 2] = clamp(b1 * (0.6 + 0.5 * shade));
        rgba[i + 3] = 255;
      } else {
        rgba[i] = clamp(r2 * (1 - t) + 8);
        rgba[i + 1] = clamp(g2 * (1 - t) + 8);
        rgba[i + 2] = clamp(b2 * (1 - t) + 12);
        rgba[i + 3] = 255;
      }
    }
  }
  return encodePng(size, size, rgba);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
