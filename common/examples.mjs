// examples: the lab's bundled samples, kept apart from the person's own units (end/examples, ll/examples: Endstone plugins
// and LeviLamina mods, each proven on a real server).
//   node lab.mjs end examples [word]            the samples, practical ones first, with what each does (catalog.json)
//   node lab.mjs end new <name> --from <sample> a sample made the person's own: copied into plugins/<name> with its package,
//                                               entry point and class renamed (its commands stay: change them as you like)
//   node lab.mjs end pack-examples [practical|showcase|all] [--jobs=N]   their wheels / folders in one zip to hand out (each
//                                               one proven by `go` first, several at once)
// A sample is also a `-a <name>` away as it is (core.mjs resolveAddon): test it, run it, read it, without copying.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pool, autoJobs } from './goall.mjs';

const NAME = /^[a-z][a-z0-9_]{0,39}$/;
export const examplesDir = (root) => path.join(root, 'examples');

/** the catalog (pure but for reading): [{ name, kind: 'practical' | 'showcase', ja, path }] in that order, by name */
export function catalog(root) {
  const dir = examplesDir(root);
  let cat = {}; try { cat = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8')); } catch { /* no catalog: names alone */ }
  let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && NAME.test(e.name)).map((e) => e.name); } catch { /* none */ }
  const rank = { practical: 0, showcase: 1 };
  return names.map((name) => ({ name, kind: cat[name]?.kind ?? 'showcase', ja: cat[name]?.ja ?? '', path: path.join(dir, name) }))
    .sort((a, b) => (rank[a.kind] ?? 2) - (rank[b.kind] ?? 2) || a.name.localeCompare(b.name));
}

/** the list, filtered by a word (in the name or the description) → lines (pure) */
export function listLines(items, { lab, word = '' } = {}) {
  const w = word.toLowerCase(), hit = items.filter((x) => !w || x.name.includes(w) || x.ja.toLowerCase().includes(w));
  if (!items.length) return [`${lab}: 見本はありません`];
  if (!hit.length) return [`「${word}」に合う見本はありません（全部: node lab.mjs ${lab} examples）`];
  const out = [];
  for (const [kind, title] of [['practical', '実用（サーバー運用でそのまま使える）'], ['showcase', 'ショーケース（この基盤でできることの見本）']]) {
    const xs = hit.filter((x) => x.kind === kind);
    if (!xs.length) continue;
    out.push(`${title}:`);
    const width = Math.max(...xs.map((x) => x.name.length));
    for (const x of xs) out.push(`  ${x.name.padEnd(width)}  ${x.ja}`);
  }
  out.push('', `試す: node lab.mjs ${lab} go -a <見本>   自分のものに: node lab.mjs ${lab} new <名前> --from <見本>`);
  return out;
}

const pascal = (n) => n.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
const copyTree = (src, dst, skip) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d, skip); else if (e.isFile()) fs.copyFileSync(s, d);
  }
};
// the lab's own files beside a unit, and what a run leaves: never copied
const SKIP = new Set(['lab.mjs', 'tsconfig.json', '.lab', 'dist', 'node_modules', '__pycache__', 'build', '.xmake']);

/** a sample's text files with its names replaced by the new ones (pure): an Endstone plugin's package endstone_<from>,
 *  its project name endstone-<from>, its entry point and class; a LeviLamina mod's manifest name. Its commands stay. */
export function renameText(lab, file, text, from, to) {
  const word = (s) => new RegExp(`\\b${s}\\b`, 'g');
  if (lab === 'end') {
    let t = text.replaceAll(`endstone_${from}`, `endstone_${to}`).replaceAll(`endstone-${from.replace(/_/g, '-')}`, `endstone-${to.replace(/_/g, '-')}`);
    t = t.replace(word(pascal(from)), pascal(to));
    // the entry point's key: `<from> = "endstone_<to>:<To>"` in pyproject.toml
    if (path.basename(file) === 'pyproject.toml') t = t.replace(new RegExp(`^${from}(\\s*=\\s*")`, 'm'), `${to}$1`);
    // the folder a plugin keeps its data in is plugins/<from>/ in Endstone: the tests that read it say plugin.data_folder
    return t;
  }
  if (lab === 'll' && path.basename(file) === 'manifest.json') {
    const m = JSON.parse(text); m.name = to; return JSON.stringify(m, null, 4) + '\n';
  }
  return text;
}

