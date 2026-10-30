# geoui_title_vanilla — 題名の対照（GeoUI の 6 本目）

## Request
GeoUI の探りでも、題名を隠さない対照（geoui_web_title_ctl）でも、普通の題名（`/title @a title HELLO`）が写らなかった（bds/geoui/RULES.md R10.14、
run 41015216177）。リソースパックもスクリプトも無いワールドで同じ題名を出し、このラボの写し方で題名が写るかを見る。
作り方: `node bds/geoui/web/probe.mjs`（このフォルダはそれが書く。手で直さない）。

## What it is
- 中身の無いビヘイビアパックだけ。app.txt で題名・大きな題名・サブタイトル・アクションバーを出して写す。
