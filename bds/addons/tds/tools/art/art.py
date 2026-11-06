#!/usr/bin/env python3
"""TDS pixel art, drawn with tools/art/pix.py (original designs; the pxl skill's habits: halves mirrored,
outlines by the tool, 2-4 tones per material, every mark has a cause).

    python3 tools/art/art.py            # writes the sprites the model builder samples, the shipped icons, and a preview

Writes:
  tools/art/out/faces/<name>.png      head fronts, exactly the face's texel size (sampled BY POSITION by tools/models)
  tools/art/out/emblems/<name>.png    8x8 badges for flags, signs and banners
  rp/textures/items/slot_1..5.png     hotbar tower slots
  rp/textures/particle/tds_particles.png   8x8 cells, white so the particle tint colours them
  rp/pack_icon.png, bp/pack_icon.png
  tools/art/out/preview.png           everything above, upscaled on a checkerboard: LOOK at it
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pix import Canvas, preview  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')

INK = {'k': '#1c1820', 'K': '#3a3240', 'w': '#f0ece0', 'W': '#c8c2b4'}
GLOW = {'y': '#ffd650', 'Y': '#fff4b0', 'r': '#ff4a3c', 'R': '#ffb0a0', 'b': '#78dcff', 'B': '#e0f8ff', 'p': '#c070ff', 'P': '#f0d0ff',
        'g': '#7cff8c', 'o': '#ff9a2c', 'O': '#ffe0a0', 'c': '#50d0d0', 'C': '#d8ffff'}


def pal(**extra):
    p = dict(INK); p.update(GLOW); p.update(extra)
    return p


faces, emblems = {}, {}

# ---------------------------------------------------------------- faces (features only; the skin is the model's)
# walker 12x12: sunken sockets with a pinprick of light, a stitched grimace
faces['walker'] = Canvas(12, 12, pal(S='#00000040')).grid('''
......
......
.kkk..
.kyk..
.kkk..
......
.....S
......
..kkkk
..wkwk
...kkk
......''', mirror=True)

# armoured 12x12: a visor slit across the helmet, two embers inside, breathing holes
faces['armored'] = Canvas(12, 12, pal(h='#ffffff50')).grid('''
......
......
......
kkkkkk
kkrRkk
kkkkkk
......
.h....
...k.k
...k.k
......
......''', mirror=True)

# brute (boss) 14x12: brows slanting in, burning eyes, a jagged mouth
faces['brute'] = Canvas(14, 12, pal(m='#5a0e18', S='#00000040')).grid('''
.......
kk.....
.kkk...
.yYkk..
.kkk...
.......
......S
.kkkkkk
.kwmwmw
.kmmmmm
.kwmwmw
.kkkkkk''', mirror=True)

# runner 10x10: wind goggles and a grin
faces['runner'] = Canvas(10, 10, pal()).grid('''
.....
.....
kkkkk
kCcck
kccck
kkkkk
.....
..k..
...kk
.....''', mirror=True)

# wraith 12x12: nothing in the hood but two lights
faces['wraith'] = Canvas(12, 12, pal(d='#140c1c', D='#22162e')).grid('''
DDDDDD
dddddd
dddddd
dddddd
dddddd
ddPpdd
ddppdd
dddddd
dddddd
dddddd
dddddd
DDDDDD''', mirror=True)

# imp 12x10: big lamp eyes, two fangs
faces['imp'] = Canvas(12, 10, pal(m='#4a0c20')).grid('''
......
.kkk..
kyYrk.
kyrrk.
.kkk..
......
..kkkk
..kwmm
...w..
......''', mirror=True)

# heavy 12x10: helmet visor and a breathing grille
faces['heavy'] = Canvas(12, 10, pal(h='#ffffff60')).grid('''
......
kkkkkk
kOoook
kooook
kkkkkk
......
..kkkk
..kKkK
..kkkk
......''', mirror=True)

# yeti 14x12: a fur brow, cold eyes, a blue nose, small fangs
faces['yeti'] = Canvas(14, 12, pal(f='#00000030', n='#2a4a8a', m='#2a1830')).grid('''
.......
.......
.ffffff
.kbBk..
.kbbk..
.......
......n
.....nn
..kkkkk
..kwmmm
...w...
.......''', mirror=True)

# soldier 12x12 (tower figures and units): calm eyes, brows, a short mouth
faces['soldier'] = Canvas(12, 12, pal(S='#00000038')).grid('''
......
......
......
.kk...
......
.wk...
.wk...
......
.....S
...kkk
......
......''', mirror=True)

# skeleton 12x12: sockets, a nose hole, a row of teeth
faces['skeleton'] = Canvas(12, 12, pal()).grid('''
......
......
.kkk..
kkkkk.
kkbkk.
.kkk..
......
.....k
....kk
.kkkkk
.kwkwk
.kkkkk''', mirror=True)

# ---------------------------------------------------------------- emblems 8x8
emblems['cross'] = Canvas(8, 8, pal(g='#3cc864', G='#2a8a46')).grid('''
..ww
.wwg
wwwg
wggg''', mirror=True).grid('''
wggg
wwwG
.wwG
..ww''', y=4, mirror=True)
emblems['coin'] = Canvas(8, 8, pal(o='#a8701a', Y='#ffd84a', y='#f0b428', h='#fff6c0')).grid('''
..oooo..
.oYYYYo.
oYhyyyYo
oYyYYyYo
oYyYYyYo
oYyyyyYo
.oYYYYo.
..oooo..''')
emblems['flake'] = Canvas(8, 8, pal(b='#78dcff')).grid('''
...w
.w.w
..ww
wwwb''', mirror=True).grid('''
wwwb
..ww
.w.w
...w''', y=4, mirror=True)
emblems['star'] = Canvas(8, 8, pal(y='#ffd650', o='#d89a20')).grid('''
...y
...y
yyyy
.yyy
..yy
.yyo
.y..
....''', mirror=True)
emblems['sight'] = Canvas(8, 8, pal(r='#e8443a')).grid('''
..rr
.r..
r...
r..r''', mirror=True).grid('''
r..r
r...
.r..
..rr''', y=4, mirror=True)
emblems['chevron'] = Canvas(8, 8, pal(y='#ffd650', o='#c8901c')).grid('''
y...
yy..
.yy.
..yy
y..y
yy..
.yy.
..yo''', mirror=True)
emblems['bomb'] = Canvas(8, 8, pal(k='#26222a', K='#4a4450', y='#ffd650', o='#ff8a2c')).grid('''
......yo
.....y..
..kkkk..
.kKkkkk.
kKkkkkkk
kkkkkkkk
.kkkkkk.
..kkkk..''')

# ---------------------------------------------------------------- hotbar slots 16x16
DIGITS = {1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
          4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###']}
SLOT = {1: ('#4678c8', '#8ab4f0', '#2a4a86'), 2: ('#3ca05a', '#84d89a', '#226a38'), 3: ('#c89632', '#f0d07a', '#86601a'),
        4: ('#be4646', '#f08a84', '#7c2626'), 5: ('#8c5abe', '#c8a0ec', '#5a347e')}
slots = {}
for n, (mid, hi, lo) in SLOT.items():
    c = Canvas(16, 16, {'m': mid, 'h': hi, 'l': lo, 'k': '#16141a', 'w': '#ffffff', 's': '#00000060'})
    c.rect(2, 1, 12, 14, 'm').rect(1, 2, 14, 12, 'm')
    c.rect(2, 2, 12, 1, 'h').rect(2, 13, 12, 1, 'l').rect(13, 3, 1, 10, 'l').rect(2, 3, 1, 10, 'h')
    c.outline('k')
    for y, row in enumerate(DIGITS[n]):
        for x, ch in enumerate(row):
            if ch == '#':
                c.rect(5 + x * 2 + 1, 3 + y * 2 + 1, 2, 2, 's')        # drop shadow
    for y, row in enumerate(DIGITS[n]):
        for x, ch in enumerate(row):
            if ch == '#':
                c.rect(5 + x * 2, 3 + y * 2, 2, 2, 'w')
    slots[n] = c

# ---------------------------------------------------------------- particles 32x32, 8x8 cells (white: the emitter tints)
pt = Canvas(32, 32, {'w': '#ffffff', 'g': '#d8d8d8', 'G': '#a8a8a8', 'a': '#ffffffa0', 'A': '#ffffff50', 'q': '#ffffff28'})
pt.grid('''
..gg..
.gwwg.
gwwwwg
gwwwwg
.gwwg.
..gg..''', x=1, y=1)                                                    # (0,0) dot
pt.grid('''
...w
...w
..ww
wwww''', x=8, y=0, mirror=True).grid('''
wwww
..ww
...w
...w''', x=8, y=4, mirror=True)                                        # (1,0) spark
pt.recolor({'w': 'g'}, where=lambda x, y: 8 <= x < 16 and (x in (8, 15) or y in (0, 7)))
pt.grid('''
..qAAq..
.qAaaAq.
qAawwaAq
AawwwwaA
AawwwwaA
qAawwaAq
.qAaaAq.
..qAAq..''', x=16, y=0)                                                # (2,0) puff
pt.grid('''
...w
.w.w
..ww
wwwg''', x=24, y=0, mirror=True).grid('''
wwwg
..ww
.w.w
...w''', x=24, y=4, mirror=True)                                       # (3,0) flake
pt.grid('''
..gg
..ww
..ww
gwww''', x=0, y=8, mirror=True).grid('''
gwww
..ww
..ww
..gg''', x=0, y=12, mirror=True)                                       # (0,1) plus
pt.grid('''
..GGGG..
.GwwwwG.
Gwwgwwwg
GwgwwgwG
GwgwwgwG
Gwwggwwg
.gwwwwg.
..gggg..''', x=8, y=8)                                                 # (1,1) coin
pt.grid('''
gwww
gwgg
gwgw
gwgw
.gwg
.gwg
..gw
...g''', x=16, y=8, mirror=True)                                       # (2,1) shield
pt.grid('''
..ww
.w..
w...
w...''', x=24, y=8, mirror=True).grid('''
w...
w...
.w..
..ww''', x=24, y=12, mirror=True)                                      # (3,1) ring

# ---------------------------------------------------------------- pack icon 64x64: a lane, a turret, a walker on the path
icon = Canvas(64, 64, {'s': '#7cc4f0', 'S': '#a8daf8', 'g': '#5aa84a', 'G': '#478a3a', 'h': '#6cc058', 'p': '#c8a46a', 'P': '#a8864e',
                       'q': '#e0c48a', 'k': '#1c1820', 'm': '#5a6478', 'M': '#7a869c', 'n': '#3e4658', 'y': '#ffd650', 'b': '#3e66b4',
                       'B': '#6a92dc', 'z': '#7aa860', 'Z': '#4e7a3e', 'c': '#3c4a8a', 'r': '#e8443a', 'w': '#f0ece0', 'x': '#2a2430'})
icon.rect(0, 0, 64, 64, 's').rect(0, 0, 64, 10, 'S')
icon.rect(0, 30, 64, 34, 'g')
for i in range(0, 64, 4):
    icon.rect(i, 30, 2, 1, 'h')
icon.rect(0, 40, 64, 12, 'p').rect(0, 40, 64, 1, 'q').rect(0, 51, 64, 1, 'P')     # the lane, light on its near edge
for i in range(3, 64, 9):
    icon.rect(i, 45, 3, 1, 'P')
icon.rect(0, 52, 64, 12, 'G')
# turret on a pedestal (left)
icon.rect(8, 33, 22, 6, 'n').rect(9, 33, 20, 1, 'M').rect(10, 28, 18, 5, 'm').rect(10, 28, 18, 1, 'M')
icon.rect(12, 19, 14, 9, 'b').rect(12, 19, 14, 2, 'B').rect(13, 21, 2, 6, 'B')
icon.rect(26, 22, 14, 3, 'x').rect(38, 21, 3, 5, 'x')                                 # barrel, muzzle
icon.rect(16, 15, 6, 4, 'c').rect(17, 15, 4, 1, 'B')                                   # hatch
icon.rect(11, 35, 2, 2, 'y').rect(15, 35, 2, 2, 'y').rect(19, 35, 2, 2, 'y')           # level pips
# walker on the lane (right), arms out toward the turret
icon.rect(47, 47, 3, 5, 'x').rect(52, 47, 3, 5, 'x')                                    # legs
icon.rect(46, 38, 10, 9, 'Z').rect(46, 38, 10, 1, 'z')                                  # shirt
icon.rect(40, 39, 6, 3, 'z').rect(40, 39, 6, 1, 'h')                                    # arm reaching
icon.rect(46, 29, 9, 9, 'z').rect(46, 29, 9, 1, 'h')                                    # head
icon.rect(47, 32, 3, 2, 'k').rect(48, 32, 1, 1, 'y').rect(48, 35, 5, 1, 'k')
for c in (icon,):
    c.outline('k')
icon.rect(28, 21, 2, 1, 'y').rect(41, 22, 2, 1, 'y')                                    # muzzle flash
for x, y in ((43, 21), (44, 23), (43, 25)):
    icon.set(x, y, 'y')


FACE_SKIN = {'walker': (112, 158, 92), 'armored': (150, 156, 168), 'brute': (156, 72, 70), 'runner': (226, 186, 146), 'wraith': (60, 40, 80),
             'imp': (104, 132, 186), 'heavy': (118, 128, 86), 'yeti': (224, 236, 246), 'soldier': (226, 186, 146), 'skeleton': (232, 228, 212)}


def main():
    os.makedirs(os.path.join(OUT, 'faces'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'emblems'), exist_ok=True)
    for k, c in faces.items():
        c.save(os.path.join(OUT, 'faces', f'{k}.png'))
    for k, c in emblems.items():
        c.save(os.path.join(OUT, 'emblems', f'{k}.png'))
    for n, c in slots.items():
        c.save(os.path.join(ROOT, 'rp', 'textures', 'items', f'slot_{n}.png'))
    pt.save(os.path.join(ROOT, 'rp', 'textures', 'particle', 'tds_particles.png'))
    for pack in ('rp', 'bp'):
        icon.save(os.path.join(ROOT, pack, 'pack_icon.png'))
    from PIL import Image
    def on(rgb, im):                    # a face over the skin it will sit on, as the model paints it
        bg = Image.new('RGBA', im.size, rgb + (255,)); bg.alpha_composite(im); return bg
    items = [(f'face {k}', on(FACE_SKIN[k], c.image())) for k, c in faces.items()]
    items += [(f'emblem {k}', on((214, 206, 186), c.image())) for k, c in emblems.items()]
    items += [(f'slot {n}', c.image()) for n, c in slots.items()] + [('particles', pt.image()), ('pack icon', icon.image())]
    preview(items, os.path.join(OUT, 'preview.png'), size=144, cols=8)
    print(f'art: {len(faces)} faces, {len(emblems)} emblems, {len(slots)} slots, particles, pack icon -> tools/art/out/preview.png')


if __name__ == '__main__':
    main()
