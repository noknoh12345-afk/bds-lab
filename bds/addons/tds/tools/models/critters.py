"""The units that are living things of our own: the Biologist's plants, the consumable duckies and crab, the molten
monster. The same family as vehicles.py (1 texel per unit, painted texel by texel, lit by the game), drawn soft: rounded
by a step in where a box meets the next, leaves and petals as cut-out plates painted by position.

Bones the unit animations move (roster_entities): `stem` sways and `head_s` nods (plants), `root` rocks and `leg*` paddle
(duckies), leg0..leg5 and the claws scuttle (the crab), arm0 / arm1 / leg0 / leg1 (the monster, the golem's names).
"""
from __future__ import annotations

import math

from arms import shade
from kit import mix, mul
from parts import lit
from vehicles import C, FULL, SIDES, P, vehicle


def leaf(m, bone, name, x, y, z, length, width, col, ang=0.0, tilt=-30.0):
    """a leaf: one plate, its outline and vein painted by position, turned out from the stem"""
    lc = C(m, col)

    def pp(p):
        u, v = p.u, p.v                                                        # across, along
        half = 0.5 * math.sin(math.pi * min(1.0, v * 1.05)) ** 0.8
        if abs(u - 0.5) > half:
            return None
        if abs(u - 0.5) < 0.06:
            return mul(lc, 1.25)                                               # the vein
        return mul(lc, 0.86) if (u < 0.5) else lc
    return P(m, bone, name, x - width / 2, x + width / 2, y, y, z, z + length, pp, rot=(tilt, ang, 0), pivot=(x, y, z), only=('up', 'down'),
             dens={'up': 2.0, 'down': 2.0})


def stalk(m, bone, name, x, y0, y1, z, w, col, rot=None, pivot=None):
    return P(m, bone, name, x - w / 2, x + w / 2, y0, y1, z - w / 2, z + w / 2, lambda p: shade(mul(C(m, col), 1.08 if p.i == 0 else 1.0), p), rot=rot, pivot=pivot)


# ------------------------------------------------------------------------------------------------ plants
def pot(m, col='#9a5a46', soil='#4a3020'):
    P(m, 'root', 'pot', -3.4, 3.4, 0.0, 3.6, -3.4, 3.4, lambda p: shade(mul(C(m, col), 1.15) if p.j <= 1 and p.face in SIDES else C(m, col), p))
    P(m, 'root', 'rim', -3.9, 3.9, 3.2, 4.2, -3.9, 3.9, lambda p: None if p.face == 'down' else shade(C(m, col), p))
    P(m, 'root', 'soil', -3.2, 3.2, 3.6, 4.0, -3.2, 3.2, lambda p: shade(mul(C(m, soil), 0.85 if (p.i + p.j) % 3 == 0 else 1.0), p))


def sunflower():
    """a sunflower in a pot: a tall stem, two leaves, a big head of petals round a seed disc, turned to the sun"""
    m = vehicle('u_sunflower', dict(stem='#4a8a2a', leafc='#5aa83a', petal='#f0c030', petal2='#d89818', seeds='#5a3a1a'))
    pot(m)
    m.bone('stem', 'root', (0, 4.0, 0))
    stalk(m, 'stem', 'stalk', 0, 3.8, 18.0, 0, 1.2, 'stem')
    leaf(m, 'stem', 'leaf_l', 0.6, 9.0, 0.0, 6.0, 3.2, 'leafc', ang=90, tilt=-20)
    leaf(m, 'stem', 'leaf_r', -0.6, 12.0, 0.0, 5.0, 2.8, 'leafc', ang=-90, tilt=-20)
    m.bone('head_s', 'stem', (0, 18.0, 0), rot=(18, 0, 0))
    pc, p2, sc = C(m, 'petal'), C(m, 'petal2'), C(m, 'seeds')

    def petals(p):
        u, v = (p.u - 0.5) * 2, (p.v - 0.5) * 2
        r, a = math.hypot(u, v), math.atan2(v, u)
        edge = 0.62 + 0.36 * abs(math.cos(a * 6))                              # twelve petals round
        if r > edge:
            return None
        return p2 if r > edge - 0.12 else pc
    P(m, 'head_s', 'petals', -7.0, 7.0, 18.0, 32.0, -1.0, -1.0, petals, only=('north', 'south'), dens={'north': 1.0, 'south': 1.0})
    P(m, 'head_s', 'disc', -3.4, 3.4, 21.6, 28.4, -1.9, -0.6, lambda p: shade(mul(sc, 1.3) if (p.i + p.j) % 2 == 0 and p.face == 'north' else sc, p))
    P(m, 'head_s', 'back', -2.4, 2.4, 22.6, 27.4, -0.6, 0.4, lambda p: shade(C(m, 'stem'), p))
    return m


