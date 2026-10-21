#!/usr/bin/env node
// GeoUI calibration: where does a point of the player model really land on the screen of the real game?
// GeoUI Studio's answer is hand-made (the screen is 176 model units high, centred on y = 140, moved by a centre fix measured
// once on a PC and once on an iPhone). This measures it instead:
//   node bds/geoui/calib.mjs make [<folder>]        the calibration pack (markers at known model coordinates, on black) as
//                                                   <folder>/bp + rp (default: a temporary folder; then `node lab.mjs import`)
//   node bds/geoui/calib.mjs measure <png|dir>...   screenshots of it (the app lab's shots/*.png) → the mapping, per picture:
//                                                   units per screen height, the model point at the screen centre (Studio's
//                                                   centre fix), x vs y scale, how far a point off the plane moves (perspective)
//   node bds/geoui/calib.mjs synth <out.png> [--h 176 --cx 0 --cy -4.9 --w 1560 --hpx 720 --persp 0 --hud]
//                                                   a made-up screenshot with a known answer (what tests/geoui-builder-offline.mjs reads back)
// The pack is built by GeoUI Builder's own exporter (bds/geoui/geoui_builder.js) with every centre fix 0, so the markers
// sit where the HUD's live_player_renderer puts the raw model: nothing of Studio's formulas is in the picture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, decodePng } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export function core() {
  const mod = { exports: {} };
  new Function('module', fs.readFileSync(path.join(HERE, 'geoui_builder.js'), 'utf8'))(mod);
  return mod.exports;
}

// ---------------------------------------------------------------------------------------------------------------------
// The markers (model units, Bedrock geometry coordinates: x to the right of the screen, y up). A white grid every 40 units
// that never sits on the screen's centre (the crosshair) and runs well past where Studio thinks the screen ends; three
// coloured ones that tell the grid's axes apart; yellow ones nearer the camera and cyan ones farther (perspective or not).
// ---------------------------------------------------------------------------------------------------------------------
export const STEP = 40, SIZE = 3;
export const COLORS = { white: [255, 255, 255], red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0], cyan: [0, 255, 255], black: [0, 0, 0] };
const PALETTE = ['white', 'red', 'green', 'blue', 'yellow', 'cyan', 'black'];
export function markers() {
  const out = [];
  for (let i = -6; i < 6; i++) for (let j = 0; j <= 6; j++) {
    const x = (i + 0.5) * STEP, y = 20 + j * STEP;
    const color = x === 20 && y === 140 ? 'red' : x === 60 && y === 140 ? 'green' : x === 20 && y === 180 ? 'blue' : 'white';
    out.push({ id: `g_${i + 6}_${j}`, x, y, z: -1, color });
  }
  // (between the grid's columns and rows, near the centre: on the picture at every aspect)
  for (const [x, y] of [[-80, 120], [80, 120], [-40, 160], [40, 160]]) out.push({ id: `near_${x}_${y}`, x, y, z: -60, color: 'yellow' });
  for (const [x, y] of [[-80, 160], [80, 160], [-40, 120], [40, 120]]) out.push({ id: `far_${x}_${y}`, x, y, z: 60, color: 'cyan' });
  return out;
}

/** panel: the HUD's live_player_renderer frame ({ size: [w%, h%], offset: [x%, y%] }; Studio's 10% x 10%, 110% when not given);
 *  seed: a variant's own pack UUIDs (another frame is another pack: the game keeps packs by UUID) */
