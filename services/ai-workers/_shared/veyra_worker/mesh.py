"""Mesh generation, GLB export, and quality metrics.

Includes a deterministic CPU procedural generator used as the documented
fallback when no GPU model is available (dev/CI). It is image-conditioned in a
lightweight way: the input image seeds the RNG and tints the mesh with the
image's average color, producing a valid, non-empty, watertight GLB. Real GPU
model outputs flow through the same export + metrics path.
"""
from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass, field

import numpy as np
import trimesh


@dataclass
class MeshMetrics:
    vertexCount: int = 0
    faceCount: int = 0
    triangleCount: int = 0
    materialCount: int = 0
    textureCount: int = 0
    hasUv: float = 0.0
    hasNormals: float = 0.0
    hasNaN: float = 0.0
    maxDimension: float = 0.0
    fileSizeBytes: int = 0
    bbox: list[float] = field(default_factory=list)


def _average_color(image_bytes: bytes) -> tuple[int, int, int]:
    """Best-effort dominant color; falls back to a neutral gray."""
    try:
        from PIL import Image  # Pillow is pulled in transitively by trimesh.

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = img.resize((16, 16))
        arr = np.asarray(img, dtype=np.float32).reshape(-1, 3)
        r, g, b = arr.mean(axis=0)
        return int(r), int(g), int(b)
    except Exception:
        return (180, 180, 190)


def _seed_from(image_bytes: bytes, seed: int | None) -> int:
    if seed is not None:
        return seed
    digest = hashlib.sha256(image_bytes).digest()
    return int.from_bytes(digest[:4], "big")


def procedural_mesh(
    image_bytes: bytes,
    seed: int | None = None,
    subdivisions: int = 3,
    target_polygons: int | None = None,
) -> tuple[trimesh.Trimesh, int]:
    """Generate a deterministic displaced icosphere tinted by the image."""
    resolved_seed = _seed_from(image_bytes, seed)
    rng = np.random.default_rng(resolved_seed)

    base = trimesh.creation.icosphere(subdivisions=subdivisions, radius=1.0)
    vertices = base.vertices.copy()

    # Radial displacement using a few random spherical harmonics-ish lobes so
    # each seed yields a distinct but smooth blob.
    normals = vertices / np.linalg.norm(vertices, axis=1, keepdims=True)
    disp = np.zeros(len(vertices))
    for _ in range(4):
        axis = rng.normal(size=3)
        axis /= np.linalg.norm(axis)
        amp = rng.uniform(0.05, 0.25)
        power = rng.integers(1, 4)
        disp += amp * np.power(np.clip(normals @ axis, 0, None), power)
    vertices = vertices * (1.0 + disp)[:, None]

    mesh = trimesh.Trimesh(vertices=vertices, faces=base.faces, process=True)

    if target_polygons and mesh.faces.shape[0] > target_polygons > 4:
        mesh = _decimate(mesh, target_polygons)

    color = _average_color(image_bytes)
    mesh.visual = trimesh.visual.ColorVisuals(
        mesh=mesh, vertex_colors=np.tile([*color, 255], (len(mesh.vertices), 1))
    )
    return mesh, resolved_seed


def _decimate(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    """Reduce face count. Uses trimesh's quadric decimation when the optional
    `fast_simplification` backend is present; otherwise degrades gracefully by
    returning the original mesh (the asset-worker handles heavy remeshing)."""
    try:
        simplified = mesh.simplify_quadric_decimation(target_faces)
        if simplified is not None and len(simplified.faces) > 0:
            return simplified
    except Exception:
        pass
    return mesh


def export_glb(mesh: trimesh.Trimesh) -> bytes:
    scene = trimesh.Scene(mesh)
    return scene.export(file_type="glb")


def compute_metrics(mesh: trimesh.Trimesh, glb_bytes: bytes) -> MeshMetrics:
    verts = np.asarray(mesh.vertices)
    faces = np.asarray(mesh.faces)
    has_nan = bool(np.isnan(verts).any())
    bounds = mesh.bounds  # (2,3)
    dims = (bounds[1] - bounds[0]) if bounds is not None else np.zeros(3)
    return MeshMetrics(
        vertexCount=int(len(verts)),
        faceCount=int(len(faces)),
        triangleCount=int(len(faces)),
        materialCount=1,
        textureCount=0,
        hasUv=1.0 if hasattr(mesh.visual, "uv") and getattr(mesh.visual, "uv") is not None else 0.0,
        hasNormals=1.0 if mesh.vertex_normals is not None and len(mesh.vertex_normals) else 0.0,
        hasNaN=1.0 if has_nan else 0.0,
        maxDimension=float(np.max(dims)) if dims.size else 0.0,
        fileSizeBytes=len(glb_bytes),
        bbox=[*bounds[0].tolist(), *bounds[1].tolist()] if bounds is not None else [],
    )
