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
    """math.sin(t * rate - phase) * amp, optionally after a constant"""
    shift = f' - {phase}' if phase > 0 else f' + {-phase}' if phase < 0 else ''
    e = f'math.sin(q.life_time * {rate}{shift}) * {amp}'
    return f'{base} + {e}' if base is not None else e


def legs(rate, amp, names=('leftLeg', 'rightLeg')):
    return {names[0]: {'rotation': [S(rate, amp), 0, 0]}, names[1]: {'rotation': [S(rate, -amp), 0, 0]}}


def arms(rate, amp, base=0, names=('leftArm', 'rightArm')):
    return {names[0]: {'rotation': [S(rate, -amp, 0, base), 0, 0]}, names[1]: {'rotation': [S(rate, amp, 0, base), 0, 0]}}


def bob(bone, rate, amp):
    return {bone: {'position': [0, f'math.abs(math.cos(q.life_time * {rate})) * {amp}', 0]}}


def look(rate=60, amp=8):
    return {'head': {'rotation': [S(rate * 3, 2, 40), S(rate, amp), 0]}}


# ------------------------------------------------------------------------------------------------ enemies (vanilla rigs)
ENEMY_ANIMS = {
    'animation.tds_enemy.walk': loop({**legs(400, 28), **arms(400, 6, -84), **bob('waist', 400, 0.4), **look(),
                                      'band_end': {'rotation': [0, 0, S(500, 10)]}}),                  # 0, 1: zombies, arms held out
    'animation.tds_enemy.boss': loop({**legs(200, 20), **arms(200, 18, -10), **bob('waist', 200, 0.5), **look(40, 10),
                                      'body': {'rotation': [0, 0, S(200, 4)]}, 'cape': {'rotation': [S(200, 6, 30, 8), 0, 0]}}),   # 2
    'animation.tds_enemy.run': loop({**legs(760, 45), **arms(760, 40), 'body': {'rotation': [12, 0, 0],
                                     'position': [0, f'math.abs(math.cos(q.life_time * 760)) * 0.8', 0]},
                                     'scarf': {'rotation': [0, S(900, 16), S(700, 6)]}}),              # 3: drowned rig, leaning in
    'animation.tds_enemy.float': loop({'body': {'position': [0, S(120, 0.8), 0], 'rotation': [S(90, 3), 0, 0]},
                                       'leftWing': {'rotation': [0, S(1400, -25), 0]}, 'rightWing': {'rotation': [0, S(1400, 25), 0]},
                                       'leftArm': {'rotation': [S(150, 10, 0, -30), 0, 0]}, 'rightArm': {'rotation': [S(150, 10, 60, -30), 0, 0]},
                                       **look(70, 10)}),                                                # 4: vex rig
    'animation.tds_enemy.fly': loop({'wing0': {'rotation': [0, 0, S(540, -22)]}, 'wingtip0': {'rotation': [0, 0, S(540, -18, 70)]},
                                     'wing1': {'rotation': [0, 0, S(540, 22)]}, 'wingtip1': {'rotation': [0, 0, S(540, 18, 70)]},
                                     'body': {'position': [0, S(540, 0.6, -90), 0]},
                                     'tail': {'rotation': [S(270, 6), 0, 0]}, 'tailtip': {'rotation': [S(270, 9, 50), 0, 0]}}),   # 5: phantom rig
    'animation.tds_enemy.heavy': loop({**legs(240, 20, ('leftleg', 'rightleg')), 'leftarm': {'rotation': [S(240, 3, 0, -42), 0, 0]},
                                       'rightarm': {'rotation': [S(240, 16), 0, 0]}, **bob('body', 240, 0.35), **look(40, 6)}),   # 6: piglin rig
    'animation.tds_enemy.frost': loop({**legs(260, 22), **arms(260, 10, -30), **bob('waist', 260, 0.35), **look(40, 8),
                                       'body': {'rotation': [8, 0, S(260, 3)]}}),                       # 7: stray, hunched
}
ENEMY_PICK = {'walk': (0, 1), 'boss': (2,), 'run': (3,), 'float': (4,), 'fly': (5,), 'heavy': (6,), 'frost': (7,)}

