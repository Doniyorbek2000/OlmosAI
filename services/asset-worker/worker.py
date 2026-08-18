"""VEYRA 3D asset-processing worker.

Applies mesh post-processing operations (center/normalize/decimate/remesh/
optimize/LOD/collider/convert) and the game-ready pipeline. Runs on CPU with
trimesh — no GPU required. Kept out of the main web API (spec §9).

Endpoints:
  GET  /health
  POST /process   (Bearer WORKER_SHARED_SECRET)
  GET  /metrics
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Optional

import trimesh
from fastapi import FastAPI, Header, HTTPException
from prometheus_client import Counter, make_asgi_app
from pydantic import BaseModel, Field

from veyra_worker.config import load_config
from veyra_worker.mesh import compute_metrics, export_glb
from veyra_worker.storage import WorkerStorage

from export_mesh import UnsupportedFormatError, export_mesh
from ops import PIPELINE_OPS, decimate, generate_collider

PROCESS_COUNT = Counter("veyra_asset_process_total", "Asset processes", ["outcome"])

config = load_config("asset-worker", "1")
storage = WorkerStorage(config)
app = FastAPI(title="VEYRA asset-worker", version="1")
app.mount("/metrics", make_asgi_app())


class Operation(BaseModel):
    op: str
    params: dict[str, Any] = Field(default_factory=dict)


class ProcessRequest(BaseModel):
    jobId: str
    sourceKey: str
    operations: list[Operation] = Field(default_factory=list)
    outputFormats: list[str] = Field(default_factory=lambda: ["GLB"])
    # Extra outputs.
    lodLevels: Optional[list[float]] = None
    generateCollider: bool = False


class OutputFile(BaseModel):
    format: str
    key: str
    sizeBytes: int
    role: str
    channel: Optional[str] = None


class ProcessResponse(BaseModel):
    workerJobId: str
    files: list[OutputFile]
    metrics: dict[str, float]
    runtimeSeconds: float


def _auth(authorization: str) -> None:
    if authorization != f"Bearer {config.shared_secret}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _load_mesh(data: bytes, source_key: str) -> trimesh.Trimesh:
    ext = source_key.rsplit(".", 1)[-1].lower() if "." in source_key else "glb"
    loaded = trimesh.load(trimesh.util.wrap_as_stream(data), file_type=ext, process=False)
    if isinstance(loaded, trimesh.Scene):
        if len(loaded.geometry) == 0:
            raise HTTPException(status_code=422, detail="source contains no geometry")
        loaded = trimesh.util.concatenate(tuple(loaded.geometry.values()))
    if not isinstance(loaded, trimesh.Trimesh) or len(loaded.faces) == 0:
        raise HTTPException(status_code=422, detail="source mesh is empty")
    return loaded


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "HEALTHY",
        "service": "asset-worker",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/process", response_model=ProcessResponse)
def process(req: ProcessRequest, authorization: str = Header(default="")) -> ProcessResponse:
    _auth(authorization)
    started = time.time()
    try:
        mesh = _load_mesh(storage.download(req.sourceKey), req.sourceKey)

        # Apply sequential pipeline operations.
        convert_format: Optional[str] = None
        for operation in req.operations:
            op = operation.op.upper()
            if op == "CONVERT_FORMAT":
                convert_format = str(operation.params.get("format", "GLB")).upper()
                continue
            if op in ("GENERATE_LOD", "GENERATE_COLLIDER"):
                continue  # handled as extra outputs below
            fn = PIPELINE_OPS.get(op)
            if fn is None:
                raise HTTPException(status_code=400, detail=f"unknown operation {op}")
            mesh = fn(mesh, operation.params)

        files: list[OutputFile] = []
        prefix = f"processed/{req.jobId}"

        # Main output(s).
        main_formats = [convert_format] if convert_format else req.outputFormats
        main_glb: bytes | None = None
        for fmt in main_formats:
            try:
                data, content_type, ext = export_mesh(mesh, fmt)
            except UnsupportedFormatError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            key = f"{prefix}/model.{ext}"
            size = storage.upload(key, data, content_type)
            files.append(OutputFile(format=fmt.upper(), key=key, sizeBytes=size, role="model"))
            if fmt.upper() == "GLB":
                main_glb = data

        # LOD chain.
        if req.lodLevels:
            for i, fraction in enumerate(req.lodLevels):
                target = max(4, int(len(mesh.faces) * float(fraction)))
                lod = decimate(mesh, {"targetFaces": target})
                data = export_glb(lod)
                key = f"{prefix}/lod_{i}.glb"
                size = storage.upload(key, data, "model/gltf-binary")
                files.append(
                    OutputFile(format="GLB", key=key, sizeBytes=size, role="model", channel=f"lod{i}")
                )

        # Collider.
        if req.generateCollider:
            collider = generate_collider(mesh, {})
            data = export_glb(collider)
            key = f"{prefix}/collider.glb"
            size = storage.upload(key, data, "model/gltf-binary")
            files.append(
                OutputFile(format="GLB", key=key, sizeBytes=size, role="model", channel="collider")
            )

        # Metrics from the main GLB (or a freshly exported one).
        glb = main_glb if main_glb is not None else export_glb(mesh)
        metrics = compute_metrics(mesh, glb)

        PROCESS_COUNT.labels("success").inc()
        return ProcessResponse(
            workerJobId=req.jobId,
            files=files,
            metrics={
                "vertexCount": metrics.vertexCount,
                "faceCount": metrics.faceCount,
                "triangleCount": metrics.triangleCount,
                "materialCount": metrics.materialCount,
                "textureCount": metrics.textureCount,
                "hasNormals": metrics.hasNormals,
                "hasNaN": metrics.hasNaN,
                "maxDimension": metrics.maxDimension,
                "fileSizeBytes": metrics.fileSizeBytes,
            },
            runtimeSeconds=round(time.time() - started, 3),
        )
    except HTTPException:
        PROCESS_COUNT.labels("failed").inc()
        raise
    except Exception as exc:  # noqa: BLE001
        PROCESS_COUNT.labels("failed").inc()
        raise HTTPException(status_code=500, detail=f"processing failed: {exc}") from exc
