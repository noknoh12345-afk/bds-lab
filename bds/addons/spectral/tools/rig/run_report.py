#!/usr/bin/env python3
"""One real-client run, read back from what tools/rig/collect.py wrote (measured/redroid-<run>.json): every way it played the songs
side by side (ViSQOL v3 of the recordings), each way against a base way of the same run (median and mean difference, songs up),
how many songs come within 0.3 of the ceiling (the ceiling of a run that recorded it — the original played as a plain sound,
which repeats to 4 digits run to run: run 41200540880), and the 3D recordings (level, left against right).

  python3 tools/rig/run_report.py <run> [--base refined_svr5] [--ceiling-run 41200540880] [--md]

--md prints Markdown tables for SPEC.md. All the numbers are measured (the recordings of the unmodified client)."""
import argparse, json, os, statistics as st
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
THREE_D = ('jl', 'jr', 'kl', 'kr', 'ka', 'kb', 'kc', 'ra', 'rb', 'rc', 'rd')


def load(run):
    return json.load(open(os.path.join(UNIT, 'measured', f'redroid-{run}.json'), encoding='utf-8'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('run'); ap.add_argument('--base', default='refined_svr5'); ap.add_argument('--ceiling-run', default='41200540880')
    ap.add_argument('--md', action='store_true')
    a = ap.parse_args()
    r = load(a.run)
    songs = sorted(r.get('songs', {}))
    try:
        ceil = {s: v['ceiling']['visqol'] for s, v in load(a.ceiling_run)['songs'].items() if 'ceiling' in v}
    except Exception:
        ceil = {}
    for s in songs:                                   # (a run with its own ceiling uses that)
        if 'ceiling' in r['songs'][s]: ceil[s] = r['songs'][s]['ceiling']['visqol']
    ways = []
    for s in songs:
        for k in r['songs'][s]:
            if k not in ways and k != 'ceiling' and not k.startswith('live_near') and not k.startswith('live_3d'): ways.append(k)
    val = lambda s, k: r['songs'][s].get(k, {}).get('visqol')
    sep = ' | ' if a.md else '  '
    head = ['song', 'ceiling'] + ways
    if a.md:
        print('| ' + ' | '.join(head) + ' |'); print('|' + '---|' * len(head))
    else:
        print(f"{'song':24s} {'ceiling':>8s} " + ' '.join(f'{w[:18]:>18s}' for w in ways))
    for s in songs:
        cells = [f'{ceil[s]:.2f}' if s in ceil else '–'] + [f'{val(s, w):.2f}' if val(s, w) is not None else '–' for w in ways]
        print(('| ' + s + ' | ' + ' | '.join(cells) + ' |') if a.md else f'{s:24s} {cells[0]:>8s} ' + ' '.join(f'{c:>18s}' for c in cells[1:]))
    print()
    for w in ways:
        got = [s for s in songs if val(s, w) is not None]
        if not got:
            print(('- ' if a.md else '') + f'{w}: no score (silent recordings: see 3D below)'); continue
        line = f'{w}: median {st.median(val(s, w) for s in got):.3f} ({len(got)} songs)'
        if w != a.base:
            dd = [val(s, w) - val(s, a.base) for s in got if val(s, a.base) is not None]
            if dd: line += f'; against {a.base}: median {st.median(dd):+.3f}, mean {st.mean(dd):+.3f}, up {sum(x > 0 for x in dd)}/{len(dd)}'
        gaps = [ceil[s] - val(s, w) for s in got if s in ceil]
        if gaps: line += f'; within 0.3 of the ceiling {sum(x <= 0.3 for x in gaps)}/{len(gaps)}'
        print(('- ' if a.md else '') + line)
    best = {}
    for s in songs:
        c = [(val(s, w), w) for w in ways if val(s, w) is not None]
        if c: best[s] = max(c)[1]
    print(('- ' if a.md else '') + 'the best way per song: ' + ', '.join(f'{s} {w}' for s, w in best.items()))
    res = r.get('results', {})
    rows = []
    for name, by in res.items():
        pre = name.split('_', 1)[0]
        if pre not in THREE_D: continue
        try:
            (_, x), = by.items(); (_, z), = x.items()
        except Exception:
            continue
        rows.append((name, z.get('rms_db'), z.get('lr_db'), z.get('active_share'), z.get('visqol'), z.get('error')))
    if rows:
        print()
        print('3D (rms dB, left - right dB, sounding share, ViSQOL):')
        for n, rms, lr, act, v, err in sorted(rows):
            print(('- ' if a.md else '  ') + f'{n}: rms {rms} dB, lr {lr} dB, sounding {act}, ViSQOL {v}' + (f' ({err})' if err else ''))


if __name__ == '__main__':
    main()
