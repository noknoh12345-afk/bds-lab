#!/usr/bin/env python3
"""The sampler on the real device (the user's request 11-02 19:53 / 23:55: MIDI past the tick, to the millisecond): note songs
made for measuring (tools/exp/packs/notes) and the plan tools/exp/queue/p01_sampler.json (queue_run.py runs p* plans first).

  clicks_pairs  8 pairs of clicks, the second k = 1, 2, 3, 5, 8, 13, 21, 34 ms after the first (the first at a different place in
                its tick each time): do two notes of one bundle keep a 1 ms distance?
  clicks_pulse  60 clicks 37 ms apart (never on the tick): how even, placed in bundles of 4, of 1, and bound to the tick
  fur_elise     Für Elise (Beethoven, public domain; transcribed here), its first 16 bars: the piano placed against tick-bound
  piano_demo    the built-in étude (src/songs/notes_demo.ts)
The expected onsets (ms) go beside each song in <id>.onsets.json; tools/exp/sampler_score.py reads the recordings against them.
  python3 tools/exp/sampler_plans.py"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
UNIT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(UNIT, 'tools'))
import notes as N
from make_note_demo import k

PACK = os.path.join(HERE, 'packs', 'notes')
CLICK = 34                                  # the bank's click (src/bank.ts DRUMS: GM key 34)


def clicks_pairs():
    out, t = [], 1000.0
    for i, d in enumerate([1, 2, 3, 5, 8, 13, 21, 34]):
        t0 = t + (i * 17) % 50                       # a different place in the tick each time
        out += [(t0, 20, CLICK, 110, 128), (t0 + d, 20, CLICK, 110, 128)]
        t += 700
    return out


def clicks_pulse():
    return [(500 + i * 37.0, 15, CLICK, 110, 128) for i in range(60)]


def fur_elise():
    """bars 1-16 (A section twice, the second ending), 3/8, a sixteenth 150 ms; right hand and the left hand's broken chords"""
    S = 150.0
    rh, lh = [], []
    pick = ['E5', 'D#5']
    motif = ['E5', 'D#5', 'E5', 'B4', 'D5', 'C5']
    t = 0.0
    def r(names, at, dur=S, v=80):
        nonlocal rh
        for j, n in enumerate(names):
            rh.append((at + j * S, dur, n, v))
    def l(names, at, v=60):
        for j, n in enumerate(names):
            lh.append((at + j * S, S * 1.6, n, v))
    r(pick, t); t += 2 * S
    for rep in range(2):
        r(motif, t); t += 6 * S
        rh.append((t, 2 * S, 'A4', 84)); l(['A2', 'E3', 'A3'], t); r(['C4', 'E4', 'A4'], t + 2 * S, v=74); t += 6 * S
        rh.append((t, 2 * S, 'B4', 84)); l(['E2', 'E3', 'G#3'], t); r(['E4', 'G#4', 'B4'], t + 2 * S, v=74); t += 6 * S
        rh.append((t, 2 * S, 'C5', 86)); l(['A2', 'E3', 'A3'], t); r(['E4', 'E5', 'D#5'], t + 2 * S, v=76); t += 6 * S
        r(motif, t); t += 6 * S
        rh.append((t, 2 * S, 'A4', 84)); l(['A2', 'E3', 'A3'], t); r(['C4', 'E4', 'A4'], t + 2 * S, v=74); t += 6 * S
        rh.append((t, 2 * S, 'B4', 84)); l(['E2', 'E3', 'G#3'], t)
        if rep == 0:
            r(['E4', 'C5', 'B4'], t + 2 * S, v=76); t += 6 * S
            rh.append((t, 4 * S, 'A4', 84)); l(['A2', 'E3', 'A3'], t); t += 4 * S
            r(pick, t); t += 2 * S
        else:
            r(['E4', 'C5', 'B4'], t + 2 * S, v=76); t += 6 * S
            rh.append((t, 6 * S, 'A4', 80)); l(['A2', 'E3', 'A3'], t); t += 6 * S
    notes = [(s, d, k(n), v, 0) for s, d, n, v in rh + lh]
    return sorted(notes, key=lambda x: (x[0], x[2]))


def rec(name, setup, play, wait_ms):
    return [*[f'do execute as @a run {c}' for c in setup], f'audio start {name}', f'do execute as @a run {play}',
            f'wait {wait_ms}', 'do execute as @a run spectral:stop', 'audio stop', f'audio export {name} 192']


