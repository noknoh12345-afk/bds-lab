# geoui_probe — GeoUI の作りの確かめ 3 回目（不透明度・回転の向き・アニメーションの重ね方・initialize）

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- テストの板を 1 つずつ出して写す。`measure diff` で描かれた所、`measure color` で板の真ん中の平均の色（と、何も出さない画面の同じ所の色）。
- 透け具合 = (色 − 何も無い所の色) / (不透明の白（ctl）− 何も無い所の色): read が明るさで出す。
- 2 回目までの答えは probe.mjs の頭と PLAN.md の進み具合に。
- テスト 1（ctl）: 基準: 共有の render controller（cutout）の白い板・scale で出し入れ（色の測りの「不透明の白」）
- テスト 2（mask1）: fade（blend + USE_COLOR_MASK）・color.a = 1: 描かれればこのマテリアルは使える
- テスト 3（mask0）: fade・color.a = 0（定数）: 描かれなければ color.a が効く
- テスト 4（maskhalf）: fade・color.a = 0.5: 色を測る（0.5 なら半分透ける）
- テスト 5（maskvar）: fade・color.a を変数で（選んだ時だけ 1・scale は 1 のまま）: 描かれれば変数の color.a が効く
- テスト 6（cutmask0）: cutfade（cutout + USE_COLOR_MASK）・color.a = 0: 描かれなければ効く（cutout は 0.5 より薄い所を捨てる）
- テスト 7（cutmaskhalf）: cutfade・color.a = 0.6: 色を測る（cutout のままなら不透明）
- テスト 8（texhalf）: blend・テクスチャの白（不透明度 0.376）: 色を測る（半透明のテクセルが混ざるか）
- テスト 9（texhalfcut）: cutout・テクスチャの白（0.376）: 描かれなければ 0.5 より薄いテクセルは捨てられる
- テスト 10（masktexhalf）: fade・テクスチャ 0.376・color.a = 0.5: 色を測る（掛け算なら 0.188）
- テスト 11（rot90）: アニメーションの rotation z = +90（板はピボットの右 20 単位）: 上へ行けば左回り・下なら右回り
- テスト 12（scalemul）: 同じボーンに 3 つのアニメーション（scale 1・2・0.5）: 14 単位なら掛け算
- テスト 13（posadd）: 同じボーンに 2 つのアニメーション（x +10 ずつ）: +20 なら足し算
- テスト 14（init）: initialize だけで入れた変数（7）で出し入れ: 描かれれば initialize が効く

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
