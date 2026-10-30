#!/usr/bin/env python3
"""
Spectral Player converter + client-accurate preview renderer.

MP3/WAV/anything ffmpeg reads  ->  song data for the Minecraft Bedrock "Spectral Player" add-on.

Model (what the add-on can actually drive with @minecraft/server 2.11 SoundInstance):
  * N sine voices      : one looping 1760 Hz sine per voice, started once (loopCount -1),
                         then every tick setPitch(f/1760) + fade(50 ms or 12 ms, amp).
                         Phase is continuous because the loop never restarts.
  * M noise bands      : one looping band-limited noise per band, fade() every tick.
  * transient bursts   : one-shot noise bursts (low / mid / high) with 4 sub-tick
                         start offsets (0, 12.5, 25, 37.5 ms) baked into 4 sound files,
                         so drum attacks land between ticks.
Control rate is the server tick (20 Hz).  The engine applies frame k+1 targets at
tick k (one-frame look-ahead) so a 50 ms linear fade lands exactly on frame k+1.

The renderer below reproduces that client behaviour sample by sample, so the
preview you hear here is what the add-on plays in game (minus the game mixer).
"""
import argparse, base64, json, math, os, subprocess, sys, struct
import numpy as np

SR = 44100            # analysis rate
FPS = 20              # one frame per server tick
HOP = SR // FPS       # 2205 samples = 50 ms
BASE = 1760.0         # sine voice base frequency (Hz) -> setPitch(f/BASE), pitch in [0.01, 10]
FMIN, FMAX = 25.0, 16000.0
NOISE_EDGES = [180, 360, 720, 1440, 2880, 5000, 8000, 12000, 17000]   # 8 bands
BURST_BANDS = [(30, 200), (200, 4000), (4000, 16000)]                # low / mid / high
SUB = 4               # sub-tick offsets per tick (12.5 ms)
AMP_FLOOR_DB = -90.0  # amp code 1
AMP_STEP_DB = 0.75    # 7-bit amp code
NZ_FLOOR_DB = -100.0
NZ_STEP_DB = 0.5

# ------------------------------------------------------------------ io
def load_audio(path, sr=SR, stereo=False):
    ch = 2 if stereo else 1
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(ch), '-ar', str(sr), '-'],
                         check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, ch) if stereo else x

def write_wav(path, x, sr):
    from scipy.io import wavfile
    x = np.asarray(x)
    wavfile.write(path, sr, (np.clip(x, -1, 1) * 32767).astype(np.int16))

# ------------------------------------------------------------------ helpers
def blackman_harris(n):
    a = [0.35875, 0.48829, 0.14128, 0.01168]
    t = 2 * np.pi * np.arange(n) / n
    return a[0] - a[1] * np.cos(t) + a[2] * np.cos(2 * t) - a[3] * np.cos(3 * t)

def a_weight(f):
    f = np.maximum(f, 1.0); f2 = f * f
    ra = (12194.0 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194.0 ** 2))
    return ra / 0.7943  # ~1.0 at 1 kHz

def bark(f):
    return 13 * np.arctan(0.00076 * f) + 3.5 * np.arctan((f / 7500.0) ** 2)

def cents(a, b):
    return 1200.0 * np.log2(a / b)

def stft_frames(x, n_win, nfft, n_frames, hop=HOP):
    """Frames centred on k*hop (k = 0..n_frames-1)."""
    w = blackman_harris(n_win)
    pad = n_win // 2
    xp = np.pad(x, (pad, pad + hop * n_frames + n_win))
    idx = np.arange(n_frames)[:, None] * hop + np.arange(n_win)[None, :]
    fr = xp[idx] * w[None, :]
    X = np.fft.rfft(fr, n=nfft, axis=1)
    return X, w

# ------------------------------------------------------------------ analysis
RES = [  # (window, nfft, fmin, fmax)
    (8192, 16384, FMIN, 330.0),
    (4096, 8192, 330.0, 2000.0),
    (2048, 4096, 2000.0, FMAX),
]

def moving_avg(a, w):
    """mean over +-w bins along the last axis (edges: shorter windows), O(n) by cumulative sums"""
    n = a.shape[-1]
    c = np.concatenate([np.zeros(a.shape[:-1] + (1,)), np.cumsum(a, -1)], -1)
    i = np.arange(n); lo = np.maximum(i - w, 0); hi = np.minimum(i + w + 1, n)
    return (c[..., hi] - c[..., lo]) / (hi - lo)

FLOOR_W = 90
def noise_floor(db):
    """robust spectral floor: a moving average, then again with everything above it +3 dB clipped
    (cheap enough for the browser converter, which uses the same estimator)"""
    m1 = moving_avg(db, FLOOR_W)
    return moving_avg(np.minimum(db, m1), FLOOR_W)

def find_peaks(x, n_frames, max_per_frame=160):
    """Return per-frame list of (freq, amp, bin) sinusoidal peaks and the power spectra per resolution."""
    peaks = [[] for _ in range(n_frames)]
    spectra = []
    for (nw, nfft, flo, fhi) in RES:
        X, w = stft_frames(x, nw, nfft, n_frames)
        mag = np.abs(X)
        db = 20 * np.log10(mag + 1e-12)
        binhz = SR / nfft
        sw = w.sum(); sw2 = (w * w).sum()
        floor = noise_floor(db)
        lo_bin = int(flo / binhz); hi_bin = min(int(fhi / binhz) + 1, db.shape[1] - 3)
        c = db[:, 2:-2]
        is_pk = (c > db[:, 1:-3]) & (c >= db[:, 3:-1]) & (c > db[:, :-4]) & (c >= db[:, 4:])
        is_pk = np.pad(is_pk, ((0, 0), (2, 2)))
        is_pk[:, :lo_bin] = False; is_pk[:, hi_bin:] = False
        # amplitude of a sinusoid: A = 2|X|/sum(w)
        amp_db_raw = db + 20 * np.log10(2.0 / sw)
        is_pk &= (amp_db_raw > -88) & (db - floor > 8.0)
        # power of the band residual (sinusoid main lobes removed below)
        pw = mag ** 2
        main_lobe = int(4 * nfft / nw) + 1   # BH main lobe half width in padded bins
        for k in range(n_frames):
            ib = np.nonzero(is_pk[k])[0]
            if len(ib):
                a, b, g = db[k, ib - 1], db[k, ib], db[k, ib + 1]
                den = a - 2 * b + g
                p = np.where(np.abs(den) > 1e-9, 0.5 * (a - g) / den, 0.0)
                p = np.clip(p, -0.5, 0.5)
                f = (ib + p) * binhz
                adb = b - 0.25 * (a - g) * p + 20 * np.log10(2.0 / sw)
                amp = 10 ** (adb / 20)
                keep = (f >= flo) & (f < fhi)
                for ff, aa, bi in zip(f[keep], amp[keep], ib[keep]):
                    peaks[k].append((float(ff), float(aa), int(bi)))
        spectra.append((pw, nfft, sw2, main_lobe, flo, fhi))
    for k in range(n_frames):
        peaks[k].sort(key=lambda t: -t[1])
        del peaks[k][max_per_frame:]
    return peaks, spectra

