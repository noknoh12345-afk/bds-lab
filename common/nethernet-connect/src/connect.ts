import { guardOfClient, withGuard, describeConnectError, type LanGuard, type GuardEvents } from './guard.js';
import { validateOfflineUsername } from './config.js';
import { Phase, PhaseTracker } from './phase.js';
import { bedrockProtocol, bedrockFile } from './bp.js';
import { applyObserver, type Observer } from './observe.js';
import { httpSignaler } from './http-signal.js';
import { AccountStore } from './stores.js';
import type { Config, DiscoveredWorld, Endpoint, TransportKind } from './types.js';

/** bedrock-protocol's version table and its default (useBedrockProtocol's copy) */
const versions = (): { Versions: Record<string, number>; CURRENT_VERSION: string } => bedrockFile('src/options');

export interface ConnectOutcome {
  /** 一度でも Connected（ゲームパケット受信）まで到達したか */
  connected: boolean;
  /** ログイン完了(join)まで到達したか */
  joined: boolean;
  reason: string;
}

export interface ConnectResult {
  /** bedrock-protocol の Client */
  client: any;
  tracker: PhaseTracker;
  /** この接続専用のガード（pin 済み） */
  guard: LanGuard;
  /** 切断されたら解決する */
  done: Promise<ConnectOutcome>;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * 接続に使うゲームバージョンを決める。
 *   1) 設定で固定されていればそれ
 *   2) v7 広告の gameVersion が bedrock-protocol の対応表にあればそれ（"26.51" 表記も "1.26.51" として探す）
 *   3) v7 広告のプロトコル番号に一致するもののうち最新
 *   4) どれも無ければ bedrock-protocol の既定値
 */
export function resolveVersion(
  fixed: string | null,
  protocol: number | undefined,
  gameVersion?: string
): { version: string; note: string } {
  const { Versions, CURRENT_VERSION } = versions();
  if (fixed) {
    if (!(fixed in Versions)) throw new Error(`botBehavior.version "${fixed}" は bedrock-protocol が対応していません`);
    return { version: fixed, note: '設定で固定' };
  }
  if (gameVersion) {
    for (const cand of [gameVersion, `1.${gameVersion}`]) {
      if (cand in Versions && (!protocol || Versions[cand] === protocol)) {
        return { version: cand, note: `広告のゲームバージョン ${gameVersion} から自動判定` };
      }
    }
  }
  if (protocol) {
    const matches = Object.keys(Versions).filter((k) => Versions[k] === protocol).sort(compareVersions);
    if (matches.length === 0) {
      throw new Error(
        `ワールドのプロトコル ${protocol}${gameVersion ? `（${gameVersion}）` : ''} に対応するバージョンがありません。` +
          'npm update bedrock-protocol で更新するか、botBehavior.version を指定してください'
      );
    }
    return { version: matches[matches.length - 1], note: `広告のプロトコル ${protocol} から自動判定` };
  }
  return { version: CURRENT_VERSION, note: '広告にバージョン情報が無いため bedrock-protocol の既定値' };
}

const PHASE_ORDER: Phase[] = [
  Phase.Idle,
  Phase.Signaling,
  Phase.SdpExchange,
  Phase.IceGathering,
  Phase.IceChecking,
  Phase.Dtls,
  Phase.Sctp,
  Phase.Connected,
];

/** who logs in: offline (a name) or a signed-in account (prismarine-auth's cache in profilesFolder) */
interface Auth {
  offline: boolean;
  username: string;
  profilesFolder: string;
  /** the account's name (online) — what the log says */
  account?: string;
}

