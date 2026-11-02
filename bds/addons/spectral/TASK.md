# Spectral Player

## Request
マイクラ統合版でフーリエ変換して正弦波で再生してみた、という作品がある。bds-lab を使い、統合版の限界を攻めて、極限まで可能性を持たせた動的再生 MP3 アドオンを作る。

## 使い方（遊ぶ人へ）
1. **本体**: `Spectral_Player.mcaddon`（bds-lab の dist/、変換ページの「本体アドオンを保存」）を開き、ワールドでビヘイビアーパックと
   リソースパックを有効に（実験的な機能は要らない）。サーバーなら `node lab.mjs deploy <BDS のフォルダ>`。版は 1.4.0（同じ UUID のまま上げたので、前の版を入れていても更新として入る。1.3.0: 何人もの話し手で音を分ける・曲をテキストで貼り付け。1.4.0: 短いテキスト SPZ2・ほぼ全ての音声形式・入力欄 100000 文字（試し））
2. **曲**: 変換ページ（web/dist/index.html。claude.ai の Spectral Converter）に音声ファイル（MP3・WAV・M4A・OGG・FLAC・AIFF・CAF・AU・WMA・AMR・APE・AC3・MIDI・動画の音など、ほぼ全て）を落とす → 「ゲーム内の音」で試聴 →
   「曲パックを保存」→ 末尾の .zip を消した .mcpack を開き、ワールドで本体と一緒に有効に。手元なら `python3 tools/spectral.py <曲> --ts`
2b. **曲パックを入れられないとき（Realms・スマホだけ）はテキストで**: 変換ページの「ゲームで貼り付け」→「選んでいる曲をテキストに」→ コピーして、ゲームの
   `/spectral:paste`（リモコンの「📋 Paste a song」）のフォームに貼り付ける。テキストは SPZ2（耳で区別できない格子の上の曲、1 文字に 15 bit: SPZ1 より約 1.34 倍短い。
   「そのまま」で曲データと 1 ビットも違わない SPZ1 にもできる。前の SPZ1・SPA1 のテキストも貼れる）。長い曲はパート（1 回 30000 文字まで: 本体のリソースパックの
   rp/ui/server_form.json がフォームの入力欄を 100 → 30000 文字に広げる。実機で確かめた: 31 回目）に分かれ、フォームが次のパートを待つ。登録した曲はワールドに残る
   （`/spectral:forget <ID>` で消す）。20 秒の曲は 24 声・音程 3 セントで 4,500–10,600 文字、3 分半の曲は 3 パート。手元なら `node tools/songtext.mjs <曲.song.json>`
3. **ゲームで**: 最初に配られるスペクトル・リモコンか `/spectral:menu`。`/spectral:play <曲> phones|speaker`（ヘッドホン: 自分に付いてくる／
   スピーカー: その場から 3D で近くの全員に）・`/spectral:stop`。速度（音程そのまま・逆再生）・移調・EQ・音量・声の数は鳴らしながら
4. **ライブ（近接ボイスチャット・立体音響）**: `/spectral:live` が流れている声の一覧。Discord のボイスチャンネルの声を、つないだ
   プレイヤーの位置から 3D で（近づくと大きく、向きで左右、その人に付いて動く）: tools/live/README.md の bridge.mjs。
   試し: `/spectral:live_demo demo near`（その場に置いて、近くの人それぞれが 3D で聞く）・`/spectral:live_demo demo follow <誰>`（その人から:
   本人には聞こえない）。名札をつけたエンティティ（防具立て・ペット）も follow の話し手にできる。3D の音は 48 ブロックまで届く
   （`/spectral:range <音量> [レベル dB] [静かに作る]`: 16 ブロック × 音量、既定 3。レベルは 3D の音をファイルより大きく、既定 +10 dB:
   遠くで声の静かな所が 16 bit の床に消えないように。静かに作るは既定 on（follow の声だけ）: 歩く話し手の音を作り直すときの低い「トン」を消す）
