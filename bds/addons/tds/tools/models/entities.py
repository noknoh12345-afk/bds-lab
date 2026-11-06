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

import hq_mobs
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
EXACT = {'spin': {'rotation': [0, 'q.life_time * 90', 0], 'position': [0, S(120, 0.4), 0]}, 'lv2_spin': {'rotation': [0, 'q.life_time * 60', 0]},
         'lv4_spin': {'rotation': [0, 'q.life_time * 120', 0]}}
MOTION = {'spin': {'rotation': [0, 'q.life_time * 90', 0]}, 'spinx': {'rotation': ['q.life_time * 150', 0, 0]},
          'spinz': {'rotation': [0, 0, 'q.life_time * 400']}, 'rotor': {'rotation': [0, 'q.life_time * 900', 0]},
          'hover': {'position': [0, S(110, 0.6), 0]}, 'flag': {'rotation': [0, S(160, 12), S(230, 3)]},
          'beat': {'scale': ['1 + math.abs(math.sin(q.life_time * 240)) * 0.08'] * 3},
          'halo': {'rotation': [0, 'q.life_time * 50', 0]}, 'aura': {'rotation': [0, 'q.life_time * 30', 0]},
          'orbit': {'rotation': [0, 'q.life_time * 90', 0], 'position': [0, S(120, 0.6), 0]},
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


def tower_anims(looks):
    """animation.tds_tower.*: the stands, aims and poses by skin, the idle and the shots made from the bone names the
    looks use (a bone a look lacks is moved in none of its geometries)"""
    names = set()
    for lk in looks:
        names |= {b['name'] for b in (lk.gear or lk.body).bones}
    flashes = sorted(n for n in names if 'flash' in base_name(n))
    pulses = sorted(n for n in names if base_name(n) == 'pulse')
    idle = {'head': {'rotation': [0, S(40, 6), 0]}}
    for n in sorted(names):
        mo = motion(n)
        if mo and n != 'head':
            idle[n] = mo
    show = {f: {'position': {'0.0': [0, 1000, 0], '0.06': [0, 1000, 0], '0.07': [0, 0, 0]}} for f in flashes}
    A = {
        'animation.tds_tower.aim': loop({'turret': {'rotation': [0, YAW, 0]}}),                    # a building's turret
        'animation.tds_tower.aim_root': loop({'root': {'rotation': [0, YAW, 0]}}),                # a person turns whole
        'animation.tds_tower.stand_root': loop({'root': {'position': [0, V.PED_TOP, 0]}}),        # a person onto the pedestal
        **{f'animation.tds_tower.pose_{k}': loop({b: {'rotation': r} for b, r in v.items()}) for k, v in POSES.items()},
        'animation.tds_tower.idle': loop(idle),
        'animation.tds_tower.fire': {'loop': False, 'animation_length': 0.2, 'bones': {
            'gun': {'position': {'0.0': [0, 0, 0], '0.05': [0, 0, 1.4], '0.2': [0, 0, 0]}},
            'barrel': {'rotation': {'0.0': [0, 0, 0], '0.06': [8, 0, 0], '0.2': [0, 0, 0]}},
            'rightarm': {'rotation': {'0.0': [0, 0, 0], '0.05': [-6, 0, 0], '0.2': [0, 0, 0]}}, **show}},
        'animation.tds_tower.swing': {'loop': False, 'animation_length': 0.45, 'bones': {
            'rightarm': {'rotation': {'0.0': [0, 0, 0], '0.1': [-55, 0, 0], '0.24': [60, 0, 0], '0.45': [0, 0, 0]}},
            'leftarm': {'rotation': {'0.0': [0, 0, 0], '0.1': [-25, 0, 0], '0.24': [25, 0, 0], '0.45': [0, 0, 0]}}}},
        'animation.tds_tower.cast': {'loop': False, 'animation_length': 0.4, 'bones': {
            'rightarm': {'rotation': {'0.0': [0, 0, 0], '0.12': [-40, 0, 0], '0.4': [0, 0, 0]}},
            'leftarm': {'rotation': {'0.0': [0, 0, 0], '0.12': [-30, 0, 0], '0.4': [0, 0, 0]}}}},
        'animation.tds_tower.throw': {'loop': False, 'animation_length': 0.45, 'bones': {
            'rightarm': {'rotation': {'0.0': [0, 0, 0], '0.1': [-25, 0, 0], '0.22': [110, 0, 0], '0.45': [0, 0, 0]}}}},
        'animation.tds_tower.pulse': {'loop': False, 'animation_length': 0.35, 'bones': {
            **{p: {'scale': {'0.0': [1, 1, 1], '0.08': [1.3, 1.3, 1.3], '0.35': [1, 1, 1]}} for p in pulses}, **show}},
        'animation.tds_tower.spawn': {'loop': False, 'animation_length': 1.2, 'bones': {
            'door': {'rotation': {'0.0': [0, 0, 0], '0.25': [-85, 0, 0], '0.9': [-85, 0, 0], '1.2': [0, 0, 0]}}}},
        'animation.tds_tower.place': {'loop': False, 'animation_length': 0.35, 'bones': {b: {'scale': POP} for b in ('root', 'tds_base')}},
        'animation.tds_tower.levelup': {'loop': False, 'animation_length': 0.4, 'bones': {b: {'scale': LVL} for b in ('root', 'tds_base')}},
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
             'level': 'controller.animation.tds_tower.level', 'smoke': 'animation.tds_tower.smoke', 'fire': 'animation.tds_tower.fire',
             'swing': 'animation.tds_tower.swing', 'cast': 'animation.tds_tower.cast', 'throw': 'animation.tds_tower.throw',
             'pulse': 'animation.tds_tower.pulse', 'spawn': 'animation.tds_tower.spawn'}
    stand = [{'stand_root': cond(people)}, *[{f'pose_{k}': cond(v)} for k, v in poses.items() if v]]
    scale = "0.36 * q.property('tds:size')"
    tower = {'identifier': 'tds:tower', 'materials': {'default': 'entity_alphatest', 'lit': 'entity_emissive_alpha_one_sided', 'blend': 'entity_alphablend'},
             'textures': {**tex, 'holo': HOLO}, 'geometry': geo,
             'scripts': {'scale': scale, 'initialize': ['v.lvl = 0;'],
                         'animate': ['aim', {'aim_root': cond(people)}, *stand, 'idle', 'place', 'level', {'smoke': cond(smoke)}]},
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


# ------------------------------------------------------------------------------------------------ units
UNIT_ANIMS = {
    'animation.tds_unit.march': loop({**legs(500, 30), 'rightarm': {'rotation': [-70, -12, 0]}, 'leftarm': {'rotation': [-66, 30, 0]},
                                      **bob('waist', 500, 0.4), **look()}),          # the soldier, rifle at the ready (pillager rig)
    'animation.tds_unit.shamble': loop({**legs(420, 26), **arms(420, 6, -84), **bob('waist', 420, 0.4), **look()}),   # the skeleton
    'animation.tds_unit.wheels': loop({w: {'rotation': ['q.life_time * 540', 0, 0]} for w in ('wheel_fl', 'wheel_fr', 'wheel_bl', 'wheel_br')}),
    'animation.tds_unit.sweep': loop({'head': {'rotation': [0, S(80, 45), 0]}}),
    'animation.tds_unit.spin': loop({'head': {'rotation': [0, 'q.life_time * 90', 0]}}),
}


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
    rcs = {}
    client, rc = RE.entity('enemy', looks['enemy'], EMPTY, HOLO, 0.26)
    out[j('entity', 'enemy.entity.json')] = dumps(client)
    rcs.update(rc)

    # towers: one look per tower of the data (roster_towers.py): a figure on our pedestal, or a building of ours
    tower, ghost, rc, tanims, tcontrol = tower_outputs(looks['tower'], EMPTY, models, rp)
    out[j('entity', 'tower.entity.json')] = dumps(tower)
    out[j('entity', 'ghost.entity.json')] = dumps(ghost)
    rcs.update(rc)

    # units: the soldier and the skeleton are vanilla bodies + gear; jeep, sentry and ice turret are ours
    U_FIG = (1, 3, 5, 6, 7)
    u_geo, u_tex, u_gear, u_gtex = [], [], [], []
    for i in range(8):
        k = 3 if i == 3 else 1 if i in U_FIG else None
        if k:
            fig = V.UNIT_FIGURE[k]
            u_geo.append(fig[0]); u_tex.append(fig[1])
            g = hq_mobs.UNIT_GEAR[k]().name
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

    rcs.update(two_rc('unit', U_FIG, (('default', 'lit'), f'({skin_is(*U_FIG)}) ? 0 : 1'), (('lit',), '0')))
    out[j('render_controllers', 'tds.render_controllers.json')] = dumps({'format_version': '1.8.0', 'render_controllers': rcs})
    for name, anims in (('tds_tower', tanims), ('tds_unit', UNIT_ANIMS)):
        out[j('animations', f'{name}.animation.json')] = dumps({'format_version': '1.8.0', 'animations': anims})
    out[j('animations', 'tds_look.animation.json')] = dumps(RE.animations())
    out[j('animation_controllers', 'tds_tower.animation_controllers.json')] = dumps(tcontrol)
    import io
    from PIL import Image
    buf = io.BytesIO(); Image.new('RGBA', (16, 16), (110, 236, 255, 120)).save(buf, format='PNG')
    out[j('textures', 'entity', 'tds', 'holo_tint.png')] = buf.getvalue()          # the hologram's body: one see-through tint
    out[j('models', 'entity', 'tds', 'empty.geo.json')] = dumps({'format_version': '1.16.0', 'minecraft:geometry': [{
        'description': {'identifier': EMPTY, 'texture_width': 16, 'texture_height': 16}, 'bones': [{'name': 'root', 'pivot': [0, 0, 0]}]}]})
    return out
