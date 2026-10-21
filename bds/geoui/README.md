# GeoUI Builder — Blockbench で GeoUI を作る（GeoUI Studio の式を再現・検証）

GeoUI = HUD に足した `live_player_renderer` が、`minecraft:player` に付けた板（平らなキューブ）を描くことで作る 2D の UI（統合版）。
このフォルダは、それを **Blockbench の上で組み立てて書き出すプラグイン** と、GeoUI Studio v10.1 の式の検証・本物のアプリでの較正の道具です。

| ファイル | 中身 |
|---|---|
| `geoui_builder.js` | **Blockbench プラグイン**（Blockbench 5.x、web 版・デスクトップ版）。中の `GeoUICore` は Node のモジュールにもなる（式・Molang・書き出し） |
| `blockbench-check.mjs` | 本物の Blockbench（web 版をヘッドレスの Chromium で）にプラグインを入れて確かめ、画を撮る（作者向け。要るものはファイルの先頭） |
| `calib.mjs` | 較正: 目盛りのパックを作る（`make`）・本物のアプリの画面を測る（`measure`）・答えのわかった偽の画面（`synth`） |
| `png.mjs` | PNG の読み書き（node:zlib だけ） |
| `measure.html` | **測定ページ**: スクショを選ぶだけで、その端末の中で測る（何も送らない）。`calib.mjs` の測り方をそのまま埋め込んだもの |
| `page.mjs`・`measure.tpl.html` | 測定ページを作る（`node bds/geoui/page.mjs`。`calib.mjs` を変えたら作り直す。古いままだと試験が落ちる） |
| `../../tests/geoui-builder-offline.mjs` | Studio の書き出し（`bds/addons/geoui_studio`）との突き合わせ、書き出したファイル、較正の測り方（CI） |
| `../addons/geoui_bb/` | このプラグインで Studio のひな形「スコア＆ゲージ」を作り直した書き出し（本物の BDS: DONE 22/22・本物のアプリ: `app.txt`） |
| `../addons/geoui_calib/` | 較正の目盛り（本物の BDS: DONE 3/3・本物のアプリ: `app.txt`） |

## 使い方

1. Blockbench（5.0 以上）→ **File → Plugins → Load Plugin from File** → `geoui_builder.js`。メニューに **GeoUI** が出ます。
2. **GeoUI → 新しい GeoUI プロジェクト**。画面の枠（水色。基準の画面比 16:9）が出て、正面から見た向き（ゲームの HUD と同じ: 右が +x）になります。
3. **画像を足す / 数字を足す / ゲージを足す**。寄せる先（`top_left` など）と余白（Studio の padX / padY、モデル単位）で置きます。
   画像は PNG を選ぶだけ（1 要素 1 テクスチャでよい）。数字はドット絵の 0〜9 を自動で描きます（自分の帯 0〜9＋空白でも）。
   ゲージは左（右・下・上・中心）から伸びます。値はどれも Molang（既定 `q.property('geoui:v0')` / `v1`）。
4. **選んだ要素の設定**: 寄せる先・重ね方（cutout / blend / add）・表示の条件（Molang）・値。「寄せる先へ動かす」で余白どおりに置き直せます。
   普通のキューブ・ボーンも自由に足せます（`geo_ui` の中に）。Blockbench のアニメーションもそのまま書き出されます（`q.is_in_ui` の間、ループ）。
5. **プレビュー**: 書き出す式そのもの（pre_animation とアニメーション）を Blockbench が動かします。左下の Variable Placeholders に
   プロパティの値（`q.property('geoui:aspect') = 1778` など）が並ぶので、書き換えると画面比・大きさ・値が変わります（v0〜v3 はスライダー）。
   **画面と書き出しの設定** でプレビューの画面比と端末（中心のずれ）を選べます。
6. **はみ出し・式を確かめる**: Studio の 8 種類の画面比 × PC / スマホで、画面からはみ出す要素と読めない式を挙げます。
7. **アドオンを書き出す（.mcaddon）**: `<名前空間>_RP` と `<名前空間>_BP`（ビヘイビアパックは設定で外せる）。2 回目からはパッチ版を 1 つ上げます。
   パックの UUID はプロジェクトごとに 1 度だけ作って .bbmodel に保存するので、ワールドの中で更新として入ります。

