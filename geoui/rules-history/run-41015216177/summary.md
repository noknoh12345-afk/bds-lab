# run 41015216177 の公開のまとめ（GitHub のチェック「app: 結果」id 123940507945 の要約を写したもの）

summary.json（成果物 app-geoui_web_title_ctl-41015216177）はこのセッションから取り出せなかったので、チェックの要約の数を写した。
写真とログは results.sealed（手元で `node lab.mjs app ci watch 41015216177`、APP_CACHE_KEY が要る）。

- 結果: FAIL、手順 177・落ちた 5（手順 60 = 行 71 joined-back-out、99 = 行 243 timeout、102 = 行 250 timeout、132 = 行 286 timeout、154 = 行 313 timeout）
- 版: アプリ 1.26.60.4、BDS 1.26.60.6。全体 1716 秒。BDS の起こし直し: geoui_web_title_ctl 0 秒・geoui_web_probe 4.2 秒・geoui_web 4.2 秒
- 行の番号はバッチの手順（geoui_web_title_ctl → geoui_web_probe → geoui_web: lib/scenario.mjs batchScenario）。行 71 = geoui_web_probe の `until joined`
  （探りの参加が戻されて、探りの区切りは全部飛んだ）。行 243 = geoui_web の click の `until server GWEB page .*c=8000ff`、250 = back、286 = type、313 = close。

| 写真 | 行 | 種類 | 範囲 | 結果 |
|---|---|---|---|---|
| title-first | 43 | diff | (900,300)–(1500,700) | 0.000 %（0 か所） |
| title-chan | 49 | diff | 同 | 0.000 % |
| title-plain | 53 | diff | 同 | 0.000 % |
| title-api | 58 | diff | 同 | 0.000 % |
| open-blue | 222 | marks | 全体 | 99.989 %: blue 2332412 px (0,108)–(2400,1080)・red 62 (2350,71)–(2364,85)・orange 87・azure 98・white 255736・gray 967 |
| open-blue | 223 | diff | 全体 | 99.989 %（1 か所 (0,0)–(2400,1080)） |
| open-tip | 227 | marks | 全体 | rose 49 px (1197,537)–(1204,544) |
| ptr-left | 233 | marks | 全体 | rose 49 px (597,537)–(604,544) |
| ptr-look | 237 | marks | 全体 | rose 49 px **(1588,537)–(1595,544)**（4 本目は (1906,537)–(1913,544)） |
| scrolled | 263 | diff | 全体 | 89.986 % (0,108)–(2400,1080) |
| wheel | 267 | diff | 全体 | 89.986 % |
| dyn-later | 276 | diff | 全体 | 0.709 %（88 か所 (442,332)–(2356,914)） |
| wiki | 296 | diff | 全体 | 89.895 % |
| youtube | 301 | diff | 全体 | 90.090 % |
| panel | 306 | diff | 全体 | 29.017 % |
| web-title | 326 | diff | (900,300)–(1500,700) | 81.388 %（✕ で閉じられずページが出たままの所: 題名の測りにならない） |
| hand-shown | 332 | marks | (1600,600)–(2400,1080) | 赤なし（rose 28 px だけ: ページが出たまま） |
| hand-f1 | 336 | marks | 同 | 同 |
| hand-back | 340 | marks | 同 | 同 |
