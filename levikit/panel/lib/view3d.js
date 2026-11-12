'use strict';
// 観察ビュー（3D）用: ワールドの一部（チャンク範囲）のブロックを取り出す
//   → { palette: ["名前|状態JSON"], faces: { キー: テクスチャ情報 }, subchunks: [{ x, z, y, data, water }], biomes: [{ x, z, data }] }
//   ブロックの並びは統合版と同じ index = (x<<8)|(z<<4)|y
//   状態は形（ハーフ・階段・柵…）と旧形式の種類（木の種類・羊毛の色…）に必要なものだけ残す
const { LevelDBReader } = require('./leveldb');
const { classifyKey } = require('./worldio');
const { decodeSubchunk } = require('./mapper');

const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void', 'minecraft:light_block']);

// 形・向きに使う状態
const SHAPE_STATES = new Set([
  'pillar_axis', 'minecraft:vertical_half', 'top_slot_bit', 'upside_down_bit', 'weirdo_direction', 'direction', 'facing_direction',
  'minecraft:cardinal_direction', 'minecraft:block_face', 'minecraft:facing_direction', 'height', 'liquid_depth', 'open_bit',
  'upper_block_bit', 'door_hinge_bit', 'torch_facing_direction', 'hanging', 'attachment', 'growth', 'age', 'multi_face_direction_bits',
  'wall_post_bit', 'wall_connection_type_east', 'wall_connection_type_west', 'wall_connection_type_north', 'wall_connection_type_south',
  'end_rod_facing_direction', 'lever_direction', 'ground_sign_direction', 'facing', 'bite_counter', 'candles', 'lit',
]);

// 旧形式（データ値で種類を表すブロック）の状態 → terrain_texture の配列の何番目か
const VARIANT_STATES = {
  old_log_type: ['oak', 'spruce', 'birch', 'jungle'],
  old_leaf_type: ['oak', 'spruce', 'birch', 'jungle'],
  new_log_type: ['acacia', 'dark_oak'],
  new_leaf_type: ['acacia', 'dark_oak'],
  wood_type: ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'],
  sapling_type: ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'],
  stone_type: ['stone', 'granite', 'granite_smooth', 'diorite', 'diorite_smooth', 'andesite', 'andesite_smooth'],
  color: ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'silver', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'],
  sand_type: ['normal', 'red'],
  dirt_type: ['normal', 'coarse'],
  flower_type: ['poppy', 'orchid', 'allium', 'houstonia', 'tulip_red', 'tulip_orange', 'tulip_white', 'tulip_pink', 'oxeye', 'cornflower', 'lily_of_the_valley'],
  double_plant_type: ['sunflower', 'syringa', 'grass', 'fern', 'rose', 'paeonia'],
  tall_grass_type: ['default', 'tall', 'fern', 'snow'],
  chisel_type: ['default', 'chiseled', 'lines', 'smooth'],
  sandstone_type: ['default', 'heiroglyphs', 'cut', 'smooth'],
  stone_brick_type: ['default', 'mossy', 'cracked', 'chiseled', 'smooth'],
  prismarine_block_type: ['default', 'dark', 'bricks'],
  stone_slab_type: ['smooth_stone', 'sandstone', 'wood', 'cobblestone', 'brick', 'stone_brick', 'quartz', 'nether_brick'],
};

function variantOf(states) {
  for (const [k, list] of Object.entries(VARIANT_STATES)) {
    if (k in states) {
      const i = list.indexOf(String(states[k]));
      if (i > 0) return i;
    }
  }
  return 0;
}

