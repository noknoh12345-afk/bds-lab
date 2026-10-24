# GeoUI の規則の台帳 — サーバーの値が画面の画素になるまで（と、指が値になるまで）

GeoUI がマイクラの画面に「反映される」道を、段ごとに規則として並べる。どの規則にも **ID・状態・出どころ・設計への意味** を付け、
まだ決まっていない物（仮説）には、それを決める実験と、実験の前に書いた予測を付ける。式と使い方は [SPEC.md](SPEC.md)。

**状態**
- **一次資料**: Mojang の資料そのもの（バニラのファイル・公式の文書・Script API と Molang のメタデータ）に書いてある。
- **測った**: 本物のアプリ（または本物の BDS）で測った。どの実行かを書く。
- **式**: 一次資料と測った事から導いた。オフラインの試験が確かめる。
- **仮説**: まだ決まっていない。決める実験と予測がある（`bds/addons/geoui_rules` の `predictions.json`・`geoui_device`）。

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
| R2.3 | 姿勢のアニメーション（swim・crawl・sleeping・riding.root）が動かすのはバニラの `root`・腕・頭だけ。`override_previous_animation` は「この animation の骨」だけを初めの姿に戻す | 一次資料（`animations/*.json`・公式の文書）→ **仮説**: GeoUI は姿勢で動かない | GeoUI の骨は自分の root に下げる（バニラの骨の子にしない: 試験が確かめる）。決める実験: `geoui_rules` の poses（予測: 動かない） |
| R2.4 | pre_animation で、まだ入れていない自分の変数を `??` なしで読むと、その行から後が毎フレーム止まる | 測った（probe 1・2 回目） | `GeoUICore.unsetReads` が書き出しの前に見つける |
| R2.5 | 人形（paper doll）にはプロパティが無く、`q.property` がエラーになり後が止まる | 測った（probe 2 回目） | 読みは全部 `variable.is_paperdoll ? 0 : q.property(…)`。scale の式も同じ |
| R2.6 | Molang: 1 行 1000 文字・括弧 24 段まで、1 つの pre_animation で 61 万文字・5029 行・変数 約 5000 まで動いた | 測った（probe_m・sz・lc・vx） | 長い表は 16 ずつの行に（`tableLines`） |
| R2.7 | 使えるクエリ: `q.is_in_ui`（UI の中で描く時 1）・`q.is_local_player`（分割画面では他の画面の自分は 0）・`q.model_scale`・`q.frame_alpha`（tick の間の割合）・`q.delta_time`・`q.time_of_day`・`q.is_invisible`・`q.camera_rotation` ほか 379 個 | 一次資料（Molang の一覧） | tick の間を補う・分割画面を見分ける道がある |

## 3. 描く物（ジオメトリ・render controller・材質・光）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R3.1 | render controller の項目（公式の文書）: geometry・materials・textures・part_visibility・color・is_hurt_color・on_fire_color・overlay_color・arrays。**光を切る項目は文書に無い**。`uv_anim` は文書に無いが効く | 一次資料（`doc_modules/animations.json`）／測った（uv_anim: probe 2 回目） | 光は材質か実験で扱う（R3.7） |
| R3.2 | `color.a` は blend の材質で効かない。色のマスク（`USE_COLOR_MASK`）の fade で効く | 測った（probe 2・3 回目） | 不透明度は fade で |
| R3.3 | ボーン 600 本（#599 も）・自分の render controller 70 個・アニメーション 1200 個まで描かれた | 測った（probe_b ほか） | `pack.js` が超えると注意 |
| R3.4 | 同じボーンの scale は掛け算・position は足し算・正の回転は画面で時計回り | 測った（probe 3 回目） | |
| R3.5 | 同じ平面に 2 枚の面はちらつく | 式（ラボの模型の確かめ） | `pack.js` が 0.021 ずつ奥へ |
| R3.6 | part_visibility は子の無いボーンだけに使う | 式（隠した親の子がどうなるかは要実測） | 状態ごとの見た目は葉のボーン |
| R3.7 | **板の色に光がかかる**: 赤 255 → 194、白 255 → 194（0.76 倍） | 測った（run 39989463030、昼・平らな世界）→ **仮説**: 何で変わるか（時刻・暗視・暗い所・面の向き） | 決める実験: `geoui_rules` の light（9 段の灰色・傾けた 5 枚 x 昼・夜・暗視・閉じた箱）。色の作り方はその結果で決める |
| R3.8 | ダメージの赤（is_hurt_color）・火（on_fire_color）は a 0 で GeoUI にかけない | 式（`pack.js`）→ **仮説** | 決める実験: `geoui_rules` の hurt（予測: 白は昼と同じ） |
| R3.9 | 透明化のポーション: バニラの player の render controller は `q.is_invisible` を見ない（蜘蛛は自分で材質を替える） | 一次資料 → **仮説**: ゲームが体ごと描かないか | 決める実験: `geoui_rules` の invisible |
| R3.10 | RenderDragon の材質の中身（.material.bin）は bedrock-samples に無い | 一次資料（無いことを確かめた） | 光・色の形は実験でしか決まらない |

