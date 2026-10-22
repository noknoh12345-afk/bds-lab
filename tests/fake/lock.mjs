// A lock across processes — and across work trees: a folder in the system's temp folder, made atomically (mkdir), with the
// owner's pid in it. A lock whose owner is gone is taken over; one made a moment ago and not yet given its pid is waited for
// (and taken over when it stays without one). Released when the process ends, whatever way it ends.
//   import { acquire, withLock, UDP_7551 } from './fake/lock.mjs'
//   await acquire(UDP_7551)          the tests that bind UDP 7551 (the LAN discovery port: bedrock-protocol's NetherNet server
//                                    binds it without SO_REUSEADDR, so two at once fail with EADDRINUSE) hold it to the end
//   await withLock('nc-npm', fn)     held while fn runs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const UDP_7551 = 'udp-7551';
const dirOf = (name) => path.join(os.tmpdir(), `bds-lab-lock-${String(name).replace(/[^\w.-]/g, '_')}`);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const held = new Set();
let hooked = false;
const releaseAll = () => { for (const name of [...held]) release(name); };

/** wait until this process holds `name` (re-entrant: holding it already is enough). Throws after timeoutMs */
export async function acquire(name, { timeoutMs = 10 * 60_000, pollMs = 150 } = {}) {
  if (held.has(name)) return;
  const d = dirOf(name), pidFile = path.join(d, 'pid'), end = Date.now() + timeoutMs;
  for (;;) {
    try {
      fs.mkdirSync(d);
      fs.writeFileSync(pidFile, String(process.pid));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0, age = 0;
      try { pid = Number(fs.readFileSync(pidFile, 'utf8')) || 0; } catch { /* not written yet */ }
      try { age = Date.now() - fs.statSync(d).mtimeMs; } catch { continue; }   // (gone meanwhile: try again at once)
      // (an owner that is gone, or a folder left without a pid for long: taken over)
      if ((pid && pid !== process.pid && !alive(pid)) || (!pid && age > 10_000)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* raced */ } continue; }
      if (Date.now() > end) throw new Error(`lock ${name}: still held by pid ${pid || '?'} after ${Math.round(timeoutMs / 1000)} s (${d})`);
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
  held.add(name);
  if (!hooked) {
    hooked = true;
    process.on('exit', releaseAll);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { releaseAll(); process.exit(128 + (os.constants.signals[sig] ?? 1)); });
  }
}

/** give `name` back (only when this process is the one holding it) */
export function release(name) {
  if (!held.delete(name)) return;
  const d = dirOf(name);
  try { if (Number(fs.readFileSync(path.join(d, 'pid'), 'utf8')) === process.pid) fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ }
}

/** fn() while holding `name` */
export async function withLock(name, fn, opts) {
  const had = held.has(name);
  await acquire(name, opts);
  try { return await fn(); } finally { if (!had) release(name); }
}
