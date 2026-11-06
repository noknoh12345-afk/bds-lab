"""The forge, part 3: UV layout, painting, and the files a model is made of.

Every face owns its own texture rectangle (one-pixel gutter). A face buried
wholly in other cubes of its bone can never be seen and gets a single texel.
Density is texels per model unit; undersides and carbon get half, and a cube
may ask for more (`dens`) where a picture must read.

The game (and Blockbench) draw a Bedrock model MIRRORED IN X: a cube's "east"
UV shows on its low-x side and "west" on its high-x side, and every face's
texture runs as `face_point` says. We found it the hard way: the forge had
taken east for the high-x side, so a wheel hub's buried inner face was cut to
one grey texel - and that texel was what the game showed on the outside.

Painting: the material gives the base look, the kart's own `decal` function
may repaint any pixel, then painted materials get their form (a top-lit
gradient on the sides, darker edges unless the part is `seamless` - one link
of a larger surface - and a little grain).
"""
from __future__ import annotations

import hashlib
import io
import json
import math
from pathlib import Path

from PIL import Image

from .checks import validate

FACE_AXES = {"north": (0, 1), "south": (0, 1), "east": (2, 1), "west": (2, 1), "up": (0, 2), "down": (0, 2)}
FACE_LIGHT = {"up": 1.06, "down": 0.62, "north": 0.94, "south": 0.84, "east": 0.9, "west": 0.9}
DYES = {
    "white": (0xF9, 0xFF, 0xFE), "orange": (0xF9, 0x80, 0x1D), "magenta": (0xC7, 0x4E, 0xBD), "light_blue": (0x3A, 0xB3, 0xDA),
    "yellow": (0xFE, 0xD8, 0x3D), "lime": (0x80, 0xC7, 0x1F), "pink": (0xF3, 0x8B, 0xAA), "gray": (0x47, 0x4F, 0x52),
    "silver": (0x9D, 0x9D, 0x97), "cyan": (0x16, 0x9C, 0x9C), "purple": (0x89, 0x32, 0xB8), "blue": (0x3C, 0x44, 0xAA),
    "brown": (0x83, 0x54, 0x32), "green": (0x5E, 0x7C, 0x16), "red": (0xB0, 0x2E, 0x26), "black": (0x1D, 0x1D, 0x21),
}
VARIANTS = ["undyed"] + list(DYES)
PAINTED = ("paint", "paint2", "trim", "accent", "seat")


def clamp(rgb):
    return tuple(max(0, min(255, int(round(v)))) for v in rgb)


def mul(rgb, f):
    return clamp(tuple(v * f for v in rgb))


def mix(a, b, t):
    return clamp(tuple(a[i] * (1 - t) + b[i] * t for i in range(3)))


def noise(*parts):
    return hashlib.md5(":".join(str(p) for p in parts).encode()).digest()[0] / 255.0 - 0.5


# where each labelled face is drawn in the game, as an outward normal in the cube's own frame
DISPLAY_NORMALS = {"north": (0, 0, -1), "south": (0, 0, 1), "east": (-1, 0, 0), "west": (1, 0, 0), "up": (0, 1, 0), "down": (0, -1, 0)}


def face_point(cube, face, u, v):
    """The point of a face at texture position (u, v) (0..1, v down), in the
    cube's own unrotated frame, the way the game draws it: the Blockbench
    reading of Bedrock (positions mirrored in x, up / down UVs turned half
    round) with Java's faces, each seen from outside unmirrored. Two facts pin
    it: a wheel hub's "west" texel showed on its high-x side in the game, and
    emblem text on up faces reads left to right in the game."""
    (x0, y0, z0), s = cube["origin"], cube["size"]
    x1, y1, z1 = x0 + s[0], y0 + s[1], z0 + s[2]
    if face == "east":
        return (x0, y1 - v * s[1], z1 - u * s[2])
    if face == "west":
        return (x1, y1 - v * s[1], z0 + u * s[2])
    if face == "north":
        return (x0 + u * s[0], y1 - v * s[1], z0)
    if face == "south":
        return (x1 - u * s[0], y1 - v * s[1], z1)
    if face == "up":
        return (x0 + u * s[0], y1, z1 - v * s[2])
    return (x0 + u * s[0], y0, z0 + v * s[2])  # down


BURIED_GRID = (0.0, 0.02, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.98, 1.0)


