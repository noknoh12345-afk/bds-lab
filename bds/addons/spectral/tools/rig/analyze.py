#!/usr/bin/env python3
"""Measure a client from a recording of /spectral:calib (tools/rig/programs.json).

  python3 tools/rig/analyze.py <recording.wav> <program> [--json out.json] [--spec]
  python3 tools/rig/analyze.py <recording.wav> all          (a recording of /spectral:calib all, programs back to back)

<recording.wav>: what the client played, as recorded (48 kHz, stereo or mono; scrcpy / parec / pw-record).
Nothing is assumed about when the recording started: the sync clicks of the program (ticks 0, 4, 8, every 40, and the
end) give sample = offset + rate * tick, and every measurement is taken relative to that grid. --spec writes what was
measured into tools/emu/spec.json (status "measured", with the recording's name), which the emulator then uses.

What each program measures (see programs.py):
  voices      how many voices sound at once, and which go when there are more (oldest / quietest / newest refused)
  fade        fade shape (linear in amplitude or in dB) and the real duration of each requested fade (0 .. 400 ms)
  timing      when one tick's commands land: spread over ticks (jitter), setPitch against setVolume in the same tick
  seek        seekTo on a loop and on a one-shot started in the same tick: where it lands and how late
  pitch       setPitch 0.01 .. 10 on three base sounds: frequency error and the loudest spurious tone
  stereo      left-only and right-only files with is3D false: channel separation
  mixer       16 summed sines up to a sum past full scale: clip, limiter or compressor; ui / music / record levels
  throughput  16 .. 256 commands in one tick: do they land in the same block
  loud        setVolume 0.125 .. 8 on one sine, and a sound event with volume 4: can a sound be louder than its file
"""
import argparse, json, math, os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfiltfilt, hilbert

HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
SR = 48000
TICK = SR * 0.05
F_OSC = 1760.0
OSC_AMP = 0.9
sys.path.insert(0, HERE)
import programs as P


def load(path):
    info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=channels', '-of', 'json', path],
                                     check=True, capture_output=True, text=True).stdout)['streams'][0]
    ch = int(info['channels'])
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64).reshape(-1, ch)
    return x if ch == 2 else np.repeat(x, 2, 1)


def click_template():
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'sync.ogg'), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    t = np.frombuffer(raw, np.float32).astype(np.float64)
    nz = np.nonzero(np.abs(t) > 1e-3)[0]
    return t[nz[0]: nz[-1] + 1]


# ---------------------------------------------------------------- sync: tick -> sample
def find_clicks(x, tmpl):
    """matched filter on the mono mix (normalised by local energy so loud sines do not win) -> candidate times"""
    m = x.mean(1)
    n = len(tmpl)
    c = np.convolve(m, tmpl[::-1], mode='valid')
    e = np.sqrt(np.convolve(m * m, np.ones(n), mode='valid') + 1e-12) * np.sqrt((tmpl ** 2).sum())
    r = c / e
    thr = max(0.5, np.percentile(r, 99.9) * 0.6)
    cand = []
    i = 0
    while i < len(r):
        if r[i] > thr:
            j = min(len(r), i + int(0.01 * SR))
            k = i + int(np.argmax(r[i:j]))
            cand.append((k, r[k]))
            i = j
        else:
            i += 1
    return cand


