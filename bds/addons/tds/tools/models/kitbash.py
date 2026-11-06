"""Gear for any rig (rigs.py): theme shells over the vanilla body and a library of parts (head gear, armour, cloaks, wings,
weapons, glows) that the roster (roster.py) combines into one original look per entity.

Every part is placed from the rig's own boxes (`rig.box(part, grow)`), so the same call fits a zombie, an illager or a
skeleton. A theme is a palette plus the way its shell is painted by position (molten crust with glowing cracks, frost
rime, void specks, the pale fallen bone, a hazmat suit ...); a shell leaves holes where the vanilla body shows through.
Materials every look has: t1 t2 t3 (the theme), glow (self-lit), trim, plus fixed metal/wood/cloth/gold ... (MATS);
a recipe may recolour any of them. Conventions as kit.py: the model faces -z, +x is its left, 16 units = 1 block.
"""
from __future__ import annotations

import math

from hq_parts import along, hq_decal, octa
from kit import Model, mix, mul
from parts import emblem_px, lit

MATS = dict(metal='#9aa0aa', metal2='#5e646e', dark='#2a2630', wood='#6a4a2e', wood2='#4a321e', gold='#d8a838', gold2='#a87a20',
            cloth='#7a3e2e', cloth2='#5a2a20', leather='#5a3a24', bone='#e8dcc8', white='#eef0f2', red='#c83838', blue='#3c5ab4',
            green='#4a8a3a', gem='#ff4a5a', rope='#a88a5a', gun='#2c2c34', gun2='#4a4a54', flash='#fff0a0', glass='#9ad8ff',
            paper='#e8dcb8', skinc='#c8a080', black='#16141c', orange='#e88a2c', purple='#7a3aa8', ice='#9ae4ff', ice2='#5ab4e8')

THEMES = {
    'plain': dict(pal=dict(t1='#6a5a4a', t2='#4a3e32', t3='#8a7a6a', glow='#ffe080', trim='#c8a040'), style=None),
    'molten': dict(pal=dict(t1='#2e1a14', t2='#4a2418', t3='#6a3420', glow='#ff7a1a', trim='#ffb040'), style='crust', cover=0.92, eyes='#ffd060'),
    'fallen': dict(pal=dict(t1='#a8b0c0', t2='#7a8294', t3='#d8dce6', glow='#7ae8ff', trim='#5a6a8a'), style='bone', cover=0.7, eyes='#9af0ff'),
    'void': dict(pal=dict(t1='#1c1228', t2='#2e1c44', t3='#4a2c6a', glow='#c070ff', trim='#7a4aa8'), style='specks', cover=0.66, eyes='#e090ff'),
    'frost': dict(pal=dict(t1='#cfeeff', t2='#8cc8ee', t3='#f0faff', glow='#d8ffff', trim='#5aa8d8'), style='ice', cover=0.56, eyes=None),
    'hazmat': dict(pal=dict(t1='#e8c838', t2='#b89a28', t3='#3a3a3a', glow='#a8ff3c', trim='#2a2a2a'), style='suit', cover=1.0, eyes=None),
    'toxic': dict(pal=dict(t1='#4a6a24', t2='#33501a', t3='#7a9a3a', glow='#b8ff3c', trim='#2a3a14'), style='drip', cover=0.62, eyes='#d8ff60'),
    'shadow': dict(pal=dict(t1='#22202c', t2='#16141e', t3='#3a3648', glow='#b8b8ff', trim='#5a5470'), style='cloak', cover=0.9, eyes='#c8c8ff'),
    'royal': dict(pal=dict(t1='#7a1a24', t2='#5a1018', t3='#d8a838', glow='#ffd060', trim='#d8a838'), style=None),
    'lab': dict(pal=dict(t1='#e8eef0', t2='#b8c4c8', t3='#5a6a70', glow='#7cff8c', trim='#3a8a9a'), style='bandage', cover=0.5, eyes=None),
    'rage': dict(pal=dict(t1='#8a1a14', t2='#5a0e0a', t3='#c83020', glow='#ff4020', trim='#2a0a08'), style='veins', cover=0.5, eyes='#ff3020'),
    'crystal': dict(pal=dict(t1='#7ad8e8', t2='#3a9ab8', t3='#c8f4ff', glow='#e8ffff', trim='#2a6a8a'), style='facets', cover=0.55, eyes='#e8ffff'),
    'grave': dict(pal=dict(t1='#5a5048', t2='#3e3630', t3='#7a6e60', glow='#9aff9a', trim='#2e2a26'), style='dirt', cover=0.45, eyes=None),
    'storm': dict(pal=dict(t1='#2a3448', t2='#1a2232', t3='#4a5a78', glow='#ffe84a', trim='#8aa8ff'), style='bolts', cover=0.55, eyes='#ffe84a'),
    'plant': dict(pal=dict(t1='#4a7a2a', t2='#2e5a1a', t3='#8a6a3a', glow='#e8ff6a', trim='#6a4a2a'), style='leaf', cover=0.6, eyes=None),
    'gold': dict(pal=dict(t1='#d8a838', t2='#a87a20', t3='#ffe07a', glow='#fff0a0', trim='#7a5a14'), style='plate', cover=0.8, eyes=None),
}


def vnoise(x, y, z, s=0.9):
    """smooth 0..1 noise by position (blobs that run on across cubes)"""
    return (math.sin(x * s * 1.7 + y * s * 0.9 + 1.3) + math.sin(y * s * 1.3 - z * s * 1.1 + 0.7) + math.sin(z * s * 1.9 + x * s * 0.6 + 2.1)) / 6 + 0.5


def hash3(x, y, z):
    h = (int(math.floor(x * 2)) * 73856093) ^ (int(math.floor(y * 2)) * 19349663) ^ (int(math.floor(z * 2)) * 83492791)
    return (h & 0xffff) / 65535


def dress(name, rig, theme='plain', mats=None, hidden=False, width=256, density=2.0):
    """a gear model on `rig` (its bones repeated) in `theme`, `mats` recolouring any material; hidden: drawn see-through"""
    th = THEMES[theme]
    pal = {**MATS, **th['pal'], **(mats or {})}
    variants = {'': {'_alpha': {'*': 150, 'glow': 230}}} if hidden else None
    m = Model(name, density=density, width=width, materials=pal, variants=variants, emissive=not hidden)
    m.glow |= {'glow', 'flash'}
    for b in rig.bones:
        if b[0] not in m.bmap:
            m.bone(b[0], b[1], b[2], rot=b[3] if len(b) > 3 else None)
    m.rig, m.theme, m.th, m.emblem, m.own = rig, theme, th, None, None
    m.decal = lambda p, m=m: paint(m, p)
    return m


def tag(c, **kw):
    c.update(kw)
    return c


def has(m, part):
    return part in m.rig.parts


# ------------------------------------------------------------------------------------------------ shells
SHELL_OFF = {'head': 0.0, 'body': 0.06, 'rarm': 0.03, 'larm': 0.09, 'rleg': 0.01, 'lleg': 0.04, 'robe': 0.12, 'neck': 0.07, 'tail': 0.11, 'waist': 0.08}
# gear sits outside the shells (0.3 .. 0.42 off the body): what is worn over a part keeps 0.45+ from it


def shell(m, parts=('head', 'body', 'rarm', 'larm', 'rleg', 'lleg'), grow=0.3, cover=None, face=None, theme=None, mat='t1', tag_='shell'):
    """the theme's skin over the vanilla parts, `grow` off them (0.2+ from every vanilla face), holes where the body shows"""
    th = THEMES[theme or m.theme]
    if not th.get('style'):
        return
    for part in parts:
        if not has(m, part):
            continue
        g = grow + SHELL_OFF.get(part, 0.1)                  # each part its own distance: neighbouring shells never share a plane
        b = m.rig.box(part, g)
        tag(m.box(m.rig.bone(part), f'{tag_}_{part}', *b, mat, decal='shell', seam=True),
            style=th['style'], cover=th.get('cover', 0.7) if cover is None else cover, part=part, face=face if face is not None else th.get('eyes'))


