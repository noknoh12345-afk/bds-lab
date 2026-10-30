#!/usr/bin/env python3
"""Write the add-on's resource-pack sounds + sound_definitions.json + src/assets.ts.

  rp/sounds/spectral/osc.ogg        1 s, 48 kHz, 1760 Hz sine (exactly 1760 periods: seamless loop)
  rp/sounds/spectral/n<b>.ogg       2 s band-limited noise loops (circular FFT synthesis: seamless)
  rp/sounds/spectral/b<band>_<s>.ogg one-shot bursts, s*12.5 ms of leading silence (sub-tick timing)

Sound events: spectral.osc / spectral.n<b> / spectral.b<band>_<s>  (2D, category ui: follow the
listener, no range limit)  and  the same names + "_3d" (3D, category record) for the speaker mode.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import spectral as S
from scipy.io import wavfile

SR = 48000
unit = [a for a in sys.argv[1:] if not a.startswith('--')][0]
snd = os.path.join(unit, 'rp', 'sounds', 'spectral'); os.makedirs(snd, exist_ok=True)

FORCE = '--force' in sys.argv


def ogg(name, y, q='8', loop=True):
    y = np.asarray(y, dtype=np.float64)
    peak = np.max(np.abs(y))
    assert peak <= 0.999, (name, peak)
    ch = 1 if y.ndim == 1 else y.shape[1]
    out = os.path.join(snd, name + '.ogg')
    if FORCE or not os.path.exists(out):
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
            wavfile.write(t.name, SR, (y * 32767).astype(np.int16))
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', t.name, '-c:a', 'libvorbis', '-q:a', q, out], check=True)
        os.unlink(t.name)
    # verify: decoded length must equal the source length (loops must not grow a gap)
    dec = subprocess.run(['ffmpeg', '-v', 'error', '-i', out, '-f', 's16le', '-ac', str(ch), '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    d = np.frombuffer(dec, np.int16) / 32767.0
    if ch > 1:
        d = d.reshape(-1, ch); y = y.reshape(-1, ch)
    n = len(d)
    if loop:
        assert n == len(y), (name, n, len(y))
    else:
        # one-shots: the start must not move (sub-tick timing); a few trailing samples may go
        m = min(n, len(y))
        dm = d[:m] if d.ndim == 1 else d[:m].sum(1); ym = y[:m] if y.ndim == 1 else y[:m].sum(1)
        c = np.correlate(dm, ym, 'full')
        lag = int(np.argmax(c)) - (m - 1)
        assert lag == 0, (name, 'start moved by', lag)
    return d

OSC_AMP = 0.9
osc = S.sine_loop(SR, 1.0, S.BASE) * OSC_AMP
d = ogg('osc', osc, q='10')
# loop seam check: the jump across the wrap must look like any other step of the sine
steps = np.abs(np.diff(np.concatenate([d, d[:1]])))
seam, typical = steps[-1], steps[:-1].max()
print('osc seam step %.4f  max step %.4f' % (seam, typical))
assert seam <= typical * 1.05

noise_rms = []
for b in range(len(S.NOISE_EDGES) - 1):
    y = S.band_noise(S.NOISE_EDGES[b], S.NOISE_EDGES[b + 1], SR, 2.0, 100 + b)
    y = y * min(1.0, 0.95 / np.max(np.abs(y)))
    dd = ogg('n%d' % b, y)
    noise_rms.append(float(np.sqrt(np.mean(dd ** 2))))

burst_rms = []
for b in range(len(S.BURST_BANDS)):
    y = S.burst(b, SR)
    y = y * min(1.0, 0.95 / np.max(np.abs(y)))
    burst_rms.append(float(np.sqrt(np.mean(y[: int(0.01 * SR)] ** 2))))
    for s in range(S.SUB):
        lead = np.zeros(int(round(s * SR / S.FPS / S.SUB)))
        ogg('b%d_%d' % (b, s), np.concatenate([lead, y]), loop=False)

# ---- calibration sounds for tools/rig (/spectral:calib): never used by songs
t = np.arange(int(0.004 * SR)) / SR
click = np.sin(2 * np.pi * (1000 * t + 0.5 * (12000 - 1000) / 0.004 * t * t)) * np.hanning(len(t)) * 0.9
ogg('sync', np.concatenate([click, np.zeros(int(0.02 * SR))]), q='10', loop=False)
tt = np.arange(SR) / SR                                      # 1 s: 500 -> 4500 -> 500 Hz, phase-continuous (2500 cycles)
fi = np.where(tt < 0.5, 500 + 8000 * tt, 4500 - 8000 * (tt - 0.5))
chirp0 = np.sin(2 * np.pi * np.cumsum(fi) / SR) * 0.9
# (libvorbis + ffmpeg lose 128 samples of some signals: rotate the loop until the decoded length is exact)
_rolls = (0, 7000, 13000, 21000, 29000, 37000)
_cp = os.path.join(snd, 'chirp.ogg')
if os.path.exists(_cp) and not FORCE:      # the file there already: find the rotation it was made with
    _d = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', _cp, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], check=True, capture_output=True).stdout, np.int16) / 32767.0
    _rolls = (max(_rolls, key=lambda r: float(np.dot(_d[:SR], np.roll(chirp0, r)[:len(_d[:SR])]))),)
for CHIRP_ROLL in _rolls:
    chirp = np.roll(chirp0, CHIRP_ROLL)
    path = os.path.join(snd, 'chirp.ogg')
    if FORCE and os.path.exists(path):
        os.unlink(path)
    try:
        ogg('chirp', chirp, q='10'); break
    except AssertionError:
        os.unlink(path)
ogg('chirp1', chirp, q='10', loop=False)
for nm, f0 in (('osc220', 220.0), ('osc7040', 7040.0)):
    ogg(nm, S.sine_loop(SR, 1.0, f0) * OSC_AMP, q='10')
sine = S.sine_loop(SR, 1.0, S.BASE) * OSC_AMP
ogg('oscL', np.stack([sine, np.zeros_like(sine)], 1), q='10')
ogg('oscR', np.stack([np.zeros_like(sine), sine], 1), q='10')

# ---- the ceiling for the rig: the demo's original as an ordinary sound (self-made: tools/make_demo_song.py). What any
# in-game playback of the demo can at best sound like through the same client and recorder (tools/rig, SPEC.md)
if not os.path.exists(os.path.join(snd, 'ceiling_demo.ogg')):
    with tempfile.TemporaryDirectory() as d:
        subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'make_demo_song.py'), os.path.join(d, 'demo')], check=True, capture_output=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', os.path.join(d, 'demo.wav'), '-ar', str(SR), '-c:a', 'libvorbis', '-q:a', '8', os.path.join(snd, 'ceiling_demo.ogg')], check=True)

defs = {}
def ev(name, path, d3):
    if d3:
        defs[name + '_3d'] = {'category': 'record', 'min_distance': 3.0, 'max_distance': 48.0,
                              'sounds': [{'name': path, 'is3D': True, 'volume': 1.0}]}
    else:
        defs[name] = {'category': 'ui', 'sounds': [{'name': path, 'is3D': False, 'volume': 1.0}]}
for d3 in (False, True):
    ev('spectral.osc', 'sounds/spectral/osc', d3)
    for b in range(len(noise_rms)): ev('spectral.n%d' % b, 'sounds/spectral/n%d' % b, d3)
    for b in range(len(burst_rms)):
        for s in range(S.SUB): ev('spectral.b%d_%d' % (b, s), 'sounds/spectral/b%d_%d' % (b, s), d3)
for nm in ('sync', 'chirp', 'chirp1', 'osc220', 'osc7040', 'oscL', 'oscR'):
    ev('spectral.' + nm, 'sounds/spectral/' + nm, False)
defs['spectral.ceiling_demo'] = {'category': 'ui', 'sounds': [{'name': 'sounds/spectral/ceiling_demo', 'is3D': False, 'volume': 1.0, 'stream': True}]}
for cat in ('music', 'record'):
    defs['spectral.osc_' + cat] = {'category': cat, 'sounds': [{'name': 'sounds/spectral/osc', 'is3D': False, 'volume': 1.0}]}
with open(os.path.join(unit, 'rp', 'sounds', 'sound_definitions.json'), 'w') as f:
    json.dump({'format_version': '1.20.20', 'sound_definitions': defs}, f, indent=1)

ts = f"""// generated by tools/make_rp_assets.py — levels of the sounds in rp/sounds/spectral (do not edit)
export const OSC_AMP = {OSC_AMP};                 // peak of the 1760 Hz sine loop
export const BASE_HZ = {S.BASE};
export const NOISE_RMS = {json.dumps([round(x, 6) for x in noise_rms])};
export const NOISE_BANDS = {json.dumps([[S.NOISE_EDGES[i], S.NOISE_EDGES[i + 1]] for i in range(len(noise_rms))])};
export const BURST_RMS = {json.dumps([round(x, 6) for x in burst_rms])};
export const BURST_BANDS = {json.dumps(S.BURST_BANDS)};
export const SUB = {S.SUB};
export const CHIRP_ROLL = {CHIRP_ROLL};      // samples the 1 s calibration chirp (500->4500->500 Hz) is rotated by
"""
open(os.path.join(unit, 'src', 'assets.ts'), 'w').write(ts)
print('noise rms', [round(x, 4) for x in noise_rms], 'burst rms', [round(x, 4) for x in burst_rms])
print('events', len(defs))
