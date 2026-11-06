"""Bodies we build ourselves for the entities no vanilla mob fits (original designs): a jelly slime, a mystery crate on
legs, a portal ring, beacons, a balloon, a floating eye, plant creatures, snowmen, ice blocks, a mist cloud, a hound.

Each is drawn by the body render controller with its own texture and no gear. Bones the animations move: `root` (bob,
hop, squash), `spin` (turns), `leg0..leg3` (a four-legged walk), `lid` (a crate's lid), `petals` (a plant's crown).
Painted by position like everything else (kit.py); `t1 t2 t3 glow trim` come from the theme (kitbash.THEMES).
"""
from __future__ import annotations

import math

from hq_parts import octa
from kit import Model, mix, mul
from kitbash import MATS, THEMES, hash3, vnoise
from parts import lit
from rigs import ours


def body(name, theme='plain', mats=None, hidden=False, width=128):
    th = THEMES[theme]
    pal = {**MATS, **th['pal'], **(mats or {})}
    variants = {'': {'_alpha': {'*': 150, 'glow': 230}}} if hidden else None
    m = Model(name, density=2.0, width=width, materials=pal, variants=variants, emissive=not hidden)
    m.glow |= {'glow', 'flash'}
    m.bone('root', None, (0, 0, 0))
    m.paint_fns = {}
    m.decal = lambda p, m=m: body_px(m, p)
    return m


