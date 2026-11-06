"""The towers that are buildings or machines, beside hq.py's farm, mortar, barracks and frost spire: original designs made
from what each tower is (a DJ booth, a tesla coil, a gunship on its pad, a gatling nest, an automatic turret, a mercenary
camp, an elves' cabin, a searchlight, a tank, a mech hangar, a tripod sentry, a void drill). Each changes with its level
(bones lvN_* / preN_*: entities.level_rules), aims with `turret`, recoils `gun`, opens `door` when it sends out a unit,
and moves its named parts in the idle animation (entities.MOTION: spin*, rotor, spinx, spinz, radar, hover, beat, flag).
"""
from __future__ import annotations

import math

from hq import building, decal_with, small_pedestal
from hq_parts import flash, octa, pips
from kit import mix, mul
from parts import emblem_px, flag, lit, ring


def _plates(m, bone, name, x0, x1, y, z0, z1, mat, n=4, h=0.5):
    """a row of n plates side by side along x (a skirt, a stage edge), each a hair proud of the last"""
    w = (x1 - x0) / n
    for i in range(n):
        m.box(bone, f'{name}{i}', x0 + w * i + 0.05, x0 + w * (i + 1) - 0.05, y, y + h, z0 - 0.02 * (i % 2), z1 + 0.02 * (i % 2), mat)


