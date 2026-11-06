"""Client entity, render controllers and animations for a kind whose looks come from the roster (roster.py): one body and
one gear layer per look, chosen by tds:skin through render-controller arrays (geometry, texture AND material per skin),
the animation chosen by the skin's range (the roster keeps the looks of one animation together), the size from tds:size
(the script sets it per look: src/looks.ts). Bone names match case-insensitively, so one clip moves every humanoid rig.
"""
from __future__ import annotations

import json

SKIN = "q.property('tds:skin')"


def S(rate, amp, phase=0, base=None):
    shift = f' - {phase}' if phase > 0 else f' + {-phase}' if phase < 0 else ''
    e = f'math.sin(q.life_time * {rate}{shift}) * {amp}'
    return f'{base} + {e}' if base is not None else e


def loop(bones, **kw):
    return {'loop': True, 'bones': bones, **kw}


def limbs(rate, leg, arm, arm_base=0.0, legs=('rightLeg', 'leftLeg'), more_legs=True):
    """two legs and two arms swinging opposite (arms held at arm_base, -84 = straight ahead like a zombie)"""
    b = {legs[0]: {'rotation': [S(rate, leg), 0, 0]}, legs[1]: {'rotation': [S(rate, -leg), 0, 0]},
         'rightArm': {'rotation': [S(rate, -arm, 0, arm_base), 0, 0]}, 'leftArm': {'rotation': [S(rate, arm, 0, arm_base), 0, 0]}}
    if more_legs:                                                # the vindicator's legs are leg0 / leg1
        b['leg0'] = {'rotation': [S(rate, leg), 0, 0]}
        b['leg1'] = {'rotation': [S(rate, -leg), 0, 0]}
    return b


def bob(bone, rate, amp, base=0.0):
    return {bone: {'position': [0, f'{base} + math.abs(math.cos(q.life_time * {rate})) * {amp}', 0]}}


def head(rate=60, amp=8):
    return {'head': {'rotation': [S(rate * 3, 2, 40), S(rate, amp), 0]}}


def blaze_rods():
    """the twelve rods of a blaze body circle it in three rings (their geometry stacks them at one place)"""
    out = {}
    for i in range(12):
        ring, k = divmod(i, 4)
        r, y, rate = ((9.0, 2.0, -180), (7.0, -2.0, 140), (5.0, -6.5, -110))[ring]
        a = f'q.life_time * {rate} + {90 * k + 45 * ring}'
        out[f'upperBodyParts{i}'] = {'position': [f'math.cos({a}) * {r}', f'{y} + math.cos(q.life_time * 280 + {i * 30}) * 0.8', f'math.sin({a}) * {r}']}
    return out


