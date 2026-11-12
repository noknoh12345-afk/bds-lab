#!/usr/bin/env node
'use strict';
// マルチワールド操作の結合テスト（本物の LevelDB を持つ擬似 BDS を使用）
//   .mcworld 取り込み / ワールド単位の書き出し・複製・復元 / ワールド別滞在時間 / 権限グループ
//   node test/e2e-worlds.js
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const { LevelDBReader } = require('../panel/lib/leveldb');
const nbt = require('../panel/lib/nbt');
const wio = require('../panel/lib/worldio');
const { zipDir, extractZip } = require('../panel/lib/zip');
const { makeWorld } = require('./lib/synthworld');
const { encodePng } = require('../panel/lib/mapper');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'levikit-e2ew-'));
const BUS = path.join(ROOT, 'bus');
const PANEL = path.join(__dirname, '..', 'panel');
const FAKE = path.join(__dirname, 'fake-bds.js');
const PORT = 19000 + Math.floor(Math.random() * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const grid = (n, ox = 0, oz = 0) => {
  const out = [];
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) out.push([x + ox, z + oz]);
  return out;
};

function mkInstance(name, port, level) {
  const dir = path.join(ROOT, 'instances', name);
  fs.mkdirSync(path.join(dir, 'plugins', 'levikit-core'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugins', 'levikit-core', 'manifest.json'), JSON.stringify({ name: 'levikit-core', version: '1.0.0', type: 'native' }));
  fs.writeFileSync(path.join(dir, 'server.properties'), `server-name=Test\nserver-port=${port}\nserver-portv6=${port + 1}\nlevel-name=${level}\nmax-players=10\n`);
  return dir;
}

async function dbEntries(dbDir) {
  return [...(await (await new LevelDBReader(dbDir).open()).collect(() => true)).values()].filter((e) => e.value);
}

function chunkMap(entries, dim) {
  const m = new Map();
  for (const e of entries) {
    const k = wio.classifyKey(e.key);
    if (k.kind === 'chunk' && k.dim === dim) m.set(k.rest.toString('hex'), e.value.toString('hex'));
  }
  return m;
}

function sameChunks(map, expected) {
  if (map.size !== expected.size) return false;
  for (const [k, v] of expected) if (map.get(k) !== v) return false;
  return true;
}

/** すべてのエンティティ: キー = storageKeyOf(UniqueID) = StorageKey、digp は実体を指す */
function checkActors(entries) {
  const actors = new Map();
  for (const e of entries) {
    const k = wio.classifyKey(e.key);
    if (k.kind === 'actor') actors.set(k.id.toString('hex'), e.value);
  }
  for (const [hex, v] of actors) {
    const t = nbt.readRoot(v).tag.value;
    assert.strictEqual(wio.storageKeyOf(t.UniqueID.value).toString('hex'), hex, 'actor key = storageKeyOf(UniqueID)');
    const sk = t.internalComponents.value.EntityStorageKeyComponent.value.StorageKey.value;
    assert.strictEqual((Buffer.isBuffer(sk) ? sk : Buffer.from(sk, 'utf8')).toString('hex'), hex, 'StorageKey');
  }
  for (const e of entries) {
    const k = wio.classifyKey(e.key);
    if (k.kind !== 'digp') continue;
    for (let o = 0; o + 8 <= e.value.length; o += 8) assert(actors.has(e.value.subarray(o, o + 8).toString('hex')), 'digp -> actor');
  }
  return actors.size;
}

function actorsInDim(entries, dim) {
  let n = 0;
  for (const e of entries) {
    const k = wio.classifyKey(e.key);
    if (k.kind === 'digp' && k.dim === dim) n += e.value.length / 8;
  }
  return n;
}

async function main() {
  fs.mkdirSync(BUS, { recursive: true });
  // サーバーのワールド（A）と、取り込む配布マップ（B）。どちらも worldStartCount=-2 → 元の ID は衝突する
  const tplA = path.join(ROOT, 'template-A');
  const A = await makeWorld(tplA, { name: 'サーバー', seed: 11, worldStartCount: -2, dims: { 0: { chunks: grid(3), actorsPerChunk: 2 }, 1000: { chunks: grid(2, 10, 10), actorsPerChunk: 1 } } });
  const srcB = path.join(ROOT, 'src-B');
  const B = await makeWorld(srcB, { name: '取り込み元', seed: 22, worldStartCount: -2, spawn: { x: 20, y: 80, z: -4 }, dims: { 0: { chunks: grid(4, -2, -2), actorsPerChunk: 3 } } });
  const mcB = path.join(ROOT, 'B.mcworld');
  await zipDir(srcB, mcB);

  // 最小のバニラ風リソースパック（blocks.json / terrain_texture.json / PNG）
  const assets = path.join(ROOT, 'assets', 'resource_pack');
  fs.mkdirSync(path.join(assets, 'textures', 'blocks'), { recursive: true });
  fs.writeFileSync(path.join(assets, 'blocks.json'), '// comment\n{ "format_version": [1,1,0], "grass": { "textures": { "up": "grass_top", "down": "dirt", "side": "grass_side" } }, "stone": { "textures": "stone" }, "dirt": { "textures": "dirt" }, }');
  fs.writeFileSync(path.join(assets, 'textures', 'terrain_texture.json'), '{ "texture_data": { "grass_top": { "textures": ["textures/blocks/grass_top"] }, "grass_side": { "textures": [{ "path": "textures/blocks/grass_side" }] }, "stone": { "textures": "textures/blocks/stone" }, "dirt": { "textures": "textures/blocks/dirt" } } }');
  for (const [n, c] of [['grass_top', [128, 128, 128]], ['grass_side', [120, 90, 60]], ['stone', [125, 125, 125]], ['dirt', [134, 96, 67]]]) {
    const px = Buffer.alloc(16 * 16 * 4);
    for (let i = 0; i < 256; i++) px.set([...c, 255], i * 4);
    fs.writeFileSync(path.join(assets, 'textures', 'blocks', `${n}.png`), encodePng(16, 16, px));
  }
  const mainDir = mkInstance('main', 19132, 'Bedrock level');
  const limboDir = mkInstance('limbo', 19134, 'limbo');
  const worldDir = path.join(mainDir, 'worlds', 'Bedrock level');
  const cfgPath = path.join(ROOT, 'levikit.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      root: ROOT,
      assetsDir: assets,
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
  const env = { ...process.env, LEVIKIT_CONFIG: cfgPath, FAKE_BUS: BUS, LEVIKIT_METRICS_MS: '500', FAKE_WORLD_TEMPLATE: tplA };
  execFileSync(process.execPath, [path.join(PANEL, 'bin', 'passwd.js'), 'test-password-123'], { env });
  const panel = spawn(process.execPath, [path.join(PANEL, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let panelOut = '';
  panel.stdout.on('data', (d) => (panelOut += d));
  panel.stderr.on('data', (d) => (panelOut += d));
  await sleep(800);

  let cookie = '';
  const req = async (method, url, { json, raw } = {}) => {
    const headers = { 'x-levikit': '1', cookie };
    let body;
    if (raw) {
      headers['content-type'] = 'application/octet-stream';
      body = raw;
    } else if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const r = await fetch(`http://127.0.0.1:${PORT}${url}`, { method, headers, body });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return r;
  };
  const api = async (method, url, json) => {
    const r = await req(method, url, { json });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  const waitJob = async (label, { expectFail = false } = {}) => {
    for (let i = 0; i < 400; i++) {
      const st = await api('GET', '/api/state');
      if (st.job && st.job.status !== 'running') {
        if (expectFail) {
          if (st.job.status !== 'failed') throw new Error(`${label}: 失敗するはずが成功\n${st.job.log.join('\n')}`);
          return st.job;
        }
        if (st.job.status !== 'done') throw new Error(`${label} failed: ${st.job.error}\n${st.job.log.join('\n')}`);
        return st.job;
      }
      await sleep(250);
    }
    throw new Error(`${label} timeout`);
  };
  const kitFile = path.join(mainDir, 'plugins', 'levikit-core', 'config', 'config.json');
  const readKitFile = () => JSON.parse(fs.readFileSync(kitFile, 'utf8'));
  const dimIds = () => JSON.parse(fs.readFileSync(path.join(worldDir, 'dimension_config.json'), 'utf8')).dimensionList;
  const ok = (m) => console.log(`  ✔ ${m}`);
  const cmd = (c) => api('POST', '/api/main/command', { command: c });

  try {
    await api('POST', '/api/login', { password: 'test-password-123' });
    await api('POST', '/api/main/start');
    await waitJob('start');
    await cmd('join Alice');
    await cmd('join Bob');
    await sleep(500);
    await api('POST', '/api/backups', { note: '最初' });
    await waitJob('first backup');
    let entries = await dbEntries(path.join(worldDir, 'db'));
    assert(sameChunks(chunkMap(entries, 0), A.expected[0].chunks), 'template world in place');
    assert.strictEqual(dimIds()['levikit:resource'].dimId, 1000);
    ok('本物の LevelDB で擬似サーバー起動（既定のワールドを登録）');

    // ---------- .mcworld 取り込み ----------
    const q = new URLSearchParams({ file: 'B.mcworld', name: 'levikit:map', displayName: '配布マップ', generator: 'Void', sourceDim: '0' });
    let r = await req('POST', `/api/worlds/import?${q}`, { raw: fs.readFileSync(mcB) });
    assert(r.ok, `upload ${r.status} ${await r.text()}`);
    let job = await waitJob('import');
    const jl = job.log.join('\n');
    assert(/「取り込み元」/.test(jl) && /16 チャンク/.test(jl) && /エンティティ 48 体/.test(jl), jl);
    assert(/取り込み完了/.test(jl) && /limbo の 2 人を/.test(jl), `参加者は待機サーバー経由で戻る\n${jl}`);
    assert.strictEqual(job.result.info.levelName, '取り込み元');
    let kit = readKitFile();
    const md = kit.dimensions.find((x) => x.name === 'levikit:map');
    assert(md && md.generator === 'Void' && md.landing === 'fixed' && md.displayName === '配布マップ', JSON.stringify(md));
    assert.deepStrictEqual(md.spawn, { x: 20.5, y: 80, z: -3.5 });
    assert.deepStrictEqual(kit.pendingImports, []);
    assert.deepStrictEqual(fs.readdirSync(path.join(mainDir, 'plugins', 'levikit-core', 'data', 'imports')).filter((f) => f.endsWith('.lkdim')), [], 'package consumed');
    assert.deepStrictEqual(fs.readdirSync(path.join(ROOT, 'uploads')), [], 'upload removed');
    const mapId = dimIds()['levikit:map'].dimId;
    entries = await dbEntries(path.join(worldDir, 'db'));
    assert(sameChunks(chunkMap(entries, mapId), B.expected[0].chunks), '取り込んだチャンク = 配布マップ');
    assert(sameChunks(chunkMap(entries, 0), A.expected[0].chunks), '元のオーバーワールドはそのまま');
    assert(sameChunks(chunkMap(entries, 1000), A.expected[1000].chunks), '資源ワールドもそのまま');
    assert.strictEqual(actorsInDim(entries, mapId), 48);
    assert.strictEqual(checkActors(entries), 18 + 4 + 48, '元の ID が衝突していてもエンティティは全員残る');
    const resets = () => JSON.parse(fs.readFileSync(path.join(worldDir, 'levikit', 'resets.json'), 'utf8'));
    assert.strictEqual(resets()['levikit:map'].kind, 'import');
    ok(`.mcworld 取り込み → 新ワールド #${mapId}（参加したまま・エンティティ ID 振り直し）`);

    // 取り込みの検証
    r = await req('POST', `/api/worlds/import?${new URLSearchParams({ file: 'B.mcworld', name: 'levikit:map' })}`, { raw: fs.readFileSync(mcB) });
    assert(r.ok);
    job = await waitJob('dup import', { expectFail: true });
    assert(/すでにあります/.test(job.error), job.error);
    r = await req('POST', `/api/worlds/import?${new URLSearchParams({ file: 'x', name: 'Bad Name' })}`, { raw: fs.readFileSync(mcB) });
    job = await waitJob('bad name', { expectFail: true });
    assert(/namespace:name/.test(job.error));
    r = await req('POST', `/api/worlds/import?${new URLSearchParams({ file: 'x', name: 'levikit:junk' })}`, { raw: Buffer.from('not a zip file at all, definitely not') });
    job = await waitJob('junk', { expectFail: true });
    assert(!readKitFile().dimensions.some((x) => x.name === 'levikit:junk'), '壊れたファイルではワールドを追加しない');
    assert.deepStrictEqual(fs.readdirSync(path.join(ROOT, 'uploads')), []);
    ok('取り込みの検証（重複 ID・不正な ID・壊れたファイル）');

    // ---------- 書き出し ----------
    await api('POST', '/api/worlds/export', { key: 'levikit:map' });
    job = await waitJob('export');
    assert(job.result?.download, JSON.stringify(job.result));
    r = await req('GET', job.result.download);
    assert(r.ok && /attachment/.test(r.headers.get('content-disposition')));
    const outFile = path.join(ROOT, 'exported.mcworld');
    fs.writeFileSync(outFile, Buffer.from(await r.arrayBuffer()));
    const exDir = path.join(ROOT, 'exported');
    await extractZip(outFile, exDir);
    const exEntries = await dbEntries(path.join(exDir, 'db'));
    assert(sameChunks(chunkMap(exEntries, 0), B.expected[0].chunks), '書き出したワールド = 配布マップ');
    assert(exEntries.every((e) => ['actor', 'chunk', 'digp'].includes(wio.classifyKey(e.key).kind) && (wio.classifyKey(e.key).dim ?? 0) === 0));
    assert.strictEqual(checkActors(exEntries), 48);
    const li = wio.levelInfo(fs.readFileSync(path.join(exDir, 'level.dat')));
    assert.strictEqual(li.levelName, '配布マップ');
    assert(!(await api('GET', '/api/backups')).some((b) => b.type === 'export'), '書き出し用の一時バックアップは消える');
    r = await req('GET', '/api/exports/..%2Flevikit.json');
    assert.strictEqual(r.status, 400);
    ok('ワールド単位の書き出し（参加したまま → .mcworld ダウンロード）');

    // ---------- 複製 ----------
    await api('POST', '/api/worlds/clone', { from: 'levikit:map', to: 'levikit:map_copy', displayName: 'マップの写し' });
    job = await waitJob('clone');
    assert(/複製完了/.test(job.log.join('\n')));
    kit = readKitFile();
    const cd = kit.dimensions.find((x) => x.name === 'levikit:map_copy');
    assert(cd && cd.generator === 'Void' && cd.displayName === 'マップの写し' && cd.rules.gameMode === md.rules.gameMode);
    assert.deepStrictEqual(kit.pendingClones, []);
    const copyId = dimIds()['levikit:map_copy'].dimId;
    entries = await dbEntries(path.join(worldDir, 'db'));
    assert(sameChunks(chunkMap(entries, copyId), B.expected[0].chunks), '複製のチャンク = 元');
    assert(sameChunks(chunkMap(entries, mapId), B.expected[0].chunks), '複製元はそのまま');
    assert.strictEqual(actorsInDim(entries, copyId), 48);
    assert.strictEqual(checkActors(entries), 18 + 4 + 48 + 48);
    // バニラ（オーバーワールド）の複製: 生成タイプとシードを引き継ぐ
    await api('POST', '/api/worlds/clone', { from: 'overworld', to: 'levikit:ow_copy' });
    job = await waitJob('clone overworld');
    const oc = readKitFile().dimensions.find((x) => x.name === 'levikit:ow_copy');
    assert(oc.generator === 'Overworld' && oc.seed === 11, JSON.stringify(oc));
    entries = await dbEntries(path.join(worldDir, 'db'));
    assert(sameChunks(chunkMap(entries, dimIds()['levikit:ow_copy'].dimId), A.expected[0].chunks));
    await assert.rejects(api('POST', '/api/worlds/clone', { from: 'levikit:map', to: 'levikit:map_copy' }).then(() => waitJob('dup clone', { expectFail: true }).then((j) => Promise.reject(new Error(j.error)))), /すでにあります/);
    ok(`ワールドの複製（カスタム #${copyId}・オーバーワールド → 新ワールド、エンティティ ID は別）`);

    // ---------- ワールド単位の復元 ----------
    await api('POST', '/api/backups', { note: '復元テスト' });
    job = await waitJob('backup');
    const bkId = (await api('GET', '/api/backups')).find((b) => b.note === '復元テスト').id;
    await cmd(`deldim ${mapId}`); // 次の停止で levikit:map のサブチャンクを消す（＝ワールドが壊れた想定）
    await api('POST', '/api/main/restart', { standard: false });
    await waitJob('restart');
    entries = await dbEntries(path.join(worldDir, 'db'));
    assert(!sameChunks(chunkMap(entries, mapId), B.expected[0].chunks), '壊れた状態になっている');
    const copyBefore = chunkMap(entries, copyId);
    await api('POST', '/api/worlds/restore', { name: 'levikit:map', backupId: bkId });
    job = await waitJob('world restore');
    const wl = job.log.join('\n');
    assert(/現在の状態のバックアップ/.test(wl) && /復元完了/.test(wl), wl);
    entries = await dbEntries(path.join(worldDir, 'db'));
    assert(sameChunks(chunkMap(entries, mapId), B.expected[0].chunks), 'levikit:map だけが元に戻る');
    assert(sameChunks(chunkMap(entries, copyId), copyBefore), '他のワールドはそのまま');
    assert(sameChunks(chunkMap(entries, 0), A.expected[0].chunks));
    assert.strictEqual(actorsInDim(entries, mapId), 48);
    checkActors(entries);
    assert.strictEqual(resets()['levikit:map'].epoch, 2, 'epoch が増える（ログアウトしていた人はスポーンへ）');
    assert((await api('GET', '/api/backups')).some((b) => b.type === 'pre-restore' && /ワールド単位/.test(b.note)));
    // 含まれていないワールド / バニラ
    const oldBk = (await api('GET', '/api/backups')).find((b) => b.note === '最初').id;
    await api('POST', '/api/worlds/restore', { name: 'levikit:nope', backupId: bkId });
    job = await waitJob('restore unknown', { expectFail: true });
    assert(/ワールドがありません/.test(job.error));
    await api('POST', '/api/worlds/restore', { name: 'levikit:ow_copy', backupId: oldBk });
    job = await waitJob('restore missing', { expectFail: true });
    assert(/含まれていません/.test(job.error), job.error);
    ok('ワールド単位の復元（1つのワールドだけ巻き戻し、他はそのまま・事前バックアップ）');

    // ---------- マップ / タイムマシン（範囲ロールバック） ----------
    await api('POST', '/api/backups', { note: '荒らし前' });
    await waitJob('backup before grief');
    const before = (await api('GET', '/api/backups')).find((b) => b.note === '荒らし前').id;
    await api('POST', '/api/maps/render', { world: 'overworld', backupId: before });
    job = await waitJob('render before');
    await cmd('deldim 0'); // 次の停止でオーバーワールドのサブチャンクが消える（＝荒らされた想定）
    await api('POST', '/api/main/restart', { standard: false });
    await waitJob('restart (grief)');
    await api('POST', '/api/maps/render', { world: 'overworld' }); // 今の状態を撮って描く
    job = await waitJob('render now');
    const nowId = job.result.backupId;
    const maps = await api('GET', '/api/maps');
    assert(maps.some((m) => m.backupId === before && m.world === 'overworld') && maps.some((m) => m.backupId === nowId));
    r = await req('GET', `/api/maps/${before}/overworld.png`);
    assert(r.ok && r.headers.get('content-type') === 'image/png');
    const diff = await api('GET', `/api/maps/diff?world=overworld&a=${before}&b=${nowId}`);
    assert.strictEqual(diff.changed.length, 9, JSON.stringify(diff));
    // 2チャンクだけ戻す
    await api('POST', '/api/maps/rollback', { world: 'overworld', backupId: before, chunks: [[0, 0], [1, 2]] });
    job = await waitJob('rollback');
    assert(/ロールバック完了: 2 チャンク/.test(job.log.join('\n')), job.log.join('\n'));
    entries = await dbEntries(path.join(worldDir, 'db'));
    const ow = chunkMap(entries, 0);
    const inSel = (k) => ['0,0', '1,2'].includes(`${Buffer.from(k, 'hex').readInt32LE(0)},${Buffer.from(k, 'hex').readInt32LE(4)}`);
    for (const [k, v] of A.expected[0].chunks) {
      const tag = Buffer.from(k, 'hex')[8];
      if (inSel(k)) assert.strictEqual(ow.get(k), v, '選択範囲は元通り');
      else if (tag === 47) assert(!ow.has(k), '範囲外は荒らされたまま');
    }
    assert.strictEqual(actorsInDim(entries, 0), 18 - 4 + 4, 'エンティティ数（範囲内は当時の状態）');
    checkActors(entries);
    assert(sameChunks(chunkMap(entries, mapId), B.expected[0].chunks), '他のワールドはそのまま');
    assert((await api('GET', '/api/backups')).some((b) => /範囲ロールバック前/.test(b.note || '')));
    await api('POST', '/api/main/command', { command: 'join Dave' });
    await sleep(1800);
    const pos = await api('GET', '/api/pos');
    assert(pos.players.some((p) => p.n === 'Dave'), 'ライブ位置');
    ok('マップ描画・時点の差分・範囲ロールバック（オーバーワールドの2チャンクだけ過去へ）・ライブ位置');

    // ---------- ワールド別の滞在時間 ----------
    await cmd('goto Alice levikit:map');
    await sleep(400);
    await cmd('goto Alice overworld');
    await sleep(200);
    const ws = await api('GET', '/api/worlds/stats');
    assert(ws['levikit:map'] && ws['levikit:map'].totalMs >= 300 && ws['levikit:map'].visitors === 1, JSON.stringify(ws));
    const hist = await api('GET', '/api/players/history');
    assert(hist.find((h) => h.name === 'Alice').worldMs['levikit:map'] >= 300);
    const dd = await api('GET', '/api/dimensions');
    assert(dd.stats['levikit:map'].top[0].name === 'Alice');
    ok('ワールド別の滞在時間・訪問者');

    // ---------- バニラ（オーバーワールド）のワールド単位の復元 ----------
    await api('POST', '/api/worlds/restore', { name: 'overworld', backupId: before });
    job = await waitJob('restore overworld');
    entries = await dbEntries(path.join(worldDir, 'db'));
    assert(sameChunks(chunkMap(entries, 0), A.expected[0].chunks), 'オーバーワールドがまるごと荒らし前に戻る');
    assert(sameChunks(chunkMap(entries, mapId), B.expected[0].chunks), '他のワールドはそのまま');
    assert.strictEqual(actorsInDim(entries, 0), 18);
    checkActors(entries);
    ok('オーバーワールドのワールド単位の復元（他のワールドはそのまま）');

    // ---------- 専用のネザー・削除時のデータ消去 ----------
    let k1 = (await api('GET', '/api/dimensions')).kit;
    k1.dimensions.push({ ...k1.dimensions[0], name: 'levikit:res_nether', displayName: '資源ネザー', generator: 'Nether', spawn: { x: 0.5, y: 64, z: 0.5 }, landing: 'platform', rules: { ...k1.dimensions[0].rules, netherLink: '' } });
    k1.dimensions.find((x) => x.name === 'levikit:resource').rules.netherLink = 'levikit:res_nether';
    await api('PUT', '/api/dimensions', { kit: k1 });
    assert.strictEqual(readKitFile().dimensions.find((x) => x.name === 'levikit:resource').rules.netherLink, 'levikit:res_nether');
    k1.dimensions.find((x) => x.name === 'levikit:flat').rules.netherLink = 'levikit:resource';
    await assert.rejects(api('PUT', '/api/dimensions', { kit: k1 }), /ネザー型/);
    k1.dimensions.find((x) => x.name === 'levikit:flat').rules.netherLink = '';
    k1.dimensions.push({ ...k1.dimensions[0], name: 'levikit:bad', generator: 'Nether', spawn: { x: 0, y: 200, z: 0 } });
    await assert.rejects(api('PUT', '/api/dimensions', { kit: k1 }), /範囲外/);
    k1.dimensions.pop();
    k1.dimensions = k1.dimensions.filter((x) => x.name !== 'levikit:map_copy');
    await api('PUT', '/api/dimensions', { kit: k1, purge: ['levikit:map_copy', 'levikit:resource'] });
    assert.deepStrictEqual(readKitFile().pendingResets, ['levikit:map_copy'], '消したワールドだけがデータ消去の予約に入る');
    ok('ワールド専用のネザー（検証）・スポーン高さの検証・削除時のデータ消去予約');

    // ---------- アドオン（BDS 標準のパック）・実験的機能・Script API ----------
    const addonSrc = path.join(ROOT, 'addon-src');
    const bpUuid = '11111111-2222-3333-4444-555555555555';
    const rpUuid = '66666666-7777-8888-9999-aaaaaaaaaaaa';
    fs.mkdirSync(path.join(addonSrc, 'BP', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(addonSrc, 'RP'), { recursive: true });
    fs.writeFileSync(path.join(addonSrc, 'BP', 'manifest.json'), JSON.stringify({ format_version: 2, header: { name: '§aテスト BP', description: 'script', uuid: bpUuid, version: [1, 2, 3], min_engine_version: [1, 21, 0] }, modules: [{ type: 'script', language: 'javascript', uuid: '12121212-2222-3333-4444-555555555555', entry: 'scripts/main.js', version: [1, 0, 0] }], dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }, { module_name: '@minecraft/server-net', version: '1.0.0-beta' }] }));
    fs.writeFileSync(path.join(addonSrc, 'BP', 'scripts', 'main.js'), 'import { world } from "@minecraft/server";');
    fs.writeFileSync(path.join(addonSrc, 'RP', 'manifest.json'), JSON.stringify({ format_version: 2, header: { name: 'テスト RP', uuid: rpUuid, version: [1, 0, 0] }, modules: [{ type: 'resources', uuid: '67676767-7777-8888-9999-aaaaaaaaaaaa', version: [1, 0, 0] }] }));
    const mcaddon = path.join(ROOT, 'test.mcaddon');
    await zipDir(addonSrc, mcaddon);
    r = await req('POST', '/api/addons/upload?enable=1', { raw: fs.readFileSync(mcaddon) });
    assert(r.ok, await r.text());
    let ad = await api('GET', '/api/addons');
    const bp = ad.packs.find((p) => p.uuid === bpUuid);
    assert(bp && bp.enabled && bp.scripts && bp.name === 'テスト BP' && bp.scriptModules.includes('@minecraft/server-net'), JSON.stringify(bp));
    assert(ad.packs.find((p) => p.uuid === rpUuid && p.type === 'resource' && p.enabled));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(worldDir, 'world_behavior_packs.json'), 'utf8')), [{ pack_id: bpUuid, version: [1, 2, 3] }]);
    await api('PUT', '/api/addons/permissions', { modules: ['@minecraft/server', '@minecraft/server-net', 'evil/../x'] });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(mainDir, 'config', 'default', 'permissions.json'), 'utf8')).allowed_modules, ['@minecraft/server', '@minecraft/server-net']);
    await api('POST', '/api/addons/apply', { experiments: { gametest: true }, texturepackRequired: true });
    job = await waitJob('apply addons');
    ad = await api('GET', '/api/addons');
    assert(ad.experiments.gametest === true && ad.experiments.experiments_ever_used === true, JSON.stringify(ad.experiments));
    assert.strictEqual(ad.texturepackRequired, true);
    assert(fs.existsSync(path.join(worldDir, 'level.dat.levikit-bak')));
    await api('POST', '/api/addons/remove', { type: 'resource', dir: ad.packs.find((p) => p.uuid === rpUuid).dir });
    ad = await api('GET', '/api/addons');
    assert(!ad.packs.some((p) => p.uuid === rpUuid));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(worldDir, 'world_resource_packs.json'), 'utf8')), []);
    await assert.rejects(api('POST', '/api/addons/remove', { type: 'behavior', dir: '../../x' }), /不正/);
    ok('アドオン: .mcaddon 取り込み・有効化・Script API 許可・実験的機能（停止中に level.dat）・削除');

    // ---------- 観察ビュー（3D）・テクスチャ・PapyrusCS ----------
    await api('POST', '/api/view3d/prepare', {});
    job = await waitJob('prepare view');
    const vl = await api('GET', '/api/view3d/list');
    assert(vl.textures && vl.list.some((x) => x.backupId === job.result.backupId));
    const reg = await api('GET', `/api/view3d/region?b=${job.result.backupId}&w=overworld&cx=1&cz=1&r=1`);
    assert(reg.subchunks.length > 0 && reg.palette.includes('minecraft:grass_block'), `${reg.subchunks.length} ${reg.palette}`);
    const gf = reg.faces['minecraft:grass_block'];
    assert(gf && gf.up === 'textures/blocks/grass_top' && gf.tint, JSON.stringify(gf));
    r = await req('GET', `/api/tex/${gf.up}.png`);
    assert(r.ok && r.headers.get('content-type') === 'image/png');
    r = await req('GET', '/api/tex/textures/../../levikit.png');
    assert(!r.ok);
    const regMap = await api('GET', `/api/view3d/region?b=${job.result.backupId}&w=levikit:map&cx=0&cz=0&r=2`);
    assert(regMap.subchunks.length > 0, 'カスタムワールドも見られる');
    const pap = await api('GET', '/api/papyrus');
    assert.strictEqual(pap.installed, false);
    await api('POST', '/api/papyrus/render', { world: 'overworld' });
    job = await waitJob('papyrus', { expectFail: true });
    assert(/入っていません/.test(job.error));
    ok('観察ビュー: スナップショット → 3D 用ブロック取り出し（カスタムワールドも）・バニラテクスチャ・Papyrus 未導入の案内');

    // ---------- 権限グループ / 移動コマンド設定 ----------
    await api('PUT', '/api/access', { roles: [{ name: 'staff', members: 'Alice\nBob' }] });
    let k2 = (await api('GET', '/api/dimensions')).kit;
    k2.dimensions.find((x) => x.name === 'levikit:map').rules.allowedPlayers = ['@staff', 'Carol'];
    k2.tpaTimeoutSeconds = 3;
    k2.tpaCrossWorld = false;
    await api('PUT', '/api/dimensions', { kit: k2 });
    kit = readKitFile();
    assert.deepStrictEqual(kit.roles, [{ name: 'staff', members: ['Alice', 'Bob'] }]);
    assert.strictEqual(kit.tpaTimeoutSeconds, 10, 'tpa 有効時間は 10 秒以上');
    assert.strictEqual(kit.tpaCrossWorld, false);
    k2.dimensions.find((x) => x.name === 'levikit:map').rules.builders = ['@ghost'];
    await assert.rejects(api('PUT', '/api/dimensions', { kit: k2 }), /@ghost/);
    await assert.rejects(api('PUT', '/api/access', { roles: [] }), /@staff/, '使われているグループは消せない');
    await assert.rejects(api('PUT', '/api/access', { roles: [{ name: 'a b', members: [] }] }), /グループ名/);
    await assert.rejects(api('PUT', '/api/access', { maintenanceAllow: '@nobody' }), /@nobody/);
    ok('権限グループ（@名前 の参照検証）・/tpa 設定');
  } catch (e) {
    console.error(`\nFAILED: ${e.stack || e.message}`);
    console.error('--- panel output ---\n' + panelOut.slice(-3000));
    process.exitCode = 1;
  } finally {
    panel.kill('SIGTERM');
    await sleep(1500);
    await fsp.rm(ROOT, { recursive: true, force: true }).catch(() => {});
  }
  if (!process.exitCode) console.log('\nALL PASSED');
}

main();
