# geoui_probe_m — GeoUI の Molang の長さ・深さの確かめ（pre_animation）

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- 式: split 16005 文字・w1000 951 文字・d24 527 文字（split はそれを 17 行に分けた物）、tbl 265 行。各行の後にカナリア。
- 1 回目（2026-10-21）は長い式（3 万・10 万文字、入れ子 400 段）と 600 本のジオメトリを 1 つのパックに入れ、何も描かれなかった。2・3 回目（6000〜16000 文字・入れ子 54 と 100 段も入れた物）は、アプリがそのワールドに 3 回とも入れなかった（BDS は読み込み、手元のクライアントは入れた）。書き出しはどちらの形も出さないので、ここでは書き出しが出す形だけを確かめる。
- テスト 1（ctl）: 基準: ふつうのボーン・scale で出し入れ
- テスト 2（split）: 入れ子なし 16000 文字を compile.js の splitLines で 1000 文字以下・深さ 24 以下の行に分けた物（書き出しはこの形）（split の式の板）
- テスト 3（split_c）: カナリア: 入れ子なし 16000 文字を compile.js の splitLines で 1000 文字以下・深さ 24 以下の行に分けた物（書き出しはこの形） の行の後
- テスト 4（w1000）: 入れ子なし 1000 文字の 1 行（書き出しの 1 行の上限）（w1000 の式の板）
- テスト 5（w1000_c）: カナリア: 入れ子なし 1000 文字の 1 行（書き出しの 1 行の上限） の行の後
- テスト 6（d24）: 入れ子 24 段（書き出しの深さの上限）（d24 の式の板）
- テスト 7（d24_c）: カナリア: 入れ子 24 段（書き出しの深さの上限） の行の後
- テスト 8（tbl）: 2000 個の焼き込みの実体の引き方（compile.js の searchLines と tableLines: 16 個ずつの組と二分木）で 1500 個目を引く（tbl の式の板）
- テスト 9（tbl_c）: カナリア: 2000 個の焼き込みの実体の引き方（compile.js の searchLines と tableLines: 16 個ずつの組と二分木）で 1500 個目を引く の行の後
- テスト 10（lines）: pre_animation に 3000 行・45 万文字（その後の行で 2999 行目の値を読む）（lines の式の板）
- テスト 11（lines_c）: カナリア: pre_animation に 3000 行・45 万文字（その後の行で 2999 行目の値を読む） の行の後

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
