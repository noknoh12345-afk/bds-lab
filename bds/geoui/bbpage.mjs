// The real Blockbench for GeoUI's checks (blockbench-check.mjs, timeline/check-bridge.mjs): its web build served from
// BLOCKBENCH_DIR, opened in a headless Chromium (playwright-core from GEOUI_NODE_MODULES; CHROMIUM or @sparticuz/chromium),
// WebGL by SwiftShader, the page's own errors collected (Blockbench's calls home left out). Without them: SKIP, exit 0.
/* global window */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOP = path.resolve(HERE, '..', '..');
/** the plugin file Blockbench loads: GeoUI Builder with its timeline (build.mjs's), else geoui_builder.js alone */
export const DIST = path.join(HERE, 'dist', 'geoui_builder.js');
export const pluginFile = () => (fs.existsSync(DIST) ? DIST : path.join(HERE, 'geoui_builder.js'));

/** Blockbench in Chromium: { page, ev(fn, arg), shot(file), errors, version, install(file) → { id, installed, version }, close() } */
export async function openBlockbench(name, { out, args = [], viewport = { width: 1600, height: 1000 } } = {}) {
  const BB = process.env.BLOCKBENCH_DIR, NM = process.env.GEOUI_NODE_MODULES;
  const skip = (why) => { console.log(`SKIP ${name}: ${why}`); process.exit(0); };
  if (!BB || !fs.existsSync(path.join(BB, 'dist', 'bundle.js'))) skip('set BLOCKBENCH_DIR to a Blockbench tree built with `npm run build-web` (see the top of bds/geoui/blockbench-check.mjs)');
  const req = createRequire(path.join(NM || path.join(TOP, 'node_modules'), 'x.js'));
  let pw, chromium;
  try { pw = req('playwright-core'); } catch { skip('playwright-core not found (GEOUI_NODE_MODULES=<a node_modules with playwright-core and @sparticuz/chromium>)'); }
  const exe = process.env.CHROMIUM || await (async () => { try { chromium = req('@sparticuz/chromium'); return await (chromium.default || chromium).executablePath(); } catch { return null; } })();
  if (!exe) skip('no Chromium (CHROMIUM=<binary> or @sparticuz/chromium in GEOUI_NODE_MODULES)');
  if (out) fs.mkdirSync(out, { recursive: true });
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(BB, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(path.resolve(BB)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const extraArgs = chromium ? (chromium.default || chromium).args.filter((a) => !/--single-process|--use-gl|--use-angle|--headless/.test(a)) : [];
  const browser = await pw.chromium.launch({ executablePath: exe, headless: true, args: [...extraArgs, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', ...args] });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // (Blockbench's own calls home — its stats at blckbn.ch — fail when served from here: CORS or no network. Not the plugin's)
  page.on('console', (m) => { if (m.type() === 'error' && !/bad HTTP response|Failed to load resource|blckbn\.ch/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { window.confirm = () => true; window.alert = () => {}; });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.Blockbench && window.Formats && window.Plugins, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  return {
    page, ev, errors,
    version: await ev(() => window.Blockbench.version),
    shot: async (file) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, file) }); },
    /** installed the way "File → Plugins → Load Plugin from File" does */
    install: (file = pluginFile()) => ev(async ({ content }) => { const p = new window.Plugin(); await p.loadFromFile({ path: 'geoui_builder.js', name: 'geoui_builder.js', content }, true); return { id: p.id, installed: p.installed, version: p.version }; }, { content: fs.readFileSync(file, 'utf8') }),
    close: async () => { await browser.close(); srv.close(); },
  };
}
