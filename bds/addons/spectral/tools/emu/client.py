#!/usr/bin/env python3
"""A client emulator: renders a SoundInstance command log (tools/sim/run.mjs, or the add-on's calibration programs) the
way a Bedrock client would play it, with every behaviour that is not known yet as a PARAMETER (SPEC).

The parameters come from tools/emu/spec.json. Every value there is either "measured" (with the recording it came from)
or "assumed" (a guess until tools/rig measures it on a real client): `python3 tools/emu/client.py --spec` prints them.
Fitting the parameters to a recording: tools/rig/analyze.py writes the measured values into spec.json.

What it models:
  * the RP's own sound files (decoded OGG), played by a resampler (setPitch = playback rate):
    'ideal' (band-limited, sinc), 'linear' (FMOD's default), 'nearest'
  * when commands take effect: tick * 50 ms + latency + per-tick jitter (all commands of one tick share it), rounded to
    the client's frame and to the mixer's block
  * fade(d, v): a ramp from the current gain over max(d, fade_min) in amplitude ('linear') or in dB ('db')
  * setVolume: a jump (or a ramp of vol_ramp_ms, as mixers smooth volume changes over a block)
  * a voice limit: beyond max_voices the quietest voices are not heard (their position keeps running)
  * the mix: category gains, then a hard clip at full scale or a limiter
  * stereo files keep their channels when is3D is false ('keep') or are folded to mono ('mono')
"""
import json, math, os, re, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
SPEC_PATH = os.path.join(HERE, 'spec.json')
TICK_S = 0.05

DEFAULT_SPEC = {
    'output_sr': {'value': 48000, 'status': 'assumed', 'note': 'FMOD mixes at the device rate; 48 kHz on most phones'},
    'latency_ms': {'value': 0.0, 'status': 'assumed', 'note': 'constant delay of every command (the same for all: does not change the sound)'},
    'jitter_ms': {'value': 0.0, 'status': 'assumed', 'note': 'standard deviation of when one tick\'s commands land (shared by the tick)'},
    'frame_ms': {'value': 0.0, 'status': 'assumed', 'note': 'commands land on the client\'s frame (16.7 ms at 60 fps; 0 = anywhere)'},
    'block': {'value': 0, 'status': 'assumed', 'note': 'mixer block in samples: changes land on block starts (0 = sample accurate)'},
    'fade_shape': {'value': 'linear', 'status': 'assumed', 'note': 'linear in amplitude | db (linear in dB) | step'},
    'fade_min_ms': {'value': 0.0, 'status': 'assumed', 'note': 'a shorter fade takes this long'},
    'vol_ramp_ms': {'value': 0.0, 'status': 'assumed', 'note': 'setVolume ramps over this instead of jumping'},
    'resampler': {'value': 'ideal', 'status': 'assumed', 'note': 'ideal | linear | nearest'},
    'max_voices': {'value': 0, 'status': 'assumed', 'note': '0 = no limit; else the quietest voices beyond it are not heard'},
    'mix': {'value': 'clip', 'status': 'assumed', 'note': 'clip (hard clip at 1.0) | none | limiter'},
    'limiter_db': {'value': -1.0, 'status': 'assumed', 'note': 'limiter threshold when mix = limiter'},
    'category_gain_db': {'value': {'ui': 0.0, 'record': 0.0, 'music': 0.0}, 'status': 'assumed', 'note': 'volume settings per category'},
    'stereo': {'value': 'keep', 'status': 'assumed', 'note': 'keep | mono (is3D false stereo files)'},
    'oneshot_latency_ms': {'value': 0.0, 'status': 'assumed', 'note': 'a one-shot playSound sounds this much after the SoundInstance commands of its tick'},
    'voice_rank': {'value': 'energy', 'status': 'assumed', 'note': 'beyond max_voices, which are not heard: energy (gain x the sound\'s RMS) | volume (the channel volume alone, as FMOD ranks audibility)'},
    'voice_block': {'value': 1024, 'status': 'assumed', 'note': 'samples between the mixer\'s choices of which voices are heard'},
    'mix_sr': {'value': 0, 'status': 'assumed', 'note': 'the rate the game mixes at (0 = output_sr). Each voice is read linearly at this rate with no anti-aliasing: content above mix_sr/2 folds to mix_sr - f'},
    'out_up': {'value': 'linear', 'status': 'assumed', 'note': 'how the mix gets to output_sr: linear interpolation (images at mix_sr - f, a cos^2 droop) | ideal'},
    'out_gain_db': {'value': 0.0, 'status': 'assumed', 'note': 'level of the game\'s output against the files (what the recorder hears)'},
    'out_bits': {'value': 0, 'status': 'assumed', 'note': 'the recording\'s word length (16: the mix and the capture are 16-bit PCM; 0 = float)'},
}


