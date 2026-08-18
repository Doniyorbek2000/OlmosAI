# TRELLIS.2 worker — model card

- **Provider ID:** `trellis2`
- **Role:** HIGH-QUALITY image→3D + PBR (premium / professional tier)
- **Upstream:** https://github.com/microsoft/TRELLIS
- **Capabilities:** `IMAGE_TO_3D`, `PBR_3D`, `PBR_TEXTURE`, `HIGH_QUALITY`, `UV`, `MESH`
- **Status:** `LICENSE_REVIEW_REQUIRED` — confirm code + weights licenses for the
  TRELLIS.2 line at the pinned commit before enabling in production.

## Pinned version (fill before production)

| Field | Value |
| --- | --- |
| Upstream commit SHA | `<TBD>` |
| Checkpoint hash | `<TBD>` |
| torch / CUDA | `cu121` |
| Min VRAM | ~16 GB |

## Running

CPU procedural fallback (dev/CI):
```bash
docker build -f services/ai-workers/trellis2/Dockerfile -t veyra/trellis2:cpu .
docker run -p 8002:8002 --env-file .env veyra/trellis2:cpu
```

GPU (real model): create Dockerfile.gpu cloning the pinned upstream commit
(mirror services/ai-workers/triposr/Dockerfile.gpu), install its requirements,
and run with `--gpus all -e WORKER_GPU_AVAILABLE=true`.
