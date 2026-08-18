# Local Development

## Prerequisites

- Node ≥ 20, pnpm ≥ 9
- Docker + Docker Compose
- Python ≥ 3.10 (only to run AI workers locally)

## First run

```bash
cp .env.example .env
pnpm install

# Infra: Postgres + Redis + MinIO (bucket auto-created)
docker compose -f infra/docker/docker-compose.yml up -d

# Prisma
pnpm db:generate
pnpm --filter @veyra/database exec prisma migrate dev --name init
pnpm db:seed

# Run the API, worker, and web (three terminals or a process manager)
pnpm --filter @veyra/api dev          # http://localhost:4000
pnpm --filter @veyra/api worker:dev   # generation worker
pnpm --filter @veyra/web dev          # http://localhost:3000
```

## Running the full end-to-end flow without a GPU

The first milestone works on a CPU-only machine using the **procedural TripoSR
worker** (real, valid GLB output) or the **mock provider**.

Option A — procedural TripoSR worker (recommended, exercises the real transport):

```bash
# Start the CPU worker
docker compose -f infra/docker/docker-compose.yml --profile workers up -d triposr
# Point the API worker at it (already set in .env.example):
#   TRIPOSR_WORKER_URL=http://localhost:8001
#   PROVIDER_TRIPOSR_ENABLED=true
```

Option B — in-process mock provider (fastest, no worker):

```bash
# .env
PROVIDER_MOCK_ENABLED=true   # dev only; blocked in production by config
```

Then: register → upload an image on **/create/image-to-3d** → Generate → watch
real SSE progress → the GLB renders in the WebGL viewer → download.

## Running an AI worker directly (Python)

```bash
cd services/ai-workers/_shared
python -m venv .venv && . .venv/bin/activate
pip install -e .
pip install -e ../triposr 2>/dev/null || true   # or add paths to PYTHONPATH
export WORKER_SHARED_SECRET=... S3_ENDPOINT=http://localhost:9000 \
       S3_BUCKET=veyra-assets S3_ACCESS_KEY_ID=minioadmin S3_SECRET_ACCESS_KEY=minioadmin
uvicorn triposr.worker:app --port 8001 --app-dir ..
```

## Tests

```bash
pnpm test                       # all Node unit tests
cd services/ai-workers/_shared && pytest -q   # worker tests
```

## Useful

- MinIO console: http://localhost:9001 (minioadmin / minioadmin)
- Prisma Studio: `pnpm --filter @veyra/database studio`
