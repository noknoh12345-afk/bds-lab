import sys, json, numpy as np
rows=[json.loads(l) for f in sys.argv[1:] for l in open(f) if l.strip()]
by={}
for r in rows: by.setdefault(r['var'],{})[r['song']]=r
base=sys.argv[1] if False else None
names=list(by)
songs=sorted({r['song'] for r in rows})
ref=names[0]
print('var'.ljust(22), 'n', 'median', 'mean', ' vs '+ref+': med diff, wins')
for n in names:
    v=[by[n][s]['v'] for s in songs if s in by[n]]
    common=[s for s in songs if s in by[n] and s in by[ref]]
    d=[by[n][s]['v']-by[ref][s]['v'] for s in common]
    print(n.ljust(22), len(v), f'{np.median(v):.3f}', f'{np.mean(v):.3f}', f'{np.median(d):+.3f}' if d else '', sum(x>0 for x in d), '/', len(d))
print()
print('song'.ljust(22), ' '.join(n[:9].rjust(9) for n in names))
for s in songs:
    print(s[:22].ljust(22), ' '.join((f"{by[n][s]['v']:9.3f}" if s in by[n] else '        .') for n in names))
