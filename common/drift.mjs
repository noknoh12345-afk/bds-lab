// node lab.mjs drift [--ref <git ref>] [--all]: what the stable branch has that this one lacks, in the files both keep alike.
// dev carries everything main has and more; a line of a shared file found on main and nowhere in dev's copy is a fix or a
// feature that never came across (on 2026-11-14: `bds new ja=`, the Japanese-text QA, ARM in a container, count() in js lines
// had been on main for weeks, missing from dev). Lines that differ on purpose (dev's newer version of the same thing, the
// stable branch's "not here" words) are listed in common/data/drift-ok.json with why. Exit 1 when one is neither.
//   --ref  the other branch (default origin/main; fetched once when it is not here)   --all  every file git keeps on both
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** the files both branches keep alike (a change to one belongs in the other) */
export const SHARED = ['common/helper.js', 'common/build.mjs', 'tests/buildlock-offline.mjs', 'tests/dev-bds.mjs', 'common/runtime.mjs', 'common/codeline.mjs', 'common/serverimport.mjs', 'install.sh', 'install.ps1', 'setup.cmd', 'setup.sh',
  'lab.sh', 'lab.cmd', 'vps/runner-setup.sh', '.github/workflows/vps.yml', 'common/core.mjs', 'common/checkpoint.mjs', 'common/deploy.mjs', 'tests/jsline-offline.mjs', 'tests/serverimport-offline.mjs'];
// (a line worth comparing: code, not a blank, a lone bracket or a comment's words — those change with every rewording)
const meaningful = (l) => { const t = l.trim(); return t.length > 3 && !/^(\/\/|#|\*|\/\*|<!--|rem\b)/i.test(t) && !/^[{}()[\];,]+$/.test(t); };
/** the lines of a that b lacks (pure): trimmed, meaningful ones, each once, in a's order */
export function onlyIn(a, b) {
  const have = new Set(String(b ?? '').split(/\r?\n/).map((l) => l.trim()));
  const seen = new Set(), out = [];
  String(a ?? '').split(/\r?\n/).forEach((l, i) => { const t = l.trim(); if (meaningful(l) && !have.has(t) && !seen.has(t)) { seen.add(t); out.push({ line: i + 1, text: t }); } });
  return out;
}
/** the allowed differences: { "<file>": [{ "starts": "<the line's start>", "why": "..." }] } */
export function allowed(file, text, ok) { return (ok?.[file] ?? []).some((x) => text.startsWith(x.starts)); }

const git = (a) => spawnSync('git', a, { cwd: TOP, encoding: 'utf8', maxBuffer: 256e6 });
export function driftCmd(args = [], out = console.log) {
  const i = args.indexOf('--ref'), ref = i >= 0 ? args[i + 1] : 'origin/main';
  if (git(['rev-parse', '--verify', '-q', ref]).status !== 0) {
    const m = /^origin\/(.+)$/.exec(ref);
    if (m) git(['fetch', '-q', '--depth=1', 'origin', `${m[1]}:refs/remotes/origin/${m[1]}`]);
    if (git(['rev-parse', '--verify', '-q', ref]).status !== 0) { out(`ERR drift: ${ref} is not here and could not be fetched (git fetch origin main)`); return false; }
  }
  let ok = {}; try { ok = JSON.parse(fs.readFileSync(path.join(TOP, 'common', 'data', 'drift-ok.json'), 'utf8')); } catch { /* none allowed */ }
  const files = args.includes('--all') ? git(['ls-tree', '-r', '--name-only', ref]).stdout.split('\n').filter((f) => f && fs.existsSync(path.join(TOP, f)) && /\.(m?js|cjs|sh|ps1|cmd|ya?ml)$/.test(f)) : SHARED;
  let bad = 0, known = 0;
  for (const f of files) {
    const theirs = git(['show', `${ref}:${f}`]);
    if (theirs.status !== 0 || !fs.existsSync(path.join(TOP, f))) continue;   // (a file one branch alone has: not a drift)
    const miss = onlyIn(theirs.stdout, fs.readFileSync(path.join(TOP, f), 'utf8'));
    const left = miss.filter((m) => !allowed(f, m.text, ok)); known += miss.length - left.length;
    if (!left.length) continue;
    bad += left.length;
    out(`✘ ${f}: ${left.length} line(s) ${ref} has and this branch lacks`);
    for (const m of left.slice(0, 8)) out(`    ${ref}:${f}:${m.line}  ${m.text.slice(0, 150)}`);
    if (left.length > 8) out(`    … +${left.length - 8}`);
  }
  out(bad ? `FAIL drift: ${bad} line(s) of ${ref} not here (bring each across, or add it to common/data/drift-ok.json with why)` : `OK drift: nothing of ${ref} missing here in ${files.length} shared file(s)${known ? ` (${known} known differences, common/data/drift-ok.json)` : ''}`);
  return !bad;
}
