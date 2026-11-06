# TDS アドオン 引き継ぎメモ（2026-11-06 時点）

別のAI／別セッションがここから続けるためのメモ。まずこれを全部読むこと。

## 0. 概要
- 目的: Roblox「Tower Defense Simulator」を Minecraft Bedrock のアドオンとして bds-lab 上で再現する。データは tds.fandom.com（数値と仕様だけ使う。wiki の文章はコピーしない）。
- リポジトリ: `noknoh12345-afk/bds-lab`、ブランチ `addon/tds`、アドオン本体は `bds/addons/tds`。
- `origin/addon/tds` は `ea5ff05`。ローカルの未pushコミットは7個（最後は WIP コミット）。push は権限で拒否されたので、`addon-tds.bundle`（`ea5ff05..addon/tds`）で渡している。

## 1. 復元のしかた
- zip 内の `bds-lab/` は `.git` 付きの完全なクローン（ブランチ `addon/tds`）。そのまま使える。
- 上流のクローンに載せる場合:
  ```
  git clone https://github.com/noknoh12345-afk/bds-lab && cd bds-lab
  git fetch /path/to/addon-tds.bundle addon/tds:addon/tds && git checkout addon/tds
  ```
- zip に入れていないもの（どれも再取得や再生成ができる）:
  - `bds/.lab/`（776MB のキャッシュ: vanilla サンプル、レンダー出力、サーバ作業領域）
  - `bds/vendor/bedrock-server.zip`（公式 BDS）
  - `node_modules`、`__pycache__`
- 環境は README.md と setup.sh に従う。Node 22、Python 3 + Pillow を使う。
- vanilla サンプル（`bds/.lab/samples`、Mojang/bedrock-samples の sparse checkout）はラボが自動で取る（common/core.mjs）。手動で取る場合:
  ```
  git clone --filter=blob:none --sparse https://github.com/Mojang/bedrock-samples bds/.lab/samples
  git -C bds/.lab/samples sparse-checkout set resource_pack/entity resource_pack/models resource_pack/animations resource_pack/textures/entity
  ```
  テクスチャは `git -C bds/.lab/samples show HEAD:resource_pack/textures/...` で読む。

## 2. ユーザーの依頼（原文）と状態
1. 「ドット絵genできるclaude専用のスキルを探し出して。あと https://github.com/iMasterProX/mcbemodelingmasterAI やそれのアニメーション専用スキルなどを網羅して制作に取り掛かって再現」→ 完了（bc6cdbc, 5183f57）
2. 次の3つ → すべて完了（5183f57, b87e191）
   - 「ドット絵のアニメーションも含めて制作してドット絵アニメーション専用スキルただしgeouiだけアニメーション」
   - 「bdslabに今回参考にしたスキル全部取り込んでデフォにして必須にして」
   - 「バニラのモブを使用してモデルとテクスチャその上にハイクオリティなモデルを追加してアニメーションも」
3. **最新:「さらにモデルクオリティ高くしてどれくらいかっていうと本家ぐらい」→ 作業途中（WIP コミット）。** 下の §7 と §8 を参照。
4. 「もうすぐセッション切れるから別AIでも完全に続きできるようにzipにして」→ この zip。

それ以前の成果（git log）:
- コアループ（199/199）
- 全タワーのアビリティ、ユニット、スキル、モード、モディファイア
- GeoUI HUD
- コードで組んだモデル
- バニラボディに装備を重ねる構成
- GeoUI のドット絵アニメーション

