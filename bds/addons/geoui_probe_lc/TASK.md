# geoui_probe_lc — GeoUI の pre_animation が何行まで動くか（1 つの変数を数える）

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- 4 回目（2026-10-22）の geoui_probe_m: 3000 行に 1 つずつ作った変数の最後を読む板が描かれなかった（geoui_rhythm_big の 1109 行・906 個は動いた）。行の数か変数の数かを、この probe（行だけ増やす） と geoui_probe_vc で分ける。
- GeoUI 本体の行 19 行・変数 22 個の後ろに足した。確かめは数えた所のすぐ後ろ（後ろの行が動かなくても、どこまで効いたかが分かる）。
- テスト 1（ctl）: 基準: ふつうのボーン・scale で出し入れ
- テスト 2（l1000）: 1000 行を数えた直後（1 つの変数を 1 行ずつ +1。pre_animation の 1022 行目）
- テスト 3（l1500）: 1500 行を数えた直後（1 つの変数を 1 行ずつ +1。pre_animation の 1523 行目）
- テスト 4（l2000）: 2000 行を数えた直後（1 つの変数を 1 行ずつ +1。pre_animation の 2024 行目）
- テスト 5（l2500）: 2500 行を数えた直後（1 つの変数を 1 行ずつ +1。pre_animation の 2525 行目）
- テスト 6（l3000）: 3000 行を数えた直後（1 つの変数を 1 行ずつ +1。pre_animation の 3026 行目）
- テスト 7（l3500）: 3500 行を数えた直後（1 つの変数を 1 行ずつ +1。pre_animation の 3527 行目）
- テスト 8（l4000）: 4000 行を数えた直後（1 つの変数を 1 行ずつ +1。pre_animation の 4028 行目）
- テスト 9（l5000）: 5000 行を数えた直後（1 つの変数を 1 行ずつ +1。pre_animation の 5029 行目）

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
