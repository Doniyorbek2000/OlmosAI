"""Pydantic schemas shared with the Node adapter (packages/ai-sdk worker-transport)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ImageRef(BaseModel):
    key: str
    view: Optional[str] = None


class GenerateRequest(BaseModel):
    jobId: str
    images: list[ImageRef] = Field(default_factory=list)
    quality: str = "STANDARD"
    requirePbr: bool = False
    targetPolygons: Optional[int] = None
    outputFormats: list[str] = Field(default_factory=lambda: ["GLB"])
    seed: Optional[int] = None
    params: Optional[dict[str, Any]] = None
    progressCallbackUrl: Optional[str] = None


class OutputFile(BaseModel):
    format: str
    key: str
    sizeBytes: int
    role: Literal["model", "texture", "metadata", "preview"]
    channel: Optional[str] = None


class GenerateResponse(BaseModel):
    workerJobId: str
    files: list[OutputFile]
    metrics: dict[str, float] = Field(default_factory=dict)
    seed: Optional[int] = None
    runtimeSeconds: float


class Health(BaseModel):
    status: Literal["HEALTHY", "DEGRADED", "UNHEALTHY"]
    freeVramMb: Optional[float] = None
    queueDepth: int = 0
    latencyMs: float = 0
    message: Optional[str] = None
    checkedAt: str


class CancelRequest(BaseModel):
    workerJobId: str
