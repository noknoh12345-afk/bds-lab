'use strict';
// ワールド(ディメンション)単位の取り出し・パッケージ化・.mcworld 書き出し/取り込み
//
// LevelDB のキー
//   チャンク : [x:i32][z:i32][dim:i32 (0以外)][tag:u8][subchunk:i8 (tag=47)]
//   digp    : "digp" [x][z][dim (0以外)]  値 = エンティティのストレージキー(8byte) の並び
//   エンティティ: "actorprefix" + ストレージキー(8byte)  ※ストレージキーと UniqueID の関係は storageKeyOf を参照
//
// パッケージ (.lkdim) … levikit-core が起動時に読み込んで、指定ディメンションの ID を付けて書き込む
//   形式は writePackage を参照（zlib 圧縮フレーム）
//   entry: u8 kind(1=chunk 2=digp 3=actor) u32 klen key u32 vlen value
//   chunk の key は dim を除いた形（x z tag [sub]）、digp は x z、actor は 8byte のストレージキー
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { LevelDBReader, writeDatabase } = require('./leveldb');
const nbt = require('./nbt');
const { extractZip, zipDir } = require('./zip');

const MAX_CHUNK = 1875000; // ±30,000,000 / 16
const STRING_PREFIXES = ['map_', 'player', 'actorprefix', 'digp', 'VILLAGE', 'tickingarea', 'structuretemplate', '~local', 'portals', 'scoreboard', 'schedulerWT', 'mobevents', 'BiomeData', 'Overworld', 'Nether', 'TheEnd', 'AutonomousEntities', 'dimension', 'LevelChunkMetaDataDictionary', 'game_'];

const isChunkTag = (t) => (t >= 43 && t <= 65) || t === 118;

/** キーを分類する */
function classifyKey(key) {
  const n = key.length;
  if (n === 9 || n === 10 || n === 13 || n === 14) {
    const x = key.readInt32LE(0);
    const z = key.readInt32LE(4);
    const hasDim = n >= 13;
    const tag = key[hasDim ? 12 : 8];
    if (Math.abs(x) <= MAX_CHUNK && Math.abs(z) <= MAX_CHUNK && isChunkTag(tag) && (n === 9 || n === 13 || tag === 47)) {
      const s = key.toString('latin1');
      if (!STRING_PREFIXES.some((p) => s.startsWith(p))) {
        return { kind: 'chunk', x, z, dim: hasDim ? key.readInt32LE(8) : 0, tag, rest: Buffer.concat([key.subarray(0, 8), key.subarray(hasDim ? 12 : 8)]) };
      }
    }
  }
  if ((n === 12 || n === 16) && key.toString('latin1', 0, 4) === 'digp') {
    return { kind: 'digp', x: key.readInt32LE(4), z: key.readInt32LE(8), dim: n === 16 ? key.readInt32LE(12) : 0, rest: key.subarray(4, 12) };
  }
  if (n === 19 && key.toString('latin1', 0, 11) === 'actorprefix') return { kind: 'actor', id: key.subarray(11) };
  return { kind: 'other' };
}

function chunkKey(rest, dim) {
  // rest = x z tag [sub]
  if (dim === 0) return Buffer.from(rest);
  const d = Buffer.alloc(4);
  d.writeInt32LE(dim);
  return Buffer.concat([rest.subarray(0, 8), d, rest.subarray(8)]);
}

function digpKey(xz, dim) {
  const parts = [Buffer.from('digp'), xz];
  if (dim !== 0) {
    const d = Buffer.alloc(4);
    d.writeInt32LE(dim);
    parts.push(d);
  }
  return Buffer.concat(parts);
}

