# 引き継ぎ: Spectral Player を「元の MP3 と聴き分けられない」まで追い込む（2026-10-31 時点）

依頼の原文は ORIGINAL_BRIEF.txt（引き継ぎ zip の中）。要点: 判定は**実クライアントの録音だけ**。天井 = 元曲 → OGG を同じ
クライアント/録音系で鳴らしたもの。ViSQOL v3 audio 48 kHz で各曲が天井から 0.3 MOS 以内、中央値も報告。補助指標
（多解像度 STFT・1/3 oct 誤差・オンセット ms）。最後はブラウザの ABX。10 曲以上、自作/CC0/CC-BY のみ。
守ること: 改造なしのクライアントで再生／@minecraft/server 安定版優先／RP は曲非依存・50 MB 以内／曲データ ≤128 kbps／
1 リスナーあたりの命令数と通信量を実測、軽量モードを残す／QA の性能基準を下げない・試験を弱めない／.github・auto/policy.json・
auto/STOP・.env に触れない／既存機能を壊さない／**実測と推測をはっきり分ける**。

## 場所
- リポジトリ noknoh12345-afk/bds-lab、ブランチ **addon/spectral**（main から分岐、push 済み）。ユニット bds/addons/spectral
- ユニット外の変更: app/lib/audiorec.mjs・app/lib/scenario.mjs（`audio` 動詞）、app/lib/android.mjs（startPad: uinput が Android に
  見えないとき）、app/app.mjs（launch: monkey が起動しないとき am start、server.do が命令の配列を受ける）
- 実測の数: measured/（redroid-<run>.json は tools/rig/collect.py、summary.json は tools/rig/summary.py）。表: SPEC.md

## 実機で測るしくみ（redroid.yml, addon spectral, mode run → app.txt）
- 端末: redroid の Android 14 に Play が入れた Minecraft 1.26.60.4。BDS はランナー上の 1.26.60.6。1 回 25–40 分（app run の上限 40 分）
- app.txt の流れ: `audio info` → `stop` → `audio volume 0`（メディア 15/15・audio_main 1・BGM 0）→ `launch` → `until title` →
  `audio song <曲>`（join の前に変換してコンソールから送る）→ `join` → `do execute as @a run spectral:play <曲>`（チャットは使わない:
  1 回目に打ち込みが効かず無音だった）→ `audio start/stop` → `audio analyze <録音> song:<曲>`（`[spectral rig]` 行）→ `audio export`
- 天井: `audio ceiling spectral_ceil <曲,…>`（join の前）→ `addon spectral_ceil` → `join` → `do scriptevent spectral:ceiling <曲>`
- 較正: `do spectral:calib all` → `until server spectral calib\] end throughput` → `audio analyze calib all`
- 録音の受け取り: `audio export <録音> [kbps]` が Opus にして **tools/rig/rec_public.pem** で暗号化しログへ（`[spectral rec]`）。
  `gh api repos/<owner>/<repo>/actions/jobs/<job>/logs > job.log` → `node tools/rig/rec_decode.mjs job.log <秘密鍵> <出力先>`。
  **秘密鍵はこのセッションの中にしか無い**: 次のセッションは鍵を作り直し、公開鍵を rec_public.pem に入れ替えてから使う
  （`openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out k.pem; openssl pkey -in k.pem -pubout -out tools/rig/rec_public.pem`）
- 集計: `python3 tools/rig/collect.py job.log --run <id>` → `python3 tools/rig/summary.py --md`
- 実録音の ABX: `python3 tools/abx/make_abx_real.py --rec <復号した .opus> --runs <id,…> --b n --refs c,g,l,emu`

## 実測（すべて実機の録音から。SPEC.md に表）
- 同時発音数 **32**（静かなもの・古いものから消える）。fade は振幅で直線・指定どおり（最短 0.8 ms）。ワンショットは同じ tick の
  命令より **49.1 ms 遅い**（σ 7.3）。seekTo は一定のずれ（σ 6 ms: 位相合わせは無理）。setPitch は 0.12 セント以内、歪みは出る周波数
  だけで決まる（録る経路の 44.1→48 kHz の補間）。ステレオ 67 dB。ミキサーは素材の 5 倍の和まで平ら。ゲームは素材より約 30 dB 小さく鳴る
- 天井（13 曲）の ViSQOL 中央値 3.09。録る経路は元と 1/3 oct で 1–3 dB・時間のずれ 0。ただしピアノ（1.76）など静かな曲は
  −30 dB × 16 bit の量子化で天井そのものが低い
