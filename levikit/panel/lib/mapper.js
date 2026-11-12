'use strict';
// ワールドの上空マップ（1ブロック = 1ピクセル）を LevelDB から直接描く
//   Data3D(tag 43) の高さマップ → 一番上のブロックの名前（サブチャンク tag 47 のパレット）→ 色
//   チャンクごとの指紋（全タグの値のハッシュ）も作る → バックアップ同士の差分（どこが変わったか）に使う
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { LevelDBReader } = require('./leveldb');
const nbt = require('./nbt');
const { classifyKey } = require('./worldio');

const DIM_MIN_Y = { 0: -64, 1: 0, 2: 0 }; // カスタム（オーバーワールド型）は -64 扱い

// ブロック名 → 色（含む語で判定。先に書いたものが優先）
const COLORS = [
  ['water', [52, 95, 218]], ['lava', [234, 92, 15]], ['ice', [160, 190, 250]], ['snow', [248, 252, 255]], ['powder_snow', [248, 252, 255]],
  ['grass_block', [109, 153, 48]], ['grass', [109, 153, 48]], ['fern', [96, 140, 48]], ['leaves', [58, 120, 32]], ['azalea', [80, 130, 50]], ['vine', [60, 120, 30]], ['moss', [90, 120, 40]],
  ['sand', [219, 207, 163]], ['sandstone', [216, 203, 155]], ['gravel', [136, 126, 126]], ['clay', [160, 166, 179]], ['mud', [60, 57, 60]],
  ['dirt', [134, 96, 67]], ['podzol', [91, 63, 24]], ['mycelium', [111, 99, 105]], ['farmland', [110, 75, 45]], ['path', [148, 122, 65]],
  ['log', [102, 81, 50]], ['wood', [102, 81, 50]], ['planks', [162, 130, 78]], ['crafting', [140, 105, 60]], ['bookshelf', [140, 105, 60]],
  ['netherrack', [111, 54, 52]], ['nylium', [120, 30, 30]], ['soul', [81, 62, 50]], ['basalt', [80, 80, 86]], ['blackstone', [42, 36, 41]], ['magma', [140, 60, 20]], ['glowstone', [250, 220, 120]],
  ['end_stone', [221, 223, 165]], ['obsidian', [20, 18, 30]], ['purpur', [169, 125, 169]], ['chorus', [110, 80, 110]],
  ['terracotta', [152, 94, 67]], ['concrete', [180, 180, 180]], ['wool', [230, 230, 230]], ['glass', [200, 230, 240]],
  ['deepslate', [80, 80, 82]], ['cobblestone', [122, 122, 122]], ['andesite', [136, 136, 136]], ['diorite', [188, 188, 188]], ['granite', [149, 103, 85]], ['tuff', [108, 109, 102]], ['calcite', [223, 224, 220]],
  ['brick', [150, 97, 83]], ['quartz', [235, 229, 222]], ['iron', [216, 216, 216]], ['gold', [246, 208, 61]], ['diamond', [98, 237, 228]], ['emerald', [42, 203, 87]], ['redstone', [175, 24, 5]], ['copper', [192, 107, 79]],
  ['flower', [220, 60, 60]], ['tulip', [220, 90, 60]], ['dandelion', [240, 220, 40]], ['poppy', [200, 30, 30]], ['mushroom', [180, 70, 60]], ['pumpkin', [198, 118, 24]], ['melon', [110, 150, 30]], ['cactus', [80, 125, 40]], ['kelp', [60, 120, 50]], ['seagrass', [50, 110, 60]], ['coral', [200, 80, 140]],
  ['bedrock', [60, 60, 60]], ['stone', [125, 125, 125]],
];
const nameColor = new Map();
function colorOf(name) {
  let c = nameColor.get(name);
  if (c) return c;
  const short = name.replace(/^minecraft:/, '');
  c = (COLORS.find(([k]) => short.includes(k)) || [null, [150, 150, 150]])[1];
  nameColor.set(name, c);
  return c;
}

