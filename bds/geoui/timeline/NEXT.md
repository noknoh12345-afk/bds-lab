# 続きのプロンプト（GeoUI タイムライン）

次のセッションの AI に、下の枠の中をそのまま貼る。2026-10-22 に書いた（コードは 3caed45 まで）。
設計と記録は [PLAN.md](PLAN.md)、使い方は [../TIMELINE.md](../TIMELINE.md)。

このリポジトリは公開なので、前の会話の記録・添付の素材（zip など）・ログインの記録はここに置かない。

```
noknoh12345-afk/bds-lab の GeoUI タイムライン（bds/geoui/timeline/）の続き。設計と記録は bds/geoui/timeline/PLAN.md、使い方は bds/geoui/TIMELINE.md。
7 段（tl-model〜tl-bridge）と見直しは済み。最新のコミットは 3caed45（osu! のスライダーの体を玉の通る線で描く・見本に体）。

守ること:
- .github/・auto/policy.json・auto/STOP・.env は触らない。bds/vendor/bedrock-server.zip はコミットしない（git add -A -- . ':!bds/vendor/bedrock-server.zip'）
- 今ある試験は変えない・緩めない（設計を変えた所だけ、同じかより強い確かめに直してよい）
- 画面の文は日本語、コードのコメントは英語。timeline の各ファイルは IIFE の形（T.<part> = {…}; module.exports）。tests/tl-*-offline.mjs は Node の標準だけ
- コミットのメッセージは日本語で、最後に次の 2 行:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MjmTQamrGKDgphXzbYswdw
- 本物のアプリでの確かめ（app.yml の dispatch）は、私に聞いて許可をもらってから。勝手に回さない
- 本物のゲームでしか分からないことは「要実測」と書き、決めつけない

最初にやること:
1. bds/geoui/timeline/check-bridge.mjs に足した「スライダーの体をプレビューの画素で確かめる」項目（"the slider's body in the preview"）を回す。まだ一度も回していない。
   落ちたら、まず確かめの側（Blockbench の world の x は書き出しの x の符号を逆にしたもの、copy の箱の中心と param bx・by から点を画面へ写す）を疑い、
   次にコード（osu.js の lineOf・media.js の bodyImage・bridge.js の bodyAtlas と ensureElements）を直す。理由なく閾値を緩めない。
2. 全部の試験:
   for f in tests/tl-*-offline.mjs tests/geoui-builder-offline.mjs tests/lint-offline.mjs; do node $f || exit 1; done
   node bds/geoui/build.mjs --check; node bds/geoui/timeline/probe.mjs --check; node bds/geoui/timeline/demo.mjs --check（W 行が出ないこと）
   ブラウザの環境で: node bds/geoui/blockbench-check.mjs、for f in bds/geoui/timeline/check-*.mjs; do node $f || exit 1; done
3. PLAN.md の「まだ回していない」を結果に直してコミット・push（git fetch → 未追跡の zip を stash → rebase → push → stash pop）。

ブラウザの環境（前のセッションの物は残っていないので作り直す）:
- BLOCKBENCH_DIR: git clone https://github.com/JannisX11/blockbench → npm ci --ignore-scripts → npm run build-web（5.2.2 で確かめた）
- GEOUI_NODE_MODULES: playwright-core のある node_modules（例 /opt/npm-tools/node_modules）
- CHROMIUM: 例 /opt/pw-browsers/chromium-1194/chrome-linux/chrome

残っている要実測（私の許可が出たら）:
- 3 回目の確かめ: fade の材質（USE_COLOR_MASK）で不透明度が効くか・回転の向き・initialize と人形（paper doll）・コンテンツログ → geoui_probe と geoui_probe_tl
- Molang の 1 行の長さの上限 → geoui_probe_m（geoui_rhythm の一番長い行は 7465 文字。注意を出すのは 8000）
- geoui_rhythm を本物のアプリで写す（rhythm-3。今回からスライダーの体も入っている）
- 回し方（1 本ずつ）:
  gh api -X POST repos/noknoh12345-afk/bds-lab/actions/workflows/app.yml/dispatches -f ref=main -f "inputs[addon]=<geoui_probe|geoui_probe_m|geoui_probe_tl|geoui_rhythm>" -f "inputs[mode]=run" -f "inputs[account]=true" -f "inputs[screen]=720x1560" -f "inputs[lane]=<probe3-s|probe3-m|probe3-tl|rhythm-3>" -f "inputs[knobs]=APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"
  結果: node bds/geoui/timeline/probe.mjs read <summary.json>。答えに合わせて compile.js などを直し、PLAN.md の「本物のアプリで確かめたこと」に足す
- geoui_bb・geoui_calib* は GeoUI の alpha を大きさで隠す変更より前のもの。測り直すときだけ作り直す
```
