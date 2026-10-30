#!/usr/bin/env python3
"""Spectral Player analysis v2 (research version; tools/spectral.py stays the shipped v1).

What changes against v1 (measured with tools/eval.py on corpus/, emulator numbers):
  * partial TRACKS first (no voice limit), then a choice of which tracks become sine voices: tracks shorter than
    `min_frames` and tracks that do not fit the voice budget are not synthesised as sines but go to the noise layer.
    v1 gave 51-85 % of voice segments a life of <= 2 frames (blips with attacks): the flicker that ViSQOL punishes.
  * voices are given whole tracks (interval scheduling by salience): no pre-emption cuts.
  * the noise layer has configurable bands (24 Bark bands by default) and keeps the energy of every peak that is not
    a chosen track (no 0.5 cut below 720 Hz).
The engine rules (one setPitch + one fade per voice per tick, attacks 12 ms, 50 ms linear fades) are unchanged, so the
v1 renderer and the add-on's v1 tick rules play this data.
"""
import math, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spectral as S

BARK_EDGES = [100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480, 1720, 2000, 2320, 2700, 3150, 3700, 4400,
              5300, 6400, 7700, 9500, 12000, 15500, 19000]          # 24 bands


def track(peaks, max_dev_cents=60.0, gap=1):
    """McAulay-Quatieri style tracking without a voice limit.
    peaks: per frame [(f, a, bin)] -> list of tracks {k0, f: [...], a: [...]} (a == 0 inside bridged gaps)."""
    F = len(peaks)
    active = []          # dicts: k0, f, a, miss
    done = []
    for k in range(F):
        pk = sorted(peaks[k], key=lambda t: -t[1])
        used = [False] * len(pk)
        # continue the loudest tracks first
        for tr in sorted(active, key=lambda t: -max(t['a'][-1], 1e-12)):
            lf = tr['lf']
            dev = max(max_dev_cents, S.cents(lf + 9.0, lf))
            best, bc = -1, 1e9
            la = tr['la']
            for i, (f, a, _) in enumerate(pk):
                if used[i]:
                    continue
                dc = abs(S.cents(f, lf))
                if dc > dev:
                    continue
                cost = dc + 3.0 * abs(20 * math.log10(a / la))
                if cost < bc:
                    best, bc = i, cost
            if best >= 0:
                used[best] = True
                f, a, _ = pk[best]
                tr['f'].append(f); tr['a'].append(a); tr['lf'] = f; tr['la'] = a; tr['miss'] = 0
            else:
                tr['miss'] += 1
                tr['f'].append(tr['lf']); tr['a'].append(0.0)
        still = []
        for tr in active:
            if tr['miss'] > gap:
                # drop the trailing bridged frames
                n = tr['miss']
                del tr['f'][-n:]; del tr['a'][-n:]
                done.append(tr)
            else:
                still.append(tr)
        active = still
        for i, (f, a, _) in enumerate(pk):
            if not used[i]:
                active.append({'k0': k, 'f': [f], 'a': [a], 'lf': f, 'la': a, 'miss': 0})
    for tr in active:
        if tr['miss']:
            n = tr['miss']; del tr['f'][-n:]; del tr['a'][-n:]
        done.append(tr)
    # fill bridged gaps (a == 0 between two real frames) by interpolation: a held partial, not a blip
    for tr in done:
        a = tr['a']
        for i in range(1, len(a) - 1):
            if a[i] == 0.0 and a[i - 1] > 0 and a[i + 1] > 0:
                a[i] = math.sqrt(a[i - 1] * a[i + 1])
    return [t for t in done if len(t['a'])]


def choose(tracks, F, n_voices, min_frames=3, margin=1):
    """weighted interval scheduling (greedy by salience): which tracks become sine voices, and on which voice."""
    cand = []
    for t in tracks:
        n = len(t['a'])
        if n < min_frames:
            continue
        f = np.array(t['f']); a = np.array(t['a'])
        sal = float((a * S.a_weight(f)).sum())
        cand.append((sal, t))
    cand.sort(key=lambda c: -c[0])
    busy = [np.zeros(F + margin + 1, bool) for _ in range(n_voices)]
    placed = []
    for sal, t in cand:
        k0, k1 = t['k0'], t['k0'] + len(t['a'])
        lo, hi = max(0, k0 - margin), min(F, k1 + margin)
        for v in range(n_voices):
            if not busy[v][lo:hi].any():
                busy[v][lo:hi] = True
                placed.append((v, t))
                break
    return placed


