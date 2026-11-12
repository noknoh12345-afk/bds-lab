# 変更履歴

## 0.3.0

- **グローバルリソースパックを Studio から入れる**: 上部の「リソースパック」に `.mcpack` / `.zip` / `.mcaddon` / フォルダをドロップ
  （Studio のどこでも可）。ブラウザ内で展開して送り、`games/com.mojang/resource_packs` に置いて `global_resource_packs.json` で有効にする。
  `.mcaddon` 内の `.mcpack`、フォルダで包まれた zip、ZIP64、コメントや末尾カンマ入りの manifest、`pack.name` のような言語キーに対応
- **強制**: 強制にしたパックは `packs.json` に覚え、ゲームの起動時（設定を読む前）と、実行中に `global_resource_packs.json` から消えたときに入れ直す。
  `"forcePacks": false` で停止
- 一覧で優先度の上げ下げ・サブパック選択・無効化・削除。入れ直しは同じフォルダを置き換え。元のファイルは最初の 1 回だけ `.scripteval-backup` に保存、
  JSON として読めないファイルには触らない。ビヘイビアーパックは断る
- `client.packs`（`list` `enable` `disable` `force` `move` `subpack` `remove` `state` `dir`）、診断に `packs=強制/有効`
- 設定: `comMojangDir`（`games/com.mojang` の場所、空なら自動検出）、`forcePacks`
- ワールド探索の修正: EnTT レジストリのプール一覧を読むとき、隣に確保された別のレジストリ（UI のプレビュー用プレイヤーなど）まで読んで
  取り違えることがあった。同じコンポーネントが 2 回出てくる候補は採用しない
- JSON 読み取り: UTF-8 BOM、`/* */` コメント、配列の末尾カンマ、`\uXXXX` のサロゲートペアに対応

## 0.2.0

- **Studio**: ブラウザで使うエディタ（`http://127.0.0.1:25600/`）。JS / TS、ゲームの値からの補完、
  選択範囲の実行と行内の結果表示、保存で再実行、コンソール、状態・ウォッチ・AI・診断の各タブ、tick レートの帯。
  メニュー「Open Studio (browser)」・コンソールの「Open Studio」・`client.studio()` で開く
- **MCP**: `/mcp` で Claude Code などから操作（`status` `doctor` `eval` `inspect` `logs` `api_search` とスクリプト管理）。
  長期トークン `mcp.token`、Studio から一時停止・呼び出し履歴の確認
- **モジュール単位の管理**: スクリプトが作ったタイマー・イベント購読・ジョブ・パネル・ウォッチを記録し、停止・再読み込みで解除。
  `client.onDispose()` `client.modules()` `client.stopModule()`。`runScript` も 2 回目は前回を置き換える
- **`client.doctor()`**: 1 行の診断コードと項目ごとのヒント。メニュー「Doctor」
- **セーフモード**: 起動後 1 分以内に終わったら、次回は autorun と tick フックを止めて起動（`client.leaveSafeMode()`）
- **セキュリティ**: REPL は最初に `#AUTH <session.token>` が必須（`replAuth`）。Studio は Host / Origin を検査し、
  WebSocket はトークン必須、CORS ヘッダーは返さない。`tools/scripteval-repl.py` はトークンを自動で読む
- 設定: `studioPort` `studioBind` `mcp` `replAuth` `safeMode`

## 0.1.2

- Mac（Apple Silicon）で tick フックが入らない問題を修正（実行可能メモリを作れない環境では、.so に組み込んだスタブを使う）。
  16 KiB ページでの vtable 書き換えに対応
- REPL: 最初の行が HTTP リクエストの形をした接続を切る（Web ページ経由でコードを送り込まれるのを防ぐ）

## 0.1.1

- macOS: `/proc/self/maps` の代わりに `mach_vm_region` でメモリ領域を列挙（RTTI 索引が作れなかった問題を修正）

## 0.1.0

- 最初のリリース