# ------------------------------------------------------------------------------------------------ DJ booth (support)
def dj_booth():
    m = building('tower_dj', dict(stage='#2a2238', stage2='#3e3256', booth='#22202a', metal2='#4a4a54', black='#121016', speaker='#2c2a34',
                                  cone='#5a5a66', neon='#ff4ad8', neon2='#4ad8ff', truss='#9aa0aa', ball='#d8dce6', lamp='#fff4c0', red='#e84848'))
    m.box('root', 'stage', -7.0, 7.0, 0.0, 1.0, -7.0, 7.0, 'stage', decal='stage')
    m.box('root', 'booth', -4.5, 4.5, 1.0, 5.0, -3.0, 0.6, 'booth', decal='booth', dens={'north': 3.0})
    m.box('root', 'desk', -4.8, 4.8, 5.0, 5.6, -3.3, 0.9, 'metal2', decal='metal')
    for side, x in (('l', 2.4), ('r', -2.4)):
        m.bone(f'spin_{side}', 'root', (x, 5.7, -1.2))
        octa(m, f'spin_{side}', f'record_{side}', 'y', (x, -1.2), 5.6, 5.95, 1.45, 'black', decal='record')
        m.box('root', f'tonearm_{side}', x + (1.5 if side == 'l' else -1.9), x + (1.9 if side == 'l' else -1.5), 5.6, 6.3, -2.6, -0.2, 'truss')
    m.box('root', 'mixer', -0.8, 0.8, 5.6, 6.0, -2.4, 0.0, 'metal2', decal='mixer')
    for side, sx in (('l', 1), ('r', -1)):
        x0, x1 = sorted((sx * 4.4, sx * 6.9))
        m.box('root', f'speaker_{side}', x0, x1, 1.0, 9.2, 1.4, 4.6, 'speaker', decal='speaker', dens={'north': 3.0})
        m.bone(f'beat_{side}', 'root', (sx * 5.65, 6.6, 1.4))
        octa(m, f'beat_{side}', f'cone_{side}', 'z', (sx * 5.65, 6.6), 0.7, 1.45, 0.95, 'cone', decal='cone')
    pips(m, 1.0, 6.4, bone='root', size=0.4)
    m.bone('lv1_neon', 'root', (0, 1.6, -3.05))
    m.box('lv1_neon', 'lv1_neon', -4.3, 4.3, 1.4, 1.8, -3.12, -3.04, 'neon', decal='neon')
    m.box('lv1_neon', 'lv1_neon2', -4.6, 4.6, 5.62, 5.82, -3.42, -3.36, 'neon2', decal='neon')
    m.bone('lv2_truss', 'root', (0, 12, 2.6))
    for sx in (1, -1):
        m.box('lv2_truss', f'lv2_post{sx}', sx * 6.0 - 0.3, sx * 6.0 + 0.3, 9.2, 13.0, 2.7, 3.3, 'truss', decal='truss')
    m.box('lv2_truss', 'lv2_beam', -6.4, 6.4, 12.6, 13.3, 2.65, 3.35, 'truss', decal='truss')
    for i, x in enumerate((-4.0, -1.3, 1.3, 4.0)):
        m.box('lv2_truss', f'lv2_lamp{i}', x - 0.6, x + 0.6, 11.4, 12.6, 2.3, 3.5, 'black', rot=(-30, 0, 0), pivot=(x, 12.6, 2.9), decal='lamp')
    m.bone('lv3_subs', 'root', (0, 1, 5.8))
    for side, sx in (('l', 1), ('r', -1)):
        x0, x1 = sorted((sx * 4.4, sx * 6.9))
        m.box('lv3_subs', f'lv3_sub_{side}', x0, x1, 1.0, 3.6, 4.8, 6.9, 'speaker', decal='speaker2')
    m.bone('lv4_spin', 'root', (0, 11.0, 2.9))
    octa(m, 'lv4_spin', 'lv4_ball', 'y', (0, 2.9), 9.6, 11.4, 1.25, 'ball', decal='disco')
    m.box('lv4_spin', 'lv4_ballrod', -0.12, 0.12, 11.4, 12.6, 2.78, 3.02, 'truss')
    m.bone('lv5_lasers', 'root', (0, 12.4, 2.9))
    for i, a in enumerate((-40, -15, 15, 40)):
        m.box('lv5_lasers', f'lv5_laser{i}', -0.06 + 0.01 * i, 0.06 + 0.01 * i, 12.4, 12.4 + 9.0, 2.9, 2.9, 'neon' if i % 2 else 'neon2',
              rot=(-35, 0, a), pivot=(0, 12.4, 2.9), only=('north', 'south'), decal='laser', dens=2.0)

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'stage':
            if p.face == 'up':
                return p.pal['stage2'] if (int((q[0] + 20) / 2.0) + int((q[2] + 20) / 2.0)) % 2 else p.col
            return mul(p.col, 0.8)
        if d == 'booth':
            if p.face == 'north':
                if 0.35 < p.v < 0.75 and 0.25 < p.u < 0.75:
                    return emblem_px(p, 'star', p.col, 0.38, 0.62, 0.3, 0.8)
                return p.pal['neon'] if abs(p.v - 0.2) < 0.04 else p.col
            return p.col
        if d == 'record':
            r = math.hypot(q[0] - (c['o'][0] + c['s'][0] / 2), q[2] + 1.2)
            return p.pal['red'] if p.face == 'up' and r < 0.45 else (mul(p.col, 1.6) if p.face == 'up' and int(r * 5) % 2 else p.col)
        if d == 'mixer':
            return lit(p.pal['neon2']) if p.face == 'up' and int((q[2] + 10) * 2) % 2 and abs(q[0]) < 0.5 else p.col
        if d in ('speaker', 'speaker2'):
            if p.face == 'north':
                r1 = math.hypot(p.u - 0.5, p.v - (0.28 if d == 'speaker' else 0.5))
                return mul(p.col, 0.6) if r1 < 0.3 and int(r1 * 20) % 2 else (p.pal['metal2'] if p.u < 0.06 or p.u > 0.94 else p.col)
            return p.col
        if d == 'cone':
            return mul(p.col, 0.7) if p.face == 'north' and math.hypot(p.u - 0.5, p.v - 0.5) < 0.2 else p.col
        if d == 'neon':
            return lit(p.col)
        if d == 'truss':
            return mul(p.col, 0.7) if int((q[0] + q[1] + 20) * 1.4) % 2 else p.col
        if d == 'lamp':
            return lit(p.pal['lamp']) if p.face == 'down' else p.col
        if d == 'disco':
            return lit(p.col) if (int((q[1]) * 2.5) + int((q[0] + q[2] + 20) * 2.5)) % 3 == 0 else mul(p.col, 0.85)
        if d == 'laser':
            a = (q[1] - c['o'][1]) / max(0.1, c['s'][1])
            return lit(p.col) if abs(q[0] - (c['o'][0] + c['s'][0] / 2)) < 0.05 + 0.0 * a else None
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ tesla coil (chain)
def tesla():
    m = building('tower_tesla', dict(disc='#4a78c8', metal='#8a909c', metal2='#4a4e58', copper='#c87a3a', copper2='#8a4e22', glow='#a8e8ff',
                                     arc='#c8f0ff', cap='#3a5a8a'), 'star')
    top = small_pedestal(m)
    octa(m, 'root', 'drum', 'y', (0, 0), top, top + 2.4, 4.0, 'metal2', decal='tube')
    octa(m, 'root', 'column', 'y', (0, 0), top + 2.4, top + 11.6, 1.2, 'copper', decal='coil')
    for i in range(4):
        octa(m, 'root', f'ring{i}', 'y', (0, 0), top + 3.4 + 2.0 * i, top + 3.9 + 2.0 * i, 2.0 - 0.15 * i, 'copper2', decal='metal')
    for i in range(3):
        a = math.radians(120 * i + 30)
        x, z = 3.2 * math.sin(a), -3.2 * math.cos(a)
        m.box('root', f'leg{i}', x - 0.35, x + 0.35, top, top + 4.6, z - 0.35, z + 0.35, 'metal', rot=(-14 * math.cos(a), 0, -14 * math.sin(a)), pivot=(x, top, z))
    for pre, r, y in (('pre4', 3.2, top + 11.6), ('lv4', 4.2, top + 12.4)):
        P = f'{pre}_pulse'
        m.bone(P, 'root', (0, y + 1.0, 0))
        octa(m, P, f'{pre}_torus', 'y', (0, 0), y, y + 2.0, r, 'metal', decal='torus')
        octa(m, P, f'{pre}_hub', 'y', (0, 0), y - 0.6, y + 2.6, 1.3, 'metal2')
        if pre == 'lv4':
            m.bone('lv4_col', 'root', (0, top + 12, 0))
            m.box('lv4_col', 'lv4_column', -0.85, 0.85, top + 11.4, top + 12.6, -0.85, 0.85, 'copper', rot=(0, 45, 0), pivot=(0, top + 12, 0))
        Z = f'{pre}_zap_flash'
        m.bone(Z, P, (0, y + 1.0, 0))
        for i in range(3):
            a = 120 * i
            m.box(Z, f'{pre}_zap{i}', -0.05, 0.05, y + 1.0, y + 1.0 + 7.0, 0, 0, 'arc', rot=(-62, a, 0), pivot=(0, y + 1.0, 0), only=('north', 'south'),
                  decal='arc', dens=3.0)
    m.bone('spin', 'root', (0, top + 15.4, 0))
    for i in range(3):
        a = 120 * i + 60
        m.box('spin', f'spark{i}', -1.0, 1.0, top + 15.0, top + 18.0, 0.0, 0.0, 'glow', rot=(0, a, 0), pivot=(0, top + 15.4, 0), only=('north', 'south'), decal='arc', dens=3.0)
    m.bone('lv1_rods', 'root', (0, top, 0))
    for i in range(4):
        a = math.radians(45 + 90 * i)
        x, z = 5.4 * math.sin(a), -5.4 * math.cos(a)
        m.box('lv1_rods', f'lv1_rod{i}', x - 0.25, x + 0.25, top - 0.2, top + 4.2, z - 0.25, z + 0.25, 'copper')
        m.box('lv1_rods', f'lv1_tip{i}', x - 0.45, x + 0.45, top + 4.2, top + 4.9, z - 0.45, z + 0.45, 'glow')
    m.bone('lv2_caps', 'root', (0, top, 3.6))
    for i, x in enumerate((-2.2, 0.0, 2.2)):
        octa(m, 'lv2_caps', f'lv2_cap{i}', 'y', (x, 4.6), top - 0.14, top + 3.2, 0.85, 'cap', decal='capacitor')
    m.bone('lv3_rings', 'root', (0, top + 7, 0))
    for i in range(3):
        octa(m, 'lv3_rings', f'lv3_ring{i}', 'y', (0, 0), top + 4.4 + 2.0 * i, top + 4.8 + 2.0 * i, 2.45 - 0.15 * i, 'glow')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'tube':
            return mul(p.col, 1.25) if int((q[1] + 10) * 1.2) % 3 == 0 else p.col
        if d == 'coil':
            return p.pal['copper2'] if int(q[1] * 3.0) % 2 else p.col
        if d == 'torus':
            return mul(p.col, 1.2) if p.face == 'up' else (mul(p.col, 0.8) if p.face == 'down' else p.col)
        if d == 'capacitor':
            return lit(p.pal['glow']) if p.face != 'down' and q[1] - c['o'][1] > c['s'][1] - 0.4 else p.col
        if d == 'arc':
            a = (q[1] - c['o'][1]) / max(0.1, c['s'][1])
            mid = c['o'][0] + c['s'][0] / 2
            k = mid + 0.55 * math.sin(a * 17.0) * (1 - a * 0.4)
            return lit(mix((255, 255, 255), p.col[:3], a)) if abs(q[0] - k) < 0.22 * (1 - a * 0.5) else None
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ pursuit: a gunship over its pad
def gunship():
    m = building('tower_gunship', dict(concrete='#8a8e96', mark='#ffd650', heli='#4e5a3e', heli2='#36402a', glass='#78c8f0', black='#1a1a20',
                                       rotor='#2a2a30', lamp='#ff4a3c', rocket='#d8dce6'))
    octa(m, 'root', 'pad', 'y', (0, 0), 0.0, 1.0, 7.0, 'concrete', decal='helipad')
    pips(m, 1.0, 6.2, bone='root', size=0.4)
    m.bone('turret', 'root', (0, 7.0, 0))
    m.bone('hover', 'turret', (0, 7.0, 0))
    H = 'hover'
    m.box(H, 'hull', -1.7, 1.7, 5.2, 8.4, -4.4, 2.6, 'heli', decal='heli')
    m.slope(H, 'nose', -1.6, 1.6, (-6.6, 6.8), (-4.3, 8.3), 1.6, 'heli2', decal='canopy')
    m.box(H, 'chin', -1.2, 1.2, 4.9, 6.9, -6.0, -4.3, 'heli2', decal='metal')
    m.box(H, 'boom', -0.55, 0.55, 6.6, 7.7, 2.5, 10.4, 'heli', decal='metal')
    m.box(H, 'fin', 0.0, 0.0, 7.0, 10.4, 8.6, 10.6, 'heli2', only=('east', 'west'), decal='fin', dens=2.0)
    m.box(H, 'stab', -2.2, 2.2, 7.1, 7.1, 9.0, 10.2, 'heli2', only=('up', 'down'))
    for sx in (1, -1):
        m.box(H, f'skid{sx}', sx * 2.0 - 0.3, sx * 2.0 + 0.3, 3.6, 4.0, -4.6, 2.4, 'black')
        for z in (-2.6, 0.8):
            m.box(H, f'strut{sx}_{z}', sx * 1.85 - 0.18, sx * 1.85 + 0.18, 3.95, 5.3, z - 0.18, z + 0.18, 'black')
    m.box(H, 'mast', -0.35, 0.35, 8.4, 9.4, -1.2, -0.5, 'black')
    m.bone('rotor', H, (0, 9.4, -0.85))
    m.box('rotor', 'blade0', -0.45, 0.45, 9.35, 9.55, -9.5, 7.8, 'rotor', decal='blade')
    m.box('rotor', 'blade1', -9.5, 7.8, 9.38, 9.58, -1.3, -0.4, 'rotor', decal='blade')
    m.box('rotor', 'hub', -0.6, 0.6, 9.3, 9.8, -1.45, -0.25, 'black')
    m.bone('spinx', H, (0.7, 7.6, 10.0))
    m.box('spinx', 'tblade', 0.6, 0.7, 5.8, 9.4, 9.8, 10.2, 'rotor')
    m.box('spinx', 'tblade2', 0.62, 0.72, 7.4, 7.8, 8.2, 11.8, 'rotor')
    m.bone('gun', H, (0, 4.6, -5.0))
    m.box('gun', 'gunbox', -0.8, 0.8, 4.0, 5.0, -5.6, -4.2, 'black', decal='metal')
    for i, (x, y) in enumerate(((-0.3, 4.3), (0.3, 4.3), (0.0, 4.75))):
        m.box('gun', f'gbar{i}', x - 0.16, x + 0.16, y - 0.16, y + 0.16, -9.0 - 0.02 * i, -5.5, 'black')
    flash(m, 'gun', 'gun_flash', 0, 4.45, -9.0, 0.7)
    m.bone('lv1_lights', 'root', (0, 1.0, 0))
    for i in range(8):
        a = math.radians(45 * i + 22.5)
        x, z = 6.3 * math.sin(a), -6.3 * math.cos(a)
        m.box('lv1_lights', f'lv1_light{i}', x - 0.3, x + 0.3, 1.0, 1.4, z - 0.3, z + 0.3, 'lamp', decal='lit')
    m.bone('lv2_pods', H, (0, 5.6, -1.0))
    for sx in (1, -1):
        m.box('lv2_pods', f'lv2_wing{sx}', min(sx * 1.6, sx * 3.6), max(sx * 1.6, sx * 3.6), 5.9, 6.3, -1.6, 0.0, 'heli2')
        octa(m, 'lv2_pods', f'lv2_pod{sx}', 'z', (sx * 3.6, 5.5), -3.2, 0.6, 0.75, 'rocket', decal='pod')
    m.bone('lv3_armor', H, (0, 6.8, -1.0))
    for sx in (1, -1):
        lo, hi = sorted((sx * 1.8, sx * 2.25))
        m.box('lv3_armor', f'lv3_plate{sx}', lo, hi, 5.5, 8.0, -3.8, 1.8, 'heli2', decal='plate')
    for i, x in enumerate((-0.75, 0.75)):
        m.box('lv3_armor', f'lv3_gun{i}', x - 0.2, x + 0.2, 4.1, 4.5, -10.0, -5.5, 'black')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'helipad':
            if p.face == 'up':
                r = math.hypot(q[0], q[2])
                if abs(r - 5.0) < 0.35:
                    return p.pal['mark']
                if (abs(q[0]) < 2.0 and abs(q[2]) < 0.4) or (abs(abs(q[0]) - 1.7) < 0.35 and abs(q[2]) < 2.4):
                    return p.pal['mark']                                         # the H
            return p.col
        if d == 'heli':
            if p.face in ('east', 'west') and 0.45 < p.v < 0.75 and 0.08 < p.u < 0.35:
                return p.pal['glass']
            return mul(p.col, 0.88) if int((q[2] + 20) * 0.9) % 3 == 0 else p.col
        if d == 'canopy':
            return p.pal['glass'] if p.face == 'up' else p.col
        if d == 'fin':
            return emblem_px(p, 'star', p.col, 0.3, 0.8, 0.3, 0.8) if p.face in ('east', 'west') else p.col
        if d == 'blade':
            return mul(p.col, 1.6) if p.face == 'up' and (abs(q[0]) > 7.0 or abs(q[2] + 0.85) > 7.0) else p.col
        if d == 'lit':
            return lit(p.col)
        if d == 'pod':
            return mul(p.col, 0.6) if p.face == 'north' and int(p.u * 3) % 2 == int(p.v * 3) % 2 else p.col
        if d == 'plate':
            return mul(p.col, 0.8) if p.u < 0.08 or p.u > 0.92 or p.v < 0.1 or p.v > 0.9 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ gatling gun nest
