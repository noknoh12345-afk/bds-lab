# geoui_web_ws — ゲームの中のウェブ（WebSocket 版: どのワールドでも）

## Request
@minecraft/server-net（BDS だけにある）が無いワールド — スマホや PC のワールド、Realm、ほかのサーバー — でも、ゲームの中で Chrome のように
ウェブを使う。外との通り道はゲーム自身の WebSocket（/connect）。作り方: `node bds/geoui/web/make.mjs`（このフォルダはそれが書く。手で直さない）。

## 使い方
1. PC で `node bds/geoui/web/server.mjs`（Chromium のサービス。最初に Playwright を入れる）。表示される「/connect <アドレス>:8787」を覚える。
2. ワールドにこのアドオンを入れる（チートを有効に）。ゲームの設定の「暗号化された WebSocket を必須にする」はそのままでよい（サービスが暗号化する）。
3. ゲームで `/connect <PC のアドレス>:8787` → `/web:open`。あとは geoui_web と同じ（頭の向きがポインタ、振るとクリック、/web:t で文字）。
   チャットで ! から始めた文字はページに打たれる（!! で Enter）。画面の形は開いた時にゲームが測る（/web:size・/web:fit でも）。
