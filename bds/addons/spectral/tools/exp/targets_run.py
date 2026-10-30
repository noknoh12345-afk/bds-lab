"""tools/exp/targets.py on the songs in ONLY: ViSQOL of path24(T(original)) for T in argv (ceiling, lp<kHz>, emph<kHz>)"""
import sys, os, json
EXP = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, EXP)
from exp import *
import targets as TG
def job(a):
    sid, kind = a
    o = C.load(sid, SR)
    return {'song': sid, 'var': 'T_' + kind, 'v': round(MT.visqol_score(o, path24(TG.T(o, kind))), 4)}
if __name__ == '__main__':
    import warnings; warnings.filterwarnings('ignore')
    from multiprocessing import Pool
    out = sys.argv[1]
    only = os.environ.get('ONLY'); songs = [s for s in SONGS if not only or s in only.split(',')]
    tasks = [(s, k) for k in sys.argv[2:] for s in songs]
    with Pool(2) as pool, open(out, 'a') as fh:
        for r in pool.imap_unordered(job, tasks):
            fh.write(json.dumps(r) + '\n'); fh.flush(); print(json.dumps(r), flush=True)
