# Spectral Player — 実機の仕様（限界値の表）

統合版クライアントが SoundInstance をどう鳴らすかを、**本物のクライアントの録音**から測った値。**実測**と**仮定**（エミュレーター
tools/emu/client.py の既定）を列で分け、実測の出どころ（run の番号・解析）を行ごとに書く。

## 測った端末と録り方

| | |
|---|---|
| クライアント | redroid（コンテナの Android 14 x86_64、MindTheGapps）に Play が入れた **Minecraft 1.26.60.4**（改造なし）。platformType は Mobile |
| サーバー | GitHub Actions のランナー上の BDS 1.26.60.6（1.26.60.4 の配布なし）＋ Spectral Player、LAN で参加 |
| 録音 | scrcpy 3.1 `--audio-source=output`（AudioPlaybackCapture）、raw 48 kHz 16 bit ステレオ。Android のミキサーは 44.1 kHz |
| 操作 | redroid では lab-pad の uinput コントローラーが Android の入力の一覧に出ない（/dev/input にノードを作っても）ので、シェルの長押し入力（app/lib/android.mjs の startPad） |
| 音量 | `audio volume`: Android のメディア音量 15/15、ゲームの audio_main 1・audio_music 0（BGM が録音に入らないように）。準備した端末の既定は 5/15・0.5・0.3（measured/device-audio-41065460620.json） |
| 数の出し方 | app.txt の `audio analyze`（tools/rig/analyze.py・score_song.py・emu_check.py）がジョブのログに `[spectral rig]` の行で出す。録音そのものは `audio export`（Opus にして tools/rig/rec_public.pem で暗号化、tools/rig/rec_decode.mjs で開く） |
| 集めたもの | measured/redroid-<run>.json（tools/rig/collect.py）、measured/summary.json（tools/rig/summary.py）、measured/calib-*.json、measured/device-audio-*.json、measured/traffic-*.json |

## 限界値（端末: 上の redroid の Android 14・Minecraft 1.26.60.4）