ゲームの中: `/geoui:set <名前> <値>`（scale・alpha・ox・oy・cx・cy・aspect・v0〜v3）・`/geoui:aspect <幅> <高さ>`（例 `2340 1080`）・`/geoui:get`・`/geoui:reset`、
コマンドブロックや別のパックからは `/scriptevent geoui:set <名前> <値>`、スコアボード `geoui_v0`〜`geoui_v3` を作れば v0〜v3 に 2 tick ごとに写ります。

## GeoUI Studio v10.1 の式（Au12jp/geouistudio 7fe110f、`index.html` の `GGen`）と、このプラグインでの再現

モデル座標（ジオメトリの単位。x = 画面の右、y = 上）で、画面の中心を (0, 140) に置く。

| 式 | Studio | このプラグイン |
|---|---|---|
| 画面比 | `v.geoui_aspect = q.property('geoui:aspect')/1000.0`（スクリプトが端末の種類から 1778 / 2000 を推す） | 同じ（`/geoui:aspect <幅> <高さ>` で本当の比も） |
| 画面の半分の幅 | `v.geoui_halfw = r3(H/2)*v.geoui_aspect`、H = 画面の高さ = **176** | 同じ |
| 左へ寄せる | 中心 x = `-(halfw - (w/2 + padX))` | 基準の画面比で置いた位置 + `-(v.geoui_halfw - halfw基準)`（どの画面比でも同じ所） |
| 右へ寄せる | `halfw - (w/2 + padX)` | 同じ考え |
| 上・下へ寄せる | `±(H/2 - h/2 - padY)`（画面比によらない） | 置いた位置のまま |
| 大きさ・ずらし | 位置 `(…)*v.geoui_scale + v.geoui_ox + v.geoui_cx`、`ox = q.property(ox)/10` | 全体を `geo_ui` で `(0,140)` を中心に `scale`、`ox+cx`・`oy+cy` ずらす（同じ結果） |
| 中心のずれ | `v.geoui_cx = q.property('geoui:cx')/10000*176`（PC `-6` / `-278`、スマホ `-17` / `-526`） | 同じ（設定で変えられる） |
| 数字 | 桁ごとに別ジオメトリ、帯 11 コマ（0〜9・空白）を `uv_anim` でずらす。頭の 0 は空白 | 桁ごとに 10 枚の板、合わない数字は `scale 0`（Blockbench のプレビューでも動く）。桁の値は Studio と同じ式 |
| ゲージ | `scale.x = clamp(値/最大, 0, 1)` | 同じ（伸びる向きの端を軸に） |
| HUD | `size 10% x 10%`・`offset [0, 110%]`・`top_middle` の `live_player_renderer`（人形は画面の下の外） | 同じ枠（設定で変えられる） |

**確かめたこと**（`node tests/geoui-builder-offline.mjs`）: Studio が書き出したひな形（`bds/addons/geoui_studio` のファイルそのもの）と、
同じ配置をこのプラグインで作った書き出しを、どちらも自分の Molang（pre_animation → アニメーション → レンダーコントローラー）で動かして比べると、
**scale 100 では 1890 通り（画面比 9 × PC / スマホ × ずらし 3 × 値 35）すべてで、どの桁がどの数字をどこに出すかとゲージの位置が 1e-6 単位まで一致**。
本物の Blockbench 5.2.2 でも（`blockbench-check.mjs`）、Blockbench の中で作ったパックが Studio と 192 通りで一致し、Blockbench 自身のプレビュー
（Blockbench の Molang とボーンの変形）がプラグインの計算と同じ所に板を置き・隠すことを確かめた。

## 人の手で決めた値（Studio）と、その確かめ方

| 値 | Studio | 出どころ | 状態 |
|---|---|---|---|
| 画面の高さ | 176 単位（初期値は 22.5 だった） | 「実機で 20.25 倍にしたらちょうど良かった」という報告 | **未測定** → `geoui_calib` |
| 画面の中心 | y = 140 | 人形を画面の外へ出すための高さ | **未測定** |
| 中心のずれ | PC x -0.1 / y -4.9、iOS x -0.3 / y -9.25 | 176 単位のときに一度ずつ実測 | **未測定** |
| json-ui 単位 | 240 / 176 = 1.364 | 画面の高さを 240 json-ui 単位と仮定 | 未測定（UI の倍率を変えて写す） |
| 画面比 | PC 1778・スマホ 2000・ゲーム機 1778 | 端末の種類からの推測 | 既知の問題: 19.5:9 のスマホは 2167（左右に寄せた要素が 14.7 単位ずれる） |

