// The match HUD as GeoUI (bds/geoui: a live_player_renderer on the HUD draws planes added to minecraft:player).
// Layout follows the original's information (wave, timer and base health at the top, boss bar, cash at the top right,
// mode and enemy count at the top left, the tower bar at the bottom, banners in the middle); the art is original pixel art
// drawn here. Values come from player properties (tdsui:*) that src/hud.ts sets. Run: node tools/hud.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { encodePng } from '../../../geoui/png.mjs';
const require = createRequire(import.meta.url);
const C = require('../../../geoui/geoui_builder.js');
const HERE = path.dirname(new URL(import.meta.url).pathname), ADDON = path.resolve(HERE, '..');
const NS = 'tdsui';

// ---------- atlas (256 x 256, drawn pixel by pixel) ----------
const W = 256, H = 256, px = new Uint8Array(W * H * 4);
const set = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; const a = (c[3] ?? 255) / 255, b = px[i + 3] / 255, o = a + b * (1 - a); if (!o) return; for (let k = 0; k < 3; k++) px[i + k] = Math.round((c[k] * a + px[i + k] * b * (1 - a)) / o); px[i + 3] = Math.round(o * 255); };
const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
const round = (x, y, w, h, r, fill, border, bw = 1) => {
  const inside = (i, j, rr) => { const cx = i < rr ? rr : i >= w - rr ? w - rr - 1 : i, cy = j < rr ? rr : j >= h - rr ? h - rr - 1 : j; return Math.hypot(i - cx, j - cy) <= rr + 0.25; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (!inside(i, j, r)) continue; const edge = border && (i < bw || j < bw || i >= w - bw || j >= h - bw || !inside(i, j, Math.max(0, r - bw)) && (i < r || i >= w - r) && (j < r || j >= h - r)); set(x + i, y + j, edge ? border : fill); }
};
const disc = (cx, cy, r, c) => { for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) if (Math.hypot(i, j) <= r) set(cx + i, cy + j, c); };
const ring = (cx, cy, r, t, c) => { for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) { const d = Math.hypot(i, j); if (d <= r && d > r - t) set(cx + i, cy + j, c); } };
const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let k = 0; k <= n; k++) set(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), c); };
// a 5x7 pixel font of our own
const F = {
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'], B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '], C: [' ####', '#    ', '#    ', '#    ', '#    ', '#    ', ' ####'],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '], E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'], F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'], I: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####'], K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'], M: ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'], N: ['#   #', '##  #', '# # #', '#  ##', '#   #', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '], P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '], R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '], T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '], U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '], W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'], X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '], G: [' ####', '#    ', '#    ', '# ###', '#   #', '#   #', ' ### '],
  1: ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '], 2: [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'], 3: ['#### ', '    #', '    #', ' ### ', '    #', '    #', '#### '],
  4: ['#   #', '#   #', '#   #', '#####', '    #', '    #', '    #'], 5: ['#####', '#    ', '#    ', '#### ', '    #', '    #', '#### '],
  '/': ['    #', '   # ', '   # ', '  #  ', ' #   ', ' #   ', '#    '], '?': [' ### ', '#   #', '    #', '   # ', '  #  ', '     ', '  #  '], '!': ['  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '     ', '  #  '],
  $: [' ### ', '# # #', '# #  ', ' ### ', '  # #', '# # #', ' ### '], ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
};
const textW = (s, k = 1) => s.length * 6 * k - k;
const text = (s, x, y, k, c, shadow) => { [...s].forEach((ch, n) => { const g = F[ch] ?? F[' ']; g.forEach((row, j) => [...row].forEach((v, i) => { if (v !== '#') return; if (shadow) rect(x + (n * 6 + i) * k + k, y + j * k + k, k, k, shadow); rect(x + (n * 6 + i) * k, y + j * k, k, k, c); })); }); };

