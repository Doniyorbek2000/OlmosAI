"""Unit tests for mesh operations against a real mesh."""
import numpy as np
import trimesh

import ops
from export_mesh import export_mesh, UnsupportedFormatError


def box() -> trimesh.Trimesh:
    return trimesh.creation.box(extents=[2.0, 3.0, 4.0])


def sphere() -> trimesh.Trimesh:
    return trimesh.creation.icosphere(subdivisions=4)  # ~5k faces


def test_center_model_moves_centroid_to_origin():
    m = box()
    m.apply_translation([10, 20, 30])
    out = ops.center_model(m, {})
    assert np.allclose(out.bounding_box.centroid, [0, 0, 0], atol=1e-6)


def test_normalize_scale_sets_max_extent():
    out = ops.normalize_scale(box(), {"targetSize": 1.0})
    assert abs(float(np.max(out.extents)) - 1.0) < 1e-6


def test_auto_orient_sits_on_ground():
    out = ops.auto_orient(box(), {})
    assert abs(out.bounds[0][1]) < 1e-6  # min Y ~ 0


def test_decimate_reduces_faces():
    s = sphere()
    out = ops.decimate(s, {"targetFaces": 500})
    assert len(out.faces) <= len(s.faces)


def test_optimize_keeps_valid_geometry():
    out = ops.optimize(sphere(), {})
    assert len(out.faces) > 0
    assert not np.isnan(out.vertices).any()


def test_remove_floaters_keeps_largest_component():
    big = sphere()
    tiny = trimesh.creation.icosphere(subdivisions=1)
    tiny.apply_translation([10, 0, 0])
    combined = trimesh.util.concatenate([big, tiny])
    out = ops.remove_floaters(combined, {"minFraction": 0.5})
    assert len(out.faces) < len(combined.faces)


def test_generate_collider_is_convex():
    out = ops.generate_collider(sphere(), {})
    assert out.is_convex


def test_export_glb_and_obj():
    glb, ct, ext = export_mesh(box(), "GLB")
    assert glb[:4] == b"glTF" and ext == "glb"
    obj, _, ext2 = export_mesh(box(), "OBJ")
    assert b"v " in obj and ext2 == "obj"


def test_export_fbx_is_rejected():
    try:
        export_mesh(box(), "FBX")
        assert False, "expected UnsupportedFormatError"
    except UnsupportedFormatError:
        pass
