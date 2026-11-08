#!/usr/bin/env python3
"""Draws the quads tools/hud_preview.mjs works out (the HUD's own Molang, run) over a stand-in scene: a sky, grass, a road.
    python3 -I tools/hud_preview.py <job.json>     (tools/hud_preview.mjs writes the job and calls this)"""
import json
import sys

from PIL import Image, ImageDraw

job = json.load(open(sys.argv[1]))
tex = {k: Image.open(v).convert('RGBA') for k, v in job['textures'].items()}
H = 720
W = round(H * job['aspect'])


def scene():
    im = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        if t < 0.45:
            c = (int(120 + 90 * t / 0.45), int(180 + 50 * t / 0.45), 255)
        else:
            k = (t - 0.45) / 0.55
            c = (int(98 - 30 * k), int(170 - 45 * k), int(80 - 25 * k))
        d.line([(0, y), (W, y)], fill=c + (255,))
    # a stair road winding over the grass, a few hills
    d.polygon([(W * 0.05, H), (W * 0.42, H * 0.47), (W * 0.58, H * 0.47), (W * 0.95, H)], fill=(132, 128, 120, 255))
    d.polygon([(W * 0.2, H), (W * 0.46, H * 0.47), (W * 0.54, H * 0.47), (W * 0.8, H)], fill=(98, 94, 88, 255))
    for cx, r in ((0.15, 0.2), (0.85, 0.24), (0.5, 0.1)):
        d.ellipse([W * (cx - r), H * 0.42, W * (cx + r), H * 0.62], fill=(80, 150, 70, 255))
    return im


shots = []
for s in job['shots']:
    im = scene()
    hw = s['halfw']
    px = lambda x: (x + hw) / (2 * hw) * W  # noqa: E731
    py = lambda y: (228 - y) / 176 * H  # noqa: E731
    for t, u, v, uw, uh, x0, y0, x1, y1, z in sorted(s['quads'], key=lambda q: -q[9]):
        a, b = int(round(px(x0))), int(round(py(y1)))
        w, h = int(round(px(x1))) - a, int(round(py(y0))) - b
        if w < 1 or h < 1:
            continue
        src = tex[t].crop((int(round(u)), int(round(v)), int(round(u + uw)), int(round(v + uh)))).resize((w, h), Image.BILINEAR)
        layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
        layer.paste(src, (a, b))
        im = Image.alpha_composite(im, layer)
    d = ImageDraw.Draw(im)
    d.text((8, H - 18), f"{s['name']}  {len(s['quads'])} planes", fill=(255, 255, 255, 255))
    shots.append(im)
if len(shots) == 1:
    shots[0].save(job['out'])
else:
    cols = 2
    rows = (len(shots) + 1) // 2
    sheet = Image.new('RGBA', (W * cols, H * rows), (0, 0, 0, 255))
    for i, im in enumerate(shots):
        sheet.paste(im, ((i % cols) * W, (i // cols) * H))
    sheet.save(job['out'])
print(job['out'], f'{len(shots)} shot(s)')
