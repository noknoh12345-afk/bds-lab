# TDS アドオン 引き継ぎメモ（2026-11-07 時点）

別のAI／別セッションがここから続けるためのメモ。まずこれを全部読むこと。

## 0. 概要
- 目的: Roblox「Tower Defense Simulator」を Minecraft Bedrock のアドオンとして bds-lab 上で再現する。データは tds.fandom.com（数値と仕様だけ使う。wiki の文章はコピーしない）。
- リポジトリ: `noknoh12345-afk/bds-lab`、ブランチ `addon/tds`、アドオン本体は `bds/addons/tds`。
- `origin/addon/tds` は `ea5ff05`。それ以降のコミットはローカルだけにある（push は権限で拒否されたので、`addon-tds.bundle`（`ea5ff05..addon/tds`）で渡している）。

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
6. 「すべてanimation作って凝って違和感なく本家と同じように再現して完成させて」→ 全エンティティのアニメーションを作り直し、失敗していたテストを修正（このメモと同じコミット）

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
- `node lab.mjs check -a tds`: geometry の lint（z-fight・UV）と TS の型チェック。いまは警告 0（HUD も含む）。
- `node lab.mjs test -a tds`: tests.txt を新しい実サーバで流す（約15分）。`node lab.mjs qa -a tds`、`node lab.mjs pack -a tds`（`bds/dist/Tower_Defense_Simulator.mcaddon`）。
- `node lab.mjs run -a tds "<cmd>" ...`: 新しいワールドでコマンドを流し、全部表示する（失敗の調査用）。
- アセット生成（`bds/addons/tds` で、この順）: `python3 -I tools/art/art.py` → `python3 -I tools/art/hud_anim.py` → `python3 -I tools/models/build.py` → `python3 -I tools/gen_assets.py` → `node tools/hud.mjs` → `python3 -I tools/models/test_models.py`
- プレビューと監査: `python3 -I tools/models/sheet.py <enemy|tower|unit> [--only "A,B"] [--lvl 0|N|top] [--fire] [--per N --cols N --size WxH]`（`bds/.lab/render/sheet_roster_*.png`）、`--audit --no-render`（装備が体に埋まる・刺さる・バニラの面と同一平面: 3種とも 0 件）。
- ラボのレンダラは Molang の変数を 0 として扱うので、歩きや死亡の動きはそのままでは描けない。動きを見るときは変数を時間の式に置き換えた一時クリップを rp に置いて描き、すぐ消す（このセッションでは scratch の animprev.py でやった。再現するなら tools/models/motion.py の変数の意味どおりに置換する）。

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

## 6. ファイルマップ（bds/addons/tds）
- `tools/models/`: `kit.py`（モデルビルダー）、`rigs.py`（バニラのリグ）、`roster*.py`（全エンティティのレシピ）、`kitbash.py`（敵の服と装備）、`tailor.py`・`arms.py`・`towerkit.py`（人型・武器）、`bodies.py`・`critters.py`・`vehicles.py`・`buildings.py`（自作の体）、`motion.py`（敵とユニットの動き）、`entities.py`（タワーの動き、エンティティ、RC）、`roster_entities.py`（敵とユニットのクライアントエンティティ）、`build.py`、`sheet.py`・`audit.mjs`（プレビューと監査）、`test_models.py`、`README.md`。`hq*.py`・`vanilla.py`・`enemies.py`・`towers.py`・`parts.py` は旧版（一部はまだ参照される）。
- `tools/gen_assets.py`（BP エンティティとプロパティ、パーティクル、スロットアイテム、lang）、`tools/hud.mjs`（GeoUI HUD）、`tools/art/`（ドット絵）。
- `src/`: `game.ts`（試合）、`abilities.ts`（タワー能力・特殊タワー）、`placement.ts`、`lobby.ts`、`progress.ts`（Hidden Wave、バッジ、Sandbox）、`skills.ts`、`modifiers.ts`、`hud.ts`、`bench.ts`、`main.ts`（コマンド）、`looks.ts`（生成）。
- `tests.txt`（受け入れ項目）、`TASK.md`。

## 7. 検証の状況（2026-11-07）
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

## 8. 次にやること
1. 実機（クライアント）で見る: 下の §9。特に `tds:pace` に合わせた歩幅、死亡の倒れ方、タワーの照準の回り方、ユニットのマズルフラッシュ。
2. 1.26.52 など古い BDS で動かす場合は manifest の `min_engine_version`（いま 1.26.62）を下げる必要がある（`test --bds` の失敗はこれが原因）。
3. 依頼 4 の「尚且つ」の続きをユーザーに確認する。

## 9. ゲーム内で未検証（レンダー、lint、テストのみで確認済み）
- クライアント側の Molang（`pre_animation` の変数、`scale` の式、`tds:pace`・`tds:st` による動きの切り替え）
- 2層エンティティでのアニメ共有、emissive マテリアル、GeoUI の uv_anim、part_visibility のワイルドカード、マズルフラッシュの ±1000
- タレットの yaw の向きと補間、ユニットの射撃クリップ
