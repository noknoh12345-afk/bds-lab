"""Detailed parts for the original-level looks: rounded prisms on any axis, weapons, a helmet with goggles, a vest with
pouches, a muzzle flash, and the shared decals that paint them by position.

Level upgrades like the original's: a bone named lvN_<part> shows from tower level N on, preN_<part> only below N
(render controller part_visibility, entities.py). Every cube-bearing bone of an upgrade carries its prefix.
The muzzle flash sits in bones named *flash*: the always-on idle animation moves them 1000 units down and the fire
animation adds them back for 0.05 s (positions add), so a flash shows only when a shot is played."""
from __future__ import annotations

import math

from kit import mix, mul
from parts import bags, lit, over, sample, spr, stone

FLASH_BONES = ('pre4_flash', 'lv4_flash', 'pre3_flash', 'lv3_flash')


def octa(m, bone, name, axis, c, lo, hi, r, mat, **kw):
    """an eight-sided prism along axis 'x' | 'y' | 'z', centred at c (the two other coordinates), from lo to hi, apothem r:
    four slabs a 45-degree step apart (their union is the octagon), each a hair shorter so no two ends share a plane"""
    t = 2 * r * math.tan(math.radians(22.5))
    kw.setdefault('seam', True)
    out = []
    for i in range(4):
        d = 0.03 * i
        rot = None
        if axis == 'y':
            cx, cz = c
            box = (cx - t / 2, cx + t / 2, lo + d, hi - d, cz - r, cz + r)
            rot, piv = ((0, 45.0 * i, 0) if i else None), (cx, (lo + hi) / 2, cz)
        elif axis == 'z':
            cx, cy = c
            box = (cx - t / 2, cx + t / 2, cy - r, cy + r, lo + d, hi - d)
            rot, piv = ((0, 0, 45.0 * i) if i else None), (cx, cy, (lo + hi) / 2)
        else:
            cy, cz = c
            box = (lo + d, hi - d, cy - r, cy + r, cz - t / 2, cz + t / 2)
            rot, piv = ((45.0 * i, 0, 0) if i else None), ((lo + hi) / 2, cy, cz)
        out.append(m.box(bone, f'{name}{i}', *box, mat, rot=rot, pivot=piv if rot else None, **kw))
    return out


def flash(m, parent, name, x, y, z, s=1.0):
    """a muzzle flash at (x, y, z) pointing -z: two crossed flame plates and a star facing forward, lit, cut by alpha"""
    m.bone(name, parent, (x, y, z))
    L, W = 3.4 * s, 1.5 * s
    m.box(name, name + '_v', x, x, y - W, y + W, z - L, z, 'flash', only=('east', 'west'), decal='flame', dens=4)
    m.box(name, name + '_h', x - W, x + W, y, y, z - L, z, 'flash', only=('up', 'down'), decal='flame', dens=4)
    m.box(name, name + '_f', x - W, x + W, y - W, y + W, z - 0.4, z - 0.4, 'flash', only=('north', 'south'), decal='star', dens=4)


