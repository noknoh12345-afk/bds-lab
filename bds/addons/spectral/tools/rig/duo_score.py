#!/usr/bin/env python3
"""Recordings of several talkers at once (live streams that follow armor stands, each its own voice; run 27): each talker's
original placed where the recording has it, and against that
  - ViSQOL of the recording against the originals mixed (each at the level its talker had alone, from that talker's solo
    recording) and against the solo recordings mixed (the same talkers heard one at a time on the same phone: what sharing the
    phone's 32 sounds costs on top of the 3D itself)
  - for each talker, where they speak alone (10 dB over the others, within 25 dB of their loudest) — their level against alone and
    the voice lost (50 ms blocks 20 dB under their own level there, runs of 100 ms or more: tools/rig/gaps.py)
  - with --halves, each talker's own stretch scored on its own (a conversation: one after the other)
A talker: <song id>[@<from>-<to>+<at>] (seconds of the original, placed at that second of the stream; default all of it at 0),
=<solo recording name> after it for its solo. Recordings in corpus/renders/rec (SPECTRAL_REC), the originals from the corpus.
  python3 tools/rig/duo_score.py <recording name> <talker>[=<solo>] <talker>[=<solo>] ... [--halves]   → a JSON line"""
import os, sys, json
import numpy as np
from scipy.signal import sosfiltfilt, fftconvolve
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'exp'))
import common as CM

SR = CM.SR
K = int(0.05 * SR)


def rec(name):
    return CM.load_st(os.path.join(CM.S, name + '.opus')).mean(1)


def placed(spec):
    """'id@a-b+c' → (id, the stream's signal: the original's a..b seconds at c, zeros elsewhere)"""
    sid, _, rest = spec.partition('@')
    o = CM.C.load(sid, SR, stereo=True).mean(1)
    if not rest:
        return sid, o
    ab, _, c = rest.partition('+')
    a, b = (float(x) for x in ab.split('-'))
    seg = o[int(a * SR): int(b * SR)]
    out = np.zeros(int(float(c or 0) * SR) + len(seg))
    out[len(out) - len(seg):] = seg
    return sid, out


def lag_in(r, c):
    """where c starts in r (samples; r[t] ~ c[t - lag]): the low-passed cross-correlation's peak"""
    x = sosfiltfilt(CM.lp, r); y = sosfiltfilt(CM.lp, c)
    cc = fftconvolve(x, y[::-1], 'full')        # index i ↔ lag i - (len(y) - 1)
    return int(np.argmax(cc)) - (len(y) - 1)


def at(sig, lag, n):
    """sig shifted to start at `lag` in a signal n long"""
    out = np.zeros(n)
    a, b = max(0, lag), min(n, lag + len(sig))
    if b > a:
        out[a:b] = sig[a - lag: b - lag]
    return out


def edb(x):
    m = len(x) // K
    return 10 * np.log10((x[: m * K].reshape(m, K) ** 2).mean(1) + 1e-20)


def solo_gain(name, comp):
    """a talker's solo recording: its level against the original (median dB over the loud blocks) and the recording lined up with
    the original's own time (index 0 = the stream's start)"""
    r = rec(name); L = lag_in(r, comp)
    a = at(comp, 0, len(comp)); s = at(r, -L, len(comp))           # (the solo recording on the stream's timeline)
    ea, es = edb(a), edb(s)
    loud = ea > ea.max() - 25
    return float(np.median((es - ea)[loud])), s


def lost(er, ee, mine):
    """blocks where a talker speaks alone and the recording is 20 dB or more under their own median level there → runs ≥ 100 ms"""
    gain = float(np.median((er - ee)[mine])) if mine.any() else 0.0
    bad = mine & (er < ee + gain - 20)
    runs, i, n = [], 0, len(bad)
    while i < n:
        if bad[i]:
            j = i
            while j < n and bad[j]: j += 1
            if (j - i) * 50 >= 100: runs.append([round(i * 0.05, 2), (j - i) * 50])
            i = j
        else: i += 1
    return gain, runs


def score(name, talkers, halves=False):
    from metrics import visqol_score
    r = rec(name); n = len(r)
    comps, refs_o, refs_s, info = [], [], [], []
    for t in talkers:
        spec, _, solo = t.partition('=')
        sid, c = placed(spec)
        L = lag_in(r, c)
        g_db, s = (0.0, None)
        if solo:
            g_db, s = solo_gain(solo, c)
        g = 10 ** (g_db / 20)
        comps.append(at(c, L, n) * g)
        refs_o.append(comps[-1])
        if s is not None:
            refs_s.append(at(s, L, n))
        info.append({'talker': spec, 'start_s': round(L / SR, 3), 'solo': solo or None, 'solo_db': round(g_db, 2) if solo else None})
    ref = sum(refs_o)
    # (the stretch any talker is in)
    a = max(0, min(int(x['start_s'] * SR) for x in info)); b = min(n, max(int(x['start_s'] * SR) + len(placed(t.partition('=')[0])[1]) for x, t in zip(info, talkers)))
    out = {'rec': name, 'seconds': round((b - a) / SR, 2), 'talkers': info}
    out['visqol_vs_originals'] = round(float(visqol_score(ref[a:b], r[a:b])), 4)
    if len(refs_s) == len(talkers):
        out['visqol_vs_solos'] = round(float(visqol_score(sum(refs_s)[a:b], r[a:b])), 4)
    er = edb(r); es = [edb(c) for c in comps]
    tot = 10 * np.log10(sum(10 ** (e / 10) for e in es) + 1e-20)
    for j, (x, e) in enumerate(zip(info, es)):
        others = 10 * np.log10(sum(10 ** (f / 10) for k, f in enumerate(es) if k != j) + 1e-20) if len(es) > 1 else np.full_like(e, -200)
        mine = (e > e.max() - 25) & (e > others + 10)
        gain, runs = lost(er, e, mine)
        x.update({'alone_ms': int(mine.sum()) * 50, 'level_db': round(gain, 2), 'lost_ms': sum(q[1] for q in runs), 'lost': runs[:10]})
        if halves:
            # (this talker's own stretch: where its expected level is within 25 dB of its loudest, the others 10 dB under)
            idx = np.nonzero(mine)[0]
            if len(idx):
                p0, p1 = idx[0] * K, (idx[-1] + 1) * K
                x['visqol_own'] = round(float(visqol_score(comps[j][p0:p1], r[p0:p1])), 4)
                if len(refs_s) == len(talkers):
                    x['visqol_own_vs_solo'] = round(float(visqol_score(refs_s[j][p0:p1], r[p0:p1])), 4)
    _ = tot
    return out


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    try:
        print(json.dumps(score(args[0], args[1:], '--halves' in sys.argv)))
    except Exception as e:
        print(json.dumps({'rec': args[0] if args else None, 'error': str(e)[:300]}))
