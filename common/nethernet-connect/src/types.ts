// 設定・判定結果の型定義

/**
 * 「同一IP内」の範囲の決め方。
 *  - same-subnet : このマシンのNICと“直結している”サブネット内だけ（ルーターを越えない）。既定。
 *                  自宅ルーター配下＝外から見て同じグローバルIPの内側、に相当。
 *  - same-host   : このマシン自身のアドレス(127.0.0.1 や自分のNICのIP)だけ。
 *                  ワールドを開いているMinecraft/BDSと同じPC上で動かす場合用。
 */
export type LanScopeMode = 'same-subnet' | 'same-host';

export interface LanPolicy {
  scope: LanScopeMode;
  /** v3: 自分の Tailscale の端末も「自分のネットワーク」に入れるか（省略 = off と同じ。normalizeConfig は必ず入れる） */
  tailscale?: TailscalePolicy;
  /** true: 相手/自分とも RFC1918・リンクローカル・ループバックのアドレスでなければ拒否 */
  requirePrivateAddress: boolean;
  /** true: ICEで実際に通信する相手IPを、LANディスカバリに応答したIPと同一に固定する */
  pinToDiscoveryAddress: boolean;
  /** 追加の絞り込み(CIDR)。空なら絞り込みなし。例: ["192.168.1.0/24"] */
  allowedSubnets: string[];
  /** 使うNICを名前で限定(例: ["eth0"])。空なら全NIC(IPv4)。 */
  interfaces: string[];
}

export interface TargetFilter {
  /** 接続してよいワールドの NetherNet ID(10進文字列)。空なら絞り込みなし */
  networkIds: string[];
  /** 接続してよいワールド名(levelName)。空なら絞り込みなし */
  levelNames: string[];
  /** 接続してよいホスト名(motd = ワールドを開いているプレイヤー名/サーバー名)。空なら絞り込みなし */
  hostNames: string[];
  /**
   * 信頼するホスト識別鍵(cpk)の SHA-256(16進64文字)。空なら検査しない。
   * 指定すると、Answer SDP の a=identity が署名検証に通り、かつ鍵がこの一覧にある相手にだけ接続する。
   */
  trustedHostKeys: string[];
}

export interface AuthOptions {
  /** true: オフライン(認証なし)。実際のフレンドワールドは通常オンライン認証が必要 */
  offline: boolean;
  /** オフライン時の表示名 / 認証キャッシュのラベル */
  username: string;
  /** v3: 既定で使うボットのアカウント名（AccountStore に登録した名前）。null なら登録済みの最初のアカウント */
  account: string | null;
  /** 認証トークンのキャッシュ保存先 */
  profilesFolder: string;
}

export interface BotBehavior {
  logChat: boolean;
  /** 固定したいゲームバージョン(例 "1.26.51")。null なら広告から自動 */
  version: string | null;
  /** ディスカバリ待ち時間(ms, 500〜60000) */
  discoveryTimeoutMs: number;
}

export interface Config {
  auth: AuthOptions;
  lanPolicy: LanPolicy & { tailscale: TailscalePolicy };
  /** v3: サーバーの探し方（RakNet・BDS の HTTP シグナリング・直接指定の相手） */
  discovery: DiscoveryOptions;
  targets: TargetFilter;
  /** v3: 接続の振る舞い（観戦モード・チャット） */
  session: SessionOptions;
  /** v3: 元に戻す対象（スナップショット） */
  restore: RestoreOptions;
  /** v3: Web 画面 */
  web: WebOptions;
  requireManualConfirmation: boolean;
  botBehavior: BotBehavior;
  /** 設定の読み込み時に見つかった注意点（未知のキーなど） */
  warnings: string[];
}

export interface Decision {
  allowed: boolean;
  reason: string;
}

/** LANディスカバリで見つかったワールド */
export interface DiscoveredWorld {
  networkId: bigint;
  address: string;
  port: number;
  /** この NetherNet ID で応答してきた全アドレス（なりすまし検出用） */
  addresses: string[];
  motd: string;
  levelName: string;
  playerCount: number;
  playersMax: number;
  protocol?: number;
  gameVersion?: string;
  /** 広告レイアウトのバージョン(4 / 7)。解析できなければ -1 */
  advertisementVersion: number;
  /** v7 広告のみ: オンライン認証/自己署名(オフライン)認証を受け付けるか */
  acceptsOnlineAuth?: boolean;
  acceptsSelfSignedAuth?: boolean;
  /** LANスコープ + targets + 認証方式の判定結果 */
  decision: Decision;
  /** 接続は可能だが注意が要る点（満員・広告を解析できない等） */
  warnings: string[];
}

// ---------------------------------------------------------------- v3: the lab's `lan` (common/lan.mjs) and the web dashboard

/** own = 自分のアカウントの端末だけ / tailnet = 同じ tailnet の端末 / off = 使わない（他の tailnet から共有された端末は常に対象外） */
export type TailscaleMode = 'own' | 'tailnet' | 'off';

