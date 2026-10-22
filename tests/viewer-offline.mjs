// the panel's artifact viewer without a browser: what is inside an artifact (panel/lib/unpack.mjs) — zips as runners and
// people make them (stored, deflate, zstd; data descriptors; Shift_JIS names, Info-ZIP's Unicode path; zip64; a CRC that
// does not match; a password), tars (ustar's prefix, GNU's long names, pax), .gz and .zst of one, the kinds by name and by
// the first bytes, text in UTF-8 and Shift_JIS, JSON indented, a hex dump; a run's results.sealed as app/lib/vault.mjs seals
// it (gzip by the vault itself, zstd made here as a runner with zstd makes it; APP_CACHE_KEY or GOOGLE_AAS_TOKEN; another
// key; altered) — then the way to it: the sign-in service's GET /artifact (auth/handler.mjs) against a fake GitHub and a
// fake storage (the token to GitHub only, never to the storage; the storage's address read from GitHub's redirect and kept
// a minute; a range passed on; GitHub's refusals in its own short words; CORS for the panel alone), the panel's reader
// through it (lib/artifact.mjs: a small artifact read whole, a big zip a part at a time, one kept as one file, an old
// service, a token renewed), and auth/node.mjs passing a big one on as it comes. node tests/viewer-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(TOP, p)).href);
const U = await imp('panel/lib/unpack.mjs'), AR = await imp('panel/lib/artifact.mjs'), Z = await imp('panel/lib/zstd.mjs');
const A = await imp('auth/handler.mjs'), V = await imp('app/lib/vault.mjs'), NODE = await imp('auth/node.mjs');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.stack?.split('\n').slice(0, 3).join('\n     ') ?? e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const rejects = async (p, code, m) => { try { await p; } catch (e) { if (e.code !== code) throw new Error(`${m}: want ${code} got ${e.code} (${e.message})`); return e; } throw new Error(`${m}: did not fail`); };
// (Node's own zstd and CRC-32 make what is checked here: Node 22.15 or newer)
if (typeof zlib.zstdCompressSync !== 'function' || typeof zlib.crc32 !== 'function') { console.log(`skip: this Node (${process.version}) has no zlib zstd / crc32 — Node 22.15 or newer runs this test`); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-lab-viewer-'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(200, 1)]);
const crc = (b) => zlib.crc32(b) >>> 0;

// ---- a zip writer of its own (not the one under test): entries as given, each with what a maker may do ----
/** [{ name, data, method (0 | 8 | 93), name bytes (raw) / utf8 flag, unicode (Info-ZIP's extra), descriptor, badCrc, password }]
 *  → a zip; zip64: the end records of zip64 (and 0xffffffff where its fields say so) */
function makeZip(entries, { zip64 = false, comment = '' } = {}) {
  const parts = [], central = [];
  let off = 0;
  const push = (b) => { parts.push(b); off += b.length; };
  for (const e of entries) {
    const data = Buffer.from(e.data), method = e.method ?? 8;
    const comp = method === 0 ? data : method === 8 ? zlib.deflateRawSync(data) : zlib.zstdCompressSync(data);
    const nameB = e.raw ?? Buffer.from(e.name, 'utf8'), flags = (e.utf8 === false ? 0 : 0x800) | (e.descriptor ? 8 : 0) | (e.password ? 1 : 0);
    const c = e.badCrc ? (crc(data) ^ 1) >>> 0 : crc(data);
    const extra = e.unicode ? (() => { const u = Buffer.from(e.unicode, 'utf8'), x = Buffer.alloc(9 + u.length); x.writeUInt16LE(0x7075, 0); x.writeUInt16LE(5 + u.length, 2); x[4] = 1; x.writeUInt32LE(crc(nameB), 5); u.copy(x, 9); return x; })() : Buffer.alloc(0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(e.descriptor ? 0 : c, 14); lh.writeUInt32LE(e.descriptor ? 0 : comp.length, 18); lh.writeUInt32LE(e.descriptor ? 0 : data.length, 22);
    lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(e.localExtra?.length ?? 0, 28);
    const at = off;
    push(Buffer.concat([lh, nameB, e.localExtra ?? Buffer.alloc(0), comp]));
    if (e.descriptor) { const dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(c, 4); dd.writeUInt32LE(comp.length, 8); dd.writeUInt32LE(data.length, 12); push(dd); }
    const z64 = zip64 ? (() => { const x = Buffer.alloc(28); x.writeUInt16LE(1, 0); x.writeUInt16LE(24, 2); x.writeBigUInt64LE(BigInt(data.length), 4); x.writeBigUInt64LE(BigInt(comp.length), 12); x.writeBigUInt64LE(BigInt(at), 20); return x; })() : Buffer.alloc(0);
    const ch = Buffer.alloc(46), all = Buffer.concat([extra, z64]);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(zip64 ? 45 : 20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(c, 16); ch.writeUInt32LE(zip64 ? 0xffffffff : comp.length, 20); ch.writeUInt32LE(zip64 ? 0xffffffff : data.length, 24);
    ch.writeUInt16LE(nameB.length, 28); ch.writeUInt16LE(all.length, 30); ch.writeUInt32LE(zip64 ? 0xffffffff : at, 42);
    central.push(Buffer.concat([ch, nameB, all]));
  }
  const cd = Buffer.concat(central), cdAt = off;
  push(cd);
  if (zip64) {
    const r = Buffer.alloc(56); r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE(45, 12); r.writeUInt16LE(45, 14);
    r.writeBigUInt64LE(BigInt(entries.length), 24); r.writeBigUInt64LE(BigInt(entries.length), 32); r.writeBigUInt64LE(BigInt(cd.length), 40); r.writeBigUInt64LE(BigInt(cdAt), 48);
    const recAt = off; push(r);
    const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(recAt), 8); l.writeUInt32LE(1, 16); push(l);
  }
  const end = Buffer.alloc(22), cm = Buffer.from(comment);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(zip64 ? 0xffff : entries.length, 8); end.writeUInt16LE(zip64 ? 0xffff : entries.length, 10);
  end.writeUInt32LE(zip64 ? 0xffffffff : cd.length, 12); end.writeUInt32LE(zip64 ? 0xffffffff : cdAt, 16); end.writeUInt16LE(cm.length, 20);
  push(Buffer.concat([end, cm]));
  return new Uint8Array(Buffer.concat(parts));
}
const names = (box) => box.files.map((f) => f.path);
const text = async (f) => Buffer.from(await f.get()).toString('utf8');

await t('zip: stored, deflate and zstd entries; a data descriptor; folders only in the paths; Shift_JIS names and Info-ZIP\'s Unicode path; a comment at the end; each file read when asked, its CRC checked', async () => {
  const big = Buffer.from('log line\n'.repeat(5000));
  const z = makeZip([
    { name: 'run/report.md', data: '# app: PASS\n', method: 0 },
    { name: 'run/shot-1.png', data: PNG, method: 8 },
    { name: 'run/recordings/rec-1.mp4', data: MP4, method: 93 },
    { name: 'run/server.log', data: big, method: 8, descriptor: true },
    { name: 'run/', data: '', method: 0 },
    { raw: Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x2e, 0x74, 0x78, 0x74]), name: '', data: 'sjis', utf8: false },
    { raw: Buffer.from('old?name.txt'), name: '', data: 'unicode', utf8: false, unicode: 'ユニコード.txt' },
  ], { comment: 'made by a test' });
  const box = await U.zipBox(U.bytesReader(z));
  eq(names(box), ['run/report.md', 'run/shot-1.png', 'run/recordings/rec-1.mp4', 'run/server.log', '日本語.txt', 'ユニコード.txt']);
  eq(box.files.map((f) => f.kind), ['text', 'image', 'video', 'text', 'text', 'text']);
  eq([box.files[1].name, box.files[1].folder, box.files[2].folder, box.files[1].mime], ['shot-1.png', 'run', 'run/recordings', 'image/png']);
  eq(await text(box.files[0]), '# app: PASS\n');
  ok(Buffer.compare(Buffer.from(await box.files[1].get()), PNG) === 0, 'the picture, deflated');
  ok(Buffer.compare(Buffer.from(await box.files[2].get()), MP4) === 0, 'the video, in zstd (method 93)');
  ok(Buffer.compare(Buffer.from(await box.files[3].get()), big) === 0 && box.files[3].size === big.length, 'the log, with a data descriptor (its sizes in the directory)');
  eq([await text(box.files[4]), await text(box.files[5])], ['sjis', 'unicode']);
  const first = await box.files[0].get();
  ok(first === (await box.files[0].get()), 'read once, kept');
});

