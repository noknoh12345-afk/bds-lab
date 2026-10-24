# GeoUI の規則の台帳 — サーバーの値が画面の画素になるまで（と、指が値になるまで）

GeoUI がマイクラの画面に「反映される」道を、段ごとに規則として並べる。どの規則にも **ID・状態・出どころ・設計への意味** を付け、
まだ決まっていない物（仮説）には、それを決める実験と、実験の前に書いた予測を付ける。式と使い方は [SPEC.md](SPEC.md)。

**状態**
- **一次資料**: Mojang の資料そのもの（バニラのファイル・公式の文書・Script API と Molang のメタデータ）に書いてある。
- **測った**: 本物のアプリ（または本物の BDS）で測った。どの実行かを書く。
- **式**: 一次資料と測った事から導いた。オフラインの試験が確かめる。
- **仮説**: まだ決まっていない。決める実験と予測がある（`bds/addons/geoui_rules` の `predictions.json`・`geoui_device`）。
- **二次資料**: Mojang 以外の人がまとめた物（bedrock.dev の wiki など）。一次資料か実験で確かめるまで仮説の材料にだけ使う。

**一次資料**（リポジトリには入れない: Mojang のファイル）: `Mojang/bedrock-samples` の 1.26.50.4（commit 46ba6ea）。

```sh
git clone --filter=blob:none --sparse --depth 1 https://github.com/Mojang/bedrock-samples.git
cd bedrock-samples && git sparse-checkout set resource_pack/ui resource_pack/entity resource_pack/animations resource_pack/animation_controllers metadata
```

入力の一次資料は `Mojang/bedrock-protocol-docs`（1.26.70-preview.21 のメタデータ、`json/PlayerAuthInput*.json`・`additional_docs/`）。

使ったファイル: `resource_pack/ui/hud_screen.json`・`ui_common.json`・`inventory_screen.json`・`_global_variables.json`、
`resource_pack/entity/player.entity.json`、`resource_pack/animations/*.json`・`animation_controllers/*.json`、
`metadata/doc_modules/animations.json`（render controller とアニメーションの公式の文書）、`metadata/molang_modules/mojang-molang-queries.json`、
`metadata/script_modules/@minecraft/server-bindings_*.json`（Script API の版ごとの中身）。

## 0. 全体の道

```
[サーバー: BDS のスクリプト]                         [クライアント: 各プレイヤーのアプリ、毎フレーム]
 段 1 setProperty(int) ──(client_sync, 20 tick/秒)──▶ 段 2 player.entity.json: scale・initialize・pre_animation（Molang）・animate
                                                       段 3 ボーン（位置・大きさ・回転）・part_visibility・材質・光
                                                       段 4 HUD の live_player_renderer がモデルをパネルに写す（K・D・正射影）
                                                       段 5 JSON UI がパネルを画面に置く（寄せ先・%x %y・セーフエリア・GUI の倍率）
                                                       段 6 画面（px・切り欠き・向き）
 段 7 getRotation・inputInfo・イベント ◀── 入力 ──    指・キー・パッド（PlayerAuthInput）
 段 8 時間（tick とフレーム）  段 9 寿命と共存（版・他のパック）
```

## 1. サーバー → プロパティ

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R1.1 | 道はプレイヤーの int のプロパティ（`client_sync: true`）。1 実体 32 個まで。float32 なので ±2^24 まで正確 | ゲームの決まり／測った（GeoUI Builder の BP） | 値はまとめて 1 つの int に詰める（`fha` = 焦点・ポインタの下・押している 8 bit ずつ） |
| R1.2 | 変わった値だけ送る（同じ値の入れ直しは送らない） | 式（`html/runtime.js` の `set`） | 毎 tick 全部入れない |
| R1.3 | `Player.setPropertyOverrideForEntity` で、見る人ごとに違う値を渡せる | 一次資料（Script API 1.19.0〜） | 複数人で同じ物を別の見た目で、の道（今は使っていない） |
| R1.4 | 値が届いて描かれるまでの時間 | 仮説（要実測） | 入力からの遅れの目安が要る（8 章） |

