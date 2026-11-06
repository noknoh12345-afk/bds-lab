#!/usr/bin/env python3
"""Offline checks of the TDS looks for what fails silently in the game (an invisible tower, a texture drawn with garbage,
gear that drifts off its vanilla body, an animation moving nothing, pips that never show):

    python3 tools/models/test_models.py [<rp dir> [<bp dir>]]     # exit 1 on any failure

 - every geometry and texture a client entity names exists: ours in the pack, vanilla ones in the lab's copy of Mojang's
   bedrock-samples (bds/.lab/samples, when present); our texture_width/height match the PNG drawn on it;
 - every gear bone that shares a vanilla bone's name has that bone's parent and pivot, so one animation moves both layers;
 - every UV rectangle lies inside its texture; both faces of a two-faced plate have the same size;
 - every bone an entity's animations move exists in one of its geometries (ours or vanilla);
 - every tower look has pip1..pip7 (body or gear: the render controllers show them by tds:lvl); the looks that shoot
   have a bone the aim turns (turret, or the vanilla waist); the farm has the `smoke` locator;
 - the behaviour tower has tds:yaw synced to the client.
"""
from __future__ import annotations

import glob
import json
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ADDON = os.path.abspath(os.path.join(HERE, '..', '..'))
SAMPLES = os.path.abspath(os.path.join(ADDON, '..', '..', '.lab', 'samples'))


def load(p):
    return json.load(open(p, encoding='utf-8'))


def vanilla_geos():
    """vanilla geometry id -> {bone: (parent, pivot)} from the samples checkout, inheritance resolved"""
    raw = {}
    for p in glob.glob(os.path.join(SAMPLES, 'resource_pack', 'models', '**', '*.json'), recursive=True):
        try:
            d = load(p)
        except Exception:
            continue
        for g in d.get('minecraft:geometry', []):
            raw[g['description']['identifier']] = (None, g.get('bones', []))
        for k, v in d.items():
            if k.startswith('geometry.'):
                raw[k.split(':')[0]] = (k.split(':')[1] if ':' in k else None, v.get('bones', []))

    def bones(gid):
        parent, bl = raw[gid]
        out = bones(parent) if parent in raw else {}
        out.update({b['name']: (b.get('parent'), b.get('pivot')) for b in bl})
        return out
    return {gid: bones(gid) for gid in raw}


def vanilla_textures():
    r = subprocess.run(['git', '-C', SAMPLES, 'ls-tree', '-r', '--name-only', 'HEAD', 'resource_pack/textures'], capture_output=True, text=True)
    if r.returncode:
        return None
    return {f[len('resource_pack/'):].rsplit('.', 1)[0] for f in r.stdout.split('\n') if f}


