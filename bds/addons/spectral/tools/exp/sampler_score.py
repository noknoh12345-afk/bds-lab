#!/usr/bin/env python3
"""p01's recordings read against what was sent (tools/exp/sampler_plans.py): where each click landed, to a tenth of a millisecond.

  pairs (pp_*, p3_*): 8 pairs of clicks k = 1, 2, 3, 5, 8, 13, 21, 34 ms apart — each pair's segment of the recording is matched
        against the click, then two clicks k' apart for k' from 0 to 60 ms in 0.1 ms steps: the best k' is the distance heard
  pulse (pu_*, u3_*): 60 clicks 37 ms apart — each click found by matching (sub-sample by a parabola); the intervals against 37 ms
        and the spread of every click's place against a straight line (a grid that started anywhere and runs at any rate)
The click is the bank's own (rp/sounds/spectral/i/click/0.ogg) read the way the phone reads it (24 kHz).

  python3 tools/exp/sampler_score.py <folder with the run's recordings: pp_b4.*, pu_b4.* …> [--json out.json]"""
import argparse, glob, json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
SR = 48000


def load(path):
    import subprocess
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def click():
    y = load(os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'i', 'click', '0.ogg'))
    y = y[int(0.6 * SR):]                                   # past the lead
    i0 = int(np.argmax(np.abs(y) > np.abs(y).max() * 0.05))
    return y[max(0, i0 - 24): i0 + int(0.008 * SR)]


def hp(x):
    from scipy.signal import butter, sosfiltfilt
    return sosfiltfilt(butter(4, 800, 'hp', fs=SR, output='sos'), x)


def find_clicks(x, tpl, min_gap_ms=20, rel=0.25):
    """the click times (s) in x: peaks of the normalised match with the template, refined by a parabola"""
    from scipy.signal import fftconvolve
    xh, th = hp(x), hp(tpl)
    c = fftconvolve(xh, th[::-1], 'valid')
    e = np.sqrt(fftconvolve(xh ** 2, np.ones(len(th)), 'valid')) * np.sqrt((th ** 2).sum()) + 1e-12
    r = c / e
    thr = rel * r.max()
    out, gap = [], int(min_gap_ms / 1000 * SR)
    i = 0
    while i < len(r):
        if r[i] > thr:
            j = i + int(np.argmax(r[i: i + gap]))
            if 0 < j < len(r) - 1:
                a, b, cc = r[j - 1], r[j], r[j + 1]
                d = 0.5 * (a - cc) / (a - 2 * b + cc) if (a - 2 * b + cc) != 0 else 0
                out.append((j + d) / SR)
            i = j + gap
        else:
            i += 1
    return out


def pair_distance(seg, tpl):
    """the k' (ms) for which a click plus the same click k' later best matches the segment"""
    xh, th = hp(seg), hp(tpl)
    best = (-1, 0, 0)
    n = len(th) + int(0.07 * SR)
    for k10 in range(0, 601):
        k = k10 / 10
        sh = k / 1000 * SR
        two = np.zeros(n)
        two[: len(th)] += th
        # the second click k later, at a fraction of a sample by linear interpolation
        i0 = int(np.floor(sh)); fr = sh - i0
        two[i0: i0 + len(th)] += th * (1 - fr)
        two[i0 + 1: i0 + 1 + len(th)] += th * fr
        from scipy.signal import fftconvolve
        c = fftconvolve(xh, two[::-1], 'valid')
        e = np.sqrt(fftconvolve(xh ** 2, np.ones(len(two)), 'valid')) * np.sqrt((two ** 2).sum()) + 1e-12
        r = (c / e).max() if len(c) else 0
        if r > best[0]:
            best = (r, k, 0)
    return best[1], best[0]


def score_pairs(x, tpl):
    """the 8 pairs: their segments are where the recording's clicks come in twos (or overlap), 700 ms apart"""
    ts = find_clicks(x, tpl, min_gap_ms=300, rel=0.3)        # one hit a pair (the first, or the overlapped two)
    out = []
    for k, t in zip([1, 2, 3, 5, 8, 13, 21, 34], ts[:8]):
        a = int((t - 0.01) * SR); b = int((t + 0.09) * SR)
        got, r = pair_distance(x[a:b], tpl)
        out.append({'sent_ms': k, 'heard_ms': got, 'error_ms': round(got - k, 2), 'match': round(float(r), 3)})
    return out


def score_pulse(x, tpl):
    ts = np.array(find_clicks(x, tpl, min_gap_ms=20, rel=0.3))
    if len(ts) < 10:
        return {'clicks': int(len(ts))}
    iv = np.diff(ts) * 1000
    n = np.arange(len(ts))
    A = np.vstack([n, np.ones_like(n)]).T
    (slope, icpt), *_ = np.linalg.lstsq(A, ts, rcond=None)
    resid = (ts - (slope * n + icpt)) * 1000
    return {'clicks': int(len(ts)), 'interval_ms_mean': round(float(iv.mean()), 3), 'interval_ms_sd': round(float(iv.std()), 3),
            'interval_ms_min': round(float(iv.min()), 2), 'interval_ms_max': round(float(iv.max()), 2),
            'grid_ms': round(float(slope * 1000), 3), 'place_sd_ms': round(float(resid.std()), 3), 'place_max_ms': round(float(np.abs(resid).max()), 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder'); ap.add_argument('--json')
    a = ap.parse_args()
    tpl = click()
    res = {}
    for f in sorted(glob.glob(os.path.join(a.folder, '*'))):
        name = os.path.basename(f).rsplit('.', 1)[0]
        pre = name.split('_')[0]
        if pre in ('pp', 'p3'):
            res[name] = {'pairs': score_pairs(load(f), tpl)}
        elif pre in ('pu', 'u3'):
            res[name] = {'pulse': score_pulse(load(f), tpl)}
        else:
            continue
        print(name, json.dumps(res[name], ensure_ascii=False), flush=True)
    if a.json:
        json.dump(res, open(a.json, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
