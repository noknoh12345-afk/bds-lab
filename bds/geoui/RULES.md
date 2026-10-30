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
| R2.7 | 使えるクエリ: `q.is_in_ui`（UI の中で描く時 1）・`q.is_local_player`（分割画面では他の画面の自分は 0）・`q.model_scale`・`q.frame_alpha`（tick の間の割合）・`q.delta_time`・`q.time_of_day`・`q.is_invisible`・`q.camera_rotation` ほか 379 個 | 一次資料（Molang の一覧）／**測った**（run 40877717430・40924847860: **UI の中では回転のクエリはどれも 0**: q.camera_rotation(0)・(1)・eye_target_y/x_rotation・head_y/x_rotation(0)・body_y/x_rotation・target_y/x_rotation は、頭を回しても 0 のまま。q.is_local_player は 1） | tick の間を補う・分割画面を見分ける道がある。**頭の向きはクライアントのクエリでは読めない**: ポインタはサーバーの getRotation からプロパティで送る。`q.model_scale` は UI の中で 1（R4.9） |

## 3. 描く物（ジオメトリ・render controller・材質・光）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R3.1 | render controller の項目（公式の文書）: geometry・materials・textures・part_visibility・color・is_hurt_color・on_fire_color・overlay_color・arrays。**光を切る項目は文書に無い**。`uv_anim` は文書に無いが効く | 一次資料（`doc_modules/animations.json`）／測った（uv_anim: probe 2 回目） | 光は材質か実験で扱う（R3.7） |
| R3.2 | `color.a` は blend の材質で効かない。色のマスク（`USE_COLOR_MASK`）の fade で効く | 測った（probe 2・3 回目） | 不透明度は fade で |
| R3.3 | ボーン 600 本（#599 も）・自分の render controller 70 個・アニメーション 1200 個まで描かれた | 測った（probe_b ほか） | `pack.js` が超えると注意 |
| R3.4 | 同じボーンの scale は掛け算・position は足し算・正の回転は画面で時計回り | 測った（probe 3 回目） | |
| R3.5 | 同じ平面に 2 枚の面はちらつく | 式（ラボの模型の確かめ） | `pack.js` が 0.021 ずつ奥へ |
| R3.6 | part_visibility は子の無いボーンだけに使う | 式（隠した親の子がどうなるかは要実測） | 状態ごとの見た目は葉のボーン |
| R3.7 | **板の色に光がかかる**: カメラを向いた平らな板は 出る色 = 0.753〜0.757 x 入れた色 + 0〜2.4。9 段の灰色（0〜255）で**まっすぐ**（ガンマの曲がりなし）、**昼・真夜中・暗視・光の無い閉じた箱で同じ**（昼 0.7536 x + 2.3・真夜中 0.7572 x − 0.3・真夜中の暗視 0.7530 x + 2.0・石の箱の中 0.7531 x + 2.4）= ワールドの明るさでなく UI の自分の光 | **測った**（run 39989463030 の赤・白、run 40055307539 の 9 段 x 昼・真夜中、run 40061560812 の暗視・箱。Minecraft 1.26.60 でも同じ: run 40881294595 の色） | 色は 0.757 倍で出ると見て作る（白 255 は 193〜194）。夜・洞窟・暗視でも変わらない。明るく出す道は R3.11、向きは R3.12 |
| R3.8 | ダメージの赤（is_hurt_color）・火（on_fire_color）は a 0 で GeoUI にかけない。そもそも GeoUI の材質は `USE_OVERLAY` を立てていない（バニラの `entity` は `entity_static` に `USE_OVERLAY` を足した物: 二次資料。重ねる色はこの define の材質にだけ効く見込み） | 式（`pack.js`）／**測った**（run 40061560812: `/damage` の直後に 3 回写し、USE_OVERLAY の無い白・有る白とも 3 回とも rgb(194,194,195) で赤くならない。点滅の最中を写せたかは封じた写真で要確認） | 今のまま（is_hurt_color・on_fire_color の a 0）でよい |
| R3.9 | 透明化のポーションの間は **GeoUI が描かれない**（バニラの player の render controller は `q.is_invisible` を見ない（蜘蛛は自分で材質を替える）が、ゲームが体ごと描かない） | 一次資料／**測った**（run 40061560812: 透明化の間、灰色の段の白の所は空の色のまま（156,193,233）・黒の所もワールドの色、画面で変わったのは右下の 4.25 % だけ（R4.11）。run 40055307539 で目盛りが見つからなかったのも同じ訳） | 透明化のポーションの間は GeoUI が消える: 透明化を使う遊びでは GeoUI を当てにしない（その間はフォーム・アクションバーなど） |
| R3.10 | RenderDragon の材質の中身（.material.bin）は bedrock-samples に無い。バニラの材質の JSON（`entity.material`）の defines: `entity` = `entity_static` + `USE_OVERLAY`、`entity_alphatest` = `entity_nocull` + `ALPHA_TEST`、光る物は `entity_emissive_alpha`（テクスチャのアルファが小さいほど光る） | 一次資料（無いことを確かめた）／二次資料（bedrock.dev の wiki: Materials・Glowing Entity Texture） | 光・色の形は実験でしか決まらない（R3.11） |
| R3.11 | **出る色は 236 で止まる（チャンネルごとに）**: どの道でも白は 236 より明るくならない。(1) 色のマスクの fade に render controller の `color` c で、各チャンネル = min(236, 0.757 x c x 値 + 2)（c 1.32 で白 236・灰 192 は 193・灰 128 は 130・灰 64 は 66、赤 (236, 2, 3)・橙 (236, 130, 3)。c 2 で灰 128 は 195・灰 192 は 236、橙 (236, 195, 3)。色合いは保たれず、チャンネルごとに止まる）、(2) `USE_EMISSIVE` の材質はテクスチャのアルファで光を 0.757 から約 0.925 へ寄せる（アルファ 255・128・8 の白 194・215・234）、(3) `USE_OVERLAY` の材質の白の `overlay_color` は光の後に混ざり（0.24 で灰 128 は 98 → 133.5）、1 にすると白も灰も 236。cutout は color で変わらない（194・98）。下へ傾けた板も 235（R3.12） | **測った**（run 40061560812 のそのまま・色 1.32・重ねる色 0.24、run 40881294595 の 9 色 x 色 1.32・2 と重ねる色 1: 予測との差 1.0 以内） | **fade の材質に color 1.32 を掛ければ、236 までの色はどれも入れた色のまま出る**（1 を超える成分は 236 で止まる）。白の文字・アイコンは 236 と見て作る |
| R3.12 | 面の向きで明るさが変わる。**1° でも変わり、15° までに飽きる**: 白 255 は平らで 194、y のまわりに 1° で 188・5° で 156・15〜60° は 148（±どちらも）、x のまわりに −1° で 167・−15〜−60°（上へ）で 106〜108、+1° で 216・+5° で 233・+15〜+60°（下へ）で 235（236 の上限）。2 本目の「角度でなく向きの符号」は 15° より大きい角しか測っていなかったから。run 40055307539 の「y のまわりに −45° の 1 枚は描かれない」は向きでなく場所のせい（右下の腕: R4.11） | **測った**（run 40055307539・40061560812・40881294595） | 板はカメラにまっすぐ向ける: 1° 傾けても 6〜27 段色が変わる。画面の中で回す（z のまわり）のは面の向きを変えないので色は変わらない見込み（未実験） |

