"""People for the towers and units: the player's body (Steve or Alex, referenced by geometry id and texture path) in
clothes of ours, made the way a skin's second layer is made, and designed piece by piece.

How the clothes are built, so nothing of ours hides inside something else or fights its face:
 - a garment over a body part is that part's box `inflate`d (kit.box): drawn bigger on every side while its texture keeps
   the part's own size, 1 texel per unit, so its pixels sit on the skin's pixel grid;
 - each kind of garment has its own layer (LAYER: how far it stands off the body), every pair a clear step apart, and
   the two legs / arms a hair apart from each other (they overlap at the body's middle);
 - a garment that would be covered entirely is not made (a shirt under a closed jacket has no sleeves);
 - what is added at a level sits on a layer of its own and leaves the base clothes in view (a plate carrier's sides
   are open, pauldrons sit on the shoulder);
 - textures are painted pixel by pixel like a skin (`raw`: no light baked in, the game lights them as it lights Steve):
   seams, hems, pockets, buttons, laces, stitches, a lighter top row and a shadowed hem, fabric grain kept quiet.
The face is never covered (head gear stops above the eyes, row 4 of the face), except by a mask a character is made of.

    person(name, 'steve'|'alex', disc=<role colour>, emblem=...) -> a gear model on the pedestal
    shirt / jacket / coat / robe / vest / trousers / boots / gloves / belt          the clothes
    cap / beret / helmet / hood / hat / beanie / headband / goggles / mask / headset / hair_tuft       on the head
    backpack / tank / cape / scarf / bandolier / pauldrons / kneepads / patch / quiver / holster        and the rest
"""
from __future__ import annotations

import math
import zlib

from hq_parts import octa, pedestal, pips
from kit import hexc, mix, mul
from kitbash import level, nb
from parts import lit
from rigs import RIGS

PED = dict(stone='#7e828c', ptrim='#5a5e68', disc='#4a78c8', gold='#e8b830', glow='#ffe080', flash='#fff0a0', gun='#5a5f6a', gun2='#2e3138', furn='#33363d',
           metal='#9aa0aa', metal2='#5a5f68', wood='#7a5232', wood2='#5a3a22', leather='#6a4426', black='#1e1e24', white='#eef0f2', red='#c83838',
           blue='#3a6ad8', green='#4ca83c', orange='#e8842c', ice='#9ad8f8', ice2='#5aa8d8', glass='#bfe8ff', gem='#7ad8ff', purple='#8a4ac8',
           yellow='#e8c838', bone='#e8e0c8', dark='#2a2630', paper='#e8dcb8', pouch='#7a6844', strap='#3a3226', brick='#9a5a46', bag='#b49a64')
LAYER = dict(shirt=0.5, sleeve=0.45, trousers=0.63, jacket=0.75, jsleeve=0.7, boot=0.88, glove=0.95, vest=1.0, belt=1.1, armor=1.2,
             strap=1.35, cap=0.75, hood=0.85, helmet=1.0, hat=0.6)
FULL = {f: 1.0 for f in ('north', 'south', 'east', 'west', 'up', 'down')}
SIDES = ('north', 'south', 'east', 'west')


def C(m, c):
    """a colour: a material name of the model, or '#rrggbb'"""
    if isinstance(c, tuple):
        return c
    return m.mats[c] if c in m.mats else hexc(c)


def hash01(*a):
    return (zlib.crc32('|'.join(str(x) for x in a).encode()) & 0xffff) / 0xffff


def grain(p, col, k=0.045):
    """cloth: a quiet grain, the light on the top row, the shadow on the hem, undersides darker (and a paintballer's
    splashes, by where the texel is)"""
    sp = getattr(p.model, 'splats', None)
    if sp and p.face in SIDES:
        q = p.inbone()
        for x, y, c in sp:
            if (q[0] - x) ** 2 + (q[1] - y) ** 2 < 1.1 + hash01(x, q[2]) * 0.6:
                return c
    r = hash01(p.cube['name'], p.face, p.i, p.j)
    f = 1.0 + (k if r > 0.84 else -k if r < 0.14 else 0.0)
    if p.face in SIDES:
        if p.j == 0:
            f += 0.06
        elif p.j == p.h - 1:
            f -= 0.1
    elif p.face == 'down':
        f -= 0.2
    return mul(col, f)


def outer(m, part):
    """the face of a limb that looks out (east: the low-x side, the right limbs)"""
    return 'east' if m.rig.parts[part][1][0] < 0 else 'west'


# ------------------------------------------------------------------------------------------------ the person
def person(name, body='steve', mats=None, disc=None, emblem='chevron'):
    from kit import Model
    rig = RIGS[body]
    pal = {**PED, **(mats or {})}
    if disc:
        pal['disc'] = disc
    m = Model(name, density=1.0, width=128, materials=pal, emissive=True)
    m.glow |= {'glow', 'flash'}
    for b in rig.bones:
        m.bone(b[0], b[1], b[2], rot=b[3] if len(b) > 3 else None)
    import copy
    m.rig = copy.copy(rig)
    m.rig.parts, m.rig.hands = dict(rig.parts), dict(rig.hands)
    from kitbash import THEMES
    m.emblem, m.own, m.wears, m.theme, m.th, m.splats = emblem, None, set(), 'plain', THEMES['plain'], []
    m.gun_at = (-1.6, 22.4, -5.6)                    # on the fists of the `hold` pose (entities.POSES), below the chin
    m.bone('tds_base', None, (0, 0, 0))
    pedestal(m, trim='ptrim')
    pips(m, 3.0, 12.35)
    from kitbash import paint as kpaint
    m.decal = lambda p, m=m: tailor_px(m, p) if p.cube['decal'] == 'tailor' else kpaint(m, p)
    return m


def tailor_px(m, p):
    return p.cube['pp'](p)


def wear(m, part, name, layer, paint, y0=None, y1=None, mat='white', box=None, bone=None, only=None):
    """a piece over a body part: its box (cut to y0..y1), `layer` bigger on every side, at the body's pixel size"""
    bn = bone or m.rig.parts[part][0]
    x0, x1, by0, by1, z0, z1 = box or m.rig.parts[part][1]
    c = m.box(bn, name, x0, x1, by0 if y0 is None else y0, by1 if y1 is None else y1, z0, z1, mat, decal='tailor', dens=FULL,
              inflate=layer, raw=True, only=only)
    c['pp'] = paint
    m.wears.add(name.split('_')[0])
    return c


def piece(m, bone, name, x0, x1, y0, y1, z0, z1, paint, mat='white', rot=None, pivot=None, only=None, dens=FULL):
    """a piece that stands on its own (a pocket, a buckle, a pauldron): an explicit box, painted pixel by pixel"""
    c = m.box(bone, name, x0, x1, y0, y1, z0, z1, mat, decal='tailor', dens=dens, raw=True, rot=rot, pivot=pivot, only=only)
    c['pp'] = paint
    return c


def arm_y(m, part='rarm'):
    return m.rig.parts[part][1][2]


