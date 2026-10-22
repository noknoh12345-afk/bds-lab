#!/usr/bin/env node
// Compiles src/ and test/ (TypeScript) to dist/ — what the lab runs (common/lan.mjs loads dist/src/index.js) and keeps in git.
//   node build.mjs           type-check, then write dist/ (only what changed; files no longer made are removed)
//   node build.mjs --check   type-check, and fail when dist/ is not what src/ and test/ make now (CI: tests/nc-offline.mjs)
// The compiler is pinned (devDependencies: typescript, @types/node) and installed once into a cache of its own — never next to
// this file: NC_BUILD_CACHE, else $LAB_CACHE/nc-build, else <tmp>/bds-lab-nc-build. The output is the same on every machine
// (LF line ends, no source maps, no time stamps), so --check compares bytes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
const WANT = ['typescript', '@types/node'].map((n) => `${n}@${PKG.devDependencies[n]}`);
const CACHE = process.env.NC_BUILD_CACHE || (process.env.LAB_CACHE ? path.join(process.env.LAB_CACHE, 'nc-build') : path.join(os.tmpdir(), 'bds-lab-nc-build'));
const check = process.argv.includes('--check');
const quiet = process.argv.includes('--quiet');
const say = (s) => { if (!quiet) console.log(s); };

function compiler() {
  const stamp = path.join(CACHE, 'stamp'), req = createRequire(path.join(CACHE, 'package.json'));
  const there = () => { try { req.resolve('typescript'); req.resolve('@types/node/package.json'); return true; } catch { return false; } };
  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== WANT.join(' ') || !there()) {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(path.join(CACHE, 'package.json'), '{"private":true}\n');
    const win = process.platform === 'win32';
    const r = spawnSync(win ? 'npm.cmd' : 'npm', ['i', ...WANT, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: CACHE, encoding: 'utf8', shell: win });
    if (r.status !== 0) throw new Error(`npm i ${WANT.join(' ')} failed:\n${(r.stderr || r.stdout).slice(-800)}`);
    fs.writeFileSync(stamp, WANT.join(' '));
  }
  return { ts: req('typescript'), types: path.join(CACHE, 'node_modules', '@types') };
}

const files = (dir) => fs.readdirSync(path.join(HERE, dir)).filter((f) => f.endsWith('.ts')).sort().map((f) => path.join(HERE, dir, f));

function emit() {
  const { ts, types } = compiler();
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

const listDist = (dir = path.join(HERE, 'dist'), base = '') => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listDist(path.join(dir, e.name), base + e.name + '/') : [base + e.name])) : []);

try {
  const { out, version } = emit();
  const now = new Set(listDist());
  const changed = [...out].filter(([f, t]) => !now.has(f) || fs.readFileSync(path.join(HERE, 'dist', f), 'utf8') !== t).map(([f]) => f);
  const stale = [...now].filter((f) => !out.has(f));
  if (check) {
    if (changed.length || stale.length) {
      console.log(`✘ dist/ is not what src/ and test/ make now (node common/nethernet-connect/build.mjs writes it):${changed.map((f) => '\n  changed ' + f).join('')}${stale.map((f) => '\n  not made any more ' + f).join('')}`);
      process.exit(1);
    }
    say(`✔ dist/ is current (${out.size} files, TypeScript ${version}, no type errors)`);
  } else {
    for (const f of changed) { fs.mkdirSync(path.dirname(path.join(HERE, 'dist', f)), { recursive: true }); fs.writeFileSync(path.join(HERE, 'dist', f), out.get(f)); }
    for (const f of stale) fs.rmSync(path.join(HERE, 'dist', f));
    say(`dist/: ${changed.length} written, ${stale.length} removed, ${out.size - changed.length} unchanged (TypeScript ${version})`);
  }
} catch (e) {
  console.log('✘ ' + e.message);
  process.exit(1);
}
