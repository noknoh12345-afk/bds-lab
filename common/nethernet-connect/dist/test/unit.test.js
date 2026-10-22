import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LanScope } from '../src/lan-scope.js';
import { LanGuard, netherNet, withGuard, guardOfClient, describeConnectError } from '../src/guard.js';
import { bpRequire as ncBpRequire } from '../src/bp.js';
import { parseCandidate, sanitizeSdp } from '../src/sdp-filter.js';
import { loadConfig, normalizeConfig, validateOfflineUsername } from '../src/config.js';
import { Phase, PhaseTracker } from '../src/phase.js';
import { resolveVersion } from '../src/connect.js';
import { evaluateWorld } from '../src/discover.js';
import { inspectIdentity, checkHostIdentity } from '../src/host-identity.js';
import { parseArgs, UsageError } from '../src/cli.js';
// 家庭内LANに置いたサーバー機を想定した NIC 構成（テスト用の固定値）
const IFACES = [
    { name: 'lo', address: '127.0.0.1', netmask: '255.0.0.0', internal: true },
    { name: 'eth0', address: '192.168.1.10', netmask: '255.255.255.0', internal: false },
    { name: 'docker0', address: '172.17.0.1', netmask: '255.255.0.0', internal: false },
    { name: 'pub0', address: '203.0.113.5', netmask: '255.255.255.0', internal: false },
];
const policy = (p = {}) => ({
    scope: 'same-subnet',
    requirePrivateAddress: true,
    pinToDiscoveryAddress: true,
    allowedSubnets: [],
    interfaces: [],
    ...p,
});
const NO_TARGETS = { networkIds: [], levelNames: [], hostNames: [], trustedHostKeys: [] };
// (bedrock-protocol where this package finds it: the one passed to useBedrockProtocol, NC_BEDROCK_PROTOCOL's, or beside it)
const bpRequire = createRequire(ncBpRequire().resolve('bedrock-protocol'));
const nnMain = bpRequire.resolve('nethernet');
const NetherNet = netherNet();
const util = createRequire(nnMain)('./src/util');
const ser = createRequire(nnMain)('./src/transforms/serializer');
const nnIdentity = createRequire(nnMain)('./src/identity');
// ---------------------------------------------------------------- LanScope
test('same-subnet: 直結LANだけ許可し、ルーター越し・グローバル・特殊アドレスは拒否', () => {
    const s = new LanScope(policy(), IFACES);
    assert.equal(s.check('192.168.1.23').allowed, true);
    assert.equal(s.check('::ffff:192.168.1.23').allowed, true);
    assert.equal(s.check('127.0.0.1').allowed, true);
    assert.equal(s.check('192.168.1.10').allowed, true); // 自分
    assert.equal(s.check('192.168.2.5').allowed, false); // 別サブネット（ルーター越し）
    assert.equal(s.check('8.8.8.8').allowed, false);
    assert.equal(s.check('192.168.1.255').allowed, false); // ブロードキャスト
    assert.equal(s.check('192.168.1.0').allowed, false); // ネットワークアドレス
    assert.equal(s.check('203.0.113.9').allowed, false); // 非プライベートNICの隣人
    assert.equal(s.check('100.64.1.2').allowed, false); // CGNAT/VPN帯
    assert.equal(s.check('224.0.0.251').allowed, false);
    assert.equal(s.check('abcd-1234.local').allowed, false); // mDNS
    assert.equal(s.check('fe80::1').allowed, false); // IPv6
    assert.equal(s.check('0.0.0.0').allowed, false);
    assert.equal(s.check('192.168.1.300').allowed, false);
});
test('requirePrivateAddress=false なら非プライベートでも直結なら許可', () => {
    const s = new LanScope(policy({ requirePrivateAddress: false }), IFACES);
    assert.equal(s.check('203.0.113.9').allowed, true);
    assert.equal(s.check('8.8.8.8').allowed, false);
});
test('allowedSubnets で更に絞り込める', () => {
    const s = new LanScope(policy({ allowedSubnets: ['192.168.1.0/28'] }), IFACES);
    assert.equal(s.check('192.168.1.5').allowed, true);
    assert.equal(s.check('192.168.1.23').allowed, false);
});
test('/31・/32 のNIC: /32 は隣人なし、/31 は相手を許可（ネットワーク/ブロードキャスト扱いしない）', () => {
    const s32 = new LanScope(policy(), [{ name: 'p2p', address: '10.0.0.1', netmask: '255.255.255.255', internal: false }]);
    assert.equal(s32.check('10.0.0.2').allowed, false);
    const s31 = new LanScope(policy(), [{ name: 'p2p', address: '10.0.0.0', netmask: '255.255.255.254', internal: false }]);
    assert.equal(s31.check('10.0.0.1').allowed, true);
    assert.deepEqual(s31.discoveryDestinations(), ['255.255.255.255']);
});
test('same-host: このマシン自身のアドレスだけ', () => {
    const s = new LanScope(policy({ scope: 'same-host' }), IFACES);
    assert.equal(s.check('127.0.0.1').allowed, true);
    assert.equal(s.check('192.168.1.10').allowed, true);
    assert.equal(s.check('192.168.1.23').allowed, false);
    assert.equal(s.checkDiscoveryDestination('255.255.255.255').allowed, false);
    assert.deepEqual(s.discoveryDestinations(), ['127.0.0.1']);
});
// (v3) the user's own Tailscale devices: only the addresses loadTailscale allowed, only with scope=same-subnet
const TS = (allowed, mode = 'own') => ({
    mode, self: { name: 'me', addresses: ['100.101.1.1'], own: true, online: true, tags: [], shared: false, self: true },
    devices: [], allowed: new Map(allowed),
});
test('Tailscale: 許した端末のアドレスだけ「自分のネットワーク」に（CGNAT 帯でも・allowedSubnets の外でも）、他は今までどおり', () => {
    const s = new LanScope(policy({ allowedSubnets: ['192.168.1.0/28'] }), IFACES, TS([['100.101.2.2', 'home-pc'], ['100.101.3.3', 'nas']]));
    assert.equal(s.check('100.101.2.2').allowed, true);
    assert.match(s.check('100.101.2.2').reason, /Tailscale の端末「home-pc」/);
    assert.equal(s.check('100.101.3.3').allowed, true);
    assert.equal(s.check('100.101.9.9').allowed, false); // (a Tailscale address not allowed: as before)
    assert.equal(s.check('192.168.1.23').allowed, false); // (allowedSubnets still narrows the LAN)
    assert.equal(s.tailscaleName('::ffff:100.101.2.2'), 'home-pc');
    assert.equal(s.tailscaleName('192.168.1.5'), null);
    assert.deepEqual(s.ownTailscaleAddresses(), ['100.101.1.1']);
    assert.ok(s.describe().some((l) => /Tailscale（own）: home-pc 100\.101\.2\.2 \/ nas 100\.101\.3\.3/.test(l)));
    // (broadcasts stay on the LAN: Tailscale devices are asked one by one — discoverEndpoints)
    assert.deepEqual(s.discoveryDestinations(), new LanScope(policy({ allowedSubnets: ['192.168.1.0/28'] }), IFACES).discoveryDestinations());
});
test('Tailscale: scope=same-host ではこのマシン自身だけのまま・無しなら何も変わらない', () => {
    const h = new LanScope(policy({ scope: 'same-host' }), IFACES, TS([['100.101.2.2', 'home-pc']]));
    assert.equal(h.check('100.101.2.2').allowed, false);
    assert.equal(h.tailscaleName('100.101.2.2'), null);
    assert.ok(h.describe().some((l) => /scope=same-host なので使いません/.test(l)));
    const none = new LanScope(policy(), IFACES);
    assert.equal(none.tailscaleName('100.101.2.2'), null);
    assert.deepEqual(none.ownTailscaleAddresses(), []);
    assert.ok(!none.describe().some((l) => /Tailscale/.test(l)));
});
test('ディスカバリ送信先: リミテッド/許可NICの有向ブロードキャスト/許可アドレスのみ', () => {
    const s = new LanScope(policy(), IFACES);
    assert.equal(s.checkDiscoveryDestination('255.255.255.255').allowed, true);
    assert.equal(s.checkDiscoveryDestination('192.168.1.255').allowed, true);
    assert.equal(s.checkDiscoveryDestination('203.0.113.255').allowed, false);
    assert.equal(s.checkDiscoveryDestination('10.0.0.255').allowed, false);
    assert.equal(s.checkDiscoveryDestination('192.168.1.23').allowed, true);
    assert.equal(s.checkDiscoveryDestination('1.1.1.1').allowed, false);
});
test('既定のディスカバリ宛先: 純正と同じくリミテッド＋各許可NICのサブネットブロードキャスト', () => {
    assert.deepEqual(new LanScope(policy(), IFACES).discoveryDestinations(), ['255.255.255.255', '192.168.1.255', '172.17.255.255']);
    assert.deepEqual(new LanScope(policy({ interfaces: ['eth0'] }), IFACES.filter((i) => i.name !== 'docker0' && i.name !== 'pub0')).discoveryDestinations(), [
        '255.255.255.255',
        '192.168.1.255',
    ]);
    assert.deepEqual(new LanScope(policy({ allowedSubnets: ['192.168.1.0/24'] }), IFACES).discoveryDestinations(), ['255.255.255.255', '192.168.1.255']);
    // 許可できるNICが無ければ、ブロードキャストもしない
    const pubOnly = new LanScope(policy(), [IFACES[0], IFACES[3]]);
    assert.deepEqual(pubOnly.discoveryDestinations(), []);
    assert.equal(pubOnly.checkDiscoveryDestination('255.255.255.255').allowed, false);
});
// ---------------------------------------------------------------- LanGuard
test('pin: ディスカバリに応答したIP以外とは通信しない（同一マシンの別アドレスは同一扱い）', () => {
    const g = new LanGuard(new LanScope(policy(), IFACES));
    g.pinAddress = '192.168.1.23';
    assert.equal(g.acceptRemoteAddress('192.168.1.23').allowed, true);
    assert.equal(g.acceptRemoteAddress('192.168.1.24').allowed, false);
    const h = new LanGuard(new LanScope(policy({ scope: 'same-host' }), IFACES));
    h.pinAddress = '127.0.0.1';
    assert.equal(h.acceptRemoteAddress('192.168.1.10').allowed, true);
});
test('fork: 子の pin は親に影響しない・イベントは親→子の順で両方呼ばれ、親の差し替えも反映', () => {
    const calls = [];
    const parent = new LanGuard(new LanScope(policy(), IFACES), { onDeny: () => calls.push('parent1') });
    const child = parent.fork({ pinAddress: '192.168.1.23', events: { onDeny: () => calls.push('child') } });
    assert.equal(parent.pinAddress, null);
    assert.equal(parent.acceptRemoteAddress('192.168.1.24').allowed, true);
    assert.equal(child.acceptRemoteAddress('192.168.1.24').allowed, false);
    child.deny('udp', 'x');
    parent.events.onDeny = () => calls.push('parent2');
    child.deny('udp', 'y');
    assert.deepEqual(calls, ['parent1', 'child', 'parent2', 'child']);
    assert.equal(parent.deniedCount, 0);
    assert.equal(child.deniedCount, 2);
});
test('ICE候補: 相手は host/udp/LAN のみ、自分は接続先と同じセグメントのNICのみ', () => {
    const g = new LanGuard(new LanScope(policy(), IFACES));
    const c = (s) => parseCandidate(s);
    assert.equal(g.acceptRemoteCandidate(c('candidate:1 1 udp 2113937151 192.168.1.23 50000 typ host')).allowed, true);
    assert.equal(g.acceptRemoteCandidate(c('candidate:1 1 UDP 2113937151 192.168.1.23 50000 typ host')).allowed, true);
    assert.equal(g.acceptRemoteCandidate(c('candidate:2 1 udp 1677729535 198.51.100.7 50001 typ srflx raddr 192.168.1.23 rport 50000')).allowed, false);
    assert.equal(g.acceptRemoteCandidate(c('candidate:3 1 udp 16777215 192.168.1.23 3478 typ relay raddr 0.0.0.0 rport 0')).allowed, false);
    assert.equal(g.acceptRemoteCandidate(c('candidate:4 1 tcp 1518280447 192.168.1.23 9 typ host tcptype active')).allowed, false);
    assert.equal(g.acceptRemoteCandidate(c('candidate:5 1 udp 2113937151 8.8.8.8 50000 typ host')).allowed, false);
    assert.equal(g.acceptRemoteCandidate(c('candidate:6 1 udp 2113937151 0a1b2c3d-1111.local 50000 typ host')).allowed, false);
    const t = '192.168.1.23';
    assert.equal(g.acceptLocalCandidate(c('candidate:1 1 udp 2113937151 192.168.1.10 40000 typ host'), t).allowed, true);
    assert.equal(g.acceptLocalCandidate(c('candidate:2 1 udp 2113937151 172.17.0.1 40001 typ host'), t).allowed, false);
    assert.equal(g.acceptLocalCandidate(c('candidate:3 1 udp 2113937151 203.0.113.5 40002 typ host'), t).allowed, false);
    assert.equal(g.acceptLocalCandidate(c('candidate:4 1 udp 1677729535 198.51.100.1 40003 typ srflx'), t).allowed, false);
});
// ---------------------------------------------------------------- SDP
test('SDP: LAN外の a=candidate 行だけ除去し、他の行と改行コードは保持', () => {
    const sdp = [
        'v=0',
        'o=- 1 2 IN IP4 127.0.0.1',
        's=-',
        'a=fingerprint:sha-256 AA:BB',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'a=ice-ufrag:abcd',
        'a=candidate:1 1 udp 2113937151 192.168.1.23 50000 typ host',
        'a=candidate:2 1 udp 1677729535 198.51.100.7 50001 typ srflx raddr 192.168.1.23 rport 50000',
        'a=candidate:3 1 udp 2113937151 10.8.0.2 50002 typ host',
        'a=sctp-port:5000',
        '',
    ].join('\r\n');
    const g = new LanGuard(new LanScope(policy(), IFACES));
    const r = sanitizeSdp(sdp, (c) => g.acceptRemoteCandidate(c));
    assert.equal(r.kept.length, 1);
    assert.equal(r.dropped.length, 2);
    assert.ok(r.sdp.includes('192.168.1.23 50000 typ host'));
    assert.ok(!r.sdp.includes('198.51.100.7'));
    assert.ok(!r.sdp.includes('10.8.0.2'));
    assert.ok(r.sdp.includes('a=fingerprint:sha-256 AA:BB\r\n'));
    assert.ok(r.sdp.endsWith('a=sctp-port:5000\r\n'));
});
test('parseCandidate: 形式不正は null', () => {
    assert.equal(parseCandidate('candidate:1 1 udp'), null);
    assert.equal(parseCandidate('hello'), null);
    assert.equal(parseCandidate('candidate:1 1 udp 1 1.2.3.4 99999 typ host'), null);
    assert.equal(parseCandidate('candidate:1 1 udp 1 1.2.3.4 5000 host host'), null);
});
// ---------------------------------------------------------------- config
test('config: 安全側の既定値', () => {
    const c = normalizeConfig({});
    assert.equal(c.lanPolicy.scope, 'same-subnet');
    assert.equal(c.lanPolicy.requirePrivateAddress, true);
    assert.equal(c.lanPolicy.pinToDiscoveryAddress, true);
    assert.equal(c.requireManualConfirmation, true);
    assert.equal(c.auth.offline, false);
    assert.equal(c.botBehavior.discoveryTimeoutMs, 4000);
    assert.deepEqual(c.warnings, []);
});
test('config: 型違い・範囲外・精度落ちは例外、未知キーは警告', () => {
    assert.throws(() => normalizeConfig({ lanPolicy: { scope: 'internet' } }));
    assert.throws(() => normalizeConfig({ lanPolicy: { allowedSubnets: ['192.168.1.0/99'] } }));
    assert.throws(() => normalizeConfig({ lanPolicy: { requirePrivateAddress: 'false' } }), /true \/ false/);
    assert.throws(() => normalizeConfig({ requireManualConfirmation: 0 }));
    assert.throws(() => normalizeConfig({ targets: { networkIds: [12345678901234567890] } }), /引用符/);
    assert.throws(() => normalizeConfig({ targets: { networkIds: ['12a'] } }));
    assert.throws(() => normalizeConfig({ targets: { trustedHostKeys: ['abc'] } }));
    assert.throws(() => normalizeConfig({ botBehavior: { discoveryTimeoutMs: 10 } }));
    assert.throws(() => normalizeConfig({ lanPolicy: [] }));
    assert.throws(() => normalizeConfig(null));
    const w = normalizeConfig({ lanPolicy: { scop: 'same-host' }, extra: 1, _comment: 'x' });
    assert.equal(w.warnings.length, 2);
    assert.equal(w.lanPolicy.scope, 'same-subnet');
});
test('config: BOM付きファイルも読める・存在しないと案内付きエラー', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nnc-'));
    try {
        const p = join(dir, 'config.json');
        writeFileSync(p, '﻿{"lanPolicy":{"scope":"same-host"}}');
        assert.equal(loadConfig(p).lanPolicy.scope, 'same-host');
        assert.throws(() => loadConfig(join(dir, 'none.json')), /config.example.json/);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('validateOfflineUsername: 26.30 の名前制限を見越して安全な名前だけ', () => {
    assert.equal(validateOfflineUsername('NetherBot'), null);
    assert.equal(validateOfflineUsername('Bot 01_x'), null);
    assert.notEqual(validateOfflineUsername('@a'), null);
    assert.notEqual(validateOfflineUsername('"quoted"'), null);
    assert.notEqual(validateOfflineUsername(' lead'), null);
    assert.notEqual(validateOfflineUsername('a  b'), null);
    assert.notEqual(validateOfflineUsername('x'.repeat(17)), null);
    assert.notEqual(validateOfflineUsername('§cRed'), null);
});
// ---------------------------------------------------------------- misc
test('PhaseTracker: 前進のみ・途中は通過・Failed で終端', () => {
    const t = new PhaseTracker();
    const seen = [];
    t.onTransition((e) => seen.push(`${e.to}${e.note === '(通過)' ? '*' : ''}`));
    t.advanceTo(Phase.Signaling, 'x');
    t.advanceTo(Phase.IceChecking, 'y');
    t.advanceTo(Phase.SdpExchange, 'back'); // 無視
    t.advanceTo(Phase.Failed, 'z');
    t.advanceTo(Phase.Connected, 'ignored');
    assert.deepEqual(seen, ['Signaling', 'SdpExchange*', 'IceGathering*', 'IceChecking', 'Failed']);
});
test('resolveVersion: 設定 > 広告のゲームバージョン > プロトコル番号(最新) > 既定値', () => {
    const { Versions, CURRENT_VERSION } = bpRequire('./src/options');
    const p = Versions[CURRENT_VERSION];
    assert.equal(resolveVersion(null, p, CURRENT_VERSION).version, CURRENT_VERSION);
    assert.equal(resolveVersion(null, p, CURRENT_VERSION.replace(/^1\./, '')).version, CURRENT_VERSION); // "26.51" 表記
    assert.equal(resolveVersion(null, 567, undefined).version, '1.19.62'); // 同じプロトコルなら新しい方
    assert.equal(resolveVersion(null, 567, '9.9.9').version, '1.19.62'); // 未知のゲームバージョンはプロトコルで
    assert.equal(resolveVersion(null, undefined).version, CURRENT_VERSION);
    assert.equal(resolveVersion('1.19.60', p).version, '1.19.60');
    assert.throws(() => resolveVersion(null, 999999));
    assert.throws(() => resolveVersion('0.0.1', undefined));
});
test('parseArgs: 不正な引数は UsageError', () => {
    assert.equal(parseArgs(['connect', '--host', '192.168.1.23', '--timeout', '1000', '--network-id', '0042']).networkId, '42');
    assert.throws(() => parseArgs(['connect', '--host', 'example.com']), UsageError);
    assert.throws(() => parseArgs(['connect', '--timeout', 'abc']), UsageError);
    assert.throws(() => parseArgs(['connect', '--timeout', '100']), UsageError);
    assert.throws(() => parseArgs(['connect', '--network-id', '-1']), UsageError);
    assert.throws(() => parseArgs(['connect', '--host']), UsageError);
    assert.throws(() => parseArgs(['connect', '--host', '--yes']), UsageError);
    assert.throws(() => parseArgs(['hack']), UsageError);
    assert.throws(() => parseArgs(['list', '--foo']), UsageError);
});
test('describeConnectError: コードを日本語に', () => {
    assert.match(describeConnectError('connecterror:14'), /Answer/);
    assert.match(describeConnectError(99), /99/);
});
// ---------------------------------------------------------------- evaluateWorld
const world = (x = {}) => ({
    networkId: 42n,
    address: '192.168.1.23',
    addresses: ['192.168.1.23'],
    levelName: 'A',
    motd: 'Steve',
    warnings: [],
    ...x,
});
test('evaluateWorld: targets フィルタ', () => {
    const g = new LanGuard(new LanScope(policy(), IFACES));
    assert.equal(evaluateWorld(g, NO_TARGETS, world()).allowed, true);
    assert.equal(evaluateWorld(g, { ...NO_TARGETS, levelNames: ['B'] }, world()).allowed, false);
    assert.equal(evaluateWorld(g, { ...NO_TARGETS, hostNames: ['Alex'] }, world()).allowed, false);
    assert.equal(evaluateWorld(g, { ...NO_TARGETS, networkIds: ['42'] }, world()).allowed, true);
    assert.equal(evaluateWorld(g, NO_TARGETS, world({ address: '8.8.8.8', addresses: ['8.8.8.8'] })).allowed, false);
});
test('evaluateWorld: 同じIDが別アドレスから応答したら「なりすましの可能性」で拒否（同一マシンの別アドレスは可）', () => {
    const g = new LanGuard(new LanScope(policy(), IFACES));
    const d = evaluateWorld(g, NO_TARGETS, world({ addresses: ['192.168.1.23', '192.168.1.66'] }));
    assert.equal(d.allowed, false);
    assert.match(d.reason, /なりすまし/);
    // 自分自身の 127.0.0.1 と 192.168.1.10 は同一相手扱いなので、そもそも addresses に 2 件入らない（discover側）が、
    // 仮に1件なら許可
    assert.equal(evaluateWorld(g, NO_TARGETS, world({ address: '127.0.0.1', addresses: ['127.0.0.1'] })).allowed, true);
});
test('evaluateWorld: v7 広告の認証フラグと突き合わせる', () => {
    const g = new LanGuard(new LanScope(policy(), IFACES));
    assert.equal(evaluateWorld(g, NO_TARGETS, world({ acceptsSelfSignedAuth: false }), { offline: true }).allowed, false);
    assert.equal(evaluateWorld(g, NO_TARGETS, world({ acceptsSelfSignedAuth: true }), { offline: true }).allowed, true);
    assert.equal(evaluateWorld(g, NO_TARGETS, world({ acceptsOnlineAuth: false }), { offline: false }).allowed, false);
    assert.equal(evaluateWorld(g, NO_TARGETS, world({}), { offline: true }).allowed, true); // v4: フラグ無し
});
// ---------------------------------------------------------------- host identity
function signedAnswer(tamper = false) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const h = b64u({ alg: 'ES384', typ: 'JWT' });
    const p = b64u({ cpk: jwk, exp: Math.floor(Date.now() / 1000) + 60 });
    const sig = crypto.sign('sha384', Buffer.from(`${h}.${p}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const sdp = ['v=0', 'a=fingerprint:sha-256 11:22:33', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'a=sctp-port:5000'].join('\r\n');
    let signed = nnIdentity.attachIdentity(sdp, { privateKey, token: `${h}.${p}.${sig}` });
    if (tamper)
        signed = signed.replace('11:22:33', '11:22:34');
    const digest = crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    return { sdp: signed, digest };
}
test('host identity: 署名検証と鍵ダイジェスト、改ざん検出、信頼鍵との照合', () => {
    const ok = signedAnswer();
    const id = inspectIdentity(ok.sdp);
    assert.equal(id.present, true);
    assert.equal(id.verified, true, id.reason);
    assert.equal(id.keyDigest, ok.digest);
    assert.equal(checkHostIdentity(id, [ok.digest]).allowed, true);
    assert.equal(checkHostIdentity(id, ['0'.repeat(64)]).allowed, false);
    assert.equal(checkHostIdentity(id, []).allowed, true);
    const bad = inspectIdentity(signedAnswer(true).sdp);
    assert.equal(bad.verified, false);
    assert.match(bad.reason, /フィンガープリント/);
    const none = inspectIdentity('v=0\r\na=fingerprint:sha-256 AA');
    assert.equal(none.present, false);
    assert.equal(checkHostIdentity(none, [ok.digest]).allowed, false);
    assert.equal(inspectIdentity('a=identity:!!!notbase64json').verified, false);
});
// ---------------------------------------------------------------- パッチ済み nethernet.Client
function discoveryResponse(senderId) {
    const pk = util.createPacketData('discovery_response', ser.PACKET_TYPE.DISCOVERY_RESPONSE, senderId, {
        data: Buffer.from([4, 0, 0, 0]).toString('hex'),
    });
    return util.prepareSecurePacket(ser.createSerializer(), pk);
}
function newClient(g, serverId, host = '127.0.0.1') {
    return withGuard(g, () => new NetherNet.Client(serverId, host, { webrtcBackend: 'werift' }));
}
test('受信ゲート: LAN外から届いたディスカバリ応答は復号前に破棄', () => {
    const denied = [];
    const g = new LanGuard(new LanScope(policy(), IFACES), { onDeny: (_s, d) => denied.push(d) });
    const cl = newClient(g, 777n);
    let pongs = 0;
    cl.on('pong', () => pongs++);
    cl.processPacket(discoveryResponse(777n), { address: '8.8.8.8', port: 7551 });
    cl.processPacket(discoveryResponse(777n), { address: '192.168.2.9', port: 7551 });
    assert.equal(pongs, 0);
    assert.equal(cl.addresses.size, 0);
    cl.processPacket(discoveryResponse(777n), { address: '192.168.1.23', port: 7551 });
    assert.equal(pongs, 1);
    assert.equal(cl.addresses.get(777n).address, '192.168.1.23');
    assert.equal(denied.length, 2);
    cl.close();
});
test('結び付け: 接続ごとに別ガード（pin が混線しない）・withGuard 外で作った Client は何もしない', () => {
    const scope = new LanScope(policy(), IFACES);
    const base = new LanGuard(scope);
    const g1 = base.fork({ pinAddress: '192.168.1.23' });
    const g2 = base.fork({ pinAddress: '192.168.1.24' });
    const c1 = newClient(g1, 1n);
    const c2 = newClient(g2, 1n);
    assert.equal(guardOfClient(c1), g1);
    assert.equal(guardOfClient(c2), g2);
    let p1 = 0;
    let p2 = 0;
    c1.on('pong', () => p1++);
    c2.on('pong', () => p2++);
    for (const c of [c1, c2])
        c.processPacket(discoveryResponse(1n), { address: '192.168.1.23', port: 7551 });
    assert.deepEqual([p1, p2], [1, 0]);
    const naked = new NetherNet.Client(1n, '127.0.0.1', { webrtcBackend: 'werift' });
    let p3 = 0;
    naked.on('pong', () => p3++);
    naked.processPacket(discoveryResponse(1n), { address: '127.0.0.1', port: 7551 });
    assert.equal(p3, 0);
    assert.equal(guardOfClient(naked), null);
    for (const c of [c1, c2, naked])
        c.close();
});
test('UDPソケットのエラーでプロセスが落ちず、警告になる', () => {
    const warns = [];
    const g = new LanGuard(new LanScope(policy(), IFACES), { onWarn: (_s, d) => warns.push(d) });
    const cl = newClient(g, 5n);
    const err = Object.assign(new Error('network is unreachable'), { code: 'ENETUNREACH' });
    cl.socket.emit('error', err);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /ENETUNREACH/);
    cl.close();
});
function stubRtc() {
    const rec = { remoteSdp: '', added: [] };
    return {
        rec,
        rtc: {
            setRemoteDescription: async (d) => {
                rec.remoteSdp = d.sdp;
            },
            addIceCandidate: async (c) => {
                rec.added.push(c.candidate);
            },
            close: () => { },
        },
    };
}
test('受信シグナル: CONNECTRESPONSE のSDPからLAN外候補を除去、LAN外のCANDIDATEADDは捨てる', async () => {
    const g = new LanGuard(new LanScope(policy(), IFACES));
    g.pinAddress = '192.168.1.23';
    const cl = newClient(g, 555n);
    const { rec, rtc } = stubRtc();
    cl.rtcConnection = rtc;
    const { SignalStructure, SignalType } = NetherNet;
    const answer = [
        'v=0',
        'a=candidate:1 1 udp 2113937151 192.168.1.23 50000 typ host',
        'a=candidate:2 1 udp 1677729535 198.51.100.7 50001 typ srflx raddr 192.168.1.23 rport 50000',
        'a=candidate:3 1 udp 2113937151 192.168.1.99 50002 typ host',
    ].join('\r\n');
    cl.handleSignal(new SignalStructure(SignalType.ConnectResponse, cl.connectionId, answer, 555n));
    cl.handleSignal(new SignalStructure(SignalType.CandidateAdd, cl.connectionId, 'candidate:9 1 udp 1 203.0.113.50 1234 typ host', 555n));
    cl.handleSignal(new SignalStructure(SignalType.CandidateAdd, cl.connectionId, 'candidate:8 1 udp 1 192.168.1.23 50003 typ host', 555n));
    // 別の接続ID宛て（古い試行の残り等）は何も起こさない
    cl.handleSignal(new SignalStructure(SignalType.CandidateAdd, cl.connectionId + 1n, 'candidate:7 1 udp 1 192.168.1.23 50004 typ host', 555n));
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(rec.remoteSdp.includes('192.168.1.23 50000'));
    assert.ok(!rec.remoteSdp.includes('198.51.100.7'));
    assert.ok(!rec.remoteSdp.includes('192.168.1.99'), 'pin 先以外のLANアドレスも除去');
    assert.deepEqual(rec.added, ['candidate:8 1 udp 1 192.168.1.23 50003 typ host']);
    cl.close();
});
test('ホスト鍵固定: 信頼鍵と一致しない/署名が無い Answer は WebRTC に渡さず失敗させる', async () => {
    const good = signedAnswer();
    const { SignalStructure, SignalType } = NetherNet;
    const mk = () => {
        const denied = [];
        const g = new LanGuard(new LanScope(policy(), IFACES), { onDeny: (_s, d) => denied.push(d) }, { trustedHostKeys: [good.digest] });
        const cl = newClient(g, 9n);
        const { rec, rtc } = stubRtc();
        cl.rtcConnection = rtc;
        const reason = new Promise((r) => cl.on('disconnect', (_i, why) => r(why)));
        return { cl, rec, denied, reason };
    };
    const a = mk();
    a.cl.handleSignal(new SignalStructure(SignalType.ConnectResponse, a.cl.connectionId, signedAnswer().sdp, 9n)); // 別の鍵
    assert.match(await a.reason, /^connecterror:13/);
    assert.equal(a.rec.remoteSdp, '');
    assert.ok(a.denied.some((d) => d.includes('trustedHostKeys にありません')));
    a.cl.close();
    const b = mk();
    b.cl.handleSignal(new SignalStructure(SignalType.ConnectResponse, b.cl.connectionId, 'v=0\r\na=fingerprint:sha-256 AA', 9n));
    assert.match(await b.reason, /^connecterror:13/);
    assert.ok(b.denied.some((d) => d.includes('a=identity がありません')));
    b.cl.close();
    const c = mk();
    c.cl.handleSignal(new SignalStructure(SignalType.ConnectResponse, c.cl.connectionId, good.sdp, 9n));
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(c.rec.remoteSdp.includes('a=identity:'));
    c.cl.close();
});
test('接続開始: 外部シグナリング(サービス経由)・未確認の相手には Offer を出さない', async () => {
    const denied = [];
    const g = new LanGuard(new LanScope(policy(), IFACES), { onDeny: (_s, d) => denied.push(d) });
    const a = newClient(g, 1n);
    const reasonA = new Promise((r) => a.on('disconnect', (_id, reason) => r(reason)));
    a.signalHandler = () => { }; // 外部シグナリングに切替
    a.connect();
    assert.match(await reasonA, /^connecterror:/);
    assert.ok(denied.some((d) => d.includes('外部シグナリング')));
    a.close();
    const b = newClient(g, 2n);
    const reasonB = new Promise((r) => b.on('disconnect', (_id, reason) => r(reason)));
    await b.createOffer(); // ディスカバリ応答なしで直接呼んでも拒否
    assert.match(await reasonB, /^connecterror:/);
    assert.ok(denied.some((d) => d.includes('LANディスカバリで応答を確認していない')));
    b.close();
    const n = new NetherNet.Client(3n, '127.0.0.1', { webrtcBackend: 'werift' }); // ガード無し
    const reasonN = new Promise((r) => n.on('disconnect', (_id, reason) => r(reason)));
    await n.createOffer();
    assert.match(await reasonN, /^connecterror:/);
    n.close();
});
test('config.example.json はそのまま読めて、警告も出ない', () => {
    const p = new URL('../../config.example.json', import.meta.url);
    const c = loadConfig(p.pathname);
    assert.deepEqual(c.warnings, []);
    assert.equal(c.lanPolicy.scope, 'same-subnet');
});
