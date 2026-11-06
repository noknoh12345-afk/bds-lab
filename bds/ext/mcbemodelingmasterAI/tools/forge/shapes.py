"""The forge, part 1: a model as bones and boxes, and the shape tools.

Conventions:
 - model front is -Z, ground is y = 0, +x is the kart's left (wheels A, B);
 - Bedrock reads a JSON rotation [rx, ry, rz] as right-handed (-rx, ry, -rz);
 - a bone's JSON rotation is its bind pose; an animation's rotation is ADDED
   to it component by component.

Shape rules (the maintainer's, taught over four karts - see docs/03-shape-rules.md):
 - slopes and curves are tilted boxes joined corner to corner, never stairs;
 - where a width steps, a box with the narrow link's own tilt is splayed out
   from its corner to the wider link's corner;
 - a joint that bends inward (a valley) is filled by running both links on
   past the corner; a tilted part's END runs into whatever it meets;
 - pieces that must read as one turn about ONE shared pivot;
 - where two faces would share a plane, one part is made a hair smaller.
"""
from __future__ import annotations

import math


def rot_json(v, rot):
    rx, ry, rz = (math.radians(-rot[0]), math.radians(rot[1]), math.radians(-rot[2]))
    x, y, z = v
    y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    return (x, y, z)


def about(p, pivot, rot):
    rel = rot_json(tuple(p[i] - pivot[i] for i in range(3)), rot)
    return tuple(pivot[i] + rel[i] for i in range(3))


def sub(a, b):
    return tuple(a[i] - b[i] for i in range(3))


