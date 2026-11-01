# 引き継ぎ: Spectral Player（2026-11-01、5 回目のセッション。4 回目の記録も下に）

依頼の原文は引き継ぎ zip の ORIGINAL_HANDOFF_PROMPT.md。要点: 判定は**実クライアントの録音だけ**。天井 = 元曲 → OGG を同じ
クライアント/録音系で鳴らしたもの。ViSQOL v3 audio 48 kHz で各曲が天井から 0.3 MOS 以内、中央値も報告。補助指標
（多解像度 STFT・1/3 oct 誤差・オンセット ms）。最後はブラウザの ABX。10 曲以上、自作/CC0/CC-BY のみ。
守ること: 改造なしのクライアントで再生／@minecraft/server 安定版優先／RP は曲非依存・50 MB 以内／曲データ ≤128 kbps／
1 リスナーあたりの命令数と通信量を実測、軽量モードを残す／QA の性能基準を下げない・試験を弱めない／.github・auto/policy.json・
auto/STOP・.env に触れない／既存機能を壊さない／**実測と推測をはっきり分ける**／push は addon/spectral にだけ（main への push・PR はしない）／
Actions は unit.yml（job go）と redroid.yml（addon spectral, mode run）。redroid は app.yml が走っている間は待つ。
進捗は節目ごとに日本語で短く報告する。

## ユーザーの依頼（原文）

- 5 回目（2026-11-01 11:17 JST）: 「続き」（4 回目の最後の報告を貼って: 12 回目を集めて、電話のレベルと 3D の届く距離を決める）
- 5 回目 16:00〜: 「続き」（15:34 の予約）、16:52「21:00に続き」、17:03「それまで進めて」、19:57（MP3 を添えて）「21:10に続きと進捗zip+mp3変換して」
  → 予約は 21:10、進捗 zip と、その MP3 の曲パック（ユーザーの手元の曲なのでリポジトリには入れない）をこの会話で渡した
- 5 回目 12:08: 「検証中すぐに結果discordに送ってwebhookしてるアカウントの権限を見てみれるかどうかしてみれたら生のやつ送って。あと検証に使ったアドオンを
  常に送るようにしてすぐに今どんな進捗か確認できるようにしてほしい僕も試してみたいから」
- 4 回目（2026-10-31）: 「セッション切れて続きがないけど続きをして」（3 回目のセッションの続き: 掃き出し 5 回・音量の癖）
- 「さらに完璧にしてmp3として完成させてdiscrodの音声を反映する近接vcとかも作れるほどのクオリティにしてちゃんと立体音響みたいなやつも出来るぐらいのmodクオリティにして」
- 「質問無しでそのまま完成させて」「pushを許可するGitHub関連許可」
- 前からの続き（2 回目の終わり）: 録音を Discord にも／bds-lab の web で鍵なし・アカウントでログインしていれば見える／さらに改善して完成／
  web のゲーム音声と連動させて完全な mp3 を再現（3 回目: 合成による分析で済み）

「質問無しで」なので、前のセッションが聞いて答えのなかった 3 つはこう決めた: Discord は今の通知（notify.yml の DM）に録音を
続けて送る／web は録音を成果物の public/ に平文で置く（GitHub にログインしていれば管理パネルで聞ける。中身はゲームの音だけ）／
電話のレベルは +6 dB のまま（エミュレーターで +8 / +10 をもう一度確かめる: 下の「次にやること」）。.github は変えていない。

## 5 回目のセッション（2026-11-01）でしたこと

1. **12 回目（run 41205071937）を集めた**（43 本、実測。表と注は SPEC.md の 12 回目）: +10 dB は +6 dB より 10/13 で上（中央値 +0.06・平均 +0.16）、
   +8 dB は間（+6 dB より中央値 +0.06、+10 dB に勝ったのは 4 曲、話し声と歌を救うことはなかった）。11 回目と合わせて 2 回とも 10/13 で上
