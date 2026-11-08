// The match HUD's pictures, drawn by a real browser (Chromium through Playwright) as smooth images — gradients, rounded glass
// panels, a heavy font with dark outlines like the original's — not pixel art. Each picture is drawn at exactly its plane's size
// (tools/hud_layout.mjs, D pixels per unit) and packed into rp/textures/tdsui/hud.png; the digits 0-9 in each style go to
// rp/textures/tdsui/digits.png (a column per style: uv_anim moves a digit's plane down to its row). The regions are written to
// tools/art/hud_atlas.json for tools/hud.mjs. Colours are the ones meant on screen: the HUD's render controllers multiply
// by 1.32 (bds/geoui/RULES.md R3.11: the plane's light is 0.757).
//   node tools/art/hud_art.mjs            (Playwright and Chromium: GEOUI_NODE_MODULES, CHROMIUM — as bds/geoui/html/capture.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { D, DIGIT, SPRITES, MODES, TARGETS } from '../hud_layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ADDON = path.resolve(HERE, '..', '..');
const FONT = `'Inter Display', 'Inter', 'Poppins', sans-serif`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---------- drawing helpers (SVG; sizes in pixels) ----------
let gid = 0;
const id = (p) => `${p}${++gid}`;
/** a heavy word with a dark outline (the original's look) */
function word(s, x, y, size, fill, stroke = '#0b0d12', { anchor = 'start', sw = size * 0.2, weight = 900, spacing = 0, grad = null, maxw = 0 } = {}) {
  const g = grad ? id('tg') : null;
  const def = g ? `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">${grad.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>` : '';
  return `${def}<text data-fit="${maxw}" x="${x}" y="${y}" font-family="${FONT}" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}" text-anchor="${anchor}" fill="${g ? `url(#${g})` : fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke" dominant-baseline="alphabetic">${esc(s)}</text>`;
}
/** a rounded glass panel: dark gradient, a dark rim, a thin light line along the top */
function glass(w, h, r, { top = '#2a3146', bot = '#121622', rim = '#06080d', rimW = 3, edge = 'rgba(255,255,255,0.22)', alpha = 0.88 } = {}) {
  const g = id('g');
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>
    <rect x="${rimW / 2}" y="${rimW / 2}" width="${w - rimW}" height="${h - rimW}" rx="${r}" fill="url(#${g})" fill-opacity="${alpha}" stroke="${rim}" stroke-width="${rimW}"/>
    <rect x="${rimW + 2}" y="${rimW + 1.5}" width="${w - 2 * rimW - 4}" height="${Math.max(2, h * 0.04)}" rx="${Math.max(1, h * 0.02)}" fill="${edge}"/>`;
}
/** a bar's track (sunken) or fill (a glossy gradient with a light band) */
function track(w, h) {
  const g = id('t');
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070b"/><stop offset="1" stop-color="#1c2130"/></linearGradient></defs>
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${h / 2 - 1.5}" fill="url(#${g})" stroke="#000" stroke-width="3"/>`;
}
function fill(w, h, c1, c2, c3) {
  const g = id('f');
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="0.45" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient></defs>
    <rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="${(h - 6) / 2}" fill="url(#${g})"/>
    <rect x="${h * 0.35}" y="${h * 0.2}" width="${w - h * 0.7}" height="${h * 0.16}" rx="${h * 0.08}" fill="rgba(255,255,255,0.45)"/>`;
}
/** a pill button: colour gradient, dark rim, light top */
function button(w, h, c1, c2, rim) {
  const g = id('b');
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${h * 0.32}" fill="url(#${g})" stroke="${rim}" stroke-width="4"/>
    <rect x="${h * 0.3}" y="${h * 0.14}" width="${w - h * 0.6}" height="${h * 0.14}" rx="${h * 0.07}" fill="rgba(255,255,255,0.35)"/>`;
}
// icons, drawn in a 100 x 100 box and scaled to the sprite
const ICONS = {
  heart: `<path d="M50 88 C20 66 6 50 6 32 C6 17 18 7 31 7 C40 7 46 12 50 19 C54 12 60 7 69 7 C82 7 94 17 94 32 C94 50 80 66 50 88Z" fill="#ff4d5e" stroke="#2a0509" stroke-width="7" stroke-linejoin="round"/><ellipse cx="32" cy="28" rx="11" ry="8" fill="rgba(255,255,255,0.55)" transform="rotate(-30 32 28)"/>`,
  clock: `<circle cx="50" cy="50" r="42" fill="#f2f5ff" stroke="#0b0d12" stroke-width="9"/><path d="M50 22 V50 L68 62" fill="none" stroke="#1d2233" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="50" r="5" fill="#e04848"/>`,
  skull: `<path d="M50 6 C24 6 10 24 10 44 C10 58 18 66 26 70 L26 86 C26 91 30 94 35 94 L65 94 C70 94 74 91 74 86 L74 70 C82 66 90 58 90 44 C90 24 76 6 50 6Z" fill="#f4efe4" stroke="#0b0d12" stroke-width="7" stroke-linejoin="round"/><ellipse cx="34" cy="48" rx="11" ry="12" fill="#1a0f14"/><ellipse cx="66" cy="48" rx="11" ry="12" fill="#1a0f14"/><path d="M50 60 L44 72 H56Z" fill="#1a0f14"/><path d="M38 80 V92 M50 80 V92 M62 80 V92" stroke="#1a0f14" stroke-width="5"/>`,
  zombie: `<rect x="12" y="10" width="76" height="76" rx="14" fill="#6fbf5a" stroke="#0b0d12" stroke-width="8"/><rect x="12" y="10" width="76" height="22" rx="10" fill="#3f7a35"/><rect x="26" y="42" width="16" height="14" fill="#14200f"/><rect x="58" y="42" width="16" height="14" fill="#14200f"/><rect x="38" y="66" width="24" height="9" fill="#2d4a25"/>`,
  coin: `<circle cx="50" cy="50" r="42" fill="#ffc93a" stroke="#3a2600" stroke-width="8"/><circle cx="50" cy="50" r="30" fill="none" stroke="#e09a12" stroke-width="5"/>${''}<text x="50" y="67" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="48" fill="#a8660a">$</text><ellipse cx="34" cy="30" rx="10" ry="6" fill="rgba(255,255,255,0.6)" transform="rotate(-35 34 30)"/>`,
  gem: `<path d="M50 92 L8 38 L26 12 H74 L92 38Z" fill="#b16cff" stroke="#1e0838" stroke-width="7" stroke-linejoin="round"/><path d="M8 38 H92 M26 12 L38 38 L50 92 L62 38 L74 12 M38 38 L50 12 L62 38" fill="none" stroke="#5a24a8" stroke-width="4"/><path d="M30 16 L36 34" stroke="rgba(255,255,255,0.75)" stroke-width="6" stroke-linecap="round"/>`,
  star: `<path d="M50 6 L62 36 L94 38 L69 58 L78 90 L50 72 L22 90 L31 58 L6 38 L38 36Z" fill="#66c8ff" stroke="#0a2236" stroke-width="7" stroke-linejoin="round"/><path d="M40 30 L46 40" stroke="rgba(255,255,255,0.7)" stroke-width="6" stroke-linecap="round"/>`,
  check: `<circle cx="50" cy="50" r="44" fill="#4fd85a" stroke="#0b2a0e" stroke-width="8"/><path d="M28 52 L44 68 L74 34" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`,
  lock: `<rect x="20" y="44" width="60" height="46" rx="8" fill="#8a93ad" stroke="#0b0d12" stroke-width="7"/><path d="M32 46 V32 C32 20 40 12 50 12 C60 12 68 20 68 32 V46" fill="none" stroke="#0b0d12" stroke-width="16"/><path d="M32 46 V32 C32 20 40 12 50 12 C60 12 68 20 68 32 V46" fill="none" stroke="#8a93ad" stroke-width="7"/>`,
};
const icon = (name, x, y, s) => `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 100 100">${ICONS[name]}</svg>`;

// ---------- the pictures ----------
const MODE_ART = [['EASY', '#43c06a', '#1f7a3d'], ['CASUAL', '#3cc1c9', '#1b7a82'], ['INTERMEDIATE', '#4f86e8', '#26509e'], ['MOLTEN', '#ff8a33', '#b44a0e'],
  ['FALLEN', '#9a5bd6', '#55287f'], ['HARDCORE', '#d63a3a', '#7a1414'], ['FROST', '#8fd0ff', '#3f8bc4'], ['VOIDCORE', '#6b3fb0', '#2a1150'], ['SANDBOX', '#e3c45a', '#9a7a1c']];
const TG_ART = [['#4f86e8', '#26509e'], ['#8a5fd6', '#4b2a8a'], ['#e05454', '#8e1f1f'], ['#4fbf69', '#1f7a3d'], ['#f0a03c', '#a35c10'], ['#3cb7c9', '#1b6f7a'], ['#9aa3b8', '#555d72']];
function draw(name, w, h) {
  const H = h, W = w;
  switch (name) {
    case 'top_panel': return glass(W, H, H * 0.32);
    case 'word_wave_s': return word('WAVE', 2, H * 0.86, H * 0.98, '#cfd9ff', '#0b0d12', { spacing: 2 });
    case 'slash_w': return word('/', W / 2, H * 0.86, H * 1.0, '#ffffff', '#0b0d12', { anchor: 'middle' });
    case 'slash_k': return word('/', W / 2, H * 0.86, H * 1.0, '#9aa3bd', '#0b0d12', { anchor: 'middle' });
    case 'colon_w': return word(':', W / 2, H * 0.8, H * 1.0, '#ffffff', '#0b0d12', { anchor: 'middle' });
    case 'heart': case 'clock': case 'skull': case 'coin': case 'gem': case 'star': case 'check': return icon(name === 'zombie' ? 'zombie' : name, 0, 0, W);
    case 'hp_track': case 'boss_track': case 'exp_track': return track(W, H);
    case 'hp_fill': return fill(W, H, '#a6ff8a', '#4fdb4f', '#1f8f2f');
    case 'boss_fill': return fill(W, H, '#ff9a8a', '#ef4545', '#9b1515');
    case 'exp_fill': return fill(W, H, '#a9e3ff', '#3fb0ff', '#1765b5');
    case 'boss_panel': return glass(W, H, H * 0.4, { top: '#3a1d26', bot: '#1c0d12' });
    case 'word_boss': return word('BOSS', 1, H * 0.86, H * 1.0, '#ff8a8a', '#1a0507', { spacing: 1.5 });
    case 'skip_panel': return glass(W, H, H * 0.4, { top: '#1f3a28', bot: '#0d1c12' });
    case 'word_skip': return word('SKIP WAVE?', 1, H * 0.86, H * 1.0, '#b8ffbf', '#06170a', { spacing: 1 });
    case 'enemy_pill': return glass(W, H, H * 0.45) + icon('zombie', H * 0.18, H * 0.12, H * 0.76);
    case 'slot': {
      const g = id('s');
      return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4462"/><stop offset="0.68" stop-color="#1b2133"/><stop offset="0.69" stop-color="#0d1019"/><stop offset="1" stop-color="#0a0c13"/></linearGradient></defs>
        <rect x="2.5" y="2.5" width="${W - 5}" height="${H - 5}" rx="${W * 0.16}" fill="url(#${g})" fill-opacity="0.92" stroke="#05070b" stroke-width="5"/>
        <rect x="8" y="6" width="${W - 16}" height="3" rx="1.5" fill="rgba(255,255,255,0.28)"/>`;
    }
    case 'slot_sel': return `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="${W * 0.16}" fill="rgba(255,214,90,0.12)" stroke="#ffd24a" stroke-width="7"/>
        <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="${W * 0.13}" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="2"/>`;
    case 'slot_empty': return icon('lock', W * 0.3, H * 0.22, W * 0.4);
    case 'dollar_gs': case 'dollar_g': return word('$', W / 2, H * 0.86, H * 1.02, '#7dff7d', '#06210a', { anchor: 'middle' });
    case 'dollar_w': return word('$', W / 2, H * 0.86, H * 1.02, '#ffffff', '#0b0d12', { anchor: 'middle' });
    case 'cash_pill': return glass(W, H, H * 0.45, { top: '#1d3324', bot: '#0b160f' });
    case 'tower_panel': return glass(W, H, 22) + `<rect x="${D * 3}" y="${D * 4}" width="${D * 30}" height="${D * 30}" rx="16" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>`;
    case 'pip_on': return `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="${W * 0.25}" fill="#ffd24a" stroke="#3a2600" stroke-width="3"/>`;
    case 'pip_off': return `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="${W * 0.25}" fill="#2a3044" stroke="#05070b" stroke-width="3"/>`;
    case 'word_lv': return word('LV', 1, H * 0.86, H * 1.0, '#ffd24a', '#2a1a00');
    case 'btn_up': return button(W, H, '#5fe06b', '#22922f', '#06210a') + word('UPGRADE', H * 0.4, H * 0.7, H * 0.52, '#ffffff', '#06210a', { maxw: W * 0.5 });
    case 'btn_max': return button(W, H, '#ffd24a', '#c98a12', '#2a1a00') + word('MAX LEVEL', W / 2, H * 0.7, H * 0.52, '#ffffff', '#2a1a00', { anchor: 'middle' });
    case 'btn_sell': return button(W, H, '#ff6b5e', '#b4261d', '#2a0705') + word('SELL', H * 0.4, H * 0.7, H * 0.54, '#ffffff', '#2a0705', { maxw: W * 0.4 });
    case 'banner': {
      const g = id('bn');
      return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3350" stop-opacity="0.95"/><stop offset="1" stop-color="#0f1220" stop-opacity="0.95"/></linearGradient></defs>
        <path d="M${H * 0.5} 3 H${W - H * 0.5} L${W - 3} ${H / 2} L${W - H * 0.5} ${H - 3} H${H * 0.5} L3 ${H / 2}Z" fill="url(#${g})" stroke="#05070b" stroke-width="6" stroke-linejoin="round"/>
        <path d="M${H * 0.6} 12 H${W - H * 0.6}" stroke="rgba(255,230,150,0.55)" stroke-width="3"/><path d="M${H * 0.6} ${H - 12} H${W - H * 0.6}" stroke="rgba(255,230,150,0.35)" stroke-width="3"/>`;
    }
    case 'word_wave_b': return word('WAVE', 2, H * 0.86, H * 1.0, '#ffffff', '#0b0d12', { spacing: 3 });
    case 'word_triumph': return word('TRIUMPH!', W / 2, H * 0.86, H * 1.0, null, '#3a2000', { anchor: 'middle', grad: [[0, '#fff3a6'], [0.5, '#ffd03a'], [1, '#e08a10']], spacing: 2 });
    case 'word_defeat': return word('DEFEAT', W / 2, H * 0.86, H * 1.0, null, '#2a0505', { anchor: 'middle', grad: [[0, '#ffb3a8'], [0.5, '#ff5a4a'], [1, '#b81f17']], spacing: 2 });
    case 'word_hidden': return word('HIDDEN WAVE', W / 2, H * 0.86, H * 1.0, null, '#1a0533', { anchor: 'middle', grad: [[0, '#f0d2ff'], [0.5, '#b56cff'], [1, '#6a28c2']], spacing: 2 });
    case 'lobby_panel': return glass(W, H, H * 0.32);
    case 'lv_badge': return button(W, H, '#ffd24a', '#c98a12', '#2a1a00') + word('LV', W / 2, H * 0.72, H * 0.62, '#ffffff', '#2a1a00', { anchor: 'middle' });
    case 'coin_pill': return glass(W, H, H * 0.45, { top: '#3a3018', bot: '#17120a' }) + icon('coin', H * 0.12, H * 0.12, H * 0.76);
    case 'gem_pill': return glass(W, H, H * 0.45, { top: '#2e1d45', bot: '#120a1d' }) + icon('gem', H * 0.12, H * 0.12, H * 0.76);
  }
  let m;
  if ((m = /^mode_(\d)$/.exec(name))) { const [t, c1, c2] = MODE_ART[+m[1]]; return button(W, H, c1, c2, '#05070b') + word(t, W / 2, H * 0.71, H * (t.length > 9 ? 0.46 : 0.56), '#ffffff', '#05070b', { anchor: 'middle', spacing: 0.5 }); }
  if ((m = /^key_(\d)$/.exec(name))) return `<circle cx="${W / 2}" cy="${H / 2}" r="${W / 2 - 2.5}" fill="#f2f5ff" stroke="#05070b" stroke-width="4"/>` + word(m[1], W / 2, H * 0.73, H * 0.66, '#11141e', 'none', { anchor: 'middle', sw: 0 });
  if ((m = /^tg_(\d)$/.exec(name))) { const [c1, c2] = TG_ART[+m[1]]; return button(W, H, c1, c2, '#05070b') + word('TARGET', H * 0.45, H * 0.69, H * 0.42, 'rgba(255,255,255,0.8)', '#05070b') + word(TARGETS[+m[1]], W - H * 0.45, H * 0.72, H * 0.56, '#ffffff', '#05070b', { anchor: 'end', maxw: W * 0.6 }); }
  throw new Error(`no picture for ${name}`);
}

// ---------- pack, draw in the browser, cut ----------
const PAD = 4;
function pack(list, width) {
  let x = PAD, y = PAD, row = 0; const at = {};
  for (const [name, w, h] of [...list].sort((a, b) => b[2] - a[2] || b[1] - a[1])) {
    if (x + w + PAD > width) { x = PAD; y += row + PAD; row = 0; }
    at[name] = [x, y, w, h]; x += w + PAD; row = Math.max(row, h);
  }
  return { at, height: y + row + PAD };
}
async function browser() {
  const req = createRequire(path.join(process.env.GEOUI_NODE_MODULES || '/opt/npm-tools/node_modules', 'x.js'));
  let pw; try { pw = req('playwright-core'); } catch { pw = req('playwright'); }
  return pw.chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', headless: true });
}
async function shoot(b, width, height, body, file) {
  const page = await b.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}body>svg{position:absolute;overflow:hidden}</style></head><body>${body}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    for (const svg of document.querySelectorAll('body > svg')) {
      const W = +svg.getAttribute('width');
      for (const t of svg.querySelectorAll(':scope > text')) {
        const max = +t.getAttribute('data-fit') || Math.max(W * 0.94, W - 10), w = t.getBBox().width;
        if (w > max) t.setAttribute('font-size', String((+t.getAttribute('font-size') * max) / w));
      }
    }
  });
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width, height } });
  await page.close();
}

