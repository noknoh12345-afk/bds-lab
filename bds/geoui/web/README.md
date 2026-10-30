# GeoUI Web — ゲームの中のウェブ（どのサイトも、Chrome のように）

マイクラ統合版の中で、本物の Chromium が開いたページを全画面に出して操作します。HUD・腕・持ち物は消え（F1。ゲームモードは
変えません）、ページとツールバー（タブ・戻る・進む・再読み込み・ホーム・アドレス欄・✕）は **URL の画像**（JSON UI の
`profile_image_renderer` の `{"type":7,"url":…}`）、ポインタは GeoUI の板です。動くサイト・スクリプトで描くサイト（YouTube・
地図・SNS…）も、Chromium が動かしたものをそのまま出します。仕組みと本物のアプリで測ったことは [../SPEC.md](../SPEC.md) 17 章・
[../RULES.md](../RULES.md) 10 章。

```
 ┌──────── マイクラ（端末）────────┐        ┌──────────── サーバーの機械 ────────────┐
 │ HUD の JSON UI: 題名の文字から URL │◀─絵──│ server.mjs（:8787）  engine.mjs: Chromium │
 │ を取り出し、その絵を取りに行く     │       │   ▲ 操作（@minecraft/server-net）      │
 │ 視点・攻撃・ジャンプ・スニーク… ──┼──────▶│ BDS + geoui_web（runtime.js）           │
 └───────────────────────────────────┘ 題名  └─────────────────────────────────────────┘
```

## 使う（ラボで）

`bds/addons/geoui_web`（`node bds/geoui/web/make.mjs` が作る）は `geoui-web.json` を持つので、ラボが BDS を起こすとき横にサービスを
起こします（`node lab.mjs bds up -a geoui_web`・`bds go`・`app run`）。サービスは 1 時間使われないと自分で終わります。

## 使う（自分のサーバーで）

1. Node 22 と Chrome（か Chromium）を入れる。Playwright が無ければ、初回に自分で取りに行きます。
2. `node bds/geoui/web/server.mjs`（既定でポート 8787。`--public http://<この機械の LAN のアドレス>:8787` は、空けると自分で探します）。
3. BDS の `config/default/permissions.json` の `allowed_modules` に `@minecraft/server-net` を足し、`geoui_web` の 2 つのパックを入れる。
4. 端末（携帯・PC）は、その機械に LAN で届くこと（同じ Wi-Fi）。Android のゲームは LAN の http の絵を取りに行く（測った: RULES R10.2）。
   外から遊ぶ人と、平文の http を取りに行かない端末（iPhone・iPad は App Transport Security で断る見込み: 未確認）には https の入り口:
   `GEOUI_WEB_TUNNEL=1` でラボが cloudflared の一時的な入り口（`https://….trycloudflare.com`）を作る → ゲームで `/web:public tunnel`
   （https のトンネルの絵も Android で出た: run 40998593826）。

## 操作

| 入力 | ブラウザでは |
|---|---|
| 視点（マウス・画面をなぞる・右スティック） | ポインタ（矢印）を動かす（ホバーも届く） |
| 攻撃（左クリック・長押し・RT） | クリック |
| ジャンプ（Space・A・ジャンプボタン） | ボタンを押したまま（離すと離す: ドラッグ・選択） |
| スニーク（短く） / 1.5 秒 | 戻る / ブラウザを閉じる |
| W / S（スティック・十字キー）・A / D | 上下・左右にスクロール |
| ホットバーを替える（ホイール・数字キー・LB/RB） | ホイール |
| `/web:t 言葉…`（8 語まで、引用符なしで） | 文字を打つ（検索の欄なら Enter も） |
| `/web:go 言葉か URL`・`/web:open "https://…"` | 開く（URL は `"` で囲むか、`example.com` のように https:// なしで） |
| `/web:key Enter`・`/web:enter`・`/web:back`・`/web:forward`・`/web:reload`・`/web:home` | キー・移動 |
| `/web:tab 2`・`/web:newtab`・`/web:closetab`・`/web:zoom 150` | タブ・拡大 |
| `/web:size 20:9`・`/web:size 2400x1080`・`/web:res 720` | 画面の形（16:9・4:3・16:10・18:9・19.5:9・20:9・21:9・32:9）と絵の高さ（既定は本物の解像度 1080 px: 20:9 なら 2400 x 1080。軽くするなら 720） |
| `/web:f1 on` / `off` | F1 だけ（ブラウザなし）: HUD・腕・持ち物を消す |

携帯は最初から 20:9、ほかは 16:9 で開きます（`/web:size` で変えたものは覚えます）。絵は高さ 1080 px（本物の解像度）。
携帯（タッチ）では、F1 でも操作ボタンと会話は残します（操作ボタンは HUD の `root_panel` の中にあるので: SPEC 17 章）。
F1 の間はカメラを目の所の 3 人称（パックのプリセット `gweb:eye`）に替えます: 1 人称の持ち物はボーンでは消せないため（RULES R10.13）。
向きは右スティック・マウスでそのまま変わります（`LockedPlayerRelativeStrafe`）。
題名（タイトル）は通り道に使いますが、ほかのパックやコマンドの普通の題名も出るようにしています（ゲームの題名の部品には触らず、それを作る
`hud_title_text_area` を「通り道の間だけ隠す」パネルに置き換える。本物のアプリでの確かめは SPEC 17 章の 5 本目）。

## 守り

- サーバーの中の場所（127.0.0.1・10.x・172.16-31.x・192.168.x・*.local…）は開きません（`GEOUI_WEB_ALLOW_PRIVATE=1` で開く）。
  サービス自身の `/demo/` だけは開けます。
- 操作（`POST /s…`）は同じ機械（BDS）からだけ。トンネル・プロキシを通った頼みは断ります（`--key` を付ければ鍵で）。
- 絵の URL は 1 人ずつのランダムな番号（128 bit）を含みます。人ごとに別のブラウザ（クッキーも別）。

## ファイル

| ファイル | 中身 |
|---|---|
| `engine.mjs` | Chromium（Playwright）: 人ごとの場所・タブ・操作・番号付きの絵・Chrome に似せたツールバー |
| `server.mjs` | サービス（HTTP）: 操作・絵・長く待つ問い（`/next`）・確かめ用の絵（`/solid` `/quad` `/noise` `/count` `/slow`）・取りに来た記録（`/hits`） |
| `lab.mjs` | ラボが BDS の横にサービスを起こす（`GEOUI_WEB_HOST`・トンネル） |
| `runtime.js` | パックの中のブラウザ（入力 → 操作、二重の枠、題名の通り道） |
| `make.mjs` | `bds/addons/geoui_web` を作る（画面の形ごとの並べ方・ポインタ・試験・アプリの手順） |
| `probe.mjs` | 本物のアプリで URL の画像と F1 を測る探り（`bds/addons/geoui_web_probe`） |
| `demo/` | 確かめのページ（スタート・色・動く・フォーム・長い・タブ） |
