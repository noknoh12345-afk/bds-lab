# 引き継ぎ: Spectral Player（2026-10-31、4 回目のセッション）

依頼の原文は引き継ぎ zip の ORIGINAL_HANDOFF_PROMPT.md。要点: 判定は**実クライアントの録音だけ**。天井 = 元曲 → OGG を同じ
クライアント/録音系で鳴らしたもの。ViSQOL v3 audio 48 kHz で各曲が天井から 0.3 MOS 以内、中央値も報告。補助指標
（多解像度 STFT・1/3 oct 誤差・オンセット ms）。最後はブラウザの ABX。10 曲以上、自作/CC0/CC-BY のみ。
守ること: 改造なしのクライアントで再生／@minecraft/server 安定版優先／RP は曲非依存・50 MB 以内／曲データ ≤128 kbps／
1 リスナーあたりの命令数と通信量を実測、軽量モードを残す／QA の性能基準を下げない・試験を弱めない／.github・auto/policy.json・
auto/STOP・.env に触れない／既存機能を壊さない／**実測と推測をはっきり分ける**／push は addon/spectral にだけ（main への push・PR はしない）／
Actions は unit.yml（job go）と redroid.yml（addon spectral, mode run）。redroid は app.yml が走っている間は待つ。
進捗は節目ごとに日本語で短く報告する。

## ユーザーの依頼（このセッション、原文）

- 「セッション切れて続きがないけど続きをして」（3 回目のセッションの続き: 掃き出し 5 回・音量の癖）
- 「さらに完璧にしてmp3として完成させてdiscrodの音声を反映する近接vcとかも作れるほどのクオリティにしてちゃんと立体音響みたいなやつも出来るぐらいのmodクオリティにして」
- 「質問無しでそのまま完成させて」「pushを許可するGitHub関連許可」
- 前からの続き（2 回目の終わり）: 録音を Discord にも／bds-lab の web で鍵なし・アカウントでログインしていれば見える／さらに改善して完成／
  web のゲーム音声と連動させて完全な mp3 を再現（3 回目: 合成による分析で済み）

「質問無しで」なので、前のセッションが聞いて答えのなかった 3 つはこう決めた: Discord は今の通知（notify.yml の DM）に録音を
続けて送る／web は録音を成果物の public/ に平文で置く（GitHub にログインしていれば管理パネルで聞ける。中身はゲームの音だけ）／
電話のレベルは +6 dB のまま（エミュレーターで +8 / +10 をもう一度確かめる: 下の「次にやること」）。.github は変えていない。

## このセッションでしたこと

1. **合成による分析を詰めた**（tools/spectral.py refine_client・web/core.js refineClient、py と js のバイト一致）:
   - 掃き出しを重ねると曲が沈む癖: ViSQOL は再生を元の曲のパワーにそろえてから比べるが、1 回の掃き出しはその前の倍率のまま選ぶ。
     掃き出すたびに沈み（ジムノペディで 6 回目に −5.8 dB、目的関数も 0.876 → 0.632）、16 bit の床に近づいた → **refine_hold**:
     掃き出しのあと再生のパワーを最初に戻す（全部の符号を同じだけ）。これで 5 回でも ±0.4 dB、目的関数は回すほど上がる
   - エミュレーター（推測、13 曲: 3 曲足りなかった freesound の曲もこのワークスペースから取れた）: 8 回目の既定（2 回・同じ重さ）
     中央値 3.247 → 5 回＋保つ 3.284（10/13）・svr の重み 3.318（12/13）・**svr＋5 回＋保つ 3.329（13/13 で上、差の中央値 +0.108）**
     → これを既定に（tools/exp/results/refine2.jsonl）。変換は 2.5 倍かかる（py 20 秒の曲で約 3–4 分）。変換ページは「仕上げ」を選べる
