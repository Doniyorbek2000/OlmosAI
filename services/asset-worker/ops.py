"""Mesh post-processing operations (trimesh). Each op takes a Trimesh and params
and returns a new Trimesh (or, for multi-output ops, is handled by the worker).

Ops that need external tooling (UV unwrap via xatlas, texture baking via Blender)
degrade gracefully when the tool is absent and are documented as best-effort.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import trimesh

from veyra_worker.mesh import _decimate  # shared quadric-decimation helper


def center_model(mesh: trimesh.Trimesh, _params: dict[str, Any]) -> trimesh.Trimesh:
    m = mesh.copy()
    m.apply_translation(-m.bounding_box.centroid)
    return m


def normalize_scale(mesh: trimesh.Trimesh, params: dict[str, Any]) -> trimesh.Trimesh:
    target = float(params.get("targetSize", 2.0))
    m = mesh.copy()
    extent = float(np.max(m.extents)) if m.extents is not None else 0.0
    if extent > 1e-9:
        m.apply_scale(target / extent)
    return m


def auto_orient(mesh: trimesh.Trimesh, _params: dict[str, Any]) -> trimesh.Trimesh:
    """Center on XY and sit the model on the ground plane (min Y = 0)."""
    m = mesh.copy()
    m.apply_translation(-m.bounding_box.centroid)
    bounds = m.bounds
    if bounds is not None:
        m.apply_translation([0.0, -bounds[0][1], 0.0])
    return m


def remove_floaters(mesh: trimesh.Trimesh, params: dict[str, Any]) -> trimesh.Trimesh:
    """Keep connected components whose face count is >= fraction of the largest."""
    fraction = float(params.get("minFraction", 0.05))
    parts = mesh.split(only_watertight=False)
    if len(parts) <= 1:
        return mesh
    largest = max(len(p.faces) for p in parts)
    kept = [p for p in parts if len(p.faces) >= fraction * largest]
    if not kept:
        return mesh
    return trimesh.util.concatenate(kept)


def recalculate_normals(mesh: trimesh.Trimesh, _params: dict[str, Any]) -> trimesh.Trimesh:
    m = mesh.copy()
    m.fix_normals()
    return m


def smooth(mesh: trimesh.Trimesh, params: dict[str, Any]) -> trimesh.Trimesh:
    iterations = int(params.get("iterations", 1))
    m = mesh.copy()
    try:
        trimesh.smoothing.filter_laplacian(m, iterations=max(1, iterations))
    except Exception:
        pass
    return m


def decimate(mesh: trimesh.Trimesh, params: dict[str, Any]) -> trimesh.Trimesh:
    target = int(params.get("targetFaces") or params.get("targetPolygons") or 0)
    if target <= 0 or len(mesh.faces) <= target:
        return mesh
    return _decimate(mesh, target)


def remesh(mesh: trimesh.Trimesh, params: dict[str, Any]) -> trimesh.Trimesh:
    """Voxel remesh (uniform topology) or subdivision up-res."""
    mode = params.get("mode", "voxel")
    m = mesh.copy()
    if mode == "subdivide":
        max_edge = float(params.get("maxEdge", float(np.max(m.extents)) / 50.0))
        v, f = trimesh.remesh.subdivide_to_size(m.vertices, m.faces, max_edge=max_edge)
        return trimesh.Trimesh(vertices=v, faces=f, process=True)
    # voxel remesh
    pitch = float(params.get("pitch", float(np.max(m.extents)) / 64.0))
    if pitch <= 1e-9:
        return m
    try:
        vox = m.voxelized(pitch=pitch)
        remeshed = vox.marching_cubes
        if remeshed is not None and len(remeshed.faces) > 0:
            return remeshed
    except Exception:
        pass
    return m


def optimize(mesh: trimesh.Trimesh, _params: dict[str, Any]) -> trimesh.Trimesh:
    m = mesh.copy()
    m.merge_vertices()
    m.remove_infinite_values()
    m.update_faces(m.nondegenerate_faces())
    m.update_faces(m.unique_faces())
    m.remove_unreferenced_vertices()
    m.process(validate=True)
    return m


def generate_uv(mesh: trimesh.Trimesh, _params: dict[str, Any]) -> trimesh.Trimesh:
    """Best-effort UV unwrap via xatlas when available; otherwise a no-op."""
    try:
        unwrapped = mesh.unwrap()  # requires xatlas
        return unwrapped
    except Exception:
        return mesh


def bake_texture(mesh: trimesh.Trimesh, _params: dict[str, Any]) -> trimesh.Trimesh:
    """Placeholder: real PBR baking requires Blender/renderer (asset-worker GPU
    profile). No-op here; documented in README."""
    return mesh


def generate_collider(mesh: trimesh.Trimesh, _params: dict[str, Any]) -> trimesh.Trimesh:
    """Convex hull collider (separate output)."""
    return mesh.convex_hull


# Single-in single-out ops usable in a sequential pipeline.
PIPELINE_OPS = {
    "AUTO_ORIENT": auto_orient,
    "CENTER_MODEL": center_model,
    "NORMALIZE_SCALE": normalize_scale,
    "REMOVE_FLOATERS": remove_floaters,
    "RECALCULATE_NORMALS": recalculate_normals,
    "SMOOTH": smooth,
    "DECIMATE": decimate,
    "REMESH": remesh,
    "OPTIMIZE": optimize,
    "GENERATE_UV": generate_uv,
    "BAKE_TEXTURE": bake_texture,
}
