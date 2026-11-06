#!/usr/bin/env python3
"""Contact sheets of the roster's looks (roster.py), each drawn as the game draws it: the vanilla body (from the lab's
bds-samples checkout) merged with its gear, or our own body, posed by its own animation (animation.tds_look.*).

    python3 tools/models/sheet.py enemy [--only <substring>] [--per 24] [--cols 6] [--views front34] [--size 300x300] [--at 0.3]

writes bds/.lab/render/sheet_roster_<kind>_<n>.png and prints the paths. Preview only: nothing here is shipped.
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
from compose import vanilla_geo  # noqa: E402

ADDON = os.path.abspath(os.path.join(HERE, '..', '..'))
LAB = os.path.abspath(os.path.join(ADDON, '..', '..', '..'))
OUT = os.path.join(LAB, 'bds', '.lab', 'render')
TMP = os.path.join(LAB, 'bds', '.lab', 'render', 'roster')


def vanilla_png(path):
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


def merged(lk):
    """one geometry + one texture for the look: the vanilla body's bones with the gear's cubes added, or our body"""
    tdir = os.path.join(ADDON, 'rp', 'textures', 'entity', 'tds')
    mdir = os.path.join(ADDON, 'rp', 'models', 'entity', 'tds')
    if lk.body is not None:
        geo = json.load(open(os.path.join(mdir, f'{lk.body.name}.geo.json')))
        tex = solid(Image.open(os.path.join(tdir, f'{lk.body.name}.png')).convert('RGBA'))
        return geo, tex
    vb, vw, vh = vanilla_geo(lk.rig.geo)
    vw, vh = int(vw or 64), int(vh or 64)
    vt = vanilla_png(lk.rig.tex)
    if vt.size != (vw, vh):
        vt = vt.crop((0, 0, vw, vh)) if vt.width >= vw and vt.height >= vh else vt.resize((vw, vh), Image.NEAREST)
    g = json.load(open(os.path.join(mdir, f'{lk.gear.name}.geo.json')))['minecraft:geometry'][0]
    gt = Image.open(os.path.join(tdir, f'{lk.gear.name}.png')).convert('RGBA')
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
            bones[k.lower()]['cubes'] = []                       # what the render controller hides (the illagers' crossed arms)
    out = []
    for k in order:
        b = dict(bones[k])
        if b.get('neverRender') and k not in ('waist',):
            b['cubes'] = []
        b.pop('neverRender', None)
        out.append(b)
    for b in out:                                              # the lab's renderer looks bones up by their exact name
        if b.get('parent'):
            p = b['parent'].lower()
            b['parent'] = next(x['name'] for x in out if x['name'].lower() == p) if any(x['name'].lower() == p for x in out) else None
    geo = {'format_version': '1.16.0', 'minecraft:geometry': [{'description': {'identifier': f'geometry.sheet.{lk.slug}', 'texture_width': W, 'texture_height': H}, 'bones': out}]}
    return geo, solid(tex)


def render(lk, views, size, at):
    os.makedirs(TMP, exist_ok=True)
    geo, tex = merged(lk)
    gp, tp = os.path.join(TMP, f'{lk.kind}_{lk.slug}.geo.json'), os.path.join(TMP, f'{lk.kind}_{lk.slug}.png')
    json.dump(geo, open(gp, 'w'))
    tex.save(tp)
    cmd = ['node', 'lab.mjs', 'render', gp, '--tex', tp, '-a', 'tds', '--views', views, '--size', size, '--anim', f'animation.tds_look.{lk.anim}@{at}']
    r = subprocess.run(cmd, cwd=LAB, capture_output=True, text=True, timeout=300)
    for line in (r.stdout + r.stderr).splitlines():
        if line.startswith('OK '):
            src = os.path.join(LAB, 'bds', line.split()[1])
            keep = os.path.join(TMP, f'shot_{lk.kind}_{lk.slug}.png')
            shutil.copy(src, keep)
            return keep
    print('  no render:', lk.name, (r.stdout + r.stderr)[-300:])
    return None


def main(argv):
    kind = argv[0]
    opt = lambda k, d: argv[argv.index(k) + 1] if k in argv else d  # noqa: E731
    only, per, cols = opt('--only', None), int(opt('--per', 24)), int(opt('--cols', 6))
    views, size, at = opt('--views', 'front34'), opt('--size', '300x300'), opt('--at', '0.3')
    looks = [lk for lk in roster.looks(kind) if not only or only.lower() in lk.name.lower()]
    shots = [(lk, render(lk, views, size, at)) for lk in looks]
    shots = [(lk, p) for lk, p in shots if p]
    outs = []
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
            d.text((x + 5, y + h - 14), f'{lk.rig.key} {lk.anim} x{lk.size:.2f}', fill=(150, 170, 170))
        o = os.path.join(OUT, f'sheet_roster_{kind}{"_" + roster.slug(only) if only else ""}_{n // per}.png')
        sh.save(o)
        outs.append(o)
        print(o)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
