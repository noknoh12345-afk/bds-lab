# geoui_web_title_ctl — 題名の対照（GeoUI の 5 本目）

## Request
geoui_web_probe で普通の題名（`/title @a title HELLO`）がどのやり方でも写らなかった（bds/geoui/RULES.md R10.14）。同じパックでゲームの題名を
隠さない物（titleHide: none）を本物のアプリで回し、HELLO が写るかを見る。作り方: `node bds/geoui/web/probe.mjs`（このフォルダはそれが書く。手で直さない）。

## What it is
- geoui_web_probe と同じ（URL の画像・F1・`/scriptevent gwp:…`）。違いはゲームの題名を隠さないことだけ: 通り道の題名（`~gu~…`）も画面に文字で出る。
- 写るなら原因は題名の隠し方（probe は 5 本目から hud_title_text_area の置き換え）、写らないならラボ・写し方の側。

## Maintenance
- 2026-10-30 BDS 1.26.61.1: moved to stable APIs
- 2026-10-31 BDS 1.26.61.1: moved to stable APIs
