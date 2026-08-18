# HY-World worker — model card (scaffold, feature-flagged off)

- **Provider ID:** `hyworld`
- **Role:** TEXT / IMAGE / MULTI-IMAGE / VIDEO → 3D WORLD
- **Capabilities:** `WORLD_GENERATION`
- **Upstream:** Tencent HY-World (latest official)
- **Status:** `LICENSE_REVIEW_REQUIRED`, feature-flagged OFF
  (`FEATURE_WORLD_GENERATION`).

World generation is heavy and must run as an independent worker service with
its own large dependencies — never in the main app container (spec §5, §39).
World projects contain terrain, meshes, cameras, lights, environment, and
metadata, and use the WORLD project/asset type. Ship disabled until production
ready.
