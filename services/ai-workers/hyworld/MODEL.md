# HY-World worker — model card

- **Provider ID:** `hyworld`
- **Role:** TEXT / IMAGE → 3D WORLD (Phase 10)
- **Capabilities:** `WORLD_GENERATION`
- **Upstream:** https://github.com/Tencent-Hunyuan/HY-World-2.0 (latest official)
- **Weights:** Tencent HY-World 2.0 release

## License (reviewed 2026-08)

**Tencent HY-WORLD 2.0 Community License Agreement**, © 2026 Tencent (code +
weights). Commercial use permitted **below 1,000,000 MAU** (else request a
license from `hunyuan3d@tencent.com`); **hard geographic exclusion of the EU, UK,
and South Korea**; acceptable-use limits; modified files must carry change
notices; attribution required. Full review in `docs/model-registry.md`.

**Status: DISABLED in production** (`FEATURE_WORLD_GENERATION` off; `packages/config`
blocks enabling it in prod unless `ALLOW_RESTRICTED_PROVIDERS=true`).

Required attribution when enabled/distributed:
> Tencent HY-WORLD 2.0 is licensed under the Tencent HY-WORLD 2.0 Community
> License Agreement, Copyright © 2026 Tencent. All Rights Reserved.

## Isolation

World generation is heavy and runs as a **separate service** with its own queue
(`world`) and single-concurrency worker — it must never be co-scheduled with the
object-generation workers (spec §39).

## Pinned version (fill before production)

| Field | Value |
| --- | --- |
| Upstream commit SHA | `<TBD>` |
| Checkpoint hash | `<TBD>` |
| torch / CUDA | `cu121` |
| Min VRAM | 24 GB+ (A100 80GB recommended) |

## Endpoints

- `GET /health`
- `POST /generate` (Bearer) — `{jobId, prompt, seed, size}` → `{glb, environment,
  objects[], metadata, seed}` (composited world GLB + scene manifest).
- `POST /cancel`, `GET /metrics`

## Run

```bash
docker build -f services/ai-workers/hyworld/Dockerfile -t veyra/hyworld:cpu .   # procedural
docker run -p 8007:8007 --env-file .env veyra/hyworld:cpu
# GPU (licensed territory only): add Dockerfile.gpu cloning the pinned commit and
# run with --gpus all -e WORKER_GPU_AVAILABLE=true.
```
