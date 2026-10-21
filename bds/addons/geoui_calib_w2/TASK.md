# geoui_calib_w2 — GeoUI の目盛り（HUD の枠 2% x 10%（上から 110%、細い枠））

## Request
geoui_calib と同じ目盛り（bds/geoui/calib.mjs）を、HUD の live_player_renderer の枠を変えて写し、画面とモデル座標の対応が枠の大きさ・位置でどう変わるかを測る。
枠の高さは geoui_calib と同じで、幅だけ 1/5（画面 1560x720 なら 31 x 72 px: 縦長）。人形が枠の幅に合わせて縮むか（画面の高さのモデル単位が増えるか）。測った値から、GeoUI Builder（bds/geoui/geoui_builder.js）が枠の設定から画面の高さと中心を計算できるようにする。

(made by `node bds/geoui/calib.mjs make <folder> --panel 2x10@110 --seed geoui_calib_w2`: its own pack UUIDs, the same markers and BP as geoui_calib)

## What it is
- RP: GeoUI Builder の書き出しそのもの。HUD の枠だけが HUD の枠 2% x 10%（上から 110%、細い枠）（geoui_calib は 10% x 10%・110%）。中心のずれは 0。
- BP: geoui_calib と同じ（プロパティ gcal:*・scriptevent gcal:set）。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（中心のずれは 0: 目盛りはモデル座標のまま描かれる）
- [ ] scriptevent gcal:set で全員の値を変えられる

## Not proven here (needs the real app: app.txt → the check's 「測った値」)
- 枠の高さは geoui_calib と同じで、幅だけ 1/5（画面 1560x720 なら 31 x 72 px: 縦長）。人形が枠の幅に合わせて縮むか（画面の高さのモデル単位が増えるか）

## Do not
- change bp/ rp/ by hand: run `node bds/geoui/calib.mjs make <folder> --panel 2x10@110 --seed geoui_calib_w2` again
- loosen tests.txt to make it pass
