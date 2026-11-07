"""The units' machines, each a body of our own at the people's scale (a person is 32 tall) and pixel size (1 texel per
unit, painted texel by texel and lit by the game, like the clothes): trucks, APCs, vans, a jeep and a motorcycle with its
rider, the Elf Camp's gift bomber, the Engineer's sentries, the ice turret and the Mecha Base's mechs.

The design language they share, so they read as one family: chunky toy proportions (wide wheels, short hoods, big
windows), hard edges lit on top and shaded under, panel seams and rivets where the real thing has them, glass that
catches a streak of light, lamps that light themselves, and a white star or the owner's mark on the doors.
Moving parts are bones the unit animations know (roster_entities): wheel_* turn, `turret` sweeps, `spinz` spins,
`prop` turns, rightLeg / leftLeg / rightArm / leftArm stride and swing.
"""
from __future__ import annotations

import math

from arms import Gun, flash, shade, solid
from hq_parts import octa
from kit import Model, hexc, mix, mul
from parts import lit, sample, spr

FULL = {f: 1.0 for f in ('north', 'south', 'east', 'west', 'up', 'down')}
SIDES = ('north', 'south', 'east', 'west')
PAL = dict(tyre='#22222a', rim='#9aa0aa', hub='#4a4e56', glass='#8ac8e8', lamp='#fff4c0', red='#c83838', blue='#3a6ad8', white='#eef0f2',
           black='#18181e', metal='#8a8e98', metal2='#4a4e56', gun='#4a4e57', gun2='#2a2c32', furn='#2a2c32', star='#eef0f2', gold='#e8b830',
           olive='#5e6a3e', olive2='#46502e', wood='#7a5232', wood2='#5a3a22', glow='#ffd650', flash='#fff0a0', yellow='#e8c838', strap='#3a3226')


def C(m, c):
    if isinstance(c, tuple):
        return c
    return m.mats[c] if c in m.mats else hexc(c)


def vehicle(name, mats=None):
    m = Model(name, density=1.0, width=256, materials={**PAL, **(mats or {})}, emissive=True)
    m.glow |= {'lamp', 'glow', 'flash'}
    m.decal = vdecal
    m.own = None
    m.bone('root', None, (0, 0, 0))
    return m


def vdecal(p):
    """a part's own painter ('pp'), or the shared decals (a muzzle flash's flame and star)"""
    if 'pp' in p.cube:
        return p.cube['pp'](p)
    from hq_parts import hq_decal
    r = hq_decal(p)
    return p.col if r is False else r


def P(m, bone, name, x0, x1, y0, y1, z0, z1, paint, rot=None, pivot=None, only=None, dens=None):
    c = m.box(bone, name, x0, x1, y0, y1, z0, z1, 'white', rot=rot, pivot=pivot, decal='tailor', dens=dens or FULL, raw=True, only=only)
    c['pp'] = paint
    return c


# ------------------------------------------------------------------------------------------------ painters
def paint(m, col, seams=None, rivets=False, star=None, edge=True):
    """a painted panel: the shade of its faces, seams every `seams` texels along it, rivets on its rim, an emblem"""
    cc = C(m, col)

    def pp(p):
        f = p.face
        if star and f in star[0]:
            u0, u1, v0, v1 = star[1]
            if u0 <= p.u <= u1 and v0 <= p.v <= v1:
                s = sample(spr('emblems', star[2]), (p.u - u0) / (u1 - u0), (p.v - v0) / (v1 - v0))
                if s[3]:
                    return C(m, 'star')
        if seams and f in SIDES and p.w > seams and p.i % seams == seams - 1:
            return mul(cc, 0.8)
        if rivets and f in SIDES and p.w >= 4 and p.h >= 3 and p.j == 1 and p.i % 3 == 1:
            return mul(cc, 1.25)
        return shade(cc, p) if edge else cc
    return pp


def glass(m, col='glass', frame=None):
    """glass: a frame round it, a streak of light across"""
    cc = C(m, col)
    fc = C(m, frame) if frame else None

    def pp(p):
        if fc and (p.i in (0, p.w - 1) or p.j in (0, p.h - 1)) and p.face in SIDES:
            return fc
        if (p.i + p.j) % 6 in (0, 1) and p.face in SIDES:
            return mix(cc, (255, 255, 255), 0.45)
        return mul(cc, 0.9) if p.face in ('up', 'down') else cc
    return pp


def lamp(m, col='lamp'):
    cc = C(m, col)
    return lambda p: lit(cc) if p.face in ('north', 'south') else mul(cc, 0.7)


def grille(m, col='black'):
    cc = C(m, col)
    return lambda p: mul(cc, 1.6) if p.face == 'north' and p.i % 2 == 1 and 0 < p.j < p.h - 1 else shade(cc, p)


FONT = {'S': ('111', '100', '111', '001', '111'), 'W': ('101', '101', '101', '111', '101'), 'A': ('010', '101', '111', '101', '101'),
        'T': ('111', '010', '010', '010', '010'), 'P': ('110', '101', '110', '100', '100'), 'O': ('111', '101', '101', '101', '111'),
        'L': ('100', '100', '100', '100', '111'), 'I': ('111', '010', '010', '010', '111'), 'C': ('111', '100', '100', '100', '111'),
        'E': ('111', '100', '110', '100', '111')}


def lettered(m, col, word, ink='white', row=0.5, faces=('east', 'west')):
    """a panel with a word across its sides in a 3x5 pixel letter, one texel per unit"""
    base = paint(m, col)
    ic = C(m, ink)
    n = len(word) * 4 - 1

    def pp(p):
        if p.face in faces:
            i = p.w - 1 - p.i if p.face == 'west' else p.i                    # read front to back on both sides
            i0 = (p.w - n) // 2
            j0 = int(p.h * row) - 2
            k, a = divmod(i - i0, 4)
            if 0 <= k < len(word) and a < 3 and 0 <= p.j - j0 < 5:
                if FONT[word[k]][p.j - j0][a] == '1':
                    return ic
        return base(p)
    return pp


