// node lab.mjs panel <check|shots|hook|icons>: the management panel (panel/), its sign-in service (auth/) and the workflows'
// App tokens tried right after a change, without a deploy.
//   check [--quick] [--all] [files..]  the checks the changed files need (git's changed and new files when none are named):
//                                       ESLint, the offline tests, and the real browser (panel-browser, ~1 min; --quick: not)
//   shots [dir] [--dark] [--wide]       the real-browser run with a picture of each tab it opens (default .lab/panel-shots;
//                                       --wide: 1280 px across, as a desktop shows it)
//   hook                                for Claude Code's PostToolUse: a file just edited → its quick checks; a failure is told
//                                       back to the AI at once (exit 2), anything else is silent
//   icons                               panel/icons.css written again from the pixel icons' grids (panel/lib/pixelicons.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BROWSER = 'tests/panel-browser.mjs';
// (the Worker in Cloudflare's own runtime: needs wrangler — WRANGLER, or one in node_modules — and says it skipped without;
// left out of --quick like the browser)
const WORKERD = 'tests/api-workerd.mjs';
const SLOW = new Set([BROWSER, WORKERD]);
// (a file → the tests that hold it; the first match wins its group, all groups add up)
const RULES = [
  [/^panel\/lib\/(policy|audit|members)\.mjs$/, ['tests/governance-offline.mjs']],
  [/^panel\/(lib|ui)\/setup\.mjs$/, ['tests/setup-offline.mjs']],
  [/^panel\/(lib\/session|ui\/signin)\.mjs$/, ['tests/session-offline.mjs']],
  [/^panel\//, ['tests/panel-offline.mjs', BROWSER]],
  // (the tabs of a lane each: their own test — and any of the panel's libraries or views, which they read, runs all four: they
  // take a moment)
  [/^panel\/(lib|ui)\/|^common\/unitci\.mjs$/, ['tests/units-offline.mjs']],
  [/^panel\/(lib|ui)\/|^common\/schedule\.mjs$/, ['tests/schedule-offline.mjs']],
  [/^panel\/(lib|ui)\//, ['tests/stats-offline.mjs']],
  [/^panel\/(lib|ui)\/|^panel\/sw\.js$/, ['tests/inbox-offline.mjs']],
  [/^host\/template\//, ['tests/panel-offline.mjs']],
  [/^common\/(mslive|secrets|lan)\.mjs$/, ['tests/mslive-offline.mjs']],
  [/^auth\//, ['tests/auth-offline.mjs', 'tests/auth-ms-offline.mjs', 'tests/api-offline.mjs', WORKERD, BROWSER]],
  // (the artifact viewer: what is inside an artifact, the way to it through the service, the vault's sealed results)
  [/^panel\/(lib\/(unpack|artifact|zstd|vault|model|session)|ui\/viewer)\.mjs$|^auth\/(handler|node)\.mjs$|^app\/lib\/vault\.mjs$/, ['tests/viewer-offline.mjs']],
  // (the lab's API for AI runs the panel's own modules: a change to one is tried through it too — and in the Worker)
  [/^panel\/lib\/|^common\/claude-plugin\.mjs$/, ['tests/api-offline.mjs']],
  [/^panel\/lib\//, [WORKERD]],
  [/^common\/(panel-config|ghapp)\.mjs$/, ['tests/appci-offline.mjs', 'tests/panel-offline.mjs']],
  [/^common\/panel\.mjs$/, ['tests/panel-offline.mjs']],
  // (the panel as Pages serves it: bundled into one script and its chunks — any of its files, the bundler, the Pages build)
  [/^panel\/(panel\.js|lib\/|ui\/|index\.html|panel\.css|a11y\.css)|^common\/(panel-bundle|panel-config)\.mjs$/, ['tests/bundle-offline.mjs']],
  [/^panel\/(a11y|panel)\.css$/, ['tests/a11y-offline.mjs']],
  // (OreUI: the pixel icons, the frame's pure parts, the fonts and the look)
  [/^panel\/(lib\/(pixelicons|navmenu)|ui\/ore)\.mjs$|^panel\/(icons|panel)\.css$|^panel\/index\.html$|^panel\/fonts\//, ['tests/ore-offline.mjs']],
  [/^common\/(connect-daily|weekly|statuspage)\.mjs$/, (f) => [`tests/${f.slice(7, -4).replace('-', '')}-offline.mjs`]],
  [/^app\/(app\.mjs|lib\/runfiles\.mjs)$/, ['tests/panel-offline.mjs']],
  [/^panel\/(lib|ui)\/|^panel\/panel\.js$/, ['tests/rescue-offline.mjs', 'tests/shell-rescue-offline.mjs', 'tests/setup-rescue-offline.mjs', 'tests/units-rescue-offline.mjs', 'tests/misc-rescue-offline.mjs', 'tests/ghrules-offline.mjs', 'tests/fakes-rules-offline.mjs', 'tests/connect-ui-offline.mjs',
    'tests/qr-offline.mjs', 'tests/playcard-offline.mjs', 'tests/relnotes-offline.mjs', 'tests/packdiff-offline.mjs', 'tests/revert-offline.mjs', 'tests/drafts-offline.mjs', 'tests/tutorial-offline.mjs', 'tests/progress-offline.mjs',
    'tests/failsum-offline.mjs', 'tests/runissue-offline.mjs', 'tests/runcompare-offline.mjs', 'tests/testhist-offline.mjs', 'tests/secretwatch-offline.mjs', 'tests/connectdaily-offline.mjs', 'tests/weekly-offline.mjs', 'tests/notifyprefs-offline.mjs',
    'tests/minutes-offline.mjs', 'tests/lendfc-offline.mjs', 'tests/nlsched-offline.mjs', 'tests/wizard-offline.mjs', 'tests/a11y-offline.mjs', 'tests/inviteqr-offline.mjs', 'tests/undo-offline.mjs', 'tests/pick-offline.mjs', 'tests/mslive-offline.mjs', 'tests/navmenu-offline.mjs']],
  [/^tests\/(panel-offline|panel-browser|governance-offline|setup-offline|session-offline|auth-offline|auth-ms-offline|pick-offline|mslive-offline|navmenu-offline|appci-offline|units-offline|schedule-offline|stats-offline|inbox-offline|rescue-offline|shell-rescue-offline|setup-rescue-offline|units-rescue-offline|misc-rescue-offline|ghrules-offline|fakes-rules-offline|connect-ui-offline|qr-offline|playcard-offline|relnotes-offline|packdiff-offline|revert-offline|drafts-offline|tutorial-offline|progress-offline|failsum-offline|runissue-offline|runcompare-offline|testhist-offline|secretwatch-offline|connectdaily-offline|weekly-offline|notifyprefs-offline|minutes-offline|lendfc-offline|nlsched-offline|wizard-offline|a11y-offline|inviteqr-offline|undo-offline|statuspage-offline|viewer-offline|bundle-offline|ore-offline)\.mjs$/, (f) => [f]],
];
export const ALL = ['tests/panel-offline.mjs', 'tests/governance-offline.mjs', 'tests/setup-offline.mjs', 'tests/session-offline.mjs', 'tests/auth-offline.mjs', 'tests/auth-ms-offline.mjs', 'tests/api-offline.mjs', 'tests/appci-offline.mjs',
  'tests/viewer-offline.mjs', 'tests/units-offline.mjs', 'tests/schedule-offline.mjs', 'tests/stats-offline.mjs', 'tests/inbox-offline.mjs',
  'tests/rescue-offline.mjs', 'tests/shell-rescue-offline.mjs', 'tests/setup-rescue-offline.mjs', 'tests/units-rescue-offline.mjs', 'tests/misc-rescue-offline.mjs',
  'tests/ghrules-offline.mjs', 'tests/fakes-rules-offline.mjs', 'tests/connect-ui-offline.mjs',
  'tests/qr-offline.mjs', 'tests/playcard-offline.mjs', 'tests/relnotes-offline.mjs', 'tests/packdiff-offline.mjs', 'tests/revert-offline.mjs', 'tests/drafts-offline.mjs', 'tests/tutorial-offline.mjs', 'tests/progress-offline.mjs',
  'tests/failsum-offline.mjs', 'tests/runissue-offline.mjs', 'tests/runcompare-offline.mjs', 'tests/testhist-offline.mjs', 'tests/secretwatch-offline.mjs', 'tests/connectdaily-offline.mjs', 'tests/weekly-offline.mjs', 'tests/notifyprefs-offline.mjs',
  'tests/minutes-offline.mjs', 'tests/lendfc-offline.mjs', 'tests/nlsched-offline.mjs', 'tests/wizard-offline.mjs', 'tests/a11y-offline.mjs', 'tests/inviteqr-offline.mjs', 'tests/undo-offline.mjs', 'tests/pick-offline.mjs', 'tests/mslive-offline.mjs', 'tests/navmenu-offline.mjs', 'tests/statuspage-offline.mjs', 'tests/bundle-offline.mjs', 'tests/ore-offline.mjs', WORKERD, BROWSER];
const LINTABLE = /^(panel|auth)\/.*\.(m?js)$|^common\/(panel|panel-config|panel-bundle|ghapp|hosts|schedule|unitci|connect-daily|weekly|statuspage)\.mjs$|^tests\/(panel|governance|setup|session|auth|appci|host|units|schedule|stats|inbox|rescue|shell|misc|ghrules|fakes|connect|qr|playcard|relnotes|packdiff|revert|drafts|tutorial|progress|failsum|runissue|runcompare|testhist|secretwatch|connectdaily|weekly|notifyprefs|minutes|lendfc|nlsched|wizard|a11y|inviteqr|undo|statuspage|viewer|bundle|ore)-[a-z-]+\.mjs$/;

/** the changed files → { lint: [files], tests: [files] } (pure); quick leaves the browser out */
export function plan(files, { quick = false } = {}) {
  const tests = new Set(), lint = [];
  for (const f0 of files) {
    const f = f0.replace(/\\/g, '/').replace(/^\.\//, '');
    if (LINTABLE.test(f)) lint.push(f);
    if (f.startsWith('panel/lib/') || f.startsWith('panel/ui/')) tests.add('tests/panel-offline.mjs');
    for (const [re, t] of RULES) if (re.test(f)) for (const x of typeof t === 'function' ? t(f) : t) tests.add(x);
  }
  return { lint: [...new Set(lint)], tests: ALL.filter((t) => tests.has(t) && !(quick && SLOW.has(t))) };
}
/** what git sees changed (staged, not, and new files) */
export function changed(cwd = TOP) {
  const run = (a) => spawnSync('git', a, { cwd, encoding: 'utf8' }).stdout ?? '';
  return [...new Set([...run(['diff', '--name-only', 'HEAD']).split('\n'), ...run(['ls-files', '--others', '--exclude-standard']).split('\n')].filter(Boolean))];
}
/** a test's or ESLint's output → the lines worth reading (pure): its failures and what follows each, else its tail */
export function failLines(out, max = 30) {
  const l = String(out).split('\n'), keep = [];
  l.forEach((x, i) => { if (/^(FAIL|✘|not ok)|\berror\b|Error:/.test(x)) keep.push(...l.slice(i, i + 6)); });
  return [...new Set(keep.length ? keep : l.slice(-12))].slice(0, max);
}

function runOne(cmd, args, env = {}) {
  const t0 = Date.now(), r = spawnSync(cmd, args, { cwd: TOP, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 600_000, maxBuffer: 64 << 20 });
  return { ok: r.status === 0, ms: Date.now() - t0, out: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `\n${r.error.message}` : ''}` };
}
// (ESLint as this machine has it: the repository's own, else one on the PATH; none → said and left out)
const LOCAL_ESLINT = path.join(TOP, 'node_modules', 'eslint', 'bin', 'eslint.js');
const hasEslint = () => fs.existsSync(LOCAL_ESLINT) || spawnSync(process.platform === 'win32' ? 'eslint.cmd' : 'eslint', ['--version'], { encoding: 'utf8' }).status === 0;
const eslint = (files) => (fs.existsSync(LOCAL_ESLINT) ? runOne(process.execPath, [LOCAL_ESLINT, '-c', 'tests/eslint.config.mjs', ...files]) : runOne(process.platform === 'win32' ? 'eslint.cmd' : 'eslint', ['-c', 'tests/eslint.config.mjs', ...files]));

/** the checks run → true when all passed; out: each one ✔/✘ with its time, a failure's lines */
export function check({ files, quick = false, all = false, out = console.log } = {}) {
  const p = all ? { lint: ['panel', 'auth', 'common/panel.mjs', 'common/panel-config.mjs', 'common/panel-bundle.mjs', 'common/ghapp.mjs', 'common/hosts.mjs', 'common/claude-plugin.mjs', ...ALL], tests: ALL.filter((t) => !(quick && SLOW.has(t))) } : plan(files ?? changed(), { quick });
  if (!p.lint.length && !p.tests.length) { out('panel: 変えたファイルに、パネルの試験の要るものはありません（--all ですべて）'); return true; }
  let ok = true;
  const say = (name, r) => { ok &&= r.ok; out(`${r.ok ? '✔' : '✘'} ${name}（${(r.ms / 1000).toFixed(1)} 秒）`); if (!r.ok) for (const x of failLines(r.out)) out(`    ${x}`); };
  if (p.lint.length) {
    if (hasEslint()) say(`ESLint ${p.lint.length} 個`, eslint(p.lint));
    else out('・ ESLint がありません（npm i -g eslint）: とばします');
  }
  for (const t of p.tests) say(t, runOne(process.execPath, [t]));
  out(ok ? 'PASS panel check' : 'FAIL panel check: ✘ の行を直してから、もう一度');
  return ok;
}

export async function panelCmd(args, out = console.log) {
  const [sub = 'check', ...rest] = args;
  if (sub === 'check') return check({ quick: rest.includes('--quick'), all: rest.includes('--all'), files: rest.filter((a) => !a.startsWith('--')).length ? rest.filter((a) => !a.startsWith('--')) : undefined, out });
  if (sub === 'shots') {
    // (--dark: in the dark colours, as a phone set to dark mode shows it)
    const dark = rest.includes('--dark'), wide = rest.includes('--wide'), dir = path.resolve(TOP, rest.filter((a) => !a.startsWith('--'))[0] ?? '.lab/panel-shots');
    fs.rmSync(dir, { recursive: true, force: true });
    const r = runOne(process.execPath, [BROWSER], { PANEL_SHOTS: dir, ...(dark ? { PANEL_SHOTS_SCHEME: 'dark' } : {}), ...(wide ? { PANEL_SHOTS_WIDTH: '1280' } : {}) });
    for (const x of failLines(r.out)) if (!r.ok) out(`    ${x}`);
    const pics = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : [];
    out(`${r.ok ? '✔' : '✘'} 本物のブラウザで ${pics.length} 枚: ${path.relative(TOP, dir)}/`);
    for (const f of pics) out(`  ${path.relative(TOP, path.join(dir, f))}`);
    return r.ok;
  }
  if (sub === 'hook') {
    // (Claude Code's PostToolUse: { tool_input: { file_path } } on stdin; only the panel's files are checked, quickly)
    let file = '';
    try { file = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')?.tool_input?.file_path ?? ''; } catch { return true; }
    const rel = path.relative(TOP, path.resolve(TOP, file)).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) return true;
    const p = plan([rel], { quick: true });
    if (!p.lint.length && !p.tests.length) return true;
    const lines = [];
    if (check({ files: [rel], quick: true, out: (x) => lines.push(x) })) return true;
    process.stderr.write(`${rel} を変えたあとのパネルの試験（node lab.mjs panel check --quick）:\n${lines.join('\n')}\n`);
    process.exit(2);
  }
  if (sub === 'icons') {
    // (the pixel icons' grids → panel/icons.css: what tests/ore-offline.mjs checks it is)
    const PX = await import(new URL('../panel/lib/pixelicons.mjs', import.meta.url).href);
    const bad = PX.problems();
    if (bad.length) { for (const x of bad) out(`✘ ${x}`); return false; }
    fs.writeFileSync(path.join(TOP, 'panel', 'icons.css'), PX.css());
    out(`✔ panel/icons.css（${Object.keys(PX.ICONS).length + Object.keys(PX.COLOR).length} 個のアイコン）`);
    return true;
  }
  out('usage: node lab.mjs panel check [--quick] [--all] [files..] | shots [dir] [--dark] [--wide] | hook | icons');
  return false;
}
