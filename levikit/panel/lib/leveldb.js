'use strict';
// 依存なしの LevelDB 読み書き（Minecraft 統合版の Mojang 版 LevelDB に対応）
//
// 読み込み: CURRENT → MANIFEST（VersionEdit）で生きているテーブルとログを特定し、
//           テーブル(.ldb/.sst)とログ(.log)から「キーごとに最新のシーケンス番号の値」を取り出す
//           ブロック圧縮: 0=なし 1=snappy 2=zlib 4=zlib(raw, Mojang)
// 書き込み: ソート済みのキー/値から SST（無圧縮 or zlib raw）と MANIFEST / CURRENT を作る
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');

const BLOCK_SIZE = 32768; // ログのブロック
const HEADER = 7;
const TABLE_MAGIC = Buffer.from([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb]);

// ---------------- varint ----------------
function readVarint(buf, pos) {
  let result = 0;
  let mul = 1;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new Error('varint overflow');
    const b = buf[pos++];
    result += (b & 0x7f) * mul;
    if (!(b & 0x80)) return [result, pos];
    mul *= 128;
  }
  throw new Error('bad varint');
}

function writeVarint(n, out) {
  let v = n;
  while (v >= 0x80) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}

const varintBuf = (n) => Buffer.from(writeVarint(n, []));

