#!/usr/bin/env python3
"""The state table of SPEC.md from the measured runs: per song the ceiling (the original as a plain sound at volume 1, the
acceptance's reference), the ways of one same-run A/B (default: run 7) and the earlier run they are compared with, then the
medians, the gap to the ceiling and how many songs are within 0.3 of it. Every number is a real recording's ViSQOL.

  python3 tools/rig/final_table.py [--run 41158185476] [--md]
"""
import argparse, json, os, statistics as st
UNIT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# (key in measured/redroid-<run>.json, column label, which run: 'this' = --run, or a run id)
COLS = [('ceiling_loud', '天井＋6 dB（音量 2）', 'this'), ('shipped_run7', '出荷版', 'this'), ('improved', '改良版（5 回目）', '41142205810'),
        ('improved_fades', '最終の変換・レベル 0', 'this'), ('final', '7 回目の既定（+6 dB）', 'this'), ('final_loud10', '同 +10 dB', 'this'),
        ('refined', '**合成による分析**（+6 dB）', 'this'), ('refined_svr', '同・高い帯域を重く', 'this'), ('refined_loud10', '同 +10 dB', 'this')]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', default='41158185476'); ap.add_argument('--md', action='store_true')
    a = ap.parse_args()
    summ = json.load(open(os.path.join(UNIT, 'measured', 'summary.json'), encoding='utf-8'))['songs']
    runs = {}
    for _, _, r in COLS:
        rid = a.run if r == 'this' else r
        if rid not in runs:
            runs[rid] = json.load(open(os.path.join(UNIT, 'measured', f'redroid-{rid}.json'), encoding='utf-8'))['songs']
    songs = sorted(summ)
    table = {}
    for sid in songs:
        row = {'ceiling': summ[sid].get('ceiling', {}).get('visqol')}
        for key, _, r in COLS:
            v = runs[a.run if r == 'this' else r].get(sid, {}).get(key, {})
            if 'visqol' in v:
                row[key] = v['visqol']
        table[sid] = row
    keys = [k for k, _, _ in COLS if any(k in r for r in table.values())]
    out = {'run': a.run, 'songs': table, 'medians': {}, 'gaps': {}}
    for k in ['ceiling'] + keys:
        vals = [r[k] for r in table.values() if r.get(k) is not None]
        out['medians'][k] = {'n': len(vals), 'visqol': round(st.median(vals), 3)} if vals else None
        if k != 'ceiling':
            g = [r['ceiling'] - r[k] for r in table.values() if r.get(k) is not None and r.get('ceiling') is not None]
            gl = [r['ceiling_loud'] - r[k] for r in table.values() if r.get(k) is not None and r.get('ceiling_loud') is not None]
            out['gaps'][k] = {'n': len(g), 'median': round(st.median(g), 3) if g else None, 'within_0.3': sum(x <= 0.3 for x in g),
                              'loud_median': round(st.median(gl), 3) if gl and k != 'ceiling_loud' else None,
                              'loud_within_0.3': sum(x <= 0.3 for x in gl) if k != 'ceiling_loud' else None, 'loud_n': len(gl)}
    if not a.md:
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return
    labels = dict((k, l) for k, l, _ in COLS)
    print('| 曲 | 天井（音量 1） | ' + ' | '.join(labels[k] for k in keys) + ' |')
    print('|---|---|' + '---|' * len(keys))
    for sid in songs:
        r = table[sid]
        print(f'| {sid} | ' + ' | '.join(f"{r[k]:.2f}" if r.get(k) is not None else '–' for k in ['ceiling'] + keys) + ' |')
    print('| **中央値** | ' + ' | '.join(f"**{out['medians'][k]['visqol']:.2f}**（{out['medians'][k]['n']}）" for k in ['ceiling'] + keys) + ' |')
    print('| 天井との差の中央値（0.3 以内の曲） | – | ' + ' | '.join(
        f"{out['gaps'][k]['median']:.2f}（{out['gaps'][k]['within_0.3']}/{out['gaps'][k]['n']}）" for k in keys) + ' |')
    print('| 天井＋6 dB との差の中央値（0.3 以内） | – | – | ' + ' | '.join(
        f"{out['gaps'][k]['loud_median']:.2f}（{out['gaps'][k]['loud_within_0.3']}/{out['gaps'][k]['loud_n']}）" if out['gaps'][k]['loud_median'] is not None else '–'
        for k in keys if k != 'ceiling_loud') + ' |')


if __name__ == '__main__':
    main()
