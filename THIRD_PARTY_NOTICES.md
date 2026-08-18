# Third-Party Notices

VEYRA 3D integrates third-party AI models **through isolated adapters and worker
containers**. Where a model's source or weights are used, its license and
required attribution are preserved here and in the corresponding worker's
`MODEL.md`. We do not copy upstream source into the core application; workers
clone pinned upstream commits at build time inside their own containers.

> A provider is not enabled in production until both its code and weights
> licenses are reviewed and its entry below is completed with the exact commit
> SHA and checkpoint hash actually deployed.

## AI models

### TripoSR — `services/ai-workers/triposr`
- Upstream: https://github.com/VAST-AI-Research/TripoSR
- Code license: MIT (verify against upstream at pinned commit)
- Weights license: verify at pinned commit
- Attribution: © Tripo AI / Stability AI contributors, per upstream LICENSE
- Pinned commit: `<TBD — record before prod>`

### TripoSG — `services/ai-workers/triposg`
- Upstream: https://github.com/VAST-AI-Research/TripoSG
- Status: LICENSE_REVIEW_REQUIRED — disabled

### TRELLIS / TRELLIS.2 — `services/ai-workers/trellis2`
- Upstream: https://github.com/microsoft/TRELLIS
- Code license: MIT (verify for the .2 line)
- Status: LICENSE_REVIEW_REQUIRED — disabled

### Stable Fast 3D — `services/ai-workers/sf3d`
- Upstream: https://github.com/Stability-AI/stable-fast-3d
- Weights: Stability AI Community License (revenue-gated) — RESTRICTED
- Status: LICENSE_REVIEW_REQUIRED — disabled

### Hunyuan3D 2.1 — `services/ai-workers/hunyuan3d`
- Upstream: https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1
- License: Tencent Hunyuan Community License — geo + use RESTRICTED
- Status: LICENSE_REVIEW_REQUIRED — disabled

### HY-Motion — `services/ai-workers/hymotion`
- Upstream: https://github.com/Tencent-Hunyuan/HY-Motion-1.0
- License (code + weights): **Tencent HY-MOTION 1.0 Community License Agreement**
- Commercial: permitted below 1M MAU; **excludes EU / UK / South Korea**; acceptable-use limits apply.
- Required attribution (include when enabled/distributed):
  > Tencent HY-MOTION 1.0 is licensed under the Tencent HY-MOTION 1.0 Community
  > License Agreement, Copyright © 2025 Tencent. All Rights Reserved.
- Status: **DISABLED in production** (geo + MAU gated). Adapter + worker complete; CPU procedural fallback for dev.

### HY-World — `services/ai-workers/hyworld`
- Upstream: https://github.com/Tencent-Hunyuan/HY-World-2.0 (latest official)
- License (code + weights): **Tencent HY-WORLD 2.0 Community License Agreement**
- Commercial: permitted below 1M MAU (else request license from Tencent); **excludes EU / UK / South Korea**; modified files need change notices.
- Required attribution (include when enabled/distributed):
  > Tencent HY-WORLD 2.0 is licensed under the Tencent HY-WORLD 2.0 Community
  > License Agreement, Copyright © 2026 Tencent. All Rights Reserved.
- Status: **DISABLED in production** (geo + MAU gated). Adapter + worker complete; CPU procedural fallback for dev.

## Notable software dependencies

Full dependency license inventories are generated per package. Key runtime
libraries include: Next.js, React, Three.js, @react-three/fiber & drei (MIT),
NestJS (MIT), Prisma (Apache-2.0), BullMQ (MIT), Tailwind CSS (MIT), and for
workers: PyTorch (BSD-style), trimesh (MIT), FastAPI (MIT). See each package's
`node_modules`/`pip` metadata for authoritative terms.

_This file is maintained as integrations land. If a license is unclear, the
integration stays disabled and is marked `LICENSE_REVIEW_REQUIRED`._
