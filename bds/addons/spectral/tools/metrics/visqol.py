#!/usr/bin/env python3
"""ViSQOL v3 (conformance 333), audio mode, ported line by line to numpy from google/visqol (Apache-2.0).

Why a port: the official binary needs a Bazel build that this lab cannot always run. This file follows the C++
source of the audio-mode path exactly (same constants, same quirks), and `--conformance <visqol>/testdata` checks it
against the scores the official build must produce (src/include/conformance.h). Report scores from this file as
"ViSQOL v3 audio mode (numpy port, conformance max |dMOS| = x)", never as the official binary's.

Path (visqol_manager.cc / visqol.cc):
  load as mono (mean of channels) -> global alignment (upper envelope xcorr) -> scale deg to the ref SPL ->
  gammatone spectrogram (32 ERB bands from 50 Hz, 80 ms Hann, hop 20 ms, filters reset per frame, band RMS) ->
  dB, floors (-45 dB absolute, 45 dB below the frame peak of either), subtract the common minimum ->
  reference patches of 30 frames -> DP search of the best degraded patch for each (NSIM, search radius 60 patches) ->
  fine realignment of each patch on the audio -> per-band mean NSIM (fvnsim) -> nu-SVR (RBF) -> MOS in [1, 5].

The model file (visqol_libsvm_nu_svr_model.txt) is the official model/libsvm_nu_svr_model.txt, unchanged.
"""
import math, os, sys
import numpy as np
from scipy.signal import lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, 'visqol_libsvm_nu_svr_model.txt')

PATCH_SIZE = 30
NUM_BANDS = 32
MIN_FREQ = 50.0
OVERLAP = 0.25
WINDOW_DURATION = 0.08
SEARCH_WINDOW_RADIUS = 60
SPL_REF = 0.00002
NOISE_FLOOR_REL_DB = 45.0
NOISE_FLOOR_ABS_DB = -45.0
EPS = np.finfo(np.float64).eps
LOWEST = -np.finfo(np.float64).max


# ---------------------------------------------------------------- io
def load_wav_mono(path):
    """misc_audio.cc LoadAsMono: int16 / 32768, mean of the channels."""
    from scipy.io import wavfile
    sr, x = wavfile.read(path)
    if x.dtype == np.int16:
        x = x.astype(np.float64) / 32768.0
    elif x.dtype == np.int32:
        x = (x >> 16).astype(np.float64) / 32768.0
    else:
        x = np.round(np.clip(x.astype(np.float64), -1, 1) * 32767).astype(np.float64) / 32768.0
    if x.ndim == 2:
        x = x.mean(axis=1)
    return x, sr


def to_int16_grid(x):
    """What writing a float signal to a 16-bit WAV and reading it back gives (the official tool reads 16-bit WAV only)."""
    return np.round(np.clip(np.asarray(x, np.float64), -1, 32767 / 32768) * 32768).astype(np.float64) / 32768.0


# ---------------------------------------------------------------- alignment (alignment.cc, envelope.cc, xcorr.cc)
def next_pow_two(n):
    return max(1 << int(n - 1).bit_length(), 1) if n > 1 else 1


