#!/usr/bin/env python3
"""The phone without the phone: what the real-device rig would record of a song, made here in about a minute, and scored the
way the rig scores its recordings (tools/rig/score_song.py: ViSQOL v3 and the rest against the original).
The song goes through the add-on's own bundle in the recording mock as a phone is sent it (tools/sim/run_song.mjs: 24 voices,
+10 dB, no drum bursts — src/main.ts CLIENTS.Mobile), tools/emu/client.py plays those calls with the measured client
(tools/emu/spec.json: setPitch exact, fades linear from 0.8 ms, 32 sounds at once — the quietest goes, commands landing with
7 ms of jitter) and the measured output path (tools/exp/exp.py path24: the game's 24 kHz mix read linearly and folded above
12 kHz, -32.5 dB, 16 bit, doubled to 48 kHz by linear interpolation, the mix clipped at 2.0). How close it comes to the phone:
tools/rig/emu_validate.py against the recordings (measured/emu-validation-*.json). Emulated (推測), not a recording.

  python3 tools/emu/phone.py <song.json> [--original <audio> | --corpus <id>] [--wav out.wav] [--voices 24] [--level 10]
                             [--client phone|pc] [--json out.json]
--client pc: an unmeasured PC as assumed (48 kHz mix, no limit on sounds, floating point; all the song's voices, no level boost)."""
import sys, os, json, argparse, warnings
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [os.path.join(UNIT, 'tools', 'exp'), os.path.join(UNIT, 'tools', 'metrics'), os.path.join(UNIT, 'tools', 'rig')]
warnings.filterwarnings('ignore')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('song'); ap.add_argument('--original'); ap.add_argument('--corpus'); ap.add_argument('--wav'); ap.add_argument('--json')
    ap.add_argument('--voices', type=int); ap.add_argument('--level', type=float); ap.add_argument('--client', default='phone', choices=['phone', 'pc'])
    a = ap.parse_args()
    import numpy as np
    import exp as X, metrics as MT, score_song as SS
    sp = os.path.abspath(a.song)
    meta = json.load(open(sp))['meta']
    phone = a.client == 'phone'
    voices = a.voices or (min(24, meta['voices']) if phone else meta['voices'])
    level = a.level if a.level is not None else (10 if phone else 0)
    play = {'mode': 'quality', 'voices': voices, 'bundle': os.path.join(UNIT, 'bp', 'scripts', 'main.js'),
            'cmds': ['spectral:drums off', f'spectral:level {level:g}']}
    lg = X.song_log(sp, play)
    y = X.render(lg, {'oneshot_latency_ms': -45, **({} if phone else {'max_voices': 1000})})
    out = X.path24(y, clip=2.0) if phone else (y.mean(1) if y.ndim == 2 else y)
    res = {'song': meta.get('id'), 'client': a.client, 'voices': voices, 'level_db': level, 'seconds': round(len(out) / X.SR, 2),
           'calls_per_tick': json.load(open(lg + '.info')).get('calls_per_tick'), 'status': '推測（エミュレーター）'}
    if a.wav:
        import wave
        pcm = (np.clip(out / max(1e-9, np.max(np.abs(out))) * 0.9, -1, 1) * 32767).astype('<i2')     # (normalised: the -32.5 dB path is quiet)
        with wave.open(a.wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(X.SR); w.writeframes(pcm.tobytes())
        res['wav'] = a.wav
    o = X.C.load(a.corpus, X.SR) if a.corpus else MT.load(a.original) if a.original else None
    if o is not None:
        r = MT.report(o, out)
        res['vs_original'] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items() if not isinstance(v, (list, dict))}
    print(json.dumps(res, ensure_ascii=False))
    if a.json: json.dump(res, open(a.json, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
