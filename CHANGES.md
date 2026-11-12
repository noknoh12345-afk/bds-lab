# bds-lab の変更

## v2.0.0 (2026-11-12) — 安定版

`main` を、アドオンを作って本物のサーバーで確かめるのに要るものだけにしました。v1.24.0 までの全機能と変更履歴は `dev` ブランチ（切り替え前の状態はタグ `pre-stable`）にあります。

- **残したもの**：`bds new`・`add`・`go`・`sim`・`why`・`run`・`import`・`gaps`・`mutate`・`chaos`・`record`・`api`・`doc`・`sample`・`ts`・`bb`・`skill`・`help`・`status`・`checkpoint`/`undo`・`deploy`・`upkeep`、kit、本物のプレイヤー、スキル 13 本、見本のアドオン 12 本、ベンチ。
- **`dev` に移したもの**：管理パネルとサインイン、Actions の貸し借り、クラフターズコロニー、予約、通知、配布、自動操縦、スキルの自動成長、fanout、GeoUI、本物のアプリでの確認、Endstone、LeviLamina。
- `dev` にしかないコマンドは `not in the stable branch` と 1 行で答えます。
- `AGENTS.md` は約 10 KB から約 5 KB になりました。
- CI は「オフラインのテスト全部」と「見本のアドオン全部を本物の BDS で `go`」の 2 つだけです。