/** サブチャンク (version 8/9) を読む → { y, storages: [{ idx: Uint16Array(4096), palette: [name] }] } */
function decodeSubchunk(buf, keySub) {
  let p = 0;
  const ver = buf[p++];
  if (ver !== 8 && ver !== 9) return null;
  const count = buf[p++];
  let y = keySub;
  if (ver === 9) y = buf.readInt8(p++);
  const storages = [];
  for (let s = 0; s < count; s++) {
    const header = buf[p++];
    const bits = header >> 1;
    const idx = new Uint16Array(4096);
    if (bits > 0) {
      const perWord = Math.floor(32 / bits);
      const words = Math.ceil(4096 / perWord);
      const mask = (1 << bits) - 1;
      for (let w = 0; w < words; w++) {
        const word = buf.readUInt32LE(p + w * 4);
        for (let j = 0; j < perWord; j++) {
          const i = w * perWord + j;
          if (i >= 4096) break;
          idx[i] = (word >>> (j * bits)) & mask;
        }
      }
      p += words * 4;
    }
    const size = buf.readInt32LE(p);
    p += 4;
    const palette = [];
    const states = [];
    for (let k = 0; k < size; k++) {
      const r = nbt.readRoot(buf, p);
      palette.push(String(r.tag.value.name?.value || 'minecraft:air'));
      const st = {};
      for (const [key, t] of Object.entries(r.tag.value.states?.value || {})) st[key] = typeof t.value === 'bigint' ? Number(t.value) : Buffer.isBuffer(t.value) ? t.value.toString() : t.value;
      states.push(st);
      p = r.end;
    }
    storages.push({ idx, palette, states });
  }
  return { y, storages };
}

/** PNG (RGBA) を作る */
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void', 'minecraft:light_block']);

/**
 * 1つのディメンションを描く
 * @returns { png, meta: { dim, minCX, minCZ, widthChunks, heightChunks, chunks, decoded, fingerprints: { "x,z": hash } } }
 */