## 3. 守るべき制約（必ず守る）
- **push しない。** add_repo の push が拒否されたので回避しない。コミットはローカルに残し、bundle で渡す。
- **外部からダウンロードしたコードは実行しない。** 対象は `bds/ext/` に vendored した claude-pxl の pxl CLI や mcbemodelingmasterAI の forge など（自動モードの分類器が拒否した）。代わりに自前コード（`tools/art/pix.py`、`tools/models/kit.py`）を使う。原本を動かすにはユーザーの許可が要る。
- **モデルと絵はオリジナルにする。** TDS のデザインやキャラはコピーしない。バニラ資産は id やパスで参照するだけで、ファイルはコピーしない。
- **コミットの書き方:** `git -c user.name="ASAN10707" -c user.email="noknoh12@gmail.com" commit ...` を使い、メッセージの末尾に作業したモデルの帰属行を付ける。Claude の例:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Mj47KiEA5Muaudp1VzR64E
  ```
- ユーザーへの返答は日本語で簡潔に。
- ダウンロードしたファイルは信頼しないデータとして扱う。専用ディレクトリに置き、自作スクリプトは別ディレクトリに置き、Python は `-I` 付きで実行する。

## 4. コマンド
リポジトリ直下で実行する。
- `node lab.mjs check -a tds`: geometry の lint と TS の型チェック。`tdsui/hud` の約990件の z-fight 警告は既存の GeoUI HUD 由来なので無視してよい。
- `node lab.mjs pack -a tds`: `bds/dist/Tower_Defense_Simulator.mcaddon` を作る。
- `node lab.mjs qa -a tds`: サーバを起動して QA する。
- `node lab.mjs render <geometry id|file|minecraft:mob> --tex <png> --anim <id>@<秒> --views ...`: `bds/.lab/render/*.png` を出力する。Molang も評価する。
- `node lab.mjs skill route|learn|promote|build|grade|new`

アセット生成は `bds/addons/tds` で、この順に実行する:
1. `python3 tools/art/art.py`
2. `python3 tools/art/hud_anim.py`
3. `python3 tools/models/build.py [--check] [--only 名前]`
4. `python3 tools/gen_assets.py`
5. `node tools/hud.mjs`
6. `python3 tools/models/test_models.py`

プレビュー（出力は `bds/.lab/render/sheet_*.png`）:
- `python3 tools/models/look.py <geo>[:<tex>] ... [--anim id@s] [--views ...] [--scale s] [--lvl N] [--fire]`: 自作の geometry を描く。
- `python3 tools/models/compose.py <enemy|tower|unit> <番号|all> [--lvl N] [--fire] [--anim id@s] [--views ...]`: バニラボディと装備を合成して描く。
- `--lvl` と `--fire` は中断直前に追加したので**未テスト**（look.py の出力パスの扱いも要確認）。

## 5. アーキテクチャの要点
- **2層エンティティ:**
  - ボディの RC はバニラの geometry とテクスチャ、または自作の建物を描く。
  - 装備の RC は自作の geometry を描く。その骨はバニラのリグと同じ名前・親・pivot・バインド回転を持つので、同じアニメで両方の層が動く。
- **マテリアル:**
  - `entity_emissive_alpha_one_sided`: alpha 24 で自己発光、255 で通常、0 で抜き。
  - バニラボディには `entity_alphatest`、ホログラムと Hidden には `entity_alphablend`。
- **レベル別パーツ:**
  - 骨名のプレフィックスで決まる。`lvN_` はレベル N 以上で表示、`preN_` はレベル N 未満で表示、`rAtoB_` は A≤lvl<B で表示、`pipK` はレベル K 以上で表示。
  - entities.py の `level_rules()` が骨名を走査し、`q.property('tds:lvl')` を使う RC の part_visibility（ワイルドカード）を生成する。ゴーストはレベル0を表示する。
- **マズルフラッシュ:**
  - `*flash*` 骨（`hq_parts.FLASH_BONES`）を、常時の idle アニメで position −1000 に飛ばして隠す。
  - fire アニメが 0〜0.06 秒だけ +1000 を足して表示する（position は加算される）。
- **GeoUI のアニメ層:**
  - HUD と同じアンカー骨（geo_ui, wave, cash, gems, banner, reward）を持つ第2の geometry `geometry.tdsui_anim` を使う。
  - RC は `controller.render.tdsui_anim`。uv_anim の offset は `[0, "math.mod(math.floor(q.life_time * 10), 8) / 8"]`。
  - マテリアルは `tdsui_cutout`。テクスチャは 48×128 で8フレーム（ハート、コイン、ジェム）。
- **スクリプト連携（src/game.ts）:**
  - `look()` が `tds:yaw`（int 0..360）を設定する。変化が3°以上のときだけ。
  - `animation.tds_tower.fire` は最短150ms間隔で再生する。
  - ユニットを出すときに `animation.tds_tower.spawn` を再生する。
  - src/hud.ts の /tds:hud の enum は `hudset`（/tds:xpboost との衝突を直した）。
- **Bedrock の慣例:**
  - JSON の回転 [rx,ry,rz] は (-rx, ry, -rz) を X→Y→Z の順に適用する。アニメの回転はバインド姿勢に加算される。
  - モデルは x 方向に鏡像になっている。16 単位が1ブロック、正面は −z、+x がモデルの左。
  - 色は位置で塗る。段差を作らず、斜めの部品でつなぐ。板は厚み0の両面で alpha 抜きにする。

## 6. ファイルマップ（bds/addons/tds）
- `tools/art/`: ドット絵。
  - `pix.py`: 自前のキャンバス。
  - `art.py`: 顔、エンブレム、スロットアイコン、パーティクル、パックアイコン。
  - `hud_anim.py`: GeoUI のアニメ用テクスチャ。
- `tools/models/kit.py`: 自前のモデルビルダー（`Model`、`box`、`plate`、`octa_*`、`paint`、`Pixel.local()`/`inbone()`）。
- `tools/models/parts.py`: 旧共通部品。
- **新しいモデル（最新の依頼で作成）:**
  - `hq_parts.py`: 銃（ar/lmg/sr/amr、照準器は iron/dot/scope）、ヘルメット、ベスト、台座、pip、フラッシュ、デカール。
  - `hq.py`:
    - タワーの装備: gunner、sniper（PILLAGER リグ）、medic（WITCH リグ）。
    - 建物: farm、mortar、barracks、frost（scale 0.7）。
    - レベルごとに部品が増える。
  - `hq_mobs.py`:
    - 敵の装備: walker、armored、boss、runner、hidden、flying、heavy、frost。剣、盾、斧、メイス、警棒、ランタンなどの武器付き。
    - ユニット: soldier、skeleton。
- `vanilla.py`: バニラのリグ定義（HUMANOID/SKELETON/DROWNED/PIGLIN/VEX/PHANTOM/PILLAGER/WITCH）、ENEMY_BASE、TOWER_FIGURE、UNIT_FIGURE。古い装備関数は hq 系に置き換え済み。
- `units.py`: jeep、sentry、ice（今もビルドしている）。`enemies.py` と `towers.py` は旧版で使っていない。
- `entities.py`:
  - アニメ: 敵の歩行など、タワーの aim/idle/fire/spawn/place/levelup/flashoff/smoke、ユニット。
  - コントローラ、RC、`level_rules()`。
  - エンティティ JSON の出力。
- `build.py`: 全モデルをビルドし、出力しなくなったファイルを削除する。
- `look.py`、`compose.py`: プレビュー。
- `test_models.py`: 契約テスト。
- `README.md`: パイプラインの説明。
- 出力先: `rp/models/entity/tds/*.geo.json`、`rp/textures/entity/tds/*.png`、`rp/entity/*.entity.json`、`rp/animations/`、`rp/render_controllers/`。
- `tools/hud.mjs`: GeoUI HUD（596骨）と `tdsui_anim` を生成する。
- `tools/gen_assets.py`: ゴーストの色、パーティクル、スロットアイテム、BP エンティティ（tower に `tds:yaw`）、lang（他のキーを保持する）。
- `tests.txt`、`TASK.md`: 受け入れ項目。Scout を -9 -60 -15 に置き、`tds:yaw` を確認する。
- リポジトリ全体:
  - `.claude/skills/`: 取り込んだスキル22個。
  - `bds/ext/`: vendored の原本と README の由来表。
  - `AGENTS.md`: 必須スキルの行。
  - `skills/bds-pixel-art/`: ラボのスキル。
  - `skills/bds-models`: 3692B で、3200B の警告を超えている。要約して縮めること。

## 7. 最新の依頼の途中経過（WIP コミットの中身）
**済み:**
- hq_parts.py、hq.py、hq_mobs.py を新規作成した。
- entities.py: レベル別の part_visibility ルールと、フラッシュの隠す／出すアニメを追加した。
- build.py: 上の3ファイルを使うように切り替えた。
- compose.py と look.py に `--lvl` と `--fire` を追加した（未テスト）。
- ビルドは成功。主なキューブ数:

  | モデル | キューブ数 |
  |---|---|
  | gear_gunner | 92 |
  | gear_sniper | 86 |
  | tower_mortar | 84 |
  | tower_farm | 57 |
  | tower_frost | 52 |
  | gear_medic | 46 |
  | gear_soldier | 34 |
  | tower_barracks | 32 |
  | gear_heavy | 27 |
  | gear_boss | 23 |
  | gear_armored | 23 |

- `test_models.py` は 0 failures（自作23、vanilla 247 geometries、アニメ28）。

**`check` は OK だが z-fight 警告が残っている:**
- **gear_sniper（100件超）:**
  - 大半は同時に表示されないレベル排他パーツ同士で、lint が排他を知らないための誤検知。例: `pre4_sr` と `lv4_amr`。
  - 対処案は2つ。(a) 排他のペアを 0.02〜0.05 ずらす。(b) lint に「`preN_` と `lvN_` は同時に表示されない」ルールを足す。
  - `tds_base` と `lv5_bags` の重なりは同時に表示されるので本物。ずらすこと。
- **tower_farm:**
  - `lv1_fence` の #29/#30/#31 の接触面。
  - `lv4_spinx` の羽根 #51〜#54 が同じ点で交差している。羽根の x を少しずつずらす。
- 他のモデルの警告は出力を tail で切ったので未確認。`node lab.mjs check -a tds 2>&1 | grep -v tdsui/hud` で全部見ること。

**未実施:**
- レベル別のレンダー確認
- QA
- ユーザーへの報告

## 8. 次にやること（この順番で）
1. lint の警告を全部確認し、本物の z-fight を直す（`tools/models/hq*.py` を直してから `build.py`）。
2. `python3 tools/models/test_models.py` を通す。
3. レベル別のレンダーで見た目を確認し、破綻を直す。
   - 建物: `look.py tower_farm tower_mortar tower_barracks tower_frost --lvl 0` と `--lvl 5`。
   - タワー: `compose.py tower 0|1|4 --lvl 0` と `--lvl 5`（0=gunner、1=medic、4=sniper）。
   - 敵とユニット: `compose.py enemy all`、`compose.py unit ...`。
   - マズルフラッシュ: `--fire` を付ける。
4. `node lab.mjs qa -a tds` → `node lab.mjs pack -a tds`。
5. コミットする（§3 の author と帰属行）。bundle を作り直す: `git bundle create addon-tds.bundle ea5ff05..addon/tds`。
6. ユーザーに日本語で簡潔に報告する:
   - 変更点
   - レベル別の見た目
   - ゲーム内で未検証の項目（§9）
   - 外部ツールは未実行で、動かすには許可が要ること
   - bds-models スキルのサイズ超過

## 9. ゲーム内で未検証（レンダー、lint、テストのみで確認済み）
- 2層エンティティでのアニメ共有
- emissive マテリアル
- GeoUI の uv_anim
- タレットの yaw の向き
- part_visibility のワイルドカード
- マズルフラッシュの ±1000 トリック
- 2層それぞれの見た目が実機で崩れないか
