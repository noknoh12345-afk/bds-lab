# 引き継ぎ: Spectral Player を「元の MP3 と聴き分けられない」まで追い込む（2026-10-30 時点）

依頼の原文は ORIGINAL_BRIEF.txt（引き継ぎ zip の中）。要点: 判定は**実クライアントの録音だけ**。天井 = 元曲 → OGG を同じ
クライアント/録音系で鳴らしたもの。ViSQOL v3 audio 48 kHz で各曲が天井から 0.3 MOS 以内、中央値も報告。補助指標
（多解像度 STFT・1/3 oct 誤差・オンセット ms）。最後はブラウザの ABX。10 曲以上（ピアノ・歌・ドラム・ロック・EDM・
オーケストラ・話し声）、自作/CC0/CC-BY のみ、商用曲はリポジトリに入れない。
守ること: 改造なしのクライアントで再生（scripteval 等は測定だけ）／@minecraft/server 安定版優先／RP は曲非依存・50 MB 以内
／曲データ ≤128 kbps／1 リスナーあたりの命令数と通信量を実測して上限、軽量モードを残す／QA の性能基準を下げない・試験を
弱めない／.github・auto/policy.json・auto/STOP・.env に触れない／既存機能（速度・移調・EQ・凍結・逆再生・3D スピーカー・
曲パック・リモコン）を壊さない／**実測と推測をはっきり分ける**。

## 場所
- リポジトリ noknoh12345-afk/bds-lab、ブランチ **addon/spectral**（main から分岐。e5e99aa = 本体の作業、その上に WIP 1 コミット）
- ユニット bds/addons/spectral。ユニット外の変更は app/lib/audiorec.mjs と app/lib/scenario.mjs（app シナリオの `audio` 動詞）だけ
- 公開済み ABX ページ（private artifact）: https://claude.ai/artifact/DAHBSk7RU1EdFRpJ6jiyxH（中身は zip の abx/）

## できていること（数字の出どころを必ず併記）
- 変換器 v2（部分音追跡・声への割り当て・SMS 残差・帯域ごとの NSIM-lite 選択）: tools/spectral.py と web/core.js が
  **バイト一致**（tools/parity.py: v2 13/13, v1 13/13）。曲形式 v1 のまま。データ 10–21.5 kbps（≤128 kbps）
- ViSQOL v3 の numpy 移植 tools/metrics/visqol.py: 公式 conformance と 1e-13 で一致（`python3 tools/metrics/visqol.py --conformance`）
  。モデルは公式 libsvm（Apache-2.0）
- 試験曲 13 曲 corpus/manifest.json + lock.json（CC0/CC-BY のみ、出典とライセンス記録済み、音声は gitignore、
  `python3 tools/corpus.py` で再取得）
- 測定リグ: 較正プログラム（src/calib_programs.ts ← tools/rig/programs.py、`/spectral:calib all|<name>|list`）、
  解析 tools/rig/analyze.py（声数・フェード形・着地タイミング/ジッタ・seekTo 精度・setPitch 極端・ステレオ・ミキサー・
  スループット → tools/emu/spec.json）、tests/test_rig.py（隠した合成クライアントの値を復元できるか: 全部通過）、
  曲の採点 tools/rig/score_song.py、app シナリオ app.txt（redroid で録音 → 解析 → `[spectral rig]` 行をログに出す）
- 較正できるクライアント・エミュレーター tools/emu/client.py（**全パラメータは「仮定」**: 実機の測定値がまだ無い）
- 軽量モード `/spectral:mode light|quality`: 16 声・1 リスナーあたり ≤24 命令/tick（知覚優先度でレート制御）
- `node lab.mjs go`（Actions unit run 41042008040、コミット e5e99aa）: **DONE dist/Spectral_Player.mcaddon（test 96/96, qa clean）**

### エミュレーター上の成績（**推測**: 仮定のクライアントで鳴らした値。実機録音ではない）
| | ViSQOL 中央値 | 平均 |
|---|---|---|
| 天井（元曲→OGG q8） | 4.712 | |
| v2（出荷中） | 3.284 | 3.235 |
| v1 | 3.167 | 3.142 |
| light（下の WIP 前） | 3.155 | 3.096 |
天井 0.3 以内の曲は 0/13。命令数/tick 平均 v2 41–78、light 19–30（WIP で ≤24 に）。曲ごとの値は zip の abx/scores.json。
分かったこと: v1 は声を増やすほど ViSQOL が下がる（断片化）／ViSQOL は音の調性にほぼ盲目（ノイズボコーダで 3.6–4.2）／
ノイズ層は密な曲で効き、ソロピアノ・ドラムでは逆効果／1760 Hz ループの線形補間リサンプルがピアノで約 1 MOS 損
（4.356 理想 → 3.309 線形）。実機のリサンプラが線形なら、声ごとに音域別の元素材（osc110/osc440/osc1760）が次の一手。

### 実測（ローカルの本物の BDS + lab の本物のプロトコルクライアント A、tools/rig/traffic.mjs、1 回分）
- 待機（A 接続・無再生）loopback 66.5 KB/s（ばらつき未測定）
- quality: 41.8 命令/tick（20.3 TPS）→ +10.3 KB/s ≈ **12 B/命令**
- light: 20.1 命令/tick・peak 24 → +6.9 KB/s ≈ **17 B/命令**（バッチが小さいほど圧縮が効かない）
- スペクトル表示（アクションバー）: +3.1 KB/s
- クライアント側の受信数: 5.1 s で ClientboundUpdateSoundData 3256 個 ≈ サーバー側の呼び出し数（≈3040）→ **1 呼び出し = 1 パケット**
- 注意: lab の common/realplayer.cjs の ClientboundUpdateSoundData デコードはこの BDS で値が化ける（数は正しい）