def ivy():
    """a clump of ivy: vines coiled up from a mound, leaves along them, thorned whips reaching out"""
    m = vehicle('u_ivy', dict(vine='#3a6a2a', leafc='#4a9a3a', leaf2='#2e7a2e', thorn='#c8c8a0', soil='#4a3020'))
    P(m, 'root', 'mound', -4.6, 4.6, 0.0, 2.4, -4.6, 4.6, lambda p: shade(mul(C(m, 'soil'), 0.9 if (p.i + p.j) % 2 else 1.0), p))
    m.bone('stem', 'root', (0, 2.0, 0))
    for k, (x, z, h, ry, rz) in enumerate(((-1.6, -1.0, 12.0, 0, 14), (1.6, 0.6, 14.0, 120, -12), (0.0, 1.8, 10.0, 240, 8))):
        stalk(m, 'stem', f'vine{k}', x, 2.0, 2.0 + h, z, 1.0, 'vine', rot=(-10, ry, rz), pivot=(x, 2.0, z))
        for j in range(3):
            y = 5.0 + j * 3.2 + k * 0.6
            leaf(m, 'stem', f'leaf{k}{j}', x, y, z, 3.6, 2.6, 'leafc' if (j + k) % 2 else 'leaf2', ang=ry + 60 * j + 30, tilt=-24)
    m.bone('head_s', 'stem', (0, 12.0, 0))
    for k, ang in enumerate((40, 160, 280)):
        stalk(m, 'head_s', f'whip{k}', 0, 11.0, 18.0, 0, 0.7, 'vine', rot=(-55, ang, 0), pivot=(0, 11.0, 0))
        for j in range(2):
            P(m, 'head_s', f'thorn{k}{j}', -0.2, 0.2, 13.0 + j * 2.2, 13.8 + j * 2.2, 0.35, 1.1, lambda p: shade(C(m, 'thorn'), p), rot=(-55, ang, 0),
              pivot=(0, 11.0, 0))
    return m