## 2. クライアントの実体（player.entity.json）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R2.1 | バニラの player の `scripts.scale` は `"0.9375"`。scale は Molang の式でもよい（バニラの他の実体が `q.is_baby`・`variable.*` を使う） | 一次資料（`player.entity.json`・他の実体） | K の 0.9375 の出どころ（R4.1）。`pack.js` の `scaleScript` で UI の中だけ変えられる |
| R2.2 | バニラの `animate` は `["root"]` だけ。`controller.animation.player.root` が `variable.is_paperdoll` で paperdoll の状態、そうでなければ `variable.is_first_person` で一人称／三人称の状態 | 一次資料（`animation_controllers`） | GeoUI の renderer（live_player_renderer）では is_paperdoll が 0 なので、プレイヤーの今の視点の状態のアニメーションが走る |
| R2.3 | 姿勢のアニメーション（swim・crawl・sleeping・riding.root）が動かすのはバニラの `root`・腕・頭だけ。`override_previous_animation` は「この animation の骨」だけを初めの姿に戻す。**GeoUI は姿勢で動かない**: サーバーからしゃがむ・眠る・泳ぐのアニメーション・ボート・三人称の後ろと前で、目盛りの高さと中心は同じ実行の基準の写真と 0.1 %・0.1 単位以内（ボートだけ 0.01 %・0.008 単位） | 一次資料（`animations/*.json`・公式の文書）＋**測った**（run 40055307539、2026-10-24。姿勢そのものが起きたかは封じた写真の中: 公開の数からは言えない） | GeoUI の骨は自分の root に下げる（バニラの骨の子にしない: 試験が確かめる） |
| R2.4 | pre_animation で、まだ入れていない自分の変数を `??` なしで読むと、その行から後が毎フレーム止まる | 測った（probe 1・2 回目） | `GeoUICore.unsetReads` が書き出しの前に見つける |
| R2.5 | 人形（paper doll）にはプロパティが無く、`q.property` がエラーになり後が止まる | 測った（probe 2 回目） | 読みは全部 `variable.is_paperdoll ? 0 : q.property(…)`。scale の式も同じ |
| R2.6 | Molang: 1 行 1000 文字・括弧 24 段まで、1 つの pre_animation で 61 万文字・5029 行・変数 約 5000 まで動いた | 測った（probe_m・sz・lc・vx） | 長い表は 16 ずつの行に（`tableLines`） |
| R2.7 | 使えるクエリ: `q.is_in_ui`（UI の中で描く時 1）・`q.is_local_player`（分割画面では他の画面の自分は 0）・`q.model_scale`・`q.frame_alpha`（tick の間の割合）・`q.delta_time`・`q.time_of_day`・`q.is_invisible`・`q.camera_rotation` ほか 379 個 | 一次資料（Molang の一覧） | tick の間を補う・分割画面を見分ける道がある。`q.model_scale` が体の大きさ（minecraft:scale）を返すかは R4.9 |