def buried_faces(kart):
    """(cube name, face) of every face lying wholly inside other cubes of its
    own bone (other bones move). Sampled on a grid that includes the edges, a
    hair outside the face, so a face flush against a neighbour counts and a
    sliver of step along an edge keeps its texture."""
    from .checks import aabb, depth_inside, to_model
    boxes = {id(c): aabb(kart, c) for c in kart.cubes}
    by_bone = {}
    for c in kart.cubes:
        by_bone.setdefault(c["bone"], []).append(c)
    out = set()
    for c in kart.cubes:
        others = [o for o in by_bone[c["bone"]] if o is not c]
        if not others:
            continue
        for face, n in DISPLAY_NORMALS.items():
            if c.get("only") and face not in c["only"]:
                continue
            ok = True
            for u in BURIED_GRID:
                for v in BURIED_GRID:
                    lp = face_point(c, face, u, v)
                    q = to_model(kart, c, tuple(lp[k] + 0.01 * n[k] for k in range(3)))
                    if not any(all(boxes[id(o)][0][k] - 0.001 <= q[k] <= boxes[id(o)][1][k] + 0.001 for k in range(3))
                               and depth_inside(kart, o, q) > 0.001 for o in others):
                        ok = False
                        break
                if not ok:
                    break
            if ok:
                out.add((c["name"], face))
    return out


def atlas_size(atlas):
    """An atlas is `size` (square) or (width, height)."""
    return tuple(atlas) if isinstance(atlas, (tuple, list)) else (atlas, atlas)


def layout(kart, atlas, density, gutter=1, unseen=frozenset()):
    """`unseen`: faces no view shows (visibility.unseen_faces), cut to one texel like the buried ones."""
    buried = buried_faces(kart) | set(unseen)
    faces = []
    for c in kart.cubes:
        for face, (ua, va) in FACE_AXES.items():
            if c.get("only") and face not in c["only"]:
                # a plate's other faces carry no texture at all
                faces.append({"cube": c, "face": face, "w": 0, "h": 0, "hidden": False, "empty": True, "x": 0, "y": 0})
                continue
            # (never blank ONE face of a two-faced plate: a one-texel face paints the whole plate in one
            #  colour, over the other face's transparent outline)
            hid = (c["name"], face) in buried and not (bool(c.get("only")) and len(c["only"]) > 1)
            # `dens` is one density for the cube, or {face: density} for the faces that carry a picture
            per_face = isinstance(c["dens"], dict)
            d = (c["dens"].get(face) if per_face else c["dens"]) or density
            twin = bool(c.get("only")) and len(c["only"]) > 1     # a two-faced plate: both faces alike, at full density
            if (face == "down" and not twin and not (per_face and "down" in c["dens"])) or c["mat"] == "carbon":
                d = min(d, density) / 2
            w = 1 if hid else max(1, round(c["size"][ua] * d))
            h = 1 if hid else max(1, round(c["size"][va] * d))
            faces.append({"cube": c, "face": face, "w": w, "h": h, "hidden": hid})
    order = sorted((i for i in range(len(faces)) if not faces[i].get("empty")), key=lambda i: (-faces[i]["h"], -faces[i]["w"], i))
    x = y = row = 0
    for i in order:
        f = faces[i]
        if x + f["w"] > atlas_size(atlas)[0]:
            x, y, row = 0, y + row + gutter, 0
        if y + f["h"] > atlas_size(atlas)[1]:
            raise SystemExit("the atlas is full: lower the density")
        f["x"], f["y"] = x, y
        x += f["w"] + gutter
        row = max(row, f["h"])
    return faces, y + row


class Pixel:
    """What a decal function sees for one texel."""
    __slots__ = ("cube", "face", "u", "v", "i", "j", "w", "h", "col", "palette", "fixed")

    def local(self):
        """The texel's centre in the cube's own (unrotated) frame, exactly, as the game draws it."""
        return face_point(self.cube, self.face, self.u, self.v)

    def world(self):
        """Older decals use this (the same as local() on up / down and in y
        on the sides). Use local()."""
        o, s = self.cube["origin"], self.cube["size"]
        p = [o[0] + s[0] / 2, o[1] + s[1] / 2, o[2] + s[2] / 2]
        if self.face in ("up", "down"):
            p[0] = o[0] + self.u * s[0]
            p[2] = o[2] + ((1 - self.v) if self.face == "up" else self.v) * s[2]
        else:
            p[1] = o[1] + (1 - self.v) * s[1]
        return p


