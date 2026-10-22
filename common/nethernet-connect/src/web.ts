import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LanScope, normalizeAddress } from './lan-scope.js';
import { LanGuard } from './guard.js';
import { discoverEndpoints } from './discovery.js';
import { connectToEndpoint, type EndpointConnection } from './connect.js';
import { AccountStore, SnapshotStore } from './stores.js';
import { loadTailscale } from './tailscale.js';
import type { Config, Endpoint, TailscaleInfo, TransportKind } from './types.js';

export interface WebHandle {
  /** 開く URL（#t=<token> つき） */
  urls: string[];
  token: string;
  close(): Promise<void>;
}

/** what startWeb uses (a test hands in its own) */
export interface WebDeps {
  discoverEndpoints: typeof discoverEndpoints;
  connectToEndpoint: typeof connectToEndpoint;
  AccountStore: new (folder: string) => Pick<AccountStore, 'list' | 'add' | 'remove'>;
  SnapshotStore: new (dir: string) => Pick<SnapshotStore, 'take' | 'list' | 'restore' | 'remove'>;
  loadTailscale: typeof loadTailscale;
  /** web/index.html と web/app.js のある所（既定: このファイルから ../../web） */
  webDir: string;
}

interface Session {
  id: string;
  endpointId: string;
  title: string;
  transport: TransportKind;
  account: string | null;
  observe: boolean;
  allowChat: boolean;
  state: 'connecting' | 'connected' | 'closed';
  phase: string;
  log: string[];
  outcome?: string;
  snapshotId?: string;
  createdAt: number;
  conn?: EndpointConnection;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 64 * 1024;
const NAME = /^[A-Za-z0-9_-]{1,32}$/;
const SNAP_ID = /^[\w-]{1,80}$/;
/** JSON for the page: bigint (NetherNet IDs) as text, the connection object left out */
const toJson = (v: unknown) => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : k === 'conn' ? undefined : x));
const sameToken = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }

/**
 * 自分のネットワークのダッシュボード（web/index.html・web/app.js）と、その API（/api/state・/api/events（SSE）・
 * /api/discover・/api/join・/api/sessions/*・/api/snapshots・/api/accounts）。X-NC-Token（SSE は ?t=）が合わない要求は 401。
 * bind = lan なら許可した LAN と自分の Tailscale のアドレスで、localhost ならこのマシンからだけ待ち受ける。
 * deps はテスト用（既定はこのパッケージの discoverEndpoints・connectToEndpoint・AccountStore・SnapshotStore・loadTailscale）
 */