def fit_grid(prog, cand):
    """which candidate is which click: anchor on the first three (4 ticks apart), predict the rest at the nominal 50 ms
    per tick (a client's frames and jitter move single clicks by up to a frame; a rate fitted on three clicks would wander),
    then one least-squares line through all matched clicks (its residuals are the one-shot start jitter)"""
    ticks = sorted({s[0] for s in prog['steps'] if s[1] == 'click'})
    times = np.array([c[0] for c in cand], float)
    best = None
    for i in range(len(times) - 2):
        d1, d2 = times[i + 1] - times[i], times[i + 2] - times[i + 1]
        if abs(d1 - 4 * TICK) < 0.45 * 4 * TICK and abs(d2 - 4 * TICK) < 0.45 * 4 * TICK and abs(times[i + 2] - times[i] - 8 * TICK) < 1.0 * TICK:
            best = i
            break
    # (a real client — redroid run 41068618513 — played the very first click of a run ~100 ms late, the sound loaded on its
    #  first play: the first three were 85 ms and 213 ms apart, and the anchor fell on the next program's clicks, 70 s on.
    #  So the anchor is also tried as the grid most clicks agree with: each candidate taken as each of the first clicks)
    def agree(a):
        return sum(1 for t in ticks if len(times) and np.min(np.abs(times - (a + TICK * t))) < 0.3 * TICK)
    a3 = float(np.median(times[best: best + 3] - TICK * np.array([0, 4, 8]))) if best is not None else None
    trials = [a3] if a3 is not None else []
    trials += [times[i] - TICK * k for i in range(len(times)) for k in ticks[:6]]
    scored = [(agree(a), -abs(a - trials[0]) if a3 is not None else 0, a) for a in trials]
    n_best, _, a_best = max(scored) if scored else (0, 0, None)
    if a_best is None or n_best < 3 or (a3 is not None and agree(a3) >= n_best):
        if best is None:
            raise SystemExit('analyze: the first three sync clicks (4 ticks apart) are not in the recording')
        a_best = a3
    a = float(a_best)
    b = TICK
    pairs = []
    for t in ticks:
        pred = a + b * t
        j = int(np.argmin(np.abs(times - pred)))
        if abs(times[j] - pred) < 0.45 * TICK:
            pairs.append((t, times[j]))
            if len(pairs) >= 4 and t - pairs[0][0] >= 40:     # a long enough baseline: follow a clock that runs off
                tt = np.array([p[0] for p in pairs]); ss = np.array([p[1] for p in pairs])
                b, a = np.polyfit(tt, ss, 1)
    tt = np.array([p[0] for p in pairs], float); ss = np.array([p[1] for p in pairs])
    b, a = np.polyfit(tt, ss, 1)
    res = ss - (a + b * tt)
    # (one click far off the line — the first one, late — is left out of the line and counted apart)
    late = np.abs(res) > max(3 * np.median(np.abs(res)) * 1.4826, 0.1 * TICK) if len(res) >= 6 else np.zeros(len(res), bool)
    if late.any() and (~late).sum() >= 4:
        b, a = np.polyfit(tt[~late], ss[~late], 1)
        res = ss - (a + b * tt)
    outliers = [{'tick': int(t), 'ms': round(float(r) / SR * 1000, 2)} for t, r, l in zip(tt, res, late) if l]
    res = res[~late] if late.any() and (~late).sum() >= 4 else res
    return {'offset': float(a), 'rate': float(b), 'clicks': len(pairs), 'of': len(ticks), 'late_clicks': outliers,
            'click_jitter_ms': float(np.std(res) / SR * 1000), 'click_resid_ms_max': float(np.max(np.abs(res)) / SR * 1000),
            'tick_ms': float(b / SR * 1000)}


def at(g, tick):
    return g['offset'] + g['rate'] * tick


def band(x, f0, bw):
    lo, hi = max(20.0, f0 - bw), min(SR / 2 - 100, f0 + bw)
    return sosfiltfilt(butter(4, [lo, hi], btype='band', fs=SR, output='sos'), x)


def env(x, f0, bw=80.0, smooth_ms=0.5):
    e = np.abs(hilbert(band(x, f0, bw)))
    if smooth_ms > 0:
        k = max(1, int(smooth_ms * SR / 1000))
        e = np.convolve(e, np.ones(k) / k, mode='same')
    return e


