# bds-lab — AI が一人で Minecraft 統合版アドオンを作り、本物のサーバーで確かめる

> **To the AI reading this:** read `AGENTS.md` and follow it (it is short and complete for an addon).
> Network blocked or no terminal (a chat sandbox): run `node lab.mjs help chat` and work that way.

作りたいものを AI に日本語で頼むと、AI が本物の Bedrock Dedicated Server（BDS）を立て、本物のクライアントを参加させ、テストと品質チェックが通るまで自分で直して `.mcaddon` に仕上げます。

これは**安定版**（`main`）です。アドオンを作って確かめるのに要るものだけが入っています。管理パネル・自動操縦・GeoUI・本物のアプリでの確認・Endstone・LeviLamina などは `dev` ブランチにあります。

## 始め方

```sh
./setup.sh                # Node.js 22 と BDS を用意する（2 回目からはネットワーク不要）
node lab.mjs status       # いまの状態と、次にやること
```

あとは AI（Claude Code・Codex など）をこのフォルダーで開き、作りたいものを頼むだけです。AI は `AGENTS.md` を読んで次の順に進めます。

| 段 | コマンド | すること |
|---|---|---|
| 1 | `node lab.mjs bds new <名前> "<題名>" "<依頼>"` | アドオンのひな形と、依頼に合うスキルを出す |
| 2 | `node lab.mjs add item\|block\|entity ...` | アイテム・ブロック・モブのファイルとテクスチャを書く |
| 3 | `node lab.mjs go` | ビルド → 本物のサーバーでテスト → 品質チェック → `DONE dist/<名前>.mcaddon` |
| 4 | `node lab.mjs gaps` / `mutate` / `chaos --append` | テストの穴を探して埋める |

人のアドオン（`.mcaddon`・`.mcpack`・`.zip`・フォルダー）を直すときは `node lab.mjs import <ファイル> "<直したいこと>"` から始めます。

## 困ったとき

| こんなとき | コマンド |
|---|---|
| いまどうなっている？ | `node lab.mjs status` |
| Minecraft が更新された・しばらく触っていない | `node lab.mjs upkeep`（`--check` は見るだけ） |
| ここで動くか確かめたい | `node lab.mjs doctor`、`node lab.mjs selftest` |
| ディスクが足りない | `node lab.mjs clean` |
| 自分の BDS に入れたい | `node lab.mjs deploy <BDS のフォルダー>`（`--undo` で戻す） |

## 中身

| 場所 | 役割 |
|---|---|
| `AGENTS.md` | AI が毎回読む入口。アドオン 1 本にはこれで足ります |
| `lab.mjs`・`common/` | コマンドとエンジン |
| `bds/addons/` | 見本のアドオン 12 本（どれも本物のサーバーで通っています） |
| `skills/` | 手順と、本物のサーバーで確かめた規則（`SKILL.md`） |
| `sandbox-be/` | サーバーを起動せずにテストを約 1 秒で試す仮想世界（`sim`） |
| `bedrock-binary/` | BDS 本体から読み取ったパケット・列挙・コマンドの一覧（`bb`） |
| `bds/bench/` | トークン節約のベンチマーク（課題と隠しテスト） |
| `tests/` | ラボ自体のテスト（`node common/run-tests.mjs tests/*-offline.mjs`） |
| `levikit/` | サーバー運用セット LeviKit（管理パネル・複数ワールド・動かしたままのバックアップ）。LeviLamina 版と Endstone 版。アドオン作りとは別物です（[levikit/README.md](levikit/README.md)） |

- 構成とモジュールの地図：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 秘密の扱い：[SECURITY.md](SECURITY.md)
- 変更の記録：[CHANGES.md](CHANGES.md)

## ブランチ

- `main`：安定版。本体の修正はここに入れます。
- `dev`：すべての機能と実験。`main` を取り込みます。`dev` のものは、本物のサーバーのテストとベンチで効果が出たときだけ `main` に上げます。
