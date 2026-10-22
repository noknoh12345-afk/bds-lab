# geoui_probe_vc — GeoUI のエンティティが変数を何個まで持つか（1 行に 1 つ）

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- 4 回目（2026-10-22）の geoui_probe_m: 3000 行に 1 つずつ作った変数の最後を読む板が描かれなかった（geoui_rhythm_big の 1109 行・906 個は動いた）。行の数か変数の数かを、この probe（変数を増やす） と geoui_probe_lc で分ける。
- GeoUI 本体の行 19 行・変数 22 個の後ろに足した。確かめは数えた所のすぐ後ろ（後ろの行が動かなくても、どこまで効いたかが分かる）。
- テスト 1（ctl）: 基準: ふつうのボーン・scale で出し入れ
- テスト 2（v500）: 500 個目の変数（1 行に 1 つ。パックの中で約 523 個目・pre_animation の 521 行目）
- テスト 3（v800）: 800 個目の変数（1 行に 1 つ。パックの中で約 823 個目・pre_animation の 822 行目）
- テスト 4（v1000）: 1000 個目の変数（1 行に 1 つ。パックの中で約 1023 個目・pre_animation の 1023 行目）
- テスト 5（v1024）: 1024 個目の変数（1 行に 1 つ。パックの中で約 1047 個目・pre_animation の 1048 行目）
- テスト 6（v1100）: 1100 個目の変数（1 行に 1 つ。パックの中で約 1123 個目・pre_animation の 1125 行目）
- テスト 7（v1500）: 1500 個目の変数（1 行に 1 つ。パックの中で約 1523 個目・pre_animation の 1526 行目）
- テスト 8（v2000）: 2000 個目の変数（1 行に 1 つ。パックの中で約 2023 個目・pre_animation の 2027 行目）
- テスト 9（v2048）: 2048 個目の変数（1 行に 1 つ。パックの中で約 2071 個目・pre_animation の 2076 行目）
- テスト 10（v2100）: 2100 個目の変数（1 行に 1 つ。パックの中で約 2123 個目・pre_animation の 2129 行目）
- テスト 11（v3000）: 3000 個目の変数（1 行に 1 つ。パックの中で約 3023 個目・pre_animation の 3030 行目）

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