def body_px(m, p):
    c, q, f = p.cube, p.local(), p.face
    d, pal = c['decal'], p.pal
    yb = q[1] - c['o'][1]
    if d is None:
        return p.col
    if d == 'jelly':
        n = vnoise(q[0], q[1], q[2], 0.8)
        if f == 'north' and abs(q[0]) > 1.0 and abs(q[0]) < 3.4 and 5.0 < q[1] < 7.0:
            return pal['dark']                                   # its eyes
        if f == 'north' and abs(q[0]) < 1.6 and 2.6 < q[1] < 3.4:
            return pal['dark']
        return mul(p.col, 1.15) if n > 0.68 else (lit(pal['glow']) if hash3(*q) > 0.97 else p.col)
    if d == 'crate':
        if f == 'up':
            return pal['t2'] if abs(q[0]) < 0.5 or abs(q[2]) < 0.5 else p.col
        e = min(p.u, 1 - p.u, p.v, 1 - p.v)
        if e < 0.1:
            return pal['trim']
        if abs(p.u - p.v) < 0.07 or abs(p.u + p.v - 1) < 0.07:
            return pal['t2']
        if f == 'north' and 0.3 < p.u < 0.7 and 0.25 < p.v < 0.75:     # a question mark, by position
            u, v = (p.u - 0.3) / 0.4, (p.v - 0.25) / 0.5
            mark = (v < 0.2 and 0.2 < u < 0.8) or (0.2 <= v < 0.45 and u > 0.6) or (0.4 <= v < 0.6 and 0.4 < u < 0.7) or (v > 0.78 and 0.4 < u < 0.6)
            return lit(pal['glow']) if mark else p.col
        return p.col
    if d == 'wood':
        return mul(p.col, 0.82) if int(q[1] * 1.6) % 3 == 0 else p.col
    if d == 'ring':
        return lit(pal['glow']) if (q[1] * 0.7 + math.atan2(q[0], q[1] - c.get('cy', 0)) * 3) % 2 < 0.5 else p.col
    if d == 'swirl':
        r = math.hypot(q[0], q[1] - c.get('cy', 0))
        a = math.atan2(q[0], q[1] - c.get('cy', 0))
        k = (r * 0.7 - a * 1.3) % 2.0
        return lit(pal['glow']) if k < 0.45 else (pal['t3'] if k < 0.9 else p.col)
    if d == 'beacon':
        if f == 'up' or (f in ('north', 'south', 'east', 'west') and yb > c['s'][1] - 0.8):
            return lit(pal['glow'])
        return pal['t2'] if int(q[1] * 1.2) % 2 == 0 else p.col
    if d == 'cross':
        return lit(pal['glow']) if min(p.u, 1 - p.u, p.v, 1 - p.v) < 0.12 else p.col
    if d == 'balloon':
        if f == 'north' and 0.35 < p.v < 0.55 and (0.25 < p.u < 0.4 or 0.6 < p.u < 0.75):
            return pal['white']                                  # a painted face
        if f == 'north' and 0.62 < p.v < 0.7 and 0.3 < p.u < 0.7:
            return pal['dark']
        return mul(p.col, 1.2) if (q[0] + q[1] * 0.6) % 4 < 0.5 else p.col
    if d == 'eyeball':
        if f == 'north':
            r = math.hypot(p.u - 0.5, p.v - 0.5)
            if r < 0.14:
                return pal['black']
            if r < 0.3:
                return lit(pal['glow'])
            if r < 0.34:
                return pal['t3']
        return pal['red'] if abs(math.sin(q[0] * 2.0 + q[1] * 1.3)) < 0.05 else p.col
    if d == 'petal':
        return mul(p.col, 1.15) if p.v < 0.3 else (pal['t3'] if p.v > 0.85 else p.col)
    if d == 'root':
        return mul(p.col, 0.82) if int((q[0] + q[1] * 1.7) * 1.3) % 3 == 0 else p.col
    if d == 'leafy':
        return pal['t2'] if (q[0] * 1.3 + q[2] * 0.7 + q[1] * 2.1) % 2.0 < 0.6 else p.col
    if d == 'snow':
        return mul(p.col, 0.94) if hash3(*q) > 0.7 else p.col
    if d == 'coal':
        return pal['black']
    if d == 'carrot':
        return mul(p.col, 0.85) if int(along_z(q) * 2) % 2 else p.col
    if d == 'ice':
        k = (q[1] * 0.9 + (q[0] + q[2]) * 0.8) % 2.4
        cracked = c.get('cracked')
        if cracked and abs(math.sin(q[0] * 1.9 + q[1] * 1.1) * math.cos(q[2] * 1.3 - q[1])) < 0.08:
            return lit(pal['glow'])
        return lit(pal['glow']) if k < 0.25 else (pal['t3'] if k > 1.9 else (pal['t2'] if hash3(*q) > 0.8 else p.col))
    if d == 'mist':
        n = vnoise(q[0], q[1], q[2], 0.6)
        if n > 0.72:
            return None
        return pal['t3'] if n < 0.3 else (lit(pal['glow']) if hash3(*q) > 0.985 else p.col)
    if d == 'fur':
        return pal['t2'] if (q[0] * 1.7 + q[1] * 2.3 + q[2]) % 1.6 < 0.4 else p.col
    if d == 'lava':
        k = abs(math.sin(q[0] * 1.3 + q[1] * 0.7) * math.cos(q[2] * 1.1 - q[1] * 0.9))
        return lit(pal['glow']) if k < 0.12 else (pal['t2'] if vnoise(*q) > 0.55 else p.col)
    if d == 'glowface':
        if f == 'north' and 0.3 < p.v < 0.55 and (0.15 < p.u < 0.4 or 0.6 < p.u < 0.85):
            return lit(pal['glow'])
        return body_theme(m, p)
    if d == 'theme':
        return body_theme(m, p)
    if d == 'metal':
        return mul(p.col, 1.18) if f != 'down' and p.v < 0.2 else p.col
    return p.col


def along_z(q):
    return q[2]


