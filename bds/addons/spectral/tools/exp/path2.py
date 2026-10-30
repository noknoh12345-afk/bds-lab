import sys, json
from common import *
def lin_down(x, sr_in, sr_out):
    """linear interpolation resampling with no anti-alias filter (FMOD/AudioFlinger 'linear')"""
    return lin_resample(x, sr_in, sr_out)
def P2(x, gain_db=-32.5, mix_sr=22050, q_mix=True, up='linear', cap='linear', down='linear'):
    y = lin_resample(x, 48000, mix_sr) if down=='linear' else cubic_resample(x, 48000, mix_sr) if down=='cubic' else resample_poly(x, 147, 320)          # the game mixes at mix_sr: its per-voice resampler reads the 48 kHz file linearly
    y = y*10**(gain_db/20)
    if q_mix: y=q16(y)
    if mix_sr == 24000:
        y = lin_resample(y, 24000, 48000)           # the x2 linear upsampling (images at 24 kHz - f)
    else:
        if mix_sr != 44100:
            y = lin_resample(y, mix_sr, 44100) if up=='linear' else resample_poly(y, 44100//mix_sr, 1)
        y = lin_resample(y, 44100, 48000) if cap=='linear' else resample_poly(y,160,147)
    return q16(y)
def job(a):
    sid, kw = a
    o=C.load(sid,SR)
    p=P2(o, **json.loads(kw))
    return {'song':sid,'kw':kw,'v':round(MT.visqol_score(o,p),4)}
if __name__=='__main__':
    import warnings; warnings.filterwarnings('ignore')
    from multiprocessing import Pool
    meas=json.load(open(U+'/measured/summary.json'))['songs']
    only=os.environ.get('ONLY'); tasks=[(s,k) for k in sys.argv[1:] for s in SONGS if not only or s in only.split(',')]
    with Pool(2) as pool:
        for r in pool.imap_unordered(job,tasks):
            r['real']=meas[r['song']]['ceiling']['visqol']; print(json.dumps(r),flush=True)
