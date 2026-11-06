"""Lints ANY Bedrock entity geometry file - a forge build or a Blockbench save.

    python tools/inspect_model.py <model.geo.json> [--cap 250] [--texture 512x384]

It reports the defects that are invisible in an editor and ugly in the game:
 - z-fighting: two faces looking the same way from one plane and overlapping
   there (rotated cubes included) - the most common complaint;
 - collapsed cubes: a zero or NEGATIVE size (an edge dragged past its
   opposite face in Blockbench leaves one, usually on one side only);
 - faces whose UV rectangle leaves the texture;
 - a two-faced plate (a membrane, a fin) whose two faces differ in size: they
   are drawn over each other, and the smaller paints over the other's outline;
 - duplicate cubes; the cube count against a cap;
 - left / right asymmetry: a cube with no mirror image (a hand edit made on
   one side only). Reported as a note, not an error: some are intended.
Exit code 1 when there is an error. Needs only the standard library.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from forge.checks import coplanar_faces  # noqa: E402
from forge.shapes import Kart  # noqa: E402


def load(path):
    geo = json.loads(Path(path).read_text(encoding="utf-8"))["minecraft:geometry"][0]
    model = Kart(geo["description"]["identifier"])
    for bone in geo["bones"]:
        extra = {"rotation": bone["rotation"]} if bone.get("rotation") else {}
        model.bone(bone["name"], bone.get("parent"), bone.get("pivot", [0, 0, 0]), **extra)
    count = 0
    for bone in geo["bones"]:
        for cube in bone.get("cubes", []):
            count += 1
            rot = cube.get("rotation") if cube.get("rotation") and any(cube["rotation"]) else None
            model.cubes.append({"bone": bone["name"], "name": f"{bone['name']}#{count} at {[round(v, 2) for v in cube['origin']]}",
                                "origin": cube["origin"], "size": cube["size"], "rot": rot,
                                "pivot": cube.get("pivot", bone.get("pivot")) if rot else None, "uv": cube.get("uv")})
    return geo, model


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    opts = dict(zip(argv[1::2], argv[2::2]))
    geo, model = load(argv[0])
    desc = geo["description"]
    tw, th = (int(v) for v in opts["--texture"].split("x")) if "--texture" in opts else (desc.get("texture_width", 64), desc.get("texture_height", 64))
    errors, notes = [], []
    cap = int(opts.get("--cap", 0))
    if cap and len(model.cubes) > cap:
        errors.append(f"{len(model.cubes)} cubes exceed the cap of {cap}")
    seen = {}
    for c in model.cubes:
        if min(c["size"]) < 0:
            errors.append(f"collapsed cube (negative size {c['size']}): {c['name']}")
        elif sorted(c["size"])[1] == 0:
            errors.append(f"collapsed cube (two zero sizes {c['size']}): {c['name']}")
        if isinstance(c["uv"], dict) and 0 in c["size"] and min(c["size"]) >= 0:
            # a plate: if two opposite faces are textured they are drawn over each other and must be alike
            for one, other in (("up", "down"), ("north", "south"), ("east", "west")):
                sizes = [[abs(v) for v in c["uv"].get(f, {}).get("uv_size", [0, 0])] for f in (one, other)]
                if all(0 not in sz for sz in sizes) and sizes[0] != sizes[1]:
                    errors.append(f"two-faced plate with unequal faces ({one} {sizes[0]}, {other} {sizes[1]}): the smaller one paints over "
                                  f"the other's cut-out outline: {c['name']}")
        key = json.dumps([c["bone"], c["origin"], c["size"], c["rot"], c["pivot"]])
        if key in seen:
            errors.append(f"duplicate cube: {c['name']} = {seen[key]}")
        seen[key] = c["name"]
        if isinstance(c["uv"], dict):
            for face, m in c["uv"].items():
                (u, v), (w, h) = m["uv"], m["uv_size"]
                if min(u, u + w) < 0 or min(v, v + h) < 0 or max(u, u + w) > tw or max(v, v + h) > th:
                    errors.append(f"UV leaves the {tw}x{th} texture: {c['name']} {face} {m}")
    solid = Kart(model.name)
    solid.bones, solid.bone_map = model.bones, model.bone_map
    solid.cubes = [c for c in model.cubes if min(c["size"]) >= 0]
    errors += coplanar_faces(solid)
    rounded = lambda v: tuple(round(x, 3) for x in v) if v else None  # noqa: E731
    turn = lambda r: tuple(round(((a + 180.0) % 360.0) - 180.0, 3) + 0.0 for a in r) if r else None  # noqa: E731  (315 is -45)
    have = {(c["bone"], rounded(c["origin"]), rounded(c["size"]), turn(c["rot"])) for c in model.cubes}
    names = {b["name"] for b in model.bones}
    for c in model.cubes:
        mirror_origin = (round(-(c["origin"][0] + c["size"][0]), 3), round(c["origin"][1], 3), round(c["origin"][2], 3))
        mirror_rot = turn((c["rot"][0], -c["rot"][1], -c["rot"][2])) if c["rot"] else None
        partners = {c["bone"]} | {n for n in names if n != c["bone"]}
        if not any((b, mirror_origin, rounded(c["size"]), mirror_rot) in have for b in partners):
            notes.append(f"no mirror image: {c['name']} size {c['size']}")
    print(f"{desc['identifier']}: {len(model.cubes)} cubes, {len(model.bones)} bones, texture {tw}x{th}")
    for e in errors:
        print("  ERROR:", e)
    for n in notes[:40]:
        print("  note:", n)
    if len(notes) > 40:
        print(f"  note: ... and {len(notes) - 40} more cubes without a mirror image")
    print("  result:", "FAIL" if errors else "ok", f"({len(errors)} errors, {len(notes)} notes)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
