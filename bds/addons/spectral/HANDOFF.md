# 引き継ぎ: Spectral Player（2026-10-31 12:20 JST、2 回目のセッションの終わり）

依頼の原文は ORIGINAL_HANDOFF_PROMPT.md（引き継ぎ zip の中）。要点: 判定は**実クライアントの録音だけ**。天井 = 元曲 → OGG を同じ
クライアント/録音系で鳴らしたもの。ViSQOL v3 audio 48 kHz で各曲が天井から 0.3 MOS 以内、中央値も報告。補助指標
（多解像度 STFT・1/3 oct 誤差・オンセット ms）。最後はブラウザの ABX。10 曲以上、自作/CC0/CC-BY のみ。
守ること: 改造なしのクライアントで再生／@minecraft/server 安定版優先／RP は曲非依存・50 MB 以内／曲データ ≤128 kbps／
1 リスナーあたりの命令数と通信量を実測、軽量モードを残す／QA の性能基準を下げない・試験を弱めない／.github・auto/policy.json・
auto/STOP・.env に触れない／既存機能を壊さない／**実測と推測をはっきり分ける**／push は addon/spectral にだけ（main への push・PR はしない）／
Actions は unit.yml（job go）と redroid.yml（addon spectral, mode run）を使ってよい。redroid は app.yml が走っている間は待つ。
AI キーを使うワークフロー・実行の取り消しは先に聞く。進捗は節目ごとに日本語で短く報告する。

## ユーザーの最後の依頼（未着手。原文、2026-10-31 12:19）

> 録音したやつをdiscordにあげるのにも対応して。おとbdslabのwebなんだけどあれwebで見るのに必要な鍵とか全部消してアカウントログインしてたら
> そのアカウント使って見えるようにして
> なおかつさらに改善して完成させて
> そしてwebのゲーム音声と連動させたもので完全なるmp3を再現して
> だけどやっぱり中断して他のAIに任せることにした。これまでの進捗を全て含めて次に完全に続きとして取り組めるようにzip用意して

この前の依頼: 「さらに極限まで（元の MP3 と聴き分けられない所まで）近づける工夫をして、これ以上できないレベルまでにして」「pushしてもいいよ」
「さらにさらにさらに改善して」「このまま完成させてなおかつ更にできることし尽くして」「とりあえずhtmlを使ってじぶんの好きな曲取り込んで
どんなものか聞きたい」「かんぜんにgameと同じ音声にして欲しい」（最後の 2 つは済み: 下の「変換ページ」）。

### 4 つの依頼の読み方と、手を付ける前に確かめること
1. **録音を Discord にも**: 今の録音は `audio export`（app/lib/audiorec.mjs）が Opus にして tools/rig/rec_public.pem で暗号化し、
   ジョブのログに `[spectral rec]` 行で出す。bds-lab には「run files to Discord」（AGENTS.md）があるので、その仕組みに録音（Opus）を
   載せるのが近道。Discord の送り先（webhook の secret 名）と、送る範囲（全部の録音か、要約と数曲か）をユーザーに確かめる。
   **.github は触れない約束**なので、ワークフローを変える必要が出たら先に聞く
2. **bds-lab の web（管理パネル）で鍵なしに**: 今は録音が RSA で暗号化されていて、開くには秘密鍵（このセッションの中だけ）が要る。
   パネルは「サインインしたその人の GitHub トークンで artifact を開く」仕組み（sign-in service の GET /artifact、ui/viewer.mjs）を
   持っているので、録音を暗号化せず Actions の成果物（そのリポジトリを読める人だけ）に置き、パネルがログイン中のアカウントで
   開いて再生する形にすれば鍵が要らない。成果物に載せるには redroid.yml の手順が要るかもしれない（.github: 先に聞く）。
   パネルを変えたら `node lab.mjs panel check`、AGENTS.md の panel の約束（i18n 5 言語・OreUI の見た目など）を守る
