#!/usr/bin/env python3
"""Tower portraits for the HUD's tower bar and the forms: every tower of data/towers.json drawn from its own model as the game
draws it (tools/models/sheet.py prepare: the vanilla body with its gear, standing on its pedestal, level 0), at the original's
three-quarter view, cut out of a key colour, cropped, given a soft shadow and scaled down from 4x (smooth edges, not pixels).

    python3 -I tools/art/portraits.py [--only Name,Name]

writes rp/textures/tdsui/towers.png (the atlas: 10 x 8 cells of 96 px, in the order of data/towers.json, which src/hud.ts
sends as each slot's index), rp/textures/tdsui/towers/<slug>.png (128 px, for the forms) and tools/art/portraits.json.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ADDON = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ADDON, 'tools', 'models'))
import roster  # noqa: E402
import sheet  # noqa: E402

CELL, COLS, ROWS, BIG, ICON = 96, 10, 8, 384, 128
argv = sys.argv[1:]
only = set(argv[argv.index('--only') + 1].split(',')) if '--only' in argv else None
names = list(json.load(open(os.path.join(ADDON, 'data', 'towers.json'))).keys())
assert len(names) <= COLS * ROWS, len(names)
looks = {lk.name: lk for lk in roster.looks('tower')}
data = roster.load('towers')
TMP = os.path.join(sheet.TMP, 'portraits')
os.makedirs(TMP, exist_ok=True)
slug = lambda n: ''.join(c if c.isalnum() else '_' for c in n.lower()).strip('_')  # noqa: E731

jobs = []
for n in names:
    if only and n not in only:
        continue
    lk = looks.get(n)
    if not lk:
        print('no look:', n)
        continue
    lk.extra['top'] = max(0, len(data[n].get('levels') or []) - 1)
    tag, gp, tp, _ = sheet.prepare(lk, '0', False, 0)
    jobs.append({'name': n, 'geo': gp, 'tex': tp, 'out': os.path.join(TMP, f'{slug(n)}.png'), 'view': 'front34', 'size': BIG})
jf = os.path.join(TMP, 'jobs.json')
json.dump(jobs, open(jf, 'w'))
r = subprocess.run(['node', os.path.join(HERE, 'render_batch.mjs'), jf], capture_output=True, text=True, timeout=900)
print((r.stdout + r.stderr).strip()[-400:])


def portrait(path, size):
    """the model alone (key colour out), centred in a square with room round it, a soft shadow below, scaled to size"""
    im = Image.open(path).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r_, g_, b_, _ = px[x, y]
            if r_ == 255 and g_ == 0 and b_ == 255:
                px[x, y] = (0, 0, 0, 0)
    box = im.getbbox()
    if not box:
        return None
    im = im.crop(box)
    side = int(max(im.width, im.height) * 1.12)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    ox, oy = (side - im.width) // 2, (side - im.height) // 2
    # the shadow: the silhouette, dark, blurred, a little down and right
    sil = Image.new('RGBA', im.size, (0, 0, 0, 0))
    sil.putalpha(im.getchannel('A').point(lambda a: int(a * 0.55)))
    sh = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sh.paste(sil, (ox + side // 40, oy + side // 28), sil)
    sh = sh.filter(ImageFilter.GaussianBlur(side / 70))
    sq = Image.alpha_composite(sq, sh)
    sq.alpha_composite(im, (ox, oy))
    return sq.resize((size, size), Image.LANCZOS)


atlas = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
os.makedirs(os.path.join(ADDON, 'rp', 'textures', 'tdsui', 'towers'), exist_ok=True)
made = 0
for i, n in enumerate(names):
    p = os.path.join(TMP, f'{slug(n)}.png')
    if not os.path.exists(p):
        continue
    small = portrait(p, CELL - 4)
    if small is None:
        print('empty render:', n)
        continue
    atlas.alpha_composite(small, ((i % COLS) * CELL + 2, (i // COLS) * CELL + 2))
    portrait(p, ICON).save(os.path.join(ADDON, 'rp', 'textures', 'tdsui', 'towers', f'{slug(n)}.png'))
    made += 1
if not only:
    atlas.save(os.path.join(ADDON, 'rp', 'textures', 'tdsui', 'towers.png'))
    json.dump({'cell': CELL, 'cols': COLS, 'rows': ROWS, 'names': names, 'slugs': [slug(n) for n in names]},
              open(os.path.join(HERE, 'portraits.json'), 'w'), indent=1)
print(f'portraits: {made}/{len(names)}')