# ------------------------------------------------------------------------------------------------ parts
def wheel(m, parent, name, x0, x1, cy, cz, r, rim='rim'):
    """a wheel turning on its own bone: an eight-sided tyre, its tread, the rim and hub on both sides"""
    B = name
    m.bone(B, parent, ((x0 + x1) / 2, cy, cz))
    tc, rc, hc = C(m, 'tyre'), C(m, rim), C(m, 'hub')

    def pp(p):
        q = p.inbone()
        if p.face in ('east', 'west'):
            d = math.hypot(q[1] - cy, q[2] - cz)
            if d < r * 0.28:
                return hc
            if d < r * 0.56:
                return mul(rc, 1.1) if q[1] > cy else rc
            if d < r * 0.66:
                return mul(tc, 0.7)
            return mul(tc, 1.15)
        a = math.atan2(q[1] - cy, q[2] - cz)
        return mul(tc, 0.7) if int((a + 4) * 8 / math.pi) % 2 == 0 else tc
    for c in octa(m, B, f'{B}_t', 'x', (cy, cz), x0, x1, r, 'white', decal='tailor', dens=FULL, raw=True):
        c['pp'] = pp
    return B


def axle_pair(m, z, cy, r, x_out, w, tag, parent='root'):
    for sx, side in ((-1, 'r'), (1, 'l')):
        lo, hi = sorted((sx * x_out, sx * (x_out - w)))
        wheel(m, parent, f'wheel_{tag}{side}', lo, hi, cy, z, r)


def mg(m, bone, x, y, z, s=1.0, mats=None):
    """a pintle machine gun on a ring: the body, a long barrel, a box of rounds, its flash"""
    g = Gun(m, bone, (x, y, z), s)
    P_ = dict(metal=solid(m, 'gun'), dark=solid(m, 'gun2'), box=solid(m, (mats or {}).get('box', 'olive2')))
    g.box('mgbody', -0.9, 0.9, -0.9, 1.0, -4.0, 2.0, P_['metal'])
    g.box('mgbar', -0.35, 0.35, -0.1, 0.6, -11.0, -3.9, P_['dark'])
    g.box('mgmz', -0.55, 0.55, -0.3, 0.8, -12.0, -10.9, P_['dark'])
    g.box('mgbox', 0.9, 2.4, -1.6, 0.6, -2.6, 0.6, P_['box'])
    g.box('mggrip', -0.35, 0.35, -2.4, -0.8, 1.2, 2.2, P_['dark'])
    fx, fy, fz = g.P((0, 0.25, -12.0))
    flash(m, bone, f'{bone}_flash', fx, fy, fz, 0.9 * s)


# ------------------------------------------------------------------------------------------------ trucks
def cab(m, col, col2, z0, z1, top=15.0, w=7.0, star=True, word=None):
    """a cab: its doors (a star on each), the windscreen and side windows, the roof"""
    st = (('east', 'west'), (0.25, 0.75, 0.45, 0.9), 'star') if star else None
    P(m, 'root', 'cab', -w, w, 4.6, top - 4.4, z0, z1, paint(m, col, star=st))
    P(m, 'root', 'cab_post', -w + 0.05, w - 0.05, top - 4.45, top, z0 + 0.6, z1 - 0.05, paint(m, col))
    P(m, 'root', 'windscreen', -w + 0.9, w - 0.9, top - 4.2, top - 0.6, z0 + 0.35, z0 + 0.65, glass(m, 'glass'))
    for sx in (-1, 1):
        lo, hi = sorted((sx * (w - 0.3), sx * (w + 0.05)))
        P(m, 'root', f'window{sx}', lo, hi, top - 4.0, top - 0.8, z0 + 1.6, z1 - 1.0, glass(m, 'glass'))
    P(m, 'root', 'roof', -w - 0.2, w + 0.2, top, top + 0.6, z0 + 0.3, z1 + 0.2, paint(m, col2))


def hood(m, col, col2, z0, z1, w=6.6, h=10.4, grille_col='black'):
    """the hood in front of the cab, its nose: a grille, two lamps, a bumper"""
    P(m, 'root', 'hood', -w, w, 4.6, h, z0, z1, paint(m, col, seams=None))
    m.slope('root', 'hood_top', -w + 0.2, w - 0.2, (z0 - 0.05, h - 0.6), (z1, h + 0.25), 0.9, 'white', decal='tailor', dens=FULL, raw=True)['pp'] = paint(m, col)
    P(m, 'root', 'grille', -w + 1.8, w - 1.8, 5.4, h - 1.2, z0 - 0.4, z0 + 0.05, grille(m, grille_col))
    for sx in (-1, 1):
        x = sx * (w - 0.95)
        P(m, 'root', f'lamp{sx}', x - 0.75, x + 0.75, h - 3.0, h - 1.5, z0 - 0.45, z0 + 0.05, lamp(m))
    P(m, 'root', 'bumper', -w - 0.6, w + 0.6, 3.6, 5.4, z0 - 1.3, z0 - 0.35, paint(m, 'black'))


def fender(m, x_out, z0, z1, y, col):
    for sx in (-1, 1):
        lo, hi = sorted((sx * (x_out - 2.6), sx * (x_out + 0.15)))
        P(m, 'root', f'fender{sx}_{int(z0)}', lo, hi, y, y + 0.7, z0, z1, paint(m, col))