2. **録音の受け取りから鍵をなくした**: `audio export` は Opus を実行の成果物の **public/spectral/rec/** に（app/lib/audiorec.mjs
   publish、index.json に ViSQOL ほかの数）。`app checks --seal` は public/ の**音のファイルと index.json だけ**平文で残し（形と先頭の
   バイトで確かめ、ジョブの秘密が入っていれば封じる方へ: app/lib/publicout.mjs、tests/results-public-offline.mjs）、ほかは今まで通り
   封じる。管理パネルはサインインした人に成果物の音を再生できる（もとから）。notify.yml の Discord の DM は、実行の知らせのあと
   録音を 10 本・9 MB ずつ続けて送る（app/app.mjs notify・app/lib/runfiles.mjs、LAB_NOTIFY_AUDIO=off で止める。tests/panel-offline.mjs）。
   **notify は main のコードで動く**ので、自動の DM に録音が載るのは main に入ってから（addon/spectral で notify.yml を手で流すと
   今でも試せる）。tools/rig/fetch_rec.py <run> が手元へ。rec_public.pem・rec_decode.mjs は消した（8 回目の録音は前のセッションの鍵でしか
   開けない: ログの数は measured/redroid-41170496546.json）
3. **ライブ（声をその場で）と 3D**（src/main.ts の LiveStream / LivePlayer、web/live.js、tools/live/）:
   - script event `spectral:live` でフレームが届くたびに鳴らす（2 tick のジッターバッファ、遅れすぎたら飛ぶ、黙ったら止む）。場所は
     ヘッドホン・その場の 3D スピーカー（全員で 1 組の音）・near（その場に、聞く人それぞれの 3D の音）・**動く人から 3D（follow: 48 ブロック
     以内のほかの人それぞれに、その人だけが聞く 3D の音を話す人の位置に。話す本人には聞こえない。1.5 ブロック動いたら 1 tick に 8 音ずつ
     クロスフェードで付いていく）**。SoundInstance は場所を変えられないので、動きは音の置き直し
   - web/live.js LiveEncoder: 50 ms ごとに直近 43 ms だけで（先を見ない）フレームを作る。エミュレーター（推測）で話し声 2.92 / 2.86
     （前もって変換する変換器の合成前 2.99 / 2.92）
   - tools/live/bridge.mjs: **Discord のボイスチャンネル → その人がつないだプレイヤーの位置から 3D**（/mc <ゲーマータグ>、discord.js・
     @discordjs/voice（暗号化・DAVE）・prism-media・opusscript）。--bds でサーバーを自分で起動してコンソールへ、--stdout、--lab。
     Discord なしの試験 tools/live/test_bridge.mjs（同じ Opus を同じ復号器で）。本物の Discord ではまだ試していない（トークンがない）
   - ローカルの本物の BDS で: 20 秒の声を実時間で 400 フレーム送って 400 届いた（bridge --fake --lab）。tests.txt に 2 節
4. 内蔵のデモ曲（src/songs/demo.ts）を新しい既定で変換し直した。変換ページ（web/、claude.ai の Spectral Converter）は「仕上げ」
   （5 回 / 2 回 / なし / ライブの変換）を選べる。ライブの変換を選ぶと、Discord の声と同じ道（先を見ない 50 ms ずつ、24 声まで）で
   その曲を作り、ゲーム内の音で聞ける。ページは本体 1.1.0 を入れて出し直した（ヘッドレスの Chromium で 3 つの仕上げと再生を確かめた）
5. **版 1.1.0**（同じ UUID、前の版の上に更新として入る）。説明文にライブと 3D。follow / near は**聞く人それぞれの 3D の音**
   （player.playSound に location）。ライブの道: ひと続き（4 tick 何も来なかったあと）の最初のフレームから鳴らす、番号 0 にメタがあれば
   新しいストリーム、黙っている声の音程は新しいフレームから。橋渡し: 120 ms 声が来なければ無音 2 フレーム、文の間は同じストリーム、
   チャンネルを出たら終わり、声の接続が切れて戻らなければエラーで終わる。試験 149/149（follow の節は B・C・D の 3 人が聞き、離れると減る。D を追うストリームは D が抜けると誰にも聞こえない）。
   聞く人の音を作る途中でその人が離れても音を残さない、/spectral:live は流れごとに 1 行
6. **9 回目の実機**（run 41187515049、実測）: 新しい既定 d_ は 8 回目の既定 t_ より **13 曲中 11 曲で上、差の中央値 +0.09・平均 +0.14**
   （同じ run の中）。ライブの道 2.90（曲として 2.91）、3D の左右 lr_db +37.3 / −46.1 dB、ライブの変換は前もっての変換より 0.09–0.18 低い。
   表: SPEC.md。聴き比べのページ（claude.ai の「Spectral Player 9 回目の聴き比べ」: tools/abx/make_compare_real.py --a t --b d
   --refs c,jp,i,jl,jr）。録音は鍵なしでそのまま取れた（tools/rig/fetch_rec.py）
7. tools/rig/dropouts.py の時間合わせを曲の頭（＋250 ms 以内の相互相関）に: tools/exp/common.aligned は繰り返しの多い曲（EDM）で
   別の小節に合わせることがあり、無い「抜け」を出した。本当の抜けは d_ のファンクの終わり近くの約 0.5 秒だけ
8. エミュレーター（推測）: 新しい既定で +8 / +10 dB（tools/exp/results/level2.jsonl）: +10 は 13 曲中 9 曲で上・中央値 +0.02・平均 +0.16
   （ドラム +1.27・ショパン +0.31・デモ +0.28、下がるのは合唱 −0.12・Name of Love −0.11 ほか）。クリップの歪みは前の推測で話し声 −21 dB。
   **10 回目の実機（run 41197478510）**で d_（9 回目と同じデータ: run をまたいだばらつき）と e_（+10 dB で詰めて +10 dB で）を曲ごとに
   交互に、kl_ / kr_（near = follow と同じ、聞く人ごとの 3D）で左右

## いまの状態

- ブランチ addon/spectral（最後に push したコミットは git log で）。`node lab.mjs go`（ローカルの BDS 1.26.61.1: lab の api が取ってきたもの。
  zip はリポジトリの外）: DONE（test 149/149, qa clean）
- 9 回目（run 41187515049、実測）: 新しい既定 d_ の中央値 **2.91**、天井（1–2 回目の run、目安）から 0.3 以内 **9/13**。同じデータの t_ が
  8 回目 3.04（デモ）→ 9 回目 2.36: **run をまたぐと同じデータで 0.7 動く**。比べるのは同じ run の中だけ（表: SPEC.md）
- verify.yml は addon/spectral で前から tests/scratch-offline.mjs が落ちている（このユニットと関係なく、手元でも同じ。main には
  このブランチにない直しがある）。1b2e37d では tests/make-offline.mjs も一度落ちたが、手元では通る（時間の揺れ）

## 次にやること

1. 10 回目の結果（run 41197478510）: `gh api repos/noknoh12345-afk/bds-lab/actions/jobs/<job>/logs > job.log`、
   `python3 tools/rig/collect.py job.log --run 41197478510`、`python3 tools/rig/fetch_rec.py 41197478510`、`python3 tools/rig/dropouts.py <録音>`。
   d_ の 9 回目と 10 回目の差（ばらつき）、e_ − d_（レベル: 上がって歪みが聞こえなければ既定を +10 に。src/main.ts CLIENTS と
   tools/spectral.py CL_LEVEL_DB・web/core.js をいっしょに）、kl_ / kr_ の lr_db（聞く人ごとの 3D でも左右が出るか）
2. 本物の Discord で bridge を（トークンとサーバー: ユーザーが用意。tools/live/README.md の手順）
3. ライブの変換を良くする（実機で前もっての変換より 0.09–0.18 低い）: 先を 1 フレームだけ見る（遅れ +50 ms）、フレームごとの軽い合成による分析
4. 遠い曲（合唱・ドラム・デモ）: 同じ run で 2 回録って、ばらつきと差を分ける

## 実機で測るしくみ（redroid.yml, addon spectral, mode run → app.txt）

- 端末: redroid の Android 14 に Play が入れた Minecraft 1.26.60.4。BDS はランナー上の 1.26.60.6。ジョブの上限 75 分、**app run の上限 40 分**
- app.txt は tools/exp/make_app.py（`python3 tools/exp/make_app.py tools/exp/app9.json app.txt`）。腕（arm）ごとに前置き・曲 id の後ろの字・
  変換器の設定・前に打つ命令・pack（前もって変換した曲: tools/exp/make_packs.py）・play（spectral:play 以外、例 live_demo）。
  interleave: 同じ命令の腕を曲ごとに交互に
- 曲は `audio song <曲,…> [suffix=_x] [pack=<フォルダ>] [設定=値 …]`（pack なしは join の前に変換: 合成による分析 5 回は重い）
- 録音: `audio export <録音> [kbps]` → 成果物 redroid-game の public/spectral/rec/（平文）。`python3 tools/rig/fetch_rec.py <run>`
- 集計: `gh api repos/<owner>/<repo>/actions/jobs/<job>/logs > job.log` → `python3 tools/rig/collect.py job.log --run <id>` →
  `python3 tools/rig/summary.py --md`

## 実機と経路の模型（tools/emu/client.py ＋ tools/exp/exp.py の path24 ＋ web/game.js）

- ゲームは各音を 24 kHz で直線補間で読んで混ぜ（折り返し止めなし）、素材より −32.5 dB・16 bit、2 倍の直線補間で 48 kHz に
- 同時発音数 32。fade は振幅で直線・指定どおり（最短 0.8 ms）。tick の着地は σ 7.3 ms
- setVolume は 2 まで指定どおり、その上はミックスがファイル単位で約 2.0 で硬くクリップ
- エミュレーターは実機より高め（打撃音なしの版で平均 0.17）。tools/exp の数は**推測**

## 落とし穴

- redroid と app.yml は同じ Google アカウント: app.yml が走っている間に流すと Play のダウンロードが「Pending…」のまま落ちる
- **app run は 40 分で止まる**（終了コード 130）。録音は 1 本約 44 秒。変換は pack で外へ
- tools/exp: 実験の途中で tools/spectral.py を書き換えると、走っている変換が古いコードのまま新しい鍵で保存される: 書き換えは止めてから
- ViSQOL は頭の無音・ずれで変わる。**run をまたいで比べない**（8 回目: 同じ設定のロックが 3.32 → 2.80）
- `node lab.mjs check` / `api` が bds/vendor/bds-version.txt を書き換え、bds/vendor/bedrock-server.zip を置く → コミット前に
  `git checkout -- bds/vendor/bds-version.txt`、zip はリポジトリの外へ（LAB_BDS_ZIP）
- カスタムコマンドの enum は `spectral:<引数の名前>` で登録される: 違う値で同じ名前の引数を 2 つのコマンドに使うと起動で落ちる
- 測定スクリプトの出力は lab が 100 行で切る → `LAB_MAX=10000000`
