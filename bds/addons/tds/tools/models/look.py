#!/usr/bin/env python3
"""Look at the models the way the game draws them, with the lab's own renderer (`node lab.mjs render`).

    python3 tools/models/look.py enemy_walker tower_gunner ...   [--anim <animation id>@<sec>] [--views a,b] [--sheet name]
    python3 tools/models/look.py --all

Self-lit texels (alpha 24 for entity_emissive_alpha_one_sided) are drawn opaque in a preview copy of the texture,
since the renderer cuts low alpha the way entity_alphatest would. One sheet of all renders: bds/.lab/render/sheet_<name>.png
"""
from __future__ import annotations

import os
import subprocess
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ADDON = os.path.abspath(os.path.join(HERE, '..', '..'))
LAB = os.path.abspath(os.path.join(ADDON, '..', '..', '..'))
TEX = os.path.join(ADDON, 'rp', 'textures', 'entity', 'tds')
OUT = os.path.join(LAB, 'bds', '.lab', 'render')
TMP = '/tmp/tds_look'


def preview_tex(name):
    os.makedirs(TMP, exist_ok=True)
    im = Image.open(os.path.join(TEX, f'{name}.png')).convert('RGBA')
    px = im.load()
    for j in range(im.height):
        for i in range(im.width):
            r, g, b, a = px[i, j]
            if 0 < a < 255:
                px[i, j] = (r, g, b, 255)
    path = os.path.join(TMP, f'{name}.png')
    im.save(path)
    return path


def render(name, tex=None, anim=None, views=None, lvl=None, fire=False):
    geo = name if not tex else tex
    target = f'geometry.tds.{name}'
    if lvl is not None:                                       # the level's look: hide what the render controller would hide
        import json
        from compose import keep_level
        d = json.load(open(os.path.join(ADDON, 'rp', 'models', 'entity', 'tds', f'{name}.geo.json')))
        g = d['minecraft:geometry'][0]
        g['bones'] = keep_level(g['bones'], lvl, fire)
        g['description']['identifier'] = f'geometry.tds.{name}_lv{lvl}'
        target = os.path.join(TMP, f'{name}_lv{lvl}.geo.json')
        json.dump(d, open(target, 'w'))
    cmd = ['node', 'lab.mjs', 'render', target, '--tex', preview_tex(tex or name), '-a', 'tds']
    if anim:
        cmd += ['--anim', anim]
    if views:
        cmd += ['--views', views]
    r = subprocess.run(cmd, cwd=LAB, capture_output=True, text=True, timeout=180)
    lines = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith(('W ', 'ERR', 'OK'))]
    png = None
    for l in lines:
        if l.startswith('OK '):
            png = os.path.join(LAB, 'bds', l.split()[1])           # the renderer names the file it wrote
        else:
            print(f'  {name}: {l}')
    return png, geo


def sheet(paths, out, cols=4, s=0.5):
    ims = [(n, Image.open(p).convert('RGB')) for n, p in paths if os.path.exists(p)]
    w, h = ims[0][1].size
    W, H = int(w * s), int(h * s)
    rows = (len(ims) + cols - 1) // cols
    sh = Image.new('RGB', (W * min(cols, len(ims)), H * rows), (0, 0, 0))
    d = ImageDraw.Draw(sh)
    for i, (n, im) in enumerate(ims):
        x, y = (i % cols) * W, (i // cols) * H
        sh.paste(im.resize((W, H), Image.LANCZOS), (x, y))
        d.text((x + 4, y + 4), n, fill=(255, 255, 0))
    sh.save(out)
    return out


def main(argv):
    anim = argv[argv.index('--anim') + 1] if '--anim' in argv else None
    views = argv[argv.index('--views') + 1] if '--views' in argv else None
    name = argv[argv.index('--sheet') + 1] if '--sheet' in argv else 'look'
    scale = float(argv[argv.index('--scale') + 1]) if '--scale' in argv else 0.5
    lvl = int(argv[argv.index('--lvl') + 1]) if '--lvl' in argv else None
    skip = {anim, views, name, str(scale), str(lvl)}
    names = [a for a in argv if not a.startswith('--') and a not in skip]
    if '--all' in argv:
        names = sorted(f[:-9] for f in os.listdir(os.path.join(ADDON, 'rp', 'models', 'entity', 'tds')) if f.endswith('.geo.json'))
    paths = []
    for n in names:
        geo, tex = (n.split(':') + [None])[:2]
        p, _ = render(geo, tex, anim, views, lvl, '--fire' in argv)
        tag = f'{geo}' + (f' [{tex}]' if tex else '') + (f' {anim}' if anim else '') + (f' lv{lvl}' if lvl is not None else '')
        keep = os.path.join(TMP, f'r_{len(paths)}.png')
        if p and os.path.exists(p):
            Image.open(p).save(keep)
        paths.append((tag, keep))
    out = sheet(paths, os.path.join(OUT, f'sheet_{name}.png'), s=scale)
    print(out)


if __name__ == '__main__':
    main(sys.argv[1:])
