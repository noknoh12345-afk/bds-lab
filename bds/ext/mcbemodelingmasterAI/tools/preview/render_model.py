"""A small software renderer that draws a Bedrock entity model THE WAY THE GAME
DOES, so an AI (or a person) can look at a model without opening the game.

    python tools/preview/render_model.py <model.geo.json> <texture.png> <out.png>
        [--views front34,side,rear34,top]   (front34 side rear34 top front rear low34 chase)
        [--anim <file.animation.json> --clip <animation id>]   pose = the clip's LAST keyframe, added to the bind pose
        [--rider x,y,z]                     draw the example seated rider, hip at x,y,z (model units)
        [--scale 15] [--size 640x470] [--bg 16,22,22]

What "the way the game does" means (each of these cost us a wrong render first):
 1. a JSON rotation [rx, ry, rz] is applied as right-handed (-rx, ry, -rz),
    X first, then Y, then Z, about the cube's / bone's pivot;
 2. an animation's rotation is ADDED to the bone's bind rotation, component by component;
 3. the whole model is drawn MIRRORED IN X relative to the JSON: a cube's
    "east" UV shows on its low-x side, "west" on its high-x side;
 4. across each face the texture runs as FACE_POINT says (u reversed from the
    naive reading; v is top-down on the sides).
Only per-face UVs ({"north": {"uv": [..], "uv_size": [..]}, ...}) are supported;
negative uv_size (Blockbench's mirrored faces) works. Alpha below 50% is cut out.

Needs numpy and Pillow.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

VIEWS = {  # name: (label, camera direction (from the model toward the camera), target, default scale factor)
    "front34": ("FRONT 3/4", (0.55, 0.42, -0.72), 1.0),
    "rear34": ("REAR 3/4", (-0.52, 0.42, 0.74), 1.0),
    "side": ("SIDE", (1.0, 0.16, 0.0), 1.0),
    "top": ("TOP", (0.0, 1.0, -0.001), 0.95),
    "front": ("FRONT", (0.0, 0.14, -1.0), 1.1),
    "rear": ("REAR", (0.0, 0.16, 1.0), 1.1),
    "low34": ("LOW FRONT", (0.47, 0.15, -0.87), 1.05),
    "chase": ("CHASE CAM", (0.0, 0.44, 0.9), 1.0),
}
LIGHT = np.array([0.35, 0.85, -0.4]) / np.linalg.norm([0.35, 0.85, -0.4])


def rotate(p, pivot, rot):
    """The game's reading of a JSON rotation: right-handed (-rx, ry, -rz), X then Y then Z."""
    rx, ry, rz = math.radians(-rot[0]), math.radians(rot[1]), math.radians(-rot[2])
    x, y, z = p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]
    y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    return (x + pivot[0], y + pivot[1], z + pivot[2])


def face_point(origin, size, face, u, v):
    """The point of a face at texture position (u, v) in 0..1 (v down), in the cube's own JSON frame."""
    x0, y0, z0 = origin
    x1, y1, z1 = x0 + size[0], y0 + size[1], z0 + size[2]
    if face == "east":
        return (x0, y1 - v * size[1], z1 - u * size[2])
    if face == "west":
        return (x1, y1 - v * size[1], z0 + u * size[2])
    if face == "north":
        return (x0 + u * size[0], y1 - v * size[1], z0)
    if face == "south":
        return (x1 - u * size[0], y1 - v * size[1], z1)
    if face == "up":
        return (x0 + u * size[0], y1, z1 - v * size[2])
    return (x0 + u * size[0], y0, z0 + v * size[2])  # down


def rider_cubes(hip):
    """The example seated player as untextured boxes (see tools/forge/checks.rider_parts)."""
    dy, dz = hip[1] - 12.0, hip[2]
    skin, shirt, legs = (200, 154, 122), (46, 140, 156), (58, 60, 132)
    lean = (10.0, 0.0, 0.0)
    parts = [((-4, 12 + dy, dz - 2), (8, 12, 4), (0, 24 + dy, dz), [lean], (0, 0, -2), shirt),
             ((-4, 24 + dy, dz - 4), (8, 8, 8), (0, 24 + dy, dz), [lean], (0, 0, -2), skin)]
    for s in (1, -1):
        parts.append(((4 if s > 0 else -8, 12 + dy, dz - 2), (4, 12, 4), (s * 5, 22 + dy, dz), [(-80.0, 0.0, 0.0), lean], (0, 0, -4), skin))
        parts.append(((-0.1 if s > 0 else -3.9, dy, dz - 2), (4, 12, 4), (s * 1.9, 12 + dy, dz), [(-90.0, -5.0 * s, 0.0)], (0, 0, 1), legs))
    return parts, (0, 24 + dy, dz)


