#!/usr/bin/env node
// GeoUI's own entry, from this folder: `node lab.mjs <cmd> -a <geoui_addon>` = the bds lab's (GeoUI's addons run on it: `go`,
// `test`, `run`, `sim` … as ../bds/AGENTS.md says); `node lab.mjs go all` = every GeoUI addon on real servers, side by side.
// GeoUI's own offline tests and generators: `node test.mjs` (README.md).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), top = path.resolve(here, '..');
const a = process.argv.slice(2);
if (a[0] === 'go' && a[1] === 'all') { if (!a.includes('--lab')) process.argv.push('--lab', 'geoui'); }
else if (a[0] !== 'bds') process.argv.splice(2, 0, 'bds');
process.chdir(top);
await import(pathToFileURL(path.join(top, 'lab.mjs')).href);
