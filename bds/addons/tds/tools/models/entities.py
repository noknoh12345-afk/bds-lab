"""Client entities, render controllers, animations and the animation controller for the TDS models.

Contract with the behaviour pack and src/game.ts (unchanged): tds:skin picks the look (geometry + texture of the same
index), tds:size scales enemies and units, tds:lvl shows pip1..pip7, tds:ok tints the placement ghost. New:
tds:yaw (int 0..360) is the yaw a mob would have facing the tower's target; the turret bone turns to it.
Played from the script with Entity.playAnimation: animation.tds_tower.fire (each shot, throttled) and
animation.tds_tower.spawn (a unit leaves the barracks).

Rotations in Molang ADD to the bind pose (docs/01); +rz lowers the +x side, -rz raises it; +rx swings a hanging
limb back, -rx forward; ry = the mob yaw (degrees) relative to the body."""
from __future__ import annotations

import json
import os

from enemies import ENEMIES
from towers import TOWERS
from units import UNITS

SK = "q.property('tds:skin')"


def skin_is(*ks):
    return ' || '.join(f'{SK} == {k}' for k in ks)


def dumps(d):
    return (json.dumps(d, indent=1, ensure_ascii=False) + '\n').encode()


def names(group):
    return [make().name for make in group]


def client(ident, geos, texs, rc, scale, anims, animate, materials=None, extra=None):
    d = {'identifier': ident,
         'materials': materials or {'default': 'entity_emissive_alpha_one_sided', 'blend': 'entity_alphablend'},
         'textures': {f't{i}': t for i, t in enumerate(texs)} if isinstance(texs, list) else texs,
         'geometry': {f'g{i}': f'geometry.tds.{g}' for i, g in enumerate(geos)},
         'scripts': {'scale': scale}, 'render_controllers': [rc]}
    if anims:
        d['animations'] = anims
        d['scripts']['animate'] = animate
    if extra:
        for k, v in extra.items():
            if k == 'scripts':
                d['scripts'].update(v)
            else:
                d[k] = v
    return {'format_version': '1.10.0', 'minecraft:client_entity': {'description': d}}


def loop(bones, **kw):
    return {'loop': True, 'bones': bones, **kw}


def S(rate, amp, phase=0, base=None):
    """math.sin(t * rate - phase) * amp (degrees), optionally plus a constant"""
    shift = f' - {phase}' if phase > 0 else f' + {-phase}' if phase < 0 else ''
    e = f'math.sin(q.life_time * {rate}{shift}) * {amp}'
    return f'{base} + {e}' if base else e


def gait(rate, leg, arm, bob, sway=0, roll=0, head=3):
    """a walk cycle: legs opposite, arms against the legs, the body bobbing twice a stride, the head lagging"""
    b = {'leg_l': {'rotation': [S(rate, leg), 0, 0]}, 'leg_r': {'rotation': [S(rate, -leg), 0, 0]},
         'arm_l': {'rotation': [S(rate, -arm), 0, 0]}, 'arm_r': {'rotation': [S(rate, arm), 0, 0]},
         'body': {'position': [0, f'math.abs(math.cos(q.life_time * {rate})) * {bob}', 0],
                  'rotation': [0, S(rate, sway) if sway else 0, S(rate, roll) if roll else 0]},
         'head': {'rotation': [S(rate * 2, head, 40), S(rate / 2, head * 2), 0]}}
    return loop(b)


ENEMY_ANIMS = {
    'animation.tds_enemy.walk': gait(400, 28, 8, 0.45, sway=4, roll=3),            # 0 walker: arms held out, a shamble
    'animation.tds_enemy.heavy': gait(260, 22, 14, 0.35, roll=4),                  # 1, 6, 7: slow and heavy
    'animation.tds_enemy.boss': gait(200, 20, 16, 0.5, sway=3, roll=5, head=4),    # 2: stomping
    'animation.tds_enemy.run': loop({**gait(760, 42, 30, 0.6)['bones'],            # 3: running, the scarf flutters behind
                                     'scarf': {'rotation': [0, S(900, 14), S(700, 6)]}}),
    'animation.tds_enemy.float': loop({                                            # 4: hovering, no legs
        'body': {'position': [0, S(120, 0.8), 0], 'rotation': [S(90, 3), 0, 0]},
        'arm_l': {'rotation': [S(150, 8), 0, 0]}, 'arm_r': {'rotation': [S(150, 8, 60), 0, 0]},
        'head': {'rotation': [0, S(70, 10), 0]}}),
    'animation.tds_enemy.fly': loop({                                              # 5: the hand lags the arm by a phase (docs/08)
        'wing_l': {'rotation': [0, 0, S(720, -26)]}, 'wingtip_l': {'rotation': [0, 0, S(720, -22, 70)]},
        'wing_r': {'rotation': [0, 0, S(720, 26)]}, 'wingtip_r': {'rotation': [0, 0, S(720, 22, 70)]},
        'body': {'position': [0, S(720, 0.6, -90), 0]},
        'tail': {'rotation': [0, S(180, 12), 0]}, 'tail_tip': {'rotation': [0, S(180, 18, 50), 0]},
        'leg_l': {'rotation': [S(360, 8), 0, 0]}, 'leg_r': {'rotation': [S(360, 8, 40), 0, 0]}}),
}
ENEMY_PICK = {'walk': (0,), 'heavy': (1, 6, 7), 'boss': (2,), 'run': (3,), 'float': (4,), 'fly': (5,)}