/** db から指定ディメンションのチャンク・digp・そこにいるエンティティを取り出す */
async function extractDimension(dbDir, dimId, { onProgress } = {}) {
  const reader = await new LevelDBReader(dbDir).open();
  const pass1 = await reader.collect((k) => {
    const c = classifyKey(k);
    return (c.kind === 'chunk' || c.kind === 'digp') && c.dim === dimId;
  }, onProgress && ((i, n) => onProgress(`読み込み 1/2: ${i}/${n}`)));
  const chunks = [];
  const digps = [];
  const wanted = new Set();
  for (const { key, value } of pass1.values()) {
    const c = classifyKey(key);
    if (c.kind === 'chunk') chunks.push({ rest: c.rest, tag: c.tag, x: c.x, z: c.z, value });
    else {
      digps.push({ xz: c.rest, value });
      for (let off = 0; off + 8 <= value.length; off += 8) wanted.add(value.subarray(off, off + 8).toString('hex'));
    }
  }
  const actors = new Map();
  if (wanted.size) {
    const reader2 = await new LevelDBReader(dbDir).open();
    const pass2 = await reader2.collect((k) => k.length === 19 && k.toString('latin1', 0, 11) === 'actorprefix' && wanted.has(k.subarray(11).toString('hex')), onProgress && ((i, n) => onProgress(`読み込み 2/2: ${i}/${n}`)));
    for (const { key, value } of pass2.values()) actors.set(key.subarray(11).toString('hex'), { id: key.subarray(11), value });
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of chunks) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.z < minZ) minZ = c.z;
    if (c.z > maxZ) maxZ = c.z;
  }
  const chunkSet = new Set(chunks.filter((c) => c.tag === 44 || c.tag === 118).map((c) => `${c.x},${c.z}`));
  return {
    chunks,
    digps,
    actors,
    stats: {
      keys: chunks.length,
      chunks: chunkSet.size,
      digps: digps.length,
      actors: actors.size,
      bounds: chunks.length ? { minX: minX * 16, maxX: maxX * 16 + 15, minZ: minZ * 16, maxZ: maxZ * 16 + 15 } : null,
      readerMode: reader.mode,
    },
  };
}

// ---- エンティティ ID ----
// 統合版の UniqueID (i64) = [上位32bit: worldStartCount（負の値・起動ごとに 1 減る）][下位32bit: カウンタ]
// ストレージキー(8byte) = big-endian の ((-上位) << 32 | 下位)
//   … "actorprefix" の後ろ・digp の中身・NBT の internalComponents.EntityStorageKeyComponent.StorageKey に入る
// 振り直す ID は上位32bit を正の値にする → ゲームが新しく作る ID（上位が負）とは絶対にぶつからない

/** UniqueID (BigInt) → ストレージキー (Buffer 8byte) */
function storageKeyOf(uid) {
  let u = BigInt.asUintN(64, BigInt(uid));
  const lo = u & 0xffffffffn;
  u = BigInt.asUintN(64, 2n * lo - u); // 下位はそのまま、上位を符号反転
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(u);
  return b;
}

function randomUid(used) {
  for (;;) {
    const hi = 0x10000000 + crypto.randomInt(0x30000000);
    const lo = crypto.randomBytes(4).readUInt32LE(0) || 1;
    const uid = (BigInt(hi) << 32n) | BigInt(lo);
    const k = uid.toString();
    if (!used.has(k)) {
      used.add(k);
      return uid;
    }
  }
}

function setStorageKey(compound, key) {
  compound.internalComponents ??= { type: 'compound', value: {} };
  if (compound.internalComponents.type !== 'compound') return;
  const ic = compound.internalComponents.value;
  ic.EntityStorageKeyComponent ??= { type: 'compound', value: {} };
  if (ic.EntityStorageKeyComponent.type !== 'compound') return;
  ic.EntityStorageKeyComponent.value.StorageKey = { type: 'string', value: Buffer.from(key) };
}

/**
 * エンティティ ID を振り直す（別ワールド・別ディメンションへ入れても ID がぶつからないように）
 *   NBT の UniqueID / StorageKey、actorprefix のキー、digp の一覧を揃えて書き換え、
 *   乗り物(LinksTag)・リード(LeasherID)の参照も新しい ID に付け替える
 *   旧形式（1.18.30 より前）: チャンクの tag 50 に連結されたエンティティも同様
 *   読めない NBT のエンティティは捨てる（ゲームも読めないため）
 */
