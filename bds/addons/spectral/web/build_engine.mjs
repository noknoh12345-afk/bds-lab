// The add-on's own bundle for the converter page: bp/scripts/main.js (what `node lab.mjs build` made and `go` tested) with
// @minecraft/server and @minecraft/server-ui replaced by the recording mock (tools/sim/mock-server.js, the one the
// experiments and the emulator use), as one classic script that leaves the mock in self.SpectralMock — the page runs it in
// a worker, a fresh one per song, so the add-on starts clean every time.
//   node web/build_engine.mjs [out.js]        (default web/dist/engine.js)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import url from 'url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const unit = path.dirname(here);
const req = createRequire(path.resolve(here, '../../../.lab/tool/node_modules') + '/');   // the lab's own esbuild
const esbuild = req('esbuild');
const out = process.argv[2] ?? path.join(here, 'dist', 'engine.js');
const mock = path.join(unit, 'tools', 'sim', 'mock-server.js'), mockUi = path.join(unit, 'tools', 'sim', 'mock-ui.js');
const r = await esbuild.build({
  stdin: { contents: `import * as mc from ${JSON.stringify(mock)};\nimport ${JSON.stringify(path.join(unit, 'bp', 'scripts', 'main.js'))};\nself.SpectralMock = mc;\n`,
    resolveDir: unit, sourcefile: 'engine-entry.js', loader: 'js' },
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020', write: false, logLevel: 'error',
  plugins: [{ name: 'mock', setup(b) {
    b.onResolve({ filter: /^@minecraft\/server$/ }, () => ({ path: mock }));
    b.onResolve({ filter: /^@minecraft\/server-ui$/ }, () => ({ path: mockUi }));
  } }],
});
fs.mkdirSync(path.dirname(out), { recursive: true });
const text = r.outputFiles[0].text;
fs.writeFileSync(out, text);
console.log(path.relative(process.cwd(), out), Math.round(text.length / 1024), 'KB');
