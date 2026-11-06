"""Vanilla mobs as the bodies, high-quality gear on top.

The client entities draw two layers: a vanilla mob's own geometry and texture (referenced by identifier and path from the
game's resource pack, nothing of it copied here) and a gear geometry of ours whose bones repeat the vanilla rig - the same
names, parents, pivots and bind rotations - so one animation moves both layers (as vanilla does with a sheep's wool).
Gear stays 0.2+ off every vanilla face (two layers on one plane would flicker). Rigs: bds/.lab/samples/resource_pack/models.
"""
from __future__ import annotations

import math

from kit import Model, mul
from parts import bags, emblem_px, face_px, flag, lit, pedestal, pips, ring, sample, spr, stone

# vanilla rigs: (bone, parent, pivot[, bind rotation])
HUMANOID = [('waist', None, (0, 12, 0)), ('body', 'waist', (0, 24, 0)), ('head', 'body', (0, 24, 0)), ('rightArm', 'body', (-5, 22, 0)),
            ('leftArm', 'body', (5, 22, 0)), ('rightLeg', 'body', (-1.9, 12, 0)), ('leftLeg', 'body', (1.9, 12, 0))]
SKELETON = [b if b[0] not in ('rightLeg', 'leftLeg') else (b[0], b[1], (-2 if b[0] == 'rightLeg' else 2, 12, 0)) for b in HUMANOID]
DROWNED = [('body', None, (0, 24, 0)), ('head', 'body', (0, 24, 0)), ('rightArm', 'body', (-5, 22, 0)), ('leftArm', 'body', (5, 22, 0)),
           ('rightLeg', 'body', (-1.9, 12, 0)), ('leftLeg', 'body', (1.9, 12, 0))]
PIGLIN = [('body', None, (0, 24, 0)), ('head', 'body', (0, 24, 0)), ('rightarm', 'body', (-5, 22, 0)), ('leftarm', 'body', (5, 22, 0)),
          ('rightleg', 'body', (-1.9, 12, 0)), ('leftleg', 'body', (1.9, 12, 0))]
VEX = [('body', None, (0, 2, 0)), ('head', 'body', (0, 6, 0)), ('rightArm', 'body', (-1.75, 5.75, 0)), ('leftArm', 'body', (1.75, 5.75, 0)),
       ('leftWing', 'body', (0.5, 5, 1)), ('rightWing', 'body', (-0.5, 5, 1))]
PHANTOM = [('body', None, (0, 24, 0)), ('wing0', 'body', (2, 26, -8), (0, 0, 5.7)), ('wingtip0', 'wing0', (8, 26, -8), (0, 0, 5.7)),
           ('wing1', 'body', (-3, 26, -8), (0, 0, -5.7)), ('wingtip1', 'wing1', (-9, 24, -8), (0, 0, -5.7)),
           ('head', 'body', (0, 23, -7), (11.5, 0, 0)), ('tail', 'body', (0, 26, 1)), ('tailtip', 'tail', (0, 25.5, 7))]
PILLAGER = [('waist', None, (0, 12, 0)), ('body', 'waist', (0, 0, 0)), ('head', 'body', (0, 24, 0)), ('leftLeg', 'body', (2, 12, 0)),
            ('rightLeg', 'body', (-2, 12, 0)), ('rightarm', 'body', (-5, 22, 0)), ('leftarm', 'body', (5, 22, 0))]
WITCH = [('body', None, (0, 0, 0)), ('head', 'body', (0, 24, 0)), ('arms', 'body', (0, 22, 0)), ('leg0', 'body', (-2, 12, 0)), ('leg1', 'body', (2, 12, 0))]