def mask_and_rank(pk):
    """Psychoacoustic ranking: A-weighted salience, crude simultaneous masking."""
    if not pk: return []
    f = np.array([p[0] for p in pk]); a = np.array([p[1] for p in pk])
    s = a * a_weight(f)
    order = np.argsort(-s)
    z = bark(f)
    chosen = []
    for i in order:
        masked = False
        for j in chosen:
            dz = abs(z[i] - z[j])
            if dz < 3.0:
                # masker spreads at ~ -25 dB/bark below, -10 dB/bark above (simplified)
                slope = 10.0 if z[i] > z[j] else 25.0
                thr = s[j] * 10 ** (-(14.0 + slope * dz) / 20)
                if s[i] < thr: masked = True; break
        if not masked: chosen.append(i)
    return [(pk[i][0], pk[i][1], float(s[i])) for i in chosen]

def allocate(peaks, n_voices, hyst=2.0):
    """Voice-centric partial tracking.  Returns freq[F,N], amp[F,N], attack[F,N]."""
    F = len(peaks)
    fq = np.zeros((F, n_voices)); am = np.zeros((F, n_voices)); sal = np.zeros(n_voices)
    att = np.zeros((F, n_voices), dtype=bool)
    prev_f = np.zeros(n_voices); prev_a = np.zeros(n_voices)
    for k in range(F):
        cands = mask_and_rank(peaks[k])[: 3 * n_voices]
        used = [False] * len(cands)
        cur_f = np.zeros(n_voices); cur_a = np.zeros(n_voices); cur_s = np.zeros(n_voices)
        # 1) continuations, strongest voices first
        for v in np.argsort(-sal):
            if prev_a[v] <= 0: continue
            best, bc = -1, 1e9
            dev = max(60.0, cents(prev_f[v] + 9.0, prev_f[v]))  # >= 60 cents, wider in the bass
            for i, (f, a, s) in enumerate(cands):
                if used[i]: continue
                dc = abs(cents(f, prev_f[v]))
                if dc > dev: continue
                cost = dc + 3.0 * abs(20 * math.log10(a / prev_a[v]))
                if cost < bc: best, bc = i, cost
            if best >= 0:
                used[best] = True
                cur_f[v], cur_a[v], cur_s[v] = cands[best]
        # 2) new partials into voices that were silent last frame
        free = [v for v in range(n_voices) if prev_a[v] <= 0]
        weakest = sorted([v for v in range(n_voices) if cur_a[v] > 0], key=lambda v: cur_s[v])
        for i, (f, a, s) in enumerate(cands):
            if used[i]: continue
            if free:
                v = free.pop(0)
                cur_f[v], cur_a[v], cur_s[v] = f, a, s
                used[i] = True
                # sharp start unless it is a slow swell
                att[k, v] = True
            elif weakest and s > hyst * cur_s[weakest[0]]:
                # pre-empt: release the weakest voice now, the new partial gets it next frame
                v = weakest.pop(0)
                cur_f[v] = 0; cur_a[v] = 0; cur_s[v] = 0
        # attack also when a continuing partial jumps up >= 9 dB
        rise = (prev_a > 0) & (cur_a > prev_a * 2.8)
        att[k] |= rise
        fq[k], am[k] = cur_f, cur_a
        prev_f = np.where(cur_a > 0, cur_f, prev_f); prev_a = cur_a; sal = cur_s
    # a "new" partial that keeps growing for 2+ frames is a swell, not an attack
    for k in range(F - 1):
        swell = att[k] & (am[k + 1] > am[k] * 1.6)
        att[k] &= ~swell
    return fq, am, att

def residual_noise(spectra, fq, am, n_frames, low_tonal_cut=0.5):
    """Band RMS of what the sine voices do not cover: band power minus the measured
    main-lobe power of every voiced partial (so leakage of loud bass partials is not
    turned into rumble).  Bands below 720 Hz are scaled by low_tonal_cut."""
    nb = len(NOISE_EDGES) - 1
    out = np.zeros((n_frames, nb))
    for (pw, nfft, sw2, ml, flo, fhi) in spectra:
        binhz = SR / nfft
        scale = 2.0 / (nfft * sw2)
        for k in range(n_frames):
            row = pw[k].copy()
            for v in np.nonzero(am[k] > 0)[0]:
                f = fq[k, v]          # zero the lobe in every resolution (lobes leak across region edges)
                b = int(round(f / binhz))
                row[max(b - ml, 0): b + ml + 1] = 0.0
            for bi in range(nb):
                blo, bhi = max(NOISE_EDGES[bi], flo), min(NOISE_EDGES[bi + 1], fhi)
                if bhi <= blo: continue
                out[k, bi] += row[int(blo / binhz):int(bhi / binhz)].sum() * scale
    out = np.sqrt(np.maximum(out, 0.0))
    for bi in range(nb):
        if NOISE_EDGES[bi + 1] <= 720: out[:, bi] *= low_tonal_cut
    return out

def onsets(x, n_frames, delta=0.35):
    """SuperFlux-style onset detection per burst band (log magnitude, vibrato-suppressing
    max filter, lag 3 hops) -> list of (frame, sub, band, amp_rms).  Steady chords and
    beating partials give no flux, drum hits do."""
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    hop = 128
    events = []
    for bnd, (lo, hi) in enumerate(BURST_BANDS):
        nw = (2048, 1024, 512)[bnd]
        w = np.hanning(nw)
        n = (len(x) - nw) // hop
        if n <= 8: continue
        idx = np.arange(n)[:, None] * hop + np.arange(nw)[None, :]
        X = np.abs(np.fft.rfft(x[idx] * w, axis=1))
        binhz = SR / nw
        i0, i1 = max(1, int(lo / binhz)), int(hi / binhz) + 1
        Lg = np.log10(1 + 100 * X[:, i0:i1])
        ref = maximum_filter1d(Lg, size=3, axis=1)
        mu = 3
        flux = np.zeros(n)
        flux[mu:] = np.maximum(Lg[mu:] - ref[:-mu], 0).mean(1)
        pw = (X[:, i0:i1] ** 2).sum(1) * 2 / (nw * (w * w).sum())   # band power per hop
        mean = uniform_filter1d(flux, size=int(0.1 * SR / hop) | 1, mode='nearest')
        loc = maximum_filter1d(flux, size=int(0.03 * SR / hop) | 1, mode='nearest')
        last = -1e9
        for i in np.nonzero((flux == loc) & (flux > mean + delta * 0.1) & (flux > delta * 0.15))[0]:
            t = (i * hop + nw / 2) / SR
            if t - last < 0.05: continue
            pre = pw[max(i - 8, 0):max(i - 2, 1)].mean()
            post = pw[i:i + 4].mean()
            p = post - pre
            if p <= 1e-9: continue
            last = t
            pos = t * FPS
            k = int(math.floor(pos)); sub = int(round((pos - k) * SUB))
            if sub >= SUB: k += 1; sub = 0
            if 0 <= k < n_frames:
                events.append((k, sub, bnd, math.sqrt(p)))
    events.sort()
    # a low burst needs a simultaneous mid/high onset (kick click) or a very strong jump,
    # otherwise bass-note onsets would all get a thud
    hi_t = [k * SUB + s for (k, s, b, a) in events if b > 0]
    keep = []
    for e in events:
        if e[2] == 0:
            t = e[0] * SUB + e[1]
            if not any(abs(t - h) <= 1 for h in hi_t) and e[3] < 0.08:
                continue
        keep.append(e)
    return keep

