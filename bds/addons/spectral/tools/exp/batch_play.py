#!/usr/bin/env python3
"""Every song of a real-client run, played and "recorded" at once through the client model instead of the phone: the same
app JSON as tools/exp/make_app.py (the arms, their songs, packs and commands), each song through the add-on's own bundle in
the mock (tools/sim/run_song.mjs: the same commands the app run sends) → tools/emu with spec.json → the measured client path
(24 kHz mix, the hard clip at 2.0 file units, 32.5 dB under the files, 16 bits, x2 to 48 kHz) → a WAV "recording" at the
level the phone records, scored by the rig's own tools/rig/score_song.py (ViSQOL v3 and the rest, as in the job log), made an
Opus file for listening, all songs in parallel. No real time to wait through: the whole set in minutes.

**Emulated, not measured**: the model plays a song a little better than the phone does (run 9: see the README), and has no
3D (the arms that play from a place — speaker / near / follow — are left out: only the phone tells left from right).

  python3 tools/exp/batch_play.py tools/exp/app10.json [--out corpus/renders/emu/<name>] [--jobs N] [--only d,e] [--ceiling]

--ceiling adds c_<song>: the original itself through the client path (the ceiling — the original played as a plain sound —
which the path alone predicts within 0.06 ViSQOL on average over 13 songs, SPEC.md).
Run 9 (13 songs x 2 arms, the same packs): the model scored 0.27 higher than the phone on average (median 0.23, sd 0.25),
correlation 0.91, and picked the better arm of each song as the phone did in 12 of 13 — in 5 minutes on two cores.

Writes <out>/<prefix>_<song>.opus, <out>/index.json (the device's publish format: bds-lab-recordings/1), <out>/scores.json
(measured/redroid-<run>.json's shape, "source": "emulator", for tools/abx/make_compare_real.py --scores) and prints a table."""
import argparse, hashlib, json, os, subprocess, sys, time
from multiprocessing import Pool
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
SONGS = ['piano_gymnopedie', 'piano_chopin_op66', 'vocal_stars', 'vocal_name_of_love', 'choir_how_long', 'drums_round', 'rock_big',
         'edm_detection', 'orchestra_five_armies', 'funk_funkorama', 'speech_ja_soseki', 'speech_en_wordsworth', 'demo_selfmade']


def items_of(app):
    """(prefix, song, song.json, play) for every recording the app run makes that the model can play"""
    from exp import U, song_pack
    out, skipped = [], []
    for a in app['arms']:
        play_cmd = a.get('play', 'spectral:play {song}')
        if any(w in play_cmd for w in (' speaker', ' near', ' follow')):
            skipped.append(a['pre']); continue
        voices = next((int(c.split()[1]) for c in a.get('cmds', []) if c.startswith('spectral:voices ')), None)
        cmds = [c for c in a.get('cmds', []) if c.startswith('spectral:') and not c.startswith('spectral:voices ')]
        for s in a.get('songs', SONGS):
            sid = s + a.get('suffix', '')
            if a.get('pack'):
                sp = os.path.join(U, a['pack'], f'{sid}.song.json')
            else:
                sp = song_pack(s, a.get('conv') or None)
            play = {'mode': 'quality', 'voices': voices, 'cmds': cmds}
            if play_cmd != 'spectral:play {song}':
                play['play'] = play_cmd.replace('{song}', '{id}').replace(' @s', '')
            out.append((a['pre'], s, sp, {k: v for k, v in play.items() if v is not None}))
    return out, skipped


