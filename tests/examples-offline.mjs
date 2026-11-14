#!/usr/bin/env node
// common/examples.mjs and the unit lookup (common/checkpoint.mjs): the samples apart from the person's own units, listed
// practical first, made one's own with their names replaced, and found by every tool (the own one wins a name both have).
//   node tests/examples-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = await import(pathToFileURL(path.join(TOP, 'common/examples.mjs')).href);
const C = await import(pathToFileURL(path.join(TOP, 'common/checkpoint.mjs')).href);
let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log(`ok   ${n}`); } catch (e) { fail++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

const top = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-examples-')), end = path.join(top, 'end');
put(path.join(end, 'examples', 'catalog.json'), JSON.stringify({ _: 'x', guard: { kind: 'practical', ja: '立入禁止区域' }, qrmap: { kind: 'showcase', ja: 'QR コード' } }));
put(path.join(end, 'examples', 'guard', 'pyproject.toml'), '[project]\nname = "endstone-guard"\n\n[project.entry-points."endstone"]\nguard = "endstone_guard:Guard"\n\n[tool.hatch.build.targets.wheel]\npackages = ["src/endstone_guard"]\n');
put(path.join(end, 'examples', 'guard', 'src', 'endstone_guard', '__init__.py'), 'from .plugin import Guard\n\n__all__ = ["Guard"]\n');
put(path.join(end, 'examples', 'guard', 'src', 'endstone_guard', 'plugin.py'), 'class Guard(Plugin):\n    prefix = "Guard"\n    commands = {"guard": {}}\n    GuardLike = 1\n');
put(path.join(end, 'examples', 'guard', 'tests.txt'), '## a\n@A cmd /guard 1 2 3 4\npy from endstone_guard.plugin import Guard\n');
put(path.join(end, 'examples', 'guard', 'TASK.md'), '# guard\n\nbody\n');
put(path.join(end, 'examples', 'guard', 'lab.mjs'), '// generated');
put(path.join(end, 'examples', 'qrmap', 'tests.txt'), '## a\n');
put(path.join(end, 'examples', 'zeta', 'tests.txt'), '## a\n');
fs.mkdirSync(path.join(end, 'plugins'), { recursive: true });

t('catalog: practical first, then showcase, then the uncatalogued (as showcase), by name; descriptions from catalog.json', () => {
  eq(E.catalog(end).map((x) => [x.name, x.kind, x.ja]), [['guard', 'practical', '立入禁止区域'], ['qrmap', 'showcase', 'QR コード'], ['zeta', 'showcase', '']]);
});
t('listLines: grouped, filtered by a word in the name or the description, the next steps said', () => {
  const all = E.listLines(E.catalog(end), { lab: 'end' }).join('\n');
  ok(/^実用/m.test(all) && /^ショーケース/m.test(all) && all.indexOf('guard') < all.indexOf('qrmap') && /new <名前> --from <見本>/.test(all), all);
  const q = E.listLines(E.catalog(end), { lab: 'end', word: 'QR' }).join('\n');
  ok(/qrmap/.test(q) && !/guard /.test(q), q);
  ok(/合う見本はありません/.test(E.listLines(E.catalog(end), { lab: 'end', word: 'nothing' })[0]));
});
t('renameText: an Endstone plugin\'s package, project, entry point and class; its commands and other words stay', () => {
  eq(E.renameText('end', 'x/plugin.py', 'class Guard(Plugin):\n    prefix = "Guard"\n    commands = {"guard": {}}\n    GuardLike = 1\n', 'guard', 'my_zone'), 'class MyZone(Plugin):\n    prefix = "MyZone"\n    commands = {"guard": {}}\n    GuardLike = 1\n');
  eq(E.renameText('end', 'pyproject.toml', 'name = "endstone-guard"\nguard = "endstone_guard:Guard"\npackages = ["src/endstone_guard"]\n', 'guard', 'my_zone'), 'name = "endstone-my-zone"\nmy_zone = "endstone_my_zone:MyZone"\npackages = ["src/endstone_my_zone"]\n');
  eq(JSON.parse(E.renameText('ll', 'manifest.json', JSON.stringify({ name: 'money', entry: 'money.js' }), 'money', 'coins')), { name: 'coins', entry: 'money.js' });
});
t('newFrom: copied into plugins/<name> renamed (not the lab\'s own files), TASK.md says where from, the unit chosen', () => {
  const said = [], used = [];
  const L = { F: { name: 'end' }, ROOT: end, TOP: top, ADDONS: path.join(end, 'plugins'), out: (l) => said.push(l), die: (m) => { throw new Error(m); }, useAddon: (n) => used.push(n) };
  E.newFrom(L, ['zone2', '--from', 'guard']);
  const d = path.join(end, 'plugins', 'zone2');
  ok(fs.existsSync(path.join(d, 'src', 'endstone_zone2', 'plugin.py')) && !fs.existsSync(path.join(d, 'src', 'endstone_guard')) && !fs.existsSync(path.join(d, 'lab.mjs')), 'renamed folder, no lab.mjs');
  ok(/class Zone2\(Plugin\)/.test(fs.readFileSync(path.join(d, 'src', 'endstone_zone2', 'plugin.py'), 'utf8')), 'class');
  ok(/from endstone_zone2\.plugin import Zone2/.test(fs.readFileSync(path.join(d, 'tests.txt'), 'utf8')) && /@A cmd \/guard/.test(fs.readFileSync(path.join(d, 'tests.txt'), 'utf8')), 'tests renamed, commands kept');
  ok(/見本 `guard` から作りました/.test(fs.readFileSync(path.join(d, 'TASK.md'), 'utf8')), 'TASK.md');
  eq(used, ['zone2']); ok(/^OK end\/plugins\/zone2\//.test(said[0]), said[0]);
  let err = ''; try { E.newFrom(L, ['zone2', '--from', 'guard']); } catch (e) { err = e.message; } ok(/exists/.test(err), 'twice: refused');
  err = ''; try { E.newFrom(L, ['z3', '--from', 'nope']); } catch (e) { err = e.message; } ok(/no sample "nope"/.test(err), err);
  err = ''; try { E.newFrom(L, ['Bad Name', '--from', 'guard']); } catch (e) { err = e.message; } ok(/usage/.test(err), err);
});
t('the unit lookup every tool shares: own and samples listed once; the own one wins a name both have', () => {
  put(path.join(end, 'plugins', 'qrmap', 'tests.txt'), '## mine\n');
  eq(C.unitsIn(top, 'end'), ['guard', 'qrmap', 'zeta', 'zone2']);
  eq([path.relative(top, C.unitDirIn(top, 'end', 'guard')), path.relative(top, C.unitDirIn(top, 'end', 'qrmap')), path.relative(top, C.unitDirIn(top, 'end', 'new'))].map((p) => p.split(path.sep).join('/')),
    ['end/examples/guard', 'end/plugins/qrmap', 'end/plugins/new']);
});
fs.rmSync(top, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
