// GeoUI Web — the game's own WebSocket (/connect): the link from a player's game to the service in worlds with no
// @minecraft/server-net (a world on a phone, a PC, a Realm, any server — only BDS has that module). The player types
//   /connect <this machine>:8787          (or /wsserver; the address the game reaches this service by)
// and the game opens a WebSocket to the service (the Minecraft WebSocket protocol: JSON messages — a command the service sends
// runs as that player, its output comes back; events the service subscribes to come in), encrypted when the game asks for it
// (the subprotocol com.microsoft.minecraft.wsencrypt: ECDH P-384, AES-256-CFB8 — the game's "Require Encrypted Websockets").
//
// The bridge: the pack's script (runtime.js, the 'ws' build) has no HTTP of its own, so it puts each request to the service in an
// outbox; the service runs a command as the player, `/web:pump <data>`, again and again: <data> carries the answers to the earlier
// requests (and, the first time, the address the game reached us by: the pictures are fetched there); the command's output is the
// outbox. Each request is then made to this service itself, as if from this machine, its pictures' address the one the game used.
//   pump data   base64url of JSON { h?: { base, v }, r?: [[id, status, json] …], c?: [text …] } — split as '<seq>:<i>/<n>:<part>'
//               when longer than PUMP_MAX characters
//   output      JSON { o: [[id, method, path, body] …], m?: 1 (more waiting) }
// The game allows 100 commands without an answer: one pump at a time, a new one as soon as the last is answered and there is
// something to send, else every idleMs.
//
//   import { attachMcws } from './mcws.mjs'
//   attachMcws(httpServer, { port, log, cmd: 'web' })   → { links, close() }   (server.mjs does it)
import crypto from 'node:crypto';

export const SUBPROTOCOL = 'com.microsoft.minecraft.wsencrypt';
export const PUMP_MAX = 1800;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rawB64 = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '');

// ---- WebSocket frames (RFC 6455): the few pieces a server (and the tests' client) needs ----------------------------------
/** one frame: fin, opcode, payload; mask (a client's frames are masked) */
export function encodeFrame(opcode, payload, mask = false, fin = true) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
  const len = data.length, head = [(fin ? 0x80 : 0) | (opcode & 0x0f)];
  const m = mask ? 0x80 : 0;
  if (len < 126) head.push(m | len);
  else if (len < 65536) head.push(m | 126, (len >> 8) & 255, len & 255);
  else { head.push(m | 127, 0, 0, 0, 0); head.push((len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255); }
  if (!mask) return Buffer.concat([Buffer.from(head), data]);
  const key = crypto.randomBytes(4), out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) out[i] = data[i] ^ key[i & 3];
  return Buffer.concat([Buffer.from(head), key, out]);
}
/** a stream of bytes → frames: push(chunk) returns the frames now complete [{ fin, opcode, payload }] */
export function frameReader() {
  let buf = Buffer.alloc(0);
  return {
    push(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const out = [];
      for (;;) {
        if (buf.length < 2) break;
        const b0 = buf[0], b1 = buf[1], masked = !!(b1 & 0x80);
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (len > 16 * 1024 * 1024) throw new Error('frame too big');
        const need = off + (masked ? 4 : 0) + len;
        if (buf.length < need) break;
        let payload = buf.subarray(off + (masked ? 4 : 0), need);
        if (masked) { const key = buf.subarray(off, off + 4), p = Buffer.alloc(len); for (let i = 0; i < len; i++) p[i] = payload[i] ^ key[i & 3]; payload = p; } else payload = Buffer.from(payload);
        out.push({ fin: !!(b0 & 0x80), opcode: b0 & 0x0f, payload });
        buf = buf.subarray(need);
      }
      return out;
    },
  };
}
/** the server's answer to a WebSocket upgrade: the accept key (and the subprotocol it takes) */
export const acceptKey = (key) => crypto.createHash('sha1').update(String(key) + GUID).digest('base64');

// ---- the game's encryption: ECDH on P-384, the key SHA-256(salt + the shared x), AES-256-CFB8 with the key's first 16 bytes as
//      the IV, one stream each way across every message (as mcwss, the Go library the game is known to talk to)
export function newKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  return { privateKey, publicKey, der: publicKey.export({ format: 'der', type: 'spki' }) };
}
/** the AES key from our private key, the other side's public key (SPKI DER, base64) and the salt; the shared x without its
 *  leading zero bytes (Go's big.Int.Bytes(), as mcwss) */
