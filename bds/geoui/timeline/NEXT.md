# 続きのプロンプト（GeoUI タイムライン）

次のセッションの AI に、下の枠の中をそのまま貼る。2026-10-22 に書いた（コードは「作り直し（本物の大きさの譜面）」のコミットまで）。
設計と記録は [PLAN.md](PLAN.md)、使い方は [../TIMELINE.md](../TIMELINE.md)。

このリポジトリは公開なので、前の会話の記録・添付の素材（zip など）・ログインの記録はここに置かない。

```
noknoh12345-afk/bds-lab の GeoUI タイムライン（bds/geoui/timeline/）の続き。設計と記録は bds/geoui/timeline/PLAN.md、使い方は bds/geoui/TIMELINE.md。
7 段・見直し・「作り直し（本物の大きさの譜面）」は済み（300 個の譜面でプロパティ 15 個・最長 653 文字・括弧 9 段、Node の試験・ブラウザ・本物の BDS で確かめ済み）。

守ること:
- .github/・auto/policy.json・auto/STOP・.env は触らない。bds/vendor/bedrock-server.zip はコミットしない（git add -A -- . ':!bds/vendor/bedrock-server.zip'）
- 今ある試験は変えない・緩めない（設計を変えた所だけ、同じかより強い確かめに直してよい）
- 画面の文は日本語、コードのコメントは英語。timeline の各ファイルは IIFE の形（T.<part> = {…}; module.exports）。tests/tl-*-offline.mjs は Node の標準だけ
- コミットのメッセージは日本語で、最後に次の 2 行:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SgjYyPNaRcdVLjEzRkVQeo
- 本物のアプリでの確かめ（app.yml の dispatch）は、私に聞いて許可をもらってから。勝手に回さない
- 本物のゲームでしか分からないことは「要実測」と書き、決めつけない

最初にやること（私の許可が出たら、1 本ずつ）: 新しい書き出しを本物のアプリで確かめる
- geoui_probe_m（書き出しが出す形だけ: splitLines の行・1000 文字・括弧 24 段・2000 個の引き方・3000 行 45 万文字）  lane probe4-m
- geoui_probe_tl（新しいプロパティでタイムラインの時計・人形）  lane probe4-tl
- geoui_rhythm（19 個）  lane rhythm-3
- geoui_rhythm_big（300 個・2 分。app.txt は 2〜112 秒に写す）  lane rhythm-big-1
- 回し方: gh api -X POST repos/noknoh12345-afk/bds-lab/actions/workflows/app.yml/dispatches -f ref=main -f "inputs[addon]=<名前>" -f "inputs[mode]=run" -f "inputs[account]=true" -f "inputs[screen]=720x1560" -f "inputs[lane]=<lane>" -f "inputs[knobs]=APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"
- 結果: gh run download <run> → probe は node bds/geoui/timeline/probe.mjs read <summary.json>、rhythm は summary.json と measure diff の数。
  答えに合わせて compile.js などを直し、PLAN.md の「本物のアプリで確かめたこと」に足す。参加できなかった実行は failed_codes（join-lan-missing など）を見る

全部の試験（変えたら毎回）:
  for f in tests/tl-*-offline.mjs tests/geoui-builder-offline.mjs tests/lint-offline.mjs; do node $f || exit 1; done
  node bds/geoui/build.mjs --check; node bds/geoui/timeline/probe.mjs --check; node bds/geoui/timeline/demo.mjs --check（W 行が出ないこと）
  ブラウザの環境で: node bds/geoui/blockbench-check.mjs、for f in bds/geoui/timeline/check-*.mjs; do node $f || exit 1; done
  本物の BDS で（cd bds; node lab.mjs setup が要る）: node lab.mjs go -a geoui_rhythm、node lab.mjs go -a geoui_rhythm_big

ブラウザの環境（前のセッションの物は残っていないので作り直す）:
- BLOCKBENCH_DIR: git clone --depth 1 --branch v5.2.2 https://github.com/JannisX11/blockbench → npm ci --ignore-scripts → npm run build-web
- GEOUI_NODE_MODULES: playwright-core のある node_modules（例 /opt/npm-tools/node_modules）
- CHROMIUM: 例 /opt/pw-browsers/chromium-1194/chrome-linux/chrome

残っている要実測: 上の 4 本の答え。probe_b の #400 の板だけ見つからなかった理由（前後の番号は動く）。render controller 70 個・
ボーン 600 本・アニメーション 1200 個より先（書き出しは超えると注意を出す）。geoui_bb・geoui_calib* は前の確かめの物（測り直すときだけ作り直す）。
```
