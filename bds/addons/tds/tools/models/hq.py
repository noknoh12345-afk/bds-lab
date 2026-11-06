"""Original-level towers: detailed gear on the vanilla figure towers and detailed buildings / machines, each changing its
look with the tower's level like the original's upgrade models (bones lvN_*, preN_*, rAtoB_*: see hq_parts / entities).
Original designs throughout; vanilla bodies are referenced, never copied (vanilla.py)."""
from __future__ import annotations

import math

from hq_parts import along, flash, helmet, hq_decal, octa, pedestal, pips, rifle, vest
from kit import Model, mix, mul
from parts import emblem_px, flag, lit
from vanilla import PED_TOP, PILLAGER, WITCH, gear

GUN = dict(gun='#2c2c34', gun2='#4a4a54', flash='#fff0a0', trim='#5a5e68', gold='#ffd650', glow='#7cff8c')


def tower_gear(name, rig, mats, emblem, variants=None):
    m = gear(name, rig, {**dict(stone='#7e828c', disc='#4a78c8'), **GUN, **mats}, density=2.0, width=256, variants=variants)
    m.glow |= {'flash', 'glow'}
    m.bone('tds_base', None, (0, 0, 0))
    pedestal(m)
    pips(m, 3.0, 12.35)
    m.emblem = emblem
    return m


def decal_with(m, own):
    def decal(p):
        r = hq_decal(p, m.emblem)
        if r is not False:
            return r
        return own(p) if own else p.col
    return decal


