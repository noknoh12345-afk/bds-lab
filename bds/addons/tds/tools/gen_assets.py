#!/usr/bin/env python3
"""Writes every TDS resource asset deterministically: palette textures, low-poly geometry, client entities,
render controllers, animations, particles, item icons, the ghost/slot BP definitions and the lang entries.
The designs are original: flat-coloured boxes, role told apart by silhouette and palette.

Texture layout (all entity textures share it): 16x64, one row of 4x4 swatches per colour slot,
columns = tones (0 light/top, 1 mid/sides, 2 dark/bottom). Each face of a cube maps to one swatch."""
import json, os, struct, zlib
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RP, BP = os.path.join(ROOT, 'rp'), os.path.join(ROOT, 'bp')
SLOTS = ['skin', 'cloth', 'cloth2', 'metal', 'dark', 'accent', 'glow', 'wood', 'roof', 'eye', 'bone', 'ice', 'wheel', 'base', 'base2', 'gold']
SI = {n: i for i, n in enumerate(SLOTS)}
TW, TH = 16, 64

def out(path, data):
    p = os.path.join(ROOT, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    if isinstance(data, Image.Image): data.save(p, optimize=True); return
    with open(p, 'w', encoding='utf-8', newline='\n') as f: json.dump(data, f, indent=1, ensure_ascii=False); f.write('\n')

# ---------------- palettes ----------------
DEFAULT = dict(skin=(150, 170, 120), cloth=(90, 110, 150), cloth2=(70, 60, 50), metal=(160, 165, 175), dark=(40, 40, 48), accent=(200, 60, 60), glow=(240, 240, 250),
               wood=(160, 115, 70), roof=(185, 65, 55), eye=(255, 240, 120), bone=(230, 225, 210), ice=(170, 220, 255), wheel=(30, 30, 34), base=(110, 115, 125), base2=(140, 145, 155), gold=(245, 205, 60))
def pal(alpha=255, **kw): d = dict(DEFAULT); d.update(kw); return d, alpha
def flat(rgb, alpha): return {k: rgb for k in SLOTS}, alpha

ENEMY = [
    pal(),                                                                                                       # 0 normal
    pal(cloth=(110, 110, 120), metal=(125, 132, 145), accent=(80, 80, 92)),                                       # 1 lead: armour
    pal(skin=(150, 90, 90), cloth=(95, 22, 32), cloth2=(32, 26, 32), accent=(225, 45, 45), dark=(26, 20, 26), eye=(255, 205, 40)),  # 2 boss
    pal(skin=(150, 182, 140), cloth=(40, 172, 160), cloth2=(40, 60, 72), accent=(250, 200, 60)),                 # 3 fast: scarf
    pal(140, skin=(150, 140, 172), cloth=(82, 72, 112), cloth2=(62, 56, 82), eye=(205, 185, 255)),                # 4 hidden: see-through
    pal(skin=(172, 190, 212), cloth=(92, 142, 202), glow=(250, 250, 255), accent=(232, 232, 242)),                # 5 flying: wings
    pal(skin=(122, 152, 100), cloth=(62, 92, 52), cloth2=(62, 50, 40), metal=(192, 122, 52), accent=(212, 142, 62)),  # 6 heavy: pack
    pal(skin=(202, 226, 242), cloth=(122, 172, 212), cloth2=(92, 122, 162), ice=(192, 236, 255), eye=(92, 202, 255)),  # 7 frost
]
TOWER = [
    pal(metal=(70, 92, 142), accent=(92, 122, 192), dark=(36, 38, 48)),                                           # 0 offense
    pal(metal=(222, 226, 232), accent=(62, 172, 92), glow=(142, 255, 182), base2=(205, 210, 215)),                 # 1 support
    pal(wood=(172, 122, 72), roof=(192, 62, 52), dark=(62, 42, 30), accent=(232, 192, 62), base=(96, 142, 72), base2=(120, 165, 90)),  # 2 income
    pal(metal=(82, 82, 88), accent=(202, 112, 42), dark=(30, 30, 33)),                                           # 3 defense
    pal(wood=(142, 112, 82), base2=(122, 122, 112), metal=(112, 122, 92), dark=(40, 40, 40), accent=(62, 142, 202)),  # 4 cliff
    pal(cloth=(102, 122, 72), dark=(52, 56, 42), metal=(152, 156, 162), accent=(232, 182, 42), glow=(255, 82, 62)),  # 5 spawner
    flat((92, 232, 255), 120),                                                                                  # 6 hologram
    pal(ice=(152, 222, 255), glow=(232, 250, 255), base=(92, 102, 132), base2=(112, 122, 152)),                   # 7 freeze
]
UNIT = [
    pal(cloth=(92, 112, 72), metal=(132, 137, 142), dark=(36, 36, 40), glow=(152, 202, 255)),                     # 0 vehicle
    pal(skin=(222, 182, 142), cloth=(82, 112, 72), cloth2=(62, 72, 52), metal=(92, 102, 82), eye=(30, 30, 30)),   # 1 soldier
    pal(metal=(152, 152, 157), dark=(42, 42, 46), wood=(122, 92, 62), accent=(222, 172, 42)),                     # 2 sentry
    pal(skin=(232, 227, 212), cloth=(202, 197, 182), cloth2=(172, 167, 152), eye=(92, 42, 142)),                  # 3 skeleton
    pal(ice=(162, 226, 255), glow=(242, 252, 255), base=(102, 112, 142), base2=(122, 132, 162)),                  # 4 ice turret
]
GHOST = {'ok': flat((80, 255, 120), 110), 'bad': flat((255, 70, 70), 110)}

def tones(c):
    light = tuple(min(255, int(v + (255 - v) * 0.18)) for v in c)
    dark = tuple(int(v * 0.72) for v in c)
    return [light, c, dark]

def palette_png(p):
    colors, alpha = p
    im = Image.new('RGBA', (TW, TH), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for name, i in SI.items():
        for t, c in enumerate(tones(colors[name])):
            x, y = t * 4, i * 4
            edge = tuple(int(v * 0.62) for v in c)
            d.rectangle([x, y, x + 3, y + 3], fill=c + (alpha,))
            d.line([x, y + 3, x + 3, y + 3], fill=edge + (alpha,)); d.line([x + 3, y, x + 3, y + 3], fill=edge + (alpha,))   # outline-ish edge
    return im

for i, p in enumerate(ENEMY): out(f'rp/textures/entity/tds/enemy_{i}.png', palette_png(p))
for i, p in enumerate(TOWER): out(f'rp/textures/entity/tds/tower_{i}.png', palette_png(p))
for i, p in enumerate(UNIT): out(f'rp/textures/entity/tds/unit_{i}.png', palette_png(p))
for k, p in GHOST.items(): out(f'rp/textures/entity/tds/ghost_{k}.png', palette_png(p))

# ---------------- geometry ----------------
def cube(origin, size, slot, rot=None, pivot=None):
    i = SI[slot]; uv = {}
    for f in ('north', 'south', 'east', 'west', 'up', 'down'):
        t = 0 if f == 'up' else 2 if f == 'down' else 1
        uv[f] = {'uv': [t * 4, i * 4], 'uv_size': [4, 4]}
    c = {'origin': [round(v, 3) for v in origin], 'size': [round(v, 3) for v in size], 'uv': uv}
    if rot: c['rotation'] = rot; c['pivot'] = pivot or [origin[0] + size[0] / 2, origin[1], origin[2] + size[2] / 2]
    return c

def bone(name, pivot, cubes, parent=None, rot=None):
    b = {'name': name, 'pivot': pivot, 'cubes': cubes}
    if parent: b['parent'] = parent
    if rot: b['rotation'] = rot
    return b

def dezfight(bones):
    """push a face 0.03 outward when it lies on the same plane as an earlier, overlapping face (unrotated cubes)"""
    faces = []   # (axis, value, side, rect)
    for b in bones:
        for c in b['cubes']:
            if 'rotation' in c: continue
            for _ in range(4):
                moved = False
                o, z = c['origin'], c['size']
                for ax in range(3):
                    u, v = [a for a in range(3) if a != ax]
                    rect = (o[u], o[u] + z[u], o[v], o[v] + z[v])
                    for side, val in ((-1, o[ax]), (1, o[ax] + z[ax])):
                        for (a2, v2, s2, r2) in faces:
                            if a2 == ax and s2 == side and abs(v2 - val) < 0.02 and min(rect[1], r2[1]) - max(rect[0], r2[0]) > 0.01 and min(rect[3], r2[3]) - max(rect[2], r2[2]) > 0.01:
                                if side < 0: o[ax] = round(o[ax] - 0.03, 3)
                                z[ax] = round(z[ax] + 0.03, 3); moved = True; break
                        if moved: break
                    if moved: break
                if not moved: break
            o, z = c['origin'], c['size']
            for ax in range(3):
                u, v = [a for a in range(3) if a != ax]
                rect = (o[u], o[u] + z[u], o[v], o[v] + z[v])
                faces.append((ax, o[ax], -1, rect)); faces.append((ax, o[ax] + z[ax], 1, rect))
    return bones

def geo(ident, bones, w=2.5, h=2.5):
    dezfight(bones)
    return {'description': {'identifier': ident, 'texture_width': TW, 'texture_height': TH, 'visible_bounds_width': w, 'visible_bounds_height': h, 'visible_bounds_offset': [0, h / 2 - 0.25, 0]}, 'bones': bones}

def humanoid(extra=()):
    """a chunky little figure, 16 px tall, front = north (-Z)"""
    return [
        bone('root', [0, 0, 0], []),
        bone('leg_l', [-1.5, 5, 0], [cube([-2.5, 0, -1], [2, 5, 2], 'cloth2')], 'root'),
        bone('leg_r', [1.5, 5, 0], [cube([0.5, 0, -1], [2, 5, 2], 'cloth2')], 'root'),
        bone('body', [0, 5, 0], [cube([-3, 5, -1.5], [6, 5, 3], 'cloth')], 'root'),
        bone('arm_l', [-4, 10, 0], [cube([-5, 5.5, -1], [2, 4.5, 2], 'skin')], 'body'),
        bone('arm_r', [4, 10, 0], [cube([3, 5.5, -1], [2, 4.5, 2], 'skin')], 'body'),
        bone('head', [0, 10, 0], [cube([-3, 10, -3], [6, 6, 6], 'skin'), cube([-2, 12.6, -3.3], [1.2, 1.4, 0.4], 'eye'), cube([0.8, 12.6, -3.3], [1.2, 1.4, 0.4], 'eye')], 'body'),
        *extra,
    ]

ENEMY_GEO = geo('geometry.tds.enemy', humanoid([
    bone('armor', [0, 10, 0], [cube([-3.5, 14, -3.5], [7, 2.6, 7], 'metal'), cube([-3.4, 5.4, -2], [6.8, 4.2, 0.6], 'metal'), cube([-3.2, 13.2, -3.6], [6.4, 0.6, 0.4], 'dark')], 'head'),
    bone('spikes', [0, 10, 0], [cube([-3, 16, -1], [1.2, 3, 1.2], 'accent', [0, 0, 12]), cube([1.8, 16, -1], [1.2, 3, 1.2], 'accent', [0, 0, -12]),
                                cube([-6, 9.4, -1.8], [3, 1.6, 3.6], 'dark'), cube([3, 9.4, -1.8], [3, 1.6, 3.6], 'dark'), cube([-3, 3.5, 1.5], [6, 6.5, 0.5], 'accent')], 'body'),
    bone('hood', [0, 10, 0], [cube([-3.4, 12, -2.4], [6.8, 4.4, 5.8], 'cloth2'), cube([-3.4, 10.5, 1.4], [6.8, 1.6, 2], 'cloth2')], 'head'),
    bone('scarf', [0, 9, 0], [cube([-3.3, 9.1, -1.9], [6.6, 1.1, 3.8], 'accent'), cube([-1, 5.8, 1.5], [2, 3.4, 0.5], 'accent', [12, 0, 0], [0, 9, 1.7])], 'body'),
    bone('wings', [0, 9, 1.7], [], 'body'),
    bone('wing_l', [-2, 9, 1.7], [cube([-9, 7, 1.5], [7, 4, 0.5], 'glow'), cube([-7, 6, 1.5], [4, 1, 0.5], 'glow')], 'wings'),
    bone('wing_r', [2, 9, 1.7], [cube([2, 7, 1.5], [7, 4, 0.5], 'glow'), cube([3, 6, 1.5], [4, 1, 0.5], 'glow')], 'wings'),
    bone('pack', [0, 7, 0], [cube([-2.6, 5.4, 1.5], [5.2, 5, 2.6], 'metal'), cube([-6.2, 8.4, -2.15], [3.2, 2.6, 4.05], 'metal'), cube([3, 8.4, -2.15], [3.2, 2.6, 4.05], 'metal')], 'body'),
    bone('icicles', [0, 10, 0], [cube([-4.4, 10, -0.5], [1, 2.6, 1], 'ice', [0, 0, 18]), cube([3.4, 10, -0.5], [1, 2.6, 1], 'ice', [0, 0, -18]),
                                 cube([-0.6, 16, -0.6], [1.2, 2.4, 1.2], 'ice'), cube([-2.6, 16, 0.6], [1, 1.6, 1], 'ice', [0, 0, 15])], 'head'),
]), 2, 2.5)

def pips():
    return [bone(f'pip{i}', [0, 0, 0], [cube([-5.6 + (i - 1) * 1.6, 0.4, -7.5], [1.1, 1.1, 0.6], 'gold')]) for i in range(1, 8)]

def tower(ident, parts):
    return geo(ident, [bone('root', [0, 0, 0], [cube([-7, 0, -7], [14, 2, 14], 'base'), cube([-6, 2, -6], [12, 1, 12], 'base2')]), *parts, *pips()], 2.5, 2)

TOWERS = {
    0: tower('geometry.tds.tower_offense', [bone('turret', [0, 3, 0], [cube([-4, 3, -4], [8, 5, 8], 'metal'), cube([-3, 8, -3], [6, 3.6, 6], 'accent'),
                                                                     cube([-0.75, 9, -10], [1.5, 1.5, 7], 'dark'), cube([-1.1, 8.65, -10.6], [2.2, 2.2, 1], 'dark'), cube([-2, 11.6, -1], [4, 0.6, 2], 'gold')])]),
    1: tower('geometry.tds.tower_support', [bone('mast', [0, 3, 0], [cube([-1, 3, -1], [2, 9, 2], 'metal'), cube([-4, 10, -2], [8, 3.5, 1], 'base2', [-15, 0, 0], [0, 10, -1.5]),
                                                                  cube([-0.75, 12, -0.75], [1.5, 3, 1.5], 'glow'), cube([-5, 3, -3], [3, 3, 6], 'accent'), cube([2, 3, -3], [3, 3, 6], 'accent')])]),
    2: tower('geometry.tds.tower_income', [bone('hut', [0, 3, 0], [cube([-5, 3, -4], [10, 6, 8], 'wood'), cube([-6, 9, -5], [12, 2, 10], 'roof'), cube([-4, 11, -4], [8, 1.8, 8], 'roof'),
                                                                 cube([-1.5, 3, -4.3], [3, 4, 0.4], 'dark'), cube([-6.6, 3, 2.4], [3, 3, 3], 'accent'), cube([2, 11, 1], [2, 3, 2], 'dark'), cube([-3.8, 6, -4.3], [2, 1.6, 0.4], 'glow')])]),
    3: tower('geometry.tds.tower_defense', [bone('turret', [0, 3, 0], [cube([-5, 3, -5], [10, 4, 10], 'metal'), cube([-4, 7, -4], [8, 3, 8], 'accent'),
                                                                     cube([-2, 7.5, -11], [4, 4, 7], 'dark'), cube([-2.5, 7, -11.6], [5, 5, 1], 'dark'), cube([-5.4, 4, -5.4], [10.8, 0.8, 10.8], 'dark')])]),
    4: tower('geometry.tds.tower_cliff', [bone('legs', [0, 3, 0], [cube([-5, 3, -1], [1.5, 8, 1.5], 'wood', [0, 0, -8], [-4.25, 3, -0.25]), cube([3.5, 3, -1], [1.5, 8, 1.5], 'wood', [0, 0, 8], [4.25, 3, -0.25]),
                                                                cube([-0.75, 3, 3.5], [1.5, 8, 1.5], 'wood', [8, 0, 0], [0, 3, 4.25]), cube([-4, 11, -4], [8, 1.5, 8], 'base2')]),
                                          bone('turret', [0, 12.5, 0], [cube([-1.5, 12.5, -3], [3, 3, 8], 'metal'), cube([-0.6, 13.4, -11], [1.2, 1.2, 8], 'dark'), cube([-0.8, 15.5, -2], [1.6, 1.6, 4], 'accent')], 'legs')]),
    5: tower('geometry.tds.tower_spawner', [bone('garage', [0, 3, 0], [cube([-6, 3, -5], [12, 8, 10], 'cloth'), cube([-6.5, 11, -5.5], [13, 1.5, 11], 'dark'), cube([-4, 3, -5.3], [8, 6, 0.4], 'metal'),
                                                                      cube([-4, 7.6, -5.5], [8, 0.6, 0.3], 'accent'), cube([-0.5, 9.6, -5.6], [1, 1, 0.4], 'glow'), cube([4.5, 12.5, 3.5], [0.6, 4, 0.6], 'metal'), cube([5.1, 14.6, 3.5], [2.6, 1.6, 0.3], 'accent')])]),
    7: tower('geometry.tds.tower_freeze', [bone('crystal', [0, 3, 0], [cube([-2, 3, -2], [4, 10, 4], 'ice'), cube([-5, 3, -1], [2, 6, 2], 'ice', [0, 0, 15], [-4, 3, 0]),
                                                                     cube([3, 3, -1], [2, 6, 2], 'ice', [0, 0, -15], [4, 3, 0]), cube([-1, 3, 3], [2, 7, 2], 'ice', [15, 0, 0], [0, 3, 4]), cube([-1, 13, -1], [2, 3, 2], 'glow')])]),
}
TOWER_IDS = {k: v['description']['identifier'] for k, v in TOWERS.items()}
TOWER_GEOS = [TOWER_IDS[k] for k in (0, 1, 2, 3, 4, 5, 0, 7)]   # 6 = hologram uses the offense shape

UNITS = {
    'vehicle': geo('geometry.tds.unit_vehicle', [bone('root', [0, 0, 0], [cube([-4, 1.5, -7], [8, 3, 14], 'cloth'), cube([-3.5, 4.5, -7], [7, 3.5, 5], 'cloth'), cube([-3, 6, -7.3], [6, 1.8, 0.4], 'glow'),
                                                                      cube([-5, 0, -5.5], [1.5, 3, 3], 'wheel'), cube([3.5, 0, -5.5], [1.5, 3, 3], 'wheel'), cube([-5, 0, 2.5], [1.5, 3, 3], 'wheel'), cube([3.5, 0, 2.5], [1.5, 3, 3], 'wheel')]),
                                                bone('head', [0, 4.5, 1.5], [cube([-1.5, 4.5, 0], [3, 2.5, 3], 'metal'), cube([-0.5, 5.5, -3], [1, 1, 4], 'dark')], 'root')], 2, 1.5),
    'humanoid': geo('geometry.tds.unit_humanoid', humanoid([bone('helmet', [0, 10, 0], [cube([-3.5, 14.2, -3.5], [7, 2.4, 7], 'metal'), cube([-3.6, 14, -3.8], [7.2, 0.6, 1], 'metal')], 'head')]), 2, 2.5),
    'sentry': geo('geometry.tds.unit_sentry', [bone('root', [0, 0, 0], [cube([-4, 0, -0.6], [1.2, 6, 1.2], 'wood', [0, 0, -15], [-3.4, 0, 0]), cube([2.8, 0, -0.6], [1.2, 6, 1.2], 'wood', [0, 0, 15], [3.4, 0, 0]),
                                                                    cube([-0.6, 0, 2.4], [1.2, 6, 1.2], 'wood', [15, 0, 0], [0, 0, 3])]),
                                              bone('head', [0, 6, 0], [cube([-2, 6, -2.5], [4, 3, 5], 'metal'), cube([-0.6, 6.9, -7], [1.2, 1.2, 4.5], 'dark'), cube([-1.5, 9, -1], [3, 0.6, 2], 'accent')], 'root')], 2, 1.5),
    'ice': geo('geometry.tds.unit_ice', [bone('root', [0, 0, 0], [cube([-4, 0, -4], [8, 1.5, 8], 'base')]),
                                         bone('head', [0, 1.5, 0], [cube([-1.5, 1.5, -1.5], [3, 8, 3], 'ice'), cube([-3.5, 1.5, -0.8], [1.6, 5, 1.6], 'ice', [0, 0, 18], [-2.7, 1.5, 0]),
                                                                    cube([1.9, 1.5, -0.8], [1.6, 5, 1.6], 'ice', [0, 0, -18], [2.7, 1.5, 0]), cube([-0.8, 9.5, -0.8], [1.6, 2.2, 1.6], 'glow')], 'root')], 2, 1.5),
}
UNIT_GEOS = [UNITS[k]['description']['identifier'] for k in ('vehicle', 'humanoid', 'sentry', 'humanoid', 'ice', 'humanoid', 'humanoid', 'humanoid')]

out('rp/models/entity/tds_enemy.geo.json', {'format_version': '1.12.0', 'minecraft:geometry': [ENEMY_GEO]})
out('rp/models/entity/tds_towers.geo.json', {'format_version': '1.12.0', 'minecraft:geometry': list(TOWERS.values())})
out('rp/models/entity/tds_units.geo.json', {'format_version': '1.12.0', 'minecraft:geometry': list(UNITS.values())})

# ---------------- client entities, render controllers, animations ----------------
SK = "query.property('tds:skin')"
def client(ident, geos, textures, rc, scale, animations=None, animate=None, blend=True):
    d = {'identifier': ident, 'materials': {'default': 'entity_alphatest', **({'blend': 'entity_alphablend'} if blend else {})},
         'textures': textures, 'geometry': geos, 'scripts': {'scale': scale}, 'render_controllers': [rc]}
    if animations: d['animations'] = animations; d['scripts']['animate'] = animate
    return {'format_version': '1.10.0', 'minecraft:client_entity': {'description': d}}

out('rp/entity/enemy.entity.json', client('tds:enemy', {'default': 'geometry.tds.enemy'}, {f't{i}': f'textures/entity/tds/enemy_{i}' for i in range(8)}, 'controller.render.tds_enemy',
                                          "0.45 * query.property('tds:size')", {'walk': 'animation.tds.walk', 'fly': 'animation.tds.fly'}, ['walk', {'fly': f'{SK} == 5'}]))
out('rp/entity/tower.entity.json', client('tds:tower', {f'g{i}': g for i, g in enumerate(TOWER_GEOS)}, {f't{i}': f'textures/entity/tds/tower_{i}' for i in range(8)}, 'controller.render.tds_tower',
                                          '0.7', {'sweep': 'animation.tds.sweep'}, [{'sweep': f'{SK} == 0 || {SK} == 3 || {SK} == 4 || {SK} == 6'}]))
out('rp/entity/unit.entity.json', client('tds:unit', {f'g{i}': g for i, g in enumerate(UNIT_GEOS)}, {f't{i}': f'textures/entity/tds/unit_{min(i, 4) if i < 5 else 1}' for i in range(8)}, 'controller.render.tds_unit',
                                         "0.4 * query.property('tds:size')", {'walk': 'animation.tds.walk', 'spin': 'animation.tds.spin'}, [{'walk': f'{SK} == 1 || {SK} == 3 || {SK} > 4'}, {'spin': f'{SK} == 2 || {SK} == 4'}], blend=False))
out('rp/entity/ghost.entity.json', client('tds:ghost', {f'g{i}': g for i, g in enumerate(TOWER_GEOS)}, {'ok': 'textures/entity/tds/ghost_ok', 'bad': 'textures/entity/tds/ghost_bad'}, 'controller.render.tds_ghost', '0.7'))

def arr(prefix, n): return [f'{prefix}{i}' for i in range(n)]
PIPS = [{f'pip{i}': f"query.property('tds:lvl') >= {i}"} for i in range(1, 8)]
out('rp/render_controllers/tds.render_controllers.json', {'format_version': '1.8.0', 'render_controllers': {
    'controller.render.tds_enemy': {
        'arrays': {'textures': {'Array.skins': arr('Texture.t', 8)}, 'materials': {'Array.mats': ['Material.default', 'Material.blend']}},
        'geometry': 'Geometry.default', 'materials': [{'*': f'Array.mats[{SK} == 4 ? 1 : 0]'}], 'textures': [f'Array.skins[{SK}]'],
        'part_visibility': [{'*': True}, {'armor': f'{SK} == 1'}, {'spikes': f'{SK} == 2'}, {'scarf': f'{SK} == 3'}, {'hood': f'{SK} == 4'}, {'wings': f'{SK} == 5'}, {'pack': f'{SK} == 6'}, {'icicles': f'{SK} == 7'}]},
    'controller.render.tds_tower': {
        'arrays': {'textures': {'Array.skins': arr('Texture.t', 8)}, 'geometries': {'Array.geos': arr('Geometry.g', 8)}, 'materials': {'Array.mats': ['Material.default', 'Material.blend']}},
        'geometry': f'Array.geos[{SK}]', 'materials': [{'*': f'Array.mats[{SK} == 6 ? 1 : 0]'}], 'textures': [f'Array.skins[{SK}]'], 'part_visibility': [{'*': True}, *PIPS]},
    'controller.render.tds_unit': {
        'arrays': {'textures': {'Array.skins': arr('Texture.t', 8)}, 'geometries': {'Array.geos': arr('Geometry.g', 8)}},
        'geometry': f'Array.geos[{SK}]', 'materials': [{'*': 'Material.default'}], 'textures': [f'Array.skins[{SK}]'], 'part_visibility': [{'*': True}, {'helmet': f'{SK} == 1'}]},
    'controller.render.tds_ghost': {
        'arrays': {'textures': {'Array.tints': ['Texture.bad', 'Texture.ok']}, 'geometries': {'Array.geos': arr('Geometry.g', 8)}},
        'geometry': f'Array.geos[{SK}]', 'materials': [{'*': 'Material.blend'}], 'textures': ["Array.tints[query.property('tds:ok') ? 1 : 0]"],
        'part_visibility': [{'*': True}, *[{f'pip{i}': False} for i in range(1, 8)]]},
}})

W = 'query.life_time * 720'
out('rp/animations/tds.animation.json', {'format_version': '1.8.0', 'animations': {
    'animation.tds.walk': {'loop': True, 'bones': {'leg_l': {'rotation': [f'math.sin({W}) * 35', 0, 0]}, 'leg_r': {'rotation': [f'-math.sin({W}) * 35', 0, 0]},
                                                  'arm_l': {'rotation': [f'-math.sin({W}) * 30', 0, 0]}, 'arm_r': {'rotation': [f'math.sin({W}) * 30', 0, 0]}, 'body': {'position': [0, f'math.abs(math.sin({W})) * 0.4', 0]}}},
    'animation.tds.fly': {'loop': True, 'bones': {'wing_l': {'rotation': [0, 'math.sin(query.life_time * 1080) * 30', 0]}, 'wing_r': {'rotation': [0, '-math.sin(query.life_time * 1080) * 30', 0]}}},
    'animation.tds.sweep': {'loop': True, 'bones': {'turret': {'rotation': [0, 'math.sin(query.life_time * 45) * 25', 0]}}},
    'animation.tds.spin': {'loop': True, 'bones': {'head': {'rotation': [0, 'query.life_time * 90', 0]}}},
}})

# ---------------- particles ----------------
pt = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); d = ImageDraw.Draw(pt)
d.ellipse([1, 1, 6, 6], fill=(255, 255, 255, 255))                                                   # dot (0,0)
d.polygon([(12, 0), (13, 3), (16, 4), (13, 5), (12, 8), (11, 5), (8, 4), (11, 3)], fill=(255, 255, 255, 255))   # spark (8,0)
for r, a in ((4, 90), (3, 160), (2, 255)): d.ellipse([20 - r, 4 - r, 20 + r - 1, 4 + r - 1], fill=(255, 255, 255, a))   # puff (16,0)
d.line([24, 4, 31, 4], fill=(255, 255, 255, 255)); d.line([28, 0, 28, 7], fill=(255, 255, 255, 255)); d.line([25, 1, 31, 7], fill=(255, 255, 255, 200)); d.line([25, 7, 31, 1], fill=(255, 255, 255, 200))   # flake (24,0)
d.rectangle([3, 9, 4, 14], fill=(255, 255, 255, 255)); d.rectangle([1, 11, 6, 12], fill=(255, 255, 255, 255))   # plus (0,8)
out('rp/textures/particle/tds_particles.png', pt)

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

# ---------------- items: hotbar tower slots 1-5 ----------------
DIG = {1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111']}
SLOT_COL = {1: (70, 120, 200), 2: (60, 160, 90), 3: (200, 150, 50), 4: (190, 70, 70), 5: (140, 90, 190)}
item_tex = {'tds_wand': {'textures': 'textures/items/wand'}}
for n in range(1, 6):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = SLOT_COL[n]
    d.rounded_rectangle([1, 1, 14, 14], radius=3, fill=c + (255,), outline=tuple(int(v * 0.5) for v in c) + (255,))
    d.line([3, 3, 12, 3], fill=tuple(min(255, v + 60) for v in c) + (255,))
    for y, rowbits in enumerate(DIG[n]):
        for x, b in enumerate(rowbits):
            if b == '1': d.rectangle([5 + x * 2, 3 + y * 2, 6 + x * 2, 4 + y * 2], fill=(255, 255, 255, 255))
    out(f'rp/textures/items/slot_{n}.png', im)
    item_tex[f'tds_slot_{n}'] = {'textures': f'textures/items/slot_{n}'}
    out(f'bp/items/slot_{n}.json', {'format_version': '1.21.90', 'minecraft:item': {'description': {'identifier': f'tds:slot_{n}', 'menu_category': {'category': 'items'}},
                                                                                   'components': {'minecraft:icon': f'tds_slot_{n}', 'minecraft:max_stack_size': 1}}})
out('rp/textures/item_texture.json', {'resource_pack_name': 'tds', 'texture_name': 'atlas.items', 'texture_data': item_tex})

# ---------------- behaviour definitions: small boxes, the ghost ----------------
def prop_int(hi, default=0): return {'type': 'int', 'range': [0, hi], 'default': default, 'client_sync': True}
SIZE = {'type': 'float', 'range': [0.25, 4.0], 'default': 1.0, 'client_sync': True}
def base_components(family, box, hit):
    return {'minecraft:type_family': {'family': family}, 'minecraft:health': {'value': 1000000, 'max': 1000000},
            'minecraft:damage_sensor': {'triggers': [{'cause': 'all', 'deals_damage': 'no'}]}, 'minecraft:physics': {'has_gravity': False, 'has_collision': False},
            'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': False}, 'minecraft:knockback_resistance': {'value': 1},
            'minecraft:collision_box': {'width': box[0], 'height': box[1]}, 'minecraft:custom_hit_test': {'hitboxes': [{'width': hit[0], 'height': hit[1], 'pivot': [0, hit[1] / 2, 0]}]},
            'minecraft:fire_immune': True, 'minecraft:conditional_bandwidth_optimization': {}}
def entity(ident, props, comps): return {'format_version': '1.21.40', 'minecraft:entity': {'description': {'identifier': ident, 'is_spawnable': False, 'is_summonable': True, 'properties': props}, 'components': comps}}
NAME = {'minecraft:nameable': {'always_show': True, 'allow_name_tag_renaming': False}, 'minecraft:persistent': {}}
out('bp/entities/enemy.json', entity('tds:enemy', {'tds:skin': prop_int(7), 'tds:size': SIZE}, {**base_components(['enemy', 'tds'], (0.3, 0.45), (0.01, 0.01)), **NAME}))
out('bp/entities/unit.json', entity('tds:unit', {'tds:skin': prop_int(7), 'tds:size': SIZE}, {**base_components(['unit', 'tds'], (0.3, 0.4), (0.01, 0.01)), **NAME}))
tw = {**base_components(['tower', 'tds'], (0.3, 0.5), (0.8, 0.9)), **NAME,
      'minecraft:interact': {'interactions': [{'interact_text': 'action.interact.tds_manage', 'swing': True, 'on_interact': {'filters': {'test': 'is_family', 'subject': 'other', 'value': 'player'}}}]}}
out('bp/entities/tower.json', entity('tds:tower', {'tds:skin': prop_int(7), 'tds:size': SIZE, 'tds:lvl': prop_int(7)}, tw))
out('bp/entities/ghost.json', entity('tds:ghost', {'tds:skin': prop_int(7), 'tds:ok': {'type': 'bool', 'default': True, 'client_sync': True}},
                                     base_components(['tds', 'tds_ghost'], (0.01, 0.01), (0.01, 0.01))))

# ---------------- names ----------------
LANG = {
    'en_US': {'entity.tds:enemy.name': 'Enemy', 'entity.tds:tower.name': 'Tower', 'entity.tds:unit.name': 'Unit', 'entity.tds:ghost.name': 'Placement Preview', 'item.tds:wand.name': 'Tower Placer',
              **{f'item.tds:slot_{n}.name': f'Tower Slot {n}' for n in range(1, 6)}, 'action.interact.tds_manage': 'Manage'},
    'ja_JP': {'entity.tds:enemy.name': '敵', 'entity.tds:tower.name': 'タワー', 'entity.tds:unit.name': 'ユニット', 'entity.tds:ghost.name': '設置プレビュー', 'item.tds:wand.name': 'タワー設置',
              **{f'item.tds:slot_{n}.name': f'タワー枠{n}' for n in range(1, 6)}, 'action.interact.tds_manage': '管理'},
}
for lang, kv in LANG.items():
    p = os.path.join(RP, 'texts', f'{lang}.lang'); head = []
    if os.path.exists(p): head = [l.rstrip('\n') for l in open(p, encoding='utf-8') if l.startswith('pack.')]
    with open(p, 'w', encoding='utf-8', newline='\n') as f: f.write('\n'.join(head + [f'{k}={v}' for k, v in kv.items()]) + '\n')
print('assets written')
