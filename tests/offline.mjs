#!/usr/bin/env node
// Offline end-to-end tests of the three labs against fake servers (tests/fake): no network, no Minecraft.
// What they prove: flavor loading, unit discovery, scaffolds, checks, per-instance deploy, launch, log normalisation, the
// helper plugins (Endstone Python / LSE JS) and their commands, test runner + coverage, live reload, packaging.
// What they cannot prove: real Endstone / LeviLamina / BDS behaviour and real players (CI runs those: .github/workflows).
//   node tests/offline.mjs [bds|end|ll ...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE = path.join(TOP, 'tests', 'fake');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'bdslab-offline-'));
const REPO = path.join(T, 'repo');
for (const d of ['common', 'bds']) fs.cpSync(path.join(TOP, d), path.join(REPO, d), { recursive: true, filter: (s) => !/[\\/](\.lab|dist|runs|node_modules)$/.test(s) });
for (const f of ['lab.mjs', 'AGENTS.md']) fs.copyFileSync(path.join(TOP, f), path.join(REPO, f));
for (const d of ['bds/addons']) { fs.rmSync(path.join(REPO, d), { recursive: true, force: true }); fs.mkdirSync(path.join(REPO, d)); }
fs.rmSync(path.join(REPO, 'bds', '.lab-current'), { force: true });

let bad = 0, good = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${what}${ok || !detail ? '' : '\n    ' + String(detail).trim().split('\n').slice(-25).join('\n    ')}`); if (ok) good++; else bad++; };

// a cache that looks set up: server + template world + beta versions + build tools (the sandbox's own esbuild/typescript)
function npmRoot() { try { return execSync('npm root -g', { encoding: 'utf8' }).trim(); } catch { return ''; } }
function findPkg(name) {
  const g = npmRoot();
  for (const c of [path.join(g, name), path.join(g, 'tsx', 'node_modules', name), path.join(TOP, 'node_modules', name)]) if (fs.existsSync(path.join(c, 'package.json'))) return c;
  return null;
}
function seed(cache, { exe, version }) {
  const bds = path.join(cache, 'bds');
  fs.mkdirSync(bds, { recursive: true });
  fs.writeFileSync(path.join(bds, 'VERSION'), version);
  fs.writeFileSync(path.join(bds, 'server.properties'), 'server-name=fake\n');
  if (exe) { fs.writeFileSync(path.join(bds, exe.name), exe.body); fs.chmodSync(path.join(bds, exe.name), 0o755); }
  fs.mkdirSync(path.join(cache, 'world'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'world', 'level.dat'), Buffer.alloc(16));
  fs.writeFileSync(path.join(cache, 'beta.json'), JSON.stringify({ server: '2.8.0-beta', 'server-gametest': '1.0.0-beta' }));
  const tool = path.join(cache, 'tool', 'node_modules');
  fs.mkdirSync(tool, { recursive: true });
  for (const n of ['esbuild', 'typescript']) { const p = findPkg(n); if (p) fs.symlinkSync(p, path.join(tool, n), 'dir'); }
  fs.writeFileSync(path.join(cache, 'tool', 'package.json'), '{"private":true}');
  fs.writeFileSync(path.join(cache, 'tool', 'stamp'), JSON.stringify({ esbuild: '^0.28.0', typescript: '~6.0.3' }));
}
const CACHES = { bds: path.join(T, 'cache-bds'), end: path.join(T, 'cache-end'), ll: path.join(T, 'cache-ll') };
// native runtime unless a section asks for docker (macOS would default to docker; the fakes run on the host)
const baseEnv = { ...process.env, LAB_NOTRACE: '1', LAB_PY_TYPES: '0', LAB_TYPES: '0', NO_COLOR: '1', LAB_RUNTIME: 'native', LAB_PK_DECODE: '0',
  // really offline: npm never reaches a registry (the real client stays uninstalled even on a networked machine)
  npm_config_registry: 'http://127.0.0.1:9/', npm_config_fetch_retries: '0', npm_config_fetch_timeout: '2000', npm_config_offline: 'false', npm_config_prefer_online: 'true' };
function lab(flavor, args, extra = {}) {
  const r = spawnSync(process.execPath, [path.join(REPO, flavor, 'lab.mjs'), ...args], { cwd: path.join(REPO, flavor), env: { ...baseEnv, LAB_CACHE: CACHES[flavor], ...extra }, encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: ((r.stdout ?? '') + (r.stderr ?? '')).trim() };
}
const want = process.argv.slice(2);
const on = (f) => !want.length || want.includes(f);

// ------------------------------------------------------------------------------------------------ bds
if (on('bds')) {
  console.log('\n== bds (addons on plain BDS)');
  seed(CACHES.bds, { version: '1.26.51.1\n', exe: { name: 'bedrock_server', body: `#!/bin/sh\nexec "${process.execPath}" "${path.join(FAKE, 'fake_server.cjs')}" bds\n` } });
  let r = lab('bds', ['new', 'demo', 'Demo', '--js']);
  check(r.code === 0 && fs.existsSync(path.join(REPO, 'bds', 'addons', 'demo', 'bp', 'manifest.json')), 'bds: new demo --js', r.out);
  r = lab('bds', ['run', 'say hello bds']);
  check(/hello bds/.test(r.out), 'bds: run boots the (fake) BDS, output rendered', r.out);
  r = lab('bds', ['run', 'fakecrash']);
  check(/crash/i.test(r.out), 'bds: a crash is reported', r.out);
  r = lab('bds', ['py', '1']);
  check(r.code !== 0, 'bds: platform commands of other labs are not here');
  fs.writeFileSync(path.join(REPO, 'bds', 'addons', 'demo', 'tests.txt'), '## order\nsay a\n~ (?s)a.*b\n');
  r = lab('bds', ['test']);
  check(r.code !== 0 && /tests\.txt:3: .*Invalid regular expression/.test(r.out) && /before any server starts/.test(r.out), 'bds: a regex that does not compile stops test before any server starts', r.out);
}