5. **電話**は同時に 32 音しか鳴らない（実測）ので自動で 24 声＋ノイズ 8、ファイルより 10 dB 大きく（実測で +6 dB より良い）。Realms や人が多いときは
   `/spectral:mode light`（16 声・1 人 1 tick 24 命令まで）。何人もの話し手が近くにいると、聞く人ごとにその 32 音を話し手で分ける
   （`/spectral:share`、既定 on: 2 人なら 1 人 10 声＋ノイズの上の 6 帯域）

## Acceptance (one tests.txt `## ` section each)
- [x] MP3 を解析した曲データを正弦波の加算合成で再生する。正弦波 1 本 = 常駐ループの SoundInstance 1 つ（## play starts 48 sine voices and 8 noise bands as looping sound instances）
- [x] 実時間で 20 枠/秒進み、スペクトルをアクションバーに出す（## it plays in real time: 20 frames a second, a spectrum on the action bar）
- [x] 一時停止・再開（## pause holds the playhead, resume goes on）
- [x] シーク（## seek jumps to a time）
- [x] 音程を変えない速度変更・凍結・逆再生（## speed stretches time without changing pitch, 0 freezes, negative plays backwards）
- [x] 移調・EQ・音量（## transpose, EQ and volume apply while playing）
- [x] 再生中にボイス数を変える（## fewer voices on the fly (quality against load)）
- [x] 設定は次の曲にも残る（## settings are kept for the next song）
- [x] ノイズ帯域・打撃音・スペクトル表示・ループの切り替え（## layers, loop and the spectrum can be switched）
- [x] 曲の終わりで自動停止（## the song ends by itself）
- [x] 他のプレイヤーが同じヘッドホンを聴ける（## a second player listens in on the same headphones）
- [x] その場の 3D スピーカー（近くの全員）（## the speaker plays in 3D at a spot for everyone near it）
- [x] 曲パック（別ビヘイビアーパック）を script event で受け取る。コマンドブロックからは 2048 文字ずつ（## a song pack arrives over script events (a command block can send one, 2048 characters a part)）
- [x] スクリプト間なら 1 曲を 1 つの script event で送れる（## a whole song in one script event from another pack (no 2048 limit between scripts)）
- [x] データ不要の生成曲（Shepard–Risset）と端末の同時発音数を耳で測るプローブ（## generated songs: an endless Shepard–Risset glissando and the voice-limit probe）
- [x] /spectral:menu とコンソールから届く（## the menu command and the console can reach the player）
- [x] メニューの曲一覧から再生できる（## the song list in the menu starts a song）
- [x] 「音の設定」フォームで音量・速度・移調・EQ・ボイス数・各層をまとめて変える（## the sound form sets everything at once）
- [x] 死んで復活しても音を作り直して鳴り続ける（## the voices are rebuilt after a respawn）
- [x] リモコンでメニューが開く（## the remote opens the player）
- [x] 新しいプレイヤーにリモコンを配る（## a new player gets the remote）
- [x] 実機クライアントを測る較正プログラム（## calibration programs for measuring a real client (tools/rig)）
- [x] 軽量モード: 16 声・1 リスナーあたり 24 命令/tick（知覚上の優先度で選ぶ）（## light mode for Realms and many players: 16 voices and a command budget）
- [x] 曲の一覧（## the library lists the demo song and the generated ones）
- [x] 電話は実測の同時発音数（32）に収まる声の数が既定、打撃音（ワンショット）は既定で鳴らさない（同じ run の実測で打撃音なしが上）、どの音もファイルより 10 dB 大きく（実機の 2 回の run で +6 dB より 13 曲中 10 曲で上）（## a phone gets as many sounds as its client plays at once (32, measured): 24 voices beside the 8 noise bands, no drum bursts (measured: better without), and every level 10 dB over the files (the phone plays them 32.5 dB under, into 16 bits; measured: +10 dB beat +6 dB on 10 of 13 songs in two runs)）
- [x] ファイルより大きく鳴らす: ゲームはどの音もファイルより 32.5 dB 小さく 16 bit で鳴らすので、静かな曲の下限は量子化（## louder than the files: a level in dB, by setVolume or by the loud sound events (the game plays every sound 32.5 dB under its file)）
- [x] 変換器が tick ごとに選んだ長さのフェードで声とノイズ帯域を鳴らす（## a song with fitted fades (tools/spectral.py nz_fade, v_fade): each voice and noise band fades as long as the converter chose, tick by tick）
- [x] ライブ: 声（ボイスチャット・マイク）をその場で受け取り、届いた順に鳴らす。script event `spectral:live`、ジッターバッファ 2 tick、届かなかったフレームは数えて埋める、送り手が始め直したら新しいストリーム、終わり（## a live stream plays while its frames arrive (spectral:live script events from the console, a jitter buffer of 2 ticks), starts again when its sender does, and ends）
- [x] ライブの道で曲を 1 フレームずつ送る（ボイスチャットの橋渡しと同じ形）: ヘッドホンに、そして歩く人から 3D で（音がその人に付いて動く・48 ブロック以内の人それぞれに・話す本人には聞こえない・いなくなった人の声は誰にも聞こえない: 近接ボイスチャット・立体音響）（## a song sent as a live stream frame by frame, as a voice chat bridge sends one: on headphones, then in 3D from a player who walks (the sound moves with them, the talker does not hear their own voice, nobody hears a talker who left)）
- [x] 名札のエンティティ（防具立て・ペット・NPC）の声を follow で追える（## a voice can follow an entity with a name tag (an NPC, a pet) as it follows a player: everyone within reach hears it, it moves with it, and nobody hears it once it is gone）
- [x] 曲をテキストでゲームに入れる: 変換ページ・tools/songtext.mjs が曲を SPZ2 のテキスト（大きさ 1.5 dB・音程 10 セント・ノイズ 1 dB の格子、項目ごとの範囲符号、1 文字に 15 bit、30000 文字ごとのパート。SPZ1 も読む）にし、`/spectral:paste` のフォームに貼り付けると登録・再生でき、ワールドに残る（再起動の後も）。壊れた・途中で切れたテキストはチェックサムで断る（## a song pasted as text into a form joins the songs, plays and stays in the world … ／ ## the newer song text pastes the same way: SPZ2 … ／ ## a long song comes in parts ／ ## a text that is not a song, a broken one and a cut one are refused with why ／ ## the pasted songs kept in the world are there after a restart ／ ## a pasted song is forgotten）
- [x] 変換ページはほぼ全ての音声形式を読む: ブラウザが読むもの（MP3・AAC・Ogg・Opus・FLAC・WebM・動画の音）はそのまま、読めないものは web/decoders.js（WAV の全ての一般的な符号: PCM・float・A-law・μ-law・IMA/MS ADPCM、RIFF/RF64/Wave64・AIFF/AIFC・AU・CAF・VOC、MIDI は内蔵の音源で鳴らして）、それでも読めないもの（WMA・AMR・APE・WavPack・AC3・DTS ほか）は ffmpeg（WebAssembly、初回だけ取ってくる）（tools/test_decoders.mjs: 36 種が ffmpeg とサンプル単位で一致 ／ tools/test_page.py: 11 形式が実際のブラウザで変換でき、テキストが本体の復号で読める）
- [x] 何人もが同時に話す: 聞く人ごとに、その人が聞くライブのストリームでクライアントの同時の音（電話 32、実測）を分ける。1 人なら全部、2 人なら足りない分を一番低いノイズ帯域から（/spectral:share、既定 on。分けないと超えた分はクライアントが落とす）（## the live streams a listener hears share the sounds their client plays at once …: one talker near a phone has all their stream's sounds ／ ## two talkers near a phone ／ ## sharing off ／ ## sharing on, a client with no measured limit given one ／ ## the other talker gone）
- [x] 3D の音は 48 ブロックまで届き、ファイルより 10 dB 大きく鳴る: 届く距離は作るときの音量で決まる（実機で 16 ブロック × 音量、音量を上げても大きくはならない）ので音量 3 で作り、音を作るのは届く人にだけ。レベルは setVolume で（実機で 3D でも 1 を超えて効く。24 ブロックで ViSQOL 2.38 → 2.79）（## 3D sounds reach 48 blocks (made at volume 3: the client takes the distance from it, 16 blocks a unit, measured) and play 10 dB over the files (measured: a far voice keeps its quiet parts), and only the players they reach get sounds (spectral:range)）