2. **本体 1.2.0**（同じ UUID）:
   - 電話の既定のレベルを **+10 dB** に（src/main.ts CLIENTS）。変換器の実機の模型も +10 dB（tools/spectral.py と web/core.js の CL_LEVEL_DB、
     parity 2/2 でバイト一致）。デモ曲を作り直した。前に +6 dB 向けに変換した曲を +10 dB で鳴らしても良くなる（エミュレーター、推測:
     中央値 3.33 → 3.45、9/13 で上。+10 dB 向けに変換した曲は 3.46）
   - **3D の届く距離**（実測、11・12 回目）: 距離が倍で 6 dB 下がり（定義の min_distance 3 から、1.5 dB 以内）、聞こえるのは 16 ブロック × 作る音量まで
     （音量を上げても大きくはならない）。RANGE_3D を **3（48 ブロック = FOLLOW_RANGE）** に、follow / near で音を作るのは reach3D() の内の人だけ
     （`/spectral:range` の返事に届く距離）
   - **3D の音の頭の「ピッ」を直した**: 9–12 回目のどの 3D の録音も、話し声の前に約 100 ms の 1760 Hz（−35〜−47 dB、話し声より 18–32 dB 大きい）と
     約 100 ms のノイズ帯域から始まっていた（tools/rig/start_burst.py）。3D の音は届く距離のために音量 RANGE_3D で作り同じ tick に無音にしていたが、
     作った直後は作ったときの音量と高さで鳴る。→ 3D の音は**高さ P_MIN（17.6 Hz）で作り**、SETTLE_TICKS（2）後に状態を送り直す（LivePlayer.settle、
     Session.build）。ライブのノイズ帯域の高さ 1 は resync で。follow で動いたときの作り直しは、新しい音を作ってすぐ命令を送り、古い音は
     2 tick 鳴らしたままにしてから新しい音に状態を送り直し、古い音を 1 tick で消す（handover）
   - 試験: 電話の節を +10 dB に、3D の節（range 1 で近くの 1 人だけ・20 ブロック離れると 0 人・range 3 で 3 人）。go: **test 156/156, qa clean**
3. **13 回目の実機**（tools/exp/app13.json → app.txt、**run 41266897044**、11:52 JST に始めた）: 1.2.0 で 3D の頭と届く距離（na_ 3 ブロック・
   nb_ 24・nc_ 46 を音量 3、nf_ 3 ブロックを音量 1、nd_ スピーカー 6 ブロック、ne_ スピーカー 52 ブロックを音量 4）、それから曲ごとに交互に
   d_（+6 dB 向けの曲を +6）・o_（同じ曲を +10 = 前に変換した曲が 1.2.0 で）・e_（+10 向けの曲を +10）。**集めた（実測、SPEC.md の 13 回目）**:
   - +10 dB は 3 回目も 9/13 で上（中央値 +0.12）。3 回の平均で 11/13 で上、3 回とも下は Name of Love だけ。**前に変換した曲も +10 dB で同じだけ上**
     （o_ − d_ 中央値 +0.10、e_ − o_ は −0.01: 変換器が詰めるレベルは効かない）
   - 3D の頭: **1760 Hz の「ピッ」は消えた**（500–2000 Hz が 24–39 dB 小さい）。代わりに 17.6 Hz の和の低い「トン」（60–250 Hz が −48〜−69 dB、約 0.1 秒）が
     残る: 3 ブロックで話し声と同じくらい、作った直後の音は距離で小さくならないので遠いほど目立つ
   - 届く距離: 音量 3 で 46 ブロックまで聞こえる（−53.7 dB）。音量 1 と 3 は同じ大きさ。音量 4 なら 52 ブロックでも聞こえる（定義の max_distance 48 は
     効かない、16 ブロック × 音量）