## 3. 描く物（ジオメトリ・render controller・材質・光）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R3.1 | render controller の項目（公式の文書）: geometry・materials・textures・part_visibility・color・is_hurt_color・on_fire_color・overlay_color・arrays。**光を切る項目は文書に無い**。`uv_anim` は文書に無いが効く | 一次資料（`doc_modules/animations.json`）／測った（uv_anim: probe 2 回目） | 光は材質か実験で扱う（R3.7） |
| R3.2 | `color.a` は blend の材質で効かない。色のマスク（`USE_COLOR_MASK`）の fade で効く | 測った（probe 2・3 回目） | 不透明度は fade で |
| R3.3 | ボーン 600 本（#599 も）・自分の render controller 70 個・アニメーション 1200 個まで描かれた | 測った（probe_b ほか） | `pack.js` が超えると注意 |
| R3.4 | 同じボーンの scale は掛け算・position は足し算・正の回転は画面で時計回り | 測った（probe 3 回目） | |
| R3.5 | 同じ平面に 2 枚の面はちらつく | 式（ラボの模型の確かめ） | `pack.js` が 0.021 ずつ奥へ |
| R3.6 | part_visibility は子の無いボーンだけに使う | 式（隠した親の子がどうなるかは要実測） | 状態ごとの見た目は葉のボーン |
| R3.7 | **板の色に光がかかる**: カメラを向いた平らな板は 出る色 = 0.7536 x 入れた色 + 2.3（昼）・0.7572 x − 0.3（真夜中）。9 段の灰色（0〜255）で**まっすぐ**（ガンマの曲がりなし）、**昼と真夜中で同じ** = ワールドの明るさでなく UI の自分の光 | 測った（run 39989463030 の赤・白、run 40055307539 の 9 段 x 昼・真夜中）→ **仮説**: 暗視・光の無い閉じた箱でも同じ 0.757 | 色は 0.757 倍で出ると見て作る（白 255 は 193）。白を白に出す道は R3.11、向きは R3.12。決める実験: `geoui_rules` 2 本目の light-nightvision・light-box |
| R3.8 | ダメージの赤（is_hurt_color）・火（on_fire_color）は a 0 で GeoUI にかけない。そもそも GeoUI の材質は `USE_OVERLAY` を立てていない（バニラの `entity` は `entity_static` に `USE_OVERLAY` を足した物: 二次資料。重ねる色はこの define の材質にだけ効く見込み） | 式（`pack.js`）→ **仮説**（run 40055307539 の hurt は公開のまとめが 40 個で切れて残らなかった） | 決める実験: `geoui_rules` 2 本目の hurt（3 回。USE_OVERLAY の無い白と有る白、予測: どちらも赤くならない） |
| R3.9 | 透明化のポーション: バニラの player の render controller は `q.is_invisible` を見ない（蜘蛛は自分で材質を替える） | 一次資料 → **仮説**: ゲームが体ごと描かない（run 40055307539: 透明化の間は目盛りが見つからなかった。写真は封じた結果なので、描かれないのか測れなかっただけかは公開の数から言えない） | 描かれないなら、透明化のポーションの間は GeoUI が消える: 透明化を使う遊びでは使えない。決める実験: `geoui_rules` 2 本目の invisible（大きな白と黒の色で） |
| R3.10 | RenderDragon の材質の中身（.material.bin）は bedrock-samples に無い。バニラの材質の JSON（`entity.material`）の defines: `entity` = `entity_static` + `USE_OVERLAY`、`entity_alphatest` = `entity_nocull` + `ALPHA_TEST`、光る物は `entity_emissive_alpha`（テクスチャのアルファが小さいほど光る） | 一次資料（無いことを確かめた）／二次資料（bedrock.dev の wiki: Materials・Glowing Entity Texture） | 光・色の形は実験でしか決まらない（R3.11） |
| R3.11 | 白を白に（光の 0.757 倍より明るく）出せるか: (1) 色のマスクの fade に render controller の `color` 1.32（= 1 / 0.757）、(2) `USE_OVERLAY` の材質に白の `overlay_color`（光の後に混ぜるなら明るくなる）、(3) `USE_EMISSIVE` の材質とテクスチャのアルファ（バニラの光る物のやり方） | **仮説** | 出せれば白・原色をそのまま使える（文字・アイコンが暗くならない）。決める実験: `geoui_rules` 2 本目の brighten（10 枚 x そのまま・色 1.32・重ねる色 0.24）。予測は下の表 |
| R3.12 | 面の向きで明るさが変わる: 白 255 を x のまわりに −45°（上へ）で 107、45°（下へ）で 235、y のまわりに 45° で 148（真夜中も ±2）。**y のまわりに −45° の 1 枚（x 120・y 135）は描かれなかった**: その所に見えたのはワールドの色（昼も真夜中も） | 測った（run 40055307539）→ **仮説**: 光の向き（傾きの関数）と、描かれなかった訳（その向きか・その場所か） | 板は傾けずカメラに向ける（傾けると色が変わる・消えることがある）。決める実験: `geoui_rules` 2 本目の tilt（y と x のまわりに −60〜60°、同じ −45° を元の所と左端に、平らな板を両端に） |

