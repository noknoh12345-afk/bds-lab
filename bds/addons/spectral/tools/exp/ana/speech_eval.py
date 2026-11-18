# usage (from the unit folder): python3 tools/exp/ana/speech_eval.py . base "merge,merge=1" "m200,mora_ms=200" — Whisper small CER of tools/speech.py plan() variants over 20 sentences (loanwords and plain)
# Whisper CER of speech plans over a loanword set, with plan() variants passed as keyword args
import sys, os, json, itertools
U = sys.argv[1]; sys.path.insert(0, os.path.join(U, 'tools'))
import speech as S, notes as N, whisper
SENT = ['こんにちは 私はマインクラフトの中で話しています', 'サーバーにログインしました', 'ダイヤモンドを見つけました',
        'エンダードラゴンを倒しました', 'ネザーポータルに入ります', 'クリーパーが近くにいます',
        'ゾンビが村を襲っています', 'みんなでベッドで寝ましょう', 'チェストの中にパンがあります', '今日はいい天気ですね',
        'ピアノの曲を流します', 'スケルトンの矢に気をつけて', 'レッドストーンで扉を開けます', 'ボートで川を下りましょう',
        'ありがとうございます', 'ちょっと待ってください', 'エンチャントテーブルを作りました', '夜になったら家に帰ろう',
        'スティーブはどこにいますか', 'ブランチマイニングをしよう']
model = whisper.load_model('small')
B = N.bank(); vs = N.voices(B); vi = next(i for i, v in enumerate(vs) if v['id'] == 'voice_ja')
def run(tag, **kw):
    tot = 0; rows = []
    for k, s in enumerate(SENT):
        ms = S.morae(s); notes = S.plan(ms, vs[vi], prog=200 + vi, **kw)
        song = N.encode(notes, 'x', 'x', 'x'); f = f'/tmp/speech_eval_{tag}_{k}.wav'
        N.render(N.decode(song), f, master=1.0)
        got = model.transcribe(f, language='ja', temperature=0)['text']; c = S.cer(S.reading(s), S.reading(got)); tot += c
        rows.append((round(c, 3), got))
    print(tag, round(tot / len(SENT), 3), flush=True); json.dump(rows, open(f'/tmp/speech_eval_{tag}.json','w'), ensure_ascii=False)
    return tot / len(SENT)
if __name__ == '__main__':
    for spec in sys.argv[2:]:
        tag, *kv = spec.split(',')
        kw = {k: float(v) if v not in ('None',) else None for k, v in (x.split('=') for x in kv)}
        run(tag, **kw)
