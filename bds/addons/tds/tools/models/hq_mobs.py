"""Original-level gear for the enemies and the figure units, on their vanilla bodies (vanilla.py rigs). Weapons ride the hand:
a blade or haft runs down the arm's own -y from the hand, so when the walk holds the arm out it points ahead."""
from __future__ import annotations

import math

from hq_parts import along, helmet, hq_decal, octa, rifle, vest
from kit import mix, mul
from parts import emblem_px, lit
from vanilla import DROWNED, HUMANOID, PHANTOM, PIGLIN, PILLAGER, SKELETON, VEX, gear

METAL = dict(steel='#b8bec8', steel2='#7a808c', iron='#4a4652', dark='#2a2630', gold='#d8a838', gun='#2c2c34', gun2='#4a4a54', flash='#fff0a0')


def mob(name, rig, mats, **kw):
    m = gear(name, rig, {**METAL, **mats}, density=kw.pop('density', 2.0), width=kw.pop('width', 256), **kw)
    m.glow |= {'glow', 'flash'}
    m.emblem = None
    return m


def with_shared(own):
    def decal(p):
        r = hq_decal(p)
        if r is not False:
            return r
        return own(p)
    return decal


def ragged(p, q, c, depth=1.2, k=1.7):
    """a torn lower edge, by position"""
    return (q[1] - c['o'][1]) < depth * abs(math.sin(along(p, q) * k))


def blade(m, bone, parent, x, top, length, width=1.6, mat='steel', guard='gold', tag='sword'):
    """a sword in the hand: grip in the fist, a cross-guard, the blade running down the arm's -y"""
    m.bone(bone, parent, (x, top, 0))
    m.box(bone, f'{tag}_grip', x - 0.35, x + 0.35, top - 0.2, top + 2.4, -0.35, 0.35, 'dark')
    m.box(bone, f'{tag}_guard', x - 0.45, x + 0.45, top - 0.75, top - 0.2, -2.0, 2.0, guard)
    m.box(bone, f'{tag}_blade', x - 0.22, x + 0.22, top - 0.75 - length, top - 0.7, -width / 2, width / 2, mat, decal='blade')
    m.box(bone, f'{tag}_pommel', x - 0.5, x + 0.5, top + 2.4, top + 3.0, -0.5, 0.5, guard)


