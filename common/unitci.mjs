// node lab.mjs unitci (unit.yml, in the lab's own GitHub Actions): a unit made, taken in, tested or finished from the management
// panel's 「アドオン」 — no computer of the person's in between. The workflow's inputs come as JOB UNIT TITLE REQUEST FILE WORDS;
// plan(env) checks them by the panel's own rules (panel/lib/workspace.mjs, panel/lib/units.mjs) and says the one command:
//   new            node lab.mjs <kind> new <unit> "<title>" ["<request>"]
//   import         node lab.mjs <kind> import incoming/<f> ["<words>"] --name <unit>   (no UNIT: unitFromFile, the panel's own
//                  rule — never the pack's header.name; the pack waits on the branch incomingBranch(FILE): unit.yml takes it)
//   test sim go    node lab.mjs <kind> <job> -a <unit>
// SOURCE (import, instead of FILE): pypi:<name>[==v] | gh:<owner>/<repo>[@ref] — an Endstone plugin by name, downloaded by the lab
// KIND: bds (default) | end | ll — the lab the unit is in (an import's: from the file, .whl .tar.gz .tgz → end, when not given)
// The words go to it as arguments (never through a shell), on the bds lab (LAB_KIND), and what it prints — the lab's and the
// person's words — is shown with workflow commands stopped (no line of it is taken for one). The result: the run's summary,
// an annotation when it failed (notify tells it) and the step's outputs ok and unit (new / import: the unit made — the one
// asked for, else a failure — bds/addons/<unit>: unit.yml commits it; go leaves bds/dist/*.mcaddon for unit.yml to upload as
// unit-<unit>).
//   unitci [--dry]    --dry: the checked command alone, nothing run (anywhere; the rest only inside Actions)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UNIT, DIR as DIRS } from '../panel/lib/units.mjs';
import * as W from '../panel/lib/workspace.mjs';

/** the branch an import's pack waits on, from FILE (pure): lab-incoming/<name> — the panel's own (lib/workspace.mjs) */
export const incomingBranch = W.incomingBranch;

const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// (a word shown as typed when it is plain, quoted when not; long ones shortened — for the log only, never run)
const shown = (a) => (/^[\w./:@-]+$/.test(a) ? a : JSON.stringify(a.length > 80 ? `${a.slice(0, 79)}…` : a));
const made = (job, unit, args, kind = 'bds') => ({ job, unit, kind, dir: `${DIRS[kind]}/${unit}`, args, show: `node ${args.map(shown).join(' ')}` });

/** the workflow's inputs (the environment: JOB UNIT TITLE REQUEST FILE WORDS) → { job, unit, args (to node: lab.mjs …), show }
 *  or { error } in words (pure). The error never repeats what was given (it is shown in the log) */
export function plan(env = {}) {
  const v = (k) => String(env[k] ?? '').trim();
  const job = v('JOB'), unit = v('UNIT'), title = v('TITLE'), request = v('REQUEST'), file = v('FILE'), words = v('WORDS');
  if (!W.JOBS.includes(job)) return { error: `JOB は ${W.JOBS.join('・')} のどれか` };
  const kind = v('KIND') || (job === 'import' ? W.kindOfPack(file) : 'bds');
  if (!W.KINDS.includes(kind)) return { error: `KIND は ${W.KINDS.join('・')} のどれか` };
  if (job === 'import' && v('SOURCE')) {
    // (by name: an Endstone plugin from PyPI or GitHub, the lab's end import downloads it — no file, no branch)
    const r = W.importSourceInputs({ source: v('SOURCE'), unit, words });
    if (r.error) return { error: r.error };
    return made(job, r.unit, ['lab.mjs', 'end', 'import', r.inputs.source, ...(words ? [words] : []), '--name', r.unit], 'end');
  }
  if (job === 'import') {
    if (file.length > W.LIMITS.file || !W.INCOMING.test(file) || file.includes('..')) return { error: `FILE は incoming/<名前>（${W.IMPORT_TYPES.join('・')}。英数字と . _ -）` };
    const wrong = unit ? W.unitNameProblem(unit, { taking: true }) : '';
    if (wrong) return { error: `UNIT: ${wrong}` };
    const bad = W.textProblem(words, { max: W.LIMITS.words, what: 'WORDS' });
    if (bad) return { error: bad };
    // (always a name: else the lab makes one from the pack's header.name — not always one the list shows, nor always free)
    const name = unit || W.unitFromFile(file, kind);
    return made(job, name, ['lab.mjs', kind, 'import', file, ...(words ? [words] : []), '--name', name], kind);
  }
  if (job === 'new') {
    const wrong = W.unitNameProblem(unit);
    if (wrong) return { error: `UNIT: ${wrong}` };
    const t = title || unit, bad = W.textProblem(t, { max: W.LIMITS.title, line: true, what: 'TITLE' }) || W.textProblem(request, { max: W.LIMITS.request, what: 'REQUEST' });
    if (bad) return { error: bad };
    return made(job, unit, ['lab.mjs', kind, 'new', unit, t, ...(request ? [request] : [])], kind);
  }
  if (!UNIT.test(unit)) return { error: `UNIT: ${W.UNIT_SAY}` };
  if (job === 'sim' && kind !== 'bds') return { error: 'sim は bds のアドオンだけ（Endstone・LeviLamina は test）' };
  return made(job, unit, ['lab.mjs', kind, job, '-a', unit], kind);
}
/** the unit `new` or `import` made, from what it printed (pure): the last `OK bds/addons/<name>/…` — the lab's closing line;
 *  an import's brief before it prints the pack's own words, which may hold such a line. null when none */
