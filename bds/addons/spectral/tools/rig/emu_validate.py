#!/usr/bin/env python3
"""How far the emulator stands in for the phone: every recording of a real-device run beside the emulator's rendering of the same
song data. The song goes through the add-on's own bundle in the recording mock as the phone plays it (tools/sim/run_song.mjs:
24 voices, +10 dB, no drum bursts — what 1.2.0+ sends a Mobile client), tools/emu/client.py renders those calls with the measured
spec (tools/emu/spec.json) and the measured client path (tools/exp/exp.py path24: the 24 kHz mix, -32.5 dB, 16 bit, x2 linear,
clipped at 2.0). Three answers, each against the recordings:
  1. sound:   ViSQOL of the emulator's rendering against the recording (the recording the reference): how alike they sound
  2. score:   the score the emulator predicts (ViSQOL against the original) beside the score the phone got (the rig's own ViSQOL
              on the in-run WAV, from the run's [spectral rig] lines: measured/redroid-<run>.json)
  3. choice:  for two arms of the same songs (A/B), the difference the emulator predicts beside the one the phone got
  python3 tools/rig/emu_validate.py [--run 41385768022] [--songs a,b] [--jobs 2] [--out measured/emu-validation-<date>.json]
Runs it knows (RUNS below): the run, its arms (prefix → the song data played and the label measured/redroid-<run>.json gives it)
and the recordings (corpus/renders/rec<NN>: tools/rig/fetch_rec.py). Emulated (推測) against measured (実測): kept apart."""
import sys, os, json, math, time, argparse, datetime
import numpy as np
from concurrent.futures import ProcessPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [os.path.join(UNIT, 'tools', 'exp'), os.path.join(UNIT, 'tools', 'metrics'), HERE]
SONGS = ['piano_gymnopedie', 'piano_chopin_op66', 'vocal_stars', 'vocal_name_of_love', 'choir_how_long', 'drums_round', 'rock_big',
         'edm_detection', 'orchestra_five_armies', 'funk_funkorama', 'speech_ja_soseki', 'speech_en_wordsworth', 'demo_selfmade']
PHONE = ['spectral:drums off', 'spectral:level 10']                # what 1.2.0+ sends a Mobile client (with 24 voices)
OLD = ['spectral:voices 24', 'spectral:drums off', 'spectral:engine 0 false 0 0']   # the 4th session's arms set it by hand
RUNS = {
    # 33rd run: the songs of the pack (48 voices; a phone plays the first 24) and the same through SPZ2 (24 voices)
    '41385768022': {'rec': 'corpus/renders/rec33', 'pairs': [('o', 'z')], 'arms': {
        'o': {'song': 'tools/exp/packs/run10/{s}_e.song.json', 'label': 'refined_svr5_at10', 'cmds': PHONE},
        'z': {'song': 'tools/exp/packs/spz2/{s}_z.song.json', 'label': 'improved_alt', 'cmds': PHONE}}},
    # 12th run: +6 / +8 / +10 dB song by song (each arm's pack refined for its level), the add-on build of that run
    '41205071937': {'rec': 'corpus/renders/rec12', 'bundle': 'corpus/renders/exp/bundles/r12.js', 'pairs': [('d', 'e'), ('d', 'f')], 'arms': {
        'd': {'song': 'tools/exp/packs/run9/{s}_d.song.json', 'label': 'refined_svr5', 'cmds': OLD + ['spectral:level 6 volume']},
        'f': {'song': 'tools/exp/packs/run12/{s}_f.song.json', 'label': 'refined_svr5_loud8', 'cmds': OLD + ['spectral:level 8 volume']},
        'e': {'song': 'tools/exp/packs/run10/{s}_e.song.json', 'label': 'refined_svr5_loud10', 'cmds': OLD + ['spectral:level 10 volume']}}},
}


def one(job):
    """(arm, song, song json, recording, commands, bundle) → the emulator's rendering scored against the original and the recording"""
    import warnings; warnings.filterwarnings('ignore')
    import exp as X, metrics as MT, score_song as SS
    arm, sid, sp, rec_path, cmds, bundle = job
    t0 = time.time()
    lg = X.song_log(sp, {'mode': 'quality', 'voices': 24, 'cmds': cmds, 'bundle': bundle})
    y = X.path24(X.render(lg, {'oneshot_latency_ms': -45}), clip=2.0)
    o = X.C.load(sid, X.SR)
    pred = MT.visqol_score(o, y)
    rec = SS.active(SS.load(rec_path), len(y))
    r, e = MT.align(rec, y)
    sound = MT.visqol_score(r, e)
    # (the two sounds' 1/3-octave spectra: where the emulator is louder or quieter than the phone, dB)
    third = [round(float(v), 2) for v in third_diff(r, e)]
    return {'arm': arm, 'song': sid, 'emu_pred': round(pred, 4), 'emu_vs_rec': round(sound, 4), 'third_db': third, 's': round(time.time() - t0, 1)}


