import { describe, expect, it } from 'vitest';
import { Capability, GenerationMode, QualityTier } from '@veyra/types';
import { resolveMode } from './mode-resolver';

describe('resolveMode', () => {
  it('maps FAST to draft quality + fast-generation capability with high speed weight', () => {
    const r = resolveMode(GenerationMode.FAST);
    expect(r.preference.quality).toBe(QualityTier.DRAFT);
    expect(r.required).toContain(Capability.FAST_GENERATION);
    expect(r.preference.speedWeight).toBeGreaterThan(0.7);
  });

  it('maps ULTRA to ultra quality and forces PBR', () => {
    const r = resolveMode(GenerationMode.ULTRA);
    expect(r.preference.quality).toBe(QualityTier.ULTRA);
    expect(r.preference.requirePbr).toBe(true);
    expect(r.required).toContain(Capability.HIGH_QUALITY);
  });

  it('honors explicit requirePbr + targetPolygons overrides', () => {
    const r = resolveMode(GenerationMode.BALANCED, { requirePbr: true, targetPolygons: 15000 });
    expect(r.preference.requirePbr).toBe(true);
    expect(r.preference.targetPolygons).toBe(15000);
  });
});
