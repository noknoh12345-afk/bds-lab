# offline prototype: VCV units (Kokoro, "<prev vowel><mora>ー"), cut from the middle of the first vowel, joined at vowel middles
import sys, os, json, numpy as np, soundfile as sf
U = sys.argv[1]; sys.path[:0] = [os.path.join(U, 'tools'), os.path.join(U, 'tools', 'samples')]
import voice as V, speech as S, whisper
VK = {'a': 'ア', 'i': 'イ', 'u': 'ウ', 'e': 'エ', 'o': 'オ', 'N': 'ン'}
cache = {}
def frames(y, sr):
    fr = int(0.01 * sr); n = max(1, (len(y) - 2 * fr) // fr); win = np.hanning(2 * fr); f = np.fft.rfftfreq(2 * fr, 1 / sr)
    e = np.empty(n); c = np.empty(n)
    for i in range(n):
        w = y[i * fr:i * fr + 2 * fr]; e[i] = 10 * np.log10((w ** 2).mean() + 1e-12)
        Sx = np.abs(np.fft.rfft(w * win)); c[i] = (Sx * f).sum() / (Sx.sum() + 1e-12) + 1
    return fr, e, c
def unit(pv, kana):
    key = (pv, kana)
    if key in cache: return cache[key]
    tail = '' if kana == 'ン' else 'ー'
    if pv is None:
        y, sr, *_ = V.kokoro(kana + tail, 'jf_alpha', 1.0)
        a, tv, b = V.segment(y, sr, has_cons=kana not in ('ア', 'イ', 'ウ', 'エ', 'オ', 'ン'))
        seg = y[a:b].copy(); out = (seg, sr, (tv - a) / sr)
    else:
        y, sr, *_ = V.kokoro(VK[pv] + kana + tail, 'jf_alpha', 1.0)
        a, tv, b = V.segment(y, sr, has_cons=kana not in ('ア', 'イ', 'ウ', 'エ', 'オ', 'ン'))
        fr, e, c = frames(y, sr)
        snd = np.where(e > e.max() - 45)[0]; first = int(snd[0]) * fr
        if kana in ('ア', 'イ', 'ウ', 'エ', 'オ') or kana == 'ン':
            # (two vowels / vowel + n: the second starts where the centroid moves most, between 30 % and 70 % of the sound)
            i0, i1 = int(snd[0] + 0.25 * (snd[-1] - snd[0])), int(snd[0] + 0.7 * (snd[-1] - snd[0]))
            lc = np.log(c); d = np.abs(np.convolve(np.diff(lc), np.ones(3) / 3, 'same'))
            j = i0 + int(np.argmax(d[i0:i1])); tv = j * fr; a = tv
        mid = first + (a - first) // 2        # the middle of the vowel before the consonant
        seg = y[mid:b].copy(); out = (seg, sr, (tv - mid) / sr)
    nf = int(0.004 * out[1]); out[0][:nf] *= np.linspace(0, 1, nf)
    cache[key] = out; return out
def say(text, mora_ms=150.0):
    ms = S.morae(text)
    sr = 24000; y = np.zeros(int(sr * (len(ms) * mora_ms / 1000 + 4))); t = 0.4; pv = None; prev_end = None
    for m in ms:
        if m['kana'] == 'ッ': t += mora_ms / 1000 * 0.9; pv = None; continue
        kana = m['kana']; v = m.get('v') or ('N' if kana == 'ン' else None)
        seg, s2, pre = unit(pv, kana)
        st = int((t - pre) * sr)
        if st < 0: st = 0
        L = len(seg)
        if prev_end is not None and st < prev_end:
            # crossfade over the overlap (at most 40 ms), then the new unit replaces the old one's tail
            ov = min(prev_end - st, int(0.04 * sr))
            ramp = np.linspace(0, 1, ov) if ov > 0 else np.zeros(0)
            y[st:st + ov] = y[st:st + ov] * (1 - ramp) + seg[:ov] * ramp
            y[st + ov:prev_end] = 0
            y[st + ov:st + L] += seg[ov:]
        else:
            y[st:st + L] += seg
        dur = mora_ms / 1000 * (0.7 if m['dev'] else 1.0)
        # (the unit's long vowel is cut at the next unit's start; its end now)
        prev_end = st + L
        t += dur + m['pause'] / 1000
        pv = None if m['pause'] else (v if v else ('N' if kana == 'ン' else pv))
        # trim this unit at the next beat + 60 ms if nothing follows overlapping
    end = int((t + 0.3) * sr); y = y[:end]
    return y, sr
if __name__ == '__main__':
    sys.argv_ = sys.argv
    exec(open('tools/exp/ana/speech_eval.py').read().split('model =')[0].split('import speech as S, notes as N, whisper')[1])
    mo = whisper.load_model('small'); tot = 0; mora = float(os.environ.get('MORA', '150'))
    for k, s in enumerate(SENT):
        y, sr = say(s, mora); f = f'/tmp/speech_vcv_{k}.wav'; sf.write(f, y / (np.abs(y).max() + 1e-9) * 0.8, sr)
        got = mo.transcribe(f, language='ja', temperature=0)['text']; c = S.cer(S.reading(s), S.reading(got)); tot += c
        print(round(c, 3), got, flush=True)
    print('vcv', mora, round(tot / len(SENT), 3), 'units', len(cache))
