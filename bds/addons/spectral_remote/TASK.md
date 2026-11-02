# Spectral Remote — Spectral Player のリモコンをゲームの中に（GeoUI、フォームなし）

作り方（ページを変えたら作り直す。tests.txt・この TASK.md・パックの UUID は残る）:

```sh
node bds/geoui/html/convert.mjs bds/addons/spectral/tools/connect/remote.html --out bds/addons/spectral_remote --ns sr --name "Spectral Remote" --ore
node lab.mjs go -a spectral_remote
```

- 開く: `/sr:open`（か `/scriptevent sr:open`）。視点でポインタ、W A S D で焦点、ジャンプで押す、スニークで戻る、ホットバーの 1・2 でタブ。
- **いま**: 場所のゲージ・秒（Spectral Player が開いている間 1 秒ごとに `sr:value sec / len / pos`・`sr:show playing / paused` を返す）、
  ⏮ 頭へ・−10 秒・⏯ 一時停止・+10 秒・⏹ 止める・音量（`scriptevent spectral:remote <verb>`）、内蔵の曲（ピアノ・録音そのまま・バンド）。
- **つなぐ**: Spectral Connect（パソコンで `node bds/addons/spectral/tools/connect/server.mjs`、ゲームで `/connect <パソコン>:8790`）へ。
  URL の欄に焦点を当てて `/sr:t "<URL>"`、「曲にして流す」で欄の中身がプレイヤーのタグ（`geoui.mail.sr.<番号>.<k>.<n>.<base64url>`）に
  なり、サーバーが `/tag @s list` で読む。段階（取り込み・曲にする・送る・流している・だめでした）と送った割合はサーバーが返す。
- Spectral Player と一緒にワールドへ入れる（無くても壊れない: ボタンは scriptevent を送るだけ）。

確かめ: 本物の BDS で tests.txt（開く・ボタン・スライダー・数字と札・手紙・長い URL は 200 文字ずつ・閉じる）。
まだ: 本物のアプリでの見た目（app.txt）と、実機のクライアントの /connect。
