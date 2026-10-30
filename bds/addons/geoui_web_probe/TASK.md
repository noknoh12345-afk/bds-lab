# geoui_web_probe — URL の画像と F1 を本物のゲームで測る

## Request
URL の画像（profile_image_renderer の {"type":7,"url":…}）を GeoUI に組み込み、F1（HUD・腕・持ち物を全部消す、ゲームモードは変えない）を作る前に、
本物のアプリで何が起きるかを測る（bds/geoui/SPEC.md 14 章）。作り方: `node bds/geoui/web/probe.mjs`（このフォルダはそれが書く。手で直さない）。

## What it is
- HUD に URL の画像の枠が 6 つ: main（真ん中 80 x 80 単位・枠 0）・left（左 50 x 50・枠 1）・right（右・枠 2）・top（上 80 x 20・枠 3）・
  lay（並べ方 b のときだけ・枠 4）・under（main の下に重なる・枠 5）。高さに合わせる大きさ（画面の高さ = 170.67 単位）。
- `/scriptevent gwp:url <枠> <URL>`: その枠に絵を出す。`/path` はラボのサービス（bds/geoui/web/server.mjs）の絵（/solid/rrggbb/WxH.png・/quad/WxH.png・
  /noise/WxH.png・/slow/<ミリ秒>/…）、`~/path` はそのトンネル（https）、`-` で消す。題名（タイトル）の通り道で送る（layout.js・channel.js）。
- `gwp:show 1` = main の外の紫の枠（GeoUI の印: 絵がその中にぴったり入るか）、`gwp:show 4` = 真ん中の白い十字（絵の上に GeoUI が描かれるか）。
- `gwp:f1 1`: F1（HUD の 13 の部品を API で、残りの HUD（会話・題名など）を通り道の旗で隠し、空の手の腕はプロパティ（render controller）で、持ち物はカメラ `gwp:eye`（目の所の 3 人称: 1 人称を描かない）で消す）。`gwp:f1 touch`: 携帯の操作ボタンは残す。`gwp:part cam 1`: カメラだけ。`gwp:rot`: 向き（20° より回ったら TURNED）。
- `gwp:fx 1`・`gwp:fx 2`: 1 人称の手の消し方を 1 つずつ（1: 大きさ 0 だけ、2: 下へ動かすだけ）。青い羊毛を持つと、プロパティなしで腕が下へ（4 本目の実験）。
- `gwp:layout b`: 並べ方 b（lay の枠と、画面全体の黒い背景）。`gwp:lat`・`gwp:count`・`gwp:cycle`: サービスが記録した、ゲームが絵を取りに来た時刻と回数（左上の棒の長さにも出る）。

## 人が見ること（携帯・PC で、横向きで）
1. ワールドで `/scriptevent gwp:url 0 /solid/ff0000/64x64.png` → 真ん中に赤い四角。`/scriptevent gwp:show 5` → 紫の枠の内側にぴったり、白い十字が赤の上。
2. `/scriptevent gwp:url 1 https://placehold.co/64x64/00ff00/00ff00.png` → 左に緑。http が出ず https だけ出るなら、その端末は平文の http を取りに行かない。
3. `/scriptevent gwp:f1 1` → HUD・会話・手と持ち物が全部消える（ゲームモードはそのまま）。`/scriptevent gwp:f1 0` で戻る。
