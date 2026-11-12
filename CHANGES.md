# bds-lab の変更

## 次の版（作業中）

- **日本語**：`go` の QA が、`ja_JP.lang` の名前や説明が英語のまま残っているのを見つけます（`Q … is still English`）。`bds new … ja="説明"` で日本語の説明を最初から入れられます。`sample rp/texts/ja_JP.lang <語>` でゲーム本来の日本語名を引けます（diamond_sword → ダイヤモンドの剣）。見本 10 本の説明を日本語にしました。
- **スキル**：日本語の規則を 3 つ足しました（`bds-content`：名前と説明の日本語、`bds-forms`：プレイヤーが読む文、`bds-deliver`：報告文）。
- **テスト**：tests.txt の `js` で `count(p('A'),'ns:id')` が使えます（kit の `count` と同じ感覚で書いて失敗していました）。
- **CI**：`go` が失敗した見本の出力が見えるようになりました。jelly の見本の待ち時間を、遅いランナーでも足りる長さにしました。
- 切り替え前の状態は `pre-stable` ブランチにあります（タグはこの環境から作れませんでした）。

## v2.0.0 (2026-11-12) — 安定版

`main` を、アドオンを作って本物のサーバーで確かめるのに要るものだけにしました。v1.24.0 までの全機能と変更履歴は `dev` ブランチ（切り替え前の状態は `pre-stable` ブランチ）にあります。

- **残したもの**：`bds new`・`add`・`go`・`sim`・`why`・`run`・`import`・`gaps`・`mutate`・`chaos`・`record`・`api`・`doc`・`sample`・`ts`・`bb`・`skill`・`help`・`status`・`checkpoint`/`undo`・`deploy`・`upkeep`、kit、本物のプレイヤー、スキル 13 本、見本のアドオン 12 本、ベンチ。
- **`dev` に移したもの**：管理パネルとサインイン、Actions の貸し借り、クラフターズコロニー、予約、通知、配布、自動操縦、スキルの自動成長、fanout、GeoUI、本物のアプリでの確認、Endstone、LeviLamina。
- `dev` にしかないコマンドは `not in the stable branch` と 1 行で答えます。
- `AGENTS.md` は約 10 KB から約 5 KB になりました。
- CI は「オフラインのテスト全部」と「見本のアドオン全部を本物の BDS で `go`」の 2 つだけです。