def rifle(m, bone, parent, g, kind='ar', s=1.0, sight='iron'):
    """a long gun along -z on its own bone (recoil moves `parent`'s child `bone`); g = (x, y, z): the receiver's back at
    the grip line. kind: 'ar' assault rifle, 'lmg' light machine gun (drum, shroud, carry handle), 'sr' sniper rifle
    (long barrel, bolt, big scope), 'amr' anti-materiel rifle (bigger, muzzle brake). sight: 'iron' | 'dot' | 'scope'."""
    x, y, z = g
    m.bone(bone, parent, g)
    S = lambda v: v * s  # noqa: E731
    long = {'ar': 1.0, 'lmg': 1.15, 'sr': 1.45, 'amr': 1.7}[kind]
    rw = 0.85 if kind != 'amr' else 1.05
    m.box(bone, f'{bone}_stock', x - S(0.75), x + S(0.75), y - S(1.9), y + S(0.5), z - S(0.2), z + S(3.0), 'gun2', rot=(8, 0, 0), pivot=(x, y, z), decal='gunmetal')
    m.box(bone, f'{bone}_recv', x - S(rw), x + S(rw), y - S(0.95), y + S(1.1), z - S(6.2), z - S(0.1), 'gun', decal='gunmetal')
    m.box(bone, f'{bone}_grip', x - S(0.55), x + S(0.55), y - S(3.4), y - S(0.7), z - S(2.0), z - S(0.6), 'gun2', rot=(16, 0, 0), pivot=(x, y - S(0.8), z - S(1.3)))
    m.box(bone, f'{bone}_guard', x - S(0.2), x + S(0.2), y - S(1.75), y - S(1.45), z - S(3.7), z - S(1.95), 'gun')
    fore = z - S(6.1)
    hl = S(5.0 * long)
    m.box(bone, f'{bone}_hand', x - S(1.0), x + S(1.0), y - S(0.8), y + S(0.9), fore - hl, fore, 'gun2' if kind != 'lmg' else 'gun', decal='rail')
    bl = S(4.0 * long + (2.0 if kind in ('sr', 'amr') else 0))
    m.box(bone, f'{bone}_barrel', x - S(0.38), x + S(0.38), y - S(0.05), y + S(0.72), fore - hl - bl, fore - hl + S(0.1), 'gun')
    mz = fore - hl - bl
    big = 0.75 if kind == 'amr' else 0.6
    m.box(bone, f'{bone}_muzzle', x - S(big), x + S(big), y - S(0.3), y + S(0.95), mz - S(1.3 if kind == 'amr' else 1.0), mz + S(0.05), 'gun', decal='slots')
    m.box(bone, f'{bone}_rail', x - S(0.42), x + S(0.42), y + S(1.1), y + S(1.48), fore - hl * 0.7, z - S(1.0), 'gun2', decal='teeth')
    if kind == 'ar':
        m.box(bone, f'{bone}_mag', x - S(0.6), x + S(0.6), y - S(4.0), y - S(0.8), z - S(4.9), z - S(3.4), 'gun2', rot=(-14, 0, 0), pivot=(x, y - S(0.8), z - S(4.15)))
    if kind == 'lmg':
        octa(m, bone, f'{bone}_drum', 'x', (y - S(2.4), z - S(4.0)), x - S(1.1), x + S(1.1), S(1.7), 'gun2', decal='drum')
        m.box(bone, f'{bone}_handle', x - S(0.3), x + S(0.3), y + S(1.45), y + S(2.5), z - S(5.0), z - S(2.4), 'gun', decal='gunmetal')
        m.box(bone, f'{bone}_legs', x - S(0.9), x + S(0.9), y - S(1.1), y - S(0.7), mz + S(0.6), fore - hl + S(1.0), 'gun2')
    if kind in ('sr', 'amr'):
        m.box(bone, f'{bone}_bolt', x + S(rw), x + S(rw + 0.9), y + S(0.4), y + S(0.75), z - S(2.6), z - S(2.2), 'gun')
        m.box(bone, f'{bone}_cheek', x - S(0.7), x + S(0.7), y + S(0.5), y + S(1.2), z + S(0.8), z + S(2.4), 'gun2', rot=(8, 0, 0), pivot=(x, y, z))
        m.box(bone, f'{bone}_mag', x - S(0.5), x + S(0.5), y - S(2.4), y - S(0.8), z - S(4.6), z - S(3.4), 'gun2')
    top = y + S(1.48)
    if sight == 'dot':
        m.box(bone, f'{bone}_dot', x - S(0.6), x + S(0.6), top, top + S(1.3), z - S(4.6), z - S(2.6), 'gun', decal='lens')
    elif sight == 'scope':
        sc = 0.75 if kind != 'amr' else 0.9
        octa(m, bone, f'{bone}_scope', 'z', (x, top + S(1.25)), z - S(7.2), z - S(0.6), S(sc), 'gun', decal='scope')
        m.box(bone, f'{bone}_mount', x - S(0.35), x + S(0.35), top - S(0.05), top + S(0.55), z - S(5.4), z - S(2.0), 'gun2')
    else:
        m.box(bone, f'{bone}_post', x - S(0.2), x + S(0.2), y + S(0.9), y + S(1.9), mz + S(1.0), mz + S(1.5), 'gun')
        m.box(bone, f'{bone}_rear', x - S(0.45), x + S(0.45), top, top + S(0.7), z - S(1.8), z - S(1.2), 'gun')
    return (x, y + S(0.33), mz - S(1.3 if kind == 'amr' else 1.0))          # the muzzle, for the flash


