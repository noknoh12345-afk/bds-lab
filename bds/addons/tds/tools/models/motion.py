"""How the roster's looks move (enemies and units): every clip of animation.tds_look.* and the client scripts that drive them.

The look's legs follow the ground it covers, not the clock: the script tells the client how fast the enemy (or unit) is
going along the path (tds:pace, studs/s x 10, the sim speed included) and what happens to it (tds:st), and the client
entity keeps a few variables (scripts below):

    v.walk   the gait's phase in degrees: it advances by the distance walked (a stride is one turn, longer for a bigger
             look), so feet keep pace with the ground; a slowed enemy walks slower, a stopped one stands
    v.move   0..1, eases in and out when the look starts or stops walking: the limbs swing that much
    v.clock  seconds that stop while the look is frozen (breathing, flapping, looking about, spinning parts)
    v.dying  seconds since it died (tds:st 3 on the ground, 5 falling from the air) or left (4: into the base, a unit
             at its end); v.fall / v.drop ease the fall, v.fade shrinks it away before the script removes it
    v.grow   the pop when it appears (0 -> 1.15 -> 1 in 0.4 s)

tds:st: 0 moving, 1 stunned (dizzy), 2 frozen (all motion stops), 3 dies, 4 leaves, 5 dies in the air (falls).
Rotations add to the bind pose: -rx swings a hanging limb forward (an arm raised to the front at -90), +rx back; for a
standing body +rx tips the top forward. Bone names match case-insensitively; a bone a geometry lacks is not moved.
"""
from __future__ import annotations

SKIN = "q.property('tds:skin')"
K = 400.0                          # the gait's degrees per stud walked at size 1 (times the clip's cadence below)

# degrees of v.walk per stud, relative to K: a stride (one turn of the gait) is about the distance the legs cover, so
# a short stride turns faster; wheels turn by their radius
CADENCE = {'walk': 1.15, 'march': 1.3, 'run': 0.87, 'stomp': 1.7, 'golem': 1.27, 'beast': 1.1, 'mite': 2.0, 'hop': 0.9,
           'blob': 0.9, 'hover': 1.0, 'vex': 1.0, 'phantom': 1.0, 'stand': 1.0, 'blaze': 1.0, 'float': 1.0,
           'patrol': 1.22, 'pistol': 1.22, 'carry': 1.22, 'brawl': 1.22, 'ride': 1.17, 'drive': 1.35, 'fly': 1.0,
           'stride': 1.0, 'sentry': 1.0, 'sway': 1.0, 'waddle': 1.6, 'scuttle': 2.0}


def _sh(ph):
    return f' - {ph}' if ph > 0 else f' + {-ph}' if ph < 0 else ''


def ws(amp, ph=0, k=1, base=None):
    """a swing with the gait: sin(phase) x amp, as much as the look is walking (v.move)"""
    kk = f' * {k}' if k != 1 else ''
    e = f'math.sin(v.walk{kk}{_sh(ph)}) * {amp} * v.move'
    return f'{base} + {e}' if base is not None else e


def wb(amp, k=1, sharp=False):
    """the body's rise at each step (twice a stride): highest with the legs together"""
    kk = f' * {k}' if k != 1 else ''
    c = f'math.abs(math.cos(v.walk{kk}))'
    if sharp:                                            # a heavy step: long up, a quick drop onto the foot
        c = f'math.sqrt({c})'
    return f'{c} * {amp} * v.move'


def ts(rate, amp, ph=0, base=None):
    """a motion on the look's own clock (it stops while frozen)"""
    e = f'math.sin(v.clock * {rate}{_sh(ph)}) * {amp}'
    return f'{base} + {e}' if base is not None else e


def tc(rate, amp, ph=0):
    return f'math.cos(v.clock * {rate}{_sh(ph)}) * {amp}'


def add(*xs):
    xs = [str(x) for x in xs if x not in (0, '0', None)]
    return ' + '.join(xs) if xs else 0


def loop(bones, **kw):
    return {'loop': True, 'bones': bones, **kw}


def rot(x=0, y=0, z=0):
    return {'rotation': [x, y, z]}


def legs2(amp, names=(('rightLeg', 'leg0'), ('leftLeg', 'leg1')), base=0):
    """two legs swinging opposite (the illagers' and golems' are leg0 / leg1)"""
    out = {}
    for n in names[0]:
        out[n] = rot(ws(amp, base=base if base else None))
    for n in names[1]:
        out[n] = rot(ws(-amp, base=base if base else None))
    return out


