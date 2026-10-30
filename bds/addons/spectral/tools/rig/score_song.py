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


def levels(y):
    """how loud a recording is as a whole: peak and RMS in dBFS, the share of 100 ms blocks above -60 dBFS, and the strongest
    frequencies (a whole recording that is one tone — every voice at the loop's own pitch — shows as one peak)"""
    k = int(0.1 * SR)
    n = len(y) // k
    peak = float(np.max(np.abs(y))) if len(y) else 0.0
    rms = float(np.sqrt(np.mean(y * y))) if len(y) else 0.0
    db = lambda v: round(20 * math.log10(v), 1) if v > 0 else -200.0
    out = {'peak_db': db(peak), 'rms_db': db(rms), 'seconds': round(len(y) / SR, 2)}
    if n:
        e = np.sqrt((y[: n * k].reshape(n, k) ** 2).mean(1))
        out['active_share'] = round(float(np.mean(e > 10 ** (-60 / 20))), 3)
    if peak > 0 and len(y) >= 8192:
        f = np.abs(np.fft.rfft(y * np.hanning(len(y))))
        hz = np.fft.rfftfreq(len(y), 1 / SR)
        top = np.argsort(f)[::-1]
        picks = []
        for i in top:
            if all(abs(hz[i] - p) > 20 for p in picks):
                picks.append(float(hz[i]))
            if len(picks) == 5:
                break
        out['top_hz'] = [round(p, 1) for p in picks]
        out['top_share'] = round(float(np.sum(f[np.abs(hz - picks[0]) < 20] ** 2) / np.sum(f ** 2)), 3)
        # (1/3-octave levels from 25 Hz, dB under the loudest band: where a recording and its original part — run 41068618513's
        #  rock had +12 dB at 5.7 kHz and 18 kHz the emulator did not, from Opus copies; these come from the WAV)
        p2 = f ** 2
        edges = [25 * 2 ** (k / 3) for k in range(31)]
        b = np.array([10 * math.log10(float(p2[(hz >= lo) & (hz < hi)].sum()) + 1e-30) for lo, hi in zip(edges[:-1], edges[1:])])
        out['bands_db'] = [round(float(v), 1) for v in b - b.max()]
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
    if out in args:
        args.remove(out)
    ref = load(args[0])
    res = {}
    for rec in args[1:]:
        whole = load(rec)
        lv = levels(whole)
        y = active(whole, len(ref))
        # (a silent or nearly silent recording is a finding, not a crash: run 41055135707's first song came back all zeros)
        if lv['peak_db'] < -90:
            res[os.path.basename(rec)] = {'error': 'silent recording', **lv}
            continue
        try:
            r = MT.report(ref, y)
        except Exception as e:
            r = {'error': f'{type(e).__name__}: {e}'}
        r['recorded_s'] = round(len(y) / SR, 2)
        r.update(lv)
        res[os.path.basename(rec)] = r
    txt = json.dumps(res, ensure_ascii=False)
    if out:
        open(out, 'w').write(txt)
    print(txt)


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    main()
