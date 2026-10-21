# geoui_bb — GeoUI Builder の書き出し（Studio のひな形「スコア＆ゲージ」を Blockbench で作り直したもの）

## Request
GeoUI Builder（Blockbench プラグイン bds/geoui/geoui_builder.js）で GeoUI Studio v10.1 のひな形「スコア＆ゲージ」を作り直した書き出し。
BP のプロパティ・コマンド・スコア同期が本物の BDS で仕様どおりか、Studio の不具合（geoui_studio の【不具合】の節）が無いかを確かめる。
描画（RP）は本物のアプリ（app.txt）と、Studio の書き出しとの式の突き合わせ（tests/geoui-builder-offline.mjs、Blockbench での描画: bds/geoui/README.md）。

(a person's addon, imported from geoui_bb.mcaddon: keep its pack names and UUIDs, so their worlds update in place)

## What it is
- RP: 数字（5桁・Studio の l1.png）とゲージ（Studio の l2.png、左から伸びる）を、GeoUI Studio と同じ式（画面の高さ 176 単位・中心のずれ・画面比の項）で HUD に描く。
  player.entity.json は現行バニラ（1.26.50）に GeoUI を足したもの。HUD は root_panel に足す（hud_content は置き換えない）。
- BP: player.json は現行バニラ（1.26.50）に client_sync のプロパティ11個。スクリプトは画面比と中心を端末の種類から決め、型付きのコマンドで値を書く。

## Acceptance (one tests.txt `## ` section each)
- [x] 読み込める（プロパティ11個がすべて既定値。画面比と中心は端末の種類から）
- [x] player.json は現行バニラ（1.26.50）のまま: 満腹度と襲撃の予兆がバニラと同じ
- [x] ワールドにスコアボードの目的を勝手に作らない
- [x] 数値はそのまま書ける（引数が整数型）
- [x] alpha 0 は 0（見えなくなる）
- [x] 範囲外の値は理由を言って断り、前の値のまま
- [x] 画面の大きさから画面比を決められる（2340x1080 → 2167）
- [x] プロパティはプレイヤーごと（A の値は B に移らない）
- [x] スコアボード geoui_v0 を作れば、値が2tick以内にプロパティへ写る（float32 で正確な ±2^24 に収める）
- [x] scriptevent で値を書ける（コンソールからは全員に）
- [x] 抜けて入り直しても、自分で変えた alpha・scale・画面比はそのまま
- [x] スクリプトの再読込（/reload）でもそのまま
- [x] サーバーを再起動してもそのまま
- [x] /geoui:reset で端末の既定に戻る

## Not proven here (needs the real app: app.txt)
- HUD に数字とゲージが描かれ、画面比を変えても左上から 1.2 単位に吸い付く・値が描画に届く・scale 50 で全体が中心へ縮む

## Do not
- change bp/ rp/ by hand: they are the plugin's export. Fix the plugin, export again, and import the new one
- loosen tests.txt to make it pass