def body_theme(m, p):
    """the theme's pattern on a body cube (the same looks as the shells, kitbash.shell_px)"""
    q = p.local()
    th = m.th_style
    if th == 'crust':
        return body_px_lava(p)
    if th == 'ice':
        k = (q[1] * 0.9 + (q[0] + q[2]) * 0.8) % 2.4
        return lit(p.pal['glow']) if k < 0.25 else (p.pal['t3'] if k > 1.9 else p.col)
    if th == 'specks':
        return lit(p.pal['glow']) if hash3(q[0] * 1.3, q[1] * 1.3, q[2] * 1.3) > 0.94 else (p.pal['t2'] if vnoise(*q) > 0.55 else p.col)
    return p.pal['t2'] if vnoise(*q) > 0.6 else p.col


def body_px_lava(p):
    q = p.local()
    k = abs(math.sin(q[0] * 1.3 + q[1] * 0.7) * math.cos(q[2] * 1.1 - q[1] * 0.9))
    return lit(p.pal['glow']) if k < 0.12 else (p.pal['t2'] if vnoise(*q) > 0.55 else p.col)


def _rig(key, extra=(), parts=None, family='hop'):
    bones = [('root', None, (0, 0, 0))] + list(extra)
    return ours(key, bones, parts or {}, family=family)


# ------------------------------------------------------------------------------------------------ the bodies
def slime(name, theme='toxic', mats=None, size=1.0):
    m = body(name, theme, {'t1': '#5ac850', 't2': '#3a9a34', 't3': '#9af07a', **(mats or {})})
    s = 7.0 * size
    m.box('root', 'jelly', -s, s, 0, 2 * s, -s, s, 't1', decal='jelly', seam=True)
    m.box('root', 'core', -s * 0.4, s * 0.4, s * 0.5, s * 1.3, -s * 0.4, s * 0.4, 'glow')
    m.th_style = None
    return m, _rig(name, parts={'body': ('root', (-s, s, 0, 2 * s, -s, s), 0.0)}), 'hop'


def crate(name, theme='plain', mats=None, size=1.0, legs=True):
    m = body(name, theme, {'t1': '#a8763c', 't2': '#7a5228', 'trim': '#4a321e', 'glow': '#ffe060', **(mats or {})})
    s = 5.0 * size
    y0 = 4.0 if legs else 0
    m.bone('lid', 'root', (0, y0 + 2 * s, s))
    m.box('root', 'crate', -s, s, y0, y0 + 2 * s - 0.6, -s, s, 't1', decal='crate', seam=True)
    m.box('lid', 'lid', -s - 0.3, s + 0.3, y0 + 2 * s - 0.6, y0 + 2 * s + 0.6, -s - 0.3, s + 0.3, 't2', decal='crate', seam=True)
    if legs:
        for i, (x, z) in enumerate(((-s * 0.55, -s * 0.4), (s * 0.55, -s * 0.4), (-s * 0.55, s * 0.4), (s * 0.55, s * 0.4))):
            m.bone(f'leg{i}', 'root', (x, y0, z))
            m.box(f'leg{i}', f'leg{i}', x - 0.6, x + 0.6, 0, y0 + 0.4, z - 0.6, z + 0.6, 'dark', decal='wood')
    m.th_style = None
    return m, _rig(name, [('lid', 'root', (0, y0 + 2 * s, s))] + [(f'leg{i}', 'root', (0, y0, 0)) for i in range(4)]), 'hop'


def portal(name, theme='void', mats=None, size=1.0):
    m = body(name, theme, mats)
    r = 7.0 * size
    cy = r + 1.3
    m.bone('spin', 'root', (0, cy, 0))
    t = 2 * r * math.tan(math.radians(11.25))
    for i in range(16):                                          # a ring of sixteen stones standing on edge
        a = 22.5 * i
        x, y = r * math.sin(math.radians(a)), cy - r * math.cos(math.radians(a))
        c = m.box('root', f'stone{i}', x - t / 2 - 0.1, x + t / 2 + 0.1, y - 1.0, y + 1.0, -1.0 - 0.02 * (i % 2), 1.0 + 0.02 * (i % 2), 't1',
                  rot=(0, 0, -a) if a else None, pivot=(x, y, 0), decal='ring')
        c['cy'] = cy
    c = m.box('spin', 'swirl', -r + 1.0, r - 1.0, cy - r + 1.0, cy + r - 1.0, 0, 0, 'glow', only=('north', 'south'), decal='swirl', dens=2.0)
    c['cy'] = cy
    m.box('root', 'base', -3.0, 3.0, 0, 1.2, -2.0, 2.0, 't2', decal='theme')
    m.th_style = THEMES[theme].get('style')
    return m, _rig(name, [('spin', 'root', (0, cy, 0))]), 'float'


