#!/usr/bin/env python3
"""Listening files and the ABX page for the test songs.

  python3 tools/abx/make_abx.py [--songs a,b] [--out dist/abx]

For every song of corpus/manifest.json:
  orig.mp3    the original MP3 excerpt (its own frames, untouched)
  game.mp3    what the game plays NOW: the song converted (tools/spectral.py, analysis v2), handed to the real add-on
              bundle as a song pack in the recording mock (tools/sim/run_song.mjs), and the command log played by the
              client emulator (tools/emu/client.py, with tools/emu/spec.json: assumed until the rig measures a client).
              NOT a recording of a real client until tools/rig has run: the page says so, and takes real recordings
              (drop <id>.wav/.mp3/.ogg on it) in place of these.
  v1.mp3      the same with the first converter (analysis v1), for hearing what changed
  light.mp3   v2 in light mode (16 voices, <= 24 commands per tick)
Level matched to the original (RMS) and time aligned (ViSQOL's global alignment), MP3 320 kb/s.
Scores of the same renders (ViSQOL v3 port and the auxiliary metrics) go into the page and into scores.json.
"""
import argparse, base64, json, math, os, shutil, subprocess, sys, tempfile
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(UNIT, 'tools')); sys.path.insert(0, os.path.join(UNIT, 'tools', 'metrics')); sys.path.insert(0, os.path.join(UNIT, 'tools', 'emu'))
import corpus as C, spectral as S, metrics as MT, client as E
import warnings; warnings.filterwarnings('ignore')

CACHE = os.path.join(UNIT, 'corpus', 'renders', 'abx')


def song_json(song, analysis):
    p = os.path.join(CACHE, f'{song}.{analysis}.song.json')
    if not os.path.exists(p):
        x, meta, blob, stats = S.convert(C.excerpt_path(song), 48, title=song, artist='corpus', analysis=analysis)
        meta['id'] = song
        json.dump({'meta': meta, 'data': base64.b64encode(blob).decode(), 'stats': {k: (v if not isinstance(v, (np.floating, np.integer)) else float(v)) for k, v in stats.items()}},
                  open(p, 'w'), separators=(',', ':'))
    return p


def game_render(song, analysis, mode='quality'):
    """the bundle in the mock -> command log -> client emulator: (48 kHz stereo, calls per tick)"""
    wav = os.path.join(CACHE, f'{song}.{analysis}.{mode}.wav')
    info = os.path.join(CACHE, f'{song}.{analysis}.{mode}.json')
    if not os.path.exists(wav):
        sj = song_json(song, analysis)
        r = subprocess.run(['node', os.path.join(UNIT, 'tools', 'sim', 'run_song.mjs'), sj, mode], check=True, capture_output=True, text=True, cwd=UNIT)
        run = json.loads(r.stdout.strip().split('\n')[-1])
        log = json.load(open(os.path.join(UNIT, run['out'])))
        os.remove(os.path.join(UNIT, run['out']))
        y = E.render(log)
        start = min(e[1] for e in log if e[0] in ('fade', 'vol'))          # the song starts where the voices first move
        y = y[start * 2400:]
        from scipy.io import wavfile
        wavfile.write(wav, 48000, y.astype(np.float32))
        json.dump(run, open(info, 'w'))
    from scipy.io import wavfile
    _, y = wavfile.read(wav)
    return np.asarray(y, np.float64), json.load(open(info))


def mp3(path, y, sr=48000, kbps=256):
    from scipy.io import wavfile
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, 'a.wav')
        wavfile.write(w, sr, np.clip(y, -1, 1).astype(np.float32))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], check=True)


