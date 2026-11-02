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


def envelope(x):
    """the clicks' envelope: |high-passed| smoothed over 0.5 ms"""
    return np.convolve(np.abs(hp(x)), np.ones(24) / 24, 'same')


def onsets(x, min_gap_ms=15, rel=0.2):
    """each click's onset (s): the envelope's peaks (at least min_gap_ms apart, over rel of a typical peak), the onset where the
    envelope first reaches half of that peak going back from it (linear between samples: a tenth of a millisecond)"""
    from scipy.signal import find_peaks
    env = envelope(x)
    pk, pr = find_peaks(env, distance=int(min_gap_ms / 1000 * SR))
    if not len(pk):
        return []
    typical = np.percentile(env[pk], 95)
    pk = pk[env[pk] > rel * typical]
    out = []
    for i in pk:
        half = env[i] / 2
        j = i
        while j > 0 and env[j] > half:
            j -= 1
        a, b = env[j], env[j + 1]
        out.append((j + (half - a) / (b - a if b != a else 1)) / SR)
    return out


def template(x, t0, ms=8):
    a = int(t0 * SR) - int(0.002 * SR)
    return hp(x)[a: a + int(ms / 1000 * SR)]


def pair_distance(seg, tpl, t_first):
    """the k' (ms, 0.05 ms steps) for which the click at t_first plus the same click k' later best explains the segment (least
    squares, each click its own size)"""
    xh = hp(seg)
    n = len(xh)
    best = (-1.0, 0.0)
    def placed(at):
        y = np.zeros(n)
        i0 = int(np.floor(at)); fr = at - i0
        for k, w in ((i0, 1 - fr), (i0 + 1, fr)):
            if 0 <= k < n:
                m = min(len(tpl), n - k)
                y[k: k + m] += tpl[:m] * w
        return y
    a = placed(t_first * SR - int(0.002 * SR))
    for k20 in range(0, 1201):
        kms = k20 / 20
        b = placed(t_first * SR - int(0.002 * SR) + kms / 1000 * SR)
        A = np.vstack([a, b]).T
        coef, res, *_ = np.linalg.lstsq(A, xh, rcond=None)
        fit = 1 - ((xh - A @ coef) ** 2).sum() / max(1e-20, (xh ** 2).sum())
        if fit > best[0] and coef[1] > 0.3 * coef[0]:
            best = (fit, kms)
    return best[1], best[0]


def score_pairs(x):
    """the 8 pairs (k = 1, 2, 3, 5, 8, 13, 21, 34 ms, 700 ms apart): the first onset of each group; the last pair's first click
    (34 ms alone) is the template, as the phone played it"""
    ts = onsets(x, min_gap_ms=5, rel=0.15)
    groups = []
    for t in ts:
        if not groups or t - groups[-1][0] > 0.3:
            groups.append([t])
        else:
            groups[-1].append(t)
    if len(groups) < 8:
        return {'groups': len(groups)}
    groups = groups[-8:]
    tpl = template(x, groups[-1][0])
    out = []
    for k, g in zip([1, 2, 3, 5, 8, 13, 21, 34], groups):
        t0 = g[0]
        a = int((t0 - 0.005) * SR); b = int((t0 + 0.075) * SR)
        got, fit = pair_distance(x[a:b], tpl, 0.005)
        out.append({'sent_ms': k, 'heard_ms': got, 'error_ms': round(got - k, 2), 'fit': round(float(fit), 3)})
    return out


def score_pulse(x):
    ts = np.array(onsets(x, min_gap_ms=15, rel=0.2))
    if len(ts) < 10:
        return {'clicks': int(len(ts))}
    iv = np.diff(ts) * 1000
    # (a missed click shows as about twice the interval: counted, not used for the spread)
    ok = iv[np.abs(iv - 37) < 18]
    n = np.round((ts - ts[0]) / 0.037).astype(int)
    A = np.vstack([n, np.ones_like(n)]).T
    (slope, icpt), *_ = np.linalg.lstsq(A, ts, rcond=None)
    resid = (ts - (slope * n + icpt)) * 1000
    return {'clicks': int(len(ts)), 'of': 60, 'interval_ms_median': round(float(np.median(ok)), 3), 'interval_ms_sd': round(float(ok.std()), 3),
            'exact_share': round(float((np.abs(ok - 37) < 0.5).mean()), 3), 'interval_ms_min': round(float(ok.min()), 2), 'interval_ms_max': round(float(ok.max()), 2),
            'grid_ms': round(float(slope * 1000), 3), 'place_sd_ms': round(float(resid.std()), 3), 'place_max_ms': round(float(np.abs(resid).max()), 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder'); ap.add_argument('--json')
    a = ap.parse_args()
    res = {}
    for f in sorted(glob.glob(os.path.join(a.folder, '*'))):
        name = os.path.basename(f).rsplit('.', 1)[0]
        pre = name.split('_')[0]
        if pre in ('pp', 'p3', 'ap'):          # (p04: ap = the pairs with aliases)
            res[name] = {'pairs': score_pairs(load(f))}
        elif pre in ('pu', 'u3', 'au', 'a3'):  # (p04: au, a3 = the pulse with aliases, 2D and 3D)
            res[name] = {'pulse': score_pulse(load(f))}
        else:
            continue
        print(name, json.dumps(res[name], ensure_ascii=False), flush=True)
    if a.json:
        json.dump(res, open(a.json, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
