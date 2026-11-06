#!/usr/bin/env python3
"""The GeoUI HUD's animated pixel icons (only GeoUI animates; entity textures stay one frame).

Habits of the pixel-art animation skill (bds/ext/pixel-plugin/skills/pixel-art-animator): one loop of 8 frames at 10 fps
(100 ms a frame), an idle that mostly rests and moves briefly (the heart's "lub-dub", the gem's glint), a cycle whose last
frame leads into its first (the coin turns once), shapes kept on the pixel grid frame to frame.

    python3 tools/art/hud_anim.py     # -> rp/textures/tdsui/anim.png (a strip: frame k in rows 16k..16k+15; columns heart,
                                      #    coin, gem) + tools/art/out/hud_anim.png (frames side by side) and hud_anim.gif
tools/hud.mjs places one plane per icon over frame 0; the render controller's uv_anim steps the frames
(offset v = floor(t * 10) mod 8 / 8, material tdsui_cutout with USE_UV_ANIM).
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pix import Canvas, preview  # noqa: E402
from PIL import Image  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FRAMES, FPS, CELL = 8, 10, 16
ICONS = ('heart', 'coin', 'gem')

RED = {'r': '#dc3246', 'R': '#a01e32', 'h': '#ffaab4', 'k': '#3a0c14'}
GOLD = {'y': '#f0be32', 'Y': '#ffe080', 'o': '#be8214', 'd': '#7a5008', 'k': '#3a2806'}
GEM = {'p': '#aa5af0', 'P': '#823cc8', 'w': '#ebc8ff', 'W': '#ffffff', 'k': '#2a0c46'}


def heart(f):
    """lub-dub: big on frame 1, a smaller second beat on frame 3, resting the rest of the loop"""
    s = {1: 1.12, 2: 1.03, 3: 1.07}.get(f, 1.0)          # (the swollen heart still keeps its outline inside the 16 x 16 cell)
    c = Canvas(CELL, CELL, RED)
    cx, cy, r = 8.0, 6.8, 3.4 * s
    bottom = 6.8 + 7.0 * s
    for j in range(CELL):
        for i in range(CELL):
            x, y = i + 0.5, j + 0.5
            lobe = math.hypot(x - (cx - 2.5 * s), y - cy) <= r or math.hypot(x - (cx + 2.5 * s), y - cy) <= r
            tip = y >= cy and abs(x - cx) <= (bottom - y) * 0.95 and y <= bottom
            if lobe or tip:
                c.set(i, j, 'r')
    c.recolor({'r': 'R'}, where=lambda i, j: i >= 9 and j >= 9)              # shade on the lower right
    for i, j in ((5, 4), (6, 4), (5, 5)) if s > 1.05 else ((5, 5), (6, 5)):  # the shine, a pixel up when it swells
        c.set(i, j, 'h')
    c.outline('k')
    return c


def coin(f):
    """one turn in 8 frames: face, three-quarter, edge-on, back... the width follows |cos|"""
    a = 2 * math.pi * f / FRAMES
    w = max(0.9, 6.4 * abs(math.cos(a)))
    c = Canvas(CELL, CELL, GOLD)
    cx, cy, ry = 8.0, 8.0, 6.4
    for j in range(CELL):
        for i in range(CELL):
            x, y = i + 0.5, j + 0.5
            if ((x - cx) / w) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                c.set(i, j, 'y' if w > 2.0 else 'o')
    if w > 2.0:
        for j in range(CELL):                                                  # the rim and the struck mark, by position
            for i in range(CELL):
                x, y = i + 0.5, j + 0.5
                d = ((x - cx) / w) ** 2 + ((y - cy) / ry) ** 2
                if c.get(i, j) and d > 0.62:
                    c.set(i, j, 'o')
        if w > 3.5:
            for j in range(5, 11):
                c.set(7 if math.cos(a) > 0 else 8, j, 'd')                     # the mark flips on the back
            c.set(6 if math.cos(a) > 0 else 9, 5, 'Y')
    c.outline('k')
    return c


def gem(f):
    """a glint runs across the facets on frames 0-4, a twinkle sits on the corner on 5-6, then rest"""
    c = Canvas(CELL, CELL, GEM)
    for j in range(7):
        c.rect(8 - j, 2 + j, 2 * j + 1, 1, 'p')
        c.rect(8 - (6 - j), 9 + j, 2 * (6 - j) + 1, 1, 'P')
    if f <= 4:
        band = f * 3 - 2
        for j in range(CELL):
            for i in range(CELL):
                if c.get(i, j) and abs((i + j) - (band + 8)) < 1.2:
                    c.set(i, j, 'w')
    c.set(6, 5, 'w'); c.set(7, 4, 'w')
    c.outline('k')
    if f in (5, 6):
        k = 'W' if f == 5 else 'w'
        for i, j in ((13, 2), (12, 2), (14, 2), (13, 1), (13, 3)) if f == 5 else ((13, 2),):
            c.set(i, j, k)
    return c


def main():
    draw = {'heart': heart, 'coin': coin, 'gem': gem}
    strip = Image.new('RGBA', (CELL * len(ICONS), CELL * FRAMES), (0, 0, 0, 0))
    items = []
    frames_rgb = []
    for f in range(FRAMES):
        row = Image.new('RGBA', (CELL * len(ICONS), CELL), (0, 0, 0, 0))
        for n, name in enumerate(ICONS):
            im = draw[name](f).image()
            strip.alpha_composite(im, (n * CELL, f * CELL))
            row.alpha_composite(im, (n * CELL, 0))
            items.append((f'{name} {f}', im))
        frames_rgb.append(row)
    out = os.path.join(ROOT, 'rp', 'textures', 'tdsui', 'anim.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    strip.save(out, optimize=True)
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    ordered = [it for n in range(len(ICONS)) for it in items[n::len(ICONS)]]
    preview(ordered, os.path.join(HERE, 'out', 'hud_anim.png'), size=96, cols=FRAMES)
    big = [fr.resize((fr.width * 8, fr.height * 8), Image.NEAREST) for fr in frames_rgb]
    bg = [Image.alpha_composite(Image.new('RGBA', b.size, (30, 34, 52, 255)), b).convert('P', palette=Image.ADAPTIVE) for b in big]
    bg[0].save(os.path.join(HERE, 'out', 'hud_anim.gif'), save_all=True, append_images=bg[1:], duration=1000 // FPS, loop=0)
    print(f'hud anim: {len(ICONS)} icons x {FRAMES} frames at {FPS} fps -> rp/textures/tdsui/anim.png; look: tools/art/out/hud_anim.png')


if __name__ == '__main__':
    main()
