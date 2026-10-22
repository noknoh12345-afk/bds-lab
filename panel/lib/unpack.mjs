// unpack: what is inside a run's artifact, for the panel's viewer (ui/viewer.mjs) — pure but for the platform's own
// DecompressionStream and crypto.subtle (browsers and Node 22 alike; zstd from ./zstd.mjs, which browsers lack). A box holds
// files: an artifact's zip (read through a reader — its central directory first, then each file's own bytes when it is
// opened, so a big zip is read a part at a time), a tar, a .gz or .zst, a .mcaddon / .mcpack / .mcworld (zips), and a run's
// results.sealed (app/lib/vault.mjs: tar → zstd or gzip → AES-256-GCM, opened with the vault key typed into this browser:
// APP_CACHE_KEY, or GOOGLE_AAS_TOKEN when the lab has no APP_CACHE_KEY — the same value as the secret).
// A file is { path, name, folder, size, kind, mime, get() }: get() gives its bytes (read once, kept while the viewer is open).
// Nothing in a box is run, written to disk or followed: its names are only shown (a ../ in a name is only words here).
import { decompress as zstd } from './zstd.mjs';

const enc = new TextEncoder(), dec = new TextDecoder();
const UTF8 = new TextDecoder('utf-8', { fatal: true });
// (a zip made on a Japanese Windows names its files in Shift_JIS, without the UTF-8 flag)
let SJIS = null; try { SJIS = new TextDecoder('shift_jis'); } catch { /* a platform with no Shift_JIS: as UTF-8 */ }
/** a file this big is not opened in a browser tab (its memory): it can still be taken from GitHub */
export const MAX_FILE = 768 * 2 ** 20;
const CRC_MAX = 256 * 2 ** 20;

/** what went wrong, in words for the person (code: notzip broken crc method encrypted large browser) */
export class UnpackError extends Error {
  constructor(code, detail = '') { super(unpackWords(code, detail)); this.code = code; }
}
export function unpackWords(code, detail = '') {
  return ({
    notzip: 'zip ではありません',
    broken: '中身が壊れているか、途中で切れています',
    crc: '中身が壊れています（CRC が合いません）',
    method: `この圧縮の形（${detail}）は開けません`,
    encrypted: 'パスワード付きの zip は開けません',
    large: 'ブラウザで開くには大きすぎます（GitHub から取ってください）',
    browser: 'このブラウザは展開できません（新しいブラウザで）',
  })[code] ?? `開けません（${code}）`;
}

