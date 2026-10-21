# geoui_calib — GeoUI の目盛り（本物のアプリで、モデル座標と画面の対応を測る）

## Request
GeoUI の目盛り（bds/geoui/calib.mjs make）。本物のアプリで HUD の live_player_renderer が描くモデル座標の点を写し、
画面の高さ（GeoUI Studio は 176 単位: 「20.25 倍でちょうど良かった」という報告から）・画面の中心（Studio は y=140 と、PC・iPhone で一度ずつ測った中心のずれ）・
遠近の有無・UI の倍率による違いを測る。測った値は GeoUI Builder（bds/geoui/geoui_builder.js）の設定（画面の高さ・中心のずれ）に入れる。

(a person's addon, imported from the folder calib.mjs made: keep its pack names and UUIDs)

## What it is
- RP: GeoUI Builder の書き出しそのもの（HUD の枠は Studio と同じ 10% x 10%・110%）。中心のずれは 0、要素の式も無い: 目盛りはモデル座標のまま描かれる。
  白い点 84 個（40 単位ごと・中心を避ける）、向きの目印 赤 (20,140)・緑 (60,140)・青 (20,180)、手前 z=-60 の黄 4 個・奥 z=+60 の水色 4 個、後ろに黒い板。
- BP: プロパティ（gcal:*）とスクリプト（scriptevent gcal:set）。

## Acceptance (one tests.txt `## ` section each)
- [x] 読み込める（中心のずれは 0: 目盛りはモデル座標のまま描かれる）
- [x] scriptevent gcal:set で全員の値を変えられる（app.txt が大きさを変えて写すのに使う）

## Not proven here (needs the real app: app.txt → node bds/geoui/calib.mjs measure <run>/shots)
- 画面の高さ・中心・縦横の尺度・遠近を、端末の既定・4:3・16:10・16:9・20:9・21:9、UI の倍率 240/480 dpi、scale 50 で

## Do not
- change bp/ rp/ by hand: run `node bds/geoui/calib.mjs make <folder>` and import again
- loosen tests.txt to make it pass
