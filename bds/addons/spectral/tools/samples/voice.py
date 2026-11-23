#!/usr/bin/env python3
"""A voice for the sampler: the morae of Japanese (ア, カ, シャ, ン …) as units, each sung on one pitch, so that speech plays the
way MIDI does — a unit a note, its pitch by setPitch, its place to the millisecond by seekTo (src/notes.ts). Made from a speech
synthesiser whose license lets its output be used so: Kokoro-82M (Apache-2.0, hexgrad/Kokoro-82M) by default, or Open JTalk's
HTS voice Mei (CC BY 3.0, Nagoya Institute of Technology: MMDAgent) with --engine openjtalk.

Each unit is the mora with a long vowel ("カー") spoken slowly; it is cut from the consonant's start to the vowel's end — found in
the sound itself (segment(): where the frames stop being like the long vowel at its end), not from the synthesiser's predicted
durations: Kokoro starts every utterance with a short voiced onset of its own and its durations run about 0.1 s late against its
audio (measured: サー's /s/ at 0.48-0.56 s, predicted 0.575-0.725), so cut by them the units had lost their consonants (Whisper
read their speech 0.79-1.0 of the characters wrong), its pitch made level with the WORLD vocoder at the voice's own median and at LAYERS
semitones round it (setPitch then moves a unit at most 2 semitones, so its formants hardly move), loudness evened, and written
with the bank's LEAD of silence. `pre` is how long the consonant comes before the vowel: a mora is placed by its vowel (the beat
of a syllable is its vowel's onset).

  python3 tools/samples/voice.py [--engine kokoro|openjtalk] [--voice jf_alpha] [--id voice_ja] [--dry <dir>]
Writes rp/sounds/spectral/i/<id>/<k>.ogg, its entry in tools/samples/bank.json and (through tools/samples/bank.py) src/bank.ts."""
import argparse, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import bank as BK

SR = BK.SR
LAYERS = [-4, 0, 4]
ROWS = ['ア イ ウ エ オ', 'カ キ ク ケ コ', 'ガ ギ グ ゲ ゴ', 'サ シ ス セ ソ', 'ザ ジ ズ ゼ ゾ', 'タ チ ツ テ ト', 'ダ デ ド', 'ナ ニ ヌ ネ ノ',
        'ハ ヒ フ ヘ ホ', 'バ ビ ブ ベ ボ', 'パ ピ プ ペ ポ', 'マ ミ ム メ モ', 'ヤ ユ ヨ', 'ラ リ ル レ ロ', 'ワ ン',
        'キャ キュ キョ', 'ギャ ギュ ギョ', 'シャ シュ ショ', 'ジャ ジュ ジョ', 'チャ チュ チョ', 'ニャ ニュ ニョ', 'ヒャ ヒュ ヒョ',
        'ビャ ビュ ビョ', 'ピャ ピュ ピョ', 'ミャ ミュ ミョ', 'リャ リュ リョ', 'ティ ディ ファ フィ フェ フォ ウィ ウェ ウォ トゥ ドゥ']
UNITS = [u for row in ROWS for u in row.split()]


def kokoro(text, name, speed):
    import types
    stub = types.ModuleType('kokoro.pipeline'); stub.KPipeline = None
    sys.modules.setdefault('kokoro.pipeline', stub)
    import torch
    from kokoro.model import KModel
    from misaki import ja
    g = kokoro.__dict__
    if 'm' not in g:
        g['m'] = KModel().eval(); g['g2p'] = ja.JAG2P(); g['v'] = {}
    if name not in g['v']:
        from huggingface_hub import hf_hub_download
        g['v'][name] = torch.load(hf_hub_download('hexgrad/Kokoro-82M', f'voices/{name}.pt'), weights_only=True)
    r = g['g2p'](text); ps = r[0] if isinstance(r, tuple) else r
    with torch.no_grad():
        out = g['m'](ps, g['v'][name][len(ps) - 1], speed=speed, return_output=True)
    y = out.audio.numpy().astype(np.float64)
    d = out.pred_dur.numpy().astype(int)
    fr = len(y) / max(1, d.sum())                     # 600 samples (25 ms) a frame
    # tokens: [start] phonemes... [end]: the consonant(s) are the phonemes before the first vowel
    vowels = set('aiɯueoɨ')
    first_v = next((i for i, c in enumerate(ps) if c in vowels), 0)
    t_start = d[0] * fr
    t_vowel = (d[0] + d[1: 1 + first_v].sum()) * fr
    t_end = (d[: 1 + len(ps)].sum()) * fr
    return y, 24000, t_start, t_vowel, t_end


