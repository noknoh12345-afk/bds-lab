# q92: speech-only recording fitted into each recording with the song (200 ms windows), speech strength and S/N while speech plays,
# and ViSQOL / mrstft against the speech-only recording
import sys, json, os, subprocess, numpy as np
sys.path.insert(0, sys.argv[1] + '/tools/metrics'); import metrics as M
D = sys.argv[2]; SR = 48000
def best_lag(a, b):   # lag of b against a by envelope correlation (10 ms)
    h = 480; ea = np.sqrt(np.convolve(a*a, np.ones(h)/h, 'same')[::h]); eb = np.sqrt(np.convolve(b*b, np.ones(h)/h, 'same')[::h])
    n = 1 << int(np.ceil(np.log2(len(ea)+len(eb)))); c = np.fft.irfft(np.fft.rfft(ea-ea.mean(), n)*np.conj(np.fft.rfft(eb-eb.mean(), n)), n)
    k = int(np.argmax(c)); k = k if k < n//2 else k-n
    # refine at sample level within +-10 ms
    best, bl = -1, 0
    for l in range(k*h-480, k*h+481, 12):
        x = a[max(0,l):]; y = b[max(0,-l):]; m = min(len(x), len(y), SR*6)
        v = np.dot(x[:m], y[:m]) / (np.linalg.norm(x[:m])*np.linalg.norm(y[:m]) + 1e-12)
        if v > best: best, bl = v, l
    return bl
out = {}
for sent in ['hello', 'weather', 'piano']:
    ref = M.load(f'{D}/dknone_{sent}.opus')
    for arm in ['0', '6', '12']:
        mix = M.load(f'{D}/dk{arm}_{sent}.opus')
        l = best_lag(mix, ref)
        s = np.zeros_like(mix); 
        if l >= 0: s[l:l+len(ref)] = ref[:len(mix)-l]
        else: s[:len(ref)+l] = ref[-l:][:len(mix)]
        W = SR//5; a_s, sn = [], []
        thr = 0.1 * np.sqrt(np.mean(ref**2))
        for i in range(0, len(mix)-W, W):
            x, y = s[i:i+W], mix[i:i+W]
            if np.sqrt(np.mean(x*x)) < thr: continue
            a = np.dot(x, y) / np.dot(x, x); r = y - a*x
            a_s.append(a); sn.append(10*np.log10(np.dot(a*x, a*x)/(np.dot(r, r)+1e-12)))
        seg = mix[max(0,l):max(0,l)+len(ref)]
        try: m = json.loads(subprocess.run([sys.executable, sys.argv[1]+'/tools/metrics/metrics.py', f'{D}/dknone_{sent}.opus', f'{D}/dk{arm}_{sent}.opus'], capture_output=True, text=True, timeout=900).stdout.strip().splitlines()[-1])
        except Exception as e: m = {'err': str(e)}
        out[f'{arm}_{sent}'] = {'speech_strength_median': round(float(np.median(a_s)), 3), 'sn_db_median': round(float(np.median(sn)), 2), 'windows': len(sn),
                                'visqol': m.get('visqol'), 'mrstft': m.get('mrstft'), 'lag_ms': round(l/48, 1)}
        print(arm, sent, out[f'{arm}_{sent}'], flush=True)
json.dump(out, open('/home/claude/ana/q92.json', 'w'), indent=1)
