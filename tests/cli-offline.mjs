#!/usr/bin/env node
// The command line itself, and what v1.19 fixed in it (each check here failed on v1.18.0): --help never runs a command;
// nothing spends AI tokens unless asked (`skill bench` without --via); bad arguments get a usage line, never a stack trace,
// a silent no-op or a long run; the money caps of the autopilot cannot be switched off by a typo; a lab name in front of any
// lab-level command works. No server, no network, no AI: fake AI CLIs on PATH record any attempt to spend.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`${c ? '✔' : '✘'} ${m}${c ? '' : '\n  ' + String(d).split('\n').slice(-14).join('\n  ')}`); if (!c) fails++; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'bdslab-cli-')), BIN = path.join(T, 'bin'), SPEND = path.join(T, 'spend.log');
fs.mkdirSync(BIN);
for (const a of ['claude', 'codex', 'gemini']) { fs.writeFileSync(path.join(BIN, a), `#!/bin/sh\necho "${a} $*" >> "${SPEND}"\nexit 3\n`); fs.chmodSync(path.join(BIN, a), 0o755); }
const kind0 = (() => { try { return fs.readFileSync(path.join(TOP, '.lab-kind'), 'utf8'); } catch { return null; } })();
// (async: the independent checks below run at once; the ones that share bds/.lab/addon or .lab-kind stay in order)
// (at most 6 lab.mjs processes at once, so the timings below do not shake on a CI with 4 cores; the clock starts when a slot is taken)
const SLOTS = 6; let busy = 0; const waiting = [];
const slot = () => new Promise((go) => { if (busy < SLOTS) { busy++; go(); } else waiting.push(go); });
const unslot = () => { const n = waiting.shift(); if (n) n(); else busy--; };
const lab = async (args, e = {}, cwd = TOP, timeout = 60000) => { await slot(); try { return await labRun(args, e, cwd, timeout); } finally { unslot(); } };
const labRun = (args, e, cwd, timeout) => new Promise((resolve) => {
  const t0 = Date.now(); let out = '', err = '', timedOut = false;
  const c = spawn(process.execPath, [path.join(cwd, 'lab.mjs'), ...args], { cwd, env: { ...process.env, PATH: BIN + path.delimiter + process.env.PATH, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', LAB_DOTENV: 'off', LAB_NOTIFY: 'off', ...e } });
  const tm = setTimeout(() => { timedOut = true; c.kill('SIGKILL'); }, timeout);
  c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
  c.stdin.on('error', () => {}); c.stdin.end();
  c.on('close', (code) => { clearTimeout(tm); resolve({ code, t: out + err, ms: Date.now() - t0, timedOut }); });
});
const spent = () => (fs.existsSync(SPEND) ? fs.readFileSync(SPEND, 'utf8') : '');
const STACK = /\n\s+at .+:\d+:\d+|TypeError|ReferenceError|ENOENT: no such file/;

// The checks that touch no shared file run at once (each is a node lab.mjs start); the ones that use bds/.lab/addon or .lab-kind keep their order.
const readOnly = async () => {
  // --help: the help, never the command (skill verify --help ran every probe on a server; skill bench --help a paid run)
  const helps = [['skill', 'verify', '--help'], ['go', '-h'], ['mutate', '--help']];
  const [hs, hr, hAll, hFish, promote, retire, doc, apply, verify, setup, ui, devOnly] = await Promise.all([
    Promise.all(helps.map((a) => lab(a, {}, TOP, 20000))), lab(['help', 'record']), lab(['help', 'player']), lab(['help', 'player', 'fish']),
    lab(['skill', 'promote']), lab(['skill', 'retire']), lab(['doc']), lab(['apply', path.join(T, 'no-patch.txt')]),
    lab(['verify', 'no_such_unit_zz']), lab(['setup', 'zzz']), lab(['ui', 'build'], {}, TOP, 20000),
    // what the stable branch leaves out says where it is, in one line (no usage dump, no stack)
    Promise.all([['panel'], ['end', 'go'], ['auto', 'next'], ['skill', 'grade']].map((a) => lab(a, {}, TOP, 20000))),
  ]);
  helps.forEach((a, i) => { const r = hs[i]; ok(r.code === 0 && !r.timedOut && r.ms < 15000 && r.t.trim() && !/^(share v|verifying|started|PASS|FAIL|on |off )/m.test(r.t) && !STACK.test(r.t), `${a.join(' ')}: prints help and returns (${r.ms} ms)`, r.t); });
  ok(!spent(), '--help spent no AI tokens', spent());
  { const h = hr, ls = h.t.split('\n').filter((l) => /^\(help /.test(l)); ok(ls.length && ls.every((l) => /(^|[^\w-])record([^\w-]|$)/i.test(l)), '`help record` finds the word record, not every line with "records" (it showed 3 skills lines)', h.t); }
  ok(((() => { try { return fs.readFileSync(path.join(TOP, '.lab-kind'), 'utf8'); } catch { return null; } })()) === kind0, '--help does not switch the remembered lab');

  // fewer tokens: help <topic> <word> prints only the parts with the word (help player is ~3,800 tokens whole)
  { const all = hAll.t, part = hFish; ok(part.code === 0 && /fish/.test(part.t) && part.t.length * 5 < all.length && part.t.split('\n').filter(Boolean).every((l) => /fish/i.test(l)), 'help player fish: only the lines with fish (a fifth or less of the topic)', part.t); }

  let r;
  // usage lines instead of "undefined", stack traces and silent successes
  r = promote; ok(r.code !== 0 && /usage: node lab\.mjs skill promote/.test(r.t) && !/undefined/.test(r.t), 'skill promote with no id: usage (was "ERR no rule undefined")', r.t);
  r = retire; ok(r.code !== 0 && /usage: node lab\.mjs skill retire/.test(r.t), 'skill retire with no id: usage', r.t);
  r = doc; ok(r.code !== 0 && /^ERR usage: node lab\.mjs doc/m.test(r.t) && !STACK.test(r.t), 'doc with no word: the usage without a stack trace', r.t);
  r = apply; ok(r.code !== 0 && /ERR no such file/.test(r.t) && !STACK.test(r.t), 'apply <missing file>: an error line, not an ENOENT crash', r.t);
  r = verify; ok(r.code !== 0 && /no bds unit "no_such_unit_zz"/.test(r.t) && r.ms < 15000, 'verify <unknown unit>: refused at once (it ran check/test/qa for minutes)', r.t);
  r = setup; ok(r.code !== 0 && /setup: unknown zzz/.test(r.t) && r.ms < 15000, 'setup <unknown arg>: refused (it started a server install)', r.t);
  r = ui; ok(!r.timedOut && /usage: node lab\.mjs ui build|ERR several addons|ERR no addon|use <name>/.test(r.t), '`ui build` reaches the JSON UI builder (it opened the browser page and never returned)', r.t);
  ok(devOnly.every((x) => x.code !== 0 && /not in the stable branch/.test(x.t) && x.t.trim().split('\n').length === 1 && !STACK.test(x.t)), 'panel / end / auto / skill grade: one line saying it is on dev', devOnly.map((x) => x.t).join('|'));
};

const unitBlocks = async () => {
  let r;
  // bds new prints the skill(s) for the request (a close second too), and splits the request into acceptance lines correctly
  {
    const u = 'zz_cli_new', U = path.join(TOP, 'bds', 'addons', u), cur = path.join(TOP, 'bds', '.lab', 'addon'), cur0 = fs.existsSync(cur) ? fs.readFileSync(cur, 'utf8') : null;
    fs.rmSync(U, { recursive: true, force: true });
    try {
      const r = await lab(['bds', 'new', u, 'Zap', 'アイテム lab:zap_wand を追加。使うと ZAP! と伝え、3秒クールダウン'], { LAB_SKILL_READS: 'off' });
      ok(/^# skill bds-/m.test(r.t) && !/^close: read the one that fits/m.test(r.t), 'bds new: the skill text itself (two if close), never "read it with another call"', r.t);
      const acc = fs.readFileSync(path.join(U, 'TASK.md'), 'utf8').split('\n').filter((l) => l.startsWith('- [ ]'));
      ok(acc.length === 2 && acc[1].includes('ZAP! と伝え'), 'TASK.md: "ZAP!" inside a Japanese sentence does not cut it in two (QA then asked for a section per fragment)', acc.join('\n'));
    } finally { fs.rmSync(U, { recursive: true, force: true }); if (cur0 === null) fs.rmSync(cur, { force: true }); else fs.writeFileSync(cur, cur0); }
  }
  
  // new ja="…": the Japanese description goes into ja_JP.lang, the English one stays in en_US.lang
  {
    const U = path.join(TOP, 'bds', 'addons', 'zz_cli_ja'), cur = path.join(TOP, 'bds', '.lab', 'addon'), cur0 = fs.existsSync(cur) ? fs.readFileSync(cur, 'utf8') : null;
    fs.rmSync(U, { recursive: true, force: true });
    try {
      await lab(['bds', 'new', 'zz_cli_ja', 'Zz', '--js', 'desc=A coin shop', 'ja=コインで買い物ができるショップ']);
      const t = (l) => { try { return fs.readFileSync(path.join(U, 'rp', 'texts', l + '.lang'), 'utf8'); } catch { return ''; } };
      ok(/^pack\.description=A coin shop$/m.test(t('en_US')) && /^pack\.description=コインで買い物ができるショップ$/m.test(t('ja_JP')), 'new desc= ja=: each language gets its own description', t('en_US') + t('ja_JP'));
    } finally { fs.rmSync(U, { recursive: true, force: true }); if (cur0 === null) fs.rmSync(cur, { force: true }); else fs.writeFileSync(cur, cur0); }
  }
  // add: what keeps a definition from loading is said at add time (it was found only by go)
  {
    const U = path.join(TOP, 'bds', 'addons', 'zz_cli_add'), cur = path.join(TOP, 'bds', '.lab', 'addon'), cur0 = fs.existsSync(cur) ? fs.readFileSync(cur, 'utf8') : null;
    fs.rmSync(U, { recursive: true, force: true });
    try {
      await lab(['bds', 'new', 'zz_cli_add', 'Zz', '--js']);
      r = await lab(['bds', 'add', 'item', 'lab:big', 'Big', 'max_stack_size=999', '-a', 'zz_cli_add']);
      ok(r.code !== 0 && /^E .*max_stack_size: must be 1\.\.64 \(got 999\)/m.test(r.t), 'add item max_stack_size=999: E line and exit 1', r.t);
      r = await lab(['bds', 'add', 'entity', 'lab:blob', 'Blob', 'health=notjson', '-a', 'zz_cli_add']);
      ok(/^W health=notjson is not JSON/m.test(r.t), 'add entity health=notjson: a W line says it became a string', r.t);
    } finally { fs.rmSync(U, { recursive: true, force: true }); if (cur0 === null) fs.rmSync(cur, { force: true }); else fs.writeFileSync(cur, cur0); }
  }
  
  // api with no current addon: the modules a new addon gets (it looked only in server-gametest: "none: World")
  {
    const cur = path.join(TOP, 'bds', '.lab', 'addon'), cur0 = fs.existsSync(cur) ? fs.readFileSync(cur, 'utf8') : null;
    fs.rmSync(cur, { force: true });
    try {
      r = await lab(['bds', 'api', 'World'], { LAB_ADDON: '' });
      ok(/^class World \{/m.test(r.t) || /api offline needs|types/.test(r.t), 'api World with no current addon: the class (or, offline, why not)', r.t);
    } finally { if (cur0 !== null) fs.writeFileSync(cur, cur0); }
  }
  
  // undo / flaky on a throwaway unit
  {
    const u = 'zz_cli_undo', U = path.join(TOP, 'bds', 'addons', u), CP = path.join(TOP, 'bds', '.lab', 'checkpoints', u), cur = path.join(TOP, 'bds', '.lab', 'addon'), cur0 = fs.existsSync(cur) ? fs.readFileSync(cur, 'utf8') : null;
    fs.rmSync(U, { recursive: true, force: true }); fs.rmSync(CP, { recursive: true, force: true });
    try {
      await lab(['bds', 'new', u, 'Zz', '--js']);
      const f = path.join(U, 'tests.txt');
      for (let i = 0; i < 20; i++) { fs.writeFileSync(f, `## v${i}\n@A join\n`); await lab(['checkpoint', `v${i}`, '-a', u]); }
      const first = fs.readdirSync(CP).sort()[0];
      fs.writeFileSync(f, '## now\n@A join\n');
      r = await lab(['undo', first, '-a', u]);
      ok(r.code === 0 && fs.readFileSync(f, 'utf8').startsWith('## v0') && fs.readdirSync(CP).length === 20, 'undo to the oldest of 20 checkpoints works (the new "before undo" one no longer prunes it first)', r.t);
      const n0 = fs.readdirSync(CP).sort().join(' ');
      r = await lab(['undo', '19990101-000000000-zzz', '-a', u]);
      ok(r.code !== 0 && /19990101-000000000-zzz/.test(r.t) && fs.readdirSync(CP).sort().join(' ') === n0, 'undo <unknown id>: refused, and no checkpoint taken for nothing', r.t);
      // flaky: every run fails before a section runs (a syntax error): FAIL, never "OK every section every time"
      fs.writeFileSync(path.join(U, 'bp', 'scripts', 'main.js'), 'import { world } from "@minecraft/server";\nthis is not javascript (\n');
      // (no server either: a cache without one and none to install — each run fails before a section all the same, at once: on a
      // machine without a BDS it downloaded one, 100 MB, and ran it twice — CI's offline job)
      const noBds = path.join(T, 'no-bds-cache');
      r = await lab(['flaky', '2', '-a', u], { LAB_CACHE: noBds, LAB_BDS_ZIP: path.join(noBds, 'none.zip') }, TOP, 300000);
      ok(r.code !== 0 && /^FAIL zz_cli_undo/m.test(r.t) && !/^OK zz_cli_undo/m.test(r.t), 'flaky when every run fails before any section: FAIL (it said OK)', r.t);
    } finally { fs.rmSync(U, { recursive: true, force: true }); fs.rmSync(CP, { recursive: true, force: true }); if (cur0 === null) fs.rmSync(cur, { force: true }); else fs.writeFileSync(cur, cur0); }
  }
};

// (ui build, verify and api read the current addon: the unit blocks start after the read-only ones)
await readOnly().then(unitBlocks);

if (kind0 !== null) fs.writeFileSync(path.join(TOP, '.lab-kind'), kind0); else fs.rmSync(path.join(TOP, '.lab-kind'), { force: true });

ok(!spent(), 'nothing above spent AI tokens', spent());
fs.rmSync(T, { recursive: true, force: true });
console.log(`\n${fails ? 'FAIL' : 'PASS'} cli-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
