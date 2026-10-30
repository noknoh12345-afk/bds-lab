#!/usr/bin/env node
// GeoUI Web — the service the in-game web talks to: the BDS script sends the player's actions (@minecraft/server-net), the
// game fetches the pictures (URL images: profile_image_renderer, bds/geoui/screen/layout.js). One Chromium for everyone, one
// isolated session per player (engine.mjs). Also plain pictures for checks (one colour, halves, quarters, noise, a colour that
// changes at each fetch), the record of what the game fetched and when, and our own demo pages.
//
//   node bds/geoui/web/server.mjs [--port 8787] [--host 0.0.0.0] [--public http://<this machine>:8787] [--idle <s>] [--key <k>]
//        [--fonts]   (a Japanese font fetched first when the machine has none: CI)
//
// HTTP (JSON in and out). The actions come from this machine (the BDS beside it) — from elsewhere only with the key (--key,
// header x-geoui-key). The pictures are for anyone who has their address (the session id in it is random: the address is the key).
//   GET  /info                        { ok, name, version, public, sessions, browser }
//   POST /s          { owner, url?, w?, h? }   a player's session (made, or the one it has) → state
//   POST /s/<sid>    { op, … }                 an action (engine.mjs: click down up move wheel type key go back forward reload
//                                              home address newtab tab closetab zoom resize stop look state close) → state
//   GET  /s/<sid>                     state     GET /s/<sid>/next?f=<frame>&b=<bar>&t=<ms>   state once either is newer
//   DELETE /s/<sid>                   closed
//   GET  /s/<sid>/f/<n>.png  /s/<sid>/b/<n>.png   frame n of the page / of the toolbar
//   GET  /solid/<rrggbb>/<w>x<h>.png   /split/<rrggbb>/<rrggbb>/<w>x<h>.png   /quad/<w>x<h>.png (red green / blue yellow)
//   GET  /noise/<w>x<h>.png (a big file: every pixel its own)   /count/<name>/<w>x<h>.png (the next of 11 hues at each fetch)
//   GET  /slow/<ms>/<one of those>    the same after a wait (what the game shows while a picture is on its way)
//   GET  /hits?since=<ms>             what was fetched: [{ t, path, ua }] (the game's fetches, timed — for the checks)
//   GET  /demo/<file>                 the demo pages      POST /quit (this machine only) the service ends
//   POST /tunnel { url }              (this machine only) the https address a tunnel gives it (lab.mjs): /info says it, and
//                                     a request with x-geoui-public: tunnel gets its pictures' addresses there
// A state carries frameUrl and barUrl as the game must fetch them: the base is x-geoui-public when the request says it (the
// script knows what its players can reach), else --public, else this machine's LAN address.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = '1.1.0';
export const HUES = [[255, 0, 0], [255, 128, 0], [255, 255, 0], [128, 255, 0], [0, 255, 0], [0, 255, 128], [0, 255, 255], [0, 128, 255], [0, 0, 255], [128, 0, 255], [255, 0, 128]];

/** this machine's first LAN address (what a phone on the same network reaches) */
export function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return '127.0.0.1';
}
const hex = (h) => { const m = /^([0-9a-f]{6})$/i.exec(String(h)); if (!m) return null; const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
/** a picture made pixel by pixel: f(x, y) → [r, g, b] */
export function makePng(w, h, f) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), o = (y * w + x) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; }
  return encodePng({ width: w, height: h, data });
}
/** one colour, or two halves (left a, right b) */
export const solidPng = (w, h, a, b = a) => makePng(w, h, (x) => (x < w / 2 ? a : b));
/** four quarters: red top-left, green top-right, blue bottom-left, yellow bottom-right (which way up, how stretched) */
export const quadPng = (w, h) => makePng(w, h, (x, y) => (y < h / 2 ? (x < w / 2 ? [255, 0, 0] : [0, 255, 0]) : (x < w / 2 ? [0, 0, 255] : [255, 255, 0])));
/** every pixel its own (a seeded generator): a file as big as a picture of that size gets */
export function noisePng(w, h) {
  let s = 0x9e3779b9;
  return makePng(w, h, () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return [s & 255, (s >>> 8) & 255, (s >>> 16) & 255]; });
}
// (this machine: a loopback address and no proxy's forwarding headers — a tunnel's requests come from loopback too, with them)
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'] && !req.headers.forwarded;