/** the tracker and the guard events of one NetherNet connection (LAN or HTTP signaling): its phases from the guard's view */
function netherNetWatch(log: (msg: string) => void, extra: GuardEvents = {}): { tracker: PhaseTracker; events: GuardEvents } {
  const tracker = new PhaseTracker();
  tracker.onTransition((ev) =>
    log(`  [phase] #${ev.at} ${ev.from} → ${ev.to}`.padEnd(44) + ` ${ev.note}  (+${ev.elapsedMs}ms)`)
  );
  const afterAnswer = () => PHASE_ORDER.indexOf(tracker.phase) >= PHASE_ORDER.indexOf(Phase.IceGathering);
  const events: GuardEvents = {
    onInfo: (stage, detail) => {
      if (stage === 'signal-out' && (detail.startsWith('CONNECTREQUEST') || detail.startsWith('POST /v1/join'))) tracker.advanceTo(Phase.SdpExchange, detail);
      if (stage === 'signal-in' && detail.startsWith('CONNECTRESPONSE')) tracker.advanceTo(Phase.IceGathering, detail);
      if (stage === 'signal-in' && detail.startsWith('CONNECTERROR')) tracker.advanceTo(Phase.Failed, detail);
      extra.onInfo?.(stage, detail);
    },
    onIceState: (s) => {
      // werift は自分の候補収集が終わった時点でも ice:completed を出すため、
      // 相手の Answer を受け取る(IceGathering)前の ICE 状態は無視する
      if (afterAnswer() && s === 'ice:checking') tracker.advanceTo(Phase.IceChecking, 'LAN内の候補ペアで疎通確認');
      if (afterAnswer() && (s === 'ice:connected' || s === 'ice:completed')) {
        tracker.advanceTo(Phase.Dtls, 'ICE成立 → DTLSハンドシェイク');
      }
      if (s === 'pc:connected') tracker.advanceTo(Phase.Sctp, 'DTLS完了 → SCTPデータチャネル');
      if (s === 'pc:failed' || s === 'ice:failed') tracker.advanceTo(Phase.Failed, `WebRTC ${s}`);
      extra.onIceState?.(s);
    },
    onRoute: (local, remote) => { log(`  [route] 確立経路: ${local} ⇄ ${remote}（LAN内であることを確認済み）`); extra.onRoute?.(local, remote); },
    onHostIdentity: (id) => {
      if (id.present) {
        log(`  [identity] ホスト鍵 sha256=${id.keyDigest ?? '(不明)'} — ${id.verified ? '署名検証OK' : id.reason}`);
      }
      extra.onHostIdentity?.(id);
    },
  };
  return { tracker, events };
}

/** the events every connection has (connected / joined / chat / kick / error / close → done) */
function watchClient(client: any, config: Config, g: LanGuard, tracker: PhaseTracker, log: (msg: string) => void, onClose: () => void = () => {}): Promise<ConnectOutcome> {
  let connected = false;
  let joined = false;
  let lastReason = '';
  client.once('network_settings', () => {
    connected = true;
    tracker.advanceTo(Phase.Connected, 'ゲームパケット(network_settings)受信。接続完了');
  });
  client.on('join', () => {
    joined = true;
    log('[event] ログイン完了（join）');
  });
  client.on('spawn', () => log('[event] スポーンしました'));
  client.on('text', (p: any) => {
    if (config.botBehavior.logChat && p?.message) {
      log(`[chat] ${p.source_name ? `<${p.source_name}> ` : ''}${p.message}`);
    }
  });
  client.on('kick', (p: any) => {
    lastReason = `キック: ${p?.message ?? ''}`;
    log(`[event] キックされました: ${p?.message ?? ''}`);
  });
  client.on('error', (e: Error) => {
    lastReason = e.message;
    log(`[error] ${e.message}`);
    tracker.advanceTo(Phase.Failed, e.message);
  });
  return new Promise<ConnectOutcome>((resolve) => {
    client.once('close', () => {
      onClose();
      if (!connected && g.deniedCount > 0) {
        log(
          `[connect] 接続できませんでした。ガードがLAN外の相手/経路を ${g.deniedCount} 件拒否しています（上の [guard:拒否] を参照）。` +
            'ホストとこのマシンが同じルーター配下・同じサブネットにいるか確認してください。'
        );
      }
      tracker.advanceTo(Phase.Closed, '切断');
      resolve({ connected, joined, reason: lastReason || (connected ? '切断' : '接続できませんでした') });
    });
  });
}

const conLogOf = (log: (msg: string) => void) => (msg: string) => {
  const m = String(msg).match(/connecterror:(\d+)/);
  log(`[bedrock] ${msg}${m ? `（${describeConnectError(m[1])}）` : ''}`);
};

