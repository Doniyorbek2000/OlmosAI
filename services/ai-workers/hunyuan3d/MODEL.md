# hunyuan3d worker — model card

- **Provider ID:** `hunyuan3d`
- **Role:** Image→3D + texture/PBR (geo/license restricted — disabled)
- **Upstream:** https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1
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
docker build -f services/ai-workers/hunyuan3d/Dockerfile -t veyra/hunyuan3d:cpu .
docker run -p 8005:8005 --env-file .env veyra/hunyuan3d:cpu
```

For the real GPU model, create Dockerfile.gpu cloning the pinned upstream commit
(mirror services/ai-workers/triposr/Dockerfile.gpu) and run with `--gpus all`
and `WORKER_GPU_AVAILABLE=true`.
