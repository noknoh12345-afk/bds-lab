"""Client entities, render controllers, animations and the animation controller for the TDS looks.

Two layers per entity: `controller.render.tds_<kind>` draws the body (a vanilla mob's geometry and texture, or one of our
buildings / machines), `controller.render.tds_<kind>_gear` our high-quality gear whose bones repeat the vanilla rig, so the
same animations move both (vanilla.py). Contract with the behaviour pack and src/game.ts: tds:skin picks body + gear of one
index, tds:size scales enemies and units, tds:lvl shows pip1..pip7, tds:ok tints the placement ghost, tds:yaw (int 0..360)
is the yaw a mob would have facing the tower's target. Played from the script with Entity.playAnimation:
animation.tds_tower.fire (each shot, throttled) and animation.tds_tower.spawn (a unit leaves the barracks).

Rotations in Molang ADD to the bind pose (docs/01 of mcbemodelingmasterAI); -rx swings a hanging limb forward, +rx back;
-rz raises the +x side; ry = the mob yaw (degrees) relative to the body."""
from __future__ import annotations

import json
import os

import vanilla as V

SK = "q.property('tds:skin')"
HOLO = 'textures/entity/tds/holo_tint'


def skin_is(*ks):
    return ' || '.join(f'{SK} == {k}' for k in ks)


def pick(ks, a, b):
    """Molang: a when tds:skin is one of ks, else b"""
    return f'({skin_is(*ks)}) ? {a} : {b}'


def dumps(d):
    return (json.dumps(d, indent=1, ensure_ascii=False) + '\n').encode()


def loop(bones, **kw):
    return {'loop': True, 'bones': bones, **kw}


def S(rate, amp, phase=0, base=None):
    """math.sin(clock * rate - phase) * amp, optionally after a constant (v.clock: the tower's seconds, stopped while frozen)"""
    shift = f' - {phase}' if phase > 0 else f' + {-phase}' if phase < 0 else ''
    e = f'math.sin(v.clock * {rate}{shift}) * {amp}'
    return f'{base} + {e}' if base is not None else e


# ------------------------------------------------------------------------------------------------ enemies: roster.py + roster_entities.py

# ------------------------------------------------------------------------------------------------ towers: roster_towers.py
YAW = "q.property('tds:yaw') - q.body_y_rotation"
HOLO_OFF = "q.property('tds:holo')"
POP = {'0.0': [0.6, 0.2, 0.6], '0.18': [1.1, 1.15, 1.1], '0.35': [1, 1, 1]}
LVL = {'0.0': [1, 1, 1], '0.12': [1.12, 0.9, 1.12], '0.25': [0.96, 1.1, 0.96], '0.4': [1, 1, 1]}
# the figures' poses (bone names match case-insensitively: rightarm is the illagers' rightArm too); a held thing's own
# angle to the arm (towerkit.TILT) makes it stand right in its pose
POSES = {'hold': {'rightarm': [-70, -12, 0], 'leftarm': [-68, 34, 0]},          # both fists under the gun at the chest
         'bow': {'rightarm': [-90, -12, 0], 'leftarm': [-90, 44, 0]},           # the bow arm straight ahead, the other at the string
         'type': {'rightarm': [-50, -20, 0], 'leftarm': [-50, 20, 0], 'head': [12, 0, 0]},   # a laptop on both fists, the head bent to it
         'dual': {'rightarm': [-86, -4, 0], 'leftarm': [-86, 4, 0]},            # a pistol in each hand
         'ready': {'rightarm': [-55, 0, 0], 'leftarm': [-18, 0, -6]},           # the blade up and forward
         'ready2': {'rightarm': [-55, 6, 0], 'leftarm': [-55, -6, 0]},
         'cast': {'rightarm': [-24, 0, 0], 'leftarm': [-64, -18, -8]},          # the staff upright, the other hand out
         'throw': {'rightarm': [-150, 0, 12], 'leftarm': [-30, 0, -10]}}        # the thing raised over the shoulder
# what the idle animation does to a bone, by its name without the level prefix (exact names first, then a name that
# starts or ends with a key: spin_l, radar_spin)
EXACT = {'spin': {'rotation': [0, 'v.clock * 90', 0], 'position': [0, S(120, 0.4), 0]}, 'lv2_spin': {'rotation': [0, 'v.clock * 60', 0]},
         'lv4_spin': {'rotation': [0, 'v.clock * 120', 0]}}