- ViSQOL の中央値（13 曲、天井 3.09）: 48 声（前の既定）1.99・電話の既定 24 声 1.99・**出荷（24 声＋打撃音を先に）2.05**・軽量 2.15。
  天井との差の中央値 1.03 / 1.00 / 0.92 / 0.92、0.3 以内はどれも 2/13（ジムノペディと Name of Love）。立ち上がりの合致率の中央値
  0.49 / 0.47 / 0.52 / 0.26（天井 0.90）。同じ設定の 2 回の差は同じ run で 0.05–0.11、run をまたぐと 0–0.17（24 声のロックは 0.58）。
  表は SPEC.md、元は measured/summary.json
- 実録音の ABX ページ（private）: https://claude.ai/artifact/WqeA3C2ut45LtzVhhjxpqG（B = 出荷版、参考に天井・48 声・24 声・軽量・エミュ）
- 通信量（ローカルの本物の BDS + プロトコルクライアント）: quality +10.4 KB/s・12.3 B/命令、light +6.9 KB/s・17.0 B/命令。
  命令/tick（ローカルの BDS の status）: 48 声 43.2・電話 24 声 27.9・軽量 20.3

## 変えたこと（実測から）
- 電話（clientSystemInfo.platformType が Mobile）の既定を 24 声（CLIENT_SOUNDS、src/main.ts）。tests.txt に電話の節
- 打撃音を 1 tick 先に送る（burstTo）。エミュレーターに oneshot_latency_ms
- 出荷する RP から曲の天井（ceiling_demo.ogg）を外した（RP は曲非依存）
- tools/emu/spec.json は実測で 15 項目中 11（残りは output_sr・frame_ms・block・vol_ramp_ms・limiter_db）
- tools/rig/analyze.py: 同期クリックの格子合わせ（最初の 1 発が遅れても）、timing の窓（cross_time）

## 届いていないこと（完了の条件）
- 天井との差 0.3 以内: 13 曲中 2 曲（48 声）。ABX は耳で未実施（実録音の ABX ページは作った）
- エミュレーターと実録音の ViSQOL は 1.4–2.7（基準 4.5）: 録る経路の雑音（量子化・補間）と同時発音数を超えた声の出入りが模型に無い

## 次にやること（順に）
1. ABX を耳で（上のページ）。区別できる箇所を書き留める（依頼の完了の条件）
2. 変換器の帯域の偏りを直す（measured/converter-band-bias-emulated.json: 曲により 1–3 kHz が +5〜+17 dB、最低域 −11〜−17 dB）。
   py と js のバイト一致を保つ（tools/parity.py）
3. 録る経路の雑音を下げる: ゲームの音をもっと大きく録る手（素材の音量を上げる・録音を float にする等）を探し、天井を上げる
4. 32 本の配分を最適化（声・ノイズ帯域・打撃音の取り合い）。エミュレーターに声の出入り（消えた声が戻るときの不連続）を入れる
5. 未着手（実測した理由付き）: seekTo の位相合わせ（σ 6 ms ≫ 周期）、音域別の元素材（歪みは録る経路）、24 Bark のノイズ（32 本に
  入らない）、ステレオ化（左右で本数が倍）、原子バンク（ワンショットは σ 7 ms・1 tick 遅れ）、PyTorch の微分可能エミュレーター

## 落とし穴
- redroid: uinput のコントローラーは Android から見えない → シェルの長押し（自動）。scenario の launch（monkey）は起動しない → am start（自動）
- redroid と app.yml は同じ Google アカウント: app.yml が走っている間に流すと Play のダウンロードが「Pending…」のまま 20 分で落ちる。
  Play のページが「¥1,300（buy）」で落ちることもある（一時的。流し直しで通った）
- 同じブランチで redroid を流すと走っている run は取り消される（concurrency）
- メディアの音量は録音に効かない。ゲームの audio_main は効く。options.txt は root の sed -i でなく cat > で（持ち主を変えない）
- 録音の Opus（`audio export`）は高い純音を正しく残さない: 較正の数は実行の中の WAV（`[spectral rig]` 行）を使う
- 実行の最初のワンショット（クリック）は素材の読み込みで ~100 ms 遅れる
- `pkill -f`/`pgrep -f` のパターンが自分のシェルに当たって落ちる（exit 144）→ パターンを自分のコマンドに含めない
- `node lab.mjs check` が bds/vendor/bds-version.txt を書き換えることがある → コミット前に `git checkout -- bds/vendor/bds-version.txt`
- bds/vendor/bedrock-server.zip と corpus/{cache,audio,renders} は**コミットしない**（.gitignore が zip を追跡に戻しているので、
  zip はリポジトリの外に置いて LAB_BDS_ZIP で指す）
- ffmpeg/libvorbis はループ OGG の先頭 128 サンプルを落とす → chirp は CHIRP_ROLL で回転（make_rp_assets.py が既存ファイルから検出）
- 測定スクリプトの出力は lab が 100 行で切る → `LAB_MAX=10000000`