# ------------------------------------------------------------------------------------------------ towers
YAW = "q.property('tds:yaw') - q.body_y_rotation"
FIG_PILLAGER, FIG_WITCH = (0, 4, 6), (1,)                   # figure towers (vanilla bodies); the rest are our buildings / machines
FIGURES = FIG_PILLAGER + FIG_WITCH
POP = {'0.0': [0.6, 0.2, 0.6], '0.18': [1.1, 1.15, 1.1], '0.35': [1, 1, 1]}
LVL = {'0.0': [1, 1, 1], '0.12': [1.12, 0.9, 1.12], '0.25': [0.96, 1.1, 0.96], '0.4': [1, 1, 1]}
TOWER_ANIMS = {
    'animation.tds_tower.aim': loop({'turret': {'rotation': [0, YAW, 0]}, 'waist': {'rotation': [0, YAW, 0]}}),
    'animation.tds_tower.aim_body': loop({'body': {'rotation': [0, YAW, 0]}}),
    'animation.tds_tower.stand_waist': loop({'waist': {'position': [0, V.PED_TOP, 0]}}),           # the pillager onto its pedestal
    'animation.tds_tower.stand_body': loop({'body': {'position': [0, V.PED_TOP, 0]}}),             # the witch onto hers
    'animation.tds_tower.hold': loop({'rightarm': {'rotation': [-82, -14, 0]}, 'leftarm': {'rotation': [-80, 34, 0]}}),   # both hands on the rifle
    'animation.tds_tower.idle': loop({
        'head': {'rotation': [0, S(40, 6), 0]},
        'flag': {'rotation': [0, S(160, 12), S(230, 3)]},
        'spin': {'rotation': [0, 'q.life_time * 90', 0], 'position': [0, S(120, 0.4), 0]}}),
    'animation.tds_tower.fire': {'loop': False, 'animation_length': 0.2, 'bones': {
        'gun': {'position': {'0.0': [0, 0, 0], '0.05': [0, 0, 1.4], '0.2': [0, 0, 0]}},
        'barrel': {'rotation': {'0.0': [0, 0, 0], '0.06': [8, 0, 0], '0.2': [0, 0, 0]}},
        'rightarm': {'rotation': {'0.0': [0, 0, 0], '0.05': [-6, 0, 0], '0.2': [0, 0, 0]}}}},
    'animation.tds_tower.spawn': {'loop': False, 'animation_length': 1.2, 'bones': {
        'door': {'rotation': {'0.0': [0, 0, 0], '0.25': [-85, 0, 0], '0.9': [-85, 0, 0], '1.2': [0, 0, 0]}}}},
    'animation.tds_tower.place': {'loop': False, 'animation_length': 0.35, 'bones': {b: {'scale': POP} for b in ('root', 'tds_base', 'waist')}},
    'animation.tds_tower.place_body': {'loop': False, 'animation_length': 0.35, 'bones': {'body': {'scale': POP}}},
    'animation.tds_tower.levelup': {'loop': False, 'animation_length': 0.4, 'bones': {b: {'scale': LVL} for b in ('root', 'tds_base', 'waist')}},
    'animation.tds_tower.levelup_body': {'loop': False, 'animation_length': 0.4, 'bones': {'body': {'scale': LVL}}},
    'animation.tds_tower.smoke': {'loop': True, 'animation_length': 1.4,
                                  'particle_effects': {'0.0': {'effect': 'smoke', 'locator': 'smoke'}}},
}
TOWER_CONTROLLER = {'format_version': '1.10.0', 'animation_controllers': {
    'controller.animation.tds_tower.level': {
        'initial_state': 'default',
        'states': {
            'default': {'transitions': [{'pop': "q.property('tds:lvl') != v.lvl"}]},
            'pop': {'animations': ['levelup', {'levelup_body': skin_is(*FIG_WITCH)}], 'on_entry': ["v.lvl = q.property('tds:lvl');"],
                    'transitions': [{'default': 'q.all_animations_finished'}]}}}}}

# ------------------------------------------------------------------------------------------------ units
UNIT_ANIMS = {
    'animation.tds_unit.march': loop({**legs(500, 30), 'rightarm': {'rotation': [-70, -12, 0]}, 'leftarm': {'rotation': [-66, 30, 0]},
                                      **bob('waist', 500, 0.4), **look()}),          # the soldier, rifle at the ready (pillager rig)
    'animation.tds_unit.shamble': loop({**legs(420, 26), **arms(420, 6, -84), **bob('waist', 420, 0.4), **look()}),   # the skeleton
    'animation.tds_unit.wheels': loop({w: {'rotation': ['q.life_time * 540', 0, 0]} for w in ('wheel_fl', 'wheel_fr', 'wheel_bl', 'wheel_br')}),
    'animation.tds_unit.sweep': loop({'head': {'rotation': [0, S(80, 45), 0]}}),
    'animation.tds_unit.spin': loop({'head': {'rotation': [0, 'q.life_time * 90', 0]}}),
}


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


