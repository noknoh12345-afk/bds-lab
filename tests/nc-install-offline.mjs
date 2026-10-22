#!/usr/bin/env node
// common/nethernet-connect/install.mjs — npm packages installed once into a cache that many processes use at the same moment —
// with a stand-in npm first on PATH: it writes each package's package.json, waits, then its code, so a reader that does not wait
// for the end finds a package without its code. Why: CI's gate runs six tests at once, and four of them installed TypeScript and
// bedrock-protocol into the same folders at the same moment — one read a half-written typescript.js ("Missing initializer in
// const declaration"), two a minecraft-data without its data files.
// Checks: six processes at once (npm once, never two in one folder, every one gets the whole install) · installed: no npm again ·
// another set of packages: a folder of its own, the first one untouched · two calls at once in one process · npm failing (its
// words said, nothing counted, the lock given back: the next call tries again) · an install killed in the middle (its lock taken
// over at once, started again from an empty folder) · a lock not renewed for a minute (its pid used again) and one never given
// a pid: taken over at once · a lock a live install holds: waited for · other sets' folders unused for 30 days pruned, the
// recent, locked and just-started ones kept · the lab's ncDeps (common/lan.mjs): its flags, the layout before it removed,
// auth/ and snapshots/ kept.
//   node tests/nc-install-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(TOP, 'common', 'nethernet-connect', 'install.mjs');
let good = 0, bad = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${what}${ok || !detail ? '' : '\n    ' + String(detail).slice(0, 1500)}`); ok ? good++ : bad++; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-install-'));
const kids = new Set();
process.on('exit', () => { for (const p of kids) try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* gone */ } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await sleep(40); } return false; };

// ---- the stand-in npm (`npm i …` in the folder it runs in): a JSON line per event into FAKE_NPM_LOG
const FAKE = `
const fs = require('fs'), path = require('path');
const cwd = process.cwd(), log = (ev, more = {}) => fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ pid: process.pid, ev, cwd, ...more }) + '\\n');
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const busy = path.join(cwd, '.fake-busy');
if (fs.existsSync(busy)) log('overlap');
fs.writeFileSync(busy, String(process.pid));
log('start', { args: process.argv.slice(2), allowGit: process.env.npm_config_allow_git || null });
const deps = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).dependencies || {};
for (const [n, v] of Object.entries(deps)) {
  if (n.startsWith('fail-')) { process.stderr.write('npm ERR! a stand-in failure for ' + n + '\\n'); fs.rmSync(busy, { force: true }); log('fail'); process.exit(1); }
  const d = path.join(cwd, 'node_modules', n);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: n, version: String(v).replace(/^\\^/, ''), main: 'index.js' }));
  wait(Number(process.env.FAKE_NPM_MS || 300));
  if (process.env.FAKE_NPM_HANG && fs.existsSync(process.env.FAKE_NPM_HANG)) { log('hang'); for (;;) wait(1000); }
  fs.writeFileSync(path.join(d, 'index.js'), "module.exports = 'complete';\\n");
}
fs.rmSync(busy, { force: true });
log('end');
`;
const BIN = path.join(T, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'npm'), `#!${process.execPath}\n${FAKE}`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'npm.js'), FAKE);
fs.writeFileSync(path.join(BIN, 'npm.cmd'), `@"${process.execPath}" "%~dp0npm.js" %*\r\n`);
const LOG = path.join(T, 'npm.log'), HANG = path.join(T, 'hang');
Object.assign(process.env, { PATH: BIN + path.delimiter + process.env.PATH, FAKE_NPM_LOG: LOG, FAKE_NPM_HANG: HANG });
const events = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const runs = (dir) => events().filter((e) => e.ev === 'start' && (!dir || path.resolve(e.cwd) === path.resolve(dir)));
const overlaps = () => events().filter((e) => e.ev === 'overlap').length;