## 4. renderer（live_player_renderer）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R4.1 | 1 モデル単位 = K x min(パネルの幅, 高さ)、K = 0.058589（測った）≈ 0.9375 / 16。0.9375 はバニラの scripts.scale（R2.1） | 測った（geoui_calib、2026-10-21）＋一次資料 → **仮説**: K = scale / 16、つまり**世界の 1 ブロック = パネルの短い辺** | 決める実験: `geoui_rules` の scale（UI の中の scale 0.5・0.75・1・1.5。予測: 目盛りの高さ 160 / scale）。成り立てば scale 1 で K = 1/16 |
| R4.2 | モデルの原点はパネルの真ん中の D = 24.10 ± 0.17 単位下（= 1.412 ブロック） | 測った → **仮説**: D はモデルの単位で決まる（M）か、ブロックで決まる（W）か | 決める実験: 同じ scale の写真の目盛りの中心（予測は M と W の両方を書いてある。scale 0.5 で 21 単位違う） |
| R4.3 | 正射影（縦横の尺度は同じ 0.9999、奥行き ±60 で大きさ 0.9999 / 1.0000） | 測った | z は重なりの前後だけ |
| R4.4 | HUD の自前の人形は `hud_player_renderer`（`#paper_doll_visible`）、持ち物の人形は `live_player_renderer` で `property_bag: {"#look_at_cursor": true}` | 一次資料（`hud_screen.json`・`inventory_screen.json`） | GeoUI の renderer は property_bag なし。`#look_at_cursor` は名前と paperdoll の状態の `look_at_target_ui`（頭 = `q.target_x_rotation`・`q.target_y_rotation`）から、頭がカーソルを向く物と見られる（GeoUI に使えるかは仮説・未実験） |
| R4.5 | パネルの外にはみ出した物も描かれる | 測った（Studio のやり方・device の over） | どの renderer もモデル全体を描く → 他のグループや体が映らない置き方（R5.6） |
| R4.6 | renderer に `#hud_visible` を結ぶと、F1 で HUD と一緒に消える | 式（バニラの `#hud_visible`） | `pack.js` の既定 |
| R4.7 | pre_animation が renderer ごとに動くか | **仮説** | 決める実験: `geoui_device` の rc の棒 |
| R4.8 | プレイヤーの `minecraft:scale`（サーバーの component。他のアドオンが変える）に renderer が付いてくるか | **仮説** | 決める実験: `geoui_rules` の entity-scale（付いてくれば、他のアドオンが体を小さくすると GeoUI も縮む） |

