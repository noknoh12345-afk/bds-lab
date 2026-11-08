// The match HUD as GeoUI (bds/geoui: a live_player_renderer on the HUD draws planes added to minecraft:player), laid out like
// the original's screen: the wave, the base's health and the timer in one strip at the top, the boss bar and the skip vote under
// it, the tower bar at the bottom (each slot the tower's own picture, its key and its price; the held one lit and raised) with
// the cash above it, the selected tower's panel on the left, the mode and the enemies at the top left, banners in the middle.
// The vanilla hotbar is hidden in a match (src/hud.ts): this bar takes its place.
// Pictures, not pixel art: tools/art/hud_art.mjs (a browser draws them: hud.png, digits.png) and tools/art/portraits.py (the
// towers' own models: towers.png). Three textures, so three geometries; the HUD's planes draw through smooth faded materials
// whose render controllers multiply by 1.32 — the colours meant (bds/geoui/RULES.md R3.7, R3.11). A digit is ONE plane: ten
// render controllers (one per digit 0-9) each show the digits whose value is theirs, uv_anim moving the glyph down to its row;
// a tower's picture likewise, one controller per slot with uv_anim to its cell. Values come from the player properties
// tdsui:* that src/hud.ts sets. Run: node tools/hud.mjs (after tools/art/hud_art.mjs and tools/art/portraits.py)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { D, DIGIT, SPRITES, MODES, TARGETS } from './hud_layout.mjs';
const require = createRequire(import.meta.url);
const C = require('../../../geoui/geoui_builder.js');
const HERE = path.dirname(new URL(import.meta.url).pathname), ADDON = path.resolve(HERE, '..');
const NS = 'tdsui';
const ATLAS = JSON.parse(fs.readFileSync(path.join(HERE, 'art/hud_atlas.json'), 'utf8'));
const PORT = JSON.parse(fs.readFileSync(path.join(HERE, 'art/portraits.json'), 'utf8'));
const png = (f) => fs.readFileSync(path.join(ADDON, 'rp/textures/tdsui', f)).toString('base64');

// ---------- the scene (model units: x right, y up; the screen centred on (0, 140), 176 high) ----------
export const bones = [{ name: C.ROOT, pivot: [0, C.PIVOT_Y, 0], cubes: [] }], elements = {}, pre = [];
export const digitBones = [], portraitBones = [], layout = {};   // (layout: bone → position Molang, the layout animation)
const Z = { panel: -0.15, item: -0.3, over: -0.45, top: -0.7 };
// the lobby's planes where the match's are, never shown with them: a depth of their own (no two faces on one plane)
const LZ = { panel: -0.2, item: -0.55, over: -0.65 };   // (past the mode badges' -0.30..-0.42 and Z.over)
const ALT = 0.015;   // alternatives in one place (a badge per mode) never share a plane: each a little nearer
const bone = (name, parent, pivot, el) => { bones.push({ name, parent, pivot, cubes: [] }); if (el) elements[name] = el; return name; };
/** a picture of hud.png at (x, y) (lower left), its size from tools/hud_layout.mjs unless given */
function pic(name, parent, x, y, reg, z = Z.item, el, size) {
  const [u, v, uw, uh] = ATLAS.at[reg], [w, h] = size ?? SPRITES[reg];
  bones.push({ name, parent, pivot: [x + w / 2, y + h / 2, z], cubes: [{ origin: [x, y, z], size: [w, h, 0], faces: { north: { uv: [u + 0.5, v + 0.5], uv_size: [uw - 1, uh - 1], texture: 'hud' } } }] });
  if (el) elements[name] = el;
  return name;
}
const P = (k) => `q.property('${NS}:${k}')`;
const V = (k) => `v.${NS}_${k}`;
const INSET = 1.5;   // (a glyph's plane stops short of its cell's edge: smooth sampling never reaches the next glyph)
/** one digit: a plane over the 0 of its style's column in digits.png; the controller for its value moves it to that row */
function digit(name, parent, x, y, h, style, v, z = Z.over) {
  const c = DIGIT.styles.indexOf(style), w = h * DIGIT.aspect;
  if (c < 0) throw new Error(`digit style ${style}`);
  bones.push({ name, parent, pivot: [x + w / 2, y + h / 2, z], cubes: [{ origin: [x, y, z], size: [w, h, 0], faces: { north: { uv: [c * DIGIT.cellW + INSET, INSET], uv_size: [DIGIT.cellW - 2 * INSET, DIGIT.cellH - 2 * INSET], texture: 'digits' } } }] });
  digitBones.push({ name, v });
}
/**
 * a number of n digit planes (h tall) at x (the left of its n-digit field), y; leading zeros blank (minDigits kept); aligned
 * left, right or centre by the layout animation (the blanks counted in pre_animation); a prefix picture ($) kept next to the
 * first digit shown
 */
