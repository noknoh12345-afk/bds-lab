# scripteval を素の Minecraft APK(redroid)で検証する

bds-lab の redroid 基盤(apkeep で本物の MC を導入 → 端末準備 → 起動)を使い、**ユーザー自身の mcpelauncher mod
「scripteval」の libscripteval.so を素の Android APK に注入して、何がどこまで動くか**を実機(GitHub Actions)で確かめる。
HANDOFF §6 の検証。

## これまでに分かったこと

- **run #8(0.3.0)**: 素の APK 内で **読み取り専用の JS ランタイムが立つ**(REPL 応答・RTTI 78509 クラス構築・
  LocalPlayer スキャン)。ただし 0.3.0 は読み取り専用で `injectInput` は無い。
- **0.3.1(このハーネスで検証中)**: ソースに **injectInput・http(+https)・グロリソ(web からパック強制導入)・
  mod 自己更新** が足された(別配布 zip の `scripteval-0.3.1.patch`)。この版の .so を同じ基盤に載せて確かめる。

## 段取り(3 段)

1. **タイトル画面(自動)**: 注入 → REPL → `probe.mjs` が JS ランタイム・版・`ScriptEval.injectInput` の有無を確かめ、
   `features.mjs` が 0.3.1 の機能を 1 つずつ実走する:
   - injectInput: `agent.status()` が配線を言い、`agent.forward()/turn()/stop()` が戻り値に反映され、呼んでも落ちない
     (移動・視点が**実際に効く**かは版依存オフセット次第 → 下の 3 段目で探す)
   - http: `http.get/post`・`.json()`・`.text()` をこのホストの小さな HTTP サーバ(docker ブリッジ越し)に。**https** は
     その環境の libcurl 次第(素の APK には無いはず): 可否は問わず何が返るかを記録
   - グロリソ: `client.packs.installUrl(url)` で .mcpack を DL→inflate(libz dlopen)→強制導入され、パックが 1 枚増える
   - 自己更新: `ScriptEval.update(url, {dest})` が呼べる(実 DL とステージングは dest 指定で確かめる。実行中の .so は触らない)
2. **Studio の見た目**: `studio.mjs` がこのホストの Chrome で Studio(:25600)を開き「操作」タブを撮る(URL の token は伏せる)。
3. **ワールドの中(参加後)**: `world.mjs` が、injectInput の実効に要るオフセット(config.json の
   `offsets.moveVectorX/Z`・`cameraYaw/Pitch`)を **mod 自身の読み取り専用 dbg**(`dbg.snapshot`/`dbg.diff`)だけで探す。
   本物のコントローラ(lab-pad)で前進・視点を動かし、その読み値に合わせて変わった構造体内の f32 を 2 回の試行で突き止める。
   **一切書き込まない**(読むだけ)。見つかったオフセットを config.json に入れれば injectInput の戦略A(直接書き込み)がこの版で効く。
   ※ タイトルのまま(未参加)の run では「未参加」を記録して次段へ。参加の配線は次の課題。

## 構成

| ファイル | 役割 |
|---|---|
| `../scripteval.mjs` | オーケストレータ。端末を起こす → frida → 封緘 .so 開封 → push → 注入 → token → プローブ → 機能 → ワールド → report |
| `probe.mjs` | REPL の実プロトコル(25599 / `#AUTH` / `.frame` / `#B64` / `\x04\n`)。読み取り + 版 + injectInput の有無。`Repl`/`openRepl`/`Repl.js` も |
| `features.mjs` | 0.3.1 の機能(injectInput 配線 / http / グロリソ / 自己更新)を REPL 越しに実走。端末不要 `--selftest` |
| `world.mjs` | ワールドの中でオフセットを探す(scan→perturb→refine を dbg.snapshot/diff で)。端末不要 `--selftest`(偽プレイヤーメモリ) |
| `inject_mod.py` | Frida: 実行中 MC へ attach → `Module.load` → `mod_preinit`/`mod_init`(新しい注入機構は作らない) |
| `seal-so.mjs` | libscripteval.so を鍵で封緘し `.bin` に(公開リポジトリに素の .so は置かない=`app guard`) |
| `libscripteval-<abi>.so.bin` | 封緘済みの .so(あなたが commit)。素の `.so` はコミットしない(`.gitignore`) |