def shell_px(m, p):
    c, q, f = p.cube, p.local(), p.face
    style, cover = c.get('style'), c.get('cover', 0.7)
    x, y, z = q
    pal = p.pal
    if c.get('part') == 'head' and f == 'north':               # the face: open to the vanilla one, or the theme's eyes on a mask
        hb = m.rig.box('head')
        u = (x - hb[0]) / (hb[1] - hb[0])
        v = (hb[3] - y) / (hb[3] - hb[2])
        eyes = c.get('face')
        if eyes and 0.32 < v < 0.5 and (0.16 < u < 0.4 or 0.6 < u < 0.84):
            return lit(hexrgb(eyes))
        if not eyes and 0.25 < v < 0.75 and 0.12 < u < 0.88:
            return None
    if f == 'down' and c.get('part') in ('head', 'body'):
        return None
    n = vnoise(x, y, z, 0.55)
    if style == 'suit':
        if c.get('part') == 'head':
            return pal['t3'] if f == 'north' else p.col
        if abs((y % 6) - 3) < 0.35:
            return pal['t2']                                     # seams
        return mix(pal['t1'], (255, 255, 255), 0.35) if abs(y - 14.5) < 0.6 and c.get('part') in ('body', 'rarm', 'larm') else p.col
    if n > cover + 0.15 * math.sin(y * 0.7):
        return None
    if style == 'crust':
        k = abs(math.sin(x * 1.3 + y * 0.7 + 0.4) * math.cos(z * 1.1 - y * 0.9))
        if k < 0.1:
            return lit(pal['glow'] if k > 0.04 else pal['trim'])
        return pal['t2'] if n > 0.55 else (pal['t3'] if hash3(x, y, z) > 0.85 else p.col)
    if style == 'bone':
        if abs(math.sin(y * 1.1 + x * 0.4)) < 0.07:
            return lit(pal['glow'])
        return pal['t3'] if n < 0.3 else (pal['t2'] if (x + y + z) % 2.2 < 0.4 else p.col)
    if style == 'specks':
        if hash3(x * 1.3, y * 1.3, z * 1.3) > 0.94:
            return lit(pal['glow'])
        return pal['t3'] if n > cover - 0.08 else (pal['t2'] if n > 0.4 else p.col)
    if style == 'ice':
        if n > cover - 0.07:
            return pal['t3']                                     # the rime round each patch
        return lit(pal['glow']) if abs(math.sin(x * 1.7 - y * 1.2 + z)) < 0.06 else (pal['t2'] if n > 0.35 else p.col)
    if style == 'drip':
        top = y - (m.rig.box(c['part'])[2] if has(m, c['part']) else 0)
        if hash3(x, 0, z) > 0.6 and top < 3 + 4 * hash3(x * 0.5, 1, z * 0.5):
            return None if f not in ('up',) and top < 1 else p.col
        return lit(pal['glow']) if hash3(x, y, z) > 0.93 else (pal['t2'] if n > 0.45 else p.col)
    if style == 'cloak':
        return pal['t2'] if n > 0.5 else (pal['t3'] if abs(math.sin(y * 2.0 + x)) < 0.08 else p.col)
    if style == 'bandage':
        return pal['t2'] if (y * 1.4 + x * 0.3) % 1.0 < 0.18 else (mul(pal['red'], 0.9) if hash3(x, y, z) > 0.95 else p.col)
    if style == 'veins':
        k = abs(math.sin(x * 2.1 + y * 0.9) + math.sin(z * 1.7 - y * 1.3))
        return lit(pal['glow']) if k < 0.08 else (pal['t2'] if k < 0.4 else None)
    if style == 'facets':
        return lit(pal['glow']) if (x * 0.7 + y * 1.1 + z * 0.9) % 2.4 < 0.25 else (pal['t3'] if n > cover - 0.1 else (pal['t2'] if (x - z) % 2 < 1 else p.col))
    if style == 'dirt':
        return pal['t2'] if n > 0.4 else (lit(pal['glow']) if hash3(x, y, z) > 0.97 else p.col)
    if style == 'bolts':
        k = abs((y * 0.9 + abs(math.sin(x * 1.3 + z)) * 2.5) % 4.0 - 2.0)
        return lit(pal['glow']) if k < 0.18 else (pal['t3'] if n > 0.5 else p.col)
    if style == 'leaf':
        return pal['t2'] if (x * 1.3 + z * 0.7 + y * 2.1) % 2.0 < 0.6 else (pal['t3'] if n > cover - 0.08 else p.col)
    if style == 'plate':
        return pal['t2'] if abs((y % 4) - 2) < 0.25 or abs((x % 4) - 2) < 0.15 else (pal['t3'] if n < 0.3 else p.col)
    return p.col


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ------------------------------------------------------------------------------------------------ head gear
def head_box(m, grow=0.0):
    return m.rig.box('head', grow)


