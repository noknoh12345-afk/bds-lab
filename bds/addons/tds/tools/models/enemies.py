"""The eight enemy classes (tds:skin 0..7 of tds:enemy). Original designs: little figures told apart by silhouette.
Shared bone names drive one set of animations: root, body, head, leg_l/leg_r, arm_l/arm_r, scarf, tail, tail_tip,
wing_l/wingtip_l, wing_r/wingtip_r (+x is the figure's left)."""
from __future__ import annotations

import math

from kit import Model, mul
from parts import face_px, figure, limb, lit, sample, spr, top_y


def along(p, q):
    return q[2] if p.face in ('east', 'west') else q[0]


def hair_cap(p, q, c, hair, depth=1.0, wave=0.4):
    """hair on the top of a head, by position: the whole top, a wavy band down the sides"""
    yt = top_y(c) - q[1]
    if p.face == 'up':
        return hair
    if p.face == 'north':
        return hair if yt < depth * 0.5 else None
    return hair if yt < depth + wave * math.sin(along(p, q) * 2.1) else None


# ------------------------------------------------------------------------------------------------ 0 walker
def walker():
    m = Model('enemy_walker', density=1.5, width=64, materials=dict(skin='#709e5c', skin2='#5a8a4a', shirt='#4a7488', pants='#3c3446', shoe='#26222a', hair='#2e2a26'))
    m.bone('root')
    figure(m, leg=(2.6, 6.0, 2.8), torso=(6.0, 6.0, 3.2), arm=(2.2, 6.0, 2.4), head=(6.0, 6.0, 6.0), lean=(10, 0, 0), arm_l=(-74, 0, 4), arm_r=(-84, 0, -4))

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'leg':
            if yb < 1.0:
                return p.pal['shoe']
            if c['name'] == 'leg_l' and p.face == 'north' and 2.4 < yb < 3.4 and abs(q[0] - 1.45) < 0.7:
                return p.pal['skin2']                                  # a torn knee
            return p.col
        if d == 'torso':
            if yb < 0.8 and int((along(p, q) + 10) * 1.6) % 2 == 0:
                return p.pal['skin2']                                  # a ragged hem
            if p.face == 'north' and 2.0 < yb < 3.2 and -2.3 < q[0] < -0.9:
                return p.pal['skin2']                                  # a tear
            return p.col
        if d == 'arm':
            if yb < 3.4:
                return p.pal['skin']                                   # bare forearms
            if yb < 3.9:
                return mul(p.col, 0.78)                                # the torn sleeve's edge
            return p.col
        if d == 'head':
            h = hair_cap(p, q, c, p.pal['hair'], 1.0, 0.45)
            bald = p.face == 'up' and ((q[0] - 1.2) ** 2 + (q[2] + 0.4) ** 2 < 1.5 or (q[0] + 1.4) ** 2 + (q[2] - 1.3) ** 2 < 0.9)
            if h and not bald:
                return h                                                   # thinning hair: two bald patches on the crown
            return face_px(p, 'walker', p.col) if p.face == 'north' else p.pal['skin2'] if bald else p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 1 armored (lead)
def armored():
    m = Model('enemy_armored', density=1.5, width=128, materials=dict(metal='#9aa0ac', metal2='#6e7480', dark='#34303c', trim='#d0a83c', shoe='#2a2630'))
    m.bone('root')
    f = figure(m, leg=(2.8, 5.6, 3.0), torso=(6.6, 6.0, 3.6), arm=(2.4, 5.8, 2.6), head=(6.0, 6.0, 6.0), lean=(4, 0, 0),
               arm_l=(-14, 0, -4), arm_r=(-14, 0, 4), mats=('dark', 'dark', 'metal', 'metal'))
    tw, aw, neck, top, hip = f['tw'], f['aw'], f['neck'], f['top'], f['hip']
    m.box('body', 'plate', -3.55, 3.55, hip + 1.0, neck + 0.3, -2.1, 2.1, 'metal', decal='plate')
    # pauldrons: tilted plates over the shoulders, on the arm bones (docs/03: tilted, never stepped)
    m.rise_x('arm_l', 'pauldron_l', (tw / 2 - 0.5, neck + 0.9), (tw / 2 + aw + 0.7, neck - 0.6), -1.8, 1.8, 1.0, 'metal', decal='edge')
    m.mirror('pauldron_l', 'pauldron_r', 'arm_r')
    m.box('head', 'crest', -0.45, 0.45, top - 0.2, top + 1.3, -2.6, 2.4, 'trim')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'leg':
            return p.pal['metal2'] if yb < 0.8 else p.pal['metal'] if yb < 3.4 else p.col          # greaves over the legs
        if d == 'arm':
            return p.pal['metal2'] if yb < 1.2 else p.col                                          # gauntlets
        if d == 'plate':
            if p.face in ('north', 'south') and abs(abs(q[0]) - 2.9) < 0.35 and (yb < 0.6 or yb > c['s'][1] - 0.7):
                return p.pal['dark']                                                               # rivets
            if p.face == 'north' and abs(q[0]) < 0.35:
                return mul(p.col, 1.12)                                                            # the centre ridge
            if c['s'][1] - yb < 0.35:
                return p.pal['trim']
            return p.col
        if d == 'edge':
            return p.pal['trim'] if p.face != 'up' and p.v > 0.6 else p.col
        if d == 'head':
            if p.face == 'north':
                return face_px(p, 'armored', p.col)
            if p.face in ('east', 'west') and abs(q[2]) < 0.35 and 1.0 < top_y(c) - q[1] < 4.5:
                return p.pal['metal2']                                                             # the helmet's side seam
            return p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 2 brute (boss)