3. **さらに改善して完成**: 完了の条件（全曲で天井から 0.3 以内・ABX）はまだ。下の「次にやること」
4. **web のゲーム音声と連動させて完全な mp3 を再現**: 変換ページはもう「アドオン本体のコード＋実機の模型」でゲームの音を出せる。
   これを**変換の中に入れる**（合成による分析: 曲データを、模型を通した音が元の MP3 に一番近くなるように直す。tick ごとの振幅・
   ノイズ帯域・フェードの長さを、模型の出力と元の 10 ms 包絡の差で詰める）のが「連動」の素直な読み。py（tools/spectral.py）と
   js（web/core.js）のバイト一致（tools/parity.py）を保つか、ページ側だけの「仕上げ」にするかを決める

## いまの状態

- リポジトリ noknoh12345-afk/bds-lab、ブランチ **addon/spectral**（push 済み）。ユニット bds/addons/spectral。
  `node lab.mjs go`（ローカルの BDS 1.26.61.1）: **DONE dist/Spectral_Player.mcaddon（test 134/134, qa clean）**
- **最終の既定（電話 = platformType Mobile）**: 変換器 residual voiced ＋ tick ごとに合わせたフェード（曲データの**形式 2**: 声とノイズ帯域の
  フェードの長さ 5/12/25/50 ms の 2 bit 符号を曲データの後ろに、meta.fd に長さ）、24 声＋ノイズ 8（同時 32 音）、打撃音なし、
  どの音もファイルより **+6 dB**（setVolume）、3 セント・0.75 dB 未満の変化は送らない。PC など測っていない端末は 48 声・打撃音 1 tick 先・レベル 0
- **実機（7 回目 run 41158185476、同じ run、13 曲）**: 出荷版 1.95 → **最終の既定 2.77**（曲ごとの差の中央値 +0.36、11/13 で上、
  ファンクだけ −0.34）。天井（音量 1）との差の中央値 0.55、**0.3 以内 4/13**（ジムノペディ・ショパン・Name of Love・夏目漱石）。
  +10 dB（5 曲）は 5 曲とも +6 より上（+0.21）・3/5 が 0.3 以内。出荷版は 5 回目と 7 回目でほぼ同じ（差の中央値 +0.007）。表: SPEC.md
- **エミュレーター（推測）**: 10 曲の中央値 0 dB 2.59 → +6 dB 2.94 → +8 2.98 → +10 3.00（クリップ 1.7）。+8/+10 はクリップの歪みが
  話し声で −29/−21 dB、ピアノ −37/−26 dB（+6 は全曲 −44 dB 未満）→ 既定は +6、/spectral:level で 0–18 dB
- **変換ページ（claude.ai の Spectral Converter、private、https://claude.ai/artifact/HeSBjPd8CGqQPsSzyTgcVJ）**: web/converter.html を
  web/build.py で組んだもの（web/dist/index.html、3.8 MB）。ブラウザの中で MP3 を変換（web/core.js、py とバイト一致）、「ゲーム内の音」は
  web/game.js のワーカー: web/build_engine.mjs が bp/scripts/main.js を tools/sim/mock-server.js と束ねた本体を動かして命令を出し
  （デモ 26.7 回/tick、本物の BDS で 26.9）、tools/emu の模型（RP の本物の音・24 kHz・32 音・2.0 クリップ・−32.5 dB・16 bit・×2）で音にする。
  揺れ（jitter）を 0 にすると Python の模型と相関 1.0。「聞く端末」電話（測った）/ PC（仮定）。曲パックと本体の保存は downloads の能力
- ABX のページ（実録音）: 前のセッションのもの（WqeA3C2ut45LtzVhhjxpqG）はこのアカウントから開けない。tools/abx/make_abx_real.py は
  今の録音（s_ / w_ / u_）で動く（--b w --refs c,s,u,emu、--runs 41068618513,41076646541,41142205810,41158185476）。まだ公開していない