def crown(m, mat='gold', gem='gem', tines=5, tall=2.4, grow=0.35, bone=None):
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    b = bone or m.rig.bone('head')
    tag(m.box(b, 'crown_band', x0, x1, y1 - 1.6, y1 + 0.2, z0, z1, mat, decal='crown'), gemc=gem)
    w = (x1 - x0)
    for i in range(tines):
        cx = x0 + w * (i + 0.5) / tines
        h = tall * (1.25 if i == tines // 2 else 1.0)
        m.box(b, f'crown_t{i}', cx - 0.45, cx + 0.45, y1 + 0.2, y1 + 0.2 + h, z0 - 0.03, z0 + 0.87, mat, decal='metal')
        if i % 2 == 0:
            m.box(b, f'crown_g{i}', cx - 0.35, cx + 0.35, y1 - 1.25, y1 - 0.55, z0 - 0.1, z0, gem, decal='gem')
    m.box(b, 'crown_back', x0 + 0.3, x1 - 0.3, y1 + 0.2, y1 + tall * 0.7, z1 - 0.85, z1 - 0.05, mat, decal='metal')


def circlet(m, mat='gold', gem='glow', grow=0.44):
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    yy = y0 + (y1 - y0) * 0.72
    tag(m.box(m.rig.bone('head'), 'circlet', x0, x1, yy - 0.5, yy + 0.5, z0, z1, mat, decal='crown'), gemc=gem)
    m.box(m.rig.bone('head'), 'circlet_gem', -0.6, 0.6, yy - 0.7, yy + 0.7, z0 - 0.2, z0, gem, decal='gem')


def horns(m, mat='bone', size=1.0, kind='curl', mat2=None):
    """two horns out of the head's sides (curl: up and out; ram: back and down; straight: up)"""
    x0, x1, y0, y1, z0, z1 = head_box(m, 0.1)
    b = m.rig.bone('head')
    s = size
    yb = y0 + (y1 - y0) * 0.75
    zc = (z0 + z1) / 2 - 0.5
    if kind == 'straight':
        m.rise_x(b, 'horn_l', (x1 - 1.0, yb), (x1 + 1.2 * s, yb + 5.5 * s), zc - 0.8 * s, zc + 0.8 * s, 1.5 * s, mat, decal='horn')
    elif kind == 'ram':
        m.rise_x(b, 'horn_l', (x1 - 0.6, yb + 1.0), (x1 + 3.0 * s, yb + 2.6 * s), zc - 1.0 * s, zc + 1.0 * s, 1.8 * s, mat, decal='horn')
        m.rise_x(b, 'horntip_l', (x1 + 2.6 * s, yb + 2.4 * s), (x1 + 3.6 * s, yb - 1.2 * s), zc - 0.7 * s, zc + 0.7 * s, 1.2 * s, mat2 or mat, decal='horn')
    else:
        m.rise_x(b, 'horn_l', (x1 - 0.8, yb), (x1 + 3.6 * s, yb + 3.4 * s), zc - 0.85 * s, zc + 0.85 * s, 1.5 * s, mat, decal='horn')
        m.rise_x(b, 'horntip_l', (x1 + 3.2 * s, yb + 3.0 * s), (x1 + 4.6 * s, yb + 6.4 * s), zc - 0.5 * s, zc + 0.5 * s, 0.9 * s, mat2 or mat, decal='horn')
    for c in [c for c in m.cubes if c['name'].startswith('horn') and c['name'].endswith('_l')]:
        m.mirror(c['name'], c['name'][:-2] + '_r')


def halo(m, mat='glow', r=None, lift=2.2, spin=True):
    x0, x1, y0, y1, z0, z1 = head_box(m)
    r = r or (x1 - x0) * 0.42
    cy, cz = y1 + lift, (z0 + z1) / 2
    hb = m.rig.bone('head')
    bone = 'halo'
    m.bone(bone, hb, (0, cy, cz))
    t = 2 * r * math.tan(math.radians(22.5))
    for i in range(8):
        a = 45 * i
        x, z = r * math.sin(math.radians(a)), cz - r * math.cos(math.radians(a))
        m.box(bone, f'halo{i}', x - t / 2 - 0.05, x + t / 2 + 0.05, cy - 0.3 + 0.02 * (i % 2), cy + 0.3 - 0.02 * (i % 2), z - 0.35, z + 0.35, mat,
              rot=(0, -a, 0) if a else None, pivot=(x, cy, z))
    m.spinners = getattr(m, 'spinners', []) + [bone]


def hood(m, mat='t1', mat2='t2', grow=0.55, peak=True, face_open=True):
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    b = m.rig.bone('head')
    tag(m.box(b, 'hood', x0, x1, y0 - 0.4, y1, z0, z1, mat, decal='hood'), open=face_open)
    if peak:
        m.slope(b, 'hood_peak', -1.4, 1.4, ((z0 + z1) / 2, y1), (z1 + 1.8, y1 - 3.0), 1.2, mat2, extend=(0, 0.3))
    m.box(b, 'hood_drape', x0 + 0.2, x1 - 0.2, y0 - 3.0, y0 - 0.3, z1 - 1.2, z1 + 0.3, mat2, decal='cloth')


def helm(m, mat='metal', visor='dark', plume=None, crest=None, grow=0.4, slits=True, kind='great'):
    """a closed helm: an eight-sided shell over the head, a visor band with slits, an optional plume or crest"""
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    b = m.rig.bone('head')
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    r = max(x1 - x0, z1 - z0) / 2
    if kind == 'great':
        tag(m.box(b, 'helm', x0, x1, y0 - 0.2, y1, z0, z1, mat, decal='helm'), visor=visor, slits=slits)
    else:                                                        # a rounded sallet
        octa(m, b, 'helm', 'y', (cx, cz), y0 + (y1 - y0) * 0.45, y1 + 0.2, r + 0.1, mat, decal='metal')
        m.box(b, 'helm_visor', x0 + 0.4, x1 - 0.4, y0 + (y1 - y0) * 0.35, y0 + (y1 - y0) * 0.55, z0 - 0.25, z0 + 1.0, visor, decal='visor')
    if crest:
        m.box(b, 'helm_crest', -0.45, 0.45, y1, y1 + 1.6, z0 + 0.5, z1 - 0.5, crest, decal='metal')
    if plume:
        m.bone('plume', b, (0, y1, cz))
        m.box('plume', 'plume', 0, 0, y1 - 0.4, y1 + 5.0, cz - 2.6, cz + 5.0, plume, only=('east', 'west'), decal='plume', dens=2.0)


def wizard_hat(m, mat='t2', band='trim', grow=0.3, tall=8.0, bend=14, brim=True):
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    b = m.rig.bone('head')
    cz = (z0 + z1) / 2
    r = (x1 - x0) / 2
    if brim:
        octa(m, b, 'hat_brim', 'y', (0, cz), y1 - 0.3, y1 + 0.3, r + 2.2, mat, decal='cloth')
    octa(m, b, 'hat_band', 'y', (0, cz), y1 + 0.25, y1 + 1.2, r * 0.82, band, decal='metal')
    m.bone('hat_tip', b, (0, y1 + 1.0, cz), rot=(-bend, 0, 0))
    steps = 4
    for i in range(steps):
        rr = r * 0.78 * (1 - i / steps)
        ya, yb2 = y1 + 1.0 + tall * i / steps, y1 + 1.0 + tall * (i + 1) / steps
        octa(m, 'hat_tip', f'hat_cone{i}', 'y', (0, cz + 0.6 * i), ya - 0.05, yb2 + 0.05, max(0.35, rr), mat, decal='cloth')


def tophat(m, mat='black', band='red', grow=0.25):
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    b = m.rig.bone('head')
    cz = (z0 + z1) / 2
    m.box(b, 'top_brim', x0 - 1.4, x1 + 1.4, y1 - 0.2, y1 + 0.4, z0 - 1.4, z1 + 1.4, mat, decal='metal')
    m.box(b, 'top_crown', x0 + 0.8, x1 - 0.8, y1 + 0.4, y1 + 6.0, z0 + 0.8, z1 - 0.8, mat, decal='metal')
    m.box(b, 'top_band', x0 + 0.7, x1 - 0.7, y1 + 0.5, y1 + 1.6, z0 + 0.7, z1 - 0.7, band, decal='metal')


def cap(m, mat='cloth', brim_mat=None, grow=0.44, back=False):
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    b = m.rig.bone('head')
    m.box(b, 'cap', x0, x1, y1 - 2.4, y1 + 0.6, z0, z1, mat, decal='cap')
    if back:
        m.box(b, 'cap_brim', x0 + 1.5, x1 - 1.5, y1 - 2.2, y1 - 1.6, z1, z1 + 3.0, brim_mat or mat, decal='metal')
    else:
        m.box(b, 'cap_brim', x0 + 1.0, x1 - 1.0, y1 - 2.2, y1 - 1.6, z0 - 3.0, z0, brim_mat or mat, decal='metal')


def bandana(m, mat='red', grow=0.46, tails=True):
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    b = m.rig.bone('head')
    yy = y0 + (y1 - y0) * 0.75
    m.box(b, 'bandana', x0, x1, yy - 0.9, yy + 0.9, z0, z1, mat, decal='strap')
    if tails:
        m.bone('bandana_tail', b, (0, yy, z1))
        m.box('bandana_tail', 'bandana_t', 0, 0, yy - 4.0, yy + 0.4, z1, z1 + 3.5, mat, only=('east', 'west'), decal='tail', dens=2.0)


def gasmask(m, mat='t3', lens='glass', filt='metal2'):
    x0, x1, y0, y1, z0, z1 = head_box(m, 0.35)
    b = m.rig.bone('head')
    h = y1 - y0
    m.box(b, 'mask', x0 + 0.6, x1 - 0.6, y0 + h * 0.08, y0 + h * 0.62, z0 - 0.4, z0 + 1.4, mat, decal='mask')
    for sx in (-1, 1):
        octa(m, b, f'mask_lens{"l" if sx > 0 else "r"}', 'z', (sx * (x1 - x0) * 0.22, y0 + h * 0.48), z0 - 0.8, z0 - 0.2, 1.05, lens, decal='lensglow')
    octa(m, b, 'mask_filter', 'z', (0, y0 + h * 0.16), z0 - 2.4, z0 - 0.3, 1.2, filt, decal='filter')


def goggles(m, mat='gun', lens='glass', grow=0.48, y=None):
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    b = m.rig.bone('head')
    yy = y if y is not None else y0 + (y1 - y0) * 0.62
    m.box(b, 'goggle_strap', x0, x1, yy - 0.6, yy + 0.6, z0, z1, 'dark', decal='strap')
    for sx in (-1, 1):
        octa(m, b, f'goggle{"l" if sx > 0 else "r"}', 'z', (sx * (x1 - x0) * 0.22, yy), z0 - 0.8, z0 + 0.2, 1.1, mat, decal='goggle')


def jester_hat(m, a='red', b='purple', bell='gold'):
    x0, x1, y0, y1, z0, z1 = head_box(m, 0.46)
    hb = m.rig.bone('head')
    m.box(hb, 'jester_cap', x0, x1, y1 - 2.2, y1 + 0.5, z0, z1, a, decal='diamonds')
    for side, mat in ((1, a), (-1, b)):
        tag = 'l' if side > 0 else 'r'
        xa = side * (x1 - x0) * 0.3
        lo, hi = sorted((xa, xa + side * 5.0))
        m.rise_x(hb, f'jest_{tag}', (min(xa, xa + side * 5.0), y1), (max(xa, xa + side * 5.0), y1 + (2.0 if side > 0 else -1.0) + 2.0), z0 + 2.0, z1 - 2.0, 1.4, mat, decal='cloth')
        octa(m, hb, f'jest_bell_{tag}', 'y', (xa + side * 5.4, (z0 + z1) / 2), y1 + 1.2, y1 + 2.6, 0.7, bell, decal='metal')


def spikes_on(m, part, mat, n=3, length=3.0, tilt=18, grow=0.2, where='top', thick=0.55):
    """short spikes out of a part's top (a crown of ice, a punk crest) or its back"""
    if not has(m, part):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box(part, grow)
    b = m.rig.bone(part)
    for i in range(n):
        f = (i + 0.5) / n
        if where == 'top':
            x = x0 + (x1 - x0) * f
            t = tilt * (f - 0.5) * 2
            m.box(b, f'spike_{part}{i}', x - thick, x + thick, y1 - 0.4, y1 + length * (1.15 if abs(f - 0.5) < 0.2 else 1.0), (z0 + z1) / 2 - thick, (z0 + z1) / 2 + thick,
                  mat, rot=(0, 45, -t), pivot=(x, y1, (z0 + z1) / 2), decal='spike')
        else:                                                    # the back
            y = y0 + (y1 - y0) * f
            m.box(b, f'spike_{part}{i}', -thick, thick, y - thick, y + thick, z1 - 0.4, z1 + length, mat, rot=(-tilt, 45, 0), pivot=(0, y, z1), decal='spike')


def eyes_glow(m, color='glow', y=None, size=0.8, grow=0.36):
    """two glowing eyes just in front of the vanilla face"""
    x0, x1, y0, y1, z0, z1 = head_box(m, grow)
    yy = y if y is not None else y0 + (y1 - y0) * 0.55
    for sx in (-1, 1):
        cx = sx * (x1 - x0) * 0.2
        m.box(m.rig.bone('head'), f'eye_{"l" if sx > 0 else "r"}', cx - size, cx + size, yy - size * 0.6, yy + size * 0.6, z0 - 0.06, z0 - 0.06, color, only=('north', 'south'))


# ------------------------------------------------------------------------------------------------ body gear
def plate(m, mat='metal', trim='trim', grow=0.48, back=True, ribs=False):
    if not has(m, 'body'):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box('body', grow)
    b = m.rig.bone('body')
    tag(m.box(b, 'plate', x0, x1, y0 + 1.0, y1, z0, z0 + 0.8, mat, decal='ribs' if ribs else 'plate'), trimc=trim)
    if back:
        m.box(b, 'plate_back', x0 + 0.2, x1 - 0.2, y0 + 1.6, y1 - 0.2, z1 - 0.8, z1, mat, decal='metal')
    m.box(b, 'plate_belt', x0 - 0.05, x1 + 0.05, y0 - 0.2, y0 + 1.4, z0 + 0.3, z1 - 0.3, trim, decal='belt')


def robe(m, mat='t1', mat2='t2', grow=0.52, low=2.0, ragged=True, sash=None):
    """a long coat from the shoulders to the shins, hanging from the body"""
    if not has(m, 'body'):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box('body', grow)
    b = m.rig.bone('body')
    if has(m, 'robe'):
        x0, x1, _, y1, z0, z1 = m.rig.box('robe', grow * 0.6)
    tag(m.box(b, 'robe_top', x0, x1, y0, y1, z0, z1, mat, decal='robe'), ragged=False)
    tag(m.box(b, 'robe_skirt', x0 - 0.35, x1 + 0.35, low, y0 + 0.5, z0 - 0.35, z1 + 0.35, mat, decal='robe'), ragged=ragged)
    if sash:
        m.box(b, 'robe_sash', x0 - 0.1, x1 + 0.1, y0 - 0.2, y0 + 1.2, z0 - 0.45, z1 + 0.45, sash, decal='belt')


def cape(m, mat='t1', mat2='t2', length=18.0, width=None, hem='trim', grow=0.6):
    if not has(m, 'body'):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box('body', grow)
    w = width or (x1 - x0)
    m.bone('cape', m.rig.bone('body'), (0, y1, z1))
    tag(m.box('cape', 'cape', -w / 2, w / 2, y1 - length, y1, z1, z1, mat, only=('north', 'south'), decal='cape', dens=1.6), hemc=hem)


def pauldrons(m, mat='metal', trim='trim', spiked=None, size=1.0):
    for part, side in (('larm', 1), ('rarm', -1)):
        if not has(m, part):
            continue
        x0, x1, y0, y1, z0, z1 = m.rig.box(part, 0.45)
        b = m.rig.bone(part)
        xo, xi = (x1, x0) if side > 0 else (x0, x1)
        lo, hi = sorted((xi - side * 0.8, xo + side * 1.2 * size))
        tag(m.box(b, f'pauldron_{part}', lo, hi, y1 - 4.2 * size, y1 + 0.5, z0 - 0.4, z1 + 0.4, mat, decal='edge'), trimc=trim)
        if spiked:
            cx = (lo + hi) / 2
            for i, zz in enumerate((-1.0, 1.0)):
                m.box(b, f'pspike_{part}{i}', cx - 0.5, cx + 0.5, y1 + 0.4, y1 + 3.0 * size, zz - 0.5, zz + 0.5, spiked, rot=(0, 45, side * -14), pivot=(cx, y1, zz), decal='spike')


def gauntlets(m, mat='metal2', grow=0.55, spikes=None):
    for part in ('larm', 'rarm'):
        if not has(m, part):
            continue
        x0, x1, y0, y1, z0, z1 = m.rig.box(part, grow)
        m.box(m.rig.bone(part), f'gauntlet_{part}', x0, x1, y0, y0 + 4.0, z0, z1, mat, decal='band')


def greaves(m, mat='metal', grow=0.47):
    for part in ('lleg', 'rleg'):
        if not has(m, part):
            continue
        x0, x1, y0, y1, z0, z1 = m.rig.box(part, grow + (0.02 if part == 'lleg' else 0))
        m.box(m.rig.bone(part), f'greave_{part}', x0, x1, y0, y0 + 6.5, z0, z1, mat, decal='band')


def belt(m, mat='leather', buckle='gold', grow=0.58, pouches=None):
    if not has(m, 'body'):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box('body', grow)
    tag(m.box(m.rig.bone('body'), 'belt', x0, x1, y0 - 0.2, y0 + 1.5, z0, z1, mat, decal='belt'), buckle=buckle)
    if pouches:
        for i, x in enumerate((x0 + 1.2, x1 - 2.6)):
            m.box(m.rig.bone('body'), f'belt_pouch{i}', x, x + 1.6, y0 - 1.4, y0 + 1.2, z0 - 0.9, z0 + 0.2, pouches, decal='pouch')


def pack(m, mat='leather', kind='bag', mat2='metal2'):
    """something on the back: a bag, a tank (hazmat), a barrel (boomer), a coffin (grave digger), a crystal cluster"""
    if not has(m, 'body'):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box('body', 0.45)
    b = m.rig.bone('body')
    if kind == 'tank':
        for i, x in enumerate((-1.6, 1.6)):
            octa(m, b, f'tank{i}', 'y', (x, z1 + 1.3), y0 + 1.0, y1 + 1.0, 1.2, mat, decal='tank')
        m.box(b, 'tank_strap', x0 + 0.6, x1 - 0.6, y1 - 2.0, y1 - 1.2, z1 - 0.1, z1 + 0.25, mat2)
    elif kind == 'barrel':
        octa(m, b, 'barrel', 'y', (0, z1 + 2.6), y0 - 0.5, y1 + 1.5, 2.6, mat, decal='barrel')
    elif kind == 'coffin':
        m.box(b, 'coffin', x0 + 0.5, x1 - 0.5, y0 - 4.0, y1 + 3.0, z1 + 0.2, z1 + 2.0, mat, rot=(-8, 0, 0), pivot=(0, y1, z1 + 1.0), decal='coffin')
    elif kind == 'crystals':
        crystals(m, 'body', 'glow', n=4, where='back')
    else:
        m.box(b, 'pack', x0 + 1.0, x1 - 1.0, y0 + 1.0, y1 - 1.0, z1 + 0.1, z1 + 3.2, mat, decal='pouch')


def wings(m, mat='t3', kind='feather', span=10.0, tall=9.0, bone='body', mat2=None):
    """two flapping plates on bones of their own (wing_l, wing_r: the animation beats them)"""
    if not has(m, 'body'):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box('body', 0.5)
    b = m.rig.bone(bone)
    for side in (1, -1):
        n = f'wing_{"l" if side > 0 else "r"}'
        px = side * 0.8
        m.bone(n, b, (px, y1 - 1.5, z1))
        lo, hi = sorted((px, px + side * span))
        tag(m.box(n, n, lo, hi, y1 - 1.5 - tall * 0.65, y1 - 1.5 + tall * 0.35, z1 + 0.3, z1 + 0.3, mat, only=('north', 'south'), decal='wing', dens=1.8),
            kind=kind, side=side, root=px, span=span, ytop=y1 - 1.5 + tall * 0.35, tall=tall, edge=mat2)
    m.flappers = getattr(m, 'flappers', []) + ['wing_l', 'wing_r']


def crystals(m, part, mat='glow', n=3, where='back', size=1.0, mat2=None):
    """crystal prisms growing out of a part (its back or top)"""
    if not has(m, part):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box(part, 0.3)
    b = m.rig.bone(part)
    for i in range(n):
        f = (i + 0.5) / n
        L = (2.6 + 1.8 * ((i * 7) % 3) / 2) * size
        if where == 'back':
            x, y = x0 + (x1 - x0) * f, y0 + (y1 - y0) * (0.35 + 0.5 * ((i * 5) % 3) / 2)
            m.box(b, f'crys_{part}{i}', x - 0.7 * size, x + 0.7 * size, y - 0.7 * size, y + 0.7 * size, z1 - 0.6, z1 + L, mat2 or mat if i % 2 else mat,
                  rot=(-20 - 10 * (i % 2), 45, (f - 0.5) * 40), pivot=(x, y, z1), decal='crystal')
        else:
            x = x0 + (x1 - x0) * f
            m.box(b, f'crys_{part}{i}', x - 0.7 * size, x + 0.7 * size, y1 - 0.6, y1 + L, (z0 + z1) / 2 - 0.7 * size, (z0 + z1) / 2 + 0.7 * size,
                  mat2 or mat if i % 2 else mat, rot=(0, 45, (f - 0.5) * 50), pivot=(x, y1, (z0 + z1) / 2), decal='crystal')


def flames(m, part='head', mat='flash', n=3, tall=4.0, grow=0.2):
    """lit flame plates licking up from a part's top"""
    if not has(m, part):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box(part, grow)
    b = m.rig.bone(part)
    for i in range(n):
        f = (i + 0.5) / n
        x = x0 + (x1 - x0) * f
        h = tall * (0.75 + 0.5 * ((i * 3) % 2))
        tag(m.box(b, f'flame_{part}{i}', x - 1.1, x + 1.1, y1 - 0.5, y1 + h, (z0 + z1) / 2 + (i - n / 2) * 0.35, (z0 + z1) / 2 + (i - n / 2) * 0.35, mat,
                  only=('north', 'south'), decal='fire', dens=3.0), y0f=y1 - 0.5, hf=h)


def aura(m, mat='glow', r=6.0, y=0.3, n=8, bone=None):
    """a glowing ring on the ground round the feet (its own bone: the animation turns it)"""
    root = bone or m.rig.bones[0][0]
    m.bone('aura', root, (0, y, 0))
    for i in range(n):
        a = 360 / n * i
        x, z = r * math.sin(math.radians(a)), -r * math.cos(math.radians(a))
        m.box('aura', f'aura{i}', x - 1.0, x + 1.0, y, y + 0.35, z - 0.3, z + 0.3, mat, rot=(0, -a, 0) if a else None, pivot=(x, y, z))
    m.spinners = getattr(m, 'spinners', []) + ['aura']


def orbit(m, mat='glow', n=3, r=7.0, y=None, size=1.0, kind='orb'):
    """floating things round the body (its own bone 'orbit': the animation turns it)"""
    root = m.rig.bone('body') if has(m, 'body') else m.rig.bones[0][0]
    yy = y if y is not None else (m.rig.box('body')[3] if has(m, 'body') else 12)
    m.bone('orbit', root, (0, yy, 0))
    for i in range(n):
        a = 360 / n * i
        x, z = r * math.sin(math.radians(a)), -r * math.cos(math.radians(a))
        if kind == 'skull':
            m.box('orbit', f'orb{i}', x - 1.2 * size, x + 1.2 * size, yy - 1.2 * size, yy + 1.2 * size, z - 1.2 * size, z + 1.2 * size, mat, decal='skull')
        else:
            octa(m, 'orbit', f'orb{i}', 'y', (x, z), yy - size, yy + size, size, mat, decal='orbglow')
    m.spinners = getattr(m, 'spinners', []) + ['orbit']


def bandages(m, mat='white', parts=('body', 'rarm', 'larm', 'head')):
    shell(m, parts, grow=0.55, cover=0.62, face=False, theme='lab', mat=mat, tag_='bandage')


def scarf(m, mat='red', mat2=None, tail=True):
    if not has(m, 'body'):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box('body', 0.5)
    b = m.rig.bone('body')
    m.box(b, 'scarf', x0, x1, y1 - 2.0, y1 + 0.3, z0, z1, mat, decal='strap')
    if tail:
        m.bone('scarf_tail', b, (1.0, y1 - 1.0, z1))
        m.box('scarf_tail', 'scarf_t', 1.0, 1.0, y1 - 9.0, y1 - 0.5, z1, z1 + 4.5, mat2 or mat, only=('east', 'west'), decal='tail', dens=2.0)


def chains(m, mat='metal2', parts=('body',)):
    for part in parts:
        if not has(m, part):
            continue
        x0, x1, y0, y1, z0, z1 = m.rig.box(part, 0.5)
        m.rise_x(m.rig.bone(part), f'chain_{part}', (x0 - 0.2, y1 - 1.0), (x1 + 0.2, y0 + 2.0), z0 - 0.45, z0 - 0.05, 0.9, mat, decal='chain')


def tail(m, mat='t1', length=9.0, kind='tail'):
    if not has(m, 'body'):
        return
    x0, x1, y0, y1, z0, z1 = m.rig.box('body', 0.2)
    b = m.rig.bone('body')
    m.bone('tail_g', b, (0, y0 + 1.0, z1))
    m.chain('tail_g', 'tail', -0.8, 0.8, [(z1, y0 + 1.5), (z1 + length * 0.5, y0 - 1.0), (z1 + length, y0 + 0.5)], 1.4, mat, decal='horn')


# ------------------------------------------------------------------------------------------------ hand items
def hand(m, side='r'):
    bone, (x, y, z) = m.rig.hands[side]
    return bone, x, y, z


def weapon(m, kind, side='r', mat='metal', mat2='wood', size=1.0, glow=None):
    """a thing in a hand, its length running down the arm's -y from the fist (forward when the arm is raised)"""
    if side not in m.rig.hands:
        return
    hb, x, y, z = hand(m, side)
    s = size
    n = f'{kind}_{side}'
    m.bone(n, hb, (x, y, z))
    B = n
    grip = lambda h=2.6: m.box(B, f'{n}_grip', x - 0.35 * s, x + 0.35 * s, y - 0.62, y + h * s, z - 0.35 * s, z + 0.35 * s, 'leather')  # noqa: E731
    if kind in ('sword', 'greatsword', 'cleaver', 'knife'):
        L = {'sword': 11, 'greatsword': 17, 'cleaver': 8, 'knife': 5}[kind] * s
        W = {'sword': 1.6, 'greatsword': 2.6, 'cleaver': 3.2, 'knife': 1.0}[kind] * s
        grip()
        m.box(B, f'{n}_guard', x - 0.45 * s, x + 0.45 * s, y - 1.0 * s, y - 0.4, z - 1.8 * s, z + 1.8 * s, mat2 if kind != 'knife' else mat, decal='metal')
        tag(m.box(B, f'{n}_blade', x - 0.22 * s, x + 0.22 * s, y - 1.0 * s - L, y - 0.95 * s, z - W / 2, z + W / 2 + (W if kind == 'cleaver' else 0) * 0.2, mat, decal='blade'),
            glowc=glow)
    elif kind in ('axe', 'battleaxe'):
        L = (13 if kind == 'axe' else 18) * s
        m.box(B, f'{n}_haft', x - 0.4 * s, x + 0.4 * s, y - L * 0.75, y + L * 0.25, z - 0.4 * s, z + 0.4 * s, mat2, decal='haft')
        hw = (5.5 if kind == 'axe' else 8.0) * s
        tag(m.box(B, f'{n}_head', x, x, y - L * 0.75 - 1.0, y - L * 0.75 + hw - 1.0, z + 0.3, z + hw * 0.9, mat, only=('east', 'west'), decal='axeblade', dens=2.0), glowc=glow)
        if kind == 'battleaxe':
            tag(m.box(B, f'{n}_head2', x, x, y - L * 0.75 - 1.0, y - L * 0.75 + hw - 1.0, z - hw * 0.9, z - 0.3, mat, only=('east', 'west'), decal='axeblade', dens=2.0), glowc=glow, flip=True)
    elif kind in ('mace', 'hammer', 'club', 'flail'):
        L = (10 if kind != 'hammer' else 13) * s
        m.box(B, f'{n}_haft', x - 0.4 * s, x + 0.4 * s, y - L, y + 2.0 * s, z - 0.4 * s, z + 0.4 * s, mat2, decal='haft')
        if kind == 'hammer':
            m.box(B, f'{n}_head', x - 1.6 * s, x + 1.6 * s, y - L - 2.4 * s, y - L + 0.4, z - 3.2 * s, z + 3.2 * s, mat, decal='metal')
        elif kind == 'club':
            octa(m, B, f'{n}_head', 'y', (x, z), y - L - 3.0 * s, y - L + 2.0, 1.3 * s, mat2, decal='haft')
        else:
            octa(m, B, f'{n}_head', 'y', (x, z), y - L - 2.6 * s, y - L + 0.3, 1.5 * s, mat, decal='metal')
            for i in range(4):
                m.box(B, f'{n}_spike{i}', x - 0.4 * s, x + 0.4 * s, y - L - 1.9 * s, y - L - 0.5 * s, z - 2.5 * s, z - 1.2 * s, mat, rot=(0, 90 * i + 45, 0), pivot=(x, y - L - 1.2 * s, z))
        if glow:
            octa(m, B, f'{n}_glow', 'y', (x, z), y - L - 0.6 * s, y - L - 0.2 * s, 1.55 * s, glow)
    elif kind in ('spear', 'pike', 'trident'):
        L = (16 if kind == 'spear' else 22) * s
        m.box(B, f'{n}_haft', x - 0.35 * s, x + 0.35 * s, y - L, y + 4.0 * s, z - 0.35 * s, z + 0.35 * s, mat2, decal='haft')
        if kind == 'trident':
            for i, dz in enumerate((-1.2, 0, 1.2)):
                m.box(B, f'{n}_prong{i}', x - 0.3 * s, x + 0.3 * s, y - L - (3.2 if dz == 0 else 2.4) * s, y - L + 0.2, z + dz * s - 0.3 * s, z + dz * s + 0.3 * s, mat, decal='metal')
            m.box(B, f'{n}_bar', x - 0.32 * s, x + 0.32 * s, y - L - 0.2, y - L + 0.5, z - 1.6 * s, z + 1.6 * s, mat)
        else:
            tag(m.box(B, f'{n}_tip', x - 0.2 * s, x + 0.2 * s, y - L - 4.0 * s, y - L + 0.2, z - 1.0 * s, z + 1.0 * s, mat, decal='blade'), glowc=glow)
    elif kind == 'scythe':
        L = 18 * s
        m.box(B, f'{n}_haft', x - 0.4 * s, x + 0.4 * s, y - L * 0.7, y + L * 0.3, z - 0.4 * s, z + 0.4 * s, mat2, decal='haft')
        tag(m.box(B, f'{n}_blade', x, x, y - L * 0.7 - 1.0, y - L * 0.7 + 1.6, z - 9.0 * s, z + 0.4, mat, only=('east', 'west'), decal='scythe', dens=2.0), glowc=glow)
    elif kind in ('staff', 'wand', 'scepter'):
        L = {'staff': 16, 'wand': 6, 'scepter': 9}[kind] * s
        m.box(B, f'{n}_haft', x - 0.35 * s, x + 0.35 * s, y - L * 0.3, y + L * 0.7, z - 0.35 * s, z + 0.35 * s, mat2, decal='haft')
        top = y + L * 0.7
        octa(m, B, f'{n}_orb', 'y', (x, z), top, top + 2.0 * s, 1.0 * s, glow or 'glow', decal='orbglow')
        for i in range(3):
            m.box(B, f'{n}_prong{i}', x - 0.25 * s, x + 0.25 * s, top - 0.4, top + 2.4 * s, z - 1.35 * s, z - 0.85 * s, mat, rot=(0, 120 * i, 0), pivot=(x, top, z))
    elif kind == 'lantern':
        m.box(B, f'{n}_chain', x - 0.12, x + 0.12, y - 2.4 * s, y, z - 0.12, z + 0.12, 'metal2')
        octa(m, B, f'{n}_cage', 'y', (x, z), y - 5.0 * s, y - 2.3 * s, 1.0 * s, 'metal2', decal='cage')
        m.box(B, f'{n}_flame', x - 0.4 * s, x + 0.4 * s, y - 4.4 * s, y - 2.9 * s, z - 0.4 * s, z + 0.4 * s, glow or 'glow')
    elif kind in ('shovel', 'pickaxe'):
        L = 14 * s
        m.box(B, f'{n}_haft', x - 0.35 * s, x + 0.35 * s, y - L, y + 3.0 * s, z - 0.35 * s, z + 0.35 * s, mat2, decal='haft')
        if kind == 'shovel':
            m.box(B, f'{n}_blade', x - 0.15 * s, x + 0.15 * s, y - L - 4.0 * s, y - L + 0.3, z - 1.6 * s, z + 1.6 * s, mat, decal='metal')
        else:
            m.rise_x(B, f'{n}_head', (x - 0.4, y - L), (x + 0.4, y - L - 0.1), z - 4.0 * s, z + 4.0 * s, 0.9 * s, mat, decal='metal')
    elif kind == 'torch':
        m.box(B, f'{n}_stick', x - 0.35 * s, x + 0.35 * s, y - 7.0 * s, y + 2.0 * s, z - 0.35 * s, z + 0.35 * s, mat2, decal='haft')
        tag(m.box(B, f'{n}_fire', x - 1.0 * s, x + 1.0 * s, y - 10.5 * s, y - 6.8 * s, z, z, glow or 'flash', only=('north', 'south'), decal='fire', dens=3.0), y0f=y - 6.8 * s, hf=-3.7 * s)
    elif kind == 'claws':
        for i, dz in enumerate((-0.9, 0.0, 0.9)):
            m.box(B, f'{n}_claw{i}', x - 0.18 * s, x + 0.18 * s, y - 4.2 * s, y + 0.2, z + dz * s - 0.3 * s, z + dz * s + 0.3 * s, mat, rot=(-14, 0, 0), pivot=(x, y, z + dz * s), decal='blade')
    elif kind == 'book':
        m.box(B, f'{n}_book', x - 1.6 * s, x + 1.6 * s, y - 1.5 * s, y + 1.0 * s, z - 2.2 * s, z + 2.2 * s, mat2, decal='book')
    elif kind == 'orb':
        octa(m, B, f'{n}_orb', 'y', (x, z - 1.5), y - 2.5 * s, y - 0.3, 1.2 * s, glow or 'glow', decal='orbglow')
    elif kind == 'bomb':
        octa(m, B, f'{n}_bomb', 'y', (x, z), y - 3.6 * s, y - 0.4, 1.6 * s, 'black', decal='metal')
        m.box(B, f'{n}_fuse', x - 0.2, x + 0.2, y - 0.5, y + 0.8, z - 0.2, z + 0.2, glow or 'flash')
    elif kind == 'syringe':
        m.box(B, f'{n}_tube', x - 0.6 * s, x + 0.6 * s, y - 5.0 * s, y + 1.0, z - 0.6 * s, z + 0.6 * s, glow or 'glow')
        m.box(B, f'{n}_needle', x - 0.12, x + 0.12, y - 7.0 * s, y - 5.0 * s, z - 0.12, z + 0.12, 'metal')
    elif kind == 'banner':
        L = 18 * s
        m.box(B, f'{n}_pole', x - 0.35, x + 0.35, y - 2.0, y + L, z - 0.35, z + 0.35, mat2, decal='haft')
        m.box(B, f'{n}_cloth', x, x, y + L - 8.0 * s, y + L - 0.5, z + 0.4, z + 6.0 * s, mat, only=('east', 'west'), decal='cloth', dens=2.0)
    elif kind == 'shield':
        x0, x1, y0, y1, z0, z1 = m.rig.box('larm' if side == 'l' else 'rarm', 0.45)
        xo = x1 if side == 'l' else x0
        lo, hi = sorted((xo, xo + (0.7 if side == 'l' else -0.7) * s))
        tag(m.box(hb, f'{n}_board', lo, hi, y0 - 1.5 * s, y0 + 9.5 * s, z0 - 3.0 * s, z1 + 3.0 * s, mat, decal='shield', dens={'west': 2.5, 'east': 2.5}),
            trimc=mat2, glowc=glow)
    elif kind == 'towershield':
        x0, x1, y0, y1, z0, z1 = m.rig.box('larm', 0.45)
        tag(m.box(hb, f'{n}_board', x0 - 2.0 * s, x1 + 3.0 * s, y0 - 6.0 * s, y1 + 1.0 * s, z0 - 1.6, z0 - 0.9, mat, decal='shield', dens={'north': 2.0}),
            trimc=mat2, glowc=glow)


# ------------------------------------------------------------------------------------------------ painting
def paint(m, p):
    d = p.cube['decal']
    r = hq_decal(p, m.emblem)
    if r is not False:
        return r
    if m.own:
        r = m.own(p)
        if r is not False:
            return r
    return part_px(m, p, d)


def part_px(m, p, d):
    c, q, f = p.cube, p.local(), p.face
    pal = p.pal
    yb = q[1] - c['o'][1]
    if d == 'shell':
        return shell_px(m, p)
    if d == 'metal':
        return mul(p.col, 1.18) if f != 'down' and p.v < 0.2 else p.col
    if d == 'crown':
        if f == 'down':
            return None
        return pal.get(c.get('gemc') or 'gem', p.col) if f == 'north' and abs(q[0]) < 0.6 else (mul(p.col, 0.82) if p.v > 0.75 else p.col)
    if d == 'gem':
        return lit(mul(p.col, 1.2)) if f == 'north' else p.col
    if d == 'horn':
        return mul(p.col, 0.8) if int(along(p, q) * 1.6 + q[1] * 1.6) % 2 == 0 else p.col
    if d == 'spike':
        return mul(p.col, 1.2) if p.v < 0.35 else p.col
    if d == 'hood':
        if f == 'down':
            return None
        if c.get('open') and f == 'north' and 0.12 < p.u < 0.88 and 0.22 < p.v < 0.85:
            return None
        return pal['t2'] if int((q[0] + q[1] * 0.5) * 1.3) % 3 == 0 else p.col
    if d == 'helm':
        if f == 'down':
            return None
        if f == 'north' and 0.4 < p.v < 0.56:
            if c.get('slits') and (0.18 < p.u < 0.42 or 0.58 < p.u < 0.82):
                return pal['dark']
            return pal.get(c.get('visor') or 'dark', p.col) if not c.get('slits') else mul(p.col, 0.8)
        if f == 'north' and p.v > 0.6 and int(p.u * 9) % 2 == 0:
            return mul(p.col, 0.85)                              # breathing holes
        return mul(p.col, 1.12) if abs(q[0]) < 0.4 and f in ('north', 'up') else p.col
    if d == 'visor':
        return lit(pal['glow']) if f == 'north' and 0.3 < p.v < 0.7 else p.col
    if d == 'plume':
        a = (q[2] - c['o'][2]) / max(0.1, c['s'][2])
        hh = (q[1] - c['o'][1]) / max(0.1, c['s'][1])
        if hh > 0.95 * math.sin(math.pi * min(1.0, a * 0.95 + 0.05)) ** 0.5 or (a > 0.8 and int(hh * 9) % 2):
            return None
        return mul(p.col, 0.82) if int(a * 8) % 2 else p.col
    if d in ('cloth', 'cap'):
        if d == 'cap' and f == 'down':
            return None
        return mul(p.col, 0.88) if int((q[0] + q[2] + q[1] * 0.6) * 1.2) % 3 == 0 else p.col
    if d == 'strap':
        return None if f in ('up', 'down') else (mul(p.col, 0.82) if int(along(p, q) * 1.5) % 4 == 0 else p.col)
    if d == 'tail':
        a = (q[2] - c['o'][2]) / max(0.1, c['s'][2])
        if yb < c['s'][1] * (0.15 + 0.35 * a) * abs(math.sin(a * 4.0 + 0.5)):
            return None
        return mul(p.col, 0.85) if int(a * 6) % 2 else p.col
    if d == 'mask':
        return mul(p.col, 0.75) if f == 'north' and p.v > 0.72 and int(p.u * 8) % 2 == 0 else p.col
    if d == 'lensglow':
        return lit(pal['glow']) if f == 'north' and math.hypot(p.u - 0.5, p.v - 0.5) < 0.36 else p.col
    if d == 'filter':
        return mul(p.col, 0.6) if f == 'north' and math.hypot(p.u - 0.5, p.v - 0.5) < 0.3 else p.col
    if d == 'diamonds':
        if f == 'down':
            return None
        return pal['purple'] if (int(q[0] * 0.8 + q[1] * 0.8) + int(q[2] * 0.8 - q[1] * 0.8)) % 2 else p.col
    if d == 'plate':
        if f in ('up', 'down'):
            return None
        if yb > c['s'][1] - 0.6:
            return pal.get(c.get('trimc') or 'trim', p.col)
        if f == 'north' and (p.u < 0.1 or p.u > 0.9) and (p.v < 0.12 or p.v > 0.88):
            return pal['dark']
        return mul(p.col, 1.12) if f == 'north' and abs(q[0]) < 0.4 else p.col
    if d == 'ribs':
        if f in ('up', 'down'):
            return None
        return pal['dark'] if f == 'north' and abs(q[0]) > 0.5 and int(yb * 1.1) % 2 == 0 else p.col
    if d == 'belt':
        if f in ('up', 'down'):
            return None
        return pal.get(c.get('buckle') or 'gold', p.col) if f == 'north' and abs(q[0]) < 0.9 else p.col
    if d == 'robe':
        if f in ('up', 'down'):
            return None
        if c.get('ragged') and yb < 0.8 + 1.1 * abs(math.sin(along(p, q) * 2.3)):
            return None
        if f == 'north' and abs(q[0]) < 0.6:
            return pal['trim']                                   # a seam of trim down the front
        return pal['t2'] if int((q[0] + q[2] + 9) * 1.1 + q[1] * 0.4) % 3 == 0 else p.col
    if d == 'cape':
        if yb < 1.4 * abs(math.sin(q[0] * 1.3)):
            return None
        if abs(q[0]) > c['s'][0] / 2 - 0.5 or yb < 1.4 * abs(math.sin(q[0] * 1.3)) + 0.6:
            return pal.get(c.get('hemc') or 'trim', p.col)
        return pal['t2'] if (abs(q[0]) * 1.1) % 2.2 < 0.5 else p.col
    if d == 'edge':
        return pal.get(c.get('trimc') or 'trim', p.col) if f != 'up' and p.v > 0.6 else p.col
    if d == 'band':
        return None if f in ('up', 'down') else (pal['dark'] if 0.3 < yb % 2.0 < 0.55 else p.col)
    if d == 'pouch':
        if c['s'][1] - yb < 0.6:
            return mul(p.col, 0.82)
        return p.col
    if d == 'tank':
        return mul(p.col, 0.78) if f != 'up' and abs((yb % 4) - 2) < 0.3 else (pal['red'] if f == 'up' else p.col)
    if d == 'barrel':
        if f == 'up':
            return pal['orange']
        return pal['metal2'] if abs(yb - 1.5) < 0.5 or abs(yb - (c['s'][1] - 1.5)) < 0.5 else (pal['red'] if abs(yb - c['s'][1] / 2) < 1.0 else p.col)
    if d == 'coffin':
        return pal['gold'] if f == 'south' and (abs(q[0]) < 0.4 or abs(yb - c['s'][1] * 0.66) < 0.4) else mul(p.col, 0.9 if int(q[1] * 1.3) % 2 else 1.0)
    if d == 'wing':
        return wing_px(m, p)
    if d == 'crystal':
        k = (q[1] * 0.9 + along(p, q) * 1.7) % 2.4
        return lit(pal['glow']) if k < 0.35 else (mul(p.col, 1.25) if k > 1.9 else p.col)
    if d == 'fire':
        o, sz = c['o'], c['s']
        a = min(1.0, max(0.0, (q[1] - c['y0f']) / c['hf'])) if c.get('hf') else 0.5      # 0 at the root, 1 at the tip
        b = abs(q[0] - (o[0] + sz[0] / 2)) / max(0.1, sz[0] / 2)
        edge = (1 - a) ** 0.6 * (0.6 + 0.4 * abs(math.sin(a * 7.0 + q[0])))
        if b > edge:
            return None
        return lit(mix((255, 250, 200), mul(p.col, 1.0)[:3], min(1.0, a * 0.9 + b * 0.5)))
    if d == 'orbglow':
        return lit(p.col) if f != 'down' else p.col
    if d == 'skull':
        if f == 'north' and 0.3 < p.v < 0.55 and (0.15 < p.u < 0.42 or 0.58 < p.u < 0.85):
            return lit(pal['glow'])
        return p.col
    if d == 'cage':
        return p.col if f in ('up', 'down') or p.u < 0.25 or p.u > 0.75 else None
    if d == 'haft':
        return mul(p.col, 0.8) if int(q[1] * 1.4) % 3 == 0 else p.col
    if d == 'blade':
        if c.get('glowc') and abs(along(p, q) - (c['o'][2] + c['s'][2] / 2)) < 0.2:
            return lit(pal[c['glowc']])
        return mul(p.col, 1.25) if p.u < 0.15 or p.u > 0.85 else p.col
    if d == 'axeblade':
        a = (q[2] - c['o'][2]) / max(0.1, c['s'][2])
        if c.get('flip'):
            a = 1 - a
        yy = yb / max(0.1, c['s'][1])
        edge = 0.55 + 0.45 * math.sin(math.pi * yy)
        if a > edge:
            return None
        if c.get('glowc') and a > edge - 0.12:
            return lit(pal[c['glowc']])
        return mul(p.col, 1.3) if a > edge - 0.12 else (pal['metal2'] if a < 0.18 else p.col)
    if d == 'scythe':
        a = -(q[2] - (c['o'][2] + c['s'][2])) / max(0.1, c['s'][2])     # 0 at the haft, 1 at the point
        yy = yb / max(0.1, c['s'][1])
        if yy > 1 - a * 0.7 or yy < 0.15 * a:
            return None
        if c.get('glowc') and yy < 0.15 * a + 0.12:
            return lit(pal[c['glowc']])
        return mul(p.col, 1.3) if yy < 0.15 * a + 0.12 else p.col
    if d == 'shield':
        if f in ('east', 'west', 'north'):
            if p.u < 0.08 or p.u > 0.92 or p.v < 0.06 or p.v > 0.94:
                return pal.get(c.get('trimc') or 'trim', p.col)
            if c.get('glowc') and (abs(p.u - 0.5) < 0.06 or abs(p.v - 0.42) < 0.05):
                return lit(pal[c['glowc']])
            return mul(p.col, 1.1) if abs(p.u - 0.5) < 0.06 or abs(p.v - 0.42) < 0.05 else p.col
        return pal['wood']
    if d == 'chain':
        return pal['dark'] if int(along(p, q) * 2.2) % 2 else p.col
    if d == 'book':
        return pal['paper'] if f in ('north', 'south') and 0.1 < p.v < 0.9 and p.u > 0.12 else p.col
    return p.col


def wing_px(m, p):
    c, q = p.cube, p.local()
    kind, side, root, span, ytop, tall = c['kind'], c['side'], c['root'], c['span'], c['ytop'], c['tall']
    a = abs(q[0] - root) / span                                  # 0 at the root, 1 at the tip
    h = (ytop - q[1]) / tall                                     # 0 at the top edge, 1 at the bottom
    if kind == 'bat':
        scallop = 0.55 + 0.3 * abs(math.sin(a * math.pi * 3))
        if h > scallop * (1 - a * 0.4) or a > 0.98:
            return None
        return p.pal['dark'] if abs(math.sin(a * math.pi * 3)) < 0.06 or h < 0.06 else p.col
    if kind == 'crystal':
        if h > 0.9 - a * 0.6 or (a * 3) % 1.0 < 0.08:
            return None
        return lit(p.pal['glow']) if (a * 3) % 1.0 < 0.18 else p.col
    if kind == 'tatter':
        if h > 0.85 - 0.25 * abs(math.sin(a * 9)) - a * 0.3:
            return None
        return p.pal['t2'] if int(a * 7) % 2 else p.col
    # feathers: rows that lengthen toward the tip
    row = int(h * 4)
    lim = 0.95 - a * 0.35 + 0.08 * math.sin(a * 22)
    if h > lim:
        return None
    if c.get('edge') and h < 0.08:
        return p.pal[c['edge']]
    return mul(p.col, 0.86 + 0.06 * row) if int(a * 14) % 2 else p.col
