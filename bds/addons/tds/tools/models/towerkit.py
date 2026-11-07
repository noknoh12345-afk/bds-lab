"""Figure towers: a vanilla figure (rigs.py) on our pedestal in the tower's own clothes, with its weapon and the parts each
level adds, like the original's upgrade models. Original designs throughout.

The tower's gear model repeats the figure's rig: the pedestal (tds_base: hq_parts.pedestal, pips), an outfit over the
vanilla clothes (a coat over the illagers' long coat, sleeves to the wrists, trousers and boots: `outfit`), head gear,
its weapon and its upgrades. An upgrade is drawn on bones named lvN_* (shown from level N), a replaced weapon on preN_* /
lvN_* (kitbash.level), so the render controllers show each level's look (entities.level_rules).

Weapons (`arm`): 'g:<kind>' a gun at the chest held with both hands (pose `hold`, shot `fire`), 'h:<kind>' a pistol in
each hand (`dual`, `fire`), 'm:<kind>' a melee weapon in the right hand (`ready`, `swing`), 'm2:<kind>' one in each hand
(`ready2`), 'c:<kind>' a staff, orb or tool (`cast`, `cast`), 't:<kind>' a thing to throw (`throw`, `throw`), None: no
weapon (`idle`). The poses and shots are animation.tds_tower.pose_* and .<shot> (entities.py).
"""
from __future__ import annotations

import math

from hq_parts import flash, octa, pedestal, pips, rifle, vest
from kit import mix, mul
from kitbash import (THEMES, aura, bandana, belt, body_box, cape, chains, circlet, crystals, dress, gauntlets, greaves, has, head_box,
                     level, nb, orbit, pack, pauldrons, plate, scarf, tag, weapon)
from parts import lit, ring
from rigs import RIGS
from vanilla import PED_TOP

THEMES['outfit'] = dict(pal=dict(t1='#4a5a7a', t2='#2e3a52', t3='#3a3026', glow='#ffe080', trim='#c8a040'), style=None)
ROLE = {'Offense': '#c84a3a', 'Offensive': '#c84a3a', 'Defense': '#4a78c8', 'Support': '#3cc864'}
GUN_AT = (-1.6, 19.0, -4.6)          # the grip line of a gun held at the chest (the `hold` pose's hands meet there)
POSE = {'b': 'bow', 'k': 'type', 'g': 'hold', 'h': 'dual', 'm': 'ready', 'm2': 'ready2', 'c': 'cast', 't': 'throw', None: 'idle'}
SHOT = {'b': 'bow', 'k': 'type', 'g': 'fire', 'h': 'revolver', 'm': 'slash', 'm2': 'slash', 'c': 'cast', 't': 'throw', None: ''}


def shot_for(spec):
    """the shot a figure plays (animation.tds_tower.<it>), by what it holds: an automatic's short kicks, a sniper's heavy
    kick, a shotgun's kick and pump, a launcher's shoulder kick, a sprayer's stream, a revolver's flip, a bow's release,
    typing, a blade's sweep, a heavy weapon's overhead slam, a staff's cast, a wrench's knock, a throw"""
    if not spec:
        return ''
    how, _, kind = spec.partition(':')
    kind = kind.split('@')[0]
    if how == 'g':
        if kind == 'minigun':
            return 'spin'
        for shot, kinds in (('auto', ('smg', 'ar', 'lmg', 'tommy', 'twit')), ('snipe', ('sr', 'amr', 'rail', 'crossbow')),
                            ('blast', ('shotgun', 'combat')), ('heavy', ('launcher', 'rocket', 'firework', 'hive', 'frostcannon')),
                            ('stream', ('flamer', 'freezer', 'toxic', 'medigun', 'laser', 'tesla', 'pulse'))):
            if kind in kinds:
                return shot
        return 'fire'
    if how in ('m', 'm2'):
        return 'slam' if kind in ('club', 'hammer', 'battleaxe') else 'slash'
    if how == 'c':
        return 'hammer' if kind == 'wrench' else 'cast'
    return SHOT.get(how, '')
TILT = {'m': -80, 'm2': -80, 'c': 24}  # a held thing's angle to the arm, so it stands right in the pose (the arm's x + this)
NOSE = {'pillager', 'vindicator', 'evoker', 'witch', 'zvillager'}     # rigs with the villagers' nose (to z -6)


PARTS = dict(stone='#7e828c', ptrim='#5a5e68', helmet='#5a6a3a', band='#3e4a28', vest='#b49a64', pouch='#8a7448', pad='#3a3a40',
             yellow='#e8c838', bag='#b49a64', brick='#9a5a46')


def figure(name, rig='pillager', mats=None, disc=None, emblem='chevron', coat=True):
    m = dress(name, RIGS[rig], 'outfit', {**PARTS, 'disc': disc or '#4a78c8', **(mats or {})})
    m.bone('tds_base', None, (0, 0, 0))
    pedestal(m, trim='ptrim')
    pips(m, 3.0, 12.35)
    m.emblem = emblem
    m.own = lambda p, m=m: own_px(m, p)
    if coat:
        outfit(m)
    return m


def thicken(m, part, t):
    """what is worn over a part afterwards clears what was put on it now (kitbash sizes gear from the part's skin)"""
    bone, box, skin = m.rig.parts[part]
    m.rig.parts[part] = (bone, box, skin + t)


def outfit(m, grow=0.26, cuff=2.6):
    """the tower's clothes over the vanilla ones: t1 the coat and sleeves, t2 the trousers, collar and cuffs, t3 the boots"""
    R = m.rig
    top = 'robe' if has(m, 'robe') else 'body'
    if has(m, top):
        b = R.box(top, grow + 0.12)
        tag(m.box(R.bone(top), 'coat', *b, 't1', decal='outfit', seam=True), part='coat')
        thicken(m, top, grow + 0.14)
    for part, off in (('rarm', 0.03), ('larm', 0.09)):
        if has(m, part):
            x0, x1, y0, y1, z0, z1 = R.box(part, grow + off)
            tag(m.box(R.bone(part), f'sleeve_{part}', x0, x1, y0 + cuff, y1, z0, z1, 't1', decal='outfit', seam=True), part='sleeve')
            thicken(m, part, grow + off + 0.02)
    hem = 6.4 if top == 'robe' else 12.4
    for part, off in (('rleg', 0.01), ('lleg', 0.04)):
        if has(m, part):
            x0, x1, y0, y1, z0, z1 = R.box(part, grow + off)
            top = min(y1, hem) - (0.06 if part == 'lleg' else 0.0)          # the two legs' tops not on one plane
            tag(m.box(R.bone(part), f'trousers_{part}', x0, x1, y0, top, z0, z1, 't2', decal='outfit', seam=True), part='trousers')
            thicken(m, part, grow + off + 0.02)


