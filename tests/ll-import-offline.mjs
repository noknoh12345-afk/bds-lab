// `node lab.mjs ll import` and `brief` without a server (ll/importer.mjs): a person's LegacyScriptEngine plugin in each shape it
// comes in — a LiteLoader-era X.lxl.js with its data folder X/, a LeviLamina mod folder (manifest.json, lse-nodejs), a zip, a
// folder with several plugins — becomes ll/mods/<name>/ with its names kept, read without running it: commands with the
// parameters a first call needs, events, timers, data outside its folder, what it could do, plugins it needs; two mistakes
// LSE plugins make (going on after output.error, an array compared with null); calls neither LSE's .d.ts nor its engine has
// (a feature test such as `mc.x ? mc.x() : null` is not one); a draft tests.txt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I = await import(pathToFileURL(path.join(TOP, 'll', 'importer.mjs')).href);
let pass = 0, fail = 0;
const ok = (c, what, detail = '') => { if (c) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}${detail ? `\n     ${String(detail).split('\n').join('\n     ')}` : ''}`); } };

// TypeScript: the lab's own (any lab's cache), else this machine's
const tsDir = [...['bds', 'end', 'll'].flatMap((l) => fs.globSync?.(path.join(TOP, l, '.lab', '**', 'node_modules', 'typescript')) ?? []),
  (() => { const g = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }); return g.status === 0 ? path.join(g.stdout.trim(), 'typescript') : null; })()]
  .find((d) => d && fs.existsSync(path.join(d, 'package.json')));
if (!tsDir) { console.log('skip: no TypeScript on this machine (node lab.mjs setup once)'); process.exit(0); }
const ts = createRequire(import.meta.url)(tsDir);

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
function unzipStored(buf, dest) {
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

const X = fs.mkdtempSync(path.join(os.tmpdir(), 'll-import-')), OUT = [];
class Stop extends Error {}
const put = (dir, files) => { for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); } return dir; };
// LSE's types, cut down to what these plugins touch (the real ones: npm or GitHub, ll/flavor.mjs lseSdk)
const TYPES = put(path.join(X, 'types'), { 'src/index.d.ts': `declare namespace mc { function newCommand(n: string, d: string, p?: any): Command; function listen(e: 'onJoin', f: (pl: Player) => any): boolean; function listen(e: string, f: (...a: any[]) => any): boolean; function getOnlinePlayers(): Player[]; function runcmdEx(c: string): any; }
declare namespace ll { function registerPlugin(...a: any[]): boolean; function imports(...a: any[]): any; function exports(...a: any[]): any; }
declare namespace data { function toJson(o: any, space: number): string; }
declare class JsonConfigFile { constructor(p: string, d?: string); get(k: string, d?: any): any; set(k: string, v: any): boolean; }
declare class Player { realName: string; xuid: string; tell(m: string): boolean; }
declare class Command { mandatory(n: string, t: any, e?: string): number; optional(n: string, t: any): number; overload(ns?: string[]): boolean; setEnum(n: string, v: string[]): string; setCallback(f: (c: any, o: any, out: any, r: any) => void): boolean; setup(): boolean; }
declare const PermType: { Any: 0; GameMasters: 1 }; declare const ParamType: { Int: 1; String: 2; Enum: 3; Player: 4 };
declare function setInterval(f: () => void, ms: number): number;` }) ;
const L = { TOP, ADDONS: path.join(X, 'mods'), CACHE: path.join(X, 'cache'), out: (l) => OUT.push(l), die: (m) => { throw new Stop(m); }, unzip: unzipStored,
  writeJson: (f, j) => fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'), TASK_MD: (t, r) => `# ${t}\n\n${r}\n`, useAddon: () => {}, rel: (f) => path.relative(X, f) };
const env = { ts: () => ts, types: () => TYPES };
fs.mkdirSync(L.ADDONS, { recursive: true });
const run = async (...a) => { OUT.length = 0; try { return { ok: await I.importMod(L, a, env), out: OUT.join('\n') }; } catch (e) { if (!(e instanceof Stop)) throw e; return { ok: false, out: `${OUT.join('\n')}\nERR ${e.message}` }; } };