function number(id, parent, src, n, x, y, h, style, { align = 'left', prefix = null, minDigits = 1, z = Z.over, prefixGap = 0.3, hideZero = false } = {}) {
  const w = h * DIGIT.aspect, step = w * DIGIT.step, pw = prefix ? SPRITES[prefix][0] + prefixGap : 0, b = V(`${id}_b`);
  bone(id, parent, [x, y + h / 2, 0]);
  const dg = bone(`${id}_dg`, id, [x, y + h / 2, 0]);
  if (prefix) { bone(`${id}_pf`, id, [x, y + h / 2, 0], hideZero ? { type: 'image', visible: `${V(`${id}_n`)} > 0` } : undefined); pic(`${id}_px`, `${id}_pf`, x, y + (h - SPRITES[prefix][1]) / 2, prefix, z); }
  // the value once, then each digit (−1: blank) and the count of blanks
  pre.push(`${V(`${id}_n`)} = math.floor(math.max(0, ${src}));`);
  const val = V(`${id}_n`);
  for (let k = 0; k < n; k++) {
    const place = 10 ** (n - 1 - k), lead = n - 1 - k >= minDigits;   // a leading place may be blank
    const shown = lead ? `(${val} < ${place} ? -1 : math.mod(math.floor(${val}/${place}),10))` : hideZero ? `(${val} <= 0 ? -1 : math.mod(math.floor(${val}/${place}),10))` : `math.mod(math.floor(${val}/${place}),10)`;
    pre.push(`${V(`${id}_${k}`)} = variable.is_paperdoll ? -1 : ${shown};`);
    digit(`${id}_${k}`, dg, x + pw + k * step, y, h, style, V(`${id}_${k}`), z - (k % 2) * 0.02);   // neighbours overlap: every other one nearer
  }
  let blanks = '0';
  for (let k = n - 1; k >= minDigits; k--) blanks = `(${val} < ${10 ** k} ? ${n - k} : ${blanks})`;
  pre.push(`${b} = ${blanks};`);
  if (align === 'left') layout[dg] = [`-${b}*${step.toFixed(4)}`, 0];
  if (align === 'right' && prefix) layout[`${id}_pf`] = [`${b}*${step.toFixed(4)}`, 0];
  if (align === 'center') { layout[id] = [`-${b}*${(step / 2).toFixed(4)}`, 0]; if (prefix) layout[`${id}_pf`] = [`${b}*${step.toFixed(4)}`, 0]; }
  return { width: pw + (n - 1) * step + w, step, w };
}
/** the width of a number's whole field (prefix and n digits): to put its right edge or centre where it belongs */
const fieldW = (n, h, prefix = null, gap = 0.3) => (prefix ? SPRITES[prefix][0] + gap : 0) + (n - 1) * h * DIGIT.aspect * DIGIT.step + h * DIGIT.aspect;
/** a tower's picture: one plane over cell 0 of towers.png; its controller moves the picture to the cell of the index */
function portrait(name, parent, x, y, s, idx, z = Z.item) {
  const c = PORT.cell;
  bones.push({ name, parent, pivot: [x + s / 2, y + s / 2, z], cubes: [{ origin: [x, y, z], size: [s, s, 0], faces: { north: { uv: [2, 2], uv_size: [c - 4, c - 4], texture: 'towers' } } }] });
  portraitBones.push({ name, idx });
}
/** a bar filled from the left by source (0-100): its pivot at its left end, where it grows from */
const gauge = (name, parent, x, y, reg, source) => { const h = SPRITES[reg][1]; pic(name, parent, x, y, reg, Z.over, { type: 'gauge', gauge: { source, max: 100, fill: 'left' } }); bones.at(-1).pivot = [x, y + h / 2, Z.over]; return name; };
const HW = C.halfWAt(C.settingsOf({ ns: NS }), 1.778);   // the half width at the reference 16:9 (anchors move with the real one)
const INMATCH = `${P('mode')} < 15`;

