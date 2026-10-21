# geoui_probe — GeoUI の作りの確かめ（ボーンの番号・自分の render controller・時間）

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- ボーンは 249 本（geoui_rhythm と同じ数）。テストのボーンは決まった番号に置き、間は画面の外の小さな板で埋める。
- 自分の render controller は 31 個（6〜30 個目は何も描かない）。共有の render controller はそれらのボーンを part_visibility で描かない。
- 時計の 3 つは、選んでから 1.5 秒と 3 秒で写す（毎秒 15 単位で右へ動けば、その時間が進んでいる）。
- テスト 1（ctl）: 基準: ボーン #1・共有の render controller・scale で出し入れ
- テスト 2（clockpre）: pre_animation の q.life_time（選んでからの秒 x 15 単位、右へ）
- テスト 3（clockanim）: アニメーションの中の q.anim_time（選ぶと始まるアニメーション: 秒 x 15 単位、右へ）
- テスト 4（clocklife）: アニメーションの中の q.life_time（動けば「アニメーションが始まってから」、+90 で止まれば実体の寿命）
- テスト 5（b60）: ボーン #60（共有の render controller）
- テスト 6（b115）: ボーン #115
- テスト 7（b121）: ボーン #121（geoui_rhythm で映った最後の番号）
- テスト 8（b122）: ボーン #122（geoui_rhythm で枠の複製が始まった番号）
- テスト 9（b126）: ボーン #126
- テスト 10（b130）: ボーン #130
- テスト 11（b200）: ボーン #200
- テスト 12（b248）: ボーン #248（249 本の最後）
- テスト 13（own1）: 自分の render controller（共有のジオメトリに part_visibility）・cutout
- テスト 14（ownblend）: 自分の render controller・blend（ボーンの名前でマテリアル）
- テスト 15（ownalpha）: 自分の render controller・color.a を変数で（scale は 1 のまま、不透明度だけで出し入れ）
- テスト 16（ownuv）: 自分の render controller・uv_anim の offset を式で（コマ 0 は透明、選ぶとコマ 2）
- テスト 17（ownclone）: compile.js と同じ作りの枠の複製（ボーン #140・原型の名前_t0s0・奥へ 0.021・その render controller）
- テスト 18（own31）: 31 個目の自分の render controller（6〜30 個目は何も描かない複製）
- テスト 19（line700）: pre_animation の 700 行目の変数で出し入れ

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
