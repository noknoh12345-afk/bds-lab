#!/usr/bin/env python3
"""Preview a vanilla body with our gear on it, as the two render controllers draw them in the game: one merged geometry
(vanilla bones + gear bones of the same names; gear-only bones added) on one texture (the vanilla texture, the gear atlas
below it), rendered by the lab (`node lab.mjs render <file> --tex <png>`). Preview only: nothing here is shipped.

    python3 tools/models/compose.py enemy 0 [--views front34,side] [--anim <animation id>@<s>]
    python3 tools/models/compose.py tower 0|1|4|6      python3 tools/models/compose.py unit 1|3     python3 tools/models/compose.py all
"""
from __future__ import annotations

import glob
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vanilla as V  # noqa: E402
import hq  # noqa: E402
import hq_mobs  # noqa: E402

ADDON = os.path.abspath(os.path.join(HERE, '..', '..'))
LAB = os.path.abspath(os.path.join(ADDON, '..', '..', '..'))
SAMPLES = os.path.join(LAB, 'bds', '.lab', 'samples', 'resource_pack')
TMP = '/tmp/tds_compose'
MOB = {'geometry.zombie.v1.8': 'zombie', 'geometry.zombie.husk.v1.8': 'husk', 'geometry.skeleton.wither.v1.8': 'wither_skeleton',
       'geometry.zombie.drowned.v1.16': 'drowned', 'geometry.vex.v1.8': 'vex', 'geometry.phantom': 'phantom', 'geometry.piglin': 'zombie_pigman',
       'geometry.skeleton.stray.v1.8': 'stray', 'geometry.pillager': 'pillager', 'geometry.villager.witch.v1.8': 'witch',
       'geometry.skeleton.v1.8': 'skeleton'}


def vanilla_geo(gid):
    for p in glob.glob(os.path.join(SAMPLES, 'models', '**', '*.json'), recursive=True):
        try:
            d = json.load(open(p))
        except Exception:
            continue
        for g in d.get('minecraft:geometry', []):
            if g['description']['identifier'] == gid:
                return [dict(b) for b in g['bones']], g['description']['texture_width'], g['description']['texture_height']
        for k, v in d.items():
            if k.split(':')[0] == gid:
                bones = [dict(b) for b in v.get('bones', [])]
                if ':' in k:                                  # inherited: the parent's bones first, the child's replace them
                    base, bw, bh = vanilla_geo(k.split(':')[1])
                    names = {b['name'] for b in bones}
                    bones = [b for b in base if b['name'] not in names] + bones
                    return bones, v.get('texturewidth', bw), v.get('textureheight', bh)
                return bones, v.get('texturewidth'), v.get('textureheight')
    raise SystemExit(f'no vanilla {gid}')


def vanilla_tex(gid):
    """the vanilla texture itself, from the lab's sparse checkout of Mojang's bedrock-samples (git objects, not files)"""
    path = {b[0]: b[1] for b in V.ENEMY_BASE + list(V.TOWER_FIGURE.values()) + list(V.UNIT_FIGURE.values())}[gid]
    os.makedirs(TMP, exist_ok=True)
    keep = os.path.join(TMP, 'v_' + path.replace('/', '_') + '.png')
    if not os.path.exists(keep):
        repo = os.path.join(LAB, 'bds', '.lab', 'samples')
        for ext in ('png', 'tga'):
            r = subprocess.run(['git', '-C', repo, 'show', f'HEAD:resource_pack/{path}.{ext}'], capture_output=True)
            if r.returncode == 0:
                import io
                Image.open(io.BytesIO(r.stdout)).convert('RGBA').save(keep)
                break
        else:
            raise SystemExit(f'no vanilla texture {path}')
    return Image.open(keep).convert('RGBA')


