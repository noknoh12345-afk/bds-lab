'use strict';
// 統合版のバニラリソースパック（Mojang/bedrock-samples の resource_pack）から
//   ブロック名 → 面ごとのテクスチャ（上・下・横）、色合い（草・葉・水）、平均色 を引く
//   地図（2D）と観察ビュー（3D）で共通に使う
const fs = require('node:fs');
const path = require('node:path');
const { decodeImage, encodePng } = require('./png');

/** Mojang の JSON（// コメント・末尾カンマ入り）を読む */
function parseLooseJson(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/^﻿/, '').replace(/,(\s*[}\]])/g, '$1'));
}

// 色合い（バイオームの色は使わず、平均的な色に固定）
const TINTS = [
  [/^(grass_block|grass)$/, { up: [0x79, 0xc0, 0x5a] }],
  [/^(?!.*(cherry|azalea|pale|_vines)).*(short_grass|tall_grass|tallgrass|double_plant|^grass$|fern|vine|lily_pad|sugar_cane|reeds|leaves)/, { all: [0x59, 0xae, 0x30] }],
  [/^(birch_leaves)$/, { all: [0x80, 0xa7, 0x55] }],
  [/^(spruce_leaves)$/, { all: [0x61, 0x99, 0x61] }],
  [/(^water$|flowing_water|bubble_column)/, { all: [0x3f, 0x76, 0xe4] }],
];

const CROSS = /(double_plant|reeds|flower|tulip|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|wither_rose|sapling|short_grass|tall_grass|^fern$|large_fern|dead_bush|mushroom$|sweet_berry_bush|wheat|carrots|potatoes|beetroot|seagrass|kelp|torchflower|pitcher|nether_sprouts|roots$|fungus$|propagule|cobweb|sugar_cane|bamboo_sapling|azalea$|spore_blossom|hanging_roots|cave_vines|glow_lichen|pink_petals|leaf_litter|bush$|firefly_bush|cactus_flower|grass$)/;
const TRANSLUCENT = /(water|stained_glass|^ice$|slime|honey_block|nether_portal|^portal$)/;
const CUTOUT = /(leaves|glass(?!_pane)|glass_pane|iron_bars|chain|ladder|rail|torch|lantern|door|trapdoor|fence|scaffolding|spawner|beacon|cobweb|vine)/;
const NONSOLID = /(torch|^air$|light_block|structure_void|barrier|button|pressure_plate|sign|banner|rail|redstone_wire|lever|tripwire|^snow_layer$|carpet|pink_petals|leaf_litter|frame|candle|skull|head$|pot$)/;

// 名前が変わったブロック（blocks.json は古い名前のまま）
const ALIASES = { grass_block: 'grass', dirt_path: 'grass_path', short_grass: 'tallgrass', double_plant: 'tall_grass' };