/** the LAN way (UDP 7551 discovery and signaling) to a world the discovery found: connectToWorld's and connectToEndpoint's lan */
function startLanWorld(config: Config, guard: LanGuard, world: DiscoveredWorld, log: (msg: string) => void, auth: Auth, version: string, clientOptions: Record<string, unknown> = {}): ConnectResult {
  const { tracker, events } = netherNetWatch(log);
  // この接続専用の子ガード: 相手IPを固定し、ガードのイベントを状態機械に流す
  const g = guard.fork({ pinAddress: world.address, events });
  log(`[connect] 接続開始: 「${world.levelName}」 host=${world.motd} ${world.address} NetherNetID=${world.networkId}`);
  tracker.advanceTo(Phase.Signaling, `LANディスカバリで ${world.address} の応答を確認済み`);

  const client: any = withGuard(g, () =>
    bedrockProtocol().createClient({
      connectTimeout: 30000,
      ...clientOptions,
      transport: 'nethernet',
      // ディスカバリ要求はブロードキャストではなく、確認済みの相手IPへユニキャスト
      host: world.address,
      nethernet: { networkId: world.networkId, signalling: 'lan', webrtcBackend: 'werift' },
      skipPing: true,
      version,
      offline: auth.offline,
      username: auth.username,
      profilesFolder: auth.profilesFolder,
      conLog: conLogOf(log),
    } as any)
  );

  // bedrock-protocol が内部の NetherNet Client を同期的に作り、この子ガードに結び付いたことを確認する。
  // 結び付いていなければ（ライブラリの内部仕様が変わった等）安全のため中止。
  const bound = guardOfClient(client?.connection?.nethernet);
  if (bound !== g) {
    try {
      client.close();
    } catch {}
    throw new Error(
      '接続ガードを NetherNet クライアントに結び付けられませんでした（bedrock-protocol の内部仕様が変わった可能性）。安全のため接続を中止しました'
    );
  }
  return { client, tracker, guard: g, done: watchClient(client, config, g, tracker, log) };
}

/**
 * ガードを通った LAN ワールドにだけ接続する。
 * すべての接続はこの関数を通すこと（他に createClient を呼ぶ経路を作らない）。
 */
export function connectToWorld(
  config: Config,
  guard: LanGuard,
  world: DiscoveredWorld,
  log: (msg: string) => void = console.log
): ConnectResult {
  // 最終確認: ディスカバリ時の判定を再評価（二重チェック）
  const d = guard.fork({ pinAddress: null }).acceptRemoteAddress(world.address);
  if (!world.decision?.allowed || !d.allowed) {
    throw new Error(`[ポリシー拒否] ${world.decision?.reason || d.reason}`);
  }
  if (config.auth.offline) {
    const bad = validateOfflineUsername(config.auth.username);
    if (bad) throw new Error(bad);
  }
  const { version, note } = resolveVersion(config.botBehavior.version, world.protocol, world.gameVersion);
  log(`[connect] バージョン ${version}（${note}）`);
  return startLanWorld(config, guard, world, log, { offline: config.auth.offline, username: config.auth.username, profilesFolder: config.auth.profilesFolder }, version);
}

// ---------------------------------------------------------------------------------------------------- v3: any endpoint

export interface ConnectEndpointOptions {
  /** 入り方（既定 endpoint.preferred）。endpoint に無い入り方は例外 */
  transport?: TransportKind;
  /**
   * ボットのアカウント名（AccountStore に登録した名前）。省略・null: config.auth.offline ならオフライン（config.auth.username）、
   * そうでなければ config.auth.account、それも null なら登録済みの最初のアカウント
   */
  account?: string | null;
  /** 観戦モード: 世界を変えるパケット（動き・ブロック・アイテム・コマンド…）を送らない。止めた種類は log に "[observe] <名前>" で 1 回ずつ */
  observe?: boolean;
  /** 観戦モードでもチャットの送信は許すか（既定 true）。コマンドは観戦中は送らない */
  allowChat?: boolean;
  log?: (line: string) => void;
  /** bedrock-protocol の createClient に足す設定（skinData・connectTimeout・deviceOS …） */
  clientOptions?: Record<string, unknown>;
}

export interface EndpointConnection extends ConnectResult {
  transport: TransportKind;
  observer: Observer;
}

