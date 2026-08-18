"""VEYRA 3D HY-World worker — TEXT/IMAGE → 3D WORLD (Phase 10).

ISOLATED, heavy world-generation service — never shares an environment with the
object-generation workers (spec §39). Real GPU path (MODEL.md) runs the HY-World
panorama→3D pipeline; CPU fallback composites a procedural terrain + scene for
dev/CI. Both upload a composited world GLB + a scene manifest.

Upstream: https://github.com/Tencent-Hunyuan/HY-World-2.0
LICENSE: Tencent HY-WORLD 2.0 Community (geo-excludes EU/UK/KR; <1M MAU).
Disabled in production — see docs/model-registry.md.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException
from prometheus_client import Counter, make_asgi_app
from pydantic import BaseModel

from veyra_worker.config import load_config
from veyra_worker.storage import WorkerStorage

from worldgen import generate_world

WORLD_COUNT = Counter("veyra_hyworld_total", "World generations", ["outcome"])

config = load_config("hyworld", "hyworld-2.0")
storage = WorkerStorage(config)
app = FastAPI(title="VEYRA worker: hyworld", version="hyworld-2.0")
app.mount("/metrics", make_asgi_app())


class WorldRequest(BaseModel):
    jobId: str
    prompt: str
    seed: Optional[int] = None
    size: float = 20.0


class WorldResponse(BaseModel):
    workerJobId: str
    glb: dict[str, Any]
    preview: Optional[dict[str, Any]] = None
    environment: dict[str, Any]
    objects: list[dict[str, Any]]
    metadata: dict[str, Any]
    seed: int
    runtimeSeconds: float


def _auth(authorization: str) -> None:
    if authorization != f"Bearer {config.shared_secret}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "HEALTHY",
        "service": "hyworld",
        "gpu": config.gpu_available,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/cancel")
def cancel(_: dict[str, Any], authorization: str = Header(default="")) -> dict[str, bool]:
    _auth(authorization)
    return {"ok": True}


@app.post("/generate", response_model=WorldResponse)
def generate(req: WorldRequest, authorization: str = Header(default="")) -> WorldResponse:
    _auth(authorization)
    started = time.time()
    try:
        if config.gpu_available:  # pragma: no cover - GPU path
            raise NotImplementedError(
                "Enable the real HY-World model in Dockerfile.gpu after license + territory review"
            )
        glb, manifest, seed = generate_world(req.prompt, req.seed, max(8.0, min(64.0, req.size)))

        prefix = f"generated/{req.jobId}"
        glb_key = f"{prefix}/world.glb"
        manifest_key = f"{prefix}/scene.json"
        glb_size = storage.upload(glb_key, glb, "model/gltf-binary")
        storage.upload(manifest_key, json.dumps(manifest).encode("utf-8"), "application/json")

        WORLD_COUNT.labels("success").inc()
        return WorldResponse(
            workerJobId=req.jobId,
            glb={"key": glb_key, "sizeBytes": glb_size},
            environment=manifest["environment"],
            objects=manifest["objects"],
            metadata={**manifest["metadata"], "manifestKey": manifest_key},
            seed=seed,
            runtimeSeconds=round(time.time() - started, 3),
        )
    except HTTPException:
        WORLD_COUNT.labels("failed").inc()
        raise
    except Exception as exc:  # noqa: BLE001
        WORLD_COUNT.labels("failed").inc()
        raise HTTPException(status_code=500, detail=f"world generation failed: {exc}") from exc
