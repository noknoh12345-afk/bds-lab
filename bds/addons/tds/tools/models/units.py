"""Unit looks (tds:skin of tds:unit, see unitSkin in src/game.ts): 0 jeep, 1 soldier, 2 sentry, 3 skeleton (the soldier's
second texture), 4 ice turret, 5-7 soldier. Original designs.
Built: jeep, sentry, ice. The soldier and the skeleton wear vanilla bodies with our gear (vanilla.py); soldier() here is
kept, not built. Shared bones: root, body, head, leg_l/leg_r, arm_l/arm_r, helmet (hidden for the skeleton), wheel_fl/fr/bl/br."""
from __future__ import annotations

import math

from kit import Model, mul
from parts import face_px, figure, lit, sample, spr


# ------------------------------------------------------------------------------------------------ 0 jeep
def jeep():
    m = Model('unit_jeep', density=2.0, width=128, materials=dict(paint='#6a7a46', paint2='#4e5c32', dark='#26262c', tyre='#1e1e22', rim='#8a8e96',
                                                                  glass='#78b4dc', metal='#5a5e66', light='#fff4b0', gun='#2c2c34', star='#f0ece0'), glow=('light',))
    m.bone('root')
    m.box('root', 'hull', -3.2, 3.2, 1.8, 4.4, -5.8, 5.4, 'paint', decal='hull')
    m.slope('root', 'hood', -3.0, 3.0, (-5.9, 4.3), (-2.2, 5.0), 0.8, 'paint', decal='hood')
    m.box('root', 'screen', -3.0, 3.0, 5.0, 7.0, -2.45, -2.15, 'glass', rot=(-15, 0, 0), pivot=(0, 5.0, -2.3), decal='screen')
    m.box('root', 'bar', -3.0, 3.0, 6.6, 7.0, 1.8, 2.2, 'metal')
    m.pair('root', 'root', 'post', 2.6, 3.0, 4.4, 6.65, 1.8, 2.2, 'metal')
    m.pair('root', 'root', 'lamp', 1.6, 2.6, 3.2, 3.9, -5.95, -5.75, 'light')
    m.bone('head', 'root', (0, 4.4, 0.6))
    m.box('head', 'mount', -0.25, 0.25, 4.4, 6.4, 0.4, 0.9, 'metal')
    m.box('head', 'mg', -0.4, 0.4, 6.4, 7.2, -3.0, 1.2, 'gun')
    for name, x, z in (('fl', 1, -3.6), ('fr', -1, -3.6), ('bl', 1, 3.6), ('br', -1, 3.6)):
        cx = x * 3.3
        m.bone(f'wheel_{name}', 'root', (cx, 1.7, z))
        m.octa_x(f'wheel_{name}', f'w{name}', cx - 0.7, cx + 0.7, 1.7, z, 1.7, 'tyre', decal='tyre')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'tyre':
            if p.face in ('east', 'west'):
                bone = m.bmap[c['bone']]['pivot']
                r = math.hypot(q[1] - bone[1], q[2] - bone[2])                    # radial: no seams between the slabs
                return p.pal['rim'] if r < 0.95 else p.pal['dark'] if r < 1.15 else p.col
            return mul(p.col, 0.7) if int((q[0] + 10) * 3) % 2 == 0 else p.col     # tread
        if d == 'hull':
            if p.face in ('east', 'west') and abs(q[2]) < 1.8 and 2.6 < q[1] < 3.9:
                s = sample(spr('emblems', 'star'), (q[2] + 1.8) / 3.6, (3.9 - q[1]) / 1.3 * 0.5 + 0.25)
                return mul(p.pal['star'], 0.95) if s[3] else p.col                 # a white star on each door
            return p.pal['paint2'] if q[1] < 2.4 else p.col
        if d == 'hood':
            return mul(p.col, 0.86) if p.face == 'up' and abs(q[0]) < 0.25 else p.col
        if d == 'screen':
            return p.pal['metal'] if p.u < 0.08 or p.u > 0.92 or p.v < 0.15 or p.v > 0.85 else p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 1 soldier (+ 3 skeleton)
