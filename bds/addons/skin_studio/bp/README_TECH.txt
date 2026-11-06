# Skin Studio — 技術解説（共有用）

Skin Changer（改変版を同梱）＋表彰台＋鏡を1つにまとめたアドオンです。
すべて、**クライアントの Molang 一時変数(temp)がエンティティをまたいで残る性質**（Magic Method / temp leak）を使っています。

## 0. 導入
- `Skin_Studio.mcaddon` だけを入れる。**単体の Skin Changer は外す**（同じプレイヤー定義を持つため、二重に入れない）。
- ワールド設定で「ベータ API」を有効に（Skin Changer と SimulatedPlayer が使うため）。
- 動作確認: BDS 1.26.62.1 の実サーバーでテスト 85/85・QA 問題なし（bds-lab）。

## 1. スキンの受け渡し（Skin Changer 方式）
- 各プレイヤーに番号 `mimic:slot`(1〜100) と世代 `mimic:epoch` を振る。
- プレイヤーの render controller の中で自分のスキンを書き出す:
  `temp.mimic_texture_<slot> = Texture.default; temp.mimic_epoch_<slot> = <epoch>;`
- 受け取る側（像・鏡像・HUD）は、エンティティプロパティが指す番号の temp を読み、世代が一致したときだけ採用して `variable.*` にキャッシュする。
- 世代(epoch)があるので、退出した人の番号を別人が使っても取り違えない。

## 2. 4D・細腕スキン（ジオメトリの受け渡し）※実験的
- `temp.mimic_geometry_<slot> = Geometry.default;` を **見えない専用 render controller**（`part_visibility: {"*": false}`）で書き出す。式が動かなくても、プレイヤー本体の描画は壊れない。
- 像と鏡像の `geometry` 式がそれを読む。取れないときは通常/細腕の形に戻る（細腕かどうかは `getPlayerSkin` の armSize で自動判定）。

## 3. SimulatedPlayer マネキン（オフラインでもスキンを出す）
- `getPlayerSkin(player)` で PlayerSkinData（armSize / skinColor / personaPieces）を取得し、ワールドに保存。
- 必要なときに `spawnSimulatedPlayer(...)` で出して、すぐ `setSkin(data)`（最初から着せる）。後から `setSkin` し直せば着せ替えになり、像も追従する。
- マネキンも「プレイヤー」なので番号が振られ、自分のスキンを書き出す。像はその番号を指すだけ。
- マネキン本体は、しゃがみ＋手にバリアで third_person の描画を止めて隠す（スキンの書き出しは続く）。
- 制約: 取れるのはペルソナ（キャラクタークリエイター）の情報。スキンパックや自作PNGは再現できない場合がある。マネキンはプレイヤー一覧に出る。

## 4. geoUI 式 HUD（画面に像を映す）
- バニラの一人称アニメは `body` ボーンを `[query.target_x_rotation, query.target_y_rotation, 0]` で回してカメラに合わせている。
- `body` という名前の空ボーンの下に、改名した人型（hud1_* など）をぶら下げたジオメトリを一人称のときだけ描く → 画面に固定される。
- 首と目の高さの差は、子ボーンの position に `[0, 3.65·cosθ − 3.65, 3.65·sinθ]` を足して打ち消す（どの角度でも目の前12単位に来ることを数値で確認済み）。

## 5. 鏡（視点ごとの鏡像）
- **サーバーは「誰を映すか」だけを決める**（鏡ごとに近い順に最大4人。0.5秒ごと）。動きは各クライアントが毎フレーム計算する。
- プレイヤーは pre_animation で、自分の位置・体の向き・首の角度・手足の振り・しゃがみを `temp.sp_*_<slot>` に書き出す。手元のプレイヤー（`query.is_local_player`）は、カメラの位置も書き出す（一人称は目、三人称は `query.camera_rotation` と `query.distance_from_camera` から求める）。
  `should_update_bones_and_effects_offscreen` があるので、自分の後ろにいて画面に入っていない人も、鏡の中では動く。
- 鏡像エンティティは鏡面のすぐ前に置いてあり、**鏡像（鏡の向こうの虚像）を、見ている人のカメラから鏡面へ投影**する:
  `t = カメラと鏡の距離 / (カメラと鏡の距離 + 人と鏡の距離)`、位置 = カメラ + (人 − カメラ)·t、大きさ = t。
  鏡面に平らに描いても、その視点から見れば本物の鏡と同じに見える（実際の鏡に映る像も、鏡面への中心投影と同じ）。
- 左右反転は、エンティティの `scaleZ` を負の小さな値（−0.02）にして行う（鏡の法線方向に反転しつつ、薄く潰して鏡面に貼る）。
- 枠からはみ出す部分は、脚・胴・頭ごとに隠す。枠の縁が鏡面より手前に出ているので、縁の部分は自然に隠れる。
- 変身（Skin Changer）中の人は、変身後の姿で映る（スキンは変身先の番号、動きは本人の番号）。
- 検証: ゲームと同じ描画規則（x方向の反転描画・回転の向き）を再現したシミュレーションで、遠くから見た場合の位置・向き・左右反転の誤差は 0。近いと体の厚みの分だけ遠近がずれる（最大でも約0.2ブロック）。
- 実機で向きや位置がずれていたら、鏡の「映り方の設定」の調整スイッチ（左右・向き・高さ）か `/scriptevent mirror:fix 0〜7` で直せる。
- 鏡に映るのはプレイヤーだけで、手に持った物・鎧・周りの景色は映らない。

## コマンド
- `/scriptevent podium:hud` — 画面表示の設定（`podium:hud podium|self|off` で切り替えだけもできる）
- `/scriptevent podium:vault` — スキン保管庫
- `/scriptevent podium:set 1 名前`（`@s` = 実行した人） / `podium:clear all` / `podium:ceremony`
- `/scriptevent mirror:fix 0〜7` — いちばん近い鏡の調整
- `/skinchanger:skin change @s 相手` など — Skin Changer 本体のコマンド（`/skin:*` の短縮形は、新しいマイクラでは登録できないため省略される）