def gatling():
    m = building('tower_gatling', dict(disc='#c84a3a', bag='#b49a64', metal='#4a4e56', metal2='#2e3036', brass='#d8a838', shield='#5a6a3a',
                                       crate='#7a5a32', lamp='#fff4c0', dish='#c8ccd4'), 'bomb')
    top = small_pedestal(m)
    ring(m, 'root', 'bag', 5.6, top - 0.1, top + 2.2, 'bag')
    m.bone('turret', 'root', (0, top, 0))
    octa(m, 'turret', 'post', 'y', (0, 0), top, top + 3.6, 0.9, 'metal2', decal='metal')
    m.box('turret', 'cradle', -1.8, 1.8, top + 3.5, top + 5.2, -1.6, 2.4, 'metal', decal='metal')
    for sx in (1, -1):
        m.box('turret', f'handle{sx}', sx * 0.9 - 0.2, sx * 0.9 + 0.2, top + 3.6, top + 4.6, 2.4, 4.0, 'metal2')
    m.bone('gun', 'turret', (0, top + 4.4, 0))
    for pre, n, L, r in (('pre4', 6, 9.0, 0.75), ('lv4', 8, 11.5, 0.95)):
        Z = f'{pre}_spinz'
        m.bone(Z, 'gun', (0, top + 4.4, 0))
        for i in range(n):
            a = math.radians(360 / n * i)
            bx, by = r * math.cos(a), top + 4.4 + r * math.sin(a)
            m.box(Z, f'{pre}_bar{i}', bx - 0.24, bx + 0.24, by - 0.24, by + 0.24, -L - 0.02 * i, -1.75, 'metal2')
        octa(m, Z, f'{pre}_clamp', 'z', (0, top + 4.4), -L * 0.72, -L * 0.72 + 0.7, r + 0.45, 'metal')
        octa(m, Z, f'{pre}_hub', 'z', (0, top + 4.4), -2.0, -1.4, r + 0.5, 'metal')
        flash(m, Z, f'{pre}_flash', 0, top + 4.4, -L, 0.9 if pre == 'pre4' else 1.1)
    octa(m, 'gun', 'drum', 'x', (top + 3.0, 0.8), -3.2, -1.7, 1.4, 'metal2', decal='drum')
    m.bone('lv1_shield', 'turret', (0, top + 5, -2))
    m.box('lv1_shield', 'lv1_shield', -3.2, 3.2, top + 2.8, top + 7.4, -2.5, -2.1, 'shield', decal='shieldp')
    m.bone('lv2_crate', 'root', (-4.6, top, 3.0))
    m.box('lv2_crate', 'lv2_crate', -6.4, -2.8, top, top + 2.05, 1.8, 4.6, 'crate', decal='crate')
    m.bone('lv3_belt', 'turret', (2.4, top + 3.8, 0))
    m.box('lv3_belt', 'lv3_box', 1.9, 3.6, top + 2.6, top + 4.8, -0.6, 1.8, 'shield', decal='crate')
    m.box('lv3_belt', 'lv3_link', 1.85, 2.0, top + 4.0, top + 4.6, -1.2, 0.8, 'brass', decal='links')
    m.bone('lv5_lamp', 'turret', (-3.9, top + 6.2, -1.0))
    octa(m, 'lv5_lamp', 'lv5_lamp', 'z', (-3.9, top + 6.2), -2.4, -0.45, 0.8, 'metal2', decal='lamp')
    m.box('lv5_lamp', 'lv5_lampbar', -3.9, -1.75, top + 4.95, top + 5.3, -1.0, -0.7, 'metal')
    m.bone('lv6_radar', 'root', (4.8, top + 6.0, 4.0))
    m.box('lv6_radar', 'lv6_mast', 4.55, 5.05, top, top + 6.0, 3.75, 4.25, 'metal')
    m.bone('lv6_radar_spin', 'lv6_radar', (4.8, top + 6.0, 4.0))
    m.box('lv6_radar_spin', 'lv6_dish', 3.4, 6.2, top + 5.6, top + 7.8, 3.9, 4.1, 'dish', rot=(-20, 0, 0), pivot=(4.8, top + 6.7, 4.0), decal='dish')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'shieldp':
            if p.face == 'north':
                if abs(p.u - 0.5) < 0.12 and 0.15 < p.v < 0.42:
                    return mul(p.col, 0.4)                                       # the slot for the barrels
                return mul(p.col, 0.82) if p.u < 0.06 or p.u > 0.94 or p.v < 0.08 else p.col
            return p.col
        if d == 'crate':
            if p.face == 'up':
                return mul(p.col, 0.8) if abs(p.u - 0.5) < 0.07 else p.col
            return mul(p.col, 0.75) if p.u < 0.1 or p.u > 0.9 or p.v < 0.1 or p.v > 0.9 else p.col
        if d == 'links':
            return p.pal['brass'] if int((q[2] + 10) * 3) % 2 else mul(p.col, 0.7)
        if d == 'lamp':
            return lit(p.pal['lamp']) if p.face == 'north' else p.col
        if d == 'dish':
            return mul(p.col, 0.8) if math.hypot(p.u - 0.5, p.v - 0.5) > 0.42 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ automatic turret