def helmet(m, bone, cx, cz, y0, y1, r, mat, band=None, goggles=False, brim=True):
    """a rounded combat helmet: an eight-sided shell, a band a hair proud, a short brim, goggles on the band"""
    octa(m, bone, f'{bone}_shell', 'y', (cx, cz), y0, y1, r, mat, decal='helmet')
    if band:
        octa(m, bone, f'{bone}_band', 'y', (cx, cz), y0 + 0.5, y0 + 1.5, r + 0.14, band, decal='strap')
    if brim:
        m.slope(bone, f'{bone}_brim', cx - r * 0.75, cx + r * 0.75, (cz - r - 1.2, y0 + 0.2), (cz - r + 0.6, y0 + 1.0), 0.45, mat)
    if goggles:
        for sx in (-1, 1):
            octa(m, bone, f'{bone}_lens{"l" if sx > 0 else "r"}', 'z', (cx + sx * 1.7, y0 + 1.0), cz - r - 0.7, cz - r + 0.3, 0.95, 'gun', decal='goggle')


def vest(m, bone, x0, x1, y0, y1, z0, z1, mat, pouch, radio=True, tag='vest'):
    """a plate carrier a hair over the body with three pouches across the front, two at the sides, and a radio"""
    m.box(bone, tag, x0, x1, y0, y1, z0, z1, mat, decal='vest')
    w = (x1 - x0) / 3
    for i in range(3):
        px = x0 + w * i + 0.25
        m.box(bone, f'{tag}_p{i}', px, px + w - 0.5, y0 + 0.6, y0 + 3.4, z0 - 0.9, z0 + 0.05, pouch, decal='pouch')
    for sx, xx in ((1, x1), (-1, x0)):
        lo, hi = sorted((xx - sx * 0.05, xx + sx * 0.9))
        m.box(bone, f'{tag}_s{"l" if sx > 0 else "r"}', lo, hi, y0 + 1.2, y0 + 4.2, z0 + 0.8, z1 - 0.8, pouch, decal='pouch')
    if radio:
        m.box(bone, f'{tag}_radio', x1 - 2.4, x1 - 0.4, y1 - 0.2, y1 + 2.4, z1 - 0.2, z1 + 1.4, 'gun2', decal='radio')
        m.box(bone, f'{tag}_ant', x1 - 1.2, x1 - 0.9, y1 + 2.3, y1 + 8.5, z1 + 0.4, z1 + 0.7, 'gun')


def pedestal(m, bone='tds_base', r=13.3, h=3.0, r2=11.4, h2=1.5, mat='stone', mat2='disc', trim='trim'):
    """the original's tower base: an eight-sided plinth with a proud trim band, the role-coloured top with its emblem"""
    octa(m, bone, 'plinth', 'y', (0, 0), 0.0, h, r, mat, decal='stone')
    octa(m, bone, 'trimband', 'y', (0, 0), 0.6, 1.25, r + 0.18, trim, decal='trim')
    octa(m, bone, 'top', 'y', (0, 0), h - 0.4, h + h2, r2, mat2, decal='disc')
    return h + h2


def pips(m, y, r, bone='tds_base', size=0.75):
    for i in range(1, 8):
        a = math.radians(-54 + (i - 1) * 18)
        x, z = r * math.sin(a), -r * math.cos(a)
        m.bone(f'pip{i}', bone, (x, y, z))
        m.box(f'pip{i}', f'pip{i}', x - size, x + size, y - 0.05, y + size * 1.4, z - size, z + size, 'gold', rot=(0, -math.degrees(a), 0), pivot=(x, y, z), decal='gem')


# ---------------------------------------------------------------------------------------------- shared decals
def along(p, q):
    return q[2] if p.face in ('east', 'west') else q[0]