def outputs(rp, models):
    out = {}
    j = lambda *p: os.path.join(rp, *p)  # noqa: E731
    T = lambda n: f'textures/entity/tds/{n}'  # noqa: E731
    G = lambda n: f'geometry.tds.{n}'  # noqa: E731
    EMPTY = G('empty')

    # enemies: every class a vanilla body + our gear
    e_geo = [b[0] for b in V.ENEMY_BASE]
    e_tex = [b[1] for b in V.ENEMY_BASE]
    e_gear = [make().name for make in V.ENEMY_GEAR]
    out[j('entity', 'enemy.entity.json')] = dumps(entity(
        'tds:enemy', e_geo, [G(n) for n in e_gear], e_tex, [T(n) for n in e_gear],
        {'default': 'entity_alphatest', 'blend': 'entity_alphablend', 'gear': 'entity_emissive_alpha_one_sided'}, range(8),
        f"({pick((4,), 0.6, pick((5,), 0.3, 0.26))}) * q.property('tds:size')",
        {k: f'animation.tds_enemy.{k}' for k in ENEMY_PICK}, [{k: skin_is(*v)} for k, v in ENEMY_PICK.items()], 'enemy'))

    # towers: figures are vanilla bodies on our pedestal gear; buildings and machines are ours alone
    t_geo, t_tex, t_gear, t_gtex = [], [], [], []
    for i in range(8):
        if i in V.TOWER_FIGURE or i == 6:
            fig = V.TOWER_FIGURE.get(i, V.TOWER_FIGURE[0])
            t_geo.append(fig[0]); t_tex.append(HOLO if i == 6 else fig[1])
            g = V.TOWER_GEAR.get(i, V.TOWER_GEAR[0])().name
            t_gear.append(G(g)); t_gtex.append(T(g + ('_holo' if i == 6 else '')))
        else:
            n = {2: 'tower_farm', 3: 'tower_mortar', 5: 'tower_barracks', 7: 'tower_frost'}[i]
            t_geo.append(G(n)); t_tex.append(T(n)); t_gear.append(EMPTY); t_gtex.append(HOLO)     # (the gear controller skips these skins)
    tower_anims = {'aim': 'animation.tds_tower.aim', 'aim_body': 'animation.tds_tower.aim_body', 'stand_waist': 'animation.tds_tower.stand_waist',
                   'stand_body': 'animation.tds_tower.stand_body', 'hold': 'animation.tds_tower.hold', 'idle': 'animation.tds_tower.idle',
                   'place': 'animation.tds_tower.place', 'place_body': 'animation.tds_tower.place_body', 'levelup': 'animation.tds_tower.levelup',
                   'levelup_body': 'animation.tds_tower.levelup_body', 'level': 'controller.animation.tds_tower.level',
                   'smoke': 'animation.tds_tower.smoke', 'fire': 'animation.tds_tower.fire', 'spawn': 'animation.tds_tower.spawn'}
    out[j('entity', 'tower.entity.json')] = dumps(entity(
        'tds:tower', t_geo, t_gear, t_tex, t_gtex,
        {'default': 'entity_alphatest', 'lit': 'entity_emissive_alpha_one_sided', 'blend': 'entity_alphablend'}, FIGURES,
        pick(FIGURES, 0.36, 0.7), tower_anims,
        ['aim', {'aim_body': skin_is(*FIG_WITCH)}, 'stand_waist', {'stand_body': skin_is(*FIG_WITCH)}, {'hold': skin_is(*FIG_PILLAGER)},
         'idle', 'place', {'place_body': skin_is(*FIG_WITCH)}, 'level', {'smoke': skin_is(2)}], 'tower',
        extra={'particle_effects': {'smoke': 'minecraft:basic_smoke_particle'}, 'scripts': {'initialize': ['v.lvl = 0;']}}))
    out[j('entity', 'ghost.entity.json')] = dumps(entity(
        'tds:ghost', t_geo, t_gear, [], [], {'default': 'entity_alphatest', 'blend': 'entity_alphablend'}, FIGURES, pick(FIGURES, 0.36, 0.7),
        {'stand_waist': 'animation.tds_tower.stand_waist', 'stand_body': 'animation.tds_tower.stand_body', 'hold': 'animation.tds_tower.hold'},
        ['stand_waist', {'stand_body': skin_is(*FIG_WITCH)}, {'hold': skin_is(*FIG_PILLAGER)}], 'ghost',
        extra={'textures': {'ok': T('ghost_ok'), 'bad': T('ghost_bad')}}))

    # units: the soldier and the skeleton are vanilla bodies + gear; jeep, sentry and ice turret are ours
    U_FIG = (1, 3, 5, 6, 7)
    u_geo, u_tex, u_gear, u_gtex = [], [], [], []
    for i in range(8):
        k = 3 if i == 3 else 1 if i in U_FIG else None
        if k:
            fig = V.UNIT_FIGURE[k]
            u_geo.append(fig[0]); u_tex.append(fig[1])
            g = V.UNIT_GEAR[k]().name
            u_gear.append(G(g)); u_gtex.append(T(g))
        else:
            n = {0: 'unit_jeep', 2: 'unit_sentry', 4: 'unit_ice'}[i]
            u_geo.append(G(n)); u_tex.append(T(n)); u_gear.append(EMPTY); u_gtex.append(HOLO)
    out[j('entity', 'unit.entity.json')] = dumps(entity(
        'tds:unit', u_geo, u_gear, u_tex, u_gtex,
        {'default': 'entity_alphatest', 'lit': 'entity_emissive_alpha_one_sided'}, U_FIG,
        f"({pick(U_FIG, 0.2, 0.4)}) * q.property('tds:size')",
        {'march': 'animation.tds_unit.march', 'shamble': 'animation.tds_unit.shamble', 'wheels': 'animation.tds_unit.wheels',
         'sweep': 'animation.tds_unit.sweep', 'spin': 'animation.tds_unit.spin'},
        [{'march': skin_is(1, 5, 6, 7)}, {'shamble': skin_is(3)}, {'wheels': skin_is(0)}, {'sweep': skin_is(2)}, {'spin': skin_is(4)}], 'unit'))

    pips = [{f'pip{i}': f"q.property('tds:lvl') >= {i}"} for i in range(1, 8)]
    rcs = {}
    rcs.update(two_rc('enemy', range(8), (('default', 'blend'), f'{SK} == 4 ? 1 : 0'), (('gear', 'blend'), f'{SK} == 4 ? 1 : 0')))
    rcs.update(two_rc('tower', FIGURES, (('default', 'lit', 'blend'), f'{SK} == 6 ? 2 : ({skin_is(*FIGURES)}) ? 0 : 1'),
                      (('lit', 'blend'), f'{SK} == 6 ? 1 : 0'), parts=[{'*': True}, *pips]))
    rcs.update(two_rc('unit', U_FIG, (('default', 'lit'), f'({skin_is(*U_FIG)}) ? 0 : 1'), (('lit',), '0')))
    rcs.update(two_rc('ghost', FIGURES, (('blend',), '0'), (('blend',), '0'), parts=[{'*': True}, *[{f'pip{i}': False} for i in range(1, 8)]], tint=True))
    out[j('render_controllers', 'tds.render_controllers.json')] = dumps({'format_version': '1.8.0', 'render_controllers': rcs})
    for name, anims in (('tds_enemy', ENEMY_ANIMS), ('tds_tower', TOWER_ANIMS), ('tds_unit', UNIT_ANIMS)):
        out[j('animations', f'{name}.animation.json')] = dumps({'format_version': '1.8.0', 'animations': anims})
    out[j('animation_controllers', 'tds_tower.animation_controllers.json')] = dumps(TOWER_CONTROLLER)
    import io
    from PIL import Image
    buf = io.BytesIO(); Image.new('RGBA', (16, 16), (110, 236, 255, 120)).save(buf, format='PNG')
    out[j('textures', 'entity', 'tds', 'holo_tint.png')] = buf.getvalue()          # the hologram's body: one see-through tint
    out[j('models', 'entity', 'tds', 'empty.geo.json')] = dumps({'format_version': '1.16.0', 'minecraft:geometry': [{
        'description': {'identifier': EMPTY, 'texture_width': 16, 'texture_height': 16}, 'bones': [{'name': 'root', 'pivot': [0, 0, 0]}]}]})
    return out