def beacon(name, theme='plain', mats=None, size=1.0, kind='heal'):
    m = body(name, theme, mats)
    s = size
    m.bone('spin', 'root', (0, 9 * s, 0))
    octa(m, 'root', 'base', 'y', (0, 0), 0, 2.0 * s, 4.0 * s, 't2', decal='theme')
    m.box('root', 'pillar', -1.6 * s, 1.6 * s, 2.0 * s, 8.0 * s, -1.6 * s, 1.6 * s, 't1', decal='beacon')
    if kind == 'heal':                                           # a white cross, its edges lit
        m.box('spin', 'cross_v', -0.9 * s, 0.9 * s, 8.6 * s, 14.6 * s, -0.6 * s, 0.6 * s, 'white', decal='cross')
        m.box('spin', 'cross_h', -2.8 * s, 2.8 * s, 10.7 * s, 12.5 * s, -0.55 * s, 0.55 * s, 'white', decal='cross')
    else:
        for i in range(4):
            w = (0.7 + 0.04 * i) * s
            m.box('spin', f'shard{i}', -w, w, 8.5 * s + 0.03 * i, (14.0 - 0.6 * i) * s, -w, w, 't3', rot=(0, 45 + 90 * i, 20), pivot=(0, 8.5 * s, 0), decal='ice')
    for i in range(4):
        a = 90 * i + 45
        x, z = 3.2 * s * math.sin(math.radians(a)), -3.2 * s * math.cos(math.radians(a))
        m.box('spin', f'mote{i}', x - 0.5, x + 0.5, 10.5 * s, 11.5 * s, z - 0.5, z + 0.5, 'glow')
    m.th_style = THEMES[theme].get('style')
    return m, _rig(name, [('spin', 'root', (0, 9 * s, 0))]), 'float'


def balloon(name, theme='plain', mats=None):
    m = body(name, theme, {'t1': '#e84a4a', 't2': '#b83030', **(mats or {})})
    m.box('root', 'string', -0.12, 0.12, 0, 9.0, -0.12, 0.12, 'white')
    octa(m, 'root', 'balloon', 'y', (0, 0), 9.0, 21.0, 5.5, 't1', decal='balloon')
    octa(m, 'root', 'knot', 'y', (0, 0), 8.4, 9.2, 0.8, 't2')
    m.box('root', 'basket', -2.0, 2.0, -1.0, 1.0, -2.0, 2.0, 'wood', decal='wood')
    m.th_style = None
    return m, _rig(name), 'float'


def eye(name, theme='void', mats=None, size=1.0):
    m = body(name, theme, {'t1': '#e8e0f0', 't3': '#3a1a5a', **(mats or {})})
    s = 5.0 * size
    cy = s + 3.0
    m.bone('spin', 'root', (0, cy, 0))
    m.box('root', 'eye', -s, s, cy - s, cy + s, -s, s, 't1', decal='eyeball', seam=True)
    for i in range(6):                                           # tendrils hanging under it
        a = 60 * i
        x, z = s * 0.6 * math.sin(math.radians(a)), s * 0.6 * math.cos(math.radians(a))
        m.box('root', f'tendril{i}', x - 0.5, x + 0.5, cy - s - 3.5 - (i % 2), cy - s + 0.2, z - 0.5, z + 0.5, 't2', rot=(10 * math.cos(math.radians(a)), 0, -10 * math.sin(math.radians(a))), pivot=(x, cy - s, z), decal='theme')
    for i in range(4):
        a = 90 * i + 45
        x, z = (s + 2.4) * math.sin(math.radians(a)), (s + 2.4) * math.cos(math.radians(a))
        m.box('spin', f'shard{i}', x - 0.5, x + 0.5, cy - 1.5, cy + 1.5, z - 0.5, z + 0.5, 'glow', rot=(0, a, 0), pivot=(x, cy, z))
    m.th_style = THEMES[theme].get('style')
    return m, _rig(name, [('spin', 'root', (0, cy, 0))]), 'float'