/** the options a caller may not set through clientOptions (who and where: decided here, behind the guard) */
const FIXED_OPTIONS = ['host', 'port', 'transport', 'nethernet', 'offline', 'username', 'profilesFolder', 'authflow', 'raknetBackend', 'skipPing', 'version', 'followPort'];

/** who joins: opts.account (online), else offline when the config says so, else the configured / first registered account */
function authFor(config: Config, account: string | null | undefined): Auth {
  const online = (name: string): Auth => ({ offline: false, username: name, profilesFolder: config.auth.profilesFolder, account: name });
  if (account) return online(account);
  if (config.auth.offline) {
    const bad = validateOfflineUsername(config.auth.username);
    if (bad) throw new Error(bad);
    return { offline: true, username: config.auth.username, profilesFolder: config.auth.profilesFolder };
  }
  if (config.auth.account) return online(config.auth.account);
  const first = new AccountStore(config.auth.profilesFolder).list()[0];
  if (!first) throw new Error('アカウントがありません（lan account add <名前> でサインインするか、--offline で）');
  return online(first.name);
}

const random64 = (): bigint => BigInt.asUintN(63, BigInt('0x' + [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join(''))) || 1n;

/**
 * discoverEndpoints（か endpointFromWorld）の相手に、選んだ入り方で接続する（すべての接続はここを通す）。
 *   lan    : LAN の発見と合図（connectToWorld と同じ道。ガードの子を相手に pin）
 *   http   : BDS の NetherNet HTTP シグナリング（POST /v1/join/<id> に完全な Offer、Answer の候補もガードを通す）
 *   raknet : RakNet（bedrock-protocol の createClient。相手のアドレスはガードの scope で確かめる）
 * どの入り方でも、決めた相手（endpoint.address）以外とは通信しない。同期的に client を返す（done は切断で解決）。
 */
export function connectToEndpoint(config: Config, guard: LanGuard, endpoint: Endpoint, opts: ConnectEndpointOptions = {}): EndpointConnection {
  const log = opts.log ?? console.log;
  const transport: TransportKind = opts.transport ?? endpoint.preferred;
  if (!['lan', 'http', 'raknet'].includes(transport)) throw new Error(`入り方 ${JSON.stringify(transport)} はありません（lan / http / raknet）`);
  const label = endpoint.kind === 'world' ? endpoint.levelName : endpoint.motd;
  const has = (['lan', 'http', 'raknet'] as const).filter((t) => endpoint[t]);
  if (!endpoint[transport]) throw new Error(`「${label}」には ${transport} の入り方がありません（${has.join(' / ') || 'なし'}）`);
  // 最終確認: 発見の時の判定と、いまのスコープ（二重チェック）
  const d = guard.fork({ pinAddress: null }).acceptRemoteAddress(endpoint.address);
  if (!endpoint.decision?.allowed || !d.allowed) throw new Error(`[ポリシー拒否] ${endpoint.decision?.allowed ? d.reason : endpoint.decision?.reason || d.reason}`);

  const auth = authFor(config, opts.account);
  const { version, note } = resolveVersion(config.botBehavior.version, endpoint.protocol, endpoint.gameVersion);
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(opts.clientOptions ?? {})) if (!FIXED_OPTIONS.includes(k)) extra[k] = v;
  const observer: Observer = { observe: !!opts.observe, allowChat: opts.allowChat !== false, blocked: new Map() };
  log(`[connect] ${transport} で「${label}」${endpoint.address} へ — ${auth.offline ? `オフライン（${auth.username}）` : `アカウント ${auth.account}`}・バージョン ${version}（${note}）${observer.observe ? '・観戦（世界を変えない）' : ''}`);

  let r: ConnectResult;
  if (transport === 'lan') {
    const world = endpoint.lan!.world;
    r = startLanWorld(config, guard, { ...world, decision: endpoint.decision }, log, auth, version, extra);
  } else if (transport === 'raknet') {
    r = startRakNet(config, guard, endpoint, log, auth, version, extra);
  } else {
    r = startHttp(config, guard, endpoint, log, auth, version, extra);
  }
  applyObserver(r.client, observer, log);
  return { ...r, transport, observer };
}

