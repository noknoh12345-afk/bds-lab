"""Tower looks (tds:skin of tds:tower, see towerSkin in src/game.ts): 0 gunner (offense), 1 medic (support), 2 farm
(income), 3 mortar (defense / splash), 4 sniper nest (cliff), 5 barracks (spawner), 6 = the gunner as a hologram,
7 frost spire (slow / freeze). Original designs.
Shared bones for the animations: root, turret (turns to the target: q.property('tds:yaw')), body, head, arm_l/arm_r,
gun (recoil), barrel (mortar tube), door (barracks), flag, spin, pip1..pip7 (shown by tds:lvl)."""
from __future__ import annotations

import math

from kit import Model, mul
from parts import bags, emblem_px, face_px, figure, flag, lit, pedestal, pips, ring, stone, top_y

PED = dict(stone='#7e828c', disc='#4a78c8', gold='#ffd650')
HUMAN = dict(skin='#e2ba92', shoe='#2a2620', gun='#2c2c34', wood='#7a5232')


def rifle(m, bone, x, y, z, length=10.4, scope=False):
    """a rifle along -z on its own bone (recoil moves the bone back): stock, receiver, barrel, magazine, sight"""
    m.bone(bone, 'body', (x, y, z))
    m.box(bone, 'stock', x - 0.6, x + 0.6, y - 0.8, y + 0.6, z - 0.8, z + 2.2, 'wood')
    m.box(bone, 'receiver', x - 0.65, x + 0.65, y - 0.55, y + 0.85, z - 4.8, z - 0.75, 'gun', decal='gunmetal')
    m.box(bone, 'barrel', x - 0.25, x + 0.25, y + 0.15, y + 0.65, z - length + 1.8, z - 4.75, 'gun')
    m.box(bone, 'mag', x - 0.4, x + 0.4, y - 1.8, y - 0.5, z - 3.6, z - 2.4, 'gun')
    if scope:
        m.box(bone, 'scope', x - 0.45, x + 0.45, y + 0.9, y + 1.8, z - 4.4, z - 1.2, 'gun', decal='scope')
    else:
        m.box(bone, 'sight', x - 0.2, x + 0.2, y + 0.8, y + 1.3, z - 2.6, z - 1.4, 'gun')


def human_decal(p, face='soldier'):
    d, c, q = p.cube['decal'], p.cube, p.local()
    yb = q[1] - c['o'][1]
    if d == 'leg':
        return p.pal['shoe'] if yb < 1.0 else p.col
    if d == 'arm':
        return p.pal['skin'] if yb < 1.3 else p.col
    if d == 'head':
        return face_px(p, face, p.col) if p.face == 'north' else p.col
    if d == 'gunmetal':
        return mul(p.col, 1.25) if p.face != 'down' and p.v < 0.2 else p.col
    if d == 'scope':
        return lit((120, 220, 255)) if p.face == 'north' and 0.25 < p.u < 0.75 and 0.25 < p.v < 0.75 else p.col
    return None


def base_decal(p):
    d = p.cube['decal']
    if d == 'stone':
        return stone(p)
    if d == 'disc':
        q = p.local()
        return mul(p.col, 0.86) if p.face == 'up' and 4.6 < math.hypot(q[0], q[2]) < 5.0 else p.col   # a groove round the top
    if d == 'bags':
        return bags(p)
    return None


def tower(name, materials, variants=None, width=128):
    mats = dict(PED)
    mats.update(materials)
    m = Model(name, density=2.0, width=width, materials=mats, variants=variants)
    m.bone('root')
    return m


