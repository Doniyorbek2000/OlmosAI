import { describe, expect, it } from 'vitest';
import { AssetOperation } from '@veyra/types';
import { buildConvertPlan, buildDecimatePlan, buildGameReadyPlan } from './game-ready';

describe('buildGameReadyPlan', () => {
  it('cleans, orients, and decimates to the polygon budget', () => {
    const plan = buildGameReadyPlan({ targetEngine: 'UNITY', targetPolygons: 15000, generateLods: true, generateCollider: true });
    const ops = plan.operations.map((o) => o.op);
    expect(ops).toContain(AssetOperation.OPTIMIZE);
    expect(ops).toContain(AssetOperation.REMOVE_FLOATERS);
    expect(ops).toContain(AssetOperation.AUTO_ORIENT);
    const decimate = plan.operations.find((o) => o.op === AssetOperation.DECIMATE);
    expect(decimate?.params).toEqual({ targetFaces: 15000 });
    expect(plan.lodLevels).toEqual([0.5, 0.25]);
    expect(plan.generateCollider).toBe(true);
    expect(plan.label).toContain('unity');
  });

  it('omits decimation when no polygon budget is given', () => {
    const plan = buildGameReadyPlan({ targetEngine: 'WEB' });
    expect(plan.operations.some((o) => o.op === AssetOperation.DECIMATE)).toBe(false);
    expect(plan.lodLevels).toBeUndefined();
  });
});

describe('single-purpose plans', () => {
  it('decimate plan targets the requested face count', () => {
    const plan = buildDecimatePlan(5000);
    const dec = plan.operations.find((o) => o.op === AssetOperation.DECIMATE);
    expect(dec?.params).toEqual({ targetFaces: 5000 });
  });

  it('convert plan sets the output format', () => {
    const plan = buildConvertPlan('OBJ');
    expect(plan.outputFormats).toEqual(['OBJ']);
    expect(plan.operations[0].op).toBe(AssetOperation.CONVERT_FORMAT);
  });
});