## 4. renderer（live_player_renderer）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R4.1 | **1 モデル単位 = scripts.scale / 16 x min(パネルの幅, 高さ)**。バニラの scale 0.9375（R2.1）で K = 0.05859375、つまり**世界の 1 ブロック = パネルの短い辺** | **測った**（Minecraft 1.26.60 の run 40881294595 でも scale 1 で 160.000・中心 128.000、0.9375 で 171.293・134.999: 同じ。run 40055307539: UI の中の scale 0.5・0.75・1・1.5 で目盛りの高さ 320.000・213.333・160.000・106.667 = 160 / scale と 0.000 %。0.9375 は 1 単位 4.22 px で端がぼけ 171.29 と 0.37 % 大きく読める）＋一次資料 | `layout.js` の K。UI の中の scale を変えれば単位を変えられる（`pack.js` の `scaleScript`） |
| R4.2 | **モデルの原点はパネルの真ん中の D = 24 モデル単位下**（scale によらない: モデルの単位で決まる M） | **測った**（run 40055307539: 4 つの scale で D = 24.000、ブロックで決まる W なら scale 0.5 で 21 単位ずれる） | `layout.js` の D = 24（前の 24.10 ± 0.17 は 0.9375 のぼけの分） |
| R4.3 | 正射影（縦横の尺度は同じ 0.9999、奥行き ±60 で大きさ 0.9999 / 1.0000: どの scale でも） | 測った（2026-10-21・run 40055307539） | z は重なりの前後だけ。どこまで描かれるか・どちらが手前かは R4.10 |
| R4.4 | HUD の自前の人形は `hud_player_renderer`（`#paper_doll_visible`）、持ち物の人形は `live_player_renderer` で `property_bag: {"#look_at_cursor": true}` | 一次資料（`hud_screen.json`・`inventory_screen.json`） | GeoUI の renderer は property_bag なし。`#look_at_cursor` は名前と paperdoll の状態の `look_at_target_ui`（頭 = `q.target_x_rotation`・`q.target_y_rotation`）から、頭がカーソルを向く物と見られる（GeoUI に使えるかは仮説・未実験） |
| R4.5 | パネルの外にはみ出した物も描かれる | 測った（Studio のやり方・device の over） | どの renderer もモデル全体を描く → 他のグループや体が映らない置き方（R5.6） |
| R4.12 | **切り抜く（`clips_children`）パネルの中の live_player_renderer は何も描かない**: パネルに収まる所も含めて 1 px も出ない（地面に無い薔薇色の 400 x 400 単位の板で） | 測った（run 39989463030 の灰色・run 40877717430 の薔薇色。写真で要確認） | GeoUI の renderer を切り抜くパネル（スクロールの箱・stack_panel の切り抜き）の中に置かない。切り抜きたい時は Molang で隠す（part_visibility・scale 0） |
| R4.6 | renderer に `#hud_visible` を結ぶと、F1 で HUD と一緒に消える | 式（バニラの `#hud_visible`） | `pack.js` の既定 |
| R4.7 | **pre_animation は 1 フレームに 1 回**（renderer の数だけは回らない）: renderer ごとの棒（数え mod 12）が 7 つとも同じ長さ（差 0.0 単位） | **測った**（run 40877717430（Android エミュレータ、Minecraft 1.26.60.4） の rc） | 数えや時間の変数は renderer がいくつあっても 1 フレームに 1 つ進む |
| R4.8 | プレイヤーの `minecraft:scale`（サーバーの component。他のアドオンが変える）は**単位に掛かる**: 0.5 にすると目盛りの高さ 340.83 単位（いつもの 1.99 倍）・中心 245.80（scale 0.46875 の式で 245.87） | **測った**（run 40055307539） | 他のアドオンが体を小さくすると GeoUI も縮む。打ち消し方は R4.9 |
| R4.9 | 体の大きさ（minecraft:scale、他のアドオンが変える）は、**サーバーが読んで送った値で割れば打ち消せる**: `EntityScaleComponent.value`（0.5）をプロパティで送り、UI の中の scripts.scale をそれで割ると、目盛りは元の大きさ（171.29 単位・中心 135.00 = scale 0.9375 と同じ）。UI の中の `q.model_scale` は 1 のままなので、それで割っても打ち消せない（340.83 単位） | **測った**（q.model_scale: run 40061560812、サーバーの値: run 40881294595） | 他のアドオンが体を小さくしても GeoUI を同じ大きさに保つには、サーバーが体の大きさを読んでプロパティで送り、scripts.scale を割る（`pack.js` にはまだ入れていない） |
| R4.10 | 奥行き: **小さい z が手前**（赤 z +5 と緑 z −5 の重なりは緑 rgb(2,194,3) = `pack.js` の通り）。白い四角は **z −150〜150 の全部が描かれた**（空の前。地面の前も −150〜60 は描かれ、100・150 は右下の物の後ろで見えない: R4.11）。300 単位の長い板（z 0・50）も両端まで描かれた（74〜75。z 0 の右の端だけ右下で見えない）。run 40055307539 の「−45° の板の後ろの z 50 の板も見えない」も右下の場所のせい | **測った**（run 40061560812。描く順でなく z で決まる: run 40877717430 の order で、先に書いた青（z −0.5）が後に書いた赤（z 0）の重なりを覆った — 赤の画素 2478 = 赤の板 3562 − 重なり 1068） | 背景の板は z 50 など奥に置いてよい。重なりの前後は z で決める（小さい方が手前、`pack.js` の 0.021 ずつ） |
| R4.11 | **1 人称の自分の腕が、奥行きで GeoUI の板を隠す**: 画面の右下（1560 x 720 で x 1100 より右・y 340 より下のあたり）の腕の所では、GeoUI の板は腕より奥なら隠れ、手前なら描かれる。同じ所で z −150〜50 は描かれ、100 は半分、150 は隠れた所（80, 75: 腕が遠い所）と、z −150 でも隠れる所（120, 135・150, 135・120, 75: 腕が近い所）がある。空の所はどの z も描かれる。**GeoUI Screen と同じ止めたカメラ（minecraft:free）では腕が消え、4 か所とも描かれた**（その所のワールドの色が腕の青・薄紫から空・草に） | **測った**（run 39989463030・40055307539・40061560812 で同じ所に隠れる物、run 40881294595 で 7 つの奥行き x 5 か所と止めたカメラ） | HUD の GeoUI（いつも出す物）を右下の腕の所に置かない（z を小さくしても −150 で隠れる所がある）。GeoUI Screen（開くとカメラを止める）では腕は出ない。`geoui_device` の寄せ先 b・br も腕と重なる |

