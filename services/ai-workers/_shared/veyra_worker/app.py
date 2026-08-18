"""FastAPI worker app factory.

A concrete worker supplies a `MeshGenerator` — a callable that turns input
image bytes + the request into a trimesh mesh (and the seed actually used). The
framework owns S3 download/upload, GLB export, metrics, progress reporting, and
auth, so each model worker stays tiny.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Callable, Protocol

import trimesh
from fastapi import Depends, FastAPI, Header, HTTPException
from prometheus_client import Counter, Histogram, make_asgi_app

from .config import WorkerConfig, load_config
from .mesh import compute_metrics, export_glb
from .progress import report_progress
from .schemas import CancelRequest, GenerateRequest, GenerateResponse, Health, OutputFile
from .storage import WorkerStorage

GEN_COUNT = Counter("veyra_worker_generations_total", "Generations", ["provider", "outcome"])
GEN_DURATION = Histogram("veyra_worker_generation_seconds", "Generation duration", ["provider"])


class MeshGenerator(Protocol):
    def __call__(
        self, image_bytes: bytes, request: GenerateRequest, config: WorkerConfig
    ) -> tuple[trimesh.Trimesh, int]: ...


def create_worker_app(
    *,
    provider_id: str,
    model_version: str,
    generator: MeshGenerator,
    health_probe: Callable[[WorkerConfig], Health] | None = None,
) -> FastAPI:
    config = load_config(provider_id, model_version)
    storage = WorkerStorage(config)
    app = FastAPI(title=f"VEYRA worker: {provider_id}", version=model_version)
    cancelled: set[str] = set()

    def auth(authorization: str = Header(default="")) -> None:
        expected = f"Bearer {config.shared_secret}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/health", response_model=Health)
    def health() -> Health:
        now = datetime.now(timezone.utc).isoformat()
        if health_probe is not None:
            h = health_probe(config)
            h.checkedAt = now
            return h
        return Health(
            status="HEALTHY",
            message="procedural fallback" if not config.gpu_available else "gpu ready",
            checkedAt=now,
            queueDepth=0,
        )

    app.mount("/metrics", make_asgi_app())

    @app.post("/cancel")
    def cancel(body: CancelRequest, _: None = Depends(auth)) -> dict[str, bool]:
        cancelled.add(body.workerJobId)
        return {"ok": True}

    @app.post("/generate", response_model=GenerateResponse)
    async def generate(req: GenerateRequest, _: None = Depends(auth)) -> GenerateResponse:
        if not req.images:
            raise HTTPException(status_code=400, detail="at least one image is required")

        started = time.time()
        secret = config.shared_secret
        try:
            await report_progress(req.progressCallbackUrl, req.jobId, 10, "PREPROCESS", secret,
                                  "Fetching input")
            image_bytes = storage.download(req.images[0].key)

            if req.jobId in cancelled:
                raise HTTPException(status_code=409, detail="cancelled")

            await report_progress(req.progressCallbackUrl, req.jobId, 35, "SHAPE_GENERATION",
                                  secret, "Generating geometry")
            with GEN_DURATION.labels(provider_id).time():
                mesh, seed = generator(image_bytes, req, config)

            await report_progress(req.progressCallbackUrl, req.jobId, 80, "POSTPROCESS", secret,
                                  "Exporting GLB")
            glb = export_glb(mesh)
            metrics = compute_metrics(mesh, glb)

            result_key = f"{config.result_prefix}/{req.jobId}/model.glb"
            size = storage.upload(result_key, glb, "model/gltf-binary")

            await report_progress(req.progressCallbackUrl, req.jobId, 98, "FINALIZE", secret,
                                  "Finalizing")
            GEN_COUNT.labels(provider_id, "success").inc()
            return GenerateResponse(
                workerJobId=req.jobId,
                files=[OutputFile(format="GLB", key=result_key, sizeBytes=size, role="model")],
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
                seed=seed,
                runtimeSeconds=round(time.time() - started, 3),
            )
        except HTTPException:
            GEN_COUNT.labels(provider_id, "failed").inc()
            raise
        except Exception as exc:  # noqa: BLE001
            GEN_COUNT.labels(provider_id, "failed").inc()
            raise HTTPException(status_code=500, detail=f"generation failed: {exc}") from exc
        finally:
            cancelled.discard(req.jobId)

    return app
