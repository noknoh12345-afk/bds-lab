#!/usr/bin/env node
// nethernet-connect's dashboard in a REAL browser (headless Chromium via playwright-core): startWeb with stand-in deps (what it
// finds, a connection that goes through its phases and logs), the page opened by its #t=<token> URL. Checks what a person sees
// and does: 探す → the cards (a world, a server with its ways in, the refused one apart) → 参加 → the dialog (the ways in, observe
// on for a world) → the session box (connected, every phase, the log lines), and no page error, console error or CSP report.
// The page's API is web/app.js's own: this keeps it and src/web.ts saying the same.
//   node tests/nc-web-offline.mjs   (LAB_BROWSER / APP_BROWSER = a Chromium; else /opt/pw-browsers/chromium, Chrome, Playwright's;
//                                    none at all: skipped, said)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ncBuilt } from './fake/nc.mjs';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let good = 0, bad = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${what}${ok || !detail ? '' : '\n    ' + String(detail).slice(0, 1200)}`); ok ? good++ : bad++; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-web-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* gone */ } });

// (playwright-core — the app's version — in a folder of its own, installed under a lock: tests/panel-browser.mjs installs into
//  another one beside this test in CI, and two installs in one folder at once leave a half-written package)
const { PW_VERSION } = await import(pathToFileURL(path.join(TOP, 'app', 'lib', 'playwright-login.mjs')).href);
const { installOnce } = await import(pathToFileURL(path.join(TOP, 'common', 'nethernet-connect', 'install.mjs')).href);
let pw;
try { pw = createRequire(path.join(await installOnce(path.join(process.env.LAB_CACHE || path.join(os.tmpdir(), 'bds-lab-lan-test'), 'pw'), { 'playwright-core': PW_VERSION }), 'package.json'))('playwright-core'); }
catch (e) { console.log(`- playwright-core could not be installed (${String(e.message).split('\n')[0]}): nc-web-offline skipped\nSKIP nc-web-offline`); process.exit(0); }
const exe = process.env.LAB_BROWSER || process.env.APP_BROWSER || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let browser, why = 'none found';
for (const o of exe ? [{ executablePath: exe }] : [{ channel: 'chrome' }, {}]) { try { browser = await pw.chromium.launch({ headless: true, ...o, args: process.getuid?.() === 0 ? ['--no-sandbox'] : [] }); break; } catch (e) { why = String(e.message).split('\n')[0]; } }
if (!browser) { console.log(`- no browser could start here (${why}; LAB_BROWSER=<a Chromium>): nc-web-offline skipped\nSKIP nc-web-offline`); process.exit(0); }

