// `node lab.mjs end import` and `brief` without a server (end/importer.mjs + end/brief.py): a person's Endstone plugin in each
// shape it comes in — a wheel, an sdist .tar.gz, a flat-layout folder, a setup.py project, a source zip with two projects, a
// built-only native plugin — becomes plugins/<name>/ with its names kept, read without running it: commands and how each is
// answered, events and whether registered, tasks, what it could do, calls that block the server thread, imports no
// dependency gives, metadata loaded by a decorator (plugin.yml); a draft tests.txt; Endstone's own name rules in go's checks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I = await import(pathToFileURL(path.join(TOP, 'end', 'importer.mjs')).href);
const F = await import(pathToFileURL(path.join(TOP, 'end', 'flavor.mjs')).href);
let pass = 0, fail = 0;
const ok = (c, what, detail = '') => { if (c) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}${detail ? `\n     ${String(detail).split('\n').join('\n     ')}` : ''}`); } };
const hasPy = ['python3', 'python'].some((c) => spawnSync(c, ['-c', 'import sys;assert sys.version_info>=(3,9)']).status === 0);

// ---- archives made here: a zip (stored) and a ustar .tar.gz
function zip(files) {
  const parts = [], cen = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), n = Buffer.from(name), crc = zlib.crc32 ? zlib.crc32(data) : 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc >>> 0, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, n, data); cen.push(c, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cen.length / 2, 8); e.writeUInt16LE(cen.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
function tgz(files) {
  const blocks = [];
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), h = Buffer.alloc(512);
    h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116); h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.write('        ', 148); h[156] = 48; h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
function unzipStored(buf, dest) {   // (the lab's own unzip is core's; these test zips are stored)
  let e = buf.length - 22; while (buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let n = buf.readUInt16LE(e + 10); n > 0; n--) {
    const size = buf.readUInt32LE(p + 20), fl = buf.readUInt16LE(p + 28), lo = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + fl);
    p += 46 + fl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (name.includes('..')) continue;
    const at = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), to = path.join(dest, name);
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, buf.subarray(at, at + size));
  }
}

const X = fs.mkdtempSync(path.join(os.tmpdir(), 'end-import-')), OUT = [];
class Stop extends Error {}
const L = { TOP, ADDONS: path.join(X, 'plugins'), CACHE: path.join(X, 'cache'), RT: { kind: 'native', run: (c, a) => spawnSync(c, a, { encoding: 'utf8' }) },
  out: (l) => OUT.push(l), die: (m) => { throw new Stop(m); }, unzip: unzipStored, writeJson: (f, j) => fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'),
  TASK_MD: (t, r) => `# ${t}\n\n${r}\n`, useAddon: () => {}, rel: (f) => path.relative(X, f) };
fs.mkdirSync(L.ADDONS, { recursive: true });
const run = async (file, ...a) => { OUT.length = 0; try { return { ok: await I.importPlugin(L, [file, ...a]), out: OUT.join('\n') }; } catch (e) { if (!(e instanceof Stop)) throw e; return { ok: false, out: `${OUT.join('\n')}\nERR ${e.message}` }; } };
const put = (dir, files) => { for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); } return dir; };

