# 引き継ぎプロンプト（2026-11-03 12:40 JST、6 回目のセッションの終わり）— どの AI でも完全な続きができるように

あなたは **Spectral Player**（GitHub のリポジトリ `noknoh12345-afk/bds-lab` のブランチ `addon/spectral`、ユニット `bds/addons/spectral`）の
作業を、前のセッションの**完全な続き**として引き継ぎます。Claude 以外の AI（Codex・Gemini ほか）でも進められるように書いてあります。
ユーザーとは日本語で話し、**進捗は節目ごとに短く報告**してください。

**Spectral Player とは**: Minecraft 統合版（Bedrock）のアドオン。①MP3 などの曲を、ゲームの正弦波とノイズの音を何十個も鳴らして作り直す
（正弦波の道、曲は変換ページか tools/spectral.py で作る）、②声をその場で鳴らすライブ（Discord の近接ボイスチャット・3D の音）、
③**1.5（11-03）から**: MIDI を本物の楽器の録音で 1 ms 単位に置いて鳴らす（サンプラー）、かなの読み上げ（声の素片）、録音そのまま（ファイルの曲、48 kHz）、
パソコンのページやゲームの中のリモコンから `/connect` で曲を送って鳴らす・MIDI 鍵盤で弾く（Spectral Connect）。
良し悪しは**本物のスマホ版 Minecraft（Android 14・Minecraft 1.26.60.4、GitHub Actions の redroid）で鳴らして録った音**で決める。

## 読む順
1. このファイル（ユニットの中の `HANDOFF_PROMPT.md`。引き継ぎ zip にも同じもの）
2. `HANDOFF.md`（ユニットの一番大事な引き継ぎ: 依頼の原文の一覧・セッションごとにしたこと（19〜30 がこのセッション）・いまの状態・次にやること・
   実機で測るしくみ・落とし穴）
3. `SPEC.md`（**実測と推測を分けた**表: 「サンプラーと声」「実機のキュー 20 本で分かったこと」「曲の成績」ほか）
4. `TASK.md`（依頼・受け入れ条件・使い方）・`IDEAS.md`（23:55 の依頼の「可能性を広げるプロンプト」と試した結果）・`VERIFY.md`（確かめると役に立つ 20 個）
5. `tools/connect/README.md`（Spectral Connect）・`tools/exp/queue/README.md` と `RESULTS.md`（実機のキュー）・`tools/live/README.md`（ライブ）
6. リポジトリの `AGENTS.md`（bds-lab の作法。`node lab.mjs go` など。どの AI 向けにも書かれている）と、zip の `history/`（1〜5 回目の引き継ぎと最初の依頼の原文）

## ユーザーの依頼（このセッションの分。前のものは HANDOFF.md の「ユーザーの依頼（原文）」に全部）
- 11-02 18:41「さらに検証したら有益そうなやつ20個用意してそれぞれ考えずに記録して」→ VERIFY.md
- 11-02 18:55「さらにGitHub actionsで検証したら有益そうなやつ20個用意してそれぞれ考えずに記録して ただし時間のかかるやつ限定で有益で貴重であるものを前提に」
  → 実機のキュー q01〜q20（tools/exp/queue/、tools/exp/queue_run.py が 1 本ずつ走らせてそのまま記録）
- 11-02 19:53・23:55（原文は HANDOFF.md。要点）: MIDI を正弦波でなく 1 tick（50 ms）の壁を越えて 1 ms 差で鳴らす・ピアノなどの楽器の演奏をマイクラの中で・
  ゆっくりの音声を MIDI と同じ原理で人が容易に聞き取れる最高峰の品質に（目標は Synthesizer V と読んだ）・mp3 などを上手く使って統合版の可能性を最大限に・
  OreUI で web を動かし、マイクラそのまま WebSocket 単体（`/connect`）で YouTube を取り込んで再生まで web で（bds-lab の GeoUI を使い、HTML 変換器も育てる）・
  高音に弱い・音割れ・ノイズキャンセリングが鬱陶しいのを mp3 に近づける・まず可能性を広げるプロンプト（IDEAS.md）→ 制作