def unit(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


def euler_json(ax, ay, az):
    """The JSON rotation that turns a box's own axes onto the unit axes ax, ay, az."""
    b = -math.asin(max(-1.0, min(1.0, ax[2])))
    if abs(ax[2]) > 0.99999:
        # gimbal lock (the box's own x lies along z): only a - c is defined, take c = 0
        a, c = math.atan2(-az[1], ay[1]), 0.0
    else:
        a, c = math.atan2(ay[2], az[2]), math.atan2(ax[1], ax[0])
    return (round(-math.degrees(a), 4), round(math.degrees(b), 4), round(-math.degrees(c), 4))


class Model:
    """Bones and boxes. (`Kart` is the same class: the forge was born building karts.)"""

    def __init__(self, name):
        self.name = name
        self.bones: list[dict] = []
        self.bone_map: dict[str, dict] = {}
        self.cubes: list[dict] = []

    # --- primitives ------------------------------------------------------
    def bone(self, name, parent, pivot, **extra):
        b = {"name": name, "parent": parent, "pivot": [round(v, 4) for v in pivot], **extra}
        self.bones.append(b)
        self.bone_map[name] = b
        return b

    def box(self, bone, name, x0, x1, y0, y1, z0, z1, mat, rot=None, pivot=None, decal=None, seamless=False, dens=None, only=None):
        """A cube. With `only` (a face name, or two opposite ones) it is a PLATE:
        zero thickness along that face's normal, only those faces textured, and
        the decal may leave texels transparent (return None) to cut its outline
        - the entity material must be alpha-tested (`entity_alphatest`).
        `only=("up", "down")` is how the vanilla Ender Dragon makes a wing
        membrane: one plane, its curved edge cut by alpha, seen from both
        sides. Paint such a plate by position (p.local()) so that both faces
        show the same colour at the same point; the forge lights them alike."""
        if isinstance(only, str):
            only = (only,)
        flat = {"east": 0, "west": 0, "up": 1, "down": 1, "north": 2, "south": 2}.get(only[0]) if only else None
        for axis, (a, b) in enumerate(((x0, x1), (y0, y1), (z0, z1))):
            assert (b == a) if axis == flat else (b > a), (name, axis)
        assert not any(c["name"] == name for c in self.cubes), f"duplicate name {name}"
        self.cubes.append({
            "bone": bone, "name": name,
            # five decimals: hand-finished values (the cockpit) arrive with five and must survive as given
            "origin": [round(x0, 5), round(y0, 5), round(z0, 5)],
            "size": [round(x1 - x0, 5), round(y1 - y0, 5), round(z1 - z0, 5)],
            "rot": [round(v, 5) for v in rot] if rot else None,
            "pivot": [round(v, 5) for v in pivot] if pivot else None,
            "mat": mat, "decal": decal, "seamless": seamless, "dens": dens, "only": only,
        })
        return self.cubes[-1]

    def remove(self, name):
        """Drops a cube (a shared part a kart replaces with its own)."""
        self.cubes.remove(self.cube(name))

    def pair(self, bone_l, bone_r, name, x0, x1, y0, y1, z0, z1, mat, rot=None, pivot=None, decal=None, **kw):
        """A left (+x) cube and its mirror image on the right."""
        self.box(bone_l, name + "_l", x0, x1, y0, y1, z0, z1, mat, rot, pivot, decal, **kw)
        mrot = [rot[0], -rot[1], -rot[2]] if rot else None
        mpiv = [-pivot[0], pivot[1], pivot[2]] if pivot else None
        self.box(bone_r, name + "_r", -x1, -x0, y0, y1, z0, z1, mat, mrot, mpiv, decal, **kw)

    def cube(self, name):
        return next(c for c in self.cubes if c["name"] == name)

    def mirror(self, name, new_name, bone=None, inset=0.0, decal=None):
        """The mirror image of a cube about x = 0; inset shortens it a hair at
        both ends so the pair never shows one end plane twice."""
        c = self.cube(name)
        o, sz = c["origin"], c["size"]
        rot = [c["rot"][0], -c["rot"][1], -c["rot"][2]] if c["rot"] else None
        piv = [-c["pivot"][0], c["pivot"][1], c["pivot"][2]] if c["pivot"] else None
        only = tuple({"east": "west", "west": "east"}.get(f, f) for f in c["only"]) if c.get("only") else None
        m = self.box(bone or c["bone"], new_name, -(o[0] + sz[0]), -o[0], o[1], o[1] + sz[1], o[2] + inset, o[2] + sz[2] - inset,
                     c["mat"], rot, piv, decal if decal is not None else c["decal"], c["seamless"], c["dens"], only)
        return m

    # --- tilted parts ----------------------------------------------------
    def plank(self, bone, name, anchor, toward, normal, x_off, width, thick, mat, decal=None, lift=0.0, extend=(0.0, 0.0), **kw):
        """A box whose TOP face lies in the plane with `normal`, running from
        anchor to toward; across, it spans x_off .. x_off + width of its own
        x axis (normal x direction)."""
        az = unit(sub(toward, anchor))
        dot = sum(normal[i] * az[i] for i in range(3))
        ay = unit(tuple(normal[i] - dot * az[i] for i in range(3)))
        ax = cross(ay, az)
        length = math.sqrt(sum(c * c for c in sub(toward, anchor)))
        kw.setdefault("seamless", True)
        return self.box(bone, name, anchor[0] + x_off, anchor[0] + x_off + width, anchor[1] - thick, anchor[1] + lift,
                        anchor[2] - extend[0], anchor[2] + length + extend[1], mat,
                        rot=euler_json(ax, ay, az), pivot=anchor, decal=decal, **kw)

    def slope(self, bone, name, x0, x1, front, rear, thick, mat, decal=None, extend=(0.0, 0.0), **kw):
        """A box whose TOP face runs from front=(z, y) to rear=(z, y) in the side profile."""
        (za, ya), (zb, yb) = front, rear
        length = math.hypot(zb - za, yb - ya)
        angle = math.degrees(math.atan2(yb - ya, zb - za))
        kw.setdefault("seamless", True)
        return self.box(bone, name, x0, x1, ya - thick, ya, za - extend[0], za + length + extend[1], mat,
                        rot=(angle, 0, 0), pivot=((x0 + x1) / 2, ya, za), decal=decal, **kw)

    def chain_pair(self, bone, name, x0, x1, points, thick, mat, decal=None, **kw):
        """Left and right chains of links along `points` (front to rear). At a
        valley both links run on past the corner; alternate links are a hair
        narrower so no two share a side plane."""
        angles = [math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0]) for i in range(len(points) - 1)]
        for i in range(len(points) - 1):
            front = rear = 0.0
            if i > 0 and angles[i] > angles[i - 1]:
                front = thick * math.tan((angles[i] - angles[i - 1]) / 2) + 0.05
            if i + 1 < len(angles) and angles[i + 1] > angles[i]:
                rear = thick * math.tan((angles[i + 1] - angles[i]) / 2) + 0.05
            inset = 0.03 * (i % 2)
            for side, tag in ((1, "l"), (-1, "r")):
                lo, hi = sorted((side * (x0 + inset), side * (x1 - inset)))
                self.slope(bone, f"{name}{i}_{tag}", lo, hi, points[i], points[i + 1], thick, mat, decal, extend=(front, rear), **kw)

    def roll_chain_pair(self, bone, name, x_edge, points, roll, width, thick, mat, decal=None, **kw):
        """Left and right chains of links hinged on the outer top edge (x_edge)
        of a chain_pair along the same points, each rolled `roll` degrees down
        and out about its link: a rounded shoulder on a fender or a panel.
        Valley joints run on past the corner like chain_pair's."""
        angles = [math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0]) for i in range(len(points) - 1)]
        rr = math.radians(roll)
        for i in range(len(points) - 1):
            front = rear = 0.0
            if i > 0 and angles[i] > angles[i - 1]:
                front = thick * math.tan((angles[i] - angles[i - 1]) / 2) + 0.05
            if i + 1 < len(angles) and angles[i + 1] > angles[i]:
                rear = thick * math.tan((angles[i + 1] - angles[i]) / 2) + 0.05
            (za, ya), (zb, yb) = points[i], points[i + 1]
            ln = math.hypot(zb - za, yb - ya)
            up = (0.0, (zb - za) / ln, -(yb - ya) / ln)
            normal = (math.sin(rr), math.cos(rr) * up[1], math.cos(rr) * up[2])
            w = width - 0.03 * (i % 2)
            # (a hair past the link's own ends, so their end faces never share a plane)
            self.plank(bone, f"{name}{i}_l", (x_edge, ya, za), (x_edge, yb, zb), normal, 0.0, w, thick, mat, decal,
                       extend=(front + 0.03, rear + 0.03), **kw)
            self.mirror(f"{name}{i}_l", f"{name}{i}_r")

    def chain(self, bone, name, x0, x1, points, thick, mat, decal=None, **kw):
        """One centred chain of links (see chain_pair)."""
        angles = [math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0]) for i in range(len(points) - 1)]
        for i in range(len(points) - 1):
            front = rear = 0.0
            if i > 0 and angles[i] > angles[i - 1]:
                front = thick * math.tan((angles[i] - angles[i - 1]) / 2) + 0.05
            if i + 1 < len(angles) and angles[i + 1] > angles[i]:
                rear = thick * math.tan((angles[i + 1] - angles[i]) / 2) + 0.05
            inset = 0.03 * (i % 2)
            self.slope(bone, f"{name}{i}", x0 + inset, x1 - inset, points[i], points[i + 1], thick, mat, decal, extend=(front, rear), **kw)

    def taper_walls(self, bone, name, rear, front, top_rear, top_front, thick_x, links, extend=(0.0, 0.0), **kw):
        """Left and right walls whose OUTER face runs straight from rear=(x, z)
        to front=(x, z) in plan while the top edge falls from top_rear to
        top_front: boxes pitched, then yawed. links = [(from, to, depth,
        material, decal)] as fractions of the run; extend = (past the rear,
        past the front), for valley joints."""
        dx, dz, dy = front[0] - rear[0], front[1] - rear[1], top_front - top_rear
        run = math.hypot(dx, dz)
        length = math.hypot(run, dy)
        pitch = math.degrees(math.atan2(-dy, run))
        yaw = math.degrees(math.atan2(-dx, -dz))
        d = (dx / length, dy / length, dz / length)
        for i, (f0, f1, depth, mat, decal) in enumerate(links):
            p = (rear[0] + d[0] * f0 * length, top_rear + d[1] * f0 * length, rear[1] + d[2] * f0 * length)
            seg = (f1 - f0) * length
            back = extend[0] if i == 0 else 0.0
            ahead = extend[1] if i == len(links) - 1 else 0.0
            self.pair(bone, bone, f"{name}{i}", p[0] - thick_x, p[0], p[1] - depth, p[1], p[2] - seg - ahead, p[2] + back, mat,
                      rot=(pitch, yaw, 0), pivot=p, decal=decal, **kw)

    def octagon(self, bone, name, cx, cy, z0, z1, radius, mat, decal=None, **kw):
        """An eight-sided cylinder along z: four slabs a 45 degree step apart
        (each a hair shorter than the last, so their ends never share a plane).
        On the -x side the slabs turn the other way: a true mirror image."""
        t = 2 * radius * math.tan(math.radians(22.5))
        turn = -45.0 if cx < 0 else 45.0
        for i in range(4):
            self.box(bone, f"{name}{i}", cx - t / 2, cx + t / 2, cy - radius, cy + radius, z0 + 0.03 * i, z1 - 0.03 * i, mat,
                     rot=(0, 0, turn * i) if i else None, pivot=(cx, cy, (z0 + z1) / 2) if i else None, decal=decal, **kw)

    def wheel(self, bone, side, spec, cap_mat="paint", brake_mat="dark"):
        """A 16-sided tyre (eight full slabs, each its own width), a four-slab
        octagonal rim, a cap, and a brake disc toward the body."""
        cx, cy, cz, r, w = side * spec["x"], spec["y"], spec["z"], spec["r"], spec["w"]
        t = 2 * r * math.tan(math.radians(11.25))
        for i in range(8):
            wi = w - 0.07 * ((i * 3) % 8)
            self.box(bone, f"tyre{i}_{bone}", cx - wi / 2, cx + wi / 2, cy - r, cy + r, cz - t / 2, cz + t / 2, "rubber",
                     rot=(i * 22.5, 0, 0) if i else None, pivot=(cx, cy, cz) if i else None, decal="tyre")
        out = side * (w / 2)
        rr = r * 0.62

        def xr(a, b):
            return tuple(sorted((cx + out + side * a, cx + out + side * b)))
        rt = 2 * rr * math.tan(math.radians(22.5))
        for i in range(4):
            x0, x1 = xr(-0.3 - 0.03 * i, 0.2 - 0.05 * i)
            self.box(bone, f"rim{i}_{bone}", x0, x1, cy - rr, cy + rr, cz - rt / 2, cz + rt / 2, "rim",
                     rot=(i * 45.0, 0, 0) if i else None, pivot=(cx, cy, cz) if i else None, decal="rim")
        x0, x1 = xr(0.2, 0.45)
        self.box(bone, f"cap_{bone}", x0, x1, cy - 0.8, cy + 0.8, cz - 0.8, cz + 0.8, cap_mat)
        lo, hi = sorted((cx - out - side * 0.15, cx - out + side * 0.3))
        self.box(bone, f"brake_{bone}", lo, hi, cy - r * 0.5, cy + r * 0.5, cz - r * 0.5, cz + r * 0.5, brake_mat)


Kart = Model
