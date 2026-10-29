# デバッグ・解析ガイド

ScriptEval はゲームのシンボルを使わず、RTTI とメモリの形から必要な場所を探します。
このページは「値が取れない」「新しいバージョンで壊れた」「自分で別の値を読みたい」ときの手順です。

## 1. まず状態を見る

```js
client.status()
```

| 項目 | 意味 |
| --- | --- |
| `rtti` | `libminecraftpe.so` から索引化したクラス数。0 ならモジュールが見つかっていない |
| `inWorld` / `error` | ワールド構造を検出できたか。失敗理由は `error` |
| `localPlayer` / `localPlayerClass` | 見つけた LocalPlayer オブジェクト |
| `componentPools` | ECS のコンポーネントプール数（実機では 100 以上が普通） |
| `actors` | 読み込み済みのアクター数 |
| `levelClass` / `playerList` | Level とプレイヤーリストを見つけたか |
| `tickHook` | tick フックの状態（`installed` `slot` `ticking`） |

`log.txt`（`client.log()` でも可）には探索の各段階が出ます（数値は例）。

```
RTTI index: 41230 classes, 38811 vtables (850 ms)
LocalPlayer scan: 412 regions, 1530.2 MB scanned, 3 hits, 980 ms
LocalPlayer 0x7f… (LocalPlayer) entity=… registry=0x7f… (312 pools)
components: 312 pools, packedPage=1024, allocatorHeaders=1, inferred sizes=180, stateVectorPtr=…
level: ClientLevel @0x7f… (actor+0x…)
player list map @0x7f… (level path …)
dimension pointer at actor+0x… (OverworldDimension)
player name field at actor+0x… (5/5 players)
tick hook: sampled 290 slots for 1.50s: [123: 20.0Hz] … -> hooked slot 123
```

どの行で止まっているかで原因の場所が分かります。`client.rescan()` でいつでもやり直せます。

## 2. ECS コンポーネントを見る

位置・向き・ID などはほとんど ECS（EnTT）のコンポーネントにあります。

```js
world.getLocalPlayer().ecs()          // 自分が持つコンポーネント {name, address, size, tag}
dbg.ecs("Rotation")                   // プール一覧（size が 0 / sizeKnown:false のものは要素サイズ不明）
dbg.hexdump(world.getLocalPlayer().ecs("ActorRotationComponent"), 32)
```

要素サイズが間違っていると、2 体目以降のエンティティの値がずれます。全員同じ値になる・隣のエンティティの値が出る、
といった症状のときは `componentSizes` で上書きします。

```json
"componentSizes": { "ActorRotationComponent": 16, "StateVectorComponent": 36 }
```

サイズの確かめ方: `dbg.ecsEntities(name)` で 2 体のエンティティを取り、`dbg.ecsGet(e, name)` のアドレス差が
（同じページ内なら）要素サイズの整数倍になっているか、`dbg.hexdump` で並びを見ます。

## 3. 値スキャナ（場所の分からない値を探す）

Cheat Engine と同じ流れです。

```js
// 1. 今の値で探す（体力 20、float）
let hits = dbg.findF32(20, 100000)
hits.length
// 2. ゲーム内で値を変える（ダメージを受ける）
// 3. 新しい値で絞り込む
hits = dbg.refine(hits, "f32", 17)
// 変化の向きだけ分かるときは関数で
hits = dbg.refine(hits, "f32", v => v < 17 && v > 0)
// 4. 何のメモリか調べる
hits.map(a => dbg.whereIs(a))
```

`whereIs` は次を調べます。

- `ecs`: ECS コンポーネントの中なら、コンポーネント名・コンポーネント内オフセット・エンティティ・そのアクター
- `nearestObject`: 直前（既定 0x1000 バイト以内）にある vtable 付きオブジェクトとそこからのオフセット（ヒューリスティック）
- `module`: `libminecraftpe.so+0x…`（静的データ・コード）
- `region`: `/proc/self/maps` の領域