## Guessed
<!-- values decided without asking -->
- 正弦波の元音: 1760 Hz（setPitch 0.01–10 で 17.6 Hz–17.6 kHz を 1 本で覆う）
- 既定のボイス数: 曲データの数（変換時 48）、/spectral:voices で 1–128。ただし電話（platformType Mobile）は実測の同時発音数 32 − ノイズ 8 = 24（SPEC.md。測っていないデスクトップ・コンソールは今までどおり）
- 電話の既定のレベル +10 dB（setVolume、1.2.0 から。1.1.0 までは +6 dB）: 実機の 11・12 回目の run で +6 dB より 13 曲中 10 曲で上（中央値 +0.11 / +0.06）、+8 dB は間。いちばん大きいところはクリップする（ファイル単位で約 2.0）が ViSQOL は下がらなかった。前に +6 dB 向けに変換した曲も +10 dB で良くなる（エミュレーター、推測）（SPEC.md）。/spectral:level で 0–18 dB
- ヘッドホンは category ui・is3D false（範囲制限なしで本人に付いてくる）、スピーカーは category record・3D・min_distance 3・max_distance 48。3D の音は音量 3（48 ブロック）・高さ P_MIN（17.6 Hz）で作り同じ tick に無音にする（実機で、作った直後 100–200 ms は作ったときの音量と高さで鳴る: 高さ 1 なら 1760 Hz の「ピッ」）。状態は 2 tick 後にもう一度送る
- 打撃音: 低/中/高の 3 帯域 × 先頭無音 0/12.5/25/37.5 ms の 4 ファイル
- デモ曲は自作の合成曲（第三者の素材なし）: tools/make_demo_song.py
- ライブ: 1 フレーム = 50 ms、届いた最新の 2 tick 後ろを鳴らす（100 ms のジッターバッファ）、8 tick より遅れたら先へ飛ぶ、4 tick 何も来なければ黙る。3D で人に付いていくときは 1.5 ブロック動いたら 1 tick に 8 音ずつ新しい場所に作り、2 tick 後に古い音から 1 tick のクロスフェードで引き継ぐ（SoundInstance は場所を変えられないため。新しい音が命令どおりに鳴り出すのを待つ）
- ボイスチャットの橋渡し（tools/live/bridge.mjs）の既定は 1 人 16 声＋ノイズ 8（2 人が同時に話しても電話の 32 音にほぼ収まる）。Discord で /mc <ゲーマータグ> とつないだ人だけをゲームで鳴らす
- 文の切れ目: 120 ms 声が来なければ橋渡しが無音を 2 フレーム送る。アドオンは 4 tick 何も来なかったあとのフレームをひと続きの始まりとし、その最初のフレームから鳴らす。番号 0 のフレームにメタがあれば新しいストリーム（送り手の始め直し）