MOTION = {'spin': {'rotation': [0, 'v.clock * 90', 0]}, 'spinx': {'rotation': ['v.clock * 150', 0, 0]},
          'spinz': {'rotation': [0, 0, 'v.clock * 90']}, 'rotor': {'rotation': [0, 'v.clock * 900', 0]},     # a minigun idles slowly; its shot spins it up
          'hover': {'position': [0, S(110, 0.6), 0]}, 'flag': {'rotation': [0, S(160, 12), S(230, 3)]},
          'beat': {'scale': ['1 + math.abs(math.sin(v.clock * 240)) * 0.08'] * 3},
          'halo': {'rotation': [0, 'v.clock * 50', 0]}, 'aura': {'rotation': [0, 'v.clock * 30', 0]},
          'orbit': {'rotation': [0, 'v.clock * 90', 0], 'position': [0, S(120, 0.6), 0]},
          'wing_l': {'rotation': [0, S(500, 22, 0, 12), 0]}, 'wing_r': {'rotation': [0, S(500, -22, 0, -12), 0]},
          'cape': {'rotation': [S(160, 5, 0, 10), 0, S(230, 2)]}, 'scarf_tail': {'rotation': [S(400, 8, 0, 12), S(300, 10), 0]},
          'bandana_tail': {'rotation': [S(400, 8, 0, 8), S(300, 12), 0]}, 'plume': {'rotation': [S(200, 4), 0, 0]}}
HIDE = {'position': [0, -1000, 0]}                    # a muzzle flash waits out of sight (positions add; a shot adds it back)


def base_name(name):
    import re
    return re.sub(r'^(lv\d|pre\d|r\dto\d)_', '', name)


def motion(name):
    if name in EXACT:
        return EXACT[name]
    b = base_name(name)
    if 'flash' in b:
        return HIDE
    if b in MOTION:
        return MOTION[b]
    for k in sorted(MOTION, key=len, reverse=True):
        if b.startswith(k + '_') or b.endswith('_' + k) or (b.startswith(k) and b[len(k):].isdigit()):
            return MOTION[k]
    return None


def ranges_of(idx):
    out = []
    for i in sorted(set(idx)):
        if out and out[-1][1] == i:
            out[-1][1] = i + 1
        else:
            out.append([i, i + 1])
    return out


def cond(idx):
    """Molang: tds:skin is one of idx (as few comparisons as its ranges need)"""
    rs = ranges_of(idx)
    if not rs:
        return '0'
    return ' || '.join(f'{SK} == {a}' if b - a == 1 else f'({SK} >= {a} && {SK} < {b})' for a, b in rs)


def kf(*pairs):
    """keyframes from (time, value) pairs"""
    return {f'{t:g}' if t else '0.0': v for t, v in pairs}


Z3 = [0, 0, 0]
GUNS = ('fire', 'auto', 'spin', 'snipe', 'blast', 'heavy', 'stream', 'revolver')     # shots that show the muzzle flash


