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
    H: ['101', '101', '111', '101', '101'], O: ['111', '101', '101', '101', '111'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
    Y: ['101', '101', '010', '010', '010'], G: ['011', '100', '101', '101', '011'], K: ['101', '101', '110', '101', '101'],
    M: ['10001', '11011', '10101', '10001', '10001'], W: ['10001', '10001', '10101', '11011', '10001'], ' ': ['0', '0', '0', '0', '0'],
    ':': ['000', '010', '000', '010', '000'], J: ['001', '001', '001', '101', '111'],
  };
  /** text in the font → an image (1 px a pixel, gap px between glyphs), colour c, a darker outline row below (depth on a flat face) */
  function textImage(s, c, { gap = 1 } = {}) {
    const glyphs = [...String(s)].map((ch) => FONT[ch] || FONT[ch.toUpperCase()] || ['000', '000', '000', '000', '000']), w = glyphs.reduce((n, g) => n + g[0].length, 0) + gap * (glyphs.length - 1);
    const im = img(w, 5);
    let x0 = 0;
    for (const g of glyphs) { g.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') put(im, x0 + x, y, y === 0 ? mix(c, [255, 255, 255], 0.35) : c); })); x0 += g[0].length + gap; }
    return im;
  }
  // a stroke font for the skin look's words that osu!'s skin has no picture for (FAILED, NEW RECORD!, the mods): each glyph lines
  // on a 4 × 6 grid (y down), drawn smooth — round-capped strokes (media.js rasterOps), an outline under a lit fill
  const STROKES = {
    A: [[[0, 6], [2, 0], [4, 6]], [[0.75, 4], [3.25, 4]]], B: [[[0, 3], [0, 0], [2.6, 0], [3.6, 0.8], [3.6, 2.2], [2.6, 3], [0, 3], [3, 3], [4, 3.9], [4, 5.1], [3, 6], [0, 6], [0, 3]]],
    C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]], D: [[[0, 0], [0, 6], [2.4, 6], [4, 4.4], [4, 1.6], [2.4, 0], [0, 0]]],
    E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]], F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
    G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.4], [2.4, 3.4]]], H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    I: [[[0, 0], [2, 0]], [[1, 0], [1, 6]], [[0, 6], [2, 6]]], J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]], K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.4, 2.6], [4, 6]]],
    L: [[[0, 0], [0, 6], [4, 6]]], M: [[[0, 6], [0, 0], [2, 3.4], [4, 0], [4, 6]]], N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
    O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]], P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.2], [3, 3.2], [0, 3.2]]],
    R: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.2], [3, 3.2], [0, 3.2]], [[2.2, 3.2], [4, 6]]], S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
    T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]], U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]], W: [[[0, 0], [0.9, 6], [2, 2.4], [3.1, 6], [4, 0]]],
    X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]], Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]], '!': [[[0, 0], [0, 4]], [[0, 6], [0, 6]]], ':': [[[0, 1.6], [0, 1.6]], [[0, 4.6], [0, 4.6]]],
  };
  /** text in the stroke font → an image: ppu pixels a grid unit, the fill weight units wide (lit from the top: lighter above,
   *  darker below), an outline edge units round it. → { image, cap } (cap: the glyphs' height over the image's) */
  function strokeText(s, { colour = [255, 255, 255], outline = [0, 0, 0], ppu = 8, weight = 1.15, edge = 0.5, gap = 2 } = {}) {
    const glyphs = [...String(s).toUpperCase()].map((ch) => (ch === ' ' ? null : STROKES[ch] || null)), widthOf = (g) => (g ? Math.max(...g.flat().map((p) => p[0])) : 1.6);
    const pad = weight / 2 + edge + 0.4, path = [];
    let x = pad;
    glyphs.forEach((g, i) => { if (g) for (const l of g) { path.push(['moveTo', (x + l[0][0]) * ppu, (pad + l[0][1]) * ppu]); for (const p of l.slice(1)) path.push(['lineTo', (x + p[0]) * ppu, (pad + p[1]) * ppu]); } x += widthOf(g) + (i < glyphs.length - 1 ? gap : 0); });
    const W = (x + pad) * ppu, Hh = (6 + 2 * pad) * ppu, rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
    const under = T.media.rasterOps([['strokeStyle', rgb(outline)], ['lineWidth', (weight + 2 * edge) * ppu], ['beginPath'], ...path, ['stroke']], W, Hh);
    const fill = T.media.rasterOps([['strokeStyle', rgb(colour)], ['lineWidth', weight * ppu], ['beginPath'], ...path, ['stroke']], W, Hh);
    const im = { width: under.width, height: under.height, data: under.data };
    for (let y = 0; y < fill.height; y++) { const f = 1.14 - 0.3 * (y / fill.height); for (let x2 = 0; x2 < fill.width; x2++) { const c = get(fill, x2, y); if (c[3]) put(im, x2, y, [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f)), c[3]]); } }
    return { image: im, cap: 6 / (6 + 2 * pad) };
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
    // the rank letters again, silver (HD or FL on: osu!'s silver SS and S)
    S.rank.push(textImage('SS', [220, 230, 245, 255]), textImage('S', [190, 205, 225, 255]));
    // the results: the board (a dark panel, a frame of bright cubes), its words, the full combo's and the new best's stamps
    S.resboard = (() => { const im = img(48, 39); for (let y = 0; y < 39; y++) for (let x = 0; x < 48; x++) { const e = Math.min(x, y, 47 - x, 38 - y), bar = y >= 1 && y <= 6; put(im, x, y, e === 0 ? [120, 140, 230, 255] : bar ? (y === 1 ? [70, 80, 150, 235] : [38, 44, 92, 235]) : y === 7 ? [120, 140, 230, 255] : e === 1 ? [30, 34, 70, 230] : (x + y) % 2 ? [14, 16, 32, 225] : [18, 20, 40, 225]); } return im; })();
    S.restitle = textImage('RESULTS', [255, 220, 120, 255]); S.maxcombo = textImage('MAX COMBO', [150, 200, 255, 255]); S.accuracy = textImage('ACCURACY', [150, 200, 255, 255]);
    S.fc = textImage('FULL COMBO', [255, 214, 64, 255]); S.record = textImage('NEW RECORD!', [120, 255, 140, 255]);
    S.failed = textImage('FAILED', [255, 70, 70, 255]); S.retry = textImage('JUMP: RETRY', [255, 200, 200, 255]);
    S.j300 = S.judgement[0]; S.j100 = S.judgement[1]; S.j50 = S.judgement[2]; S.jx = S.judgement[3];
    // the mods on (top right): osu!'s letters, each its own colour; AUTO when the game plays itself
    for (const [m, c] of [['HD', [255, 220, 90]], ['FL', [240, 240, 240]], ['NF', [110, 170, 255]], ['SD', [255, 130, 80]], ['PF', [255, 90, 160]], ['AUTO', [150, 255, 200]]]) S[`mod${m}`] = textImage(m, [...c, 255]);
    // the flashlight (build draws it the look's pixel a pixel: black but for a pixel circle round the cursor, dithered at its
    // edge — this one for a look of its own); the fail's shade: a dark curtain, see-through
    S.flashlight = (() => { const n = 64, im = img(n, n), c = n / 2; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d > 25 || (d > 23.4 && (x + y) % 2 === 0)) put(im, x, y, [0, 0, 0, 255]); } return im; })();
    S.shade = (() => { const im = img(8, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put(im, x, y, [12, 0, 4, 170]); return im; })();
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
  /** the rectangles of cubes a picture's pixels make: a cube a pixel (perPixel), or as few as the picture allows — runs of a row,
   *  each grown down while the rows below have the very same run (and the same edges beside it) → [[x0, y0, x1, y1]] */
  function rectsOf(on, w, h, perPixel) {
    const rects = [];
    if (perPixel) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) rects.push([x, y, x, y]); return rects; }
    const used = new Set();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!on(x, y) || used.has(`${x},${y}`)) continue;
      let x1 = x; while (x1 + 1 < w && on(x1 + 1, y) && !used.has(`${x1 + 1},${y}`)) x1++;
      let y1 = y; const rowOk = (yy) => { for (let k = x; k <= x1; k++) if (!on(k, yy) || used.has(`${k},${yy}`)) return false; return !on(x - 1, yy) === !on(x - 1, y) && !on(x1 + 1, yy) === !on(x1 + 1, y); };
      while (y1 + 1 < h && rowOk(y1 + 1)) y1++;
      for (let yy = y; yy <= y1; yy++) for (let k = x; k <= x1; k++) used.add(`${k},${yy}`);
      rects.push([x, y, x1, y1]);
    }
    return rects;
  }
  function voxel(name, parent, [cx, cy], images, cellAt, px, d, z, { perPixel = false } = {}) {
    const ims = Array.isArray(images) ? images : [images], w = Math.max(...ims.map((m) => m.width)), h = Math.max(...ims.map((m) => m.height));
    const on = (x, y) => ims.some((m) => get(m, x, y)[3] > 0), rects = rectsOf(on, w, h, perPixel);
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

  // ---------------------------------------------------------------------------------------------------------------- 3D models
  // The pixel look's models are built of cubes the way a block model is: layers of blocks, each a pixel picture made solid —
  // its own outline, its own depth, its own place in front of or behind the others (a coin: its plate, its body, its rim, its
  // dome; a ball: its slices; a gem; a wheel: its hub, rim and spokes; a word standing on its shadow). Every face keeps the
  // pixel art: the front the picture, the sides, the top and the bottom the same pixels in their own light (sides darker, the
  // top lit, the bottom darkest) — so the forms read as solid from every side the playfield's lean shows.
  const LIGHT = { side: 0.62, top: 0.84, bottom: 0.44 };
  const lit = (im, f) => { const o = img(im.width, im.height); for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) { const c = get(im, x, y); if (c[3]) put(o, x, y, shade(c, f)); } return o; };
  /** a model's layers into atlas cells: one cell a frame (the largest number of frames of its layers; a layer of one picture the
   *  same in each), each layer's picture and its three lights side by side in it → { cells, layers: [{ u, w, h, dx, dy, z, d,
   *  perPixel, on }] } (on(x, y): a pixel any frame of the layer has) */
  function modelCells(model) {
    const Ls = model.layers.map((L) => { const ims = [].concat(L.ims || L.im); return { ...L, ims, w: Math.max(...ims.map((m) => m.width)), h: Math.max(...ims.map((m) => m.height)) }; });
    const frames = Math.max(...Ls.map((L) => L.ims.length));
    let u = 0;
    for (const L of Ls) { L.u = u; u += 4 * L.w; }
    const H = Math.max(...Ls.map((L) => L.h)), cells = [];
    for (let f = 0; f < frames; f++) {
      const cell = img(u, H);
      for (const L of Ls) { const m = L.ims[Math.min(f, L.ims.length - 1)]; blit(cell, m, L.u, 0); blit(cell, lit(m, LIGHT.side), L.u + L.w, 0); blit(cell, lit(m, LIGHT.top), L.u + 2 * L.w, 0); blit(cell, lit(m, LIGHT.bottom), L.u + 3 * L.w, 0); }
      cells.push(cell);
    }
    return { cells, zs: model.zs || 1, layers: Ls.map((L) => ({ u: L.u, w: L.w, h: L.h, dx: L.dx || 0, dy: L.dy || 0, z: L.z || 0, d: L.d || 1, perPixel: Boolean(L.perPixel), on: (x, y) => L.ims.some((m) => get(m, x, y)[3] > 0) })) };
  }
  /** a model's bone: its layers' cubes, px model units a pixel across, zs × px a pixel deep; z: the model's front plane (a
   *  layer's z counts back from it, a negative one stands out in front), centred on (cx, cy) */
  function modelBone(name, parent, [cx, cy], cellAt, px, z, meta) {
    const [ux, uy] = cellAt, zp = px * meta.zs, cubes = [];
    for (const L of meta.layers) {
      const left = cx + L.dx * px - (L.w * px) / 2, top = cy + L.dy * px + (L.h * px) / 2, u0 = ux + L.u;
      for (const [x0, y0, x1, y1] of rectsOf(L.on, L.w, L.h, L.perPixel)) {
        const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
        cubes.push({ origin: [r4(left + x0 * px), r4(top - (y1 + 1) * px), r4(z + L.z * zp)], size: [r4(rw * px), r4(rh * px), r4(L.d * zp)], faces: {
          north: { uv: [u0 + x0, uy + y0], uv_size: [rw, rh], texture: 'atlas' },
          east: { uv: [u0 + L.w + x1, uy + y0], uv_size: [1, rh], texture: 'atlas' }, west: { uv: [u0 + L.w + x0, uy + y0], uv_size: [1, rh], texture: 'atlas' },
          up: { uv: [u0 + 2 * L.w + x0, uy + y0], uv_size: [rw, 1], texture: 'atlas' }, down: { uv: [u0 + 3 * L.w + x0, uy + y1], uv_size: [rw, 1], texture: 'atlas' },
        } });
      }
    }
    return { name, parent, pivot: [r4(cx), r4(cy), r4(z)], cubes };
  }
  /** every bone after the first moved as little as it takes (compile.freePlace: back 0.021 at a time, up, down or across 0.02)
   *  for no face of its cubes to lie on a plane with a face of an earlier bone's that looks the same way and overlaps it: models
   *  of many layers, all resting at the playfield's middle on one pixel grid, never share a plane (two faces on one plane flicker) */
  function settleDepths(bones) {
    const F = T.compile && T.compile.freePlace;
    if (!F) throw new Error('GeoUITimeline.compile が要ります（compile.js を先に読み込む）');
    const placed = [];
    for (const b of bones) {
      const cubes = b.cubes || [];
      if (!cubes.length) continue;
      const [dx, dy, dz] = F(placed, cubes, { kz: 0 });
      if (dx || dy || dz) for (const c of cubes) c.origin = [r4(c.origin[0] + dx), r4(c.origin[1] + dy), r4(c.origin[2] + dz)];
      placed.push(...cubes);
    }
    return bones;
  }
  /** a tray's frame of blocks round a w × h floor centred on c: four walls (3 thick, 5 deep from zw), a lip inside them on the
   *  floor (1.4 wide, 1.2 high, a hair from the walls), and four posts at the corners (6 × 6, standing 3 out of the walls) with
   *  a cap on each — their faces from a bar's picture `bar` (an atlas place of a shaded item: its top row lit, its second row,
   *  its darker copy for the sides). No two faces share a plane */
  function trayCubes(c, w, h, zw, bar, { out: o = 4 } = {}) {
    // (the floor is at zw + 4: walls `o` out of it — less for a panel under words — the lip 0.2, the posts 3 more)
    zw += 4 - o;
    const out = [], face = (row, side) => ({ uv: [bar.x + (side ? bar.w : 0), bar.y + row], uv_size: [bar.w, 1], texture: 'atlas' });
    const box = (cx, cy, bw, bh, z0, d, row) => out.push({ origin: [r4(cx - bw / 2), r4(cy - bh / 2), r4(z0)], size: [r4(bw), r4(bh), r4(d)], faces: { north: face(row, false), east: face(1, true), west: face(1, true), up: face(0, true), down: face(2, true) } });
    const [x0, y0] = c, hw = w / 2, hh = h / 2;
    // (the top and bottom walls the whole width, the sides between them)
    box(x0, y0 + hh, w + 3, 3, zw, o + 1, 1); box(x0, y0 - hh, w + 3, 3, zw, o + 1, 1); box(x0 - hw, y0, 3, h - 3, zw, o + 1, 1); box(x0 + hw, y0, 3, h - 3, zw, o + 1, 1);
    const li = 1.6 + 0.7 + 0.1, zl = zw + o - 0.2;   // (the lip's middle: inside the wall's inner face, a hair off it; its front)
    box(x0, y0 + hh - li, w - 2 * li - 1.4, 1.4, zl, 1.2, 0); box(x0, y0 - hh + li, w - 2 * li - 1.4, 1.4, zl, 1.2, 0);
    box(x0 - hw + li, y0, 1.4, h - 2 * li + 1.4, zl + 0.01, 1.2, 0); box(x0 + hw - li, y0, 1.4, h - 2 * li + 1.4, zl + 0.01, 1.2, 0);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { box(x0 + sx * hw, y0 + sy * hh, 6, 6, zw - 3, o + 4, 0); box(x0 + sx * hw, y0 + sy * hh, 4, 4, zw - 4, 1, 0); }
    return out;
  }
  /** the pixel look's models (modelCells' input): each object of the game modeled — a few layers of blocks, the pixel art on their
   *  faces. Layers: { im | ims (frames), dx, dy (px from the middle, up), z (px behind the front), d (px deep), perPixel }; zs: how
   *  deep a px is, against its width */
  function pixelModels(colours, S, pairs = null) {
    const M = {}, C4 = (c) => [...c, 255];
    const diamond = (n, col) => { const im = img(7, 7); for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (Math.abs(x - 3) + Math.abs(y - 3) <= n) put(im, x, y, col(x, y)); return im; };
    // (raised letters: the letters a pixel deep, and behind them their shadow half a pixel right and down — a block of letters)
    // (a block a pixel when the letters change with the frame — each frame's own outline then shows from the side; one picture's
    //  pixels in rows and columns of blocks: fewer faces)
    const text = (ims, o = {}) => { const a = [].concat(ims), pp = a.length > 1; return { layers: [{ ims: a, z: 0, d: o.d || 1, perPixel: pp }, { ims: a.map((m) => lit(m, 0.34)), dx: 0.5, dy: -0.5, z: o.d || 1, d: 0.7, perPixel: pp }] }; };
    // hit circle: a coin — its white rim and a dome standing out of its body (the combo colour lit from the top left), a dark
    // plate under it all, a little wider — and its combo number standing out of the dome on its shadow, a part of the coin: one
    // frame for each combo number and colour the map's circles show (pairs: [[n, colour], …]; none: a frame a colour, no number)
    const rim = discImage(16, (x, y, d) => (d > 6.0 && d <= 7.0 ? WHITE : null));
    // (the dome: the coin's colour a little darker at its edge, one lit pixel at its top left — the white number stands on it)
    const domes = colours.map((cc) => discImage(16, (x, y, d) => (d > 3.3 ? null : x === 6 && y === 6 ? mix(C4(cc), WHITE, 0.45) : d > 2.3 ? shade(C4(cc), 0.78) : shade(C4(cc), 0.9))));
    const bodies = colours.map((cc) => discImage(16, (x, y, d) => { if (d > 7.0) return null; const l = (8 - x - y) / 16; return l > 0.18 ? mix(C4(cc), WHITE, 0.3) : l < -0.3 ? shade(C4(cc), 0.75) : C4(cc); }));
    const plates = colours.map((cc) => discImage(16, (x, y, d) => (d <= 7.95 ? shade(C4(cc), 0.45) : null)));
    const frames = pairs || colours.map((cc, c) => [0, c]);
    // (a number in the middle of a picture as wide as the widest: 3 pixels a digit, 1 between)
    const nw = Math.max(3, ...frames.map(([n]) => 4 * String(n).length - 1));
    const number = (n) => { const o = img(nw, 5); if (n > 0) { const t = textImage(String(n), WHITE); blit(o, t, Math.floor((nw - t.width) / 2), 0); } return o; };
    const each = (fn) => frames.map(([n, c]) => fn(n, c));
    M.hitcircle = { layers: [
      { ims: each(() => rim), z: 0, d: 0.5 },
      { ims: each((n, c) => domes[c]), z: -0.5, d: 1.0 },
      { ims: each((n, c) => bodies[c]), z: 0.5, d: 1.2 },
      { ims: each((n, c) => plates[c]), z: 1.7, d: 0.9 },
      // (the number: white blocks a pixel deep on their dark shadow, half a pixel right and down)
      ...(pairs ? [{ ims: each((n) => number(n)), z: -1.5, d: 0.6, perPixel: true }, { ims: each((n) => lit(number(n), 0.3)), dx: 0.5, dy: -0.5, z: -0.9, d: 0.4 }] : []),
    ] };
    // approach circle: a hoop — a bright ring at its front, a wider darker one behind it
    M.approachcircle = { layers: [
      { ims: colours.map((cc) => discImage(16, (x, y, d) => (d > 7.05 && d <= 7.75 ? mix(C4(cc), WHITE, 0.45) : null))), z: 0, d: 0.5 },
      { ims: colours.map((cc) => discImage(16, (x, y, d) => (d > 6.6 && d <= 7.95 ? shade(C4(cc), 0.7) : null))), z: 0.5, d: 0.8 },
    ] };
    // the burst: eight chunks round the circle, every other one deeper (they fly out and turn)
    const chunks = (k0) => { const im = img(16, 16); for (let k = k0; k < 8; k += 2) { const a = (k * Math.PI) / 4, cx = 8 + Math.cos(a) * 6, cy = 8 + Math.sin(a) * 6; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) put(im, Math.floor(cx - 1 + x), Math.floor(cy - 1 + y), k % 4 ? [255, 236, 140, 255] : WHITE); } return im; };
    M.hitburst = { layers: [{ im: chunks(0), z: 0, d: 1.6 }, { im: chunks(1), z: 1.6, d: 1.6 }] };
    // the slider's ball: a sphere of eight slices (front to back), orange with a white band — it rolls
    M.sliderball = { zs: 0.6, layers: Array.from({ length: 8 }, (_, k) => {
      const zc = k - 3.5, r = Math.sqrt(Math.max(0, 16 - zc * zc)) + 0.15;
      return { im: discImage(8, (x, y, d) => { if (d > r) return null; const band = Math.abs(x - y) <= 0.5, l = 1.12 - k * 0.06 - (x + y) * 0.018; return [...(band ? [255, 248, 228] : [255, 166, 46]).map((v) => Math.min(255, Math.round(v * l))), 255]; }), z: k, d: 1 };
    }) };
    // the follow circle: a hoop; the reverse arrow and the follow points: raised on their shadow; a tick: a little gem
    M.followcircle = { layers: [{ im: discImage(28, (x, y, d) => (d > 12.9 && d <= 13.95 ? WHITE : null)), z: 0, d: 0.5 }, { im: discImage(28, (x, y, d) => (d > 11.9 && d <= 13.95 ? [255, 190, 80, 255] : null)), z: 0.5, d: 0.7 }] };
    M.reversearrow = text(S.reversearrow, { d: 1.2 });
    M.followpoint = text(S.followpoint, { d: 0.8 });
    M.slidertick = { layers: [{ im: (() => { const im = img(3, 3); put(im, 1, 1, WHITE); return im; })(), z: -0.7, d: 0.7 }, { im: discImage(3, (x, y, d) => (d < 1.6 ? [200, 220, 255, 255] : null)), z: 0, d: 0.9 }] };
    // the spinner: a wheel — its hub standing out, its rim, the blue ring and the spokes set back behind it
    const spokes = discImage(32, (x, y, d, c) => { const a = Math.atan2(y + 0.5 - c, x + 0.5 - c), on = Math.abs(((a / (Math.PI * 2)) * 6 + 6) % 1 - 0.5) > 0.42; return on && d > 2.5 && d <= 13.4 ? [140, 170, 255, 255] : null; });
    M.spinner = { zs: 0.35, layers: [
      { im: discImage(32, (x, y, d) => (d <= 2.5 ? (d < 1.2 ? WHITE : [210, 225, 255, 255]) : null)), z: -3, d: 3 },
      { im: discImage(32, (x, y, d) => (d > 14.6 && d <= 15.9 ? WHITE : null)), z: 0, d: 3 },
      { im: spokes, z: 1, d: 2 },
      { im: discImage(32, (x, y, d) => (d > 13.4 && d <= 14.6 ? [70, 110, 255, 255] : null)), z: 3, d: 2 },
    ] };
    M.spinnerapproach = { zs: 0.35, layers: [{ im: discImage(32, (x, y, d) => (d > 14.9 && d <= 15.9 ? [140, 220, 255, 255] : null)), z: 0, d: 1.5 }, { im: discImage(32, (x, y, d) => (d > 14.2 && d <= 15.9 ? [70, 130, 200, 255] : null)), z: 1.5, d: 1.5 }] };
    // the cursor: a gem (an octahedron of seven-pixel diamonds, its point toward the player)
    const gem = (x, y) => ((x + y) % 2 ? [255, 230, 120, 255] : WHITE);
    M.cursor = { layers: [
      { im: diamond(0, () => WHITE), z: -3, d: 1 }, { im: diamond(1, gem), z: -2, d: 1 }, { im: diamond(2, gem), z: -1, d: 1 }, { im: diamond(3, gem), z: 0, d: 1 },
      { im: diamond(2, (x, y) => shade(gem(x, y), 0.8)), z: 1, d: 1 }, { im: diamond(1, (x, y) => shade(gem(x, y), 0.65)), z: 2, d: 1 },
    ] };
    // words and numbers: raised letters on their shadow
    for (const id of ['judgement', 'spin', 'clear', 'rank', 'section', 'x', 'dot', 'pct', 'restitle', 'maxcombo', 'accuracy', 'fc', 'record', 'failed', 'retry', 'j300', 'j100', 'j50', 'jx']) M[id] = text(S[id]);
    M.digitframes = text([...S.digit, img(3, 5)]);
    // (a number's numerals, each its own block of letters: the results' counts)
    for (let d = 0; d < 10; d++) M[`num${d}`] = text(S.digit[d]);
    // the mods: a plate, its letters standing out of it
    for (const m of ['HD', 'FL', 'NF', 'SD', 'PF', 'AUTO']) { const pl = S[`mod${m}`], letters = img(pl.width, pl.height); for (let y = 2; y < pl.height - 2; y++) for (let x = 2; x < pl.width - 2; x++) { const c = get(pl, x, y); if (c[3] && (c[0] + c[1] + c[2]) > 200) put(letters, x, y, c); } M[`mod${m}`] = { layers: [{ im: letters, z: 0, d: 0.4 }, { im: pl, z: 0.4, d: 0.8 }] }; }
    return M;
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
    return { cells, centre, units: [cw / ppu, ch / ppu], ppu };
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
    // (HD — osu!'s Hidden, state.hd: no approach circles; a circle and its number gone again by 70 % of its approach — in by
    //  40 %, out over the next 30 % — a slider's body fading as its ball goes)
    const hdA = r4(lead * 0.4), hdB = r4(lead * 0.7), hdOut = `(1 - state.hd * math.clamp((t - ${hdA}) / ${r4(hdB - hdA)}, 0, 1))`;
    const popHd = (k) => [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.16, v: 1 }, { t: hdA, v: 1 }, { t: hdB, v: k }];
    const comeIn = P ? { scaleX: popHd('1 - state.hd'), scaleY: popHd('1 - state.hd') }
      : { opacity: at(`math.clamp(t / ${fade}, 0, 1) * (1 - state.hd) + state.hd * math.clamp(t / ${hdA}, 0, 1) * ${hdOut}`) };
    const shakeX = 'param.x + 2.4 * math.sin(t * 2880) * (1 - t / 0.25)', noHd = at('1 - state.hd');
    // (the circle's frame: its combo colour — in the pixel look its number too, the coin's own: the instance's cf, its pair's frame)
    const cf = at(L.coinFrame ? 'param.cf' : 'param.c');
    const circleLook = (hitName, endExpr) => [
      { target: 'hitcircle', clips: [
        { start: 0, end: 0.25, trigger: 'early', channels: { x: at(shakeX), y: at('param.y'), frame: cf, scaleX: noHd, scaleY: noHd } },
        P ? { start: 0, end: 0.12, trigger: hitName, channels: { ...place, frame: cf, scaleX: [{ t: 0, v: '1.25 * (1 - state.hd)', ease: 'quad-in' }, { t: 0.12, v: 0 }], scaleY: [{ t: 0, v: '1.25 * (1 - state.hd)', ease: 'quad-in' }, { t: 0.12, v: 0 }] } }
          : { start: 0, end: 0.24, trigger: hitName, channels: { ...place, frame: cf, scaleX: [{ t: 0, v: 1, ease: 'quad-out' }, { t: 0.24, v: 1.45 }], scaleY: [{ t: 0, v: 1, ease: 'quad-out' }, { t: 0.24, v: 1.45 }], opacity: [{ t: 0, v: '1 - state.hd', ease: 'quad-in' }, { t: 0.24, v: 0 }] } },
        { start: -lead, end: endExpr, until: 'hit', channels: { ...place, frame: cf, ...comeIn } }] },
      ...(P ? [] : [{ target: 'combonumber', clips: [
        { start: 0, end: 0.25, trigger: 'early', channels: { x: at(shakeX), y: at('param.y'), value: at('param.n'), scaleX: noHd, scaleY: noHd } },
        { start: -lead, end: endExpr, until: 'hit', channels: { ...place, value: at('param.n'), scaleX: at(hdOut), scaleY: at(hdOut) } }] }]),
      { target: 'approachcircle', clips: [{ start: -lead, end: 0, until: 'hit', channels: { ...place, frame: at('param.c'),
        scaleX: [{ t: 0, v: '4 * (1 - state.hd)' }, { t: lead, v: '1 - state.hd' }], scaleY: [{ t: 0, v: '4 * (1 - state.hd)' }, { t: lead, v: '1 - state.hd' }], ...(P ? {} : { opacity: [{ t: 0, v: 0 }, { t: Math.min(lead, fade * 2), v: 0.9 }] }) } }] },
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
      { id: 'osu-circle', name: 'osu! 円', lead, tail: r4(late + 0.7), params: ['x', 'y', 'n', 'c', ...(L.coinFrame ? ['cf'] : []), 'jx', 'jy'], judge: { kind: 'circle' }, tracks: [...circleLook('hit', late), judgement('j')] },
      { id: 'osu-slider', name: 'osu! スライダー', lead, tail: 0.7, params: ['x', 'y', 'n', 'c', ...(L.coinFrame ? ['cf'] : []), 'd', 'r', 'f', 'bx', 'by', 'ex', 'ey', 'ea', 'jx', 'jy'], judge: { kind: 'slider' }, tracks: [
        { target: 'sliderbody', clips: [{ start: -lead, end: 'param.d + 0.1', channels: { x: at('param.bx'), y: at('param.by'), frame: at('param.f'),
          ...(P ? { scaleX: [{ t: 0, v: 0.2, ease: 'back-out' }, { t: 0.2, v: 1 }, { t: lead, v: 1, ease: 'quad-in' }, { t: r4(lead + 0.18), v: '1 - state.hd' }], scaleY: [{ t: 0, v: 0.2, ease: 'back-out' }, { t: 0.2, v: 1 }, { t: lead, v: 1, ease: 'quad-in' }, { t: r4(lead + 0.18), v: '1 - state.hd' }] }
            : { opacity: at(`math.clamp(t / ${fade}, 0, 1) * 0.9 * (1 - state.hd * math.clamp((t - ${lead}) / math.max(0.05, param.d), 0, 1))`) }) } }] },
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
      // (the coin's frame of its number and colour: the pixel look's — L.coinFrame)
      const cfOf = () => (L.coinFrame ? { cf: L.coinFrame[`${Math.min(9999, c.n)}/${c.colour % L.colours}`] } : {});
      if (g.k === 'c') instances.push({ id, template: 'osu-circle', t, params: { x: g.x, y: g.y, n: c.n, c: c.colour % L.colours, ...cfOf(), jx: g.x, jy: g.y } });
      else if (g.k === 's') {
        const d = r4(g.d / 1000), line = g.line, end = line[line.length - 1], prev = line[Math.max(0, line.length - 2)], fin = g.r % 2 ? end : line[0], pid = `op${i + 1}`;
        paths.push({ id: pid, kind: 'linear', points: line.map((p) => [p[0], p[1]]), length: g.len });
        const ea = r4((-Math.atan2(prev[1] - end[1], prev[0] - end[0]) * 180) / Math.PI);
        instances.push({ id, template: 'osu-slider', t, path: pid, tail: r4(d + 0.7), params: { x: g.x, y: g.y, n: c.n, c: c.colour % L.colours, ...cfOf(), d, r: g.r, f: L.bodyFrame[i], bx: L.bodyCentre[i][0], by: L.bodyCentre[i][1], ex: end[0], ey: end[1], ea, jx: fin[0], jy: fin[1] } });
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
    // (the results come R0 after the last object: the HUD's combo, health and progress go then; the score and the accuracy fly
    //  into the ranking panel)
    const R0 = r4(lastEnd + 0.8);
    const comboTracks = [0, 1, 2, 3].map((k) => { const place = 10 ** (3 - k); return { target: `combo${k}`, clips: [span(0, R0, { frame: at(k === 3 ? dg('state.combo', 1) : `10 - (10 - ${dg('state.combo', place)}) * math.min(1, math.floor(state.combo / ${place}))`) })] }; });
    const comboShift = `0 - (4 - ${ndig}) * ${r4(L.comboDigitW)}`;
    comboTracks.push({ target: 'combo', clips: [
      span(0, 0.18, { x: at(comboShift), scaleX: [{ t: 0, v: 1.35, ease: 'quad-out' }, { t: 0.18, v: 1 }], scaleY: [{ t: 0, v: 1.35, ease: 'quad-out' }, { t: 0.18, v: 1 }] }, { trigger: 'combo' }),
      span(0, R0, { x: at(comboShift) })] });
    // ---- FL (state.fl): the light's square on the cursor and the four shutters up to it, all smaller at a combo of 100 and 200
    const flk = '(1 - 0.15 * math.min(2, math.floor(state.combo / 100)))', fs = r4(L.flS), FX = r4(L.flX), FY = r4(L.flY);
    const flTracks = [
      { target: 'flhole', clips: [span(0, R0, { x: at('state.cx'), y: at('state.cy'), scaleX: at(`${flk} * state.fl`), scaleY: at(`${flk} * state.fl`) })] },
      { target: 'flleft', clips: [span(0, R0, { scaleX: at(`math.max(0, state.cx - ${fs} * ${flk} + ${FX} + 0.4) * state.fl`) })] },
      { target: 'flright', clips: [span(0, R0, { scaleX: at(`math.max(0, ${FX} - state.cx - ${fs} * ${flk} + 0.4) * state.fl`) })] },
      { target: 'fltop', clips: [span(0, R0, { x: at('state.cx'), scaleX: at(`${flk} * state.fl`), scaleY: at(`math.max(0, ${FY} - state.cy - ${fs} * ${flk} + 0.4) * state.fl`) })] },
      { target: 'flbottom', clips: [span(0, R0, { x: at('state.cx'), scaleX: at(`${flk} * state.fl`), scaleY: at(`math.max(0, ${FY} + state.cy - ${fs} * ${flk} + 0.4) * state.fl`) })] },
    ];
    // ---- the fail (the play's fail event): the field drops away, a dark curtain comes down, FAILED, the retry's hint
    const pop = (d, k = 1) => [{ t: 0, v: 0, ease: 'back-out' }, { t: d, v: k }];
    const failTracks = [
      { target: 'failshade', clips: [{ start: 0, end: 6, trigger: 'fail', channels: { scaleY: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.7, v: 1 }] } }] },
      { target: 'failtext', clips: [{ start: 0.3, end: 6, trigger: 'fail', channels: { scaleX: pop(0.4), scaleY: pop(0.4), rotation: [{ t: 0, v: -14, ease: 'back-out' }, { t: 0.4, v: 0 }], y: at('1.2 * math.sin(t * 160)') } }] },
      ...(L.failButton ? ['failretry', 'failbutton'] : ['failretry']).map((target) => ({ target, clips: [{ start: 1.0, end: 6, trigger: 'fail', channels: { scaleX: at('math.min(1, t / 0.2) * (1 + 0.05 * math.sin(t * 300))'), scaleY: at('math.min(1, t / 0.2) * (1 + 0.05 * math.sin(t * 300))') } }] })),
    ];
    // ---- the mods on: each by its flag, moved left by the width of those after it that are on
    const modTracks = L.mods.map((m, i) => ({ target: `mod${m.m.toUpperCase()}`, clips: [span(0, dur, { scaleX: at(`state.${m.m}`), scaleY: at(`state.${m.m}`),
      ...(i < L.mods.length - 1 ? { x: at(`0 - (${L.mods.slice(i + 1).map((n) => `${n.w} * state.${n.m}`).join(' + ')})`) } : {}) })] }));
    // ---- the results (none after a fail): the panel slides in, the counts count up, the grade comes down hard (the panel shakes
    //      with it), the full combo's stamp, a new best
    const RR = L.R, nf = '(1 - state.failed)', countUp = (src) => at(`math.floor(${src} * math.clamp(t / 0.8, 0, 1) + 0.5)`);
    const fly = (g, to, sc) => { const tx = r4(to[0] - sc * g.right - g.pivot[0]), ty = r4(to[1] - g.pivot[1]);
      return [span(0, R0, {}), span(R0, dur, { x: [{ t: 0, v: 0, ease: 'quad-inout' }, { t: 0.6, v: `(${tx} - screen.dx) * ${nf}` }], y: [{ t: 0, v: 0, ease: 'quad-inout' }, { t: 0.6, v: `${ty} * ${nf}` }],
        scaleX: [{ t: 0, v: 1, ease: 'quad-inout' }, { t: 0.6, v: `1 + ${r4(sc - 1)} * ${nf}` }], scaleY: [{ t: 0, v: 1, ease: 'quad-inout' }, { t: 0.6, v: `1 + ${r4(sc - 1)} * ${nf}` }] })]; };
    const rankFrame = '(6 - state.rank) + 6 * math.min(1, state.hd + state.fl) * math.clamp(state.rank - 4, 0, 1)';
    const resTracks = [
      { target: 'res', clips: [span(R0, dur, { scaleX: at(nf), scaleY: at(nf), x: at('2.2 * math.sin(t * 2600) * math.clamp(1 - math.abs(t - 1.32) / 0.14, 0, 1)') })] },
      { target: 'respanel', clips: [span(R0, dur, { x: [{ t: 0, v: -24, ease: 'quad-out' }, { t: 0.35, v: 0 }], scaleY: [{ t: 0, v: 0.3, ease: 'back-out' }, { t: 0.35, v: 1 }] })] },
      { target: 'restitle', clips: [span(R0 + 0.15, dur, { scaleX: pop(0.3), scaleY: pop(0.3) })] },
      ...['300', '100', '50', 'miss'].flatMap((n, k) => [
        { target: `res${n}_icon`, clips: [span(R0 + 0.25 + k * 0.05, dur, { scaleX: pop(0.25), scaleY: pop(0.25) })] },
        { target: `res${n}`, clips: [span(R0 + 0.3, dur, { value: countUp(`state.${n === 'miss' ? 'misses' : `n${n}`}`), scaleX: pop(0.2), scaleY: pop(0.2) })] }]),
      { target: 'reslabelcombo', clips: [span(R0 + 0.3, dur, { scaleX: pop(0.25), scaleY: pop(0.25) })] },
      { target: 'reslabelacc', clips: [span(R0 + 0.3, dur, { scaleX: pop(0.25), scaleY: pop(0.25) })] },
      { target: 'resmaxcombo', clips: [span(R0 + 0.35, dur, { value: countUp('state.maxcombo'), scaleX: pop(0.2), scaleY: pop(0.2) })] },
      // (the grade: the pixel look's cubes turn slowly, their sides showing)
      { target: 'resrank', clips: [span(R0 + 1.0, dur, { frame: at(rankFrame), scaleX: [{ t: 0, v: 2.4, ease: 'quad-in' }, { t: 0.2, v: 0.94, ease: 'quad-out' }, { t: 0.32, v: 1 }], scaleY: [{ t: 0, v: 2.4, ease: 'quad-in' }, { t: 0.2, v: 0.94, ease: 'quad-out' }, { t: 0.32, v: 1 }], rotation: [{ t: 0, v: -16, ease: 'quad-in' }, { t: 0.2, v: 0 }],
        ...(P ? { rotationY: at('18 * math.sin(t * 50)'), rotationX: at('-8 + 4 * math.sin(t * 37)') } : {}) })] },
      { target: 'resfc', clips: [span(R0 + 1.6, dur, { scaleX: [{ t: 0, v: '1.8 * state.fc', ease: 'quad-in' }, { t: 0.18, v: 'state.fc' }], scaleY: [{ t: 0, v: '1.8 * state.fc', ease: 'quad-in' }, { t: 0.18, v: 'state.fc' }], rotation: [{ t: 0, v: -22, ease: 'quad-in' }, { t: 0.18, v: -8 }] })] },
      { target: 'resrecord', clips: [span(R0 + 2.0, dur, { scaleX: at('state.record * math.min(1, t / 0.25) * (1 + 0.06 * math.sin(t * 400))'), scaleY: at('state.record * math.min(1, t / 0.25) * (1 + 0.06 * math.sin(t * 400))') })] },
      { target: 'score', clips: fly(L.score, RR.scoreTo, RR.scoreScale) },
      { target: 'acc', clips: fly(L.acc, RR.accTo, RR.accScale) },
    ];
    const tracks = [
      // (the fall: a fail drops the field away, tumbling; the results take it away)
      { target: 'osu_fall', clips: [{ start: 0, end: 6, trigger: 'fail', channels: { y: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 1.5, v: -210 }], rotation: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 1.5, v: 26 }], rotationX: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 1.5, v: 50 }] } },
        span(0, R0, {}), span(R0, dur, { scaleX: [{ t: 0, v: 1, ease: 'back-in' }, { t: 0.5, v: 0 }], scaleY: [{ t: 0, v: 1, ease: 'back-in' }, { t: 0.5, v: 0 }], rotation: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 0.5, v: -10 }] })] },
      { target: 'osu_shake', clips: [span(0, 0.35, { x: at('2.6 * math.sin(t * 3100) * (1 - t / 0.35)'), y: at('1.6 * math.cos(t * 2300) * (1 - t / 0.35)'), rotation: at('1.4 * math.sin(t * 1900) * (1 - t / 0.35)') }, { trigger: 'miss' }), span(0, dur, {})] },
      { target: 'osu_tilt', clips: tiltClips },
      { target: 'osu_pulse', clips: pulseClips },
      { target: 'cursor', clips: [span(0, lastEnd + 0.3, { x: at('state.cx'), y: at('state.cy'), scaleX: at('1 + 0.25 * state.hold'), scaleY: at('1 + 0.25 * state.hold'), ...(P ? { rotation: at('t * 90') } : {}) })] },
      { target: 'kiaiglow', clips: glowClips },
      ...scoreTracks, ...accTracks, ...comboTracks,
      { target: 'progress', clips: [span(0, R0, { fill: [{ t: 0, v: 0 }, { t: r4(firstT), v: 0 }, { t: r4(lastEnd), v: 1 }] })] },
      ...['progressback', 'health', 'healthback'].map((target) => ({ target, clips: [span(0, R0, {})] })),
      ...flTracks, ...failTracks, ...modTracks, ...resTracks,
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
  /** the playfield's frame of bones: the fall (a fail: it drops away; the results: it goes), the shake, the lean, the pulse — each
   *  a bone of its own (one track a bone), the pulse's children the playfield's elements */
  const FIELD = (C) => [{ name: 'osu_fall', parent: 'osu_root', pivot: [C[0], C[1], 0] }, { name: 'osu_shake', parent: 'osu_fall', pivot: [C[0], C[1], 0] }, { name: 'osu_tilt', parent: 'osu_shake', pivot: [C[0], C[1], 0] }, { name: 'osu_pulse', parent: 'osu_tilt', pivot: [C[0], C[1], 0] }];

  /** the tour: every look of the game in about 23 seconds, scene by scene at fixed times — what runtime.js plays for
   *  `<ns>:tour` (and the menu's 検証ツアー), the real app's one quick check of it all: circles, a slider with its turns, a kiai, HD,
   *  FL, the spinner, a break's PASS, misses (aim, nothing pressed: the shake), a fail, the results (the autoplay's whole play).
   *  → { scenes: [[ms, what, a, b, c]] (play: from ms of the song, mode, mods · seek: likewise · fail · results: the song's ms ·
   *  stop), shots: [[ms, name]] (a moment of each scene to look at), length } */
  function tourOf(G) {
    const objs = G.objects || [], end = (o) => (o.k === 's' ? o.t + o.d : o.k === 'p' ? o.e : o.t);
    if (!objs.length) return { scenes: [], shots: [], length: 0 };
    const first = objs[0].t, lastEnd = Math.max(...objs.map(end)), kiai = G.kiai || [], brk = (G.breaks || [])[0], sp = objs.find((o) => o.k === 'p');
    // (the slider with the most turns, the longest of them; the 2.2 s with the most objects after a time; the object at a time)
    const slider = objs.filter((o) => o.k === 's').sort((a, b) => b.r - a.r || b.d - a.d)[0];
    const dense = (from, to = Infinity) => { let best = null, n = -1; for (const o of objs) { if (o.t < from || o.t > to) continue; const c = objs.filter((x) => x.t >= o.t && x.t < o.t + 2200).length; if (c > n) { n = c; best = o.t; } } return best === null ? from : best; };
    const scenes = [], shots = [];
    let at = 0;
    const add = (dt, row, shot, name) => { scenes.push([at, ...row]); if (shot !== null) shots.push([at + shot, name]); at += dt; };
    add(2200, ['play', Math.max(0, first - 1200), 'auto', ''], 1500, 'circles');
    if (slider) add(2200, ['seek', Math.max(0, slider.t - 600), 'auto', ''], 1300, 'slider');
    if (kiai[0]) add(2200, ['seek', kiai[0][0] + 150, 'auto', ''], 1150, 'kiai');
    const hdAt = dense(first + 4000, kiai[0] ? kiai[0][0] - 2500 : Infinity);
    add(2200, ['seek', Math.max(0, hdAt - 500), 'auto', 'HD'], 1400, 'hidden');
    const flAt = kiai[1] ? kiai[1][0] + 300 : dense(lastEnd / 2);
    add(2200, ['seek', Math.max(0, flAt - 300), 'auto', 'FL'], 1300, 'flashlight');
    if (sp) add(2400, ['seek', Math.max(0, sp.t - 300), 'auto', ''], 1700, 'spinner');
    if (brk) add(2200, ['seek', brk[0] + 900, 'auto', ''], 1000, 'break');
    // (aim, and nothing pressed: misses — the shake, the combo gone, the health down — then the fail)
    const missAt = dense(kiai[0] ? kiai[0][0] + 1500 : first + 3000);
    add(1700, ['seek', Math.max(0, missAt - 300), 'aim', ''], 1350, 'miss');
    add(3000, ['fail'], 1500, 'fail');
    add(3700, ['results', lastEnd + 100], 2900, 'results');
    scenes.push([at, 'stop']);
    return { scenes, shots, length: at };
  }

  /** a beatmap (parsed: osu.parseOsu) → the whole game. opts: { skin: 'pixel' | 'skin', images ({ name: image } of an osu! skin:
   *  the Legacy skin's @2x names without '@2x', for 'skin'), ns, title, description, width (the playfield's, model units: 176),
   *  centre ([0, 130]), music (its sound id), sound(name) → a sound id for an osu! sample or null, ppu (the skin's pixels a unit:
   *  6) } */
  function build(map, opts = {}) {
    const O = T.osu, skin = opts.skin === 'skin' ? 'skin' : 'pixel', P = skin === 'pixel', ns = opts.ns || 'geoui', FW = num(opts.width, 176), C = opts.centre || [0, 130];
    const warnings = [], diff = O.difficultyOf(map), G = O.gameOf(map, { width: FW, sound: opts.sound || ((x) => x) }), R = G.r;
    const colours = (map.colours.combos.length ? map.colours.combos : [[255, 192, 0], [0, 202, 0], [18, 124, 255], [242, 24, 57]]).slice(0, 8);
    const cs = O.combos(map), bpm = r4(60000 / ((map.timing.find((p) => p.uninherited) || { beatLength: 500 }).beatLength));
    // (the pixel look's circles carry their numbers: a frame for each combo number and colour a circle or a slider's head shows —
    //  the pairs the map has, not all of them: the coin's frames stay few however long a combo runs)
    const pairKey = ([n, c]) => `${n}/${c}`;
    let coinPairs = P ? [...new Map(G.objects.map((g, i) => [g.k, [Math.min(9999, cs[i].n), cs[i].colour % colours.length]]).filter(([k]) => k === 'c' || k === 's').map(([, p]) => [pairKey(p), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]) : null;
    const lastEnd = Math.max(...G.objects.map((g) => (g.k === 's' ? g.t + g.d : g.k === 'p' ? g.e : g.t)));
    const duration = r4(Math.max(lastEnd / 1000 + 4, num(opts.duration, 0)));
    // ---- the sprites and their sizes (model units)
    const items = [], size = {};
    let bodyInfo;
    const HALFW = 151.7, TOP = 220.4, BOTTOM = 49.7;   // (the screen at 16:9 by bds-lab's measure: GeoUI's measured calibration)
    // (FL: the light round the cursor — its radius at a combo under 100, 0.3 of the field's height (osu!'s shrinks at 100 and
    //  200), the square it is drawn in; the field and its frame it darkens, with room for the tilt — the board lies deeper than
    //  the light, so a lean shows it a little beside where the light's plane is — but not as far as the combo at the bottom left)
    const FLR = r4(FW * 0.75 * 0.3), FLS = r4(FLR * 1.12), FLX = r4(FW / 2 + 13.5), FLY = r4(FW * 0.375 + 19.5);
    // (the mods on: osu!'s letters, each its colour)
    const MODC = [['HD', [234, 178, 40]], ['FL', [96, 96, 112]], ['NF', [60, 130, 230]], ['SD', [230, 110, 50]], ['PF', [220, 70, 150]], ['AUTO', [60, 190, 150]]];
    if (P) {
      const S = pixelSprites(colours), pu = (2 * R) / 16;   // (a hit circle 16 px across)
      Object.assign(size, { pu });
      // (the flashlight a pixel of the look a pixel: black but for a pixel circle round the cursor, dithered at its edge)
      S.flashlight = (() => { const n = 2 * Math.ceil(FLS / pu), im = img(n, n), c = n / 2, rr = FLR / pu; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d > rr || (d > rr - 1.6 && (x + y) % 2 === 0)) put(im, x, y, [0, 0, 0, 255]); } return im; })();
      size.flS = (S.flashlight.width * pu) / 2;
      // (the mods on: a plate a mod — its colour's border, its letters)
      for (const [m, c] of MODC) { const t = textImage(m, [...c.map((v) => Math.min(255, v + 40)), 255]), o = img(t.width + 4, 9); for (let y = 0; y < 9; y++) for (let x = 0; x < o.width; x++) { const e = Math.min(x, y, o.width - 1 - x, 8 - y), corner = (x === 0 || x === o.width - 1) && (y === 0 || y === 8); if (!corner) put(o, x, y, e === 0 ? [...c.map((v) => Math.round(v * 0.7)), 255] : [18, 20, 32, 255]); } blit(o, t, 2, 2); S[`mod${m}`] = o; }
      // the models (pixelModels: each object of the game built of blocks, the pixel art on their faces)
      const MODELS = pixelModels(colours, S, coinPairs), models = {};
      MODELS.rank.zs = 0.45; for (const id of ['digitframes', 'x', 'dot', 'pct', ...Array.from({ length: 10 }, (_, d) => `num${d}`)]) MODELS[id].zs = 0.5;
      for (const [id, im, sh] of [['hitcircle', S.hitcircle, 1], ['approachcircle', S.approachcircle, 1], ['hitburst', S.hitburst, 1], ['sliderball', S.sliderball, 1], ['followcircle', S.followcircle, 1],
        ['reversearrow', S.reversearrow, 1], ['slidertick', S.slidertick, 1], ['followpoint', S.followpoint, 1], ['spinner', S.spinner, 1], ['spinnerapproach', S.spinnerapproach, 1], ['cursor', S.cursor, 1],
        ['judgement', S.judgement, 1], ['digit', S.digit, 1], ['digitframes', [...S.digit, img(3, 5)], 1], ...S.digit.map((im, d) => [`num${d}`, im, 1]), ['spin', S.spin, 1], ['clear', S.clear, 1], ['rank', S.rank, 1], ['section', S.section, 1],
        ['x', S.x, 1], ['dot', S.dot, 1], ['pct', S.pct, 1], ['barback', S.barback, 1], ['barfill', S.barfill, 1], ['board', S.board, 0], ['glow', S.glow, 0],
        ['resboard', S.resboard, 0], ['restitle', S.restitle, 1], ['maxcombo', S.maxcombo, 1], ['accuracy', S.accuracy, 1], ['fc', S.fc, 1], ['record', S.record, 1], ['failed', S.failed, 1], ['retry', S.retry, 1],
        ['j300', S.j300, 1], ['j100', S.j100, 1], ['j50', S.j50, 1], ['jx', S.jx, 1], ...['HD', 'FL', 'NF', 'SD', 'PF', 'AUTO'].map((m) => [`mod${m}`, S[`mod${m}`], 1]), ['flashlight', S.flashlight, 0], ['shade', S.shade, 0]]) {
        // (a modeled object: its layers' cells — the pixel art and its lights; the rest as before: a picture made solid)
        if (MODELS[id]) { const mc = modelCells(MODELS[id]); models[id] = mc; items.push({ id, image: mc.cells, shade: false }); }
        else items.push({ id, image: im, shade: Boolean(sh) });
      }
      Object.assign(size, { models, sprites: S });
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
      // the grade on the results: the big letters (X = SS), silver XH / SH with HD or FL — the small ones where a skin has no big ones
      const opt = (n) => I[n] || null;
      const ranks = ['X', 'S', 'A', 'B', 'C', 'D', 'XH', 'SH'].map((g) => opt(`ranking-${g}`) || opt(`ranking-${g.replace('H', '')}`) || need(`ranking-${g.replace('H', '')}-small`));
      const rw = Math.max(...ranks.map((m) => m.width)), rh = Math.max(...ranks.map((m) => m.height)), rf = 68 / rh, rppu = 1.75;
      items.push({ id: 'rank', image: ranks.map((m) => resize(centred(m, rw, rh), rw * rf * rppu, rh * rf * rppu)) }); size.rank = [rw * rf, rh * rf];
      // the results' panel and words (the skin's own, else drawn here: a dark panel, the pixel font's words)
      const res = (n, h, ppx, fallback) => { const m = opt(n); if (!m) { const t = fallback(); items.push({ id: n, image: t }); size[n] = [t.width * (h / t.height), h]; return; } const f = h / m.height; items.push({ id: n, image: resize(m, m.width * f * ppx, m.height * f * ppx) }); size[n] = [m.width * f, h]; };
      res('ranking-panel', 112, 1.6, () => { const o = img(62, 50); for (let y = 0; y < 50; y++) for (let x = 0; x < 62; x++) put(o, x, y, y < 1 || (y > 7 && y < 9) ? [0, 0, 0, 0] : y < 8 ? [230, 205, 160, 230] : [62, 124, 214, 230]); return o; });
      res('ranking-title', 13, 3, () => strokeText('RANKING').image);
      res('ranking-maxcombo', 8, 4, () => strokeText('MAX COMBO').image);
      res('ranking-accuracy', 8, 4, () => strokeText('ACCURACY').image);
      res('ranking-perfect', 18, 3, () => strokeText('PERFECT', { colour: [255, 214, 64] }).image);
      // (the words the skin has none of — a new best, the fail, its hint — in the stroke font, cap the height asked; the retry
      //  button the skin's own where it has one)
      const word = (id, s, cap, colour, outline) => { const t = strokeText(s, { colour, outline, ppu: Math.max(4, Math.round(cap * 0.75)) }); items.push({ id, image: t.image }); size[id] = [(t.image.width / t.image.height) * (cap / t.cap), cap / t.cap]; };
      word('record', 'NEW RECORD!', 6, [150, 255, 160], [10, 50, 20]); word('failed', 'FAILED', 15, [255, 84, 96], [50, 0, 10]); word('retry', 'JUMP: RETRY', 4.2, [255, 236, 236], [40, 20, 20]);
      if (opt('pause-retry')) res('pause-retry', 15, 3, () => img(1, 1));
      // the mods on: a pill a mod (its colour, lit from the top), its letters white
      for (const [m, c] of MODC) {
        const t = strokeText(m, { colour: [255, 255, 255], outline: c.map((v) => Math.round(v * 0.45)), ppu: 8 }).image, Hp = Math.round(t.height * 1.08), Wp = t.width + Math.round(Hp * 0.55);
        const pill = (w, cc) => T.media.rasterOps([['strokeStyle', `rgb(${cc[0]},${cc[1]},${cc[2]})`], ['lineWidth', w], ['beginPath'], ['moveTo', Hp / 2, Hp / 2], ['lineTo', Wp - Hp / 2, Hp / 2], ['stroke']], Wp, Hp);
        const o = img(Wp, Hp), back = pill(Hp, c.map((v) => Math.round(v * 0.5))), face = pill(Hp - 6, c);
        blit(o, { width: back.width, height: back.height, data: back.data }, 0, 0);
        for (let y = 0; y < face.height; y++) { const f = 1.18 - 0.36 * (y / face.height); for (let x = 0; x < face.width; x++) { const cc = get(face, x, y); if (cc[3]) put(o, x, y, [Math.min(255, Math.round(cc[0] * f)), Math.min(255, Math.round(cc[1] * f)), Math.min(255, Math.round(cc[2] * f)), cc[3]]); } }
        blit(o, t, Math.round((Wp - t.width) / 2), Math.round((Hp - t.height) / 2));
        items.push({ id: `mod${m}`, image: o }); size[`mod${m}`] = [(Wp / Hp) * 6.8, 6.8];
      }
      // the flashlight: black, a soft hole round the cursor (its edge a fifth of the square's half); the fail's shade: black,
      // see-through
      items.push({ id: 'flashlight', image: (() => { const n = 128, o = img(n, n), c = n / 2, uh = FLR / FLS; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c; put(o, x, y, [0, 0, 0, Math.round(255 * Math.min(1, Math.max(0, (u - (uh - 0.22)) / 0.22)))]); } return o; })() });
      size.flS = FLS;
      items.push({ id: 'shade', image: (() => { const o = img(8, 8); for (let k = 3; k < o.data.length; k += 4) o.data[k] = 160; return o; })() });
      const sec = ['section-pass', 'section-fail'].map(need), sw2 = Math.max(...sec.map((m) => m.width)), sh2 = Math.max(...sec.map((m) => m.height)), sf = 46 / sh2;
      items.push({ id: 'section', image: sec.map((m) => sc(centred(m, sw2, sh2), sf)) }); size.section = [sw2 * sf, sh2 * sf];
      const back = (() => { const o = img(64, 48); for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) { const e = Math.min(x, y, 63 - x, 47 - y); put(o, x, y, [0, 0, 0, Math.round(Math.min(1, e / 3) * 180)]); } return o; })();
      items.push({ id: 'board', image: back });
      Object.assign(size, { ppu, k });
      bodyInfo = bodies(G, colours, cs.map((c) => c.colour), { ppu: Math.min(ppu, num(opts.bodyPpu, 2.2)), pixel: false });
    }
    items.push({ id: 'bodies', image: bodyInfo.cells.length ? bodyInfo.cells : [img(1, 1)] });
    // (2048 at most: the size every device takes — the slider bodies, the largest part, drawn smaller until it all fits)
    let A = null;
    for (let tries = 0, bp = bodyInfo.ppu; !A; tries++) {
      try { A = atlasOf(items, { maxSize: num(opts.maxAtlas, 2048) }); }
      catch (e) {
        // (the coins' numbers when nothing else is left to make smaller: a frame for each number and colour → a frame a colour)
        if ((tries >= 6 || !bodyInfo.cells.length) && P && coinPairs) {
          const mc = modelCells(pixelModels(colours, size.sprites, null).hitcircle);
          size.models.hitcircle = mc; items.find((x) => x.id === 'hitcircle').image = mc.cells;
          warnings.push(`コンボの数字をコインに描けませんでした（数字と色の組 ${coinPairs.length} 個がアトラス（${num(opts.maxAtlas, 2048)} x ${num(opts.maxAtlas, 2048)}）に入りません）。数字のない円にしました`);
          coinPairs = null; continue;
        }
        if (tries >= 6 || !bodyInfo.cells.length) throw e;
        bp *= 0.84; bodyInfo = bodies(G, colours, cs.map((c) => c.colour), { ppu: bp, pixel: P }); items.find((x) => x.id === 'bodies').image = bodyInfo.cells;
        if (tries === 0) warnings.push('アトラス（2048 x 2048）に入りきらないので、スライダーの体を小さい絵にしました（画面での大きさは同じ・きめが粗い）');
      }
    }
    // ---- the bones (GeoUI's design): the field, the playfield's elements under its pulse, the HUD under the root
    // (osu_root: everything, shown only while a sequence plays — GeoUI's visible condition on it; the HUD's bones under it too)
    const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, { name: 'osu_root', parent: 'geo_ui', pivot: [0, 140, 0] }, ...FIELD(C)], F = 'osu_pulse', H = 'osu_root';
    const elements = { osu_root: { type: 'image', visible: `v.${ns}_seq > 0` } };
    const cellOf = (id, frame = 0) => { const a = A.at[id]; return [a.x + (frame % a.cols) * a.cell[0], a.y + Math.floor(frame / a.cols) * a.cell[1]]; };
    const framesOf = (id) => { const a = A.at[id]; return { cols: a.cols, rows: a.rows, step: a.cell }; };
    const imageEl = (name, frames, blend = P ? 'cutout' : 'blend') => { elements[name] = Object.assign({ type: 'image', blend }, frames ? { frames } : {}); };
    // (a modeled object — pixelModels — as its model; any other sprite made solid: its picture d units deep)
    const vox = (name, id, parent, at, z, d, o = {}) => {
      const fr = A.at[id].frames, mdl = size.models && size.models[id];
      if (mdl) bones.push(modelBone(name, parent, at, cellOf(id), o.px || size.pu, z, mdl));
      else { const ims = items.find((x) => x.id === id).image; bones.push(voxel(name, parent, at, Array.isArray(ims) ? ims : [ims], cellOf(id), o.px || size.pu, d, z, { perPixel: Boolean(o.perPixel) })); }
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
    // (what the document needs of the layout: build's places for the HUD, the flashlight, the mods, the results)
    const L0 = {};
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
      // the board's frame, modeled: walls round the field (deep: their sides show as the field leans), a lip inside them on
      // the floor, a post at each corner standing out of the walls with a cap on it — one bone of blocks
      bones.push({ name: 'board_frame', parent: F, pivot: [C[0], C[1], 8], cubes: trayCubes(C, FW + 16, FW * 0.75 + 16, 6, A.at.barback) });
      bones.push(plane('kiaiglow', F, C, [FW * 1.1, FW * 0.85], [A.at.glow.x, A.at.glow.y, A.at.glow.w, A.at.glow.h], 9)); imageEl('kiaiglow', null, 'add');
      vox('followpoint', 'followpoint', F, C, 4, 0.8, { px: pu * 0.9 });
      bones.push(plane('sliderbody', F, C, bodyInfo.units, [A.at.bodies.x, A.at.bodies.y, A.at.bodies.w, A.at.bodies.h], 3)); elements.sliderbody = { type: 'image', blend: 'cutout', frames: bodyFrames };
      vox('slidertick', 'slidertick', F, C, 2, 0.8, { px: pu });
      vox('spinner', 'spinner', F, C, 1.5, 2.5, { px: (FW * 0.75 * 0.9) / 32 });
      vox('spinnerapproach', 'spinnerapproach', F, C, -3, 1, { px: (FW * 0.75 * 0.9) / 32 });
      // (each a depth of its own, front to back without two overlapping: a voxel's sides then share no plane with another's)
      vox('spinnerspin', 'spin', F, [C[0], C[1] - 34], -14.6, 1.5, { px: pu * 1.3 });
      vox('spinnerclear', 'clear', F, [C[0], C[1] + 30], -16.4, 1.5, { px: pu * 1.6 });
      [0, 1, 2].forEach((k) => { vox(`spinnerrpm${k}`, 'digitframes', F, [C[0] + (k - 1) * pu * 4.2, C[1] - 48], -18, 1, { px: pu * 1.05, perPixel: true }); elements[`spinnerrpm${k}`].frames = framesOf('digitframes'); });
      // (the coin and its number in one model: a frame a combo colour and number — no numerals of their own, so no slot of
      //  the circles carries twenty of them)
      vox('hitcircle', 'hitcircle', F, C, -3, D);
      vox('followcircle', 'followcircle', F, C, -4.4, 0.8, { px: (2.4 * 2 * R) / 28 });
      vox('approachcircle', 'approachcircle', F, C, -6, 1.0);
      vox('reversearrow', 'reversearrow', F, C, -7.4, 1.2, { px: pu * 1.2 });
      vox('sliderball', 'sliderball', F, C, -9.8, 2, { px: (1.6 * R) / 8 });
      vox('hitburst', 'hitburst', F, C, -11.4, 1.4);
      vox('judgement', 'judgement', F, C, -13, 1.4, { px: pu * 0.85, perPixel: true });
      // (the gem whole in front of the flashlight's plane: its back at -18.3)
      vox('cursor', 'cursor', F, C, -22.5, 1.6, { px: pu * 0.9 });
      // HUD (score top right, accuracy under it, the combo bottom left, health top left, progress, section) — in front of the
      // playfield and its flashlight (HZ: the HUD's layer; osu!'s HUD stays over the flashlight)
      const spx = 1.9, sdw = spx * 4, HZ = -28;
      hudDigits('score', 8, [HALFW - 6, TOP - 9], sdw, HZ, 'digitframes', 'top-right', { px: spx });
      const apx = 1.2, adw = apx * 4, ay = TOP - 22;
      hudDigits('acc', 5, [HALFW - 6 - adw * 2.2, ay], adw, HZ, 'digitframes', 'top-right', { px: apx });
      // (the accuracy reads 99.87%: its point after the third digit — the digits are at fixed places, the point and % beside)
      const accBones = bones.filter((b) => /^acc[0-4]$/.test(b.name));
      accBones.forEach((b) => { const k = +b.name.slice(3); const dx = k >= 3 ? adw * 0.9 : 0; for (const c of b.cubes) c.origin[0] = r4(c.origin[0] + dx); b.pivot[0] = r4(b.pivot[0] + dx); });
      vox('accdot', 'dot', 'acc', [HALFW - 6 - adw * 2.2 - adw * 1.05, ay], HZ, 0.9, { px: apx });
      vox('accpct', 'pct', 'acc', [HALFW - 6 - adw * 2.2 + adw * 1.9, ay], HZ, 0.9, { px: apx });
      const cpx = 2.6, cdw = cpx * 4, cy0 = BOTTOM + 11;
      bones.push({ name: 'combo', parent: H, pivot: [r4(-HALFW + 8), cy0, 0] }); elements.combo = { type: 'image', anchor: 'bottom-left' };
      for (let k = 0; k < 4; k++) { vox(`combo${k}`, 'digitframes', 'combo', [-HALFW + 8 + k * cdw, cy0], HZ, 1.4, { px: cpx, perPixel: true }); elements[`combo${k}`].frames = framesOf('digitframes'); }
      vox('combox', 'x', 'combo', [-HALFW + 8 + 4 * cdw - cdw * 0.15, cy0 - cpx], HZ, 1.4, { px: cpx });
      vox('healthback', 'barback', H, [-HALFW + 6 + 63, TOP - 7], HZ + 1, 1.5, { px: 3 }); elements.healthback.anchor = 'top-left';
      vox('health', 'barfill', H, [-HALFW + 6 + 63, TOP - 7], HZ - 0.6, 1.5, { px: 3 });
      Object.assign(bones.find((b) => b.name === 'health'), { pivot: [r4(-HALFW + 6 + 3), TOP - 7, HZ - 0.6] });
      elements.health = { type: 'gauge', anchor: 'top-left', blend: 'cutout', gauge: { source: `q.property('${ns}:v3')`, max: 100, fill: 'left' } };
      vox('progressback', 'barback', H, [HALFW - 6 - 25.2, TOP - 30], HZ + 1, 0.8, { px: 1.2 }); elements.progressback.anchor = 'top-right';
      vox('progress', 'barfill', H, [HALFW - 6 - 25.2, TOP - 30], HZ, 0.8, { px: 1.2 });
      Object.assign(bones.find((b) => b.name === 'progress'), { pivot: [r4(HALFW - 6 - 49.2), TOP - 30, HZ] });
      elements.progress = { type: 'gauge', anchor: 'top-right', blend: 'cutout', gauge: { source: '0', max: 1, fill: 'left' } };
      vox('section', 'section', H, [0, C[1]], HZ - 6, 2, { px: 3.2, perPixel: true });
      // (where the score and the accuracy are, for the results: each group's pivot — its last digit — and how far it reaches left
      //  and right of it)
      Object.assign(L0, { HZ, score: { pivot: [HALFW - 6, TOP - 9], left: 7 * sdw + 1.5 * spx, right: 1.5 * spx, h: 5 * spx },
        acc: { pivot: [HALFW - 6 - adw * 2.2, ay], left: 4 * adw + 1.5 * apx, right: adw * 1.9 + 1.5 * apx, h: 5 * apx } });
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
      // HUD — in front of the playfield and its flashlight (HZ: the HUD's layer)
      const sw = size.score[0] * 0.95, HZ = -18;
      hudDigits('score', 8, [HALFW - 4 - size.score[0] / 2, TOP - 7], sw, HZ, 'scoredigits', 'top-right');
      const as = 0.62, aw = sw * as, ay = TOP - 18;
      hudDigits('acc', 5, [HALFW - 4 - size.pct[0] * as - aw * 0.5, ay], aw, HZ, 'scoredigits', 'top-right', { size: [size.score[0] * as, size.score[1] * as] });
      const accBones = bones.filter((b) => /^acc[0-4]$/.test(b.name));
      accBones.forEach((b) => { const kk = +b.name.slice(3); const dx = kk < 3 ? -size.dot[0] * as * 0.9 : 0; for (const c of b.cubes) c.origin[0] = r4(c.origin[0] + dx); b.pivot[0] = r4(b.pivot[0] + dx); });
      flat('accdot', 'dot', 'acc', [HALFW - 4 - size.pct[0] * as - aw * 2.0 - size.dot[0] * as * 0.45, ay], HZ - 0.2, [size.dot[0] * as, size.dot[1] * as]);
      flat('accpct', 'pct', 'acc', [HALFW - 4 - size.pct[0] * as / 2, ay], HZ - 0.25, [size.pct[0] * as, size.pct[1] * as]);
      const cs2 = 1.25, cw = size.score[0] * cs2 * 0.92, cy0 = BOTTOM + 9;
      bones.push({ name: 'combo', parent: H, pivot: [r4(-HALFW + 6), cy0, 0] }); elements.combo = { type: 'image', anchor: 'bottom-left' };
      for (let kk = 0; kk < 4; kk++) flat(`combo${kk}`, 'scoredigits', 'combo', [-HALFW + 6 + cw / 2 + kk * cw, cy0], HZ - kk * 0.021, [size.score[0] * cs2, size.score[1] * cs2]);
      flat('combox', 'x', 'combo', [-HALFW + 6 + cw * 4 + size.x[0] * cs2 * 0.4, cy0], HZ - 0.1, [size.x[0] * cs2, size.x[1] * cs2]);
      const hb = size.barback, hx = -HALFW + 4 + hb[0] / 2, hy = TOP - 2 - hb[1] / 2;
      flat('healthback', 'barback', H, [hx, hy], HZ + 1, hb); elements.healthback.anchor = 'top-left';
      const hf = size.barfill, fx = -HALFW + 4 + hb[0] * 0.018 + hf[0] / 2, fy = hy + hb[1] * 0.06;
      flat('health', 'barfill', H, [fx, fy], HZ, hf);
      Object.assign(bones.find((b) => b.name === 'health'), { pivot: [r4(fx - hf[0] / 2), r4(fy), HZ] });
      elements.health = { type: 'gauge', anchor: 'top-left', blend: 'blend', gauge: { source: `q.property('${ns}:v3')`, max: 100, fill: 'left' } };
      const pw = 36, ph = 1.6, ppx = HALFW - 4 - pw / 2, ppy = TOP - 27;
      bones.push(plane('progressback', H, [ppx, ppy], [pw, ph], [A.at.barback.x, A.at.barback.y + 2, A.at.barback.w, Math.max(1, A.at.barback.h - 4)], HZ + 1)); imageEl('progressback'); elements.progressback.anchor = 'top-right';
      bones.push(plane('progress', H, [ppx, ppy], [pw, ph * 0.7], [A.at.barfill.x, A.at.barfill.y, A.at.barfill.w, A.at.barfill.h], HZ)); bones[bones.length - 1].pivot = [r4(ppx - pw / 2), r4(ppy), HZ];
      elements.progress = { type: 'gauge', anchor: 'top-right', blend: 'blend', gauge: { source: '0', max: 1, fill: 'left' } };
      flat('section', 'section', H, [0, C[1]], HZ - 4, size.section);
      Object.assign(L0, { HZ, score: { pivot: [HALFW - 4 - size.score[0] / 2, TOP - 7], left: 7 * sw + size.score[0] / 2, right: size.score[0] / 2, h: size.score[1] },
        acc: { pivot: [HALFW - 4 - size.pct[0] * as - aw * 0.5, ay], left: 4 * aw + size.dot[0] * as * 0.9 + (size.score[0] * as) / 2, right: size.pct[0] * as + aw / 2, h: size.score[1] * as } });
    }
    // ---- what both looks have past the HUD above: the flashlight, the fail, the mods on, the results
    {
      const Z = P ? { fl: -18.2, shade: -25.6, fail: -36, mods: L0.HZ, panel: -26, res: -29.5, grade: -31, stamp: -34 } : { fl: -12.5, shade: -15.5, fail: -22.6, mods: L0.HZ, panel: -16, res: -19, grade: -20, stamp: -21 };
      const blackUv = [A.at.flashlight.x, A.at.flashlight.y, 1, 1];   // (the flashlight's corner: black, opaque)
      const flBlend = P ? 'cutout' : 'blend';
      // the flashlight (FL): a square with the light in it, following the cursor, and four shutters from the field's frame to the
      // square (each scaled to reach it) — in the playfield's frame, in front of all but the cursor; the HUD in front of it
      const fs = size.flS;
      bones.push(plane('flhole', F, C, [2 * fs, 2 * fs], [A.at.flashlight.x, A.at.flashlight.y, A.at.flashlight.w, A.at.flashlight.h], Z.fl)); imageEl('flhole', null, flBlend);
      // (the shutters opaque — cut out: what is behind them is hidden whatever order the game draws in)
      const shutter = (name, pivot, origin, sz) => { bones.push({ name, parent: F, pivot: [r4(pivot[0]), r4(pivot[1]), Z.fl], cubes: [{ origin: [r4(origin[0]), r4(origin[1]), Z.fl], size: [r4(sz[0]), r4(sz[1]), 0], faces: { north: { uv: [blackUv[0], blackUv[1]], uv_size: [1, 1], texture: 'atlas' } } }] }); imageEl(name, null, 'cutout'); };
      shutter('flleft', [C[0] - FLX, C[1]], [C[0] - FLX, C[1] - FLY], [1, 2 * FLY]);
      shutter('flright', [C[0] + FLX, C[1]], [C[0] + FLX - 1, C[1] - FLY], [1, 2 * FLY]);
      shutter('fltop', [C[0], C[1] + FLY], [C[0] - fs * 1.01, C[1] + FLY - 1], [2 * fs * 1.01, 1]);
      shutter('flbottom', [C[0], C[1] - FLY], [C[0] - fs * 1.01, C[1] - FLY], [2 * fs * 1.01, 1]);
      Object.assign(L0, { flS: fs, flX: FLX, flY: FLY });
      // the fail: a dark curtain over the screen (under the HUD), FAILED, the retry's hint
      const shadeW = 2 * (HALFW + 60), shadeTop = TOP + 2;
      bones.push({ name: 'failshade', parent: H, pivot: [0, r4(shadeTop), Z.shade], cubes: [{ origin: [r4(-shadeW / 2), r4(BOTTOM - 2), Z.shade], size: [r4(shadeW), r4(shadeTop - BOTTOM + 2), 0], faces: { north: { uv: [A.at.shade.x + 1, A.at.shade.y + 1], uv_size: [Math.max(1, A.at.shade.w - 2), Math.max(1, A.at.shade.h - 2)], texture: 'atlas' } } }] }); imageEl('failshade', null, 'blend');
      if (P) {
        vox('failtext', 'failed', H, [0, C[1] + 22], Z.fail, 3, { px: 3.4 });
        vox('failretry', 'retry', H, [0, C[1] - 14], Z.fail, 1.2, { px: 1.3 });
      } else {
        // (each its own depth: no two faces on one plane — the break's section is in front of the HUD too)
        flat('failtext', 'failed', H, [0, C[1] + 22], Z.fail, size.failed);
        if (A.at['pause-retry']) { flat('failbutton', 'pause-retry', H, [0, C[1] - 10], Z.fail - 0.2, size['pause-retry']); flat('failretry', 'retry', H, [0, C[1] - 23], Z.fail - 0.4, size.retry); L0.failButton = true; }
        else flat('failretry', 'retry', H, [0, C[1] - 12], Z.fail - 0.4, size.retry);
      }
      // the mods on (top right, under the score): a row from the right, each shown by its state, those after it moving it left
      const modY = 184, modR = HALFW - 6, gapM = P ? 1.6 : 1.4, mods = [];
      bones.push({ name: 'mods', parent: H, pivot: [r4(modR), modY, 0] }); elements.mods = { type: 'image', anchor: 'top-right' };
      // (they rest on one another until moved: each its own depth, 0.05 apart, and its own edges, 0.03 apart)
      MODC.forEach(([m], i) => {
        const id = `mod${m}`, w = P ? size.sprites[id].width * 0.75 : size[id][0], at = [modR - w / 2 - i * 0.03, modY - i * 0.03];
        if (P) vox(id, id, 'mods', at, Z.mods - i * 0.05, 1, { px: 0.75 }); else flat(id, id, 'mods', at, Z.mods - i * 0.05, size[id]);
        mods.push({ m: m.toLowerCase(), w: r4(w + gapM) });
      });
      L0.mods = mods;
      // the results: osu!'s ranking — its panel (the score in its bar, the counts of 300 / 100 / 50 / miss, the max combo and the
      // accuracy under their labels), the title, the grade, the full combo's stamp, a new best. Laid out to fit a 4:3 screen
      // (±110 model units), not anchored: the score and the accuracy fly in from the HUD (anchored right: screen.dx)
      const RL = -110, PT = TOP - 22, PH = 112, PW = r4(P ? 137.9 : size['ranking-panel'][0]), PB = PT - PH;
      bones.push({ name: 'res', parent: H, pivot: [0, 140, 0] }); elements.res = { type: 'image' };
      if (P) {
        bones.push(plane('respanel', 'res', [RL + PW / 2, PT - PH / 2], [PW, PH], [A.at.resboard.x, A.at.resboard.y, A.at.resboard.w, A.at.resboard.h], Z.panel)); imageEl('respanel', null, 'blend');
        // (its frame: a tray as the playfield's board — walls, a lip, corner posts — standing out of the panel)
        bones.push({ name: 'respanel_frame', parent: 'respanel', pivot: [r4(RL + PW / 2), r4(PT - PH / 2), Z.panel], cubes: trayCubes([RL + PW / 2, PT - PH / 2], PW, PH, Z.panel - 4, A.at.barback, { out: 1.6 }) });
      } else flat('respanel', 'ranking-panel', 'res', [RL + PW / 2, PT - PH / 2], Z.panel, [PW, PH]);
      if (P) vox('restitle', 'restitle', 'res', [110 - (size.sprites.restitle.width * 1.6) / 2, TOP - 10], Z.res, 1.4, { px: 1.6 });
      else flat('restitle', 'ranking-title', 'res', [110 - size['ranking-title'][0] / 2, TOP - 10], Z.res, size['ranking-title']);
      // (a number in the results: digits right-aligned, the last at x0; 10 numerals a digit — a number element: no render
      //  controller. The pixel look's numerals blocks of letters on their shadow, as the HUD's: each a model of its own)
      const dig = P ? { w: 3 * 1.7 * 1.25, plane: (nm, par, at, z, d) => modelBone(nm, par, at, cellOf(`num${d}`), 1.7, z, size.models[`num${d}`]) }
        : { w: size.score[0] * 0.85 * 0.95, plane: (nm, par, at, z, d) => { const a = cellOf('scoredigits', d), at2 = A.at.scoredigits; return plane(nm, par, at, [size.score[0] * 0.85, size.score[1] * 0.85], [a[0], a[1], at2.w, at2.h], z); } };
      const numberEl = (name, [x0, y0], n, xParent) => {
        bones.push({ name, parent: 'res', pivot: [r4(x0), r4(y0), Z.res] });
        const digits = Array.from({ length: n }, (_, k) => Array.from({ length: 10 }, (_, d) => { const b = dig.plane(`${name}_d${k}_${d}`, name, [x0 + (k - (n - 1)) * dig.w, y0], Z.res - (k * 10 + d) * 0.021, d); bones.push(b); return b.name; }));
        elements[name] = { type: 'number', number: { source: '0', digits, hideLeadingZero: true } };
        // (its x: osu!'s "123x" — on its label's bone: a number element's own children are its numerals)
        const xs = P ? 1.7 : 0.85, xw = P ? 3 * xs : size.x[0] * xs, xat = [x0 + dig.w * 0.5 + xw * 0.6, y0 - (P ? xs * 0.5 : 0)];
        if (P) bones.push(modelBone(`${name}_x`, xParent, xat, cellOf('x'), xs, Z.res - 0.3, size.models.x));
        else bones.push(plane(`${name}_x`, xParent, xat, [xw, size.x[1] * xs], [A.at.x.x, A.at.x.y, A.at.x.w, A.at.x.h], Z.res - 0.3));
      };
      const nd = String(G.objects.length).length, top = T.osugame.createGame(G).start(0).fastForward(lastEnd + 100).state();
      // (the counts: 300 and 100 in the left column, 50 and miss in the right; each its judgement's picture)
      const cols = [RL + 16, RL + 72], rows = [PT - 44, PT - 63];
      [['300', 0], ['100', 1], ['50', 2], ['miss', 3]].forEach(([n, k]) => {
        const at = [cols[k >> 1], rows[k & 1]], id = `res${n}`;
        if (P) vox(`${id}_icon`, ['j300', 'j100', 'j50', 'jx'][k], 'res', at, Z.res, 1.2, { px: 1.5 });
        else { const c = cellOf('judgement', k), jw = size.judgement[0] * 0.95, jh = size.judgement[1] * 0.95; bones.push(plane(`${id}_icon`, 'res', at, [jw, jh], [c[0], c[1], A.at.judgement.w, A.at.judgement.h], Z.res)); imageEl(`${id}_icon`); }
        numberEl(id, [at[0] + 14 + (nd - 1) * dig.w, at[1]], nd, `${id}_icon`);
      });
      // (the max combo and the accuracy at the panel's foot, under their labels)
      const lab = (name, id, at) => (P ? vox(name, id, 'res', at, Z.res, 1, { px: 1.0 }) : flat(name, id, 'res', at, Z.res, size[id]));
      lab('reslabelcombo', P ? 'maxcombo' : 'ranking-maxcombo', [RL + 30, PB + 23]);
      lab('reslabelacc', P ? 'accuracy' : 'ranking-accuracy', [RL + 100, PB + 23]);
      const nc = String(Math.max(1, top.maxcombo)).length;
      numberEl('resmaxcombo', [RL + 22 + (nc - 1) * dig.w, PB + 11], nc, 'reslabelcombo');
      // (the grade: osu!'s letters, silver with HD or FL)
      if (P) vox('resrank', 'rank', 'res', [72, 144], Z.grade, 3, { px: 8, perPixel: true }); else flat('resrank', 'rank', 'res', [72, 144], Z.grade, size.rank);
      // (a full combo: osu!'s "perfect"; a new best of this player's)
      if (P) vox('resfc', 'fc', 'res', [72, 98], Z.stamp, 1.4, { px: 1.6 }); else flat('resfc', 'ranking-perfect', 'res', [72, 98], Z.stamp, size['ranking-perfect']);
      if (P) vox('resrecord', 'record', 'res', [72, 195], Z.stamp, 1.2, { px: 1.3 }); else flat('resrecord', 'record', 'res', [72, 195], Z.stamp, size.record);
      Object.assign(L0, { R: { RL, PT, PH, PW, PB, scoreTo: [RL + PW - 9, PT - 10], scoreScale: P ? 1.25 : 1.3, accTo: [RL + PW - 10, PB + 11], accScale: P ? 1.6 : 1.25 }, top });
    }
    // (the pixel look's models: no two of them share a plane where they overlap)
    if (P) settleDepths(bones);
    // ---- the timeline and the game
    const L = Object.assign({ pixel: P, C, bpm, colours: colours.length, coinFrame: coinPairs ? Object.fromEntries(coinPairs.map((p, f) => [pairKey(p), f])) : null, kiai: G.kiai, breaks: G.breaks, duration, music: opts.music || 'music', bodyFrame, bodyCentre, width: FW, comboDigitW: P ? 2.6 * 4 : size.score[0] * 1.25 * 0.92, flR: FLR }, L0);
    const doc = docOf(map, G, L);
    // (the tour rides on the game's config: the script plays its scenes)
    const tour = tourOf(G);
    G.tour = tour.scenes;
    const md = map.metadata || {};
    const design = { settings: Object.assign({ ns, name: opts.title || `${md.Title || 'osu!'} (${P ? 'pixel' : 'skin'})`, description: opts.description || 'GeoUI timeline: osu! (bds-lab)', bp: true }, opts.settings || {}),
      seed: opts.seed || `osu-${skin}`, bones, elements, textures: { atlas: { name: 'atlas', width: A.width, height: A.height, image: A.image } } };
    // (what the game needs: sounds the script plays — the hitsounds each object names and the gameplay's own)
    const sounds = [...new Set(G.objects.flatMap((g) => [...(g.hs || []), ...(g.es || []).flat()]).concat(Object.values(G.sounds).filter(Boolean)))];
    const info = { title: md.Title || '', artist: md.Artist || '', version: md.Version || '', bpm, duration, difficulty: diff, colours, counts: { circles: G.objects.filter((g) => g.k === 'c').length, sliders: G.objects.filter((g) => g.k === 's').length, spinners: G.objects.filter((g) => g.k === 'p').length,
      ticks: doc.sequences[0].instances.filter((x) => x.template === 'osu-tick').length, followpoints: doc.sequences[0].instances.filter((x) => x.template === 'osu-follow').length } };
    return { design, doc, game: G, info, sounds, atlas: A, warnings, tour };
  }

  // (an osu! skin's files this uses: its @2x pictures by these names — a skin with only 1x pictures is read as they are, doubled —
  //  and the hitsounds; bds/geoui/osu/fetch-skin.mjs keeps the Legacy skin's, the plugin reads a .osk or fetches the Legacy skin)
  const SKIN_IMAGES = ['hitcircle', 'hitcircleoverlay', 'approachcircle', ...Array.from({ length: 10 }, (_, d) => `default-${d}`), 'hit0', 'hit50', 'hit100', 'hit300', ...Array.from({ length: 10 }, (_, d) => `sliderb${d}`),
    'sliderfollowcircle', 'reversearrow', 'sliderscorepoint', 'followpoint', 'spinner-circle', 'spinner-approachcircle', 'spinner-clear', 'spinner-spin', 'spinner-rpm', ...Array.from({ length: 10 }, (_, d) => `score-${d}`),
    'score-x', 'score-percent', 'score-dot', 'scorebar-bg', 'scorebar-colour', 'cursor', 'lighting', 'ranking-X-small', 'ranking-S-small', 'ranking-A-small', 'ranking-B-small', 'ranking-C-small', 'ranking-D-small', 'section-pass', 'section-fail'];
  // (what a skin may have besides: the results' panel, words and big grades, the fail's retry button — drawn here where it has none)
  const SKIN_EXTRA = ['ranking-panel', 'ranking-title', 'ranking-maxcombo', 'ranking-accuracy', 'ranking-perfect', 'ranking-X', 'ranking-XH', 'ranking-S', 'ranking-SH', 'ranking-A', 'ranking-B', 'ranking-C', 'ranking-D', 'pause-retry'];
  const SKIN_SOUNDS = ['normal-hitnormal', 'normal-hitwhistle', 'normal-hitfinish', 'normal-hitclap', 'soft-hitnormal', 'soft-hitwhistle', 'soft-hitfinish', 'soft-hitclap', 'drum-hitnormal', 'drum-hitwhistle', 'drum-hitfinish', 'drum-hitclap', 'normal-slidertick', 'spinnerbonus', 'combobreak', 'failsound', 'applause'];
  const LEGACY_SKIN = 'https://raw.githubusercontent.com/ppy/osu-resources/46d344264e5938e168cfbbd2c8fab5f572ebeda4/osu.Game.Resources/Skins/Legacy/';
  /** a skin's picture named n where its @2x is missing: the 1x one doubled (osukit reads @2x sizes) */
  const as2x = (im) => resize(im, im.width * 2, im.height * 2);

  T.osukit = { build, tourOf, pixelSprites, textImage, strokeText, voxel, plane, atlasOf, resize, img, FONT, SKIN_IMAGES, SKIN_EXTRA, SKIN_SOUNDS, LEGACY_SKIN, as2x };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osukit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