def arms2(amp, base=0, spread=0, sway=0):
    """two arms swinging against the legs (the right arm with the left leg), held at `base` (-84: ahead, as a zombie's)"""
    b = f'{base}' if base else None
    r = add(ws(-amp, base=b) if amp else b, ts(140, sway) if sway else 0)
    l = add(ws(amp, base=b) if amp else b, ts(140, sway, 70) if sway else 0)
    return {'rightArm': rot(r, 0, spread), 'leftArm': rot(l, 0, -spread)}


def look_about(rate=55, amp=9, nod=2, base_x=0):
    """the head looks along the way and about, a little nod with each step"""
    return {'head': rot(add(base_x, ts(rate * 3, nod, 40), ws(-1.5, k=2)), ts(rate, amp), 0)}


def breathe(bone, amp=0.15):
    return {bone: {'position': [0, ts(95, amp), 0]}}


# ------------------------------------------------------------------------------------------------ the gaits
def root_move(anim, roll=1.0):
    """how the whole body rides on a gait: its rise and fall with each step, its lean and its roll over each foot. On the
    waist (pivot at the hips) for the rigs that have one; on the body (pivot at the neck) for the rest, the roll halved"""
    r = lambda a: a * roll   # noqa: E731
    return {'walk': {'position': [0, add(wb(0.5), ts(95, 0.12)), 0], 'rotation': [ws(2, k=2, base='3'), 0, ws(r(2.5))]},
            'march': {'position': [0, add(wb(0.45), ts(95, 0.12)), 0], 'rotation': [0, 0, ws(r(1.5))]},
            'run': {'position': [0, wb(0.8), 0], 'rotation': [add('2', '6 * v.move'), 0, ws(r(2))]},
            'stomp': {'position': [0, add(wb(0.6, sharp=True), ts(70, 0.15)), 0], 'rotation': [ws(2, k=2), 0, ws(r(3.5))]},
            'hover': {'position': [0, ts(110, 1.0, 0, 2.5), 0], 'rotation': [add('8 * v.move', ts(110, 2)), 0, 0]}}[anim]


ROOT_MOVES = ('walk', 'march', 'run', 'stomp', 'hover')