def tower_shots(show):
    """animation.tds_tower.<shot>: what a tower does each time it attacks (played by the script, throttled), by what it
    holds. The gun hangs on the body (`gun`), the hands on it: a gun's kick moves the gun, the arms follow a little, the
    waist takes the recoil; positions in the gun's frame, + z toward the shooter."""
    A = {}

    def clip(length, bones, flash=False):
        return {'loop': False, 'animation_length': length, 'bones': {**bones, **(show if flash else {})}}
    # a single shot of a rifle or a pistol in a building's turret: a firm kick
    A['fire'] = clip(0.22, {'gun': {'position': kf((0, Z3), (0.04, [0, 0.2, 1.4]), (0.22, Z3)), 'rotation': kf((0, Z3), (0.04, [-3, 0, 0]), (0.22, Z3))},
                            'barrel': {'rotation': kf((0, Z3), (0.06, [8, 0, 0]), (0.22, Z3)), 'position': kf((0, Z3), (0.04, [0, 0, 1.2]), (0.22, Z3))},
                            'turret': {'position': kf((0, Z3), (0.04, [0, 0, 0.8]), (0.22, Z3))},
                            'rightarm': {'rotation': kf((0, Z3), (0.04, [-6, 0, 0]), (0.22, Z3))},
                            'waist': {'rotation': kf((0, Z3), (0.04, [-2, 0, 0]), (0.22, Z3))}}, True)
    # automatics: short sharp kicks, the muzzle climbing a little
    A['auto'] = clip(0.14, {'gun': {'position': kf((0, Z3), (0.03, [0, 0.12, 0.8]), (0.14, Z3)), 'rotation': kf((0, Z3), (0.03, [-1.5, 0, 0]), (0.14, Z3))},
                            'rightarm': {'rotation': kf((0, Z3), (0.03, [-3, 0, 0]), (0.14, Z3))}, 'leftarm': {'rotation': kf((0, Z3), (0.03, [-2, 0, 0]), (0.14, Z3))},
                            'waist': {'rotation': kf((0, Z3), (0.03, [-1, 0, 0]), (0.14, Z3))}}, True)
    # a minigun: the barrels spun up while it fires (a turn of six barrels each shot), a steady rattle
    A['spin'] = clip(0.15, {'spinz': {'rotation': kf((0, Z3), (0.15, [0, 0, 360]))},
                            'gun': {'position': kf((0, Z3), (0.04, [0.12, 0.1, 0.5]), (0.09, [-0.1, 0.05, 0.4]), (0.15, Z3))},
                            'waist': {'rotation': kf((0, Z3), (0.04, [-1, 0, 0]), (0.15, Z3))}}, True)
    # a sniper's heavy shot: a big kick, the head and shoulders rock back, then the hand works the bolt
    A['snipe'] = clip(0.75, {'gun': {'position': kf((0, Z3), (0.05, [0, 0.6, 2.6]), (0.35, [0, 0.1, 0.4]), (0.75, Z3)),
                                     'rotation': kf((0, Z3), (0.05, [-7, 0, 0]), (0.3, [-1.5, 0, 0]), (0.75, Z3))},
                             'rightarm': {'rotation': kf((0, Z3), (0.05, [-10, 0, 0]), (0.3, [-2, 0, 0]), (0.42, [6, -14, 0]), (0.56, [2, -6, 0]), (0.75, Z3))},
                             'leftarm': {'rotation': kf((0, Z3), (0.05, [-8, 0, 0]), (0.35, Z3))},
                             'waist': {'rotation': kf((0, Z3), (0.05, [-4, 0, 0]), (0.45, Z3))},
                             'head': {'rotation': kf((0, Z3), (0.05, [-5, 0, 0]), (0.4, Z3))}}, True)
    # a shotgun: a hard kick, then the fore hand pumps it
    A['blast'] = clip(0.62, {'gun': {'position': kf((0, Z3), (0.04, [0, 0.5, 2.2]), (0.25, [0, 0.1, 0.3]), (0.62, Z3)),
                                     'rotation': kf((0, Z3), (0.04, [-9, 0, 0]), (0.25, [-1, 0, 0]), (0.62, Z3))},
                             'leftarm': {'rotation': kf((0, Z3), (0.04, [-6, 0, 0]), (0.26, Z3), (0.36, [12, 0, 0]), (0.48, Z3))},
                             'rightarm': {'rotation': kf((0, Z3), (0.04, [-8, 0, 0]), (0.3, Z3))},
                             'waist': {'rotation': kf((0, Z3), (0.04, [-5, 0, 0]), (0.35, Z3))}}, True)
    # a launcher on the shoulder: a heavy kick that lifts the muzzle and rocks the whole body
    A['heavy'] = clip(0.65, {'gun': {'position': kf((0, Z3), (0.05, [0, 0.8, 2.8]), (0.65, Z3)), 'rotation': kf((0, Z3), (0.05, [-10, 0, 0]), (0.65, Z3))},
                             'rightarm': {'rotation': kf((0, Z3), (0.05, [-10, 0, 0]), (0.5, Z3))}, 'leftarm': {'rotation': kf((0, Z3), (0.05, [-9, 0, 0]), (0.5, Z3))},
                             'waist': {'rotation': kf((0, Z3), (0.05, [-6, 0, 0]), (0.5, Z3))}, 'head': {'rotation': kf((0, Z3), (0.05, [-5, 0, 0]), (0.5, Z3))}}, True)
    # sprayers and beams (flame, frost, poison, a medigun, a laser): no kick, the nozzle trembling in the stream
    A['stream'] = clip(0.15, {'gun': {'position': kf((0, Z3), (0.05, [0.15, 0.1, 0.35]), (0.1, [-0.15, 0.05, 0.2]), (0.15, Z3))}}, True)
    # a revolver: the gun hand flips up with the shot, the other hand fans a second
    A['revolver'] = clip(0.45, {'rightarm': {'rotation': kf((0, Z3), (0.04, [-26, 0, 0]), (0.2, [-4, 0, 0]), (0.3, Z3))},
                                'leftarm': {'rotation': kf((0, Z3), (0.18, Z3), (0.22, [-22, 0, 0]), (0.45, Z3))},
                                'waist': {'rotation': kf((0, Z3), (0.04, [-2, 0, 0]), (0.3, Z3))}}, True)
    # a bow: the string hand lets go and flicks back, the bow arm kicks, then the hand draws again
    A['bow'] = clip(0.7, {'leftarm': {'rotation': kf((0, Z3), (0.03, [8, 18, 0]), (0.25, [8, 18, 0]), (0.45, [-4, -6, 0]), (0.7, Z3))},
                          'rightarm': {'rotation': kf((0, Z3), (0.03, [-4, 0, 0]), (0.3, Z3))}})
    # a hacker: a burst of typing, the head nodding along
    A['type'] = clip(0.4, {'rightarm': {'rotation': kf((0, Z3), (0.08, [4, 0, 0]), (0.16, [-2, 0, 0]), (0.24, [4, 0, 0]), (0.4, Z3))},
                           'leftarm': {'rotation': kf((0, Z3), (0.08, [-2, 0, 0]), (0.16, [4, 0, 0]), (0.24, [-2, 0, 0]), (0.32, [4, 0, 0]), (0.4, Z3))},
                           'head': {'rotation': kf((0, Z3), (0.1, [4, 0, 0]), (0.4, Z3))}})
    # a blade: drawn back out to the right, swept across in front, the body turning with it
    A['slash'] = clip(0.5, {'rightarm': {'rotation': kf((0, Z3), (0.12, [-25, 50, 0]), (0.24, [-25, -65, 0]), (0.5, Z3))},
                            'leftarm': {'rotation': kf((0, Z3), (0.24, [-12, 10, 0]), (0.5, Z3))},
                            'body': {'rotation': kf((0, Z3), (0.12, [0, 14, 0]), (0.24, [0, -18, 0]), (0.5, Z3))}})
    # a hammer, a club, an axe: raised over the head with both hands, brought down, the body bending into it
    A['slam'] = clip(0.62, {'rightarm': {'rotation': kf((0, Z3), (0.2, [-105, 0, 0]), (0.32, [45, 0, 0]), (0.62, Z3))},
                            'leftarm': {'rotation': kf((0, Z3), (0.2, [-70, 0, 0]), (0.32, [30, 0, 0]), (0.62, Z3))},
                            'waist': {'rotation': kf((0, Z3), (0.2, [-6, 0, 0]), (0.32, [10, 0, 0]), (0.62, Z3))},
                            'root': {'position': kf((0, Z3), (0.32, [0, -0.6, 0]), (0.45, Z3))}})
    # fists: a one-two, the shoulders turning into each punch
    A['punch'] = clip(0.38, {'rightarm': {'rotation': kf((0, Z3), (0.08, [-38, 8, 0]), (0.18, Z3))},
                             'leftarm': {'rotation': kf((0, Z3), (0.18, Z3), (0.26, [-38, -8, 0]), (0.38, Z3))},
                             'body': {'rotation': kf((0, Z3), (0.08, [0, -12, 0]), (0.26, [0, 12, 0]), (0.38, Z3))}})
    # a staff, a wand, an orb, a flask: raised and thrust forward, the free hand thrown out, the head up
    A['cast'] = clip(0.55, {'rightarm': {'rotation': kf((0, Z3), (0.15, [-40, 0, 0]), (0.3, [10, 0, 0]), (0.55, Z3))},
                            'leftarm': {'rotation': kf((0, Z3), (0.15, [-30, -10, 0]), (0.3, [-10, 0, 0]), (0.55, Z3))},
                            'head': {'rotation': kf((0, Z3), (0.15, [-8, 0, 0]), (0.55, Z3))}, 'waist': {'rotation': kf((0, Z3), (0.15, [-3, 0, 0]), (0.3, [3, 0, 0]), (0.55, Z3))}})
    # a wrench: two quick knocks
    A['hammer'] = clip(0.5, {'rightarm': {'rotation': kf((0, Z3), (0.1, [-50, 0, 0]), (0.18, [15, 0, 0]), (0.3, [-40, 0, 0]), (0.38, [12, 0, 0]), (0.5, Z3))},
                             'head': {'rotation': kf((0, Z3), (0.18, [6, 0, 0]), (0.5, Z3))}})
    # a throw from over the shoulder: wound back, thrown, the other arm swinging for balance
    A['throw'] = clip(0.5, {'rightarm': {'rotation': kf((0, Z3), (0.1, [-20, 0, 0]), (0.22, [120, 0, 0]), (0.5, Z3))},
                            'leftarm': {'rotation': kf((0, Z3), (0.22, [-30, 0, 0]), (0.5, Z3))},
                            'waist': {'rotation': kf((0, Z3), (0.1, [-4, 0, 0]), (0.22, [8, 0, 0]), (0.5, Z3))}})
    A['swing'] = A['slash']
    return A