class TexturePack {
  constructor(dir) {
    this.dir = dir; // .../resource_pack
    this.ok = false;
    this.cache = new Map();
    this.avgCache = new Map();
    try {
      this.blocks = parseLooseJson(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'));
      this.terrain = parseLooseJson(fs.readFileSync(path.join(dir, 'textures', 'terrain_texture.json'), 'utf8')).texture_data || {};
      this.ok = true;
    } catch {
      this.blocks = {};
      this.terrain = {};
    }
  }

  /** テクスチャキー → ファイルの相対パス（拡張子なし）。バリエーションは最初のもの */
  keyPath(key, variant = 0) {
    const e = this.terrain[key];
    if (!e) return null;
    let t = e.textures;
    if (Array.isArray(t)) t = t[Math.min(variant, t.length - 1)];
    if (t && typeof t === 'object') {
      if (Array.isArray(t.variations)) t = t.variations[0]?.path;
      else t = t.path;
    }
    if (!t && Array.isArray(e.textures?.variations)) t = e.textures.variations[0]?.path;
    return typeof t === 'string' ? t : null;
  }

  /** ブロック名 → { up, down, side, tint, kind }（variant: 旧形式の種類番号。terrain_texture の配列の何番目か） */
  resolve(name, variant = 0) {
    const short = String(name).replace(/^minecraft:/, '');
    const ck = variant ? `${short}#${variant}` : short;
    if (this.cache.has(ck)) return this.cache.get(ck);
    const def = (ALIASES[short] && this.blocks[ALIASES[short]]) || this.blocks[short];
    let faces = null;
    if (def && def.textures) {
      const t = def.textures;
      if (typeof t === 'string') faces = { up: t, down: t, side: t };
      else faces = { up: t.up || t.side, down: t.down || t.side || t.up, side: t.side || t.north || t.east || t.up };
    } else if (this.terrain[short]) faces = { up: short, down: short, side: short };
    let r = null;
    if (faces) {
      const p = (k) => (k ? this.keyPath(k, variant) : null);
      r = { up: p(faces.up), down: p(faces.down), side: p(faces.side) };
      // log 系は上下に年輪、横に樹皮
      if (!r.up && r.side) r.up = r.side;
      if (!r.side && r.up) r.side = r.up;
      if (!r.down) r.down = r.up;
      if (!r.up) r = null;
      // 草ブロックの横は色付きの版（無色の版は上の帯がアルファで抜けている）
      if (r && /^(grass|grass_block)$/.test(short) && this.filePath('textures/blocks/grass_side_carried')) r.side = 'textures/blocks/grass_side_carried';
    }
    const tintRule = TINTS.find(([re]) => re.test(short));
    const kind = CROSS.test(short) && !/(block|leaves|log|^grass$)/.test(short) ? 'cross' : TRANSLUCENT.test(short) ? 'translucent' : CUTOUT.test(short) ? 'cutout' : 'solid';
    const out = r ? { ...r, tint: tintRule ? tintRule[1] : null, kind, solid: kind === 'solid' && !NONSOLID.test(short) } : null;
    this.cache.set(ck, out);
    return out;
  }

  /** テクスチャファイル（相対パス、拡張子なし）を探す */
  filePath(rel) {
    if (!rel || rel.includes('..')) return null;
    for (const ext of ['.png', '.tga']) {
      const f = path.join(this.dir, `${rel}${ext}`);
      if (fs.existsSync(f)) return f;
    }
    return null;
  }

  /** PNG として返す（TGA は変換）。アニメーション（縦長）は最初のコマ */
  png(rel) {
    const f = this.filePath(rel);
    if (!f) return null;
    const buf = fs.readFileSync(f);
    if (f.endsWith('.png')) {
      try {
        const img = decodeImage(buf);
        if (img.height <= img.width) return buf;
        return encodePng(img.width, img.width, img.rgba.subarray(0, img.width * img.width * 4));
      } catch {
        return buf;
      }
    }
    const img = decodeImage(buf);
    return encodePng(img.width, Math.min(img.height, img.width), img.rgba.subarray(0, img.width * Math.min(img.height, img.width) * 4));
  }

  /** ブロックの上面の平均色（色合い込み）→ [r,g,b] または null */
  topColor(name) {
    const short = String(name).replace(/^minecraft:/, '');
    if (this.avgCache.has(short)) return this.avgCache.get(short);
    let c = null;
    const r = this.resolve(short);
    const f = r && this.filePath(r.up);
    if (f) {
      try {
        const img = decodeImage(fs.readFileSync(f));
        const n = img.width * Math.min(img.height, img.width);
        let R = 0, G = 0, B = 0, A = 0;
        for (let i = 0; i < n; i++) {
          const a = img.rgba[i * 4 + 3];
          if (a < 32) continue;
          R += img.rgba[i * 4];
          G += img.rgba[i * 4 + 1];
          B += img.rgba[i * 4 + 2];
          A++;
        }
        if (A) {
          c = [R / A, G / A, B / A];
          const tint = r.tint && (r.tint.up || r.tint.all);
          if (tint) c = c.map((v, k) => (v * tint[k]) / 255);
          c = c.map((v) => Math.round(v));
        }
      } catch {
        c = null;
      }
    }
    this.avgCache.set(short, c);
    return c;
  }
}

let shared = null;
function texturePack(dir) {
  if (!shared || shared.dir !== dir) shared = new TexturePack(dir);
  return shared;
}

module.exports = { TexturePack, texturePack, parseLooseJson };
