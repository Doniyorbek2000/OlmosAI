"""Integration test for the worker FastAPI app with storage mocked (no S3/GPU)."""
import io
import os

import pytest


@pytest.fixture()
def client(monkeypatch):
    os.environ.update(
        {
            "WORKER_SHARED_SECRET": "test-secret",
            "S3_ENDPOINT": "http://localhost:9000",
            "S3_BUCKET": "veyra-assets",
            "S3_ACCESS_KEY_ID": "x",
            "S3_SECRET_ACCESS_KEY": "y",
        }
    )
    # Patch the S3 client so no network/boto is required.
    from veyra_worker import storage as storage_mod

    uploaded: dict[str, bytes] = {}

    def fake_png() -> bytes:
        from PIL import Image

        img = Image.new("RGB", (32, 32), (10, 200, 90))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    class FakeStorage:
        def __init__(self, *_a, **_k):
            pass

        def download(self, key: str) -> bytes:
            return fake_png()

        def upload(self, key: str, data: bytes, content_type: str) -> int:
            uploaded[key] = data
            return len(data)

    monkeypatch.setattr(storage_mod, "WorkerStorage", FakeStorage)

    # app.py binds WorkerStorage by name at import; patch that reference too so
    # create_worker_app() instantiates the fake. Do NOT reload app.py (its
    # module-level Prometheus metrics would double-register).
    import importlib

    from fastapi.testclient import TestClient

    import veyra_worker.app as app_mod

    monkeypatch.setattr(app_mod, "WorkerStorage", FakeStorage)

    worker = importlib.import_module("triposr.worker")
    worker = importlib.reload(worker)  # re-run create_worker_app with the fake
    return TestClient(worker.app), uploaded


def test_health_is_open(client):
    tc, _ = client
    res = tc.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "HEALTHY"


def test_generate_requires_auth(client):
    tc, _ = client
    res = tc.post("/generate", json={"jobId": "j1", "images": [{"key": "k"}]})
    assert res.status_code == 401


def test_generate_produces_a_glb(client):
    tc, uploaded = client
    res = tc.post(
        "/generate",
        headers={"authorization": "Bearer test-secret"},
        json={"jobId": "job-123", "images": [{"key": "users/u/uploads/x/in.png"}]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["workerJobId"] == "job-123"
    assert body["files"][0]["format"] == "GLB"
    assert body["metrics"]["faceCount"] > 0
    # The GLB was uploaded to storage.
    key = body["files"][0]["key"]
    assert key in uploaded
    assert uploaded[key][:4] == b"glTF"
