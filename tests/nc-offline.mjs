#!/usr/bin/env node
// common/nethernet-connect's own checks, from this checkout's sources (tests/fake/nc.mjs compiles them into a folder of its
// own — the lab's dist/ is not what is tested here, only compared):
//   - the vendored dist/ is what src/ and test/ make now (build.mjs --check), when dist/ is in the checkout
//   - its unit tests (node --test dist/test/unit.test.js): the scope, the guard, SDP, identity, config, phases
//   - its e2e on this machine (dist/test/e2e-local.js, A–G): a bedrock-protocol NetherNet server, discovery → signaling → ICE →
//     DTLS → SCTP → login; candidates and destinations out of scope refused; two connections at once; the CLI's exit codes.
//     It binds UDP 7551: held under the lock every such test takes (tests/fake/lock.mjs UDP_7551)
//   node tests/nc-offline.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ncBuilt, PKG } from './fake/nc.mjs';
import { acquire, UDP_7551 } from './fake/lock.mjs';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let good = 0, bad = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${what}${ok || !detail ? '' : '\n    ' + String(detail).trim().split('\n').slice(-25).join('\n    ')}`); ok ? good++ : bad++; };
const run = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', env: process.env, timeout: 300_000, ...opts });

// ---- the vendored dist/ (what `lan` runs) is current
if (fs.existsSync(path.join(PKG, 'dist'))) {
  const r = run([path.join(PKG, 'build.mjs'), '--check']);
  check(r.status === 0, `common/nethernet-connect/dist is what src/ and test/ make now (${(/\((\d+) files/.exec(r.stdout) ?? [])[1] ?? '?'} files)`, r.stdout + r.stderr);
} else console.log('- common/nethernet-connect/dist is not in this checkout: only the sources are tested');

const { root } = await ncBuilt();

// ---- unit
const u = run(['--test', path.join(root, 'dist', 'test', 'unit.test.js')]);
const n = (k) => Number((new RegExp(`^# ${k} (\\d+)`, 'm').exec(u.stdout) ?? [])[1] ?? NaN);
check(u.status === 0 && n('fail') === 0 && n('pass') > 0, `unit: ${n('pass')} passed, ${n('fail')} failed`, (u.stdout + u.stderr).split('\n').filter((l) => /^not ok|^\s+(error|expected|actual):|Error/.test(l)).join('\n'));

// ---- e2e on this machine (UDP 7551)
await acquire(UDP_7551);
const e = run([path.join(root, 'dist', 'test', 'e2e-local.js')], { cwd: TOP });
const cases = [...(e.stdout ?? '').matchAll(/^=== (PASS|FAIL): (.+)$/gm)].map((m) => [m[1], m[2]]);
check(e.status === 0 && cases.length >= 7 && cases.every(([s]) => s === 'PASS'), `e2e: ${cases.filter(([s]) => s === 'PASS').length}/${cases.length} (${cases.map(([s, c]) => `${s === 'PASS' ? '✔' : '✘'}${c.split(' ')[0]}`).join(' ')})`, (e.stdout ?? '') + (e.stderr ?? ''));

console.log(`${bad ? 'FAIL' : 'PASS'} nc-offline ${good}/${good + bad}`);
process.exit(bad ? 1 : 0);
