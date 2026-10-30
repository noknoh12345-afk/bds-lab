#!/usr/bin/env python3
"""The client path of tools/emu/spec.json (mix_sr, out_up, out_gain_db, out_bits) against the real ceilings: each test
song's original goes through the path alone (no add-on), is scored like a recording (ViSQOL v3 against the original), and
the score is set beside the ceiling measured on the real client (measured/summary.json: the original played as a sound).

  python3 tools/rig/path_check.py [--songs a,b] [--json out.json] [--jobs 2]

A path that is right gives each song the ceiling the real client gave it (redroid, run 41068618513/41076646541: within 0.06
on average with the measured 24 kHz mix). Prints one line per song and the mean absolute difference.
"""
import argparse, json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [os.path.join(UNIT, 'tools'), os.path.join(UNIT, 'tools', 'metrics'), os.path.join(UNIT, 'tools', 'emu')]
import corpus as C, metrics as MT, client as E


def one(sid):
    spec, _ = E.load_spec()
    o = C.load(sid, 48000)
    rec = E.client_path(o[:, None].repeat(2, 1), spec).mean(1)
    return {'song': sid, 'path': round(MT.visqol_score(o, rec), 4)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--songs'); ap.add_argument('--json'); ap.add_argument('--jobs', type=int, default=2)
    a = ap.parse_args()
    ids = a.songs.split(',') if a.songs else [s['id'] for s in C.manifest()['songs']]
    real = json.load(open(os.path.join(UNIT, 'measured', 'summary.json')))['songs']
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        rows = list(ex.map(one, ids))
    for r in rows:
        r['real_ceiling'] = real.get(r['song'], {}).get('ceiling', {}).get('visqol')
        print(json.dumps(r))
    d = [abs(r['path'] - r['real_ceiling']) for r in rows if r['real_ceiling'] is not None]
    out = {'songs': rows, 'mean_abs_diff': round(float(np.mean(d)), 3) if d else None,
           'median_path': round(float(np.median([r['path'] for r in rows])), 3),
           'median_real': round(float(np.median([r['real_ceiling'] for r in rows if r['real_ceiling'] is not None])), 3) if d else None}
    print(json.dumps({k: v for k, v in out.items() if k != 'songs'}))
    if a.json:
        json.dump(out, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    main()