def soldier():
    m = Model('unit_soldier', density=1.5, width=64,
              materials=dict(skin='#e2ba92', shirt='#5e6e3e', pants='#4a5632', shoe='#2a2620', helmet='#5a6a3a', gun='#2c2c34', dark='#3a3440'),
              variants={'': {}, '_skeleton': {'skin': '#e8e4d4', 'shirt': '#e8e4d4', 'pants': '#dcd6c4', 'shoe': '#b4ae9c'}})
    m.bone('root')
    f = figure(m, arm_l=(-58, 26, 0), arm_r=(-50, -10, 0))
    t = f['top']
    m.bone('helmet', 'head', (0, t, 0))
    m.box('helmet', 'helmet', -3.35, 3.35, t - 1.2, t + 0.75, -3.4, 3.35, 'helmet')
    gy = f['hip'] + 3.0
    m.bone('gun', 'body', (-0.6, gy, -1.8))
    m.box('gun', 'rifle', -1.1, -0.1, gy - 0.5, gy + 0.6, -7.5, 0.6, 'gun')

    def skeleton(p, q, c, d):
        yb = q[1] - c['o'][1]
        dark = p.pal['dark']
        if d == 'head':
            return face_px(p, 'skeleton', p.col) if p.face == 'north' else p.col
        if d == 'torso':
            if p.face in ('north', 'south') and (abs(q[0]) < 0.35 or (yb > 1.4 and ((yb - 1.4) % 1.1) < 0.4)):
                return p.col if abs(q[0]) < 0.35 else dark                     # spine and ribs
            if p.face in ('north', 'south') and yb <= 1.4:
                return dark                                                    # the hollow below the ribs
            return p.col
        if d in ('leg', 'arm'):
            return dark if abs(yb - c['s'][1] / 2) < 0.3 else p.col           # a knee / an elbow
        return p.col

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if p.variant == '_skeleton':
            return skeleton(p, q, c, d)
        yb = q[1] - c['o'][1]
        if d == 'leg':
            return p.pal['shoe'] if yb < 1.0 else p.col
        if d == 'arm':
            return p.pal['skin'] if yb < 1.3 else p.col
        if d == 'head':
            return face_px(p, 'soldier', p.col) if p.face == 'north' else p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 2 sentry
def sentry():
    m = Model('unit_sentry', density=2.0, width=64, materials=dict(metal='#8a8e96', metal2='#5e626a', dark='#2a2c30', wood='#7a5232', glow='#ff4a3c'))
    m.bone('root')
    for i in range(3):                                         # a tripod: each leg pitched out from the hub, then turned
        m.box('root', f'leg{i}', -0.45, 0.45, 0.0, 6.6, -0.45, 0.45, 'metal2', rot=(-30, 120 * i, 0), pivot=(0, 6.2, 0))
    m.bone('head', 'root', (0, 6.4, 0))
    m.box('head', 'body', -1.6, 1.6, 6.0, 8.6, -2.4, 2.0, 'metal', decal='body')
    m.box('head', 'barrel', -0.35, 0.35, 7.0, 7.7, -7.4, -2.35, 'dark')
    m.box('head', 'ammo', 1.6, 2.8, 6.2, 7.8, -1.2, 0.8, 'wood')
    m.box('head', 'eye', -0.5, 0.5, 8.6, 9.1, -2.2, -1.4, 'glow')

    def decal(p):
        q = p.local()
        return mul(p.col, 0.8) if p.face != 'up' and int((q[1] - 6.0) * 2) % 2 else p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 4 ice turret
def ice():
    m = Model('unit_ice', density=2.0, width=64, materials=dict(stone='#8a9ab4', ice='#9ae4ff', ice2='#5ab4e8', ice3='#e0f8ff', glow='#d8ffff'))
    m.bone('root')
    m.octa_y('root', 'base', 0, 0, 0.0, 1.2, 3.4, 'stone')
    m.bone('head', 'root', (0, 1.2, 0))
    m.box('head', 'spire', -1.3, 1.3, 1.2, 7.4, -1.3, 1.3, 'ice', rot=(0, 45, 0), pivot=(0, 1.2, 0), decal='crystal')
    m.box('head', 'tip', -0.95, 0.95, 6.5, 8.4, -0.95, 0.95, 'ice3', rot=(45, 0, 35.264), pivot=(0, 7.4, 0), decal='crystal')
    m.box('head', 'shard_l', 1.6, 2.6, 1.2, 4.6, -0.5, 0.5, 'ice', rot=(0, 0, 22), pivot=(2.1, 1.2, 0), decal='crystal')
    m.mirror('shard_l', 'shard_r')

    def decal(p):
        q = p.local()
        k = (q[1] * 0.9 + (q[2] if p.face in ('east', 'west') else q[0]) * 1.7) % 2.0
        return lit(p.pal['glow']) if k < 0.28 else p.pal['ice2'] if k > 1.6 else p.col
    m.decal = decal
    return m


UNITS = [jeep, soldier, sentry, soldier, ice, soldier, soldier, soldier]    # index = tds:skin; 3 uses unit_soldier_skeleton