// ---------------- CRC32C (Castagnoli) ----------------
const CRC32C_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0x82f63b78 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32c(...bufs) {
  let c = 0xffffffff;
  for (const b of bufs) for (let i = 0; i < b.length; i++) c = CRC32C_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function maskCrc(c) {
  return ((((c >>> 15) | (c << 17)) >>> 0) + 0xa282ead8) >>> 0;
}

// ---------------- snappy ----------------
function snappyUncompress(src) {
  let [len, pos] = readVarint(src, 0);
  const out = Buffer.allocUnsafe(len);
  let op = 0;
  while (pos < src.length) {
    const tag = src[pos++];
    const type = tag & 3;
    if (type === 0) {
      let l = tag >>> 2;
      if (l >= 60) {
        const bytes = l - 59;
        l = 0;
        for (let i = 0; i < bytes; i++) l |= src[pos++] << (8 * i);
      }
      l += 1;
      src.copy(out, op, pos, pos + l);
      pos += l;
      op += l;
      continue;
    }
    let l;
    let off;
    if (type === 1) {
      l = ((tag >>> 2) & 7) + 4;
      off = ((tag >>> 5) << 8) | src[pos++];
    } else if (type === 2) {
      l = (tag >>> 2) + 1;
      off = src[pos] | (src[pos + 1] << 8);
      pos += 2;
    } else {
      l = (tag >>> 2) + 1;
      off = src.readUInt32LE(pos);
      pos += 4;
    }
    for (let i = 0; i < l; i++, op++) out[op] = out[op - off];
  }
  if (op !== len) throw new Error('snappy length mismatch');
  return out;
}

function decompressBlock(type, data) {
  switch (type) {
    case 0:
      return data;
    case 1:
      return snappyUncompress(data);
    case 2:
      return zlib.inflateSync(data);
    case 4:
      return zlib.inflateRawSync(data);
    default:
      throw new Error(`未対応のブロック圧縮: ${type}`);
  }
}

// ---------------- internal key ----------------
function splitInternalKey(ikey) {
  const n = ikey.length - 8;
  if (n < 0) throw new Error('internal key too short');
  const type = ikey[n];
  const seq = ikey.readUIntLE(n + 1, 6) + ikey[n + 7] * 2 ** 48;
  return { key: ikey.subarray(0, n), type, seq };
}

function makeInternalKey(key, seq, type = 1) {
  const t = Buffer.alloc(8);
  t[0] = type;
  t.writeUIntLE(seq % 2 ** 48, 1, 6);
  t[7] = Math.floor(seq / 2 ** 48);
  return Buffer.concat([key, t]);
}

// ---------------- block ----------------
function* iterateBlock(block) {
  if (block.length < 4) return;
  const numRestarts = block.readUInt32LE(block.length - 4);
  const limit = block.length - 4 - numRestarts * 4;
  let pos = 0;
  let last = Buffer.alloc(0);
  while (pos < limit) {
    let shared;
    let nonShared;
    let valueLen;
    [shared, pos] = readVarint(block, pos);
    [nonShared, pos] = readVarint(block, pos);
    [valueLen, pos] = readVarint(block, pos);
    const key = Buffer.allocUnsafe(shared + nonShared);
    last.copy(key, 0, 0, shared);
    block.copy(key, shared, pos, pos + nonShared);
    pos += nonShared;
    const value = block.subarray(pos, pos + valueLen);
    pos += valueLen;
    last = key;
    yield [key, value];
  }
}

function readBlockHandle(buf, pos) {
  let offset;
  let size;
  [offset, pos] = readVarint(buf, pos);
  [size, pos] = readVarint(buf, pos);
  return [{ offset, size }, pos];
}

// ---------------- reader ----------------
class LevelDBReader {
  constructor(dir) {
    this.dir = dir;
    this.tables = [];
    this.logs = [];
    this.mode = 'manifest';
    this.stats = { tables: 0, logs: 0, blocks: 0, entries: 0, compression: {} };
  }

  async open() {
    const names = await fsp.readdir(this.dir);
    try {
      const current = (await fsp.readFile(path.join(this.dir, 'CURRENT'), 'utf8')).trim();
      const manifest = await fsp.readFile(path.join(this.dir, current));
      const v = this.parseManifest(manifest);
      const byNumber = new Map();
      for (const n of names) {
        const m = /^(\d+)\.(ldb|sst)$/.exec(n);
        if (m) byNumber.set(Number(m[1]), n);
      }
      this.tables = [];
      for (const f of v.files.values()) {
        const name = byNumber.get(f.number);
        if (!name) throw new Error(`テーブル ${f.number} がありません`);
        this.tables.push(path.join(this.dir, name));
      }
      const minLog = Math.min(v.logNumber ?? 0, v.prevLogNumber || Infinity);
      this.logs = names
        .map((n) => /^(\d+)\.log$/.exec(n))
        .filter((m) => m && Number(m[1]) >= minLog)
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .map((m) => path.join(this.dir, m[0]));
      this.version = v;
    } catch (e) {
      // MANIFEST が読めない場合はフォルダ内の全ファイルを対象にする（シーケンス番号で新旧を判定）
      this.mode = `fallback (${e.message})`;
      this.tables = names.filter((n) => /^\d+\.(ldb|sst)$/.test(n)).map((n) => path.join(this.dir, n));
      this.logs = names.filter((n) => /^\d+\.log$/.test(n)).sort().map((n) => path.join(this.dir, n));
    }
    return this;
  }

  /** ログ形式（MANIFEST と .log 共通）のレコードを取り出す */
  static *logRecords(buf) {
    let pos = 0;
    let pending = null;
    while (pos + HEADER <= buf.length) {
      const blockRemain = BLOCK_SIZE - (pos % BLOCK_SIZE);
      if (blockRemain < HEADER) {
        pos += blockRemain;
        continue;
      }
      const len = buf.readUInt16LE(pos + 4);
      const type = buf[pos + 6];
      if (type === 0 && len === 0) {
        // ゼロ埋め（事前確保された領域）→ 次のブロックへ
        pos += blockRemain;
        continue;
      }
      const data = buf.subarray(pos + HEADER, pos + HEADER + len);
      if (data.length < len) break; // 書き込み途中で切れている
      pos += HEADER + len;
      if (type === 1) {
        pending = null;
        yield data;
      } else if (type === 2) {
        pending = [data];
      } else if (type === 3) {
        if (pending) pending.push(data);
      } else if (type === 4) {
        if (pending) {
          pending.push(data);
          yield Buffer.concat(pending);
        }
        pending = null;
      } else {
        break;
      }
    }
  }

  parseManifest(buf) {
    const files = new Map();
    const v = { files, logNumber: 0, prevLogNumber: 0, nextFile: 0, lastSequence: 0, comparator: null };
    for (const rec of LevelDBReader.logRecords(buf)) {
      let pos = 0;
      while (pos < rec.length) {
        let tag;
        [tag, pos] = readVarint(rec, pos);
        let n;
        let level;
        let len;
        switch (tag) {
          case 1:
            [len, pos] = readVarint(rec, pos);
            v.comparator = rec.subarray(pos, pos + len).toString();
            pos += len;
            break;
          case 2:
            [v.logNumber, pos] = readVarint(rec, pos);
            break;
          case 3:
            [v.nextFile, pos] = readVarint(rec, pos);
            break;
          case 4:
            [v.lastSequence, pos] = readVarint(rec, pos);
            break;
          case 5:
            [level, pos] = readVarint(rec, pos);
            [len, pos] = readVarint(rec, pos);
            pos += len;
            break;
          case 6:
            [level, pos] = readVarint(rec, pos);
            [n, pos] = readVarint(rec, pos);
            files.delete(`${level}:${n}`);
            break;
          case 7: {
            let size;
            [level, pos] = readVarint(rec, pos);
            [n, pos] = readVarint(rec, pos);
            [size, pos] = readVarint(rec, pos);
            [len, pos] = readVarint(rec, pos);
            const smallest = rec.subarray(pos, pos + len);
            pos += len;
            [len, pos] = readVarint(rec, pos);
            const largest = rec.subarray(pos, pos + len);
            pos += len;
            files.set(`${level}:${n}`, { level, number: n, size, smallest, largest });
            break;
          }
          case 9:
            [v.prevLogNumber, pos] = readVarint(rec, pos);
            break;
          default:
            throw new Error(`MANIFEST: 未知のタグ ${tag}`);
        }
      }
    }
    return v;
  }

  /** テーブル1つ分のエントリ（内部キー単位） */
  *tableEntries(buf, file) {
    if (buf.length < 48) throw new Error(`${file}: テーブルが短すぎます`);
    const footer = buf.subarray(buf.length - 48);
    if (!footer.subarray(40).equals(TABLE_MAGIC)) throw new Error(`${file}: テーブルのマジックが違います`);
    let pos = 0;
    let metaHandle;
    let indexHandle;
    [metaHandle, pos] = readBlockHandle(footer, pos);
    [indexHandle, pos] = readBlockHandle(footer, pos);
    void metaHandle;
    const index = this.readBlock(buf, indexHandle, file);
    for (const [, handleBuf] of iterateBlock(index)) {
      const [h] = readBlockHandle(handleBuf, 0);
      const block = this.readBlock(buf, h, file);
      for (const [ikey, value] of iterateBlock(block)) {
        const { key, type, seq } = splitInternalKey(ikey);
        yield { key, type, seq, value };
      }
    }
  }

  readBlock(buf, h, file) {
    const data = buf.subarray(h.offset, h.offset + h.size);
    const type = buf[h.offset + h.size];
    if (data.length !== h.size || type === undefined) throw new Error(`${file}: ブロックが範囲外です`);
    this.stats.blocks++;
    this.stats.compression[type] = (this.stats.compression[type] || 0) + 1;
    return decompressBlock(type, data);
  }

  *logEntries(buf) {
    for (const rec of LevelDBReader.logRecords(buf)) {
      if (rec.length < 12) continue;
      const baseSeq = rec.readUIntLE(0, 6) + rec[6] * 2 ** 48; // 上位1バイトは実用上 0
      const count = rec.readUInt32LE(8);
      let pos = 12;
      for (let i = 0; i < count && pos < rec.length; i++) {
        const type = rec[pos++];
        let len;
        [len, pos] = readVarint(rec, pos);
        const key = rec.subarray(pos, pos + len);
        pos += len;
        let value = null;
        if (type === 1) {
          [len, pos] = readVarint(rec, pos);
          value = rec.subarray(pos, pos + len);
          pos += len;
        }
        yield { key, type, seq: baseSeq + i, value };
      }
    }
  }

  /**
   * 生きているキーのうち filter(key) が true のものを、最新の値で返す（削除済みは除く）
   * @returns Map<string(hex), {key: Buffer, value: Buffer}>
   */
  async collect(filter = () => true, onProgress) {
    const best = new Map(); // hex -> {seq, type, key, value}
    const consider = (e) => {
      this.stats.entries++;
      if (!filter(e.key)) return;
      const k = e.key.toString('hex');
      const cur = best.get(k);
      if (!cur || e.seq > cur.seq) best.set(k, { seq: e.seq, type: e.type, key: Buffer.from(e.key), value: e.value ? Buffer.from(e.value) : null });
    };
    let i = 0;
    for (const t of this.tables) {
      const buf = await fsp.readFile(t);
      for (const e of this.tableEntries(buf, t)) consider(e);
      this.stats.tables++;
      if (onProgress) onProgress(++i, this.tables.length + this.logs.length);
    }
    for (const l of this.logs) {
      const buf = await fsp.readFile(l);
      for (const e of this.logEntries(buf)) consider(e);
      this.stats.logs++;
      if (onProgress) onProgress(++i, this.tables.length + this.logs.length);
    }
    const out = new Map();
    for (const [k, v] of best) if (v.type === 1) out.set(k, { key: v.key, value: v.value });
    return out;
  }
}

// ---------------- writer ----------------
class BlockBuilder {
  constructor(restartInterval = 16) {
    this.restartInterval = restartInterval;
    this.reset();
  }
  reset() {
    this.parts = [];
    this.size = 0;
    this.restarts = [0];
    this.counter = 0;
    this.last = Buffer.alloc(0);
    this.empty = true;
  }
  add(key, value) {
    let shared = 0;
    if (this.counter < this.restartInterval) {
      const max = Math.min(this.last.length, key.length);
      while (shared < max && this.last[shared] === key[shared]) shared++;
    } else {
      this.restarts.push(this.size);
      this.counter = 0;
    }
    const head = Buffer.from(writeVarint(value.length, writeVarint(key.length - shared, writeVarint(shared, []))));
    const delta = key.subarray(shared);
    this.parts.push(head, delta, value);
    this.size += head.length + delta.length + value.length;
    this.last = key;
    this.counter++;
    this.empty = false;
  }
  estimatedSize() {
    return this.size + this.restarts.length * 4 + 4;
  }
  finish() {
    const tail = Buffer.alloc(this.restarts.length * 4 + 4);
    this.restarts.forEach((r, i) => tail.writeUInt32LE(r, i * 4));
    tail.writeUInt32LE(this.restarts.length, this.restarts.length * 4);
    return Buffer.concat([...this.parts, tail]);
  }
}

class TableWriter {
  constructor(file, { compression = 'none', blockSize = 4096 } = {}) {
    this.file = file;
    this.fd = fs.openSync(file, 'w');
    this.offset = 0;
    this.compression = compression;
    this.blockSize = blockSize;
    this.data = new BlockBuilder();
    this.index = new BlockBuilder(1);
    this.pendingIndex = null;
    this.smallest = null;
    this.largest = null;
    this.count = 0;
  }
  writeRaw(buf) {
    fs.writeSync(this.fd, buf);
    this.offset += buf.length;
  }
  writeBlock(contents) {
    let type = 0;
    let body = contents;
    if (this.compression === 'zlibraw') {
      const c = zlib.deflateRawSync(contents);
      if (c.length < contents.length - contents.length / 8) {
        body = c;
        type = 4;
      }
    }
    const handle = { offset: this.offset, size: body.length };
    const t = Buffer.from([type]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32LE(maskCrc(crc32c(body, t)));
    this.writeRaw(body);
    this.writeRaw(t);
    this.writeRaw(crc);
    return handle;
  }
  encodeHandle(h) {
    return Buffer.from(writeVarint(h.size, writeVarint(h.offset, [])));
  }
  add(ikey, value) {
    if (this.pendingIndex) {
      this.index.add(this.pendingIndex.key, this.encodeHandle(this.pendingIndex.handle));
      this.pendingIndex = null;
    }
    if (!this.smallest) this.smallest = ikey;
    this.largest = ikey;
    this.data.add(ikey, value);
    this.count++;
    if (this.data.estimatedSize() >= this.blockSize) this.flush();
  }
  flush() {
    if (this.data.empty) return;
    const lastKey = this.data.last;
    const handle = this.writeBlock(this.data.finish());
    this.data.reset();
    this.pendingIndex = { key: lastKey, handle };
  }
  finish() {
    this.flush();
    if (this.pendingIndex) {
      this.index.add(this.pendingIndex.key, this.encodeHandle(this.pendingIndex.handle));
      this.pendingIndex = null;
    }
    const meta = new BlockBuilder();
    const metaHandle = this.writeBlock(meta.finish());
    const indexHandle = this.writeBlock(this.index.finish());
    const footer = Buffer.alloc(48);
    const handles = Buffer.concat([this.encodeHandle(metaHandle), this.encodeHandle(indexHandle)]);
    handles.copy(footer, 0);
    TABLE_MAGIC.copy(footer, 40);
    this.writeRaw(footer);
    fs.closeSync(this.fd);
    return { size: this.offset, smallest: this.smallest, largest: this.largest, count: this.count };
  }
}

/** ログ形式で records を書き出す（MANIFEST 用） */
function encodeLog(records) {
  const out = [];
  let blockOffset = 0;
  for (const rec of records) {
    let left = rec;
    let begin = true;
    do {
      const leftover = BLOCK_SIZE - blockOffset;
      if (leftover < HEADER) {
        if (leftover > 0) out.push(Buffer.alloc(leftover));
        blockOffset = 0;
      }
      const avail = BLOCK_SIZE - blockOffset - HEADER;
      const fragment = left.subarray(0, avail);
      const end = fragment.length === left.length;
      const type = begin && end ? 1 : begin ? 2 : end ? 4 : 3;
      const hdr = Buffer.alloc(HEADER);
      hdr.writeUInt32LE(maskCrc(crc32c(Buffer.from([type]), fragment)), 0);
      hdr.writeUInt16LE(fragment.length, 4);
      hdr[6] = type;
      out.push(hdr, fragment);
      blockOffset += HEADER + fragment.length;
      left = left.subarray(fragment.length);
      begin = false;
    } while (left.length > 0);
  }
  return Buffer.concat(out);
}

function encodeVersionEdit(v) {
  const parts = [];
  const slice = (b) => parts.push(varintBuf(b.length), b);
  if (v.comparator) {
    parts.push(varintBuf(1));
    slice(Buffer.from(v.comparator));
  }
  if (v.logNumber !== undefined) parts.push(varintBuf(2), varintBuf(v.logNumber));
  if (v.prevLogNumber !== undefined) parts.push(varintBuf(9), varintBuf(v.prevLogNumber));
  if (v.nextFile !== undefined) parts.push(varintBuf(3), varintBuf(v.nextFile));
  if (v.lastSequence !== undefined) parts.push(varintBuf(4), varintBuf(v.lastSequence));
  for (const f of v.newFiles || []) {
    parts.push(varintBuf(7), varintBuf(f.level), varintBuf(f.number), varintBuf(f.size));
    slice(f.smallest);
    slice(f.largest);
  }
  return Buffer.concat(parts);
}

/**
 * 新しい LevelDB を作る。entries は {key: Buffer, value: Buffer} の配列（重複なし）
 * テーブルは重なりのない範囲で分割して最下層(レベル6)に置く → 開いた直後にコンパクションが走らない
 */
async function writeDatabase(dir, entries, { compression = 'none', tableSize = 8 * 1024 * 1024 } = {}) {
  await fsp.mkdir(dir, { recursive: true });
  const sorted = [...entries].sort((a, b) => Buffer.compare(a.key, b.key));
  for (let i = 1; i < sorted.length; i++) {
    if (Buffer.compare(sorted[i - 1].key, sorted[i].key) === 0) throw new Error('キーが重複しています');
  }
  let fileNo = 5;
  let seq = 0;
  const newFiles = [];
  let tw = null;
  const close = () => {
    if (!tw) return;
    const r = tw.finish();
    newFiles.push({ level: sorted.length ? 6 : 0, number: tw.number, size: r.size, smallest: r.smallest, largest: r.largest });
    tw = null;
  };
  for (const e of sorted) {
    if (!tw) {
      tw = new TableWriter(path.join(dir, `${String(fileNo).padStart(6, '0')}.ldb`), { compression });
      tw.number = fileNo++;
    }
    tw.add(makeInternalKey(e.key, ++seq, 1), e.value);
    if (tw.offset >= tableSize) close();
  }
  close();
  const logNumber = fileNo++;
  const manifestNumber = fileNo++;
  const edit = encodeVersionEdit({
    comparator: 'leveldb.BytewiseComparator',
    logNumber,
    prevLogNumber: 0,
    nextFile: fileNo,
    lastSequence: seq,
    newFiles,
  });
  const manifestName = `MANIFEST-${String(manifestNumber).padStart(6, '0')}`;
  await fsp.writeFile(path.join(dir, manifestName), encodeLog([edit]));
  await fsp.writeFile(path.join(dir, 'CURRENT'), manifestName + '\n');
  return { tables: newFiles.length, entries: sorted.length, lastSequence: seq };
}

module.exports = {
  LevelDBReader,
  writeDatabase,
  encodeLog,
  encodeVersionEdit,
  makeInternalKey,
  splitInternalKey,
  crc32c,
  maskCrc,
  snappyUncompress,
  readVarint,
  writeVarint,
};