def auto_turret():
    m = building('tower_turret', dict(disc='#c84a3a', metal='#8a909c', metal2='#3e424c', armor='#5a6270', eye='#ff4a3c', dish='#c8ccd4',
                                      stripe='#ffd650'), 'sight')
    top = small_pedestal(m)
    octa(m, 'root', 'base', 'y', (0, 0), top, top + 2.0, 4.6, 'metal2', decal='hazard')
    m.bone('turret', 'root', (0, top + 2.0, 0))
    octa(m, 'turret', 'neck', 'y', (0, 0), top + 2.0, top + 3.2, 2.2, 'metal', decal='metal')
    m.box('turret', 'head', -2.9, 2.9, top + 3.1, top + 6.9, -3.2, 3.0, 'armor', decal='thead')
    m.slope('turret', 'brow', -2.8, 2.8, (-3.7, top + 6.6), (-1.0, top + 7.5), 0.7, 'armor')
    m.box('turret', 'eye', -0.9, 0.9, top + 5.5, top + 6.4, -3.45, -3.15, 'eye', decal='lit')
    m.bone('gun', 'turret', (0, top + 4.6, -3.0))
    for pre, xs, L, r in (('pre4', (-1.6, 1.6), 6.5, 0.5), ('lv4', (-1.8, 1.8), 8.5, 0.72)):
        for i, x in enumerate(xs):
            B = f'{pre}_barrel{i}'
            m.bone(B, 'gun', (x, top + 4.4, -3.0))
            octa(m, B, f'{pre}_bar{i}', 'z', (x, top + 4.4), -3.2 - L, -2.9, r, 'metal2', decal='metal')
            octa(m, B, f'{pre}_mz{i}', 'z', (x, top + 4.4), -3.6 - L, -3.0 - L, r + 0.25, 'metal')
            flash(m, B, f'{pre}_flash{i}', x, top + 4.4, -3.6 - L, 0.7)
    m.bone('lv1_skirt', 'root', (0, top, 0))
    for i in range(4):
        a = 90 * i + 45
        rad = math.radians(a)
        x, z = 4.85 * math.sin(rad), -4.85 * math.cos(rad)
        m.box('lv1_skirt', f'lv1_skirt{i}', x - 2.0, x + 2.0, top - 0.3, top + 1.6, z - 0.2, z + 0.2, 'armor', rot=(0, -a, 0), pivot=(x, top, z), decal='plate')
    m.bone('lv2_mast', 'turret', (2.2, top + 7, 1.8))
    m.box('lv2_mast', 'lv2_mast', 2.0, 2.4, top + 6.9, top + 10.2, 1.6, 2.0, 'metal')
    m.box('lv2_mast', 'lv2_sensor', 1.6, 2.8, top + 9.8, top + 10.8, 1.2, 2.4, 'metal2', decal='sensor')
    m.bone('lv3_plates', 'turret', (0, top + 5, 0))
    for sx in (1, -1):
        lo, hi = sorted((sx * 2.95, sx * 3.5))
        m.box('lv3_plates', f'lv3_side{sx}', lo, hi, top + 3.4, top + 6.6, -2.8, 2.6, 'armor', decal='plate')
    m.bone('lv5_radar', 'turret', (-1.8, top + 7.4, 1.6))
    m.box('lv5_radar', 'lv5_post', -2.0, -1.6, top + 6.9, top + 8.4, 1.4, 1.8, 'metal')
    m.bone('lv5_radar_spin', 'lv5_radar', (-1.8, top + 8.4, 1.6))
    m.box('lv5_radar_spin', 'lv5_dish', -3.4, -0.2, top + 8.2, top + 10.2, 1.5, 1.7, 'dish', rot=(-15, 0, 0), pivot=(-1.8, top + 9.0, 1.6), decal='dish')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'hazard':
            return (p.pal['stripe'] if int((q[0] + q[1] + q[2] + 30) * 0.9) % 2 else p.pal['metal2']) if p.face != 'up' and q[1] - c['o'][1] < 0.6 else p.col
        if d == 'thead':
            if p.face == 'north':
                return mul(p.col, 0.7) if abs(p.v - 0.55) < 0.05 else p.col
            return mul(p.col, 0.85) if p.face in ('east', 'west') and abs(p.v - 0.5) < 0.06 else p.col
        if d == 'lit':
            return lit(p.col)
        if d == 'plate':
            return mul(p.col, 0.8) if p.u < 0.08 or p.u > 0.92 or p.v < 0.1 or p.v > 0.9 else p.col
        if d == 'sensor':
            return lit(p.pal['eye']) if p.face == 'north' and 0.3 < p.u < 0.7 and 0.3 < p.v < 0.7 else p.col
        if d == 'dish':
            return mul(p.col, 0.8) if math.hypot(p.u - 0.5, p.v - 0.5) > 0.42 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ mercenary camp (spawner)
