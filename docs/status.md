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

## Milestone 3 (natural language → Unity-ready model)
"Create a realistic Viking axe, 15k polygons maximum, PBR texture, optimized for
Unity" → the prompt parser extracts polygons/PBR/engine and picks GAME_READY →
the Text-to-3D workflow generates a concept image → routes to an image-to-3D
provider → validates polygon budget + quality → exports. Parser + workflow are
implemented and tested; the geometry-optimization (retopo/decimate/LOD) asset
pass is the remaining piece (Phase 4).

## Verification
- 54 Node unit tests (types, config, ai-sdk router/breaker/executor, storage,
  auth, api credit-ledger + mode-resolver + workflow-engine + prompt-parser +
  png/concept-image + game-ready) + 19 Python worker tests (7 generation, 12
  asset-worker) — all green
- `pnpm build`, `pnpm typecheck`, `pnpm test` pass; `next build` passes;
  Prisma schema validates; docker-compose config validates
