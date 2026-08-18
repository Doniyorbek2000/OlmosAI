/**
 * Mesh post-processing operations. Shared between the API orchestration layer
 * and the Python asset-worker so both agree on op names and params. Heavy
 * geometry work runs in the asset-worker (trimesh/Blender), never in the API.
 */
export const AssetOperation = {
  AUTO_ORIENT: 'AUTO_ORIENT',
  CENTER_MODEL: 'CENTER_MODEL',
  NORMALIZE_SCALE: 'NORMALIZE_SCALE',
  REMOVE_FLOATERS: 'REMOVE_FLOATERS',
  RECALCULATE_NORMALS: 'RECALCULATE_NORMALS',
  SMOOTH: 'SMOOTH',
  DECIMATE: 'DECIMATE',
  REMESH: 'REMESH',
  OPTIMIZE: 'OPTIMIZE',
  GENERATE_UV: 'GENERATE_UV',
  BAKE_TEXTURE: 'BAKE_TEXTURE',
  GENERATE_LOD: 'GENERATE_LOD',
  GENERATE_COLLIDER: 'GENERATE_COLLIDER',
  CONVERT_FORMAT: 'CONVERT_FORMAT',
} as const;

export type AssetOperation = (typeof AssetOperation)[keyof typeof AssetOperation];

export interface ProcessOperation {
  op: AssetOperation;
  params?: Record<string, unknown>;
}

/** Target engines for the game-ready pipeline. */
export const TargetEngine = {
  UNITY: 'UNITY',
  UNREAL: 'UNREAL',
  GODOT: 'GODOT',
  WEB: 'WEB',
  MOBILE: 'MOBILE',
} as const;
export type TargetEngine = (typeof TargetEngine)[keyof typeof TargetEngine];

/** Default output format per target engine for game-ready export. */
export const ENGINE_DEFAULT_FORMAT: Record<TargetEngine, 'GLB' | 'FBX' | 'GLTF'> = {
  UNITY: 'GLB',
  UNREAL: 'GLB',
  GODOT: 'GLB',
  WEB: 'GLB',
  MOBILE: 'GLB',
};