TOWER_ANIMS = {
    'animation.tds_tower.aim': loop({'turret': {'rotation': [0, "q.property('tds:yaw') - q.body_y_rotation", 0]}}),
    'animation.tds_tower.idle': loop({
        'body': {'position': [0, S(90, 0.12), 0]},
        'head': {'rotation': [0, S(40, 6), 0]},
        'flag': {'rotation': [0, S(160, 12), S(230, 3)]},
        'spin': {'rotation': [0, 'q.life_time * 90', 0], 'position': [0, S(120, 0.4), 0]}}),
    'animation.tds_tower.fire': {'loop': False, 'animation_length': 0.2, 'bones': {
        'gun': {'position': {'0.0': [0, 0, 0], '0.05': [0, 0, 0.9], '0.2': [0, 0, 0]}},
        'barrel': {'rotation': {'0.0': [0, 0, 0], '0.06': [8, 0, 0], '0.2': [0, 0, 0]}},
        'body': {'rotation': {'0.0': [0, 0, 0], '0.05': [-3, 0, 0], '0.2': [0, 0, 0]}}}},
    'animation.tds_tower.spawn': {'loop': False, 'animation_length': 1.2, 'bones': {
        'door': {'rotation': {'0.0': [0, 0, 0], '0.25': [-85, 0, 0], '0.9': [-85, 0, 0], '1.2': [0, 0, 0]}}}},
    'animation.tds_tower.place': {'loop': False, 'animation_length': 0.35, 'bones': {
        'root': {'scale': {'0.0': [0.6, 0.2, 0.6], '0.18': [1.1, 1.15, 1.1], '0.35': [1, 1, 1]}}}},
    'animation.tds_tower.levelup': {'loop': False, 'animation_length': 0.4, 'bones': {
        'root': {'scale': {'0.0': [1, 1, 1], '0.12': [1.12, 0.9, 1.12], '0.25': [0.96, 1.1, 0.96], '0.4': [1, 1, 1]}}}},
    'animation.tds_tower.smoke': {'loop': True, 'animation_length': 1.4,
                                  'particle_effects': {'0.0': {'effect': 'smoke', 'locator': 'smoke'}}},
}
TOWER_CONTROLLER = {'format_version': '1.10.0', 'animation_controllers': {
    'controller.animation.tds_tower.level': {
        'initial_state': 'default',
        'states': {
            'default': {'transitions': [{'pop': "q.property('tds:lvl') != v.lvl"}]},
            'pop': {'animations': ['levelup'], 'on_entry': ["v.lvl = q.property('tds:lvl');"],
                    'transitions': [{'default': 'q.all_animations_finished'}]}}}}}

UNIT_ANIMS = {
    'animation.tds_unit.walk': gait(500, 30, 6, 0.3),
    'animation.tds_unit.wheels': loop({w: {'rotation': ['q.life_time * 540', 0, 0]} for w in ('wheel_fl', 'wheel_fr', 'wheel_bl', 'wheel_br')}),
    'animation.tds_unit.sweep': loop({'head': {'rotation': [0, S(80, 45), 0]}}),
    'animation.tds_unit.spin': loop({'head': {'rotation': [0, 'q.life_time * 90', 0]}}),
}


def arr(prefix, n=8):
    return [f'{prefix}{i}' for i in range(n)]


