# VEYRA 3D — AI Model Registry

> **Licensing is dual.** Source-code license and model-**weights** license are
> tracked separately and can differ. A provider is only enabled in production
> after both are reviewed and confirmed compatible with our deployment
> (commercial SaaS, global). Anything unverified is `LICENSE_REVIEW_REQUIRED`
> and ships `enabled=false`. **This document is engineering research, not legal
> advice** — confirm every license against the current upstream repository and
> obtain legal sign-off before enabling commercial production.

Each integration also pins an exact upstream commit/tag and records the model
checkpoint version (see [gpu-workers.md](gpu-workers.md) and each worker's
`MODEL.md`). We never track upstream `main` in production.

## Registry

| Provider ID | Repository | Task | Code License | Weights License | Commercial? | Min VRAM | Recommended GPU | ~Gen time | CUDA | Python | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mock` | (internal) | any (procedural) | Proprietary | n/a | dev only | 0 | CPU | <2s | n/a | 3.10+ | **enabled (dev only, blocked in prod)** |
| `triposr` | VAST-AI-Research/TripoSR | image→3D (fast) | MIT (verify) | MIT (verify) | Likely yes | ~6 GB | RTX 3090 / A10 | 1–5s | 11.8/12.1 | 3.10+ | **enabled** (also has CPU procedural fallback for dev) |
| `triposg` | VAST-AI-Research/TripoSG | image→3D shape (high detail) | Verify | Verify | Verify | ~10 GB | A10 / L4 | 15–40s | 12.1 | 3.10+ | adapter ready, `LICENSE_REVIEW_REQUIRED`, disabled |
| `trellis2` | microsoft/TRELLIS (a.k.a. TRELLIS.2) | image→3D + PBR (high quality) | MIT (verify for .2) | Verify | Verify | ~16 GB | A100 / L40S | 30–90s | 12.1 | 3.10+ | adapter ready, `LICENSE_REVIEW_REQUIRED`, disabled |
| `sf3d` | Stability-AI/stable-fast-3d | image→3D + UV (fast) | Verify | **Stability Community License** (revenue-gated) | **Restricted** | ~7 GB | RTX 4090 / L4 | 1–3s | 12.1 | 3.10+ | adapter ready, `LICENSE_REVIEW_REQUIRED`, disabled |
| `hunyuan3d` | Tencent-Hunyuan/Hunyuan3D-2.1 | image→3D + texture/PBR | Tencent Community (verify) | **Tencent Community License** (geo + use restrictions) | **Restricted / geo-limited** | ~16 GB | A100 | 30–120s | 12.1 | 3.10+ | adapter ready, **disabled**, `LICENSE_REVIEW_REQUIRED` |
| `hymotion` | Tencent-Hunyuan/HY-Motion-1.0 | text→character motion | Tencent HY-MOTION 1.0 Community | Tencent HY-MOTION 1.0 Community | **Restricted / geo-limited** | ~12 GB | A100 | 10–60s | 12.1 | 3.10+ | adapter + worker complete, **disabled in prod**, CPU procedural fallback for dev |
| `hyworld` | Tencent-Hunyuan/HY-World-2.0 | text/image→3D world | Tencent HY-WORLD 2.0 Community | Tencent HY-WORLD 2.0 Community | **Restricted / geo-limited** | 24 GB+ | A100 80GB | minutes | 12.1 | 3.10+ | adapter + worker complete, **disabled in prod** (feature-flag), CPU procedural fallback for dev |

### Notes per provider

- **`mock`** — Internal procedural generator. Produces deterministic valid GLB
  meshes for development and CI. Config validation (`packages/config`) throws if
  `PROVIDER_MOCK_ENABLED=true` while `NODE_ENV=production`.
- **`triposr`** — TripoSR was published for fast single-image reconstruction.
  We also implement a **procedural CPU fallback** in the worker so the vertical
  slice runs without a GPU in development. Confirm the current MIT designation
  for both code and weights before relying on it commercially.
- **`sf3d` (Stable Fast 3D)** — Stability's Community License permits commercial
  use only below a revenue threshold and otherwise requires an enterprise
  agreement. Treat as restricted; keep disabled until legal review.
- **`hunyuan3d`** — Tencent Hunyuan community license; geographic + acceptable-use
  restrictions. Integrated behind an adapter but **shipped disabled** in production.

## HY-Motion & HY-World — full license review (2026-08, from upstream `License.txt`)

Reviewed against the current official repositories. **Engineering research, not
legal advice** — obtain counsel sign-off before enabling in any jurisdiction.

### `hymotion` — Tencent-Hunyuan/HY-Motion-1.0
- **License (code + weights):** *Tencent HY-MOTION 1.0 Community License Agreement*,
  © 2025 Tencent (single `License.txt`; weights on HF `tencent/HY-Motion-1.0`).
- **Commercial use:** permitted **below 1,000,000 monthly active users**; above
  that threshold you must obtain separate **written approval** from Tencent.
- **Geographic exclusion (hard):** *"THIS LICENSE AGREEMENT DOES NOT APPLY IN THE
  EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA."* Any deployment/use serving
  those territories is **unlicensed**.
- **Acceptable use:** no use outside the Territory; no improving other AI models
  with outputs; no malware/disinformation/minor-exploitation/military/high-stakes
  automated decisions; no circumventing safety guardrails.
- **Attribution:** distributions must include *"Tencent HY-MOTION 1.0 is licensed
  under the Tencent HY-MOTION 1.0 Community License Agreement, Copyright © 2025
  Tencent. All Rights Reserved."*; encouraged to mark output *"Powered by Tencent HY."*

### `hyworld` — Tencent-Hunyuan/HY-World-2.0 (latest official world model)
- **License (code + weights):** *Tencent HY-WORLD 2.0 Community License Agreement*,
  © 2026 Tencent (`License.txt`).
- **Commercial use:** permitted **below 1,000,000 MAU**; above that you must
  request a license from Tencent (`hunyuan3d@tencent.com`), granted at Tencent's
  sole discretion.
- **Geographic exclusion (hard):** excludes the **European Union, United Kingdom,
  and South Korea**; deployment outside the defined Territory is *"unlicensed and
  unauthorized."*
- **Acceptable use:** no harm to minors, election disinformation, malware,
  impersonation, high-stakes automated decisions, military use, or protected-class
  discrimination. Modified files must carry prominent change notices.
- **Attribution:** *"Tencent HY-WORLD 2.0 is licensed under the Tencent HY-WORLD 2.0
  Community License Agreement, Copyright © 2026 Tencent. All Rights Reserved."*

### Commercial-deployment conclusion → **DISABLED in production**
VEYRA's default target is a **global** commercial SaaS. The hard EU/UK/South-Korea
exclusion is incompatible with serving those regions, and the 1M-MAU ceiling caps
scale. Therefore both providers are **shipped disabled in production**
(`FEATURE_MOTION` / `FEATURE_WORLD_GENERATION` default off; `packages/config`
throws if either is enabled in production unless `ALLOW_RESTRICTED_PROVIDERS=true`
is set to acknowledge that the operator has territory geofencing, is under the MAU
ceiling, and has legal sign-off). The **complete adapters, isolated GPU workers,
Dockerfiles, orchestration, health checks, admin controls, tests, and CPU
procedural fallbacks** are implemented so a licensed operator in a permitted
territory can enable them by pinning the upstream commit + weights and flipping
the flags. Status: `LICENSE_REVIEW_REQUIRED` (geo + MAU gated).

## How enablement works

1. Adapter + worker Dockerfile + mocked-transport tests exist for every provider.
2. Enablement is gated by (a) `packages/config` provider flags / DB `AIProvider`
   rows, and (b) this registry's `Status`.
3. To enable in production: confirm code + weights license, record the exact
   commit SHA and checkpoint hash in the worker's `MODEL.md`, add the attribution
   to `THIRD_PARTY_NOTICES.md`, set the DB provider `enabled=true`, and roll out
   per [upstream-updates.md](upstream-updates.md).

## Update / rollout policy

Never silently update a model. Track current version, candidate version,
compatibility test result, benchmark delta, rollout, and rollback. See
[upstream-updates.md](upstream-updates.md) and [benchmarks.md](benchmarks.md).
