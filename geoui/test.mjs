#!/usr/bin/env node
// GeoUI's checks, no game needed: every generator agrees with what is checked in (--check), then every offline test in tests/,
// side by side. `node test.mjs` (or `npm test`) from this folder; exit 1 when one fails. The same tests run in bds-lab's CI.
//   node test.mjs [--only <word>]   (only the tests and generators whose name has the word)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), top = path.resolve(here, '..');
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const { runTests, why } = await import(pathToFileURL(path.join(top, 'common', 'run-tests.mjs')).href);
// the generators (page.mjs has no --check: geoui-builder-offline holds measure.html to it): each writes nothing with --check and fails when an add-on or a built file is not what it makes
const GEN = [['build.mjs', '--check'], ['web/make.mjs', '--check'], ['web/probe.mjs', '--check'], ['timeline/probe.mjs', '--check'],
  ['timeline/demo.mjs', '--check'], ['html/convert.mjs', '--sample', '--check'], ['screen/rules.mjs', '--check'], ['screen/device.mjs', '--check']]
  .filter(([f]) => fs.existsSync(path.join(here, f)) && (!only || f.includes(only)));
let bad = 0;
for (const [f, ...args] of GEN) {
  const r = spawnSync(process.execPath, [path.join(here, f), ...args], { cwd: top, encoding: 'utf8' });
  const last = `${r.stdout}${r.stderr}`.trim().split('\n').at(-1) ?? '';
  if (r.status === 0) console.log(`✔ ${f} ${args.join(' ')}  ${last.slice(0, 100)}`);
  else { bad++; console.log(`✘ ${f} ${args.join(' ')}\n${`${r.stdout}${r.stderr}`.trim().split('\n').slice(-6).join('\n')}`); }
}
const list = fs.readdirSync(path.join(here, 'tests')).filter((f) => /-offline\.mjs$/.test(f) && (!only || f.includes(only))).sort().map((f) => `geoui/tests/${f}`);
const rs = await runTests(list, { cwd: top, onDone: (r) => console.log(`${r.ok ? '✔' : '✘'} ${r.t}  ${Math.round(r.ms / 1000)} s  ${r.ok ? r.lines.at(-1)?.slice(0, 80) ?? '' : why(r)}`) });
bad += rs.filter((r) => !r.ok).length;
console.log(bad ? `FAIL geoui: ${bad} of ${GEN.length + list.length}` : `PASS geoui: ${GEN.length} generators, ${list.length} tests`);
process.exit(bad ? 1 : 0);