# ------------------------------------------------------------------------------------------------ 0 walker
def g_walker():
    m = mob('gear_walker', HUMANOID, dict(vest='#7a3e2e', vest2='#5a2a20', hair='#2e2a26', band='#d8d0b8', band2='#a89c80', belt='#3a2a1e',
                                          buckle='#a8a8a0', patch='#6a5a8a'))
    m.box('head', 'hair', -4.35, 4.35, 30.6, 32.9, -4.35, 4.35, 'hair', decal='hair')
    m.box('head', 'tuft', -1.0, 1.0, 32.0, 34.2, -2.6, -0.6, 'hair', rot=(-25, 0, 18), pivot=(0, 32.6, -1.6))
    m.box('head', 'tuft2', 1.2, 2.8, 32.2, 33.8, 0.4, 2.4, 'hair', rot=(10, 0, -24), pivot=(2.0, 32.6, 1.4))
    m.box('body', 'vest', -4.45, 4.45, 13.2, 24.4, -2.45, 2.45, 'vest', decal='vest')
    m.rise_x('body', 'collar_l', (0.9, 24.9), (3.9, 23.9), -2.75, -1.75, 0.5, 'vest', decal='collar')
    m.mirror('collar_l', 'collar_r')
    m.box('body', 'belt', -4.2, 4.2, 11.9, 13.3, -2.25, 2.25, 'belt', decal='belt')
    m.pair('body', 'body', 'pocket', 2.6, 4.0, 14.0, 16.2, -2.75, -2.4, 'vest2')
    m.box('leftArm', 'wrap', 3.7, 8.3, 14.5, 18.5, -2.3, 2.3, 'band', decal='wrap')
    m.bone('band_end', 'leftArm', (8.35, 16.0, 0))
    m.box('band_end', 'band_end', 8.35, 8.35, 12.0, 16.5, -0.9, 0.9, 'band', only=('east', 'west'), decal='tatter')
    m.box('rightLeg', 'patch', -3.3, -1.1, 4.4, 7.2, -2.3, -2.05, 'patch', decal='patch')
    m.box('leftLeg', 'cuff', -0.42, 4.22, 0.0, 3.4, -2.35, 2.3, 'vest2', decal='cuff')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'hair':
            if p.face == 'down' or (p.face != 'up' and ragged(p, q, c, 0.9, 1.9)) or (p.face == 'north' and q[1] - c['o'][1] < 1.6):
                return None
            return p.col
        if d == 'vest':
            if p.face in ('up', 'down') or (p.face == 'north' and abs(q[0]) < 1.4) or ragged(p, q, c, 1.2, 1.7):
                return None
            return p.pal['vest2'] if int(q[1] * 1.3) % 3 == 0 else p.col
        if d == 'collar':
            return mul(p.col, 0.85) if p.face != 'up' else p.col
        if d == 'belt':
            if p.face in ('up', 'down'):
                return None
            return p.pal['buckle'] if p.face == 'north' and abs(q[0]) < 0.8 else p.col
        if d == 'wrap':
            return None if p.face in ('up', 'down') else (p.pal['band2'] if int((q[1] + q[2] * 0.4) * 1.6) % 2 else p.col)
        if d == 'tatter':
            return None if q[1] - c['o'][1] < 1.5 * abs(math.sin(q[2] * 3.0)) else p.col
        if d == 'patch':
            return mul(p.col, 0.7) if p.u < 0.12 or p.u > 0.88 or p.v < 0.12 or p.v > 0.88 else p.col     # stitched round
        if d == 'cuff':
            if p.face in ('up', 'down') or ragged(p, q, c, 1.0, 2.2):
                return None
            return p.col
        return p.col
    m.decal = with_shared(own)
    return m


