#!/usr/bin/env node
'use strict';
// テスト用の擬似 BDS(LeviLamina)。パネルの e2e テストで使う。
// - LeviLamina 風のカラー付きログ
// - save hold / query / resume（ファイル長は実サイズより短く報告して切り詰めを検証）
// - levikit transfer: 共有ディレクトリ(BUS)経由で別ポートの擬似サーバーへプレイヤーを移す
// - FAKE_WORLD_TEMPLATE を指定すると本物の LevelDB ワールドで動く（取り込み・複製・書き出しのテスト用）
//   その場合、起動時の pendingImports / pendingClones を levikit-core と同じ規則で LevelDB に適用する（JS で再現）
const fs = require('node:fs');
const path = require('node:path');

const cwd = process.cwd();
const props = Object.fromEntries(
  fs.readFileSync(path.join(cwd, 'server.properties'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.split('=').map((s) => s.trim()))
);
const port = props['server-port'];
const level = props['level-name'] || 'Bedrock level';
const BUS = process.env.FAKE_BUS;
const world = path.join(cwd, 'worlds', level);

const C = '\x1b[38;2;80;200;80m';
const R = '\x1b[0m';
const log = (msg, lvl = 'INFO', tag = 'Server') => {
  const t = new Date().toTimeString().slice(0, 8) + '.123';
  process.stdout.write(`${C}${t}${R} ${lvl} [${tag}] ${msg}\r\n`);
};

const players = new Map();
let deldim = null;
let held = false;
let queries = 0;

const TEMPLATE = process.env.FAKE_WORLD_TEMPLATE;
const REAL = !!TEMPLATE;
function ensureWorld() {
  if (fs.existsSync(path.join(world, 'level.dat'))) return;
  if (REAL) {
    fs.cpSync(TEMPLATE, world, { recursive: true });
    return;
  }
  fs.mkdirSync(path.join(world, 'db'), { recursive: true });
  fs.writeFileSync(path.join(world, 'level.dat'), 'LEVELDAT-' + level);
  fs.writeFileSync(path.join(world, 'levelname.txt'), level);
  fs.writeFileSync(path.join(world, 'dimension_config.json'), JSON.stringify({ version: 1, dimensionList: { 'levikit:resource': { dimId: 1000 } } }));
  fs.writeFileSync(path.join(world, 'db', 'CURRENT'), 'MANIFEST-000001\n');
  fs.writeFileSync(path.join(world, 'db', '000005.ldb'), 'A'.repeat(4000));
  fs.writeFileSync(path.join(world, 'db', '000003.log'), 'L'.repeat(1000));
}
ensureWorld();

function kitCfg() {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'plugins', 'levikit-core', 'config', 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}
function denied(name) {
  const c = kitCfg();
  if ((c.bans || []).some((b) => b.name === name && (!b.until || b.until > Date.now() / 1000))) return 'banned';
  if (c.maintenance && !(c.maintenanceAllow || []).includes(name)) return 'maintenance';
  return null;
}
function join(name) {
  const why = denied(name);
  players.set(name, { name, xuid: String(2535400000000000 + name.length) });
  log(`Player connected: ${name}, xuid: ${players.get(name).xuid}`);
  log(`Player Spawned: ${name} xuid: ${players.get(name).xuid}, pfid: abc`);
  if (why) {
    log(`@@LEVIKIT DENIED ${JSON.stringify({ name, reason: why })}`, 'INFO', 'levikit-core');
    setTimeout(() => leave(name), 100);
  } else log(`@@LEVIKIT JOIN ${JSON.stringify({ name })}`, 'INFO', 'levikit-core');
}
function leave(name) {
  const p = players.get(name);
  if (!p) return;
  players.delete(name);
  log(`Player disconnected: ${name}, xuid: ${p.xuid}, pfid: abc`);
}

log('Starting Server');
log('Version: 1.26.51.1');
log('LeviLamina 26.51.9 loaded', 'INFO', 'LeviLamina');
// 擬似 levikit-core: 起動時のリセット処理とワールド一覧
/** MoreDimensions と同じく、名前 → ID を dimension_config.json に記録して再利用する */
function registerDims() {
  // 設定ファイルが無ければ既定のワールド（levikit-core と同じ既定値）
  const c = require('../panel/lib/kit').normalizeKit(kitCfg());
  const file = path.join(world, 'dimension_config.json');
  let dc = { version: 1, dimensionList: {} };
  try {
    dc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  dc.dimensionList ??= {};
  let next = Math.max(999, ...Object.values(dc.dimensionList).map((x) => x.dimId || 0)) + 1;
  const ids = {};
  for (const d of (c.dimensions || []).filter((x) => x.enabled !== false)) {
    if (!dc.dimensionList[d.name]) dc.dimensionList[d.name] = { dimId: next++, sNbt: `{generatorType:"${d.generator}",seed:${d.seed}}` };
    ids[d.name] = dc.dimensionList[d.name].dimId;
  }
  fs.writeFileSync(file, JSON.stringify(dc));
  return ids;
}
function emitDims() {
  const c = require('../panel/lib/kit').normalizeKit(kitCfg());
  let resets = {};
  try {
    resets = JSON.parse(fs.readFileSync(path.join(world, 'levikit', 'resets.json'), 'utf8'));
  } catch {}
  const ids = registered;
  const dims = [
    { id: 0, key: 'overworld', display: 'オーバーワールド', custom: false, show: true, open: true, players: players.size, epoch: 0 },
    ...(c.dimensions || []).filter((d) => d.enabled !== false && ids[d.name] !== undefined).map((d) => ({ id: ids[d.name], key: d.name, display: d.displayName, custom: true, show: true, open: d.rules?.open !== false, players: 0, epoch: resets[d.name]?.epoch || 0 })),
  ];
  log(`@@LEVIKIT DIMS ${JSON.stringify(dims)}`, 'INFO', 'levikit-core');
}

function bumpEpoch(name, kind, n) {
  fs.mkdirSync(path.join(world, 'levikit'), { recursive: true });
  const f = path.join(world, 'levikit', 'resets.json');
  let resets = {};
  try {
    resets = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
  const epoch = (resets[name]?.epoch || 0) + 1;
  resets[name] = { epoch, resetAt: Math.floor(Date.now() / 1000), kind, deletedKeys: n };
  fs.writeFileSync(f, JSON.stringify(resets));
  return epoch;
}

/**
 * levikit-core の performPendingTransfers を JS で再現（本物の LevelDB に対して）
 *   取り込み: パッケージのキーに登録 ID を付けて書く（clearFirst なら先にそのディメンションを消す）
 *   複製   : 元ディメンションを取り出し、エンティティ ID を振り直して書く
 */
async function performTransfers() {
  const c = kitCfg();
  const imports = c.pendingImports || [];
  const clones = c.pendingClones || [];
  if (!imports.length && !clones.length) return;
  const { LevelDBReader, writeDatabase } = require('../panel/lib/leveldb');
  const wio = require('../panel/lib/worldio');
  const ids = registered;
  const dimOf = (n) => ({ overworld: 0, nether: 1, the_end: 2 })[n] ?? ids[n];
  const dbDir = path.join(world, 'db');
  const entries = new Map();
  for (const e of (await (await new LevelDBReader(dbDir).open()).collect(() => true)).values()) if (e.value) entries.set(e.key.toString('hex'), e);
  const put = (key, value) => entries.set(key.toString('hex'), { key, value });
  const clearDim = (dim) => {
    let n = 0;
    const actors = new Set();
    for (const [hex, e] of entries) {
      const k = wio.classifyKey(e.key);
      if ((k.kind === 'chunk' || k.kind === 'digp') && k.dim === dim) {
        if (k.kind === 'digp') for (let o = 0; o + 8 <= e.value.length; o += 8) actors.add(e.value.subarray(o, o + 8).toString('hex'));
        entries.delete(hex);
        n++;
      }
    }
    for (const a of actors) if (entries.delete(Buffer.concat([Buffer.from('actorprefix'), Buffer.from(a, 'hex')]).toString('hex'))) n++;
    return n;
  };
  const dataDir = path.join(cwd, 'plugins', 'levikit-core', 'data');
  for (const job of imports) {
    const t0 = Date.now();
    const dim = dimOf(job.name);
    if (!(dim > 2)) {
      log(`@@LEVIKIT IMPORT_FAILED ${JSON.stringify({ name: job.name, error: '取り込み先は登録済みのカスタムワールドだけです' })}`, 'INFO', 'levikit-core');
      continue;
    }
    const file = path.join(dataDir, job.file);
    let pkg;
    try {
      pkg = await wio.readPackage(file);
    } catch (e) {
      log(`@@LEVIKIT IMPORT_FAILED ${JSON.stringify({ name: job.name, error: e.message })}`, 'INFO', 'levikit-core');
      continue;
    }
    const deleted = job.clearFirst ? clearDim(dim) : 0;
    for (const ch of pkg.chunks) put(wio.chunkKey(ch.rest, dim), ch.value);
    for (const d of pkg.digps) put(wio.digpKey(d.xz, dim), d.value);
    for (const a of pkg.actors.values()) put(Buffer.concat([Buffer.from('actorprefix'), a.id]), a.value);
    const written = pkg.chunks.length + pkg.digps.length + pkg.actors.size;
    const epoch = bumpEpoch(job.name, 'import', written);
    fs.rmSync(file, { force: true });
    log(`@@LEVIKIT IMPORT ${JSON.stringify({ name: job.name, written, deleted, epoch, ms: Date.now() - t0 })}`, 'INFO', 'levikit-core');
  }
  for (const job of clones) {
    const t0 = Date.now();
    const from = dimOf(job.from);
    const to = dimOf(job.to);
    if (from === undefined || !(to > 2) || from === to) {
      log(`@@LEVIKIT CLONE_FAILED ${JSON.stringify({ from: job.from, to: job.to, error: '複製元/先が不正です' })}`, 'INFO', 'levikit-core');
      continue;
    }
    const pkg = wio.remapEntities(await wio.extractDimension(dbDir, from));
    const deleted = clearDim(to);
    for (const ch of pkg.chunks) put(wio.chunkKey(ch.rest, to), ch.value);
    for (const d of pkg.digps) put(wio.digpKey(d.xz, to), d.value);
    for (const a of pkg.actors.values()) put(Buffer.concat([Buffer.from('actorprefix'), a.id]), a.value);
    const written = pkg.chunks.length + pkg.digps.length + pkg.actors.size;
    const epoch = bumpEpoch(job.to, 'clone', written);
    log(`@@LEVIKIT CLONE ${JSON.stringify({ from: job.from, to: job.to, written, deleted, epoch, ms: Date.now() - t0 })}`, 'INFO', 'levikit-core');
  }
  const tmp = `${dbDir}.new`;
  fs.rmSync(tmp, { recursive: true, force: true });
  await writeDatabase(tmp, [...entries.values()], { compression: 'zlibraw' });
  fs.rmSync(dbDir, { recursive: true, force: true });
  fs.renameSync(tmp, dbDir);
  c.pendingImports = [];
  c.pendingClones = [];
  fs.writeFileSync(path.join(cwd, 'plugins', 'levikit-core', 'config', 'config.json'), JSON.stringify(c, null, 2));
}
(() => {
  const c = kitCfg();
  if (Array.isArray(c.pendingResets) && c.pendingResets.length) {
    fs.mkdirSync(path.join(world, 'levikit'), { recursive: true });
    let resets = {};
    try {
      resets = JSON.parse(fs.readFileSync(path.join(world, 'levikit', 'resets.json'), 'utf8'));
    } catch {}
    for (const n of c.pendingResets) {
      const epoch = (resets[n]?.epoch || 0) + 1;
      resets[n] = { epoch, resetAt: Math.floor(Date.now() / 1000), deletedKeys: 1234 };
      log(`@@LEVIKIT RESET ${JSON.stringify({ name: n, epoch, deletedKeys: 1234, scanned: 5000, ms: 42 })}`, 'INFO', 'levikit-core');
    }
    fs.writeFileSync(path.join(world, 'levikit', 'resets.json'), JSON.stringify(resets));
    c.pendingResets = [];
    fs.writeFileSync(path.join(cwd, 'plugins', 'levikit-core', 'config', 'config.json'), JSON.stringify(c, null, 2));
  }
})();
// 起動時にだけ登録する（MoreDimensions と同じ。再読み込みでは増えない）
const registered = registerDims();
let startedUp = Promise.resolve();
if (REAL) {
  startedUp = performTransfers().catch((e) => log(`transfer error: ${e.stack}`, 'ERROR', 'levikit-core'));
}
startedUp.then(() => {
  emitDims();
  log('@@LEVIKIT READY {"limbo":false}', 'INFO', 'levikit-core');
});
let posTick = 0;
setInterval(() => {
  if (!players.size) return;
  posTick++;
  const list = [...players.entries()].map(([n, p], i) => ({ n, w: p.world || 'overworld', x: Math.round(20 + 30 * Math.cos(posTick / 5 + i)), y: 70, z: Math.round(20 + 30 * Math.sin(posTick / 5 + i)) }));
  log(`@@LEVIKIT POS ${JSON.stringify(list)}`, 'INFO', 'levikit-core');
}, 1500);
setInterval(() => log(`@@LEVIKIT STATS ${JSON.stringify({ tps: 19.8, players: players.size, worlds: { overworld: players.size } })}`, 'INFO', 'levikit-core'), 1000);
startedUp.then(() => setTimeout(() => {
  log('Server started.');
  // 他サーバーから転送されてきたプレイヤーを受け入れる
  if (BUS) {
    setInterval(() => {
      const f = path.join(BUS, `${port}.json`);
      if (!fs.existsSync(f)) return;
      let list = [];
      try {
        list = JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch {
        return;
      }
      fs.rmSync(f, { force: true });
      for (const n of list) join(n);
    }, 300);
  }
}, 800));

let buf = '';
process.stdin.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    handle(line);
  }
});

async function deleteDimOnStop(dim) {
  const { LevelDBReader, writeDatabase } = require('../panel/lib/leveldb');
  const wio = require('../panel/lib/worldio');
  const dbDir = path.join(world, 'db');
  const all = [...(await (await new LevelDBReader(dbDir).open()).collect(() => true)).values()].filter((e) => e.value);
  const keep = all.filter((e) => {
    const k = wio.classifyKey(e.key);
    return !(k.kind === 'chunk' && k.dim === dim && k.tag === 47);
  });
  const tmp = `${dbDir}.new`;
  fs.rmSync(tmp, { recursive: true, force: true });
  await writeDatabase(tmp, keep, { compression: 'zlibraw' });
  fs.rmSync(dbDir, { recursive: true, force: true });
  fs.renameSync(tmp, dbDir);
}

function handle(line) {
  const [cmd, ...args] = line.split(/\s+/);
  if (cmd === 'stop') {
    log('Server stop requested.');
    log('Stopping server...');
    if (REAL && deldim) {
      deleteDimOnStop(Number(deldim)).finally(() => setTimeout(() => process.exit(0), 100));
      return;
    }
    setTimeout(() => process.exit(0), 300);
  } else if (cmd === 'join') {
    join(args[0]);
  } else if (cmd === 'leave') {
    leave(args[0]);
  } else if (line === 'save hold') {
    held = true;
    queries = 0;
    log('Saving...');
    // hold 中に書き込みが続いている想定でファイルを伸ばす
    if (!REAL) fs.appendFileSync(path.join(world, 'db', '000005.ldb'), 'GARBAGE');
  } else if (line === 'save query') {
    if (!held) return log('The command is already running', 'ERROR');
    queries++;
    if (queries < 2) return log('A previous save has not been completed.');
    log('Data saved. Files are now ready to be copied.');
    if (REAL) {
      const files = [];
      for (const f of fs.readdirSync(path.join(world, 'db'))) files.push(`${level}/db/${f}:${fs.statSync(path.join(world, 'db', f)).size}`);
      files.push(`${level}/level.dat:${fs.statSync(path.join(world, 'level.dat')).size}`);
      return log(files.join(', '));
    }
    const extra = fs.existsSync(path.join(world, 'db', '000009.ldb')) ? `, ${level}/db/000009.ldb:3000` : '';
    log(`${level}/db/000005.ldb:4000, ${level}/db/CURRENT:16, ${level}/db/000003.log:500, ${level}/level.dat:${9 + level.length}${extra}`);
  } else if (line === 'save resume') {
    held = false;
    log('Changes to the world are resumed.');
  } else if (cmd === 'levikit' && args[0] === 'transfer') {
    const [, host, toPort] = args;
    const names = [...players.keys()];
    log(`@@LEVIKIT TRANSFER ${JSON.stringify({ host, port: +toPort, count: names.length })}`, 'INFO', 'levikit-core');
    if (BUS) fs.writeFileSync(path.join(BUS, `${toPort}.json`), JSON.stringify(names));
    setTimeout(() => names.forEach(leave), 200);
  } else if (cmd === 'levikit' && args[0] === 'players') {
    log(`@@LEVIKIT PLAYERS ${JSON.stringify([...players.values()].map((p) => ({ ...p, dim: 0, pos: [0, 64, 0] })))}`, 'INFO', 'levikit-core');
  } else if (cmd === 'chat') {
    log(`@@LEVIKIT CHAT ${JSON.stringify({ name: args[0], message: args.slice(1).join(' ') })}`, 'INFO', 'levikit-core');
  } else if (cmd === 'levikit' && args[0] === 'save') {
    fs.mkdirSync(path.join(world, 'levikit'), { recursive: true });
    fs.writeFileSync(path.join(world, 'levikit', 'inventory_groups.json'), JSON.stringify({ saved: Date.now() }));
    log('ok', 'INFO', 'Server');
  } else if (cmd === 'levikit' && args[0] === 'reload') {
    for (const n of [...players.keys()]) if (denied(n)) leave(n);
    emitDims();
    log(`@@LEVIKIT RELOADED {}`, 'INFO', 'levikit-core');
  } else if (cmd === 'levikit' && args[0] === 'motd') {
    log(`motd set: ${args.slice(1).join(' ')}`);
  } else if (cmd === 'levikit' && args[0] === 'dims') {
    emitDims();
  } else if (cmd === 'goto') {
    // テスト用: プレイヤーのワールド移動（levikit-core の WORLD_CHANGE）
    const p = players.get(args[0]);
    if (p) {
      log(`@@LEVIKIT WORLD_CHANGE ${JSON.stringify({ player: args[0], from: p.world || '', to: args[1] })}`, 'INFO', 'levikit-core');
      p.world = args[1];
    }
  } else if (cmd === 'deldim') {
    // テスト用: ディメンションのデータを壊す（ワールド単位の復元のテスト）… 停止時に反映
    deldim = args[0];
    log('ok');
  } else if (cmd === 'tpdim') {
    log(`[tpdim] ${args.join(' ')}`);
  } else if (cmd === 'tellraw' || cmd === 'title') {
    log(`[${cmd}] ${args.join(' ')}`);
  } else if (cmd === 'touch') {
    // テスト用: ワールドの一部だけ変更する
    fs.writeFileSync(path.join(world, 'db', '000009.ldb'), 'N'.repeat(3000));
  } else if (cmd === 'say') {
    log(`[Server] ${args.join(' ')}`, 'INFO', 'Chat');
  } else {
    log(`Unknown command: ${cmd}`);
  }
}