4. **14 回目の実機**（tools/exp/app14.json → app.txt、**run 41270487804**、12:46 JST に始めた、fffd551）: 3D のレベル（la_ / lb_ / lc_ = 3 ブロックで
   0 / +6 / +10 dB、ld_ / le_ / lf_ = 24 ブロック、lg_ / lh_ = 46 ブロックで 0 / +10）、曲のスピーカー（ls_）、名札の防具立てを話す人にした follow
   （mg_ 止まったまま、mf_ 0.5 秒ごとに 1 ブロック歩く = 1.2.0 の引き継ぎを実機で）。そのための変更: follow:<名前> はその名前のプレイヤーが
   いなければ名札のエンティティを追う、`/spectral:range <音量> [レベル dB]`（3D のレベル）、make_app.py の during（曲の間にサーバーの命令）。
   **集めた（実測、SPEC.md の 14 回目、9/11 本）**: setVolume は 3D でも 1 を超えて効く。+10 dB は 3 ブロックで悪くならず（ViSQOL 3.16 → 3.20）、
   24 ブロックで声の静かな所が残る（0 になる割合 42 → 5 %、ViSQOL 2.38 → 2.79）→ **3D の既定のレベルを +10 dB に**（LEVEL_3D_DB）。46 ブロックだけ
   ViSQOL が逆（2.62 → 2.46）。歩く話す人は録れなかった（防具立てが無いときの kill がエラー: アプリの実行が FAIL）
   **15 回目の実機**（tools/exp/app15.json、**run 41272459953**、13:20 JST、8a4c6a9）: ライブの 3D を静かに作る（`/spectral:range 3 10 true`: 定義の音量 0.1 の
   _3q の音を 10 倍に操る、既定は off）を 3 / 24 / 46 ブロック（qa_ / qb_ / qc_、24 ブロックを作る音量 16 で qg_）、ふつうに作る 3 ブロック（qd_）、
   46 ブロックの 0 / +10 dB のくり返し（xg_ / xh_）、止まった話す人（mg_）、歩く話す人をふつうに / 静かに（qf_ / qe_、防具立ては mg_ で 1 回だけ召喚）。
   **集めた（実測、SPEC.md の 15 回目）**: 静かに作っても大きさと届く距離は同じ、作った直後の音は声に対して 19–24 dB 下。**歩く話す人はふつうに作ると
   ViSQOL 2.41（止まったままは 3.09）、静かに作ると 2.87** → **静かに作るを既定に**（QUIET_3D）。止まった音で静かに作ると一番静かな所が 0 になっていた
   （声の床 SILENT が聞こえる大きさで 10 分の 1）ので、静かに作るときの床を SILENT / 0.1 に。46 ブロックのくり返しは +10 dB で 2.38 → 2.47
   **16 回目の実機**（tools/exp/app16.json、**run 41277993333**、254d5f7）: 新しい既定（静かに作る）とふつうに作るを同じ run で — 3 ブロック（ua_ / ub_）、
   24 ブロック（uc_ / ud_）、止まった話す人（ug_）、歩く話す人（ue_ / uf_）。**集めた（SPEC.md の 16 回目）**: 歩く話す人は静かに作るほうが +0.56
   （2 回目）、止まった音は 3 ブロックで +0.05、24 ブロックで −0.25（15 回目の 46 ブロック −0.31 と同じ向き）→ **静かに作るのは follow だけ**に
5. tools/rig/start_burst.py（3D の録音の頭: 最初の 250 ms の 200 Hz より上の一番大きい 10 ms を、その後の曲の 95 パーセンタイルと比べる。
   1760 Hz の線、200 Hz より下も）。collect.py・run_report.py に 13 回目の頭（o は 8 回目の o の名前を上書き）
6. 変換ページを 1.2.0 で作り直した（headless Chromium でライブ・なし・5 回の変換とゲーム内の音、エラーなし）。前のセッションの claude.ai の
   artifact はこのアカウントから開けなかったので新しく出した: Spectral Converter https://claude.ai/artifact/X8UwVjtaT2aRem8hsnhmJ9
7. 4 回目の最後に予約したはずのタスクはアカウントに見つからず、1 度も動いていなかった（下の記録）。13 回目はこのセッションが自分への
   知らせ（send_later、12:41 JST）で集める

8. **Discord に送る**（12:08 の依頼）: 通知先は Discord の webhook（Secrets の LAB_NOTIFY_WEBHOOK。DISCORD_BOT_TOKEN は無い: notify の
   ジョブのログの env で分かる。Secrets と Variables の API はこのセッションのプロキシでは読めない）。ファイルも送れる: 12 回目の録音 43 本を
   webhook に送れた（notify run 41268330766: 「OK 録音 43/43 本を Webhook に送りました」）。実行の成果物の録音は Opus 160 kbps（WAV の原本は
   残らない）。本体アドオンは unit.yml go（成果物 unit-spectral の .mcaddon を notify が自動で添える: main のコードにもある）。
   **実機の 1 回ごとに**: ① `gh workflow run notify.yml --ref addon/spectral -f run=<redroid の id>`（このブランチの notify が録音を送る。
   自動の notify は main のコードで録音を送らない）② `gh workflow run unit.yml --ref addon/spectral -f job=go -f unit=spectral`（その版の
   .mcaddon）③ `gh workflow run notify.yml --ref addon/spectral -f message="<進捗>"`（1 行目の最初の語は webhook の印に置き換わるので絵文字から）