def gaits():
    G = {}
    # a zombie's shamble: arms reaching ahead, short heavy steps, the body rolling over each foot
    G['walk'] = loop({**legs2(30), **arms2(5, -84, spread=3, sway=3), 'waist': root_move('walk'), **look_about(50, 10, 2, base_x=4)})
    # upright soldiers, knights and casters: arms swinging against the legs, the head steady
    G['march'] = loop({**legs2(26), **arms2(22, -4), 'waist': root_move('march'), **look_about(40, 7, 1.5)})
    # runners: a long stride, arms pumping bent, the body leaning into the run
    G['run'] = loop({**legs2(42), **arms2(38, -14), 'waist': root_move('run'), **look_about(70, 5, 1, base_x=-4)})
    # bosses: slow heavy steps, the body rolling and dropping onto each foot, the head nodding with it
    G['stomp'] = loop({**legs2(20), **arms2(12, -10, spread=4), 'waist': root_move('stomp'),
                       'head': rot(add(ws(-3, k=2), ts(120, 1.5)), ts(35, 10), ws(-2))})
    # floating casters and angels: a slow rise and fall, legs dangling, arms drifting, leaning into the way
    G['hover'] = loop({'rightLeg': rot(ts(90, 4, 0, 12)), 'leftLeg': rot(ts(90, 4, 30, 16)),
                       'leg0': rot(ts(90, 4, 0, 12)), 'leg1': rot(ts(90, 4, 30, 16)),
                       'rightArm': rot(ts(120, 6, 0, -30), 0, ts(80, 3, 0, 8)), 'leftArm': rot(ts(120, 6, 60, -30), 0, ts(80, 3, 40, -8)),
                       'waist': root_move('hover'), **look_about(45, 10)})
    G['vex'] = loop({'body': {'position': [0, ts(120, 0.8), 0], 'rotation': [add('10 * v.move', ts(90, 3)), 0, ts(70, 4)]},
                     'leftWing': rot(0, ts(1400, -25), 0), 'rightWing': rot(0, ts(1400, 25), 0),
                     'leftArm': rot(ts(150, 10, 0, -30)), 'rightArm': rot(ts(150, 10, 60, -30)), **look_about(70, 10)})
    G['phantom'] = loop({'wing0': rot(0, 0, ts(540, -22)), 'wingtip0': rot(0, 0, ts(540, -18, 70)),
                         'wing1': rot(0, 0, ts(540, 22)), 'wingtip1': rot(0, 0, ts(540, 18, 70)),
                         'body': {'position': [0, ts(540, 0.6, -90), 0], 'rotation': [ts(270, 2), 0, ts(130, 5)]},
                         'tail': rot(ts(270, 6)), 'tailtip': rot(ts(270, 9, 50)), 'head': rot(ts(270, 3, 120), ts(60, 8), 0)})
    # a golem's lumber: long arms swinging against the legs, the body rolling over each foot
    G['golem'] = loop({'arm0': rot(ws(-18, base=ts(60, 2))), 'arm1': rot(ws(18, base=ts(60, 2, 90))),
                       'leg0': rot(ws(22)), 'leg1': rot(ws(-22)),
                       'body': {'position': [0, add(wb(0.5, sharp=True), ts(80, 0.12)), 0], 'rotation': [ws(1.5, k=2), 0, ws(3)]},
                       'head': rot(ws(-2, k=2), ts(40, 9), ws(-2))})
    # four legs in diagonal pairs, the head bobbing with them, the tail wagging
    G['beast'] = loop({'leg0': rot(ws(26)), 'leg1': rot(ws(-26)), 'leg2': rot(ws(-26)), 'leg3': rot(ws(26)),
                       'neck': rot(ws(3, k=2)), 'headb': rot(ws(4, k=2), ts(60, 10), 0), 'head': rot(ws(3, k=2), ts(50, 6), 0),
                       'tailb': rot(ts(150, 6, 0, ws(10, k=2)), ts(400, 14), 0), 'body': {'position': [0, wb(0.5), 0]}})
    # a mite's segments wriggle as it scuttles (a slow writhe standing)
    G['mite'] = loop({'section_0': rot(0, add(ws(22), ts(200, 6)), 0), 'section_1': rot(0, add(ws(12, 60), ts(200, 4, 60)), 0),
                      'section_3': rot(0, add(ws(-20), ts(200, -6)), 0)})
    # a magma blob: one hop a stride, squashed on landing (a slow pulse standing)
    G['blob'] = loop({'insideCube': {'scale': [add(1, ws(0.08, k=2), ts(130, 0.03)), add(1, ws(-0.12, k=2), ts(130, -0.04)), add(1, ws(0.08, k=2), ts(130, 0.03))],
                                     'position': [0, 'math.abs(math.sin(v.walk * 0.5)) * 3 * v.move', 0]}})
    G['stand'] = loop({'baseplate': {'position': [0, ts(100, 0.6, 0, 1.0), 0], 'rotation': [add('6 * v.move', 0), 0, 0]},
                       'rightarm': rot(ts(150, 6, 0, -40), 0, 10), 'leftarm': rot(ts(150, 6, 40, -20), 0, -10), 'body': rot(0, ts(60, 6), 0)})
    G['blaze'] = loop({**blaze_rods(), 'head': {'position': [0, ts(150, 0.8), 0], 'rotation': [ts(90, 4), ts(40, 12), 0]}})
    # our hopping bodies (slimes, mandrakes, crates, snowmen): a hop a stride, squash and stretch, a lid that claps
    hop = 'math.abs(math.sin(v.walk * 0.5))'
    G['hop'] = loop({'root': {'position': [0, f'{hop} * 2.4 * v.move', 0],
                              'scale': [add(1, ws(0.06, k=2), ts(130, 0.03)), add(1, ws(-0.07, k=2), ts(130, -0.04)), add(1, ws(0.06, k=2), ts(130, 0.03))]},
                     'leg0': rot(ws(14, k=2)), 'leg1': rot(ws(-14, k=2)), 'leg2': rot(ws(-14, k=2)), 'leg3': rot(ws(14, k=2)),
                     'lid': rot(f'-{hop} * 18 * v.move - math.abs({ts(120, 3)})'), 'petals': rot(0, 'v.clock * 40', 0),
                     'head_s': rot(ts(130, 4), ts(60, 10), 0)})
    G['float'] = loop({'root': {'position': [0, ts(110, 1.2, 0, 2.0), 0], 'rotation': [add('6 * v.move', ts(80, 2)), 0, ts(65, 3)]},
                       'spin': rot(0, 'v.clock * 60', 0)})
    # ---- the units: people walking with what they hold, machines, plants and duckies
    walker = lambda: {**legs2(26), 'waist': {'position': [0, add(wb(0.4), ts(95, 0.1)), 0]},          # noqa: E731
                      'body': rot(0, ws(3), 0), **look_about(50, 6, 1)}
    G['patrol'] = loop({**walker(), 'rightArm': rot(add(-70, ws(1.5, k=2)), -12, 0), 'leftArm': rot(add(-68, ws(1.5, k=2)), 34, 0)})
    G['pistol'] = loop({**walker(), 'rightArm': rot(add(-84, ws(1.2, k=2)), -6, 0), 'leftArm': rot(ws(18), 0, -4)})
    G['carry'] = loop({**walker(), 'rightArm': rot(add(-34, ws(4)), -10, 0), 'leftArm': rot(add(-34, ws(-4)), 10, 0)})
    G['brawl'] = loop({**walker(), 'rightArm': rot(add(-108, ws(6)), -8, 0), 'leftArm': rot(add(-74, ts(160, 3)), 18, 0)})
    G['ride'] = loop({'rightLeg': rot(-46, 8, 0), 'leftLeg': rot(-46, -8, 0), 'rightArm': rot(-58, -8, 0), 'leftArm': rot(-58, 8, 0),
                      'waist': rot(add(10, ws(1, k=4)), 0, 0),                                  # leaning on the bars from the hip
                      'head': rot(ts(120, 2, 0, -10), ts(40, 6), 0),
                      **{w: rot('v.walk') for w in ('wheel_f', 'wheel_b')}})
    G['drive'] = loop({**{w: rot('v.walk') for w in WHEELS}, 'turret': rot(0, ts(70, 30), 0),
                       'root': {'position': [0, add(ws(0.14, k=3), ts(90, 0.04)), 0], 'rotation': [ws(0.6, k=2), 0, ws(0.4, k=3)]}})
    G['fly'] = loop({'fly': {'position': [0, ts(110, 1.0), 0], 'rotation': [ts(90, 3), 0, ts(70, 6)]}, 'prop': rot(0, 0, 'v.clock * 1600')})
    G['stride'] = loop({'rightLeg': rot(ws(22)), 'leftLeg': rot(ws(-22)), 'rightArm': rot(ws(-6)), 'leftArm': rot(ws(6)),
                        'body': {'position': [0, wb(0.8, sharp=True), 0], 'rotation': [0, 0, ws(2)]},
                        'spinz_r': rot(0, 0, 'v.clock * 600'), 'spinz_l': rot(0, 0, 'v.clock * -600')})
    G['sentry'] = loop({'turret': rot(0, ts(60, 40), 0), 'spinz': rot(0, 0, 'v.clock * 600')})
    G['sway'] = loop({'stem': rot(ts(70, 3), 0, ts(90, 5)), 'head_s': rot(ts(110, 6), ts(50, 10), 0)})
    G['waddle'] = loop({'duck': {'rotation': [0, ws(6), add(ws(9), ts(90, 2))], 'position': [0, wb(0.6), 0]}, 'head_s': rot(add(ws(6, k=2), ts(120, 3)), 0, 0)})
    G['scuttle'] = loop({**{f'leg{k}': rot(0, add(ws(14, 60 * k), ts(160, 3, 40 * k)), 0) for k in range(6)},
                         'body': {'position': [0, ws(0.2, k=2), 0]}, 'claw_r': rot(ts(200, 10)), 'claw_l': rot(ts(200, 10, 90))})
    return G


