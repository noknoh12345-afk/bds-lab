# usage (from the unit folder): python3 tools/exp/ana/vcv2.py . <tag> [key=value ...]
# VCV units (vcv_proto.py) with what the game can do with a baked file: loudness made even, the pitch made flat
# (WORLD, baked into the file), the accent by playback pitch (resampling, as setPitch), the mora length.
# Prints Whisper small CER over the 20 sentences of speech_eval.py.
# keys: mora=150 norm=0|1 flat=0|<Hz>|med acc=0|<semitones> xf=40 (crossfade ms) tail=0 (ms kept after the next start) speed=1.0
import sys, os, json, pickle, numpy as np, soundfile as sf
U = sys.argv[1]; sys.path[:0] = [os.path.join(U, 'tools'), os.path.join(U, 'tools', 'samples'), os.path.dirname(__file__)]
import speech as S
TAG = sys.argv[2]; O = dict(mora='150', norm='0', flat='0', acc='0', xf='40', speed='1.0', lead='0')
O.update(x.split('=', 1) for x in sys.argv[3:])
MORA, NORM, XF, SPEED, LEAD = float(O['mora']), O['norm'] == '1', float(O['xf']), float(O['speed']), float(O['lead'])
SAME = O.get('same', '0') == '1'; TRIM = float(O.get('trim', '0')); MATCH = O.get('match', '0') == '1'; VOW = {'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o'}
ACC = float(O['acc']); FLAT = O['flat']; MODE = O.get('mode', 'const')
SENT = ['こんにちは 私はマインクラフトの中で話しています', 'サーバーにログインしました', 'ダイヤモンドを見つけました',
        'エンダードラゴンを倒しました', 'ネザーポータルに入ります', 'クリーパーが近くにいます',
        'ゾンビが村を襲っています', 'みんなでベッドで寝ましょう', 'チェストの中にパンがあります', '今日はいい天気ですね',
        'ピアノの曲を流します', 'スケルトンの矢に気をつけて', 'レッドストーンで扉を開けます', 'ボートで川を下りましょう',
        'ありがとうございます', 'ちょっと待ってください', 'エンチャントテーブルを作りました', '夜になったら家に帰ろう',
        'スティーブはどこにいますか', 'ブランチマイニングをしよう']
SR = 24000
SET = O.get('set', '0')
CACHE = f'/tmp/vcv_units_{SPEED}.pkl' if SET == '0' else f'/tmp/vcv_units_{SPEED}_s{SET}.pkl'
if SET != '0':
    import torch; torch.manual_seed(int(SET))
raw = pickle.load(open(CACHE, 'rb')) if os.path.exists(CACHE) else {}
def unit_raw(pv, kana):
    key = (pv, kana)
    if key not in raw:
        import vcv_proto as P
        if SPEED != 1.0:
            import voice as V; k0 = V.kokoro
            P.V.kokoro = lambda t, n, s: k0(t, n, SPEED)
        seg, sr, pre = P.unit(pv, kana); raw[key] = (seg.astype(np.float32), pre)
    return raw[key]
def save_raw(): pickle.dump(raw, open(CACHE, 'wb'))

