#!/usr/bin/env node
// Spectral Connect — Minecraft as it is, over WebSocket only (the user's request 23:55): no BDS needed. The game connects to this
// server with /connect <this machine>:8790 (cheats on, an operator); a page here (in a browser, or in the game through GeoUI Web)
// takes a URL or a file, makes a song of it and sends it to the game — Spectral Player's script events, as a song pack does —
// and plays it. In the game's chat, `!spectral <url>` does the same.
//
// The URL is fetched with yt-dlp on this machine (pip install yt-dlp): only for what you have the rights to (your own videos,
// CC-licensed ones) — YouTube's terms allow downloading only where they say so.
//
//   node tools/connect/server.mjs [--port 8790] [--max 240] [--kind sine|notes]
//   then in the game: /connect <this machine's address>:8790     (and open http://<address>:8790/ for the page)
// The WebSocket is RFC 6455 written out here (no package): Minecraft's client sends masked text frames of JSON.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT = path.dirname(path.dirname(HERE));
const LAB = path.resolve(UNIT, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('--port', process.env.PORT ?? 8790));
const MAX_S = Number(arg('--max', 240));
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'spectral-connect-'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------ WebSocket (server side, RFC 6455)
function wsAccept(req, socket, onMessage, onClose) {
  const key = req.headers['sec-websocket-key'];
  const acceptKey = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acceptKey + '\r\n\r\n');
  let buf = Buffer.alloc(0), frag = [];
  const send = (text, opcode = 1) => {
    const data = Buffer.from(text);
    const head = data.length < 126 ? Buffer.from([0x80 | opcode, data.length])
      : data.length < 65536 ? Buffer.from([0x80 | opcode, 126, data.length >> 8, data.length & 255])
        : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(data.length), 2); return h; })();
    socket.write(Buffer.concat([head, data]));
  };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, at = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); at = 10; }
      const need = at + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let data = buf.subarray(at + (masked ? 4 : 0), need);
      if (masked) { const m = buf.subarray(at, at + 4); data = Buffer.from(data.map((b, i) => b ^ m[i & 3])); }
      buf = buf.subarray(need);
      if (op === 8) { socket.end(); return; }
      if (op === 9) { send(data.toString(), 10); continue; }
      if (op === 10) continue;
      frag.push(data);
      if (fin) { const msg = Buffer.concat(frag).toString(); frag = []; try { onMessage(msg); } catch (e) { log('ws message:', e.message); } }
    }
  });
  socket.on('close', onClose); socket.on('error', onClose);
  return { send: (obj) => send(JSON.stringify(obj)), close: () => socket.end() };
}

// ------------------------------------------------------------------ Minecraft's side of /connect
const games = new Set();
class Game {
  constructor(req, socket) {
    this.pending = new Map(); this.name = '?'; this.sent = 0;
    this.ws = wsAccept(req, socket, (m) => this.message(m), () => { games.delete(this); log('the game left'); });
    games.add(this);
    this.subscribe('PlayerMessage');
    log('a game connected');
  }
  request(purpose, body) {
    const requestId = crypto.randomUUID();
    this.ws.send({ header: { version: 1, requestId, messagePurpose: purpose, messageType: 'commandRequest' }, body });
    return requestId;
  }
  subscribe(eventName) { this.request('subscribe', { eventName }); }
  /** a command as the connected player → its response ({statusCode, statusMessage}) */
  command(line) {
    return new Promise((resolve) => {
      const id = this.request('commandRequest', { version: 1, commandLine: line, origin: { type: 'player' } });
      this.pending.set(id, resolve);
      setTimeout(() => { if (this.pending.delete(id)) resolve({ statusCode: -1, statusMessage: 'no answer' }); }, 15000);
      this.sent++;
    });
  }
  message(text) {
    const m = JSON.parse(text), h = m.header ?? {};
    if (h.messagePurpose === 'commandResponse') { const r = this.pending.get(h.requestId); if (r) { this.pending.delete(h.requestId); r(m.body ?? {}); } return; }
    if (h.messagePurpose === 'event' && (h.eventName === 'PlayerMessage' || m.body?.type === 'chat')) {
      const b = m.body ?? {}, said = String(b.message ?? ''), who = b.sender ?? b.properties?.Sender ?? '';
      if (who) this.name = who;
      const g = /^!spectral\s+(\S+)(?:\s+(sine|notes))?/.exec(said);
      if (g) run({ url: g[1], kind: g[2] }, this).catch((e) => this.command(`tellraw @s {"rawtext":[{"text":"§c${e.message.replace(/"/g, "'").slice(0, 200)}"}]}`));
    }
  }
}