# ------------------------------------------------------------------------------------------------ gunner (0, 6 hologram)
def gunner():
    m = tower_gear('gear_gunner', PILLAGER, dict(helmet='#5a6a3a', band='#3e4a28', vest='#b49a64', pouch='#8a7448', pad='#3a3a40',
                                                  belt='#4a3a2a', buckle='#c8b060', ammo='#c89a3a'), 'chevron',
                   variants={'': {}, '_holo': {'_tint': (110, 236, 255), '_alpha': 135}})
    helmet(m, 'head', 0, 0, 30.4, 34.6, 4.75, 'helmet', band='band')
    m.box('body', 'belt', -4.85, 4.85, 12.2, 13.6, -3.85, 3.85, 'belt', decal='belt')
    m.bone('gun', 'body', (-1.6, 19.0, -4.6))
    mz = rifle(m, 'pre4_ar', 'gun', (-1.6, 19.0, -4.6), 'ar', sight='iron')
    flash(m, 'pre4_ar', 'pre4_flash', *mz)
    m.bone('r1to4_dot', 'gun', (-1.6, 20.5, -6.0))
    m.box('r1to4_dot', 'r1to4_dot', -2.2, -1.0, 20.48, 21.8, -9.2, -7.2, 'gun', decal='lens')
    m.bone('lv1_goggles', 'head', (0, 31.4, -4.9))
    for sx in (-1, 1):
        octa(m, 'lv1_goggles', f'lv1_lens{"l" if sx > 0 else "r"}', 'z', (sx * 1.7, 31.4), -5.6, -4.65, 0.95, 'gun', decal='goggle')
    m.bone('lv2_vest', 'body', (0, 18, 0))
    vest(m, 'lv2_vest', -4.95, 4.95, 14.0, 24.9, -3.95, 3.95, 'vest', 'pouch', tag='lv2_vest')
    for b, x0, x1 in (('leftLeg', 0.05, 4.3), ('rightLeg', -4.3, -0.05)):       # one pad per leg, a slit between them
        m.bone(f'lv3_knee_{b}', b, (0, 6, 0))
        m.box(f'lv3_knee_{b}', f'lv3_knee_{b}', x0, x1, 4.9, 7.4, -2.6, -1.0, 'pad')
    for b, x0, x1 in (('leftarm', 3.55, 8.45), ('rightarm', -8.45, -3.55)):
        m.bone(f'lv3_glove_{b}', b, (0, 13, 0))
        m.box(f'lv3_glove_{b}', f'lv3_glove_{b}', x0, x1, 11.6, 14.4, -2.45, 2.45, 'pad', decal='glove')
    m.bone('lv3_headset', 'head', (0, 30, 0))
    m.pair('lv3_headset', 'lv3_headset', 'lv3_cup', 4.7, 5.6, 27.6, 30.6, -1.4, 1.4, 'gun2')
    m.box('lv3_headset', 'lv3_mic', -4.0, -3.6, 27.8, 28.2, -5.4, -1.4, 'gun')
    mz = rifle(m, 'lv4_lmg', 'gun', (-1.6, 19.0, -4.6), 'lmg', sight='dot')
    flash(m, 'lv4_lmg', 'lv4_flash', *mz)
    m.bone('lv4_belt', 'body', (0, 18, 0))
    m.box('lv4_belt', 'lv4_belt', -0.9, 0.9, 11.0, 26.0, -4.4, -4.0, 'ammo', rot=(0, 0, 38), pivot=(0, 18.5, -4.2), decal='bullets')
    m.bone('lv5_band', 'head', (0, 30, 0))
    octa(m, 'lv5_band', 'lv5_gold', 'y', (0, 0), 31.9, 32.5, 4.95, 'gold', decal='trim')
    m.bone('lv5_pack', 'body', (0, 18, 4))
    m.box('lv5_pack', 'lv5_pack', -3.4, 3.4, 14.4, 23.6, 3.9, 7.0, 'pouch', decal='pouch')
    m.box('lv5_pack', 'lv5_mast', 2.2, 2.5, 23.5, 33.0, 5.2, 5.5, 'gun')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'belt':
            if p.face in ('up', 'down'):
                return None
            return p.pal['buckle'] if p.face == 'north' and abs(q[0]) < 0.9 else p.col
        if d == 'glove':
            return None if p.face in ('up',) else p.col
        if d == 'bullets':
            return p.pal['gold'] if int((q[1] - c['o'][1]) * 1.6) % 2 == 0 and p.face == 'north' else mul(p.col, 0.8)
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ sniper (4)
def sniper():
    m = tower_gear('gear_sniper', PILLAGER, dict(disc='#8a5aa8', hat='#6a7a46', hat2='#4e5a32', ghillie='#5e7a3e', ghillie2='#465e2e',
                                                  bag='#a89060', glass='#9ad8ff'), 'sight')
    from parts import ring
    ring(m, 'tds_base', 'bag', 10.3, PED_TOP - 0.2, PED_TOP + 3.6, 'bag')
    m.box('head', 'brim', -6.6, 6.6, 31.8, 32.9, -6.6, 6.6, 'hat')
    octa(m, 'head', 'crown', 'y', (0, 0), 32.8, 36.0, 4.6, 'hat', decal='hatband')
    m.box('body', 'cape', -4.9, 4.9, 8.0, 24.9, -3.9, 3.9, 'ghillie', decal='ghillie')
    m.bone('gun', 'body', (-1.6, 19.0, -4.6))
    mz = rifle(m, 'pre4_sr', 'gun', (-1.6, 19.0, -4.6), 'sr', sight='scope')
    flash(m, 'pre4_sr', 'pre4_flash', *mz)
    m.bone('lv1_ghillie', 'body', (0, 24, 0))
    m.rise_x('lv1_ghillie', 'lv1_gh_l', (2.4, 25.6), (8.8, 22.8), -2.8, 2.8, 0.6, 'ghillie', decal='tatter')
    m.mirror('lv1_gh_l', 'lv1_gh_r')
    m.bone('r2to4_bipod', 'gun', (-1.6, 18.2, -15.0))
    for sx in (-1, 1):
        m.box('r2to4_bipod', f'r2to4_leg{"l" if sx > 0 else "r"}', -1.6 + sx * 0.6 - 0.2, -1.6 + sx * 0.6 + 0.2, 13.6, 18.4, -15.2, -14.8, 'gun2',
              rot=(-12, 0, sx * -14), pivot=(-1.6, 18.2, -15.0))
    m.box('r2to4_bipod', 'r2to4_can', -2.3, -0.9, 18.55, 20.15, -27.3, -23.2, 'gun', decal='gunmetal')     # a suppressor round the muzzle
    m.bone('lv3_range', 'head', (0, 36, 0))
    m.box('lv3_range', 'lv3_range', 1.6, 3.8, 35.9, 37.4, -2.6, 1.4, 'gun2', decal='range')
    mz = rifle(m, 'lv4_amr', 'gun', (-1.6, 19.0, -4.6), 'amr', sight='scope')
    flash(m, 'lv4_amr', 'lv4_flash', *mz)
    m.bone('lv5_bags', 'tds_base', (0, PED_TOP + 3.6, 0))
    ring(m, 'lv5_bags', 'lv5_bag', 10.0, PED_TOP + 3.5, PED_TOP + 5.9, 'bag')            # the second course set back 0.3
    m.bone('lv5_laser', 'gun', (-1.6, 18.0, -16.0))
    m.box('lv5_laser', 'lv5_laser', -0.7, 0.3, 17.4, 18.4, -20.0, -16.0, 'gold', decal='lens')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'hatband':
            return p.pal['hat2'] if p.face != 'up' and p.v > 0.6 else p.col
        if d in ('ghillie', 'tatter'):
            if p.face in ('up', 'down') and d == 'ghillie':
                return None
            if d == 'ghillie' and p.face == 'north' and abs(q[0]) < 2.2:
                return None
            yb = q[1] - c['o'][1]
            if d == 'ghillie' and yb < 1.4 * abs(math.sin(along(p, q) * 2.3)):
                return None
            return p.pal['ghillie2'] if (q[0] * 1.3 + q[1] * 0.9 + q[2]) % 2.6 < 1.0 else p.col
        if d == 'range':
            return lit((255, 70, 60)) if p.face == 'north' and p.u < 0.4 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ medic (1)