## WIP コミット（addon/spectral の先頭、**go 未実施**）
- 軽量モードの予算にノイズ帯域の fade も入れた（src/main.ts の send/noise/apply/flush）。以前は light の最大が 32/tick
  だった（ノイズが予算外）→ モックで rock_big / edm_detection とも max 24 を確認
- tests.txt の軽量モード節に `peak ≤24` の期待を追加（試験を強めた）
- tools/rig/traffic.mjs（上の通信量測定）

## 止まっていること・失敗
1. **redroid の実機録音は未達**: run 41042894189（redroid.yml, addon spectral, mode run）は app.txt 14 行目で失敗 —
   タイトル画面から PLAY の LAN ワールドへ進めない（「PLAY の画面に着きません（アプリを起動し直した: 2 回）」、画面の文字
   “> Go 8”）。録音・解析まで行っていない。ログは zip の logs/redroid_41042894189.log。lab の app ドライバ側の問題の可能性:
   他の app run（geoui_web など）が今タイトルを越えられているか先に確認
2. 通信量の繰り返し測定（REPS=3、待機のばらつき込み）は途中で止めた
3. light の再レンダー（tools/abx/make_abx.py、ノイズ込み予算での light）は途中（ログ zip の logs/abx_light.log）
4. 録音ファイルは redroid run から出てこない（out/ は report.md・run.txt・shots だけ、公開リポジトリは封印）。数字は
   ジョブログの `[spectral rig]` 行で取る設計。録音そのものが欲しければ .github の変更が要る → **人が自分で**

## 次にやること（順に）
1. ブランチを取る: `git fetch origin addon/spectral && git checkout addon/spectral`（push できない時は zip の
   patches/*.patch を `git am`）。ユニットで `node lab.mjs check` → `node lab.mjs go`（ローカルで BDS が動く:
   bds/vendor/bedrock-server.zip があれば。無ければ Actions の unit.yml job go）。WIP の go を通す
2. redroid の失敗を直す: run 41042894189 の shots/02-fail-line14.png を見る（成果物は封印、panel で開く）→ app ドライバの
   タイトル遷移か app.txt の前半を直し、redroid.yml を addon spectral / mode run で再実行（app.yml が走っている間は待つ）。
   ジョブログの `[spectral rig] calib all: {...}` と `[spectral rig] demo song:demo ...` を拾う
3. 実測値で tools/emu/spec.json を作る（analyze.py --spec 相当）→ エミュレーターを較正（ViSQOL ≥4.5 で実録音と一致か確認）
4. 実機のリサンプラ次第で音域別の元素材（py と js をバイト一致のまま、エンジン、RP、エミュレーター）→ parity と eval
5. SPEC.md（声数と奪い方・フェード形と最小・setPitch/setVolume の着地と tick ジッタ・seekTo 精度・setPitch 極端の歪み →
   最適な元周波数/サンプルレート・is3D false のステレオ・ミキサー（クリップ/リミッタ/カテゴリ ui/record/music）・
   1 命令の通信量と tick あたり命令数）を**実測/仮定の列を分けて**書く
6. 手法ごとの寄与表（指標の変化・命令数・データ量・CPU・天井との差）、ABX ページを実録音で作り直し、TASK.md 更新、push
7. 未着手（理由付きで報告する）: PyTorch 微分可能エミュレーターと analysis-by-synthesis 最適化、atom bank、ステレオ、
   ビブラート/グライドのループ、seekTo の位相合わせ、24 Bark ノイズの細かい包絡、階層符号化

## 落とし穴（このセッションで踏んだもの）
- `pkill -f`/`pgrep -f` のパターンが自分のシェルに当たって落ちる（exit 144）→ パターンを自分のコマンドに含めない
- `node lab.mjs check` が bds/vendor/bds-version.txt を書き換えることがある → コミット前に `git checkout -- bds/vendor/bds-version.txt`
- bds/vendor/bedrock-server.zip（98 MB）と corpus/{cache,audio,renders} のシンボリックリンクは**コミットしない**（git add はパスを指定）
- ffmpeg/libvorbis はループ OGG の先頭 128 サンプルを落とす → chirp は CHIRP_ROLL で回転（make_rp_assets.py が既存ファイルから検出）
- corpus の取得は curl（urllib は UA で 403）、freesound は時々 403 → 再試行。VBR は実デコード長で
- エミュレーターは声数上限で「音量が大きい方を残す・同点は古い方」、gain_curve は状態機械（ちらつき対策済み）
- 測定スクリプトの出力は lab が 100 行で切る → `LAB_MAX=10000000`
- `node lab.mjs up` → `node lab.mjs do "<cmd>"...` で生きたサーバーに命令（`js system.currentTick` で TPS）。終わったら `down`
- AGENTS.md の fanout 規則: 既定は /fanout（子は worktree、共有ファイルは司令塔だけ）。1 人で済む小さな直しは司令塔が自分で