await t('zip: zip64 end records and sizes; a CRC that does not match and a password said in words; not a zip, a cut one', async () => {
  const z = await U.zipBox(U.bytesReader(makeZip([{ name: 'a.txt', data: 'zip64 a' }, { name: 'b.json', data: '{"b":1}', method: 0 }], { zip64: true })));
  eq([names(z), await text(z.files[0]), await text(z.files[1])], [['a.txt', 'b.json'], 'zip64 a', '{"b":1}']);
  const bad = await U.zipBox(U.bytesReader(makeZip([{ name: 'x.txt', data: 'hello', badCrc: true }, { name: 'locked.txt', data: 'secret', password: true }])));
  const e = await rejects(bad.files[0].get(), 'crc', 'a wrong CRC');
  ok(/壊れています/.test(e.message), e.message);
  ok(/パスワード/.test((await rejects(bad.files[1].get(), 'encrypted', 'a password')).message) && bad.files[1].note === 'パスワード付き', 'a password: said, not opened');
  await rejects(U.zipBox(U.bytesReader(new Uint8Array(PNG))), 'notzip', 'a PNG is not a zip');
  const whole = makeZip([{ name: 'a.txt', data: 'x'.repeat(100) }]);
  await rejects(U.zipBox(U.bytesReader(whole.subarray(0, whole.length - 30))), 'notzip', 'its end cut off');
  await rejects(U.zipBox(U.bytesReader(Uint8Array.from([...whole.subarray(0, 40), ...whole.subarray(60)]))), 'broken', 'its middle cut out: the directory not where it says');
  // (a file's data cut short: said when it is opened)
  const short = makeZip([{ name: 'a.txt', data: 'y'.repeat(100), method: 0 }]), es = await U.zipEntries(U.bytesReader(short));
  await rejects(U.zipRead({ size: 60, read: async (a, b) => short.subarray(a, Math.min(b, 60)) }, es[0]), 'broken', 'its data cut short');
  // (a file's bytes after their first read are kept: a failure is asked again)
  let n = 0;
  const f = U.fileOf('a/b.txt', 3, () => { n++; if (n === 1) throw new Error('once'); return new Uint8Array([1, 2, 3]); });
  await f.get().catch(() => { /* the first one fails */ });
  eq([[...(await f.get())], n], [[1, 2, 3], 2], 'a failed read is tried again');
});