# skin -> (vanilla geometry, vanilla texture, rig)
ENEMY_BASE = [
    ('geometry.zombie.v1.8', 'textures/entity/zombie/zombie', HUMANOID),              # 0 walker
    ('geometry.zombie.husk.v1.8', 'textures/entity/zombie/husk', HUMANOID),           # 1 armored (lead)
    ('geometry.skeleton.wither.v1.8', 'textures/entity/skeleton/wither_skeleton', SKELETON),   # 2 boss
    ('geometry.zombie.drowned.v1.16', 'textures/entity/zombie/drowned', DROWNED),     # 3 runner (fast)
    ('geometry.vex.v1.8', 'textures/entity/vex/vex', VEX),                            # 4 hidden
    ('geometry.phantom', 'textures/entity/phantom', PHANTOM),                         # 5 flying
    ('geometry.piglin', 'textures/entity/piglin/zombie_piglin', PIGLIN),              # 6 heavy
    ('geometry.skeleton.stray.v1.8', 'textures/entity/skeleton/stray', SKELETON),     # 7 frost
]
TOWER_FIGURE = {0: ('geometry.pillager', 'textures/entity/pillager', PILLAGER), 1: ('geometry.villager.witch.v1.8', 'textures/entity/witch', WITCH),
                4: ('geometry.pillager', 'textures/entity/pillager', PILLAGER)}
UNIT_FIGURE = {1: ('geometry.pillager', 'textures/entity/pillager', PILLAGER), 3: ('geometry.skeleton.v1.8', 'textures/entity/skeleton/skeleton', SKELETON)}

K = 1.9                     # tower gear is drawn at the vanilla figure's scale: 1.9x the old pedestal
PED_TOP = 3.0 + 1.5         # pedestal(r=13.3, h=3.0, r2=11.4, h2=1.5): the figure is raised this much (animation stand_*)


def gear(name, rig, materials, density=1.5, width=128, variants=None, emissive=True):
    m = Model(name, density=density, width=width, materials=materials, variants=variants, emissive=emissive)
    for b in rig:
        m.bone(b[0], b[1], b[2], rot=b[3] if len(b) > 3 else None)
    return m


def plate_metal(p, q, c, rivet='dark'):
    yb = q[1] - c['o'][1]
    if p.face in ('north', 'south') and (p.u < 0.12 or p.u > 0.88) and (p.v < 0.14 or p.v > 0.86):
        return p.pal[rivet]
    return mul(p.col, 1.1) if p.face == 'north' and abs(q[0]) < 0.4 else p.col


# ------------------------------------------------------------------------------------------------ enemy gear
def g_walker():
    m = gear('gear_walker', HUMANOID, dict(vest='#7a3e2e', vest2='#5a2a20', hair='#2e2a26', band='#d8d0b8', band2='#a89c80'))
    m.box('head', 'hair', -4.35, 4.35, 30.6, 32.9, -4.35, 4.35, 'hair', decal='hair')
    m.box('head', 'tuft', -1.0, 1.0, 32.0, 34.2, -2.6, -0.6, 'hair', rot=(-25, 0, 18), pivot=(0, 32.6, -1.6))
    m.box('body', 'vest', -4.45, 4.45, 13.2, 24.4, -2.45, 2.45, 'vest', decal='vest')
    m.box('leftArm', 'wrap', 3.7, 8.3, 14.5, 18.5, -2.3, 2.3, 'band', decal='wrap')
    m.bone('band_end', 'leftArm', (8.35, 16.0, 0))
    m.box('band_end', 'band_end', 8.35, 8.35, 12.0, 16.5, -0.9, 0.9, 'band', only=('east', 'west'), decal='tatter')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'hair':
            if p.face == 'down':
                return None
            if p.face != 'up' and yb < 0.9 * abs(math.sin((q[2] if p.face in ('east', 'west') else q[0]) * 1.9)):
                return None                                         # a ragged hairline
            if p.face == 'north' and yb < 1.6:
                return None
            return p.col
        if d == 'vest':
            if p.face in ('up', 'down'):
                return None
            if p.face == 'north' and abs(q[0]) < 1.4:
                return None                                         # open at the front
            if yb < 1.2 * abs(math.sin((q[2] if p.face in ('east', 'west') else q[0]) * 1.7)):
                return None                                         # a torn hem
            return p.pal['vest2'] if int((q[1]) * 1.3) % 3 == 0 else p.col
        if d == 'wrap':
            if p.face in ('up', 'down'):
                return None
            return p.pal['band2'] if int((q[1] + q[2] * 0.4) * 1.6) % 2 else p.col
        if d == 'tatter':
            yy = q[1] - c['o'][1]
            return None if yy < 1.5 * abs(math.sin(q[2] * 3.0)) else p.col
        return p.col
    m.decal = decal
    return m


