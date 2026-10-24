# geoui_rules — GeoUI の規則を本物の画面で決める

## Request
「規則を見つけて GeoUI によるマイクラの反映設計を全て網羅してさらに深めて」。規則の台帳は bds/geoui/RULES.md。その中の
仮説（まだ本物の画面で決まっていない規則）を、走らせる前に書いた予測（predictions.json）と比べて決める。
作り方: `node bds/geoui/screen/rules.mjs`（このフォルダはそれが書く。手で直さない）。

## What it decides
- R4.1: renderer の 1 モデル単位 = scripts.scale / 16 x パネルの短い辺（UI の中だけ scale を 0.5・0.75・1・1.5 に。目盛りの高さが 160 / scale になるか）
- R4.2: 原点のずれ D がモデルの単位で決まっているか、ブロックで決まっているか（目盛りの中心で分ける）
- R4.8: プレイヤーの minecraft:scale（他のアドオンが変える）に renderer が付いてくるか
- R2.3: しゃがむ（サーバーから）・眠る・泳ぐのアニメーション・ボート・三人称（後ろ・前）で GeoUI が動かないか
- R3.7: 板の色にかかる光（9 段の灰色と 5 枚の傾けた白、昼・夜・暗視・閉じた石の箱）
- R3.8・R3.9: ダメージの赤い点滅・透明化
- R5.3: GUI の倍率の決まり（6 つの画面で、A = min(⌊幅/320⌋, ⌊高さ/240⌋) と B = ⌊高さ/240⌋ を分ける）

## Run
`node lab.mjs app ci -a geoui_rules --screen 720x1560`（人の許可をもらってから）→ `node bds/geoui/screen/rules.mjs verdict <summary.json>`。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）
- [ ] 表示と UI の中の scale を変える
- [ ] サーバーからしゃがませる・アニメーション
- [ ] 体の大きさ（minecraft:scale 0.5、他のアドオンがするように）
- [ ] 乗り物（ボートに乗る・降りる）