## 5. JSON UI（配置）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R5.1 | 木: base_screen → セーフエリアの枠（`ui_common.json` の safezone_*。大きさの変数 `$left_horizontal_safezone_size` などは JSON に無くゲームが入れる）→ hud_screen → `hud_content`（`$compress_hud_width` で幅 90 %）→ `root_panel`。`$compress_hud_width`・`$desktop_screen`・`$education_edition` もゲームが入れる | 一次資料（`hud_screen.json`・`ui_common.json`・`_global_variables.json` に無い） | GeoUI の viewport は root_panel の先頭、縮む時は 111.1 %（SPEC 4 章） |
| R5.2 | `%x`・`%y`・`max_size`・寄せ先・offset の式 | 測った（run 39989463030: 横向き 10 種で 1 px 以内、contain の箱 0〜1 px） | SPEC 5・6 章の式をそのまま使ってよい |
| R5.3 | GUI の倍率: A = min(⌊幅/320⌋, ⌊高さ/240⌋) でも B = ⌊高さ/240⌋ でもない。**1080p までは C = min(4, ⌊幅/W0⌋, ⌊高さ/H0⌋)・340 < W0 ≤ 341.3・210 < H0 ≤ 220**（27 画面: 960x540 で 2、1024x768・1100x1000・1104x920・1279〜1360x960・1280x800・1560x720・1920x760〜840 で 3、1920x880〜1080・幅 2160〜3840 x 1080・2560x1440 で 4）。**4K（3840x2160）は 5**: 上限 4 は外れ（1440p の 4 と 4K の 5 を一緒に満たす一定の上限は無い） | 測った（run 39989463030 の 10 画面・run 40061560812 の 6 画面・run 40881294595 の 12 画面）→ **仮説**: 1440p より大きい画面の決まり（例: 上限 = max(4, ⌊高さ/432⌋)。要実測） | 電話（高さ 720〜1080）は C で足りる。`pack.js` の映り込みの調べ（R5.6）は GUI の倍率 2・3: 倍率が大きいほど gui のグループの renderer は他のグループを画面の遠くへ写すので、4・5 は 2・3 より映らない（足さなくてよい） |
| R5.4 | gui の 1 単位 = 1 JSON UI px: 182 x 22 の枠が本物のホットバーと同じ幅・同じ所 | 測った（run 39989463030） | ゲームの HUD と同じ倍率で置ける |
| R5.5 | タイトルの文字は `#hud_title_text_string`・`#hud_subtitle_text_string`（global）、HUD の表示は `#hud_visible` | 一次資料（`hud_screen.json`） | サーバーの文字をラベルで GeoUI に（SPEC 10 章。描画は要実測） |
| R5.6 | 寄せ先ごとの renderer の offset、グループの置き場所、映り込みの式 | 式（`layout.ghosts`。`pack.js` が 13 画面 x GUI の倍率 2・3 で調べる） | gui のグループは原点の下の帯 |
| R5.7 | **HUD のホットバーは GeoUI の上に描かれる**: 下の真ん中の寄せ先の四角（1560 x 720 で (763, 686)–(797, 720)）はホットバーの下になり、4:3・折りたたみではホットバーの下の 3〜4 行だけが見えた。GUI の倍率の枠（182 x 22、R5.4）も本物のホットバーの下の数行だけが見える | 測った（run 40961440806、止めたカメラ・1 人称の体を隠して。写真で要確認） | HUD の GeoUI をホットバーの所（下の真ん中）に置かない。置くなら、その間 `/hud @a hide hotbar`（GeoUI Screen のスロットの無いページはもう隠している） |