def brute():
    m = Model('enemy_brute', density=1.5, width=128, materials=dict(skin='#9c4846', skin2='#7a3436', hide='#5e3424', iron='#56525e', gold='#d8a838',
                                                                    horn='#e8dcc0', glow='#ff8a2c', dark='#2a2226'))
    m.bone('root')
    f = figure(m, leg=(3.4, 6.5, 3.6), gap=0.4, torso=(9.0, 7.0, 5.0), arm=(3.4, 7.6, 3.6), head=(7.0, 6.0, 6.0), lean=(8, 0, 0),
               arm_l=(-18, 0, -10), arm_r=(-18, 0, 10), mats=('hide', 'skin', 'skin', 'skin'))
    tw, aw, ah, neck, top, hip = f['tw'], f['aw'], f['ah'], f['neck'], f['top'], f['hip']
    m.box('body', 'belt', -4.65, 4.65, hip + 0.3, hip + 1.7, -2.65, 2.65, 'iron', decal='belt')
    m.box('body', 'core', -1.2, 1.2, hip + 3.6, hip + 5.6, -2.85, -2.45, 'glow')                  # a burning heart in the chest
    for i, (zc, tilt) in enumerate(((-0.8, 30), (1.0, 18))):                                       # shoulder spikes, leaning out
        m.box('arm_l', f'spike{i}_l', tw / 2 + 0.9, tw / 2 + 2.1, neck - 0.2, neck + 2.6, zc - 0.6, zc + 0.6, 'horn',
              rot=(0, 0, tilt), pivot=(tw / 2 + 1.5, neck, zc))
        m.mirror(f'spike{i}_l', f'spike{i}_r', 'arm_r')
    m.box('arm_l', 'fist_l', tw / 2 - 0.3, tw / 2 + aw + 0.3, neck - ah - 0.8, neck - ah + 1.8, -2.1, 2.1, 'skin', decal='fist')
    m.mirror('fist_l', 'fist_r', 'arm_r')
    m.rise_x('head', 'horn_l', (2.4, top - 1.0), (5.6, top + 2.6), -0.7, 0.7, 1.3, 'horn', decal='horn')   # horns sweep out and up
    m.mirror('horn_l', 'horn_r')
    m.box('head', 'crown', -3.75, 3.75, top - 0.85, top - 0.05, -3.25, 3.25, 'gold', decal='crown')
    for i, x in enumerate((-2.2, 0.0, 2.2)):                                                         # three tines on the band
        m.box('head', f'tine{i}', x - 0.4, x + 0.4, top - 0.4, top + 1.1, -3.45, -2.65, 'gold', rot=(0, 0, 45), pivot=(x, top + 0.35, -3.05))

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'leg':
            return p.pal['dark'] if yb < 1.2 else p.col
        if d == 'torso':
            if p.face == 'north' and (abs(q[0]) - 0.0) < 3.2 and 3.0 < yb < 3.4 + 0.25 * abs(q[0]):
                return p.pal['skin2']                                                              # a scar across the chest
            return p.col
        if d == 'arm':
            return p.pal['iron'] if 2.6 < yb < 3.6 else p.col                                      # iron cuffs
        if d == 'belt':
            if p.face == 'north' and abs(q[0]) < 0.9:
                return p.pal['gold']                                                               # the buckle
            return mul(p.col, 0.85) if int((along(p, q) + 20) * 1.4) % 3 == 0 else p.col
        if d == 'fist':
            return mul(p.col, 0.82) if p.face == 'north' and int((q[0] + 20) * 1.6) % 2 == 0 and yb > 1.2 else p.col
        if d == 'horn':
            return mul(p.col, 0.8) if int(q[0] * 2.2) % 2 == 0 else p.col                          # ringed horns
        if d == 'crown':
            return lit((255, 74, 60)) if p.face == 'north' and abs(q[0]) < 0.45 else p.col        # a gem in front
        if d == 'head':
            return face_px(p, 'brute', p.col) if p.face == 'north' else p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 3 runner (fast)