def collect_faces(model, poses, rider=None):
    """[(corners 4x3 in GAME space, uv corners 4x2 or None, flat colour or None)]"""
    geo = model["minecraft:geometry"][0]
    bones = {b["name"]: b for b in geo["bones"]}
    faces = []

    def chain(name):
        out = []
        while name:
            out.append(bones[name])
            name = bones[name].get("parent")
        return out

    for bone in geo["bones"]:
        lineage = chain(bone["name"])
        for cube in bone.get("cubes", []):
            for face, m in cube.get("uv", {}).items():
                if not isinstance(m, dict) or 0 in m["uv_size"]:
                    continue
                quad = []
                for u, v in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    p = face_point(cube["origin"], cube["size"], face, u, v)
                    if cube.get("rotation"):
                        p = rotate(p, cube.get("pivot", bone["pivot"]), cube["rotation"])
                    for b in lineage:
                        bind = b.get("rotation", [0, 0, 0])
                        add = poses.get(b["name"], {}).get("rotation", [0, 0, 0])
                        r = [bind[i] + add[i] for i in range(3)]
                        if any(r):
                            p = rotate(p, b["pivot"], r)
                        shift = poses.get(b["name"], {}).get("position")
                        if shift:
                            p = (p[0] + shift[0], p[1] + shift[1], p[2] + shift[2])
                    quad.append((-p[0], p[1], p[2]))          # rule 3: the game mirrors x
                (x, y), (w, h) = m["uv"], m["uv_size"]
                faces.append((np.array(quad), np.array([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], dtype=float), None))
    if rider:
        parts, lean_pivot = rider_cubes(rider)
        for origin, size, pivot, rots, shift, colour in parts:
            for face in ("north", "south", "east", "west", "up", "down"):
                quad = []
                for u, v in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    p = rotate(face_point(origin, size, face, u, v), pivot, rots[0])
                    if len(rots) > 1:
                        p = rotate(p, lean_pivot, rots[1])
                    quad.append((-(p[0] + shift[0]), p[1] + shift[1], p[2] + shift[2]))
                faces.append((np.array(quad), None, colour))
    return faces


