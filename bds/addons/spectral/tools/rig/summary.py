#!/usr/bin/env python3
"""Every real-client measurement in measured/redroid-*.json, side by side: per song the ViSQOL of the ceiling and of each way
the add-on played it, the gap to the ceiling, and the medians — as JSON (measured/summary.json) and a Markdown table for
SPEC.md. A song recorded the same way in two runs keeps the later run's value (and both are listed under "repeats").

  python3 tools/rig/summary.py [--md]
"""
import glob, json, os, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
# (the ways, in the order of the table: key in measured/redroid-*.json → label)
WAYS = [('ceiling', '天井'), ('game', '48 声（前の既定）'), ('voices24', '24 声'), ('mobile', '電話の既定 24 声'),
        ('light', '軽量 16 声'), ('mobile_ahead', '電話の既定＋打撃音を先に'), ('mobile_ahead_again', '同（もう一度）'),
        ('shipped_same_run', '出荷版（同じ run でもう一度）'), ('improved', '改良版'), ('improved_drums_behind', '改良版＋打撃音を 1 tick 後に'),
        ('improved_drums_noise', '改良版＋打撃をノイズで'), ('improved_alt', '改良版＋命令の予算 24'),
        ('improved_loud', '改良版＋12 dB（setVolume）'), ('improved_loud_events', '改良版＋12 dB（音量 4 の音）'),
        ('ceiling_loud', '天井＋6 dB（音量 2）'), ('ceiling_loud_events', '天井＋12 dB（音量 4 の音）'),
        ('shipped_run7', '出荷版（7 回目の run）'), ('improved_fades', '改良版＋tick ごとのフェード'), ('final', '最終の既定（＋6 dB）'), ('final_loud10', '最終の既定を＋10 dB で'),
        ('refined', '合成による分析（模型を通して最適化、＋6 dB）'), ('refined_svr', '合成による分析・高い帯域を重く'), ('refined_loud10', '合成による分析を＋10 dB で'),
        ('refined_svr5', '合成による分析・高い帯域を重く・5 回・音量を保つ'), ('live_encoder', 'ライブの変換（声をその場で）'), ('live_phones', 'ライブの道（ヘッドホン）'),
        ('live_3d_left', 'ライブ・3D で左'), ('live_3d_right', 'ライブ・3D で右')]


def main():
    runs = sorted(glob.glob(os.path.join(UNIT, 'measured', 'redroid-*.json')))
    table, repeats, sources = {}, {}, {}
    for p in runs:
        run = os.path.basename(p)[len('redroid-'):-len('.json')]
        d = json.load(open(p, encoding='utf-8'))
        if d.get('comparable') is False:            # (recorded before the levels were set: not beside the others)
            continue
        for sid, r in d.get('songs', {}).items():
            for key, _ in WAYS:
                v = r.get(key, {})
                if 'visqol' not in v:
                    continue
                cell = table.setdefault(sid, {})
                if key in cell:
                    repeats.setdefault(sid, {}).setdefault(key, [cell[key]['visqol']]).append(v['visqol'])
                cell[key] = {'visqol': v['visqol'], 'onset_recall': v.get('onset_recall'), 'third_oct_db': v.get('third_oct_db'), 'run': run}
                sources.setdefault(key, set()).add(run)
    out = {'songs': table, 'repeats': repeats, 'runs': {k: sorted(v) for k, v in sources.items()}, 'medians': {}, 'gaps': {}}
    for key, _ in WAYS:
        vals = [c[key]['visqol'] for c in table.values() if key in c]
        if vals:
            out['medians'][key] = {'n': len(vals), 'visqol': round(statistics.median(vals), 3)}
        if key != 'ceiling':
            g = [c['ceiling']['visqol'] - c[key]['visqol'] for c in table.values() if key in c and 'ceiling' in c]
            if g:
                out['gaps'][key] = {'n': len(g), 'median': round(statistics.median(g), 3), 'within_0.3': sum(x <= 0.3 for x in g)}
    json.dump(out, open(os.path.join(UNIT, 'measured', 'summary.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    if '--md' in sys.argv:
        keys = [(k, l) for k, l in WAYS if k in out['medians']]
        print('| 曲 | ' + ' | '.join(l for _, l in keys) + ' |')
        print('|---|' + '---|' * len(keys))
        for sid in sorted(table):
            c = table[sid]
            print(f'| {sid} | ' + ' | '.join(f"{c[k]['visqol']:.2f}" if k in c else '–' for k, _ in keys) + ' |')
        print('| **中央値** | ' + ' | '.join(f"**{out['medians'][k]['visqol']:.2f}**（{out['medians'][k]['n']}）" for k, _ in keys) + ' |')
        print('| 天井との差の中央値（0.3 以内の曲） | – | ' + ' | '.join(f"{out['gaps'][k]['median']:.2f}（{out['gaps'][k]['within_0.3']}/{out['gaps'][k]['n']}）" if k in out['gaps'] else '–' for k, _ in keys[1:]) + ' |')
    else:
        print(json.dumps({'medians': out['medians'], 'gaps': out['gaps'], 'repeats': repeats}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