def merc_camp():
    m = building('tower_merc', dict(dirt='#7a6648', dirt2='#5e4e36', tent='#8a7a4e', tent2='#6a5c38', camo='#4e5a32', bag='#b49a64', wood='#7a5a36',
                                    crate='#6a5a3a', pole='#c8ccd4', flagc='#c84a3a', net='#4e6a32', net2='#3a4e24', dark='#2a2620', radio='#3a3e44'))
    m.box('root', 'ground', -7.0, 7.0, 0.0, 1.0, -7.0, 7.0, 'dirt', decal='dirt')
    m.rise_x('root', 'roof_l', (-5.2, 1.2), (-0.1, 8.6), -2.2, 5.8, 0.4, 'tent', decal='canvas')
    m.rise_x('root', 'roof_r', (0.1, 8.6), (5.2, 1.2), -2.26, 5.86, 0.4, 'tent', decal='canvas')
    m.box('root', 'back', -4.6, 4.6, 1.0, 5.0, 5.2, 5.6, 'tent2', decal='canvas')
    m.box('root', 'ridge', -0.45, 0.45, 8.3, 8.9, -2.4, 6.0, 'wood')
    m.bone('door', 'root', (0, 7.6, -2.0))
    m.box('door', 'flap', -3.6, 3.6, 1.0, 7.6, -2.05, -1.9, 'tent2', decal='flap')
    m.box('root', 'dark', -3.4, 3.4, 1.0, 7.2, -1.6, -1.5, 'dark')
    m.box('root', 'crate', 5.4, 6.9, 1.0, 3.4, -1.8, 1.0, 'crate', decal='crate')
    m.box('root', 'crate2', 5.6, 6.7, 3.4, 4.8, -1.2, 0.4, 'crate', decal='crate')
    m.box('root', 'pole', -6.3, -5.9, 1.0, 13.0, 3.9, 4.3, 'pole')
    m.bone('flag', 'root', (-6.1, 12.6, 4.3))
    m.box('flag', 'flag', -6.1, -6.1, 9.6, 12.6, 4.3, 8.6, 'flagc', only=('east', 'west'), decal='flag', dens=2.0)
    pips(m, 1.0, 6.4, bone='root', size=0.4)
    m.bone('lv1_bags', 'root', (0, 1, -6))
    for i, z in enumerate((-1.4, 1.2)):
        m.box('lv1_bags', f'lv1_bag{i}', -6.9 + 0.02 * i, -5.5 - 0.02 * i, 1.0, 2.6, z - 1.25, z + 1.25, 'bag', decal='bags')
    m.bone('lv2_crates', 'root', (5.0, 1, 3.0))
    m.box('lv2_crates', 'lv2_crate', 3.6, 6.6, 1.0, 3.2, 1.4, 4.6, 'crate', decal='crate')
    m.box('lv2_crates', 'lv2_crate2', 4.0, 6.2, 3.2, 4.8, 1.8, 4.2, 'camo', decal='crate')
    m.bone('lv3_radio', 'root', (-4.6, 1, -4.0))
    m.box('lv3_radio', 'lv3_radio', 4.0, 6.0, 1.02, 3.0, 4.6, 6.0, 'radio', decal='radio')
    m.box('lv3_radio', 'lv3_ant', 5.5, 5.75, 3.0, 11.0, 5.1, 5.35, 'pole')
    m.bone('lv4_tent', 'root', (5.0, 1, -1.0))
    m.rise_x('lv4_tent', 'lv4_roof_l', (3.0, 1.2), (5.0, 4.8), -2.4, 0.8, 0.3, 'camo', decal='canvas')
    m.rise_x('lv4_tent', 'lv4_roof_r', (5.0, 4.8), (7.0, 1.2), -2.46, 0.86, 0.3, 'camo', decal='canvas')
    m.bone('lv5_net', 'root', (0, 9.6, 1.8))
    m.box('lv5_net', 'lv5_net', -6.6, 6.6, 9.4, 9.4, -3.0, 6.6, 'net', only=('up', 'down'), decal='netting', dens=2.0)
    for i, (x, z) in enumerate(((-6.4, -2.8), (6.4, -2.8), (-6.4, 6.4), (6.4, 6.4))):
        m.box('lv5_net', f'lv5_pole{i}', x - 0.2, x + 0.2, 1.0, 9.6, z - 0.2, z + 0.2, 'wood')
    m.bone('lv6_flag', 'root', (-6.1, 13.0, 4.1))
    m.box('lv6_flag', 'lv6_finial', -6.5, -5.7, 13.0, 13.8, 3.7, 4.5, 'gold')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'dirt':
            if p.face == 'up':
                return p.pal['dirt2'] if (int(q[0] * 2.3) * 7 + int(q[2] * 1.9) * 3) % 5 == 0 else p.col
            return mul(p.col, 0.8)
        if d == 'canvas':
            n = math.sin(q[0] * 1.3 + q[2] * 0.7) + math.sin(q[2] * 1.1 - q[1] * 0.9)
            return p.pal['camo'] if n > 1.1 else (p.pal['tent2'] if n < -1.2 else p.col)
        if d == 'flap':
            return mul(p.col, 0.85) if abs(q[0]) < 0.15 else p.col
        if d == 'crate':
            if p.face == 'up':
                return mul(p.col, 0.8) if abs(p.u - 0.5) < 0.07 else p.col
            return mul(p.col, 0.75) if p.u < 0.1 or p.u > 0.9 or p.v < 0.1 or p.v > 0.9 else p.col
        if d == 'flag':
            return flag(p, 'star', 4.3, 8.6, 9.6, 12.6)
        if d == 'radio':
            return lit((120, 255, 120)) if p.face == 'up' and p.u > 0.7 and p.v < 0.3 else (mul(p.col, 0.7) if p.face == 'north' and int(q[1] * 3) % 2 else p.col)
        if d == 'netting':
            k = (q[0] + q[2]) % 1.2 < 0.25 or (q[0] - q[2]) % 1.2 < 0.25
            return p.pal['net2'] if k else (p.col if (int(q[0] * 2) + int(q[2] * 2)) % 3 else None)
        if d == 'bags':
            from parts import bags
            return bags(p, row=0.8, width=1.3)
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ elves' cabin (spawner)
def elf_cabin():
    m = building('tower_elfcamp', dict(snow='#eef4fa', snow2='#c8d8e8', log='#8a5a32', log2='#6a4224', roof='#c83838', door='#4a8a3a', cane='#f4f4f4',
                                       red='#d83030', gift='#3c8ad8', gift2='#e8c838', ribbon='#ffd650', bulb='#ffd650', bulb2='#ff4a5a', tree='#2e7a3a',
                                       glass='#ffe8a0', sled='#c83838', runner='#d8a838', brick='#9a5a46'))
    m.box('root', 'snowpad', -7.0, 7.0, 0.0, 1.0, -7.0, 7.0, 'snow', decal='snowpad')
    m.box('root', 'cabin', -4.4, 4.4, 1.0, 7.0, -1.6, 5.2, 'log', decal='logs', dens={'north': 3.0})
    m.rise_x('root', 'roof_l', (-5.4, 6.2), (0.05, 10.6), -2.4, 6.0, 0.6, 'roof', decal='roofsnow')
    m.rise_x('root', 'roof_r', (-0.05, 10.6), (5.4, 6.2), -2.46, 6.06, 0.6, 'roof', decal='roofsnow')
    m.box('root', 'gable_f', -3.9, 3.9, 7.0, 9.6, -1.55, -1.45, 'log2', decal='gable')
    m.box('root', 'chimney', 2.0, 3.2, 8.0, 12.0, 3.0, 4.2, 'brick', decal='brick')
    m.bone('door', 'root', (0, 5.0, -1.7))
    m.box('door', 'door', -1.3, 1.3, 1.0, 5.0, -1.75, -1.62, 'door', decal='door')
    for i, (x, z) in enumerate(((-6.0, -6.0), (6.0, -6.0))):
        m.box('root', f'cane{i}', x - 0.35, x + 0.35, 1.0, 6.6, z - 0.35, z + 0.35, 'cane', decal='cane')
        m.box('root', f'hook{i}', x - 0.3 + (0.0 if i else -1.2), x + 0.3 + (1.2 if i else 0.0), 6.3, 6.95, z - 0.29, z + 0.29, 'cane', decal='cane')
    m.box('root', 'gift', 4.6, 6.4, 1.0, 2.8, -4.0, -2.2, 'gift', decal='gift')
    pips(m, 1.0, 6.4, bone='root', size=0.4)
    m.bone('lv1_lights', 'root', (0, 6.8, -1.7))
    for i in range(9):
        x = -4.0 + i
        m.box('lv1_lights', f'lv1_bulb{i}', x - 0.22, x + 0.22, 6.5 - 0.35 * abs(math.sin(i * 0.9)), 6.95 - 0.35 * abs(math.sin(i * 0.9)), -1.98, -1.66,
              'bulb' if i % 2 else 'bulb2', decal='lit')
    m.bone('lv2_gifts', 'root', (-5.0, 1, 3.0))
    m.box('lv2_gifts', 'lv2_gift0', -6.6, -4.6, 1.0, 3.0, 1.4, 3.4, 'red', decal='gift')
    m.box('lv2_gifts', 'lv2_gift1', -6.2, -5.0, 3.0, 4.2, 1.8, 3.0, 'gift2', decal='gift')
    m.box('lv2_gifts', 'lv2_gift2', -6.6, -5.0, 1.0, 2.4, 3.6, 5.2, 'gift', decal='gift')
    m.bone('lv3_tree', 'root', (5.4, 1, 4.2))
    for i, (y0, y1, r) in enumerate(((1.0, 4.2, 1.8), (3.6, 6.4, 1.35), (5.8, 8.2, 0.9))):
        octa(m, 'lv3_tree', f'lv3_tier{i}', 'y', (5.4, 4.2), y0 + 0.01 * i, y1, r, 'tree', decal='tree')
    m.box('lv3_tree', 'lv3_star', 5.0, 5.8, 8.2, 9.0, 3.8, 4.6, 'bulb', rot=(0, 45, 45), pivot=(5.4, 8.6, 4.2), decal='lit')
    m.bone('lv4_sled', 'root', (-4.2, 1, -4.6))
    m.box('lv4_sled', 'lv4_sled', -4.6, -1.0, 1.6, 3.2, -6.4, -3.4, 'sled', decal='sled')
    for sx in (-4.2, -1.4):
        m.box('lv4_sled', f'lv4_runner{sx}', sx - 0.2, sx + 0.2, 1.0, 1.35, -6.8, -3.2, 'runner')
    m.box('lv4_sled', 'lv4_sack', -4.0, -1.6, 3.2, 5.0, -5.8, -4.0, 'snow2', decal='gift')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'snowpad':
            return mul(p.col, 0.94) if p.face == 'up' and (int(q[0] * 2.7) * 5 + int(q[2] * 2.3) * 3) % 7 == 0 else (p.pal['snow2'] if p.face != 'up' else p.col)
        if d == 'logs':
            if p.face == 'north':
                if 0.2 < p.u < 0.36 or 0.64 < p.u < 0.8:
                    if 0.35 < p.v < 0.6:
                        return lit(p.pal['glass']) if abs(p.u - 0.28) > 0.02 and abs(p.u - 0.72) > 0.02 else p.pal['log2']   # lit windows
            return p.pal['log2'] if ((q[1] - c['o'][1]) % 1.2) < 0.2 else p.col
        if d == 'roofsnow':
            return p.pal['snow'] if p.face == 'up' else (p.pal['snow2'] if p.face in ('north', 'south') else p.col)
        if d == 'gable':
            return p.pal['log2'] if int((q[1]) * 1.6) % 2 else p.col
        if d == 'brick':
            return p.pal['snow'] if p.face == 'up' else (mul(p.col, 0.78) if ((q[1] - c['o'][1]) * 2.4) % 1 < 0.22 else p.col)
        if d == 'door':
            return p.pal['ribbon'] if abs(p.u - 0.8) < 0.08 and abs(p.v - 0.5) < 0.08 else (mul(p.col, 0.8) if abs(p.u - 0.5) < 0.05 else p.col)
        if d == 'cane':
            return p.pal['red'] if int((q[1] + q[0] * 0.6 + 20) * 1.4) % 2 else p.col
        if d == 'gift':
            return p.pal['ribbon'] if abs(p.u - 0.5) < 0.1 or (p.face != 'up' and abs(p.v - 0.5) < 0.1) else p.col
        if d == 'lit':
            return lit(p.col)
        if d == 'tree':
            return p.pal['snow'] if p.face == 'up' else (lit(p.pal['bulb2']) if (int(q[1] * 2) + int((q[0] + q[2]) * 2)) % 9 == 0 else p.col)
        if d == 'sled':
            return p.pal['runner'] if p.v < 0.15 or p.v > 0.85 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ searchlight (cliff)
