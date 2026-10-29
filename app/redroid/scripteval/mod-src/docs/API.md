# ScriptEval API リファレンス

ScriptEval の JavaScript 環境は `@minecraft/server` の読み取り系 API をクライアント側で再実装したものです。
値はすべてクライアントのメモリから読みます。サーバーへは何も送りません。

- 実行エンジン: QuickJS-ng（ES2023、`async/await`、ES モジュール、トップレベル await）
- グローバル: `world` `system` `client` `dbg` `console` `inspect` `fmt` `dist` `hex` `runScript`
  `ActionFormData` `ModalFormData` `MessageFormData` `uiManager`
- モジュール: `@minecraft/server`、`@minecraft/server-ui`、`scripteval`（`client` `dbg` など）、`scripts/` 内の相対パス

コンソール / REPL で入力したコードの最後の式の値が表示されます。`await` を含むと非同期関数として評価され、
`import` / `export` で始まる行があると ES モジュールとして評価されます（モジュールの場合、値は表示されないので `console.log` を使います）。

## 目次

- [world](#world)
- [Entity / Player](#entity--player)
- [Dimension / Block](#dimension--block)
- [Scoreboard](#scoreboard)
- [イベント](#イベント)
- [system](#system)
- [フォーム（@minecraft/server-ui）](#フォームminecraftserver-ui)
- [client（ScriptEval 拡張）](#clientscripteval-拡張)
- [ユーティリティ](#ユーティリティ)
- [dbg](#dbg)
- [エラー](#エラー)

---

## world

| メンバー | 説明 |
| --- | --- |
| `getAllPlayers()` | クライアントに読み込まれているプレイヤー（自分を含む）の `Player[]` |
| `getPlayers(options?)` | `EntityQueryOptions` で絞り込み |
| `getLocalPlayer()` | 自分（ScriptEval 拡張） |
| `getPlayerList()` | サーバーのプレイヤーリスト（描画距離外も含む）: `{ name, id, xuid, uuid, platformOnlineId, buildPlatform }[]` |
| `getDimension(id)` | `"overworld"` / `"minecraft:nether"` / `"the_end"` など |
| `getEntity(id)` | `entity.id`（ユニーク ID 文字列）で検索 |
| `scoreboard` | [Scoreboard](#scoreboard) |
| `afterEvents` / `beforeEvents` | [イベント](#イベント) |
| `getDynamicProperty(k)` / `setDynamicProperty(k, v)` / `getDynamicPropertyIds()` / `clearDynamicProperties()` | ScriptEval 内だけのメモリ保存（ゲーム再起動で消える） |
| `sendMessage(msg)` | コンソールに表示するだけ（チャットには送らない） |
| `getTimeOfDay()` `getAbsoluteTime()` `getDay()` `getMoonPhase()` `playMusic()` | `NotSupportedOnClientError` |

### EntityQueryOptions

`getEntities` / `getPlayers` / `client.entities` / `entity.matches` で使えるもの:

`type` `excludeTypes` `name` `excludeNames` `location` `maxDistance` `minDistance` `volume` `closest` `farthest`
`gameMode` `excludeGameModes`

`tags` `families` `scoreOptions` などクライアントに無い情報は無視されます（最初の 1 回だけ警告）。

---

## Entity / Player

`Entity` は (Actor アドレス, ECS エンティティ ID) の組で、エンティティが消えると `isValid` が `false` になり、
各プロパティは `InvalidEntityError` を投げます。

| メンバー | 説明 |
| --- | --- |
| `id` | ユニーク ID（文字列）。取れない場合はアドレス |
| `typeId` | `"minecraft:zombie"` など |
| `runtimeId` | ランタイム ID |
| `location` | `{x, y, z}`（足元の座標） |
| `dimension` | `Dimension` |
| `nameTag` | ネームタグ |
| `isValid` | 有効か |
| `isSneaking` `isSprinting` `isSwimming` `isSleeping` `isGliding` `isOnFire` `isRiding` `isInvisible` | アクターフラグ |
| `isOnGround` `isInWater` `isFalling` | ECS のフラグコンポーネントから |
| `getRotation()` | `{x: pitch, y: yaw}` |
| `getVelocity()` | 1 tick あたりの移動量 |
| `getHeadLocation()` | 目の位置 |
| `getViewDirection()` | 視線方向の単位ベクトル |
| `getAABB()` | `{min, max, width, height}`（拡張） |
| `getAttributes()` | `{id, currentValue, effectiveMin, effectiveMax, defaultValue}[]`（拡張） |
| `getComponent(id)` | `"health"` `"movement"` `"underwater_movement"` `"lava_movement"` `"inventory"` `"equippable"`（`minecraft:` 付きも可） |
| `getComponents()` / `hasComponent(id)` | 上記のうち取れるもの |
| `matches(options)` | `EntityQueryOptions` に一致するか |
| `getTags()` / `hasTag()` / `getEffects()` / `getEffect()` | 常に空（サーバーのみの情報） |
| `teleport` `kill` `remove` `addTag` `applyDamage` `applyImpulse` `addEffect` `runCommand` `triggerEvent` | `NotSupportedOnClientError` |

ScriptEval 拡張:

| メンバー | 説明 |
| --- | --- |
| `address` | Actor オブジェクトのアドレス |
| `entityId` | ECS のエンティティ ID |
| `className` | C++ のクラス名（`"LocalPlayer"`、`"Zombie"` …） |
| `flags` | 立っているアクターフラグのビット番号 |
| `ecsComponents` | 持っている ECS コンポーネント名 |
| `ecs(name?)` | コンポーネントのアドレス（名前なしで `{name, address, size, tag}[]`） |
| `synchedData()` | 同期データ（SynchedActorData）の `{id, value}[]` |
| `fields(len)` | Actor オブジェクトを `dbg.fields` で表示 |

### コンポーネント

- `health` / `movement` など: `currentValue` `effectiveMin` `effectiveMax` `defaultValue`
- `inventory`: `inventorySize`、`container`（`getItem(slot)` `items()` `size` `emptySlotsCount`）
- `equippable`: `getEquipment("Mainhand" | "Offhand" | "Head" | "Chest" | "Legs" | "Feet")`
- `ItemStack`: `typeId` `amount` `data`

### Player（Entity を継承）

| メンバー | 説明 |
| --- | --- |
| `name` | プレイヤー名 |
| `isLocalPlayer` | 自分か |
| `getGameMode()` | `"Survival"` `"Creative"` `"Adventure"` `"Spectator"` |
| `selectedSlotIndex` | 選択中のホットバー（読めた場合） |
| `xuid` / `uuid` | プレイヤーリストから |
| `sendMessage(msg)` | コンソールに表示するだけ |
| `setGameMode` `playSound` | `NotSupportedOnClientError` |

---

## Dimension / Block

| メンバー | 説明 |
| --- | --- |
| `id` | `"minecraft:overworld"` など |
| `heightRange` | `{min, max}` |
| `isLoaded` | 自分が今その次元にいるか（クライアントは今いる次元しか持たない） |
| `getEntities(options?)` / `getPlayers(options?)` | その次元の読み込み済みエンティティ |
| `getEntitiesAtBlockLocation(loc)` | そのブロック座標にいるエンティティ |
| `getBlock(loc)` | **実験的**。ゲームスレッドでゲームの関数を呼んでブロックを取得（tick フック必須、`gameCalls: true`） |
| `getBlockBelow(loc, opts?)` / `getTopmostBlock(loc)` | `getBlock` を下に向かって繰り返す |

`Block`: `typeId` `location` `x` `y` `z` `isAir` `isLiquid` `getTags()` `hasTag()` `above(n)` `below(n)` `permutation.type.id`

---

## Scoreboard

サーバーがこのクライアントに送ってきたもの（表示中の目標とそのスコア）だけが見えます。

| メンバー | 説明 |
| --- | --- |
| `world.scoreboard.getObjectives()` | `ScoreboardObjective[]` |
| `getObjective(id)` | |
| `getParticipants()` | `ScoreboardIdentity[]` |
| `getObjectiveAtDisplaySlot("Sidebar" \| "List" \| "BelowName")` | `{objective, sortOrder}` |
| `sidebar()` | 拡張: サイドバーを表示順に `{title, lines}` で（`client.sidebar()` と同じ） |
| `ScoreboardObjective` | `id` `displayName` `criteria` `getScores()` `getParticipants()` `getScore(entity \| name \| identity)` `hasParticipant()` |
| `ScoreboardIdentity` | `displayName` `id` `type`（`"Player"` `"Entity"` `"FakePlayer"`）`getEntity()` |
| 変更系 | `addObjective` `setScore` など → `NotSupportedOnClientError` |

---

## イベント

ScriptEval は毎 tick クライアントの状態の差分を取ってイベントを作ります。購読者がいるイベントだけ計算します。

| `world.afterEvents.*` | 発火条件 | イベントの中身 |
| --- | --- | --- |
| `worldLoad` | ワールドを検出したとき | `{}` |
| `playerJoin` / `playerLeave` | プレイヤーリストの増減 | `{playerName, playerId}` |
| `playerSpawn` | プレイヤーが描画距離に入った | `{player, initialSpawn}` |
| `entitySpawn` / `entityRemove` | エンティティの読み込み / 消失（描画距離の出入りを含む） | `{entity, cause}` / `{removedEntityId, typeId, entity}` |
| `playerDimensionChange` | 自分の次元が変わった | `{player, fromDimension, toDimension, toLocation}` |
| `playerGameModeChange` | 自分のゲームモードが変わった | `{player, fromGameMode, toGameMode}` |
| `entityHealthChanged` | 体力属性の変化 | `{entity, oldValue, newValue}` |

`chatSend` `entityHurt` `entityDie` `playerBreakBlock` `playerPlaceBlock` `itemUse` と `beforeEvents.*` は
購読できますが発火しません（警告が出ます）。購読の全解除は `client.reset()`。

---

## system

| メンバー | 説明 |
| --- | --- |
| `currentTick` | ScriptEval の tick カウンタ |
| `run(cb)` / `runTimeout(cb, ticks)` / `runInterval(cb, ticks)` | 戻り値の ID を `clearRun(id)` で解除 |
| `runJob(generator)` / `clearJob(id)` | ジェネレーターを 1 tick あたり約 4ms ずつ進める |
| `waitTicks(n)` | `await system.waitTicks(20)` |
| `clearAll()` | タイマーとジョブを全解除（拡張） |
| `runs` | 登録中のタイマー ID（拡張） |

tick フックが有効なときはゲームスレッドの tick（20Hz）で実行されます。無効なとき（メニュー画面・`tickHook: "off"`）は
別スレッドの 20Hz の仮想 tick です。1 tick で使える時間は `tickTimeoutMs`（既定 1000ms）で、超えたコールバックは中断・解除されます。

---

## フォーム（@minecraft/server-ui）

フォームはランチャーのオーバーレイ窓としてローカルに表示されます。`show()` はボタンが押されるか窓が閉じられると解決します。

```js
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

const a = await new ActionFormData().title("メニュー").body("選んでください")
  .button("プレイヤー").button("エンティティ").show(world.getLocalPlayer());
// a.canceled, a.selection

const m = await new ModalFormData().title("設定")
  .header("一般").textField("名前", "例: Steve", { defaultValue: "Steve" })
  .slider("半径", 0, 100, { valueStep: 5, defaultValue: 20 })
  .toggle("有効", { defaultValue: true }).dropdown("モード", ["A", "B", "C"], { defaultValueIndex: 1 })
  .submitButton("適用").show(world.getLocalPlayer());
// m.formValues → [undefined(header), "Steve", 20, true, 1]

const q = await new MessageFormData().title("確認").body("よろしいですか?").button1("はい").button2("いいえ").show();
// q.selection: button1 = 0, button2 = 1
```

- 旧シグネチャ（`slider(label, min, max, step, default)` `toggle(label, default)` `dropdown(label, options, index)` `textField(label, placeholder, default)`）も使えます。
- `header` / `label` / `divider` は表示のみ（`formValues` では `undefined`）。
- 窓を × で閉じると `{ canceled: true, cancelationReason: "UserClosed" }`。
- `uiManager.closeAllForms(player)` で表示中のフォームを全部閉じます。
- `FormCancelationReason` `FormRejectReason` `FormRejectError` `ActionFormResponse` `ModalFormResponse` `MessageFormResponse` もエクスポートしています。
- Minecraft の書式コード（`§a` など）は表示時に取り除かれます。`rawtext` / `translate` は簡易的に文字列化します。

---

## client（ScriptEval 拡張）

| メンバー | 説明 |
| --- | --- |
| `status()` | 探索状態・検出したアドレス・tick フックの状態など |
| `rescan()` | ワールド構造を再探索 |
| `localPlayer` | `world.getLocalPlayer()` |
| `players()` | 読み込み済み + プレイヤーリストをまとめた表（名前・距離・座標・次元・ゲームモード・体力・`loaded`） |
| `playerList()` | `world.getPlayerList()` |
| `entities(options?)` | 全次元の読み込み済みエンティティ（クエリ可） |
| `countByType(options?)` | typeId ごとの数 |
| `nearby(radius = 16)` | 自分の周りのエンティティを距離順に `{typeId, distance, location, name}` |
| `sidebar()` | サイドバーを `{title, lines}` で |
| `playersPanel(show?)` | プレイヤーパネルの表示切り替え |
| `watch(expr \| fn, label \| {label, every})` | ウォッチパネルに追加して ID を返す。`expr` は文字列の式 |
| `unwatch(id?)` / `watches()` / `watchPanel(show?)` | ウォッチの削除 / 現在値の取得 / 窓の切り替え |
| `panel(name, render, {title, every})` | 自作パネル。`render()` は文字列、または「文字列 / `[ボタン名, 実行するコード]` / `{text, size}`」の配列を返す |
| `closePanel(name)` / `panels()` | |
| `save(name, value)` | `<データディレクトリ>/out/name` に保存（文字列以外は JSON。Entity は見た目どおりの内容で保存）。パスを返す |
| `load(name)` | `out/name` を読む（JSON なら解析） |
| `log(n = 40)` | ScriptEval のログの末尾 |
| `reset()` | タイマー・ジョブ・イベント購読・パネル・ウォッチ・フォームを全解除 |
| `tick()` / `installTickHook()` | tick フックの状態 / 手動インストール |
| `offsets()` | 自動検出したオフセット（`config.json` の `offsets` に書ける形） |
| `studio(open = true)` | Studio をブラウザで開く。開けない環境ではトークン付きのアドレスを返す |
| `mcp()` | MCP の接続先と Claude Code への登録コマンド |
| `doctor()` | 自己診断。`{line, checks}`。`line` は 1 行の診断コード（`SE-DOC …`） |
| `onDispose(fn)` | 今のモジュールが停止・再読み込みされるときに呼ぶ関数を登録 |
| `modules()` | 実行中のモジュールと、それぞれが持つタイマー・購読・パネル・ウォッチ・ジョブの数 |
| `stopModule(name)` | モジュールを停止し、持っていたものをすべて解除（`name` は `scripts/probe.js` の形） |
| `safeMode` / `leaveSafeMode()` | セーフモード中か / 解除して tick フックと autorun を開始 |
| `packs` | グローバルリソースパックの操作（次節） |

### client.packs（グローバルリソースパック）

Studio の「リソースパック」と同じ操作です。`id` にはパックの UUID・`resource_packs` 内のフォルダ名・パック名のどれでも使えます。
変更は `games/com.mojang/minecraftpe/global_resource_packs.json` に書かれ、**ゲームの次の起動で反映**されます。
パックを新しく入れる（ファイルを送る）のは Studio からです。

| メンバー | 説明 |
| --- | --- |
| `list()` | 有効なパック（優先度の高い順）、続いて入っているが無効なパック。`{name, version, active, forced, id, folder, subpack?, error?}` |
| `enable(id, {force = true, subpack}?)` | グローバルで有効にして一番上（最優先）に置く。`force: false` で強制なし |
| `disable(id)` | 無効にする（強制も外れる） |
| `force(id, on = true)` | 強制のオン / オフ。強制のパックは、設定で外されても ScriptEval が起動時（と実行中にファイルから消えたとき）に入れ直す |
| `move(id, delta)` | 優先度を変える。`+1` で 1 つ上（優先）、`-1` で 1 つ下 |
| `subpack(id, name)` | サブパック（`folder_name`）を選ぶ。`""` で既定 |
| `remove(id)` | 無効にして `resource_packs` からフォルダごと削除 |
| `state()` | 生の状態（`dir`、`restartNeeded`、`active`、`inactive`、`missing` など） |
| `dir` | 使っている `games/com.mojang` の場所（`config.json` の `comMojangDir` で変更可） |

```js
client.packs.list()
client.packs.enable("Fancy Pack")          // 有効 + 強制
client.packs.force("Fancy Pack", false)    // 強制だけ外す
client.packs.move("Fancy Pack", -1)        // 優先度を 1 つ下げる
```

---

## ユーティリティ

| 関数 | 説明 |
| --- | --- |
| `console.log / info / warn / error / debug / dir / table / assert / time / timeEnd` | コンソールに出力 |
| `inspect(value, {depth, maxItems})` | 表示用の文字列化 |
| `fmt(vec)` | `"1.5, 64, -3"` |
| `dist(a, b)` | 2 点間の距離 |
| `hex(n)` | `"0x…"` |
| `runScript(name)` | `scripts/name.js` をモジュールとして実行。同じスクリプトをもう一度実行すると、前回のタイマー・イベント購読・パネル・ウォッチを解除してから読み直す |

---

## dbg

メモリと内部構造を調べるためのツールです。アドレスは数値（double）で扱います（ユーザー空間のアドレスは 2^53 未満なので正確）。
使い方の流れは [DEBUG.md](DEBUG.md) を参照してください。

### メモリ読み取り

| 関数 | 説明 |
| --- | --- |
| `read(addr, len)` | `ArrayBuffer`（読めなければ `null`） |
| `u8 i8 u16 i16 u32 i32 f32 f64 ptr (addr)` | 数値 1 つ |
| `u64 i64 (addr)` | BigInt |
| `str(addr)` | libc++ の `std::string` |
| `hstr(addr)` | Bedrock の `HashedString` |
| `cstr(addr, max)` | NUL 終端文字列 |
| `hexdump(addr, len)` | 16 進ダンプ |
| `fields(addr, len)` | 8 バイトごとの推定表示（ポインタ先のクラス、文字列、HashedString、float/int） |

### RTTI / オブジェクト

| 関数 | 説明 |
| --- | --- |
| `rtti(name)` | クラス情報（基底・派生・vtable） |
| `search(text, n)` | クラス名の部分一致検索 |
| `classify(addr)` | `addr` のオブジェクトのクラス（vptr から） |
| `vfuncs(nameOrVptr, n)` | vtable の関数アドレス |
| `find(className, derived = true, limit)` | ヒープ上のインスタンス（検証済み） |
| `module()` | `libminecraftpe.so` の位置とセクション |
| `regions(filter)` | `/proc/self/maps` |

### ECS

| 関数 | 説明 |
| --- | --- |
| `ecs(filter?)` | コンポーネントプール一覧 `{name, storage, size, sizeKnown, tag, count}` |
| `storage(name)` | 1 つのプール |
| `ecsEntities(component, limit)` | そのコンポーネントを持つエンティティ ID |
| `ecsGet(entityId, component)` | コンポーネントのアドレス |
| `ecsSetSize(component, bytes)` | 要素サイズを手動設定（その場限り。恒久的には `componentSizes`） |
| `components(entity)` | `entity.ecs()` と同じ |

### スキャン・差分・正体判定

| 関数 | 説明 |
| --- | --- |
| `findF32(v, max)` `findI32(v, max)` | 4 バイト境界の値を検索 |
| `findF64(v, max)` `findU64(v, max)` `findValue(v, max)` | 8 バイト境界の値を検索 |
| `findString(text, max)` | UTF-8 文字列を検索 |
| `findBytes(pattern, max)` | バイト列（`"de ad be ef"`、配列、`Uint8Array`） |
| `refine(addrs, type, value \| predicate)` | 今の値で絞り込み（`type`: `u8` … `f64` `ptr`、float は誤差許容） |
| `snapshot(addrOrEntity, len)` / `diff(snapshot, snapshot2?, {raw})` | 変化したフィールドの一覧 |
| `whereIs(addr, back = 0x1000)` | そのアドレスが何か: ECS コンポーネント（コンポーネント名・オフセット・持ち主のエンティティ）、直前の多相オブジェクト、モジュール内オフセット、メモリ領域 |
| `log(n)` / `backend()` | ログ / メモリ読み取り方式 |

---

## エラー

| エラー | 意味 |
| --- | --- |
| `NotSupportedOnClientError` | クライアントにはできない操作（ワールドの変更・サーバーだけの情報） |
| `InvalidEntityError` | エンティティが消えた（描画距離外・死亡など） |
| `ScriptEval: not in a world` | ワールドに入っていない / 構造を検出できない（`client.status().error`） |
| `Script interrupted: time limit exceeded` | `evalTimeoutMs` / `tickTimeoutMs` を超えた、または Stop された |
