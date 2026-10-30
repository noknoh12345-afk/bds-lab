# 引き継ぎプロンプト（2026-10-31 07:00 JST、セッション切れの直前に作成）

あなたは前のセッションの続きをします。ユーザーの依頼は「さらに極限まで（元の MP3 と聴き分けられない所まで）近づける工夫をして、
これ以上できないレベルまでにして」。元の依頼・守ること・実機の手順は同じフォルダの HANDOFF.md と、引き継ぎ zip の
ORIGINAL_HANDOFF_PROMPT.md（最初の依頼の原文入り）を先に読むこと。進捗は節目ごとに日本語で短く報告する。

## 場所と状態
- リポジトリ noknoh12345-afk/bds-lab、ブランチ **addon/spectral**、ユニット bds/addons/spectral。最後のコミットは
  「spectral (WIP, go 未実施): …24 kHz の経路…」（このファイルと同じコミット）。push は addon/spectral にだけ（本人の許可済み）。
  main への push・PR はしない。.github / auto/policy.json / auto/STOP / .env に触れない。試験を弱めない。実測と推測を書き分ける。
- **このコミットは `node lab.mjs go` を通していない**（`node lab.mjs check spectral` と `node lab.mjs sim -a spectral` は通過）。
  最初に `node lab.mjs go`（bds/vendor/bedrock-server.zip はコミットしない: zip はリポジトリの外に置き LAB_BDS_ZIP で指す。
  check が bds/vendor/bds-version.txt を書き換えたら `git checkout -- bds/vendor/bds-version.txt`）
- **実験の道具はリポジトリに入った**: tools/exp/（README.md・run_exp.py・summ.py・make_app.py ほか、パスはユニットからの相対）。
  これまでの結果は tools/exp/results/（b1 = アドオンの鳴らし方、b2 = 変換器の選択肢、val1 = エミュ対実機、ceiling_* = 経路だけ）