def nightshade():
    """nightshade: a dark bush, drooping bell flowers in purple, a cluster of berries glowing violet"""
    m = vehicle('u_nightshade', dict(vine='#2a3a2a', leafc='#3a5a3a', leaf2='#2a4a32', bell='#7a3aa8', bell2='#5a2a7a', berry='#c070ff', soil='#2a2030'))
    P(m, 'root', 'mound', -4.4, 4.4, 0.0, 2.2, -4.4, 4.4, lambda p: shade(C(m, 'soil'), p))
    m.bone('stem', 'root', (0, 2.0, 0))
    stalk(m, 'stem', 'stalk', 0, 2.0, 14.0, 0, 1.2, 'vine')
    for j, (y, ang) in enumerate(((5.0, 30), (7.4, 150), (9.8, 270), (12.0, 90))):
        leaf(m, 'stem', f'leaf{j}', 0, y, 0, 4.4, 3.0, 'leafc' if j % 2 else 'leaf2', ang=ang, tilt=-18)
    m.bone('head_s', 'stem', (0, 14.0, 0))
    bc, b2 = C(m, 'bell'), C(m, 'bell2')
    for k, ang in enumerate((0, 120, 240)):
        a = math.radians(ang)
        x, z = 2.6 * math.sin(a), 2.6 * math.cos(a)
        stalk(m, 'head_s', f'pedicel{k}', x * 0.5, 13.6, 15.0, z * 0.5, 0.5, 'vine', rot=(0, ang, 40), pivot=(x * 0.5, 13.6, z * 0.5))
        P(m, 'head_s', f'bell{k}', x - 1.1, x + 1.1, 11.0, 13.6, z - 1.1, z + 1.1, lambda p: None if p.face == 'down' else shade(b2 if p.j >= p.h - 1 else bc, p))
    for k, (dx, dy, dz) in enumerate(((0.0, 15.2, 0.0), (0.9, 14.6, 0.5), (-0.8, 14.7, -0.6), (0.2, 14.4, -0.9))):
        P(m, 'head_s', f'berry{k}', dx - 0.6, dx + 0.6, dy - 0.6, dy + 0.6, dz - 0.6, dz + 0.6, lambda p: lit(C(m, 'berry')))
    return m


# ------------------------------------------------------------------------------------------------ the molten monster
def molten_monster():
    """a hulk of cooled rock with lava in its cracks: a hunched body, a small head with burning eyes, heavy arms to the
    ground, short legs (arm0 / arm1 / leg0 / leg1: it walks like an iron golem)"""
    m = vehicle('u_molten_monster', dict(rock='#3a2e2a', rock2='#2a2220', lava='#ff7a2c', lava2='#ffd04a'))
    rc, r2, lv, l2 = C(m, 'rock'), C(m, 'rock2'), C(m, 'lava'), C(m, 'lava2')

    def magma(p):
        q = p.inbone()
        k = math.sin(q[0] * 1.3 + q[1] * 0.7) + math.sin(q[1] * 1.1 - q[2] * 1.4) + math.sin(q[2] * 0.9 + q[0] * 0.6)
        if abs(k) < 0.22:
            return lit(l2 if abs(k) < 0.08 else lv)                            # the glowing cracks
        return shade(r2 if k > 1.2 else rc, p)
    m.bone('body', 'root', (0, 30, 0))
    P(m, 'body', 'torso', -9.0, 9.0, 20.0, 33.0, -6.0, 5.0, magma)
    P(m, 'body', 'belly', -6.0, 6.0, 15.0, 20.2, -4.0, 3.4, magma)
    P(m, 'body', 'hump', -6.0, 6.0, 32.8, 35.2, -2.0, 4.6, magma)
    m.bone('head', 'body', (0, 32, -4))
    P(m, 'head', 'head', -3.6, 3.6, 30.0, 37.0, -10.6, -3.6, lambda p: (lit(l2) if p.face == 'north' and p.j == 2 and p.i in (1, 2, 4, 5) else magma(p)))
    for sx, arm, leg in ((-1, 'arm0', 'leg0'), (1, 'arm1', 'leg1')):
        x = sx * 11.0
        m.bone(arm, 'body', (x, 31, 0))
        P(m, arm, f'{arm}_up', x - 2.6, x + 2.6, 18.0, 32.8, -3.0, 3.0, magma)
        P(m, arm, f'{arm}_fist', x - 3.2, x + 3.2, 4.0, 18.2, -3.6, 3.6, magma)
        lx = sx * 4.5
        m.bone(leg, 'body', (lx, 15, 0))
        P(m, leg, f'{leg}_leg', lx - 3.0, lx + 3.0, 0.0, 15.2, -3.0, 3.0, magma)
    return m


