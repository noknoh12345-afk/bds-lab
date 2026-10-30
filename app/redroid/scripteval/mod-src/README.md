# ScriptEval — クライアントだけで Script API を eval する mcpelauncher mod

ScriptEval は [mcpelauncher](https://github.com/minecraft-linux/mcpelauncher-manifest)（Linux 版 Minecraft Bedrock ランチャー）用の mod です。
ゲームクライアントの中に JavaScript エンジン（QuickJS-ng）を組み込み、`@minecraft/server` とほぼ同じ書き方で
**クライアントが今メモリ上に持っているワールドの状態**を読み出します。

```js
world.getAllPlayers().map(p => `${p.name} @ ${fmt(p.location)}`)
// → ["Steve @ 12.3, 64, -5.2", "Alex @ 40, 70, -12"]
```

- サーバーに参加中でも動作します（Realms・外部サーバー・自分のワールド）。
- **パケットは一切送受信しません。** サーバー側のアドオン / Script API も不要です。
  クライアントのメモリを読むだけなので、サーバーから見ると何も起きていません。
- 読み取り専用のデバッグツールです。`teleport()` などワールドを変更する API は
  `NotSupportedOnClientError` を投げます。

> [!NOTE]
> Bedrock のクライアントにはシンボル（関数名）がありません。ScriptEval は RTTI（C++ の型情報）と
> メモリ構造の検証だけで LocalPlayer・ECS（EnTT）・Level・プレイヤーリストなどを自動で見つけ、
> オフセットも実行時に自己較正します。開発はゲームの構造を再現したモック環境で検証しており、
> 実機のバージョンによっては一部の値が取れないことがあります。その場合の調べ方と設定での上書き方法は
> [トラブルシューティング](#トラブルシューティング) と [docs/DEBUG.md](docs/DEBUG.md) を見てください。

## できること

| 分類 | 内容 |
| --- | --- |
| プレイヤー | `world.getAllPlayers()` / `getPlayers(options)` / `getLocalPlayer()`、名前・座標・向き・速度・次元・ゲームモード・体力などの属性・インベントリ・装備、xuid / uuid |
| プレイヤーリスト | `world.getPlayerList()`：描画距離外も含むサーバー上の全プレイヤー（Tab リストと同じ情報） |
| エンティティ | `dimension.getEntities(options)`（type / name / location / maxDistance / closest など）、typeId、nameTag、フラグ（スニーク・ダッシュ・水泳…）、AABB |
| スコアボード | `world.scoreboard`：サーバーから送られてきた目標・スコア・表示スロット、`client.sidebar()` でサイドバーをそのまま取得 |
| ブロック（実験的） | `dimension.getBlock(location)`：クライアントが読み込んでいるチャンクのブロック |
| イベント | `world.afterEvents.playerJoin / playerLeave / entitySpawn / entityRemove / playerDimensionChange / playerGameModeChange / entityHealthChanged / worldLoad`（毎 tick の差分から再現） |
| system | `system.run / runTimeout / runInterval / runJob / waitTicks / currentTick`（ゲームの tick に同期） |
| フォーム | `@minecraft/server-ui` の `ActionFormData / ModalFormData / MessageFormData` をランチャーのオーバーレイ窓でローカル表示 |
| デバッグ UI | ゲーム内コンソール（F8）、プレイヤーパネル、ウォッチパネル（式をリアルタイム表示）、自作パネル |
| REPL | PC のターミナルから接続して対話実行（`tools/scripteval-repl.py`、補完・履歴・複数行対応） |
| リソースパック | Studio に .mcpack / .zip / .mcaddon / フォルダを落とすだけでグローバルリソースパックとして入れる。**強制**にしたパックは設定で外されても起動時に入れ直す（`client.packs`） |
| 解析ツール | `dbg.*`：RTTI 検索、メモリ読み取り、構造体ビューア、値スキャナ（Cheat Engine 風）、スナップショット差分、ECS コンポーネント一覧、アドレスの正体判定など |

## できないこと（クライアントの限界）

- **サーバーだけが持っている情報**：タグ (`getTags`)、エフェクト、動的プロパティ（ScriptEval 内のメモリにだけ保存されます）、
  ゲームルール、時刻、他プレイヤーのインベントリ（サーバーが送ってこない限り）。
- **描画距離の外**のエンティティやチャンク（プレイヤー名は `getPlayerList()` で取れます）。
- **ワールドの変更**：teleport、コマンド実行、ブロック設置、スコア変更、チャット送信など。
- `beforeEvents` 全般、`chatSend` / `entityHurt` / `playerBreakBlock` などのイベント（購読はできますが発火しません）。
- コードはゲームスレッド（tick の中）で実行されるため、重い処理の間はゲームが止まります
  （`evalTimeoutMs` / `tickTimeoutMs` で打ち切られます）。
- 対応環境は mcpelauncher（Linux の x86_64 / arm64、macOS の Apple Silicon）。macOS は 0.1.1 以降。

## インストール

1. 配布 zip の `bin/` から、自分の CPU に合うファイルを選びます。
   - 普通の PC（Intel / AMD）: `libscripteval-x86_64.so`
   - ARM64 機（Apple Silicon の Mac、Raspberry Pi 5、Asahi Linux など）: `libscripteval-arm64-v8a.so`
2. mcpelauncher のデータディレクトリに `mods` フォルダを作り、選んだ **1 つだけ** をコピーします。
   - 通常: `~/.local/share/mcpelauncher/mods/`
   - Flatpak 版: `~/.var/app/io.mrarm.mcpelauncher/data/mcpelauncher/mods/`
   - macOS: `~/Library/Application Support/mcpelauncher/mods/`
3. ゲームを起動します。初回起動時にデータディレクトリの中に `scripteval/` が作られます。

```
~/.local/share/mcpelauncher/scripteval/
├── config.json      設定（初回起動時に既定値で作成）
├── log.txt          ログ（調子が悪いときはまずここ）
├── packs.json       「強制」にしたグローバルリソースパックの一覧
├── scripts/         自作スクリプト（autorun.js は起動時に実行）
└── out/             client.save() の出力先
```

## はじめかた

1. ワールドに入るか、サーバーに参加します。
2. **F8** を押すとコンソールが開きます（ランチャー上部のメニューバー **ScriptEval → Console** からも開けます）。
   ゲーム中はマウスがゲームに取られているので、**Esc でポーズ画面を開くかチャット画面を開いて**から操作してください。
3. 入力欄に JavaScript を書いて **Run**（または Enter）。

```js
world.getAllPlayers()                       // 読み込まれているプレイヤー
world.getPlayerList()                       // サーバー上の全プレイヤー（描画距離外も）
world.getLocalPlayer().getComponent("health")
client.nearby(32)                           // 32 ブロック以内のエンティティを距離順に
client.playersPanel()                       // プレイヤー一覧を常時表示する窓
client.watch("world.getLocalPlayer().location")   // 式をリアルタイム表示
```

最初の 1 回だけ、ワールド構造の探索に数秒かかります（`client.status()` で状態確認）。

## Studio（ブラウザのエディタ）

ScriptEval 0.2 からは、ブラウザで使うエディタ「Studio」が付いています。ゲーム内のメニュー
**ScriptEval → Open Studio (browser)**、コンソールの **Open Studio** ボタン、または `client.studio()` で開きます。
アドレスは `http://127.0.0.1:25600/` で、起動ごとに変わるトークン付きで開かれます。

| 画面 | できること |
| --- | --- |
| エディタ | JavaScript / TypeScript（型はブラウザ側で外します）。ゲームに今ある値から補完し、⌘/Ctrl + Enter で選択範囲を実行すると結果が行の右に出ます |
| 保存で再実行 | ⌘/Ctrl + S で保存すると、そのスクリプトをモジュールとして読み直します。前回のタイマー・イベント購読・パネル・ウォッチは自動で解除されます |
| コンソール | スクリプトの出力が流れます。下の入力欄は補完と履歴（↑↓）付きの 1 行実行です |
| 状態 | プレイヤー・座標・ディメンション・アクター数・tick の速さなどを常時表示 |
| ウォッチ | 式を 0.5 秒ごとに評価して表示 |
| AI | Claude Code から操作するための登録コマンドと、AI の呼び出し履歴・一時停止 |
| 診断 | `client.doctor()` の結果。1 行の診断コードとログをまとめてコピーできます |
| リソースパック | グローバルリソースパックを入れる・強制・並べ替え（[次の節](#グローバルリソースパックstudio-から入れる)） |

上部の帯は直近 60 秒の tick レート（1 本 = 1 秒、満タン = 20 TPS）です。

```js
// scripts/probe.ts - 保存するたびに読み直される
import { world, system } from "@minecraft/server";

system.runInterval(() => {
  const me = world.getLocalPlayer();
  console.log(me.name, fmt(me.location));
}, 40);

client.onDispose(() => console.log("止めました"));  // 停止・再読み込みのときに呼ばれる
```

## グローバルリソースパック（Studio から入れる）

Studio 上部の **リソースパック** を開き、`.mcpack` / `.zip` / `.mcaddon` か、展開済みのパックのフォルダをドロップします
（Studio のどこにドロップしても構いません。「ファイルを選ぶ」「フォルダを選ぶ」からも入れられます）。

- ファイルはブラウザの中で展開してから送るので、ランチャーにインポート機能が無くても入れられます。
  `.mcaddon` の中の `.mcpack`、フォルダで包まれた zip も開きます。
- 入れたパックは `games/com.mojang/resource_packs/<パック名>_<UUID の先頭 8 桁>` に置かれ、
  `games/com.mojang/minecraftpe/global_resource_packs.json` の一番上（最優先）で有効になります。
- **強制**（既定でオン）: ゲームの設定画面で外されたり、ファイルから消えたりしても、ScriptEval が**起動のたびに**（実行中もファイルが変わったときに）入れ直します。
  やめるときは一覧の「強制」を外すか、`config.json` で `"forcePacks": false`。
- 一覧で優先度の上げ下げ（上ほど優先）、サブパックの選択、無効化、削除ができます。同じ UUID のパックを入れ直すと置き換えます。
- グローバルリソースパックはゲームの起動時に読み込まれるので、**反映にはゲームの再起動**が必要です（Studio に「要再起動」と出ます）。
- 入れられるのはリソースパックだけです。ビヘイビアーパック（`data` / `script` モジュール）は断ります。
- ScriptEval が書き換えるのは `resource_packs` と `global_resource_packs.json` だけで、元の `global_resource_packs.json` は
  最初の 1 回だけ `global_resource_packs.json.scripteval-backup` に残します。JSON として読めない状態のファイルには触りません。
- `games/com.mojang` はデータフォルダ（`~/.local/share/mcpelauncher` など）の中から自動で見つけます。違う場所なら `config.json` の `comMojangDir` で指定します。

コンソールからも同じことができます（入れたパックの操作だけ。ファイルを送るのは Studio から）。

```js
client.packs.list()                        // 有効（優先度の高い順）→ 無効の順
client.packs.enable("Fancy Pack")          // 有効 + 強制
client.packs.force("Fancy Pack", false)    // 強制だけ外す
client.packs.disable("Fancy Pack")
```

## AI から使う（MCP）

Studio と同じポートの `/mcp` が MCP サーバーになっています。Claude Code に登録すると、AI がゲームの状態を読み、
コードを試し、スクリプトを書いて動かせます。登録コマンドは Studio の「AI」タブか `client.mcp()` で表示されます。

```bash
claude mcp add --transport http scripteval http://127.0.0.1:25600/mcp \
  --header "Authorization: Bearer <データディレクトリ/scripteval/mcp.token の中身>"
```

| ツール | 内容 |
| --- | --- |
| `status` / `doctor` | 診断コードと状態の要約、各項目の確認とヒント |
| `eval` / `inspect` | JavaScript を実行して出力と結果を返す / 値を深く表示 |
| `logs` | コンソールと ScriptEval のログ |
| `api_search` | 使える API を検索（AI が存在しない API を書かないように） |
| `scripts_list` / `script_read` / `script_write` / `script_run` / `script_stop` / `modules_list` | スクリプトの管理と実行 |

MCP のトークン（`mcp.token`）は起動をまたいで同じです。Studio の「AI」タブで作り直せ、AI の呼び出しを一時停止することもできます。

## 診断とセーフモード

```js
client.doctor().line
// → "SE-DOC 0.3.0 mac-arm64 1.26.52.3 mem=ok:process_vm_readv:1432 mod=ok:sections rtti=ok:41230 world=ok:312 tick=ok:20Hz studio=ok:1 packs=ok:1/2 safe=off"
```

`packs=ok:強制の数/有効な数` です。不具合を報告するときは、この 1 行と `client.log()`（Studio の「診断」タブでまとめてコピー可）を貼ってください。

前回の起動が 1 分以内に終わっていた（落ちた）場合は**セーフモード**で起動し、`autorun.js` と tick フックを止めます。
`client.leaveSafeMode()` か Studio の「セーフモードを解除」で戻せます（`"safeMode": "off"` で無効）。

## 使い方

### ゲーム内コンソール

| 操作 | 内容 |
| --- | --- |
| F8 | コンソールの表示 / 非表示（`config.json` の `hotkey` で変更、`""` で無効） |
| Run / Enter | 実行 |
| < History / History > | 入力履歴 |
| Example | サンプルコードを順番に入力 |
| Scripts... | `scripts/*.js` の一覧。クリックで実行 |
| Stop script | 実行中のスクリプトを中断（無限ループ対策） |

ランチャーのメニューバー **ScriptEval** には Console / Players panel / Watch panel / Scripts... /
Rescan world / Status / Stop running script / Open Studio (browser) / Doctor があります。

### パネル（常時表示の窓）

```js
client.playersPanel()        // プレイヤー: 名前・距離・座標・次元・ゲームモード・体力、描画距離外の名前
client.watch("world.getLocalPlayer().location")             // ウォッチに式を追加（戻り値は ID）
client.watch(() => world.getAllPlayers().length, "人数")    // 関数とラベルでも可
client.watch(() => client.sidebar(), { label: "sidebar", every: 20 })  // 20 tick ごとに更新
client.unwatch(1)            // ID を削除（引数なしで全削除）
client.panel("mine", () => [ // 自作パネル: 文字列は表示、[ラベル, コード] はボタン
  `tick ${system.currentTick}`,
  ["人数を表示", "console.log(world.getAllPlayers().length)"],
], { title: "My Panel", every: 10 })
client.closePanel("mine")
```

窓の × で閉じるとそのパネルは止まります（ウォッチ窓を閉じるとウォッチは全削除）。

### REPL（PC のターミナルから）

ゲーム中、ScriptEval は `127.0.0.1:25599` で REPL を待ち受けます（ローカルのみ）。0.2 からは最初に
`#AUTH <トークン>` を送る必要があり、トークンはデータディレクトリの `scripteval/session.token` にあります（起動ごとに変わります）。
`tools/scripteval-repl.py` は自動で読みます（場所が違うときは `--data-dir` か `--token`）。

```bash
python3 tools/scripteval-repl.py                     # 対話モード（履歴・Tab 補完・複数行）
python3 tools/scripteval-repl.py -e 'world.getPlayerList().map(p => p.name)'
python3 tools/scripteval-repl.py -f myscript.js      # ローカルのファイルを実行
{ echo "#AUTH $(cat ~/.local/share/mcpelauncher/scripteval/session.token)"; cat; } | nc 127.0.0.1 25599   # nc でも可
```

対話モードでは括弧が閉じていなければ次の行に続き、空行で強制実行します。Ctrl+C で実行中の
スクリプトを中断、`:load file.js` でファイル実行、`.status` / `.run name` / `.help` はサーバー側コマンドです。

### スクリプトファイル

`scripts/` に置いた `.js` は ES モジュールとして実行できます（コンソールの Scripts... 、`.run 名前`、`runScript("名前")`）。
`autorun.js` は起動時に自動実行されるので、よく使う関数を `globalThis` に定義しておくと便利です。

```js
// scripts/near.js
import { world, system } from "@minecraft/server";

const id = system.runInterval(() => {
  const me = world.getLocalPlayer();
  const near = me.dimension.getPlayers({ location: me.location, maxDistance: 16 })
    .filter(p => !p.isLocalPlayer);
  if (near.length) console.log("近くにいる:", near.map(p => p.name).join(", "));
}, 40);
// 止めるときは system.clearRun(id) か client.reset()
```

同梱の例: `players.js`、`entities.js`、`watch.js`（イベント）、`debugmenu.js`（フォームで作るデバッグメニュー）。

### フォーム（@minecraft/server-ui をローカル表示）

```js
import { ModalFormData } from "@minecraft/server-ui";
const r = await new ModalFormData().title("検索")
  .textField("名前", "例: Steve").slider("半径", 4, 128, { valueStep: 4, defaultValue: 32 })
  .show(world.getLocalPlayer());
if (!r.canceled) console.log(r.formValues);
```

サーバーには送られず、ランチャーのオーバーレイ窓として表示されます。toggle はチェックボタン、dropdown はクリックで
次の選択肢に進むボタン（選択肢が多いときはスライダー付き）で表現しています。

## API の概要

詳細は [docs/API.md](docs/API.md)。グローバルに `world`、`system`、`client`、`dbg`、`console`、`inspect`、`fmt`、`dist`、`hex`
があり、`import { world } from "@minecraft/server"` も使えます。

| | |
| --- | --- |
| `world` | `getAllPlayers` `getPlayers` `getLocalPlayer` `getPlayerList` `getDimension` `getEntity` `scoreboard` `afterEvents` `get/setDynamicProperty`（ローカル） |
| `Entity` | `id` `typeId` `location` `dimension` `nameTag` `isSneaking` など、`getRotation` `getVelocity` `getHeadLocation` `getViewDirection` `getAABB` `getComponent("health"/"inventory"/"equippable"/"movement")` `matches` + 拡張 `ecs()` `ecsComponents` `synchedData()` `fields()` `address` |
| `Player` | `name` `isLocalPlayer` `getGameMode` `selectedSlotIndex` `xuid` `uuid` `sendMessage`（コンソールに表示） |
| `Dimension` | `getEntities` `getPlayers` `getEntitiesAtBlockLocation` `getBlock` `getBlockBelow` `getTopmostBlock` |
| `system` | `run` `runTimeout` `runInterval` `runJob` `clearRun` `clearJob` `waitTicks` `currentTick` `clearAll` |
| `client` | `status` `rescan` `players` `playersPanel` `nearby` `countByType` `entities` `playerList` `sidebar` `watch` `unwatch` `watches` `panel` `closePanel` `save` `load` `log` `reset` `tick` `offsets` |
| `dbg` | メモリ・RTTI・ECS の解析ツール（次節） |

## デバッグ・解析機能

詳しい手順は [docs/DEBUG.md](docs/DEBUG.md)。

```js
dbg.fields(world.getLocalPlayer().address, 0x200)  // 構造体ビューア（ポインタ先のクラス名・文字列・float を推定表示）
dbg.rtti("LocalPlayer")                            // クラス情報・基底クラス・vtable
dbg.search("Scoreboard")                           // RTTI からクラス名検索
dbg.find("ItemActor")                              // ヒープ上のインスタンスを列挙
world.getLocalPlayer().ecs()                       // ECS コンポーネント一覧（アドレス・サイズ付き）
dbg.ecs("Rotation")                                // コンポーネントプール一覧

// 値スキャナ: 値で探す → ゲーム内で値を変える → 絞り込む
let hits = dbg.findF32(20)                         // 体力 20 を探す
// … ダメージを受けて 17 になったら
hits = dbg.refine(hits, "f32", 17)
dbg.whereIs(hits[0])                               // どの ECS コンポーネント / オブジェクトの何バイト目か

// スナップショット差分: 何かする前後でどのフィールドが変わったか
const s = dbg.snapshot(world.getLocalPlayer(), 0x400)
// … ゲーム内で何かする
dbg.diff(s)
```

## 設定（config.json）

| キー | 既定値 | 説明 |
| --- | --- | --- |
| `replPort` | `25599` | REPL のポート。`0` で無効 |
| `replBind` | `"127.0.0.1"` | 待ち受けアドレス（外部公開は非推奨） |
| `hotkey` | `"F8"` | コンソール切り替えキー（`F1`〜`F12`、`Insert`、`Home`、`Pause` など。`""` で無効。文字キーはチャット入力を奪うので非推奨） |
| `autorun` | `true` | 起動時に `scripts/autorun.js` を実行 |
| `consoleLines` | `60` | コンソール窓に表示する行数 |
| `evalTimeoutMs` | `3000` | 1 回の評価の時間制限（無限ループで止まらないように） |
| `tickTimeoutMs` | `1000` | `system.run*` のコールバックに 1 tick で使える時間 |
| `tickHook` | `"auto"` | ゲーム tick へのフック。`"off"` にすると別スレッドで 20Hz の仮想 tick を回します |
| `tickHookSlot` | `-1` | フックする LocalPlayer の vtable スロットを固定（`client.tick()` で確認） |
| `tickSampleMs` | `1500` | tick 関数を探すための計測時間 |
| `gameCalls` | `true` | ゲーム関数の呼び出し（`getBlock`）を許可 |
| `studioPort` | `25600` | Studio と MCP のポート。`0` で無効 |
| `studioBind` | `"127.0.0.1"` | Studio の待ち受けアドレス（外部公開は非推奨。公開してもトークンは必須） |
| `mcp` | `true` | `/mcp`（AI 連携）を有効にする |
| `replAuth` | `true` | REPL でトークンを必須にする（`false` は信頼できる環境だけで） |
| `safeMode` | `"auto"` | 起動直後に落ちたら次回をセーフモードで起動。`"off"` で無効 |
| `comMojangDir` | `""` | ゲームの `games/com.mojang` の場所。空なら自動で探す |
| `forcePacks` | `true` | 「強制」にしたグローバルリソースパックを入れ直す。`false` で強制を止める（一覧は残る） |
| `offsets` | `{}` | 自動検出したオフセットの上書き（[docs/DEBUG.md](docs/DEBUG.md#オフセットの上書き)） |
| `componentSizes` | `{}` | ECS コンポーネントのサイズの上書き（例 `{"StateVectorComponent": 36}`） |

変更はゲームの再起動で反映されます。

## トラブルシューティング

| 症状 | 確認・対処 |
| --- | --- |
| `world: not in a world` | ワールド / サーバーに入ってから実行。`client.rescan()` で再探索 |
| 一部の値が `undefined` / おかしい | `client.status()`・`client.offsets()`・`log.txt` を確認。`world.getLocalPlayer().ecs()` で見えているコンポーネントを確認し、docs/DEBUG.md の手順で `offsets` / `componentSizes` を上書き |
| ゲームが固まる・落ちる | `config.json` で `"tickHook": "off"`、`"gameCalls": false` を試す。`log.txt` を確認 |
| スクリプトが止まらない | コンソールの Stop script、REPL で Ctrl+C / `.stop`、`client.reset()` でタイマー・イベント・パネルを全解除 |
| F8 が効かない | ノート PC では Fn+F8 が必要な場合があります。`hotkey` を別のキーに変更するか、メニューバーの ScriptEval → Console から開く |
| REPL につながらない | `log.txt` の `REPL listening on ...` を確認。ポートが使用中なら `replPort` を変更 |
| 窓が操作できない | マウスがゲームに取られている状態。Esc（ポーズ）かチャットを開いてから操作 |
| Studio が開かない | `client.studio()` の結果と `log.txt` の `Studio listening on ...` を確認。ポート使用中なら `studioPort` を変更 |
| Studio で「トークンが必要です」 | ゲームを再起動するとトークンが変わります。メニューの Open Studio か `client.studio()` で開き直す |
| 起動したら tick が止まっている | セーフモードの可能性。`client.safeMode` を確認し、`client.leaveSafeMode()` |
| REPL で authentication required | `tools/scripteval-repl.py` を最新にするか、`--data-dir` で `session.token` のある場所を指定 |
| リソースパックが反映されない | ゲームを再起動。診断の `packs=` を確認（`FAIL` ならヒントの通り）。リソースパックか（ビヘイビアーパックは不可）も確認 |
| 強制で戻ってくるのをやめたい | Studio の「リソースパック」で「強制」を外す、`client.packs.force(名前, false)`、または `"forcePacks": false` |
| メニューバーに ScriptEval が無い | ランチャーが古く、オーバーレイ窓の API が無い可能性があります。REPL（`tools/scripteval-repl.py`）は使えます |

ScriptEval がゲームに手を入れるのは次の 2 点だけで、それ以外はすべてメモリの読み取りです
（ファイルとしては、リソースパック機能を使ったときに `resource_packs` と `global_resource_packs.json` を書き換えます）。

- tick フック: ワールド探索後の数秒間 LocalPlayer の vtable を計測用に差し替え、その後は 1 スロットだけ前置フックが残ります（`"tickHook": "off"` で無効）。
- `dimension.getBlock()`: ゲームスレッド上でゲーム自身のブロック取得関数を呼びます（`"gameCalls": false` で無効）。

## 仕組み（概略）

1. `libminecraftpe.so` の RTTI（type_info / vtable）を索引化
2. ヒープから `LocalPlayer` の vtable を指すオブジェクトを探し、`EntityContext → EnTT レジストリ` の整合性で検証
3. レジストリのコンポーネントプール（`entt::basic_storage<StateVectorComponent, …>` など）を RTTI 名で列挙し、要素サイズを実データで較正
4. Actor から Level・プレイヤーリスト・次元・スコアボードをたどる
5. LocalPlayer の仮想関数を数秒計測して 20Hz で呼ばれるもの（tick）を見つけ、そこに前置フックを入れて JS をゲームスレッドで実行
6. メモリ読み取りは `process_vm_readv`（不正なアドレスでも落ちない）

## ビルド

必要なもの: Android NDK r27 以降、CMake 3.21 以降、Ninja（任意）。QuickJS-ng v0.17.0 は CPM で自動取得されます
（オフラインの場合は `-DQUICKJS_DIR=/path/to/quickjs-ng`）。

```bash
NDK=/path/to/android-ndk-r27c
for abi in x86_64 arm64-v8a; do
  cmake -B build-$abi -G Ninja -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_TOOLCHAIN_FILE=$NDK/build/cmake/android.toolchain.cmake \
        -DANDROID_ABI=$abi -DANDROID_PLATFORM=android-24
  cmake --build build-$abi
done
# → build-<abi>/libscripteval.so
```

### ホストテスト（モックゲーム）

Bedrock に似たクラス構造・RTTI・EnTT レジストリを持つ `libminecraftpe.so` のモックと、ランチャー API の偽物で
ScriptEval を丸ごと動かすテストがあります（clang + libc++ が必要、EnTT v3.16 は CPM で取得）。

```bash
cmake -B build-host -G Ninja -DSCRIPTEVAL_HOST_TEST=ON -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ \
      -DCMAKE_CXX_FLAGS=-stdlib=libc++ -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build-host
bash test/run_all.sh     # 通常レイアウトと「ずらした」レイアウトの両方で全テスト（Studio の結合テスト、Node で動かす ZIP 読み取りのテストを含む）
STUDIO_UI=1 bash test/run_all.sh   # Studio の画面も headless Chromium で確認（Python の playwright が必要）
```

### Studio の画面

`studio/dist/index.html.gz` はビルド済みで同梱しているので、mod のビルドに Node.js は不要です。画面を変更したときだけ:

```bash
cd studio && npm ci && npm run build   # → dist/index.html(.gz)、dist/THIRD_PARTY_LICENSES.txt
```

## ファイル構成

```
src/            mod 本体（C++20）と prelude.js（API の JS 実装）
studio/         Studio（ブラウザのエディタ）のソースとビルド済みの dist/
tools/          scripteval-repl.py（REPL クライアント）
docs/           API.md、DEBUG.md
test/           モックゲーム、偽ランチャー、テストハーネスとテストシナリオ
```

## クレジット

- [QuickJS-ng](https://github.com/quickjs-ng/quickjs)（MIT）— JavaScript エンジン
- [EnTT](https://github.com/skypjack/entt)（MIT）— テスト用モックゲームでのみ使用
- [CodeMirror](https://codemirror.net/)・[Lezer](https://lezer.codemirror.net/)（MIT）、[sucrase](https://github.com/alangpierce/sucrase)（MIT）ほか — Studio の画面（一覧と全文は `studio/dist/THIRD_PARTY_LICENSES.txt` と Studio の「状態 → 同梱ライブラリのライセンス」）
- mod の構成は [mcpelauncher-fullbright](https://github.com/CrackedMatter/mcpelauncher-fullbright)、
  [mcpelauncher-nohurtcam](https://github.com/GameParrot/mcpelauncher-nohurtcam)、
  [BuildLimitChanger](https://github.com/Zeuroux/BuildLimitChanger) を参考にしています

サードパーティのライセンス全文は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) にあります。
サーバーによってはクライアント改造そのものを規約で禁止している場合があります。利用は各サーバーのルールに従ってください。
