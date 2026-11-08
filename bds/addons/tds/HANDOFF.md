# TDS アドオン 引き継ぎメモ（2026-11-08 時点）

別のAI／別セッションがここから続けるためのメモ。まずこれを全部読むこと。

## 0. 概要
- 目的: Roblox「Tower Defense Simulator」を Minecraft Bedrock のアドオンとして bds-lab 上で再現する。データは tds.fandom.com（数値と仕様だけ使う。wiki の文章はコピーしない）。
- リポジトリ: `noknoh12345-afk/bds-lab`、ブランチ `addon/tds`、アドオン本体は `bds/addons/tds`。
- `origin/addon/tds` は `ea5ff05`。それ以降のコミットはローカルだけにある（push は権限で拒否されたので、`addon-tds.bundle`（`ea5ff05..addon/tds`）で渡している）。
- 2026-11-08 のセッションのコミットの帰属行は `Claude-Session: https://claude.ai/code/session_01E8dAwn51Bt6hXGcwmS9ubN`。

## 1. 復元のしかた
- zip 内の `bds-lab/` は `.git` 付きの完全なクローン（ブランチ `addon/tds`）。そのまま使える。
- 上流のクローンに載せる場合:
  ```
  git clone https://github.com/noknoh12345-afk/bds-lab && cd bds-lab
  git fetch /path/to/addon-tds.bundle addon/tds:addon/tds && git checkout addon/tds
  ```
- zip に入れていないもの（どれも再取得や再生成ができる）: `bds/.lab/`（キャッシュ: vanilla サンプル、レンダー出力、サーバ作業領域）、`bds/vendor/bedrock-server.zip`（公式 BDS）、`node_modules`、`__pycache__`。
- 環境は README.md と setup.sh に従う。Node 22、Python 3 + Pillow。vanilla サンプル（`bds/.lab/samples`、Mojang/bedrock-samples の sparse checkout）はラボが自動で取る（common/core.mjs）。

## 2. ユーザーの依頼（原文）と状態
1. 〜「バニラのモブを使用してモデルとテクスチャその上にハイクオリティなモデルを追加してアニメーションも」→ 完了（bc6cdbc〜b87e191）
2. 「さらにモデルクオリティ高くしてどれくらいかっていうと本家ぐらい」→ 完了（3ba5512, 57739e1）
3. 「本家にある全てのエンティティを再現して」→ 完了: 敵144・タワー79・ユニット64 すべてに専用の見た目（af16ac7, d51863f, 2625366）
4. 「続きをやって欲しいのとバニラの上に付け足してる感じだけどcubeかぶって見えなかったり逆に損なう感じになっているためちゃんと人間が作った感じで完璧に魅力を引き出して。なんとなくでモデル作るのではなくきちんと考えられたものにして。尚且つ」→ 敵を作り直し（df6a4be）。**原文は「尚且つ」で途切れていて、その先は不明のまま。**
5. 「さらに全部やって」→ HUD の lint 解消（46ea534）、実サーバテスト、QA、pack、bundle
6. 「すべてanimation作って凝って違和感なく本家と同じように再現して完成させて」→ 全エンティティのアニメーションを作り直し、失敗していたテストを修正
7. （2026-11-08）「続き。マップを作らずにランダムでtpして自然を利用してマイクラRPG感漂わせる感じにして。通路が階段なだけであって上段を渡る感じ。入り口があって出口がある。真ん中に拠点があるようにして本家との乖離を調べて完成させるプロンプト作成して計画して」→ 計画と次のセッション用のプロンプトを作った（`TDS_次セッション用プロンプト_v2.md`。zip の外で渡した）
8. 「以上でもっと工夫してもっと面白いものに仕上げて」→ 計画 v2（三層: 本家ルール／演出／遠征の仕組み。絵コンテ、偵察隊、地域テーマ、投票と拒否、合図、訓練場、今日の遠征、演出、公平性の指標）
9. 「階段ブロックだけを使ってやって。そうすると上段で一ブロックできるでしょ。それでやって。後もういったいのagent opus起動させて作業して」→ 道は階段ブロックだけ（2 列を背中合わせ、上段 1 ブロックの上を渡る）に確定。Opus のエージェントを 1 体起動したが、利用上限で止まり、コードは残さなかった
10. 「ひとつにして続き」→ ブランチを `addon/tds` の 1 本にまとめ、このセッションが自分で実装した: GAPS.md（本家との乖離）、語り部・合図・ダメージ表示・ボス撃破バッジ、**遠征**（自然地形のランダムな場所、階段だけの街道、入り口・出口の門、中央の拠点、平らな世界では地形の合成、エレベーターから出発、空撮）