def tower_anims(looks):
    """animation.tds_tower.*: the stands, aims and poses by skin, the idle and the shots made from the bone names the
    looks use (a bone a look lacks is moved in none of its geometries)"""
    names = set()
    for lk in looks:
        names |= {b['name'] for b in (lk.gear or lk.body).bones}
    flashes = sorted(n for n in names if 'flash' in base_name(n))
    pulses = sorted(n for n in names if base_name(n) == 'pulse')
    # the idle: a figure breathes, shifts its weight and looks about; a building's parts spin, wave and beat
    idle = {'head': {'rotation': [S(120, 1.5), S(40, 6), 0]}, 'waist': {'position': [0, S(95, 0.12), 0], 'rotation': [0, 0, S(37, 1.2)]}}
    for n in sorted(names):
        mo = motion(n)
        if mo and n != 'head':
            idle[n] = mo
    show = {f: {'position': {'0.0': [0, 1000, 0], '0.06': [0, 1000, 0], '0.07': [0, 0, 0]}} for f in flashes}
    A = {
        'animation.tds_tower.aim': loop({'turret': {'rotation': [0, 'v.yaw', 0]}}),                  # a building's turret
        'animation.tds_tower.aim_root': loop({'root': {'rotation': [0, 'v.yaw', 0]}}),              # a person turns whole
        'animation.tds_tower.stand_root': loop({'root': {'position': [0, V.PED_TOP, 0]}}),        # a person onto the pedestal
        **{f'animation.tds_tower.pose_{k}': loop({b: {'rotation': r} for b, r in v.items()}) for k, v in POSES.items()},
        'animation.tds_tower.idle': loop(idle),
        **{f'animation.tds_tower.{k}': v for k, v in tower_shots(show).items()},
        'animation.tds_tower.pulse': {'loop': False, 'animation_length': 0.35, 'bones': {
            **{p: {'scale': {'0.0': [1, 1, 1], '0.08': [1.3, 1.3, 1.3], '0.35': [1, 1, 1]}} for p in pulses}, **show}},
        'animation.tds_tower.spawn': {'loop': False, 'animation_length': 1.2, 'bones': {
            'door': {'rotation': {'0.0': [0, 0, 0], '0.25': [-85, 0, 0], '0.9': [-85, 0, 0], '1.2': [0, 0, 0]}}}},
        # placed: the pedestal pops up, the figure (or the building) drops onto it and settles
        'animation.tds_tower.place': {'loop': False, 'animation_length': 0.5, 'bones': {
            'tds_base': {'scale': POP},
            'root': {'position': kf((0, [0, 12, 0]), (0.22, Z3), (0.3, [0, 1.0, 0]), (0.38, Z3)),
                     'scale': kf((0, [0.8, 1.2, 0.8]), (0.22, [1.0, 1.0, 1.0]), (0.26, [1.12, 0.86, 1.12]), (0.36, [0.97, 1.04, 0.97]), (0.5, [1, 1, 1]))}}},
        # upgraded: a hop and a turn, squashed on landing, the pedestal pulsing
        'animation.tds_tower.levelup': {'loop': False, 'animation_length': 0.55, 'bones': {
            'tds_base': {'scale': LVL},
            'root': {'position': kf((0, Z3), (0.16, [0, 4, 0]), (0.32, Z3), (0.38, [0, 0.6, 0]), (0.44, Z3)),
                     'scale': kf((0, [1, 1, 1]), (0.32, [1, 1, 1]), (0.36, [1.1, 0.9, 1.1]), (0.46, [0.98, 1.03, 0.98]), (0.55, [1, 1, 1]))}}},
        # reloading (played by the script when a tower runs out of ammunition): the gun tipped, the free hand to the
        # magazine and back, the head looking down at it
        'animation.tds_tower.reload': {'loop': False, 'animation_length': 1.0, 'bones': {
            'gun': {'rotation': kf((0, Z3), (0.15, [14, 0, -24]), (0.8, [14, 0, -24]), (1.0, Z3)), 'position': kf((0, Z3), (0.15, [0, -0.6, 0.6]), (0.8, [0, -0.6, 0.6]), (1.0, Z3))},
            'leftarm': {'rotation': kf((0, Z3), (0.2, [30, 0, -10]), (0.45, [40, 0, -10]), (0.65, [10, 0, 0]), (1.0, Z3))},
            'head': {'rotation': kf((0, Z3), (0.15, [12, 0, 0]), (0.85, [12, 0, 0]), (1.0, Z3))}}},
        # an ability: the figure raises a fist (or its thing) high, the building heaves
        'animation.tds_tower.ability': {'loop': False, 'animation_length': 0.9, 'bones': {
            'rightarm': {'rotation': kf((0, Z3), (0.15, [-160, 0, 10]), (0.6, [-160, 0, 10]), (0.9, Z3))},
            'head': {'rotation': kf((0, Z3), (0.15, [-12, 0, 0]), (0.6, [-12, 0, 0]), (0.9, Z3))},
            'tds_base': {'scale': LVL},
            'root': {'scale': kf((0, [1, 1, 1]), (0.12, [1.08, 0.92, 1.08]), (0.26, [0.96, 1.06, 0.96]), (0.4, [1, 1, 1]))}}},
        # stunned: the head reels, the arms sag, the figure sways (a building shudders)
        'animation.tds_tower.dizzy': loop({'head': {'rotation': [S(420, 10), S(210, 8), f"math.cos(v.clock * 420) * 10"]},
                                           'rightarm': {'rotation': [16, 0, 4]}, 'leftarm': {'rotation': [16, 0, -4]},
                                           'waist': {'rotation': [0, 0, S(210, 4)]}, 'turret': {'rotation': [0, S(300, 6), 0]},
                                           'root': {'position': [S(600, 0.15), 0, 0]}}),
        'animation.tds_tower.flashoff': loop({f: HIDE for f in flashes}),              # the ghost's flashes
        'animation.tds_tower.smoke': {'loop': True, 'animation_length': 1.4, 'particle_effects': {'0.0': {'effect': 'smoke', 'locator': 'smoke'}}},
    }
    return A


