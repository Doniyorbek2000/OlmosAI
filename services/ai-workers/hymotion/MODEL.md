# HY-Motion worker — model card

- **Provider ID:** `hymotion`
- **Role:** TEXT → CHARACTER MOTION (Phase 9)
- **Capabilities:** `TEXT_TO_MOTION`, `CHARACTER_ANIMATION`
- **Upstream:** https://github.com/Tencent-Hunyuan/HY-Motion-1.0
- **Weights:** `tencent/HY-Motion-1.0` (Hugging Face)

## License (reviewed 2026-08)

**Tencent HY-MOTION 1.0 Community License Agreement**, © 2025 Tencent (code +
weights). Commercial use permitted **below 1,000,000 MAU**; **hard geographic
exclusion of the EU, UK, and South Korea**; acceptable-use limits; attribution
required. See `docs/model-registry.md` for the full review.

**Status: DISABLED in production** (`FEATURE_MOTION` off; `packages/config` blocks
enabling it in prod unless `ALLOW_RESTRICTED_PROVIDERS=true`). A licensed operator
in a permitted territory, under the MAU ceiling, can enable it.

Required attribution when enabled/distributed:
> Tencent HY-MOTION 1.0 is licensed under the Tencent HY-MOTION 1.0 Community
> License Agreement, Copyright © 2025 Tencent. All Rights Reserved.

## Pinned version (fill before production)

| Field | Value |
| --- | --- |
| Upstream commit SHA | `<TBD>` |
| Checkpoint hash | `<TBD>` |
| torch / CUDA | `cu121` |
| Min VRAM | ~12 GB |

## Endpoints

- `GET /health`
- `POST /generate` (Bearer `WORKER_SHARED_SECRET`) — `{jobId, prompt,
  durationSeconds, fps, seed}` → `{files:[animated GLB, motion JSON], skeleton,
  durationSeconds, fps, frameCount, seed}`
- `POST /cancel`, `GET /metrics`

## Output

- **Animated GLB** — a rigged clip (glTF node-TRS animation) playable in the web
  viewer (three.js AnimationMixer).
- **Motion JSON** — portable skeleton + per-frame joint quaternions.
- FBX export requires a Blender retarget step (documented; not produced in the
  CPU profile).

## Run

```bash
docker build -f services/ai-workers/hymotion/Dockerfile -t veyra/hymotion:cpu .   # procedural
docker run -p 8006:8006 --env-file .env veyra/hymotion:cpu
# GPU (licensed territory only): add Dockerfile.gpu cloning the pinned commit and
# run with --gpus all -e WORKER_GPU_AVAILABLE=true.
```