def medic():
    m = tower_gear('gear_medic', WITCH, dict(disc='#3cc864', pole='#9aa0aa', flagc='#f4f4f0', glass='#9ad8ff', potion='#ff5a8a',
                                              potion2='#7cff8c', cork='#8a5a32', kit='#eef0f2', red='#e04848', staff='#8a5a32'), 'cross')
    m.box('body', 'pole', -10.6, -9.6, 0.0, 40.0, -0.5, 0.5, 'pole')
    m.box('body', 'finial', -10.9, -9.3, 40.0, 41.6, -0.8, 0.8, 'gold')
    m.bone('flag', 'body', (-10.1, 39.4, 0.5))
    m.box('flag', 'flag', -10.1, -10.1, 31.4, 39.4, 0.5, 14.5, 'flagc', only=('east', 'west'), decal='flag', dens=1.2)
    for i, (x, mat) in enumerate(((-2.6, 'potion'), (0.0, 'potion2'), (2.6, 'potion'))):
        m.box('body', f'bottle{i}', x - 0.9, x + 0.9, 11.2, 13.8, -4.6, -3.6, mat, decal='bottle')
        m.box('body', f'cork{i}', x - 0.45, x + 0.45, 13.8, 14.6, -4.35, -3.85, 'cork')
    m.bone('lv1_kit', 'body', (0, 18, 4))
    m.box('lv1_kit', 'lv1_kit', -3.4, 3.4, 14.5, 22.5, 3.6, 6.6, 'kit', decal='kit')
    m.bone('lv2_aura', 'tds_base', (0, 4.6, 0))
    for i in range(8):
        a = math.radians(45 * i + 22.5)
        x, z = 10.4 * math.sin(a), -10.4 * math.cos(a)
        m.box('lv2_aura', f'lv2_glow{i}', x - 1.6, x + 1.6, 4.55, 5.15, z - 0.35, z + 0.35, 'glow', rot=(0, -45 * i - 22.5, 0), pivot=(x, 4.8, z))
    m.bone('lv3_rack', 'body', (0, 13, 0))
    for i, (x, mat) in enumerate(((-3.5, 'potion2'), (3.5, 'potion'))):
        m.box('lv3_rack', f'lv3_bottle{i}', x - 0.9, x + 0.9, 11.2, 13.8, 3.6, 4.6, mat, decal='bottle')
    m.bone('lv4_spin', 'body', (0, 46.0, 0))
    m.box('lv4_spin', 'lv4_cross_v', -0.8, 0.8, 43.0, 49.0, -0.4, 0.4, 'glow')
    m.box('lv4_spin', 'lv4_cross_h', -3.0, 3.0, 45.2, 46.8, -0.35, 0.35, 'glow')
    m.bone('lv5_staff', 'body', (10.0, 0, 0))
    m.box('lv5_staff', 'lv5_staff', 9.6, 10.6, 0.0, 30.0, -2.5, -1.5, 'staff')
    octa(m, 'lv5_staff', 'lv5_orb', 'y', (10.1, -2.0), 30.0, 32.6, 1.3, 'gold', decal='gem')

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'flag':
            return flag(p, 'cross', 0.5, 14.5, 31.4, 39.4)
        if d == 'bottle':
            return p.pal['glass'] if q[1] - c['o'][1] > 1.6 else lit(p.col)
        if d == 'kit':
            return emblem_px(p, 'cross', p.col, 0.2, 0.8, 0.15, 0.75) if p.face == 'south' else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


# ------------------------------------------------------------------------------------------------ buildings and machines (scale 0.7)
def building(name, mats, emblem=None, width=256):
    m = Model(name, density=2.0, width=width, materials={**dict(stone='#7e828c', disc='#4a78c8'), **GUN, **mats})
    m.glow |= {'flash', 'glow'}
    m.bone('root')
    m.emblem = emblem
    return m


def small_pedestal(m):
    octa(m, 'root', 'plinth', 'y', (0, 0), 0.0, 1.6, 7.0, 'stone', decal='stone')
    octa(m, 'root', 'trimband', 'y', (0, 0), 0.35, 0.7, 7.1, 'trim', decal='trim')
    octa(m, 'root', 'top', 'y', (0, 0), 1.4, 2.4, 6.0, 'disc', decal='disc')
    pips(m, 1.6, 6.55, bone='root', size=0.4)
    return 2.4


