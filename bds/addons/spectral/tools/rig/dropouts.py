#!/usr/bin/env python3
"""Was a recording whole? Its 10 ms blocks against the original's: the share of blocks where the original sounds (within 30 dB
of its loudest block) and the recording is 30 dB or more under where it should be (a drop: the device's audio or the game's
mixer lost it), the longest such run, and the stretches of digital silence (exact zeros) inside the recording. A recording
with drops is a measurement to doubt, not a way of playing to judge (run 8: two arms of the same song 1.0 ViSQOL apart).
The alignment is the song's start (the first block within 50 dB of the loudest, in both) refined within 250 ms by the
low-passed cross-correlation — not tools/exp/common.aligned's search over the whole song, which a repeating song (EDM: a
bar every 1.9 s) can lock onto the wrong bar.
  python3 tools/rig/dropouts.py <prefix_song> [...]      (recordings in corpus/renders/rec, tools/rig/fetch_rec.py)"""
import os, sys, json
import numpy as np
from scipy.signal import sosfiltfilt
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'exp'))
import common as CM


def start_of(x, k):
    e = np.sqrt((x[: len(x) // k * k].reshape(-1, k) ** 2).mean(1) + 1e-20)
    return int(np.nonzero(20 * np.log10(e / e.max()) > -50)[0][0]) * k


def aligned_near(sid, pre, max_ms=250):
    """the original and the recording (mono), the song's start lined up and then refined within max_ms"""
    o = CM.C.load(sid, CM.SR, stereo=True).mean(1)
    r = CM.load_st(os.path.join(CM.S, f'{pre}_{sid}.opus')).mean(1)
    k = int(0.01 * CM.SR); a = start_of(r, k) - start_of(o, k)
    m = int(max_ms / 1000 * CM.SR); n = min(len(o), 8 * CM.SR)
    x = sosfiltfilt(CM.lp, r[max(0, a - m): max(0, a - m) + n + 2 * m]); y = sosfiltfilt(CM.lp, o[:n])
    c = np.correlate(x, y, 'valid') if len(x) >= len(y) else np.zeros(1)
    a = max(0, a - m) + int(np.argmax(c))
    seg = r[a: a + len(o)]
    return o[: len(seg)], seg


def check(name):
    pre, sid = name.split('_', 1)
    for k in (2, 1):                      # (two-letter prefixes first: jl_, jr_, jp_)
        if '_' in name[k:k + 1] and name[:k].isalpha():
            pre, sid = name[:k], name[k + 1:]
            break
    o, r = aligned_near(sid, pre)
    k = int(0.01 * CM.SR); n = min(len(o), len(r)) // k
    eo = 10 * np.log10((o[: n * k].reshape(n, k) ** 2).mean(1) + 1e-20)
    er = 10 * np.log10((r[: n * k].reshape(n, k) ** 2).mean(1) + 1e-20)
    gain = np.median((er - eo)[eo > eo.max() - 20])          # the recording's level against the original's where it is loud
    loud = eo > eo.max() - 30
    drop = loud & (er < eo + gain - 30)
    run = best = 0
    for d in drop:
        run = run + 1 if d else 0; best = max(best, run)
    zero = er < -120                                           # digital silence (the capture or the mixer gave exact zeros)
    zs, i = [], 0
    while i < n:
        if zero[i]:
            j = i
            while j < n and zero[j]: j += 1
            zs.append([round(i * 0.01, 2), (j - i) * 10]); i = j
        else: i += 1
    return {'rec': name, 'drop_share': round(float(drop[loud].mean()), 4), 'longest_drop_ms': best * 10, 'level_db': round(float(gain), 1),
            'zero_ms': sum(z[1] for z in zs), 'zeros': zs[:8]}


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    for a in sys.argv[1:]:
        try:
            print(json.dumps(check(a)))
        except Exception as e:
            print(json.dumps({'rec': a, 'error': str(e)[:200]}))
