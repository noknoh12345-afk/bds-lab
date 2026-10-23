# geoui_osu_skin — GeoUI のタイムラインで作った osu!（osu! の公式の素材（Legacy スキン）で）

## Request
osu! を GeoUI のタイムラインで丸ごと再現する（曲・判定・点数・画面の揺れ・盤面全体の動き）。osu! の素材（ppy/osu-resources の Legacy スキン、CC-BY-NC 4.0）を高解像度のアトラスで。
作り方: `node bds/geoui/timeline/demo.mjs`（bds/geoui/osu/addon.mjs）。曲と譜面はラボの物（bds/geoui/osu/music.mjs が作る「Cubic Pulse」140 BPM）。

## What it is
- 譜面: 円 96・スライダー 33・スピナー 1（ティック 54・フォローポイント 141）、AR 8.5・OD 7・CS 4・HP 5（判定 38/84/130 ms）、73 秒、キアイ 2 回・休み 1 回。
- 見た目: 円（コンボ色で染めて重ね絵）・接近の輪・default の数字・300/100/50/×・転がるスライダーボール・フォローサークル・折り返しの矢印・ティック・フォローポイント・スピナー（RPM）・点数と精度と体力・ランク。
- 動き: ミスで盤面が揺れる・キアイの拍で脈打つ・カーソルで傾く（視差）・早押しで円が震える（osu! のノートロック）・コンボで数字が跳ねる・休みに PASS/FAIL。
- osu! のルール: 体力が尽きると失敗（盤面が落ち、幕が下り、FAILED・失敗の音・曲が止まる。1 秒後からジャンプでやり直し）。Mods（HD: 接近の輪なし・円が先に消える／FL: カーソルのまわりだけ見え、コンボ 100・200 で狭まる／NF: 失敗しない ×0.5／SD: 1 つ落とすと失敗／PF: 300 以外で失敗）は右上に並ぶ。
- 終わりに結果の画面（osu! の ranking-panel: 点数・300/100/50/ミスの数を数え上げ・最大コンボ・精度・ランク（HD・FL で銀）・フルコンボの印・自己ベストなら NEW RECORD）。ベストはプレイヤーごとにワールドへ（オートは残さない）、スコアボード geoui_best、チャットに 1 行、拍手。
- 遊び方: `/geoui:osu`（メニュー: プレイ・Mods・感度とずれ・検証ツアー）、または `/scriptevent geoui:mode auto`（ひとりでに遊ぶ）・`aim`（見ている所がカーソル、ジャンプ・スニーク・アイテムで押す）・`relax`（狙わなくてよい）→ `/scriptevent geoui:play 1`。`geoui:mods HD FL`・`geoui:sens 2.4`・`geoui:offset 30`（遊び方・感度・ずれ・Mods はプレイヤーごとに残る）・`geoui:retry`。
- 検証ツアー（`/scriptevent geoui:tour`）: 全部の演出を 24 秒で（circles・slider・kiai・hidden・flashlight・spinner・break・miss・fail・results）。一歩ずつ（`tour step`、`tour next` で次へ）なら、どの場面も最後の瞬間で止まって待つ: 本物のアプリの確かめ（app.txt）はこれで全部の場面を写す。
- 大きさ: プロパティ 21 個（GeoUI の 11 個を含む）・pre_animation 2472 行（最長 887 文字）・ボーン 536 本・キューブ 509 個・要素ごとの render controller 59 個・アニメーション 35 個・アトラス 2048x2048。
- ひとりでに遊ぶと（osugame.js、20 tick/秒）: 点数 672572・最大コンボ 193・精度 100%・ランク SS。
- preview.png はラボの描き方（bds/geoui/osu/render.mjs）で描いた 6 つの場面（キアイ・スライダー・スピナー・FL と Mods・失敗・結果。本物のゲームではない: 本物は app.txt）。
  ツアーの動画は `node bds/geoui/osu/video.mjs skin tour.mp4 --tour`（パックのスクリプトそのものを偽の世界で動かして描く）。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（タイムラインのプロパティが既定値）
- [ ] auto でひとりでに遊ぶ: 点数とコンボが増え、精度 100 %、ミス 0、出来事の数（コンボ）が進む
- [ ] aim で何も押さないと: ミスが増え、コンボ 0、体力が減る（ミスの出来事で盤面が揺れる）
- [ ] seek・pause・resume・stop
- [ ] aim で何も押さないと体力が尽きて失敗: 判定が止まり、失敗の出来事、FAILED を見せたあと止まる
- [ ] 失敗のあとジャンプでやり直す（osu! の retry）
- [ ] NF なら失敗せず最後まで: 結果がチャットとスコアボードに
- [ ] Mods の文字・組み合わせの不可・none
- [ ] メニュー（/geoui:osu）: Mods を選ぶとメニューに戻って出る
- [ ] 検証ツアー: HD・FL・失敗・結果を順に見せて止まり、遊び方と Mods が戻る
- [ ] 一歩ずつの検証ツアー: どの場面も最後の瞬間で止まって次を待ち、tour next で次へ、最後に止まる