const { installOnce, folderFor } = await import(pathToFileURL(INSTALL).href);
const CHILD = `
import { installOnce } from ${JSON.stringify(pathToFileURL(INSTALL).href)};
import { createRequire } from 'node:module';
import path from 'node:path';
const deps = JSON.parse(process.env.DEPS), t0 = Date.now();
try {
  const d = await installOnce(process.env.CACHE, deps);
  const req = createRequire(path.join(d, 'package.json'));
  const whole = Object.keys(deps).every((n) => { try { return req(n) === 'complete'; } catch { return false; } });
  console.log(JSON.stringify({ d, whole, ms: Date.now() - t0 }));
} catch (e) { console.log(JSON.stringify({ error: e.message, ms: Date.now() - t0 })); process.exitCode = 2; }
`;
/** a process of its own calling installOnce(cache, deps): { p, result: Promise<{ code, d, whole, ms, error, out }> } */
function child(cache, deps) {
  const p = spawn(process.execPath, ['--input-type=module', '-e', CHILD], { env: { ...process.env, CACHE: cache, DEPS: JSON.stringify(deps) }, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.add(p.pid);
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  const result = new Promise((res) => p.on('close', (code) => {
    kids.delete(p.pid);
    let j = {};
    try { j = JSON.parse(out.trim().split('\n').pop()); } catch { /* not JSON: out says */ }
    res({ code, out, ...j });
  }));
  return { p, result };
}
const ago = (f, ms) => { const t = new Date(Date.now() - ms); fs.utimesSync(f, t, t); };
/** one case: an exception in it is its failure (the next cases still run) */
const step = async (what, fn) => { try { await fn(); } catch (e) { check(false, what + ' (threw)', e.stack); } };

// 1) six processes at once
const C1 = path.join(T, 'c1'), D1 = { beta: '^2.0.0', alpha: '1.0.0' };
let dir1 = folderFor(C1, D1);
await step('six processes at once', async () => {
  const six = await Promise.all(Array.from({ length: 6 }, () => child(C1, D1).result));
  dir1 = six[0].d ?? dir1;
  check(six.every((r) => r.code === 0 && r.whole && r.d === dir1) && runs().length === 1 && !overlaps() && /^deps-[0-9a-f]{12}$/.test(path.basename(dir1 ?? '')) && path.dirname(dir1 ?? '') === path.resolve(C1) && !fs.existsSync(dir1 + '.lock') && dir1 === folderFor(C1, D1),
    'six processes at once: npm ran once (never two in one folder), every one got the whole install, in <cache>/deps-<hash>, the lock given back', JSON.stringify({ six: six.map((r) => r.error ?? r.whole), dirs: [...new Set(six.map((r) => r.d))], events: events() }));
});

// 2) installed: no npm again (a process of its own, and this one)
await step('installed: no npm again', async () => {
  const again = await child(C1, { alpha: '1.0.0', beta: '^2.0.0' }).result;
  const here = await installOnce(C1, D1);
  check(again.whole && again.d === dir1 && here === dir1 && runs().length === 1, 'installed: no npm again — the same set asked in another order, from another process or this one', JSON.stringify({ again, here }));
});

// 3) another set: a folder of its own; the first one stays as it was
await step('another set of packages', async () => {
  const other = await child(C1, { alpha: '1.1.0' }).result;
  const firstStays = JSON.parse(fs.readFileSync(path.join(dir1, 'node_modules', 'alpha', 'package.json'), 'utf8')).version === '1.0.0';
  check(other.whole && other.d !== dir1 && runs(other.d).length === 1 && runs(dir1).length === 1 && firstStays, 'another set of packages: a folder of its own, the first one not written again', JSON.stringify({ other, firstStays }));
});

// 4) two calls at once in one process
await step('two calls at once in one process', async () => {
  const C4 = path.join(T, 'c4');
  const [a4, b4] = await Promise.all([installOnce(C4, { gamma: '1.0.0' }), installOnce(C4, { gamma: '1.0.0' })]);
  check(a4 === b4 && runs(a4).length === 1 && createRequire(path.join(a4, 'package.json'))('gamma') === 'complete', 'two calls at once in one process: one npm, both get the folder');
});

// 5) npm failing
await step('npm failing', async () => {
  const C5 = path.join(T, 'c5'), D5 = { 'fail-x': '1.0.0' }, dir5 = folderFor(C5, D5);
  const f1 = await child(C5, D5).result;
  const f2 = await child(C5, D5).result;
  check(f1.code === 2 && /npm i fail-x@1\.0\.0 failed/.test(f1.error) && /a stand-in failure for fail-x/.test(f1.error) && !fs.existsSync(path.join(dir5, '.installed')) && !fs.existsSync(dir5 + '.lock') && f2.code === 2 && runs(dir5).length === 2,
    'npm failing: its own words in the error, nothing counted, the lock given back — the next call runs npm again', JSON.stringify({ f1: f1.error ?? f1.out, f2: f2.error ?? f2.out, runs: runs(dir5).length }));
});

// 6) an install killed in the middle (the process and its npm): the next takes its lock over at once and starts from empty
await step('an install killed in the middle', async () => {
  const C6 = path.join(T, 'c6'), D6 = { delta: '1.0.0' }, dir6 = folderFor(C6, D6);
  fs.writeFileSync(HANG, '');
  const k = child(C6, D6);
  const hung = await until(() => events().some((e) => e.ev === 'hang' && path.resolve(e.cwd) === dir6));
  const npmPid = events().find((e) => e.ev === 'start' && path.resolve(e.cwd) === dir6)?.pid;
  const lockedBy = fs.existsSync(dir6 + '.lock') ? Number(fs.readFileSync(dir6 + '.lock', 'utf8')) : 0;
  k.p.kill('SIGKILL');
  try { process.kill(npmPid, 'SIGKILL'); } catch { /* gone */ }
  await k.result;
  fs.rmSync(HANG);
  fs.mkdirSync(dir6, { recursive: true });
  fs.writeFileSync(path.join(dir6, 'leftover'), 'from the killed install');
  const after6 = await child(C6, D6).result;
  check(hung && lockedBy === k.p.pid && after6.whole && after6.ms < 5000 && runs(dir6).length === 2 && !fs.existsSync(path.join(dir6, 'leftover')) && !overlaps(),
    'an install killed in the middle: its lock (the dead pid) taken over at once, the folder started again from empty', JSON.stringify({ hung, lockedBy, kid: k.p.pid, after6, runs: runs(dir6).length }));
});

// 7) a lock not renewed for over a minute (its pid is alive: used again by another process), and one never given a pid
await step('a lock not renewed / never given a pid', async () => {
  const C7 = path.join(T, 'c7'), D7a = { eps: '1.0.0' }, D7b = { zeta: '1.0.0' };
  fs.mkdirSync(C7, { recursive: true });
  fs.writeFileSync(folderFor(C7, D7a) + '.lock', String(process.pid));
  ago(folderFor(C7, D7a) + '.lock', 2 * 60_000);
  fs.writeFileSync(folderFor(C7, D7b) + '.lock', '');
  ago(folderFor(C7, D7b) + '.lock', 20_000);
  const [s7a, s7b] = await Promise.all([child(C7, D7a).result, child(C7, D7b).result]);
  check(s7a.whole && s7a.ms < 5000 && s7b.whole && s7b.ms < 5000, 'a lock not renewed for over a minute (a live pid: one used again), and one left without a pid: taken over at once', JSON.stringify({ s7a, s7b }));
});

// 8) a lock a live install holds (its pid alive, its time fresh): waited for, then installed once it is given back
await step('a lock a live install holds', async () => {
  const C8 = path.join(T, 'c8'), D8 = { eta: '1.0.0' }, dir8 = folderFor(C8, D8);
  const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  kids.add(holder.pid);
  fs.mkdirSync(C8, { recursive: true });
  fs.writeFileSync(dir8 + '.lock', String(holder.pid));
  const w = child(C8, D8);
  let early = false;
  w.result.then(() => { early = true; });
  await sleep(1500);
  const waited = !early && runs(dir8).length === 0;
  fs.rmSync(dir8 + '.lock', { force: true });
  const after8 = await w.result;
  holder.kill('SIGKILL');
  check(waited && after8.whole && runs(dir8).length === 1, 'a lock a live install holds: waited for (no npm meanwhile), then installed once given back', JSON.stringify({ waited, after8 }));
});

// 9) other sets' folders: unused for 30 days, or never finished and a day old — removed when a set is installed; recent,
//    locked and just-started ones kept (and what is not a deps- folder)
await step("other sets' folders pruned", async () => {
  const C9 = path.join(T, 'c9');
  const mk = (n, { installedAgo = null, dirAgo = 0, locked = false } = {}) => {
    const d = path.join(C9, n);
    fs.mkdirSync(path.join(d, 'node_modules'), { recursive: true });
    if (installedAgo !== null) { fs.writeFileSync(path.join(d, '.installed'), '{}'); ago(path.join(d, '.installed'), installedAgo); }
    if (locked) fs.writeFileSync(d + '.lock', String(process.pid));
    if (dirAgo) ago(d, dirAgo);
    return d;
  };
  const DAY = 86_400_000;
  const old9 = mk('deps-aaaaaaaaaaaa', { installedAgo: 40 * DAY }), recent9 = mk('deps-bbbbbbbbbbbb', { installedAgo: DAY });
  const locked9 = mk('deps-cccccccccccc', { installedAgo: 40 * DAY, locked: true }), stale9 = mk('deps-dddddddddddd', { dirAgo: 2 * DAY });
  const fresh9 = mk('deps-eeeeeeeeeeee'), keep9 = mk('mine-too', { dirAgo: 90 * DAY });
  const new9 = await installOnce(C9, { theta: '1.0.0' });
  check(!fs.existsSync(old9) && !fs.existsSync(stale9) && [recent9, locked9, fresh9, keep9, new9].every((d) => fs.existsSync(d)),
    'other sets\' folders: unused for 30 days or never finished for a day — removed; a recent one, a locked one, one just started and other folders kept',
    JSON.stringify(fs.readdirSync(C9)));
});

// 10) the lab's ncDeps (common/lan.mjs): bedrock-protocol with its flags; the layout before removed, auth/ and snapshots/ kept
await step("the lab's ncDeps", async () => {
  const L = path.join(T, 'lab'), NCD = path.join(L, 'nc');
  for (const [f, t] of [['node_modules/bedrock-protocol/package.json', '{}'], ['package.json', '{}'], ['package-lock.json', '{}'], ['auth/acc.json', '{"k":1}'], ['snapshots/s1/x.txt', 'x']]) {
    fs.mkdirSync(path.dirname(path.join(NCD, f)), { recursive: true });
    fs.writeFileSync(path.join(NCD, f), t);
  }
  const lan = await import(pathToFileURL(path.join(TOP, 'common', 'lan.mjs')).href);
  const nd = await lan.ncDeps(L);
  const nd2 = await lan.ncDeps(L);
  const st = runs(nd)[0] ?? {};
  check(nd === nd2 && path.dirname(nd) === NCD && runs(nd).length === 1 && st.args?.includes('--ignore-scripts') && st.allowGit === 'all' && createRequire(path.join(nd, 'package.json'))('bedrock-protocol') === 'complete'
    && !fs.existsSync(path.join(NCD, 'node_modules')) && !fs.existsSync(path.join(NCD, 'package.json')) && !fs.existsSync(path.join(NCD, 'package-lock.json')) && fs.existsSync(path.join(NCD, 'auth', 'acc.json')) && fs.existsSync(path.join(NCD, 'snapshots', 's1', 'x.txt')),
    'the lab\'s ncDeps: <cache>/nc/deps-…, npm with --ignore-scripts and allow_git, once; the layout before (node_modules straight in nc/) removed, auth/ and snapshots/ kept',
    JSON.stringify({ nd, start: st, left: fs.readdirSync(NCD) }));
});

console.log(`${bad ? 'FAIL' : 'PASS'} nc-install-offline ${good}/${good + bad}`);
process.exit(bad ? 1 : 0);