def base_bone(m):
    """a bone on the pedestal for one level's things (cubes on tds_base itself would show at every level)"""
    n = nb(m, 'base')
    if n not in m.bmap:
        m.bone(n, 'tds_base', (0, PED_TOP, 0))
    return n


# ------------------------------------------------------------------------------------------------ head gear
def _head(m):
    x0, x1, y0, y1, z0, z1 = head_box(m, 0.0)
    return m.rig.bone('head'), (x1 - x0) / 2, y0, y1, z0, z1, (z0 + z1) / 2


def combat_helmet(m, mat='helmet', band='band', nvg=False):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    B = nb(m, 'helmet')
    m.bone(B, b, (0, y1, cz))
    r = hw + 0.75
    octa(m, B, 'helmet_shell', 'y', (0, cz), y1 - 3.6, y1 + 0.6, r, mat, decal='helmet')
    octa(m, B, 'helmet_band', 'y', (0, cz), y1 - 3.1, y1 - 2.1, r + 0.14, band, decal='strap')
    m.slope(B, 'helmet_brim', -r * 0.75, r * 0.75, (cz - r - 1.2, y1 - 3.4), (cz - r + 0.6, y1 - 2.6), 0.45, mat)
    if nvg:
        m.box(B, 'nvg_mount', -0.8, 0.8, y1 - 1.6, y1 - 0.2, cz - r - 0.6, cz - r + 0.3, 'gun2')
        for sx in (-1, 1):
            octa(m, B, f'nvg_{"l" if sx > 0 else "r"}', 'z', (sx * 1.25, y1 - 2.3), cz - r - 2.6, cz - r - 0.55, 0.62, 'gun', decal='lensglow')


def beret(m, mat='t2', badge='gold'):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    B = nb(m, 'beret')
    m.bone(B, b, (0, y1, cz), rot=(0, 0, 11))
    octa(m, B, 'beret', 'y', (0.6, cz + 0.4), y1 - 1.2, y1 + 1.1, hw + 0.85, mat, decal='cloth')
    m.box(B, 'beret_badge', -2.6, -1.4, y1 - 0.8, y1 + 0.3, cz - hw - 1.1, cz - hw - 0.8, badge, decal='gem')


def brimmed(m, mat='black', band='red', brim=2.0, tall=3.2, curl=False):
    """a hat with a brim all round: a fedora, a top hat (tall), a cowboy's hat (curl: the brim's sides turned up)"""
    b, hw, y0, y1, z0, z1, cz = _head(m)
    B = nb(m, 'hat')
    m.bone(B, b, (0, y1, cz))
    rc = hw + 0.3
    octa(m, B, 'hat_brim', 'y', (0, cz), y1 - 0.55, y1 - 0.05, rc + brim, mat, decal='cloth')
    octa(m, B, 'hat_crown', 'y', (0, cz), y1 - 0.9, y1 + tall, rc, mat, decal='hatcrown')
    octa(m, B, 'hat_band', 'y', (0, cz), y1 - 0.08, y1 + 0.85, rc + 0.12, band, decal='strap')
    if curl:
        r0, r1 = rc + brim * 0.55, rc + brim + 0.5
        m.rise_x(B, 'hat_curl_l', (r0, y1 - 0.3), (r1, y1 + 1.2), cz - rc - 0.6, cz + rc + 0.6, 0.45, mat, decal='cloth')
        m.rise_x(B, 'hat_curl_r', (-r1, y1 + 1.2), (-r0, y1 - 0.3), cz - rc - 0.6, cz + rc + 0.6, 0.45, mat, decal='cloth')


def hardhat(m, mat='yellow'):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    B = nb(m, 'hardhat')
    m.bone(B, b, (0, y1, cz))
    octa(m, B, 'hardhat', 'y', (0, cz), y1 - 2.4, y1 + 1.4, hw + 0.55, mat, decal='helmet')
    octa(m, B, 'hardhat_brim', 'y', (0, cz), y1 - 2.6, y1 - 2.05, hw + 1.6, mat)
    m.box(B, 'hardhat_ridge', -0.5, 0.5, y1 + 1.2, y1 + 1.9, cz - hw + 0.4, cz + hw - 0.4, mat, decal='metal')
    m.box(B, 'hardhat_lamp', -1.0, 1.0, y1 - 1.5, y1 + 0.3, cz - hw - 1.25, cz - hw - 0.5, 'gun2', decal='lens')


def beanie(m, mat='red', rim='white', pom='white'):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    B = nb(m, 'beanie')
    m.bone(B, b, (0, y1, cz))
    octa(m, B, 'beanie', 'y', (0, cz), y1 - 2.4, y1 + 1.4, hw + 0.5, mat, decal='knit')
    octa(m, B, 'beanie_rim', 'y', (0, cz), y1 - 2.9, y1 - 1.6, hw + 0.78, rim, decal='knit')
    octa(m, B, 'beanie_pom', 'y', (0, cz), y1 + 1.3, y1 + 3.1, 1.0, pom, decal='knit')


def peaked_cap(m, mat='t1', band='black', badge='gold'):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    B = nb(m, 'peaked')
    m.bone(B, b, (0, y1, cz))
    octa(m, B, 'peaked_band', 'y', (0, cz), y1 - 1.2, y1 + 0.5, hw + 0.5, band, decal='strap')
    octa(m, B, 'peaked_top', 'y', (0, cz + 0.3), y1 + 0.45, y1 + 2.0, hw + 1.4, mat, decal='cloth')
    m.slope(B, 'peaked_visor', -hw * 0.8, hw * 0.8, (cz - hw - 2.6, y1 - 1.1), (cz - hw - 0.3, y1 - 0.4), 0.4, 'black')
    m.box(B, 'peaked_badge', -0.9, 0.9, y1 + 0.1, y1 + 1.7, cz - hw - 1.85, cz - hw - 1.5, badge, decal='gem')


def visor_helm(m, mat='metal', visor='glow', crest=None):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    g = 0.42
    zf = (-6.0 if m.rig.key in NOSE else z0) - g                  # over the villagers' nose
    tag(m.box(b, 'vhelm', -hw - g, hw + g, y0 - 0.2, y1 + g, zf, z1 + g, mat, decal='vhelm'), visor=visor)
    if crest:
        m.box(b, 'vhelm_crest', -0.5, 0.5, y1 + g, y1 + g + 1.4, zf + 1.6, z1 - 0.2, crest, decal='metal')


def face_mask(m, mat='black'):
    """a cloth over the nose and mouth, tied behind"""
    b, hw, y0, y1, z0, z1, cz = _head(m)
    g = 0.38
    zf = (-6.0 if m.rig.key in NOSE else z0) - 0.45
    m.box(b, 'facemask', -hw - g, hw + g, y0 - 0.3, y0 + (y1 - y0) * 0.42, zf, z1 + g, mat, decal='mask2')