def render(faces, atlas, direction, centre, scale, width, height, bg):
    d = np.array(direction, dtype=float)
    d /= np.linalg.norm(d)
    helper = np.array([0.0, 1.0, 0.0]) if abs(d[1]) < 0.98 else np.array([0.0, 0.0, -1.0])
    right = np.cross(helper, d)
    right /= np.linalg.norm(right)
    up = np.cross(d, right)
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = bg
    zbuf = np.full((height, width), np.inf)
    th, tw = atlas.shape[:2]
    for quad, uvs, colour in faces:
        rel = quad - centre
        sx = rel @ right * scale + width / 2
        sy = height / 2 - rel @ up * scale
        sz = -(rel @ d)
        n = np.cross(quad[1] - quad[0], quad[3] - quad[0])
        ln = np.linalg.norm(n)
        shade = 0.6 + 0.4 * abs(float(n @ LIGHT) / ln) if ln > 1e-9 else 1.0
        for a, b, c in ((0, 1, 2), (0, 2, 3)):
            xs, ys = sx[[a, b, c]], sy[[a, b, c]]
            x0, x1 = max(0, int(math.floor(xs.min()))), min(width - 1, int(math.ceil(xs.max())))
            y0, y1 = max(0, int(math.floor(ys.min()))), min(height - 1, int(math.ceil(ys.max())))
            if x0 > x1 or y0 > y1:
                continue
            v0 = np.array([xs[1] - xs[0], ys[1] - ys[0]])
            v1 = np.array([xs[2] - xs[0], ys[2] - ys[0]])
            den = v0[0] * v1[1] - v0[1] * v1[0]
            if abs(den) < 1e-9:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5 - xs[0], np.arange(y0, y1 + 1) + 0.5 - ys[0])
            wb = (gx * v1[1] - gy * v1[0]) / den
            wc = (gy * v0[0] - gx * v0[1]) / den
            wa = 1 - wb - wc
            mask = (wa >= -1e-6) & (wb >= -1e-6) & (wc >= -1e-6)
            depth = wa * sz[a] + wb * sz[b] + wc * sz[c]
            zb = zbuf[y0:y1 + 1, x0:x1 + 1]
            mask &= depth < zb - 1e-6
            if not mask.any():
                continue
            if uvs is None:
                rgb = np.broadcast_to(np.array(colour, dtype=float), mask.shape + (3,))
                alpha = np.full(mask.shape, 255)
            else:
                tu = wa * uvs[a, 0] + wb * uvs[b, 0] + wc * uvs[c, 0]
                tv = wa * uvs[a, 1] + wb * uvs[b, 1] + wc * uvs[c, 1]
                lo_u, hi_u = sorted((uvs[0, 0], uvs[2, 0]))
                lo_v, hi_v = sorted((uvs[0, 1], uvs[2, 1]))
                tx = np.clip(np.floor(np.clip(tu, lo_u, hi_u - 1e-4)).astype(int), 0, tw - 1)
                ty = np.clip(np.floor(np.clip(tv, lo_v, hi_v - 1e-4)).astype(int), 0, th - 1)
                texel = atlas[ty, tx]
                rgb, alpha = texel[..., :3].astype(float), texel[..., 3]
            mask &= alpha >= 128
            out = frame[y0:y1 + 1, x0:x1 + 1]
            out[mask] = np.clip(rgb[mask] * shade, 0, 255).astype(np.uint8)
            zb[mask] = depth[mask]
    return Image.fromarray(frame, "RGB")


def last_keyframe_pose(anim_file, clip):
    anims = json.loads(Path(anim_file).read_text(encoding="utf-8"))["animations"]
    poses = {}
    for bone, channels in anims[clip]["bones"].items():
        for channel in ("rotation", "position"):
            keys = channels.get(channel)
            if isinstance(keys, dict):
                value = keys[sorted(keys, key=float)[-1]]
                value = value.get("post", value) if isinstance(value, dict) else value
                if all(isinstance(v, (int, float)) for v in value):
                    poses.setdefault(bone, {})[channel] = list(value)
            elif isinstance(keys, list) and all(isinstance(v, (int, float)) for v in keys):
                poses.setdefault(bone, {})[channel] = list(keys)
    return poses


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    model_path, texture_path, out_path = argv[:3]
    opts = dict(zip(argv[3::2], argv[4::2]))
    model = json.loads(Path(model_path).read_text(encoding="utf-8"))
    atlas = np.array(Image.open(texture_path).convert("RGBA"))
    poses = last_keyframe_pose(opts["--anim"], opts["--clip"]) if "--anim" in opts else {}
    rider = tuple(float(v) for v in opts["--rider"].split(",")) if "--rider" in opts else None
    faces = collect_faces(model, poses, rider)
    pts = np.concatenate([f[0] for f in faces])
    centre = (pts.min(axis=0) + pts.max(axis=0)) / 2
    width, height = (int(v) for v in opts.get("--size", "640x470").split("x"))
    extent = float(np.linalg.norm(pts.max(axis=0) - pts.min(axis=0)))
    scale = float(opts["--scale"]) if "--scale" in opts else 1.75 * min(width, height) / extent
    bg = tuple(int(v) for v in opts.get("--bg", "16,22,22").split(","))
    names = opts.get("--views", "front34,side,rear34,top").split(",")
    cols = 2 if len(names) > 1 else 1
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGB", (width * cols, height * rows), bg)
    for i, name in enumerate(names):
        label, direction, factor = VIEWS[name]
        image = render(faces, atlas, direction, centre, scale * factor, width, height, bg)
        ImageDraw.Draw(image).text((10, 8), f"{Path(model_path).stem} - {label}", fill=(225, 242, 233))
        sheet.paste(image, ((i % cols) * width, (i // cols) * height))
    sheet.save(out_path)
    print(out_path, sheet.size, f"{len(faces)} faces")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