## 6. 画面

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R6.1 | Android エミュレータの横向き 10 種では、表示領域 = 画面いっぱい（四隅の四角が角に ±1 px） | 測った（run 39989463030） | |
| R6.2 | Android で切り欠きを変えるとアプリが閉じる（作り直される） | 測った（run 39989463030、0445272 で手順を直した） | 切り欠きを測るたびにゲームを起動し直す |
| R6.3 | 切り欠き・セーフエリア: **Android エミュレータの縦長のノッチ（tall）では、HUD（と GeoUI）は画面いっぱいのまま**（四隅・上下の真ん中・右の真ん中の四角が切り欠きの無い時と同じ所 0 px、viewport の外の白い印は見えない: ゲームはエミュレータの切り欠きをセーフエリアにしない）。iPhone の Dynamic Island・ホームバー、Android の hole など、ゲーム機の画面の位置の設定、`$compress_hud_width` が立つ端末は仮説 | **測った**（tall: run 40055381439・40059144882 で同じ数。ノッチが写真に出ていたかは封じた写真で要確認）／ほかは**仮説**（要実測） | 少なくともこの端末では、ノッチの下にも GeoUI が描かれる: 押す物・読ませる物を角と辺の真ん中から少し離す。`geoui_device`（Android）と TASK.md の人の確かめ |
| R6.4 | 分割画面: `q.is_local_player` は他の画面の自分を 0 にする | 一次資料（Molang の一覧） | 画面ごとの GeoUI は要実測 |

