# run 40059578622（2026-10-24）: 手順が 1 つも動かなかった

- 出し方: `node lab.mjs app ci -a geoui_rules --screen 720x1560`（knobs なし）。
- 準備の job の「端末を作る」が 22 分 48 秒で exit 1。knobs が無いのでサインインありの端末（`APP_SIGNIN_WANTED: true`）を探し、キャッシュに無いので
  作り直した。Play が Minecraft 1.26.52.3 を入れ、タイトル画面までは来たが、Microsoft のサインインが 10 分で終わらなかった
  （`ERR 10 分でサインインが終わりませんでした（最後の画面: other）`。GitHub の公開のログより）。成果物も summary.json も無い。
- 1 本目（run 40055307539）は `--knobs "APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"` で出していた（サインインしない端末がキャッシュにある。LAN の
  参加はサインインが要らない）。
- このフォルダの predictions.json と app.txt は、この実行の前にコミットした物（`f8cf22f`）。測りが 0 個なので、同じ予測をそのまま次の実行で使う
  （app.txt は先頭の説明の行に knobs を足しただけ: 実験は同じ）。