def g_armored():
    m = gear('gear_armored', HUMANOID, dict(metal='#a0a6b2', metal2='#6e7480', dark='#2e2a36', trim='#d0a83c', glow='#ff4a3c'))
    m.box('head', 'helm', -4.6, 4.6, 23.7, 32.7, -4.6, 4.6, 'metal', decal='helm', dens={'north': 2.0})
    m.box('head', 'crest', -0.5, 0.5, 32.6, 34.6, -4.0, 3.8, 'trim')
    m.box('body', 'plate', -4.67, 4.67, 13.6, 24.6, -2.65, 2.65, 'metal', decal='plate')   # off the helm's side planes
    m.rise_x('leftArm', 'pauldron_l', (3.4, 25.3), (8.9, 23.4), -2.8, 2.8, 1.2, 'metal', decal='edge')
    m.mirror('pauldron_l', 'pauldron_r', 'rightArm')
    m.box('leftArm', 'gauntlet_l', 3.6, 8.4, 11.6, 15.6, -2.4, 2.4, 'metal2', decal='band')
    m.mirror('gauntlet_l', 'gauntlet_r', 'rightArm')
    m.box('leftLeg', 'greave_l', -0.5, 4.3, -0.33, 6.47, -2.48, 2.42, 'metal', decal='band')      # 0.03 off the right greave's planes
    m.box('rightLeg', 'greave_r', -4.3, 0.5, -0.3, 6.5, -2.45, 2.45, 'metal', decal='band')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'helm':
            if p.face == 'down':
                return None
            if p.face == 'north':
                if 4.4 < yb < 5.8:
                    return lit(p.pal['glow']) if abs(abs(q[0]) - 1.9) < 0.7 and 4.7 < yb < 5.5 else p.pal['dark']   # the visor slit
                if yb < 3.2 and abs(q[0]) < 2.4 and int(q[0] * 2 + 9) % 2 == 0:
                    return p.pal['dark']                                                                         # breathing holes
            return mul(p.col, 0.9) if p.face in ('east', 'west') and abs(q[2]) < 0.4 else p.col
        if d == 'plate':
            if p.face in ('up', 'down'):
                return None
            return p.pal['trim'] if c['s'][1] - yb < 0.6 else plate_metal(p, q, c)
        if d == 'edge':
            return p.pal['trim'] if p.face != 'up' and p.v > 0.55 else p.col
        if d == 'band':
            if p.face in ('up', 'down'):
                return None
            return p.pal['dark'] if 0.3 < (q[1] - c['o'][1]) % 2.0 < 0.55 else p.col
        return p.col
    m.decal = decal
    return m