## 7. 入力（指 → サーバー）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R7.1 | Script API の版: playerEmote 1.14.0・playerInputModeChange 1.17.0・playerButtonInput 1.18.0・playerHotbarSelectedSlotChange 2.1.0・**playerSwingStart と EntitySwingSource 2.5.0**・`Player.selectedSlotIndex`（書ける）1.11.0・`Entity.isSneaking`（書ける）1.6.0・`Entity.playAnimation` 1.9.0・`setHudVisibility` / `hideAllExcept` 1.11.0・`touchOnlyAffectsHotbar` 1.17.0。InputPermissionCategory: Camera 1・Movement 2・LateralMovement 4・Sneak 5・Jump 6・Mount 7・Dismount 8・MoveForward 9・MoveBackward 10・MoveLeft 11・MoveRight 12。HudElement: PaperDoll 0・Armor 1・ToolTips 2・TouchControls 3・Crosshair 4・Hotbar 5・Health 6・ProgressBar 7・Hunger 8・AirBubbles 9・HorseHealth 10・StatusEffects 11・ItemText 12 | 一次資料（`server-bindings_*.json`） | **パックは使う API の中で一番新しい版を宣言する**: 2.1.0 を宣言して playerSwingStart（2.5.0）を使っていた → 2.5.0 に直した。`pack.js` の `API_MIN` が足りない版に注意を出す |
| R7.2 | BDS 1.26.52 では 2.1.0 を宣言しても playerSwingStart が使えた | 測った（geoui_device の bot-swing） | 頼らない（R7.1 に従う） |
| R7.3 | 移動の入力は +x が左・+y が前 | 測った（BDS・bds/docs/EVENTS.md） | 矢印にする時に x を反転 |
| R7.4 | `InputInfo.touchOnlyAffectsHotbar`（タッチがホットバーだけに効く設定）がある。**本物のアプリでは、止めたカメラの間のタッチのタップ・マウスのクリック（`input mouse tap`）は腕の振りにならなかった**（パッドの RT はなる） | 一次資料／測った（run 40877717430（Android エミュレータ、Minecraft 1.26.60.4）: 素手・アドベンチャー・真下を向いて止めたカメラ）／**測った**（run 40924847860: タッチの長押し（800 ms）は腕の振りになる。短いタップ・マウスのクリックはまたならなかった） | タップに頼らない道（ジャンプ = 決定）を残す。タッチでクリックさせるなら長押し |
| R7.5 | lock（Movement の許可を切る）で、ラボのボットは移動の入力を送らないが、**本物のクライアントは送る**: キーボードの W・パッドのスティックの移動の入力がサーバーに届き（getMovementVector）、体は動かない。free（毎 tick 戻す）・speed（速さ 0）でも届き、元の所に留まる | 測った（BDS のボット）／**測った**（本物のアプリ: run 40877717430（Android エミュレータ、Minecraft 1.26.60.4） の in-key-locked・in-stick-locked・in-key-free-ui・in-key-speed） | 本物のクライアントには lock が使える（体が少しも動かない）。ボットの試験では free を使う |
| R7.6 | 1 tick より短い押しは `playerButtonInput` で拾える | 式（`html/runtime.js`） | |
| R7.7 | 出来事の名前を自分のコマンドと同じにすると自分に戻ってくり返す | 測った（ウォッチドッグ） | `<ns>:on_<名前>` |
| R7.8 | `Entity.isSneaking` はサーバーから書ける | 一次資料・測った（BDS: geoui_rules） | 本物のクライアントの姿勢が変わるか・GeoUI が動くかは `geoui_rules` の poses |
| R7.9 | クライアントが毎 tick 送る PlayerAuthInput には、ゲームの動きの印（Jumping・Sneaking・StartSneaking …）とは別に、ボタンそのものの印（JumpPressedRaw・JumpReleasedRaw・JumpCurrentRaw・SneakPressedRaw・SneakReleasedRaw・SneakCurrentRaw）がある。ほかに MissedSwing（何にも当たらない腕の振り）・IsHotbarOnlyTouch・Emoting | 一次資料（Mojang の bedrock-protocol-docs、1.26.70-preview の `PlayerAuthInputData.json`） | **Jump・Sneak の許可を切っても、SPACE・左 SHIFT のボタンの入力（playerButtonInput）はサーバーに届いた**（run 40877717430（Android エミュレータ、Minecraft 1.26.60.4） の in-jump-denied・in-sneak-denied。パッドの A・スティック押しも届く）: ジャンプ・スニークを止めたまま決定・戻るに使える |
| R7.10 | PlayerAuthInput には Player Rotation とは別に Camera Orientation・Interact Rotation・Player Head Rotation、移動は Move Vector・Analog Move Vector・Raw Move Vector がある | 一次資料（`PlayerAuthInputPacketPayload.json`） | **止めたカメラでも、見回しの入力で `getRotation()`（頭の向き）が変わり、GeoUI のポインタが動いた**（run 40877717430（Android エミュレータ、Minecraft 1.26.60.4） の frozen-turn・frozen-pointer）。下を向き過ぎた時の水平への戻しもポインタが跳ばない（recentre） |
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

## 10. URL の画像と題名の通り道（GeoUI Web: SPEC.md 17 章）