- 11-03 00:44「続き」・01:09「4:20に続きとうって」・01:13「その五分前に続きともうって」・09:55「続き」
- 11-03 10:53「ある程度先に完成させて」・11:48「さらに少し作業進めて完成できるところ完成させて」
- 11-03 12:36「これまでの進捗全てまとめて別のAIに完全な続きとして渡せるようにして」→ このファイルと引き継ぎ zip 10
- 11-03 12:39「さらに40個ほど考えて検証ずっと走らせて欲しいただし記録待たないでいいよ」・12:41「先にzip進捗全て」
  → zip 10 を先に作って渡した。**次の仕事は実機の検証 40 本を考えて計画にし、キューで走らせ続けること**（結果を待って解かなくてよい）。下の「次にやること」の 0

## 守ること（最初の依頼から。いまも有効）
- `.github` / `auto/policy.json` / `auto/STOP` / `.env` に触れない。**試験を弱めない**・QA の性能基準を下げない・既存機能を壊さない
- 数字は**実測（改造なしの実機の録音）か推測（模型・手元）か**を必ず書き分ける
- `bds/vendor/bedrock-server.zip` と corpus の音声・キャッシュ（corpus/audio・corpus/renders・corpus/cache）はコミットしない。
  `node lab.mjs go` が `bds/vendor/bds-version.txt` を書き換えたら、コミットの前に `git checkout -- bds/vendor/bds-version.txt`
- push は **addon/spectral にだけ**（ユーザー許可済み）。main への push・PR はしない
- Actions は **unit.yml（job go）・redroid.yml（addon spectral, mode run）・notify.yml（Discord への文）だけ**。redroid は 1 本ずつ
  （`concurrency: cancel-in-progress`: 走っている間に次を始めると前が取り消される = 取り消し）、app.yml が走っている間は待つ。
  **AI キーを使うワークフローと、実行の取り消しは先にユーザーに聞く**
- ユーザーの手元の曲（著作権のある MP3）はリポジトリ・zip・Discord に入れない。YouTube は権利のあるもの（自分の・CC）だけ
- 「質問無しで」: 決めたことは報告に書き、戻せないことだけ止めて聞く
- **ユーザーの好み**: 実機で確かめている間は結果をすぐ Discord に（できれば生の録音も）。**確かめに使ったアドオンは毎回送る**（自分でも試すため）
- 作業の区切りでコミットして addon/spectral に push する（このリポジトリの環境では、ターンの終わりに未コミットが残らないように）

## 元に戻す（新しい作業場所で最初に）
1. `git clone https://github.com/noknoh12345-afk/bds-lab && cd bds-lab && git checkout addon/spectral`（全部 push 済み。zip の `repo/HEAD.txt` が
   その時の先頭）。GitHub に届かないとき: zip の `repo/bds-lab_addon-spectral_<sha>.zip`（ファイル一式）か、main を持つ clone に
   `git fetch repo/addon-spectral_since_28c7e6d.bundle addon/spectral:addon/spectral`
2. 試験曲（gitignore 済み）: zip の `corpus_audio/*` → `bds/addons/spectral/corpus/audio/`（13 曲の抜粋: 自作・CC0・CC-BY だけ、CREDITS.txt）。
   無ければ `python3 tools/corpus.py`
3. 実機の録音: zip の `recordings/`（前のセッションの rec*）と `recordings/queue/<計画>_<run>/`（このセッションの実機の全部: q01〜q17・p01〜p14、174 MB）。
   取り直しは `python3 tools/rig/fetch_rec.py <run> --out <置き場>`（成果物には期限がある）
4. BDS: `node lab.mjs go`（または check）が取ってくる。取ったら zip を**リポジトリの外へ**移して `LAB_BDS_ZIP=<その場所>`
5. 確かめ: `node lab.mjs go -a spectral` → **DONE dist/Spectral_Player.mcaddon（test 364/364, qa clean）**（約 20 分、出力は終わるまで出ない）。
   `node lab.mjs go -a spectral_remote` → 15/15。`node bds/addons/spectral/tools/connect/test.mjs` → 37 項目 PASS。速い下見は `node lab.mjs sim -a spectral`
   （サンドボックス: unsure が多いのはいつも通り。決めるのは go）