// ---- a LiteLoader-era plugin: Homes.lxl.js and its data folder Homes/
const LEGACY = `class Homes {
  static Meta = { Name: "HomesLL", Info: "Homes for everyone", Version: [1, 2, 3] };
  static init() { ll.registerPlugin(this.Meta.Name, this.Meta.Info, this.Meta.Version, {}); }
}
Homes.init();
const conf = new JsonConfigFile("./plugins/homes_data/homes.json", "{}");
let cmd = mc.newCommand("sethome", "Set a home", PermType.Any);
cmd.mandatory("name", ParamType.String);
cmd.overload(["name"]);
cmd.setCallback((_c, origin, output, result) => {
  const same = Object.keys(conf.get("h", {})).filter((k) => k == result.name);
  if (same != null) {
    output.error("taken");
  }
  conf.set(result.name, 1);
  return output.success("set");
});
cmd.setup();
cmd = mc.newCommand("tpmode", "Pick a mode", PermType.GameMasters);
cmd.setEnum("Mode", ["walk", "fly"]);
cmd.mandatory("mode", ParamType.Enum, "Mode");
cmd.mandatory("n", ParamType.Int);
cmd.overload(["mode", "n"]);
cmd.setCallback((_c, o, out, r) => { if (r.n < 0) { out.error("no"); return; } out.success("ok"); });
cmd.setup();
mc.listen("onJoin", (pl) => { pl.tell("hi " + pl.realName); pl.uid; });
mc.listen("onChat", (pl, m) => true);
setInterval(() => { const tps = mc.getTPS ? mc.getTPS() : null; mc.getMaxPlayers(); }, 1000);
`;
const src = put(path.join(X, 'in', 'legacy'), { 'Homes.lxl.js': LEGACY, 'Homes/lang.json': '{"hi":"hi"}', 'README.md': '# Homes', 'notes.png': 'x' });
let r = await run(src, 'homes that survive a restart');
const d1 = path.join(L.ADDONS, 'homes');
ok(r.ok, 'a .lxl.js imports', r.out);
const man = JSON.parse(fs.readFileSync(path.join(d1, 'manifest.json'), 'utf8'));
ok(man.name === 'Homes' && man.entry === 'Homes.js' && man.type === 'lse-quickjs' && man.version === '1.2.3' && man.description === 'Homes for everyone',
  'named after the file as LSE migrates it; version and description from ll.registerPlugin (read through this.Meta.*)', JSON.stringify(man));
