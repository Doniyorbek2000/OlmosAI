import { describe, expect, it } from 'vitest';
import { AssetOperation, GenerationMode } from '@veyra/types';
import { AgentService } from './agent.service';

describe('AgentService.plan', () => {
  const agent = new AgentService();

  it('turns the milestone-3 request into a structured, game-ready plan', () => {
    const plan = agent.plan('Create a realistic Viking axe, 15k polygons maximum, PBR texture, optimized for Unity.');
    expect(plan.generation.mode).toBe(GenerationMode.GAME_READY);
    expect(plan.geometry.targetPolygons).toBe(15000);
    expect(plan.materials.pbr).toBe(true);
    expect(plan.export.targetEngine).toBe('UNITY');
    // Optimization uses only approved operations.
    const ops = plan.optimization.operations.map((o) => o.op);
    expect(ops).toContain(AssetOperation.DECIMATE);
    // Execution references approved endpoints only (no shell).
    expect(plan.execution.steps[0].endpoint).toContain('/v1/generations/text-to-3d');
    expect(plan.execution.steps.some((s) => s.endpoint.includes('game-ready'))).toBe(true);
  });

  it('produces a simple plan (no optimization) for a plain prompt', () => {
    const plan = agent.plan('a low-poly pine tree');
    expect(plan.optimization.operations).toEqual([]);
    expect(plan.export.targetEngine).toBeNull();
  });
});