def runner():
    m = Model('enemy_runner', density=1.5, width=64, materials=dict(skin='#e2ba92', suit='#2aa89c', suit2='#1e7a72', stripe='#ffd650', shoe='#f0ece0',
                                                                    sole='#3a3640', hair='#e8643c', scarf='#ff6a4a', scarf2='#c84030'))
    m.bone('root')
    f = figure(m, leg=(2.2, 6.5, 2.4), gap=0.3, torso=(5.0, 5.0, 2.8), arm=(1.8, 5.0, 2.0), head=(5.0, 5.0, 5.0), lean=(18, 0, 0),
               arm_l=(34, 0, -8), arm_r=(34, 0, 8), mats=('suit2', 'suit', 'suit', 'skin'))
    neck, top = f['neck'], f['top']
    m.box('body', 'wrap', -2.75, 2.75, neck - 0.6, neck + 0.6, -1.65, 1.65, 'scarf', decal='wrap')
    m.bone('scarf', 'body', (0, neck - 0.1, 1.6))
    m.box('scarf', 'tail', 0, 0, neck - 3.4, neck + 0.2, 1.6, 6.4, 'scarf', only=('east', 'west'), decal='tail')     # ONE plate, both faces
    m.slope('head', 'pony', -0.7, 0.7, (2.0, top - 0.4), (5.2, top - 2.4), 1.2, 'hair', extend=(0, 0.2))           # runs back INTO the head

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'leg':
            if yb < 0.4:
                return p.pal['sole']
            if yb < 1.3:
                return p.pal['shoe']
            return p.pal['stripe'] if p.face in ('east', 'west') and abs(q[2]) < 0.25 else p.col
        if d in ('torso', 'arm'):
            if d == 'arm' and yb < 1.1:
                return p.pal['skin']
            return p.pal['stripe'] if p.face in ('east', 'west') and abs(q[2]) < 0.3 else p.col     # side stripes
        if d == 'wrap':
            return p.pal['scarf2'] if int((along(p, q) + 10) * 1.2) % 2 else p.col
        if d == 'tail':
            a = (q[2] - 1.6) / 4.8                                                                   # 0 at the neck .. 1 at the end
            yy = q[1] - c['o'][1]
            if yy < 1.2 + 0.9 * math.sin(a * 6.0) * a or (a > 0.86 and int(yy * 2.2) % 2 == 0):
                return None                                                                          # a fluttering, ragged end
            return p.pal['scarf2'] if int(a * 7) % 2 else p.col
        if d == 'head':
            h = hair_cap(p, q, c, p.pal['hair'], 1.0, 0.3)
            if h:
                return h
            return face_px(p, 'runner', p.col) if p.face == 'north' else p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 4 wraith (hidden)