| 項目 | 実測 | 仮定（エミュレーターの既定） | 出どころ・注 |
|---|---|---|---|
| 同時に鳴る音の数 | **32**（29–33 が同時に聞こえ、超えた分は**静かなもの・古いものから消える**） | 制限なし | run 41076646541 の calib voices（WAV）、run 41068618513（Opus の写し）も 32–33 |
| fade の形 | **振幅で直線** | 振幅で直線 | 同 fade（10–50 ms の中点が直線の値） |
| fade の長さ | **指定どおり**（2 / 5 / 10 / 20 / 50 ms → 2.0 / 5.0 / 10.0 / 19.9 / 49.9 ms）、0 秒の fade は **0.8 ms** | 0 | 同 |
| setVolume / setPitch の効く時刻 | 同じ tick の pitch と volume は**同時**（差 0 ms、約 200 tick）。tick 間のばらつき **σ 7.3 ms** | 同時・ばらつき 0 | 同 timing を ±0.9 tick の窓で読み直し（Opus 192k の写し、measured/calib-41076646541-timing.json） |
| ワンショット（playSound）の遅れ | 同じ tick の SoundInstance の命令より **49.1 ms（σ 7.3）遅い**（約 1 tick）。実行の最初の 1 回はさらに ~100 ms（素材の読み込み） | 0 | 同（197 tick のすべて）。→ アドオンは打撃音を 1 tick 先に送る（e4ed470） |
| tick の長さ | 49.99–50.17 ms（プログラムごとの格子の傾き）、クリックの揺れ σ 4.7–6.3 ms | 50 ms | 同 grid |
| seekTo | ループ・ワンショットとも**一定のずれ**で着地（40.3 ms σ 6.0 / 46.9 ms σ 6.3）、波形は一致（相関 0.997–1.0） | — | 同 seek。σ 6 ms は 1760 Hz の周期（0.57 ms）の 10 倍: **seek で倍音の位相をそろえることはできない** |
| setPitch の周波数 | **0.12 セント以内**（0.01–10 倍） | 正確 | 同 pitch |
| setPitch の歪み | **出る周波数だけで決まる**（素材と倍率によらない）: 1.76 kHz は osc ×1・osc220 ×8 とも −37.5 dB、7.04 kHz は osc ×4・osc7040 ×1 とも −12.2 dB、1 オクターブで約 12 dB 増 | 理想のリサンプラ | 同。44.1 kHz のミキサーから 48 kHz の録音への線形補間の形 = **録る経路の性質**で setPitch のものではない。**音域別の元素材は効かない**（実測で分かった） |
| is3D false のステレオ | **左右を独立に鳴らせる**（分離 67 dB） | 左右そのまま | 同 stereo |
| ミキサー | 音量の和が素材の **5 倍まで平ら**、5 倍で −0.1 dB・7 倍で −1.0 dB。ゲームの出力は素材より約 30 dB 小さい | 1.0 でクリップ | 同 mixer、run 41068618513 の録音のレベル |
| カテゴリ（設定がすべて 1） | ui 0 dB・music 0 dB・record 0 dB | 0 dB | 同 |
| メディアの音量 | 録音（AudioPlaybackCapture）には**効かない**。ゲームの audio_main は効く（0.5 → 1 で +6 dB） | — | run 41065460620・41068618513 |
| 録る経路 | 天井の録音は元と時間のずれ 0 ms・0 ppm・途切れなし、1/3 オクターブで 1–3 dB 以内（14 kHz まで） | — | run 41060263629・41068618513 の天井 |
| 1 tick に届く命令 | 16 命令は **1.4 ms 以内**に同時に効く。32 / 128 命令は一部が次のフレーム（spread 72 / 50 ms）。聞こえるのは同時発音数まで（30–31） | 全部同時 | 同 throughput |
| 1 命令あたりの通信量 | **quality 12.3 B**・light 17.0 B（1 回のパケットにまとまる命令が少ないほど圧縮が効かない）。1 呼び出し ≈ 1 パケット | — | measured/traffic-local-bds-2026-10-30.json（ローカルの本物の BDS 1.26.61.1 とプロトコルクライアント、3 回: quality +10.4 KB/s・light +6.9 KB/s、待機 67.2 KB/s ± 0.1） |
| 命令の数（1 リスナー、デモ） | 48 声: **43.2/tick**（最大 93）・電話の既定 24 声: **27.9/tick**（最大 52）・軽量: **20.3/tick**（最大 24） | — | ローカルの本物の BDS 1.26.61.1 の /spectral:status（スクリプト 1.62 / 0.98 / 0.98 ms/tick） |

## 曲の成績（実測: 実機の録音の ViSQOL v3）

SONGS_TABLE

天井 = 元の抜粋を OGG q8 のまま同じクライアント・同じ録音で鳴らしたもの（測定のその場で作る別のユニット、出荷する RP には入れない）。
音量を整える前の 2 回（run 41055135707・41060263629）は約 39 dB 小さく録れていたので並べない。

## 実測から分かったこと（設計に効くもの）

1. **同時発音数 32**: quality の 56 本（48 声＋ノイズ 8）と打撃音は上限を超え、静かな声が tick ごとに消えたり戻ったりする。24 声
   （＋ノイズ 8 = 32）にすると実機で 4 曲とも上がった（+0.17〜+0.52）→ **電話（platformType Mobile）は既定 24 声**（src/main.ts の
   CLIENT_SOUNDS。測っていない端末は今までどおり）。
2. **ワンショットは命令より 1 tick 遅い**: 打撃音が声より約 49 ms 遅れ、立ち上がりの合致率が低かった（ドラム 0.13）→ **打撃音を
   1 tick 先に送る**（エミュレーターでロック・ファンク +0.27）。
3. **変換器の癖**（エミュレーターでも同じ）: 13 曲の中央値で 28 Hz −6.2 dB・18 kHz −3.3 dB、曲によって 1–3 kHz が +5〜+17 dB
   （ドラム・ロック・EDM・ファンク）、最低域が −11〜−17 dB（ロック・ファンク・話し声）。measured/converter-band-bias-emulated.json。
4. **エミュレーターと実録音は合っていない**: 実測の spec を入れても ViSQOL 1.4–2.7（基準 4.5 に届かない）。録る経路の雑音
   （−30 dB で鳴るゲームの音を 16 bit で録る量子化、44.1→48 kHz の補間）と、同時発音数を超えた声の出入りが模型に無い。