// the values unpacked (src/hud.ts packs them: an entity has at most 32 properties)
pre.push(`${V('wave')} = math.floor(${P('wt')}/100);`, `${V('total')} = math.mod(${P('wt')},100);`,
  `${V('ens')} = math.floor(${P('eb')}/1000);`, `${V('boss')} = math.mod(${P('eb')},1000);`,
  `${V('sel')} = math.mod(${P('misc')},8);`, `${V('votes')} = math.mod(math.floor(${P('misc')}/8),10);`, `${V('need')} = math.mod(math.floor(${P('misc')}/80),10);`, `${V('skip')} = math.floor(${P('misc')}/800);`);
for (let i = 0; i < 5; i++) pre.push(`${V(`ti${i}`)} = math.mod(math.floor(${P(i < 3 ? 't123' : 't45')}/${100 ** (i % 3)}),100);`);
pre.push(`${V('tsel')} = math.floor(${P('t45')}/10000);`);

// ---- top middle: the wave, the base's health, the timer (the original: wave at the left of the bar, time at the right)
bone('top', C.ROOT, [0, 214, 0], { type: 'image', anchor: 'top_middle', visible: INMATCH });
pic('top_bg', 'top', -72, 203, 'top_panel', Z.panel);
pic('top_wavew', 'top', -67, 216.4, 'word_wave_s');
number('wv', 'top', V('wave'), 2, -55.5 - fieldW(2, 10), 205, 10, 'w', { align: 'right' });   // its right edge at the slash
pic('top_slash', 'top', -55.1, 205.8, 'slash_k');
number('wt', 'top', V('total'), 2, -52.3, 205.8, 6.6, 'k', { align: 'left' });
pic('hp_track', 'top', -34, 207, 'hp_track', Z.item);
gauge('hp_fill', 'top', -34, 207, 'hp_fill', `${P('hp')}/math.max(1,${P('hpmax')})*100`);
pic('hp_heart', 'top', -42, 206, 'heart', Z.top);
number('hc', 'top', P('hp'), 4, -7.3 - fieldW(4, 6.4), 207.8, 6.4, 'w', { align: 'right', z: Z.top });
pic('hp_slash', 'top', -7.1, 207.7, 'slash_w', Z.top, null, [2.6, 6.4]);
number('hm', 'top', P('hpmax'), 4, -4.3, 207.8, 6.4, 'w', { align: 'left', z: Z.top });
pic('tm_clock', 'top', 32, 207, 'clock');
number('tmm', 'top', `math.floor(${P('timer')}/60)`, 1, 41.2, 206.6, 8.4, 'w');
pic('tm_colon', 'top', 46.6, 206.9, 'colon_w', Z.over, null, [2, 7.2]);
number('tms', 'top', `math.mod(${P('timer')},60)`, 2, 48.7, 206.6, 8.4, 'w', { minDigits: 2 });

// ---- boss bar under it, the skip vote under that (up in the boss bar's place when there is no boss)
bone('boss', C.ROOT, [0, 196, 0], { type: 'image', anchor: 'top_middle', visible: `${V('boss')} > 0 && ${INMATCH}` });
pic('boss_bg', 'boss', -56, 191, 'boss_panel', Z.panel);
pic('boss_skull', 'boss', -53.5, 192, 'skull');
pic('boss_word', 'boss', -44, 193.6, 'word_boss');
pic('boss_track', 'boss', -29, 193, 'boss_track', Z.item);
gauge('boss_fill', 'boss', -29, 193, 'boss_fill', V('boss'));
bone('skip', C.ROOT, [0, 184, 0], { type: 'image', anchor: 'top_middle', visible: `${V('skip')} == 1 && ${INMATCH}` });
layout.skip = [0, `(${V('boss')} > 0 ? 0 : 12)`];
pic('skip_bg', 'skip', -35, 179, 'skip_panel', Z.panel);
pic('skip_word', 'skip', -31.5, 181.6, 'word_skip');
pic('skip_check', 'skip', 4, 180.8, 'check');
number('sv', 'skip', V('votes'), 1, 12.5, 180.9, 6.2, 'w');
pic('skip_slash', 'skip', 16.5, 181, 'slash_k', Z.over, null, [2.4, 6]);
number('sn', 'skip', V('need'), 1, 19.1, 180.9, 6.2, 'k');

