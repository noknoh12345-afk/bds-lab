#!/usr/bin/env python3
"""The calibrated emulator against a real client's recording of the same song (the brief's check for the emulator: the same
commands, the emulator's output and the recording, ViSQOL ≥ 4.5).

  python3 tools/rig/emu_check.py <song> <recording.wav> [--mode quality|light] [--spec spec.json] [--json out.json]

<song> is a song pack (.song.json: meta + data) or what `songpack.py --parts` wrote (the console's messages, put together
again). The song goes through the real bundle in the recording mock (tools/sim/run_song.mjs: every SoundInstance call it
makes), tools/emu/client.py renders those calls with the spec (tools/emu/spec.json: the client as measured, else assumed),
and the recording — cut to where its sound is — is scored against that render, then against the original too when the song
is a corpus one (the gap the emulator would predict is then render vs original next to recording vs original).
"""
import json, os, subprocess, sys, tempfile
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(UNIT, 'tools', 'emu'))
sys.path.insert(0, os.path.join(UNIT, 'tools', 'metrics'))
sys.path.insert(0, HERE)
import client as E
import metrics as MT
import score_song as SS


def song_of(path):
    d = json.load(open(path, encoding='utf-8'))
    if 'parts' in d:
        msgs = sorted((json.loads(m) for m in d['parts']), key=lambda m: m['i'])
        d = {'meta': {**msgs[0]['meta'], 'id': msgs[0]['id']}, 'data': ''.join(m['data'] for m in msgs)}
    return d


def main():
    args = [a for a in sys.argv[1:]]
    opt = lambda k, dflt=None: args[args.index(k) + 1] if k in args else dflt
    mode, spec_path, out = opt('--mode', 'quality'), opt('--spec', E.SPEC_PATH), opt('--json')
    pos = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or not args[i - 1].startswith('--'))]
    song = song_of(pos[0])
    with tempfile.TemporaryDirectory() as tmp:
        sj = os.path.join(tmp, 'song.json')
        json.dump(song, open(sj, 'w'))
        r = subprocess.run(['node', os.path.join(UNIT, 'tools', 'sim', 'run_song.mjs'), sj, mode], cwd=UNIT, capture_output=True, text=True, timeout=1200)
        if r.returncode != 0:
            raise SystemExit('run_song: ' + (r.stderr or r.stdout)[-400:])
        sim = json.loads(r.stdout.strip().split('\n')[-1])
    log_path = os.path.join(UNIT, sim['out']) if not os.path.isabs(sim['out']) else sim['out']
    log = json.load(open(log_path))
    spec, full = E.load_spec(spec_path)
    y = E.render(log, spec)
    y = y.mean(1) if y.ndim == 2 else y
    rec = SS.active(SS.load(pos[1]), len(y))
    res = {'emu_vs_recording': MT.report(y, rec), 'recorded_s': round(len(rec) / SS.SR, 2), 'rendered_s': round(len(y) / SS.SR, 2),
           'mode': mode, 'calls_per_tick': sim.get('calls_per_tick'),
           'spec': {k: v['status'] for k, v in full.items()}}
    # (a corpus song: the emulator's own prediction against the original beside the recording's)
    sid = song['meta'].get('id')
    try:
        sys.path.insert(0, os.path.join(UNIT, 'tools'))
        import corpus as C
        if sid and os.path.exists(C.excerpt_path(sid)):
            ref = SS.load(C.excerpt_path(sid))
            res['emu_vs_original'] = MT.report(ref, y)
    except Exception as e:                       # (the comparison with the recording stands without it)
        res['emu_vs_original'] = {'error': f'{type(e).__name__}: {e}'}
    try:
        os.remove(log_path)
    except OSError:
        pass
    txt = json.dumps(res, ensure_ascii=False)
    if out:
        open(out, 'w').write(txt)
    print(txt)


if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    main()