## 4. renderer（live_player_renderer）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R4.1 | **1 モデル単位 = scripts.scale / 16 x min(パネルの幅, 高さ)**。バニラの scale 0.9375（R2.1）で K = 0.05859375、つまり**世界の 1 ブロック = パネルの短い辺** | **測った**（run 40055307539: UI の中の scale 0.5・0.75・1・1.5 で目盛りの高さ 320.000・213.333・160.000・106.667 = 160 / scale と 0.000 %。0.9375 は 1 単位 4.22 px で端がぼけ 171.29 と 0.37 % 大きく読める）＋一次資料 | `layout.js` の K。UI の中の scale を変えれば単位を変えられる（`pack.js` の `scaleScript`） |
| R4.2 | **モデルの原点はパネルの真ん中の D = 24 モデル単位下**（scale によらない: モデルの単位で決まる M） | **測った**（run 40055307539: 4 つの scale で D = 24.000、ブロックで決まる W なら scale 0.5 で 21 単位ずれる） | `layout.js` の D = 24（前の 24.10 ± 0.17 は 0.9375 のぼけの分） |
| R4.3 | 正射影（縦横の尺度は同じ 0.9999、奥行き ±60 で大きさ 0.9999 / 1.0000: どの scale でも） | 測った（2026-10-21・run 40055307539） | z は重なりの前後だけ。どこまで描かれるか・どちらが手前かは R4.10 |
| R4.4 | HUD の自前の人形は `hud_player_renderer`（`#paper_doll_visible`）、持ち物の人形は `live_player_renderer` で `property_bag: {"#look_at_cursor": true}` | 一次資料（`hud_screen.json`・`inventory_screen.json`） | GeoUI の renderer は property_bag なし。`#look_at_cursor` は名前と paperdoll の状態の `look_at_target_ui`（頭 = `q.target_x_rotation`・`q.target_y_rotation`）から、頭がカーソルを向く物と見られる（GeoUI に使えるかは仮説・未実験） |
| R4.5 | パネルの外にはみ出した物も描かれる | 測った（Studio のやり方・device の over） | どの renderer もモデル全体を描く → 他のグループや体が映らない置き方（R5.6） |
| R4.6 | renderer に `#hud_visible` を結ぶと、F1 で HUD と一緒に消える | 式（バニラの `#hud_visible`） | `pack.js` の既定 |
| R4.7 | pre_animation が renderer ごとに動くか | **仮説** | 決める実験: `geoui_device` の rc の棒 |
| R4.8 | プレイヤーの `minecraft:scale`（サーバーの component。他のアドオンが変える）は**単位に掛かる**: 0.5 にすると目盛りの高さ 340.83 単位（いつもの 1.99 倍）・中心 245.80（scale 0.46875 の式で 245.87） | **測った**（run 40055307539） | 他のアドオンが体を小さくすると GeoUI も縮む。打ち消し方は R4.9 |
| R4.9 | UI の中で scripts.scale を `q.model_scale` で割れば、体の大きさ（minecraft:scale）を打ち消せる | **仮説**（`q.model_scale` が minecraft:scale を返すか・scripts.scale を含むかは一次資料に無い） | 打ち消せれば `pack.js` の scaleScript の既定にする。決める実験: `geoui_rules` 2 本目の comp（予測: 打ち消せれば 170.67 単位、だめなら 341.33。q.model_scale が 0.05 未満なら割らない） |
| R4.10 | 奥行き: どの z まで描かれるか・2 枚のどちらが手前か（`pack.js` は小さい z を手前としている）・長い板。run 40055307539 で、y のまわりに −45° の板の所には、その後ろの z 50 の灰色の板も見えなかった | **仮説** | 背景の板をどの z に置けるかが決まる。決める実験: `geoui_rules` 2 本目の depth（z −150〜150 の白い四角を空と地面の前に、赤 z +5 と緑 z −5 の重なり、z 0 と 50 の長い板）と、目盛りの黒い板（z 100） |