const R = {};   // atlas regions [u, v, w, h]
const at = (name, u, v, w, h, draw) => { R[name] = [u, v, w, h]; draw(u, v); };
// icons (16 x 16)
at('heart', 0, 0, 16, 16, (u, v) => { disc(u + 5, v + 6, 3.6, [220, 50, 70]); disc(u + 10, v + 6, 3.6, [220, 50, 70]); for (let j = 0; j < 7; j++) rect(u + 2 + j, v + 8 + j, 12 - 2 * j, 1, [220, 50, 70]); set(u + 4, v + 4, [255, 170, 180]); set(u + 5, v + 4, [255, 170, 180]); });
at('clock', 16, 0, 16, 16, (u, v) => { disc(u + 8, v + 8, 7, [30, 34, 60]); ring(u + 8, v + 8, 7, 1.6, [235, 240, 255]); line(u + 8, v + 8, u + 8, v + 3, [235, 240, 255]); line(u + 8, v + 8, u + 11, v + 9, [255, 210, 90]); });
at('coin', 32, 0, 16, 16, (u, v) => { disc(u + 8, v + 8, 7, [240, 190, 50]); ring(u + 8, v + 8, 7, 1.4, [190, 130, 20]); text('$', u + 6, v + 5, 1, [140, 90, 10]); });
at('skull', 48, 0, 16, 16, (u, v) => { disc(u + 8, v + 7, 6, [235, 235, 225]); rect(u + 5, v + 11, 7, 3, [235, 235, 225]); disc(u + 5.5, v + 7, 1.6, [40, 20, 30]); disc(u + 10.5, v + 7, 1.6, [40, 20, 30]); for (let i = 0; i < 3; i++) rect(u + 6 + i * 2, v + 12, 1, 2, [80, 70, 70]); });
at('enemy', 64, 0, 16, 16, (u, v) => { disc(u + 8, v + 4, 3, [120, 200, 90]); rect(u + 5, v + 7, 6, 6, [90, 160, 70]); rect(u + 5, v + 13, 2, 3, [70, 120, 60]); rect(u + 9, v + 13, 2, 3, [70, 120, 60]); set(u + 7, v + 4, [20, 30, 20]); set(u + 9, v + 4, [20, 30, 20]); });
// role icons (16 x 16): offense, support, income, defense, cliff, spawner, hologram, freeze
const roleArt = [
  (u, v) => { ring(u + 8, v + 8, 6.5, 1.5, [235, 70, 60]); line(u + 8, v + 1, u + 8, v + 15, [235, 70, 60]); line(u + 1, v + 8, u + 15, v + 8, [235, 70, 60]); disc(u + 8, v + 8, 1.2, [255, 230, 120]); },
  (u, v) => { rect(u + 6, v + 2, 4, 12, [80, 220, 120]); rect(u + 2, v + 6, 12, 4, [80, 220, 120]); rect(u + 7, v + 3, 2, 10, [190, 255, 200]); },
  (u, v) => { for (let k = 0; k < 3; k++) { round(u + 2, v + 10 - k * 3, 12, 4, 1, [240, 190, 50], [180, 120, 20]); } },
  (u, v) => { for (let j = 0; j < 14; j++) { const w = j < 8 ? 12 : 12 - (j - 7) * 2; rect(u + 8 - w / 2, v + 1 + j, w, 1, [70, 130, 230]); } rect(u + 7, v + 3, 2, 9, [190, 220, 255]); },
  (u, v) => { for (let j = 0; j < 12; j++) rect(u + 8 - j * 0.6 - 1, v + 3 + j, j * 1.2 + 2, 1, j < 3 ? [240, 245, 255] : [130, 120, 110]); },
  (u, v) => { for (let j = 0; j < 5; j++) rect(u + 3 + (4 - j), v + 2 + j, 2 * j + 2, 1, [230, 120, 50]); rect(u + 3, v + 7, 10, 8, [200, 170, 120]); rect(u + 6, v + 10, 4, 5, [90, 60, 40]); },
  (u, v) => { for (let j = 0; j < 7; j++) { set(u + 8 - j, v + 1 + j, [90, 230, 255]); set(u + 8 + j, v + 1 + j, [90, 230, 255]); set(u + 8 - j, v + 14 - j, [90, 230, 255]); set(u + 8 + j, v + 14 - j, [90, 230, 255]); } disc(u + 8, v + 8, 1.5, [190, 250, 255]); },
  (u, v) => { for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3; line(u + 8 - Math.cos(a) * 6.5, v + 8 - Math.sin(a) * 6.5, u + 8 + Math.cos(a) * 6.5, v + 8 + Math.sin(a) * 6.5, [170, 220, 255]); } disc(u + 8, v + 8, 1.4, [240, 250, 255]); },
];
roleArt.forEach((f, k) => at(`role${k}`, k * 16, 16, 16, 16, f));
// seven-segment strokes (solid colours, stretched over each segment)
const SEG = { white: [235, 240, 255], yellow: [255, 214, 70], green: [110, 240, 130], gray: [150, 160, 190], gold: [255, 220, 110] };
Object.entries(SEG).forEach(([n, c], k) => { at(`segh_${n}`, k * 8, 32, 6, 2, (u, v) => rect(u, v, 6, 2, c)); at(`segv_${n}`, k * 8 + 6, 32, 2, 6, (u, v) => rect(u, v, 2, 6, c)); });
// gauges
at('track', 0, 40, 64, 4, (u, v) => rect(u, v, 64, 4, [36, 38, 52, 230]));
at('hpfill', 0, 44, 64, 4, (u, v) => { rect(u, v, 64, 4, [225, 55, 70]); rect(u, v, 64, 1, [255, 140, 150]); });
at('bossfill', 0, 48, 64, 4, (u, v) => { rect(u, v, 64, 4, [160, 70, 225]); rect(u, v, 64, 1, [215, 160, 255]); });
// panels (one texture pixel per model unit)
const PANEL = [16, 22, 44, 205], EDGE = [120, 160, 225, 255];
at('pwave', 0, 56, 100, 26, (u, v) => { round(u, v, 100, 26, 4, PANEL, EDGE); rect(u + 4, v + 1, 92, 1, [170, 200, 255, 120]); });
at('pcash', 104, 56, 66, 14, (u, v) => round(u, v, 66, 14, 3, PANEL, [240, 200, 80, 255]));
at('pskip', 176, 56, 40, 10, (u, v) => round(u, v, 40, 10, 3, [20, 50, 30, 210], [110, 240, 130, 255]));
at('pboss', 0, 84, 100, 9, (u, v) => round(u, v, 100, 9, 3, [30, 14, 40, 205], [190, 110, 240, 255]));
at('slot', 0, 96, 24, 26, (u, v) => round(u, v, 24, 26, 3, [18, 24, 46, 185], [110, 140, 200, 255]));
at('slotsel', 24, 96, 24, 26, (u, v) => round(u, v, 24, 26, 3, [255, 220, 90, 40], [255, 214, 70, 255], 2));
at('pbanner', 56, 96, 120, 22, (u, v) => { round(u, v, 120, 22, 5, [10, 14, 30, 200], [240, 200, 90, 255]); rect(u + 6, v + 2, 108, 1, [255, 230, 150, 110]); });
// words
at('wWAVE', 0, 124, textW('WAVE'), 7, (u, v) => text('WAVE', u, v, 1, [190, 210, 255]));
at('wSKIP', 24, 124, textW('SKIP?'), 7, (u, v) => text('SKIP?', u, v, 1, [120, 255, 140]));
at('wSLASH', 56, 124, 5, 7, (u, v) => text('/', u, v, 1, [150, 160, 190]));
for (let i = 1; i <= 5; i++) at(`n${i}`, 64 + (i - 1) * 6, 124, 5, 7, (u, v) => text(String(i), u, v, 1, [220, 225, 240]));
at('wTRIUMPH', 0, 134, textW('TRIUMPH!', 2), 14, (u, v) => text('TRIUMPH!', u, v, 2, [255, 215, 80], [120, 70, 10]));
at('wDEFEAT', 96, 134, textW('DEFEAT', 2), 14, (u, v) => text('DEFEAT', u, v, 2, [255, 90, 90], [90, 10, 20]));
at('wHIDDEN', 0, 150, textW('HIDDEN WAVE', 2), 14, (u, v) => text('HIDDEN WAVE', u, v, 2, [205, 125, 255], [50, 10, 80]));
at('wWAVE2', 132, 150, textW('WAVE', 2), 14, (u, v) => text('WAVE', u, v, 2, [235, 240, 255], [30, 40, 90]));
at('gem', 80, 0, 16, 16, (u, v) => { for (let j = 0; j < 7; j++) { rect(u + 8 - j, v + 2 + j, 2 * j + 1, 1, [170, 90, 240]); rect(u + 8 - (6 - j), v + 9 + j, 2 * (6 - j) + 1, 1, [130, 60, 200]); } set(u + 6, v + 5, [235, 200, 255]); set(u + 7, v + 4, [235, 200, 255]); });
for (const [w, x, c] of [['UP', 96, [120, 255, 140]], ['SELL', 110, [255, 150, 120]], ['MAX', 136, [255, 214, 70]], ['DMG', 156, [190, 210, 255]], ['EXP', 176, [120, 200, 255]]]) at(`w${w}`, x, 124, textW(w), 7, (u, v) => text(w, u, v, 1, c));
at('wLV', 214, 124, textW('LV'), 7, (u, v) => text('LV', u, v, 1, [255, 214, 70]));
at('pip', 200, 124, 4, 3, (u, v) => rect(u, v, 4, 3, [255, 214, 70]));
at('pipbg', 206, 124, 4, 3, (u, v) => rect(u, v, 4, 3, [60, 66, 90]));
const TARGETS = [['FIRST', [70, 130, 230]], ['LAST', [130, 90, 210]], ['STRONG', [220, 70, 70]], ['WEAK', [90, 180, 110]], ['CLOSE', [230, 150, 50]], ['FAR', [60, 170, 190]], ['RANDOM', [150, 150, 160]]];
TARGETS.forEach(([w, c], k) => at(`tg${k}`, (k % 6) * 40, 192 + Math.floor(k / 6) * 10, 40, 10, (u, v) => { round(u, v, 40, 10, 3, [...c, 230], [255, 255, 255, 180]); text(w, u + Math.floor((40 - textW(w)) / 2), v + 1.5, 1, [255, 255, 255]); }));
at('ptower', 0, 212, 64, 44, (u, v) => { round(u, v, 64, 44, 4, PANEL, EDGE); rect(u + 4, v + 1, 56, 1, [170, 200, 255, 120]); });
// mode badges (the order src/hud.ts sends)
export const MODES = ['Easy', 'Casual', 'Intermediate', 'Molten', 'Fallen', 'Hardcore', 'Frost', 'Voidcore', 'Sandbox'];
const BADGE = [['EASY', [60, 170, 80]], ['CASUAL', [40, 160, 170]], ['INTER', [60, 110, 210]], ['MOLTEN', [230, 110, 40]], ['FALLEN', [110, 60, 150]], ['HARD', [150, 30, 40]], ['FROST', [110, 180, 235]], ['VOID', [60, 30, 90]], ['SANDBOX', [200, 170, 60]]];
BADGE.forEach(([w, c], k) => at(`mode${k}`, (k % 5) * 44, 166 + Math.floor(k / 5) * 12, 44, 12, (u, v) => { round(u, v, 44, 12, 3, [...c, 235], [255, 255, 255, 200]); text(w, u + Math.floor((44 - textW(w)) / 2), v + 2, 1, [255, 255, 255], [0, 0, 0, 120]); }));