export function madeUnit(lines, kind = 'bds') {
  let found = null;
  const re = new RegExp(`^OK ${DIRS[kind].replace('/', '\\/')}\\/([a-z0-9_]{1,60})\\/`);
  for (const l of lines ?? []) { const m = re.exec(String(l)); if (m) found = m[1]; }
  return found;
}
// (a code block that what it holds cannot close: more backticks than its longest run)
const fence = (text) => '`'.repeat(Math.max(3, ...[...String(text).matchAll(/`+/g)].map((m) => m[0].length + 1)));
/** the run's summary (Markdown, pure): what was done, where it went, the last lines the lab printed */
export function summaryText({ plan: p, ok, lines = [], unit = null }) {
  if (p.error) return `## ❌ unitci: 始められません\n\n- ${p.error}\n`;
  const d = DIRS[p.kind] ?? DIRS.bds;
  const said = { new: `ユニット ${d}/${unit ?? p.unit} を作りました（unit.yml が既定の枝に入れます）`, import: `${d}/${unit ?? '?'} に取り込みました（unit.yml が既定の枝に入れます）`,
    test: '試験が通りました', sim: 'すばやい試し（sim）が通りました', go: `${W.MADE[p.kind] ?? W.MADE.bds} ができました（成果物 unit-${p.unit}）` }[p.job];
  const tail = lines.slice(-30).map((l) => l.slice(0, 300)).join('\n'), f = fence(tail);
  return [`## ${ok ? '✅' : '❌'} ${W.jobWord(p.job, p.kind)}${p.unit ? ` ${p.unit}` : ''}`, '', ok ? `- ${said}` : '- 落ちました: 最後の行を見てください（直したら「アドオン」から、もう一度）', '', f, tail, f, ''].join('\n');
}
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** unitci: the plan run (in unit.yml) → true when the lab's command passed. deps (tests): env, spawn (spawnSync's shape), out,
 *  root (the lab's folder) */
export async function unitCiCmd(args = [], { env = process.env, spawn = spawnSync, out = console.log, root = TOP } = {}) {
  const p = plan(env);
  if (args.includes('--dry')) { out(p.error ? `ERR ${p.error}` : `OK ${p.show}`); return !p.error; }
  if (!env.GITHUB_ACTIONS && !env.LAB_UNIT_CI) throw new Error('unitci は unit.yml の中で（手元からは node lab.mjs <job> -a <unit>。確かめるだけなら unitci --dry）');
  // (the import's pack: a file in the lab's own incoming/ folder — neither of them a link to somewhere else)
  const real = (f, dir) => { const s = fs.lstatSync(path.join(root, ...f.split('/')), { throwIfNoEntry: false }); return Boolean(dir ? s?.isDirectory() : s?.isFile()); };
  const pack = p.job === 'import' ? p.args[p.args.indexOf('import') + 1] : null;   // (incoming/<f>, after the word import)
  const byName = p.job === 'import' && /^(pypi:|gh:|endstone[-_])/.test(pack ?? '');
  const why = p.error ?? (p.job === 'import' && !byName && !(real('incoming', true) && real(pack)) ? `${pack} がありません（パネルの取り込みがまだ届いていないか、もう消されました）` : null);
  // (from here what is printed is the person's and the lab's words: no workflow command until the end)
  const stop = crypto.randomBytes(8).toString('hex');
  out(`::stop-commands::${stop}`);
  let r = null, lines = [], odd = null;
  try {
    if (why) out(`ERR ${why}`);
    else {
      out(`unitci: ${p.show}`);
      r = spawn(process.execPath, p.args, { cwd: root, encoding: 'utf8', maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, FORCE_COLOR: '0', LAB_KIND: p.kind } });
      const text = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`;
      lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
      for (const l of lines) out(l);
      if (r.error) out(`ERR ${r.error.message}`);
      // (new / import passed: the unit made must be the one asked for — the lab's closing line; new with none: as asked.
      // Another one — or none from an import — is not committed: a failure)
      const got = ['new', 'import'].includes(p.job) && r.status === 0 && !r.error ? madeUnit(lines, p.kind) ?? (p.job === 'new' ? p.unit : null) : p.unit, d = DIRS[p.kind];
      if (got !== p.unit) {
        odd = got ? `ラボが作ったのは ${d}/${got}: 頼んだ ${d}/${p.unit} ではありません` : `ラボの出力に OK ${d}/${p.unit}/ の行がありません: 頼んだユニットができたか分かりません`;
        lines.push(`ERR ${odd}`); out(`ERR ${odd}`);
      }
    }
  } finally { out(`::${stop}::`); }
  const ok = !why && !odd && r?.status === 0 && !r?.error;
  const unit = ['new', 'import'].includes(p.job) ? (ok ? p.unit : null) : p.unit || null;
  const put = (f, text) => { if (f) { try { fs.appendFileSync(f, text); } catch { /* the summary and outputs are extra */ } } };
  put(env.GITHUB_STEP_SUMMARY, summaryText({ plan: why && !p.error ? { ...p, error: why } : p, ok, lines, unit }));
  put(env.GITHUB_OUTPUT, `ok=${ok}\n${unit && /^[a-z0-9_]+$/.test(unit) ? `unit=${unit}\n` : ''}`);
  if (!ok) {
    const last = lines.filter((l) => /^(FAIL|ERR|E |Q |W )/.test(l)).slice(-8);
    out(`::error title=${esc(`unit ${p.job ?? ''}`.trim()).replace(/[:,]/g, ' ')}::${esc(why ?? odd ?? ((last.length ? last : lines.slice(-8)).join('\n') || 'ラボのコマンドが落ちました'))}`);
  }
  return ok;
}