## 5. JSON UI（配置）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R5.1 | 木: base_screen → セーフエリアの枠（`ui_common.json` の safezone_*。大きさの変数 `$left_horizontal_safezone_size` などは JSON に無くゲームが入れる）→ hud_screen → `hud_content`（`$compress_hud_width` で幅 90 %）→ `root_panel`。`$compress_hud_width`・`$desktop_screen`・`$education_edition` もゲームが入れる | 一次資料（`hud_screen.json`・`ui_common.json`・`_global_variables.json` に無い） | GeoUI の viewport は root_panel の先頭、縮む時は 111.1 %（SPEC 4 章） |
| R5.2 | `%x`・`%y`・`max_size`・寄せ先・offset の式 | 測った（run 39989463030: 横向き 10 種で 1 px 以内、contain の箱 0〜1 px） | SPEC 5・6 章の式をそのまま使ってよい |
| R5.3 | GUI の倍率: 測った 10 画面（高さ 720〜920 で 3、1080 で 4）は A = min(⌊幅/320⌋, ⌊高さ/240⌋) にも B = ⌊高さ/240⌋ にも合う | 測った → **仮説**: A か B か（run 40055307539 の 6 画面は公開のまとめが 40 個で切れて残らなかった） | 決める実験: `geoui_rules` 2 本目の 6 画面（1100x1000・1279x960 で A と B が分かれ、1280x960・1920x959 が A の境目） |
| R5.4 | gui の 1 単位 = 1 JSON UI px: 182 x 22 の枠が本物のホットバーと同じ幅・同じ所 | 測った（run 39989463030） | ゲームの HUD と同じ倍率で置ける |
| R5.5 | タイトルの文字は `#hud_title_text_string`・`#hud_subtitle_text_string`（global）、HUD の表示は `#hud_visible` | 一次資料（`hud_screen.json`） | サーバーの文字をラベルで GeoUI に（SPEC 10 章。描画は要実測） |
| R5.6 | 寄せ先ごとの renderer の offset、グループの置き場所、映り込みの式 | 式（`layout.ghosts`。`pack.js` が 13 画面 x GUI の倍率 2・3 で調べる） | gui のグループは原点の下の帯 |

## 6. 画面

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R6.1 | Android エミュレータの横向き 10 種では、表示領域 = 画面いっぱい（四隅の四角が角に ±1 px） | 測った（run 39989463030） | |
| R6.2 | Android で切り欠きを変えるとアプリが閉じる（作り直される） | 測った（run 39989463030、0445272 で手順を直した） | 切り欠きを測るたびにゲームを起動し直す |
| R6.3 | iPhone の Dynamic Island・ホームバー、Android の切り欠き、ゲーム機の画面の位置の設定、`$compress_hud_width` が立つ端末 | **仮説**（要実測） | `geoui_device`（Android）と TASK.md の人の確かめ |
| R6.4 | 分割画面: `q.is_local_player` は他の画面の自分を 0 にする | 一次資料（Molang の一覧） | 画面ごとの GeoUI は要実測 |