# ------------------------------------------------------------------------------------------------ 1 armored knight
def g_armored():
    m = mob('gear_armored', HUMANOID, dict(metal='#a0a6b2', metal2='#6e7480', trim='#d0a83c', glow='#ff4a3c', plume='#c83838', plume2='#8a2020',
                                           shield='#3c5ab4', wood='#6a4a2e'))
    octa(m, 'head', 'helm', 'y', (0, 0), 23.7, 32.7, 4.7, 'metal', decal='helm', dens={'north': 2.5})
    m.box('head', 'crest', -0.5, 0.5, 32.55, 34.4, -4.0, 3.8, 'trim')
    m.bone('plume', 'head', (0, 34.0, 0))
    m.box('plume', 'plume', 0, 0, 33.6, 38.6, -2.4, 6.4, 'plume', only=('east', 'west'), decal='plume', dens=2.0)
    m.box('body', 'plate', -4.67, 4.67, 13.6, 24.6, -2.65, 2.65, 'metal', decal='plate')
    m.box('body', 'fauld', -4.5, 4.5, 11.4, 14.0, -2.95, 2.95, 'metal2', decal='band')
    for sx in (1, -1):
        x0, x1 = sorted((sx * 0.4, sx * 4.3))
        m.box('body', f'tasset_{"l" if sx > 0 else "r"}', x0, x1, 7.6, 11.6, -3.05, -2.6, 'metal', rot=(9, 0, 0), pivot=((x0 + x1) / 2, 11.6, -2.8), decal='tasset')
    m.rise_x('leftArm', 'pauldron_l', (3.4, 25.3), (8.9, 23.4), -2.8, 2.8, 1.2, 'metal', decal='edge')
    m.rise_x('leftArm', 'pauldron2_l', (4.2, 26.4), (8.2, 25.1), -2.2, 2.2, 0.8, 'metal2', decal='edge')
    m.mirror('pauldron_l', 'pauldron_r', 'rightArm')
    m.mirror('pauldron2_l', 'pauldron2_r', 'rightArm')
    m.box('leftArm', 'gauntlet_l', 3.6, 8.4, 11.6, 15.6, -2.4, 2.4, 'metal2', decal='band')
    m.mirror('gauntlet_l', 'gauntlet_r', 'rightArm')
    m.box('leftLeg', 'greave_l', -0.5, 4.3, -0.33, 6.47, -2.48, 2.42, 'metal', decal='band')
    m.box('rightLeg', 'greave_r', -4.3, 0.5, -0.3, 6.5, -2.45, 2.45, 'metal', decal='band')
    blade(m, 'sword', 'rightArm', -6.0, 12.4, 13.0)
    m.bone('shield', 'leftArm', (8.4, 17, 0))
    m.box('shield', 'shield', 8.35, 8.95, 10.6, 22.4, -3.8, 3.8, 'shield', decal='kite', dens={'west': 2.5})

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'helm':
            if p.face == 'down':
                return None
            w = p.inbone()                                       # the slabs turn: the visor goes where the FRONT is
            if 4.4 < yb < 5.8 and w[2] < -3.6:
                return lit(p.pal['glow']) if abs(abs(w[0]) - 1.9) < 0.7 and 4.7 < yb < 5.5 else p.pal['dark']
            if yb < 3.2 and w[2] < -4.0 and abs(w[0]) < 2.4 and int(w[0] * 2 + 9) % 2 == 0:
                return p.pal['dark']
            return p.col
        if d == 'plume':
            a = (q[2] + 2.4) / 8.8
            hh = q[1] - c['o'][1]
            if hh > 4.6 * math.sin(math.pi * min(1.0, a)) ** 0.6 + 0.4 or (a > 0.75 and int(hh * 2.5) % 2 == 0):
                return None
            return p.pal['plume2'] if int(a * 9) % 2 else p.col
        if d == 'plate':
            if p.face in ('up', 'down'):
                return None
            if c['s'][1] - yb < 0.6:
                return p.pal['trim']
            if p.face == 'north' and (p.u < 0.1 or p.u > 0.9) and (p.v < 0.12 or p.v > 0.88):
                return p.pal['dark']
            return mul(p.col, 1.12) if p.face == 'north' and abs(q[0]) < 0.4 else p.col
        if d == 'tasset':
            return mul(p.col, 0.82) if int(yb * 1.2) % 2 else p.col
        if d == 'edge':
            return p.pal['trim'] if p.face != 'up' and p.v > 0.55 else p.col
        if d == 'band':
            return None if p.face in ('up', 'down') else (p.pal['dark'] if 0.3 < yb % 2.0 < 0.55 else p.col)
        if d == 'blade':
            return mul(p.col, 1.25) if abs(q[2]) > (c['s'][2] / 2 - 0.25) else (mul(p.col, 0.8) if abs(q[2]) < 0.15 else p.col)
        if d == 'kite':
            if p.face in ('east', 'west'):
                w = c['s'][2] / 2 * (1 - max(0.0, (c['o'][1] + 4.0 - q[1]) / 4.0) ** 1.2 * 0.95)
                if abs(q[2]) > w:
                    return None                                  # the kite shield's point
                if abs(q[2]) > w - 0.5 or c['o'][1] + c['s'][1] - q[1] < 0.5:
                    return p.pal['trim']
                return p.pal['trim'] if abs(q[2]) < 0.4 or abs(q[1] - 18.4) < 0.4 else p.col      # a cross on the face
            return p.pal['wood']
        return p.col
    m.decal = with_shared(own)
    return m


