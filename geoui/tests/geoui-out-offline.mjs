#!/usr/bin/env node
// geoui/web/out.mjs: a made unit kept by the lab's maintenance (upkeep) is still the unit its maker makes — the newer
// stable @minecraft/server it proved and the TASK.md notes carried, a JSON file compared by what it says; never a beta made
// stable, never an older version brought back.
//   node geoui/tests/geoui-out-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const O = await import(pathToFileURL(path.join(TOP, 'geoui/web/out.mjs')).href);
let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log(`ok   ${n}`); } catch (e) { fail++; console.log(`FAIL ${n}\n     ${e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const mf = (v) => JSON.stringify({ format_version: 2, dependencies: [{ module_name: '@minecraft/server', version: v }] }, null, 2) + '\n';
const dirWith = (manifest, task) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'geoui-out-')); fs.mkdirSync(path.join(d, 'bp')); if (manifest) fs.writeFileSync(path.join(d, 'bp/manifest.json'), manifest); if (task) fs.writeFileSync(path.join(d, 'TASK.md'), task); return d; };
const dep = (files) => JSON.parse(files['bp/manifest.json']).dependencies[0].version;
const NOTES = '# T\n\nbody\n\n## Maintenance\n- 2026-10-30 BDS 1.26.61.1: moved to stable APIs\n';

t('a newer stable version the maintenance set is kept; the notes are carried', () => {
  const d = dirWith(JSON.stringify({ format_version: 2, dependencies: [{ module_name: '@minecraft/server', version: '2.11.0' }] }), NOTES);
  const out = O.carryMaintenance(d, { 'bp/manifest.json': mf('2.5.0'), 'TASK.md': '# T\n\nbody\n' });
  eq(dep(out), '2.11.0');
  eq(out['TASK.md'], NOTES);
});
t('never: an older version back, a beta made stable, a stable made beta; no unit yet: as made', () => {
  eq(dep(O.carryMaintenance(dirWith(mf('2.4.0')), { 'bp/manifest.json': mf('2.5.0') })), '2.5.0', 'older');
  eq(dep(O.carryMaintenance(dirWith(mf('2.11.0')), { 'bp/manifest.json': mf('2.12.0-beta') })), '2.12.0-beta', 'made for beta');
  eq(dep(O.carryMaintenance(dirWith(mf('2.12.0-beta')), { 'bp/manifest.json': mf('2.5.0') })), '2.5.0', 'a beta there');
  eq(dep(O.carryMaintenance(dirWith(null), { 'bp/manifest.json': mf('2.5.0') })), '2.5.0', 'none');
  eq(O.carryMaintenance(dirWith(null, NOTES), { 'TASK.md': '# T\n\n## Maintenance\n- mine\n' })['TASK.md'], '# T\n\n## Maintenance\n- mine\n', 'its own notes: not doubled');
});
t('check: a JSON file the maintenance laid out its own way passes; a real difference does not', () => {
  const d = dirWith('{"format_version":2,"dependencies":[{"module_name":"@minecraft/server","version":"2.11.0"}]}', NOTES);
  eq(O.writeUnit(d, { 'bp/manifest.json': mf('2.5.0'), 'TASK.md': '# T\n\nbody\n' }, { check: true }), { ok: true, bad: [] });
  eq(O.writeUnit(d, { 'bp/manifest.json': JSON.stringify({ format_version: 3, dependencies: [{ module_name: '@minecraft/server', version: '2.5.0' }] }), 'TASK.md': '# T\n\nbody\n' }, { check: true }).bad, ['bp/manifest.json']);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
