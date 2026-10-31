#!/usr/bin/env python3
"""What a redroid run measured, read from its job log: every `[spectral rig] <recording> <what>: {...}` line (the app
scenario's `audio analyze`) into measured/redroid-<run>.json, a table of the songs (game, ceiling, gap), and with --spec the
calibration's values merged into tools/emu/spec.json (tools/rig/analyze.py spec_from: status measured, the run named).

  gh api repos/<owner>/<repo>/actions/jobs/<job>/logs > job.log
  python3 tools/rig/collect.py job.log --run <run id> [--device "<what the client was>"] [--spec]
"""
import argparse, json, os, re, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
LINE = re.compile(r'\[spectral rig\] ([\w.-]+) ([\w.:-]+): (\{.*\})\s*$')


def read(log):
    out = {}
    for line in open(log, encoding='utf-8', errors='replace'):
        m = LINE.search(line)
        if m:
            try:
                out.setdefault(m.group(1), {})[m.group(2)] = json.loads(m.group(3))
            except json.JSONDecodeError as e:
                out.setdefault(m.group(1), {})[m.group(2)] = {'error': f'unreadable line: {e}'}
    return out


# the recordings' prefixes (app.txt: audio start <prefix>_<song>) → the way the song was played
WAYS = {'g': 'game', 'c': 'ceiling', 'l': 'light', 'v': 'voices24', 'm': 'mobile', 'n': 'mobile_ahead', 'r': 'mobile_ahead_again',
        'a': 'shipped_same_run', 'b': 'improved', 'x': 'improved_drums_behind', 'y': 'improved_drums_noise', 'z': 'improved_alt',
        # louder than the files (/spectral:level 12): by setVolume, by the loud sound events; the ceiling at volume 4 / its d4 event
        'h': 'improved_loud', 'k': 'improved_loud_events', 'q': 'ceiling_loud', 'e': 'ceiling_loud_events',
        # the fades the converter fitted tick by tick (nz_fade, v_fade) at the files' level; the final default (run 7: the phone's
        # defaults, +6 dB by setVolume) and the shipped version in the same run (s; the ceiling at volume 2 is q there)
        'f': 'improved_fades', 'w': 'final', 's': 'shipped_run7'}


def songs(res):
    """per song: the game's and the ceiling's ViSQOL against the original, the gap, and the emulator against the recording"""
    rows = {}
    for rec, by in res.items():
        m = re.match(r'([gclvmnrabxyzhkqefws])_(.+)$', rec)
        if not m:
            continue
        kind, sid = m.groups()
        r = rows.setdefault(sid, {})
        s = by.get(f'song:{sid}', {})
        v = next((x for x in s.values() if isinstance(x, dict) and ('visqol' in x or 'error' in x)), None) if isinstance(s, dict) else None
        if v:
            r[WAYS[kind]] = v
        e = by.get(f'emu:{sid}')
        if e and 'emu_vs_recording' in e:
            r['emu_vs_recording'] = e['emu_vs_recording']
            if 'emu_vs_original' in e:
                r['emu_vs_original'] = e['emu_vs_original']
    for r in rows.values():
        if 'visqol' in r.get('game', {}) and 'visqol' in r.get('ceiling', {}):
            r['gap'] = round(r['ceiling']['visqol'] - r['game']['visqol'], 4)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('log'); ap.add_argument('--run', required=True); ap.add_argument('--device', default='redroid (Android 14 x86_64), Minecraft from Play')
    ap.add_argument('--spec', action='store_true')
    a = ap.parse_args()
    res = read(a.log)
    if not res:
        raise SystemExit('no [spectral rig] lines in the log')
    rows = songs(res)
    doc = {'run': a.run, 'device': a.device, 'source': 'job log [spectral rig] lines (recordings of the real client)', 'results': res, 'songs': rows}
    gaps = [r['gap'] for r in rows.values() if 'gap' in r]
    # (a recording that is not a song — the calibration, the device's audio — is not a row)
    if gaps:
        doc['summary'] = {'songs': len(gaps), 'gap_median': round(statistics.median(gaps), 4), 'within_0.3': sum(g <= 0.3 for g in gaps),
                          'game_median': round(statistics.median(r['game']['visqol'] for r in rows.values() if 'gap' in r), 4),
                          'ceiling_median': round(statistics.median(r['ceiling']['visqol'] for r in rows.values() if 'gap' in r), 4)}
    os.makedirs(os.path.join(UNIT, 'measured'), exist_ok=True)
    out = os.path.join(UNIT, 'measured', f'redroid-{a.run}.json')
    if os.path.exists(out):                     # (notes written by hand beside the numbers stay)
        doc['notes'] = json.load(open(out, encoding='utf-8')).get('notes', [])
    json.dump(doc, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{"song":24s} {"game":>7s} {"ceiling":>8s} {"gap":>6s} {"light":>7s} {"emu~rec":>8s}')
    for sid, r in sorted(rows.items()):
        f = lambda k: f"{r[k]['visqol']:.3f}" if 'visqol' in r.get(k, {}) else ('err' if k in r else '-')
        print(f"{sid:24s} {f('game'):>7s} {f('ceiling'):>8s} {r.get('gap', float('nan')):6.3f} {f('light'):>7s} {f('emu_vs_recording'):>8s}")
    if 'summary' in doc:
        print(json.dumps(doc['summary']))
    print('→', os.path.relpath(out, UNIT))
    if a.spec:
        calib = res.get('calib', {}).get('all')
        if not calib:
            raise SystemExit('--spec: no calib all in this run')
        sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(UNIT, 'tools', 'emu'))
        import analyze as A
        import client as E
        cur = json.load(open(E.SPEC_PATH)) if os.path.exists(E.SPEC_PATH) else {}
        cur.update(A.spec_from(calib, f'redroid run {a.run}'))
        json.dump(cur, open(E.SPEC_PATH, 'w'), indent=1, ensure_ascii=False)
        print('→', os.path.relpath(E.SPEC_PATH, UNIT), sorted(cur))


if __name__ == '__main__':
    main()
