#!/usr/bin/env python3
"""Speech as notes: Japanese text read the way MIDI is played — each mora a note of the bank's voice (tools/samples/voice.py:
one unit a mora, placed by its vowel to the millisecond, its pitch by setPitch), Tokyo pitch accent from Open JTalk's
analysis (accent phrases, the accent nucleus, devoiced vowels), a gentle fall over the sentence, pauses at punctuation.
The result is a note song (spectral-notes/2, with cents) for /spectral:play, a song pack or the paste form; --render plays it
through the very units (the reference); --eval transcribes that with Whisper and gives the character error rate against the
text's reading (how easily it is understood).

  python3 tools/speech.py "日本語の文" [--out x.song.json] [--id x] [--mora 150] [--range 4] [--render x.wav] [--eval]"""
import argparse, json, os, re, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import notes as N

# Open JTalk phonemes -> the voice's units (katakana)
CONS = {'': 'アイウエオ', 'k': 'カキクケコ', 'g': 'ガギグゲゴ', 's': 'サシスセソ', 'sh': 'シャシシュシェショ', 'z': 'ザジズゼゾ',
        'j': 'ジャジジュジェジョ', 't': 'タチツテト', 'ch': 'チャチチュチェチョ', 'ts': 'ツァツィツツェツォ', 'd': 'ダヂヅデド',
        'n': 'ナニヌネノ', 'h': 'ハヒフヘホ', 'f': 'ファフィフフェフォ', 'b': 'バビブベボ', 'p': 'パピプペポ', 'm': 'マミムメモ',
        'y': 'ヤイユエヨ', 'r': 'ラリルレロ', 'w': 'ワウィウウェヲ', 'v': 'ヴァヴィヴヴェヴォ'}
PAL = {'ky': 'キ', 'gy': 'ギ', 'ny': 'ニ', 'hy': 'ヒ', 'by': 'ビ', 'py': 'ピ', 'my': 'ミ', 'ry': 'リ'}
SMALL = {'a': 'ャ', 'u': 'ュ', 'o': 'ョ'}
VOW = 'aiueo'
FIX = {'ヂ': 'ジ', 'ヅ': 'ズ', 'ヲ': 'オ', 'ヴァ': 'バ', 'ヴィ': 'ビ', 'ヴ': 'ブ', 'ヴェ': 'ベ', 'ヴォ': 'ボ', 'ツァ': 'チャ', 'ツィ': 'チ',
       'ツェ': 'チェ', 'ツォ': 'チョ', 'シェ': 'セ', 'ジェ': 'ゼ', 'チェ': 'テ', 'イェ': 'エ', 'ディ': 'ディ', 'ティ': 'ティ',
       'デ': 'デ', 'ド': 'ド', 'ダ': 'ダ', 'ヅ': 'ズ', 'ニェ': 'ネ', 'ヒェ': 'ヘ', 'キェ': 'ケ'}


def kana_of(cons, vowel):
    v = vowel.lower()
    if cons in PAL:
        return PAL[cons] + SMALL[v] if v in SMALL else PAL[cons] + ('ィ' if v == 'i' else 'ェ')
    if cons == 'ty':
        return 'ティ' if v == 'i' else 'チ' + SMALL.get(v, '')
    if cons == 'dy':
        return 'ディ' if v == 'i' else 'ジ' + SMALL.get(v, '')
    if cons in ('sh', 'j', 'ch') and v != 'i':
        base = {'sh': 'シ', 'j': 'ジ', 'ch': 'チ'}[cons]
        return base + (SMALL[v] if v in SMALL else 'ェ')
    row = CONS.get(cons, 'アイウエオ')
    if len(row) == 5:
        return row[VOW.index(v)]
    # rows written with two-character entries
    parts = re.findall(r'.[ャュョァィゥェォ]?', row)
    return parts[VOW.index(v)] if len(parts) == 5 else row[0]


def morae(text):
    """the morae of the text: (unit kana, devoiced, accent-phrase index, mora position in the phrase, phrase accent, pause after ms)"""
    import pyopenjtalk
    labels = pyopenjtalk.extract_fullcontext(text)
    out, cons, phrase, last_a2, last_f = [], '', -1, None, None
    for lab in labels:
        p3 = re.search(r'-(.+?)\+', lab).group(1)
        if p3 in ('sil', 'pau'):
            if out:
                out[-1]['pause'] += 400 if p3 == 'sil' else 220
            cons = ''; last_a2 = None
            continue
        a = re.search(r'/A:([\d-]+)\+(\d+)\+(\d+)/', lab)
        f = re.search(r'/F:(\d+)_(\d+)#', lab)
        a2 = int(a.group(2)) if a else 1
        acc = int(f.group(2)) if f else 0
        fkey = lab.split('/F:')[1].split('/')[0] if '/F:' in lab else ''
        if last_a2 is None or a2 < last_a2 or (a2 == 1 and last_a2 != 1) or fkey != last_f:
            if last_a2 is None or a2 <= (last_a2 or 0):
                phrase += 1
        last_a2, last_f = a2, fkey
        if p3 in ('N', 'cl'):
            out.append({'kana': 'ン' if p3 == 'N' else 'ッ', 'dev': False, 'phrase': phrase, 'pos': a2, 'acc': acc, 'pause': 0})
            cons = ''
        elif p3.lower() in VOW:
            k = kana_of(cons, p3)
            out.append({'kana': FIX.get(k, k), 'dev': p3.isupper(), 'phrase': phrase, 'pos': a2, 'acc': acc, 'pause': 0})
            cons = ''
        else:
            cons = p3
    return out