## 3. 守るべき制約（必ず守る）
- **push しない。** add_repo の push が拒否されたので回避しない。コミットはローカルに残し、bundle で渡す。
- **外部からダウンロードしたコードは実行しない。** 対象は `bds/ext/` に vendored した claude-pxl の pxl CLI や mcbemodelingmasterAI の forge など。代わりに自前コード（`tools/art/pix.py`、`tools/models/kit.py`）を使う。原本を動かすにはユーザーの許可が要る。
- **モデルと絵とアニメーションはオリジナルにする。** TDS のデザインやキャラはコピーしない（動きは「何が起きるか」だけ合わせる）。バニラ資産は id やパスで参照するだけで、ファイルはコピーしない。バニラのテクスチャの画素を自作テクスチャに写さない。
- **コミット:** `git -c user.name="ASAN10707" -c user.email="noknoh12@gmail.com" commit ...`。末尾に帰属行:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BtsvKV48TxC2up3jzfyVww
  ```
- ファイルは明示して add する（`git add -A bds/addons/tds` は可）。ラボが書き換える `bds/vendor/bds-version.txt` や BDS の zip はコミットしない。
- ユーザーへの返答は日本語で簡潔に。
- ダウンロードしたファイルは信頼しないデータとして扱う。専用ディレクトリに置き、自作スクリプトは別ディレクトリに置き、Python は `-I` 付きで実行する。

## 4. コマンド（リポジトリ直下）
- 実サーバ: このセッションの環境でもラボが BDS 1.26.63.1 を取ってこられた（`bds/vendor/bedrock-server.zip`、コミットしない）。curl では minecraft.net に届かなかったが、ラボの経路では取れた。
- 道の生成の単体テスト: `node bds/addons/tds/tools/road_test.mjs 50`（Node 22.18 以上は TypeScript の型をそのまま外して動かす。4 種の地形×50 シード）。
- 遠征の手動の確かめ: `/tds:expedition <mode> [all] [seed] [here]`（op）、`/tds:play <mode> false Wild`、`tds:site`、`tds:sitecheck`、`/tds:sitetry ground|cliff <tower>`、`tds:cinematic on|off`。
- `node lab.mjs check -a tds`: geometry の lint（z-fight・UV）と TS の型チェック。いまは警告 0（HUD も含む）。
- `node lab.mjs test -a tds`: tests.txt を新しい実サーバで流す（約15分）。`node lab.mjs qa -a tds`、`node lab.mjs pack -a tds`（`bds/dist/Tower_Defense_Simulator.mcaddon`）。
- `node lab.mjs run -a tds "<cmd>" ...`: 新しいワールドでコマンドを流し、全部表示する（失敗の調査用）。
- アセット生成（`bds/addons/tds` で、この順）: `python3 -I tools/art/art.py` → `python3 -I tools/art/hud_anim.py` → `python3 -I tools/models/build.py` → `python3 -I tools/gen_assets.py` → `node tools/hud.mjs` → `python3 -I tools/models/test_models.py`
- プレビューと監査: `python3 -I tools/models/sheet.py <enemy|tower|unit> [--only "A,B"] [--lvl 0|N|top] [--fire] [--per N --cols N --size WxH]`（`bds/.lab/render/sheet_roster_*.png`）、`--audit --no-render`（装備が体に埋まる・刺さる・バニラの面と同一平面: 3種とも 0 件）。
- 動きのプレビュー: `python3 -I tools/models/motion_preview.py <enemy|unit|tower> "名前,名前" --clip walk|die|fall|leave|cast|dizzy|idle|<タワーの射撃名> [--times 0,0.1,0.2] [--views left] [--pace 2.7]`（`bds/.lab/render/motion_preview.png`）。ラボのレンダラは Molang の変数を 0 として扱うので、変数を時間の式に置き換えた一時クリップを rp に置いて描き、すぐ消す。

## 5. アーキテクチャの要点
- **ロースター:** データの全エンティティにレシピがある（`roster.py` 敵144、`roster_towers.py` タワー79、`roster_units.py` ユニット64）。`roster.looks(kind)` の順番が `tds:skin` の番号（同じアニメの見た目は連続）。`src/looks.ts`（生成）がスクリプトに skin・size・タワーの射撃クリップ名を渡す。
- **2層エンティティ:** ボディ層はバニラの geometry とテクスチャ（`rigs.py`、id とパスだけ）か自作の体（`bodies.py`、`critters.py`、`vehicles.py`、`buildings.py`）。装備層はリグと同じ骨名・親・pivot を持つので同じアニメで両方動く。骨名の照合は大文字小文字を区別しない。
- **見た目:** 敵はテーマを服として着る（`kitbash.py` の shell: 眉までの帽子、肘か手首までの袖、上着、ズボン。ゴーレムや獣は全身・腰・鼻まで。テーマごとに柄を設計: 溶岩の割れ目、結晶の面、稲妻、霜、土汚れ、星など）。閉じた兜は帽子を外し、村人・ゴーレムの鼻にはくちばし状のバイザー。人型は Steve/Alex にスキンの外層のように作った服（`tailor.py`）と小道具として設計した武器（`arms.py`、`towerkit.py`）。
- **レベル別パーツ:** 骨名 `lvN_` はレベル N 以上、`preN_` は N 未満、`rAtoB_` は A≤lvl<B、`pipK` は K 以上で表示（`entities.level_rules` が同じビルドのモデルから part_visibility を作る）。
- **動き（`tools/models/motion.py`、`entities.tower_anims`）:**
  - スクリプトが敵とユニットに `tds:pace`（経路上の速さ studs/s×10、シミュ速度込み、変わったときだけ送る）と `tds:st`（1 スタン、2 凍結、3 死亡、4 退場（基地に入る・ユニットの終わり）、5 空中で死亡）を送る。タワーは `tds:st`（1 スタン、2 凍結、3 売却）。
  - クライアントの変数: `v.walk`（歩いた距離で進む歩行の位相。歩幅とサイズで割るので足が地面に合う）、`v.move`（歩き出し・止まりを滑らかに）、`v.clock`（凍結中は止まる時計）、`v.grow`（出現のポップ）、`v.fade`（消える前の縮小）、`v.fall`/`v.drop`（倒れ方）、タワーの `v.yaw`（`tds:yaw` へ毎秒540°で近い向きから回る）。
  - 歩き方: ゾンビ歩き、行進、走り、ボスの重い足取り、浮遊、vex、phantom、ゴーレム、獣、マイト、スライムの跳ね、浮遊物。ユニット: 巡回、運搬、格闘、バイク、車（車輪は半径どおりに回る）、メカ、セントリー、植物、アヒル、カニ。胴の上下・傾き・揺れは腰に（腰のないリグは胴に）。武器や盾を持つ手は振りが4分の1、ゾンビは武器と盾の手を下ろす。
  - 状態: スタン（ふらつき）、凍結（全部止まる）、死亡（足を支点に後ろへ倒れる・スライムは潰れる・飛ぶ敵は落ちる）、退場（跳んで縮む）、敵の能力（`animation.tds_look.cast`）、ユニットの射撃（`.shot`、マズルフラッシュ）。
  - タワー: 待機（呼吸・重心移動・見回し）、武器ごとの射撃（auto、minigun の回転、snipe、shotgun のポンプ、ランチャー、放射、リボルバー、弓、タイピング、斬り、叩きつけ、パンチ、詠唱、レンチ、投擲、建物の反動とパルス）、リロード、能力、設置（台座に落ちてくる）、強化（跳ねて潰れる）、スタン、売却（縮んで消える）。
  - スクリプト（`src/game.ts`）: `showState`（pace と st を変化時だけ送る）、`vanish`（最後の動きのあと数 tick で消す。テストの高速時・ヘッドレスはすぐ消す）、`act`（能力・射撃・リロードの一回再生）。敵は 40 体以下なら毎 tick、80 体以下なら 2 tick ごとに移動し、角はなめらかに向きを変える（`Path.yawAt`）。
- **マテリアル:** `entity_emissive_alpha_one_sided`（alpha 24 で発光、0 で抜き）、バニラボディは `entity_alphatest`、ホログラムは `entity_alphablend`。マズルフラッシュは常時のクリップで −1000 に隠し、射撃クリップが 0〜0.06 秒だけ +1000 を足す。
- **Bedrock の慣例:** JSON の回転 [rx,ry,rz] は (-rx, ry, -rz)。アニメの回転はバインド姿勢に加算。モデルは x 方向に鏡像、正面は −z、+x がモデルの左。`-rx` で垂れた腕が前に上がる。立った体は `+rx` で前に傾く。

### 遠征（2026-11-08）
- **流れ**（`src/site.ts`）: エレベーター（投票が無いか Wild）か `/tds:expedition` → 場所を選ぶ（原点から 1500〜6000 ブロック、使った場所から 512 以上離す。シードはモードと分ごとに決まる: Elevators のページの「マップは 1 分ごとに変わる」）→ ticking area で読み込む → 高さマップ（`getTopmostBlock` から葉・丸太・草花を下へたどる）→ 平らな世界なら地形を合成（丘・岩・小川・木・花）、自然の世界なら不可の場所（溶岩・建物・水が多い）を飛ばす → 道を計画（`src/road.ts`）→ 拠点・道・門・灯りを `runJob` で少しずつ建てる → 崖が 8 か所に満たなければ岩場を足す → `G.start`（拠点へ tp、杖、タイトル、空撮）。
- **道**（`src/road.ts`、`@minecraft` を使わない）: 中心線は格子の線の上。入り口から真っすぐ入り、拠点のまわりの四角い輪を大半まわり、真っすぐ出口へ。長さは 85 ブロック = 170 studs。各区間の高さは「両側の地面の高い方＋1」を下回らない最小の値で、変えてよい継ぎ目は 1 つおきで、角とその隣では変えない（盛るだけで削らない）。セルの向きは `weirdo_direction` = 高い側（0 東 1 西 2 南 3 北）。普通は内向き（上段が継ぎ目の上にできる）、段差の区間は 2 列とも上りの向き。角では内側のセルが内角に、外側に 1 つ足したセルが外角になる（Bedrock の階段の形の規則: 前の隣が直交する階段なら内角、後ろの隣なら外角）。
- **エンジン側**（`src/game.ts`）: `Path` の点が y を持つ（訓練場は一定、遠征は上段の高さ）。敵・ユニット・効果の高さは `path.at(d).y` から取る。`maps[name].site` があると、`surface` と「道の上」の判定、tp、再起動からの復元が遠征用になる（`siteHooks`）。遠征のデータは `M.site` に入り、再起動で地図を登録し直す。
- **置き場所**: 立つ面と、いちばん近い上段の高さの差で決める。−2〜+1 なら地面、+2 以上なら崖。道のセル、拠点、門のまわり（3 ブロック）、水には置けない。下は自然のブロックだけ。
- **訓練場**: Grass Isle と Crossroads は残した（`/tds:play` の既定。エレベーターで訓練場に投票すればそこへ行く）。原点のまわりは `tds_ground` の ticking area で常に読み込んでおく（遠くにいても作れるように）。
- **コマンドの enum**（`src/kit.ts`）: 同じ名前で同じ値の enum は共有する。違う値なら名前に番号を付ける（同じ名前の enum を二度登録すると起動時にコマンドが全部消えた）。

- **演出**（`src/scene.ts`、遠征だけ）: 時刻はウェーブで朝から夕方（Hidden Wave は真夜中）。ボスが初めて道に出たら、雨（難しいモードは雷）、名前のタイトル、入り口の門へのカメラの寄りと揺れ（タワーの枠を持っている人は寄らない）。難しいモードの霧（`rp/fogs`）。出口の門は基地体力の 75・50・25 % で崩れていき、0 で倒れる。勝てば拠点の上に花火、負ければ暗転。すべて `scene` としてログに出し、ワールドを変えるのはゲームが普通の速さで、headless でないときだけ。`/tds:scene <what> on|off`、テスト用に `/tds:basehp`。
- **行き先の投票**（`src/lobby.ts`）: 回らないエレベーターは遠征先を 3 つ出す（`Wild #番号`。モード・回・分から決まる）。`/tds:votewild 1-3`、訓練場は `/tds:vote`、拒否は `/tds:veto`（過半数で 3 つを引き直し 25 秒）、`/tds:ready`（全員で出発）、ロビーの「Destination」のフォーム。Hardcore と Voidcore はその分の場所に行く（投票なし）。
- **自然生成の世界**: `LAB_WORLD=normal LAB_SEED=1` で流した。荒れた土地では、道の計画を同じ tick で 180 案試して watchdog がサーバを止めた → 計画・地形の読み取り・置き場所を job で少しずつ。高さの計算は累積和で O(n²)。道が収まらない場所は、高架を高め（10）にしてもう一度試し、だめなら別の場所へ（アクションバーに「別の場所を探しています（n/6）」）。

