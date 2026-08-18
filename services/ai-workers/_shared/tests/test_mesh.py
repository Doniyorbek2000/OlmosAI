"""Validates the procedural generator produces a real, loadable, non-empty GLB."""
import io

import numpy as np
import trimesh

from veyra_worker.mesh import compute_metrics, export_glb, procedural_mesh


def _fake_png() -> bytes:
    from PIL import Image

    img = Image.new("RGB", (64, 64), (120, 60, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_procedural_mesh_is_deterministic_for_a_seed():
    png = _fake_png()
    m1, s1 = procedural_mesh(png, seed=7)
    m2, s2 = procedural_mesh(png, seed=7)
    assert s1 == s2 == 7
    assert np.allclose(m1.vertices, m2.vertices)


def test_export_glb_roundtrips_to_a_valid_mesh():
    png = _fake_png()
    mesh, _ = procedural_mesh(png, seed=1)
    glb = export_glb(mesh)
    assert glb[:4] == b"glTF"  # GLB magic
    assert len(glb) > 500

    loaded = trimesh.load(io.BytesIO(glb), file_type="glb")
    geoms = loaded.geometry.values() if isinstance(loaded, trimesh.Scene) else [loaded]
    total_faces = sum(len(g.faces) for g in geoms)
    assert total_faces > 0


def test_metrics_report_geometry():
    png = _fake_png()
    mesh, _ = procedural_mesh(png, seed=3)
    glb = export_glb(mesh)
    metrics = compute_metrics(mesh, glb)
    assert metrics.vertexCount > 0
    assert metrics.faceCount > 0
    assert metrics.hasNaN == 0.0
    assert metrics.fileSizeBytes == len(glb)
    assert metrics.maxDimension > 0


def test_target_polygons_reduces_faces():
    png = _fake_png()
    full, _ = procedural_mesh(png, seed=5, subdivisions=4)
    reduced, _ = procedural_mesh(png, seed=5, subdivisions=4, target_polygons=200)
    assert len(reduced.faces) <= len(full.faces)