def to_arrays(placed, F, n_voices):
    fq = np.zeros((F, n_voices)); am = np.zeros((F, n_voices)); att = np.zeros((F, n_voices), bool)
    for v, t in placed:
        k0 = t['k0']
        for i, (f, a) in enumerate(zip(t['f'], t['a'])):
            fq[k0 + i, v] = f; am[k0 + i, v] = a
        # attack at the start unless it swells (grows for the next frame)
        a = t['a']
        if not (len(a) > 1 and a[1] > a[0] * 1.6):
            att[k0, v] = True
        # a jump of +9 dB inside a track is an attack too (a re-struck note)
        for i in range(1, len(a)):
            if a[i - 1] > 0 and a[i] > a[i - 1] * 2.8:
                att[k0 + i, v] = True
    return fq, am, att


def residual_noise(spectra, fq, am, n_frames, edges):
    nb = len(edges) - 1
    out = np.zeros((n_frames, nb))
    for (pw, nfft, sw2, ml, flo, fhi) in spectra:
        binhz = S.SR / nfft
        scale = 2.0 / (nfft * sw2)
        for k in range(n_frames):
            row = pw[k].copy()
            for v in np.nonzero(am[k] > 0)[0]:
                b = int(round(fq[k, v] / binhz))
                row[max(b - ml, 0): b + ml + 1] = 0.0
            for bi in range(nb):
                blo, bhi = max(edges[bi], flo), min(edges[bi + 1], fhi)
                if bhi <= blo:
                    continue
                out[k, bi] += row[int(blo / binhz):int(bhi / binhz)].sum() * scale
    return np.sqrt(np.maximum(out, 0.0))


def analyse(x, n_voices=48, min_frames=3, edges=BARK_EDGES, gap=1, bursts=True):
    n_frames = int(math.ceil(len(x) / S.HOP)) + 1
    peaks, spectra = S.find_peaks(x, n_frames)
    tracks = track(peaks, gap=gap)
    placed = choose(tracks, n_frames, n_voices, min_frames)
    fq, am, att = to_arrays(placed, n_frames, n_voices)
    order = np.argsort(-(am ** 2).sum(0), kind='stable')
    fq, am, att = fq[:, order], am[:, order], att[:, order]
    nz = residual_noise(spectra, fq, am, n_frames, edges)
    ev = S.onsets(x, n_frames) if bursts else []
    for (k, sub, b, a) in ev:
        lo, hi = S.BURST_BANDS[b]
        e_burst = (a ** 2) * 0.35
        for bi in range(len(edges) - 1):
            if edges[bi] < hi and edges[bi + 1] > lo and k < n_frames:
                nz[k, bi] = math.sqrt(max(nz[k, bi] ** 2 - e_burst / 3, 0))
    return fq, am, att, nz, ev, {'tracks': len(tracks), 'placed': len(placed)}


# ------------------------------------------------------------------ renderer (v1 tick rules, any noise bands)
_noise_cache = {}


def noise_loop(lo, hi, sr, b):
    key = (lo, hi, sr, b)
    if key not in _noise_cache:
        y = S.band_noise(lo, hi, sr, 2.0, 100 + b)
        _noise_cache[key] = y
    return _noise_cache[key]


def song_gain(am, nz, gain_db=0.0):
    """the encoder's normalisation (tools/spectral.py convert): loudest frame (0.55 x sum of voice amps + noise) -> 0.9.
    It matters beyond level: the engine never takes a voice below SILENT (1e-4), so the gain sets how far under the music
    that floor of idle voices sits."""
    peak = max(1e-9, float(np.max(am.sum(1) * 0.55 + nz.sum(1))))
    return (0.9 / peak) * 10 ** (gain_db / 20)


