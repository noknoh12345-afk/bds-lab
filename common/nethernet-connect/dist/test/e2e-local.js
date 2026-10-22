/**
 * e2e: このマシン上に bedrock-protocol の NetherNet サーバー（LANワールド/BDS役・オフライン認証）を立て、
 * nethernet-connect で実際に UDPディスカバリ → シグナリング → ICE → DTLS → SCTP → ログイン まで通す。
 *
 *   A. 同一マシン(scope=same-host) → 接続成功し、サーバー側でログイン完了すること
 *   B. ディスカバリは通るが、相手のICE候補がスコープ外 → 候補が除去され接続不成立
 *   C. 問い合わせ先がスコープ外 → ディスカバリ要求そのものを送らない
 *   D. 別PC(同一サブネットの隣人)向けの設定: 接続先と同じNICにだけバインドし、STUNも使わずに確立
 *   E. 成功する接続と拒否される接続を「同時に」走らせても、互いのガードが混線しない
 *   F. 既定の宛先(リミテッド＋有向ブロードキャスト)で見つかり、二重応答をなりすましと誤判定しない
 *   G. CLI の終了コード（list=0 / 接続成功=0 / 引数誤り=2 / 接続先なし=1）
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bpRequire as ncBpRequire, bedrockProtocol } from '../src/bp.js';
import { normalizeConfig } from '../src/config.js';
import { LanScope, listLocalInterfaces, ipv4ToInt, intToIpv4, maskBits } from '../src/lan-scope.js';
import { LanGuard, makeGuardedBackend } from '../src/guard.js';
import { discoverLanWorlds } from '../src/discover.js';
import { connectToWorld } from '../src/connect.js';
import { parseCandidate } from '../src/sdp-filter.js';
// (bedrock-protocol where this package finds it: the one passed to useBedrockProtocol, NC_BEDROCK_PROTOCOL's, or beside it)
const bpRequire = createRequire(ncBpRequire().resolve('bedrock-protocol'));
const bedrock = bedrockProtocol();
const { CURRENT_VERSION } = bpRequire('./src/options');
const weriftBackend = createRequire(bpRequire.resolve('nethernet'))('./src/werift');
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const NETWORK_ID = 4242424242n;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LO_ONLY = [{ name: 'lo', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }];
const log = (m) => console.log('  ' + m);
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`\n=== ${ok ? 'PASS' : 'FAIL'}: ${name}\n    ${detail}\n`);
}
const joinsByName = new Map();
const server = bedrock.createServer({
    transport: 'nethernet',
    host: '0.0.0.0',
    offline: true,
    version: CURRENT_VERSION,
    motd: { motd: 'E2EHost', levelName: 'E2E World' },
    nethernet: { networkId: NETWORK_ID },
});
server.on('connect', (player) => {
    player.on('join', () => {
        const name = String(player.profile?.name ?? '?');
        joinsByName.set(name, (joinsByName.get(name) ?? 0) + 1);
        console.log(`  [server] プレイヤーがログインしました (${name})`);
        setTimeout(() => player.disconnect('e2e-ok'), 300);
    });
});
const joins = (name) => joinsByName.get(name) ?? 0;
function guardFor(cfg, ifaces, tag) {
    return new LanGuard(new LanScope(cfg.lanPolicy, ifaces), {
        onDeny: (s, d) => log(`${tag}[guard:拒否/${s}] ${d}`),
        onWarn: (s, d) => log(`${tag}[guard:注意/${s}] ${d}`),
    });
}
async function connectOnce(name, scopeIfaces, tag) {
    const cfg = normalizeConfig({ auth: { offline: true, username: name }, lanPolicy: { scope: 'same-host' } });
    const guard = guardFor(cfg, scopeIfaces, tag);
    const worlds = await discoverLanWorlds(guard, cfg.targets, { host: '127.0.0.1', timeoutMs: 2500, offline: true });
    const w = worlds.find((x) => x.networkId === NETWORK_ID);
    if (!w || !w.decision.allowed)
        return { found: false };
    let route = '';
    let kicked = '';
    const r = connectToWorld(cfg, guard, w, (m) => log(tag + m));
    const prevRoute = r.guard.events.onRoute;
    r.guard.events.onRoute = (l, rr) => {
        prevRoute?.(l, rr);
        route = `${l} ⇄ ${rr}`;
    };
    r.client.on('kick', (p) => (kicked = String(p?.message ?? '')));
    const timer = setTimeout(() => r.client.close(), 30000);
    const outcome = await r.done;
    clearTimeout(timer);
    return { found: true, outcome, route, kicked, phase: r.tracker.phase, denied: r.guard.deniedCount, w };
}
async function scenarioA() {
    const before = joins('E2EBotA');
    const r = await connectOnce('E2EBotA', undefined, '[A] ');
    if (!r.found)
        return record('A 同一マシン接続', false, 'ワールド未検出/拒否');
    const ok = joins('E2EBotA') === before + 1 && r.kicked === 'e2e-ok' && r.route !== '' && r.outcome.connected && r.outcome.joined;
    record('A 同一マシン接続', ok, `server login=${joins('E2EBotA') - before}, kick="${r.kicked}", route=${r.route}, outcome=${JSON.stringify(r.outcome)}`);
}
async function scenarioB() {
    const before = joins('E2EBotB');
    const r = await connectOnce('E2EBotB', LO_ONLY, '[B] ');
    if (!r.found)
        return record('B 候補スコープ外', false, 'ディスカバリ段階で想定外');
    const ok = joins('E2EBotB') === before && r.denied > 0 && !r.outcome.connected;
    record('B 候補スコープ外', ok, `server login=${joins('E2EBotB') - before}, 拒否=${r.denied}件, outcome=${JSON.stringify(r.outcome)}`);
}
async function scenarioC() {
    const cfg = normalizeConfig({ lanPolicy: { scope: 'same-subnet' } });
    const denied = [];
    const guard = new LanGuard(new LanScope(cfg.lanPolicy, LO_ONLY), { onDeny: (s, d) => denied.push(`${s}: ${d}`) });
    const eth = listLocalInterfaces().find((i) => !i.internal);
    const worlds = await discoverLanWorlds(guard, cfg.targets, { host: eth?.address ?? '192.0.2.2', timeoutMs: 2000 });
    const ok = worlds.length === 0 && denied.some((d) => d.startsWith('discovery:'));
    record('C 問い合わせ先スコープ外', ok, `見つかった=${worlds.length}, ${denied[0] ?? '(拒否ログなし)'}`);
}
async function scenarioD() {
    const eth = listLocalInterfaces().find((i) => !i.internal);
    if (!eth)
        return record('D 隣人向けNIC固定', true, '非ループバックNICが無いためスキップ');
    const bits = maskBits(eth.netmask);
    const base = (ipv4ToInt(eth.address) & ((0xffffffff << (32 - bits)) >>> 0)) >>> 0;
    let neighbor = intToIpv4(base + 99);
    if (neighbor === eth.address)
        neighbor = intToIpv4(base + 98);
    const cfg = normalizeConfig({ lanPolicy: { scope: 'same-subnet', requirePrivateAddress: false } });
    let route = '';
    const g = new LanGuard(new LanScope(cfg.lanPolicy), {
        onDeny: (s, d) => log(`[D][guard:拒否/${s}] ${d}`),
        onRoute: (l, r) => (route = `${l} ⇄ ${r}`),
    });
    // 接続先を「同じサブネットの別PC(neighbor)」とみなした時のバックエンド → eth にだけバインドされる
    const backend = makeGuardedBackend(g, neighbor);
    const a = new backend.RTCPeerConnection({});
    const b = new weriftBackend.RTCPeerConnection({ iceServers: [] });
    b.onDataChannel.subscribe((dc) => dc.onMessage.subscribe((m) => dc.send(`pong:${m}`)));
    const ch = a.createDataChannel('ReliableDataChannel', { ordered: true });
    await a.setLocalDescription(await a.createOffer());
    const stun = a.iceTransports?.[0]?.connection?.stunServer;
    const localCands = String(a.localDescription.sdp)
        .split(/\r?\n/)
        .map((l) => parseCandidate(l))
        .filter(Boolean)
        .map((c) => `${c.address}/${c.type}`);
    await b.setRemoteDescription(a.localDescription);
    await b.setLocalDescription(await b.createAnswer());
    await a.setRemoteDescription(b.localDescription);
    const reply = await new Promise((resolve) => {
        ch.stateChanged.subscribe((st) => st === 'open' && ch.send('ping'));
        ch.onMessage.subscribe((m) => resolve(String(m)));
        setTimeout(() => resolve('(timeout)'), 10000);
    });
    await a.close();
    await b.close();
    const onlyEth = localCands.length > 0 && localCands.every((x) => x === `${eth.address}/host`);
    record('D 隣人向けNIC固定', onlyEth && reply === 'pong:ping' && route !== '' && stun === undefined, `想定接続先=${neighbor}, 自分の候補=[${localCands.join(', ')}], STUNサーバー=${stun ?? 'なし'}, 応答="${reply}", route=${route}`);
}
async function scenarioE() {
    const beforeE = joins('E2EBotE');
    const beforeX = joins('E2EBotX');
    const [ok1, bad] = await Promise.all([connectOnce('E2EBotE', undefined, '[E-ok] '), connectOnce('E2EBotX', LO_ONLY, '[E-ng] ')]);
    const pass = ok1.found &&
        bad.found &&
        ok1.outcome.connected &&
        ok1.denied === 0 &&
        !bad.outcome.connected &&
        bad.denied > 0 &&
        joins('E2EBotE') === beforeE + 1 &&
        joins('E2EBotX') === beforeX;
    record('E 同時接続でガードが混線しない', !!pass, `成功側: connected=${ok1.found && ok1.outcome.connected} 拒否=${ok1.found && ok1.denied} / 拒否側: connected=${bad.found && bad.outcome.connected} 拒否=${bad.found && bad.denied}`);
}
async function scenarioF() {
    // この環境の実NICは非プライベート(TEST-NET)なので requirePrivateAddress=false で既定宛先を試す
    const cfg = normalizeConfig({ lanPolicy: { scope: 'same-subnet', requirePrivateAddress: false } });
    const denied = [];
    const guard = new LanGuard(new LanScope(cfg.lanPolicy), { onDeny: (s, d) => denied.push(`${s}: ${d}`) });
    const dests = guard.scope.discoveryDestinations();
    const worlds = await discoverLanWorlds(guard, cfg.targets, { timeoutMs: 3000 });
    const w = worlds.find((x) => x.networkId === NETWORK_ID);
    const ok = !!w && w.decision.allowed && w.addresses.length === 1 && w.advertisementVersion === 7;
    record('F 既定宛先でのディスカバリ', ok, `宛先=[${dests.join(', ')}], 検出=${w ? `${w.addresses.join(',')} v${w.advertisementVersion} ${w.decision.reason}` : 'なし'}${denied.length ? `, 拒否=${denied[0]}` : ''}`);
}
function runCli(args, cfg) {
    const dir = mkdtempSync(join(tmpdir(), 'nnc-e2e-'));
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify(cfg));
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [CLI, ...args, '--config', p], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        const t = setTimeout(() => child.kill('SIGKILL'), 45000);
        child.on('exit', (code) => {
            clearTimeout(t);
            resolve({ code, out });
        });
    });
}
async function scenarioG() {
    const base = { auth: { offline: true, username: 'E2EBotG' }, lanPolicy: { scope: 'same-host' }, botBehavior: { discoveryTimeoutMs: 2000 } };
    const list = await runCli(['list'], base);
    const bad = await runCli(['connect', '--timeout', 'abc'], base);
    const none = await runCli(['connect', '--yes', '--network-id', '1'], base);
    const conn = await runCli(['connect', '--yes'], base);
    const ok = list.code === 0 && /E2E World/.test(list.out) && bad.code === 2 && none.code === 1 && conn.code === 0 && /Connected/.test(conn.out);
    record('G CLI終了コード', ok, `list=${list.code}, 引数誤り=${bad.code}, 対象なし=${none.code}, 接続=${conn.code}`);
    if (!ok)
        console.log(conn.out.split('\n').slice(-15).join('\n'));
}
async function main() {
    await sleep(1500); // サーバーの listen 待ち
    console.log(`[e2e] NetherNet サーバー起動 networkId=${NETWORK_ID} version=${CURRENT_VERSION}`);
    for (const s of [scenarioC, scenarioF, scenarioB, scenarioA, scenarioD, scenarioE, scenarioG]) {
        try {
            await s();
        }
        catch (e) {
            record(s.name, false, `例外: ${e.stack}`);
        }
        await sleep(500);
    }
    console.log('\n[e2e] 結果');
    for (const r of results)
        console.log(`  ${r.ok ? '✔' : '✖'} ${r.name} — ${r.detail}`);
    server.close();
    const failed = results.filter((r) => !r.ok).length;
    setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
