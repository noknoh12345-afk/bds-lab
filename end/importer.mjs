// The Endstone lab's import and brief: a person's plugin (a .whl, an sdist .tar.gz, a source .zip such as GitHub's, a folder)
// becomes plugins/<name>/ with its names kept, and is read before any server runs it (end/brief.py, the standard library's ast):
// its commands and how each is answered, permissions, event handlers and whether they are registered, scheduler tasks, what it
// could do outside the game, calls that block the server thread, imports no dependency provides — then what breaks on this
// Endstone (pyright on its stubs) and a draft tests.txt that runs each way in once.
//   node lab.mjs end import <file.whl|.tar.gz|.zip|folder> ["<what the person asked>"] [--name <n>]
//   node lab.mjs end brief            (the current plugin, read again)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const exists = (f) => fs.existsSync(f);
const walk = (d, pred = () => true, acc = []) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return acc; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!['.git', '__pycache__', 'node_modules', '.venv', 'venv'].includes(e.name)) walk(f, pred, acc); } else if (pred(f)) acc.push(f); } return acc; };
const SKIP_COPY = new Set(['.git', '__pycache__', 'dist', 'build', '.venv', 'venv', 'node_modules', '.mypy_cache', '.ruff_cache', '.pytest_cache', '.idea', '.vscode']);
const copyTree = (from, to) => fs.cpSync(from, to, { recursive: true, filter: (s) => !SKIP_COPY.has(path.basename(s)) && !/\.(pyc|egg-info)$/.test(s) });

/** a .tar.gz / .tgz into dest: regular files and folders only, nothing outside dest (an sdist from PyPI, a release archive) */
export function untar(buf, dest) {
  const b = zlib.gunzipSync(buf), root = path.resolve(dest);
  let longName = null;
  for (let i = 0; i + 512 <= b.length;) {
    const hdr = b.subarray(i, i + 512);
    if (hdr.every((x) => x === 0)) break;
    const str = (a, n) => hdr.toString('utf8', a, a + n).replace(/\0.*$/s, '');
    const size = parseInt(str(124, 12).trim() || '0', 8), type = String.fromCharCode(hdr[156] || 48);
    const body = b.subarray(i + 512, i + 512 + size);
    i += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = body.toString('utf8').replace(/\0.*$/s, ''); continue; }   // GNU long name: the next entry's
    if (type === 'x' || type === 'g') { const m = /\d+ path=([^\n]*)\n/.exec(body.toString('utf8')); if (m && type === 'x') longName = m[1]; continue; }
    const prefix = str(345, 155), name = longName ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
    longName = null;
    const to = path.resolve(root, name);
    if (!to.startsWith(root + path.sep) || name.split(/[\\/]/).includes('..')) continue;   // (no path out of dest)
    if (type === '5') { fs.mkdirSync(to, { recursive: true }); continue; }
    if (type !== '0' && type !== '\0' && type !== '7') continue;   // (links and devices: not copied)
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, body);
  }
}