def render(fq, am, att, nz, events, edges, sr=48000, normalise=True):
    """S.render with arbitrary noise bands (values are scaled and quantised as the encoder would)."""
    if normalise:
        g = song_gain(am, nz)
        am = am * g; nz = nz * g
        events = [(k, sub, b, a * g) for (k, sub, b, a) in events]
    q = np.vectorize(lambda a: S.amp_val(S.amp_code(a)))
    qn = np.vectorize(lambda a: S.nz_val(S.nz_code(a)))
    am_q = q(am); nz_q = qn(nz)
    fq_q = np.where(am_q > 0, np.vectorize(lambda f: S.pitch_val(S.pitch_code(f)) if f > 0 else 0.0)(fq), 0.0)
    y = S.render(fq_q, am_q, att, np.zeros((len(am), 1)), events, sr=sr, noise_on=False)
    F = len(am); tick = sr // S.FPS; total = len(y)
    for b in range(len(edges) - 1):
        if not np.any(nz_q[:, b] > 0):
            continue
        loop = noise_loop(edges[b], edges[b + 1], sr, b)
        sig = np.tile(loop, int(np.ceil(total / len(loop))))[:total] / S.NOISE_RMS
        env = np.full(total, S.SILENT); cur = S.SILENT
        for T in range(F):
            tgt = max(nz_q[T + 1, b] if T + 1 < F else 0.0, S.SILENT)
            s0 = T * tick; n = int(S.FADE_SMOOTH * sr)
            env[s0:s0 + n] = np.linspace(cur, tgt, n + 1)[1:][: max(0, min(n, total - s0))]
            env[s0 + n:] = tgt; cur = tgt
        y += sig * env
    return y


# ------------------------------------------------------------------ v2b: the noise layer fills the band-energy deficit
def erb_edges(n_bands, lo=40.0, hi=20000.0):
    """band edges equally spaced on the ERB-rate scale (Glasberg & Moore)"""
    e = lambda f: 21.4 * math.log10(1 + 0.00437 * f)
    ie = lambda z: (10 ** (z / 21.4) - 1) / 0.00437
    z0, z1 = e(lo), e(hi)
    return [round(ie(z0 + (z1 - z0) * i / n_bands), 1) for i in range(n_bands + 1)]


def band_power(x, edges, n_frames, win=4410, nfft=8192):
    """mean power of each band at frame k (Hann window of `win` samples centred on k * HOP), shape (n_frames, bands)"""
    w = np.hanning(win)
    pad = win // 2
    xp = np.pad(x, (pad, pad + S.HOP * n_frames + win))
    idx = np.arange(n_frames)[:, None] * S.HOP + np.arange(win)[None, :]
    X = np.fft.rfft(xp[idx] * w[None, :], n=nfft, axis=1)
    P = (np.abs(X) ** 2) * 2.0 / (nfft * (w * w).sum())       # one-sided power per bin: sum over bins = variance
    f = np.fft.rfftfreq(nfft, 1 / S.SR)
    out = np.zeros((n_frames, len(edges) - 1))
    for b in range(len(edges) - 1):
        m = (f >= edges[b]) & (f < edges[b + 1])
        if m.any():
            out[:, b] = P[:, m].sum(1)
    return out


def analyse_v2b(x, n_voices=48, min_frames=3, n_bands=24, alpha=1.0, bursts=False):
    n_frames = int(math.ceil(len(x) / S.HOP)) + 1
    peaks, spectra = S.find_peaks(x, n_frames)
    tracks = track(peaks)
    placed = choose(tracks, n_frames, n_voices, min_frames)
    fq, am, att = to_arrays(placed, n_frames, n_voices)
    order = np.argsort(-(am ** 2).sum(0), kind='stable')
    fq, am, att = fq[:, order], am[:, order], att[:, order]
    edges = erb_edges(n_bands)
    # what the sine voices will put in each band, as the engine plays them (ramps, held pitch, idle floor)
    part = S.render(fq, am, att, np.zeros((n_frames, 1)), [], sr=S.SR, noise_on=False, bursts_on=False)
    Eo = band_power(x, edges, n_frames)
    Ep = band_power(part[: len(x)], edges, n_frames)
    nz = np.sqrt(np.maximum(Eo - Ep, 0.0)) * alpha
    ev = S.onsets(x, n_frames) if bursts else []
    return fq, am, att, nz, ev, edges


