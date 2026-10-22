// nethernet-connect as a test runs it: compiled from this checkout's src/ and test/ (common/nethernet-connect/build.mjs
// --out) into a folder of this process's own, laid out like the package (dist/, web/, package.json), with bedrock-protocol
// installed once into a cache shared by every test (and every work tree) — the lab's own dist/ is never written, so a work
// tree stays as it was. The folder goes when the process ends.
//   import { ncBuilt } from './fake/nc.mjs'
//   const { nc, req, root, bp } = await ncBuilt()
//     nc   = <root>/dist/src/index.js (useBedrockProtocol(req) done)   req = a require that resolves bedrock-protocol
//     root = the package's copy (root/web is the dashboard's files)    bp  = the folder bedrock-protocol is installed in
//   import(path.join(root, 'dist/test/e2e-local.js')) … the package's own tests run from there too (NC_BEDROCK_PROTOCOL=bp)
// bedrock-protocol's folder: NC_BEDROCK_PROTOCOL when set, else $LAB_CACHE/nc (lan-offline's: common/lan.mjs ncLoad), else
// <tmp>/bds-lab-lan-test/nc. The compiler's: build.mjs's own (NC_BUILD_CACHE, $LAB_CACHE/nc-build, <tmp>/bds-lab-nc-build).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withLock } from './lock.mjs';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PKG = path.join(TOP, 'common', 'nethernet-connect');
const WIN = process.platform === 'win32';

/** the folder bedrock-protocol (nethernet-connect's dependencies) is installed in, installed when it is not there yet */
export async function bedrockProtocolDir() {
  const dir = process.env.NC_BEDROCK_PROTOCOL || path.join(process.env.LAB_CACHE || path.join(os.tmpdir(), 'bds-lab-lan-test'), 'nc');
  const there = () => fs.existsSync(path.join(dir, 'node_modules', 'bedrock-protocol', 'package.json'));
  if (there()) return dir;
  if (process.env.NC_BEDROCK_PROTOCOL) throw new Error(`NC_BEDROCK_PROTOCOL=${dir}: no node_modules/bedrock-protocol there`);
  await withLock('nc-npm', async () => {
    if (there()) return;
    fs.mkdirSync(dir, { recursive: true });
    const deps = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).dependencies;
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: deps }));
    // (--ignore-scripts: raknet-native's native build is optional — the lab's own RakNet client and jsp-raknet are used)
    const r = spawnSync(WIN ? 'npm.cmd' : 'npm', ['i', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, encoding: 'utf8', shell: WIN, env: { ...process.env, npm_config_allow_git: 'all' } });
    if (r.status !== 0) throw new Error(`npm install for nethernet-connect failed:\n${(r.stderr || r.stdout).slice(-800)}`);
  });
  return dir;
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