// ---------- the design (model units: x right, y up; the screen is centred on (0, 140), 176 high) ----------
const bones = [{ name: C.ROOT, pivot: [0, C.PIVOT_Y, 0], cubes: [] }], elements = {}, pre = [];
const Z = { panel: -0.15, item: -0.3, over: -0.45, top: -0.7 };
const bone = (name, parent, pivot, el) => { bones.push({ name, parent, pivot, cubes: [] }); if (el) elements[name] = el; return name; };
/** a plane: lower-left (x, y), size (w, h), atlas region */
const plane = (name, parent, x, y, w, h, reg, z = Z.item, el, pivot) => {
  const [u, v, uw, uh] = R[reg];
  bones.push({ name, parent, pivot: pivot ?? [x + w / 2, y + h / 2, z], cubes: [{ origin: [x, y, z], size: [w, h, 0], faces: { north: { uv: [u, v], uv_size: [uw, uh], texture: 'atlas' } } }] });
  if (el) elements[name] = el;
  return name;
};
const P = (k) => `q.property('${NS}:${k}')`;
/** an animated pixel icon: a plane over frame 0 of column `col` in rp/textures/tdsui/anim.png (8 frames of 16 x 16, a strip),
 * drawn by a second geometry and render controller whose uv_anim steps the frames — only GeoUI animates */