## Measured on this BDS (1.26.61.1, real clients)
- `/scriptevent` の本文は 2048 文字まで（それを超えると "Message length exceeds (2048) character limit!"）。`system.sendScriptEvent` はスクリプト間なら 8,388,608 文字でも届いた
- 別のビヘイビアーパック（曲パック）からの script event は本体に届く（LAB_UTILITIES で 2 パック同時に確認）
- 1 人ヘッドホン再生: 56 インスタンス、平均 16–30 命令/tick（最大 89）、スクリプト 1.5–1.8 ms/tick。QA（3 人・再接続・/reload・再起動）で 2 ms/tick 以内

## この版の状態（2026-11-01 5 回目のセッション、版 1.2.0、実機での測定）

引き継ぎ: HANDOFF.md。実機の限界値と曲の成績: SPEC.md（実測と推測を分けた）、数の元: measured/。
- 実機（redroid の Android 14 に Play が入れた Minecraft 1.26.60.4、改造なし）で録って測った: 同時発音数 32、fade は振幅で直線・指定どおり、
  ゲームは 24 kHz で混ぜて素材より −32.5 dB・16 bit、setVolume は 2 まで指定どおりでその上はクリップ、seekTo は一定のずれ（σ 6 ms）、
  **3D の音は左右がはっきり分かれる**（6 ブロック左で +37 dB・右で −46 dB）
