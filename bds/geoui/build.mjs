#!/usr/bin/env node
// GeoUI Builder as one plugin file: the timeline's parts (bds/geoui/timeline/*.js) and GeoUI Builder itself
// (bds/geoui/geoui_builder.js) into bds/geoui/dist/geoui_builder.js — what Blockbench loads ("File → Plugins → Load Plugin from
// File"). Each part runs in a scope of its own where `module` is not the page's (Blockbench's desktop app has a `module` of its
// own: a part must not take it over); GeoUI Builder's own core still answers `require` in Node (tests, the lab's scripts).
//   node bds/geoui/build.mjs          write dist/geoui_builder.js
//   node bds/geoui/build.mjs --check  fail when dist/ is not what the sources make (tests and CI run this)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// (the order: what a part uses at load time comes before it — none does, but the bridge expects all of them at install)
export const PARTS = ['model', 'contract', 'media', 'osu', 'osugame', 'osukit', 'osusong', 'presets', 'view', 'timeline', 'curve', 'inspector', 'instances', 'pathedit', 'player', 'compile', 'runtime', 'store', 'bridge'];
export const OUT = path.join(HERE, 'dist', 'geoui_builder.js');

/** the bundle's text: a header, each part in its own scope, GeoUI Builder last (as it is: its core exported to Node) */
export function bundle() {
  const main = fs.readFileSync(path.join(HERE, 'geoui_builder.js'), 'utf8');
  const version = (/const VERSION = '([^']+)'/.exec(main) || [])[1] || '?';
  const parts = PARTS.map((name) => {
    const f = path.join(HERE, 'timeline', `${name}.js`);
    if (!fs.existsSync(f)) return '';
    const src = fs.readFileSync(f, 'utf8').replace(/\s+$/, '');
    return `// ---- timeline/${name}.js\n(function (module) {\n${src}\n})(undefined);\n`;
  }).filter(Boolean);
  const hash = crypto.createHash('sha256').update(parts.join('') + main).digest('hex').slice(0, 12);
  return `// GeoUI Builder ${version} with its timeline — one file for Blockbench (made by bds/geoui/build.mjs from bds/geoui/geoui_builder.js and
// bds/geoui/timeline/*.js: change those, then node bds/geoui/build.mjs). sources ${hash}
${parts.join('\n')}
// ---- geoui_builder.js
${main.replace(/\s+$/, '')}
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = bundle();
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (have !== text) { console.error(`${path.relative(process.cwd(), OUT)} is not what the sources make: node bds/geoui/build.mjs`); process.exit(1); }
    console.log(`OK ${path.relative(process.cwd(), OUT)} is up to date (${PARTS.length} timeline parts + geoui_builder.js)`);
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    console.log(`OK ${path.relative(process.cwd(), OUT)}: ${Math.round(text.length / 1024)} KB`);
  }
}