const { nc } = await ncBuilt();
const c = nc.normalizeConfig({ auth: { offline: true, username: 'WebBot' }, lanPolicy: { scope: 'same-host', tailscale: { mode: 'off' } }, requireManualConfirmation: false, web: { bind: 'localhost' }, restore: { store: path.join(T, 'snaps'), targets: [] } });
const ok = { allowed: true, reason: 'ok' };
const EP = [
  { id: '42', kind: 'world', address: '127.0.0.1', via: 'this-host', motd: 'Steve', levelName: 'My World', playerCount: 1, playersMax: 8, gameVersion: '1.26.52', lan: { networkId: 42n, port: 7551, world: {} }, preferred: 'lan', decision: ok, warnings: [] },
  { id: '127.0.0.1:19132', kind: 'server', address: '127.0.0.1', via: 'this-host', motd: 'Dedicated Server', levelName: 'lab', playerCount: 0, playersMax: 100, protocol: 2193, gameVersion: '1.26.52', lan: { networkId: 7n, port: 7551, world: {} }, http: { port: 19132 }, preferred: 'http', decision: ok, warnings: [] },
  { id: '10.9.9.9:19132', kind: 'server', address: '10.9.9.9', via: 'lan', motd: 'Far', levelName: 'x', playerCount: 0, playersMax: 10, raknet: { port: 19132 }, preferred: 'raknet', decision: { allowed: false, reason: '10.9.9.9 はこのマシンのアドレスではありません（scope=same-host）' }, warnings: [] },
];
const joins = [];
const deps = {
  discoverEndpoints: async () => { await new Promise((r) => setTimeout(r, 200)); return EP; },
  connectToEndpoint: (config, guard, ep, o) => {
    joins.push({ id: ep.id, transport: o.transport, observe: o.observe });
    const client = new EventEmitter(); client.username = 'WebBot'; client.queue = () => {}; client.close = () => setTimeout(() => client.emit('close'), 10);
    const tracker = { onTransition: (f) => { ['Signaling', 'SdpExchange', 'IceGathering', 'IceChecking', 'Dtls', 'Sctp', 'Connected'].forEach((p, i) => setTimeout(() => f({ to: p }), 60 * (i + 1))); } };
    const done = new Promise((res) => client.once('close', () => res({ connected: true, joined: true, reason: '切断' })));
    setTimeout(() => { o.log('  [route] 確立経路: 127.0.0.1:50000 ⇄ 127.0.0.1:19740（LAN内であることを確認済み）'); o.log('[event] ログイン完了（join）'); client.emit('join'); }, 600);
    return { client, tracker, guard, done, transport: o.transport, observer: { observe: o.observe, allowChat: o.allowChat, blocked: new Map() } };
  },
};
const h = await nc.startWeb(c, { port: 0, deps });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console ' + m.text()); });
try {
  await page.goto(h.urls[0]);
  await page.waitForTimeout(600);
  check(!(await page.isVisible('#token-box')) && /Tailscale なし/.test(await page.textContent('#net')), 'the page opened by its #t= URL: the token taken (no token box), the network chips drawn', await page.textContent('body').then((t) => t.slice(0, 300)));
  await page.click('#scan');
  await page.waitForSelector('.card [data-join]', { timeout: 5000 });
  const cards = await page.$$eval('#endpoints .card .title', (els) => els.map((e) => e.textContent));
  const ways = await page.$$eval('#endpoints .card:nth-child(2) .badges .chip', (els) => els.map((e) => (e.classList.contains('ok') ? '*' : '') + e.textContent));
  const denied = await page.textContent('#denied-sum');
  check(cards.join('|') === 'My World|Dedicated Server' && ways.includes('*HTTP(BDS)') && ways.includes('LAN方式') && denied === '接続できない相手 (1)', '探す → the cards: the world, the server with its two ways in (HTTP the preferred one), the refused one apart', JSON.stringify({ cards, ways, denied }));
  await page.click('.card [data-join]');
  await page.waitForSelector('#join-dlg[open]', { timeout: 3000 });
  const options = await page.$$eval('#j-transport option', (els) => els.map((e) => e.value));
  const observe = await page.$eval('#j-observe', (e) => e.checked);
  check(options.join() === 'lan' && observe === true, '参加 → the dialog: the world\'s way in, observe on for a world (session.observe = auto)', JSON.stringify({ options, observe }));
  await page.$eval('#join-dlg', (d) => { d.returnValue = 'ok'; d.close('ok'); });
  // (locators, not strings: the page's own CSP refuses eval — a string wait would be refused like any script)
  await page.locator('#sessions pre.log').filter({ hasText: 'ログイン完了' }).waitFor({ timeout: 6000 }).catch(() => {});
  await page.locator('#sessions .chip.ok').filter({ hasText: '接続中' }).waitFor({ timeout: 6000 }).catch(() => {});
  const box = (await page.textContent('#sessions')).replace(/\s+/g, ' ');
  const steps = await page.$$eval('#sessions .steps span.done', (els) => els.length);
  check(joins[0]?.id === '42' && joins[0]?.transport === 'lan' && joins[0]?.observe === true && /My World/.test(box) && /接続中/.test(box) && /観戦/.test(box) && steps === 7 && /\[route\] 確立経路/.test(box),
    'the session: connected, observing, all 7 phases done, the log lines in its box', JSON.stringify({ joins, steps, box: box.slice(0, 300) }));
  await page.click('#sessions [data-leave]');
  await page.locator('#sessions').filter({ hasText: '切断' }).waitFor({ timeout: 4000 }).catch(() => {});
  check(/切断/.test(await page.textContent('#sessions')), '退出 → the session shows it left');
  check(errors.length === 0, 'no page error, console error or CSP report', errors.join('\n'));
} finally {
  await browser.close();
  await h.close();
}
console.log(`${bad ? 'FAIL' : 'PASS'} nc-web-offline ${good}/${good + bad}`);
process.exit(bad ? 1 : 0);
