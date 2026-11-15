// `node lab.mjs import <your BDS folder>` (common/serverimport.mjs): a server of the person's own taken in whole — the world's
// addons (a behavior pack with the resource pack it depends on, or that depends on it, as one unit; packs in the world's own
// folders, the development folders and the server's own), its Endstone plugins (plugins/*.whl); a pack already here (the same
// UUID) not taken twice; nothing in the server folder changed; --dry writes nothing. Proven whole on real servers: a server
// with a jelly copy, lamp and guard → `go all --lab bds,end --only …` 3/3 DONE.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import(pathToFileURL(path.join(TOP, 'common', 'serverimport.mjs')).href);
let pass = 0, fail = 0;
const ok = (c, what, detail = '') => { if (c) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}${detail ? `\n     ${String(detail).split('\n').join('\n     ')}` : ''}`); } };
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8')), wj = (f, j) => fs.writeFileSync(f, JSON.stringify(j, null, 2));

ok(['My Addon BP', 'MyAddon_RP', '§aShop [BP] v2', 'cool-pack behavior pack', 'BP', '123'].map(S.unitName).join() === 'my_addon,my_addon,shop_v2,cool_pack,addon_pack,addon_123',
  `a unit's name from a pack's folder: the BP / RP marks out, camel case split, a name the lab takes (${['My Addon BP', 'MyAddon_RP', '§aShop [BP] v2', 'cool-pack behavior pack', 'BP', '123'].map(S.unitName)})`);

// a server: a copy of jelly with UUIDs of its own (its BP depends on its RP), lamp as it is (a unit here already, in the
// development folder), a resource pack alone, a pack in the folder no list names, a wheel, a LeviLamina mod
const SRV = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-srv-')), W = path.join(SRV, 'worlds', 'MyWorld');
for (const d of ['behavior_packs', 'resource_packs']) fs.mkdirSync(path.join(W, d), { recursive: true });
fs.writeFileSync(path.join(SRV, 'server.properties'), 'server-name=x\nlevel-name=MyWorld\n'); fs.writeFileSync(path.join(SRV, 'bedrock_server'), '');
const cp = (from, to) => fs.cpSync(path.join(TOP, 'bds', 'addons', from), to, { recursive: true });
cp('jelly/bp', path.join(W, 'behavior_packs', 'Jelly Mod BP')); cp('jelly/rp', path.join(W, 'resource_packs', 'Jelly Mod RP'));
cp('lamp/bp', path.join(SRV, 'development_behavior_packs', 'LampAddon_BP'));
cp('coins/rp', path.join(W, 'resource_packs', 'Only Looks RP')); cp('shop/bp', path.join(W, 'behavior_packs', 'Not Listed BP'));
const fresh = (f) => { const m = rj(f); m.header.uuid = crypto.randomUUID(); for (const x of m.modules ?? []) x.uuid = crypto.randomUUID(); wj(f, m); return m; };
const r = fresh(path.join(W, 'resource_packs', 'Jelly Mod RP', 'manifest.json')), b = fresh(path.join(W, 'behavior_packs', 'Jelly Mod BP', 'manifest.json')), o = fresh(path.join(W, 'resource_packs', 'Only Looks RP', 'manifest.json'));
b.dependencies = [...(b.dependencies ?? []).filter((d) => d.module_name), { uuid: r.header.uuid, version: r.header.version }]; wj(path.join(W, 'behavior_packs', 'Jelly Mod BP', 'manifest.json'), b);
const lamp = rj(path.join(SRV, 'development_behavior_packs', 'LampAddon_BP', 'manifest.json'));
wj(path.join(W, 'world_behavior_packs.json'), [{ pack_id: b.header.uuid, version: b.header.version }, { pack_id: lamp.header.uuid, version: lamp.header.version }]);
wj(path.join(W, 'world_resource_packs.json'), [{ pack_id: r.header.uuid, version: r.header.version }, { pack_id: o.header.uuid, version: o.header.version }]);
fs.mkdirSync(path.join(SRV, 'plugins', 'SomeMod'), { recursive: true }); wj(path.join(SRV, 'plugins', 'SomeMod', 'manifest.json'), { name: 'SomeMod', entry: 'SomeMod.dll', type: 'native' });
fs.writeFileSync(path.join(SRV, 'plugins', 'endstone_warpx-1.0.0-py3-none-any.whl'), 'not read here');
// LeviLamina script mods: one LSE has already moved into its folder (with that server's data beside it), one LiteLoader-era file
fs.mkdirSync(path.join(SRV, 'plugins', 'Greeter'), { recursive: true });
wj(path.join(SRV, 'plugins', 'Greeter', 'manifest.json'), { name: 'Greeter', entry: 'Greeter.js', type: 'lse-quickjs', version: '1.0.0', dependencies: [{ name: 'legacy-script-engine-quickjs' }] });
fs.writeFileSync(path.join(SRV, 'plugins', 'Greeter', 'Greeter.js'), 'mc.listen("onJoin", (pl) => { pl.tell("Welcome to the server"); });\n');
wj(path.join(SRV, 'plugins', 'Greeter', 'seen.json'), { Steve: 3 });
fs.writeFileSync(path.join(SRV, 'plugins', 'OldOne.js'), 'll.registerPlugin("OldOne", "x", [0, 1, 0]);\nmc.listen("onChat", (pl, m) => true);\n');
fs.writeFileSync(path.join(SRV, 'plugins', 'helper.js'), 'module.exports = 1;\n');
// (every file's bytes, to say nothing in the server folder changed)
const snap = () => spawnSync('find', [SRV, '-type', 'f'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).sort().map((f) => `${f} ${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`).join('\n');
const before = snap();

ok(S.isServerFolder(SRV) && !S.isServerFolder(path.join(TOP, 'bds', 'addons')), 'a server folder: server.properties beside worlds/ or the server program');
const sc = S.scanServer(SRV);
const by = Object.fromEntries(sc.addons.map((a) => [a.name, a]));
ok(sc.level === 'MyWorld' && sc.addons.length === 3 && by.jelly_mod?.bp && by.jelly_mod?.rp && by.lamp_addon?.bp && !by.lamp_addon.rp && by.only_looks && !by.only_looks.bp && !by.not_listed,
  'the world\'s lists: jelly\'s BP with the RP it depends on as one, lamp from the development folder, a resource pack alone; a pack no list names left out', JSON.stringify(sc.addons.map((a) => [a.name, !!a.bp, !!a.rp])));
ok(sc.wheels.length === 1 && sc.mods.join() === 'SomeMod' && sc.lse.map((d) => path.basename(d)).join() === 'Greeter' && sc.legacy.map((f) => path.basename(f)).join() === 'OldOne.js', 'the Endstone wheel, the native LeviLamina mod, the LSE mod and the LiteLoader-era file found (not a plain helper .js)', JSON.stringify([sc.wheels, sc.mods, sc.lse, sc.legacy]));

const dry = spawnSync(process.execPath, [path.join(TOP, 'lab.mjs'), 'bds', 'import', SRV, '--dry'], { cwd: TOP, encoding: 'utf8', env: { ...process.env, LAB_DOTENV: 'off' } });
ok(dry.status === 0 && /\+ Jelly → bds\/addons\/jelly_mod \(bp \+ rp\)/.test(dry.stdout) && /= Lamp: already the unit lamp \(the same pack\)/.test(dry.stdout) && /SomeMod: a native LeviLamina mod/.test(dry.stdout) && /\+ plugins\/Greeter → ll\/mods\/greeter /.test(dry.stdout) && /\+ plugins\/OldOne\.js → ll\/mods\/old_one /.test(dry.stdout) && /^DRY would take/m.test(dry.stdout) && !fs.existsSync(path.join(TOP, 'bds', 'addons', 'jelly_mod')),
  '--dry: what it would take (lamp: already here, the same pack), nothing written', dry.stdout + dry.stderr);

// for real (the bds addons only: a wheel that is no wheel would fail the end import — that part is the end lab's own test)
const before2 = (fs.rmSync(path.join(SRV, 'plugins', 'endstone_warpx-1.0.0-py3-none-any.whl'), { force: true }), snap());
const hadLl = ['greeter', 'old_one'].filter((n) => fs.existsSync(path.join(TOP, 'll', 'mods', n)));
const run = spawnSync(process.execPath, [path.join(TOP, 'lab.mjs'), 'bds', 'import', SRV, '試す'], { cwd: TOP, encoding: 'utf8', env: { ...process.env, LAB_DOTENV: 'off', LAB_TYPES: '0' } });
const made = ['jelly_mod'].map((n) => path.join(TOP, 'bds', 'addons', n)).concat(['greeter', 'old_one'].filter((n) => !hadLl.includes(n)).map((n) => path.join(TOP, 'll', 'mods', n)));
try {
  const m = rj(path.join(made[0], 'bp', 'manifest.json'));
  ok(run.status === 0 && m.header.uuid === b.header.uuid && fs.existsSync(path.join(made[0], 'rp', 'manifest.json')) && fs.existsSync(path.join(made[0], 'tests.txt')) && /試す/.test(fs.readFileSync(path.join(made[0], 'TASK.md'), 'utf8'))
    && /Coins RP: a resource pack alone \(looks only\): not a unit/.test(run.stdout) && !fs.existsSync(path.join(TOP, 'bds', 'addons', 'only_looks')) && /next: node lab\.mjs go all --lab bds,ll --only jelly_mod,ll-greeter,ll-old_one,lamp/.test(run.stdout),
    'taken in: each addon a unit with its UUIDs, its packs, a draft tests.txt and the words; a resource pack alone said, not a unit; the next command names them all', run.stdout + run.stderr);
  const g = path.join(TOP, 'll', 'mods', 'greeter');
  ok(!hadLl.length && fs.existsSync(path.join(g, 'src', 'Greeter.js')) && rj(path.join(g, 'manifest.json')).name === 'Greeter' && !fs.existsSync(path.join(g, 'assets', 'seen.json')) && fs.existsSync(path.join(TOP, 'll', 'mods', 'old_one', 'src', 'OldOne.js'))
    && /next: node lab\.mjs go all --lab bds,ll --only jelly_mod,ll-greeter,ll-old_one,lamp/.test(run.stdout), 'the script mods taken in through ll import, code only (seen.json is that server\'s data: it stays), go all names them ll-…', run.stdout + run.stderr);
  ok(snap() === before2 && before.length > 0, 'nothing in the server folder changed (every file\'s bytes)');
  const again = spawnSync(process.execPath, [path.join(TOP, 'lab.mjs'), 'bds', 'import', SRV, '--dry'], { cwd: TOP, encoding: 'utf8', env: { ...process.env, LAB_DOTENV: 'off' } });
  ok(/already the unit jelly_mod/.test(again.stdout) && /DRY would take 0 in, 4 already here/.test(again.stdout), 'a second time: all already here, nothing taken twice', again.stdout);
} finally { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(SRV, { recursive: true, force: true }); }
console.log(fail ? `FAIL serverimport-offline (${pass}/${pass + fail})` : `PASS serverimport-offline (${pass}/${pass})`);
process.exit(fail ? 1 : 0);