6. Python（tools/ の道具）: numpy・scipy・soundfile・ffmpeg。読み上げの評価は openai-whisper（small）と pyopenjtalk、声の素を作るのは kokoro（Kokoro-82M）。
   自動採譜の試しは `pip install --no-deps basic-pitch` と librosa・mir_eval・pretty_midi・"resampy<0.4.3"・scikit-learn（onnxruntime で動く: TensorFlow は要らない）。
   GitHub は `gh`（ユーザーのアカウント）

## いまの状態（11-03 12:40）
- **Spectral Player 1.5.1**（同じ UUID）を addon/spectral の e030091 で。ユーザーに 1.5.1 と Spectral Remote 1.0.0 の .mcaddon を渡し、Discord にも送った
  （unit.yml の go の通知）。go 364/364
- **サンプラー**（src/notes.ts・src/bank.ts、tools/samples/bank.py・tools/notes.py）: 楽器の録音（ピアノ 42 鍵 × 強さ 3 段ほか GM の 21 楽器、24 kHz、
  頭に 0.6 秒の無音）。1 音 = 1 つの SoundInstance を 1 つ前の tick に始め、同じ tick に `seekTo(0.6 − 遅らせる時間 × pitch)` で 1 ms 単位に置く。
  既定: 2 tick ずつ束ねる・3D は 250 ms 先・同時 28 音・大きさ 300 %（束ごとに混ぜた山が 1.9 を超えないよう新しい音を下げる）・**温め 600 ms**
  （各素を音の前に、自分の頭の無音の中で音量 0.001 で始めて 4 tick 後に止め、電話に読み込ませる。15 秒以内に鳴らした素は温め直さない、曲の中で
  15 秒使わなかった素はまた温める）。`/spectral:sampler <束ね> <3D 先 ms> <同時> <大きさ %（〜400）> <ログ> <温め ms>`、`scriptevent spectral:warmcfg <音量> <tick>`
- **声**（src/say.ts、tools/samples/voice.py・tools/speech.py）: Kokoro-82M のモーラの素 112 × 高さ 3 段（音から切り直した segment()）、1 モーラ 180 ms、
  前の母音を次の子音の頭で止める（10 ms 重ね）。`/spectral:say "<かな>"`（漢字は tools/speech.py が読む）
- **ファイルの曲**（src/files.ts、tools/filepack.py）: 48 kHz、部分ごとに温め。内蔵は piano_file
- **生演奏**（LiveKeys）と **Spectral Connect**（tools/connect/server.mjs・page.html・remote.html → bds/addons/spectral_remote）: 自分で開いた一人のワールドの
  `/connect <PC>:8790`。ページ（ラボの OreUI）と GeoUI のリモコンから URL（yt-dlp）・ファイル → 曲にして送り鳴らす、MIDI 鍵盤・画面の鍵・パソコンのキー。
  つないだときにピアノを温めさせ、ページで楽器を選ぶとその楽器を温めさせる。暗号化（enableencryption）対応。**BDS の上では /connect は使えない**（op でも
  `commands.generic.error.permissions [wsserver]`）。GeoUI の HTML 変換器を育てた（`--ore`・`cmd:` の `{value}` / `{field:id}` / `{b64:id}`・`mail:`、bds/geoui/SPEC.md 11 章）
- **楽器の高さを直した**: ピアノとハープ以外の 16 楽器は元のファイルが真ん中の C を「C3」と名付けていて、全部 1 オクターブ高く鳴っていた（手元で全部の素を測った）
  → tools/samples/bank.py の `octave`・`--relabel`