def main():
    os.makedirs(PACK, exist_ok=True)
    songs = {'clicks_pairs': ('Clicks in pairs 1-34 ms apart', clicks_pairs()), 'clicks_pulse': ('Clicks 37 ms apart', clicks_pulse()),
             'fur_elise': ('Für Elise (Beethoven), bars 1-16', fur_elise())}
    for sid, (title, notes) in songs.items():
        song = N.encode(notes, sid, title, 'Spectral Player (measuring)' if sid.startswith('clicks') else 'Beethoven')
        json.dump(song, open(os.path.join(PACK, f'{sid}.song.json'), 'w'), separators=(',', ':'))
        json.dump([round(n[0], 3) for n in N.decode(song)], open(os.path.join(PACK, f'{sid}.onsets.json'), 'w'))
        print(sid, len(notes), 'notes', song['meta']['seconds'], 's')
    S = 'spectral:sampler'
    lines = []
    for b, tag in ((4, 'b4'), (0, 'b0')):
        lines += rec(f'pp_{tag}', [f'{S} {b} 250 28 120'], 'spectral:play clicks_pairs', 7500)
    for b, tag in ((4, 'b4'), (1, 'b1'), (0, 'b0')):
        lines += rec(f'pu_{tag}', [f'{S} {b} 250 28 120'], 'spectral:play clicks_pulse', 3800)
    lines += rec('p3_b4', [f'{S} 4 250 28 120'], 'spectral:play clicks_pairs speaker', 7800)
    lines += rec('u3_b4', [f'{S} 4 250 28 120'], 'spectral:play clicks_pulse speaker', 4100)
    for b, tag in ((4, 'b4'), (0, 'b0')):
        lines += rec(f'fe_{tag}', [f'{S} {b} 250 28 120'], 'spectral:play fur_elise', 15500)
        lines += rec(f'pd_{tag}', [f'{S} {b} 250 28 120'], 'spectral:play piano_demo', 22500)
    lines += [f'do execute as @a run {S} 4 250 28 120']
    head = ["# Spectral Player の測定リグ（本物のクライアントが鳴らした音を録る）: node lab.mjs app run -a spectral --device redroid",
            "#   GitHub では Actions → redroid → Run workflow（addon: spectral, mode: run）。録音そのものは `audio export` が Opus にして",
            "#   実行の成果物の public/spectral/rec/ に公開する（notify.yml が Discord に送る・tools/rig/fetch_rec.py <run> で取る）。",
            "# p01（tools/exp/queue/p01_sampler.json、tools/exp/sampler_plans.py）: サンプラー（MIDI を楽器の音で）を実機で。seekTo で tick の中に"
            "1 ms で置けるか（クリックの 2 発・37 ms の連打、束ねる 4 / 1 / tick に縛る、ヘッドホンと 3D）、ピアノ（エリーゼのために・エチュード）を置く／tick に縛る"]
    plan = {'header': head, 'arms': [], 'setup': ['tp @s 0 -60 0 0 0'],
            'prep': ["audio song clicks_pairs,clicks_pulse,fur_elise pack=tools/exp/packs/notes"],
            'sections': [{'title': 'sampler', 'lines': lines}]}
    json.dump(plan, open(os.path.join(HERE, 'queue', 'p01_sampler.json'), 'w'), ensure_ascii=False, indent=1)
    print('plan p01_sampler:', sum(1 for x in lines if x.startswith('audio export')), 'recordings')


SENTENCES = {'speech_hello': 'こんにちは、私はマインクラフトの中で話しています。',
             'speech_weather': '今日はいい天気ですね。一緒に遊びましょう！',
             'speech_cave': '東の森に、ダイヤモンドの洞窟があるらしいよ。',
             'speech_piano': 'このピアノの音は、本物の楽器を録音したものです。'}


