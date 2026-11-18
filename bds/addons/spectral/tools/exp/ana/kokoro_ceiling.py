import sys, os, json, numpy as np, soundfile as sf
U = sys.argv[1]; sys.path[:0] = [os.path.join(U, 'tools'), os.path.join(U, 'tools', 'samples')]
import voice as V, speech as S, whisper
sys.argv = [sys.argv[0]]
exec(open('tools/exp/ana/speech_eval.py').read().split('model =')[0].split('import speech as S, notes as N, whisper')[1])
m = whisper.load_model('small'); tot = 0
for k, s in enumerate(SENT):
    y, sr, *_ = V.kokoro(s, 'jf_alpha', 1.0)
    f = f'/tmp/speech_kk_{k}.wav'; sf.write(f, y, sr)
    got = m.transcribe(f, language='ja', temperature=0)['text']; c = S.cer(S.reading(s), S.reading(got)); tot += c
    print(round(c, 3), got, flush=True)
print('kokoro', round(tot / len(SENT), 3))