def openjtalk(text, name, speed):
    import pyopenjtalk
    x, sr = pyopenjtalk.tts(text, speed=speed)
    y = x.astype(np.float64) / 32768
    env = np.abs(y)
    on = int(np.argmax(env > env.max() * 0.02))
    loud = np.where(env > env.max() * 0.05)[0]
    end = int(loud[-1]) if len(loud) else len(y)
    # (no durations from Open JTalk here: the vowel starts where the voiced part does)
    import pyworld as pw
    f0, t = pw.harvest(y, sr, frame_period=5.0)
    voiced = np.where(f0 > 0)[0]
    vow = int(voiced[0] * 0.005 * sr) if len(voiced) else on
    return y, sr, on, max(on, vow), end


def segment(y, sr, has_cons):
    """(start, vowel onset, end) in samples, from the sound: 10 ms frames, their level and spectral centroid; the long vowel at the
    end sets what a vowel frame is like (within 8 dB of its level, its centroid within a factor 1.6); the vowel's onset is where,
    going back from it, frames stop being like it, and the consonant is the run of frames before that which are not (a closure's
    dip, a fricative's noise, a nasal's murmur) — what comes before (the synthesiser's own onset, vowel-like) is left out. A
    consonant the frames do not show (a glide) is taken as the 80 ms before the vowel"""
    fr = int(0.01 * sr)
    n = max(1, (len(y) - 2 * fr) // fr)
    win = np.hanning(2 * fr); freqs = np.fft.rfftfreq(2 * fr, 1 / sr)
    e = np.empty(n); cen = np.empty(n)
    for i in range(n):
        w = y[i * fr: i * fr + 2 * fr]
        e[i] = 10 * np.log10((w ** 2).mean() + 1e-12)
        S = np.abs(np.fft.rfft(w * win)); cen[i] = (S * freqs).sum() / (S.sum() + 1e-12) + 1.0
    sound = np.where(e > e.max() - 45)[0]
    first, last = int(sound[0]), int(sound[-1])
    tail = np.arange(first + int(0.6 * (last - first)), last + 1)
    ev, cv = np.median(e[tail]), np.median(cen[tail])
    like = (e > ev - 8) & (np.abs(np.log(cen / cv)) < np.log(1.6))
    v = int(tail[0])
    while v > first and like[v - 1]:
        v -= 1
    if not has_cons:
        return first * fr, first * fr, min(len(y), (last + 3) * fr)
    c = v
    while c > first and not like[c - 1]:
        c -= 1
    if v - c < 2:
        c = max(first, v - 8)
    start = max(first, c - 1)
    return start * fr, v * fr, min(len(y), (last + 3) * fr)


def unit_audio(kana, engine, name, speed):
    text = kana if kana == 'ン' else kana + 'ー'
    y, sr, *_ = (kokoro if engine == 'kokoro' else openjtalk)(text, name, speed)
    a, tv, b = segment(y, sr, has_cons=kana not in ('ア', 'イ', 'ウ', 'エ', 'オ', 'ン'))
    seg = y[a: b].copy()
    nf = int(0.004 * sr); seg[:nf] *= np.linspace(0, 1, nf)             # (a 4 ms fade in: no click at the cut)
    pre = max(0.0, (tv - a) / sr)
    return seg, sr, pre


VK = {'a': 'ア', 'i': 'イ', 'u': 'ウ', 'e': 'エ', 'o': 'オ', 'N': 'ン'}
VCV_BEFORE = 'aiueoN'


def _frames(y, sr):
    fr = int(0.01 * sr); n = max(1, (len(y) - 2 * fr) // fr); win = np.hanning(2 * fr); f = np.fft.rfftfreq(2 * fr, 1 / sr)
    e = np.empty(n); c = np.empty(n)
    for i in range(n):
        w = y[i * fr:i * fr + 2 * fr]; e[i] = 10 * np.log10((w ** 2).mean() + 1e-12)
        Sx = np.abs(np.fft.rfft(w * win)); c[i] = (Sx * f).sum() / (Sx.sum() + 1e-12) + 1
    return fr, e, c


def vcv_audio(pv, kana, engine, name, speed, keep_ms=30.0, trim_ms=30.0):
    """a VCV unit: the mora as it comes after vowel pv (a i u e o, N = after ン), from "<pv><mora>ー" — cut from the middle of the
    vowel before, then `trim_ms` more of it off (at least `keep_ms` of it kept before the consonant), to the long vowel's end.
    Whisper on 20 sentences (tools/exp/ana/vcv2.py, 3 sets of units): CV units 0.45-0.52 of the characters wrong, VCV cut at the
    vowel's middle about 0.43-0.47, 30 ms later 0.30-0.35 — the vowel before, started again, was heard as one more mora ("のお腹")"""
    tail = '' if kana == 'ン' else 'ー'
    y, sr, *_ = (kokoro if engine == 'kokoro' else openjtalk)(VK[pv] + kana + tail, name, speed)
    vowel_only = kana in ('ア', 'イ', 'ウ', 'エ', 'オ', 'ン')
    a, tv, b = segment(y, sr, has_cons=not vowel_only)
    fr, e, c = _frames(y, sr)
    snd = np.where(e > e.max() - 45)[0]; first = int(snd[0]) * fr
    if vowel_only:
        # (two vowels / a vowel and ン: the second starts where the centroid moves most, between 25 % and 70 % of the sound)
        i0, i1 = int(snd[0] + 0.25 * (snd[-1] - snd[0])), int(snd[0] + 0.7 * (snd[-1] - snd[0]))
        lc = np.log(c); d = np.abs(np.convolve(np.diff(lc), np.ones(3) / 3, 'same'))
        tv = (i0 + int(np.argmax(d[i0:i1]))) * fr; a = tv
    st = first + (a - first) // 2
    st = min(st + int(trim_ms / 1000 * sr), max(st, a - int(keep_ms / 1000 * sr)))
    seg = y[st:b].copy()
    nf = int(0.004 * sr); seg[:nf] *= np.linspace(0, 1, nf)
    return seg, sr, max(0.0, (tv - st) / sr)


def level(seg, sr, f0_ref):
    """the unit's pitch made level at f0_ref (WORLD: the spectral envelope and the noise kept)"""
    import pyworld as pw
    seg = np.ascontiguousarray(seg)
    f0, t = pw.harvest(seg, sr, frame_period=5.0, f0_floor=70, f0_ceil=600)
    sp = pw.cheaptrick(seg, f0, t, sr)
    ap = pw.d4c(seg, f0, t, sr)
    f1 = np.where(f0 > 0, f0_ref, 0.0)
    out = pw.synthesize(f1, sp, ap, sr, frame_period=5.0)[: len(seg)]
    return out, f0


def main():
    ap_ = argparse.ArgumentParser()
    ap_.add_argument('--engine', default='kokoro', choices=['kokoro', 'openjtalk']); ap_.add_argument('--voice', default='jf_alpha')
    ap_.add_argument('--id', default='voice_ja'); ap_.add_argument('--speed', type=float, default=None); ap_.add_argument('--dry')
    ap_.add_argument('--vcv', action='store_true', help='VCV units too (the mora after each vowel and after ン), natural pitch, one layer')
    ap_.add_argument('--seed', type=int, default=0)
    ap_.add_argument('--fade-in', type=float, default=0.0, help='ms a VCV unit fades in over (the crossfade with the unit before; 30 ms: Whisper 0.425 against 0.405 without, no gain)')
    a = ap_.parse_args()
    if a.speed is None: a.speed = 1.0 if a.vcv else 0.6
    try:
        import torch; torch.manual_seed(a.seed)
    except ImportError:
        pass
    layers = [0] if a.vcv else LAYERS
    from scipy.signal import resample_poly
    from math import gcd
    raw = []
    cache = os.environ.get('VOICE_RAW')            # (a pickle of the synthesised units: rebuilding skips the synthesiser)
    if cache and os.path.exists(cache):
        import pickle; raw = pickle.load(open(cache, 'rb'))
    for u in ([] if raw else UNITS):
        seg, sr, pre = unit_audio(u, a.engine, a.voice, a.speed)
        raw.append((u, seg, sr, pre))
        print(f'  {u}: {len(seg) / sr:.2f} s, consonant {pre * 1000:.0f} ms', file=sys.stderr)
    if a.vcv and not any(u[0] in VCV_BEFORE for u, *_ in raw):
        for pv in VCV_BEFORE:
            for u in UNITS:
                if u in ('ア', 'イ', 'ウ', 'エ', 'オ') and VK[pv] == u:
                    continue                                # (the same vowel again: the unit before holds on)
                seg, sr, pre = vcv_audio(pv, u, a.engine, a.voice, a.speed)
                raw.append((pv + u, seg, sr, pre))
                print(f'  {pv}{u}: {len(seg) / sr:.2f} s, to the vowel {pre * 1000:.0f} ms', file=sys.stderr)
    if cache and not os.path.exists(cache):
        import pickle; pickle.dump(raw, open(cache, 'wb'))
    # the voice's own pitch: the median over every unit's voiced frames
    import pyworld as pw
    f0s = []
    for u, seg, sr, pre in raw:
        f0, _ = pw.harvest(np.ascontiguousarray(seg), sr, frame_period=5.0, f0_floor=70, f0_ceil=600)
        f0s += list(f0[f0 > 0])
    f0_ref = float(np.median(f0s))
    print(f'voice median pitch {f0_ref:.1f} Hz', file=sys.stderr)
    groups = {}
    for u, seg, sr, pre in raw:
        ctx = u[0] if a.vcv and u[0] in VCV_BEFORE else ''
        groups.setdefault(ctx, []).append((u[len(ctx):], seg, sr, pre))
    p = os.path.join(UNIT, 'tools', 'samples', 'bank.json')
    bank = json.load(open(p)) if os.path.exists(p) else []
    made, total = [], 0
    for ctx, items in groups.items():
        vid = a.id + ('_' + ctx.lower() if ctx else '')
        folder = os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'i', vid)
        if not a.dry and os.path.isdir(folder):
            for f in os.listdir(folder):
                if f.endswith('.ogg'): os.unlink(os.path.join(folder, f))   # (no stale units of an earlier build)
        rows, units, pres, k = [], [], [], 0
        for u, seg, sr, pre in items:
            units.append(u); pres.append(int(round(pre * 1000)))
            for L in layers:
                y = seg.copy() if a.vcv else level(seg, sr, f0_ref * 2 ** (L / 12))[0]
                if ctx and a.fade_in:
                    # (a VCV unit starts inside the vowel before, which the unit before is fading out of over its 40 ms release:
                    #  faded in over as long, the two crossfade instead of the new one starting at full level)
                    nfi = min(int(a.fade_in / 1000 * sr), int(pre * sr) // 2); y[:nfi] *= np.linspace(0, 1, nfi)
                if sr != SR:
                    g = gcd(SR, sr); y = resample_poly(y, SR // g, sr // g)
                nf = min(int(0.03 * SR), len(y) // 4)
                y[-nf:] *= np.linspace(1, 0, nf)
                vstart = int(pre * SR)
                rms = np.sqrt((y[vstart:] ** 2).mean()) if len(y) > vstart + 100 else np.sqrt((y ** 2).mean())
                y = y * (10 ** (-16 / 20) / max(1e-6, rms))          # the vowel at -16 dB RMS
                y = np.clip(y, -0.98, 0.98)[:, None]
                if a.dry:
                    import soundfile as sf
                    os.makedirs(a.dry, exist_ok=True)
                    sf.write(os.path.join(a.dry, f'{vid}_{k:03d}_{u}_{L:+d}.wav'), y[:, 0], SR)
                else:
                    total += BK.encode(y, os.path.join(folder, f'{k}.ogg'), '3', False)
                rows.append([len(units) - 1, 100 + L, int(round(len(y) / SR * 1000)), round(float(np.sqrt((y ** 2).mean())), 4)])
                k += 1
        v = {'units': units, 'pre': pres, 'layers': layers, 'f0': round(f0_ref, 2),
             'source': 'Kokoro-82M (Apache-2.0) ' + a.voice if a.engine == 'kokoro' else 'Open JTalk HTS voice Mei (CC BY 3.0, Nagoya Institute of Technology)'}
        if a.vcv: v['after'] = ctx.lower() or None; v['base'] = a.id
        made.append({'id': vid, 'name': f"Voice ({'Kokoro-82M ' + a.voice if a.engine == 'kokoro' else 'Open JTalk Mei'})" + (f' after {VK[ctx]}' if ctx else ''),
                     'release': 0.04, 'sustain': False, 'stereo': False, 'samples': rows, 'gm': [], 'drums': None, 'voice': v})
    if a.dry:
        json.dump(made, open(os.path.join(a.dry, 'entry.json'), 'w'), ensure_ascii=False, indent=0)
        print(f'{sum(len(e["samples"]) for e in made)} units in {a.dry}')
        return
    ids = {e['id'] for e in made}
    old = [b for b in bank if b['id'] != a.id and not b['id'].startswith(a.id + '_')]
    bank = old + made
    json.dump(bank, open(p, 'w'), indent=0, ensure_ascii=False)
    BK.write_defs(bank); BK.write_ts(bank)
    print(f"{a.id}: {sum(len(e['voice']['units']) for e in made)} units in {len(made)} voices x {len(layers)} pitches, {total / 1e6:.2f} MB, pitch {f0_ref:.1f} Hz")


if __name__ == '__main__':
    main()
