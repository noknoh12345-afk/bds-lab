import json, numpy as np, sys
rows=[]
for l in open(sys.argv[1] if len(sys.argv)>1 else 'val1.jsonl'):
    try: rows.append(json.loads(l))
    except Exception: pass
by={}
for r in rows: by.setdefault((r['cfg'], r['spec']),{})[r['song']]=r
for k,v in sorted(by.items()):
    a=np.array([(r['v_path'], r['real']) for r in v.values() if r['real'] is not None])
    if len(a)>2:
        print(k, len(a), 'emu med %.2f real med %.2f  MAE %.2f  bias %+.2f corr %.2f'%(np.median(a[:,0]), np.median(a[:,1]), np.mean(np.abs(a[:,0]-a[:,1])), np.mean(a[:,0]-a[:,1]), np.corrcoef(a[:,0],a[:,1])[0,1]))
songs=sorted({r['song'] for r in rows})
keys=sorted(by)
print('song'.ljust(20), ' '.join(f'{c}:{("V" if "volume" in s else "E")}'.rjust(11) for c,s in keys))
for s in songs:
    print(s[:20].ljust(20), ' '.join((f"{by[k][s]['v_path']:.2f}/{by[k][s]['real']:.2f}" if s in by[k] and by[k][s]['real'] is not None else '          .').rjust(11) for k in keys))
