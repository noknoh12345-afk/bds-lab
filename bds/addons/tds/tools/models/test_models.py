#!/usr/bin/env python3
"""Offline checks of the TDS model pack for what fails silently in the game (an invisible tower, a texture drawn with
garbage, an animation moving nothing, pips that never show):

    python3 tools/models/test_models.py [<rp dir> [<bp dir>]]     # exit 1 on any failure

 - every geometry and texture a client entity names exists; texture_width/height match the PNG it is drawn with;
 - every UV rectangle lies inside its texture; both faces of a two-faced plate have the same size;
 - every bone an entity's animations move exists in one of that entity's geometries;
 - every tower geometry has pip1..pip7 (the render controller shows them by tds:lvl) and a root;
 - the turret bone the aim animation turns exists where towers shoot; the farm has the `smoke` locator;
 - the behaviour tower has tds:yaw synced to the client (the aim animation reads it).
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ADDON = os.path.abspath(os.path.join(HERE, '..', '..'))


def load(p):
    return json.load(open(p, encoding='utf-8'))


def main(rp, bp):
    fails = []
    geos = {}
    for p in glob.glob(os.path.join(rp, 'models', 'entity', '**', '*.json'), recursive=True):
        for g in load(p).get('minecraft:geometry', []):
            geos[g['description']['identifier']] = g
    anims = {}
    for p in glob.glob(os.path.join(rp, 'animations', '*.json')):
        anims.update(load(p).get('animations', {}))
    for name in ('enemy', 'tower', 'unit', 'ghost'):
        d = load(os.path.join(rp, 'entity', f'{name}.entity.json'))['minecraft:client_entity']['description']
        gl = [d['geometry'][k] for k in sorted(d['geometry'])]
        for k, gid in d['geometry'].items():
            if gid not in geos:
                fails.append(f'{name}: geometry {gid} ({k}) does not exist')
        for k, t in d['textures'].items():
            if not os.path.exists(os.path.join(rp, t + '.png')):
                fails.append(f'{name}: texture {t} ({k}) does not exist')
        if name != 'ghost':
            for i in range(8):
                gid, t = d['geometry'].get(f'g{i}'), d['textures'].get(f't{i}')
                if gid in geos and t and os.path.exists(os.path.join(rp, t + '.png')):
                    desc = geos[gid]['description']
                    w, h = Image.open(os.path.join(rp, t + '.png')).size
                    if (desc['texture_width'], desc['texture_height']) != (w, h):
                        fails.append(f'{name}: skin {i}: {gid} wants {desc["texture_width"]}x{desc["texture_height"]}, {t}.png is {w}x{h}')
        bones = {b['name'] for gid in gl if gid in geos for b in geos[gid]['bones']}
        for short, aid in d.get('animations', {}).items():
            if aid.startswith('controller.'):
                continue
            if aid not in anims:
                fails.append(f'{name}: animation {aid} does not exist')
                continue
            for bone in anims[aid].get('bones', {}):
                if bone not in bones:
                    fails.append(f'{name}: {aid} moves bone {bone}, which none of its geometries has')
        if name == 'tower':
            for gid in set(gl):
                names = {b['name'] for b in geos.get(gid, {}).get('bones', [])}
                missing = [f'pip{i}' for i in range(1, 8) if f'pip{i}' not in names] + (['root'] if 'root' not in names else [])
                if missing:
                    fails.append(f'tower: {gid} lacks {", ".join(missing)}')
            for i in (0, 3, 4, 6):                                          # gunner, mortar, sniper, hologram shoot
                gid = d['geometry'][f'g{i}']
                if 'turret' not in {b['name'] for b in geos.get(gid, {}).get('bones', [])}:
                    fails.append(f'tower: skin {i} ({gid}) has no turret bone for the aim')
            farm = geos.get(d['geometry']['g2'], {})
            if not any('smoke' in (b.get('locators') or {}) for b in farm.get('bones', [])):
                fails.append('tower: the farm has no smoke locator')
    for gid, g in geos.items():
        if not gid.startswith('geometry.tds.'):
            continue
        W, H = g['description']['texture_width'], g['description']['texture_height']
        for b in g['bones']:
            for c in b.get('cubes', []):
                uv = c.get('uv', {})
                for f, r in uv.items():
                    (u, v), (w, h) = r['uv'], r['uv_size']
                    if min(u, u + w) < 0 or min(v, v + h) < 0 or max(u, u + w) > W or max(v, v + h) > H:
                        fails.append(f'{gid}: {b["name"]} {f} UV {r} leaves the {W}x{H} texture')
                thin = [i for i in range(3) if c['size'][i] == 0]
                if thin:
                    pairs = {0: ('east', 'west'), 1: ('up', 'down'), 2: ('north', 'south')}[thin[0]]
                    if all(p in uv for p in pairs) and uv[pairs[0]]['uv_size'] != uv[pairs[1]]['uv_size']:
                        fails.append(f'{gid}: {b["name"]} plate faces differ: {uv[pairs[0]]["uv_size"]} / {uv[pairs[1]]["uv_size"]}')
    props = load(os.path.join(bp, 'entities', 'tower.json'))['minecraft:entity']['description'].get('properties', {})
    if not props.get('tds:yaw', {}).get('client_sync'):
        fails.append('bp tower: tds:yaw is missing or not client_sync')
    for f in fails:
        print('FAIL', f)
    print(f'models: {len(geos)} geometries, {len(anims)} animations checked, {len(fails)} failure(s)')
    return 1 if fails else 0


if __name__ == '__main__':
    a = sys.argv[1:]
    sys.exit(main(a[0] if a else os.path.join(ADDON, 'rp'), a[1] if len(a) > 1 else os.path.join(ADDON, 'bp')))
