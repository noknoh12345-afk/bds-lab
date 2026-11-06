"""What the people hold at the chest: guns designed as props at the body's own scale, 1 texel per unit, painted texel by
texel and lit by the game as it lights the clothes (raw), like a held item of the game's own.

How they are designed, so each reads at a glance on a figure a few blocks away:
 - a silhouette of its own: stock, receiver, grip, magazine, handguard, barrel, sights - each a box of its own size,
   chunkier than the real thing (a toy's proportions: about two thirds of the body's height);
 - three values: the metal (`gun`), the dark parts (`gun2`: magazine, rails, muzzle) and the furniture (`furn`: stock,
   grip, handguard - black, tan, olive or wood), so the gun stands out from the clothes behind it;
 - the light on the top edge, the shade under it, small marks where the real thing has them (vents, rail teeth, cooling
   fins, a drum's ring, a scope's lens) - never noise;
 - it sits on the fists of the `hold` pose (entities.POSES): the grip and magazine above them, the stock against the
   chest, nothing of it inside the body or the arms.

    gun(m, kind, s=1.0, at=None)     a gun on bone `gun_<kind>` under `gun` (the shot recoils `gun`), its muzzle flash
"""
from __future__ import annotations

import math

from hq_parts import flash as _flash, octa
from kit import mix, mul
from kitbash import nb
from parts import lit

FULL = {f: 1.0 for f in ('north', 'south', 'east', 'west', 'up', 'down')}


def flash(m, *a, **k):
    """a muzzle flash (hq_parts.flash), unless the model never shoots on screen (a unit: m.noflash)"""
    if not getattr(m, 'noflash', False):
        _flash(m, *a, **k)
SIDES = ('north', 'south', 'east', 'west')
GUN_AT = (-1.6, 22.4, -5.6)


def C(m, c):
    from tailor import C as tc
    return tc(m, c)


# ------------------------------------------------------------------------------------------------ painters
def shade(col, p, top=1.12, under=0.62, edge=1.12, low=0.86, ends=0.92):
    """a hard part: its top a little lighter, the top row of its sides lit, the bottom row and the underside in shade"""
    f = p.face
    if f == 'up':
        return mul(col, top)
    if f == 'down':
        return mul(col, under)
    k = ends if f in ('north', 'south') else 1.0
    if p.h >= 2 and f in SIDES:
        if p.j == 0:
            k *= edge
        elif p.j == p.h - 1:
            k *= low
    return mul(col, k)


def solid(m, col, **kw):
    c = C(m, col)
    return lambda p: shade(c, p, **kw)


def vents(m, col, along='z'):
    """a handguard: slots along its sides (every other texel of the middle rows)"""
    c = C(m, col)

    def pp(p):
        if p.face in ('east', 'west') and p.h >= 3 and 0 < p.j < p.h - 1 and p.i % 2 == 1 and 0 < p.i < p.w - 1:
            return mul(c, 0.55)
        return shade(c, p)
    return pp


def teeth(m, col):
    """a rail on top: its teeth across"""
    c = C(m, col)

    def pp(p):
        if p.face == 'up' and p.j % 2 == 0:
            return mul(c, 0.7)
        if p.face in ('east', 'west') and p.i % 2 == 0:
            return mul(c, 0.8)
        return shade(c, p)
    return pp


def fins(m, col, step=2):
    """a cooled barrel: rings round it"""
    c = C(m, col)

    def pp(p):
        if p.face in ('east', 'west') and p.i % step == 0:
            return mul(c, 0.66)
        if p.face in ('up', 'down') and p.j % step == 0:
            return mul(c, 0.66)
        return shade(c, p)
    return pp


def wood(m, col):
    """wood: its grain along the length, a lighter edge on top"""
    c = C(m, col)

    def pp(p):
        q = p.inbone()
        g = 1.0 + 0.06 * math.sin(q[1] * 3.1 + q[2] * 0.4) + (0.05 if (int(q[1] * 2.0 + q[2] * 0.15) % 3 == 0) else 0.0)
        return shade(mul(c, g), p)
    return pp


def glowing(m, col):
    c = C(m, col)
    return lambda p: lit(mul(c, 1.1 if p.face in ('up', 'north') else 1.0))


def lens(m, col, glass='#9ae0ff', face='north'):
    """a sight or scope: the glass on its front (north) or back (south), the body's paint elsewhere"""
    c, g = C(m, col), C(m, glass)

    def pp(p):
        if p.face == face and 0 < p.i < p.w - 1 and 0 < p.j < p.h - 1:
            return lit(g)
        if p.face == face and p.w <= 2 and p.h <= 2:
            return lit(g)
        return shade(c, p)
    return pp


def ring(m, col, accent):
    """a drum or cylinder: a ring round its face"""
    c, a = C(m, col), C(m, accent)

    def pp(p):
        if p.face in ('east', 'west') and (p.i in (0, p.w - 1) or p.j in (0, p.h - 1)):
            return mul(a, 1.05)
        return shade(c, p)
    return pp