def floater(name, theme='void', mats=None):
    """a drifting jelly: a domed bell and trailing ribbons"""
    m = body(name, theme, mats)
    m.bone('spin', 'root', (0, 12, 0))
    octa(m, 'root', 'bell', 'y', (0, 0), 10.0, 16.0, 6.0, 't1', decal='theme')
    octa(m, 'root', 'dome', 'y', (0, 0), 15.8, 18.2, 4.0, 't3', decal='theme')
    octa(m, 'root', 'core', 'y', (0, 0), 11.0, 14.0, 2.6, 'glow')
    for i in range(6):
        a = 60 * i
        x, z = 4.0 * math.sin(math.radians(a)), 4.0 * math.cos(math.radians(a))
        m.box('spin', f'ribbon{i}', x - 0.8, x + 0.8, 1.0 + (i % 2) * 2, 10.2, z, z, 't2', only=('north', 'south'), decal='theme', dens=2.0)
    m.th_style = THEMES[theme].get('style')
    return m, _rig(name, [('spin', 'root', (0, 12, 0))]), 'float'


def plant(name, theme='plant', mats=None, size=1.0, flower='#c83a8a'):
    """a root creature: a gnarled root body on root legs, leaves for hair, a flower crown"""
    m = body(name, theme, {'t3': flower, **(mats or {})})
    s = size
    for i, x in enumerate((-1.6, 1.6)):
        m.bone(f'leg{i}', 'root', (x * s, 4.0 * s, 0))
        m.box(f'leg{i}', f'rootleg{i}', (x - 0.8) * s, (x + 0.8) * s, 0, 4.4 * s, -0.8 * s, 0.8 * s, 'wood', rot=(0, 0, 12 if x > 0 else -12), pivot=(x * s, 4.0 * s, 0), decal='root')
    octa(m, 'root', 'tuber', 'y', (0, 0), 4.0 * s, 12.0 * s, 3.4 * s, 'wood2', decal='root')
    m.box('root', 'face', -2.2 * s, 2.2 * s, 7.0 * s, 10.0 * s, -3.5 * s, -3.4 * s, 'dark', decal='glowface')
    m.bone('petals', 'root', (0, 12.0 * s, 0))
    for i in range(5):
        a = 72 * i
        m.box('petals', f'leaf{i}', -0.9 * s, 0.9 * s, 11.6 * s, 18.0 * s, -0.25 * s, 0.25 * s, 't1', rot=(28, a, 0), pivot=(0, 12.0 * s, 0), decal='leafy')
    for i in range(5):
        a = 72 * i + 45                                          # (no petal parallel to a leaf)
        m.box('petals', f'petal{i}', -1.2 * s, 1.2 * s, 12.6 * s + 0.04, 15.6 * s, -0.21 * s, 0.21 * s, 't3', rot=(55, a, 0), pivot=(0, 12.6 * s, 0), decal='petal')
    octa(m, 'petals', 'bud', 'y', (0, 0), 12.2 * s, 14.0 * s, 1.05 * s, 'glow')
    m.th_style = None
    return m, _rig(name, [('leg0', 'root', (0, 4, 0)), ('leg1', 'root', (0, 4, 0)), ('petals', 'root', (0, 12, 0))]), 'hop'