export function sessionKey(privateKey, otherB64, salt) {
  const pub = crypto.createPublicKey({ key: Buffer.from(String(otherB64), 'base64'), format: 'der', type: 'spki' });
  let x = crypto.diffieHellman({ privateKey, publicKey: pub });
  let i = 0; while (i < x.length - 1 && x[i] === 0) i++;
  x = x.subarray(i);
  return crypto.createHash('sha256').update(Buffer.concat([salt, x])).digest();
}
export function cipherPair(key) {
  const iv = key.subarray(0, 16);
  return { enc: crypto.createCipheriv('aes-256-cfb8', key, iv), dec: crypto.createDecipheriv('aes-256-cfb8', key, iv) };
}
/** the command that asks the game to encrypt: our public key and the salt, base64 without padding */
export const enableEncryptionCommand = (der, salt) => `enableencryption "${rawB64(der)}" "${rawB64(salt)}"`;

// ---- the Minecraft WebSocket messages
export const commandRequest = (id, commandLine) => ({ header: { version: 1, requestId: id, messagePurpose: 'commandRequest', messageType: 'commandRequest' },
  body: { version: 1, commandLine, origin: { type: 'player' } } });
export const subscribeRequest = (id, eventName) => ({ header: { version: 1, requestId: id, messagePurpose: 'subscribe', messageType: 'commandRequest' }, body: { eventName } });

/** pump data → the command lines that carry it (split when long): ['web:pump "<b64>"'] or ['web:pump "<seq>:<i>/<n>:<part>"' …] */
export function pumpLines(cmd, obj, seq, max = PUMP_MAX) {
  const d = b64url(JSON.stringify(obj));
  if (d.length <= max) return [`${cmd}:pump "${d}"`];
  const n = Math.ceil(d.length / max), out = [];
  for (let i = 0; i < n; i++) out.push(`${cmd}:pump "${seq}:${i + 1}/${n}:${d.slice(i * max, (i + 1) * max)}"`);
  return out;
}
/** the script's answer out of a command's output (its statusMessage, or the body itself): { o, m } or null */
export function parseOutput(body) {
  const s = body && typeof body.statusMessage === 'string' ? body.statusMessage : typeof body === 'string' ? body : '';
  const i = s.indexOf('{');
  if (i < 0) return null;
  try { const j = JSON.parse(s.slice(i)); return j && typeof j === 'object' ? j : null; } catch { return null; }
}

/** WebSocket for the game on an http.Server: links (one a connection: a player's game) */
export function attachMcws(server, o = {}) {
  const opt = Object.assign({ cmd: 'web', idleMs: 100, log: () => {}, port: 8787, fetchImpl: globalThis.fetch, version: '1' }, o);
  const links = new Set();
  server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const protos = String(req.headers['sec-websocket-protocol'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const encrypt = protos.includes(SUBPROTOCOL);
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptKey(key)}`, ...(encrypt ? [`Sec-WebSocket-Protocol: ${SUBPROTOCOL}`] : []), '', ''].join('\r\n'));
    socket.setNoDelay(true);
    const host = String(req.headers.host || `127.0.0.1:${opt.port}`).replace(/[^\w.:[\]-]/g, '');
    const link = makeLink(socket, { encrypt, base: `http://${host}`, remote: socket.remoteAddress, opt });
    links.add(link);
    socket.on('close', () => { links.delete(link); link.closed = true; clearInterval(link.timer); opt.log(`GeoUI Web: WebSocket が切れました（${link.remote}）`); });
    socket.on('error', () => {});
    if (head && head.length) link.onData(head);
    socket.on('data', (c) => link.onData(c));
    link.start();
  });
  return { links, close() { for (const l of links) { try { l.socket.destroy(); } catch { /* gone */ } } } };
}

