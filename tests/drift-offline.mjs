// node lab.mjs drift (common/drift.mjs): a line of a shared file the stable branch has and this one lacks is a fix or a feature
// that never came across (on 2026-11-14 `bds new ja=`, the Japanese-text QA, ARM in a container and count() in js lines had
// been on main for weeks, missing from dev). The comparison is pure; then the real one against the stable branch when git has
// it here (CI fetches it; a checkout without the network skips that part, said).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = await import(pathToFileURL(path.join(TOP, 'common', 'drift.mjs')).href);
let pass = 0, fail = 0;
const ok = (c, what, detail = '') => { if (c) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}${detail ? `\n     ${String(detail).split('\n').join('\n     ')}` : ''}`); } };

const main = 'const a = 1;\n  const count = (p, id) => 0;\n// a comment that was reworded\n}\n\nconst b = 2;\nconst count = (p, id) => 0;\n', dev = 'const a = 1;\n// the comment, said otherwise\nconst b = 2;\n';
const miss = D.onlyIn(main, dev);
ok(miss.length === 1 && miss[0].text === 'const count = (p, id) => 0;' && miss[0].line === 2, 'a line one side has and the other lacks: found once, with its line (indent, blanks, brackets and comments not counted)', JSON.stringify(miss));
ok(D.onlyIn(dev, dev).length === 0 && D.onlyIn('', dev).length === 0, 'a file against itself: nothing');
const allow = { 'x.js': [{ starts: 'const count', why: 'test' }] };
ok(D.allowed('x.js', 'const count = (p, id) => 0;', allow) && !D.allowed('y.js', 'const count = 1', allow) && !D.allowed('x.js', 'const other', allow), 'a known difference: by file and the start of its line');
const known = JSON.parse(fs.readFileSync(path.join(TOP, 'common', 'data', 'drift-ok.json'), 'utf8'));
const noWhy = Object.entries(known).filter(([k]) => k !== 'about').flatMap(([f, xs]) => xs.filter((x) => !x.starts || !x.why || x.why.length < 8).map((x) => `${f}: ${x.starts}`));
ok(!noWhy.length, 'every known difference says why (none is just silenced)', noWhy.join('\n'));
ok(D.SHARED.every((f) => fs.existsSync(path.join(TOP, f))), 'every shared file is here', D.SHARED.filter((f) => !fs.existsSync(path.join(TOP, f))).join(' '));

// the real comparison, when the stable branch can be had
const ref = process.env.LAB_DRIFT_REF ?? 'origin/main';
const have = spawnSync('git', ['rev-parse', '--verify', '-q', ref], { cwd: TOP }).status === 0 || spawnSync('git', ['fetch', '-q', '--depth=1', 'origin', `${ref.replace(/^origin\//, '')}:refs/remotes/${ref}`], { cwd: TOP, timeout: 60000 }).status === 0;
if (have) {
  const lines = []; const r = D.driftCmd(['--ref', ref], (l) => lines.push(l));
  ok(r, `nothing of ${ref} is missing here in the shared files`, lines.join('\n'));
} else console.log(`skip the real comparison: ${ref} is not here and could not be fetched`);
console.log(fail ? `FAIL drift-offline (${pass}/${pass + fail})` : `PASS drift-offline (${pass}/${pass})`);
process.exit(fail ? 1 : 0);
