"""experiment harness: converter variant -> song pack -> the add-on bundle in the mock -> tools/emu render -> the measured client
path (path24) -> ViSQOL against the original. Caches in corpus/renders/exp/cache (SPECTRAL_EXP)."""
import sys, os, json, math, subprocess, hashlib, base64, time
import numpy as np
from common import *
import spectral as SP
import client as E
W=os.environ.get('SPECTRAL_EXP', os.path.join(U, 'corpus', 'renders', 'exp'))   # work dir (gitignored): cache/, bundles/, rp_*/
CACHE=W+'/cache'; os.makedirs(CACHE, exist_ok=True)
def h(obj): return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:10]
def song_pack(sid, conv=None):
    conv = conv or {}
    key=h({'sid':sid,'conv':conv,'code':hashlib.sha256(open(U+'/tools/spectral.py','rb').read()).hexdigest()[:10]})
    p=f'{CACHE}/{sid}.{key}.song.json'
    if not os.path.exists(p):
        x, meta, blob, stats = SP.convert(C.excerpt_path(sid), conv.get('voices',48), title=sid, artist='corpus', **{k:v for k,v in conv.items() if k!='voices'})
        meta['id']=sid
        json.dump({'meta':meta,'data':base64.b64encode(blob).decode(),'stats':{k:(float(v) if isinstance(v,(np.floating,np.integer)) else v) for k,v in stats.items()}}, open(p,'w'))
    return p
def song_log(sp, play):
    """play: {'mode':'quality'|'light','voices':N,'bundle':path}"""
    key=h({'sp':os.path.basename(sp),'play':{k:v for k,v in play.items() if k!='bundle'},'bundle':hashlib.sha256(open(play.get('bundle',U+'/bp/scripts/main.js'),'rb').read()).hexdigest()[:10]})
    p=f'{CACHE}/{key}.log.json'
    if not os.path.exists(p):
        cmd=['node', U+'/tools/sim/run_song.mjs', sp, play.get('mode','quality'), '--out', p]
        if play.get('voices'): cmd+=['--voices', str(play['voices'])]
        if play.get('bundle'): cmd+=['--bundle', play['bundle']]
        for c in play.get('cmds', []): cmd+=['--cmd', c]
        if play.get('play'): cmd+=['--play', play['play']]          # (another way in, e.g. 'spectral:live_demo {id} phones')
        r=subprocess.run(cmd, cwd=U, capture_output=True, text=True, timeout=1200)
        if r.returncode: raise RuntimeError(r.stderr[-500:])
        json.dump(json.loads(r.stdout.strip().split('\n')[-1]), open(p+'.info','w'))
    return p
_assets={}
def render(logp, spec_over=None, rp=None, seed=0):
    spec,_=E.load_spec(**(spec_over or {}))
    rp=rp or U+'/rp'
    key=h({'log':os.path.basename(logp),'spec':spec,'rp':os.path.relpath(rp, U),'seed':seed,'emu':hashlib.sha256(open(U+'/tools/emu/client.py','rb').read()).hexdigest()[:10]})
    p=f'{CACHE}/{key}.render.npy'
    if not os.path.exists(p):
        log=json.load(open(logp))
        if rp not in _assets: _assets[rp]=E.Assets(rp)
        y=E.render(log, spec, _assets[rp], seed=seed)
        start=min(e[1] for e in log if e[0] in ('fade','vol'))
        np.save(p, y[start*2400:].astype(np.float32))
    return np.load(p).astype(np.float64)
def path24(y, gain_db=-32.5, q=True, clip=None, pre_db=0.0):
    """the measured client path (redroid run 41076646541): the game mixes at 24 kHz (each voice read linearly: no
    anti-aliasing, content above 12 kHz folds to 24 kHz - f), -32.5 dB, 16 bit, then x2 linear interpolation to 48 kHz.
    clip: the mix clipped at that many file units first (run 41147544874's calib loud: a sine of 0.91 at setVolume 4 and 8
    fits a hard clip at 2.0 exactly; the 16-sine mixer calib fits 1.6-1.8); pre_db: the mix played that much louder first
    (the original at setVolume 2: +6.02)"""
    m = y.mean(1) if y.ndim==2 else y
    m = m[::2]*10**(pre_db/20)
    if clip: m = np.clip(m, -clip, clip)
    m = m*10**(gain_db/20)
    if q: m=q16(m)
    m = lin_resample(m, 24000, 48000)
    return q16(m) if q else m
def path_model(y, gain_db=-32.5, cap='linear', q=True, game_sr=44100):
    """the recording path: the game's mix at 44.1 kHz (the emulator renders at 48 kHz: resample with a good filter),
    -32.5 dB, 16 bit, then the capture's linear interpolation to 48 kHz and 16 bit again"""
    m = y.mean(1) if y.ndim==2 else y
    if game_sr==44100: m=resample_poly(m,147,160)
    m=m*10**(gain_db/20)
    if q: m=q16(m)
    if game_sr==44100: m = lin_resample(m,44100,48000) if cap=='linear' else resample_poly(m,160,147)
    if q: m=q16(m)
    return m
def score(sid, y, quick=False):
    o=C.load(sid,SR)
    m = y.mean(1) if y.ndim==2 else y
    if quick:
        r=MT.report(o,m,do_visqol=False); return r
    return MT.report(o,m)