await t('tar: ustar with its prefix, GNU long names, pax path and size; folders and links left out; a .tar.gz and a .zst of one file opened as boxes', async () => {
  const d = path.join(tmp, 'tar'), long = `${'d'.repeat(60)}/${'n'.repeat(120)}.txt`, split = `${'u'.repeat(80)}/${'v'.repeat(70)}.txt`;
  fs.mkdirSync(path.join(d, path.dirname(long)), { recursive: true });
  fs.mkdirSync(path.join(d, path.dirname(split)), { recursive: true });
  fs.writeFileSync(path.join(d, long), 'long');
  fs.writeFileSync(path.join(d, split), 'split');
  fs.writeFileSync(path.join(d, 'shot.png'), PNG);
  fs.writeFileSync(path.join(d, '日本語のメモ.txt'), 'メモ');
  fs.symlinkSync('shot.png', path.join(d, 'link.png'));
  const gnu = new Uint8Array(execFileSync('tar', ['--format=gnu', '-C', d, '-cf', '-', '.']));
  const pax = new Uint8Array(execFileSync('tar', ['--format=pax', '-C', d, '-cf', '-', '.']));
  // (ustar: a path over 100 characters split into its prefix and name)
  const ustar = new Uint8Array(execFileSync('tar', ['--format=ustar', '-C', d, '-cf', '-', 'shot.png', split]));
  for (const [what, b, want] of [['gnu', gnu, [long, split, 'shot.png', '日本語のメモ.txt']], ['pax', pax, [long, split, 'shot.png', '日本語のメモ.txt']], ['ustar', ustar, ['shot.png', split]]]) {
    const box = U.tarBox(b);
    eq(names(box).sort(), [...want].sort(), what);
    ok(Buffer.compare(Buffer.from(await box.files.find((f) => f.name === 'shot.png').get()), PNG) === 0, `${what}: the picture's bytes`);
  }
  const tgz = U.fileOf('logs.tar.gz', 0, () => new Uint8Array(zlib.gzipSync(gnu)));
  eq(names(await U.boxOf(tgz)).sort(), [long, split, 'shot.png', '日本語のメモ.txt'].sort(), 'a .tar.gz');
  const one = await U.boxOf(U.fileOf('server.log.zst', 0, () => new Uint8Array(zlib.zstdCompressSync(Buffer.from('a line\n')))));
  eq([one.kind, names(one), await text(one.files[0])], ['single', ['server.log'], 'a line\n'], 'a .zst of one file: that file');
  const tzst = await U.boxOf(U.fileOf('x.tzst', 0, () => new Uint8Array(zlib.zstdCompressSync(Buffer.from(ustar)))));
  eq(names(tzst), ['shot.png', split], 'a .tzst');
  eq(await U.boxOf(U.fileOf('plain.txt', 0, () => new Uint8Array(Buffer.from('just text')))), null, 'a file that holds none: null');
  // (a header whose checksum is wrong: not read as files)
  const broken = Uint8Array.from(ustar); broken[0] ^= 0x20;
  ok((() => { try { U.tarFiles(broken); return false; } catch (e) { return e.code === 'broken'; } })(), 'a header altered: broken');
});

