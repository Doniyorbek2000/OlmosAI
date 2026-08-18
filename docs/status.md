# Implementation Status

VEYRA 3D is built in vertical slices. This tracks what is implemented, verified,
scaffolded, or planned. It is honest by design — a platform of this scope is a
multi-quarter effort; this repository establishes a real, tested foundation and
the first working vertical slice.

Legend: ✅ implemented + tested · 🟩 implemented · 🟨 scaffolded/partial · ⬜ planned

## Phase 1 — Foundation
- ✅ Monorepo (Turborepo + pnpm), strict TS, prettier
- ✅ Prisma schema (all spec entities) — validates, client generates
- ✅ Auth (register/login/refresh rotation, logout-all, RBAC, hashed refresh + API keys)
- ✅ Storage (S3 signed URLs, magic-byte validation)
- ✅ Queue (BullMQ behind a swappable interface)
- ✅ Config (fail-fast env validation, feature flags, branding)
- 🟩 Project management (CRUD, soft delete)

## Phase 2 — First image-to-3D slice
- ✅ Provider SDK: `ThreeDProvider`, registry, circuit breaker, router, fallback executor
- ✅ TripoSR worker — **runnable without a GPU** (procedural GLB), + GPU real-model path
- 🟩 Image-to-3D job pipeline (reserve → route → run → quality gate → persist → finalize)
- ✅ Real SSE job progress (Redis pub/sub) — no faked progress
- 🟩 WebGL 3D viewer (R3F): orbit/grid/wireframe/env, live stats, resource disposal

## Phase 3 — Quality & routing
- 🟩 AI router (scoring, preferences, fallback chains) + circuit breaker — tested
- 🟩 TRELLIS.2 / TripoSG / SF3D adapters + workers (fallback runnable; real GPU documented)
- ✅ AssetQualityService (metrics, score, corrupt output not billed)

## Phase 4 — Asset processing & materials
- 🟨 Asset-worker service dir + post-processing op list (Blender/trimesh) — pipeline planned
- 🟨 PBR material model in schema + editor properties panel (edit ops planned)

## Phase 5 — Text-to-3D & agent
- 🟩 Resumable workflow types + stage persistence (schema + types); orchestration planned
- ⬜ Concept-image abstraction, AI agent execution

## Phase 6 — Billing
- ✅ Credit ledger: reserve/capture/release, transactional + idempotent — tested
- 🟩 Plans/subscriptions schema + seed; Stripe adapter interface — webhooks planned

## Phase 7 — Developer API
- 🟩 API-key hashing/scopes/usage schema; documented endpoints
- 🟨 `/v1` controllers + webhook delivery worker — partial

## Phase 8 — Admin & observability
- 🟩 Admin data model (providers/workers/analytics); Prometheus metrics in workers
- 🟨 Admin panel UI, OpenTelemetry wiring — partial

## Phases 9–10 — Character/motion & world
- 🟨 HY-Motion / HY-World worker scaffolds + docs, feature-flagged off (license review)

## Milestone 1 (the 20-step flow)
Register → login → project → upload → store → start image-to-3D → job + credit
reserve → worker generates real GLB → upload → quality validate → asset/version
records → COMPLETED → credits finalize → SSE completion → open in viewer →
download GLB → history persists. **Server + worker + web are all implemented and
build/test green**; run it locally per `docs/local-development.md` (procedural
TripoSR or mock provider — no GPU required).

## Verification
- 35 Node unit tests (types, config, ai-sdk router/breaker/executor, storage,
  auth, api credit-ledger + mode-resolver) + 7 Python worker tests — all green
- `pnpm build`, `pnpm typecheck`, `pnpm test` pass; `next build` passes;
  Prisma schema validates; docker-compose config validates
