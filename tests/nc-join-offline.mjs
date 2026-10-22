#!/usr/bin/env node
// nethernet-connect v3 connectToEndpoint: every way in, on this machine, for real (bedrock-protocol servers stand in for the
// game): the LAN way (UDP 7551 discovery + signaling → WebRTC → login), RakNet, and BDS's NetherNet HTTP signaling (a fake
// BDS: GET /v1/join + POST /v1/join/<id> in front of the same NetherNet server — the offer handed to it as a CONNECTREQUEST,
// its answer sent back with an a=identity of its own). Checks:
//   - each way joins (the server sees the login), the [route] line is there, done resolves on close
//   - observe mode: what changes the world (player_auth_input, command_request, inventory_transaction) never reaches the
//     server, each kind said once as "[observe] <name>"; chat goes when allowChat; without observe all of it goes
//   - refused before anything is sent: a way the endpoint does not have, an endpoint whose decision is no, a policy that
//     does not allow the address; an HTTP answer whose only candidates are out of scope (no connection, the guard denied
//     them); a host key that is not trusted
//   - two joins at once (LAN and HTTP) do not share a guard
//   node tests/nc-join-offline.mjs
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { ncBuilt } from './fake/nc.mjs';
import { acquire, UDP_7551 } from './fake/lock.mjs';

