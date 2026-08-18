import { describe, expect, it, beforeEach } from 'vitest';
import {
  Capability,
  ProviderHealthStatus,
  QualityTier,
  type GenerationInput,
  type ProviderHealth,
  type RoutingPreference,
  type ThreeDProvider,
} from '@veyra/types';
import { ProviderRegistry } from './registry.js';
import { ModelRouter } from './router.js';

function fakeProvider(id: string, caps: Capability[]): ThreeDProvider {
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
    capabilities: () => caps,
    healthCheck: async (): Promise<ProviderHealth> => ({
      status: ProviderHealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }),
    estimateCost: async () => ({ credits: 1, estimatedSeconds: 1 }),
    generate: async () => {
      throw new Error('not used');
    },
    cancel: async () => {},
  };
}

const input: GenerationInput = {
  kind: 'image',
  images: [{ key: 'x' }],
  quality: QualityTier.HIGH,
  requirePbr: false,
  outputFormats: ['GLB'],
};

describe('ModelRouter', () => {
  let registry: ProviderRegistry;
  let router: ModelRouter;

  beforeEach(() => {
    registry = new ProviderRegistry();
    router = new ModelRouter(registry);
  });

  it('prefers HIGH_QUALITY providers when quality is requested', async () => {
    registry.register({
      provider: fakeProvider('fast', [Capability.IMAGE_TO_3D, Capability.FAST_GENERATION]),
      enabled: true,
      priority: 60,
      costMultiplier: 1,
    });
    registry.register({
      provider: fakeProvider('hq', [Capability.IMAGE_TO_3D, Capability.HIGH_QUALITY]),
      enabled: true,
      priority: 50,
      costMultiplier: 1,
    });
    await registry.refreshHealth('fast');
    await registry.refreshHealth('hq');

    const pref: RoutingPreference = {
      quality: QualityTier.ULTRA,
      speedWeight: 0.1,
      costWeight: 0.1,
      requirePbr: false,
    };
    const decision = router.route({ required: [Capability.IMAGE_TO_3D], preference: pref, input });
    expect(decision.chain[0].meta.id).toBe('hq');
    // Fallback chain still includes the fast provider.
    expect(decision.chain.map((p) => p.meta.id)).toContain('fast');
  });

  it('excludes providers lacking a required capability', () => {
    registry.register({
      provider: fakeProvider('noimg', [Capability.TEXT_TO_MOTION]),
      enabled: true,
      priority: 100,
      costMultiplier: 1,
    });
    expect(() =>
      router.route({
        required: [Capability.IMAGE_TO_3D],
        preference: { quality: QualityTier.STANDARD, speedWeight: 0.5, costWeight: 0.5, requirePbr: false },
        input,
      }),
    ).toThrow();
  });

  it('skips disabled and draining providers', () => {
    registry.register({
      provider: fakeProvider('a', [Capability.IMAGE_TO_3D]),
      enabled: false,
      priority: 100,
      costMultiplier: 1,
    });
    registry.register({
      provider: fakeProvider('b', [Capability.IMAGE_TO_3D]),
      enabled: true,
      priority: 10,
      costMultiplier: 1,
      draining: true,
    });
    registry.register({
      provider: fakeProvider('c', [Capability.IMAGE_TO_3D]),
      enabled: true,
      priority: 5,
      costMultiplier: 1,
    });
    const decision = router.route({
      required: [Capability.IMAGE_TO_3D],
      preference: { quality: QualityTier.STANDARD, speedWeight: 0.5, costWeight: 0.5, requirePbr: false },
      input,
    });
    expect(decision.chain.map((p) => p.meta.id)).toEqual(['c']);
  });
});
