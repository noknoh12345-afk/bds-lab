'use strict';
// テスト用の合成ワールド（本物の統合版と同じキー形式・NBT・エンティティ ID 規則）
//   チャンク: tag 44(バージョン) / 47(サブチャンク) / 43(Data3D) / 54(FinalizedState)
//   エンティティ: actorprefix + ストレージキー、digp、NBT に UniqueID / StorageKey / LinksTag
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeDatabase } = require('../../panel/lib/leveldb');
const nbt = require('../../panel/lib/nbt');
const { chunkKey, digpKey, storageKeyOf } = require('../../panel/lib/worldio');

const i32 = (v) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(v);
  return b;
};

function rest(x, z, tag, sub) {
  const parts = [i32(x), i32(z), Buffer.from([tag])];
  if (sub !== undefined) parts.push(Buffer.from([sub & 0xff]));
  return Buffer.concat(parts);
}

/** 決まった乱数（seed から）で値を作る → 同じ入力なら同じワールド */
function prng(seed) {
  let s = BigInt(seed) || 1n;
  return (n) => {
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      s ^= s << 13n;
      s ^= s >> 7n;
      s ^= s << 17n;
      s &= 0xffffffffffffffffn;
      out[i] = Number(s & 0xffn);
    }
    return out;
  };
}

/** 本物と同じ形式のサブチャンク（version 9, 4bit パレット）: 下から stone / dirt / grass_block / air */
function subchunkV9(y, salt) {
  const names = ['minecraft:air', 'minecraft:stone', 'minecraft:dirt', 'minecraft:grass_block', 'minecraft:oak_log'];
  const words = Buffer.alloc((4096 / 8) * 4);
  for (let i = 0; i < 4096; i++) {
    const ly = i & 15;
    const wy = y * 16 + ly;
    const top = 60 + ((i >> 8) + ((i >> 4) & 15) + salt) % 4;
    const v = wy < top - 3 ? 1 : wy < top ? 2 : wy === top ? 3 : wy === top + 1 && (i & 0xff) === 0x88 ? 4 : 0;
    const w = Math.floor(i / 8);
    words.writeUInt32LE((words.readUInt32LE(w * 4) | (v << ((i % 8) * 4))) >>> 0, w * 4);
  }
  const cnt = Buffer.alloc(4);
  cnt.writeInt32LE(names.length);
  const pal = names.map((n) => nbt.writeRoot({ type: 'compound', value: { name: { type: 'string', value: n }, states: { type: 'compound', value: {} }, version: { type: 'int', value: 18100000 } } }, ''));
  return Buffer.concat([Buffer.from([9, 1, y & 0xff, 4 << 1]), words, cnt, ...pal]);
}

function actorNbt({ uid, key, identifier, pos, links = [], leasher }) {
  const v = {
    identifier: { type: 'string', value: identifier },
    Pos: { type: 'list', value: { elementType: 'float', items: pos } },
    UniqueID: { type: 'long', value: uid },
    Health: { type: 'short', value: 10 },
    CustomName: { type: 'string', value: `mob-${uid & 0xffffn}` },
    internalComponents: { type: 'compound', value: { EntityStorageKeyComponent: { type: 'compound', value: { StorageKey: { type: 'string', value: key } } } } },
  };
  if (links.length) v.LinksTag = { type: 'list', value: { elementType: 'compound', items: links.map((id, i) => ({ entityID: { type: 'long', value: id }, LinkID: { type: 'int', value: i } })) } };
  if (leasher !== undefined) v.LeasherID = { type: 'long', value: leasher };
  return nbt.writeRoot({ type: 'compound', value: v }, '');
}

