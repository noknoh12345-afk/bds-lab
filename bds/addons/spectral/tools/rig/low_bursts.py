#!/usr/bin/env python3
"""Where in a 3D recording new sounds were made: 1.2.0 makes 3D sounds at P_MIN (17.6 Hz), and for 100-200 ms a new one plays as
it was made, at full volume — under 40 Hz, loud, whatever the distance (run 41266897044: -37..-47 dB under 30 Hz at the start, at 3
and at 24 blocks alike), with a little of it heard as a low thump (60-250 Hz). A voice that follows a walking talker makes its
sounds again at every move (src/main.ts LivePlayer.follow): this finds those stretches all through a recording — runs of 10 ms
where under 40 Hz is over a threshold — and for each, its start, length, the level under 40 Hz, at 60-250 Hz (the thump) and
over 250 Hz (anything else heard), against the recording's own level over 250 Hz (its 95th percentile).
  SPECTRAL_REC=<recordings> python3 tools/rig/low_bursts.py <prefix_song> [...] [--over -55]      (JSON lines)"""
import json, os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
REC = os.environ.get('SPECTRAL_REC', os.path.join(os.path.dirname(os.path.dirname(HERE)), 'corpus', 'renders', 'rec'))
SR = 48000
K = SR // 100


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64).mean(1)


def band(x, lo, hi):
    if lo <= 0: sos = butter(4, hi, 'lowpass', fs=SR, output='sos')
    elif hi >= SR / 2: sos = butter(4, lo, 'highpass', fs=SR, output='sos')
    else: sos = butter(4, [lo, hi], 'bandpass', fs=SR, output='sos')
    y = sosfiltfilt(sos, x)
    n = len(y) // K
    return 10 * np.log10((y[: n * K].reshape(n, K) ** 2).mean(1) + 1e-30)


def scan(name, over=-55.0):
    x = load(os.path.join(REC, name + '.opus'))
    sub, thump, high = band(x, 0, 40), band(x, 60, 250), band(x, 250, SR / 2)
    song = high[high > -150]
    ref = float(np.percentile(song, 95)) if len(song) else None
    hot = sub > over
    out, i, n = [], 0, len(hot)
    while i < n:
        if hot[i]:
            j = i
            while j < n and hot[j]: j += 1
            out.append({'at_s': round(i / 100, 2), 'ms': (j - i) * 10, 'under40_db': round(float(sub[i:j].max()), 1),
                        'thump_db': round(float(thump[i:j].max()), 1), 'over250_db': round(float(high[i:j].max()), 1)})
            i = j
        else: i += 1
    return {'rec': name, 'bursts': len(out), 'song_p95_over250_db': None if ref is None else round(ref, 1),
            'thump_max_db': max((b['thump_db'] for b in out), default=None), 'list': out}


if __name__ == '__main__':
    a = sys.argv[1:]
    over = -55.0
    if '--over' in a:
        k = a.index('--over'); over = float(a[k + 1]); del a[k:k + 2]
    for name in a:
        try:
            print(json.dumps(scan(name, over)))
        except Exception as e:
            print(json.dumps({'rec': name, 'error': str(e)[:200]}))
