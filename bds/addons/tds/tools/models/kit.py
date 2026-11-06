"""Bedrock entity models in code: bones and boxes -> per-face-UV geometry + painted textures.

Own implementation of the conventions documented in bds/ext/mcbemodelingmasterAI/docs (the forge there is not
run from this build):
 - 16 units = 1 block, ground y = 0, the model faces -z, +x is the model's left (docs/01);
 - a JSON rotation [rx, ry, rz] is applied as right-handed (-rx, ry, -rz), X then Y then Z, about the pivot;
   animation rotations ADD to a bone's bind rotation (docs/01);
 - the game draws the model mirrored in x: a cube's "east" UV shows on its LOW-x side, "west" on its high-x side,
   and across each face the texture runs as FACE_POINT says (docs/02, data/face-mapping.json);
 - curves and slopes are tilted boxes joined corner to corner, never stair steps (docs/03): `slope`, `chain`, `rise_x`;
 - every face owns its rectangle; pictures are painted BY POSITION (`p.local()`), so they run on across cubes;
   a thin thing (wing, flag, scarf, leaf) is ONE zero-thickness plate with two faces, its outline cut by
   transparent texels, both faces painted by position so they agree point for point (docs/05, docs/07).
Check and look with the lab: `node lab.mjs check -a tds`, `node lab.mjs render <geometry id> --anim <clip>@<s>`.
"""
from __future__ import annotations

import json
import math
import os

from PIL import Image

FACES = ('north', 'east', 'south', 'west', 'up', 'down')
FACE_AXES = {'north': (0, 1), 'south': (0, 1), 'east': (2, 1), 'west': (2, 1), 'up': (0, 2), 'down': (0, 2)}
FACE_LIGHT = {'up': 1.0, 'north': 0.95, 'south': 0.88, 'east': 0.91, 'west': 0.91, 'down': 0.74}
NORMAL = {'north': (0, 0, -1), 'south': (0, 0, 1), 'east': (-1, 0, 0), 'west': (1, 0, 0), 'up': (0, 1, 0), 'down': (0, -1, 0)}


def r5(v):
    v = round(float(v), 5)
    return 0.0 if v == 0 else v          # never -0.0 in a file


def face_point(c, face, u, v):
    """The point of `face` at texture position (u, v) (0..1, v down) in the cube's own unrotated frame, as the game
    draws it (docs/02): east on the low-x side running high z -> low z, west on the high-x side low z -> high z,
    north low x -> high x, south high x -> low x, up low x -> high x with its first row at the rear, down front first."""
    (x0, y0, z0), s = c['o'], c['s']
    x1, y1, z1 = x0 + s[0], y0 + s[1], z0 + s[2]
    if face == 'east':
        return (x0, y1 - v * s[1], z1 - u * s[2])
    if face == 'west':
        return (x1, y1 - v * s[1], z0 + u * s[2])
    if face == 'north':
        return (x0 + u * s[0], y1 - v * s[1], z0)
    if face == 'south':
        return (x1 - u * s[0], y1 - v * s[1], z1)
    if face == 'up':
        return (x0 + u * s[0], y1, z1 - v * s[2])
    return (x0 + u * s[0], y0, z0 + v * s[2])


def rot_about(v, pivot, rot):
    """the game's reading of a JSON rotation [rx, ry, rz]: right-handed (-rx, ry, -rz), X then Y then Z, about pivot"""
    rx, ry, rz = math.radians(-rot[0]), math.radians(rot[1]), math.radians(-rot[2])
    x, y, z = (v[i] - pivot[i] for i in range(3))
    y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    return (x + pivot[0], y + pivot[1], z + pivot[2])


def clamp(c):
    return tuple(max(0, min(255, int(round(v)))) for v in c)


def mul(c, f):
    return clamp(tuple(v * f for v in c[:3])) + tuple(c[3:])


def mix(a, b, t):
    return clamp(tuple(a[i] * (1 - t) + b[i] * t for i in range(3)))


def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + ((int(h[6:8], 16),) if len(h) == 8 else ())


