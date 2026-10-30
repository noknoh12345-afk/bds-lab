#!/usr/bin/env python3
"""Quality metrics for Spectral Player: reference (original MP3, decoded) against a test signal (game recording,
emulator render, OGG ceiling ...). All at 48 kHz mono unless noted.

  visqol      ViSQOL v3 audio mode (tools/metrics/visqol.py: numpy port, equal to the official conformance scores
              to 1e-13). Both signals get one common gain (peak of the reference -> 0.999 if it is above) and the
              16-bit grid, as the official tool reads 16-bit WAV files.
  mrstft      multi-resolution STFT distance (spectral convergence + mean |log10 magnitude|, FFT 256..4096, hop 1/4,
              Hann), after alignment and RMS level matching; lower is better.
  third_oct   mean |dB| of 1/3-octave band energies (50 ms frames, loudness-weighted as in tools/spectral.py
              log_spec_distance), after alignment and level matching; lower is better.
  onset_ms    median |time offset| of matched onsets (spectral flux, 2.5 ms hop, +-40 ms matching window) and
              onset_recall (share of reference onsets found in the test).

python3 tools/metrics/metrics.py ref.(mp3|wav|ogg) test.(...)   -> one JSON line
"""
import json, math, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import visqol as V

SR = 48000


def load(path, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def align(ref, test):
    """test shifted onto ref (ViSQOL's global alignment), then both cut to the shorter length"""
    t, _ = V.globally_align(ref, test, SR)
    n = min(len(ref), len(t))
    return ref[:n], t[:n]


def level_match(ref, test):
    rr = math.sqrt(np.mean(ref * ref) + 1e-20); rt = math.sqrt(np.mean(test * test) + 1e-20)
    return test * (rr / rt)


def visqol_score(ref, test):
    test = level_match(ref, test)          # ViSQOL scales to the reference SPL anyway; done first so 16 bits never clip it
    g = min(1.0, 0.999 / max(1e-9, np.max(np.abs(ref)), np.max(np.abs(test))))
    return V.visqol(V.to_int16_grid(ref * g), V.to_int16_grid(test * g), SR)


def mrstft(ref, test, sizes=(256, 512, 1024, 2048, 4096)):
    tot = 0.0
    for n in sizes:
        hop = n // 4
        w = np.hanning(n)
        m = (min(len(ref), len(test)) - n) // hop
        if m < 1:
            continue
        idx = np.arange(m)[:, None] * hop + np.arange(n)[None, :]
        A = np.abs(np.fft.rfft(ref[idx] * w, axis=1)); B = np.abs(np.fft.rfft(test[idx] * w, axis=1))
        sc = np.linalg.norm(A - B) / max(1e-12, np.linalg.norm(A))
        lm = np.mean(np.abs(np.log10(A + 1e-7) - np.log10(B + 1e-7)))
        tot += sc + lm
    return tot / len(sizes)


def third_oct(ref, test):
    def bands(x):
        nw = int(SR * 0.05); n = len(x) // nw
        X = np.abs(np.fft.rfft(x[: n * nw].reshape(n, nw) * np.hanning(nw), axis=1)) ** 2
        f = np.fft.rfftfreq(nw, 1 / SR)
        edges = 50 * 2 ** (np.arange(0, 28) / 3)
        return 10 * np.log10(np.stack([X[:, (f >= edges[i]) & (f < edges[i + 1])].sum(1) for i in range(len(edges) - 1)], 1) + 1e-10)
    A = bands(ref); B = bands(test)
    n = min(len(A), len(B)); A, B = A[:n], B[:n]
    w = np.clip(A - (A.max() - 60), 0, None)
    return float((np.abs(A - B) * w).sum() / w.sum())


def onsets(x, hop=120, n=1024):
    w = np.hanning(n)
    m = (len(x) - n) // hop
    idx = np.arange(m)[:, None] * hop + np.arange(n)[None, :]
    L = np.log1p(100 * np.abs(np.fft.rfft(x[idx] * w, axis=1))[:, 2:400])
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    ref = maximum_filter1d(L, 3, axis=1)
    flux = np.zeros(m); flux[2:] = np.maximum(L[2:] - ref[:-2], 0).mean(1)
    mean = uniform_filter1d(flux, 41, mode='nearest')
    loc = maximum_filter1d(flux, 13, mode='nearest')
    thr = max(0.02, np.percentile(flux, 90) * 0.5)
    pk = np.nonzero((flux == loc) & (flux > mean + thr))[0]
    return (pk * hop + n / 2) / SR


def onset_offsets(ref, test, win=0.040):
    a = onsets(ref); b = onsets(test)
    if not len(a):
        return None, None
    d = []
    for t in a:
        if len(b):
            j = np.argmin(np.abs(b - t))
            if abs(b[j] - t) <= win:
                d.append(abs(b[j] - t) * 1000)
    return (float(np.median(d)) if d else None), len(d) / len(a)


def report(ref, test, do_visqol=True):
    r, t = align(ref, test)
    t = level_match(r, t)
    out = {}
    if do_visqol:
        out['visqol'] = round(visqol_score(ref, test), 4)
    out['mrstft'] = round(mrstft(r, t), 4)
    out['third_oct_db'] = round(third_oct(r, t), 3)
    med, rec = onset_offsets(r, t)
    out['onset_ms'] = None if med is None else round(med, 2)
    out['onset_recall'] = None if rec is None else round(rec, 3)
    return out


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    print(json.dumps(report(load(sys.argv[1]), load(sys.argv[2]))))
