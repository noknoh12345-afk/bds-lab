# bds-lab の変更

## 次の版（作業中）

- **LeviKit の Endstone プラグイン**：ワールドの出入りで動くコマンドの `{player}` を、引用符で囲んだ 1 語で入れます（空白のある名前で壊れず、Xbox の認証なしのサーバーで `@a` という名前でも全員が対象になりません）。config.json と状態のファイルは書き切ってから置き換えます。本物の Endstone で 38/38。
- **安全性の見直し**：LeviKit の 3D ビューでプレイヤー名・ワールド名がそのまま HTML になっていたのを直しました（細工した名前で管理者のブラウザにスクリプトを流せました）。LeviKit のパネルに CSP（スクリプトは自分のファイルだけ）。プロキシの後ろでのログイン試行回数の制限が、送り手の書いた IP で外せたのを直しました。Node.js のダウンロードをチェックサムで確かめてから展開します。`vps/runner-setup.sh` は root で動くので、受け取る値を 1 つずつ確かめます。
- **`home` のネザーの試験**：空中に置いたプレイヤーが落ちて死に、再起動のあとにどちらの世界に戻るかで結果が変わっていました（CI で 1 回落ちた原因）。足場と無敵を付け、再起動のあとはオーバーワールドに置いてから帰宅させ、世界の移動を待って確かめます。移動しないバグを入れると落ちるようになりました（前は通っていました）。
- **`go all`：全ユニットを同時に**（`common/goall.mjs`）。ユニットごとに `go` を別プロセスで、コア数（1 つ 1.5 GB、最大 8）ぶん同時に走らせます。前回長かったものから始めます。2 コアの機械で 12 本が 8 分 36 秒 → 4 分 18 秒（どのユニットの時間も変わらず、やり直しなし）。基準は下げません: 並べて走って DONE にならなかったユニットは、ほかを止めて単独でもう一度走らせ、その結果を採ります（`W` の行で必ず名前を出します）。コア数より多く並べると失敗が出ました（2 コアに 4 本で 2 本が単独やり直し）ので、既定はコア数までです。
- **CI（verify）：アドオン 1 本に 1 ジョブ**。12 本を 1 ジョブで順に（8〜9 分）走らせていたのを、ユニットごとのジョブを同時に。サーバーの隣で何も動かないので QA の計測は単独のときと同じです。結果は今までどおり `bds` の 1 つにまとまります。
- **selftest：同時に 3 サーバーまで**（セクション・キットの beta・キットの stable。キットの `go` は今までどおり単独）。2 コアで 2 分 20 秒 → 1 分 42 秒。`LAB_SELFTEST_PARALLEL=0` で 1 つずつ。
- **1 行で導入**：`install.sh`（Linux・macOS・WSL）と `install.ps1`（Windows）。何もないパソコンで、ラボの取得（git がなければ tarball / zip）、OS のパッケージ（apt・dnf・yum・zypper・pacman）、Node.js 22、サーバー、selftest まで。もう一度実行すると更新。`.github/workflows/install.yml` が Ubuntu 22.04 / 24.04、Debian 12 / 13、Fedora、Rocky 9、Arch、openSUSE、Windows（PowerShell 5.1 / 7）、macOS で確かめます。Alpine（musl）は理由を言って止まります。`setup.cmd`（Windows の `setup.sh`）。`setup.sh` は apt 以外のパッケージマネージャーにも対応。
- **VPS を GitHub Actions のランナーに**：`vps/runner-setup.sh`（sudo のない専用ユーザー、ランナー本体は SHA-256 を確かめて入れる、systemd のサービス）と `.github/workflows/vps.yml`（手動起動だけ。引数はシェルを通さず `lab.mjs` へ）。
- **selftest が新しいフォルダーで必ず FAIL していたのを直しました**：selftest が作るキットのアドオンに日本語の説明がなく、自分の QA（`pack.description is still English`）に落ちていました。
- **ARM の Linux では BDS を Docker（amd64）で動かすのを既定に**：BDS は x86-64 の Linux と Windows にしかないので、そのまま起動して失敗する代わりに、macOS と同じ道を通ります（`LAB_RUNTIME=native` で元の動き）。
- `.gitattributes`：`.sh` は LF、`.cmd` と `.ps1` は CRLF（Windows で `autocrlf` が有効でも WSL や Git Bash で `.sh` が動くように）。
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