def load_spec(path=SPEC_PATH, **over):
    spec = json.loads(json.dumps(DEFAULT_SPEC))
    if os.path.exists(path):
        for k, v in json.load(open(path)).items():
            spec[k] = v
    for k, v in over.items():
        spec[k] = {'value': v, 'status': 'override'}
    return {k: v['value'] for k, v in spec.items()}, spec


# ---------------------------------------------------------------- assets
class Assets:
    """sound events of a resource pack: event -> (category, is3D, float32 array (n, ch), sample rate)"""
    def __init__(self, rp=os.path.join(UNIT, 'rp')):
        self.rp = rp
        d = json.load(open(os.path.join(rp, 'sounds', 'sound_definitions.json')))['sound_definitions']
        self.defs = d
        self.cache = {}

    def get(self, event):
        if event not in self.cache:
            df = self.defs[event]
            snd = df['sounds'][0]
            name = snd['name'] if isinstance(snd, dict) else snd
            path = os.path.join(self.rp, name + '.ogg')
            info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate,channels', '-of', 'json', path],
                                             check=True, capture_output=True, text=True).stdout)['streams'][0]
            sr, ch = int(info['sample_rate']), int(info['channels'])
            raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-'], check=True, capture_output=True).stdout
            x = np.frombuffer(raw, np.float32).reshape(-1, ch).astype(np.float64)
            vol = snd.get('volume', 1.0) if isinstance(snd, dict) else 1.0
            self.cache[event] = (df.get('category', 'ui'), bool(snd.get('is3D', True)) if isinstance(snd, dict) else True, x * vol, sr)
        return self.cache[event]


# ---------------------------------------------------------------- resampling
def read(src, pos, resampler, loop):
    """src (n, ch), pos float array of source positions -> (len(pos), ch)"""
    n = len(src)
    if loop:
        pos = np.mod(pos, n)
    else:
        ok = (pos >= 0) & (pos <= n - 1)
    if resampler == 'nearest':
        i = np.round(pos).astype(np.int64) % n
        out = src[i]
    elif resampler == 'linear' or resampler == 'ideal':
        # 'ideal' differs from 'linear' only for pitch-shifted band-limited assets: for the sine and noise loops of this
        # RP a linear read at 48 kHz is within -56 dB (measured by tests); the sinc path is kept for the extremes test.
        i0 = np.floor(pos).astype(np.int64)
        fr = (pos - i0)[:, None]
        a = src[i0 % n]; b = src[(i0 + 1) % n]
        out = a + (b - a) * fr
    else:
        raise ValueError(resampler)
    if not loop:
        out = np.where(ok[:, None], out, 0.0)
    return out


# ---------------------------------------------------------------- the log
def instances(log):
    """the log of tools/sim/mock-server.js: ['play', tick, id, event, pitch, volume, loopCount, who] and
    ['pitch'|'fade'|'vol'|'stop'|'pause'|'resume'|'seek', tick, id, ...]"""
    inst = {}
    for e in log:
        k = e[0]
        if k == 'play':
            _, t, iid, ev, pitch, vol, loop, who = e[:8]
            inst[iid] = {'ev': ev, 't0': t, 'loop': loop, 'cmds': [(t, 'start', pitch, vol)]}
        elif k in ('pitch', 'fade', 'vol', 'stop', 'pause', 'resume', 'seek') and e[2] in inst:
            inst[e[2]]['cmds'].append((e[1], k) + tuple(e[3:]))
    return inst


