#!/usr/bin/env node
// A song as text to paste into the game (/spectral:paste): src/songtext.ts — the same code the add-on decodes with — compiled here
// on the fly (the lab's esbuild).
//   node tools/songtext.mjs <song.json> [--voices 24] [--grid qa,qp,qn] [--no-smooth] [--format 1 [--q 15]] [--max 5000] [--ascii]
//        [--seconds 2] [--id x] [--title t] [--out f.txt]
//        → the text (one part, or numbered parts a line each) on stdout or in --out, and its sizes on stderr. SPZ2 (the default): the
//        song on the grids GRID (src/songtext.ts: level 1.5 dB, pitch 10 cents, noise 1 dB), 15 bits a character; --format 1: SPZ1
//   node tools/songtext.mjs --decode <text file> [--song out.song.json]      the text back to a song (checks it)
//   node tools/songtext.mjs --check <song.json>...                             lossless round trips (every byte back) and sizes
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), unit = path.dirname(here);
export function load() {
  const esbuild = createRequire(path.resolve(unit, '../../.lab/tool/node_modules') + '/')('esbuild');
  const src = fs.readFileSync(path.join(unit, 'src', 'songtext.ts'), 'utf8');
  const js = esbuild.transformSync(src, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}
const T = load();
const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; }, flag = (k) => argv.includes(k);
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('songtext.mjs')) {
  if (flag('--check')) {
    let bad = 0;
    for (const f of argv.filter((a) => !a.startsWith('--'))) {
      const s = JSON.parse(fs.readFileSync(f, 'utf8')), raw = b64(s.data);
      const pay = T.encodeSong(s.meta, raw, { format: 1 }), back = T.decodeSong(pay);
      const same = back.bytes.length === raw.length && back.bytes.every((x, i) => x === raw[i]);
      const parts = T.toText(pay), whole = T.decodeSong(T.joinParts(parts.map((p) => T.readPart(p))));
      const ok = same && whole.bytes.length === raw.length && back.meta.frames === s.meta.frames && back.meta.voices === s.meta.voices;
      if (!ok) bad++;
      const p15 = T.encodeSong(s.meta, raw, { format: 1, q: 15, voices: 24 }), p2 = T.encodeSong(s.meta, raw, { voices: 24 });
      T.decodeSong(p15);
      const d2 = T.decodeSong(p2), d2b = T.decodeSong(T.joinParts(T.toText(p2).map((x) => T.readPart(x))));
      const ok2 = d2.bytes.length === d2b.bytes.length && d2.bytes.every((x, i) => x === d2b.bytes[i]) && d2.meta.frames === s.meta.frames;
      if (!ok2) bad++;
      console.log(`${ok && ok2 ? '✔' : '✘'} ${path.basename(f)}: ${raw.length} B → ${pay.length} B lossless (${(raw.length / pay.length).toFixed(2)}x, ${T.toText(pay).join('').length} chars in ${parts.length} part${parts.length > 1 ? 's' : ''}); 24 voices: SPZ1 3 cents ${T.toText(p15).join('').length} chars, SPZ2 ${T.toText(p2).join('').length} chars`);
    }
    process.exit(bad ? 1 : 0);
  } else if (flag('--decode')) {
    const lines = fs.readFileSync(opt('--decode'), 'utf8').split(/\n+/).filter((l) => l.trim());
    const got = T.decodeSong(T.joinParts(lines.map((l) => T.readPart(l))));
    console.error(`✔ ${got.meta.title} (${got.meta.id}): ${got.meta.seconds} s, ${got.meta.voices} voices, ${got.bytes.length} bytes`);
    if (opt('--song')) fs.writeFileSync(opt('--song'), JSON.stringify({ meta: got.meta, data: Buffer.from(got.bytes).toString('base64') }));
  } else {
    const f = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
    if (!f) { console.error('usage: node tools/songtext.mjs <song.json> [--voices 24] [--q 15] [--max 5000] [--ascii] [--seconds s] [--out f.txt] | --decode <txt> | --check <song.json>...'); process.exit(2); }
    const s = JSON.parse(fs.readFileSync(f, 'utf8')), raw = b64(s.data);
    const sec = opt('--seconds');
    const g = opt('--grid')?.split(',').map(Number);
    const pay = T.encodeSong(s.meta, raw, { voices: Number(opt('--voices', 24)), format: Number(opt('--format', 2)), q: Number(opt('--q', 15)),
      grid: g ? { qa: g[0], qp: g[1], qn: g[2] } : undefined, smooth: !flag('--no-smooth'),
      frames: sec ? Math.round(Number(sec) * (s.meta.fps || 20)) : undefined, id: opt('--id'), title: opt('--title') });
    const parts = T.toText(pay, { maxChars: Number(opt('--max', T.FIELD_CHARS)), ascii: flag('--ascii') });
    const text = parts.join('\n') + '\n';
    if (opt('--out')) fs.writeFileSync(opt('--out'), text); else process.stdout.write(text);
    console.error(`${s.meta.title}: ${raw.length} B → ${pay.length} B, ${parts.length} part${parts.length > 1 ? 's' : ''} of ${parts.map((p) => p.length).join(' / ')} characters`);
  }
}
