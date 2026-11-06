"""The forge, part 2: the checks every model must pass before it is written.

 - at most `cap` cubes, no duplicate cube;
 - no z-fighting: two faces looking the same way from one plane and
   overlapping there (face polygons, so tilted boxes count), at rest and in
   every animated pose;
 - no stray cube: inside each assembly every cube touches another;
 - left/right symmetric silhouette, nothing under the ground, nothing but the
   tyres lower than 0.55;
 - the seated player fits (no part of them deep inside a kart cube);
 - in each animated pose the moving parts stay out of the body, the tyres
   and each other's half;
 - with `shaft_buried`, the cube named "shaft" (a steering column) stays
   inside the fixed body for its first quarter: a column poking out in front
   of the windscreen shipped twice before this check existed.

`spec` keys used here (only `cap` and `groups` are required):
  cap               the most cubes allowed
  groups            {assembly: {bone, ...}}: inside each, every cube must touch another
  symmetric         default True; False for a one-sided model (a held weapon, a pose)
  ground_clearance  e.g. 0.55 for a vehicle: nothing but its wheels may come lower.
                    Leave it out for anything that stands on the ground (a creature's feet)
  wheel_bones       default A B C D; bones exempt from ground_clearance and the rider check
  wheels            {bone: {x, y, z, r, w, side}}: moving parts must not enter a tyre
  hip               the seated rider's hip: enables the rider check (vehicles, mounts)
  poses             {pose: {bone: added rotation}}: every animated pose is checked
  pose_tolerance    how deep a moving part may sink into a fixed one (default 0.25)
  shaft_buried      a steering column named "shaft" must stay buried
"""
from __future__ import annotations

import json
import math

from .shapes import about

FACE_CORNER_IDS = {"north": (0, 4, 6, 2), "south": (1, 3, 7, 5), "east": (4, 5, 7, 6), "west": (0, 2, 3, 1), "up": (2, 6, 7, 3), "down": (0, 1, 5, 4)}


def inv_about(p, pivot, rot):
    rx, ry, rz = (math.radians(rot[0]), math.radians(-rot[1]), math.radians(rot[2]))
    x, y, z = (p[i] - pivot[i] for i in range(3))
    x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    return (x + pivot[0], y + pivot[1], z + pivot[2])


def bone_rotation(kart, name, pose):
    bind = kart.bone_map[name].get("rotation") or [0, 0, 0]
    add = pose.get(name, (0, 0, 0))
    return [bind[i] + add[i] for i in range(3)]


def chain(kart, cube):
    b = kart.bone_map[cube["bone"]]
    out = []
    while b:
        out.append(b)
        b = kart.bone_map.get(b["parent"]) if b["parent"] else None
    return out


def to_model(kart, cube, p, pose=None):
    pose = pose or {}
    if cube["rot"]:
        p = about(p, cube["pivot"], cube["rot"])
    for b in chain(kart, cube):
        r = bone_rotation(kart, b["name"], pose)
        if any(r):
            p = about(p, b["pivot"], r)
    return p


def to_local(kart, cube, p, pose=None):
    pose = pose or {}
    for b in reversed(chain(kart, cube)):
        r = bone_rotation(kart, b["name"], pose)
        if any(r):
            p = inv_about(p, b["pivot"], r)
    if cube["rot"]:
        p = inv_about(p, cube["pivot"], cube["rot"])
    return p


def corners(kart, cube, pose=None):
    o, s = cube["origin"], cube["size"]
    pts = [(o[0] + dx * s[0], o[1] + dy * s[1], o[2] + dz * s[2]) for dx in (0, 1) for dy in (0, 1) for dz in (0, 1)]
    return [to_model(kart, cube, p, pose) for p in pts]


def aabb(kart, cube, pose=None):
    pts = corners(kart, cube, pose)
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def depth_inside(kart, cube, p, pose=None):
    """How far a model-space point is inside a cube (negative: outside)."""
    q = to_local(kart, cube, p, pose)
    o, s = cube["origin"], cube["size"]
    return min(min(q[k] - o[k], o[k] + s[k] - q[k]) for k in range(3))


def samples(kart, cube, pose=None, fine=False):
    o, s = cube["origin"], cube["size"]
    fs = (0, 0.25, 0.5, 0.75, 1) if fine else (0, 0.5, 1)
    return [to_model(kart, cube, (o[0] + fx * s[0], o[1] + fy * s[1], o[2] + fz * s[2]), pose)
            for fx in fs for fy in fs for fz in (0, 0.25, 0.5, 0.75, 1)]


