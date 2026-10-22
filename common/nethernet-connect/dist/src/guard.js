import { nethernetModule } from './bp.js';
import { normalizeAddress } from './lan-scope.js';
import { parseCandidate, sanitizeSdp } from './sdp-filter.js';
import { inspectIdentity, checkHostIdentity } from './host-identity.js';
/**
 * ★接続ガード★
 *
 * bedrock-protocol が内部で使う `nethernet` の Client クラスをプロセス全体でパッチする。
 * 各 Client インスタンスは「生成された瞬間に withGuard() で指定されていたガード」に
 * 恒久的に結び付けられ、以後そのガードの判定にだけ従う（接続ごとに独立。混線しない）。
 * withGuard() の外で生成された Client はガード無し＝何も送受信しない（フェイルクローズ）。
 *
 * パッチ後は、同一LAN外(LanScope で拒否される)の相手とは
 *   1. UDP 7551 のディスカバリ/シグナリングパケットを受け取らない・送らない
 *   2. SDP / CANDIDATEADD の候補を WebRTC に渡さない・こちらからも出さない
 *   3. STUN/TURN を一切使わない（iceServers を常に空にする）
 *   4. ICE の候補ペアを作らない・STUN応答もしない
 *   5. 万一LAN外の経路で確立したら即切断する
 * さらに trustedHostKeys 設定時は、Answer の a=identity を検証して鍵が一致する相手とだけ繋ぐ。
 */
