# bds-lab の構成（安定版）

AI が毎回読むのは `AGENTS.md` だけです。この文書は、ラボ自体を変える人と AI のための地図です。

## 層

```
入口      lab.mjs                  コマンドの振り分け・bg/wait・patch/apply/verify・setup・cache
            │
ラボ      bds/                     flavor.mjs に BDS アドオンの決まりだけ
            │
エンジン  common/core.mjs          new・add・build・check・test・go・qa・pack・up/live・run・api・doc …
          common/*.mjs             下の「モジュールの地図」
            │
道具      sandbox-be/              実機で測った仮想世界（sim・ts try）
          bds/addons/ts_repl/      生きた世界で TypeScript を流す（ts）
          bedrock-binary/          BDS 本体に書かれていて文書に無いもの（bb）
            │
知識      skills/                  SKILL.md（手順）・knowledge.json（証拠つきの規則）・probes/（規則を実機で確かめる）
          bds/bench/               課題と隠しテスト（tasks.json）・参照解（solution.mjs）
```

`levikit/` はサーバー運用セット（管理パネル、LeviLamina の Mod、Endstone のプラグイン）で、上の層とは独立しています。ラボのコマンドは使わず、自分のテストと CI（`.github/workflows/levikit.yml`）を持ちます。

## 主な流れ

| 流れ | 入口 | 中身 |
|---|---|---|
| 作る | `bds new` → `add` → `go` | ひな形 → 中身 → ビルド・型検査・スキーマ → 本物のサーバーでテスト → QA → `.mcaddon` |
| 直す | `import` → `go` | 人のアドオンを読み（`brief.mjs`）、入口ごとのテストの下書きを作る |
| 原因を探す | `why`・`shrink`・`run`・`bisect` | 失敗した節を分解し、値と通らなかったフックを出す |
| テストを鍛える | `gaps`・`mutate`・`chaos`・`record`・`flaky` | テストが通らないコード、気付かない不具合、ランダムな遊び |
| 保つ | `upkeep`・`maint`・`maintain` | Minecraft の更新に合わせて点検し、直す |

## モジュールの地図（common/）

| 区分 | モジュール |
|---|---|
| 入口・環境 | `status.mjs`（状況と次の 1 手・`clean`）・`netenv.mjs`（プロキシと証明書）・`runtime.mjs`（ホストかコンテナか）・`secrets.mjs`（.env）・`secret-scan.mjs`（鍵の漏れ止め） |
| 作る・試す | `core.mjs`（エンジン）・`build.mjs`（esbuild と型検査）・`addon-lint.mjs`・`api-hints.mjs`・`dts.mjs`（型定義の索引）・`schema.mjs`（Mojang のスキーマ）・`lint-tests.mjs`（tests.txt の静的検査）・`trial.mjs`（1 回の試走）・`helper.js`（テスト用にアドオンへ差し込む補助）・`extra.mjs`（doc・sample などの重い道具）・`pixel.mjs`（16×16 のテクスチャ）・`model.mjs`（モデルの描画と検査）・`jsonui.mjs`（JSON UI の検査）・`i18n.mjs`（翻訳の欠け）・`optimize.mjs`（配布物を小さく）・`bb.mjs`（BDS 本体の解析） |
| 本物のプレイヤー | `realplayer.cjs`（本物のクライアント）・`raknet.cjs`・`nethernet.cjs`（通信）・`verbs.cjs`・`verbs-more.cjs`・`verbs-gen.cjs`（動作）・`goal.cjs`・`goal-exec.cjs`・`challenges.cjs`（目標の計画と実行）・`debugger.cjs`（スクリプトのデバッガ） |
| サンドボックスと生きた世界 | `sim.mjs`（sandbox-be で tests.txt を約 1 秒）・`ts.mjs`（TS REPL を外から動かす） |
| 原因を探す・テストを鍛える | `why.mjs`・`gaps.mjs`・`mutate.mjs`・`chaos.mjs`・`record.mjs`・`flaky.mjs`・`bisect.mjs`・`checkpoint.mjs`（undo）・`pytb.mjs`（traceback を 1 行に） |
| 持ち込み・保守 | `brief.mjs`（人のアドオンを読む）・`borrow.mjs`（借りたアドオンの印）・`scan.mjs`（アドオンが何をできるか）・`apidiff.mjs`（API の版の差）・`maintain.mjs`・`upkeep.mjs`・`maint.mjs`（健康診断）・`refresh.mjs`・`kb-build.mjs`（ラボの知識を新しい Minecraft に合わせる） |
| 配る | `deploy.mjs`（自分の BDS へ、戻せる）・`github.mjs`（GitHub 側の補助） |
| 知識（スキル） | `skills.mjs`（規則・振り分け・実機での確認）・`skill-forge.mjs`（スキル本文の検査） |
| テスト | `run-tests.mjs`（オフライン試験を並べて走らせる） |

## 状態の置き場所

| 場所 | 中身 | git に入るか |
|---|---|---|
| `bds/.lab/` | サーバー・道具・型定義のキャッシュ、テストの結果 | 入らない（その PC のもの） |
| `bds/addons/` | 見本のアドオンと、作ったアドオン | 入る |
| `skills/` | スキルと規則 | 入る |
| `.env` `.env.local` | 鍵 | 入らない |

## 品質ゲート

| 段 | 何を | いつ |
|---|---|---|
| lint | 全スクリプトの構文・全 JSON・コマンド表と文書の一致・モジュールの地図（`tests/lint-offline.mjs`・`tests/docs-offline.mjs`） | CI |
| オフライン | `tests/*-offline.mjs` と `tests/offline.mjs`（偽のサーバーでエンジンを端から端まで） | CI（push と PR のたび） |
| 実機 | 見本のアドオン全部を本物の BDS で `go` | CI（push と PR のたび） |

## 安全の床

- **戻せる**：`checkpoint`/`undo`（アドオン）、`deploy --undo`（自分の BDS）。
- **ヘルプは実行しない**：どのコマンドも `--help` / `-h` ならヘルプだけを出します。
- **無いものは無いと言う**：`dev` にしかないコマンドは `not in the stable branch` と 1 行で答えます。

## トークンの設計

AI が使うトークンの大半は、毎ターン送り直されるものです。常に読むものを最小にし、要るものは要る瞬間にコマンドの出力として渡します。

| 置き場所 | 中身 |
|---|---|
| 毎ターン | `AGENTS.md`（約 5 KB）と、`.claude/settings.json` で絞った道具 |
| 作り始め | `bds new` / `import` が、依頼に合うスキルの本文をその場で出す |
| 失敗したとき | `go` が `why` を自分で走らせ、該当する規則を 1 行だけ出す（`rule:`） |
| 調べるとき | `help <話題> <語>` はその語を含む部分だけ |

## 変えるときの約束

1. 不具合を直したら、直す前に落ちるテストを足す（`tests/cli-offline.mjs` が見本）。
2. モジュールを足したら、先頭に何をするものかを書き、この地図に載せる（`tests/lint-offline.mjs` が確かめる）。
3. コマンドを足す前に、既存のコマンドを深めて済まないか考える。`AGENTS.md` は 1 行でも高い。
4. スキルの規則は `skills/knowledge.json` に証拠つきで書き、`node lab.mjs skill build` で SKILL.md に出す。
5. 実機で確かめていないことは「確かめていない」と書く。
6. 新しい機能は `dev` で試し、実機のテストとベンチで効果が出たものだけ `main` に上げる。 `main` の修正を `dev` に入れるときは cherry-pick（丸ごとのマージは `dev` のファイルを消す）。
