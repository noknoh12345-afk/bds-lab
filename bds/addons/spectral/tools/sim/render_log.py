"""Render a recorded SoundInstance call log (from run.mjs: the real add-on bundle) the way a client would:
loops start at their play tick, setPitch is a step, fade is a linear ramp, one-shots play their file."""
import json, sys, math, re
import numpy as np
import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import spectral as S
from scipy.io import wavfile

SR = 48000; TICK = SR // 20
log = json.load(open(sys.argv[1]))
inst = {}
end_tick = max(e[1] for e in log) + 40
total = end_tick * TICK + SR
for e in log:
    if e[0] == 'play':
        _, t, iid, ev, pitch, vol, loop, who = e
        inst[iid] = {'ev': ev, 't0': t, 'loop': loop, 'pitch': [(t, pitch)], 'vol': [(t, 0.0, vol)], 'stop': None}
    elif e[0] == 'pitch': inst[e[2]]['pitch'].append((e[1], e[3]))
    elif e[0] == 'fade': inst[e[2]]['vol'].append((e[1], e[3], e[4]))
    elif e[0] == 'vol': inst[e[2]]['vol'].append((e[1], 0.0, e[3]))
    elif e[0] == 'stop': inst[e[2]]['stop'] = e[1]

def env(cmds, t_end):
    out = np.zeros(total); cur = 0.0; last = 0
    for (t, d, v) in cmds:
        s0 = t * TICK
        out[last:s0] = cur
        n = max(1, int(d * SR))
        seg = np.linspace(cur, v, n + 1)[1:]
        out[s0:s0 + n] = seg[: max(0, min(n, total - s0))]
        cur = v; last = s0 + n
    out[last:] = cur
    out[t_end * TICK:] = 0
    return out

osc_amp = 0.9
noise = {b: S.band_noise(S.NOISE_EDGES[b], S.NOISE_EDGES[b + 1], SR, 2.0, 100 + b) for b in range(8)}
bursts = {b: S.burst(b, SR) for b in range(3)}
y = np.zeros(total)
for iid, s in inst.items():
    stop = s['stop'] if s['stop'] is not None else end_tick
    if s['ev'].startswith('spectral.osc'):
        f = np.zeros(total); cur = S.BASE * s['pitch'][0][1]; last = s['t0'] * TICK
        for (t, p) in s['pitch'][1:]:
            f[last:t * TICK] = cur; cur = S.BASE * p; last = t * TICK
        f[last:] = cur
        ph = 2 * np.pi * np.cumsum(f) / SR
        y += osc_amp * np.sin(ph) * env(s['vol'], stop)
    elif m := re.match(r'spectral\.n(\d)', s['ev']):
        b = int(m.group(1)); lp = noise[b]
        sig = np.tile(lp, total // len(lp) + 1)[:total]
        y += sig * env(s['vol'], stop)
    elif m := re.match(r'spectral\.b(\d)_(\d)', s['ev']):
        b, sub = int(m.group(1)), int(m.group(2))
        lead = int(round(sub * SR / 20 / 4))
        z = np.concatenate([np.zeros(lead), bursts[b]]) * s['vol'][0][2] * S.BURST_PEAK_RMS
        s0 = s['t0'] * TICK
        y[s0:s0 + len(z)] += z[: max(0, min(len(z), total - s0))]
# align: the add-on starts the song after building its voices (first fade tick)
start = min(e[1] for e in log if e[0] == 'fade')
y = y[start * TICK:]
x = S.load_audio(sys.argv[2])
print(json.dumps({'start_tick': start, 'LSD_vs_original_dB': round(S.log_spec_distance(x, y, S.SR, SR), 3)}))
if len(sys.argv) > 3:
    yy = y * (0.95 / max(1e-9, np.max(np.abs(y))))
    wavfile.write(sys.argv[3], SR, (yy * 32767).astype(np.int16))
