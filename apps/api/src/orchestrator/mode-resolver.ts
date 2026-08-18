import { Capability, GenerationMode, QualityTier, type RoutingPreference } from '@veyra/types';

export interface ResolvedMode {
  required: Capability[];
  preference: RoutingPreference;
}

/**
 * Capability Resolver: turns a user-facing generation mode into the required
 * capabilities + routing preference. Kept declarative so new modes are config,
 * not branching business logic.
 */
export function resolveMode(
  mode: GenerationMode,
  opts: { requirePbr?: boolean; targetPolygons?: number } = {},
): ResolvedMode {
  const base = (
    quality: QualityTier,
    speedWeight: number,
    costWeight: number,
    required: Capability[],
    requirePbr = false,
  ): ResolvedMode => ({
    required,
    preference: {
      quality,
      speedWeight,
      costWeight,
      requirePbr: opts.requirePbr ?? requirePbr,
      targetPolygons: opts.targetPolygons,
    },
  });

  switch (mode) {
    case GenerationMode.FAST:
      return base(QualityTier.DRAFT, 0.9, 0.7, [Capability.IMAGE_TO_3D, Capability.FAST_GENERATION]);
    case GenerationMode.BALANCED:
      return base(QualityTier.STANDARD, 0.5, 0.5, [Capability.IMAGE_TO_3D]);
    case GenerationMode.QUALITY:
      return base(QualityTier.HIGH, 0.2, 0.3, [Capability.IMAGE_TO_3D, Capability.HIGH_QUALITY]);
    case GenerationMode.ULTRA:
      return base(QualityTier.ULTRA, 0.1, 0.1, [Capability.IMAGE_TO_3D, Capability.HIGH_QUALITY], true);
    case GenerationMode.GAME_READY:
    case GenerationMode.MOBILE_GAME:
      return base(QualityTier.HIGH, 0.4, 0.5, [Capability.IMAGE_TO_3D, Capability.MESH]);
    case GenerationMode.PRODUCT_VISUALIZATION:
      return base(QualityTier.HIGH, 0.2, 0.3, [Capability.IMAGE_TO_3D, Capability.HIGH_QUALITY], true);
    case GenerationMode.CHARACTER:
      return base(QualityTier.HIGH, 0.3, 0.3, [Capability.IMAGE_TO_3D]);
    case GenerationMode.THREE_D_PRINT:
      return base(QualityTier.HIGH, 0.3, 0.4, [Capability.IMAGE_TO_3D, Capability.MESH]);
    default:
      return base(QualityTier.STANDARD, 0.5, 0.5, [Capability.IMAGE_TO_3D]);
  }
}
