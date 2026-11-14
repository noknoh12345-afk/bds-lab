# 予測（commit e5ec32d の SPEC.md 17 章のまま）

### 6 本目の予測（回す前に書いた: `--batch geoui_web_probe,geoui_title_vanilla,geoui_web`、ゲームの画面 2400 x 1080）

5 本目を受けて直したこと: GeoUI Web は F1 のカメラなし（4 本目と同じ作り: クリックが戻る見込み）。探りを先頭に（5 本目は 2 つ目の参加が戻された）。
何も入っていない対照 `geoui_title_vanilla`（ビヘイビアパックだけ、スクリプトなし）。探りの手順は 5 本目と同じ。

| 区切り | 確かめること | 予測 |
|---|---|---|
| probe title-first・title-plain・title-api | 置き換えたパネルで HELLO | **出ない**（0 %）: 5 本目の対照でも写らなかったので。出たら置き換えが効いて写し方も問題なし |
| probe title-chan | 通り道の題名 | 0 % |
| wool-shown | 赤い羊毛（対照） | 右下に赤（約 125437 px） |
| wool-cam | カメラだけ（`part cam 1`） | **赤が消える**（< 1000 px）、画面全体は変わる（> 1 %）: 自信は中 |
| wool-cam-off | カメラを戻す | 赤が戻る |
| hand-f1・wool-f1・wool-f1-off | F1（カメラつき） | 右下が変わる（> 20 %）・赤が消える（< 1000 px）・戻る |
| cam-look | F1 の間に右スティックで右へ | 画面が回る（> 30 %）、`GWP TURNED` が出る（ウェブで小さくても回ってはいた） |
| f1-chat・f1-off | 4 本目と同じ | 同じ |
| van van-title | 何も入っていないパックで HELLO | **五分五分**。出れば（> 0.1 %）GeoUI のパックのどこかが題名を隠している、出なければこのラボでは題名が写らない |
| van van-title-big・van-sub・van-actionbar | 大きな題名・サブタイトル・アクションバー（全体の違い） | アクションバーは**出る**（> 0.05 %: F1 の測りで消えたことは見ている）。題名・サブタイトルは van-title と同じ |
| web open〜close | 4 本目と同じ（カメラなし） | **全部通る**: click で紫、ptr-look が 4 本目の所 (1906..1913) ±50 px、✕ で閉じる |
| web web-title | 閉じた後の HELLO | van-title と同じ結果 |
| web hand-f1 | `gweb:f1 on` で赤い羊毛 | 赤は**残る**（カメラなし: 4 本目と同じ） |