function makeLink(socket, { encrypt, base, remote, opt }) {
  const reader = frameReader(), pending = new Map(), answers = [], chats = [];
  let cipher = null, frag = [], seq = 0, pumping = false, lastPump = 0, more = false, hello = false, waitingKey = null, linked = false;
  const L = { socket, base, remote, encrypt, closed: false, timer: null, player: '', pumps: 0, requests: 0 };
  const sendRaw = (buf) => { if (L.closed) return; socket.write(encodeFrame(1, buf)); };
  const send = (obj) => { const json = Buffer.from(JSON.stringify(obj)); sendRaw(cipher ? cipher.enc.update(json) : json); };
  /** a command as the player; done(body) with its answer (statusCode, statusMessage …) */
  const command = (line, done) => { const id = crypto.randomUUID(); pending.set(id, done || (() => {})); send(commandRequest(id, line)); };
  L.command = command;
  function onMessage(buf) {
    const raw = cipher ? cipher.dec.update(buf) : buf;
    let j; try { j = JSON.parse(raw.toString('utf8')); } catch { return; }
    const h = j.header || {}, b = j.body || {};
    if (h.messagePurpose === 'commandResponse' || h.messagePurpose === 'error') {
      const done = pending.get(h.requestId);
      if (done) { pending.delete(h.requestId); done(b, h); }
      return;
    }
    if (h.messagePurpose === 'event') {
      const name = h.eventName || b.eventName, props = b.properties || b;
      if (name === 'PlayerMessage') {
        const msg = String(props.message ?? props.Message ?? ''), sender = String(props.sender ?? props.Sender ?? ''), type = String(props.type ?? props.MessageType ?? '');
        // (a chat line starting with ! is typed into the page: !hello → hello, !! → Enter)
        if (type === 'chat' && (!L.player || sender === L.player) && msg.startsWith('!')) chats.push(msg === '!!' ? '\n' : msg.slice(1));
      }
    }
  }
  L.onData = (chunk) => {
    let frames; try { frames = reader.push(chunk); } catch { socket.destroy(); return; }
    for (const f of frames) {
      if (f.opcode === 8) { try { socket.write(encodeFrame(8, Buffer.alloc(0))); } catch { /* gone */ } socket.end(); return; }
      if (f.opcode === 9) { socket.write(encodeFrame(10, f.payload)); continue; }
      if (f.opcode === 10) continue;
      if (f.opcode === 1 || f.opcode === 2) frag = [f.payload]; else if (f.opcode === 0) frag.push(f.payload); else continue;
      if (f.fin) { const all = Buffer.concat(frag); frag = []; onMessage(all); }
    }
  };
  /** a request of the script's, made to this service as if from this machine (its pictures' address: the one the game used) */
  async function run([id, method, path, body]) {
    L.requests++;
    try {
      const r = await opt.fetchImpl(`http://127.0.0.1:${opt.port}${path}`, { method, headers: { 'content-type': 'application/json', 'x-geoui-public': base }, body: body === null || body === undefined || method === 'GET' ? undefined : JSON.stringify(body) });
      let json = null; try { json = await r.json(); } catch { /* not JSON */ }
      answers.push([id, r.status, json]);
    } catch (e) { answers.push([id, 0, { ok: false, error: String(e.message || e).slice(0, 120) }]); }
    tick();
  }
  function pump() {
    pumping = true; lastPump = Date.now(); L.pumps++;
    const data = {};
    if (!hello) data.h = { base, v: opt.version };
    if (answers.length) data.r = answers.splice(0, 8);
    if (chats.length) data.c = chats.splice(0, 4);
    const lines = pumpLines(opt.cmd, data, ++seq, opt.pumpMax || PUMP_MAX);
    // (a long one in parts: each part is a command; the script answers the last with its outbox)
    lines.forEach((line, i) => command(line, i < lines.length - 1 ? () => {} : (b) => {
      pumping = false;
      if (b && typeof b.statusCode === 'number' && b.statusCode < 0) { if (!linked) opt.log(`GeoUI Web: /${opt.cmd}:pump が通りません（${String(b.statusMessage || b.statusCode).slice(0, 120)}）— このワールドに GeoUI Web（WebSocket 版）は入っていますか`); setTimeout(tick, 1000); return; }
      const out = parseOutput(b);
      if (out) {
        if (!hello) { hello = true; linked = true; L.player = String(out.n || ''); opt.log(`GeoUI Web: WebSocket でつながりました（${L.player || '?'}・${remote}・${encrypt ? '暗号化' : '平文'}・絵は ${base}）`); }
        more = !!out.m;
        for (const q of out.o || []) if (Array.isArray(q) && q.length >= 3) run(q);
      }
      tick();
    }));
  }
  function tick() {
    if (L.closed || waitingKey || pumping) return;
    if (answers.length || chats.length || more || !hello || Date.now() - lastPump >= opt.idleMs) pump();
  }
  L.start = () => {
    if (encrypt) {
      const kp = newKeyPair(), salt = crypto.randomBytes(16);
      waitingKey = true;
      command(enableEncryptionCommand(kp.der, salt), (b) => {
        const pk = b && (b.publicKey || (b.body && b.body.publicKey));
        if (!pk) { opt.log('GeoUI Web: 暗号化の答えに鍵がありません'); socket.destroy(); return; }
        try { cipher = cipherPair(sessionKey(kp.privateKey, pk, salt)); } catch (e) { opt.log(`GeoUI Web: 暗号化できません（${e.message}）`); socket.destroy(); return; }
        waitingKey = null;
        send(subscribeRequest(crypto.randomUUID(), 'PlayerMessage'));
        tick();
      });
    } else send(subscribeRequest(crypto.randomUUID(), 'PlayerMessage'));
    L.timer = setInterval(tick, Math.max(20, Math.floor(opt.idleMs / 2)));
    L.timer.unref?.();
    tick();
  };
  return L;
}
