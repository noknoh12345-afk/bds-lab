// GeoUI timeline — media (pure): images packed into one atlas, image sequences as flipbooks (render controller uv_anim), text
// laid out from a glyph atlas, audio (WAV made and read, OGG's length, a waveform's peaks, Bedrock's sound definitions), a stored
// ZIP, and a slider's body drawn as a thick line. Whatever needs pixels takes a function from the caller (the browser's canvas)
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

  // ---------------------------------------------------------------------------------------------------------------- atlas
  /** MaxRects (best short side fit): items [{ id, w, h }] → { w, h, rects: { id: { x, y, w, h } } } — the smallest size tried
   *  first (a power of two each side when pow2), up to maxSize; padding px between them. Throws when they cannot fit */
  function packAtlas(items, { maxSize = 2048, padding = 1, pow2 = true } = {}) {
    const list = (items || []).map((it, i) => ({ id: String(it.id ?? i), w: Math.ceil(num(it.w)), h: Math.ceil(num(it.h)), i })).filter((it) => it.w > 0 && it.h > 0)
      .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.i - b.i);
    if (!list.length) return { w: 1, h: 1, rects: {} };
    const big = list.find((it) => it.w > maxSize || it.h > maxSize);
    if (big) throw new Error(`画像「${big.id}」（${big.w}x${big.h}）がアトラスの上限 ${maxSize} より大きい`);
    const area = list.reduce((s, it) => s + (it.w + padding) * (it.h + padding), 0), up = (x) => (pow2 ? 2 ** Math.ceil(Math.log2(Math.max(1, x))) : Math.ceil(x));
    let w = up(Math.max(Math.sqrt(area), ...list.map((it) => it.w + padding))), h = up(Math.max(area / w, ...list.map((it) => it.h + padding)));
    for (;;) {
      // (the padding is only needed between images: past the atlas's own right and bottom edges it may hang over)
      const r = maxRects(list, Math.min(w, maxSize) + padding, Math.min(h, maxSize) + padding, padding);
      if (r) return { w: Math.min(w, maxSize), h: Math.min(h, maxSize), rects: r };
      if (w >= maxSize && h >= maxSize) throw new Error(`アトラスに入りません（${list.length} 枚、上限 ${maxSize}x${maxSize}）`);
      if (w <= h && w < maxSize) w = pow2 ? w * 2 : Math.ceil(w * 1.25); else h = pow2 ? h * 2 : Math.ceil(h * 1.25);
    }
  }
  function maxRects(list, W, H, pad) {
    let free = [{ x: 0, y: 0, w: W, h: H }];
    const out = {};
    for (const it of list) {
      const iw = it.w + pad, ih = it.h + pad;
      let best = null, bs = Infinity, bl = Infinity;
      for (const f of free) {
        if (iw > f.w || ih > f.h) continue;
        const ss = Math.min(f.w - iw, f.h - ih), ls = Math.max(f.w - iw, f.h - ih);
        if (ss < bs || (ss === bs && ls < bl)) { best = f; bs = ss; bl = ls; }
      }
      if (!best) return null;
      const placed = { x: best.x, y: best.y, w: iw, h: ih };
      out[it.id] = { x: placed.x, y: placed.y, w: it.w, h: it.h };
      const next = [];
      for (const f of free) {
        if (placed.x >= f.x + f.w || placed.x + placed.w <= f.x || placed.y >= f.y + f.h || placed.y + placed.h <= f.y) { next.push(f); continue; }
        if (placed.x > f.x) next.push({ x: f.x, y: f.y, w: placed.x - f.x, h: f.h });
        if (placed.x + placed.w < f.x + f.w) next.push({ x: placed.x + placed.w, y: f.y, w: f.x + f.w - placed.x - placed.w, h: f.h });
        if (placed.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: placed.y - f.y });
        if (placed.y + placed.h < f.y + f.h) next.push({ x: f.x, y: placed.y + placed.h, w: f.w, h: f.y + f.h - placed.y - placed.h });
      }
      free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
    }
    return out;
  }
  /** n frames of frameW x frameH in a grid (cols, default the squarest) → its size and each frame's uv_anim { offset, scale }
   *  (fractions of the texture: what a render controller's uv_anim takes) */
  function flipbook(n, frameW, frameH, { cols } = {}) {
    const c = Math.max(1, Math.round(num(cols, Math.ceil(Math.sqrt(Math.max(1, n)))))), rows = Math.max(1, Math.ceil(Math.max(1, n) / c)), w = c * frameW, h = rows * frameH;
    return { cols: c, rows, w, h, uv: (i) => { const k = Math.max(0, Math.min(Math.max(1, n) - 1, Math.round(num(i)))); return { offset: [((k % c) * frameW) / w, (Math.floor(k / c) * frameH) / h], scale: [frameW / w, frameH / h] }; } };
  }

  // ---------------------------------------------------------------------------------------------------------------- text
  /** the glyphs of chars measured by measure(ch) → { w, h, advance } (px) and packed: { w, h, lineHeight, glyphs: { ch: { x, y, w,
   *  h, advance } } } — the caller draws each glyph into its rectangle */
  function fontAtlas(chars, measure, { padding = 2, maxSize = 2048 } = {}) {
    const set = [...new Set(Array.from(String(chars)).filter((c) => c !== '\n'))];
    const m = new Map(set.map((ch) => [ch, measure(ch) || {}]));
    const a = packAtlas(set.map((ch, i) => ({ id: `g${i}`, w: Math.max(1, num(m.get(ch).w)), h: Math.max(1, num(m.get(ch).h)) })), { padding, maxSize });
    const glyphs = {};
    set.forEach((ch, i) => { const r = a.rects[`g${i}`], g = m.get(ch); glyphs[ch] = { x: r.x, y: r.y, w: r.w, h: r.h, advance: num(g.advance, r.w) }; });
    return { w: a.w, h: a.h, lineHeight: Math.max(1, ...set.map((ch) => num(m.get(ch).h))), glyphs };
  }
  /** text laid out with a font (fontAtlas) → [{ ch, x, y, w, h }] in model units (scale: model units per px), lines going down
   *  (y down from 0: the model's y is up, so a line's y is −its top). Wraps at maxWidth (at a space when there is one; Japanese
   *  and other text without spaces at any character); align: left | center | right */
  function layoutText(text, font, { align = 'left', letterSpacing = 0, lineHeight, maxWidth = Infinity, scale = 1 } = {}) {
    const lh = num(lineHeight, font.lineHeight), adv = (ch) => (font.glyphs[ch] ? font.glyphs[ch].advance : ch === ' ' ? font.lineHeight / 3 : font.lineHeight / 2) + letterSpacing;
    const lines = [];
    for (const raw of String(text).split('\n')) {
      let line = [], wsum = 0, lastSpace = -1;
      for (const ch of Array.from(raw)) {
        const a = adv(ch);
        if (line.length && wsum + a > maxWidth / scale + 1e-9) {
          if (lastSpace > 0 && ch !== ' ') { const rest = line.slice(lastSpace + 1); lines.push(line.slice(0, lastSpace)); line = rest; wsum = rest.reduce((s, c) => s + adv(c), 0); }
          else { lines.push(line); line = []; wsum = 0; }
          lastSpace = -1;
          if (ch === ' ') continue;   // (a line does not start with the space it broke at)
        }
        if (ch === ' ') lastSpace = line.length;
        line.push(ch); wsum += a;
      }
      lines.push(line);
    }
    const out = [];
    lines.forEach((line, li) => {
      const width = line.reduce((s, c) => s + adv(c), 0) - (line.length ? letterSpacing : 0);
      let x = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
      for (const ch of line) {
        const g = font.glyphs[ch];
        if (g) out.push({ ch, x: x * scale, y: -li * lh * scale, w: g.w * scale, h: g.h * scale });
        x += adv(ch);
      }
    });
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------- audio
  const u8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
  const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (b, at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  /** a WAV file's { seconds, rate, channels, bits } (null: not one) */
  function wavInfo(bytes) {
    const b = u8(bytes), d = dv(b);
    if (b.length < 12 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WAVE') return null;
    let fmt = null, data = 0;
    for (let at = 12; at + 8 <= b.length;) {
      const id = tag(b, at), size = d.getUint32(at + 4, true);
      if (id === 'fmt ') fmt = { channels: d.getUint16(at + 10, true), rate: d.getUint32(at + 12, true), bits: d.getUint16(at + 22, true) };
      if (id === 'data') data = Math.min(size, b.length - at - 8);
      at += 8 + size + (size & 1);
    }
    return fmt ? { ...fmt, seconds: data / (fmt.rate * fmt.channels * (fmt.bits / 8)) } : null;
  }
  /** samples (-1..1: one Float32Array or array for mono, or an array of them per channel) → a 16-bit PCM WAV file */
  function makeWav(pcm, rate = 44100) {
    const chans = Array.isArray(pcm) && pcm.length && (ArrayBuffer.isView(pcm[0]) || Array.isArray(pcm[0])) ? pcm : [pcm];
    const n = Math.max(...chans.map((c) => c.length)), ch = chans.length, data = n * ch * 2, b = new Uint8Array(44 + data), d = dv(b);
    const put = (at, s) => { for (let i = 0; i < 4; i++) b[at + i] = s.charCodeAt(i); };
    put(0, 'RIFF'); d.setUint32(4, 36 + data, true); put(8, 'WAVE'); put(12, 'fmt ');
    d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, ch, true); d.setUint32(24, rate, true); d.setUint32(28, rate * ch * 2, true); d.setUint16(32, ch * 2, true); d.setUint16(34, 16, true);
    put(36, 'data'); d.setUint32(40, data, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, num(chans[c][i]))); d.setInt16(44 + (i * ch + c) * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true); }
    return b;
  }
  /** an Ogg Vorbis file's { seconds, rate, channels } (from its identification header and its last page's granule; null: not one) */
  function oggInfo(bytes) {
    const b = u8(bytes), d = dv(b);
    if (b.length < 58 || tag(b, 0) !== 'OggS') return null;
    const segs = b[26], body = 27 + segs;
    if (b[body] !== 1 || String.fromCharCode(...b.subarray(body + 1, body + 7)) !== 'vorbis') return null;
    const channels = b[body + 11], rate = d.getUint32(body + 12, true);
    for (let at = b.length - 27; at >= 0; at--) {
      if (b[at] === 0x4f && tag(b, at) === 'OggS') { const g = d.getUint32(at + 6, true) + d.getUint32(at + 10, true) * 2 ** 32; return { seconds: rate ? g / rate : 0, rate, channels }; }
    }
    return null;
  }
  /** a waveform's peaks: the loudest |sample| in each of buckets equal parts (0..1) — what a timeline draws */
  function peaks(pcm, buckets) {
    const n = Math.max(1, Math.round(num(buckets, 100))), out = new Array(n).fill(0), len = pcm.length;
    for (let i = 0; i < len; i++) { const k = Math.min(n - 1, Math.floor((i * n) / len)), a = Math.abs(pcm[i]); if (a > out[k]) out[k] = a; }
    return out.map((x) => Math.min(1, x));
  }
  /** Bedrock's sound definitions for sounds [{ id, ext ('ogg'|'wav'), volume, pitch, stream }] → { json, paths: { id: path in the RP } } */
  function soundDefinitions(sounds, ns = 'geoui') {
    const defs = {}, paths = {};
    for (const s of sounds || []) {
      const id = String(s.id).replace(/[^\w.]/g, '_'), file = `sounds/${ns}/${id}`;
      paths[s.id] = `${file}.${s.ext === 'wav' ? 'wav' : 'ogg'}`;
      defs[`${ns}.${id}`] = { category: 'ui', sounds: [Object.assign({ name: file, volume: num(s.volume, 1), pitch: num(s.pitch, 1), load_on_low_memory: true }, s.stream ? { stream: true } : {})] };
    }
    return { json: { format_version: '1.20.20', sound_definitions: defs }, paths };
  }

  // ---------------------------------------------------------------------------------------------------------------- zip
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(String(s)) : Uint8Array.from(Buffer.from(String(s), 'utf8')));
  const fromUtf8 = (b) => (typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(b) : Buffer.from(b).toString('utf8'));
  /** files [{ name, data (Uint8Array | string) }] → a ZIP (stored, no compression: PNG frames and packs are compressed already;
   *  the same input gives the same bytes) */
  function zipStore(files) {
    const parts = [], central = [];
    let at = 0;
    for (const f of files || []) {
      const name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : u8(f.data), crc = crc32(data);
      const h = new Uint8Array(30 + name.length), d = dv(h);
      d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true); d.setUint16(6, 0x0800, true); d.setUint16(8, 0, true); d.setUint16(10, 0, true); d.setUint16(12, 0x21, true);
      d.setUint32(14, crc, true); d.setUint32(18, data.length, true); d.setUint32(22, data.length, true); d.setUint16(26, name.length, true); h.set(name, 30);
      const c = new Uint8Array(46 + name.length), e = dv(c);
      e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true); e.setUint16(14, 0x21, true);
      e.setUint32(16, crc, true); e.setUint32(20, data.length, true); e.setUint32(24, data.length, true); e.setUint16(28, name.length, true); e.setUint32(42, at, true); c.set(name, 46);
      parts.push(h, data); central.push(c); at += h.length + data.length;
    }
    const size = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), d = dv(end);
    d.setUint32(0, 0x06054b50, true); d.setUint16(8, central.length, true); d.setUint16(10, central.length, true); d.setUint32(12, size, true); d.setUint32(16, at, true);
    const out = new Uint8Array(at + size + 22);
    let o = 0;
    for (const p of [...parts, ...central, end]) { out.set(p, o); o += p.length; }
    return out;
  }
  /** a stored ZIP (zipStore's) → [{ name, data }]; checks each file's CRC */
  function unzipStore(bytes) {
    const b = u8(bytes), d = dv(b), out = [];
    for (let at = 0; at + 30 <= b.length && d.getUint32(at, true) === 0x04034b50;) {
      if (d.getUint16(at + 8, true) !== 0) throw new Error('圧縮された ZIP は読めません（無圧縮だけ）');
      const size = d.getUint32(at + 18, true), nl = d.getUint16(at + 26, true), xl = d.getUint16(at + 28, true);
      const name = fromUtf8(b.subarray(at + 30, at + 30 + nl)), data = b.slice(at + 30 + nl + xl, at + 30 + nl + xl + size);
      if (crc32(data) !== d.getUint32(at + 14, true)) throw new Error(`ZIP の「${name}」が壊れています（CRC）`);
      out.push({ name, data }); at += 30 + nl + xl + size;
    }
    return out;
  }
  /** file names of an image sequence in their numbers' order (file_2.png before file_10.png) */
  const sortSequence = (names) => (names || []).slice().sort((a, b) => String(a).replace(/\d+/g, (m) => m.padStart(12, '0')).localeCompare(String(b).replace(/\d+/g, (m) => m.padStart(12, '0'))));

  // ---------------------------------------------------------------------------------------------------------------- slider bodies
  /** a thick line's outline (round caps, round where it turns): a closed polygon [[x, y]…] — for hit tests and a quick look */
  function strokeOutline(points, width, { arc = 8 } = {}) {
    const pts = (points || []).filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-9), r = width / 2;
    if (!pts.length) return [];
    if (pts.length === 1) return Array.from({ length: arc * 2 }, (_, k) => [pts[0][0] + r * Math.cos((Math.PI * k) / arc), pts[0][1] + r * Math.sin((Math.PI * k) / arc)]);
    const side = (dir) => {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        out.push([pts[i][0] - (dy / L) * r * dir, pts[i][1] + (dx / L) * r * dir]);
      }
      return out;
    };
    const cap = (p, q) => { const ang = Math.atan2(p[1] - q[1], p[0] - q[0]), out = []; for (let k = 1; k < arc; k++) { const t = ang + Math.PI / 2 - (Math.PI * k) / arc; out.push([p[0] + r * Math.cos(t), p[1] + r * Math.sin(t)]); } return out; };
    const L = side(1), R = side(-1).reverse(), n = pts.length;
    return [...L, ...cap(pts[n - 1], pts[n - 2]), ...R, ...cap(pts[0], pts[1])];
  }
  /** a slider's body as an image: its size in px and the canvas steps that draw it (an osu!-like border and fill: a wide stroke,
   *  a narrower one inside), the body's centre at the image's centre. body = osu.toDocument's ({ points, width } in model units) */
  function bodyImage(body, { pxPerUnit = 4, border = 0.12, colours = { border: '#ffffff', fill: '#1a1a2a' } } = {}) {
    const xs = body.points.map((p) => p[0]), ys = body.points.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const pad = body.width / 2 + 1, w = Math.ceil((Math.max(...xs) - Math.min(...xs) + 2 * pad) * pxPerUnit), h = Math.ceil((Math.max(...ys) - Math.min(...ys) + 2 * pad) * pxPerUnit);
    const px = (p) => [(p[0] - cx) * pxPerUnit + w / 2, h / 2 - (p[1] - cy) * pxPerUnit];
    const line = body.points.map(px), path = [['moveTo', ...line[0]], ...line.slice(1).map((p) => ['lineTo', ...p])];
    return { w, h, centre: [cx, cy], ops: [['lineJoin', 'round'], ['lineCap', 'round'],
      ['strokeStyle', colours.border], ['lineWidth', body.width * pxPerUnit], ['beginPath'], ...path, ['stroke'],
      ['strokeStyle', colours.fill], ['lineWidth', body.width * pxPerUnit * (1 - 2 * border)], ['beginPath'], ...path, ['stroke']] };
  }
  /** canvas steps (bodyImage's ops) run on a 2D context */
  function drawOps(ctx, ops) { for (const [op, ...a] of ops) { if (typeof ctx[op] === 'function') ctx[op](...a); else ctx[op] = a[0]; } }

  T.media = { packAtlas, flipbook, fontAtlas, layoutText, wavInfo, makeWav, oggInfo, peaks, soundDefinitions, crc32, zipStore, unzipStore, sortSequence, strokeOutline, bodyImage, drawOps };
  if (typeof module === 'object' && module && module.exports) module.exports = T.media;
})(typeof globalThis !== 'undefined' ? globalThis : this);
