# geoui_rhythm_huge — GeoUI のタイムラインで作った osu! 風の HUD（本物の大きさの譜面 1000 個の見本）

## Request
GeoUI Builder のタイムライン（bds/geoui/timeline）で、osu! のようなリズムゲームの画面を作れることを、本物の BDS と本物のアプリで確かめる。本物の大きさの譜面（何百個）でも、プロパティ・Molang の行・ボーン・アニメーションがゲームの限度に収まり、写した画が動くこと。
作り方: `node bds/geoui/timeline/demo.mjs`（譜面・絵はラボの物。実在の譜面・曲は入れない）。

## What it is
- 譜面 612 個の円・353 本のスライダー（往復も）・35 個のスピナー、180 BPM、AR 9・CS 4・OD 8（判定 32/76/120 ms）、382 秒（音楽なし）。
- RP: テンプレートの枠（8 枠・4 枠・2 枠、焼き込み: 見た目はクライアントの時計だけで動く）、スライダーの玉は実体ごとのアニメーション、出来事（当たり・外れ）、点数・コンボ（v0・v1）・体力のゲージ（v3）。
- 大きさ: プレイヤーのプロパティ 15 個（GeoUI の 11 個を含む・上限 32）、pre_animation 1583 行（最長 677 文字・括弧 9 段）、ボーン 433 本、要素ごとの render controller 66 個、アニメーション 355 個。
- BP: `/scriptevent geoui:play 1`・stop・pause・resume・seek <秒>・offset <ms>。ジャンプ・スニーク・アイテムを使うで判定。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（タイムラインのプロパティが既定値）
- [ ] play で再生が始まる（seq の番号と世代・seq_from）
- [ ] seek・pause・resume がプロパティに出る
- [ ] stop で止まる
- [ ] 入り直すと、再生中のシーケンスをその時刻から送り直す（世代は続きの番号）