export function design(G, { ns = 'gcal', panel = null, seed = null } = {}) {
  const zero = { x: 0, y: 0 };
  const id = (k, fixed) => (seed ? G.uuidFrom(`${seed}:${k}`) : fixed);
  const settings = { ns, name: `GeoUI Calibration${panel ? ` (HUD ${panel.size.join('x')}% @ ${panel.offset[1]}%)` : ''}`, description: 'GeoUI の目盛り（本物のアプリで写して、画面とモデル座標の対応を測る）',
    centerFix: { desktop: zero, mobile: zero, console: zero }, hideInPaperdoll: true, bp: true, ...(panel ? { panel } : {}),
    uuids: { rp: id('rp', '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a01'), rpMod: id('rpMod', '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a02'), bp: id('bp', '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a03'),
      bpData: id('bpData', '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a04'), bpScript: id('bpScript', '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a05') } };
  const px = PALETTE.length, tex = new Uint8Array(px * 4);
  PALETTE.forEach((c, i) => { tex.set([...COLORS[c], 255], i * 4); });
  const uvOf = (c) => ({ uv: [PALETTE.indexOf(c) + 0.25, 0.25], uv_size: [0.5, 0.5], texture: 'pal' });
  const bones = [{ name: 'geo_ui', pivot: [0, 140, 0], cubes: [] }, { name: 'gcal_back', parent: 'geo_ui', pivot: [0, 140, 100], cubes: [{ origin: [-400, -40, 100], size: [800, 360, 0], faces: { north: uvOf('black') } }] }];
  const grp = { name: 'gcal_marks', parent: 'geo_ui', pivot: [0, 140, 0], cubes: [] };
  for (const m of markers()) grp.cubes.push({ origin: [m.x - SIZE / 2, m.y - SIZE / 2, m.z], size: [SIZE, SIZE, 0], faces: { north: uvOf(m.color) } });
  bones.push(grp);
  return { settings, bones, elements: {}, textures: { pal: { name: 'gcal_palette', width: px, height: 1, png: Buffer.from(encodePng({ width: px, height: 1, data: tex })).toString('base64') } }, seed: 'gcal' };
}

/** the calibration pack as two folders (bp, rp) under dir (opts: design's panel and seed) */
export function make(dir, G = core(), opts = {}) {
  const built = G.buildPack(design(G, opts));
  if (built.warnings.length) throw new Error(built.warnings.join('\n'));
  const ns = built.settings.ns;
  for (const [p, c] of Object.entries(built.files)) {
    const rel = p.startsWith(`${ns}_RP/`) ? path.join('rp', p.slice(ns.length + 4)) : path.join('bp', p.slice(ns.length + 4));
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, c && c.base64 !== undefined ? Buffer.from(c.base64, 'base64') : c);
  }
  return built;
}

// ---------------------------------------------------------------------------------------------------------------------
// A made-up screenshot: the markers drawn with a known mapping (and, with --hud, a hotbar, hearts, an XP bar and a crosshair
// in the colours the real HUD uses), to prove `measure` finds the answer it was given.
// ---------------------------------------------------------------------------------------------------------------------
export function synth({ h = 176, cx = 0, cy = 0, w = 1560, hpx = 720, persp = 0, hud = false, dim = 1 } = {}) {
  const img = new Uint8Array(w * hpx * 4);
  for (let i = 0; i < w * hpx; i++) img[i * 4 + 3] = 255;
  const k = hpx / h, Yc = 140 + cy;
  const toPx = (x, y, z) => { const f = persp ? 1 / (1 + z * persp) : 1; return [w / 2 + (x - cx) * k * f, hpx / 2 - (y - Yc) * k * f]; };
  const rect = (x0, y0, x1, y1, rgb) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(hpx, Math.round(y1)); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, Math.round(x1)); x++) img.set([...rgb.map((v) => Math.round(v * dim)), 255], (y * w + x) * 4);
  };
  for (const m of markers()) {
    const [a, b] = toPx(m.x - SIZE / 2, m.y + SIZE / 2, m.z), [c, d] = toPx(m.x + SIZE / 2, m.y - SIZE / 2, m.z);
    rect(a, b, c, d, COLORS[m.color]);
  }
  if (hud) {
    const s = hpx / 240;
    rect(w / 2 - 91 * s, hpx - 22 * s, w / 2 + 91 * s, hpx, [120, 120, 120]);
    for (let i = 0; i < 9; i++) rect(w / 2 - 91 * s + i * 20 * s + 3 * s, hpx - 19 * s, w / 2 - 91 * s + i * 20 * s + 17 * s, hpx - 3 * s, [200, 200, 200]);
    for (let i = 0; i < 10; i++) rect(w / 2 - 91 * s + i * 8 * s, hpx - 39 * s, w / 2 - 91 * s + i * 8 * s + 7 * s, hpx - 32 * s, [230, 20, 20]);
    rect(w / 2 - 91 * s, hpx - 29 * s, w / 2 + 91 * s, hpx - 24 * s, [80, 230, 40]);
    rect(w / 2 - 1, hpx / 2 - 8, w / 2 + 1, hpx / 2 + 8, [255, 255, 255]); rect(w / 2 - 8, hpx / 2 - 1, w / 2 + 8, hpx / 2 + 1, [255, 255, 255]);
  }
  return { width: w, height: hpx, data: img };
}