// ---- kinds: what a file is by its name, and by its first bytes when the name says nothing ----
const EXT = new Map();
const add = (kind, mime, exts) => { for (const e of exts.split(' ')) EXT.set(e, { kind, mime }); };
add('image', 'image/png', 'png apng');
add('image', 'image/jpeg', 'jpg jpeg jfif');
add('image', 'image/gif', 'gif');
add('image', 'image/webp', 'webp');
add('image', 'image/bmp', 'bmp');
add('image', 'image/svg+xml', 'svg');
add('image', 'image/avif', 'avif');
add('image', 'image/x-icon', 'ico');
add('video', 'video/mp4', 'mp4 m4v');
add('video', 'video/webm', 'webm');
add('video', 'video/quicktime', 'mov');
add('video', 'video/ogg', 'ogv');
add('video', 'video/x-matroska', 'mkv');
add('audio', 'audio/mpeg', 'mp3');
add('audio', 'audio/wav', 'wav');
add('audio', 'audio/ogg', 'ogg oga opus');
add('audio', 'audio/mp4', 'm4a');
add('audio', 'audio/aac', 'aac');
add('audio', 'audio/flac', 'flac');
add('audio', 'audio/webm', 'weba');
add('pdf', 'application/pdf', 'pdf');
add('archive', 'application/zip', 'zip mcaddon mcpack mcworld mctemplate jar apk aab xpi whl');
add('archive', 'application/x-tar', 'tar');
add('archive', 'application/gzip', 'gz tgz');
add('archive', 'application/zstd', 'zst tzst');
add('sealed', 'application/octet-stream', 'sealed');
add('text', 'application/json', 'json jsonl ndjson geojson har webmanifest');
add('text', 'text/markdown', 'md markdown');
add('text', 'text/csv', 'csv tsv');
add('text', 'text/plain', 'txt log out err text lang mcfunction material properties yml yaml toml ini cfg conf env xml html htm xhtml css scss js mjs cjs ts tsx jsx mts cts py rb php go rs java kt kts swift c h cc cpp hpp m cs sh bash zsh fish bat cmd ps1 sql graphql gradle diff patch lock map srt vtt tex rst adoc gitignore gitattributes editorconfig dockerignore npmrc nvmrc tf hcl proto ld cmake mk');
const TEXT_NAMES = /^(readme|license|licence|copying|changelog|changes|authors|notice|todo|makefile|dockerfile|procfile|gemfile|rakefile|vagrantfile|jenkinsfile|codeowners|\.env.*)$/i;
/** a name → { kind, mime } (pure): image video audio pdf archive sealed text, or unknown (its bytes decide when opened) */
export function kindOf(name) {
  const n = String(name ?? '').split('/').pop().toLowerCase(), i = n.lastIndexOf('.');
  const k = i > 0 || (i === 0 && n.length > 1) ? EXT.get(n.slice(i + 1)) : null;
  if (k) return { ...k };
  if (TEXT_NAMES.test(n)) return { kind: 'text', mime: 'text/plain' };
  return { kind: 'unknown', mime: 'application/octet-stream' };
}
const at = (b, o, s) => s.split('').every((ch, i) => b[o + i] === ch.charCodeAt(0));
/** the first bytes of a file → { kind, mime } when they say what it is, else null (pure) */
export function sniff(b) {
  if (!b || b.length < 4) return null;
  if (b[0] === 0x89 && at(b, 1, 'PNG')) return { kind: 'image', mime: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' };
  if (at(b, 0, 'GIF8')) return { kind: 'image', mime: 'image/gif' };
  if (at(b, 0, 'RIFF') && at(b, 8, 'WEBP')) return { kind: 'image', mime: 'image/webp' };
  if (at(b, 0, 'RIFF') && at(b, 8, 'WAVE')) return { kind: 'audio', mime: 'audio/wav' };
  if (at(b, 0, 'BM') && b.length > 26 && b[14] >= 12) return { kind: 'image', mime: 'image/bmp' };
  if (at(b, 4, 'ftyp')) { const brand = String.fromCharCode(...b.subarray(8, 12)); return /^(M4A |M4B )/.test(brand) ? { kind: 'audio', mime: 'audio/mp4' } : /^qt {2}/.test(brand) ? { kind: 'video', mime: 'video/quicktime' } : /^(avif|avis)/.test(brand) ? { kind: 'image', mime: 'image/avif' } : { kind: 'video', mime: 'video/mp4' }; }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: 'video', mime: 'video/webm' };
  if (at(b, 0, 'OggS')) return { kind: 'audio', mime: 'audio/ogg' };
  if (at(b, 0, 'fLaC')) return { kind: 'audio', mime: 'audio/flac' };
  if (at(b, 0, 'ID3')) return { kind: 'audio', mime: 'audio/mpeg' };
  if (at(b, 0, '%PDF-')) return { kind: 'pdf', mime: 'application/pdf' };
  if (at(b, 0, 'PK') && ((b[2] === 3 && b[3] === 4) || (b[2] === 5 && b[3] === 6) || (b[2] === 7 && b[3] === 8))) return { kind: 'archive', mime: 'application/zip' };
  if (b[0] === 0x1f && b[1] === 0x8b) return { kind: 'archive', mime: 'application/gzip' };
  if (b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd) return { kind: 'archive', mime: 'application/zstd' };
  if (at(b, 0, 'BDSLABV1')) return { kind: 'sealed', mime: 'application/octet-stream' };
  if (b.length >= 262 && at(b, 257, 'ustar')) return { kind: 'archive', mime: 'application/x-tar' };
  const head = dec.decode(b.subarray(0, 512)).trimStart();
  if (/^<svg[\s>]/i.test(head) || (/^<\?xml/i.test(head) && /<svg[\s>]/i.test(head))) return { kind: 'image', mime: 'image/svg+xml' };
  return looksText(b) ? { kind: 'text', mime: 'text/plain' } : null;
}
/** whether bytes read as text (pure): no NUL, few control characters in the first 8 KB, valid UTF-8 or Shift_JIS */
export function looksText(b) {
  const s = b.subarray(0, 8192);
  let ctrl = 0;
  for (const x of s) { if (x === 0) return false; if (x < 9 || (x > 13 && x < 32)) ctrl++; }
  return ctrl <= s.length / 100;
}