## 鍵(封緘)

`.so` は著作物ではないが公開リポジトリに素で置かない方針。**専用鍵 `SCRIPTEVAL_SO_KEY`** で封緘する(端末の金庫
`APP_CACHE_KEY` には触らない)。無ければ従来どおり `APP_CACHE_KEY`(無ければ `GOOGLE_AAS_TOKEN`)。鍵はあなたの手元か
Secrets にだけあり、`seal-so.mjs` も CI も同じ決め方(`soVaultKey`)で開ける。

```
SCRIPTEVAL_SO_KEY=… node app/redroid/scripteval/seal-so.mjs x86_64    <path>/libscripteval-x86_64.so
SCRIPTEVAL_SO_KEY=… node app/redroid/scripteval/seal-so.mjs arm64-v8a <path>/libscripteval-arm64-v8a.so
git add app/redroid/scripteval/libscripteval-*.so.bin && git commit -m "scripteval 0.3.1 .so(封緘)"
```

## 回す

- **GitHub(推奨)**: Actions → **redroid** → Run workflow で入力 `scripteval` を on(タイトル画面の検証)。さらに
  `scripteval_world` も on にすると、注入後に自分のシングルプレイ world を開いてオフセットまで探す(3 段目)。端末準備のあと
  注入+プローブ+機能(+world)が走り、`redroid-game` artifact の `scripteval-report.json`(封じた中)と `run_log` の
  `SE_EVIDENCE {json}` 1 行に結果が出る。Secrets は `SCRIPTEVAL_SO_KEY`(+ 既存の `APP_CACHE_KEY`/`GOOGLE_AAS_TOKEN`)。
- **手元(Linux + docker + binder)**: `node lab.mjs app redroid prep`(または open)で端末を用意し、
  `SCRIPTEVAL_SO_KEY=… node app/redroid/scripteval.mjs run [--open-world] --out out`。
  - `--open-world`: 注入後に自分のシングルプレイ world を開く(BDS なし=切断されない。injectInput が実際にプレイヤーを動かす)。
  - `--no-launch`: 画面に触らず、いま起動中のゲームをそのまま使う(常駐の端末を自分で world に入れてあるとき)。

## 結果の読み方(`result` と `SE_EVIDENCE`)

- `result`: `offsets_found`(ワールドでオフセットも特定)/ `injectinput_present`(素の APK で injectInput が生えた=0.3.1)/
  `js_runtime_up`(読み取り JS が動く)/ `repl_reachable`(繋がるが未確認)/ `repl_unreachable` / `mc_not_running` / `no_so` / `frida_failed`
- `probe.conclusions`: JS ランタイムが動くか・ワールドを読めるか・injectInput API があるか
- `features`: 0.3.1 機能ごとの可否と中身。`world`: 見つかったオフセット(config.json へ入れる値)

## 検証済み(この環境・端末不要)

- `node app/redroid/scripteval/probe.mjs --selftest`(偽 REPL で実プロトコル・版・injectInput の有無)
- `node app/redroid/scripteval/features.mjs --selftest`(偽 REPL + 本物の HTTP で http/グロリソ/自己更新の配線)
- `node app/redroid/scripteval/world.mjs --selftest`(偽プレイヤーメモリで scan→perturb→refine がオフセットを当てる)
- `node app/redroid/scripteval.mjs --selftest` / `node tests/scripteval-offline.mjs`(鍵の決め方 + 上の全部)
- vault 封緘→開封の往復(本物の .so・sha256 一致)
