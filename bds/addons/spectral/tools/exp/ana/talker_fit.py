"""A talker's live stream beside a song, measured in power spectra (a live stream's sines start at a new phase each run, so its
waveform never matches another recording's — tools/exp/ana/duck_fit.py fits waveforms and works only for the sampler).
For each 200 ms window: mix ≈ a × talker-only + b × song-only over 48 log-spaced bands (80 Hz – 8 kHz), non-negative least squares.
Prints, for the windows where the talker speaks: a (the talker kept, 1 = all of it), b (the song's level, ducking lowers it) and the
talker-to-song ratio a·T / b·B in dB.
usage: python3 talker_fit.py <unit dir> <recording dir> <prefix> <talker-only name> <song-only name> <mix name>...
e.g. talker_fit.py . corpus/renders/rec/queue/q105_x tk tn_ja bn_ja off_ja on_ja"""
import sys, json, numpy as np
from scipy.optimize import nnls
sys.path.insert(0, sys.argv[1] + '/tools/metrics'); import metrics as M
D, pre, tn, bn, mixes = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6:]
SR = 48000; W = SR // 5
edges = np.geomspace(80, 8000, 49)
def spec(x):
    f = np.fft.rfftfreq(W, 1 / SR); win = np.hanning(W); out = []
    for i in range(0, len(x) - W, W):
        P = np.abs(np.fft.rfft(x[i:i + W] * win)) ** 2
        out.append([P[(f >= edges[k]) & (f < edges[k + 1])].sum() for k in range(48)])
    return np.array(out)
def env(x): return np.sqrt(np.convolve(x * x, np.ones(480) / 480, 'same')[::480])
def lag(a, b):
    ea, eb = env(a), env(b); n = 1 << int(np.ceil(np.log2(len(ea) + len(eb))))
    c = np.fft.irfft(np.fft.rfft(ea - ea.mean(), n) * np.conj(np.fft.rfft(eb - eb.mean(), n)), n)
    k = int(np.argmax(c)); return (k if k < n // 2 else k - n) * 480
def place(ref, n, l):
    s = np.zeros(n)
    if l >= 0: m = min(len(ref), n - l); s[l:l + m] = ref[:m]
    else: m = min(len(ref) + l, n); s[:m] = ref[-l:-l + m]
    return s
T0, B0 = M.load(f'{D}/{pre}{tn}.opus'), M.load(f'{D}/{pre}{bn}.opus')
out = {}
for mn in mixes:
    X = M.load(f'{D}/{pre}{mn}.opus')
    lt = lag(X - 0, T0); lb = lag(X, B0)
    T, B = place(T0, len(X), lt), place(B0, len(X), lb)
    St, Sb, Sx = spec(T), spec(B), spec(X)
    thr = 0.05 * np.median(St.sum(1)[St.sum(1) > 0]) if (St.sum(1) > 0).any() else 0
    a_s, b_s, r_s = [], [], []
    for i in range(len(Sx)):
        if St[i].sum() <= thr or Sb[i].sum() <= 0: continue
        A = np.stack([St[i], Sb[i]], 1); sc = np.sqrt((A ** 2).sum(0)) + 1e-30
        (a, b), _ = nnls(A / sc, Sx[i]); a /= sc[0]; b /= sc[1]
        a_s.append(a); b_s.append(b)
        r_s.append(10 * np.log10((a * St[i].sum() + 1e-30) / (b * Sb[i].sum() + 1e-30)))
    out[mn] = {'talker_kept': round(float(np.median(a_s)), 3), 'song_level': round(float(np.median(b_s)), 3),
               'talker_to_song_db': round(float(np.median(r_s)), 2), 'windows': len(r_s), 'lag_talker_s': round(lt / SR, 2), 'lag_song_s': round(lb / SR, 2)}
    print(mn, out[mn], flush=True)
print(json.dumps(out))