# ------------------------------------------------------------------------------------------------ 2 boss
def g_boss():
    m = mob('gear_boss', SKELETON, dict(gold2='#a87a20', horn='#e8dcc0', glow='#ff8a2c', cape='#7a1a24', cape2='#5a1018', wood='#5a3a24', axe='#9aa0aa'))
    m.box('head', 'crown', -4.6, 4.6, 30.2, 31.9, -4.6, 4.6, 'gold', decal='crown')
    for i, x in enumerate((-2.6, 0.0, 2.6)):
        m.box('head', f'tine{i}', x - 0.55, x + 0.55, 31.0, 33.6 + (0.8 if x == 0 else 0), -4.95, -4.05, 'gold', rot=(0, 0, 45), pivot=(x, 32.3, -4.5))
    m.rise_x('head', 'horn_l', (3.4, 29.2), (8.4, 34.6), -0.85, 0.85, 1.5, 'horn', decal='ring')
    m.rise_x('head', 'horntip_l', (8.0, 34.2), (10.0, 37.4), -0.5, 0.5, 0.9, 'horn', decal='ring')
    m.mirror('horn_l', 'horn_r')
    m.mirror('horntip_l', 'horntip_r')
    m.box('body', 'core', -1.5, 1.5, 18.2, 21.0, -2.75, -2.25, 'glow')
    m.box('body', 'chestplate', -4.4, 4.4, 15.0, 24.4, -2.6, -2.05, 'iron', decal='ribs')
    m.box('body', 'belt', -4.55, 4.55, 12.0, 13.8, -2.55, 2.55, 'iron', decal='belt')
    m.bone('cape', 'body', (0, 24.2, 2.6))
    m.box('cape', 'cape', -4.8, 4.8, 4.0, 24.2, 2.6, 2.6, 'cape', only=('north', 'south'), decal='cape', dens=1.5)
    for side, bone, x0 in ((1, 'leftArm', 3.6), (-1, 'rightArm', -6.4)):
        cx = side * 5.0
        for i, (zc, tilt) in enumerate(((-0.8, 26), (1.0, 14))):
            m.box(bone, f'spike{i}_{bone}', cx - 0.6, cx + 0.6, 23.4, 26.6, zc - 0.6, zc + 0.6, 'horn', rot=(0, 0, side * tilt), pivot=(cx, 24.0, zc))
        m.box(bone, f'cuff_{bone}', x0, x0 + 2.8, 12.4, 15.0, -1.4, 1.4, 'iron')
        lo, hi = sorted((side * 3.4, side * 7.6))
        m.box(bone, f'pad_{bone}', lo, hi, 22.6, 24.4, -1.9, 1.9, 'iron', decal='edge')
    m.bone('axe', 'rightArm', (-5.0, 12.4, 0))
    m.box('axe', 'haft', -5.4, -4.6, -8.0, 14.6, -0.4, 0.4, 'wood', decal='haft')
    m.box('axe', 'axehead', -5.0, -5.0, -9.6, -2.0, 0.3, 7.6, 'axe', only=('east', 'west'), decal='axeblade', dens=2.0)
    m.box('axe', 'spikeback', -5.35, -4.65, -6.6, -5.0, -3.2, -0.3, 'axe')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'crown':
            if p.face == 'down':
                return None
            return lit((255, 74, 60)) if p.face == 'north' and abs(q[0]) < 0.55 else (p.pal['gold2'] if p.face == 'up' else p.col)
        if d == 'ring':
            return mul(p.col, 0.78) if int(q[0] * 1.8) % 2 == 0 else p.col
        if d == 'ribs':
            if p.face != 'north':
                return None if p.face in ('up', 'down') else p.col
            return p.pal['dark'] if abs(q[0]) > 0.5 and int((q[1] - c['o'][1]) * 1.1) % 2 == 0 else p.col
        if d == 'belt':
            return None if p.face in ('up', 'down') else (p.pal['gold'] if p.face == 'north' and abs(q[0]) < 1.1 else p.col)
        if d == 'cape':
            yy = q[1] - c['o'][1]
            if yy < 1.6 * abs(math.sin(q[0] * 1.3)):
                return None
            if abs(q[0]) > 4.3 or yy < 1.6 * abs(math.sin(q[0] * 1.3)) + 0.6:
                return p.pal['gold']                            # a gold hem round the cape
            return p.pal['cape2'] if (abs(q[0]) * 1.1) % 2.2 < 0.5 else p.col
        if d == 'edge':
            return p.pal['gold'] if p.face != 'up' and p.v > 0.6 else p.col
        if d == 'haft':
            return mul(p.col, 0.8) if int(q[1] * 1.4) % 3 == 0 else p.col
        if d == 'axeblade':
            a = (q[2] - 0.3) / 7.3
            yy = (q[1] + 9.6) / 7.6
            edge = 0.55 + 0.45 * math.sin(math.pi * yy)
            if a > edge or a < 0:
                return None
            return mul(p.col, 1.3) if a > edge - 0.12 else (p.pal['iron'] if a < 0.18 else p.col)
        return p.col
    m.decal = with_shared(own)
    return m