const ANIM = [], ANIM_FRAMES = 8, ANIM_FPS = 10;
const anim = (name, parent, x, y, w, h, col) => ANIM.push({ name, parent, x, y, w, h, col });
// seven-segment digits: one variable per digit (−1 = blank), seven planes shown by a bit mask of the digits that light them
const MASK = { a: 1005, b: 927, c: 1019, d: 877, e: 325, f: 881, g: 892 };
function digits(id, parent, src, n, x, y, w, h, color, { blankZero = false, gap = 1 } = {}) {
  const t = Math.max(0.6, Math.round(w * 0.22 * 10) / 10);
  for (let k = 0; k < n; k++) {
    const place = 10 ** (n - 1 - k), v = `v.${NS}_${id}${k}`, dx = x + k * (w + gap);
    const blank = place > 1 ? `(${src}) < ${place}` : blankZero ? `(${src}) <= 0` : null;
    const digit = `math.mod(math.floor(math.abs(${src})/${place}),10)`;
    pre.push(`${v} = variable.is_paperdoll ? -1 : ${blank ? `((${blank}) ? -1 : ${digit})` : digit};`);
    const segs = { a: [dx, y + h - t, w, t, 'h'], b: [dx + w - t, y + h / 2, t, h / 2, 'v'], c: [dx + w - t, y, t, h / 2, 'v'], d: [dx, y, w, t, 'h'], e: [dx, y, t, h / 2, 'v'], f: [dx, y + h / 2, t, h / 2, 'v'], g: [dx, y + h / 2 - t / 2, w, t, 'h'] };
    for (const [s, [sx, sy, sw, sh, o]] of Object.entries(segs)) plane(`${id}${k}_${s}`, parent, sx, sy, sw, sh, `seg${o}_${color}`, Z.item, { type: 'image', visible: `math.mod(math.floor(${MASK[s]}/math.pow(2,${v})),2) >= 1` });
  }
}
const gauge = (name, parent, x, y, w, h, reg, source) => plane(name, parent, x, y, w, h, reg, Z.over, { type: 'gauge', gauge: { source, max: 100, fill: 'left' } }, [x, y + h / 2, Z.over]);
const k1 = 5 / 7;   // 1-scale words: 7 px tall → 5 units

