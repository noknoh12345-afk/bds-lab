#!/usr/bin/env python3
"""Where a recording lost the voice for a while: 50 ms blocks where the original is loud (within 25 dB of its loudest) and the
recording 20 dB or more under where it should be (its median gain where the original is loud), in runs of 100 ms or more. A
talker who walks (follow) makes their sounds again at every move, and a syllable that starts just after one was found missing for
300-350 ms (runs 41286094409 and 41288535848, whatever the handover). The song's start lined up as tools/rig/dropouts.py does.
  python3 tools/rig/gaps.py <prefix_song> [...]      (recordings in corpus/renders/rec or SPECTRAL_REC)  → JSON lines"""
import os, sys, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'exp'))
import common as CM
from dropouts import aligned_near
from envelope import split


def check(name, under=20.0, min_ms=100):
    pre, sid = split(name)
    o, r = aligned_near(sid, pre)
    k = int(0.05 * CM.SR); n = min(len(o), len(r)) // k
    eo = 10 * np.log10((o[: n * k].reshape(n, k) ** 2).mean(1) + 1e-20)
    er = 10 * np.log10((r[: n * k].reshape(n, k) ** 2).mean(1) + 1e-20)
    loud = eo > eo.max() - 25
    gain = np.median((er - eo)[loud])
    lost = loud & (er < eo + gain - under)
    runs, i = [], 0
    while i < n:
        if lost[i]:
            j = i
            while j < n and lost[j]: j += 1
            if (j - i) * 50 >= min_ms: runs.append([round(i * 0.05, 2), (j - i) * 50])
            i = j
        else: i += 1
    return {'rec': name, 'gaps': len(runs), 'gap_ms': sum(x[1] for x in runs), 'loud_ms': int(loud.sum()) * 50,
            'gap_share': round(sum(x[1] for x in runs) / max(1, int(loud.sum()) * 50), 4), 'list': runs[:12]}


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    for a in sys.argv[1:]:
        try:
            print(json.dumps(check(a)))
        except Exception as e:
            print(json.dumps({'rec': a, 'error': str(e)[:200]}))
