"""an experimental noise layout: RP with loops n0..n{M-1} for the edges, and a src copy whose assets.ts lists them"""
import sys, os, shutil, json, subprocess
import numpy as np
from make_rp_variant import ogg, SR
U=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, U+'/tools'); import spectral as S
name=sys.argv[1]; edges=json.loads(sys.argv[2]); base_rp=sys.argv[3] if len(sys.argv)>3 else U+'/rp'
W=os.environ.get('SPECTRAL_EXP', os.path.join(U, 'corpus', 'renders', 'exp'))
rp=f'{W}/rp_{name}'; shutil.rmtree(rp, ignore_errors=True); shutil.copytree(base_rp, rp)
defs=json.load(open(f'{rp}/sounds/sound_definitions.json'))
rms=[]
for b in range(len(edges)-1):
    y=S.band_noise(edges[b],edges[b+1],SR,2.0,100+b); y=y*min(1.0,0.95/np.max(np.abs(y)))
    ogg(f'{rp}/sounds/spectral/n{b}.ogg', y)
    raw=subprocess.run(['ffmpeg','-v','error','-i',f'{rp}/sounds/spectral/n{b}.ogg','-f','f32le','-'],check=True,capture_output=True).stdout
    d=np.frombuffer(raw,np.float32); rms.append(float(np.sqrt(np.mean(d.astype(np.float64)**2))))
    defs['sound_definitions'][f'spectral.n{b}']={'category':'ui','sounds':[{'name':f'sounds/spectral/n{b}','is3D':False,'volume':1.0}]}
json.dump(defs, open(f'{rp}/sounds/sound_definitions.json','w'), indent=1)
src=f'{W}/src_{name}'; shutil.rmtree(src, ignore_errors=True); shutil.copytree(os.environ.get('SRCBASE', os.path.join(U, 'src')), src)
a=open(f'{src}/assets.ts').read()
import re
a=re.sub(r'export const NOISE_RMS = \[.*?\];', 'export const NOISE_RMS = '+json.dumps([round(x,6) for x in rms])+';', a)
a=re.sub(r'export const NOISE_BANDS = \[.*?\];', 'export const NOISE_BANDS = '+json.dumps([[edges[i],edges[i+1]] for i in range(len(edges)-1)])+';', a)
open(f'{src}/assets.ts','w').write(a)
print(rp, src, [round(x,4) for x in rms])