def truck(n):
    """1: a light truck (cab, open bed), 2: a troop truck (a canvas cover on hoops), 3: an armoured truck (a gun on the roof)"""
    m = vehicle(f'u_truck{n}', dict(body='#5e6a3e', body2='#46502e', canvas='#6e6a48', canvas2='#545036', armor='#56603e'))
    P(m, 'root', 'frame', -4.0, 4.0, 3.0, 4.65, -16.8, 16.8 if n != 1 else 15.0, paint(m, 'black'))         # the chassis rails
    if n == 3:
        P(m, 'root', 'hull', -7.4, 7.4, 4.6, 13.6, -11.0, 16.0, paint(m, 'armor', seams=6, rivets=True,
                                                                         star=(('east', 'west'), (0.62, 0.86, 0.3, 0.75), 'star')))
        m.slope('root', 'glacis', -7.2, 7.2, (-17.6, 9.6), (-11.0, 13.6), 1.0, 'white', decal='tailor', dens=FULL, raw=True)['pp'] = paint(m, 'armor', rivets=True)
        P(m, 'root', 'nose', -7.0, 7.0, 4.6, 9.7, -17.0, -11.0, paint(m, 'armor', rivets=True))
        P(m, 'root', 'grille', -4.8, 4.8, 5.4, 8.8, -17.45, -16.95, grille(m))
        for sx in (-1, 1):
            P(m, 'root', f'lamp{sx}', sx * 5.9 - 0.7, sx * 5.9 + 0.7, 7.2, 8.6, -17.5, -16.95, lamp(m))
            lo, hi = sorted((sx * 7.35, sx * 7.65))
            P(m, 'root', f'slit{sx}', lo, hi, 10.6, 11.6, -9.0, -4.0, glass(m, '#4a7898'))
        P(m, 'root', 'visor', -5.4, 5.4, 10.8, 11.8, -12.6, -12.1, glass(m, '#4a7898'), rot=(-38, 0, 0), pivot=(0, 11.3, -12.3))
        P(m, 'root', 'bumper', -7.6, 7.6, 3.6, 5.4, -18.3, -17.4, paint(m, 'black'))
        m.bone('turret', 'root', (0, 13.6, 4.0))
        octa(m, 'turret', 'ring', 'y', (0, 4.0), 13.55, 14.6, 3.2, 'white', decal='tailor', dens=FULL, raw=True)
        for c in m.cubes[-4:]:
            c['pp'] = paint(m, 'body2')
        P(m, 'turret', 'post', -0.5, 0.5, 14.6, 17.0, 3.5, 4.5, paint(m, 'gun2'))
        P(m, 'turret', 'shield', -3.2, 3.2, 15.4, 19.6, 1.0, 1.5, paint(m, 'armor', rivets=True))
        mg(m, 'turret', 0, 17.6, 2.6, 1.0)
        axle_pair(m, -12.0, 3.8, 3.8, 7.6, 2.4, 'f')
        axle_pair(m, 4.6, 3.8, 3.8, 7.6, 2.4, 'm')
        axle_pair(m, 12.4, 3.8, 3.8, 7.6, 2.4, 'b')
        fender(m, 7.6, -15.6, -8.4, 8.0, 'armor')
        return m
    hood(m, 'body', 'body2', -17.0, -10.0)
    cab(m, 'body', 'body2', -10.0, -2.4)
    fender(m, 7.6, -16.2, -8.0, 8.0, 'body')
    zb = 16.0 if n == 2 else 14.6
    P(m, 'root', 'bed', -7.0, 7.0, 4.6, 6.2, -2.4, zb, paint(m, 'body2'))
    for sx in (-1, 1):
        lo, hi = sorted((sx * 7.0, sx * 6.3))
        P(m, 'root', f'side{sx}', lo, hi, 6.2, 9.6, -2.3, zb, paint(m, 'body', seams=4))
    P(m, 'root', 'tailgate', -6.3, 6.3, 6.2, 9.6, zb - 0.6, zb, paint(m, 'body', seams=4))
    for sx in (-1, 1):
        P(m, 'root', f'tail{sx}', sx * 5.6 - 0.6, sx * 5.6 + 0.6, 7.6, 8.6, zb, zb + 0.3, lamp(m, 'red'))
    if n == 2:                                                              # the canvas cover: hoops under a cloth
        cv = paint(m, 'canvas', seams=3)
        for sx in (-1, 1):
            lo, hi = sorted((sx * 6.95, sx * 6.35))
            P(m, 'root', f'canvas_side{sx}', lo, hi, 9.6, 14.0, -1.95, zb - 0.25, cv)
        m.rise_x('root', 'canvas_l', (-6.95, 14.0), (-3.6, 16.6), -2.0, zb - 0.2, 0.6, 'white', decal='tailor', dens=FULL, raw=True)['pp'] = cv
        m.rise_x('root', 'canvas_r', (3.6, 16.6), (6.95, 14.0), -2.02, zb - 0.18, 0.6, 'white', decal='tailor', dens=FULL, raw=True)['pp'] = cv
        P(m, 'root', 'canvas_top', -3.7, 3.7, 16.0, 16.6, -1.98, zb - 0.22, cv)
        P(m, 'root', 'canvas_back', -6.3, 6.3, 9.6, 16.0, zb - 0.9, zb - 0.6, paint(m, 'black'))
        axle_pair(m, -12.6, 3.5, 3.5, 7.6, 2.4, 'f')
        axle_pair(m, 5.0, 3.5, 3.5, 7.6, 2.4, 'm')
        axle_pair(m, 12.3, 3.5, 3.5, 7.6, 2.4, 'b')
    else:
        P(m, 'root', 'crate', -5.2, -0.6, 6.2, 9.4, 4.0, 8.6, paint(m, 'wood', seams=2))
        P(m, 'root', 'crate2', 0.4, 4.6, 6.2, 8.6, 9.4, 13.2, paint(m, 'wood2', seams=2))
        axle_pair(m, -12.6, 3.6, 3.6, 7.6, 2.4, 'f')
        axle_pair(m, 9.6, 3.6, 3.6, 7.6, 2.4, 'b')
    return m


# ------------------------------------------------------------------------------------------------ APCs
def apc(kind):
    """an eight-wheeled armoured carrier: a sloped nose, skirts over the wheels, hatches; a gun or a missile pod turning"""
    m = vehicle(f'u_apc_{kind}', dict(armor='#5a6648', armor2='#465236', trim='#e8b830'))
    A = paint(m, 'armor', seams=6, rivets=True, star=(('east', 'west'), (0.4, 0.6, 0.2, 0.62), 'chevron'))
    P(m, 'root', 'hull', -7.4, 7.4, 4.0, 12.6, -11.0, 14.0, A)
    m.slope('root', 'glacis', -7.2, 7.2, (-16.4, 8.0), (-11.0, 12.6), 1.2, 'white', decal='tailor', dens=FULL, raw=True)['pp'] = paint(m, 'armor', rivets=True)
    P(m, 'root', 'nose', -7.0, 7.0, 4.0, 8.2, -16.2, -11.0, paint(m, 'armor2'))
    for sx in (-1, 1):
        P(m, 'root', f'lamp{sx}', sx * 5.6 - 0.7, sx * 5.6 + 0.7, 6.6, 7.8, -16.6, -16.15, lamp(m))
        lo, hi = sorted((sx * 7.35, sx * 7.85))
        P(m, 'root', f'skirt{sx}', lo, hi, 5.0, 8.4, -14.0, 13.0, paint(m, 'armor2', rivets=True))
    P(m, 'root', 'driver', -2.0, 2.0, 12.55, 13.4, -10.0, -7.0, paint(m, 'armor2'))
    P(m, 'root', 'periscope', -1.2, 1.2, 12.4, 13.0, -11.2, -10.6, glass(m, '#4a7898'))
    P(m, 'root', 'hatch', 3.0, 6.0, 12.55, 13.1, 6.0, 10.0, paint(m, 'armor2', rivets=True))
    P(m, 'root', 'door', -3.0, 3.0, 5.0, 11.4, 14.0, 14.4, paint(m, 'armor2', rivets=True))
    for i, z in enumerate((-11.6, -4.0, 3.6, 10.5)):
        axle_pair(m, z, 3.4, 3.4, 7.3, 2.4, f'{i}')
    m.bone('turret', 'root', (0, 12.6, 1.0))
    T = paint(m, 'armor', rivets=True)
    P(m, 'turret', 'turret', -4.2, 4.2, 12.55, 15.8, -3.0, 5.0, T)
    m.slope('turret', 'turret_front', -4.0, 4.0, (-4.4, 13.4), (-3.0, 15.8), 1.0, 'white', decal='tailor', dens=FULL, raw=True)['pp'] = T
    if kind == 'gun':
        g = Gun(m, 'turret', (0, 14.4, -3.6), 1.0)
        g.box('mantlet', -1.4, 1.4, -1.2, 1.2, -1.4, 0.4, solid(m, 'armor2'))
        g.box('barrel', -0.5, 0.5, -0.45, 0.55, -13.0, -1.3, solid(m, 'gun'))
        g.box('brake', -0.8, 0.8, -0.75, 0.85, -14.4, -12.9, solid(m, 'gun2'))
        flash(m, 'turret', 'turret_flash', 0, 14.45, -18.0, 1.1)
        P(m, 'turret', 'sight', 2.0, 3.4, 15.8, 17.0, -1.8, 0.6, glass(m, '#4a7898', frame='gun2'))
    else:
        P(m, 'turret', 'pod', -3.8, 3.8, 15.75, 20.2, -3.2, 5.6, paint(m, 'armor2', rivets=True), rot=(8, 0, 0), pivot=(0, 15.8, 1.2))
        for i, (x, y) in enumerate(((-1.8, 17.0), (1.8, 17.0), (-1.8, 19.0), (1.8, 19.0))):
            P(m, 'turret', f'missile{i}', x - 0.75, x + 0.75, y - 0.75, y + 0.75, -3.75 - 0.02 * i, -3.0, solid(m, 'red'), rot=(8, 0, 0),
              pivot=(0, 15.8, 1.2))
        flash(m, 'turret', 'turret_flash', 0, 18.0, -4.6, 1.0)
    return m


