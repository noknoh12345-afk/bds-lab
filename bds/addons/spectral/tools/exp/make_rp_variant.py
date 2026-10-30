"""an experimental RP: a copy of rp/ with other burst (and noise) sounds. Same names, same levels convention:
bursts' first 10 ms at BURST_PEAK_RMS (0.30), noise loops at NOISE_RMS RMS. The emulator reads them like the real RP."""
import sys, os, shutil, subprocess, tempfile, json
import numpy as np
from scipy.io import wavfile
U=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, U+'/tools')
import spectral as S
SR=48000
def shaped_noise(lo, hi, n, seed, tilt_db_oct=0.0):
    rng=np.random.default_rng(seed); f=np.fft.rfftfreq(n,1/SR)
    edge=np.ones_like(f)
    for c,d in ((lo,-1),(hi,1)):
        oc=np.log2(np.maximum(f,1)/c)*d
        edge*=np.where(oc<-1/12,1.0,np.where(oc>1/12,0.0,0.5+0.5*np.cos(np.pi*(oc+1/12)*6)))
    tilt=(np.maximum(f,1)/np.sqrt(lo*hi))**(tilt_db_oct/6.0206)   # amplitude: tilt dB per octave
    spec=edge*tilt*np.exp(1j*rng.uniform(0,2*np.pi,len(f))); spec[0]=0
    y=np.fft.irfft(spec,n); return y/np.sqrt(np.mean(y*y))
def burst(b, bands, tilt, decay):
    lo,hi=bands[b]; n=int(SR*S.BURST_LEN); t=np.arange(n)/SR
    y=shaped_noise(lo,hi,n,1+b,tilt)*np.exp(-t*decay[b])*np.clip(t/0.0015,0,1)
    r=np.sqrt(np.mean(y[:int(0.01*SR)]**2)); y=y/r*S.BURST_PEAK_RMS
    return y*min(1.0,0.95/np.max(np.abs(y)))
def ogg(path, y):
    with tempfile.NamedTemporaryFile(suffix='.wav',delete=False) as t:
        wavfile.write(t.name, SR, (y*32767).astype(np.int16))
    subprocess.run(['ffmpeg','-y','-v','error','-i',t.name,'-c:a','libvorbis','-q:a','8',path],check=True); os.unlink(t.name)
if __name__=='__main__':
    out=sys.argv[1]; cfg=json.loads(sys.argv[2])
    shutil.rmtree(out, ignore_errors=True); shutil.copytree(U+'/rp', out)
    bands=cfg.get('bands', [list(b) for b in S.BURST_BANDS]); tilt=cfg.get('tilt',0.0); decay=cfg.get('decay',[22.0,45.0,75.0])
    rms=[]
    for b in range(len(bands)):
        y=burst(b,bands,tilt,decay); rms.append(float(np.sqrt(np.mean(y[:int(0.01*SR)]**2))))
        for s in range(S.SUB):
            lead=np.zeros(int(round(s*SR/S.FPS/S.SUB)))
            ogg(f'{out}/sounds/spectral/b{b}_{s}.ogg', np.concatenate([lead,y]))
    print(out, 'burst rms', rms)
