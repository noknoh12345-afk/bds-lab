#!/usr/bin/env python3
"""Does a recording follow the original's loudness from moment to moment? Its 10 ms block levels in four speech bands
(250 Hz-4 kHz, an octave each) against the original's, the song's start lined up as tools/rig/dropouts.py does:
  env_corr   the correlation of the two level curves (dB, each floored 40 dB under its loudest block), the mean of the bands;
             a sound held at its last level while the voice moved on (a followed talker's handover) lowers it
  over_share the share of blocks (where the original is within 45 dB of its loudest) the recording is 12 dB or more over where
             it should be (its median gain where the original is loud): a sound that went on after the voice stopped
  under_share the same, 12 dB or more under: a sound missing
Compare recordings of one run made the same way but for one thing (a walking talker's path is the same in each arm of run 17;
the distance and the side change the level on their own, so the numbers mean little against a talker standing still).
  python3 tools/rig/envelope.py <prefix_song> [...]      (recordings in corpus/renders/rec or SPECTRAL_REC; tools/rig/fetch_rec.py)"""
import os, sys, json
import numpy as np
from scipy.signal import butter, sosfiltfilt
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'exp'))
import common as CM
from dropouts import aligned_near

BANDS = [(250, 500), (500, 1000), (1000, 2000), (2000, 4000)]


def levels(x, k):
    n = len(x) // k
    return 10 * np.log10((x[: n * k].reshape(n, k) ** 2).mean(1) + 1e-20)


def split(name):
    for k in (2, 1):                      # (two-letter prefixes first: vh_, ws_)
        if name[k:k + 1] == '_' and name[:k].isalpha():
            return name[:k], name[k + 1:]
    return name.split('_', 1)


def check(name):
    pre, sid = split(name)
    o, r = aligned_near(sid, pre)
    k = int(0.01 * CM.SR)
    corr, over, under = [], [], []
    for lo, hi in BANDS:
        sos = butter(4, [lo, hi], 'band', fs=CM.SR, output='sos')
        eo, er = levels(sosfiltfilt(sos, o), k), levels(sosfiltfilt(sos, r), k)
        n = min(len(eo), len(er)); eo, er = eo[:n], er[:n]
        a, b = np.maximum(eo, eo.max() - 40), np.maximum(er, er.max() - 40)
        corr.append(float(np.corrcoef(a, b)[0, 1]))
        live = eo > eo.max() - 45
        gain = np.median((er - eo)[eo > eo.max() - 20])
        d = er - eo - gain
        over.append(float((d[live] >= 12).mean())); under.append(float((d[live] <= -12).mean()))
    return {'rec': name, 'env_corr': round(float(np.mean(corr)), 4), 'bands': [round(c, 3) for c in corr],
            'over_share': round(float(np.mean(over)), 4), 'under_share': round(float(np.mean(under)), 4)}


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    for a in sys.argv[1:]:
        try:
            print(json.dumps(check(a)))
        except Exception as e:
            print(json.dumps({'rec': a, 'error': str(e)[:200]}))