// ------------------------------------------------------------------------------------------------ docker (macOS path)
// The macOS way (and LAB_RUNTIME=docker): the server side runs in a linux/amd64 container. A fake docker CLI checks every
// argument the lab builds and runs the program on the host, so the whole flow (image build, same-path mounts, ports, stdin,
// stop, kill of the container) is exercised without a daemon. Real Docker Desktop / OrbStack / colima: not here (CI note).
if (on('docker')) {
  console.log('\n== docker runtime (the macOS path, fake docker CLI)');
  const DLOG = path.join(T, 'docker.log'), DSTATE = path.join(T, 'docker-state');
  const denv = { LAB_RUNTIME: 'docker', LAB_DOCKER: path.join(FAKE, 'docker'), FAKE_DOCKER_LOG: DLOG, FAKE_DOCKER_STATE: DSTATE };
  const calls = () => (fs.existsSync(DLOG) ? fs.readFileSync(DLOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const leftovers = () => (fs.existsSync(DSTATE) ? fs.readdirSync(DSTATE).filter((f) => f.endsWith('.pid')) : []);
  // bds (seed again if only this part runs)
  if (!fs.existsSync(path.join(CACHES.bds, 'bds', 'bedrock_server'))) seed(CACHES.bds, { version: '1.26.51.1\n', exe: { name: 'bedrock_server', body: `#!/bin/sh\nexec "${process.execPath}" "${path.join(FAKE, 'fake_server.cjs')}" bds\n` } });
  if (!fs.existsSync(path.join(REPO, 'bds', 'addons', 'demo'))) lab('bds', ['new', 'demo', 'Demo', '--js']);
  let r = lab('bds', ['run', 'say hello from the container'], denv);
  const c = calls(), errs = c.filter((x) => x.error);
  check(/hello from the container/.test(r.out) && !errs.length, 'docker: bds boots inside the (fake) container, output rendered', r.out + JSON.stringify(errs));
  check(c.some((x) => x.build && /^bds-lab-bds:/.test(x.build)), 'docker: the lab image is built once, pinned to linux/amd64', JSON.stringify(c.slice(0, 3)));
  const srv = c.find((x) => x.run && x.run.flags.includes('-i'));
  check(!!srv && srv.run.ports.length === 2 && srv.run.cwd.startsWith(CACHES.bds) && !!srv.run.name, 'docker: server container = stdin + 2 UDP ports on 127.0.0.1 + instance dir as cwd', JSON.stringify(srv));
  check(!leftovers().length, 'docker: no container left after the run', leftovers().join(' '));
  r = lab('bds', ['up'], denv);
  check(r.code === 0, 'docker: up (live server in a container)', r.out);
  r = lab('bds', ['do', 'say live in docker'], denv);
  check(/live in docker/.test(r.out), 'docker: do talks to the containerized live server', r.out);
  r = lab('bds', ['down'], denv);
  check(r.code === 0 && !leftovers().length, 'docker: down stops the container', r.out + leftovers().join(' '));
  // end: venv python, Endstone launcher, py helper through the container
  if (fs.existsSync(path.join(CACHES.end, 'py', 'bin', 'endstone')) && fs.existsSync(path.join(REPO, 'end', 'plugins', 'hello'))) {
    r = lab('end', ['check'], denv);
    check(r.code === 0, 'docker: end check (syntax by host python, venv on the server side)', r.out);
    r = lab('end', ['run', 'py 1+2', 'fakejoin Mac'], denv);
    check(/\b3\b/.test(r.out) && /(Welcome|Hi again), Mac/.test(r.out), 'docker: end plugin runs under Endstone in the container', r.out);
    check(calls().some((x) => x.run && /endstone$/.test(x.run.cmd) && x.run.env.LAB_PYPATH), 'docker: the Endstone launch carries the lab paths as -e variables', '');
  }
  // ll: the server command through the container
  if (fs.existsSync(path.join(REPO, 'll', 'mods', 'greet'))) {
    r = lab('ll', ['run', 'lse 40+2', 'fakejoin Mac'], { ...denv, LAB_LL_LAUNCH: `${process.execPath} ${path.join(FAKE, 'fake_server.cjs')} ll` });
    check(/\b42\b/.test(r.out) && /(Welcome|Hello again), Mac/.test(r.out), 'docker: ll mod runs in the container', r.out);
  }
  // NetherNet server: transport + a UDP window advertised as 127.0.0.1, signaling TCP + window UDP published
  fs.writeFileSync(DLOG, '');
  r = lab('bds', ['run', '-v', 'say nn'], { ...denv, LAB_TRANSPORT: 'nethernet' });
  const nn = calls().find((x) => x.run && x.run.flags.includes('-i'));
  check(/transport nethernet udp 127\.0\.0\.1:(\d+)-(\d+):\1-\2/.test(r.out) && nn?.run.ports.some((p) => /\/tcp$/.test(p)) && nn.run.ports.filter((p) => /\/udp$/.test(p)).length === 10,
    'docker: LAB_TRANSPORT=nethernet → transport=nethernet, server-udp-ports advertised as 127.0.0.1, TCP signaling + UDP window published', r.out.split('\n').filter((l) => /transport/.test(l)).join(' ') + JSON.stringify(nn?.run.ports));
  check(!leftovers().length, 'docker: every container removed', leftovers().join(' '));
  // no docker at all: one clear line on what to install
  r = lab('bds', ['run', 'say x'], { ...denv, LAB_DOCKER: path.join(T, 'no-such-docker') });
  check(r.code !== 0 && /OrbStack|Docker Desktop/.test(r.out) && /colima/.test(r.out), 'docker: missing docker says what to install on macOS', r.out);
}

console.log(`\n${bad ? 'FAIL' : 'PASS'} ${good}/${good + bad}`);
if (!process.env.KEEP) fs.rmSync(T, { recursive: true, force: true }); else console.log('kept ' + T);
process.exit(bad ? 1 : 0);