def farm():
    m = building('tower_farm', dict(grass='#5aa84a', soil='#6a4a2e', wall='#ecdcb4', beam='#7a5232', roof='#c8463c', roof2='#9a3028',
                                    glass='#78b4dc', brick='#9a5a46', plant='#5ec04a', wheat='#e8c850', sign='#c8a46a', door='#6a4428',
                                    silo='#b8bec8', silo2='#8a929e', wood='#a8763c', hay='#e8c860', water='#4a8ad8'))
    m.box('root', 'plot', -7.0, 7.0, 0.0, 1.2, -7.0, 7.0, 'grass', decal='plot')
    m.box('root', 'walls', -4.5, 4.5, 1.2, 7.2, -0.8, 5.2, 'wall', decal='walls', dens={'north': 3.0})
    s = 3.0 * math.sqrt(2) / 2
    m.box('root', 'gable', -4.4, 4.4, 7.2 - s, 7.2 + s, 2.2 - s, 2.2 + s, 'wall', rot=(45, 0, 0), pivot=(0, 7.2, 2.2), decal='gable')
    m.slope('root', 'roof_f', -5.2, 5.2, (-1.7, 7.2), (2.2, 11.4), 0.8, 'roof', decal='shingle')
    m.slope('root', 'roof_b', -5.17, 5.17, (2.2, 11.4), (6.1, 7.2), 0.8, 'roof', decal='shingle')
    m.box('root', 'ridge', -5.3, 5.3, 10.95, 11.75, 1.8, 2.6, 'roof2', rot=(45, 0, 0), pivot=(0, 11.35, 2.2))
    m.bone('chimney', 'root', (2.6, 12.6, 4.0), locators={'smoke': (2.6, 13.0, 4.0)})
    m.box('chimney', 'chimney', 2.0, 3.2, 8.2, 12.6, 3.4, 4.6, 'brick', decal='brick')
    m.box('root', 'step', -1.4, 1.4, 1.22, 1.6, -1.6, -0.75, 'stone')
    for i, (px, pz) in enumerate([(sx * 5.8, z) for sx in (1, -1) for z in (0.4, 2.6)]):
        m.box('root', f'crop{i}a', px - 0.9, px + 0.9, 1.2, 3.6, pz, pz, 'plant', only=('north', 'south'), decal='crop', dens=3.0)
        m.box('root', f'crop{i}b', px, px, 1.2, 3.6, pz - 0.9, pz + 0.9, 'plant', only=('east', 'west'), decal='crop', dens=3.0)
    m.box('root', 'post', 4.6, 5.0, 1.2, 4.6, -5.4, -5.0, 'beam')
    m.box('root', 'sign', 3.4, 6.2, 3.4, 6.2, -5.75, -5.45, 'sign', decal='sign', dens={'north': 2.9})
    pips(m, 1.2, 6.4, bone='root', size=0.4)
    m.bone('lv1_fence', 'root', (0, 1.2, -6.6))
    for i, x in enumerate((-6.6, -3.3, 0.0, 3.3)):
        m.box('lv1_fence', f'lv1_post{i}', x - 0.25, x + 0.25, 1.2, 3.2, -6.85, -6.35, 'wood')
    m.box('lv1_fence', 'lv1_rail0', -6.6, 3.3, 2.5, 2.8, -6.75, -6.45, 'wood')          # the rails end inside the end posts
    m.box('lv1_fence', 'lv1_rail1', -6.6, 3.3, 1.7, 2.0, -6.78, -6.42, 'wood')
    m.bone('lv2_well', 'root', (-4.6, 1.2, -3.6))
    octa(m, 'lv2_well', 'lv2_well', 'y', (-4.6, -3.6), 1.2, 3.0, 1.4, 'stone', decal='stone')
    m.box('lv2_well', 'lv2_water', -5.6, -3.6, 3.05, 3.05, -4.6, -2.6, 'water', only=('up', 'down'), dens=2.0)
    m.bone('lv2_crops', 'root', (5.8, 1.2, 4.8))
    m.box('lv2_crops', 'lv2_crop_a', 4.9, 6.7, 1.2, 3.6, 4.8, 4.8, 'plant', only=('north', 'south'), decal='crop', dens=3.0)
    m.box('lv2_crops', 'lv2_crop_b', 5.8, 5.8, 1.2, 3.6, 3.9, 5.7, 'plant', only=('east', 'west'), decal='crop', dens=3.0)
    for sx in (-1, 1):
        m.box('lv2_well', f'lv2_wpost{sx}', -4.6 + sx * 1.3 - 0.2, -4.6 + sx * 1.3 + 0.2, 2.9, 5.6, -3.8, -3.4, 'wood')
    m.slope('lv2_well', 'lv2_wroof', -6.2, -3.0, (-5.0, 5.4), (-3.6, 6.4), 0.4, 'roof')
    m.bone('lv3_silo', 'root', (-5.7, 1.2, 5.4))
    octa(m, 'lv3_silo', 'lv3_silo', 'y', (-5.7, 5.4), 1.2, 11.0, 1.3, 'silo', decal='silo')
    octa(m, 'lv3_silo', 'lv3_cap', 'y', (-5.7, 5.4), 10.9, 11.9, 1.05, 'roof2')
    m.box('lv3_silo', 'lv3_ladder', -6.1, -5.3, 1.23, 10.5, 6.62, 6.95, 'silo2', decal='ladder')
    m.bone('lv4_spinx', 'root', (5.75, 8.6, 2.2))                                     # a little windmill on the gable end
    for i in range(4):
        m.box('lv4_spinx', f'lv4_blade{i}', 5.6 + 0.025 * i, 5.9 + 0.025 * i, 8.6, 13.6, 1.75, 2.65, 'sign', rot=(90 * i + 45, 0, 0), pivot=(5.75, 8.6, 2.2), decal='blade')
    m.box('lv4_spinx', 'lv4_hub', 5.3, 6.1, 8.0, 9.2, 1.6, 2.8, 'beam')
    m.bone('lv5_gold', 'root', (0, 11.6, 2.2))
    m.box('lv5_gold', 'lv5_ridge', -5.36, 5.36, 10.95, 11.85, 1.75, 2.65, 'gold', rot=(45, 0, 0), pivot=(0, 11.4, 2.2))
    m.box('lv5_gold', 'lv5_hay', 3.0, 5.6, 1.22, 3.0, -3.4, -1.6, 'hay', decal='hay')            # a bale in the yard beside the door

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'plot':
            if p.face == 'up':
                if abs(abs(q[0]) - 5.8) < 1.1 and q[2] > -0.6:
                    return p.pal['soil'] if int((q[2] + 10) * 2.2) % 2 else mul(p.pal['soil'], 0.86)
                if abs(q[0]) < 1.0 and q[2] < -0.8:
                    return mul(p.pal['soil'], 1.15)                                          # a path to the door
                return mul(p.col, 0.93) if (int(q[0] * 3.1) * 7 + int(q[2] * 2.7) * 3) % 11 == 0 else p.col
            return p.pal['soil'] if q[1] < 0.8 else p.col
        if d == 'walls':
            yb = q[1] - 1.2
            if p.face == 'north':
                if abs(q[0]) < 1.0 and yb < 3.6:
                    return p.pal['beam'] if abs(q[0]) > 0.75 or yb > 3.35 else (p.pal['gold'] if abs(q[0] - 0.5) < 0.12 and abs(yb - 1.8) < 0.15 else p.pal['door'])
                for wx in (-2.8, 2.8):
                    if abs(q[0] - wx) < 0.9 and 2.4 < yb < 4.2:
                        return p.pal['beam'] if abs(q[0] - wx) < 0.12 or abs(yb - 3.3) < 0.12 else p.pal['glass']
                    if abs(q[0] - wx) < 1.1 and 2.1 < yb < 2.4:
                        return p.pal['plant'] if int(q[0] * 3) % 2 else p.pal['potion'] if 'potion' in p.pal else p.pal['wheat']   # flower box
            if p.face != 'up' and (yb > 5.6 or yb < 0.3):
                return p.pal['beam']
            if p.face in ('north', 'south') and abs(abs(q[0]) - 4.3) < 0.2:
                return p.pal['beam']
            if p.face in ('east', 'west') and abs(abs(q[2] - 2.2) - 2.8) < 0.2:
                return p.pal['beam']
            return p.col
        if d == 'gable':
            return mul(p.col, 0.94) if p.face in ('east', 'west') and int((q[1] - c['o'][1]) * 2) % 2 else p.col
        if d == 'shingle':
            row = (q[2] - c['o'][2]) * 1.4
            if p.face == 'up':
                return mul(p.col, 0.84) if row % 1 < 0.22 or (int(q[0] + 10 + (int(row) % 2) * 0.6) % 2 == 0 and row % 1 < 0.5) else p.col
            return p.pal['roof2']
        if d == 'brick':
            return mul(p.col, 0.78) if ((q[1] - c['o'][1]) * 2.4) % 1 < 0.22 else p.col
        if d == 'sign':
            return emblem_px(p, 'coin', p.col, 0.12, 0.88, 0.12, 0.88) if p.face == 'north' else p.col
        if d == 'crop':
            q2 = q[0] if p.face in ('north', 'south') else q[2]
            cx = c['o'][0] + c['s'][0] / 2 if p.face in ('north', 'south') else c['o'][2] + c['s'][2] / 2
            a, yb = (q2 - cx) / 0.9, q[1] - 1.2
            if yb > 1.6:
                return p.pal['wheat'] if abs(a) < 0.45 and yb < 2.3 else None
            leaf = abs(a) < 0.18 or abs(abs(a) - (yb / 1.6) * 0.9) < 0.22
            return (p.col if yb > 0.5 else mul(p.col, 0.85)) if leaf else None
        if d == 'silo':
            return mul(p.col, 0.82) if int((q[1] - c['o'][1]) * 0.8) % 2 == 0 and ((q[1] - c['o'][1]) * 0.8) % 1 < 0.15 else p.col
        if d == 'ladder':
            return p.col if (q[1] * 1.4) % 1 < 0.3 or abs(q[2] - 5.0) > 0.25 else None
        if d == 'blade':
            return mul(p.col, 0.8) if int((q[1] - c['o'][1]) * 1.5) % 2 else p.col
        if d == 'hay':
            return mul(p.col, 0.85) if int(along(p, q) * 3 + q[1] * 2) % 3 == 0 else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


