// The management panel as one file for GitHub Pages (common/panel-config.mjs buildPages, pages.yml): panel.js and every module
// it imports bundled and minified by esbuild into panel.js, what it loads only later (the artifact viewer: import()) in its own
// file under chunks/, the stylesheets minified. The page then asks for 1 script instead of ~90 modules one after another
// (measured on the real Pages: 96 requests and 2.4 s to the first card on a fast line, 8.3 s on a slow one). panel/ stays the
// source the tests, the API (auth/api.mjs) and the Worker read; only the copy that is served is bundled.
//   - what the page may do does not change: one script of its own ('self' in the CSP), no eval, no inline code
//   - sw.js is left as it is (a classic worker): it finds the chunks by reading panel.js's import() like any module's
//   - lib/ and ui/ are left out of the copy: nothing asks for them any more (a source map beside each file names them)
//   - esbuild: the repository's, else a global one (pages.yml: npm i -g esbuild@0.28); none → { bundled: false, why }
//     and the copy stays as it was (the panel works unbundled, only slower)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ESBUILD = '0.28';
// (the oldest browsers the panel is for: what Safari on an iPhone of a few years ago and the Chromes of phones run)
export const TARGET = ['es2022', 'chrome110', 'safari16', 'firefox115'];

/** esbuild as this machine has it → the module, or null */
export function findEsbuild() {
  const tries = [path.join(TOP, 'package.json')];
  const g = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (g.status === 0 && g.stdout.trim()) tries.push(path.join(g.stdout.trim(), 'noop.js'));
  for (const t of tries) { try { return createRequire(t)('esbuild'); } catch { /* not there */ } }
  return null;
}

/** the panel in <out> (a copy of panel/ already there) bundled in place → { bundled, why?, files?, bytes? } */
export async function bundlePanel(out, { esbuild = findEsbuild(), sourcemap = true } = {}) {
  if (!esbuild) return { bundled: false, why: 'esbuild がありません（npm i -g esbuild@' + ESBUILD + '）' };
  const tmp = fs.mkdtempSync(path.join(path.dirname(path.resolve(out)), '.panel-bundle-'));
  try {
    const r = await esbuild.build({
      entryPoints: { panel: path.join(out, 'panel.js') }, outdir: tmp, bundle: true, splitting: true, format: 'esm', minify: true,
      target: TARGET, sourcemap: sourcemap ? 'linked' : false, sourcesContent: false, chunkNames: 'chunks/[name]-[hash]', entryNames: '[name]',
      outExtension: { '.js': '.js' }, legalComments: 'none', charset: 'utf8', logLevel: 'silent', metafile: true, write: true,
      // (sw.js is a classic script on its own, never imported)
      external: ['./sw.js'],
    });
    if (r.errors.length) throw new Error(r.errors.map((e) => e.text).join('\n'));
    for (const css of ['styles.css', 'panel.css', 'a11y.css']) {
      const f = path.join(out, css);
      if (!fs.existsSync(f)) continue;
      // (url(icon.svg) and the data: pictures stay as they are written: nothing is fetched or inlined)
      const c = await esbuild.transform(fs.readFileSync(f, 'utf8'), { loader: 'css', minify: true, target: TARGET.filter((t) => !t.startsWith('es')), legalComments: 'none', charset: 'utf8' });
      fs.writeFileSync(path.join(tmp, css), c.code);
    }
    // (the sources no longer served; then what esbuild wrote, over them)
    for (const d of ['lib', 'ui']) fs.rmSync(path.join(out, d), { recursive: true, force: true });
    fs.rmSync(path.join(out, 'panel.js'));
    fs.cpSync(tmp, out, { recursive: true });
    // (the files panel.js imports before it runs — every one of them, as deep as it goes — asked for at once beside it: without
    //  this the browser learns of them only once panel.js has come, one round trip later)
    const rel = (f) => path.relative(tmp, path.resolve(f)).replace(/\\/g, '/');
    const outs = Object.fromEntries(Object.entries(r.metafile.outputs).map(([k, v]) => [rel(k), v])), pre = new Set();
    (function walk(f) { for (const i of outs[f]?.imports ?? []) if (i.kind === 'import-statement' && !pre.has(rel(i.path))) { pre.add(rel(i.path)); walk(rel(i.path)); } })('panel.js');
    const html = path.join(out, 'index.html'), page = fs.readFileSync(html, 'utf8'), tag = '<script type="module" src="panel.js"></script>';
    if (!page.includes(tag)) throw new Error(`index.html に「${tag}」がありません`);
    fs.writeFileSync(html, page.replace(tag, [...pre].sort().map((f) => `<link rel="modulepreload" href="${f}">\n`).join('') + tag));
    const files = Object.keys(r.metafile.outputs).map((f) => path.relative(tmp, path.resolve(f)).replace(/\\/g, '/')).filter((f) => !f.endsWith('.map'));
    return { bundled: true, files, preload: [...pre].sort(), bytes: files.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