9. **歩く話し手の引き継ぎ**（16:00 の「続き」から）: `/spectral:handover [hold|steer] [ブロック]`（古い音を最後の大きさのまま止めるか声に付いていかせるか、
   何ブロック動いたら作り直すか）、`/spectral:range` の 4 つ目（静かに作る音の定義の音量 0.1 / 0.01 / 0.001 = _3q / _3r / _3s の音）、
   tools/rig/envelope.py（250 Hz–4 kHz の 4 帯域で 10 ms の大きさが元にどれだけ付いていくか）、make_app.py の腕ごとの wait。
   **17 回目の実機**（tools/exp/app17.json、**run 41284187721**、5a4f6ec）: 話し手を 3 ブロック前で 2 ブロックずつ左右に（約 0.7 秒に 1 回の作り直し）。
   **集めた（実測、SPEC.md の 17 回目）**: 止まったまま 3.19、歩くと hold 2.52 / 2.42・steer 2.36 / 2.47 → **steer は見分けられない、既定は hold のまま**。
   歩いて下がる主な原因は作り直しのたびの低い「トン」（20 秒で 44–46 回、合わせて 4 秒余り、一番大きいもので 60–250 Hz が −36 dB、声の大きい所は −50 dB）
   **18 回目の実機**（tools/exp/app18.json、**run 41286094409**、663bbf7、16:46 JST に始めた。go: test 175/175, qa clean）: 止まった話し手を定義の音量 0.1 / 0.001
   （ta_ / tb_: setVolume を 1000 倍まで上げて同じ大きさで鳴るか）、17 回目と同じ道を 0.1 / 0.01 / 0.001 / 0.001 / 0.01 / 0.1（wa_〜wf_）、3 ブロック動いてから
   作り直すのを 0.1 / 0.001（wg_ / wi_）。**集めた（実測、SPEC.md の 18 回目）**: 止まった話し手は 0.1 で 3.09・0.001 で 3.23（同じ −17.5 dB: setVolume を
   1000 倍にしても指定どおり）。歩く話し手は 0.1: 2.39 / 2.36、**0.01: 2.66 / 2.65**、0.001: 2.28 / 2.33 → **静かに作る定義の音量の既定を 0.01 に**（Q3D）。
   3 ブロックで作り直すのは 0.1 で +0.22、0.001 で ±0。**作り直しの直後に話し始めると声の頭が 0.3–0.4 秒抜ける**（17・18 回目の 8 本: 作り直した音に、
   クライアントが鳴らし始める前に送った命令が失われ、アドオンは変わった分しか送らないため、と推測）→ `/spectral:handover` の 3 つ目（引き継ぐまでの tick、
   既定 2）と 4 つ目（引き継いだ後 2 tick ごとに状態を送り直す回数、既定 0）。go: test 175/175, qa clean
   **19 回目の実機**（tools/exp/app19.json、**run 41288535848**、7dc5399、17:40 JST に始めた）: どれも 0.01。止まった話し手 0.01 / 0.1（ya_ / yb_）、歩く話し手を
   1.2.0 の引き継ぎ（yc_ / yj_）・送り直す 3 回（yd_ / yi_）・steer で 6 tick 後に引き継ぐ（ye_ / yh_）・その両方（yf_ / yg_）。**集めた（実測、SPEC.md の
   19 回目）**: どれも見分けられない（2.67 / 2.71・2.64 / 2.75・2.53 / 2.71・2.58 / 2.64）→ 引き継ぎの既定は 1.2.0 のまま。3.75 秒の音節の頭は**どの形でも
   300–350 ms 抜ける**（送り直しても古い音を付けておいても）→ 命令が失われるのではなく、作り直しの間に 1 人で 32 音を超えるのが原因と推測
   **20 回目の実機**（tools/exp/app20.json、**run 41290363885**、075a04e）: ライブの変換のまま / その場の合成による分析つき（下の 10.）をヘッドホンで 3 曲
   ×（za_ zb_ zc_ zd_）、歩く話し手を 1.5 / 3 ブロックで作り直す（zf_ zi_ / zg_ zh_）。**集めた（実測、SPEC.md の 20 回目）: 分析つきが 2 組とも 3 曲すべてで上、
   中央値 +0.26**（2.82 → 3.16 / 3.20）→ **ライブの変換の既定を分析つきに**（encoder.mjs・bridge.mjs の `--refine` 既定 2）。3 ブロックの作り直しは +0.03 で既定は 1.5 のまま
   **21 回目の実機**（tools/exp/app21.json、**run 41292284148**、2260f6e）: 32 音の上限を確かめる — 止まった 24 声 / 8 声（pa_ / pb_）、
   歩く 8 声（pc_ / ph_: 作り直しの間も 32 音まで）、歩く 24 声（pd_ / pg_）、歩く 24 声で古い音をすぐ止めて 1 tick に 2 音ずつ（pe_ / pf_:
   `/spectral:handover cut 1.5 2 0 2`）。**集めた（実測、SPEC.md の 21 回目）: 32 音を超えないと抜けない**（8 声 2.74 / 2.74・cut 2.77 / 2.73 で抜け 0、
   1.2.0 の 24 声 2.68 / 2.68 で 500 / 950 ms 抜け、6 dB 小さい）→ **follow の引き継ぎの既定を cut・1 tick に 2 音に**（HANDOVER_CUT・FOLLOW_STEP）。
   go: test 175/175, qa clean。tools/rig/gaps.py（声が 100 ms 以上抜けた所）
   **22 回目の実機**（tools/exp/app22.json、**run 41293745813**、1fdcda8）: その場の合成による分析を 3D で（止まった話し手 ba_–bd_・bg_、near 24 ブロック be_ / bf_）。
   **集めた（実測、SPEC.md の 22 回目）: 3D の話し手でも 3 曲 × 2 組すべてで上（中央値 +0.32: 3.05 → 3.43 ほか）**、24 ブロックは 2 曲で上・歌は −0.13
   **23 回目の実機**（tools/exp/app23.json、**run 41295422615**、59d111d、19:00 JST に始めた）: 新しい既定（cut・2 音）を本物の歩きの速さ（3 ブロックずつ）で、
   cut 4 音・1.2.0 と比べる（hg_ 止まった・ha_ / hf_ cut 2・hb_ / he_ cut 4・hc_ / hd_ 1.2.0）、歩く話し手でライブのまま / 分析つき（hh_ / hi_）。
   **集めた（実測、SPEC.md の 23 回目）: cut 2 音が一番（2.71 / 2.69、抜け 0）**、cut 4 音 2.64 / 2.61・1.2.0 2.62 / 2.64（どちらも抜けあり）、歩いても分析つき +0.14
   **24 回目の実機**（tools/exp/app24.json、**run 41296712864**、29233c8、19:16 JST に始めた）: 橋渡しの既定の 16 声でその場の分析（ヘッドホン）— 曲ごとに
   ca_（16 声そのまま）・cb_ / cc_（16 声分析つき）・cd_（そのまま）・ce_（24 声分析つき）。**集めた（実測、SPEC.md の 24 回目）: 16 声でも分析つきが 2 組とも
   3 曲すべてで上（中央値 +0.25）**、24 声の分析つきは少し上
   **25 回目の実機**（tools/exp/app25.json、**run 41298122864**、cc286c4、19:36 JST に始めた）: 歩いて下がる 0.3 のうち 3D 自体の分 — 話し手を道の上の x=0 / 6 / −6 /
   3 / −3 に止めて（ja_ jb_ jc_ jd_ jf_）、cut 2 音で歩く（je_ / jg_）。**集めた（実測、SPEC.md の 25 回目）: 止まっていればどこでも 3.09–3.21、
   止まった録音を歩く時刻表どおりにつないだ「作り直しのない歩き」（tools/rig/ideal_walk.py）は本物の歩きより 0.1 上なだけ → 歩いて下がる分の
   ほとんどは 3D の効果そのもの**（動く声と動かない元の声の差）。follow の作り直しはほぼ限界まで来た
   **26 回目の実機**（tools/exp/app26.json、**run 41299579864**、2efefea、19:56 JST に始めた）: このセッションの最後の既定をそのまま（設定の命令なし）通しで —
   曲をヘッドホンで（fa_）、ライブの変換（分析つき）をヘッドホンで（fb_）、止まった話し手（fc_）、歩く（fd_）、歩く速さ（fe_）。**集めた（実測、SPEC.md の
   26 回目）: 曲 3.80 / 3.21 / 3.50、ライブ 3.41 / 3.18 / 3.71、話し手 止まって 3.20・歩いて 2.90 / 2.95（声の抜け 0）— 既定のままで全部動く**