/** RakNet: bedrock-protocol's own client to endpoint.address:raknet.port (an address the scope allows; nothing else is asked) */
function startRakNet(config: Config, guard: LanGuard, endpoint: Endpoint, log: (msg: string) => void, auth: Auth, version: string, extra: Record<string, unknown>): ConnectResult {
  const port = endpoint.raknet!.port;
  const tracker = new PhaseTracker();
  tracker.onTransition((ev) => { if (ev.note !== '(通過)') log(`  [phase] #${ev.at} ${ev.from} → ${ev.to}`.padEnd(44) + ` ${ev.note}  (+${ev.elapsedMs}ms)`); });
  const g = guard.fork({ pinAddress: endpoint.address });
  const d = g.acceptRemoteAddress(endpoint.address);
  if (!d.allowed) throw new Error(`[ポリシー拒否] ${d.reason}`);
  // (the lab's realplayer may have replaced bedrock-protocol's src/rak with the lab's own RakNet client: the backend asked
  //  for here is then not used — either way the client talks to this address and port only)
  const client: any = bedrockProtocol().createClient({
    connectTimeout: 30000,
    ...extra,
    host: endpoint.address,
    port,
    transport: 'raknet',
    raknetBackend: 'jsp-raknet',
    skipPing: true,
    followPort: false,
    version,
    offline: auth.offline,
    username: auth.username,
    profilesFolder: auth.profilesFolder,
    conLog: conLogOf(log),
  } as any);
  log(`  [route] RakNet ${endpoint.address}:${port}（${d.reason}）`);
  return { client, tracker, guard: g, done: watchClient(client, config, g, tracker, log) };
}

/** BDS's NetherNet HTTP signaling: the NetherNet client of bedrock-protocol, its signals by HTTP to endpoint.address:http.port */
function startHttp(config: Config, guard: LanGuard, endpoint: Endpoint, log: (msg: string) => void, auth: Auth, version: string, extra: Record<string, unknown>): ConnectResult {
  const target = { address: endpoint.address, port: endpoint.http!.port };
  const { tracker, events } = netherNetWatch(log);
  // (the HTTP fork: the peer pinned to the signaling server's address, no UDP discovery — guard.ts)
  const g = guard.fork({ pinAddress: target.address, events, httpSignal: target });
  const serverId = (() => { try { const v = endpoint.http?.networkId ?? endpoint.lan?.networkId; return v !== undefined ? BigInt(v) : random64(); } catch { return random64(); } })();
  log(`[connect] 接続開始: 「${endpoint.motd}」 ${target.address}:${target.port}（BDS の HTTP シグナリング）`);
  tracker.advanceTo(Phase.Signaling, `GET /v1/join が ${target.address}:${target.port} で答えた`);
  const client: any = withGuard(g, () =>
    bedrockProtocol().createClient({
      connectTimeout: 30000,
      ...extra,
      transport: 'nethernet',
      host: target.address,
      nethernet: { networkId: serverId, signalling: 'lan', webrtcBackend: 'werift' },
      skipPing: true,
      version,
      offline: auth.offline,
      username: auth.username,
      profilesFolder: auth.profilesFolder,
      conLog: conLogOf(log),
    } as any)
  );
  const nn = client?.connection?.nethernet;
  if (guardOfClient(nn) !== g) {
    try { client.close(); } catch {}
    throw new Error('接続ガードを NetherNet クライアントに結び付けられませんでした（bedrock-protocol の内部仕様が変わった可能性）。安全のため接続を中止しました');
  }
  // (the outside signaling: this connection's own HTTP signaler — the guard allows it for this fork only)
  const sig = httpSignaler(nn, g, target, { name: auth.username, keyPair: () => client.ecdhKeyPair, log });
  (sig.handler as any).__ncHttpSignal = true;
  nn.signalHandler = sig.handler;
  // (offline with skipPing, bedrock-protocol has already asked the NetherNet client to connect inside createClient — before the
  //  signaler was there, so it waits for a LAN discovery answer that never comes: the offer starts now, by HTTP)
  if (nn._pendingConnect && !nn._closed) { nn._pendingConnect = false; nn.startOffer(); }
  return { client, tracker, guard: g, done: watchClient(client, config, g, tracker, log, () => sig.abort()) };
}