def voiced_rms(y):
    fr = 240; n = len(y) // fr
    e = np.array([np.sqrt((y[i * fr:(i + 1) * fr] ** 2).mean()) for i in range(n)]) if n else np.array([1e-6])
    top = np.sort(e)[-max(1, n // 3):]
    return float(top.mean()) + 1e-9

_f0med = None
def flat(y, f0t):
    import pyworld as pw
    x = y.astype(np.float64)
    f0, t = pw.harvest(x, SR, f0_floor=80, f0_ceil=600, frame_period=5)
    sp = pw.cheaptrick(x, f0, t, SR); ap = pw.d4c(x, f0, t, SR)
    v = f0 > 0
    if MODE == 'keep': f1 = f0
    elif MODE == 'scale': f1 = np.where(v, f0 * (f0t / (np.median(f0[v]) if v.any() else f0t)), 0.0)
    else: f1 = np.where(v, f0t, 0.0)
    out = pw.synthesize(f1, sp, ap, SR, frame_period=5)[:len(y)]
    if len(out) < len(y): out = np.pad(out, (0, len(y) - len(out)))
    return out.astype(np.float32)

proc = {}
def unit(pv, kana):
    key = (pv, kana)
    if key in proc: return proc[key]
    seg, pre = unit_raw(pv, kana); seg = seg.astype(np.float64).copy()
    if FLAT not in ('0',):
        seg = flat(seg, f0_target())
    if NORM: seg *= 0.1 / voiced_rms(seg)
    nf = int(0.004 * SR); seg[:nf] *= np.linspace(0, 1, nf)
    proc[key] = (seg, pre); return proc[key]

def f0_target():
    global _f0med
    if FLAT not in ('med',): return float(FLAT)
    if _f0med is None:
        import pyworld as pw
        allf = []
        for seg, pre in list(raw.values())[:60]:
            f0, _ = pw.harvest(seg.astype(np.float64), SR, f0_floor=80, f0_ceil=600, frame_period=5); allf += list(f0[f0 > 0])
        _f0med = float(np.median(allf)); print('f0 median', round(_f0med, 1), flush=True)
    return _f0med

def high(m):
    # Tokyo accent: the first mora of a phrase is low unless the accent is on it; high up to the accent nucleus, low after
    acc, pos = m['acc'], m['pos']
    if acc == 1: return pos == 1
    if pos == 1: return False
    return acc == 0 or pos <= acc

def shift(seg, st):
    if st == 0: return seg
    r = 2 ** (st / 12)                                  # played faster = higher and shorter, as setPitch
    n = int(len(seg) / r); x = np.arange(n) * r
    return np.interp(x, np.arange(len(seg)), seg)

def say(text):
    ms = S.morae(text)
    y = np.zeros(int(SR * (len(ms) * MORA / 1000 + 4))); t = 0.4; pv = None; prev_end = None
    for m in ms:
        if m['kana'] == 'ッ': t += MORA / 1000 * 0.9; pv = None; continue
        kana = m['kana']; v = m.get('v') or ('N' if kana == 'ン' else None)
        if SAME and pv is not None and kana in VOW and VOW[kana] == pv and prev_end is not None:
            # the same vowel again (a long vowel): the unit before keeps sounding (its long tail), no new unit
            t += MORA / 1000 + m['pause'] / 1000
            if m['pause']: pv = None
            continue
        seg, pre = unit(pv, kana)
        st = 0.0
        if ACC: st = ACC / 2 if high(m) else -ACC / 2
        r = 2 ** (st / 12); seg = shift(seg, st); pre = pre / r
        if TRIM and pv is not None:
            k = min(int(TRIM / 1000 * SR), int(max(0.0, pre - 0.03) * SR)); seg = seg[k:].copy(); pre -= k / SR
            nf = int(0.004 * SR); seg[:nf] *= np.linspace(0, 1, nf)
        s0 = int((t - pre - LEAD / 1000) * SR); s0 = max(s0, 0); L = len(seg)
        if prev_end is not None and s0 < prev_end:
            ov = min(prev_end - s0, int(XF / 1000 * SR))
            ramp = np.linspace(0, 1, ov) if ov > 0 else np.zeros(0)
            if MATCH and ov > 48 and s0 + ov <= len(y):
                a_ = np.sqrt((y[s0:s0 + ov] ** 2).mean()) + 1e-9; b_ = np.sqrt((seg[:ov] ** 2).mean()) + 1e-9
                g = np.clip(a_ / b_, 0.25, 4.0); pv_n = max(ov + 1, int(pre * SR))
                env = np.ones(L); env[:pv_n] = np.linspace(g, 1.0, pv_n); seg = seg * env
            y[s0:s0 + ov] = y[s0:s0 + ov] * (1 - ramp) + seg[:ov] * ramp
            y[s0 + ov:prev_end] = 0
            y[s0 + ov:s0 + L] += seg[ov:]
        else:
            y[s0:s0 + L] += seg
        prev_end = s0 + L
        t += MORA / 1000 * (0.7 if m['dev'] else 1.0) + m['pause'] / 1000
        pv = None if m['pause'] else (v if v else pv)
    return y[:int((t + 0.3) * SR)]

if __name__ == '__main__':
    import whisper
    for s in SENT:
        for m in S.morae(s): pass
    mo = whisper.load_model('small'); tot = 0; rows = []
    for k, s in enumerate(SENT):
        y = say(s); f = f'/tmp/vcv2_{TAG}_{k}.wav'; sf.write(f, y / (np.abs(y).max() + 1e-9) * 0.8, SR)
        got = mo.transcribe(f, language='ja', temperature=0, fp16=False)['text']; c = S.cer(S.reading(s), S.reading(got)); tot += c
        rows.append([round(c, 3), got])
    save_raw()
    cer = round(tot / len(SENT), 3)
    print(TAG, O, cer, flush=True)
    with open(os.path.join(U, 'tools/exp/results/vcv2.jsonl'), 'a') as fo:
        fo.write(json.dumps({'tag': TAG, 'opts': O, 'cer': cer, 'rows': rows}, ensure_ascii=False) + '\n')
