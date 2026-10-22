// npm packages installed once into a cache that many processes use at the same moment — the lab's runs, tests side by side (CI's
// gate runs six at once), other work trees. Each set of packages gets a folder of its own (<cache>/deps-<hash of what is asked>),
// installed under a lock (<that folder>.lock: the owner's pid, its time renewed while npm runs) and counted only once npm finished
// it (.installed in it). So nobody reads a node_modules that another process's npm is still writing (a half-written
// typescript.js: "Missing initializer in const declaration"; a minecraft-data without its data files), two npm runs never write
// one folder, and a folder once finished is never written again (a work tree asking for another version gets another folder).
// A lock whose owner is gone, or that has not been renewed for a minute (its pid used again by something else), is taken over;
// an install that never finished is started again from an empty folder. Another set's folder unused for 30 days goes when a
// new set is installed.
//   import { installOnce } from './install.mjs'
//   const dir = await installOnce(cache, { 'bedrock-protocol': '^3.60.1' }, { flags: ['--ignore-scripts'], env: { … } })
//   createRequire(path.join(dir, 'package.json'))('bedrock-protocol')
// (used by build.mjs for the compiler, and by the lab: common/lan.mjs for bedrock-protocol, tests for playwright-core)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const WIN = process.platform === 'win32';
const BEAT_MS = 5_000;          // how often a running install renews its lock
const SILENT_MS = 60_000;       // a lock not renewed for this long is taken over
const UNNAMED_MS = 10_000;      // a lock file still without a pid (being made) for this long is taken over
const SETTLE_MS = 100;          // a lock just made is the owner's when it still says so after this long
const UNUSED_MS = 30 * 86_400_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const held = new Set();
const pending = new Map();
let hooked = false;

/** made by this process now (true), or another's — removed when its owner is gone or silent, for the next try (false) */
function tryLock(file) {
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
    held.add(file);
    if (!hooked) { hooked = true; process.on('exit', () => { for (const f of [...held]) unlock(f); }); }
    return true;
  } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const text = read(file);
  let age = 0;
  try { age = Date.now() - fs.statSync(file).mtimeMs; } catch { return false; }   // (gone meanwhile: the next try)
  const pid = Number(text) || 0;
  // (the same pid but not held here: a process before this one that had it — a container started again)
  const gone = pid ? pid === process.pid || !alive(pid) : age > UNNAMED_MS;
  // (removed only while it still says the same: another process may have taken it over a moment ago)
  if ((gone || age > SILENT_MS) && read(file) === text) { try { fs.rmSync(file, { force: true }); } catch { /* raced */ } }
  return false;
}
function unlock(file) {
  if (!held.delete(file)) return;
  if (read(file) === String(process.pid)) { try { fs.rmSync(file, { force: true }); } catch { /* gone */ } }
}

function npm(dir, flags, env) {
  return new Promise((resolve) => {
    let out = '';
    const keep = (d) => { out = (out + d).slice(-8000); };
    const p = spawn(WIN ? 'npm.cmd' : 'npm', ['i', ...flags, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, shell: WIN, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    p.on('error', (e) => resolve({ status: -1, out: e.message }));
    p.on('close', (status) => resolve({ status, out }));
  });
}

// another set's folder unused for 30 days (its .installed not touched), or never finished and a day old — and not being
// installed now (no lock): removed
function prune(cache, mine) {
  let names = [];
  try { names = fs.readdirSync(cache); } catch { return; }
  for (const n of names) {
    const d = path.join(cache, n);
    if (!/^deps-[0-9a-f]+$/.test(n) || d === mine || fs.existsSync(d + '.lock')) continue;
    try {
      const marker = path.join(d, '.installed');
      const old = fs.existsSync(marker) ? Date.now() - fs.statSync(marker).mtimeMs > UNUSED_MS : Date.now() - fs.statSync(d).mtimeMs > 86_400_000;
      if (old) fs.rmSync(d, { recursive: true, force: true });
    } catch { /* in use, or gone */ }
  }
}

// what is asked, as the folder's .installed says it, and the folder it goes into
function asked(cache, deps, flags, env) {
  const what = JSON.stringify({ deps: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), flags, env });
  return { what, dir: path.resolve(cache, 'deps-' + createHash('sha1').update(what).digest('hex').slice(0, 12)) };
}
/** the folder installOnce(cache, deps, { flags, env }) installs into (its lock: that + '.lock') — nothing is installed */
export const folderFor = (cache, deps, { flags = [], env = {} } = {}) => asked(cache, deps, flags, env).dir;

/**
 * The folder whose node_modules holds `deps` ({ name: version range }), npm-installed there once (with `flags` and `env`) —
 * waited for while another process installs it. Throws npm's own output when npm fails (nothing is counted: the next call tries
 * again), or after `timeoutMs` when another install still holds the lock.
 */
export async function installOnce(cache, deps, { flags = [], env = {}, timeoutMs = 20 * 60_000 } = {}) {
  const { dir, what } = asked(cache, deps, flags, env);
  const marker = path.join(dir, '.installed');
  const done = () => read(marker) === what;
  if (done()) {
    try { const t = new Date(); fs.utimesSync(marker, t, t); } catch { /* read-only: it only tells prune it is used */ }
    return dir;
  }
  if (pending.has(dir)) return pending.get(dir);
  const job = (async () => {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const lock = dir + '.lock', end = Date.now() + timeoutMs;
    for (;;) {
      if (done()) return dir;
      if (tryLock(lock)) {
        // (still ours a moment later: a process taking over a silent lock at the same instant may have removed this one)
        await sleep(SETTLE_MS);
        if (read(lock) === String(process.pid)) break;
        held.delete(lock);
      }
      if (Date.now() > end) throw new Error(`another install still holds ${lock} after ${Math.round(timeoutMs / 1000)} s (when no npm is running, remove that file)`);
      await sleep(200);
    }
    const beat = setInterval(() => { try { const t = new Date(); fs.utimesSync(lock, t, t); } catch { /* gone */ } }, BEAT_MS);
    try {
      if (done()) return dir;
      // (what an install that never finished left: from the beginning)
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: deps }, null, 1) + '\n');
      const r = await npm(dir, flags, env);
      if (r.status !== 0) throw new Error(`npm i ${Object.entries(deps).map(([n, v]) => `${n}@${v}`).join(' ')} failed (in ${dir}):\n${r.out.trim().slice(-1200)}`);
      fs.writeFileSync(marker, what);
      prune(path.dirname(dir), dir);
      return dir;
    } finally {
      clearInterval(beat);
      unlock(lock);
    }
  })();
  pending.set(dir, job);
  try { return await job; } finally { pending.delete(dir); }
}
