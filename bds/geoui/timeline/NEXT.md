# 続きのプロンプト（GeoUI タイムライン）

次のセッションの AI に、下の枠の中をそのまま貼る。2026-10-22 に書いた（7 回目の確かめと、参加の道筋・入り直しのコミットまで）。
設計と記録は [PLAN.md](PLAN.md)、使い方は [../TIMELINE.md](../TIMELINE.md)。

このリポジトリは公開なので、前の会話の記録・添付の素材（zip など）・ログインの記録はここに置かない。

```
noknoh12345-afk/bds-lab の GeoUI タイムライン（bds/geoui/timeline/）の続き。設計と記録は bds/geoui/timeline/PLAN.md、使い方は bds/geoui/TIMELINE.md。
7 段・見直し・作り直し（本物の大きさの譜面）は済み。本物のアプリで 300 個の譜面（geoui_rhythm_big）が最後まで動き、
pre_animation は 61 万文字・4029 行（geoui_probe_sz）、5029 行（geoui_probe_lc）まで動いた。

守ること:
- .github/・auto/policy.json・auto/STOP・.env は触らない。bds/vendor/bedrock-server.zip はコミットしない（git add -A -- . ':!bds/vendor/bedrock-server.zip'）
- 今ある試験は変えない・緩めない（設計を変えた所だけ、同じかより強い確かめに直してよい）
- 画面の文は日本語、コードのコメントは英語。timeline の各ファイルは IIFE の形（T.<part> = {…}; module.exports）。tests/tl-*-offline.mjs は Node の標準だけ
- コミットのメッセージは日本語で、最後に次の 2 行:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <そのセッションの URL>
- 本物のアプリでの確かめ（app.yml の dispatch）は、私に聞いて許可をもらってから。勝手に回さない
- 本物のゲームでしか分からないことは「要実測」と書き、決めつけない

最初にやること（どちらも私の許可をもらってから、1 本ずつ）:
- geoui_probe_vx（変数の数の限度: エンティティの中で 3032 個目は効き、geoui_probe_m の 3053 個目は値が合わなかった。3000〜5000 個を
  細かく、?? ありとなしで、最後に 1・2000 個目をもう一度読む）:
  gh api -X POST repos/noknoh12345-afk/bds-lab/actions/workflows/app.yml/dispatches -f ref=main -f "inputs[addon]=geoui_probe_vx" -f "inputs[mode]=run" -f "inputs[account]=true" -f "inputs[screen]=720x1560" -f "inputs[lane]=probe8-vx" -f "inputs[knobs]=APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"
  読み方: node bds/geoui/timeline/probe.mjs read <summary.json>。分かった限度で compile.js の変数の注意（今は 3000 個）と TIMELINE.md を直す
- geoui_rhythm_huge（1000 個・3.2 MB。addon/geoui_rhythm_huge の枝。2 回とも参加の時にゲームが「An error has occurred」）を、
  until joined の入り直し（ゲームのエラーなら LAN のワールドにもう一度、2 回まで）で:
  上と同じ形で inputs[addon]=geoui_rhythm_huge、inputs[ref]=addon/geoui_rhythm_huge（ワークフローは ref=main のまま。枝の
  app.yml は動かない）、lane rhythm-huge-3。枝が main より古ければ git rebase origin/main して node bds/geoui/timeline/demo.mjs --huge
  で作り直し、その枝に push（--force-with-lease）
- 結果: gh run download <run> → summary.json の failed_codes・failed_trails・join_trail・join_seconds・join_connect_seconds（参加の
  道筋はラボの語だけ: app/lib/failcodes.mjs）。写真と録画は私の Discord に届く（summary.json の media に送った数）。
  成果物の中身は封じてある（鍵が無いと読めない）

全部の試験（変えたら毎回）:
  for f in tests/tl-*-offline.mjs tests/geoui-builder-offline.mjs tests/lint-offline.mjs; do node $f || exit 1; done
  node bds/geoui/build.mjs --check; node bds/geoui/timeline/probe.mjs --check; node bds/geoui/timeline/demo.mjs --check（W 行が出ないこと）
  app を変えたら: node tests/app-offline.mjs、node tests/results-public-offline.mjs、node tests/feed-offline.mjs
  ブラウザの環境で: node bds/geoui/blockbench-check.mjs、for f in bds/geoui/timeline/check-*.mjs; do node $f || exit 1; done
  本物の BDS で（cd bds; node lab.mjs setup が要る）: node lab.mjs test -a geoui_rhythm、node lab.mjs test -a geoui_rhythm_big
  （BDS を落とせない環境では、push した後の CI の verify の bds ジョブが同じ物を回す）

ブラウザの環境（前のセッションの物は残っていないので作り直す）:
- BLOCKBENCH_DIR: git clone --depth 1 --branch v5.2.2 https://github.com/JannisX11/blockbench → npm ci --ignore-scripts → npm run build-web
- GEOUI_NODE_MODULES: playwright-core のある node_modules（例 /opt/npm-tools/node_modules）
- CHROMIUM: 例 /opt/pw-browsers/chromium-1194/chrome-linux/chrome

残っている要実測: 変数の数の限度（geoui_probe_vx）。1000 個の譜面が入れない理由（パックの大きさか、BDS の起動直後の重さか: 入り直しで
入れれば後者に近い。入れなければ 1.4 MB と 3.2 MB の間の大きさの見本で分ける）。render controller 70 個・ボーン 600 本・アニメーション
1200 個より先（書き出しは超えると注意を出す）。geoui_bb・geoui_calib* は前の確かめの物（測り直すときだけ作り直す）。
```
