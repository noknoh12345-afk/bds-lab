#!/usr/bin/env python3
"""How a 3D recording starts: what the client plays between making the sounds and the first frame of the song. A new 3D sound
plays as it was made for 100-200 ms before the setVolume sent with it takes hold (measured: runs 9-12 made them at pitch 1 — the
1760 Hz loop — and every 3D recording starts with ~100 ms of that tone at -35..-47 dB, then ~100 ms of the noise bands). 1.2.0
makes them at P_MIN (17.6 Hz). For each recording: from its first sound (the first 10 ms over -120 dB), the loudest 10 ms over
200 Hz in the first 250 ms (what is heard), the 1760 Hz line in the first 100 ms, under 200 Hz in the first 250 ms (the made-at-P_MIN
rumble), and the song after it (the 95th percentile of 10 ms over 200 Hz from 450 ms on) — the start against the song in dB.
  SPECTRAL_REC=<recordings> python3 tools/rig/start_burst.py <prefix_song> [...]      (Opus from tools/rig/fetch_rec.py; JSON lines)"""
import json, os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
REC = os.environ.get('SPECTRAL_REC', os.path.join(os.path.dirname(os.path.dirname(HERE)), 'corpus', 'renders', 'rec'))
SR = 48000
K = SR // 100                                   # 10 ms


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def db(x):
    return 10 * np.log10(np.maximum(x, 1e-30))


def frames(x):
    n = len(x) // K
    return (x[: n * K].reshape(n, K) ** 2).mean(1)


def check(name):
    x = load(os.path.join(REC, name + '.opus'))
    m = x.mean(1)
    full = db(frames(m))
    on = np.nonzero(full > -120)[0]
    if not len(on):
        return {'rec': name, 'silent': True}
    t0 = int(on[0])
    hi = sosfiltfilt(butter(4, 200, 'highpass', fs=SR, output='sos'), m)
    lo = sosfiltfilt(butter(4, 200, 'lowpass', fs=SR, output='sos'), m)
    eh, el = db(frames(hi)), db(frames(lo))
    start = slice(t0, t0 + 25)
    seg = m[t0 * K: (t0 + 10) * K] * np.hanning(10 * K)
    S = np.abs(np.fft.rfft(seg, 1 << 16)) ** 2
    f = np.fft.rfftfreq(1 << 16, 1 / SR)
    tone = db(S[(f > 1700) & (f < 1820)].sum() / max(S.sum(), 1e-30))      # the 1760 Hz line's share of the first 100 ms
    song = eh[t0 + 45:]
    song_db = float(np.percentile(song[song > -150], 95)) if (song > -150).any() else None
    head = float(eh[start].max())
    # (the loudest 10 ms over 200 Hz in the first 250 ms; for a start that is the song itself, this is the song's own first notes)
    return {'rec': name, 'first_sound_ms': t0 * 10, 'start_db_over200': round(head, 1), 'start_db_under200': round(float(el[start].max()), 1),
            'tone1760_share_db': round(float(tone), 1), 'song_p95_db_over200': None if song_db is None else round(song_db, 1),
            'start_over_song_db': None if song_db is None else round(head - song_db, 1),
            'start_10ms_db': [round(float(v), 0) for v in eh[t0: t0 + 30]]}


if __name__ == '__main__':
    for a in sys.argv[1:]:
        try:
            print(json.dumps(check(a)))
        except Exception as e:                    # (a recording missing or unreadable)
            print(json.dumps({'rec': a, 'error': str(e)[:200]}))
