# GeoUI Studio export (as it is)

## Request
GeoUI Studio v10.1（Au12jp/GeouiStudio 7fe110f, 2026-08-01）がひな形「スコア＆ゲージ」から書き出した .mcaddon を、手を加えずに本物の BDS へ載せ、
仕様書に書かれた Studio の生成仕様と不具合を確かめる。tests.txt は「いまそう動く」を記録する（【不具合】の節は直れば期待値を正しい動きへ書き換える）。

(a person's addon, imported from hud.mcaddon: keep its pack names and UUIDs)

## Acceptance (one tests.txt `## ` section each)
- [x] 読み込める（プロパティ15個がすべて既定値で読める）
- [x] 【不具合】player.json が旧版（format 1.19.70）の写しで、満腹度などが現行バニラと違う（現行は [5,20,20]）
- [x] 【不具合】現行バニラの「襲撃の予兆」(gain_raid_omen) のイベントが無い（旧い bad_omen → trigger_raid のまま）
- [x] 【不具合】数値を取るサブコマンドが、数値をそのまま書くと構文エラー（arg が String 型のため。Studio 自身の例文も通らない）
- [x] 引用符で囲めば数値のサブコマンドが通る
- [x] 【不具合】alpha 0 が 100 扱いになる（Number(arg) || 100）
- [x] 【不具合】範囲外の値は何も言わずに捨てられる（setProp が例外を握りつぶす）
- [x] 【不具合】スコア同期で、2^24 を超える値はずれ、2147483584 以上は写らずに古い値のまま
- [x] 【不具合】ワールドに汎用名のスコアボード目的 score と hp を勝手に作る（他のアドオンと名前がぶつかる）
- [x] 【不具合】コマンドで変えた alpha と scale が、入り直すと 100 に戻る（参加時に上書き・scale コマンドは保存しない）
- [x] play で再生中になり、stop で止まる（世代 gen が進む）

## Do not
- change the addon here: it is the evidence. Fix Studio itself, export again, and import the new one
