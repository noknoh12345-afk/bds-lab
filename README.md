# bds-lab — AI が一人で Minecraft 統合版アドオンを作り、本物のサーバーで確かめる

> **To the AI reading this:** read `AGENTS.md` and follow it (it is short and complete for an addon).
> Network blocked or no terminal (a chat sandbox): run `node lab.mjs help chat` and work that way.

作りたいものを AI に日本語で頼むと、AI が本物の Bedrock Dedicated Server（BDS）を立て、本物のクライアントを参加させ、テストと品質チェックが通るまで自分で直して `.mcaddon` に仕上げます。

これは**安定版**（`main`）です。アドオンを作って確かめるのに要るものだけが入っています。管理パネル・自動操縦・GeoUI・本物のアプリでの確認・Endstone・LeviLamina などは `dev` ブランチにあります。

## 始め方

何も入っていないパソコンで、次の 1 行を貼るだけです。ラボの取得、Node.js 22、サーバーの用意、本物のサーバーでの動作確認（selftest、2〜3 分）まで進みます。もう一度実行すると更新と修復になります。

**Linux・macOS・WSL**（ターミナル）

```sh
curl -fsSL https://raw.githubusercontent.com/noknoh12345-afk/bds-lab/main/install.sh | sh
```

**Windows 10 / 11**（PowerShell。管理者は不要）

```powershell
irm https://raw.githubusercontent.com/noknoh12345-afk/bds-lab/main/install.ps1 | iex
```

入る場所は `~/bds-lab` です（`BDS_LAB_DIR=<フォルダー>` で変更）。終わったら、そのフォルダーを AI（Claude Code・Codex など）で開いて作りたいものを頼みます。

| 環境 | サーバーの動かし方 | 確かめ方 |
|---|---|---|
| Linux x86-64（Debian・Ubuntu・Fedora・Rocky・Arch・openSUSE） | そのまま | CI が素のイメージから selftest まで |
| Windows 10 / 11 x64 | そのまま | CI が selftest まで（PowerShell 5.1 と 7） |
| macOS（Apple シリコン・Intel） | Docker の中（BDS に macOS 版がないため）。Docker Desktop・OrbStack・colima のどれか | CI はファイルの取得と Node.js まで（GitHub の macOS ランナーには Docker がありません） |
| ARM の Linux・Windows | x86-64 のエミュレーション（遅い） | CI は試すだけ（失敗しても止めません） |
| Alpine（musl） | 動きません。インストーラーが理由と代わりの方法を言って止まります | CI |

すでにラボのフォルダーがあるとき（`git clone` した後など）は、その中で:

```sh
./setup.sh                # Node.js 22 と BDS を用意する（2 回目からはネットワーク不要）。Windows は setup.cmd
node lab.mjs status       # いまの状態と、次にやること
```

### 自分のサーバー（VPS）で動かす

VPS を GitHub Actions のランナーにすると、GitHub の画面（や `gh`）からラボをその VPS で走らせられます。SSH も、ポートを開けることも要りません。

```sh
# VPS で 1 回だけ（root）。登録トークンは Settings → Actions → Runners → New self-hosted runner に出ます
curl -fsSL https://raw.githubusercontent.com/noknoh12345-afk/bds-lab/main/vps/runner-setup.sh -o runner-setup.sh
sudo sh runner-setup.sh
```

あとは Actions → **vps** → Run workflow（`args` に `status`・`selftest`・`go -a coins`、全アドオンをコア数ぶん同時に回す `go all` など）。公開リポジトリなので、Settings → Actions → General の「Require approval for all external contributors」を必ず選んでください（理由は `vps/runner-setup.sh` の先頭）。

あとは AI（Claude Code・Codex など）をこのフォルダーで開き、作りたいものを頼むだけです。AI は `AGENTS.md` を読んで次の順に進めます。

| 段 | コマンド | すること |
|---|---|---|
| 1 | `node lab.mjs bds new <名前> "<題名>" "<依頼>"` | アドオンのひな形と、依頼に合うスキルを出す |
| 2 | `node lab.mjs add item\|block\|entity ...` | アイテム・ブロック・モブのファイルとテクスチャを書く |
| 3 | `node lab.mjs go` | ビルド → 本物のサーバーでテスト → 品質チェック → `DONE dist/<名前>.mcaddon` |
| 4 | `node lab.mjs gaps` / `mutate` / `chaos --append` | テストの穴を探して埋める |

アドオンを全部まとめて確かめるときは `node lab.mjs go all`（コア数ぶんのサーバーを同時に立てます。`--jobs N` で指定）。

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
| `install.sh`・`install.ps1` | 何もないパソコンに 1 行で入れる（`.github/workflows/install.yml` が OS ごとに確かめます） |
| `vps/` | 自分の VPS を GitHub Actions のランナーにする（`.github/workflows/vps.yml`） |
| `levikit/` | サーバー運用セット LeviKit（管理パネル・複数ワールド・動かしたままのバックアップ）。LeviLamina 版と Endstone 版。アドオン作りとは別物です（[levikit/README.md](levikit/README.md)） |

- 構成とモジュールの地図：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 秘密の扱い：[SECURITY.md](SECURITY.md)
- 変更の記録：[CHANGES.md](CHANGES.md)

## ブランチ

- `main`：安定版。本体の修正はここに入れます。
- `dev`：すべての機能と実験。`main` の修正は、要るものだけ cherry-pick で `dev` にも入れます（`main` は多くのファイルを消しているので、丸ごとのマージはしません）。`dev` のものは、本物のサーバーのテストとベンチで効果が出たときだけ `main` に上げます。
