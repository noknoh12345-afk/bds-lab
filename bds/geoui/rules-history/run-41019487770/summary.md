# run 41019487770 の公開のまとめ（GitHub のチェック「app: 結果」の要約を写したもの）

summary.json（成果物）はこのセッションから取り出せなかったので、チェックの要約の数を写した。写真とログは results.sealed。

- 結果: PASS、手順 309・落ちた 0。アプリ 1.26.60.4、BDS 1.26.60.6。全体 875 秒。BDS の起こし直し: geoui_web_probe 0 秒・geoui_title_vanilla 3.8 秒・geoui_web 4.6 秒

| 写真 | 行 | 種類 | 範囲 | 結果 |
|---|---|---|---|---|
| title-first・title-chan・title-plain・title-api | 43・49・53・58 | diff | (900,300)–(1500,700) | すべて 0 % |
| wool-shown | 77 | marks | 全体 | red 127853 px (1600,786)–(2178,1080) |
| wool-cam | 81 | marks | 全体 | **赤なし**（chartreuse 121870 px (1600,600)–(2400,1080)） |
| wool-cam | 82 | diff | 全体 | 31.947 %（4677 か所） |
| wool-cam-off | 86 | marks | 全体 | red 127853 px・chartreuse 43428 px |
| hand-empty | 90 | diff | (1600,600)–(2400,1080) | 14.767 % |
| hand-f1 | 94 | diff | 同 | 39.848 % |
| wool-f1 | 98 | marks | 全体 | **赤なし**（chartreuse 152738 px） |
| wool-f1 | 99 | diff | 全体 | 32.799 % |
| wool-f1-off | 103 | marks | 全体 | red 127853 px・chartreuse 43428 px |
| cam-look | 117 | diff | 全体 | 16.303 %（(0,107)–(2400,1080)）、`until server GWP TURNED` は通った |
| f1-chat | 135・136 | diff | 全体・(0,0)–(1200,500) | 0 %・0 % |
| f1-off | 140・141 | diff | 全体・(700,940)–(1700,1080) | 27.159 %・75.271 % |
| van-title | 177 | diff | (900,300)–(1500,700) | **0 %** |
| van-title | 178 | diff | 全体 | 2.378 %（6 か所、最初 (0,128)–(952,173): 真ん中ではない） |
| van-title-big | 185 | diff | 全体 | 8.100 %（最初 (1844,521)–(2400,1041): 右の端） |
| van-sub | 189 | diff | 全体 | 5.712 %（最初 (1972,393)–(2400,792)） |
| van-actionbar | 193 | diff | 全体 | 8.822 %（最初 (1767,521)–(2400,952)） |
| open-blue〜back-blue | 218〜249 | marks | 全体 | 4 本目と同じ（click で violet 2332368 px、back で blue）。ptr-look の印 (1638,537)–(1645,544) |
| scrolled・wheel・dyn-later・typed・wiki・youtube・panel | 259〜302 | diff | | 89.986・89.986・0.733・89.873・89.895・90.090・29.023 % |
| closed | 312・313 | diff | 全体・下の帯 | 96.735 %・74.439 % |
| web-title | 322 | diff | (900,300)–(1500,700) | 0 % |
| hand-shown・hand-f1・hand-back | 328・332・336 | marks | 全体 | red 127853・132084・127853 px（ブラウザの F1 はカメラなし: 赤は残る） |