# ------------------------------------------------------------------------------------------------ 3 runner
def g_runner():
    m = mob('gear_runner', DROWNED, dict(strap='#2a2630', scarf='#ff6a4a', scarf2='#c84030', shoe='#f0ece0', sole='#e8643c', hair='#e8643c',
                                         wrist='#ffd650', bib='#f0ece0'))
    m.box('head', 'strap', -4.45, 4.45, 27.0, 28.8, -4.45, 4.45, 'strap', decal='strap')
    for sx in (-1, 1):
        octa(m, 'head', f'lens{"l" if sx > 0 else "r"}', 'z', (sx * 2.0, 27.9), -5.1, -4.35, 1.25, 'gun', decal='goggle')
    m.slope('head', 'pony', -1.0, 1.0, (3.0, 31.4), (8.6, 27.6), 1.6, 'hair', extend=(0, 0.3))
    m.box('body', 'wrap', -4.5, 4.5, 22.4, 24.6, -2.5, 2.5, 'scarf', decal='wrap')
    m.bone('scarf', 'body', (0, 23.6, 2.5))
    m.box('scarf', 'tail', 0, 0, 15.0, 24.0, 2.5, 11.5, 'scarf', only=('east', 'west'), decal='tail', dens=1.5)
    m.box('body', 'bib', -2.6, 2.6, 15.0, 19.6, -2.75, -2.5, 'bib', decal='bib')
    m.box('leftLeg', 'shoe_l', -0.45, 4.75, -0.43, 2.57, -2.78, 2.42, 'shoe', decal='shoe')
    m.box('rightLeg', 'shoe_r', -4.75, 0.45, -0.4, 2.6, -2.75, 2.45, 'shoe', decal='shoe')
    m.box('leftArm', 'wrist_l', 3.55, 8.45, 12.6, 14.0, -2.45, 2.45, 'wrist', decal='strap')
    m.mirror('wrist_l', 'wrist_r', 'rightArm')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'wrap':
            return None if p.face in ('up', 'down') else (p.pal['scarf2'] if int((q[0] + q[2] + 20) * 0.9) % 2 else p.col)
        if d == 'tail':
            a = (q[2] - 2.5) / 9.0
            if yb < 2.0 + 2.2 * math.sin(a * 5.5) * a or (a > 0.86 and int(yb * 1.2) % 2 == 0):
                return None
            return p.pal['scarf2'] if int(a * 7) % 2 else p.col
        if d == 'shoe':
            return p.pal['sole'] if yb < 0.8 else (p.pal['scarf'] if p.face in ('east', 'west') and abs(yb - 1.6) < 0.3 else p.col)
        if d == 'bib':
            if p.face != 'north':
                return p.col
            return p.pal['scarf'] if (p.u < 0.08 or p.u > 0.92 or p.v < 0.1 or p.v > 0.9) else emblem_px(p, 'star', p.col, 0.25, 0.75, 0.15, 0.85)
        return p.col
    m.decal = with_shared(own)
    return m


# ------------------------------------------------------------------------------------------------ 4 hidden
def g_hidden():
    m = mob('gear_hidden', VEX, dict(cloak='#3c2850', cloak2='#2a1c3a', glow='#c070ff', cage='#3a3440'),
            variants={'': {'_alpha': {'*': 170, 'glow': 255}}}, emissive=False, density=3.0, width=128)
    m.box('head', 'hood', -3.0, 3.0, 5.6, 11.6, -3.0, 3.0, 'cloak', decal='hood')
    m.slope('head', 'peak', -1.2, 1.2, (0.6, 11.6), (4.6, 9.6), 1.0, 'cloak', extend=(0, 0.2))
    m.box('body', 'robe', -2.2, 2.2, -1.6, 5.6, -1.6, 1.6, 'cloak', decal='robe')
    m.bone('lantern', 'rightArm', (-2.0, 2.2, 0))
    m.box('lantern', 'chain', -2.1, -1.9, 0.6, 2.4, -0.1, 0.1, 'cage')
    octa(m, 'lantern', 'cage', 'y', (-2.0, 0.0), -1.4, 0.6, 0.75, 'cage', decal='cage')
    m.box('lantern', 'flame', -2.35, -1.65, -1.0, 0.2, -0.35, 0.35, 'glow')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'hood':
            return None if p.face == 'down' or (p.face == 'north' and abs(q[0]) < 2.1 and yb < 4.6) else p.col
        if d == 'robe':
            if p.face in ('up', 'down') or yb < 0.6 + 1.0 * abs(math.sin(along(p, q) * 2.6)):
                return None
            return p.pal['cloak2'] if int((q[0] + q[2] + 9) * 1.6) % 2 else p.col
        if d == 'cage':
            return p.col if p.face in ('up', 'down') or p.u < 0.25 or p.u > 0.75 else None     # see the flame through the bars
        return p.col
    m.decal = with_shared(own)
    return m