def pumpkin(m, mat='orange', glow='flash'):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    B = nb(m, 'pumpkin')
    m.bone(B, b, (0, y0, cz))
    octa(m, B, 'pumpkin', 'y', (0, cz - 0.95), y0 - 0.4, y1 + 1.0, hw + 1.6, mat, decal='pumpkin')
    m.box(B, 'pumpkin_stem', -0.5, 0.5, y1 + 0.9, y1 + 2.5, cz - 1.4, cz - 0.4, 'green', rot=(0, 0, 12), pivot=(0, y1 + 0.9, cz - 0.9))
    m.pumpkin = glow


def headphones(m, mat='gun2', pad='black'):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    yy = y0 + (y1 - y0) * 0.55
    m.box(b, 'phones_band', -hw - 0.7, hw + 0.7, y1 + 0.75, y1 + 1.35, cz - 0.6, cz + 0.6, mat)
    for sx in (1, -1):
        lo, hi = sorted((sx * (hw + 0.45), sx * (hw + 1.65)))
        m.box(b, f'phones_{"l" if sx > 0 else "r"}', lo, hi, yy - 1.7, yy + 1.7, cz - 1.7, cz + 1.7, pad, decal='metal')
        lo2, hi2 = sorted((sx * (hw + 0.7), sx * (hw + 1.15)))
        m.box(b, f'phones_arm{"l" if sx > 0 else "r"}', lo2, hi2, yy + 1.6, y1 + 0.8, cz - 0.45, cz + 0.45, mat)


def headset(m):
    b, hw, y0, y1, z0, z1, cz = _head(m)
    yy = y0 + (y1 - y0) * 0.5
    m.box(b, 'headset_cup', -hw - 1.5, -hw - 0.72, yy - 1.4, yy + 1.15, cz - 1.4, cz + 1.4, 'gun2')
    m.box(b, 'headset_mic', -hw - 1.2, -hw - 0.8, yy - 1.3, yy - 0.9, z0 - 2.4, cz - 1.4, 'gun')


# ------------------------------------------------------------------------------------------------ body gear
def _body(m, grow):
    x0, x1, y0, y1, z0, z1 = body_box(m, grow)
    return m.rig.bone('body'), x0, x1, y0, y1, z0, z1


def tac_vest(m, mat='vest', pouch='pouch', radio=True):
    b, x0, x1, y0, y1, z0, z1 = _body(m, 0.46)
    vest(m, b, x0, x1, y0 + 2.0, y1, z0, z1, mat, pouch, radio=radio, tag='vest')


def bandolier(m, mat='leather', shells='gold'):
    b, x0, x1, y0, y1, z0, z1 = _body(m, 0.64)                               # clear of a vest (0.46) worn under it later
    yc = (y0 + y1) / 2 + 1.0
    w = (x1 - x0) / 2 + 1.6
    tag(m.box(b, 'bandolier', -w, w, yc - 0.8, yc + 0.8, z0 - 0.35, z0, mat, rot=(0, 0, 38), pivot=(0, yc, z0), decal='bullets'), shells=shells)
    tag(m.box(b, 'bandolier_b', -w, w, yc - 0.8, yc + 0.8, z1, z1 + 0.35, mat, rot=(0, 0, -38), pivot=(0, yc, z1), decal='bullets'), shells=shells)


def tie(m, mat='red'):
    b, x0, x1, y0, y1, z0, z1 = _body(m, 0.46)
    m.box(b, 'tie_knot', -0.6, 0.6, y1 - 1.8, y1 - 0.7, z0 - 0.4, z0, mat)
    m.box(b, 'tie', -0.75, 0.75, y1 - 7.2, y1 - 1.8, z0 - 0.3, z0 - 0.05, mat, decal='tie')


def medals(m, n=3):
    b, x0, x1, y0, y1, z0, z1 = _body(m, 0.46)
    for i in range(n):
        x = x1 - 1.0 - 1.1 * i
        m.box(b, f'medal{i}', x - 0.45, x + 0.45, y1 - 4.6, y1 - 3.0, z0 - 0.3, z0, ('gold', 'red', 'blue')[i % 3], decal='gem')
    m.box(b, 'medal_bar', x1 - 0.55 - 1.1 * n, x1 - 0.45, y1 - 3.0, y1 - 2.5, z0 - 0.34, z0, 'red')


def quiver(m, mat='leather', fletch='white'):
    b, x0, x1, y0, y1, z0, z1 = _body(m, 0.5)
    Q = nb(m, 'quiver')
    m.bone(Q, b, (1.5, y1 - 2.0, z1 + 1.2), rot=(0, 0, -22))
    octa(m, Q, 'quiver', 'y', (1.5, z1 + 1.2), y0 + 1.0, y1 + 1.0, 1.15, mat, decal='haft')
    for i, dx in enumerate((-0.5, 0.05, 0.6)):
        m.box(Q, f'quiver_f{i}', 1.5 + dx - 0.12, 1.5 + dx + 0.12, y1 + 0.9, y1 + 3.0 + 0.3 * i, z1 + 0.6 + 0.2 * i, z1 + 1.6 + 0.2 * i, fletch)


def sandbags(m, r=10.3, h=3.6, mat='bag'):
    ring(m, base_bone(m), 'sbag', r, PED_TOP - 0.2, PED_TOP + h, mat)


def crate_on(m, x, z, s=2.6, mat='wood', name='crate'):
    m.box(base_bone(m), name, x - s / 2, x + s / 2, PED_TOP - 0.1, PED_TOP - 0.1 + s, z - s / 2, z + s / 2, mat, decal='crate')


def pot_on(m, x, z, plant='green', flower='gold', name='pot'):
    B = base_bone(m)
    octa(m, B, name, 'y', (x, z), PED_TOP - 0.1, PED_TOP + 1.8, 1.3, 'brick', decal='metal')
    m.box(B, f'{name}_stem', x - 0.2, x + 0.2, PED_TOP + 1.7, PED_TOP + 5.2, z - 0.2, z + 0.2, plant)
    octa(m, B, f'{name}_bloom', 'y', (x, z), PED_TOP + 5.0, PED_TOP + 5.9, 1.2, flower, decal='gem')


