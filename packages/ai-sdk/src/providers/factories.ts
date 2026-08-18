import { Capability, type ProviderMeta } from '@veyra/types';
import type { WorkerTransport } from '../worker-transport.js';
import { WorkerProvider } from './worker-provider.js';

/**
 * Concrete provider factories. Each pins metadata (family, licensing, GPU
 * needs) and a cost curve; the transport injects the worker endpoint. Keeping
 * these declarative means adding a model is a few lines, never a frontend or
 * business-logic change.
 */

export function createTripoSR(transport: WorkerTransport): WorkerProvider {
  const meta: ProviderMeta = {
    id: 'triposr',
    displayName: 'TripoSR',
    family: 'TripoSR',
    modelVersion: 'triposr-1.0',
    codeLicense: 'MIT (verify)',
    weightsLicense: 'MIT (verify)',
    commercialUse: 'review_required',
    recommendedGpu: 'RTX 3090 / A10',
    minVramMb: 6144,
  };
  return new WorkerProvider({
    meta,
    capabilities: [Capability.IMAGE_TO_3D, Capability.FAST_GENERATION, Capability.MESH],
    transport,
    baseCredits: 1,
    baseSeconds: 4,
    gpuUsdPerSecond: 0.0004,
  });
}

export function createTrellis2(transport: WorkerTransport): WorkerProvider {
  const meta: ProviderMeta = {
    id: 'trellis2',
    displayName: 'TRELLIS.2',
    family: 'TRELLIS',
    modelVersion: 'trellis.2',
    codeLicense: 'MIT (verify)',
    weightsLicense: 'review_required',
    commercialUse: 'review_required',
    recommendedGpu: 'A100 / L40S',
    minVramMb: 16384,
  };
  return new WorkerProvider({
    meta,
    capabilities: [
      Capability.IMAGE_TO_3D,
      Capability.PBR_3D,
      Capability.PBR_TEXTURE,
      Capability.HIGH_QUALITY,
      Capability.MESH,
      Capability.UV,
    ],
    transport,
    baseCredits: 6,
    baseSeconds: 45,
    gpuUsdPerSecond: 0.0006,
  });
}

export function createTripoSG(transport: WorkerTransport): WorkerProvider {
  const meta: ProviderMeta = {
    id: 'triposg',
    displayName: 'TripoSG',
    family: 'TripoSG',
    modelVersion: 'triposg-1.0',
    codeLicense: 'review_required',
    weightsLicense: 'review_required',
    commercialUse: 'review_required',
    recommendedGpu: 'A10 / L4',
    minVramMb: 10240,
  };
  return new WorkerProvider({
    meta,
    capabilities: [
      Capability.IMAGE_TO_3D,
      Capability.SHAPE_GENERATION,
      Capability.HIGH_DETAIL,
      Capability.MESH,
    ],
    transport,
    baseCredits: 4,
    baseSeconds: 25,
    gpuUsdPerSecond: 0.0005,
  });
}

export function createSf3d(transport: WorkerTransport): WorkerProvider {
  const meta: ProviderMeta = {
    id: 'sf3d',
    displayName: 'Stable Fast 3D',
    family: 'StableFast3D',
    modelVersion: 'sf3d-1.0',
    codeLicense: 'review_required',
    weightsLicense: 'Stability Community (restricted)',
    commercialUse: 'restricted',
    recommendedGpu: 'RTX 4090 / L4',
    minVramMb: 7168,
  };
  return new WorkerProvider({
    meta,
    capabilities: [
      Capability.IMAGE_TO_3D,
      Capability.FAST_GENERATION,
      Capability.UV,
      Capability.MESH,
    ],
    transport,
    baseCredits: 2,
    baseSeconds: 3,
    gpuUsdPerSecond: 0.0005,
  });
}