WHEELS = ['wheel_fl', 'wheel_fr', 'wheel_ml', 'wheel_mr', 'wheel_bl', 'wheel_br', 'wheel_0l', 'wheel_0r', 'wheel_1l', 'wheel_1r',
          'wheel_2l', 'wheel_2r', 'wheel_3l', 'wheel_3r', 'wheel_f', 'wheel_b']


def blaze_rods():
    """the twelve rods of a blaze body circle it in three rings (their geometry stacks them at one place)"""
    out = {}
    for i in range(12):
        ring, k = divmod(i, 4)
        r, y, rate = ((9.0, 2.0, -180), (7.0, -2.0, 140), (5.0, -6.5, -110))[ring]
        a = f'v.clock * {rate} + {90 * k + 45 * ring}'
        out[f'upperBodyParts{i}'] = {'position': [f'math.cos({a}) * {r}', f'{y} + math.cos(v.clock * 280 + {i * 30}) * 0.8', f'math.sin({a}) * {r}']}
    return out


# always on: the spinning, beating and fluttering parts some looks have (a bone a look lacks is not moved); a unit's muzzle
# flashes wait out of sight (positions add: its shot adds them back)
FX_BONES = {'halo': rot(0, 'v.clock * 50', 0), 'aura': rot(0, 'v.clock * 30', 0),
            'orbit': {'rotation': [0, 'v.clock * 90', 0], 'position': [0, ts(120, 0.6), 0]},
            'wing_l': rot(0, ts(500, 22, 0, 12), 0), 'wing_r': rot(0, ts(500, -22, 0, -12), 0),
            'cape': rot(add(ts(160, 5, 0, 10), '8 * v.move'), 0, ts(230, 2)), 'scarf_tail': rot(add(ts(400, 8, 0, 12), '10 * v.move'), ts(300, 10), 0),
            'bandana_tail': rot(add(ts(400, 8, 0, 8), '10 * v.move'), ts(300, 12), 0), 'plume': rot(ts(200, 4), 0, 0)}
