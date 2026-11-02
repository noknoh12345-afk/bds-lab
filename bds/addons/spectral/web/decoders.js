// Spectral Player converter: audio files a browser's own decoder (decodeAudioData) may not read, read here — so that a song can
// come from almost any audio file:
//   WAV of every common codec (PCM 8/16/24/32-bit, float 32/64, A-law, μ-law, IMA and Microsoft ADPCM, WAVE_FORMAT_EXTENSIBLE) in
//   RIFF, RIFX, RF64, BW64 and Sony Wave64; AIFF / AIFC (big- and little-endian PCM, float, A-law, μ-law, Apple IMA4); Sun AU/SND;
//   Apple CAF (PCM, A-law, μ-law, IMA4); Creative VOC; MIDI (SMF 0/1/2, RMID, KAR) rendered by a small synthesiser (General MIDI's
//   instrument families and drums);
//   and everything else — WMA, AMR, APE, WavPack, TTA, AC3/E-AC3, DTS, MP2, RealAudio, Speex, GSM, Opus/Vorbis on a browser without
//   them, the sound of video files — by ffmpeg compiled to WebAssembly (@ffmpeg/core), fetched the first time it is needed.
// Each decoder gives { sampleRate, channels: [Float32Array, …], format } (samples in -1..1), or null when the file is not its kind.
// The ADPCM and G.711 decoders follow ffmpeg's (libavcodec adpcm.c, pcm.c) to the sample. Works in the browser
// (window.SpectralDecoders) and in Node (module.exports) for tests (tests: tools/test_decoders.mjs, against ffmpeg's own decoding).
(function (root) {
  'use strict';
  const td = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
  const fail = (m) => { throw new Error(m); };

  // ---------------------------------------------------------------- G.711 and ADPCM (as ffmpeg decodes them)
  const ULAW = new Float32Array(256), ALAW = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    let u = ~i & 255, t = ((u & 15) << 3) + 0x84;
    t <<= (u & 0x70) >> 4;
    ULAW[i] = (u & 0x80 ? 0x84 - t : t - 0x84) / 32768;
    const a = i ^ 0x55, seg = (a & 0x70) >> 4, q = a & 15;
    const s = seg ? (q + q + 1 + 32) << (seg + 2) : (q + q + 1) << 3;
    ALAW[i] = (a & 0x80 ? s : -s) / 32768;
  }
  const STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
    130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282,
    1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493,
    10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
  const IDX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
  const clip16 = (x) => (x < -32768 ? -32768 : x > 32767 ? 32767 : x);
  const clipI = (x) => (x < 0 ? 0 : x > 88 ? 88 : x);
  /** IMA ADPCM's nibble the way ffmpeg's adpcm_ima_expand_nibble does it (WAV: a multiply), or the reference's adds (QuickTime) */
  function ima(c, n, adds) {
    const step = STEP[c.i];
    let diff;
    if (adds) { diff = step >> 3; if (n & 4) diff += step; if (n & 2) diff += step >> 1; if (n & 1) diff += step >> 2; }
    else diff = ((2 * (n & 7) + 1) * step) >> 3;
    c.p = clip16(n & 8 ? c.p - diff : c.p + diff);
    c.i = clipI(c.i + IDX[n]);
    return c.p;
  }
  const MS_ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];
  const MS_C1 = [64, 128, 0, 48, 60, 115, 98], MS_C2 = [0, -64, 0, 16, 0, -52, -58];   // (ffmpeg's: the standard ones over 4, the sum over 64)
  function ms(c, n) {
    let p = Math.trunc((c.s1 * c.c1 + c.s2 * c.c2) / 64) + (n & 8 ? n - 16 : n) * c.d;
    c.s2 = c.s1; c.s1 = clip16(p);
    c.d = (MS_ADAPT[n] * c.d) >> 8; if (c.d < 16) c.d = 16;
    return c.s1;
  }

  // ---------------------------------------------------------------- sample formats → planar float
  /** interleaved frames of `kind` from b[o..o+n) → channels. kind: u8 s8 s16 s24 s32 f32 f64 ulaw alaw (le: little-endian) */
  function planar(b, o, n, ch, kind, le) {
    const bps = { u8: 1, s8: 1, ulaw: 1, alaw: 1, s16: 2, s24: 3, s32: 4, f32: 4, f64: 8 }[kind];
    if (!bps) fail(`sample kind ${kind}`);
    const frames = Math.floor(Math.min(n, b.length - o) / (bps * ch)), out = [];
    for (let c = 0; c < ch; c++) out.push(new Float32Array(frames));
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p = o;
    for (let k = 0; k < frames; k++) for (let c = 0; c < ch; c++, p += bps) {
      let v;
      switch (kind) {
        case 'u8': v = (b[p] - 128) / 128; break;
        case 's8': v = ((b[p] << 24) >> 24) / 128; break;
        case 'ulaw': v = ULAW[b[p]]; break;
        case 'alaw': v = ALAW[b[p]]; break;
        case 's16': v = dv.getInt16(p, le) / 32768; break;
        case 's24': v = (le ? ((b[p + 2] << 24) | (b[p + 1] << 16) | (b[p] << 8)) : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8))) / 2147483648; break;
        case 's32': v = dv.getInt32(p, le) / 2147483648; break;
        case 'f32': v = dv.getFloat32(p, le); break;
        case 'f64': v = dv.getFloat64(p, le); break;
      }
      out[c][k] = v;
    }
    return out;
  }
  const intKind = (bits, bytes) => (bytes === 1 ? 'u8' : bytes === 2 ? 's16' : bytes === 3 ? 's24' : bytes === 4 ? 's32' : fail(`${bits}-bit samples`));

  // ---------------------------------------------------------------- WAV: RIFF / RIFX / RF64 / BW64 / Wave64
  const W64 = { riff: '726966662e91cf11a5d628db04c10000', wave: '77617665f3acd3118cd100c04f8edb8a', fmt: '666d7420f3acd3118cd100c04f8edb8a',
    data: '64617461f3acd3118cd100c04f8edb8a', fact: '66616374f3acd3118cd100c04f8edb8a' };
  const hex = (b, o, n) => Array.from(b.subarray(o, o + n), (x) => x.toString(16).padStart(2, '0')).join('');
  const WAV_TAGS = { 1: 'PCM', 2: 'Microsoft ADPCM', 3: 'float', 6: 'A-law', 7: 'μ-law', 0x11: 'IMA ADPCM', 0x31: 'GSM 6.10', 0x50: 'MPEG',
    0x55: 'MP3', 0x161: 'WMA', 0xFFFE: 'extensible' };
  function wav(b) {
    const m = td(b, 0, 4);
    let le = true, chunks = [];
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (m === 'riff' && hex(b, 0, 16) === W64.riff && hex(b, 24, 16) === W64.wave) {
      for (let o = 40; o + 24 <= b.length;) {
        const id = hex(b, o, 16), size = Number(dv.getBigUint64(o + 16, true));
        if (size < 24) break;
        chunks.push({ id: id === W64.fmt ? 'fmt ' : id === W64.data ? 'data' : id === W64.fact ? 'fact' : id, o: o + 24, n: size - 24 });
        o += Math.ceil(size / 8) * 8;
      }
    } else {
      if (!((m === 'RIFF' || m === 'RIFX' || m === 'RF64' || m === 'BW64') && td(b, 8, 4) === 'WAVE')) return null;
      le = m !== 'RIFX';
      let ds64 = null;
      for (let o = 12; o + 8 <= b.length;) {
        const id = td(b, o, 4); let n = dv.getUint32(o + 4, le);
        if (id === 'ds64') ds64 = { data: Number(dv.getBigUint64(o + 16, true)) };
        if (id === 'data' && (n === 0xFFFFFFFF || (ds64 && n === 0xFFFFFFFF)) && ds64) n = ds64.data;
        if (id === 'data' && o + 8 + n > b.length) n = b.length - o - 8;   // (a file cut short, or one written while recording)
        chunks.push({ id, o: o + 8, n });
        o += 8 + n + (n & 1);
      }
    }
    const fmt = chunks.find((c) => c.id === 'fmt '), data = chunks.find((c) => c.id === 'data');
    if (!fmt || !data) fail('WAV without its fmt or data chunk');
    const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
    let tag = u16(fmt.o);
    const ch = u16(fmt.o + 2), rate = u32(fmt.o + 4), align = u16(fmt.o + 12), bits = u16(fmt.o + 14);
    if (tag === 0xFFFE && fmt.n >= 40) tag = u16(fmt.o + 24);                      // (the sub-format's GUID begins with its tag)
    if (!ch || !rate) fail('WAV with no channels or rate');
    const fact = chunks.find((c) => c.id === 'fact'), total = fact && fact.n >= 4 ? u32(fact.o) : 0;
    const name = (s) => `WAV (${s}${le ? '' : ', big-endian'})`;
    if (tag === 1) return { sampleRate: rate, channels: planar(b, data.o, data.n, ch, intKind(bits, align / ch), le), format: name(`PCM ${bits}-bit`) };
    if (tag === 3) return { sampleRate: rate, channels: planar(b, data.o, data.n, ch, align / ch === 8 ? 'f64' : 'f32', le), format: name(`float ${8 * align / ch}-bit`) };
    if (tag === 6 || tag === 7) return { sampleRate: rate, channels: planar(b, data.o, data.n, ch, tag === 6 ? 'alaw' : 'ulaw', le), format: name(tag === 6 ? 'A-law' : 'μ-law') };
    if (tag === 0x11) {
      if (bits !== 4) fail(`IMA ADPCM of ${bits} bits`);
      const per = (align - 4 * ch) * 2 / ch + 1, blocks = Math.floor(data.n / align);
      let frames = blocks * per; if (total && total < frames) frames = total;
      const out = []; for (let c = 0; c < ch; c++) out.push(new Float32Array(blocks * per));
      for (let k = 0; k < blocks; k++) {
        let p = data.o + k * align;
        const st = [];
        for (let c = 0; c < ch; c++, p += 4) { st.push({ p: dv.getInt16(p, true), i: Math.min(88, Math.max(0, dv.getInt16(p + 2, true))) }); out[c][k * per] = st[c].p / 32768; }
        for (let g = 0; g < (per - 1) / 8; g++) for (let c = 0; c < ch; c++) for (let j = 0; j < 4; j++, p++) {
          const at = k * per + 1 + g * 8 + 2 * j, x = b[p];
          out[c][at] = ima(st[c], x & 15) / 32768; out[c][at + 1] = ima(st[c], x >> 4) / 32768;
        }
      }
      return { sampleRate: rate, channels: out.map((x) => x.subarray(0, frames)), format: name('IMA ADPCM') };
    }
    if (tag === 2) {
      if (ch > 2) fail('Microsoft ADPCM with more than 2 channels');
      const per = (align - 7 * ch) * 2 / ch + 2, blocks = Math.floor(data.n / align), st2 = ch === 2;
      let frames = blocks * per; if (total && total < frames) frames = total;
      const out = []; for (let c = 0; c < ch; c++) out.push(new Float32Array(blocks * per));
      for (let k = 0; k < blocks; k++) {
        let p = data.o + k * align;
        const s = [];
        for (let c = 0; c < ch; c++) { const pr = b[p++]; if (pr > 6) fail('Microsoft ADPCM predictor'); s.push({ c1: MS_C1[pr], c2: MS_C2[pr] }); }
        for (let c = 0; c < ch; c++, p += 2) s[c].d = dv.getInt16(p, true);
        for (let c = 0; c < ch; c++, p += 2) s[c].s1 = dv.getInt16(p, true);
        for (let c = 0; c < ch; c++, p += 2) s[c].s2 = dv.getInt16(p, true);
        const o0 = k * per;
        for (let c = 0; c < ch; c++) { out[c][o0] = s[c].s2 / 32768; out[c][o0 + 1] = s[c].s1 / 32768; }
        let at = o0 + 2;
        for (let n = (per - 2) >> (st2 ? 0 : 1); n > 0; n--) {
          const x = b[p++];
          if (st2) { out[0][at] = ms(s[0], x >> 4) / 32768; out[1][at] = ms(s[1], x & 15) / 32768; at++; }
          else { out[0][at++] = ms(s[0], x >> 4) / 32768; out[0][at++] = ms(s[0], x & 15) / 32768; }
        }
      }
      return { sampleRate: rate, channels: out.map((x) => x.subarray(0, frames)), format: name('Microsoft ADPCM') };
    }
    fail(`WAV codec ${WAV_TAGS[tag] ?? '0x' + tag.toString(16)}`);
  }

  // ---------------------------------------------------------------- AIFF / AIFC
  function ext80(b, o) {
    const e = ((b[o] & 0x7F) << 8) | b[o + 1], hi = b[o + 2] * 2 ** 24 + ((b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5]), lo = b[o + 6] * 2 ** 24 + ((b[o + 7] << 16) | (b[o + 8] << 8) | b[o + 9]);
    if (!e && !hi && !lo) return 0;
    return (b[o] & 0x80 ? -1 : 1) * (hi * 2 ** 32 + lo) * 2 ** (e - 16383 - 63);
  }
  function aiff(b) {
    if (td(b, 0, 4) !== 'FORM' || !['AIFF', 'AIFC'].includes(td(b, 8, 4))) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), c = td(b, 8, 4) === 'AIFC';
    let comm = null, ssnd = null;
    for (let o = 12; o + 8 <= b.length;) {
      const id = td(b, o, 4); let n = dv.getUint32(o + 4);
      if (o + 8 + n > b.length) n = b.length - o - 8;
      if (id === 'COMM') comm = o + 8; if (id === 'SSND') ssnd = { o: o + 16 + dv.getUint32(o + 8), n: n - 8 - dv.getUint32(o + 8) };
      o += 8 + n + (n & 1);
    }
    if (comm === null || !ssnd) fail('AIFF without its COMM or SSND chunk');
    const ch = dv.getUint16(comm), frames = dv.getUint32(comm + 2), bits = dv.getUint16(comm + 6), rate = ext80(b, comm + 8);
    const type = c ? td(b, comm + 18, 4) : 'NONE', bytes = Math.ceil(bits / 8);
    const name = `AIFF (${type === 'NONE' || type === 'twos' ? `PCM ${bits}-bit` : type})`;
    const cut = (x) => x.map((y) => y.subarray(0, Math.min(y.length, frames || y.length)));
    switch (type) {
      case 'NONE': case 'twos': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, bytes === 1 ? 's8' : intKind(bits, bytes), false)), format: name };
      case 'sowt': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, bytes === 1 ? 's8' : intKind(bits, bytes), true)), format: name };
      case 'raw ': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 'u8', false)), format: name };
      case 'in24': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 's24', false)), format: name };
      case '42ni': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 's24', true)), format: name };
      case 'in32': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 's32', false)), format: name };
      case '23ni': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 's32', true)), format: name };
      case 'fl32': case 'FL32': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 'f32', false)), format: name };
      case 'fl64': case 'FL64': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 'f64', false)), format: name };
      case 'ulaw': case 'ULAW': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 'ulaw', false)), format: name };
      case 'alaw': case 'ALAW': return { sampleRate: rate, channels: cut(planar(b, ssnd.o, ssnd.n, ch, 'alaw', false)), format: name };
      case 'ima4': return { sampleRate: rate, channels: ima4(b, ssnd.o, ssnd.n, ch), format: name };
    }
    fail(`AIFC codec ${type}`);
  }
  /** Apple IMA4 (QuickTime): 34-byte packets of 64 samples, one per channel in turn (ffmpeg adpcm_ima_qt) */
  function ima4(b, o, n, ch) {
    const packets = Math.floor(n / (34 * ch)), out = [], st = [];
    for (let c = 0; c < ch; c++) { out.push(new Float32Array(packets * 64)); st.push({ p: 0, i: 0 }); }
    let p = o;
    for (let k = 0; k < packets; k++) for (let c = 0; c < ch; c++) {
      const h = ((b[p] << 8) | b[p + 1]) << 16 >> 16, i = h & 0x7F, pr = h & ~0x7F, s = st[c]; p += 2;
      if (!(s.i === i && Math.abs(pr - s.p) <= 0x7F)) { s.i = i; s.p = pr; }
      if (s.i > 88) fail('IMA4 step index');
      for (let m = 0; m < 64; m += 2, p++) { out[c][k * 64 + m] = ima(s, b[p] & 15, true) / 32768; out[c][k * 64 + m + 1] = ima(s, b[p] >> 4, true) / 32768; }
    }
    return out;
  }

  // ---------------------------------------------------------------- Sun AU / SND
  function au(b) {
    if (td(b, 0, 4) !== '.snd') return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), off = dv.getUint32(4), size = dv.getUint32(8), enc = dv.getUint32(12), rate = dv.getUint32(16), ch = dv.getUint32(20);
    const n = size === 0xFFFFFFFF ? b.length - off : Math.min(size, b.length - off);
    const kind = { 1: 'ulaw', 2: 's8', 3: 's16', 4: 's24', 5: 's32', 6: 'f32', 7: 'f64', 27: 'alaw' }[enc];
    if (!kind) fail(`AU encoding ${enc}`);
    return { sampleRate: rate, channels: planar(b, off, n, ch, kind, false), format: `AU (${kind})` };
  }

  // ---------------------------------------------------------------- Apple CAF
  function caf(b) {
    if (td(b, 0, 4) !== 'caff') return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let desc = null, data = null;
    for (let o = 8; o + 12 <= b.length;) {
      const id = td(b, o, 4), hi = dv.getInt32(o + 4), lo = dv.getUint32(o + 8);
      let n = hi === -1 && lo === 0xFFFFFFFF ? b.length - o - 12 : hi * 2 ** 32 + lo;
      if (o + 12 + n > b.length) n = b.length - o - 12;
      if (id === 'desc') desc = o + 12; if (id === 'data') data = { o: o + 16, n: n - 4 };
      o += 12 + n;
    }
    if (desc === null || !data) fail('CAF without its desc or data chunk');
    const rate = dv.getFloat64(desc), id = td(b, desc + 8, 4), flags = dv.getUint32(desc + 12), ch = dv.getUint32(desc + 24), bits = dv.getUint32(desc + 28);
    if (id === 'lpcm') {
      const le = !!(flags & 2), float = !!(flags & 1);
      return { sampleRate: rate, channels: planar(b, data.o, data.n, ch, float ? (bits === 64 ? 'f64' : 'f32') : bits === 8 ? 's8' : intKind(bits, bits / 8), le), format: `CAF (${float ? 'float' : 'PCM'} ${bits}-bit)` };
    }
    if (id === 'ulaw' || id === 'alaw') return { sampleRate: rate, channels: planar(b, data.o, data.n, ch, id, false), format: `CAF (${id})` };
    if (id === 'ima4') return { sampleRate: rate, channels: ima4(b, data.o, data.n, ch), format: 'CAF (ima4)' };
    fail(`CAF codec ${id}`);
  }

  // ---------------------------------------------------------------- Creative VOC
  function voc(b) {
    if (td(b, 0, 19) !== 'Creative Voice File') return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), parts = [];
    let rate = 0, ch = 1, kind = 'u8', o = dv.getUint16(20, true);
    while (o < b.length) {
      const t = b[o]; if (t === 0) break;
      const n = b[o + 1] | (b[o + 2] << 8) | (b[o + 3] << 16), d = o + 4;
      if (t === 1) { if (b[d + 1] !== 0) fail('VOC with packed samples'); if (!rate) rate = Math.round(1e6 / (256 - b[d])) / ch; parts.push(planar(b, d + 2, n - 2, ch, 'u8', true)); }
      else if (t === 2) parts.push(planar(b, d, n, ch, kind, true));
      else if (t === 3) { const len = dv.getUint16(d, true) + 1, r = Math.round(1e6 / (256 - b[d + 2])); if (!rate) rate = r; parts.push(Array.from({ length: ch }, () => new Float32Array(len))); }
      else if (t === 8) { const tc = dv.getUint16(d, true); ch = b[d + 3] + 1; rate = Math.round(256e6 / (65536 - tc)) / ch; }
      else if (t === 9) {
        rate = dv.getUint32(d, true); const bits = b[d + 4]; ch = b[d + 5]; const codec = dv.getUint16(d + 6, true);
        kind = codec === 0 ? 'u8' : codec === 4 ? (bits === 16 ? 's16' : intKind(bits, bits / 8)) : codec === 6 ? 'alaw' : codec === 7 ? 'ulaw' : fail(`VOC codec ${codec}`);
        parts.push(planar(b, d + 12, n - 12, ch, kind, true));
      }
      o = d + n;
    }
    if (!parts.length || !rate) fail('VOC with no sound');
    const len = parts.reduce((a, p) => a + p[0].length, 0), out = Array.from({ length: ch }, () => new Float32Array(len));
    let at = 0;
    for (const p of parts) { for (let c = 0; c < ch; c++) out[c].set(p[Math.min(c, p.length - 1)], at); at += p[0].length; }
    return { sampleRate: rate, channels: out, format: 'VOC' };
  }

  // ---------------------------------------------------------------- MIDI → notes → a small synthesiser
  function midiEvents(b) {
    let o = 0;
    if (td(b, 0, 4) === 'RIFF' && td(b, 8, 4) === 'RMID') { o = 12; while (o + 8 <= b.length && td(b, o, 4) !== 'data') o += 8 + (b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24)); o += 8; }
    if (td(b, o, 4) !== 'MThd') return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), hl = dv.getUint32(o + 4), ntr = dv.getUint16(o + 10), div = dv.getUint16(o + 12);
    const ev = [];
    let p = o + 8 + hl, seq = 0;
    for (let t = 0; t < ntr && p + 8 <= b.length; t++) {
      if (td(b, p, 4) !== 'MTrk') { p += 8 + dv.getUint32(p + 4); t--; continue; }
      const end = Math.min(b.length, p + 8 + dv.getUint32(p + 4));
      let q = p + 8, tick = 0, run = 0;
      const vlq = () => { let x = 0; for (let i = 0; i < 4 && q < end; i++) { const c = b[q++]; x = x * 128 + (c & 127); if (!(c & 128)) break; } return x; };
      while (q < end) {
        tick += vlq();
        let st = b[q];
        if (st & 0x80) q++; else st = run;
        if (st === 0xFF) { const type = b[q++], n = vlq(); if (type === 0x51 && n >= 3) ev.push({ tick, seq: seq++, tempo: (b[q] << 16) | (b[q + 1] << 8) | b[q + 2] }); if (type === 0x2F) { q = end; break; } q += n; continue; }
        if (st === 0xF0 || st === 0xF7) { q += vlq(); continue; }
        if (!(st & 0x80)) break;                                 // (no running status to go on: a broken track)
        run = st;
        const kind = st >> 4, ch = st & 15, d1 = b[q++], d2 = kind === 0xC || kind === 0xD ? 0 : b[q++];
        ev.push({ tick, seq: seq++, kind, ch, d1, d2 });
      }
      p = end;
    }
    ev.sort((x, y) => x.tick - y.tick || x.seq - y.seq);
    // ticks → seconds (the tempo map; SMPTE time when the division's top bit is set)
    let at = 0, last = 0, us = 500000;
    const smpte = div & 0x8000 ? (256 - (div >> 8)) * (div & 255) : 0;
    for (const e of ev) {
      at += smpte ? (e.tick - last) / smpte : ((e.tick - last) * us) / (div * 1e6); last = e.tick; e.t = at;
      if (e.tempo) us = e.tempo;
    }
    return ev;
  }
  // timbres of General MIDI's 16 families (program >> 3): harmonic slope (amplitude ∝ h^-slope), odd harmonics' weight for the even
  // ones, attack / decay / sustain / release (s), and whether it decays like a struck or plucked string
  const FAM = [
    { s: 1.2, even: 1, a: 0.004, d: 1.6, sus: 0, r: 0.25, pluck: 1 },    // piano
    { s: 2.2, even: 0.6, a: 0.002, d: 0.8, sus: 0, r: 0.3, pluck: 1 },   // chromatic percussion
    { s: 0.7, even: 1, a: 0.01, d: 0.2, sus: 0.9, r: 0.06 },             // organ
    { s: 1.5, even: 1, a: 0.003, d: 1.2, sus: 0, r: 0.15, pluck: 1 },    // guitar
    { s: 2.0, even: 1, a: 0.005, d: 1.4, sus: 0, r: 0.1, pluck: 1 },     // bass
    { s: 1.0, even: 1, a: 0.08, d: 0.3, sus: 0.8, r: 0.25 },             // strings
    { s: 1.3, even: 1, a: 0.12, d: 0.3, sus: 0.8, r: 0.35 },             // ensemble
    { s: 0.8, even: 1, a: 0.04, d: 0.2, sus: 0.85, r: 0.12 },            // brass
    { s: 1.1, even: 0.25, a: 0.03, d: 0.2, sus: 0.85, r: 0.1 },          // reed
    { s: 2.5, even: 1, a: 0.05, d: 0.2, sus: 0.9, r: 0.12 },             // pipe
    { s: 1.0, even: 0.4, a: 0.005, d: 0.3, sus: 0.8, r: 0.1 },           // synth lead
    { s: 1.5, even: 1, a: 0.3, d: 0.5, sus: 0.8, r: 0.5 },               // synth pad
    { s: 1.4, even: 1, a: 0.2, d: 0.5, sus: 0.7, r: 0.5 },               // synth effects
    { s: 1.4, even: 1, a: 0.003, d: 1.0, sus: 0, r: 0.2, pluck: 1 },     // ethnic
    { s: 1.8, even: 0.7, a: 0.002, d: 0.35, sus: 0, r: 0.1, pluck: 1 },  // percussive
    { s: 1.2, even: 1, a: 0.02, d: 0.4, sus: 0.6, r: 0.3 },              // sound effects
  ];
  const TABLE = 2048;
  /** one cycle of family f's wave holding the harmonics below `top` (each band-limited table serves one octave of pitches) */
  const tables = new Map();
  function table(f, top) {
    const key = f * 64 + top; let t = tables.get(key);
    if (t) return t;
    t = new Float32Array(TABLE + 1);
    const F = FAM[f];
    let peak = 0;
    for (let h = 1; h <= top; h++) {
      const a = h ** -F.s * (h % 2 ? 1 : F.even);
      for (let i = 0; i < TABLE; i++) t[i] += a * Math.sin((2 * Math.PI * h * i) / TABLE);
    }
    for (let i = 0; i < TABLE; i++) peak = Math.max(peak, Math.abs(t[i]));
    for (let i = 0; i < TABLE; i++) t[i] /= peak || 1;
    t[TABLE] = t[0]; tables.set(key, t); return t;
  }
  function renderMidi(b, { sampleRate = 44100, maxSeconds = 1200 } = {}) {
    const ev = midiEvents(b);
    if (!ev) return null;
    const chs = Array.from({ length: 16 }, () => ({ prog: 0, vol: 100, expr: 127, sus: false, bend: 0, range: 2, rpn: 0x3FFF, held: [] }));
    const notes = [], on = new Map(), bends = Array.from({ length: 16 }, () => [[0, 0]]);
    let end = 0;
    const release = (n, t) => { if (n.t1 === undefined) n.t1 = t; };
    for (const e of ev) {
      if (e.tempo) continue;
      const c = chs[e.ch], key = e.ch * 128 + e.d1;
      end = Math.max(end, e.t);
      if (e.kind === 0x9 && e.d2 > 0) {
        const old = on.get(key); if (old) release(old, e.t);
        const n = { ch: e.ch, key: e.d1, vel: e.d2, t0: e.t, prog: c.prog, gain: ((c.vol / 127) * (c.expr / 127)) ** 2 }; notes.push(n); on.set(key, n);
      } else if (e.kind === 0x8 || (e.kind === 0x9 && e.d2 === 0)) {
        const n = on.get(key); if (!n) continue; on.delete(key);
        if (c.sus) c.held.push(n); else release(n, e.t);
      } else if (e.kind === 0xB) {
        if (e.d1 === 7) c.vol = e.d2; else if (e.d1 === 11) c.expr = e.d2;
        else if (e.d1 === 64) { c.sus = e.d2 >= 64; if (!c.sus) { for (const n of c.held) release(n, e.t); c.held = []; } }
        else if (e.d1 === 101) c.rpn = (c.rpn & 0x7F) | (e.d2 << 7); else if (e.d1 === 100) c.rpn = (c.rpn & 0x3F80) | e.d2;
        else if (e.d1 === 6 && c.rpn === 0) c.range = e.d2; else if (e.d1 === 38 && c.rpn === 0) c.range = Math.floor(c.range) + e.d2 / 100;
        else if (e.d1 === 121) { c.vol = 100; c.expr = 127; c.sus = false; c.bend = 0; }
        else if (e.d1 === 120 || e.d1 === 123) { for (const [k, n] of on) if (n.ch === e.ch) { release(n, e.t); on.delete(k); } for (const n of c.held) release(n, e.t); c.held = []; }
      } else if (e.kind === 0xC) c.prog = e.d1;
      else if (e.kind === 0xE) { c.bend = (((e.d2 << 7) | e.d1) - 8192) / 8192 * c.range; bends[e.ch].push([e.t, c.bend]); }
    }
    for (const n of on.values()) release(n, end);
    for (const c of chs) for (const n of c.held) release(n, end);
    const seconds = Math.min(maxSeconds, end + 2), len = Math.ceil(seconds * sampleRate), x = new Float32Array(len);
    let rnd = 12345; const noise = () => { rnd = (rnd * 1103515245 + 12345) & 0x7FFFFFFF; return rnd / 0x40000000 - 1; };
    for (const n of notes) {
      if (n.t0 >= seconds) continue;
      const amp = (n.vel / 127) ** 1.6 * n.gain * 0.3;
      if (n.ch === 9) { drum(x, n, amp, sampleRate, noise); continue; }
      const F = FAM[n.prog >> 3], f0 = 440 * 2 ** ((n.key - 69) / 12);
      const top = Math.max(1, Math.min(40, Math.floor((sampleRate * 0.45) / (f0 * 2 ** ((chs[n.ch].range + 0.5) / 12)))));
      const tb = table(n.prog >> 3, top), bl = bends[n.ch];
      const t1 = Math.max(n.t1 ?? end, n.t0 + 0.02), dur = t1 - n.t0, i0 = Math.round(n.t0 * sampleRate);
      const tau = F.pluck ? F.d * 2 ** (-(n.key - 60) / 24) : F.d, rel = F.r, iEnd = Math.min(len, i0 + Math.ceil((dur + rel * 4) * sampleRate));
      let phase = 0, bi = 0;
      while (bi + 1 < bl.length && bl[bi + 1][0] <= n.t0) bi++;
      for (let i = i0; i < iEnd; i += 64) {
        const t = (i - i0) / sampleRate, tt = n.t0 + t;
        while (bi + 1 < bl.length && bl[bi + 1][0] <= tt) bi++;
        const inc = (f0 * 2 ** (bl[bi][1] / 12) * TABLE) / sampleRate;
        // the envelope at this block (attack, then decay to the sustain level, or a pluck's decay; the release after the key is let go)
        let env = t < F.a ? t / F.a : F.pluck ? Math.exp(-(t - F.a) / tau) : F.sus + (1 - F.sus) * Math.exp(-(t - F.a) / F.d);
        if (t > dur) { const at1 = dur < F.a ? dur / F.a : F.pluck ? Math.exp(-(dur - F.a) / tau) : F.sus + (1 - F.sus) * Math.exp(-(dur - F.a) / F.d); env = at1 * Math.exp(-(t - dur) / rel); }
        const g = amp * env;
        if (g < 1e-5 && t > dur) break;
        for (let j = i; j < Math.min(iEnd, i + 64); j++) {
          const k = phase | 0, f = phase - k;
          x[j] += g * (tb[k] + (tb[k + 1] - tb[k]) * f);
          phase += inc; if (phase >= TABLE) phase -= TABLE;
        }
      }
    }
    let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(x[i]));
    if (peak > 0) { const g = 0.9 / peak; for (let i = 0; i < len; i++) x[i] *= g; }
    return { sampleRate, channels: [x], format: `MIDI (${notes.length} notes)` };
  }
  /** General MIDI's drums (channel 10) by their kind: kick, snare, toms, hi-hats, cymbals, claps and the rest */
  function drum(x, n, amp, sr, noise) {
    const k = n.key, i0 = Math.round(n.t0 * sr);
    let len = 0.15, tone = 0, sweep = 0, nz = 0, hp = 0, decay = 0.08;
    if (k === 35 || k === 36) { tone = 60; sweep = 90; len = 0.35; decay = 0.12; nz = 0.05; }
    else if (k === 38 || k === 40) { tone = 190; len = 0.25; decay = 0.07; nz = 0.8; hp = 0.3; }
    else if (k === 37 || k === 39) { len = 0.12; decay = 0.03; nz = 1; hp = 0.5; }
    else if ([41, 43, 45, 47, 48, 50].includes(k)) { tone = 80 + (k - 41) * 18; sweep = tone * 0.5; len = 0.4; decay = 0.15; nz = 0.1; }
    else if (k === 42 || k === 44) { len = 0.06; decay = 0.02; nz = 1; hp = 0.92; }
    else if (k === 46) { len = 0.35; decay = 0.12; nz = 1; hp = 0.9; }
    else if ([49, 52, 55, 57].includes(k)) { len = 1.5; decay = 0.5; nz = 1; hp = 0.85; }
    else if ([51, 53, 59].includes(k)) { len = 1.0; decay = 0.35; nz = 0.6; hp = 0.9; tone = 3200; }
    else { len = 0.15; decay = 0.05; nz = 0.7; hp = 0.6; tone = 400 + (k % 12) * 60; }
    let ph = 0, lp = 0, prev = 0;
    for (let i = 0; i < len * sr && i0 + i < x.length; i++) {
      const t = i / sr, e = Math.exp(-t / decay);
      let s = 0;
      if (tone) { ph += (2 * Math.PI * (tone + sweep * Math.exp(-t / 0.03))) / sr; s += Math.sin(ph) * (1 - nz * 0.5); }
      if (nz) { const w = noise(); lp = hp ? w - prev : w; prev = w; s += nz * (hp ? lp * hp + w * (1 - hp) * 0.3 : w); }
      x[i0 + i] += amp * 0.8 * e * s;
    }
  }

  // ---------------------------------------------------------------- ffmpeg (WebAssembly), for the rest
  const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
  const WORKER = `let core = null;
self.onmessage = async (e) => {
  const { base, data } = e.data;
  try {
    if (!core) {
      importScripts(base + '/ffmpeg-core.js');
      core = await createFFmpegCore({ mainScriptUrlOrBlob: base + '/ffmpeg-core.js#' + btoa(JSON.stringify({ wasmURL: base + '/ffmpeg-core.wasm', workerURL: '' })) });
      core.setLogger((m) => { if (m && m.type === 'stderr' && /Duration|Stream|Error|Invalid/.test(m.message)) self.postMessage({ log: m.message }); });
    }
    core.FS.writeFile('in.bin', new Uint8Array(data));
    core.exec('-i', 'in.bin', '-vn', '-f', 'f32le', '-ac', '2', '-ar', '44100', 'out.raw');
    const ret = core.ret; core.reset();
    let out = null; try { out = core.FS.readFile('out.raw'); core.FS.unlink('out.raw'); } catch (_) {}
    try { core.FS.unlink('in.bin'); } catch (_) {}
    if (!out || !out.length) throw new Error('ffmpeg could not read it (exit ' + ret + ')');
    self.postMessage({ out }, [out.buffer]);
  } catch (err) { self.postMessage({ error: String((err && err.message) || err) }); }
};`;
  let worker = null;
  /** a file through ffmpeg (WebAssembly; the first call fetches ~31 MB from base, then it stays) → 44.1 kHz stereo */
  function ffmpeg(bytes, { base = root.SPECTRAL_FFMPEG_BASE || FFMPEG_CORE, log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
      if (!worker) worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
      worker.onmessage = (e) => {
        if (e.data.log) { log(e.data.log); return; }
        if (e.data.error) { reject(new Error(e.data.error)); return; }
        const f = new Float32Array(e.data.out.buffer, 0, e.data.out.byteLength >> 2), n = f.length >> 1, L = new Float32Array(n), R = new Float32Array(n);
        for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
        resolve({ sampleRate: 44100, channels: [L, R], format: 'ffmpeg' });
      };
      worker.onerror = (e) => { worker.terminate(); worker = null; reject(new Error(e.message || 'the ffmpeg worker failed')); };
      const copy = bytes.slice().buffer;
      worker.postMessage({ base, data: copy }, [copy]);
    });
  }

  /** what a file is, by its first bytes (null: not one of these) */
  function sniff(b) {
    const m = td(b, 0, 4);
    if ((m === 'RIFF' || m === 'RIFX' || m === 'RF64' || m === 'BW64') && td(b, 8, 4) === 'WAVE') return 'wav';
    if (m === 'riff' && hex(b, 0, 16) === W64.riff) return 'wav';
    if (m === 'FORM' && ['AIFF', 'AIFC'].includes(td(b, 8, 4))) return 'aiff';
    if (m === '.snd') return 'au';
    if (m === 'caff') return 'caf';
    if (td(b, 0, 19) === 'Creative Voice File') return 'voc';
    if (m === 'MThd' || (m === 'RIFF' && td(b, 8, 4) === 'RMID')) return 'midi';
    return null;
  }
  /** a file this script reads itself → { sampleRate, channels, format }; null when it is none of them; throws on a codec it lacks */
  function decode(buf, o = {}) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    switch (sniff(b)) {
      case 'wav': return wav(b);
      case 'aiff': return aiff(b);
      case 'au': return au(b);
      case 'caf': return caf(b);
      case 'voc': return voc(b);
      case 'midi': return renderMidi(b, o);
    }
    return null;
  }
  // the file picker's list: what browsers decode, what this script decodes, what ffmpeg decodes (and video files' sound)
  const EXTS = ['.mp3', '.wav', '.wave', '.bwf', '.rf64', '.w64', '.m4a', '.m4b', '.mp4', '.aac', '.adts', '.ogg', '.oga', '.opus', '.flac',
    '.webm', '.weba', '.mka', '.mkv', '.aif', '.aiff', '.aifc', '.au', '.snd', '.caf', '.voc', '.mid', '.midi', '.rmi', '.kar', '.wma',
    '.asf', '.amr', '.awb', '.3gp', '.3g2', '.ape', '.wv', '.tta', '.ac3', '.ec3', '.eac3', '.dts', '.mp2', '.mpa', '.m4r', '.alac', '.ra',
    '.rm', '.spx', '.gsm', '.mov', '.avi', '.flv', '.wmv', '.mpg', '.mpeg', '.ts', '.m2ts', '.mts', '.vob', '.dv', '.mxf', '.ogv', '.qt',
    '.sln', '.sox', '.ircam', '.sf', '.mmf', '.xa', '.thd', '.mlp', '.dff', '.dsf', '.tak', '.ofr', '.loas', '.latm'];
  const api = { decode, sniff, wav, aiff, au, caf, voc, midiEvents, renderMidi, ffmpeg, EXTS, FFMPEG_CORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpectralDecoders = api;
})(typeof window !== 'undefined' ? window : globalThis);
