#!/usr/bin/env python3
"""The ABX page with real recordings: A = the original MP3 excerpt, B = what the game played on a real client (a redroid
run of app.txt: the recordings exported through the job log by `audio export` and opened by tools/rig/rec_decode.mjs), and
beside them, outside the ABX: the ceiling (the original played as an ordinary sound through the same client and recorder),
light mode, and the emulator's render of the same song (tools/emu with spec.json).

  python3 tools/abx/make_abx_real.py --rec <dir of decoded .opus> --runs <run>[,<run>…] [--out dist/abx_real]

Level matched to the original (RMS) and time aligned (ViSQOL's global alignment); B as MP3 256 kb/s, the references 192 kb/s. The scores are the runs'
own (measured/redroid-<run>.json: the recordings' WAVs in the run, not these files); kbps of the song data and commands per
tick come from the converter and the bundle in the mock (the same song data the run sent).
"""
import argparse, base64, hashlib, json, os, shutil, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import make_abx as MA                       # prepare(), mp3(), song_json(), page data helpers
C, MT, E = MA.C, MA.MT, MA.E
SR = 48000
# (prefix of the recordings in --rec → the file suffix and label of each reference beside A and B; B is --b)
REFS = {'c': ('ceil', '天井（実機で元の音を鳴らした録音）'), 'g': ('old', '前の既定（48 声、実機）'), 'm': ('m24', '24 声・打撃音は声と同じ tick（実機）'),
        'l': ('light', '軽量モード（実機）'), 'emu': ('emu', 'エミュレーター（同じ曲）'),
        'a': ('ship', '出荷版（打撃音を 1 tick 先、実機）'), 'n': ('ship4', '出荷版（4 回目の run、実機）'), 'b': ('impr', '改良版（residual voiced・打撃音なし、実機）'),
        'f': ('fades', '最終の変換をレベル 0 で（tick ごとのフェード、実機）'), 'h': ('loud', '改良版＋フェード＋12 dB（実機）'),
        'q': ('ceil6', '天井を 6 dB 大きく（音量 2、最終の既定と同じ大きさ、実機）'), 's': ('ship7', '出荷版（7 回目の run、実機）'),
        'u': ('loud10', '最終の既定を +10 dB で（実機）'), 'w': ('final', '7 回目の既定（実機）'),
        't': ('refined', '合成による分析（実機）'), 'p': ('refined10', '合成による分析を +10 dB で（実機）'), 'o': ('refsvr', '合成による分析・高い帯域を重く（実機）')}
# (B's prefix → its key in measured/redroid-<run>.json and how the page names it)
BWAYS = {'g': ('game', '前の既定（48 声）'), 'm': ('mobile', '電話の既定（24 声、打撃音は声と同じ tick）'),
         'n': ('mobile_ahead', '出荷する版（電話の既定 24 声、打撃音を 1 tick 先に送る）'), 'b': ('improved', '改良版（変換器 residual voiced、打撃音なし、24 声）'),
         'f': ('improved_fades', '改良版＋tick ごとに合わせたフェード'), 'h': ('improved_loud', '改良版＋フェード＋ファイルより 12 dB 大きく'),
         'w': ('final', '7 回目の既定（変換器 residual voiced・tick ごとに合わせたフェード、打撃音なし、24 声、ファイルより 6 dB 大きく）'),
         't': ('refined', '合成による分析（変換の中で実機の模型を通して tick ごとの音量とフェードを ViSQOL の類似度で最適化、24 声、ファイルより 6 dB 大きく）'),
         'p': ('refined_loud10', '合成による分析を +10 dB で'), 'o': ('refined_svr', '合成による分析・ViSQOL の重い高い帯域を重く')}


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64).reshape(-1, 2)