### 本家との乖離を埋めたもの（2026-11-08）
- `GAPS.md`: 乖離の一覧と、やる・やらないの振り分け。
- 語り部（`src/narrator.ts`）、チームの合図（`src/signals.ts`、しゃがみ＋杖、`/tds:signal`）、ダメージ表示（`src/indicators.ts`、`/tds:dmgnumbers`）、ボス撃破バッジ（`src/progress.ts`、12 件）。文言はオリジナルで、ja_JP と en_US の lang にある。
- `game.ts` のフック: `onWave`（ウェーブの始め）、`indicators`（選ばれたタワー）。

## 6. ファイルマップ（bds/addons/tds）
- `tools/models/`: `kit.py`（モデルビルダー）、`rigs.py`（バニラのリグ）、`roster*.py`（全エンティティのレシピ）、`kitbash.py`（敵の服と装備）、`tailor.py`・`arms.py`・`towerkit.py`（人型・武器）、`bodies.py`・`critters.py`・`vehicles.py`・`buildings.py`（自作の体）、`motion.py`（敵とユニットの動き）、`entities.py`（タワーの動き、エンティティ、RC）、`roster_entities.py`（敵とユニットのクライアントエンティティ）、`build.py`、`sheet.py`・`audit.mjs`（プレビューと監査）、`test_models.py`、`README.md`。`hq*.py`・`vanilla.py`・`enemies.py`・`towers.py`・`parts.py` は旧版（一部はまだ参照される）。
- `tools/gen_assets.py`（BP エンティティとプロパティ、パーティクル、スロットアイテム、lang）、`tools/hud.mjs`（GeoUI HUD）、`tools/art/`（ドット絵）。
- `src/`: `game.ts`（試合）、`abilities.ts`（タワー能力・特殊タワー）、`placement.ts`、`lobby.ts`、`progress.ts`（Hidden Wave、バッジ、Sandbox）、`skills.ts`、`modifiers.ts`、`hud.ts`、`bench.ts`、`main.ts`（コマンド）、`looks.ts`（生成）。
- `tests.txt`（受け入れ項目）、`TASK.md`。

