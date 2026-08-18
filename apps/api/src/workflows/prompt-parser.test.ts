import { describe, expect, it } from 'vitest';
import { GenerationMode } from '@veyra/types';
import { parsePrompt } from './prompt-parser';

describe('parsePrompt', () => {
  it('parses the milestone-3 example: Viking axe, 15k polygons, PBR, Unity', () => {
    const p = parsePrompt(
      'Create a realistic Viking axe, 15k polygons maximum, PBR texture, optimized for Unity.',
    );
    expect(p.targetPolygons).toBe(15000);
    expect(p.requirePbr).toBe(true);
    expect(p.targetEngine).toBe('UNITY');
    expect(p.mode).toBe(GenerationMode.GAME_READY);
    expect(p.subject.toLowerCase()).toContain('viking axe');
    // Constraint tokens should be stripped from the concept-image subject.
    expect(p.subject.toLowerCase()).not.toContain('unity');
    expect(p.subject).not.toMatch(/15k|polygon/i);
  });

  it('parses "20,000 triangles" and "unreal"', () => {
    const p = parsePrompt('A stone golem with 20,000 triangles for Unreal');
    expect(p.targetPolygons).toBe(20000);
    expect(p.targetEngine).toBe('UNREAL');
  });

  it('infers QUALITY mode for realistic prompts without a polygon budget', () => {
    const p = parsePrompt('a photorealistic ceramic teapot');
    expect(p.requirePbr).toBe(false);
    expect(p.mode).toBe(GenerationMode.QUALITY);
    expect(p.style).toBe('realistic');
  });

  it('infers FAST mode for low-poly prompts', () => {
    const p = parsePrompt('a low-poly pine tree');
    expect(p.style).toBe('low-poly');
    expect(p.mode).toBe(GenerationMode.FAST);
  });

  it('captures a negative prompt clause', () => {
    const p = parsePrompt('a wooden chair without armrests');
    expect(p.negativePrompt).toContain('armrests');
  });

  it('always produces a non-empty enhanced prompt', () => {
    const p = parsePrompt('sword');
    expect(p.enhancedPrompt.length).toBeGreaterThan('sword'.length);
    expect(p.subject).toBe('sword');
  });
});