ANIMS = {
    'walk': loop({**limbs(400, 28, 6, -84), **bob('waist', 400, 0.4), **head()}),
    'march': loop({**limbs(380, 26, 22, -6), **bob('waist', 380, 0.4), **head(50, 6)}),
    'run': loop({**limbs(760, 45, 40, -10), 'body': {'rotation': [10, 0, 0]}, **bob('waist', 760, 0.7), **head(80, 4)}),
    'stomp': loop({**limbs(200, 18, 12, -12), 'body': {'rotation': [0, 0, S(200, 3)]}, **bob('waist', 200, 0.5), **head(40, 8)}),
    'hover': loop({'rightLeg': {'rotation': [S(90, 4, 0, 12), 0, 0]}, 'leftLeg': {'rotation': [S(90, 4, 30, 16), 0, 0]},
                   'leg0': {'rotation': [S(90, 4, 0, 12), 0, 0]}, 'leg1': {'rotation': [S(90, 4, 30, 16), 0, 0]},
                   'rightArm': {'rotation': [S(120, 6, 0, -30), 0, 8]}, 'leftArm': {'rotation': [S(120, 6, 60, -30), 0, -8]},
                   'body': {'position': [0, S(110, 1.0, 0, 2.5), 0]}, 'waist': {'position': [0, S(110, 1.0, 0, 2.5), 0]}, **head(50, 10)}),
    'vex': loop({'body': {'position': [0, S(120, 0.8), 0], 'rotation': [S(90, 3), 0, 0]},
                 'leftWing': {'rotation': [0, S(1400, -25), 0]}, 'rightWing': {'rotation': [0, S(1400, 25), 0]},
                 'leftArm': {'rotation': [S(150, 10, 0, -30), 0, 0]}, 'rightArm': {'rotation': [S(150, 10, 60, -30), 0, 0]}, **head(70, 10)}),
    'phantom': loop({'wing0': {'rotation': [0, 0, S(540, -22)]}, 'wingtip0': {'rotation': [0, 0, S(540, -18, 70)]},
                     'wing1': {'rotation': [0, 0, S(540, 22)]}, 'wingtip1': {'rotation': [0, 0, S(540, 18, 70)]},
                     'body': {'position': [0, S(540, 0.6, -90), 0]}, 'tail': {'rotation': [S(270, 6), 0, 0]}, 'tailtip': {'rotation': [S(270, 9, 50), 0, 0]}}),
    'golem': loop({'arm0': {'rotation': [S(180, -18), 0, 0]}, 'arm1': {'rotation': [S(180, 18), 0, 0]},
                   'leg0': {'rotation': [S(180, 20), 0, 0]}, 'leg1': {'rotation': [S(180, -20), 0, 0]},
                   'body': {'rotation': [0, 0, S(180, 2.5)]}, 'head': {'rotation': [0, S(50, 8), S(180, 2.5)]}}),
    'beast': loop({'leg0': {'rotation': [S(300, 24), 0, 0]}, 'leg1': {'rotation': [S(300, -24), 0, 0]},
                   'leg2': {'rotation': [S(300, -24), 0, 0]}, 'leg3': {'rotation': [S(300, 24), 0, 0]},
                   'neck': {'rotation': [S(300, 3), 0, 0]}, 'headb': {'rotation': [S(300, 4), S(60, 10), 0]}, 'tailb': {'rotation': [0, S(400, 14), 0]}}),
    'mite': loop({'section_0': {'rotation': [0, S(900, 22), 0]}, 'section_1': {'rotation': [0, S(900, 12, 60), 0]}, 'section_3': {'rotation': [0, S(900, -20), 0]}}),
    'blob': loop({'insideCube': {'scale': [S(260, 0.08, 0, 1), S(260, -0.12, 0, 1), S(260, 0.08, 0, 1)],
                                 'position': [0, f'math.abs(math.sin(q.life_time * 130)) * 3', 0]}}),
    'stand': loop({'baseplate': {'position': [0, S(100, 0.6, 0, 1.0), 0]}, 'rightarm': {'rotation': [S(150, 6, 0, -40), 0, 10]},
                   'leftarm': {'rotation': [S(150, 6, 40, -20), 0, -10]}, 'body': {'rotation': [0, S(60, 6), 0]}}),
    'blaze': loop({**blaze_rods(), 'head': {'position': [0, S(150, 0.8), 0], 'rotation': [0, S(40, 12), 0]}}),
    'hop': loop({'root': {'position': [0, 'math.abs(math.sin(q.life_time * 260)) * 2.2', 0], 'scale': [S(520, 0.05, 0, 1), S(520, -0.06, 0, 1), S(520, 0.05, 0, 1)]},
                 'leg0': {'rotation': [S(520, 12), 0, 0]}, 'leg1': {'rotation': [S(520, -12), 0, 0]}, 'leg2': {'rotation': [S(520, -12), 0, 0]},
                 'leg3': {'rotation': [S(520, 12), 0, 0]}, 'lid': {'rotation': [f'-math.abs(math.sin(q.life_time * 260)) * 18', 0, 0]},
                 'petals': {'rotation': [0, 'q.life_time * 40', 0]}, 'head_s': {'rotation': [0, S(60, 10), 0]}}),
    'float': loop({'root': {'position': [0, S(110, 1.2, 0, 2.0), 0]}, 'spin': {'rotation': [0, 'q.life_time * 60', 0]}}),
}
# always on: the spinning, beating and fluttering parts some looks have (a bone a look lacks is not moved)
FX = loop({'halo': {'rotation': [0, 'q.life_time * 50', 0]}, 'aura': {'rotation': [0, 'q.life_time * 30', 0]},
           'orbit': {'rotation': [0, 'q.life_time * 90', 0], 'position': [0, S(120, 0.6), 0]},
           'wing_l': {'rotation': [0, S(500, 22, 0, 12), 0]}, 'wing_r': {'rotation': [0, S(500, -22, 0, -12), 0]},
           'cape': {'rotation': [S(160, 5, 0, 10), 0, S(230, 2)]}, 'scarf_tail': {'rotation': [S(400, 8, 0, 12), S(300, 10), 0]},
           'bandana_tail': {'rotation': [S(400, 8, 0, 8), S(300, 12), 0]}, 'plume': {'rotation': [S(200, 4), 0, 0]}})


