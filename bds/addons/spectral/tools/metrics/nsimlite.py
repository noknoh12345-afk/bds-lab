"""NSIM-lite: ViSQOL's similarity core on an STFT filterbank, for time-aligned signals (a render against its original).
Same framing as ViSQOL (80 ms Hann, 20 ms hop), 32 bands on the ERB scale from 50 Hz, its dB floors and its 3x3 NSIM,
but no patch search (the render is aligned by construction) and no SVR. Fast enough to decide inside the converter
whether a layer helps; tools/metrics/visqol.py stays the measure that is reported."""
import math
import numpy as np
from visqol import erb_filters, prepare_for_comparison, nsim


def bands_of(sr, n_fft, n_bands=32, lo=50.0):
    cf, _ = erb_filters(sr, n_bands, lo, sr / 2.0)
    cf = np.sort(cf)
    erb = 24.7 + cf / 9.26449
    f = np.fft.rfftfreq(n_fft, 1 / sr)
    W = np.exp(-0.5 * ((f[None, :] - cf[:, None]) / (0.5 * erb[:, None])) ** 2)     # ~ one ERB wide, gaussian
    return W / W.sum(1, keepdims=True)


_cache = {}


def spectrogram(x, sr=48000):
    n = int(round(sr * 0.08)); hop = n // 4; n_fft = 4096
    key = (sr, n_fft)
    if key not in _cache:
        _cache[key] = bands_of(sr, n_fft)
    W = _cache[key]
    m = 1 + (len(x) - n) // hop
    idx = np.arange(m)[:, None] * hop + np.arange(n)[None, :]
    w = np.hanning(n)
    P = np.abs(np.fft.rfft(x[idx] * w, n_fft, axis=1)) ** 2
    return np.sqrt((W @ P.T) / n)          # (bands, frames) band RMS


def nsim_lite(ref, test, sr=48000, per_frame=False):
    n = min(len(ref), len(test))
    r, d = prepare_for_comparison(spectrogram(ref[:n], sr), spectrogram(test[:n], sr))
    s, means, _ = nsim(r, d)
    if not per_frame:
        return float(s)
    return float(s), r, d