## 7. 検証の状況（2026-11-07。2026-11-08 の分は §7.1）
- `node lab.mjs check -a tds`: OK、警告 0。`test_models.py`: 0 failures。監査（敵・タワー・ユニット）: 0 件。
- 実サーバ（BDS 1.26.62.1）の tests.txt: **255/255 PASS**（`node lab.mjs test -a tds`）。`node lab.mjs qa -a tds`: clean（提案1件: 未使用コマンドのテスト → 最後の節で追加済み）。
- 直したテスト（どれも以前のセッションで「未検証」のまま入っていたもの）:
  - bench: 自分の脆弱化デバフで Crystallizer の DPS が上振れしていた → bench はタワー自身の素の DPS を測る。射程外の確認は数サイクルで十分なので短くして 240 秒に収めた。
  - Commander の APC: Support Caravan の能力でだけ出るのに、通常のスポーンでも出ていた（ID がずれて能力・クエストのテストが失敗）→ 能力専用に。
  - `/tds:code 1009`: 数字は string 引数にならない → int で受ける。
  - 報酬: 初めての Easy 勝利で Recruit バッジ（100 コイン、モードページ）も入る → 期待値 450 とバッジの確認を追加。
  - Yeti に体力閾値のフェーズはない（wiki で確認）→ Void Reaver の Void's Wrath（60%）で確認。
  - Trapper は射程 7 studs の内側に置き、Accelerator は足止めした硬い敵（`tds:stun`、テスト用）に撃たせてオーバーチャージを確認。
  - js 行に `>=` を書くとコマンドパーサが演算子と見なす → ゴーストは「0 か 1 体」を確認する形に。
  - どのテストも使っていなかったコマンド（バッジ一覧、モディファイアのメニューと一覧、スキルメニュー、DJ Booth のトラック、Sandbox の所持金・基地体力・敵）の節を追加。

