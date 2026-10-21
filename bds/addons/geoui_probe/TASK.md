# geoui_probe — GeoUI の作りの確かめ（pre_animation が止まる所・時計・自分の render controller）

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- pre_animation に足した行の間にカナリア（1 なら板を描く変数）を置く: 描かれない最初のカナリアの前の行で、pre_animation が止まっている。
- 最後の行は、一度も入れていない変数を ?? なしで読む（ゲームはここで止まるはず: カナリア 6 は描かれないのが正しい）。
- 時計の 2 つは、選んでから 1.5 秒と 3 秒で写す（毎秒 15 単位で右へ動けば、その時間が進んでいる）。
- テスト 1（ctl）: 基準: ボーン #1・共有の render controller・scale で出し入れ
- テスト 2（c1）: カナリア 1: pre_animation の最初の行の後
- テスト 3（c2）: カナリア 2: q.life_time を読んだ行の後
- テスト 4（c3）: カナリア 3: q.anim_time を読んだ行の後
- テスト 5（c4）: カナリア 4: ?? で守った時計（前の値と変わったら q.life_time を覚える）の後
- テスト 6（c5）: カナリア 5: 700 行目の後
- テスト 7（c6）: カナリア 6: 一度も入れていない変数を ?? なしで読んだ行の後（描かれなければ「そこで止まる」の確かめ）
- テスト 8（clockpre）: pre_animation の q.life_time（?? の時計: 選んでからの秒 x 15 単位、右へ）
- テスト 9（clockanim）: アニメーションの中の q.anim_time（選ぶと始まるアニメーション: 秒 x 15 単位、右へ）
- テスト 10（lifepre）: pre_animation の q.life_time の値（1 秒より大きければ +60 単位右に描く）
- テスト 11（animpre）: pre_animation の q.anim_time の値（0 でなければ +60 単位右に描く）
- テスト 12（ownalpha）: 自分の render controller・blend・color.a を変数で（scale は 1 のまま、不透明度だけで出し入れ）
- テスト 13（alpha0）: 自分の render controller・blend・color.a を 0（定数）: 描かれたら color.a は効かない
- テスト 14（ownuv）: 自分の render controller・uv_anim の offset を変数で（コマ 0 は透明、選ぶとコマ 2）
- テスト 15（uvconst）: 自分の render controller・uv_anim の offset を 0.5（定数）: 透明のコマ 0 から緑のコマ 2 へ（描かれたら uv_anim が効く）
- テスト 16（ownclone）: compile.js と同じ作りの枠の複製（ボーン #140・原型の名前_t0s0・奥へ 0.021・その render controller・color.a と uv を変数で）
- テスト 17（line700）: pre_animation の 700 行目の変数で出し入れ
- テスト 18（b121）: ボーン #121
- テスト 19（b126）: ボーン #126
- テスト 20（ownblend）: 自分の render controller・blend（ボーンの名前でマテリアル）

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
