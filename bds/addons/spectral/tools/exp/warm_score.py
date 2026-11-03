#!/usr/bin/env python3
"""p13 (tools/exp/sampler_plans.py p13): which of the probes' notes sounded on the phone, and when.

The phone's output is digital silence when nothing plays, so a note "sounded" when a sound starts within 40 ms of its place
(aligned by the lag that finds the most — a probe with none heard has no lag, and none heard).
probe_long: an anchor (a sample loaded already) and 1 s after it a sample never played before, 1.5 s long — on time its sound
starts 1.0 s after the anchor's; started from the head of its file (its seek not taken: the file loaded first) about 0.55 s later.

  python3 tools/exp/warm_score.py <folder with pr_*.opus, pl_long.opus> [--json out.json]"""
import argparse, glob, json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [os.path.join(UNIT, 'tools'), HERE]
import notes as N  # noqa: E402

SR = 24000
HOP = 120                       # 5 ms


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def frames_on(x, floor_db=-90.0):
    """per 5 ms: anything over the floor (the phone's silence is exact zeros; the recording's codec leaves a little around sound)"""
    n = len(x) // HOP
    e = (x[: n * HOP].reshape(n, HOP) ** 2).mean(1)
    return 10 * np.log10(e + 1e-14) > floor_db


def onsets(on, min_gap=0.15):
    """the frames where sound starts after at least `min_gap` s of silence (s)"""
    out, last_on = [], -1e9
    for i in range(1, len(on)):
        if on[i] and not on[i - 1]:
            t = i * HOP / SR
            silent_for = t - last_on
            if silent_for >= min_gap:
                out.append(t)
        if on[i]:
            last_on = i * HOP / SR
    return out


def song_notes(sid):
    return N.decode(json.load(open(os.path.join(UNIT, 'tools', 'exp', 'packs', 'notes', f'{sid}.song.json'))))


def score_probe(path, sid):
    """a note sounded when a sound starts (after 150 ms of silence) within 40 ms of its place, the places aligned by the lag that
    finds the most"""
    x = load(path)
    ons = np.array(onsets(frames_on(x)))
    starts = [s / 1000 for s, *_ in song_notes(sid)]
    if not len(ons):
        return {'heard': 0, 'of': len(starts), 'lag_s': None, 'per_note': [0] * len(starts)}
    best = (0, None)
    for o in ons:
        for s0 in starts:                       # every (onset, note) pair proposes a lag
            lag = o - s0
            hit = sum(1 for s in starts if np.min(np.abs(ons - (s + lag))) < 0.04)
            if hit > best[0]:
                best = (hit, lag)
    hit, lag = best
    per = [int(np.min(np.abs(ons - (s + lag))) < 0.04) for s in starts]
    return {'heard': int(sum(per)), 'of': len(starts), 'lag_s': round(float(lag), 3), 'per_note': per,
            'other_onsets': int(len(ons) - sum(per))}


def score_long(path):
    x = load(path)
    on = frames_on(x)
    ons = onsets(on, min_gap=0.15)
    notes = song_notes('probe_long')
    anchors = [s / 1000 for s, d, k, *_ in notes if k == 60]
    cold = [s / 1000 for s, d, k, *_ in notes if k != 60]
    # the lag: the first onset that has the anchors' pattern (2.4 s apart) behind it
    best = (0, None)
    for o in ons[:6]:
        lag = o - anchors[0]
        hit = sum(1 for a in anchors if any(abs(z - (a + lag)) < 0.03 for z in ons))
        if hit > best[0]:
            best = (hit, lag)
    hit, lag = best
    if lag is None:
        return {'anchors_heard': 0, 'cold': []}
    out = []
    for c in cold:
        exp = c + lag
        near = [z - exp for z in ons if -0.1 < z - exp < 1.2]
        # (a cold note still sounding from the anchor's ring is not an onset: also look for sound at all in its window)
        a = int((exp - 0.03) * SR / HOP); b = int((exp + 0.25) * SR / HOP)
        out.append({'at_s': round(c, 2), 'onset_after_ms': [round(v * 1000) for v in near],
                    'sound_in_first_250ms': bool(on[a: b].any())})
    return {'anchors_heard': hit, 'of': len(anchors), 'lag_s': round(float(lag), 3), 'cold': out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder'); ap.add_argument('--json')
    a = ap.parse_args()
    res = {}
    for f in sorted(glob.glob(os.path.join(a.folder, '*'))):
        name = os.path.basename(f).rsplit('.', 1)[0]
        if name.startswith('pr_'):
            tag = name[3:]
            sid = 'probe_w0' if tag == 'again' else f'probe_{tag}'
            res[name] = score_probe(f, sid)
        elif name == 'pl_long':
            res[name] = score_long(f)
        else:
            continue
        print(name, json.dumps(res[name]), flush=True)
    if a.json:
        json.dump(res, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