def main(rp, bp):
    fails = []
    geos = {}
    for p in glob.glob(os.path.join(rp, 'models', 'entity', '**', '*.json'), recursive=True):
        for g in load(p).get('minecraft:geometry', []):
            geos[g['description']['identifier']] = g
    anims = {}
    for p in glob.glob(os.path.join(rp, 'animations', '*.json')):
        anims.update(load(p).get('animations', {}))
    vg = vanilla_geos() if os.path.isdir(SAMPLES) else {}
    vt = vanilla_textures() if os.path.isdir(SAMPLES) else None
    if not vg:
        print('note: no bds/.lab/samples: vanilla geometries, textures and rigs are not checked')

    def bones_of(gid):
        if gid in geos:
            return {b['name']: (b.get('parent'), b.get('pivot')) for b in geos[gid]['bones']}
        return vg.get(gid, {})

    for name in ('enemy', 'tower', 'unit', 'ghost'):
        d = load(os.path.join(rp, 'entity', f'{name}.entity.json'))['minecraft:client_entity']['description']
        for k, gid in d['geometry'].items():
            if gid not in geos and not (vg and gid in vg):
                if gid.startswith('geometry.tds.') or vg:
                    fails.append(f'{name}: geometry {gid} ({k}) does not exist')
        for k, t in d['textures'].items():
            ours = os.path.exists(os.path.join(rp, t + '.png'))
            if not ours and t.startswith('textures/entity/tds/'):
                fails.append(f'{name}: texture {t} ({k}) does not exist')
            elif not ours and vt is not None and t not in vt:
                fails.append(f'{name}: vanilla texture {t} ({k}) is not in the game')
        if name != 'ghost':
            for layer in ('g', 'o'):
                for i in range(8):
                    gid = d['geometry'].get(f'{layer}{i}')
                    t = d['textures'].get(('t' if layer == 'g' else 'o') + str(i))
                    if gid in geos and gid != 'geometry.tds.empty' and t and os.path.exists(os.path.join(rp, t + '.png')):
                        desc = geos[gid]['description']
                        w, h = Image.open(os.path.join(rp, t + '.png')).size
                        if (desc['texture_width'], desc['texture_height']) != (w, h) and not t.endswith('holo_tint'):
                            fails.append(f'{name}: skin {i}: {gid} wants {desc["texture_width"]}x{desc["texture_height"]}, {t}.png is {w}x{h}')
            for i in range(8):                              # the gear follows its body: same parents and pivots for shared names
                body, gear = d['geometry'].get(f'g{i}'), d['geometry'].get(f'o{i}')
                if body in vg and gear in geos:
                    vb = vg[body]
                    for b in geos[gear]['bones']:
                        if b['name'] in vb:
                            par, piv = vb[b['name']]
                            if (b.get('parent') or None) != (par or None) or [round(x, 3) for x in b['pivot']] != [round(x, 3) for x in (piv or [0, 0, 0])]:
                                fails.append(f'{name}: skin {i}: gear bone {b["name"]} ({b.get("parent")}, {b["pivot"]}) differs from {body} ({par}, {piv})')
        allbones = set()
        for gid in d['geometry'].values():
            allbones |= set(bones_of(gid))
        for short, aid in d.get('animations', {}).items():
            if aid.startswith('controller.'):
                continue
            if aid not in anims:
                fails.append(f'{name}: animation {aid} does not exist')
                continue
            for bone in anims[aid].get('bones', {}):
                if bone not in allbones and (vg or bone not in ('waist', 'leftWing', 'rightWing', 'wing0', 'wing1', 'wingtip0', 'wingtip1', 'tailtip')):
                    fails.append(f'{name}: {aid} moves bone {bone}, which none of its geometries has')
        if name == 'tower':
            for i in range(8):
                names = set(bones_of(d['geometry'][f'g{i}'])) | set(bones_of(d['geometry'].get(f'o{i}', '')))
                miss = [f'pip{k}' for k in range(1, 8) if f'pip{k}' not in names]
                if miss:
                    fails.append(f'tower: skin {i} has no {", ".join(miss)}')
                if i in (0, 3, 4, 6) and not ({'turret', 'waist'} & names) and (vg or d['geometry'][f'g{i}'] in geos):
                    fails.append(f'tower: skin {i} has no turret or waist bone for the aim')
            farm = geos.get(d['geometry']['g2'], {})
            if not any('smoke' in (b.get('locators') or {}) for b in farm.get('bones', [])):
                fails.append('tower: the farm has no smoke locator')
    for gid, g in geos.items():
        W, H = g['description']['texture_width'], g['description']['texture_height']
        for b in g['bones']:
            for c in b.get('cubes', []):
                uv = c.get('uv', {})
                if not isinstance(uv, dict):
                    continue
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
    print(f'models: {len(geos)} of ours, {len(vg)} vanilla geometries, {len(anims)} animations checked, {len(fails)} failure(s)')
    return 1 if fails else 0


if __name__ == '__main__':
    a = sys.argv[1:]
    sys.exit(main(a[0] if a else os.path.join(ADDON, 'rp'), a[1] if len(a) > 1 else os.path.join(ADDON, 'bp')))