### 7.1 2026-11-08
- `node lab.mjs check -a tds`: OK。`node tools/road_test.mjs 50`: 200 地形すべてで規則どおり。
- 実サーバ（BDS 1.26.63.1）: 乖離の 4 機能を足した時点で 267/267。遠征の節とエレベーターの節: 32/32（道のセルがすべて階段、地面と崖への設置、再起動）。**遠征を入れた全体: 278/278**（`node lab.mjs test -a tds`）。TASK.md の受け入れ項目はすべて [x] にした。
- 演出（scene.ts）と行き先の投票・拒否・準備を入れた全体: **303/303**。`until` の読み方の競合を直した 3 節（経済・語り部・演出）: 23/23。

## 8. 次にやること
1. 実機（クライアント）で見る: §9。特に、階段の曲がり角の形（内角・外角）と段差、空撮（カメラのスプライン）、門と拠点、ダメージ表示の名札、`tds:pace` に合わせた歩幅、死亡の倒れ方。
2. 自然生成の世界で遠征を流す: `LAB_WORLD=normal LAB_SEED=1 node lab.mjs test -a tds <遠征の節だけのファイル>`（ログは `"flat":false` になる）。
3. 計画 v2（`TDS_次セッション用プロンプト_v2.md`）の残り: 偵察隊（待ち時間の先読みと、候補の名前・★の表示）、遠征記録と今日の遠征、音楽。投票・拒否・準備と、演出（時刻・天気・霧・ボス・門の損傷・勝敗）は済み（§5 遠征）
4. GAPS.md の「やる」: 消耗品と箱、Challenge Trials、Logbooks と Index、残りのバッジ、推測値の見直し。
5. 依頼 4 の「尚且つ」の続きをユーザーに確認する。

