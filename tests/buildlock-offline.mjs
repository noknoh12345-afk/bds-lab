// common/build.mjs withLock: several lab processes build at once (go all, a test running two units, CI's units side by side) and
// each may install the build tools or an SDK into the same cache folder. Before, the second one emptied the folder while the first
// was installing into it: npm failed with nothing to say, the failure was kept for 10 minutes, every build in them went untyped
// (CI's dev-bds on BDS 1.26.63, two runs in a row). Three processes here: one at a time, the later ones find the first's work.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = pathToFileURL(path.join(TOP, 'common', 'build.mjs')).href;
let pass = 0, fail = 0;
const ok = (c, what, detail = '') => { if (c) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}${detail ? `\n     ${detail}` : ''}`); } };
const X = fs.mkdtempSync(path.join(os.tmpdir(), 'buildlock-')), dir = path.join(X, 'sdk', 'abc'), log = path.join(X, 'log');
const child = `import fs from 'node:fs'; const { withLock } = await import(${JSON.stringify(B)});
withLock(${JSON.stringify(dir)}, () => {
  if (fs.existsSync(${JSON.stringify(dir)} + '/ok')) { fs.appendFileSync(${JSON.stringify(log)}, 'found\\n'); return; }
  fs.appendFileSync(${JSON.stringify(log)}, 'start\\n'); fs.rmSync(${JSON.stringify(dir)}, { recursive: true, force: true }); fs.mkdirSync(${JSON.stringify(dir)}, { recursive: true });
  const end = Date.now() + 800; while (Date.now() < end) {}
  fs.writeFileSync(${JSON.stringify(dir)} + '/ok', 'x'); fs.appendFileSync(${JSON.stringify(log)}, 'end\\n');
});`;
await Promise.all([1, 2, 3].map(() => new Promise((res) => spawn(process.execPath, ['--input-type=module', '-e', child], { stdio: 'inherit' }).on('close', res))));
const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
ok(lines.join(',') === 'start,end,found,found', `one install at a time, the others find it done (${lines.join(',')})`);
ok(!fs.existsSync(`${dir}.lock`) && fs.existsSync(path.join(dir, 'ok')), 'the lock gone after, the work kept');
// a lock a dead process left: taken over once it is old
const { withLock } = await import(B);
fs.mkdirSync(`${dir}.lock`); const old = new Date(Date.now() - 20 * 60_000); fs.utimesSync(`${dir}.lock`, old, old);
let ran = false; withLock(dir, () => { ran = true; });
ok(ran && !fs.existsSync(`${dir}.lock`), 'a lock left by a process that died (older than 15 min): taken over');
fs.mkdirSync(`${dir}.lock`); let e = null; try { withLock(dir, () => {}, { waitMs: 400 }); } catch (x) { e = x; }
ok(e && /another install has held it/.test(e.message), 'a lock still held: waited for, then said', e?.message);
fs.rmSync(X, { recursive: true, force: true });
console.log(fail ? `FAIL buildlock-offline (${pass}/${pass + fail})` : `PASS buildlock-offline (${pass}/${pass})`);
process.exit(fail ? 1 : 0);
