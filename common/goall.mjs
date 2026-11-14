// go all: every unit through `go` (build → tests.txt on a real server → QA → DONE), several at once.
//   node lab.mjs go all [--jobs N] [--only a,b] [--no-retry]
// Each unit is its own `node lab.mjs go -a <unit>` process: the lab already gives every running server its own folder, world
// and port (core.mjs claim), so they do not meet. How many at once: --jobs, else LAB_JOBS, else what this machine has
// (autoJobs: its cores and memory).
// The bar stays where it is. A unit that is not DONE while others ran beside it is run once more with nothing else running:
// that second run is what a one-at-a-time run would have been, and it is the verdict. Such a unit is named in the output
// (W ...), never hidden: a test that passes alone and fails beside others is worth knowing about.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// how many servers this machine carries at once: one per core, and about 1.5 GB each (a server, its world, three clients)
export function autoJobs({ cores = os.availableParallelism?.() ?? os.cpus().length, memGB = os.totalmem() / 1e9, units = Infinity } = {}) {
  return Math.max(1, Math.min(cores, Math.floor(memGB / 1.5) || 1, 8, units));   // (8: `go` takes up to two of the lab's 16 instances)
}

// the units of one lab: its addon folders that have tests (not the selftest's own, not borrowed ones)
export function listUnits(top, kinds) {
  const out = [];
  for (const k of kinds) {
    const sub = { bds: 'addons', end: 'plugins', ll: 'mods' }[k] ?? 'addons', dir = path.join(top, k, sub);
    let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { /* no such lab */ }
    for (const n of names.sort()) {
      if (/^(labkit|labselftest|borrowed_)/.test(n) || !fs.existsSync(path.join(dir, n, 'tests.txt'))) continue;
      out.push({ kind: k, name: n });
    }
  }
  return out;
}

// the last run's time of each unit (ms), from its summary.json; {} when there was none
export function lastTimes(logDir) {
  try { return Object.fromEntries(JSON.parse(fs.readFileSync(path.join(logDir, 'summary.json'), 'utf8')).units.map((r) => [r.unit, r.ms])); } catch { return {}; }
}
export const byLongestFirst = (units, times) => [...units].sort((a, b) => (times[b.name] ?? Infinity) - (times[a.name] ?? Infinity) || a.name.localeCompare(b.name));

// run `tasks` with at most `jobs` at once; `start(task)` returns a promise of its result. Results in the tasks' order.
export async function pool(tasks, jobs, start) {
  const res = new Array(tasks.length); let next = 0;
  const worker = async () => { for (;;) { const i = next++; if (i >= tasks.length) return; res[i] = await start(tasks[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, tasks.length)) }, worker));
  return res;
}