# ------------------------------------------------------------------------------------------------ held things (in a hand)
def held(m, kind, side='r', mat='metal', mat2='wood', glow='glow', size=1.0, tilt=0):
    """a thing in a hand that is not one of kitbash's weapons, its length down the arm (-y) from the fist like theirs: a
    pistol or revolver (barrel down the arm, grip toward the arm's back: under the gun when the arm is raised), a
    boomerang, snowball, mine, gift, dynamite, laptop, flask, wrench, pumpkin bomb, firework"""
    if side not in m.rig.hands:
        return
    hb, (x, y, z) = m.rig.hands[side]
    s = size
    n = nb(m, f'{kind}_{side}')
    m.bone(n, hb, (x, y, z), rot=(tilt, 0, 0) if tilt else None)
    B = lambda x0, x1, y0, y1, z0, z1, mt, **kw: m.box(n, f'{n}_{len(m.cubes)}', x + x0 * s, x + x1 * s, y + y0 * s, y + y1 * s, z + z0 * s, z + z1 * s, mt, **kw)  # noqa: E731
    if kind in ('pistol', 'revolver'):
        L = 7.0 if kind == 'revolver' else 6.0
        B(-0.5, 0.5, -L, 0.6, -1.1, 0.2, mat, decal='gunmetal')                   # slide and barrel, down the arm
        B(-0.45, 0.45, -0.7, 1.2, 0.1, 2.8, mat2, rot=(-12, 0, 0), pivot=(x, y, z + 0.1 * s))   # the grip in the fist
        B(-0.2, 0.2, -2.2, -1.2, 0.15, 1.3, mat)                                  # the trigger guard
        if kind == 'revolver':
            octa(m, n, f'{n}_cyl', 'y', (x, z - 0.45 * s), y - 3.6 * s, y - 1.8 * s, 0.8 * s, mat2, decal='gunmetal')
        mz = y - L * s
        F = nb(m, f'gun{side}_flash')
        m.bone(F, n, (x, mz, z - 0.45 * s))
        fl, fw = 2.8 * s, 1.2 * s
        tag(m.box(F, f'{F}_a', x - fw, x + fw, mz - fl, mz, z - 0.45 * s, z - 0.45 * s, 'flash', only=('north', 'south'), decal='flamey', dens=4), top=mz, h=fl)
        tag(m.box(F, f'{F}_b', x, x, mz - fl, mz, z - 0.45 * s - fw, z - 0.45 * s + fw, 'flash', only=('east', 'west'), decal='flamey', dens=4), top=mz, h=fl)
    elif kind == 'boomerang':
        B(-0.25, 0.25, -5.6, 0.4, -0.65, 0.65, mat2, decal='boomer')
        B(-0.2, 0.2, -5.6, 0.4, -0.6, 0.6, mat2, rot=(-105, 0, 0), pivot=(x, y, z), decal='boomer')
    elif kind in ('snowball', 'ball'):
        octa(m, n, f'{n}_ball', 'y', (x, z), y - 3.2 * s, y - 0.4 * s, 1.4 * s, mat, decal='knit')
    elif kind == 'mine':
        octa(m, n, f'{n}_mine', 'y', (x, z - 1.0 * s), y - 2.6 * s, y - 1.2 * s, 2.0 * s, mat, decal='mine')
        m.box(n, f'{n}_led', x - 0.3 * s, x + 0.3 * s, y - 3.0 * s, y - 2.6 * s, z - 1.3 * s, z - 0.7 * s, 'gem')   # on its face, away from the hand
    elif kind == 'gift':
        B(-1.6, 1.6, -3.6, -0.4, -1.6, 1.6, mat, decal='gift')
        B(-0.45, 0.45, -0.45, 0.6, -1.0, 1.0, mat2)
    elif kind == 'dynamite':
        for i, dz in enumerate((-0.75, 0.0, 0.75)):
            octa(m, n, f'{n}_stick{i}', 'y', (x, z + dz * s), y - 4.5 * s + 0.03 * i, y + 0.5 * s, 0.38 * s, 'red', decal='metal')
        m.box(n, f'{n}_fuse', x - 0.1, x + 0.1, y - 5.6 * s, y - 4.6 * s, z - 0.1, z + 0.1, 'flash')
    elif kind == 'laptop':
        B(-0.3, 0.3, -5.6, 0.6, -2.6, 2.6, 'gun2', decal='metal')
        tag(B(-0.62, -0.32, -5.3, 0.3, -2.3, 2.3, 'gun'), decal='screen')
    elif kind in ('flask', 'potion'):
        octa(m, n, f'{n}_flask', 'y', (x, z), y - 4.2 * s, y - 0.8 * s, 1.15 * s, glow, decal='flask')     # held by its neck, in the fist
    elif kind == 'wrench':
        B(-0.35, 0.35, -9.0, 1.2, -0.4, 0.4, mat, decal='metal')
        B(-0.38, 0.38, -10.6, -8.6, -1.4, 1.4, mat, decal='metal')
    elif kind == 'pbomb':
        octa(m, n, f'{n}_bomb', 'y', (x, z), y - 3.8 * s, y - 0.4 * s, 1.7 * s, 'orange', decal='pumpkinb')
        m.box(n, f'{n}_fuse', x - 0.15, x + 0.15, y - 4.8 * s, y - 3.8 * s, z - 0.15, z + 0.15, 'flash')
    elif kind == 'firework':
        octa(m, n, f'{n}_rocket', 'y', (x, z), y - 7.0 * s, y + 1.0 * s, 0.6 * s, 'red', decal='gift')
        m.box(n, f'{n}_cone', x - 0.45 * s, x + 0.45 * s, y - 8.4 * s, y - 7.0 * s, z - 0.45 * s, z + 0.45 * s, 'gold', rot=(0, 45, 0), pivot=(x, y, z))
    else:
        raise KeyError(kind)


# ------------------------------------------------------------------------------------------------ guns at the chest
def ensure_gun(m, at=None):
    at = at or getattr(m, 'gun_at', GUN_AT)
    if 'gun' not in m.bmap:
        m.bone('gun', m.rig.parts['body'][0] if has(m, 'body') else m.rig.bones[0][0], at)


