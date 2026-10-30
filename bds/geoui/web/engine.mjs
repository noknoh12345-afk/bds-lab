// GeoUI Web — the browser behind the in-game web: a real Chromium (Playwright), one isolated context per player session, its tabs,
// the actions a Chrome user has (click, move, drag, wheel, type, keys, back, forward, reload, tabs, address bar, zoom), and the
// screen as PNG frames: the page's own pixels (any site, script-driven ones too: they run in Chromium) and a Chrome-like
// toolbar drawn by a page of our own. A frame is numbered and kept: the game fetches it by URL (URL images, layout.js), and a new
// number is a new picture. What changes by itself (a clock, a video, a feed) is found by looking again: often while the page
// keeps changing, less often while it is still (lookMs … lookMaxMs).
//
//   const eng = await createEngine({ log, frameW: 1280, frameH: 720 })
//   const s = await eng.open('player-1', { url, w, h })    → session (s.id is random: frames are fetched by it)
//   await s.act({ op: 'click', x, y })                       → state { frame, bar, url, title, tabs, focus, … }
//   await s.next(frame, bar, ms)                             → state, as soon as either is newer (or after ms)
//   s.frame(n) / s.bar(n)                                    → PNG bytes
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOP = path.resolve(HERE, '..', '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Playwright: the one installed here, else the lab's own copy (app/.lab/browser/pw) with the machine's Chrome or Chromium
export async function loadBrowser({ log = () => {} } = {}) {
  let pw = null;
  try { pw = createRequire(import.meta.url)('playwright'); } catch { /* not here */ }
  if (!pw) { try { pw = createRequire(path.join(TOP, 'package.json'))('playwright-core'); } catch { /* not here */ } }
  if (!pw) {
    const { loadPlaywright } = await import(pathToFileURL(path.join(TOP, 'app', 'lib', 'playwright-login.mjs')).href);
    pw = loadPlaywright(path.join(TOP, 'app', '.lab', 'browser'), { log }).pw;
  }
  const args = ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars=false', ...(process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : [])];
  const tries = [
    ...(process.env.GEOUI_WEB_CHROME ? [{ executablePath: process.env.GEOUI_WEB_CHROME }] : []),
    {}, { channel: 'chrome' }, { channel: 'msedge' },
    ...(fs.existsSync('/opt/pw-browsers/chromium') ? [{ executablePath: '/opt/pw-browsers/chromium' }] : []),
  ];
  let last = null;
  for (const t of tries) {
    try { return { pw, browser: await pw.chromium.launch({ headless: true, args, ...t }) }; } catch (e) { last = e; }
  }
  // (no Chrome and no browser of Playwright's own here: Playwright's Chromium, once — 150 MB)
  try {
    const core = path.join(TOP, 'app', '.lab', 'browser', 'pw', 'node_modules', 'playwright-core', 'cli.js');
    if (fs.existsSync(core)) {
      log('Chromium を取得しています（初回だけ、150 MB ほど）…');
      const { spawnSync } = await import('node:child_process');
      spawnSync(process.execPath, [core, 'install', 'chromium'], { stdio: 'ignore', timeout: 15 * 60_000 });
      return { pw, browser: await pw.chromium.launch({ headless: true, args }) };
    }
  } catch (e) { last = e; }
  throw new Error(`ブラウザを起動できません: ${String(last?.message ?? last).split('\n')[0]}（Chrome を入れるか GEOUI_WEB_CHROME=<場所>）`);
}

/** Playwright made ready before the first session, without blocking the service (the service starts this at boot: the first
 *  `npm i` of a busy CI runner took longer than a first page may wait — verify run 41008736742 passed only alone). No browser is
 *  started. → 'have' | 'fetched' | 'no (why)' */
export async function prefetchBrowser({ log = () => {} } = {}) {
  try { createRequire(import.meta.url)('playwright'); return 'have'; } catch { /* not here */ }
  try { createRequire(path.join(TOP, 'package.json'))('playwright-core'); return 'have'; } catch { /* not here */ }
  const dir = path.join(TOP, 'app', '.lab', 'browser', 'pw');
  if (fs.existsSync(path.join(dir, 'node_modules', 'playwright-core', 'package.json'))) return 'have';
  try {
    const { PW_VERSION } = await import(pathToFileURL(path.join(TOP, 'app', 'lib', 'playwright-login.mjs')).href);
    const { cleanEnv } = await import(pathToFileURL(path.join(TOP, 'app', 'lib', 'apk.mjs')).href);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: { 'playwright-core': PW_VERSION } }));
    log('GeoUI Web: Playwright を先に入れています（初回だけ）…');
    const { spawn } = await import('node:child_process');
    const WIN = process.platform === 'win32';
    const code = await new Promise((resolve) => {
      const c = spawn(WIN ? 'npm.cmd' : 'npm', ['i', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, stdio: 'ignore', shell: WIN, env: cleanEnv() });
      c.on('exit', resolve); c.on('error', () => resolve(-1));
    });
    return code === 0 && fs.existsSync(path.join(dir, 'node_modules', 'playwright-core', 'package.json')) ? 'fetched' : `no (npm ${code})`;
  } catch (e) { return `no (${String(e.message || e).slice(0, 60)})`; }
}

