# GPU Workers

Each AI model runs as an **isolated** container with its own pinned Python
dependencies. Node never runs ML; it talks to workers over HTTP through the
`ThreeDProvider` adapter → `HttpWorkerTransport`.

## Worker HTTP contract

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | `{status, freeVramMb?, queueDepth, checkedAt}` |
| POST | `/generate` | Bearer `WORKER_SHARED_SECRET` | run a generation, return files + metrics |
| POST | `/cancel` | Bearer | cancel a running job |
| GET | `/metrics` | none | Prometheus metrics |

`/generate` downloads the input from object storage, runs the model, uploads the
GLB, computes quality metrics, and posts real stage progress to the callback URL.

## Auth & network

Workers authenticate with a shared secret and must run on an internal network —
never exposed publicly (spec §33). The API worker passes `WORKER_SHARED_SECRET`
as a Bearer token; workers reject anything else.

## Heartbeats & scheduling

Workers register as `GPUWorker` rows and send `WorkerHeartbeat` (VRAM, temp,
current jobs, status ∈ ONLINE/BUSY/DRAINING/OFFLINE/ERROR). The scheduler picks a
worker by required provider, free VRAM, queue depth, health, and priority. Stale
heartbeats mark a worker OFFLINE.

## GPU environments

Supported via config, never hard-coded: `LOCAL`, `RUNPOD`, `VAST_AI`,
`DEDICATED`, `KUBERNETES`. Provide the worker's public/internal URL and shared
secret; it self-registers with the orchestrator.

## Running the real model (example: TripoSR)

```bash
docker build -f services/ai-workers/triposr/Dockerfile.gpu \
  --build-arg TRIPOSR_COMMIT=<sha> -t veyra/triposr:gpu .
docker run --gpus all -p 8001:8001 --env-file .env \
  -e WORKER_GPU_AVAILABLE=true veyra/triposr:gpu
```

Each worker's `MODEL.md` documents its pinned commit, checkpoint hash, VRAM, and
exact launch command. Without a GPU, workers fall back to the deterministic CPU
procedural generator (dev/CI only).

## OOM & timeouts

On CUDA OOM the attempt is failed and retried on a larger/available worker (not
re-sent to the same GPU). Queue/generation/heartbeat/processing timeouts are
enforced; cancelled jobs terminate the provider process where possible
(spec §73–§74).

## Circuit breaking

Repeated failures open a per-provider circuit (`packages/ai-sdk`): stop new
jobs → cooldown → health probe → auto-restore.