# ------------------------------------------------------------------------------------------------ vans
def van(kind):
    """a police van: 'swat' (black, SWAT on its sides, a ram), 'gunner' (a gun on the roof), 'police' (white and blue)"""
    pal = {'swat': dict(body='#1e2430', body2='#2a3242', ink='#eef0f2'), 'gunner': dict(body='#1e2430', body2='#2a3242', ink='#eef0f2'),
           'police': dict(body='#e8ecf0', body2='#3a6ad8', ink='#1e3a8a')}[kind]
    m = vehicle(f'u_van_{kind}', pal)
    word = 'SWAT'                                     # the data's name for both: SWAT Van, Swat Van
    P(m, 'root', 'box', -7.4, 7.4, 4.0, 16.0, -8.0, 16.0, lettered(m, 'body', word, 'ink', row=0.45))
    P(m, 'root', 'cabin', -7.2, 7.2, 4.05, 11.0, -15.0, -7.9, paint(m, 'body'))
    m.slope('root', 'windscreen', -6.4, 6.4, (-15.0, 11.0), (-8.0, 16.0), 0.5, 'white', decal='tailor', dens=FULL, raw=True)['pp'] = glass(m, 'glass', 'body2')
    for sx in (-1, 1):
        lo, hi = sorted((sx * 7.15, sx * 7.45))
        P(m, 'root', f'window{sx}', lo, hi, 10.6, 14.4, -7.4, -2.0, glass(m, 'glass', 'body2'))
        P(m, 'root', f'lamp{sx}', sx * 5.4 - 0.8, sx * 5.4 + 0.8, 7.6, 9.0, -15.45, -14.95, lamp(m))
        P(m, 'root', f'tail{sx}', sx * 6.2 - 0.6, sx * 6.2 + 0.6, 6.4, 8.6, 16.0, 16.3, lamp(m, 'red'))
    P(m, 'root', 'stripe', -7.45, 7.45, 6.0, 7.0, -14.9, 15.9, solid(m, 'body2'))
    P(m, 'root', 'grille', -4.4, 4.4, 5.0, 7.6, -15.4, -14.95, grille(m))
    P(m, 'root', 'bumper', -7.6, 7.6, 3.4, 5.0, -16.0, -15.0, paint(m, 'black'))
    P(m, 'root', 'reardoor', -5.2, 5.2, 5.0, 15.0, 16.0, 16.25, paint(m, 'body', seams=6))
    if kind == 'swat':
        P(m, 'root', 'ram', -6.6, 6.6, 4.2, 8.4, -17.6, -16.0, paint(m, 'black', seams=2))
    bar = 'turret' if kind == 'gunner' else 'root'
    if kind == 'gunner':
        m.bone('turret', 'root', (0, 16.0, 4.0))
        octa(m, 'turret', 'ring', 'y', (0, 4.0), 15.95, 16.9, 3.0, 'white', decal='tailor', dens=FULL, raw=True)
        for c in m.cubes[-4:]:
            c['pp'] = paint(m, 'body2')
        P(m, 'turret', 'shield', -3.0, 3.0, 17.4, 21.0, 1.2, 1.7, paint(m, 'body', rivets=True))
        P(m, 'turret', 'post', -0.5, 0.5, 16.9, 19.0, 3.5, 4.5, paint(m, 'gun2'))
        mg(m, 'turret', 0, 19.6, 2.6, 1.0, dict(box='body2'))
    P(m, 'root', 'lightbar', -4.6, 4.6, 16.0, 16.6, -6.6, -5.0, paint(m, 'black'))
    P(m, 'root', 'light_r', -4.2, -0.3, 16.6, 17.6, -6.4, -5.2, lamp(m, 'red'))
    P(m, 'root', 'light_b', 0.3, 4.2, 16.6, 17.6, -6.4, -5.2, lamp(m, 'blue'))
    axle_pair(m, -10.6, 3.6, 3.6, 7.6, 2.4, 'f')
    axle_pair(m, 10.6, 3.6, 3.6, 7.6, 2.4, 'b')
    del bar
    return m


