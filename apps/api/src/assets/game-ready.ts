import { AssetOperation, type ProcessOperation, type TargetEngine } from '@veyra/types';

export interface GameReadyOptions {
  targetEngine?: TargetEngine;
  targetPolygons?: number;
  generateLods?: boolean;
  generateCollider?: boolean;
}

export interface ProcessingPlan {
  operations: ProcessOperation[];
  outputFormats: string[];
  lodLevels?: number[];
  generateCollider?: boolean;
  label: string;
}

/**
 * Builds the game-ready processing plan (spec §10): clean geometry → optimize →
 * decimate to budget → LODs → collider → export. The asset-worker applies the
 * ordered ops and emits the extra LOD/collider outputs.
 */
export function buildGameReadyPlan(opts: GameReadyOptions): ProcessingPlan {
  const operations: ProcessOperation[] = [
    { op: AssetOperation.OPTIMIZE },
    { op: AssetOperation.REMOVE_FLOATERS, params: { minFraction: 0.02 } },
    { op: AssetOperation.RECALCULATE_NORMALS },
    { op: AssetOperation.CENTER_MODEL },
    { op: AssetOperation.AUTO_ORIENT },
  ];
  if (opts.targetPolygons && opts.targetPolygons > 0) {
    operations.push({ op: AssetOperation.DECIMATE, params: { targetFaces: opts.targetPolygons } });
  }
  return {
    operations,
    outputFormats: ['GLB'],
    lodLevels: opts.generateLods ? [0.5, 0.25] : undefined,
    generateCollider: opts.generateCollider ?? false,
    label: `game-ready${opts.targetEngine ? `-${opts.targetEngine.toLowerCase()}` : ''}`,
  };
}

/** Simple single-purpose plans for the direct endpoints. */
export function buildOptimizePlan(): ProcessingPlan {
  return {
    operations: [{ op: AssetOperation.OPTIMIZE }, { op: AssetOperation.RECALCULATE_NORMALS }],
    outputFormats: ['GLB'],
    label: 'optimized',
  };
}

export function buildDecimatePlan(targetPolygons: number): ProcessingPlan {
  return {
    operations: [
      { op: AssetOperation.OPTIMIZE },
      { op: AssetOperation.DECIMATE, params: { targetFaces: targetPolygons } },
    ],
    outputFormats: ['GLB'],
    label: `decimated-${targetPolygons}`,
  };
}

export function buildRemeshPlan(): ProcessingPlan {
  return {
    operations: [{ op: AssetOperation.REMESH, params: { mode: 'voxel' } }, { op: AssetOperation.OPTIMIZE }],
    outputFormats: ['GLB'],
    label: 'remeshed',
  };
}

export function buildRetexturePlan(color: string): ProcessingPlan {
  return {
    operations: [{ op: AssetOperation.RECOLOR, params: { color } }],
    outputFormats: ['GLB'],
    label: 'retextured',
  };
}

export function buildConvertPlan(format: string): ProcessingPlan {
  return {
    operations: [{ op: AssetOperation.CONVERT_FORMAT, params: { format } }],
    outputFormats: [format],
    label: `converted-${format.toLowerCase()}`,
  };
}
