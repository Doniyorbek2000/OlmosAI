# VEYRA 3D

> Production-grade AI 3D creation platform. Text → 3D, Image → 3D, PBR texturing,
> mesh optimization, game-ready export, and a browser-based 3D editor — with a
> modular AI orchestration layer that hides the underlying models.

The product name is **configurable** (`VEYRA_BRAND_NAME`) so branding can change
without touching the codebase.

---

## What this is

VEYRA 3D is a monorepo containing a web app, an API, GPU worker services, and a
set of shared packages. The central architectural idea is that **every AI model
sits behind a provider adapter** implementing a single typed interface
(`ThreeDProvider`). The frontend and business logic never know which model ran —
they ask for a *capability* at a *quality tier*, and the router picks a provider.

```
User Request → API Gateway → AI Orchestrator → Capability Resolver
→ Model Router → GPU Job Queue → AI Worker → Post Processing
→ Asset Storage → CDN → Web 3D Editor
```

## Repository layout

```
apps/
  web/            Next.js 3D creation app + editor (React Three Fiber)
  api/            NestJS API gateway (auth, jobs, billing, storage, dev API)
  admin/          Admin panel (providers, GPUs, users, analytics)
services/
  ai-orchestrator/  Provider health, routing, worker scheduling
  asset-worker/     Blender/trimesh post-processing (remesh, decimate, LOD, convert)
  ai-workers/
    triposr/        FAST image→3D  (real, GPU-optional procedural fallback)
    trellis2/       HIGH-QUALITY image→3D + PBR
    triposg/        High-detail shape generation
    sf3d/           Fast image→3D
    hunyuan3d/      Image→3D + texture (disabled pending license review)
    hymotion/       Text→character motion
    hyworld/        Text/image→3D world (feature-flagged)
    _shared/        Shared Python worker framework (FastAPI base, GLB tooling)
packages/
  types/          Shared TS domain types, capabilities, structured errors
  ai-sdk/         Provider interface, router, circuit breaker, mock provider
  config/         Env validation, branding, provider + plan config
  database/       Prisma schema, client, seed
  storage/        S3-compatible signed-URL storage
  queue/          BullMQ-backed job queue abstraction
  auth/           Password hashing, JWT, API-key hashing
  logger/         Structured logging with request/job/worker IDs
  observability/  OpenTelemetry + Prometheus helpers
  three-utils/    Shared Three.js/GLB inspection helpers
  ui/             Shared React UI (Tailwind + shadcn-style primitives)
infra/
  docker/         docker-compose + Dockerfiles
  kubernetes/     Manifests / Helm structure (GPU pods)
  terraform/      Cloud infra scaffolding
docs/             Architecture, model registry, billing, security, API, ...
scripts/          Dev + ops scripts
```

## Quick start (local development)

Prerequisites: Node ≥ 20, pnpm ≥ 9, Docker, Python ≥ 3.10 (for workers).

```bash
cp .env.example .env
pnpm install

# Bring up Postgres, Redis, MinIO (+ optional workers)
docker compose -f infra/docker/docker-compose.yml up -d

# Generate Prisma client + run migrations + seed
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# Run the stack
pnpm dev
```

GPU models are optional locally. The **mock provider** and the **procedural
TripoSR fallback** let the full end-to-end flow work on CPU-only machines for
development. The mock provider is hard-blocked in production by config
validation.

See [`docs/local-development.md`](docs/local-development.md) for details.

## Documentation

| Doc | Contents |
| --- | --- |
| [architecture.md](docs/architecture.md) | System design, request lifecycle, diagrams |
| [model-registry.md](docs/model-registry.md) | Every AI model, license, weights license, GPU needs |
| [database.md](docs/database.md) | Entities, relationships, versioning |
| [workflows.md](docs/workflows.md) | Text-to-3D / game-ready resumable workflows |
| [billing.md](docs/billing.md) | Credits, reservation, refunds, plans |
| [gpu-workers.md](docs/gpu-workers.md) | Worker protocol, heartbeats, scheduling |
| [api.md](docs/api.md) | Developer REST API, keys, webhooks |
| [security.md](docs/security.md) | RBAC, signed URLs, upload validation |
| [deployment.md](docs/deployment.md) | Docker, Kubernetes, proxy, backups |
| [troubleshooting.md](docs/troubleshooting.md) | Common issues |

## Implementation status

This repository is being built in vertical slices (see the master spec's phase
plan). Current focus: **Phase 1 (monorepo, DB, auth, storage, queue, project
management, provider SDK) and the first Image-to-3D vertical slice**. Sections
that require GPU hardware ship as complete adapters + Dockerfiles + mocked
transport tests, with the exact GPU launch command documented — plus at least
one provider (procedural TripoSR / mock) that runs without a GPU.

See [`docs/status.md`](docs/status.md) for the live checklist.

## Licensing

Third-party AI model code and **weights** carry separate licenses. We never
enable a provider in production until its license is reviewed. See
[`docs/model-registry.md`](docs/model-registry.md) and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Anything unverified is marked
`LICENSE_REVIEW_REQUIRED` and shipped `enabled=false`.

## License

Proprietary — © VEYRA 3D. See individual package headers.