def ranges(looks):
    """animation -> (first skin, end) over the roster's order"""
    out = {}
    for lk in looks:
        a, b = out.get(lk.anim, (lk.index, lk.index + 1))
        out[lk.anim] = (min(a, lk.index), max(b, lk.index + 1))
    for k, (a, b) in out.items():
        assert all(a <= lk.index < b for lk in looks if lk.anim == k) and b - a == sum(1 for lk in looks if lk.anim == k), f'{k}: looks not contiguous'
    return out


def entity(kind, looks, empty_geo, holo_tex, base_scale, extra_anims=None, extra_animate=None, extra=None):
    """the client entity and the two render controllers of one roster kind"""
    rng = ranges(looks)
    pre = f'tds_{kind}'
    anims = {k: f'animation.tds_look.{k}' for k in rng}
    anims['fx'] = 'animation.tds_look.fx'
    animate = [{k: f'{SKIN} >= {a} && {SKIN} < {b}'} for k, (a, b) in rng.items()] + ['fx']
    if extra_anims:
        anims.update(extra_anims)
    if extra_animate:
        animate += extra_animate
    d = {'identifier': f'tds:{kind}',
         'materials': {'default': 'entity_alphatest', 'blend': 'entity_alphablend', 'lit': 'entity_emissive_alpha_one_sided'},
         'textures': {**{f't{lk.index}': lk.body_tex for lk in looks}, **{f'o{lk.index}': (f'textures/entity/tds/{lk.gear.name}' if lk.gear else holo_tex) for lk in looks}},
         'geometry': {**{f'g{lk.index}': lk.body_geo for lk in looks}, **{f'o{lk.index}': (f'geometry.tds.{lk.gear.name}' if lk.gear else empty_geo) for lk in looks}},
         'scripts': {'scale': f"{base_scale} * q.property('tds:size')", 'animate': animate},
         'animations': anims,
         'render_controllers': [f'controller.render.{pre}', f'controller.render.{pre}_gear']}
    for k, v in (extra or {}).items():
        if k == 'scripts':
            d['scripts'].update(v)
        else:
            d[k] = v
    n = len(looks)

    def mat(lk, layer):
        if lk.hidden:
            return 'Material.blend'
        if layer == 'body':
            return 'Material.default' if lk.body is None else 'Material.lit'
        return 'Material.lit'
    body = {'arrays': {'textures': {'Array.skins': [f'Texture.t{i}' for i in range(n)]}, 'geometries': {'Array.geos': [f'Geometry.g{i}' for i in range(n)]},
                       'materials': {'Array.mats': [mat(lk, 'body') for lk in looks]}},
            'geometry': f'Array.geos[{SKIN}]', 'materials': [{'*': f'Array.mats[{SKIN}]'}], 'textures': [f'Array.skins[{SKIN}]'],
            'part_visibility': [{'*': True}, {'arms': False}]}
    gear = {'arrays': {'textures': {'Array.gear': [f'Texture.o{i}' for i in range(n)]}, 'geometries': {'Array.ogeo': [f'Geometry.o{i}' for i in range(n)]},
                       'materials': {'Array.omats': [mat(lk, 'gear') for lk in looks]}},
            'geometry': f'Array.ogeo[{SKIN}]', 'materials': [{'*': f'Array.omats[{SKIN}]'}], 'textures': [f'Array.gear[{SKIN}]']}
    client = {'format_version': '1.10.0', 'minecraft:client_entity': {'description': d}}
    return client, {f'controller.render.{pre}': body, f'controller.render.{pre}_gear': gear}


def animations():
    return {'format_version': '1.8.0', 'animations': {**{f'animation.tds_look.{k}': v for k, v in ANIMS.items()}, 'animation.tds_look.fx': FX}}


def looks_ts(tables):
    """src/looks.ts: the script's name -> [skin, size, ...] tables (generated); a table may add fields: (const, looks,
    (type, fn(look) -> value) ...)"""
    lines = ['// generated by tools/models/build.py from tools/models/roster.py: the resource pack\'s look of each entity, by name.',
             '// [tds:skin, tds:size, ...]: the client entity draws skin N with its body, gear and animation, at its base scale x size',
             '// (enemies 0.26, towers 0.36); TOWER_LOOK\'s third field is the shot it plays (animation.tds_tower.<it>; \'\' none).', '']
    for const, looks, *more in tables:
        types = ', '.join(['number', 'number'] + [t for t, _ in more])
        lines.append(f'export const {const}: Record<string, [{types}]> = {{')
        for lk in sorted(looks, key=lambda x: x.index):
            vals = [str(lk.index), str(round(lk.size, 3))] + [json.dumps(fn(lk)) for _, fn in more]
            lines.append(f'  {json.dumps(lk.name)}: [{", ".join(vals)}],')
        lines.append('};')
    return '\n'.join(lines) + '\n'
