#!/usr/bin/env node
// common/goall.mjs without a server: how many at once, which folders are units, the pool never runs more than asked, and the
// rule that keeps the bar where it is — a unit not DONE beside others runs once more alone, and that run is the verdict.
//   node tests/goall-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { autoJobs, listUnits, pool, goAll, byLongestFirst, lastTimes } from '../common/goall.mjs';

let good = 0, bad = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${what}${ok || !detail ? '' : '\n    ' + detail}`); ok ? good++ : bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// autoJobs: cores, memory (1.5 GB each), the cap, the number of units; never less than one
check(autoJobs({ cores: 4, memGB: 16, units: 12 }) === 4, 'autoJobs: one per core');
check(autoJobs({ cores: 8, memGB: 4, units: 12 }) === 2, 'autoJobs: memory bounds it (1.5 GB each)');
check(autoJobs({ cores: 64, memGB: 256, units: 40 }) === 8, 'autoJobs: at most 8');
check(autoJobs({ cores: 16, memGB: 64, units: 3 }) === 3, 'autoJobs: not more than there are units');
check(autoJobs({ cores: 1, memGB: 0.5, units: 5 }) === 1, 'autoJobs: at least one');

// listUnits: folders with tests.txt, not the selftest's own, not borrowed ones
const top = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-goall-'));
for (const [n, t] of [['coins', 1], ['zone', 1], ['notests', 0], ['labkit', 1], ['labselftest', 1], ['borrowed_x', 1]]) { fs.mkdirSync(path.join(top, 'bds', 'addons', n), { recursive: true }); if (t) fs.writeFileSync(path.join(top, 'bds', 'addons', n, 'tests.txt'), '## x\n'); }
fs.writeFileSync(path.join(top, 'bds', 'addons', 'afile'), '');
check(JSON.stringify(listUnits(top, ['bds', 'end']).map((u) => u.name)) === '["coins","zone"]', 'listUnits: units with tests, sorted; no labkit / labselftest / borrowed_ / files', JSON.stringify(listUnits(top, ['bds', 'end'])));

// the order: the longest of the last run first, a unit never run before all of them
check(byLongestFirst([{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'new' }], { a: 30, b: 120, c: 30 }).map((u) => u.name).join(' ') === 'new b a c', 'byLongestFirst: new units, then by the last time, then by name');
check(JSON.stringify(lastTimes(path.join(top, 'nowhere'))) === '{}', 'lastTimes: no earlier run is fine');

// pool: never more than `jobs` at once, every task once, results in the tasks' order
{
  let now = 0, peak = 0; const seen = [];
  const res = await pool([5, 4, 3, 2, 1, 0], 3, async (t) => { now++; peak = Math.max(peak, now); seen.push(t); await sleep(10 + t * 5); now--; return t * 2; });
  check(peak === 3, 'pool: as many at once as asked, not more', `peak ${peak}`);
  check(JSON.stringify(res) === '[10,8,6,4,2,0]' && seen.length === 6, 'pool: every task once, results in order', JSON.stringify(res));
  const one = await pool([1, 2], 9, async (t) => t);
  check(JSON.stringify(one) === '[1,2]', 'pool: more jobs than tasks is fine');
}

// goAll: the verdicts
const units = ['a', 'b', 'c', 'd'].map((name) => ({ kind: 'bds', name }));
const mk = (plan) => {   // plan[unit] = the results of its runs, in order
  const calls = {}, running = { now: 0, peak: 0, aloneOk: true }; let phase2 = false;
  const runUnit = async (u) => {
    const k = (calls[u.name] = (calls[u.name] ?? 0) + 1); if (k > 1) phase2 = true;
    running.now++; running.peak = Math.max(running.peak, running.now); if (phase2 && running.now > 1) running.aloneOk = false;
    await sleep(15); running.now--;
    const ok = plan[u.name][k - 1];
    return { ok, text: ok ? `DONE dist/${u.name}.mcaddon (test 3/3, qa clean)` : `Q script time 3ms per tick\n  FAIL test 3/3, qa 1 problem(s)`, ms: 15 };
  };
  return { runUnit, calls, running };
};
{
  const m = mk({ a: [true], b: [true], c: [true], d: [true] }), lines = [];
  const s = await goAll({ units, jobs: 2, runUnit: m.runUnit, say: (l) => lines.push(l), summaryFile: null });
  check(s.ok && s.units.every((r) => r.ok && !r.alone) && m.running.peak === 2, 'all DONE beside each other: ok, nothing run twice', lines.join(' | '));
  check(/4\/4 DONE/.test(lines.at(-1)), 'the last line counts them', lines.at(-1));
}
{
  const m = mk({ a: [true], b: [false, true], c: [true], d: [false, false] }), lines = [];
  const s = await goAll({ units, jobs: 4, runUnit: m.runUnit, say: (l) => lines.push(l), summaryFile: null });
  const b = s.units.find((r) => r.unit === 'b'), d = s.units.find((r) => r.unit === 'd');
  check(!s.ok && d.ok === false && d.alone, 'not DONE alone either: the run fails (the bar is not lowered)');
  check(b.ok && b.alone && m.calls.b === 2 && m.calls.a === 1, 'not DONE beside others, DONE alone: passes, and only that unit ran twice');
  check(m.running.aloneOk, 'the second runs are one at a time, with nothing beside them');
  check(lines.some((l) => /^W b: DONE alone, but beside others/.test(l)), 'a unit that passed only alone is named (W)', lines.join(' | '));
  check(lines.some((l) => /^not DONE: d/.test(l)) && /passed only alone: b/.test(lines.find((l) => /DONE in/.test(l)) ?? ''), 'the summary names both kinds');
}
{
  const m = mk({ a: [false], b: [true], c: [true], d: [true] });
  const s = await goAll({ units, jobs: 4, retry: false, runUnit: m.runUnit, say: () => {}, summaryFile: null });
  check(!s.ok && m.calls.a === 1, '--no-retry: the first result stands');
  const m1 = mk({ a: [false], b: [true], c: [true], d: [true] });
  const s1 = await goAll({ units, jobs: 1, runUnit: m1.runUnit, say: () => {}, summaryFile: null });
  check(!s1.ok && m1.calls.a === 1, 'one at a time: a failure is already the alone result, not run again');
}
{
  const dir = path.join(top, 'logs'), md = path.join(top, 'summary.md'), m = mk({ a: [true], b: [false, true], c: [true], d: [true] });
  await goAll({ units, jobs: 2, runUnit: m.runUnit, say: () => {}, logDir: dir, summaryFile: md });
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  check(j.ok && j.units.length === 4 && fs.existsSync(path.join(dir, 'b.txt')) && fs.existsSync(path.join(dir, 'b-alone.txt')), 'each unit\'s output and summary.json are kept');
  check(/\| b \| DONE \(alone\) \|/.test(fs.readFileSync(md, 'utf8')), 'the job summary table says which passed only alone');
}
fs.rmSync(top, { recursive: true, force: true });
console.log(bad ? `FAIL ${bad} of ${good + bad}` : `PASS ${good} checks`);
process.exit(bad ? 1 : 0);