| ID | 規則 | 状態・出どころ | 設計への意味 |
|---|---|---|---|
| R10.1 | `profile_image_renderer` に `#profile_image_options` = `{"type":7,"url":"…"}` を入れると、ゲームがその URL の PNG を取りに行って描く。HUD の中でも、題名の文字（`#hud_title_text_string`）から組み立てた URL でも動く | 二次資料（zelisce の SAPI-with-URL-Images: サーバーのフォーム）／**測った**（run 40998593826（2026-10-30、Android エミュレータ、Minecraft 1.26.60.4）: HUD の 6 か所） | URL の画像を GeoUI の部品にする（`scene.urlImages`） |
| R10.2 | Android のゲームは LAN の平文の http も取りに行く（10.0.2.2:8787）。https（placehold.co・cloudflared のトンネル）も | **測った**（run 40998593826） | ラボのサービスは http のまま。インターネットの先の人にはトンネル（https） |
| R10.3 | 絵は、そのコントロールの大きさいっぱいに引き伸ばされる（縦横比は守らない）。4096 x 2304・7.8 MB の PNG まで出た | **測った**（run 40998593826） | 枠の縦横比 = 絵の縦横比にする（GeoUI Web は画面の形ごとの並べ方） |
| R10.4 | 新しい URL の絵は、届くまで**透明**（前の絵は消える）。題名を変えてからゲームが取りに来るまで約 380 ms、小さい絵は 0.3 秒以内に出る。**8 秒かかる絵は 12 秒たっても出なかった** | **測った**（run 40998593826: loading・switch・latency） | 入れ替え続ける絵は二重の枠: 前の絵を下（layer −1）に置いてから上を替える（R10.5）。絵は小さく、近くから |
| R10.5 | 上の枠が読み込み中（透明）の間は、下の枠（layer −1）の絵が見える。0.3 秒ごとに入れ替え続けても二重の枠なら途切れない（一重では途切れる） | **測った**（run 40998593826: under の 3 秒後に下の赤。run 41001422618: 送り直しなしで 3 秒かかる上が届くまで下の赤、届いた後は青。frames-buffered・frames-plain）。1 本目の「12 秒後に下も消えた」は 2 秒ごとの送り直しの中だけ | GeoUI Web のページとツールバーは二重の枠（下に 1 つ前の絵）。題名は同じ文字を何度も送らない |
| R10.10 | 6 秒かかる絵も出る（送り直しなし） | **測った**（run 41001422618: 2・4・6 秒） | |
| R10.11 | 次々に替わる絵（0.25 秒ごと）は、ゲームが取りに行く前に替わり続けて出ないことがある | **測った**（run 41001422618: 動くページ） | 絵は上に 0.7 秒は置いてから替える（`frameTicks`） |
| R10.12 | HUD の API（`hideAllExcept`）でホットバー・十字・携帯の操作ボタンが消える。通り道の F1 の旗（`root_panel`）でもホットバーと携帯の操作ボタンが消え、十字は残る（`root_panel` の外） | **測った**（run 41001422618: f1-parts） | F1 は両方を使う（十字は API で） |
| R10.13 | プレイヤーのプロパティで 1 人称の腕と持ち物を消す（描き方の条件・アニメーションに `q.is_local_player && !q.is_in_ui`）は効かなかった | **測った**（run 41001422618: f1-arm の手の所 0 %）→ **仮説**: 1 人称は `variable.is_first_person`（3 本目） | F1 の 1 人称の条件は F1 だけに |
| R10.14 | ゲームの題名を隠す binding（`hud_title_text` の `#visible`）を足すと、通り道の後の普通の題名まで出なかった | **測った**（run 40998593826 の OCR・run 41001422618 の title-raw）→ **仮説**: `binding_condition: always` で直る（3 本目） | |
| R10.6 | 同じ URL は取り直さない（前に取った絵がすぐ出る） | **測った**（run 40998593826: cache） | 絵を替える = URL を替える（番号付きの URL） |
| R10.7 | 題名の文字は、題名の時間（stayDuration）を過ぎても、`title clear` の後も残る（次の題名まで） | **測った**（run 40998593826: persist・cache・cycle・f1） | 通り道を空にするには、空の通り道の題名（`~gu~0a`）を送る。送り直しはいらない（ほかのパックの題名に備えてゆっくり） |
| R10.8 | GeoUI の renderer（layer 1）は URL の画像（layer 0）の上に描かれる。`layer −5` の画像（ゲームの黒、200 %）は画面全体を覆い、その上に画像と renderer が出る | **測った**（run 40998593826: 白い十字が赤の上、並べ方 b で黒 100 %・橙・青緑） | ポインタは GeoUI の板、ページは URL の画像、背景はゲームの黒 |
| R10.9 | ゲームの題名（`hud_title_text`）は、題名が通り道（`~gu~` で始まる）の間は隠せる | **測った**（run 40998593826: 上の帯の違い 0 %） | |

## 見つけた規則で直したこと（2026-10-24〜）

**3 回目（run 40061560812 の結果から、2026-10-29）**
- **R9.3**: `rules.mjs verdict` の「描かれた」に、灰色の板なら灰色（r・g・b の差 8 以下）であることを足した。右下の物（R4.11）の平らな青・薄紫が、
  少し動いて `shot world` と違うだけで「描かれた 35・166・96・81」と読まれていた（平らな板 flatb・x のまわり 60° の板・地面の前の z 150・z 0 の
  板の右の端）。ダメージの赤と、奥行きの赤・緑の箱は色のまま読む。
- **対照**: app.txt の対照の前に、その大きさの `shot world` を撮る（run 40061560812 は黒い板の色を 2560 x 1440 の `shot world` と比べて
  measure-size-mismatch で止まり、scale 1 も測れなかった）。試験: 色・marks・diff の測りの前に、いつも同じ大きさの `shot world` がある。
- 設計（`pack.js`・`layout.js`）はまだ変えていない: fade と color 1.32 を既定にするか（R3.11）、HUD の GeoUI を右下に置かない注意（R4.11）は、
  3 本目で決まってから。映り込みの調べ（R5.6）に GUI の倍率 4 は足さなくてよい（倍率が大きいほど他のグループは画面の遠くに写る: R5.3）。
- **3 本目の実験**（`rules.mjs` の predictions version 3）: 右下の物（R4.11: 7 つの奥行き x 5 か所、GeoUI Screen と同じ止めたカメラ）、
  fade の色（R3.11: 9 色 x 色の倍率 1.32・2、重ねる色 1）、1°・5° の傾き（R3.12）、サーバーが送る体の大きさ（R4.9: `grl:body`）、GUI の倍率の
  12 画面（R5.3: C の W0・H0・上限）、対照。`verdict` は 1・2 本目もその時の予測と手順で読み直せる（PROBES は前の箱を全部残す）。

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