let good = 0, bad = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${what}${ok || !detail ? '' : '\n    ' + String(detail).slice(0, 1500)}`); ok ? good++ : bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await sleep(100); } return f(); };
process.on('uncaughtException', (e) => { if (e?.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING') return; throw e; });   // (jsp-raknet after close)

const { nc, req } = await ncBuilt();
const bp = req('bedrock-protocol');
const { CURRENT_VERSION, Versions } = req('bedrock-protocol/src/options');
const NN = createRequire(req.resolve('bedrock-protocol'))('nethernet');   // the very nethernet bedrock-protocol uses
const { attachIdentity } = createRequire(createRequire(req.resolve('bedrock-protocol')).resolve('nethernet'))('./src/identity');

// ---- the servers on this machine
await acquire(UDP_7551);
const seen = [];   // "<name>:<what>"
function serve(opts) {
  const s = bp.createServer({ offline: true, version: CURRENT_VERSION, ...opts });
  s.on('connect', (p) => {
    p.on('error', () => {});
    p.on('join', () => { seen.push(`${p.profile?.name}:join`); p.write('play_status', { status: 'player_spawn' }); });
    p.on('packet', (pk) => {
      const n = pk?.data?.name;
      if (['text', 'player_auth_input', 'command_request', 'inventory_transaction'].includes(n)) seen.push(`${p.profile?.name}:${n}${n === 'text' ? ':' + pk.data.params.message : ''}`);
    });
  });
  return s;
}
const NETWORK_ID = 616161n;
const world = serve({ transport: 'nethernet', host: '0.0.0.0', motd: { motd: 'JoinHost', levelName: 'Join World' }, nethernet: { networkId: NETWORK_ID } });
const RAK = 19700 + Math.floor(Math.random() * 200);
const rak = serve({ transport: 'raknet', raknetBackend: 'jsp-raknet', host: '127.0.0.1', port: RAK, motd: { motd: 'Join RakNet', levelName: 'Rak' } });
await sleep(1500);

// the fake BDS's HTTP signaling, in front of the same NetherNet server (its offers go to the server's own handleOffer)
const hostKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-384' });
const hostX5u = hostKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const hostDigest = crypto.createHash('sha256').update(hostKey.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const hostToken = (() => { const h = b64u(JSON.stringify({ alg: 'ES384', x5u: hostX5u })), p = b64u(JSON.stringify({ cpk: hostX5u, iat: now, exp: now + 3600 })); return `${h}.${p}.${b64u(crypto.sign('sha384', Buffer.from(`${h}.${p}`), { key: hostKey.privateKey, dsaEncoding: 'ieee-p1363' }))}`; })();
let answerMode = 'ok';   // ok | foreign (only out-of-scope candidates) | 37 (the client's identity refused)
const offers = [];
const front = http.createServer((rq, rs) => {
  let body = '';
  rq.on('data', (d) => { body += d; });
  rq.on('end', async () => {
    if (rq.method === 'GET' && rq.url === '/v1/join') { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ name: 'Join BDS', level: 'Join World', protocol: Versions[CURRENT_VERSION], version: CURRENT_VERSION, players: 0, maxPlayers: 10, gameType: 0 })); return; }
    const m = /^\/v1\/join\/(\d+)$/.exec(rq.url ?? '');
    if (rq.method !== 'POST' || !m) { rs.writeHead(404); rs.end(); return; }
    offers.push(body);
    if (answerMode === '37') { rs.writeHead(200); rs.end('37'); return; }
    const server = world.transport.nethernet, cid = BigInt('0x' + crypto.randomBytes(7).toString('hex'));
    let sent = false;
    const respond = async (sig) => {
      if (sent || sig.type !== NN.SignalType.ConnectResponse) return;
      sent = true;
      // (no trickle over HTTP: the answer once the server has every candidate, as BDS does)
      const rtc = server.connections.get(cid)?.rtcConnection;
      for (let k = 0; k < 50 && rtc && rtc.iceGatheringState !== 'complete'; k++) await sleep(100);
      let sdp = rtc?.localDescription?.sdp ?? sig.data;
      if (answerMode === 'foreign') sdp = sdp.split(/\r?\n/).map((l) => (l.startsWith('a=candidate:') ? l.replace(/ (\d+\.\d+\.\d+\.\d+) (\d+) typ host/, ' 203.0.113.9 $2 typ host') : l)).join('\r\n');
      sdp = attachIdentity(sdp, { privateKey: hostKey.privateKey, token: hostToken, domain: 'fake-bds' });
      rs.writeHead(200, { 'Content-Type': 'application/sdp' }); rs.end(sdp);
    };
    try { await server.handleOffer(new NN.SignalStructure(NN.SignalType.ConnectRequest, cid, body, BigInt(m[1])), respond); } catch (e) { if (!sent) { rs.writeHead(500); rs.end(String(e.message)); } }
  });
});
await new Promise((r) => front.listen(0, '127.0.0.1', r));
const HTTP_PORT = front.address().port;

// ---- the client side
const config = (extra = {}) => nc.normalizeConfig({ auth: { offline: true, username: 'Probe' }, lanPolicy: { scope: 'same-host', tailscale: { mode: 'off' } }, requireManualConfirmation: false, ...extra });
const guardOf = (cfg, events = {}) => new nc.LanGuard(new nc.LanScope(cfg.lanPolicy), events, { trustedHostKeys: cfg.targets.trustedHostKeys });
const OK = { allowed: true, reason: 'test' };
const server = (via) => ({ id: `127.0.0.1:${via.port}`, kind: 'server', address: '127.0.0.1', via: 'this-host', motd: 'Join BDS', levelName: 'Join World', playerCount: 0, playersMax: 10, protocol: Versions[CURRENT_VERSION], gameVersion: CURRENT_VERSION, preferred: via.kind, decision: OK, warnings: [], [via.kind]: { port: via.port } });
const joinAs = (cfg, guard, ep, name, opts = {}) => {
  const lines = [];
  const c = { ...cfg, auth: { ...cfg.auth, username: name } };
  const conn = nc.connectToEndpoint(c, guard, ep, { log: (l) => lines.push(String(l)), ...opts });
  return { conn, lines };
};
const cmdParams = (cmd) => ({ command: cmd, origin: { type: 'player', uuid: crypto.randomUUID(), request_id: '', player_entity_id: 0n }, internal: false, version: 'latest' });
const textParams = (msg, name) => ({ needs_translation: false, category: 'authored', type: 'chat', source_name: name, message: msg, xuid: '', platform_chat_id: '', has_filtered_message: false });
const joined = (name) => until(() => seen.includes(`${name}:join`));
// (the route a same-machine connection takes: loopback, or one of this machine's own NICs — werift's host candidates)
const own = ['127\\.\\d+\\.\\d+\\.\\d+', ...nc.listLocalInterfaces().map((i) => i.address.replace(/\./g, '\\.'))].join('|');
const routeHere = new RegExp(`\\[route\\] 確立経路: (${own}):\\d+ ⇄ (${own}):\\d+`);

// ---- the LAN way, observing: the world-changing packets dropped, chat through
{
  const cfg = config(), g = guardOf(cfg);
  const worlds = await nc.discoverLanWorlds(g, cfg.targets, { host: '127.0.0.1', timeoutMs: 1500, offline: true });
  const w = worlds.find((x) => x.networkId === NETWORK_ID);
  check(!!w && w.decision.allowed, 'the NetherNet world found on this machine (UDP 7551)', JSON.stringify(worlds.map((x) => [String(x.networkId), x.levelName, x.decision.reason])));
  const ep = nc.endpointFromWorld(w);
  const { conn, lines } = joinAs(cfg, g, ep, 'L1', { observe: true });
  const ok = await joined('L1');
  await until(() => lines.some((l) => /\[route\]/.test(l)), 5000);
  conn.client.queue('player_auth_input', {});
  conn.client.queue('command_request', {});
  conn.client.write('inventory_transaction', {});
  conn.client.queue('player_auth_input', {});
  conn.client.queue('text', textParams('hello-observe', 'L1'));
  await until(() => seen.includes('L1:text:hello-observe'), 5000);
  const mine = seen.filter((x) => x.startsWith('L1:'));
  check(ok && conn.transport === 'lan' && mine.includes('L1:text:hello-observe') && !mine.some((x) => /player_auth_input|command_request|inventory_transaction/.test(x)),
    'lan + observe: joined, chat reached the world, movement / commands / inventory never did', mine.join(', ') + '\n' + lines.slice(-12).join('\n'));
  const said = (n) => lines.filter((l) => l === `[observe] ${n}`).length;
  check(said('player_auth_input') === 1 && said('command_request') === 1 && said('inventory_transaction') === 1 && conn.observer.blocked.get('player_auth_input') === 2,
    'observe: each dropped kind said once as "[observe] <name>", counted every time', lines.filter((l) => /\[observe\]/.test(l)).join(' | ') + ' ' + JSON.stringify([...conn.observer.blocked]));
  check(lines.some((l) => routeHere.test(l)) && lines.some((l) => /\[phase\].*Connected/.test(l)), 'lan: the established route (this machine) and the phases are in the log', lines.filter((l) => /route|phase/.test(l)).slice(-4).join('\n'));
  // (observe with allowChat off: chat dropped too; commands never)
  conn.observer.allowChat = false;
  conn.client.queue('text', textParams('should-not-arrive', 'L1'));
  await sleep(800);
  check(!seen.includes('L1:text:should-not-arrive') && said('text') === 1, 'observe without chat: the chat is dropped too', seen.filter((x) => x.startsWith('L1:')).join(', '));
  conn.client.close();
  const out = await Promise.race([conn.done, sleep(8000).then(() => null)]);
  check(!!out && out.connected === true, 'lan: done resolves on close ({connected, joined, reason})', JSON.stringify(out));
}

// ---- RakNet, not observing: everything goes
{
  const cfg = config(), g = guardOf(cfg);
  const { conn, lines } = joinAs(cfg, g, server({ kind: 'raknet', port: RAK }), 'R1', { observe: false });
  const ok = await joined('R1');
  conn.client.queue('text', textParams('hi-rak', 'R1'));
  conn.client.queue('command_request', cmdParams('/say hi'));
  await until(() => seen.includes('R1:command_request') && seen.includes('R1:text:hi-rak'), 5000);
  check(ok && conn.transport === 'raknet' && seen.includes('R1:text:hi-rak') && seen.includes('R1:command_request') && conn.observer.blocked.size === 0 && lines.some((l) => /\[route\] RakNet 127\.0\.0\.1:\d+/.test(l)),
    'raknet without observe: joined, chat and a command reach the server, nothing dropped', seen.filter((x) => x.startsWith('R1:')).join(', ') + '\n' + lines.slice(-6).join('\n'));
  conn.client.close();
  await Promise.race([conn.done, sleep(5000)]);
}

// ---- BDS's HTTP signaling, the host key trusted
{
  const cfg = config({ targets: { trustedHostKeys: [hostDigest] } }), g = guardOf(cfg);
  answerMode = 'ok';
  const n0 = offers.length;
  // (UDP 7551: what the NetherNet server hears while the HTTP join runs — the HTTP client asks nobody over UDP)
  const heard = [], nnServer = world.transport.nethernet, origPP = nnServer.processPacket;
  nnServer.processPacket = function (buffer, rinfo) { heard.push(rinfo.port); return origPP.call(this, buffer, rinfo); };
  const { conn, lines } = joinAs(cfg, g, server({ kind: 'http', port: HTTP_PORT }), 'H1', { observe: false });
  const ok = await joined('H1');
  const myPort = (() => { try { return conn.client.connection.nethernet.socket.address().port; } catch { return -1; } })();
  nnServer.processPacket = origPP;
  check(myPort > 0 && !heard.includes(myPort), 'http: no UDP discovery from the HTTP client (its peer is the signaling server\'s address)', `client port ${myPort}, heard from ${[...new Set(heard)].join(', ') || 'nobody'}`);
  const offer = offers[n0] ?? '';
  conn.client.queue('text', textParams('hi-http', 'H1'));
  await until(() => seen.includes('H1:text:hi-http'), 5000);
  check(ok && conn.transport === 'http' && seen.includes('H1:text:hi-http'), 'http: joined through POST /v1/join (the offer to the server, its answer back through the guard), chat reached it', lines.slice(-15).join('\n'));
  check(/^a=identity:/m.test(offer) && /^a=candidate:/m.test(offer) && /^a=fingerprint:/m.test(offer), 'http: the offer is complete (every candidate in it, no trickle) and carries the client\'s own a=identity', offer.split(/\r?\n/).filter((l) => /candidate|identity|fingerprint/.test(l)).map((l) => l.slice(0, 60)).join('\n'));
  check(lines.some((l) => /\[identity\] ホスト鍵 sha256=[0-9a-f]{64} — 署名検証OK/.test(l)) && lines.some((l) => routeHere.test(l)), 'http: the answer\'s host key verified (trustedHostKeys) and the established route is this machine', lines.filter((l) => /identity|route/.test(l)).join('\n'));
  conn.client.close();
  await Promise.race([conn.done, sleep(5000)]);
}

// ---- refused before anything is sent
{
  const cfg = config(), g = guardOf(cfg);
  const t = (f) => { try { f(); return ''; } catch (e) { return e.message; } };
  const noWay = t(() => nc.connectToEndpoint(cfg, g, server({ kind: 'raknet', port: RAK }), { transport: 'http', log: () => {} }));
  const no = t(() => nc.connectToEndpoint(cfg, g, { ...server({ kind: 'raknet', port: RAK }), decision: { allowed: false, reason: 'targets.levelNames にありません' } }, { log: () => {} }));
  const away = t(() => nc.connectToEndpoint(cfg, g, { ...server({ kind: 'raknet', port: RAK }), address: '192.0.2.10' }, { log: () => {} }));
  const badName = t(() => nc.connectToEndpoint({ ...cfg, auth: { ...cfg.auth, username: 'bad name!!' } }, g, server({ kind: 'raknet', port: RAK }), { log: () => {} }));
  check(/http の入り方がありません/.test(noWay) && /\[ポリシー拒否\] targets/.test(no) && /\[ポリシー拒否\].*192\.0\.2\.10/.test(away) && /オフライン用の名前/.test(badName),
    'refused: a way the endpoint lacks, a decision of no, an address the scope does not allow, a bad offline name', [noWay, no, away, badName].join('\n'));
}

// ---- HTTP: an answer whose candidates are all out of scope (removed by the guard: no connection)
{
  const cfg = config(), denied = [], g = guardOf(cfg, { onDeny: (s, d) => denied.push(`${s}: ${d}`) });
  answerMode = 'foreign';
  const { conn } = joinAs(cfg, g, server({ kind: 'http', port: HTTP_PORT }), 'H2', { clientOptions: { connectTimeout: 6000 } });
  const out = await Promise.race([conn.done, sleep(20000).then(() => null)]);
  check(!seen.includes('H2:join') && !!out && out.connected === false && denied.some((d) => /signal-in: 相手SDPの候補を除去: .*203\.0\.113\.9/.test(d)),
    'http: an answer offering only an out-of-scope address — its candidates removed, no connection', JSON.stringify(out) + '\n' + denied.slice(0, 4).join('\n'));
  try { conn.client.close(); } catch { /* closed */ }
}

// ---- HTTP: a host key not trusted / the server refusing the client's identity
{
  const cfg = config({ targets: { trustedHostKeys: ['0'.repeat(64)] } }), denied = [], g = guardOf(cfg, { onDeny: (s, d) => denied.push(`${s}: ${d}`) });
  answerMode = 'ok';
  const { conn } = joinAs(cfg, g, server({ kind: 'http', port: HTTP_PORT }), 'H3', { clientOptions: { connectTimeout: 6000 } });
  const out = await Promise.race([conn.done, sleep(20000).then(() => null)]);
  check(!seen.includes('H3:join') && out?.connected === false && denied.some((d) => /identity: .*trustedHostKeys にありません/.test(d)), 'http: an untrusted host key — refused by the guard', JSON.stringify(out) + '\n' + denied.join('\n'));
  try { conn.client.close(); } catch { /* closed */ }
  const c2 = config(), g2 = guardOf(c2);
  answerMode = '37';
  const r = joinAs(c2, g2, server({ kind: 'http', port: HTTP_PORT }), 'H4', { clientOptions: { connectTimeout: 6000 } });
  const out2 = await Promise.race([r.conn.done, sleep(20000).then(() => null)]);
  check(!seen.includes('H4:join') && out2?.connected === false && r.lines.some((l) => /サーバーが Offer を断りました: 番号 37/.test(l)), 'http: a refusal (200 with "37") said, no connection', JSON.stringify(out2) + '\n' + r.lines.slice(-4).join('\n'));
  try { r.conn.client.close(); } catch { /* closed */ }
  answerMode = 'ok';
}

// ---- two at once (LAN and HTTP): each its own guard, both in
{
  const cfg = config(), g = guardOf(cfg);
  const worlds = await nc.discoverLanWorlds(g, cfg.targets, { host: '127.0.0.1', timeoutMs: 1500, offline: true });
  const w = worlds.find((x) => x.networkId === NETWORK_ID);
  const a = joinAs(cfg, g, nc.endpointFromWorld(w), 'C1');
  const b = joinAs(cfg, g, server({ kind: 'http', port: HTTP_PORT }), 'C2');
  const ok = (await joined('C1')) && (await joined('C2'));
  check(ok && a.conn.guard !== b.conn.guard && a.conn.guard !== g && b.conn.guard.httpSignal?.port === HTTP_PORT && !a.conn.guard.httpSignal, 'two joins at once (LAN and HTTP): both in, each with a guard of its own', [a.lines.slice(-3).join(' | '), b.lines.slice(-3).join(' | ')].join('\n'));
  a.conn.client.close(); b.conn.client.close();
  await Promise.race([Promise.all([a.conn.done, b.conn.done]), sleep(8000)]);
}

world.close(); rak.close(); front.close();
console.log(`${bad ? 'FAIL' : 'PASS'} nc-join-offline ${good}/${good + bad}`);
setTimeout(() => process.exit(bad ? 1 : 0), 500);