def tower_outputs(looks, empty_geo, built, rp):
    """tower.entity.json, ghost.entity.json, their render controllers, the tower animations and level controller"""
    n = len(looks)
    T = lambda m: f'textures/entity/tds/{m.name}'  # noqa: E731
    G = lambda m: f'geometry.tds.{m.name}'  # noqa: E731
    by = lambda f: [lk.index for lk in looks if f(lk)]  # noqa: E731
    people = by(lambda lk: lk.extra['root'] == 'root')
    poses = {k: by(lambda lk, k=k: lk.extra['pose'] == k) for k in POSES}
    smoke = by(lambda lk: lk.extra.get('smoke'))
    geo = {**{f'g{lk.index}': lk.body_geo for lk in looks}, **{f'o{lk.index}': (G(lk.gear) if lk.gear else empty_geo) for lk in looks}}
    tex = {**{f't{lk.index}': lk.body_tex for lk in looks}, **{f'o{lk.index}': (T(lk.gear) if lk.gear else HOLO) for lk in looks}}
    pose_anims = {f'pose_{k}': f'animation.tds_tower.pose_{k}' for k in POSES}
    anims = {'aim': 'animation.tds_tower.aim', 'aim_root': 'animation.tds_tower.aim_root', 'stand_root': 'animation.tds_tower.stand_root',
             **pose_anims, 'idle': 'animation.tds_tower.idle', 'place': 'animation.tds_tower.place', 'levelup': 'animation.tds_tower.levelup',
             'level': 'controller.animation.tds_tower.level', 'smoke': 'animation.tds_tower.smoke', 'dizzy': 'animation.tds_tower.dizzy'}
    stand = [{'stand_root': cond(people)}, *[{f'pose_{k}': cond(v)} for k, v in poses.items() if v]]
    scale = "0.36 * q.property('tds:size')"
    # v.yaw eases to tds:yaw along the shorter way (540 degrees a second); v.clock stops while the tower is frozen;
    # tds:st: 1 stunned, 2 frozen, 3 sold (it shrinks away before the script removes it)
    pre = ["v.st = q.property('tds:st');",
           "v.clock = v.clock + (v.st == 2 ? 0 : q.delta_time);",
           f"v.dy = math.mod(math.mod({YAW} - v.yaw, 360) + 540, 360) - 180;",
           "v.yaw = (v.st == 1 || v.st == 2) ? v.yaw : v.yaw + math.clamp(v.dy, -q.delta_time * 540, q.delta_time * 540);",
           "v.dying = v.st == 3 ? v.dying + q.delta_time : 0;",
           "v.fade = math.clamp(v.dying / 0.25, 0, 1);"]
    tower = {'identifier': 'tds:tower', 'materials': {'default': 'entity_alphatest', 'lit': 'entity_emissive_alpha_one_sided', 'blend': 'entity_alphablend'},
             'textures': {**tex, 'holo': HOLO}, 'geometry': geo,
             'scripts': {'scale': f'{scale} * (1 - v.fade)', 'initialize': ['v.lvl = 0; v.yaw = 0; v.clock = math.random(0, 10); v.dying = 0; v.fade = 0;'],
                         'pre_animation': pre,
                         'animate': ['aim', {'aim_root': cond(people)}, *stand, 'idle', 'place', 'level', {'smoke': cond(smoke)}, {'dizzy': 'v.st == 1'}]},
             'animations': anims, 'particle_effects': {'smoke': 'minecraft:basic_smoke_particle'},
             'render_controllers': ['controller.render.tds_tower', 'controller.render.tds_tower_gear']}
    ghost = {'identifier': 'tds:ghost', 'materials': {'default': 'entity_alphatest', 'blend': 'entity_alphablend'},
             'textures': {'ok': 'textures/entity/tds/ghost_ok', 'bad': 'textures/entity/tds/ghost_bad'}, 'geometry': geo,
             'scripts': {'scale': scale, 'animate': [*stand, 'flashoff']},
             'animations': {'stand_root': anims['stand_root'], **pose_anims, 'flashoff': 'animation.tds_tower.flashoff'},
             'render_controllers': ['controller.render.tds_ghost', 'controller.render.tds_ghost_gear']}
    pips = [{f'pip{i}': f"q.property('tds:lvl') >= {i}"} for i in range(1, 8)]
    geos = [lk.body_geo for lk in looks] + [G(lk.gear) for lk in looks if lk.gear]
    lv_rules, ghost_rules = level_rules(rp, geos, built)
    HO = f'{SK} + ({HOLO_OFF} ? {n} : 0)'                              # a hologram: the same looks drawn see-through
    body_mat = ['Material.default' if lk.body is None else 'Material.lit' for lk in looks]
    rcs = {
        'controller.render.tds_tower': {
            'arrays': {'textures': {'Array.skins': [f'Texture.t{i}' for i in range(n)] + ['Texture.holo'] * n},
                       'geometries': {'Array.geos': [f'Geometry.g{i}' for i in range(n)]},
                       'materials': {'Array.mats': body_mat + ['Material.blend'] * n}},
            'geometry': f'Array.geos[{SK}]', 'materials': [{'*': f'Array.mats[{HO}]'}], 'textures': [f'Array.skins[{HO}]'],
            'part_visibility': [{'*': True}, *pips, *lv_rules]},
        'controller.render.tds_tower_gear': {
            'arrays': {'textures': {'Array.gear': [f'Texture.o{i}' for i in range(n)] + ['Texture.holo'] * n},
                       'geometries': {'Array.ogeo': [f'Geometry.o{i}' for i in range(n)]},
                       'materials': {'Array.omats': ['Material.lit'] * n + ['Material.blend'] * n}},
            'geometry': f'Array.ogeo[{SK}]', 'materials': [{'*': f'Array.omats[{HO}]'}], 'textures': [f'Array.gear[{HO}]'],
            'part_visibility': [{'*': True}, *pips, *lv_rules]},
        'controller.render.tds_ghost': {
            'arrays': {'textures': {'Array.skins': ['Texture.bad', 'Texture.ok']}, 'geometries': {'Array.geos': [f'Geometry.g{i}' for i in range(n)]}},
            'geometry': f'Array.geos[{SK}]', 'materials': [{'*': 'Material.blend'}], 'textures': ["Array.skins[q.property('tds:ok') ? 1 : 0]"],
            'part_visibility': [{'*': True}, *[{f'pip{i}': False} for i in range(1, 8)], *ghost_rules]},
        'controller.render.tds_ghost_gear': {
            'arrays': {'textures': {'Array.gear': ['Texture.bad', 'Texture.ok']}, 'geometries': {'Array.ogeo': [f'Geometry.o{i}' for i in range(n)]}},
            'geometry': f'Array.ogeo[{SK}]', 'materials': [{'*': 'Material.blend'}], 'textures': ["Array.gear[q.property('tds:ok') ? 1 : 0]"],
            'part_visibility': [{'*': True}, *[{f'pip{i}': False} for i in range(1, 8)], *ghost_rules]},
    }
    controller = {'format_version': '1.10.0', 'animation_controllers': {
        'controller.animation.tds_tower.level': {
            'initial_state': 'default',
            'states': {
                'default': {'transitions': [{'pop': "q.property('tds:lvl') != v.lvl"}]},
                'pop': {'animations': ['levelup'], 'on_entry': ["v.lvl = q.property('tds:lvl');"],
                        'transitions': [{'default': 'q.all_animations_finished'}]}}}}}
    wrap = lambda d: {'format_version': '1.10.0', 'minecraft:client_entity': {'description': d}}  # noqa: E731
    return wrap(tower), wrap(ghost), rcs, tower_anims(looks), controller