## 9. ゲーム内で未検証（レンダー、lint、テストのみで確認済み）
- クライアント側の Molang（`pre_animation` の変数、`scale` の式、`tds:pace`・`tds:st` による動きの切り替え）
- 2層エンティティでのアニメ共有、emissive マテリアル、GeoUI の uv_anim、part_visibility のワイルドカード、マズルフラッシュの ±1000
- タレットの yaw の向きと補間、ユニットの射撃クリップ
- 遠征の見た目: 階段の角の形、空撮、門と拠点、合成した地形（木は `placeFeature` で生やし、無ければ自作の小さな木）
- ダメージ表示（名札の 2 行目）、語り部と合図の文（lang の translate）

## 10. GitHub Actions でのテスト（2026-11-08）
- このセッションは、ユーザーが GitHub を noknoh12345-afk でつなぎ直したあと、push できるようになった（`/home/claude/bds-lab` に main の shallow clone を作り、bundle で addon/tds を入れて push）。
- **verify.yml**（push で自動）: addon/tds の枝にあるラボ自体の古いオフライン検査（scratch・geoui-web・host・forge）が落ち、その後の実サーバのジョブが飛ばされる。2026-11-06 の verify も同じ。アドオンとは関係ない。
- **アドオン単体の実サーバ**: `gh workflow run unit.yml --ref addon/tds -f job=go -f unit=tds`（ラボのオフライン検査を通らない。go = テスト → 品質検査 → .mcaddon の成果物）。
  - 1 回目は失敗。CI の BDS は 1.26.61 で、manifest の `min_engine_version` が 1.26.62 だったため、パックが読み込まれず、全コマンドが無かった。→ bp と rp の両方を **1.26.60** に下げた（@minecraft/server 2.11.0 が使える最初の系列）。