# ------------------------------------------------------------------------------------------------ a gun being made
class Gun:
    """parts of one gun in its own frame: x across (+x the left), y up, z along (-z the muzzle), at origin `at` (the
    receiver's back at the grip), every length times s"""

    def __init__(self, m, bone, at, s):
        self.m, self.b, self.at, self.s = m, bone, at, s

    def P(self, v):
        return tuple(self.at[i] + v[i] * self.s for i in range(3))

    def box(self, name, x0, x1, y0, y1, z0, z1, paint, rot=None, pivot=None, only=None):
        (ax, ay, az), S = self.at, self.s
        c = self.m.box(self.b, f'{self.b}_{name}', ax + x0 * S, ax + x1 * S, ay + y0 * S, ay + y1 * S, az + z0 * S, az + z1 * S, 'white',
                       rot=rot, pivot=self.P(pivot) if pivot else None, decal='tailor', dens=FULL, raw=True, only=only)
        c['pp'] = paint
        return c

    def tube(self, name, axis, c, lo, hi, r, paint, bone=None):
        """an eight-sided tube (octa) along an axis, in the gun's frame"""
        (ax, ay, az), S = self.at, self.s
        if axis == 'z':
            cc, a, b = (ax + c[0] * S, ay + c[1] * S), az + lo * S, az + hi * S
        elif axis == 'x':
            cc, a, b = (ay + c[0] * S, az + c[1] * S), ax + lo * S, ax + hi * S
        else:
            cc, a, b = (ax + c[0] * S, az + c[1] * S), ay + lo * S, ay + hi * S
        out = octa(self.m, bone or self.b, f'{bone or self.b}_{name}', axis, cc, a, b, r * S, 'white', decal='tailor', dens=FULL, raw=True)
        for k in out:
            k['pp'] = paint
        return out


# ------------------------------------------------------------------------------------------------ the guns
def ensure_gun(m, at=None):
    at = at or getattr(m, 'gun_at', GUN_AT)
    if 'gun' not in m.bmap:
        m.bone('gun', m.rig.parts['body'][0], at)


def stockpaint(m, furn, dark, wooden=False):
    """a stock: the furniture's paint, its butt plate (the rear end, against the chest) dark"""
    fp = wood(m, furn) if wooden else solid(m, furn)
    dk = C(m, dark)

    def pp(p):
        f, i, j, w, h = p.face, p.i, p.j, p.w, p.h
        if f == 'south' or (f == 'east' and i == 0) or (f == 'west' and i == w - 1) or (f == 'up' and j == 0) or (f == 'down' and j == h - 1):
            return shade(dk, p)
        return fp(p)
    return pp


def stock(g, P, drop=1.9, tilt=8, chest=-3.0):
    """the stock from the receiver's back to the chest's clothes (it ends there whatever the gun's size)"""
    length = max(1.4, (chest - g.at[2]) / g.s)
    g.box('stock', -0.7, 0.7, -drop, 0.5, -0.4, length, P['stock'], rot=(tilt, 0, 0), pivot=(0, 0, 0))


def grip(g, furn, z=-0.8):
    g.box('grip', -0.5, 0.5, -3.2, -0.8, z - 1.3, z, furn, rot=(18, 0, 0), pivot=(0, -0.9, z - 0.65))


def rifle(m, g, kind, P):
    """ar / lmg / sr / amr: a long gun; P: its painters"""
    long = {'ar': 1.0, 'lmg': 1.12, 'sr': 1.32, 'amr': 1.5}[kind]
    rw = 0.9 if kind != 'amr' else 1.1
    stock(g, P, drop=2.0 if kind in ('sr', 'amr') else 1.9)
    g.box('recv', -rw, rw, -1.0, 1.0, -6.6, -0.2, P['metal'])
    grip(g, P['furn'])
    hl = 5.6 * long
    g.box('hand', -rw - 0.05, rw + 0.05, -0.95, 0.95, -6.6 - hl, -6.5, P['vents'] if kind in ('ar', 'lmg') else P['furn'])
    bl = (3.6 if kind != 'amr' else 5.0) * long
    zb = -6.6 - hl
    g.box('barrel', -0.38, 0.38, -0.05, 0.75, zb - bl, zb + 0.1, P['metal'])
    mz = zb - bl
    if kind == 'amr':
        g.box('brake', -0.8, 0.8, -0.4, 1.1, mz - 1.8, mz + 0.05, P['slots'])
        mz -= 1.8
    else:
        g.box('muzzle', -0.55, 0.55, -0.25, 0.95, mz - 1.2, mz + 0.05, P['dark'])
        mz -= 1.2
    g.box('rail', -0.45, 0.45, 0.9, 1.35, zb + 0.6, -0.8, P['teeth'])
    if kind == 'ar':
        g.box('mag', -0.55, 0.55, -4.6, -0.9, -5.1, -3.7, P['dark'], rot=(-14, 0, 0), pivot=(0, -1.0, -4.4))
        g.box('post', -0.2, 0.2, 0.75, 2.0, zb - 0.9, zb - 0.3, P['dark'])
        g.box('rear', -0.45, 0.45, 1.35, 2.0, -1.7, -1.0, P['dark'])
    if kind == 'lmg':
        g.tube('drum', 'x', (-2.6, -4.2), -1.15, 1.15, 1.8, P['drum'])
        g.box('handle', -0.3, 0.3, 1.3, 2.35, -5.35, -4.65, P['dark'])
        g.box('handle2', -0.36, 0.36, 2.3, 2.75, -5.45, -2.15, P['dark'])
        g.box('handle3', -0.3, 0.3, 1.3, 2.35, -2.95, -2.25, P['dark'])
        g.box('dot', -0.6, 0.6, 1.33, 2.5, -1.9, -0.5, P['dot'])
        g.box('bipod', -0.85, 0.85, -1.4, -0.95, zb - bl * 0.8, zb + 1.0, P['dark'])
    if kind in ('sr', 'amr'):
        sc = 0.82 if kind == 'sr' else 0.95
        g.tube('scope', 'z', (0, 2.45), -7.0, -0.4, sc, P['scope'])
        g.box('lensf', -0.5, 0.5, 1.95, 2.95, -7.25, -7.0, P['lensf'])
        g.box('mount', -0.28, 0.28, 1.3, 1.7, -5.6, -1.6, P['dark'])
        g.box('bolt', -rw - 0.9, -rw, 0.3, 0.75, -2.4, -1.9, P['metal'])
        g.box('knob', -rw - 1.3, -rw - 0.8, 0.0, 0.8, -2.5, -1.8, P['dark'])
        g.box('cheek', -0.6, 0.6, 0.5, 1.2, 0.6, 2.2, P['furn'], rot=(8, 0, 0), pivot=(0, 0, 0))
        g.box('mag', -0.5, 0.5, -2.6, -0.9, -5.0, -3.6, P['dark'])
        if kind == 'amr':
            g.box('bipod', -0.9, 0.9, -1.5, -1.0, zb - bl * 0.85, zb + 1.2, P['dark'])
    return mz


