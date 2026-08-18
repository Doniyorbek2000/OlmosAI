/** Supported input and 3D file formats. */
export const ImageFormat = { PNG: 'PNG', JPEG: 'JPEG', WEBP: 'WEBP' } as const;
export type ImageFormat = (typeof ImageFormat)[keyof typeof ImageFormat];

export const ModelFormat = {
  GLB: 'GLB',
  GLTF: 'GLTF',
  OBJ: 'OBJ',
  FBX: 'FBX',
  STL: 'STL',
  USDZ: 'USDZ',
} as const;
export type ModelFormat = (typeof ModelFormat)[keyof typeof ModelFormat];

export const ProjectType = {
  OBJECT: 'OBJECT',
  CHARACTER: 'CHARACTER',
  GAME_ASSET: 'GAME_ASSET',
  PRODUCT: 'PRODUCT',
  WORLD: 'WORLD',
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

/** PBR material channels supported by the editor + pipeline. */
export const MaterialChannel = {
  baseColor: 'baseColor',
  normal: 'normal',
  roughness: 'roughness',
  metallic: 'metallic',
  ambientOcclusion: 'ambientOcclusion',
  emissive: 'emissive',
  opacity: 'opacity',
} as const;
export type MaterialChannel = (typeof MaterialChannel)[keyof typeof MaterialChannel];

/** Objective geometry metrics measured by the quality service. */
export interface MeshMetrics {
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
  materialCount: number;
  textureCount: number;
  hasUv: boolean;
  hasNormals: boolean;
  hasNaN: boolean;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  /** Largest dimension in scene units. */
  maxDimension: number;
  fileSizeBytes: number;
}

/** Result of AssetQualityService. Corrupt output must not be billed. */
export interface QualityReport {
  /** 0..100. */
  score: number;
  passed: boolean;
  metrics: MeshMetrics;
  issues: string[];
}