def step_time(sig, t0, t1, lo, hi):
    """first crossing of the midpoint between level lo and hi inside [t0, t1) (samples), sub-sample by interpolation"""
    mid = 0.5 * (lo + hi)
    seg = sig[int(t0): int(t1)]
    up = hi > lo
    idx = np.nonzero((seg >= mid) if up else (seg <= mid))[0]
    if not len(idx):
        return None
    i = idx[0]
    if i == 0:
        return float(t0)
    a, b = seg[i - 1], seg[i]
    fr = (mid - a) / (b - a) if b != a else 0.0
    return float(t0 + i - 1 + fr)


def cross_time(sig, t0, t1, lo, hi):
    """the first crossing of the midpoint from lo's side to hi's inside [t0, t1) (samples), sub-sample: unlike step_time it
    never answers the window's own start when the step came before it (run 41076646541's timing sat at the window edge)"""
    mid = 0.5 * (lo + hi)
    seg = sig[int(t0): int(t1)]
    tgt = (seg >= mid) if hi > lo else (seg <= mid)
    idx = np.nonzero(tgt[1:] & ~tgt[:-1])[0]
    if not len(idx):
        return None
    i = idx[0] + 1
    a, b = seg[i - 1], seg[i]
    fr = (mid - a) / (b - a) if b != a else 0.0
    return float(t0 + i - 1 + fr)


# ---------------------------------------------------------------- programs
def a_fade(x, prog, g):
    m = x.mean(1)
    e = env(m, 1000.0, 700.0, 0.1)          # wide band: the envelope can follow a few-ms fade (only this tone plays)
    out = []
    t = 10
    steps = [s for s in prog['steps'] if s[1] == 'fade']
    for s in steps:
        tk, d, v = s[0], s[3], s[4]
        t0 = at(g, tk) - 0.02 * SR
        t1 = at(g, tk) + (d + 0.12) * SR
        seg = e[int(t0): int(t1)]
        pre = np.median(e[int(t0 - 0.03 * SR): int(t0)])
        post = np.median(e[int(t1): int(t1 + 0.05 * SR)])
        # the 10 % and 90 % points of the move, and the shape between them
        lo, hi = (pre, post) if post > pre else (post, pre)
        p10 = pre + 0.1 * (post - pre); p90 = pre + 0.9 * (post - pre)
        a = step_time(e, t0, t1, pre, pre + 0.2 * (post - pre)) if True else None
        a10 = step_time(e, t0, t1, pre, 2 * p10 - pre)
        a90 = step_time(e, t0, t1, pre, 2 * p90 - pre)
        res = {'requested_s': d, 'from': round(float(pre), 4), 'to': round(float(post), 4)}
        if a10 is not None and a90 is not None and a90 > a10:
            dur = (a90 - a10) / 0.8 / SR
            res['measured_s'] = round(dur, 4)
            res['lands_ms'] = round(((a10 - 0.1 * dur * SR) - at(g, tk)) / SR * 1000, 2)
            if dur > 0.008:
                # shape: compare the middle of the move with amplitude-linear and dB-linear curves
                tm = int((a10 + a90) / 2)
                y = np.median(e[tm - 24: tm + 24])
                lin = 0.5 * (pre + post); db = math.sqrt(pre * post)
                res['mid'] = round(float(y), 4); res['mid_linear'] = round(lin, 4); res['mid_db'] = round(db, 4)
                res['shape'] = 'linear' if abs(y - lin) < abs(y - db) else 'db'
        out.append(res)
    shapes = [r['shape'] for r in out if 'shape' in r]
    longs = [r for r in out if 'measured_s' in r and r['requested_s'] >= 0.05]
    shorts = [r['measured_s'] for r in out if 'measured_s' in r and r['requested_s'] <= 0.002]
    return {'steps': out, 'shape': max(set(shapes), key=shapes.count) if shapes else None,
            'fade_min_ms': round(float(np.median(shorts)) * 1000, 2) if shorts else None,
            'duration_ratio': round(float(np.median([r['measured_s'] / r['requested_s'] for r in longs])), 3) if longs else None}


