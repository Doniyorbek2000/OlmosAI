"""TripoSR worker — FAST image-to-3D.

When a GPU + the upstream TripoSR checkout are available (WORKER_GPU_AVAILABLE=
true), this loads the real model. Otherwise it uses the framework's deterministic
CPU procedural generator so the end-to-end flow runs in development/CI without a
GPU (spec §90: "make at least one real compatible provider executable").

Upstream: https://github.com/VAST-AI-Research/TripoSR  (pin a commit in MODEL.md)
"""
from __future__ import annotations

import trimesh

from veyra_worker import create_worker_app
from veyra_worker.config import WorkerConfig
from veyra_worker.mesh import procedural_mesh
from veyra_worker.schemas import GenerateRequest

PROVIDER_ID = "triposr"
MODEL_VERSION = "triposr-1.0"

_real_model = None


def _load_real_model():  # pragma: no cover - requires GPU + weights
    """Lazy-load the real TripoSR pipeline. Implemented against the upstream
    package's public API; guarded so the worker imports cleanly without it."""
    global _real_model
    if _real_model is not None:
        return _real_model
    import torch  # noqa: F401
    from tsr.system import TSR  # type: ignore

    model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.renderer.set_chunk_size(8192)
    model.to("cuda")
    _real_model = model
    return model


def generate(
    image_bytes: bytes, request: GenerateRequest, config: WorkerConfig
) -> tuple[trimesh.Trimesh, int]:
    if config.gpu_available:  # pragma: no cover - GPU path
        import io

        import numpy as np
        from PIL import Image

        model = _load_real_model()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        scene_codes = model([np.asarray(image)], device="cuda")
        meshes = model.extract_mesh(scene_codes, resolution=256)
        m = meshes[0]
        mesh = trimesh.Trimesh(vertices=m.vertices, faces=m.faces, process=True)
        if request.targetPolygons and len(mesh.faces) > request.targetPolygons:
            reduced = mesh.simplify_quadric_decimation(request.targetPolygons)
            if reduced is not None and len(reduced.faces):
                mesh = reduced
        return mesh, request.seed or 0

    # CPU procedural fallback (documented, deterministic).
    return procedural_mesh(
        image_bytes,
        seed=request.seed,
        subdivisions=3,
        target_polygons=request.targetPolygons,
    )


app = create_worker_app(
    provider_id=PROVIDER_ID,
    model_version=MODEL_VERSION,
    generator=generate,
)
