/**
 * Capabilities describe *what a provider can do*, independent of which model
 * implements it. The router matches a request's required capabilities against
 * providers that advertise them.
 */
export const Capability = {
  IMAGE_TO_3D: 'IMAGE_TO_3D',
  MULTI_IMAGE_TO_3D: 'MULTI_IMAGE_TO_3D',
  TEXT_TO_3D: 'TEXT_TO_3D',
  SHAPE_GENERATION: 'SHAPE_GENERATION',
  TEXTURE_GENERATION: 'TEXTURE_GENERATION',
  PBR_TEXTURE: 'PBR_TEXTURE',
  PBR_3D: 'PBR_3D',
  HIGH_QUALITY: 'HIGH_QUALITY',
  HIGH_DETAIL: 'HIGH_DETAIL',
  FAST_GENERATION: 'FAST_GENERATION',
  UV: 'UV',
  MESH: 'MESH',
  RETEXTURE: 'RETEXTURE',
  REMESH: 'REMESH',
  LOD: 'LOD',
  TEXT_TO_MOTION: 'TEXT_TO_MOTION',
  CHARACTER_ANIMATION: 'CHARACTER_ANIMATION',
  WORLD_GENERATION: 'WORLD_GENERATION',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

/**
 * Generation modes are user-facing presets that resolve to a set of required
 * capabilities + routing preferences.
 */
export const GenerationMode = {
  FAST: 'FAST',
  BALANCED: 'BALANCED',
  QUALITY: 'QUALITY',
  ULTRA: 'ULTRA',
  GAME_READY: 'GAME_READY',
  MOBILE_GAME: 'MOBILE_GAME',
  THREE_D_PRINT: '3D_PRINT',
  CHARACTER: 'CHARACTER',
  PRODUCT_VISUALIZATION: 'PRODUCT_VISUALIZATION',
} as const;

export type GenerationMode = (typeof GenerationMode)[keyof typeof GenerationMode];

export const QualityTier = {
  DRAFT: 'DRAFT',
  STANDARD: 'STANDARD',
  HIGH: 'HIGH',
  ULTRA: 'ULTRA',
} as const;

export type QualityTier = (typeof QualityTier)[keyof typeof QualityTier];

/** Optimisation objective the router balances. */
export interface RoutingPreference {
  quality: QualityTier;
  /** 0..1 — how much to weight low latency. */
  speedWeight: number;
  /** 0..1 — how much to weight low cost. */
  costWeight: number;
  requirePbr: boolean;
  /** Target polygon budget for the final asset, if any. */
  targetPolygons?: number;
}