# ------------------------------------------------------------------------------------------------ the jeep
def jeep():
    """Trick or Threat Town's jeep: an open jeep in midnight purple with orange trim, a carved pumpkin on the hood, a gun
    on a post behind the seats"""
    m = vehicle('u_jeep', dict(body='#3a2a5a', body2='#2a1e44', trim='#e8842c', pumpkin='#e8842c'))
    P(m, 'root', 'tub', -7.0, 7.0, 4.0, 9.6, -6.0, 12.0, paint(m, 'body', star=(('east', 'west'), (0.35, 0.65, 0.25, 0.85), 'bomb')))
    P(m, 'root', 'stripe', -7.05, 7.05, 8.4, 9.0, -12.0, 12.05, solid(m, 'trim'))
    P(m, 'root', 'hood', -6.6, 6.6, 4.0, 9.4, -13.0, -6.0, paint(m, 'body'))
    P(m, 'root', 'grille', -4.6, 4.6, 5.0, 8.6, -13.45, -12.95, grille(m))
    for sx in (-1, 1):
        P(m, 'root', f'lamp{sx}', sx * 5.4 - 0.8, sx * 5.4 + 0.8, 6.6, 8.2, -13.5, -12.95, lamp(m))
        lo, hi = sorted((sx * 7.0, sx * 7.6))
        P(m, 'root', f'fender{sx}', lo, hi, 7.6, 8.4, -14.0, -7.8, paint(m, 'body2'))
    P(m, 'root', 'frame', -6.2, 6.2, 9.3, 13.6, -6.4, -6.0, glass(m, 'glass', 'body2'), rot=(-10, 0, 0), pivot=(0, 9.4, -6.2))
    P(m, 'root', 'seats', -5.6, 5.6, 9.5, 11.4, -2.0, 3.0, paint(m, 'black'))
    for sx in (-1, 1):
        P(m, 'root', f'rollbar{sx}', sx * 6.2 - 0.4, sx * 6.2 + 0.4, 9.5, 15.0, 4.6, 5.4, paint(m, 'trim'))
    P(m, 'root', 'rollbar', -6.66, 6.66, 14.6, 15.4, 4.55, 5.45, paint(m, 'trim'))
    P(m, 'root', 'bumper', -7.4, 7.4, 3.4, 4.8, -14.2, -13.0, paint(m, 'black'))
    P(m, 'root', 'spare_mount', -1.0, 1.0, 5.0, 8.9, 12.0, 12.4, paint(m, 'black'))
    m.bone('pumpkin', 'root', (0, 9.4, -9.6))
    pc = C(m, 'pumpkin')

    def pk(p):
        if p.face == 'north' and ((p.j == 1 and p.i in (1, 3)) or (p.j == 2 and 1 <= p.i <= 3)):
            return lit(C(m, 'glow'))
        return shade(mul(pc, 0.85) if p.i % 2 == 0 and p.face in SIDES else pc, p)
    P(m, 'pumpkin', 'pumpkin', -2.4, 2.4, 9.4, 12.6, -11.8, -7.4, pk)
    P(m, 'pumpkin', 'stem', -0.4, 0.4, 12.6, 13.6, -9.9, -9.1, solid(m, '#4a8a2a'))
    m.bone('turret', 'root', (0, 11.0, 8.6))
    P(m, 'turret', 'post', -0.5, 0.5, 9.6, 14.0, 8.1, 9.1, paint(m, 'gun2'))
    mg(m, 'turret', 0, 14.6, 8.0, 1.0, dict(box='body2'))
    axle_pair(m, -9.6, 3.8, 3.8, 7.6, 2.6, 'f')
    axle_pair(m, 8.4, 3.8, 3.8, 7.6, 2.6, 'b')
    return m


# ------------------------------------------------------------------------------------------------ the motorcycle (and its rider)
def motorcycle():
    """an army motorcycle and its rider: Steve (the player's body, referenced) in fatigues and a helmet, sitting on it -
    his legs to the pegs and his arms to the bars in the `ride` animation - over an olive bike: a tank, a seat, a fork,
    a lamp, an exhaust, two wheels turning"""
    import tailor as T
    m = T.person('u_motorcycle', 'steve', dict(a='#5e6a3e', b='#4e5634', d='#2a2420', k='#3a3226', e='#3a3e2a', **{k: v for k, v in PAL.items()}),
                 None, 'chevron', stand=False)
    T.jacket(m, 'a', open=False, zip_col='e', sleeves='long', cuff='b', pockets=True)
    T.trousers(m, 'b', 'cargo')
    T.boots(m, 'd', 'combat', lace='k')
    T.helmet(m, 'a', 'combat', band='k', goggles_col='#ffb040')
    T.gloves(m, 'k')
    bike = 'bike'
    m.bone(bike, 'root', (0, 0, 0))
    body, body2 = '#5e6a3e', '#46502e'
    B = lambda *a, **k: T.piece(m, bike, *a, **k)  # noqa: E731
    sh = lambda c: (lambda p: shade(T.C(m, c), p))  # noqa: E731
    B('tank', -2.0, 2.0, 10.6, 13.6, -10.0, -3.4, sh(body))
    B('seat', -2.2, 2.2, 9.2, 10.4, -3.6, 6.4, sh('#1e1e22'))
    B('engine', -2.1, 2.1, 4.4, 9.6, -7.4, -1.0, sh('#4a4e56'))
    B('frame', -1.0, 1.0, 6.0, 9.4, -1.2, 9.6, sh(body2))
    B('fender_b', -2.0, 2.0, 10.1, 10.7, 4.0, 13.4, sh(body))
    B('plate', -1.6, 1.6, 7.6, 10.0, 13.05, 13.45, sh('#eef0f2'))
    B('tail', -0.8, 0.8, 9.0, 9.8, 13.4, 13.7, lambda p: lit(T.C(m, 'red')))
    B('exhaust', -3.4, -2.4, 4.6, 5.8, -3.0, 10.6, sh('#8a8e98'))
    B('peg_r', -4.8, -1.0, 2.0, 2.6, -9.4, -8.4, sh('#2a2c32'))                    # under the boots' soles
    B('peg_l', 1.0, 4.8, 2.0, 2.6, -9.4, -8.4, sh('#2a2c32'))
    B('peg_bar', -1.0, 1.0, 2.0, 4.6, -9.3, -8.5, sh('#2a2c32'))
    T.piece(m, bike, 'fork_r', -2.2, -1.4, 4.0, 15.6, -13.4, -12.6, sh('#8a8e98'), rot=(-24, 0, 0), pivot=(0, 15.6, -11.0))
    T.piece(m, bike, 'fork_l', 1.4, 2.2, 4.0, 15.6, -13.4, -12.6, sh('#8a8e98'), rot=(-24, 0, 0), pivot=(0, 15.6, -11.0))
    B('head', -1.6, 1.6, 13.4, 16.0, -12.4, -10.2, sh(body))
    B('lamp', -1.2, 1.2, 14.0, 15.6, -12.9, -12.35, lambda p: lit(T.C(m, 'lamp')) if p.face == 'north' else shade(T.C(m, '#2a2c32'), p))
    B('bars', -5.6, 5.6, 16.6, 17.4, -10.4, -9.6, sh('#2a2c32'))
    B('grips_r', -6.4, -5.5, 16.5, 17.5, -10.5, -9.5, sh('#1e1e22'))
    B('grips_l', 5.5, 6.4, 16.5, 17.5, -10.5, -9.5, sh('#1e1e22'))
    B('fender_f', -1.8, 1.8, 10.1, 10.7, -19.4, -12.4, sh(body))
    wheel(m, bike, 'wheel_f', -1.4, 1.4, 5.0, -16.0, 5.0)
    wheel(m, bike, 'wheel_b', -1.6, 1.6, 5.0, 9.0, 5.0)
    from towerkit import finish
    finish(m)
    return m


