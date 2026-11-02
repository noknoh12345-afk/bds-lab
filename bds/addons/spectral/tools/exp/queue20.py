#!/usr/bin/env python3
"""Twenty long real-device runs worth their time (ユーザーの依頼 11-02 18:55: 「GitHub Actions で検証したら有益そうなやつ 20 個…時間のかかる
やつ限定で有益で貴重であるものを前提に」): each a plan for tools/exp/make_app.py, written to tools/exp/queue/qNN_<name>.json, and the list
with why each is worth a run in tools/exp/queue/README.md. tools/exp/queue_run.py runs them one after another on redroid and records
what each measured (tools/exp/queue/RESULTS.md, measured/redroid-<run>.json, Discord) without stopping to judge it.
  python3 tools/exp/queue20.py"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
Q = os.path.join(HERE, 'queue')
SONGS = ['piano_gymnopedie', 'piano_chopin_op66', 'vocal_stars', 'vocal_name_of_love', 'choir_how_long', 'drums_round', 'rock_big',
         'edm_detection', 'orchestra_five_armies', 'funk_funkorama', 'speech_ja_soseki', 'speech_en_wordsworth', 'demo_selfmade']
SIX = ['speech_ja_soseki', 'vocal_name_of_love', 'orchestra_five_armies', 'rock_big', 'piano_gymnopedie', 'edm_detection']
HEAD = ["# Spectral Player の測定リグ（本物のクライアントが鳴らした音を録る）: node lab.mjs app run -a spectral --device redroid",
        "#   GitHub では Actions → redroid → Run workflow（addon: spectral, mode: run）。数はジョブのログの `[spectral rig]` の行、録音そのものは",
        "#   `audio export` が Opus にして実行の成果物の public/spectral/rec/ に公開する（鍵なし: 管理パネルでサインインして聞ける・",
        "#   notify.yml が Discord に送る・tools/rig/fetch_rec.py <run> で取る）。"]
E = {'pack': 'tools/exp/packs/run10', 'suffix': '_e', 'conv': {'pack': 'run10'}, 'export': 160}     # the shipped song data (48 voices)
TP = 'tp @s 0 -60 0 0 0'


def arm(pre, **k):
    a = {'pre': pre, **E, 'cmds': [TP]}
    a.update(k)
    return a


def ck(name):
    return [f'audio start ck_{name}', 'wait 400', 'audio stop', f'audio export ck_{name} 16']


def rec(name, play, lines, analyze=None, kbps=160):
    """a recording of its own: start, the commands and the rig's steps in between, stop, (analysis,) export (a long one at a lower
    rate so that it still goes to Discord whole: notify.yml sends files up to about 9 MB)"""
    out = [f'audio start {name}', f'do execute as @a run {play}', *lines, 'audio stop']
    if analyze:
        out.append(f'audio analyze {name} song:{analyze}')
    return out + [f'audio export {name} {kbps}']


def near(d, x=None, y=-58.5, z=0):
    return f'spectral:live_demo {{song}} near @s 24 "near:{d if x is None else x},{y},{z},overworld"'


RUNS = []


def run(name, title, why, minutes, **spec):
    RUNS.append({'name': name, 'title': title, 'why': why, 'minutes': minutes, 'spec': spec})


# 1 ---------------------------------------------------------------------------------------------------------------------------------
run('same_twice', '同じデータを 2 回（run の中のゆらぎ）', '同じ曲データを同じ run で 2 回ずつ録る。A/B のどの差が「差」と言えるかの物差し（今まで ±0.05 と見積もっていた）と、模型の誤差 0.074 がそれより大きいか', 35,
    batch=13, setup=[TP], interleave=['ra', 'rb'], arms=[arm('ra'), arm('rb')])
# 2
run('ceiling_now', '天井を今の版で（元の曲をそのまま鳴らす）', '13 曲の元の音をそのまま SoundInstance で鳴らした「これ以上は無理」の点と、同じ run の今の曲。11 回目の天井は古い版。どの曲にまだ伸びしろがあるか', 35,
    batch=13, setup=[TP], arms=[arm('e')], ceiling={'arms': [{'pre': 'c'}]})
# 3
run('phones_vs_speaker', 'ヘッドホンとスピーカー（同じ場所）', '同じ曲をヘッドホン（自分に付く）とその場のスピーカー（3D）で。3D にしただけで何が変わるか（距離 0 での 3D の処理の分）', 35,
    batch=13, setup=[TP], interleave=['hp', 'hs'], arms=[arm('hp', play='spectral:play {song} phones'), arm('hs', play='spectral:play {song} speaker')])
# 4
run('distance', '3D の距離 3・8・16・32・48 ブロック（6 曲）', 'スピーカーからの距離ごとの音質と大きさ（届く距離 48 ブロックの中の落ち方）。静かな所が 16 bit の床に沈む距離', 40,
    batch=15, setup=[TP], interleave=['d3', 'd8', 'd16', 'd32', 'd48'],
    arms=[arm(f'd{d}', songs=SIX, play=near(d)) for d in (3, 8, 16, 32, 48)])
# 5
run('direction', '3D の向き 6 方向（3 曲）', '6 ブロック先の東西南北と上下。左右の分かれ方（lr_db）と音質が向きでどう変わるか（前後・上下は今まで測っていない）', 35,
    batch=18, setup=[TP], interleave=['oe', 'ow', 'os', 'on', 'ou', 'od'],
    arms=[arm(p, songs=['speech_ja_soseki', 'vocal_name_of_love', 'orchestra_five_armies'], play=near(None, x, y, z))
          for p, x, y, z in (('oe', 6, -58.5, 0), ('ow', -6, -58.5, 0), ('os', 0, -58.5, 6), ('on', 0, -58.5, -6), ('ou', 0, -52.5, 0), ('od', 0, -64.5, 0))])
# 6
run('two_streams', '2 つの音が同時に（64 音の取り合い）', '曲を聞いている所にもう 1 つのストリーム（4 ブロック先の別の曲）。電話の 32 音を 2 つで取り合うと聞いている曲はどれだけ崩れるか（多人数のサーバー）', 35,
    batch=13, setup=[TP], interleave=['t1', 't2'],
    arms=[arm('t1'), arm('t2', **{'with': ['spectral:live_demo rock_big_e near @s 24 "near:4,-58.5,0,overworld"']})])
# 7
sec7 = []
for s in SIX:
    sec7 += rec(f'sn_{s}', f'spectral:play {s}_e', ['wait 23000'], s)
    sec7 += rec(f'so_{s}', f'spectral:play {s}_e', ['wait 3000', 'screen off', 'wait 14000', 'screen on', 'wait 6000'], s)
    sec7 += rec(f'sb_{s}', f'spectral:play {s}_e', ['wait 3000', 'background', 'wait 12000', 'foreground', 'wait 6000'], s)
run('screen_off', '画面を消す・アプリを裏へ（6 曲）', 'ボイスチャットや曲を聞きながら画面を消す・ホームに戻ると音は続くか、戻ったとき崩れないか。電話の使われ方そのもの', 30,
    setup=[TP], prep=[f"audio song {','.join(SIX)} suffix=_e pack=tools/exp/packs/run10"], arms=[], sections=[{'title': 'screen', 'lines': sec7}])
# 8
walk = [[100, f'tp @e[name=talker] {x} -60 3'] for x in ([3, 0, -3, -6, -3, 0, 3, 6] * 4)[:28]]
run('walking_talker', '歩く話し手と止まった話し手（今の版、6 曲）', '1.2.0 の歩く話し手（作り直し cut）を今の版で。止まった話し手と同じ run で比べる（23 回目は古い版）', 35,
    batch=12, setup=[TP, 'summon armor_stand talker 0 -60 3'], interleave=['ws', 'ww'],
    arms=[arm('ws', songs=SIX, play='spectral:live_demo {song} follow @s 24 "follow:talker"', cmds=[TP, 'tp @e[name=talker] 0 -60 3']),
          arm('ww', songs=SIX, play='spectral:live_demo {song} follow @s 24 "follow:talker"', cmds=[TP, 'tp @e[name=talker] 6 -60 3'], during=walk, wait=23000)])
# 9
run('long_song', '4 分 20 秒の 1 曲（13 曲を続けたもの）を通しで', '長い曲を最後まで: 途中の音切れ・ずれ・スクリプトの遅れ（曲は 20 秒の抜粋でしか測っていない）。あとで 20 秒ずつ元の曲と比べる', 30,
    setup=[TP], prep=['audio song long_all pack=tools/exp/packs/long'], arms=[],
    sections=[{'title': 'long', 'lines': rec('lg_long_all', 'spectral:play long_all', ['wait 266000'])}])
# 10
run('live_10min', 'ライブの道で 10 分（話し声と歌）', 'ボイスチャットの道（1 フレームずつ）を 10 分続ける: ジッターバッファ・ずれ・抜けが時間とともに増えないか', 35,
    setup=[TP], prep=['audio song speech_10min pack=tools/exp/packs/live10'], arms=[],
    sections=[{'title': 'live10', 'lines': rec('lv_speech_10min', 'spectral:live_demo speech_10min phones @s 24', ['wait 605000'], kbps=96)}])
# 11
sp = [('n1', ['spectral:speed 1', 'spectral:pitch 0'], 23000), ('x05', ['spectral:speed 0.5', 'spectral:pitch 0'], 44000),
      ('x15', ['spectral:speed 1.5', 'spectral:pitch 0'], 16000), ('pu5', ['spectral:speed 1', 'spectral:pitch 5'], 23000),
      ('pd5', ['spectral:speed 1', 'spectral:pitch -5'], 23000)]
run('speed_pitch', '速さ 0.5・1.5 倍と移調 ±5（4 曲）', '/spectral:speed と /spectral:pitch を実機で（一度も測っていない）。あとで元の曲を同じだけ伸ばした・ずらした音と比べる', 35,
    batch=20, setup=[TP], interleave=[p for p, _, _ in sp],
    arms=[arm(p, songs=['speech_ja_soseki', 'vocal_name_of_love', 'piano_gymnopedie', 'rock_big'], cmds=[TP, *c], wait=w) for p, c, w in sp])
# 12
run('level_12_14', 'ファイルより +10・+12・+14 dB', '今の +10 dB より上げると静かな曲は伸び、うるさい曲はクリップする: どこが一番か（+12・+14 はその大きさに合わせて変換し直したもの）', 40,
    batch=13, setup=[TP], interleave=['e', 'l12', 'l14'],
    arms=[arm('e', cmds=[TP, 'spectral:level 10 volume']),
          arm('l12', pack='tools/exp/packs/lv12', suffix='_l12', conv={'refine_level': 12}, cmds=[TP, 'spectral:level 12 volume']),
          arm('l14', pack='tools/exp/packs/lv14', suffix='_l14', conv={'refine_level': 14}, cmds=[TP, 'spectral:level 14 volume'])])
# 13
run('voices_16_20', '電話の声 16・20・24', '模型は 24 声が一番と言う: 実機でも同じか（16・20 はその数に合わせて変換し直したもの）。少ない声は命令も少ない', 40,
    batch=13, setup=[TP], interleave=['e', 'v20', 'v16'],
    arms=[arm('e', cmds=[TP, 'spectral:voices 24']),
          arm('v20', pack='tools/exp/packs/v20', suffix='_v20', conv={'refine_voices': 20}, cmds=[TP, 'spectral:voices 20']),
          arm('v16', pack='tools/exp/packs/v16', suffix='_v16', conv={'refine_voices': 16}, cmds=[TP, 'spectral:voices 16'])])
# 14
run('spz2_coarse', '曲テキストの格子を粗く（大きさ 3 dB・音程 20 セント・ノイズ 1.5 dB）', '聞き分けられなければ貼り付けのテキストをさらに短くできる（33 回目の今の格子と同じ run で）', 35,
    batch=13, setup=[TP], interleave=['z', 'zc'],
    arms=[arm('z', pack='tools/exp/packs/spz2', suffix='_z', conv={'pack': 'spz2'}), arm('zc', pack='tools/exp/packs/spz2c', suffix='_zc', conv={'pack': 'spz2c'})])
# 15
run('light_mode', '軽量モード（16 声・命令 24/tick 以下）と既定', 'Realms・人の多いサーバー向けの軽量モードを今の版で（4〜6 回目に古い版で測っただけ）', 35,
    batch=13, setup=[TP], interleave=['mq', 'ml'],
    arms=[arm('mq', cmds=[TP, 'spectral:mode quality']), arm('ml', cmds=[TP, 'spectral:mode light'])])
# 16
run('rain_mobs', '雨と動物の音がある中で', '本当のワールドでは雨・動物・足音も同じ 32 音を使う: それらがあると曲はどれだけ崩れるか', 35,
    batch=13, setup=[TP], interleave=['wc', 'wr'],
    arms=[arm('wc', cmds=[TP, 'weather clear', 'kill @e[type=cow]', 'kill @e[type=chicken]']),
          arm('wr', cmds=[TP, 'weather rain', 'kill @e[type=cow]', 'kill @e[type=chicken]', 'summon cow 3 -60 3', 'summon cow -3 -60 3', 'summon chicken 2 -60 -2', 'summon chicken -2 -60 -2'])])
# 17
run('bgm_on', 'ゲームの BGM を鳴らしたまま（音楽 0.5）', 'リグはいつも BGM を 0 にしている: 遊ぶ人の多くは BGM が鳴っている。BGM と一緒だと点はどうなるか（同じ曲を別の run と比べる）', 30,
    batch=13, setup=[TP], bgm=0.5, arms=[arm('bm')])
# 18
run('loop_5min', '1 曲をループで 5 分', '/spectral:loop で同じ曲を 15 周: 周の継ぎ目と、時間が経っても音が崩れないか', 25,
    setup=[TP], prep=['audio song vocal_name_of_love suffix=_e pack=tools/exp/packs/run10'], arms=[],
    sections=[{'title': 'loop', 'lines': ['do execute as @a run spectral:stop', *rec('lp_vocal_name_of_love', 'spectral:loop', ['do execute as @a run spectral:play vocal_name_of_love_e', 'wait 300000', 'do execute as @a run spectral:stop', 'do execute as @a run spectral:loop'])]}])
# 19
sec19 = []
for s in SIX:
    sec19 += rec(f'ps_{s}', f'spectral:play {s}_e', ['wait 5000', 'do execute as @a run spectral:pause', 'wait 2000', 'do execute as @a run spectral:pause',
                                                       'wait 3000', 'do execute as @a run spectral:seek 2', 'wait 4000', 'do execute as @a run spectral:seek 15', 'wait 6000'])
run('pause_seek', '一時停止・再開・シーク（6 曲）', 'リモコンの一時停止と ±10 秒を実機で: 継ぎ目のプツッ・音が戻るまでの時間', 25,
    setup=[TP], prep=[f"audio song {','.join(SIX)} suffix=_e pack=tools/exp/packs/run10"], arms=[], sections=[{'title': 'pause', 'lines': sec19}])
# 20
sec20 = []
for s in SIX:
    sec20 += rec(f'mn_{s}', f'spectral:play {s}_e', ['wait 23000'], s)
    sec20 += rec(f'mt_{s}', f'spectral:play {s}_e', ['wait 4000', 'trim RUNNING_CRITICAL', 'wait 4000', 'trim RUNNING_LOW', 'wait 15000'], s)
run('memory_pressure', 'メモリが足りないとき（trim memory）', '安い電話ではメモリが足りなくなると OS がアプリに減らせと言う: そのとき音は途切れるか', 30,
    setup=[TP], prep=[f"audio song {','.join(SIX)} suffix=_e pack=tools/exp/packs/run10"], arms=[], sections=[{'title': 'memory', 'lines': sec20}])


def main():
    os.makedirs(Q, exist_ok=True)
    rows = ['# 実機で測る 20 本（redroid のスマホ版、1 本 25〜40 分）', '',
            'ユーザーの依頼（11-02 18:55）「GitHub Actions で検証したら有益そうなやつ 20 個用意してそれぞれ考えずに記録して ただし時間のかかるやつ限定で有益で',
            '貴重であるものを前提に」。tools/exp/queue20.py が作り、tools/exp/queue_run.py が上から順に 1 本ずつ走らせて、測れたものを RESULTS.md・',
            'measured/redroid-<run>.json・Discord にそのまま記録する（1 本ごとには判断しない）。手元の模型で決められない・実機でしか分からないものに絞った。', '',
            '| # | 名前 | 何を測るか | なぜ実機で | 分 |', '|---|---|---|---|---|']
    for i, r in enumerate(RUNS, 1):
        spec = {'header': HEAD + [f'# キュー {i:02d}（tools/exp/queue/q{i:02d}_{r["name"]}.json）: {r["title"]}。{r["why"]}'], **r['spec']}
        spec.setdefault('arms', [])
        json.dump(spec, open(os.path.join(Q, f'q{i:02d}_{r["name"]}.json'), 'w'), ensure_ascii=False, indent=1)
        rows.append(f'| {i} | {r["name"]} | {r["title"]} | {r["why"]} | {r["minutes"]} |')
    open(os.path.join(Q, 'README.md'), 'w').write('\n'.join(rows) + '\n')
    print(len(RUNS), 'plans')


if __name__ == '__main__':
    main()