// ---- top left: the mode, the enemies on the road
bone('info', C.ROOT, [-HW + 21, 210, 0], { type: 'image', anchor: 'top_left', visible: INMATCH });
MODES.forEach((_, k) => pic(`mode_${k}`, 'info', -HW + 4, 215.5, `mode_${k}`, Z.item - ALT * k, { type: 'image', visible: `${P('mode')} == ${k}` }));
pic('info_enemy', 'info', -HW + 4, 205, 'enemy_pill', Z.panel);
number('en', 'info', V('ens'), 3, -HW + 15, 206.4, 6.2, 'w');

// ---- bottom middle: the tower bar (the hotbar's place) and the cash above it
bone('bar', C.ROOT, [0, 76, 0], { type: 'image', anchor: 'bottom_middle', visible: INMATCH });
for (let i = 0; i < 5; i++) {
  const x0 = -74 + 30 * i, y0 = 59, s = `slot${i}`;
  bone(s, 'bar', [x0 + 14, y0 + 16, 0]);
  layout[s] = [0, `(${V('sel')} == ${i + 1} ? 2.5 : 0)`];   // the held slot rises, like the original's
  pic(`${s}_bg`, s, x0, y0, 'slot', Z.panel);
  portrait(`${s}_tw`, s, x0 + 2.5, y0 + 7.6, 23, V(`ti${i}`), Z.item);
  pic(`${s}_lock`, s, x0 + 2, y0 + 8.5, 'slot_empty', Z.item - ALT, { type: 'image', visible: `${V(`ti${i}`)} >= 99` });
  pic(`${s}_key`, s, x0 + 0.4, y0 + 24.6, `key_${i + 1}`, Z.top);
  number(`c${i}`, s, P(`c${i + 1}`), 5, x0 + 14 - fieldW(5, 5.2, 'dollar_gs') / 2, y0 + 1.6, 5.2, 'g', { align: 'center', prefix: 'dollar_gs', hideZero: true });
  pic(`${s}_sel`, s, x0 - 1, y0 - 1, 'slot_sel', Z.top - ALT, { type: 'image', visible: `${V('sel')} == ${i + 1}` });
}
pic('cash_bg', 'bar', -26, 94, 'cash_pill', Z.panel);
number('cs', 'bar', P('cash'), 6, -fieldW(6, 8, 'dollar_g') / 2, 95.5, 8, 'g', { align: 'center', prefix: 'dollar_g' });

// ---- left: the selected tower, like the original's upgrade panel (tdsui:tinfo = 10000 + role × 1000 + level × 100 + max × 10 + targeting)
const TI = (place) => `math.mod(math.floor(${P('tinfo')}/${place}),10)`;
bone('tower', C.ROOT, [-HW + 40, 138, 0], { type: 'image', anchor: 'left_middle', visible: `${P('tinfo')} > 0 && ${INMATCH}` });
pic('tw_bg', 'tower', -HW + 4, 98, 'tower_panel', Z.panel);
portrait('tw_pic', 'tower', -HW + 8, 145, 28, V('tsel'), Z.item);
pic('tw_lv', 'tower', -HW + 40, 165.6, 'word_lv');
number('tl', 'tower', TI(100), 1, -HW + 48.4, 165, 7, 'y');
for (let k = 0; k < 7; k++) pic(`tw_p${k}`, 'tower', -HW + 40 + k * 4.4, 157.5, 'pip_on', Z.item - ALT * 2, { type: 'image', visible: `${TI(100)} >= ${k + 1} && ${TI(10)} >= ${k + 1}` });
for (let k = 0; k < 7; k++) pic(`tw_q${k}`, 'tower', -HW + 40 + k * 4.4, 157.5, 'pip_off', Z.item, { type: 'image', visible: `${TI(100)} < ${k + 1} && ${TI(10)} >= ${k + 1}` });
pic('tw_up', 'tower', -HW + 8, 129, 'btn_up', Z.item, { type: 'image', visible: `${TI(100)} < ${TI(10)}` });
pic('tw_max', 'tower', -HW + 8, 129, 'btn_max', Z.item - ALT, { type: 'image', visible: `${TI(100)} >= ${TI(10)}` });
bone('tw_upc', 'tower', [-HW + 52, 135, 0], { type: 'image', visible: `${TI(100)} < ${TI(10)}` });
number('tu', 'tw_upc', P('tup'), 5, -HW + 69 - fieldW(5, 6.8, 'dollar_w'), 131.6, 6.8, 'w', { align: 'right', prefix: 'dollar_w' });
pic('tw_sell', 'tower', -HW + 8, 116, 'btn_sell', Z.item);
number('ts', 'tower', P('tsell'), 5, -HW + 69 - fieldW(5, 6.6, 'dollar_w'), 118.3, 6.6, 'w', { align: 'right', prefix: 'dollar_w' });
TARGETS.forEach((_, k) => pic(`tw_t${k}`, 'tower', -HW + 8, 103, `tg_${k}`, Z.item - ALT * k, { type: 'image', visible: `${TI(1)} == ${k}` }));