## このセッションでしたこと（順に）
1. 5 回目（run 41142205810）: 改良版（residual voiced・打撃音なし）を同じ run で出荷版と比べ 1.95 → 2.29（11/13）→ 既定に
2. 6 回目（run 41147544874）: calib loud（**setVolume は 2 まで指定どおり、その上はファイル単位約 2.0 で硬くクリップ**）。曲は
   meta にフェードの符号を入れたせいで最初の script event に入らず落ちた → 形式 2
3. 形式 2（エンジン src/main.ts decodeJob、tools/spectral.py song_tail、web/core.js）、フェードを変換器の既定に、電話の既定レベル +6 dB、
   小さな変化を送らない、tests.txt に tinyfade・phone の level・level の節
4. エミュレーター: レベルとクリップ（tools/exp/exp.py path24 の clip / pre_db）、リミッター（下がる: 外した）、曲ごとのレベル（見積もりが
   1 dB ずれる: 外した）、10 帯域のノイズ lo10f（+0.022: 次の候補）。tools/exp/README.md と results/next.jsonl
5. 7 回目（run 41158185476）: 出荷版 vs 最終の既定 vs +10 dB（上の数）。app run は **40 分で止まる**（49 本の予定のうち 33 本）
6. 変換ページを今のアドオンに: 形式 2 のフェードで試聴 → 本体のコード＋実機の模型でゲームと同じ音に

## 次にやること（順に）
1. 上の 4 つの依頼（Discord・パネルの鍵・改善・連動した再現）。どれもユーザーに 1 回だけ確かめてから
2. 8 回目の実機: 7 回目で録れなかった腕 — 最終の既定をレベル 0 で（+6 dB の分）・天井を音量 2 で（同じ大きさの天井）・+10 dB の残り
   （demo）。**app run は 40 分**: 準備に約 7–14 分、録音 1 本 約 42 秒 → 1 回に 30–34 本まで（tools/exp/make_app.py の腕を減らす）
3. レベルを耳で決める（+6 / +8 / +10、変換ページの PC/電話と、実録音の ABX で）。ViSQOL は +10 の方が上（実測 5 曲）
4. ノイズの 10 帯域（lo10f: 推測 +0.022・7/10）: 8 帯域の曲も鳴るよう RP に 2 組目のループ、変換器の既定（py と js）、tests の数
5. ファンク（打撃音があった方がよい曲）: 曲ごとに打撃音を残すか（変換器が NSIM で選ぶ等）
6. 実録音の ABX ページを公開（tools/abx/make_abx_real.py → Artifact。音声ファイルを files で）
7. デスクトップ・コンソールの実機を測る（同時発音数・混ぜる周波数・クリップ）。PC の既定は測っていない

## 実機で測るしくみ（redroid.yml, addon spectral, mode run → app.txt）
- 端末: redroid の Android 14 に Play が入れた Minecraft 1.26.60.4。BDS はランナー上の 1.26.60.6。ジョブの上限 75 分、**app run の上限 40 分**
- app.txt は tools/exp/make_app.py で作る（`python3 tools/exp/make_app.py tools/exp/app7.json app.txt`）。腕（arm）ごとに
  前置き（録音の名前の頭: tools/rig/collect.py の WAYS）・曲 id の後ろに付ける字・変換器の設定・前に打つ命令・曲を書く
- 曲は `audio song <曲,…> [suffix=_x] [設定=値 …]`（join の前に変換してコンソールから送る。true/false は songpack.py が真偽に直す）
- 天井: `audio ceiling spectral_ceil <曲,…>` → `addon spectral_ceil` → `join` → `do scriptevent spectral:ceiling <曲> [音量] [d4]`
  （音量が 1 を超えると setVolume でも同じ値に: アドオンと同じ道）