ok(fs.existsSync(path.join(d1, 'src', 'Homes.lxl.js')) && /import '\.\/Homes\.lxl\.js'/.test(fs.readFileSync(path.join(d1, 'src', 'main.js'), 'utf8')), 'its file in src/, a main.js that imports it as it is');
ok(fs.existsSync(path.join(d1, 'assets', 'lang.json')) && fs.existsSync(path.join(d1, 'README.md')) && !fs.existsSync(path.join(d1, 'assets', 'notes.png')), 'its data folder Homes/ → assets/ (beside the bundle at run time); README kept; stray files left');
ok(/commands \(2\): \/sethome \[Any\] src\/Homes\.lxl\.js:7 · \/tpmode \[GameMasters\]/.test(r.out), 'commands with permission and file:line', r.out);
ok(/events \(2\): onJoin .* onChat/.test(r.out) && /timers \(1, 1 repeating\)/.test(r.out), 'events and timers');
ok(/outside its own folder plugins\/Homes\/: plugins\/homes_data/.test(r.out), 'data written outside its own folder is said');
ok(/src\/Homes\.lxl\.js:12 same != null: \.filter\(\.\.\) gives an array, never null — always true/.test(r.out), 'an array compared with null', r.out);
ok(/src\/Homes\.lxl\.js:13 the command carries on after output\.error/.test(r.out) && !/Homes\.lxl\.js:23 the command carries on/.test(r.out), 'going on after output.error (and not when a return follows)', r.out);
ok(/src\/Homes\.lxl\.js:26 TS2551 Property 'uid' does not exist on type 'Player'/.test(r.out) && /:28 TS2339 Property 'getMaxPlayers'/.test(r.out), 'calls LSE does not have, at file:line', r.out);
ok(!/getTPS/.test(r.out), 'a feature test (mc.getTPS ? mc.getTPS() : null) is not a finding', r.out);
const tt = fs.readFileSync(path.join(d1, 'tests.txt'), 'utf8');
ok(/## \/sethome runs\n@A join\n@A cmd \/sethome x/.test(tt) && /@A cmd \/tpmode walk 1/.test(tt) && /@A chat hello/.test(tt) && /## a restart keeps it working\nrestart/.test(tt), 'draft tests: each command with the arguments it needs (an enum takes its first value), each event once, a restart', tt);
ok(fs.readFileSync(path.join(d1, 'TASK.md'), 'utf8').includes('homes that survive a restart'), 'the request goes into TASK.md');
// a name LSE has at run time but its .d.ts lacks (BaseLib.js: ll.export = ll.exports) is not a finding
ok(I.engineHas("Property 'export' does not exist on type 'typeof ll'. Did you mean 'exports'?") && I.engineHas("Property 'getMoney' does not exist on type 'Player'.") && !I.engineHas("Property 'uid' does not exist on type 'Player'."), 'the engine\'s own names (ll/data/lse-runtime.json) cover what its .d.ts lacks');

// ---- a LeviLamina mod folder (lse-nodejs, its own files under src/) in a zip, with an npm package and a plugin it needs
const NODE = `const fs = require('fs');\nconst ban = require('./src/ban.js');\nll.registerPlugin("Guard", "x", [0, 3, 0]);\nmc.listen("onPlayerDie", (pl) => ban.note(pl));\nconst land = ll.imports("ILAPI", "PosGetLand");\n`;
fs.writeFileSync(path.join(X, 'in', 'guard.zip'), zip({ 'guard-main/manifest.json': JSON.stringify({ name: 'Guard', entry: 'index.js', type: 'lse-nodejs', version: '0.3.0', dependencies: [{ name: 'legacy-script-engine-nodejs' }] }),
  'guard-main/index.js': NODE, 'guard-main/src/ban.js': 'exports.note = (pl) => mc.runcmdEx("say " + pl.realName);\n', 'guard-main/package.json': '{"dependencies":{"express":"^4"}}', 'guard-main/LICENSE': 'MIT' }));
r = await run(path.join(X, 'in', 'guard.zip'));
const d2 = path.join(L.ADDONS, 'guard');
ok(r.ok && JSON.parse(fs.readFileSync(path.join(d2, 'manifest.json'), 'utf8')).type === 'lse-nodejs', 'a mod folder in a zip: its manifest kept (lse-nodejs)', r.out);
ok(fs.existsSync(path.join(d2, 'src', 'index.js')) && fs.existsSync(path.join(d2, 'src', 'src', 'ban.js')) && !fs.existsSync(path.join(d2, 'src', 'main.js')) && fs.existsSync(path.join(d2, 'package.json')) && fs.existsSync(path.join(d2, 'LICENSE')), 'files keep their places under src/ (index.js is the lab\'s entry too); package.json and LICENSE kept');
ok(/src\/index\.js:1 require\('fs'\): reads and writes files/.test(r.out) && /src\/src\/ban\.js:1 mc\.runcmdEx\(\): runs a server command/.test(r.out), 'what it could do outside the game, in every file', r.out);
ok(/other plugins it needs: ILAPI src\/index\.js:5/.test(r.out) && /its npm packages: express/.test(r.out), 'plugins and npm packages it needs', r.out);
ok(/## a player dies and respawns \(onPlayerDie\)\n@A join\nkill A/.test(fs.readFileSync(path.join(d2, 'tests.txt'), 'utf8')), 'an event\'s draft section makes it happen');

// ---- several plugins in one folder: pick one; nothing that is a plugin
put(path.join(X, 'in', 'many'), { 'A.js': 'mc.listen("onJoin", () => {});\n', 'B.js': 'mc.listen("onLeft", () => {});\n', 'util.js': 'module.exports = 1;\n' });
r = await run(path.join(X, 'in', 'many'));
ok(!r.ok && /2 plugins in .*--file <it> \(A\.js, B\.js\)/.test(r.out), 'several plugins: asks for --file and names them', r.out);
r = await run(path.join(X, 'in', 'many'), '--file', 'B.js');
ok(r.ok && fs.existsSync(path.join(L.ADDONS, 'b', 'src', 'B.js')) && !fs.existsSync(path.join(L.ADDONS, 'b', 'src', 'A.js')), '--file takes that one alone', r.out);
put(path.join(X, 'in', 'none'), { 'x.js': 'console.log(1);\n' });
r = await run(path.join(X, 'in', 'none'));
ok(!r.ok && /no LegacyScriptEngine plugin/.test(r.out), 'a folder without a plugin is said', r.out);
r = await run(path.join(src, 'Homes.lxl.js'));
ok(!r.ok && /mods\/homes exists/.test(r.out), 'an existing mod is not overwritten');

// ---- brief on the imported mod reads the same
OUT.length = 0; await I.briefMod({ ...L, ADDON: d1 }, [], env);
ok(/commands \(2\)/.test(OUT.join('\n')) && /TS2551 Property 'uid'/.test(OUT.join('\n')), 'brief reads the mod where it is', OUT.join('\n'));

fs.rmSync(X, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