def gun(m, kind, at=None, s=1.0, mat='gun', mat2='gun2', glow='glow'):
    """a gun on a bone of its own under `gun` (the shot recoils `gun`, so a level's gun recoils too), with its flash"""
    at = at or getattr(m, 'gun_at', GUN_AT)
    ensure_gun(m, at)
    x, y, z = at
    B = nb(m, f'gun_{kind}')
    F = nb(m, 'gun_flash')
    if kind in ('ar', 'lmg', 'sr', 'amr'):
        mz = rifle(m, B, 'gun', at, kind, s, sight='scope' if kind in ('sr', 'amr') else ('dot' if kind == 'lmg' else 'iron'))
        flash(m, B, F, *mz, s)
        return mz
    m.bone(B, 'gun', at)
    S = lambda v: v * s  # noqa: E731
    box = lambda x0, x1, y0, y1, z0, z1, mt=mat, **kw: m.box(B, f'{B}_{len(m.cubes)}', x + S(x0), x + S(x1), y + S(y0), y + S(y1), z + S(z0), z + S(z1), mt, **kw)  # noqa: E731
    grip = lambda: m.box(B, f'{B}_grip', x + S(-0.5), x + S(0.5), y + S(-3.2), y + S(-0.8), z + S(-2.2), z + S(-0.8), mat2, rot=(16, 0, 0),  # noqa: E731
                         pivot=(x, y - S(0.8), z - S(1.5)))
    if kind in ('pistol', 'revolver'):
        box(-0.5, 0.5, -0.6, 0.9, -4.2, 0.0, mat2, decal='gunmetal')
        box(-0.35, 0.35, 0.0, 0.7, -6.4, -4.1, mat)
        box(-0.4, 0.4, -3.0, -0.5, -1.4, 0.0, mat2, rot=(14, 0, 0), pivot=(x, y - S(0.6), z - S(0.7)))
        if kind == 'revolver':
            octa(m, B, f'{B}_cyl', 'z', (x, y + S(0.25)), z - S(3.2), z - S(1.6), S(0.75), mat, decal='gunmetal')
        mz = (x, y + S(0.35), z - S(6.4))
    elif kind in ('shotgun', 'smg', 'tommy', 'combat'):
        long = {'shotgun': 1.2, 'smg': 0.8, 'tommy': 0.9, 'combat': 1.0}[kind]
        box(-0.7, 0.7, -1.9, 0.5, -0.2, 3.0, mat2, rot=(8, 0, 0), pivot=(x, y, z), decal='gunmetal')
        box(-0.8, 0.8, -0.9, 1.0, -5.4, -0.1, mat, decal='gunmetal')
        grip()
        box(-0.45, 0.45, 0.0, 0.85, -5.3 - 6.0 * long, -5.3, mat)
        if kind in ('shotgun', 'combat'):
            box(-0.62, 0.62, -0.95, -0.05, -5.3 - 4.5 * long, -6.0, mat2, decal='rail')           # the pump
        if kind == 'combat':
            octa(m, B, f'{B}_drum', 'x', (y - S(1.6), z - S(7.6)), x - S(1.0), x + S(1.0), S(1.7), mat2, decal='drum')
        if kind == 'tommy':
            octa(m, B, f'{B}_drum', 'x', (y - S(1.5), z - S(7.4)), x - S(1.05), x + S(1.05), S(1.6), mat2, decal='drum')
        if kind == 'smg':
            box(-0.45, 0.45, -3.4, -0.6, -7.4, -6.4, mat2)
        mz = (x, y + S(0.42), z - S(5.3 + 6.0 * long))
    elif kind == 'minigun':
        box(-1.6, 1.6, -1.6, 1.6, -5.0, 1.0, mat2, decal='gunmetal')
        Z = nb(m, 'spinz')
        m.bone(Z, B, (x, y, z))
        for i in range(6):
            a = math.radians(60 * i)
            bx, by = 0.78 * math.cos(a), 0.78 * math.sin(a)
            m.box(Z, f'{B}_b{i}', x + S(bx - 0.28), x + S(bx + 0.28), y + S(by - 0.28), y + S(by + 0.28), z - S(14.0 + 0.02 * i), z - S(4.9), mat)
        octa(m, Z, f'{B}_ring', 'z', (x, y), z - S(13.2), z - S(12.0), S(1.4), mat2)
        box(-1.25, 1.25, 1.65, 4.2, -3.4, 0.4, 'leather', decal='pouch')               # the ammo box on its back
        grip()
        mz = (x, y, z - S(14.0))
    elif kind in ('launcher', 'rocket', 'snowball', 'firework', 'hive'):
        r = {'launcher': 1.3, 'rocket': 1.1, 'snowball': 1.4, 'firework': 1.0, 'hive': 1.5}[kind]
        L = {'launcher': 8.0, 'rocket': 13.0, 'snowball': 9.0, 'firework': 10.0, 'hive': 8.0}[kind]
        octa(m, B, f'{B}_tube', 'z', (x, y + S(1.4)), z - S(L), z + S(2.0), S(r), 'gold' if kind == 'hive' else mat, decal='hive' if kind == 'hive' else 'gunmetal')
        box(-0.5, 0.5, -2.8, -0.2, -2.6, -1.4, mat2, rot=(14, 0, 0), pivot=(x, y - S(0.4), z - S(2.0)))
        if kind == 'launcher':
            octa(m, B, f'{B}_drum', 'z', (x, y + S(0.2)), z - S(8.2), z - S(5.4), S(1.6), mat2, decal='drum')
        if kind == 'rocket':
            octa(m, B, f'{B}_warhead', 'z', (x, y + S(1.4)), z - S(L + 2.2), z - S(L - 0.4), S(0.7), 'red')
        if kind == 'snowball':
            octa(m, B, f'{B}_ball', 'z', (x, y + S(1.4)), z - S(L + 1.6), z - S(L - 0.6), S(1.12), 'white', decal='knit')
        if kind == 'firework':
            for i, (dx, dy, c) in enumerate(((-1.0, 0.1, 'red'), (1.0, 0.1, 'blue'), (0.0, 1.6, 'gold'))):
                box(dx - 0.38, dx + 0.38, 1.4 + dy - 0.38, 1.4 + dy + 0.38, -L - 2.0 - 0.02 * i, -L + 0.5, c)
        mz = (x, y + S(1.4), z - S(L + (2.2 if kind == 'rocket' else 0.5)))
    elif kind in ('flamer', 'freezer', 'toxic', 'slime', 'paintball', 'frostcannon'):
        c = {'flamer': 'orange', 'freezer': 'ice', 'toxic': 'green', 'slime': 'green', 'paintball': 'blue', 'frostcannon': 'ice'}[kind]
        big = 1.35 if kind == 'frostcannon' else 1.0
        box(-0.8 * big, 0.8 * big, -1.0 * big, 1.0 * big, -6.0, 0.5, mat2, decal='gunmetal')
        box(-0.5 * big, 0.5 * big, -0.3, 0.7, -10.0, -5.7, mat)
        octa(m, B, f'{B}_nozzle', 'z', (x, y + S(0.2)), z - S(11.2), z - S(9.8), S(0.85 * big), mat2)
        grip()
        if kind == 'paintball':
            octa(m, B, f'{B}_hopper', 'y', (x, z - S(2.6)), y + S(1.0), y + S(3.4), S(1.2), c, decal='gem')
        else:
            octa(m, B, f'{B}_tank', 'z', (x, y + S(2.0)), z - S(5.0), z - S(1.4), S(0.95), c, decal='tank')      # on top: below is the fists'
        if kind == 'flamer':
            m.box(B, f'{B}_pilot', x - S(0.3), x + S(0.3), y + S(0.1), y + S(0.6), z - S(11.55), z - S(11.2), 'flash')
        if kind in ('freezer', 'frostcannon'):
            for i in range(3):
                octa(m, B, f'{B}_fin{i}', 'z', (x, y + S(0.2)), z - S(8.6 - 1.1 * i), z - S(8.0 - 1.1 * i), S(1.05 * big), 'ice2')
        mz = (x, y + S(0.2), z - S(11.2))
    elif kind in ('laser', 'pulse', 'tesla', 'rail'):
        L = 16.0 if kind == 'rail' else 12.0
        box(-0.9, 0.9, -1.1, 1.2, -7.0, 0.5, mat2, decal='gunmetal')
        box(-0.4, 0.4, -0.1, 0.8, -L, -6.9, mat)
        for i in range(4 if kind == 'rail' else 3):
            octa(m, B, f'{B}_coil{i}', 'z', (x, y + S(0.35)), z - S(8.0 + 1.6 * i), z - S(7.4 + 1.6 * i), S(0.85), glow)
        if kind == 'rail':
            octa(m, B, f'{B}_scope', 'z', (x, y + S(2.2)), z - S(6.0), z - S(1.0), S(0.7), mat, decal='scope')
        grip()
        mz = (x, y + S(0.35), z - S(L))
    elif kind == 'medigun':
        box(-1.0, 1.0, -1.1, 1.3, -7.0, 0.5, 'white', decal='medcross')
        box(-0.45, 0.45, -0.1, 0.8, -11.0, -6.9, mat)
        octa(m, B, f'{B}_can', 'z', (x, y + S(2.1)), z - S(5.8), z - S(1.4), S(0.85), glow, decal='flask')
        grip()
        mz = (x, y + S(0.35), z - S(11.0))
    elif kind == 'crossbow':
        box(-0.6, 0.6, -0.8, 0.6, -8.0, 1.5, 'wood', decal='haft')
        m.box(B, f'{B}_limb', x - S(5.0), x + S(5.0), y + S(0.2), y + S(0.2), z - S(8.6), z - S(6.4), 'wood2', only=('up', 'down'), decal='bowlimb', dens=2.0)
        box(-0.4, 0.4, -3.0, -0.6, -1.0, 0.3, mat2, rot=(14, 0, 0), pivot=(x, y - S(0.6), z))
        box(-0.15, 0.15, 0.6, 0.9, -9.4, -1.0, 'metal')
        return (x, y + S(0.75), z - S(9.4))
    elif kind == 'bow':
        m.box(B, f'{B}_bow', x, x, y - S(6.5), y + S(6.5), z - S(7.0), z - S(4.6), 'wood', only=('east', 'west'), decal='bowarc', dens=2.0)
        m.box(B, f'{B}_arrow', x - S(0.15), x + S(0.15), y - S(0.15), y + S(0.15), z - S(9.0), z + S(1.0), 'wood2')
        m.box(B, f'{B}_tip', x - S(0.3), x + S(0.3), y - S(0.3), y + S(0.3), z - S(10.0), z - S(9.0), mat2)
        return (x, y, z - S(10.0))
    else:
        raise KeyError(kind)
    if kind != 'tesla':
        flash(m, B, F, *mz, 0.8 * s)
    return mz