/**
 * a made-up screenshot handed over the way a phone or a chat app does: shrunk (box filter), colours shared by 2x2 pixels
 * (JPEG's 4:2:0) and a little noise — deterministic, so a test sees the same picture every time
 */
export function degrade(img, { scale = 1, chroma = false, noise = 0, seed = 1 } = {}) {
  let { width: W, height: Hh, data } = img;
  if (scale !== 1) {
    const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(Hh * scale)), out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xa = Math.floor(x / scale), xb = Math.max(xa + 1, Math.floor((x + 1) / scale)), ya = Math.floor(y / scale), yb = Math.max(ya + 1, Math.floor((y + 1) / scale));
      const acc = [0, 0, 0]; let n = 0;
      for (let yy = ya; yy < Math.min(yb, Hh); yy++) for (let xx = xa; xx < Math.min(xb, W); xx++) { const k = (yy * W + xx) * 4; acc[0] += data[k]; acc[1] += data[k + 1]; acc[2] += data[k + 2]; n++; }
      out.set([acc[0] / n, acc[1] / n, acc[2] / n, 255], (y * w + x) * 4);
    }
    W = w; Hh = h; data = out;
  } else data = Uint8Array.from(data);
  if (chroma) for (let y = 0; y + 1 < Hh; y += 2) for (let x = 0; x + 1 < W; x += 2) {
    const ks = [(y * W + x) * 4, (y * W + x + 1) * 4, ((y + 1) * W + x) * 4, ((y + 1) * W + x + 1) * 4];
    const yv = ks.map((k) => 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]);
    const cb = ks.reduce((s, k, i) => s + (data[k + 2] - yv[i]), 0) / 4, cr = ks.reduce((s, k, i) => s + (data[k] - yv[i]), 0) / 4;
    ks.forEach((k, i) => { const r = yv[i] + cr, b = yv[i] + cb, g = (yv[i] - 0.299 * r - 0.114 * b) / 0.587; data[k] = Math.max(0, Math.min(255, r)); data[k + 1] = Math.max(0, Math.min(255, g)); data[k + 2] = Math.max(0, Math.min(255, b)); });
  }
  if (noise) { let st = seed >>> 0 || 1; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
    for (let i = 0; i < W * Hh * 4; i += 4) for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, data[i + c] + rnd() * 2 * noise)); }
  return { width: W, height: Hh, data };
}

// ---------------------------------------------------------------------------------------------------------------------
// Measuring a screenshot
//
// What a real screenshot does to the markers: the game lights the board (everything dimmer than full colour), JPEG and
// resizing blur and bleed the colours, the centre fix moves the grid so any one marker may be off the picture, and the
// HUD, the touch controls and chat text add bright shapes of their own. So nothing below assumes a brightness, a colour
// threshold or that a given marker is visible: the grid is found by its shape (equally spaced squares of one size), then
// placed by whichever of its coloured markers are on the picture, and only then fitted.
// ---------------------------------------------------------------------------------------------------------------------
const valueAt = (d, i) => Math.max(d[i], d[i + 1], d[i + 2]);
/** the marker colour of a blob's mean (white = grey of any brightness), null when it is none of them */
export function colourOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
  if (mx < 1) return null;
  if (s < 0.3) return 'white';
  if (s < 0.45) return null;
  let hue;
  if (mx === r) hue = ((g - b) / (mx - mn)) * 60; else if (mx === g) hue = (2 + (b - r) / (mx - mn)) * 60; else hue = (4 + (r - g) / (mx - mn)) * 60;
  hue = (hue + 360) % 360;
  if (hue < 25 || hue >= 335) return 'red';
  if (hue >= 40 && hue < 80) return 'yellow';
  if (hue >= 90 && hue < 150) return 'green';
  if (hue >= 160 && hue < 200) return 'cyan';
  if (hue >= 210 && hue < 270) return 'blue';
  return null;
}
/**
 * bright connected shapes over the background: {color, n, x, y (centroid weighted by brightness above the background),
 * w, h, fill, rgb}. The threshold follows the picture: the background's median and its brightest marks.
 */
