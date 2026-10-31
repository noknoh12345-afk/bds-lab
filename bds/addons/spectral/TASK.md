# Spectral Player

## Request
マイクラ統合版でフーリエ変換して正弦波で再生してみた、という作品がある。bds-lab を使い、統合版の限界を攻めて、極限まで可能性を持たせた動的再生 MP3 アドオンを作る。

## 使い方（遊ぶ人へ）
1. **本体**: `Spectral_Player.mcaddon`（bds-lab の dist/、変換ページの「本体アドオンを保存」）を開き、ワールドでビヘイビアーパックと
   リソースパックを有効に（実験的な機能は要らない）。サーバーなら `node lab.mjs deploy <BDS のフォルダ>`。版は 1.1.0（同じ UUID のまま上げたので、前の版を入れていても更新として入る）
2. **曲**: 変換ページ（web/dist/index.html。claude.ai の Spectral Converter）に MP3 などを落とす → 「ゲーム内の音」で試聴 →
   「曲パックを保存」→ 末尾の .zip を消した .mcpack を開き、ワールドで本体と一緒に有効に。手元なら `python3 tools/spectral.py <曲> --ts`
3. **ゲームで**: 最初に配られるスペクトル・リモコンか `/spectral:menu`。`/spectral:play <曲> phones|speaker`（ヘッドホン: 自分に付いてくる／
   スピーカー: その場から 3D で近くの全員に）・`/spectral:stop`。速度（音程そのまま・逆再生）・移調・EQ・音量・声の数は鳴らしながら
4. **ライブ（近接ボイスチャット・立体音響）**: `/spectral:live` が流れている声の一覧。Discord のボイスチャンネルの声を、つないだ
   プレイヤーの位置から 3D で（近づくと大きく、向きで左右、その人に付いて動く）: tools/live/README.md の bridge.mjs。
   試し: `/spectral:live_demo demo near`（その場に置いて、近くの人それぞれが 3D で聞く）・`/spectral:live_demo demo follow <誰>`（その人から:
   本人には聞こえない）
5. **電話**は同時に 32 音しか鳴らない（実測）ので自動で 24 声＋ノイズ 8、ファイルより 6 dB 大きく。Realms や人が多いときは
   `/spectral:mode light`（16 声・1 人 1 tick 24 命令まで）

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
- [x] 電話は実測の同時発音数（32）に収まる声の数が既定、打撃音（ワンショット）は既定で鳴らさない（同じ run の実測で打撃音なしが上）、どの音もファイルより 6 dB 大きく（## a phone gets as many sounds as its client plays at once (32, measured): 24 voices beside the 8 noise bands, no drum bursts (measured: better without), and every level 6 dB over the files (the phone plays them 32.5 dB under, into 16 bits)）
- [x] ファイルより大きく鳴らす: ゲームはどの音もファイルより 32.5 dB 小さく 16 bit で鳴らすので、静かな曲の下限は量子化（## louder than the files: a level in dB, by setVolume or by the loud sound events (the game plays every sound 32.5 dB under its file)）
- [x] 変換器が tick ごとに選んだ長さのフェードで声とノイズ帯域を鳴らす（## a song with fitted fades (tools/spectral.py nz_fade, v_fade): each voice and noise band fades as long as the converter chose, tick by tick）
- [x] ライブ: 声（ボイスチャット・マイク）をその場で受け取り、届いた順に鳴らす。script event `spectral:live`、ジッターバッファ 2 tick、届かなかったフレームは数えて埋める、送り手が始め直したら新しいストリーム、終わり（## a live stream plays while its frames arrive (spectral:live script events from the console, a jitter buffer of 2 ticks), starts again when its sender does, and ends）
- [x] ライブの道で曲を 1 フレームずつ送る（ボイスチャットの橋渡しと同じ形）: ヘッドホンに、そして歩く人から 3D で（音がその人に付いて動く・48 ブロック以内の人それぞれに・話す本人には聞こえない・いなくなった人の声は誰にも聞こえない: 近接ボイスチャット・立体音響）（## a song sent as a live stream frame by frame, as a voice chat bridge sends one: on headphones, then in 3D from a player who walks (the sound moves with them, the talker does not hear their own voice, nobody hears a talker who left)）

