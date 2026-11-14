# 予測（commit 6e92766 の SPEC.md 17 章のまま）

### 13 本目の予測（回す前に書いた: A = `-a geoui_web` scenario `app-aspects.txt`、B = `-a geoui_web_ws`）

| 本 | 区切り | 予測 |
|---|---|---|
| A | x2400x1080（最初、形を知らない） | 測れたら青 (0,108)–(2400,1080)・黒なし。測れなければ携帯の 20:9 の箱（青 (0,108)–(2400,1080) と同じ所: 20:9 の箱は 2400x1080 でいっぱい — この区切りだけでは区別できない） |
| A | d-probe | 通る（プローブの行は出る） |
| A | d-c-drawn / d-c-all / d-c-none | **どれか 1 つだけ通る**。見込み: d-c-all（ゲームは描かない絵も取りに行く）が 6 割、d-c-drawn（描く物だけ: 112 個）が 3 割 |
| A | d-u-drawn / d-u-all | c と同じ側 |
| A | d-c-top・d-u-top・d-aspect | d-c-drawn が通るなら通る（2.2222）、d-c-all なら落ちる |
| A | exact-size（/web:size 2400x1080） | **青 (0,108)–(2400,1080)、黒なし**（ぴったりのページが出る: fill の直し） |
| A | box・box219 | 11 本目と同じ（測れた形があっても `size box` の後は箱のまま: box の後の測りでは形を変えない — ※ 12 本目の box は開いた時に測りが走って z に替わった。今回も形を知らなければ同じことが起きる: その時は z のページが出る） |
| A | x1920〜x2340 | 測れたら各画面いっぱい（青 (0,0.1H)–(W,H)）と最後の見込みの行が通る。測れなければ前の箱のまま、最後の行が落ちる |
| A | fit | 印（左右の端に rose の線）、2.2222、ページがいっぱい |
| B | connect → ocr-connect / ocr-denied → linked-keys | キーで打てたなら ocr-connect が通る見込み。つながれば linked-keys |
| B | connect-chat | linked-keys が通っていればもう一度つながる（`again` 付きの linked）。通っていなければ、Android の input text で打って試す（3 本目は届かなかった） |
| B | open〜close | つながれば HTTP 版と同じ |