def g_boss():
    m = gear('gear_boss', SKELETON, dict(gold='#d8a838', gold2='#a87a20', horn='#e8dcc0', iron='#4a4652', glow='#ff8a2c', cape='#7a1a24', cape2='#5a1018'))
    m.box('head', 'crown', -4.6, 4.6, 30.2, 31.9, -4.6, 4.6, 'gold', decal='crown')
    for i, x in enumerate((-2.6, 0.0, 2.6)):
        m.box('head', f'tine{i}', x - 0.55, x + 0.55, 31.0, 33.6, -4.95, -4.05, 'gold', rot=(0, 0, 45), pivot=(x, 32.3, -4.5))
    m.rise_x('head', 'horn_l', (3.4, 29.2), (8.0, 33.8), -0.8, 0.8, 1.4, 'horn', decal='ring')
    m.mirror('horn_l', 'horn_r')
    m.box('body', 'core', -1.5, 1.5, 18.2, 21.0, -2.75, -2.25, 'glow')
    m.box('body', 'belt', -4.55, 4.55, 12.0, 13.8, -2.55, 2.55, 'iron', decal='belt')
    m.bone('cape', 'body', (0, 24.2, 2.6))
    m.box('cape', 'cape', -4.8, 4.8, 4.0, 24.2, 2.6, 2.6, 'cape', only=('north', 'south'), decal='cape', dens=1.2)
    for side, bone, x0 in ((1, 'leftArm', 3.6), (-1, 'rightArm', -6.4)):
        for i, (zc, tilt) in enumerate(((-0.8, 26), (1.0, 14))):
            cx = side * 5.0
            m.box(bone, f'spike{i}_{bone}', cx - 0.6, cx + 0.6, 23.4, 26.6, zc - 0.6, zc + 0.6, 'horn', rot=(0, 0, side * tilt), pivot=(cx, 24.0, zc))
        m.box(bone, f'cuff_{bone}', x0, x0 + 2.8, 12.4, 15.0, -1.4, 1.4, 'iron')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'crown':
            if p.face == 'down':
                return None
            return lit((255, 74, 60)) if p.face == 'north' and abs(q[0]) < 0.55 else (p.pal['gold2'] if p.face == 'up' else p.col)
        if d == 'ring':
            return mul(p.col, 0.78) if int(q[0] * 1.8) % 2 == 0 else p.col
        if d == 'belt':
            if p.face in ('up', 'down'):
                return None
            return p.pal['gold'] if p.face == 'north' and abs(q[0]) < 1.1 else p.col
        if d == 'cape':
            yy = q[1] - c['o'][1]
            if yy < 1.6 * abs(math.sin(q[0] * 1.3)):
                return None                                     # a ragged hem
            return p.pal['cape2'] if (abs(q[0]) * 1.1) % 2.2 < 0.5 else p.col   # folds, by position on both faces
        return p.col
    m.decal = decal
    return m


def g_runner():
    m = gear('gear_runner', DROWNED, dict(strap='#2a2630', lens='#50d0d0', scarf='#ff6a4a', scarf2='#c84030', shoe='#f0ece0', sole='#e8643c', hair='#e8643c'))
    m.box('head', 'strap', -4.45, 4.45, 27.0, 28.8, -4.45, 4.45, 'strap', decal='strap')
    m.pair('head', 'head', 'lens', 0.7, 3.3, 26.6, 29.2, -4.95, -4.4, 'strap', decal='lens')
    m.slope('head', 'pony', -1.0, 1.0, (3.0, 31.4), (8.6, 27.6), 1.6, 'hair', extend=(0, 0.3))
    m.box('body', 'wrap', -4.5, 4.5, 22.4, 24.6, -2.5, 2.5, 'scarf', decal='wrap')
    m.bone('scarf', 'body', (0, 23.6, 2.5))
    m.box('scarf', 'tail', 0, 0, 15.0, 24.0, 2.5, 11.5, 'scarf', only=('east', 'west'), decal='tail', dens=1.5)
    m.box('leftLeg', 'shoe_l', -0.45, 4.75, -0.43, 2.57, -2.78, 2.42, 'shoe', decal='shoe')     # 0.03 off the other shoe's planes
    m.box('rightLeg', 'shoe_r', -4.75, 0.45, -0.4, 2.6, -2.75, 2.45, 'shoe', decal='shoe')   # outside the drowned's pants layer (inflate 0.25)

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d in ('strap', 'wrap') and p.face in ('up', 'down'):
            return None
        if d == 'lens':
            return lit((216, 255, 255)) if p.face == 'north' and 0.2 < p.u < 0.8 and 0.2 < p.v < 0.8 else p.col
        if d == 'wrap':
            return p.pal['scarf2'] if int((q[0] + q[2] + 20) * 0.9) % 2 else p.col
        if d == 'tail':
            a = (q[2] - 2.5) / 9.0
            if yb < 2.0 + 2.2 * math.sin(a * 5.5) * a or (a > 0.86 and int(yb * 1.2) % 2 == 0):
                return None
            return p.pal['scarf2'] if int(a * 7) % 2 else p.col
        if d == 'shoe':
            return p.pal['sole'] if yb < 0.8 else p.col
        return p.col
    m.decal = decal
    return m