def emu_render(sid, play):
    """the same song through the validated client model (tools/exp: the converter as it is now, the add-on's bundle in the mock
    with `play` — the phone's way by default —, tools/emu with spec.json, the measured client path), cached by their code; and
    the commands per tick and the song data's kbps"""
    sys.path.insert(0, os.path.join(UNIT, 'tools', 'exp'))
    import exp as X
    sp = X.song_pack(sid, {})
    lg = X.song_log(sp, play)
    y = X.path24(X.render(lg, {'oneshot_latency_ms': -45}), clip=2.0)
    info = json.load(open(lg + '.info'))
    sj = json.load(open(sp))
    run = {'calls_per_tick': info['calls_per_tick'], 'kbps': round(len(base64.b64decode(sj['data'])) * 8 / sj['meta']['seconds'] / 1000, 2)}
    return np.stack([y, y], 1), run


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rec', required=True); ap.add_argument('--runs', required=True)
    ap.add_argument('--out', default=os.path.join(UNIT, 'dist', 'abx_real'))
    ap.add_argument('--b', default='g', help='prefix of the recordings that are B (g: the default of runs 41068618513/41076646541, n: the phone default with bursts ahead)')
    ap.add_argument('--refs', default='c,l,emu', help='references beside A and B, in order (c g m l emu)')
    ap.add_argument('--play', default='{"mode":"quality","voices":24,"cmds":["spectral:drums off","spectral:level 6"]}',
                    help='how the emulator plays the song (tools/exp play: the phone\'s way by default) for the emu reference and the commands per tick')
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, 'audio'), exist_ok=True)
    rows, devices = {}, []
    for run in a.runs.split(','):
        d = json.load(open(os.path.join(UNIT, 'measured', f'redroid-{run}.json')))
        devices.append(f"run {run}: {d.get('device', '')}")
        for sid, r in d.get('songs', {}).items():
            rows.setdefault(sid, {}).update(r)
    man = {s['id']: s for s in C.manifest()['songs']}
    songs = []
    want = a.refs.split(',')
    # (a song whose original excerpt is not here — corpus.py fetch could not reach its source — is left out)
    for sid in [s for s in man if os.path.exists(os.path.join(a.rec, f'{a.b}_{s}.opus')) and os.path.exists(C.excerpt_path(s))]:
        ref_st = C.load(sid, SR, stereo=True)
        shutil.copy(C.excerpt_path(sid), os.path.join(a.out, 'audio', f'{sid}.orig.mp3'))
        MA.mp3(os.path.join(a.out, 'audio', f'{sid}.game.mp3'), MA.prepare(ref_st, load(os.path.join(a.rec, f'{a.b}_{sid}.opus'))), kbps=256)
        refs, run = [], None
        for pre in want:
            k = REFS[pre][0]
            if pre == 'emu':
                y, run = emu_render(sid, json.loads(a.play))
                MA.mp3(os.path.join(a.out, 'audio', f'{sid}.emu.mp3'), MA.prepare(ref_st, y), kbps=192)
                refs.append(pre)
                continue
            f = os.path.join(a.rec, f'{pre}_{sid}.opus')
            if os.path.exists(f):
                MA.mp3(os.path.join(a.out, 'audio', f'{sid}.{k}.mp3'), MA.prepare(ref_st, load(f)), kbps=192)
                refs.append(pre)
        if run is None:
            _, run = emu_render(sid, json.loads(a.play))
        r = rows.get(sid, {})
        bkey = BWAYS[a.b][0]
        sc = {'ceiling': r.get('ceiling', {}).get('visqol')}
        if 'visqol' in r.get(bkey, {}):
            sc['game'] = {**r[bkey], 'calls_per_tick': run['calls_per_tick'], 'kbps': run['kbps']}
        if 'visqol' in r.get('light', {}):
            sc['light'] = r['light']
        if 'emu_vs_recording' in r:
            sc['emu'] = r['emu_vs_recording']
        s = man[sid]
        songs.append({'id': sid, 'title': s['title'], 'category': s['category'], 'credit': f"{s['author']} · {s['license']}",
                      'scores': sc, 'refs': [[REFS[p][0], REFS[p][1]] for p in refs]})
        print(json.dumps({'song': sid, 'refs': refs, 'game': sc.get('game', {}).get('visqol'), 'ceiling': sc['ceiling']}), flush=True)
    which = BWAYS[a.b][1]
    data = {'songs': songs, 'credits': C.credits(),
            'notice': f'B は{which}を実機で鳴らした録音です（redroid の Android 14・Play から入れた Minecraft 1.26.60.4、録音は scrcpy の AudioPlaybackCapture 48 kHz）。'
                      'A と B は元の音に合わせて音量（RMS）と時間をそろえ、B は MP3 256 kb/s（参考は 192 kb/s）にしてあります。参考の「天井」は、元の音をそのまま OGG で'
                      'ゲームに鳴らさせて同じ録り方で録ったもの（同じクライアント・同じ録音経路でできる最良）。' + ' / '.join(devices),
            'metricNote': 'ViSQOL は v3 audio モード（公式の適合試験と 1e-13 で一致する numpy 移植）を、実行の中で録音の WAV に当てた値（実測）。'
                          '「エミュ→録音」は同じ曲を tools/emu で鳴らしたものと録音の ViSQOL（エミュレーターの較正の基準 4.5）。ViSQOL は音程の有無に'
                          'あまり反応しないので、最後の判定は ABX（耳）です。',
            'scoreLabel': 'ViSQOL（実機の録音）', 'bLabel': 'ゲーム（実機の録音）', 'v1Key': 'emu',
            'columns': ['曲', 'ABX 正解', 'p', '判定', '天井（実機）', 'B（実機）', '天井との差', 'エミュ→録音', '軽量（実機）', '命令/tick', 'kbps']}
    html = open(os.path.join(HERE, 'page.html'), encoding='utf-8').read().replace('/*DATA*/{}', json.dumps(data, ensure_ascii=False))
    html = html.replace('Spectral Player ABX', 'Spectral Player 実機 ABX')
    open(os.path.join(a.out, 'index.html'), 'w', encoding='utf-8').write(html)
    json.dump({s['id']: s['scores'] for s in songs}, open(os.path.join(a.out, 'scores.json'), 'w'), indent=1, ensure_ascii=False)
    print('->', a.out, len(songs), 'songs')


if __name__ == '__main__':
    main()