// ---- readers: bytes from somewhere, by position ----
/** bytes in memory → a reader { size, read(start, end) } (end not included) */
export const bytesReader = (u8) => ({ size: u8.length, whole: u8, read: async (a, b) => u8.subarray(a, b) });

// ---- files and boxes ----
const cleanPath = (p) => String(p ?? '').replace(/\\/g, '/').split('/').filter((x) => x && x !== '.').join('/');
/** a file of a box (pure): its bytes from get() the first time it is asked for, kept after (a failure is asked again) */
export function fileOf(path, size, get, more = {}) {
  const p = cleanPath(path) || '（名前なし）', i = p.lastIndexOf('/'), name = p.slice(i + 1), k = kindOf(name);
  let memo = null;
  return { path: p, name, folder: i < 0 ? '' : p.slice(0, i), size: Number(size) || 0, kind: k.kind, mime: k.mime, ...more,
    get: () => (memo ??= Promise.resolve().then(get).catch((e) => { memo = null; throw e; })) };
}
/** what a file's own bytes say it is, for one whose name said nothing (unknown) or said text: a picture named .txt is a
 *  picture, a LevelDB .log is bytes (binary) — the file updated, and returned */
export function settle(file, bytes) {
  if (file.kind !== 'unknown' && file.kind !== 'text') return file;
  const s = sniff(bytes);
  if (!s) file.kind = 'binary';
  else if (!(file.kind === 'text' && s.kind === 'text')) { file.kind = s.kind; file.mime = s.mime; }
  return file;
}

// ---- zip ----
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;
/** a name in a zip's own bytes → text (pure): UTF-8 when flagged or valid, else Shift_JIS */
export function zipName(bytes, flags = 0) {
  if (flags & 0x800 || bytes.every((x) => x < 0x80)) return dec.decode(bytes);
  try { return UTF8.decode(bytes); } catch { return SJIS ? SJIS.decode(bytes) : dec.decode(bytes); }
}
/** a zip's central directory through a reader → [{ path, dir, method, flags, crc, csize, size, offset, nameLen, extraLen, encrypted }]
 *  (its end found within the last 64 KB; zip64 too) */
