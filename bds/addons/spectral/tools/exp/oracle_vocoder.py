"""oracle: the original's own band envelopes on band noise (a channel vocoder) at a control rate, through the client path.
How far can a 32-sound noise vocoder at 50 ms ramps get?  python3 -I vocoder_oracle.py <song> <bands> <frame_ms> [fmax]"""
import sys, json, math
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exp import *
sid, nb, fms = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]); fmax = float(sys.argv[4]) if len(sys.argv) > 4 else 17000
o = C.load(sid, SR); n = len(o)
erb = lambda f: 21.4 * math.log10(1 + 0.00437 * f); inv = lambda e: (10 ** (e / 21.4) - 1) / 0.00437
edges = [inv(erb(50) + (erb(fmax) - erb(50)) * i / nb) for i in range(nb + 1)]
X = np.fft.rfft(o); f = np.fft.rfftfreq(n, 1 / SR)
hop = int(SR * fms / 1000); K = n // hop + 2
rng = np.random.default_rng(0)
y = np.zeros(n)
for b in range(nb):
    m = (f >= edges[b]) & (f < edges[b + 1])
    xb = np.fft.irfft(X * m, n)                                     # the original's band
    # its envelope: RMS over a window of 2 frames centred on each control point
    e = np.array([math.sqrt(float(np.mean(xb[max(0, k * hop - hop):k * hop + hop] ** 2)) + 1e-20) for k in range(K)])
    ph = rng.uniform(0, 2 * np.pi, m.sum())
    Z = np.zeros(len(f), complex); Z[m] = np.exp(1j * ph)
    c = np.fft.irfft(Z, n); c /= math.sqrt(float(np.mean(c * c)) + 1e-20)   # unit-RMS band noise
    env = np.interp(np.arange(n), np.arange(K) * hop, e)               # linear ramps between control points
    y += c * env
v = MT.visqol_score(o, path24(y))
print(json.dumps({'song': sid, 'var': f'vocoder{nb}_{int(fms)}ms_{int(fmax/1000)}k', 'v': round(v, 4)}))