def painters(m, mt):
    metal, dark, furn = mt.get('mat', 'gun'), mt.get('mat2', 'gun2'), mt.get('furn', 'furn')
    fp = wood(m, furn) if mt.get('wood') else solid(m, furn)
    P = dict(metal=solid(m, metal), dark=solid(m, dark), furn=fp, stock=stockpaint(m, furn, dark, bool(mt.get('wood'))), vents=vents(m, furn) if not mt.get('wood') else fp, teeth=teeth(m, dark),
             slots=fins(m, dark), drum=ring(m, dark, metal), dot=lens(m, dark, '#ff5a4a', 'south'), scope=solid(m, dark),
             lensf=lens(m, dark, '#9ae0ff', 'north'), fins=fins(m, metal), glow=glowing(m, mt.get('glow', 'glow')))
    return more_painters(m, P, mt)


def gun(m, kind, at=None, s=1.0, **mt):
    """a gun on its own bone under `gun` (the shot recoils `gun`, so a level's gun recoils too), with its flash"""
    at = at or getattr(m, 'gun_at', GUN_AT)
    ensure_gun(m, at)
    B = nb(m, f'gun_{kind}')
    m.bone(B, 'gun', at)
    g = Gun(m, B, at, s)
    P = painters(m, mt)
    F = nb(m, 'gun_flash')
    if kind in ('ar', 'lmg', 'sr', 'amr'):
        mz = rifle(m, g, kind, P)
        x, y, z = g.P((0, 0.35, mz))
        flash(m, B, F, x, y, z, s)
        return
    if kind == 'smg':
        g = Gun(m, B, at, s * 1.12)                                                          # a compact gun: drawn a size up
        sl = max(1.4, (-3.0 - g.at[2]) / g.s)
        g.box('stock', -0.25, 0.25, 0.1, 0.55, -0.4, sl - 0.4, P['dark'])                  # a folding stock: two bars, a pad
        g.box('stock2', -0.25, 0.25, -1.5, -1.05, -0.4, sl - 0.4, P['dark'])
        g.box('butt', -0.65, 0.65, -1.7, 0.75, sl - 0.48, sl - 0.03, P['dark'])
        g.box('recv', -0.85, 0.85, -1.0, 1.1, -6.0, -0.3, P['metal'])
        grip(g, P['furn'])
        g.box('mag', -0.5, 0.5, -5.4, -0.9, -4.9, -3.7, P['dark'])
        g.tube('can', 'z', (0, 0.25), -11.6, -5.9, 0.82, P['dark'])                          # the suppressor
        g.box('rail', -0.4, 0.4, 1.0, 1.35, -5.6, -0.7, P['teeth'])
        g.box('dot', -0.55, 0.55, 1.35, 2.35, -3.6, -2.0, P['dot'])
        mz = -11.6
    elif kind in ('shotgun', 'combat'):
        combat = kind == 'combat'
        stock(g, P, drop=2.1, tilt=10)
        g.box('recv', -0.85, 0.85, -1.0, 1.0, -5.6 if not combat else -6.2, -0.2, P['metal'])
        grip(g, P['furn'])
        L = 13.5 if not combat else 11.0
        g.box('barrel', -0.42, 0.42, 0.0, 0.84, -L, -5.5, P['metal'])
        g.box('tubemag', -0.38, 0.38, -0.85, -0.05, -L + 1.6, -5.5, P['dark'])
        g.box('pump', -0.78, 0.78, -1.15, 0.12, -10.6 if not combat else -9.6, -6.6, P['fore'])
        g.box('bead', -0.15, 0.15, 0.84, 1.14, -L + 0.4, -L + 0.8, P['metal'])
        if combat:
            g.tube('drum', 'x', (-2.7, -3.6), -1.1, 1.1, 1.9, P['drum'])
            g.box('shield', -0.6, 0.6, 0.8, 1.15, -10.0, -6.3, P['teeth'])                  # a heat shield over the barrel
            g.box('rail', -0.45, 0.45, 1.0, 1.35, -5.8, -0.8, P['teeth'])
        mz = -L
    elif kind == 'tommy':
        stock(g, P, drop=2.3, tilt=10)
        g.box('recv', -0.85, 0.85, -0.9, 1.1, -6.6, -0.2, P['metal'])
        grip(g, P['furn'])
        g.box('fgrip', -0.5, 0.5, -3.2, -0.6, -10.6, -9.4, P['furn'], rot=(6, 0, 0), pivot=(0, -0.6, -10.0))
        g.tube('drum', 'x', (-2.3, -4.9), -1.05, 1.05, 2.0, P['drum'])
        g.box('barrel', -0.55, 0.55, -0.1, 0.9, -13.0, -6.5, P['fins'])
        g.box('comp', -0.62, 0.62, -0.2, 1.0, -14.4, -12.95, P['dark'])
        g.box('sightf', -0.15, 0.15, 0.9, 1.5, -14.2, -13.8, P['dark'])
        g.box('sightr', -0.4, 0.4, 1.1, 1.7, -1.4, -0.8, P['dark'])
        mz = -14.4
    elif kind == 'minigun':
        g = Gun(m, B, (at[0], at[1] - 0.9 * s, at[2]), s)                                    # held a little lower: the chin clear
        g.box('motor', -1.75, 1.75, -1.75, 1.75, -5.8, 0.6, P['dark'])                       # the motor housing
        g.box('cap', -1.4, 1.4, -1.4, 1.4, 0.55, 1.0, P['metal'])
        Z = nb(m, 'spinz')
        cx, cy, cz = g.P((0, 0, 0))
        m.bone(Z, B, (cx, cy, cz))
        for i in range(6):
            a = math.radians(60 * i + 30)
            bx, by = 0.95 * math.cos(a), 0.95 * math.sin(a)
            gz = Gun(m, Z, g.at, s)
            gz.box(f'b{i}', bx - 0.3, bx + 0.3, by - 0.3, by + 0.3, -18.0 + 0.02 * i, -5.7, P['metal'])
        g.tube('clamp', 'z', (0, 0), -16.4, -15.4, 1.55, P['dark'])
        g.tube('clamp2', 'z', (0, 0), -10.6, -9.6, 1.55, P['dark'])
        g.box('handle', -0.3, 0.3, 1.7, 3.15, -4.75, -4.05, P['metal'])                      # the carry handle, an arch
        g.box('handle2', -0.36, 0.36, 3.1, 3.6, -4.85, -0.55, P['metal'])
        g.box('handle3', -0.3, 0.3, 1.7, 3.15, -1.35, -0.65, P['metal'])
        g.box('box', 1.95, 4.2, -2.6, 1.2, -4.2, -0.4, P['furn'])                            # the ammo box on its left
        g.box('belt', 1.6, 2.0, -1.6, 0.6, -3.6, -1.0, P['belt'])
        g.box('grip', -0.5, 0.5, -3.6, -1.7, -2.4, -1.2, P['furn'])
        mz = -18.0
    elif kind in ('launcher', 'rocket', 'firework', 'hive'):
        if kind == 'launcher':
            stock(g, P, drop=1.9)
            g.box('frame', -0.8, 0.8, -1.0, 0.9, -4.2, -0.2, P['metal'])
            grip(g, P['furn'])
            g.tube('cyl', 'z', (0, 0.4), -8.6, -4.1, 2.0, P['drum'])
            g.tube('tube', 'z', (0, 0.4), -14.0, -8.5, 1.1, P['metal'])
            g.box('fgrip', -0.5, 0.5, -3.4, -0.6, -11.6, -10.4, P['furn'])
            g.box('ladder', -0.5, 0.5, 2.4, 3.4, -6.8, -6.0, P['dark'])
            mz = -14.0
        elif kind == 'rocket':
            g.tube('tube', 'z', (0, 1.0), -12.5, 0.4, 1.45, P['furn'])                     # its back end clear of the chin
            g.tube('bell', 'z', (0, 1.0), -0.2, 1.3, 1.7, P['dark'])
            g.tube('head', 'z', (0, 1.0), -15.0, -12.4, 1.0, P['warhead'])
            g.box('tip', -0.45, 0.45, 0.55, 1.45, -16.2, -14.95, P['warhead'])
            grip(g, P['dark'], z=-1.0)
            g.box('fgrip', -0.5, 0.5, -3.0, 0.2, -7.4, -6.2, P['dark'])
            g.box('sight', 1.4, 2.3, 1.6, 3.2, -6.0, -3.6, P['dot'])
            mz = -16.2
        elif kind == 'firework':
            g.box('frame', -1.6, 1.6, -1.2, 0.6, -6.0, 0.6, P['metal'])
            grip(g, P['furn'])
            for i, (dx, dy, c) in enumerate(((-0.95, 1.5, 'red'), (0.95, 1.5, 'blue'), (0.0, 3.1, 'gold'))):
                g.tube(f'tube{i}', 'z', (dx, dy), -9.0, 0.6, 0.78, solid(m, 'furn'))
                g.box(f'rocket{i}', dx - 0.45, dx + 0.45, dy - 0.45, dy + 0.45, -10.6 - 0.04 * i, -8.9, solid(m, c))
            mz = -10.6
        else:                                                                                  # a hive
            g.tube('hive', 'z', (0, 1.8), -9.0, 1.4, 2.0, P['hive'])
            g.tube('mouth', 'z', (0, 1.8), -10.0, -8.9, 1.2, P['dark'])
            grip(g, P['furn'])
            g.box('fgrip', -0.5, 0.5, -3.0, -0.3, -6.6, -5.4, P['furn'])
            mz = -10.0
        x, y, z = g.P((0, 1.0 if kind in ('rocket',) else 0.4, mz))
        flash(m, B, F, x, y, z, 0.9 * s)
        return
    elif kind in ('flamer', 'freezer', 'frostcannon', 'toxic', 'slime', 'paintball'):
        tint = {'flamer': 'c', 'freezer': 'ice', 'frostcannon': 'ice', 'toxic': 'glow', 'slime': 'glow', 'paintball': 'c'}[kind]
        big = 1.25 if kind == 'frostcannon' else 1.0
        g.box('body', -0.95 * big, 0.95 * big, -1.1 * big, 1.1 * big, -6.4, 0.6, P['metal'])
        grip(g, P['furn'])
        g.box('fgrip', -0.5, 0.5, -3.0, -0.6, -6.0, -4.8, P['furn'])
        g.box('pipe', -0.5, 0.5, -0.4, 0.6, -11.0, -6.3, P['dark'])
        g.tube('nozzle', 'z', (0, 0.1), -12.4, -10.9, 0.9 * big, P['metal'])
        if kind == 'paintball':
            g.tube('hopper', 'y', (0, -2.6), 1.0, 3.6, 1.3, solid(m, tint))
            g.box('hoplid', -0.8, 0.8, 3.6, 4.0, -3.4, -1.8, P['dark'])
        else:
            g.tube('tank', 'z', (0, 2.2), -5.4, -0.6, 1.05 * big, P['tank'] if kind != 'flamer' else solid(m, tint))
            g.box('gauge', -0.4, 0.4, 3.2 * big, 3.6 * big, -3.4, -2.6, lens(m, 'gun2', '#fff0a0', 'up'))
        if kind == 'flamer':
            g.box('pilot', -0.3, 0.3, 0.15, 0.65, -12.8, -12.4, glowing(m, 'flash'))
        if kind in ('freezer', 'frostcannon'):
            for i in range(3):
                g.tube(f'fin{i}', 'z', (0, 0.1), -9.4 + 1.1 * i, -8.8 + 1.1 * i, 1.0 * big, solid(m, 'ice2'))
        mz = -12.4
    elif kind in ('laser', 'pulse', 'tesla', 'rail'):
        L = 16.0 if kind == 'rail' else 12.0
        stock(g, P, drop=1.8)
        g.box('body', -0.95, 0.95, -1.1, 1.2, -7.2, -0.2, P['metal'])
        grip(g, P['furn'])
        g.box('barrel', -0.45, 0.45, -0.1, 0.8, -L, -7.1, P['dark'])
        for i in range(4 if kind == 'rail' else 3):
            g.tube(f'coil{i}', 'z', (0, 0.35), -8.3 - 1.7 * i, -7.6 - 1.7 * i, 0.9, P['glow'])
        g.box('cell', -0.5, 0.5, 1.2, 1.9, -5.6, -1.6, P['glow'])
        if kind == 'rail':
            g.tube('scope', 'z', (0, 2.6), -6.4, -1.4, 0.7, P['scope'])
        if kind == 'tesla':
            for i, (dx, dy) in enumerate(((-0.9, 1.2), (0.9, 1.2), (0.0, -0.6))):
                g.box(f'prong{i}', dx - 0.22, dx + 0.22, dy - 0.22, dy + 0.22, -L - 1.4 - 0.03 * i, -L + 0.2, P['metal'])
        mz = -L
    elif kind == 'medigun':
        g.box('body', -1.0, 1.0, -1.1, 1.3, -7.0, 0.5, P['med'])
        g.box('pipe', -0.45, 0.45, -0.1, 0.8, -11.0, -6.9, P['metal'])
        g.tube('nozzle', 'z', (0, 0.35), -11.8, -10.8, 0.8, P['metal'])
        g.tube('can', 'z', (0, 2.3), -5.8, -1.4, 0.9, P['glow'])
        grip(g, P['furn'])
        mz = -11.8
    elif kind == 'crossbow':
        stock(g, P, drop=1.8)
        g.box('tiller', -0.6, 0.6, -0.8, 0.7, -9.0, -0.2, P['furn'])
        grip(g, P['dark'])
        b = g.box('limbs', -5.2, 5.2, 0.2, 0.2, -9.0, -6.4, P['limb'], only=('up', 'down'))
        b['dens'] = {'up': 2.0, 'down': 2.0}
        g.box('bolt', -0.15, 0.15, 0.7, 1.0, -9.8, -1.2, P['metal'])
        x, y, z = g.P((0, 0.85, -9.8))
        flash(m, B, F, x, y, z, 0.6 * s)
        return
    else:
        raise KeyError(kind)
    if kind != 'tesla':
        x, y, z = g.P((0, 0.3, mz))
        flash(m, B, F, x, y, z, 0.85 * s)


