"""Worker configuration from environment. Fails fast on missing required vars."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class WorkerConfig:
    provider_id: str
    model_version: str
    shared_secret: str
    s3_endpoint: str
    s3_region: str
    s3_bucket: str
    s3_access_key: str
    s3_secret_key: str
    s3_force_path_style: bool
    result_prefix: str
    # Whether a real GPU model is available; when False the worker uses its
    # documented CPU procedural fallback (dev/CI only).
    gpu_available: bool


def load_config(provider_id: str, model_version: str) -> WorkerConfig:
    def require(key: str) -> str:
        val = os.environ.get(key)
        if not val:
            raise RuntimeError(f"Missing required environment variable: {key}")
        return val

    return WorkerConfig(
        provider_id=provider_id,
        model_version=model_version,
        shared_secret=require("WORKER_SHARED_SECRET"),
        s3_endpoint=require("S3_ENDPOINT"),
        s3_region=os.environ.get("S3_REGION", "us-east-1"),
        s3_bucket=require("S3_BUCKET"),
        s3_access_key=require("S3_ACCESS_KEY_ID"),
        s3_secret_key=require("S3_SECRET_ACCESS_KEY"),
        s3_force_path_style=os.environ.get("S3_FORCE_PATH_STYLE", "true").lower()
        in ("1", "true"),
        result_prefix=os.environ.get("WORKER_RESULT_PREFIX", "generated"),
        gpu_available=os.environ.get("WORKER_GPU_AVAILABLE", "false").lower()
        in ("1", "true"),
    )
