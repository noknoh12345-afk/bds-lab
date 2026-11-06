#!/usr/bin/env python3
"""Writes the TDS pack's small fixed assets deterministically: the placement-ghost tints, particles, the hotbar slot items,
the behaviour entity definitions and the lang entries.

The models, their textures, client entities, render controllers and animations come from tools/models/build.py;
the pixel art (slot icons, particle sprites, pack icon, faces and emblems the models sample) from tools/art/art.py:

    python3 tools/art/art.py && python3 tools/models/build.py && python3 tools/gen_assets.py
"""
import json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RP, BP = os.path.join(ROOT, 'rp'), os.path.join(ROOT, 'bp')


def out(path, data):
    p = os.path.join(ROOT, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    if isinstance(data, Image.Image): data.save(p, optimize=True); return
    with open(p, 'w', encoding='utf-8', newline='\n') as f: json.dump(data, f, indent=1, ensure_ascii=False); f.write('\n')


# ---------------- the placement ghost: one flat see-through tint over any tower geometry ----------------
for k, rgb in (('ok', (80, 255, 120)), ('bad', (255, 70, 70))):
    out(f'rp/textures/entity/tds/ghost_{k}.png', Image.new('RGBA', (16, 16), rgb + (110,)))

# ---------------- particles (sprites: tools/art/art.py -> rp/textures/particle/tds_particles.png, 8x8 cells, white) ----------------
def particle(ident, cell, color, size, life, n=1, speed=0.0, gravity=0.0, spread=0.0, blend='particles_alpha'):
    c = {'minecraft:emitter_rate_instant': {'num_particles': n}, 'minecraft:emitter_lifetime_once': {'active_time': 0.05},
         'minecraft:emitter_shape_sphere' if spread else 'minecraft:emitter_shape_point': ({'radius': spread, 'direction': 'outwards'} if spread else {'offset': [0, 0, 0]}),
         'minecraft:particle_lifetime_expression': {'max_lifetime': life},
         'minecraft:particle_appearance_billboard': {'size': [size, size], 'facing_camera_mode': 'lookat_xyz', 'uv': {'texture_width': 32, 'texture_height': 32, 'uv': [cell[0] * 8, cell[1] * 8], 'uv_size': [8, 8]}},
         'minecraft:particle_appearance_tinting': {'color': list(color)}}
    if speed: c['minecraft:particle_initial_speed'] = speed
    if speed or gravity: c['minecraft:particle_motion_dynamic'] = {'linear_acceleration': [0, gravity, 0], 'linear_drag_coefficient': 2}
    return {'format_version': '1.10.0', 'particle_effect': {'description': {'identifier': ident, 'basic_render_parameters': {'material': blend, 'texture': 'textures/particle/tds_particles'}}, 'components': c}}

PARTICLES = {
    'ring_ok': particle('tds:ring_ok', (0, 0), (0.25, 0.92, 1.0, 1.0), 0.07, 0.25),
    'ring_bad': particle('tds:ring_bad', (0, 0), (1.0, 0.25, 0.25, 1.0), 0.07, 0.25),
    'ring_sel': particle('tds:ring_sel', (0, 0), (1.0, 0.86, 0.2, 1.0), 0.07, 0.25),
    'hit': particle('tds:hit', (1, 0), (1.0, 1.0, 1.0, 1.0), 0.08, 0.15, n=3, speed=1.5, spread=0.05),
    'boom': particle('tds:boom', (2, 0), (1.0, 0.6, 0.2, 0.9), 0.18, 0.4, n=6, speed=1.2, spread=0.1, blend='particles_blend'),
    'freeze': particle('tds:freeze', (3, 0), (0.75, 0.92, 1.0, 1.0), 0.09, 0.6, n=3, speed=0.4, gravity=-0.6, spread=0.15),
    'heal': particle('tds:heal', (0, 1), (0.35, 1.0, 0.45, 1.0), 0.1, 0.7, n=2, speed=0.3, gravity=0.8, spread=0.1),
}
for k, v in PARTICLES.items(): out(f'rp/particles/tds_{k}.particle.json', v)

# ---------------- items: hotbar tower slots 1-5 (icons: tools/art/art.py) ----------------
item_tex = {'tds_wand': {'textures': 'textures/items/wand'}}
for n in range(1, 6):
    item_tex[f'tds_slot_{n}'] = {'textures': f'textures/items/slot_{n}'}
    out(f'bp/items/slot_{n}.json', {'format_version': '1.21.90', 'minecraft:item': {'description': {'identifier': f'tds:slot_{n}', 'menu_category': {'category': 'items'}},
                                                                                   'components': {'minecraft:icon': f'tds_slot_{n}', 'minecraft:max_stack_size': 1}}})
out('rp/textures/item_texture.json', {'resource_pack_name': 'tds', 'texture_name': 'atlas.items', 'texture_data': item_tex})

# ---------------- behaviour definitions: small boxes, the ghost ----------------
def prop_int(hi, default=0): return {'type': 'int', 'range': [0, hi], 'default': default, 'client_sync': True}
SIZE = {'type': 'float', 'range': [0.25, 4.0], 'default': 1.0, 'client_sync': True}
LOOK_SIZE = {'type': 'float', 'range': [0.1, 8.0], 'default': 1.0, 'client_sync': True}   # a look's size (src/looks.ts) x the enemy's own
import sys; sys.path.insert(0, os.path.join(ROOT, 'tools', 'models'))
import roster  # noqa: E402
N_ENEMY = len(roster.looks('enemy'))
N_TOWER = len(roster.looks('tower'))
FLAG = {'type': 'bool', 'default': False, 'client_sync': True}
def base_components(family, box, hit):
    return {'minecraft:type_family': {'family': family}, 'minecraft:health': {'value': 1000000, 'max': 1000000},
            'minecraft:damage_sensor': {'triggers': [{'cause': 'all', 'deals_damage': 'no'}]}, 'minecraft:physics': {'has_gravity': False, 'has_collision': False},
            'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': False}, 'minecraft:knockback_resistance': {'value': 1},
            'minecraft:collision_box': {'width': box[0], 'height': box[1]}, 'minecraft:custom_hit_test': {'hitboxes': [{'width': hit[0], 'height': hit[1], 'pivot': [0, hit[1] / 2, 0]}]},
            'minecraft:fire_immune': True, 'minecraft:conditional_bandwidth_optimization': {}}
