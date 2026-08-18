import { describe, expect, it, vi } from 'vitest';
import {
  ErrorCode,
  QualityTier,
  VeyraError,
  type GenerationInput,
  type JobContext,
  type JobResult,
  type ThreeDProvider,
} from '@veyra/types';
import { ProviderRegistry } from './registry.js';
import { executeWithFallback } from './executor.js';

function provider(id: string, gen: ThreeDProvider['generate']): ThreeDProvider {
  return {
    meta: {
      id,
      displayName: id,
      family: id,
      modelVersion: '1',
      codeLicense: 'MIT',
      weightsLicense: 'MIT',
      commercialUse: 'yes',
    },
    capabilities: () => ['IMAGE_TO_3D'],
    healthCheck: async () => ({ status: 'HEALTHY', checkedAt: '' }),
    estimateCost: async () => ({ credits: 1, estimatedSeconds: 1 }),
    generate: gen,
    cancel: async () => {},
  };
}

const input: GenerationInput = {
  kind: 'image',
  images: [{ key: 'x' }],
  quality: QualityTier.STANDARD,
  requirePbr: false,
  outputFormats: ['GLB'],
};

function ctx(): JobContext {
  const controller = new AbortController();
  return {
    jobId: 'job1',
    reportProgress: async () => {},
    isCancelled: () => false,
    signal: controller.signal,
  };
}

function result(id: string): JobResult {
  return { jobId: 'job1', providerId: id, files: [], runtimeSeconds: 1 };
}

describe('executeWithFallback', () => {
  it('falls back to the next provider on a retryable failure', async () => {
    const registry = new ProviderRegistry();
    const failing = provider('a', async () => {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'down', { retryable: true });
    });
    const working = provider('b', async () => result('b'));
    registry.register({ provider: failing, enabled: true, priority: 100, costMultiplier: 1 });
    registry.register({ provider: working, enabled: true, priority: 50, costMultiplier: 1 });

    const decision = { chain: [failing, working], trace: [] };
    const res = await executeWithFallback(registry, decision, input, ctx());
    expect(res.providerId).toBe('b');
  });

  it('does NOT fall back on a non-retryable error', async () => {
    const registry = new ProviderRegistry();
    const bad = provider('a', async () => {
      throw new VeyraError(ErrorCode.INVALID_INPUT, 'bad input', { retryable: false });
    });
    const secondGen = vi.fn(async () => result('b'));
    const working = provider('b', secondGen);
    registry.register({ provider: bad, enabled: true, priority: 100, costMultiplier: 1 });
    registry.register({ provider: working, enabled: true, priority: 50, costMultiplier: 1 });

    await expect(
      executeWithFallback(registry, { chain: [bad, working], trace: [] }, input, ctx()),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    expect(secondGen).not.toHaveBeenCalled();
  });

  it('throws GENERATION_FAILED when every provider fails', async () => {
    const registry = new ProviderRegistry();
    const a = provider('a', async () => {
      throw new VeyraError(ErrorCode.GPU_OOM, 'oom', { retryable: true });
    });
    registry.register({ provider: a, enabled: true, priority: 100, costMultiplier: 1 });
    await expect(
      executeWithFallback(registry, { chain: [a], trace: [] }, input, ctx()),
    ).rejects.toMatchObject({ code: ErrorCode.GENERATION_FAILED });
  });
});
