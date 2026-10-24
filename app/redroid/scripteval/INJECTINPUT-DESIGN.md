# 設計: scripteval に `injectInput`(入力注入)を足して操作を可能にする

scripteval 0.3.0 は**読み取り専用**で、操作系 API は無い(`prelude.js` は "read-only"、`teleport()` は
`NotSupportedOnClientError`)。クライアント完結のタッチレス操作(HANDOFF の目標)には、scripteval 側に
**ネイティブ入力注入**を足す必要がある。これはその設計(scripteval 0.3.0 のソース構造に合わせた具体手順)。

> これは **scripteval のソース改修**(別配布の zip 側)であって、bds-lab の変更ではない。
> ここには設計だけ置く。足場コード(パッチ)は別途 scripteval ソースに入れてビルドする。

## 作る物
1. **入力コア(MC非依存の状態機械)** — HANDOFF の `client/inject_input.{h,cpp}` をそのまま採用。
   フラット JSON を受け、保持入力(前後/左右/視点/スプリント/スニーク/ジャンプ)と単発(attack/use/jumpOnce)を持ち、
   毎tick `SeInputBackend`(関数ポインタ)へ反映する。単体テスト済み。scripteval の `src/` に追加し CMake に載せる。
2. **JS バインド** — scripteval の native は `__native` オブジェクトに生える(`src/jsengine.cpp:551`
   `setProp(g_ctx, global, "__native", native)`)。`src/jsnative.cpp` に `__native.injectInput(jsonStr)` を
   1 本足し、本体で `scripteval_inject_input(json)` を呼んで返り値(JSON)を返す。登録は同ファイルの
   既存関数(`status`/`scoreboard` 等、`JS_NewCFunction`+`setProp(ctx, native, "name", fn)`)に倣う。
3. **公開 API(prelude.js)** — `src/prelude.js` の「ScriptEval extensions」節に、`__native.injectInput` を包む
   `globalThis.ScriptEval = { injectInput: (o) => JSON.parse(__native.injectInput(JSON.stringify(o))) }` と、
   使い勝手の verb(`forward/back/turn/look/attack/use/jump/goto/stop`)を足す。verb の中身は HANDOFF の
   `client/agent_client.js` をほぼ流用できる(読み取りは `world.getLocalPlayer()`、操作は `ScriptEval.injectInput`)。
   ※ `goto` は位置/向きを読んで毎tick 補正するので、読み取り専用の世界でも操縦できる。
4. **毎tick 適用** — `src/tickhook.cpp` は既にゲームのフレーム/tick を vtable フックしている
   (`se_tick_entry`、「in-world local player のみ」)。ここの末尾で `scripteval_input_tick()` を呼べば、
   保持入力が毎フレーム反映される(新たなループは不要。既存フックに1行足すだけ)。
5. **バックエンド実装(版依存・唯一の難所)** — `SeInputBackend` を scripteval 内で1つ実装する。
   ローカルプレイヤーは `src/game.cpp`(`Game::localPlayer()`、`off_`、RTTI の LocalPlayer クラス、
   `config.json` の `"offsets"` 上書き)で既に解決済み。これに**移動入力と視点のオフセット**を足して書く:
   - **戦略A(直接)**: `setMoveVector(f, s)` = LocalPlayer の `MoveInputHandler`/`IMoveInput` の移動ベクタに
     `mem::write`。`setCamera(yaw, pitch, abs)` = 視点角に書く。必要なオフセット/vtable は
     **bedrock-binary で特定**する(`node lab.mjs bb apk <APKフォルダ> --scan`、`bb enum/commands`)。
     版ごとに変わるので `config.json` の `offsets` で差し替え可能にする(game.cpp が既に offsets を読む)。
   - 書き込みはクライアント権限で効く(HANDOFF §4 の検証: 視点/入力はクライアント権限)。他人の鯖でも効く。
   - 実オフセットが未確定の間は**no-op スタブ**を入れてビルドを通し、`ScriptEval.injectInput` の配線
     (JS→core→backend)だけ先に実機で確かめる(bds-lab の redroid 検証で `injectInput` が生えたかを見る)。
6. **config** — `src/config.{h,cpp}` に `inputInject`(bool, 既定 false)を足し、有効時のみ backend を有効化。

## 変更ファイル(scripteval ソース)
| ファイル | 変更 |
|---|---|
| `src/inject_input.h` / `src/inject_input.cpp` | 新規(HANDOFF の core をそのまま) |
| `src/input_backend_mc.cpp` | 新規。`SeInputBackend` の MC 実装(game.cpp のシンボル解決を使う。初版は stub) |
| `src/jsnative.cpp` | `__native.injectInput(jsonStr)` を1本登録 |
| `src/prelude.js` | `globalThis.ScriptEval.injectInput` と verb 群(agent_client.js 流用) |
| `src/tickhook.cpp` | `se_tick_entry` 末尾で `scripteval_input_tick()` を呼ぶ |
| `src/config.{h,cpp}` | `inputInject` 追加 |
| `CMakeLists.txt` | 新規 .cpp を追加 |

## ビルドと検証
- ビルドは scripteval の CMake + Android NDK(arm64-v8a / x86_64)。あなたの環境で
  `cmake --preset …`(リポジトリの `cmake/` 参照)→ 新しい `libscripteval.so`。
- 配線確認: HANDOFF の `client/test/test_goto.js`(実 core + 実 agent ロジックの閉ループ)で core は検証済み。
  実機では bds-lab の redroid 検証(`scripteval` 入力)で、まず `ScriptEval.injectInput` が生えたか=配線が通ったかを見る。
- 実操作は、戦略A のオフセットを bedrock-binary で埋めてから。

## 補足(安全・権限)
これは**あなた自身の mod にクライアント内入力を足す**改修(ゲームMOD)。
サーバ側の確定操作(teleport)は既に bds-lab の `agent` ユニットで検証済み、プロトコル bot も別経路としてある。
クライアント完結の操作が必要なときだけ、この injectInput を使う。