/** new <name> --from <sample>: the copy, renamed (the lab's L: ROOT, ADDONS, F, out, die, useAddon) → true */
export function newFrom(L, args) {
  const lab = L.F.name, i = args.indexOf('--from'), from = args[i + 1], name = args.filter((a, k) => !a.startsWith('-') && k !== i + 1)[0];
  const items = catalog(L.ROOT);
  if (!NAME.test(name ?? '')) L.die(`usage: node lab.mjs ${lab} new <name: a-z0-9_> --from <sample>   samples: node lab.mjs ${lab} examples`);
  const ex = items.find((x) => x.name === from);
  if (!ex) L.die(`no sample "${from}" (${items.map((x) => x.name).join(' ') || 'none'})`);
  const dst = path.join(L.ADDONS, name);
  if (fs.existsSync(dst)) L.die(`${path.relative(L.TOP, dst)} exists (node lab.mjs ${lab} use ${name})`);
  copyTree(ex.path, dst, SKIP);
  // the package folder (src/endstone_<from>) and every text file
  if (lab === 'end') { const a = path.join(dst, 'src', `endstone_${from}`); if (fs.existsSync(a)) fs.renameSync(a, path.join(dst, 'src', `endstone_${name}`)); }
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(dst)) {
    if (!/\.(py|toml|json|txt|md|js|ts|cpp|h|hpp|lua|cmake)$|CMakeLists\.txt$/.test(f)) continue;
    const t = fs.readFileSync(f, 'utf8'), u = renameText(lab, f, t, from, name);
    if (u !== t) fs.writeFileSync(f, u);
  }
  // TASK.md says where it came from (the next AI reads it first)
  const task = path.join(dst, 'TASK.md');
  if (fs.existsSync(task)) fs.writeFileSync(task, fs.readFileSync(task, 'utf8').replace(/^(# .*\n)/, `$1\n> 見本 \`${from}\` から作りました（node lab.mjs ${lab} new ${name} --from ${from}）。\n`));
  L.useAddon(name, true);
  L.out(`OK ${path.relative(L.TOP, dst)}/ from the sample ${from}: ${ex.ja}`);
  L.out(`next: change what you need, then node lab.mjs ${lab} go -a ${name}`);
  return true;
}

/** the zip of samples to hand out: each one through `go` (its wheel / folder is what go proved; as many at once as the
 *  machine carries, as `go all`), then one zip → true when every one was DONE */
export async function packExamples(L, args) {
  const lab = L.F.name, which = args.find((a) => ['practical', 'showcase', 'all'].includes(a)) ?? 'practical';
  const items = catalog(L.ROOT).filter((x) => which === 'all' || x.kind === which);
  if (!items.length) L.die(`no ${which} samples`);
  const out = path.join(L.ROOT, 'dist', `bds-lab-${lab}-${which}`), done = [], bad = [];
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env }; delete env.LAB_ADDON;
  const goOne = (x) => new Promise((res) => {
    const c = spawn(process.execPath, [path.join(L.ROOT, 'lab.mjs'), 'go', '-a', x.name], { cwd: L.ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let t = ''; c.stdout.on('data', (d) => { t += d; }); c.stderr.on('data', (d) => { t += d; });
    c.on('error', (e) => res({ x, line: `ERR ${e.message}` }));
    c.on('close', () => res({ x, line: t.split('\n').filter((l) => /^(DONE|FAIL|ERR)/.test(l)).at(-1) ?? '' }));
  });
  const jobs = Number(args.find((a) => /^--jobs=\d+$/.test(a))?.slice(7)) || autoJobs({ units: items.length });
  L.out(`${items.length} ${which} samples through go, ${jobs} at once...`);
  const results = await pool(items, jobs, async (x) => { const r = await goOne(x); L.out(`${/^DONE/.test(r.line) ? '✔' : '✘'} ${x.name}  ${r.line}`); return r; });
  for (const { x, line } of results) {
    const m = /^DONE (\S+)/.exec(line);
    if (!m) { bad.push(`${x.name}: ${line || 'no result'}`); continue; }
    const made = path.resolve(L.ROOT, m[1]);
    if (fs.statSync(made).isDirectory()) copyTree(made, path.join(out, path.basename(made)), new Set()); else fs.copyFileSync(made, path.join(out, path.basename(made)));
    done.push(`${x.name}  ${path.basename(made)}  ${x.ja}`);
  }
  fs.writeFileSync(path.join(out, 'README.txt'), [`bds-lab ${lab} ${which} samples (each proven on a real server by \`go\`)`, '',
    lab === 'end' ? 'Endstone: put the .whl files in the server\'s plugins/ folder and restart.' : 'LeviLamina: put each folder in the server\'s plugins/ folder and restart.', '', ...done, ''].join('\n'));
  const zip = `${out}.zip`;
  fs.rmSync(zip, { force: true });
  const z = spawnSync('zip', ['-qr', zip, path.basename(out)], { cwd: path.dirname(out) });
  if (z.status !== 0) { const t = spawnSync('tar', ['-a', '-cf', zip, path.basename(out)], { cwd: path.dirname(out) }); if (t.status !== 0) L.die('no zip or tar to make the archive'); }
  for (const b of bad) L.out(`W ${b}`);
  L.out(`${bad.length ? 'W' : 'OK'} ${path.relative(L.TOP, zip)}: ${done.length}/${items.length} ${which} samples`);
  return bad.length === 0;
}

/** examples [word] → true */
export function examplesCmd(L, args) {
  for (const l of listLines(catalog(L.ROOT), { lab: L.F.name, word: args.filter((a) => !a.startsWith('-')).join(' ') })) L.out(l);
  return true;
}