# ------------------------------------------------------------------------------------------------ 0 gunner (+ 6 hologram)
def gunner():
    m = tower('tower_gunner', dict(HUMAN, shirt='#5e6e3e', pants='#4a5632', vest='#b49a64', vest2='#8a7448', helmet='#5a6a3a'),
              variants={'': {}, '_holo': {'_tint': (110, 236, 255), '_alpha': 135}})
    top = pedestal(m)
    pips(m, 1.6)
    m.bone('turret', 'root', (0, top, 0))
    f = figure(m, parent='turret', y0=top, arm_l=(-80, 36, 0), arm_r=(-76, -18, 0))
    m.box('body', 'vest', -3.3, 3.3, f['hip'] + 0.9, f['neck'] - 0.25, -1.9, 1.9, 'vest', decal='vest')
    m.box('head', 'helmet', -3.35, 3.35, f['top'] - 1.2, f['top'] + 0.75, -3.4, 3.35, 'helmet', decal='helmet')
    rifle(m, 'gun', -0.6, f['hip'] + 3.7, -1.8)

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        r = base_decal(p) or human_decal(p)
        if r is not None or d in ('stone', 'disc', 'leg', 'arm', 'head', 'gunmetal', 'scope'):
            return r
        if d == 'vest':
            yb = q[1] - c['o'][1]
            if p.face == 'north' and yb < 1.4 and int((q[0] + 10) * 1.0) % 2 == 0:
                return p.pal['vest2']                                     # pouches along the belt line
            return p.col
        if d == 'helmet':
            return mul(p.col, 0.82) if p.face != 'up' and p.v > 0.75 else p.col   # the rim
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 1 medic (support)
def medic():
    m = tower('tower_medic', dict(HUMAN, disc='#3cc864', coat='#eef0f2', coat2='#c4ccd4', pants='#3c4a5a', pole='#9aa0aa', flagc='#f4f4f0',
                                  beret='#2f8a4a', green='#3cc864'))
    top = pedestal(m)
    pips(m, 1.6)
    m.bone('turret', 'root', (0, top, 0))
    f = figure(m, parent='turret', y0=top, arm_l=(-6, 0, -20), arm_r=(-22, 0, 10), mats=('pants', 'coat', 'coat', 'skin'))
    hip, neck, t = f['hip'], f['neck'], f['top']
    m.box('turret', 'pole', -5.6, -5.0, top, top + 20.0, -0.3, 0.3, 'pole')
    m.box('turret', 'finial', -5.75, -4.85, top + 20.0, top + 20.9, -0.45, 0.45, 'gold')
    m.bone('flag', 'turret', (-5.3, top + 19.6, 0.3))
    m.box('flag', 'flag', -5.3, -5.3, top + 15.6, top + 19.6, 0.3, 7.3, 'flagc', only=('east', 'west'), decal='flag', dens=2.0)
    m.box('body', 'kit', -2.2, 2.2, hip + 1.2, neck + 0.2, 1.7, 3.5, 'coat2', decal='kit')
    m.box('head', 'beret', -3.25, 3.1, t - 0.5, t + 0.8, -3.2, 3.25, 'beret', rot=(0, 0, 7), pivot=(0, t, 0))

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        r = base_decal(p) or human_decal(p)
        if r is not None or d in ('stone', 'disc', 'leg', 'arm', 'head'):
            return r
        if d == 'flag':
            return flag(p, 'cross', 0.3, 7.3, top + 15.6, top + 19.6)
        if d == 'kit':
            return emblem_px(p, 'cross', p.col, 0.2, 0.8, 0.15, 0.75) if p.face == 'south' else p.col
        if d == 'torso':
            return p.pal['green'] if p.face == 'north' and abs(q[0]) < 0.3 else p.col     # the coat's green placket
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 2 farm (income)
def farm():
    m = tower('tower_farm', dict(grass='#5aa84a', soil='#6a4a2e', wall='#ecdcb4', beam='#7a5232', roof='#c8463c', roof2='#9a3028',
                                 glass='#78b4dc', brick='#9a5a46', plant='#5ec04a', wheat='#e8c850', sign='#c8a46a', door='#6a4428'))
    m.box('root', 'plot', -7.0, 7.0, 0.0, 1.2, -7.0, 7.0, 'grass', decal='plot')
    m.box('root', 'walls', -4.5, 4.5, 1.2, 7.2, -0.8, 5.2, 'wall', decal='walls', dens={'north': 3.0})
    s = 3.0 * math.sqrt(2) / 2                                        # the gable: a square turned 45 degrees about x
    m.box('root', 'gable', -4.4, 4.4, 7.2 - s, 7.2 + s, 2.2 - s, 2.2 + s, 'wall', rot=(45, 0, 0), pivot=(0, 7.2, 2.2), decal='gable')
    m.slope('root', 'roof_f', -5.2, 5.2, (-1.7, 7.2), (2.2, 11.4), 0.8, 'roof', decal='shingle')     # 47 degrees: an end face never lies in
    m.slope('root', 'roof_b', -5.17, 5.17, (2.2, 11.4), (6.1, 7.2), 0.8, 'roof', decal='shingle')   # the other slope's plane; 0.03 narrower
    m.box('root', 'ridge', -5.3, 5.3, 10.95, 11.75, 1.8, 2.6, 'roof2', rot=(45, 0, 0), pivot=(0, 11.35, 2.2))
    m.bone('chimney', 'root', (2.6, 12.6, 4.0), locators={'smoke': (2.6, 13.0, 4.0)})
    m.box('chimney', 'chimney', 2.0, 3.2, 8.2, 12.6, 3.4, 4.6, 'brick', decal='brick')
    m.box('root', 'post', 4.6, 5.0, 1.2, 4.6, -5.4, -5.0, 'beam')
    m.box('root', 'sign', 3.4, 6.2, 3.4, 6.2, -5.75, -5.45, 'sign', decal='sign', dens={'north': 2.9})
    for i, (px, pz) in enumerate([(sx * 5.8, z) for sx in (1, -1) for z in (0.4, 2.6, 4.8)]):    # crops beside the house
        m.box('root', f'crop{i}a', px - 0.9, px + 0.9, 1.2, 3.6, pz, pz, 'plant', only=('north', 'south'), decal='crop', dens=3.0)
        m.box('root', f'crop{i}b', px, px, 1.2, 3.6, pz - 0.9, pz + 0.9, 'plant', only=('east', 'west'), decal='crop', dens=3.0)
    pips(m, 1.2)

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'plot':
            if p.face == 'up':
                if abs(abs(q[0]) - 5.8) < 1.1 and q[2] > -0.6:
                    return p.pal['soil'] if int((q[2] + 10) * 2.2) % 2 else mul(p.pal['soil'], 0.86)   # furrows under the crops
                return mul(p.col, 0.93) if (int(q[0] * 3.1) * 7 + int(q[2] * 2.7) * 3) % 11 == 0 else p.col
            return p.pal['soil'] if q[1] < 0.8 else p.col
        if d == 'walls':
            yb = q[1] - 1.2
            if p.face == 'north':
                if abs(q[0]) < 1.0 and yb < 3.6:
                    return p.pal['beam'] if abs(q[0]) > 0.75 or yb > 3.35 else p.pal['door']          # the door and its frame
                for wx in (-2.8, 2.8):
                    if abs(q[0] - wx) < 0.9 and 2.4 < yb < 4.2:
                        return p.pal['beam'] if abs(q[0] - wx) < 0.12 or abs(yb - 3.3) < 0.12 else p.pal['glass']
            if p.face != 'up' and (yb > 5.6 or yb < 0.3):
                return p.pal['beam']                                                                  # timber at the eaves and sill
            if p.face in ('north', 'south') and abs(abs(q[0]) - 4.3) < 0.2:
                return p.pal['beam']                                                                  # corner posts
            return p.col
        if d == 'gable':
            return mul(p.col, 0.94) if p.face in ('east', 'west') and int((q[1] - c['o'][1]) * 2) % 2 else p.col
        if d == 'shingle':
            row = int((q[2] - c['o'][2]) * 1.4)
            if p.face == 'up':
                return mul(p.col, 0.84) if ((q[2] - c['o'][2]) * 1.4) % 1 < 0.22 or int((q[0] + 10 + (row % 2) * 0.6) * 1.0) % 2 == 0 and ((q[2] - c['o'][2]) * 1.4) % 1 < 0.5 else p.col
            return p.pal['roof2']
        if d == 'brick':
            yy = (q[1] - c['o'][1]) * 2.4
            return mul(p.col, 0.78) if yy % 1 < 0.22 else p.col
        if d == 'sign':
            if p.face == 'north':
                return emblem_px(p, 'coin', p.col, 0.12, 0.88, 0.12, 0.88)
            return p.col
        if d == 'crop':
            q2 = q[0] if p.face in ('north', 'south') else q[2]
            cx = c['o'][0] + c['s'][0] / 2 if p.face in ('north', 'south') else c['o'][2] + c['s'][2] / 2
            a, yb = (q2 - cx) / 0.9, q[1] - 1.2                                                       # -1..1 across, height
            if yb > 1.6:
                return p.pal['wheat'] if abs(a) < 0.45 and yb < 2.3 else None                         # the ear
            leaf = abs(a) < 0.18 or abs(abs(a) - (yb / 1.6) * 0.9) < 0.22
            return (p.col if yb > 0.5 else mul(p.col, 0.85)) if leaf else None
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 3 mortar (defense / splash)
def mortar():
    m = tower('tower_mortar', dict(disc='#c86a32', bag='#b49a64', metal='#4a4e56', metal2='#2e3036', crate='#8a5a32', brass='#d8a838'))
    top = pedestal(m)
    pips(m, 1.6)
    ring(m, 'root', 'bag', 5.4, top - 0.1, top + 2.4, 'bag')
    m.bone('turret', 'root', (0, top, 0))
    m.box('turret', 'plate', -2.4, 2.4, top, top + 0.6, -2.4, 2.4, 'metal')
    m.bone('barrel', 'turret', (0, top + 1.2, 0), rot=(-50, 0, 0))                # the tube pitched up toward the front
    m.box('barrel', 'tube', -0.9, 0.9, top + 0.3, top + 2.1, -7.0, 1.0, 'metal', decal='tube')
    m.box('barrel', 'muzzle', -1.1, 1.1, top + 0.1, top + 2.3, -7.2, -6.2, 'metal2')
    for sx in (1, -1):                                                              # a bipod from the plate to the tube
        m.box('turret', f'bipod_{"l" if sx > 0 else "r"}', sx * 1.4 - 0.2, sx * 1.4 + 0.2, top + 0.4, top + 4.0, -3.0, -2.6, 'metal2',
              rot=(-22, 0, sx * -12), pivot=(sx * 1.4, top + 0.4, -2.8))
    m.box('root', 'crate', 2.6, 4.6, top, top + 1.4, 1.0, 3.6, 'crate', decal='crate')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        r = base_decal(p)
        if r is not None:
            return r
        if d == 'tube':
            return mul(p.col, 1.25) if int((q[2] + 10) * 0.8) % 3 == 0 else p.col
        if d == 'crate':
            if p.face == 'up':
                return p.pal['brass'] if (int((q[0] - 2.6) * 2.5) % 2 == 0 and int((q[2] - 1.0) * 2.5) % 2 == 0) else mul(p.col, 0.6)
            return mul(p.col, 0.8) if p.u < 0.12 or p.u > 0.88 or p.v < 0.15 or p.v > 0.85 else p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 4 sniper nest (cliff)
