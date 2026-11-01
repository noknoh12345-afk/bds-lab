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
        'f': 'improved_fades', 'w': 'final', 's': 'shipped_run7', 'u': 'final_loud10',
        # run 8: the converter's analysis by synthesis through the client model (tools/spectral.py refine_client) at the phone's
        # defaults (+6 dB), at +10 dB, and with the bands weighted as ViSQOL's MOS mapping leans on them (refine_weights=svr)
        't': 'refined', 'p': 'refined_loud10', 'o': 'refined_svr',
        # run 9: the analysis by synthesis with the bands weighted as ViSQOL's MOS leans on them, five sweeps, the level held (d);
        # the live encoder's own frames played as a song (i: web/live.js, causal, as a voice chat sends them); a song played over
        # the live path (jp: /spectral:live_demo on headphones), and as a 3D speaker to the listener's left / right (jl / jr)
        'd': 'refined_svr5', 'i': 'live_encoder', 'jp': 'live_phones', 'jl': 'live_3d_left', 'jr': 'live_3d_right',
        # run 10: the same conversion fitted at +10 dB and played at +10 dB (e); the live path as each listener's own 3D sounds
        # (near: what follow plays) to the listener's left / right (kl / kr)
        'e': 'refined_svr5_loud10', 'kl': 'live_near_left', 'kr': 'live_near_right',
        # run 11: the same 3D for each listener to the left at 3, 12 and 24 blocks (how far: level and left / right)
        'ka': 'live_near_left3', 'kb': 'live_near_left12', 'kc': 'live_near_left24',
        # run 12: the same conversion fitted and played at +8 dB (f); the 3D sounds made at volume 1 / 2 / 4 (spectral:range) heard
        # from 24 blocks (ra / rb / rc) and at volume 4 from 40 (rd)
        'f': 'refined_svr5_loud8', 'ra': 'live_near24_range1', 'rb': 'live_near24_range2', 'rc': 'live_near24_range4', 'rd': 'live_near40_range4',
        # run 13 (1.2.0: 3D sounds made at P_MIN, the range 3 by default): the songs made for +6 dB played at +10 dB (o, not run 8's);
        # each listener's own 3D sound to the left at 3 / 24 / 46 blocks made at volume 3 (na / nb / nc), at 3 blocks made at 1 (nf);
        # the one 3D speaker for everyone at 6 blocks (nd, as run 9's jl) and at 52 blocks made at 4 (ne: past the definitions' 48)
        'o': 'refined_svr5_at10', 'na': 'live_near3_range3', 'nb': 'live_near24_range3', 'nc': 'live_near46_range3', 'nf': 'live_near3_range1',
        'nd': 'live_3d_speaker6_range3', 'ne': 'live_3d_speaker52_range4',
        # run 14: 3D sounds louder than the files (spectral:range 3 <dB>) — near to the left at 3 blocks 0 / +6 / +10 dB (la / lb / lc), 24
        # blocks (ld / le / lf), 46 blocks 0 / +10 (lg / lh); a song played as a speaker (ls, the song player's 3D sounds); a voice
        # following a name-tagged armor stand 3 blocks ahead, standing (mg) and walking left and right a block every 0.5 s (mf)
        'la': 'live_near3_level0', 'lb': 'live_near3_level6', 'lc': 'live_near3_level10', 'ld': 'live_near24_level0',
        'le': 'live_near24_level6', 'lf': 'live_near24_level10', 'lg': 'live_near46_level0', 'lh': 'live_near46_level10',
        'ls': 'live_3d_song_speaker', 'mg': 'live_3d_follow_still', 'mf': 'live_3d_follow_walking',
        # run 15: live 3D made quietly (the _3q events, spectral:range 3 0 true): near at 3 blocks made as before (qd) and quietly (qa),
        # quietly at 24 / 46 blocks (qb / qc) and at 24 made at 16 (qg); a walking talker made as before (qf) and quietly (qe)
        'qd': 'live_near3_made_loud', 'qa': 'live_near3_quiet', 'qb': 'live_near24_quiet', 'qc': 'live_near46_quiet',
        'qg': 'live_near24_quiet_range16', 'qf': 'live_3d_follow_walking_loud', 'qe': 'live_3d_follow_walking_quiet',
        # (and run 14's 46 blocks again, 0 / +10 dB: xg / xh; mg as in run 14, at +10 dB)
        'xg': 'live_near46_level0_again', 'xh': 'live_near46_level10_again',
        # run 16: the defaults (made quietly, +10 dB) against made as before, the same run: near 3 blocks (ua / ub), 24 blocks (uc / ud);
        # a talker standing made quietly (ug), walking made quietly / as before (ue / uf)
        'ua': 'live_near3_quiet_default', 'ub': 'live_near3_loud_made', 'uc': 'live_near24_quiet_default', 'ud': 'live_near24_loud_made',
        'ug': 'live_3d_follow_still_quiet', 'ue': 'live_3d_follow_walking_quiet_default', 'uf': 'live_3d_follow_walking_loud_made',
        # run 17: the handover of a talker walking 2 blocks a step (a move every ~0.7 s): standing (vt), the old sounds held (vh / wh),
        # steered with the voice (vs / ws)
        'vt': 'live_3d_follow_still_r17', 'vh': 'live_3d_walk_hold', 'wh': 'live_3d_walk_hold_again', 'vs': 'live_3d_walk_steer', 'ws': 'live_3d_walk_steer_again',
        # run 18: the quiet events' definition volume (0.1 / 0.01 / 0.001, spectral:range's fourth value) for a talker standing (ta, tb)
        # and walking as in run 17 (wa .. wf), and moving the sounds after 3 blocks (wg, wi)
        'ta': 'live_3d_still_q01', 'tb': 'live_3d_still_q0001', 'wa': 'live_3d_walk_q01', 'wb': 'live_3d_walk_q001', 'wc': 'live_3d_walk_q0001',
        'wd': 'live_3d_walk_q0001_again', 'we': 'live_3d_walk_q001_again', 'wf': 'live_3d_walk_q01_again', 'wg': 'live_3d_walk_q01_move3',
        'wi': 'live_3d_walk_q0001_move3',
        # run 19 (all made at 0.01): a talker standing at 0.01 / 0.1 (ya, yb); walking: the 1.2.0 handover (yc, yj), its state sent again
        # 3 times (yd, yi), steered and handed over after 6 ticks (ye, yh), both (yf, yg)
        'ya': 'live_3d_still_q001', 'yb': 'live_3d_still_q01_r19', 'yc': 'live_3d_walk_hold2', 'yj': 'live_3d_walk_hold2_again',
        'yd': 'live_3d_walk_hold2_resend3', 'yi': 'live_3d_walk_hold2_resend3_again', 'ye': 'live_3d_walk_steer6',
        'yh': 'live_3d_walk_steer6_again', 'yf': 'live_3d_walk_steer6_resend3', 'yg': 'live_3d_walk_steer6_resend3_again',
        # run 20: the live encoder as it was (za, zd) and with its refinement as it goes (zb, zc: web/live.js LiveRefiner), the live path on phones
        'za': 'live_enc_plain', 'zb': 'live_enc_refined', 'zc': 'live_enc_refined_again', 'zd': 'live_enc_plain_again',
        # and a talker walking (0.01): the sounds moved after 1.5 blocks (zf, zi) or 3 (zg, zh)
        'zf': 'live_3d_walk_q001_move15', 'zi': 'live_3d_walk_q001_move15_again', 'zg': 'live_3d_walk_q001_move3', 'zh': 'live_3d_walk_q001_move3_again'}


def songs(res):
    """per song: the game's and the ceiling's ViSQOL against the original, the gap, and the emulator against the recording"""
    rows = {}
    for rec, by in res.items():
        m = re.match(r'([a-z]{1,2})_(.+)$', rec)
        if not m or m.group(1) not in WAYS:
            m = re.match(r'([a-z])_(.+)$', rec)
        if not m or m.group(1) not in WAYS:
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
