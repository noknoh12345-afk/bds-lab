#!/usr/bin/env python3
"""Contact sheets of the roster's looks (roster.py, roster_towers.py), each drawn as the game draws it: the vanilla body
(from the lab's bds-samples checkout) merged with its gear, or our own body, posed as in the game. And the audit of the
same merged, posed models (audit.mjs): gear buried in the body, gear poking into it, gear on a vanilla face's plane, how
much of the face is still seen.

    python3 tools/models/sheet.py enemy|tower [--only <substring>] [--lvl N | --lvl top] [--fire] [--per 24] [--cols 6]
                                  [--views front34] [--size 300x300] [--at 0.3] [--audit] [--no-render]

writes bds/.lab/render/sheet_roster_<kind>_<n>.png (and with --audit bds/.lab/render/audit_<kind>.json) and prints them.
Enemies are posed by their animation.tds_look.* at --at seconds; towers stand on their pedestal in their pose
(entities.POSES), at level --lvl (each tower's top level with `top`). Preview only: nothing here is shipped.
"""
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import roster  # noqa: E402
from compose import keep_level, vanilla_geo  # noqa: E402
from vanilla import PED_TOP  # noqa: E402

ADDON = os.path.abspath(os.path.join(HERE, '..', '..'))
LAB = os.path.abspath(os.path.join(ADDON, '..', '..', '..'))
OUT = os.path.join(LAB, 'bds', '.lab', 'render')
TMP = os.path.join(LAB, 'bds', '.lab', 'render', 'roster')
MDIR = os.path.join(ADDON, 'rp', 'models', 'entity', 'tds')
TDIR = os.path.join(ADDON, 'rp', 'textures', 'entity', 'tds')


def vanilla_png(path):
    os.makedirs(TMP, exist_ok=True)
    keep = os.path.join(TMP, 'v_' + path.replace('/', '_') + '.png')
    if not os.path.exists(keep):
        repo = os.path.join(LAB, 'bds', '.lab', 'samples')
        for ext in ('png', 'tga'):
            r = subprocess.run(['git', '-C', repo, 'show', f'HEAD:resource_pack/{path}.{ext}'], capture_output=True)
            if r.returncode == 0:
                Image.open(io.BytesIO(r.stdout)).convert('RGBA').save(keep)
                break
        else:
            raise SystemExit(f'no vanilla texture {path}')
    return Image.open(keep).convert('RGBA')


def solid(img):
    px = img.load()
    for j in range(img.height):
        for i in range(img.width):
            r, g, b, a = px[i, j]
            if 0 < a < 255:
                px[i, j] = (r, g, b, 255)                       # self-lit texels shown solid (the renderer cuts low alpha)
    return img


def tagged(g, model):
    """our cubes carry their names (the audit names them) and the layer they belong to"""
    for b in g['bones']:
        ours = [c for c in model.cubes if c['bone'] == b['name']]
        for c, src in zip(b.get('cubes', []), ours):
            c['name'], c['layer'] = src['name'], 'gear'
            if src.get('part'):
                c['part'] = src['part']
    return g


def unflashed(bones, fire):
    """a muzzle flash waits out of sight until a shot (the looks' always-on clip hides it): drawn only with --fire"""
    return bones if fire else [{k: v for k, v in b.items() if k != 'cubes'} if 'flash' in b['name'] else b for b in bones]