function remapEntities(pkg) {
  const used = new Set();
  const uidMap = new Map(); // 旧 UniqueID(文字列) -> 新 UniqueID
  const keyMap = new Map(); // 旧ストレージキー(hex) -> 新ストレージキー
  const parsed = [];
  let dropped = 0;
  for (const [hex, a] of pkg.actors) {
    let root;
    try {
      root = nbt.readRoot(a.value);
    } catch {
      dropped++;
      continue;
    }
    const uid = randomUid(used);
    const old = root.tag.value.UniqueID;
    if (old?.type === 'long') uidMap.set(old.value.toString(), uid);
    keyMap.set(hex, storageKeyOf(uid));
    parsed.push({ hex, root, uid });
  }
  // 旧形式のエンティティ（チャンク内 tag 50）も先に ID を決める（乗り物の参照がチャンクをまたぐため）
  const legacy = new Map(); // chunk index -> roots
  pkg.chunks.forEach((c, i) => {
    if (c.tag !== 50 || !c.value.length) return;
    try {
      const roots = nbt.readAll(c.value);
      for (const r of roots) {
        r.uid = randomUid(used);
        const old = r.tag.value.UniqueID;
        if (old?.type === 'long') uidMap.set(old.value.toString(), r.uid);
      }
      legacy.set(i, roots);
    } catch {
      /* 読めない旧形式データはそのまま */
    }
  });
  const fixRef = (tag) => {
    if (tag?.type !== 'long') return;
    const n = uidMap.get(tag.value.toString());
    if (n !== undefined) tag.value = n;
  };
  const fixRefs = (compound) => {
    if (compound.LinksTag?.type === 'list') {
      for (const l of compound.LinksTag.value.items) if (l && typeof l === 'object') fixRef(l.entityID);
    }
    fixRef(compound.LeasherID);
  };

  const actors = new Map();
  for (const { hex, root, uid } of parsed) {
    const t = root.tag.value;
    const key = keyMap.get(hex);
    t.UniqueID = { type: 'long', value: uid };
    setStorageKey(t, key);
    fixRefs(t);
    actors.set(key.toString('hex'), { id: key, value: nbt.writeRoot(root.tag, root.name) });
  }
  const digps = [];
  for (const d of pkg.digps) {
    const parts = [];
    for (let off = 0; off + 8 <= d.value.length; off += 8) {
      const nk = keyMap.get(d.value.subarray(off, off + 8).toString('hex'));
      if (nk) parts.push(nk); // 実体の無い ID は落とす
    }
    if (parts.length) digps.push({ xz: d.xz, value: Buffer.concat(parts) });
  }
  const chunks = pkg.chunks.map((c, i) => {
    const roots = legacy.get(i);
    if (!roots) return c;
    for (const r of roots) {
      r.tag.value.UniqueID = { type: 'long', value: r.uid };
      fixRefs(r.tag.value);
    }
    return { ...c, value: Buffer.concat(roots.map((r) => nbt.writeRoot(r.tag, r.name))) };
  });
  return { ...pkg, chunks, digps, actors, stats: { ...pkg.stats, actors: actors.size, digps: digps.length, actorsDropped: dropped } };
}

/**
 * パッケージをファイルに書く（v2: 約4MBごとに zlib 圧縮したフレームで保存）
 *   "LKDIM\x02\0\0" u32 version=2 u32 count
 *   frame: u32 compressedLen u32 rawLen bytes(zlib)  … 中身はエントリの連結
 *   entry: u8 kind u32 klen key u32 vlen value
 */
async function writePackage(pkg, file, { frameSize = 4 * 1024 * 1024 } = {}) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'w');
  try {
    const count = pkg.chunks.length + pkg.digps.length + pkg.actors.size;
    const head = Buffer.alloc(16);
    Buffer.from('LKDIM\x02\0\0', 'latin1').copy(head, 0);
    head.writeUInt32LE(2, 8);
    head.writeUInt32LE(count, 12);
    fs.writeSync(fd, head);
    let parts = [];
    let size = 0;
    const flush = () => {
      if (!size) return;
      const raw = Buffer.concat(parts);
      const comp = zlib.deflateSync(raw, { level: 6 });
      const fh = Buffer.alloc(8);
      fh.writeUInt32LE(comp.length, 0);
      fh.writeUInt32LE(raw.length, 4);
      fs.writeSync(fd, fh);
      fs.writeSync(fd, comp);
      parts = [];
      size = 0;
    };
    const entry = (kind, key, value) => {
      const h = Buffer.alloc(5);
      h[0] = kind;
      h.writeUInt32LE(key.length, 1);
      const vl = Buffer.alloc(4);
      vl.writeUInt32LE(value.length);
      parts.push(h, key, vl, value);
      size += 9 + key.length + value.length;
      if (size >= frameSize) flush();
    };
    for (const c of pkg.chunks) entry(1, c.rest, c.value);
    for (const d of pkg.digps) entry(2, d.xz, d.value);
    for (const a of pkg.actors.values()) entry(3, a.id, a.value);
    flush();
  } finally {
    fs.closeSync(fd);
  }
  return (await fsp.stat(file)).size;
}