function levelDat({ name, spawn, worldStartCount, seed }) {
  const v = {
    LevelName: { type: 'string', value: name },
    SpawnX: { type: 'int', value: spawn.x },
    SpawnY: { type: 'int', value: spawn.y },
    SpawnZ: { type: 'int', value: spawn.z },
    Generator: { type: 'int', value: 1 },
    RandomSeed: { type: 'long', value: BigInt(seed) },
    StorageVersion: { type: 'int', value: 10 },
    worldStartCount: { type: 'long', value: BigInt.asUintN(32, BigInt(worldStartCount)) },
    lastOpenedWithVersion: { type: 'list', value: { elementType: 'int', items: [1, 26, 51, 1, 0] } },
  };
  return nbt.writeLevelDat({ version: 10, name: '', tag: { type: 'compound', value: v } });
}

/**
 * ワールドフォルダを作る
 * @param dir 出力先（level.dat と db/ を作る）
 * @param opts.dims { [dimId]: { chunks: [[x,z],...], actorsPerChunk } }
 * @returns { expected: { [dimId]: { chunks: Map(restHex -> valueHex), actors: [{uid, key}] } } }
 */
async function makeWorld(dir, { name = 'Synthetic', seed = 1, worldStartCount = -2, spawn = { x: 8, y: 70, z: 8 }, dims = { 0: { chunks: [[0, 0]], actorsPerChunk: 1 } } } = {}) {
  const rand = prng(seed);
  const entries = [];
  const expected = {};
  const hi = BigInt.asUintN(32, BigInt(worldStartCount));
  let counter = 1n;
  for (const [dimStr, d] of Object.entries(dims)) {
    const dim = Number(dimStr);
    const exp = { chunks: new Map(), actors: [] };
    expected[dim] = exp;
    for (const [x, z] of d.chunks) {
      const put = (r, value) => {
        entries.push({ key: chunkKey(r, dim), value });
        exp.chunks.set(r.toString('hex'), value.toString('hex'));
      };
      put(rest(x, z, 44), Buffer.from([40]));
      put(rest(x, z, 54), i32(2));
      put(rest(x, z, 43), rand(600));
      for (let y = -4; y < 4; y++) put(rest(x, z, 47, y), subchunkV9(y, (x * 7 + z * 3 + seed) & 3));
      // エンティティ（2体目以降は1体目に乗っている = LinksTag で参照）
      const keys = [];
      const uids = [];
      for (let i = 0; i < (d.actorsPerChunk || 0); i++) {
        const uid = BigInt.asIntN(64, (hi << 32n) | counter++);
        uids.push(uid);
      }
      uids.forEach((uid, i) => {
        const key = storageKeyOf(uid);
        keys.push(key);
        const links = i === 0 ? uids.slice(1) : [];
        const value = actorNbt({ uid, key, identifier: i === 0 ? 'minecraft:horse' : 'minecraft:zombie', pos: [x * 16 + 8, 64, z * 16 + 8], links, leasher: i === 1 ? uids[0] : undefined });
        entries.push({ key: Buffer.concat([Buffer.from('actorprefix'), key]), value });
        exp.actors.push({ uid, key: key.toString('hex') });
      });
      if (keys.length) entries.push({ key: digpKey(Buffer.concat([i32(x), i32(z)]), dim), value: Buffer.concat(keys) });
    }
  }
  // ディメンション外のデータ（取り込み・書き出しで混ざらないこと）
  entries.push({ key: Buffer.from('~local_player'), value: Buffer.from('player-data') });
  entries.push({ key: Buffer.from('game_flatworldlayers'), value: Buffer.from('[7,3,3,2]') });
  await fsp.mkdir(dir, { recursive: true });
  await writeDatabase(path.join(dir, 'db'), entries, { compression: 'zlibraw' });
  await fsp.writeFile(path.join(dir, 'level.dat'), levelDat({ name, spawn, worldStartCount, seed }));
  await fsp.writeFile(path.join(dir, 'levelname.txt'), name);
  return { expected, worldStartCount };
}

module.exports = { makeWorld, actorNbt, rest, i32, randomBytes: crypto.randomBytes };