def snowman(name, theme='frost', mats=None, size=1.0, hat=None):
    m = body(name, theme, {'t1': '#f4f8ff', 't2': '#d8e4f0', **(mats or {})})
    s = size
    octa(m, 'root', 'base', 'y', (0, 0), 0, 9.0 * s, 5.5 * s, 't1', decal='snow')
    octa(m, 'root', 'mid', 'y', (0, 0), 8.6 * s, 15.6 * s, 4.3 * s, 't1', decal='snow')
    m.bone('head_s', 'root', (0, 15.4 * s, 0))
    octa(m, 'head_s', 'head', 'y', (0, 0), 15.4 * s, 21.4 * s, 3.4 * s, 't1', decal='snow')
    for sx in (-1, 1):
        m.box('head_s', f'coal{sx}', sx * 1.4 * s - 0.5 * s, sx * 1.4 * s + 0.5 * s, 18.6 * s, 19.6 * s, -3.75 * s, -3.45 * s, 'black', decal='coal')
    m.box('head_s', 'carrot', -0.5 * s, 0.5 * s, 17.4 * s, 18.4 * s, -6.6 * s, -3.4 * s, 'orange', decal='carrot')
    for i in range(3):
        m.box('root', f'button{i}', -0.5 * s, 0.5 * s, (10 + 2 * i) * s, (11 + 2 * i) * s, -4.55 * s, -4.25 * s, 'black', decal='coal')
    for sx in (-1, 1):
        m.rise_x('root', f'arm{"l" if sx > 0 else "r"}', (sx * 4.0 * s if sx > 0 else -11.0 * s, 13.0 * s if sx > 0 else 16.0 * s),
                 (11.0 * s if sx > 0 else -4.0 * s, 16.0 * s if sx > 0 else 13.0 * s), -0.4 * s, 0.4 * s, 0.8 * s, 'wood', decal='wood')
    m.box('root', 'scarf', -4.5 * s, 4.5 * s, 14.6 * s, 16.2 * s, -4.5 * s, 4.5 * s, 'red', decal='metal')
    if hat == 'top':
        m.box('head_s', 'hat_brim', -4.4 * s, 4.4 * s, 21.2 * s, 21.8 * s, -4.4 * s, 4.4 * s, 'black', decal='metal')
        m.box('head_s', 'hat_top', -2.8 * s, 2.8 * s, 21.8 * s, 26.0 * s, -2.8 * s, 2.8 * s, 'black', decal='metal')
    elif hat == 'crown':
        for i in range(5):
            a = 72 * i
            x, z = 2.6 * s * math.sin(math.radians(a)), 2.6 * s * math.cos(math.radians(a))
            m.box('head_s', f'icespike{i}', x - 0.5 * s, x + 0.5 * s, 20.8 * s, 24.6 * s, z - 0.5 * s, z + 0.5 * s, 'ice', rot=(0, a, 0), pivot=(x, 21 * s, z), decal='ice')
    m.th_style = None
    return m, _rig(name, [('head_s', 'root', (0, 15.4, 0))]), 'hop'


def iceblock(name, theme='frost', mats=None, size=1.0, cracked=False, eyes=True):
    m = body(name, theme, mats)
    s = 6.0 * size
    c = m.box('root', 'block', -s, s, 0, 2 * s, -s, s, 't2', decal='ice', seam=True)
    c['cracked'] = cracked
    for i in range(4):
        a = 90 * i + 30
        x, z = s * 0.8 * math.sin(math.radians(a)), s * 0.8 * math.cos(math.radians(a))
        m.box('root', f'shard{i}', x - 1.0, x + 1.0, 2 * s - 0.5, 2 * s + 3.0 + i % 2, z - 1.0, z + 1.0, 't3', rot=(15, a, 0), pivot=(x, 2 * s, z), decal='ice')
    if eyes:
        for sx in (-1, 1):
            m.box('root', f'eye{sx}', sx * s * 0.35 - 0.8, sx * s * 0.35 + 0.8, s * 1.1, s * 1.1 + 1.2, -s - 0.05, -s - 0.05, 'glow', only=('north', 'south'))
    m.th_style = None
    return m, _rig(name), 'hop'