def outputs(rp, models):
    en, tw, un = names(ENEMIES), names(TOWERS), names(UNITS)
    t_tex = [f'textures/entity/tds/{n}' for n in tw]
    t_tex[6] = 'textures/entity/tds/tower_gunner_holo'
    u_tex = [f'textures/entity/tds/{n}' for n in un]
    u_tex[3] = 'textures/entity/tds/unit_soldier_skeleton'
    out = {}
    j = lambda *p: os.path.join(rp, *p)  # noqa: E731

    out[j('entity', 'enemy.entity.json')] = dumps(client(
        'tds:enemy', en, [f'textures/entity/tds/{n}' for n in en], 'controller.render.tds_enemy', "0.45 * q.property('tds:size')",
        {k: f'animation.tds_enemy.{k}' for k in ENEMY_PICK}, [{k: skin_is(*v)} for k, v in ENEMY_PICK.items()]))
    out[j('entity', 'tower.entity.json')] = dumps(client(
        'tds:tower', tw, t_tex, 'controller.render.tds_tower', '0.7',
        {'aim': 'animation.tds_tower.aim', 'idle': 'animation.tds_tower.idle', 'place': 'animation.tds_tower.place',
         'levelup': 'animation.tds_tower.levelup', 'level': 'controller.animation.tds_tower.level', 'smoke': 'animation.tds_tower.smoke',
         'fire': 'animation.tds_tower.fire', 'spawn': 'animation.tds_tower.spawn'},
        ['aim', 'idle', 'place', 'level', {'smoke': skin_is(2)}],
        extra={'particle_effects': {'smoke': 'minecraft:basic_smoke_particle'}, 'scripts': {'initialize': ['v.lvl = 0;']}}))
    out[j('entity', 'unit.entity.json')] = dumps(client(
        'tds:unit', un, u_tex, 'controller.render.tds_unit', "0.4 * q.property('tds:size')",
        {'walk': 'animation.tds_unit.walk', 'wheels': 'animation.tds_unit.wheels', 'sweep': 'animation.tds_unit.sweep', 'spin': 'animation.tds_unit.spin'},
        [{'walk': f'{skin_is(1, 3)} || {SK} > 4'}, {'wheels': skin_is(0)}, {'sweep': skin_is(2)}, {'spin': skin_is(4)}]))
    out[j('entity', 'ghost.entity.json')] = dumps(client(
        'tds:ghost', tw, {'ok': 'textures/entity/tds/ghost_ok', 'bad': 'textures/entity/tds/ghost_bad'}, 'controller.render.tds_ghost', '0.7',
        None, None, materials={'default': 'entity_alphatest', 'blend': 'entity_alphablend'}))

    pips = [{f'pip{i}': f"q.property('tds:lvl') >= {i}"} for i in range(1, 8)]
    out[j('render_controllers', 'tds.render_controllers.json')] = dumps({'format_version': '1.8.0', 'render_controllers': {
        'controller.render.tds_enemy': {
            'arrays': {'textures': {'Array.skins': arr('Texture.t')}, 'geometries': {'Array.geos': arr('Geometry.g')},
                       'materials': {'Array.mats': ['Material.default', 'Material.blend']}},
            'geometry': f'Array.geos[{SK}]', 'materials': [{'*': f'Array.mats[{SK} == 4 ? 1 : 0]'}], 'textures': [f'Array.skins[{SK}]']},
        'controller.render.tds_tower': {
            'arrays': {'textures': {'Array.skins': arr('Texture.t')}, 'geometries': {'Array.geos': arr('Geometry.g')},
                       'materials': {'Array.mats': ['Material.default', 'Material.blend']}},
            'geometry': f'Array.geos[{SK}]', 'materials': [{'*': f'Array.mats[{SK} == 6 ? 1 : 0]'}], 'textures': [f'Array.skins[{SK}]'],
            'part_visibility': [{'*': True}, *pips]},
        'controller.render.tds_unit': {
            'arrays': {'textures': {'Array.skins': arr('Texture.t')}, 'geometries': {'Array.geos': arr('Geometry.g')}},
            'geometry': f'Array.geos[{SK}]', 'materials': [{'*': 'Material.default'}], 'textures': [f'Array.skins[{SK}]'],
            'part_visibility': [{'*': True}, {'helmet': f'{SK} != 3'}]},
        'controller.render.tds_ghost': {
            'arrays': {'textures': {'Array.tints': ['Texture.bad', 'Texture.ok']}, 'geometries': {'Array.geos': arr('Geometry.g')}},
            'geometry': f'Array.geos[{SK}]', 'materials': [{'*': 'Material.blend'}], 'textures': ["Array.tints[q.property('tds:ok') ? 1 : 0]"],
            'part_visibility': [{'*': True}, *[{f'pip{i}': False} for i in range(1, 8)]]},
    }})
    for name, anims in (('tds_enemy', ENEMY_ANIMS), ('tds_tower', TOWER_ANIMS), ('tds_unit', UNIT_ANIMS)):
        out[j('animations', f'{name}.animation.json')] = dumps({'format_version': '1.8.0', 'animations': anims})
    out[j('animation_controllers', 'tds_tower.animation_controllers.json')] = dumps(TOWER_CONTROLLER)
    return out