export interface TailscalePolicy {
  mode: TailscaleMode;
  /** mode に関係なく許可する端末のホスト名（タグ付きの自宅サーバーなど） */
  devices: string[];
  /** tailscale コマンドの場所（自動で見つからない時だけ） */
  cli: string | null;
}

export interface DiscoveryOptions {
  /** RakNet の unconnected ping を送るポート（既定 [19132]） */
  raknetPorts: number[];
  /** BDS の NetherNet HTTP シグナリング（GET /v1/join）を見るポート（既定 [19132]） */
  httpPorts: number[];
  /** ブロードキャストで見つからない相手を直接（"192.168.1.20" か "192.168.1.20:19140"。自分のネットワーク内だけ） */
  hosts: string[];
}

/** auto = ワールドは観戦・サーバーは通常 / on / off */
export type ObserveMode = 'auto' | 'on' | 'off';

export interface SessionOptions {
  observe: ObserveMode;
  /** 観戦モードでもチャットの送信だけは許すか（コマンドは観戦中は常に送らない） */
  allowChat: boolean;
}

export interface RestoreTarget {
  name: string;
  kind: 'bds' | 'world';
  path: string;
}

export interface RestoreOptions {
  /** スナップショットの置き場所 */
  store: string;
  targets: RestoreTarget[];
}

export interface WebOptions {
  port: number;
  /** lan = 許可した LAN と自分の Tailscale のアドレスで待ち受け / localhost = このマシンからだけ */
  bind: 'lan' | 'localhost';
  /** アクセス用トークン（16 文字以上）。null なら起動のたびに作る */
  token: string | null;
}

/** Tailscale の端末（`tailscale status --json` の Self と Peer） */
export interface TailscaleDevice {
  /** ホスト名（HostName。無ければ DNSName の最初のラベル） */
  name: string;
  /** その端末の Tailscale の IPv4（100.64.0.0/10） */
  addresses: string[];
  /** 自分のアカウントの端末か（UserID が Self と同じ） */
  own: boolean;
  online: boolean;
  tags: string[];
  /** 他の tailnet から共有された端末か（常に対象外） */
  shared: boolean;
  self: boolean;
}

/** loadTailscale の結果。LanScope の 3 つ目の引数 */
export interface TailscaleInfo {
  mode: TailscaleMode;
  self: TailscaleDevice | null;
  devices: TailscaleDevice[];
  /** 自分のネットワークとして許すアドレス → 端末名（mode・devices で決めた分） */
  allowed: Map<string, string>;
}

export type EndpointKind = 'world' | 'server';
/** this-host = このマシン / lan = 同じ LAN / tailscale = 自分の Tailscale の端末 */
export type EndpointVia = 'this-host' | 'lan' | 'tailscale';
/** lan = LAN の発見と合図（ローカルワールドのやり方）/ http = BDS の NetherNet HTTP シグナリング / raknet = RakNet */
export type TransportKind = 'lan' | 'http' | 'raknet';

/** discoverEndpoints が見つけた相手 1 つ（同じ相手に複数の入り方があれば 1 つにまとめる） */
export interface Endpoint {
  /** 安定した id（ワールド = NetherNet ID の 10 進、サーバー = "address:port"） */
  id: string;
  kind: EndpointKind;
  address: string;
  via: EndpointVia;
  /** via = tailscale のときの端末名 */
  device?: string;
  /** ワールド = 開いているプレイヤー名 / サーバー = MOTD */
  motd: string;
  levelName: string;
  playerCount: number;
  playersMax: number;
  protocol?: number;
  gameVersion?: string;
  /** UDP 7551 の LAN の発見で見つかった時（ワールド・LAN に公開した BDS） */
  lan?: { networkId: bigint; port: number; world: DiscoveredWorld };
  /** BDS の NetherNet HTTP シグナリング（GET /v1/join が答えた） */
  http?: { port: number; networkId?: string; info?: unknown };
  /** RakNet の unconnected pong が返った */
  raknet?: { port: number };
  /** 既定の入り方: ワールド = lan、サーバー = http があれば http、無ければ raknet（lan しか無ければ lan） */
  preferred: TransportKind;
  decision: Decision;
  warnings: string[];
}

/** AccountStore に登録したボットのアカウント */
export interface AccountInfo {
  name: string;
  gamertag?: string | null;
  xuid?: string | null;
  addedAt?: number;
}

/** SnapshotStore が取っておいた物 1 つ */
export interface SnapshotMeta {
  id: string;
  kind: 'bds' | 'world';
  /** 取っておいた時の呼び名（--snapshot に渡した名前・restore.targets の name・フォルダ名） */
  label: string;
  /** 元のフォルダ（絶対パス） */
  source: string;
  /** 取っておいたファイル（source からの相対パス、/ 区切り） */
  files: string[];
  takenAt: number;
  bytes: number;
}