整数は `findI32`、double / 64bit は `findF64` / `findU64`、文字列は `findString("Steve")`、
任意のバイト列は `findBytes("de ad be ef")`。

## 4. スナップショット差分

「この操作で何が変わったか」を調べます。

```js
const before = dbg.snapshot(world.getLocalPlayer(), 0x1800)    // Actor オブジェクト先頭 0x1800 バイト
// ゲーム内で操作（スニーク、ジャンプ、アイテム持ち替え…）
dbg.diff(before)
// +01a4  0x0  -> 0x1   i32 0 -> 1
// +01b0  0x42800000 -> 0x42840000  i32 … f32 64 -> 66
dbg.diff(before, undefined, { raw: true })   // 配列で受け取る
```

ECS コンポーネントにも使えます: `dbg.snapshot(world.getLocalPlayer().ecs("StateVectorComponent"), 36)`。

## 5. 未知のクラスを調べる

```js
dbg.search("Scoreboard")                 // 名前の部分一致
dbg.rtti("ClientScoreboard")             // 基底・派生・vtable
dbg.find("ClientScoreboard")             // ヒープ上のインスタンス
dbg.fields(dbg.find("ClientScoreboard")[0], 0x200)
// +0000  0x7f772cdfb778     vptr          ClientScoreboard
// +0018  0x557d2b691100     heap*
// +0020  0x2                int           2 | u32 2, 0
// +0038  0x3f800000         float2        1, 0
dbg.vfuncs("LocalPlayer", 20)            // vtable の関数アドレス
dbg.classify(addr)                       // そのアドレスのオブジェクトのクラス
```

`fields` は各 8 バイトを「vptr / クラスの分かるポインタ / ヒープ・モジュールへのポインタ / std::string / HashedString /
float / int」として推定表示します。

## 6. オフセットの上書き

自動検出の結果はワールド検出後に `client.offsets()` で見られ（未検出の項目は -1）、そのまま `config.json` の
`offsets` に書けます（10 進数）。書いた項目は自動検出より優先されます。

| キー | 意味 |
| --- | --- |
| `entityContext` / `registryPtr` / `entityId` | Actor 内の EntityContext（レジストリへのポインタとエンティティ ID）の位置 |
| `level` | Actor 内の Level ポインタの位置 |
| `dimension` | Actor 内の Dimension ポインタの位置 |
| `playerName` | Player 内のプレイヤー名（std::string）の位置 |
| `stateVectorPtr` | Actor 内の StateVectorComponent へのポインタ（あれば） |
| `playerListMapPath0` / `playerListMapPath1` | Level からプレイヤーリスト（unordered_map）までの経路 |
| `pleUuidVal` | プレイヤーリストの要素内のオフセット |
| `getBlockSlot` | `dimension.getBlock` に使う BlockSource の仮想関数スロット |

例: `dbg.fields(world.getLocalPlayer().address, 0x1400)` で自分の名前が出ている行が

```
+1178  0x445f657665745312 string        "Steve_Dev"
```

なら、`"offsets": { "playerName": 4472 }`（0x1178 = 4472）。

## 7. tick フック

```js
client.tick()   // {installed, slot, ticks, ticking, onGameThread}
```

- ワールド検出後に LocalPlayer の仮想関数を `tickSampleMs` の間計測し、自分のオブジェクトに対して約 20Hz で呼ばれる
  ゲームスレッドの関数にフックします（他の LocalPlayer、例えば UI のプレビュー用は数えません）。
- 何度も同じスロットが選ばれるなら `tickHookSlot` に固定すると計測を省けます。
- 不安定なら `"tickHook": "off"`。スクリプトは別スレッドの仮想 tick で動きます（`getBlock` は使えなくなります）。

## 8. 不具合報告に含めるとよいもの

- ゲームのバージョン（`client.status().gameVersion`）と CPU（x86_64 / arm64）
- `log.txt`
- `client.status()` と `client.offsets()` の出力
- 期待した値と実際の値（`dbg.fields` / `dbg.hexdump` の出力があると原因を特定しやすい）
