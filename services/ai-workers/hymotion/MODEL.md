# HY-Motion worker — model card (scaffold, disabled)

- **Provider ID:** `hymotion`
- **Role:** TEXT → CHARACTER MOTION
- **Capabilities:** `TEXT_TO_MOTION`, `CHARACTER_ANIMATION`
- **Upstream:** https://github.com/Tencent-Hunyuan/HY-Motion-1.0
- **Status:** `LICENSE_REVIEW_REQUIRED`, feature-flagged OFF (`FEATURE_MOTION`).

Motion output is an animation clip attached to a CHARACTER asset as an
`AssetVersion`/`AnimationAsset`, not a mesh — so this worker uses a distinct
response schema (skeleton + keyframes / glTF animation) rather than the mesh
GLB path. Implement against the pinned upstream commit inside an isolated GPU
container; keep dependencies out of the main app (spec §5, §38).