10. **ライブの変換に合成による分析は効くか**（エミュレーター、推測）: tools/exp/live_refine.py がライブのフレームを変換器の refine_client で後から（先も見て）
   5 回掃き出し、tools/exp/score_pack.py（SPECTRAL_BUNDLE・SPECTRAL_LEVEL で 1.2.0 の +10 dB）が採点する。注意: refine_client は変換器の 44.1 kHz の
   音で動く（48 kHz を渡すと時間がずれ、模型の NSIM が 0.13 しか出ない）。ライブのフレームは変換器のフレームより遅れているので、模型の NSIM が一番高い
   遅れ 50 ms で合わせる。結果は tools/exp/results/live10.jsonl（ライブのまま base: 夏目漱石 2.88・ワーズワース 3.05・Name of Love 3.45）。
   **後から 5 回掃き出すと 3.24・3.57・3.69、前から 1 回だけでも 3.20・3.50・3.60** → 1 回の前向きの掃き出しは 2–3 フレーム先しか見ないので、その場でできる:
   **web/live.js LiveRefiner**（`LiveEncoder({ refine: 2 })`、tools/live/encoder.mjs と bridge.mjs の `--refine 2`。2 フレーム先 = 遅れ +100 ms、
   文の切れ目で flush。web/core.js の clientModel・gtH2・nsimRef・nsimSum・CL を使う）: **3.14・3.43・3.69**（3 フレーム先でも 3.11・3.45・3.66）。
   refine 0 は前とバイト一致。24 声 1 人で実時間の約 3 割の計算。tools/live/test_bridge.mjs に refine の 2 項目（文の切れ目・フレームの数）。
   **実機（20 回目）で中央値 +0.26、3/3 曲 × 2 組 → encoder.mjs・bridge.mjs の既定を `--refine 2` に**（LiveEncoder クラスの既定は 0 のまま: web/core.js の
   ない所でも動く）。変換ページにも「ライブの変換＋その場の仕上げ」（live2）

