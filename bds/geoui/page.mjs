#!/usr/bin/env node
// The measuring page (measure.html): calib.mjs's own measuring code put into a single web page, so a screenshot taken on a
// phone is measured on the phone — nothing to install, nothing sent anywhere. Rebuild after changing calib.mjs:
//   node bds/geoui/page.mjs            → bds/geoui/measure.html (tests/geoui-builder-offline.mjs checks it is up to date)
//   node bds/geoui/page.mjs <out.html>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synth, degrade } from './calib.mjs';
import { encodePng } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** the browser half of calib.mjs: the markers and the measuring (no files, no Blockbench core) */
export function calibSource() {
  const src = fs.readFileSync(path.join(HERE, 'calib.mjs'), 'utf8');
  const a = src.indexOf('export const STEP'), b = src.indexOf('const round = (v, n = 4)');
  if (a < 0 || b < a) throw new Error('calib.mjs: the markers and the measuring section were not found');
  return src.slice(a, b).replace(/^export /gm, '');
}

/** the page's sample: a made-up screenshot with Studio's own phone numbers (height 176, centre fix -0.3 / -9.25 units) */
export function sample() {
  const img = degrade(synth({ h: 176, cx: -0.3, cy: -9.25, w: 2400, hpx: 1080, hud: true, dim: 0.8 }), { scale: 0.5, chroma: true });
  return `data:image/png;base64,${Buffer.from(encodePng(img)).toString('base64')}`;
}

export function build() {
  const tpl = fs.readFileSync(path.join(HERE, 'measure.tpl.html'), 'utf8');
  if (!tpl.includes('/*__CALIB__*/') || !tpl.includes("'__SAMPLE__'")) throw new Error('measure.tpl.html: placeholders missing');
  return tpl.replace('/*__CALIB__*/', () => calibSource()).replace("'__SAMPLE__'", () => `'${sample()}'`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = path.resolve(process.argv[2] || path.join(HERE, 'measure.html'));
  const html = build();
  fs.writeFileSync(out, html);
  console.log(`OK ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}
