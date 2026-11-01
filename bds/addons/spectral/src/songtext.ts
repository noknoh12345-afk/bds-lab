// Spectral song text (SPZ1): a song as text short enough to paste into a form in the game (/spectral:paste). The song data is
// parsed into its fields and each is coded with an adaptive binary range coder (LZMA's) with contexts of its own — a voice's level
// against its last, its pitch step against its last step, a noise band against its last frame, a fade against what the voice does
// next — then written 14 bits a character (CJK ideographs U+4E00-U+8DFF) or 6 (base64url, ASCII). Measured on the test songs
// (20 s, 48 voices): 1.7x smaller than the song's own bytes, where xz gets 1.1x; pitch on a 3-cent grid (the add-on sends no
// smaller pitch change) and 24 voices (what a phone plays) make a 20 s song 6,500-9,000 characters and a 3.5-minute one ~73,000.
// A text longer than a form's field (30,000 characters with this pack's rp/ui/server_form.json) is cut into numbered parts.
// No Minecraft imports: the add-on, the converter page (web) and tools/songtext.mjs use this same file.

export interface SongMeta {
  id: string; title: string; artist?: string; fps: number; frames: number; voices: number; base: number;
  noise: number[][]; bursts: number; sub: number; seconds: number; amp: [number, number]; nz: [number, number];
  fd?: { ms: number[]; v: number; nz: number };
}
const DEF = {
  fps: 20, base: 1760, bursts: 3, sub: 4, amp: [-90, 0.75], nz: [-100, 0.5], ms: [5, 12, 25, 50],
  noise: [[180, 360], [360, 720], [720, 1440], [1440, 2880], [2880, 5000], [5000, 8000], [8000, 12000], [12000, 17000]],
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** a form's text field with this pack (rp/ui/server_form.json $max_text_edit_length; vanilla: 100) */
export const FIELD_CHARS = 30000;

// ---- CRC-32 (the zip one)
let CRC: Uint32Array | undefined;
export function crc32(b: Uint8Array): number {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---- UTF-8 by hand (the game's script engine has no TextEncoder)
function utf8(s: string): number[] {
  const o: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xDC00 && d < 0xE000) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; } }
    if (c < 0x80) o.push(c);
    else if (c < 0x800) o.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) o.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else o.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return o;
}
function unutf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length;) {
    const x = b[i++];
    let c = x < 0x80 ? x : x < 0xE0 ? ((x & 31) << 6) | (b[i++] & 63) : x < 0xF0 ? ((x & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)
      : ((x & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    if (c >= 0x10000) { c -= 0x10000; s += String.fromCharCode(0xD800 + (c >> 10), 0xDC00 + (c & 1023)); } else s += String.fromCharCode(c);
  }
  return s;
}

// ---- bytes with varints
class Out {
  b: number[] = [];
  byte(x: number) { this.b.push(x & 255); }
  varint(x: number) { x = Math.max(0, Math.floor(x)); while (x >= 128) { this.b.push((x % 128) | 128); x = Math.floor(x / 128); } this.b.push(x); }
  u32(x: number) { for (let i = 0; i < 4; i++) { this.b.push(x & 255); x = x >>> 8; } }
  str(s: string) { const u = utf8(s); this.varint(u.length); for (const c of u) this.b.push(c); }
}
class In {
  constructor(public b: Uint8Array, public p = 0) {}
  byte() { if (this.p >= this.b.length) throw new Error('the text ends too soon'); return this.b[this.p++]; }
  varint() { let x = 0, m = 1; for (;;) { const c = this.byte(); x += (c & 127) * m; if (c < 128) return x; m *= 128; if (m > 2 ** 49) throw new Error('bad number'); } }
  u32() { let x = 0; for (let i = 0; i < 4; i++) x += this.byte() * 2 ** (8 * i); return x; }
  str() { const n = this.varint(); if (this.p + n > this.b.length) throw new Error('the text ends too soon'); const s = unutf8(this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
}

// ---- the range coder (LZMA's): 11-bit probabilities adapting by 1/32. Plain numbers, exact below 2^53 (no 32-bit wrap)
class RcEnc {
  low = 0; range = 0xFFFFFFFF; cache = 0; csize = 1; out: number[] = [];
  private shift() {
    if (this.low < 0xFF000000 || this.low >= 0x100000000) {
      const carry = this.low >= 0x100000000 ? 1 : 0;
      let t = this.cache;
      do { this.out.push((t + carry) & 255); t = 255; } while (--this.csize !== 0);
      this.cache = Math.floor(this.low / 0x1000000) & 255;
    }
    this.csize++;
    this.low = (this.low % 0x1000000) * 256;
  }
  bit(P: Uint16Array, i: number, b: number) {
    const p = P[i], bound = Math.floor(this.range / 2048) * p;
    if (b === 0) { this.range = bound; P[i] = p + ((2048 - p) >> 5); }
    else { this.low += bound; this.range -= bound; P[i] = p - (p >> 5); }
    while (this.range < 0x1000000) { this.range *= 256; this.shift(); }
  }
  finish() { for (let i = 0; i < 5; i++) this.shift(); return this.out; }
}
class RcDec {
  range = 0xFFFFFFFF; code = 0; p: number;
  constructor(public b: Uint8Array, p: number) { this.p = p + 1; for (let i = 0; i < 4; i++) this.code = this.code * 256 + this.next(); }
  private next() { return this.p < this.b.length ? this.b[this.p++] : 0; }
  bit(P: Uint16Array, i: number): number {
    const p = P[i], bound = Math.floor(this.range / 2048) * p;
    let b: number;
    if (this.code < bound) { this.range = bound; P[i] = p + ((2048 - p) >> 5); b = 0; }
    else { this.range -= bound; this.code -= bound; P[i] = p - (p >> 5); b = 1; }
    while (this.range < 0x1000000) { this.range *= 256; this.code = this.code * 256 + this.next(); }
    return b;
  }
}

// ---- models: one coder interface for both directions (the encoder passes the value, the decoder gets it back)
const probs = (n: number) => new Uint16Array(n).fill(1024);
interface Rc { bit(P: Uint16Array, i: number, b?: number): number }
const wrapEnc = (e: RcEnc): Rc => ({ bit(P, i, b) { e.bit(P, i, b!); return b!; } });
const wrapDec = (d: RcDec): Rc => ({ bit(P, i) { return d.bit(P, i); } });
/** a bounded value, its bits from the top, each at its node of the tree */
class Tree {
  P: Uint16Array;
  constructor(public bits: number, public ctxs = 1) { this.P = probs(ctxs << bits); }
  code(rc: Rc, ctx: number, v = 0) {
    let node = 1; const base = ctx << this.bits;
    for (let i = this.bits - 1; i >= 0; i--) { const b = rc.bit(this.P, base + node, (v >> i) & 1); node = node * 2 + b; }
    return node - (1 << this.bits);
  }
}
/** a whole number: how many bits (unary, adaptive), the top 2 bits below the leading one adaptive, the rest on one shared bit */
class Ints {
  z: Uint16Array; s: Uint16Array; pre: Uint16Array; man: Uint16Array; raw = probs(1);
  constructor(ctxs: number) { this.z = probs(ctxs); this.s = probs(ctxs); this.pre = probs(ctxs * 32); this.man = probs(ctxs * 32 * 4); }
  uint(rc: Rc, ctx: number, v = 0) {
    const x = v + 1, nb0 = 32 - Math.clz32(x);
    let nb = 1;
    for (;;) {
      if (nb >= 31) break;
      const b = rc.bit(this.pre, ctx * 32 + nb, nb < nb0 ? 1 : 0);
      if (!b) break;
      nb++;
    }
    let y = 1;
    for (let i = nb - 2; i >= 0; i--) {
      const want = (x >> i) & 1;
      const b = i >= nb - 3 ? rc.bit(this.man, (ctx * 32 + nb) * 4 + (nb - 2 - i), want) : rc.bit(this.raw, 0, want);
      y = y * 2 + b;
    }
    return y - 1;
  }
  sint(rc: Rc, ctx: number, v = 0) {
    if (rc.bit(this.z, ctx, v === 0 ? 1 : 0)) return 0;
    const neg = rc.bit(this.s, ctx, v < 0 ? 1 : 0);
    const m = this.uint(rc, ctx, Math.abs(v) - 1) + 1;
    return neg ? -m : m;
  }
}
const bucket = (x: number) => { x = Math.abs(x); return x === 0 ? 0 : x <= 2 ? 1 : x <= 8 ? 2 : x <= 32 ? 3 : x <= 128 ? 4 : 5; };
class Models {
  chg = probs(12); off = probs(2); att = probs(2); att0 = probs(1); ev = probs(1);
  ab = new Tree(7); ne = new Tree(4); eb = new Tree(8); ea = new Tree(8);
  ad = new Ints(12); pon = new Ints(1); pd = new Ints(4); nz: Ints;
  vf = new Tree(2, 32); nf: Tree;
  constructor(M: number) { this.nz = new Ints(Math.max(1, M)); this.nf = new Tree(2, Math.max(1, M) * 4); }
}

/** the song's bytes as the add-on reads them (src/main.ts decodeJob), written as they are decoded */
class Blob {
  b: number[] = [];
  push(x: number) { this.b.push(x & 255); }
}

/** the fields of a song, coded frame by frame: `put` is the original's values (encoding), absent when decoding */
interface Frames { F: number; N: number; M: number; q: number; fd: boolean }
function* codeFrames(rc: Rc, f: Frames, out: Blob, put?: { masks: Uint8Array; acode: Uint8Array; pitch: Uint16Array; nzc: Uint8Array; ev: number[][]; vd?: Uint8Array; nzd?: Uint8Array }): Generator<void, void, void> {
  const { F, N, M, q } = f, md = new Models(M), nb = (N + 7) >> 3;
  const lastAc = new Uint8Array(N), lastPc = new Float64Array(N), prevCh = new Uint8Array(N), lastDpc = new Float64Array(N), lastDac = new Float64Array(N), lastNz = new Uint8Array(M);
  const acs = new Uint8Array(F * N), chg = new Uint8Array(F * N);
  for (let k = 0; k < F; k++) {
    const mask = new Uint8Array(nb), body: number[] = [];
    for (let v = 0; v < N; v++) {
      const g = v < 8 ? 0 : v < 24 ? 1 : 2;
      const c = rc.bit(md.chg, (prevCh[v] * 2 + (lastAc[v] > 0 ? 1 : 0)) * 3 + g, put ? put.masks[k * N + v] : 0);
      prevCh[v] = c; chg[k * N + v] = c;
      if (!c) { acs[k * N + v] = lastAc[v]; continue; }
      mask[v >> 3] |= 1 << (v & 7);
      const on = lastAc[v] === 0, a0 = put ? put.acode[k * N + v] : 0, ac0 = a0 & 127;
      let ac: number, att: number;
      if (rc.bit(md.off, on ? 1 : 0, put ? (ac0 === 0 ? 1 : 0) : 0)) {
        att = rc.bit(md.att0, 0, a0 >> 7); ac = 0;
        body.push((att << 7) | 0);
      } else {
        att = rc.bit(md.att, on ? 1 : 0, a0 >> 7);
        if (on) ac = md.ab.code(rc, 0, ac0);
        else { const da = md.ad.sint(rc, bucket(lastDac[v]) * 2 + (lastDac[v] < 0 ? 1 : 0), ac0 - lastAc[v]); ac = lastAc[v] + da; lastDac[v] = da; }
        if (ac < 1 || ac > 127) throw new Error('a level out of range (the text is broken)');
        const pq = put ? Math.min(Math.floor(65535 / q), Math.round(put.pitch[k * N + v] / q)) : 0;
        let d: number;
        if (on) { d = md.pon.sint(rc, 0, pq - lastPc[v]); lastDpc[v] = 0; lastDac[v] = 0; }
        else { d = md.pd.sint(rc, Math.min(3, Math.floor((32 - Math.clz32(Math.abs(lastDpc[v]))) / 3)), pq - lastPc[v]); lastDpc[v] = d; }
        const pc = lastPc[v] + d;
        if (pc < 0 || pc * q > 65535) throw new Error('a pitch out of range (the text is broken)');
        lastPc[v] = pc;
        const p16 = pc * q;
        body.push((att << 7) | ac, p16 & 255, p16 >> 8);
      }
      lastAc[v] = ac; acs[k * N + v] = ac;
    }
    for (const x of mask) out.push(x);
    for (const x of body) out.push(x);
    for (let j = 0; j < M; j++) {
      const c = lastNz[j] + md.nz.sint(rc, j, put ? put.nzc[k * M + j] - lastNz[j] : 0);
      if (c < 0 || c > 255) throw new Error('a noise level out of range (the text is broken)');
      lastNz[j] = c; out.push(c);
    }
    const ev = put ? put.ev[k] : [];
    let ne = 0;
    if (rc.bit(md.ev, 0, ev.length ? 1 : 0)) ne = md.ne.code(rc, 0, ev.length / 2);
    out.push(ne);
    for (let e = 0; e < ne; e++) { out.push(md.eb.code(rc, 0, ev[2 * e])); out.push(md.ea.code(rc, 0, ev[2 * e + 1])); }
    if ((k & 7) === 7) yield;
  }
  if (!f.fd) return;
  // the fades: a voice's against what it does at the next frame and its last fade; a band's against its last
  const per = (N + 3) >> 2, lastF = new Uint8Array(N).fill(3);
  for (let k = 0; k < F; k++) {
    const row = new Uint8Array(per);
    for (let v = 0; v < N; v++) {
      const a0 = acs[k * N + v], a1 = k + 1 < F ? acs[(k + 1) * N + v] : a0;
      const dd = a1 === a0 ? 0 : a1 && a0 ? (Math.abs(a1 - a0) <= 4 ? 1 : 2) : 3;
      const ctx = (dd * 4 + lastF[v]) * 2 + (k + 1 < F && chg[(k + 1) * N + v] ? 1 : 0);
      const c = md.vf.code(rc, ctx, put ? put.vd![k * N + v] : 0);
      lastF[v] = c; row[v >> 2] |= c << (2 * (v & 3));
    }
    for (const x of row) out.push(x);
    if ((k & 31) === 31) yield;
  }
  const pn = (M + 3) >> 2, lastN = new Uint8Array(M).fill(3);
  for (let k = 0; k < F; k++) {
    const row = new Uint8Array(pn);
    for (let j = 0; j < M; j++) { const c = md.nf.code(rc, j * 4 + lastN[j], put ? put.nzd![k * M + j] : 0); lastN[j] = c; row[j >> 2] |= c << (2 * (j & 3)); }
    for (const x of row) out.push(x);
  }
}

export interface EncodeOptions {
  /** the first voices kept (a converted song's are the most energetic first: 24 = what a phone plays) */
  voices?: number;
  /** pitch grid in 0.2-cent steps: 1 = as it is (lossless), 5 = 1 cent, 15 = 3 cents (the add-on sends no smaller pitch change) */
  q?: number;
  /** only the first frames (a short excerpt) */
  frames?: number;
  /** another id / title for it */
  id?: string; title?: string;
}

/** a song (its meta and its bytes, the song.json's data base64-decoded) → the SPZ1 payload */
export function encodeSong(meta: SongMeta, src: Uint8Array, o: EncodeOptions = {}): Uint8Array {
  const N0 = meta.voices, M = meta.noise.length, F0 = meta.frames;
  const N = Math.max(1, Math.min(N0, o.voices ?? N0)), F = Math.max(1, Math.min(F0, o.frames ?? F0)), q = Math.max(1, Math.min(255, Math.round(o.q ?? 1)));
  // the original's fields (all its voices parsed, the first N kept)
  const nb0 = (N0 + 7) >> 3, masks = new Uint8Array(F * N), acode = new Uint8Array(F * N), pitch = new Uint16Array(F * N), nzc = new Uint8Array(F * M), ev: number[][] = [];
  const curA = new Uint8Array(N0), curP = new Uint16Array(N0);
  let p = 0;
  for (let k = 0; k < F0; k++) {
    const mp = p; p += nb0;
    const keep = k < F;
    for (let v = 0; v < N0; v++) {
      if (!((src[mp + (v >> 3)] >> (v & 7)) & 1)) continue;
      const x = src[p++]; curA[v] = x;
      if (x & 127) { curP[v] = src[p] | (src[p + 1] << 8); p += 2; }
      if (keep && v < N) { masks[k * N + v] = 1; acode[k * N + v] = x; pitch[k * N + v] = curP[v]; }
    }
    for (let j = 0; j < M; j++) if (keep) nzc[k * M + j] = src[p + j];
    p += M;
    const ne = src[p++], e: number[] = [];
    for (let i = 0; i < ne; i++) { e.push(src[p], src[p + 1]); p += 2; }
    if (keep) ev.push(e);
  }
  const fd = meta.fd, per0 = (N0 + 3) >> 2, pn = (M + 3) >> 2;
  const hasFd = !!fd && fd.v === F0 * per0 && fd.nz === F0 * pn && p + fd.v + fd.nz === src.length && fd.ms?.length === 4;
  if (!hasFd && p !== src.length) throw new Error(`song ${meta.id}: ${src.length - p} bytes after the frames`);
  let vd: Uint8Array | undefined, nzd: Uint8Array | undefined;
  if (hasFd) {
    vd = new Uint8Array(F * N); nzd = new Uint8Array(F * M);
    for (let k = 0; k < F; k++) {
      for (let v = 0; v < N; v++) vd[k * N + v] = (src[p + k * per0 + (v >> 2)] >> (2 * (v & 3))) & 3;
      for (let j = 0; j < M; j++) nzd[k * M + j] = (src[p + fd!.v + k * pn + (j >> 2)] >> (2 * (j & 3))) & 3;
    }
  }
  // the bytes the decoder will write (for the check sum), coded as they are written
  const enc = new RcEnc(), blob = new Blob();
  const job = codeFrames(wrapEnc(enc), { F, N, M, q, fd: hasFd }, blob, { masks, acode, pitch, nzc, ev, vd, nzd });
  while (!job.next().done) { /* run it through */ }
  const rcBytes = enc.finish();
  const h = new Out();
  const extra: Record<string, unknown> = {};
  if (meta.fps !== DEF.fps) extra.fps = meta.fps;
  if (meta.base !== DEF.base) extra.base = meta.base;
  if (meta.bursts !== DEF.bursts) extra.bursts = meta.bursts;
  if (meta.sub !== DEF.sub) extra.sub = meta.sub;
  if (!same(meta.amp, DEF.amp)) extra.amp = meta.amp;
  if (!same(meta.nz, DEF.nz)) extra.nz = meta.nz;
  if (!same(meta.noise, DEF.noise)) extra.noise = meta.noise;
  if (hasFd && !same(fd!.ms, DEF.ms)) extra.ms = fd!.ms;
  const hasExtra = Object.keys(extra).length > 0;
  h.byte(1);                                                   // version
  h.varint((hasFd ? 1 : 0) | (hasExtra ? 2 : 0) | (meta.artist ? 4 : 0));
  h.varint(F); h.varint(N); h.varint(M); h.varint(q);
  h.varint(Math.round((F < F0 ? F / meta.fps : meta.seconds) * 100));
  h.u32(crc32(Uint8Array.from(blob.b)));
  h.str(o.id ?? meta.id); h.str(o.title ?? meta.title);
  if (meta.artist) h.str(meta.artist);
  if (hasExtra) h.str(JSON.stringify(extra));
  const out = new Uint8Array(h.b.length + rcBytes.length);
  out.set(h.b, 0); out.set(rcBytes, h.b.length);
  return out;
}

/** an SPZ1 payload's header: the song's meta (nothing decoded yet), its check sum and where the coded frames start */
export function songHeader(payload: Uint8Array): { meta: SongMeta; crc: number; at: number; q: number } {
  const r = new In(payload);
  const ver = r.byte();
  if (ver !== 1) throw new Error(`a song text of version ${ver} (this add-on reads 1)`);
  const flags = r.varint(), F = r.varint(), N = r.varint(), M = r.varint(), q = r.varint(), cs = r.varint(), crc = r.u32();
  if (!(F > 0 && F < 1e6 && N > 0 && N <= 128 && M > 0 && M <= 32 && q > 0 && q < 256)) throw new Error('the text is broken (its sizes)');
  const id = r.str(), title = r.str(), artist = flags & 4 ? r.str() : undefined;
  let extra: Record<string, any> = {};
  if (flags & 2) { try { extra = JSON.parse(r.str()); } catch { throw new Error('the text is broken (its settings)'); } }
  const meta: SongMeta = {
    id, title, ...(artist ? { artist } : {}), fps: extra.fps ?? DEF.fps, frames: F, voices: N, base: extra.base ?? DEF.base,
    noise: extra.noise ?? DEF.noise, bursts: extra.bursts ?? DEF.bursts, sub: extra.sub ?? DEF.sub, seconds: cs / 100,
    amp: extra.amp ?? DEF.amp, nz: extra.nz ?? DEF.nz,
  };
  if (meta.noise.length !== M) throw new Error('the text is broken (its noise bands)');
  if (flags & 1) meta.fd = { ms: extra.ms ?? DEF.ms, v: F * ((N + 3) >> 2), nz: F * ((M + 3) >> 2) };
  return { meta, crc, at: r.p, q };
}
/** an SPZ1 payload → the song's meta and bytes, as a job (yields every few frames: the game's watchdog) */
export function* decodeSongJob(payload: Uint8Array, got: { meta?: SongMeta; bytes?: Uint8Array }): Generator<void, void, void> {
  const h = songHeader(payload), m = h.meta;
  const blob = new Blob();
  yield* codeFrames(wrapDec(new RcDec(payload, h.at)), { F: m.frames, N: m.voices, M: m.noise.length, q: h.q, fd: !!m.fd }, blob);
  const bytes = Uint8Array.from(blob.b);
  if (crc32(bytes) !== h.crc) throw new Error('the text is broken (its check sum): copy it again, whole');
  got.meta = m; got.bytes = bytes;
}
export function decodeSong(payload: Uint8Array) {
  const got: { meta?: SongMeta; bytes?: Uint8Array } = {};
  const job = decodeSongJob(payload, got);
  while (!job.next().done) { /* run it through */ }
  return got as { meta: SongMeta; bytes: Uint8Array };
}

// ---- the text: parts of `SPZ1.<part>.<parts>.<key>.<bytes>:` + 14 bits a character (or SPA1 + base64url)
const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const CJK0 = 0x4E00;
function toCJK(b: Uint8Array): string {
  let s = '', acc = 0, n = 0;
  for (let i = 0; i < b.length; i++) {
    acc = acc * 256 + b[i]; n += 8;
    if (n >= 14) { n -= 14; const v = Math.floor(acc / 2 ** n); s += String.fromCharCode(CJK0 + v); acc -= v * 2 ** n; }
  }
  if (n > 0) s += String.fromCharCode(CJK0 + acc * 2 ** (14 - n));
  return s;
}
function fromCJK(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let acc = 0, n = 0, o = 0;
  for (let i = 0; i < s.length && o < len; i++) {
    const v = s.charCodeAt(i) - CJK0;
    if (v < 0 || v >= 16384) throw new Error('a character that is not part of a song text');
    acc = acc * 16384 + v; n += 14;
    while (n >= 8 && o < len) { n -= 8; const x = Math.floor(acc / 2 ** n); out[o++] = x; acc -= x * 2 ** n; }
  }
  if (o < len) throw new Error('the text is cut short: copy it again, whole');
  return out;
}
function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64U[n >> 18] + B64U[(n >> 12) & 63] + (i + 1 < b.length ? B64U[(n >> 6) & 63] : '') + (i + 2 < b.length ? B64U[n & 63] : '');
  }
  return s;
}
function fromB64(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let acc = 0, n = 0, o = 0;
  for (let i = 0; i < s.length && o < len; i++) {
    const v = B64U.indexOf(s[i]);
    if (v < 0) throw new Error('a character that is not part of a song text');
    acc = (acc << 6) | v; n += 6;
    if (n >= 8) { n -= 8; out[o++] = (acc >> n) & 255; acc &= (1 << n) - 1; }
  }
  if (o < len) throw new Error('the text is cut short: copy it again, whole');
  return out;
}
export interface TextOptions { /** characters a part (a form's text field), 30000 by default */ maxChars?: number; /** base64url instead of CJK */ ascii?: boolean }
/** a payload → its text: one part, or several numbered ones of at most maxChars characters each */
export function toText(payload: Uint8Array, o: TextOptions = {}): string[] {
  const max = Math.max(200, o.maxChars ?? FIELD_CHARS), key = crc32(payload).toString(16).padStart(8, '0');
  const tag = o.ascii ? 'SPA1' : 'SPZ1', bits = o.ascii ? 6 : 14;
  // (the header of the longest part, with room to spare)
  const room = max - `${tag}.999.999.${key}.9999999:`.length;
  const per = Math.max(1, Math.floor((room * bits) / 8));
  const n = Math.max(1, Math.ceil(payload.length / per)), out: string[] = [];
  for (let i = 0; i < n; i++) {
    const part = payload.subarray(i * per, Math.min(payload.length, (i + 1) * per));
    out.push(`${tag}.${i + 1}.${n}.${key}.${part.length}:${o.ascii ? toB64(part) : toCJK(part)}`);
  }
  return out;
}
export interface Part { key: string; i: number; n: number; bytes: Uint8Array }
/** one pasted part → its place and bytes (spaces and line breaks anywhere are ignored); throws a message for the player */
export function readPart(text: string): Part {
  const s = text.replace(/\s+/g, '');
  const m = /^(SPZ1|SPA1)\.(\d{1,3})\.(\d{1,3})\.([0-9a-f]{8})\.(\d{1,8}):/.exec(s);
  if (!m) throw new Error(s.length ? 'this is not a song text (it starts with SPZ1. or SPA1.)' : 'nothing was pasted');
  const i = Number(m[2]), n = Number(m[3]), len = Number(m[5]);
  if (!(i >= 1 && i <= n)) throw new Error('the part number is broken');
  const body = s.slice(m[0].length);
  return { key: m[4], i, n, bytes: m[1] === 'SPA1' ? fromB64(body, len) : fromCJK(body, len) };
}
/** the parts of one song (all n, in any order) → its payload, its key checked */
export function joinParts(parts: Part[]): Uint8Array {
  const n = parts[0].n, byI = new Map(parts.map((p) => [p.i, p]));
  let len = 0; for (let i = 1; i <= n; i++) { const p = byI.get(i); if (!p) throw new Error(`part ${i} of ${n} is missing`); len += p.bytes.length; }
  const out = new Uint8Array(len);
  let o = 0; for (let i = 1; i <= n; i++) { const p = byI.get(i)!; out.set(p.bytes, o); o += p.bytes.length; }
  if (crc32(out).toString(16).padStart(8, '0') !== parts[0].key) throw new Error(n === 1 ? 'the text is broken (its check sum): copy it again, whole' : 'the parts do not make one song (one from another song, or broken)');
  return out;
}
/** the payload as a plain CJK string (how the add-on keeps a pasted song in the world) and back */
export const payloadText = (b: Uint8Array) => `${b.length}:${toCJK(b)}`;
export function payloadFrom(s: string): Uint8Array { const c = s.indexOf(':'); return fromCJK(s.slice(c + 1), Number(s.slice(0, c))); }