def p02(work):
    """p02: speech by the voice's units (headphones, speaker) against the same speech through the sine engine (what the voice
    chat path plays today), and the étude by the sampler against the étude through the sine engine. References in `work`"""
    import subprocess
    sys.path.insert(0, os.path.join(UNIT, 'tools'))
    import speech as SP
    B = N.bank(); vs = N.voices(B)
    os.makedirs(work, exist_ok=True)
    ids = []
    for sid, text in SENTENCES.items():
        notes = SP.plan(SP.morae(text), vs[0], prog=200)
        song = N.encode(notes, sid, text, 'Spectral Player (speech)')
        json.dump(song, open(os.path.join(PACK, f'{sid}.song.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
        ref = os.path.join(work, f'{sid}.wav')
        N.render(N.decode(song), ref, master=1.0)
        ids.append(sid)
    demo = json.loads(open(os.path.join(UNIT, 'src', 'songs', 'notes_demo.ts')).read().split('export default ', 1)[1].rstrip().rstrip(';'))
    N.render(N.decode(demo), os.path.join(work, 'piano_demo.wav'))
    # the same through the sine engine: the converter's default (48 voices; the phone plays 24 of them)
    for sid in ids + ['piano_demo']:
        out = os.path.join(PACK, f'{sid}_sine.song.json')
        subprocess.run(['python3', os.path.join(UNIT, 'tools', 'spectral.py'), os.path.join(work, f'{sid}.wav'), '--voices', '48',
                        '--id', f'{sid}_sine', '--title', f'{sid} (sine)', '--out', out[: -len('.song.json')]], check=True, capture_output=True)
        if not os.path.exists(out) and os.path.exists(out + '.song.json'):
            os.rename(out + '.song.json', out)
    S = 'spectral:sampler'
    lines = [f'do execute as @a run {S} 4 250 28 120']
    for sid in ids:
        lines += rec(f'sv_{sid}', [], f'spectral:play {sid}', 6500)
        lines += rec(f'ss_{sid}', [], f'spectral:play {sid}_sine', 6500)
    lines += rec('sv3_speech_hello', [], 'spectral:play speech_hello speaker', 6800)
    lines += rec('pv_piano_demo', [], 'spectral:play piano_demo', 22500)
    lines += rec('ps_piano_demo', [], 'spectral:play piano_demo_sine', 22500)
    head = ["# Spectral Player の測定リグ: node lab.mjs app run -a spectral --device redroid（Actions → redroid、addon: spectral, mode: run）。",
            "# p02（tools/exp/sampler_plans.py p02）: 声の素片（MIDI と同じ原理の読み上げ、Kokoro-82M の声）を ヘッドホン・3D で、同じ話を正弦波の道で。",
            "# ピアノのエチュードをサンプラーと正弦波の道で。録音を手元の Whisper で聞き取り（文字の誤り率）と ViSQOL（手元の参照と）"]
    songs = ','.join(ids + [f'{x}_sine' for x in ids] + ['piano_demo_sine'])
    plan = {'header': head, 'arms': [], 'setup': ['tp @s 0 -60 0 0 0'], 'prep': [f'audio song {songs} pack=tools/exp/packs/notes'],
            'sections': [{'title': 'speech', 'lines': lines}]}
    json.dump(plan, open(os.path.join(HERE, 'queue', 'p02_speech_piano.json'), 'w'), ensure_ascii=False, indent=1)
    print('plan p02_speech_piano:', sum(1 for x in lines if x.startswith('audio export')), 'recordings')


def p03():
    """p03: the recording itself as a phone can play it (24 kHz: nothing above 12 kHz to fold) against the same at 48 kHz (the
    ceiling of q02, which scored under the sine engine's songs) and the sine engine — 13 songs each, one run"""
    head = ["# Spectral Player の測定リグ: node lab.mjs app run -a spectral --device redroid（Actions → redroid、addon: spectral, mode: run）。",
            "# p03（tools/exp/sampler_plans.py p03）: 元の曲をそのまま鳴らす（ファイルの曲）を 24 kHz（電話の混ぜ方: 12 kHz より上が無いので折り返さない）と",
            "# 48 kHz（q02 の天井: 正弦波の曲より低かった）で、同じ run の正弦波の道（e）と。13 曲ずつ"]
    plan = {'header': head, 'setup': ['tp @s 0 -60 0 0 0'], 'batch': 13,
            'arms': [{'pre': 'e', 'pack': 'tools/exp/packs/run10', 'suffix': '_e', 'conv': {'pack': 'run10'}, 'export': 160, 'cmds': ['tp @s 0 -60 0 0 0']}],
            'ceiling': [{'unit': 'spectral_ceil', 'arms': [{'pre': 'c'}]}, {'unit': 'spectral_ceil24', 'arms': [{'pre': 'f'}]}]}
    json.dump(plan, open(os.path.join(HERE, 'queue', 'p03_file_songs.json'), 'w'), ensure_ascii=False, indent=1)
    print('plan p03_file_songs')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'p03':
        p03()
    elif len(sys.argv) > 1 and sys.argv[1] == 'p02':
        p02(sys.argv[2] if len(sys.argv) > 2 else '/tmp/sampler_refs')
    else:
        main()
