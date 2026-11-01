"""(SPECTRAL_REC=corpus/renders/rec25 python3 tools/rig/ideal_walk.py) run 25: a walking talker without remaking (the static recordings at x=0, ±3, ±6 spliced along the walk's schedule) against the
original, beside the static ones and the real walks — all scored here the same way (mono, the song's start lined up)."""
import sys, os
import numpy as np
sys.path.insert(0, 'tools/rig'); sys.path.insert(0, 'tools/exp'); sys.path.insert(0, 'tools/metrics')
import warnings; warnings.filterwarnings('ignore')
import common as CM, metrics as MT
from dropouts import aligned_near
SID = 'speech_ja_soseki'
rec = {}
for pre in ['ja', 'jb', 'jc', 'jd', 'jf', 'je', 'jg']:
    o, r = aligned_near(SID, pre); rec[pre] = r; orig = o
n = min(len(v) for v in rec.values()); orig = orig[:n]
for k in rec: rec[k] = rec[k][:n]
at = {0: 'ja', 6: 'jb', -6: 'jc', 3: 'jd', -3: 'jf'}
def at_x(x):
    """the signal of a talker standing at x (the two nearest recorded places mixed by distance)"""
    if x in at: return rec[at[x]]
    xs = sorted(at); lo = max(p for p in xs if p < x); hi = min(p for p in xs if p > x)
    w = (x - lo) / (hi - lo)
    return (1 - w) * rec[at[lo]] + w * rec[at[hi]]
path = [6] + [4, 2, 0, -2, -4, -6, -4, -2, 0, 2, 4, 6, 4, 2, 0, -2, -4, -6, -4, -2, 0, 2, 4, 6, 4, 2, 0, -2, -4, -6]
SR = CM.SR
for step in (0.70, 0.72, 0.75):
    y = np.zeros(n); fade = int(0.05 * SR)
    cuts = [0] + [int((0.1 + step * k) * SR) for k in range(1, len(path))] + [n]
    for k, x in enumerate(path):
        a, b = cuts[k], min(n, cuts[k + 1])
        if a >= n: break
        s = at_x(x)
        w = np.ones(b - a)
        # (50 ms crossfades at the moves)
        if k > 0: w[:min(fade, b - a)] = np.linspace(0, 1, min(fade, b - a))
        y[a:b] += s[a:b] * w
        if k > 0:
            prev = at_x(path[k - 1]); m = min(fade, b - a)
            y[a:a + m] += prev[a:a + m] * np.linspace(1, 0, m)
    print(f'ideal walk (step {step:.2f} s): ViSQOL {MT.visqol_score(orig, y):.3f}')
for k in ['ja', 'jb', 'jc', 'jd', 'jf', 'je', 'jg']:
    print(k, f'{MT.visqol_score(orig, rec[k]):.3f}')
