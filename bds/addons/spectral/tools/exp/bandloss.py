"""per-band NSIM (ViSQOL's fvnsim) of the ceiling path vs the add-on (emulator + path), to see where the add-on loses"""
import sys
from exp import *
import visqol as V
def fv(o, y):
    t = MT.level_match(o, y); g = min(1.0, 0.999 / max(1e-9, np.max(np.abs(o)), np.max(np.abs(t))))
    r = V.visqol(V.to_int16_grid(o*g), V.to_int16_grid(t*g), 48000, return_details=True)
    return r.moslqo, np.array(r.fvnsim), np.array(r.cf)
sid=sys.argv[1]; bundle=sys.argv[2] if len(sys.argv)>2 else 'base'
o=C.load(sid,SR)
m1,f1,cf=fv(o, path24(o))
sp=song_pack(sid); lg=song_log(sp,{'mode':'quality','voices':24,'bundle':W+'/bundles/'+bundle+'.js'}); y=render(lg,{'oneshot_latency_ms':-45})
m2,f2,_=fv(o, path24(y))
print(sid, 'ceiling-path %.2f  addon %.2f'%(m1,m2))
order=np.argsort(cf)
print(' cf(Hz) ', ' '.join(f'{cf[i]:6.0f}' for i in order))
print(' ceil   ', ' '.join(f'{f1[i]:6.3f}' for i in order))
print(' addon  ', ' '.join(f'{f2[i]:6.3f}' for i in order))
print(' loss   ', ' '.join(f'{f1[i]-f2[i]:6.3f}' for i in order))