def more_painters(m, P, mt):
    P['fore'] = wood(m, mt.get('furn', 'furn')) if mt.get('wood') else vents(m, mt.get('furn', 'furn'))
    P['belt'] = lambda p: C(m, 'gold') if p.i % 2 == 0 else mul(C(m, 'gold'), 0.7)
    P['warhead'] = solid(m, mt.get('head', 'red'))
    P['tank'] = glowing(m, mt.get('glow', 'glow'))
    P['hive'] = lambda p: (mul(C(m, 'yellow'), 0.72) if (p.i + p.j) % 3 == 0 and p.face in SIDES else shade(C(m, 'yellow'), p))
    P['med'] = (lambda p: C(m, 'red') if p.face in ('east', 'west') and ((p.i == p.w // 2 and 0 < p.j < p.h - 1) or (p.j == p.h // 2 and 0 < p.i < p.w - 1))
                else shade(C(m, 'white'), p))
    P['limb'] = lambda p: (shade(C(m, mt.get('furn', 'furn')), p) if abs((p.j + 0.5) / p.h - (0.8 - 0.62 * ((p.i + 0.5) / p.w * 2 - 1) ** 2)) < 0.2
                           else None)
    return P


# ------------------------------------------------------------------------------------------------ in a fist
class Held:
    """parts of a thing held in a fist, in its own frame: x across, u up (the arm's front when it is raised), f forward
    (down the arm, past the fist); origin at the fist's centre"""

    def __init__(self, m, bone, x, y, z, s):
        self.m, self.b, self.o, self.s = m, bone, (x, y, z), s

    def box(self, name, x0, x1, u0, u1, f0, f1, paint, rot=None, pivot=None, only=None):
        (ox, oy, oz), S = self.o, self.s
        piv = (ox + pivot[0] * S, oy - pivot[2] * S, oz - pivot[1] * S) if pivot else None
        c = self.m.box(self.b, f'{self.b}_{name}', ox + x0 * S, ox + x1 * S, oy - f1 * S, oy - f0 * S, oz - u1 * S, oz - u0 * S, 'white',
                       rot=rot, pivot=piv, decal='tailor', dens=FULL, raw=True, only=only)
        c['pp'] = paint
        return c


def pistol(m, side, kind='revolver', s=1.0, **mt):
    """a pistol or revolver in a fist: its grip in the fist, its barrel down the arm past it (forward when the arm is
    raised), its sights on the arm's front (up when raised), a flash at its muzzle"""
    if side not in m.rig.hands:
        return
    hb, (x, y0, z) = m.rig.hands[side]
    B = nb(m, f'{kind}_{side}')
    yc = y0 + 2.0                                                    # the fist's centre: the arm's last 4 units
    m.bone(B, hb, (x, yc, z))
    h = Held(m, B, x, yc, z, s)
    P = painters(m, mt)
    wd = wood(m, mt.get('furn', 'furn')) if mt.get('wood') else P['furn']
    h.box('grip', -0.5, 0.5, -1.0, 2.3, -1.6, 0.1, wd, rot=(-14, 0, 0), pivot=(0, 2.2, -0.6))
    if kind == 'revolver':
        h.box('frame', -0.55, 0.55, 2.0, 3.4, -1.2, 2.6, P['metal'])
        h.box('cyl', -0.85, 0.85, 1.85, 3.55, 0.5, 2.3, P['drum'])
        h.box('barrel', -0.4, 0.4, 2.45, 3.25, 2.5, 7.4, P['metal'])
        h.box('rib', -0.2, 0.2, 3.25, 3.55, 2.6, 7.4, P['dark'])
        h.box('hammer', -0.2, 0.2, 3.3, 3.85, -1.45, -0.8, P['dark'])
        mz, mu = 7.4, 2.85
    else:
        h.box('slide', -0.6, 0.6, 2.0, 3.4, -1.4, 6.0, P['metal'])
        h.box('frame', -0.55, 0.55, 1.4, 2.05, -0.6, 5.4, P['dark'])
        mz, mu = 6.0, 2.7
    if getattr(m, 'noflash', False):
        return
    F = nb(m, f'gun{side}_flash')
    fx, fy, fz = x, yc - mz * s, z - mu * s
    m.bone(F, B, (fx, fy, fz))
    fl, fw = 2.8 * s, 1.2 * s
    from kitbash import tag
    tag(m.box(F, f'{F}_a', fx - fw, fx + fw, fy - fl, fy, fz, fz, 'flash', only=('north', 'south'), decal='flamey', dens=4), top=fy, h=fl)
    tag(m.box(F, f'{F}_b', fx, fx, fy - fl, fy, fz - fw, fz + fw, 'flash', only=('east', 'west'), decal='flamey', dens=4), top=fy, h=fl)


def bow(m, side='r', s=1.0, **mt):
    """a longbow upright in a fist (the `bow` pose: the arm straight ahead), its limbs curving back toward the archer as
    tilted links joined end to end, the string drawn to the nock behind the grip, an arrow on the knuckles"""
    if side not in m.rig.hands:
        return
    hb, (x, y0, z0) = m.rig.hands[side]
    B = nb(m, f'bow_{side}')
    yc = y0 + 2.0
    m.bone(B, hb, (x, yc, z0))
    P = painters(m, mt)
    wd = wood(m, mt.get('furn', 'wood'))
    U = lambda u: z0 - u * s                                        # noqa: E731  (up when the arm is raised)
    Fw = lambda f: yc - f * s                                       # noqa: E731  (forward when raised)
    pts = []
    for u in (7.2, 5.2, 2.8, 0.0, -2.8, -5.2, -7.2):
        f = 0.5 - 2.3 * (u / 7.2) ** 2
        pts.append((U(u), Fw(f)))
    for c in m.chain(B, f'{B}_limb', x - 0.45 * s, x + 0.45 * s, pts, 0.85 * s, 'white', decal='tailor', dens=FULL, raw=True):
        c['pp'] = wd
    tips = (U(7.2), Fw(0.5 - 2.3)), (U(-7.2), Fw(0.5 - 2.3))
    nock = (U(2.9), Fw(-3.2))
    w = mt.get('string', 'white')
    for i, (a, b) in enumerate(((tips[0], nock), (nock, tips[1]))):
        c = m.slope(B, f'{B}_string{i}', x - 0.12 * s, x + 0.12 * s, a, b, 0.22 * s, 'white', decal='tailor', dens=FULL, raw=True)
        c['pp'] = solid(m, w)
    za = U(2.2)
    ar = Held(m, B, x, yc, z0 + 0.0, s)
    ar.box('shaft', -0.18, 0.18, 2.7, 3.1, -3.2, 6.0, wood(m, 'wood2'))
    ar.box('head', -0.42, 0.42, 2.45, 3.35, 5.9, 7.2, P['metal'])
    ar.box('fletch', -0.6, 0.6, 2.85, 2.95, -3.0, -1.5, solid(m, mt.get('fletch', 'red')))
    del za


def laptop(m, s=1.0, **mt):
    """an open laptop held on both fists at the belly (the `type` pose, the head bent to it): the keys on its base, the
    screen up at the far edge facing the one who types, its glow spilling over the top edge, its back dark with a lit
    mark - a laptop as the world sees it"""
    b = m.rig.parts['body'][0]
    B = nb(m, 'laptop')
    m.bone(B, b, (0, 18.9, -7.6))
    g = Gun(m, B, (0, 18.9, -7.6), s)
    case, glow = C(m, mt.get('mat', 'gun2')), C(m, mt.get('glow', 'glow'))

    def base(p):
        if p.face == 'up' and 0 < p.i < p.w - 1 and 1 < p.j < p.h - 2:
            return mul(case, 0.6) if (p.i + p.j) % 2 == 0 else mul(case, 0.85)          # the keys
        if p.face == 'up' and p.j >= p.h - 2 and abs(p.i - (p.w - 1) / 2) < 1.5:
            return mul(case, 0.7)                                                        # the pad
        return shade(case, p)

    def screen(p):
        f, i, j, w, h = p.face, p.i, p.j, p.w, p.h
        if f == 'south':
            if 0 < i < w - 1 and 0 < j < h - 1:
                return lit(glow) if (j % 2 == 1 and i < w - 2 - (j * 3) % 4) else lit(mul(glow, 0.45))   # lines of code
            return mul(case, 0.7)
        if f == 'up':
            return lit(mix(glow, (255, 255, 255), 0.2))                                  # the light over its edge
        if f == 'north':
            cx, cy = (w - 1) / 2, (h - 1) / 2
            if (abs(i - cx) <= 1.5 and abs(j - cy) <= 1.5) and not (abs(i - cx) < 0.6 and abs(j - cy) < 0.6):
                return lit(glow)                                                         # a ring: the mark on its back
            return shade(case, p)
        return shade(case, p)
    g.box('base', -4.4, 4.4, -0.3, 0.3, -3.0, 3.0, base)
    g.box('screen', -4.35, 4.35, 0.0, 5.6, -3.3, -2.8, screen, rot=(-14, 0, 0), pivot=(0, 0.0, -3.05))


def boomerang(m, side='r', s=1.0, **mt):
    """a boomerang held by one end: two flat arms at a wide angle, wood with a painted band at each tip"""
    if side not in m.rig.hands:
        return
    hb, (x, y0, z) = m.rig.hands[side]
    B = nb(m, f'boomerang_{side}')
    yc = y0 + 2.0
    m.bone(B, hb, (x, yc, z))
    h = Held(m, B, x, yc, z, s)
    wd, band = C(m, mt.get('furn', 'wood')), C(m, mt.get('band', 'red'))

    def pp(p, tipf=None):
        q = p.inbone()
        d = math.hypot(q[0] - x, q[1] - (yc - 6.0 * s))
        if d > 4.6 * s or (q[1] > yc - 2.2 * s):
            return shade(band, p) if p.face != 'down' else mul(band, 0.6)
        return shade(mul(wd, 1.0 + 0.05 * math.sin(q[0] * 2 + q[1])), p)
    h.box('arm', -0.75, 0.75, -0.3, 0.3, 0.2, 6.6, pp)
    h.box('arm2', -0.75, 0.75, -0.25, 0.25, 0.2, 6.0, pp, rot=(0, 0, -105), pivot=(0, 0, 6.0))


# ------------------------------------------------------------------------------------------------ carried in a fist
def carry(m, side, kind, s=1.0, **mt):
    """a thing carried in a fist, hanging from it when the arm hangs: a medkit, a gift, a money bag, a torch, a
    pitchfork, a baton, a candy cane; or a riot shield on the forearm"""
    if side not in m.rig.hands:
        return
    hb, (x, y0, z) = m.rig.hands[side]
    B = nb(m, f'{kind}_{side}')
    yc = y0 + 2.0
    m.bone(B, hb, (x, yc, z))
    h = Held(m, B, x, yc, z, s)
    if kind == 'medkit':
        red, white = C(m, mt.get('mark', 'red')), C(m, mt.get('mat', 'white'))

        def kit(p):
            if p.face in ('east', 'west') and ((abs(p.i - (p.w - 1) / 2) < 0.6 and 0 < p.j < p.h - 1) or (abs(p.j - (p.h - 1) / 2) < 0.6 and 0 < p.i < p.w - 1)):
                return red
            return shade(white, p)
        h.box('handle', -0.3, 0.3, -0.6, 0.6, 1.6, 2.6, solid(m, 'gun2'))
        h.box('box', -1.6, 1.6, -2.6, 2.6, 2.5, 6.2, kit)
    elif kind == 'gift':
        box, rib = C(m, mt.get('mat', 'red')), C(m, mt.get('mark', 'gold'))

        def gp(p):
            if (abs(p.i - (p.w - 1) / 2) < 0.6) or (p.face in SIDES and abs(p.j - (p.h - 1) / 2) < 0.6) or (p.face in ('up', 'down') and abs(p.j - (p.h - 1) / 2) < 0.6):
                return rib
            return shade(box, p)
        h.box('box', -2.2, 2.2, -2.2, 2.2, 1.8, 6.2, gp)
    elif kind == 'moneybag':
        bag, mark = C(m, mt.get('mat', 'bag')), C(m, mt.get('mark', '#3a8a3a'))

        def mb(p):
            if p.face in ('north', 'south', 'east', 'west') and 1 <= p.i <= p.w - 2 and 1 <= p.j <= p.h - 2:
                cx = (p.w - 1) / 2
                if abs(p.i - cx) < 0.6 or (p.j in (1, p.h - 2) and abs(p.i - cx) < 1.6) or (p.j == p.h // 2 and abs(p.i - cx) < 1.6):
                    return mark                                                  # a dollar mark
            return shade(bag, p)
        h.box('neck', -0.7, 0.7, -0.7, 0.7, 1.4, 2.6, solid(m, mt.get('mat', 'bag')))
        h.box('tie', -0.85, 0.85, -0.85, 0.85, 2.4, 2.9, solid(m, 'strap'))
        h.box('bag', -2.3, 2.3, -2.3, 2.3, 2.8, 7.4, mb)
    elif kind == 'snowball':
        sc = C(m, mt.get('mat', 'white'))
        g = Held(m, B, x, yc, z, s)
        g.box('ball', -1.65, 1.65, -1.65, 1.65, 1.6, 4.9, lambda p: shade(mul(sc, 0.92) if (p.i + p.j) % 3 == 0 else sc, p))
    elif kind == 'torch':
        h.box('stick', -0.4, 0.4, -0.4, 0.4, -3.0, 7.0, wood(m, 'wood'))
        h.box('wrap', -0.6, 0.6, -0.6, 0.6, 6.6, 8.2, solid(m, 'strap'))
        from kitbash import tag
        F = nb(m, f'{kind}_{side}_fire')
        m.bone(F, B, (x, yc - 8.2 * s, z))
        c = m.box(F, f'{F}_a', x - 1.3 * s, x + 1.3 * s, yc - 12.4 * s, yc - 8.0 * s, z, z, 'flash', only=('north', 'south'), decal='flamey', dens=3)
        tag(c, top=yc - 8.0 * s, h=4.4 * s)
    elif kind == 'pitchfork':
        h.box('shaft', -0.4, 0.4, -0.4, 0.4, -9.0, 9.0, wood(m, 'wood'))
        h.box('bar', -2.0, 2.0, -0.35, 0.35, 8.6, 9.4, solid(m, 'metal2'))
        for k, dx in enumerate((-1.7, 0.0, 1.7)):
            h.box(f'tine{k}', dx - 0.25, dx + 0.25, -0.25, 0.25, 9.3, 13.0 - 0.6 * abs(dx), solid(m, 'metal'))
    elif kind == 'baton':
        h.box('grip', -0.45, 0.45, -0.45, 0.45, -1.5, 1.8, solid(m, 'gun2'))
        h.box('rod', -0.38, 0.38, -0.38, 0.38, 1.7, 8.5, solid(m, mt.get('mat', 'black')))
    elif kind == 'cane':
        rc, wc = C(m, 'red'), C(m, 'white')
        stripe = lambda p: shade(rc if int(p.inbone()[1] * 0.9 + (p.inbone()[2] if p.face in ('east', 'west') else p.inbone()[0]) * 0.9) % 2 else wc, p)  # noqa: E731
        h.box('shaft', -0.5, 0.5, -0.5, 0.5, -3.0, 9.0, stripe)
        h.box('hook', -0.47, 0.47, -3.4, 0.45, 9.0, 10.0, stripe)
        h.box('hook2', -0.44, 0.44, -3.35, -2.4, 7.4, 9.05, stripe)
    elif kind == 'riotshield':
        clear = C(m, mt.get('mat', '#b8d8e8'))

        def sh(p):                                                               # its broad faces: up / down in the fist's frame
            if p.face in SIDES:
                return shade(C(m, 'gun2'), p)
            if p.i in (0, p.w - 1) or p.j in (0, p.h - 1):
                return mul(C(m, 'gun2'), 1.1)                                    # its rim
            if abs(p.j - p.h * 0.3) < 0.6 and 0 < p.i < p.w - 1:
                return C(m, 'white')                                             # a band across
            return mul(clear, 1.12) if (p.i + p.j) % 7 == 0 else clear              # the gear's alpha lights, it does not clear
        h.box('board', -4.2, 4.2, -6.5, 6.5, 2.3, 2.8, sh)                        # upright ahead when the arm is raised
        h.box('grip', -0.4, 0.4, -0.4, 0.4, 0.4, 2.35, solid(m, 'gun2'))
    else:
        raise KeyError(kind)
