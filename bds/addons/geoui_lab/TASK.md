# GeoUI Lab

## Request
GeoUI（HUD の live_player_renderer で、player に足した板ポリを映す手法）を GeoUI Studio を使わずに一から組み、
仕様書「マイクラ統合版 GeoUI 仕様書（完全版）」の主張を本物の BDS（tests.txt）と本物のアプリ（app.txt）で確かめる。

## What it is
- BP: 現行バニラの player.json（bedrock-samples 1.26.50.4 = BDS 1.26.52 のものと同一）に、client_sync のプロパティをちょうど32個（上限）足しただけ。
  `/glab:bar <0-100>`・`/glab:size <10-1000>`・`/glab:show <bool>`・`/glab:get`、スコアボード `glab_bar` を2tickごとにプロパティへ写す。
- RP: 現行バニラの player.entity.json に、板とバーのジオメトリ（geometry.glab_hud）・レンダーコントローラー・アニメーションを足す。
  表示条件 `query.is_in_ui && !variable.is_paperdoll && variable.glab_on`。プロパティはペーパードール以外でだけ読み、変数に写す。
  HUD は hud_screen.json の root_panel に insert_front で live_player_renderer を足す（hud_content は上書きしない）。

## Acceptance (one tests.txt `## ` section each)
- [x] player にプロパティを32個まで宣言でき、すべて既定値で読める
- [x] setProperty の値は同じ tick の getProperty には出ず、次の tick から読める
- [x] int の範囲外は丸めずに例外（ArgumentOutOfBoundsError）
- [x] int に小数を渡すと 0 の方へ切り捨て
- [x] int はサーバーでも float32 で持たれ、2^24 を超えると値がずれる
- [x] 範囲 ±(2^31-1) の int に入れられるのは 2147483583 まで（2^31 に丸まると例外）
- [x] float も float32（0.1234 は 0.1234000027… になる）、範囲外は例外
- [x] enum に無い値は例外
- [x] プロパティはプレイヤーごと（A を変えても B は既定値のまま）
- [x] コマンドで書いた値を1tick後に読める（権限 Any のコマンド）
- [x] スコアボードの値が2tick以内にプロパティへ写る（0〜100 に収める）
- [x] 死んでリスポーンしても値は残る
- [x] 抜けて入り直しても値は残る
- [x] スクリプトの再読込（/reload）でも値は残る
- [x] サーバーを再起動しても値は残る
- [x] player.json は現行バニラ（1.26.30）をそのまま元にしているので、満腹度と襲撃の予兆がバニラのまま

## Not proven here (needs the real app: app.txt)
- HUD に板が描かれる・値が描画に届く・インベントリへの映り込み・ポーズ画面でのエラーの有無・透明化・視点・画面比

## Do not
- loosen tests.txt to make it pass