- 変換器の既定: 合成による分析（変換の中で実機の模型を通して tick ごとの音量とフェードを選ぶ）を、帯域を ViSQOL の MOS が頼る重さで、
  5 回、音量を保って。py と js はバイト一致
- **実機の ViSQOL（9 回目 run 41187515049、13 曲、同じ run の中で）: 新しい既定 中央値 2.91、8 回目の既定より 11/13 で上（差の中央値 +0.09・
  平均 +0.14）**。天井（1–2 回目の run、目安）から 0.3 以内 9/13。run をまたぐと同じデータで 0.7 動くことがある（デモ）ので、比べるのは
  同じ run の中だけ。`node lab.mjs go`（ローカルの BDS 1.26.61.1）: **DONE dist/Spectral_Player.mcaddon（test 175/175, qa clean）**（1.2.0、5 回目の終わり）
- **11 回目（run 41200540880、実測、まとめ録り）: 同じ変換を +10 dB で詰めて +10 dB で鳴らすと 10/13 で上（中央値 +0.11）、同じ run の
  天井から 0.3 以内 12/13**（+6 dB は 10/13）。**12 回目（run 41205071937）でも +10 dB は 10/13 で上（中央値 +0.06・平均 +0.16）、+8 dB は間**
  → **1.2.0 で電話の既定を +10 dB に**（src/main.ts CLIENTS・変換器の CL_LEVEL_DB、py と js）
- **3D（実測）**: 距離が倍で 6 dB 下がり（min_distance 3 から）、届くのは 16 ブロック × 作る音量まで（音量を上げても大きくならない）→ 1.2.0 で
  作る音量 3 = 48 ブロック（FOLLOW_RANGE）、音を作るのは届く人だけ。どの 3D の録音も頭に約 100 ms の 1760 Hz の「ピッ」があった（作った直後は
  作ったときの音量と高さで鳴る）→ 1.2.0 で 3D の音は高さ P_MIN で作り、2 tick 後に状態を送り直す。**13 回目（run 41266897044）: ピッは消えた**
  （500–2000 Hz が 24–39 dB 小さい。低い「トン」が約 0.1 秒残る）、48 ブロックまで届く、前に変換した曲も +10 dB で良くなる（9/13）
- **14・15 回目**: 3D も +10 dB が既定（24 ブロックで ViSQOL 2.38 → 2.79）。follow の声は「静かに作る」（定義の音量 0.1 の音を 10 倍に操る）が既定（16 回目: 止まった音は遠くで少し下がるので near・スピーカーはふつう）:
  作った直後の音が声に対して 19–24 dB 下がり、歩く話し手（名札の防具立て）が ViSQOL 2.41 → 2.87・2.39 → 2.95。名札のエンティティも follow で追える
- **17–19 回目**: 歩く話し手（約 0.7 秒ごとに音を作り直す）は、作るときの定義の音量を 0.01 にすると 0.1 より +0.28（2 組）→ 既定 0.01
  （`/spectral:range` の 4 つ目）。引き継ぎの形（steer・送り直し・遅らせる）はどれも変わらない。作り直しの直後に始まる音節の頭が 300–350 ms 抜ける
  → **21 回目: 1 人の話し手が作り直しの間に電話の同時 32 音を超えるのが原因**（8 声・古い音をすぐ止める cut では抜けない）→ follow の引き継ぎの既定を
  cut・1 tick に 2 音に（24 声で 2.68 → 2.77 / 2.73）