def compose(tag, gid, gear, gear_tex, pose=None, lift=0.0, lvl=0, fire=False):
    vb, vw, vh = vanilla_geo(gid)
    vt = vanilla_tex(gid)
    if vt.size != (vw, vh):                         # the lab packs extra layers beside / below the base texture: keep the base
        vt = vt.crop((0, 0, vw, vh)) if vt.width >= vw and vt.height >= vh else vt.resize((vw, vh), Image.NEAREST)
    g = json.load(open(os.path.join(ADDON, 'rp', 'models', 'entity', 'tds', f'{gear}.geo.json')))['minecraft:geometry'][0]
    g['bones'] = keep_level(g['bones'], lvl, fire)
    gt = Image.open(os.path.join(ADDON, 'rp', 'textures', 'entity', 'tds', f'{gear_tex}.png')).convert('RGBA')
    W, H = max(vw, gt.width), vh + gt.height
    tex = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    tex.paste(vt, (0, 0)); tex.paste(gt, (0, vh))
    bones = {b['name']: b for b in vb}
    order = [b['name'] for b in vb]
    for b in g['bones']:
        cubes = []
        for c in b.get('cubes', []):
            c = json.loads(json.dumps(c))
            for f in c['uv'].values():
                f['uv'][1] += vh
            cubes.append(c)
        if b['name'] in bones:
            bones[b['name']].setdefault('cubes', []).extend(cubes)
        else:
            bones[b['name']] = dict(b, cubes=cubes)
            order.append(b['name'])
    for name in order:                                        # the figure's root raised onto the pedestal (animation stand_*)
        b = bones[name]
        if lift and b.get('parent') is None and name not in ('tds_base', 'root'):
            b['pivot'] = [b['pivot'][0], b['pivot'][1] + lift, b['pivot'][2]] if b.get('pivot') else [0, lift, 0]
            for nm in order:
                if is_under(bones, nm, name):
                    bb = bones[nm]
                    if nm != name and bb.get('pivot'):
                        bb['pivot'] = [bb['pivot'][0], bb['pivot'][1] + lift, bb['pivot'][2]]
                    for c in bb.get('cubes', []):
                        c['origin'] = [c['origin'][0], c['origin'][1] + lift, c['origin'][2]]
                        if c.get('pivot'):
                            c['pivot'] = [c['pivot'][0], c['pivot'][1] + lift, c['pivot'][2]]
    for name, rot in (pose or {}).items():
        if name in bones:
            r0 = bones[name].get('rotation') or [0, 0, 0]
            bones[name]['rotation'] = [r0[i] + rot[i] for i in range(3)]
    for b in bones.values():
        b.pop('neverRender', None) if b['name'] not in ('hat', 'waist') else None
    out = {'format_version': '1.16.0', 'minecraft:geometry': [{'description': {'identifier': f'geometry.compose.{tag}', 'texture_width': W, 'texture_height': H},
                                                                'bones': [bones[n] for n in order if not bones[n].get('neverRender')]}]}
    os.makedirs(TMP, exist_ok=True)
    gp, tp = os.path.join(TMP, f'{tag}.geo.json'), os.path.join(TMP, f'{tag}.png')
    json.dump(out, open(gp, 'w'))
    px = tex.load()
    for j in range(H):
        for i in range(W):
            r, gg, b2, a = px[i, j]
            if 0 < a < 255:
                px[i, j] = (r, gg, b2, 255)                   # self-lit texels shown solid
    tex.save(tp)
    return gp, tp


def visible(name, lvl, fire=False):
    """what the render controllers show at tower level lvl (entities.level_rules), flashes only during a shot (and only
    the flash of the gun that level holds: its own prefix still applies)"""
    import re
    if 'flash' in name and not fire:
        return False
    for pat, test in ((r'pip(\d)$', lambda a: lvl >= a[0]), (r'lv(\d)_', lambda a: lvl >= a[0]), (r'pre(\d)_', lambda a: lvl < a[0]),
                      (r'r(\d)to(\d)_', lambda a: a[0] <= lvl < a[1])):
        mm = re.match(pat, name)
        if mm:
            return test([int(g) for g in mm.groups()])
    return True