def level_rules(rp, geos, built=None):
    """part_visibility for the upgrade looks, from the bone names the tower geometries use: lvN_* from level N, preN_* below N,
    rAtoB_* from A to below B (the original's towers change their model at each upgrade). The ghost shows level 0.
    The bone names come from the models this build makes (`built`: name -> Model), so the geometry and its rules are written
    together; only a geometry not built in this run is read from rp/models (reading the files alone gave the rules of the
    previous build: the first build after adding a part wrote a controller without its rule)."""
    import glob
    import re
    names, seen = set(), set()
    for m in (built or {}).values():
        if f'geometry.tds.{m.name}' in geos:
            names |= {b['name'] for b in m.bones}
            seen.add(f'geometry.tds.{m.name}')
    for p in glob.glob(os.path.join(rp, 'models', 'entity', 'tds', '*.geo.json')):
        g = json.load(open(p))['minecraft:geometry'][0]
        if g['description']['identifier'] in geos and g['description']['identifier'] not in seen:
            names |= {b['name'] for b in g['bones']}
    L = "q.property('tds:lvl')"
    found = sorted({m.group(0) for n in names for m in [re.match(r'(lv\d|pre\d|r\dto\d)_', n)] if m})
    rules, ghost = [], []
    for pre in found:
        a = re.findall(r'\d', pre)
        cond = f'{L} >= {a[0]}' if pre.startswith('lv') else f'{L} < {a[0]}' if pre.startswith('pre') else f'{L} >= {a[0]} && {L} < {a[1]}'
        rules.append({f'{pre}*': cond})
        shown_at_0 = pre.startswith('pre') or (pre.startswith('r') and a[0] == '0')
        ghost.append({f'{pre}*': shown_at_0})
    return rules, ghost


