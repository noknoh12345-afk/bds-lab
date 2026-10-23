# 続きのプロンプト（GeoUI タイムライン）

次のセッションの AI に、下の枠の中をそのまま貼る。2026-10-23 に書いた（9 回目の確かめ: 参加の内訳と 1000 個の 2 回目まで。
そのあと osu! を丸ごと: ドット絵のキューブと公式の素材の 2 つの見本、本物の BDS まで。2 回目: osu! の流れ全部（失敗・Mods・結果・
自己ベスト・検証ツアー・メニュー）、ドット絵版をキューブで組んだ模型に、app のバッチ（いくつかのアドオンを本物のアプリ 1 回で））。
設計と記録は [PLAN.md](PLAN.md)、使い方は [../TIMELINE.md](../TIMELINE.md)。

このリポジトリは公開なので、前の会話の記録・添付の素材（zip など）・ログインの記録はここに置かない。

```
noknoh12345-afk/bds-lab の GeoUI タイムライン（bds/geoui/timeline/）の続き。設計と記録は bds/geoui/timeline/PLAN.md、使い方は bds/geoui/TIMELINE.md。
7 段・見直し・作り直し（本物の大きさの譜面）は済み。本物のアプリで 300 個（geoui_rhythm_big）も 1000 個・6 分の譜面
（geoui_rhythm_huge、3.2 MB。2026-10-23 に既定の枝へ統合）も最後まで動いた。pre_animation は 61 万文字・4029 行（geoui_probe_sz）、
5029 行（geoui_probe_lc）、変数 5000 個（geoui_probe_vx）まで効く。ラボのボットは LAB_TRANSPORT=lan（nethernet-connect v3）で
1000 個のパックのワールドに入れる（tests.txt 8/8）。9 回目: 1000 個は 2 回目も 74 手順すべて通り、参加の長さはパックの大きさではなく
ラボのタイトル → PLAY の進め方だった（PLAN.md の 9 回目、app/DESIGN.md「参加の内訳」）。
osu! を丸ごと（PLAN.md の 8、TIMELINE.md「osu! を丸ごと作る」）: osugame.js（osu! のルール。パックのスクリプトとプレビューが同じコード）・
osukit.js（ドット絵をキューブで / 公式の Legacy スキン の 2 つの見た目、盤面の osu_shake・osu_tilt・osu_pulse）・osusong.js（ラボの曲
「Cubic Pulse」と譜面）、ゲーム全体の出来事と state.<名前>、rotationX・rotationY、mode auto|aim|relax・sens。2 回目（PLAN.md「8 の続き」）:
失敗とやり直し・Mods（HD FL NF SD PF）・結果の画面・自己ベスト（動的プロパティ・スコアボード）・メニュー /geoui:osu・検証ツアー
（/scriptevent geoui:tour: 全部の演出を約 24 秒、早送りは何 tick にも分ける）・式の screen.dx。ドット絵版は物ごとにキューブで組んだ模型
（コインの円と浮き出た番号・フープ・輪切りの球・車輪・宝石・影つきの字・枠。osukit.js pixelModels / modelBone）、どの 2 枚の面も同じ
平面に重ねない（compile.js freePlace）。見本 geoui_osu_pixel・geoui_osu_skin は本物の BDS の tests.txt が 31/31（両方）。
app: `app ci --batch a,b`（端末・ゲーム・サインイン 1 回で、アドオンごとに BDS を替えて入り直す。手順 addon <名前>）、classic の
タイトルではまず A を 1 回（APP_TITLE_A_FIRST。当たるかは要実測）。10 回目（PLAN.md）: バッチ 1 本（run 39966429198）で両方の見本が
122 手順すべて通り 415 秒。ただしスピナーから後の写真は HUD が無かった（写すのがツアーより遅れたと見ている）→ 一歩ずつの検証ツアー
（/scriptevent geoui:tour step・tour next: どの場面も最後の瞬間で止まって待つ）を作り、app.txt はそれで写す。summary.json に joins・
batch・測った値の at（写した時刻）。次はこの形でバッチをもう 1 本（許可をもらってから）。

守ること:
- .github/・auto/policy.json・auto/STOP・.env は触らない。bds/vendor/bedrock-server.zip はコミットしない（git add -A -- . ':!bds/vendor/bedrock-server.zip'）
- 今ある試験は変えない・緩めない（設計を変えた所だけ、同じかより強い確かめに直してよい）
- 画面の文は日本語、コードのコメントは英語。timeline の各ファイルは IIFE の形（T.<part> = {…}; module.exports）。tests/tl-*-offline.mjs は Node の標準だけ
- コミットのメッセージは日本語で、最後に次の 2 行:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <そのセッションの URL>
- 本物のアプリでの確かめ（app.yml の dispatch）は、私に聞いて許可をもらってから。勝手に回さない
- 本物のゲームでしか分からないことは「要実測」と書き、決めつけない

最初にやること:
- PLAN.md の「本物のアプリで確かめたこと」の 8 回目まで読む。本物のアプリでまた確かめる時は、私の許可をもらってから 1 本ずつ:
  gh api -X POST repos/noknoh12345-afk/bds-lab/actions/workflows/app.yml/dispatches -f ref=main -f "inputs[addon]=<名前>" -f "inputs[mode]=run" -f "inputs[account]=true" -f "inputs[screen]=720x1560" -f "inputs[lane]=<lane>" -f "inputs[knobs]=APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"
  （1000 個の見本も既定の枝にある: demo.mjs が 3 つとも作り、--check で確かめる。--huge はそれだけを作る）
  いくつかを 1 回で: node lab.mjs app ci --batch geoui_osu_pixel,geoui_osu_skin --lane <lane> --screen 720x1560 --knobs "APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"
  （summary の batch に各アドオンの BDS の起動し直しの秒、区切りは <アドオン>.<区切り>）
- 結果: gh run download <run> → probe は node bds/geoui/timeline/probe.mjs read <summary.json>、見本は summary.json の measures・
  failed_codes・failed_trails・join_trail・join_seconds・join_connect_seconds・join_lan_seconds（PLAY が出た・LAN のワールドが出た・
  押した秒）・join_lan_trail（参加の道筋はラボの語だけ: app/lib/failcodes.mjs）。
  写真と録画は私の Discord に届く（summary.json の media に送った数）。成果物の中身は封じてある（鍵が無いと読めない）

全部の試験（変えたら毎回）:
  for f in tests/tl-*-offline.mjs tests/geoui-builder-offline.mjs tests/lint-offline.mjs; do node $f || exit 1; done（tl-probe は 8 分）
  node bds/geoui/build.mjs --check; node bds/geoui/timeline/probe.mjs --check; node bds/geoui/timeline/demo.mjs --check（W 行が出ないこと）
  node bds/geoui/osu/music.mjs --check（osusong.js を変えたら --write。.ogg は ffmpeg）
  npx --yes eslint@9 -c tests/eslint.config.mjs .（CI の verify も回す: 使っていない変数ひとつで落ちる。2026-10-23 の cbfa6a6 はこれで落ちた）
  app を変えたら: node tests/app-offline.mjs、node tests/results-public-offline.mjs、node tests/feed-offline.mjs
  ブラウザの環境で: node bds/geoui/blockbench-check.mjs、for f in bds/geoui/timeline/check-*.mjs; do node $f || exit 1; done
  本物の BDS で（cd bds; node lab.mjs setup が要る）: node lab.mjs test -a geoui_rhythm、node lab.mjs test -a geoui_rhythm_big、
  node lab.mjs test -a geoui_osu_pixel、node lab.mjs test -a geoui_osu_skin
  （BDS を落とせない環境では、push した後の CI の verify の bds ジョブが同じ物を回す）

ブラウザの環境（前のセッションの物は残っていないので作り直す）:
- BLOCKBENCH_DIR: git clone --depth 1 --branch v5.2.2 https://github.com/JannisX11/blockbench → npm ci --ignore-scripts → npm run build-web
- GEOUI_NODE_MODULES: playwright-core のある node_modules（例 /opt/npm-tools/node_modules）
- CHROMIUM: 例 /opt/pw-browsers/chromium-1194/chrome-linux/chrome

残っている要実測: 参加の待ちはパックの大きさではない（9 回目: 219 KB で 356 秒、3.2 MB で 332 秒で接続）。長いのはラボのタイトル →
PLAY（194・269 秒）: classic のタイトルで Play の焦点（緑）が見つからず、新しい人のタイトルと見て DOWN・DOWN・A でストアへ行き、起動し
直していた理由（app/DESIGN.md「参加の内訳」。写真は Discord）。7 回目の 1000 個で、押した後にゲームが「An error has occurred」を出した理由
（6 回目の 1000 個は OCR が間に合わなかったため: app/DESIGN.md）。geoui_probe_m の 3000 行（1 行 150 文字）の最後の変数だけ合わなかった理由
（行・大きさ・変数の数のどれでもない）。render controller 70 個・ボーン 600 本・アニメーション 1200 個より先（書き出しは超えると注意を
出す）。geoui_bb・geoui_calib* は前の確かめの物（測り直すときだけ作り直す）。
osu! の要実測（本物のアプリで geoui_osu_pixel・geoui_osu_skin を回すと分かる。回すのは許可をもらってから）: キューブの数（pixel は
キューブ 6597 個・ボーン 315 本・アトラス 1024 x 1024）の描画と重さ、傾きで見える模型の横の面、rotationX・rotationY の符号（盤面が倒れる
向き）、頭の向きでの狙い（aim。スマホのカメラ操作・sens）、ジャンプ・スニークで押すと体が動く・しゃがむこと（/inputpermission で止めるか）、
プラグインが作るラボの曲（.wav）が鳴るか（見本のパックは .ogg）、classic のタイトルのまず A（道筋の title-a の次が play-… なら当たり）。
古い枝 addon/geoui_rhythm_huge・panel-artifact-viewer は消してよいと言われた（このセッションの中継からは消せないので、GitHub の画面で）。
```
