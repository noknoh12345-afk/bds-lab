"""run experiment variants through the validated client model: emulator (spec) + path24 -> ViSQOL against the original.
  python3 run_exp.py out.jsonl '<variant json>' ...   variant: {"name":..., "conv":{...}, "play":{"mode":..,"voices":..,"bundle":..}, "spec":{...}, "rp":path}"""
import sys
from exp import *
def _pack(a):
    s, c = a
    song_pack(s, json.loads(c) or None)
    return s
def job(a):
    sid, var = a
    sp=song_pack(sid, var.get('conv'))
    play=dict(var.get('play',{}))
    if 'bundle' in play and not play['bundle'].startswith('/'): play['bundle']=W+'/bundles/'+play['bundle']+'.js'
    rp=var.get('rp')
    if rp and not rp.startswith('/'): var=dict(var, rp=os.path.join(W, rp))
    lg=song_log(sp, play); y=render(lg, var.get('spec',{}), var.get('rp'))
    o=C.load(sid,SR)
    out={'song':sid,'var':var['name']}
    rec=path24(y)
    out['v']=round(MT.visqol_score(o, rec),4)
    if var.get('aux'):
        r=MT.report(o, rec, do_visqol=False); out.update({k:r[k] for k in ('third_oct_db','onset_recall')})
    out['cpt']=json.load(open(lg+'.info'))['calls_per_tick']['mean']
    return out
if __name__=='__main__':
    import warnings; warnings.filterwarnings('ignore')
    from multiprocessing import Pool
    out=sys.argv[1]; vars_=[json.loads(v) for v in sys.argv[2:]]
    only=os.environ.get('ONLY'); songs=[s for s in SONGS if not only or s in only.split(',')]
    convs=[]
    for v in vars_:
        c=json.dumps(v.get('conv') or {}, sort_keys=True)
        for s in songs:
            if (s,c) not in convs: convs.append((s,c))
    with Pool(2) as pool:
        list(pool.imap_unordered(_pack, convs))
    tasks=[(s,v) for v in vars_ for s in songs]
    with Pool(2) as pool, open(out,'a') as fh:
        for r in pool.imap_unordered(job,tasks):
            fh.write(json.dumps(r)+'\n'); fh.flush(); print(json.dumps(r), flush=True)
