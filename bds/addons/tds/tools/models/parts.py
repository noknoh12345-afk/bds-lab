"""Shared pieces of the TDS models: a blocky figure rig, a pedestal, level pips, a sandbag ring, plates, and the
decals that paint them by position. Original designs throughout."""
from __future__ import annotations

import math
import os

from kit import hexc, mix, mul, over, sample, sprite

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', 'art', 'out')
_SPR = {}


def spr(kind, name):
    key = (kind, name)
    if key not in _SPR:
        _SPR[key] = sprite(os.path.join(ART, kind, f'{name}.png'))
    return _SPR[key]


GLOW_KEYS = {hexc(h)[:3] for h in ('#ffd650', '#fff4b0', '#ff4a3c', '#ffb0a0', '#78dcff', '#e0f8ff', '#c070ff', '#f0d0ff',
                                   '#7cff8c', '#ff9a2c', '#ffe0a0', '#50d0d0', '#d8ffff')}


def lit(c):
    """a colour that lights itself under entity_emissive_alpha* (alpha low, not zero)"""
    return tuple(c[:3]) + (24,)


def face_px(p, name, base):
    """the face sprite `name` over `base`, BY POSITION on the north face; glowing sprite colours light themselves"""
    s = sample(spr('faces', name), p.u, p.v)
    if s[3] == 0:
        return base
    return lit(s) if s[:3] in GLOW_KEYS else over(base, s)


def emblem_px(p, name, base, u0=0.0, u1=1.0, v0=0.0, v1=1.0):
    """an 8x8 emblem placed in the (u, v) window of a face"""
    if not (u0 <= p.u < u1 and v0 <= p.v < v1):
        return base
    s = sample(spr('emblems', name), (p.u - u0) / (u1 - u0), (p.v - v0) / (v1 - v0))
    return base if s[3] == 0 else over(base, s)


def top_y(c):
    return c['o'][1] + c['s'][1]


# ------------------------------------------------------------------------------------------------ the figure
def figure(m, parent='root', y0=0.0, leg=(2.6, 5.0, 2.8), gap=0.2, torso=(6.0, 5.5, 3.2), arm=(2.2, 5.6, 2.4), head=(6.0, 6.0, 6.0),
           lean=None, arm_l=None, arm_r=None, mats=('pants', 'shirt', 'shirt', 'skin'), legs=True, tag=''):
    """A blocky figure standing at y0: bones body (hip), leg_l/leg_r, arm_l/arm_r (shoulder), head (neck).
    +x is the figure's left. Decals: leg, torso, arm, head. Returns its key heights."""
    lw, lh, ld = leg
    tw, th, td = torso
    aw, ah, ad = arm
    hw, hh, hd = head
    hip = y0 + (lh if legs else 0.0)
    neck = hip + th
    sh = neck - 0.7
    lx = gap / 2 + lw / 2
    ax = tw / 2 + aw / 2
    pl, pt, pa, ph = mats
    m.bone('body' + tag, parent, (0, hip, 0), rot=lean)
    if legs:
        # the legs run 0.5 up INTO the torso, so the body can bob on its hips without opening a gap
        m.bone('leg_l' + tag, parent, (lx, hip, 0))
        m.bone('leg_r' + tag, parent, (-lx, hip, 0))
        m.pair('leg_l' + tag, 'leg_r' + tag, 'leg' + tag, lx - lw / 2, lx + lw / 2, y0, hip + 0.5, -ld / 2, ld / 2, pl, decal='leg')
    m.box('body' + tag, 'torso' + tag, -tw / 2, tw / 2, hip, neck, -td / 2, td / 2, pt, decal='torso')
    m.bone('arm_l' + tag, 'body' + tag, (ax, sh, 0), rot=arm_l)
    m.bone('arm_r' + tag, 'body' + tag, (-ax, sh, 0), rot=arm_r)
    m.box('arm_l' + tag, 'arm_l' + tag, tw / 2, tw / 2 + aw, neck - ah, neck, -ad / 2, ad / 2, pa, decal='arm')
    m.mirror('arm_l' + tag, 'arm_r' + tag, 'arm_r' + tag)
    m.bone('head' + tag, 'body' + tag, (0, neck, 0))
    m.box('head' + tag, 'head' + tag, -hw / 2, hw / 2, neck, neck + hh, -hd / 2, hd / 2, ph, decal='head', dens={'north': 2.0})
    return {'hip': hip, 'neck': neck, 'top': neck + hh, 'sh': sh, 'tw': tw, 'td': td, 'hw': hw, 'hd': hd, 'aw': aw, 'ah': ah, 'ax': ax, 'y0': y0}


