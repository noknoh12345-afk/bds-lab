# Spectral Player — 実機の仕様（限界値の表）

統合版クライアントが SoundInstance をどう鳴らすかを、本物のクライアントの録音から測った値。**実測**と**仮定**（エミュレーター
tools/emu/client.py の既定）を列で分ける。実測の出どころ（run の番号・解析）は各行に書く。

## 測った端末と録り方

| | |
|---|---|
| クライアント | redroid（コンテナの Android 14 x86_64、MindTheGapps）に Play が入れた Minecraft 1.26.60.4（改造なし） |
| サーバー | GitHub Actions のランナー上の BDS 1.26.60.6（1.26.60.4 は配布なし）、アドオン Spectral Player、LAN で参加 |
| 録音 | scrcpy 3.1 `--audio-source=output`（AudioPlaybackCapture）、raw 48 kHz 16 bit ステレオ。Android のミキサーは 44.1 kHz |
| 操作 | redroid では lab-pad の uinput コントローラーが Android から見えない（/dev/input にノードを作っても）ので、シェルの長押し入力（app/lib/android.mjs） |
| 音量 | `audio volume`: Android のメディア音量 15/15、ゲームの audio_main 1・audio_music 0（BGM が録音に入らないように）。準備した端末の既定は 5/15・0.5・0.3 |
| 数の出し方 | app.txt の `audio analyze`（tools/rig/analyze.py・score_song.py・emu_check.py）がジョブのログに `[spectral rig]` の行で出す。録音そのものは `audio export`（Opus にして tools/rig/rec_public.pem で暗号化、tools/rig/rec_decode.mjs で開く） |
| 集めたもの | measured/redroid-<run>.json（tools/rig/collect.py）、measured/calib-*.json、measured/device-audio-*.json、measured/traffic-*.json |

## 限界値

| 項目 | 実測 | 仮定（エミュレーターの既定） | 出どころ・注 |
|---|---|---|---|
| 同時に鳴るボイスの数 | **約 32**（29–33 が同時に聞こえ、超えた分は静かなもの・古いものから消える） | 制限なし | run 41068618513 の calib voices（Opus 96k の写しから）。WAV での値は run 41076646541 |
| fade の形 | **振幅で直線** | 振幅で直線 | 同上 fade（10 ms・20 ms の中点が直線の値） |
| fade の最短 | **0.8 ms**（0 秒の fade）。2 / 5 / 10 / 20 ms は 2.1 / 5.1 / 10.0 / 20.2 ms で指定どおり | 0 | 同上 |
| setVolume / setPitch の効く時刻 | クリックの格子から平均 **+3.7 ms**、ばらつき **σ 18.6 ms**（p5 −15 ms・p95 +30 ms）。同じ tick の pitch と volume は ±8 ms で一緒 | 0 ms・ばらつき 0 | 同上 timing（n = 167） |
| tick の長さ | 49.99–50.17 ms（プログラムごとの格子の傾き）、ワンショットのクリックの揺れ σ 4–10 ms、実行の最初の 1 回だけ ~100 ms 遅れる（素材の読み込み） | 50 ms | 同上 grid |
| seekTo | ループ・ワンショットとも**一定のずれ**で着地（平均 46.5 / 44.4 ms、σ 4.7 / 5.5 ms）、波形は一致（相関 0.997–1.0）。0 秒への seek のワンショット 1 回は見つからず | — | 同上 seek |
| setPitch の周波数 | **0.3 セント以内**（0.01–2 倍、17.6 Hz–3.5 kHz） | 正確 | 同上 pitch |
| setPitch の歪み（1760 Hz のループ） | 2 倍まで −46 dB 以下（0.01: −46.5、0.1: −46.3、0.5: −60.3、1: −67.0、2: −61.3）。4 / 6 / 8 / 10 倍で −12 / −3 / +5 / +14 dB | 理想のリサンプラ | 同上（Opus の写しからなので 7 kHz 以上は符号化の影響を除けない。WAV の値で確かめる） |
| is3D false のステレオ | **左右を独立に鳴らせる**（分離 67 dB） | 左右そのまま | 同上 stereo |
| ミキサー | **直線**（音量の和が素材の 7 倍まで歪み・リミッター・圧縮なし。ゲームの出力は素材より約 30 dB 小さい） | 1.0 でクリップ | 同上 mixer、run 41068618513 の録音のレベル |
| カテゴリ（設定がすべて 1 のとき） | ui 0 dB・music 0 dB・record −0.1 dB | 0 dB | 同上 |
| メディアの音量 | 録音（AudioPlaybackCapture）には**効かない**。ゲームの audio_main は効く（0.5 → 1 で +6 dB） | — | measured/device-audio-41065460620.json と run 41068618513 |
| 録音の経路 | 天井の録音は元と時間のずれ 0 ms・0 ppm・途切れなし、1/3 オクターブで 1–3 dB 以内（14 kHz まで） | — | run 41060263629・41068618513 の天井 |
| 1 tick に届く命令 | 16 命令は 1.5 ms 以内に同時に効く。32 / 128 命令ではその一部が次のフレーム（spread 49.5 / 72.7 ms）。聞こえたのは同時発音数まで | 全部同時 | 同上 throughput |
| 1 命令あたりの通信量 | **quality 12.3 B**・light 17.0 B（バッチが小さいほど圧縮が効かない）。1 呼び出し ≈ 1 パケット | — | measured/traffic-local-bds-2026-10-30.json（ローカルの本物の BDS 1.26.61.1 とプロトコルクライアント、3 回: quality +10.4 KB/s・light +6.9 KB/s） |

## 曲の成績（実測: 実機の録音の ViSQOL v3）

measured/redroid-41068618513.json（7 曲）と measured/redroid-41076646541.json（6 曲）。天井 = 元の抜粋を OGG q8 のまま同じ
クライアント・同じ録音で鳴らしたもの。表は 2 回目の結果で埋める。

## 実測から分かったこと（設計に効くもの）

1. 同時発音数が約 32 なので、quality の 56 本（48 声＋ノイズ 8）と打撃音は上限を超え、静かな声が tick ごとに消えたり戻ったりする。
2. 変換器の癖（エミュレーターでも同じ）: 60 Hz 以下が 10–16 dB 足りず、1–4 kHz が 5–9 dB 多い。
3. 高い音程（1760 Hz のループの 4 倍以上）で実機だけの成分（5.7 kHz・18 kHz の山）。WAV で確かめてから、音域別の元素材へ。