def g_hidden():
    m = gear('gear_hidden', VEX, dict(cloak='#3c2850', cloak2='#2a1c3a', glow='#c070ff'),
             variants={'': {'_alpha': {'*': 170, 'glow': 255}}}, emissive=False, density=2.5, width=64)
    m.box('head', 'hood', -3.0, 3.0, 5.6, 11.6, -3.0, 3.0, 'cloak', decal='hood')
    m.box('body', 'robe', -2.2, 2.2, -1.6, 5.6, -1.6, 1.6, 'cloak', decal='robe')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'hood':
            if p.face == 'down' or (p.face == 'north' and abs(q[0]) < 2.1 and yb < 4.6):
                return None                                     # the face shows through the opening
            return p.col
        if d == 'robe':
            if p.face in ('up', 'down') or yb < 0.6 + 1.0 * abs(math.sin((q[2] if p.face in ('east', 'west') else q[0]) * 2.6)):
                return None
            return p.pal['cloak2'] if int((q[0] + q[2] + 9) * 1.6) % 2 else p.col
        return p.col
    m.decal = decal
    return m


def g_flying():
    m = gear('gear_flying', PHANTOM, dict(horn='#e8dcc8', bone='#b8c4d0', web='#5e3a7e'), density=2.0)
    for side, tag in ((1, 'l'), (-1, 'r')):
        x0, x1 = sorted((side * 1.2, side * 2.6))
        m.slope('head', f'horn_{tag}', x0, x1, (-10.4, 25.0), (-6.0, 27.6), 0.9, 'horn')
    for i, z in enumerate((-6.0, -3.0, 0.0)):
        m.box('body', f'spine{i}', -0.4, 0.4, 25.6, 27.8, z - 0.6, z + 0.6, 'bone', rot=(-30, 0, 0), pivot=(0, 26.0, z))
    m.box('tailtip', 'spade', -1.8, 1.8, 25.0, 25.0, 11.0, 15.0, 'web', only=('up', 'down'), decal='spade')

    def decal(p):
        d, q = p.cube['decal'], p.local()
        if d == 'spade':
            a, b = abs(q[0]) / 1.8, (q[2] - 11.0) / 4.0
            return None if a > 1.0 - abs(b - 0.45) * 1.6 else p.col
        return p.col
    m.decal = decal
    return m


def g_heavy():
    m = gear('gear_heavy', PIGLIN, dict(armor='#76804e', armor2='#565e38', dark='#2e2c30', orange='#e88a2c', metal='#8a8e96', metal2='#5e626a'))
    m.box('head', 'helm', -5.6, 5.6, 23.6, 32.7, -4.6, 4.6, 'armor', decal='helm', dens={'north': 2.0})
    m.box('body', 'vest', -4.65, 4.65, 13.0, 24.6, -2.65, 2.65, 'armor', decal='vest')
    m.box('body', 'pack', -3.6, 3.6, 14.0, 23.4, 2.7, 6.2, 'metal', decal='pack')
    m.pair('body', 'body', 'tank', 0.6, 3.2, 18.0, 27.0, 6.15, 7.8, 'orange', decal='tank')
    m.box('leftarm', 'shield', 2.6, 9.8, 8.4, 21.4, -3.5, -2.8, 'metal', decal='shield')
    m.box('leftleg', 'pad_l', -0.45, 4.45, 4.97, 7.57, -2.63, 2.42, 'metal2')
    m.box('rightleg', 'pad_r', -4.45, 0.45, 5.0, 7.6, -2.6, 2.45, 'metal2')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'helm':
            if p.face == 'down':
                return None
            if p.face == 'north' and 3.6 < yb < 5.6 and abs(q[0]) < 4.4:
                return lit((255, 154, 44)) if 3.9 < yb < 5.3 and abs(q[0]) < 4.0 else p.pal['dark']   # the visor
            return p.col
        if d == 'vest':
            if p.face in ('up', 'down'):
                return None
            return p.pal['orange'] if p.face == 'north' and abs(q[0] - 2.6) < 0.7 and 7.0 < yb < 8.0 else p.col
        if d == 'pack':
            return p.pal['metal2'] if int(q[1] * 1.2) % 3 == 0 else p.col
        if d == 'tank':
            return mul(p.col, 0.8) if p.face != 'up' and abs(yb - 6.0) < 0.4 else p.col
        if d == 'shield':
            if p.face == 'north':
                stripe = (q[0] + q[1] * 0.8) % 3.0 < 1.2
                return p.pal['orange'] if stripe and (yb < 2.2 or yb > c['s'][1] - 1.8) else p.col
            return p.col
        return p.col
    m.decal = decal
    return m