## 4 回目のセッション（2026-10-31）でしたこと

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

9. **10 回目の実機**（run 41197478510、実測）: 9 回目と同じデータの d_ は曲ごとの差の中央値 +0.002（run をまたいでもほぼ同じ）。
   聞く人ごとの 3D（near）の左右 +42.3 / −41.0 dB。e_ は手順の誤りで +6 dB のまま鳴った（make_app.py を直した）
10. **まとめ録り**（ユーザーの依頼「録音取得早くして一括で再生録音できるようにして」「続けて流さずに一括で再生して録音する方法または
    類似する方法」）: 電話は 1 度に 1 曲（同時 32 音を 1 曲が使い切る・録音は混ざった 1 本）なので同時には録れない。代わりに
    (1) 実機は 1 本の録音に何曲も（audio mark → stop が切り分け → analyze-all が並行）、曲の送りも速く（1 回の do に何曲も）、
    (2) 模型でまとめて（tools/exp/batch_play.py: 実時間を待たない、推測）。**11 回目（run 41200540880）がまとめ録りの最初の実行**:
    d_ / e_（+10 dB、今度は本当に）26 本・3D の距離 3 / 12 / 24 ブロック・同じ run の天井 13 曲、42 本を 6 本の録音で

11. **11 回目の実機**（run 41200540880、実測、まとめ録りで 42 本）: **+10 dB は +6 dB より 10/13 で上（中央値 +0.11）、同じ run の天井から
    0.3 以内 12/13（+6 dB は 10/13）**。3D は 24 ブロックで無音（作るときの volume 1 では 16 ブロックほどまで: 推測）。表: SPEC.md

12. **3D の届く距離の設定** `/spectral:range <音量>`（3D の音を作るときの音量: クライアントは届く距離をそこから取る。既定 1 = いままでどおり。
    試験 ## 3D sounds can reach farther）。**12 回目の実機**（tools/exp/app12.json: d +6 / f +8 / e +10 dB を曲ごとに交互に 39 本、
    3D 24 ブロックを作る音量 1 / 2 / 4・40 ブロックを 4 で 4 本、まとめ録り）: **run 41205071937**（22:19 JST に始めた）。集計は引き継ぎ zip の scratch/run12.sh
    （`RUN=41205071937 U=<ユニット> bash run12.sh`）