def arr(prefix, n=8):
    return [f'{prefix}{i}' for i in range(n)]


def two_rc(kind, gear_skins, base_mats, gear_mats, parts=None, tint=False):
    """the body controller and the gear controller of one entity"""
    body = {'arrays': {'textures': {'Array.skins': arr('Texture.t')}, 'geometries': {'Array.geos': arr('Geometry.g')},
                       'materials': {'Array.mats': [f'Material.{m}' for m in base_mats[0]]}},
            'geometry': f'Array.geos[{SK}]', 'materials': [{'*': f'Array.mats[{base_mats[1]}]'}], 'textures': [f'Array.skins[{SK}]']}
    gear = {'arrays': {'textures': {'Array.gear': arr('Texture.o')}, 'geometries': {'Array.ogeo': arr('Geometry.o')},
                       'materials': {'Array.omats': [f'Material.{m}' for m in gear_mats[0]]}},
            'geometry': f'Array.ogeo[{SK}]', 'materials': [{'*': f'Array.omats[{gear_mats[1]}]'}], 'textures': [f'Array.gear[{SK}]']}
    if tint:
        body['arrays']['textures'] = {'Array.skins': ['Texture.bad', 'Texture.ok']}
        body['textures'] = ["Array.skins[q.property('tds:ok') ? 1 : 0]"]
        gear['arrays']['textures'] = {'Array.gear': ['Texture.bad', 'Texture.ok']}
        gear['textures'] = ["Array.gear[q.property('tds:ok') ? 1 : 0]"]
    if parts:
        body['part_visibility'] = parts
        gear['part_visibility'] = parts
    return {f'controller.render.tds_{kind}': body, f'controller.render.tds_{kind}_gear': gear}