def a_timing(x, prog, g):
    m = x.mean(1)
    # voice A: 1000 <-> 1500 Hz every tick (instantaneous frequency); voice B: 3 kHz level 0.4 <-> 0.1 every tick
    za = hilbert(band(m, 1250.0, 450.0))
    inst = np.diff(np.unwrap(np.angle(za))) * SR / (2 * np.pi)
    k = int(0.0006 * SR)
    inst = np.convolve(inst, np.ones(k) / k, mode='same')
    eb = env(m, 3000.0, 150.0, 0.25)
    la, lb = [], []
    pa = [s for s in prog['steps'] if s[1] == 'pitch' and s[2] == 0]
    pb = [s for s in prog['steps'] if s[1] == 'vol' and s[2] == 1]
    for s in pa:
        tk = s[0]; tgt = s[3] * F_OSC
        lo, hi = (1000.0, 1500.0) if tgt > 1250 else (1500.0, 1000.0)
        # (each voice turns every tick, so the same direction comes every 100 ms: a window of ±0.9 tick holds one of them)
        t = cross_time(inst, at(g, tk) - 0.9 * TICK, at(g, tk) + 0.9 * TICK, lo, hi)
        if t is not None:
            la.append((tk, (t - at(g, tk)) / SR * 1000))
    hi_l = np.percentile(eb[int(at(g, pb[0][0])): int(at(g, pb[-1][0]))], 95)
    lo_l = np.percentile(eb[int(at(g, pb[0][0])): int(at(g, pb[-1][0]))], 5)
    for s in pb:
        tk = s[0]
        lo, hi = (lo_l, hi_l) if s[3] > 0.25 else (hi_l, lo_l)
        t = cross_time(eb, at(g, tk) - 0.9 * TICK, at(g, tk) + 0.9 * TICK, lo, hi)
        if t is not None:
            lb.append((tk, (t - at(g, tk)) / SR * 1000))
    A = np.array([v for _, v in la]); B = np.array([v for _, v in lb])
    da = dict(la); both = [da[t] - v for t, v in lb if t in da]
    return {'pitch_lands_ms': {'mean': round(float(A.mean()), 2), 'std': round(float(A.std()), 2), 'p5': round(float(np.percentile(A, 5)), 2), 'p95': round(float(np.percentile(A, 95)), 2), 'n': len(A)} if len(A) else None,
            'volume_lands_ms': {'mean': round(float(B.mean()), 2), 'std': round(float(B.std()), 2), 'p5': round(float(np.percentile(B, 5)), 2), 'p95': round(float(np.percentile(B, 95)), 2), 'n': len(B)} if len(B) else None,
            'pitch_minus_volume_ms': {'mean': round(float(np.mean(both)), 2), 'std': round(float(np.std(both)), 2)} if both else None}


def chirp_wave():
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'chirp.ogg'), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def locate(seg, wave, loop=True):
    """position (seconds) in `wave` that `seg` (a piece of it) comes from: cross-correlation"""
    n = len(seg)
    w = np.concatenate([wave, wave[:n]]) if loop else np.concatenate([wave, np.zeros(n)])
    c = np.fft.irfft(np.fft.rfft(w, 2 * len(w)) * np.conj(np.fft.rfft(seg, 2 * len(w))), 2 * len(w))[: len(wave)]
    k = int(np.argmax(c))
    return k / SR, float(c[k] / (np.linalg.norm(seg) * np.linalg.norm(wave[:n]) + 1e-12))