# ------------------------------------------------------------------ v2c: SMS-style stochastic residual (all peaks removed)
def stochastic_residual(spectra, peaks, n_frames, edges, low_cut=0.5, low_cut_below=720.0):
    """band RMS of the spectrum with the main lobe of EVERY detected peak removed: the tonal energy of tracks that are
    not synthesised is dropped, never turned into noise (noise in place of a tone is what hurt v2b)"""
    nb = len(edges) - 1
    out = np.zeros((n_frames, nb))
    for (pw, nfft, sw2, ml, flo, fhi) in spectra:
        binhz = S.SR / nfft
        scale = 2.0 / (nfft * sw2)
        for k in range(n_frames):
            row = pw[k].copy()
            for (f, a, bi) in peaks[k]:
                b = int(round(f / binhz))
                row[max(b - ml, 0): b + ml + 1] = 0.0
            for bi in range(nb):
                blo, bhi = max(edges[bi], flo), min(edges[bi + 1], fhi)
                if bhi <= blo:
                    continue
                out[k, bi] += row[int(blo / binhz):int(bhi / binhz)].sum() * scale
    out = np.sqrt(np.maximum(out, 0.0))
    for bi in range(nb):
        if edges[bi + 1] <= low_cut_below:
            out[:, bi] *= low_cut
    return out


def analyse_v2c(x, n_voices=48, min_frames=3, edges=None, noise_from=0.0, bursts=False, noise=True):
    edges = edges or [180, 360, 720, 1440, 2880, 5000, 8000, 12000, 17000]
    n_frames = int(math.ceil(len(x) / S.HOP)) + 1
    peaks, spectra = S.find_peaks(x, n_frames)
    tracks = track(peaks)
    placed = choose(tracks, n_frames, n_voices, min_frames)
    fq, am, att = to_arrays(placed, n_frames, n_voices)
    order = np.argsort(-(am ** 2).sum(0), kind='stable')
    fq, am, att = fq[:, order], am[:, order], att[:, order]
    if noise:
        nz = stochastic_residual(spectra, peaks, n_frames, edges)
        for bi in range(len(edges) - 1):
            if edges[bi + 1] <= noise_from:
                nz[:, bi] = 0.0
    else:
        nz = np.zeros((n_frames, len(edges) - 1))
    ev = S.onsets(x, n_frames) if bursts else []
    return fq, am, att, nz, ev, edges


# ------------------------------------------------------------------ v2d: the noise is gated by how noisy each band really is
def band_total(spectra, n_frames, edges):
    nb = len(edges) - 1
    out = np.zeros((n_frames, nb))
    for (pw, nfft, sw2, ml, flo, fhi) in spectra:
        binhz = S.SR / nfft
        scale = 2.0 / (nfft * sw2)
        for bi in range(nb):
            blo, bhi = max(edges[bi], flo), min(edges[bi + 1], fhi)
            if bhi <= blo:
                continue
            out[:, bi] += pw[:, int(blo / binhz):int(bhi / binhz)].sum(1) * scale
    return out


def analyse_v2d(x, n_voices=48, min_frames=3, edges=None, r0=0.25, r1=0.6, low_cut=0.5):
    edges = edges or [180, 360, 720, 1440, 2880, 5000, 8000, 12000, 17000]
    n_frames = int(math.ceil(len(x) / S.HOP)) + 1
    peaks, spectra = S.find_peaks(x, n_frames)
    tracks = track(peaks)
    placed = choose(tracks, n_frames, n_voices, min_frames)
    fq, am, att = to_arrays(placed, n_frames, n_voices)
    order = np.argsort(-(am ** 2).sum(0), kind='stable')
    fq, am, att = fq[:, order], am[:, order], att[:, order]
    res = stochastic_residual(spectra, peaks, n_frames, edges, low_cut=1.0)
    tot = band_total(spectra, n_frames, edges)
    rho = (res ** 2) / np.maximum(tot, 1e-20)
    k = np.ones(3) / 3
    rho = np.stack([np.convolve(rho[:, b], k, mode='same') for b in range(rho.shape[1])], 1)
    gate = np.clip((rho - r0) / (r1 - r0), 0.0, 1.0)
    nz = res * gate
    for bi in range(len(edges) - 1):
        if edges[bi + 1] <= 720:
            nz[:, bi] *= low_cut
    return fq, am, att, nz, [], edges