await t('kinds: by the name (Minecraft\'s own files too) and, when the name says nothing or lies, by the first bytes', async () => {
  const k = (n) => U.kindOf(n).kind;
  eq(['a.PNG', 'b.jpeg', 'c.webp', 'd.svg', 'e.mp4', 'f.webm', 'g.mov', 'h.ogg', 'i.json', 'j.jsonl', 'k.lang', 'l.mcfunction', 'm.mcaddon', 'n.mcpack', 'o.mcworld', 'p.tar', 'q.tgz', 'r.zst', 's.sealed', 't.pdf', 'README', '.gitignore', '.env.local', 'u.material', 'v.mcstructure', 'w'].map(k),
    ['image', 'image', 'image', 'image', 'video', 'video', 'video', 'audio', 'text', 'text', 'text', 'text', 'archive', 'archive', 'archive', 'archive', 'archive', 'archive', 'sealed', 'pdf', 'text', 'text', 'text', 'text', 'unknown', 'unknown']);
  const s = (b) => U.sniff(new Uint8Array(b))?.mime ?? null;
  eq([s(PNG), s(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), s(Buffer.from('GIF89a......')), s(MP4), s(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), s(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2])), s(Buffer.from('OggS\0\x02xxxx')), s(Buffer.from('%PDF-1.7\n')),
    s(makeZip([{ name: 'a', data: 'a' }])), s(zlib.gzipSync('x')), s(zlib.zstdCompressSync(Buffer.from('x'))), s(Buffer.from('BDSLABV1........')), s(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="x">')), s(Buffer.from('plain words\n')), s(Buffer.from([0, 1, 2, 3, 0, 0, 7]))],
  ['image/png', 'image/jpeg', 'image/gif', 'video/mp4', 'image/webp', 'video/webm', 'audio/ogg', 'application/pdf', 'application/zip', 'application/gzip', 'application/zstd', 'application/octet-stream', 'image/svg+xml', 'text/plain', null]);
  const named = (n, b) => U.settle(U.fileOf(n, b.length, () => b), new Uint8Array(b));
  eq([named('photo.txt', PNG).kind, named('noext', PNG).kind, named('000003.log', Buffer.from([0, 0, 1, 0, 9, 9, 0, 0])).kind, named('notes', Buffer.from('words')).kind, named('a.png', Buffer.from('not a png')).kind],
    ['image', 'image', 'binary', 'text', 'image'], 'a picture named .txt is a picture; a LevelDB .log is bytes; a name that says image is believed');
});

await t('text: UTF-8 (its BOM dropped) and Shift_JIS; a long one cut on a whole character; JSON and JSON Lines indented; a hex dump', async () => {
  eq(U.textOf(new Uint8Array(Buffer.from('﻿こんにちは'))), { text: 'こんにちは', encoding: 'UTF-8', cut: false });
  eq(U.textOf(new Uint8Array([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd])).encoding, 'Shift_JIS');
  eq(U.textOf(new Uint8Array([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd])).text, 'こんにちは');
  const cut = U.textOf(new Uint8Array(Buffer.from('あいう')), 4);
  eq([cut.text, cut.cut], ['あ', true], 'cut within い: only whole characters');
  eq(U.prettyJson('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
  eq(U.prettyJson('{"a":1}\n\n{"b":2}\n', true), '{\n  "a": 1\n}\n{\n  "b": 2\n}');
  eq(U.prettyJson('not json'), null);
  eq(U.hexDump(new Uint8Array(PNG), 16), '00000000  89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52  .PNG........IHDR');
  eq([U.crc32(new Uint8Array(Buffer.from('123456789'))), U.crc32(new Uint8Array(0))], [0xcbf43926, 0]);
});

await t('zstd (panel/lib/zstd.mjs, vendored): what Node\'s zlib makes — a frame with its size and one streamed without, two frames one after another', async () => {
  const src = Buffer.concat(Array.from({ length: 50 }, (_, i) => Buffer.from(`row ${i} `.repeat(800))));
  ok(Buffer.compare(Buffer.from(Z.decompress(new Uint8Array(zlib.zstdCompressSync(src)))), src) === 0, 'one frame');
  const streamed = await new Promise((res) => { const parts = [], z = zlib.createZstdCompress(); z.on('data', (c) => parts.push(c)); z.on('end', () => res(Buffer.concat(parts))); z.end(src); });
  ok(streamed[4] >> 6 === 0, 'streamed: no size in its header');
  const two = Buffer.concat([streamed, zlib.zstdCompressSync(Buffer.from('tail'))]);
  ok(Buffer.compare(Buffer.from(Z.decompress(new Uint8Array(two))), Buffer.concat([src, Buffer.from('tail')])) === 0, 'two frames');
  await rejects(Promise.resolve().then(() => U.unzstd(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 1, 2, 3]))), 'broken', 'a cut frame');
});

