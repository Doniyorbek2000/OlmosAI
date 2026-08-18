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
- ✅ Asset-worker (Python/trimesh, CPU-runnable): center/normalize/auto-orient/
  remove-floaters/recalc-normals/smooth/decimate/remesh/optimize/LOD/collider/
  convert (GLB/GLTF/OBJ/STL/PLY) — 12 pytest tests
- ✅ Game-ready pipeline (spec §10): clean → optimize → decimate to budget →
  LODs → collider → export; `/v1/assets/:id/{optimize,decimate,remesh,convert,
  game-ready}` create versioned jobs (new AssetVersion, parent linkage, never
  overwrite) with quality gate + credit reserve/capture/refund
- ✅ Editor UI: Optimize / Decimate / Make-game-ready actions with live progress
- 🟨 PBR material editing (schema + properties panel present; UV/bake need a
  Blender step — documented, not silently substituted)

## Phase 5 — Text-to-3D & agent
- ✅ Resumable workflow engine (DB-persisted stages, resume-from-last-success) — tested
- ✅ Text-to-3D workflow: analyze → enhance → concept image → preprocess → shape →
  texture → postprocess → quality → export; `/v1/generations/text-to-3d` + web page
- ✅ Prompt parser (polygon budget, PBR, engine, style → mode) — parses the
  milestone-3 example; tested
- ✅ Concept-image service: in-process procedural PNG renderer (dependency-free
  encoder) + real text-to-image worker interface — tested
- ⬜ Full AI-agent execution surface (parser + workflow selection are in place)

## Phase 6 — Billing ✅
- ✅ Credit ledger: reserve/capture/release + grant, transactional + idempotent — tested
- ✅ Provider-agnostic PaymentProvider abstraction (Stripe adapter + Null adapter
  for dev); subscription + credit-pack checkout, billing portal
- ✅ Idempotent webhook handling: signature-verified, deduped by (provider,eventId)
  via ProcessedWebhookEvent, credit grants keyed by event id (no double-grant) —
  normalizer + event-application unit tested
- ✅ Subscription lifecycle (activate/renew→grant monthly credits/update/cancel/
  past-due), payment records, invoices read API
- ✅ Plans DB-driven (+ Stripe price ids from env); credit packs config-driven
- ✅ Billing web page (plans, packs, portal, transactions) + admin billing
  aggregates (revenue, MRR, credits granted/consumed, plan breakdown)

## Phase 7 — Developer API ✅
- ✅ API keys: create (plaintext once)/list/revoke, hashed storage, scopes,
  test/live prefixes — service tested (create/scopes/authenticate/revoke/expiry)
- ✅ HybridAuthGuard: same endpoints accept an API key OR a UI session; API-key
  requests are scope-checked + Redis rate-limited per key; ApiUsage recorded via
  interceptor
- ✅ Developer endpoints reachable by key: generations (image/text), jobs,
  assets (read/download/process) with per-endpoint scopes
- ✅ Webhooks: register/list/delete (https-only, signing secret shown once),
  HMAC-SHA256 signed deliveries with timestamp, exponential-backoff retry +
  delivery log, delivery worker; emitted on generation.started/completed/failed
  and asset.created — signing + retry + endpoint-selection unit tested
- ✅ Web /api-keys (developer) page: keys + webhooks + usage example

## Phase 8 — Admin & observability ✅
- ✅ Admin API (ADMIN-role guarded): platform overview (users, revenue/MRR,
  credits granted/consumed, jobs by status, queue depth, storage, API calls),
  users/jobs listing + search, provider controls (enable/disable/drain/priority/
  cost → rebuilds live registry), worker controls — no arbitrary command exec
- ✅ Observability: Prometheus metrics on the API (/api/metrics via prom-client:
  generations, duration, queue wait, credits captured, webhook deliveries +
  default process metrics) and workers (/metrics); pino structured logs with
  request/job/worker ids; OTel-compatible naming; Prometheus+Grafana compose
  profile + scrape config
- ✅ Admin web page (overview stats + provider enable/disable/drain); admin nav
  shown only to ADMIN; seed can elevate ADMIN_EMAIL — admin service + metrics
  unit tested

## Phase 9 — Character / Motion ✅ (provider disabled in prod — license)
- ✅ Full license review of HY-Motion 1.0 (Tencent Community; excludes EU/UK/KR,
  <1M MAU) — documented; provider **disabled in production**, config-gated.
- ✅ AnimationAsset model + CHARACTER asset type + rig metadata; CHARACTER-mode
  generations produce CHARACTER assets.
- ✅ HY-Motion worker (isolated FastAPI): deterministic procedural motion → a real
  **animated GLB** (glTF node-TRS animation, 7-joint rig, 8 channels) + portable
  motion-clip JSON + skeleton; GPU real-model path documented. 6 pytest tests.
- ✅ Text→motion pipeline: `/v1/motion/text-to-motion` (credits, isolated `motion`
  queue + processor → AnimationAsset), list/get/download, attach/detach to a
  character, delete; SSE progress; webhook + metrics. Web /create/motion page with
  **animation playback** in the viewer. Node service tests.

## Phase 10 — World Generation ✅ (provider disabled in prod — license)
- ✅ Full license review of HY-World 2.0 (Tencent Community; excludes EU/UK/KR,
  <1M MAU) — documented; provider **disabled in production**, config-gated.
- ✅ World + WorldObject models (terrain/mesh/light/camera/environment).
- ✅ **Isolated** HY-World worker (separate service, own `world` queue, single
  concurrency): procedural terrain + scattered scene objects composited into a
  real world GLB + scene manifest; GPU real-model path documented. 5 pytest tests.
- ✅ World pipeline: `/v1/worlds` (credits, `world` queue + processor →
  World+WorldObjects), list/get/download/delete; SSE progress; webhook + metrics.
  Web /worlds (list + generate) and /worlds/[id] viewer with scene tree + export.
- ✅ Restricted providers seeded (disabled), admin controls apply, compose
  `restricted-workers` profile, CI runs both worker suites.

## Milestone 1 (the 20-step flow)
Register → login → project → upload → store → start image-to-3D → job + credit
reserve → worker generates real GLB → upload → quality validate → asset/version
records → COMPLETED → credits finalize → SSE completion → open in viewer →
download GLB → history persists. **Server + worker + web are all implemented and
build/test green**; run it locally per `docs/local-development.md` (procedural
TripoSR or mock provider — no GPU required).

## Milestone 3 (natural language → Unity-ready model)
"Create a realistic Viking axe, 15k polygons maximum, PBR texture, optimized for
Unity" → the prompt parser extracts polygons/PBR/engine and picks GAME_READY →
the Text-to-3D workflow generates a concept image → routes to an image-to-3D
provider → validates polygon budget + quality → exports. Parser + workflow are
implemented and tested; the geometry-optimization (retopo/decimate/LOD) asset
pass is the remaining piece (Phase 4).

## Verification
- 96 Node unit tests (types, config, ai-sdk router/breaker/executor, storage,
  auth, and api: credit-ledger, mode-resolver, workflow-engine, prompt-parser,
  png/concept-image, game-ready, billing event-application + stripe-normalizer,
  api-key service, webhook signing/backoff + emit, admin aggregation, metrics,
  motion + world services) + 30 Python worker tests (7 generation, 12
  asset-worker, 6 hymotion, 5 hyworld) — all green
- `pnpm build`/`typecheck`/`test` pass; `next build` passes; Prisma schema
  validates; docker-compose config validates
- `pnpm build`, `pnpm typecheck`, `pnpm test` pass; `next build` passes;
  Prisma schema validates; docker-compose config validates
