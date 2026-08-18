"""Procedural motion generation: a deterministic skeleton + keyframe clip and a
viewable animated GLB (glTF node TRS animation). Used as the CPU fallback when
the real HY-Motion model is unavailable (dev/CI). The real GPU path (documented
in MODEL.md) produces SMPL motion retargeted to the same skeleton and flows
through the same export.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field

import numpy as np
import pygltflib

# A simple humanoid rig: (name, parent, world-translation, box-scale, motion role).
JOINTS = [
    ("hips", None, [0.0, 1.0, 0.0], [0.5, 0.35, 0.3], "bob"),
    ("spine", "hips", [0.0, 1.35, 0.0], [0.45, 0.5, 0.28], "twist"),
    ("head", "spine", [0.0, 1.75, 0.0], [0.32, 0.32, 0.32], "nod"),
    ("arm_l", "spine", [-0.45, 1.35, 0.0], [0.16, 0.6, 0.16], "swingA"),
    ("arm_r", "spine", [0.45, 1.35, 0.0], [0.16, 0.6, 0.16], "swingB"),
    ("leg_l", "hips", [-0.18, 0.55, 0.0], [0.2, 0.7, 0.2], "swingB"),
    ("leg_r", "hips", [0.18, 0.55, 0.0], [0.2, 0.7, 0.2], "swingA"),
]

BOX_VERTS = np.array(
    [
        [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
        [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
    ],
    dtype=np.float32,
)
BOX_INDICES = np.array(
    [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
     1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0],
    dtype=np.uint16,
)


@dataclass
class MotionClip:
    fps: int
    frame_count: int
    duration: float
    skeleton: dict
    # frames[j] -> list of [x,y,z,w] quaternions per joint per frame
    rotations: np.ndarray  # (frames, joints, 4)
    root_translation: np.ndarray  # (frames, 3)
    seed: int
    style: str = field(default="idle")


def seed_from(prompt: str, seed: int | None) -> int:
    if seed is not None:
        return seed
    return int.from_bytes(hashlib.sha256(prompt.encode()).digest()[:4], "big")


def _quat_x(theta: float) -> list[float]:
    return [math.sin(theta / 2), 0.0, 0.0, math.cos(theta / 2)]


def _quat_y(theta: float) -> list[float]:
    return [0.0, math.sin(theta / 2), 0.0, math.cos(theta / 2)]


def generate_clip(prompt: str, seed: int | None, duration: float, fps: int) -> MotionClip:
    """Deterministic idle/walk-ish cycle influenced by the prompt."""
    resolved = seed_from(prompt, seed)
    rng = np.random.default_rng(resolved)
    frame_count = max(2, int(round(duration * fps)))
    style = "walk" if any(w in prompt.lower() for w in ("walk", "run", "dance", "wave")) else "idle"
    amp = 0.5 if style == "walk" else 0.2
    phase0 = rng.uniform(0, math.tau)

    rotations = np.zeros((frame_count, len(JOINTS), 4), dtype=np.float32)
    root = np.zeros((frame_count, 3), dtype=np.float32)
    for f in range(frame_count):
        t = f / frame_count
        cycle = math.sin(phase0 + t * math.tau)
        for j, (_name, _parent, _trans, _scale, role) in enumerate(JOINTS):
            if role == "swingA":
                rotations[f, j] = _quat_x(amp * cycle)
            elif role == "swingB":
                rotations[f, j] = _quat_x(-amp * cycle)
            elif role == "twist":
                rotations[f, j] = _quat_y(0.15 * cycle)
            elif role == "nod":
                rotations[f, j] = _quat_x(0.08 * math.sin(phase0 + t * math.tau * 2))
            else:  # bob / hips
                rotations[f, j] = [0.0, 0.0, 0.0, 1.0]
        root[f] = [0.0, 1.0 + 0.05 * math.sin(phase0 + t * math.tau * 2), 0.0]

    skeleton = {
        "joints": [
            {"name": n, "parent": p, "translation": tr} for (n, p, tr, _s, _r) in JOINTS
        ],
    }
    return MotionClip(
        fps=fps,
        frame_count=frame_count,
        duration=duration,
        skeleton=skeleton,
        rotations=rotations,
        root_translation=root,
        seed=resolved,
        style=style,
    )


def _pad4(data: bytes) -> bytes:
    while len(data) % 4 != 0:
        data += b"\x00"
    return data


def build_animated_glb(clip: MotionClip) -> bytes:
    """Build a valid animated GLB: one shared box mesh, one node per joint, and a
    glTF animation with a rotation channel per joint (+ a translation channel on
    the root). Playable by any glTF viewer (three.js AnimationMixer)."""
    gltf = pygltflib.GLTF2()
    blob = b""
    buffer_views: list[pygltflib.BufferView] = []
    accessors: list[pygltflib.Accessor] = []

    def add_view(data: bytes, target: int | None) -> int:
        nonlocal blob
        data = _pad4(data)
        offset = len(blob)
        buffer_views.append(
            pygltflib.BufferView(buffer=0, byteOffset=offset, byteLength=len(data), target=target)
        )
        blob += data
        return len(buffer_views) - 1

    # Geometry.
    pos_view = add_view(BOX_VERTS.tobytes(), pygltflib.ARRAY_BUFFER)
    idx_view = add_view(BOX_INDICES.tobytes(), pygltflib.ELEMENT_ARRAY_BUFFER)
    pos_acc = len(accessors)
    accessors.append(
        pygltflib.Accessor(
            bufferView=pos_view, componentType=pygltflib.FLOAT, count=len(BOX_VERTS), type="VEC3",
            min=BOX_VERTS.min(axis=0).tolist(), max=BOX_VERTS.max(axis=0).tolist(),
        )
    )
    idx_acc = len(accessors)
    accessors.append(
        pygltflib.Accessor(
            bufferView=idx_view, componentType=pygltflib.UNSIGNED_SHORT, count=len(BOX_INDICES),
            type="SCALAR",
        )
    )

    mesh = pygltflib.Mesh(
        primitives=[pygltflib.Primitive(attributes=pygltflib.Attributes(POSITION=pos_acc), indices=idx_acc)]
    )
    gltf.meshes.append(mesh)

    # Time input accessor (shared by all samplers).
    times = np.arange(clip.frame_count, dtype=np.float32) / clip.fps
    time_view = add_view(times.tobytes(), None)
    time_acc = len(accessors)
    accessors.append(
        pygltflib.Accessor(
            bufferView=time_view, componentType=pygltflib.FLOAT, count=clip.frame_count, type="SCALAR",
            min=[float(times.min())], max=[float(times.max())],
        )
    )

    nodes: list[pygltflib.Node] = []
    samplers: list[pygltflib.AnimationSampler] = []
    channels: list[pygltflib.AnimationChannel] = []

    for j, (_name, _parent, trans, scale, _role) in enumerate(JOINTS):
        node_idx = len(nodes)
        nodes.append(
            pygltflib.Node(mesh=0, translation=[float(x) for x in trans], scale=[float(x) for x in scale])
        )
        # Rotation channel.
        rot_out = clip.rotations[:, j, :].astype(np.float32)
        rot_view = add_view(rot_out.tobytes(), None)
        rot_acc = len(accessors)
        accessors.append(
            pygltflib.Accessor(
                bufferView=rot_view, componentType=pygltflib.FLOAT, count=clip.frame_count, type="VEC4"
            )
        )
        samp_idx = len(samplers)
        samplers.append(pygltflib.AnimationSampler(input=time_acc, output=rot_acc, interpolation="LINEAR"))
        channels.append(
            pygltflib.AnimationChannel(
                sampler=samp_idx, target=pygltflib.AnimationChannelTarget(node=node_idx, path="rotation")
            )
        )
        # Root translation channel (hips).
        if j == 0:
            tr_out = clip.root_translation.astype(np.float32)
            tr_view = add_view(tr_out.tobytes(), None)
            tr_acc = len(accessors)
            accessors.append(
                pygltflib.Accessor(
                    bufferView=tr_view, componentType=pygltflib.FLOAT, count=clip.frame_count, type="VEC3"
                )
            )
            samp2 = len(samplers)
            samplers.append(pygltflib.AnimationSampler(input=time_acc, output=tr_acc, interpolation="LINEAR"))
            channels.append(
                pygltflib.AnimationChannel(
                    sampler=samp2, target=pygltflib.AnimationChannelTarget(node=node_idx, path="translation")
                )
            )

    gltf.nodes = nodes
    gltf.scenes.append(pygltflib.Scene(nodes=list(range(len(nodes)))))
    gltf.scene = 0
    gltf.bufferViews = buffer_views
    gltf.accessors = accessors
    gltf.animations.append(pygltflib.Animation(name=clip.style, samplers=samplers, channels=channels))
    gltf.buffers.append(pygltflib.Buffer(byteLength=len(blob)))
    gltf.set_binary_blob(blob)

    return b"".join(gltf.save_to_bytes())


def clip_to_json(clip: MotionClip) -> dict:
    return {
        "fps": clip.fps,
        "frameCount": clip.frame_count,
        "duration": clip.duration,
        "style": clip.style,
        "seed": clip.seed,
        "skeleton": clip.skeleton,
        # Per-frame joint rotations (quaternion) — compact, portable clip data.
        "rotations": clip.rotations.tolist(),
        "rootTranslation": clip.root_translation.tolist(),
    }
