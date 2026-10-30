# Spectral Player

## Request
マイクラ統合版でフーリエ変換して正弦波で再生してみた、という作品がある。bds-lab を使い、統合版の限界を攻めて、極限まで可能性を持たせた動的再生 MP3 アドオンを作る。

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

## Guessed
<!-- values decided without asking -->
- 正弦波の元音: 1760 Hz（setPitch 0.01–10 で 17.6 Hz–17.6 kHz を 1 本で覆う）
- 既定のボイス数: 曲データの数（変換時 48）、/spectral:voices で 1–128
- ヘッドホンは category ui・is3D false（範囲制限なしで本人に付いてくる）、スピーカーは category record・3D・max_distance 48
- 打撃音: 低/中/高の 3 帯域 × 先頭無音 0/12.5/25/37.5 ms の 4 ファイル
- デモ曲は自作の合成曲（第三者の素材なし）: tools/make_demo_song.py

## Measured on this BDS (1.26.61.1, real clients)
- `/scriptevent` の本文は 2048 文字まで（それを超えると "Message length exceeds (2048) character limit!"）。`system.sendScriptEvent` はスクリプト間なら 8,388,608 文字でも届いた
- 別のビヘイビアーパック（曲パック）からの script event は本体に届く（LAB_UTILITIES で 2 パック同時に確認）
- 1 人ヘッドホン再生: 56 インスタンス、平均 16–30 命令/tick（最大 89）、スクリプト 1.5–1.8 ms/tick。QA（3 人・再接続・/reload・再起動）で 2 ms/tick 以内

## この版の状態（2026-10-30, mp3 同等化の作業）

引き継ぎ（進み具合・数字の出どころ・失敗・次の手順・落とし穴）: HANDOFF.md。先頭の WIP コミット（軽量モードの予算にノイズ帯域を含める）は go 未実施。
- 変換器はアナリシス v2 が既定（tools/spectral.py と web/core.js、13 曲でバイト単位一致: `python3 tools/parity.py`、v1 も 13/13）。v1 は `--analysis v1`
- 追加したもの: /spectral:calib（tools/rig の較正プログラム）、/spectral:mode quality|light（命令の予算 = レート制御）、tools/rig（測定リグ）、tools/emu（較正できるクライアントの模型）、tools/metrics（ViSQOL v3 の移植ほか）、corpus/（試験曲 13 曲の出典）、tools/abx（聴き比べページ）
- `node lab.mjs go`: GitHub Actions の unit（run 41042008040）で **DONE dist/Spectral_Player.mcaddon（test 96/96, qa clean）**。tests.txt に 2 節を足した
- 数値はすべてエミュレーター上（SPEC.md）。実機の録音での測定は tools/rig を実機で回してから

## Tools
- tools/spectral.py: MP3 → 曲データ（--ts で src/songs/*.ts）。--preview でアドオンと同じ tick 規則の試聴 WAV/MP3。既定はアナリシス v2（部分音のトラック → 声部、ノイズ帯域と打撃音の帯域を NSIM-lite で合成して選ぶ）、`--analysis v1` で前の版
- tools/parity.py: web/core.js と tools/spectral.py の出力がバイト単位で同じかを試験曲すべてで確かめる
- tools/eval.py / tools/systems.py: 試験曲で方式を採点（ViSQOL ほか、corpus/results/）。tools/abx/make_abx.py: 聴き比べの音声と ABX ページ（dist/abx/）
- tools/rig/: 実機の測定リグ（programs.py → src/calib_programs.ts、analyze.py、synth.py、songpack.py）。`python3 tests/test_rig.py` が解析を合成クライアントで試験する
- tools/emu/client.py: 命令列を、未知の挙動をパラメーター（spec.json）にしたクライアントの模型で鳴らす
- tools/make_rp_assets.py: rp/sounds と sound_definitions.json と src/assets.ts を作る
- web/: ブラウザ変換ページ（core.js は tools/spectral.py とバイト単位で同じ出力）。`python3 web/build.py <song.json> <demo.mp3> <addon.mcaddon>`
- tools/sim/: 実際のバンドル bp/scripts/main.js を @minecraft/server のモックで tick ごとに動かし、SoundInstance への全命令を記録 → render_log.py でクライアントと同じ規則で音にする（デモ: 原曲との 1/3 オクターブ誤差 3.05 dB、オフライン試聴 3.04 dB とほぼ同じ）