def searchlight():
    m = building('tower_spotlight', dict(disc='#3cc864', metal='#8a909c', metal2='#3e424c', lens='#fff8d0', beam='#fff4b0', gen='#c8a038',
                                         bag='#b49a64', cable='#1a1a20', vent='#2a2c30'), 'sight')
    top = small_pedestal(m)
    m.box('root', 'gen', 2.8, 6.2, top, top + 2.8, 1.6, 5.4, 'gen', decal='gen')
    m.box('root', 'cable', -0.3, 0.3, top, top + 0.3, 0.0, 3.0, 'cable')
    m.bone('turret', 'root', (0, top, 0))
    for i in range(3):
        a = math.radians(120 * i + 180)
        x, z = 2.4 * math.sin(a), -2.4 * math.cos(a)
        m.box('turret', f'leg{i}', x - 0.25, x + 0.25, top, top + 6.0, z - 0.25, z + 0.25, 'metal2', rot=(16 * math.cos(a), 0, 16 * math.sin(a)), pivot=(x, top, z))
    m.box('turret', 'yoke', -2.4, 2.4, top + 5.6, top + 6.2, -0.4, 0.4, 'metal2')
    for sx in (1, -1):
        m.box('turret', f'arm{sx}', sx * 2.2 - 0.25, sx * 2.2 + 0.25, top + 6.0, top + 8.4, -0.33, 0.33, 'metal2')
    m.bone('barrel', 'turret', (0, top + 8.0, 0), rot=(-8, 0, 0))
    for pre, r, L in (('pre4', 1.8, 4.6), ('lv4', 2.5, 6.0)):
        P = f'{pre}_lamp'
        m.bone(P, 'barrel', (0, top + 8.0, 0))
        octa(m, P, f'{pre}_drum', 'z', (0, top + 8.0), -L / 2, L / 2, r, 'metal', decal='drum')
        octa(m, P, f'{pre}_rim', 'z', (0, top + 8.0), -L / 2 - 0.4, -L / 2 + 0.2, r + 0.3, 'metal2')
        m.box(P, f'{pre}_lens', -r * 0.82, r * 0.82, top + 8.0 - r * 0.82, top + 8.0 + r * 0.82, -L / 2 - 0.45, -L / 2 - 0.45, 'lens', only=('north', 'south'), decal='lens')
        m.box(P, f'{pre}_beam_v', 0, 0, top + 8.0 - r, top + 8.0 + r, -L / 2 - 16.0, -L / 2 - 0.5, 'beam', only=('east', 'west'), decal='beam', dens=1.5)
        m.box(P, f'{pre}_beam_h', -r, r, top + 8.0, top + 8.0, -L / 2 - 16.0, -L / 2 - 0.5, 'beam', only=('up', 'down'), decal='beam', dens=1.5)
    m.bone('lv1_bags', 'root', (0, top, 0))
    ring(m, 'lv1_bags', 'lv1_bag', 5.8, top - 0.1, top + 1.8, 'bag', gap=1.0)
    m.bone('lv2_gen', 'root', (4.5, top + 2.8, 3.5))
    m.box('lv2_gen', 'lv2_tank', 3.0, 6.0, top + 2.8, top + 4.2, 2.0, 5.0, 'metal2', decal='gen')
    m.box('lv2_gen', 'lv2_pipe', 5.2, 5.6, top + 4.2, top + 6.4, 4.2, 4.6, 'vent')
    m.bone('lv3_lamp2', 'turret', (0, top + 9.6, 0))
    octa(m, 'lv3_lamp2', 'lv3_small', 'z', (0, top + 10.8), -1.0, 1.2, 0.8, 'metal')
    m.box('lv3_lamp2', 'lv3_slens', -0.6, 0.6, top + 10.2, top + 11.4, -1.25, -1.25, 'lens', only=('north', 'south'), decal='lens')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'gen':
            return p.pal['vent'] if p.face in ('east', 'west', 'north') and int((q[1]) * 2.5) % 2 and 0.2 < p.u < 0.8 else p.col
        if d == 'drum':
            return mul(p.col, 1.2) if int((q[2] + 10) * 1.5) % 3 == 0 else p.col
        if d == 'lens':
            return lit(p.col)
        if d == 'beam':
            a = (q[2] - c['o'][2]) / max(0.1, c['s'][2])                     # 0 far, 1 at the lamp
            w = abs((q[1] - (c['o'][1] + c['s'][1] / 2)) if p.face in ('east', 'west') else (q[0] - (c['o'][0] + c['s'][0] / 2)))
            half = (c['s'][1] if p.face in ('east', 'west') else c['s'][0]) / 2
            if w > half * (0.45 + 0.55 * (1 - a)) or (int(q[2] * 3) % 5 == 0 and a < 0.4):
                return None
            return lit(mix(p.col[:3], (255, 255, 255), a * 0.5))
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ war machine: a tank
def tank():
    m = building('tower_tank', dict(disc='#c84a3a', armor='#5e6a46', armor2='#46502e', tread='#2a2a30', metal='#4a4e56', black='#18181e',
                                    era='#7a8256', lamp='#fff4c0'), 'star')
    m.box('root', 'pad', -7.0, 7.0, 0.0, 0.6, -7.0, 7.0, 'metal', decal='pad')
    for i in range(1, 8):                                                         # the level pips in a row on the rear deck
        x = -3.0 + (i - 1) * 1.0
        m.bone(f'pip{i}', 'root', (x, 5.4, 4.6))
        m.box(f'pip{i}', f'pip{i}', x - 0.35, x + 0.35, 5.35, 5.95, 4.25, 4.95, 'gold', decal='gem')
    for sx in (1, -1):
        x0, x1 = sorted((sx * 2.8, sx * 5.2))
        m.box('root', f'tread{sx}', x0, x1, 0.6, 3.4, -6.4, 6.4, 'tread', decal='tread')
        for i, z in enumerate((-4.6, -1.6, 1.4, 4.4)):
            lo, hi = sorted((sx * 5.2, sx * 5.4))
            octa(m, 'root', f'wheel{sx}_{i}', 'x', (2.0, z), lo, hi, 1.1, 'metal', decal='metal')
    m.box('root', 'hull', -3.8, 3.8, 2.6, 5.4, -5.8, 5.8, 'armor', decal='hull')
    m.slope('root', 'glacis', -3.7, 3.7, (-7.2, 3.6), (-5.7, 5.4), 1.4, 'armor2', decal='plate')
    m.bone('turret', 'root', (0, 5.4, 0.6))
    m.box('turret', 'turret', -2.9, 2.9, 5.4, 8.0, -2.4, 3.6, 'armor', decal='hull')
    m.slope('turret', 'mantlet', -2.0, 2.0, (-3.4, 7.6), (-2.3, 8.0), 2.4, 'armor2')
    m.box('turret', 'hatch', -1.0, 1.4, 8.0, 8.5, 0.6, 2.8, 'armor2', decal='metal')
    m.bone('gun', 'turret', (0, 6.8, -2.4))
    for pre, r, L in (('pre4', 0.55, 8.5), ('lv4', 0.75, 11.0)):
        B = f'{pre}_cannon'
        m.bone(B, 'gun', (0, 6.8, -2.4))
        octa(m, B, f'{pre}_barrel', 'z', (0, 6.8), -3.0 - L, -2.6, r, 'metal', decal='metal')
        octa(m, B, f'{pre}_brake', 'z', (0, 6.8), -4.2 - L, -2.9 - L, r + 0.35, 'black', decal='slots')
        flash(m, B, f'{pre}_flash', 0, 6.8, -4.2 - L, 1.1)
    m.bone('lv1_skirts', 'root', (0, 3, 0))
    for sx in (1, -1):
        lo, hi = sorted((sx * 5.45, sx * 5.75))
        m.box('lv1_skirts', f'lv1_skirt{sx}', lo, hi, 2.0, 4.0, -6.0, 6.0, 'armor2', decal='plate')
    m.bone('lv2_mg', 'turret', (1.6, 8.4, 0.0))
    m.box('lv2_mg', 'lv2_mgbody', 1.2, 2.0, 8.5, 9.3, -1.0, 1.0, 'black')
    m.box('lv2_mg', 'lv2_mgbar', 1.45, 1.75, 8.75, 9.05, -4.0, -1.0, 'black')
    m.bone('lv3_smoke', 'turret', (0, 7.4, 3.6))
    for sx in (1, -1):
        for i in range(3):
            lo, hi = sorted((sx * 2.95, sx * 3.6))
            octa(m, 'lv3_smoke', f'lv3_tube{sx}_{i}', 'x', (6.0 + 0.7 * i, 2.4 - 0.5 * i), lo, hi, 0.3, 'metal')
    m.bone('lv5_era', 'turret', (0, 7, 0))
    for i, x in enumerate((-2.2, -0.7, 0.8, 2.3)):
        m.box('lv5_era', f'lv5_brick{i}', x - 0.65, x + 0.65, 6.0, 7.4, -2.85, -2.42, 'era', decal='plate')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'pad':
            return mul(p.col, 0.9) if p.face == 'up' and (abs(q[0] % 3.5) < 0.12 or abs(q[2] % 3.5) < 0.12) else p.col
        if d == 'tread':
            if p.face in ('east', 'west', 'up', 'down', 'north', 'south'):
                return mul(p.col, 1.4) if int((q[2] + q[1] + 20) * 1.6) % 2 == 0 else p.col
        if d == 'hull':
            if p.face == 'east' or p.face == 'west':
                return emblem_px(p, 'star', mul(p.col, 0.95), 0.35, 0.65, 0.2, 0.8)
            return mul(p.col, 0.9) if int((q[0] + q[2] + 20) * 0.7) % 4 == 0 else p.col
        if d == 'plate':
            return mul(p.col, 0.8) if p.u < 0.08 or p.u > 0.92 or p.v < 0.1 or p.v > 0.9 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ mech hangar (spawner)