## 7. 入力（指 → サーバー）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R7.1 | Script API の版: playerEmote 1.14.0・playerInputModeChange 1.17.0・playerButtonInput 1.18.0・playerHotbarSelectedSlotChange 2.1.0・**playerSwingStart と EntitySwingSource 2.5.0**・`Player.selectedSlotIndex`（書ける）1.11.0・`Entity.isSneaking`（書ける）1.6.0・`Entity.playAnimation` 1.9.0・`setHudVisibility` / `hideAllExcept` 1.11.0・`touchOnlyAffectsHotbar` 1.17.0。InputPermissionCategory: Camera 1・Movement 2・LateralMovement 4・Sneak 5・Jump 6・Mount 7・Dismount 8・MoveForward 9・MoveBackward 10・MoveLeft 11・MoveRight 12。HudElement: PaperDoll 0・Armor 1・ToolTips 2・TouchControls 3・Crosshair 4・Hotbar 5・Health 6・ProgressBar 7・Hunger 8・AirBubbles 9・HorseHealth 10・StatusEffects 11・ItemText 12 | 一次資料（`server-bindings_*.json`） | **パックは使う API の中で一番新しい版を宣言する**: 2.1.0 を宣言して playerSwingStart（2.5.0）を使っていた → 2.5.0 に直した。`pack.js` の `API_MIN` が足りない版に注意を出す |
| R7.2 | BDS 1.26.52 では 2.1.0 を宣言しても playerSwingStart が使えた | 測った（geoui_device の bot-swing） | 頼らない（R7.1 に従う） |
| R7.3 | 移動の入力は +x が左・+y が前 | 測った（BDS・bds/docs/EVENTS.md） | 矢印にする時に x を反転 |
| R7.4 | `InputInfo.touchOnlyAffectsHotbar`（タッチがホットバーだけに効く設定）がある | 一次資料 → 仮説: その人にはタップの腕の振り（= クリック）が来ないかも | タップ以外の道（ジャンプ = 決定）を残す |
| R7.5 | lock（Movement の許可を切る）でラボのボットは移動の入力を送らない | 測った（BDS）→ 本物のクライアントは**仮説** | 既定は free。決める実験: `geoui_device` の入力 |
| R7.6 | 1 tick より短い押しは `playerButtonInput` で拾える | 式（`html/runtime.js`） | |
| R7.7 | 出来事の名前を自分のコマンドと同じにすると自分に戻ってくり返す | 測った（ウォッチドッグ） | `<ns>:on_<名前>` |
| R7.8 | `Entity.isSneaking` はサーバーから書ける | 一次資料・測った（BDS: geoui_rules） | 本物のクライアントの姿勢が変わるか・GeoUI が動くかは `geoui_rules` の poses |
| R7.9 | クライアントが毎 tick 送る PlayerAuthInput には、ゲームの動きの印（Jumping・Sneaking・StartSneaking …）とは別に、ボタンそのものの印（JumpPressedRaw・JumpReleasedRaw・JumpCurrentRaw・SneakPressedRaw・SneakReleasedRaw・SneakCurrentRaw）がある。ほかに MissedSwing（何にも当たらない腕の振り）・IsHotbarOnlyTouch・Emoting | 一次資料（Mojang の bedrock-protocol-docs、1.26.70-preview の `PlayerAuthInputData.json`） | 動きを止めて（lock）もボタンの押しは「生の印」で届く見込み → 仮説: lock でもジャンプ・スニークは決定・戻るに使える（`geoui_device` の in-jump / in-sneak で決める） |
| R7.10 | PlayerAuthInput には Player Rotation とは別に Camera Orientation・Interact Rotation・Player Head Rotation、移動は Move Vector・Analog Move Vector・Raw Move Vector がある | 一次資料（`PlayerAuthInputPacketPayload.json`） | 止めたカメラでも、ポインタに使う `getRotation()`（体の向き）はカメラと別に動く見込み（`geoui_device` の frozen-turn で決める） |
| R7.11 | 操作の型は Input Mode（Mouse・Touch・GamePad・GamePadAndMouse）と、タッチの Interaction Model（Touch・Crosshair・Classic）の 2 つ | 一次資料（`InputMode.json`・`NewInteractionModel.json`） | タップが腕の振り（クリック）になるかは Interaction Model しだい → 仮説。タップに頼らない道（ジャンプ = 決定）を残す |
| R7.12 | プレイヤーの動きはサーバーが決める形（ServerAuthoritativeV3）に移った: クライアントの予測をサーバーが直す（CorrectPlayerMovePrediction） | 一次資料（`additional_docs/MovementProtocolDeprecation.md`） | free（毎 tick 戻す）は直しと teleport を毎 tick 生む → speed（速さ 0）の方が軽い見込み（仮説: 直しの数を数える実験はまだ無い） |

## 8. 時間

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R8.1 | スクリプトは 20 tick / 秒、クライアントは毎フレーム。`q.delta_time`・`q.frame_alpha` で tick の間を補える | 一次資料 | 動く物はクライアントの Molang で（タイムラインのやり方） |
| R8.2 | pre_animation の `q.life_time`・アニメーションの `q.anim_time` は秒で進む | 測った（probe 1・2 回目） | |
| R8.3 | 入力から画面までの遅れ | **仮説**（要実測。まだ実験が無い: 240fps の動画で測る） | ポインタの見え方・osu! の判定のずれ |