export async function zipEntries(reader) {
  const size = reader.size;
  if (!(size >= 22)) throw new UnpackError('notzip');
  const t0 = Math.max(0, size - (22 + 0xffff + 20)), tail = await reader.read(t0, size);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6 && i + 22 + u16(tail, i + 20) <= tail.length) { e = i; break; }
  if (e < 0) throw new UnpackError('notzip');
  let count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const l = e - 20;
    if (l < 0 || u32(tail, l) !== 0x07064b50) throw new UnpackError('broken');
    const r64 = u64(tail, l + 8), rec = r64 >= t0 && r64 + 56 <= t0 + tail.length ? tail.subarray(r64 - t0, r64 - t0 + 56) : await reader.read(r64, r64 + 56);
    if (rec.length < 56 || u32(rec, 0) !== 0x06064b50) throw new UnpackError('broken');
    count = u64(rec, 32); cdSize = u64(rec, 40); cdOff = u64(rec, 48);
  }
  if (cdOff + cdSize > size || count > 200_000) throw new UnpackError('broken');
  const cd = cdOff >= t0 ? tail.subarray(cdOff - t0, cdOff - t0 + cdSize) : await reader.read(cdOff, cdOff + cdSize);
  const out = [];
  for (let o = 0, n = 0; n < count; n++) {
    if (o + 46 > cd.length || u32(cd, o) !== 0x02014b50) throw new UnpackError('broken');
    const flags = u16(cd, o + 8), method = u16(cd, o + 10), crc = u32(cd, o + 16), nl = u16(cd, o + 28), xl = u16(cd, o + 30), cl = u16(cd, o + 32), attrs = u32(cd, o + 38);
    let csize = u32(cd, o + 20), usize = u32(cd, o + 24), off = u32(cd, o + 42), uname = null;
    const extra = cd.subarray(o + 46 + nl, o + 46 + nl + xl);
    for (let x = 0; x + 4 <= extra.length;) {
      const id = u16(extra, x), len = u16(extra, x + 2), d = extra.subarray(x + 4, x + 4 + len);
      if (id === 0x0001) { let p = 0; if (usize === 0xffffffff && p + 8 <= d.length) { usize = u64(d, p); p += 8; } if (csize === 0xffffffff && p + 8 <= d.length) { csize = u64(d, p); p += 8; } if (off === 0xffffffff && p + 8 <= d.length) off = u64(d, p); }
      // (Info-ZIP's Unicode path: the name in UTF-8 beside an old-style one)
      if (id === 0x7075 && d[0] === 1 && d.length > 5) { try { uname = UTF8.decode(d.subarray(5)); } catch { /* the old-style name */ } }
      x += 4 + len;
    }
    const name = uname ?? zipName(cd.subarray(o + 46, o + 46 + nl), flags);
    out.push({ path: name, dir: /[/\\]$/.test(name) || (usize === 0 && (attrs & 0x10) !== 0), method, flags, crc, csize, size: usize, offset: off, nameLen: nl, extraLen: xl, encrypted: (flags & 1) !== 0 });
    o += 46 + nl + xl + cl;
  }
  return out;
}
/** one entry's bytes through the reader: its local header, its data (stored, deflate or zstd), its CRC checked */
export async function zipRead(reader, x, { onProgress } = {}) {
  if (x.encrypted) throw new UnpackError('encrypted');
  if (x.size > MAX_FILE || x.csize > MAX_FILE) throw new UnpackError('large');
  // (the local header's own name and extra may differ from the directory's: read with room to spare, again if short)
  let b = await reader.read(x.offset, Math.min(reader.size, x.offset + 30 + x.nameLen + x.extraLen + x.csize + 512), onProgress);
  if (b.length < 30 || u32(b, 0) !== 0x04034b50) throw new UnpackError('broken');
  const start = 30 + u16(b, 26) + u16(b, 28);
  if (start + x.csize > b.length) b = await reader.read(x.offset, Math.min(reader.size, x.offset + start + x.csize), onProgress);
  if (start + x.csize > b.length) throw new UnpackError('broken');
  const data = b.subarray(start, start + x.csize);
  const out = x.method === 0 ? data : x.method === 8 ? await inflate(data, 'deflate-raw') : x.method === 93 ? unzstd(data) : null;
  if (!out) throw new UnpackError('method', x.method === 9 ? 'deflate64' : x.method === 12 ? 'bzip2' : x.method === 14 ? 'lzma' : String(x.method));
  if (out.length !== x.size) throw new UnpackError('broken');
  if (out.length <= CRC_MAX && crc32(out) !== x.crc) throw new UnpackError('crc');
  return out;
}
/** a zip through a reader → its box { kind: 'zip', files } (folders are only in the files' paths) */
export async function zipBox(reader, opts = {}) {
  const es = await zipEntries(reader);
  return { kind: 'zip', files: es.filter((x) => !x.dir).map((x) => fileOf(x.path, x.size, () => zipRead(reader, x, opts), { csize: x.csize, ...(x.encrypted ? { note: 'パスワード付き' } : {}) })) };
}

// ---- tar, gzip, zstd ----
/** a tar's bytes → [{ path, size, data, sparse }] (pure): ustar, GNU (long names, base-256 sizes) and pax (path, size); its
 *  folders, links and devices left out */