export function blobs(img) {
  const { width: W, height: Hh, data } = img, N = W * Hh, hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) hist[valueAt(data, i * 4)]++;
  let acc = 0, bg = 0, top = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= N / 2) { bg = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= Math.max(20, N * 0.0005)) { top = v; break; } }
  const T = Math.max(bg + 24, bg + 0.35 * (top - bg));
  const on = new Uint8Array(N), seen = new Uint8Array(N), out = [], stack = [];
  for (let i = 0; i < N; i++) on[i] = valueAt(data, i * 4) >= T ? 1 : 0;
  for (let i = 0; i < N; i++) {
    if (!on[i] || seen[i]) continue;
    let n = 0, sw = 0, sx = 0, sy = 0, sr = 0, sg = 0, sb = 0, x0 = W, x1 = 0, y0 = Hh, y1 = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % W, y = (j - x) / W, k = j * 4, wt = valueAt(data, k) - bg;
      n++; sw += wt; sx += (x + 0.5) * wt; sy += (y + 0.5) * wt; sr += data[k]; sg += data[k + 1]; sb += data[k + 2];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const q of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < Hh - 1 ? j + W : -1]) if (q >= 0 && on[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, rgb = [sr / n, sg / n, sb / n];
    out.push({ color: colourOf(...rgb), n, x: sx / sw, y: sy / sw, w, h, fill: n / (w * h), rgb });
  }
  return out;
}
/** least squares y = a*x + b over pairs */
function line(pts) {
  const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
  const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const a = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - a * sx) / n;
  return { a, b, rms: Math.sqrt(pts.reduce((s, p) => s + (p[1] - a * p[0] - b) ** 2, 0) / n) };
}
const GRID = () => markers().filter((m) => m.z === -1);
/** the grid's column and row of a model point (i: x = (i + 0.5) STEP, j: y = 20 + j STEP) */
const cellOf = (m) => [Math.round(m.x / STEP - 0.5), Math.round((m.y - 20) / STEP)];
/** the coloured grid markers: each fixes where the grid is on its own */
const ANCHORS = () => GRID().filter((m) => m.color !== 'white');
/**
 * the picture's lattice of equally spaced squares of one size: {sx, sy, x0, y0, cells: Map("u,v" → blob)}, u to the right
 * and v down in pixels, (0, 0) at blob x0/y0 — found from pairs of neighbouring squares, scored by how many squares sit on it
 */
