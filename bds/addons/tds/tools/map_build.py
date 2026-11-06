# Build data/maps.json entries from the wiki's top-down map images.
# Each spec: the image, the route read from it (preview pixels, 1000 px wide, spawn → base) and the wiki's
# length (seconds at speed 3.5, Category:Short Maps). Block classes come from each block's mean colour.
import json, sys, math, numpy as np
from PIL import Image
from collections import Counter
SPECS = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
STUD = 0.5
maps = {}
for name, sp in SPECS.items():
    im = Image.open(sp['image']).convert('RGB'); W0, H0 = im.size; im = im.resize((1000, int(1000 * H0 / W0)))
    a = np.array(im).astype(int); H, W = a.shape[:2]
    pts = sp['route']
    L = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
    studs = sp['seconds'] * 3.5
    k = studs / L * STUD                         # blocks per preview pixel
    cx, cy = sp.get('center', [W / 2, H / 2])
    grid = []
    for bz in range(-32, 32):
        row = ''
        for bx in range(-32, 32):
            x0, x1, y0, y1 = int(cx + bx / k), int(cx + (bx + 1) / k), int(cy + bz / k), int(cy + (bz + 1) / k)
            if x1 <= 0 or y1 <= 0 or x0 >= W or y0 >= H: row += 'v'; continue
            r, g, b = a[max(0, y0):y1, max(0, x0):x1].reshape(-1, 3).mean(0)
            lum = (r + g + b) / 3
            if b > r + 15 and b > g - 5: row += 'w'
            elif lum < sp.get('void', 0): row += 'v'
            elif g > r + sp.get('green', 8) and g > b: row += 'g'
            else: row += sp.get('other', 'x')
        grid.append(row)
    g2 = [list(r) for r in grid]
    for z in range(64):
        for x in range(64):
            c = Counter(grid[zz][xx] for zz in range(max(0, z - 1), min(64, z + 2)) for xx in range(max(0, x - 1), min(64, x + 2)))
            g2[z][x] = c.most_common(1)[0][0]
    grid = [''.join(r) for r in g2]
    wp = [[round((x - cx) * k), round((y - cy) * k)] for x, y in pts]
    out = [wp[0]]
    for p in wp[1:]:
        if p != out[-1]: out.append(p)
    maps[name] = {'stud': STUD, 'y': -60, 'width': 3, 'path': out, 'grid': grid, 'pathStuds': round(studs, 2), 'src': sp['src'], 'legend': {'g': 'grass (ground)', 'x': 'cliff', 'w': 'water', 'v': 'void'}}
    span = [min(p[0] for p in out), max(p[0] for p in out), min(p[1] for p in out), max(p[1] for p in out)]
    print(name, 'L_px', round(L), 'blocks/px', round(k, 4), 'route span', span, 'points', len(out))
    print('\n'.join(grid[::2]))
json.dump(maps, open(OUT, 'w'), separators=(',', ':'))