// the Python to read with: the lab's venv, else the host's python3 (brief.py needs only the standard library)
function python(L) {
  const v = path.join(L.CACHE, 'py', process.platform === 'win32' ? 'Scripts' : 'bin', `python${process.platform === 'win32' ? '.exe' : ''}`);
  if (exists(v) && L.RT?.kind !== 'docker') return { cmd: v, args: [] };
  for (const c of process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]]) {
    const r = spawnSync(c[0], [...c[1], '-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === '3') return { cmd: c[0], args: c[1] };
  }
  return null;
}

/** what brief.py reads from a plugin's source (null without a Python) */
export function readPlugin(L, m) {
  const py = python(L);
  if (!py || !m?.pkg) return null;
  const r = spawnSync(py.cmd, [...py.args, '-I', path.join(HERE, 'brief.py'), m.src, m.pkg, m.cls ?? '', ...(m.deps ?? [])], { encoding: 'utf8', maxBuffer: 64e6 });
  let j = null; try { j = JSON.parse(r.stdout.trim().split('\n').at(-1) || 'null'); } catch { /* below */ }
  if (!j) return { error: (r.stderr || r.stdout || 'no output').trim().split('\n').slice(-3).join(' ') };
  j.syntax = (r.stderr || '').split('\n').filter((l) => l.startsWith('{"syntax"')).map((l) => JSON.parse(l).syntax);
  j.warnings = (r.stderr || '').split('\n').filter((l) => l.startsWith('{"warning"')).map((l) => JSON.parse(l).warning);
  return j;
}

// ---- a sample value for each usage parameter type (Endstone's: int float bool str message player target actor position block ...)
const SAMPLE = { int: '1', float: '1.5', bool: 'true', boolean: 'true', str: 'x', string: 'x', message: 'hello', text: 'hello', player: 'A', target: 'A', actor: 'A', entity: 'A',
  position: '0 -60 0', pos: '0 -60 0', vector: '0 -60 0', block: 'stone', block_type: 'stone', item: 'stone', item_type: 'stone', json: '{}' };
/** /name <a: int> [b: str] (x|y)<mode: Mode> → the required parameters filled in: "/name 1 x" */
export function sampleArgs(usage) {
  const out = [], u = usage.replace(/^\/\S+\s*/, '');
  const re = /(\([^)]*\))?\s*(<|\[)\s*([\w-]+)\s*:\s*([\w-]+)\s*(>|\])/g;
  let m;
  while ((m = re.exec(u))) {
    if (m[2] === '[') continue;   // (optional: left out — the shortest call that runs)
    const t = m[4].toLowerCase();
    out.push(m[1] ? m[1].slice(1, -1).split('|')[0].trim() : SAMPLE[t] ?? (/^[A-Z]/.test(m[4]) ? m[4].toLowerCase() : 'x'));
  }
  // bare words before the first parameter (/home set <name: str>): part of the command
  const lead = /^([a-z][\w-]*(\s+[a-z][\w-]*)*)\s*(?=[<[(]|$)/i.exec(u)?.[1];
  return [lead, ...out].filter(Boolean).join(' ');
}

// each event class → the player actions that make it happen once (the section names what it shows)
const EVENT_ACTIONS = [
  [/^Player(Join|Login|Spawn)Event$/, 'a second player joins', ['@B join']],
  [/^PlayerQuitEvent$/, 'a player leaves', ['@B join', '@B leave']],
  [/^PlayerChatEvent$/, 'a player chats', ['@A chat hello']],
  [/^PlayerCommandEvent$/, 'a player runs a command', ['@A cmd /me waves']],
  [/^PlayerDeathEvent$/, 'a player dies and respawns', ['kill A', 'wait 1500']],
  [/^PlayerRespawnEvent$/, 'a player respawns', ['kill A', 'wait 1500']],
  [/^BlockBreakEvent$/, 'a block is broken', ['setblock 2 -60 2 stone', 'wait 300', '@A dig 2 -60 2']],
  [/^BlockPlaceEvent$/, 'a block is placed', ['give A dirt', 'wait 300', '@A place dirt 2 -60 2']],
  [/^PlayerInteractEvent$/, 'a player clicks a block', ['@A useon 0 -61 2']],
  [/^PlayerInteractActorEvent$/, 'a player clicks a mob', ['summon pig 2 -60 2', 'wait 300', '@A interact pig', 'kill @e[type=pig]']],
  [/^Actor(Damage|Death)Event$|^PlayerHurtEvent$/, 'a mob is hit and dies', ['summon pig 2 -60 2', 'wait 300', '@A attack pig', 'kill @e[type=pig]']],
  [/^PlayerMoveEvent$|^PlayerJumpEvent$/, 'a player moves', ['@A walk forward 5', '@A jump']],
  [/^PlayerDropItemEvent$/, 'a player drops an item', ['give A stone', 'wait 300', '@A select stone', '@A drop']],
  [/^PlayerPickupItemEvent$/, 'a player picks up an item', ['summon item 0 -60 1', 'wait 1000']],
  [/^PlayerItemConsumeEvent$/, 'a player eats', ['give A bread', 'wait 300', '@A select bread', '@A eat']],
  [/^PlayerTeleportEvent$/, 'a player is teleported', ['tp A 3 -60 3']],
  [/^PlayerGameModeChangeEvent$/, 'a player changes game mode', ['gamemode creative A', 'gamemode survival A']],
  [/^PlayerKickEvent$/, 'a player is kicked', ['@B join', 'kick B bye']],
  [/^ServerListPingEvent$/, 'the server list asks', ['serverping']],
  [/^Weather\w*Event$|^ThunderChangeEvent$/, 'the weather changes', ['weather rain', 'weather clear']],
  [/^ServerCommandEvent$/, 'the console runs a command', ['say from the console']],
];

/** the draft: each way in once (a Python error there fails the section: an E line) */
export function draftTests(name, r) {
  const out = ['# draft from the plugin\'s code (node lab.mjs import): each section runs one way in once; a Python error there fails it.',
    '# Under each, add what the request wants (= ~ ! !~); drop what the request does not need.', '## loads', 'py plugin.is_enabled', '= True'];
  const sec = (title, lines) => out.push('', `## ${title}`, ...lines, 'wait 500');
  let joined = false;
  const join = () => (joined ? [] : ((joined = true), ['@A join']));
  for (const c of r?.commands ?? []) {
    const usage = c.usages[0] ?? `/${c.name}`, args = sampleArgs(usage);
    sec(`/${c.name} runs${c.handled ? '' : ' (nothing found that answers it)'}`, [...join(), `@A cmd /${c.name}${args ? ' ' + args : ''}`]);
  }
  const seen = new Set();
  for (const e of (r?.events ?? []).filter((x) => x.registered)) {
    const hit = EVENT_ACTIONS.find(([re]) => re.test(e.event));
    if (!hit || seen.has(hit[1])) continue;
    seen.add(hit[1]);
    sec(`${hit[1]} (${e.event})`, [...join(), ...hit[2]]);
  }
  if ((r?.tasks ?? []).some((t) => t.repeat)) sec('its repeating task runs for a while', [...join(), 'wait 3000']);
  sec('a restart keeps it working', ['restart', 'py plugin.is_enabled', '= True']);
  return out.join('\n') + '\n';
}

/** the brief: one screen — what it is, its ways in with file:line, what it could do, what breaks here */
export function briefLines(L, m, r, { endstone = null, supported = null, checks = null } = {}) {
  const o = [], p = r?.plugin, src = (f) => f;   // (brief.py's paths are the plugin folder's own: src/<pkg>/...)
  if (!m) return ['W no pyproject.toml with an [project.entry-points."endstone"] entry: not a Python plugin the lab can read'];
  if (m.kind === 'cpp') return [`plugin ${m.plugin ?? '?'}: C++ (CMake target ${m.target}) ${m.version}${endstone ? ` · this Endstone ${endstone}` : ''} — go builds it with Endstone's toolchain (clang + libc++ on Linux, MSVC on Windows)`];
  const api = p?.api_version ?? m.api;
  o.push(`plugin ${m.plugin}: ${m.dist} ${m.version} · class ${m.cls}${p ? ` (${src(p.file)}:${p.line})` : ''} · api ${api ?? 'none'}${p && p.source !== 'class' ? ` (from ${p.source})` : ''}${endstone ? ` · this Endstone ${endstone}` : ''}`);
  if (api && supported && !supported.includes(String(api))) o.push(`E api_version ${api}: this Endstone loads only ${supported.join(' ')} — the plugin will not load (set api_version = "${supported.at(-1)}", then fix what the type check names)`);
  else if (api && supported && String(api) !== supported.at(-1)) o.push(`W api_version ${api}: written for an older Endstone (this one is ${supported.at(-1)}); it loads, and the type check below names what changed since`);
  if (!r) return o;
  if (r.error) { o.push(`W the plugin's code could not be read (${r.error})`); return o; }
  const cmds = r.commands ?? [];
  if (cmds.length) o.push(`commands (${cmds.length}): ${cmds.map((c) => `${c.usages[0] ?? '/' + c.name}${c.aliases.length ? ` (also /${c.aliases.join(' /')})` : ''} [${c.handled ?? 'no answer found'}${c.permissions.length ? `; ${c.permissions.join(',')}` : ''}]`).join(' · ')}${cmds[0].at ? ` — declared ${cmds[0].at.replace(/^([\w/.-]+\.py):/, (_, f) => `${src(f)}:`)}` : ''}`);
  else o.push('commands: none declared');
  for (const x of r.executors ?? []) o.push(`  executor for /${x.commands.join(' /')}: ${src(x.at)}`);
  if (r.perms?.length) o.push(`permissions: ${r.perms.map((x) => `${x.name}=${x.default}`).join(' ')}`);
  if (r.events?.length) o.push(`events (${r.events.length}): ${r.events.map((e) => `${e.event} → ${e.method} ${src(e.at)}${e.priority ? ` [${String(e.priority).split('.').pop()}]` : ''}${e.registered ? '' : ' (never registered)'}`).join(' · ')}`);
  if (r.tasks?.length) o.push(`scheduler: ${r.tasks.map((t) => `${src(t.at)} ${t.repeat ? 'repeating' : 'once'}`).join(' · ')}`);
  if (r.data?.length) o.push(`data files: ${r.data.map(src).join(' ')} (save_default_config copies a config.toml into its data folder)`);
  if (r.risky?.length) o.push(`what it could do outside the game (someone else's code: read these lines before it runs): ${r.risky.map((x) => `${src(x.at)} ${x.what}`).join(' · ')}`);
  const bugs = [];
  for (const [f, ln, msg] of r.syntax ?? []) bugs.push(`${src(f)}:${ln} SyntaxError: ${msg}`);
  for (const w of r.warnings ?? []) bugs.push(`${src(w.at)} ${w.msg}`);
  for (const t of r.thread ?? []) bugs.push(`${src(t.at)} ${t.what} blocks the server thread (every player freezes): self.server.scheduler.run_task, or a thread that hands back with run_task`);
  for (const x of r.missing ?? []) bugs.push(x.sure ? `imports ${x.module}, but no declared dependency provides it: the plugin fails to load where it is not installed → node lab.mjs lib add ${x.dist}` : `imports ${x.module}: not installed here, and the lab cannot tell which declared dependency gives it (go installs them, then says) — if none does: node lab.mjs lib add <its PyPI name>`);
  for (const n of r.notes ?? []) bugs.push(n.replace(/^([\w/.-]+\.py):/, (_, f) => `${src(f)}:`));
  for (const c of cmds.filter((x) => !x.handled)) bugs.push(`/${c.name}: nothing found that answers it (no on_command branch, no executor): a player gets the usage or nothing`);
  if (checks) {
    // the type check's errors: an API this Endstone does not have (a name, a call, an import, a property overridden) in full;
    // the rest (None not checked, an annotation off) counted by kind — go stops on both (LAB_PY_TYPES=warn: hints only)
    const API = /\((reportAttributeAccessIssue|reportMissingImports|reportMissingModuleSource|reportCallIssue|reportIncompatibleMethodOverride|reportIncompatibleVariableOverride|reportAbstractUsage)\)$/;
    const api = (checks.errs ?? []).filter((e) => API.test(e)), other = (checks.errs ?? []).filter((e) => !API.test(e) && /\(report\w+\)$/.test(e)), plain = (checks.errs ?? []).filter((e) => !API.test(e) && !/\(report\w+\)$/.test(e));
    for (const e of plain) bugs.push(e);
    for (const e of api) bugs.push(`not in this Endstone's API: ${e}`);
    if (other.length) {
      const by = {}; for (const e of other) { const k = /\((report\w+)\)$/.exec(e)[1]; by[k] = (by[k] ?? 0) + 1; }
      bugs.push(`${other.length} type error(s) besides (go stops on them): ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replace(/^report/, '')} ${n}`).join(', ')} — first ${other[0].split(' ')[0]} (all: node lab.mjs check)`);
    }
    for (const w of checks.warns ?? []) bugs.push(w);
  }
  if (bugs.length) { o.push(`bugs found before any server (fix them all in the first round; the type check's lines are what go stops on):`); for (const b of bugs.slice(0, 40)) o.push(`  ${b}`); if (bugs.length > 40) o.push(`  … ${bugs.length - 40} more (node lab.mjs brief)`); }
  return o;
}

// ---- where the plugin is in what was given: a project (pyproject.toml / setup.cfg / setup.py), or a wheel's dist-info
const tomlEntry = (t) => /\[project\.entry-points\.["']?endstone["']?\]\s*\n\s*["']?([\w.-]+)["']?\s*=\s*["']([\w.]+):(\w+)["']/.exec(t);
function findProject(root) {
  const cands = [];
  for (const f of walk(root, (x) => /(^|[\\/])(pyproject\.toml|setup\.cfg|setup\.py|CMakeLists\.txt)$/.test(x) || /\.dist-info[\\/]entry_points\.txt$/.test(x))) {
    const t = fs.readFileSync(f, 'utf8'), b = path.basename(f), depth = path.relative(root, f).split(path.sep).length;
    if (b === 'pyproject.toml') { const e = tomlEntry(t); if (e) cands.push({ kind: 'pyproject', dir: path.dirname(f), ep: e[1], pkg: e[2].split('.')[0], cls: e[3], depth }); }
    else if (b === 'setup.cfg') { const e = /\[options\.entry_points\][^[]*?endstone\s*=\s*\n\s*([\w.-]+)\s*=\s*([\w.]+):(\w+)/.exec(t); if (e) cands.push({ kind: 'setup', dir: path.dirname(f), ep: e[1], pkg: e[2].split('.')[0], cls: e[3], depth, text: t }); }
    else if (b === 'setup.py') { const e = /["']endstone["']\s*:\s*\[\s*["']\s*([\w.-]+)\s*=\s*([\w.]+):(\w+)/.exec(t); if (e) cands.push({ kind: 'setup', dir: path.dirname(f), ep: e[1], pkg: e[2].split('.')[0], cls: e[3], depth, text: t }); }
    else if (b === 'CMakeLists.txt' && /endstone_add_plugin|endstone/i.test(t)) {
      // its name: ENDSTONE_PLUGIN("name", ...) in the source, else the CMake project without its endstone_ prefix
      const decl = walk(path.dirname(f), (x) => /\.(cpp|cc|cxx|h|hpp)$/.test(x)).map((x) => /ENDSTONE_PLUGIN\(\s*"([^"]+)"/.exec(fs.readFileSync(x, 'utf8'))?.[1]).find(Boolean);
      cands.push({ kind: 'cpp', dir: path.dirname(f), ep: decl ?? /project\(\s*(?:endstone_)?([\w-]+)/.exec(t)?.[1], depth: depth + 0.5 });
    }
    else if (b === 'entry_points.txt') { const e = /\[endstone\]\s*\n\s*([\w.-]+)\s*=\s*([\w.]+):(\w+)/.exec(t); if (e) cands.push({ kind: 'wheel', dir: path.dirname(path.dirname(f)), info: path.dirname(f), ep: e[1], pkg: e[2].split('.')[0], cls: e[3], depth }); }
  }
  // the shallowest: an sdist's own project before the example inside it (inventoryui's example/pyproject.toml)
  return cands.sort((a, b) => a.depth - b.depth)[0] ?? null;
}
// METADATA (wheel) / PKG-INFO (sdist): Name, Version, Summary, Requires-Python, Requires-Dist (the extras left out)
function readMetadata(text) {
  const head = text.split(/\r?\n\r?\n/)[0], one = (k) => new RegExp(`^${k}:\\s*(.*)$`, 'mi').exec(head)?.[1]?.trim();
  const deps = [...head.matchAll(/^Requires-Dist:\s*(.+)$/gmi)].map((x) => x[1].trim()).filter((d) => !/extra\s*==/.test(d));
  return { name: one('Name'), version: one('Version'), summary: one('Summary'), python: one('Requires-Python'), deps };
}
const pyprojectText = ({ dist, version, summary, python, deps, ep, pkg, cls }) => `[build-system]\nrequires = ["hatchling"]\nbuild-backend = "hatchling.build"\n\n[project]\nname = "${dist}"\nversion = "${version}"\ndescription = ${JSON.stringify(summary ?? '')}\nrequires-python = "${python ?? '>=3.10'}"\ndependencies = [${deps.map((d) => JSON.stringify(d)).join(', ')}]\n\n[project.entry-points."endstone"]\n${ep} = "${pkg}:${cls}"\n\n[tool.hatch.build.targets.wheel]\npackages = ["src/${pkg}"]\n`;

export async function importPlugin(L, args) {
  const pos = args.filter((a, k) => !a.startsWith('--') && args[k - 1] !== '--name');
  const given = pos[0], request = pos.slice(1).join(' ').trim();
  const cands = given ? [path.resolve(process.env.LAB_CALLER_CWD ?? process.cwd(), given), path.resolve(L.TOP, given), path.resolve(given)] : [];
  const src = cands.find((c) => exists(c));
  if (!src) L.die(`usage: node lab.mjs import <plugin.whl|.tar.gz|.zip|folder> ["<what the person asked>"] [--name n]   (an Endstone plugin: a wheel or an sdist from PyPI — pip download --no-deps <name> —, GitHub's source zip, a folder)${given ? ` (no ${given} here)` : ''}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-import-'));
  try {
    if (fs.statSync(src).isDirectory()) copyTree(src, tmp);
    else {
      const buf = fs.readFileSync(src);
      if (buf[0] === 0x1f && buf[1] === 0x8b) untar(buf, tmp);
      else if (buf.readUInt32LE(0) === 0x04034b50) L.unzip(buf, tmp);
      else if (/\.(so|dll|pyd)$/i.test(src)) L.die(`${path.basename(src)} is a built C++ plugin: the lab needs its source (a folder or zip with CMakeLists.txt) to build, test and fix it`);
      else L.die(`${path.basename(src)}: not a wheel, a .tar.gz or a zip (a plugin is a .whl from PyPI or a folder with pyproject.toml)`);
    }
    const pr = findProject(tmp);
    if (!pr) {
      const so = walk(tmp, (f) => /\.(so|dll)$/i.test(f));
      L.die(so.length ? `only a built native plugin (${path.basename(so[0])}) in ${given}: the lab needs its source (CMakeLists.txt + src/) to build and test it` : `no Endstone plugin in ${given}: none of pyproject.toml [project.entry-points."endstone"], setup.cfg / setup.py entry_points "endstone", a wheel's entry_points.txt [endstone], CMakeLists.txt with Endstone`);
    }
    const i = args.indexOf('--name'), base = (i >= 0 ? args[i + 1] : pr.ep ?? path.basename(pr.dir)) ?? 'imported';
    const name = String(base).toLowerCase().replace(/^endstone[-_]/, (x) => (i >= 0 ? x : '')).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'imported';
    const dir = path.join(L.ADDONS, name);
    if (exists(dir)) L.die(`plugins/${name} exists (use --name <other>)`);
    const notes = [];
    if (pr.kind === 'cpp') copyTree(pr.dir, dir);
    else if (pr.kind === 'pyproject') {
      copyTree(pr.dir, dir);
      // a flat layout (<pkg>/ beside pyproject.toml): the lab reads, checks and packs src/<pkg>/ — moved there; hatch is told
      if (!exists(path.join(dir, 'src', pr.pkg)) && exists(path.join(dir, pr.pkg))) {
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true }); fs.renameSync(path.join(dir, pr.pkg), path.join(dir, 'src', pr.pkg));
        let t = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8');
        if (!/\[tool\.hatch\.build\.targets\.wheel\]/.test(t) && /hatchling/.test(t)) t += `\n[tool.hatch.build.targets.wheel]\npackages = ["src/${pr.pkg}"]\n`;
        fs.writeFileSync(path.join(dir, 'pyproject.toml'), t);
        notes.push(`moved ${pr.pkg}/ to src/${pr.pkg}/ (the layout the lab packs)`);
      }
    } else {
      // a wheel or a setup.py/.cfg project: its package under src/, a pyproject.toml from its metadata (names and version kept)
      const from = pr.kind === 'wheel' ? pr.dir : exists(path.join(pr.dir, 'src', pr.pkg)) ? path.join(pr.dir, 'src') : pr.dir;
      if (!exists(path.join(from, pr.pkg))) L.die(`the entry point names package ${pr.pkg}, which is not in ${given}`);
      copyTree(path.join(from, pr.pkg), path.join(dir, 'src', pr.pkg));
      const metaFile = pr.kind === 'wheel' ? path.join(pr.info, 'METADATA') : [path.join(pr.dir, 'PKG-INFO')].find(exists);
      const md = metaFile && exists(metaFile) ? readMetadata(fs.readFileSync(metaFile, 'utf8')) : {};
      const nameIn = pr.text ? /name\s*=\s*["']?([\w.-]+)/.exec(pr.text)?.[1] : null, verIn = pr.text ? /version\s*=\s*["']?([\w.+-]+)/.exec(pr.text)?.[1] : null;
      const depsIn = pr.text ? [...(/install_requires\s*=\s*\[([^\]]*)\]/.exec(pr.text)?.[1] ?? '').matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : [];
      fs.writeFileSync(path.join(dir, 'pyproject.toml'), pyprojectText({ dist: md.name ?? nameIn ?? `endstone-${pr.ep}`, version: md.version ?? verIn ?? '0.1.0', summary: md.summary, python: md.python, deps: md.deps ?? depsIn, ep: pr.ep, pkg: pr.pkg, cls: pr.cls }));
      notes.push(pr.kind === 'wheel' ? `pyproject.toml written from the wheel's METADATA (${md.name} ${md.version})` : 'pyproject.toml written from setup.py / setup.cfg');
      for (const f of ['README.md', 'README.rst', 'LICENSE', 'LICENSE.txt', 'CHANGELOG.md']) { const s = [path.join(pr.dir, f), pr.info && path.join(pr.info, 'licenses', f)].filter(Boolean).find(exists); if (s) fs.copyFileSync(s, path.join(dir, f)); }
    }
    if (!exists(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), '__pycache__/\n*.pyc\n');
    const m = (await import('./flavor.mjs')).unitMeta(dir);
    const { lines, r } = await briefOf(L, dir, m);
    const own = exists(path.join(dir, 'tests.txt'));
    if (!own) fs.writeFileSync(path.join(dir, 'tests.txt'), m?.kind === 'py' ? draftTests(name, r) : `## loads\npy server.plugin_manager.get_plugin('${m?.plugin ?? name}').is_enabled\n= True\n`);
    L.writeJson(path.join(dir, 'imported.json'), { from: path.basename(src), dist: m?.dist ?? null, version: m?.version ?? null, plugin: m?.plugin ?? null, request: request || null });
    if (!exists(path.join(dir, 'TASK.md'))) fs.writeFileSync(path.join(dir, 'TASK.md'), L.TASK_MD(name, request ? `${request}\n\n(a person's plugin, imported from ${path.basename(src)}: keep its distribution name, entry point and version line, so their servers update in place)` : `(a person's plugin, imported from ${path.basename(src)}: keep its distribution name, entry point and version line, so their servers update in place)`));
    L.useAddon(name, true);
    for (const n of notes) L.out(`  ${n}`);
    for (const l of lines) L.out(l);
    L.out(`OK end/plugins/${name}/ (${m?.kind === 'cpp' ? 'C++' : `${m?.dist} ${m?.version}`}), now the current plugin; tests.txt: ${own ? 'its own' : 'a draft that runs each way in once'}${request ? '' : '; put the request in TASK.md'}; next: node lab.mjs go`);
    return true;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// the brief of a plugin folder: the reading above, Endstone's own version and supported API list, and the type check
async function briefOf(L, dir, m) {
  const F = await import('./flavor.mjs');
  let endstone = null, supported = null, checks = null;
  const vpy = path.join(L.CACHE, 'py', process.platform === 'win32' ? 'Scripts' : 'bin', `python${process.platform === 'win32' ? '.exe' : ''}`);
  if (exists(vpy)) {
    const q = L.RT.run(vpy, ['-c', 'import json\nfrom importlib.metadata import version\nfrom endstone._internal.plugin_loader import PythonPluginLoader as P\nprint(json.dumps([version("endstone"), P.SUPPORTED_API]))']);
    const q2 = q.status === 0 ? q : L.RT.run(vpy, ['-c', 'import json\nfrom importlib.metadata import version\nfrom endstone.plugin.plugin_loader import PythonPluginLoader as P\nprint(json.dumps([version("endstone"), P.SUPPORTED_API]))']);
    try { [endstone, supported] = JSON.parse(q2.stdout.trim()); } catch { /* an Endstone without the list: no check */ }
    if (m?.kind === 'py' && process.env.LAB_BRIEF_TYPES !== '0') {
      try { checks = await F.checksOf(L, dir); } catch (e) { checks = { errs: [], warns: [`type check unavailable (${String(e.message).split('\n')[0]})`] }; }
    }
  }
  // (read after the type check: it installs the declared dependencies, and what they provide is then known)
  const r = m?.kind === 'py' ? readPlugin(L, m) : null;
  return { lines: briefLines(L, m, r, { endstone, supported, checks }), r };
}

export async function briefPlugin(L) {
  const F = await import('./flavor.mjs'), m = F.unitMeta(L.ADDON);
  for (const l of (await briefOf(L, L.ADDON, m)).lines) L.out(l);
  return true;
}