function lattice(S) {
  const similar = (a, b) => b.n >= a.n / 2.5 && b.n <= a.n * 2.5;
  const hyps = [];
  for (const a of S) {
    const nb = S.filter((b) => b !== a && similar(a, b)).map((b) => ({ b, dx: b.x - a.x, dy: b.y - a.y, d: Math.hypot(b.x - a.x, b.y - a.y) })).sort((p, q) => p.d - q.d).slice(0, 8);
    const hz = nb.find((q) => Math.abs(q.dy) < 0.12 * Math.abs(q.dx)), vt = nb.find((q) => Math.abs(q.dx) < 0.12 * Math.abs(q.dy));
    if (hz && vt) hyps.push({ a, sx: Math.abs(hz.dx), sy: Math.abs(vt.dy) });
    else if (hz) hyps.push({ a, sx: Math.abs(hz.dx), sy: Math.abs(hz.dx) });
    else if (vt) hyps.push({ a, sx: Math.abs(vt.dy), sy: Math.abs(vt.dy) });
  }
  const fit = (h, tol = 0.15) => {
    const cells = new Map();
    for (const b of S) {
      if (!similar(h.a, b)) continue;
      const u = (b.x - h.x0) / h.sx, v = (b.y - h.y0) / h.sy, iu = Math.round(u), iv = Math.round(v);
      if (Math.abs(u - iu) > tol || Math.abs(v - iv) > tol) continue;
      const key = `${iu},${iv}`, prev = cells.get(key);
      const err = Math.hypot(u - iu, v - iv);
      if (!prev || prev.err > err) cells.set(key, { b, iu, iv, err });
    }
    return cells;
  };
  // a row of equal squares (the hotbar's slots, the hearts) is a lattice too, but only along one axis: the grid has rows
  // and columns, so a lattice counts by the squares it holds only when they span at least two of each
  const score = (cells) => {
    const c = [...cells.values()], us = new Set(c.map((q) => q.iu)), vs = new Set(c.map((q) => q.iv));
    return us.size >= 2 && vs.size >= 2 ? c.length : c.length / 4;
  };
  const found = [];
  for (const h0 of hyps) {
    if (h0.sx < 4 || h0.sy < 4 || h0.sx / h0.sy > 2 || h0.sy / h0.sx > 2) continue;
    let h = { ...h0, x0: h0.a.x, y0: h0.a.y }, cells = fit(h);
    if (found.some((f) => f.cells.has(`${Math.round((h.a.x - f.x0) / f.sx)},${Math.round((h.a.y - f.y0) / f.sy)}`) && Math.abs(f.sx / h.sx - 1) < 0.08 && Math.abs(f.sy / h.sy - 1) < 0.08)) continue;
    // refine the spacing and the origin over the squares on it, then take them again
    for (let r = 0; r < 2 && cells.size >= 4; r++) {
      const c = [...cells.values()], lx = line(c.map((q) => [q.iu, q.b.x])), ly = line(c.map((q) => [q.iv, q.b.y]));
      const nh = { a: h.a, sx: Number.isFinite(lx.a) && lx.a > 1 ? lx.a : h.sx, sy: Number.isFinite(ly.a) && ly.a > 1 ? ly.a : h.sy, x0: Number.isFinite(lx.b) ? lx.b : h.x0, y0: Number.isFinite(ly.b) ? ly.b : h.y0 };
      const nc = fit(nh, 0.12);
      if (nc.size < cells.size) break;
      h = nh; cells = nc;
    }
    found.push({ ...h, cells, score: score(cells) });
  }
  // each with its coarser versions: which of them is the grid is decided by where the coloured squares land (measure)
  return found.sort((p, q) => q.score - p.score).slice(0, 12).flatMap((f) => { const c = coarsest(f); return c === f ? [f] : [f, c]; });
}
function coarsest(best) {
  // a lattice twice as fine also holds every square of the true one (and stray ones between): take the coarsest that keeps
  // nearly all of them — 2x along x, y or both, at whichever parity holds the most
  for (let more = true, round = 0; more && round < 4; round++) {
    more = false;
    let pick = null;
    const c0 = [...best.cells.values()], spanU = new Set(c0.map((c) => c.iu)).size > 1, spanV = new Set(c0.map((c) => c.iv)).size > 1;
    for (const [kx, ky] of [[2, 2], [2, 1], [1, 2]]) for (let px = 0; px < kx; px++) for (let py = 0; py < ky; py++) {
      // (along an axis with one row or column there is nothing to coarsen)
      if ((kx > 1 && !spanU) || (ky > 1 && !spanV)) continue;
      const keep = [...best.cells.values()].filter((c) => ((c.iu - px) % kx + kx) % kx === 0 && ((c.iv - py) % ky + ky) % ky === 0);
      if (keep.length >= 6 && keep.length >= 0.6 * best.cells.size && (!pick || keep.length > pick.keep.length)) pick = { kx, ky, px, py, keep };
    }
    if (pick) {
      const cells = new Map(pick.keep.map((c) => { const iu = (c.iu - pick.px) / pick.kx, iv = (c.iv - pick.py) / pick.ky; return [`${iu},${iv}`, { ...c, iu, iv }]; }));
      best = { ...best, sx: best.sx * pick.kx, sy: best.sy * pick.ky, x0: best.x0 + pick.px * best.sx, y0: best.y0 + pick.py * best.sy, cells };
      more = true;
    }
  }
  return best;
}
/**
 * one screenshot → { ok, why, unitsPerScreenH, unitsPerScreenHFromX, centre: {x, y}, centreFix: {x, y} (Studio's fractions),
 *   pxPerUnit: {x, y}, matched, rmsPx, anchors (the coloured markers that placed the grid), depth: {near, far} (how much
 *   farther from the centre a point 60 units nearer / farther lands than the grid's mapping says: 1 = no perspective) }
 */