await t('results.sealed (app/lib/vault.mjs): opened with APP_CACHE_KEY (gzip, sealed by the vault itself) or GOOGLE_AAS_TOKEN (zstd, as a runner with zstd seals it); no key, another key, altered — each said', async () => {
  const run = path.join(tmp, 'run');
  fs.mkdirSync(path.join(run, 'recordings'), { recursive: true });
  fs.writeFileSync(path.join(run, 'report.md'), '# app: PASS\n');
  fs.writeFileSync(path.join(run, 'shot-1.png'), PNG);
  fs.writeFileSync(path.join(run, 'recordings', 'rec-1.mp4'), MP4);
  fs.writeFileSync(path.join(run, `${'l'.repeat(120)}.txt`), 'a long name');
  const k1 = V.vaultKey({ APP_CACHE_KEY: 'the-cache-key' }), out = path.join(tmp, 'results.sealed');
  await V.seal({ base: run, entries: fs.readdirSync(run), outFile: out, key: k1 });
  const sealed = new Uint8Array(fs.readFileSync(out)), h = U.sealedHead(sealed);
  eq([h.id, U.sniff(sealed).kind], [k1.id, 'sealed'], 'its head: the key\'s id as the runner names it');
  const r = await U.openSealed(sealed, '  the-cache-key\n');
  ok(r.ok && r.how === 'APP_CACHE_KEY', JSON.stringify({ ...r, box: undefined }));
  eq(names(r.box).sort(), [`${'l'.repeat(120)}.txt`, 'recordings/rec-1.mp4', 'report.md', 'shot-1.png'].sort());
  ok(Buffer.compare(Buffer.from(await r.box.files.find((f) => f.name === 'shot-1.png').get()), PNG) === 0 && r.box.files.find((f) => f.name === 'rec-1.mp4').kind === 'video', 'the screenshot and the recording');
  eq([(await U.openSealed(sealed, '')).why, (await U.openSealed(sealed, 'another-key')).why], ['key', 'other-key']);
  // (zstd, the key from GOOGLE_AAS_TOKEN: made here as app/lib/vault.mjs's seal makes it with zstd on the machine)
  const k2 = V.vaultKey({ GOOGLE_AAS_TOKEN: 'aas/token+value' }), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k2.key, iv);
  const ct = Buffer.concat([c.update(zlib.zstdCompressSync(execFileSync('tar', ['-C', run, '-cf', '-', '.']))), c.final()]);
  const z = new Uint8Array(Buffer.concat([Buffer.from('BDSLABV1'), Buffer.from([1]), Buffer.from(k2.id, 'hex'), iv, ct, c.getAuthTag()]));
  const r2 = await U.openSealed(z, 'aas/token+value');
  ok(r2.ok && r2.how === 'GOOGLE_AAS_TOKEN' && names(r2.box).includes('recordings/rec-1.mp4'), JSON.stringify({ ...r2, box: r2.box && names(r2.box) }));
  const altered = Uint8Array.from(z); altered[altered.length - 40] ^= 1;
  eq((await U.openSealed(altered, 'aas/token+value')).why, 'broken');
  ok(/APP_CACHE_KEY/.test(U.sealedWords('key')) && /別の鍵/.test(U.sealedWords('other-key')) && /改変/.test(U.sealedWords('broken')), 'each said in words');
  // (the panel's own vault — the live issue's key — opens what this key opens: one key typed in 「設定」 for both)
  const PV = await imp('panel/lib/vault.mjs');
  const line = await PV.sealText('live', await PV.vaultKey({ cacheKey: 'the-cache-key' }));
  eq(V.openText(line, k1), 'live', 'the same key the live issue uses');
});