## 5. JSON UI（配置）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R5.1 | 木: base_screen → セーフエリアの枠（`ui_common.json` の safezone_*。大きさの変数 `$left_horizontal_safezone_size` などは JSON に無くゲームが入れる）→ hud_screen → `hud_content`（`$compress_hud_width` で幅 90 %）→ `root_panel`。`$compress_hud_width`・`$desktop_screen`・`$education_edition` もゲームが入れる | 一次資料（`hud_screen.json`・`ui_common.json`・`_global_variables.json` に無い） | GeoUI の viewport は root_panel の先頭、縮む時は 111.1 %（SPEC 4 章） |
| R5.2 | `%x`・`%y`・`max_size`・寄せ先・offset の式 | 測った（run 39989463030: 横向き 10 種で 1 px 以内、contain の箱 0〜1 px） | SPEC 5・6 章の式をそのまま使ってよい |
| R5.3 | GUI の倍率: 測った 10 画面（高さ 720〜920 で 3、1080 で 4）は A = min(⌊幅/320⌋, ⌊高さ/240⌋) にも B = ⌊高さ/240⌋ にも合う | 測った → **仮説**: A か B か | 決める実験: `geoui_rules` の 6 画面（1100x1000・1279x960 で A と B が分かれ、1280x960・1920x959 が A の境目） |
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
| R9.3 | 予測は実験の前に書き、コミットしてから回す（`geoui_rules/predictions.json`） | 手順 | 結果に合わせて予測を書き直さない |

## 見つけた規則で直したこと（2026-10-24）

- **R7.1**: GeoUI Screen のパックは `@minecraft/server` 2.1.0 を宣言しながら playerSwingStart（2.5.0〜）を使っていた → 既定を 2.5.0 に。
  `pack.js` の `API_MIN` と `apiNeeds` が、スクリプトが使う API より古い版の宣言に注意を出す（`tests/geoui-rules-offline.mjs`）。
  HTML の変換器の main.js は playerSwingStart が無くても動くように（有る時だけ subscribe）。本物の BDS で geoui_device 18/18・geoui_html_demo 17/17。
- **R2.1 / R4.1**: `pack.js` に `scaleScript`（player の scripts.scale を UI の中だけ変える）と `patchPlayer`（component group・event を足す口）。
- **R2.3**: GeoUI の骨がバニラの骨の子でないことを試験にした。

## 仮説を決める実験（予測は実験の前に）

`bds/addons/geoui_rules`（`node bds/geoui/screen/rules.mjs` が作る。本物の BDS で 10/10）。予測は `predictions.json`
（`node bds/geoui/screen/rules.mjs predict`）、結果の読み方は `node bds/geoui/screen/rules.mjs verdict <summary.json>`。

| 仮説 | 実験（app.txt の区切り） | 予測 |
|---|---|---|
| R4.1 | scale: UI の中の scale 0.9375・0.5・0.75・1・1.5 で目盛りを写し `measure geoui` | 目盛りの高さ = 160 / scale（170.67・320・213.33・160・106.67）、0.5 % 以内 |
| R4.2 | 同じ写真の目盛りの中心 | M: 135.03・232.10・162.77・128.10・93.43 ／ W: 135.03・253.19・168.79・126.59・84.40 |
| R4.8 | entity-scale: minecraft:scale 0.5（event） | 付いてくれば高さ 341.33、付いてこなければ 170.67 |
| R2.3 | poses: しゃがむ（サーバーから）・眠る・泳ぐのアニメーション・ボート・三人称の後ろと前 | 高さ 170.67・中心 135.03 のまま（0.3 %・0.5 単位以内） |
| R3.7 | light-noon / midnight / nightvision / box: 9 段の灰色と傾けた 5 枚を `measure color` | 予測なし（値を取る）。昼の倍率は 0.76 前後 |
| R3.8 | hurt: ダメージの直後の灰色 | 白は昼と同じ |
| R3.9 | invisible: 透明化の間の目盛り | 予測なし |
| R5.3 | gui: 1100x1000・960x540・1279x960・1280x960・1920x959・2560x1440 で gui の枠の幅 | A: 3・2・3・4・3・6 ／ B: 4・2・4・4・3・6 |

回すのは `node lab.mjs app ci -a geoui_rules --screen 720x1560`（**人の許可をもらってから**）。`geoui_device` の次の 1 本
（R4.7・R6.3・R7.5 など）と同じく、結果をこの台帳の「状態」と SPEC.md の 13 章に書く。