def wraith():
    m = Model('enemy_wraith', density=1.5, width=64, materials=dict(cloth='#3c2850', cloth2='#2a1c3a', hood='#4a3260', bone='#d8d0e0', glow='#c070ff'),
              variants={'': {'_alpha': {'*': 185, 'bone': 235, 'glow': 255}}}, emissive=False)
    m.bone('root')
    m.bone('body', 'root', (0, 9.0, 0))
    m.box('body', 'robe', -3.0, 3.0, 1.0, 9.6, -2.4, 2.4, 'cloth', decal='robe')
    m.box('body', 'torso', -2.8, 2.8, 9.5, 14.0, -1.9, 1.9, 'cloth2', decal='torso')
    m.bone('arm_l', 'body', (3.9, 13.4, 0), rot=(-38, 0, 6))
    m.bone('arm_r', 'body', (-3.9, 13.4, 0), rot=(-38, 0, -6))
    m.box('arm_l', 'sleeve_l', 2.8, 5.0, 8.2, 14.0, -1.25, 1.25, 'cloth', decal='sleeve')
    m.box('arm_l', 'hand_l', 3.35, 4.45, 7.0, 8.4, -0.55, 0.55, 'bone')
    m.mirror('sleeve_l', 'sleeve_r', 'arm_r')
    m.mirror('hand_l', 'hand_r', 'arm_r')
    m.bone('head', 'body', (0, 14.0, 0))
    m.box('head', 'hood', -3.0, 3.0, 14.0, 20.0, -3.0, 3.0, 'hood', decal='hood', dens={'north': 2.0})
    m.slope('head', 'peak', -1.6, 1.6, (0.6, 20.0), (4.8, 17.2), 1.6, 'hood', extend=(0, 0.2))     # the hood's point, falling back

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'robe':
            if p.face == 'down':
                return None                                                                          # it floats: no floor under it
            a = along(p, q)
            if p.face != 'up' and yb < 0.5 + 0.9 * abs(math.sin(a * 1.7)):
                return None                                                                          # a tattered hem
            return mul(p.col, 0.86) if p.face != 'up' and int((a + 10) * 1.1) % 2 else p.col         # folds
        if d == 'sleeve':
            if p.face == 'down' or (p.face != 'up' and yb < 0.3 + 0.7 * abs(math.sin(along(p, q) * 2.5))):
                return None
            return p.col
        if d == 'hood':
            if p.face == 'north':
                s = sample(spr('faces', 'wraith'), p.u, p.v)
                return s[:3] + (255,) if s[3] else p.col                                              # the eyes stay solid
            return p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 5 imp (flying)
WEB_ARM = (2.3, 7.2, 0.35, 5.0)          # plate x0, x1, z0, z1 (left wing; the right is its mirror)
WEB_HAND = (7.2, 12.0, 0.35, 4.6)
FINGERS = ((1.0, 0.0), (0.86, 0.5), (0.52, 0.92), (0.0, 1.0))