def a_seek(x, prog, g):
    m = x.mean(1)
    wave = chirp_wave()
    out = {'loop': [], 'oneshot': []}
    for s in prog['steps']:
        if s[1] != 'seek':
            continue
        tk, slot, p = s[0], s[2], s[3]
        kind = 'loop' if prog['slots'][slot][1] else 'oneshot'
        # 40 ms of sound from 60 ms after the tick (past any landing delay) -> where in the file it is
        t_meas = at(g, tk) + 0.06 * SR
        seg = m[int(t_meas): int(t_meas + 0.04 * SR)]
        pos, conf = locate(seg, wave, loop=True)
        # had it jumped at the tick exactly, it would now be at p + 60 ms: the difference is how late it jumped
        # (or, for a one-shot, where it really started)
        late = ((p + 0.06) - pos) * 1000
        late = (late + 500) % 1000 - 500
        out[kind].append({'tick': tk, 'target_s': p, 'found_s': round(pos - 0.06, 5), 'late_ms': round(late, 2), 'match': round(conf, 3)})
    def summ(v):
        L = [r['late_ms'] for r in v if r['match'] > 0.6]
        return {'late_ms_mean': round(float(np.mean(L)), 2), 'late_ms_std': round(float(np.std(L)), 2), 'n': len(L)} if L else None
    out['loop_summary'] = summ(out['loop']); out['oneshot_summary'] = summ(out['oneshot'])
    return out


def a_pitch(x, prog, g):
    m = x.mean(1)
    res = []
    t = 0
    for i, (ev, f0) in enumerate(P.BASES):
        for p in P.PITCHES:
            t0, t1 = at(g, prog['body'] + t + 2), at(g, prog['body'] + t + 9)
            seg = m[int(t0): int(t1)]
            n = len(seg)
            w = np.blackman(n)
            X = np.abs(np.fft.rfft(seg * w, 8 * n)) / (w.sum() / 2)
            f = np.fft.rfftfreq(8 * n, 1 / SR)
            want = f0 * p
            if want < 15 or want > SR / 2 - 200:
                res.append({'event': ev, 'pitch': p, 'expected_hz': round(want, 2), 'skip': 'outside 15 Hz .. Nyquist'})
                t += 10
                continue
            k = int(np.argmax(np.where(np.abs(f - want) < max(3.0, 0.03 * want), X, 0)))
            peak = X[k]
            if 0 < k < len(X) - 1 and X[k - 1] > 0 and X[k + 1] > 0:
                la, lb, lc = np.log(X[k - 1]), np.log(X[k]), np.log(X[k + 1])
                d = 0.5 * (la - lc) / (la - 2 * lb + lc) if (la - 2 * lb + lc) != 0 else 0.0
                fk = f[k] + d * (f[1] - f[0])
            else:
                fk = f[k]
            mask = np.abs(f - want) > max(10.0, 0.06 * want)
            spur = float(np.max(X[mask & (f > 15)])) if np.any(mask) else 0.0
            res.append({'event': ev, 'pitch': p, 'expected_hz': round(want, 2), 'found_hz': round(float(fk), 3),
                        'error_cents': round(1200 * math.log2(fk / want), 2) if fk > 0 else None,
                        'level': round(float(peak), 4), 'spur_db': round(20 * math.log10(spur / peak + 1e-12), 1)})
            t += 10
        t += 6
    return {'points': res}


def a_stereo(x, prog, g):
    b = prog['body']
    def lv(ch, f, t0, t1):
        return float(np.sqrt(np.mean(band(x[int(at(g, b + t0)): int(at(g, b + t1)), ch], f, 60.0) ** 2)))
    lL, lR = lv(0, 1000, 5, 25), lv(1, 1000, 5, 25)
    rL, rR = lv(0, 1500, 65, 85), lv(1, 1500, 65, 85)
    return {'left_file_L_dB': round(20 * math.log10(lL + 1e-12), 1), 'left_file_R_dB': round(20 * math.log10(lR + 1e-12), 1),
            'right_file_L_dB': round(20 * math.log10(rL + 1e-12), 1), 'right_file_R_dB': round(20 * math.log10(rR + 1e-12), 1),
            'separation_dB': round(min(20 * math.log10(lL / (lR + 1e-12) + 1e-12), 20 * math.log10(rR / (rL + 1e-12) + 1e-12)), 1)}