const PLUGIN = `import time, subprocess, yaml
from endstone import Player
from endstone.command import Command, CommandSender
from endstone.event import PlayerJoinEvent, PlayerChatEvent, BlockBreakEvent, event_handler
from endstone.plugin import Plugin


class Listener:
    @event_handler
    def on_break(self, e: BlockBreakEvent):
        pass


class Orphan:
    @event_handler
    def on_chat(self, e: PlayerChatEvent):
        pass


class Warp(Plugin):
    api_version = "0.11"
    prefix = "Warp"
    commands = {
        "warp": {"description": "Go", "usages": ["/warp <name: str> [x: int]"], "permissions": ["warp.command.warp"]},
        "setwarp": {"description": "Set", "usages": ["/setwarp (here|there)<where: Where> <n: int>"], "permissions": ["warp.command.set"]},
        "ghost": {"description": "Nobody answers", "usages": ["/ghost"]},
    }
    permissions = {"warp.command.warp": {"description": "", "default": True}}

    def on_enable(self):
        self.register_events(self)
        self.register_events(Listener())
        self.server.scheduler.run_task(self, self.tick, delay=0, period=20)

    def tick(self):
        pass

    @event_handler
    def on_join(self, e: PlayerJoinEvent):
        time.sleep(1)
        subprocess.run(["ls"])

    def on_command(self, sender: CommandSender, command: Command, args: list[str]) -> bool:
        if command.name == "warp":
            return True
        if command.name == "setwarp":
            return True
        return False
`;
const META = 'Metadata-Version: 2.1\nName: endstone-warp\nVersion: 1.2.3\nSummary: Warps\nRequires-Python: >=3.10\nRequires-Dist: requests\nRequires-Dist: ruff; extra == "dev"\n\n# Warp\n';

// ---- the pure parts
ok(I.sampleArgs('/warp <name: str> [x: int]') === 'x', `usage → the shortest call: required only (${I.sampleArgs('/warp <name: str> [x: int]')})`);
ok(I.sampleArgs('/setwarp (here|there)<where: Where> <n: int>') === 'here 1' && I.sampleArgs('/tp <who: player> <pos: position>') === 'A 0 -60 0' && I.sampleArgs('/home set <name: str>') === 'set x' && I.sampleArgs('/back') === '',
  `an enum's first value, a player as A, a position, the bare words before the first parameter (${I.sampleArgs('/home set <name: str>')})`);
{
  const d = put(path.join(X, 'evil'), {}), file = path.join(X, 'evil.tar.gz');
  fs.writeFileSync(file, tgz({ 'ok/a.txt': 'a', '../escape.txt': 'no', 'ok/../../escape2.txt': 'no' }));
  I.untar(fs.readFileSync(file), d);
  ok(fs.existsSync(path.join(d, 'ok', 'a.txt')) && !fs.existsSync(path.join(X, 'escape.txt')) && !fs.existsSync(path.join(path.dirname(X), 'escape2.txt')), 'untar: the archive\'s files, nothing written outside the folder (../ names skipped)');
}