def entity(ident, geos, gear_geos, texs, gear_texs, mats, gear_skins, scale, anims, animate, kind, extra=None):
    d = {'identifier': ident, 'materials': mats,
         'textures': {**{f't{i}': t for i, t in enumerate(texs) if t}, **{f'o{i}': t for i, t in enumerate(gear_texs) if t}},
         'geometry': {**{f'g{i}': g for i, g in enumerate(geos)}, **{f'o{i}': g for i, g in enumerate(gear_geos)}},
         'scripts': {'scale': scale},
         'render_controllers': [f'controller.render.tds_{kind}', {f'controller.render.tds_{kind}_gear': skin_is(*gear_skins)}]}
    if anims:
        d['animations'] = anims
        d['scripts']['animate'] = animate
    for k, v in (extra or {}).items():
        if k == 'scripts':
            d['scripts'].update(v)
        else:
            d[k] = v
    return {'format_version': '1.10.0', 'minecraft:client_entity': {'description': d}}


def outputs(rp, models, looks=None):
    """looks: kind -> the roster's looks (roster.py) for the kinds drawn by look (one per entity of the data)"""
    import roster_entities as RE
    looks = looks or {}
    out = {}
    j = lambda *p: os.path.join(rp, *p)  # noqa: E731
    T = lambda n: f'textures/entity/tds/{n}'  # noqa: E731
    G = lambda n: f'geometry.tds.{n}'  # noqa: E731
    EMPTY = G('empty')

    # enemies: one look per enemy of the data (roster.py): a vanilla body with our gear, or a body of ours
    rcs, clips = {}, {}
    client, rc, more = RE.entity('enemy', looks['enemy'], EMPTY, HOLO, 0.26)
    out[j('entity', 'enemy.entity.json')] = dumps(client)
    rcs.update(rc)
    clips.update(more)

    # towers: one look per tower of the data (roster_towers.py): a figure on our pedestal, or a building of ours
    tower, ghost, rc, tanims, tcontrol = tower_outputs(looks['tower'], EMPTY, models, rp)
    out[j('entity', 'tower.entity.json')] = dumps(tower)
    out[j('entity', 'ghost.entity.json')] = dumps(ghost)
    rcs.update(rc)

    # units: one look per unit of the data (roster_units.py): the player's body in our clothes, a vanilla skeleton in our
    # armour, or a body of our own (machines, plants, duckies)
    client, rc, more = RE.entity('unit', looks['unit'], EMPTY, HOLO, 0.28, fx='fx_unit')
    out[j('entity', 'unit.entity.json')] = dumps(client)
    rcs.update(rc)
    clips.update(more)

    out[j('render_controllers', 'tds.render_controllers.json')] = dumps({'format_version': '1.8.0', 'render_controllers': rcs})
    out[j('animations', 'tds_tower.animation.json')] = dumps({'format_version': '1.8.0', 'animations': tanims})
    look_anims = RE.animations(looks)
    look_anims['animations'].update({f'animation.tds_look.{k}': v for k, v in clips.items()})
    out[j('animations', 'tds_look.animation.json')] = dumps(look_anims)
    out[j('animation_controllers', 'tds_tower.animation_controllers.json')] = dumps(tcontrol)
    import io
    from PIL import Image
    buf = io.BytesIO(); Image.new('RGBA', (16, 16), (110, 236, 255, 120)).save(buf, format='PNG')
    out[j('textures', 'entity', 'tds', 'holo_tint.png')] = buf.getvalue()          # the hologram's body: one see-through tint
    out[j('models', 'entity', 'tds', 'empty.geo.json')] = dumps({'format_version': '1.16.0', 'minecraft:geometry': [{
        'description': {'identifier': EMPTY, 'texture_width': 16, 'texture_height': 16}, 'bones': [{'name': 'root', 'pivot': [0, 0, 0]}]}]})
    return out
