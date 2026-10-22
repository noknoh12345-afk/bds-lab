// nethernet-connect as a test runs it: compiled from this checkout's src/ and test/ (common/nethernet-connect/build.mjs
// --out) into a folder of this process's own, laid out like the package (dist/, web/, package.json), with bedrock-protocol
// installed once into a cache shared by every test (and every work tree) — the lab's own dist/ is never written, so a work
// tree stays as it was. The folder goes when the process ends.
//   import { ncBuilt } from './fake/nc.mjs'
//   const { nc, req, root, bp } = await ncBuilt()
//     nc   = <root>/dist/src/index.js (useBedrockProtocol(req) done)   req = a require that resolves bedrock-protocol
//     root = the package's copy (root/web is the dashboard's files)    bp  = the folder bedrock-protocol is installed in
//   import(path.join(root, 'dist/test/e2e-local.js')) … the package's own tests run from there too (NC_BEDROCK_PROTOCOL=bp)
// bedrock-protocol's folder: NC_BEDROCK_PROTOCOL when set, else the lab's own (common/lan.mjs ncDeps: $LAB_CACHE/nc/deps-…,
// else <tmp>/bds-lab-lan-test/nc/deps-… — lan-offline's), the compiler build.mjs's (NC_BUILD_CACHE, $LAB_CACHE/nc-build,
// <tmp>/bds-lab-nc-build): both installed under a lock and counted once npm finished (common/nethernet-connect/install.mjs) —
// the tests side by side wait for one install instead of reading a half-written one
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PKG = path.join(TOP, 'common', 'nethernet-connect');

/** the folder bedrock-protocol (nethernet-connect's dependencies) is installed in, installed when it is not there yet */
export async function bedrockProtocolDir() {
  const dir = process.env.NC_BEDROCK_PROTOCOL;
  if (dir) {
    if (!fs.existsSync(path.join(dir, 'node_modules', 'bedrock-protocol', 'package.json'))) throw new Error(`NC_BEDROCK_PROTOCOL=${dir}: no node_modules/bedrock-protocol there`);
    return dir;
  }
  const { ncDeps } = await import(pathToFileURL(path.join(TOP, 'common', 'lan.mjs')).href);
  return ncDeps(process.env.LAB_CACHE || path.join(os.tmpdir(), 'bds-lab-lan-test'));
}

let built = null;
/** compile this checkout's nethernet-connect into a folder of its own and load it (once a process) */
export async function ncBuilt() {
  if (built) return built;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-test-'));
  process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* gone */ } });
  const r = spawnSync(process.execPath, [path.join(PKG, 'build.mjs'), '--out', path.join(root, 'dist'), '--quiet'], { encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(`nethernet-connect does not build:\n${(r.stdout + r.stderr).slice(-3000)}`);
  // (the package's layout around dist/: package.json — "type": "module" for the compiled ESM —, config.example.json, web/ for
  //  the dashboard: everything at its top but the sources, the build and what is installed)
  for (const e of fs.readdirSync(PKG, { withFileTypes: true })) {
    if (['src', 'test', 'dist', 'node_modules'].includes(e.name) || e.name.startsWith('.')) continue;
    fs.cpSync(path.join(PKG, e.name), path.join(root, e.name), { recursive: true });
  }
  const bp = await bedrockProtocolDir();
  const req = createRequire(path.join(bp, 'package.json'));
  process.env.NC_BEDROCK_PROTOCOL = bp;   // (the package's own tests, run from root/dist/test, find it the same way)
  const nc = await import(pathToFileURL(path.join(root, 'dist', 'src', 'index.js')).href);
  nc.useBedrockProtocol(req);
  built = { nc, req, root, bp };
  return built;
}