/** パッケージを読む（テスト・検証用） */
async function readPackage(file) {
  const buf = await fsp.readFile(file);
  if (buf.toString('latin1', 0, 6) !== 'LKDIM\x02') throw new Error('パッケージではありません');
  const count = buf.readUInt32LE(12);
  const pkg = { chunks: [], digps: [], actors: new Map() };
  let fp = 16;
  while (fp < buf.length) {
    const clen = buf.readUInt32LE(fp);
    const rlen = buf.readUInt32LE(fp + 4);
    const raw = zlib.inflateSync(buf.subarray(fp + 8, fp + 8 + clen));
    if (raw.length !== rlen) throw new Error('フレームの長さが一致しません');
    fp += 8 + clen;
    let p = 0;
    while (p < raw.length) {
      const kind = raw[p];
      const kl = raw.readUInt32LE(p + 1);
      const key = raw.subarray(p + 5, p + 5 + kl);
      p += 5 + kl;
      const vl = raw.readUInt32LE(p);
      const value = raw.subarray(p + 4, p + 4 + vl);
      p += 4 + vl;
      if (kind === 1) pkg.chunks.push({ rest: key, tag: key[8], value });
      else if (kind === 2) pkg.digps.push({ xz: key, value });
      else pkg.actors.set(key.toString('hex'), { id: key, value });
    }
  }
  const total = pkg.chunks.length + pkg.digps.length + pkg.actors.size;
  if (total !== count) throw new Error(`エントリ数が一致しません (${total}/${count})`);
  return pkg;
}

/** フォルダ内の level.dat を探す（直下 or 1階層下） */
async function findWorldRoot(dir) {
  if (await exists(path.join(dir, 'level.dat'))) return dir;
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && (await exists(path.join(dir, e.name, 'level.dat')))) return path.join(dir, e.name);
  }
  throw new Error('level.dat が見つかりません（.mcworld ではないようです）');
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

function levelInfo(levelDat) {
  const ld = nbt.readLevelDat(levelDat);
  const v = ld.tag.value;
  const ver = nbt.get(v, 'lastOpenedWithVersion')?.items || [];
  const text = (x) => (Buffer.isBuffer(x) ? x.toString('utf8') : x);
  return {
    levelName: text(nbt.get(v, 'LevelName')) || '',
    spawn: { x: nbt.get(v, 'SpawnX') ?? 0, y: nbt.get(v, 'SpawnY') ?? 32767, z: nbt.get(v, 'SpawnZ') ?? 0 },
    version: ver.slice(0, 4).join('.'),
    versionList: ver,
    storageVersion: ld.version,
    generator: nbt.get(v, 'Generator'),
    seed: nbt.get(v, 'RandomSeed') !== undefined ? String(nbt.get(v, 'RandomSeed')) : '',
  };
}

/** バージョン比較 a > b なら正 */
function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * .mcworld を読み込み、指定ディメンション(既定: オーバーワールド)をパッケージにする
 */