# ------------------------------------------------------------------------------------------------ the weapon a tower holds
def armament(m, spec, swap=None, mats=None):
    """spec: '<how>:<kind>' (see the module's docstring) or a pair (before, from level `swap` on)"""
    if isinstance(spec, tuple):
        a, b = spec
        if any(s and s.startswith('g:') for s in spec):
            ensure_gun(m)                                                   # on the body itself, not on a level's copy of it
        if b is None or b == a or not swap:
            return armament(m, a, None, mats)
        with level(m, f'pre{swap}'):
            armament(m, a, None, mats)
        with level(m, f'lv{swap}'):
            armament(m, b, None, mats)
        return
    if spec is None:
        return
    how, kind = spec.split(':')
    mt = dict(mats or {})
    kind, _, scale = kind.partition('@')                                    # 'g:rocket@1.25': a bigger one
    if scale:
        mt['gs'] = float(scale)
    if how == 'g':
        from arms import gun as arms_gun
        arms_gun(m, kind, s=mt.pop('s', 1.1) * mt.pop('gs', 1.0), **{k: v for k, v in mt.items() if k in ('mat', 'mat2', 'glow', 'furn', 'wood', 'head')})
    elif how == 'k':
        from arms import laptop
        laptop(m, s=mt.pop('size', 1.0), **{k: v for k, v in mt.items() if k in ('mat', 'glow')})
    elif how == 'b':
        from arms import bow
        bow(m, 'r', s=mt.pop('size', 1.0), **{k: v for k, v in mt.items() if k in ('mat', 'mat2', 'furn', 'string', 'fletch')})
    elif how == 'h':
        from arms import pistol
        ps = mt.pop('size', 1.0) * mt.pop('gs', 1.0)
        for side in ('r', 'l'):
            pistol(m, side, kind, s=ps, **{k: v for k, v in mt.items() if k in ('mat', 'mat2', 'glow', 'furn', 'wood')})
    elif how in ('m', 'm2'):
        for side in (('r', 'l') if how == 'm2' else ('r',)):
            weapon(m, kind, side, mt.get('mat', 'metal'), mt.get('mat2', 'wood'), mt.get('size', 1.0), mt.get('glow'), tilt=TILT[how])
    elif how == 'c':
        if kind in ('staff', 'wand', 'scepter', 'orb', 'book', 'lantern'):
            weapon(m, kind, 'r', mt.get('mat', 'gold'), mt.get('mat2', 'wood'), mt.get('size', 1.0), mt.get('glow', 'glow'),
                   tilt=TILT['c'] if kind in ('staff', 'wand', 'scepter') else 0, fwd=2.4 if kind in ('staff', 'wand', 'scepter') else 0)
        else:
            held(m, kind, 'r', mt.get('mat', 'metal'), mt.get('mat2', 'wood'), mt.get('glow', 'glow'))
    elif how == 't':
        if kind == 'bomb':
            weapon(m, 'bomb', 'r', glow=mt.get('glow', 'flash'))
        elif kind == 'boomerang':
            from arms import boomerang
            boomerang(m, 'r', s=mt.pop('size', 1.0), **{k: v for k, v in mt.items() if k in ('furn', 'band')})
        else:
            held(m, kind, 'r', mt.get('mat', 'white'), mt.get('mat2', 'wood'), mt.get('glow', 'glow'))


