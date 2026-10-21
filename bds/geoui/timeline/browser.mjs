/* global window */
// GeoUI timeline — the browser checks' shared part: Chromium through playwright-core (GEOUI_NODE_MODULES, CHROMIUM: as
// bds/geoui/blockbench-check.mjs), a blank page with the timeline's own files loaded, a fake store, and ok() lines.
// Not run by CI (no browser there): node bds/geoui/timeline/check-*.mjs on a machine that has one. Without one: SKIP.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOP = path.resolve(HERE, '..', '..', '..');

/** a fake store in the page (the plan's store), over the model's own reduce: dispatched intents kept in window.__log */
export const FAKE_STORE = `(() => {
  const M = GeoUITimeline.model;
  let doc = M.normalize(window.__doc), sel = { seq: (doc.sequences[0] || {}).id, clips: [], keys: [], instances: [], markers: [] }, time = 0, playing = false, rate = 1;
  const subs = new Set(), fire = () => subs.forEach((f) => f());
  window.__log = [];
  window.__store = {
    doc: () => doc,
    dispatch: (it) => { window.__log.push(it); const r = M.reduce(doc, it); if (r.ok) { doc = r.doc; fire(); } return r; },
    selection: () => sel, select: (s) => { sel = { ...sel, ...s }; window.__log.push({ select: s }); fire(); },
    time: () => time, seek: (t) => { time = t; fire(); }, subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    elements: () => window.__elements || [], media: () => window.__media || [],
    transport: { play() { playing = true; window.__log.push({ play: rate }); }, pause() { playing = false; window.__log.push({ pause: true }); }, toggle() { playing = !playing; window.__log.push({ toggle: playing }); },
      stop() { playing = false; time = 0; window.__log.push({ stop: true }); fire(); }, step() {}, rate(r) { rate = r; }, playing: () => playing },
  };
})();`;

/** run fn(page, ok) in Chromium with the given timeline files loaded (in order) and a document; prints PASS/FAIL, exits */
export async function withPage(name, files, doc, fn, { width = 1100, height = 500 } = {}) {
  const req = createRequire(path.join(process.env.GEOUI_NODE_MODULES || path.join(TOP, 'node_modules'), 'x.js'));
  let pw;
  try { pw = req('playwright-core'); } catch { console.log(`SKIP ${name}: playwright-core not found (GEOUI_NODE_MODULES=<a node_modules with it>)`); process.exit(0); }
  const exe = process.env.CHROMIUM;
  if (!exe || !fs.existsSync(exe)) { console.log(`SKIP ${name}: no Chromium (CHROMIUM=<binary>)`); process.exit(0); }
  let n = 0, fails = 0;
  const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${String(d).slice(0, 1500)}`}`); };
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setContent('<!doctype html><html><body style="margin:0;background:#111"><div id="host" style="width:1000px;height:320px"></div><div id="side" style="width:360px;height:480px"></div></body></html>');
    for (const f of files) await page.addScriptTag({ content: fs.readFileSync(path.join(HERE, f), 'utf8') });
    await page.evaluate((d) => { window.__doc = d; }, doc);
    await page.addScriptTag({ content: FAKE_STORE });
    await fn(page, ok);
    ok(!errors.length, 'no page errors', errors.join('\n'));
  } finally { await browser.close(); }
  console.log(`\n${fails ? 'FAIL' : 'PASS'} ${name} (${n - fails}/${n})`);
  process.exit(fails ? 1 : 0);
}