- 録音の受け取り: `audio export <録音> [kbps]` が Opus にして **tools/rig/rec_public.pem** で暗号化しログへ（`[spectral rec]`）。
  `gh api repos/<owner>/<repo>/actions/jobs/<job>/logs > job.log` → `node tools/rig/rec_decode.mjs job.log <秘密鍵> <出力先>`。
  **秘密鍵はこのセッションの中にしか無い（zip にも入れていない）**: 次のセッションは鍵を作り直し、公開鍵を rec_public.pem に入れ替えて
  から使う（`openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out k.pem; openssl pkey -in k.pem -pubout -out tools/rig/rec_public.pem`）。
  run 1–7 の復号済みの録音は引き継ぎ zip の recordings/
- 集計: `python3 tools/rig/collect.py job.log --run <id>` → `python3 tools/rig/summary.py --md`、`python3 tools/rig/final_table.py --run <id> --md`

## 実機と経路の模型（tools/emu/client.py ＋ tools/exp/exp.py の path24 ＋ web/game.js）
- ゲームは各音を 24 kHz で直線補間で読んで混ぜ（折り返し止めなし）、素材より −32.5 dB・16 bit、2 倍の直線補間で 48 kHz に
- 同時発音数 32（エネルギーの小さいものから消える）。fade は振幅で直線・指定どおり（最短 0.8 ms）。tick の着地は σ 7.3 ms
- **setVolume は 2 まで指定どおり、その上はミックスがファイル単位で約 2.0 で硬くクリップ**（0.91 の正弦波の基本波の縮みが 4 で −3.54・
  8 で −9.19 dB、2.0 の硬いクリップの模型は −3.59・−9.25。16 本の和の mixer calib は 1.6–1.8 で合う）。measured/calib-41147544874-loud.json
- エミュレーターは実録音を相関 0.87–0.97 で当て、打撃音なしの版では実機より 0.0–0.38 高い（平均 0.17）。tools/exp の数は**推測**
- 天井を下げているのは静かな曲では 16 bit の量子化（経路で 12 dB 大きく通すと天井の中央値 3.11 → 3.90、推測）、ロック・EDM では折り返し

## 落とし穴
- redroid と app.yml は同じ Google アカウント: app.yml が走っている間に流すと Play のダウンロードが「Pending…」のまま落ちる
- 同じブランチで redroid を流すと走っている run は取り消される（concurrency）。addon/spectral への push では redroid は起動しない
- **app run は 40 分で止まる**（終了コード 130）。録音は 1 本約 42 秒
- 曲パックの最初の script event に meta が入りきらないと songpack.py が止まる（6 回目）→ 大きいものは曲データ側に（形式 2）
- tools/exp: 実験の途中で tools/spectral.py を書き換えるとキャッシュの鍵（spectral.py の sha）が変わって変換し直しになる。
  バンドルは `corpus/renders/exp/bundles/<名前>.js` に写してから使う（形式 2 の曲は古いバンドルでは "bytes left" で落ちる）
- ViSQOL は頭の無音・ずれで変わる（同じ信号で 2.81 / 3.01）: 比べるときは同じ切り方で
- `pkill -f`/`pgrep -f` のパターンが自分のシェルに当たる → パターンを自分のコマンドに含めない
- `node lab.mjs check` が bds/vendor/bds-version.txt を書き換えることがある → コミット前に `git checkout -- bds/vendor/bds-version.txt`
- bds/vendor/bedrock-server.zip と corpus/{cache,audio,renders} は**コミットしない**（zip はリポジトリの外に置いて LAB_BDS_ZIP で指す）
- cdn.freesound.org はこのワークスペースから届かない（vocal_stars・vocal_name_of_love・choir_how_long はエミュレーターの 10 曲に入っていない）
- 録音の Opus（`audio export`）は高い純音を正しく残さない: 較正の数は実行の中の WAV（`[spectral rig]` 行）を使う
- 測定スクリプトの出力は lab が 100 行で切る → `LAB_MAX=10000000`
