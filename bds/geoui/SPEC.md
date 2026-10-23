# GeoUI 仕様書 — どの画面でも正しい所に出し、フォームなしで操作する

GeoUI を作る途中で行き詰まらないための、表示（どこに・どの大きさで出るか）と操作（何がどう届くか）の決まりを全部ここに書く。
式は `bds/geoui/screen/layout.js` が 1 か所で持ち、`tests/geoui-screen-offline.mjs` がその式と、それが書く JSON UI の配置を突き合わせる。
本物の画面で確かめる道具は `bds/addons/geoui_device`（[12 章](#12-端末の確かめandroid-の-ciiphone-などの実機)）。

**印**: 「**測った**」= 本物のアプリで測った値（どの実行かを書く）。「**式**」= 式と JSON UI から出る（オフラインの試験が確かめる）。
「**要実測**」= まだ本物のアプリで確かめていない（確かめ方を書く。決めつけない）。

目次: [1 仕組み](#1-仕組み) · [2 座標](#2-座標) · [3 renderer の写し方](#3-renderer-の写し方測った) · [4 表示領域](#4-表示領域viewportとセーフエリア) ·
[5 大きさの決め方](#5-大きさの決め方4-つ) · [6 寄せ先とグループ](#6-寄せ先アンカーとグループ) · [7 端末ごとの数](#7-端末ごとの数) ·
[8 描き方の決まりと限度](#8-描き方の決まりと限度) · [9 入力](#9-入力フォームなしで-pc-を再現する) · [10 文字](#10-文字) ·
[11 HTML から GeoUI へ](#11-html-から-geoui-へ) · [12 端末の確かめ](#12-端末の確かめandroid-の-ciiphone-などの実機) · [13 要実測の一覧](#13-要実測の一覧) ·
[14 osu! を作るとき](#14-osu-を作るときの決め方) · [15 困ったとき](#15-困ったとき) · [16 道具とファイル](#16-道具とファイル)

---

## 1. 仕組み

```
サーバー（BDS のスクリプト）                         クライアント（各プレイヤーのアプリ、毎フレーム）
 setProperty('<ns>:x', 整数)  ──(client_sync, 20 Hz)──▶  minecraft:player の pre_animation（Molang）が q.property を読む
 camera.setCamera('minecraft:free')                          ↓ 変数 → ボーンの位置・大きさ・part_visibility
 getRotation / inputInfo / イベント ◀── 入力 ──            HUD の live_player_renderer（グループごとに 1 つ）が
                                                              プレイヤーのモデル（板 = 厚さ 0 のキューブ）を描く
```

- GeoUI = HUD（`hud_screen.json`）に足した `live_player_renderer`（`type: custom`）が、`minecraft:player` の模型に付けた**板**を描く 2D の UI。
- 板は render controller の条件 `q.is_in_ui && !variable.is_paperdoll` で、UI の中（renderer の中）だけに描く。ワールドの体には出ない。
  ポーズ画面の人形（paper doll）は除く（そこにはプロパティが無く、読むとエラーになる: [8 章](#8-描き方の決まりと限度)）。
- サーバー → クライアントの道は**プレイヤーのプロパティ**（BP の `bp/entities/player.json`、`client_sync: true` の int）。スクリプトが `setProperty`
  し、クライアントの Molang が毎フレーム読む。変わった値だけ送る（同じ値を何度も入れない）。
- UI を開いている間はカメラを `minecraft:free` で止め、頭の向きの変化をポインタ（マウス）にする（[9 章](#9-入力フォームなしで-pc-を再現する)）。
  止めたカメラに自分の体が映らないよう、ワールドの中の自分だけ描かない（third_person の render controller に条件を足す）。
- 作り方は 3 つ: GeoUI Builder（Blockbench、`README.md`）・タイムライン（`TIMELINE.md`）・**GeoUI Screen**（この文書の式そのもの:
  `screen/layout.js`・`pack.js`・`nav.js`・`input.js`。HTML から作る変換器 `html/` もこれを使う）。

## 2. 座標

| 名前 | 向き | 原点 | 使う所 |
|---|---|---|---|
| モデル | x 右・**y 上**・z 奥（north の面が見える面） | プレイヤーのモデルの原点 | ジオメトリ（1 ブロック = 16 単位）、アニメーションの position（足し算） |
| ローカル | x 右・**y 下** | グループの寄せ先の点 | 作る人・HTML の変換器が置く単位（`pack.js` の planes の rect） |
| 画面 | x 右・y 下（px） | 表示領域の左上 | 測る・確かめる |
| JSON UI | x 右・y 下（UI px） | パネルの左上 | 画面 px ÷ GUI の倍率 g_ui |

ローカル (x, y) のグループ G の点のモデル座標は `(G.x + x, G.y − y)`。板は厚さ 0 のキューブで north の面だけに uv（`pack.js` の `rectToModel`）。

## 3. renderer の写し方（測った）

`live_player_renderer` のパネル（px: 左上 P、幅 Pw、高さ Ph）は、モデルの点 (X, Y) をこう描く:

```
u  = K · min(Pw, Ph)                    1 モデル単位の px
sx = Px + Pw/2 + u · X
sy = Py + Ph/2 − u · (Y − D)            （逆: X = (sx − 中心x)/u、Y = D − (sy − 中心y)/u）
K  = 0.9375 / 16 = 0.05859375           パネルの短い辺に、プレイヤーの描く大きさ 0.9375 で 1 ブロック
D  = 24.10 ± 0.17                       モデルの原点はパネルの真ん中の 24.10 単位下（横は真ん中）
```

- **測った**（2026-10-21、Android エミュレータ 1560 x 720、Minecraft 1.26.52.3、`geoui_calib*` と `report.mjs`）: 形の違う 3 枠（10 x 10・20 x 20・
  幅 2 % の 2 x 10）の 5 画面が、尺度 0.08 %・中心 0.7 px で合う。K は 0.058589 ± 0.00005（式の値との差 0.008 %）。別の実行で 0.003 %。
- **正射影**: 縦と横の尺度は同じ（0.9999）、奥行きで大きさは変わらない（手前・奥 60 単位で 0.9999 / 1.0000）。z は重なりの前後にだけ効く。
- GeoUI Studio の 1 つの renderer（`top_middle`・10 % x 10 %・下へ 110 %）では、画面の高さ = 1 / (K · 0.1) = **170.67 単位**（Studio は 176 と置いた）、
  画面の真ん中 = y **135.04**（Studio は 140）。どの横長の画面でも同じ（パネルの短い辺 = 画面の高さの 10 %）。

## 4. 表示領域（viewport）とセーフエリア

GeoUI が描ける枠 = HUD の `root_panel` の大きさ。ゲームの UI の木はこう:

```
base_screen → セーフエリアの枠（左右上下の buffer。大きさはゲームが決める: 端末の切り欠き・設定の「セーフエリア」）
  → screen_panel → hud_screen → hud_content（$compress_hud_width のとき幅 90 %）→ root_panel → <ns>_vp（GeoUI の viewport）
```

- **式**: GeoUI の viewport（`<ns>_vp`）は `root_panel` の先頭に入れ（`insert_front`）、`$compress_hud_width` のときは幅 111.111111 % にして
  90 % を元に戻す（= セーフエリアの内側いっぱい）。ホットバー・体力などの HUD と同じ枠なので、HUD と重ねて置ける。
- `$left_horizontal_safezone_size` などの buffer の大きさは JSON に無く、ゲームが入れる。**要実測**: 切り欠き（ノッチ・パンチホール・Dynamic
  Island）・角の丸み・ホームバーの所をゲームが buffer にするか（iPhone・Android）、どの端末で `$compress_hud_width` が立つか、
  設定の「セーフエリア」（ゲーム機・PC の画面の位置と大きさ）を動かした時に GeoUI が付いてくるか（式では付いてくる）。
  確かめ方: `geoui_device` の `gdev:show 8`（viewport の外にだけ出る白い印）と、切り欠きを出した画面の 9 つの寄せ先（12 章）。
- 設計の決まり: 押す物・読ませる物は viewport の中に置く。画面の端まで塗りたい背景は、枠より大きく描いてよい（外にはみ出した分も描かれる。
  切り抜きたい時は `clips_children`: 8 章）。

## 5. 大きさの決め方（4 つ）

viewport W x H px（GUI の倍率 g_ui = 画面 px / JSON UI px）で、グループの renderer の正方形のパネルの辺 S と、1 単位の px u = K · S:

| 決め方（`scale`） | 正方形の辺 S | u（px / 単位） | viewport を単位で | 向いている物 |
|---|---|---|---|---|
| `height`（s、既定 0.1） | s · H | K · s · H | (W/H)/(K s) x **1/(K s)** | HUD の部品。高さに合わせ、横長ほど横に広い（s 0.1: 高さ 170.67） |
| `width`（s） | s · W | K · s · W | **1/(K s)** x (H/W)/(K s) | 横いっぱいに並べる物 |
| `gui`（px） | px / K（JSON UI px） | px · g_ui | W/(px g_ui) x H/(px g_ui) | ゲームの HUD と同じ倍率（1 単位 = px JSON UI px。ホットバー 182 x 22） |
| `contain`（Dw, Dh, g） | (1/(K g)) · min(W/Dw, H/Dh) | min(W/Dw, H/Dh) / g | デザインの箱 Dw·g x Dh·g が収まる（余りは帯） | ページ・盤面（1 つの絵として形を変えない。押す物はこれ） |

JSON UI（`layout.squareOf`。どれも `anchor_from` = 寄せ先、`anchor_to` = center の正方形のパネルの中に renderer 1 つ）:

```
height : size ["100%y", "<100·s>%"]                      高さ s、幅 = 自分の高さ
width  : size ["<100·s>%", "100%x"]                      幅 s、高さ = 自分の幅
gui    : size [px/K, px/K]                                JSON UI px
contain: 箱 size ["<100·q/Dw>%", "<100·q/Dh>%"]（q = 1/(K g)）
         → 中 size ["100%y", "100%"]・max_size ["100%", "100%"]（幅 = min(箱の高さ, 箱の幅)）
         → 正方形 size ["100%", "100%x"]                    辺 = min(箱の幅, 箱の高さ) = q · min(W/Dw, H/Dh)
```

**式**（`%x` は自分の幅の %、`%y` は自分の高さの %、`max_size` は親の %）: オフラインの試験が、この JSON UI を小さな JSON UI の配置で置き直し、
13 画面 x 4 つの決め方 x 9 つの寄せ先 x HUD の 90 % あり・なしで、点が式どおり（1/1000 px 以内）に来ることを確かめる。
本物のゲームでの `%x`・`%y`・`max_size` の効き方は `geoui_device` の contain の枠と GUI の枠で確かめる（12 章）。

## 6. 寄せ先（アンカー）とグループ

**グループ** = 寄せ先 1 つ（`top_left` `top_middle` `top_right` `left_middle` `center` `right_middle` `bottom_left` `bottom_middle` `bottom_right`）と
大きさの決め方 1 つを持つ、renderer 1 つ分の中身。サーバーは画面の形を知らなくてよい: どの画面でも、ゲームの JSON UI が寄せ先を置く。

**置き方の式**（`layout.offsetOf`）: グループのモデルの点 G を、寄せ先の点 A に来させる。正方形のパネルを `anchor_from: <寄せ先>`・`anchor_to: center`
にして、

```
offset = [ "<−100·K·G.x>%x", "<100·K·(G.y − D)>%y" ]     （正方形なので %x と %y は同じ長さ）
→ パネルの中心 = A + (−K·S·G.x, K·S·(G.y − D))、u = K·S
→ ローカル (x, y) の点の画面の位置 = A + u · (x, y)          ← 寄せ先の点 + 単位 x u。これだけ
```

- **グループのモデルの点**（`layout.groupOrigin`・`guiOrigin`。`origin` で自分で決めてもよい）: i 番目（gui 以外）は
  `((i mod 5) − 2) · 1500, 1200 + ⌊i/5⌋ · 600`、gui の k 番目は `((k mod 3) − 1) · 4500, −3000 − ⌊k/3⌋ · 1500`。
- **ほかのグループが映らないこと**（`layout.ghosts`）: renderer はどれもモデル全体（全部のグループと、原点の自分の体）を描く。だからグループの中身は、
  ほかのどの renderer でも画面の外に来る所に置く。十分な条件: u_A · |ΔG.x| > 2W または u_A · |ΔG.y| > 2H。height 0.1 なら横 1500・縦 600 で
  32:9 まで足りる。gui は u が数 px（GUI の倍率）なので遠くまで見える → gui のグループは原点の下の自分の帯（横 4500・縦 1500）。
  `pack.js` は 13 画面 x GUI の倍率 2・3 で全部の組を調べ、映る組があれば注意を出す（`origin` を離す・決め方を変える）。
- **測った値の誤差が動かす量**（式）: K が測った 0.058589・D が ±0.17 ずれても、帯の一番遠いグループの点は 1080p で **3 px 未満**。
  端末の確かめでこれより大きくずれたら、式がその画面で成り立っていない。
- **当たり判定は 1 つのグループの中で**: グループどうしの位置の関係は画面の形で変わる。ポインタ・押す物・その判定は同じグループ（同じ renderer）に置く
  （HTML の変換器のページは contain の 1 グループ）。
- グループごとに `clip`（切り抜く枠: `clips_children` のパネルの中に renderer。**要実測**: renderer に効くか）と `layer`（JSON UI の重なり）。
- **renderer の数は少なく**: どの renderer もモデル全体を描くので、グループ N 個 = 全部の板を N 回描く。pre_animation が renderer ごとに動くか
  （N 回）も**要実測**（`geoui_device` の rc の棒）。目安: HUD の部品は寄せ先ごとに 1 つ、ページは 1 つ。

## 7. 端末ごとの数

`height 0.1`（既定）と `contain 1280 x 720・g 0.25` が各画面でどうなるか（`layout.deviceTable`。viewport = 画面全体として。セーフエリアで狭まる分は 4 章）:

| 端末 | 画面 px | 比 | height 0.1: 幅 x 高さ（単位） | px / 単位 | contain の箱 px | 余り（帯） |
|---|---|---|---|---|---|---|
| タブレット 4:3（iPad mini・iPad 10.2） | 2048x1536 | 1.333 | 227.6 x 170.7 | 9.00 | 2048 x 1152 | 上下 192 px ずつ |
| iPad Pro 11 / Air（約 1.43） | 2388x1668 | 1.432 | 244.3 x 170.7 | 9.77 | 2388 x 1343 | 上下 162 px ずつ |
| 折りたたみ（内側 約 1.2） | 2208x1840 | 1.200 | 204.8 x 170.7 | 10.78 | 2208 x 1242 | 上下 299 px ずつ |
| Android タブレット 16:10 | 2560x1600 | 1.600 | 273.1 x 170.7 | 9.38 | 2560 x 1440 | 上下 80 px ずつ |
| PC・ゲーム機 16:9 | 1920x1080 | 1.778 | 303.4 x 170.7 | 6.33 | 1920 x 1080 | なし |
| PC 16:10（Steam Deck も） | 1920x1200 | 1.600 | 273.1 x 170.7 | 7.03 | 1920 x 1080 | 上下 60 px ずつ |
| Android 18:9 | 2160x1080 | 2.000 | 341.3 x 170.7 | 6.33 | 1920 x 1080 | 左右 120 px ずつ |
| ラボの CI の端末（約 19.5:9） | 1560x720 | 2.167 | 369.8 x 170.7 | 4.22 | 1280 x 720 | 左右 140 px ずつ |
| iPhone 19.5:9（X〜16） | 2556x1179 | 2.168 | 370.0 x 170.7 | 6.91 | 2096 x 1179 | 左右 230 px ずつ |
| Android 20:9 | 2400x1080 | 2.222 | 379.3 x 170.7 | 6.33 | 1920 x 1080 | 左右 240 px ずつ |
| Android 21:9（Xperia） | 2520x1080 | 2.333 | 398.2 x 170.7 | 6.33 | 1920 x 1080 | 左右 300 px ずつ |
| PC ウルトラワイド 21:9（64:27） | 2560x1080 | 2.370 | 404.5 x 170.7 | 6.33 | 1920 x 1080 | 左右 320 px ずつ |
| PC スーパーウルトラワイド 32:9 | 3840x1080 | 3.556 | 606.8 x 170.7 | 6.33 | 1920 x 1080 | 左右 960 px ずつ |

- 横長の画面で `height` のとき、**高さはいつも 170.67 単位、幅だけが比で変わる**（4:3 で 227.6、32:9 で 606.8）。左右に寄せた物は画面の端に付いて
  動き、真ん中の物は真ん中に残る。だから「16:9 で作って 21:9 で左右の物が真ん中の物に重なる」ことは無く、4:3 で狭くなる方を気にする:
  **一番狭い 4:3 の 227 単位（左右の寄せ先の間）に収まるように置く**。縦に置く物は 170 単位に収める。
- iPhone の横向きのセーフエリア（OS の値）: 左右 59 pt・下 21 pt（@3x で 177 px・63 px）。ゲームがこれを HUD の外にするなら viewport は
  2202 x 1116 px（**要実測**）。
- `gui` の 1 単位 = 1 JSON UI px x px。g_ui（画面 px / JSON UI px）は端末と設定の GUI の倍率で決まり、**要実測**（`geoui_device` の density の区切りで、
  ホットバーの大きさの枠 182 x 22 が本物のホットバーに重なるか）。

## 8. 描き方の決まりと限度

| 決まり | 中身 | 状態 |
|---|---|---|
| 描く条件 | render controller `q.is_in_ui && !variable.is_paperdoll`、アニメーション `q.is_in_ui` | 測った（GeoUI Builder・タイムライン） |
| プロパティを読む | どの行も `variable.is_paperdoll ? 0 : q.property('ns:x')`（人形にはプロパティが無く、読むとその後の pre_animation が止まる） | 測った（probe 2 回目） |
| まだ入れていない変数 | pre_animation で、まだ入れていない自分の変数を `??` なしで読むと、**その行から後が毎フレーム全部されない** | 測った（probe 1・2 回目）。`GeoUICore.unsetReads` が書き出しの前に見つける |
| Molang の行 | 1 行 1000 文字・括弧 24 段まで（長い行は短い行に分ける）。1 つの pre_animation で 61 万文字・5029 行・変数 約 5000 個まで動いた | 測った（probe_m・sz・lc・vx） |
| ボーン | 600 本まで描かれた（#599 も） | 測った（probe_b） |
| 自分の render controller | 70 個まで描かれた（part_visibility で分ける） | 測った |
| アニメーション | 1200 個まで動いた | 測った |
| プロパティ | 32 個まで（ゲームの上限）。int は ±2^24 まで正確（float32） | ゲームの決まり |
| 材質 | cutout・blend・add・fade・addfade・glass（なめらかな絵は `_s`: Bilinear）。どれも `USE_UV_ANIM` なので render controller に `uv_anim`（offset 0・scale 1） | 測った（cutout・blend・add・fade） |
| 不透明度 | render controller の `color.a` は blend の材質では効かない。色のマスク（`USE_COLOR_MASK`）の fade で効く（0 で消える・0.5 で半分） | 測った（probe 3 回目） |
| 重ね方 | 同じ平面に 2 枚の面を作らない（ちらつく）: 重なる面は 0.021 ずつ奥へ（`pack.js`）。手前 = z が小さい | 式（ラボの模型の確かめ） |
| 描く順と奥行き | 半透明の物の後ろに描く物が隠れるか・ジオメトリの順か z か | **要実測**（`geoui_device` の order: 赤を奥・青を手前、青が先） |
| ボーンの変形 | 同じボーンの scale は掛け算・position は足し算、正の回転は画面で時計回り | 測った |
| 光 | 板の色にゲームの光（明るさ・向き）が掛かるか | **要実測**（`geoui_device` の colors: 白・灰・赤・緑・青・黒・半透明の白の見え方） |
| 鏡写し | 絵が左右反転しないか | **要実測**（`geoui_device` の glyph: F の右に赤・左に青） |
| 切り抜き | `clips_children` のパネルの中の renderer が切り抜かれるか | **要実測**（`geoui_device` の clip） |
| 見える範囲 | 中身は原点から遠いので、ジオメトリの `visible_bounds` は全部のグループを含む大きさにする（`pack.js`） | 式 |
| 自分の体 | 止めたカメラに映らないよう、third_person の render controller に `!(q.is_local_player && !q.is_in_ui && <開いている>)` | BDS で確かめた。描画は要実測 |
| HUD を隠す（F1） | renderer に `#hud_visible` を結ぶと、HUD と一緒に消える（`pack.js` の既定） | 式 |
| インベントリの人形 | これも live_player_renderer: GeoUI の中身は遠くにあるので、人形の枠の外 | **要実測**（README「まだ確かめていないこと」） |

## 9. 入力: フォームなしで PC を再現する

フォーム（`ActionFormData` など）を開くと、ゲームはマウス（タップ）しか受け付けず、キーもスティックも UI の操作に使えない。GeoUI はフォームを
使わず、**プレイヤーの普通の入力をスクリプトが毎 tick 読み**、UI の操作に変える（`screen/input.js`、HTML の変換器の `html/runtime.js`）。

| PC | タッチ | ゲームパッド | スクリプトが読む物 | GeoUI での意味 |
|---|---|---|---|---|
| マウスを動かす | 画面をなぞる | 右スティック | `getRotation()` の変化（ヨーは短い方へ） | **ポインタ**（マウス）: Δ x sens 単位 / 度 |
| W A S D | 移動のパッド | 左スティック | `inputInfo.getMovementVector()`（**+x が左**・+y が前） | **矢印キー**: 焦点を見た目の向きへ（斜めも） |
| Space | ジャンプのボタン | A | `getButtonState(Jump)`・`playerButtonInput` | **決定**（Enter: 押す → 離すでクリック） |
| Shift | スニークのボタン | 右スティック押し込み（R3） | `getButtonState(Sneak)`・`playerButtonInput` | **戻る**（Escape） |
| 左クリック | 画面をタップ（**要実測**） | RT | `playerSwingStart`（swingSource `Attack`） | ポインタの下をクリック |
| 右クリック | （**要実測**） | LT | `itemUse`（使える物を持っている時だけ。素手は**要実測**） | 右クリック（戻る） |
| ホイール | ホットバーを押す | LB / RB | `selectedSlotIndex` の変化 | **ホイール**（−4〜+4、短い方へ回る）と 1〜9 のキー |
| 1〜9 | ホットバーを押す | — | 同上 | スロットの物を選ぶ（タブなど） |
| 文字 | チャット | チャット | カスタムコマンド `/<ns>:t <文字>` | 文字の入力（チャットの送信イベントはベータなので使わない） |
| エモート | エモート | エモート | `playerEmote` | 予備のボタン（**要実測**） |
| — | — | — | `inputInfo.lastInputModeUsed`・`playerInputModeChange` | 今の操作の種類（ヒントの出し方を変える） |

- **ポインタ**（`input.js`）: `Δyaw = wrap180(yaw − 前の yaw)`、`Δpitch = pitch − 前の pitch`、ポインタ += sens · (Δyaw, Δpitch)、枠の中に止める
  （端で止まり、戻せばすぐ動く: 不感帯なし）。ピッチは ±90° で止まるので、**45° を越えたら水平に戻す**（`setRotation`。カメラは止まっているので
  見えない）。戻した直後の読みは前の向きか戻した後の向きか分からないので、**両方と比べて小さい方**を取る（40 回まで待つ）: ポインタは跳ばない。
  1 回の変化が 60° を超えたらテレポート・リスポーンと見て捨てる。
- **焦点の移動**（`nav.js`）: 押した向き（W A S D・スティックの角度・斜め）に、一番近い物へ。四方向: その向きに中心が進んだ物の中で
  「近い辺の距離 + 横のずれ x 2 − 重なりの割合の分」。斜め・角度: 中心どうし 60° 以内で「進む距離 + 横のずれ x 3」。同じ入れ物（`group`）に
  その向きの物があればそれが先。**あいまい**（点が 2 以内）なら: ポインタを使っている間はポインタに近い方、そうでなければ**よりまっすぐその向き**
  の方（横に重なる割合が大きい方）→ 横のずれが小さい方 → 文書の順。軸から 15° 以内の向きはその軸（W に少し D が混ざってもまっすぐ上）。
  押し続けると 8 tick（0.4 秒）後から 3 tick ごとにくり返す。どこへ行くかは前もって W A S D の札（ヒント）で見せる（ヒントも同じ計算）。
  Tab のような折り返し（行の終わり → 次の行の頭）は `wrap: 'line'` で選べる（既定は止まる）。
- **体を止める 3 つの方法**: `free`（動いたら毎 tick 戻す。既定）・`speed`（移動の速さ 0。抜けても戻せるよう、元の速さをワールドに残す）・
  `lock`（`inputpermission` の Movement を止める。**要実測**: 止めると本物のクライアントが移動の入力を送らなくなるか。ラボのボットは送らない）。
  ジャンプ・スニークは止めない（決定・戻るに使う）。
- **HUD**: 開いている間、HUD の部品を隠す（`setHudVisibility`）。ただし**タッチの操作**（スマホのジャンプ・スニーク・移動のパッド = 決定・戻る・矢印）
  と、スロットを使うページでは**ホットバー**は残す。
- **tick**: スクリプトは 20 回 / 秒。1 tick より短いタップは `playerButtonInput`（押した）で拾う。ポインタの描画も 20 回 / 秒で動く
  （クライアントの回転のクエリで毎フレーム動かせるかは**要実測**: `geoui_device` の query の棒）。
- **開いたまま抜けた人**は、戻ると閉じている（カメラ・HUD・移動の許可・速さを戻し、前のページは忘れる）。
- 出来事は `/scriptevent <ns>:on_<open|close|page|click|change|event> <JSON>` で別のパックへ（`system.sendScriptEvent`）。
  `on_` を付けるのは、自分のコマンド（`<ns>:open` など）と同じ名前で自分に戻ってきて、くり返さないため（ウォッチドッグで止まった）。

## 10. 文字

| 道 | 中身 | 状態 |
|---|---|---|
| 字の絵（アトラス） | 決まった文字は絵にしてアトラスへ（`screen/font.js` の 3 x 5 の字、HTML の変換器はブラウザが描いた字） | 式 |
| 数字 | 桁ごとに 10 枚の板（または `uv_anim` のコマ）。値はプロパティ（±2^24） | 測った（Builder・タイムライン） |
| サーバーの文字（何でも） | `setTitle` の文字を、JSON UI のラベルに `#hud_title_text_string`（global）で結ぶ。`('%.3s' * #x)` で先頭 3 文字、`(#x − ('%.3s' * #x))` で残り | **要実測**（`geoui_device` の text: OCR で 4 つの文字が読めるか） |
| プレイヤーの文字 | `/<ns>:t <文字>`（チャットのカスタムコマンド） | BDS で確かめた |

タイトルの文字を GeoUI に使うと、バニラのタイトル（画面の真ん中の大きな字）にも出る。先頭の印で見分けて、印がある時はバニラの方を隠すのが
次の形（**要実測**: ラベルの文字の大きさ・位置が寄せ先で決まるか）。

## 11. HTML から GeoUI へ

```sh
node bds/geoui/html/convert.mjs page.html --out bds/addons/<名前> [--ns gh] [--design 1280x720] [--dpr 2] [--hold free|speed|lock]
node bds/geoui/html/convert.mjs --sample            # 見本: html/examples/menu.html → bds/addons/geoui_html_demo
```

1. **撮る**（`capture.mjs`、Chromium）: ページをデザインの大きさで開き、ページ（`data-geoui-page` の区切り。外にある物は全部のページ）ごとに、
   動かない部分（土台）と、**操作できる物を 1 つずつ・状態ごと**（通常・`:hover`・`:focus-visible`・`:active`・ON / OFF・使えない）に、ページ自身の CSS
   のまま撮る（DevTools の `CSS.forcePseudoState`）。スライダーと進み具合は 11 の値（スライダーは焦点のある姿も）、数字は桁ごとに 0〜9。
2. **組む**（`scene.mjs`）: 絵を 64 px の塊に切り（一色の塊は 4 x 4 の板を伸ばす・それ以外は描いた所だけ）、同じ絵は 1 度だけアトラスへ
   （2048 px まで、何枚でも）。ページは contain の 1 グループ（どの画面でも形を変えず、余りはページの背景の色）。状態ごとの絵は自分のボーンで、
   `part_visibility` が 1 つだけ見せる（押している > 焦点 > ホバー > 通常。その物が持つ見た目の中で）。焦点の枠・W A S D の札・ポインタは一番上。
3. **動かす**（`runtime.js`）: 9 章の入力のまま。何をするかは:

| 書き方 | すること |
|---|---|
| `data-geoui-action="page:<id>"` | そのページへ（スニークで戻る） |
| `back` / `close` / `open:<id>` | 戻る / 閉じる / 履歴に積まずにそのページへ |
| `event:<名前>` | `/scriptevent <ns>:on_event {"name":…}` を送る（別のパックが受ける） |
| `cmd:<コマンド>` | プレイヤーとして実行 |
| `toggle` / `set:<名前>=<値>` | ON / OFF / `data-geoui-show` の部分を出す・隠す |
| `role="tab"`・`aria-controls="<ページ>"` | タブ（同じ `data-geoui-group` で 1 つ）。そのページへ |
| `role="switch"`・checkbox | ON / OFF（プレイヤーごとにワールドに残る） |
| `role="radio"`・`data-geoui-radio="<名前>"` | 同じ名前で 1 つ |
| `input type=range` | スライダー（A / D と、焦点がある時のホイール 1 目盛り） |
| `data-geoui-slot="1〜9"` | ホットバーのそのスロット・数字のキーで選ぶ（タブ・持ち物） |
| `data-geoui-value="<名前>"`・`data-geoui-digits` | サーバーが変える数字（`/scriptevent <ns>:set <名前> <数>`） |
| `progress`・`data-geoui-gauge` | 進み具合（11 コマ） |
| `data-geoui-show="<名前>"` | 出す・隠す部分（`<ns>:show <名前> 0/1`） |
| `data-geoui-group` | 焦点の入れ物（その中を先に動く） |
| `<body data-geoui-design="1280x720" data-geoui-start="<ページ>">` | デザインの大きさ・最初のページ |

- 限度: 操作できる物 255 個（焦点の番号 8 bit）、W A S D の札は 63 個目まで（6 bit）、プロパティ 32 個（ページの数ではなく、操作できる物 24 個ごと・
  スライダーと進み具合 6 個ごとに 1 個）、ボーン 600 本。超えると変換が注意を出す。
- 文字の入力欄（`input type=text`）は、焦点を当てて `/<ns>:t <文字>`。
- 見本 `geoui_html_demo`: ページ 3・操作できる物 25・アトラス 2048x2048 + 2048x128・ボーン 251・プロパティ 9。本物の BDS で 17/17。

## 12. 端末の確かめ（Android の CI・iPhone などの実機）

`bds/addons/geoui_device`（`node bds/geoui/screen/device.mjs` が作る）: `/scriptevent gdev:show <ビット>` で印を出す。

| ビット | 出る物 | 正しいとき |
|---|---|---|
| 1 | 9 つの寄せ先に 8 x 8 単位の色の四角（11 色: 赤・橙・黄・黄緑・緑・青緑・水色・空色・青…） | 四隅の四角が画面の角にぴったり、辺の真ん中・中心も |
| 2 | contain の箱（16:9 のデザインの外枠） | 画面の 2 辺に付く（4:3 は左右・横長は上下） |
| 4 | gui の枠（ホットバーの 182 x 22 と 32 x 32） | 本物のホットバーに重なる（GUI の倍率） |
| 8 | viewport のすぐ外の白い印 | 普通の画面では見えない。見えた辺 = 画面が HUD の外まである |
| 16 | 30 % x 30 % の切り抜く枠の中の大きな灰色 | 枠に収まれば `clips_children` が効く |
| 32 | Studio の renderer で真ん中の十字 | 緑の中心と重なる（3 章の 135.04） |
| 64 / 1024 / 2048 | 色・F の字・重なり | 光・鏡写し・描く順（8 章） |
| 128 / 256 / 512 | 入力の表示・回転のクエリの棒・renderer ごとの計算の回数 | 9 章・6 章 |
| 4096 | タイトル・サブタイトルを結んだラベル | 10 章 |

- **Android（ラボの CI）**: `node lab.mjs app ci --batch geoui_device,geoui_calib`（**人の許可をもらってから**）。app.txt は画面の大きさ 10 種
  （既定 1560x720・4:3・折りたたみ・16:10・16:9・18:9・19.5:9・20:9・21:9・32:9）・画素の細かさ 2 種・切り欠き 3 種で撮って測り
  （`measure marks`: 色ごとの箱 px）、入力を 30 通り試す（`GDEV CHECK <名前> PASS|FAIL`）。期待の位置: `node bds/geoui/screen/device.mjs expect <幅>x<高さ>`。
  3 px 以内なら式どおり（6 章の誤差）。
- **iPhone・iPad・PC・ゲーム機（人の目）**: `geoui_device` を入れたワールドで、横向きで、`bds/addons/geoui_device/TASK.md` の「人が見ること」の
  7 つを写真に撮る（`gdev:show 0` の時と比べて）。特に: 1 = 四隅の四角が Dynamic Island・角の丸み・ホームバーで欠けないか（欠ければその分
  セーフエリアが内側）、8 = 白い印が見えた辺、7 = 指でなぞるとポインタが動くか・ジャンプとスニークのボタン・ホットバー。
- **結果**（ここに書き足す）: 下の 13 章の表の「結果」。

## 13. 要実測の一覧

| こと | 確かめ方 | 結果 |
|---|---|---|
| 9 つの寄せ先が 4:3〜32:9・折りたたみで式どおりか | Android CI: anchors-* の measure marks | （CI の結果を待つ） |
| contain の箱（`%x`・`%y`・`max_size` の鎖） | Android CI: box-* | （同） |
| GUI の倍率（g_ui）と画素の細かさ | Android CI: gui-dpi240/480・box-* の gui の枠 | （同） |
| 切り欠きを HUD の外にするか（Android） | Android CI: anchors-cut-*・over-cut-* | （同） |
| 切り欠き・Dynamic Island（iPhone） | 人の目: TASK.md の 1・2 | （人の確かめ待ち） |
| `$compress_hud_width` が立つ端末 | 人の目・CI: over の白い印 | （同） |
| `clips_children` が renderer に効くか | Android CI: clip-* | （CI の結果を待つ） |
| 光・鏡写し・描く順 | Android CI: colors | （同） |
| pre_animation が renderer ごとに動くか | Android CI: rc | （同） |
| 回転のクエリ（クライアントでポインタを毎フレーム） | Android CI: query-after | （同） |
| タイトルの文字をラベルに・先頭 3 文字・残り | Android CI: text（OCR） | （同） |
| 移動を禁止（lock）した時、本物のクライアントが移動の入力を送るか | Android CI: in-key-locked・in-stick-locked | （同） |
| 止めたカメラ（`minecraft:free`）で頭の向きが変わるか | Android CI: in-look-locked（frozen-turn・frozen-pointer） | （同） |
| ジャンプ・スニークを禁止した時のボタン | Android CI: in-jump-denied・in-sneak-denied | （同） |
| マウスのホイール・数字のキー・パッドの LB/RB | Android CI: in-wheel・in-slot-key・in-slot-pad | （同） |
| 腕の振り（マウス・タッチ・パッド）・使う | Android CI: in-swing-*・in-use-pad | （同） |
| 操作の種類の変化 | Android CI: in-mode | （同） |
| HTML の見本の見た目・焦点・ページ | Android CI: `-a geoui_html_demo`（許可が要る） | （まだ回していない） |
| インベントリの人形に GeoUI が映らないか | ゲームパッドの Y で持ち物を開いて写す | （まだ） |
| 大きな UI の重さ（fps） | `perf` の手順 | （まだ） |

## 14. osu! を作るときの決め方

- **盤面**: osu! の 512 x 384 osu!px を `contain`（例 g 0.4: 204.8 x 153.6 単位）の 1 グループ。当たり判定・カーソル・円は全部この中
  （6 章: 判定は 1 つのグループの中）。画面の比が違っても盤面の形は変わらず、余りは帯（7 章の表の contain の行と同じ考え）。
- **HUD**（点数・コンボ・体力・精度）は `height` の寄せ先ごとのグループ（右上・左下・左上）。4:3 の幅 227 単位に収める。
- **狙い（aim）**: 頭の向き = カーソル（9 章のポインタ）。sens は 盤面の単位 / 度。スマホは画面をなぞる・PC はマウス・パッドは右スティック。
- **押す**: ジャンプ（Space / A / ボタン）・腕の振り（左クリック / タップ / RT）・使う（右クリック / LT）の 3 つを osu! の 2 つのキー + マウスに。
  1 tick より短い押しも `playerButtonInput` で拾う。判定はサーバーの tick（50 ms）刻みなので、ずれは `offset` で直す（TIMELINE.md）。
- **動き**: 時間で動く物はクライアントの Molang（`q.life_time` など）で毎フレーム、サーバーは時刻とイベントだけ送る（タイムラインのやり方）。

## 15. 困ったとき

| 症状 | 原因 | 直し方 |
|---|---|---|
| 何も出ない | pre_animation の途中でまだ入れていない変数を読んでいる / 人形でプロパティを読んでいる | `GeoUICore.unsetReads`・`variable.is_paperdoll ? 0 :` |
| 画面の比で位置がずれる | 1 つの renderer で全部を置いている（Studio の形） | 寄せ先ごとのグループ（6 章） |
| 左右の物が真ん中の物に重なる | 4:3 で幅が 227 単位しかない | 一番狭い 4:3 で並べる（7 章） |
| 別の所に同じ絵が出る | ほかのグループ・体が映っている | `pack.js` の注意を見て `origin` を離す（6 章） |
| ちらつく | 同じ平面に 2 枚 | z を 0.021 ずらす（`pack.js` が自動で） |
| 半透明が効かない | blend の材質で `color.a` | fade の材質（8 章） |
| ボタンを押すと体がジャンプする・しゃがむ | 体を止めていない | `free` / `speed` / `lock`（9 章） |
| ポインタが跳ぶ | ピッチの戻しを 2 つの向きで読んでいない | `input.js` の `turnedTo`（9 章） |
| 開いたら止まる・くり返す | 出来事の名前が自分のコマンドと同じ | `on_<名前>` で送る（9 章） |
| 焦点がおかしな所へ | 入れ物（group）が無い・あいまい | `data-geoui-group`、W A S D の札で確かめる |

## 16. 道具とファイル

| ファイル | 中身 |
|---|---|
| `screen/layout.js` | この文書の式（座標・4 つの決め方・寄せ先・JSON UI・端末の表・映り込みの確かめ） |
| `screen/pack.js` | 場面（グループ・アトラス・ボーン・板・Molang・プロパティ・スクリプト）→ 2 つのパック |
| `screen/nav.js` | 向きつきの焦点の移動（斜め・あいまい・入れ物・ヒント・当たり判定） |
| `screen/input.js` | フォームなしの入力（ポインタ・キー・ボタン・ホイール・くり返し） |
| `screen/font.js` | 3 x 5 の字 |
| `screen/device.mjs` | 端末の確かめのパック（`bds/addons/geoui_device`）と期待の位置（`expect`） |
| `html/` | HTML → GeoUI（`capture.mjs`・`scene.mjs`・`runtime.js`・`convert.mjs`・見本 `examples/menu.html`） |
| `app/lib/measure.mjs` の `marks` | スクショの色ごとの箱を測る（`measure marks <shot>`） |
| `tests/geoui-screen-offline.mjs`・`tests/geoui-html-offline.mjs` | 式と JSON UI・パック・焦点・入力・端末のパック、変換器（パックの Molang をゲームと同じに動かした見た目・main.js そのもの） |
