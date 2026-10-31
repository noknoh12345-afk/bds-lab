"""a song.json made elsewhere (the live encoder: tools/live/encoder.mjs --song; a converter page's song) through the same chain as
run_exp.py: the add-on bundle in the mock as the phone plays it (24 voices, no drum bursts, +6 dB) → tools/emu with spec.json →
the measured client path (clip 2.0) → ViSQOL against the corpus original. Emulated, not a recording.
  cd tools/exp && python3 score_pack.py <song id of the original> <song.json> [name] [out.jsonl]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exp import *

if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    sid, sp = sys.argv[1], os.path.abspath(sys.argv[2])
    name = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(sp)
    play = {'mode': 'quality', 'voices': int(json.load(open(sp))['meta']['voices']), 'bundle': W + '/bundles/real.js', 'cmds': ['spectral:drums off', 'spectral:level 6']}
    lg = song_log(sp, play)
    y = render(lg, {'oneshot_latency_ms': -45})
    o = C.load(sid, SR)
    v = MT.visqol_score(o, path24(y, clip=2.0))
    r = {'song': sid, 'var': name, 'v': round(v, 4), 'cpt': json.load(open(lg + '.info'))['calls_per_tick']['mean'], 'voices': play['voices']}
    print(json.dumps(r))
    if len(sys.argv) > 4:
        with open(sys.argv[4], 'a') as fh: fh.write(json.dumps(r) + '\n')
