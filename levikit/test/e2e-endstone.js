#!/usr/bin/env node
'use strict';
// パネル ⇄ 本物の Endstone サーバーの結合テスト: node test/e2e-endstone.js <install-endstone.sh --no-service で作ったフォルダー>
//   起動 → endstone-levikit の READY と 3 つのワールド → 参加したままのバックアップ（本物の BDS の save hold / query / resume）
//   → BAN とメンテナンスがプラグインに届く → LeviLamina 版だけの操作は理由を言って断る → 再起動 → 停止
//   確かめていないこと: プレイヤーがいる状態での待機サーバー経由の再起動・復元（本物のクライアントが要る）
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(ROOT, 'levikit.json'))) {
  console.error('usage: node test/e2e-endstone.js <root>   (./install-endstone.sh --accept-eula --root <root> --no-service)');
  process.exit(2);
}
const CFG = path.join(ROOT, 'levikit.json');
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const PORT = cfg.panel.port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  cfg.instances.main.autoStart = false;
  // 前の実行の BAN・メンテナンスを残さない
  fs.rmSync(path.join(cfg.instances.main.dir, 'plugins', 'levikit-core', 'config', 'config.json'), { force: true });
  cfg.backup.intervalMinutes = 0;
  fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2));
  const env = { ...process.env, LEVIKIT_CONFIG: CFG, LEVIKIT_METRICS_MS: '500' };
  execFileSync(process.execPath, [path.join(ROOT, 'panel', 'bin', 'passwd.js'), 'test-password-123'], { env });
  const panel = spawn(process.execPath, [path.join(ROOT, 'panel', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let panelOut = '';
  panel.stdout.on('data', (d) => (panelOut += d));
  panel.stderr.on('data', (d) => (panelOut += d));
  await sleep(1000);

  let cookie = '';
  const api = async (method, url, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${url}`, {
      method,
      headers: { 'x-levikit': '1', 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  const waitJob = async (label, tries = 600) => {
    for (let i = 0; i < tries; i++) {
      const st = await api('GET', '/api/state');
      if (st.job && st.job.status !== 'running') {
        if (st.job.status !== 'done') throw new Error(`${label} failed: ${st.job.error}\n${st.job.log.join('\n')}`);
        return st.job;
      }
      await sleep(500);
    }
    throw new Error(`${label} timeout`);
  };
  const logs = async () => (await api('GET', '/api/logs/main')).map((l) => (typeof l === 'string' ? l : l.line || l.text || JSON.stringify(l))).join('\n');
  const until = async (label, fn, ms = 60_000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error(`${label}: timeout`);
      await sleep(500);
    }
  };
  const ok = (m) => console.log(`  ✔ ${m}`);
  let failed = false;

  try {
    await api('POST', '/api/login', { password: 'test-password-123' });
    await api('POST', '/api/main/start');
    await waitJob('start');
    let st = await api('GET', '/api/state');
    assert.strictEqual(st.instances.main.state, 'running');
    ok('本物の Endstone サーバーをパネルから起動');

    await until('READY', async () => /@@LEVIKIT READY \{"limbo":false,"engine":"endstone"\}/.test(await logs()));
    const dims = await until('DIMS', async () => {
      const d = await api('GET', '/api/dimensions');
      const live = d.live || d.worlds || d.dims;
      return Array.isArray(live) && live.length ? live : null;
    });
    assert.deepStrictEqual(dims.map((w) => w.key), ['overworld', 'nether', 'the_end']);
    ok('endstone-levikit が READY、ワールドは overworld / nether / the_end');

    st = await api('GET', '/api/state');
    assert.strictEqual(st.seamlessBlocker, null, `seamlessBlocker: ${st.seamlessBlocker}`);
    ok('参加したままの再起動・復元の条件を満たしている（プラグインを検出）');

    await api('POST', '/api/backups', { note: 'endstone e2e' });
    const job = await waitJob('backup');
    assert(job.log.some((l) => l.includes('save resume')), job.log.join('\n'));
    const list = await api('GET', '/api/backups');
    assert.strictEqual(list.length >= 1, true);
    assert(list[0].size > 1000, `size: ${JSON.stringify(list[0])}`);
    ok(`動かしたままバックアップ（本物の BDS の save hold / query / resume、${list[0].size} バイト）`);

    await api('POST', '/api/access/ban', { name: 'Griefer', reason: 'e2e' });
    await until('RELOADED with the ban', async () => /@@LEVIKIT RELOADED \{"maintenance":false,"bans":1/.test(await logs()));
    await api('POST', '/api/access/maintenance', { on: true });
    await until('RELOADED with maintenance', async () => /@@LEVIKIT RELOADED \{"maintenance":true,"bans":1/.test(await logs()));
    ok('BAN とメンテナンスがプラグインに届く（levikit reload）');

    await assert.rejects(api('POST', '/api/dimensions/reset', { names: ['levikit:resource'] }), /カスタムディメンションのみ|LeviLamina 版だけ/);
    assert.throws(() => require(path.join(ROOT, 'panel', 'lib', 'orchestrator.js')).Orchestrator.prototype.needsLeviLamina.call({ cfg: { engine: 'endstone' } }, 'ワールドのリセット'), /LeviLamina 版だけ/);
    ok('追加ワールドの操作（リセットなど）は断る');

    await api('POST', '/api/main/restart', { standard: true });
    await waitJob('restart');
    st = await api('GET', '/api/state');
    assert.strictEqual(st.instances.main.state, 'running');
    ok('再起動');

    await api('POST', '/api/main/stop');
    await waitJob('stop');
    st = await api('GET', '/api/state');
    assert.strictEqual(st.instances.main.state, 'stopped');
    ok('停止');
    console.log('\nALL PASSED');
  } catch (e) {
    failed = true;
    console.error(`\nFAILED: ${e.stack || e}`);
    console.error(panelOut.split('\n').slice(-30).join('\n'));
    try {
      console.error((await logs()).split('\n').slice(-40).join('\n'));
    } catch {
      /* the panel is gone */
    }
  } finally {
    try {
      await api('POST', '/api/main/stop');
      await sleep(3000);
    } catch {
      /* already stopped */
    }
    panel.kill('SIGTERM');
    await sleep(1500);
  }
  process.exit(failed ? 1 : 0);
}
main();
