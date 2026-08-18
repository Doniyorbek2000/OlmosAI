/**
 * Server-controlled feature flags. Env provides bootstrap defaults; the DB
 * SystemSetting table can override at runtime without redeploying the frontend.
 */
export const FeatureFlag = {
  TEXT_TO_3D: 'TEXT_TO_3D',
  IMAGE_TO_3D: 'IMAGE_TO_3D',
  MULTI_IMAGE: 'MULTI_IMAGE',
  RETEXTURE: 'RETEXTURE',
  RIGGING: 'RIGGING',
  MOTION: 'MOTION',
  WORLD_GENERATION: 'WORLD_GENERATION',
  PUBLIC_GALLERY: 'PUBLIC_GALLERY',
  DEVELOPER_API: 'DEVELOPER_API',
} as const;
export type FeatureFlag = (typeof FeatureFlag)[keyof typeof FeatureFlag];

export type FeatureFlagState = Record<FeatureFlag, boolean>;

export function featureFlagsFromEnv(env: NodeJS.ProcessEnv = process.env): FeatureFlagState {
  const on = (v: string | undefined, def = false) =>
    v === undefined ? def : v === 'true' || v === '1';
  return {
    TEXT_TO_3D: on(env.FEATURE_TEXT_TO_3D, true),
    IMAGE_TO_3D: on(env.FEATURE_IMAGE_TO_3D, true),
    MULTI_IMAGE: on(env.FEATURE_MULTI_IMAGE),
    RETEXTURE: on(env.FEATURE_RETEXTURE),
    RIGGING: on(env.FEATURE_RIGGING),
    MOTION: on(env.FEATURE_MOTION),
    WORLD_GENERATION: on(env.FEATURE_WORLD_GENERATION),
    PUBLIC_GALLERY: on(env.FEATURE_PUBLIC_GALLERY, true),
    DEVELOPER_API: on(env.FEATURE_DEVELOPER_API, true),
  };
}