def g_frost():
    m = gear('gear_frost', SKELETON, dict(ice='#9ae4ff', ice2='#5ab4e8', ice3='#e0f8ff', glow='#d8ffff'))
    for i, (x, tilt) in enumerate(((-2.4, -16), (0.0, 0), (2.4, 16))):
        m.box('head', f'spike{i}', x - 0.6, x + 0.6, 31.8, 35.6 - abs(x) * 0.4, -0.6, 0.6, 'ice3', rot=(0, 0, tilt), pivot=(x, 32.0, 0), decal='ice')
    m.box('body', 'shard0', -1.2, 1.2, 20.0, 27.0, 1.6, 3.6, 'ice', rot=(-26, 0, 0), pivot=(0, 22.0, 2.6), decal='ice')
    m.box('body', 'shard1', -3.6, -1.8, 17.0, 22.4, 1.6, 3.2, 'ice', rot=(-18, 0, -14), pivot=(-2.7, 18.0, 2.4), decal='ice')
    m.box('body', 'shard2', 1.8, 3.6, 16.5, 21.6, 1.6, 3.2, 'ice', rot=(-18, 0, 14), pivot=(2.7, 17.5, 2.4), decal='ice')
    for side, bone in ((1, 'leftArm'), (-1, 'rightArm')):
        cx = side * 5.0
        m.box(bone, f'icicle_{bone}', cx - 0.5, cx + 0.5, 9.0, 13.0, -0.5, 0.5, 'ice', rot=(0, 45, 0), pivot=(cx, 11.0, 0), decal='ice')
    m.rise_x('leftArm', 'frost_leftArm', (3.2, 24.8), (7.6, 23.2), -1.6, 1.6, 0.8, 'ice2', decal='ice')   # a frosted pauldron
    m.mirror('frost_leftArm', 'frost_rightArm', 'rightArm')

    def decal(p):
        q = p.local()
        k = (q[1] * 0.9 + (q[2] if p.face in ('east', 'west') else q[0]) * 1.7) % 2.4
        return lit(p.pal['glow']) if k < 0.3 else p.pal['ice2'] if k > 1.9 else p.col
    m.decal = decal
    return m


ENEMY_GEAR = [g_walker, g_armored, g_boss, g_runner, g_hidden, g_flying, g_heavy, g_frost]


# ------------------------------------------------------------------------------------------------ tower gear (figure towers)
def tower_gear(name, rig, materials, variants=None):
    mats = dict(stone='#7e828c', disc='#4a78c8', gold='#ffd650')
    mats.update(materials)
    m = gear(name, rig, mats, density=1.5, width=256, variants=variants)
    m.bone('tds_base', None, (0, 0, 0))                     # the pedestal: not moved by the figure's animations
    top = pedestal_k(m)
    pips_k(m)
    return m, top


def pedestal_k(m):
    m.octa_y('tds_base', 'base', 0, 0, 0.0, 3.0, 13.3, 'stone', decal='stone')
    m.octa_y('tds_base', 'disc', 0, 0, 2.6, 4.5, 11.4, 'disc', decal='disc')
    return PED_TOP


def pips_k(m, y=3.0, r=12.35):
    for i in range(1, 8):
        a = math.radians(-54 + (i - 1) * 18)
        x, z = r * math.sin(a), -r * math.cos(a)
        m.bone(f'pip{i}', 'tds_base', (x, y, z))
        m.box(f'pip{i}', f'pip{i}', x - 0.75, x + 0.75, y - 0.05, y + 1.05, z - 0.75, z + 0.75, 'gold', rot=(0, -math.degrees(a), 0), pivot=(x, y, z), flat=True)


def tower_decal(p):
    d = p.cube['decal']
    if d == 'stone':
        return stone(p)
    if d == 'disc':
        q = p.local()
        return mul(p.col, 0.86) if p.face == 'up' and 8.8 < math.hypot(q[0], q[2]) < 9.5 else p.col
    if d == 'bags':
        return bags(p, row=1.9, width=4.2)
    return None