## 9. 寿命と共存

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R9.1 | GeoUI は `player.entity.json`・`player.json` を丸ごと置き換える: 同じ物を置き換える他のパックとは片方しか効かない | ゲームの決まり（どちらが効くかの順は要確認） | 他のパックとの共存は範囲外として明記（SPEC） |
| R9.2 | HUD の JSON UI と live_player_renderer は、公式の API として約束された物ではない（Mojang は画面を Ore UI に移している） | リスク | 版ごとにバニラの `hud_screen.json` を見比べる。`geoui_device`・`geoui_rules` を回し直す |
| R9.3 | 予測は実験の前に書き、コミットしてから回す（`geoui_rules/predictions.json`）。回した後は、その予測・手順（app.txt）・公開のまとめを `rules-history/run-<番号>/` に残し、`verdict --predictions --app` でいつでも読み直せるようにする | 手順 | 結果に合わせて予測を書き直さない。次の実験の予測は新しく書く |
| R9.4 | 実行の公開のまとめ（summary.json）は測った値を先頭から決まった数だけ残す（40 → 160 に）: run 40055307539 は 80 を超える測りの後半（暗視・箱・ダメージ・透明化の色・GUI）を失った | 測った（run 40055307539） | 実験の測りは公開のまとめに入る数に収める（試験が確かめる）。新しい問いを先に回す |

## 見つけた規則で直したこと（2026-10-24）

**2 回目（run 40055307539 の結果から）**
- **R4.1 / R4.2**: `layout.js` の D を 24.10 → **24**、K は scale / 16 のまま（測った値も同じ）。Studio の枠の画面の真ん中は y 134.93。
  2026-10-21 の値（K 0.058589・D 24.10）のままの所: GeoUI Builder の「実機で測った値」・タイムラインの probe・osu! の render・`geoui_device` の
  十字（y 135.04）。1560 x 720 で 0.5 px 未満の違いなので変えていない（変えるならプラグインの値には新しい id を付ける: 保存したプロジェクトが動かないように）。
- **R9.4**: `app/lib/measure.mjs` の公開のまとめに残す測りを 40 → 160。
- **R3.11**: `pack.js` に `rcPatch`（render controller に color・overlay_color を足す口）と `extraMaterials`（実験だけの材質。決まった材質の名前は使えない）。
- **R9.3**: `rules.mjs verdict` が前の実行を、その時の予測と手順で読み直す（`--predictions`・`--app`）。1 本目は `rules-history/run-40055307539/`。
  姿勢（R2.3）は式ではなく同じ実行の基準の写真と比べる（0.9375 の写真は端のぼけで 0.37 % 大きく読める）。描かれたかどうかは、色が平ら（むら 2.5 以下）で
  ワールドの色と違う時だけ「描かれた」とする（R3.12 の −45° はワールドの色だった）。

**1 回目**

- **R7.1**: GeoUI Screen のパックは `@minecraft/server` 2.1.0 を宣言しながら playerSwingStart（2.5.0〜）を使っていた → 既定を 2.5.0 に。
  `pack.js` の `API_MIN` と `apiNeeds` が、スクリプトが使う API より古い版の宣言に注意を出す（`tests/geoui-rules-offline.mjs`）。
  HTML の変換器の main.js は playerSwingStart が無くても動くように（有る時だけ subscribe）。本物の BDS で geoui_device 18/18・geoui_html_demo 17/17。
- **R2.1 / R4.1**: `pack.js` に `scaleScript`（player の scripts.scale を UI の中だけ変える）と `patchPlayer`（component group・event を足す口）。
- **R2.3**: GeoUI の骨がバニラの骨の子でないことを試験にした。

## 仮説を決める実験（予測は実験の前に）

`bds/addons/geoui_rules`（`node bds/geoui/screen/rules.mjs` が作る。本物の BDS で 12/12）。予測は `predictions.json`
（`node bds/geoui/screen/rules.mjs predict`）、結果の読み方は `node bds/geoui/screen/rules.mjs verdict <summary.json>`
（前の実行は `--predictions rules-history/run-<番号>/predictions.json --app rules-history/run-<番号>/app.txt`）。

### 1 本目: run 40055307539（2026-10-24、Android エミュレータ 1560 x 720、Minecraft 1.26.52.3）

予測・手順・公開のまとめは `rules-history/run-40055307539/`。

