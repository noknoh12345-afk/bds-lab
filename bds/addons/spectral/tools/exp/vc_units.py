#!/usr/bin/env python3
"""Voice chat the way MIDI plays (the user's request 23:55: 「近接 VC の限界がそれ」): a person's speech heard by Whisper, read
again by the bank's voice — each mora a note placed where the person said it (Whisper's word times shared out over the word's
morae) at the person's own pitch (WORLD's F0 over that mora, moved into the voice's range), so their rhythm and intonation stay.
Whisper transcribes the result too: how easily it is understood (the character error rate against what the person said),
beside the same speech through the sine engine as a phone plays it (tools/emu/phone.py) — the two ways a voice can go to the game.

  python3 tools/exp/vc_units.py <speech audio> [--text "what was said"] [--model small] [--out dir]"""
import argparse, json, os, re, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [os.path.join(UNIT, 'tools'), os.path.join(UNIT, 'tools', 'samples')]
import notes as N
import speech as SP


def load(path, sr=16000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def word_morae(word):
    """the morae of a word (Open JTalk's reading of it)"""
    try:
        return [m for m in SP.morae(word)]
    except Exception:
        return []


def plan_from_speech(path, model, voice):
    import pyworld as pw
    res = model.transcribe(path, language='ja', word_timestamps=True)
    words = [w for seg in res['segments'] for w in seg.get('words', [])]
    x = load(path, 16000)
    f0, t = pw.harvest(np.ascontiguousarray(x), 16000, frame_period=5.0, f0_floor=60, f0_ceil=600)
    voiced = f0[f0 > 0]
    spk = float(np.median(voiced)) if len(voiced) else 150.0
    units, pre = voice['voice']['units'], voice['voice']['pre']
    idx = {u: i for i, u in enumerate(units)}
    notes = []
    for w in words:
        ms = [m for m in word_morae(w['word']) if m['kana'] != 'ッ']
        if not ms:
            continue
        a, b = w['start'] * 1000, w['end'] * 1000
        step = max(60.0, (b - a) / len(ms))
        for k, m in enumerate(ms):
            on = a + k * step
            u = idx.get(m['kana']) if m['kana'] in idx else idx.get(m['kana'][0])
            if u is None:
                continue
            seg = f0[int(on / 5): int((on + step) / 5)]
            seg = seg[seg > 0]
            # the person's pitch here against their own median, as semitones round the voice's own
            semis = 12 * np.log2(float(np.median(seg)) / spk) if len(seg) else -1.0
            semis = float(np.clip(semis, -6, 6))
            notes.append((on - pre[u], step + pre[u] + 25, u, 64 if m['dev'] else 100, 200, round(semis * 100)))
    notes.sort(key=lambda n: n[0])
    t0 = min(n[0] for n in notes) if notes else 0
    return [(s - t0 + 0.0, *r) for s, *r in notes], res['text'], spk


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('audio'); ap.add_argument('--text'); ap.add_argument('--model', default='small'); ap.add_argument('--out', default='/tmp/vc_units')
    ap.add_argument('--sine', help='the same speech as a sine-engine song (.song.json) to render as the phone would and compare')
    a = ap.parse_args()
    import whisper
    os.makedirs(a.out, exist_ok=True)
    model = whisper.load_model(a.model)
    B = N.bank(); vs = N.voices(B)
    notes, heard, spk = plan_from_speech(a.audio, model, vs[0])
    song = N.encode(notes, 'vc', 'voice chat by units', 'Spectral Player')
    json.dump(song, open(os.path.join(a.out, 'vc.song.json'), 'w'), separators=(',', ':'))
    wav = os.path.join(a.out, 'vc_units.wav')
    N.render(N.decode(song), wav, master=1.0)
    text = a.text or heard
    rows = {'said': text, 'speaker_hz': round(spk, 1), 'notes': len(notes), 'bytes': len(song['data']) * 3 // 4,
            'seconds': song['meta']['seconds'], 'bps': round(len(song['data']) * 3 // 4 * 8 / max(0.1, song['meta']['seconds']))}
    for name, f in (('original', a.audio), ('units', wav)):
        got = model.transcribe(f, language='ja')['text']
        rows[name] = {'heard': got, 'cer': round(SP.cer(SP.reading(text), SP.reading(got)), 3)}
    if a.sine:
        out = os.path.join(a.out, 'vc_sine_phone.wav')
        subprocess.run(['python3', os.path.join(UNIT, 'tools', 'emu', 'phone.py'), a.sine, '--wav', out], check=True, capture_output=True)
        got = model.transcribe(out, language='ja')['text']
        rows['sine_phone'] = {'heard': got, 'cer': round(SP.cer(SP.reading(text), SP.reading(got)), 3)}
    print(json.dumps(rows, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
