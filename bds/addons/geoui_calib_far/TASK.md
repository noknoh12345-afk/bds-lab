# geoui_calib_far — GeoUI の目盛り（人形から 1760 単位上・HUD の枠は上から 1110%）

## Request
geoui_calib と同じ目盛りを 1760 単位（110 ブロック）上に置き、HUD の live_player_renderer の枠を上から 1110% に下げて写す。
枠の位置と、HUD に映るモデルの高さの関係（枠を画面 1 つ分下げるとモデル側では画面の高さの単位ぶん上がる）を確かめ、
そこまで離せばインベントリの人形に GeoUI が映り込まないか（Discord で言われた直し方）を数で確かめる。

(made by `node bds/geoui/calib.mjs make <folder> --panel 10x10@1110 --seed geoui_calib_far --lift 1760`)

## What it is
- RP: GeoUI Builder の書き出し。目盛りと黒い板が 1760 単位上（y = 1780〜2020）、HUD の枠が上から 1110%。中心のずれは 0。
- BP: geoui_calib と同じ（プロパティ gcal:*・scriptevent gcal:set）。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（中心のずれは 0: 目盛りはモデル座標のまま描かれる）
- [ ] scriptevent gcal:set で全員の値を変えられる

## Not proven here (needs the real app: app.txt → the check's 「測った値」)
- HUD に目盛りが出て、その中心が y = 1760 + （geoui_calib の中心）+ 画面の高さ x 10 になるか
- インベントリを開いても目盛りが映らない（measure diff が 0 か所）

## Do not
- change bp/ rp/ by hand: run `node bds/geoui/calib.mjs make <folder> --panel 10x10@1110 --seed geoui_calib_far --lift 1760` again
- loosen tests.txt to make it pass
