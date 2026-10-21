# geoui_calib_o210 — GeoUI の目盛り（HUD の枠 10% x 10%（上から 210%））

## Request
geoui_calib と同じ目盛り（bds/geoui/calib.mjs）を、HUD の live_player_renderer の枠を変えて写し、画面とモデル座標の対応が枠の大きさ・位置でどう変わるかを測る。
枠を geoui_calib より画面 1 つ分下に置く。中心のモデル座標が「画面の高さ（モデル単位）x 1」だけ上へ動くか。測った値から、GeoUI Builder（bds/geoui/geoui_builder.js）が枠の設定から画面の高さと中心を計算できるようにする。

(made by `node bds/geoui/calib.mjs make <folder> --panel 10x10@210 --seed geoui_calib_o210`: its own pack UUIDs, the same markers and BP as geoui_calib)

## What it is
- RP: GeoUI Builder の書き出しそのもの。HUD の枠だけが HUD の枠 10% x 10%（上から 210%）（geoui_calib は 10% x 10%・110%）。中心のずれは 0。
- BP: geoui_calib と同じ（プロパティ gcal:*・scriptevent gcal:set）。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（中心のずれは 0: 目盛りはモデル座標のまま描かれる）
- [ ] scriptevent gcal:set で全員の値を変えられる

## Not proven here (needs the real app: app.txt → the check's 「測った値」)
- 枠を geoui_calib より画面 1 つ分下に置く。中心のモデル座標が「画面の高さ（モデル単位）x 1」だけ上へ動くか

## Do not
- change bp/ rp/ by hand: run `node bds/geoui/calib.mjs make <folder> --panel 10x10@210 --seed geoui_calib_o210` again
- loosen tests.txt to make it pass