// top middle: wave, timer, base health
const INMATCH = `${P('mode')} < 15`;
bone('wave', C.ROOT, [0, 213, 0], { type: 'image', anchor: 'top_middle', visible: INMATCH });
plane('wave_bg', 'wave', -50, 200, 100, 26, 'pwave', Z.panel, { type: 'image', blend: 'blend' });
plane('wave_label', 'wave', -46, 216.5, R.wWAVE[2] * k1, 5, 'wWAVE');
digits('wv', 'wave', P('wave'), 2, -28, 215, 4, 7, 'white');
plane('wave_slash', 'wave', -18.5, 215, 3.5, 7, 'wSLASH');
digits('wt', 'wave', P('total'), 2, -13.5, 215, 4, 7, 'gray');
plane('wave_clock', 'wave', 13, 215.5, 6, 6, 'clock');
digits('tm', 'wave', P('timer'), 3, 21, 215, 4, 7, 'white');
anim('an_heart', 'wave', -46, 203.5, 6, 6, 0);   // the heart beats (tools/art/hud_anim.py: frames; the anim layer below)
plane('hp_track', 'wave', -38, 204.5, 56, 4, 'track', Z.item);
gauge('hp_fill', 'wave', -38, 204.5, 56, 4, 'hpfill', `${P('hp')}/math.max(1,${P('hpmax')})*100`);
digits('hp', 'wave', P('hp'), 3, 26.4, 203, 3.5, 6, 'white', { gap: 0.9 });
// boss bar under it
bone('boss', C.ROOT, [0, 194.5, 0], { type: 'image', anchor: 'top_middle', visible: `${P('boss')} > 0 && ${INMATCH}` });
plane('boss_bg', 'boss', -50, 190, 100, 9, 'pboss', Z.panel, { type: 'image', blend: 'blend' });
plane('boss_skull', 'boss', -46, 191.5, 6, 6, 'skull');
plane('boss_track', 'boss', -38, 192.5, 84, 4, 'track', Z.item);
gauge('boss_fill', 'boss', -38, 192.5, 84, 4, 'bossfill', P('boss'));
// skip vote, under the boss bar (it would meet the cash panel beside the wave panel on narrow screens)
bone('skip', C.ROOT, [0, 183, 0], { type: 'image', anchor: 'top_middle', visible: `math.floor(${P('sv')}/10) == 1 && ${INMATCH}` });
plane('skip_bg', 'skip', -20, 178, 40, 10, 'pskip', Z.panel, { type: 'image', blend: 'blend' });
plane('skip_label', 'skip', -17, 180.5, R.wSKIP[2] * k1, 5, 'wSKIP');
digits('sv', 'skip', `math.mod(${P('sv')},10)`, 1, 11, 179.5, 3.5, 6, 'green');
// top right: cash
const HW = C.halfWAt(C.settingsOf({ ns: NS }), 1.778);
bone('cash', C.ROOT, [HW - 37, 217, 0], { type: 'image', anchor: 'top_right' });   // match cash, or the coins in the lobby
plane('cash_bg', 'cash', HW - 70, 210, 66, 14, 'pcash', Z.panel, { type: 'image', blend: 'blend' });
anim('an_coin', 'cash', HW - 67, 213, 8, 8, 1);   // the coin turns
digits('cs', 'cash', P('cash'), 6, HW - 54, 213.5, 4, 7, 'yellow', { gap: 1.8 });
// top left: mode badge and the enemies on the path
bone('info', C.ROOT, [-HW + 24, 212, 0], { type: 'image', anchor: 'top_left', visible: INMATCH });
BADGE.forEach((_, k) => plane(`mode_${k}`, 'info', -HW + 4, 214, 40, 10.9, `mode${k}`, Z.item, { type: 'image', blend: 'blend', visible: `${P('mode')} == ${k}` }));
plane('info_enemy', 'info', -HW + 4, 203, 7, 7, 'enemy');
digits('en', 'info', P('enemies'), 3, -HW + 13, 203.5, 3.5, 6, 'white', { gap: 0.9 });
// bottom middle: the tower bar (slots 1-5: frame, the tower's role, its cost; the held slot lit)
bone('bar', C.ROOT, [0, 115, 0], { type: 'image', anchor: 'bottom_middle', visible: INMATCH });   // above the hotbar and the action bar
for (let i = 0; i < 5; i++) {
  const x0 = -64 + i * 26, y0 = 102, s = `slot${i}`;
  bone(s, 'bar', [x0 + 12, y0 + 13, 0]);
  plane(`${s}_bg`, s, x0, y0, 24, 26, 'slot', Z.panel, { type: 'image', blend: 'blend' });
  plane(`${s}_sel`, s, x0, y0, 24, 26, 'slotsel', Z.top, { type: 'image', blend: 'blend', visible: `${P('sel')} == ${i + 1}` });
  for (let k = 0; k < 8; k++) plane(`${s}_r${k}`, s, x0 + 5, y0 + 9, 14, 14, `role${k}`, Z.item, { type: 'image', visible: `math.mod(math.floor(${P('roles')}/${10 ** i}),10) == ${k}` });
  plane(`${s}_n`, s, x0 + 1.6, y0 + 20.5, 2.9, 4, `n${i + 1}`, Z.over);
  digits(`c${i}`, s, P(`c${i + 1}`), 4, x0 + 3.2, y0 + 2.2, 3.2, 5, 'green', { blankZero: true, gap: 1.2 });
}
// middle: banners (wave start, triumph, defeat, the Hidden Wave), popping in by their age (tdsui:bn = banner × 1000 + age)
const BN = `math.floor(${P('bn')}/1000)`;
bone('banner', C.ROOT, [0, 161, 0], { type: 'image', anchor: 'center', visible: `${BN} > 0 && ${INMATCH}` });
bone('banner_pop', 'banner', [0, 161, 0]);
plane('banner_bg', 'banner_pop', -60, 150, 120, 22, 'pbanner', Z.panel, { type: 'image', blend: 'blend' });
bone('bn_wave', 'banner_pop', [0, 161, 0], { type: 'image', visible: `${BN} == 1` });
plane('bn_wave_w', 'bn_wave', -33, 155.5, R.wWAVE2[2] * 0.75, 10.5, 'wWAVE2', Z.item);
digits('bw', 'bn_wave', P('wave'), 2, 6, 155, 7, 12, 'gold', { gap: 2 });
plane('bn_win', 'banner_pop', -R.wTRIUMPH[2] * 0.375, 155.75, R.wTRIUMPH[2] * 0.75, 10.5, 'wTRIUMPH', Z.item, { type: 'image', visible: `${BN} == 2` });
plane('bn_lose', 'banner_pop', -R.wDEFEAT[2] * 0.375, 155.75, R.wDEFEAT[2] * 0.75, 10.5, 'wDEFEAT', Z.item, { type: 'image', visible: `${BN} == 3` });
plane('bn_hidden', 'banner_pop', -R.wHIDDEN[2] * 0.375, 155.75, R.wHIDDEN[2] * 0.75, 10.5, 'wHIDDEN', Z.item, { type: 'image', visible: `${BN} == 4` });
const age = `math.mod(${P('bn')},1000)`;
const animations = [{ name: `animation.${NS}_banner`, condition: 'q.is_in_ui', json: { loop: true, animation_length: 1, bones: { banner_pop: { scale: `math.clamp(${age}/5,0,1)*(${BN} == 1 ? math.clamp((50-${age})/8,0,1) : 1)` } } } }];

