'use strict';
// .mcworld（zip）の読み書き（依存なし。ZIP64 は非対応 = 4GB まで）
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** zip の中身一覧と取り出し */
async function readZip(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('zip ではありません（終端レコードがありません）');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('ZIP64 は未対応です');
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const entries = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('zip の中央ディレクトリが壊れています');
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const crc = cd.readUInt32LE(p + 16);
      const csize = cd.readUInt32LE(p + 20);
      const usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28);
      const xlen = cd.readUInt16LE(p + 30);
      const clen = cd.readUInt16LE(p + 32);
      const local = cd.readUInt32LE(p + 42);
      const name = cd.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nlen).replace(/\\/g, '/');
      entries.push({ name, method, crc, csize, usize, local, encrypted: !!(flags & 1) });
      p += 46 + nlen + xlen + clen;
    }
    return {
      entries,
      async read(entry) {
        if (entry.encrypted) throw new Error(`暗号化された zip は扱えません: ${entry.name}`);
        const lh = Buffer.alloc(30);
        await fh.read(lh, 0, 30, entry.local);
        if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`zip のローカルヘッダーが壊れています: ${entry.name}`);
        const start = entry.local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
        const data = Buffer.alloc(entry.csize);
        await fh.read(data, 0, entry.csize, start);
        let out;
        if (entry.method === 0) out = data;
        else if (entry.method === 8) out = zlib.inflateRawSync(data);
        else throw new Error(`未対応の圧縮方式 ${entry.method}: ${entry.name}`);
        if (crc32(out) !== entry.crc) throw new Error(`CRC が一致しません: ${entry.name}`);
        return out;
      },
      close: () => fh.close(),
    };
  } catch (e) {
    await fh.close();
    throw e;
  }
}

/** zip を dir に展開。中身が1つのフォルダに入っていればその中身を返す */
async function extractZip(file, dir, { maxBytes = 8 * 1024 ** 3 } = {}) {
  const z = await readZip(file);
  const root = path.resolve(dir);
  let total = 0;
  try {
    for (const e of z.entries) {
      if (e.name.endsWith('/')) continue;
      const safe = path.normalize(e.name).replace(/^(\.\.(\/|\\|$))+/, '');
      if (safe.startsWith('..') || path.isAbsolute(safe)) throw new Error(`不正なパス: ${e.name}`);
      total += e.usize;
      if (total > maxBytes) throw new Error('展開後のサイズが大きすぎます');
      const out = path.resolve(root, safe);
      if (!out.startsWith(root + path.sep)) throw new Error(`不正なパス: ${e.name}`);
      await fsp.mkdir(path.dirname(out), { recursive: true });
      await fsp.writeFile(out, await z.read(e));
    }
  } finally {
    await z.close();
  }
  return dir;
}

/** dir の中身を zip にする（.ldb など圧縮済みのものは無圧縮で格納） */
async function zipDir(dir, outFile) {
  const files = [];
  const walk = async (d) => {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) files.push(p);
    }
  };
  await walk(dir);
  const fd = fs.openSync(outFile, 'w');
  let offset = 0;
  const central = [];
  const write = (b) => {
    fs.writeSync(fd, b);
    offset += b.length;
  };
  try {
    for (const f of files) {
      const rel = path.relative(dir, f).split(path.sep).join('/');
      const data = await fsp.readFile(f);
      const store = /\.(ldb|sst|jpe?g|png|zip)$/i.test(rel) || data.length < 64;
      const body = store ? data : zlib.deflateRawSync(data, { level: 6 });
      const method = store ? 0 : 8;
      const crc = crc32(data);
      if (offset > 0xffffffff - body.length - 1024) throw new Error('4GB を超える zip は作れません');
      const name = Buffer.from(rel, 'utf8');
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);
      lh.writeUInt16LE(0x800, 6);
      lh.writeUInt16LE(method, 8);
      lh.writeUInt32LE(0, 10); // 時刻なし
      lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(body.length, 18);
      lh.writeUInt32LE(data.length, 22);
      lh.writeUInt16LE(name.length, 26);
      lh.writeUInt16LE(0, 28);
      const local = offset;
      write(lh);
      write(name);
      write(body);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(20, 4);
      ch.writeUInt16LE(20, 6);
      ch.writeUInt16LE(0x800, 8);
      ch.writeUInt16LE(method, 10);
      ch.writeUInt32LE(0, 12);
      ch.writeUInt32LE(crc, 16);
      ch.writeUInt32LE(body.length, 20);
      ch.writeUInt32LE(data.length, 24);
      ch.writeUInt16LE(name.length, 28);
      ch.writeUInt32LE(local, 42);
      central.push(ch, name);
    }
    const cdStart = offset;
    for (const b of central) write(b);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(offset - cdStart, 12);
    end.writeUInt32LE(cdStart, 16);
    write(end);
  } finally {
    fs.closeSync(fd);
  }
  return { files: files.length, size: offset };
}

module.exports = { readZip, extractZip, zipDir, crc32 };