# ------------------------------------------------------------------------------------------------ painters
def plain(m, col, hem=None, edge=None):
    col = C(m, col)
    hemc = C(m, hem) if hem else None

    def pp(p):
        if hemc and p.face in SIDES and p.j == p.h - 1:
            return mul(hemc, 0.95)
        return grain(p, col)
    return pp


def metal(m, col, rivets=True, trim=None):
    col = C(m, col)
    trimc = C(m, trim) if trim else None

    def pp(p):
        if p.face == 'down':
            return mul(col, 0.7)
        if trimc and p.face in SIDES and (p.j == 0 or p.j == p.h - 1):
            return trimc
        k = 1.16 if p.j == 0 or (p.face == 'up') else (0.82 if p.j == p.h - 1 else 1.0)
        if rivets and p.face in SIDES and p.h >= 3 and p.w >= 3 and p.j == 1 and p.i in (0, p.w - 1):
            return mul(col, 1.35)
        if p.face in SIDES and p.w >= 3 and p.i == 0:
            k *= 1.08
        return mul(col, k)
    return pp


# ------------------------------------------------------------------------------------------------ clothes
def shirt(m, col, sleeves='long', collar=None, buttons=None, neck='round', stripe=None):
    """a shirt or tunic: the torso, its sleeves (long: to the wrist, short, none), a collar, a button line, a neckline"""
    col_, coll = C(m, col), C(m, collar) if collar else None
    btn = C(m, buttons) if buttons else None
    stc = C(m, stripe) if stripe else None

    def torso(p):
        if p.face == 'north':
            if neck == 'round' and p.j == 0 and 2 <= p.i <= 5:
                return mul(col_, 0.72)                                        # the neckline's shadow
            if neck == 'v' and p.j <= 2 and abs(p.i - 3.5) <= 1.5 - p.j * 0.5:
                return mul(col_, 0.7)
            if coll and p.j <= 1 and p.i in (1, 2, 5, 6):
                return coll
            if btn and p.i == 3 and p.j % 3 == 2 and p.j < 11:
                return btn
            if btn and p.i == 4:
                return mul(col_, 0.88)
        if stc and p.face in SIDES and p.j in (5, 6):
            return stc
        return grain(p, col_)
    wear(m, 'body', 'shirt', LAYER['shirt'], torso)
    if sleeves in ('long', 'short'):
        for part in ('rarm', 'larm'):
            a0 = arm_y(m, part)
            y0 = a0 + (3 if sleeves == 'long' else 8)

            def sl(p, long=sleeves == 'long'):
                if p.face in SIDES and p.j == p.h - 1:
                    return mul(col_, 0.8)                                     # the cuff
                if stc and p.face in SIDES and p.j in (1, 2) and not long:
                    return stc
                return grain(p, col_)
            wear(m, part, f'shirt_{part}', LAYER['sleeve'] - (0.02 if part == 'larm' else 0.0), sl, y0=y0)


def jacket(m, col, lining=None, open=True, shirt_col=None, sleeves='long', bottom=10.5, pockets=True, zip_col=None, collar=True,
           cuff=None, trim=None):
    """a jacket over a shirt: open at the front (the shirt in the gap) or zipped, lapels or a stand collar, flap pockets,
    sleeves to the wrist (long), rolled to the elbow (rolled) or none (a sleeveless jacket), hip length (bottom: its hem)"""
    jc, lc = C(m, col), C(m, lining or mul(C(m, col), 0.7))
    zc = C(m, zip_col) if zip_col else None
    cc = C(m, cuff) if cuff else None
    tc = C(m, trim) if trim else None
    if open or shirt_col:
        shirt(m, shirt_col or '#d8d4c8', sleeves='none' if sleeves != 'none' else 'short', neck='round')

    def torso(p):
        f, i, j, h = p.face, p.i, p.j, p.h
        if f == 'north':
            if open and i in (3, 4) and j < h - 1:
                return None                                                    # the shirt shows through
            if open and collar and j <= 3 and i in (2, 5):
                return lc if j < 3 else mul(lc, 0.85)                         # the lapels, turned out
            if not open and zc and i in (3, 4):
                return zc if i == 4 else mul(jc, 0.85)
            if pockets and j in (h - 5, h - 4) and i in (0, 1, 6, 7):
                return mul(jc, 0.78) if j == h - 5 else mul(jc, 0.92)          # the flap, the pocket
        if tc and f in SIDES and j == h - 1:
            return tc
        if collar and j == 0 and f in ('east', 'west', 'south'):
            return mul(lc, 1.05)
        if f == 'up' and collar:
            return lc
        return grain(p, jc)
    wear(m, 'body', 'jacket', LAYER['jacket'], torso, y0=bottom)
    if sleeves == 'none':
        return
    for part in ('rarm', 'larm'):
        a0 = arm_y(m, part)
        y0 = a0 + (3 if sleeves == 'long' else 7)

        def sl(p, roll=sleeves == 'rolled'):
            if p.face in SIDES and p.j == p.h - 1:
                return cc or (mul(lc, 1.0) if roll else mul(jc, 0.78))         # a cuff, or the rolled lining
            if roll and p.face in SIDES and p.j == p.h - 2:
                return mul(lc, 1.1)
            return grain(p, jc)
        wear(m, part, f'jacket_{part}', LAYER['jsleeve'] - (0.02 if part == 'larm' else 0.0), sl, y0=y0)


def coat(m, col, lining=None, bottom=4.0, belt_col=None, shirt_col=None, sleeves='long', trim=None, buttons=None, split=True):
    """a long coat: a jacket and a skirt from the waist (bottom: its hem) round both legs, split at the front"""
    jacket(m, col, lining, open=bool(shirt_col), shirt_col=shirt_col, sleeves=sleeves, bottom=11.0, pockets=False, collar=True, trim=trim,
           zip_col=None)
    cc, lc = C(m, col), C(m, lining or mul(C(m, col), 0.7))
    tc = C(m, trim) if trim else None
    btn = C(m, buttons) if buttons else None

    def skirt(p):
        f, i, j, h = p.face, p.i, p.j, p.h
        if f == 'up':
            return None
        if f == 'north' and split and i in (3, 4):
            return None if j > 1 else mul(cc, 0.8)                             # the split in front, from the waist down
        if f == 'north' and btn and i in (2, 5) and j % 3 == 1 and j < 4:
            return btn
        if tc and f in SIDES and j == h - 1:
            return tc
        if f == 'down':
            return lc
        return grain(p, cc)
    wear(m, None, 'coat_skirt', LAYER['jacket'] + 0.05, skirt, bone=m.rig.parts['body'][0], box=(-4, 4, bottom, 11.5, -2, 2))
    if belt_col:
        belt(m, belt_col, buckle='gold')