- **実機（本物のアプリ）**: `app.yml` は既定ブランチ（main）で起動しないと全ジョブがスキップされる（prep の `if`）。`gh workflow run app.yml --ref main -f addon=tds -f ref=addon/tds -f mode=run -f knobs="APP_SIGNIN=0"`。
  - `node lab.mjs app ci -a tds --ref addon/tds` は addon/tds の上で起動してしまい、スキップされた。
  - 1 回目（main）: Play とアカウントの準備まで進み、端末の土台は暗号化キャッシュに入った（4.9 GB）。Microsoft のサインインの段階で失敗（MS_EMAIL / MS_PASSWORD が無いか二段階）。→ `APP_SIGNIN=0`（LAN 参加にサインインは要らない）。
- シナリオは `bds/addons/tds/app.txt`（タイトル → 参加 → ロビーの HUD → 訓練場と敵 → 遠征: 到着、空撮、拠点、門、階段の角、坂、橋、真上、タワーと敵 → クライアントのエラーが無いこと）。見どころへの移動は `/tds:siteview`。結果は `node lab.mjs app ci watch <番号>` で `app/runs/gh-<番号>/` に取る（main のラボで）。
- **結果（2026-11-08）**:
  - unit go（run 42403343936、BDS 1.26.61.1）: test 280/280、QA clean、.mcaddon の成果物。
  - 実機（run 42408059626、アプリと BDS 1.26.62.1）: **PASS（手順 74 個）**、参加 43 秒、クライアントのエラーなし。写真と動画 19 個は Discord に届く。成果物は暗号化されていて、`APP_CACHE_KEY`（または同じ `GOOGLE_AAS_TOKEN`）を `.env.local` に入れた手元で `node lab.mjs app ci watch 42408059626` を実行すると開ける。
  - シナリオで試合を始めるときは `do execute as @a run tds:play ...` を使う（アプリのチャットに打った `/tds:play` は実行されなかった。run 42403346240）。
  - 実機 2 回目（run 42424313404、演出・投票を入れた 492de28）: **PASS（手順 87 個）**、写真と動画 22 個、クライアントのエラーなし。
  - unit go（run 42424058996 = 492de28、42424310777 = 58a1e68）: test 302/303。落ちたのは経済の節の `~ "ev":"wave_clear"`（`until "ev":"wave_cash"` の下）だけ。シミュレーションは手元と同じ（同じ敵が同じ位置で倒れている）。原因はテストの読み方: `until` は待つ行を読んだ瞬間に終わり、その下の確認はそこまでの出力しか見ない。wave_clear は同じティックで wave_cash の直後に出るが、CI では次のコマンドが始まってから読まれた。
    → 各 `until` は確認に要る最後の行を待つようにした（経済・語り部・演出の 3 か所）。見つけ方: `LAB_DUMP=<file> node lab.mjs test -a tds` → `node tools/until_race.mjs tests.txt <file>`（待つ行より後にしか無い行を確認しているところを挙げる）。