def keep_level(bones_list, lvl, fire=False):
    """the bones as the render controllers draw them at a level. Visibility is per bone, as in the game (vanilla's first-person
    arm shows while its parent body is hidden): a hidden bone keeps its place in the rig, so its children still follow it,
    but draws none of its own cubes, and a child without its own rule still shows"""
    return [b if visible(b['name'], lvl, fire) else {k: v for k, v in b.items() if k != 'cubes'} for b in bones_list]


def is_under(bones, name, root):
    while name:
        if name == root:
            return True
        name = bones[name].get('parent') if name in bones else None
    return False


def render(gp, tp, views=None, anim=None):
    cmd = ['node', 'lab.mjs', 'render', gp, '--tex', tp, '-a', 'tds'] + (['--views', views] if views else []) + (['--anim', anim] if anim else [])
    r = subprocess.run(cmd, cwd=LAB, capture_output=True, text=True, timeout=180)
    for l in (r.stdout + r.stderr).splitlines():
        if l.startswith('OK '):
            return os.path.join(LAB, 'bds', l.split()[1])
        if l.startswith(('ERR', 'W ')):
            print('  ', l[:200])
    return None


HOLD = {'rightarm': (-82, -14, 0), 'leftarm': (-80, 34, 0)}
ZOMBIE = {'rightArm': (-84, 0, 0), 'leftArm': (-84, 0, 0)}


def job(kind, i):
    if kind == 'enemy':
        gid = V.ENEMY_BASE[i][0]
        gear = hq_mobs.ENEMY_GEAR[i]().name
        return f'enemy{i}_{gear}', gid, gear, gear, (ZOMBIE if i in (0, 1) else {'leftarm': (-42, 0, 0)} if i == 6 else None), 0.0
    if kind == 'tower':
        fig = V.TOWER_FIGURE.get(i, V.TOWER_FIGURE[0])
        gear = hq.TOWER_GEAR.get(i, hq.TOWER_GEAR[0])().name
        return f'tower{i}_{gear}', fig[0], gear, gear + ('_holo' if i == 6 else ''), (HOLD if i in (0, 4, 6) else None), V.PED_TOP
    fig = V.UNIT_FIGURE[i]
    gear = hq_mobs.UNIT_GEAR[i]().name
    return f'unit{i}_{gear}', fig[0], gear, gear, ({'rightarm': (-70, -12, 0), 'leftarm': (-66, 30, 0)} if i == 1 else ZOMBIE), 0.0


def main(argv):
    views = argv[argv.index('--views') + 1] if '--views' in argv else None
    lvl = int(argv[argv.index('--lvl') + 1]) if '--lvl' in argv else 0
    fire = '--fire' in argv
    anim = argv[argv.index('--anim') + 1] if '--anim' in argv else None
    jobs = [('enemy', i) for i in range(8)] + [('tower', i) for i in (0, 1, 4)] + [('unit', i) for i in (1, 3)] if argv[0] == 'all' else [(argv[0], int(argv[1]))]
    shots = []
    for kind, i in jobs:
        tag, gid, gear, gtex, pose, lift = job(kind, i)
        gp, tp = compose(tag + f'_lv{lvl}', gid, gear, gtex, None if anim else pose, lift, lvl, fire)     # with an animation, its pose is the one shown
        png = render(gp, tp, views, anim)
        if png:
            keep = os.path.join(TMP, f'shot_{tag}_lv{lvl}.png'); shutil.copy(png, keep); shots.append((f'{tag} lv{lvl}', keep))
    from look import sheet
    print(sheet(shots, os.path.join(LAB, 'bds', '.lab', 'render', f'sheet_compose_{argv[0]}_lv{lvl}.png'), s=0.5))


if __name__ == '__main__':
    main(sys.argv[1:])