const secs = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`);
const lastLine = (text) => text.split('\n').map((l) => l.trim()).filter((l) => /^(DONE|FAIL|ERR|E |Q |W )/.test(l)).at(-1) ?? text.trim().split('\n').at(-1) ?? '';

// the whole command. `runUnit(unit)` → { ok, text, ms } (the real one spawns `go`; tests pass their own)
export async function goAll({ units, jobs, retry = true, runUnit, say = console.log, logDir = null, summaryFile = process.env.GITHUB_STEP_SUMMARY }) {
  const t0 = Date.now();
  const keep = (u, r, tag) => { if (logDir) { fs.mkdirSync(logDir, { recursive: true }); fs.writeFileSync(path.join(logDir, `${u.name}${tag}.txt`), r.text); } };
  say(`go all: ${units.length} unit(s), ${jobs} at once`);
  const first = await pool(units, jobs, async (u) => {
    const r = await runUnit(u); keep(u, r, '');
    say(`${r.ok ? '✔' : '✘'} ${u.name}  ${secs(r.ms)}  ${lastLine(r.text)}`);
    return r;
  });
  const rows = units.map((u, i) => ({ unit: u.name, ok: first[i].ok, ms: first[i].ms, line: lastLine(first[i].text), alone: false, firstLine: null }));
  // not DONE beside others: once more with nothing else running (one at a time), and that is the verdict
  const again = rows.filter((r) => !r.ok);
  if (again.length && retry && jobs > 1) {
    say(`go all: ${again.length} not DONE beside others: once more, alone (${again.map((r) => r.unit).join(' ')})`);
    for (const row of again) {
      const u = units.find((x) => x.name === row.unit), r = await runUnit(u); keep(u, r, '-alone');
      row.firstLine = row.line; row.alone = true; row.ok = r.ok; row.ms += r.ms; row.line = lastLine(r.text);
      say(`${r.ok ? '✔' : '✘'} ${u.name}  ${secs(r.ms)}  ${row.line}`);
      if (r.ok) say(`W ${u.name}: DONE alone, but beside others it was: ${row.firstLine}  (timing under load: node lab.mjs flaky -a ${u.name})`);
    }
  }
  const wall = Date.now() - t0, sum = rows.reduce((a, r) => a + r.ms, 0), bad = rows.filter((r) => !r.ok), shaky = rows.filter((r) => r.ok && r.alone);
  say(`go all: ${rows.length - bad.length}/${rows.length} DONE in ${secs(wall)} (${jobs} at once; the units' own times add up to ${secs(sum)})${shaky.length ? `; passed only alone: ${shaky.map((r) => r.unit).join(' ')}` : ''}`);
  if (bad.length) say(`not DONE: ${bad.map((r) => r.unit).join(' ')}${logDir ? `  (each one's output: ${logDir})` : ''}`);
  const summary = { ok: !bad.length, jobs, wallMs: wall, sumMs: sum, units: rows };
  if (logDir) fs.writeFileSync(path.join(logDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  if (summaryFile) {
    const md = ['### go all', '', `${rows.length - bad.length}/${rows.length} DONE in ${secs(wall)} (${jobs} at once; the units' own times add up to ${secs(sum)})`, '', '| unit | result | time | |', '|---|---|---|---|',
      ...rows.map((r) => `| ${r.unit} | ${r.ok ? (r.alone ? 'DONE (alone)' : 'DONE') : 'not DONE'} | ${secs(r.ms)} | ${r.line.replace(/\|/g, '\\|').slice(0, 160)} |`), ''].join('\n');
    try { fs.appendFileSync(summaryFile, md + '\n'); } catch { /* not writable: the lines above say it all */ }
  }
  return summary;
}

// from lab.mjs: node lab.mjs go all ...
export async function main({ top, kinds, args }) {
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(k + '='))?.slice(k.length + 1); };
  const only = val('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
  let units = listUnits(top, kinds);
  if (only) { const miss = only.filter((n) => !units.some((u) => u.name === n)); if (miss.length) { console.log(`ERR no such unit: ${miss.join(' ')} (units: ${units.map((u) => u.name).join(' ')})`); return 1; } units = units.filter((u) => only.includes(u.name)); }
  if (!units.length) { console.log('ERR no units with tests.txt (node lab.mjs bds new <name> ... makes one)'); return 1; }
  // the longest first (by the last run's times, a new unit before all): the wall time is then about the longest unit's, not
  // the longest one started last
  const logDir = path.join(top, '.lab', 'goall');
  units = byLongestFirst(units, lastTimes(logDir));
  const asked = Number(val('--jobs') ?? process.env.LAB_JOBS);
  const jobs = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 8, units.length) : autoJobs({ units: units.length });
  // the server and the tools once, before the units start beside each other (each `go` would otherwise do it under one lock)
  const pre = await new Promise((res) => { const c = spawn(process.execPath, [path.join(top, 'lab.mjs'), 'setup', 'all'], { cwd: top, stdio: ['ignore', 'pipe', 'pipe'] }); let t = ''; c.stdout.on('data', (b) => { t += b; }); c.stderr.on('data', (b) => { t += b; }); c.on('close', (code) => res({ ok: code === 0, text: t })); });
  if (!pre.ok) { console.log(pre.text.trim().split('\n').slice(-6).join('\n')); console.log('ERR setup did not finish: node lab.mjs doctor'); return 1; }
  const env = { ...process.env }; delete env.LAB_ADDON;   // (each child is told its unit with -a)
  const runUnit = (u) => new Promise((res) => {
    const t = Date.now(), c = spawn(process.execPath, [path.join(top, 'lab.mjs'), 'go', '-a', u.name], { cwd: top, stdio: ['ignore', 'pipe', 'pipe'], env });
    let text = ''; c.stdout.on('data', (b) => { text += b; }); c.stderr.on('data', (b) => { text += b; });
    c.on('error', (e) => res({ ok: false, text: text + `\nERR ${e.message}`, ms: Date.now() - t }));
    c.on('close', () => res({ ok: /^DONE /m.test(text), text, ms: Date.now() - t }));   // (DONE is the lab's own word for "everything passed")
  });
  const s = await goAll({ units, jobs, retry: !args.includes('--no-retry'), runUnit, logDir });
  return s.ok ? 0 : 1;
}
