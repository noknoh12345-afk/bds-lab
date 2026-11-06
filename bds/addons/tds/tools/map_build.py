import json, numpy as np
from PIL import Image
t = json.load(open('grass.json'))
left = [tuple(p) for p in t['pts']]  # traced: (539,370)... -> (179,216); reversed later
# traced part is unreliable after (420,465); keep the start..(420,465) section from the cave side
tr = left[::-1]  # from left cave (179,216) outward
cut = next(i for i, p in enumerate(tr) if p[1] >= 455)  # first point of the bottom bend
pts = tr[:cut + 1] + [(470, 477), (540, 440), (552, 395), (562, 330), (577, 288), (595, 252), (618, 228), (730, 228), (765, 255), (800, 285), (880, 290)]
L = sum(np.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
STUDS, STUD = 48.67 * 3.5, 0.5
k = STUDS / L * STUD   # blocks per preview pixel
im = np.array(Image.open('g.png').convert('RGB')).astype(int); H, W = im.shape[:2]
cx, cy = W / 2, H / 2
to_b = lambda x, y: (round((x - cx) * k), round((y - cy) * k))
# cell classes from image colour (sampled per block)
R, G, B = im[..., 0], im[..., 1], im[..., 2]
grid = []
for bz in range(-32, 32):
    row = ''
    for bx in range(-32, 32):
        x0, x1, y0, y1 = int(cx + bx / k), int(cx + (bx + 1) / k), int(cy + bz / k), int(cy + (bz + 1) / k)
        if x1 <= 0 or y1 <= 0 or x0 >= W or y0 >= H: row += '.'; continue
        r, g, b = im[max(0, y0):y1, max(0, x0):x1].reshape(-1, 3).mean(0)
        if b > r + 15 and b > g - 5: row += 'w'                       # water
        elif abs(r - g) < 14 and abs(g - b) < 14 and r > 120: row += 'c'  # light rock → cliff
        elif abs(r - g) < 14 and abs(g - b) < 14 and r < 100: row += 'x'   # dark rock face → blocked
        else: row += 'g'
    grid.append(row)
from collections import Counter
g2 = [list(r) for r in grid]
for z in range(64):
    for x in range(64):
        if grid[z][x] == '.': continue
        c = Counter(grid[zz][xx] for zz in range(max(0, z - 1), min(64, z + 2)) for xx in range(max(0, x - 1), min(64, x + 2)) if grid[zz][xx] != '.')
        g2[z][x] = c.most_common(1)[0][0]
grid = [''.join(r) for r in g2]
wp = [to_b(x, y) for x, y in pts]
out = {'stud': STUD, 'y': -60, 'width': 3, 'path': wp, 'grid': grid, 'pathStuds': round(STUDS, 2), 'src': 'https://tds.fandom.com/wiki/Grass_Isle (Top Down image RahneegiNOWATERMARK.png; length 00:48.67 at speed 3.5)', 'spawnEnd': 'left cave (guess)'}
print('L_px', round(L), 'k', round(k, 4), 'blocks wide', round(W * k), 'tall', round(H * k), 'wp', wp[0], wp[-1], len(wp))
print('\n'.join(grid))
json.dump(out, open('grass_map.json', 'w'))
