# nethernet-connect v3

**自分のネットワーク**（このマシン・同じ LAN・自分の Tailscale の端末）にいる Minecraft 統合版のワールドとサーバーにだけ、それぞれの
入り方で入るボットです（Node.js 22+ / TypeScript）。bds-lab では `common/nethernet-connect/`（`dist/` を入れて持ち、`common/lan.mjs` が
使う）に置き、`node lab.mjs lan …` と `LAB_TRANSPORT=lan` から動きます。

NetherNet（UDP 7551 の発見 → 合図 → SDP/ICE → DTLS → SCTP）と RakNet は `bedrock-protocol` 3.60 の実装をそのまま使い、
そこに **「自分のネットワークの外とは、どの段階でも一切通信しない」ガード** を被せています（v2 から）。

## v3 で加えたこと

| | 内容 |
|---|---|
| 探す（`discoverEndpoints`） | UDP 7551 の LAN の発見（ワールド・LAN に公開した BDS）、RakNet の unconnected ping（`discovery.raknetPorts`）、BDS の NetherNet HTTP シグナリング（`GET /v1/join`、`discovery.httpPorts`）を並行に。同じアドレスでも名前（motd・levelName か NetherNet ID）が合う時だけ 1 つにまとめ、入り方ごとに持つ（`lan` / `http` / `raknet`、既定の `preferred`）。直接の宛先は `discovery.hosts`（`ip` か `ip:port`、自分のネットワークの中だけ） |
| 入る（`connectToEndpoint`） | 選んだ入り方で: **lan**（v2 の `connectToWorld` と同じ道）、**http**（BDS の HTTP シグナリング: ICE を集め終えた完全な Offer を `POST /v1/join/<こちらの ID>`、自分の `a=identity` つき。Answer は LAN の時と同じガードの検査を通す）、**raknet**（相手のアドレスはガードで確かめる）。アカウント（登録した名前）か、オフラインの名前で |
| 観戦モード（`observe`） | 世界を変えるパケットを送らない。通すのは決まった一覧（ログイン・合図・パック・チャンクの求め・時刻合わせなど）だけで、ほかは送る前に落とし、種類ごとに `[observe] <名前>` を 1 回だけ log に。チャットは `allowChat` の時だけ、コマンドは観戦中は決して送らない。既定（`session.observe = auto`）はワールドなら観戦・サーバーなら通常 |
| Tailscale（`loadTailscale`） | `tailscale status --json` の自分の端末を「自分のネットワーク」に（`lanPolicy.tailscale.mode`: own = 自分のアカウントの端末 / tailnet = 同じ tailnet / off、`devices` の名前は mode によらず。他の tailnet から共有された端末は常に対象外）。`LanScope` の 3 つ目の引数。その端末とつなぐ時の自分の候補は、このマシンの Tailscale のアドレスだけ |
| アカウント（`AccountStore`） | device code のサインイン（bedrock-protocol と同じ prismarine-auth・Switch のタイトル）、キャッシュは prismarine-auth の名前のまま（`<sha1(名前) の先頭 6 桁>_live-cache.json` ほか）、一覧は `accounts.json` |
| 元に戻す（`SnapshotStore`・`findWorldFolders`） | このマシンの BDS・ワールドのフォルダを取っておき、戻す（戻す前の状態も取っておく。増えたファイルは消える。動いている BDS は止めてから）。ワールドは名前（`levelname.txt`）で Windows（Store・GDK の各ユーザー）・mcpelauncher の場所から探す |
| Web の画面（`startWeb`） | `web/index.html` と API（`/api/state`・SSE の `/api/events`・`/api/discover`・`/api/join`・`/api/sessions/*`・`/api/snapshots`・`/api/accounts`）。トークン（`X-NC-Token`、SSE は `?t=`）が合わなければ 401、自分のネットワークの外からは 403。`web.bind = lan` なら許可した LAN と自分の Tailscale のアドレスで、`localhost` ならこのマシンだけで待ち受ける |

## ガードが増えた所

| 段階 | やること |
|---|---|
| 外からの合図 | v2 と同じく拒否。**ただし** その接続の自分の HTTP シグナラーだけは許す（ガードの子に `httpSignal`: 相手はそのアドレスに固定、UDP の発見は送らない、ICE の候補と確立した経路は今までどおり確かめる） |
| HTTP の宛先 | 発見の `GET /v1/join` はユニキャストだけ（ブロードキャストには送らない）、ガードが許すアドレスだけ。接続の `POST` は決めた相手だけ |
| RakNet の ping | 送る前に宛先をガードで確かめ、答えはガードが許す送り主からだけ受ける |
| Tailscale | 許した端末のアドレスだけ（`scope = same-subnet` の時だけ。`same-host` はこのマシン自身だけのまま） |
| 観戦 | 送る道（`write`・`queue`・組み立て済みの `sendBuffer`）をすべて包む |

## bds-lab から使う

```bash
node lab.mjs lan list [--host <ip>] [--timeout <ms>]            # 見つけた相手と入り方（* が既定）、許可か拒否と理由
node lab.mjs lan run <tests.txt> [--world <名前>|--id <id>] [--account <名前>|--offline --name <n>] [--observe|--no-observe] [--snapshot <ワールド|BDS>]
node lab.mjs lan account list | add <名前> | import <名前> | remove <名前>
node lab.mjs lan snapshot <ワールドのフォルダ|名前|BDS のフォルダ> | snapshots | restore <id> [--force]
node lab.mjs lan web [--port <n>]
LAB_TRANSPORT=lan node lab.mjs test -a <アドオン>              # ラボの BDS を NetherNet・LAN に公開し、ボットは LAN のやり方で入る
```

