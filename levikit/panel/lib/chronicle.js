'use strict';
// タイムマシン: バックアップの「一部の範囲（チャンク）だけ」を今のワールドへ戻す
//   メインサーバー停止中（参加者は待機サーバー）に LevelDB を直接書き換える → オーバーワールドも含めどの次元でも可
//   1. バックアップから対象チャンクの全タグ・そのチャンクのエンティティを取り出す（ID は振り直し）
//   2. 今のワールドから対象チャンクの全タグ・そこにいるエンティティを消す
//   3. 1 を書き込み、新しい LevelDB を作って差し替える（元の db は .rollback-old に退避 → 成功したら削除）
const fsp = require('node:fs/promises');
const path = require('node:path');
const { LevelDBReader, writeDatabase } = require('./leveldb');
const { classifyKey, chunkKey, digpKey, remapEntities } = require('./worldio');

const ACTOR = Buffer.from('actorprefix');

function chunkId(rest) {
  return `${rest.readInt32LE(0)},${rest.readInt32LE(4)}`;
}

/** db から対象チャンクを取り出す → worldio のパッケージ形式 */
async function extractChunks(dbDir, dim, wanted, onProgress) {
  const r = await new LevelDBReader(dbDir).open();
  const all = await r.collect(() => true, onProgress);
  const pkg = { chunks: [], digps: [], actors: new Map(), stats: {} };
  const actorKeys = new Set();
  for (const e of all.values()) {
    if (!e.value) continue;
    const c = classifyKey(e.key);
    if (c.kind === 'chunk' && c.dim === dim && wanted.has(`${c.x},${c.z}`)) pkg.chunks.push({ rest: c.rest, tag: c.tag, value: e.value });
    else if (c.kind === 'digp' && c.dim === dim && wanted.has(`${c.x},${c.z}`)) {
      pkg.digps.push({ xz: c.rest, value: e.value });
      for (let o = 0; o + 8 <= e.value.length; o += 8) actorKeys.add(e.value.subarray(o, o + 8).toString('hex'));
    }
  }
  for (const hex of actorKeys) {
    const e = all.get(Buffer.concat([ACTOR, Buffer.from(hex, 'hex')]).toString('hex'));
    if (e?.value) pkg.actors.set(hex, { id: Buffer.from(hex, 'hex'), value: e.value });
  }
  return pkg;
}

/**
 * @param liveDb   今のワールドの db（サーバー停止中）
 * @param backupDb 展開したバックアップの db
 * @param liveDim / backupDim  次元 ID（カスタムは両者で違うことがある）
 * @param chunks   [[cx, cz], ...]
 */
async function rollbackChunks({ liveDb, backupDb, liveDim, backupDim, chunks, log = () => {} }) {
  // chunks === 'all' はその次元まるごと（ワールド単位の復元）
  const all = chunks === 'all';
  const set = all ? null : new Set(chunks.map(([x, z]) => `${x},${z}`));
  const wanted = { has: (id) => all || set.has(id), get size() { return all ? 'すべての' : set.size; } };
  log(`バックアップから ${wanted.size} チャンクを取り出し中…`);
  const pkg = remapEntities(await extractChunks(backupDb, backupDim, wanted));
  log(`取り出し: ${pkg.chunks.length} キー / エンティティ ${pkg.actors.size} 体`);

  log('今のワールドを読み込み中…');
  const r = await new LevelDBReader(liveDb).open();
  const live = await r.collect(() => true);
  const out = new Map();
  const dropActors = new Set();
  let removed = 0;
  for (const [hex, e] of live) {
    if (!e.value) continue;
    const c = classifyKey(e.key);
    if (c.kind === 'chunk' && c.dim === liveDim && wanted.has(`${c.x},${c.z}`)) {
      removed++;
      continue;
    }
    if (c.kind === 'digp' && c.dim === liveDim && wanted.has(`${c.x},${c.z}`)) {
      for (let o = 0; o + 8 <= e.value.length; o += 8) dropActors.add(e.value.subarray(o, o + 8).toString('hex'));
      removed++;
      continue;
    }
    out.set(hex, e);
  }
  for (const a of dropActors) if (out.delete(Buffer.concat([ACTOR, Buffer.from(a, 'hex')]).toString('hex'))) removed++;
  const put = (key, value) => out.set(key.toString('hex'), { key, value });
  for (const c of pkg.chunks) put(chunkKey(c.rest, liveDim), c.value);
  for (const d of pkg.digps) put(digpKey(d.xz, liveDim), d.value);
  for (const a of pkg.actors.values()) put(Buffer.concat([ACTOR, a.id]), a.value);

  const tmp = `${liveDb}.rollback-new`;
  const old = `${liveDb}.rollback-old`;
  await fsp.rm(tmp, { recursive: true, force: true });
  await fsp.rm(old, { recursive: true, force: true });
  log(`新しいデータベースを書き込み中（${out.size} キー）…`);
  await writeDatabase(tmp, [...out.values()], { compression: 'zlibraw' });
  // 書いたものを読み直して確かめてから差し替える
  const check = await (await new LevelDBReader(tmp).open()).collect(() => true);
  if ([...check.values()].filter((e) => e.value).length !== out.size) throw new Error('書き込んだデータベースの検証に失敗しました（元のまま）');
  await fsp.rename(liveDb, old);
  await fsp.rename(tmp, liveDb);
  await fsp.rm(old, { recursive: true, force: true });
  const restoredChunks = new Set(pkg.chunks.map((c) => `${c.rest.readInt32LE(0)},${c.rest.readInt32LE(4)}`)).size;
  return { restoredKeys: pkg.chunks.length + pkg.digps.length + pkg.actors.size, removedKeys: removed, actors: pkg.actors.size, chunks: all ? restoredChunks : set.size };
}

module.exports = { rollbackChunks, extractChunks, chunkId };