export function tarFiles(u8) {
  const out = [];
  const str = (a, b) => { let e = a; while (e < b && u8[e] !== 0) e++; return dec.decode(u8.subarray(a, e)); };
  const num = (a, n) => { if (u8[a] & 0x80) { let v = u8[a] & 0x7f; for (let i = a + 1; i < a + n; i++) v = v * 256 + u8[i]; return v; } const s = str(a, a + n).trim(); return s ? parseInt(s, 8) : 0; };
  let o = 0, longName = null, pax = {};
  while (o + 512 <= u8.length) {
    const h = u8.subarray(o, o + 512);
    if (h.every((x) => x === 0)) break;
    const want = num(o + 148, 8);
    let sum = 0, signed = 0;
    for (let i = 0; i < 512; i++) { const v = i >= 148 && i < 156 ? 32 : h[i]; sum += v; signed += i >= 148 && i < 156 ? 32 : (v > 127 ? v - 256 : v); }
    if (want !== sum && want !== signed) throw new UnpackError('broken');
    const type = h[156] ? String.fromCharCode(h[156]) : '0';
    const size = Number.isFinite(pax.size) && !'LKxg'.includes(type) ? pax.size : num(o + 124, 12);
    let name = str(o, o + 100);
    if (at(h, 257, 'ustar\u000000')) { const pre = str(o + 345, o + 500); if (pre) name = `${pre}/${name}`; }
    const d0 = o + 512, d1 = d0 + size;
    if (!(size >= 0) || d1 > u8.length) throw new UnpackError('broken');
    const data = u8.subarray(d0, d1);
    o = d0 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = str(d0, d1); continue; }
    if (type === 'x') { pax = paxOf(data); continue; }
    if (type === 'K' || type === 'g') continue;
    if (longName !== null) name = longName;
    if (pax.path) name = pax.path;
    longName = null; pax = {};
    if (type === '0' || type === '7' || type === 'S') out.push({ path: name, size: data.length, data, sparse: type === 'S' });
  }
  return out;
}
/** a pax header's records → { path, size } (pure). Each record's length counts bytes (a Japanese name is longer in them) */
function paxOf(b) {
  const out = {};
  for (let i = 0; i < b.length;) {
    let sp = i;
    while (sp < b.length && b[sp] !== 0x20) sp++;
    const len = Number(dec.decode(b.subarray(i, sp)));
    if (!(sp > i) || !(len > 0) || i + len > b.length) break;
    const rec = dec.decode(b.subarray(sp + 1, i + len - 1)), eq = rec.indexOf('=');
    if (eq > 0) { const k = rec.slice(0, eq), v = rec.slice(eq + 1); if (k === 'path') out.path = v; if (k === 'size' && /^\d+$/.test(v)) out.size = Number(v); }
    i += len;
  }
  return out;
}
/** a tar's bytes → its box */
export const tarBox = (u8) => ({ kind: 'tar', files: tarFiles(u8).map((f) => fileOf(f.path, f.size, () => f.data, f.sparse ? { note: '疎なファイル（穴は詰めてあります）' } : {})) });
/** gzip or raw deflate → bytes, through the platform's own DecompressionStream */
export async function inflate(u8, format = 'gzip') {
  if (typeof DecompressionStream !== 'function') throw new UnpackError('browser');
  try { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer()); }
  catch { throw new UnpackError('broken'); }
}
/** zstd → bytes (./zstd.mjs; frames with or without their size, one after another) */
export function unzstd(u8) { try { return zstd(u8); } catch { throw new UnpackError('broken'); } }

/** a file that holds files (a zip, a tar, a .gz or .zst of one) → its box; a .gz or .zst of one other file → a box of that
 *  file alone; null when it holds none (its bytes are what they are) */
export async function boxOf(file) {
  const b = await file.get(), s = sniff(b), name = file.name.replace(/\.(t?gz|t?zst)$/i, (m, x) => (/^t/i.test(x) ? '.tar' : ''));
  if (s?.mime === 'application/zip') return zipBox(bytesReader(b));
  if (s?.mime === 'application/x-tar') return tarBox(b);
  if (s?.mime === 'application/gzip' || s?.mime === 'application/zstd') {
    const inner = s.mime === 'application/gzip' ? await inflate(b, 'gzip') : unzstd(b);
    if (inner.length >= 262 && at(inner, 257, 'ustar')) return tarBox(inner);
    return { kind: 'single', files: [fileOf(name || 'data', inner.length, () => inner)] };
  }
  return null;
}

// ---- a run's results.sealed (app/lib/vault.mjs): 'BDSLABV1' ‖ compression ‖ key id (8) ‖ iv (12) ‖ AES-256-GCM ‖ tag ----
const MAGIC = 'BDSLABV1', HEAD = 8 + 1 + 8 + 12, TAG = 16;
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
/** a sealed file's head → { comp: 1 (zstd) | 2 (gzip), id, iv }, or null when it is not one (pure) */
export function sealedHead(b) {
  if (!b || b.length < HEAD + TAG || !at(b, 0, MAGIC)) return null;
  return { comp: b[8], id: hex(b.subarray(9, 17)), iv: b.subarray(17, HEAD) };
}
/** the value typed (APP_CACHE_KEY, or GOOGLE_AAS_TOKEN) → its two possible vault keys, each with its id as the runner names
 *  it (vaultKey of app/lib/vault.mjs: HKDF-SHA256, the id a hash of the key) — the sealed file's id says which one it is */
