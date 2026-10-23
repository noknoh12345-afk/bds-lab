# geoui_device — GeoUI の端末の確かめ（どの画面でも式どおりに出るか・入力がどう届くか）

## Request
osu! を作る前に GeoUI の仕様を全部確かめる（bds/geoui/SPEC.md）: いろいろな画面比の Android（ラボの CI の端末: app.txt）→ 実機の iPhone など（人が見る: 下の「人が見ること」）。
作り方: `node bds/geoui/screen/device.mjs`（このフォルダはそれが書く。手で直さない）。

## What it is
- 1 つのパックで、GeoUI の「画面のどこに何が出るか」の式（bds/geoui/screen/layout.js）を全部見せる。`/scriptevent gdev:show <ビット>` で切り替える:
  1 = 9 つの寄せ先（四隅・上下左右の真ん中・中心に 8 x 8 単位の四角。四隅の四角は画面の角にぴったり付く）、2 = contain の枠（16:9 のデザインの外枠: 画面の 2 辺に付く）、
  4 = GUI の倍率（ホットバーと同じ 182 x 22 の枠: ホットバーにぴったり重なる）、8 = セーフエリアの外（HUD の外にだけ出る白い印: 普通の画面では見えない）、
  16 = 切り抜き（灰色の大きな四角が画面の左の 30 % x 30 % の枠に収まるか）、32 = GeoUI Studio の 1 つの renderer で真ん中に出る十字、
  64 = 色（白・灰・赤・緑・青・黒・半透明の白）、128 = 入力の表示、256 = 回転のクエリの棒、512 = renderer ごとの計算の回数、1024 = F の字（鏡写しか）、
  2048 = 重なり（青が手前・赤が奥）、4096 = HUD の文字（タイトルとサブタイトルを GeoUI の画面に置く・タイトルの先頭 3 文字と残り）。
- `/scriptevent gdev:ui on`（lock: 動きを禁止 / free: 動いても戻す）で UI のモード: カメラを止め、視点でポインタ（白い四角）、W A S D・スティックで移動の点、
  ジャンプ・スニーク・腕の振り・使う・エモート・文字のランプ、スロット、サーバーの向き。`gdev:ui off` で戻る。
- 入力は全部サーバーのログに `GDEV …` で出る。`gdev:mark` の後の入力を `gdev:check <move|left|forward|still|rot|jump|sneak|slot|wheel|swing|use|text|recentre|pointer|mode> <名前>` が
  `GDEV CHECK <名前> PASS|FAIL` で答える。文字は `/gdev:t <文字>`（チャットのコマンド: フォームなし）。

## 人が見ること（iPhone・iPad・PC・ゲーム機で、横向きで）
1. ワールドに入って `/scriptevent gdev:show 1`: 四隅の赤・黄・水色・青の四角が画面の角に、上下左右の真ん中（橙・青緑系）と中心（緑）が正しい所に付くか。
   切り欠き（ノッチ・Dynamic Island）や角の丸い所で欠けていないか。欠けていれば、その分だけ HUD のセーフエリアが内側にある。
2. `/scriptevent gdev:show 8`: 白い印や白い線が見えたら、その所は HUD の外（GeoUI の viewport の外）に画面がある。見えた辺と太さを写真に。
3. `/scriptevent gdev:show 38`: 紫の枠（16:9）が画面の左右か上下の 2 辺にぴったり付くか、ピンクの枠がホットバーにぴったり重なるか、白い十字が緑の中心と同じ所か。
4. `/scriptevent gdev:show 16`: 灰色の四角が左の枠（幅 30 %・高さ 30 %）に収まっていれば切り抜きが効く。画面いっぱいなら効かない。
5. `/scriptevent gdev:show 1088`（64 + 1024）: 色の見え方と F の向き（赤い点が F の右、青い点が左なら鏡写しではない）。
6. `/scriptevent gdev:title ABCDEFG XYZ` と `gdev:show 4096`: 左に黄色い字で ABCDEFG・XYZ・ABC・DEFG が出れば、HUD の文字を GeoUI に置ける。
7. `/scriptevent gdev:show 128` → `/scriptevent gdev:ui on`: 画面を指でなぞると白い四角（ポインタ）が動き、ジャンプ・スニークのボタンでランプ、ホットバーを
   押すとスロット、移動のパッドで点が動くか。カメラは止まったまま。終わったら `/scriptevent gdev:ui off`。
写真は全部 `/scriptevent gdev:show 0` の時と比べて撮る。写真は bds/geoui/measure.html でなくてもよい（SPEC.md の「端末の確かめ」に書く値と比べる）。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）
- [ ] 表示の切り替え（gdev:show のビット）
- [ ] UI のモード（動きを禁止）: カメラを止め、歩いても動かず、視点でポインタが動く
- [ ] 下を向き続けると水平に戻し、ポインタは跳ばない
- [ ] UI のモード（動けるまま毎 tick 戻す）: 移動の入力は届き、体は戻る
- [ ] ジャンプ・スニークのボタンが届く
- [ ] スロット（ホイール）と腕の振り
- [ ] 文字はコマンドで（/gdev:t）
- [ ] 動きの速さ 0（speed）でも移動の入力は届く
- [ ] UI を閉じると元に戻る