# ------------------------------------------------------------------ assets (shared with the add-on RP)
def band_noise(lo, hi, sr=48000, seconds=2.0, seed=0):
    n = int(sr * seconds)
    rng = np.random.default_rng(seed)
    spec = np.zeros(n // 2 + 1, complex)
    f = np.fft.rfftfreq(n, 1 / sr)
    m = (f >= lo) & (f < hi)
    # smooth (raised-cosine) band edges, 1/6 octave
    edge = np.ones_like(f)
    for c, d in ((lo, -1), (hi, 1)):
        oc = np.log2(np.maximum(f, 1) / c) * d
        edge *= np.where(oc < -1 / 12, 1.0, np.where(oc > 1 / 12, 0.0, 0.5 + 0.5 * np.cos(np.pi * (oc + 1 / 12) * 6)))
    spec = edge * np.exp(1j * rng.uniform(0, 2 * np.pi, len(f)))
    spec[0] = 0
    y = np.fft.irfft(spec, n)            # exactly periodic -> seamless loop
    return y / np.sqrt(np.mean(y * y)) * NOISE_RMS

NOISE_RMS = 0.18       # every band loop is normalised to this RMS
BURST_PEAK_RMS = 0.30  # RMS of the first 10 ms of every burst
BURST_LEN = 0.12

def burst(bnd, sr=48000, seed=1):
    lo, hi = BURST_BANDS[bnd]
    n = int(sr * BURST_LEN)
    t = np.arange(n) / sr
    y = band_noise(lo, hi, sr, BURST_LEN, seed + bnd)
    decay = [22.0, 45.0, 75.0][bnd]
    env = np.exp(-t * decay) * np.clip(t / 0.0015, 0, 1)
    y = y * env
    r = np.sqrt(np.mean(y[: int(0.01 * sr)] ** 2))
    return y / r * BURST_PEAK_RMS

def sine_loop(sr=48000, seconds=1.0, freq=BASE):
    n = int(sr * seconds)
    assert abs(freq * seconds - round(freq * seconds)) < 1e-9
    return np.sin(2 * np.pi * freq * np.arange(n) / sr)

# ------------------------------------------------------------------ encode / decode
def amp_code(a):
    if a <= 0: return 0
    c = int(round((20 * math.log10(a) - AMP_FLOOR_DB) / AMP_STEP_DB)) + 1
    return max(1, min(127, c))
def amp_val(c):
    return 0.0 if c == 0 else 10 ** ((AMP_FLOOR_DB + (c - 1) * AMP_STEP_DB) / 20)
def pitch_code(f):  # 0.2 cent units above 16 Hz
    return max(0, min(65535, int(round(1200 * math.log2(f / 16.0) * 5))))
def pitch_val(c):
    return 16.0 * 2 ** (c / 6000.0)
def nz_code(a):
    if a <= 0: return 0
    c = int(round((20 * math.log10(a) - NZ_FLOOR_DB) / NZ_STEP_DB)) + 1
    return max(0, min(255, c)) if c > 0 else 0
def nz_val(c):
    return 0.0 if c == 0 else 10 ** ((NZ_FLOOR_DB + (c - 1) * NZ_STEP_DB) / 20)

def encode(fq, am, att, nz, events, gain):
    """Binary layout, per frame:
         [mask: ceil(N/8) bytes]  voices that changed
         per changed voice: u8 (bit7 attack, bits0-6 amp code); if amp>0: u16 pitch code
         [M bytes] noise band codes
         u8 nEvents; per event: u8 (band<<2 | sub), u8 amp code (noise scale)
    """
    F, N = am.shape
    M = nz.shape[1]
    out = bytearray()
    last_pc = [-1] * N; last_ac = [0] * N
    ev_by_k = {}
    for (k, sub, b, a) in events: ev_by_k.setdefault(k, []).append((sub, b, a))
    stats = {'changes': 0, 'pitch_calls': 0}
    for k in range(F):
        mask = bytearray((N + 7) // 8)
        body = bytearray()
        for v in range(N):
            ac = amp_code(am[k, v] * gain)
            pc = pitch_code(fq[k, v]) if ac > 0 else 0
            a_flag = bool(att[k, v]) and ac > 0
            changed = (ac != last_ac[v]) or (ac > 0 and abs(pc - last_pc[v]) >= 10) or a_flag  # >= 2 cents
            if not changed: continue
            mask[v >> 3] |= 1 << (v & 7)
            body.append((0x80 if a_flag else 0) | ac)
            if ac > 0:
                body += struct.pack('<H', pc); last_pc[v] = pc
                stats['pitch_calls'] += 1
            last_ac[v] = ac
            stats['changes'] += 1
        out += mask + body
        out += bytes(nz_code(nz[k, b] * gain) for b in range(M))
        ev = ev_by_k.get(k, [])[:15]
        out.append(len(ev))
        for (sub, b, a) in ev:
            out.append((b << 2) | sub); out.append(nz_code(a * gain))
    return bytes(out), stats

def decode(blob, F, N, M):
    """Reference decoder (the add-on's TypeScript decoder mirrors this)."""
    fq = np.zeros((F, N)); am = np.zeros((F, N)); att = np.zeros((F, N), bool)
    nz = np.zeros((F, M)); events = []
    p = 0; cur_f = np.zeros(N); cur_a = np.zeros(N)
    nb = (N + 7) // 8
    for k in range(F):
        mask = blob[p:p + nb]; p += nb
        att_k = np.zeros(N, bool)
        for v in range(N):
            if not (mask[v >> 3] >> (v & 7)) & 1: continue
            b = blob[p]; p += 1
            ac = b & 0x7F
            att_k[v] = bool(b & 0x80)
            cur_a[v] = amp_val(ac)
            if ac > 0:
                cur_f[v] = pitch_val(blob[p] | (blob[p + 1] << 8)); p += 2
        fq[k] = cur_f; am[k] = cur_a; att[k] = att_k
        for b in range(M):
            nz[k, b] = nz_val(blob[p]); p += 1
        ne = blob[p]; p += 1
        for _ in range(ne):
            bb = blob[p]; ac = blob[p + 1]; p += 2
            events.append((k, bb & 3, bb >> 2, nz_val(ac)))
    assert p == len(blob), (p, len(blob))
    return fq, am, att, nz, events

# ------------------------------------------------------------------ engine schedule (mirrored by the add-on)
FADE_SMOOTH = 0.050
FADE_ATTACK = 0.012
SILENT = 1e-4          # "off" volume: voices stay alive (never 0) so the client keeps the loop running

def seg_pitch(f, a, k, j):
    """Frequency to hold while the level moves from frame k to frame j."""
    fa = f[k] if 0 <= k < len(a) and a[k] > 0 else 0.0
    fb = f[j] if 0 <= j < len(a) and a[j] > 0 else 0.0
    if fa and fb: return math.sqrt(fa * fb)
    return fb or fa

def tick_commands(f, a, att, T):
    """Commands for one voice at tick T (playhead at frame T, speed 1).
    Returns (pitch_hz or 0, fade_seconds or None, target).  Rules:
      attack at T      -> fast fade to a[T] now (lands ~12 ms after the tick)
      attack at T+1    -> hold (next tick does the attack)
      otherwise        -> 50 ms linear fade to a[T+1] (lands on frame T+1)"""
    F = len(a)
    if att[T] and a[T] > 0:
        return f[T], FADE_ATTACK, a[T]
    if T + 1 < F and att[T + 1] and a[T + 1] > 0:
        return (f[T] if a[T] > 0 else 0.0), None, None
    j = T + 1
    tgt = a[j] if j < F else 0.0
    return seg_pitch(f, a, T, j), FADE_SMOOTH, tgt

# ------------------------------------------------------------------ client-accurate renderer
def render(fq, am, att, nz, events, sr=48000, assets=None, voices_on=True, noise_on=True, bursts_on=True):
    """Emulates the add-on tick by tick: setPitch() is a step, fade() is a linear ramp,
    voices are loops started once at SILENT volume, bursts are one-shots with sub-tick delay."""
    F, N = am.shape
    tick = sr // FPS
    total = (F + 2) * tick + int(sr * BURST_LEN) + sr // 2
    out = np.zeros(total)
    def env_from(cmds):
        env = np.full(total, SILENT); cur = SILENT
        for T, d, tgt in cmds:
            s0 = T * tick
            tgt = max(tgt, SILENT)
            n = max(1, int(d * sr))
            env[s0:s0 + n] = np.linspace(cur, tgt, n + 1)[1:][: max(0, min(n, total - s0))]
            env[s0 + n:] = tgt
            cur = tgt
        return env
    if voices_on:
        for v in range(N):
            a = am[:, v]; f = fq[:, v]; at = att[:, v]
            if not np.any(a > 0): continue
            cmds = []; pitch = np.zeros(F + 1); cur_p = BASE
            for T in range(F):
                p_hz, d, tgt = tick_commands(f, a, at, T)
                if p_hz: cur_p = p_hz
                pitch[T] = cur_p
                if d is not None: cmds.append((T, d, tgt))
            pitch[F] = cur_p
            inst_f = np.repeat(pitch, tick)
            inst_f = np.pad(inst_f, (0, max(0, total - len(inst_f))), 'edge')[:total]
            ph = 2 * np.pi * np.cumsum(inst_f) / sr
            out += np.sin(ph) * env_from(cmds)
    if noise_on:
        M = nz.shape[1]
        for b in range(M):
            if not np.any(nz[:, b] > 0): continue
            loop = assets['noise'][b] if assets else band_noise(NOISE_EDGES[b], NOISE_EDGES[b + 1], sr, 2.0, 100 + b)
            sig = np.tile(loop, int(np.ceil(total / len(loop))))[:total] / NOISE_RMS
            cmds = [(T, FADE_SMOOTH, nz[T + 1, b] if T + 1 < F else 0.0) for T in range(F)]
            out += sig * env_from(cmds)
    if bursts_on:
        bl = [burst(b, sr) for b in range(len(BURST_BANDS))]
        for (k, sub, b, a) in events:
            s0 = k * tick + int(sub * tick / SUB)
            y = bl[b] / BURST_PEAK_RMS * a
            out[s0:s0 + len(y)] += y[: max(0, min(len(y), total - s0))]
    return out

# ------------------------------------------------------------------ quality metric
def log_spec_distance(ref, test, sr_ref, sr_test):
    """Mean |dB| difference of 1/3-octave band energies (50 ms frames), weighted by loudness."""
    def bands(x, sr):
        nw = int(sr * 0.05)
        n = len(x) // nw
        X = np.abs(np.fft.rfft(x[: n * nw].reshape(n, nw) * np.hanning(nw), axis=1)) ** 2
        f = np.fft.rfftfreq(nw, 1 / sr)
        edges = 50 * 2 ** (np.arange(0, 28) / 3)
        out = np.stack([X[:, (f >= edges[i]) & (f < edges[i + 1])].sum(1) for i in range(len(edges) - 1)], 1)
        return 10 * np.log10(out + 1e-10)
    A = bands(ref, sr_ref); B = bands(test, sr_test)
    n = min(len(A), len(B))
    A, B = A[:n], B[:n]
    w = np.clip(A - (A.max() - 60), 0, None)
    return float((np.abs(A - B) * w).sum() / w.sum())

# ------------------------------------------------------------------ main

# ------------------------------------------------------------------ analysis v2 (default; --analysis v1 = the first version)
# Measured on corpus/ with tools/eval.py (EMULATOR numbers, see SPEC.md): v1 gave 51-85 % of its voice segments a life of
# <= 2 frames (blips with attacks), and turning every peak that is not a voice into noise made clean songs worse (piano)
# while dense ones needed it (rock). v2: partial TRACKS first (no voice limit), whole tracks of >= 3 frames go to voices
# by salience (no pre-emption cuts); the noise is what is left after removing every peak (tonal energy is never turned
# into noise); and each of the 8 noise bands is kept only if adding it makes the render closer to the original by
# NSIM-lite (ViSQOL's similarity core on an STFT filterbank) - analysis by synthesis.  web/core.js mirrors every step.
MIN_TRACK = 3          # frames: a shorter track is not a voice
TRACK_GAP = 1          # a track may miss one frame (bridged by interpolation)
NSIM_MARGIN = 0.003    # a noise band must raise NSIM-lite by more than this to stay


def track_partials(peaks, max_dev=60.0, gap=TRACK_GAP):
    """McAulay-Quatieri tracking without a voice limit -> tracks [k0, f[], a[]] (lists; a bridged frame gets the
    geometric mean of its neighbours)"""
    active = []          # [k0, f, a, last_f, last_a, miss]
    done = []
    for k in range(len(peaks)):
        pk = peaks[k]                                  # sorted loudest first (find_peaks)
        used = [False] * len(pk)
        order = sorted(range(len(active)), key=lambda i: -max(active[i][2][-1], 1e-12))
        for i in order:
            tr = active[i]
            lf, la = tr[3], tr[4]
            dev = max(max_dev, cents(lf + 9.0, lf))
            best, bc = -1, 1e9
            for j in range(len(pk)):
                if used[j]:
                    continue
                f, a = pk[j][0], pk[j][1]
                dc = abs(cents(f, lf))
                if dc > dev:
                    continue
                cost = dc + 3.0 * abs(20 * math.log10(a / la))
                if cost < bc:
                    best, bc = j, cost
            if best >= 0:
                used[best] = True
                f, a = pk[best][0], pk[best][1]
                tr[1].append(f); tr[2].append(a); tr[3] = f; tr[4] = a; tr[5] = 0
            else:
                tr[5] += 1
                tr[1].append(lf); tr[2].append(0.0)
        still = []
        for tr in active:
            if tr[5] > gap:
                n = tr[5]
                del tr[1][-n:]; del tr[2][-n:]
                done.append(tr)
            else:
                still.append(tr)
        active = still
        for j in range(len(pk)):
            if not used[j]:
                active.append([k, [pk[j][0]], [pk[j][1]], pk[j][0], pk[j][1], 0])
    for tr in active:
        if tr[5]:
            n = tr[5]
            del tr[1][-n:]; del tr[2][-n:]
        done.append(tr)
    out = []
    for tr in done:
        a = tr[2]
        for i in range(1, len(a) - 1):
            if a[i] == 0.0 and a[i - 1] > 0 and a[i + 1] > 0:
                a[i] = math.sqrt(a[i - 1] * a[i + 1])
        if len(a):
            out.append((tr[0], tr[1], a))
    return out


def choose_tracks(tracks, n_frames, n_voices, min_frames=MIN_TRACK, margin=1, salience=None, groups=None):
    """weighted interval scheduling, greedy by A-weighted salience: a track gets the first voice that is free over its
    whole life (+-1 frame); tracks that fit nowhere are not voices.
    salience: a list (one value per track) instead of the A-weighted one. groups: [(voices, allowed(track index))...]:
    the voices are filled group by group, each from the tracks its test allows that no earlier group took"""
    cand = []
    for ti, (k0, f, a) in enumerate(tracks):
        if len(a) < min_frames:
            continue
        if salience is not None:
            sal = salience[ti]
        else:
            sal = 0.0
            for i in range(len(a)):
                sal += a[i] * float(a_weight(np.float64(f[i])))
        cand.append((sal, ti))
    cand.sort(key=lambda c: (-c[0], c[1]))
    busy = [bytearray(n_frames + 2) for _ in range(n_voices)]
    placed = []
    taken = set()
    for (vs, ok) in (groups or [(range(n_voices), None)]):
      for sal, ti in cand:
        if ti in taken or (ok is not None and not ok(ti)):
            continue
        k0, f, a = tracks[ti]
        lo, hi = max(0, k0 - margin), min(n_frames, k0 + len(a) + margin)
        for v in vs:
            b = busy[v]
            if not any(b[lo:hi]):
                for i in range(lo, hi):
                    b[i] = 1
                placed.append((v, ti)); taken.add(ti)
                break
    fq = np.zeros((n_frames, n_voices)); am = np.zeros((n_frames, n_voices)); att = np.zeros((n_frames, n_voices), bool)
    for v, ti in placed:
        k0, f, a = tracks[ti]
        for i in range(len(a)):
            fq[k0 + i, v] = f[i]; am[k0 + i, v] = a[i]
        if not (len(a) > 1 and a[1] > a[0] * 1.6):
            att[k0, v] = True
        for i in range(1, len(a)):
            if a[i - 1] > 0 and a[i] > a[i - 1] * 2.8:
                att[k0 + i, v] = True
    return fq, am, att, len(placed)


def erb_band_power(spectra, n_frames, n_bands=32, lo=50.0):
    """power per ERB band (ViSQOL's 32 bands from 50 Hz) per frame from the resolution spectra (each over its own range)
    -> (centres, edges, P[k, j])"""
    e_lo = 21.4 * math.log10(1 + 0.00437 * lo); e_hi = 21.4 * math.log10(1 + 0.00437 * (SR / 2))
    edges = [(10 ** ((e_lo + (e_hi - e_lo) * i / n_bands) / 21.4) - 1) / 0.00437 for i in range(n_bands + 1)]
    P = np.zeros((n_frames, n_bands))
    for (pw, nfft, sw2, ml, flo, fhi) in spectra:
        binhz = SR / nfft
        scale = 2.0 / (nfft * sw2)
        for j in range(n_bands):
            blo, bhi = max(edges[j], flo if flo > FMIN else 0.0), min(edges[j + 1], fhi if fhi < FMAX else SR / 2)
            if bhi <= blo:
                continue
            P[:, j] += pw[:, int(blo / binhz):int(bhi / binhz)].sum(1) * scale
    return edges, P


def erb_salience(tracks, spectra, n_frames, floor_db=45.0):
    """how much of its ERB band each track explains, summed over its frames (a track that is its band's sound counts 1
    a frame wherever it is: bass the same as treble, as ViSQOL's equal bands see it). Frames whose band is more than
    floor_db under the loudest band of the frame do not count (ViSQOL floors them)"""
    edges, P = erb_band_power(spectra, n_frames)
    top = P.max(1)
    out = []
    for (k0, f, a) in tracks:
        s = 0.0
        for i in range(len(a)):
            k = k0 + i
            if k >= n_frames or a[i] <= 0:
                continue
            j = int(np.searchsorted(edges, f[i]) - 1)
            if j < 0 or j >= P.shape[1]:
                continue
            e = P[k, j]
            if e <= top[k] * 10 ** (-floor_db / 10):
                continue
            s += min(1.0, 0.5 * a[i] * a[i] / max(e, 1e-30))
        out.append(s)
    return out


def fit_noise(spectra, fq, am, n_frames, edges=None, floor_db=45.0, sweeps=60):
    """noise band levels that, with the voices, give each ERB band of each frame the original's power (least squares in
    relative power: every band counts the same, as in ViSQOL; bands more than floor_db under the frame's loudest are
    floored). Coordinate descent on non-negative band powers, a fixed number of sweeps -> band RMS (F, M)"""
    edges = edges or NOISE_EDGES
    eb, Po = erb_band_power(spectra, n_frames)
    J = Po.shape[1]; M = len(edges) - 1
    D = np.zeros((M, J))
    for b in range(M):
        for j in range(J):
            ov = min(edges[b + 1], eb[j + 1]) - max(edges[b], eb[j])
            if ov > 0:
                D[b, j] = ov / (edges[b + 1] - edges[b])
    Pv = np.zeros((n_frames, J))
    for k in range(n_frames):
        for v in np.nonzero(am[k] > 0)[0]:
            j = int(np.searchsorted(eb, fq[k, v]) - 1)
            if 0 <= j < J:
                Pv[k, j] += 0.5 * am[k, v] ** 2
    out = np.zeros((n_frames, M))
    for k in range(n_frames):
        top = Po[k].max()
        if top <= 0:
            continue
        eps = top * 10 ** (-floor_db / 10)
        w = 1.0 / (Po[k] + eps) ** 2
        r = np.maximum(Po[k] - Pv[k], 0.0)
        n = np.zeros(M)
        cur = np.zeros(J)                      # D^T n
        for _ in range(sweeps):
            for b in range(M):
                d = D[b]
                den = float((w * d * d).sum())
                if den <= 0:
                    continue
                res = r - (cur - d * n[b])
                nb = max(0.0, float((w * d * res).sum()) / den)
                cur += d * (nb - n[b]); n[b] = nb
        out[k] = np.sqrt(n)
    return out


def stochastic_residual(spectra, peaks, n_frames, low_cut=0.5):
    """band RMS of the spectrum with the main lobe of EVERY peak removed (bands below 720 Hz x low_cut)"""
    nb = len(NOISE_EDGES) - 1
    out = np.zeros((n_frames, nb))
    for (pw, nfft, sw2, ml, flo, fhi) in spectra:
        binhz = SR / nfft
        scale = 2.0 / (nfft * sw2)
        for k in range(n_frames):
            row = pw[k].copy()
            for pkk in peaks[k]:
                b = int(round(pkk[0] / binhz))
                row[max(b - ml, 0): b + ml + 1] = 0.0
            for bi in range(nb):
                blo, bhi = max(NOISE_EDGES[bi], flo), min(NOISE_EDGES[bi + 1], fhi)
                if bhi <= blo:
                    continue
                out[k, bi] += row[int(blo / binhz):int(bhi / binhz)].sum() * scale
    out = np.sqrt(np.maximum(out, 0.0))
    for bi in range(nb):
        if NOISE_EDGES[bi + 1] <= 720:
            out[:, bi] *= low_cut
    return out


# ---- the converter's own render and NSIM-lite (deterministic, mirrored in web/core.js)
def xorshift32(seed):
    s = seed & 0xffffffff or 1
    while True:
        s ^= (s << 13) & 0xffffffff; s ^= s >> 17; s ^= (s << 5) & 0xffffffff
        yield s


def check_noise(lo, hi, n=65536, seed=1):
    """a band noise loop of n samples at SR (unit RMS): raised-cosine band edges, phases from xorshift32"""
    g = xorshift32(seed * 2654435761 + 12345)
    f = np.arange(n // 2 + 1) * (SR / n)
    spec = np.zeros(n // 2 + 1, complex)
    for i in range(1, n // 2):
        fi = max(f[i], 1.0); e = 1.0
        for c, d in ((lo, -1), (hi, 1)):
            oc = math.log2(fi / c) * d
            e *= 1.0 if oc < -1 / 12 else (0.0 if oc > 1 / 12 else 0.5 + 0.5 * math.cos(math.pi * (oc + 1 / 12) * 6))
        ph = next(g) / 4294967296.0 * 2 * math.pi
        if e > 0:
            spec[i] = e * complex(math.cos(ph), math.sin(ph))
    y = np.fft.irfft(spec, n)
    return y / math.sqrt(float(np.mean(y * y)) + 1e-30)


def check_render_sines(fq, am, att, n_samples):
    """sine voices as the engine plays them at speed 1 (tick_commands), at SR, values already quantised"""
    F, N = am.shape
    tick = HOP
    out = np.zeros(n_samples)
    for v in range(N):
        a = am[:, v]; f = fq[:, v]; at = att[:, v]
        if not np.any(a > 0):
            continue
        env = np.full(n_samples, SILENT); cur = SILENT
        freq = np.zeros(n_samples); cur_p = BASE
        for T in range(F):
            p_hz, d, tgt = tick_commands(f, a, at, T)
            s0 = T * tick
            if s0 >= n_samples:
                break
            if p_hz:
                cur_p = p_hz
            freq[s0:] = cur_p
            if d is not None:
                tg = max(tgt, SILENT)
                n = max(1, int(d * SR))
                e = min(n_samples, s0 + n)
                env[s0:e] = cur + (tg - cur) * (np.arange(1, e - s0 + 1) / n)
                env[e:] = tg
                cur = tg
        out += np.sin(2 * np.pi * np.cumsum(freq) / SR) * env
    return out


def check_render_noise(col, loop, n_samples):
    """one noise band: the loop under 50 ms ramps to the next frame's level (values already quantised)"""
    F = len(col)
    sig = np.tile(loop, n_samples // len(loop) + 1)[:n_samples]
    env = np.full(n_samples, SILENT); cur = SILENT
    n = int(FADE_SMOOTH * SR)
    for T in range(F):
        s0 = T * HOP
        if s0 >= n_samples:
            break
        tg = max(col[T + 1] if T + 1 < F else 0.0, SILENT)
        e = min(n_samples, s0 + n)
        env[s0:e] = cur + (tg - cur) * (np.arange(1, e - s0 + 1) / n)
        env[e:] = tg
        cur = tg
    return sig * env


_NSIM_W = {}


def nsim_lite(ref, test):
    """ViSQOL's similarity core (gammatone-like 32 ERB bands from 50 Hz, 80 ms Hann, 20 ms hop, dB floors, 3x3 NSIM
    mean) on an STFT filterbank, for signals aligned by construction (no patch search)"""
    nw = int(round(SR * 0.08)); hop = nw // 4; nfft = 4096
    if SR not in _NSIM_W:
        earQ, minBW = 9.26449, 24.7
        hi_f, lo_f, nb = SR / 2.0, 50.0, 32
        aa = -(earQ * minBW); bb = -math.log(hi_f + earQ * minBW); cc = math.log(lo_f + earQ * minBW); dd = hi_f + earQ * minBW
        ee = (bb + cc) / nb
        cf = sorted(aa + math.exp((i + 1) * ee) * dd for i in range(nb))
        fr = np.arange(nfft // 2 + 1) * (SR / nfft)
        W = np.zeros((nb, len(fr)))
        for i, c in enumerate(cf):
            erb = minBW + c / earQ
            W[i] = np.exp(-0.5 * ((fr - c) / (0.5 * erb)) ** 2)
            W[i] /= W[i].sum()
        win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(nw) / (nw - 1))
        _NSIM_W[SR] = (W, win)
    W, win = _NSIM_W[SR]
    n = min(len(ref), len(test))
    m = 1 + (n - nw) // hop

    def spec(x):
        idx = np.arange(m)[:, None] * hop + np.arange(nw)[None, :]
        P = np.abs(np.fft.rfft(x[idx] * win, nfft, axis=1)) ** 2
        return np.sqrt((W @ P.T) / nw)
    r, d = spec(ref[:n]), spec(test[:n])
    eps = np.finfo(np.float64).eps
    r = np.maximum(10 * np.log10(np.where(r == 0, eps, r)), -45.0); d = np.maximum(10 * np.log10(np.where(d == 0, eps, d)), -45.0)
    fl = np.maximum(r.max(0), d.max(0)) - 45.0
    r = np.maximum(r, fl[None, :]); d = np.maximum(d, fl[None, :])
    low = min(r.min(), d.min()); r = r - low; d = d - low
    w3 = np.array([[0.0113033910173052, 0.0838251475442633, 0.0113033910173052],
                   [0.0838251475442633, 0.619485845753726, 0.0838251475442633],
                   [0.0113033910173052, 0.0838251475442633, 0.0113033910173052]])

    def conv(x):
        p = np.pad(x, 1, mode='edge'); R, C = x.shape; o = np.zeros(x.shape)
        for i in range(3):
            for j in range(3):
                o += p[i:i + R, j:j + C] * w3[i, j]
        return o
    c1 = 0.01 ** 2; c3 = 0.03 ** 2 / 2
    mr, md = conv(r), conv(d)
    sr2 = conv(r * r) - mr * mr; sd2 = conv(d * d) - md * md; srd = conv(r * d) - mr * md
    inten = (2 * mr * md + c1) / (mr * mr + md * md + c1)
    sdd = sr2 * sd2
    struct = (srd + c3) / np.where(sdd < 0, c3, np.sqrt(np.maximum(sdd, 0)) + c3)
    return float((inten * struct).mean(1).mean())


def choose_noise_bands(x, fq, am, att, nz, gain, margin=NSIM_MARGIN):
    """keep a noise band only if it brings the render closer to the original (greedy from the top band down)"""
    n = len(x)
    q = lambda v: amp_val(amp_code(v))
    am_q = np.vectorize(q)(am * gain)
    fq_q = np.where(am_q > 0, np.vectorize(lambda f: pitch_val(pitch_code(f)) if f > 0 else 0.0)(fq), 0.0)
    nz_q = np.vectorize(lambda v: nz_val(nz_code(v)))(nz * gain)
    cur = check_render_sines(fq_q, am_q, att, n)
    xr = math.sqrt(float(np.mean(x * x)) + 1e-30)

    def score(y):
        yr = math.sqrt(float(np.mean(y * y)) + 1e-30)
        return nsim_lite(x, y * (xr / yr))
    best = score(cur)
    keep = [False] * nz.shape[1]
    for b in range(nz.shape[1] - 1, -1, -1):
        if not np.any(nz_q[:, b] > 0):
            continue
        band = check_render_noise(nz_q[:, b], check_noise(NOISE_EDGES[b], NOISE_EDGES[b + 1], seed=b + 1), n)
        s_ = score(cur + band)
        if s_ > best + margin:
            best, cur, keep[b] = s_, cur + band, True
    return keep, best, cur


BURST_TILT = 0.0      # dB per octave across a burst's band (0: white, -3: pink)


def tilted(y, lo, hi, tilt_db_oct):
    """y (a band noise) with a spectral tilt of tilt_db_oct dB per octave about the band's geometric centre, unit RMS"""
    if not tilt_db_oct:
        return y
    n = len(y)
    f = np.arange(n // 2 + 1) * (SR / n)
    g = (np.maximum(f, 1.0) / math.sqrt(lo * hi)) ** (tilt_db_oct / 6.020599913279624)
    z = np.fft.irfft(np.fft.rfft(y) * g, n)
    return z / math.sqrt(float(np.mean(z * z)) + 1e-30)


def check_burst(bnd, n_len):
    """a burst of band bnd for the converter's render: band noise under the decay of tools/make_rp_assets.py's bursts,
    its first 10 ms at unit RMS (the engine plays the RP's burst so that those 10 ms have the event's level)"""
    lo, hi = BURST_BANDS[bnd]
    y = tilted(check_noise(lo, hi, 8192, seed=50 + bnd), lo, hi, BURST_TILT)[:n_len]
    decay = [22.0, 45.0, 75.0][bnd]
    t = np.arange(n_len) / SR
    y = y * np.exp(-t * decay) * np.clip(t / 0.0015, 0, 1)
    r = math.sqrt(float(np.mean(y[: int(0.01 * SR)] ** 2)))
    return y / r


def choose_bursts(x, cur, events, gain, margin=NSIM_MARGIN):
    """keep the bursts of a band (low / mid / high) only if they bring the render closer to the original"""
    n = len(x)
    xr = math.sqrt(float(np.mean(x * x)) + 1e-30)

    def score(y):
        yr = math.sqrt(float(np.mean(y * y)) + 1e-30)
        return nsim_lite(x, y * (xr / yr))
    best = score(cur)
    keep = [False] * len(BURST_BANDS)
    nb = int(BURST_LEN * SR)
    for b in range(len(BURST_BANDS) - 1, -1, -1):
        evb = [e for e in events if e[2] == b]
        if not evb:
            continue
        unit = check_burst(b, nb)
        add = np.zeros(n)
        for (k, sub, bb, a) in evb:
            s0 = k * HOP + int(sub * HOP / SUB)
            if s0 >= n:
                continue
            m = min(nb, n - s0)
            add[s0:s0 + m] += unit[:m] * nz_val(nz_code(a * gain))
        trial = cur + add
        s_ = score(trial)
        if s_ > best + margin:
            best, cur, keep[b] = s_, trial, True
    return keep, best


def convert(path, n_voices=48, title=None, artist='', gain_db=0.0, max_seconds=None, analysis='v2', residual='all', salience='a',
            nested=0, hf=0.0, burst_tilt=None, noise_edges=None):
    """residual: 'all' (every peak's lobe out of the noise) | 'voiced' (only the voices'). salience: 'a' (A-weighted) |
    'erb' (share of its ERB band). nested: the first `nested` voices are chosen from the tracks under hf Hz (a client that
    plays only those and mixes at 2*hf gets the best of them), the rest from all"""
    global BURST_TILT, NOISE_EDGES
    if burst_tilt is not None:
        BURST_TILT = burst_tilt
    if noise_edges is not None:
        NOISE_EDGES = list(noise_edges)
    x = load_audio(path)
    if max_seconds: x = x[: int(max_seconds * SR)]
    n_frames = int(math.ceil(len(x) / HOP)) + 1
    peaks, spectra = find_peaks(x, n_frames)
    info = {}
    groups = None
    if analysis == 'v2':
        tracks = track_partials(peaks)
        sal = erb_salience(tracks, spectra, n_frames) if salience == 'erb' else None
        if nested and nested < n_voices:
            lowf = lambda ti: (not hf) or float(np.median(tracks[ti][1])) < hf
            groups = [(range(nested), lowf), (range(nested, n_voices), None)]
        fq, am, att, info['placed'] = choose_tracks(tracks, n_frames, n_voices, salience=sal, groups=groups)
    else:
        fq, am, att = allocate(peaks, n_voices)
    # most energetic voices first: an in-game voice cap then drops the least important ones (nested: within each group)
    if groups:
        e = (am ** 2).sum(0)
        order = np.concatenate([nested * 0 + np.argsort(-e[:nested], kind='stable'), nested + np.argsort(-e[nested:], kind='stable')])
    else:
        order = np.argsort(-(am ** 2).sum(0), kind='stable')
    fq, am, att = fq[:, order], am[:, order], att[:, order]
    if analysis == 'v2':
        nz = (stochastic_residual(spectra, peaks, n_frames) if residual == 'all' else
              fit_noise(spectra, fq, am, n_frames) if residual == 'fit' else residual_noise(spectra, fq, am, n_frames))
        peak0 = max(1e-9, float(np.max(am.sum(1) * 0.55 + nz.sum(1))))
        g0 = (0.9 / peak0) * 10 ** (gain_db / 20)
        keep, info['nsim_lite'], cur = choose_noise_bands(x, fq, am, att, nz, g0)
        for b in range(nz.shape[1]):
            if not keep[b]:
                nz[:, b] = 0.0
        info['noise_bands'] = ''.join('1' if k else '0' for k in keep)
        # drum bursts the same way: a burst band stays only if it helps (on piano they hurt, on drums they help)
        ev = onsets(x, n_frames)
        kb, best_b = choose_bursts(x, cur, ev, g0)
        ev = [e for e in ev if kb[e[2]]]
        info['burst_bands'] = ''.join('1' if k else '0' for k in kb)
        if best_b > info['nsim_lite']:
            info['nsim_lite'] = best_b
    else:
        nz = residual_noise(spectra, fq, am, n_frames)  # band RMS (absolute)
        ev = onsets(x, n_frames)
    # bursts take their energy out of the noise layer of the frame they land in
    for (k, sub, b, a) in ev:
        lo, hi = BURST_BANDS[b]
        e_burst = (a ** 2) * 0.35  # rough share of a 50 ms frame
        for bi in range(len(NOISE_EDGES) - 1):
            if NOISE_EDGES[bi] < hi and NOISE_EDGES[bi + 1] > lo and k < n_frames:
                nz[k, bi] = math.sqrt(max(nz[k, bi] ** 2 - e_burst / 3, 0))
    # normalise: loudest frame (sum of voice amps + noise) -> about 0.9
    peak = max(1e-9, float(np.max(am.sum(1) * 0.55 + nz.sum(1))))
    gain = (0.9 / peak) * 10 ** (gain_db / 20)
    blob, stats = encode(fq, am, att, nz, ev, gain)
    meta = {
        'format': 'spectral-player/1', 'title': title or os.path.splitext(os.path.basename(path))[0], 'artist': artist,
        'fps': FPS, 'frames': n_frames, 'voices': n_voices, 'base': BASE,
        'noise': [[NOISE_EDGES[i], NOISE_EDGES[i + 1]] for i in range(len(NOISE_EDGES) - 1)],
        'bursts': len(BURST_BANDS), 'sub': SUB, 'seconds': round(len(x) / SR, 2),
        'amp': [AMP_FLOOR_DB, AMP_STEP_DB], 'nz': [NZ_FLOOR_DB, NZ_STEP_DB], 'analysis': analysis,
    }
    stats.update(info)
    return x, meta, blob, stats

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('audio'); ap.add_argument('--voices', type=int, default=48)
    ap.add_argument('--out', default=None); ap.add_argument('--title'); ap.add_argument('--artist', default='')
    ap.add_argument('--id', default=None, help='song id (a-z0-9_)')
    ap.add_argument('--preview', action='store_true'); ap.add_argument('--seconds', type=float)
    ap.add_argument('--ts', help='also write a TypeScript module (export default {meta, data}) to this path')
    ap.add_argument('--analysis', choices=['v2', 'v1'], default='v2', help='v2 (default): tracks + analysis by synthesis; v1: the first version')
    args = ap.parse_args()
    out = args.out or os.path.splitext(args.audio)[0]
    x, meta, blob, stats = convert(args.audio, args.voices, args.title, args.artist, max_seconds=args.seconds, analysis=args.analysis)
    meta['id'] = args.id or ''.join(c if c.isalnum() else '_' for c in meta['title'].lower())[:32]
    F, N, M = meta['frames'], meta['voices'], len(meta['noise'])
    # round trip check
    fq, am, att, nz, ev = decode(blob, F, N, M)
    b64 = base64.b64encode(blob).decode()
    with open(out + '.song.json', 'w') as fh:
        json.dump({'meta': meta, 'data': b64}, fh, separators=(',', ':'))
    if args.ts:
        with open(args.ts, 'w') as fh:
            fh.write('// generated by tools/spectral.py from ' + os.path.basename(args.audio) + ' (do not edit)\n')
            fh.write('export default ' + json.dumps({'meta': meta, 'data': b64}, separators=(',', ':'), ensure_ascii=False) + ';\n')
    print(json.dumps({'id': meta['id'], 'frames': F, 'seconds': meta['seconds'], 'bytes': len(blob), 'b64': len(b64),
                      'voice_changes_per_tick': round(stats['changes'] / F, 1),
                      'pitch_calls_per_tick': round(stats['pitch_calls'] / F, 1),
                      'active_voices_avg': round(float((am > 0).sum(1).mean()), 1),
                      'events': len(ev), 'analysis': meta['analysis'], 'noise_bands': stats.get('noise_bands'), 'burst_bands': stats.get('burst_bands'),
                      'nsim_lite': round(stats['nsim_lite'], 4) if 'nsim_lite' in stats else None}, ensure_ascii=False))
    if args.preview:
        y = render(fq, am, att, nz, ev)
        y *= 0.95 / max(1e-9, np.max(np.abs(y)))
        write_wav(out + '.preview.wav', y, 48000)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', out + '.preview.wav', '-b:a', '192k', out + '.preview.mp3'], check=True)
        print('preview:', out + '.preview.mp3', 'LSD(dB)=%.2f' % log_spec_distance(x, y, SR, 48000))

if __name__ == '__main__':
    main()
