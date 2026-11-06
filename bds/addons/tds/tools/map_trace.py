import sys, numpy as np
from PIL import Image
from skimage import morphology, measure
from scipy import ndimage
import heapq, json
f, out = sys.argv[1], sys.argv[2]
im = Image.open(f).convert('RGB'); W0, H0 = im.size; im = im.resize((1000, int(1000 * H0 / W0)))
a = np.array(im).astype(int); R, G, B = a[..., 0], a[..., 1], a[..., 2]
m = (R >= G - 2) & (R - B >= 6) & (R - B <= 45) & (R >= 80) & (R <= 175) & (G >= 65) & (G - B >= -5) & ~((G - R) > 10)
m = morphology.binary_opening(m, morphology.disk(2)); m = morphology.binary_closing(m, morphology.disk(6))
lab = measure.label(m); props = sorted(measure.regionprops(lab), key=lambda p: -p.area)
big = lab == props[0].label
Image.fromarray((big * 255).astype(np.uint8)).save(out + '_mask.png')
sk = morphology.skeletonize(big)
ys, xs = np.nonzero(sk); pts = set(zip(xs.tolist(), ys.tolist()))
nb = lambda p: [(p[0] + dx, p[1] + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and (p[0] + dx, p[1] + dy) in pts]
ends = [p for p in pts if len(nb(p)) == 1]
def dij(s):
    d = {s: 0}; pr = {}; q = [(0, s)]
    while q:
        c, p = heapq.heappop(q)
        if c > d[p]: continue
        for n in nb(p):
            nc = c + (1.414 if n[0] != p[0] and n[1] != p[1] else 1)
            if nc < d.get(n, 1e18): d[n] = nc; pr[n] = p; heapq.heappush(q, (nc, n))
    return d, pr
best = (0, None, None)
for e in ends:
    d, _ = dij(e); far = max(d, key=d.get)
    if d[far] > best[0]: best = (d[far], e, far)
L, s, t = best; d, pr = dij(s); path = [t]
while path[-1] != s: path.append(pr[path[-1]])
path.reverse()
# simplify (Douglas-Peucker)
def rdp(P, eps):
    if len(P) < 3: return P
    a, b = np.array(P[0]), np.array(P[-1]); ab = b - a; n = np.linalg.norm(ab) or 1
    dists = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / n for p in P[1:-1]]; i = int(np.argmax(dists)) + 1
    return rdp(P[:i + 1], eps)[:-1] + rdp(P[i:], eps) if dists[i - 1] > eps else [P[0], P[-1]]
simp = rdp(path, 6)
viz = np.array(im); 
for x, y in path: viz[max(0,y-2):y+3, max(0,x-2):x+3] = [255, 0, 0]
for x, y in simp: viz[max(0,y-5):y+6, max(0,x-5):x+6] = [255, 255, 0]
Image.fromarray(viz.astype(np.uint8)).save(out + '_trace.png')
w = float(np.median(ndimage.distance_transform_edt(big)[sk])) * 2
json.dump({'len_px': L, 'width_px': w, 'pts': simp, 'size': [1000, a.shape[0]]}, open(out + '.json', 'w'))
print('ends', len(ends), 'len_px', round(L), 'width_px', round(w, 1), 'pts', len(simp), simp[0], simp[-1])
