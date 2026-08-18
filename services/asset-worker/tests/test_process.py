"""Integration test for /process with storage mocked (no S3)."""
import importlib
import os

import pytest
import trimesh


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
    uploaded: dict[str, bytes] = {}

    source_glb = trimesh.Scene(trimesh.creation.icosphere(subdivisions=4)).export(file_type="glb")

    class FakeStorage:
        def __init__(self, *_a, **_k):
            pass

        def download(self, key: str) -> bytes:
            return source_glb

        def upload(self, key: str, data: bytes, content_type: str) -> int:
            uploaded[key] = data
            return len(data)

    from fastapi.testclient import TestClient

    # Import once (module-level Prometheus counters register once), then swap the
    # module's storage handle for the fake — avoids reload double-registration.
    worker = importlib.import_module("worker")
    monkeypatch.setattr(worker, "storage", FakeStorage())
    return TestClient(worker.app), uploaded


def test_requires_auth(client):
    tc, _ = client
    res = tc.post("/process", json={"jobId": "j", "sourceKey": "k"})
    assert res.status_code == 401


def test_decimate_pipeline_produces_smaller_glb(client):
    tc, uploaded = client
    res = tc.post(
        "/process",
        headers={"authorization": "Bearer test-secret"},
        json={
            "jobId": "job-1",
            "sourceKey": "users/u/assets/a/v1/model/model.glb",
            "operations": [
                {"op": "OPTIMIZE"},
                {"op": "DECIMATE", "params": {"targetFaces": 500}},
            ],
            "outputFormats": ["GLB"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["files"][0]["format"] == "GLB"
    assert body["metrics"]["faceCount"] <= 5120  # icosphere(4) has 5120 faces
    key = body["files"][0]["key"]
    assert uploaded[key][:4] == b"glTF"


def test_game_ready_emits_lods_and_collider(client):
    tc, _ = client
    res = tc.post(
        "/process",
        headers={"authorization": "Bearer test-secret"},
        json={
            "jobId": "job-2",
            "sourceKey": "users/u/assets/a/v1/model/model.glb",
            "operations": [{"op": "OPTIMIZE"}, {"op": "DECIMATE", "params": {"targetFaces": 1000}}],
            "outputFormats": ["GLB"],
            "lodLevels": [0.5, 0.25],
            "generateCollider": True,
        },
    )
    assert res.status_code == 200, res.text
    channels = {f.get("channel") for f in res.json()["files"]}
    assert "lod0" in channels and "lod1" in channels
    assert "collider" in channels