def robe(m, col, trim=None, sleeves='bell', lining=None, sash=None):
    """a mage's robe to the ankles: the body, a skirt round both legs, bell sleeves (a wide cuff)"""
    rc, tc = C(m, col), C(m, trim or 'gold')
    lc = C(m, lining or mul(rc, 0.65))
    sc = C(m, sash) if sash else None

    def torso(p):
        f, i, j, h = p.face, p.i, p.j, p.h
        if f == 'north':
            if i in (3, 4) and j <= 3:
                return tc if j == 3 or i == (4 - j % 2) else mul(rc, 0.8)      # the neck's V, edged
            if i in (3, 4):
                return tc if i == 3 else mul(tc, 0.85)                         # the edge down the front
        if sc and f in SIDES and j in (h - 2, h - 1):
            return sc
        return grain(p, rc)
    wear(m, 'body', 'robe', LAYER['jacket'], torso, y0=11.0)

    def skirt(p):
        f, i, j, h = p.face, p.i, p.j, p.h
        if f == 'up':
            return None
        if f == 'down':
            return lc
        if f in SIDES and j >= h - 1:
            return tc
        if f == 'north' and i in (3, 4):
            return tc if i == 3 else mul(tc, 0.85)
        return grain(p, mul(rc, 0.96))
    wear(m, None, 'robe_skirt', LAYER['jacket'] + 0.05, skirt, bone=m.rig.parts['body'][0], box=(-4, 4, 1.0, 11.5, -2, 2))
    for part in ('rarm', 'larm'):
        a0 = arm_y(m, part)

        def sl(p):
            return tc if p.face in SIDES and p.j == p.h - 1 else grain(p, rc)
        wear(m, part, f'robe_{part}', LAYER['jsleeve'] - (0.02 if part == 'larm' else 0.0), sl, y0=a0 + 5)
        if sleeves == 'bell':
            def bell(p):
                if p.face == 'up':
                    return None
                if p.face == 'down':
                    return lc
                return tc if p.j == p.h - 1 else grain(p, rc)
            wear(m, part, f'bell_{part}', LAYER['jsleeve'] + 0.55 - (0.02 if part == 'larm' else 0.0), bell, y0=a0 + 2.5, y1=a0 + 5.5)


