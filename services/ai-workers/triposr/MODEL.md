# TripoSR worker — model card

- **Provider ID:** `triposr`
- **Role:** FAST image → 3D (preview / low-cost / fallback tier)
- **Upstream:** https://github.com/VAST-AI-Research/TripoSR
- **Weights:** `stabilityai/TripoSR` on Hugging Face
- **Capabilities:** `IMAGE_TO_3D`, `FAST_GENERATION`, `MESH`

## Pinned version (fill before production)

| Field | Value |
| --- | --- |
| Upstream commit SHA | `<TBD>` |
| Checkpoint (model.ckpt) sha256 | `<TBD>` |
| torch / CUDA | `cu121` |
| Min VRAM | ~6 GB |

## Licensing

Confirm the current **code** and **weights** licenses at the pinned commit
before enabling in production. Record the outcome in `docs/model-registry.md`
and `THIRD_PARTY_NOTICES.md`. Until confirmed: `LICENSE_REVIEW_REQUIRED`.

## Running

**CPU (procedural fallback, dev/CI):**
```bash
docker build -f services/ai-workers/triposr/Dockerfile -t veyra/triposr:cpu .
docker run -p 8001:8001 --env-file .env veyra/triposr:cpu
```

**GPU (real model):**
```bash
docker build -f services/ai-workers/triposr/Dockerfile.gpu \
  --build-arg TRIPOSR_COMMIT=<sha> -t veyra/triposr:gpu .
docker run --gpus all -p 8001:8001 --env-file .env \
  -e WORKER_GPU_AVAILABLE=true veyra/triposr:gpu
```

## Endpoints

- `GET /health` → `{status, freeVramMb?, queueDepth, checkedAt}`
- `POST /generate` (Bearer `WORKER_SHARED_SECRET`) → `GenerateResponse`
- `POST /cancel` → `{ok}`
- `GET /metrics` → Prometheus metrics