設定は `lan.json`（`config.example.json` の形）。ラボが置く所: bedrock-protocol は `$LAB_CACHE/nc/deps-<入れる物の hash>`、サインインは
`$LAB_CACHE/nc/auth`、スナップショットは `$LAB_CACHE/nc/snapshots`。bedrock-protocol もコンパイラ（`build.mjs`）も `install.mjs` が
入れる: 同時に動くいくつものプロセス（ラボ・並べて動く試験・別の作業ツリー）で 1 回だけ、鍵（`<フォルダ>.lock`）をかけて入れ、npm が
最後まで終わった物（`.installed`）だけを使う。途中の物を読むことも、2 つの npm が同じフォルダに書くこともない。

## 確かめたこと

- **試験（Node の標準だけ、このマシンの上で本物の通信）**: `tests/nc-offline.mjs`（パッケージ自身の unit 33 件・e2e A〜G、`dist/` が今の
  `src/` と同じか）、`tests/nc-install-offline.mjs`（`install.mjs`: 6 つのプロセスが同時に入れても npm は 1 回・途中で殺された物・
  鍵の引き継ぎ・片付け）、`tests/nc-web-offline.mjs`（Web の画面を本物のブラウザで: playwright-core。ブラウザが起動できなければ理由を言って飛ばす）、`tests/nc-join-offline.mjs`（3 つの入り方で本当にログインまで・観戦で落ちる物と通る物・断る場合・偽の BDS の HTTP
  シグナリング・2 つ同時）、`tests/nc-find-offline.mjs`（発見とまとめ方・Tailscale・アカウント・スナップショット・Web の API）、
  `tests/lan-offline.mjs`（ラボの `lan list` / `lan run` / `LAB_TRANSPORT=lan` / snapshot / account import）。
- **本物の BDS 1.26.52**（2026-10-23、このマシンの上で）: `transport=nethernet`・`enable-lan-visibility=true` の BDS は server-port で
  **HTTP シグナリングも出していた**（`GET /v1/join` → `{"name":"Dedicated Server","protocol":2193,"version":"1.26.52","level":"lab",…}`。
  NetherNet ID は無い）。`discoverEndpoints` は LAN と HTTP を 1 つにまとめ（`via lan/http*`）、**http でも lan でも入れた**
  （BDS のホスト鍵の署名検証 OK・経路はこのマシン）。`LAB_TRANSPORT=lan` で GeoUI の 1000 個の譜面のパック（3 MB）のワールドにも入り、
  その tests.txt が 8/8。
- 要実測: 別の PC で開いた本物のワールド、本物の Tailscale、Microsoft のサインイン（試験は偽の Authflow）、BDS の `online-mode=true` での
  HTTP の入り方（オフラインの自己署名の `a=identity` は通った）。

## ファイル

| ファイル | 役割 |
|---|---|
| `src/lan-scope.ts` | 自分のネットワークの判定の中核（直結サブネット・プライベート・自分自身・ブロードキャスト・Tailscale の端末） |
| `src/guard.ts` | `nethernet.Client` のパッチ（接続ごとのガード・UDP/合図/SDP/ICE/経路の全段、HTTP の合図だけの許し、Tailscale の候補） |
| `src/discovery.ts` | `discoverEndpoints`（LAN・RakNet・HTTP を並行に、まとめ方、判定） |
| `src/discover.ts` | LAN の発見（UDP 7551）・広告の解析・なりすまし・targets（v2） |
| `src/connect.ts` | `connectToEndpoint`（lan・http・raknet・アカウント・観戦）と `connectToWorld`（v2） |
| `src/http-signal.ts` | BDS の NetherNet HTTP シグナリング（`GET`・`POST /v1/join`、自分の `a=identity`） |
| `src/observe.ts` | 観戦モード（通す一覧、送る道を包む） |
| `src/tailscale.ts` | `loadTailscale` |
| `src/stores.ts` / `src/worlds.ts` | `AccountStore`・`SnapshotStore` / ワールドの場所 |
| `src/web.ts` / `web/` | Web の画面のサーバーと画面 |
| `src/endpoint.ts` | LAN のワールド → Endpoint |
| `src/host-identity.ts` / `src/sdp-filter.ts` / `src/phase.ts` | `a=identity` の検証 / SDP の候補の除去 / 接続のフェーズ |
| `src/config.ts` / `src/types.ts` | 設定の厳格な読み込みと型 |
| `src/cli.ts` / `src/bp.ts` / `src/index.ts` | v2 の CLI / 使う bedrock-protocol（呼ぶ側が渡す）/ 入口 |
| `build.mjs` | 決まった TypeScript で `dist/` を作る（`--check` は同じか、`--out` は別の場所へ） |
| `install.mjs` | npm の物を共有のキャッシュに 1 回だけ入れる（鍵・終わった印・入れる物ごとのフォルダ・使われない物の片付け） |

## 制限

- IPv4 のみ（IPv6・ホスト名・mDNS の候補は拒否）。WebRTC は werift 固定
- このパッケージを読み込んだプロセスでは、通さない NetherNet の接続はすべて遮断（RakNet は影響なし）
- RakNet の ping に BDS 1.26 はサーバーの情報を返さない（名前は「(不明)」。NetherNet の BDS なら HTTP か LAN で）
- Xbox / Realms のサービス経由の合図は使わない（自分のネットワークの外になりうる）

v2 までの説明（脅威モデル・ホスト鍵の固定・参考資料）は v2 と同じです: ボット専用のアカウントを使う、知らないワールドに繋がない、
同じ LAN は信頼境界（LAN の発見の鍵は公開値）、`targets.trustedHostKeys` で相手を鍵で固定できる。