// the result's rewards under the triumph / defeat banner (tdsui:rew = coins × 1000 + EXP)
bone('reward', 'banner', [0, 143, 0], { type: 'image', visible: `${BN} == 2 || ${BN} == 3` });
anim('an_rcoin', 'reward', -30, 140, 6, 6, 1);
digits('rc', 'reward', `math.floor(${P('rew')}/1000)`, 4, -22, 140, 3.5, 6, 'yellow', { gap: 0.9 });
plane('rw_exp', 'reward', 2, 140.5, R.wEXP[2] * k1, 5, 'wEXP', Z.item);
digits('rx', 'reward', `math.mod(${P('rew')},1000)`, 3, 15, 140, 3.5, 6, 'white', { gap: 0.9 });
// the selected tower, like the original's upgrade panel (tdsui:tinfo = 10000 + role × 1000 + level × 100 + max × 10 + targeting)
const TI = (place) => `math.mod(math.floor(${P('tinfo')}/${place}),10)`;
bone('tower', C.ROOT, [HW - 36, 140, 0], { type: 'image', anchor: 'right_middle', visible: `${P('tinfo')} > 0 && ${INMATCH}` });
plane('tw_bg', 'tower', HW - 68, 126, 64, 36, 'ptower', Z.panel, { type: 'image', blend: 'blend' });
for (let k = 0; k < 7; k++) {
  plane(`tw_p${k}`, 'tower', HW - 62 + k * 6, 156.5, 4, 3, 'pip', Z.over, { type: 'image', visible: `${TI(100)} >= ${k + 1}` });
}
for (let k = 0; k < 7; k++) plane(`tw_t${k}`, 'tower', HW - 65, 146.5, 30, 7.5, `tg${k}`, Z.item, { type: 'image', blend: 'blend', visible: `${TI(1)} == ${k}` });
plane('tw_up', 'tower', HW - 65, 138.5, R.wUP[2] * k1, 5, 'wUP', Z.item, { type: 'image', visible: `${TI(100)} < ${TI(10)}` });
plane('tw_max', 'tower', HW - 65, 138.5, R.wMAX[2] * k1, 5, 'wMAX', Z.item, { type: 'image', visible: `${TI(100)} >= ${TI(10)}` });
digits('tu', 'tower', P('tup'), 5, HW - 40, 138, 3.5, 6, 'green', { blankZero: true, gap: 0.9 });
plane('tw_sell', 'tower', HW - 65, 130.5, R.wSELL[2] * k1, 5, 'wSELL', Z.item);
digits('ts', 'tower', P('tsell'), 5, HW - 40, 130, 3.5, 6, 'yellow', { blankZero: true, gap: 0.9 });

