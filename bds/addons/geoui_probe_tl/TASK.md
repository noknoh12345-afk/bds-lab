# geoui_probe_tl — GeoUI のタイムラインの書き出し（compile.js）をそのまま確かめる

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- シーケンスのトラック（bar: 毎秒 10 単位右へ）と、テンプレート blip（点。実体 4 つ・枠 2 baked）。
- play と pause で時刻を止めて写す（q.life_time が進まなくても st は seq_from）。最後に止めずに再生して、時間が進むかを見る。
- テスト 1（st2）: 止めて st = 2: バーは +20 単位、i1 の点（2 列目）
- テスト 2（st4）: 止めて st = 4: バーは +40、i2 の点（3 列目）
- テスト 3（st6）: 止めて st = 6: バーは +60、i3 と i4 の点（別の枠）
- テスト 4（run）: 0 秒から再生: 2.5 秒と 4 秒で写す（時間が進めばバーが +25・+40、4 秒で i2 の点）

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