export function measure(img) {
  const Hh = img.height;
  const all = blobs(img), S = all.filter((b) => b.n >= 3 && b.fill > 0.45 && b.w / b.h < 2.2 && b.h / b.w < 2.2);
  if (S.length < 6) return { ok: false, why: `only ${S.length} square marks on the picture` };
  // (the yellow and cyan markers sit off the grid on purpose, between its rows and columns)
  const cands = lattice(S.filter((b) => b.color !== 'yellow' && b.color !== 'cyan')).filter((L) => L.cells.size >= 6);
  if (!cands.length) return { ok: false, why: 'no grid of equally spaced squares on the picture' };
  // each lattice (the grid, or rows of text and HUD pieces that happen to be evenly spaced) is placed by its coloured
  // squares; the one whose squares then hold the grid's own colours best is the grid
  let pick = null;
  for (const L of cands) {
    const p = place(L);
    if (p && (!pick || p.score > pick.p.score)) pick = { L, p };
  }
  if (!pick) return { ok: false, why: 'none of the red, green or blue markers is on the grid in the picture', unitsPerScreenH: Hh / (cands[0].sy / STEP) };
  const L = pick.L, pl = pick.p;
  const pairs = [];
  for (const m of GRID()) {
    const [i, j] = cellOf(m), c = L.cells.get(`${i + pl.ou},${pl.ov - j}`);
    if (c && (c.b.color === m.color || (m.color === 'white' && c.b.color === null))) pairs.push({ m, b: c.b });
  }
  if (pairs.length < 6) return { ok: false, why: `only ${pairs.length} grid markers in their own colour`, unitsPerScreenH: Hh / (L.sy / STEP) };
  // with fewer than three columns or rows on the picture a lattice of the wrong spacing fits as well as the right one:
  // say so rather than give a number (a phone held upright shows two columns — the game is played across)
  const cols = new Set(pairs.map(({ m }) => m.x)).size, rows = new Set(pairs.map(({ m }) => m.y)).size;
  if (cols < 3 || rows < 3 || pairs.length < 9) return { ok: false, why: `only ${pairs.length} grid markers in ${cols} columns and ${rows} rows on the picture (9 in 3 of each are needed: hold the screen across)` };
  return fitGrid(img, all, pairs, pl);
}
/** where the grid's (0, 0) cell is on lattice L (x to the right, y up — the HUD's way), by its coloured squares */
function place(L) {
  const cells = [...L.cells.values()], votes = new Map();
  for (const m of ANCHORS()) {
    const [i, j] = cellOf(m);
    for (const c of cells) if (c.b.color === m.color) {
      const key = `${c.iu - i},${c.iv + j}`;
      votes.set(key, (votes.get(key) || 0) + 1);
    }
  }
  if (!votes.size) return null;
  // the placement whose cells hold the expected colours best (a stray red pixel cluster cannot win against the grid's own)
  let place = null;
  for (const key of votes.keys()) {
    const [ou, ov] = key.split(',').map(Number);
    let agree = 0, seen = 0;
    for (const m of GRID()) {
      const [i, j] = cellOf(m), c = L.cells.get(`${i + ou},${ov - j}`);
      if (!c) continue;
      seen++; if (c.b.color === m.color) agree++;
    }
    const score = agree - (seen - agree) * 2;
    if (!place || score > place.score) place = { ou, ov, agree, seen, score };
  }
  return place;
}
function fitGrid(img, all, pairs, place) {
  const W = img.width, Hh = img.height, d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  // (shapes the HUD or text put on a lattice point are dropped as outliers: fit, drop the far ones, fit again)
  let fx, fy, used = pairs;
  for (let r = 0; r < 4; r++) {
    fx = line(used.map(({ m, b }) => [m.x, b.x])); fy = line(used.map(({ m, b }) => [m.y, b.y]));
    const res = used.map(({ m, b }) => Math.hypot(b.x - fx.a * m.x - fx.b, b.y - fy.a * m.y - fy.b)), med = [...res].sort((p, q) => p - q)[res.length >> 1];
    const keep = used.filter((_, i) => res[i] <= Math.max(1.5, 3 * med));
    if (keep.length === used.length || keep.length < 6) break;
    used = keep;
  }
  const skew = { xFromY: line(used.map(({ m, b }) => [m.y, b.x - fx.a * m.x - fx.b])).a, yFromX: line(used.map(({ m, b }) => [m.x, b.y - fy.a * m.y - fy.b])).a };
  // the markers are SIZE units wide on a STEP grid: squares much bigger than that against their spacing are not them
  // (letters of a chat line spaced like a grid are as wide as half their spacing)
  const side = [...used.map(({ b }) => Math.sqrt(b.n))].sort((p, q) => p - q)[used.length >> 1], ratio = side / (Math.abs(fy.a) * STEP);
  if (ratio < 0.4 * SIZE / STEP || ratio > 3 * SIZE / STEP) return { ok: false, why: `the squares found are ${(ratio * STEP).toFixed(1)} units wide, not ${SIZE}: not the grid (text or HUD pieces)` };
  const cxm = (W / 2 - fx.b) / fx.a, cym = (Hh / 2 - fy.b) / fy.a, upsh = Hh / Math.abs(fy.a);
  const tol = 0.3 * STEP * Math.min(Math.abs(fx.a), Math.abs(fy.a));
  // points off the grid's plane: where the grid's mapping puts them vs where they are, as one scale about some centre
  // (s = 1: no perspective; nearer points drawn bigger: s > 1) — the centre is fitted too, the camera's axis is not assumed
  const depthOf = (color) => {
    const pr = [];
    for (const m of markers().filter((q) => q.color === color)) {
      const pred = [fx.a * m.x + fx.b, fy.a * m.y + fy.b];
      const b = all.filter((q) => q.color === color && q.n >= 3).sort((p, q) => d2([p.x, p.y], pred) - d2([q.x, q.y], pred))[0];
      if (b && Math.sqrt(d2([b.x, b.y], pred)) < tol * 2) pr.push([pred, [b.x, b.y]]);
    }
    if (pr.length < 3) return null;
    const pm = [0, 1].map((i) => pr.reduce((s, q) => s + q[0][i], 0) / pr.length), om = [0, 1].map((i) => pr.reduce((s, q) => s + q[1][i], 0) / pr.length);
    const num_ = pr.reduce((s, [p, o]) => s + (p[0] - pm[0]) * (o[0] - om[0]) + (p[1] - pm[1]) * (o[1] - om[1]), 0), den = pr.reduce((s, [p]) => s + (p[0] - pm[0]) ** 2 + (p[1] - pm[1]) ** 2, 0);
    return { n: pr.length, ratio: num_ / den };
  };
  return {
    ok: true, width: W, height: Hh, aspect: W / Hh, matched: used.length, dropped: pairs.length - used.length,
    anchors: place.agree, colourAgreement: place.seen ? place.agree / place.seen : 0,
    pxPerUnit: { x: fx.a, y: -fy.a }, rmsPx: Math.hypot(fx.rms, fy.rms),
    unitsPerScreenH: upsh, unitsPerScreenHFromX: (W / Math.abs(fx.a)) / (W / Hh),
    centre: { x: cxm, y: cym }, centreFix: { x: cxm / upsh, y: (cym - 140) / upsh },
    skew, depth: { near: depthOf('yellow'), far: depthOf('cyan') },
  };
}
const round = (v, n = 4) => (typeof v === 'number' ? Math.round(v * 10 ** n) / 10 ** n : v);
export function describe(name, r) {
  if (!r.ok) return `${name}: ✘ ${r.why}`;
  const d = (o) => (o ? `${round(o.ratio, 4)}（${o.n}）` : '—');
  return `${name}: ${r.width}x${r.height}（${round(r.aspect, 4)}）目盛り ${r.matched} 個${r.dropped ? `（外れ ${r.dropped} 個を除く）` : ''}・ずれ ${round(r.rmsPx, 2)} px\n`
    + `  画面の高さ = ${round(r.unitsPerScreenH, 3)} 単位（横から ${round(r.unitsPerScreenHFromX, 3)}）・画面の中心 = (${round(r.centre.x, 3)}, ${round(r.centre.y, 3)})\n`
    + `  Studio の中心のずれ（割合）x ${round(r.centreFix.x, 5)} / y ${round(r.centreFix.y, 5)}・1 単位 = ${round(r.pxPerUnit.x, 4)} x ${round(r.pxPerUnit.y, 4)} px\n`
    + `  奥行き（1 = 遠近なし）: 60 手前 ${d(r.depth.near)} / 60 奥 ${d(r.depth.far)}・傾き ${round(r.skew.xFromY, 5)} / ${round(r.skew.yFromX, 5)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, ...rest] = process.argv.slice(2), opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
  if (cmd === 'make') {
    const dir = rest[0] && !rest[0].startsWith('--') ? path.resolve(rest[0]) : fs.mkdtempSync(path.join(os.tmpdir(), 'geoui-calib-'));
    // --panel 20x20@105: another HUD frame (size w x h %, top at y % of the screen), --seed: its own pack UUIDs
    const pm = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)@(-?\d+(?:\.\d+)?)$/.exec(opt('panel', '') || '');
    if (opt('panel') && !pm) { console.log('--panel <w>x<h>@<y> (e.g. 20x20@105: 20 % x 20 % of the screen, its top 105 % down from the top)'); process.exit(1); }
    const built = make(dir, core(), { panel: pm ? { size: [+pm[1], +pm[2]], offset: [0, +pm[3]] } : null, seed: opt('seed', null) });
    console.log(`OK ${dir} (bp + rp: ${Object.keys(built.files).length} files, ${markers().length} markers)\n${built.report.join('\n')}`);
  } else if (cmd === 'measure') {
    const files = rest.flatMap((p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(p, f)) : [p]));
    const all = [];
    for (const f of files) { const r = measure(decodePng(fs.readFileSync(f))); all.push({ file: path.basename(f), ...r }); console.log(describe(path.basename(f), r)); }
    if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(all, null, 1));
    process.exit(all.some((r) => r.ok) ? 0 : 1);
  } else if (cmd === 'synth') {
    const img = synth({ h: +opt('h', 176), cx: +opt('cx', 0), cy: +opt('cy', 0), w: +opt('w', 1560), hpx: +opt('hpx', 720), persp: +opt('persp', 0), hud: rest.includes('--hud') });
    fs.writeFileSync(rest[0], encodePng(img));
    console.log(`OK ${rest[0]}`);
  } else {
    console.log('usage: node bds/geoui/calib.mjs make [<folder>] [--panel 20x20@105 --seed <name>] | measure <png|dir>... [--json out.json] | synth <out.png> [--h 176 --cx 0 --cy 0 --w 1560 --hpx 720 --persp 0 --hud]');
    process.exit(cmd ? 1 : 0);
  }
}