## Guessed
<!-- values decided without asking -->
- 正弦波の元音: 1760 Hz（setPitch 0.01–10 で 17.6 Hz–17.6 kHz を 1 本で覆う）
- 既定のボイス数: 曲データの数（変換時 48）、/spectral:voices で 1–128。ただし電話（platformType Mobile）は実測の同時発音数 32 − ノイズ 8 = 24（SPEC.md。測っていないデスクトップ・コンソールは今までどおり）
- 電話の既定のレベル +6 dB（setVolume）: 実測のクリップ（ファイル単位で約 2.0）の下に試験曲の一番大きいところが収まる値。+8・+10 dB はエミュレーターの ViSQOL では少し上だが、話し声とピアノの山がクリップする（SPEC.md、tools/exp/README.md）。/spectral:level で 0–18 dB
- ヘッドホンは category ui・is3D false（範囲制限なしで本人に付いてくる）、スピーカーは category record・3D・max_distance 48
- 打撃音: 低/中/高の 3 帯域 × 先頭無音 0/12.5/25/37.5 ms の 4 ファイル
- デモ曲は自作の合成曲（第三者の素材なし）: tools/make_demo_song.py
- ライブ: 1 フレーム = 50 ms、届いた最新の 2 tick 後ろを鳴らす（100 ms のジッターバッファ）、8 tick より遅れたら先へ飛ぶ、4 tick 何も来なければ黙る。3D で人に付いていくときは 1.5 ブロック動いたら 1 tick に 8 音ずつ、1 tick のクロスフェードで移す（SoundInstance は場所を変えられないため）
- ボイスチャットの橋渡し（tools/live/bridge.mjs）の既定は 1 人 16 声＋ノイズ 8（2 人が同時に話しても電話の 32 音にほぼ収まる）。Discord で /mc <ゲーマータグ> とつないだ人だけをゲームで鳴らす
- 文の切れ目: 120 ms 声が来なければ橋渡しが無音を 2 フレーム送る。アドオンは 4 tick 何も来なかったあとのフレームをひと続きの始まりとし、その最初のフレームから鳴らす。番号 0 のフレームにメタがあれば新しいストリーム（送り手の始め直し）

## Measured on this BDS (1.26.61.1, real clients)
- `/scriptevent` の本文は 2048 文字まで（それを超えると "Message length exceeds (2048) character limit!"）。`system.sendScriptEvent` はスクリプト間なら 8,388,608 文字でも届いた
- 別のビヘイビアーパック（曲パック）からの script event は本体に届く（LAB_UTILITIES で 2 パック同時に確認）
- 1 人ヘッドホン再生: 56 インスタンス、平均 16–30 命令/tick（最大 89）、スクリプト 1.5–1.8 ms/tick。QA（3 人・再接続・/reload・再起動）で 2 ms/tick 以内

## この版の状態（2026-10-31 4 回目のセッション、版 1.1.0、実機での測定）

引き継ぎ: HANDOFF.md。実機の限界値と曲の成績: SPEC.md（実測と推測を分けた）、数の元: measured/。
- 実機（redroid の Android 14 に Play が入れた Minecraft 1.26.60.4、改造なし）で録って測った: 同時発音数 32、fade は振幅で直線・指定どおり、
  ゲームは 24 kHz で混ぜて素材より −32.5 dB・16 bit、setVolume は 2 まで指定どおりでその上はクリップ、seekTo は一定のずれ（σ 6 ms）、
  **3D の音は左右がはっきり分かれる**（6 ブロック左で +37 dB・右で −46 dB）
- 変換器の既定: 合成による分析（変換の中で実機の模型を通して tick ごとの音量とフェードを選ぶ）を、帯域を ViSQOL の MOS が頼る重さで、
  5 回、音量を保って。py と js はバイト一致