def a_mixer(x, prog, g):
    m = x.mean(1) if np.allclose(x[:, 0], x[:, 1]) else x[:, 0]
    b = prog['body']
    k = 16
    freqs = [300 * 1.17 ** i for i in range(k)]
    rows = []
    t = 5
    for v in P.LEVELS:
        seg = m[int(at(g, b + t + 3)): int(at(g, b + t + 9))]
        n = len(seg); w = np.hanning(n)
        X = np.abs(np.fft.rfft(seg * w)) / (w.sum() / 2)
        f = np.fft.rfftfreq(n, 1 / SR)
        on = np.zeros(len(f), bool)
        for fr in freqs:
            on |= np.abs(f - fr) < 15
        tone = math.sqrt(np.sum(X[on] ** 2) / 2)
        rest = math.sqrt(np.sum(X[~on & (f > 40)] ** 2) / 2)
        rows.append({'volume': v, 'sum_peak_in': round(v * OSC_AMP * k, 3), 'tone_rms': round(tone, 5), 'distortion_db': round(20 * math.log10(rest / (tone + 1e-12) + 1e-12), 1)})
        t += 10
    g0 = rows[0]['tone_rms'] / rows[0]['volume']
    for r in rows:
        r['gain_db'] = round(20 * math.log10(r['tone_rms'] / (r['volume'] * g0) + 1e-12), 2)
    t += 5
    cats = {}
    for j, c in enumerate(['ui', 'music', 'record']):
        seg = m[int(at(g, b + t + 2)): int(at(g, b + t + 8))]
        cats[c] = float(np.sqrt(np.mean(band(seg, 1000, 60) ** 2)))
        t += 15
    ref = cats['ui'] or 1e-12
    worst = min(r['gain_db'] for r in rows)
    kind = 'linear'
    if worst < -1.0:
        kind = 'clip' if max(r['distortion_db'] for r in rows) > -30 else 'limiter/compressor'
    return {'levels': rows, 'behaviour': kind, 'category_db': {c: round(20 * math.log10(v / ref + 1e-12), 1) for c, v in cats.items()}}


def a_loud(x, prog, g):
    """the 1 kHz level of every setVolume step of programs.loud against the first one: a client that follows a volume over 1
    gives +6 dB a doubling; one that stops at 1 stays flat from there. The second sound event (definition volume 4) against
    the first at the same setVolume: +12 dB if the definition's volume multiplies"""
    m = x.mean(1) if np.allclose(x[:, 0], x[:, 1]) else x[:, 0]
    b = prog['body']

    def level(t):
        seg = band(m[int(at(g, b + t + 3)): int(at(g, b + t + 9))], 1000, 60)
        return float(np.sqrt(np.mean(seg ** 2)))
    vols = P.LOUD
    a = [level(i * 10) for i in range(len(vols))]
    t = len(vols) * 10 + 5
    d = [level(t + i * 10) for i in range(4)]
    ref = a[0] or 1e-12
    rows = [{'volume': v, 'db': round(20 * math.log10(x_ / ref + 1e-12), 2), 'expected_db': round(20 * math.log10(v / vols[0]), 2)} for v, x_ in zip(vols, a)]
    rows4 = [{'volume': v, 'db_vs_osc': round(20 * math.log10(x_ / (a[i] or 1e-12) + 1e-12), 2)} for i, (v, x_) in enumerate(zip(vols[:4], d))]
    follows = [r['volume'] for r in rows if abs(r['db'] - r['expected_db']) <= 1.0]
    return {'set_volume': rows, 'follows_up_to': max(follows) if follows else None, 'definition_volume_4': rows4,
            'peak_dbfs': round(20 * math.log10(max(a + d) * math.sqrt(2) + 1e-12), 1)}