// ---- the way to an artifact: a fake GitHub (API: a redirect to the storage) and a fake storage (ranges) ----
const PANEL = 'https://me.github.io', SERVICE = 'https://auth.test', GH_API = 'https://api.gh.test';
const store = new Map(), log = [];
const fakeFetch = async (url, init = {}) => {
  const u = new URL(url), hs = init.headers ?? {};
  log.push({ host: u.hostname, path: u.pathname, auth: hs.authorization ?? null, range: hs.range ?? null, redirect: init.redirect ?? 'follow' });
  if (u.hostname === 'api.gh.test') {
    const m = /^\/repos\/([^/]+\/[^/]+)\/actions\/artifacts\/(\d+)\/zip$/.exec(u.pathname);
    if (hs.authorization === 'Bearer gone') return new Response('{"message":"Bad credentials"}', { status: 401 });
    if (hs.authorization === 'Bearer limited') return new Response('{"message":"Resource not accessible"}', { status: 403 });
    if (!m || !store.has(m[2])) return new Response('{"message":"Not Found"}', { status: 404 });
    if (store.get(m[2]).expired) return new Response('{"message":"Artifact has expired"}', { status: 410 });
    if (init.redirect !== 'manual') return new Response('follow is not how it asks', { status: 500 });
    return new Response(null, { status: 302, headers: { location: `https://store.test/blob/${m[2]}?sig=short-lived` } });
  }
  if (u.hostname === 'store.test') {
    const x = store.get(u.pathname.split('/').pop());
    if (!x || u.searchParams.get('sig') !== 'short-lived' || hs.authorization) return new Response('<Error/>', { status: 403 });
    const b = x.bytes, m = /^bytes=(\d+)-(\d*)$/.exec(hs.range ?? '');
    if (!m) { x.served = (x.served ?? 0) + b.length; return new Response(b, { status: 200, headers: { 'content-type': x.type ?? 'application/zip', 'content-length': String(b.length) } }); }
    const a = Number(m[1]), e = m[2] ? Math.min(Number(m[2]), b.length - 1) : b.length - 1;
    if (a >= b.length) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${b.length}` } });
    x.served = (x.served ?? 0) + (e - a + 1);
    return new Response(b.slice(a, e + 1), { status: 206, headers: { 'content-type': x.type ?? 'application/zip', 'content-length': String(e - a + 1), 'content-range': `bytes ${a}-${e}/${b.length}` } });
  }
  throw new Error(`no network: ${url}`);
};
const ENV = { GITHUB_CLIENT_ID: 'Iv1.x', GITHUB_CLIENT_SECRET: 'secret-of-the-app', STATE_SECRET: 's'.repeat(40), PANEL_ORIGINS: `${PANEL}/lab/`, GITHUB_API: GH_API };
const service = A.handler(ENV, { fetchImpl: fakeFetch });
/** the panel's fetch, with the service answering at SERVICE (as a browser would call it: from the panel's origin) */
const panelFetch = (url, init = {}) => { const u = new URL(url); if (u.origin !== SERVICE) throw new Error(`the panel asked ${u.origin}`); return service(new Request(url, { ...init, headers: { ...init.headers, origin: PANEL } })); };
const zipOf = (n) => makeZip([{ name: 'shots/shot-1.png', data: PNG, method: 0 }, { name: 'rec.mp4', data: MP4 }, { name: 'big.log', data: crypto.randomBytes(n).toString('hex') }]);

await t('the service\'s GET /artifact: the token to GitHub alone (manual redirect), the storage asked without it; a range passed on (206, Content-Range); CORS for the panel; GitHub asked once a minute for the same artifact', async () => {
  store.set('7', { bytes: zipOf(1000) });
  const ask = (q, headers = {}, origin = PANEL) => service(new Request(`${SERVICE}/artifact?${q}`, { headers: { ...(origin ? { origin } : {}), ...headers } }));
  log.length = 0;
  const r = await ask('repo=o/lab&id=7', { authorization: 'Bearer ghu_person', range: 'bytes=0-9' });
  const h = Object.fromEntries(r.headers);
  eq([r.status, h['content-range'], h['content-length'], h['access-control-allow-origin'], h['x-artifact-type'], h['content-type'], h['cache-control'], h.vary], [206, `bytes 0-9/${store.get('7').bytes.length}`, '10', PANEL, 'application/zip', 'application/octet-stream', 'no-store', 'Origin']);
  ok(/content-range/.test(h['access-control-expose-headers']) && /content-length/.test(h['access-control-expose-headers']) && /sandbox/.test(h['content-security-policy']) && h['x-content-type-options'] === 'nosniff', JSON.stringify(h));
  eq([...new Uint8Array(await r.arrayBuffer())], [...store.get('7').bytes.subarray(0, 10)]);
  eq(log.map((x) => [x.host, x.auth, x.range, x.redirect]), [['api.gh.test', 'Bearer ghu_person', null, 'manual'], ['store.test', null, 'bytes=0-9', 'follow']], 'the token to GitHub only');
  // (the next range of the same artifact: the storage's address kept — GitHub not asked again; another token: asked)
  log.length = 0;
  const r2 = await ask('repo=o/lab&id=7', { authorization: 'Bearer ghu_person', range: 'bytes=10-' });
  eq([r2.status, log.map((x) => x.host)], [206, ['store.test']]);
  await (await ask('repo=o/lab&id=7', { authorization: 'Bearer ghu_other' })).arrayBuffer();
  eq(log.map((x) => x.host), ['store.test', 'api.gh.test', 'store.test'], 'another token: GitHub asked for it');
  // (the preflight: the token and a range may be sent, from the panel alone)
  const pre = await service(new Request(`${SERVICE}/artifact`, { method: 'OPTIONS', headers: { origin: PANEL, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization, range' } }));
  eq([pre.status, pre.headers.get('access-control-allow-headers'), pre.headers.get('access-control-allow-origin')], [204, 'authorization, range', PANEL]);
  const preBad = await service(new Request(`${SERVICE}/artifact`, { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }));
  eq(preBad.status, 403);
  const health = await (await service(new Request(`${SERVICE}/health`, { headers: { origin: PANEL } }))).json();
  eq([health.artifacts, health.version], [true, A.VERSION], 'the panel can tell the service has it');
});

await t('the service\'s GET /artifact refuses: no token, another origin, a name that is not a repository, a bad range (passed as none), GitHub\'s 401 / 403 / 404 / 410, a storage that refuses (its address forgotten), a range past the end', async () => {
  store.set('8', { bytes: zipOf(10) });
  store.set('9', { bytes: zipOf(10), expired: true });
  const ask = async (q, headers = {}, origin = PANEL) => { const r = await service(new Request(`${SERVICE}/artifact?${q}`, { headers: { ...(origin ? { origin } : {}), ...headers } })); const body = await r.text(); let j = null; try { j = JSON.parse(body); } catch { /* bytes */ } return [r.status, j?.error ?? body.length]; };
  const tok = { authorization: 'Bearer ghu_person' };
  eq(await ask('repo=o/lab&id=8', {}), [401, 'token']);
  eq(await ask('repo=o/lab&id=8', tok, 'https://evil.test'), [403, 'origin']);
  eq(await ask('repo=o/lab&id=8', tok, null), [403, 'origin']);
  for (const q of ['repo=o/..&id=8', 'repo=o&id=8', 'repo=o/lab&id=0', 'repo=o/lab&id=8x', 'repo=o%2F..%2F..%2Fx&id=8', 'id=8']) eq(await ask(q, tok), [400, 'artifact'], q);
  eq(await ask('repo=o/lab&id=8', { authorization: 'Bearer gone' }), [401, 'token']);
  eq(await ask('repo=o/lab&id=8', { authorization: 'Bearer limited' }), [403, 'forbidden']);
  eq(await ask('repo=o/lab&id=404', tok), [404, 'artifact']);
  eq(await ask('repo=o/lab&id=9', tok), [410, 'expired']);
  log.length = 0;
  eq((await ask('repo=o/lab&id=8', { ...tok, range: 'bytes=-500' }))[0], 200, 'a suffix range: the whole (the storage would give the whole anyway)');
  eq(log.find((x) => x.host === 'store.test')?.range ?? null, null, 'a range of a kind the storage does not take is not passed on');
  eq(await ask('repo=o/lab&id=8', { ...tok, range: 'bytes=999999-' }), [416, 'range']);
  // (the storage's address ran out: forgotten, and asked of GitHub again the next time)
  const real = store.get('8'); store.delete('8');
  eq(await ask('repo=o/lab&id=8', tok), [502, 'storage']);
  store.set('8', real); log.length = 0;
  eq((await ask('repo=o/lab&id=8', tok))[0], 200);
  eq(log.map((x) => x.host), ['api.gh.test', 'store.test'], 'GitHub asked again');
  eq(await ask('repo=o/lab&id=8', tok).then(() => service(new Request(`${SERVICE}/nothing`))).then((r) => r.status), 404);
});

await t('the panel\'s reader (lib/artifact.mjs): a small artifact read whole once; a big zip a part at a time — its directory, then a file when opened; one kept as one file (archive: false); an old service, no service, a token renewed once', async () => {
  // small: one request, everything after it from memory
  store.set('20', { bytes: zipOf(500) });
  log.length = 0;
  const small = AR.artifactReader({ authUrl: SERVICE, token: 'ghu_person', repo: 'o/lab', id: 20, size: store.get('20').bytes.length, fetchImpl: panelFetch });
  const box = await AR.artifactBox(small, { name: 'app-run' });
  eq(names(box), ['shots/shot-1.png', 'rec.mp4', 'big.log']);
  ok(Buffer.compare(Buffer.from(await box.files[0].get()), PNG) === 0 && Buffer.compare(Buffer.from(await box.files[1].get()), MP4) === 0, 'the picture and the video');
  eq([log.filter((x) => x.host === 'store.test').length, log.filter((x) => x.host === 'store.test')[0].range], [1, null], 'read whole, once');
  // big: ranges (whole: 1000 bytes for the test), the log never read when only the picture is opened
  store.set('21', { bytes: zipOf(300_000) });
  const all = store.get('21').bytes.length;
  log.length = 0; store.get('21').served = 0;
  let told = 0;
  const big = AR.artifactReader({ authUrl: SERVICE, token: () => 'ghu_person', repo: 'o/lab', id: 21, size: all, fetchImpl: panelFetch, whole: 1000 });
  const bbox = await AR.artifactBox(big, { name: 'big' }, { onProgress: () => { told++; } });
  ok(Buffer.compare(Buffer.from(await bbox.files[0].get()), PNG) === 0, 'the picture of a big one');
  ok(log.filter((x) => x.host === 'store.test').every((x) => /^bytes=\d+-\d+$/.test(x.range)) && store.get('21').served < 70_000 && told > 0, `ranges only, ${store.get('21').served} of ${all} bytes (the end and the picture), progress told`);
  eq(log.filter((x) => x.host === 'api.gh.test').length, 1, 'GitHub asked once for all the parts');
  ok((await text(bbox.files[2])).length === 600_000, 'the log when it is opened');
  // one file kept as it is (upload-artifact's archive: false): the artifact's name is the file's
  store.set('22', { bytes: new Uint8Array(PNG), type: 'image/png' });
  const one = await AR.artifactBox(AR.artifactReader({ authUrl: SERVICE, token: 'ghu_person', repo: 'o/lab', id: 22, size: PNG.length, fetchImpl: panelFetch }), { name: 'screen.png' });
  eq([one.kind, names(one), one.files[0].kind], ['single', ['screen.png'], 'image']);
  ok(Buffer.compare(Buffer.from(await one.files[0].get()), PNG) === 0, 'its bytes');
  // no size given: read whole first
  const nosize = await AR.artifactBox(AR.artifactReader({ authUrl: SERVICE, token: 'ghu_person', repo: 'o/lab', id: 20, fetchImpl: panelFetch }), { name: 'x' });
  eq(names(nosize).length, 3);
  // an old service (no /artifact: its 404 not_found), none configured, the network down
  const old = A.handler({ ...ENV }, { fetchImpl: fakeFetch });
  const oldFetch = async (url, init) => { const r = await old(new Request(String(url).replace('/artifact', '/no-such-route'), { ...init, headers: { ...init.headers, origin: PANEL } })); return r; };
  const e1 = await rejects(AR.artifactReader({ authUrl: SERVICE, token: 't', repo: 'o/lab', id: 20, size: 100, fetchImpl: oldFetch }).all(), 'old', 'an old service');
  ok(/置き直して/.test(e1.message), e1.message);
  await rejects(AR.artifactReader({ authUrl: null, token: 't', repo: 'o/lab', id: 20, size: 10 }).all(), 'config', 'no service');
  await rejects(AR.artifactReader({ authUrl: SERVICE, token: 't', repo: 'o/lab', id: 20, size: 10, fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')) }).all(), 'net', 'the network down');
  // a token GitHub refused: the sign-in renewed once (fresh), then asked again with the new one
  let current = 'gone', renewed = 0;
  const fr = AR.artifactReader({ authUrl: SERVICE, token: () => current, repo: 'o/lab', id: 20, size: store.get('20').bytes.length, fetchImpl: panelFetch, fresh: async () => { renewed++; current = 'ghu_person'; return true; } });
  eq([(await fr.all()).length, renewed], [store.get('20').bytes.length, 1]);
  const stuck = AR.artifactReader({ authUrl: SERVICE, token: 'gone', repo: 'o/lab', id: 20, size: 10, fetchImpl: panelFetch, fresh: async () => true });
  await rejects(stuck.all(), 'token', 'refused again: said');
  ok(/期限切れ/.test(AR.artifactWords('token')) && /期限が切れて/.test(AR.artifactWords('expired')) && /権限/.test(AR.artifactWords('forbidden')), 'each said in words');
});

await t('auth/node.mjs: an artifact passed on as it comes (a few MB, not held whole), with its headers', async () => {
  const bytes = new Uint8Array(crypto.randomBytes(3_000_000));
  store.set('30', { bytes, type: 'application/zip' });
  const srv = NODE.server(ENV, { fetchImpl: fakeFetch });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const port = srv.address().port, r = await fetch(`http://127.0.0.1:${port}/artifact?repo=o/lab&id=30`, { headers: { origin: PANEL, authorization: 'Bearer ghu_person' } });
    const got = new Uint8Array(await r.arrayBuffer());
    eq([r.status, r.headers.get('content-length'), r.headers.get('access-control-allow-origin'), got.length], [200, String(bytes.length), PANEL, bytes.length]);
    ok(Buffer.compare(Buffer.from(got), Buffer.from(bytes)) === 0, 'the same bytes');
    const part = await fetch(`http://127.0.0.1:${port}/artifact?repo=o/lab&id=30`, { headers: { origin: PANEL, authorization: 'Bearer ghu_person', range: 'bytes=100-199' } });
    eq([part.status, part.headers.get('content-range'), (await part.arrayBuffer()).byteLength], [206, `bytes 100-199/${bytes.length}`, 100]);
  } finally { await new Promise((r) => srv.close(r)); }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
