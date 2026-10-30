"""run experiment variants through the validated client model: emulator (spec) + path24 -> ViSQOL against the original.
  python3 run_exp.py out.jsonl '<variant json>' ...      (ONLY=a,b: those songs)
variant: {"name":..., "conv":{...}, "play":{"mode":..,"voices":N or "auto","bundle":..,"cmds":[..]}, "spec":{...}, "rp":path,
          "path":{"gain_db":-20.5} (the client path's level: -32.5 dB measured; -20.5 = played 12 dB louder),
          "orig":true (the original itself through that path: the ceiling under the same path), "aux":true}
play.voices "auto": the sounds the client plays at once ("sounds", 32) minus the noise bands the song uses"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exp import *
def _pack(a):
    s, c = a
    song_pack(s, json.loads(c) or None)
    return s
def job(a):
    sid, var = a
    o = C.load(sid, SR)
    pth = var.get('path', {})
    if var.get('orig'):
        y = o
    else:
        sp = song_pack(sid, var.get('conv'))
        play = dict(var.get('play', {}))
        if 'bundle' in play and not play['bundle'].startswith('/'): play['bundle'] = W + '/bundles/' + play['bundle'] + '.js'
        if play.get('voices') == 'auto':      # the sounds the client plays at once minus the noise bands this song uses
            used = str(json.load(open(sp)).get('stats', {}).get('noise_bands', '1' * 8)).count('1')
            play['voices'] = int(var.get('sounds', 32)) - used
        rp = var.get('rp')
        if rp and not rp.startswith('/'): rp = os.path.join(W, rp)
        lg = song_log(sp, play); y = render(lg, var.get('spec', {}), rp)
    rec = path24(y, **pth)
    out = {'song': sid, 'var': var['name'], 'v': round(MT.visqol_score(o, rec), 4)}
    if var.get('aux'):
        r = MT.report(o, rec, do_visqol=False); out.update({k: r[k] for k in ('third_oct_db', 'onset_recall')})
    if not var.get('orig'):
        out['cpt'] = json.load(open(lg + '.info'))['calls_per_tick']['mean']; out['voices'] = play.get('voices')
    return out
if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    from multiprocessing import Pool
    out = sys.argv[1]; vars_ = [json.loads(v) for v in sys.argv[2:]]
    only = os.environ.get('ONLY'); songs = [s for s in SONGS if not only or s in only.split(',')]
    convs = []
    for v in vars_:
        if v.get('orig'): continue
        c = json.dumps(v.get('conv') or {}, sort_keys=True)
        for s in songs:
            if (s, c) not in convs: convs.append((s, c))
    with Pool(2) as pool:
        list(pool.imap_unordered(_pack, convs))
    tasks = [(s, v) for v in vars_ for s in songs]
    with Pool(2) as pool, open(out, 'a') as fh:
        for r in pool.imap_unordered(job, tasks):
            fh.write(json.dumps(r) + '\n'); fh.flush(); print(json.dumps(r), flush=True)