/** Data3D (tag 43) → 列ごとの地表のバイオーム ID (256) */
function surfaceBiomes(buf) {
  if (!buf || buf.length < 513) return null;
  const heights = [];
  for (let i = 0; i < 256; i++) heights.push(buf.readInt16LE(i * 2));
  const sections = [];
  let p = 512;
  try {
    while (p < buf.length) {
      const h = buf[p++];
      if (h === 0xff) {
        sections.push(sections[sections.length - 1] || null);
        continue;
      }
      const bits = h >> 1;
      if (bits === 0) {
        const id = buf.readInt32LE(p);
        p += 4;
        sections.push({ single: id });
        continue;
      }
      const per = Math.floor(32 / bits);
      const words = Math.ceil(4096 / per);
      const idx = new Uint16Array(4096);
      const mask = (1 << bits) - 1;
      for (let w = 0; w < words; w++) {
        const word = buf.readUInt32LE(p + w * 4);
        for (let j = 0; j < per; j++) {
          const i = w * per + j;
          if (i < 4096) idx[i] = (word >>> (j * bits)) & mask;
        }
      }
      p += words * 4;
      const n = buf.readInt32LE(p);
      p += 4;
      const pal = [];
      for (let k = 0; k < n; k++, p += 4) pal.push(buf.readInt32LE(p));
      sections.push({ idx, pal });
    }
  } catch {
    if (!sections.length) return null;
  }
  const out = new Uint8Array(256);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      const h = Math.max(0, heights[z * 16 + x] - 1);
      const s = sections[Math.min(sections.length - 1, Math.floor(h / 16))];
      let id = 1;
      if (s?.single !== undefined) id = s.single;
      else if (s) id = s.pal[s.idx[(x << 8) | (z << 4) | (h & 15)]] ?? 1;
      out[x * 16 + z] = Math.max(0, Math.min(255, id));
    }
  }
  return out;
}

async function extractRegion(dbDir, dimId, { cx, cz, r = 4, textures = null }) {
  r = Math.max(1, Math.min(8, r | 0));
  const reader = await new LevelDBReader(dbDir).open();
  const entries = await reader.collect((k) => {
    const c = classifyKey(k);
    return c.kind === 'chunk' && c.dim === dimId && (c.tag === 47 || c.tag === 43) && Math.abs(c.x - cx) <= r && Math.abs(c.z - cz) <= r;
  });
  const palette = ['minecraft:air'];
  const variants = [0];
  const index = new Map([['minecraft:air', 0]]);
  const idOf = (name, states) => {
    const keep = {};
    for (const [k, v] of Object.entries(states || {})) if (SHAPE_STATES.has(k)) keep[k] = v;
    const ks = Object.keys(keep).length ? `${name}|${JSON.stringify(keep)}` : name;
    const variant = variantOf(states || {});
    const key = variant ? `${ks}#${variant}` : ks;
    let i = index.get(key);
    if (i === undefined) {
      i = palette.length;
      palette.push(key);
      variants.push(variant);
      index.set(key, i);
    }
    return i;
  };
  const subchunks = [];
  const biomes = [];
  for (const e of entries.values()) {
    if (!e.value) continue;
    const c = classifyKey(e.key);
    if (c.tag === 43) {
      const b = surfaceBiomes(e.value);
      if (b) biomes.push({ x: c.x, z: c.z, data: Buffer.from(b).toString('base64') });
      continue;
    }
    let sc;
    try {
      sc = decodeSubchunk(e.value, c.rest.length > 9 ? c.rest.readInt8(9) : 0);
    } catch {
      continue;
    }
    if (!sc || !sc.storages.length) continue;
    const toGlobal = (st) => {
      const map = st.palette.map((n, k) => (AIR.has(n) ? 0 : idOf(n, st.states?.[k])));
      const out = new Uint16Array(4096);
      let any = false;
      for (let i = 0; i < 4096; i++) {
        const v = map[st.idx[i]] || 0;
        out[i] = v;
        if (v) any = true;
      }
      return any ? out : null;
    };
    const main = toGlobal(sc.storages[0]);
    const extra = sc.storages[1] ? toGlobal(sc.storages[1]) : null; // 水浸しブロックの水など
    if (!main && !extra) continue;
    const b64 = (a) => (a ? Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64') : null);
    subchunks.push({ x: c.x, z: c.z, y: sc.y, data: b64(main || new Uint16Array(4096)), water: b64(extra) });
  }
  const faces = {};
  if (textures?.ok) {
    palette.forEach((key, i) => {
      if (!i) return;
      const name = key.split('|')[0].split('#')[0];
      faces[key] = textures.resolve(name, variants[i]);
    });
  }
  return { cx, cz, r, palette, faces, subchunks, biomes };
}

module.exports = { extractRegion, surfaceBiomes, variantOf };