def imp():
    m = Model('enemy_imp', density=1.5, width=128, materials=dict(skin='#6a84ba', skin2='#4a5c8a', belly='#a8b8d8', web='#8a5aa8', web2='#5e3a7e', horn='#e8dcc8', glow='#ffd650'))
    m.bone('root')
    m.bone('body', 'root', (0, 6.5, 0))
    m.box('body', 'chest', -2.5, 2.5, 4.0, 9.0, -2.0, 2.0, 'skin', decal='chest')
    m.bone('head', 'body', (0, 9.0, -0.5))
    m.box('head', 'head', -3.0, 3.0, 9.0, 14.0, -3.2, 1.8, 'skin', decal='head', dens={'north': 2.0})
    m.rise_x('head', 'horn_l', (1.4, 13.6), (3.6, 15.9), -0.4, 0.5, 0.9, 'horn')
    m.mirror('horn_l', 'horn_r')
    m.bone('arm_l', 'body', (2.5, 8.4, 0), rot=(-30, 0, 12))
    m.bone('arm_r', 'body', (-2.5, 8.4, 0), rot=(-30, 0, -12))
    m.box('arm_l', 'arm_l', 2.5, 3.7, 5.2, 8.8, -0.6, 0.6, 'skin', decal='claw')
    m.mirror('arm_l', 'arm_r', 'arm_r')
    m.bone('leg_l', 'root', (1.3, 4.4, 0.3), rot=(28, 0, 0))
    m.bone('leg_r', 'root', (-1.3, 4.4, 0.3), rot=(28, 0, 0))
    m.box('leg_l', 'leg_l', 0.5, 2.1, 0.9, 4.6, -0.5, 1.1, 'skin2', decal='claw')
    m.mirror('leg_l', 'leg_r', 'leg_r')
    m.bone('tail', 'body', (0, 5.0, 1.8))
    m.chain('tail', 'tail', -0.45, 0.45, [(1.6, 5.6), (4.2, 4.4), (6.6, 4.0)], 0.9, 'skin2')
    m.bone('tail_tip', 'tail', (0, 3.9, 6.6))
    m.box('tail_tip', 'spade', -1.2, 1.2, 3.65, 3.65, 6.2, 8.6, 'web2', only=('up', 'down'), decal='spade')
    # wings (docs/07): a leading-edge spar and ONE membrane plate per segment; each plate's inner edge on its hinge
    m.bone('wing_l', 'body', (2.3, 8.3, 0.4), rot=(0, 0, -18))
    m.bone('wingtip_l', 'wing_l', (7.2, 8.35, 0.35), rot=(0, 0, 22))
    m.bone('wing_r', 'body', (-2.3, 8.3, 0.4), rot=(0, 0, 18))
    m.bone('wingtip_r', 'wing_r', (-7.2, 8.35, 0.35), rot=(0, 0, -22))
    m.box('wing_l', 'spar_l', 2.3, 7.2, 8.0, 8.7, 0.0, 0.7, 'skin2')
    m.box('wing_l', 'web_l', WEB_ARM[0], WEB_ARM[1], 8.3, 8.3, WEB_ARM[2], WEB_ARM[3], 'web', only=('up', 'down'), decal='web_arm', dens=2.0)
    m.box('wingtip_l', 'finger_l', 7.2, 12.0, 8.05, 8.65, 0.05, 0.65, 'skin2')
    m.box('wingtip_l', 'webtip_l', WEB_HAND[0], WEB_HAND[1], 8.3, 8.3, WEB_HAND[2], WEB_HAND[3], 'web', only=('up', 'down'), decal='web_hand', dens=2.0)
    for n, b in (('spar', 'wing_r'), ('web', 'wing_r'), ('finger', 'wingtip_r'), ('webtip', 'wingtip_r')):
        m.mirror(f'{n}_l', f'{n}_r', b)

    def web(p, hand):
        q = p.local()
        x0, x1, z0, z1 = WEB_HAND if hand else WEB_ARM
        a = (abs(q[0]) - x0) / (x1 - x0)
        b = (q[2] - z0) / (z1 - z0)
        if hand:                                       # fingers fan from the wrist; the edge sags between their tips
            r, ang = math.hypot(a, b), math.atan2(b, a)
            tips = [(math.atan2(fb, fa), math.hypot(fa, fb)) for fa, fb in FINGERS]
            edge = None
            for (a0, r0), (a1, r1) in zip(tips, tips[1:]):
                if a0 <= ang <= a1 + 1e-9:
                    t = (ang - a0) / (a1 - a0)
                    edge = r0 + (r1 - r0) * t - 0.28 * math.sin(math.pi * t)
            if edge is None or r > edge:
                return None
            if any(abs(ang - t0) * r * (z1 - z0) < 0.32 for t0, _ in tips[1:3]):
                return p.pal['web2']                   # a painted finger bone
            return mul(p.col, 1.0 - 0.18 * r)
        if b > 1.0 - 0.36 * math.sin(math.pi * min(1.0, max(0.0, a))):
            return None                                # the free edge sags between flank and wrist
        if a > 0.94:
            return p.pal['web2']                       # the wrist strut
        return mul(p.col, 1.0 - 0.15 * b)

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        if d == 'web_arm':
            return web(p, False)
        if d == 'web_hand':
            return web(p, True)
        if d == 'spade':
            a, b = abs(q[0]) / 1.2, (q[2] - 6.2) / 2.4
            return None if a > 1.0 - abs(b - 0.45) * 1.6 else p.col
        if d == 'chest':
            return p.pal['belly'] if p.face == 'north' and abs(q[0]) < 1.6 else p.col
        if d == 'claw':
            return p.pal['horn'] if q[1] - c['o'][1] < 0.6 else p.col
        if d == 'head':
            return face_px(p, 'imp', p.col) if p.face == 'north' else p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 6 heavy
