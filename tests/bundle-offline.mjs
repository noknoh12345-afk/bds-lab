// The panel as pages.yml serves it, bundled (common/panel-bundle.mjs, panel-config.mjs buildPagesBundled): one script and its
// chunks, each tab panel.js reads later (later()) and the viewer in a chunk of its own, the files it imports before it runs
// asked for at once (modulepreload), the page's policy unchanged and nothing in the code it forbids, the sources left out,
// panel/ itself untouched; and without esbuild: the copy served as it is, said. The bundle opened in the browser:
// tests/panel-browser.mjs (PANEL_BROWSER_SERVE=bundle: every tab). node tests/bundle-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(TOP, p)).href);
const PC = await imp('common/panel-config.mjs'), PB = await imp('common/panel-bundle.mjs');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { if ((await fn()) === 'skip') { skipped++; console.log(`skip ${name}`); return; } pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-offline-'));
const ES = PB.findEsbuild();
const sum = (d) => { const h = crypto.createHash('sha256'); for (const f of fs.readdirSync(d, { recursive: true }).sort()) { const p = path.join(d, String(f)); if (fs.statSync(p).isFile()) h.update(String(f)).update(fs.readFileSync(p)); } return h.digest('hex'); };
const before = sum(path.join(TOP, 'panel'));
const src = fs.readFileSync(path.join(TOP, 'panel', 'panel.js'), 'utf8');
// (the tabs panel.js reads later, from its own words: const xTab = later(() => import('./ui/x.mjs'), 'xTab'))
const LATER = [...src.matchAll(/later\(\(\) => import\('\.\/ui\/([a-z]+)\.mjs'\), '([A-Za-z]+)'\)/g)].map((m) => m[1]);

await t('panel.js: the tabs few open first read later (each its own import()), the rest of the page as it was', () => {
  ok(LATER.length >= 7 && ['connect', 'members', 'stats', 'schedule', 'units', 'releases', 'audit'].every((x) => LATER.includes(x)), `later tabs: ${LATER}`);
  for (const x of LATER) ok(!new RegExp(`^import [^;]*from '\\./ui/${x}\\.mjs'`, 'm').test(src), `ui/${x}.mjs is not imported at the top as well (it would be in panel.js itself)`);
  ok(/readLater\(\);\n\}/.test(src), 'render() reads the later tabs in the background once a lab is drawn');
});

const out = path.join(tmp, 'site');
const r = await PC.buildPagesBundled(out, { LAB_AUTH_URL: 'https://auth.example.com', GITHUB_SHA: 'cd'.repeat(20) });
await t('bundled: panel.js, a chunk for the viewer and for each later tab, minified; the sources (lib/, ui/) not served', () => {
  if (!ES) return 'skip';
  ok(r.bundle.bundled, r.bundle.why);
  ok(!fs.existsSync(path.join(out, 'lib')) && !fs.existsSync(path.join(out, 'ui')), 'lib/ and ui/ left out');
  const chunks = fs.readdirSync(path.join(out, 'chunks'));
  for (const x of ['viewer', ...LATER]) ok(chunks.some((f) => f.startsWith(`${x}-`) && f.endsWith('.js')), `a chunk for ${x}: ${chunks}`);
  const js = fs.readFileSync(path.join(out, 'panel.js'), 'utf8');
  // (minified: the sources' comments gone — only the source map's line is left — and far fewer lines than the sources)
  ok(!/^\s*\/\/ \(/m.test(js) && js.split('\n').length * 5 < src.split('\n').length && /\/\/# sourceMappingURL=panel\.js\.map\s*$/.test(js), `minified (${js.length} bytes, ${js.split('\n').length} lines)`);
  for (const x of LATER) ok(new RegExp(`import\\("\\./chunks/${x}-[A-Z0-9]+\\.js"\\)`).test(js), `panel.js reads ${x} later by import() of its chunk`);
  ok(r.bundle.files.every((f) => fs.existsSync(path.join(out, f))) && r.bundle.bytes > 100_000, 'every file it names is there');
});
await t('the files panel.js imports before it runs are asked for at once (modulepreload, every one, as deep as it goes); none of the later ones', () => {
  if (!ES) return 'skip';
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8'), pre = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
  const need = new Set();
  (function walk(f) { for (const m of fs.readFileSync(path.join(out, f), 'utf8').matchAll(/(?:^|[;}])\s*import\s*[^("']*?from\s*"\.\/([^"]+)"/g)) { const g = path.posix.join(path.posix.dirname(f), m[1]); if (!need.has(g)) { need.add(g); walk(g); } } })('panel.js');
  ok(need.size > 0 && [...need].every((f) => pre.includes(f)) && pre.every((f) => need.has(f)), `preloaded ${pre} / imported ${[...need]}`);
  ok(!pre.some((f) => /\/(viewer|connect|members|stats|schedule|units|releases|audit)-/.test(f)), 'the later chunks are not preloaded');
  ok(html.indexOf('modulepreload') < html.indexOf('<script type="module" src="panel.js">'), 'before the script');
});
await t('what the page may do is unchanged: the same CSP (the service let in), no eval or new Function, no inline script; sw.js as it is', () => {
  if (!ES) return 'skip';
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8'), csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  ok(csp.includes("script-src 'self';") && !/unsafe-(eval|inline)/.test(csp) && csp.includes('https://auth.example.com'), csp);
  ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'no inline script');
  for (const f of ['panel.js', ...fs.readdirSync(path.join(out, 'chunks')).filter((x) => x.endsWith('.js')).map((x) => `chunks/${x}`)]) {
    const js = fs.readFileSync(path.join(out, f), 'utf8');
    ok(!/\beval\(|new Function\(/.test(js), `${f}: no eval / new Function`);
  }
  ok(fs.readFileSync(path.join(out, 'sw.js'), 'utf8') === fs.readFileSync(path.join(TOP, 'panel', 'sw.js'), 'utf8'), 'sw.js untouched');
  ok(JSON.parse(fs.readFileSync(path.join(out, 'config.json'), 'utf8')).version === 'cd'.repeat(20), 'config.json as before');
});
await t('the stylesheets minified, their rules kept (url(icon.svg), the .later place, the dark colours)', () => {
  if (!ES) return 'skip';
  const css = fs.readFileSync(path.join(out, 'panel.css'), 'utf8');
  ok(css.length < fs.readFileSync(path.join(TOP, 'panel', 'panel.css'), 'utf8').length && /url\(icon\.svg\)/.test(css) && /\.later\{display:contents\}/.test(css) && /prefers-color-scheme:\s*dark/.test(css), 'kept');
});
await t('no esbuild: the copy served as it is (one module per file), the reason given', async () => {
  const o2 = path.join(tmp, 'plain');
  const r2 = await PC.buildPagesBundled(o2, {}, path.join(TOP, 'panel'), { esbuild: null });
  ok(!r2.bundle.bundled && /esbuild/.test(r2.bundle.why), JSON.stringify(r2.bundle));
  ok(fs.existsSync(path.join(o2, 'lib', 'model.mjs')) && fs.readFileSync(path.join(o2, 'panel.js'), 'utf8') === src && !/modulepreload/.test(fs.readFileSync(path.join(o2, 'index.html'), 'utf8')), 'the copy as it is');
});
await t('panel/ itself untouched by the build', () => ok(sum(path.join(TOP, 'panel')) === before, 'panel/ changed'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped (no esbuild: npm i -g esbuild@${PB.ESBUILD})` : ''}`);
process.exit(fail ? 1 : 0);