def page(out, scores):
    man = C.manifest()
    ceil = {}
    cp = os.path.join(UNIT, 'corpus', 'results', 'ceiling_ogg8.json')
    if os.path.exists(cp):
        ceil = {k: v['visqol'] for k, v in json.load(open(cp)).items()}
    songs = []
    for s in man['songs']:
        if s['id'] not in scores:
            continue
        sc = dict(scores[s['id']]); sc['ceiling'] = ceil.get(s['id'])
        songs.append({'id': s['id'], 'title': s['title'], 'category': s['category'],
                      'credit': f"{s['author']} · {s['license']}", 'scores': sc})
    data = {'songs': songs, 'credits': C.credits(),
            'notice': 'いまの B は実機の録音ではなく、エミュレーターの出力です（変換器 v2 → 曲パック → 実際のアドオンを模擬サーバーで動かした命令列 → '
                      'RP の実ファイルを鳴らすクライアントの模型。模型の挙動は実機で未測定の「仮定」）。実機の録音を下の枠に落とすと、その曲の B が録音に替わります。',
            'metricNote': 'ViSQOL は v3 audio モード（公式の適合試験と 1e-13 で一致する numpy 移植）。天井 = 元の音を OGG q8 にしてそのまま鳴らしたもの。'
                          'すべてエミュレーター上の値で、実機の値ではありません。ViSQOL は音程の有無にあまり反応しないので、最後の判定は ABX（耳）です。'}
    html = open(os.path.join(HERE, 'page.html')).read().replace('/*DATA*/{}', json.dumps(data, ensure_ascii=False))
    open(os.path.join(out, 'index.html'), 'w').write(html)


def prepare(ref_st, y):
    """y (stereo) aligned to the reference and matched to its RMS, cut to its length"""
    ref = ref_st.mean(1)
    m = y.mean(1)
    _, lag = MT.V.globally_align(ref, m, 48000)
    k = int(round(lag * 48000))
    if k > 0:
        y = np.concatenate([np.zeros((k, 2)), y])
    elif k < 0:
        y = y[-k:]
    n = len(ref_st)
    y = y[:n] if len(y) >= n else np.concatenate([y, np.zeros((n - len(y), 2))])
    g = math.sqrt(np.mean(ref_st ** 2) / max(1e-20, np.mean(y ** 2)))
    return y * g


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--songs'); ap.add_argument('--out', default=os.path.join(UNIT, 'dist', 'abx'))
    ap.add_argument('--no-scores', action='store_true')
    a = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True); os.makedirs(os.path.join(a.out, 'audio'), exist_ok=True)
    man = C.manifest()
    songs = [s for s in man['songs'] if not a.songs or s['id'] in a.songs.split(',')]
    scores_path = os.path.join(a.out, 'scores.json')
    scores = json.load(open(scores_path)) if os.path.exists(scores_path) else {}
    for s in songs:
        i = s['id']
        ref_st = C.load(i, 48000, stereo=True)
        shutil.copy(C.excerpt_path(i), os.path.join(a.out, 'audio', f'{i}.orig.mp3'))
        row = scores.get(i, {})
        for name, analysis, mode in (('game', 'v2', 'quality'), ('v1', 'v1', 'quality'), ('light', 'v2', 'light')):
            y, run = game_render(i, analysis, mode)
            yp = prepare(ref_st, y)
            mp3(os.path.join(a.out, 'audio', f'{i}.{name}.mp3'), yp, kbps=256 if name == 'game' else 192)
            if not a.no_scores and name not in row:
                r = MT.report(ref_st.mean(1), y.mean(1))
                r['calls_per_tick'] = run['calls_per_tick']
                sj = json.load(open(song_json(i, analysis)))
                r['kbps'] = round(len(base64.b64decode(sj['data'])) * 8 / sj['meta']['seconds'] / 1000, 2)
                row[name] = r
            print(json.dumps({'song': i, 'version': name, **row.get(name, {})}), flush=True)
        scores[i] = row
        json.dump(scores, open(scores_path, 'w'), indent=1)
        page(a.out, scores)
    page(a.out, scores)
    print('->', a.out)


if __name__ == '__main__':
    main()
