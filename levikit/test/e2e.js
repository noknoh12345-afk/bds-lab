#!/usr/bin/env node
'use strict';
// パネルの結合テスト（擬似BDSを使用）: node test/e2e.js
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'levikit-e2e-'));
const BUS = path.join(ROOT, 'bus');
const PANEL = path.join(__dirname, '..', 'panel');
const FAKE = path.join(__dirname, 'fake-bds.js');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mkInstance(name, port, level) {
  const dir = path.join(ROOT, 'instances', name);
  fs.mkdirSync(path.join(dir, 'plugins', 'levikit-core'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugins', 'levikit-core', 'manifest.json'), JSON.stringify({ name: 'levikit-core', version: '1.0.0', type: 'native' }));
  fs.writeFileSync(path.join(dir, 'server.properties'), `# name\nserver-name=Test\nserver-port=${port}\nserver-portv6=${port + 1}\nlevel-name=${level}\nmax-players=10\n`);
  return dir;
}

async function main() {
  fs.mkdirSync(BUS, { recursive: true });
  const mainDir = mkInstance('main', 19132, 'Bedrock level');
  const limboDir = mkInstance('limbo', 19134, 'limbo');
  const cfgPath = path.join(ROOT, 'levikit.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      root: ROOT,
      publicHost: '127.0.0.1',
      panel: { host: '127.0.0.1', port: PORT },
      instances: {
        main: { dir: mainDir, cmd: [process.execPath, FAKE], autoStart: false },
        limbo: { dir: limboDir, cmd: [process.execPath, FAKE], mode: 'ondemand', port: 19134, portv6: 19135 },
      },
      backup: { dir: path.join(ROOT, 'backups'), intervalMinutes: 0, compression: 'gzip' },
      schedule: { restartWarnSeconds: 0 },
    })
  );
  const env = { ...process.env, LEVIKIT_CONFIG: cfgPath, FAKE_BUS: BUS, LEVIKIT_METRICS_MS: '500' };
  execFileSync(process.execPath, [path.join(PANEL, 'bin', 'passwd.js'), 'test-password-123'], { env });

  const panel = spawn(process.execPath, [path.join(PANEL, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let panelOut = '';
  panel.stdout.on('data', (d) => (panelOut += d));
  panel.stderr.on('data', (d) => (panelOut += d));
  await sleep(800);

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
  const waitJob = async (label) => {
    for (let i = 0; i < 200; i++) {
      const st = await api('GET', '/api/state');
      if (st.job && st.job.status !== 'running') {
        if (st.job.status !== 'done') throw new Error(`${label} failed: ${st.job.error}\n${st.job.log.join('\n')}`);
        return st.job;
      }
      await sleep(250);
    }
    throw new Error(`${label} timeout`);
  };
  const ok = (m) => console.log(`  ✔ ${m}`);

  try {
    // 認証
    await assert.rejects(api('GET', '/api/state'));
    await assert.rejects(api('POST', '/api/login', { password: 'wrong' }));
    await api('POST', '/api/login', { password: 'test-password-123' });
    ok('ログイン');
    const noHeader = await fetch(`http://127.0.0.1:${PORT}/api/main/start`, { method: 'POST', headers: { cookie } });
    assert.strictEqual(noHeader.status, 403);
    ok('CSRF ヘッダー無しを拒否');

    // 起動
    await api('POST', '/api/main/start');
    await waitJob('start');
    let st = await api('GET', '/api/state');
    assert.strictEqual(st.instances.main.state, 'running');
    assert.strictEqual(st.seamlessBlocker, null);
    ok('メイン起動 / シームレス可');

    // プレイヤー参加
    await api('POST', '/api/main/command', { command: 'join Alice' });
    await api('POST', '/api/main/command', { command: 'join Bob' });
    await sleep(400);
    st = await api('GET', '/api/state');
    assert.deepStrictEqual(st.instances.main.players.map((p) => p.name).sort(), ['Alice', 'Bob']);
    ok('プレイヤー追跡（カラーコード付きログを解析）');

    // ホットバックアップ（重複排除ストア）
    await api('POST', '/api/backups', { note: 'e2e' });
    const job = await waitJob('backup');
    assert(job.log.some((l) => l.includes('save resume')));
    let list = await api('GET', '/api/backups');
    assert.strictEqual(list.length, 1);
    const b = list[0];
    assert.strictEqual(b.type, 'manual');
    assert.strictEqual(b.format, 'cas');
    assert.deepStrictEqual(b.players.sort(), ['Alice', 'Bob']);
    st = await api('GET', '/api/state');
    assert.strictEqual(st.instances.main.players.length, 2, 'players still online during backup');
    // ダウンロード（展開して中身を検証）
    const dl = await fetch(`http://127.0.0.1:${PORT}/api/backups/${b.id}/download`, { headers: { cookie } });
    assert.strictEqual(dl.status, 200);
    const dlFile = path.join(ROOT, 'dl.tar.gz');
    fs.writeFileSync(dlFile, Buffer.from(await dl.arrayBuffer()));
    const ex = path.join(ROOT, 'extract-check');
    fs.mkdirSync(ex);
    execFileSync('tar', ['-xzf', dlFile, '-C', ex]);
    const w = path.join(ex, 'Bedrock level');
    assert.strictEqual(fs.statSync(path.join(w, 'db', '000005.ldb')).size, 4000, 'ldb truncated to reported length');
    assert.strictEqual(fs.statSync(path.join(w, 'db', '000003.log')).size, 500);
    assert(fs.existsSync(path.join(w, 'dimension_config.json')), 'dimension_config.json included');
    assert(fs.existsSync(path.join(w, 'levikit', 'inventory_groups.json')), 'levikit save data included');
    ok('参加したままホットバックアップ（save hold/query/resume, 長さ切り詰め, 補助ファイル, ダウンロード）');

    // 2回目: 変わった分だけ保存される
    await api('POST', '/api/main/command', { command: 'touch' });
    await api('POST', '/api/backups', { note: 'second' });
    await waitJob('backup2');
    list = await api('GET', '/api/backups');
    const b2 = list.find((x) => x.note === 'second');
    assert(b2.stored < 3500 && b2.stored >= 3000, `dedup: stored=${b2.stored}`);
    assert(b2.size > b.size);
    ok(`重複排除: 2回目の新規保存 ${b2.stored} B / 全体 ${b2.size} B`);

    // ワールドを壊してから参加したまま復元
    fs.writeFileSync(path.join(mainDir, 'worlds', 'Bedrock level', 'level.dat'), 'BROKEN');
    await api('POST', `/api/backups/${b.id}/restore`, { standard: false });
    const rj = await waitJob('restore');
    const rlog = rj.log.join('\n');
    assert(/待機サーバー起動完了/.test(rlog), 'limbo started');
    assert(/main の 2 人を 127\.0\.0\.1:19134 へ転送/.test(rlog), 'transfer to limbo');
    assert(/limbo の 2 人を 127\.0\.0\.1:19132 へ転送/.test(rlog), 'transfer back');
    assert(/待機サーバーを停止/.test(rlog), 'limbo stopped (ondemand)');
    assert.strictEqual(fs.readFileSync(path.join(mainDir, 'worlds', 'Bedrock level', 'level.dat'), 'utf8'), 'LEVELDAT-Bedrock level');
    assert(!fs.existsSync(path.join(mainDir, 'worlds', 'Bedrock level', 'db', '000009.ldb')), 'restored to first snapshot');
    await sleep(500);
    st = await api('GET', '/api/state');
    assert.deepStrictEqual(st.instances.main.players.map((p) => p.name).sort(), ['Alice', 'Bob']);
    assert.strictEqual(st.instances.limbo.state, 'stopped');
    list = await api('GET', '/api/backups');
    const pre = list.find((x) => x.type === 'pre-restore');
    assert(pre, 'pre-restore archive created');
    ok('参加したまま復元（limbo 退避 → 差し替え → 自動復帰 → 退避バックアップ）');

    // 削除 → GC
    await api('DELETE', `/api/backups/${b2.id}`);
    const stats2 = await api('GET', '/api/backups/stats');
    // pre-restore は 000009 を含むので残る。それも消せば 000009 のオブジェクトが消える
    await api('DELETE', `/api/backups/${pre.id}`);
    const stats3 = await api('GET', '/api/backups/stats');
    assert(stats3.storeBytes < stats2.storeBytes, `gc removed unreferenced objects ${stats3.storeBytes} < ${stats2.storeBytes}`);
    ok('削除と未参照オブジェクトの GC');

    // tar 形式でも動く
    await api('PUT', '/api/settings', { backup: { format: 'tar' } });
    await api('POST', '/api/backups', { note: 'tar' });
    await waitJob('tar backup');
    list = await api('GET', '/api/backups');
    const bt = list.find((x) => x.note === 'tar');
    assert.strictEqual(bt.format, 'tar');
    assert(fs.existsSync(path.join(ROOT, 'backups', 'main', bt.file)));
    await api('PUT', '/api/settings', { backup: { format: 'cas' } });
    ok('tar 形式バックアップ');

    // チャット
    await api('POST', '/api/main/command', { command: 'chat Alice こんにちは' });
    await sleep(300);
    const chat = await api('GET', '/api/chat');
    assert(chat.some((c) => c.name === 'Alice' && c.message === 'こんにちは'));
    await api('POST', '/api/chat', { message: 'hello from web' });
    await sleep(200);
    const logs = await api('GET', '/api/logs/main');
    assert(logs.some((l) => /tellraw.*\[Web\].*hello from web/.test(l.text)));
    ok('チャット取得 / Web から送信');

    // TPS
    st = await api('GET', '/api/state');
    assert.strictEqual(st.instances.main.tps, 19.8);
    const met = await api('GET', '/api/metrics?range=3600');
    assert(met.main.length >= 2 && met.main.some((p) => p.tps === 19.8 && p.rss > 0), 'metrics sampled');
    ok('TPS / メモリ / CPU メトリクス');

    // BAN
    await api('POST', '/api/access/ban', { name: 'Bob', reason: 'test', minutes: 10 });
    await sleep(600);
    st = await api('GET', '/api/state');
    assert.deepStrictEqual(st.instances.main.players.map((p) => p.name), ['Alice'], 'banned player kicked on reload');
    await api('POST', '/api/main/command', { command: 'join Bob' });
    await sleep(600);
    st = await api('GET', '/api/state');
    assert.deepStrictEqual(st.instances.main.players.map((p) => p.name), ['Alice'], 'banned player denied');
    let acc = await api('GET', '/api/access');
    assert.strictEqual(acc.bans.length, 1);
    assert(acc.bans[0].until > Date.now() / 1000);
    await api('POST', '/api/access/unban', { name: 'Bob' });
    await api('POST', '/api/main/command', { command: 'join Bob' });
    await sleep(500);
    st = await api('GET', '/api/state');
    assert.strictEqual(st.instances.main.players.length, 2);
    ok('BAN（期限付き）→ 即時キック・参加拒否 → 解除');

    // メンテナンス
    await api('PUT', '/api/access', { maintenance: true, maintenanceAllow: 'Alice' });
    await sleep(600);
    st = await api('GET', '/api/state');
    assert.strictEqual(st.maintenance, true);
    assert.deepStrictEqual(st.instances.main.players.map((p) => p.name), ['Alice']);
    await api('POST', '/api/access/maintenance', { on: false });
    await api('POST', '/api/main/command', { command: 'join Bob' });
    await sleep(500);
    ok('メンテナンスモード（許可リスト以外を切断）');

    // スケジュールタスク
    const tr = await api('PUT', '/api/tasks', { tasks: [{ name: '告知', kind: 'say', value: '{online}人がプレイ中', schedule: { type: 'interval', minutes: 30 } }, { name: 'motd', kind: 'motd', value: 'A {online}\nB', schedule: { type: 'daily', time: '04:00', days: [1, 3] } }] });
    assert.strictEqual(tr.tasks.length, 2);
    await api('POST', `/api/tasks/${tr.tasks[0].id}/run`);
    await api('POST', `/api/tasks/${tr.tasks[1].id}/run`);
    await api('POST', `/api/tasks/${tr.tasks[1].id}/run`);
    await sleep(300);
    const logs2 = (await api('GET', '/api/logs/main')).map((l) => l.text).join('\n');
    assert(/tellraw .*2人がプレイ中/.test(logs2), 'say task with vars');
    assert(/levikit motd "A 2"/.test(logs2) && /levikit motd "B"/.test(logs2), 'motd rotation');
    ok('スケジュールタスク（変数展開・MOTD ローテーション）');

    // ファイル編集
    const fl = await api('GET', '/api/files?path=');
    assert(fl.entries.some((e) => e.name === 'server.properties'));
    assert(!fl.entries.some((e) => e.name === 'worlds'), 'worlds hidden');
    await assert.rejects(api('GET', '/api/files?path=worlds'));
    await assert.rejects(api('GET', '/api/file?path=../levikit.json'));
    const kf = await api('GET', '/api/file?path=plugins/levikit-core/manifest.json');
    await assert.rejects(api('PUT', '/api/file', { path: 'plugins/levikit-core/manifest.json', content: '{bad', mtime: kf.mtime }), /JSON/);
    await api('PUT', '/api/file', { path: 'plugins/levikit-core/manifest.json', content: kf.content.replace('1.0.0', '1.0.1'), mtime: kf.mtime });
    assert(fs.existsSync(path.join(mainDir, 'plugins', 'levikit-core', 'manifest.json.levikit-bak')));
    ok('ファイル編集（範囲制限・JSON 検証・バックアップ）');

    // プレイヤー履歴
    const hist = await api('GET', '/api/players/history');
    const alice = hist.find((h) => h.name === 'Alice');
    assert(alice && alice.sessions >= 2 && alice.totalMs > 0);
    ok(`プレイヤー履歴（Alice: ${alice.sessions} セッション）`);

    // ディメンション設定
    const d = await api('GET', '/api/dimensions');
    assert.strictEqual(d.kit.dimensions.length, 3, JSON.stringify(d.kit.dimensions.map((x) => x.name)));
    assert.strictEqual(d.actual['levikit:resource'].dimId, 1000);
    await api('POST', '/api/access/ban', { name: 'Eve' });
    assert(d.presets.lobby && d.options.protections.includes('spawn'));
    assert(Array.isArray(d.live) && d.live.some((w) => w.key === 'levikit:resource'), 'live worlds from DIMS');
    d.kit.dimensions.push({ ...d.presets.lobby.dim, name: 'levikit:mine', displayName: '採掘', seed: 42 });
    await assert.rejects(api('PUT', '/api/dimensions', { kit: { ...d.kit, dimensions: [...d.kit.dimensions, { ...d.kit.dimensions[0] }] } }), /重複/);
    await assert.rejects(api('PUT', '/api/dimensions', { kit: { ...d.kit, dimensions: [{ ...d.kit.dimensions[0], name: 'minecraft:x' }] } }));
    await api('PUT', '/api/dimensions', { kit: d.kit, apply: 'restart' });
    const dj = await waitJob('dims');
    assert(/limbo の 2 人を/.test(dj.log.join('\n')));
    const saved = JSON.parse(fs.readFileSync(path.join(mainDir, 'plugins', 'levikit-core', 'config', 'config.json'), 'utf8'));
    assert.strictEqual(saved.dimensions.length, 4);
    assert.strictEqual(saved.limboMode, false);
    assert.strictEqual(saved.version, 4);
    assert.strictEqual(saved.dimensions[1].rules.gameMode, 'creative');
    await assert.rejects(api('PUT', '/api/dimensions', { kit: { ...d.kit, dimensions: [{ ...d.kit.dimensions[0], rules: { ...d.kit.dimensions[0].rules, inventoryGroup: 'bad group!' } }] } }));
    await assert.rejects(api('PUT', '/api/dimensions', { kit: { ...d.kit, dimensions: [{ ...d.kit.dimensions[0], rules: { ...d.kit.dimensions[0].rules, protection: 'nope' } }] } }), /保護/);
    assert.deepStrictEqual(saved.bans.map((x) => x.name), ['Eve'], 'dimension save keeps bans');
    ok('ディメンション追加 → 検証 → 参加したまま再起動で適用（BAN 設定は保持）');
    const audit = await api('GET', '/api/audit');
    assert(audit.some((a) => a.action === 'login') && audit.some((a) => /dimensions/.test(a.action)));
    ok('操作ログ');

    // ===== マルチワールド =====
    // ワールドリセット（新しいシード, リセット前バックアップ, 参加したまま）
    const before = JSON.parse(fs.readFileSync(path.join(mainDir, 'plugins', 'levikit-core', 'config', 'config.json'), 'utf8')).dimensions.find((x) => x.name === 'levikit:resource').seed;
    await api('POST', '/api/dimensions/reset', { name: 'levikit:resource', seed: 'random' });
    const rsj = await waitJob('reset');
    const rsl = rsj.log.join('\n');
    assert(/リセット前バックアップ/.test(rsl), 'pre-reset backup');
    assert(/リセット完了: levikit:resource/.test(rsl), `reset done\n${rsl}`);
    assert(/limbo の \d+ 人を/.test(rsl), 'players came back after reset');
    const kitAfter = JSON.parse(fs.readFileSync(path.join(mainDir, 'plugins', 'levikit-core', 'config', 'config.json'), 'utf8'));
    assert.deepStrictEqual(kitAfter.pendingResets, []);
    assert.notStrictEqual(kitAfter.dimensions.find((x) => x.name === 'levikit:resource').seed, before, 'seed randomized');
    const d2 = await api('GET', '/api/dimensions');
    assert.strictEqual(d2.resets['levikit:resource'].epoch, 1);
    assert.strictEqual(d2.live.find((w) => w.key === 'levikit:resource').epoch, 1);
    assert((await api('GET', '/api/backups')).some((x) => x.type === 'pre-reset'));
    await assert.rejects(api('POST', '/api/dimensions/reset', { name: 'overworld' }), /カスタム/);
    ok('ワールドリセット（リセット前バックアップ → 参加したまま再起動 → 新シード → epoch）');

    // ワープ / ポータル
    await assert.rejects(api('PUT', '/api/warps', { warps: [{ name: 'shop', world: 'levikit:nope' }] }), /ワールド/);
    await api('PUT', '/api/warps', { warps: [{ name: 'shop', world: 'levikit:resource', x: 10, y: 70, z: -5 }], portals: [] });
    await assert.rejects(api('PUT', '/api/warps', { portals: [{ name: 'p1', world: 'overworld', x1: 0, y1: 0, z1: 0, x2: 100, y2: 100, z2: 100, target: 'warp:shop' }] }), /大きすぎ/);
    await assert.rejects(api('PUT', '/api/warps', { portals: [{ name: 'p1', world: 'overworld', x1: 0, y1: 64, z1: 0, x2: 2, y2: 66, z2: 0, target: 'warp:none' }] }), /行き先/);
    const wp = await api('PUT', '/api/warps', { portals: [{ name: 'p1', world: 'overworld', x1: 0, y1: 64, z1: 0, x2: 2, y2: 66, z2: 0, target: 'world:levikit:flat' }] });
    assert.strictEqual(wp.portals.length, 1);
    assert.strictEqual(wp.warps.length, 1, 'warps kept when only portals sent');
    // ロビー設定の行き先検証
    const d3 = await api('GET', '/api/dimensions');
    await assert.rejects(api('PUT', '/api/dimensions', { kit: { ...d3.kit, hub: { mode: 'always', target: 'warp:nothing' } } }), /ロビー/);
    await api('PUT', '/api/dimensions', { kit: { ...d3.kit, hub: { mode: 'firstJoin', target: 'warp:shop' }, chatMode: 'world' } });
    ok('ワープ / ポータル / ロビーの検証と保存');

    // 開放・閉鎖、全員送り込み
    await api('POST', '/api/worlds/close', { key: 'levikit:void' });
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(mainDir, 'plugins', 'levikit-core', 'config', 'config.json'), 'utf8')).dimensions.find((x) => x.name === 'levikit:void').rules.open, false);
    await api('POST', '/api/worlds/open', { key: 'levikit:void' });
    await api('POST', '/api/worlds/send', { key: 'levikit:flat' });
    await sleep(200);
    assert((await api('GET', '/api/logs/main')).some((l) => /tpdim @a 0.5 -60 0.5 levikit:flat/.test(l.text)));
    await sleep(1200);
    st = await api('GET', '/api/state');
    assert.strictEqual(st.worlds.find((w) => w.key === 'overworld').players, st.instances.main.players.length, 'per-world counts from STATS');
    ok('ワールドの開放/閉鎖・全員を送る・ワールド別人数');

    // スケジュールでリセット
    const tr2 = await api('PUT', '/api/tasks', { tasks: [{ name: '週次リセット', kind: 'resetWorld', value: 'levikit:resource', schedule: { type: 'daily', time: '05:00', days: [1] } }] });
    await api('POST', `/api/tasks/${tr2.tasks[0].id}/run`);
    const tj = await waitJob('task reset');
    assert(/リセット完了: levikit:resource/.test(tj.log.join('\n')));
    assert.strictEqual((await api('GET', '/api/dimensions')).resets['levikit:resource'].epoch, 2);
    ok('スケジュールタスクからのワールドリセット');

    // server.properties
    await api('PUT', '/api/properties', { updates: { 'max-players': '20', 'view-distance': '12' } });
    const pr = await api('GET', '/api/properties');
    assert.strictEqual(pr.find((p) => p.key === 'max-players').value, '20');
    assert.strictEqual(pr.find((p) => p.key === 'view-distance').value, '12');
    assert(fs.readFileSync(path.join(mainDir, 'server.properties'), 'utf8').startsWith('# name\n'), 'comments preserved');
    ok('server.properties 編集（コメント保持）');

    // 通常再起動（全員切断）
    await api('POST', '/api/main/restart', { standard: true });
    const sj = await waitJob('std restart');
    assert(/通常モード/.test(sj.log.join('\n')));
    ok('通常再起動');

    // 停止
    await api('POST', '/api/main/stop');
    await waitJob('stop');
    st = await api('GET', '/api/state');
    assert.strictEqual(st.instances.main.state, 'stopped');
    ok('停止');

    // 停止中バックアップ
    await api('POST', '/api/backups', {});
    await waitJob('offline backup');
    ok('停止中バックアップ');

    console.log('\nALL PASSED');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    console.error('--- panel output ---\n' + panelOut.slice(-4000));
    process.exitCode = 1;
  } finally {
    panel.kill('SIGTERM');
    await sleep(1500);
    fs.rmSync(ROOT, { recursive: true, force: true });
  }
}
main();
