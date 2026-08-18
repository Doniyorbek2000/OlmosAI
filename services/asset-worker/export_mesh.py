"""Export a mesh to a supported format's bytes."""
from __future__ import annotations

import trimesh

# Formats trimesh can export natively. FBX requires Blender (asset-worker GPU
# profile / a Blender step) and is intentionally not silently substituted.
_CONTENT_TYPES = {
    "GLB": "model/gltf-binary",
    "GLTF": "model/gltf+json",
    "OBJ": "text/plain",
    "STL": "application/sla",
    "PLY": "application/octet-stream",
}


class UnsupportedFormatError(ValueError):
    pass


def export_mesh(mesh: trimesh.Trimesh, fmt: str) -> tuple[bytes, str, str]:
    """Return (bytes, content_type, extension) for the requested format."""
    fmt = fmt.upper()
    if fmt not in _CONTENT_TYPES:
        raise UnsupportedFormatError(
            f"format {fmt} not supported by the asset-worker CPU profile "
            f"(supported: {', '.join(_CONTENT_TYPES)}; FBX needs a Blender step)"
        )
    if fmt == "GLB":
        data = trimesh.Scene(mesh).export(file_type="glb")
    else:
        data = mesh.export(file_type=fmt.lower())
    if isinstance(data, str):
        data = data.encode("utf-8")
    return bytes(data), _CONTENT_TYPES[fmt], fmt.lower()
