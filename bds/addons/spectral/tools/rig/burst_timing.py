#!/usr/bin/env python3
"""When the drum bursts (one-shot playSound) sounded in real recordings of the songs, against the voices: each recording
is lined up with its original on the sound below 2 kHz (the voices: bass and partials), then every strong onset of the
original's 2.5-9 kHz band is matched to the recording's nearest one within 150 ms. A negative offset = the burst came early.

  python3 tools/rig/burst_timing.py --rec <dir of decoded recordings> --prefix m[,n,...] [--songs a,b] [--json out.json]

The recordings are what `audio export` published in a run's artifact (tools/rig/fetch_rec.py: <prefix>_<song>.opus). The
ceiling (prefix c) is the check of the method itself: its onsets come out at 0 ms.
"""
import argparse, json, os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfiltfilt
from scipy.ndimage import maximum_filter1d
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(UNIT, 'tools'))
import corpus as C
SR = 48000
LP = butter(8, 2000, 'low', fs=SR, output='sos')
HF = butter(4, [2500, 9000], 'band', fs=SR, output='sos')


def load_st(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64).reshape(-1, 2)


def lag_of(x, y):
    n = min(len(x), len(y))
    c = np.fft.irfft(np.fft.rfft(x[:n], 2 * n) * np.conj(np.fft.rfft(y[:n], 2 * n)))
    i = int(np.argmax(c))
    return i if i < n else i - 2 * n


def aligned(sid, rec):
    """original and recording (mono) on the same time line, lined up on what is under 2 kHz"""
    o = C.load(sid, SR, stereo=True).mean(1)
    m = rec.mean(1)
    k = int(0.01 * SR)
    e = np.sqrt((m[: len(m) // k * k].reshape(-1, k) ** 2).mean(1) + 1e-20)
    a = int(np.nonzero(20 * np.log10(e / e.max()) > -50)[0][0]) * k
    seg = m[a: a + len(o) + SR]
    L = lag_of(sosfiltfilt(LP, seg), sosfiltfilt(LP, o))
    if L >= 0:
        seg = seg[L: L + len(o)]; o = o[: len(seg)]
    else:
        o = o[-L:]; seg = seg[: len(o)]
    n = min(len(o), len(seg))
    return o[:n], seg[:n]


def hf_onsets(x):
    e = sosfiltfilt(HF, x) ** 2
    k = 120                                              # 2.5 ms
    le = 10 * np.log10(e[: len(e) // k * k].reshape(-1, k).mean(1) + 1e-14)
    d = np.convolve(np.diff(le, prepend=le[0]), np.ones(4), 'same')
    loc = maximum_filter1d(d, 41)
    thr = max(6.0, np.percentile(d, 99) * 0.5)
    return np.nonzero((d == loc) & (d > thr))[0] * 0.0025


def offsets(sid, path):
    o, r = aligned(sid, load_st(path))
    a, b = hf_onsets(o), hf_onsets(r)
    out = []
    for t in a:
        if len(b):
            j = int(np.argmin(np.abs(b - t)))
            if abs(b[j] - t) <= 0.15:
                out.append(round(float(b[j] - t) * 1000, 1))
    return out, len(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rec', required=True); ap.add_argument('--prefix', required=True); ap.add_argument('--songs'); ap.add_argument('--json')
    a = ap.parse_args()
    ids = a.songs.split(',') if a.songs else [s['id'] for s in C.manifest()['songs']]
    res = {}
    for pre in a.prefix.split(','):
        allo, per = [], {}
        for sid in ids:
            p = os.path.join(a.rec, f'{pre}_{sid}.opus')
            if not os.path.exists(p):
                continue
            o, n = offsets(sid, p)
            allo += o
            per[sid] = {'onsets': n, 'matched': len(o), 'median_ms': float(np.median(o)) if o else None}
        res[pre] = {'median_ms': float(np.median(allo)) if allo else None, 'matched': len(allo), 'songs': per}
        print(json.dumps({'prefix': pre, 'median_ms': res[pre]['median_ms'], 'matched': len(allo)}))
    if a.json:
        json.dump(res, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    main()