def one(item, out_dir, bundle):
    pre, s, sp, play = item
    import numpy as np
    import warnings; warnings.filterwarnings('ignore')
    from exp import U, song_log, render, path24, CACHE, C
    from common import SR
    from scipy.io import wavfile
    t0 = time.time()
    name = f'{pre}_{s}'
    lg = None
    try:
        if sp is None:                                            # (the ceiling: the original as the game plays a plain sound)
            m = path24(C.load(s, SR, stereo=True), clip=2.0)
        else:
            lg = song_log(sp, {**play, 'bundle': bundle})
            y = render(lg, {'oneshot_latency_ms': -45})
            m = path24(y, clip=2.0)                               # mono at the phone's recording level, 16-bit steps
        lead = np.zeros(int(1.5 * SR))                             # (the recorder starts before the song, as on the device)
        x = np.concatenate([lead, m, np.zeros(int(0.5 * SR))])
        wav = os.path.join(out_dir, f'{name}.wav')
        wavfile.write(wav, SR, (np.clip(np.stack([x, x], 1), -1, 32767 / 32768) * 32768).astype(np.int16))
        ref = os.path.join(U, 'corpus', 'audio', f'{s}.mp3')               # (what the device's audio analyze scores against)
        js = os.path.join(out_dir, f'{name}.score.json')
        r = subprocess.run([sys.executable, os.path.join(U, 'tools', 'rig', 'score_song.py'), ref, wav, '--json', js], capture_output=True, text=True, timeout=1800)
        score = json.load(open(js))[f'{name}.wav'] if r.returncode == 0 else {'error': (r.stderr or r.stdout)[-300:]}
        opus = os.path.join(out_dir, f'{name}.opus')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-map_metadata', '-1', '-c:a', 'libopus', '-b:a', '160k', opus], check=True)
        info = json.load(open(lg + '.info')) if lg and os.path.exists(lg + '.info') else {}
        os.remove(wav)
        return {'name': name, 'pre': pre, 'song': s, 'score': score, 'opus': opus, 'cpt': info.get('calls_per_tick', {}).get('mean'), 's': round(time.time() - t0, 1)}
    except Exception as e:
        return {'name': name, 'pre': pre, 'song': s, 'score': {'error': f'{type(e).__name__}: {e}'[:300]}, 's': round(time.time() - t0, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('app'); ap.add_argument('--out'); ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    ap.add_argument('--only', default='', help='these prefixes only (d,e)'); ap.add_argument('--bundle', help='the add-on build to play (default: bp/scripts/main.js)')
    ap.add_argument('--ceiling', action='store_true', help='c_<song>: the original through the client path')
    a = ap.parse_args()
    from exp import U
    app = json.load(open(a.app))
    name = os.path.splitext(os.path.basename(a.app))[0]
    out_dir = os.path.abspath(a.out or os.path.join(U, 'corpus', 'renders', 'emu', name))
    os.makedirs(out_dir, exist_ok=True)
    bundle = os.path.abspath(a.bundle or os.path.join(U, 'bp', 'scripts', 'main.js'))
    items, skipped = items_of(app)
    if a.only:
        keep = set(a.only.split(',')); items = [i for i in items if i[0] in keep]
    if a.ceiling:
        items += [('c', s, None, {}) for s in SONGS if any(i[1] == s for i in items)]
    t0 = time.time()
    print(json.dumps({'recordings': len(items), 'jobs': a.jobs, 'left_out_3d': skipped, 'out': out_dir}), flush=True)
    with Pool(a.jobs) as pool:
        res = pool.starmap(one, [(i, out_dir, bundle) for i in items])
    # (the device's own formats: the run's index of recordings, and the scores as tools/rig/collect.py writes them)
    sys.path.insert(0, os.path.join(U, 'tools', 'rig'))
    from collect import WAYS
    recs, results, songs = [], {}, {}
    for r in res:
        sc = r['score']
        results[r['name']] = {f"song:{r['song']}": {f"{r['name']}.wav": sc}}
        if 'visqol' in sc:
            songs.setdefault(r['song'], {})[WAYS.get(r['pre'], r['pre'])] = {k: sc[k] for k in ('visqol', 'mrstft', 'third_oct_db', 'onset_ms', 'onset_recall', 'lr_db') if k in sc}
        if r.get('opus') and os.path.exists(r['opus']):
            b = open(r['opus'], 'rb').read()
            recs.append({'name': r['name'], 'file': os.path.basename(r['opus']), 'kbps': 160, 'kb': round(len(b) / 1024), 'sha256': hashlib.sha256(b).hexdigest(),
                         'measured': {'visqol': sc.get('visqol')}, 'emulated': True})
    json.dump({'format': 'bds-lab-recordings/1', 'addon': 'spectral', 'source': 'emulator', 'recordings': recs}, open(os.path.join(out_dir, 'index.json'), 'w'), indent=1)
    json.dump({'run': f'emu-{name}', 'device': 'the client model (tools/emu/client.py + spec.json, tools/exp/exp.path24 clip 2.0): emulated',
               'source': 'tools/exp/batch_play.py', 'results': results, 'songs': songs}, open(os.path.join(out_dir, 'scores.json'), 'w'), indent=1)
    pres = sorted({r['pre'] for r in res}, key=[i[0] for i in items].index)
    print(f"{'song':24s}" + ''.join(f'{p:>8s}' for p in pres))
    for s in SONGS:
        row = {r['pre']: r['score'].get('visqol') for r in res if r['song'] == s}
        if row: print(f'{s:24s}' + ''.join((f'{row[p]:8.3f}' if row.get(p) is not None else '       -') for p in pres))
    errs = [r for r in res if 'error' in r['score']]
    for r in errs: print('error', r['name'], r['score']['error'][:200])
    print(json.dumps({'done': len(res) - len(errs), 'errors': len(errs), 'seconds': round(time.time() - t0, 1), 'out': out_dir}))


if __name__ == '__main__':
    main()
