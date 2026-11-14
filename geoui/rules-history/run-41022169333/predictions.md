# 予測（commit 2b1aedf の SPEC.md 17 章のまま）

### 7 本目の予測（回す前に書いた: `-a geoui_web`、ゲームの画面 2400 x 1080）

6 本目を受けて直したこと: ブラウザを開いている間の F1 はカメラなし、`/web:f1`・`gweb:f1`（F1 だけ）はカメラ `gweb:eye` つき。手順は 6 本目と同じ。

| 区切り | 予測 |
|---|---|
| open〜close | 6 本目と同じく全部通る（カメラなし） |
| hand-shown | 赤（約 127853 px） |
| hand-f1（`gweb:f1 on`） | **赤が消える**（< 1000 px） |
| hand-back（`gweb:f1 off`） | 赤が戻る |