HIDE = {'position': [0, -1000, 0]}


def fx(flashes=()):
    return loop({**FX_BONES, **{f: HIDE for f in flashes}})


def fx_unit(flashes=()):
    return loop({k: v for k, v in FX_BONES.items() if k in ('cape',)} | {f: HIDE for f in flashes})


# ------------------------------------------------------------------------------------------------ what happens to it
def dizzy():
    """stunned: the head reels, the arms hang, the body sways (on the clock: it stops if also frozen)"""
    return loop({'head': rot(ts(420, 10), ts(210, 8), tc(420, 10)), 'rightArm': rot(14, 0, 6), 'leftArm': rot(14, 0, -6),
                 'arm0': rot(14, 0, 0), 'arm1': rot(14, 0, 0), 'rightarm': rot(14, 0, 6), 'leftarm': rot(14, 0, -6),
                 'waist': rot(0, 0, ts(210, 3)), 'body': {'position': [0, ts(420, 0.2), 0]}})


def die(root, py):
    """killed on the ground: it topples backwards about its feet (the root turns about its pivot `py` above the feet, moved
    so the feet stay put), the arms thrown up, the head lolling; v.fall eases it like a fall, with a small bounce"""
    a = '84 * v.fall'
    out = {root: {'rotation': [f'-{a}', 0, 0],
                  'position': [0, f'{py} * (math.cos({a}) - 1) - 1.5 * v.fall', f'{py} * math.sin({a})' if py else 0]}}
    for arm in ('rightArm', 'leftArm', 'arm0', 'arm1'):
        out[arm] = rot('-50 * v.fall')
    out['head'] = rot('24 * v.fall')
    return {'loop': True, 'bones': out}


def sink(roots):
    """killed, for a body of many roots (a ravager, a blaze): it sinks as it shrinks"""
    return loop({r: {'position': [0, '-4 * v.fall', 0]} for r in roots})


def fall(roots):
    """killed in the air: it tumbles down to the path (it flies 2.5 blocks up; the look is drawn 0.26 x size)"""
    drop = "-154 / v.sz * v.drop"
    return loop({r: {'position': [0, drop, 0], 'rotation': ['-60 * v.drop', 0, '140 * v.drop']} for r in roots})


def leave(roots):
    """into the base (or a unit at its end): a hop forward as it shrinks away"""
    t = 'math.min(1, v.dying / 0.3)'
    return loop({r: {'position': [0, f'math.sin({t} * 180) * 3', f'-6 * {t}']} for r in roots})


