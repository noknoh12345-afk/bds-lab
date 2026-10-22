# geoui_rhythm — GeoUI のタイムラインで作った osu! 風の HUD（見本）

## Request
GeoUI Builder のタイムライン（bds/geoui/timeline）で、osu! のようなリズムゲームの画面を作れることを、本物の BDS と本物のアプリで確かめる。
作り方: `node bds/geoui/timeline/demo.mjs`（譜面・絵・クリックの音はラボの物。実在の譜面・曲は入れない）。

## What it is
- 譜面 16 個の円・1 本のスライダー（往復も）・1 個のスピナー、120 BPM、AR 7・CS 4・OD 6（判定 44/92/140 ms）、14 秒。
- RP: テンプレートの枠（4 枠・1 枠・1 枠、焼き込み: 見た目はクライアントの時計だけで動く）、スライダーの玉は実体ごとのアニメーション、出来事（当たり・外れ）、点数・コンボ（v0・v1）・体力のゲージ（v3）。
- 大きさ: プレイヤーのプロパティ 15 個（GeoUI の 11 個を含む・上限 32）、pre_animation 391 行（最長 332 文字・括弧 9 段）、ボーン 251 本、要素ごとの render controller 27 個、アニメーション 3 個。
- BP: `/scriptevent geoui:play 1`・stop・pause・resume・seek <秒>・offset <ms>。ジャンプ・スニーク・アイテムを使うで判定。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（タイムラインのプロパティが既定値）
- [ ] play で再生が始まる（seq の番号と世代・seq_from）
- [ ] seek・pause・resume がプロパティに出る
- [ ] stop で止まる
- [ ] 入り直すと、再生中のシーケンスをその時刻から送り直す（世代は続きの番号）
