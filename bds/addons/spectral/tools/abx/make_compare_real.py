#!/usr/bin/env python3
"""A listening page that puts two ways of playing a song on the real client side by side, with a blind test between them:
for each song that has a recording of both, the original MP3 excerpt, the references (the ceiling by default) and the two
ways, each level matched to the original (RMS) and time aligned (ViSQOL's global alignment, tools/abx/make_abx.prepare),
as MP3 192 kb/s. The scores beside them are the runs' own (measured/redroid-<run>.json: ViSQOL on the recordings' WAVs in the
run, not on these files).

  python3 tools/abx/make_compare_real.py --rec corpus/renders/rec --runs 41158185476 --a w --b u [--refs c] \
      [--title 'Spectral Player レベル比較'] [--out dist/compare_level]

Made for choosing the phone's level by ear (w = the final default at +6 dB, u = the same at +10 dB, run 41158185476).
"""
import argparse, json, os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import make_abx as MA
import make_abx_real as MR
C = MA.C

# (a prefix → its key in measured/redroid-<run>.json, a short name for the buttons and a longer one)
WAYS = {'w': ('final', '+6 dB', '最終の既定（ファイルより +6 dB、いまの既定）'), 'u': ('final_loud10', '+10 dB', '最終の既定を +10 dB で'),
        's': ('shipped_run7', '出荷版', '出荷版（7 回目の run）'), 'c': ('ceiling', '天井', '天井（元の音をそのままゲームに鳴らさせた録音）'),
        'f': ('improved_fades', 'レベル 0', '最終の変換をレベル 0 で'), 'q': ('ceiling_loud', '天井 +6', '天井を音量 2（+6 dB）で'),
        't': ('refined', '分析 +6 dB', '合成による分析（+6 dB）'), 'p': ('refined_loud10', '分析 +10 dB', '合成による分析を +10 dB で'),
        'd': ('refined_svr5', '新しい既定', '合成による分析・高い帯域を重く・5 回・大きさを保つ（9 回目の新しい既定）'),
        'i': ('live_encoder', 'ライブ', 'ライブの変換（ボイスチャットと同じ: 50 ms ずつ、先を見ない）'),
        'jp': ('live_phones', 'ライブの道', 'ライブの道（1 フレームずつ script event、ヘッドホン）'),
        'jl': ('live_3d_left', '3D 左', '3D のスピーカーで左 6 ブロックから'), 'jr': ('live_3d_right', '3D 右', '3D のスピーカーで右 6 ブロックから'),
        'e': ('refined_svr5_loud10', '+10 dB', '新しい既定を +10 dB で詰めて +10 dB で'),
        'kl': ('live_near_left', '人ごと 3D 左', '聞く人それぞれの 3D の音（near: follow と同じ）で左 6 ブロックから'),
        'kr': ('live_near_right', '人ごと 3D 右', '聞く人それぞれの 3D の音（near: follow と同じ）で右 6 ブロックから'),
        'ka': ('live_near_left3', '左 3', '聞く人ごとの 3D で左 3 ブロックから'), 'kb': ('live_near_left12', '左 12', '聞く人ごとの 3D で左 12 ブロックから'),
        'kc': ('live_near_left24', '左 24', '聞く人ごとの 3D で左 24 ブロックから')}
# (the clip's distortion on the emulator's renders, a hard clip at 2.0 file units — tools/exp/README.md; estimated, not measured)
CLIP_NOTE = {'w': 'クリップの歪み（推測）: 全曲 −44 dB 未満', 'u': 'クリップの歪み（推測）: 話し声 −21 dB、ピアノ −26 dB まで'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rec', required=True); ap.add_argument('--runs', required=True)
    ap.add_argument('--a', default='w'); ap.add_argument('--b', default='u'); ap.add_argument('--refs', default='c')
    ap.add_argument('--title', default='Spectral Player レベル比較')
    ap.add_argument('--out', default=os.path.join(UNIT, 'dist', 'compare_level'))
    ap.add_argument('--scores', help="scores in measured/redroid-<run>.json's shape from elsewhere: tools/exp/batch_play.py's scores.json (emulated)")
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, 'audio'), exist_ok=True)
    rows = {}
    for run in a.runs.split(','):
        d = json.load(open(a.scores if a.scores else os.path.join(UNIT, 'measured', f'redroid-{run}.json'), encoding='utf-8'))
        for sid, r in d.get('songs', {}).items():
            rows.setdefault(sid, {}).update({k: v for k, v in r.items() if isinstance(v, dict)})
    # (the ceilings of runs 1-2: measured/summary.json, the same recordings as c_)
    summ = json.load(open(os.path.join(UNIT, 'measured', 'summary.json'), encoding='utf-8')).get('songs', {})
    man = {s['id']: s for s in C.manifest()['songs']}
    refs = [p for p in a.refs.split(',') if p]
    songs = []
    for sid in man:
        fa, fb = (os.path.join(a.rec, f'{p}_{sid}.opus') for p in (a.a, a.b))
        if not (os.path.exists(fa) and os.path.exists(fb) and os.path.exists(C.excerpt_path(sid))):
            continue
        ref_st = C.load(sid, 48000, stereo=True)
        shutil.copy(C.excerpt_path(sid), os.path.join(a.out, 'audio', f'{sid}.orig.mp3'))
        ways = []
        for p in [*refs, a.a, a.b]:
            f = os.path.join(a.rec, f'{p}_{sid}.opus')
            if not os.path.exists(f):
                continue
            MA.mp3(os.path.join(a.out, 'audio', f'{sid}.{p}.mp3'), MA.prepare(ref_st, MR.load(f)), kbps=192)
            key = WAYS[p][0]
            v = rows.get(sid, {}).get(key, {}).get('visqol')
            if v is None and key == 'ceiling' and not a.scores:
                v = summ.get(sid, {}).get('ceiling', {}).get('visqol')
            ways.append({'k': p, 'short': WAYS[p][1], 'long': WAYS[p][2], 'visqol': v, 'clip': CLIP_NOTE.get(p, '')})
        s = man[sid]
        songs.append({'id': sid, 'title': s['title'], 'category': s['category'], 'credit': f"{s['author']} · {s['license']}", 'ways': ways})
        print(json.dumps({'song': sid, 'ways': {w['k']: w['visqol'] for w in ways}}, ensure_ascii=False), flush=True)
    data = {'title': a.title, 'a': a.a, 'b': a.b, 'aName': WAYS[a.a][1], 'bName': WAYS[a.b][1], 'runs': a.runs.split(','), 'emulated': bool(a.scores),
            'songs': songs, 'credits': [c for c in C.credits() if any(f'"{man[x["id"]]["title"]}"' in c or c.startswith(man[x['id']]['title']) for x in songs)]}
    html = open(os.path.join(HERE, 'compare.html'), encoding='utf-8').read()
    html = html.replace('/*DATA*/{}', json.dumps(data, ensure_ascii=False)).replace('<title>Spectral Player レベル比較</title>', f'<title>{a.title}</title>')
    open(os.path.join(a.out, 'index.html'), 'w', encoding='utf-8').write(html)
    print('->', a.out, len(songs), 'songs')


if __name__ == '__main__':
    main()