def cast():
    """an enemy uses an ability (played by the script): it rears back with its arms up, then slams them down"""
    k = lambda a, b, c: {'0.0': [0, 0, 0], '0.22': a, '0.4': b, '0.75': c}   # noqa: E731
    up, slam, rest = [-150, 0, 0], [-40, 0, 0], [0, 0, 0]
    return {'loop': False, 'animation_length': 0.75, 'bones': {
        **{n: {'rotation': k(up, slam, rest)} for n in ('rightArm', 'leftArm', 'arm0', 'arm1', 'rightarm', 'leftarm')},
        'head': {'rotation': k([-22, 0, 0], [12, 0, 0], rest)},
        'waist': {'rotation': k([-8, 0, 0], [10, 0, 0], rest), 'position': k([0, 1.2, 0], [0, -0.6, 0], rest)},
        'wing0': {'rotation': k([0, 0, -40], [0, 0, 25], rest)}, 'wing1': {'rotation': k([0, 0, 40], [0, 0, -25], rest)},
        'section_0': {'rotation': k([-30, 0, 0], [10, 0, 0], rest)}, 'headb': {'rotation': k([-30, 0, 0], [15, 0, 0], rest)},
        'root': {'position': k([0, 2.5, 0], [0, -0.5, 0], rest)}}}


def shot(flashes=()):
    """a unit fires (played by the script): the gun and the arms kick, a turret's barrel recoils, the flash shows"""
    show = {f: {'position': {'0.0': [0, 1000, 0], '0.06': [0, 1000, 0], '0.07': [0, 0, 0]}} for f in flashes}
    kick = lambda v: {'0.0': [0, 0, 0], '0.04': v, '0.22': [0, 0, 0]}   # noqa: E731
    return {'loop': False, 'animation_length': 0.22, 'bones': {
        'gun': {'position': kick([0, 0.3, 1.2])}, 'rightArm': {'rotation': kick([-7, 0, 0])}, 'leftArm': {'rotation': kick([-5, 0, 0])},
        'body': {'rotation': kick([-2, 0, 0])}, 'turret': {'position': kick([0, 0, 0.8])}, 'barrel': {'position': kick([0, 0, 1.4])}, **show}}


# ------------------------------------------------------------------------------------------------ the client scripts
def cadence_expr(ranges):
    """Molang: the gait's cadence of the look drawn (by tds:skin: the roster keeps each animation's looks together)"""
    parts = sorted(ranges.items(), key=lambda kv: kv[1][0])
    e = '1'
    for anim, (a, b) in reversed(parts):
        e = f'({SKIN} < {b} ? {CADENCE.get(anim, 1.0)} : {e})'
    return e


def scripts(base_scale, ranges):
    """initialize / pre_animation / scale of a roster kind's client entity"""
    return {
        'initialize': ['v.walk = math.random(0, 360); v.move = 0; v.clock = math.random(0, 10); v.dying = 0; v.fall = 0; v.drop = 0; v.fade = 0;'],
        'pre_animation': [
            "v.sz = math.max(0.3, q.property('tds:size'));",
            "v.st = q.property('tds:st');",
            "v.pace = (v.st == 1 || v.st == 2) ? 0 : q.property('tds:pace') * 0.1;",
            "v.clock = v.clock + (v.st == 2 ? 0 : q.delta_time);",
            f"v.walk = math.mod(v.walk + q.delta_time * v.pace * {K} * {cadence_expr(ranges)} / v.sz, 3600);",
            "v.move = math.lerp(v.move, (v.pace > 0.05 && v.st < 3) ? 1 : 0, math.min(1, q.delta_time * 8));",
            "v.dying = v.st >= 3 ? v.dying + q.delta_time : 0;",
            "v.fall = math.min(1, math.pow(v.dying / 0.42, 2)) - ((v.dying > 0.42 && v.dying < 0.62) ? math.sin((v.dying - 0.42) * 900) * 0.06 : 0);",
            "v.drop = math.min(1, math.pow(v.dying / 0.55, 2));",
            "v.fade = v.st == 4 ? math.clamp(v.dying / 0.3, 0, 1) : (v.st >= 3 ? math.clamp((v.dying - 0.6) / 0.3, 0, 1) : 0);",
            "v.grow = q.life_time < 0.4 ? math.sin(q.life_time * 300) / 0.866 : 1;",
        ],
        'scale': f"{base_scale} * q.property('tds:size') * v.grow * (1 - v.fade)",
    }


def roots_of(model):
    """(the root bones of a look's geometry, the first root's pivot height)"""
    roots = [b['name'] for b in model.bones if not b.get('parent')]
    py = next(b['pivot'][1] for b in model.bones if b['name'] == roots[0])
    return roots, round(py, 2)


def squash(root):
    """a soft body (a slime, a mandrake, a crate, a balloon) killed: it squashes flat and spreads as it fades"""
    return loop({root: {'scale': ['1 + 0.5 * v.fall', '1 - 0.88 * v.fall', '1 + 0.5 * v.fall'], 'position': [0, '-0.5 * v.fall', 0]}})