def limb(p, foot=1.0, foot_mat='shoe', hand=1.3, hand_mat='skin', cuff=None):
    """legs: a shoe at the bottom; arms: a hand at the bottom and an optional darker cuff above it"""
    y = p.local()[1] - p.cube['o'][1]
    d = p.cube['decal']
    if d == 'leg':
        if y < foot:
            return p.pal[foot_mat]
        if y < foot + 0.5 and cuff:
            return p.pal[cuff]
        return p.col
    if d == 'arm':
        if y < hand:
            return p.pal[hand_mat]
        if cuff and y < hand + 0.5:
            return p.pal[cuff]
        return p.col
    return p.col


# ------------------------------------------------------------------------------------------------ tower bits
def pedestal(m, r=7.0, h=1.6, r2=6.0, h2=0.8, mat='stone', mat2='disc'):
    """two eight-sided tiers; the top one in the role colour"""
    m.octa_y('root', 'base', 0, 0, 0.0, h, r, mat, decal='stone')
    m.octa_y('root', 'disc', 0, 0, h - 0.2, h + h2, r2, mat2, decal='disc')
    return h + h2


def pips(m, y, r=6.55, mat='gold'):
    """seven level studs in an arc at the front of the lower tier: bones pip1..pip7 (shown by tds:lvl)"""
    for i in range(1, 8):
        a = math.radians(-54 + (i - 1) * 18)
        x, z = r * math.sin(a), -r * math.cos(a)
        m.bone(f'pip{i}', 'root', (x, y, z))
        m.box(f'pip{i}', f'pip{i}', x - 0.4, x + 0.4, y - 0.05, y + 0.55, z - 0.4, z + 0.4, mat, rot=(0, -math.degrees(a), 0), pivot=(x, y, z), flat=True)


def ring(m, bone, name, r, y0, y1, mat, decal='bags', gap=0.0):
    """an eight-sided ring of walls (sandbags): eight boxes a 45-degree step apart, alternately 0.04 lower"""
    side = 2 * r * math.tan(math.radians(22.5)) + 0.6
    for i in range(8):
        a = 45.0 * i
        rad = math.radians(a)
        cx, cz = r * math.sin(rad), -r * math.cos(rad)
        if gap and i == 0:
            continue
        m.box(bone, f'{name}{i}', cx - side / 2, cx + side / 2, y0 + 0.04 * (i % 2), y1 - 0.04 * (i % 2), cz - 0.9 - 0.02 * (i % 2), cz + 0.9 + 0.02 * (i % 2), mat,
              rot=(0, -a, 0) if a else None, pivot=(cx, (y0 + y1) / 2, cz), decal=decal)


def bags(p, row=1.0, width=2.2):
    """sandbag courses by position: offset joints, a darker seam between sacks"""
    q = p.local()
    yy = q[1] - p.cube['o'][1]
    course = int(yy / row)
    along = q[2] if p.face in ('east', 'west') else q[0]
    off = (along + (width / 2 if course % 2 else 0)) % width
    if yy % row < 0.18 or off < 0.2:
        return mul(p.col, 0.78)
    return mul(p.col, 1.0 + 0.06 * math.sin(off / width * math.pi))


def stone(p):
    """the pedestal: blocks in courses by position, light on the top rim"""
    q = p.local()
    if p.face == 'up':
        return mul(p.col, 0.94) if (int((q[0] + 20) / 2.2) + int((q[2] + 20) / 2.2)) % 2 else p.col
    course = int((q[1] - p.cube['o'][1]) / 0.8)
    if (q[1] - p.cube['o'][1]) % 0.8 < 0.16:
        return mul(p.col, 0.8)
    return mul(p.col, 0.95 if course % 2 else 1.03)


def flag(p, emblem, z0, z1, y0, y1, notch=0.28):
    """a flag plate in the y-z plane, fixed to the pole at z0 and flying toward z1: a swallowtail cut on the free
    end, a hem along the pole, the emblem in the middle; BY POSITION, so both faces show the same flag"""
    q = p.local()
    a = (q[2] - z0) / (z1 - z0)                 # 0 at the pole, 1 at the free end
    b = (y1 - q[1]) / (y1 - y0)                 # 0 at the top
    if a > 1 - notch * (1 - abs(b - 0.5) * 2):
        return None
    if a < 0.1:
        return mul(p.col, 0.8)
    s = sample(spr('emblems', emblem), (a - 0.18) / 0.5, (b - 0.18) / 0.64) if 0.18 <= a < 0.68 and 0.18 <= b < 0.82 else (0, 0, 0, 0)
    return over(p.col, s) if s[3] else p.col
