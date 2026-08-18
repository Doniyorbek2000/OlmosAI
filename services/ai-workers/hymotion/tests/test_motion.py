"""Motion clip + animated-GLB generation, and the /generate endpoint."""
import importlib
import io
import os

import pygltflib
import pytest
import trimesh

import motion


def test_clip_is_deterministic_and_shaped():
    a = motion.generate_clip("a knight waving", 7, 2.0, 24)
    b = motion.generate_clip("a knight waving", 7, 2.0, 24)
    assert a.frame_count == b.frame_count == 48
    assert a.rotations.shape == (48, len(motion.JOINTS), 4)
    assert (a.rotations == b.rotations).all()
    assert a.style == "idle"  # "waving" triggers walk-ish? no — check below


def test_walk_style_detected():
    clip = motion.generate_clip("character walking forward", None, 1.0, 30)
    assert clip.style == "walk"


def test_animated_glb_is_valid_and_has_animation():
    clip = motion.generate_clip("idle pose", 3, 1.0, 24)
    glb = motion.build_animated_glb(clip)
    assert glb[:4] == b"glTF"
    g = pygltflib.GLTF2.load_from_bytes(glb)
    assert len(g.animations) == 1
    # One rotation channel per joint + one root translation channel.
    assert len(g.animations[0].channels) == len(motion.JOINTS) + 1
    loaded = trimesh.load(io.BytesIO(glb), file_type="glb")
    assert loaded is not None


def test_clip_json_roundtrips():
    clip = motion.generate_clip("dance", 1, 0.5, 24)
    j = motion.clip_to_json(clip)
    assert j["frameCount"] == len(j["rotations"])
    assert "joints" in j["skeleton"]


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
    res = tc.post("/generate", json={"jobId": "j", "prompt": "hi"})
    assert res.status_code == 401


def test_generate_produces_animation_and_clip(client):
    tc, uploaded = client
    res = tc.post(
        "/generate",
        headers={"authorization": "Bearer test-secret"},
        json={"jobId": "job-1", "prompt": "a character walking", "durationSeconds": 2, "fps": 24},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["frameCount"] == 48
    formats = {f["format"] for f in body["files"]}
    assert "GLB" in formats and "JSON" in formats
    glb_key = next(f["key"] for f in body["files"] if f["format"] == "GLB")
    assert uploaded[glb_key][:4] == b"glTF"
    assert "joints" in body["skeleton"]
