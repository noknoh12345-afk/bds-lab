# geoui_probe_tl — GeoUI のタイムラインの書き出し（compile.js）をそのまま確かめる

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、`measure diff` が変わった所を数で出す。`node bds/geoui/timeline/probe.mjs read <summary.json>` が読む。

## What it is
- シーケンスのトラック（bar: 毎秒 10 単位右へ）、fader（4 秒かけて不透明度 0 → 1: 色を測る）と、テンプレート blip（点。実体 4 つ・枠 2 baked）。
- 0 秒から再生してすぐ止め、止めたまま seek で時刻を決めて写す（止めたままの seek はその時刻ちょうど）。最後に止めずに再生して、時間が進むかを見る。
- 最後にポーズ画面を開く（人形 = paper doll。compile.js はそこでプロパティを読まない: コンテンツログに何も出ないこと）。
- テスト 1（st0）: 止めて st = 0: バーは +0（休みと同じ）、fader は不透明度 0（透明なら fade が効く）
- テスト 2（st2）: 止めて st = 2: バーは +20 単位、i1 の点（2 列目）、fader は 0.5
- テスト 3（st4）: 止めて st = 4: バーは +40、i2 の点（3 列目）、fader は 1
- テスト 4（st6）: 止めて st = 6: バーは +60、i3 と i4 の点（別の枠）
- テスト 5（run）: 0 秒から再生: 2.5 秒と 4 秒で写す（時間が進めばバーが +25・+40、4 秒で i2 の点）

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