async function renderDimension(dbDir, dimId, { maxChunks = 40000, onProgress, minY: minYOpt, roof = dimId === 1, textures = null } = {}) {
  // バニラのテクスチャがあれば、上面の平均色で塗る（無ければ名前からの近似色）
  const color = (n) => (textures && textures.ok && textures.topColor(n)) || colorOf(n);
  const reader = await new LevelDBReader(dbDir).open();
  const entries = await reader.collect((k) => {
    const c = classifyKey(k);
    return c.kind === 'chunk' && c.dim === dimId;
  }, onProgress);
  const chunks = new Map(); // "x,z" -> { tags: [{tag,sub,value}] }
  for (const e of entries.values()) {
    if (!e.value) continue;
    const c = classifyKey(e.key);
    const x = c.rest.readInt32LE(0);
    const z = c.rest.readInt32LE(4);
    const id = `${x},${z}`;
    let ch = chunks.get(id);
    if (!ch) chunks.set(id, (ch = { x, z, parts: [] }));
    ch.parts.push({ tag: c.tag, sub: c.rest.length > 9 ? c.rest.readInt8(9) : null, value: e.value, key: c.rest.toString('hex') });
  }
  const fingerprints = {};
  for (const [id, ch] of chunks) {
    const h = crypto.createHash('sha1');
    for (const part of [...ch.parts].sort((a, b) => (a.key < b.key ? -1 : 1))) {
      h.update(part.key);
      h.update(part.value);
    }
    fingerprints[id] = h.digest('hex').slice(0, 16);
  }
  if (!chunks.size) return { png: encodePng(1, 1, Buffer.alloc(4)), meta: { dim: dimId, minCX: 0, minCZ: 0, widthChunks: 0, heightChunks: 0, chunks: 0, decoded: 0, fingerprints } };
  let minCX = Infinity, minCZ = Infinity, maxCX = -Infinity, maxCZ = -Infinity;
  for (const ch of chunks.values()) {
    minCX = Math.min(minCX, ch.x);
    minCZ = Math.min(minCZ, ch.z);
    maxCX = Math.max(maxCX, ch.x);
    maxCZ = Math.max(maxCZ, ch.z);
  }
  // 大きすぎるワールドは中央付近に絞る
  let wC = maxCX - minCX + 1;
  let hC = maxCZ - minCZ + 1;
  const limit = Math.floor(Math.sqrt(maxChunks));
  if (wC > limit) {
    minCX = Math.floor((minCX + maxCX) / 2 - limit / 2);
    wC = limit;
  }
  if (hC > limit) {
    minCZ = Math.floor((minCZ + maxCZ) / 2 - limit / 2);
    hC = limit;
  }
  const W = wC * 16;
  const H = hC * 16;
  const rgba = Buffer.alloc(W * H * 4);
  const heights = new Int16Array(W * H).fill(-32768);
  const minY = minYOpt ?? DIM_MIN_Y[dimId] ?? -64;
  let decoded = 0;
  for (const ch of chunks.values()) {
    const ox = (ch.x - minCX) * 16;
    const oz = (ch.z - minCZ) * 16;
    if (ox < 0 || oz < 0 || ox >= W || oz >= H) continue;
    const d3 = ch.parts.find((p) => p.tag === 43) || ch.parts.find((p) => p.tag === 45);
    const subs = new Map();
    for (const p of ch.parts) {
      if (p.tag !== 47) continue;
      try {
        const sc = decodeSubchunk(p.value, p.sub);
        if (sc) subs.set(sc.y, sc);
      } catch {
        /* 読めないサブチャンクは飛ばす */
      }
    }
    const blockAt = (x, y, z) => {
      const sc = subs.get(Math.floor(y / 16));
      if (!sc || !sc.storages.length) return 'minecraft:air';
      const i = (x << 8) | (z << 4) | (((y % 16) + 16) % 16);
      const st = sc.storages[0];
      return st.palette[st.idx[i]] || 'minecraft:air';
    };
    const subYs = [...subs.keys()].sort((a, b) => b - a);
    let any = false;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        let top = null;
        let ty = 0;
        if (roof) {
          // 天井のある次元（ネザー型）: 天井の下の最初の空洞から、下にある床を探す
          let seenAir = false;
          for (let y = minY + 120; y >= minY; y--) {
            const b = blockAt(x, y, z);
            if (AIR.has(b) || b.includes('lava')) {
              if (AIR.has(b)) seenAir = true;
              else if (seenAir) {
                top = b;
                ty = y;
                break;
              }
            } else if (seenAir) {
              top = b;
              ty = y;
              break;
            }
          }
        } else if (d3 && d3.value.length >= 512) {
          const h = d3.value.readInt16LE((z * 16 + x) * 2);
          // 高さマップの直下から下へ、空気でないブロックを探す
          for (let y = h - 1 + minY; y >= h - 1 + minY - 24 && y >= minY; y--) {
            const b = blockAt(x, y, z);
            if (!AIR.has(b)) {
              top = b;
              ty = y;
              break;
            }
          }
        }
        if (!top && subYs.length) {
          // 高さマップが無い/合わない: 上から探す
          outer: for (const sy of subYs) {
            for (let ly = 15; ly >= 0; ly--) {
              const b = blockAt(x, sy * 16 + ly, z);
              if (!AIR.has(b)) {
                top = b;
                ty = sy * 16 + ly;
                break outer;
              }
            }
          }
        }
        const px = ox + x;
        const pz = oz + z;
        const o = (pz * W + px) * 4;
        if (top) {
          any = true;
          const [r, g, b] = color(top);
          rgba[o] = r;
          rgba[o + 1] = g;
          rgba[o + 2] = b;
          rgba[o + 3] = 255;
          heights[pz * W + px] = ty;
        } else {
          rgba[o] = rgba[o + 1] = rgba[o + 2] = 40; // 生成済みだが空（虚空など）
          rgba[o + 3] = 60;
        }
      }
    }
    if (any) decoded++;
  }
  // 陰影（北西からの光）
  for (let z = 1; z < H; z++) {
    for (let x = 1; x < W; x++) {
      const h = heights[z * W + x];
      const n = heights[(z - 1) * W + x - 1];
      if (h === -32768 || n === -32768) continue;
      const f = h > n ? 1.15 : h < n ? 0.82 : 1;
      if (f === 1) continue;
      const o = (z * W + x) * 4;
      for (let k = 0; k < 3; k++) rgba[o + k] = Math.min(255, Math.round(rgba[o + k] * f));
    }
  }
  return { png: encodePng(W, H, rgba), meta: { dim: dimId, minCX, minCZ, widthChunks: wC, heightChunks: hC, chunks: chunks.size, decoded, fingerprints } };
}

/** 2つの指紋から変わったチャンク */
function diffFingerprints(a, b) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const [k, v] of Object.entries(b)) {
    if (!(k in a)) added.push(k);
    else if (a[k] !== v) changed.push(k);
  }
  for (const k of Object.keys(a)) if (!(k in b)) removed.push(k);
  return { changed, added, removed };
}

module.exports = { renderDimension, decodeSubchunk, encodePng, diffFingerprints, colorOf };