def land_times(ticks, spec, rng):
    """sample time at which each tick's commands take effect"""
    sr = spec['output_sr']
    ticks = np.asarray(sorted(set(ticks)))
    t = ticks * TICK_S + spec['latency_ms'] / 1000.0
    if spec['jitter_ms'] > 0:
        t = t + rng.normal(0, spec['jitter_ms'] / 1000.0, len(t))
    if spec['frame_ms'] > 0:
        fr = spec['frame_ms'] / 1000.0
        t = np.ceil(t / fr) * fr
    s = np.maximum(0, np.round(t * sr)).astype(np.int64)
    if spec['block'] > 0:
        s = -(-s // spec['block']) * spec['block']
    # commands never land before those of an earlier tick
    s = np.maximum.accumulate(s)
    return dict(zip(ticks.tolist(), s.tolist()))


def gain_curve(cmds, land, total, spec, sr):
    """per-sample gain of one instance from its start / vol / fade / stop commands: each command starts a ramp (or a
    jump) from wherever the previous one had got to when it landed"""
    fmin = spec['fade_min_ms'] / 1000.0; vr = spec['vol_ramp_ms'] / 1000.0; shape = spec['fade_shape']
    ev = []
    for c in cmds:
        t = land[c[0]]
        if c[1] == 'start':
            ev.append((t, c[3], 0.0, False))
        elif c[1] == 'vol':
            ev.append((t, c[2], vr, False))
        elif c[1] == 'fade':
            ev.append((t, c[3], max(c[2], fmin), False))
        elif c[1] == 'stop':
            ev.append((t, 0.0, 0.0, True))
    ev.sort(key=lambda e: e[0])
    g = np.zeros(total)
    seg = None                  # (t_start, v_from, v_to, n)

    def value(t):
        if seg is None:
            return 0.0
        t0, a, b, n = seg
        if n <= 0 or t >= t0 + n:
            return b
        x = (t - t0) / n
        return a * (b / a) ** x if shape == 'db' and a > 0 and b > 0 else a + (b - a) * x

    def fill(t1, t2):
        if seg is None or t2 <= t1:
            return
        t0, a, b, n = seg
        tt = np.arange(t1, t2)
        if n <= 0 or shape == 'step':
            g[t1:t2] = b
            return
        x = np.clip((tt - t0) / n, 0, 1)
        g[t1:t2] = a * (b / a) ** x if (shape == 'db' and a > 0 and b > 0) else a + (b - a) * x

    t_prev = 0
    for (t, v, d, stop) in ev:
        t = min(t, total)
        fill(t_prev, t)
        c = value(t)
        if stop:
            seg = None
            t_prev = total
            break
        seg = (t, c, v, int(round(d * sr)))
        t_prev = t
    fill(t_prev, total)
    return g


def _instance_signal(s, land, total, spec, assets, sr, gain_only=False):
    """(start sample, (n, 2) signal) of one instance over the span it plays (gain_only: (start, gain x the sound's RMS))"""
    cat, is3d, src, src_sr = assets.get(s['ev'])
    if src.shape[1] == 1:
        src = np.repeat(src, 2, 1)
    elif spec['stereo'] == 'mono':
        src = np.repeat(src.mean(1, keepdims=True), 2, 1)
    loop = s['loop'] == -1 or s['loop'] > 0
    t0 = land[s['t0']] + (0 if loop else int(round(spec.get('oneshot_latency_ms', 0.0) * sr / 1000)))
    marks = []
    for c in s['cmds'][1:]:
        if c[1] == 'pitch':
            marks.append((land[c[0]], 'p', c[2]))
        elif c[1] == 'seek':
            marks.append((land[c[0]], 's', c[2]))
        elif c[1] == 'stop':
            marks.append((land[c[0]], 'x', 0))
    marks.sort(key=lambda m: m[0])
    # a one-shot ends with its file (at the slowest rate it is given)
    if not loop:
        rmin = min([s['cmds'][0][2]] + [m[2] for m in marks if m[1] == 'p']) * src_sr / sr
        t_end = min(total, t0 + int(len(src) / max(rmin, 1e-3)) + 1)
    else:
        t_end = total
    for m in marks:
        if m[1] == 'x':
            t_end = min(t_end, m[0])
            break
    if t_end <= t0:
        return t0, np.zeros((0, 2))
    n = t_end - t0
    pos = np.zeros(n)
    p_now = 0.0; t_now = t0; r_now = s['cmds'][0][2] * src_sr / sr
    for (t, kind, v) in marks + [(t_end, 'x', 0)]:
        t = min(max(t, t0), t_end)
        if t > t_now:
            k = t - t_now
            pos[t_now - t0:t - t0] = p_now + r_now * np.arange(k)
            p_now += r_now * k; t_now = t
        if kind == 'p':
            r_now = v * src_sr / sr
        elif kind == 's':
            p_now = v * src_sr
        elif kind == 'x':
            break
    g = gain_curve(s['cmds'], land, total, spec, sr)[t0:t_end] * 10 ** (spec['category_gain_db'].get(cat, 0.0) / 20)
    if gain_only:
        return t0, g if gain_only == 'volume' else g * float(np.sqrt(np.mean(src ** 2)))
    y = read(src, pos, spec['resampler'], loop)
    return t0, y * g[:, None]


def client_path(y, spec, sr=None):
    """what a recorder hears of the emulator's ideal mix y (n, 2) at output_sr: the game's mixing rate (each voice read
    linearly there: for a rate that divides output_sr, the even samples of the ideal render are exactly that read), its
    output level, 16-bit words, and the interpolation back up to output_sr"""
    sr = sr or spec['output_sr']
    ms = int(spec.get('mix_sr') or 0)
    g = 10 ** (float(spec.get('out_gain_db') or 0.0) / 20)
    bits = int(spec.get('out_bits') or 0)
    q = (lambda v: np.round(np.clip(v, -1, 1 - 2.0 ** (1 - bits)) * 2.0 ** (bits - 1)) / 2.0 ** (bits - 1)) if bits else (lambda v: v)
    if not ms or ms >= sr:
        return q(y * g)
    if sr % ms:
        raise ValueError(f'mix_sr {ms} must divide output_sr {sr}')
    k = sr // ms
    z = q(y[::k] * g)
    n = len(z) * k
    if spec.get('out_up', 'linear') == 'ideal':
        from scipy.signal import resample_poly
        up = resample_poly(z, k, 1, axis=0)[:n]
    else:
        pos = np.arange(n) / k
        i0 = np.floor(pos).astype(np.int64); fr = (pos - i0)[:, None]
        i1 = np.minimum(i0 + 1, len(z) - 1)
        up = z[i0] + (z[i1] - z[i0]) * fr
    return q(up)


def render(log, spec=None, assets=None, seed=0, seconds=None, path=False):
    spec = spec or load_spec()[0]
    assets = assets or Assets()
    sr = spec['output_sr']
    rng = np.random.default_rng(seed)
    inst = instances(log)
    ticks = [c[0] for s in inst.values() for c in s['cmds']]
    end_tick = max(ticks) + 40
    total = int((seconds if seconds else end_tick * TICK_S + 1.0) * sr)
    land = land_times(ticks, spec, rng)
    out = np.zeros((total, 2))
    lim = spec['max_voices']
    if lim:
        blk = int(spec.get('voice_block', 1024)); nb = total // blk + 1
        by_volume = spec.get('voice_rank', 'energy') == 'volume'
        ids = list(inst)
        loud = np.zeros((len(ids), nb))
        for i, iid in enumerate(ids):           # pass 1: how audible each voice is, block by block
            t0, a = _instance_signal(inst[iid], land, total, spec, assets, sr, gain_only='volume' if by_volume else True)
            if len(a):
                e = np.zeros(nb * blk); e[t0:t0 + len(a)] = a
                loud[i] = e.reshape(nb, blk).mean(1)
        keep = np.zeros_like(loud, bool)
        for b in range(nb):
            on = np.nonzero(loud[:, b] > 0)[0]
            # loudest first; at equal loudness the older voice stays (a mixer does not swap voices back and forth)
            order = sorted(on, key=lambda i: (-round(float(loud[i, b]), 12), i))
            keep[order[:lim], b] = True
        for i, iid in enumerate(ids):           # pass 2: only the loudest `lim` are heard
            t0, y = _instance_signal(inst[iid], land, total, spec, assets, sr)
            if len(y):
                m = np.repeat(keep[i], blk)[t0:t0 + len(y)]
                out[t0:t0 + len(y)] += y * m[:, None]
    else:
        for iid, s in inst.items():
            t0, y = _instance_signal(s, land, total, spec, assets, sr)
            out[t0:t0 + len(y)] += y
    if spec['mix'] == 'clip':
        out = np.clip(out, -1, 1)
    elif spec['mix'] == 'limiter':
        thr = 10 ** (spec['limiter_db'] / 20)
        env = np.abs(out).max(1)
        g = np.ones(total); a = math.exp(-1 / (0.1 * sr)); cur = 1.0
        for i in range(total):                   # (slow: only for the calibration tests)
            need = min(1.0, thr / env[i]) if env[i] > 0 else 1.0
            cur = need if need < cur else need + (cur - need) * a
            g[i] = cur
        out = out * g[:, None]
    return client_path(out, spec) if path else out


if __name__ == '__main__':
    if '--spec' in sys.argv:
        _, full = load_spec()
        for k, v in full.items():
            print(f"{k:18s} {json.dumps(v['value']):28s} {v['status']:9s} {v.get('note', '')}")
        sys.exit()
    log = json.load(open(sys.argv[1]))
    y = render(log)
    from scipy.io import wavfile
    wavfile.write(sys.argv[2], 48000, np.clip(y, -1, 1).astype(np.float32))
