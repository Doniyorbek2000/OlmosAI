# asset-worker

CPU mesh post-processing (trimesh). Runs the operations behind
`/v1/assets/:id/*` and the game-ready pipeline (spec §9–§10). Kept out of the
main API. Reuses the shared `veyra_worker` framework for S3 I/O + GLB metrics.

## Operations

`AUTO_ORIENT`, `CENTER_MODEL`, `NORMALIZE_SCALE`, `REMOVE_FLOATERS`,
`RECALCULATE_NORMALS`, `SMOOTH`, `DECIMATE`, `REMESH` (voxel/subdivide),
`OPTIMIZE`, `GENERATE_UV` (best-effort via xatlas), `GENERATE_LOD`,
`GENERATE_COLLIDER` (convex hull), `CONVERT_FORMAT` (GLB/GLTF/OBJ/STL/PLY).

`BAKE_TEXTURE` and FBX export need a Blender step (documented, not silently
substituted) — add a Blender GPU/CPU profile to enable them.

## Endpoints

- `GET /health`
- `POST /process` (Bearer `WORKER_SHARED_SECRET`) — `{jobId, sourceKey,
  operations[], outputFormats[], lodLevels?, generateCollider?}` →
  `{files[], metrics, runtimeSeconds}`
- `GET /metrics`

## Run

```bash
docker build -f services/asset-worker/Dockerfile -t veyra/asset-worker:cpu .
docker run -p 8010:8010 --env-file .env veyra/asset-worker:cpu
# API side: ASSET_WORKER_URL=http://localhost:8010
```