def merged(lk, lvl=None, fire=False):
    """one geometry + one texture for the look: the vanilla body's bones with the gear's cubes added, or our body"""
    if lk.body is not None:
        geo = json.load(open(os.path.join(MDIR, f'{lk.body.name}.geo.json')))
        g = tagged(geo['minecraft:geometry'][0], lk.body)
        g['bones'] = keep_level(g['bones'], lvl, fire) if lvl is not None else unflashed(g['bones'], fire)
        return geo, solid(Image.open(os.path.join(TDIR, f'{lk.body.name}.png')).convert('RGBA'))
    vb, vw, vh = vanilla_geo(lk.rig.geo)
    vw, vh = int(vw or 64), int(vh or 64)
    vt = vanilla_png(lk.rig.tex)
    if vt.size != (vw, vh):
        vt = vt.crop((0, 0, vw, vh)) if vt.width >= vw and vt.height >= vh else vt.resize((vw, vh), Image.NEAREST)
    g = tagged(json.load(open(os.path.join(MDIR, f'{lk.gear.name}.geo.json')))['minecraft:geometry'][0], lk.gear)
    g['bones'] = keep_level(g['bones'], lvl, fire) if lvl is not None else unflashed(g['bones'], fire)
    gt = Image.open(os.path.join(TDIR, f'{lk.gear.name}.png')).convert('RGBA')
    W, H = max(vw, gt.width), vh + gt.height
    tex = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    tex.paste(vt, (0, 0))
    tex.paste(gt, (0, vh))
    bones = {b['name'].lower(): b for b in vb}
    order = [b['name'].lower() for b in vb]
    for b in g['bones']:
        cubes = []
        for c in b.get('cubes', []):
            c = json.loads(json.dumps(c))
            for f in c['uv'].values():
                f['uv'][1] += vh
            cubes.append(c)
        k = b['name'].lower()
        if k in bones:
            bones[k].setdefault('cubes', []).extend(cubes)
        else:
            bones[k] = dict(b, cubes=cubes)
            order.append(k)
    for k in lk.rig.hide:
        if k.lower() in bones:
            bones[k.lower()]['cubes'] = [c for c in bones[k.lower()].get('cubes', []) if c.get('layer') == 'gear']   # the illagers' crossed arms
    out = []
    for k in order:
        b = dict(bones[k])
        if b.get('neverRender') and k not in ('waist',):
            b['cubes'] = [c for c in b.get('cubes', []) if c.get('layer') == 'gear']
        b.pop('neverRender', None)
        out.append(b)
    for b in out:                                              # the lab's renderer looks bones up by their exact name
        if b.get('parent'):
            p = b['parent'].lower()
            b['parent'] = next(x['name'] for x in out if x['name'].lower() == p) if any(x['name'].lower() == p for x in out) else None
    geo = {'format_version': '1.16.0', 'minecraft:geometry': [{'description': {'identifier': f'geometry.sheet.{lk.slug}', 'texture_width': W, 'texture_height': H}, 'bones': out}]}
    return geo, solid(tex)


def bake_tower(geo, lk):
    """a tower as it stands in the game: the figure's root raised onto the pedestal (stand_*), the arms in its pose"""
    from entities import POSES
    g = geo['minecraft:geometry'][0]
    bones = {b['name']: b for b in g['bones']}
    root = lk.extra.get('root')
    if root in ('waist', 'body', 'root'):
        top = next((b for b in g['bones'] if b['name'].lower() == root), None)
        if top:
            under = set()
            for b in g['bones']:
                n = b['name']
                while n:
                    if n == top['name']:
                        under.add(b['name'])
                        break
                    n = bones[n].get('parent') if n in bones else None
            for n in under:
                b = bones[n]
                if b.get('pivot'):
                    b['pivot'] = [b['pivot'][0], b['pivot'][1] + PED_TOP, b['pivot'][2]]
                for c in b.get('cubes', []):
                    c['origin'] = [c['origin'][0], c['origin'][1] + PED_TOP, c['origin'][2]]
                    if c.get('pivot'):
                        c['pivot'] = [c['pivot'][0], c['pivot'][1] + PED_TOP, c['pivot'][2]]
    for bn, rot in POSES.get(lk.extra.get('pose'), {}).items():
        for b in g['bones']:
            if b['name'].lower() == bn:
                r0 = b.get('rotation') or [0, 0, 0]
                b['rotation'] = [r0[i] + rot[i] for i in range(3)]
    return geo


def prepare(lk, lvl, fire, at):
    """the merged, posed look on disk: (geometry path, texture path, the animation that poses it or None)"""
    os.makedirs(TMP, exist_ok=True)
    level = None
    if lk.kind == 'tower':
        level = lk.extra['top'] if lvl == 'top' else int(lvl or 0)
    geo, tex = merged(lk, level, fire)
    anim = None
    if lk.kind == 'tower':
        geo = bake_tower(geo, lk)
    else:
        anim = f'animation.tds_look.{lk.anim}'
    tag = f'{lk.kind}_{lk.slug}' + (f'_lv{level}' if level is not None else '')
    gp, tp = os.path.join(TMP, f'{tag}.geo.json'), os.path.join(TMP, f'{tag}.png')
    json.dump(geo, open(gp, 'w'))
    tex.save(tp)
    return tag, gp, tp, anim


