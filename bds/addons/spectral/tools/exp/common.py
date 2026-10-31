"""shared helpers of the experiments (tools/exp): paths, loading, alignment, linear resampling, 16-bit grid"""
import sys, os, json, math, subprocess
import numpy as np
U=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # the unit (bds/addons/spectral)
sys.path[:0]=[U+'/tools', U+'/tools/metrics', U+'/tools/rig', U+'/tools/emu']
import corpus as C, metrics as MT, score_song as SS
from scipy.signal import butter, sosfiltfilt, resample_poly
# real recordings (<prefix>_<song>.opus: tools/rig/fetch_rec.py <run> from the run's artifact; older runs: the handoff zip): SPECTRAL_REC
S=os.environ.get('SPECTRAL_REC', os.path.join(U, 'corpus', 'renders', 'rec'))
SR=48000
SONGS=[s['id'] for s in C.manifest()['songs']]
def load_st(p):
    raw=subprocess.run(['ffmpeg','-v','error','-i',p,'-f','f32le','-ac','2','-ar','48000','-'],check=True,capture_output=True).stdout
    return np.frombuffer(raw,np.float32).astype(np.float64).reshape(-1,2)
lp=butter(8,2000,'low',fs=SR,output='sos')
def lag_of(x,y):
    n=min(len(x),len(y)); X=np.fft.rfft(x[:n],2*n); Y=np.fft.rfft(y[:n],2*n); c=np.fft.irfft(X*np.conj(Y)); i=np.argmax(c); return i if i<n else i-2*n
def aligned(sid, pre='c', rec=None, stereo=False):
    o=C.load(sid,SR,stereo=True)
    if rec is None: rec=load_st(f'{S}/{pre}_{sid}.opus')
    om=o.mean(1)
    k=int(0.01*SR); e=np.sqrt((rec.mean(1)[:len(rec)//k*k].reshape(-1,k)**2).mean(1)+1e-20); on=np.nonzero(20*np.log10(e/e.max())>-50)[0]; a=on[0]*k
    seg=rec[a:a+len(o)+SR]
    L=lag_of(sosfiltfilt(lp,seg.mean(1)), sosfiltfilt(lp,om))
    if L>=0: seg2=seg[L:L+len(o)]; o2=o[:len(seg2)]
    else: o2=o[-L:]; seg2=seg[:len(o2)]
    n=min(len(o2),len(seg2))
    return (o2[:n], seg2[:n]) if stereo else (o2[:n].mean(1), seg2[:n].mean(1))
def lin_resample(x, sr_in, sr_out):
    n=int(len(x)*sr_out/sr_in); pos=np.arange(n)*(sr_in/sr_out); i0=np.floor(pos).astype(np.int64); fr=pos-i0
    i0=np.minimum(i0,len(x)-1); i1=np.minimum(i0+1,len(x)-1)
    if x.ndim==2: fr=fr[:,None]
    return x[i0]+(x[i1]-x[i0])*fr
def q16(x): return np.round(np.clip(x,-1,32767/32768)*32768)/32768
def cubic_resample(x, sr_in, sr_out):
    """Catmull-Rom (FMOD 'cubic'-like) interpolation, no anti-alias filter"""
    n=int(len(x)*sr_out/sr_in); pos=np.arange(n)*(sr_in/sr_out); i=np.floor(pos).astype(np.int64); t=pos-i
    L=len(x); g=lambda k: x[np.clip(k,0,L-1)]
    p0,p1,p2,p3=g(i-1),g(i),g(i+1),g(i+2)
    return p1 + 0.5*t*(p2-p0 + t*(2*p0-5*p1+4*p2-p3 + t*(3*(p1-p2)+p3-p0)))