def overlap_area(subject, clip):
    """Area of the intersection of two convex polygons (Sutherland-Hodgman)."""
    def signed(poly):
        return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly))) / 2
    if signed(clip) < 0:
        clip = clip[::-1]
    out = subject
    for i in range(len(clip)):
        a, b = clip[i], clip[(i + 1) % len(clip)]
        inside = lambda p: (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9
        src, out = out, []
        for j in range(len(src)):
            p, q = src[j], src[(j + 1) % len(src)]
            if inside(p) != inside(q):
                d1 = (b[0] - a[0], b[1] - a[1])
                d2 = (q[0] - p[0], q[1] - p[1])
                den = d1[0] * d2[1] - d1[1] * d2[0]
                if abs(den) > 1e-12:
                    t = ((p[0] - a[0]) * d2[1] - (p[1] - a[1]) * d2[0]) / den
                    out.append((a[0] + t * d1[0], a[1] + t * d1[1]))
            if inside(q):
                out.append(q)
        if not out:
            return 0.0
    return abs(signed(out))


def coplanar_faces(kart, pose=None, only=None):
    """Pairs of faces that look the same way from one plane and overlap there."""
    faces = []
    for c in kart.cubes:
        pts = corners(kart, c, pose)
        centre = tuple(sum(p[k] for p in pts) / 8 for k in range(3))
        for face, ids in FACE_CORNER_IDS.items():
            quad = [pts[i] for i in ids]
            e1 = tuple(quad[1][k] - quad[0][k] for k in range(3))
            e2 = tuple(quad[3][k] - quad[0][k] for k in range(3))
            n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
            ln = math.sqrt(sum(v * v for v in n))
            if ln < 1e-12:
                continue
            n = tuple(v / ln for v in n)
            fc = tuple(sum(q[k] for q in quad) / 4 for k in range(3))
            if sum(n[k] * (fc[k] - centre[k]) for k in range(3)) < 0:
                n = tuple(-v for v in n)
            faces.append((c, face, quad, n, sum(n[k] * fc[k] for k in range(3)), e1))
    buckets = {}
    for f in faces:
        buckets.setdefault(tuple(round(v, 2) for v in f[3]), []).append(f)
    found = []
    for group in buckets.values():
        group.sort(key=lambda f: f[4])
        for i, fa in enumerate(group):
            for fb in group[i + 1:]:
                if fb[4] - fa[4] > 0.012:
                    break
                if fa[0] is fb[0] or sum(fa[3][k] * fb[3][k] for k in range(3)) < 0.99995:
                    continue
                if only and fa[0]["bone"] not in only and fb[0]["bone"] not in only:
                    continue
                n, e1 = fa[3], fa[5]
                l1 = math.sqrt(sum(v * v for v in e1))
                ax = tuple(v / l1 for v in e1)
                ay = (n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0])
                to2d = lambda q: (sum(q[k] * ax[k] for k in range(3)), sum(q[k] * ay[k] for k in range(3)))
                area = overlap_area([to2d(q) for q in fa[2]], [to2d(q) for q in fb[2]])
                if area > 0.03:
                    found.append(f"z-fight: {fa[0]['name']} / {fb[0]['name']} ({fa[1]}/{fb[1]}, {area:.2f} sq px)")
    return found


def rider_parts(hip):
    """An example seated player (vanilla proportions, arms forward to a
    steering wheel, legs forward): (name, origin, size, pivot, rotations,
    shift). Adapt it to YOUR riding animation - the point is to test the model
    against the pose the game will really show."""
    dy, dz = hip[1] - 12.0, hip[2]
    lean = (10.0, 0.0, 0.0)
    out = [("torso", (-4, 12 + dy, dz - 2), (8, 12, 4), (0, 24 + dy, dz), [lean], (0, 0, -2)),
           ("head", (-4, 24 + dy, dz - 4), (8, 8, 8), (0, 24 + dy, dz), [lean], (0, 0, -2))]
    for side in (1, -1):
        out.append((f"arm{side}", (4 if side > 0 else -8, 12 + dy, dz - 2), (4, 12, 4), (side * 5, 22 + dy, dz), [(-80.0, 0.0, 0.0), lean], (0, 0, -4)))
        out.append((f"leg{side}", (-0.1 if side > 0 else -3.9, dy, dz - 2), (4, 12, 4), (side * 1.9, 12 + dy, dz), [(-90.0, -5.0 * side, 0.0)], (0, 0, 1)))
    return out


def rider_points(hip):
    for name, o, size, pivot, rots, shift in rider_parts(hip):
        for fx in (0.08, 0.5, 0.92):
            for fy in (0.04, 0.25, 0.5, 0.75, 0.96):
                for fz in (0.08, 0.5, 0.92):
                    q = about((o[0] + fx * size[0], o[1] + fy * size[1], o[2] + fz * size[2]), pivot, rots[0])
                    if len(rots) > 1:
                        q = about(q, (0, 24 + hip[1] - 12.0, hip[2]), rots[1])
                    yield name, tuple(q[k] + shift[k] for k in range(3))