# ------------------------------------------------------------------------------------------------ 5 flying
def g_flying():
    m = mob('gear_flying', PHANTOM, dict(horn='#e8dcc8', bone='#b8c4d0', web='#5e3a7e', mask='#d8d0c0'))
    for side, tag in ((1, 'l'), (-1, 'r')):
        x0, x1 = sorted((side * 1.2, side * 2.6))
        m.slope('head', f'horn_{tag}', x0, x1, (-10.4, 25.0), (-6.0, 27.6), 0.9, 'horn')
    m.box('head', 'mask', -4.3, 3.3, 21.7, 25.3, -12.35, -11.95, 'mask', decal='mask')
    for i, z in enumerate((-6.0, -3.0, 0.0)):
        m.box('body', f'spine{i}', -0.9, 0.1, 25.6, 27.8, z - 0.6, z + 0.6, 'bone', rot=(-30, 0, 0), pivot=(-0.4, 26.0, z))
    m.box('wing0', 'plate0', 2.0, 8.0, 25.9, 26.4, -8.3, -7.3, 'bone')
    m.box('wing1', 'plate1', -9.0, -3.0, 25.9, 26.4, -8.3, -7.3, 'bone')
    m.box('wingtip0', 'tipplate0', 8.0, 18.0, 25.95, 26.35, -8.25, -7.55, 'bone')
    m.box('wingtip1', 'tipplate1', -19.0, -9.0, 23.95, 24.35, -8.25, -7.55, 'bone')
    m.box('tailtip', 'spade', -1.8, 1.8, 25.0, 25.0, 11.0, 15.0, 'web', only=('up', 'down'), decal='spade')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'spade':
            a, b = abs(q[0] + 0.5) / 1.8, (q[2] - 11.0) / 4.0
            return None if a > 1.0 - abs(b - 0.45) * 1.6 else p.col
        if d == 'mask':
            if p.face == 'north' and 1.0 < q[1] - c['o'][1] < 2.4 and abs(abs(q[0] + 0.5) - 2.0) < 0.9:
                return None                                     # eye holes: the phantom's own eyes show through
            return p.col
        return p.col
    m.decal = with_shared(own)
    return m


