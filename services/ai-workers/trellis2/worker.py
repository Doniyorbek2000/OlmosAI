"""TRELLIS.2 worker — HIGH-QUALITY image→3D + PBR.

Real GPU path loads Microsoft TRELLIS.2 (pin a commit in MODEL.md). Without a
GPU it uses the shared high-subdivision procedural fallback so the pipeline is
exercisable in dev/CI. Enable in production only after license review
(LICENSE_REVIEW_REQUIRED — see docs/model-registry.md).

Upstream: https://github.com/microsoft/TRELLIS
"""
from __future__ import annotations

import trimesh

from veyra_worker import create_worker_app
from veyra_worker.config import WorkerConfig
from veyra_worker.mesh import procedural_mesh
from veyra_worker.schemas import GenerateRequest

PROVIDER_ID = "trellis2"
MODEL_VERSION = "trellis.2"


def _load_real_model():  # pragma: no cover - requires GPU + weights + license
    raise NotImplementedError(
        "Enable the real TRELLIS.2 model in Dockerfile.gpu after license review; "
        "see services/ai-workers/trellis2/MODEL.md"
    )


def generate(
    image_bytes: bytes, request: GenerateRequest, config: WorkerConfig
) -> tuple[trimesh.Trimesh, int]:
    if config.gpu_available:  # pragma: no cover - GPU path
        _load_real_model()
    # Higher subdivision to reflect the "quality" tier in the fallback.
    return procedural_mesh(
        image_bytes, seed=request.seed, subdivisions=4, target_polygons=request.targetPolygons
    )


app = create_worker_app(
    provider_id=PROVIDER_ID, model_version=MODEL_VERSION, generator=generate
)