def sniper():
    m = tower('tower_sniper', dict(HUMAN, disc='#8a5aa8', ghillie='#5e7a3e', ghillie2='#465e2e', pants='#4a5632', hat='#6a7a46', bag='#a89060'))
    top = pedestal(m)
    pips(m, 1.6)
    ring(m, 'root', 'bag', 5.4, top - 0.1, top + 1.8, 'bag')
    m.bone('turret', 'root', (0, top, 0))
    f = figure(m, parent='turret', y0=top, arm_l=(-84, 34, 0), arm_r=(-78, -16, 0), mats=('pants', 'ghillie', 'ghillie', 'skin'))
    t = f['top']
    m.box('head', 'brim', -3.8, 3.8, t - 1.0, t - 0.4, -3.8, 3.8, 'hat')
    m.box('head', 'crown', -2.9, 2.9, t - 0.45, t + 1.2, -2.9, 2.9, 'hat', decal='hat')
    rifle(m, 'gun', -0.6, f['hip'] + 3.7, -1.8, length=14.0, scope=True)

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        r = base_decal(p) or human_decal(p)
        if r is not None or d in ('stone', 'disc', 'leg', 'arm', 'head', 'gunmetal', 'scope'):
            return r
        if d in ('torso',):
            return p.pal['ghillie2'] if (q[0] * 2.1 + q[1] * 1.3 + q[2]) % 1.7 < 0.6 else p.col          # camouflage blotches
        if d == 'hat':
            return mul(p.col, 0.78) if p.face != 'up' and p.v > 0.65 else p.col                            # the band
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 5 barracks (spawner)
def barracks():
    m = tower('tower_barracks', dict(concrete='#9a9ea6', wall='#7a8a5a', roof='#4a5238', door='#8a8e96', stripe='#ffd650', dark='#2a2c30',
                                     pole='#c8ccd4', flagc='#3c5ab4', bag='#b49a64', glow='#ff4a3c'))
    m.box('root', 'pad', -7.0, 7.0, 0.0, 1.0, -7.0, 7.0, 'concrete', decal='pad')
    m.box('root', 'hall', -5.2, 5.2, 1.0, 9.4, -3.0, 5.6, 'wall', decal='hall', dens={'north': 3.0})
    m.box('root', 'roof', -5.6, 5.6, 9.4, 10.2, -3.4, 6.0, 'roof', decal='roof')
    m.bone('door', 'root', (0, 6.8, -3.15))                                        # hinged at its top front edge: it swings up and out
    m.box('door', 'door', -3.0, 3.0, 1.0, 6.8, -3.25, -3.05, 'door', decal='slats')
    m.box('root', 'lamp', -0.5, 0.5, 7.0, 7.5, -3.5, -3.0, 'glow')
    m.box('root', 'pole', 4.4, 4.8, 10.2, 18.2, 4.6, 5.0, 'pole')
    m.bone('flag', 'root', (4.6, 17.8, 5.0))
    m.box('flag', 'flag', 4.6, 4.6, 14.6, 17.8, 5.0, 10.2, 'flagc', only=('east', 'west'), decal='flag', dens=2.0)
    m.pair('root', 'root', 'sandbags', 3.6, 6.4, 1.0, 2.6, -5.2, -3.6, 'bag', decal='bags')
    pips(m, 1.0)

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        r = base_decal(p)
        if r is not None:
            return r
        if d == 'pad':
            if p.face == 'up' and q[2] < -3.0 and abs(q[0]) < 3.4:
                return p.pal['stripe'] if int((q[0] - q[2] + 20) * 1.2) % 2 else p.pal['dark']           # hazard stripes at the apron
            return mul(p.col, 0.9) if p.face == 'up' and (abs(q[0] % 3.5) < 0.12 or abs(q[2] % 3.5) < 0.12) else p.col
        if d == 'hall':
            yb = q[1] - 1.0
            if p.face == 'north':
                if abs(q[0]) < 3.0 and yb < 5.8:
                    return p.pal['dark']                                           # the opening behind the door
                if abs(q[0]) < 3.4 and yb < 6.2:
                    return p.pal['stripe']                                         # the door frame
                return emblem_px(p, 'star', p.col, 0.4, 0.6, 0.0, 0.24)
            return mul(p.col, 0.88) if int(yb * 1.25) % 2 else p.col              # corrugated sides
        if d == 'roof':
            return p.pal['dark'] if p.face != 'up' else p.col
        if d == 'slats':
            return mul(p.col, 0.78) if p.face in ('north', 'south') and ((q[1] - c['o'][1]) * 1.6) % 1 < 0.25 else p.col
        if d == 'flag':
            return flag(p, 'star', 5.0, 10.2, 14.6, 17.8)
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 7 frost spire (slow / freeze)
def frost():
    m = tower('tower_frost', dict(stone='#8a9ab4', disc='#78c8f0', ice='#9ae4ff', ice2='#5ab4e8', ice3='#e0f8ff', glow='#d8ffff'))
    top = pedestal(m)
    pips(m, 1.6)
    m.bone('turret', 'root', (0, top, 0))
    m.box('turret', 'spire', -1.8, 1.8, top, top + 10.5, -1.8, 1.8, 'ice', rot=(0, 45, 0), pivot=(0, top, 0), decal='crystal')
    m.box('turret', 'tip', -1.3, 1.3, top + 9.2, top + 11.8, -1.3, 1.3, 'ice3', rot=(45, 0, 35.264), pivot=(0, top + 10.5, 0), decal='crystal')
    m.box('turret', 'shard_l', 2.6, 4.0, top, top + 5.5, -0.7, 0.7, 'ice', rot=(0, 0, 20), pivot=(3.3, top, 0), decal='crystal')
    m.mirror('shard_l', 'shard_r')
    m.box('turret', 'shard_f', -0.7, 0.7, top, top + 4.6, -4.0, -2.6, 'ice', rot=(20, 0, 0), pivot=(0, top, -3.3), decal='crystal')
    m.box('turret', 'shard_b', -0.7, 0.7, top, top + 4.2, 2.6, 4.0, 'ice', rot=(-20, 0, 0), pivot=(0, top, 3.3), decal='crystal')
    m.bone('spin', 'turret', (0, top + 7.0, 0))
    for i in range(3):                                                             # three shards orbiting the spire
        a = math.radians(120 * i)
        x, z = 5.0 * math.sin(a), -5.0 * math.cos(a)
        m.box('spin', f'orbit{i}', x - 0.5, x + 0.5, top + 6.0, top + 8.0, z - 0.5, z + 0.5, 'ice3', rot=(0, 45 + 120 * i, 0), pivot=(x, top + 7.0, z), decal='crystal')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        r = base_decal(p)
        if r is not None:
            return r
        if d == 'crystal':
            k = (q[1] * 0.9 + (q[2] if p.face in ('east', 'west') else q[0]) * 1.7) % 2.4
            if k < 0.3:
                return lit(p.pal['glow'])                                          # a bright vein that lights itself
            return p.pal['ice2'] if k > 1.9 else p.col
        return p.col
    m.decal = decal
    return m


TOWERS = [gunner, medic, farm, mortar, sniper, barracks, gunner, frost]     # index = tds:skin; 6 uses tower_gunner_holo