// ---- a wheel: its package under src/, pyproject.toml from METADATA (name, version, deps without extras, entry point)
{
  const whl = path.join(X, 'endstone_warp-1.2.3-py3-none-any.whl');
  fs.writeFileSync(whl, zip({ 'endstone_warp/__init__.py': 'from .plugin import Warp\n', 'endstone_warp/plugin.py': PLUGIN, 'endstone_warp/config.toml': 'a = 1\n',
    'endstone_warp-1.2.3.dist-info/METADATA': META, 'endstone_warp-1.2.3.dist-info/entry_points.txt': '[endstone]\nwarp = endstone_warp:Warp\n', 'endstone_warp-1.2.3.dist-info/RECORD': '' }));
  const r = await run(whl, 'ワープを足して');
  const dir = path.join(L.ADDONS, 'warp'), pj = fs.existsSync(path.join(dir, 'pyproject.toml')) ? fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8') : '';
  ok(r.ok && /name = "endstone-warp"/.test(pj) && /version = "1\.2\.3"/.test(pj) && /dependencies = \["requests"\]/.test(pj) && /warp = "endstone_warp:Warp"/.test(pj) && fs.existsSync(path.join(dir, 'src', 'endstone_warp', 'config.toml')),
    'wheel → plugins/warp: src/endstone_warp (data files too), pyproject.toml from METADATA (the dev extra left out)', r.out + '\n' + pj);
  const m = F.unitMeta(dir);
  ok(m?.plugin === 'warp' && m.pkg === 'endstone_warp' && m.cls === 'Warp' && m.api === '0.11', 'the lab reads it as its own plugin (unitMeta)', JSON.stringify(m));
  const im = JSON.parse(fs.readFileSync(path.join(dir, 'imported.json'), 'utf8'));
  ok(im.dist === 'endstone-warp' && im.version === '1.2.3' && im.request === 'ワープを足して' && /ワープを足して/.test(fs.readFileSync(path.join(dir, 'TASK.md'), 'utf8')), 'imported.json and TASK.md keep where it came from and what was asked');
  ok(/OK end\/plugins\/warp\/ \(endstone-warp 1\.2\.3\)/.test(r.out) && (await run(whl)).out.includes('plugins/warp exists'), 'its line, and a second import of the same is refused (--name)', r.out);
  if (hasPy) {
    const R = I.readPlugin(L, m), cmd = (n) => R.commands.find((c) => c.name === n);
    ok(R.plugin.class === 'Warp' && R.commands.length === 3 && cmd('warp').handled === 'on_command' && cmd('setwarp').handled === 'on_command' && cmd('ghost').handled === null,
      'brief: the commands, and which on_command answers (a branch each; the one nothing answers)', JSON.stringify(R.commands));
    const ev = Object.fromEntries(R.events.map((e) => [e.event, e.registered]));
    ok(ev.PlayerJoinEvent === true && ev.BlockBreakEvent === true && ev.PlayerChatEvent === false && R.notes.some((n) => /Orphan\.on_chat handles PlayerChatEvent, but nothing calls register_events with Orphan/.test(n)),
      'brief: event handlers — the plugin\'s own and a registered listener run, one in a class never registered does not (said)', JSON.stringify(R.events) + R.notes);
    ok(R.tasks.length === 1 && R.tasks[0].repeat && R.thread.some((t) => /time\.sleep/.test(t.what)) && R.risky.some((x) => /subprocess/.test(x.what)),
      'brief: a repeating task, a sleep on the server thread, a process started (what it could do)', JSON.stringify([R.tasks, R.thread, R.risky]));
    ok(R.missing.some((x) => x.module === 'yaml' && x.dist === 'pyyaml') && !R.missing.some((x) => x.module === 'requests'), 'brief: imports yaml with no pyyaml declared (requests is declared)', JSON.stringify(R.missing));
    ok(R.notes.some((n) => /\/ghost needs|\/warp needs permission/.test(n)) || R.notes.some((n) => /setwarp needs permission warp\.command\.set/.test(n)), 'brief: a command\'s permission the permissions do not declare', R.notes.join('\n'));
    const t = fs.readFileSync(path.join(dir, 'tests.txt'), 'utf8');
    ok(/## loads\npy plugin\.is_enabled\n= True/.test(t) && /@A cmd \/warp x\n/.test(t) && /@A cmd \/setwarp here 1\n/.test(t) && /## \/ghost runs \(nothing found that answers it\)/.test(t)
      && /## a second player joins \(PlayerJoinEvent\)\n@B join/.test(t) && /## a block is broken \(BlockBreakEvent\)/.test(t) && !/PlayerChatEvent/.test(t) && /## its repeating task/.test(t) && /## a restart keeps it working\nrestart/.test(t),
      'draft tests.txt: loads, each command once with sample args, each registered event once (not the unregistered one), the task, a restart', t);
    const B = I.briefLines(L, m, R, { endstone: '0.11.15', supported: ['0.10', '0.11'], checks: { errs: ['src/x.py:3 Cannot access attribute "ping" for class "CommandSender" (reportAttributeAccessIssue)', 'src/x.py:4 "a" is not a known attribute of "None" (reportOptionalMemberAccess)', 'src/x.py:5 "b" is not a known attribute of "None" (reportOptionalMemberAccess)'], warns: [] } }).join('\n');
    ok(/^plugin warp: endstone-warp 1\.2\.3 · class Warp \(src\/endstone_warp\/plugin\.py:\d+\) · api 0\.11 · this Endstone 0\.11\.15/m.test(B) && /not in this Endstone's API: src\/x\.py:3 Cannot access attribute "ping"/.test(B) && /2 type error\(s\) besides \(go stops on them\): OptionalMemberAccess 2/.test(B)
      && /lib add pyyaml/.test(B) && /\/ghost: nothing found that answers it/.test(B) && /what it could do outside the game/.test(B) && !/src\/src\//.test(B),
      'the brief\'s lines: what it is, API misses in full, other type errors counted, the fixes named, paths as the folder has them', B);
    const old = I.briefLines(L, m, { ...R, plugin: { ...R.plugin, api_version: '0.4' } }, { supported: ['0.5', '0.11'] }).join('\n');
    ok(/^E api_version 0\.4: this Endstone loads only 0\.5 0\.11 — the plugin will not load/m.test(old), 'an api_version this Endstone does not load: an E line (Endstone refuses it)', old);
  } else console.log('skip brief.py checks (no Python 3.9+ here)');
}