def rifle_on_body(m, x, y, z, length, scope=False):
    """a rifle along -z on the gear's own bone `gun` (child of the figure's body; recoil moves it back)"""
    m.bone('gun', 'body', (x, y, z))
    m.box('gun', 'stock', x - 0.8, x + 0.8, y - 1.2, y + 0.8, z - 1.0, z + 2.6, 'wood')
    m.box('gun', 'receiver', x - 0.85, x + 0.85, y - 0.8, y + 1.1, z - 6.4, z - 0.95, 'gun', decal='gunmetal')
    m.box('gun', 'barrel', x - 0.35, x + 0.35, y + 0.2, y + 0.9, z - length, z - 6.35, 'gun')
    m.box('gun', 'mag', x - 0.55, x + 0.55, y - 2.6, y - 0.75, z - 4.8, z - 3.2, 'gun')
    if scope:
        m.box('gun', 'scope', x - 0.6, x + 0.6, y + 1.05, y + 2.3, z - 5.8, z - 1.6, 'gun', decal='scope')


def t_gunner():
    m, top = tower_gear('gear_gunner', PILLAGER, dict(helmet='#5a6a3a', helmet2='#46542c', vest='#b49a64', vest2='#8a7448', gun='#2c2c34', wood='#7a5232'),
                        variants={'': {}, '_holo': {'_tint': (110, 236, 255), '_alpha': 135}})      # skin 6: the hologram
    m.box('head', 'helmet', -4.7, 4.7, 30.4, 34.9, -4.7, 4.7, 'helmet', decal='helmet')
    m.box('body', 'vest', -4.85, 4.85, 13.5, 24.9, -3.85, 3.85, 'vest', decal='vest')   # 0.4 over the robe's top
    rifle_on_body(m, -1.6, 19.0, -4.0, 15.0)

    def decal(p):
        r = tower_decal(p)
        if r is not None:
            return r
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'helmet':
            if p.face == 'down':
                return None
            return p.pal['helmet2'] if p.face != 'up' and p.v > 0.7 else p.col
        if d == 'vest':
            if p.face in ('up', 'down'):
                return None
            return p.pal['vest2'] if p.face == 'north' and q[1] - c['o'][1] < 2.4 and int(q[0] + 9) % 3 == 0 else p.col
        if d == 'gunmetal':
            return mul(p.col, 1.25) if p.face != 'down' and p.v < 0.2 else p.col
        return p.col
    m.decal = decal
    return m


def t_medic():
    m, top = tower_gear('gear_medic', WITCH, dict(disc='#3cc864', pole='#9aa0aa', flagc='#f4f4f0', glass='#9ad8ff', potion='#ff5a8a', potion2='#7cff8c', cork='#8a5a32'))
    m.box('body', 'pole', -10.6, -9.6, 0.0, 40.0, -0.5, 0.5, 'pole')
    m.box('body', 'finial', -10.9, -9.3, 40.0, 41.6, -0.8, 0.8, 'gold')
    m.bone('flag', 'body', (-10.1, 39.4, 0.5))
    m.box('flag', 'flag', -10.1, -10.1, 31.4, 39.4, 0.5, 14.5, 'flagc', only=('east', 'west'), decal='flag', dens=1.2)
    for i, (x, mat) in enumerate(((-2.6, 'potion'), (0.0, 'potion2'), (2.6, 'potion'))):     # potions on the belt
        m.box('body', f'bottle{i}', x - 0.9, x + 0.9, 11.2, 13.8, -4.6, -3.6, mat, decal='bottle')
        m.box('body', f'cork{i}', x - 0.45, x + 0.45, 13.8, 14.6, -4.35, -3.85, 'cork')

    def decal(p):
        r = tower_decal(p)
        if r is not None:
            return r
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'flag':
            return flag(p, 'cross', 0.5, 14.5, 31.4, 39.4)
        if d == 'bottle':
            return p.pal['glass'] if q[1] - c['o'][1] > 1.6 else lit(p.col)          # the potion glows under the glass neck
        return p.col
    m.decal = decal
    return m


