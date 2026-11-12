'use strict';
// 統合版の NBT（リトルエンディアン）読み書き。型情報を保ったまま往復できる
//   タグ: { type: 'compound', value: { name: tag, ... } } など
//   文字列タグは UTF-8 として正しければ string、そうでなければ Buffer のまま（エンティティの StorageKey など
//   任意のバイト列が入るため。UTF-8 に変換すると壊れる）
const TYPES = ['end', 'byte', 'short', 'int', 'long', 'float', 'double', 'byteArray', 'string', 'list', 'compound', 'intArray', 'longArray'];
const ID = Object.fromEntries(TYPES.map((t, i) => [t, i]));

class Reader {
  constructor(buf, pos = 0) {
    this.buf = buf;
    this.pos = pos;
  }
  u8() {
    return this.buf[this.pos++];
  }
  i8() {
    return this.buf.readInt8(this.pos++);
  }
  i16() {
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u16() {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  i32() {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  i64() {
    const v = this.buf.readBigInt64LE(this.pos);
    this.pos += 8;
    return v;
  }
  f32() {
    const v = this.buf.readFloatLE(this.pos);
    this.pos += 4;
    return v;
  }
  f64() {
    const v = this.buf.readDoubleLE(this.pos);
    this.pos += 8;
    return v;
  }
  /** タグ名（常に文字列） */
  name() {
    const n = this.u16();
    const s = this.buf.toString('utf8', this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  /** 文字列タグの値（UTF-8 として往復できないものは Buffer） */
  str() {
    const n = this.u16();
    const raw = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    const s = raw.toString('utf8');
    if (s.includes('\uFFFD') && !Buffer.from(s, 'utf8').equals(raw)) return Buffer.from(raw);
    return s;
  }
  payload(type) {
    switch (type) {
      case 1:
        return this.i8();
      case 2:
        return this.i16();
      case 3:
        return this.i32();
      case 4:
        return this.i64();
      case 5:
        return this.f32();
      case 6:
        return this.f64();
      case 7: {
        const n = this.i32();
        const v = Buffer.from(this.buf.subarray(this.pos, this.pos + n));
        this.pos += n;
        return v;
      }
      case 8:
        return this.str();
      case 9: {
        const elem = this.u8();
        const n = this.i32();
        const items = [];
        for (let i = 0; i < n; i++) items.push(this.payload(elem));
        return { elementType: TYPES[elem] || 'end', items };
      }
      case 10: {
        const out = {};
        for (;;) {
          const t = this.u8();
          if (t === 0) break;
          const name = this.name();
          out[name] = { type: TYPES[t], value: this.payload(t) };
        }
        return out;
      }
      case 11: {
        const n = this.i32();
        const a = [];
        for (let i = 0; i < n; i++) a.push(this.i32());
        return a;
      }
      case 12: {
        const n = this.i32();
        const a = [];
        for (let i = 0; i < n; i++) a.push(this.i64());
        return a;
      }
      default:
        throw new Error(`NBT: 未知のタグ ${type} @${this.pos}`);
    }
  }
}

/** ルートタグを1つ読む → { name, tag, end } */
function readRoot(buf, pos = 0) {
  const r = new Reader(buf, pos);
  const type = r.u8();
  const name = r.name();
  const value = r.payload(type);
  return { name, tag: { type: TYPES[type], value }, end: r.pos };
}

/** 連結されたルートタグをすべて読む（チャンクの BlockEntity / Entity など） */
function readAll(buf) {
  const out = [];
  let pos = 0;
  while (pos < buf.length) {
    const r = readRoot(buf, pos);
    out.push(r);
    pos = r.end;
  }
  return out;
}

class Writer {
  constructor() {
    this.parts = [];
  }
  push(b) {
    this.parts.push(b);
  }
  u8(v) {
    this.push(Buffer.from([v & 0xff]));
  }
  num(fn, size, v) {
    const b = Buffer.alloc(size);
    b[fn](v, 0);
    this.push(b);
  }
  str(s) {
    const b = Buffer.isBuffer(s) ? s : Buffer.from(String(s), 'utf8');
    this.num('writeUInt16LE', 2, b.length);
    this.push(b);
  }
  payload(type, v) {
    switch (type) {
      case 'byte':
        return this.num('writeInt8', 1, v);
      case 'short':
        return this.num('writeInt16LE', 2, v);
      case 'int':
        return this.num('writeInt32LE', 4, v);
      case 'long':
        return this.num('writeBigInt64LE', 8, BigInt(v));
      case 'float':
        return this.num('writeFloatLE', 4, v);
      case 'double':
        return this.num('writeDoubleLE', 8, v);
      case 'byteArray':
        this.num('writeInt32LE', 4, v.length);
        return this.push(Buffer.from(v));
      case 'string':
        return this.str(v);
      case 'list':
        this.u8(ID[v.elementType] ?? 0);
        this.num('writeInt32LE', 4, v.items.length);
        for (const it of v.items) this.payload(v.elementType, it);
        return;
      case 'compound':
        for (const [name, t] of Object.entries(v)) {
          this.u8(ID[t.type]);
          this.str(name);
          this.payload(t.type, t.value);
        }
        return this.u8(0);
      case 'intArray':
        this.num('writeInt32LE', 4, v.length);
        for (const x of v) this.num('writeInt32LE', 4, x);
        return;
      case 'longArray':
        this.num('writeInt32LE', 4, v.length);
        for (const x of v) this.num('writeBigInt64LE', 8, BigInt(x));
        return;
      default:
        throw new Error(`NBT: 書けない型 ${type}`);
    }
  }
}

function writeRoot(tag, name = '') {
  const w = new Writer();
  w.u8(ID[tag.type]);
  w.str(name);
  w.payload(tag.type, tag.value);
  return Buffer.concat(w.parts);
}

/** level.dat（8バイトのヘッダー + NBT） */
function readLevelDat(buf) {
  const version = buf.readInt32LE(0);
  const len = buf.readInt32LE(4);
  const root = readRoot(buf.subarray(8, 8 + len));
  return { version, name: root.name, tag: root.tag };
}

function writeLevelDat({ version, name, tag }) {
  const body = writeRoot(tag, name || '');
  const head = Buffer.alloc(8);
  head.writeInt32LE(version, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

const get = (compound, key) => compound?.[key]?.value;

module.exports = { readRoot, readAll, writeRoot, readLevelDat, writeLevelDat, get, TYPES };