/** bedrock-protocol が実際に使っているのと同一インスタンスの nethernet モジュール（useBedrockProtocol で渡されたもの。初めて要る時に読む） */
export const netherNet = () => nethernetModule();
const weriftBackend = () => nethernetModule('src/werift');
const SignalType = () => netherNet().SignalType;
const ErrorCode = () => netherNet().ErrorCode;
const EVENT_KEYS = ['onDeny', 'onInfo', 'onWarn', 'onRoute', 'onIceState', 'onHostIdentity'];
export class LanGuard {
    scope;
    events;
    /** これ以外の相手IPとは通信しない（接続対象を決めた後に設定） */
    pinAddress = null;
    /**
     * v3: この接続の合図は BDS の NetherNet HTTP シグナリング（http-signal.ts）。その時だけ外からの合図（signalHandler）を許し、
     * 相手はこのアドレスに固定、UDP の発見は送らない（ICE の候補と確立した経路は今までどおり確かめる）
     */
    httpSignal = null;
    trustedHostKeys;
    seen = new Set();
    deniedCount = 0;
    constructor(scope, events = {}, opts = {}) {
        this.scope = scope;
        this.events = events;
        this.trustedHostKeys = [...(opts.trustedHostKeys ?? [])];
    }
    /**
     * 1接続/1回のディスカバリ用の子ガードを作る。スコープと信頼鍵は共有、pin と拒否カウントは独立。
     * イベントは「親のハンドラ → 子に追加したハンドラ」の順に両方呼ぶ（親の events は呼び出し時に参照）。
     */
    fork(opts = {}) {
        const parent = this.events;
        const extra = opts.events ?? {};
        const merged = {};
        for (const k of EVENT_KEYS) {
            merged[k] = (...args) => {
                parent[k]?.(...args);
                extra[k]?.(...args);
            };
        }
        const child = new LanGuard(this.scope, merged, { trustedHostKeys: this.trustedHostKeys });
        child.pinAddress = 'pinAddress' in opts ? (opts.pinAddress ?? null) : this.pinAddress;
        // (an HTTP-signaled connection is its own fork's: never handed down by a fork that does not ask for it)
        if (opts.httpSignal) {
            child.httpSignal = { address: normalizeAddress(opts.httpSignal.address), port: opts.httpSignal.port };
            child.pinAddress = child.httpSignal.address;
        }
        return child;
    }
    deny(stage, detail) {
        this.deniedCount++;
        const key = `${stage}:${detail}`;
        if (this.seen.has(key))
            return; // 同じ内容は1回だけ通知
        this.seen.add(key);
        this.events.onDeny?.(stage, detail);
    }
    info(stage, detail) {
        this.events.onInfo?.(stage, detail);
    }
    warn(stage, detail) {
        const key = `warn:${stage}:${detail}`;
        if (this.seen.has(key))
            return;
        this.seen.add(key);
        this.events.onWarn?.(stage, detail);
    }
    /** 相手アドレス（ディスカバリ送信元・ICE相手）として許可されるか */
    acceptRemoteAddress(addr) {
        const d = this.scope.check(addr);
        if (!d.allowed)
            return d;
        if (this.pinAddress && this.scope.policy.pinToDiscoveryAddress && !this.scope.sameEndpoint(addr, this.pinAddress)) {
            return {
                allowed: false,
                reason: `${normalizeAddress(addr)} はディスカバリに応答したアドレス ${this.pinAddress} と異なります（pinToDiscoveryAddress=true）`,
            };
        }
        return d;
    }
    /** 相手から来た ICE 候補 */
    acceptRemoteCandidate(c) {
        if (c.transport !== 'udp')
            return { allowed: false, reason: `${c.transport} 候補は使いません(UDPのみ)` };
        if (c.type !== 'host') {
            return { allowed: false, reason: `typ ${c.type} 候補 ${c.address} はLAN外経由(STUN反射/TURN中継)のため拒否` };
        }
        return this.acceptRemoteAddress(c.address);
    }
    /** こちらから出す ICE 候補（対象と同じLANセグメントのNICのものだけ） */
    acceptLocalCandidate(c, target) {
        if (c.transport !== 'udp')
            return { allowed: false, reason: `${c.transport} 候補は出しません` };
        if (c.type !== 'host')
            return { allowed: false, reason: `typ ${c.type} 候補 ${c.address} は出しません` };
        if (!this.scope.isOwnAddress(c.address)) {
            return { allowed: false, reason: `${c.address} はこのマシンのアドレスではありません` };
        }
        if (this.scope.isOwnAddress(target))
            return { allowed: true, reason: '同一マシン' };
        // (v3: a Tailscale device of the user's: only this machine's own Tailscale address goes out — never a LAN NIC's)
        const ts = this.scope.tailscaleName(target);
        if (ts) {
            const own = this.scope.ownTailscaleAddresses();
            if (!own.includes(normalizeAddress(c.address)))
                return { allowed: false, reason: `自分の候補 ${c.address} はこのマシンの Tailscale のアドレス（${own.join(', ') || 'なし'}）ではありません（接続先は Tailscale の端末「${ts}」）` };
            return { allowed: true, reason: `Tailscale の候補（端末「${ts}」へ）` };
        }
        const iface = this.scope.interfaceFor(target);
        if (!iface || iface.address !== normalizeAddress(c.address)) {
            return { allowed: false, reason: `自分の候補 ${c.address} は接続先 ${target} と別セグメントのNICです` };
        }
        return { allowed: true, reason: `${iface.name} の候補` };
    }
}
// ---------------------------------------------------------------------------
// インスタンスへの結び付け
let pendingGuard = null;
const GUARD = Symbol('lanGuard');
/**
 * fn の実行中（同期部分）に生成された NetherNet Client を guard に結び付ける。
 * bedrock-protocol の createClient(skipPing) は内部の Client を同期的に生成するので、
 * これで包めば「その接続専用のガード」が確実に付く（呼び出し側で結果を検証すること）。
 */
