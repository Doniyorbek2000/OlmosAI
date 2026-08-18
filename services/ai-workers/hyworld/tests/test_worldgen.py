"""World generation + the /generate endpoint."""
import importlib
import io
import json
import os

import pytest
import trimesh

import worldgen


def test_world_is_deterministic_and_composited():
    glb1, m1, s1 = worldgen.generate_world("a forest valley", 7, 20.0)
    glb2, m2, s2 = worldgen.generate_world("a forest valley", 7, 20.0)
    assert s1 == s2 == 7
    assert glb1 == glb2  # deterministic bytes
    assert m1["objects"] == m2["objects"]


def test_world_glb_loads_with_multiple_geometries():
    glb, manifest, _ = worldgen.generate_world("rocky desert", 3, 24.0)
    assert glb[:4] == b"glTF"
    scene = trimesh.load(io.BytesIO(glb), file_type="glb")
    assert isinstance(scene, trimesh.Scene)
    assert len(scene.geometry) >= 2  # terrain + objects


def test_manifest_has_terrain_lights_camera_environment():
    _, manifest, _ = worldgen.generate_world("island", 5, 20.0)
    types = {o["type"] for o in manifest["objects"]}
    assert {"TERRAIN", "MESH", "LIGHT", "CAMERA", "ENVIRONMENT"}.issubset(types)
    assert "skybox" in manifest["environment"]


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

    class FakeStorage:
        def __init__(self, *_a, **_k):
            pass

        def upload(self, key, data, content_type):
            uploaded[key] = data
            return len(data)

    from fastapi.testclient import TestClient

    worker = importlib.import_module("worker")
    monkeypatch.setattr(worker, "storage", FakeStorage())
    return TestClient(worker.app), uploaded


def test_generate_requires_auth(client):
    tc, _ = client
    assert tc.post("/generate", json={"jobId": "j", "prompt": "x"}).status_code == 401


def test_generate_uploads_world_and_manifest(client):
    tc, uploaded = client
    res = tc.post(
        "/generate",
        headers={"authorization": "Bearer test-secret"},
        json={"jobId": "job-1", "prompt": "a misty forest", "size": 20},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["glb"]["sizeBytes"] > 0
    assert any(o["type"] == "TERRAIN" for o in body["objects"])
    glb_key = body["glb"]["key"]
    assert uploaded[glb_key][:4] == b"glTF"
    manifest_key = body["metadata"]["manifestKey"]
    assert json.loads(uploaded[manifest_key])["objects"]