// ---- an sdist (.tar.gz) holding two projects: the shallow one is the plugin; a flat layout moved under src/
{
  const file = path.join(X, 'endstone_inv-2.0.tar.gz');
  fs.writeFileSync(file, tgz({ 'endstone_inv-2.0/pyproject.toml': '[build-system]\nrequires = ["hatchling"]\nbuild-backend = "hatchling.build"\n\n[project]\nname = "endstone-inv"\nversion = "2.0"\ndependencies = [\n  "x-protocol==1"\n]\n\n[project.entry-points."endstone"]\ninv = "endstone_inv:Inv"\n',
    'endstone_inv-2.0/endstone_inv/__init__.py': 'from .main import Inv\n', 'endstone_inv-2.0/endstone_inv/main.py': 'from endstone.plugin import Plugin\n\nclass Inv(Plugin):\n    api_version = "0.11"\n',
    'endstone_inv-2.0/example/pyproject.toml': '[project]\nname = "endstone-inv-example"\nversion = "1"\n\n[project.entry-points."endstone"]\ninv_example = "endstone_inv_example:Ex"\n', 'endstone_inv-2.0/PKG-INFO': 'Name: endstone-inv\n' }));
  const r = await run(file), dir = path.join(L.ADDONS, 'inv');
  ok(r.ok && fs.existsSync(path.join(dir, 'src', 'endstone_inv', 'main.py')) && /\[tool\.hatch\.build\.targets\.wheel\]\npackages = \["src\/endstone_inv"\]/.test(fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8')) && /moved endstone_inv\/ to src\/endstone_inv\//.test(r.out) && !fs.existsSync(path.join(L.ADDONS, 'inv_example')),
    'sdist .tar.gz: the project itself, not the example inside it; a flat layout moved under src/ (hatch told)', r.out);
  ok(F.unitMeta(dir)?.deps?.[0] === 'x-protocol==1', 'its multi-line dependencies are read', JSON.stringify(F.unitMeta(dir)));
}

// ---- a setup.py project folder; a plugin.yml loaded by a class decorator; an entry point with a dash (Endstone reads it as _)
{
  const src = put(path.join(X, 'src-setup'), { 'setup.py': 'from setuptools import setup\nsetup(name="endstone-disable-me", version="0.3", install_requires=["pyyaml"], entry_points={"endstone": ["disable-me = endstone_disable_me:DisableMe"]})\n',
    'endstone_disable_me/__init__.py': 'from .plugin import DisableMe\n',
    'endstone_disable_me/plugin.yml': 'api_version: "0.5"\ncommands:\n  hush:\n    description: "Quiet"\n    usages: [ "/hush <who: player>" ]\n    permissions: [ "dm.hush" ]\n',
    'endstone_disable_me/plugin.py': 'import yaml\nfrom pathlib import Path\nfrom endstone.plugin import Plugin\n\ndef meta(f):\n    def d(cls):\n        return cls\n    return d\n\n@meta("plugin.yml")\nclass DisableMe(Plugin):\n    def on_command(self, sender, command, args):\n        return True\n' });
  const r = await run(src), dir = path.join(L.ADDONS, 'disable_me'), m = F.unitMeta(dir);
  ok(r.ok && m?.plugin === 'disable-me' && m.name === 'disable_me' && m.api === '0.5' && /version = "0\.3"/.test(fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8')) && m.deps.includes('pyyaml'),
    'setup.py → pyproject.toml (name, version, install_requires); entry point disable-me is the plugin disable_me; api_version from the plugin.yml its decorator loads', r.out + JSON.stringify(m));
  if (hasPy) {
    const R = I.readPlugin(L, m);
    ok(R.plugin.api_version === '0.5' && /plugin\.yml/.test(R.plugin.source) && R.commands[0]?.name === 'hush' && R.commands[0].usages[0] === '/hush <who: player>' && R.commands[0].handled === 'on_command' && !R.missing.length,
      'brief: commands from plugin.yml through @meta (as Endstone sees them once the class is built); pyyaml is declared', JSON.stringify(R));
  }
  // go's checks follow Endstone's loader: a dash in the entry point is fine, the distribution must be endstone-<entry point>
  const chk = async (dist, ep) => { const d = put(path.join(X, `chk-${dist}-${ep}`), { 'pyproject.toml': `[project]\nname = "${dist}"\nversion = "1"\n\n[project.entry-points."endstone"]\n${ep} = "endstone_c:C"\n`, 'src/endstone_c/__init__.py': 'from .p import C\n', 'src/endstone_c/p.py': 'class C:\n    api_version = "0.11"\n' }); return F.checksOf({ ...L, ADDON: d }, d).then((c) => c.errs.join(' | ')); };
  const e1 = await chk('endstone-disable-me', 'disable-me'), e2 = await chk('endstone-disable-me', 'disable_me'), e3 = await chk('endstone-other', 'thing'), e4 = await chk('mything', 'mything');
  ok(!/Invalid name|must be lowercase|disagree|must start/.test(e1) && !/disagree|must start/.test(e2) && /disagree: Endstone loads it only when the name is "endstone-thing"/.test(e3) && /must start with "endstone-"/.test(e4),
    'go\'s name checks are Endstone\'s: endstone-disable-me with disable-me or disable_me loads; a name that does not match the entry point, or no endstone- prefix, does not', [e1, e2, e3, e4].join('\n'));
}

// ---- what is not a plugin the lab can take: said plainly
{
  const so = path.join(X, 'native.zip'); fs.writeFileSync(so, zip({ 'endstone_fast.so': 'ELF' }));
  const r1 = await run(so), r2 = await run(put(path.join(X, 'nothing'), { 'README.md': 'hi' })), r3 = await run(path.join(X, 'no-such.whl'));
  ok(/only a built native plugin \(endstone_fast\.so\).*needs its source/.test(r1.out) && /no Endstone plugin in/.test(r2.out) && /usage: node lab\.mjs import .*\(no .*no-such\.whl here\)/.test(r3.out),
    'a built-only native plugin, a folder with no plugin, a missing file: each says what the lab needs', [r1.out, r2.out, r3.out].join('\n'));
  const cpp = await run(put(path.join(X, 'cpp-src'), { 'CMakeLists.txt': 'project(endstone_fast CXX)\nendstone_add_plugin(${PROJECT_NAME} src/fast.cpp)\n', 'src/fast.cpp': 'ENDSTONE_PLUGIN("fast", "1.0.0", Fast)\n' }));
  ok(cpp.ok && F.unitMeta(path.join(L.ADDONS, 'fast'))?.kind === 'cpp', 'a C++ plugin\'s source folder comes in as a C++ unit, named as ENDSTONE_PLUGIN names it', cpp.out);
}

fs.rmSync(X, { recursive: true, force: true });
console.log(fail ? `FAIL end-import-offline (${pass}/${pass + fail})` : `PASS end-import-offline (${pass}/${pass})`);
process.exit(fail ? 1 : 0);
