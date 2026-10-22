import net from 'node:net';
import { netherNet, withGuard, type LanGuard } from './guard.js';
import { normalizeAddress } from './lan-scope.js';
import { bedrockFile } from './bp.js';
import type { Decision, DiscoveredWorld, TargetFilter } from './types.js';

const advertisement = (): any => bedrockFile('src/nethernet/advertisement').NethernetServerAdvertisement;

export interface DiscoverOptions {
  /** 問い合わせ先。省略時は LanScope.discoveryDestinations()（リミテッド＋各NICの有向ブロードキャスト） */
  host?: string;
  timeoutMs: number;
  /** 接続時にオフライン認証を使うか（v7 広告の認証フラグとの突き合わせ用） */
  offline?: boolean;
}

/**
 * LANディスカバリ(UDP 7551)で、フレンドワールド(「LANプレイヤーに表示」ON)や BDS を列挙する。
 * パケットはガード越しにしか受け取らないので、LAN外の応答はここに届かない。
 */
export async function discoverLanWorlds(
  guard: LanGuard,
  targets: TargetFilter,
  opts: DiscoverOptions
): Promise<DiscoveredWorld[]> {
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 0) throw new Error(`timeoutMs が不正です: ${opts.timeoutMs}`);
  if (opts.host !== undefined && !net.isIPv4(normalizeAddress(opts.host))) {
    throw new Error(`問い合わせ先はIPv4アドレスで指定してください: ${opts.host}`);
  }
  // ディスカバリ専用の子ガード（接続用の pin を持ち込まない）
  const g = guard.fork({ pinAddress: null });
  const dests = opts.host ? [normalizeAddress(opts.host)] : g.scope.discoveryDestinations();
  if (dests.length === 0) {
    g.deny('discovery', '問い合わせ先がありません（許可されたLAN用NICが見つかりません）');
    return [];
  }

  const found = new Map<string, DiscoveredWorld>();
  const clients: any[] = [];
  for (const dest of dests) {
    const client = withGuard(g, () => new (netherNet().Client)(0n, dest, { webrtcBackend: 'werift' }));
    clients.push(client);
    client.on('pong', (params: any) => {
      let networkId: bigint;
      try {
        networkId = BigInt(params.sender_id);
      } catch {
        return;
      }
      const rinfo = client.addresses.get(networkId);
      if (!rinfo) return;
      const key = networkId.toString();
      const prev = found.get(key);
      if (prev) {
        // 同じ ID の2回目以降: 応答元アドレスだけ記録（なりすまし検出用）
        if (!prev.addresses.some((a) => g.scope.sameEndpoint(a, rinfo.address))) prev.addresses.push(rinfo.address);
        return;
      }
      found.set(key, parseWorld(networkId, rinfo, params.data));
    });
  }

  await new Promise((r) => setTimeout(r, opts.timeoutMs));
  for (const c of clients) c.close('discovery finished');

  const worlds = [...found.values()];
  for (const w of worlds) w.decision = evaluateWorld(g, targets, w, { offline: opts.offline });
  return worlds;
}

function parseWorld(networkId: bigint, rinfo: { address: string; port: number }, hex: unknown): DiscoveredWorld {
  const warnings: string[] = [];
  let ad: any = {};
  let adVersion = -1;
  try {
    ad = advertisement().fromBuffer(Buffer.from(String(hex), 'hex'));
    adVersion = Number(ad.version);
  } catch (e) {
    ad = {};
    warnings.push(`広告を解析できません（${(e as Error).message}）。ゲームバージョンは推定になります`);
  }
  const isV7 = adVersion === 7;
  if (adVersion === 4) warnings.push('v4 広告のためゲームバージョンを判別できません（ずれる場合は botBehavior.version を指定）');
  const world: DiscoveredWorld = {
    networkId,
    address: normalizeAddress(rinfo.address),
    port: rinfo.port,
    addresses: [normalizeAddress(rinfo.address)],
    motd: adVersion >= 0 ? String(ad.motd ?? '') : '(不明)',
    levelName: adVersion >= 0 ? String(ad.levelName ?? '') : '(不明)',
    playerCount: Number(ad.playerCount ?? 0) || 0,
    playersMax: Number(ad.playersMax ?? 0) || 0,
    protocol: isV7 ? positive(ad.protocol) : undefined,
    gameVersion: isV7 && typeof ad.gameVersion === 'string' ? ad.gameVersion : undefined,
    advertisementVersion: adVersion,
    acceptsOnlineAuth: isV7 ? Boolean(ad.acceptsOnlineAuth) : undefined,
    acceptsSelfSignedAuth: isV7 ? Boolean(ad.acceptsSelfSignedAuth) : undefined,
    decision: { allowed: false, reason: '' },
    warnings,
  };
  if (world.playersMax > 0 && world.playerCount >= world.playersMax) warnings.push('満員です（参加できない可能性があります）');
  return world;
}

/** LANスコープ ＋ なりすまし検出 ＋ targets ＋ 認証方式 の判定 */
export function evaluateWorld(
  guard: LanGuard,
  targets: TargetFilter,
  w: DiscoveredWorld,
  opts: { offline?: boolean } = {}
): Decision {
  for (const a of w.addresses ?? [w.address]) {
    const d = guard.acceptRemoteAddress(a);
    if (!d.allowed) return d;
  }
  if ((w.addresses ?? []).length > 1) {
    return {
      allowed: false,
      reason: `同じ NetherNet ID ${w.networkId} が複数のアドレス (${w.addresses.join(', ')}) から応答しました。なりすましの可能性があるため接続しません（ホストPCが複数のNICで同じLANに繋がっているだけなら、--host で正しい方のIPを指定してください）`,
    };
  }
  if (targets.networkIds.length && !targets.networkIds.includes(w.networkId.toString())) {
    return { allowed: false, reason: `NetherNet ID ${w.networkId} は targets.networkIds にありません` };
  }
  if (targets.levelNames.length && !targets.levelNames.includes(w.levelName)) {
    return { allowed: false, reason: `ワールド名「${w.levelName}」は targets.levelNames にありません` };
  }
  if (targets.hostNames.length && !targets.hostNames.includes(w.motd)) {
    return { allowed: false, reason: `ホスト「${w.motd}」は targets.hostNames にありません` };
  }
  if (opts.offline === true && w.acceptsSelfSignedAuth === false) {
    return { allowed: false, reason: 'このワールドはオフライン(自己署名)ログインを受け付けません（広告の acceptsSelfSignedAuth=false）' };
  }
  if (opts.offline === false && w.acceptsOnlineAuth === false) {
    return { allowed: false, reason: 'このワールドはオンライン認証ログインを受け付けません（広告の acceptsOnlineAuth=false）' };
  }
  return guard.acceptRemoteAddress(w.address);
}

function positive(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