export async function vaultKeys(secret) {
  const s = String(secret ?? '').trim(), subtle = globalThis.crypto.subtle;
  if (!s) return [];
  const base = await subtle.importKey('raw', enc.encode(s), 'HKDF', false, ['deriveBits']), out = [];
  for (const [how, info] of [['APP_CACHE_KEY', 'app cache key v1'], ['GOOGLE_AAS_TOKEN', 'app cache from aas v1']]) {
    const bits = new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('bds-lab vault salt v1'), info: enc.encode(info) }, base, 256));
    const tag = enc.encode('bds-lab vault id v1'), both = new Uint8Array(tag.length + 32); both.set(tag, 0); both.set(bits, tag.length);
    out.push({ how, id: hex(new Uint8Array(await subtle.digest('SHA-256', both)).subarray(0, 8)), key: await subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']) });
  }
  return out;
}
/** a sealed file's bytes and the value typed → { ok: true, box, how } | { ok: false, why: format | comp | key (none typed)
 *  | other-key (sealed with another) | broken (altered or cut) } */
export async function openSealed(b, secret) {
  const h = sealedHead(b);
  if (!h) return { ok: false, why: 'format' };
  if (h.comp !== 1 && h.comp !== 2) return { ok: false, why: 'comp' };
  if (!String(secret ?? '').trim()) return { ok: false, why: 'key' };
  const k = (await vaultKeys(secret)).find((x) => x.id === h.id);
  if (!k) return { ok: false, why: 'other-key' };
  let plain;
  try { plain = new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: h.iv, tagLength: 128 }, k.key, b.subarray(HEAD))); } catch { return { ok: false, why: 'broken' }; }
  try { return { ok: true, how: k.how, box: tarBox(h.comp === 1 ? unzstd(plain) : await inflate(plain, 'gzip')) }; } catch { return { ok: false, why: 'broken' }; }
}
/** why a sealed file did not open, in words (pure) */
export function sealedWords(why) {
  return ({
    key: 'ラボの Secrets の APP_CACHE_KEY（無ければ GOOGLE_AAS_TOKEN）と同じ値を入れると、この端末で開けます',
    'other-key': '入れた値では開けません: この結果は別の鍵で暗号化されています（その実行のときの Secrets の APP_CACHE_KEY、無ければ GOOGLE_AAS_TOKEN と同じ値を）',
    broken: '開けません: 中身が改変されているか、途中で切れています',
    comp: '開けません: 知らない圧縮の形です（パネルを新しく）',
    format: 'ラボの暗号化した結果の形ではありません',
  })[why] ?? `開けません（${why}）`;
}

// ---- showing: text, JSON, bytes ----
/** bytes → { text, encoding, cut } (pure): UTF-8 (a BOM dropped), else Shift_JIS; at most max bytes, cut on a whole character */
export function textOf(b, max = Infinity) {
  let s = b.length > max ? b.subarray(0, max) : b;
  if (s[0] === 0xef && s[1] === 0xbb && s[2] === 0xbf) s = s.subarray(3);
  const cut = b.length > max;
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(s, { stream: cut }), encoding: 'UTF-8', cut }; }
  catch { /* not UTF-8 */ }
  if (SJIS) { try { return { text: new TextDecoder('shift_jis', { fatal: true }).decode(s, { stream: cut }), encoding: 'Shift_JIS', cut }; } catch { /* not Shift_JIS either */ } }
  return { text: dec.decode(s), encoding: 'UTF-8（読めない所は �）', cut };
}
/** a JSON text → the same, indented, or null when it is not JSON (pure). JSON Lines: each line on its own, indented */
export function prettyJson(t, lines = false) {
  try { return lines ? String(t).split('\n').filter((l) => l.trim()).map((l) => JSON.stringify(JSON.parse(l), null, 2)).join('\n') : JSON.stringify(JSON.parse(t), null, 2); } catch { return null; }
}
/** the first bytes as a hex dump (pure): offset, 16 bytes, their printable characters */
export function hexDump(b, max = 4096) {
  const out = [];
  for (let o = 0; o < Math.min(b.length, max); o += 16) {
    const row = b.subarray(o, Math.min(o + 16, b.length));
    out.push(`${o.toString(16).padStart(8, '0')}  ${[...row].map((x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(47)}  ${[...row].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}`);
  }
  return out.join('\n');
}

// ---- CRC-32 (zip's) ----
let CRC = null;
export function crc32(b) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
