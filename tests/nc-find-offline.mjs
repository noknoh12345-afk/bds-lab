#!/usr/bin/env node
// nethernet-connect v3: finding what is on this network, and what the bot keeps — discoverEndpoints (the LAN way on UDP 7551,
// a RakNet ping, BDS's GET /v1/join; merged only when the names say it is the same), loadTailscale (a status of the user's own
// devices: own / tailnet / named / shared), AccountStore (prismarine-auth's cache names, a fake sign-in), SnapshotStore (take,
// change, restore: what was added goes, a backup first), findWorldFolders / worldRoots, and startWeb (the dashboard's API: its
// token, the state, discover, join → session events over SSE, chat in and out of observe mode, leave, snapshots, accounts).
// Everything on 127.0.0.1; a fake RakNet server and a fake BDS HTTP server beside a real bedrock-protocol NetherNet world.
//   node tests/nc-find-offline.mjs
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ncBuilt } from './fake/nc.mjs';
import { acquire, UDP_7551 } from './fake/lock.mjs';

let good = 0, bad = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${what}${ok || !detail ? '' : '\n    ' + String(detail).slice(0, 1500)}`); ok ? good++ : bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-find-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* gone */ } });

const { nc, req, root } = await ncBuilt();
const bp = req('bedrock-protocol');
const { CURRENT_VERSION, Versions } = req('bedrock-protocol/src/options');
const PROTO = Versions[CURRENT_VERSION];

// ---------------------------------------------------------------- discovery
await acquire(UDP_7551);
const world = bp.createServer({ transport: 'nethernet', host: '0.0.0.0', offline: true, version: CURRENT_VERSION, motd: { motd: 'FindHost', levelName: 'Find World' }, nethernet: { networkId: 717171n } });
// a fake RakNet server: answers an unconnected ping with a pong and its server string
const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
const rakPings = [];
const rak = dgram.createSocket('udp4');
const pong = (motd, level, port) => { const s = Buffer.from(`MCPE;${motd};${PROTO};${CURRENT_VERSION};2;20;123456789;${level};Survival;1;${port};${port};`); const b = Buffer.alloc(35 + s.length); b[0] = 0x1c; b.writeBigUInt64BE(1n, 1); b.writeBigUInt64BE(42n, 9); MAGIC.copy(b, 17); b.writeUInt16BE(s.length, 33); s.copy(b, 35); return b; };
await new Promise((r) => rak.bind(0, '127.0.0.1', r));
const RAK = rak.address().port;
rak.on('message', (m, ri) => { if (m[0] === 0x01 && m.subarray(9, 25).equals(MAGIC)) { rakPings.push(ri.port); rak.send(pong('Find RakNet', 'Rak World', RAK), ri.port, ri.address); } });
// a fake BDS HTTP signaling (only GET /v1/join is asked here): the same names as the NetherNet world → merged with it
const httpAsks = [];
const front = http.createServer((rq, rs) => { httpAsks.push(rq.url); if (rq.method === 'GET' && rq.url === '/v1/join') { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ name: 'FindHost', level: 'Find World', protocol: PROTO, version: CURRENT_VERSION, players: 1, maxPlayers: 10, gameType: 0, networkId: '717171' })); } else { rs.writeHead(404); rs.end(); } });
await new Promise((r) => front.listen(0, '127.0.0.1', r));
const HTTP = front.address().port;
await sleep(1200);

const cfg = (extra = {}) => nc.normalizeConfig({ auth: { offline: true, username: 'Finder' }, lanPolicy: { scope: 'same-host', tailscale: { mode: 'off' } }, requireManualConfirmation: false, botBehavior: { discoveryTimeoutMs: 2500 }, ...extra });
const guardOf = (c, events = {}) => new nc.LanGuard(new nc.LanScope(c.lanPolicy), events, { trustedHostKeys: c.targets.trustedHostKeys });
{
  // (1) RakNet and LAN only: the world and the RakNet server stay two (their names differ), each its own way in
  const c = cfg({ discovery: { raknetPorts: [RAK], httpPorts: [] } });
  const t0 = Date.now();
  const all = await nc.discoverEndpoints(guardOf(c), c, { timeoutMs: 2500 });
  const ms = Date.now() - t0;
  const w = all.find((e) => e.kind === 'world'), s = all.find((e) => e.kind === 'server');
  check(all.length === 2 && w && s && w.id === '717171' && w.preferred === 'lan' && w.lan && !w.raknet && w.via === 'this-host' && w.levelName === 'Find World'
    && s.id === `127.0.0.1:${RAK}` && s.preferred === 'raknet' && s.raknet?.port === RAK && !s.lan && s.motd === 'Find RakNet' && s.levelName === 'Rak World' && s.playerCount === 2 && s.playersMax === 20 && s.protocol === PROTO && s.gameVersion === CURRENT_VERSION
    && w.decision.allowed && s.decision.allowed && all[0] === w,
  'discoverEndpoints: the NetherNet world (lan) and the RakNet server (raknet) — two, each with its own way in, the world first', JSON.stringify(all, (k, v) => (typeof v === 'bigint' ? String(v) : k === 'world' ? undefined : v), 1).slice(0, 1400));
  check(ms >= 2400 && ms < 4500 && rakPings.length >= 1, `discoverEndpoints: within its time (${ms} ms for 2500), the ping asked again while waiting (${rakPings.length})`);
}
{
  // (2) HTTP too: GET /v1/join on this machine answers with the world's own names and ID → one server endpoint, preferred http
  const c = cfg({ discovery: { raknetPorts: [], httpPorts: [HTTP] } });
  httpAsks.length = 0;
  const all = await nc.discoverEndpoints(guardOf(c), c, { timeoutMs: 2500 });
  const s = all.find((e) => e.kind === 'server');
  check(all.length === 1 && s && s.id === `127.0.0.1:${HTTP}` && s.preferred === 'http' && s.http?.port === HTTP && s.http?.networkId === '717171' && s.lan?.networkId === 717171n && s.motd === 'FindHost' && s.levelName === 'Find World' && s.playerCount === 1 && httpAsks.includes('/v1/join'),
    'discoverEndpoints: BDS\'s HTTP signaling found, merged with the LAN world of the same names and ID (lan + http, preferred http)', JSON.stringify(all.map((e) => ({ id: e.id, kind: e.kind, preferred: e.preferred, lan: !!e.lan, http: e.http, motd: e.motd })), null, 1));
}
{
  // (3) the targets narrow it; an address out of scope is never asked (same-host: 192.0.2.1 from discovery.hosts)
  const denied = [];
  const c = cfg({ discovery: { raknetPorts: [RAK], httpPorts: [HTTP], hosts: ['192.0.2.1'] }, targets: { levelNames: ['Rak World'] } });
  const n0 = rakPings.length;
  const all = await nc.discoverEndpoints(guardOf(c, { onDeny: (st, d) => denied.push(`${st}: ${d}`) }), c, { timeoutMs: 1500 });
  const s = all.find((e) => e.kind === 'server' && e.raknet), w = all.find((e) => e.levelName === 'Find World');
  check(s?.decision.allowed === true && w && w.decision.allowed === false && /targets\.levelNames/.test(w.decision.reason) && denied.some((d) => /192\.0\.2\.1/.test(d)) && rakPings.length > n0,
    'discoverEndpoints: targets decide (only "Rak World" allowed); 192.0.2.1 outside same-host is refused before anything is sent', JSON.stringify(all.map((e) => [e.id, e.decision])) + '\n' + denied.slice(0, 4).join('\n'));
}
{
  // (4) the pong and info parsers (pure): a pong with no server string is still a server; GET /v1/join's other names
  const { parseRakPong, parseHttpInfo, rakPing } = await import(path.join(root, 'dist', 'src', 'discovery.js'));
  const bare = Buffer.alloc(33); bare[0] = 0x1c; MAGIC.copy(bare, 17);
  const p = rakPing(5n, 9n);
  check(parseRakPong(bare)?.bare === true && parseRakPong(pong('A', 'B', 19132))?.portV4 === 19132 && parseRakPong(Buffer.from('01', 'hex')) === null && p.length === 33 && p[0] === 0x01 && p.subarray(9, 25).equals(MAGIC)
    && parseHttpInfo({ name: 'S', level: 'L', protocol: 2193, version: '1.26.51', players: 3, maxPlayers: 8 }).playersMax === 8 && parseHttpInfo({ motd: 'S2', levelName: 'L2' }).levelName === 'L2',
  'RakNet ping/pong and GET /v1/join parsing (BDS 1.26 answers a ping with no server string: still a server)');
}
world.close(); rak.close(); front.close();

// ---------------------------------------------------------------- Tailscale
{
  const status = {
    BackendState: 'Running',
    Self: { HostName: 'me', DNSName: 'me.tail.ts.net.', TailscaleIPs: ['100.101.1.1', 'fd7a::1'], UserID: 1, Online: true },
    Peer: {
      a: { HostName: 'home-pc', TailscaleIPs: ['100.101.2.2'], UserID: 1, Online: true },
      b: { HostName: 'friend', TailscaleIPs: ['100.101.3.3'], UserID: 2, Online: true },
      c: { HostName: 'shared-box', TailscaleIPs: ['100.101.4.4'], UserID: 1, ShareeNode: true },
      d: { HostName: '', DNSName: 'tagged-nas.tail.ts.net.', TailscaleIPs: ['100.101.5.5'], UserID: 99, Tags: ['tag:server'] },
    },
  };
  const run = async () => JSON.stringify(status);
  const own = await nc.loadTailscale({ mode: 'own', devices: [], cli: null }, { run });
  const tn = await nc.loadTailscale({ mode: 'tailnet', devices: [], cli: null }, { run });
  const named = await nc.loadTailscale({ mode: 'own', devices: ['tagged-nas', 'shared-box'], cli: null }, { run });
  const off = await nc.loadTailscale({ mode: 'off', devices: [], cli: null }, { run });
  const down = await nc.loadTailscale({ mode: 'own', devices: [], cli: null }, { run: async () => JSON.stringify({ BackendState: 'NeedsLogin' }) });
  const none = await nc.loadTailscale({ mode: 'own', devices: [], cli: null }, { run: async () => { throw new Error('ENOENT'); } });
  check(own && [...own.allowed].join() === '100.101.2.2,home-pc' && own.self?.addresses.join() === '100.101.1.1' && own.devices.find((d) => d.name === 'shared-box')?.shared === true && own.devices.find((d) => d.name === 'tagged-nas')?.tags[0] === 'tag:server',
    'loadTailscale own: only the user\'s own devices (not a shared one, not self; IPv4 of 100.64/10 only)', JSON.stringify(own && [...own.allowed]));
  check(tn && [...tn.allowed.values()].sort().join() === 'friend,home-pc,tagged-nas' && named && [...named.allowed.values()].sort().join() === 'home-pc,tagged-nas' && off === null && down === null && none === null,
    'loadTailscale: tailnet = every device but shared ones; devices named are allowed in any mode (never a shared one); off / logged out / no command → null', JSON.stringify([tn && [...tn.allowed], named && [...named.allowed]]));
  const scope = new nc.LanScope(nc.normalizeConfig({ auth: { offline: true, username: 'x' } }).lanPolicy, undefined, own);
  check(scope.check('100.101.2.2').allowed && !scope.check('100.101.3.3').allowed && scope.tailscaleName('100.101.2.2') === 'home-pc', 'the scope with Tailscale: the own device allowed, a friend\'s not');
}

// ---------------------------------------------------------------- AccountStore
{
  const dir = path.join(T, 'auth'), codes = [];
  class FakeFlow { constructor(name, cache, options, cb) { this.name = name; this.cache = cache; this.options = options; this.cb = cb; }
    async getXboxToken() { this.cb({ verification_uri: 'https://www.microsoft.com/link', user_code: 'ABCD-1234', message: 'go' }); fs.writeFileSync(path.join(this.cache, crypto.createHash('sha1').update(this.name, 'binary').digest('hex').slice(0, 6) + '_live-cache.json'), '{}'); return { userXUID: '2535', displayClaims: { xui: [{ gtg: 'Bot One' }] } }; } }
  const store = new nc.AccountStore(dir, { Authflow: FakeFlow });
  const a = await store.add('bot1', (c) => codes.push(c));
  const prefix = crypto.createHash('sha1').update('bot2', 'binary').digest('hex').slice(0, 6);
  fs.writeFileSync(path.join(dir, `${prefix}_live-cache.json`), '{}'); fs.writeFileSync(path.join(dir, `${prefix}_xbl-cache.json`), '{}');
  store.register('bot2');
  store.register('ghost');   // (no cache: not listed)
  const l = store.list().map((x) => x.name);
  const rm = store.remove('bot2'), rm2 = store.remove('bot2');
  let badName = '';
  try { store.register('../evil'); } catch (e) { badName = e.message; }
  check(a.name === 'bot1' && a.gamertag === 'Bot One' && a.xuid === '2535' && codes[0]?.user_code === 'ABCD-1234' && l.join() === 'bot1,bot2' && rm === true && rm2 === false && !fs.existsSync(path.join(dir, `${prefix}_xbl-cache.json`)) && store.list().map((x) => x.name).join() === 'bot1' && /英数字/.test(badName),
    'AccountStore: add (device code, gamertag / xuid), register a cache put there, list only what has a cache, remove (the caches too), a bad name refused', JSON.stringify({ a, codes, l, rm, rm2, badName }));
}

// ---------------------------------------------------------------- SnapshotStore and the world folders
{
  const src = path.join(T, 'worlds', 'w1');
  fs.mkdirSync(path.join(src, 'db'), { recursive: true });
  fs.writeFileSync(path.join(src, 'level.dat'), 'v1'); fs.writeFileSync(path.join(src, 'levelname.txt'), 'Snap World\n'); fs.writeFileSync(path.join(src, 'db', '000001.ldb'), 'x');
  const store = new nc.SnapshotStore(path.join(T, 'snaps'));
  const m = store.take('world', src, 'Snap World');
  fs.writeFileSync(path.join(src, 'level.dat'), 'v2'); fs.writeFileSync(path.join(src, 'db', 'new.ldb'), 'y'); fs.mkdirSync(path.join(src, 'extra', 'deep'), { recursive: true }); fs.writeFileSync(path.join(src, 'extra', 'deep', 'f'), 'z');
  const r = await store.restore(m.id);
  const list = store.list();
  check(m.files.join() === 'db/000001.ldb,level.dat,levelname.txt' && m.kind === 'world' && m.source === path.resolve(src) && m.bytes > 0 && fs.readFileSync(path.join(src, 'level.dat'), 'utf8') === 'v1' && !fs.existsSync(path.join(src, 'db', 'new.ldb')) && !fs.existsSync(path.join(src, 'extra'))
    && r.restored === 3 && r.backup.label === 'Snap World の戻す前' && r.backup.files.includes('db/new.ldb') && list.length === 2 && list[0].id === r.backup.id,
  'SnapshotStore: take, then restore puts the files back and takes away what was added (and empty folders), the state before kept as a backup', JSON.stringify({ m: m.files, r: { restored: r.restored, backup: r.backup.label }, list: list.map((x) => x.label) }));
  let badId = '';
  try { await store.restore('../../etc'); } catch (e) { badId = e.message; }
  check(store.remove(r.backup.id) === true && store.remove(r.backup.id) === false && store.list().length === 1 && /id が不正/.test(badId), 'SnapshotStore: remove, and an id that would leave the folder is refused', badId);
  const roots = [path.join(T, 'worlds')];
  fs.mkdirSync(path.join(T, 'worlds', 'w2'), { recursive: true }); fs.writeFileSync(path.join(T, 'worlds', 'w2', 'levelname.txt'), 'Other');
  const home = path.join(T, 'home'), lad = path.join(T, 'lad'), ad = path.join(T, 'ad');
  const want = [path.join(lad, 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe', 'LocalState', 'games', 'com.mojang', 'minecraftWorlds'), path.join(ad, 'Minecraft Bedrock', 'Users', '1234', 'games', 'com.mojang', 'minecraftWorlds'), path.join(home, '.local', 'share', 'mcpelauncher', 'games', 'com.mojang', 'minecraftWorlds')];
  for (const d of want) fs.mkdirSync(d, { recursive: true });
  const { worldRoots } = await import(path.join(root, 'dist', 'src', 'worlds.js'));
  const got = worldRoots({ LOCALAPPDATA: lad, APPDATA: ad }, home);
  check(nc.findWorldFolders('Snap World', roots).join() === path.join(T, 'worlds', 'w1') && nc.findWorldFolders('Nope', roots).length === 0 && want.every((d) => got.includes(d)) && got.length === 3,
    'findWorldFolders by levelname.txt; worldRoots finds the Store, GDK (each user) and mcpelauncher folders that are there', JSON.stringify(got));
}

// ---------------------------------------------------------------- startWeb (fake deps, a real HTTP server on 127.0.0.1)
{
  const restoreDir = path.join(T, 'bds1');
  fs.mkdirSync(restoreDir, { recursive: true }); fs.writeFileSync(path.join(restoreDir, 'server.properties'), 'a=1');
  const c = nc.normalizeConfig({ auth: { offline: true, username: 'WebBot', profilesFolder: path.join(T, 'webauth') }, lanPolicy: { scope: 'same-host', tailscale: { mode: 'off' } }, requireManualConfirmation: false,
    restore: { store: path.join(T, 'websnaps'), targets: [{ name: 'my-bds', kind: 'bds', path: restoreDir }] }, web: { bind: 'localhost', token: 'test-token-0123456789' }, session: { observe: 'auto', allowChat: false } });
  const EP = { id: '42', kind: 'world', address: '127.0.0.1', via: 'this-host', motd: 'Host', levelName: 'W', playerCount: 0, playersMax: 8, lan: { networkId: 42n, port: 7551, world: {} }, preferred: 'lan', decision: { allowed: true, reason: 'ok' }, warnings: [] };
  const joins = [], queued = [];
  const deps = {
    discoverEndpoints: async () => { await sleep(100); return [EP]; },
    connectToEndpoint: (config, guard, ep, o) => {
      joins.push({ ep: ep.id, o: { transport: o.transport, observe: o.observe, allowChat: o.allowChat, account: o.account } });
      const client = new EventEmitter(); client.username = 'WebBot'; client.queue = (n, p) => queued.push([n, p.message]); client.close = () => setTimeout(() => client.emit('close'), 10);
      const tracker = { onTransition: (f) => { setTimeout(() => f({ to: 'Signaling' }), 20); setTimeout(() => f({ to: 'Connected' }), 40); } };
      const done = new Promise((res) => client.once('close', () => res({ connected: true, joined: true, reason: '切断' })));
      setTimeout(() => { o.log('[route] 確立経路: test'); client.emit('join'); }, 60);
      return { client, tracker, guard, done, transport: o.transport, observer: { observe: o.observe, allowChat: o.allowChat, blocked: new Map() } };
    },
  };
  const h = await nc.startWeb(c, { port: 0, deps });
  const base = h.urls[0].replace(/\/#t=.*$/, '');
  const call = async (method, p, body, token = h.token) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-NC-Token': token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const page = await fetch(base + '/'), js = await fetch(base + '/app.js');
  const noTok = await call('GET', '/api/state', null, null), wrong = await call('GET', '/api/state', null, 'x'.repeat(21));
  const st = await call('GET', '/api/state');
  check(h.urls.length === 1 && /^http:\/\/127\.0\.0\.1:\d+\/#t=test-token-0123456789$/.test(h.urls[0]) && page.status === 200 && /<script src="\/app\.js">/.test(await page.text()) && js.status === 200 && /EventSource/.test(await js.text()) && /script-src 'self'/.test(page.headers.get('content-security-policy') ?? '')
    && noTok.status === 401 && wrong.status === 401 && st.status === 200 && Array.isArray(st.json.sessions) && st.json.offline === true && st.json.offlineName === 'WebBot' && st.json.restoreTargets[0].name === 'my-bds' && st.json.tailscale.enabled === false && st.json.defaultObserve === 'auto' && st.json.allowChat === false && Array.isArray(st.json.scope),
  'startWeb: the page and its script (a strict CSP), 401 without the token or with a wrong one, the state the page reads', JSON.stringify({ urls: h.urls, noTok: noTok.status, wrong: wrong.status, st: st.json && Object.keys(st.json) }));
  // the event stream: state first, then what happens
  const events = [];
  const ac = new AbortController();
  const es = fetch(`${base}/api/events?t=${encodeURIComponent(h.token)}`, { signal: ac.signal }).then(async (r) => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = ''; for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (\S+)/m.exec(chunk)?.[1], data = /^data: (.*)$/m.exec(chunk)?.[1]; if (ev) events.push([ev, data ? JSON.parse(data) : null]); } } }).catch(() => {});
  await sleep(200);
  const d = await call('POST', '/api/discover', {});
  for (let k = 0; k < 40 && !events.some(([e, x]) => e === 'state' && x?.endpoints?.length === 1 && x.discovering === false); k++) await sleep(50);
  const j = await call('POST', '/api/join', { endpointId: '42', transport: 'lan', snapshotTarget: 'my-bds' });
  for (let k = 0; k < 40 && !events.some(([e, x]) => e === 'session' && x?.state === 'connected'); k++) await sleep(50);
  const sid = j.json?.id;
  const chatObserve = await call('POST', `/api/sessions/${sid}/chat`, { text: 'hello' });
  const st2 = await call('GET', '/api/state');
  const sess = st2.json.sessions.find((s) => s.id === sid);
  check(d.status === 202 && j.status === 200 && joins[0]?.o.observe === true && joins[0]?.o.allowChat === false && joins[0]?.o.transport === 'lan' && sess?.state === 'connected' && sess?.phase === 'Connected' && sess?.snapshotId && sess.log.some((l) => /\[route\]/.test(l)) && sess.log.some((l) => /\[snapshot\] my-bds/.test(l))
    && events.some(([e]) => e === 'state') && events.some(([e, x]) => e === 'log' && x.id === sid) && chatObserve.status === 400 && queued.length === 0 && st2.json.snapshots.length === 1 && !('conn' in sess),
  'startWeb: discover → the endpoints; join (a world: observe by default, chat off as configured) with a snapshot first → session events over SSE; chat refused in observe mode without chat', JSON.stringify({ d: d.status, j: j.json, joins, sess, chat: chatObserve, ev: events.map(([e]) => e).slice(0, 12) }));
  // a server, not observing: chat goes (commands never); leave; delete; snapshots and accounts over the API
  const j2 = await call('POST', '/api/join', { endpointId: '42', transport: 'lan', observe: false, allowChat: true });
  await sleep(150);
  const chat2 = await call('POST', `/api/sessions/${j2.json.id}/chat`, { text: 'hi there' }), cmd = await call('POST', `/api/sessions/${j2.json.id}/chat`, { text: '/op me' });
  const delOpen = await call('DELETE', `/api/sessions/${j2.json.id}`);
  const leave = await call('POST', `/api/sessions/${j2.json.id}/leave`);
  await sleep(150);
  const del = await call('DELETE', `/api/sessions/${j2.json.id}`);
  const snap = await call('POST', '/api/snapshots', { target: 'my-bds' });
  fs.writeFileSync(path.join(restoreDir, 'server.properties'), 'a=2');
  const back = await call('POST', `/api/snapshots/${snap.json.id}/restore`, {});
  const badSnap = await call('POST', '/api/snapshots/..%2F..%2Fetc/restore', {});
  const acc = await call('POST', '/api/accounts', { name: 'bad name' }), accDel = await call('DELETE', '/api/accounts/nobody');
  const missing = await call('POST', '/api/join', { endpointId: 'nope' });
  check(chat2.status === 200 && queued.some(([n, m]) => n === 'text' && m === 'hi there') && cmd.status === 400 && delOpen.status === 409 && leave.status === 200 && del.status === 200 && snap.status === 200 && back.status === 200 && typeof back.json.backup === 'string' && fs.readFileSync(path.join(restoreDir, 'server.properties'), 'utf8') === 'a=1'
    && badSnap.status === 400 && acc.status === 400 && accDel.status === 404 && missing.status === 404,
  'startWeb: chat when allowed (a command never), leave then delete, snapshot / restore ({backup}), bad ids and names refused, an unknown endpoint 404', JSON.stringify({ chat2: chat2.status, cmd: cmd.status, delOpen: delOpen.status, leave: leave.status, del: del.status, snap: snap.status, back: back.json, badSnap: badSnap.status, acc: acc.status, accDel: accDel.status, missing: missing.status }));
  ac.abort();
  await es;
  await h.close();
  let refused = false;
  try { await fetch(base + '/api/state', { headers: { 'X-NC-Token': h.token } }); } catch { refused = true; }
  check(refused, 'startWeb: close() stops it (no more answers)');
}

console.log(`${bad ? 'FAIL' : 'PASS'} nc-find-offline ${good}/${good + bad}`);
setTimeout(() => process.exit(bad ? 1 : 0), 300);