## このセッションの実測（redroid、run の番号つき。詳しくは SPEC.md と measured/sampler-p*.json）
| 実機の回 | 分かったこと |
|---|---|
| p01・p04（41472510854・41482910293） | 同じ束の 2 発は送った間隔そのまま（ずれ 0.05 ms 未満）。束ね 2 が一番（エリーゼ 3.11）、同じ素の別名は効かない |
| p03（41475752440） | ファイルの曲は 48 kHz が 24 kHz より上（3.09 対 2.71） |
| p05（41518220137） | 音割れ止め（正弦波の道）は平均で少し下がる → 既定は切 |
| p09（41531478311） | 声の素は 2 回目からしか鳴らなかった（最初の文はほぼ無音）→ 電話は**音の初回の再生を落とす** |
| p10（41534236021） | サンプラーを大きく: エチュード 2.22 → 4.20（正弦波の道 4.12 を超えた）。**この「300」は命令の上限で 200 % だった** |
| p11（41536705472） | 同じ seek の和音は 1 tick に 12 音でも全部鳴る。フルートが C6 で鳴った → オクターブの誤りを見つけた |
| p12（41538782070） | /connect はつながらない（リグは BDS に入る） |
| p13（41561994201） | 初回は落ちるのではなく**ファイルの頭から 0.65〜0.7 秒遅れて**鳴る（短い音は消える: 温めなし 0/12）。150〜1000 ms 前に温めて 12/12。1.5〜2.5 分使わないと捨てられる（0/12）。温めありの読み上げは全部の音が鳴り、Whisper（録音の大きさをそろえて）0.19・0.25・0.48・0.36、3D 0.11（前は 1.0 前後）。エチュード 4.35・エリーゼ 4.18 |
| p14（41569907471） | 300 % は 200 % と同じか上（エチュード 4.41・エリーゼ 4.23・バンド 2.50）→ 既定 300 % |
| q01〜q17（SPEC.md の表） | 同じデータでも 0.15 ゆれる・3D は 8 ブロックまで同じ・隣にもう 1 曲で 1.0 落ちる・歩くと 0.37・軽量モード 0.11・粗い格子 0.18・BGM ありでも同じくらい。q16 は計画の誤りで 0 本 → q21 |

**推測（手元）**: 自動採譜（tools/transcribe.py、Basic Pitch）→ サンプラーは、ジムノペディで鳴らしたまま 3.77 だが電話の模型（24 kHz・16 bit）を通すと 2.60
（正弦波の道の模型 3.61）: 電話の出口の 16 bit がピアノの静かな音を沈める → つないでいない。バンドの実機 2.50 は電話の模型（3.54）より低い:
実機の録音は 6.4 kHz から上が鳴らした音より 12〜21 dB 多い（理由は未解明）。

## 走っているもの・予約
- **実機のキュー**: このセッションの作業場所で `tools/exp/queue_run.py loop` が q18（run 41572109965、12:25 から）→ q19 → q20 → q21 を 1 本ずつ走らせている
  （予算 6900 秒: 14:17 ごろに止まる。作業場所が消えると止まる）。続きは `tools/exp/queue/state.json`（pending / running / done）と
  `gh run list -R noknoh12345-afk/bds-lab --workflow redroid.yml` を見てから、`QUEUE_WORK=<作業用> python3 tools/exp/queue_run.py loop --budget 6900`
  （ユニットのフォルダで。走っている run は待つ・計画はコミット済みのものだけ・1 本ずつ RESULTS.md と Discord に記録して push する。
  ランナーが git を使う間は自分の commit をぶつけない）
- **予約**: このセッションに 14:25 の「続き（q18〜q21 の記録）」（trig_01LdQmvxrKcN7poEAUq8SDGq）。別の AI には届かないので、続ける人がキューを見る

## 次にやること（順に）
0. **実機の検証を 40 本ほど**（12:39 の依頼）: tools/exp/queue/ に q22〜q61 の計画（名前は `q<2 桁>_<英数字>.json`）を作り、キューのランナーで走らせ続ける。
   記録（RESULTS.md・Discord）はランナーが書くので、解くのを待たない。候補: 温めの最短と捨てられるまでの秒数・一度に読み込める素の数・サンプラーの同時音数と
   和音・音の高さの幅（pitch 0.5〜2）・強さの曲線・3D の距離と方向・束ね 1/2/3（温めあり）・バンドを楽器ごとに・打楽器ごと・速さと移調・一時停止とシーク・
   ループ 5 分・読み上げの速さ（1 モーラ 140〜220 ms）・文を増やす・抑揚の幅・3D の距離・音楽と重ねる・大きさ・ファイルの曲を温めあり／なし（13 曲）・
   音割れ止め +12 dB・電話の声 28/32・長い通し（混ぜて 30 分）・入り直し・画面を消す（サンプラー）・メモリの圧迫（サンプラー）。
   計画の 1 行でも失敗すると録音 0 本（q16）: 失敗しうるコマンド（対象のいない kill など）を入れない。ローカルの BDS で `node lab.mjs run -a spectral` に
   その行を流して確かめてから入れる
