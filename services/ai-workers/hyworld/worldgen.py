"""Procedural 3D-world generation: a displaced terrain + scattered scene objects
composited into a single glTF scene, plus a scene manifest (objects, lights,
cameras, environment). CPU fallback for dev/CI; the real HY-World GPU path
(MODEL.md) produces panorama→3DGS/mesh worlds and flows through the same
manifest + GLB export.
"""
from __future__ import annotations

import hashlib
import math

import numpy as np
import trimesh


def seed_from(prompt: str, seed: int | None) -> int:
    if seed is not None:
        return seed
    return int.from_bytes(hashlib.sha256(prompt.encode()).digest()[:4], "big")


def _terrain(rng: np.random.Generator, size: float, resolution: int) -> trimesh.Trimesh:
    xs = np.linspace(-size / 2, size / 2, resolution)
    zs = np.linspace(-size / 2, size / 2, resolution)
    gx, gz = np.meshgrid(xs, zs)
    height = np.zeros_like(gx)
    for _ in range(4):
        fx, fz = rng.uniform(0.1, 0.6, size=2)
        amp = rng.uniform(0.3, 1.2)
        phase = rng.uniform(0, math.tau)
        height += amp * np.sin(gx * fx + phase) * np.cos(gz * fz + phase)
    vertices = np.column_stack([gx.ravel(), height.ravel(), gz.ravel()])

    faces = []
    for r in range(resolution - 1):
        for c in range(resolution - 1):
            i = r * resolution + c
            faces.append([i, i + resolution, i + 1])
            faces.append([i + 1, i + resolution, i + resolution + 1])
    mesh = trimesh.Trimesh(vertices=vertices, faces=np.array(faces), process=True)
    mesh.visual = trimesh.visual.ColorVisuals(
        mesh=mesh, vertex_colors=np.tile([90, 130, 80, 255], (len(mesh.vertices), 1))
    )
    return mesh, height


def _terrain_height_at(height: np.ndarray, size: float, x: float, z: float, resolution: int) -> float:
    ci = int((x + size / 2) / size * (resolution - 1))
    ri = int((z + size / 2) / size * (resolution - 1))
    ci = max(0, min(resolution - 1, ci))
    ri = max(0, min(resolution - 1, ri))
    return float(height[ri, ci])


def generate_world(prompt: str, seed: int | None, size: float = 20.0):
    """Returns (glb_bytes, manifest dict, resolved_seed)."""
    resolved = seed_from(prompt, seed)
    rng = np.random.default_rng(resolved)
    resolution = 48

    scene = trimesh.Scene()
    terrain, height = _terrain(rng, size, resolution)
    scene.add_geometry(terrain, node_name="terrain")

    objects: list[dict] = [
        {
            "type": "TERRAIN",
            "name": "terrain",
            "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "data": {"size": size, "resolution": resolution},
        }
    ]

    # Scatter scene objects (trees as cones, rocks as icospheres, structures as boxes).
    kinds = ["tree", "rock", "structure"]
    count = int(rng.integers(6, 14))
    for i in range(count):
        kind = kinds[int(rng.integers(0, len(kinds)))]
        x = float(rng.uniform(-size / 2 + 2, size / 2 - 2))
        z = float(rng.uniform(-size / 2 + 2, size / 2 - 2))
        y = _terrain_height_at(height, size, x, z, resolution)
        if kind == "tree":
            geo = trimesh.creation.cone(radius=rng.uniform(0.4, 0.8), height=rng.uniform(1.5, 3.0))
            color = [70, 110, 60, 255]
            h = 1.5
        elif kind == "rock":
            geo = trimesh.creation.icosphere(subdivisions=1, radius=rng.uniform(0.3, 0.7))
            color = [120, 120, 120, 255]
            h = 0.3
        else:
            geo = trimesh.creation.box(extents=rng.uniform(0.8, 1.6, size=3))
            color = [150, 130, 110, 255]
            h = 0.8
        geo.visual = trimesh.visual.ColorVisuals(mesh=geo, vertex_colors=np.tile(color, (len(geo.vertices), 1)))
        transform = trimesh.transformations.translation_matrix([x, y + h, z])
        scene.add_geometry(geo, node_name=f"{kind}_{i}", transform=transform)
        objects.append(
            {
                "type": "MESH",
                "name": f"{kind}_{i}",
                "transform": {"position": [x, y + h, z], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
                "data": {"kind": kind},
            }
        )

    # Lights + camera (metadata; the viewer instantiates them).
    objects.append(
        {
            "type": "LIGHT",
            "name": "sun",
            "transform": {"position": [size, size, size], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "data": {"lightType": "directional", "intensity": 1.2, "color": "#fff4e0"},
        }
    )
    objects.append(
        {
            "type": "CAMERA",
            "name": "main",
            "transform": {"position": [0, size * 0.4, size * 0.6], "rotation": [-0.3, 0, 0], "scale": [1, 1, 1]},
            "data": {"fov": 55},
        }
    )
    objects.append(
        {
            "type": "ENVIRONMENT",
            "name": "sky",
            "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
            "data": {"skybox": "#8fb8e8", "fog": {"color": "#b8d0e8", "near": size, "far": size * 3}},
        }
    )

    environment = {"skybox": "#8fb8e8", "ambient": "#404050", "fog": {"near": size, "far": size * 3}}
    manifest = {
        "environment": environment,
        "objects": objects,
        "metadata": {"objectCount": len(objects), "terrainSize": size, "prompt": prompt},
        "seed": resolved,
    }
    glb = scene.export(file_type="glb")
    return glb, manifest, resolved