// the lobby (mode 15): level and EXP bar at the top left, coins and gems at the top right — the match values reused
// (wave = level, hp / hpmax = EXP / EXP to the next level, cash = coins, rgems = gems)
bone('lobby', C.ROOT, [-HW + 49, 213, 0], { type: 'image', anchor: 'top_left', visible: `${P('mode')} == 15` });
plane('lb_bg', 'lobby', -HW + 4, 202, 90, 22, 'pwave', Z.panel, { type: 'image', blend: 'blend' });
plane('lb_lv', 'lobby', -HW + 8, 215.5, R.wLV[2] * k1, 5, 'wLV');
digits('lv', 'lobby', P('wave'), 3, -HW + 18, 214.5, 4, 7, 'yellow');
plane('lb_exp', 'lobby', -HW + 8, 205.5, R.wEXP[2] * k1, 5, 'wEXP');
plane('lb_track', 'lobby', -HW + 23, 206, 66, 4, 'track', Z.item);
gauge('lb_fill', 'lobby', -HW + 23, 206, 66, 4, 'bossfill', `${P('hp')}/math.max(1,${P('hpmax')})*100`);
bone('gems', C.ROOT, [HW - 37, 202, 0], { type: 'image', anchor: 'top_right', visible: `${P('mode')} == 15` });
plane('gm_bg', 'gems', HW - 70, 196, 66, 12, 'pcash', Z.panel, { type: 'image', blend: 'blend' });
anim('an_gem', 'gems', HW - 67, 198.5, 7, 7, 2);   // the gem glints
digits('wg', 'gems', P('rgems'), 5, HW - 54, 199, 3.6, 6, 'white', { gap: 1.8 });

