'use strict';
// PNG / TGA の読み込み（依存なし）→ { width, height, rgba: Buffer }
//   統合版のバニラテクスチャ（PNG: 8bit パレット/RGB/RGBA/グレー, TGA: 無圧縮/RLE 24/32bit）用
const zlib = require('node:zlib');
const { encodePng } = require('./mapper');

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG ではありません');
  let p = 8;
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const t = buf.toString('latin1', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') {
      width = d.readUInt32BE(0);
      height = d.readUInt32BE(4);
      depth = d[8];
      type = d[9];
      interlace = d[12];
    } else if (t === 'PLTE') palette = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('インターレース PNG は未対応');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error(`PNG の色形式 ${type} は未対応`);
  const bpp = Math.max(1, (ch * depth) >> 3);
  const stride = Math.ceil((width * ch * depth) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const up = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = up ? up[x] : 0;
      const c = up && x >= bpp ? up[x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) v += paeth(a, b, c);
      row[x] = v & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  const sample = (row, i) => {
    if (depth === 8) return row[i];
    if (depth === 16) return row[i * 2];
    const perByte = 8 / depth;
    const byte = row[Math.floor(i / perByte)];
    const shift = 8 - depth * ((i % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  for (let y = 0; y < height; y++) {
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (type === 3) {
        const i = sample(row, x);
        rgba[o] = palette[i * 3];
        rgba[o + 1] = palette[i * 3 + 1];
        rgba[o + 2] = palette[i * 3 + 2];
        rgba[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (type === 0 || type === 4) {
        let g = sample(row, x * ch);
        if (depth < 8) g = Math.round((g * 255) / ((1 << depth) - 1));
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = type === 4 ? sample(row, x * ch + 1) : 255;
      } else {
        rgba[o] = sample(row, x * ch);
        rgba[o + 1] = sample(row, x * ch + 1);
        rgba[o + 2] = sample(row, x * ch + 2);
        rgba[o + 3] = type === 6 ? sample(row, x * ch + 3) : 255;
      }
    }
  }
  return { width, height, rgba };
}

function decodeTga(buf) {
  const idLen = buf[0];
  const cmapType = buf[1];
  const imgType = buf[2];
  const cmapLen = buf.readUInt16LE(5);
  const cmapDepth = buf[7];
  const width = buf.readUInt16LE(12);
  const height = buf.readUInt16LE(14);
  const bits = buf[16];
  const desc = buf[17];
  if (![2, 10].includes(imgType) || ![24, 32].includes(bits)) throw new Error(`TGA 形式 ${imgType}/${bits}bit は未対応`);
  let p = 18 + idLen + (cmapType ? cmapLen * Math.ceil(cmapDepth / 8) : 0);
  const px = bits / 8;
  const rgba = Buffer.alloc(width * height * 4);
  const put = (i, s) => {
    rgba[i * 4] = buf[s + 2];
    rgba[i * 4 + 1] = buf[s + 1];
    rgba[i * 4 + 2] = buf[s];
    rgba[i * 4 + 3] = px === 4 ? buf[s + 3] : 255;
  };
  let i = 0;
  const n = width * height;
  if (imgType === 2) {
    for (; i < n; i++, p += px) put(i, p);
  } else {
    while (i < n) {
      const h = buf[p++];
      const count = (h & 0x7f) + 1;
      if (h & 0x80) {
        for (let k = 0; k < count && i < n; k++) put(i++, p);
        p += px;
      } else {
        for (let k = 0; k < count && i < n; k++, p += px) put(i++, p);
      }
    }
  }
  // 原点が左下なら上下反転
  if (!(desc & 0x20)) {
    const row = width * 4;
    const tmp = Buffer.alloc(row);
    for (let y = 0; y < height >> 1; y++) {
      const a = y * row;
      const b = (height - 1 - y) * row;
      rgba.copy(tmp, 0, a, a + row);
      rgba.copy(rgba, a, b, b + row);
      tmp.copy(rgba, b);
    }
  }
  return { width, height, rgba };
}

function decodeImage(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return decodePng(buf);
  return decodeTga(buf);
}

module.exports = { decodePng, decodeTga, decodeImage, encodePng };