def third_diff(ref, test):
    """the 1/3-octave band levels of test minus ref (dB), 50 Hz – 16 kHz"""
    n = 8192; hop = n // 2; w = np.hanning(n)
    m = (min(len(ref), len(test)) - n) // hop
    idx = np.arange(m)[:, None] * hop + np.arange(n)[None, :]
    A = (np.abs(np.fft.rfft(ref[idx] * w, axis=1)) ** 2).mean(0); B = (np.abs(np.fft.rfft(test[idx] * w, axis=1)) ** 2).mean(0)
    f = np.arange(n // 2 + 1) * 48000 / n
    out = []
    for k in range(-13, 13):
        fc = 1000 * 2 ** (k / 3); sel = (f >= fc * 2 ** (-1 / 6)) & (f < fc * 2 ** (1 / 6))
        if 50 <= fc <= 16000 and sel.any():
            out.append(10 * math.log10((B[sel].sum() + 1e-20) / (A[sel].sum() + 1e-20)))
    return out


def stats(xs, ys):
    xs, ys = np.array(xs, float), np.array(ys, float); d = xs - ys
    c = float(np.corrcoef(xs, ys)[0, 1]) if len(xs) > 2 and xs.std() > 0 and ys.std() > 0 else None
    return {'n': len(xs), 'mean_diff': round(float(d.mean()), 3), 'mean_abs_diff': round(float(np.abs(d).mean()), 3),
            'max_abs_diff': round(float(np.abs(d).max()), 3), 'corr': None if c is None else round(c, 3)}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--run', default='41385768022'); ap.add_argument('--songs'); ap.add_argument('--jobs', type=int, default=2)
    ap.add_argument('--out')
    a = ap.parse_args()
    cfg = RUNS[a.run]
    meas = json.load(open(os.path.join(UNIT, 'measured', f'redroid-{a.run}.json')))['songs']
    songs = a.songs.split(',') if a.songs else SONGS
    bundle = os.path.join(UNIT, cfg.get('bundle', 'bp/scripts/main.js'))
    jobs = [(arm, s, os.path.join(UNIT, c['song'].format(s=s)), os.path.join(UNIT, cfg['rec'], f'{arm}_{s}.opus'), c['cmds'], bundle)
            for arm, c in cfg['arms'].items() for s in songs]
    jobs = [j for j in jobs if os.path.exists(j[2]) and os.path.exists(j[3])]
    rows = []
    with ProcessPoolExecutor(a.jobs) as ex:
        for r in ex.map(one, jobs):
            r['measured'] = meas.get(r['song'], {}).get(cfg['arms'][r['arm']]['label'], {}).get('visqol')
            rows.append(r); print(json.dumps({k: v for k, v in r.items() if k != 'third_db'}), flush=True)
    ok = [r for r in rows if r['measured'] is not None]
    out = {'what': 'the emulator (tools/emu/client.py + spec.json + the measured client path) against the real phone\'s recordings of the same song data: '
                   'emu_vs_rec = ViSQOL of the rendering against the recording; emu_pred = the emulator\'s ViSQOL against the original; '
                   'measured = the rig\'s ViSQOL of the recording against the original (in-run WAV)',
           'status': '推測（エミュレーター）と実測（録音）を並べたもの', 'run': a.run, 'date': datetime.date.today().isoformat(),
           'arms': {k: {'song': v['song'], 'cmds': v['cmds']} for k, v in cfg['arms'].items()}, 'bundle': cfg.get('bundle', 'bp/scripts/main.js'),
           'score': stats([r['emu_pred'] for r in ok], [r['measured'] for r in ok]),
           'sound': {'median_emu_vs_rec': round(float(np.median([r['emu_vs_rec'] for r in rows])), 3), 'min': round(min(r['emu_vs_rec'] for r in rows), 3),
                     'max': round(max(r['emu_vs_rec'] for r in rows), 3),
                     'third_db_median': [round(float(v), 2) for v in np.median(np.array([r['third_db'] for r in rows]), 0)]},
           'rows': rows}
    by = {(r['arm'], r['song']): r for r in ok}
    out['choice'] = []
    for A, B in cfg.get('pairs', []):
        pairs = [(by[(B, s)]['emu_pred'] - by[(A, s)]['emu_pred'], by[(B, s)]['measured'] - by[(A, s)]['measured']) for s in songs if (A, s) in by and (B, s) in by]
        if pairs:
            pe, pm = zip(*pairs)
            same = sum(1 for e, m in pairs if (e > 0) == (m > 0) or (abs(e) < 0.02 and abs(m) < 0.02))
            out['choice'].append({'pair': f'{B} - {A}', **stats(pe, pm), 'emu_mean': round(float(np.mean(pe)), 4), 'measured_mean': round(float(np.mean(pm)), 4),
                                  'emu_better': sum(1 for e in pe if e > 0), 'measured_better': sum(1 for m in pm if m > 0),
                                  'same_direction': f'{same}/{len(pairs)} (or both within 0.02)'})
    print(json.dumps({k: v for k, v in out.items() if k != 'rows'}, ensure_ascii=False))
    if a.out:
        json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
