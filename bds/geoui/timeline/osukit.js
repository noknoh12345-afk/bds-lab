// GeoUI timeline — osu! made whole (pure): a beatmap into a GeoUI design (its elements and one texture atlas), a timeline
// document (the hit objects as instances of templates, the playfield's own motion, the HUD) and the gameplay config
// (osugame.js) — in two looks:
//   pixel: low-res pixel art built of cubes. Every sprite is a voxel model — its front the pixels, its sides the same pixels
//          darker — and the whole playfield stands tilted in 3D (its sides show) and leans with the cursor (parallax); circles
//          pop in, burst into cubes, numbers and judgements are voxel digits. A chiptune hitsound set.
//   skin:  osu!'s own skin (the Legacy skin: hit circles tinted by combo colour under their overlay, approach circles, default
//          numbers, 300 / 100 / 50 / miss, slider balls rolling, follow circles, reverse arrows, ticks, follow points, the
//          spinner, score digits, the health bar, the cursor, rank letters) in a high-resolution atlas, flat like osu!.
// Both: the music, the playfield shaking on a miss, pulsing on each beat of a kiai section and leaning with the cursor, osu!'s
// early-press shake (notelock), circles exploding on a hit, the combo counter popping, the spinner turning with the cursor,
// a section pass / fail in the break, the rank at the end — and the game's rules (osugame.js: score v1, accuracy, health).
// Images in and out are { width, height, data: RGBA bytes }; the caller decodes and encodes PNGs (Node: png.mjs, Blockbench:
// a canvas). build(map, opts) → { design, doc, game, info, sounds, stats, warnings }.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

  // ---------------------------------------------------------------------------------------------------------------- images
  const img = (w, h) => ({ width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)), data: new Uint8Array(Math.max(1, Math.ceil(w)) * Math.max(1, Math.ceil(h)) * 4) });
  function put(im, x, y, c) {
    if (x < 0 || y < 0 || x >= im.width || y >= im.height || !(c[3] > 0)) return;
    const o = (y * im.width + x) * 4, a = c[3] / 255, b = im.data[o + 3] / 255, out = a + b * (1 - a);
    for (let k = 0; k < 3; k++) im.data[o + k] = Math.round((c[k] * a + im.data[o + k] * b * (1 - a)) / (out || 1));
    im.data[o + 3] = Math.round(out * 255);
  }
  const get = (im, x, y) => { if (x < 0 || y < 0 || x >= im.width || y >= im.height) return [0, 0, 0, 0]; const o = (y * im.width + x) * 4; return [im.data[o], im.data[o + 1], im.data[o + 2], im.data[o + 3]]; };
  /** src drawn over dst at (dx, dy), each pixel's colour multiplied by tint ([r, g, b] 0…255) */
  function blit(dst, src, dx, dy, tint) { for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) { const c = get(src, x, y); if (tint) for (let k = 0; k < 3; k++) c[k] = Math.round((c[k] * tint[k]) / 255); put(dst, dx + x, dy + y, c); } }
  /** a resized copy: each output pixel the average of what it covers (premultiplied: no dark fringe), bilinear when growing */
  function resize(src, w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const out = img(w, h), sx = src.width / w, sy = src.height / h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      if (sx <= 1 && sy <= 1) {
        const fx = Math.max(0, (x + 0.5) * sx - 0.5), fy = Math.max(0, (y + 0.5) * sy - 0.5), x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        for (const [xx, yy, wgt] of [[x0, y0, (1 - ax) * (1 - ay)], [x0 + 1, y0, ax * (1 - ay)], [x0, y0 + 1, (1 - ax) * ay], [x0 + 1, y0 + 1, ax * ay]]) { const c = get(src, Math.min(src.width - 1, xx), Math.min(src.height - 1, yy)), al = c[3] / 255; r += c[0] * al * wgt; g += c[1] * al * wgt; b += c[2] * al * wgt; a += al * wgt; n += wgt; }
      } else {
        const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy;
        for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wgt = (Math.min(x1, xx + 1) - Math.max(x0, xx)) * (Math.min(y1, yy + 1) - Math.max(y0, yy));
          if (wgt <= 0) continue;
          const c = get(src, xx, yy), al = c[3] / 255; r += c[0] * al * wgt; g += c[1] * al * wgt; b += c[2] * al * wgt; a += al * wgt; n += wgt;
        }
      }
      const o = (y * w + x) * 4, A = n ? a / n : 0;
      if (A > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); out.data[o + 3] = Math.round(A * 255); }
    }
    return out;
  }
  /** the same picture placed in the middle of a w × h canvas */
  function centred(src, w, h) { const o = img(w, h); blit(o, src, Math.floor((w - src.width) / 2), Math.floor((h - src.height) / 2)); return o; }
  const shade = (c, f) => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f), c[3]];
  const mix = (a, b, f) => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)).concat([a[3] === undefined ? 255 : a[3]]);

  // ---------------------------------------------------------------------------------------------------------------- pixel art
  // a 3 × 5 font (each glyph 5 rows of 3 bits, top first) and a few 5-wide glyphs
  const FONT = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'], A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    I: ['111', '010', '010', '010', '111'], L: ['100', '100', '100', '100', '111'], N: ['101', '111', '111', '111', '101'], P: ['110', '101', '110', '100', '100'],
    R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], '!': ['010', '010', '010', '000', '010'], '.': ['000', '000', '000', '000', '010'],
    x: ['000', '101', '010', '101', '000'], '%': ['101', '001', '010', '100', '101'], X: ['10001', '01010', '00100', '01010', '10001'],
  };
  /** text in the font → an image (1 px a pixel, gap px between glyphs), colour c, a darker outline row below (depth on a flat face) */
  function textImage(s, c, { gap = 1 } = {}) {
    const glyphs = [...String(s)].map((ch) => FONT[ch] || FONT[ch.toUpperCase()] || ['000', '000', '000', '000', '000']), w = glyphs.reduce((n, g) => n + g[0].length, 0) + gap * (glyphs.length - 1);
    const im = img(w, 5);
    let x0 = 0;
    for (const g of glyphs) { g.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') put(im, x0 + x, y, y === 0 ? mix(c, [255, 255, 255], 0.35) : c); })); x0 += g[0].length + gap; }
    return im;
  }
  /** a disc / ring of pixels (centre at the middle of an n × n image), coloured by fn(x, y, d) */
  function discImage(n, fn) { const im = img(n, n), c = n / 2; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c), col = fn(x, y, d, c); if (col) put(im, x, y, col); } return im; }
  const WHITE = [255, 255, 255, 255];
  /** the pixel look's sprites for a combo colour palette → { name: image | [images] (frames) } */
  function pixelSprites(colours) {
    const S = {};
    // hit circle (16 px): a white rim, the combo colour lit from the top left, a dark ring between
    S.hitcircle = colours.map((cc) => discImage(16, (x, y, d) => { if (d > 7.9) return null; if (d > 6.6) return WHITE; if (d > 5.7) return shade([...cc, 255], 0.55); const l = (8 - x - y) / 16; return l > 0.18 && d < 4.2 ? mix([...cc, 255], [255, 255, 255], 0.45) : l < -0.3 ? shade([...cc, 255], 0.78) : [...cc, 255]; }));
    S.approachcircle = colours.map((cc) => discImage(16, (x, y, d) => (d > 6.9 && d <= 7.9 ? mix([...cc, 255], [255, 255, 255], 0.3) : null)));
    S.hitburst = discImage(16, (x, y, d, c) => { const a = Math.atan2(y + 0.5 - c, x + 0.5 - c), k = ((a / (Math.PI * 2)) * 8 + 8.5) % 1; return d > 5 && d <= 7.6 && k > 0.35 && k < 0.65 ? (d > 6.5 ? [255, 236, 140, 255] : WHITE) : null; });
    S.sliderball = discImage(8, (x, y, d) => (d > 3.95 ? null : d > 3 ? [255, 160, 40, 255] : (x + y < 6 ? [255, 255, 220, 255] : [255, 212, 90, 255])));
    S.followcircle = discImage(28, (x, y, d) => (d > 12.9 && d <= 13.95 ? [255, 255, 255, 255] : d > 12 && d <= 12.9 ? [255, 190, 80, 255] : null));
    S.reversearrow = (() => { const im = img(7, 7); ['0010000', '0011000', '1111100', '1111110', '1111100', '0011000', '0010000'].forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') put(im, x, y, y === 3 ? [255, 255, 160, 255] : WHITE); })); return im; })();
    S.slidertick = discImage(3, (x, y, d) => (d < 1.6 ? WHITE : null));
    S.followpoint = (() => { const im = img(3, 5); [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]].forEach(([x, y]) => put(im, x, y, [200, 220, 255, 255])); return im; })();
    S.spinner = discImage(32, (x, y, d, c) => { const a = Math.atan2(y + 0.5 - c, x + 0.5 - c), spoke = Math.abs(((a / (Math.PI * 2)) * 6 + 6) % 1 - 0.5) > 0.42; if (d > 15.9) return null; if (d > 14.6) return WHITE; if (d > 13.4) return [70, 110, 255, 255]; if (spoke && d > 3 && d < 13.4) return [140, 170, 255, 255]; if (d <= 2.5) return [255, 255, 255, 255]; return null; });
    S.spinnerapproach = discImage(32, (x, y, d) => (d > 14.9 && d <= 15.9 ? [140, 220, 255, 255] : null));
    S.cursor = (() => { const im = img(7, 7); ['0001000', '0011100', '0110110', '1100011', '0110110', '0011100', '0001000'].forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') put(im, x, y, (x + y) % 2 ? [255, 230, 120, 255] : WHITE); })); return im; })();
    S.judgement = [textImage('300', [94, 200, 255, 255]), textImage('100', [124, 255, 94, 255]), textImage('50', [255, 179, 71, 255]), textImage('X', [255, 64, 64, 255])];
    S.digit = Array.from({ length: 10 }, (_, d) => textImage(String(d), WHITE));
    S.spin = textImage('SPIN!', [140, 220, 255, 255]); S.clear = textImage('CLEAR', [255, 220, 80, 255]);
    S.rank = ['SS', 'S', 'A', 'B', 'C', 'D'].map((r, i) => textImage(r, [[255, 240, 120], [255, 210, 64], [120, 255, 120], [90, 180, 255], [220, 120, 255], [255, 90, 90]][i].concat([255])));
    S.section = [textImage('PASS', [120, 255, 140, 255]), textImage('FAIL', [255, 90, 90, 255])];
    S.x = textImage('x', WHITE); S.dot = textImage('.', WHITE); S.pct = textImage('%', WHITE);
    // the HUD's bars (1 px tall strips, a few long) and the board under the playfield (a grid, dark see-through)
    S.barback = (() => { const im = img(42, 3); for (let x = 0; x < 42; x++) for (let y = 0; y < 3; y++) put(im, x, y, y === 0 ? [90, 90, 130, 255] : [36, 36, 54, 255]); return im; })();
    S.barfill = (() => { const im = img(40, 1); for (let x = 0; x < 40; x++) put(im, x, 0, mix([255, 90, 120, 255], [120, 255, 160, 255], x / 39)); return im; })();
    S.board = (() => { const im = img(64, 48); for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) put(im, x, y, x % 8 === 0 || y % 8 === 0 ? [52, 58, 98, 200] : (x + y) % 2 ? [12, 14, 28, 190] : [16, 18, 34, 190]); return im; })();
    S.glow = discImage(16, (x, y, d) => (d < 7.9 ? [255, 255, 255, Math.round(150 * (1 - d / 8))] : null));
    return S;
  }

  // ---------------------------------------------------------------------------------------------------------------- the atlas
  /** items { id, image } (frames: a list, laid side by side: one cell each) → { image, at: id → { x, y, w, h, cell: [w, h] } } */
  function atlasOf(items, { maxSize = 4096, padding = 2 } = {}) {
    // (frames in a grid: as many a row as keep it within half the largest size)
    const blocks = items.map((it) => { const ims = Array.isArray(it.image) ? it.image : [it.image], cw = Math.max(...ims.map((m) => m.width)), ch = Math.max(...ims.map((m) => m.height)), extra = it.shade ? 2 : 1;
      const cols = Math.max(1, Math.min(ims.length, Math.floor(maxSize / 2 / (cw * extra)))), rows = Math.ceil(ims.length / cols);
      return { id: it.id, ims, cw, ch, cols, rows, w: cw * cols * extra, h: ch * rows, shade: it.shade }; });
    const P = T.media.packAtlas(blocks.map((b) => ({ id: b.id, w: b.w, h: b.h })), { maxSize, padding, pow2: true }), im = img(P.w, P.h), at = {};
    for (const b of blocks) {
      const r = P.rects[b.id];
      b.ims.forEach((m, k) => {
        // (each frame a cell: the picture in its top left — a voxel sprite's cubes read it pixel by pixel — and, for a voxel sprite,
        //  its darker copy beside it in the same cell: the sides of its cubes)
        const x0 = r.x + (k % b.cols) * b.cw * (b.shade ? 2 : 1), y0 = r.y + Math.floor(k / b.cols) * b.ch;
        blit(im, m, x0, y0);
        if (b.shade) { const dk = img(m.width, m.height); for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const c = get(m, x, y); if (c[3]) put(dk, x, y, shade(c, 0.58)); } blit(im, dk, x0 + b.cw, y0); }
      });
      at[b.id] = { x: r.x, y: r.y, cell: [b.cw * (b.shade ? 2 : 1), b.ch], w: b.cw, h: b.ch, frames: b.ims.length, cols: b.cols, rows: b.rows };
    }
    return { image: im, at, width: P.w, height: P.h };
  }

  // ---------------------------------------------------------------------------------------------------------------- geometry
  /** a flat element: a plane w × h model units centred on (cx, cy) at depth z, its face the atlas rect */
  const plane = (name, parent, [cx, cy], [w, h], uv, z, uvSize) => ({ name, parent, pivot: [r4(cx), r4(cy), r4(z)],
    cubes: [{ origin: [r4(cx - w / 2), r4(cy - h / 2), r4(z)], size: [r4(w), r4(h), 0], faces: { north: { uv: [uv[0], uv[1]], uv_size: uvSize || [uv[2], uv[3]], texture: 'atlas' } } }] });
  /** a voxel element: the pixels of a sprite as cubes px units a pixel, depth d units deep, its front at z, centred on (cx, cy).
   *  Merged into as few rectangles as the picture allows (each face shows its own pixels: front from the picture, the sides
   *  from its darker copy) — or a cube a pixel (perPixel: the pixels any of its frames has, so that a frame's own picture
   *  decides which show: an empty texel is cut out) */
  function voxel(name, parent, [cx, cy], images, cellAt, px, d, z, { perPixel = false } = {}) {
    const ims = Array.isArray(images) ? images : [images], w = Math.max(...ims.map((m) => m.width)), h = Math.max(...ims.map((m) => m.height));
    const on = (x, y) => ims.some((m) => get(m, x, y)[3] > 0), rects = [];
    if (perPixel) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) rects.push([x, y, x, y]); }
    else {
      // (runs of a row, then each run grown down while the rows below have the very same run)
      const used = new Set();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!on(x, y) || used.has(`${x},${y}`)) continue;
        let x1 = x; while (x1 + 1 < w && on(x1 + 1, y) && !used.has(`${x1 + 1},${y}`)) x1++;
        let y1 = y; const rowOk = (yy) => { for (let k = x; k <= x1; k++) if (!on(k, yy) || used.has(`${k},${yy}`)) return false; return !on(x - 1, yy) === !on(x - 1, y) && !on(x1 + 1, yy) === !on(x1 + 1, y); };
        while (y1 + 1 < h && rowOk(y1 + 1)) y1++;
        for (let yy = y; yy <= y1; yy++) for (let k = x; k <= x1; k++) used.add(`${k},${yy}`);
        rects.push([x, y, x1, y1]);
      }
    }
    const left = cx - (w * px) / 2, top = cy + (h * px) / 2, [ux, uy] = cellAt, sx = ux + w;   // (the darker copy: right of the picture)
    const cubes = rects.map(([x0, y0, x1, y1]) => {
      const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
      return { origin: [r4(left + x0 * px), r4(top - (y1 + 1) * px), r4(z)], size: [r4(rw * px), r4(rh * px), r4(d)], faces: {
        north: { uv: [ux + x0, uy + y0], uv_size: [rw, rh], texture: 'atlas' },
        east: { uv: [sx + x1, uy + y0], uv_size: [1, rh], texture: 'atlas' }, west: { uv: [sx + x0, uy + y0], uv_size: [1, rh], texture: 'atlas' },
        up: { uv: [sx + x0, uy + y0], uv_size: [rw, 1], texture: 'atlas' }, down: { uv: [sx + x0, uy + y1], uv_size: [rw, 1], texture: 'atlas' },
      } };
    });
    return { name, parent, pivot: [r4(cx), r4(cy), r4(z)], cubes };
  }

  // ---------------------------------------------------------------------------------------------------------------- bodies
  /** each slider's body drawn along its ball's line, one cell each (all the same size) → { cells: [image], centre: [[x, y]] } */
  function bodies(G, colours, combosOf, { ppu, pixel }) {
    const sl = G.objects.map((o, i) => [o, i]).filter(([o]) => o.k === 's'), W = 2 * G.r;
    const ext = (o, ax) => { const v = o.line.map((p) => p[ax]); return Math.max(...v) - Math.min(...v) + W + 2; };
    const cw = Math.ceil(Math.max(1, ...sl.map(([o]) => ext(o, 0))) * ppu), ch = Math.ceil(Math.max(1, ...sl.map(([o]) => ext(o, 1))) * ppu), cells = [], centre = [];
    for (const [o, i] of sl) {
      const xs = o.line.map((p) => p[0]), ys = o.line.map((p) => p[1]), mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
      const pt = (p) => [(p[0] - mx) * ppu + cw / 2, ch / 2 - (p[1] - my) * ppu], line = o.line.map(pt), path = [['moveTo', ...line[0]], ...line.slice(1).map((p) => ['lineTo', ...p])];
      const cc = colours[combosOf[i] % colours.length], hex = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
      // (a tube: the white border, then bands from the combo colour's dark edge to its light middle)
      const bands = pixel ? [[1, [255, 255, 255]], [0.78, shade(cc, 0.42)], [0.42, shade(cc, 0.6)]] : [[1, [255, 255, 255]], [0.86, shade(cc, 0.22)], [0.7, shade(cc, 0.32)], [0.52, shade(cc, 0.42)], [0.32, shade(cc, 0.55)]];
      const ops = [['lineJoin', 'round'], ['lineCap', 'round']];
      for (const [f, c] of bands) ops.push(['strokeStyle', hex(c)], ['lineWidth', W * ppu * f], ['beginPath'], ...path, ['stroke']);
      let im = T.media.rasterOps(ops, cw, ch);
      if (pixel) { for (let k = 3; k < im.data.length; k += 4) im.data[k] = im.data[k] >= 128 ? 255 : 0; }
      else for (let k = 3; k < im.data.length; k += 4) im.data[k] = Math.round(im.data[k] * 0.9);
      im = { width: im.width, height: im.height, data: im.data };
      cells.push(im); centre.push([r4(mx), r4(my)]);
    }
    return { cells, centre, units: [cw / ppu, ch / ppu] };
  }

  // ---------------------------------------------------------------------------------------------------------------- the document
  /** the timeline document for a beatmap and its gameplay config (the same ids: o<n> for objects) — L: { pixel (the look), C
   *  (the playfield's middle), bpm, kiai [[s, s]], breaks, duration } */
  function docOf(map, G, L) {
    const O = T.osu, diff = O.difficultyOf(map), lead = r4(diff.preempt / 1000), fade = r4(diff.fadeIn / 1000), late = r4(diff.windows.meh / 1000), cs = O.combos(map), P = L.pixel;
    const at = (v) => [{ t: 0, v }], place = { x: at('param.x'), y: at('param.y') };
    const beat = 60 / L.bpm;
    // ---- how a circle looks (the circle template and a slider's head): it comes in (fades — pops, in the pixel look), shakes when
    //      pressed too early, explodes on its hit (bursts into cubes)
    const comeIn = P ? { scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.16, v: 1 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.16, v: 1 }] } : { opacity: [{ t: 0, v: 0 }, { t: fade, v: 1 }] };
    const shakeX = 'param.x + 2.4 * math.sin(t * 2880) * (1 - t / 0.25)';
    const circleLook = (hitName, endExpr) => [
      { target: 'hitcircle', clips: [
        { start: 0, end: 0.25, trigger: 'early', channels: { x: at(shakeX), y: at('param.y'), frame: at('param.c') } },
        P ? { start: 0, end: 0.12, trigger: hitName, channels: { ...place, frame: at('param.c'), scaleX: [{ t: 0, v: 1.25, ease: 'quad-in' }, { t: 0.12, v: 0 }], scaleY: [{ t: 0, v: 1.25, ease: 'quad-in' }, { t: 0.12, v: 0 }] } }
          : { start: 0, end: 0.24, trigger: hitName, channels: { ...place, frame: at('param.c'), scaleX: [{ t: 0, v: 1, ease: 'quad-out' }, { t: 0.24, v: 1.45 }], scaleY: [{ t: 0, v: 1, ease: 'quad-out' }, { t: 0.24, v: 1.45 }], opacity: [{ t: 0, v: 1, ease: 'quad-in' }, { t: 0.24, v: 0 }] } },
        { start: -lead, end: endExpr, until: 'hit', channels: { ...place, frame: at('param.c'), ...comeIn } }] },
      { target: 'combonumber', clips: [
        { start: 0, end: 0.25, trigger: 'early', channels: { x: at(shakeX), y: at('param.y'), value: at('param.n') } },
        { start: -lead, end: endExpr, until: 'hit', channels: { ...place, value: at('param.n'), ...(P ? comeIn : {}) } }] },
      { target: 'approachcircle', clips: [{ start: -lead, end: 0, until: 'hit', channels: { ...place, frame: at('param.c'),
        scaleX: [{ t: 0, v: 4 }, { t: lead, v: 1 }], scaleY: [{ t: 0, v: 4 }, { t: lead, v: 1 }], ...(P ? {} : { opacity: [{ t: 0, v: 0 }, { t: Math.min(lead, fade * 2), v: 0.9 }] }) } }] },
      ...(P ? [{ target: 'hitburst', clips: [{ start: 0, end: 0.32, trigger: hitName, channels: { ...place, scaleX: [{ t: 0, v: 0.8, ease: 'quad-out' }, { t: 0.32, v: 2.3 }], scaleY: [{ t: 0, v: 0.8, ease: 'quad-out' }, { t: 0.32, v: 2.3 }], rotation: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.32, v: 60 }] } }] }] : []),
    ];
    // ---- the judgement: 300 / 100 / 50 / miss where it was judged (jx, jy: a slider's end), popping in and away
    const judgement = (k) => ({ target: 'judgement', clips: [
      ...['great', 'good', 'ok'].map((name, f) => ({ start: 0, end: 0.6, trigger: name, channels: { x: at(`param.${k}x`), y: [{ t: 0, v: `param.${k}y` }, { t: 0.6, v: `param.${k}y + 2.5` }], frame: at(f),
        scaleX: [{ t: 0, v: 0.6, ease: 'back-out' }, { t: 0.12, v: 1 }, { t: 0.45, v: 1, ease: 'quad-in' }, { t: 0.6, v: P ? 0 : 0.95 }], scaleY: [{ t: 0, v: 0.6, ease: 'back-out' }, { t: 0.12, v: 1 }, { t: 0.45, v: 1, ease: 'quad-in' }, { t: 0.6, v: P ? 0 : 0.95 }],
        ...(P ? {} : { opacity: [{ t: 0, v: 1 }, { t: 0.4, v: 1, ease: 'quad-in' }, { t: 0.6, v: 0 }] }) } })),
      { start: 0, end: 0.7, trigger: 'miss', channels: { x: at(`param.${k}x`), y: [{ t: 0, v: `param.${k}y + 2`, ease: 'quad-in' }, { t: 0.7, v: `param.${k}y - 6` }], frame: at(3),
        rotation: [{ t: 0, v: 0 }, { t: 0.7, v: 'param.n * 7 - 20' }], scaleX: [{ t: 0, v: 1.5, ease: 'quad-out' }, { t: 0.1, v: 1 }, { t: 0.55, v: 1 }, { t: 0.7, v: P ? 0 : 1 }], scaleY: [{ t: 0, v: 1.5, ease: 'quad-out' }, { t: 0.1, v: 1 }, { t: 0.55, v: 1 }, { t: 0.7, v: P ? 0 : 1 }],
        ...(P ? {} : { opacity: [{ t: 0, v: 1 }, { t: 0.5, v: 1 }, { t: 0.7, v: 0 }] }) } }] });
    const templates = [
      { id: 'osu-circle', name: 'osu! 円', lead, tail: r4(late + 0.7), params: ['x', 'y', 'n', 'c', 'jx', 'jy'], judge: { kind: 'circle' }, tracks: [...circleLook('hit', late), judgement('j')] },
      { id: 'osu-slider', name: 'osu! スライダー', lead, tail: 0.7, params: ['x', 'y', 'n', 'c', 'd', 'r', 'f', 'bx', 'by', 'ex', 'ey', 'ea', 'jx', 'jy'], judge: { kind: 'slider' }, tracks: [
        { target: 'sliderbody', clips: [{ start: -lead, end: 'param.d + 0.1', channels: { x: at('param.bx'), y: at('param.by'), frame: at('param.f'), ...(P ? { scaleX: [{ t: 0, v: 0.2, ease: 'back-out' }, { t: 0.2, v: 1 }], scaleY: [{ t: 0, v: 0.2, ease: 'back-out' }, { t: 0.2, v: 1 }] } : { opacity: [{ t: 0, v: 0 }, { t: fade, v: 0.9 }] }) } }] },
        ...circleLook('tap', 'math.min(' + late + ', param.d)'),
        { target: 'reversearrow', clips: [{ start: -lead, end: 'param.d * (param.r - 1) / param.r', channels: { x: at('param.ex'), y: at('param.ey'), rotation: at('param.ea'),
          scaleX: at(`math.min(1, param.r - 1) * (1 + 0.15 * math.abs(math.sin(t * ${r4(180 / beat)})))`), scaleY: at(`math.min(1, param.r - 1) * (1 + 0.15 * math.abs(math.sin(t * ${r4(180 / beat)})))`) } }] },
        { target: 'sliderball', clips: [{ start: 0, end: 'param.d', path: '@instance', channels: { path: at('1 - math.abs(math.mod(t * param.r / param.d, 2) - 1)'), ...(P ? { rotation: at('t * 540') } : { frame: at('math.mod(math.floor(t * 40), 10)') }) } }] },
        { target: 'followcircle', clips: [{ start: 0, end: 'param.d', path: '@instance', channels: { path: at('1 - math.abs(math.mod(t * param.r / param.d, 2) - 1)'),
          scaleX: at('math.min(1, 0.5 + t * 5) * (0.55 + 0.45 * state.hold)'), scaleY: at('math.min(1, 0.5 + t * 5) * (0.55 + 0.45 * state.hold)') } }] },
        judgement('j')] },
      { id: 'osu-tick', name: 'osu! ティック', lead: 0, tail: 0, params: ['x', 'y', 'w'], tracks: [
        { target: 'slidertick', clips: [{ start: '0 - param.w', end: 0, channels: { ...place, scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.15, v: 1 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.15, v: 1 }] } }] }] },
      { id: 'osu-follow', name: 'osu! フォローポイント', lead: 0.5, tail: 0, params: ['x', 'y', 'a'], tracks: [
        { target: 'followpoint', clips: [{ start: -0.5, end: 0, channels: { ...place, rotation: at('param.a'), scaleX: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.12, v: 1 }, { t: 0.38, v: 1, ease: 'quad-in' }, { t: 0.5, v: 0 }], scaleY: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.12, v: 1 }, { t: 0.38, v: 1, ease: 'quad-in' }, { t: 0.5, v: 0 }] } }] }] },
      { id: 'osu-spinner', name: 'osu! スピナー', lead: 0.3, tail: 0.4, params: ['d'], judge: { kind: 'spinner' }, tracks: [
        { target: 'spinner', clips: [{ start: -0.3, end: 'param.d', channels: { rotation: at('0 - state.sa'), scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.3, v: 1 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.3, v: 1 }] } }] },
        { target: 'spinnerapproach', clips: [{ start: 0, end: 'param.d', channels: { scaleX: at('math.clamp(1 - t / param.d, 0.03, 1)'), scaleY: at('math.clamp(1 - t / param.d, 0.03, 1)') } }] },
        { target: 'spinnerspin', clips: [{ start: -0.3, end: 1.0, channels: { scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.25, v: 1 }, { t: 1.0, v: 1, ease: 'quad-in' }, { t: 1.3, v: 0 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.25, v: 1 }, { t: 1.0, v: 1, ease: 'quad-in' }, { t: 1.3, v: 0 }] } }] },
        { target: 'spinnerclear', clips: [{ start: 0, end: 'param.d + 0.4', channels: { scaleX: at('math.floor(state.spin) * (1 + 0.08 * math.sin(t * 720))'), scaleY: at('math.floor(state.spin) * (1 + 0.08 * math.sin(t * 720))') } }] },
        ...[0, 1, 2].map((k) => ({ target: `spinnerrpm${k}`, clips: [{ start: 0, end: 'param.d', channels: { frame: at(`math.mod(math.floor(state.rpm / ${[100, 10, 1][k]}), 10)`) } }] })),
        ...(P ? [] : [{ target: 'spinnerrpmbg', clips: [{ start: 0, end: 'param.d', channels: {} }] }]),
      ] },
    ];
    // ---- the instances
    const instances = [], paths = [], ticks = [], follows = [];
    const objs = map.objects || [];
    objs.forEach((o, i) => {
      const g = G.objects[i], id = `o${i + 1}`, t = r4(o.time / 1000), c = cs[i];
      if (g.k === 'c') instances.push({ id, template: 'osu-circle', t, params: { x: g.x, y: g.y, n: c.n, c: c.colour % L.colours, jx: g.x, jy: g.y } });
      else if (g.k === 's') {
        const d = r4(g.d / 1000), line = g.line, end = line[line.length - 1], prev = line[Math.max(0, line.length - 2)], fin = g.r % 2 ? end : line[0], pid = `op${i + 1}`;
        paths.push({ id: pid, kind: 'linear', points: line.map((p) => [p[0], p[1]]), length: g.len });
        const ea = r4((-Math.atan2(prev[1] - end[1], prev[0] - end[0]) * 180) / Math.PI);
        instances.push({ id, template: 'osu-slider', t, path: pid, tail: r4(d + 0.7), params: { x: g.x, y: g.y, n: c.n, c: c.colour % L.colours, d, r: g.r, f: L.bodyFrame[i], bx: L.bodyCentre[i][0], by: L.bodyCentre[i][1], ex: end[0], ey: end[1], ea, jx: fin[0], jy: fin[1] } });
        // (its ticks, first slide only: each shows from the slider's coming in until the ball reaches it)
        const span = g.d / g.r;
        for (const tk of g.ticks) if (tk < span) { const tt = (g.t + tk) / 1000, p = (() => { const gg = T.osugame.createGame({ objects: [g], windows: G.windows, r: G.r }); return gg.ballAt(0, g.t + tk); })(); ticks.push({ t: r4(tt), x: r4(p[0]), y: r4(p[1]), w: r4(tt - (t - lead)) }); }
      } else instances.push({ id, template: 'osu-spinner', t, tail: r4((g.e - g.t) / 1000 + 0.4), params: { d: r4((g.e - g.t) / 1000) } });
      // (follow points to the next object of the same combo: every 32 osu! pixels along the way, each shown just before the cursor
      //  should pass it)
      const nx = objs[i + 1], gn = G.objects[i + 1];
      if (nx && gn && !nx.newCombo && g.k !== 'p' && gn.k !== 'p') {
        const from = g.k === 's' ? (g.r % 2 ? g.line[g.line.length - 1] : g.line[0]) : [g.x, g.y], tFrom = (g.k === 's' ? g.t + g.d : g.t) / 1000, tTo = gn.t / 1000;
        const dx = gn.x - from[0], dy = gn.y - from[1], dist = Math.hypot(dx, dy), step = 32 * (L.width / 512), a = r4((-Math.atan2(dy, dx) * 180) / Math.PI);
        for (let s = step * 1.5; s < dist - step * 0.75 - G.r * 0.5; s += step) { const f = s / dist; follows.push({ t: r4(tFrom + f * (tTo - tFrom)), x: r4(from[0] + dx * f), y: r4(from[1] + dy * f), a }); }
      }
    });
    ticks.forEach((k, i) => instances.push({ id: `k${i + 1}`, template: 'osu-tick', t: k.t, params: { x: k.x, y: k.y, w: k.w } }));
    follows.forEach((f, i) => instances.push({ id: `f${i + 1}`, template: 'osu-follow', t: f.t, params: { x: f.x, y: f.y, a: f.a } }));
    // (the ticks' template shows its instances from param.w before: its lead is the longest of them)
    templates.find((x) => x.id === 'osu-tick').lead = r4(Math.max(0.1, ...ticks.map((k) => k.w)));
    // ---- the playfield's own motion and the HUD
    const dur = L.duration, kiai = L.kiai.map(([a, b]) => [a / 1000, b / 1000]);
    const firstT = objs.length ? objs[0].time / 1000 : 0, lastEnd = Math.max(...G.objects.map((g) => (g.k === 's' ? g.t + g.d : g.k === 'p' ? g.e : g.t))) / 1000;
    const span = (from, to, channels, extra = {}) => Object.assign({ start: r4(from), end: r4(to), channels }, extra);
    // the pulse: in a kiai section, every beat (1.035 on the beat, back by 40 % of it); at the start, the field grows in
    const pulseClips = [span(0, 1.0, { scaleX: [{ t: 0, v: 0.9, ease: 'back-out' }, { t: 1.0, v: 1 }], scaleY: [{ t: 0, v: 0.9, ease: 'back-out' }, { t: 1.0, v: 1 }] })];
    let tt = 1.0;
    for (const [a, b] of kiai) {
      if (a > tt) pulseClips.push(span(tt, a, {}));
      const keys = [];
      for (let bt = 0; a + bt < b - 1e-6; bt += beat) keys.push({ t: r4(bt), v: 1.035, ease: 'quad-out' }, { t: r4(bt + beat * 0.4), v: 1 });
      pulseClips.push(span(a, b, { scaleX: keys, scaleY: keys.map((k) => ({ ...k })) }));
      tt = b;
    }
    if (tt < dur) pulseClips.push(span(tt, dur, {}));
    // the lean: the cursor tilts the playfield (parallax); the pixel look stands it at an angle, and sways it in a kiai
    const tiltX = (sway) => `${P ? -16 : 0} + state.cy * ${P ? -0.16 : -0.07}${sway ? ` + ${P ? 3 : 1.2} * math.sin(t * ${r4(90 / beat)})` : ''}`;
    const tiltY = (sway) => `${P ? 10 : 0} + state.cx * ${P ? 0.16 : 0.06}${sway ? ` + ${P ? 4 : 1.5} * math.cos(t * ${r4(45 / beat)})` : ''}`;
    const tiltClips = [];
    tt = 0;
    for (const [a, b] of kiai) { if (a > tt) tiltClips.push(span(tt, a, { rotationX: at(tiltX(false)), rotationY: at(tiltY(false)) })); tiltClips.push(span(a, b, { rotationX: at(tiltX(true)), rotationY: at(tiltY(true)) })); tt = b; }
    if (tt < dur) tiltClips.push(span(tt, dur, { rotationX: at(tiltX(false)), rotationY: at(tiltY(false)) }));
    // the glow behind the field, on each beat of a kiai section
    const glowClips = kiai.map(([a, b]) => { const keys = []; for (let bt = 0; a + bt < b - 1e-6; bt += beat) keys.push({ t: r4(bt), v: P ? 0.55 : 0.45, ease: 'quad-out' }, { t: r4(bt + beat * 0.8), v: 0 }); return span(a, b, { opacity: keys, scaleX: at(P ? 1 : 1.0), scaleY: at(1) }); });
    // HUD numbers: a frame a digit (10: blank)
    const dg = (src, place) => `math.mod(math.floor(${src} / ${place}), 10)`;
    const scoreTracks = Array.from({ length: 8 }, (_, k) => ({ target: `score${k}`, clips: [span(0, dur, { frame: at(dg('state.score', 10 ** (7 - k))) })] }));
    const accSrc = 'math.floor(state.acc * 100 + 0.5)';
    const accTracks = [
      { target: 'acc0', clips: [span(0, dur, { frame: at(`10 - 9 * math.floor(${accSrc} / 10000)`) })] },
      { target: 'acc1', clips: [span(0, dur, { frame: at(dg(accSrc, 1000)) })] }, { target: 'acc2', clips: [span(0, dur, { frame: at(dg(accSrc, 100)) })] },
      { target: 'acc3', clips: [span(0, dur, { frame: at(dg(accSrc, 10)) })] }, { target: 'acc4', clips: [span(0, dur, { frame: at(dg(accSrc, 1)) })] }];
    // the combo: right-aligned digits (blank above its size), the group moved left by the blanks; it pops on each combo
    const ndig = '(1 + math.min(1, math.floor(state.combo / 10)) + math.min(1, math.floor(state.combo / 100)) + math.min(1, math.floor(state.combo / 1000)))';
    const comboTracks = [0, 1, 2, 3].map((k) => { const place = 10 ** (3 - k); return { target: `combo${k}`, clips: [span(0, dur, { frame: at(k === 3 ? dg('state.combo', 1) : `10 - (10 - ${dg('state.combo', place)}) * math.min(1, math.floor(state.combo / ${place}))`) })] }; });
    const comboShift = `0 - (4 - ${ndig}) * ${r4(L.comboDigitW)}`;
    comboTracks.push({ target: 'combo', clips: [
      span(0, 0.18, { x: at(comboShift), scaleX: [{ t: 0, v: 1.35, ease: 'quad-out' }, { t: 0.18, v: 1 }], scaleY: [{ t: 0, v: 1.35, ease: 'quad-out' }, { t: 0.18, v: 1 }] }, { trigger: 'combo' }),
      span(0, dur, { x: at(comboShift) })] });
    const tracks = [
      { target: 'osu_shake', clips: [span(0, 0.35, { x: at('2.6 * math.sin(t * 3100) * (1 - t / 0.35)'), y: at('1.6 * math.cos(t * 2300) * (1 - t / 0.35)'), rotation: at('1.4 * math.sin(t * 1900) * (1 - t / 0.35)') }, { trigger: 'miss' }), span(0, dur, {})] },
      { target: 'osu_tilt', clips: tiltClips },
      { target: 'osu_pulse', clips: pulseClips },
      { target: 'cursor', clips: [span(0, lastEnd + 0.3, { x: at('state.cx'), y: at('state.cy'), scaleX: at('1 + 0.25 * state.hold'), scaleY: at('1 + 0.25 * state.hold'), ...(P ? { rotation: at('t * 90') } : {}) })] },
      { target: 'kiaiglow', clips: glowClips },
      ...scoreTracks, ...accTracks, ...comboTracks,
      { target: 'progress', clips: [span(0, dur, { fill: [{ t: 0, v: 0 }, { t: r4(firstT), v: 0 }, { t: r4(lastEnd), v: 1 }] })] },
      { target: 'rank', clips: [span(lastEnd + 0.4, dur, { frame: at('6 - state.rank'), scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.45, v: 1 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.45, v: 1 }], rotation: [{ t: 0, v: -25, ease: 'back-out' }, { t: 0.45, v: 0 }] })] },
      ...(L.breaks.length ? [{ target: 'section', clips: L.breaks.map(([a, b]) => span(a / 1000 + 1.2, Math.min(b / 1000 - 1.2, a / 1000 + 4.2), { frame: at('math.clamp(math.floor((50 - state.hp) / 50) + 1, 0, 1)'),
        scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.3, v: 1 }, { t: 2.6, v: 1, ease: 'quad-in' }, { t: 3.0, v: 0 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.3, v: 1 }, { t: 2.6, v: 1, ease: 'quad-in' }, { t: 3.0, v: 0 }] })) }] : []),
      { id: 'osu-music', kind: 'audio', name: '音楽', target: '', clips: [{ id: 'osu-music-clip', start: 0, end: dur, sound: L.music }] },
    ];
    const md = map.metadata || {};
    const seq = { id: 'osu', name: `${md.Title || 'osu!'}${md.Version ? ` [${md.Version}]` : ''}`, duration: dur, fps: 60, loop: 'hold', tempo: [{ t: r4((map.timing.find((p) => p.uninherited) || { time: 0 }).time / 1000), bpm: L.bpm, meter: 4 }],
      paths, templates, instances, markers: [{ id: 'end', t: r4(lastEnd + 0.5), name: 'おわり', event: 'done' }], tracks, game: G };
    return { version: 1, sequences: [seq] };
  }

  // ---------------------------------------------------------------------------------------------------------------- the design
  /** the playfield's frame of bones: the shake, the lean, the pulse — each a bone of its own (one track a bone), the pulse's
   *  children the playfield's elements */
  const FIELD = (C) => [{ name: 'osu_shake', parent: 'osu_root', pivot: [C[0], C[1], 0] }, { name: 'osu_tilt', parent: 'osu_shake', pivot: [C[0], C[1], 0] }, { name: 'osu_pulse', parent: 'osu_tilt', pivot: [C[0], C[1], 0] }];

  /** a beatmap (parsed: osu.parseOsu) → the whole game. opts: { skin: 'pixel' | 'skin', images ({ name: image } of an osu! skin:
   *  the Legacy skin's @2x names without '@2x', for 'skin'), ns, title, description, width (the playfield's, model units: 176),
   *  centre ([0, 130]), music (its sound id), sound(name) → a sound id for an osu! sample or null, ppu (the skin's pixels a unit:
   *  6) } */
  function build(map, opts = {}) {
    const O = T.osu, skin = opts.skin === 'skin' ? 'skin' : 'pixel', P = skin === 'pixel', ns = opts.ns || 'geoui', FW = num(opts.width, 176), C = opts.centre || [0, 130];
    const warnings = [], diff = O.difficultyOf(map), G = O.gameOf(map, { width: FW, sound: opts.sound || ((x) => x) }), R = G.r;
    const colours = (map.colours.combos.length ? map.colours.combos : [[255, 192, 0], [0, 202, 0], [18, 124, 255], [242, 24, 57]]).slice(0, 8);
    const cs = O.combos(map), bpm = r4(60000 / ((map.timing.find((p) => p.uninherited) || { beatLength: 500 }).beatLength));
    const lastEnd = Math.max(...G.objects.map((g) => (g.k === 's' ? g.t + g.d : g.k === 'p' ? g.e : g.t)));
    const duration = r4(Math.max(lastEnd / 1000 + 4, num(opts.duration, 0)));
    // ---- the sprites and their sizes (model units)
    const items = [], size = {};
    let bodyInfo;
    const HALFW = 151.7, TOP = 220.4, BOTTOM = 49.7;   // (the screen at 16:9 by bds-lab's measure: GeoUI's measured calibration)
    if (P) {
      const S = pixelSprites(colours), pu = (2 * R) / 16;   // (a hit circle 16 px across)
      Object.assign(size, { pu });
      for (const [id, im, sh] of [['hitcircle', S.hitcircle, 1], ['approachcircle', S.approachcircle, 1], ['hitburst', S.hitburst, 1], ['sliderball', S.sliderball, 1], ['followcircle', S.followcircle, 1],
        ['reversearrow', S.reversearrow, 1], ['slidertick', S.slidertick, 1], ['followpoint', S.followpoint, 1], ['spinner', S.spinner, 1], ['spinnerapproach', S.spinnerapproach, 1], ['cursor', S.cursor, 1],
        ['judgement', S.judgement, 1], ['digit', S.digit, 1], ['digitframes', [...S.digit, img(3, 5)], 1], ['spin', S.spin, 1], ['clear', S.clear, 1], ['rank', S.rank, 1], ['section', S.section, 1],
        ['x', S.x, 1], ['dot', S.dot, 1], ['pct', S.pct, 1], ['barback', S.barback, 1], ['barfill', S.barfill, 1], ['board', S.board, 0], ['glow', S.glow, 0]]) items.push({ id, image: im, shade: Boolean(sh) });
      bodyInfo = bodies(G, colours, cs.map((c) => c.colour), { ppu: 1 / pu, pixel: true });
    } else {
      const I = opts.images || {}, need = (n) => { if (!I[n]) throw new Error(`osu! のスキンに「${n}」がありません`); return I[n]; };
      const ppu = num(opts.ppu, 6), k = R / 128;   // (an @2x pixel of the skin in model units: hitcircle@2x is 256 px across a circle)
      const px = (im, f = k) => [im.width * f, im.height * f], sc = (im, f = k) => resize(im, im.width * f * ppu, im.height * f * ppu);
      // hit circles: the circle tinted by each combo colour, its overlay over it — one frame a colour; the approach circle likewise
      const cell = Math.round(2 * R * ppu);
      const hc = need('hitcircle'), ov = need('hitcircleoverlay'), ap = need('approachcircle');
      items.push({ id: 'hitcircle', image: colours.map((c) => { const o = img(256, 256); blit(o, centred(hc, 256, 256), 0, 0, c); blit(o, centred(ov, 256, 256), 0, 0); return resize(o, cell, cell); }) });
      items.push({ id: 'approachcircle', image: colours.map((c) => { const o = img(256, 256); blit(o, centred(ap, 256, 256), 0, 0, c); return resize(o, cell, cell); }) });
      size.circle = [2 * R, 2 * R];
      // numbers (default-0…9), judgements (one cell each, the largest), slider balls (10 frames), the rest one picture each
      const digits = Array.from({ length: 10 }, (_, d) => need(`default-${d}`)), dh = Math.max(...digits.map((m) => m.height));
      items.push(...digits.map((m, d) => ({ id: `default-${d}`, image: sc(m) })));
      size.digits = digits.map((m) => px(m)); size.digitH = dh * k;
      const judg = ['hit300', 'hit100', 'hit50', 'hit0'].map(need), jw = Math.max(...judg.map((m) => m.width)), jh = Math.max(...judg.map((m) => m.height));
      items.push({ id: 'judgement', image: judg.map((m) => sc(centred(m, jw, jh), k * 0.8)) }); size.judgement = [jw * k * 0.8, jh * k * 0.8];
      const balls = Array.from({ length: 10 }, (_, d) => need(`sliderb${d}`));
      items.push({ id: 'sliderball', image: balls.map((m) => sc(m)) }); size.sliderball = px(balls[0]);
      for (const [id, name, f] of [['followcircle', 'sliderfollowcircle', k], ['reversearrow', 'reversearrow', k], ['slidertick', 'sliderscorepoint', k], ['followpoint', 'followpoint', k * 0.8], ['cursor', 'cursor', k * 0.9]]) { const m = need(name); items.push({ id, image: sc(m, f) }); size[id] = px(m, f); }
      // the spinner: the field's height across
      const sp = need('spinner-circle'), f = (132 * 0.92) / sp.width, ppuSp = Math.min(ppu, 512 / (sp.width * f));
      const scS = (m) => resize(m, m.width * f * ppuSp, m.height * f * ppuSp);
      items.push({ id: 'spinner', image: scS(sp) }); size.spinner = px(sp, f);
      const spa = need('spinner-approachcircle'); items.push({ id: 'spinnerapproach', image: scS(resize(spa, sp.width, sp.width * (spa.height / spa.width))) }); size.spinnerapproach = [sp.width * f, sp.width * f];
      for (const [id, name] of [['spinnerclear', 'spinner-clear'], ['spinnerspin', 'spinner-spin'], ['spinnerrpmbg', 'spinner-rpm']]) { const m = need(name); items.push({ id, image: sc(m, f * 0.75) }); size[id] = px(m, f * 0.75); }
      // HUD: score digits (and blank), %, x, the health bar, the rank letters, section pass / fail, the glow, the backing
      const sd = Array.from({ length: 10 }, (_, d) => need(`score-${d}`)), sw = Math.max(...sd.map((m) => m.width)), sh = Math.max(...sd.map((m) => m.height)), hud = 9 / sh;
      items.push({ id: 'scoredigits', image: [...sd.map((m) => sc(centred(m, sw, sh), hud)), sc(img(sw, sh), hud)] }); size.score = [sw * hud, sh * hud];
      for (const [id, name, ff] of [['x', 'score-x', hud], ['pct', 'score-percent', hud], ['dot', 'score-dot', hud], ['barback', 'scorebar-bg', 0.09], ['barfill', 'scorebar-colour', 0.09]]) { const m = need(name); items.push({ id, image: sc(m, ff) }); size[id] = px(m, ff); }
      // (the glow: soft, a small picture stretched)
      items.push({ id: 'glow', image: resize(need('lighting'), 128, 128) });
      const ranks = ['ranking-X-small', 'ranking-S-small', 'ranking-A-small', 'ranking-B-small', 'ranking-C-small', 'ranking-D-small'].map(need), rw = Math.max(...ranks.map((m) => m.width)), rh = Math.max(...ranks.map((m) => m.height)), rf = 36 / rh;
      items.push({ id: 'rank', image: ranks.map((m) => resize(centred(m, rw, rh), rw * rf * 3, rh * rf * 3)) }); size.rank = [rw * rf, rh * rf];
      const sec = ['section-pass', 'section-fail'].map(need), sw2 = Math.max(...sec.map((m) => m.width)), sh2 = Math.max(...sec.map((m) => m.height)), sf = 46 / sh2;
      items.push({ id: 'section', image: sec.map((m) => sc(centred(m, sw2, sh2), sf)) }); size.section = [sw2 * sf, sh2 * sf];
      const back = (() => { const o = img(64, 48); for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) { const e = Math.min(x, y, 63 - x, 47 - y); put(o, x, y, [0, 0, 0, Math.round(Math.min(1, e / 3) * 180)]); } return o; })();
      items.push({ id: 'board', image: back });
      Object.assign(size, { ppu, k });
      bodyInfo = bodies(G, colours, cs.map((c) => c.colour), { ppu: Math.min(ppu, num(opts.bodyPpu, 2.2)), pixel: false });
    }
    items.push({ id: 'bodies', image: bodyInfo.cells.length ? bodyInfo.cells : [img(1, 1)] });
    // (2048 at most: the size every device takes — a body's cells shrink first when they do not fit)
    const A = atlasOf(items, { maxSize: num(opts.maxAtlas, 2048) });
    // ---- the bones (GeoUI's design): the field, the playfield's elements under its pulse, the HUD under the root
    // (osu_root: everything, shown only while a sequence plays — GeoUI's visible condition on it; the HUD's bones under it too)
    const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, { name: 'osu_root', parent: 'geo_ui', pivot: [0, 140, 0] }, ...FIELD(C)], F = 'osu_pulse', H = 'osu_root';
    const elements = { osu_root: { type: 'image', visible: `v.${ns}_seq > 0` } };
    const cellOf = (id, frame = 0) => { const a = A.at[id]; return [a.x + (frame % a.cols) * a.cell[0], a.y + Math.floor(frame / a.cols) * a.cell[1]]; };
    const framesOf = (id) => { const a = A.at[id]; return { cols: a.cols, rows: a.rows, step: a.cell }; };
    const imageEl = (name, frames, blend = P ? 'cutout' : 'blend') => { elements[name] = Object.assign({ type: 'image', blend }, frames ? { frames } : {}); };
    const vox = (name, id, parent, at, z, d, o = {}) => {
      const fr = A.at[id].frames, ims = items.find((x) => x.id === id).image;
      bones.push(voxel(name, parent, at, Array.isArray(ims) ? ims : [ims], cellOf(id), o.px || size.pu, d, z, { perPixel: Boolean(o.perPixel) }));
      imageEl(name, fr > 1 && !o.noFrames ? framesOf(id) : null);
    };
    const flat = (name, id, parent, at, z, sz, o = {}) => {
      const a = A.at[id];
      bones.push(plane(name, parent, at, sz, [a.x, a.y, a.w, a.h], z));
      imageEl(name, a.frames > 1 ? framesOf(id) : null, o.blend);
    };
    // z: the nearer the more negative (GeoUI's layers): the board behind all, then follow points, bodies, ticks, the spinner,
    // circles, numbers, approach circles, the ball and its follow circle, judgements, the cursor in front
    const bodyFrames = framesOf('bodies');
    const bodyFrame = {}, bodyCentre = {};
    G.objects.forEach((g, i) => { if (g.k === 's') { const n = Object.keys(bodyFrame).length; bodyFrame[i] = n; bodyCentre[i] = bodyInfo.centre[n]; } });
    const hudDigits = (prefix, n, [x0, y0], dw, z, idDigits, anchor, o = {}) => {
      bones.push({ name: prefix, parent: H, pivot: [r4(x0), r4(y0), 0] });
      if (anchor) elements[prefix] = { type: 'image', anchor };
      for (let k = 0; k < n; k++) {
        const at = [x0 + (k - (n - 1)) * dw, y0];   // (right-aligned: the last digit at x0)
        if (P) { vox(`${prefix}${k}`, 'digitframes', prefix, at, z, 0.9, { px: o.px, perPixel: true }); elements[`${prefix}${k}`].frames = framesOf('digitframes'); }
        else { flat(`${prefix}${k}`, 'scoredigits', prefix, at, z - k * 0.021, o.size || size.score); }   // (overlapping a little: each its own depth)
      }
    };
    if (P) {
      const pu = size.pu, D = 2.2;   // (a sprite's depth: about one and a half pixels)
      bones.push(plane('board', F, C, [FW + 14, FW * 0.75 + 14], [A.at.board.x, A.at.board.y, A.at.board.w, A.at.board.h], 10)); imageEl('board', null, 'blend');
      // the board's frame: four bars of cubes around the field, deep (its sides show as the field leans)
      const fw = FW + 16, fh = FW * 0.75 + 16, bar = (n, cx, cy, w, h) => bones.push({ name: n, parent: F, pivot: [r4(cx), r4(cy), 8], cubes: [{ origin: [r4(cx - w / 2), r4(cy - h / 2), 6], size: [r4(w), r4(h), 5], faces: Object.fromEntries(['north', 'east', 'west', 'up', 'down'].map((f, j) => [f, { uv: [A.at.barback.x + (j ? A.at.barback.w : 0), A.at.barback.y + 1], uv_size: [A.at.barback.w, 1], texture: 'atlas' }])) }] });
      // (the top and bottom bars the whole width, the sides between them: no two faces on one plane at the corners)
      bar('board_top', C[0], C[1] + fh / 2, fw + 3, 3); bar('board_bottom', C[0], C[1] - fh / 2, fw + 3, 3); bar('board_left', C[0] - fw / 2, C[1], 3, fh - 3); bar('board_right', C[0] + fw / 2, C[1], 3, fh - 3);
      bones.push(plane('kiaiglow', F, C, [FW * 1.1, FW * 0.85], [A.at.glow.x, A.at.glow.y, A.at.glow.w, A.at.glow.h], 9)); imageEl('kiaiglow', null, 'add');
      vox('followpoint', 'followpoint', F, C, 4, 0.8, { px: pu * 0.9 });
      bones.push(plane('sliderbody', F, C, bodyInfo.units, [A.at.bodies.x, A.at.bodies.y, A.at.bodies.w, A.at.bodies.h], 3)); elements.sliderbody = { type: 'image', blend: 'cutout', frames: bodyFrames };
      vox('slidertick', 'slidertick', F, C, 2, 0.8, { px: pu });
      vox('spinner', 'spinner', F, C, 1.5, 2.5, { px: (FW * 0.75 * 0.9) / 32 });
      vox('spinnerapproach', 'spinnerapproach', F, C, 0.5, 1, { px: (FW * 0.75 * 0.9) / 32 });
      // (each a depth of its own, front to back without two overlapping: a voxel's sides then share no plane with another's)
      vox('spinnerspin', 'spin', F, [C[0], C[1] - 34], -14.6, 1.5, { px: pu * 1.3 });
      vox('spinnerclear', 'clear', F, [C[0], C[1] + 30], -16.4, 1.5, { px: pu * 1.6 });
      [0, 1, 2].forEach((k) => { vox(`spinnerrpm${k}`, 'digitframes', F, [C[0] + (k - 1) * pu * 4.2, C[1] - 48], -18, 1, { px: pu * 1.05, perPixel: true }); elements[`spinnerrpm${k}`].frames = framesOf('digitframes'); });
      vox('hitcircle', 'hitcircle', F, C, -3, D);
      bones.push({ name: 'combonumber', parent: F, pivot: [C[0], C[1], -4.6] });
      // (the numerals: flat — a decal on the circle's face — each 0.021 nearer than the one before: only one shows at a time, and
      //  no two faces share a plane)
      const digitBone = (k, d) => { const a = cellOf('digit', d), im = items.find((x) => x.id === 'digit').image[d]; return plane(`combonumber_d${k}_${d}`, 'combonumber', [C[0] + (k - 0.5) * pu * 4 * 0.95, C[1]], [im.width * pu * 0.95, im.height * pu * 0.95], [a[0], a[1], im.width, im.height], -4.6 - d * 0.021); };
      const digits = [0, 1].map((k) => Array.from({ length: 10 }, (_, d) => { const b = digitBone(k, d); bones.push(b); return b.name; }));
      elements.combonumber = { type: 'number', number: { source: '0', digits, hideLeadingZero: true } };
      vox('followcircle', 'followcircle', F, C, -4.4, 0.8, { px: (2.4 * 2 * R) / 28 });
      vox('approachcircle', 'approachcircle', F, C, -6, 1.0);
      vox('reversearrow', 'reversearrow', F, C, -7.4, 1.2, { px: pu * 1.2 });
      vox('sliderball', 'sliderball', F, C, -9.8, 2, { px: (1.6 * R) / 8 });
      vox('hitburst', 'hitburst', F, C, -11.4, 1.4);
      vox('judgement', 'judgement', F, C, -13, 1.4, { px: pu * 0.85, perPixel: true });
      vox('cursor', 'cursor', F, C, -20, 1.6, { px: pu * 0.9 });
      // HUD (score top right, accuracy under it, the combo bottom left, health top left, progress, rank, section)
      const spx = 1.9, sdw = spx * 4;
      hudDigits('score', 8, [HALFW - 6, TOP - 9], sdw, -2, 'digitframes', 'top-right', { px: spx });
      const apx = 1.2, adw = apx * 4, ay = TOP - 22;
      hudDigits('acc', 5, [HALFW - 6 - adw * 2.2, ay], adw, -2, 'digitframes', 'top-right', { px: apx });
      // (the accuracy reads 99.87%: its point after the third digit — the digits are at fixed places, the point and % beside)
      const accBones = bones.filter((b) => /^acc[0-4]$/.test(b.name));
      accBones.forEach((b) => { const k = +b.name.slice(3); const dx = k >= 3 ? adw * 0.9 : 0; for (const c of b.cubes) c.origin[0] = r4(c.origin[0] + dx); b.pivot[0] = r4(b.pivot[0] + dx); });
      vox('accdot', 'dot', 'acc', [HALFW - 6 - adw * 2.2 - adw * 1.05, ay], -2, 0.9, { px: apx });
      vox('accpct', 'pct', 'acc', [HALFW - 6 - adw * 2.2 + adw * 1.9, ay], -2, 0.9, { px: apx });
      const cpx = 2.6, cdw = cpx * 4, cy0 = BOTTOM + 11;
      bones.push({ name: 'combo', parent: H, pivot: [r4(-HALFW + 8), cy0, 0] }); elements.combo = { type: 'image', anchor: 'bottom-left' };
      for (let k = 0; k < 4; k++) { vox(`combo${k}`, 'digitframes', 'combo', [-HALFW + 8 + k * cdw, cy0], -2, 1.4, { px: cpx, perPixel: true }); elements[`combo${k}`].frames = framesOf('digitframes'); }
      vox('combox', 'x', 'combo', [-HALFW + 8 + 4 * cdw - cdw * 0.15, cy0 - cpx], -2, 1.4, { px: cpx });
      vox('healthback', 'barback', H, [-HALFW + 6 + 63, TOP - 7], -1, 1.5, { px: 3 }); elements.healthback.anchor = 'top-left';
      vox('health', 'barfill', H, [-HALFW + 6 + 63, TOP - 7], -2.6, 1.5, { px: 3 });
      Object.assign(bones.find((b) => b.name === 'health'), { pivot: [r4(-HALFW + 6 + 3), TOP - 7, -2.6] });
      elements.health = { type: 'gauge', anchor: 'top-left', blend: 'cutout', gauge: { source: `q.property('${ns}:v3')`, max: 100, fill: 'left' } };
      vox('progressback', 'barback', H, [HALFW - 6 - 25.2, TOP - 30], -1, 0.8, { px: 1.2 }); elements.progressback.anchor = 'top-right';
      vox('progress', 'barfill', H, [HALFW - 6 - 25.2, TOP - 30], -2, 0.8, { px: 1.2 });
      Object.assign(bones.find((b) => b.name === 'progress'), { pivot: [r4(HALFW - 6 - 49.2), TOP - 30, -2] });
      elements.progress = { type: 'gauge', anchor: 'top-right', blend: 'cutout', gauge: { source: '0', max: 1, fill: 'left' } };
      vox('rank', 'rank', H, [0, C[1]], -24, 3, { px: 5, perPixel: true });
      vox('section', 'section', H, [0, C[1]], -28, 2, { px: 3.2, perPixel: true });
    } else {
      flat('board', 'board', F, C, 12, [FW + 16, FW * 0.75 + 16]);
      flat('kiaiglow', 'glow', F, C, 11, [FW * 1.15, FW * 0.9], { blend: 'add' });
      flat('followpoint', 'followpoint', F, C, 6, size.followpoint);
      bones.push(plane('sliderbody', F, C, bodyInfo.units, [A.at.bodies.x, A.at.bodies.y, A.at.bodies.w, A.at.bodies.h], 5)); elements.sliderbody = { type: 'image', blend: 'blend', frames: bodyFrames };
      flat('slidertick', 'slidertick', F, C, 4, size.slidertick);
      flat('spinnerapproach', 'spinnerapproach', F, C, 3.5, size.spinnerapproach);
      flat('spinner', 'spinner', F, C, 3, size.spinner);
      flat('spinnerspin', 'spinnerspin', F, [C[0], C[1] - 36], -10.25, size.spinnerspin);
      flat('spinnerclear', 'spinnerclear', F, [C[0], C[1] + 30], -10.5, size.spinnerclear);
      flat('spinnerrpmbg', 'spinnerrpmbg', F, [C[0] + 8, C[1] - 54], -9.8, size.spinnerrpmbg);
      [0, 1, 2].forEach((j) => flat(`spinnerrpm${j}`, 'scoredigits', F, [C[0] + 14 + j * size.score[0] * 0.62, C[1] - 54], -10, [size.score[0] * 0.62, size.score[1] * 0.62]));
      // (the rpm's backing shows only while a spinner does: it rides on the template with the digits)
      flat('hitcircle', 'hitcircle', F, C, -3, size.circle);
      bones.push({ name: 'combonumber', parent: F, pivot: [C[0], C[1], -6] });
      const dws = size.digits.map((d) => d[0]), gap = Math.max(...dws) * 0.78;
      const digits = [0, 1].map((kk) => Array.from({ length: 10 }, (_, d) => { const a = A.at[`default-${d}`], b = plane(`combonumber_d${kk}_${d}`, 'combonumber', [C[0] + (kk - 0.5) * gap, C[1]], size.digits[d], [a.x, a.y, a.w, a.h], -6.1 - (kk * 10 + d) * 0.021); bones.push(b); return b.name; }));
      elements.combonumber = { type: 'number', number: { source: '0', digits, hideLeadingZero: true } };
      flat('approachcircle', 'approachcircle', F, C, -7.0, size.circle);
      flat('reversearrow', 'reversearrow', F, C, -8, size.reversearrow);
      flat('followcircle', 'followcircle', F, C, -8.5, size.followcircle);
      flat('sliderball', 'sliderball', F, C, -9, size.sliderball);
      flat('judgement', 'judgement', F, C, -11, size.judgement);
      flat('cursor', 'cursor', F, C, -13, size.cursor);
      // HUD
      const sw = size.score[0] * 0.95;
      hudDigits('score', 8, [HALFW - 4 - size.score[0] / 2, TOP - 7], sw, -2, 'scoredigits', 'top-right');
      const as = 0.62, aw = sw * as, ay = TOP - 18;
      hudDigits('acc', 5, [HALFW - 4 - size.pct[0] * as - aw * 0.5, ay], aw, -2, 'scoredigits', 'top-right', { size: [size.score[0] * as, size.score[1] * as] });
      const accBones = bones.filter((b) => /^acc[0-4]$/.test(b.name));
      accBones.forEach((b) => { const kk = +b.name.slice(3); const dx = kk < 3 ? -size.dot[0] * as * 0.9 : 0; for (const c of b.cubes) c.origin[0] = r4(c.origin[0] + dx); b.pivot[0] = r4(b.pivot[0] + dx); });
      flat('accdot', 'dot', 'acc', [HALFW - 4 - size.pct[0] * as - aw * 2.0 - size.dot[0] * as * 0.45, ay], -2.2, [size.dot[0] * as, size.dot[1] * as]);
      flat('accpct', 'pct', 'acc', [HALFW - 4 - size.pct[0] * as / 2, ay], -2.25, [size.pct[0] * as, size.pct[1] * as]);
      const cs2 = 1.25, cw = size.score[0] * cs2 * 0.92, cy0 = BOTTOM + 9;
      bones.push({ name: 'combo', parent: H, pivot: [r4(-HALFW + 6), cy0, 0] }); elements.combo = { type: 'image', anchor: 'bottom-left' };
      for (let kk = 0; kk < 4; kk++) flat(`combo${kk}`, 'scoredigits', 'combo', [-HALFW + 6 + cw / 2 + kk * cw, cy0], -2 - kk * 0.021, [size.score[0] * cs2, size.score[1] * cs2]);
      flat('combox', 'x', 'combo', [-HALFW + 6 + cw * 4 + size.x[0] * cs2 * 0.4, cy0], -2.1, [size.x[0] * cs2, size.x[1] * cs2]);
      const hb = size.barback, hx = -HALFW + 4 + hb[0] / 2, hy = TOP - 2 - hb[1] / 2;
      flat('healthback', 'barback', H, [hx, hy], -1, hb); elements.healthback.anchor = 'top-left';
      const hf = size.barfill, fx = -HALFW + 4 + hb[0] * 0.018 + hf[0] / 2, fy = hy + hb[1] * 0.06;
      flat('health', 'barfill', H, [fx, fy], -2, hf);
      Object.assign(bones.find((b) => b.name === 'health'), { pivot: [r4(fx - hf[0] / 2), r4(fy), -2] });
      elements.health = { type: 'gauge', anchor: 'top-left', blend: 'blend', gauge: { source: `q.property('${ns}:v3')`, max: 100, fill: 'left' } };
      const pw = 36, ph = 1.6, ppx = HALFW - 4 - pw / 2, ppy = TOP - 27;
      bones.push(plane('progressback', H, [ppx, ppy], [pw, ph], [A.at.barback.x, A.at.barback.y + 2, A.at.barback.w, Math.max(1, A.at.barback.h - 4)], -1)); imageEl('progressback'); elements.progressback.anchor = 'top-right';
      bones.push(plane('progress', H, [ppx, ppy], [pw, ph * 0.7], [A.at.barfill.x, A.at.barfill.y, A.at.barfill.w, A.at.barfill.h], -2)); bones[bones.length - 1].pivot = [r4(ppx - pw / 2), r4(ppy), -2];
      elements.progress = { type: 'gauge', anchor: 'top-right', blend: 'blend', gauge: { source: '0', max: 1, fill: 'left' } };
      flat('rank', 'rank', H, [0, C[1]], -16, size.rank);
      flat('section', 'section', H, [0, C[1]], -17, size.section);
    }
    // ---- the timeline and the game
    const L = { pixel: P, C, bpm, colours: colours.length, kiai: G.kiai, breaks: G.breaks, duration, music: opts.music || 'music', bodyFrame, bodyCentre, width: FW, comboDigitW: P ? 2.6 * 4 : size.score[0] * 1.25 * 0.92 };
    const doc = docOf(map, G, L);
    const md = map.metadata || {};
    const design = { settings: Object.assign({ ns, name: opts.title || `${md.Title || 'osu!'} (${P ? 'pixel' : 'skin'})`, description: opts.description || 'GeoUI timeline: osu! (bds-lab)', bp: true }, opts.settings || {}),
      seed: opts.seed || `osu-${skin}`, bones, elements, textures: { atlas: { name: 'atlas', width: A.width, height: A.height, image: A.image } } };
    // (what the game needs: sounds the script plays — the hitsounds each object names and the gameplay's own)
    const sounds = [...new Set(G.objects.flatMap((g) => [...(g.hs || []), ...(g.es || []).flat()]).concat(Object.values(G.sounds).filter(Boolean)))];
    const info = { title: md.Title || '', artist: md.Artist || '', version: md.Version || '', bpm, duration, difficulty: diff, colours, counts: { circles: G.objects.filter((g) => g.k === 'c').length, sliders: G.objects.filter((g) => g.k === 's').length, spinners: G.objects.filter((g) => g.k === 'p').length,
      ticks: doc.sequences[0].instances.filter((x) => x.template === 'osu-tick').length, followpoints: doc.sequences[0].instances.filter((x) => x.template === 'osu-follow').length } };
    return { design, doc, game: G, info, sounds, atlas: A, warnings };
  }

  // (an osu! skin's files this uses: its @2x pictures by these names — a skin with only 1x pictures is read as they are, doubled —
  //  and the hitsounds; bds/geoui/osu/fetch-skin.mjs keeps the Legacy skin's, the plugin reads a .osk or fetches the Legacy skin)
  const SKIN_IMAGES = ['hitcircle', 'hitcircleoverlay', 'approachcircle', ...Array.from({ length: 10 }, (_, d) => `default-${d}`), 'hit0', 'hit50', 'hit100', 'hit300', ...Array.from({ length: 10 }, (_, d) => `sliderb${d}`),
    'sliderfollowcircle', 'reversearrow', 'sliderscorepoint', 'followpoint', 'spinner-circle', 'spinner-approachcircle', 'spinner-clear', 'spinner-spin', 'spinner-rpm', ...Array.from({ length: 10 }, (_, d) => `score-${d}`),
    'score-x', 'score-percent', 'score-dot', 'scorebar-bg', 'scorebar-colour', 'cursor', 'lighting', 'ranking-X-small', 'ranking-S-small', 'ranking-A-small', 'ranking-B-small', 'ranking-C-small', 'ranking-D-small', 'section-pass', 'section-fail'];
  const SKIN_SOUNDS = ['normal-hitnormal', 'normal-hitwhistle', 'normal-hitfinish', 'normal-hitclap', 'soft-hitnormal', 'soft-hitwhistle', 'soft-hitfinish', 'soft-hitclap', 'drum-hitnormal', 'drum-hitwhistle', 'drum-hitfinish', 'drum-hitclap', 'normal-slidertick', 'spinnerbonus', 'combobreak'];
  const LEGACY_SKIN = 'https://raw.githubusercontent.com/ppy/osu-resources/46d344264e5938e168cfbbd2c8fab5f572ebeda4/osu.Game.Resources/Skins/Legacy/';
  /** a skin's picture named n where its @2x is missing: the 1x one doubled (osukit reads @2x sizes) */
  const as2x = (im) => resize(im, im.width * 2, im.height * 2);

  T.osukit = { build, pixelSprites, textImage, voxel, plane, atlasOf, resize, img, FONT, SKIN_IMAGES, SKIN_SOUNDS, LEGACY_SKIN, as2x };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osukit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