// ---- what may be opened: any http(s) site; the machine's own and private addresses only when allowed (a player must not reach
//      the server's own network through it): GEOUI_WEB_ALLOW_PRIVATE=1, or the service's own pages
export function isPrivateHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  let m;
  if ((m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || /^::ffff:/.test(h);
  return false;
}
/** what the address bar's text opens: a URL as it is (https:// added when there is none), else a search */
export function toUrl(text, search = process.env.GEOUI_WEB_SEARCH || 'https://www.google.com/search?q=%s') {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^(https?|about|data):/i.test(t)) return t;
  if (/^(file|chrome|javascript|view-source):/i.test(t)) return null;
  if (!/\s/.test(t) && (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(t) || /^localhost(:\d+)?([/?#].*)?$/.test(t) || /^\d+\.\d+\.\d+\.\d+(:\d+)?([/?#].*)?$/.test(t))) return `${/^(localhost|\d+\.\d+\.\d+\.\d+)([:/?#]|$)/.test(t) ? 'http' : 'https'}://${t}`;
  return search.replace('%s', encodeURIComponent(t));
}

// ---- the toolbar: Chrome's tab strip and its row (back, forward, reload, home, the address field, close), drawn by a page of
//      our own at the frame's width; its controls' boxes come back with the picture, for the clicks
const TOOLBAR_CSS = `*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#dee1e6;font-family:system-ui,'Noto Sans CJK JP','Noto Sans',sans-serif;color:#202124;-webkit-font-smoothing:antialiased}
body{font-size:calc(var(--h) * 0.19)}
#strip{display:flex;align-items:flex-end;height:46%;padding:0 0.6em;gap:0.15em}
.tab{position:relative;display:flex;align-items:center;gap:0.5em;height:88%;max-width:16em;min-width:4em;flex:1 1 16em;padding:0 0.8em;border-radius:0.6em 0.6em 0 0;background:#dee1e6;color:#3c4043;overflow:hidden;white-space:nowrap}
.tab.on{background:#fff;color:#202124}.tab .t{flex:1;overflow:hidden;text-overflow:ellipsis}.tab .x{flex:none;width:1.3em;height:1.3em;line-height:1.3em;text-align:center;border-radius:50%;color:#5f6368}
#new{flex:none;width:2.1em;height:2.1em;margin:0 0 0.3em 0.3em;border-radius:50%;text-align:center;line-height:2.1em;font-size:1.3em;color:#5f6368}
#row{display:flex;align-items:center;gap:0.3em;height:54%;padding:0 0.6em;background:#fff;border-bottom:1px solid #dadce0}
.b{flex:none;width:2.4em;height:2.4em;border-radius:50%;text-align:center;line-height:2.4em;font-size:1.25em;color:#5f6368}.b.off{color:#c4c7c5}
#addr{flex:1;display:flex;align-items:center;height:2.6em;padding:0 1.1em;border-radius:1.3em;background:#f1f3f4;color:#202124;overflow:hidden;white-space:nowrap;font-size:1.05em}
#addr.focus{background:#fff;box-shadow:0 0 0 2px #1a73e8}#addr .lock{color:#5f6368;margin-right:0.5em}#addr .host{color:#202124}#addr .rest{color:#5f6368}#addr .caret{display:inline-block;width:1px;height:1.3em;background:#1a73e8;margin-left:1px;vertical-align:middle}
#quit{color:#c5221f}#load{position:absolute;left:0;bottom:0;height:3px;background:#1a73e8;width:0}`;
function toolbarHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${TOOLBAR_CSS}</style></head><body><div id="strip"></div><div id="row"><div class="b" id="back">←</div><div class="b" id="fwd">→</div><div class="b" id="reload">⟳</div><div class="b" id="home">⌂</div><div id="addr"></div><div class="b" id="quit">✕</div></div><div id="load"></div>
<script>
window.paint = (s) => {
  document.body.style.setProperty('--h', innerHeight + 'px');
  const strip = document.getElementById('strip'); strip.innerHTML = '';
  s.tabs.forEach((t, i) => { const d = document.createElement('div'); d.className = 'tab' + (t.active ? ' on' : ''); d.dataset.tab = i;
    const tt = document.createElement('span'); tt.className = 't'; tt.textContent = t.title || t.url || '新しいタブ'; d.appendChild(tt);
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.dataset.close = i; d.appendChild(x); strip.appendChild(d); });
  const nw = document.createElement('div'); nw.id = 'new'; nw.textContent = '+'; strip.appendChild(nw);
  document.getElementById('back').className = 'b' + (s.canBack ? '' : ' off'); document.getElementById('fwd').className = 'b' + (s.canForward ? '' : ' off');
  document.getElementById('reload').textContent = s.loading ? '✕' : '⟳';
  const a = document.getElementById('addr'); a.className = s.focus === 'address' ? 'focus' : ''; a.innerHTML = '';
  if (s.focus === 'address') { const t = document.createElement('span'); t.textContent = s.typed; a.appendChild(t); const c = document.createElement('span'); c.className = 'caret'; a.appendChild(c); }
  else { let host = s.url, rest = '', lock = ''; try { const u = new URL(s.url); host = u.host || s.url; rest = (u.pathname === '/' ? '' : u.pathname) + u.search; lock = u.protocol === 'https:' ? '🔒' : u.protocol === 'http:' ? 'ⓘ' : ''; if (u.protocol !== 'https:' && u.protocol !== 'http:') { host = s.url; rest = ''; } } catch (e) {}
    if (lock) { const l = document.createElement('span'); l.className = 'lock'; l.textContent = lock; a.appendChild(l); }
    const h = document.createElement('span'); h.className = 'host'; h.textContent = host; a.appendChild(h); const r = document.createElement('span'); r.className = 'rest'; r.textContent = rest; a.appendChild(r); }
  document.getElementById('load').style.width = s.loading ? '60%' : '0';
  const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const hits = []; for (const el of document.querySelectorAll('.tab')) hits.push({ k: 'tab', n: Number(el.dataset.tab), b: box(el) });
  for (const el of document.querySelectorAll('.x')) hits.push({ k: 'close', n: Number(el.dataset.close), b: box(el) });
  for (const id of ['new', 'back', 'fwd', 'reload', 'home', 'addr', 'quit']) hits.push({ k: id, b: box(document.getElementById(id)) });
  return hits;
};
</script></body></html>`;
}

const UA = process.env.GEOUI_WEB_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const hashOf = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const TEXT_TYPES = ['text', 'search', 'email', 'url', 'tel', 'number', 'password', ''];

class Session {
  constructor(eng, owner, ctx, o) {
    this.eng = eng; this.owner = owner; this.ctx = ctx; this.id = crypto.randomBytes(16).toString('hex');
    this.w = o.w; this.h = o.h; this.barH = o.barH;
    this.tabs = []; this.active = 0; this.focus = 'page'; this.typed = ''; this.zoom = 1;
    this.frames = new Map(); this.frameN = 0; this.lastHash = null;
    this.bars = new Map(); this.barN = 0; this.barKey = null; this.hits = [];
    this.queue = Promise.resolve(); this.used = Date.now(); this.dialog = null; this.closed = false; this.quit = false;
    this.waiters = new Set(); this.lookedAt = 0; this.lookEvery = eng.lookMs; this.title = ''; this.nav = { canBack: false, canForward: false };
  }
  get page() { return this.tabs[this.active] || null; }
  /** a tab's DevTools session (its history, its zoom: Chrome's own, the page laid out at w / zoom CSS px) */
  async cdp(page) {
    if (!page.__cdp) page.__cdp = await this.ctx.newCDPSession(page).catch(() => null);
    return page.__cdp;
  }
  async applyZoom(page) {
    const c = await this.cdp(page), z = this.zoom, vh = this.h - this.barH;
    if (!c) return;
    if (z === 1) await c.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    else await c.send('Emulation.setDeviceMetricsOverride', { width: Math.round(this.w / z), height: Math.round(vh / z), deviceScaleFactor: z, mobile: false }).catch(() => {});
  }
  /** a tab of this session (a page the context made: a link with target=_blank, window.open) — the new one becomes the active one.
   *  Marked at once: the context's 'page' event and newTab() both come here for the same page */
  async adopt(page, activate = true) {
    if (page.__geo) return;
    page.__geo = true;
    this.tabs.push(page);
    if (activate) this.active = this.tabs.length - 1;
    page.on('dialog', (d) => { this.dialog = { type: d.type(), message: d.message().slice(0, 200) }; (d.type() === 'beforeunload' ? d.accept() : d.type() === 'prompt' ? d.accept(d.defaultValue()) : d.accept()).catch(() => {}); });
    page.on('close', () => { const i = this.tabs.indexOf(page); if (i >= 0) { this.tabs.splice(i, 1); if (this.active >= this.tabs.length) this.active = Math.max(0, this.tabs.length - 1); this.poke(); } });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) this.poke(); });
    await page.setViewportSize({ width: this.w, height: this.h - this.barH }).catch(() => {});
    if (this.zoom !== 1) await this.applyZoom(page);
  }
  /** something happened: the next look comes soon */
  poke() { this.lookEvery = this.eng.lookMs; this.lookedAt = 0; }
  /** still wanted (a player watching: the script asks for the next frame) — not closed as idle */
  touch() { this.used = Date.now(); }
  /** one action at a time: the next waits for the one before */
  act(a) {
    const run = this.queue.then(() => this.run(a));
    this.queue = run.catch(() => {});
    return run;
  }
  async run(a) {
    const op = String(a.op || 'state');
    if (op !== 'look') this.used = Date.now();
    const p = this.page;
    const fy = (y) => Number(y) - this.barH;
    let look = !['state', 'move', 'address'].includes(op);
    switch (op) {
      case 'state': break;
      case 'look': look = true; break;
      case 'go': case 'open': { const u = toUrl(a.url ?? a.text, this.eng.search); if (u) await this.navigate(u); else this.dialog = { type: 'blocked', message: `開けないアドレス: ${String(a.url ?? a.text).slice(0, 80)}` }; break; }
      case 'click': case 'down': case 'up': case 'move': {
        const x = Math.max(0, Math.min(this.w - 1, Number(a.x) || 0)), y = Math.max(0, Math.min(this.h - 1, Number(a.y) || 0));
        if (y < this.barH) { if (op === 'click' || op === 'up') { if (op === 'click') await this.toolbarClick(x, y); } break; }
        if (this.focus === 'address' && (op === 'click' || op === 'down')) this.focus = 'page';
        if (!p) break;
        const button = a.button === 'right' ? 'right' : a.button === 'middle' ? 'middle' : 'left';
        if (op === 'move') await p.mouse.move(x, fy(y), { steps: 1 });
        else if (op === 'down') { await p.mouse.move(x, fy(y)); await p.mouse.down({ button }); }
        else if (op === 'up') { await p.mouse.move(x, fy(y), { steps: 4 }); await p.mouse.up({ button }); }
        else await p.mouse.click(x, fy(y), { button, clickCount: Math.max(1, Math.min(3, Number(a.count) || 1)) });
        break;
      }
      case 'wheel': {
        if (!p) break;
        if (a.x !== undefined && a.y !== undefined && Number(a.y) >= this.barH) await p.mouse.move(Number(a.x), fy(a.y));
        await p.mouse.wheel(Number(a.dx) || 0, Number(a.dy) || 0);
        break;
      }
      case 'type': {
        const text = String(a.text ?? '');
        if (this.focus === 'address') { this.typed += text; if (a.enter !== false) await this.addressEnter(); break; }
        if (!p) break;
        await p.keyboard.type(text, { delay: 0 });
        // (Enter after it: asked for, or 'auto' — a single-line field alone in its form, or in none: a search box)
        const enter = a.enter === true || (a.enter === 'auto' && await p.evaluate((types) => {
          const el = globalThis.document.activeElement;
          if (!el || el.tagName !== 'INPUT' || !types.includes((el.getAttribute('type') || '').toLowerCase())) return false;
          const f = el.form;
          return !f || [...f.elements].filter((e) => e.tagName === 'INPUT' && types.includes((e.getAttribute('type') || '').toLowerCase())).length <= 1;
        }, TEXT_TYPES).catch(() => false));
        if (enter) await p.keyboard.press('Enter');
        break;
      }
      case 'key': {
        const key = String(a.key || '');
        if (!/^[\w+\-=[\]\\;',./`]{1,40}$/.test(key) && key.length !== 1) throw Object.assign(new Error(`キーの名前 ${key.slice(0, 40)}`), { status: 400 });
        if (this.focus === 'address') {
          if (key === 'Enter') await this.addressEnter();
          else if (key === 'Escape') this.focus = 'page';
          else if (key === 'Backspace') this.typed = this.typed.slice(0, -1);
          else if (key.length === 1) this.typed += key;
          break;
        }
        if (key === 'Control+L' || key === 'F6' || key === 'Alt+D') { this.focus = 'address'; this.typed = ''; break; }
        if (key === 'Alt+ArrowLeft' || key === 'BrowserBack') { await this.back(); break; }
        if (key === 'Alt+ArrowRight' || key === 'BrowserForward') { await this.forward(); break; }
        if (key === 'F5' || key === 'Control+R') { await this.reload(); break; }
        if (key === 'Control+T') { await this.newTab(); break; }
        if (key === 'Control+W') { await this.closeTab(this.active); break; }
        if (key === 'Control+Tab') { this.active = (this.active + 1) % Math.max(1, this.tabs.length); await this.page?.bringToFront().catch(() => {}); break; }
        if (key === 'Control+Shift+Tab') { this.active = (this.active - 1 + this.tabs.length) % Math.max(1, this.tabs.length); await this.page?.bringToFront().catch(() => {}); break; }
        if (p) await p.keyboard.press(key);
        break;
      }
      case 'back': await this.back(); break;
      case 'forward': await this.forward(); break;
      case 'reload': await this.reload(); break;
      case 'stop': if (p) await p.evaluate(() => globalThis.stop()).catch(() => {}); break;
      case 'home': await this.navigate(this.eng.home); break;
      case 'address': this.focus = 'address'; this.typed = a.text !== undefined ? String(a.text) : ''; look = true; break;
      case 'newtab': await this.newTab(a.url); break;
      case 'tab': { const n = Number(a.n); if (n >= 0 && n < this.tabs.length) this.active = n; await this.page?.bringToFront().catch(() => {}); break; }
      case 'closetab': await this.closeTab(a.n !== undefined ? Number(a.n) : this.active); break;
      case 'zoom': {
        this.zoom = Math.max(0.25, Math.min(5, Number(a.pct) / 100 || 1));
        for (const t of this.tabs) await this.applyZoom(t);
        break;
      }
      case 'resize': {
        this.w = Math.max(320, Math.min(3840, Math.round(Number(a.w) || this.w))); this.h = Math.max(240, Math.min(2160, Math.round(Number(a.h) || this.h)));
        this.barH = Math.round(this.h * this.eng.barFrac);
        for (const t of this.tabs) { await t.setViewportSize({ width: this.w, height: this.h - this.barH }).catch(() => {}); if (this.zoom !== 1) await this.applyZoom(t); }
        this.barKey = null;
        break;
      }
      case 'close': await this.close(); return { sid: this.id, closed: true };
      default: throw Object.assign(new Error(`知らない操作 ${op}`), { status: 400 });
    }
    // (what the action changed: given a moment to happen, then looked at; the looks after it come soon)
    if (look) {
      if (!['state', 'look', 'address'].includes(op)) { await this.settle(['type', 'key', 'wheel'].includes(op) ? 120 : 300); this.poke(); }
      await this.look();
    }
    return this.state();
  }
  async addressEnter() {
    this.focus = 'page';
    const u = toUrl(this.typed, this.eng.search);
    if (u) await this.navigate(u);
  }
  async navigate(u) {
    let host = '';
    try { host = new URL(u).hostname; } catch { /* about:, data: */ }
    if (host && isPrivateHost(host) && !this.eng.allowPrivate && !this.eng.ownHost(u)) { this.dialog = { type: 'blocked', message: `このアドレスは開けません（このサーバーの中の場所）: ${host}` }; return; }
    if (!this.page) await this.newTab();
    this.focus = 'page';
    await this.page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => { this.dialog = { type: 'error', message: String(e.message).split('\n')[0].slice(0, 200) }; });
  }
  async back() { if (this.page) await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}); }
  async forward() { if (this.page) await this.page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}); }
  async reload() { if (this.page) await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}); }
  async newTab(url) {
    const p = await this.ctx.newPage();
    await this.adopt(p, true);
    this.active = this.tabs.indexOf(p);
    await this.navigate(url ? (toUrl(url, this.eng.search) || this.eng.home) : this.eng.home);
  }
  async closeTab(n) {
    const t = this.tabs[n];
    if (!t) return;
    await t.close().catch(() => {});
    if (!this.tabs.length) await this.newTab();
  }
  async toolbarClick(x, y) {
    const inside = (h) => x >= h.b[0] && x < h.b[2] && y >= h.b[1] && y < h.b[3];
    const hit = this.hits.find((h) => inside(h) && h.k === 'close') || this.hits.find(inside);
    if (!hit) return;
    if (hit.k === 'back') await this.back();
    else if (hit.k === 'fwd') await this.forward();
    else if (hit.k === 'reload') { if (this.loading) await this.page?.evaluate(() => globalThis.stop()).catch(() => {}); else await this.reload(); }
    else if (hit.k === 'home') await this.navigate(this.eng.home);
    else if (hit.k === 'addr') { this.focus = 'address'; this.typed = ''; }
    else if (hit.k === 'new') await this.newTab();
    else if (hit.k === 'tab') { this.active = hit.n; await this.page?.bringToFront().catch(() => {}); }
    else if (hit.k === 'close') await this.closeTab(hit.n);
    else if (hit.k === 'quit') this.quit = true;
  }
  /** waits up to ms for the page to be quiet (its load, then a short pause) */
  async settle(ms) {
    const p = this.page;
    if (!p) return;
    await Promise.race([p.waitForLoadState('domcontentloaded').catch(() => {}), sleep(ms * 4)]);
    await sleep(ms);
  }
  get loading() { return this._loading === true; }
  /** the page and the toolbar looked at again: a new frame number when the picture changed (and whoever waits for one told) */
  async look() {
    const p = this.page, before = [this.frameN, this.barN];
    this.lookedAt = Date.now();
    if (p) {
      try {
        this._loading = await p.evaluate(() => globalThis.document.readyState !== 'complete').catch(() => false);
        this.title = (await p.title().catch(() => '')).slice(0, 120);
        const shot = await p.screenshot({ type: 'png', timeout: 8000, animations: 'allow', caret: 'initial' });
        const h = hashOf(shot);
        if (h !== this.lastHash) { this.lastHash = h; this.frameN++; this.frames.set(this.frameN, shot); for (const k of this.frames.keys()) if (k < this.frameN - 5) this.frames.delete(k); }
      } catch (e) { this.dialog = this.dialog || { type: 'error', message: String(e.message).split('\n')[0].slice(0, 160) }; }
    }
    await this.paintBar();
    const changed = this.frameN !== before[0] || this.barN !== before[1];
    // (a page that keeps changing is looked at often, a still one less and less: lookMs … lookMaxMs)
    this.lookEvery = changed ? this.eng.lookMs : Math.min(this.eng.lookMaxMs, Math.round(this.lookEvery * 1.5));
    if (changed) for (const w of [...this.waiters]) w();
    return changed;
  }
  async paintBar() {
    const st = await this.barState();
    const key = JSON.stringify(st);
    if (key === this.barKey) return;
    const r = await this.eng.toolbar(st, this.w, this.barH);
    this.barKey = key; this.hits = r.hits; this.barN++; this.bars.set(this.barN, r.png);
    for (const k of this.bars.keys()) if (k < this.barN - 5) this.bars.delete(k);
  }
  async barState() {
    const tabs = [];
    for (let i = 0; i < this.tabs.length; i++) { const t = this.tabs[i]; tabs.push({ title: (await t.title().catch(() => '')).slice(0, 60), url: t.url(), active: i === this.active }); }
    const p = this.page;
    let canBack = false, canForward = false;
    if (p) { const c = await this.cdp(p); const hh = c ? await c.send('Page.getNavigationHistory').catch(() => null) : null; if (hh) { canBack = hh.currentIndex > 0; canForward = hh.currentIndex < hh.entries.length - 1; } }
    this.nav = { canBack, canForward };
    return { tabs, url: p ? p.url() : '', focus: this.focus, typed: this.typed, loading: this.loading, canBack, canForward };
  }
  /** the state as soon as the frame or the toolbar is newer than f / b (or after ms) */
  next(f, b, ms = 10000) {
    if (this.frameN > f || this.barN > b || this.closed) return Promise.resolve(this.state());
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); this.waiters.delete(done); resolve(this.state()); };
      const t = setTimeout(done, Math.max(0, Math.min(30000, ms)));
      this.waiters.add(done);
    });
  }
  state() {
    const p = this.page, d = this.dialog, q = this.quit;
    this.dialog = null; this.quit = false;
    return { sid: this.id, frame: this.frameN, bar: this.barN, w: this.w, h: this.h, barH: this.barH, url: p ? p.url() : '', title: this.title, tabs: this.tabs.length, tab: this.active,
      focus: this.focus, typed: this.typed, loading: this.loading, zoom: this.zoom, canBack: this.nav.canBack, canForward: this.nav.canForward, ...(d ? { dialog: d } : {}), ...(q ? { quit: true } : {}) };
  }
  frame(n) { return this.frames.get(Number(n)) || null; }
  bar(n) { return this.bars.get(Number(n)) || null; }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const w of [...this.waiters]) w();
    await this.ctx.close().catch(() => {});
    this.eng.sessions.delete(this.id);
    if (this.eng.byOwner.get(this.owner) === this) this.eng.byOwner.delete(this.owner);
  }
}

