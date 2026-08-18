"""VEYRA 3D shared AI-worker framework.

Provides a FastAPI base app (health/generate/cancel/metrics), worker
authentication, S3 I/O, GLB export, and mesh quality metrics so each model
worker only implements its generator.
"""

from .app import create_worker_app
from .schemas import GenerateRequest, GenerateResponse, OutputFile, Health

__all__ = [
    "create_worker_app",
    "GenerateRequest",
    "GenerateResponse",
    "OutputFile",
    "Health",
]