const list = Object.entries(SPRITES).map(([n, [w, h]]) => [n, Math.round(w * D), Math.round(h * D)]);
const WIDTH = 2048, { at, height } = pack(list, WIDTH), HEIGHT = Math.ceil(height / 64) * 64;
let body = '';
for (const [n, w, h] of list) { const [x, y] = at[n]; body += `<svg style="left:${x}px;top:${y}px" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${draw(n, w, h)}</svg>`; }
// the digits: a column per style, the glyphs centred in their cells (tabular figures)
const DSTYLE = { w: ['#ffffff', '#0b0d12'], g: ['#7dff7d', '#06210a'], y: ['#ffd84a', '#3a2600'], b: ['#8fd6ff', '#08233a'], p: ['#e2b6ff', '#250a40'], k: ['#aab3c9', '#0b0d12'] };
let dbody = '';
DIGIT.styles.forEach((s, c) => { for (let k = 0; k < 10; k++) dbody += `<svg style="left:${c * DIGIT.cellW}px;top:${k * DIGIT.cellH}px" width="${DIGIT.cellW}" height="${DIGIT.cellH}" viewBox="0 0 ${DIGIT.cellW} ${DIGIT.cellH}">${word(String(k), DIGIT.cellW / 2, DIGIT.cellH * 0.76, DIGIT.cellH * 0.7, DSTYLE[s][0], DSTYLE[s][1], { anchor: 'middle', sw: DIGIT.cellH * 0.12, maxw: DIGIT.cellW - 8 })}</svg>`; });
const b = await browser();
try {
  const out = path.join(ADDON, 'rp/textures/tdsui');
  fs.mkdirSync(out, { recursive: true });
  await shoot(b, WIDTH, HEIGHT, body, path.join(out, 'hud.png'));
  await shoot(b, DIGIT.styles.length * DIGIT.cellW, 10 * DIGIT.cellH, `<style>text{font-feature-settings:'tnum'}</style>${dbody}`, path.join(out, 'digits.png'));
} finally { await b.close(); }
fs.writeFileSync(path.join(HERE, 'hud_atlas.json'), JSON.stringify({ width: WIDTH, height: HEIGHT, digits: { width: DIGIT.styles.length * DIGIT.cellW, height: 10 * DIGIT.cellH }, at }, null, 1));
console.log(`hud.png ${WIDTH}x${HEIGHT} (${list.length} pictures), digits.png ${DIGIT.styles.length * DIGIT.cellW}x${10 * DIGIT.cellH}`);