export function withGuard(guard, fn) {
    installLanGuard();
    const prev = pendingGuard;
    pendingGuard = guard;
    try {
        return fn();
    }
    finally {
        pendingGuard = prev;
    }
}
/** Client に結び付いているガード（無ければ null） */
export function guardOfClient(nethernetClient) {
    return nethernetClient?.[GUARD] ?? null;
}
function guardOf(self) {
    if (!Object.prototype.hasOwnProperty.call(self, GUARD)) {
        const g = pendingGuard;
        Object.defineProperty(self, GUARD, { value: g, writable: false, enumerable: false, configurable: false });
        // UDPソケットのエラー（ネットワーク断・権限不足など）でプロセスごと落ちないようにする
        self.socket?.on?.('error', (e) => {
            g?.warn('udp', `UDPソケットのエラー: ${e.code ?? ''} ${e.message}`);
        });
    }
    return self[GUARD];
}
// (patched once per nethernet copy: useBedrockProtocol may hand over another bedrock-protocol later)
const installed = new WeakSet();
/** nethernet.Client をプロセス全体でパッチする（冪等。使う nethernet ごとに 1 回） */
export function installLanGuard() {
    const proto = netherNet().Client.prototype;
    if (installed.has(proto))
        return;
    installed.add(proto);
    // --- 1) 受信: LAN外からのUDPパケットは復号すらしない ---
    const origProcessPacket = proto.processPacket;
    proto.processPacket = function (buffer, rinfo) {
        const g = guardOf(this);
        if (!g)
            return;
        const d = g.acceptRemoteAddress(rinfo.address);
        if (!d.allowed) {
            g.deny('udp', `${rinfo.address}:${rinfo.port} からのパケットを破棄 — ${d.reason}`);
            return;
        }
        return origProcessPacket.call(this, buffer, rinfo);
    };
    // --- 2) 送信: ディスカバリ要求はLAN内の宛先にだけ ---
    const origSendDiscoveryRequest = proto.sendDiscoveryRequest;
    proto.sendDiscoveryRequest = function () {
        const g = guardOf(this); // ← コンストラクタ内の最初の呼び出しで、ここでガードが結び付く
        if (!g)
            return;
        // (v3: an HTTP-signaled connection finds nobody over UDP — its peer is the signaling server's own address)
        if (g.httpSignal)
            return;
        const d = g.scope.checkDiscoveryDestination(this.broadcastAddress);
        if (!d.allowed) {
            g.deny('discovery', `ディスカバリ要求の送信先 ${this.broadcastAddress} を拒否 — ${d.reason}`);
            return;
        }
        return origSendDiscoveryRequest.call(this);
    };
    const origSendDiscoveryMessage = proto.sendDiscoveryMessage;
    proto.sendDiscoveryMessage = function (signal) {
        const g = guardOf(this);
        if (!g || signal?.networkId == null)
            return;
        const rinfo = this.addresses.get(BigInt(signal.networkId));
        if (!rinfo)
            return;
        const d = g.acceptRemoteAddress(rinfo.address);
        if (!d.allowed) {
            g.deny('signal-out', `${rinfo.address} へのシグナリング送信を拒否 — ${d.reason}`);
            return;
        }
        return origSendDiscoveryMessage.call(this, signal);
    };
    // --- 3) 接続開始: 相手・WebRTC構成・送信シグナルを検査/固定してから本来の処理へ ---
    const origCreateOffer = proto.createOffer;
    proto.createOffer = async function () {
        const g = guardOf(this);
        const abort = (detail, code = ErrorCode().FailedToCreatePeerConnection) => {
            g?.deny('config', detail);
            this.failNegotiation(this.serverNetworkId, code);
        };
        if (!g)
            return abort('ガード未設定のため接続しません');
        let rinfo;
        if (this._externalSignaling) {
            // (v3: the one outside signaling allowed — this connection's own HTTP signaler, to the address its guard fork names)
            if (!g.httpSignal || !this._signalHandler?.__ncHttpSignal) {
                return abort('外部シグナリング(Xbox/Realms等のサービス経由)はLAN外になり得るため使いません');
            }
            rinfo = { address: g.httpSignal.address, port: g.httpSignal.port };
        }
        else {
            rinfo = this.addresses.get(BigInt(this.serverNetworkId));
            if (!rinfo)
                return abort('LANディスカバリで応答を確認していない相手には接続しません');
        }
        const d = g.acceptRemoteAddress(rinfo.address);
        if (!d.allowed)
            return abort(`接続先 ${rinfo.address} を拒否 — ${d.reason}`);
        // STUN/TURN は使わない（LAN外のサーバーへ問い合わせない・中継しない）
        this.credentials = [];
        if (!this.webrtc?.__lanGuarded) {
            if (this.webrtc !== weriftBackend()) {
                return abort('werift 以外の WebRTC バックエンドは候補を制御できないため使いません');
            }
            this.webrtc = makeGuardedBackend(g, rinfo.address);
        }
        if (!this._signalHandler?.__lanGuarded) {
            this._signalHandler = wrapOutgoing(g, this._signalHandler, rinfo.address, this);
        }
        g.info('config', `接続先 ${rinfo.address}:${rinfo.port} を許可 — ${d.reason}`);
        return origCreateOffer.call(this);
    };
    // --- 4) 受信シグナル: 答えのSDP・候補からLAN外アドレスを除去、ホスト鍵を検査 ---
    const origHandleSignal = proto.handleSignal;
    proto.handleSignal = function (signal) {
        const g = guardOf(this);
        if (!g)
            return;
        // 別の接続ID・別の相手宛てのシグナルは、検査やエラー処理の前に捨てる（本来の処理でも無視される）
        if (typeof this.isExpectedSignal === 'function' && !this.isExpectedSignal(signal))
            return;
        if (signal.type === SignalType().ConnectResponse) {
            const sdp = String(signal.data);
            const id = inspectIdentity(sdp);
            g.events.onHostIdentity?.(id);
            const trust = checkHostIdentity(id, g.trustedHostKeys);
            if (!trust.allowed) {
                g.deny('identity', trust.reason);
                this.failNegotiation(this.serverNetworkId, ErrorCode().FailedToSetRemoteDescription);
                return;
            }
            if (g.trustedHostKeys.length)
                g.info('identity', trust.reason);
            const r = sanitizeSdp(sdp, (c) => g.acceptRemoteCandidate(c));
            for (const x of r.dropped)
                g.deny('signal-in', `相手SDPの候補を除去: ${x.line.slice(0, 90)} — ${x.reason}`);
            signal.data = r.sdp;
            g.info('signal-in', `CONNECTRESPONSE 受信（SDP内の有効候補 ${r.kept.length} 件）`);
        }
        else if (signal.type === SignalType().CandidateAdd) {
            const c = parseCandidate(String(signal.data));
            const d = c ? g.acceptRemoteCandidate(c) : { allowed: false, reason: '候補の形式が不正' };
            if (!d.allowed) {
                g.deny('signal-in', `相手の候補を破棄: ${String(signal.data).slice(0, 90)} — ${d.reason}`);
                return;
            }
            g.info('signal-in', `相手の候補を受理: ${c.address}:${c.port} (${c.type})`);
        }
        else if (signal.type === SignalType().ConnectError) {
            g.info('signal-in', `CONNECTERROR ${signal.data} を受信（${describeConnectError(signal.data)}）`);
        }
        return origHandleSignal.call(this, signal);
    };
}
function wrapOutgoing(g, send, target, client) {
    const fn = (signal) => {
        if (signal.type === SignalType().ConnectRequest) {
            const r = sanitizeSdp(String(signal.data), (c) => g.acceptLocalCandidate(c, target));
            for (const x of r.dropped)
                g.deny('signal-out', `自分のSDPから候補を除去: ${x.line.slice(0, 90)} — ${x.reason}`);
            // werift は候補を集め終えてから Offer を作るので、ここで 0 件なら LAN 内で使える経路が無い。
            // 相手のタイムアウト(15秒)を待たずに、理由を示して即中止する。
            if (r.kept.length === 0) {
                g.deny('signal-out', `接続先 ${target} と同じLANで使える自分のアドレスがありません（NIC/スコープ設定を確認してください）`);
                client.failNegotiation(client.serverNetworkId, ErrorCode().FailedToCreateOffer);
                return;
            }
            signal.data = r.sdp;
            g.info('signal-out', `CONNECTREQUEST 送信（SDP内の候補 ${r.kept.length} 件）`);
        }
        else if (signal.type === SignalType().CandidateAdd) {
            const c = parseCandidate(String(signal.data));
            const d = c ? g.acceptLocalCandidate(c, target) : { allowed: false, reason: '候補の形式が不正' };
            if (!d.allowed) {
                g.deny('signal-out', `自分の候補を送信しません: ${String(signal.data).slice(0, 90)} — ${d.reason}`);
                return;
            }
        }
        return send(signal);
    };
    fn.__lanGuarded = true;
    // (the HTTP signaler stays known as such once wrapped: a second offer on the same client is still allowed)
    if (send?.__ncHttpSignal)
        fn.__ncHttpSignal = true;
    return fn;
}
/** werift の RTCPeerConnection を、LAN専用の ICE 設定に固定したものへ差し替える（テストからも使う） */
export function makeGuardedBackend(g, target) {
    const Base = weriftBackend().RTCPeerConnection;
    // (bound to the NIC on the target's own segment; a Tailscale device of the user's: to this machine's Tailscale address)
    const tsOwn = g.scope.tailscaleName(target) ? g.scope.ownTailscaleAddresses()[0] : undefined;
    const bindIface = g.scope.isOwnAddress(target) ? undefined : tsOwn ? { address: tsOwn } : g.scope.interfaceFor(target);
    class LanOnlyPeerConnection extends Base {
        constructor(config = {}) {
            super({
                ...config,
                iceServers: [],
                iceTransportPolicy: 'all',
                iceUseIpv4: true,
                iceUseIpv6: false,
                iceUseTcp: false,
                iceUseLinkLocalAddress: false,
                iceAdditionalHostAddresses: [],
                // 接続先と同じセグメントのNICにだけバインドする（他NICからは候補を出さない）
                iceInterfaceAddresses: bindIface ? { udp4: bindIface.address } : undefined,
                iceFilterStunResponse: (_msg, addr) => {
                    const d = g.acceptRemoteAddress(addr[0]);
                    if (!d.allowed)
                        g.deny('ice', `${addr[0]}:${addr[1]} からのSTUN要求に応答しません — ${d.reason}`);
                    return d.allowed;
                },
                iceFilterCandidatePair: (pair) => {
                    const host = pair?.remoteCandidate?.host ?? '';
                    const d = g.acceptRemoteAddress(host);
                    if (!d.allowed)
                        g.deny('ice', `候補ペア(相手 ${host})を作りません — ${d.reason}`);
                    return d.allowed;
                },
            });
            const self = this;
            self.iceConnectionStateChange?.subscribe?.((s) => g.events.onIceState?.(`ice:${s}`));
            self.connectionStateChange?.subscribe?.((s) => {
                g.events.onIceState?.(`pc:${s}`);
                if (s !== 'connected')
                    return;
                const pair = self.iceTransports?.[0]?.connection?.nominated;
                const remote = pair?.remoteAddr?.[0] ?? pair?.remoteCandidate?.host;
                const remotePort = pair?.remoteAddr?.[1] ?? pair?.remoteCandidate?.port;
                const local = pair?.localCandidate ? `${pair.localCandidate.host}:${pair.localCandidate.port}` : '(不明)';
                const d = remote ? g.acceptRemoteAddress(remote) : { allowed: false, reason: '確立経路を確認できません' };
                if (!d.allowed) {
                    g.deny('route', `LAN外の経路で確立したため切断 — ${d.reason}`);
                    self.close();
                    return;
                }
                g.events.onRoute?.(local, `${remote}:${remotePort}`);
            });
        }
    }
    return { ...weriftBackend(), resolveIceServers: undefined, RTCPeerConnection: LanOnlyPeerConnection, __lanGuarded: true };
}
// ---------------------------------------------------------------------------
const ERROR_NAMES_JA = {
    1: '相手がサインインしていない',
    2: 'ネゴシエーションのタイムアウト',
    3: 'トランスポートのバージョン不一致',
    4: 'PeerConnection を作れない',
    5: 'ICE 失敗（LAN内で疎通する経路が無い）',
    6: 'CONNECTREQUEST の処理失敗',
    7: 'CONNECTRESPONSE の処理失敗',
    8: 'CANDIDATEADD の処理失敗',
    9: '確立待ちのタイムアウト（ICE/DTLS が完了しない）',
    10: 'Offer の作成失敗（LAN内で使える自分のアドレスが無い場合を含む）',
    11: 'Answer の作成失敗',
    12: 'ローカルSDPの設定失敗',
    13: 'リモートSDPの設定失敗（またはホスト鍵の不一致）',
    14: '応答待ちのタイムアウト（相手が Answer を返さない）',
    15: '受理待ちのタイムアウト',
    16: '相手が接続を無視した',
    37: '相手が本人確認(a=identity)を受け付けない',
};
/** "connecterror:14" や "14" を日本語の説明にする */
export function describeConnectError(v) {
    const m = String(v ?? '').match(/(\d+)/);
    if (!m)
        return String(v ?? '');
    return ERROR_NAMES_JA[Number(m[1])] ?? `エラーコード ${m[1]}`;
}
