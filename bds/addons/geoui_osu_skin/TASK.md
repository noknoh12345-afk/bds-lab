# geoui_osu_skin — GeoUI のタイムラインで作った osu!（osu! の公式の素材（Legacy スキン）で）

## Request
osu! を GeoUI のタイムラインで丸ごと再現する（曲・判定・点数・画面の揺れ・盤面全体の動き）。osu! の素材（ppy/osu-resources の Legacy スキン、CC-BY-NC 4.0）を高解像度のアトラスで。
作り方: `node bds/geoui/timeline/demo.mjs`（bds/geoui/osu/addon.mjs）。曲と譜面はラボの物（bds/geoui/osu/music.mjs が作る「Cubic Pulse」140 BPM）。

## What it is
- 譜面: 円 96・スライダー 33・スピナー 1（ティック 54・フォローポイント 141）、AR 8.5・OD 7・CS 4・HP 5（判定 38/84/130 ms）、73 秒、キアイ 2 回・休み 1 回。
- 見た目: 円（コンボ色で染めて重ね絵）・接近の輪・default の数字・300/100/50/×・転がるスライダーボール・フォローサークル・折り返しの矢印・ティック・フォローポイント・スピナー（RPM）・点数と精度と体力・ランク。
- 動き: ミスで盤面が揺れる・キアイの拍で脈打つ・カーソルで傾く（視差）・早押しで円が震える（osu! のノートロック）・コンボで数字が跳ねる・休みに PASS/FAIL・終わりにランク。
- 遊び方: `/scriptevent geoui:mode auto`（ひとりでに遊ぶ）・`aim`（見ている所がカーソル、ジャンプ・スニーク・アイテムで押す）・`relax`（狙わなくてよい）→ `/scriptevent geoui:play 1`。`/scriptevent geoui:sens 2.4`（1 度で動くカーソル）。
- 大きさ: プロパティ 19 個（GeoUI の 11 個を含む）・pre_animation 2123 行（最長 887 文字）・ボーン 348 本・要素ごとの render controller 59 個・アニメーション 35 個・アトラス 2048x2048。
- ひとりでに遊ぶと（osugame.js、20 tick/秒）: 点数 672572・最大コンボ 193・精度 100%・ランク SS。
- preview.png はラボの描き方（bds/geoui/osu/render.mjs）で描いた 4 つの時刻（本物のゲームではない: 本物は app.txt）。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（タイムラインのプロパティが既定値）
- [ ] auto でひとりでに遊ぶ: 点数とコンボが増え、精度 100 %、ミス 0、出来事の数（コンボ）が進む
- [ ] aim で何も押さないと: ミスが増え、コンボ 0、体力が減る（ミスの出来事で盤面が揺れる）
- [ ] seek・pause・resume・stop