### 2 本目: run 40061560812（2026-10-24、Android エミュレータ 1560 x 720、Minecraft 1.26.52.3）

予測・手順・公開のまとめは `rules-history/run-40061560812/`（予測と手順は回す前にコミットした物のまま）。手順 314 個のうち 309 個目
（app.txt 330 行目: 対照の黒い板）で止まった。それより前の測り 114 個は全部取れた。

| 仮説 | 実験（app.txt の区切り） | 予測（実験の前） | 結果 |
|---|---|---|---|
| R3.11 | brighten: cutout・fade・USE_OVERLAY・USE_EMISSIVE の白と灰 128（アルファ 255・128・8）を、そのまま・色 1.32・重ねる色 0.24 で | emissive がアルファで光るなら（lerp）白 193・224・253、灰 127 ／ 全部光るなら 255 ／ 効かないなら 193。fade x 1.32 は 1 で頭打ちでなければ白 255・灰 128、頭打ちなら 193・97。重ねる色 0.24 の灰 128 は光の後なら 135、前なら 120、効かなければ 97 | **255 に届く道は無い**: そのままはどの材質も 194・98。emissive はアルファ 128・8 の白 215・234（lerp と全部の間）。fade x 1.32 は白 236・灰 130（灰は入れた色のまま、白だけ 236 で止まる）。重ねる色 0.24 は灰 133.5（光の後）・白 214。アルファ 8 の灰 128 は右下で見えず（R4.11） |
| R4.10 | depth: 白い四角を z −150・−100・−60・−30・0・30・60・100・150 で空と地面の前に、赤（z +5）と緑（z −5）の重なり、z 0 と 50 の長い板 | ±60 は描かれる（R4.3）。重なりは緑（小さい z が手前: pack.js）。板は描かれれば 73 | **z −150〜150 の全部が描かれた**（空の前。地面の前の 100・150 は右下で見えず）。重なりは**緑** rgb(2,194,3)。板は 74〜75（z 0 の右の端は右下で見えず） |
| R3.12 | tilt: y のまわりに −60・−45（元の所と左端）・−30・−15・15・30・45・60°、x のまわりに −60〜60°、平らな板 3 枚 | 平ら 194、x −45° 107、x 45° 235、y 45° 148（1 本目どおり）。y −45° は向きのせいなら両方とも描かれない、場所のせいなら左端は描かれる | **場所のせい**: 左端の −45° は 148、元の所はまた見えず、その右の平らな板も見えない。y のまわり ±15〜±60° は全部 148〜149、x のまわり −15〜−60° は 106〜108、+15・+30° は 235: 角度でなく向きの符号で決まる（+45・+60° は右下で見えず） |
| R3.9 | invisible: 透明化の間の灰色の白と黒 | 描かれない（ワールドの色） | **描かれない**（白の所は空の色のまま。画面の変わった所は右下の 4.25 % だけ） |
| R3.8 | hurt: /damage の直後 3 回、USE_OVERLAY の無い白と有る白 | どちらも赤くならない（193） | **赤くならない**: 3 回とも両方 rgb(194,194,195)（点滅の最中を写せたかは封じた写真で） |
| R4.9 | comp: minecraft:scale 0.5 で scripts.scale / q.model_scale | 打ち消せれば 170.67 単位、だめなら 341.33 | **打ち消せない**: 340.83（UI の中の q.model_scale は 1） |
| R3.7 | light-nightvision / light-box: 9 段の灰色と z 50 の板 | どちらも 0.757 倍（昼・真夜中と同じ） | **同じ**: 暗視 0.7530 x + 2.0・箱 0.7531 x + 2.4。z 50 の板 74・75 |
| R5.3 | gui: 1100x1000・960x540・1279x960・1280x960・1920x959・2560x1440 で gui の枠の幅 | A: 3・2・3・4・3・6 ／ B: 4・2・4・4・3・6 | **どちらでもない**: 3・2・3・3・4・4（16 画面に合う形は R5.3 の C） |
| 対照 | control: scale 0.9375・1 の目盛り、目盛りの黒い板（z 100） | 170.67（0.9375 はぼけて 171.29）・中心 134.93、160・128.00。板は描かれれば 0 | 0.9375 は 171.293・中心 134.999（1 本目と同じ）。黒い板と scale 1 は測れなかった（黒い板の色を 2560 x 1440 の `shot world` と比べた: 直した） |

回し方は `node lab.mjs app ci -a geoui_rules --screen 720x1560 --knobs "APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"`（1 本目と同じ画面・knobs）。
**2 本目の 1 回目（run 40059578622、2026-10-24）は手順が 1 つも動かなかった**: knobs を付けずに出したので、サインインありの端末をキャッシュに
見つけられず作り直し、Microsoft のサインインが 10 分で終わらず準備で止まった（`rules-history/run-40059578622/result.md`）。予測と手順はそのまま、
knobs を付けて回したのが run 40061560812。

### 3 本目: run 40881294595（2026-10-29、Android エミュレータ 1560 x 720、Minecraft 1.26.60.4）

