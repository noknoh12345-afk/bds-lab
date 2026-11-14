# 予測（commit a00a46e の SPEC.md 17 章のまま）

### 5 本目の予測（回す前に書いた: `--batch geoui_web_title_ctl,geoui_web_probe,geoui_web`、ゲームの画面 2400 x 1080）

4 本目を受けて直したこと: (1) 題名は `hud_title_text` に触らず、`root_panel` の `hud_title_text_area` を同じファクトリー + `#visible` の
パネル（`gwp_title_area`）に置き換える（`insert_after` してから元を `remove`）。**対照** `geoui_web_title_ctl` = 探りと同じパックで題名を
隠さない（`titleHide: none`）。どちらも参加の後、通り道を送る前の普通の題名（title-first）から測る。(2) F1 の持ち物はカメラ `gwp:eye`
（follow_orbit を継いだ目の所・半径 0.1）で消す（`gwp:part cam 1` でカメラだけも）。BDS 1.26.61.1 の試験でプリセットが読め、
`camera.setCamera`・`setControlScheme` が通ることは確かめた（`node lab.mjs bds test -a geoui_web_probe` 26/26）。

| 区切り | 確かめること | 予測 |
|---|---|---|
| ctl title-first | 対照: 何も送る前の `/title @a title HELLO` | **出る**（真ん中の帯の違い > 0.1 %）。出なければ、このラボ・この写し方では題名が写らない（以下の題名の予測は全部「分からない」に） |
| ctl title-chan | 対照: 通り道の題名（隠さない） | 通り道の文字（`~gu~0a…`）が帯に出る（> 0.1 %） |
| ctl title-plain・title-api | 対照: 通り道の後の HELLO | 出る（> 0.1 %） |
| probe title-first | 置き換えたパネルで、何も送る前の HELLO | **出る**（> 0.1 %）: 自信は中（`control_name` の `insert_after`・`remove` の書き方が効かないと、元のまま = 出るが通り道も見える、または何も出ない） |
| probe title-chan | 通り道の題名 | 見えない（帯 0 %） |
| probe title-plain・title-api | 通り道の後の HELLO | **出る**（> 0.1 %） |
| wool-shown | 赤い羊毛（対照） | 右下に赤（4 本目と同じ 約 125437 px） |
| wool-cam | カメラだけ（`part cam 1`） | **赤が消える**（右下の赤 < 1000 px）。画面全体は変わる（視点が目の所の 3 人称に: 違い > 1 %）。自信は中（follow_orbit の半径 0.1 で 1 人称に戻されることがあれば消えない） |
| wool-cam-off | カメラを戻す | 赤が戻る（約 125437 px） |
| hand-f1 | 空の手で F1（腕・カメラ） | 右下が変わる（> 20 %） |
| wool-f1 | F1 で赤い羊毛 | **赤が消える**（< 1000 px）。F1 を切ると戻る（wool-f1-off 約 125437 px） |
| cam-look | F1（カメラ）の間に右スティックで右へ | 画面が回る（違い > 30 %）、`gwp:rot` で向きが 20° より回る（`until server GWP TURNED`） |
| f1-chat・f1-off | （4 本目と同じ） | 同じ（0 %・ホットバーが戻る） |
| web open〜close | （4 本目と同じ。開く時に F1 = カメラも） | 同じ。**ptr-look**: カメラの間も右スティックでポインタが右へ動く（4 本目の (1906..1913, 537..544) と同じ所 ±50 px）。自信は中 |
| web web-title | 閉じた後の HELLO | **出る**（> 0.1 %） |
| web hand-f1 | `gweb:f1 on` で赤い羊毛 | **赤が消える**（< 1000 px）、off で戻る |
