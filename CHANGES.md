# bds-lab の変更

## 次の版（作業中）

- **LeviKit を追加**（`levikit/`）：Linux VPS のサーバー運用セット。管理パネル、動かしたままのバックアップ／復元／再起動、ワールドごとのルール、ワープ、`/tpa`、BAN、メンテナンス、スケジュール、地図。
  - **LeviLamina 版**（`install.sh`）：MoreDimensions の追加ワールド、リセット・取り込み・複製、マルチプロトコル。C++ Mod `levikit-core` は CI の Windows ランナーでビルドし、本物の LeviLamina サーバーで 1 回起動して確かめます。
  - **Endstone 版**（`install-endstone.sh`）：Wine もビルドも不要。同じパネルを、Python プラグイン `endstone-levikit` が動かします。ワールドはバニラの 3 つです。本物の Endstone サーバーと本物のクライアントで確かめています（試験 36 行、QA 込み）。
  - **本物の LeviLamina 26.51.9 で起動して見つけた不具合を直しました**（CI の Windows ランナー）:
    - `levikit-core` がビルドできなかった（コマンドの引数の型が無名名前空間にあり、clang + boost.pfr でエラー）。
    - 起動してもワールドの用意と `READY` が走らなかった（Mod が有効になる前に ServerStartedEvent が済んでいた）。
    - パネルが起動完了を検出できなかった（LeviLamina の行は `Server started in (1.9s)!` で、`Server started.` ではない）。
  - パネルは Endstone のログの形（`[時刻 INFO]: …`）も読めるようになりました（バックアップのファイル一覧が壊れていました）。
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