これらは本物のアプリでしか測れません。`bds/addons/geoui_calib` が目盛り（モデル座標のわかった色の点 92 個・中心のずれ 0）を描き、
`app.txt` が端末の既定・4:3・16:10・16:9・20:9・21:9・UI の倍率 2 種・scale 50 で写します。測るのは:

```sh
node lab.mjs app ci -a geoui_calib --wait          # GitHub の本物のアプリで（Google Play の連携が要る）
node bds/geoui/calib.mjs measure app/runs/gh-<番号>/shots
```

Google Play の連携が無くても、スマホ 1 台で測れます: `GeoUI_Calibration.mcaddon` を取り込んだワールドで横向きのまま撮り、
`measure.html`（パネルに置くか、ファイルをそのままブラウザで開く）でそのスクショを選ぶだけ。輪が点に重なっていれば正しく測れています。

画面ごとに **画面の高さ（モデル単位）・画面の中心のモデル座標（＝ Studio の中心のずれ）・縦と横の尺度・遠近（奥行き ±60 の点の拡大率）** が出ます。
測った値はプラグインの **画面と書き出しの設定**（画面の高さ・中心のずれ）に入れます。測り方は、答えのわかった偽の画面で確かめてあります
（HUD の部品が混ざっても外れとして除く・遠近の拡大率も読める: `calib.mjs synth`）。
本物のスクショで起こることにも耐えます: 格子は色ではなく「同じ大きさの四角が等間隔に並ぶ形」で見つけ、赤・緑・青のどれか 1 つが写っていれば位置が決まります。
偽の画面 240 通り（5 種の画面 × 高さ 120 / 176 / 260 × 中心のずれ × 遠近 × 縮小 1〜1/3・JPEG 70〜90・暗さ 0.5〜1・タッチ操作のボタンとチャットの文字）で、
横向きの 192 通りすべてが高さ 1 % 以内・中心 1 単位以内。縦向き（目盛りが 2 列しか写らない）は、間違った数字を出さずに測れないと答えます。

## Studio との違い（わざと）

どれも Studio の書き出しで起きることを確かめた上で、変えています。

- **scale ≠ 100 のとき**: Studio は数字の桁の間隔が縮まず、ゲージの位置もずれる（scale 25〜200 で桁の中心が最大 17.8 単位・ゲージが最大 29.9 単位。scale 50 ならそれぞれ 8.9・15.0 単位で、桁が離れて見える）。
  このプラグインは UI 全体を (0, 140) を中心に縮める（Studio の画像の縮み方と同じ）。Blockbench で両方を描いた画: `blockbench-check.mjs` の 10〜13。
- **ゲージ**: Studio のひな形はゲージの軸が中心（`pivot: "center"`）で、値が減ると中心へ縮む（左端が動く）。既定は左端から（中心も選べる）。
- **HUD**: Studio は `hud_content` を丸ごと置き換える（その写しには 1.26.50 で増えたエディターの描画が無い）。`root_panel` に足すだけにした（Studio の形も選べる）。
- **player の定義**: 現行バニラ 1.26.50（bedrock-samples 46ba6ea）を元にする。Studio の BP は 1.19.70 の写しで満腹度が違い、襲撃の予兆のイベントが無い。
- **ビヘイビアパック**: 引数が整数型のコマンド（Studio は文字列型で数値がそのまま書けない）、alpha 0 が効く、範囲外は理由を言う、自分で変えた値は
  入り直し・/reload・再起動でも残る、値の範囲は float32 で正確な ±2^24、汎用名のスコアボードを作らない（`geoui_bb` の tests.txt が全部を本物の BDS で確かめる）。
- **ポーズ画面の人形**（paper_doll_renderer）では描かず、プロパティも読まない（`!variable.is_paperdoll`）。
- 数字の 10 枚の板は 0.02 ずつ手前へ（同じ面に重ねない）。プレイヤーの名前の lang と空のルートテーブルも入れる。

## まだ確かめていないこと

- 本物のアプリでの描画（このリポジトリには Google Play の連携がまだ無い: パネルの「🔗 連携」→ Google Play）。`geoui_lab`・`geoui_bb`・`geoui_calib` の `app.txt` が待っている。
- インベントリの人形（これも `live_player_renderer`）にも GeoUI が映るか（`geoui_lab/app.txt` の inventory の区切り）。
- Blockbench のデスクトップ版（Electron）での読み込み（web 版 5.2.2 では確かめた。使っているのは両方にある API だけ）。