def a_voices(x, prog, g):
    m = x.mean(1)
    n = 128
    freqs = np.array([110.0 * 1.04 ** i for i in range(n)])
    def present(t0, t1):
        seg = m[int(t0): int(t1)]
        L = len(seg); w = np.blackman(L)
        X = np.abs(np.fft.rfft(seg * w, 4 * L)) / (w.sum() / 2)
        f = np.fft.rfftfreq(4 * L, 1 / SR)
        lv = np.array([X[np.abs(f - fr) < 0.01 * fr].max() if np.any(np.abs(f - fr) < 0.01 * fr) else 0 for fr in freqs])
        return lv
    b = prog['body']
    counts, last = [], None
    for i in range(n):
        lv = present(at(g, b + i * 5 + 1), at(g, b + i * 5 + 5))
        ref = np.max(lv[: i + 1])
        on = lv[: i + 1] > ref * 10 ** (-12 / 20)
        counts.append(int(on.sum()))
        last = on
    limit = int(max(counts))
    missing = [int(j) for j in np.nonzero(~last)[0]] if last is not None else []
    # second ramp: each new voice louder than the last
    t = b + n * 5 + 40
    lv = present(at(g, t + (n - 1) * 5 + 1), at(g, t + (n - 1) * 5 + 5))
    exp_lv = 0.012 * OSC_AMP * 10 ** (-0.3 * (n - 1 - np.arange(n)) / 20)
    rel = lv / (exp_lv * (lv[-1] / exp_lv[-1] if lv[-1] > 0 else 1))
    on2 = rel > 10 ** (-12 / 20)
    gone2 = [int(j) for j in np.nonzero(~on2)[0]]
    policy = None
    if limit < n:
        if gone2 and max(gone2) < n - limit + 5:
            policy = 'quietest (or oldest) goes'
        elif gone2 and min(gone2) >= limit - 5:
            policy = 'new ones are refused'
        if missing and min(missing) < n - limit + 5 and policy == 'quietest (or oldest) goes':
            policy = 'oldest goes' if gone2 == missing else policy
    return {'limit': limit, 'counts': counts, 'missing_at_128_equal': missing[:20], 'gone_at_128_rising': gone2[:20], 'policy': policy}


def a_throughput(x, prog, g):
    m = x.mean(1)
    b = prog['body']
    out = []
    t = 20
    for c in P.COUNTS:
        times = []
        t0 = int(at(g, b + t - 3)); t1 = int(at(g, b + t + 4))
        ref = None
        for i in range(c):
            f = P.TP_F0 + P.TP_DF * i
            e = env(m[t0:t1], f, 45.0, 0.5)
            L = len(e); tk = at(g, b + t) - t0
            lo = np.median(e[: int(1.5 * TICK)]); hi = np.median(e[-int(1.2 * TICK):])
            ref = ref or lo
            if lo < 0.3 * ref or hi < 1.4 * lo:           # not heard (over the voice limit) or no step: skip it
                continue
            st = step_time(e, tk - 0.9 * TICK, tk + 1.5 * TICK, lo, hi)
            if st is not None:
                times.append((st - tk) / SR * 1000)
        if times:
            tt = np.array(times) - np.median(times)
            out.append({'commands': c, 'spread_ms': round(float(np.percentile(tt, 95) - np.percentile(tt, 5)), 2),
                        'late_ms_max': round(float(tt.max()), 2), 'lands_ms': round(float(np.median(times)), 2), 'heard': len(times)})
        t += 20
    return {'counts': out}


ANALYSE = {'fade': a_fade, 'timing': a_timing, 'seek': a_seek, 'pitch': a_pitch, 'stereo': a_stereo, 'mixer': a_mixer,
           'voices': a_voices, 'throughput': a_throughput, 'loud': a_loud}