def upper_env(x):
    """Envelope::CalcUpperEnv: the 'Hilbert' there drops the imaginary part (Inverse1d keeps the real IFFT of the
    first half), so this is |real IFFT(X * h)| + mean on a power-of-two zero-padded FFT, cut back to len(x)."""
    n = len(x)
    mean = x.mean()
    xc = x - mean
    fft = max(next_pow_two(n), 32)
    X = np.fft.rfft(xc, n=fft)
    h = np.zeros(fft)
    h[0] = 1.0
    h[n // 2] = 1.0 if n % 2 == 0 else 2.0
    h[1:fft // 2] = 2.0
    Y = X * h[:fft // 2 + 1]
    y = np.fft.irfft(Y, n=fft)[:n]
    return np.abs(y) + mean


def lowest_lag_index(s1, s2):
    """XCorr::FindLowestLagIndex: argmax of the circular xcorr over lags -max_lag..max_lag (first maximum)."""
    n = max(len(s1), len(s2))
    a = np.zeros(n); a[:len(s1)] = s1
    b = np.zeros(n); b[:len(s2)] = s2
    max_lag = n - 1
    _, e = math.frexp(abs(n * 2 - 1))
    P = 2 ** e
    corr = np.fft.irfft(np.fft.rfft(a, P) * np.conj(np.fft.rfft(b, P)), P)
    corrs = np.concatenate([corr[P - max_lag:], corr[:max_lag + 1]]) if max_lag > 0 else corr[:1]
    return int(np.argmax(corrs)) - max_lag


def globally_align(ref, deg, sr):
    best = lowest_lag_index(upper_env(ref), upper_env(deg))
    if best == 0 or abs(best) > len(ref) / 2.0:
        return deg, 0.0
    if best < 0:
        new = deg[abs(best):]
    else:
        new = np.concatenate([np.zeros(best), deg])
    return new, best / float(sr)


def align_and_truncate(ref, deg, sr):
    deg2, lag = globally_align(ref, deg, sr)
    nr, nd = len(ref), len(deg2)
    new_ref, new_deg = ref, deg2
    if nr > nd:
        new_ref = ref[:nd]
    elif nr < nd:
        s = int(lag * sr)
        new_ref = ref[s:nr] if s >= 0 else ref[:nr]
        new_deg = deg2[s:nr] if s >= 0 else deg2[:nr]
    return new_ref, new_deg, lag


# ---------------------------------------------------------------- gammatone spectrogram
def erb_filters(sr, num_channels, low_freq, high_freq):
    """EquivalentRectangularBandwidth::MakeFilters (Slaney). Returns cf (high..low) and the coefficient columns."""
    if high_freq > sr / 2.0:
        high_freq = sr / 2.0
    earQ, minBW = 9.26449, 24.7
    a = -(earQ * minBW)
    b = -math.log(high_freq + earQ * minBW)
    c = math.log(low_freq + earQ * minBW)
    d = high_freq + earQ * minBW
    e = (b + c) / num_channels
    cf = np.array([a + math.exp((i + 1) * e) * d for i in range(num_channels)], dtype=np.complex128)
    erb = (cf / earQ) ** 1.0 + minBW ** 1.0
    B = 1.019 * 2 * np.pi * erb
    T = 1.0 / sr
    expBT = np.exp(B * T)
    B1 = -2.0 * np.cos(2.0 * cf * np.pi * T) / expBT
    B2 = np.exp(B * T * -2.0)
    b1 = np.sin(cf * 2.0 * np.pi * T) * T
    bPos = b1 * 2.0 * math.sqrt(3.0 + 2.0 ** 1.5)
    bNeg = b1 * 2.0 * math.sqrt(3.0 - 2.0 ** 1.5)
    aa = np.cos(cf * 2.0 * np.pi * T) * 2.0 * T
    A11 = -(aa / expBT + bPos / expBT) / 2.0
    A12 = -(aa / expBT - bPos / expBT) / 2.0
    A13 = -(aa / expBT + bNeg / expBT) / 2.0
    A14 = -(aa / expBT - bNeg / expBT) / 2.0
    p1 = 2.0 ** 1.5
    s1 = math.sqrt(3.0 - p1)
    s2 = math.sqrt(3.0 + p1)
    xExp = np.exp(4.0 * 1j * cf * np.pi * T)
    x01 = -2.0 * xExp * T
    x02 = 2.0 * np.exp(-(B * T) + 2.0 * 1j * cf * np.pi * T) * T
    xCos = np.cos(2.0 * cf * np.pi * T)
    xSin = np.sin(2.0 * cf * np.pi * T)
    x1 = x01 + x02 * (xCos - s1 * xSin)
    x2 = x01 + x02 * (xCos + s1 * xSin)
    x3 = x01 + x02 * (xCos - s2 * xSin)
    x4 = x01 + x02 * (xCos + s2 * xSin)
    x5 = (-2.0 / np.exp(2 * B * T)) - 2 * xExp + (2 * (1 + xExp)) / np.exp(B * T)
    gain = np.abs((x1 * x2 * x3 * x4) / (x5 ** 4.0))
    n = num_channels
    cols = [np.full(n, T), A11.real, A12.real, A13.real, A14.real, np.zeros(n), np.ones(n), B1.real, B2.real, gain]
    return cf.real, np.stack(cols, 1)


class Gammatone:
    def __init__(self, sr, num_bands=NUM_BANDS, min_freq=MIN_FREQ):
        cf, coeffs = erb_filters(sr, num_bands, min_freq, sr / 2.0)
        coeffs = coeffs[::-1]                     # FlipUpDown: row 0 = lowest band
        self.cf = cf[::-1].copy()
        self.coeffs = coeffs
        self.size = int(round(sr * WINDOW_DURATION))
        self.hop = int(self.size * OVERLAP)
        i = np.arange(self.size)
        self.win = 0.5 - (0.5 * np.cos(2.0 * np.pi * i / (self.size - 1)))

    def build(self, sig):
        """GammatoneSpectrogramBuilder::Build -> (bands, frames) band RMS (linear)."""
        L, hop = self.size, self.hop
        if len(sig) <= L:
            raise ValueError(f'too few samples ({len(sig)}) to build a spectrogram ({L} needed)')
        ncols = 1 + (len(sig) - L) // hop
        idx = np.arange(ncols)[:, None] * hop + np.arange(L)[None, :]
        frames = sig[idx] * self.win[None, :]
        out = np.empty((NUM_BANDS, ncols))
        for ch in range(NUM_BANDS):
            A0, A11, A12, A13, A14, A2, B0, B1, B2, g = self.coeffs[ch]
            den = [B0, B1, B2]
            y = lfilter([A0 / g, A11 / g, A2 / g], den, frames, axis=1)
            y = lfilter([A0, A12, A2], den, y, axis=1)
            y = lfilter([A0, A13, A2], den, y, axis=1)
            y = lfilter([A0, A14, A2], den, y, axis=1)
            out[ch] = np.sqrt(np.mean(y * y, axis=1))
        return out


def prepare_for_comparison(ref, deg):
    """MiscAudio::PrepareSpectrogramsForComparison (works on copies)."""
    def to_db(s):
        a = np.abs(s)
        a = np.where(a == 0, EPS, a)
        return 10 * np.log10(a)
    r = np.maximum(to_db(ref), NOISE_FLOOR_ABS_DB)
    d = np.maximum(to_db(deg), NOISE_FLOOR_ABS_DB)
    m = min(r.shape[1], d.shape[1])
    if m:
        floor = np.maximum(r[:, :m].max(0), d[:, :m].max(0)) - NOISE_FLOOR_REL_DB
        r[:, :m] = np.maximum(r[:, :m], floor[None, :])
        d[:, :m] = np.maximum(d[:, :m], floor[None, :])
    lowest = min(r.min(), d.min())
    return r - lowest, d - lowest


# ---------------------------------------------------------------- NSIM (neurogram_similiarity_index_measure.cc)
W3 = np.array([0.0113033910173052, 0.0838251475442633, 0.0113033910173052,
               0.0838251475442633, 0.619485845753726, 0.0838251475442633,
               0.0113033910173052, 0.0838251475442633, 0.0113033910173052]).reshape(3, 3)


def conv_boundary(x):
    """Convolution2D::Valid2DConvWithBoundary for a stack (..., rows, cols): edge-replicated 1-pixel border, 3x3 window."""
    p = np.pad(x, [(0, 0)] * (x.ndim - 2) + [(1, 1), (1, 1)], mode='edge')
    R, C = x.shape[-2], x.shape[-1]
    out = np.zeros(x.shape)
    w = W3[::-1, ::-1]          # the C++ walks the filter backwards (symmetric: no change)
    for dr in range(3):
        for dc in range(3):
            out += p[..., dr:dr + R, dc:dc + C] * w[dr, dc]
    return out


def nsim(ref, deg):
    """MeasurePatchSimilarity for a stack of degraded patches against one reference (broadcasting).
    Returns similarity (...,), freq_band_means (..., bands), freq_band_stddevs (..., bands)."""
    c1 = (0.01 * 1.0) ** 2
    c3 = (0.03 * 1.0) ** 2 / 2
    mu_r = conv_boundary(ref); mu_d = conv_boundary(deg)
    ref_mu_sq = mu_r * mu_r; deg_mu_sq = mu_d * mu_d; mu_r_mu_d = mu_r * mu_d
    sigma_r_sq = conv_boundary(ref * ref) - ref_mu_sq
    sigma_d_sq = conv_boundary(deg * deg) - deg_mu_sq
    sigma_r_d = conv_boundary(ref * deg) - mu_r_mu_d
    intensity = (mu_r_mu_d * 2.0 + c1) / (ref_mu_sq + deg_mu_sq + c1)
    sd = sigma_r_sq * sigma_d_sq
    structure_denom = np.where(sd < 0.0, c3, np.sqrt(np.maximum(sd, 0.0)) + c3)
    structure = (sigma_r_d + c3) / structure_denom
    sim_map = intensity * structure
    means = sim_map.mean(-1)
    stds = sim_map.std(-1, ddof=1) if sim_map.shape[-1] > 1 else np.zeros(means.shape)
    return means.mean(-1), means, stds


# ---------------------------------------------------------------- patches (image_patch_creator.cc, comparison_patches_selector.cc)
def ref_patch_indices(ncols, patch=PATCH_SIZE):
    init = patch // 2
    if ncols < patch + init:
        raise ValueError(f'reference spectrum size ({ncols}) smaller than minimum patch size ({patch + init})')
    max_index = ncols - patch if init < (ncols - patch) else init + 1
    return [i - 1 for i in range(init, max_index, patch)]


def deg_patch_stack(spec, width):
    """BuildDegradedPatch for every offset 0..ncols-1 (zero padded past the end)."""
    rows, ncols = spec.shape
    padded = np.concatenate([spec, np.zeros((rows, width))], 1)
    idx = np.arange(ncols)[:, None] + np.arange(width)[None, :]
    return np.transpose(padded[:, idx], (1, 0, 2))      # (offset, rows, width)


def slice_signal(x, sr, t0, t1):
    """ComparisonPatchesSelector::Slice (including its quirk: silence for a slice past the end goes in front)."""
    n = len(x)
    s = max(0, int(t0 * sr))
    e = min(n - 1, int(t1 * sr))
    out = x[s:e] if e > s else np.zeros(0)
    diff = t1 * sr - n
    if diff > 0:
        out = np.concatenate([np.zeros(int(diff)), out])
    if t0 < 0:
        out = np.concatenate([np.zeros(int(-1 * t0 * sr)), out])
    return out


class Result:
    pass


def visqol(ref, deg, sr=48000, return_details=False):
    """MOS-LQO of deg against ref (1-D float arrays at the same rate, 48 kHz expected)."""
    ref = np.asarray(ref, np.float64); deg = np.asarray(deg, np.float64)
    deg, lag = globally_align(ref, deg, sr)
    # Visqol::CalculateSimilarity
    def spl(x):
        return 20 * math.log10(math.sqrt(np.sum(x * x) / len(x)) / SPL_REF)
    deg = deg * (10 ** ((spl(ref) - spl(deg)) / 20))
    gt = Gammatone(sr)
    rs, ds = prepare_for_comparison(gt.build(ref), gt.build(deg))
    idx = ref_patch_indices(rs.shape[1])
    frame_duration = int(gt.size * OVERLAP) / float(sr)
    ref_patches = [rs[:, i:i + PATCH_SIZE] for i in idx]
    # FindMostOptimalDegPatches
    nfd = ds.shape[1]
    num_patches = len(idx)
    while num_patches and idx[num_patches - 1] - math.floor(PATCH_SIZE / 2) > nfd:
        num_patches -= 1
    if not num_patches:
        raise ValueError('degraded file too short, different or misaligned to score any reference patch')
    search = SEARCH_WINDOW_RADIUS * PATCH_SIZE
    stack = deg_patch_stack(ds, PATCH_SIZE)
    dp = np.zeros((len(idx), nfd))
    back = np.zeros((len(idx), nfd), dtype=np.int64)
    for p in range(num_patches):
        lo = max(0, idx[p] - search); hi = min(nfd - 1, idx[p] + search)
        offs = np.arange(lo, hi + 1)
        sims, _, _ = nsim(ref_patches[p][None], stack[offs])
        if p == 0:
            dp[0, offs] = sims; back[0, offs] = -1
            continue
        prev = dp[p - 1]
        lower = max(idx[p - 1] - search, 0)
        # best previous offset strictly before each slide offset (ties: the highest index, as the C++ loop scans down)
        best_val = np.full(nfd + 1, LOWEST); best_idx = np.full(nfd + 1, -1, dtype=np.int64)
        cur_v, cur_i = LOWEST, -1
        for o in range(lower, nfd):
            # best_val[o+1] = max over prev[lower..o]; '>=' keeps the highest index among equal values
            if prev[o] >= cur_v:
                cur_v, cur_i = prev[o], o
            best_val[o + 1], best_idx[o + 1] = cur_v, cur_i
        for k, o in enumerate(offs):
            hv = best_val[o] if o > lower else LOWEST
            hi_ = best_idx[o] if o > lower else -1
            s = sims[k] + hv
            past = hi_
            if prev[o] > s:
                s = prev[o]; past = o
            dp[p, o] = s; back[p, o] = past
    last = num_patches - 1
    lower = max(0, idx[last] - search)
    best, last_off = LOWEST, None
    for o in range(lower, idx[last] + search + 1):
        if o >= nfd:
            break
        if dp[last, o] > best:
            best, last_off = dp[last, o], o
    patch_duration = frame_duration * PATCH_SIZE
    results = [None] * num_patches
    for p in range(num_patches - 1, -1, -1):
        dpatch = stack[last_off]
        s, m, sd = nsim(ref_patches[p], dpatch)
        r = Result(); r.similarity = float(s); r.means = m.copy(); r.stds = sd.copy()
        if last_off == back[p, last_off]:
            r.deg_start = r.deg_end = 0.0; r.similarity = 0.0; r.means = np.zeros_like(m)
        else:
            r.deg_start = last_off * frame_duration; r.deg_end = r.deg_start + patch_duration
        r.ref_start = idx[p] * frame_duration; r.ref_end = r.ref_start + patch_duration
        results[p] = r
        last_off = back[p, last_off]
    # FinelyAlignAndRecreatePatches
    final = []
    for r in results:
        if r.deg_start == r.deg_end and r.deg_start == 0.0:
            final.append(r); continue
        ra = slice_signal(ref, sr, r.ref_start, r.ref_end)
        da = slice_signal(deg, sr, r.deg_start, r.deg_end)
        ra2, da2, plag = align_and_truncate(ra, da, sr)
        try:
            nr, nd = prepare_for_comparison(gt.build(ra2), gt.build(da2))
        except ValueError:
            final.append(r); continue
        w = min(nr.shape[1], nd.shape[1])
        s, m, sd = nsim(nr[:, :w], nd[:, :w]) if nr.shape[1] == nd.shape[1] else nsim(nr[:, :w], nd[:, :w])
        if s < r.similarity:
            final.append(r); continue
        q = Result(); q.similarity = float(s); q.means = m; q.stds = sd
        if plag > 0.0:
            q.ref_start = r.ref_start + plag; q.deg_start = r.deg_start
        else:
            q.ref_start = r.ref_start; q.deg_start = r.deg_start - plag
        q.ref_end = q.ref_start + len(ra2) / float(sr)
        q.deg_end = q.deg_start + len(da2) / float(sr)
        final.append(q)
    fvnsim = np.mean([r.means for r in final], 0)
    mos = svr_predict(fvnsim)
    vnsim = float(fvnsim.sum() / len(fvnsim))
    if vnsim < 0.15:
        mos = 1.0
    if not return_details:
        return mos
    out = Result(); out.moslqo = mos; out.vnsim = vnsim; out.fvnsim = fvnsim; out.lag = lag; out.cf = gt.cf
    out.patches = final
    return out


# ---------------------------------------------------------------- nu-SVR (libsvm model file)
_svr = None


def _load_svr(path=MODEL):
    global _svr
    if _svr is None:
        lines = open(path).read().split('\n')
        head = {}
        i = 0
        while lines[i].strip() != 'SV':
            k, *v = lines[i].split()
            head[k] = v
            i += 1
        coefs, svs = [], []
        for ln in lines[i + 1:]:
            if not ln.strip():
                continue
            parts = ln.split()
            coefs.append(float(parts[0]))
            v = np.zeros(NUM_BANDS)
            for t in parts[1:]:
                j, x = t.split(':')
                v[int(j) - 1] = float(x)
            svs.append(v)
        _svr = (float(head['gamma'][0]), float(head['rho'][0]), np.array(coefs), np.stack(svs))
    return _svr


def svr_predict(fv):
    gamma, rho, coef, sv = _load_svr()
    d = ((sv - fv[None, :]) ** 2).sum(1)
    pred = float((coef * np.exp(-gamma * d)).sum() - rho)
    return max(1.0, min(5.0, pred))


# ---------------------------------------------------------------- cli
CONFORMANCE = [  # (reference, degraded, expected MOS) from tests/conformance_test.cc + src/include/conformance.h
    ('strauss48_stereo.wav', 'strauss48_stereo_lp35.wav', 1.3888791489130758),
    ('steely48_stereo.wav', 'steely48_stereo_lp7.wav', 2.2501683734385183),
    ('sopr48_stereo.wav', 'sopr48_stereo_256kbps_aac.wav', 4.68228969737946),
    ('ravel48_stereo.wav', 'ravel48_stereo_128kbps_opus.wav', 4.465141897255348),
    ('moonlight48_stereo.wav', 'moonlight48_stereo_128kbps_aac.wav', 4.684292801646114),
    ('harpsichord48_stereo.wav', 'harpsichord48_stereo_96kbps_mp3.wav', 4.22374532766003),
    ('guitar48_stereo.wav', 'guitar48_stereo_64kbps_aac.wav', 4.349722308064298),
    ('glock48_stereo.wav', 'glock48_stereo_48kbps_aac.wav', 4.332452943882108),
    ('contrabassoon48_stereo.wav', 'contrabassoon48_stereo_24kbps_aac.wav', 2.346868205375293),
    ('castanets48_stereo.wav', 'castanets48_stereo.wav', 4.732101253042348),
]


def main():
    import argparse, json, time
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('ref', nargs='?'); ap.add_argument('deg', nargs='?')
    ap.add_argument('--conformance', metavar='TESTDATA_DIR', help='<google/visqol>/testdata: check the port against the official scores')
    a = ap.parse_args()
    if a.conformance:
        d = os.path.join(a.conformance, 'conformance_testdata_subset')
        worst = 0.0
        rows = []
        for r, g, want in CONFORMANCE:
            t0 = time.time()
            x, sr = load_wav_mono(os.path.join(d, r)); y, _ = load_wav_mono(os.path.join(d, g))
            got = visqol(x, y, sr)
            worst = max(worst, abs(got - want))
            rows.append({'pair': g, 'expected': round(want, 6), 'port': round(got, 6), 'diff': round(got - want, 6), 's': round(time.time() - t0, 1)})
            print(json.dumps(rows[-1]), flush=True)
        print(json.dumps({'conformance_max_abs_diff': round(worst, 6)}))
        return
    x, sr = load_wav_mono(a.ref); y, sr2 = load_wav_mono(a.deg)
    assert sr == sr2, 'sample rates differ'
    print(json.dumps({'moslqo': visqol(x, y, sr)}))


if __name__ == '__main__':
    main()