| 仮説 | 予測（実験の前） | 結果 |
|---|---|---|
| R4.1 | 目盛りの高さ = 160 / scale（170.67・320・213.33・160・106.67）、0.5 % 以内 | **成り立つ**: 320.000・213.333・160.000・106.667（0.000 %）。0.9375 は 171.29（端のぼけ） |
| R4.2 | M: 中心 135.03・232.10・162.77・128.10・93.43 ／ W: 135.03・253.19・168.79・126.59・84.40 | **M**: 232.000・162.667・128.000・93.333 = D 24.000（M の予測は D 24.1 で 0.10 ずれ、W は 21 単位ずれ） |
| R4.8 | 付いてくれば 341.33、付いてこなければ 170.67 | **付いてくる**: 340.83（1.99 倍） |
| R2.3 | 高さ 170.67・中心 135.03 のまま（0.3 %・0.5 単位以内） | **動かない**: 6 つとも基準の写真と同じ（171.29・134.999。ボート 171.31・134.991） |
| R3.7 | 予測なし（値を取る）。昼の倍率は 0.76 前後 | 昼 0.7536 x + 2.3・真夜中 0.7572 x − 0.3（まっすぐ・同じ）。暗視・箱は公開のまとめに残らず |
| R3.12 | （傾けた 5 枚: 予測なし） | 平ら 194・上 45° 107・下 45° 235・左 45° 148・**右 45° は描かれない**（真夜中も同じ） |
| R3.8 | 白は昼と同じ | 公開のまとめに残らず |
| R3.9 | 予測なし | 目盛りが見つからなかった（app.txt 234 行目の measure が失敗） |
| R5.3 | A: 3・2・3・4・3・6 ／ B: 4・2・4・4・3・6 | 公開のまとめに残らず |

### 2 本目（回すのは人の許可をもらってから）

| 仮説 | 実験（app.txt の区切り） | 予測 |
|---|---|---|
| R3.11 | brighten: cutout・fade・USE_OVERLAY・USE_EMISSIVE の白と灰 128（アルファ 255・128・8）を、そのまま・色 1.32・重ねる色 0.24 で | emissive がアルファで光るなら（lerp）白 193・224・253、灰 127 ／ 全部光るなら 255 ／ 効かないなら 193。fade x 1.32 は 1 で頭打ちでなければ白 255・灰 128、頭打ちなら 193・97。重ねる色 0.24 の灰 128 は光の後なら 135、前なら 120、効かなければ 97 |
| R4.10 | depth: 白い四角を z −150・−100・−60・−30・0・30・60・100・150 で空と地面の前に、赤（z +5）と緑（z −5）の重なり、z 0 と 50 の長い板 | ±60 は描かれる（R4.3）。重なりは緑（小さい z が手前: pack.js）。板は描かれれば 73 |
| R3.12 | tilt: y のまわりに −60・−45（元の所と左端）・−30・−15・15・30・45・60°、x のまわりに −60〜60°、平らな板 3 枚 | 平ら 194、x −45° 107、x 45° 235、y 45° 148（1 本目どおり）。y −45° は向きのせいなら両方とも描かれない、場所のせいなら左端は描かれる |
| R3.9 | invisible: 透明化の間の灰色の白と黒 | 描かれない（ワールドの色） |
| R3.8 | hurt: /damage の直後 3 回、USE_OVERLAY の無い白と有る白 | どちらも赤くならない（193） |
| R4.9 | comp: minecraft:scale 0.5 で scripts.scale / q.model_scale | 打ち消せれば 170.67 単位、だめなら 341.33 |
| R3.7 | light-nightvision / light-box: 9 段の灰色と z 50 の板 | どちらも 0.757 倍（昼・真夜中と同じ） |
| R5.3 | gui: 1100x1000・960x540・1279x960・1280x960・1920x959・2560x1440 で gui の枠の幅 | A: 3・2・3・4・3・6 ／ B: 4・2・4・4・3・6 |
| 対照 | control: scale 0.9375・1 の目盛り、目盛りの黒い板（z 100） | 170.67（0.9375 はぼけて 171.29）・中心 134.93、160・128.00。板は描かれれば 0 |

測りは 116 個（公開のまとめに残るのは 160 個まで: 試験が確かめる）。新しい問いを先に、GUI の 6 画面と対照を後に回す。
回すのは `node lab.mjs app ci -a geoui_rules`（**人の許可をもらってから**）。`geoui_device` の次の 1 本（R4.7・R6.3・R7.5 など）と同じく、
結果をこの台帳の「状態」と SPEC.md の 13 章に書く。
