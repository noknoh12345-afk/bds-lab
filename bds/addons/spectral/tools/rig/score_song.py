#!/usr/bin/env python3
"""Score a recording of a song against its original: ViSQOL v3 (tools/metrics/visqol.py) and the auxiliary metrics.

  python3 tools/rig/score_song.py <original audio> <recording.wav> [<recording2.wav> ...] [--json out.json]

The recording is what a client played, from a recorder that started at some moment before the song: it is cut to where
the sound is (from the first sample within 50 dB of its peak to the last), then ViSQOL's own global alignment lines it up.
Several recordings (the game's playback and the ceiling) are scored against the same original in one go.
"""
import json, math, os, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'metrics'))
import metrics as MT
SR = 48000


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def active(y, ref_len, floor_db=-50.0):
    """the part of a recording where sound is (sync clicks before a song are 1 s ahead of it and fall outside)"""
    k = int(0.01 * SR)
    n = len(y) // k
    if n < 2:
        return y
    e = np.sqrt((y[: n * k].reshape(n, k) ** 2).mean(1) + 1e-20)
    on = np.nonzero(20 * np.log10(e / e.max()) > floor_db)[0]
    if not len(on):
        return y
    a, b = on[0] * k, min(len(y), (on[-1] + 1) * k)
    # the longest stretch that is about as long as the song: start where the song does, keep its length plus a little
    return y[a: min(b, a + ref_len + int(0.5 * SR))]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
    if out in args:
        args.remove(out)
    ref = load(args[0])
    res = {}
    for rec in args[1:]:
        y = active(load(rec), len(ref))
        r = MT.report(ref, y)
        r['recorded_s'] = round(len(y) / SR, 2)
        res[os.path.basename(rec)] = r
    txt = json.dumps(res, ensure_ascii=False)
    if out:
        open(out, 'w').write(txt)
    print(txt)


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    main()
