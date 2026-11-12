# セキュリティ

## 秘密の扱い
- 鍵は `.env` / `.env.local` にだけ置きます。どちらも git にも `patch` にも入りません。
- `node lab.mjs maint` は、追跡しているファイルに鍵の形（Anthropic・OpenAI・GitHub・Discord などのトークン、秘密鍵）や自分の `.env` の値が混ざっていないかを調べます。

## AI に任せる範囲
- AI の鍵を使うのは、`--ai` や `--via` を付けて明示したときだけです（`i18n --ai`、`maintain`）。鍵が無ければ、その処理は何もせずに理由を言います。
- AI が変えたアドオンは `node lab.mjs undo` で戻せます。自分の BDS への導入は `deploy --undo` で戻せます。

## CI
- GitHub Actions はコミット SHA で固定し、権限は読み取りだけです。秘密は使いません。

## 報告
脆弱性を見つけたら、公開の issue ではなく、リポジトリの「Security」タブの非公開の報告（Private vulnerability reporting）で知らせてください。