def heavy():
    m = Model('enemy_heavy', density=1.5, width=128, materials=dict(armor='#76804e', armor2='#565e38', dark='#2e2c30', orange='#e88a2c', metal='#8a8e96',
                                                                    metal2='#5e626a', skin='#c89a74'))
    m.bone('root')
    f = figure(m, leg=(3.0, 4.6, 3.4), gap=0.4, torso=(8.0, 6.4, 4.6), arm=(2.8, 6.0, 3.0), head=(6.0, 5.0, 6.0), lean=(4, 0, 0),
               arm_l=(-32, 0, -4), arm_r=(-10, 0, 8), mats=('armor2', 'armor', 'armor', 'armor'))
    tw, td, aw, ah, neck, top, hip = f['tw'], f['td'], f['aw'], f['ah'], f['neck'], f['top'], f['hip']
    m.box('body', 'pack', -3.3, 3.3, hip + 0.6, neck + 1.0, td / 2 + 0.1, td / 2 + 3.2, 'metal', decal='pack')
    m.box('body', 'tank_l', 0.5, 2.7, hip + 1.6, neck + 2.4, td / 2 + 3.15, td / 2 + 4.4, 'orange', decal='tank')
    m.mirror('tank_l', 'tank_r')
    m.box('arm_l', 'shield', tw / 2 - 1.6, tw / 2 + aw + 1.4, neck - ah - 1.4, neck + 0.2, -2.6, -2.0, 'metal', decal='shield')
    m.box('head', 'ridge', -0.5, 0.5, top - 0.2, top + 0.8, -3.2, 3.2, 'armor2')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'leg':
            return p.pal['dark'] if yb < 1.0 else p.pal['metal2'] if 2.0 < yb < 2.8 else p.col       # boots, knee pads
        if d == 'arm':
            return p.pal['dark'] if yb < 1.2 else p.col
        if d == 'torso':
            return p.pal['orange'] if p.face == 'north' and abs(q[0] - 2.4) < 0.6 and 3.6 < yb < 4.4 else p.col
        if d == 'pack':
            return p.pal['metal2'] if int((q[1] + 20) * 1.2) % 3 == 0 else p.col
        if d == 'tank':
            return mul(p.col, 0.8) if p.face != 'up' and abs(q[1] - (c['o'][1] + c['s'][1] * 0.7)) < 0.3 else p.col
        if d == 'shield':
            if p.face == 'north':
                stripe = (q[0] + q[1] * 0.8) % 2.2 < 0.9
                return p.pal['orange'] if stripe and (yb < 1.6 or yb > c['s'][1] - 1.2) else mul(p.col, 1.05)
            return p.col
        if d == 'head':
            return face_px(p, 'heavy', p.col) if p.face == 'north' else p.col
        return p.col
    m.decal = decal
    return m


# ------------------------------------------------------------------------------------------------ 7 yeti (frost)
def yeti():
    m = Model('enemy_yeti', density=1.5, width=128, materials=dict(fur='#dce8f2', fur2='#aac0d4', skin='#8aa0c0', ice='#9ae4ff', ice2='#5ab4e8',
                                                                   horn='#f0f6ff', dark='#2a3448'))
    m.bone('root')
    f = figure(m, leg=(3.0, 5.0, 3.2), gap=0.6, torso=(8.0, 7.0, 5.0), arm=(3.0, 8.4, 3.2), head=(7.0, 6.0, 6.0), lean=(14, 0, 0),
               arm_l=(-12, 0, -8), arm_r=(-12, 0, 8), mats=('fur', 'fur', 'fur', 'fur'))
    td, neck, top = f['td'], f['neck'], f['top']
    m.box('body', 'shard0', -0.9, 0.9, neck - 1.0, neck + 3.2, td / 2 - 1.2, td / 2 + 0.4, 'ice', rot=(-28, 0, 0), pivot=(0, neck, td / 2 - 0.4), decal='ice')
    m.box('body', 'shard1_l', 2.2, 3.6, neck - 0.8, neck + 2.4, 0.2, 1.6, 'ice', rot=(-15, 0, 22), pivot=(2.9, neck, 0.9), decal='ice')
    m.mirror('shard1_l', 'shard1_r')
    m.rise_x('head', 'horn_l', (2.2, top - 0.8), (4.6, top + 1.1), -0.5, 0.5, 1.0, 'horn')
    m.mirror('horn_l', 'horn_r')

    def decal(p):
        d, c, q = p.cube['decal'], p.cube, p.local()
        yb = q[1] - c['o'][1]
        if d == 'ice':
            return p.pal['ice2'] if (q[1] * 1.3 + along(p, q)) % 1.6 < 0.35 else mul(p.col, 1.08)
        if d in ('leg', 'arm') and yb < (0.9 if d == 'leg' else 1.4):
            return p.pal['skin']                                                                    # bare feet and hands
        if d == 'head':
            if p.face == 'north':
                return face_px(p, 'yeti', p.pal['skin'] if 1.0 < top_y(c) - q[1] < 6.0 and abs(q[0]) < 3.0 else p.col)
            return p.col
        if d in ('leg', 'arm', 'torso'):
            if d == 'torso' and p.face == 'north' and abs(q[0]) < 2.2 and yb < 5.0:
                return mul(p.col, 1.06)                                                             # a paler belly
            return p.pal['fur2'] if (q[1] * 1.7 + along(p, q) * 2.3) % 1.9 < 0.32 else p.col     # fur strands by position
        return p.col
    m.decal = decal
    return m


ENEMIES = [walker, armored, brute, runner, wraith, imp, heavy, yeti]      # index = tds:skin (enemySkin in src/game.ts)