# ------------------------------------------------------------------------------------------------ upgrades by level
def packs(m, kind):
    """the parts a tower gains level by level, by archetype: {1: .., 2: .., 3: .., 'max': ..}"""
    P = {
        'soldier': {1: lambda: belt(m, 'pouch', 'gold', pouches='pouch'), 2: lambda: tac_vest(m), 3: lambda: (gauntlets(m, 'pad'), greaves(m, 'pad')),
                    'max': lambda: (pack(m, 'pouch'), headset(m))},
        'agent': {1: lambda: belt(m, 'black', 'gold'), 2: lambda: scarf(m, 't2', tail=True), 3: lambda: gauntlets(m, 'black'),
                  'max': lambda: cape(m, 't2', length=14, hem='trim')},
        'mage': {1: lambda: circlet(m, 'gold', 'glow'), 2: lambda: pauldrons(m, 't2', 'trim'), 3: lambda: orbit(m, 'glow', 3, 8.0, size=0.8),
                 'max': lambda: aura(m, 'glow', 9.5, y=4.7, bone='tds_base')},
        'brawler': {1: lambda: bandana(m, 't2', tails=True), 2: lambda: gauntlets(m, 'metal2'), 3: lambda: belt(m, 'gold', 'gem'),
                    'max': lambda: cape(m, 't1', length=16, hem='gold')},
        'knight': {1: lambda: gauntlets(m, 'metal2'), 2: lambda: pauldrons(m, 'metal', 'trim'), 3: lambda: greaves(m, 'metal'),
                   'max': lambda: cape(m, 't1', length=18, hem='trim')},
        'frost': {1: lambda: scarf(m, 't2', 'trim', tail=True), 2: lambda: crystals(m, 'body', 'ice', 3, size=0.7), 3: lambda: gauntlets(m, 'ice2'),
                  'max': lambda: aura(m, 'ice', 9.5, y=4.7, bone='tds_base')},
        'fire': {1: lambda: gauntlets(m, 'leather'), 2: lambda: pack(m, 'orange', 'tank'), 3: lambda: pauldrons(m, 'metal2', 'orange'),
                 'max': lambda: aura(m, 'flash', 9.5, y=4.7, bone='tds_base')},
        'cowboy': {1: lambda: belt(m, 'leather', 'gold', pouches='leather'), 2: lambda: scarf(m, 'red', tail=True), 3: lambda: gauntlets(m, 'leather'),
                   'max': lambda: cape(m, 't2', length=16, hem='gold')},
        'tech': {1: lambda: belt(m, 'gun2', 'glow'), 2: lambda: pack(m, 'metal2', 'tank'), 3: lambda: gauntlets(m, 'metal2'),
                 'max': lambda: orbit(m, 'glow', 2, 9.0, size=0.9)},
        'gang': {1: lambda: chains(m, 'gold'), 2: lambda: belt(m, 'black', 'gold'), 3: lambda: gauntlets(m, 'black'),
                 'max': lambda: cape(m, 't2', length=16, hem='gold')},
        'worker': {1: lambda: gauntlets(m, 'leather'), 2: lambda: plate(m, 'orange', 'white', back=True), 3: lambda: greaves(m, 'leather'),
                   'max': lambda: pack(m, 'metal2')},
        'archer': {1: lambda: gauntlets(m, 'leather'), 2: lambda: pauldrons(m, 'leather', 'trim'), 3: lambda: belt(m, 'leather', 'gold'),
                   'max': lambda: cape(m, 't1', length=15, hem='trim')},
        'hazmat': {1: lambda: belt(m, 't3', 'gold'), 2: lambda: pack(m, 'green', 'tank'), 3: lambda: gauntlets(m, 't3'),
                   'max': lambda: aura(m, 'glow', 9.5, y=4.7, bone='tds_base')},
        'reaper': {1: lambda: belt(m, 'black', 'metal'), 2: lambda: chains(m, 'metal2'), 3: lambda: pauldrons(m, 'black', 'metal', spiked='metal'),
                   'max': lambda: (cape(m, 't2', length=18, hem='trim'), aura(m, 'glow', 9.5, y=4.7, bone='tds_base'))},
        'jester': {1: lambda: gauntlets(m, 't2'), 2: lambda: scarf(m, 't2', 't1', tail=True), 3: lambda: orbit(m, 'glow', 3, 8.0, size=0.8),
                   'max': lambda: cape(m, 't1', 't2', length=14, hem='gold')},
        'pilot': {1: lambda: scarf(m, 'white', tail=True), 2: lambda: belt(m, 'leather', 'gold'), 3: lambda: gauntlets(m, 'leather'),
                  'max': lambda: medals(m)},
        'winter': {1: lambda: scarf(m, 'red', 'white', tail=True), 2: lambda: gauntlets(m, 'red'), 3: lambda: belt(m, 'leather', 'gold'),
                   'max': lambda: aura(m, 'ice', 9.5, y=4.7, bone='tds_base')},
        'officer': {1: lambda: belt(m, 'leather', 'gold'), 2: lambda: medals(m), 3: lambda: pauldrons(m, 't1', 'gold'),
                    'max': lambda: cape(m, 'red', 't2', length=18, hem='gold')},
    }
    return P[kind]


def upgrades(m, kind, top, extra=None):
    """the level parts: the pack's 1, 2, 3 at those levels and its best ('max') at the top level (4 or 5; with the third
    when the top is 3), an `extra` {level | 'max': fn} beside them, a gold ring at a sixth level"""
    mx = min(top, 5) if top >= 4 else 3
    at = {}
    for src in (packs(m, kind) if kind else {}, extra or {}):
        for k, fn in src.items():
            lv = mx if k == 'max' else k
            if lv <= top:
                at.setdefault(lv, []).append(fn)
    if top >= 6:
        at.setdefault(6, []).append(lambda: aura(m, 'gold', 11.0, y=4.75, n=10, bone='tds_base'))
    for lv in sorted(at):
        with level(m, f'lv{lv}'):
            for fn in at[lv]:
                fn()


def finish(m):
    """drop the bones that carry nothing (a level repeats every rig bone; most of the copies stay empty)"""
    keep = {c['bone'] for c in m.cubes} | {b['name'] for b in m.bones if b.get('locators')}
    parent = {b['name']: b['parent'] for b in m.bones}
    for name in list(keep):
        p = parent.get(name)
        while p and p not in keep:
            keep.add(p)
            p = parent.get(p)
    m.bones = [b for b in m.bones if b['name'] in keep]
    m.bmap = {b['name']: b for b in m.bones}
    return m


