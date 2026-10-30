// GeoUI Web beside the lab's BDS: a unit with geoui-web.json gets the service (server.mjs) started when its BDS starts — once,
// kept for the next boots (a `restart`, the next test), ended by itself after an idle hour. The pictures' addresses are made for
// whoever plays: GEOUI_WEB_HOST is the name the game uses for this machine (the app lab passes the emulator's 10.0.2.2, a
// phone's view of this PC's LAN address), else the service's own guess (this machine's LAN address). The add-on asks the
// service itself (http://127.0.0.1:8787/info): nothing to tell it.
//   import { ensureService } from 'bds/geoui/web/lab.mjs'
//   await ensureService({ log, logFile, tunnel }) → { ok, url, public, tunnel, started, why? }
// tunnel (geoui-web.json "tunnel": true, or GEOUI_WEB_TUNNEL=1): an https address from cloudflared's quick tunnel as well, said by
// the service's /info (the add-on chooses: x-geoui-public: tunnel)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function info(port, ms = 1500) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/info`, { signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** the address the pictures are fetched by, for these settings ('' = the service's own default) */
export function publicFor(env = process.env, port = Number(env.GEOUI_WEB_PORT) || 8787) {
  if (env.GEOUI_WEB_PUBLIC) return env.GEOUI_WEB_PUBLIC.replace(/\/+$/, '');
  return env.GEOUI_WEB_HOST ? `http://${env.GEOUI_WEB_HOST}:${port}` : '';
}

// ---- a tunnel (cloudflared's quick tunnel: https://<words>.trycloudflare.com, no account): pictures over HTTPS from anywhere —
//      for a game that will not fetch plain http, or players who are not on this network. Its binary: on PATH, else fetched once
//      (Linux) into bds/.lab/cloudflared/
const CF_URL = { x64: 'cloudflared-linux-amd64', arm64: 'cloudflared-linux-arm64' };
async function cloudflared(cacheDir, log) {
  const { spawnSync } = await import('node:child_process');
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  if (process.platform !== 'linux' || !CF_URL[process.arch]) return null;
  const f = path.join(cacheDir, 'cloudflared');
  if (!fs.existsSync(f)) {
    log('GeoUI Web: cloudflared を取得しています…');
    const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${CF_URL[process.arch]}`, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) return null;
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(f + '.part', Buffer.from(await r.arrayBuffer()));
    fs.chmodSync(f + '.part', 0o755);
    fs.renameSync(f + '.part', f);
  }
  return f;
}
/** the tunnel's https address (started when there is none yet), or null */
export async function ensureTunnel({ port, cacheDir, log = () => {}, logFile = null, wait = 45000 }) {
  const now = await info(port);
  if (now && now.tunnel) return now.tunnel;
  const bin = await cloudflared(cacheDir, log).catch(() => null);
  if (!bin) { log('GeoUI Web: cloudflared がありません（トンネルなし）'); return null; }
  const lf = logFile || path.join(cacheDir, 'tunnel.log');
  fs.mkdirSync(path.dirname(lf), { recursive: true });
  fs.writeFileSync(lf, '');
  const fd = fs.openSync(lf, 'a');
  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  fs.closeSync(fd);
  for (let t = 0; t < wait / 250; t++) {
    await sleep(250);
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(fs.readFileSync(lf, 'utf8'));
    if (m) {
      await fetch(`http://127.0.0.1:${port}/tunnel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: m[0], pid: child.pid }), signal: AbortSignal.timeout(3000) }).catch(() => {});
      log(`GeoUI Web: トンネル ${m[0]}`);
      return m[0];
    }
    if (child.exitCode !== null) break;
  }
  return null;
}

export async function ensureService({ port = Number(process.env.GEOUI_WEB_PORT) || 8787, log = () => {}, logFile = null, idle = 3600, env = process.env, tunnel = env.GEOUI_WEB_TUNNEL === '1', cacheDir = path.join(HERE, '..', '..', '.lab', 'geoui-web') } = {}) {
  const want = publicFor(env, port);
  const now = await info(port);
  if (now && now.ok && now.name === 'geoui-web' && now.version === VERSION && (!want || now.public === want)) {
    const tun = tunnel ? await ensureTunnel({ port, cacheDir, log }) : now.tunnel || null;
    return { ok: true, url: `http://127.0.0.1:${port}`, public: now.public, tunnel: tun, started: false };
  }
  if (now) {
    // (another version, or pictures for other players: ended and started again — the port is the add-on's)
    await fetch(`http://127.0.0.1:${port}/quit`, { method: 'POST', signal: AbortSignal.timeout(2000) }).catch(() => {});
    for (let t = 0; t < 40 && await info(port, 300); t++) await sleep(150);
  }
  const args = [path.join(HERE, 'server.mjs'), '--port', String(port), '--idle', String(idle), ...(want ? ['--public', want] : []), ...(env.CI ? ['--fonts'] : [])];
  let out = 'ignore';
  if (logFile) { fs.mkdirSync(path.dirname(logFile), { recursive: true }); out = fs.openSync(logFile, 'a'); }
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', out, out], env: { ...env } });
  child.unref();
  if (typeof out === 'number') fs.closeSync(out);
  for (let t = 0; t < 100; t++) {
    await sleep(150);
    const i = await info(port, 500);
    if (i && i.ok) {
      log(`GeoUI Web: http://127.0.0.1:${port}（絵は ${i.public} から）`);
      const tun = tunnel ? await ensureTunnel({ port, cacheDir, log }) : null;
      return { ok: true, url: `http://127.0.0.1:${port}`, public: i.public, tunnel: tun, started: true };
    }
    if (child.exitCode !== null) break;
  }
  return { ok: false, why: `GeoUI Web のサービスが起動しませんでした（ポート ${port}${logFile ? `、${logFile}` : ''}）` };
}