# ------------------------------------------------------------------------------------------------ 6 heavy
def g_heavy():
    m = mob('gear_heavy', PIGLIN, dict(armor='#76804e', armor2='#565e38', orange='#e88a2c', metal='#8a8e96', metal2='#5e626a', hose='#2e2c30',
                                       glass='#2a3a4a'))
    m.box('head', 'helm', -5.6, 5.6, 23.6, 32.7, -4.6, 4.6, 'armor', decal='helm', dens={'north': 2.0})
    m.box('head', 'ridge', -0.6, 0.6, 32.6, 33.6, -4.4, 4.4, 'armor2')
    m.box('head', 'mask', -2.6, 2.6, 23.0, 26.4, -5.9, -4.55, 'metal2', decal='grille')
    for sx in (-1, 1):
        octa(m, 'head', f'can{"l" if sx > 0 else "r"}', 'z', (sx * 3.4, 24.4), -6.6, -4.6, 0.95, 'hose', decal='can')
    vest(m, 'body', -4.75, 4.75, 13.0, 24.7, -2.75, 2.75, 'armor', 'armor2', radio=False, tag='vest')
    m.box('body', 'pack', -3.6, 3.6, 14.0, 23.4, 2.8, 6.2, 'metal', decal='pack')
    m.pair('body', 'body', 'tank', 0.6, 3.2, 18.0, 27.0, 6.15, 7.8, 'orange', decal='tank')
    m.pair('body', 'body', 'hose', 1.6, 2.2, 25.0, 30.0, 4.0, 4.6, 'hose', rot=(-48, 0, 0), pivot=(1.9, 27.0, 6.9))
    m.box('leftarm', 'shield', 2.6, 9.8, 8.4, 21.4, -3.5, -2.8, 'metal', decal='shield', dens={'north': 2.5})
    m.box('leftleg', 'pad_l', -0.45, 4.45, 4.97, 7.57, -2.63, 2.42, 'metal2')
    m.box('rightleg', 'pad_r', -4.45, 0.45, 5.0, 7.6, -2.6, 2.45, 'metal2')
    m.bone('baton', 'rightarm', (-6.0, 12.4, 0))
    m.box('baton', 'baton', -6.4, -5.6, 1.0, 14.0, -0.4, 0.4, 'hose', decal='haft')
    m.box('baton', 'baton_t', -6.9, -6.4, 9.8, 10.6, -0.3, 0.3, 'hose')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'helm':
            if p.face == 'down':
                return None
            if p.face == 'north' and 3.6 < yb < 5.8 and abs(q[0]) < 4.6:
                return lit((255, 154, 44)) if 3.9 < yb < 5.5 and abs(q[0]) < 4.2 else p.pal['dark']
            return p.col
        if d == 'grille':
            return mul(p.col, 0.55) if p.face == 'north' and int(q[0] * 2 + 9) % 2 == 0 and 0.6 < yb < 2.8 else p.col
        if d == 'can':
            return mul(p.col, 1.4) if p.face == 'north' else p.col
        if d == 'pack':
            return p.pal['metal2'] if int(q[1] * 1.2) % 3 == 0 else p.col
        if d == 'tank':
            return mul(p.col, 0.8) if p.face != 'up' and abs(yb - 6.0) < 0.4 else p.col
        if d == 'shield':
            if p.face == 'north':
                if 7.6 < yb < 10.4 and abs(q[0] - 6.2) < 2.2:
                    return p.pal['glass'] if abs(q[0] - 6.2) < 2.0 and 7.8 < yb < 10.2 else p.pal['dark']     # the viewport
                stripe = (q[0] + q[1] * 0.8) % 3.0 < 1.2
                return p.pal['orange'] if stripe and (yb < 2.2 or yb > c['s'][1] - 1.8) else p.col
            return p.col
        if d == 'haft':
            return mul(p.col, 1.3) if yb > c['s'][1] - 3.2 else p.col
        return p.col
    m.decal = with_shared(own)
    return m