def mortar():
    m = building('tower_mortar', dict(disc='#c86a32', bag='#b49a64', metal='#4a4e56', metal2='#2e3036', crate='#8a5a32', brass='#d8a838',
                                      net='#5e7a3e', net2='#46602e', pole='#6a5a40', flagc='#c86a32'), 'bomb')
    from parts import ring
    top = small_pedestal(m)
    ring(m, 'root', 'bag', 5.4, top - 0.1, top + 2.4, 'bag')
    m.bone('turret', 'root', (0, top, 0))
    m.box('turret', 'plate', -2.4, 2.4, top, top + 0.6, -2.4, 2.4, 'metal', decal='plate')
    m.bone('barrel', 'turret', (0, top + 1.2, 0), rot=(-50, 0, 0))
    m.bone('pre3_tube', 'barrel', (0, top + 1.2, 0))
    octa(m, 'pre3_tube', 'pre3_tube', 'z', (0, top + 1.2), -7.0, 1.0, 0.9, 'metal', decal='tube')
    octa(m, 'pre3_tube', 'pre3_mz', 'z', (0, top + 1.2), -7.3, -6.2, 1.1, 'metal2')
    flash(m, 'pre3_tube', 'pre3_flash', 0, top + 1.2, -7.3, 0.9)
    m.bone('lv3_tube', 'barrel', (0, top + 1.2, 0))
    octa(m, 'lv3_tube', 'lv3_tube', 'z', (0, top + 1.2), -8.4, 1.4, 1.2, 'metal', decal='tube')
    octa(m, 'lv3_tube', 'lv3_mz', 'z', (0, top + 1.2), -8.8, -7.4, 1.45, 'metal2')
    m.box('lv3_tube', 'lv3_sight', 1.1, 2.1, top + 1.6, top + 2.8, -2.4, -0.6, 'metal2', decal='lens')
    flash(m, 'lv3_tube', 'lv3_flash', 0, top + 1.2, -8.8, 1.2)
    for sx in (1, -1):
        m.box('turret', f'bipod_{"l" if sx > 0 else "r"}', sx * 1.4 - 0.2, sx * 1.4 + 0.2, top + 0.4, top + 4.0, -3.0, -2.6, 'metal2',
              rot=(-22, 0, sx * -12), pivot=(sx * 1.4, top + 0.4, -2.8))
    m.box('root', 'crate', 2.6, 4.6, top, top + 1.4, 1.0, 3.6, 'crate', decal='crate')
    m.bone('lv1_shells', 'root', (-3.6, top, 2.0))
    for i, (x, z) in enumerate(((-4.2, 1.4), (-3.2, 1.4), (-4.2, 2.6), (-3.2, 2.6))):
        octa(m, 'lv1_shells', f'lv1_shell{i}', 'y', (x, z), top, top + 1.6, 0.42, 'brass', decal='shell')
    m.bone('lv2_bags', 'root', (0, top + 2.4, 0))
    ring(m, 'lv2_bags', 'lv2_bag', 5.1, top + 2.3, top + 4.0, 'bag')                     # the second course set back 0.3
    m.bone('lv4_net', 'root', (0, 13, 0))
    for i, (x, z) in enumerate(((5.2, -5.2), (-5.2, -5.2), (5.2, 5.2), (-5.2, 5.2))):
        m.box('lv4_net', f'lv4_pole{i}', x - 0.25, x + 0.25, top, 12.9, z - 0.25, z + 0.25, 'pole')       # tips through the net
    m.box('lv4_net', 'lv4_cover', -6.0, 6.0, 12.6, 12.6, -6.0, 6.0, 'net', only=('up', 'down'), decal='netting', dens=2.0)
    m.bone('lv5_flag', 'root', (5.2, 12.6, 5.2))
    m.box('lv5_flag', 'lv5_cloth', 5.2, 5.2, 9.6, 12.4, 5.4, 9.6, 'flagc', only=('east', 'west'), decal='flag5', dens=2.0)

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'tube':
            return mul(p.col, 1.25) if int((q[2] + 10) * 0.8) % 3 == 0 else p.col
        if d == 'plate':
            return mul(p.col, 0.7) if p.face == 'up' and (abs(abs(q[0]) - 1.8) < 0.2 and abs(abs(q[2]) - 1.8) < 0.2) else p.col
        if d == 'crate':
            if p.face == 'up':
                return p.pal['brass'] if (int((q[0] - 2.6) * 2.5) % 2 == 0 and int((q[2] - 1.0) * 2.5) % 2 == 0) else mul(p.col, 0.6)
            return mul(p.col, 0.8) if p.u < 0.12 or p.u > 0.88 or p.v < 0.15 or p.v > 0.85 else p.col
        if d == 'shell':
            return mul(p.col, 0.6) if q[1] - c['o'][1] > 1.2 else p.col
        if d == 'netting':
            k = (q[0] + q[2]) % 1.2 < 0.25 or (q[0] - q[2]) % 1.2 < 0.25
            return p.pal['net2'] if k else (p.col if (int(q[0] * 2) + int(q[2] * 2)) % 3 else None)
        if d == 'flag5':
            return flag(p, 'bomb', 5.4, 9.6, 9.6, 12.4)
        return p.col
    m.decal = decal_with(m, own)
    return m