def plan(ms, voice, prog=200, mora_ms=180.0, rng=4.0, overlap=25.0, cut=10.0):
    """notes for the morae: each unit started its consonant ahead of its vowel, the vowel on the beat; Tokyo accent (the first mora
    low unless the nucleus is on it, high up to the nucleus, low after it; a flat phrase stays high), each phrase a little lower
    than the one before (a downstep after an accented one), the sentence's last mora lower still"""
    units, pre = voice['voice']['units'], voice['voice']['pre']
    idx = {u: i for i, u in enumerate(units)}
    notes, t, reg = [], 300.0, 0.0
    prev_phrase = None
    beats = []
    for i, m in enumerate(ms):
        if m['phrase'] != prev_phrase:
            if prev_phrase is not None:
                reg -= 0.6 + (1.2 if ms[i - 1]['acc'] else 0)
                if ms[i - 1]['pause']:
                    reg = max(reg, -1.0)            # a breath resets most of the fall
            prev_phrase = m['phrase']
        acc, pos = m['acc'], m['pos']
        high = (pos > 1 and (acc == 0 or pos <= acc)) or (acc == 1 and pos == 1)
        semis = reg + (rng / 2 if high else -rng / 2)
        if m['kana'] == 'ッ':
            beats.append(None); t += mora_ms * 0.9; continue
        dur = mora_ms * (0.7 if m['dev'] else 1.0)
        if m['pause'] >= 400:
            semis -= 2.0; dur *= 1.15
        beats.append((t, dur, m, semis))
        t += dur + m['pause']
    for b, nxt in zip(beats, beats[1:] + [None]):
        if b is None:
            continue
        t, dur, m, semis = b
        kana = m['kana']
        if kana == 'ン' and 'ン' not in idx:
            kana = 'ヌ'
        u = idx.get(kana)
        if u is None and len(kana) > 1:
            u = idx.get(kana[0])
        if u is None:
            continue
        start = t - pre[u]
        hold = dur + (overlap if nxt is not None and m['pause'] == 0 else 40)
        notes.append([start, hold + pre[u], u, 64 if m['dev'] else 100, prog, round(semis * 100), m['pause']])
    # (cut: a mora's vowel stops as the next one's consonant starts, crossfading `cut` ms — a vowel left sounding under the next
    #  /s/ /k/ /t/ blurs it; None: each holds to the next vowel's beat + overlap, as before. Whisper on the four sentences of
    #  tools/exp/sampler_plans.py, 180 ms a mora: 0.26 of the characters wrong at 10 ms, 0.34 at 20, about 0.7-1.2 without)
    if cut is not None:
        for a, b in zip(notes, notes[1:]):
            if a[6] == 0:
                a[1] = max(40.0, b[0] - a[0] + cut)
    notes = [tuple(n[:6]) for n in notes]
    t0 = min(n[0] for n in notes)
    return sorted([(s - t0, *rest) for s, *rest in notes], key=lambda n: n[0])


def reading(text):
    import pyopenjtalk
    return re.sub(r'[^ァ-ヴー]', '', pyopenjtalk.g2p(text, kana=True))


def cer(a, b):
    """character error rate of b against a (Levenshtein / len(a))"""
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
    return d[len(b)] / max(1, len(a))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('text'); ap.add_argument('--out'); ap.add_argument('--id', default='speech'); ap.add_argument('--title')
    ap.add_argument('--mora', type=float, default=180.0); ap.add_argument('--range', type=float, default=4.0)
    ap.add_argument('--render'); ap.add_argument('--eval', action='store_true'); ap.add_argument('--voice', default='voice_ja')
    a = ap.parse_args()
    B = N.bank()
    vs = N.voices(B)
    vi = next(i for i, v in enumerate(vs) if v['id'] == a.voice)
    ms = morae(a.text)
    notes = plan(ms, vs[vi], prog=200 + vi, mora_ms=a.mora, rng=a.range)
    song = N.encode(notes, a.id, a.title or a.text[:40], 'Spectral Player (speech)')
    if a.out:
        json.dump(song, open(a.out, 'w'), separators=(',', ':'), ensure_ascii=False)
    info = {'id': a.id, 'morae': len(ms), 'notes': len(notes), 'seconds': song['meta']['seconds'], 'bytes': len(song['data']) * 3 // 4,
            'units': ''.join(m['kana'] for m in ms)}
    if a.render:
        N.render(N.decode(song), a.render, master=1.0)
        if a.eval:
            import whisper
            model = whisper.load_model(os.environ.get('WHISPER_MODEL', 'small'))
            got = model.transcribe(a.render, language='ja')['text']
            ref, hyp = reading(a.text), reading(got)
            info.update({'heard': got, 'cer': round(cer(ref, hyp), 3)})
    print(json.dumps(info, ensure_ascii=False))


if __name__ == '__main__':
    main()