def material_look(p, base):
    mat, face, u, v, i, j, w, h = p.cube["mat"], p.face, p.u, p.v, p.i, p.j, p.w, p.h
    side = face in ("north", "south", "east", "west")
    col = base
    if mat == "carbon":
        col = mul(col, 1.0 + (0.16 if (i // 2 + j // 2) % 2 else -0.06))
    elif mat == "seat":
        col = mul(col, 1.12 if j % 4 == 1 else 1.0)
        if p.cube["decal"] == "seat" and j % 4 == 0 and w > 6:
            col = mix(col, p.palette["paint"], 0.55)
    elif mat == "glass":
        col = mix(base, (0x6C, 0x8C, 0xB4), max(0.0, 1.0 - abs(u - v * 0.6 - 0.25) * 5) * 0.7)
    elif mat == "panel" and face == "south" and w >= 8:
        for gx in (0.27, 0.73):
            d = math.hypot((u - gx) * w / h, v - 0.55)
            if 0.25 < d < 0.36:
                col = (0xD8, 0xE4, 0xF0)
            elif d <= 0.25:
                col = (0x1E, 0x2A, 0x3A)
        if j == 0 and 0.3 < u < 0.7:
            col = ((0x40, 0xE0, 0x60), (0xF0, 0xD0, 0x40), (0xF0, 0x50, 0x40))[min(2, int((u - 0.3) / 0.4 * 3))]
    elif mat == "mesh":
        col = mul(base, 1.9) if (i + j) % 2 == 0 else base
    elif mat.startswith("glow"):
        col = mix(mix(base, (255, 255, 255), 0.6), base, min(1.0, math.hypot(u - 0.5, v - 0.5) * 2.4))
    elif mat.startswith("light"):
        col = mul(base, 1.0 if 0 < i < w - 1 or w < 3 else 0.7)
    elif mat == "mirror" and face == "south":
        col = mix((0xA8, 0xC4, 0xE0), (0x50, 0x70, 0x98), v)
    elif mat == "nozzle":
        col = mul(base, 1.25 if (i if face in ("up", "down") else j) % 3 == 0 else 1.0)
    elif mat in ("metal", "chrome"):
        col = mul(base, 1.15 - 0.3 * v if side else 1.0)
    elif mat == "rubber" and p.cube["decal"] == "tyre":
        d = abs((v if h >= w else u) - 0.5) * 2
        if face in ("east", "west"):
            col = mul(base, 0.85) if d > 0.9 else (0x4A, 0x4A, 0x52) if 0.72 < d < 0.8 else (0x12, 0x12, 0x15) if d < 0.6 else base
        else:
            col = mul(base, 0.62) if (i if face in ("up", "down") or h >= w else j) % 3 == 1 else mul(base, 1.3)
    elif mat == "rim" and face in ("east", "west"):
        d = abs((v if h >= w else u) - 0.5) * 2
        across = abs((u if h >= w else v) - 0.5) * 2
        col = mul(base, 0.7) if d > 0.9 else (0x2A, 0x2C, 0x32) if 0.42 < d < 0.8 and across > 0.45 else base
    return col


def paint(kart, faces, palette, fixed, decal_fn, atlas, grain=0.035):
    """`grain` is the texel-to-texel flicker on every face; 0 leaves the
    surfaces smooth, and a 512 atlas five times smaller as a PNG."""
    image = Image.new("RGBA", atlas_size(atlas), (0, 0, 0, 0))
    px = image.load()
    p = Pixel()
    p.palette, p.fixed = palette, fixed
    for f in faces:
        c = f["cube"]
        p.cube, p.face, p.w, p.h = c, f["face"], f["w"], f["h"]
        # the livery may recolour any material (the paint always; e.g. glowing eyes on one livery only)
        base = palette[c["mat"]] if c["mat"] in palette else fixed[c["mat"]]
        side = p.face in ("north", "south", "east", "west")
        # A PLATE with two faces (a membrane, a fin, a leaf: zero thickness, its outline cut by
        # transparent texels) has both faces in ONE plane, and the alpha-tested entity material does
        # not cull back faces: the two are drawn over each other. They must carry the same colour at
        # the same point or they flicker - so no per-face light, no grain, no form shading, and the
        # decal must paint by position (p.local()), which makes the second face the mirror of the first.
        twin = bool(c.get("only")) and len(c["only"]) > 1
        for j in range(p.h):
            for i in range(p.w):
                p.i, p.j, p.u, p.v = i, j, (i + 0.5) / p.w, (j + 0.5) / p.h
                p.col = material_look(p, base)
                col = decal_fn(p) if c["decal"] else p.col
                if col is None:
                    # cut out: the alpha-tested material draws nothing here
                    px[f["x"] + i, f["y"] + j] = (0, 0, 0, 0)
                    continue
                if c["mat"] in PAINTED and not twin:
                    if side:
                        col = mul(col, 1.07 - 0.16 * p.v)
                    if not c["seamless"]:
                        if min(p.w, p.h) >= 5:
                            if i == 0 or j == p.h - 1 or i == p.w - 1:
                                col = mul(col, 0.80)
                            elif j == 0:
                                col = mul(col, 0.92 if p.face == "up" else 1.14)
                        elif min(p.w, p.h) >= 3 and (j == p.h - 1 or i == p.w - 1):
                            col = mul(col, 0.86)
                if twin:
                    col = mul(col, FACE_LIGHT[c["only"][0]])
                else:
                    col = mul(col, FACE_LIGHT[p.face] * (1.0 + grain * noise(c["name"], p.face, i, j)))
                px[f["x"] + i, f["y"] + j] = col + (255,)
    return image


def geometry_json(kart, faces, atlas):
    by_cube = {}
    for f in faces:
        mapping = {"uv": [f["x"], f["y"]], "uv_size": [f["w"], f["h"]]}
        if f["face"] in (f["cube"].get("flip") or ()) and f["w"] > 1:
            # mirrored across, the way Blockbench writes it: a negative width from the far edge
            mapping = {"uv": [f["x"] + f["w"], f["y"]], "uv_size": [-f["w"], f["h"]]}
        by_cube.setdefault(id(f["cube"]), {})[f["face"]] = mapping
    out = []
    for b in kart.bones:
        ob = {"name": b["name"]}
        if b["parent"]:
            ob["parent"] = b["parent"]
        ob["pivot"] = b["pivot"]
        for key in ("rotation", "locators"):
            if b.get(key):
                ob[key] = b[key]
        mine = [c for c in kart.cubes if c["bone"] == b["name"]]
        if mine:
            ob["cubes"] = []
            for c in mine:
                oc = {"origin": c["origin"], "size": c["size"]}
                if c["rot"]:
                    oc["pivot"], oc["rotation"] = c["pivot"], c["rot"]
                oc["uv"] = {face: by_cube[id(c)][face] for face in ("north", "east", "south", "west", "up", "down")}
                ob["cubes"].append(oc)
        out.append(ob)
    return {"format_version": "1.16.0", "minecraft:geometry": [{
        "description": {"identifier": f"geometry.{kart.name}", "texture_width": atlas_size(atlas)[0], "texture_height": atlas_size(atlas)[1],
                        "visible_bounds_width": 5, "visible_bounds_height": 3.5, "visible_bounds_offset": [0, 1.25, 0]},
        "bones": out}]}


def mirrored(v, channel):
    neg = lambda x: -x if x else x  # noqa: E731  (never a -0.0 in the file)
    return [neg(v[0]), v[1], v[2]] if channel == "position" else [v[0], neg(v[1]), neg(v[2])]


def animation_json(name, clips, base=None):
    """clips: {clip: (length, {left_bone: right_bone}, {time: {left_bone: {channel: vec}}}[, loop])}.
    Every left bone's keys are written, and mirrored onto its right bone. With
    no pairs (None) the frames are {bone: {channel: {time: vec}}}, as given.
    `base`: whole animations included as written, e.g. a looping wheel spin:
    {"drive": {"loop": True, "bones": {"A": {"rotation": ["q.modified_distance_moved * -30", 0, 0]}}}}."""
    anims = {f"animation.{name}.{key}": value for key, value in (base or {}).items()}
    for clip, (length, pairs, frames, *rest) in clips.items():
        loop = rest[0] if rest else "hold_on_last_frame"
        if pairs is None:
            # bones on the centre line (a kart's pop-up lamps): frames are
            # {bone: {channel: {time: vec}}}, written as given
            anims[f"animation.{name}.{clip}"] = {"loop": loop, "animation_length": length, "bones": {
                bone: {ch: {t: list(v) for t, v in keys.items()} for ch, keys in chans.items()} for bone, chans in frames.items()}}
            continue
        bones = {}
        for left, right in pairs.items():
            for channel in ("rotation", "position"):
                keys = {t: list(frames[t][left].get(channel, (0, 0, 0))) for t in frames}
                bones.setdefault(left, {})[channel] = keys
                bones.setdefault(right, {})[channel] = {t: mirrored(v, channel) for t, v in keys.items()}
        anims[f"animation.{name}.{clip}"] = {"loop": loop, "animation_length": length, "bones": bones}
    return {"format_version": "1.8.0", "animations": anims}


def dumps(data):
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def png_bytes(image):
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _paint_png(args):
    kart, faces, palette, fixed, decal, atlas, grain = args
    return png_bytes(paint(kart, faces, palette, fixed, decal, atlas, grain))


def paint_all(kart, faces, spec, atlas):
    """The seventeen liveries' PNG bytes, painted side by side in worker
    processes (one Python process paints one texel at a time; seventeen at
    once take a seventh of the time). Serially when the builder was not run as
    a script (its decal cannot be sent to a worker then)."""
    jobs = [(kart, faces, spec["palette"](v), spec["fixed"], spec["decal"], atlas, spec.get("grain", 0.035))
            for v in spec.get("variants", VARIANTS)]
    try:
        import pickle
        pickle.dumps(spec["decal"])
        if getattr(spec["decal"], "__module__", "") != "__main__":
            raise TypeError("not a script")
        from concurrent.futures import ProcessPoolExecutor
        import os
        with ProcessPoolExecutor(max_workers=min(len(jobs), os.cpu_count() or 4)) as pool:
            return list(pool.map(_paint_png, jobs))
    except (TypeError, AttributeError, pickle.PicklingError, OSError):
        return [_paint_png(job) for job in jobs]


def run(argv, kart, spec):
    """Validate, lay out, paint and write (or --check) a kart. Returns an exit code."""
    rp = Path(spec["rp"])
    atlas = spec.get("atlas", 256)
    problems, (lo, hi) = validate(kart, spec)
    unseen = set()
    if spec.get("visibility") and not problems:
        from .visibility import unseen_faces
        poses = {name: spec["poses"][name] for name in spec["visibility"]}
        unseen = unseen_faces(kart, poses, face_point, from_below=spec.get("seen_from_below", False),
                              **({"spinning": frozenset(spec["spinning"])} if "spinning" in spec else {}))
    faces, used = layout(kart, atlas, spec.get("density", 2.0), unseen=unseen)
    print(f"[{kart.name}] cubes {len(kart.cubes)}/{spec['cap']}  bones {len(kart.bones)}  size W {hi[0] - lo[0]:.1f} H {hi[1] - lo[1]:.1f} "
          f"L {hi[2] - lo[2]:.1f}  atlas rows {used}/{atlas_size(atlas)[1]}  hidden faces {sum(f['hidden'] for f in faces)}/{len(faces)}"
          + (f" ({len(unseen)} unseen from every view)" if spec.get("visibility") else ""))
    for p in problems:
        print("   PROBLEM:", p)
    if problems:
        return 2
    outputs = {
        rp / "models" / "entity" / f"{kart.name}.json": dumps(geometry_json(kart, faces, atlas)).encode("utf-8"),
        rp / "animations" / f"{kart.name}.animation.json": dumps(animation_json(kart.name, spec.get("clips", {}), spec.get("base_animations"))).encode("utf-8"),
    }
    for variant, data in zip(spec.get("variants", VARIANTS), paint_all(kart, faces, spec, atlas)):
        outputs[rp / "textures" / "entity" / kart.name / f"{kart.name}_{variant}.png"] = data
    stale = [p for p, data in outputs.items() if not p.exists() or p.read_bytes() != data]
    if "--check" in argv:
        for p in stale:
            print("   stale:", p.name)
        return 1 if stale else 0
    for p in stale:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(outputs[p])
    print(f"[{kart.name}] wrote {len(stale)} file(s), {len(outputs) - len(stale)} already current")
    return 0
