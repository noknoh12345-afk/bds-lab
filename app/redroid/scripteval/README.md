# scripteval を素の Minecraft APK(redroid)で検証する

bds-lab の redroid 基盤(apkeep で本物の MC を導入 → 端末準備 → 起動)を使い、**ユーザー自身の
mcpelauncher mod「scripteval」の libscripteval.so を素の Android APK に注入して、JS ランタイムが
動くか**を実機(GitHub Actions)で確かめる。HANDOFF §6 の検証。

## まず知っておくこと(scripteval 0.3.0 のソースで確認)

- **scripteval 0.3.0 は読み取り専用**。`prelude.js` 冒頭が "read-only"、`teleport()` は
  `NotSupportedOnClientError` を投げる。**入力注入(`injectInput` 等の操作API)は存在しない**。
  → この検証で分かるのは「素の APK 内で**読み取り専用の**JS ランタイムが動くか」まで。
     操作(タッチレス制御)には scripteval 側に injectInput を足す改修が別途必要(リポジトリ直下の
     `app/redroid/scripteval/INJECTINPUT-DESIGN.md` 参照)。
- **mcpelauncher 専用 mod**。エントリは `mod_preinit`/`mod_init`(`JNI_OnLoad` は無い)。
  `platform.cpp` が `libmcpelauncher_*.so` を dlopen するが、**全て null チェック付きで graceful**なので
  素の APK でも `mod_init` は進む(ただし host libc 経由の一部機能は無効)。**本当に最後まで走って
  REPL が立つかはこの実機検証で分かる**(立たない/一部失敗も、有効な結果として記録する)。
- **REPL の実仕様**(= プローブが話す相手): TCP **25599**、bind `127.0.0.1`。接続後
  `#AUTH <token>`(token = `/data/data/com.mojang.minecraftpe/scripteval/session.token`、起動毎に変化)、
  `.frame` でフレーム応答(`\x04\n` 終端)、評価は `#B64 <base64(js)>`。

## 構成

| ファイル | 役割 |
|---|---|
| `../scripteval.mjs` | オーケストレータ。起動中端末に frida-server 用意 → 封緘 .so 開封 → push → 注入 → token取得 → プローブ → report |
| `probe.mjs` | REPL に正しいプロトコルで繋ぎ読み取り専用チェック(端末不要 `--selftest` あり) |
| `inject_mod.py` | Frida: 実行中MCに attach → `Module.load` → `mod_preinit`/`mod_init` を呼ぶ(新しい注入機構は作らない) |
| `seal-so.mjs` | libscripteval.so を vault 鍵で封緘し `.bin` にする(公開リポジトリ用。鍵は手元にだけ) |
| `libscripteval-<abi>.so.bin` | 封緘済みの .so(あなたが commit)。素の `.so` は **コミットしない**(`app guard`) |

## 使い方

### 1) .so を封緘してコミット(一度だけ・あなたの手元で)

`.so` は著作物でこそないが公開リポジトリに素で置かない方針。vault 鍵で封緘する。鍵(`APP_CACHE_KEY`、
無ければ `GOOGLE_AAS_TOKEN`)は手元の `.env.local` か環境変数に。**鍵はあなたの手元にだけ**あり、
CI では Secrets から同じ鍵で開封される。

```
node app/redroid/scripteval/seal-so.mjs arm64-v8a <path>/libscripteval-arm64-v8a.so
node app/redroid/scripteval/seal-so.mjs x86_64    <path>/libscripteval-x86_64.so
git add app/redroid/scripteval/libscripteval-*.so.bin && git commit -m "scripteval .so(封緘)"
```

### 2) 検証を回す

- **GitHub(推奨)**: Actions → **redroid** → Run workflow で入力 `scripteval` を on。
  端末準備(本物のMC導入・ワールド参加)まで済んだ後、注入+プローブが走り、`redroid-game` artifact の
  `scripteval-report.json` に結果が出る。`APP_CACHE_KEY`/`GOOGLE_AAS_TOKEN` は既存の Secrets を使う。
- **手元(Linux + docker + binder)**: `node lab.mjs app redroid prep`(または open)で端末を用意しMCをワールドに入れ、
  `node app/redroid/scripteval.mjs run --out out` 。

### 3) 結果の読み方(`scripteval-report.json` / ログ)

- `result`: `js_runtime_up`(REPL応答+read-only JS動作)/ `repl_reachable`(繋がるが読取未確認)/
  `repl_unreachable`(mod_init未完/REPL未起動)/ `mc_not_running` / `no_so` / `frida_failed`
- `probe.conclusions`: 素のAPKでJSランタイムが動くか・ワールドを読めるか(injectInput は常に「なし」)
- `scripteval_log`: scripteval 自身のログ(`launcher apis: ...`、`REPL listening on ...`、`RTTI: ...`)。
  mcpelauncher 不在時に何が無効化されたか・どこで落ちたかはここに出る。

## 検証済み(この環境・端末不要)

- `node app/redroid/scripteval/probe.mjs --selftest` → 偽REPL(実仕様再現)で **SELFTEST OK**
- `node app/redroid/scripteval.mjs --selftest` → 同上(import 連鎖込み)
- vault 封緘→開封の往復(本物の .so・sha256 一致)
