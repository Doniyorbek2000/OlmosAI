# triposg worker — model card

- **Provider ID:** `triposg`
- **Role:** High-detail image-conditioned shape generation
- **Upstream:** https://github.com/VAST-AI-Research/TripoSG
- **Status:** `LICENSE_REVIEW_REQUIRED` — disabled in production until code +
  weights licenses are reviewed and the commit SHA + checkpoint hash are pinned
  below and recorded in `docs/model-registry.md` and `THIRD_PARTY_NOTICES.md`.

## Pinned version (fill before production)

| Field | Value |
| --- | --- |
| Upstream commit SHA | `<TBD>` |
| Checkpoint hash | `<TBD>` |
| torch / CUDA | `cu121` |

## Running (CPU procedural fallback, dev/CI)

```bash
docker build -f services/ai-workers/triposg/Dockerfile -t veyra/triposg:cpu .
docker run -p 8003:8003 --env-file .env veyra/triposg:cpu
```

For the real GPU model, create Dockerfile.gpu cloning the pinned upstream commit
(mirror services/ai-workers/triposr/Dockerfile.gpu) and run with `--gpus all`
and `WORKER_GPU_AVAILABLE=true`.