# ------------------------------------------------------------------------------------------------ 7 frost
def g_frost():
    m = mob('gear_frost', SKELETON, dict(ice='#9ae4ff', ice2='#5ab4e8', ice3='#e0f8ff', glow='#d8ffff', wood='#5a6a7a'))
    for i, (x, tilt) in enumerate(((-2.4, -16), (0.0, 0), (2.4, 16))):
        m.box('head', f'spike{i}', x - 0.6, x + 0.6, 31.8, 35.6 - abs(x) * 0.4, -0.6, 0.6, 'ice3', rot=(0, 0, tilt), pivot=(x, 32.0, 0), decal='ice')
    m.box('body', 'chest', -3.8, 3.8, 15.0, 23.6, -2.6, -2.05, 'ice2', decal='ice')
    m.box('body', 'shard0', -1.2, 1.2, 20.0, 27.0, 1.6, 3.6, 'ice', rot=(-26, 0, 0), pivot=(0, 22.0, 2.6), decal='ice')
    m.box('body', 'shard1', -3.6, -1.8, 17.0, 22.4, 1.6, 3.2, 'ice', rot=(-18, 0, -14), pivot=(-2.7, 18.0, 2.4), decal='ice')
    m.box('body', 'shard2', 1.8, 3.6, 16.5, 21.6, 1.6, 3.2, 'ice', rot=(-18, 0, 14), pivot=(2.7, 17.5, 2.4), decal='ice')
    for side, bone in ((1, 'leftArm'), (-1, 'rightArm')):
        cx = side * 5.0
        m.box(bone, f'icicle_{bone}', cx - 0.5, cx + 0.5, 9.0, 13.0, -0.5, 0.5, 'ice', rot=(0, 45, 0), pivot=(cx, 11.0, 0), decal='ice')
    m.rise_x('leftArm', 'frost_leftArm', (3.2, 24.8), (7.6, 23.2), -1.6, 1.6, 0.8, 'ice2', decal='ice')
    m.mirror('frost_leftArm', 'frost_rightArm', 'rightArm')
    m.bone('mace', 'rightArm', (-5.0, 12.4, 0))
    m.box('mace', 'mace_haft', -5.35, -4.65, -2.0, 14.0, -0.35, 0.35, 'wood')
    octa(m, 'mace', 'mace_head', 'y', (-5.0, 0.0), -5.0, -1.6, 1.5, 'ice', decal='ice')
    for i in range(4):
        a = 90 * i + 45
        m.box('mace', f'mace_spike{i}', -5.4, -4.6, -4.0, -2.6, -2.9, -1.3, 'ice3', rot=(0, a, 0), pivot=(-5.0, -3.3, 0), decal='ice')

    def own(p):
        q = p.local()
        k = (q[1] * 0.9 + along(p, q) * 1.7) % 2.4
        return lit(p.pal['glow']) if k < 0.3 else p.pal['ice2'] if k > 1.9 else p.col
    m.decal = with_shared(own)
    return m


ENEMY_GEAR = [g_walker, g_armored, g_boss, g_runner, g_hidden, g_flying, g_heavy, g_frost]


# ------------------------------------------------------------------------------------------------ figure units
def u_soldier():
    m = mob('gear_soldier', PILLAGER, dict(helmet='#5a6a3a', band='#3e4a28', vest='#b49a64', pouch='#8a7448', wood='#7a5232', pack='#6e7a4a'))
    helmet(m, 'head', 0, 0, 30.4, 34.6, 4.75, 'helmet', band='band', goggles=True)
    vest(m, 'body', -4.95, 4.95, 14.0, 24.9, -3.95, 3.95, 'vest', 'pouch', radio=False, tag='vest')
    m.box('body', 'pack', -3.4, 3.4, 14.4, 23.0, 3.9, 6.8, 'pack', decal='pouch')
    m.bone('gun', 'body', (-1.6, 19.0, -4.6))
    rifle(m, 'rifle', 'gun', (-1.6, 19.0, -4.6), 'ar', sight='dot')
    m.decal = with_shared(lambda p: p.col)
    return m


def u_skeleton():
    m = mob('gear_skeleton', SKELETON, dict(rust='#8a5a3a', rust2='#6a4228', wood='#7a5232', iron='#8a8e96'))
    octa(m, 'head', 'helmet', 'y', (0, 0), 29.6, 33.6, 4.6, 'rust', decal='rusty')
    m.box('leftArm', 'shield', 6.3, 6.9, 13.0, 21.0, -3.0, 3.0, 'wood', decal='shield')
    blade(m, 'sword', 'rightArm', -5.0, 12.4, 9.0, mat='rust', guard='iron', tag='blade')

    def own(p):
        d, q = p.cube['decal'], p.local()
        if d == 'rusty':
            return None if p.face == 'down' else (p.pal['rust2'] if (q[0] * 2 + q[2] + q[1]) % 2.4 < 0.5 else p.col)
        if d == 'shield':
            return p.pal['iron'] if p.face in ('east', 'west') and (abs(q[1] - 17.0) < 0.4 or abs(q[2]) < 0.4) else p.col
        if d == 'blade':
            return mul(p.col, 1.2) if (q[1] * 1.7) % 2 < 0.4 else p.col
        return p.col
    m.decal = with_shared(own)
    return m


UNIT_GEAR = {1: u_soldier, 3: u_skeleton}
