# geoui_probe_m — GeoUI の Molang の長さ・深さと、600 本のジオメトリの確かめ

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- 式の長さ: pre16 366 文字・pre54 1240 文字・pre150 3448 文字・pref8k 8010 文字・ch54 1240 文字・ch400 9198 文字・chf30k 30006 文字・chf100k 100011 文字。アニメーションの式は 1 つずつ別のファイル（読めない物が他を巻き込まない）。
- 600 本のジオメトリは 2 枚目のテクスチャ（big）の、自分の render controller で描く。
- テスト 1（ctl）: 基準: ふつうのボーン・scale で出し入れ
- テスト 2（pre16）: pre_animation: 入れ子 16 段
- テスト 3（pre54）: pre_animation: 入れ子 54 段（geoui_rhythm のスライダーの玉と同じ深さ）
- テスト 4（pre150）: pre_animation: 入れ子 150 段
- テスト 5（pref8k）: pre_animation: 入れ子なし 8000 文字
- テスト 6（ch54）: アニメーションの式: 入れ子 54 段
- テスト 7（ch400）: アニメーションの式: 入れ子 400 段
- テスト 8（chf30k）: アニメーションの式: 入れ子なし 30000 文字
- テスト 9（chf100k）: アニメーションの式: 入れ子なし 100000 文字
- テスト 10（big1）: 600 本のジオメトリ（2 枚目のテクスチャ・自分の render controller）のボーン #1
- テスト 11（big300）: 600 本のジオメトリのボーン #300
- テスト 12（big599）: 600 本のジオメトリのボーン #599

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
