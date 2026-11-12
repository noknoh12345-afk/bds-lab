# redroid レーン枝の控え（2026-11-12）

Skin Studio 3.4.5 の一括検証（batch check 2・3・4）で作られた `claude/redroid-ss2-*`・`ss3-*`・`ss4-*` の枝 1458 本の控えです。
どの枝も、土台のコミットに `bds/addons/skin_studio/app.txt`（その場面の手順）を 1 つ変えたコミットを 1 つ載せただけで、実行は終わっています。結果は Actions の実行とその成果物にあります（枝を消しても残ります）。

- `manifest.tsv`：枝の名前・コミット・日時・件名
- `ss2/`・`ss3/`・`ss4/`：枝ごとの `app.txt`（`<枝の名前から claude/redroid- を除いたもの>.app.txt`）
- このコミットの親は、各回の最初の枝のコミットです（土台のツリーがそこから辿れます）

枝を作り直すには：その回の親コミットを土台に `bds/addons/skin_studio/app.txt` をここの内容に置き換えてコミットし、manifest の名前で push します。