## いまの状態

- ブランチ addon/spectral（push 済み、最後のコミットは git log で）。**本体 1.2.0**（3D の既定 +10 dB・名札の話し手・follow の声は静かに作るのが既定で、
  その定義の音量は 18 回目から **0.01**。`/spectral:handover` は試すための設定で既定は 1.2.0 のまま）。`node lab.mjs go`（ローカルの BDS 1.26.61.1: lab の api が
  取ってきたもの。zip はリポジトリの外: LAB_BDS_ZIP）: **DONE（test 175/175, qa clean）**
- 電話の既定: 24 声＋ノイズ 8・打撃音なし・ファイルより **+10 dB**。変換器の既定: 合成による分析（+10 dB の実機の模型）・svr の重み・5 回・
  大きさを保つ。3D: 作る音量 3 = 48 ブロック、高さ P_MIN で作る
- 実測の成績（同じ run の中で）: 12 回目の +10 dB 中央値 3.02（天井から 0.3 以内 10/13）、11 回目 3.25（12/13）。run をまたぐと同じデータでも
  曲ごとに平均 0.27 動く（11 回目の数がずれていた）: 比べるのは同じ run の中だけ
- 13–17 回目は集めた（SPEC.md）。18 回目（run 41286094409）が走っている / 集めた（SPEC.md に 18 回目の節があれば集めた）
- verify.yml は addon/spectral で前から tests/scratch-offline.mjs（ラボの試験「a wrong sum」）が落ちている。main の verify も 10-30 から落ちている:
  このユニットとは関係ない

## 次にやること

1. 2 人が同時に話すと 2 × 32 音で 32 音を超える（話し手の声の数を自動で減らす案: 近くの話し手の数で 24 → 12 声）
2. 本物の Discord で bridge を（トークンとサーバー: ユーザーが用意。tools/live/README.md の手順。既定で `--refine 2`）。何人もが同時に話すと
   1 人ずつの分析が Node の 1 本のスレッドに載る（24 声 1 人で実時間の約 3 割）: 多いならワーカーに分ける
3. 遠くで静かに作ると下がる理由（16 回目の 24 ブロック）は大きさではなく音色の側（推測）。0.01 の near（止まった音）は測っていない
4. 天井から 0.3 に届かない曲（12 回目の +10 dB で合唱 0.42・デモ 0.80・ファンク 0.36）: 模型（batch_play.py）で案を比べ、良いものだけ実機で
5. 遠い 3D で静かな所が消える（16 bit の床）: 3D +10 dB で 24 ブロックは 42 → 5 %、46 ブロックは 68 → 28–33 %（ViSQOL は 46 ブロックで 2 回の平均ほぼ同じ）

## 予約したタスク: 実機を続ける（ユーザーの依頼「さらにタスク予約してapp回して」2026-10-31 22:26）

**このタスクはアカウントに見つからず、1 度も動いていない**（下の記録）。手順は人や次のセッションが手で続けるときのために残す。

Claude の予約したタスク「Spectral Player の実機を続ける」が 1 時間ごとに新しいセッションで動き、毎回この節に従う（人でも同じ手順で続けられる）:
1. リポジトリ: noknoh12345-afk/bds-lab を push できる形で（Claude なら add_repo、access push）clone し `git checkout addon/spectral`
2. `gh run list --repo noknoh12345-afk/bds-lab --workflow redroid.yml --branch addon/spectral --limit 1 --json databaseId,status,conclusion`
3. 走っている（queued / in_progress）→ そう報告して終わる。**取り消さない**
4. 終わっていて `bds/addons/spectral/measured/redroid-<id>.json` がない → 集める:
   `JOB=$(gh run view <id> --repo noknoh12345-afk/bds-lab --json jobs -q '.jobs[0].databaseId')`、
   `gh api repos/noknoh12345-afk/bds-lab/actions/jobs/$JOB/logs > /tmp/job.log`、ユニットで `python3 tools/rig/collect.py /tmp/job.log --run <id>`、
   `python3 tools/rig/run_report.py <id> --md` → SPEC.md の「曲の成績」のいちばん上に「### <id>（自動の続き、app.txt のまま）」の節で
   その表と行（**実測**）、下の「自動の続きの記録」に 1 行。`git checkout -- bds/vendor/bds-version.txt`、コミット・push（addon/spectral だけ）
