#!/usr/bin/env node
// tests/fake/lock.mjs: a lock across processes — the second waits until the first lets go (or ends), a lock left by a
// process that is gone is taken over, one held is held again at once (re-entrant), withLock gives it back.
//   node tests/lock-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acquire, release, withLock } from './fake/lock.mjs';

const LOCK = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake', 'lock.mjs')).href;
const name = `selftest-${process.pid}`, dir = path.join(os.tmpdir(), `bds-lab-lock-${name}`);
let good = 0, bad = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${what}${ok || !detail ? '' : '\n    ' + detail}`); ok ? good++ : bad++; };
// a child that takes the lock, says so, holds it for ms, then ends (exit releases)
const child = (ms) => new Promise((res) => {
  const c = spawn(process.execPath, ['--input-type=module', '-e', `import { acquire } from ${JSON.stringify(LOCK)}; await acquire(${JSON.stringify(name)}); console.log('got ' + Date.now()); setTimeout(() => {}, ${ms});`]);
  let out = ''; c.stdout.on('data', (b) => { out += b; if (/got/.test(out)) res({ c, at: Number(/got (\d+)/.exec(out)[1]), done: new Promise((r) => c.on('close', r)) }); });
});

const a = await child(1500);
const t0 = Date.now();
await acquire(name);
check(Date.now() - t0 > 1000 && Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8')) === process.pid, 'the second waits until the first process ends, then holds it', `waited ${Date.now() - t0} ms`);
await acquire(name);
check(true, 'held again at once by its holder');
release(name);
check(!fs.existsSync(dir), 'release takes the folder away');
await a.done;

// a lock left by a process that is gone (a pid that cannot be running)
fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'pid'), '999999999');
const t1 = Date.now();
await withLock(name, async () => { check(Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8')) === process.pid && Date.now() - t1 < 1000, 'a lock whose owner is gone is taken over at once'); });
check(!fs.existsSync(dir), 'withLock gives it back');

console.log(`${bad ? 'FAIL' : 'PASS'} lock-offline ${good}/${good + bad}`);
process.exit(bad ? 1 : 0);
