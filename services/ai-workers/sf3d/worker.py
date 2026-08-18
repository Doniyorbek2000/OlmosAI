"""sf3d worker — Fast image→3D with UV unwrap.

Real GPU path loads the upstream model (pin a commit in MODEL.md). Without a
GPU it uses the shared procedural fallback so the pipeline is exercisable in
dev/CI. Enable in production only after license review (see
docs/model-registry.md).

Upstream: https://github.com/Stability-AI/stable-fast-3d
"""
from __future__ import annotations

import trimesh

from veyra_worker import create_worker_app
from veyra_worker.config import WorkerConfig
from veyra_worker.mesh import procedural_mesh
from veyra_worker.schemas import GenerateRequest

PROVIDER_ID = "sf3d"
MODEL_VERSION = "sf3d-1.0"


def _load_real_model():  # pragma: no cover - requires GPU + weights + license
    raise NotImplementedError(
        "Enable the real model in Dockerfile.gpu after license review; "
        "see services/ai-workers/sf3d/MODEL.md"
    )


def generate(
    image_bytes: bytes, request: GenerateRequest, config: WorkerConfig
) -> tuple[trimesh.Trimesh, int]:
    if config.gpu_available:  # pragma: no cover - GPU path
        _load_real_model()
    return procedural_mesh(
        image_bytes, seed=request.seed, subdivisions=3, target_polygons=request.targetPolygons
    )


app = create_worker_app(
    provider_id=PROVIDER_ID, model_version=MODEL_VERSION, generator=generate
)
