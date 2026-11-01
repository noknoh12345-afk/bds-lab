// src/songtext.ts — the song text the add-on reads when a song is pasted in the game — for the converter page, as one classic
// script that leaves it in self.SpectralText (the same code: what the page writes is what the add-on decodes).
//   node web/build_text.mjs [out.js]        (default web/dist/songtext.js)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import url from 'url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const unit = path.dirname(here);
const req = createRequire(path.resolve(here, '../../../.lab/tool/node_modules') + '/');   // the lab's own esbuild
const esbuild = req('esbuild');
const out = process.argv[2] ?? path.join(here, 'dist', 'songtext.js');
const r = await esbuild.build({
  entryPoints: [path.join(unit, 'src', 'songtext.ts')], bundle: true, format: 'iife', globalName: 'SpectralText',
  platform: 'browser', target: 'es2020', write: false, logLevel: 'error',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
const text = r.outputFiles[0].text;
fs.writeFileSync(out, text);
console.log(path.relative(process.cwd(), out), Math.round(text.length / 1024), 'KB');