予測・手順・公開のまとめは `rules-history/run-40881294595/`（予測と手順は回す前にコミットした `predictions.json` の version 3 のまま）。
手順 344 個が全部通り、測り 93 個が全部取れた。端末は run 40877717430 が作った物（Minecraft 1.26.60.4 を Play から入れ直した）。

| 仮説 | 実験（app.txt の区切り） | 予測（実験の前） | 結果 |
|---|---|---|---|
| R4.11 | arm: 白い四角（12 単位）を z −150・−100・−50・0・50・100・150 の 1 つずつで（`grl:zsel`）、p0（空 −120, 175）・p1（right45 の所 120, 135）・p2（その右 150, 135）・p3（2 本目の z 60 が描かれた所 80, 75）・p4（z 100 が隠れた所 120, 75）に。次に GeoUI Screen と同じ止めたカメラ（`grl:cam 1`: minecraft:free を頭の所に、体は隠す）で、何が変わったか（1 人称のワールドとの diff）と、z 0 の四角 | 奥行きで隠すなら、どの所も小さい z から描かれ、ある z から先が隠れる（p3 は 50 まで描かれ、p1・p2 は 0 より前でしか描かれない）。描く順なら p1〜p4 はどの z も隠れる。p0 はどの z も描かれる。右下の物が腕なら、止めたカメラで変わるのは右下だけで、p1〜p4 の z 0 の四角が描かれる（193） | **奥行き**: p3 は z −150〜50 が描かれ、100 は半分（むら 34）、150 は隠れる。p1・p2・p4 は z −150 でも隠れる（腕がそれより手前）。p0 はどの z も描かれる。**止めたカメラでは 4 か所とも描かれた**（194。その所のワールドの色が腕の青・薄紫から空・草に）= 腕。diff は画面の 71 % が変わった（空がこの間に明るくなった分も入る: 参加の後しばらく空が明るくなっていく） |
| R3.11 | colours: fade の 9 枚（白・灰 192・128・64・赤・緑・青・黄・橙）に色 1.32 と 2。overlay-1: 白の重ねる色を 1 に | チャンネルごとに 0.757 x 色の倍率 x 値 + 2 で、236 で止まる（1.32: 灰 128 は 130・赤は (236, 2, 2)・橙は (236, 130, 2)。2: 灰 128 は 196・灰 192 は 236・橙は (236, 196, 2)）。色の全体で止まる（色合いを保つ）なら橙の緑は 119。重ねる色 1 は 255（止まらない）か 236（止まる） | **チャンネルごと**（予測との差 1.0 以内）: 1.32 で白 236・灰 192 は 193・128 は 130・64 は 66・赤 (236, 2, 3)・緑 (2, 236, 3)・青 (2, 2, 236)・黄 (236, 236, 3)・橙 (236, 130, 3)。2 で灰 128 は 195・192 は 236・橙 (236, 195, 3)。**重ねる色 1 は 236**（白も灰も） |
| R3.12 | fine: y のまわりに 1°・5°、x のまわりに −1°・1°・5°・45°・60°、平ら（空の前、右下でない所） | 向きの符号で決まるなら 148・148・107・235・235・235・235・194。角度で変わるなら 1° は平らと同じ 194 ± 3 | **どちらでもない**: y 1° で 188・5° で 156、x −1° で 167・+1° で 216・+5° で 233・45°・60° で 235、平ら 194。1° でも変わり、15° までに飽きる（2 本目の「符号だけ」は 15° より大きい角しか無かったから） |
| R4.9 | body: minecraft:scale 0.5 の値をサーバーが読んで送り（`grl:body` 5000）、scripts.scale をそれで割る | 打ち消せる: 170.67 単位（打ち消せなければ 341.33） | **打ち消せる**: 171.29 単位・中心 135.00（scale 0.9375 の目盛りと同じ） |
| R5.3 | gui: 1290・1300・1320・1340・1360 x 960、1920 x 760・800・840・880・920・950、3840 x 2160 | C なら、初めの 11 画面は 3 か 4（W0 が 322.5・325・330・335・340 以下なら 4、H0 が 190・200・210・220・230・237.5 以下なら 4: W0・H0 の幅が 5〜10 に縮む）、3840 x 2160 は上限の 4。C の取れる値の外なら C は外れ | 幅 1290〜1360 x 960 は全部 3（W0 > 340）、1920 x 760〜840 は 3・880〜950 は 4（210 < H0 ≤ 220）: 初めの 11 画面は C の内。**3840 x 2160 は 5** で上限 4 は外れ。1080p までの 27 画面は C（W0 340〜341.3・H0 210〜220）に合う |
| 対照 | control: scale 0.9375・1 の目盛り、目盛りの黒い板（z 100）。2 本目で失った分（同じ大きさの `shot world` を撮る形に直した） | 0.9375 は 171.29・中心 134.999（1・2 本目と同じ）、1 は 160・128.00、黒い板は描かれれば 0 | **同じ**: 0.9375 は 171.293・134.999、1 は 160.000・128.000、黒い板は 2（描かれた: 光の +2）。Minecraft 1.26.60 でも単位・原点は変わらない |