# ------------------------------------------------------------------------------------------------ the duckies
DUCK = {'Fire': dict(body='#f08a2c', body2='#c8501c', beak='#ffd04a', mark='#ff4a1c', fx='flame'),
        'Confusion': dict(body='#b07ae8', body2='#7a4ab8', beak='#ffb040', mark='#ffe0ff', fx='swirl'),
        'Ice': dict(body='#a8e0ff', body2='#6ab0e0', beak='#ffb040', mark='#eef8ff', fx='frost'),
        'Poison': dict(body='#7ac83a', body2='#4a8a2a', beak='#ffb040', mark='#c070ff', fx='drip'),
        'Shock': dict(body='#f8e040', body2='#c8a820', beak='#ff9a2c', mark='#78dcff', fx='bolt')}


def ducky(kind):
    """a rubber duck that waddles to the enemy and bursts: a round body, a head with a flat beak and bright eyes, a tuft;
    its element on it (a flame crest, spiral eyes, a frost crown, poison spots, a lightning crest)"""
    d = DUCK[kind]
    m = vehicle(f'u_ducky_{kind.lower()}', {k: v for k, v in d.items() if k != 'fx'})
    bc, b2, mk = C(m, 'body'), C(m, 'body2'), C(m, 'mark')
    m.bone('duck', 'root', (0, 0, 0))

    def body(p):
        if d['fx'] == 'drip' and p.face in SIDES and (p.i * 5 + p.j * 3) % 7 == 0:
            return mk                                                          # poison spots
        return shade(b2 if p.face in SIDES and p.j >= p.h - 1 else bc, p)
    P(m, 'duck', 'body', -4.0, 4.0, 1.0, 7.0, -4.4, 5.6, body)
    P(m, 'duck', 'body_top', -3.0, 3.0, 6.95, 7.8, -3.0, 4.6, body)
    P(m, 'duck', 'tail', -2.2, 2.2, 5.0, 8.6, 5.4, 7.2, body, rot=(-30, 0, 0), pivot=(0, 5.0, 5.6))
    for sx in (-1, 1):
        lo, hi = sorted((sx * 4.0, sx * 4.5))
        P(m, 'duck', f'wing{sx}', lo, hi, 2.6, 6.0, -1.6, 4.4, lambda p: shade(b2, p))
    m.bone('head_s', 'duck', (0, 7.6, -2.0))

    def head(p):
        if p.face == 'north' and p.j == 1 and p.i in (1, p.w - 2):
            if d['fx'] == 'swirl':
                return lit(mk)
            return C(m, '#16161c')                                              # the eyes
        if p.face == 'north' and p.j == 0 and p.i in (1, p.w - 2):
            return C(m, 'white')
        return shade(bc, p)
    P(m, 'head_s', 'head', -2.6, 2.6, 7.6, 12.6, -5.4, -0.4, head)
    P(m, 'head_s', 'beak', -1.8, 1.8, 8.4, 9.6, -7.6, -5.3, lambda p: shade(C(m, 'beak'), p))
    for sx in (-1, 1):
        P(m, 'duck', f'foot{sx}', sx * 1.8 - 1.2, sx * 1.8 + 1.2, 0.0, 1.05, -2.6, 0.6, lambda p: shade(C(m, 'beak'), p))
    fx = d['fx']
    if fx == 'flame':
        for k, (x, h) in enumerate(((-0.9, 3.0), (0.0, 4.2), (0.9, 3.0))):
            P(m, 'head_s', f'flame{k}', x - 0.5, x + 0.5, 12.5 + 0.03 * k, 12.5 + h, -3.4 - 0.05 * k, -2.4 + 0.05 * k,
              lambda p, h=h: lit(C(m, 'beak') if p.j < 1 else C(m, 'mark')))
    elif fx == 'swirl':
        P(m, 'head_s', 'halo', -3.0, 3.0, 13.6, 13.6, -5.9, 0.1, lambda p: lit(mk) if abs(math.hypot(p.u - 0.5, p.v - 0.5) - 0.42) < 0.08 else None,
          only=('up', 'down'), dens={'up': 2.0, 'down': 2.0})
    elif fx == 'frost':
        for k, x in enumerate((-1.8, 0.0, 1.8)):
            P(m, 'head_s', f'crown{k}', x - 0.45, x + 0.45, 12.5, 14.6 - 0.6 * abs(x), -3.4, -2.5, lambda p: lit(mk))
    elif fx == 'drip':
        P(m, 'head_s', 'bubble', -1.0, 1.0, 12.6, 14.6, -3.4, -1.4, lambda p: lit(mix(mk, (255, 255, 255), 0.3)))
    else:
        P(m, 'head_s', 'bolt', -0.4, 0.4, 12.5, 15.4, -3.6, -2.6, lambda p: lit(mk), rot=(0, 0, 18), pivot=(0, 12.5, -3.1))
        P(m, 'head_s', 'bolt2', -0.4, 0.4, 14.4, 16.6, -3.6, -2.6, lambda p: lit(mk), rot=(0, 0, -24), pivot=(0, 14.4, -3.1))
    return m