# ------------------------------------------------------------------------------------------------ painting
def own_px(m, p):
    """the tower parts' decals (kitbash.paint calls this after the shared decals, before kitbash's own: False = not ours)"""
    d, c, q, f = p.cube['decal'], p.cube, p.local(), p.face
    pal = p.pal
    yb = q[1] - c['o'][1]
    if d == 'outfit':
        part = c.get('part')
        if part == 'coat':
            if f == 'down':
                return mul(p.col, 0.72)
            if yb > c['s'][1] - 1.1 and f != 'up':
                return pal['t2']                                         # the collar
            if f == 'north':
                if abs(q[0]) < 0.28:
                    return mul(pal['t2'], 0.9)                           # the closure
                if abs(q[0] - 0.85) < 0.25 and int(yb * 1.1) % 3 == 1 and yb > 3.0:
                    return pal['trim']                                   # buttons
                if 1.4 < abs(q[0]) < 3.4 and 1.2 < yb < 3.6:
                    return mul(p.col, 0.8) if yb > 3.2 or abs(abs(q[0]) - 2.4) > 0.85 else mul(p.col, 0.93)   # pockets
            if yb < 0.7:
                return mul(p.col, 0.84)                                  # the hem
            return mul(p.col, 0.95) if int((q[0] + q[2] + 20) * 1.3 + yb * 0.4) % 5 == 0 else p.col
        if part == 'sleeve':
            if f == 'down':
                return mul(p.col, 0.72)
            return pal['t2'] if yb < 1.0 else p.col
        if part == 'trousers':
            if yb < 2.6:
                return mul(pal['t3'], 1.25) if yb > 2.25 else pal['t3']   # boots
            return mul(p.col, 0.9) if f == 'north' and abs(yb - 6.0) < 0.6 else p.col
        return p.col
    if d == 'hatcrown':
        return mul(p.col, 0.86) if f == 'up' and abs(q[0]) < 0.5 else p.col      # the crease
    if d == 'knit':
        return mul(p.col, 0.86) if int((q[0] + q[2] + 20) * 1.6) % 2 == 0 and f != 'up' else p.col
    if d == 'vhelm':
        if f == 'down':
            return None
        if f == 'north' and 0.36 < p.v < 0.56 and 0.1 < p.u < 0.9:
            return lit(pal[c.get('visor') or 'glow'])
        return mul(p.col, 1.12) if abs(q[0]) < 0.4 and f in ('north', 'up') else p.col
    if d == 'mask2':
        if f in ('up', 'down'):
            return None
        return mul(p.col, 0.85) if int(q[1] * 2.0) % 3 == 0 else p.col
    if d in ('pumpkin', 'pumpkinb'):
        if f == 'down' and d == 'pumpkin':
            return None
        if d == 'pumpkin' and f == 'north' and c['name'].endswith('pumpkin0'):
            v = (q[1] - c['o'][1]) / max(0.1, c['s'][1])
            u = p.u
            eye = 0.55 < v < 0.72 and (0.12 < u < 0.4 or 0.6 < u < 0.88)
            mouth = 0.26 < v < 0.42 and 0.12 < u < 0.88 and not (0.37 < v and int(u * 10) % 3 == 0)
            if eye or mouth:
                return lit(pal[getattr(m, 'pumpkin', 'flash')])
        return mul(p.col, 0.82) if int((q[0] + q[2] + 20) * 1.4) % 4 == 0 else p.col     # the ribs
    if d == 'bullets':
        if f in ('up', 'down'):
            return mul(p.col, 0.8)
        return pal[c.get('shells') or 'gold'] if int((q[0] + 20) * 1.6) % 2 == 0 and 0.25 < p.v < 0.75 else p.col
    if d == 'tie':
        return mul(p.col, 0.8) if int(yb * 1.5) % 3 == 0 else p.col
    if d == 'crate':
        if f == 'up':
            return mul(p.col, 0.8) if abs(p.u - 0.5) < 0.08 or abs(p.v - 0.5) < 0.08 else p.col
        return mul(p.col, 0.75) if p.u < 0.1 or p.u > 0.9 or p.v < 0.1 or p.v > 0.9 or abs(p.u - p.v) < 0.07 else p.col
    if d == 'flamey':
        a = (c['top'] - q[1]) / max(0.1, c['h'])                             # 0 at the muzzle, 1 at the tip
        cx = (c['o'][0] + c['s'][0] / 2) if f in ('north', 'south') else (c['o'][2] + c['s'][2] / 2)
        half = max(0.1, (c['s'][0] if f in ('north', 'south') else c['s'][2]) / 2)
        b = abs((q[0] if f in ('north', 'south') else q[2]) - cx) / half
        if b > (1 - a) ** 0.7 * (0.55 + 0.45 * abs(math.sin(a * 9.0))):
            return None
        return lit(mix((255, 255, 230), (255, 150, 40), min(1.0, a * 0.8 + b * 0.6)))
    if d == 'boomer':
        return pal['red'] if f in ('east', 'west') and int((q[1] + 40) * 0.8) % 3 == 0 else p.col
    if d == 'mine':
        cx, cz = c['o'][0] + c['s'][0] / 2, c['o'][2] + c['s'][2] / 2
        return mul(p.col, 0.7) if f == 'up' and abs(math.hypot(q[0] - cx, q[2] - cz) - 1.0) < 0.2 else p.col
    if d == 'gift':
        return pal['gold'] if abs(p.u - 0.5) < 0.1 or (f in ('north', 'south', 'east', 'west') and abs(p.v - 0.5) < 0.1) else p.col
    if d == 'screen':
        return lit(pal['glow']) if f == 'west' and 0.12 < p.u < 0.88 and 0.12 < p.v < 0.88 and int(q[1] * 3) % 2 == 0 else (
            mul(pal['glow'], 0.4) if f == 'west' and 0.08 < p.u < 0.92 and 0.08 < p.v < 0.92 else p.col)
    if d == 'flask':
        return lit(p.col) if yb < c['s'][1] * 0.65 else pal['glass']
    if d == 'medcross':
        if f in ('east', 'west') and ((abs(p.u - 0.5) < 0.09 and abs(p.v - 0.5) < 0.3) or (abs(p.v - 0.5) < 0.09 and abs(p.u - 0.5) < 0.22)):
            return pal['red']
        return mul(p.col, 0.9) if f == 'down' else p.col
    if d == 'hive':
        return mul(p.col, 0.75) if abs((q[2] % 1.4) - 0.7) < 0.15 else p.col
    if d == 'bowlimb':
        a = abs(q[0] - (c['o'][0] + c['s'][0] / 2)) / max(0.1, c['s'][0] / 2)
        zz = (q[2] - c['o'][2]) / max(0.1, c['s'][2])
        return p.col if abs(zz - (0.75 - 0.6 * a * a)) < 0.22 else None
    if d == 'bowarc':
        a = abs(q[1] - (c['o'][1] + c['s'][1] / 2)) / max(0.1, c['s'][1] / 2)
        zz = (q[2] - c['o'][2]) / max(0.1, c['s'][2])
        if abs(zz - 0.85) < 0.06:
            return pal['white']                                          # the string
        return p.col if abs(zz - (0.12 + 0.75 * a * a)) < 0.16 else None
    return False