- **実機の ViSQOL（9 回目 run 41187515049、13 曲、同じ run の中で）: 新しい既定 中央値 2.91、8 回目の既定より 11/13 で上（差の中央値 +0.09・
  平均 +0.14）**。天井（1–2 回目の run、目安）から 0.3 以内 9/13。run をまたぐと同じデータで 0.7 動くことがある（デモ）ので、比べるのは
  同じ run の中だけ。`node lab.mjs go`（ローカルの BDS 1.26.61.1）: **DONE dist/Spectral_Player.mcaddon（test 149/149, qa clean）**
- **11 回目（run 41200540880、実測、まとめ録り）: 同じ変換を +10 dB で詰めて +10 dB で鳴らすと 10/13 で上（中央値 +0.11）、同じ run の
  天井から 0.3 以内 12/13**（+6 dB は 10/13）。既定はまだ +6 dB（変えるかは HANDOFF.md の次にやること）
- ライブ: 声などを 50 ms ずつその場で受け取って鳴らす（script event spectral:live）。ヘッドホン・3D スピーカー・その場に聞く人ごとの 3D（near）・
  動く人から 3D（follow: 近接ボイスチャット）。実機でライブの道は曲として鳴らすのと同じ質（2.90 / 2.91）。web/live.js がその場の変換
  （実機で前もっての変換より 0.09–0.18 低い）、tools/live/bridge.mjs が Discord のボイスチャンネルをつなぐ（tools/live/README.md）
- 録音: 実行の成果物の public/spectral/rec/ に平文の Opus（鍵なし）。管理パネルでサインインして聞ける、notify.yml が Discord に送る
  （9 回目の 32 本を tools/rig/fetch_rec.py でそのまま取れた）

## Tools
- tools/spectral.py: MP3 → 曲データ（--ts で src/songs/*.ts）。--preview でアドオンと同じ tick 規則の試聴 WAV/MP3。既定はアナリシス v2（部分音のトラック → 声部、ノイズ帯域と打撃音の帯域を NSIM-lite で合成して選ぶ）、`--analysis v1` で前の版
- tools/parity.py: web/core.js と tools/spectral.py の出力がバイト単位で同じかを試験曲すべてで確かめる
- tools/eval.py / tools/systems.py: 試験曲で方式を採点（ViSQOL ほか、corpus/results/）。tools/abx/make_abx.py: 聴き比べの音声と ABX ページ（dist/abx/）
- tools/rig/: 実機の測定リグ（programs.py → src/calib_programs.ts、analyze.py、synth.py、songpack.py、fetch_rec.py = 実行の録音を手元へ）。`python3 tests/test_rig.py` が解析を合成クライアントで試験する
- tools/live/: ライブ（encoder.mjs = ファイルをライブのフレームに / 曲に、bridge.mjs = Discord の声をプレイヤーの位置から 3D で、test_bridge.mjs）。web/live.js がその場の変換
- tools/exp/: クライアントの模型を通した実験（run_exp.py・score_pack.py・make_packs.py = 実機の run 用に前もって変換した曲・make_app.py = app.txt、
  `"batch": N` で 1 本の録音に N 曲（audio mark → audio stop が切り分け → audio analyze-all が並行して測る）・**batch_play.py = app の JSON の全曲を
  模型でまとめて「録音」と採点（実時間を待たない、推測: 9 回目で実機と相関 0.91、良い方の選び 12/13 一致）**）
- tools/emu/client.py: 命令列を、未知の挙動をパラメーター（spec.json）にしたクライアントの模型で鳴らす
- tools/make_rp_assets.py: rp/sounds と sound_definitions.json と src/assets.ts を作る
- web/: ブラウザ変換ページ（core.js は tools/spectral.py とバイト単位で同じ出力、tools/parity.py）。ゲーム内の音は web/game.js（ワーカー:
  web/build_engine.mjs が作る本体＋モックで命令を出し、実機の模型で音にする）。`python3 web/build.py <song.json> <demo.mp3> <addon.mcaddon>` → web/dist/index.html
- tools/sim/: 実際のバンドル bp/scripts/main.js を @minecraft/server のモックで tick ごとに動かし、SoundInstance への全命令を記録 → render_log.py でクライアントと同じ規則で音にする（デモ: 原曲との 1/3 オクターブ誤差 3.05 dB、オフライン試聴 3.04 dB とほぼ同じ）