# ------------------------------------------------------------------------------------------------ the crab
def crab():
    """a crab: a flat red shell, eyes on stalks, two claws held up, three legs a side (leg0..leg5, claw_l / claw_r)"""
    m = vehicle('u_crab', dict(shell='#d84a2a', shell2='#a83420', belly='#f0c8a0'))
    sc, s2 = C(m, 'shell'), C(m, 'shell2')
    m.bone('body', 'root', (0, 3.6, 0))
    P(m, 'body', 'shell', -4.6, 4.6, 2.6, 5.6, -3.6, 3.6, lambda p: shade(s2 if p.face in SIDES and p.j >= p.h - 1 else (mul(sc, 1.1) if p.face == 'up' and (p.i + p.j) % 4 == 0 else sc), p))
    P(m, 'body', 'shell_top', -3.4, 3.4, 5.55, 6.4, -2.6, 2.6, lambda p: shade(sc, p))
    for sx in (-1, 1):
        x = sx * 1.4
        P(m, 'body', f'eyestalk{sx}', x - 0.3, x + 0.3, 5.6, 8.0, -3.4, -2.8, lambda p: shade(s2, p))
        P(m, 'body', f'eye{sx}', x - 0.55, x + 0.55, 7.8, 8.9, -3.65, -2.55, lambda p: C(m, '#16161c') if p.face != 'north' or p.j else C(m, 'white'))
    for k in range(6):
        sx = -1 if k < 3 else 1
        z = -1.8 + 1.8 * (k % 3)
        B = f'leg{k}'
        m.bone(B, 'body', (sx * 4.4, 3.4, z))
        lo, hi = sorted((sx * 4.4, sx * 8.4))
        P(m, B, f'{B}_a', lo, hi, 3.0, 3.8, z - 0.35, z + 0.35, lambda p: shade(s2, p), rot=(0, 0, sx * 30), pivot=(sx * 4.4, 3.4, z))
    for sx, side in ((-1, 'r'), (1, 'l')):
        B = f'claw_{side}'
        m.bone(B, 'body', (sx * 3.6, 4.4, -3.4))
        P(m, B, f'{B}_arm', sx * 3.6 - 0.5, sx * 3.6 + 0.5, 4.0, 4.9, -6.6, -3.2, lambda p: shade(sc, p), rot=(-30, sx * -20, 0), pivot=(sx * 3.6, 4.4, -3.4))
        P(m, B, f'{B}_pincer', sx * 3.6 - 1.3, sx * 3.6 + 1.3, 5.0, 7.6, -8.4, -6.4, lambda p: shade(mul(sc, 1.1) if p.j == 0 else sc, p), rot=(-30, sx * -20, 0),
          pivot=(sx * 3.6, 4.4, -3.4))
    return m