def barracks():
    m = building('tower_barracks', dict(concrete='#9a9ea6', wall='#7a8a5a', roof='#4a5238', door='#8a8e96', stripe='#ffd650', dark='#2a2c30',
                                        pole='#c8ccd4', flagc='#3c5ab4', bag='#b49a64', glow='#ff4a3c', lamp='#fff4c0', dish='#c8ccd4', wood='#8a6a42'))
    m.box('root', 'pad', -7.0, 7.0, 0.0, 1.0, -7.0, 7.0, 'concrete', decal='pad')
    m.box('root', 'hall', -5.2, 5.2, 1.0, 9.4, -3.0, 5.6, 'wall', decal='hall', dens={'north': 3.0})
    m.box('root', 'roof', -5.6, 5.6, 9.4, 10.2, -3.4, 6.0, 'roof', decal='roof')
    m.pair('root', 'root', 'vent', 1.6, 3.4, 10.2, 11.2, 2.6, 4.4, 'door', decal='vent')
    m.bone('door', 'root', (0, 6.8, -3.15))
    m.box('door', 'door', -3.0, 3.0, 1.0, 6.8, -3.25, -3.05, 'door', decal='slats')
    m.box('root', 'lamp', -0.5, 0.5, 7.0, 7.5, -3.5, -3.0, 'glow')
    m.box('root', 'pole', 4.4, 4.8, 10.2, 18.2, 4.6, 5.0, 'pole')
    m.bone('flag', 'root', (4.6, 17.8, 5.0))
    m.box('flag', 'flag', 4.6, 4.6, 14.6, 17.8, 5.0, 10.2, 'flagc', only=('east', 'west'), decal='flag', dens=2.0)
    pips(m, 1.0, 6.4, bone='root', size=0.4)
    m.bone('lv1_bags', 'root', (0, 1, -4.4))
    m.pair('lv1_bags', 'lv1_bags', 'lv1_sandbags', 3.6, 6.4, 1.0, 2.6, -5.2, -3.6, 'bag', decal='bags')
    m.bone('lv2_spin', 'root', (-3.0, 11.6, 2.0))
    m.box('lv2_spin', 'lv2_mast', -3.25, -2.75, 10.2, 12.4, 1.75, 2.25, 'pole')
    m.box('lv2_spin', 'lv2_dish', -4.6, -1.4, 11.6, 14.2, 1.6, 1.9, 'dish', rot=(-20, 0, 0), pivot=(-3.0, 12.8, 1.75), decal='dish')
    m.bone('lv3_lights', 'root', (0, 1, -6))
    for sx in (-1, 1):
        x = sx * 6.2
        m.box('lv3_lights', f'lv3_lpole{sx}', x - 0.2, x + 0.2, 1.0, 8.4, -6.2, -5.8, 'pole')
        m.box('lv3_lights', f'lv3_lamp{sx}', x - 0.8, x + 0.8, 7.8, 8.9, -6.6, -5.6, 'dark', rot=(-25, sx * -25, 0), pivot=(x, 8.4, -6.0), decal='lamp')
    m.bone('lv4_tower', 'root', (-6.2, 1, 4.3))                                       # a watch post beside the hall
    for i, (x, z) in enumerate(((-6.8, 3.0), (-5.6, 3.0), (-6.8, 5.6), (-5.6, 5.6))):
        m.box('lv4_tower', f'lv4_leg{i}', x - 0.2, x + 0.2, 1.0, 12.0, z - 0.2, z + 0.2, 'wood')
    m.box('lv4_tower', 'lv4_deck', -7.0, -5.35, 12.0, 12.5, 2.6, 6.0, 'wood')
    m.box('lv4_tower', 'lv4_hut', -6.95, -5.4, 12.5, 14.6, 2.65, 5.95, 'wall', decal='post')
    m.box('lv4_tower', 'lv4_cap', -7.2, -5.15, 14.6, 15.2, 2.3, 6.3, 'roof')
    m.bone('lv5_star', 'root', (0, 11.4, -3.4))
    m.box('lv5_star', 'lv5_sign', -2.4, 2.4, 10.2, 13.4, -3.45, -3.15, 'dark', decal='bigstar', dens={'north': 3.0})

    def own(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'pad':
            if p.face == 'up' and q[2] < -3.0 and abs(q[0]) < 3.4:
                return p.pal['stripe'] if int((q[0] - q[2] + 20) * 1.2) % 2 else p.pal['dark']
            return mul(p.col, 0.9) if p.face == 'up' and (abs(q[0] % 3.5) < 0.12 or abs(q[2] % 3.5) < 0.12) else p.col
        if d == 'hall':
            yb = q[1] - 1.0
            if p.face == 'north':
                if abs(q[0]) < 3.0 and yb < 5.8:
                    return p.pal['dark']
                if abs(q[0]) < 3.4 and yb < 6.2:
                    return p.pal['stripe']
                return emblem_px(p, 'star', p.col, 0.4, 0.6, 0.0, 0.24)
            if p.face in ('east', 'west') and 3.4 < yb < 5.0 and abs(q[2] - 1.3) < 1.8:
                return p.pal['dark'] if abs(q[2] - 1.3) > 1.6 or abs(yb - 4.2) > 0.7 else p.pal['lamp']   # a lit window
            return mul(p.col, 0.88) if int(yb * 1.25) % 2 else p.col
        if d == 'roof':
            return p.pal['dark'] if p.face != 'up' else p.col
        if d == 'vent':
            return mul(p.col, 0.6) if p.face in ('north', 'south', 'east', 'west') and int((q[1] - c['o'][1]) * 4) % 2 == 0 else p.col
        if d == 'slats':
            return mul(p.col, 0.78) if p.face in ('north', 'south') and ((q[1] - c['o'][1]) * 1.6) % 1 < 0.25 else p.col
        if d == 'flag':
            return flag(p, 'star', 5.0, 10.2, 14.6, 17.8)
        if d == 'dish':
            return mul(p.col, 0.8) if math.hypot(p.u - 0.5, p.v - 0.5) > 0.42 else p.col
        if d == 'lamp':
            return lit(p.pal['lamp']) if p.face == 'north' else p.col
        if d == 'post':
            return p.pal['dark'] if p.face in ('north', 'west', 'east') and 0.3 < p.v < 0.7 else p.col
        if d == 'bigstar':
            return emblem_px(p, 'star', p.col, 0.2, 0.8, 0.1, 0.9) if p.face == 'north' else p.col
        return p.col
    m.decal = decal_with(m, own)
    return m


def frost():
    m = building('tower_frost', dict(stone='#8a9ab4', disc='#78c8f0', ice='#9ae4ff', ice2='#5ab4e8', ice3='#e0f8ff', glow='#d8ffff'), 'flake')
    top = small_pedestal(m)
    m.bone('turret', 'root', (0, top, 0))
    m.bone('pre4_spire', 'turret', (0, top, 0))
    m.box('pre4_spire', 'pre4_spire', -1.8, 1.8, top, top + 10.5, -1.8, 1.8, 'ice', rot=(0, 45, 0), pivot=(0, top, 0), decal='crystal')
    m.box('pre4_spire', 'pre4_tip', -1.3, 1.3, top + 9.2, top + 11.8, -1.3, 1.3, 'ice3', rot=(45, 0, 35.264), pivot=(0, top + 10.5, 0), decal='crystal')
    m.bone('lv4_spire', 'turret', (0, top, 0))
    m.box('lv4_spire', 'lv4_spire', -2.3, 2.3, top, top + 13.5, -2.3, 2.3, 'ice', rot=(0, 45, 0), pivot=(0, top, 0), decal='crystal')
    m.box('lv4_spire', 'lv4_tip', -1.7, 1.7, top + 11.8, top + 15.2, -1.7, 1.7, 'ice3', rot=(45, 0, 35.264), pivot=(0, top + 13.5, 0), decal='crystal')
    m.box('turret', 'shard_l', 2.6, 4.0, top, top + 5.5, -0.7, 0.7, 'ice', rot=(0, 0, 20), pivot=(3.3, top, 0), decal='crystal')
    m.mirror('shard_l', 'shard_r')
    m.box('turret', 'shard_f', -0.7, 0.7, top, top + 4.6, -4.0, -2.6, 'ice', rot=(20, 0, 0), pivot=(0, top, -3.3), decal='crystal')
    m.box('turret', 'shard_b', -0.7, 0.7, top, top + 4.2, 2.6, 4.0, 'ice', rot=(-20, 0, 0), pivot=(0, top, 3.3), decal='crystal')
    m.bone('lv1_shards', 'turret', (0, top, 0))
    for i in range(4):
        a = math.radians(45 + 90 * i)
        x, z = 3.4 * math.sin(a), -3.4 * math.cos(a)
        m.box('lv1_shards', f'lv1_shard{i}', x - 0.45, x + 0.45, top, top + 3.2, z - 0.45, z + 0.45, 'ice2',
              rot=(-18 * math.cos(a), 0, 18 * math.sin(a)), pivot=(x, top, z), decal='crystal')
    m.bone('spin', 'turret', (0, top + 7.0, 0))
    for i in range(3):
        a = math.radians(120 * i)
        x, z = 5.0 * math.sin(a), -5.0 * math.cos(a)
        m.box('spin', f'orbit{i}', x - 0.5, x + 0.5, top + 6.0, top + 8.0, z - 0.5, z + 0.5, 'ice3', rot=(0, 45 + 120 * i, 0), pivot=(x, top + 7.0, z), decal='crystal')
    m.bone('lv2_spin', 'turret', (0, top + 4.0, 0), rot=(18, 0, 0))
    for i in range(4):
        a = math.radians(90 * i + 45)
        x, z = 6.0 * math.sin(a), -6.0 * math.cos(a)
        m.box('lv2_spin', f'lv2_orbit{i}', x - 0.35, x + 0.35, top + 3.3, top + 4.7, z - 0.35, z + 0.35, 'glow', rot=(0, 45, 0), pivot=(x, top + 4.0, z))
    m.bone('lv3_crown', 'turret', (0, top + 9.0, 0))
    for i in range(6):
        a = math.radians(60 * i)
        x, z = 2.6 * math.sin(a), -2.6 * math.cos(a)
        m.box('lv3_crown', f'lv3_icicle{i}', x - 0.3, x + 0.3, top + 8.0, top + 10.4, z - 0.3, z + 0.3, 'ice3',
              rot=(-22 * math.cos(a), 0, 22 * math.sin(a)), pivot=(x, top + 8.4, z), decal='crystal')
    m.bone('lv5_aura', 'root', (0, top + 0.2, 0))
    for i in range(8):
        a = math.radians(45 * i + 22.5)
        x, z = 5.3 * math.sin(a), -5.3 * math.cos(a)
        m.box('lv5_aura', f'lv5_glow{i}', x - 1.0, x + 1.0, top + 0.05, top + 0.45, z - 0.25, z + 0.25, 'glow', rot=(0, -45 * i - 22.5, 0), pivot=(x, top + 0.25, z))

    def own(p):
        d, q = p.cube['decal'], p.local()
        if d == 'crystal':
            k = (q[1] * 0.9 + (q[2] if p.face in ('east', 'west') else q[0]) * 1.7) % 2.4
            return lit(p.pal['glow']) if k < 0.3 else (p.pal['ice2'] if k > 1.9 else p.col)
        return p.col
    m.decal = decal_with(m, own)
    return m


TOWER_GEAR = {0: gunner, 1: medic, 4: sniper}
BUILDINGS = [farm, mortar, barracks, frost]