def hq_decal(p, emblem=None, emblem_r=9.0):
    """paints the shared parts; returns None when the cube is not one of them (the model's decal goes on)"""
    d, c, q = p.cube['decal'], p.cube, p.local()
    if d is None:
        return p.col
    if d == 'flame':
        thin = 0 if p.face in ('east', 'west') else 1
        o, sz = c['o'], c['s']
        mid = (o[1] + sz[1] / 2) if p.face in ('east', 'west') else (o[0] + sz[0] / 2)
        half = (sz[1] if p.face in ('east', 'west') else sz[0]) / 2
        a = (o[2] + sz[2] - q[2]) / sz[2]                  # 0 at the muzzle, 1 at the tip
        b = abs((q[1] if p.face in ('east', 'west') else q[0]) - mid) / half
        edge = (1 - a) ** 0.7 * (0.55 + 0.45 * abs(math.sin(a * 9.0)))
        if b > edge:
            return None
        return lit(mix((255, 255, 230), (255, 150, 40), min(1.0, a * 0.8 + b * 0.6)))
    if d == 'star':
        o, sz = c['o'], c['s']
        u, v = (q[0] - o[0]) / sz[0] - 0.5, (o[1] + sz[1] - q[1]) / sz[1] - 0.5
        rr, ang = math.hypot(u, v) * 2, math.atan2(v, u)
        if rr > 0.35 + 0.6 * abs(math.cos(ang * 4)) ** 3:
            return None
        return lit(mix((255, 255, 235), (255, 170, 60), min(1.0, rr)))
    if d == 'gunmetal':
        return mul(p.col, 1.22) if p.face != 'down' and p.v < 0.18 else p.col
    if d == 'rail':
        if p.face in ('east', 'west') and 0.3 < p.v < 0.7 and int(q[2] * 1.6) % 2 == 0:
            return mul(p.col, 0.55)                         # vent holes along the handguard
        return p.col
    if d == 'teeth':
        return mul(p.col, 0.6) if int(q[2] * 2.2) % 2 == 0 else p.col
    if d == 'slots':
        return mul(p.col, 0.45) if p.face in ('east', 'west', 'up') and 0.25 < p.u < 0.75 and int(p.v * 3) == 1 else p.col
    if d == 'drum':
        return mul(p.col, 0.75) if p.face in ('east', 'west') and abs(math.hypot(q[1] - (c['o'][1] + c['s'][1] / 2), q[2] - (c['o'][2] + c['s'][2] / 2)) - 0.9) < 0.18 else p.col
    if d == 'lens':
        return lit((255, 60, 60)) if p.face == 'south' and 0.3 < p.u < 0.7 and 0.3 < p.v < 0.7 else p.col
    if d == 'scope':
        if p.face == 'north':
            return lit((140, 220, 255)) if math.hypot(p.u - 0.5, p.v - 0.5) < 0.38 else p.col
        return mul(p.col, 0.7) if p.face not in ('north', 'south') and int((q[2] - c['o'][2]) * 1.2) % 4 == 0 else p.col
    if d == 'goggle':
        return lit((120, 230, 255)) if p.face == 'north' and math.hypot(p.u - 0.5, p.v - 0.5) < 0.36 else p.col
    if d == 'helmet':
        if p.face == 'down':
            return None
        return mul(p.col, 1.08) if p.face == 'up' and math.hypot(q[0], q[2] - 0.6) < 1.4 else p.col
    if d == 'strap':
        return None if p.face in ('up', 'down') else (mul(p.col, 0.8) if int(along(p, q) * 1.5) % 4 == 0 else p.col)
    if d == 'vest':
        if p.face in ('up', 'down'):
            return None
        return mul(p.col, 0.84) if abs((q[1] - c['o'][1]) - c['s'][1] * 0.55) < 0.2 else p.col     # a seam across the plates
    if d == 'pouch':
        yb = q[1] - c['o'][1]
        if c['s'][1] - yb < 0.6:
            return mul(p.col, 0.82)                         # the flap
        return mul(p.col, 1.1) if p.face == 'north' and abs(p.u - 0.5) < 0.12 and c['s'][1] - yb < 0.9 else p.col   # its snap
    if d == 'radio':
        return lit((120, 255, 120)) if p.face == 'up' and p.u > 0.6 and p.v < 0.4 else (mul(p.col, 0.7) if p.face in ('north', 'south') and int((q[1]) * 3) % 2 == 0 else p.col)
    if d == 'stone':
        return stone(p)
    if d == 'trim':
        return mul(p.col, 1.15) if p.face != 'down' and p.v < 0.3 else p.col
    if d == 'disc':
        r = math.hypot(q[0], q[2])
        if p.face == 'up':
            if abs(r - emblem_r * 0.82) < 0.35:
                return mul(p.col, 0.82)                     # a groove round the top
            if emblem and abs(q[0]) < 4.5 and abs(q[2]) < 4.5:
                s = sample(spr('emblems', emblem), (q[0] + 4.5) / 9.0, (q[2] + 4.5) / 9.0)
                return over(p.col, s) if s[3] else p.col    # the role's emblem on top, as the original's icon
        return p.col
    if d == 'gem':
        return mul(p.col, 1.25) if p.face == 'up' or p.v < 0.3 else p.col
    if d == 'bags':
        return bags(p, row=1.9, width=4.2)
    return False
