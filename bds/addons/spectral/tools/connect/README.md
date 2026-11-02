# Spectral Connect — マイクラのまま、WebSocket だけで（/connect）

BDS も `@minecraft/server-net` も無い一人のワールドで、パソコンのページ（ラボの OreUI そのまま）かゲームの中のリモコン（GeoUI）から、
URL（yt-dlp: **権利のあるものだけ**: 自分の・CC ライセンス）かファイル（音・MIDI）を曲にして送り、鳴らす。鍵盤（MIDI 鍵盤・画面の鍵・
パソコンのキー）で弾くと、ゲームの中で楽器の音が弾いた間のまま鳴る。

## 使う

1. ワールドに **Spectral Player**（と、ゲームの中で操るなら **Spectral Remote**: bds/addons/spectral_remote）を入れ、チートを on、自分はオペレーター。
2. パソコンで `node bds/addons/spectral/tools/connect/server.mjs`（`--port 8790`・`--max 240`（秒）・`--latency 90`（ms））。URL には
   `pip install yt-dlp`。曲にするのに Python（tools/spectral.py・tools/notes.py の依存）。
3. ゲームで `/connect <パソコンのアドレス>:8790`（同じパソコンなら `localhost:8790`）。
4. ページ `http://<アドレス>:8790/`: URL かファイルの場所 → 「流す（ヘッドホン）」「その場のスピーカーで」、一時停止・頭へ・止める、鍵盤。
   チャットで `!spectral <URL か ファイル>`（`notes` を後ろに付けると MIDI として）でも。
5. ゲームの中のリモコン: `/sr:open` → 「つなぐ」→ URL の欄に焦点を当てて `/sr:t "<URL>"` → 「曲にして流す」。

## しくみ

| 道 | どう渡すか |
|---|---|
| サーバー → ゲーム | `commandRequest`（プレイヤーとして）: 曲は Spectral Player の曲パックと同じ `scriptevent spectral:song`（1800 文字ずつ、8 本ずつ）、それから `spectral:play` |
| ゲーム → サーバー | チャット（`PlayerMessage` を購読）と、リモコンの手紙: ページの欄を UTF-8・base64url にしてプレイヤーのタグ `geoui.mail.sr.<番号>.<k>.<n>.<200 文字まで>` に（bds/geoui/html の `mail:<名前>`）→ サーバーが 0.7 秒ごとに `/tag @s list` で読み、`/tag @s remove` で外す |
| サーバー → リモコン | `scriptevent sr:show ws 1`（つながった）・`sr:show st_dl / st_conv / st_send / st_play / st_fail`（段階）・`sr:value sent <割合>` |
| 鍵盤 | ページが弾いたものを `/api/notes` へすぐ送り、サーバーが 50 ms ごとに `scriptevent spectral:note @<時計>;on <鍵> <強さ> <楽器> <ms>;off …` を 1 本に。ゲームは各音をその ms だけ先に置く（素の頭の無音へ seekTo: 1 ms 単位）。束が tick を待った分は「いちばん早く着いた束」との差で引く（2 つの時計は合っていなくてよい） |

## 確かめたこと

- `node tools/connect/test.mjs`: にせのゲーム（/connect のクライアントの側）で、ハンドシェイク・購読・ページ・ファイル（MIDI・録音）・チャット・
  リモコンの手紙（分けて・二度目は鳴らさない）・段階の知らせ・鍵盤の束・OreUI の CSS を配ること・ほかのコマンドは通さないこと
- 本物の BDS: Spectral Player の tests.txt（`spectral:remote`・`spectral:note`・曲パック）、bds/addons/spectral_remote の tests.txt（15/15）
- **まだ**: 実機のクライアントの `/connect`（commandRequest でカスタムコマンドと scriptevent が通るか・PlayerMessage・タグを読む返事の形）と、
  鍵盤の遅れの実測
