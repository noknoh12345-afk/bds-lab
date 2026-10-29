# scripteval mod のソース（lab が所有・再ビルドする）

これは mcpelauncher / 素の Android APK 用 mod「ScriptEval」の本体ソース（C++20 + QuickJS-ng + prelude.js）。
lab 自身が NDK で再ビルドして封緘するために置いてある。**素の .so はコミットしない**（app guard）: ビルド成果物は
`.gitignore` 済みで、封緘した `.bin` だけが `app/redroid/scripteval/libscripteval-<abi>.so.bin` に入る。

## 再ビルド（CI）
Actions → **scripteval-build** → Run workflow（`abi=all`・`commit=true`）。NDK r27c で x86_64 / arm64-v8a を
ビルド → `inject_input` コアの単体テスト → `SCRIPTEVAL_SO_KEY`（Secrets）で封緘 → `.bin` をこのブランチに commit。
その後 **redroid**（`scripteval` と `scripteval_world` を on）で実機にのせて確かめる。
（コミットメッセージに `[scripteval build]` を入れた push でも自動で走る。）

## 再ビルド（手元）
```
NDK=/path/to/android-ndk-r27c
for abi in x86_64 arm64-v8a; do
  cmake -S app/redroid/scripteval/mod-src -B app/redroid/scripteval/mod-src/build-$abi -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=$NDK/build/cmake/android.toolchain.cmake \
    -DANDROID_ABI=$abi -DANDROID_PLATFORM=android-24
  cmake --build app/redroid/scripteval/mod-src/build-$abi
done
# 封緘（鍵は手元にだけ）
SCRIPTEVAL_SO_KEY=… node app/redroid/scripteval/seal-so.mjs x86_64    app/redroid/scripteval/mod-src/build-x86_64/libscripteval.so
SCRIPTEVAL_SO_KEY=… node app/redroid/scripteval/seal-so.mjs arm64-v8a app/redroid/scripteval/mod-src/build-arm64-v8a/libscripteval.so
```
QuickJS-ng v0.17.0 は CPM が取得（オフラインは `-DQUICKJS_DIR=…`）。Studio の dist は同梱の `studio/dist/index.html.gz`
を埋め込む（画面を変えたら `cd studio && npm ci && npm run build`）。詳細は `README.md`。

## 0.3.2 の追加点（このソース）
- `src/input_backend.cpp`：injectInput を**自己較正**化。移動/視点を、ScriptEval が読み取りで当てている ECS
  コンポーネント（`StateVectorComponent` / `ActorRotationComponent` …）へ直接書く。版依存オフセット（config.json の
  `offsets`）が無くても効く（あれば手動上書きを優先）。離散操作は配線可視化のみ（版の内部関数結線はこの先）。
- 0.3.1 由来：`http`(libcurl dlopen / 生ソケット)、グロリソ(web からパック強制導入)、mod 自己更新、Studio「操作」タブ。