def mech_hangar():
    m = building('tower_mecha', dict(concrete='#8a8e96', stripe='#ffd650', dark='#2a2c30', wall='#5a6a7a', wall2='#46525e', door='#7a8490',
                                     lamp='#ff4a3c', glow='#78dcff', crane='#e8c838', dish='#c8ccd4', mech='#9aa4b0', mech2='#5a6470'), 'star')
    m.box('root', 'pad', -7.0, 7.0, 0.0, 1.0, -7.0, 7.0, 'concrete', decal='pad')
    m.box('root', 'hangar', -5.6, 5.6, 1.0, 8.0, -3.0, 6.2, 'wall', decal='hangar', dens={'north': 3.0})
    m.slope('root', 'roof_f', -5.9, 5.9, (-3.4, 8.0), (1.6, 10.4), 0.6, 'wall2', decal='roof')
    m.slope('root', 'roof_b', -5.87, 5.87, (1.6, 10.4), (6.6, 8.0), 0.6, 'wall2', decal='roof')
    m.bone('door', 'root', (0, 7.4, -3.1))
    m.box('door', 'door', -4.0, 4.0, 1.0, 7.4, -3.2, -3.05, 'door', decal='shutter')
    for sx in (1, -1):
        m.box('root', f'lamp{sx}', sx * 4.6 - 0.4, sx * 4.6 + 0.4, 7.2, 7.8, -3.4, -3.0, 'lamp', decal='lit')
    pips(m, 1.0, 6.4, bone='root', size=0.4)
    m.bone('lv1_lights', 'root', (0, 1.0, -5.0))
    for i, x in enumerate((-3.6, -1.2, 1.2, 3.6)):
        m.box('lv1_lights', f'lv1_light{i}', x - 0.35, x + 0.35, 1.0, 1.35, -5.6, -4.9, 'glow', decal='lit')
    m.bone('lv2_crane', 'root', (5.0, 10, 4.0))
    m.box('lv2_crane', 'lv2_mast', 4.6, 5.4, 8.0, 14.0, 3.6, 4.4, 'crane', decal='truss')
    m.box('lv2_crane', 'lv2_jib', -2.0, 5.6, 13.4, 14.2, 3.66, 4.34, 'crane', decal='truss')
    m.box('lv2_crane', 'lv2_hook', -1.4, -1.0, 10.4, 13.4, 3.8, 4.2, 'dark')
    m.bone('lv3_radar', 'root', (-4.0, 10.4, 4.0))
    m.box('lv3_radar', 'lv3_post', -4.25, -3.75, 9.0, 11.6, 3.75, 4.25, 'dark')
    m.bone('lv3_radar_spin', 'lv3_radar', (-4.0, 11.6, 4.0))
    m.box('lv3_radar_spin', 'lv3_dish', -5.6, -2.4, 11.2, 13.4, 3.9, 4.1, 'dish', rot=(-20, 0, 0), pivot=(-4.0, 12.2, 4.0), decal='dish')
    m.bone('lv4_bay', 'root', (-6.0, 1, -1.0))
    m.box('lv4_bay', 'lv4_bay', -6.9, -5.65, 1.0, 6.0, -2.6, 5.6, 'wall2', decal='hangar')
    m.bone('lv5_mech', 'root', (0, 10.4, 1.6))
    M = 'lv5_mech'
    m.box(M, 'lv5_mtorso', -1.6, 1.6, 13.2, 16.2, 0.6, 2.6, 'mech', decal='metal')
    m.box(M, 'lv5_mhead', -0.8, 0.8, 16.2, 17.4, 0.9, 2.3, 'mech2', decal='visor')
    for sx in (1, -1):
        m.box(M, f'lv5_mleg{sx}', sx * 1.0 - 0.55, sx * 1.0 + 0.55, 10.2, 13.3, 1.0, 2.2, 'mech2')
        m.box(M, f'lv5_marm{sx}', sx * 2.16 - 0.5, sx * 2.16 + 0.5, 12.6, 16.0, 1.0, 2.2, 'mech2')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'pad':
            if p.face == 'up' and q[2] < -3.0 and abs(q[0]) < 4.4:
                return p.pal['stripe'] if int((q[0] - q[2] + 20) * 1.2) % 2 else p.pal['dark']
            return p.col
        if d == 'hangar':
            yb = q[1] - 1.0
            if p.face in ('east', 'west') and 4.0 < yb < 5.4 and int((q[2] + 10) * 0.8) % 2:
                return lit(p.pal['glow'])
            return mul(p.col, 0.88) if int(along(p, q) * 1.1) % 2 else p.col
        if d == 'roof':
            return mul(p.col, 0.85) if p.face == 'up' and int((q[0] + 10) * 1.3) % 2 else p.col
        if d == 'hangar' and p.face == 'north' and abs(q[0]) < 3.95 and q[1] < 7.35:
            return p.pal['dark']                                                 # the doorway behind the shutter
        if d == 'shutter':
            return mul(p.col, 0.75) if ((q[1] - c['o'][1]) * 1.6) % 1 < 0.22 else p.col
        if d == 'lit':
            return lit(p.col)
        if d == 'truss':
            return mul(p.col, 0.6) if int((q[0] + q[1] + 20) * 1.4) % 2 else p.col
        if d == 'dish':
            return mul(p.col, 0.8) if math.hypot(p.u - 0.5, p.v - 0.5) > 0.42 else p.col
        if d == 'visor':
            return lit(p.pal['glow']) if p.face == 'north' and 0.4 < p.v < 0.65 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


def along(p, q):
    return q[2] if p.face in ('east', 'west') else q[0]


