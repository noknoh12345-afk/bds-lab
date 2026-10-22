import crypto from 'node:crypto';
import http from 'node:http';
import { nethernetModule } from './bp.js';
import type { LanGuard } from './guard.js';

/**
 * BDS の NetherNet HTTP シグナリング（Mojang の「NetherNet HTTP Signaling — Partner Onboarding Guide」。ラボの
 * common/nethernet.cjs と同じ約束）:
 *   GET  http://<address>:<port>/v1/join              → 2xx + サーバーの情報の JSON（NetherNet で入れる）
 *   POST http://<address>:<port>/v1/join/<こちらの ID> → 本文 = ICE を集め終えた完全な Offer（trickle なし、application/sdp）、
 *                                                       答え = Answer の SDP（断るときは 200 で番号だけ。37 = 本人確認を断った）
 * Offer には自分の a=identity が要る（cpk = ログインの鍵。無いと 37）。Answer の候補と a=identity はガードが確かめる
 * （guard.ts の handleSignal: CONNECTRESPONSE として戻すので、LAN の時と同じ検査を通る）。
 * 問い合わせはガードの子に結び付けた相手（guard.httpSignal）だけ。UDP の発見は送らない（guard.ts）。
 */

export interface HttpSignalTarget {
  address: string;
  port: number;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** a self-signed token whose cpk is the login's key (BDS in offline mode takes it; the key must be the login's, see nethernet.cjs) */
export function selfSignedToken(keyPair: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject }, name: string, now = Math.floor(Date.now() / 1000)): string {
  const x5u = keyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const h = b64u(JSON.stringify({ alg: 'ES384', typ: 'JWT', x5u }));
  const p = b64u(JSON.stringify({ cpk: x5u, xname: name, iss: 'nethernet-connect', iat: now, nbf: now - 60, exp: now + 3600 }));
  const sig = crypto.sign('sha384', Buffer.from(`${h}.${p}`), { key: keyPair.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${b64u(sig)}`;
}

/** the offer with this connection's own a=identity, when it has none yet (nethernet's own attachIdentity: the same format) */
export function withIdentity(sdp: string, keyPair: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject } | null | undefined, name: string): string {
  if (/^a=identity:/m.test(sdp) || !keyPair) return sdp;
  const { attachIdentity } = nethernetModule('src/identity');
  return attachIdentity(sdp, { privateKey: keyPair.privateKey, token: selfSignedToken(keyPair, name), domain: 'nethernet-connect' });
}

export interface HttpAnswer {
  ok: boolean;
  status: number;
  /** the answer's SDP (ok) */
  sdp?: string;
  /** a refusal's session error number (a 2xx whose body is not an SDP) */
  code?: number;
  body: string;
}

/** one HTTP request to the target (the guard has allowed it), with a deadline and an abort */
export function httpRequest(target: HttpSignalTarget, method: 'GET' | 'POST', path: string, body: string | null, timeoutMs: number, signal?: AbortSignal): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: target.address, port: target.port, path, method, agent: false, timeout: timeoutMs, ...(signal ? { signal } : {}),
      headers: body !== null ? { 'Content-Type': 'application/sdp', 'Content-Length': Buffer.byteLength(body) } : { Accept: 'application/json' },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => { data += d; if (data.length > 1024 * 1024) req.destroy(new Error('答えが大きすぎます')); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`${target.address}:${target.port}${path} から ${timeoutMs} ms 答えがありません`)));
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

/** POST the complete offer → the answer (or the refusal) */
export async function postOffer(target: HttpSignalTarget, clientNetworkId: string, offer: string, timeoutMs: number, signal?: AbortSignal): Promise<HttpAnswer> {
  const r = await httpRequest(target, 'POST', `/v1/join/${clientNetworkId}`, offer, timeoutMs, signal);
  if (r.status < 200 || r.status > 299) return { ok: false, status: r.status, body: r.body };
  if (/^v=0/m.test(r.body)) return { ok: true, status: r.status, sdp: r.body, body: r.body };
  const n = Number(r.body.trim());
  return { ok: false, status: r.status, body: r.body, ...(Number.isInteger(n) ? { code: n } : {}) };
}

/**
 * the signal handler of one nethernet Client joined by HTTP: its CONNECTREQUEST goes to POST /v1/join (the full offer, its own
 * identity added), the answer comes back as a CONNECTRESPONSE through the guarded handleSignal; CANDIDATEADD is not sent (the
 * offer has every candidate: no trickle over HTTP). Returns the handler and an abort for the request in flight
 */
export function httpSignaler(nn: any, guard: LanGuard, target: HttpSignalTarget, opts: { name: string; keyPair: () => any; timeoutMs?: number; log?: (l: string) => void }) {
  const { SignalType, SignalStructure, ErrorCode } = nethernetModule();
  const ctl = new AbortController();
  const log = opts.log ?? (() => {});
  const handler = (signal: any) => {
    if (signal.type === SignalType.CandidateAdd || signal.type === SignalType.ConnectError) return;   // (nothing to say over HTTP)
    if (signal.type !== SignalType.ConnectRequest) return;
    const offer = withIdentity(String(signal.data), opts.keyPair(), opts.name);
    const clientId = String(nn.networkId);
    guard.info('signal-out', `POST /v1/join（HTTP ${target.address}:${target.port}）`);
    postOffer(target, clientId, offer, opts.timeoutMs ?? 30_000, ctl.signal).then((a) => {
      if (nn._closed) return;
      if (!a.ok || !a.sdp) {
        const why = a.code !== undefined ? `番号 ${a.code}${a.code === 37 ? '（こちらの本人確認 a=identity を断った）' : ''}` : `HTTP ${a.status} ${a.body.slice(0, 120)}`;
        guard.info('signal-in', `CONNECTERROR HTTP の答え: ${why}`);
        log(`[http] サーバーが Offer を断りました: ${why}`);
        nn.failNegotiation(nn.serverNetworkId, a.code ?? ErrorCode.FailedToSetRemoteDescription);
        return;
      }
      // (back through the guard's handleSignal: identity, candidates — as a LAN answer is)
      nn.handleSignal(new SignalStructure(SignalType.ConnectResponse, signal.connectionId, a.sdp, nn.serverNetworkId));
    }).catch((e: Error) => {
      if (nn._closed || ctl.signal.aborted) return;
      log(`[http] シグナリングの失敗: ${e.message}`);
      nn.failNegotiation(nn.serverNetworkId, ErrorCode.SignalingFailedToSend ?? ErrorCode.FailedToCreateOffer);
    });
  };
  return { handler, abort: () => ctl.abort() };
}