// ---- middle: banners (wave start, triumph, defeat, the Hidden Wave), popping in by their age (tdsui:bn = banner × 1000 + age)
const BN = `math.floor(${P('bn')}/1000)`;
bone('banner', C.ROOT, [0, 161, 0], { type: 'image', anchor: 'center', visible: `${BN} > 0 && ${INMATCH}` });
bone('banner_pop', 'banner', [0, 161, 0]);
pic('banner_bg', 'banner_pop', -78, 146, 'banner', Z.panel);
bone('bn_wave', 'banner_pop', [0, 161, 0], { type: 'image', visible: `${BN} == 1` });
pic('bn_wave_w', 'bn_wave', -39, 154, 'word_wave_b', Z.item);
number('bw', 'bn_wave', V('wave'), 2, 2, 154, 14, 'y', { align: 'left' });
pic('bn_win', 'banner_pop', -52, 152.5, 'word_triumph', Z.item - 3 * ALT, { type: 'image', visible: `${BN} == 2` });
pic('bn_lose', 'banner_pop', -42, 152.5, 'word_defeat', Z.item - 4 * ALT, { type: 'image', visible: `${BN} == 3` });
pic('bn_hidden', 'banner_pop', -58, 152.5, 'word_hidden', Z.item - 5 * ALT, { type: 'image', visible: `${BN} == 4` });
const age = `math.mod(${P('bn')},1000)`;
// the result's rewards under the triumph / defeat banner (tdsui:rew = coins × 1000 + EXP; tdsui:rgems = gems)
bone('reward', 'banner', [0, 139, 0], { type: 'image', visible: `${BN} == 2 || ${BN} == 3` });
pic('rw_coin', 'reward', -54, 135, 'coin');
number('rc', 'reward', `math.floor(${P('rew')}/1000)`, 4, -44.5, 135, 8, 'y');
pic('rw_star', 'reward', -14, 135, 'star');
number('rx', 'reward', `math.mod(${P('rew')},1000)`, 3, -4.5, 135, 8, 'b');
pic('rw_gem', 'reward', 18, 135, 'gem');
number('rg', 'reward', P('rgems'), 4, 27.5, 135, 8, 'p');

// ---- the lobby (mode 15): level and EXP at the top left, coins and gems at the top right (the match values reused:
//      wt = level × 100, hp / hpmax = EXP / EXP to the next level, cash = coins, rgems = gems)
bone('lobby', C.ROOT, [-HW + 52, 214, 0], { type: 'image', anchor: 'top_left', visible: `${P('mode')} == 15` });
pic('lb_bg', 'lobby', -HW + 4, 204, 'lobby_panel', LZ.panel);
pic('lb_lv', 'lobby', -HW + 7, 209, 'lv_badge', LZ.item);
number('lv', 'lobby', V('wave'), 3, -HW + 22.5, 209.5, 9, 'y', { z: LZ.over });
pic('lb_track', 'lobby', -HW + 41, 211.5, 'exp_track', LZ.item);
gauge('lb_fill', 'lobby', -HW + 41, 211.5, 'exp_fill', `${P('hp')}/math.max(1,${P('hpmax')})*100`); { const b = bones.at(-1); b.pivot[2] = LZ.over + 0.05; b.cubes[0].origin[2] = LZ.over + 0.05; }
bone('purse', C.ROOT, [HW - 35, 208, 0], { type: 'image', anchor: 'top_right', visible: `${P('mode')} == 15` });
pic('pu_coin', 'purse', HW - 66, 214.5, 'coin_pill', LZ.panel);
number('lc', 'purse', P('cash'), 6, HW - 54, 216, 8, 'y', { z: LZ.over });
pic('pu_gem', 'purse', HW - 66, 202, 'gem_pill', LZ.panel);
number('lg', 'purse', P('rgems'), 5, HW - 54, 203.5, 8, 'p', { z: LZ.over });