1. q18〜q21 の結果を SPEC.md「実機のキュー 20 本で分かったこと」の表へ（RESULTS.md の中央値。q09・q10・q18 は 1 本の長い録音: 区切って元と比べる）。Discord へ短く
2. 読み上げの外来語（「マインクラフト」→「魔法洋クエスト」）: VCV（母音から子音への続き）の素、または 2 モーラの素。手元で tools/speech.py `--render --eval`
   （Whisper small）→ 良いものだけ実機（tools/exp/sampler_plans.py に計画を足し、queue に置く）
3. バンドの実機と模型の差（6.4 kHz から上が多い）: 楽器ごとの録音（1 楽器ずつのバンド）を実機で、または素を 7 kHz で切った版と比べる
4. /connect の実機: リグ（app/ の側）が一人のワールドを開く手が要る。または BDS 向けに `@minecraft/server-net` の橋（別のパック: 一人のワールドでは
   server-net が無いので Spectral Player 本体には入れない）
5. 生演奏の遅れの実測（4 が要る）、VERIFY.md の残り

## 落とし穴（このセッションで踏んだもの）
- 電話は読み込んでいない音を頭から遅れて鳴らす・しばらく使わない音を捨てる → 新しい鳴らし方は必ず温めてから測る
- コマンドの上限を確かめてから計画する（`/spectral:sampler` の大きさは 200 で止まっていた: p10・p13 の「300」は 200）
- 計画の 1 行でも失敗するとその区切りが止まり録音 0 本（q16: 牛のいないワールドで `kill @e[type=cow]`）。区切りの名前は英数字と _ . - だけ（p06）
- Whisper は小さな録音で何も書かない → `ffmpeg -af loudnorm=I=-20:TP=-2:LRA=11` でそろえてから tools/exp/speech_eval.py。同じ文でも回で 0.48〜1.0 ゆれる
- `until ! pgrep -f "<文字列>"` は自分の命令行にも当たって終わらない
- go の出力は最後まで出ない（約 20 分）。BDS の試験の時刻は束の境目（例: 20000 ms の音は「at 20000 ms」）
- 電話の模型（tools/emu、exp.py path24）は正弦波の道には合う（誤差 0.074）が、サンプラーのバンドは実機の方が低い

## Discord とアドオンを送る
- 文: `gh workflow run notify.yml -R noknoh12345-afk/bds-lab --ref main -f message="<文>"`
- アドオン: `gh workflow run unit.yml -R noknoh12345-afk/bds-lab --ref addon/spectral -f job=go -f unit=spectral`（終わると通知が .mcaddon を送る）
- 実機の録音: キューのランナーが run ごとに Discord へ。手で: `gh workflow run notify.yml -f run=<run の番号>`

## 道具の早見
- 実機の計画を作る: `python3 tools/exp/sampler_plans.py p13|p14|…`（p）・tools/exp/queue20.py（q）。走らせる: tools/exp/queue_run.py。録音を取る: tools/rig/fetch_rec.py
- 解く: tools/exp/sampler_score.py `<録音> --songs <参照>`（曲）・tools/exp/speech_eval.py `--rec <録音>`（読み上げ）・tools/exp/warm_score.py（温めの試し）・
  tools/metrics/（ViSQOL ほか）・tools/emu/phone.py（電話の模型、推測）
- 作る: tools/notes.py（MIDI → 曲）・tools/speech.py（文 → 読み上げの曲）・tools/filepack.py（録音 → ファイルの曲のパック）・tools/transcribe.py（自動採譜、試し）・
  tools/samples/bank.py（楽器の素）・tools/samples/voice.py（声の素）