- **zip から戻すもの**（新しいセッションで最初に）:
  1. `git fetch origin addon/spectral && git checkout addon/spectral`（無ければ zip の repo/addon-spectral.bundle から:
     `git fetch <zip>/repo/addon-spectral.bundle HEAD:addon/spectral`）
  2. zip の recAll/*.opus → `bds/addons/spectral/corpus/renders/rec/`（実機の録音、run A–D、復号済み。gitignore 済み）
  3. zip の exp_cache/*.song.json → `bds/addons/spectral/corpus/renders/exp/cache/`（変換済みの曲。今のコードと同じ鍵なので
     変換 14 秒/曲を飛ばせる）
  4. 試験曲の元（corpus/audio）は `python3 tools/corpus.py`（取り直し、sha256 で確認）。BDS は go が取ってくる
     （取れなければ bds/vendor に置かず LAB_BDS_ZIP で指す）
  5. 秘密鍵は入れていない。新しい録音を出すときは HANDOFF.md の手順で鍵を作り直し、tools/rig/rec_public.pem を入れ替える
     （古い run のログは `gh api repos/noknoh12345-afk/bds-lab/actions/jobs/<job>/logs` で取り直せるが、開くには前の鍵が要る。
     復号済みの録音は recAll にある）

## このセッションで分かったこと（すべて実測から）
1. **録る経路 = ゲームが 24 kHz で混ぜている**。較正の録音で 7040 Hz の音に 16960 Hz の像（−12.2 dB）、10560→13440（−3.2）、
   14080 Hz は 9920 Hz に（+4.8 dB）、17600→6400（+14.1）: すべて 24 kHz − f。各音を 24 kHz で直線補間で読み（折り返し止めなし）、
   −32.5 dB・16 bit、2 倍の直線補間で 48 kHz。tools/emu/spec.json に mix_sr 24000・out_up linear・out_gain_db −32.5・out_bits 16（実測）。
   tools/emu/client.py の `render(..., path=True)` / `client_path()`。元の曲だけをこの経路に通すと 13 曲の天井（実機）を ViSQOL で
   平均 0.06 の差で当てる（tools/rig/path_check.py。まだ一度も repo の版で走らせていない: 走らせて measured/ に保存）。
   **天井 3.09 はほぼこの折り返しのせい**（量子化ではない）。前の「44.1→48 kHz の補間」の説明は誤り（SPEC.md の該当行は直した）
2. **エミュレーター＋経路は実機を当てる**: 4 設定×13 曲で相関 0.87–0.97、平均の誤差 0.17–0.34（measured/emu-validation-2026-10-31.json）。
   声の上限 32 で消える声は「エネルギー（音量×素材の RMS）が小さい順」の方が合う（spec.json voice_rank energy）
3. **打撃音（ワンショット）の時刻**: 曲の録音では同じ tick に送った打撃音が声より中央値 45 ms **早い**（run 41083086951）。出荷版は
   さらに 1 tick 先に送るのでロック −81 ms・ファンク −64 ms（tools/rig/burst_timing.py）。較正の「49 ms 遅い」と逆で、場面で変わる。
   エミュレーターで oneshot_latency_ms −45 にすると実機に近づく（ロック 3.01→2.64、実測 1.98）が、まだ楽観的。軽量（打撃音なし）が
   実機で一番良かった理由の大半はこれと見ている
4. エミュレーター（−45 ms、24 声、13 曲、ViSQOL 中央値）: 出荷 2.345 / **打撃音なし 2.478（7/13 勝ち）** / ノイズ帯域の立ち上がりで代用
   （drums noise）2.498（5/13）/ 12 kHz 超を止めて鳴らさない声をノイズに足す（hf+fold）2.303（**悪化**、合唱 −0.41）→ hf と fold は既定にしない
5. **変換器の改良（8 曲、打撃音なし・24 声、途中まで）**: `residual='voiced'`（声にしなかったピークのエネルギーをノイズに残す）が
   中央値の差 **+0.135・7/8 勝ち**（ロック +0.26、オーケストラ +0.30、EDM +0.15、星 +0.15、合唱 +0.12、ファンク −0.05）。
   `residual='fit'`（ERB 32 帯域で最小二乗）は 2 曲で +0.075、`salience='erb'`・`nested` は未評価（実験の途中で切れた）
6. ViSQOL の帯域ごとの損失（星）: 5.7–11.8 kHz が最大（0.3–0.48）、次に 50 Hz（0.34）、中域 0.14–0.29

## コードの変更（このコミット、既定は出荷版のまま = 実機の A/B 用に切り替えられる）
- src/main.ts: `/spectral:engine <hf> <fold> <sounds> [budget]`（12 kHz 超の扱い・畳み込み・同時発音数の予算・命令の予算）、
  `/spectral:drums ahead|tick|behind|noise|off`（打撃音を 1 tick 先 / その tick / 1 tick 後 / ノイズ帯域の立ち上がり / なし）、
  status に engine と drums。CLIENTS（Mobile: sounds 32、mixHz 0、fold false、limit false = 今までどおり）。既定の動きは出荷版と同じ
  （モックで命令列がバイト一致を確認）。tests.txt に「the client's sound engine and the drum attacks can be set」の節（sim は通過）
- tools/spectral.py convert(): `residual='all'|'voiced'|'fit'`、`salience='a'|'erb'`、`nested`・`hf`（最初の n 声は hf 未満の
  トラックから）、`burst_tilt`、`noise_edges`。既定は今までどおり。web/core.js に同じもの（residual voiced/fit、salience erb、nested）を
  移植済みだが **パリティ未確認**: `python3 tools/parity.py --opts '{"residual":"voiced"}'` 等で 13 曲バイト一致を確かめる
- tools/rig/songpack.py: `--parts a,b,c`（並行で変換）・`--opts JSON`・`--suffix`。app/lib/scenario.mjs の `audio song <曲>[,<曲>…]
  [suffix=_a] [residual=all …]`（同じ run で旧データと新データを送れる）。app/lib/audiorec.mjs の audio info にゲームのトラックの
  サンプルレート（tracks）
- tools/sim/run_song.mjs: `--voices N --bundle <js> --out <log> --cmd '<命令>'`。tools/rig/collect.py / summary.py に新しい接頭辞
  （a=出荷版を同じ run で、b=改良版、x=改良版＋打撃音 1 tick 後、y=ノイズで打撃、z=別案）

## 次にやること（順に）
1. `node lab.mjs go` を通す。parity（既定と voiced）を確かめる
2. `tools/exp/batch_next.sh`（13 曲: 出荷・voiced/fit＋打撃音なし・voiced＋drums noise/behind・命令の予算 24・軽量）を走らせ、
   `python3 tools/exp/summ.py tools/exp/results/next.jsonl` で比べる。次にノイズの分割を細かくする案（tools/exp/make_layout.py:
   `SRCBASE=src python3 make_layout.py nzB '[180,360,720,1440,2880,4000,5000,6300,8000,10000,12000,17000]'` → bundles に
   build_exp.mjs で src_nzB/main.ts、変換器は conv の noise_edges、rp は rp_nzB、声 21）と nested。1 件 ~25 秒、2 並列
3. 勝った組み合わせを既定に（変換器の既定と web/core.js、電話の CLIENTS）。tests.txt の電話の節も合わせる。go → push
4. **実機で同じ run の A/B**（redroid.yml, addon spectral, mode run。app.yml が走っていないことを確かめてから）:
   tools/exp/make_app.py で app.txt を作る。A = 出荷版（`audio song … suffix=_a residual=all salience=a`、`spectral:voices 24`・
   `spectral:drums ahead`・`spectral:engine 0 false 0 0`）13 曲、B = 改良版 13 曲（打撃音なし）、C = 改良版＋`drums behind`（打撃音の
   ある 8 曲: demo drums edm funk gymnopedie rock speech_ja vocal_stars）。app run の上限は 40 分（app/redroid/game.mjs）: 34 曲で
   約 36 分。録音の受け取りは HANDOFF.md（鍵を作り直してから）
5. 結果を measured/ に（collect.py → summary.py）、SPEC.md（表と寄与）・TASK.md・HANDOFF.md を更新、実録音の ABX ページ
   （tools/abx/make_abx_real.py、--b に新しい接頭辞を足す。前の artifact は https://claude.ai/artifact/WqeA3C2ut45LtzVhhjxpqG、
   同じファイル名で出し直すと同じ URL）

## 落とし穴（このセッションで踏んだもの）
- `pgrep -f`/`pkill -f` のパターンが自分のシェルに当たる（待ちが永遠に回る・exit 144）: パターンを自分のコマンドに含めない
- Bash の `&` で起こしたものはターンの後で止まる: 長い実験は run_in_background で
- `grep -v` をパイプに挟むと結果がバッファされて見えない: `--line-buffered`
- tools/sim/.gitignore には `log_*.json` が要る（消すと log_calib_all.json が未追跡で出る）
- ViSQOL 1 回 ~16 秒・変換 1 曲 ~14 秒。scratch/cache は 1.7 GB（zip に入れていない、作り直せる）
