// esbuild a src/ entry into one bundle for the mock (experiments only; `node lab.mjs go` builds the real one)
import { createRequire } from 'module';
import path from 'path';
import url from 'url';
// (the lab's own esbuild: bds/.lab/tool/node_modules, installed by `node lab.mjs check`)
const here = path.dirname(url.fileURLToPath(import.meta.url));
const req = createRequire(path.resolve(here, '../../../../.lab/tool/node_modules') + '/');
const esbuild = req('esbuild');
// node tools/exp/build_exp.mjs <src/main.ts> <out.js>  — one bundle for the mock (tools/sim/run_song.mjs --bundle)
const [entry, out] = process.argv.slice(2);
const r = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', target: 'es2023', outfile: out,
  external: ['@minecraft/server', '@minecraft/server-ui', '@minecraft/server-net', '@minecraft/server-admin', '@minecraft/server-gametest', '@minecraft/debug-utilities'],
  mainFields: ['module', 'main'], logLevel: 'error', define: { LAB_FEATURES_OFF: '[]' } });
console.log(out, r.errors.length ? r.errors : 'ok');
