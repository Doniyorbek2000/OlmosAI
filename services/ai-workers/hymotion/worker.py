"""VEYRA 3D HY-Motion worker — TEXT → CHARACTER MOTION (Phase 9).

Isolated GPU worker. When the real HY-Motion model + weights are present
(WORKER_GPU_AVAILABLE=true) it generates SMPL motion and retargets it to the
rig; otherwise it uses a deterministic CPU procedural clip so the pipeline runs
end-to-end without a GPU (dev/CI). Either way it uploads an animated GLB + a
portable motion-clip JSON + skeleton.

Upstream: https://github.com/Tencent-Hunyuan/HY-Motion-1.0
LICENSE: Tencent HY-MOTION 1.0 Community (geo-excludes EU/UK/KR; <1M MAU).
Disabled in production — see docs/model-registry.md.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException
from prometheus_client import Counter, make_asgi_app
from pydantic import BaseModel, Field

from veyra_worker.config import load_config
from veyra_worker.storage import WorkerStorage

from motion import build_animated_glb, generate_clip, clip_to_json

MOTION_COUNT = Counter("veyra_hymotion_total", "Motion generations", ["outcome"])

config = load_config("hymotion", "hymotion-1.0")
storage = WorkerStorage(config)
app = FastAPI(title="VEYRA worker: hymotion", version="hymotion-1.0")
app.mount("/metrics", make_asgi_app())


class MotionRequest(BaseModel):
    jobId: str
    prompt: str
    durationSeconds: float = 3.0
    fps: int = 24
    seed: Optional[int] = None
    outputFormats: list[str] = Field(default_factory=lambda: ["GLB"])


class OutputFile(BaseModel):
    format: str
    key: str
    sizeBytes: int
    role: str
    channel: Optional[str] = None


class MotionResponse(BaseModel):
    workerJobId: str
    files: list[OutputFile]
    skeleton: dict[str, Any]
    durationSeconds: float
    fps: int
    frameCount: int
    seed: int
    runtimeSeconds: float


def _auth(authorization: str) -> None:
    if authorization != f"Bearer {config.shared_secret}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "HEALTHY",
        "service": "hymotion",
        "gpu": config.gpu_available,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/cancel")
def cancel(_: dict[str, Any], authorization: str = Header(default="")) -> dict[str, bool]:
    _auth(authorization)
    return {"ok": True}


@app.post("/generate", response_model=MotionResponse)
def generate(req: MotionRequest, authorization: str = Header(default="")) -> MotionResponse:
    _auth(authorization)
    started = time.time()
    try:
        duration = max(0.2, min(30.0, req.durationSeconds))
        fps = max(6, min(60, req.fps))

        if config.gpu_available:  # pragma: no cover - GPU path
            clip = _generate_real(req.prompt, req.seed, duration, fps)
        else:
            clip = generate_clip(req.prompt, req.seed, duration, fps)

        glb = build_animated_glb(clip)
        clip_json = json.dumps(clip_to_json(clip)).encode("utf-8")

        prefix = f"generated/{req.jobId}"
        glb_key = f"{prefix}/animation.glb"
        clip_key = f"{prefix}/motion.json"
        glb_size = storage.upload(glb_key, glb, "model/gltf-binary")
        clip_size = storage.upload(clip_key, clip_json, "application/json")

        MOTION_COUNT.labels("success").inc()
        return MotionResponse(
            workerJobId=req.jobId,
            files=[
                OutputFile(format="GLB", key=glb_key, sizeBytes=glb_size, role="model", channel="animation"),
                OutputFile(format="JSON", key=clip_key, sizeBytes=clip_size, role="metadata", channel="clip"),
            ],
            skeleton=clip.skeleton,
            durationSeconds=clip.duration,
            fps=clip.fps,
            frameCount=clip.frame_count,
            seed=clip.seed,
            runtimeSeconds=round(time.time() - started, 3),
        )
    except HTTPException:
        MOTION_COUNT.labels("failed").inc()
        raise
    except Exception as exc:  # noqa: BLE001
        MOTION_COUNT.labels("failed").inc()
        raise HTTPException(status_code=500, detail=f"motion generation failed: {exc}") from exc


def _generate_real(prompt: str, seed: Optional[int], duration: float, fps: int):  # pragma: no cover
    """Load HY-Motion, sample SMPL motion for the prompt, retarget to the rig.
    Implement against the pinned upstream commit; see MODEL.md. Falls back to the
    procedural clip if the model/weights are unavailable."""
    raise NotImplementedError(
        "Enable the real HY-Motion model in Dockerfile.gpu after license + territory review"
    )
