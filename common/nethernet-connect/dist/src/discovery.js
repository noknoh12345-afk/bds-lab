import crypto from 'node:crypto';
import dgram from 'node:dgram';
import http from 'node:http';
import net from 'node:net';
import { discoverLanWorlds } from './discover.js';
import { endpointFromWorld, isThisHost } from './endpoint.js';
import { normalizeAddress } from './lan-scope.js';
const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
const ID_UNCONNECTED_PING = 0x01;
const ID_UNCONNECTED_PONG = 0x1c;
/** a RakNet unconnected ping: id 0x01, the time (8 bytes), the magic (16), the client's GUID (8) */
export function rakPing(time, guid) {
    const b = Buffer.alloc(33);
    b[0] = ID_UNCONNECTED_PING;
    b.writeBigUInt64BE(BigInt.asUintN(64, time), 1);
    MAGIC.copy(b, 9);
    b.writeBigUInt64BE(BigInt.asUintN(64, guid), 25);
    return b;
}
/** a RakNet unconnected pong → its server string's parts (null: not a pong). A pong with no string at all is still a server */
export function parseRakPong(b) {
    if (b.length < 33 || b[0] !== ID_UNCONNECTED_PONG || !b.subarray(17, 33).equals(MAGIC))
        return null;
    const len = b.length >= 35 ? b.readUInt16BE(33) : 0;
    const text = len > 0 && b.length >= 35 + len ? b.subarray(35, 35 + len).toString('utf8') : '';
    const p = text.split(';');
    const int = (s) => { const n = Number(s); return Number.isInteger(n) && n >= 0 ? n : undefined; };
    if (!text || p.length < 6)
        return { motd: '', levelName: '', playerCount: 0, playersMax: 0, bare: true };
    return {
        motd: p[1] ?? '',
        levelName: p[7] ?? '',
        protocol: int(p[2]) || undefined,
        gameVersion: p[3] || undefined,
        playerCount: int(p[4]) ?? 0,
        playersMax: int(p[5]) ?? 0,
        portV4: int(p[10]) || undefined,
        bare: false,
    };
}
/** GET /v1/join's JSON → the parts an endpoint shows (name / level / protocol / version / players / maxPlayers / networkId) */
export function parseHttpInfo(j) {
    const str = (...v) => { for (const x of v)
        if (typeof x === 'string' && x)
            return x; return ''; };
    const num = (...v) => { for (const x of v) {
        const n = Number(x);
        if (Number.isFinite(n) && n >= 0)
            return n;
    } return 0; };
    const proto = num(j?.protocol, j?.protocolVersion);
    const id = j?.networkId ?? j?.network_id ?? j?.netherNetId;
    return {
        motd: str(j?.name, j?.motd, j?.serverName),
        levelName: str(j?.level, j?.levelName, j?.worldName),
        protocol: proto > 0 ? proto : undefined,
        gameVersion: str(j?.version, j?.gameVersion) || undefined,
        playerCount: num(j?.players, j?.playerCount),
        playersMax: num(j?.maxPlayers, j?.playersMax, j?.max_players),
        networkId: id === undefined || id === null || id === '' ? undefined : String(id),
        raw: j,
    };
}
/** "192.168.1.20" / "192.168.1.20:19140" → [address, port?] */
function hostPort(h) {
    const m = /^([\d.]+)(?::(\d+))?$/.exec(h.trim());
    if (!m)
        return [h, undefined];
    return [m[1], m[2] ? Number(m[2]) : undefined];
}
/** the scope + targets for a server (RakNet / HTTP): as evaluateWorld does for a world, by what the server says */
function judgeServer(guard, targets, address, motd, levelName, networkId) {
    const d = guard.acceptRemoteAddress(address);
    if (!d.allowed)
        return d;
    if (targets.networkIds.length && !(networkId && targets.networkIds.includes(networkId))) {
        return { allowed: false, reason: `${networkId ? `NetherNet ID ${networkId}` : 'NetherNet ID の分からないサーバー'} は targets.networkIds にありません` };
    }
    if (targets.levelNames.length && !targets.levelNames.includes(levelName))
        return { allowed: false, reason: `ワールド名「${levelName}」は targets.levelNames にありません` };
    if (targets.hostNames.length && !targets.hostNames.includes(motd))
        return { allowed: false, reason: `ホスト「${motd}」は targets.hostNames にありません` };
    return d;
}
/** a GET with a deadline (never past it), to an address the guard allowed */
function httpGetJson(address, port, path, timeoutMs) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (v) => { if (!done) {
            done = true;
            resolve(v);
        } };
        const req = http.request({ host: address, port, path, method: 'GET', timeout: Math.max(50, timeoutMs), agent: false, headers: { Accept: 'application/json' } }, (res) => {
            const chunks = [];
            let size = 0;
            res.on('data', (c) => { size += c.length; if (size > 256 * 1024) {
                req.destroy();
                finish(null);
            }
            else
                chunks.push(c); });
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                }
                catch { /* not JSON */ }
                finish({ status: res.statusCode ?? 0, json });
            });
            res.on('error', () => finish(null));
        });
        req.on('timeout', () => { req.destroy(); finish(null); });
        req.on('error', () => finish(null));
        req.end();
        setTimeout(() => { req.destroy(); finish(null); }, Math.max(50, timeoutMs)).unref?.();
    });
}
/**
 * 自分のネットワーク（このマシン・同じ LAN・自分の Tailscale の端末）にいるワールドとサーバーを、それぞれの入り方で探す:
 * UDP 7551 の LAN の発見（ワールド・LAN に公開した BDS）、RakNet の unconnected ping（config.discovery.raknetPorts）、
 * BDS の NetherNet HTTP シグナリング（GET /v1/join、config.discovery.httpPorts）。同じ相手の入り方は 1 つの Endpoint に
 * まとめ、どれもガード（guard.scope）を通った相手だけ。判定（decision）は targets・認証方式・なりすましも見る。
 */
