# Spectral Player ライブ — 声をその場でゲームの音に（近接ボイスチャット・立体音響）

曲を前もって変換するのではなく、届いた音を 50 ms ずつその場で変換して鳴らす道です。Discord のボイスチャンネルの声を、
つないだ Minecraft のプレイヤーの位置から 3D で鳴らせます（近づくと大きく、向きで左右が変わる。音はその人に付いて動く）。

## しくみ

```
声（48 kHz）─ web/live.js LiveEncoder ─ 50 ms ごとのフレーム ─ scriptevent spectral:live {…} ─ アドオン（src/main.ts LiveStream / LivePlayer）
              （先を見ない分析: 直近 43 ms だけ）   （1 行 ~150 字、20 行/秒）                 （2 tick 後ろを鳴らす: ジッターバッファ 100 ms）
```

- **フレーム**: 声の数 N ビットのマスク（変わった声。1 秒に 1 回は全部）、その声ごとに音量の符号（bit 7 = 立ち上がり）と、
  鳴っていれば音程の符号（2 バイト、16 Hz から 0.2 セント刻み）、8 本のノイズ帯域の符号、そのフレームへのフェード（2 ビット:
  5 / 12 / 25 / 50 ms）を声と帯域の分。音量の刻みは曲の形式と同じ（0.75 dB / 0.5 dB）
- **メッセージ**: `{"id": ストリーム, "s": 最初のフレームの番号, "f": base64 のフレーム, "m": メタ（最初だけ）, "at": 場所}`、
  終わりは `{"id": …, "end": true}`。サーバーのコンソールからも（/scriptevent は 2048 字まで: 1 フレーム ~150 字）、
  ほかのパックの `system.sendScriptEvent` からも
- **場所**（`at`）: `phones:<名前>[,<名前>…]`（ヘッドホン）・`speaker:x,y,z[,ディメンション]`（その場の 3D スピーカー）・
  `follow:<名前>`（その人から 3D で。1.5 ブロック動いたら 1 tick に 8 音ずつ、1 tick のクロスフェードで付いていく）
- **遅れ**: 変換の窓 43 ms ＋ 1 フレーム 50 ms ＋ ジッターバッファ 100 ms ＋ 運ぶ時間。8 tick より遅れたら先へ飛び（遅れが
  たまらない）、4 tick 何も来なければ黙る（話し終わり）
- **音の数**: 電話は同時に 32 音（実測）。1 人 16 声＋ノイズ 8 = 24 音なので、2 人が同時に話すと足りない分は静かな音から
  ゲームが落とす（どちらの声も聞こえる）。1 人ずつなら 24 声にもできる（`--voices 24`）

## 使う

ゲームの中: `/spectral:live`（流れているストリームの一覧）・`/spectral:live <id> phones|speaker|follow|stop [誰]`・
`/spectral:live_demo <曲> [phones|speaker|follow] [誰] [声の数] [場所]`（曲をライブの道で 1 フレームずつ送る: 試し）。

ファイルを声の代わりに: `node tools/live/encoder.mjs <音声> --live <id> --at follow:<名前> --realtime`（コンソールの行を
その速さで出す）・`--song <out.song.json>`（ライブのフレームを曲にして /spectral:play・エミュレーター・実機のリグで）。

## Discord の橋渡し（tools/live/bridge.mjs）

1. Discord の開発者ページでボットを作り、トークンを `DISCORD_BOT_TOKEN` に。サーバーに招待（権限: 接続・アプリコマンド）。
   特別な intent（MESSAGE_CONTENT など）は要りません
2. `cd tools/live && npm install`（discord.js・@discordjs/voice（Discord の音声の暗号化と DAVE つき）・prism-media・opusscript）
3. サーバーをこの橋渡しから起動する: `DISCORD_BOT_TOKEN=… node tools/live/bridge.mjs --guild <サーバー ID> --channel <ボイスチャンネル ID> --bds <bedrock_server のフォルダ>`
   （自分で打つコンソールのコマンドもそのままサーバーへ）。ほかに `--stdout`（行を出すだけ）・`--lab`（bds-lab の `node lab.mjs up`）
4. Discord で各自 `/mc <ゲーマータグ>`（ボットのコマンド）: つないだ人だけがゲームで、その人の位置から聞こえる
5. 試し（Discord なし）: `node tools/live/bridge.mjs --fake <音声> --as <ゲーマータグ> --lab`

`node tools/live/test_bridge.mjs`: Discord なしで、ボイスチャンネルと同じ Opus（48 kHz ステレオ・20 ms）を同じ復号器で
ほどいて、コンソールの行（番号・メタ・場所・終わり・2048 字以内）と /mc のつなぎを確かめます。

## 質（エミュレーター = 実機の模型、推測）

ライブの変換（先を見ない、24 声）: 夏目漱石 2.92・ワーズワース 2.86（ViSQOL）。前もって変換する変換器（先も見る、合成に
よる分析の前）は 2.99・2.92、合成による分析のあとで 3.33・3.14（tools/exp/score_pack.py、tools/exp/results/live.jsonl）。
実機の数は 9 回目の run（i_ = ライブの変換を曲として、jp_ = ライブの道、jl_ / jr_ = 3D で左右）で測ります。