- ライブ: 声などを 50 ms ずつその場で受け取って鳴らす（script event spectral:live）。ヘッドホン・3D スピーカー・その場に聞く人ごとの 3D（near）・
  動く人から 3D（follow: 近接ボイスチャット）。実機でライブの道は曲として鳴らすのと同じ質（2.90 / 2.91）。web/live.js がその場の変換、
  tools/live/bridge.mjs が Discord のボイスチャンネルをつなぐ（tools/live/README.md）。**20 回目（実測）: その場の合成による分析（web/live.js
  LiveRefiner、2 フレーム先まで見る = 遅れ +100 ms）で 2.82 → 3.16 / 3.20（中央値 +0.26、3 曲 × 2 組すべてで上）→ 橋渡しと encoder.mjs の既定に**
- 録音: 実行の成果物の public/spectral/rec/ に平文の Opus（鍵なし）。管理パネルでサインインして聞ける、notify.yml が Discord に送る
  （9 回目の 32 本を tools/rig/fetch_rec.py でそのまま取れた）

## Tools
- tools/spectral.py: MP3 → 曲データ（--ts で src/songs/*.ts）。--preview でアドオンと同じ tick 規則の試聴 WAV/MP3。既定はアナリシス v2（部分音のトラック → 声部、ノイズ帯域と打撃音の帯域を NSIM-lite で合成して選ぶ）、`--analysis v1` で前の版
- tools/parity.py: web/core.js と tools/spectral.py の出力がバイト単位で同じかを試験曲すべてで確かめる
- tools/eval.py / tools/systems.py: 試験曲で方式を採点（ViSQOL ほか、corpus/results/）。tools/abx/make_abx.py: 聴き比べの音声と ABX ページ（dist/abx/）
- tools/rig/: 実機の測定リグ（programs.py → src/calib_programs.ts、analyze.py、synth.py、songpack.py、fetch_rec.py = 実行の録音を手元へ、collect.py・run_report.py = run の表、dropouts.py = 抜け、start_burst.py = 3D の録音の頭）。`python3 tests/test_rig.py` が解析を合成クライアントで試験する
- tools/live/: ライブ（encoder.mjs = ファイルをライブのフレームに / 曲に、bridge.mjs = Discord の声をプレイヤーの位置から 3D で、test_bridge.mjs）。web/live.js がその場の変換
- tools/exp/: クライアントの模型を通した実験（run_exp.py・score_pack.py・make_packs.py = 実機の run 用に前もって変換した曲・make_app.py = app.txt、
  `"batch": N` で 1 本の録音に N 曲（audio mark → audio stop が切り分け → audio analyze-all が並行して測る）・**batch_play.py = app の JSON の全曲を
  模型でまとめて「録音」と採点（実時間を待たない、推測: 9 回目で実機と相関 0.91、良い方の選び 12/13 一致）**）
- tools/emu/client.py: 命令列を、未知の挙動をパラメーター（spec.json）にしたクライアントの模型で鳴らす
- tools/make_rp_assets.py: rp/sounds と sound_definitions.json と src/assets.ts を作る
- web/: ブラウザ変換ページ（core.js は tools/spectral.py とバイト単位で同じ出力、tools/parity.py）。ゲーム内の音は web/game.js（ワーカー:
  web/build_engine.mjs が作る本体＋モックで命令を出し、実機の模型で音にする）。`python3 web/build.py <song.json> <demo.mp3> <addon.mcaddon>` → web/dist/index.html
- tools/sim/: 実際のバンドル bp/scripts/main.js を @minecraft/server のモックで tick ごとに動かし、SoundInstance への全命令を記録 → render_log.py でクライアントと同じ規則で音にする（デモ: 原曲との 1/3 オクターブ誤差 3.05 dB、オフライン試聴 3.04 dB とほぼ同じ）