def validate(kart, spec):
    problems = []
    cubes = kart.cubes
    if len(cubes) > spec["cap"]:
        problems.append(f"{len(cubes)} cubes exceed the cap of {spec['cap']}")
    seen = {}
    for c in cubes:
        key = json.dumps([c["bone"], c["origin"], c["size"], c["rot"], c["pivot"]])
        if key in seen:
            problems.append(f"duplicate cube {c['name']} = {seen[key]}")
        seen[key] = c["name"]
    problems += coplanar_faces(kart)
    boxes = [aabb(kart, c) for c in cubes]
    wheel_bones = set(spec.get("wheel_bones", ("A", "B", "C", "D")))
    for wheel in sorted(wheel_bones):
        widths = [c["size"][0] for c in cubes if c["bone"] == wheel and c["name"].startswith("tyre")]
        if len(set(widths)) != len(widths):
            problems.append(f"wheel {wheel}: two tyre slabs share a width")
    for gname, members in spec["groups"].items():
        idx = [i for i, c in enumerate(cubes) if c["bone"] in members]
        if not idx:
            continue
        touched, frontier = {idx[0]}, [idx[0]]
        while frontier:
            i = frontier.pop()
            for j in idx:
                if j not in touched and all(min(boxes[i][1][k], boxes[j][1][k]) - max(boxes[i][0][k], boxes[j][0][k]) >= -0.06 for k in range(3)):
                    touched.add(j)
                    frontier.append(j)
        problems += [f"stray cube in {gname}: {cubes[j]['name']}" for j in idx if j not in touched]
    lo = [min(b[0][k] for b in boxes) for k in range(3)]
    hi = [max(b[1][k] for b in boxes) for k in range(3)]
    if spec.get("symmetric", True) and abs(lo[0] + hi[0]) > 0.01:
        problems.append(f"asymmetric: x spans {lo[0]:.2f}..{hi[0]:.2f}")
    if lo[1] < -0.01:
        problems.append(f"below ground: {lo[1]:.2f}")
    for c, b in zip(cubes, boxes):
        if spec.get("ground_clearance") is not None and c["bone"] not in wheel_bones and b[0][1] < spec["ground_clearance"]:
            problems.append(f"{c['name']} is only {b[0][1]:.2f} above the ground")
    # the seated player
    found = {}
    for part, q in (rider_points(spec["hip"]) if spec.get("hip") else ()):
        for c, (blo, bhi) in zip(cubes, boxes):
            if c["bone"] in wheel_bones or any(q[k] < blo[k] or q[k] > bhi[k] for k in range(3)):
                continue
            d = depth_inside(kart, c, q)
            if d > 0.35:
                found[(part, c["name"])] = max(found.get((part, c["name"]), 0), d)
    problems += [f"rider: {part} is {d:.2f} inside {cube}" for (part, cube), d in sorted(found.items())]
    # The steering shaft must stay in the body for its first quarter. (On two
    # karts it came out 16 percent along, in front of the windscreen; the
    # maintainer moved the cowl over it by hand - after that, 28 percent.)
    if spec.get("shaft_buried"):
        shaft = next((c for c in cubes if c["name"] == "shaft"), None)
        if shaft is None:
            problems.append("no steering shaft to check")
        else:
            o, s = shaft["origin"], shaft["size"]
            fixed = [c for c in cubes if c["bone"] not in {"steering_column", "steering_wheel"}
                     and not any(c["bone"] in pose for pose in spec.get("poses", {}).values())]
            for fz in [i / 32 for i in range(9)]:  # 0 .. 0.25 of its length
                for p in [(o[0] + fx * s[0], o[1] + fy * s[1], o[2] + fz * s[2]) for fx in (0, 0.5, 1) for fy in (0, 0.5, 1)]:
                    q = to_model(kart, shaft, p)
                    if not any(depth_inside(kart, c, q) > -0.005 for c in fixed):
                        problems.append(f"the steering shaft shows {fz:.0%} along, at {tuple(round(v, 2) for v in q)}")
                        break
                else:
                    continue
                break
    # the animated poses
    for pname, pose in spec.get("poses", {}).items():
        moving = set(pose)
        problems += [f"{pname}: {p}" for p in coplanar_faces(kart, pose, only=moving)]
        for c in cubes:
            if c["bone"] not in moving:
                continue
            side = 1 if kart.bone_map[c["bone"]]["pivot"][0] > 0 else -1
            hit = None
            for q in samples(kart, c, pose, fine=True):
                if side * q[0] < 0.2:
                    hit = f"crosses the centre line at {tuple(round(v, 2) for v in q)}"
                for wname, w in spec.get("wheels", {}).items():
                    cx = w["side"] * w["x"]
                    if abs(q[0] - cx) < w["w"] / 2 + 0.1 and math.hypot(q[1] - w["y"], q[2] - w["z"]) < w["r"] + 0.25:
                        hit = f"hits wheel {wname} at {tuple(round(v, 2) for v in q)}"
                for o, (blo, bhi) in zip(cubes, boxes):
                    if o["bone"] in moving or o["bone"] in wheel_bones or any(q[k] < blo[k] - 0.01 or q[k] > bhi[k] + 0.01 for k in range(3)):
                        continue
                    if depth_inside(kart, o, q) > spec.get("pose_tolerance", 0.25):
                        hit = f"enters {o['name']} at {tuple(round(v, 2) for v in q)}"
                if hit:
                    problems.append(f"{pname}: {c['name']} {hit}")
                    break
    return problems, (lo, hi)
