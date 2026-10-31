#!/usr/bin/env python3
"""Was a recording whole? Its 10 ms blocks against the original's, after the global alignment (tools/exp/common.aligned): the
share of blocks where the original sounds (within 30 dB of its loudest block) and the recording is 30 dB or more under where it
should be (a drop: the device's audio or the game's mixer lost it), and the longest such run. A recording with drops is a
measurement to doubt, not a way of playing to judge (run 8: two arms of the same song 1.0 ViSQOL apart).
  python3 tools/rig/dropouts.py <prefix_song> [...]      (recordings in corpus/renders/rec, tools/rig/fetch_rec.py)"""
import os, sys, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'exp'))
import common as CM


def check(name):
    pre, sid = name.split('_', 1)
    for k in (2, 1):                      # (two-letter prefixes first: jl_, jr_, jp_)
        if '_' in name[k:k + 1] and name[:k].isalpha():
            pre, sid = name[:k], name[k + 1:]
            break
    o, r = CM.aligned(sid, pre)
    k = int(0.01 * CM.SR); n = min(len(o), len(r)) // k
    eo = 10 * np.log10((o[: n * k].reshape(n, k) ** 2).mean(1) + 1e-20)
    er = 10 * np.log10((r[: n * k].reshape(n, k) ** 2).mean(1) + 1e-20)
    gain = np.median((er - eo)[eo > eo.max() - 20])          # the recording's level against the original's where it is loud
    loud = eo > eo.max() - 30
    drop = loud & (er < eo + gain - 30)
    run = best = 0
    for d in drop:
        run = run + 1 if d else 0; best = max(best, run)
    return {'rec': name, 'drop_share': round(float(drop[loud].mean()), 4), 'longest_drop_ms': best * 10, 'level_db': round(float(gain), 1)}


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    for a in sys.argv[1:]:
        try:
            print(json.dumps(check(a)))
        except Exception as e:
            print(json.dumps({'rec': a, 'error': str(e)[:200]}))
