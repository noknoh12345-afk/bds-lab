#!/usr/bin/env node
// Compiles src/ and test/ (TypeScript) to dist/ — what the lab runs (common/lan.mjs loads dist/src/index.js) and keeps in git.
//   node build.mjs           type-check, then write dist/ (only what changed; files no longer made are removed)
//   node build.mjs --check   type-check, and fail when dist/ is not what src/ and test/ make now (CI: tests/nc-offline.mjs)
//   node build.mjs --out <dir>   type-check, then write the same tree into <dir> instead of dist/ (a test's own copy:
//                            tests/fake/nc.mjs — dist/ in the lab is left as it is)
// The compiler is pinned (devDependencies: typescript, @types/node) and installed once into a cache of its own — never next to
// this file: NC_BUILD_CACHE, else $LAB_CACHE/nc-build, else <tmp>/bds-lab-nc-build (install.mjs: a folder per version, under a
// lock, so builds side by side wait for one install instead of reading a half-written compiler). The output is the same on
// every machine (LF line ends, no source maps, no time stamps), so --check compares bytes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installOnce } from './install.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
const CACHE = process.env.NC_BUILD_CACHE || (process.env.LAB_CACHE ? path.join(process.env.LAB_CACHE, 'nc-build') : path.join(os.tmpdir(), 'bds-lab-nc-build'));
const check = process.argv.includes('--check');
const quiet = process.argv.includes('--quiet');
const outAt = process.argv.indexOf('--out'), OUT = outAt > 0 ? process.argv[outAt + 1] : null;
if (outAt > 0 && (!OUT || OUT.startsWith('--'))) { console.log('✘ --out <dir>: the folder is missing'); process.exit(1); }
if (OUT && check) { console.log('✘ --out and --check: one or the other (--check compares dist/ itself)'); process.exit(1); }
const DIST = OUT ? path.resolve(OUT) : path.join(HERE, 'dist');
const say = (s) => { if (!quiet) console.log(s); };

async function compiler() {
  const dir = await installOnce(CACHE, { typescript: PKG.devDependencies.typescript, '@types/node': PKG.devDependencies['@types/node'] });
  // (the layout before install.mjs: the compiler straight in the cache, with a stamp — not used any more)
  if (fs.existsSync(path.join(CACHE, 'stamp'))) for (const f of ['node_modules', 'package.json', 'package-lock.json', 'stamp']) fs.rmSync(path.join(CACHE, f), { recursive: true, force: true });
  return { ts: createRequire(path.join(dir, 'package.json'))('typescript'), types: path.join(dir, 'node_modules', '@types') };
}

const files = (dir) => fs.readdirSync(path.join(HERE, dir)).filter((f) => f.endsWith('.ts')).sort().map((f) => path.join(HERE, dir, f));

async function emit() {
  const { ts, types } = await compiler();
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true, resolveJsonModule: true,
    declaration: false, sourceMap: false, newLine: ts.NewLineKind.LineFeed, rootDir: HERE, outDir: path.join(HERE, 'dist'),
    typeRoots: [types], types: ['node'], noEmitOnError: true,
  };
  const program = ts.createProgram([...files('src'), ...files('test')], options);
  const out = new Map();   // dist-relative path → text
  const diags = [...ts.getPreEmitDiagnostics(program)];
  if (!diags.length) {
    const r = program.emit(undefined, (f, text) => { out.set(path.relative(path.join(HERE, 'dist'), f).split(path.sep).join('/'), text); });
    diags.push(...r.diagnostics);
  }
  if (diags.length) {
    const host = { getCanonicalFileName: (f) => f, getCurrentDirectory: () => HERE, getNewLine: () => '\n' };
    throw new Error(`TypeScript ${ts.version}:\n${ts.formatDiagnostics(diags, host)}`);
  }
  return { out, version: ts.version };
}

const listDist = (dir = DIST, base = '') => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listDist(path.join(dir, e.name), base + e.name + '/') : [base + e.name])) : []);

try {
  const { out, version } = await emit();
  const now = new Set(listDist());
  const changed = [...out].filter(([f, t]) => !now.has(f) || fs.readFileSync(path.join(DIST, f), 'utf8') !== t).map(([f]) => f);
  const stale = [...now].filter((f) => !out.has(f));
  if (check) {
    if (changed.length || stale.length) {
      console.log(`✘ dist/ is not what src/ and test/ make now (node common/nethernet-connect/build.mjs writes it):${changed.map((f) => '\n  changed ' + f).join('')}${stale.map((f) => '\n  not made any more ' + f).join('')}`);
      process.exit(1);
    }
    say(`✔ dist/ is current (${out.size} files, TypeScript ${version}, no type errors)`);
  } else {
    for (const f of changed) { fs.mkdirSync(path.dirname(path.join(DIST, f)), { recursive: true }); fs.writeFileSync(path.join(DIST, f), out.get(f)); }
    for (const f of stale) fs.rmSync(path.join(DIST, f));
    say(`${OUT ? DIST : 'dist'}/: ${changed.length} written, ${stale.length} removed, ${out.size - changed.length} unchanged (TypeScript ${version})`);
  }
} catch (e) {
  console.log('✘ ' + e.message);
  process.exit(1);
}