async function importMcworld(zipFile, outPackage, { sourceDim = 0, workDir, onProgress } = {}) {
  const tmp = await fsp.mkdtemp(path.join(workDir || path.dirname(outPackage), '.mcworld-'));
  try {
    onProgress?.('展開中…');
    await extractZip(zipFile, tmp);
    const root = await findWorldRoot(tmp);
    const info = levelInfo(await fsp.readFile(path.join(root, 'level.dat')));
    onProgress?.(`ワールド「${info.levelName}」(${info.version || '不明'}) を読み込み中`);
    const pkg = remapEntities(await extractDimension(path.join(root, 'db'), sourceDim, { onProgress }));
    if (!pkg.chunks.length) throw new Error(`このワールドの ${['オーバーワールド', 'ネザー', 'ジ・エンド'][sourceDim] || sourceDim} にチャンクがありません`);
    const size = await writePackage(pkg, outPackage);
    return { ...info, ...pkg.stats, packageSize: size };
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

/**
 * ワールドフォルダ（バックアップを展開したもの）の指定ディメンションをパッケージにする（ワールド単位の復元用）
 */
async function packageFromWorld(worldDir, dimId, outPackage, { onProgress } = {}) {
  const pkg = remapEntities(await extractDimension(path.join(worldDir, 'db'), dimId, { onProgress }));
  const size = await writePackage(pkg, outPackage);
  return { ...pkg.stats, packageSize: size };
}

const VOID_LAYERS = JSON.stringify({
  biome_id: 1,
  block_layers: [{ block_name: 'minecraft:air', count: 1 }],
  encoding_version: 6,
  structure_options: null,
  world_version: 'version.post_1_18',
});

/**
 * ワールドフォルダ（バックアップを展開したもの）の指定ディメンションを、単独の .mcworld として書き出す
 * そのディメンションがオーバーワールドになる。範囲外は既定で何もない（虚空のフラット）
 */
/**
 * targetDim: 書き出し先ワールドでの次元。高さの範囲が違う次元（ネザー型 0〜128 / エンド型 0〜256）は
 *            オーバーワールド(-64〜320)へ入れるとサブチャンクの高さ・バイオームがずれるため、同じ型の次元へ入れる
 */
async function exportMcworld(worldDir, dimId, outFile, { levelName = 'LeviKit export', spawn, voidOutside = true, includePacks = true, onProgress, targetDim = 0 } = {}) {
  const tmp = await fsp.mkdtemp(path.join(path.dirname(outFile), '.export-'));
  try {
    const pkg = await extractDimension(path.join(worldDir, 'db'), dimId, { onProgress });
    if (!pkg.chunks.length) throw new Error('このワールドにはまだチャンクがありません（誰も入っていない？）');
    onProgress?.(`書き出し中: ${pkg.stats.chunks} チャンク / エンティティ ${pkg.stats.actors}`);
    const entries = [];
    for (const c of pkg.chunks) entries.push({ key: chunkKey(c.rest, targetDim), value: c.value });
    for (const d of pkg.digps) entries.push({ key: digpKey(d.xz, targetDim), value: d.value });
    for (const a of pkg.actors.values()) entries.push({ key: Buffer.concat([Buffer.from('actorprefix'), a.id]), value: a.value });
    const world = path.join(tmp, 'world');
    await writeDatabase(path.join(world, 'db'), entries, { compression: 'zlibraw' });

    // level.dat は元のワールドのものをベースに名前・スポーン・生成方法を変える
    const ld = nbt.readLevelDat(await fsp.readFile(path.join(worldDir, 'level.dat')));
    const v = ld.tag.value;
    const setInt = (k, val) => {
      v[k] = { type: 'int', value: Math.round(val) };
    };
    v.LevelName = { type: 'string', value: levelName };
    if (spawn && targetDim === 0) {
      setInt('SpawnX', spawn.x);
      setInt('SpawnY', spawn.y);
      setInt('SpawnZ', spawn.z);
    }
    if (voidOutside) {
      setInt('Generator', 2);
      v.FlatWorldLayers = { type: 'string', value: VOID_LAYERS };
    }
    await fsp.writeFile(path.join(world, 'level.dat'), nbt.writeLevelDat(ld));
    await fsp.writeFile(path.join(world, 'levelname.txt'), levelName);
    if (includePacks) {
      for (const f of ['world_behavior_packs.json', 'world_resource_packs.json', 'world_icon.jpeg']) {
        if (await exists(path.join(worldDir, f))) await fsp.copyFile(path.join(worldDir, f), path.join(world, f));
      }
      for (const d of ['behavior_packs', 'resource_packs']) {
        if (await exists(path.join(worldDir, d))) await fsp.cp(path.join(worldDir, d), path.join(world, d), { recursive: true });
      }
    }
    onProgress?.('zip を作成中');
    const z = await zipDir(world, outFile);
    return { ...pkg.stats, file: outFile, size: z.size };
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

/** 1つの次元だけを持つワールドフォルダを作る（外部のレンダラーに渡す用） */
async function writeDimensionWorld(worldDir, dimId, outDir, { targetDim = 0, onProgress } = {}) {
  const pkg = await extractDimension(path.join(worldDir, 'db'), dimId, { onProgress });
  const entries = [];
  for (const c of pkg.chunks) entries.push({ key: chunkKey(c.rest, targetDim), value: c.value });
  for (const d of pkg.digps) entries.push({ key: digpKey(d.xz, targetDim), value: d.value });
  for (const a of pkg.actors.values()) entries.push({ key: Buffer.concat([Buffer.from('actorprefix'), a.id]), value: a.value });
  await fsp.mkdir(outDir, { recursive: true });
  await writeDatabase(path.join(outDir, 'db'), entries, { compression: 'zlibraw' });
  await fsp.copyFile(path.join(worldDir, 'level.dat'), path.join(outDir, 'level.dat'));
  return pkg.stats;
}

module.exports = {
  writeDimensionWorld,
  storageKeyOf,
  classifyKey,
  chunkKey,
  digpKey,
  extractDimension,
  remapEntities,
  writePackage,
  readPackage,
  importMcworld,
  packageFromWorld,
  exportMcworld,
  levelInfo,
  findWorldRoot,
  cmpVersion,
};