class Pixel:
    __slots__ = ('cube', 'face', 'u', 'v', 'i', 'j', 'w', 'h', 'col', 'pal', 'variant', 'model')

    def local(self):
        """the texel's centre in the cube's own (unrotated) frame, as the game draws it"""
        return face_point(self.cube, self.face, self.u, self.v)

    def inbone(self):
        """the texel's centre in its bone's frame: local() turned by the cube's own rotation about its pivot"""
        q, c = self.local(), self.cube
        return rot_about(q, c['pivot'], c['rot']) if c['rot'] else q

    def mat(self, name):
        return self.pal[name]


class Model:
    def __init__(self, name, density=2.0, width=128, materials=None, variants=None, glow=('glow',), emissive=True):
        self.name, self.density, self.width = name, density, width
        self.bones, self.bmap, self.cubes = [], {}, []
        self.mats = {k: (hexc(v) if isinstance(v, str) else tuple(v)) for k, v in (materials or {}).items()}
        self.variants = variants or {'': {}}     # variant suffix -> {material: colour, '_alpha': {material: a} | int}
        self.glow = set(glow)                    # self-lit materials (low alpha under entity_emissive_alpha*)
        self.emissive = emissive
        self.decal = None                        # decal(p) -> colour, None (cut) or p.col
        self.locators = {}
        self.prefix = ''                         # put before every cube name (kitbash.level: one level's parts)

    # --- skeleton ---------------------------------------------------------------------------------------
    def bone(self, name, parent=None, pivot=(0, 0, 0), rot=None, locators=None):
        assert name not in self.bmap, name
        b = {'name': name, 'parent': parent, 'pivot': [r5(v) for v in pivot]}
        if rot and any(rot):
            b['rotation'] = [r5(v) for v in rot]
        if locators:
            b['locators'] = {k: [r5(x) for x in v] for k, v in locators.items()}
        self.bones.append(b)
        self.bmap[name] = b
        return b

    # --- boxes --------------------------------------------------------------------------------------------
    def box(self, bone, name, x0, x1, y0, y1, z0, z1, mat, rot=None, pivot=None, decal=None, dens=None, only=None, seam=False, flat=False,
            inflate=0.0, raw=False):
        """A cube. `only`: a PLATE - zero thickness across that face pair, only those faces textured (two opposite
        faces: both drawn, painted by position). `dens`: texels per unit, a number or {face: n}. `seam`: one link of a
        larger surface (no darkened rim). `flat`: no gradient or rim at all. `inflate`: drawn that much bigger on every
        side while its texture keeps the box's own size (a skin's overlay: its texels line up with the part under it).
        `raw`: the texture exactly as painted (no light or rim baked in: the game lights it as it lights the body)."""
        assert bone in self.bmap, (name, bone)
        name = self.prefix + name
        assert not any(c['name'] == name for c in self.cubes), f'duplicate cube {name}'
        if isinstance(only, str):
            only = (only,)
        thin = {'east': 0, 'west': 0, 'up': 1, 'down': 1, 'north': 2, 'south': 2}[only[0]] if only else None
        for ax, (a, b) in enumerate(((x0, x1), (y0, y1), (z0, z1))):
            assert (b == a) if ax == thin else (b > a), (name, ax, a, b)
        c = {'bone': bone, 'name': name, 'o': [r5(x0), r5(y0), r5(z0)], 's': [r5(x1 - x0), r5(y1 - y0), r5(z1 - z0)],
             'rot': [r5(v) for v in rot] if rot and any(rot) else None, 'pivot': None, 'mat': mat, 'decal': decal,
             'dens': dens, 'only': only, 'seam': seam, 'flat': flat, 'inflate': r5(inflate), 'raw': raw}
        if c['rot']:
            c['pivot'] = [r5(v) for v in (pivot or ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))]
        self.cubes.append(c)
        return c

    def mirror(self, name, new_name, bone=None):
        """the mirror image of a cube about x = 0 (rotation [rx, -ry, -rz])"""
        c = next(c for c in self.cubes if c['name'] in (name, self.prefix + name))
        o, s = c['o'], c['s']
        only = tuple({'east': 'west', 'west': 'east'}.get(f, f) for f in c['only']) if c['only'] else None
        m = self.box(bone or c['bone'], new_name, -(o[0] + s[0]), -o[0], o[1], o[1] + s[1], o[2], o[2] + s[2], c['mat'],
                     [c['rot'][0], -c['rot'][1], -c['rot'][2]] if c['rot'] else None,
                     [-c['pivot'][0], c['pivot'][1], c['pivot'][2]] if c['pivot'] else None,
                     c['decal'], c['dens'], only, c['seam'], c['flat'])
        return m

    def pair(self, bone_l, bone_r, name, x0, x1, y0, y1, z0, z1, mat, rot=None, pivot=None, **kw):
        """a cube on the +x side (the model's left, `name_l`) and its mirror (`name_r`)"""
        self.box(bone_l, name + '_l', x0, x1, y0, y1, z0, z1, mat, rot, pivot, **kw)
        return self.mirror(name + '_l', name + '_r', bone_r)

    # --- tilted parts (docs/03: slopes and curves are tilted boxes joined corner to corner) ----------------------
    def slope(self, bone, name, x0, x1, front, rear, thick, mat, extend=(0.0, 0.0), **kw):
        """a box whose TOP face runs from front=(z, y) to rear=(z, y) in the side profile (front z < rear z);
        the thickness hangs below/inside. A positive rx tilts the rear end up (docs/01)."""
        (za, ya), (zb, yb) = front, rear
        length = math.hypot(zb - za, yb - ya)
        ang = math.degrees(math.atan2(yb - ya, zb - za))
        kw.setdefault('seam', True)
        return self.box(bone, name, x0, x1, ya - thick, ya, za - extend[0], za + length + extend[1], mat,
                        rot=(ang, 0, 0), pivot=((x0 + x1) / 2, ya, za), **kw)

    def chain(self, bone, name, x0, x1, points, thick, mat, **kw):
        """links along points (front to rear); at a valley both links run on past the corner; alternate links are
        0.03 narrower so no two share a side plane"""
        ang = [math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0]) for i in range(len(points) - 1)]
        out = []
        for i in range(len(points) - 1):
            front = rear = 0.0
            if i > 0 and ang[i] > ang[i - 1]:
                front = thick * math.tan((ang[i] - ang[i - 1]) / 2) + 0.05
            if i + 1 < len(ang) and ang[i + 1] > ang[i]:
                rear = thick * math.tan((ang[i + 1] - ang[i]) / 2) + 0.05
            ins = 0.03 * (i % 2)
            out.append(self.slope(bone, f'{name}{i}', x0 + ins, x1 - ins, points[i], points[i + 1], thick, mat, extend=(front, rear), **kw))
        return out

    def rise_x(self, bone, name, a, b, z0, z1, thick, mat, extend=(0.0, 0.0), **kw):
        """a box whose TOP face runs from a=(x, y) to b=(x, y) in the front profile (a.x < b.x), the thickness on the
        side away from its top normal; turned about z (JSON rz = -angle: docs/01)."""
        (xa, ya), (xb, yb) = a, b
        length = math.hypot(xb - xa, yb - ya)
        ang = math.degrees(math.atan2(yb - ya, xb - xa))
        kw.setdefault('seam', True)
        return self.box(bone, name, xa - extend[0], xa + length + extend[1], ya - thick, ya, z0, z1, mat,
                        rot=(0, 0, -ang), pivot=(xa, ya, (z0 + z1) / 2), **kw)

    def octa_y(self, bone, name, cx, cz, y0, y1, r, mat, **kw):
        """an eight-sided prism standing on y: four slabs (the side length wide, 2r deep) a 45-degree step apart,
        each a hair lower than the last so no two tops share a plane"""
        t = 2 * r * math.tan(math.radians(22.5))
        out = []
        for i in range(4):
            out.append(self.box(bone, f'{name}{i}', cx - t / 2, cx + t / 2, y0 + 0.03 * i, y1 - 0.03 * i, cz - r, cz + r, mat,
                                rot=(0, 45.0 * i, 0) if i else None, pivot=(cx, (y0 + y1) / 2, cz), seam=True, **kw))
        return out

    def octa_x(self, bone, name, x0, x1, cy, cz, r, mat, **kw):
        """an eight-sided cylinder along x (a wheel): four slabs a 45-degree step apart, each a hair shorter"""
        t = 2 * r * math.tan(math.radians(22.5))
        out = []
        for i in range(4):
            out.append(self.box(bone, f'{name}{i}', x0 + 0.03 * i, x1 - 0.03 * i, cy - r, cy + r, cz - t / 2, cz + t / 2, mat,
                                rot=(45.0 * i, 0, 0) if i else None, pivot=((x0 + x1) / 2, cy, cz), seam=True, **kw))
        return out

    # --- layout and paint ---------------------------------------------------------------------------------
    def layout(self):
        faces = []
        for c in self.cubes:
            for f in FACES:
                if c['only'] and f not in c['only']:
                    continue
                ua, va = FACE_AXES[f]
                d = c['dens'].get(f, self.density) if isinstance(c['dens'], dict) else (c['dens'] or self.density)
                if f == 'down' and not c['only'] and not (isinstance(c['dens'], dict) and 'down' in c['dens']):
                    d = d / 2                     # undersides: half
                w, h = max(1, round(c['s'][ua] * d)), max(1, round(c['s'][va] * d))
                faces.append({'cube': c, 'face': f, 'w': w, 'h': h})
        order = sorted(range(len(faces)), key=lambda i: (-faces[i]['h'], -faces[i]['w'], i))
        x = y = row = 0
        for i in order:
            f = faces[i]
            if x + f['w'] > self.width:
                x, y, row = 0, y + row + 1, 0
            f['x'], f['y'] = x, y
            x += f['w'] + 1
            row = max(row, f['h'])
        used = y + row
        height = 16
        while height < used:
            height *= 2
        return faces, height

    def paint(self, faces, height, variant):
        over = self.variants[variant]
        pal = dict(self.mats)
        pal.update({k: (hexc(v) if isinstance(v, str) else tuple(v)) for k, v in over.items() if not k.startswith('_')})
        alpha = over.get('_alpha')
        tint = over.get('_tint')                 # a hologram: every texel turned to this hue by its brightness
        img = Image.new('RGBA', (self.width, height), (0, 0, 0, 0))
        px = img.load()
        p = Pixel()
        p.pal, p.variant, p.model = pal, variant, self
        for f in faces:
            c = f['cube']
            p.cube, p.face, p.w, p.h = c, f['face'], f['w'], f['h']
            base = pal[c['mat']]
            twin = bool(c['only']) and len(c['only']) > 1
            side = p.face in ('north', 'south', 'east', 'west')
            for j in range(p.h):
                for i in range(p.w):
                    p.i, p.j, p.u, p.v = i, j, (i + 0.5) / p.w, (j + 0.5) / p.h
                    p.col = base
                    col = self.decal(p) if (self.decal and c['decal']) else base
                    if col is None:
                        px[f['x'] + i, f['y'] + j] = (0, 0, 0, 0)
                        continue
                    a = col[3] if len(col) > 3 else 255
                    col = col[:3]
                    if tint:
                        lum = (0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2]) / 255
                        col = clamp(tuple(t * (0.45 + 0.75 * lum) for t in tint))
                    lit = c['mat'] in self.glow and not alpha
                    if c.get('raw'):
                        pass                                  # painted as it should look: the game's own light only
                    elif twin:
                        col = mul(col, 0.95)              # both faces of a plate alike: no per-face light, no rim
                    elif not lit and not c['flat']:
                        if side:
                            col = mul(col, 1.05 - 0.12 * p.v)
                        if not c['seam'] and min(p.w, p.h) >= 4:
                            if i in (0, p.w - 1) or j == p.h - 1:
                                col = mul(col, 0.84)
                            elif j == 0 and side:
                                col = mul(col, 1.07)
                        col = mul(col, FACE_LIGHT[p.face])
                    elif not lit:
                        col = mul(col, FACE_LIGHT[p.face])
                    if alpha is not None:
                        a = alpha.get(c['mat'], alpha.get('*', 255)) if isinstance(alpha, dict) else alpha
                    elif lit and self.emissive and a == 255:
                        a = 24                             # entity_emissive_alpha*: a low alpha is self-lit (docs/05)
                    px[f['x'] + i, f['y'] + j] = tuple(col) + (a,)
        return img

    def geometry(self, faces, height):
        by = {}
        for f in faces:
            by.setdefault(id(f['cube']), {})[f['face']] = {'uv': [f['x'], f['y']], 'uv_size': [f['w'], f['h']]}
        bones = []
        lo, hi = [1e9] * 3, [-1e9] * 3
        for b in self.bones:
            ob = {'name': b['name']}
            if b['parent']:
                ob['parent'] = b['parent']
            ob['pivot'] = b['pivot']
            for k in ('rotation', 'locators'):
                if b.get(k):
                    ob[k] = b[k]
            cubes = []
            for c in (c for c in self.cubes if c['bone'] == b['name']):
                oc = {'origin': c['o'], 'size': c['s']}
                if c.get('inflate'):
                    oc['inflate'] = c['inflate']
                if c['rot']:
                    oc['pivot'], oc['rotation'] = c['pivot'], c['rot']
                oc['uv'] = {f: by[id(c)][f] for f in FACES if f in by[id(c)]}
                cubes.append(oc)
                g = c.get('inflate') or 0
                for k in range(3):
                    lo[k] = min(lo[k], c['o'][k] - g); hi[k] = max(hi[k], c['o'][k] + c['s'][k] + g)
            if cubes:
                ob['cubes'] = cubes
            bones.append(ob)
        wide = max(hi[0] - lo[0], hi[2] - lo[2]) / 16 + 1.0
        tall = (hi[1] - min(0, lo[1])) / 16 + 0.5
        return {'format_version': '1.16.0', 'minecraft:geometry': [{
            'description': {'identifier': f'geometry.tds.{self.name}', 'texture_width': self.width, 'texture_height': height,
                            'visible_bounds_width': round(wide, 2), 'visible_bounds_height': round(tall, 2),
                            'visible_bounds_offset': [0, round(tall / 2 - 0.25, 2), 0]},
            'bones': bones}]}

    def textures(self):
        return [f'textures/entity/tds/{self.name}{v}' for v in self.variants]

    def outputs(self, rp):
        """{path: bytes} of the geometry and one texture per variant"""
        import io
        faces, height = self.layout()
        out = {os.path.join(rp, 'models', 'entity', 'tds', f'{self.name}.geo.json'):
               (json.dumps(self.geometry(faces, height), indent=1) + '\n').encode()}
        for v in self.variants:
            buf = io.BytesIO()
            self.paint(faces, height, v).save(buf, format='PNG', optimize=True)
            out[os.path.join(rp, 'textures', 'entity', 'tds', f'{self.name}{v}.png')] = buf.getvalue()
        return out


def sprite(path):
    """a pixel-art sprite (tools/art/out) as rows of RGBA tuples, sampled by position"""
    im = Image.open(path).convert('RGBA')
    return im.width, im.height, im.load()


def sample(spr, u, v):
    w, h, px = spr
    return px[min(w - 1, max(0, int(u * w))), min(h - 1, max(0, int(v * h)))]


def over(base, top):
    """top (RGBA, alpha 0..255) over an RGB base"""
    if top[3] == 0:
        return base
    t = top[3] / 255
    return mix(base, top[:3], t)


def write(outputs, check=False):
    stale = [p for p, data in outputs.items() if not os.path.exists(p) or open(p, 'rb').read() != data]
    if not check:
        for p in stale:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, 'wb') as f:
                f.write(outputs[p])
    return stale
