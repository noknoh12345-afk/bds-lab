"""what the add-on could reach at best through the measured path: the recording of a 24 kHz mix T (x2 linear up),
for several choices of T made from the original"""
import sys, json
from exp import *
from scipy.signal import firwin, filtfilt
def lp(x, fc, sr=48000, n=511):
    h=firwin(n, fc, fs=sr); return np.convolve(x, h, mode='same')
def emph(x, fmax=11500, maxdb=6.0, sr=48000, n=511):
    """pre-emphasis 1/cos^2(pi f/48k) (the x2 linear droop) up to maxdb, zero above fmax"""
    from scipy.signal import firwin2
    f=np.linspace(0, sr/2, 512); g=np.where(f<fmax, np.minimum(10**(maxdb/20), 1/np.maximum(np.cos(np.pi*f/48000)**2,1e-3)), 0.0)
    h=firwin2(n, f, g, fs=sr); return np.convolve(x, h, mode='same')
def T(o, kind):
    if kind=='ceiling': return o
    if kind.startswith('lp'): return lp(o, float(kind[2:])*1000)
    if kind.startswith('emph'): return emph(o, float(kind[4:])*1000)
def job(a):
    sid, kind = a
    o=C.load(sid,SR)
    return {'song':sid,'T':kind,'v':round(MT.visqol_score(o, path24(T(o,kind))),4)}
if __name__=='__main__':
    import warnings; warnings.filterwarnings('ignore')
    from multiprocessing import Pool
    tasks=[(s,k) for k in sys.argv[1:] for s in SONGS]
    with Pool(2) as pool:
        for r in pool.imap_unordered(job,tasks): print(json.dumps(r),flush=True)