/**
 * The browser and its sessions. o: { frameW, frameH, barFrac (the toolbar's share of a frame), home, search, allowPrivate,
 * ownOrigin (the service's own pages: always allowed), locale, timezone, lookMs, lookMaxMs, idleMs, log }
 */
export async function createEngine(o = {}) {
  const opt = Object.assign({ frameW: 1280, frameH: 720, barFrac: 0.1, home: 'about:blank', lookMs: 250, lookMaxMs: 1500, idleMs: 10 * 60_000, locale: process.env.GEOUI_WEB_LOCALE || 'ja-JP',
    timezone: process.env.GEOUI_WEB_TZ || 'Asia/Tokyo', allowPrivate: process.env.GEOUI_WEB_ALLOW_PRIVATE === '1', log: () => {} }, o);
  for (const k of ['frameW', 'frameH', 'lookMs', 'lookMaxMs']) if (!(Number(opt[k]) > 0)) opt[k] = { frameW: 1280, frameH: 720, lookMs: 250, lookMaxMs: 1500 }[k];
  const { browser } = await loadBrowser({ log: opt.log });
  const ui = await browser.newContext({ viewport: { width: opt.frameW, height: Math.round(opt.frameH * opt.barFrac) }, deviceScaleFactor: 1 });
  const bar = await ui.newPage();
  await bar.setContent(toolbarHtml());
  let barBusy = Promise.resolve();
  const eng = {
    browser, sessions: new Map(), byOwner: new Map(), home: opt.home, search: opt.search, allowPrivate: opt.allowPrivate, barFrac: opt.barFrac, lookMs: opt.lookMs, lookMaxMs: opt.lookMaxMs,
    ownHost(u) { try { return !!opt.ownOrigin && new URL(u).origin === new URL(opt.ownOrigin).origin; } catch { return false; } },
    /** the toolbar for a state, w x h px: { png, hits } (one painter for all sessions, one at a time) */
    toolbar(st, w, h) {
      const run = barBusy.then(async () => {
        await bar.setViewportSize({ width: w, height: Math.max(24, h) });
        const hits = await bar.evaluate((s) => globalThis.paint(s), st);
        const png = await bar.screenshot({ type: 'png' });
        return { png, hits };
      });
      barBusy = run.catch(() => {});
      return run;
    },
    /** the session of an owner (a player), made when it has none */
    async open(owner, a = {}) {
      let s = eng.byOwner.get(owner);
      if (!s || s.closed) {
        const w = Math.max(320, Math.min(3840, Math.round(Number(a.w) || opt.frameW))), h = Math.max(240, Math.min(2160, Math.round(Number(a.h) || opt.frameH)));
        const ctx = await browser.newContext({ viewport: { width: w, height: h - Math.round(h * opt.barFrac) }, userAgent: UA, locale: opt.locale, timezoneId: opt.timezone, deviceScaleFactor: 1, ignoreHTTPSErrors: false,
          permissions: [], acceptDownloads: false, colorScheme: 'light' });
        // (requests to the machine's own or private addresses stopped, unless allowed or the service's own pages)
        await ctx.route('**/*', (route) => {
          let host = '';
          try { host = new URL(route.request().url()).hostname; } catch { return route.continue(); }
          if (isPrivateHost(host) && !eng.allowPrivate && !eng.ownHost(route.request().url())) return route.abort('blockedbyclient');
          return route.continue();
        });
        s = new Session(eng, owner, ctx, { w, h, barH: Math.round(h * opt.barFrac) });
        ctx.on('page', (pg) => { s.adopt(pg, true).catch(() => {}); });
        eng.sessions.set(s.id, s); eng.byOwner.set(owner, s);
        await s.act({ op: 'newtab', url: a.url || opt.home });
      } else {
        if (a.w && a.h && (Number(a.w) !== s.w || Number(a.h) !== s.h)) await s.act({ op: 'resize', w: a.w, h: a.h });
        if (a.url) await s.act({ op: 'go', url: a.url });
      }
      return s;
    },
    get(id) { return eng.sessions.get(id) || null; },
    /** often: sessions used lately looked at again when due (what changes by itself), idle ones closed */
    async poll() {
      const now = Date.now();
      for (const s of [...eng.sessions.values()]) {
        if (now - s.used > opt.idleMs) { await s.close(); continue; }
        if ((now - s.used < 120_000 || s.waiters.size) && now - s.lookedAt >= s.lookEvery) await s.act({ op: 'look' }).catch(() => {});
      }
    },
    async close() { for (const s of [...eng.sessions.values()]) await s.close(); await ui.close().catch(() => {}); await browser.close().catch(() => {}); },
  };
  return eng;
}
