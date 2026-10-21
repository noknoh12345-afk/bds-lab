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

export function design(G, { ns = 'gcal' } = {}) {
  const zero = { x: 0, y: 0 };
  const settings = { ns, name: 'GeoUI Calibration', description: 'GeoUI の目盛り（本物のアプリで写して、画面とモデル座標の対応を測る）',
    centerFix: { desktop: zero, mobile: zero, console: zero }, hideInPaperdoll: true, bp: true,
    uuids: { rp: '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a01', rpMod: '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a02', bp: '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a03',
      bpData: '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a04', bpScript: '0f3c6a7e-2b1d-4c55-9a61-6f1a2c0c4a05' } };
  const px = PALETTE.length, tex = new Uint8Array(px * 4);
  PALETTE.forEach((c, i) => { tex.set([...COLORS[c], 255], i * 4); });
  const uvOf = (c) => ({ uv: [PALETTE.indexOf(c) + 0.25, 0.25], uv_size: [0.5, 0.5], texture: 'pal' });
  const bones = [{ name: 'geo_ui', pivot: [0, 140, 0], cubes: [] }, { name: 'gcal_back', parent: 'geo_ui', pivot: [0, 140, 100], cubes: [{ origin: [-400, -40, 100], size: [800, 360, 0], faces: { north: uvOf('black') } }] }];
  const grp = { name: 'gcal_marks', parent: 'geo_ui', pivot: [0, 140, 0], cubes: [] };
  for (const m of markers()) grp.cubes.push({ origin: [m.x - SIZE / 2, m.y - SIZE / 2, m.z], size: [SIZE, SIZE, 0], faces: { north: uvOf(m.color) } });
  bones.push(grp);
  return { settings, bones, elements: {}, textures: { pal: { name: 'gcal_palette', width: px, height: 1, png: Buffer.from(encodePng({ width: px, height: 1, data: tex })).toString('base64') } }, seed: 'gcal' };
}