def t_sniper():
    m, top = tower_gear('gear_sniper', PILLAGER, dict(disc='#8a5aa8', hat='#6a7a46', hat2='#4e5a32', ghillie='#5e7a3e', ghillie2='#465e2e', gun='#2c2c34',
                                                       wood='#7a5232', bag='#a89060'))
    ring(m, 'tds_base', 'bag', 10.3, PED_TOP - 0.2, PED_TOP + 3.6, 'bag')
    m.box('head', 'brim', -6.6, 6.6, 31.8, 32.9, -6.6, 6.6, 'hat')
    m.box('head', 'crown', -4.6, 4.6, 32.8, 36.0, -4.6, 4.6, 'hat', decal='hatband')
    m.box('body', 'cape', -4.9, 4.9, 8.0, 24.9, -3.9, 3.9, 'ghillie', decal='ghillie')
    rifle_on_body(m, -1.6, 19.0, -4.0, 22.0, scope=True)

    def decal(p):
        r = tower_decal(p)
        if r is not None:
            return r
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'hatband':
            return p.pal['hat2'] if p.face != 'up' and p.v > 0.6 else p.col
        if d == 'ghillie':
            if p.face in ('up', 'down') or (p.face == 'north' and abs(q[0]) < 2.2):
                return None
            yb = q[1] - c['o'][1]
            if yb < 1.4 * abs(math.sin((q[2] if p.face in ('east', 'west') else q[0]) * 2.3)):
                return None
            return p.pal['ghillie2'] if (q[0] * 1.3 + q[1] * 0.9 + q[2]) % 2.6 < 1.0 else p.col
        if d == 'gunmetal':
            return mul(p.col, 1.25) if p.face != 'down' and p.v < 0.2 else p.col
        if d == 'scope':
            return lit((120, 220, 255)) if p.face == 'north' and 0.25 < p.u < 0.75 and 0.25 < p.v < 0.75 else p.col
        return p.col
    m.decal = decal
    return m


TOWER_GEAR = {0: t_gunner, 1: t_medic, 4: t_sniper}


# ------------------------------------------------------------------------------------------------ unit gear (figure units)
def u_soldier():
    m = gear('gear_soldier', PILLAGER, dict(helmet='#5a6a3a', helmet2='#46542c', gun='#2c2c34', wood='#7a5232', pack='#6e7a4a'))
    m.box('head', 'helmet', -4.7, 4.7, 30.4, 34.9, -4.7, 4.7, 'helmet', decal='helmet')
    m.box('body', 'pack', -3.4, 3.4, 14.0, 23.0, 3.6, 6.4, 'pack')
    rifle_on_body(m, -1.6, 19.0, -4.0, 14.0)

    def decal(p):
        if p.cube['decal'] == 'helmet':
            return None if p.face == 'down' else (p.pal['helmet2'] if p.face != 'up' and p.v > 0.7 else p.col)
        if p.cube['decal'] == 'gunmetal':
            return mul(p.col, 1.25) if p.face != 'down' and p.v < 0.2 else p.col
        return p.col
    m.decal = decal
    return m


def u_skeleton():
    m = gear('gear_skeleton', SKELETON, dict(rust='#8a5a3a', rust2='#6a4228', wood='#7a5232', iron='#8a8e96'))
    m.box('head', 'helmet', -4.6, 4.6, 29.6, 33.6, -4.6, 4.6, 'rust', decal='helmet')
    m.box('leftArm', 'shield', 6.3, 6.9, 13.0, 21.0, -3.0, 3.0, 'wood', decal='shield')

    def decal(p):
        d, q = p.cube['decal'], p.local()
        if d == 'helmet':
            return None if p.face == 'down' else (p.pal['rust2'] if (q[0] * 2 + q[2] + q[1]) % 2.4 < 0.5 else p.col)
        if d == 'shield':
            return p.pal['iron'] if p.face in ('east', 'west') and (abs(q[1] - 17.0) < 0.4 or abs(q[2]) < 0.4) else p.col
        return p.col
    m.decal = decal
    return m


UNIT_GEAR = {1: u_soldier, 3: u_skeleton}