// ------------------------------------------------------------------ a URL or a file → a song → the game
const jobs = [];
function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: UNIT, ...opts });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)}: ${(err || out).trim().split('\n').slice(-2).join(' ').slice(0, 300)}`))));
  });
}
async function fetchUrl(url, job) {
  if (/^(file:\/\/|\/)/.test(url)) return url.replace(/^file:\/\//, '');           // a file on this machine
  if (spawnSync('yt-dlp', ['--version']).status !== 0) throw new Error('yt-dlp がありません（pip install yt-dlp）');
  job.step = 'downloading';
  const out = path.join(WORK, `dl-${job.id}.%(ext)s`);
  await sh('yt-dlp', ['-x', '--audio-format', 'wav', '--no-playlist', '--download-sections', `*0-${MAX_S}`, '-o', out, url]);
  const f = fs.readdirSync(WORK).find((x) => x.startsWith(`dl-${job.id}.`));
  if (!f) throw new Error('nothing came down');
  return path.join(WORK, f);
}
async function convert(file, job) {
  job.step = 'converting';
  const id = `c${job.id}`, base = path.join(WORK, id);
  if (/\.(mid|midi|kar|rmi)$/i.test(file) || job.kind === 'notes') {
    await sh('python3', [path.join(UNIT, 'tools', 'notes.py'), file, '--out', base + '.song.json', '--id', id, '--title', job.title ?? path.basename(file)]);
  } else {
    await sh('python3', [path.join(UNIT, 'tools', 'spectral.py'), file, '--voices', '48', '--seconds', String(MAX_S), '--id', id, '--title', (job.title ?? path.basename(file)).slice(0, 60), '--out', base]);
  }
  return JSON.parse(fs.readFileSync(base + '.song.json', 'utf8'));
}
/** the song as Spectral Player's script events (the song packs' own: at most 1800 characters a part) */
function parts(song, size = 1800) {
  const { meta, data } = song, id = meta.id;
  const msg = (i, n, chunk, m) => JSON.stringify({ id, i, n, ...(m ? { meta: m } : {}), data: chunk });
  const first = size - msg(999, 999, '', meta).length, room = size - msg(999, 999, '').length;
  const chunks = [data.slice(0, first)];
  for (let k = first; k < data.length; k += room) chunks.push(data.slice(k, k + room));
  return chunks.map((c, i) => msg(i, chunks.length, c, i === 0 ? meta : undefined));
}
async function sendSong(game, song, job) {
  job.step = 'sending';
  const ps = parts(song);
  for (let i = 0; i < ps.length; i += 8) {                       // (8 at a time: the game answers each)
    await Promise.all(ps.slice(i, i + 8).map((p) => game.command(`scriptevent spectral:song ${p}`)));
    job.sent = Math.min(ps.length, i + 8); job.parts = ps.length;
  }
}
async function run(req, game) {
  const job = { id: jobs.length + 1, url: req.url, kind: req.kind, title: req.title, step: 'queued', at: Date.now() };
  jobs.push(job);
  try {
    const g = game ?? [...games][0];
    if (!g) throw new Error('ゲームがつながっていません（ゲームで /connect <このパソコン>:' + PORT + '）');
    const file = await fetchUrl(req.url, job);
    const song = await convert(file, job);
    await sendSong(g, song, job);
    job.step = 'playing';
    const r = await g.command(`spectral:play ${song.meta.id}${req.where === 'speaker' ? ' speaker' : ''}`);
    job.result = r.statusMessage ?? ''; job.song = song.meta.id; job.seconds = song.meta.seconds;
    log(`job ${job.id}: ${song.meta.id} sent in ${job.parts} parts, ${job.result}`);
  } catch (e) { job.step = 'failed'; job.error = e.message; log(`job ${job.id}:`, e.message); throw e; }
  return job;
}

// ------------------------------------------------------------------ the page and the API
const PAGE = fs.readFileSync(path.join(HERE, 'page.html'), 'utf8');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  if (req.method === 'GET' && url.pathname.startsWith('/panel/')) {
    // (the lab's OreUI look: its colours, buttons and pixel letters — panel/styles.css, panel.css, fonts/)
    const f = path.normalize(path.join(LAB, url.pathname));
    if (!f.startsWith(path.join(LAB, 'panel')) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    const type = { '.css': 'text/css', '.otf': 'font/otf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[path.extname(f)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=3600' }); fs.createReadStream(f).pipe(res); return;
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    json(200, { games: [...games].map((g) => ({ name: g.name, commands: g.sent })), jobs: jobs.slice(-10).reverse() }); return;
  }
  if (req.method === 'POST' && url.pathname === '/api/play') {
    let body = ''; for await (const c of req) body += c;
    let r; try { r = JSON.parse(body || '{}'); } catch { json(400, { error: 'bad JSON' }); return; }
    if (!r.url) { json(400, { error: 'url がありません' }); return; }
    run(r).catch(() => {});
    json(202, { queued: jobs.length }); return;
  }
  if (req.method === 'POST' && url.pathname === '/api/command') {
    let body = ''; for await (const c of req) body += c;
    const g = [...games][0]; if (!g) { json(409, { error: 'no game' }); return; }
    const line = String(JSON.parse(body || '{}').line ?? '');
    if (!/^spectral:(stop|pause|seek|play|songs|volume|status)\b/.test(line)) { json(400, { error: 'only spectral:stop / pause / seek / play / songs / volume / status' }); return; }
    json(200, await g.command(line)); return;
  }
  res.writeHead(404); res.end();
});
server.on('upgrade', (req, socket) => {
  if (!/websocket/i.test(req.headers.upgrade ?? '')) { socket.destroy(); return; }
  new Game(req, socket);
});
server.listen(PORT, () => {
  const addrs = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  log(`Spectral Connect on :${PORT} — in the game: /connect ${addrs[0] ?? 'localhost'}:${PORT} · the page: http://${addrs[0] ?? 'localhost'}:${PORT}/`);
});
export { parts, wsAccept };
