"""oracle 2: the same vocoder, but each 50 ms tick gets one fade(d, v) — linear from where it is to v over d ms, then held —
with d and v chosen per tick and band to follow the original's 5 ms envelope (greedy, squared dB error). How much does the
fade's free length win over a 50 ms ramp?  python3 -I vocoder_oracle2.py <song> <bands> <d choices ms, comma>"""
import sys, json, math
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exp import *
sid, nb = sys.argv[1], int(sys.argv[2]); ds = [float(x) for x in sys.argv[3].split(',')]
o = C.load(sid, SR); n = len(o)
erb = lambda f: 21.4 * math.log10(1 + 0.00437 * f); inv = lambda e: (10 ** (e / 21.4) - 1) / 0.00437
edges = [inv(erb(50) + (erb(17000) - erb(50)) * i / nb) for i in range(nb + 1)]
X = np.fft.rfft(o); f = np.fft.rfftfreq(n, 1 / SR)
TICK = 2400; fine = 240                                              # 50 ms ticks, a 5 ms fine envelope
K = n // TICK + 1
rng = np.random.default_rng(0)
y = np.zeros(n)
for b in range(nb):
    m = (f >= edges[b]) & (f < edges[b + 1])
    xb = np.fft.irfft(X * m, n)
    nf = n // fine
    e5 = np.sqrt(np.convolve(xb[:nf * fine].reshape(nf, fine).__pow__(2).mean(1), np.ones(3) / 3, mode='same') + 1e-20)   # 5 ms RMS, lightly smoothed
    L = lambda a: 20 * np.log10(np.maximum(a, 1e-6))
    env = np.zeros(n); cur = e5[0]
    for k in range(K):
        s0 = k * TICK; i0 = s0 // fine; i1 = min(nf, i0 + TICK // fine)
        if i0 >= nf: break
        tgt = e5[i0:i1]
        best = None
        for d in ds:
            nd = max(1, int(d / 5))
            # v: the level that fits best after the ramp (mean in dB of the target past the ramp, or of the whole tick)
            tail = tgt[min(nd, len(tgt) - 1):] if nd < len(tgt) else tgt[-1:]
            v = 10 ** (np.mean(L(tail)) / 20)
            fr = np.minimum(1.0, (np.arange(len(tgt)) + 1) / nd)
            seg = cur + (v - cur) * fr
            err = float(np.sum((L(seg) - L(tgt)) ** 2))
            if best is None or err < best[0]: best = (err, d, v)
        _, d, v = best
        nd = int(d * SR / 1000)
        t = np.arange(min(TICK, n - s0))
        env[s0:s0 + len(t)] = cur + (v - cur) * np.minimum(1.0, (t + 1) / nd)
        cur = v
    ph = rng.uniform(0, 2 * np.pi, m.sum())
    Z = np.zeros(len(f), complex); Z[m] = np.exp(1j * ph)
    c = np.fft.irfft(Z, n); c /= math.sqrt(float(np.mean(c * c)) + 1e-20)
    y += c * env
v = MT.visqol_score(o, path24(y))
print(json.dumps({'song': sid, 'var': f'vocoder{nb}_fade_' + '_'.join(str(int(d)) for d in ds), 'v': round(v, 4)}))