5. 次を始める: 下の記録で「始めた」が **2 本未満**、redroid が走っていない、`gh run list --repo noknoh12345-afk/bds-lab --workflow app.yml --limit 3`
   に走っているものがない → `gh workflow run redroid.yml --repo noknoh12345-afk/bds-lab --ref addon/spectral -f addon=spectral -f mode=run`
   （app.txt = いまの計画のまま: 13 回目の tools/exp/app13.json = 1.2.0 の 3D と d / o / e の繰り返し = ばらつき）→ その id を記録に足してコミット・push
6. 始めた 2 本がどちらも集まったら終わり: 報告して、予約したタスクを止める（Claude なら update_trigger で enabled=false）
7. 毎回、日本語で短く報告（集めた数は実測、始めた run の id）
- この手順ではアドオンのコード・既定・試験を変えない（レベルの既定を決めるのは人か作業のセッション）。.github・auto/policy.json・auto/STOP・
  .env に触れない。corpus の音声・キャッシュ・bds/vendor/bedrock-server.zip をコミットしない

### 自動の続きの記録
- （まだなし）12 回目 run 41205071937 はこのセッションが始めた（自動の続きの 2 本には数えない）
- 2026-11-01 11:20 JST（5 回目のセッション）: **予約したタスクはこのアカウントに見つからなかった**（list_triggers が空、10-31 22:28 の後に
  コミットも redroid の実行もない: 1 度も動いていない）。12 回目は 23:00 に成功で終わっていて、5 回目のセッションが集めた（SPEC.md）

## 実機で測るしくみ（redroid.yml, addon spectral, mode run → app.txt）

- 端末: redroid の Android 14 に Play が入れた Minecraft 1.26.60.4。BDS はランナー上の 1.26.60.6。ジョブの上限 75 分、**app run の上限 40 分**
- app.txt は tools/exp/make_app.py（`python3 tools/exp/make_app.py tools/exp/app9.json app.txt`）。腕（arm）ごとに前置き・曲 id の後ろの字・
  変換器の設定・前に打つ命令・pack（前もって変換した曲: tools/exp/make_packs.py）・play（spectral:play 以外、例 live_demo）。
  interleave: 腕を曲ごとに交互に（命令の違う腕は、その曲の前に spectral:stop と違う命令だけ: 10 回目まではこれがなく、e_ が +6 dB で鳴った）。
  **batch: N**（11 回目から）: 1 本の録音に N 曲まで — `audio start` → 曲ごとに `audio mark <名前>`・play・wait → `audio stop` が目印で
  audio/<名前>.wav に切り分ける（録音の遅れは壁の時計とファイルの長さの差、切れ目は曲のあとの静かな所へ）→ `audio analyze-all` が
  並行して測る（app/lib/scenario.mjs・audiorec.mjs cut）。1 曲 45 秒（うち待ち 22 秒）が約 25 秒に。40 分で切れたら失うのはその 1 本の録音だけ
- **電話は 1 度に 1 曲しか鳴らせない**（同時 32 音を 1 曲が使い切り、録音は混ざった 1 本）: 何曲もを同時に録ることはできない。
  実時間を待たずに全部を見るのは模型: `python3 tools/exp/batch_play.py <app の JSON> [--ceiling]`（アドオンの本体をモックで、
  実機の鳴り方の模型で「録音」に、rig の score_song.py で採点、Opus・index.json・scores.json。9 回目の 40 本で 7.6 分（2 コア）。
  実機より平均 0.27 高く、相関 0.91、どちらが良いかは 13 曲中 12 曲で実機と同じ。3D はない）→ `tools/abx/make_compare_real.py --scores`
- 曲は `audio song <曲,…> [suffix=_x] [pack=<フォルダ>] [設定=値 …]`（pack なしは join の前に変換: 合成による分析 5 回は重い）。
  いくつもの曲の部分を 1 回の do で 25 ms ずつ（前は 300 ms ずつで 29 曲 7 分）
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
