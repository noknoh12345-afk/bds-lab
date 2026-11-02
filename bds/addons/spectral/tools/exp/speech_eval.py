#!/usr/bin/env python3
"""How easily the speech is understood: Whisper (openai-whisper, a local model) transcribes each recording and the character
error rate against the sentence's reading (katakana, from Open JTalk) is counted — 0 = every mora heard right.
Recordings: the voice's units rendered here (tools/speech.py --render), Kokoro's own speech (the upper bound the units come from),
and device recordings (tools/rig/fetch_rec.py) named <prefix>_<sentence id>.

  python3 tools/exp/speech_eval.py --refs <dir with speech_*.wav> [--rec <dir with recordings>] [--model small] [--json out.json]"""
import argparse, glob, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [os.path.join(UNIT, 'tools'), HERE]
import speech as SP
from sampler_plans import SENTENCES


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refs'); ap.add_argument('--rec'); ap.add_argument('--model', default='small'); ap.add_argument('--json')
    ap.add_argument('--kokoro', action='store_true', help='also the sentences as Kokoro speaks them whole (needs kokoro)')
    a = ap.parse_args()
    import whisper
    model = whisper.load_model(a.model)
    rows = []
    files = []
    if a.refs:
        files += [(f'units/{os.path.basename(f)[:-4]}', f) for f in sorted(glob.glob(os.path.join(a.refs, 'speech_*.wav')))]
    if a.rec:
        files += [(f'rec/{os.path.basename(f).rsplit(".", 1)[0]}', f) for f in sorted(glob.glob(os.path.join(a.rec, '*speech_*.*')))]
    if a.kokoro:
        import soundfile as sf
        sys.path.insert(0, os.path.join(UNIT, 'tools', 'samples'))
        import voice as V
        for sid, text in SENTENCES.items():
            y, sr, *_ = V.kokoro(text, 'jf_alpha', 1.0)
            out = os.path.join(a.refs or '/tmp', f'kokoro_{sid}.wav')
            sf.write(out, y, sr)
            files.append((f'kokoro/{sid}', out))
    for name, f in files:
        sid = next((k for k in SENTENCES if k in name), None)
        if not sid:
            continue
        got = model.transcribe(f, language='ja')['text']
        ref, hyp = SP.reading(SENTENCES[sid]), SP.reading(got)
        rows.append({'name': name, 'sentence': sid, 'heard': got, 'cer': round(SP.cer(ref, hyp), 3)})
        print(json.dumps(rows[-1], ensure_ascii=False), flush=True)
    if a.json:
        json.dump(rows, open(a.json, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