def cloud(name, theme='frost', mats=None, hidden=True):
    m = body(name, theme, {'t1': '#dceef8', 't2': '#b8d4e8', 't3': '#f4fbff', **(mats or {})}, hidden=hidden)
    m.bone('spin', 'root', (0, 8, 0))
    for i, (x, y, z, r) in enumerate(((0, 8, 0, 4.0), (-4.2, 7, 1.15, 3.0), (4.4, 7.4, -0.6, 3.2), (0.6, 10.6, 1.4, 2.8), (-1.6, 6.0, -3.0, 2.6))):
        m.box('spin', f'puff{i}', x - r, x + r, y - r * 0.8, y + r * 0.8, z - r, z + r, 't1', decal='mist', seam=True)
    for sx in (-1, 1):
        m.box('spin', f'eye{sx}', sx * 1.4 - 0.6, sx * 1.4 + 0.6, 8.2, 9.4, -4.05, -4.05, 'glow', only=('north', 'south'))
    m.th_style = None
    return m, _rig(name, [('spin', 'root', (0, 8, 0))]), 'float'


def hound(name, theme='molten', mats=None, size=1.0):
    """a four-legged beast: a long body, a head with a jaw, legs at the four corners"""
    m = body(name, theme, mats)
    s = size
    m.box('root', 'torso', -3.0 * s, 3.0 * s, 6.0 * s, 12.0 * s, -6.0 * s, 6.0 * s, 't1', decal='lava' if theme == 'molten' else 'theme', seam=True)
    m.bone('headb', 'root', (0, 11.0 * s, -6.0 * s))
    m.box('headb', 'head', -2.6 * s, 2.6 * s, 9.0 * s, 14.0 * s, -11.0 * s, -5.6 * s, 't1', decal='glowface', seam=True)
    m.box('headb', 'jaw', -2.0 * s, 2.0 * s, 8.0 * s, 9.2 * s, -10.6 * s, -6.0 * s, 't2', decal='theme')
    for sx in (-1, 1):
        m.box('headb', f'ear{sx}', sx * 1.8 * s - 0.6 * s, sx * 1.8 * s + 0.6 * s, 13.6 * s, 16.0 * s, -7.6 * s, -6.6 * s, 't2', rot=(-15, 0, -sx * 12), pivot=(sx * 1.8 * s, 14 * s, -7 * s))
    for i, (x, z) in enumerate(((-2.0, -4.4), (2.0, -4.4), (-2.0, 4.4), (2.0, 4.4))):
        m.bone(f'leg{i}', 'root', (x * s, 7.0 * s, z * s))
        m.box(f'leg{i}', f'leg{i}', (x - 0.95) * s, (x + 0.95) * s, 0, 7.2 * s, (z - 0.95) * s, (z + 0.95) * s, 't2', decal='theme')
    m.bone('tailb', 'root', (0, 11.0 * s, 6.0 * s))
    m.box('tailb', 'tail', -0.6 * s, 0.6 * s, 10.4 * s, 11.6 * s, 6.0 * s, 12.0 * s, 't2', rot=(-25, 0, 0), pivot=(0, 11 * s, 6 * s), decal='theme')
    for i in range(3):
        m.box('root', f'spine{i}', -0.5 * s, 0.5 * s, 11.6 * s, 14.0 * s, (-3.0 + 3 * i) * s, (-2.0 + 3 * i) * s, 'glow', rot=(-20, 0, 0), pivot=(0, 12 * s, (-2.5 + 3 * i) * s))
    m.th_style = THEMES[theme].get('style')
    return m, _rig(name, [('headb', 'root', (0, 11, -6))] + [(f'leg{i}', 'root', (0, 7, 0)) for i in range(4)] + [('tailb', 'root', (0, 11, 6))], family='beast'), 'beast'