# ------------------------------------------------------------------------------------------------ tripod sentry
def tripod_sentry():
    m = building('tower_sentry', dict(disc='#8a8e98', metal='#8a909c', metal2='#3e424c', body='#6a7480', ammo='#5a6a3a', eye='#ff4a3c', glass='#9ad8ff'), 'sight')
    top = small_pedestal(m)
    m.bone('turret', 'root', (0, top + 5.0, 0))
    for i in range(3):
        a = math.radians(120 * i)
        x, z = 2.6 * math.sin(a), -2.6 * math.cos(a)
        m.box('root', f'leg{i}', x - 0.28, x + 0.28, top, top + 5.4, z - 0.28, z + 0.28, 'metal2', rot=(18 * math.cos(a), 0, 18 * math.sin(a)), pivot=(x, top, z))
    octa(m, 'root', 'hub', 'y', (0, 0), top + 4.4, top + 5.2, 1.0, 'metal')
    m.box('turret', 'body', -1.6, 1.6, top + 5.2, top + 7.6, -2.6, 2.4, 'body', decal='metal')
    m.box('turret', 'ammo', 1.6, 3.0, top + 4.8, top + 6.8, -1.0, 1.6, 'ammo', decal='plate')
    m.bone('gun', 'turret', (0, top + 6.4, -2.6))
    for pre, xs in (('pre4', (0.0,)), ('lv4', (-0.8, 0.8))):
        for i, x in enumerate(xs):
            B = f'{pre}_bar{i}'
            m.bone(B, 'gun', (x, top + 6.4, -2.6))
            m.box(B, f'{pre}_barrel{i}', x - 0.3, x + 0.3, top + 6.1, top + 6.7, -8.4, -2.5, 'metal2')
            m.box(B, f'{pre}_mz{i}', x - 0.45, x + 0.45, top + 5.95, top + 6.85, -9.0, -8.3, 'metal', decal='slots')
            flash(m, B, f'{pre}_flash{i}', x, top + 6.4, -9.0, 0.45 if pre == 'lv4' else 0.6)
    m.bone('lv1_shield', 'turret', (0, top + 6, -2.8))
    m.box('lv1_shield', 'lv1_shield', -2.6, 2.6, top + 4.6, top + 8.2, -3.2, -2.85, 'ammo', decal='shieldp')
    m.bone('lv2_scope', 'turret', (0, top + 8.2, 0))
    octa(m, 'lv2_scope', 'lv2_scope', 'z', (0, top + 8.3), -2.4, 1.0, 0.5, 'metal2', decal='scope')
    m.box('lv2_scope', 'lv2_mount', -0.3, 0.3, top + 7.6, top + 7.9, -1.0, 0.4, 'metal')
    m.bone('lv3_ammo', 'turret', (2.4, top + 5, 0))
    m.box('lv3_ammo', 'lv3_box', 1.6, 3.6, top + 3.6, top + 4.8, -1.4, 2.0, 'ammo', decal='plate')
    m.bone('lv5_laser', 'gun', (0, top + 5.6, -3))
    m.box('lv5_laser', 'lv5_laser', -0.25, 0.25, top + 5.35, top + 5.85, -5.0, -2.6, 'eye', decal='lit')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'plate':
            return mul(p.col, 0.8) if p.u < 0.08 or p.u > 0.92 or p.v < 0.1 or p.v > 0.9 else p.col
        if d == 'shieldp':
            if p.face == 'north':
                return mul(p.col, 0.4) if abs(p.u - 0.5) < 0.16 and 0.4 < p.v < 0.62 else (mul(p.col, 0.82) if p.u < 0.06 or p.u > 0.94 else p.col)
            return p.col
        if d == 'lit':
            return lit(p.col)
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ void miner: a drill over a rift
def void_drill():
    m = building('tower_voidminer', dict(rock='#3a3446', rock2='#2a2434', void='#c070ff', void2='#7a3aa8', frame='#6a6e78', frame2='#4a4e58',
                                         bit='#9aa0aa', cart='#5a4a3a', crystal='#c070ff', lamp='#fff4c0', glow='#e0a0ff', belt='#2a2a30'))
    m.box('root', 'ground', -7.0, 7.0, 0.0, 1.2, -7.0, 7.0, 'rock', decal='rift')
    for i, (x, z) in enumerate(((-3.4, -3.4), (3.4, -3.4), (-3.4, 3.4), (3.4, 3.4))):
        m.box('root', f'leg{i}', x - 0.35, x + 0.35, 1.2, 12.0, z - 0.35, z + 0.35, 'frame', rot=(5 * (1 if z < 0 else -1), 0, 5 * (1 if x > 0 else -1)), pivot=(x, 12.0, z))
    m.box('root', 'head', -2.6, 2.6, 11.4, 12.8, -2.6, 2.6, 'frame2', decal='metal')
    for y in (5.0, 8.4):
        for i, (a, b) in enumerate((((-3.0, -3.0), (3.0, -3.0)), ((-3.0, 3.0), (3.0, 3.0)))):
            m.box('root', f'brace{y}_{i}', -2.9, 2.9, y, y + 0.4, a[1] - 0.15 + 0.02 * i, a[1] + 0.15 + 0.02 * i, 'frame2')
    for pre, r, L in (('pre4', 1.0, 9.0), ('lv4', 1.4, 10.4)):
        S = f'{pre}_spin'
        m.bone(S, 'root', (0, 11.4, 0))
        octa(m, S, f'{pre}_shaft', 'y', (0, 0), 11.4 - L * 0.55, 11.4, r * 0.6, 'bit', decal='metal')
        for k in range(3):
            rr = r * (1.0 - 0.28 * k)
            octa(m, S, f'{pre}_bit{k}', 'y', (0, 0), 11.4 - L * 0.55 - 1.4 * (k + 1), 11.4 - L * 0.55 - 1.4 * k, rr, 'bit', decal='drill')
    for i, (x, z) in enumerate(((-5.4, 4.8), (5.2, -5.0))):
        m.box('root', f'cart{i}', x - 1.4, x + 1.4, 1.2, 2.8, z - 1.0, z + 1.0, 'cart', decal='cart')
        m.box('root', f'ore{i}', x - 0.6, x + 0.6, 2.6, 3.8, z - 0.5, z + 0.5, 'crystal', rot=(0, 45, 12), pivot=(x, 2.8, z), decal='crystal')
    pips(m, 1.2, 6.4, bone='root', size=0.4)
    m.bone('lv1_lamps', 'root', (0, 12.8, 0))
    for i, (x, z) in enumerate(((-2.4, -2.4), (2.4, 2.4))):
        m.box('lv1_lamps', f'lv1_lamp{i}', x - 0.4, x + 0.4, 12.8, 13.6, z - 0.4, z + 0.4, 'lamp', decal='lit')
    m.bone('lv2_belt', 'root', (5.0, 2, 0))
    m.box('lv2_belt', 'lv2_belt', 3.8, 6.4, 2.6, 3.0, -3.0, 3.6, 'belt', rot=(-14, 0, 0), pivot=(5.1, 2.8, 0.3), decal='conveyor')
    for z in (-2.6, 3.0):
        m.box('lv2_belt', f'lv2_leg{z}', 4.9, 5.3, 1.2, 2.9 - 0.25 * z, z - 0.2, z + 0.2, 'frame2')
    m.bone('lv3_crystals', 'root', (-5.0, 1.2, -5.0))
    for i, (x, z, h) in enumerate(((-5.6, 5.0, 3.2), (-4.4, 5.6, 2.2), (-5.2, 3.8, 2.6))):
        m.box('lv3_crystals', f'lv3_crys{i}', x - 0.5, x + 0.5, 1.0, 1.2 + h, z - 0.5, z + 0.5, 'crystal', rot=(10 - 8 * i, 45, 14 - 9 * i), pivot=(x, 1.2, z), decal='crystal')
    m.bone('lv5_core', 'root', (0, 15.4, 0))
    m.bone('lv5_core_spin', 'lv5_core', (0, 15.4, 0))
    octa(m, 'lv5_core_spin', 'lv5_orb', 'y', (0, 0), 14.0, 16.8, 1.3, 'glow', decal='lit')
    for i in range(4):
        a = 90 * i + 45
        rad = math.radians(a)
        x, z = 2.4 * math.sin(rad), -2.4 * math.cos(rad)
        m.box('lv5_core_spin', f'lv5_shard{i}', x - 0.3, x + 0.3, 14.4, 16.4, z - 0.3, z + 0.3, 'crystal', rot=(0, -a + 45, 0), pivot=(x, 15.4, z), decal='crystal')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'rift':
            if p.face == 'up':
                k = abs(q[2] - 1.6 * math.sin(q[0] * 0.9))
                if k < 1.0 and abs(q[0]) < 5.5:
                    return lit(p.pal['void']) if k < 0.55 else p.pal['void2']
                return p.pal['rock2'] if (int(q[0] * 1.7) * 3 + int(q[2] * 1.9) * 7) % 6 == 0 else p.col
            return mul(p.col, 0.85)
        if d == 'drill':
            return mul(p.col, 0.7) if int((q[1] + q[0] * 0.6) * 2.2) % 2 else p.col
        if d == 'cart':
            return mul(p.col, 0.75) if p.v < 0.15 or p.v > 0.85 else p.col
        if d == 'crystal':
            k = (q[1] * 0.9 + along(p, q) * 1.7) % 2.4
            return lit(p.pal['glow']) if k < 0.4 else p.col
        if d == 'lit':
            return lit(p.col)
        if d == 'conveyor':
            return mul(p.col, 1.6) if p.face == 'up' and int((q[2] + 10) * 1.6) % 2 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


BUILDINGS = {'DJ Booth': dj_booth, 'Tesla': tesla, 'Pursuit': gunship, 'Gatling Gun': gatling, 'Turret': auto_turret, 'Mercenary Base': merc_camp,
             'Elf Camp': elf_cabin, 'Spotlight Tech': searchlight, 'War Machine': tank, 'Mecha Base': mech_hangar, 'Sentry': tripod_sentry,
             'Void Miner': void_drill}