// the layout animation: numbers aligned, the held slot raised, the skip vote moved up; the banner popping in
const lay = {};
for (const [b, [x, y]] of Object.entries(layout)) lay[b] = { position: [x, y, 0] };
lay.banner_pop = { scale: `math.clamp(${age}/5,0,1)*(${BN} == 1 ? math.clamp((50-${age})/8,0,1) : 1)` };
const animations = [{ name: `animation.${NS}_layout`, condition: 'q.is_in_ui', json: { loop: true, animation_length: 1, bones: lay } }];

// ---------- build with GeoUICore, then the controllers of the digits and the pictures, and merge into the addon ----------
const textures = {
  hud: { name: 'hud', width: ATLAS.width, height: ATLAS.height, png: png('hud.png') },
  digits: { name: 'digits', width: ATLAS.digits.width, height: ATLAS.digits.height, png: png('digits.png') },
  towers: { name: 'towers', width: PORT.cols * PORT.cell, height: PORT.rows * PORT.cell, png: png('towers.png') },
};
const design = { seed: 'tds-hud', settings: { ns: NS, name: 'TDS HUD', description: 'Tower Defense Simulator match HUD', bp: true }, textures, bones, elements, animations };
export const built = C.buildPack(design);
// (an entity has at most 32 properties: GeoUI's 7 and these 21; small values share one property)
export const PROPS = { wt: [0, 99999], timer: [0, 999], hp: [0, 99999], hpmax: [1, 99999], cash: [0, 999999], eb: [0, 999999], mode: [0, 15], misc: [0, 1999],
  t123: [0, 999999], t45: [0, 999999], c1: [0, 99999], c2: [0, 99999], c3: [0, 99999], c4: [0, 99999], c5: [0, 99999],
  bn: [0, 4999], tinfo: [0, 19999], tup: [0, 99999], tsell: [0, 99999], rew: [0, 9999999], rgems: [0, 99999] };