def vest(m, col, kind='tactical', trim=None, pouch_col=None):
    """over the jacket, its sides open so the jacket shows: tactical (a plate carrier with webbing and pouches), puffer,
    waistcoat (buttoned, a V at the neck), hivis (reflective bands), plate (armour)"""
    vc = C(m, col)
    tc = C(m, trim) if trim else None
    pc = C(m, pouch_col or mul(vc, 0.85))
    b = m.rig.parts['body'][0]
    L = LAYER['vest']
    x0, x1, z0, z1 = -3.6, 3.6, -2 - L, 2 + L
    y0, y1 = (12.4 if kind == 'waistcoat' else 13.6), 24.0 + L

    def panel(p, back=False):
        f, i, j, h, w = p.face, p.i, p.j, p.h, p.w
        if f in ('east', 'west'):
            return None
        if kind == 'tactical':
            if f in ('north', 'south') and j >= 3 and j % 2 == 1:
                return mul(vc, 0.82)                                          # the webbing rows
            if f in ('north', 'south') and j <= 1 and i in (0, w - 1):
                return mul(vc, 1.12)                                          # the shoulder straps
        elif kind == 'puffer':
            if f in ('north', 'south') and j % 3 == 2:
                return mul(vc, 0.8)
            if f == 'north' and i in (3,):
                return C(m, 'metal2')
        elif kind == 'waistcoat':
            if f == 'north':
                if j <= 3 and abs(i - 3) <= 2 - j * 0.6 + 0.5 and i in (3,):
                    return None
                if i == 3 and j % 3 == 1:
                    return tc or C(m, 'gold')
        elif kind == 'hivis':
            if f in ('north', 'south') and j in (h - 4, h - 3):
                return C(m, '#e8eef0')
            if f in ('north', 'south') and i in (1, w - 2) and j <= 4:
                return C(m, '#e8eef0')
        elif kind in ('plate', 'riot'):
            if f in ('north', 'south'):
                if tc and (j == 0 or i in (0, w - 1)):
                    return tc
                if j == 1 or (i == 1 and j < h - 1):
                    return mul(vc, 1.2)
                if kind == 'riot' and j in (h // 2,):
                    return mul(vc, 0.75)
        if f == 'down':
            return mul(vc, 0.6)
        if f == 'up':
            return mul(vc, 1.05)
        return grain(p, vc, 0.03)
    th = 0.5
    piece(m, b, 'vest_front', x0, x1, y0, y1, z0 - th, z0, panel)
    piece(m, b, 'vest_back', x0 + 0.05, x1 - 0.05, y0, y1, z1, z1 + th, lambda p: panel(p, True))
    if kind == 'tactical':
        for k, x in enumerate((-2.4, 0.0, 2.4)):
            piece(m, b, f'vest_pouch{k}', x - 1.0, x + 1.0, y0 + 0.6, y0 + 3.4, z0 - th - 0.9, z0 - th,
                  lambda p, pc=pc: (mul(pc, 0.75) if p.face in SIDES and p.j == 0 else grain(p, pc)) if p.face != 'up' else mul(pc, 1.1))


def trousers(m, col, kind='plain', y0=None, knee=None):
    """both legs (cargo: a side pocket; jeans: seams and a lighter knee; suit: a crease; shorts: above the knee)"""
    tc = C(m, col)
    kc = C(m, knee) if knee else None
    for part in ('rleg', 'lleg'):
        lo = (7.0 if kind == 'shorts' else 3.0) if y0 is None else y0
        side = outer(m, part)

        def pp(p, side=side):
            f, i, j, h = p.face, p.i, p.j, p.h
            if f == 'up':
                return mul(tc, 0.8)
            if kind == 'cargo' and f == side and h - 8 <= j <= h - 6 and 1 <= i <= 2:
                return mul(tc, 0.78) if j == h - 8 else mul(tc, 0.9)
            if kind == 'jeans' and f == side and i == 2:
                return mul(tc, 1.14)
            if kind == 'suit' and f == 'north' and i == 1:
                return mul(tc, 1.12)
            if kc and f == 'north' and h - 8 <= j <= h - 7:
                return kc
            if kind == 'jeans' and f == 'north' and j in (h - 8, h - 7):
                return mul(tc, 1.1)
            return grain(p, tc)
        wear(m, part, f'trousers_{part}', LAYER['trousers'] + (0.04 if part == 'lleg' else 0.0), pp, y0=lo)


def boots(m, col, kind='combat', sole='#2a2420', lace=None, top=4.0):
    """boots to `top` (cowboy: a heel and a stitched shaft; shoes: low), a sole under them, a toe cap at the front"""
    bc, sc = C(m, col), C(m, sole)
    lc = C(m, lace) if lace else mul(bc, 0.7)
    for part in ('rleg', 'lleg'):
        x0, x1, _, _, z0, z1 = m.rig.parts[part][1]
        g = LAYER['boot'] + (0.04 if part == 'lleg' else 0.0)

        def pp(p):
            f, i, j, h = p.face, p.i, p.j, p.h
            if f == 'up':
                return mul(bc, 0.75)
            if f == 'down':
                return sc
            if j == h - 1:
                return sc
            if kind == 'combat' and f == 'north' and j < h - 1 and i in (1, 2) and j % 2 == 0:
                return lc
            if kind == 'cowboy' and f in SIDES and j == 1:
                return mul(bc, 1.2)
            if j == 0:
                return mul(bc, 1.12)
            return grain(p, bc)
        wear(m, part, f'boot_{part}', g, pp, y0=0.0, y1=top if kind != 'shoes' else 2.3)
        cx = (x0 + x1) / 2
        piece(m, m.rig.parts[part][0], f'toe_{part}', cx - 1.6, cx + 1.6, -g + 0.06, 1.4 - g * 0.4, z0 - g - 0.7, z0 - g + 0.4,
              lambda p: sc if p.face == 'down' or p.j == p.h - 1 else grain(p, mul(bc, 1.05)))


def gloves(m, col, kind='glove', cuff=None):
    """over the hands: glove, fingerless (the knuckles bare), gauntlet (a flared cuff), boxing (round), mitten; `cuff`:
    the cuff's own colour"""
    gc = C(m, col)
    cc = C(m, cuff) if cuff else None
    for part in ('rarm', 'larm'):
        a0 = arm_y(m, part)
        top = a0 + (4.2 if kind == 'gauntlet' else 3.0)
        g = LAYER['glove'] + (0.03 if part == 'larm' else 0.0) + (0.35 if kind == 'boxing' else 0.0) - (0.12 if kind == 'gauntlet' else 0.0)

        def pp(p):
            f, j, h = p.face, p.j, p.h
            if kind == 'fingerless' and f in SIDES and j >= h - 1:
                return None
            if f == 'down':
                return mul(gc, 0.8)
            if cc and f in SIDES and j == 0:
                return cc
            if kind == 'gauntlet' and f in SIDES and j <= 1:
                return mul(gc, 1.18)
            if kind == 'boxing' and f in SIDES and j == 0:
                return C(m, 'white')
            return grain(p, gc)
        wear(m, part, f'glove_{part}', g, pp, y0=a0, y1=top)


def belt(m, col, buckle='gold', pouches=None, holster=None):
    """at the waist, over the trousers' top and the shirt's hem; a buckle in front, pouches at the sides"""
    bc, kc = C(m, col), C(m, buckle)
    b = m.rig.parts['body'][0]
    L = LAYER['belt']

    def pp(p):
        if p.face == 'up':
            return mul(bc, 0.85)
        return grain(p, bc, 0.03) if not (p.face in SIDES and p.j == 0) else mul(bc, 1.15)
    wear(m, 'body', 'belt', L, pp, y0=11.0, y1=12.6)
    piece(m, b, 'buckle', -1.0, 1.0, 11.0 - L - 0.05, 12.6 + L + 0.05, -2 - L - 0.35, -2 - L,
          lambda p: mul(kc, 0.6) if p.face == 'north' and p.i == 1 and 0 < p.j < p.h - 1 else (mul(kc, 1.2) if p.j == 0 else kc), dens=2.0)
    if pouches:
        pc = C(m, pouches)
        for sx in (-1, 1):
            x = sx * 3.3
            piece(m, b, f'pouch{sx}', x - 1.0, x + 1.0, 9.0, 12.2, -2 - L - 0.9, -2 - L + 0.2,
                  lambda p, pc=pc: mul(pc, 0.75) if p.face in SIDES and p.j == 0 else grain(p, pc))


# ------------------------------------------------------------------------------------------------ on the head
def head_box(m):
    return m.rig.parts['head'][1]


def cap(m, col, visor=None, front=None, back=False, logo=None):
    """a peaked cap: the crown over the head down to the brow, a stiff visor in front (behind with back=True), a button"""
    cc, vc = C(m, col), C(m, visor or col)
    fc = C(m, front) if front else None
    lc = C(m, logo) if logo else None
    hb = m.rig.parts['head'][0]

    def crown(p):
        f, i, j = p.face, p.i, p.j
        if f == 'down':
            return None
        if f == ('south' if back else 'north'):
            if lc and 2 <= i <= 5 and 0 <= j <= 1:
                return lc
            if fc:
                return grain(p, fc)
        if f in SIDES and j == p.h - 1:
            return mul(cc, 0.85)
        return grain(p, cc)
    wear(m, 'head', 'cap', LAYER['cap'], crown, y0=29.0)
    piece(m, hb, 'cap_top', -3.75, 3.75, 32 + LAYER['cap'] - 0.05, 32 + LAYER['cap'] + 0.5, -3.75, 3.75,
          lambda p: None if p.face == 'down' else ((mul(cc, 0.75) if p.i in (3, 4) and p.j in (3, 4) else mul(cc, 1.05)) if p.face == 'up'
                                                   else grain(p, cc, 0.03)))
    zv = 4 + LAYER['cap'] if back else -4 - LAYER['cap']
    z0, z1 = (zv, zv + 3.4) if back else (zv - 3.4, zv)
    piece(m, hb, 'cap_visor', -3.6, 3.6, 28.5, 29.0, z0, z1, lambda p: mul(vc, 0.7) if p.face == 'down' else grain(p, vc),
          rot=(-6 if not back else 6, 0, 0), pivot=(0, 28.75, zv))


def beret(m, col, badge='gold'):
    cc, bc = C(m, col), C(m, badge)
    hb = m.rig.parts['head'][0]
    B = nb(m, 'beret')
    m.bone(B, hb, (0, 32, 0), rot=(0, 0, 9))

    def pp(p):
        if p.face == 'north' and 1 <= p.i <= 2 and 1 <= p.j <= 2:
            return bc
        if p.face == 'down':
            return mul(cc, 0.7)
        return grain(p, cc)
    piece(m, B, 'beret', -4.6, 5.4, 30.6, 33.3, -4.9, 4.7, pp)
    piece(m, B, 'beret_band', -4.95, 4.95, 30.0, 31.0, -4.95, 4.95, lambda p: mul(cc, 0.8) if p.face != 'up' else None)


def helmet(m, col, kind='combat', band=None, visor=None, goggles_col=None, crest=None, nvg=False, raised=False):
    """a helmet over the head down to the brow, rounded: its shell, a dome a step in on top, the rim a shade darker at the
    brow. combat (a strap beside each cheek), riot (a visor plate, up on it with raised=True), knight (cheek guards and a
    nose bar, the eyes free), hard (a hard hat: a brim all round, a ridge over the top), pilot (ear cups)"""
    hc = C(m, col)
    bc = C(m, band) if band else mul(hc, 0.78)
    hb = m.rig.parts['head'][0]
    if kind == 'hard':
        return hardhat(m, col, band)
    L = 0.85

    def shell(p):
        f, j, h = p.face, p.j, p.h
        if f == 'down':
            return None
        if f in SIDES and j == h - 1:
            return bc                                                          # the rim at the brow
        if f == 'up':
            return mul(hc, 1.06)
        if f in SIDES and j == 0:
            return mul(hc, 1.08)
        if kind == 'combat' and f in SIDES and hash01('camo', p.i // 2, j // 2, f) > 0.8:
            return mul(hc, 0.86)                                               # the cover's mottle
        return grain(p, hc, 0.03)
    wear(m, 'head', 'helmet', L, shell, y0=29.0)
    piece(m, hb, 'helmet_dome', -3.85, 3.85, 32 + L - 0.05, 32 + L + 0.75, -3.85, 3.85,
          lambda p: None if p.face == 'down' else (mul(hc, 1.12) if p.face == 'up' else grain(p, mul(hc, 1.04), 0.03)))
    if kind in ('combat', 'pilot', 'knight'):
        for sx in (-1, 1):                                                     # straps / cheek guards beside the face
            x = sx * (4 + L)
            w = 2.4 if kind == 'knight' else 0.0
            lo, hi = sorted((x, x + sx * 0.4))
            piece(m, hb, f'helmet_cheek{sx}', lo, hi, 24.6 if kind == 'knight' else 25.2, 28.0 - L + 0.01, -4 - L + 0.3, -4 - L + 0.3 + max(1.0, w),
                  lambda p: grain(p, bc if kind != 'knight' else hc))
    if kind == 'knight' and (not visor or raised):
        piece(m, hb, 'helmet_nose', -0.5, 0.5, 25.6, 28.2, -4 - L - 0.45, -4 - L + 0.05, lambda p: grain(p, bc) if p.face != 'up' else mul(bc, 1.2))
    if kind == 'pilot':
        for sx in (-1, 1):
            x = sx * (4 + L)
            lo, hi = sorted((x, x + sx * 0.8))
            piece(m, hb, f'helmet_ear{sx}', lo, hi, 25.6, 28.6, -1.6, 1.6, lambda p: grain(p, mul(bc, 0.9)))
    if visor:
        vc = C(m, visor)
        y0v = 29.3 if raised else 27.2                                         # raised: up on the helmet, the eyes free
        piece(m, hb, 'helmet_visor', -4 - L + 0.3, 4 + L - 0.3, y0v, y0v + 2.4, -4 - L - 0.45, -4 - L - 0.05,
              lambda p: (lit(vc) if 0 < p.j < p.h - 1 and 0 < p.i < p.w - 1 else mul(vc, 0.6)) if p.face == 'north' else mul(vc, 0.5))
    if goggles_col:
        goggles(m, '#3a3226', goggles_col, where='helmet')
    if crest:
        rc = C(m, crest)
        piece(m, hb, 'helmet_crest', -0.6, 0.6, 32 + L + 0.7, 32 + L + 2.9, -3.6, 4.2, lambda p: grain(p, rc) if p.face != 'down' else None)
    if nvg:
        piece(m, hb, 'nvg_mount', -1.0, 1.0, 29.4, 31.0, -4 - L - 0.8, -4 - L, lambda p: grain(p, C(m, 'gun2')))
        for sx in (-1, 1):
            piece(m, hb, f'nvg{sx}', sx * 1.4 - 0.7, sx * 1.4 + 0.7, 29.6, 31.0, -4 - L - 2.6, -4 - L - 0.8,
                  lambda p: lit(C(m, '#7cff8c')) if p.face == 'north' else grain(p, C(m, 'gun')))


def hardhat(m, col, band=None):
    """a hard hat: a shell set high, a dome on it with a ridge over the top, a brim all round wider at the front"""
    hc = C(m, col)
    bc = C(m, band) if band else mul(hc, 0.82)
    hb = m.rig.parts['head'][0]
    L = 0.9
    wear(m, 'head', 'hardhat', L, lambda p: None if p.face == 'down' else (mul(hc, 1.08) if p.face == 'up' else
                                                                          (mul(hc, 1.1) if p.j == 0 else grain(p, hc, 0.03))), y0=29.6)
    piece(m, hb, 'hardhat_dome', -3.9, 3.9, 32 + L - 0.05, 32 + L + 0.7, -3.9, 3.9,
          lambda p: None if p.face == 'down' else (mul(hc, 1.14) if p.face == 'up' else grain(p, mul(hc, 1.05), 0.03)))
    piece(m, hb, 'hardhat_ridge', -0.6, 0.6, 32 + L + 0.65, 32 + L + 1.2, -3.6, 3.6, lambda p: None if p.face == 'down' else mul(hc, 1.18))
    piece(m, hb, 'hardhat_brim', -4 - L - 0.9, 4 + L + 0.9, 28.95, 29.6, -4 - L - 2.0, 4 + L + 0.7,
          lambda p: mul(bc, 0.8) if p.face == 'down' else (mul(bc, 1.1) if p.face == 'up' else bc))


def hood(m, col, lining=None, drape=True):
    """a hood over the head, the face in its opening (a rim of lining), falling onto the shoulders behind"""
    hc, lc = C(m, col), C(m, lining or mul(C(m, col), 0.55))
    b = m.rig.parts['body'][0]

    def pp(p):
        f, i, j, h, w = p.face, p.i, p.j, p.h, p.w
        if f == 'down':
            return None
        if f == 'north':
            if 1 <= i <= w - 2 and j >= 2:
                return None                                                    # the face
            if i in (1, w - 2) or j == 1:
                return lc
        if f == 'up' and j == 0:
            return mul(hc, 0.9)
        return grain(p, hc)
    wear(m, 'head', 'hood', LAYER['hood'], pp, y0=24.0)
    if drape:
        piece(m, b, 'hood_fall', -3.4, 3.4, 19.5, 24.6, 2.8, 3.6, lambda p: grain(p, hc) if p.face != 'down' else mul(hc, 0.7))


def hat(m, col, band=None, kind='fedora', brim=2.2):
    """a hat on the head: fedora (a pinched crown), cowboy (the brim's sides turned up), top (tall), bush (soft, wide),
    wizard (a cone, bent at the tip), bucket"""
    hc = C(m, col)
    bc = C(m, band) if band else mul(hc, 0.6)
    hb = m.rig.parts['head'][0]
    B = nb(m, 'headwear')                                                     # not 'hat': the player's own overlay bone
    m.bone(B, hb, (0, 30, 0))
    rc = 4.65
    tall = {'fedora': 3.4, 'cowboy': 3.6, 'top': 7.0, 'bush': 2.8, 'wizard': 2.0, 'bucket': 3.0}[kind]
    yb = 29.6                                                                  # the hat sits on the brow line
    piece(m, B, 'hat_crown', -rc, rc, yb, 32 + tall - 1.4, -rc, rc,
          lambda p: None if p.face == 'down' else ((bc if p.j >= p.h - 2 else grain(p, hc)) if p.face in SIDES else
                                                     (mul(hc, 0.85) if kind == 'fedora' and p.i in (4, 5) else grain(p, hc))))
    w = rc + brim
    if kind in ('cowboy',):
        piece(m, B, 'hat_brim', -rc - 0.6, rc + 0.6, yb - 0.4, yb + 0.1, -w, w, lambda p: grain(p, mul(hc, 0.95)))
        for sx in (-1, 1):
            x0 = sx * (rc + 0.6)
            lo, hi = sorted((x0, x0 + sx * (brim + 0.6)))
            piece(m, B, f'hat_curl{sx}', lo, hi, yb - 0.4, yb + 0.1, -w + 0.3, w - 0.3, lambda p: grain(p, mul(hc, 0.95)),
                  rot=(0, 0, sx * -28), pivot=(x0, yb - 0.15, 0))
    elif kind == 'wizard':
        piece(m, B, 'hat_brim', -w, w, yb - 0.4, yb + 0.1, -w, w, lambda p: grain(p, mul(hc, 0.95)))
        y = 32 + tall - 1.4
        for k, (r, hgt) in enumerate(((3.4, 3.0), (2.4, 2.8), (1.5, 2.6))):
            piece(m, B, f'hat_cone{k}', -r + 0.3 * k, r + 0.3 * k, y, y + hgt, -r - 0.2 * k, r - 0.2 * k,
                  lambda p, k=k: None if p.face == 'down' else grain(p, mul(hc, 1.0 - 0.04 * k)), rot=(-8 * k, 0, 6 * k), pivot=(0, y, 0))
            y += hgt - 0.3
    else:
        piece(m, B, 'hat_brim', -w, w, yb - 0.4, yb + 0.1, -w, w,
              lambda p: grain(p, mul(hc, 0.95)) if p.face != 'down' else mul(hc, 0.7))


def beanie(m, col, fold=None, pom=None):
    cc, fc = C(m, col), C(m, fold or col)
    hb = m.rig.parts['head'][0]

    def pp(p):
        if p.face == 'down':
            return None
        if p.face in SIDES and p.i % 2 == 0:
            return mul(cc, 0.9)                                                # the rib knit
        return grain(p, cc)
    wear(m, 'head', 'beanie', LAYER['cap'], pp, y0=29.0, y1=33.0)
    wear(m, 'head', 'beanie_fold', LAYER['cap'] + 0.3, lambda p: None if p.face in ('up', 'down') else (mul(fc, 0.9) if p.i % 2 else fc),
         y0=29.4, y1=30.4)
    if pom:
        pc = C(m, pom)
        piece(m, hb, 'beanie_pom', -1.0, 1.0, 33.0 + LAYER['cap'] - 0.1, 35.0, -1.0, 1.0, lambda p: grain(p, pc, 0.08))


def headband(m, col, tails=False):
    cc = C(m, col)
    hb = m.rig.parts['head'][0]
    wear(m, 'head', 'headband', LAYER['cap'] + 0.1, lambda p: None if p.face in ('up', 'down') else grain(p, cc), y0=29.0, y1=30.0)
    if tails:
        for k, (dx, dr) in enumerate(((-0.6, -16), (0.6, 14))):
            piece(m, hb, f'headband_tail{k}', dx - 0.4, dx + 0.4, 26.0, 29.6, 4.9 + 0.05 * k, 4.9 + 0.05 * k, lambda p: grain(p, cc),
                  rot=(25, 0, dr), pivot=(dx, 29.6, 4.9), only=('north', 'south'))


def goggles(m, strap, lens, where='forehead'):
    """goggles: up on the forehead / on a helmet (the face free), or over the eyes"""
    sc, lc = C(m, strap), C(m, lens)
    hb = m.rig.parts['head'][0]
    L = LAYER['helmet'] + 0.15 if where == 'helmet' else LAYER['cap'] + 0.15
    y = 30.0 if where in ('forehead', 'helmet') else 27.0
    wear(m, 'head', 'goggle_strap', L, lambda p: None if p.face in ('up', 'down') else grain(p, sc), y0=y, y1=y + 1.0)
    for sx in (-1, 1):
        x = sx * 1.9
        piece(m, hb, f'goggle{sx}', x - 1.4, x + 1.4, y - 0.7, y + 1.7, -4 - L - 0.8, -4 - L + 0.1,
              lambda p: (lit(mul(lc, 1.1)) if 0 < p.i < p.w - 1 and 0 < p.j < p.h - 1 else mul(sc, 1.2)) if p.face == 'north' else grain(p, sc))


def mask(m, col, kind='bandana', filt=None):
    """over the lower face only (row 5 down: the eyes free): bandana (a knot behind), gas (a mask and a filter), surgical"""
    cc = C(m, col)
    hb = m.rig.parts['head'][0]
    L = LAYER['cap'] + 0.05

    def pp(p):
        if p.face in ('up', 'down'):
            return None
        if kind == 'bandana' and p.face == 'north' and p.j == p.h - 1 and p.i in (3, 4):
            return mul(cc, 0.8)
        return grain(p, cc)
    wear(m, 'head', 'mask', L, pp, y0=24.0, y1=26.2)                          # up to the nose: the eyes (row 4) free
    if kind == 'gas':
        fc = C(m, filt or 'metal2')
        piece(m, hb, 'mask_snout', -1.6, 1.6, 24.0, 26.8, -4 - L - 1.4, -4 - L, lambda p: grain(p, mul(cc, 0.9)))
        octa(m, hb, nb(m, 'mask_filter'), 'z', (0, 25.1), -4 - L - 3.0, -4 - L - 1.3, 1.25, 'metal2', decal='metal')


def head_top(m):
    """the top of what the head wears so far (32: bare)"""
    hb = m.rig.parts['head'][0]
    tops = [c['o'][1] + c['s'][1] + c.get('inflate', 0.0) for c in m.cubes if c['bone'] == hb and not c['rot']]
    return max([32.0] + tops)


def headset(m, col='gun2', mic=True):
    """ear cups on a band over whatever the head wears; a boom mic to the mouth"""
    hb = m.rig.parts['head'][0]
    cc = C(m, col)
    L = LAYER['cap']
    yt = head_top(m) + 0.02
    piece(m, hb, 'headset_cup', -4 - L - 0.9, -4 - L + 0.1, 26.2, 28.8, -1.3, 1.3, lambda p: grain(p, cc))
    piece(m, hb, 'headset_band', -4 - L - 0.5, 4 + L + 0.5, yt, yt + 0.5, -0.5, 0.5, lambda p: grain(p, cc))
    piece(m, hb, 'headset_arm', -4 - L - 0.46, -4 - L - 0.04, 28.8, yt + 0.2, -0.42, 0.42, lambda p: grain(p, cc))
    piece(m, hb, 'headset_arm2', 4 + L + 0.04, 4 + L + 0.46, 26.2, yt + 0.2, -0.42, 0.42, lambda p: grain(p, cc))
    if mic:
        piece(m, hb, 'headset_mic', -4 - L - 0.62, -4 - L - 0.22, 25.0, 25.4, -4.6, -1.0, lambda p: grain(p, cc))


def crown(m, col='gold', gem='red'):
    gc, rc = C(m, col), C(m, gem)
    hb = m.rig.parts['head'][0]
    L = LAYER['helmet'] + 0.2

    def pp(p):
        f, i, j = p.face, p.i, p.j
        if f in ('down', 'up'):
            return None
        if j == 0 and i % 2 == 1:
            return None                                                        # the points
        if j == 1 and i in (3, 4) and f == 'north':
            return lit(rc)
        return mul(gc, 1.15) if j == 0 else gc
    wear(m, 'head', 'crown', L, pp, y0=31.0, y1=33.5)


# ------------------------------------------------------------------------------------------------ the rest
def backpack(m, col, kind='pack', trim=None):
    """on the back: a pack (a flap, a roll on top), a tank (two cylinders, a hose), a radio (an aerial)"""
    bc = C(m, col)
    tc = C(m, trim or mul(bc, 0.75))
    b = m.rig.parts['body'][0]
    z0 = 2 + LAYER['vest'] + 0.55
    if kind == 'pack':
        piece(m, b, 'pack', -3.46, 3.46, 13.6, 21.4, z0, z0 + 3.0, lambda p: (tc if p.face == 'south' and p.j in (2, 3) else grain(p, bc)))
        piece(m, b, 'pack_roll', -3.8, 3.8, 21.4, 23.2, z0 + 0.2, z0 + 2.2, lambda p: grain(p, tc))
    elif kind == 'tank':
        for sx in (-1, 1):
            octa(m, b, nb(m, f'tank{sx}'), 'y', (sx * 1.7, z0 + 1.6), 13.6, 22.6, 1.55, 'metal', decal='metal')
        piece(m, b, 'tank_strap', -3.6, 3.6, 17.0, 17.9, z0 - 0.05, z0 + 3.3, lambda p: grain(p, tc))
    elif kind == 'radio':
        piece(m, b, 'radio', -3.0, 3.0, 14.0, 21.0, z0, z0 + 2.6, lambda p: (lit(C(m, '#7cff8c')) if p.face == 'south' and p.j == 1 and p.i in (1, 2)
                                                                             else grain(p, bc)))
        piece(m, b, 'radio_aerial', 2.2, 2.6, 21.0, 30.0, z0 + 1.0, z0 + 1.4, lambda p: grain(p, C(m, 'gun2')))


def cape(m, col, lining=None, trim=None, length=16):
    """from the shoulders, behind; it moves (idle: the bone `cape`)"""
    cc, lc = C(m, col), C(m, lining or mul(C(m, col), 0.6))
    tc = C(m, trim) if trim else None
    b = m.rig.parts['body'][0]
    z = 2 + LAYER['vest'] + 0.4
    B = nb(m, 'cape')
    m.bone(B, b, (0, 24.3, z))
    piece(m, B, 'cape', -5.0, 5.0, 24.3 - length, 24.3, z, z, lambda p: (tc if tc and p.j >= p.h - 1 else
                                                                          (grain(p, cc) if p.face == 'south' else grain(p, lc))), only=('north', 'south'))
    piece(m, B, 'cape_collar', -4.4, 4.4, 23.6, 25.12, z - 0.66, z + 0.26, lambda p: grain(p, tc or cc))


def scarf(m, col, stripe=None, tail=True):
    cc = C(m, col)
    sc = C(m, stripe) if stripe else None
    b = m.rig.parts['body'][0]
    wear(m, 'body', 'scarf', LAYER['strap'], lambda p: (sc if sc and p.face in SIDES and p.i % 3 == 0 else grain(p, cc)) if p.face != 'down' else None,
         y0=22.4, y1=24.0)
    if tail:
        B = nb(m, 'scarf_tail')
        m.bone(B, b, (1.6, 23.4, -2 - LAYER['strap']))
        piece(m, B, 'scarf_tail', 0.8, 2.6, 15.0, 23.4, -2 - LAYER['strap'] - 0.25, -2 - LAYER['strap'] - 0.25,
              lambda p: (sc if sc and p.j % 3 == 0 else grain(p, cc)), only=('north', 'south'))


def bandolier(m, col, shells='gold'):
    """a strap across the chest from the left shoulder to the right hip, shells along it"""
    cc, sc = C(m, col), C(m, shells)
    b = m.rig.parts['body'][0]
    z0 = -2 - LAYER['strap']

    def pp(p):
        if p.face == 'north' and p.j in (1,) and p.i % 2 == 0:
            return sc
        return grain(p, cc)
    piece(m, b, 'bandolier', -6.6, 6.6, 17.2, 18.8, z0 - 0.4, z0, pp, rot=(0, 0, 42), pivot=(0, 18.0, z0))
    piece(m, b, 'bandolier_back', -6.6, 6.6, 17.2, 18.8, -z0, -z0 + 0.4, lambda p: grain(p, cc), rot=(0, 0, -42), pivot=(0, 18.0, -z0))


def pauldrons(m, col, trim=None, kind='metal'):
    """on the shoulders, over the sleeves: metal (a rim, rivets), pad (soft), fur (a ruff)"""
    pc = C(m, col)
    for part in ('rarm', 'larm'):
        x0, x1, a0, a1, z0, z1 = m.rig.parts[part][1]
        g = LAYER['armor'] + (0.03 if part == 'larm' else 0.0)
        pp = metal(m, pc, trim=trim) if kind == 'metal' else (lambda p, pc=pc: grain(p, pc, 0.08 if kind == 'fur' else 0.04) if p.face != 'down' else mul(pc, 0.6))
        wear(m, part, f'pauldron_{part}', g, pp, y0=a1 - 3.0, y1=a1)


def kneepads(m, col):
    kc = C(m, col)
    for part in ('rleg', 'lleg'):
        x0, x1, _, _, z0, z1 = m.rig.parts[part][1]
        cx = (x0 + x1) / 2
        g = LAYER['boot'] + 0.35 + (0.04 if part == 'lleg' else 0.0)
        piece(m, m.rig.parts[part][0], f'knee_{part}', cx - 1.6, cx + 1.6, 4.6, 7.6, z0 - g - 0.3, z0 - g + 0.9,
              lambda p: mul(kc, 1.15) if p.face == 'north' and p.j == 0 else grain(p, kc))


def patch(m, col, part='larm', y=None):
    """a patch on the outside of a sleeve (the tower's colour)"""
    pc = C(m, col)
    x0, x1, a0, a1, z0, z1 = m.rig.parts[part][1]
    side = outer(m, part)
    g = LAYER['jsleeve'] + 0.12
    y = a1 - 4.5 if y is None else y
    if side == 'west':
        piece(m, m.rig.parts[part][0], f'patch_{part}', x1 + g, x1 + g + 0.2, y, y + 2.0, -1.0, 1.0, lambda p: mul(pc, 1.1) if p.j == 0 else pc)
    else:
        piece(m, m.rig.parts[part][0], f'patch_{part}', x0 - g - 0.2, x0 - g, y, y + 2.0, -1.0, 1.0, lambda p: mul(pc, 1.1) if p.j == 0 else pc)


def quiver(m, col='leather', fletch='white'):
    qc, fc = C(m, col), C(m, fletch)
    b = m.rig.parts['body'][0]
    z0 = 2 + LAYER['vest'] + 0.4
    B = nb(m, 'quiver')
    m.bone(B, b, (1.8, 18.0, z0 + 1.2), rot=(0, 0, -24))
    piece(m, B, 'quiver', 0.6, 3.0, 12.6, 22.6, z0, z0 + 2.4, lambda p: mul(qc, 1.2) if p.face in SIDES and p.j == 0 else grain(p, qc))
    for k, dx in enumerate((-0.5, 0.2, 0.9)):
        piece(m, B, f'quiver_f{k}', 1.8 + dx - 0.2, 1.8 + dx + 0.2, 22.6, 25.0 + 0.3 * k, z0 + 0.7 + 0.25 * k, z0 + 1.5 + 0.25 * k,
              lambda p: fc if p.j < 2 else C(m, 'wood'))


def holster(m, col='leather', part='rleg'):
    hc = C(m, col)
    x0, x1, _, _, z0, z1 = m.rig.parts[part][1]
    side = outer(m, part)
    g = LAYER['trousers'] + 0.1
    x = x0 - g - 0.9 if side == 'east' else x1 + g
    piece(m, m.rig.parts[part][0], f'holster_{part}', x, x + 0.9, 5.4, 10.4, -1.6, 1.6, lambda p: grain(p, hc))
    piece(m, m.rig.parts[part][0], f'holster_grip_{part}', x + 0.05, x + 0.85, 10.4, 12.0, 0.2, 1.4, lambda p: grain(p, C(m, 'gun2')))


def medals(m, cols=('gold', 'red', 'blue')):
    b = m.rig.parts['body'][0]
    z0 = -2 - LAYER['jacket']
    for k, c in enumerate(cols):
        x = 2.6 - 1.05 * k
        piece(m, b, f'medal{k}', x - 0.45, x + 0.45, 19.6, 21.0, z0 - 0.25, z0, lambda p, c=c: mul(C(m, c), 1.15) if p.j == 0 else C(m, c))
    piece(m, b, 'medal_bar', 0.0, 3.2, 21.0, 21.5, z0 - 0.3, z0, lambda p: C(m, 'red'))


def hair_tuft(m, col, kind='fringe'):
    """hair out from under head gear: a fringe over the brow, a ponytail behind"""
    hc = C(m, col)
    hb = m.rig.parts['head'][0]
    if kind == 'ponytail':
        piece(m, hb, 'ponytail', -1.0, 1.0, 22.0, 28.6, 4.6, 6.0, lambda p: grain(p, hc, 0.08), rot=(16, 0, 0), pivot=(0, 28.6, 4.6))


def peaked(m, col, band='black', badge='gold', visor='black'):
    """an officer's peaked cap: a band round the brow, a wide flat top, a glossy visor, a badge"""
    cc, bc, gc, vc = C(m, col), C(m, band), C(m, badge), C(m, visor)
    hb = m.rig.parts['head'][0]
    L = LAYER['cap']
    wear(m, 'head', 'peaked_band', L, lambda p: None if p.face in ('up', 'down') else (gc if p.face == 'north' and p.i in (3, 4) and p.j == 0
                                                                                         else grain(p, bc)), y0=29.0, y1=30.6)
    piece(m, hb, 'peaked_top', -5.3, 5.3, 30.6 + L - 0.3, 32.6 + L, -5.6, 5.0, lambda p: mul(cc, 0.8) if p.face == 'down' else grain(p, cc))
    piece(m, hb, 'peaked_visor', -3.6, 3.6, 28.4, 28.9, -4 - L - 2.6, -4 - L + 0.2, lambda p: mul(vc, 1.4) if p.face == 'up' and p.j == 1 else vc,
          rot=(-14, 0, 0), pivot=(0, 28.65, -4 - L))


def jester(m, a, b, bells='gold'):
    """a jester's cap: a band, three soft points drooping out, a bell on each"""
    ac, bc, gc = C(m, a), C(m, b), C(m, bells)
    hb = m.rig.parts['head'][0]
    L = LAYER['cap']
    wear(m, 'head', 'jester', L, lambda p: None if p.face == 'down' else grain(p, ac if (p.i // 2) % 2 == 0 else bc), y0=29.0, y1=32.0)
    for k, (rx, rz, col) in enumerate(((0, 38, ac), (0, -38, bc), (-40, 0, ac))):
        B = nb(m, f'jester_point{k}')
        m.bone(B, hb, (0, 32 + L, 0), rot=(rx, 0, rz))
        w = 1.3 - 0.05 * k
        piece(m, B, f'jester_pt{k}', -w, w, 32 + L - 0.2, 32 + L + 5.6, -w, w, lambda p, col=col: None if p.face == 'down' else grain(p, col))
        piece(m, B, f'jester_bell{k}', -0.8 + 0.04 * k, 0.8 - 0.04 * k, 32 + L + 5.6, 32 + L + 7.0, -0.8 + 0.04 * k, 0.8 - 0.04 * k,
              lambda p: mul(gc, 1.2) if p.j == 0 else gc)


def pumpkin_head(m, col='orange', glow='flash'):
    """a carved pumpkin worn over the head (the face is the pumpkin's, lit from inside)"""
    pc, gc = C(m, col), C(m, glow)
    hb = m.rig.parts['head'][0]

    def pp(p):
        f, i, j = p.face, p.i, p.j
        if f == 'down':
            return None
        if f == 'north' and ((j == 3 and i in (1, 2, 5, 6)) or (j == 4 and i in (2, 5)) or (j == 6 and 1 <= i <= 6) or (j == 5 and i in (1, 6))):
            return lit(gc)                                                     # the carved eyes and grin
        return mul(pc, 0.85) if i % 3 == 0 and f in SIDES else grain(p, pc, 0.06)
    wear(m, 'head', 'pumpkin', LAYER['helmet'] + 0.1, pp)
    piece(m, hb, 'pumpkin_stem', -0.6, 0.6, 32 + LAYER['helmet'] + 0.1, 34.4, -0.6, 0.6, lambda p: grain(p, C(m, 'green')),
          rot=(0, 0, 14), pivot=(0, 33.2, 0))


def horns_on(m, col='dark', size=1.0):
    hc = C(m, col)
    hb = m.rig.parts['head'][0]
    for sx in (-1, 1):
        B = nb(m, f'horn{sx}')
        x = sx * 3.0
        m.bone(B, hb, (x, 32.6, -1.0), rot=(-18, 0, sx * -22))
        piece(m, B, f'horn{sx}', x - 0.8 * size, x + 0.8 * size, 32.4, 32.4 + 3.2 * size, -1.8, -0.2, lambda p: grain(p, hc, 0.06))
        piece(m, B, f'horn_tip{sx}', x - 0.45 * size, x + 0.45 * size, 32.4 + 3.2 * size, 32.4 + 5.0 * size, -1.4, -0.5, lambda p: grain(p, mul(hc, 1.25)))


def splats(m, cols, n=7, seed=1):
    """paint splashes over what is worn (a paintballer's clothes): marks the garments' painters read"""
    m.splats = [(hash01(seed, k, 'x') * 8 - 4, 4 + hash01(seed, k, 'y') * 22, C(m, cols[k % len(cols)])) for k in range(n)]