// ---------- build with GeoUICore and merge into the addon ----------
const design = { seed: 'tds-hud', settings: { ns: NS, name: 'TDS HUD', description: 'Tower Defense Simulator match HUD', bp: true }, textures: { atlas: { name: 'hud', width: W, height: H, png: encodePng({ width: W, height: H, data: px }).toString('base64') } }, bones, elements, animations };
const built = C.buildPack(design);
const put = (rel, content) => { const f = path.join(ADDON, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
// (an entity has at most 32 properties: GeoUI's 7 and these 24; small values share one property)
const PROPS = { wave: [0, 999], total: [0, 99], timer: [0, 999], hp: [0, 99999], hpmax: [1, 99999], cash: [0, 999999], enemies: [0, 999], boss: [0, 100], mode: [0, 15], roles: [0, 99999], sel: [0, 5], c1: [0, 9999], c2: [0, 9999], c3: [0, 9999], c4: [0, 9999], c5: [0, 9999],
  sv: [0, 19], bn: [0, 4999], tinfo: [0, 19999], tup: [0, 99999], tsell: [0, 99999], rew: [0, 9999999], rgems: [0, 99999] };
for (const [k, v] of Object.entries(built.files)) {
  const rel = k.replace(`${NS}_RP/`, 'rp/').replace(`${NS}_BP/`, 'bp/');
  if (/manifest\.json$|\/texts\/|scripts\/main\.js$/.test(rel)) continue;   // the addon's own manifests, texts and script stay
  if (rel === 'rp/entity/player.entity.json') {   // our digit variables before the transform animation reads them; the anim layer
    const ce = JSON.parse(v), d = ce['minecraft:client_entity'].description;
    d.scripts.pre_animation.push(...pre);
    d.geometry[`${NS}_anim`] = `geometry.${NS}_anim`; d.textures[`${NS}_anim`] = `textures/${NS}/anim`;
    const i = d.render_controllers.findIndex((r) => typeof r === 'object' && r[`controller.render.${NS}_hud`]);
    d.render_controllers.splice(i + 1, 0, { [`controller.render.${NS}_anim`]: d.render_controllers[i][`controller.render.${NS}_hud`] });
    put(rel, JSON.stringify(ce, null, 2)); continue;
  }
  if (rel === `rp/render_controllers/${NS}.render_controllers.json`) {   // the anim layer: same alpha as the HUD, uv_anim steps the frames
    const rc = JSON.parse(v), hud = rc.render_controllers[`controller.render.${NS}_hud`];
    rc.render_controllers[`controller.render.${NS}_anim`] = { geometry: `Geometry.${NS}_anim`, materials: [{ '*': `Material.${NS}_cutout` }], textures: [`Texture.${NS}_anim`],
      uv_anim: { offset: [0, `math.mod(math.floor(q.life_time * ${ANIM_FPS}), ${ANIM_FRAMES}) / ${ANIM_FRAMES}`], scale: [1, 1] },
      color: hud.color, is_hurt_color: hud.is_hurt_color, on_fire_color: hud.on_fire_color };
    put(rel, JSON.stringify(rc, null, 2)); continue;
  }
  if (rel === 'bp/entities/player.json') {   // GeoUI's own properties (v0-v3 unused) and the HUD's values
    const be = JSON.parse(v), pr = be['minecraft:entity'].description.properties;
    for (const n of ['v0', 'v1', 'v2', 'v3']) delete pr[`${NS}:${n}`];
    for (const [n, [a, b]] of Object.entries(PROPS)) pr[`${NS}:${n}`] = { client_sync: true, type: 'int', range: [a, b], default: a };
    pr[`${NS}:alpha`].default = 0;   // hidden until a match: src/hud.ts shows it
    put(rel, JSON.stringify(be, null, 2)); continue;
  }
  put(rel, typeof v === 'string' ? v : Buffer.from(v.base64, 'base64'));
}
// the anim layer's geometry: the HUD's root and the anchors above each icon (same names, parents and pivots, so the transform
// animation places and hides them with the HUD), and one plane per icon over frame 0 of its column
{
  const byName = Object.fromEntries(bones.map((b) => [b.name, b])), keep = new Map();
  for (const a of ANIM) for (let n = a.parent; n; n = byName[n].parent) keep.set(n, byName[n]);
  const out = [...bones.filter((b) => keep.has(b.name)).map((b) => ({ name: b.name, ...(b.parent ? { parent: b.parent } : {}), pivot: b.pivot }))];
  for (const a of ANIM) out.push({ name: a.name, parent: a.parent, pivot: [a.x + a.w / 2, a.y + a.h / 2, Z.item - 0.02],
    cubes: [{ origin: [a.x, a.y, Z.item - 0.02], size: [a.w, a.h, 0], uv: { north: { uv: [a.col * 16, 0], uv_size: [16, 16] } } }] });
  put('rp/models/entity/tdsui/anim.geo.json', JSON.stringify({ format_version: '1.16.0', 'minecraft:geometry': [{ description: { identifier: `geometry.${NS}_anim`,
    texture_width: 48, texture_height: 16 * ANIM_FRAMES, visible_bounds_width: 912, visible_bounds_height: 384, visible_bounds_offset: [0, C.PIVOT_Y, 0] }, bones: out }] }, null, 1));
}
// the player's name, since the pack redefines minecraft:player
for (const [lang, name] of [['en_US', 'Player'], ['ja_JP', 'プレイヤー']]) {
  const f = path.join(ADDON, 'rp/texts', `${lang}.lang`), s = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  if (!/^entity\.minecraft:player\.name=/m.test(s)) fs.writeFileSync(f, `${s.replace(/\n?$/, '\n')}entity.minecraft:player.name=${name}\n`);
}
fs.writeFileSync(path.join(ADDON, 'tools/hud.props.json'), JSON.stringify({ ns: NS, props: PROPS, modes: MODES, platform: C.STUDIO.platformAspect, centerFix: C.STUDIO.centerFix }, null, 1));
console.log(`HUD: ${bones.length} bones, ${Object.keys(elements).length} elements, ${pre.length} digits, ${Object.keys(PROPS).length + 7} player properties${built.warnings.length ? `; warnings: ${built.warnings.slice(0, 5).join(' / ')}` : ''}`);
