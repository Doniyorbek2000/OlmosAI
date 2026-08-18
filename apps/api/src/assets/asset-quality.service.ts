import { Inject, Injectable } from '@nestjs/common';
import { StorageService } from '@veyra/storage';
import type { QualityReport, MeshMetrics } from '@veyra/types';
import { STORAGE } from '../storage/storage.module';

/**
 * Validates generated output before we finalize billing. Corrupt output is
 * never billed (spec §8). Geometry metrics come from the worker (which parsed
 * the actual mesh); we additionally confirm the file really exists in storage.
 */
@Injectable()
export class AssetQualityService {
  constructor(@Inject(STORAGE) private readonly storage: StorageService) {}

  async validate(modelKey: string, reported: Record<string, number>): Promise<QualityReport> {
    const issues: string[] = [];

    const head = await this.storage.headObject(modelKey);
    const fileSizeBytes = head?.size ?? 0;
    if (!head) issues.push('result file missing in storage');
    if (fileSizeBytes <= 0) issues.push('result file is empty');

    const vertexCount = reported.vertexCount ?? 0;
    const faceCount = reported.faceCount ?? 0;
    const triangleCount = reported.triangleCount ?? faceCount;

    if (vertexCount <= 0) issues.push('mesh has no vertices');
    if (faceCount <= 0) issues.push('mesh has no faces');
    if ((reported.hasNaN ?? 0) > 0) issues.push('mesh contains NaN vertices');
    if ((reported.maxDimension ?? 0) <= 0) issues.push('mesh has zero bounding box');
    if ((reported.maxDimension ?? 0) > 10_000) issues.push('mesh has unexpectedly huge geometry');

    // Score: start at 100, subtract for issues + thin geometry.
    let score = 100;
    score -= issues.length * 30;
    if (vertexCount > 0 && vertexCount < 20) score -= 10;
    if (!reported.hasNormals) score -= 5;
    score = Math.max(0, Math.min(100, score));

    const metrics: MeshMetrics = {
      vertexCount,
      faceCount,
      triangleCount,
      materialCount: reported.materialCount ?? 0,
      textureCount: reported.textureCount ?? 0,
      hasUv: Boolean(reported.hasUv),
      hasNormals: Boolean(reported.hasNormals),
      hasNaN: (reported.hasNaN ?? 0) > 0,
      boundingBox: { min: [0, 0, 0], max: [0, 0, 0] },
      maxDimension: reported.maxDimension ?? 0,
      fileSizeBytes,
    };

    return { score, passed: issues.length === 0 && score >= 50, metrics, issues };
  }
}
