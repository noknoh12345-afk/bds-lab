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
    ap_.add_argument('--id', default='voice_ja'); ap_.add_argument('--speed', type=float, default=0.6); ap_.add_argument('--dry')
    a = ap_.parse_args()
    from scipy.signal import resample_poly
    from math import gcd
    raw = []
    for u in UNITS:
        seg, sr, pre = unit_audio(u, a.engine, a.voice, a.speed)
        raw.append((u, seg, sr, pre))
        print(f'  {u}: {len(seg) / sr:.2f} s, consonant {pre * 1000:.0f} ms', file=sys.stderr)
    # the voice's own pitch: the median over every unit's voiced frames
    import pyworld as pw
    f0s = []
    for u, seg, sr, pre in raw:
        f0, _ = pw.harvest(np.ascontiguousarray(seg), sr, frame_period=5.0, f0_floor=70, f0_ceil=600)
        f0s += list(f0[f0 > 0])
    f0_ref = float(np.median(f0s))
    print(f'voice median pitch {f0_ref:.1f} Hz', file=sys.stderr)
    rows, units, pres, total = [], [], [], 0
    k = 0
    for u, seg, sr, pre in raw:
        units.append(u); pres.append(int(round(pre * 1000)))
        for L in LAYERS:
            y, _ = level(seg, sr, f0_ref * 2 ** (L / 12))
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
                sf.write(os.path.join(a.dry, f'{k:03d}_{u}_{L:+d}.wav'), y[:, 0], SR)
                total += 0
            else:
                out = os.path.join(UNIT, 'rp', 'sounds', 'spectral', 'i', a.id, f'{k}.ogg')
                total += BK.encode(y, out, '3', False)
            rows.append([UNITS.index(u), 100 + L, int(round(len(y) / SR * 1000)), round(float(np.sqrt((y ** 2).mean())), 4)])
            k += 1
    entry = {'id': a.id, 'name': f"Voice ({'Kokoro-82M ' + a.voice if a.engine == 'kokoro' else 'Open JTalk Mei'})", 'release': 0.04,
             'sustain': False, 'stereo': False, 'samples': rows, 'gm': [], 'drums': None,
             'voice': {'units': units, 'pre': pres, 'layers': LAYERS, 'f0': round(f0_ref, 2),
                       'source': 'Kokoro-82M (Apache-2.0) ' + a.voice if a.engine == 'kokoro' else 'Open JTalk HTS voice Mei (CC BY 3.0, Nagoya Institute of Technology)'}}
    if a.dry:
        json.dump(entry, open(os.path.join(a.dry, 'entry.json'), 'w'), ensure_ascii=False, indent=0)
        print(f'{len(rows)} units in {a.dry}')
        return
    p = os.path.join(UNIT, 'tools', 'samples', 'bank.json')
    bank = json.load(open(p)) if os.path.exists(p) else []
    bank = [b for b in bank if b['id'] != a.id] + [entry]
    json.dump(bank, open(p, 'w'), indent=0, ensure_ascii=False)
    BK.write_defs(bank); BK.write_ts(bank)
    print(f"{a.id}: {len(units)} units x {len(LAYERS)} pitches, {total / 1e6:.2f} MB, pitch {f0_ref:.1f} Hz")


if __name__ == '__main__':
    main()
