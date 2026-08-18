"""S3-compatible object I/O for workers (boto3)."""
from __future__ import annotations

import boto3
from botocore.client import Config

from .config import WorkerConfig


class WorkerStorage:
    def __init__(self, config: WorkerConfig):
        self._bucket = config.s3_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=config.s3_endpoint,
            region_name=config.s3_region,
            aws_access_key_id=config.s3_access_key,
            aws_secret_access_key=config.s3_secret_key,
            config=Config(
                s3={"addressing_style": "path" if config.s3_force_path_style else "auto"},
                signature_version="s3v4",
            ),
        )

    def download(self, key: str) -> bytes:
        resp = self._client.get_object(Bucket=self._bucket, Key=key)
        return resp["Body"].read()

    def upload(self, key: str, data: bytes, content_type: str) -> int:
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
        )
        return len(data)