def analyse(x, prog):
    cand = find_clicks(x, click_template())
    g = fit_grid(prog, cand)
    out = {'grid': g}
    out[prog['id']] = ANALYSE[prog['id']](x, prog, g)
    return out


def spec_from(results, source):
    """measured values for tools/emu/spec.json"""
    s = {}
    note = f'measured: {source}'
    f = results.get('fade')
    if f and f.get('shape'):
        s['fade_shape'] = {'value': f['shape'], 'status': 'measured', 'note': note}
    if f and f.get('fade_min_ms') is not None:
        s['fade_min_ms'] = {'value': f['fade_min_ms'], 'status': 'measured', 'note': note}
    t = results.get('timing')
    if t and t.get('volume_lands_ms'):
        s['jitter_ms'] = {'value': t['volume_lands_ms']['std'], 'status': 'measured', 'note': note + ' (spread of setVolume landings over ticks)'}
    v = results.get('voices')
    if v and v['limit'] < 128:
        s['max_voices'] = {'value': v['limit'], 'status': 'measured', 'note': note + f" ({v.get('policy')})"}
    st = results.get('stereo')
    if st:
        s['stereo'] = {'value': 'keep' if st['separation_dB'] > 20 else 'mono', 'status': 'measured', 'note': note}
    mx = results.get('mixer')
    if mx:
        s['mix'] = {'value': {'linear': 'none', 'clip': 'clip'}.get(mx['behaviour'], 'limiter'), 'status': 'measured', 'note': note}
        s['category_gain_db'] = {'value': mx['category_db'], 'status': 'measured', 'note': note}
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('recording'); ap.add_argument('program')
    ap.add_argument('--json'); ap.add_argument('--spec', action='store_true')
    a = ap.parse_args()
    progs = {p['id']: p for p in json.load(open(os.path.join(HERE, 'programs.json')))}
    x = load(a.recording)
    results = {}
    if a.program == 'all':
        # /spectral:calib all plays the programs back to back, each one tick after the last ends: predict where each starts
        # from the first program's clicks at the nominal 50 ms, then fit each program on its own clicks (a lost tick between
        # programs does not shift the next one)
        cand = find_clicks(x, click_template())
        seq = P.build()
        offs, t = [], 0
        for p in seq:
            offs.append(t); t += p['ticks'] + 1
        first = fit_grid(seq[0], cand)
        for p, off in zip(seq, offs):
            t0 = first['offset'] + first['rate'] * off
            sub = [c for c in cand if t0 - 6 * TICK <= c[0] <= t0 + (p['ticks'] + 6) * TICK]
            try:
                g = fit_grid(progs[p['id']], sub)
                results[p['id']] = ANALYSE[p['id']](x, progs[p['id']], g)
                results[p['id']]['grid'] = {k: round(v, 3) if isinstance(v, float) else v for k, v in g.items()}
            except SystemExit as e:
                results[p['id']] = {'error': str(e)}
            except Exception as e:                      # one program that cannot be read does not lose the others
                results[p['id']] = {'error': f'{type(e).__name__}: {e}'}
    else:
        r = analyse(x, progs[a.program])
        results[a.program] = r[a.program]; results['grid'] = r['grid']
    txt = json.dumps(results, indent=1, ensure_ascii=False)
    if a.json:
        open(a.json, 'w').write(txt)
    print(txt if len(txt) < 6000 else txt[:6000] + '\n…')
    if a.spec:
        sys.path.insert(0, os.path.join(UNIT, 'tools', 'emu'))
        import client as E
        cur = json.load(open(E.SPEC_PATH)) if os.path.exists(E.SPEC_PATH) else {}
        cur.update(spec_from(results, os.path.basename(a.recording)))
        json.dump(cur, open(E.SPEC_PATH, 'w'), indent=1, ensure_ascii=False)
        print('spec ->', E.SPEC_PATH)


if __name__ == '__main__':
    main()