export async function discoverEndpoints(guard, config, opts) {
    const timeoutMs = opts.timeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
        throw new Error(`timeoutMs が不正です: ${timeoutMs}`);
    if (opts.host !== undefined && !net.isIPv4(normalizeAddress(opts.host)))
        throw new Error(`問い合わせ先はIPv4アドレスで指定してください: ${opts.host}`);
    const g = guard.fork({ pinAddress: null });
    const scope = g.scope;
    const deadline = Date.now() + timeoutMs;
    const left = () => Math.max(0, deadline - Date.now());
    // ---- where to ask: one host, or this network's (broadcasts for LAN and RakNet; unicast for HTTP)
    const extra = new Map(); // unicast address → its own port (discovery.hosts "ip:port")
    if (opts.host)
        extra.set(normalizeAddress(opts.host), undefined);
    else {
        for (const h of config.discovery.hosts) {
            const [a, p] = hostPort(h);
            extra.set(normalizeAddress(a), p);
        }
        for (const a of scope.tailscale?.allowed.keys() ?? [])
            if (scope.tailscaleName(a) && !extra.has(a))
                extra.set(a, undefined);
    }
    const broadcasts = opts.host ? [] : scope.discoveryDestinations();
    const allowedDest = (a) => {
        const d = scope.checkDiscoveryDestination(a);
        if (!d.allowed)
            g.deny('discovery', `問い合わせ先 ${a} を拒否 — ${d.reason}`);
        return d.allowed;
    };
    // ---- (a) LAN: UDP 7551 (the default destinations once, each unicast host on its own). With HTTP to ask too, the LAN part
    //      ends earlier: what answered there is asked over HTTP in the time left (a BDS visible on the LAN may take HTTP too)
    const httpPorts = config.discovery.httpPorts;
    const lanMs = httpPorts.length ? Math.max(300, Math.floor(timeoutMs * 0.6)) : timeoutMs;
    const lanRuns = [];
    if (!opts.host)
        lanRuns.push(discoverLanWorlds(g, config.targets, { timeoutMs: lanMs, offline: config.auth.offline }));
    for (const a of extra.keys())
        if (allowedDest(a))
            lanRuns.push(discoverLanWorlds(g, config.targets, { host: a, timeoutMs: lanMs, offline: config.auth.offline }).catch(() => []));
    // ---- (b) RakNet: an unconnected ping to each destination × port; a pong only from an address the scope allows
    const found = new Map(); // "address:port"
    const keyOf = (a, p) => `${a}:${p}`;
    const httpAsked = new Set();
    const httpRuns = [];
    const askHttp = (address, port) => {
        const k = keyOf(address, port);
        if (httpAsked.has(k) || left() < 20)
            return;
        httpAsked.add(k);
        // (unicast only, to an address the scope lets this machine talk to: never a broadcast)
        const d = g.acceptRemoteAddress(address);
        if (!d.allowed) {
            g.deny('discovery', `HTTP の問い合わせ先 ${address}:${port} を拒否 — ${d.reason}`);
            return;
        }
        httpRuns.push(httpGetJson(address, port, '/v1/join', left()).then((r) => {
            if (!r || r.status < 200 || r.status > 299 || !r.json || typeof r.json !== 'object')
                return;
            const f = found.get(k) ?? { address, port };
            f.http = parseHttpInfo(r.json);
            found.set(k, f);
        }));
    };
    const rakRuns = [];
    const rakPorts = config.discovery.raknetPorts;
    const rakTargets = [];
    for (const b of broadcasts)
        if (allowedDest(b))
            rakTargets.push([b, rakPorts]);
    for (const [a, p] of extra)
        if (allowedDest(a))
            rakTargets.push([a, p ? [p] : rakPorts]);
    if (rakTargets.length && rakPorts.length + [...extra.values()].filter(Boolean).length > 0) {
        rakRuns.push(new Promise((resolve) => {
            const sock = dgram.createSocket('udp4');
            const guid = BigInt.asUintN(64, BigInt('0x' + crypto.randomBytes(8).toString('hex')));
            let closed = false;
            const close = () => { if (closed)
                return; closed = true; try {
                sock.close();
            }
            catch { /* closed */ } resolve(); };
            sock.on('error', (e) => { g.warn('udp', `RakNet の ping のソケットのエラー: ${e.code ?? ''} ${e.message}`); close(); });
            sock.on('message', (msg, rinfo) => {
                const address = normalizeAddress(rinfo.address);
                const d = g.acceptRemoteAddress(address);
                if (!d.allowed) {
                    g.deny('udp', `${address}:${rinfo.port} からの RakNet の応答を破棄 — ${d.reason}`);
                    return;
                }
                const info = parseRakPong(msg);
                if (!info)
                    return;
                const k = keyOf(address, rinfo.port);
                const f = found.get(k) ?? { address, port: rinfo.port };
                f.rak = info;
                found.set(k, f);
                // (a BDS takes NetherNet's HTTP signaling on its own server port: asked there too — unless HTTP is not asked at all)
                if (httpPorts.length)
                    askHttp(address, info.portV4 ?? rinfo.port);
            });
            sock.bind(0, () => {
                if (closed)
                    return;
                try {
                    sock.setBroadcast(true);
                }
                catch { /* not allowed: unicast still goes */ }
                const send = () => {
                    if (closed)
                        return;
                    const ping = rakPing(BigInt(Date.now()), guid);
                    for (const [a, ports] of rakTargets)
                        for (const p of ports)
                            sock.send(ping, p, a, () => { });
                };
                send();
                // (UDP is lossy: asked again until the time is up)
                const again = setInterval(send, Math.min(1000, Math.max(200, Math.floor(timeoutMs / 3))));
                setTimeout(() => { clearInterval(again); close(); }, timeoutMs);
            });
        }));
    }
    // ---- (c) HTTP: GET /v1/join on each unicast destination × httpPorts (this machine too when the scope allows it)
    const httpHosts = new Map(extra);
    if (!opts.host && scope.check('127.0.0.1').allowed && !httpHosts.has('127.0.0.1'))
        httpHosts.set('127.0.0.1', undefined);
    for (const [a, p] of httpHosts)
        for (const port of p ? [p] : httpPorts)
            askHttp(a, port);
    // ---- wait for all (none passes the deadline); the LAN worlds' addresses asked over HTTP in the time left
    const worldsAll = (await Promise.all(lanRuns)).flat();
    for (const w of worldsAll)
        for (const port of httpPorts)
            askHttp(w.address, port);
    await Promise.all(rakRuns);
    await Promise.all(httpRuns);
    // ---- the LAN worlds (one per NetherNet ID; the same ID from two addresses is a spoof the decision says)
    const worlds = new Map();
    for (const w of worldsAll) {
        const k = w.networkId.toString(), prev = worlds.get(k);
        if (!prev) {
            worlds.set(k, w);
            continue;
        }
        for (const a of w.addresses)
            if (!prev.addresses.some((x) => scope.sameEndpoint(x, a)))
                prev.addresses.push(a);
        if (prev.addresses.length > 1)
            prev.decision = { allowed: false, reason: `同じ NetherNet ID ${k} が複数のアドレス (${prev.addresses.join(', ')}) から応答しました。なりすましの可能性があるため接続しません` };
    }
    const viaOf = (address) => {
        const ts = scope.tailscaleName(address);
        if (ts)
            return { via: 'tailscale', device: ts };
        return { via: isThisHost(address) ? 'this-host' : 'lan' };
    };
    const out = [];
    const merged = new Set(); // world ids taken into a server
    // ---- the servers (RakNet / HTTP), merged with a LAN world at the same address only when they say the same names (or ID)
    const servers = [...found.values()].sort((a, b) => a.address.localeCompare(b.address) || a.port - b.port);
    // (RakNet and HTTP on one address but different ports: one server when HTTP answered on the port RakNet named)
    for (const f of servers) {
        if (!f.rak && !f.http)
            continue;
        const r = f.rak, h = f.http;
        const motd = h?.motd || r?.motd || '', levelName = h?.levelName || r?.levelName || '';
        const world = [...worlds.values()].find((w) => !merged.has(w.networkId.toString()) && scope.sameEndpoint(w.address, f.address)
            && ((h?.networkId !== undefined && h.networkId === w.networkId.toString()) || (!!motd && !!levelName && w.motd === motd && w.levelName === levelName)));
        if (world)
            merged.add(world.networkId.toString());
        const playersMax = h?.playersMax || r?.playersMax || world?.playersMax || 0, playerCount = h?.playerCount ?? r?.playerCount ?? world?.playerCount ?? 0;
        const warnings = [];
        if (r?.bare && !h)
            warnings.push('RakNet の応答にサーバーの情報がありません（BDS 1.26 は NetherNet で入る: HTTP の httpPorts か、LAN に公開した BDS なら LAN の入り方で）');
        if (playersMax > 0 && playerCount >= playersMax)
            warnings.push('満員です（参加できない可能性があります）');
        const decision = world && !world.decision.allowed ? world.decision : judgeServer(g, config.targets, f.address, motd, levelName, h?.networkId ?? world?.networkId.toString());
        const v = viaOf(f.address);
        out.push({
            id: `${f.address}:${f.port}`,
            kind: 'server',
            address: f.address,
            ...v,
            motd: motd || (r?.bare ? '(不明)' : ''),
            levelName,
            playerCount,
            playersMax,
            ...((h?.protocol ?? r?.protocol ?? world?.protocol) !== undefined ? { protocol: h?.protocol ?? r?.protocol ?? world?.protocol } : {}),
            ...((h?.gameVersion ?? r?.gameVersion ?? world?.gameVersion) !== undefined ? { gameVersion: h?.gameVersion ?? r?.gameVersion ?? world?.gameVersion } : {}),
            ...(world ? { lan: { networkId: world.networkId, port: world.port, world } } : {}),
            ...(h ? { http: { port: f.port, ...(h.networkId !== undefined ? { networkId: h.networkId } : {}), info: h.raw } } : {}),
            ...(r ? { raknet: { port: f.port } } : {}),
            preferred: h ? 'http' : r ? 'raknet' : 'lan',
            decision,
            warnings: [...warnings, ...(world?.warnings ?? [])],
        });
    }
    // ---- the LAN worlds no server took
    for (const w of worlds.values()) {
        if (merged.has(w.networkId.toString()))
            continue;
        const e = endpointFromWorld(w);
        const v = viaOf(w.address);
        out.push({ ...e, ...v });
    }
    // (a fixed order: worlds, then servers; by address, then port)
    const portOf = (e) => e.raknet?.port ?? e.http?.port ?? e.lan?.port ?? 0;
    out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'world' ? -1 : 1) || a.address.localeCompare(b.address, 'en', { numeric: true }) || portOf(a) - portOf(b) || a.id.localeCompare(b.id));
    return out;
}