/** a font for Japanese (and Chinese, Korean: CJK) pages on a machine with none (a CI runner): Noto Sans JP into the user's fonts,
 *  before the browser starts — 'have' | 'fetched' | 'no' (why) */
export async function ensureFonts(log = () => {}) {
  if (process.platform !== 'linux') return 'have';
  const { spawnSync } = await import('node:child_process');
  const has = spawnSync('fc-list', [':lang=ja', 'family'], { encoding: 'utf8' });
  if (has.error) return 'no (fc-list)';
  if (has.status === 0 && has.stdout.trim()) return 'have';
  const dir = path.join(os.homedir(), '.local', 'share', 'fonts'), f = path.join(dir, 'NotoSansJP.ttf');
  try {
    if (!fs.existsSync(f)) {
      const r = await fetch('https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf', { signal: AbortSignal.timeout(90000) });
      if (!r.ok) return `no (${r.status})`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    spawnSync('fc-cache', ['-f', dir], { timeout: 60000 });
    log('GeoUI Web: 日本語のフォント（Noto Sans JP）を入れました');
    return 'fetched';
  } catch (e) { return `no (${String(e.message).slice(0, 60)})`; }
}

/** the service: { server, port, url, close() } — the browser started for the first session (pictures and pages need none) */
export async function startServer(o = {}) {
  const opt = Object.assign({ port: Number(process.env.GEOUI_WEB_PORT) || 8787, host: '0.0.0.0', idle: 0, key: process.env.GEOUI_WEB_KEY || '', log: () => {}, maxPx: 4096 }, o);
  let engine = null, enginePromise = null, last = Date.now(), port = opt.port, fonts = opt.fonts ? 'checking' : 'not checked', tunnel = opt.tunnel || '', tunnelPid = 0;
  const cache = new Map(), counts = new Map(), hits = [];
  const fontsReady = opt.fonts ? ensureFonts(opt.log).then((r) => { fonts = r; }, () => { fonts = 'no'; }) : Promise.resolve();
  const getEngine = () => {
    // (a browser that went away — it crashed, or was killed — is started again; its sessions are gone with it)
    if (engine && engine.browser && typeof engine.browser.isConnected === 'function' && !engine.browser.isConnected()) { engine = null; enginePromise = null; }
    if (engine) return Promise.resolve(engine);
    if (!enginePromise) {
      enginePromise = fontsReady.then(() => import('./engine.mjs')).then((m) => m.createEngine({ log: opt.log, ownOrigin: `http://127.0.0.1:${port}`, home: opt.home || `http://127.0.0.1:${port}/demo/start.html`, frameW: opt.frameW, frameH: opt.frameH, lookMs: opt.lookMs, lookMaxMs: opt.lookMaxMs }))
        .then((e) => { engine = e; return e; }, (e) => { enginePromise = null; throw e; });
    }
    return enginePromise;
  };
  const publicOf = (req) => {
    const h = String(req.headers['x-geoui-public'] || '');
    if (/^https?:\/\/[^\s/]+$/.test(h)) return h;
    if (h === 'tunnel' && tunnel) return tunnel;
    return opt.public || `http://${lanIp()}:${port}`;
  };
  const withUrls = (st, req) => (st && st.sid && !st.closed ? Object.assign({}, st, { frameUrl: `${publicOf(req)}/s/${st.sid}/f/${st.frame}.png`, barUrl: `${publicOf(req)}/s/${st.sid}/b/${st.bar}.png` }) : st);
  const send = (res, code, body, type = 'application/json') => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const still = type === 'image/png' && !res.__fresh;
    res.writeHead(code, { 'content-type': type, 'content-length': buf.length, 'cache-control': still ? 'public, max-age=31536000, immutable' : 'no-store', 'access-control-allow-origin': '*' });
    res.end(buf);
  };
  const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve(null); } }); });
  const keyOk = (req) => isLocal(req) || (!!opt.key && req.headers['x-geoui-key'] === opt.key);
  const dims = (w, h) => [Math.max(1, Math.min(opt.maxPx, Number(w))), Math.max(1, Math.min(opt.maxPx, Number(h)))];
  const cached = (k, make) => { if (!cache.has(k)) { if (cache.size > 48) cache.clear(); cache.set(k, make()); } return cache.get(k); };
  const server = http.createServer(async (req, res) => {
    last = Date.now();
    try {
      const u = new URL(req.url, 'http://x');
      // (every picture fetched is written down: when, what, by what — the game's own fetches, for the checks)
      if (req.method === 'GET' && u.pathname.endsWith('.png')) { hits.push({ t: Date.now(), path: u.pathname + u.search, ua: String(req.headers['user-agent'] || '').slice(0, 80) }); if (hits.length > 2000) hits.splice(0, hits.length - 2000); }
      // (/slow/<ms>/<picture>: the same picture after a wait — what the game shows while one is on its way)
      let pathname = u.pathname;
      const slow = /^\/slow\/(\d{1,5})(\/.+\.png)$/.exec(pathname);
      if (req.method === 'GET' && slow) { await new Promise((r) => setTimeout(r, Math.min(20000, Number(slow[1])))); pathname = slow[2]; res.__fresh = true; }
      const parts = pathname.split('/').filter(Boolean);
      if (req.method === 'GET' && pathname === '/info') return send(res, 200, { ok: true, name: 'geoui-web', version: VERSION, public: publicOf(req), sessions: engine ? engine.sessions.size : 0, browser: !!engine, fonts, tunnel, now: Date.now() });
      if (req.method === 'GET' && pathname === '/hits') { const since = Number(u.searchParams.get('since')) || 0; return send(res, 200, { ok: true, now: Date.now(), hits: hits.filter((h) => h.t > since) }); }
      if (req.method === 'POST' && pathname === '/tunnel') {
        if (!isLocal(req)) return send(res, 403, { ok: false, error: 'local only' });
        const b = await readBody(req);
        if (!b || !(b.url === '' || /^https:\/\/[^\s/]+$/.test(String(b.url)))) return send(res, 400, { ok: false, error: 'url' });
        tunnel = String(b.url);
        if (Number.isInteger(b.pid) && b.pid > 1) tunnelPid = b.pid;   // (the tunnel ends with the service)
        return send(res, 200, { ok: true, tunnel });
      }
      if (req.method === 'POST' && pathname === '/quit') {
        if (!isLocal(req)) return send(res, 403, { ok: false, error: 'local only' });
        send(res, 200, { ok: true });
        setTimeout(() => api.close().finally(() => { if (opt.exitOnQuit !== false) process.exit(0); }), 50);
        return undefined;
      }
      let m;
      if (req.method === 'GET' && (m = /^\/solid\/([0-9a-fA-F]{6})\/(\d{1,4})x(\d{1,4})\.png$/.exec(pathname))) { const [w, h] = dims(m[2], m[3]); return send(res, 200, cached(pathname, () => solidPng(w, h, hex(m[1]))), 'image/png'); }
      if (req.method === 'GET' && (m = /^\/split\/([0-9a-fA-F]{6})\/([0-9a-fA-F]{6})\/(\d{1,4})x(\d{1,4})\.png$/.exec(pathname))) { const [w, h] = dims(m[3], m[4]); return send(res, 200, cached(pathname, () => solidPng(w, h, hex(m[1]), hex(m[2]))), 'image/png'); }
      if (req.method === 'GET' && (m = /^\/quad\/(\d{1,4})x(\d{1,4})\.png$/.exec(pathname))) { const [w, h] = dims(m[1], m[2]); return send(res, 200, cached(pathname, () => quadPng(w, h)), 'image/png'); }
      if (req.method === 'GET' && (m = /^\/noise\/(\d{1,4})x(\d{1,4})\.png$/.exec(pathname))) { const [w, h] = dims(m[1], m[2]); return send(res, 200, cached(pathname, () => noisePng(w, h)), 'image/png'); }
      if (req.method === 'GET' && (m = /^\/count\/([\w-]{1,40})\/(\d{1,4})x(\d{1,4})\.png$/.exec(pathname))) {
        const [w, h] = dims(m[2], m[3]), n = counts.get(m[1]) || 0;
        counts.set(m[1], n + 1);
        res.__fresh = true;
        return send(res, 200, cached(`count:${n % HUES.length}:${w}x${h}`, () => solidPng(w, h, HUES[n % HUES.length])), 'image/png');
      }
      if (req.method === 'GET' && parts[0] === 'demo') {
        const f = path.join(HERE, 'demo', path.basename(parts[1] || 'start.html'));
        if (!fs.existsSync(f)) return send(res, 404, { ok: false, error: 'no such page' });
        const type = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream';
        res.__fresh = true;
        return send(res, 200, fs.readFileSync(f), type);
      }
      if (parts[0] === 's' && req.method === 'GET' && parts.length === 4 && (parts[2] === 'f' || parts[2] === 'b')) {
        const s = engine && engine.get(parts[1]), n = /^(\d+)\.png$/.exec(parts[3]);
        const png = s && n ? (parts[2] === 'f' ? s.frame(n[1]) : s.bar(n[1])) : null;
        return png ? send(res, 200, png, 'image/png') : send(res, 404, { ok: false, error: 'no such frame' });
      }
      if (parts[0] === 's') {
        if (!keyOk(req)) return send(res, 403, { ok: false, error: 'actions come from this machine only (or with --key)' });
        if (req.method === 'POST' && parts.length === 1) {
          const b = await readBody(req);
          if (!b || !b.owner) return send(res, 400, { ok: false, error: 'owner' });
          const eng = await getEngine(), s = await eng.open(String(b.owner).slice(0, 80), b);
          s.touch();
          return send(res, 200, Object.assign({ ok: true }, withUrls(await s.act({ op: 'state' }), req)));
        }
        const s = engine && engine.get(parts[1]);
        if (!s) return send(res, 404, { ok: false, error: 'no such session' });
        if (req.method === 'DELETE') { await s.close(); return send(res, 200, { ok: true, closed: true }); }
        if (req.method === 'GET' && parts[2] === 'next') {
          s.touch();
          const st = await s.next(Number(u.searchParams.get('f')) || 0, Number(u.searchParams.get('b')) || 0, Number(u.searchParams.get('t')) || 10000);
          return send(res, 200, Object.assign({ ok: true }, withUrls(st, req)));
        }
        if (req.method === 'GET' && parts.length === 2) { s.touch(); return send(res, 200, Object.assign({ ok: true }, withUrls(await s.act({ op: 'state' }), req))); }
        if (req.method === 'POST' && parts.length === 2) {
          const b = await readBody(req);
          if (!b) return send(res, 400, { ok: false, error: 'json' });
          const st = await s.act(b);
          return send(res, 200, Object.assign({ ok: true }, withUrls(st, req)));
        }
      }
      return send(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
      return send(res, e.status || 500, { ok: false, error: String(e.message || e).split('\n')[0].slice(0, 300) });
    }
  });
  server.keepAliveTimeout = 65000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(opt.port, opt.host, resolve); });
  port = server.address().port;
  // (what changes by itself: sessions looked at again when due; the service ends itself after idle seconds with no request)
  let polling = false, closed = false;
  const timer = setInterval(async () => {
    if (opt.idle > 0 && Date.now() - last > opt.idle * 1000 && !(engine && [...engine.sessions.values()].some((s) => s.waiters.size))) { await api.close(); if (opt.exitOnIdle !== false) process.exit(0); return; }
    if (!engine || polling) return;
    polling = true;
    try { await engine.poll(); } catch { /* the next time */ }
    polling = false;
  }, 100);
  timer.unref?.();
  const api = {
    server, port, url: `http://127.0.0.1:${port}`, key: opt.key, hits, get engine() { return engine; },
    async close() {
      if (closed) return;
      closed = true; clearInterval(timer);
      if (tunnelPid) { try { process.kill(tunnelPid); } catch { /* gone */ } }
      if (engine) await engine.close();
      await new Promise((r) => { server.close(r); server.closeAllConnections?.(); });
    },
  };
  return api;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const key = arg('--key', process.env.GEOUI_WEB_KEY || '');
  const s = await startServer({ port: Number(arg('--port', process.env.GEOUI_WEB_PORT || 8787)), host: arg('--host', '0.0.0.0'), public: arg('--public', process.env.GEOUI_WEB_PUBLIC || ''),
    idle: Number(arg('--idle', 0)), key, fonts: a.includes('--fonts'), log: (l) => console.log(l) });
  console.log(`GEOUI_WEB listening ${s.url} public ${process.env.GEOUI_WEB_PUBLIC || arg('--public', '') || `http://${lanIp()}:${s.port}`}${key ? ' (key)' : ''}`);
  const stop = () => s.close().finally(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