export async function startWeb(config: Config, opts: { port?: number; deps?: Partial<WebDeps> } = {}): Promise<WebHandle> {
  const deps: WebDeps = { discoverEndpoints, connectToEndpoint, AccountStore, SnapshotStore, loadTailscale, webDir: path.resolve(HERE, '..', '..', 'web'), ...(opts.deps ?? {}) };
  const token = config.web.token ?? crypto.randomBytes(18).toString('base64url');
  const ts: TailscaleInfo | null = await deps.loadTailscale(config.lanPolicy.tailscale);
  const scope = new LanScope(config.lanPolicy, undefined, ts);
  const notes: string[] = [];
  const sse = new Set<http.ServerResponse>();
  const send = (event: string, data: unknown) => { const msg = `event: ${event}\ndata: ${toJson(data)}\n\n`; for (const r of sse) r.write(msg); };
  const note = (line: string) => { const l = `${new Date().toLocaleTimeString()} ${line}`; notes.push(l); if (notes.length > 100) notes.shift(); send('note', { line: l }); };
  const guard = new LanGuard(scope, { onDeny: (s, d) => note(`[guard:拒否] ${s}: ${d}`) }, { trustedHostKeys: config.targets.trustedHostKeys });
  const accounts = new deps.AccountStore(config.auth.profilesFolder);
  const snaps = new deps.SnapshotStore(config.restore.store);
  let endpoints: Endpoint[] = [], discovering = false, lastDiscovery: number | null = null;
  const sessions = new Map<string, Session>();

  const publicSession = (s: Session) => { const { conn, ...rest } = s; void conn; return rest; };
  const state = () => {
    const acc = (() => { try { return accounts.list(); } catch { return []; } })();
    return {
      scope: scope.describe(),
      tailscale: ts
        ? { enabled: true, mode: ts.mode, self: ts.self, peers: ts.devices.map((d) => ({ ...d, allowed: d.addresses.some((a) => ts.allowed.has(a)) })), reason: '' }
        : { enabled: false, peers: [], reason: config.lanPolicy.tailscale.mode === 'off' ? 'lanPolicy.tailscale.mode = off' : 'tailscale のコマンドが無いか、ログインしていません' },
      offline: config.auth.offline,
      offlineName: config.auth.username,
      endpoints,
      discovering,
      lastDiscovery,
      sessions: [...sessions.values()].map(publicSession),
      restoreTargets: config.restore.targets,
      snapshots: (() => { try { return snaps.list().map((m) => ({ id: m.id, kind: m.kind, label: m.label, source: m.source, created: m.takenAt, files: m.files.length, bytes: m.bytes })); } catch { return []; } })(),
      accounts: acc.map((a) => ({ name: a.name, gamertag: a.gamertag ?? null, xuid: a.xuid ?? null, addedAt: a.addedAt ?? null })),
      defaultAccount: config.auth.account ?? acc[0]?.name ?? null,
      defaultObserve: config.session.observe,
      allowChat: config.session.allowChat,
      log: notes,
    };
  };
  const pushState = () => send('state', state());
  const pushSession = (s: Session) => send('session', publicSession(s));

  // ---- the actions
  const discover = async () => {
    if (discovering) return;
    discovering = true; pushState();
    try { endpoints = await deps.discoverEndpoints(guard, config, { timeoutMs: config.botBehavior.discoveryTimeoutMs }); }
    catch (e) { note(`[error] 探せませんでした: ${(e as Error).message}`); }
    finally { discovering = false; lastDiscovery = Date.now(); pushState(); }
  };

  const join = (b: any): Session => {
    const ep = endpoints.find((e) => e.id === String(b?.endpointId ?? ''));
    if (!ep) throw new HttpError(404, '相手が見つかりません（もう一度「探す」）');
    const transport = (b?.transport ?? ep.preferred) as TransportKind;
    if (!['lan', 'http', 'raknet'].includes(transport)) throw new HttpError(400, `入り方 ${JSON.stringify(transport)} はありません`);
    const account = b?.account === undefined || b?.account === null || b?.account === '' ? null : String(b.account);
    if (account !== null && !NAME.test(account)) throw new HttpError(400, 'アカウント名が不正です');
    const observe = b?.observe === undefined ? (config.session.observe === 'on' || (config.session.observe === 'auto' && ep.kind === 'world')) : !!b.observe;
    const allowChat = b?.allowChat === undefined ? config.session.allowChat : !!b.allowChat;
    const s: Session = {
      id: crypto.randomBytes(6).toString('hex'), endpointId: ep.id, title: ep.kind === 'world' ? ep.levelName || ep.motd : ep.motd || ep.levelName,
      // (who joins, as connectToEndpoint decides it: the account asked for, else offline, else the configured / first one)
      transport, account: account ?? (config.auth.offline ? null : config.auth.account ?? (() => { try { return accounts.list()[0]?.name ?? null; } catch { return null; } })()),
      observe, allowChat, state: 'connecting', phase: 'Idle', log: [], createdAt: Date.now(),
    };
    const log = (line: string) => { const l = String(line); s.log.push(l); if (s.log.length > 300) s.log.shift(); send('log', { id: s.id, line: l }); };
    if (b?.snapshotTarget) {
      const t = config.restore.targets.find((x) => x.name === String(b.snapshotTarget));
      if (!t) throw new HttpError(400, `restore.targets に「${String(b.snapshotTarget)}」はありません`);
      const m = snaps.take(t.kind, t.path, t.name);
      s.snapshotId = m.id;
      log(`[snapshot] ${t.name} を取っておきました（${m.id}、${m.files.length} ファイル）`);
    }
    let conn: EndpointConnection;
    try {
      conn = deps.connectToEndpoint(config, guard, ep, { transport, account, observe, allowChat, log });
    } catch (e) { throw new HttpError(400, (e as Error).message); }
    s.conn = conn;
    sessions.set(s.id, s);
    conn.tracker?.onTransition?.((ev: any) => { s.phase = ev.to; pushSession(s); });
    const up = () => { if (s.state !== 'closed') { s.state = 'connected'; pushSession(s); } };
    conn.client?.once?.('join', up);
    conn.client?.once?.('spawn', up);
    Promise.resolve(conn.done).then((o: any) => { s.state = 'closed'; s.outcome = o?.reason ?? '切断'; pushSession(s); }, (e: Error) => { s.state = 'closed'; s.outcome = e.message; pushSession(s); });
    pushSession(s);
    return s;
  };

  const sessionOf = (id: string) => { const s = sessions.get(id); if (!s) throw new HttpError(404, 'そのセッションはありません'); return s; };

  // ---- the requests
  const readBody = (req: http.IncomingMessage): Promise<any> => new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, '要求が大きすぎます')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON ではありません')); } });
    req.on('error', reject);
  });
  const reply = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(toJson(body));
  };
  const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
  const staticFile = (res: http.ServerResponse, file: string, type: string) => {
    let body: Buffer;
    try { body = fs.readFileSync(path.join(deps.webDir, file)); } catch { res.writeHead(404, SECURITY); res.end('not found'); return; }
    res.writeHead(200, { ...SECURITY, 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(body);
  };

  const handle = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    // (only from this machine, the allowed LAN and the user's own Tailscale devices — what the guard allows)
    const from = normalizeAddress(req.socket.remoteAddress ?? '');
    if (!scope.check(from).allowed) { res.writeHead(403, SECURITY); res.end('forbidden'); return; }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname, m = req.method ?? 'GET';
    if (m === 'GET' && (p === '/' || p === '/index.html')) return staticFile(res, 'index.html', 'text/html; charset=utf-8');
    if (m === 'GET' && p === '/app.js') return staticFile(res, 'app.js', 'text/javascript; charset=utf-8');
    if (!p.startsWith('/api/')) { res.writeHead(404, SECURITY); res.end('not found'); return; }
    // (the token: the header, or ?t= for the event stream only — EventSource sends no header)
    const given = p === '/api/events' ? url.searchParams.get('t') ?? '' : String(req.headers['x-nc-token'] ?? '');
    if (!given || !sameToken(given, token)) return reply(res, 401, { error: 'トークンが違います（開いた URL の #t=… のトークンを入れてください）' });
    try {
      if (m === 'GET' && p === '/api/state') return reply(res, 200, state());
      if (m === 'GET' && p === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
        res.write(`event: state\ndata: ${toJson(state())}\n\n`);
        sse.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
        req.on('close', () => { clearInterval(ping); sse.delete(res); });
        return;
      }
      if (m === 'POST' && p === '/api/discover') { void discover(); return reply(res, 202, { started: true }); }
      if (m === 'POST' && p === '/api/join') { const s = join(await readBody(req)); return reply(res, 200, { id: s.id }); }
      let r = /^\/api\/sessions\/([0-9a-f]{12})\/(chat|leave)$/.exec(p);
      if (r && m === 'POST') {
        const s = sessionOf(r[1]);
        if (r[2] === 'leave') { try { s.conn?.client?.close?.(); } catch { /* gone */ } return reply(res, 200, { ok: true }); }
        const b = await readBody(req), text = String(b?.text ?? '').trim();
        if (!text) throw new HttpError(400, 'チャットの文がありません');
        if (text.length > 256) throw new HttpError(400, 'チャットは 256 文字まで');
        if (s.state === 'closed') throw new HttpError(409, 'もう切断しています');
        if (s.observe && !s.allowChat) throw new HttpError(400, '観戦モード（チャット不可）です');
        if (text.startsWith('/')) throw new HttpError(400, 'コマンドは送りません（チャットだけ）');
        const client = s.conn?.client;
        client.queue('text', { needs_translation: false, category: 'authored', type: 'chat', source_name: client.username ?? '', message: text, xuid: '', platform_chat_id: '', has_filtered_message: false });
        s.log.push(`[chat] (送信) ${text}`); send('log', { id: s.id, line: `[chat] (送信) ${text}` });
        return reply(res, 200, { ok: true });
      }
      r = /^\/api\/sessions\/([0-9a-f]{12})$/.exec(p);
      if (r && m === 'DELETE') {
        const s = sessionOf(r[1]);
        if (s.state !== 'closed') throw new HttpError(409, '切断してから消してください');
        sessions.delete(s.id); pushState();
        return reply(res, 200, { ok: true });
      }
      if (m === 'POST' && p === '/api/snapshots') {
        const b = await readBody(req), t = config.restore.targets.find((x) => x.name === String(b?.target ?? ''));
        if (!t) throw new HttpError(400, `restore.targets に「${String(b?.target ?? '')}」はありません`);
        const meta = snaps.take(t.kind, t.path, t.name);
        note(`[snapshot] ${t.name} を取っておきました（${meta.id}、${meta.files.length} ファイル）`); pushState();
        return reply(res, 200, { id: meta.id });
      }
      r = /^\/api\/snapshots\/([^/]+)(\/restore)?$/.exec(p);
      if (r) {
        const id = decodeURIComponent(r[1]);
        if (!SNAP_ID.test(id)) throw new HttpError(400, 'スナップショットの id が不正です');
        if (r[2] && m === 'POST') {
          const b = await readBody(req);
          let out;
          try { out = await snaps.restore(id, { force: b?.force === true }); } catch (e) { throw new HttpError(400, (e as Error).message); }
          note(`[snapshot] ${id} に戻しました（${out.restored} ファイル、戻す前は ${out.backup.id}）`); pushState();
          return reply(res, 200, { restored: out.restored, backup: out.backup.id });
        }
        if (!r[2] && m === 'DELETE') { if (!snaps.remove(id)) throw new HttpError(404, 'そのスナップショットはありません'); pushState(); return reply(res, 200, { ok: true }); }
      }
      if (m === 'POST' && p === '/api/accounts') {
        const name = String((await readBody(req))?.name ?? '');
        if (!NAME.test(name)) throw new HttpError(400, 'アカウント名は英数字・_・- の 1〜32 文字です');
        accounts.add(name, (c) => { send('auth', { name, ...c }); note(`[account] ${name}: ${c.verification_uri} でコード ${c.user_code}`); })
          .then((a) => { note(`[account] ${a.name} をサインインしました${a.gamertag ? `（${a.gamertag}）` : ''}`); pushState(); })
          .catch((e) => note(`[error] ${name} のサインインに失敗: ${(e as Error).message}`));
        return reply(res, 202, { started: true });
      }
      r = /^\/api\/accounts\/([^/]+)$/.exec(p);
      if (r && m === 'DELETE') {
        const name = decodeURIComponent(r[1]);
        if (!NAME.test(name)) throw new HttpError(400, 'アカウント名が不正です');
        if (!accounts.remove(name)) throw new HttpError(404, `${name} は登録されていません`);
        pushState();
        return reply(res, 200, { ok: true });
      }
      return reply(res, 404, { error: 'ありません' });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      return reply(res, status, { error: (e as Error).message });
    }
  };

  // ---- where it listens: this machine only, or also the allowed LAN NICs and this machine's own Tailscale addresses
  const binds = config.web.bind === 'localhost'
    ? ['127.0.0.1']
    : [...new Set(['127.0.0.1', ...scope.eligibleInterfaces().map((i) => i.address), ...scope.ownTailscaleAddresses()])];
  const servers: http.Server[] = [];
  let port = opts.port ?? config.web.port;
  const listen = (address: string, p: number) => new Promise<http.Server>((resolve, reject) => {
    const s = http.createServer((req, res) => { handle(req, res).catch((e) => { try { reply(res, 500, { error: (e as Error).message }); } catch { /* gone */ } }); });
    s.once('error', reject);
    s.listen(p, address, () => { s.off('error', reject); resolve(s); });
  });
  try {
    for (const a of binds) {
      const s = await listen(a, port);
      if (!port) port = (s.address() as { port: number }).port;   // (port 0: the first one's, for every address)
      servers.push(s);
    }
  } catch (e) {
    for (const s of servers) s.close();
    throw new Error(`Web を待ち受けられません（${binds.join(', ')}:${port}）: ${(e as Error).message}`);
  }
  const urls = binds.map((a) => `http://${a}:${port}/#t=${token}`);
  return {
    urls,
    token,
    close: async () => {
      for (const r of sse) { try { r.end(); } catch { /* gone */ } }
      sse.clear();
      for (const s of sessions.values()) { try { if (s.state !== 'closed') s.conn?.client?.close?.(); } catch { /* gone */ } }
      await Promise.all(servers.map((s) => new Promise<void>((resolve) => { s.close(() => resolve()); s.closeAllConnections?.(); })));
    },
  };
}