def entity(ident, props, comps): return {'format_version': '1.21.40', 'minecraft:entity': {'description': {'identifier': ident, 'is_spawnable': False, 'is_summonable': True, 'properties': props}, 'components': comps}}
NAME = {'minecraft:nameable': {'always_show': True, 'allow_name_tag_renaming': False}, 'minecraft:persistent': {}}
out('bp/entities/enemy.json', entity('tds:enemy', {'tds:skin': prop_int(N_ENEMY - 1), 'tds:size': LOOK_SIZE}, {**base_components(['enemy', 'tds'], (0.3, 0.45), (0.01, 0.01)), **NAME}))
out('bp/entities/unit.json', entity('tds:unit', {'tds:skin': prop_int(7), 'tds:size': SIZE}, {**base_components(['unit', 'tds'], (0.3, 0.4), (0.01, 0.01)), **NAME}))
tw = {**base_components(['tower', 'tds'], (0.3, 0.5), (0.8, 0.9)), **NAME,
      'minecraft:interact': {'interactions': [{'interact_text': 'action.interact.tds_manage', 'swing': True, 'on_interact': {'filters': {'test': 'is_family', 'subject': 'other', 'value': 'player'}}}]}}
# tds:yaw: the yaw (degrees, as a mob's) from the tower to its target; the client turns the turret bone to it
# tds:holo: a hologram copy of a tower (its look drawn see-through)
out('bp/entities/tower.json', entity('tds:tower', {'tds:skin': prop_int(N_TOWER - 1), 'tds:size': LOOK_SIZE, 'tds:lvl': prop_int(7), 'tds:yaw': prop_int(360),
                                                  'tds:holo': FLAG}, tw))
out('bp/entities/ghost.json', entity('tds:ghost', {'tds:skin': prop_int(N_TOWER - 1), 'tds:size': LOOK_SIZE, 'tds:ok': {'type': 'bool', 'default': True, 'client_sync': True}},
                                     base_components(['tds', 'tds_ghost'], (0.01, 0.01), (0.01, 0.01))))

# ---------------- names ----------------
LANG = {
    'en_US': {'entity.tds:enemy.name': 'Enemy', 'entity.tds:tower.name': 'Tower', 'entity.tds:unit.name': 'Unit', 'entity.tds:ghost.name': 'Placement Preview', 'item.tds:wand.name': 'Tower Placer',
              **{f'item.tds:slot_{n}.name': f'Tower Slot {n}' for n in range(1, 6)}, 'action.interact.tds_manage': 'Manage'},
    'ja_JP': {'entity.tds:enemy.name': '敵', 'entity.tds:tower.name': 'タワー', 'entity.tds:unit.name': 'ユニット', 'entity.tds:ghost.name': '設置プレビュー', 'item.tds:wand.name': 'タワー設置',
              **{f'item.tds:slot_{n}.name': f'タワー枠{n}' for n in range(1, 6)}, 'action.interact.tds_manage': '管理'},
}
for lang, kv in LANG.items():
    # other tools add their own keys (hud.mjs: the player's name): keep every line, update ours in place, append new ones
    p = os.path.join(RP, 'texts', f'{lang}.lang'); lines = []
    if os.path.exists(p): lines = [l.rstrip('\n') for l in open(p, encoding='utf-8') if l.strip()]
    keys = {l.split('=', 1)[0]: i for i, l in enumerate(lines) if '=' in l}
    for k, v in kv.items():
        if k in keys: lines[keys[k]] = f'{k}={v}'
        else: lines.append(f'{k}={v}')
    with open(p, 'w', encoding='utf-8', newline='\n') as f: f.write('\n'.join(lines) + '\n')
print('assets written')
