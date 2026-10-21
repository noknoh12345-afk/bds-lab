# geoui_calib_p20 — GeoUI の目盛り（HUD の枠 20% x 20%（上から 105%））

## Request
geoui_calib と同じ目盛り（bds/geoui/calib.mjs）を、HUD の live_player_renderer の枠を変えて写し、画面とモデル座標の対応が枠の大きさ・位置でどう変わるかを測る。
枠の中心は geoui_calib と同じ（上から 115%）で、大きさだけ 2 倍。画面の高さ（モデル単位）が枠の高さに反比例するか（176 → 88）と、中心がどこへ動くか。測った値から、GeoUI Builder（bds/geoui/geoui_builder.js）が枠の設定から画面の高さと中心を計算できるようにする。

(made by `node bds/geoui/calib.mjs make <folder> --panel 20x20@105 --seed geoui_calib_p20`: its own pack UUIDs, the same markers and BP as geoui_calib)

## What it is
- RP: GeoUI Builder の書き出しそのもの。HUD の枠だけが HUD の枠 20% x 20%（上から 105%）（geoui_calib は 10% x 10%・110%）。中心のずれは 0。
- BP: geoui_calib と同じ（プロパティ gcal:*・scriptevent gcal:set）。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（中心のずれは 0: 目盛りはモデル座標のまま描かれる）
- [ ] scriptevent gcal:set で全員の値を変えられる

## Not proven here (needs the real app: app.txt → the check's 「測った値」)
- 枠の中心は geoui_calib と同じ（上から 115%）で、大きさだけ 2 倍。画面の高さ（モデル単位）が枠の高さに反比例するか（176 → 88）と、中心がどこへ動くか

## Do not
- change bp/ rp/ by hand: run `node bds/geoui/calib.mjs make <folder> --panel 20x20@105 --seed geoui_calib_p20` again
- loosen tests.txt to make it pass