SOFT = {'hop', 'float', 'blob'}


def state_anims(looks):
    """the clips of what happens to a look, by the root of its geometry (one clip serves every look with that root, of any
    kind): ({clip name: clip}, the client entity's animate entries)"""
    from entities import cond
    groups = {}
    for lk in looks:
        roots, py = roots_of(lk.gear or lk.body)
        if len(roots) == 1:
            key = f"{roots[0].lower()}_{str(py).replace('.', 'p').replace('-', 'm')}" + ('_soft' if lk.anim in SOFT else '')
        else:
            key = f'{roots[0].lower()}_x{len(roots)}'
        groups.setdefault(key, (roots, py, []))[2].append(lk.index)
    clips, animate = {}, []
    for key, (roots, py, idx) in sorted(groups.items()):
        c = cond(idx)
        clips[f'die_{key}'] = squash(roots[0]) if key.endswith('_soft') else die(roots[0], py) if len(roots) == 1 else sink(roots)
        clips[f'fall_{key}'] = fall(roots)
        clips[f'leave_{key}'] = leave(roots)
        animate += [{f'die_{key}': f'v.st == 3 && ({c})'}, {f'fall_{key}': f'v.st == 5 && ({c})'}, {f'leave_{key}': f'v.st == 4 && ({c})'}]
    clips['dizzy'] = dizzy()
    animate.append({'dizzy': 'v.st == 1'})
    return clips, animate


def bob_anims(looks):
    """a body-rooted rig (no waist: the illagers, the drowned, the piglins) rides its gait on the body instead: one clip per
    gait for the looks of such rigs"""
    from entities import cond
    idx = {}
    for lk in looks:
        m = lk.gear or lk.body
        names = {b['name'].lower() for b in m.bones}
        roots, _ = roots_of(m)
        if lk.anim in ROOT_MOVES and 'waist' not in names and roots == ['body']:
            idx.setdefault(lk.anim, []).append(lk.index)
    clips, animate = {}, []
    for anim, ks in sorted(idx.items()):
        clips[f'body_{anim}'] = loop({'body': root_move(anim, roll=0.5)})
        animate.append({f'body_{anim}': cond(ks)})
    return clips, animate


# what a hand holds that would sweep the ground if the arm swung with the gait (a claw, a knife, a book swing along)
STEADY = {'spear', 'pike', 'staff', 'scythe', 'scepter', 'greatsword', 'sword', 'battleaxe', 'hammer', 'shovel', 'pickaxe', 'club',
          'mace', 'axe', 'flail', 'towershield', 'shield', 'riotshield', 'lantern', 'wand', 'pitchfork', 'torch', 'cane', 'syringe'}
ARM_SWING = {'walk': 5, 'march': 22, 'run': 38, 'stomp': 12, 'golem': 18}     # each gait's arm swing (gaits() above)


def steady_anims(looks):
    """a hand holding a weapon, a staff or a shield swings a quarter of the gait's arm swing (a clip against it, for the
    looks that hold one), so a spear is carried instead of jabbed into the path"""
    from entities import cond
    idx = {}
    for lk in looks:
        if lk.anim not in ARM_SWING:
            continue
        m = lk.gear or lk.body
        par = {b['name']: (b.get('parent') or '').lower() for b in m.bones}
        for name, p in par.items():
            side = 'r' if p in ('rightarm', 'arm0') else 'l' if p in ('leftarm', 'arm1') else None
            if side and name.rsplit('_', 1)[0].lower() in STEADY:
                idx.setdefault((lk.anim, side), set()).add(lk.index)
    clips, animate = {}, []
    for (anim, side), ks in sorted(idx.items()):
        amp = round(ARM_SWING[anim] * 0.75, 2)
        # a zombie's arms reach ahead (-84): the hand with a weapon or a shield comes down so the thing hangs right
        low = {'r': '50', 'l': '60'}[side] if anim == 'walk' else None
        if anim == 'golem':
            bones = {'arm0': rot(ws(amp))} if side == 'r' else {'arm1': rot(ws(-amp))}
        else:
            bones = {'rightArm': rot(ws(amp, base=low))} if side == 'r' else {'leftArm': rot(ws(-amp, base=low))}
        clips[f'steady_{side}_{anim}'] = loop(bones)
        animate.append({f'steady_{side}_{anim}': cond(sorted(ks))})
    return clips, animate
