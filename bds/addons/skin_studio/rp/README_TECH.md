# Skin Podium v3 — 技術解説（共有用）

Minecraft統合版で「プレイヤーのスキンを、別のエンティティや画面(HUD)に映す」ための技術メモ。
どれも **クライアント側の Molang 一時変数(temp)がエンティティをまたいで残る性質**（Magic Method / temp leak）を使う。

## 1. スキンの受け渡し（Skin Changer 方式）
- 各プレイヤーに番号 `mimic:slot`(1〜100) と世代 `mimic:epoch` を振る（Skin Changer のスクリプト）。
- プレイヤーの render controller の中で自分のスキンを書き出す:
  `temp.mimic_texture_<slot> = Texture.default; temp.mimic_epoch_<slot> = <epoch>;`
- 受け取る側（像など）は、エンティティプロパティ `target`/`target_epoch` が指す番号の temp を読み、
  世代が一致したときだけ採用 → `variable.*` にキャッシュ（以後、本人が見えなくても表示が残る）。
- 世代(epoch)があるので、退出→別人が同じ番号を使っても取り違えない。

## 2. 4D・細腕スキン（ジオメトリの受け渡し）※実験的
- テクスチャと同じ要領で `temp.mimic_geometry_<slot> = Geometry.default;` を書き出す。
- 書き出しは **見えない専用 render controller**（`part_visibility: {"*": false}`）で行う。
  式が環境で動かなくても、プレイヤー本体の描画は壊れない。
- 像の `geometry` 式がそれを読む。取れなければ通常/細腕のジオメトリに戻る。

## 3. SimulatedPlayer マネキン（オフラインでもスキンを出す）
- `@minecraft/server-gametest` の `getPlayerSkin(player)` で PlayerSkinData（`armSize` / `skinColor` / `personaPieces`）を取得し、ワールドの dynamic property に保存。
- 必要になったら `spawnSimulatedPlayer({dimension,x,y,z}, name, GameMode.Creative)` → すぐ `setSkin(data)`（最初から着せる）。
- SimulatedPlayer も「プレイヤー」なので Skin Changer が番号を振り、**自分のスキンを書き出す**。像はその番号を指すだけ。
- 後から `setSkin()` し直せば着せ替え → 像も次のフレームで追従（世代は同じなのでキャッシュも更新される）。
- マネキン本体は隠す: しゃがみ＋手にバリア → RP の条件 `variable.sp_mq` で third_person 描画を止める。
  publish controller だけは動き続けるので、スキンの書き出しは止まらない。
- 制約: `getPlayerSkin` で取れるのはペルソナ(キャラクタークリエイター)の情報。スキンパック/カスタムPNGのスキンは再現できない場合がある。マネキンはプレイヤーリストにも出る。

## 4. geoUI 式 HUD（画面に像を映す）
- バニラの一人称アニメ `animation.player.first_person.base_pose` は `body` ボーンを
  `[query.target_x_rotation, query.target_y_rotation, 0]` で回し、カメラに追従させている。
- そこで **`body` という名前の空ボーンの下に人型（ボーン名は hud1_* などに改名）をぶら下げた別ジオメトリ** を、
  一人称のときだけ描く render controller で出す → 画面に固定される。
- 回転の中心は首(y=24)、カメラは目(1.62ブロック = 27.65単位)なので、子ボーンの position で
  `[0, 3.65·cosθ − 3.65, 3.65·sinθ]` を足してズレを打ち消す（θ = query.target_x_rotation）。
- どのスキンを映すかは、見る人自身の player プロパティ `skin_podium:hud_s1..3 / hud_e1..3` で指定（スクリプトが更新）。
- HUD は改名ボーンのため通常/細腕の形のみ（4D は像の方で対応）。

## パックの並び順
- リソース・ビヘイビアとも **Skin Podium を Skin Changer より上** に。
  （player の定義を上書きしているため。下だと HUD・マネキンの非表示・4D が効かない）
- Beta API の実験的機能が必要（Skin Changer と同じ）。

## コマンド
- `/scriptevent podium:hud` — 画面表示の設定
- `/scriptevent podium:vault` — スキン保管庫
- `/scriptevent podium:set 1 名前` / `podium:clear all` / `podium:ceremony`