# ------------------------------------------------------------------------------------------------ the gift bomber
def gift_bomber():
    """the Elf Camp's little plane: a red fuselage, candy-striped wings, a gold propeller turning, an elf at the stick,
    gifts slung under the wings"""
    m = vehicle('u_gift_bomber', dict(body='#c83838', body2='#8a2424', wing='#eef0f2', skin='#e0a878', hat='#2e8a3e'))
    m.bone('fly', 'root', (0, 12, 0))
    F = 'fly'
    P(m, F, 'fuselage', -2.6, 2.6, 9.6, 14.2, -9.0, 6.0, paint(m, 'body', seams=5))
    P(m, F, 'tailboom', -1.6, 1.6, 10.6, 13.6, 5.9, 13.0, paint(m, 'body'))
    P(m, F, 'cowl', -2.9, 2.9, 9.3, 14.5, -11.0, -8.9, paint(m, 'body2'))
    stripe = lambda p: shade(C(m, 'red') if (p.i // 2) % 2 == 0 else C(m, 'wing'), p)  # noqa: E731
    P(m, F, 'wing', -14.0, 14.0, 10.6, 11.4, -6.0, -0.6, stripe)
    P(m, F, 'tailwing', -5.4, 5.4, 12.4, 13.0, 10.4, 12.9, stripe)
    P(m, F, 'fin', -0.3, 0.3, 13.6, 17.0, 10.0, 13.0, paint(m, 'body'))
    P(m, F, 'screen', -2.0, 2.0, 14.2, 15.4, -5.0, -4.5, glass(m, 'glass'))
    m.bone('prop', F, (0, 11.9, -11.6))
    P(m, 'prop', 'hubcap', -0.8, 0.8, 11.1, 12.7, -12.4, -11.0, solid(m, 'gold'))
    P(m, 'prop', 'blade', -0.5, 0.5, 6.4, 17.4, -11.9, -11.5, solid(m, 'gold'))
    P(m, 'prop', 'blade2', -5.5, 5.5, 11.4, 12.4, -11.85, -11.55, solid(m, 'gold'))
    sk = C(m, 'skin')
    P(m, F, 'pilot', -1.8, 1.8, 14.2, 17.6, -3.6, 0.0, lambda p: (C(m, '#1e1e22') if p.face == 'north' and p.j == 1 and p.i in (0, 3) else shade(sk, p)))
    P(m, F, 'pilot_hat', -2.0, 2.0, 17.4, 18.6, -3.8, 0.2, paint(m, 'hat'))
    P(m, F, 'pilot_cone', -1.2, 1.2, 18.4, 21.0, -2.6, -0.6, paint(m, 'hat'), rot=(-30, 0, 0), pivot=(0, 18.4, -1.6))
    for sx in (-1, 1):
        x = sx * 8.0
        P(m, F, f'gift{sx}', x - 1.6, x + 1.6, 7.0, 10.2, -5.0, -1.6, lambda p, c=('#2e8a3e' if sx > 0 else '#3a6ad8'): (C(m, 'gold') if abs(p.i - (p.w - 1) / 2) < 0.6 else shade(C(m, c), p)))
        P(m, F, f'strut{sx}', x - 0.2, x + 0.2, 10.2, 10.65, -3.5, -3.1, solid(m, 'gun2'))
    return m


# ------------------------------------------------------------------------------------------------ the Engineer's sentries
def tripod(m, parent, cy, r=4.2, w=0.7, col='metal2'):
    for i in range(3):
        P(m, parent, f'leg{i}', -w / 2, w / 2, 0.0, cy + 0.6, -w / 2, w / 2, paint(m, col), rot=(-28, 120 * i + 60, 0), pivot=(0, cy, 0))
    octa(m, parent, 'hub', 'y', (0, 0), cy - 0.6, cy + 0.8, 1.2, 'white', decal='tailor', dens=FULL, raw=True)
    for c in m.cubes[-4:]:
        c['pp'] = paint(m, 'gun2')


def sentry(n):
    """0: a small sentry (one barrel, a red eye), 1: a rifle sentry (a long barrel, a scope), 2: a minigun sentry (six
    barrels spinning), 3: the war machine sentry (twin cannons on a tracked base)"""
    m = vehicle(f'u_sentry{n}', dict(body='#d8a838', body2='#8a6a24', eye='#ff4a3c', armor='#5a6648'))
    if n == 3:
        for sx in (-1, 1):
            lo, hi = sorted((sx * 3.0, sx * 6.2))
            P(m, 'root', f'tread{sx}', lo, hi, 0.0, 3.6, -7.0, 7.0, lambda p: mul(C(m, 'tyre'), 1.5) if p.i % 2 == 0 and p.face in SIDES else shade(C(m, 'tyre'), p))
        P(m, 'root', 'deck', -4.6, 4.6, 2.6, 5.6, -6.0, 6.0, paint(m, 'armor', rivets=True))
        cy = 5.6
    else:
        tripod(m, 'root', 6.4 if n < 2 else 7.0, w=0.7 if n < 2 else 0.9)
        cy = 6.4 if n < 2 else 7.0
    m.bone('turret', 'root', (0, cy + 0.6, 0))
    if n == 0:
        P(m, 'turret', 'body', -2.2, 2.2, cy + 0.6, cy + 4.0, -2.6, 2.6, paint(m, 'body', rivets=True))
        P(m, 'turret', 'barrel', -0.45, 0.45, cy + 1.8, cy + 2.7, -8.0, -2.5, solid(m, 'gun2'))
        P(m, 'turret', 'eye', -0.8, 0.8, cy + 3.0, cy + 3.8, -2.85, -2.55, lamp(m, 'eye'))
        P(m, 'turret', 'ammo', 2.2, 3.6, cy + 0.8, cy + 3.0, -1.4, 1.4, paint(m, 'armor'))
        flash(m, 'turret', 'turret_flash', 0, cy + 2.25, -8.0, 0.8)
    elif n == 1:
        P(m, 'turret', 'body', -2.0, 2.0, cy + 0.6, cy + 3.8, -3.6, 3.0, paint(m, 'body', rivets=True))
        P(m, 'turret', 'barrel', -0.4, 0.4, cy + 1.9, cy + 2.7, -13.0, -3.5, solid(m, 'gun2'))
        P(m, 'turret', 'muzzle', -0.65, 0.65, cy + 1.6, cy + 3.0, -14.2, -12.9, solid(m, 'gun2'))
        octa(m, 'turret', 'scope', 'z', (0, cy + 4.8), -4.2, 1.0, 0.8, 'white', decal='tailor', dens=FULL, raw=True)
        for c in m.cubes[-4:]:
            c['pp'] = solid(m, 'gun2')
        P(m, 'turret', 'lens', -0.5, 0.5, cy + 4.3, cy + 5.3, -4.45, -4.15, lamp(m, 'eye'))
        P(m, 'turret', 'ammo', -3.6, -2.0, cy + 0.8, cy + 3.2, -1.6, 1.6, paint(m, 'armor'))
        flash(m, 'turret', 'turret_flash', 0, cy + 2.3, -14.2, 0.9)
    elif n == 2:
        P(m, 'turret', 'body', -2.8, 2.8, cy + 0.6, cy + 5.0, -4.0, 3.0, paint(m, 'body', rivets=True))
        Z = 'spinz'
        m.bone(Z, 'turret', (0, cy + 2.8, -4.0))
        for i in range(6):
            a = math.radians(60 * i + 30)
            bx, by = 1.0 * math.cos(a), 1.0 * math.sin(a)
            P(m, Z, f'b{i}', bx - 0.32, bx + 0.32, cy + 2.8 + by - 0.32, cy + 2.8 + by + 0.32, -15.0 + 0.02 * i, -3.9, solid(m, 'gun'))
        octa(m, Z, 'clamp', 'z', (0, cy + 2.8), -13.4, -12.4, 1.6, 'white', decal='tailor', dens=FULL, raw=True)
        for c in m.cubes[-4:]:
            c['pp'] = solid(m, 'gun2')
        P(m, 'turret', 'ammo', 2.8, 5.2, cy + 0.8, cy + 4.0, -2.4, 1.8, paint(m, 'armor'))
        P(m, 'turret', 'eye', -0.8, 0.8, cy + 4.2, cy + 4.9, -4.3, -3.95, lamp(m, 'eye'))
        flash(m, 'turret', 'turret_flash', 0, cy + 2.8, -15.0, 1.0)
    else:
        P(m, 'turret', 'body', -3.8, 3.8, cy + 0.6, cy + 4.6, -4.0, 4.0, paint(m, 'armor', rivets=True))
        m.slope('turret', 'front', -3.6, 3.6, (-5.4, cy + 1.6), (-4.0, cy + 4.6), 1.0, 'white', decal='tailor', dens=FULL, raw=True)['pp'] = paint(m, 'armor')
        for sx in (-1, 1):
            x = sx * 2.0
            P(m, 'turret', f'cannon{sx}', x - 0.55, x + 0.55, cy + 2.2, cy + 3.3, -14.0, -4.0, solid(m, 'gun'))
            P(m, 'turret', f'brake{sx}', x - 0.8, x + 0.8, cy + 1.9, cy + 3.6, -15.2, -13.9, solid(m, 'gun2'))
        P(m, 'turret', 'eye', -0.8, 0.8, cy + 3.6, cy + 4.3, -5.55, -5.25, lamp(m, 'eye'))
        P(m, 'turret', 'stripe', -3.85, 3.85, cy + 3.2, cy + 3.8, -4.05, 4.05, lambda p: shade(C(m, 'yellow') if (p.i + p.j) % 4 < 2 else C(m, 'black'), p))
        flash(m, 'turret', 'turret_flash', 0, cy + 2.75, -15.2, 1.1)
    return m


def ice_turret():
    """the Elementalist's ice turret: a stone footing, a spire of ice, shards round it, a light inside"""
    m = vehicle('u_ice_turret', dict(stone='#8a9ab4', ice='#9ae4ff', ice2='#5ab4e8', ice3='#e0f8ff'))
    for c in octa(m, 'root', 'base', 'y', (0, 0), 0.0, 2.0, 5.0, 'white', decal='tailor', dens=FULL, raw=True):
        c['pp'] = paint(m, 'stone')
    ic, i2, i3 = C(m, 'ice'), C(m, 'ice2'), C(m, 'ice3')

    def crystal(p):
        q = p.inbone()
        k = (q[1] * 0.7 + (q[2] if p.face in ('east', 'west') else q[0]) * 1.3) % 3.0
        if k < 0.35:
            return lit(i3)
        return shade(i2 if k > 2.2 else ic, p)
    m.bone('turret', 'root', (0, 2.0, 0))
    P(m, 'turret', 'spire', -1.8, 1.8, 2.0, 12.0, -1.8, 1.8, crystal, rot=(0, 45, 0), pivot=(0, 2.0, 0))
    P(m, 'turret', 'tip', -1.3, 1.3, 11.0, 13.6, -1.3, 1.3, crystal, rot=(45, 0, 35.264), pivot=(0, 12.0, 0))
    for i in range(4):
        a = 90 * i + 45
        P(m, 'turret', f'shard{i}', -0.7, 0.7, 2.0, 7.0, 2.6, 4.0, crystal, rot=(18, a, 0), pivot=(0, 2.0, 0))
    return m


# ------------------------------------------------------------------------------------------------ the Mecha Base's mechs
MECH = {'xr600': dict(body='#8a96a6', body2='#5a6676', trim='#e8c838', scale=1.0, guns='gun', armor=False, pods=False),
        'xr600a': dict(body='#7a8696', body2='#4a5666', trim='#e8c838', scale=1.0, guns='gun', armor=True, pods=False),
        'xr700': dict(body='#8a96a6', body2='#5a6676', trim='#e87a2c', scale=1.05, guns='minigun', armor=False, pods=False),
        'xr900': dict(body='#6a7486', body2='#3a4456', trim='#3cc8e8', scale=1.15, guns='minigun', armor=True, pods=True),
        'xr901': dict(body='#3a3e48', body2='#26282e', trim='#ff4a3c', scale=1.25, guns='cannon', armor=True, pods=True)}


def mech(kind):
    """a walking mech: a cockpit on two jointed legs (rightLeg / leftLeg stride), a gun on each side (rightArm / leftArm);
    armour plates, shoulder pods and bigger guns as the line goes up"""
    d = MECH[kind]
    m = vehicle(f'u_mech_{kind}', dict(body=d['body'], body2=d['body2'], trim=d['trim'], glow=d['trim']))
    s = d['scale']
    S = lambda v: v * s  # noqa: E731
    hip = S(14.0)
    m.bone('body', 'root', (0, hip, 0))
    hz = lambda p: shade(C(m, 'trim') if (p.i + p.j) % 4 < 2 else C(m, 'black'), p)  # noqa: E731
    P(m, 'body', 'pelvis', S(-4.0), S(4.0), hip - S(1.6), hip + S(1.2), S(-2.6), S(2.6), paint(m, 'body2', rivets=True))
    P(m, 'body', 'cockpit', S(-5.4), S(5.4), hip + S(1.0), hip + S(9.6), S(-4.6), S(4.6), paint(m, 'body', seams=5, rivets=True))
    P(m, 'body', 'canopy', S(-3.4), S(3.4), hip + S(5.4), hip + S(8.6), S(-4.9), S(-4.5), glass(m, '#4a98c8', frame='body2'))
    P(m, 'body', 'visor', S(-2.6), S(2.6), hip + S(6.4), hip + S(7.0), S(-5.0), S(-4.85), lamp(m, 'trim'))
    P(m, 'body', 'hazard', S(-5.45), S(5.45), hip + S(1.6), hip + S(2.4), S(-4.65), S(4.65), hz)
    P(m, 'body', 'vent', S(-3.0), S(3.0), hip + S(9.55), hip + S(10.4), S(-1.0), S(3.6), paint(m, 'body2', seams=2))
    P(m, 'body', 'antenna', S(3.4), S(3.8), hip + S(9.6), hip + S(14.0), S(2.6), S(3.0), solid(m, 'gun2'))
    if d['armor']:
        P(m, 'body', 'plate', S(-4.6), S(4.6), hip + S(1.4), hip + S(5.0), S(-5.3), S(-4.55), paint(m, 'body2', rivets=True))
    for side, sx, leg in (('r', -1, 'rightLeg'), ('l', 1, 'leftLeg')):
        x = sx * S(2.8)
        m.bone(leg, 'body', (x, hip - S(0.4), 0))
        P(m, leg, f'thigh_{side}', x - S(1.15), x + S(1.15), hip - S(7.2), hip - S(0.2), S(-1.4), S(1.4), paint(m, 'body2'), rot=(-14, 0, 0), pivot=(x, hip - S(0.4), 0))
        P(m, leg, f'knee_{side}', x - S(1.5), x + S(1.5), hip - S(8.6), hip - S(6.4), S(-2.6), S(0.4), paint(m, 'body', rivets=True))
        P(m, leg, f'shin_{side}', x - S(1.3), x + S(1.3), S(1.2), hip - S(7.6), S(-1.2), S(1.6), paint(m, 'body'), rot=(10, 0, 0), pivot=(x, hip - S(7.6), S(-1.0)))
        P(m, leg, f'foot_{side}', x - S(2.0), x + S(2.0), 0.0, S(1.4), S(-3.8), S(2.6), paint(m, 'body2'))
        if d['armor']:
            lo, hi = sorted((x + sx * S(1.25), x + sx * S(1.75)))
            P(m, leg, f'shinplate_{side}', lo, hi, S(3.0), hip - S(8.8), S(-1.4), S(1.6), paint(m, 'trim'))
    for side, sx, arm in (('r', -1, 'rightArm'), ('l', 1, 'leftArm')):
        x = sx * S(6.4)
        y = hip + S(6.6)
        m.bone(arm, 'body', (x, y, 0))
        P(m, arm, f'shoulder_{side}', x - S(1.4), x + S(1.4), y - S(1.6), y + S(1.6), S(-2.0), S(2.0), paint(m, 'body2', rivets=True))
        g = Gun(m, arm, (x + sx * S(0.6), y - S(2.6), S(-1.0)), s)
        if d['guns'] == 'gun':
            g.box('gun', -1.1, 1.1, -1.2, 1.2, -6.4, 2.6, solid(m, 'body'))
            g.box('barrel', -0.45, 0.45, -0.4, 0.5, -11.0, -6.3, solid(m, 'gun2'))
            mz = -11.0
        elif d['guns'] == 'minigun':
            g.box('gun', -1.4, 1.4, -1.4, 1.4, -4.6, 2.6, solid(m, 'body'))
            Z = f'spinz_{side}'
            cx, cy, cz = g.P((0, 0, 0))
            m.bone(Z, arm, (cx, cy, cz))
            gz = Gun(m, Z, g.at, s)
            for i in range(6):
                a = math.radians(60 * i + 30)
                gz.box(f'b{i}', 0.85 * math.cos(a) - 0.28, 0.85 * math.cos(a) + 0.28, 0.85 * math.sin(a) - 0.28, 0.85 * math.sin(a) + 0.28,
                       -12.0 + 0.02 * i, -4.5, solid(m, 'gun'))
            mz = -12.0
        else:
            g.box('gun', -1.6, 1.6, -1.6, 1.6, -6.0, 2.6, solid(m, 'body2'))
            g.box('barrel', -0.8, 0.8, -0.7, 0.9, -14.0, -5.9, solid(m, 'gun'))
            g.box('brake', -1.1, 1.1, -1.0, 1.2, -15.6, -13.9, solid(m, 'gun2'))
            mz = -15.6
        g.box('stripe', -1.15 if d['guns'] != 'cannon' else -1.65, 1.15 if d['guns'] != 'cannon' else 1.65, 1.1 if d['guns'] != 'cannon' else 1.5,
              1.5 if d['guns'] != 'cannon' else 1.9, -3.0, 0.0, solid(m, 'trim'))
        fx, fy, fz = g.P((0, 0.0, mz))
        flash(m, arm, f'{arm}_flash', fx, fy, fz, 0.9 * s)
        if d['pods']:
            P(m, 'body', f'pod_{side}', x - S(1.6), x + S(1.6), hip + S(8.4), hip + S(11.4), S(-2.6), S(2.4), paint(m, 'body2', rivets=True))
            for k, (dx, dy) in enumerate(((-0.7, 0.7), (0.7, 0.7), (-0.7, -0.7), (0.7, -0.7))):
                P(m, 'body', f'rocket_{side}{k}', x + S(dx) - S(0.45), x + S(dx) + S(0.45), hip + S(9.9 + dy) - S(0.45), hip + S(9.9 + dy) + S(0.45),
                  S(-2.85) - 0.02 * k, S(-2.55), solid(m, 'red'))
    return m
