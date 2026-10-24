# geoui_rules — GeoUI の規則を本物の画面で決める

## Request
「規則を見つけて GeoUI によるマイクラの反映設計を全て網羅してさらに深めて」。規則の台帳は bds/geoui/RULES.md。その中の
仮説（まだ本物の画面で決まっていない規則）を、走らせる前に書いた予測（predictions.json）と比べて決める。
作り方: `node bds/geoui/screen/rules.mjs`（このフォルダはそれが書く。手で直さない）。

## 1 本目で決まった事（run 40055307539: bds/geoui/rules-history/run-40055307539/）
- R4.1: renderer の 1 モデル単位 = scripts.scale / 16 x パネルの短い辺（scale 0.5・0.75・1・1.5 でぴったり）
- R4.2: 原点はパネルの真ん中の 24 モデル単位下（scale によらない）
- R4.8: プレイヤーの minecraft:scale が単位に掛かる（体が半分なら GeoUI も半分）
- R2.3: しゃがむ・眠る・泳ぐのアニメーション・ボート・三人称で GeoUI は動かない
- R3.7: カメラを向いた板の色 = 0.757 x 入れた色（まっすぐ・昼も夜も同じ）

## What it decides now (app.txt)
- R3.11 白を白に: cutout（基準）・fade に render controller の色 1.32・USE_OVERLAY の材質に overlay_color 0.24・USE_EMISSIVE の材質とテクスチャのアルファ
- R4.10 奥行き: z −150〜150 の四角（空の前・地面の前）・10 離れた 2 枚の前後・z 0 と 50 の長い板
- R3.12 面の向き: y と x のまわりに −60〜60° 傾けた板（1 本目で描かれなかった右 45° を同じ所と左端で）
- R3.9 透明化 · R3.8 ダメージの点滅（3 回、USE_OVERLAY の有り無し）· R4.9 体の大きさを打ち消す（scale / q.model_scale）
- R3.7 暗視・閉じた箱 · R5.3 GUI の倍率の決まり（6 画面）· 対照: scale 0.9375・1 と目盛りの黒い板（z 100）

## Run
`node lab.mjs app ci -a geoui_rules --screen 720x1560`（人の許可をもらってから。1 本目と同じ 1560 x 720 の画面: 測る箱はこの画面の px）→ `node bds/geoui/screen/rules.mjs verdict <summary.json>`。

## Acceptance (one tests.txt `## ` section each)
- [ ] 読み込める（プロパティが既定値）
- [ ] 表示と UI の中の scale・打ち消し・色の倍率・重ねる色を変える
- [ ] サーバーからしゃがませる・アニメーション
- [ ] 体の大きさ（minecraft:scale 0.5、他のアドオンがするように）
- [ ] 乗り物（ボートに乗る・降りる）
- [ ] 閉じた箱を作って壊す（app.txt の light-box と同じコマンド）