/** the calibration pack as two folders (bp, rp) under dir */
export function make(dir, G = core()) {
  const built = G.buildPack(design(G));
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

// ---------------------------------------------------------------------------------------------------------------------
// Measuring a screenshot
// ---------------------------------------------------------------------------------------------------------------------
function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (v < 0.3) return null;
  if (s < 0.22) return v > 0.55 ? 'white' : null;
  if (s < 0.55) return null;
  let hue;
  if (mx === r) hue = ((g - b) / (mx - mn)) * 60; else if (mx === g) hue = (2 + (b - r) / (mx - mn)) * 60; else hue = (4 + (r - g) / (mx - mn)) * 60;
  hue = (hue + 360) % 360;
  if (hue < 20 || hue >= 340) return 'red';
  if (hue >= 45 && hue < 75) return 'yellow';
  if (hue >= 95 && hue < 145) return 'green';
  if (hue >= 165 && hue < 195) return 'cyan';
  if (hue >= 215 && hue < 265) return 'blue';
  return null;
}
/** connected blobs of each colour: {color, n, x, y (centroid), w, h, fill} */
export function blobs(img) {
  const { width: W, height: Hh, data } = img, cls = new Array(W * Hh), seen = new Uint8Array(W * Hh), out = [];
  for (let i = 0; i < W * Hh; i++) cls[i] = classify(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const stack = [];
  for (let i = 0; i < W * Hh; i++) {
    if (!cls[i] || seen[i]) continue;
    const c = cls[i]; let n = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = Hh, y1 = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % W, y = (j - x) / W;
      n++; sx += x + 0.5; sy += y + 0.5; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < Hh - 1 ? j + W : -1]) if (k >= 0 && !seen[k] && cls[k] === c) { seen[k] = 1; stack.push(k); }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    out.push({ color: c, n, x: sx / n, y: sy / n, w, h, fill: n / (w * h) });
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
/**
 * one screenshot → { ok, why, unitsPerScreenH, unitsPerScreenHFromX, centre: {x, y}, centreFix: {x, y} (Studio's fractions),
 *   pxPerUnit: {x, y}, matched, rmsPx, depth: {near, far} (how much farther from the centre a point 60 units nearer / farther
 *   lands than the grid's mapping says: 1 = no perspective) }
 */
export function measure(img) {
  const B = blobs(img).filter((b) => b.n >= 4 && b.fill > 0.55 && b.w / b.h < 2.5 && b.h / b.w < 2.5);
  const W = img.width, Hh = img.height, ctr = [W / 2, Hh / 2], d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const nearest = (color, to, not = []) => B.filter((b) => b.color === color && !not.includes(b)).sort((p, q) => d2([p.x, p.y], to) - d2([q.x, q.y], to))[0];
  const red = nearest('red', ctr);
  if (!red) return { ok: false, why: 'the red marker (20, 140) is not on the picture' };
  const green = nearest('green', [red.x, red.y]), blue = nearest('blue', [red.x, red.y]);
  if (!green || !blue) return { ok: false, why: 'the green (60, 140) or blue (20, 180) marker is not on the picture' };
  // coarse affine from the three: 40 units along x and y
  const ex = [(green.x - red.x) / STEP, (green.y - red.y) / STEP], ey = [(blue.x - red.x) / STEP, (blue.y - red.y) / STEP];
  const guess = (x, y) => [red.x + ex[0] * (x - 20) + ey[0] * (y - 140), red.y + ex[1] * (x - 20) + ey[1] * (y - 140)];
  const tol = 0.3 * STEP * Math.min(Math.hypot(...ex), Math.hypot(...ey));
  const grid = markers().filter((m) => m.z === -1), pairs = [];
  for (const m of grid) {
    const g = guess(m.x, m.y), b = nearest(m.color, g);
    if (b && Math.sqrt(d2([b.x, b.y], g)) < tol) pairs.push({ m, b });
  }
  if (pairs.length < 6) return { ok: false, why: `only ${pairs.length} grid markers found` };
  // (HUD pieces in the grid's colours — the hotbar's slots are white — are dropped as outliers: fit, drop the far ones, fit again)
  let fx, fy, used = pairs;
  for (let round = 0; round < 4; round++) {
    fx = line(used.map(({ m, b }) => [m.x, b.x])); fy = line(used.map(({ m, b }) => [m.y, b.y]));
    const res = used.map(({ m, b }) => Math.hypot(b.x - fx.a * m.x - fx.b, b.y - fy.a * m.y - fy.b)), med = [...res].sort((p, q) => p - q)[res.length >> 1];
    const keep = used.filter((_, i) => res[i] <= Math.max(1.5, 3 * med));
    if (keep.length === used.length || keep.length < 6) break;
    used = keep;
  }
  const skew = { xFromY: line(used.map(({ m, b }) => [m.y, b.x - fx.a * m.x - fx.b])).a, yFromX: line(used.map(({ m, b }) => [m.x, b.y - fy.a * m.y - fy.b])).a };
  const cxm = (W / 2 - fx.b) / fx.a, cym = (Hh / 2 - fy.b) / fy.a, upsh = Hh / Math.abs(fy.a);
  // points off the grid's plane: where the grid's mapping puts them vs where they are, as one scale about some centre
  // (s = 1: no perspective; nearer points drawn bigger: s > 1) — the centre is fitted too, the camera's axis is not assumed
  const depthOf = (color) => {
    const pr = [];
    for (const m of markers().filter((q) => q.color === color)) {
      const pred = [fx.a * m.x + fx.b, fy.a * m.y + fy.b], b = nearest(color, pred);
      if (b && Math.sqrt(d2([b.x, b.y], pred)) < tol * 2) pr.push([pred, [b.x, b.y]]);
    }
    if (pr.length < 3) return null;
    const pm = [0, 1].map((i) => pr.reduce((s, q) => s + q[0][i], 0) / pr.length), om = [0, 1].map((i) => pr.reduce((s, q) => s + q[1][i], 0) / pr.length);
    const num_ = pr.reduce((s, [p, o]) => s + (p[0] - pm[0]) * (o[0] - om[0]) + (p[1] - pm[1]) * (o[1] - om[1]), 0), den = pr.reduce((s, [p]) => s + (p[0] - pm[0]) ** 2 + (p[1] - pm[1]) ** 2, 0);
    return { n: pr.length, ratio: num_ / den };
  };
  return {
    ok: true, width: W, height: Hh, aspect: W / Hh, matched: used.length, dropped: pairs.length - used.length,
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
    const built = make(dir);
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
    console.log('usage: node bds/geoui/calib.mjs make [<folder>] | measure <png|dir>... [--json out.json] | synth <out.png> [--h 176 --cx 0 --cy 0 --w 1560 --hpx 720 --persp 0 --hud]');
    process.exit(cmd ? 1 : 0);
  }
}