# ------------------------------------------------------------------ v2e: only the SUSTAINED part of the residual becomes loop noise
def erode(a, w):
    """running minimum over +-w frames along axis 0 (a transient shorter than the window disappears)"""
    if w <= 0:
        return a
    out = a.copy()
    for d in range(1, w + 1):
        out[d:] = np.minimum(out[d:], a[:-d]); out[:-d] = np.minimum(out[:-d], a[d:])
    return out


def analyse_v2e(x, n_voices=48, min_frames=3, edges=None, w=1, low_cut=0.5):
    edges = edges or [180, 360, 720, 1440, 2880, 5000, 8000, 12000, 17000]
    n_frames = int(math.ceil(len(x) / S.HOP)) + 1
    peaks, spectra = S.find_peaks(x, n_frames)
    tracks = track(peaks)
    placed = choose(tracks, n_frames, n_voices, min_frames)
    fq, am, att = to_arrays(placed, n_frames, n_voices)
    order = np.argsort(-(am ** 2).sum(0), kind='stable')
    fq, am, att = fq[:, order], am[:, order], att[:, order]
    res = stochastic_residual(spectra, peaks, n_frames, edges, low_cut=low_cut)
    nz = erode(res, w)
    return fq, am, att, nz, [], edges


# ------------------------------------------------------------------ v2f: analysis by synthesis — keep a noise band only where it makes the
# render closer to the original by NSIM-lite (ViSQOL's similarity core on an STFT filterbank, tools/metrics/nsimlite.py)
def render_parts(fq, am, att, nz, edges, sr=48000):
    """the sine voices and each noise band rendered apart (scaled and quantised as the encoder would): they add up"""
    g = song_gain(am, nz)
    part = render(fq, am * g, att, nz * 0, [], edges, sr=sr, normalise=False)
    bands = []
    for b in range(len(edges) - 1):
        one = np.zeros_like(nz); one[:, b] = nz[:, b] * g
        if not np.any(one > 0):
            bands.append(None); continue
        bands.append(render(fq * 0, am * 0, att, one, [], edges, sr=sr, normalise=False) - render(fq * 0, am * 0, att, one * 0, [], edges, sr=sr, normalise=False))
    return part, bands, g


def choose_noise(x48, part, bands, margin=0.003):
    """greedy, from the top band down: a noise band stays if the NSIM-lite of the whole render goes up by > margin"""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'metrics'))
    from nsimlite import nsim_lite
    n = min(len(x48), len(part))
    ref = x48[:n]
    cur = part[:n].copy()
    def score(y):
        rr = math.sqrt(np.mean(ref * ref) + 1e-20); ry = math.sqrt(np.mean(y * y) + 1e-20)
        return nsim_lite(ref, y * (rr / ry))
    best = score(cur)
    keep = [False] * len(bands)
    for b in range(len(bands) - 1, -1, -1):
        if bands[b] is None:
            continue
        trial = cur + bands[b][:n]
        s = score(trial)
        if s > best + margin:
            best, cur, keep[b] = s, trial, True
    return keep, best


def analyse_v2f(x, x48, n_voices=48, min_frames=3, edges=None):
    fq, am, att, nz, ev, edges = analyse_v2c(x, n_voices, min_frames, edges)
    part, bands, g = render_parts(fq, am, att, nz, edges)
    keep, best = choose_noise(x48, part, bands)
    for b, k in enumerate(keep):
        if not k:
            nz[:, b] = 0.0
    return fq, am, att, nz, ev, edges, keep