def render(tag, gp, tp, anim, views, size, at):
    cmd = ['node', 'lab.mjs', 'render', gp, '--tex', tp, '-a', 'tds', '--views', views, '--size', size] + (['--anim', f'{anim}@{at}'] if anim else [])
    r = subprocess.run(cmd, cwd=LAB, capture_output=True, text=True, timeout=300)
    for line in (r.stdout + r.stderr).splitlines():
        if line.startswith('OK '):
            src = os.path.join(LAB, 'bds', line.split()[1])
            keep = os.path.join(TMP, f'shot_{tag}.png')
            shutil.copy(src, keep)
            return keep
    print('  no render:', tag, (r.stdout + r.stderr)[-300:])
    return None


def summary(res):
    bad = 0
    for r in res:
        if r.get('error'):
            print(f"  {r['tag']}: ERROR {r['error'][:200]}")
            bad += 1
            continue
        n = len(r['buried']) + len(r['zfight'])                 # (clipped: in the json, read it when a part looks sunk)
        bad += n > 0
        if n:
            print(f"  {r['tag']}: face {r['face']}  buried {r['buried']}  zfight {r['zfight']}")
    print(f'audit: {len(res)} looks, {bad} with findings')
    return bad


def main(argv):
    kind = argv[0]
    opt = lambda k, d: argv[argv.index(k) + 1] if k in argv else d  # noqa: E731
    only, per, cols = opt('--only', None), int(opt('--per', 24)), int(opt('--cols', 6))
    views, size, at, lvl = opt('--views', 'front34'), opt('--size', '300x300'), opt('--at', '0.3'), opt('--lvl', None)
    fire = '--fire' in argv
    looks = [lk for lk in roster.looks(kind) if not only or any(o.lower() in lk.name.lower() for o in only.split(','))]
    if kind == 'tower':
        data = roster.load('towers')
        for lk in looks:
            lk.extra['top'] = max(0, len(data[lk.name].get('levels') or []) - 1)
    jobs = [(lk, *prepare(lk, lvl, fire, at)) for lk in looks]
    if '--audit' in argv:
        jf = os.path.join(TMP, f'audit_jobs_{kind}.json')
        json.dump([{'tag': lk.name, 'geo': gp, 'tex': tp, **({'anim': an, 'at': float(at)} if an else {})} for lk, tag, gp, tp, an in jobs], open(jf, 'w'))
        r = subprocess.run(['node', os.path.join(HERE, 'audit.mjs'), jf], capture_output=True, text=True, timeout=900)
        if r.returncode:
            raise SystemExit(r.stderr[-2000:])
        res = json.loads(r.stdout)
        o = os.path.join(OUT, f'audit_{kind}{"_" + roster.slug(only) if only else ""}.json')
        json.dump(res, open(o, 'w'), indent=1)
        summary(res)
        print(o)
    if '--no-render' in argv:
        return 0
    shots = [(lk, render(tag, gp, tp, an, views, size, at)) for lk, tag, gp, tp, an in jobs]
    shots = [(lk, p) for lk, p in shots if p]
    for n in range(0, len(shots), per):
        chunk = shots[n:n + per]
        ims = [(lk, Image.open(p).convert('RGB')) for lk, p in chunk]
        w, h = ims[0][1].size
        rows = (len(ims) + cols - 1) // cols
        sh = Image.new('RGB', (w * cols, h * rows), (16, 22, 22))
        d = ImageDraw.Draw(sh)
        for i, (lk, im) in enumerate(ims):
            x, y = (i % cols) * w, (i // cols) * h
            sh.paste(im, (x, y))
            d.text((x + 5, y + 4), f'{lk.index} {lk.name}', fill=(255, 230, 90))
            rig = lk.rig.key if lk.rig else 'ours'
            d.text((x + 5, y + h - 14), f'{rig} {lk.anim} x{lk.size:.2f}' + (f' lv{lvl}' if lvl else ''), fill=(150, 170, 170))
        o = os.path.join(OUT, f'sheet_roster_{kind}{"_" + roster.slug(only) if only else ""}{"_lv" + str(lvl) if lvl else ""}_{n // per}.png')
        sh.save(o)
        print(o)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