const LIGHT = 1.32;   // the plane's light is 0.757: × 1.32 through the colour mask gives the colour meant (up to 236)
const MAT = `material.${NS}_fade_s`;
export function controllers(rc) {
  const base = rc[`controller.render.${NS}_hud`], color = { r: LIGHT, g: LIGHT, b: LIGHT, a: base.color.a }, quiet = { is_hurt_color: base.is_hurt_color, on_fire_color: base.on_fire_color };
  const out = {};
  out[`controller.render.${NS}_hud`] = Object.assign({}, base, { materials: [{ '*': MAT }], color }, quiet);
  // the digits: controller k shows each digit plane whose value is k, the glyph moved down k rows
  for (let k = 0; k < 10; k++) out[`controller.render.${NS}_d${k}`] = { geometry: `Geometry.${NS}_digits`, materials: [{ '*': MAT }], textures: [`Texture.${NS}_digits`],
    part_visibility: [{ '*': false }, ...digitBones.map((d) => ({ [d.name]: `${d.v} == ${k}` }))], uv_anim: { offset: [0, k / 10], scale: [1, 1] }, color, ...quiet };
  // the towers' pictures: one controller per plane, moved to its tower's cell (99: none)
  portraitBones.forEach((p, i) => { out[`controller.render.${NS}_p${i}`] = { geometry: `Geometry.${NS}_towers`, materials: [{ '*': MAT }], textures: [`Texture.${NS}_towers`],
    part_visibility: [{ '*': false }, { [p.name]: `${p.idx} < 99 && !variable.is_paperdoll` }],
    uv_anim: { offset: [`math.mod(${p.idx},${PORT.cols})/${PORT.cols}`, `math.floor(${p.idx}/${PORT.cols})/${PORT.rows}`], scale: [1, 1] }, color, ...quiet }; });
  return out;
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const put = (rel, content) => { const f = path.join(ADDON, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
  for (const old of ['rp/textures/tdsui/anim.png', 'rp/models/entity/tdsui/anim.geo.json']) fs.rmSync(path.join(ADDON, old), { force: true });   // (the pixel-art layer is gone)
  let rcAll = null;
  for (const [k, v] of Object.entries(built.files)) {
    const rel = k.replace(`${NS}_RP/`, 'rp/').replace(`${NS}_BP/`, 'bp/');
    if (/manifest\.json$|\/texts\/|scripts\/main\.js$/.test(rel)) continue;   // the addon's own manifests, texts and script stay
    if (rel === `rp/render_controllers/${NS}.render_controllers.json`) { rcAll = JSON.parse(v); continue; }
    if (rel === 'rp/entity/player.entity.json') {   // our variables after GeoUI's (the transform animation reads them); the controllers
      const ce = JSON.parse(v), d = ce['minecraft:client_entity'].description;
      d.scripts.pre_animation.push(...pre);
      const cond = (n) => d.render_controllers.find((r) => typeof r === 'object' && r[n]);
      const dig = cond(`controller.render.${NS}_digits`), tow = cond(`controller.render.${NS}_towers`), c0 = dig[`controller.render.${NS}_digits`];
      const at = d.render_controllers.indexOf(dig);
      d.render_controllers.splice(at, 1, ...Array.from({ length: 10 }, (_, k) => ({ [`controller.render.${NS}_d${k}`]: c0 })));
      d.render_controllers.splice(d.render_controllers.indexOf(tow), 1, ...portraitBones.map((_, i) => ({ [`controller.render.${NS}_p${i}`]: c0 })));
      put(rel, JSON.stringify(ce, null, 2)); continue;
    }
    if (rel === 'rp/materials/entity.material') {   // GeoUI's, and the smooth faded one every HUD controller draws with
      const m = JSON.parse(v), base = m.materials[`${NS}_base`];
      m.materials[`${NS}_bases`] = Object.assign({}, base, { '+samplerStates': [{ samplerIndex: 0, textureFilter: 'Bilinear' }] });
      m.materials[`${NS}_fade_s:${NS}_bases`] = { '+defines': ['USE_UV_ANIM', 'USE_COLOR_MASK'], '+states': ['Blending'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' };
      put(rel, JSON.stringify(m, null, 2)); continue;
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
  const rcFile = { format_version: rcAll.format_version, render_controllers: Object.assign({}, rcAll.render_controllers, controllers(rcAll.render_controllers)) };
  delete rcFile.render_controllers[`controller.render.${NS}_digits`]; delete rcFile.render_controllers[`controller.render.${NS}_towers`];
  put(`rp/render_controllers/${NS}.render_controllers.json`, JSON.stringify(rcFile, null, 2));
  // the player's name, since the pack redefines minecraft:player
  for (const [lang, name] of [['en_US', 'Player'], ['ja_JP', 'プレイヤー']]) {
    const f = path.join(ADDON, 'rp/texts', `${lang}.lang`), s = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    if (!/^entity\.minecraft:player\.name=/m.test(s)) fs.writeFileSync(f, `${s.replace(/\n?$/, '\n')}entity.minecraft:player.name=${name}\n`);
  }
  fs.writeFileSync(path.join(ADDON, 'tools/hud.props.json'), JSON.stringify({ ns: NS, props: PROPS, modes: MODES, towers: PORT.names, platform: C.STUDIO.platformAspect, centerFix: C.STUDIO.centerFix }, null, 1));
  const nCtl = 1 + 10 + portraitBones.length;
  console.log(`HUD: ${bones.length} bones, ${Object.keys(elements).length} elements, ${digitBones.length} digit planes, ${portraitBones.length} pictures, ${nCtl} render controllers, ${Object.keys(PROPS).length + 7} player properties${built.warnings.length ? `; warnings: ${built.warnings.slice(0, 5).join(' / ')}` : ''}`);
}
