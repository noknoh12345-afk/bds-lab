#!/usr/bin/env node
// GeoUI — the rules probe: one pack whose run in the real app decides the rules bds/geoui/RULES.md still holds as hypotheses —
// each one predicted here, in numbers, before the run (predictions.json beside the pack: commit it, then run, then `verdict`).
//   node bds/geoui/screen/rules.mjs                write bds/addons/geoui_rules (with its predictions.json)
//   node bds/geoui/screen/rules.mjs --check        write nothing; fail when the add-on is not what this makes
//   node bds/geoui/screen/rules.mjs predict        the predictions, as JSON
//   node bds/geoui/screen/rules.mjs verdict <summary.json | run folder> [--predictions <file>] [--app <app.txt>]
//                                                  each hypothesis: held, fell, or not measured — against the predictions and the
//                                                  steps committed before that run (an earlier run's: bds/geoui/rules-history/run-<n>/)
// Decided by run 40055307539 (2026-10-24; its predictions, steps and public summary in bds/geoui/rules-history/run-40055307539/):
//   R4.1 the unit is scripts.scale / 16 of the panel's shorter side (exactly, at 0.5 / 0.75 / 1 / 1.5) · R4.2 the origin is 24 model
//   units below the panel's middle at any scale · R4.8 the entity's minecraft:scale multiplies the unit · R2.3 sneaking, the sleeping
//   and swimming animations, a boat and the third-person views move nothing of GeoUI's · R3.7 a flat plane facing the camera comes
//   out 0.757 x its colour, the same at noon and at midnight
// Decided by run 40061560812 (the second; bds/geoui/rules-history/run-40061560812/): R3.11 white stops at 236 (the colour 1.32 on the
//   colour-mask material: grey 128 as it is, white 236; emissive alpha 8: 234; the overlay mixes after the light) · R4.10 the smaller z
//   in front, every z from −150 to 150 drawn · R3.12 a tilt's light by its sign, not its angle · R3.9 not drawn while invisible ·
//   R3.8 no red · R4.9 q.model_scale is 1 in the UI (cancels nothing) · R5.3 neither min(⌊W/320⌋, ⌊H/240⌋) nor ⌊H/240⌋ · and found R4.11:
//   every plane put at the screen's bottom right hidden (the first-person arm, as far as the numbers go). Its probe is
//   rules-history/run-40061560812/ (app.txt and predictions.json); this file still reads it (PROBES keeps every box it measured).
// What they left open, and this pack's third run decides (app.txt, in this order):
//   R4.11 the bottom right: white squares at z −150…150 at the places the second run lost (and one in the open sky), then the same
//         under GeoUI Screen's frozen camera (minecraft:free at the head, the body hidden) — the arm or not, by depth or by order ·
//   R3.11 colours on the colour-mask material at the colour 1.32 and 2 (white, greys, red, green, blue, yellow, orange: each channel
//         as it is up to 236?) and the white overlay at 1 (255 or 236?) · R3.12 tilts of 1° and 5°, and 45° and 60° about x where the
//         arm is not · R4.9 the body's scale sent by the server (EntityScaleComponent.value as a property) and divided by ·
//   R5.3 the GUI scale on 12 screens that pin min(4, ⌊W/W0⌋, ⌊H/H0⌋)'s W0, H0 and its cap · and the control again (the scales 0.9375
//         and 1, the black board at z 100 — the second run lost them to a `shot world` of another size)
// The calibration grid is GeoUI Builder's (bds/geoui/calib.mjs markers: `measure geoui` reads it), drawn in the same frame as
// GeoUI Studio's renderer (10 % x 10 %, top_middle, 110 % down) with every centre fix 0.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';
import { markers, SIZE } from '../calib.mjs';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url)), TOP = path.resolve(HERE, '..', '..', '..');
const G = require('../geoui_builder.js');
const L = require('./layout.js'), P = require('./pack.js');
export const NS = 'grl', NAME = 'geoui_rules';
export const OUT = path.join(TOP, 'bds', 'addons', NAME);
const LAB_OWN = new Set(['lab.mjs', 'tsconfig.json']);

// ---- the palette (a texel each, sampled at its middle; alpha below 255 only where named — the emissive test)
const GREYS = [0, 32, 64, 96, 128, 160, 192, 224, 255];
const PAL = [['white', [255, 255, 255]], ['red', [255, 0, 0]], ['green', [0, 255, 0]], ['blue', [0, 0, 255]], ['yellow', [255, 255, 0]], ['cyan', [0, 255, 255]],
  ['black', [0, 0, 0]], ['violet', [128, 0, 255]], ...GREYS.map((g) => [`g${g}`, [g, g, g]]),
  ['w_a128', [255, 255, 255, 128]], ['w_a8', [255, 255, 255, 8]], ['g128_a8', [128, 128, 128, 8]], ['orange', [255, 128, 0]]];
const PI = Object.fromEntries(PAL.map(([n], i) => [n, i]));
/** grl:show's bits (the third run's: arm 64, colours 128, fine 256 — the property's range 0…1023) */
export const BITS = { cal: 1, ramp: 2, tilt: 4, gui: 8, bright: 16, depth: 32, arm: 64, colours: 128, fine: 256 };
/** run 40055307539's scales, and the two this run measures again as a control */
export const SCALES = [0.9375, 0.5, 0.75, 1, 1.5], CONTROL_SCALES = [0.9375, 1];
/** the 6 screens of the GUI scale's rule (landscape px) */
export const GUI_SIZES = [[1100, 1000], [960, 540], [1279, 960], [1280, 960], [1920, 959], [2560, 1440]];
/** the light run 40055307539 measured on a flat plane facing the camera: out = LIGHT x in (noon 0.7536 x + 2.3, midnight 0.7572 x − 0.3) */
export const LIGHT = 0.757;
const SC_DEFAULT = 9375;
const r4 = (v) => Math.round(v * 10000) / 10000;
const lit = (g) => r4(LIGHT * g);

// ---- what is drawn (model units, x right, y up; x, y the middle; z toward the camera is negative — R4.10 decides that too)
/** the ramp: 9 greys, 3 x 3, round the screen's middle in Studio's frame, on a mid-grey board at z 50 */
export const RAMP = GREYS.map((g, i) => ({ id: `g${g}`, grey: g, x: [-70, 0, 70][i % 3], y: [175, 135, 95][Math.floor(i / 3)], w: 30, h: 30 }));
/** the tilted planes, white, each turned about its own middle (bone rotation, degrees): a row turned about y (with run 40055307539's
 *  right45 again where it was, the same turn on the far left, and a flat one on the far right), a row turned about x */
export const TILT = [
  { id: 'ry-45b', rot: [0, -45, 0], x: -150 }, { id: 'ry-60', rot: [0, -60, 0], x: -120 }, { id: 'ry-30', rot: [0, -30, 0], x: -90 }, { id: 'ry-15', rot: [0, -15, 0], x: -60 },
  { id: 'flat', rot: [0, 0, 0], x: -30 }, { id: 'ry15', rot: [0, 15, 0], x: 0 }, { id: 'ry30', rot: [0, 30, 0], x: 30 }, { id: 'ry45', rot: [0, 45, 0], x: 60 },
  { id: 'ry60', rot: [0, 60, 0], x: 90 }, { id: 'ry-45', rot: [0, -45, 0], x: 120 }, { id: 'flatb', rot: [0, 0, 0], x: 150 },
].map((t) => ({ ...t, y: 135 })).concat([-60, -45, -30, -15, 0, 15, 30, 45, 60].map((d, i) => ({ id: d ? `rx${d}` : 'flatc', rot: [d, 0, 0], x: -120 + 30 * i, y: 95 })))
  .map((t) => ({ ...t, w: 24, h: 24 }));
/** run 40055307539's tilted planes at noon (grey of the inner box; null: not drawn — the world was seen through it), by this run's ids */
export const TILT_V1 = { flat: 194, 'rx-45': 107, rx45: 235, ry45: 148, 'ry-45': null };
/** white as white (R3.11): a reference, the colour-mask material (the controller's colour), USE_OVERLAY, USE_EMISSIVE with alpha */
export const BRIGHT = [
  { id: 'ref255', mat: 'cutout', c: 'g255' }, { id: 'ref128', mat: 'cutout', c: 'g128' }, { id: 'fd255', mat: 'fade', c: 'g255' }, { id: 'fd128', mat: 'fade', c: 'g128' },
  { id: 'ov255', mat: 'overlay', c: 'g255' }, { id: 'ov128', mat: 'overlay', c: 'g128' }, { id: 'em255', mat: 'emissive', c: 'g255' }, { id: 'em255h', mat: 'emissive', c: 'w_a128' },
  { id: 'em255z', mat: 'emissive', c: 'w_a8' }, { id: 'em128z', mat: 'emissive', c: 'g128_a8' },
].map((b, i) => ({ ...b, x: -120 + 60 * (i % 5), y: i < 5 ? 165 : 105, w: 30, h: 30 }));
/** the materials only this probe uses (pack.js extraMaterials): what holds moves into pack.js MATS */
export const EXTRA_MATERIALS = { overlay: { '+defines': ['USE_UV_ANIM', 'ALPHA_TEST', 'USE_OVERLAY'] }, emissive: { '+defines': ['USE_UV_ANIM', 'USE_EMISSIVE'] } };
const BRIGHT_BONES = { cutout: 'grl_b_cutout', fade: 'grl_b_fade', overlay: 'grl_b_ovl', emissive: 'grl_b_emis' };
/** depth (R4.10): white squares from z −150 to 150, a row over the sky and one over the ground; two planes 10 apart; two long boards */
export const DEPTH_Z = [-150, -100, -60, -30, 0, 30, 60, 100, 150];
export const DEPTH = [...DEPTH_Z.map((z, i) => ({ id: `sky${z}`, row: 'sky', z, x: -160 + 40 * i, y: 190 })), ...DEPTH_Z.map((z, i) => ({ id: `ground${z}`, row: 'ground', z, x: -160 + 40 * i, y: 75 }))]
  .map((d) => ({ ...d, w: 12, h: 12 }));
export const OVERLAP = { red: { x: -9, y: 135, w: 30, h: 12, z: 5 }, green: { x: 9, y: 135, w: 30, h: 12, z: -5 } };
export const BOARDS = [{ id: 'board0', z: 0, x: 0, y: 110, w: 300, h: 8 }, { id: 'board50', z: 50, x: 0, y: 160, w: 300, h: 8 }];
// ---- the third run's
/** R4.11, the bottom right: white squares at seven depths (one depth a shot: grl:zsel), at the places the second run lost or half lost —
 *  p1 run 40055307539's right45 (hidden at z 0 in both runs), p2 the flat plane beside it (hidden at z 0), p3 where the second run's
 *  square at z 60 was drawn over what is there, p4 where its z 100 was hidden — and p0 in the open sky (every z drawn there: R4.10) */
export const ARM_Z = [-150, -100, -50, 0, 50, 100, 150];
export const ARM_PLACES = [{ id: 'p0', x: -120, y: 175 }, { id: 'p1', x: 120, y: 135 }, { id: 'p2', x: 150, y: 135 }, { id: 'p3', x: 80, y: 75 }, { id: 'p4', x: 120, y: 75 }]
  .map((p) => ({ ...p, w: 12, h: 12 }));
/** R3.11 again: colours on the colour-mask material (fade) — the controller's colour 1.32 and 2 — in the open sky, away from the arm */
export const COLOURS = ['g255', 'g192', 'g128', 'g64', 'red', 'green', 'blue', 'yellow', 'orange'].map((c, i) => ({ id: `c_${c}`, c, x: -120 + 40 * (i % 5), y: i < 5 ? 185 : 145, w: 24, h: 24 }));
/** R3.12 again: tilts of 1° and 5° (does the light turn with the angle near flat?), 45° and 60° about x away from the arm, a flat one */
export const FINE = [['ry1', [0, 1, 0]], ['ry5', [0, 5, 0]], ['rx-1', [-1, 0, 0]], ['rx1', [1, 0, 0]], ['rx5', [5, 0, 0]], ['rx45', [45, 0, 0]], ['rx60', [60, 0, 0]], ['flatf', [0, 0, 0]]]
  .map(([id, rot], i) => ({ id, rot, x: -140 + 30 * i, y: 175, w: 24, h: 24 }));
/** R5.3 again: at 960 high (⌊960/H0⌋ ≥ 4) the widths that pin W0, at 1920 wide (⌊1920/W0⌋ = 5) the heights that pin H0, and a 4K screen
 *  for the cap */
export const GUI3_SIZES = [[1290, 960], [1300, 960], [1320, 960], [1340, 960], [1360, 960], [1920, 760], [1920, 800], [1920, 840], [1920, 880], [1920, 920], [1920, 950], [3840, 2160]];
/** the GUI scales measured before the third run (run 39989463030's 10 screens, run 40061560812's 6): [W, H, scale] */
export const GUI_MEASURED = [[1024, 768, 3], [1104, 920, 3], [1280, 800, 3], [1560, 720, 3], [1920, 1080, 4], [2160, 1080, 4], [2340, 1080, 4], [2400, 1080, 4], [2520, 1080, 4], [3840, 1080, 4],
  [1100, 1000, 3], [960, 540, 2], [1279, 960, 3], [1280, 960, 3], [1920, 959, 4], [2560, 1440, 4]];
/** R5.3's rule C: min(cap, ⌊W/W0⌋, ⌊H/H0⌋) — the 16 screens hold it for 320 < W0 ≤ 1024/3, 180 < H0 ≤ 959/4 and a cap of 4 */
export const guiRuleC = (W, H, w0, h0, cap = 4) => Math.min(cap, Math.floor(W / w0), Math.floor(H / h0));
export const C_BOUNDS = { W0: [320, 1024 / 3], H0: [180, 959 / 4], cap: 4 };
/** the values C can take on a screen within C_BOUNDS (the lower bounds open, the upper closed) */
export function guiRuleCRange(W, H, b = C_BOUNDS) {
  const lo = Math.min(b.cap, Math.floor(W / b.W0[1]), Math.floor(H / b.H0[1])), hi = Math.min(b.cap, Math.ceil(W / b.W0[0]) - 1, Math.ceil(H / b.H0[0]) - 1);
  return [lo, hi];
}
/** the W0 and H0 (on a 0.05 grid in C_BOUNDS) that hold rule C on every [W, H, scale] given: their ranges, or null when none does */
export function guiRuleCFit(screens, b = C_BOUNDS) {
  let w = null, h = null;
  for (let i = 1, w0 = b.W0[0] + 0.05; w0 <= b.W0[1] + 1e-9; i++, w0 = b.W0[0] + 0.05 * i) {
    for (let j = 1, h0 = b.H0[0] + 0.05; h0 <= b.H0[1] + 1e-9; j++, h0 = b.H0[0] + 0.05 * j) {
      if (!screens.every(([W, H, u]) => guiRuleC(W, H, w0, h0, b.cap) === u)) continue;
      w = w ? [Math.min(w[0], w0), Math.max(w[1], w0)] : [w0, w0]; h = h ? [Math.min(h[0], h0), Math.max(h[1], h0)] : [h0, h0];
    }
  }
  return w ? { W0: w.map((x) => Math.round(x * 100) / 100), H0: h.map((x) => Math.round(x * 100) / 100) } : null;
}

// ---- the scene
export function scene() {
  const groups = [{ id: 'cal', anchor: 'center', origin: [0, 0], renderer: false }, { id: 'gui', anchor: 'bottom_middle', scale: { mode: 'gui', px: 1 } }];
  const bones = [], planes = [];
  const showIf = (n) => `(math.mod(math.floor(v.grl_show / ${n}), 2) > 0.5) ? 1 : 0`;
  const uv = (c) => [PI[c] + 0.25, 0.25, 0.5, 0.5];
  // (a model rectangle by its middle (x, y up) as a plane of the 'cal' group, whose origin is the model's)
  const plane = (bone, r, c, z = 0) => planes.push({ bone, texture: 'pal', rect: { x: r.x - r.w / 2, y: -(r.y + r.h / 2), w: r.w, h: r.h }, z, uv: uv(c) });
  // the calibration: a black board far behind, the grid's markers (calib.mjs), on bit 1
  bones.push({ name: 'grl_cal', group: 'cal', scale: showIf(BITS.cal) });
  plane('grl_cal', { x: 0, y: 140, w: 800, h: 360 }, 'black', 100);
  for (const m of markers()) plane('grl_cal', { x: m.x, y: m.y, w: SIZE, h: SIZE }, m.color, m.z);
  // the ramp of greys (bit 2) on a mid-grey board of its own
  bones.push({ name: 'grl_ramp', group: 'cal', scale: showIf(BITS.ramp) });
  plane('grl_ramp', { x: 0, y: 135, w: 240, h: 140 }, 'g96', 50);
  for (const r of RAMP) plane('grl_ramp', r, r.id);
  // the tilted planes (bit 4): each its own bone, turned about its middle (the pivot in the group's local units, y down)
  bones.push({ name: 'grl_tilts', group: 'cal', scale: showIf(BITS.tilt) });
  plane('grl_tilts', { x: 0, y: 115, w: 340, h: 80 }, 'g96', 50);
  for (const t of TILT) {
    const b = `grl_tilt_${t.id.replace('-', 'm')}`;
    bones.push({ name: b, group: 'cal', parent: 'grl_tilts', pivot: [t.x, -t.y], rotation: t.rot });
    plane(b, t, 'white');
  }
  // the GUI frame (bit 8): the hotbar's 182 x 22 JSON UI px, filled, at the bottom's middle (the real hotbar hidden when measured)
  bones.push({ name: 'grl_gui', group: 'gui', scale: showIf(BITS.gui) });
  planes.push({ bone: 'grl_gui', texture: 'pal', rect: { x: -91, y: -22, w: 182, h: 22 }, z: 0, uv: uv('violet') });
  // white as white (bit 16): one bone per material under one that shows them
  bones.push({ name: 'grl_bright', group: 'cal', scale: showIf(BITS.bright) });
  for (const [mat, name] of Object.entries(BRIGHT_BONES)) bones.push({ name, group: 'cal', parent: 'grl_bright', material: mat });
  for (const b of BRIGHT) plane(BRIGHT_BONES[b.mat], b, b.c);
  // depth (bit 32)
  bones.push({ name: 'grl_depth', group: 'cal', scale: showIf(BITS.depth) });
  for (const d of DEPTH) plane('grl_depth', d, 'white', d.z);
  plane('grl_depth', OVERLAP.red, 'red', OVERLAP.red.z);
  plane('grl_depth', OVERLAP.green, 'green', OVERLAP.green.z);
  for (const b of BOARDS) plane('grl_depth', b, 'g96', b.z);
  // the bottom right (bit 64): a bone per depth, shown when grl:zsel picks it; its squares at every place
  bones.push({ name: 'grl_arm', group: 'cal', scale: showIf(BITS.arm) });
  ARM_Z.forEach((z, k) => {
    bones.push({ name: `grl_arm_z${k}`, group: 'cal', parent: 'grl_arm', scale: `(math.abs(v.grl_zsel - ${k}) < 0.5) ? 1 : 0` });
    for (const p of ARM_PLACES) plane(`grl_arm_z${k}`, p, 'white', z);
  });
  // colours on the colour-mask material (bit 128): a fade bone of their own
  bones.push({ name: 'grl_colours', group: 'cal', scale: showIf(BITS.colours) });
  bones.push({ name: 'grl_c_fade', group: 'cal', parent: 'grl_colours', material: 'fade' });
  for (const c of COLOURS) plane('grl_c_fade', c, c.c);
  // the small tilts (bit 256), each turned about its middle like the second run's
  bones.push({ name: 'grl_fine', group: 'cal', scale: showIf(BITS.fine) });
  for (const t of FINE) {
    const b = `grl_fine_${t.id.replace('-', 'm')}`;
    bones.push({ name: b, group: 'cal', parent: 'grl_fine', pivot: [t.x, -t.y], rotation: t.rot });
    plane(b, t, 'white');
  }
  const R = (n, def) => `variable.is_paperdoll ? ${def} : q.property('grl:${n}')`;
  const pre = [`v.grl_show = ${R('show', 0)};`, `v.grl_sc = ${R('sc', SC_DEFAULT)};`, `v.grl_comp = ${R('comp', 0)};`,
    `v.grl_gain = (${R('gain', 1000)}) / 1000;`, `v.grl_ov = (${R('ov', 0)}) / 1000;`,
    `v.grl_zsel = ${R('zsel', 0)};`, `v.grl_hide = ${R('hide', 0)};`, `v.grl_body = ${R('body', 10000)};`];
  // GeoUI Studio's renderer (10 % x 10 % at 110 % from the top's middle): the frame `measure geoui` reads the grid in
  const studio = { grl_studio: { type: 'panel', size: ['10%', '10%'], offset: [0, '110%'], anchor_from: 'top_middle', anchor_to: 'top_middle',
    controls: [{ grl_r_studio: { type: 'custom', renderer: 'live_player_renderer', layer: 1, bindings: [{ binding_name: '#hud_visible', binding_name_override: '#visible' }] } }] } };
  const png = (() => {
    const W = 32, H = 2, img = new Uint8Array(W * H * 4);
    PAL.forEach(([, c], i) => { const px = [c[0], c[1], c[2], c[3] ?? 255]; img.set(px, i * 4); img.set(px, (W + i) * 4); });
    return Buffer.from(encodePng({ width: W, height: H, data: img }));
  })();
  return {
    ns: NS, name: 'GeoUI Rules Probe', description: 'GeoUI の規則を本物の画面で決める（bds-lab: bds/geoui/RULES.md）', seed: 'grl-1',
    uuids: { rp: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d11', rpMod: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d12', bp: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d13', bpData: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d14', bpScript: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d15' },
    scale: { mode: 'height', s: 0.1 }, groups, bones, planes, textures: [{ id: 'pal', width: 32, height: 2, png }], pre, initialize: [],
    properties: [{ name: 'show', range: [0, 1023], default: 0 }, { name: 'sc', range: [1000, 40000], default: SC_DEFAULT }, { name: 'comp', range: [0, 2], default: 0 },
      { name: 'gain', range: [0, 4000], default: 1000 }, { name: 'ov', range: [0, 1000], default: 0 },
      { name: 'zsel', range: [0, 7], default: 0 }, { name: 'hide', range: [0, 1], default: 0 }, { name: 'body', range: [1000, 40000], default: 10000 }],
    // (the player's scale in the UI only — the paper doll and the world keep the vanilla 0.9375; divided by the entity's own scale:
    //  comp 1 by q.model_scale (R4.9: the second run found it 1 in the UI — cancels nothing; none under 0.05 is divided by), comp 2 by
    //  grl:body, the scale the server reads off minecraft:scale (EntityScaleComponent.value) and sends — the third run decides it)
    scaleScript: `variable.is_paperdoll ? 0.9375 : (q.is_in_ui ? ((v.grl_sc ?? ${SC_DEFAULT}) / 10000) / (((v.grl_comp ?? 0) > 1.5) ? ((v.grl_body ?? 10000) / 10000) : ((((v.grl_comp ?? 0) > 0) && q.model_scale > 0.05) ? q.model_scale : 1)) : 0.9375)`,
    // (GeoUI Screen's frozen camera hides the player's own body from it: the third run's free camera does the same — grl:cam)
    hideLocalPlayer: 'v.grl_hide > 0',
    // (R3.11: the controller's colour above 1, and a white overlay — on whichever material takes them)
    rcPatch: { color: { r: 'v.grl_gain ?? 1', g: 'v.grl_gain ?? 1', b: 'v.grl_gain ?? 1', a: 1 }, overlay_color: { r: 1, g: 1, b: 1, a: 'v.grl_ov ?? 0' } },
    extraMaterials: EXTRA_MATERIALS,
    patchPlayer: ({ bp }) => {
      const e = bp['minecraft:entity'];
      e.component_groups = Object.assign({}, e.component_groups, { 'grl:small': { 'minecraft:scale': { value: 0.5 } } });
      e.events = Object.assign({}, e.events, { 'grl:small': { add: { component_groups: ['grl:small'] } }, 'grl:normal': { remove: { component_groups: ['grl:small'] } } });
    },
    extraControls: [studio], script: SCRIPT,
  };
}

// ---- where things land (px) on a W x H screen, from the formulas: Studio's frame
/** a model rectangle (x, y its middle, model units) in Studio's renderer → screen px (scale: the player's, in the UI) */
export function studioRect(r, W, H, scale = 0.9375, d = L.D) {
  const side = Math.min(0.1 * W, 0.1 * H), u = (scale / 16) * side, cx = W / 2, cy = 1.1 * H + 0.05 * H;
  const X = (x) => cx + u * x, Y = (y) => cy - u * (y - d);
  return { x0: X(r.x - r.w / 2), x1: X(r.x + r.w / 2), y0: Y(r.y + r.h / 2), y1: Y(r.y - r.h / 2) };
}
/** the middle of a box, shrunk to its inner part (what `measure color` averages: no edge, no neighbour) */
const inner = (b, f = 0.25) => { const dx = (b.x1 - b.x0) * f, dy = (b.y1 - b.y0) * f; return [b.x0 + dx, b.y0 + dy, b.x1 - dx, b.y1 - dy].map((v) => Math.round(v)); };
export const guiRuleA = (W, H) => Math.min(Math.floor(W / 320), Math.floor(H / 240));
export const guiRuleB = (W, H) => Math.floor(H / 240);
/** the screen's middle in Studio's frame, in model units: the panel's middle is 1.15 H down, the screen's 0.5 H — 0.65 H = 6.5 panel
 *  sides, a panel side 16 / scale model units — above the origin's D */
export const centreOf = (s, dModel = L.D) => dModel + 6.5 * 16 / s;
const tag = (s) => String(s).replace('.', '_');

// ---- the boxes `measure color` reads (the screen the run plays on: 1560 x 720), in the order app.txt measures them
const SW = 1560, SH = 720;
const at = (r, f = 0.25) => inner(studioRect(r, SW, SH), f);
export const PROBES = {
  ramp: [...RAMP.map((r) => ({ id: r.id, box: at(r) })), { id: 'board50', box: at({ x: -35, y: 135, w: 10, h: 10 }, 0) }],
  invisible: ['g255', 'g0'].map((id) => ({ id, box: at(RAMP.find((r) => r.id === id)) })),
  bright: BRIGHT.map((b) => ({ id: b.id, box: at(b) })),
  hurt: ['ref255', 'ov255'].map((id) => ({ id, box: at(BRIGHT.find((b) => b.id === id)) })),
  tilt: [...TILT.map((t) => ({ id: t.id, box: at(t, 0.3) })), { id: 'board50', box: at({ x: 0, y: 115, w: 20, h: 8 }, 0) }],
  depth: [...DEPTH.map((d) => ({ id: d.id, box: at(d) })),
    { id: 'overlap', box: at({ x: 0, y: 135, w: 8, h: 8 }, 0) }, { id: 'redOnly', box: at({ x: -17, y: 135, w: 8, h: 8 }, 0) }, { id: 'greenOnly', box: at({ x: 17, y: 135, w: 8, h: 8 }, 0) },
    ...BOARDS.flatMap((b) => [-100, 100].map((x) => ({ id: `${b.id}@${x}`, box: at({ x, y: b.y, w: 12, h: 4 }, 0) })))],
  calBoard: [{ id: 'board100', box: at({ x: 0, y: 200, w: 16, h: 16 }, 0) }],
  // (the third run's)
  arm: ARM_PLACES.map((p) => ({ id: p.id, box: at(p) })),
  colours: COLOURS.map((c) => ({ id: c.id, box: at(c) })),
  fine: FINE.map((t) => ({ id: t.id, box: at(t, 0.3) })),
};

// ---- the predictions (written before the run)
export function predictions() {
  const H = (s) => r4(16 / (0.1 * s));
  // (a colour on the colour-mask material at the controller's colour g: each channel 0.757 x g x its value + 2 (the light's offset),
  //  held at 236 — white stopped there at 1.32 in run 40061560812 while grey 128 came out as it was put in)
  const CAP = 236, fadeOut = (v, g) => r4(Math.min(CAP, LIGHT * g * v + 2));
  const rgb = (name) => PAL.find(([n]) => n === name)[1].slice(0, 3);
  return {
    version: 3, made: 'bds/geoui/screen/rules.mjs', note: 'Written before the run. verdict compares the run with these numbers.',
    earlier: ['bds/geoui/rules-history/run-40055307539/', 'bds/geoui/rules-history/run-40061560812/'],
    // R4.11: per place, which depths are drawn (lit white if so) — first person, then GeoUI Screen's frozen camera (minecraft:free)
    arm: { shots: ARM_Z.map((z, k) => `arm-z${k}`), zs: ARM_Z, places: ARM_PLACES.map(({ id, x, y }) => ({ id, x, y })), sky: 'p0', ifDrawn: lit(255),
      seen: { p1: 'z 0 hidden in runs 40055307539 and 40061560812', p2: 'z 0 hidden (40061560812)', p3: 'z 60 drawn over it (40061560812)', p4: 'z 100 hidden (40061560812)' },
      ifDepth: 'at every place the drawn depths are the smaller ones — drawn up to a z*, hidden beyond it (p3: z* at least 50; p1, p2: below 0); p0 every z',
      ifOrder: 'p1–p4 hidden at every z (whatever is there is drawn after GeoUI); p0 every z',
      camera: { shot: 'arm-cam', against: 'the first-person world', ifArm: 'the change all at the bottom right (x 1000 and more, y 330 and more), p1–p4 in it: the arm gone' },
      free: { shot: 'arm-free', z: 0, ifArm: 'p1–p4 drawn (193)', ifNot: 'p1–p4 hidden as in first person' } },
    // R3.11: each patch's channels at the controller's colour 1.32 and 2, if each channel is held at 236 by itself (per channel); held as
    // a whole colour (its hue kept) orange's green would be half its red (118 at 1.32) where per channel it is 130
    colours: { shots: { '1.32': 'colours-132', 2: 'colours-200' }, ids: COLOURS.map((c) => c.id), cap: CAP,
      perChannel: Object.fromEntries([1.32, 2].map((g) => [String(g), Object.fromEntries(COLOURS.map((c) => [c.id, rgb(c.c).map((v) => fadeOut(v, g))]))])),
      hueKept: Object.fromEntries([1.32, 2].map((g) => { const c = rgb('orange').map((v) => LIGHT * g * v + 2), k = Math.min(1, CAP / Math.max(...c)); return [String(g), { c_orange: c.map((x) => r4(x * k)) }]; })) },
    // R3.11: the white overlay at 1 on USE_OVERLAY (it mixed after the light at 0.24): all the overlay's colour — 255, or held at 236
    ov1: { shot: 'bright-ov1', ov: 1, ids: ['ov255', 'ov128'], ifFree: { ov255: 255, ov128: 255 }, ifHeld: { ov255: CAP, ov128: CAP }, cutoutUnchanged: { ref255: lit(255) } },
    // R3.12: by the tilt's sign (the second run: about y ±15…±60° 148, about x −15…−60° 107, +15 and +30° 235)
    fine: { shot: 'tilt-fine', planes: FINE.map(({ id, rot, x, y }) => ({ id, rot, x, y })), bySign: { ry1: 148, ry5: 148, 'rx-1': 107, rx1: 235, rx5: 235, rx45: 235, rx60: 235, flatf: 194 },
      ifSmooth: 'the light turns with the angle: 1° within 3 of flat (194)' },
    // R4.9: scripts.scale / grl:body (the server's minecraft:scale 0.5) with comp 2 — cancelled, the grid as at the vanilla scale
    body: { shot: 'cal-body', cancels: { unitsPerScreenH: H(0.9375), centreY: r4(centreOf(0.9375)) }, notCancelled: { unitsPerScreenH: H(0.9375 * 0.5), centreY: r4(centreOf(0.9375 * 0.5)) } },
    // R5.3: rule C's values on each screen within its bounds (one value: C says it; two: the screen pins W0 or H0); the cap 4 at 4K
    gui3: GUI3_SIZES.map(([W, Hh]) => ({ shot: `gui-${W}x${Hh}`, W, H: Hh, C: guiRuleCRange(W, Hh) })), cBounds: { W0: [320, r4(1024 / 3)], H0: [180, r4(959 / 4)], cap: 4 },
    control: CONTROL_SCALES.map((s) => ({ shot: `cal-s${tag(s)}`, scale: s, unitsPerScreenH: H(s), centreY: r4(centreOf(s)) })),
    calBoard: { shot: 'cal-s0_9375', ifDrawn: 0 },
  };
}

// ---- the behaviour pack's script
const SCRIPT = `// GeoUI rules probe (bds-lab: bds/geoui/screen/rules.mjs makes this file — change that, not this).
// /scriptevent grl:show <bits> · grl:scale <s> (the player's scale in the UI) · grl:comp 0|1|2 (divided by q.model_scale | by grl:body)
// · grl:body (grl:body = minecraft:scale's value, as the server reads it) · grl:gain <x> (the controller's colour) · grl:ov <a> (a white
// overlay) · grl:zsel <0…7> (the depth the bottom right's squares are at) · grl:cam 1|0 (GeoUI Screen's frozen camera: minecraft:free at
// the head, the body hidden) · grl:sneak 0|1 · grl:anim <animation>|stop · grl:small 0|1 (minecraft:scale 0.5 by an event, as another
// add-on would) · grl:state
import { world, system, Player } from '@minecraft/server';
const log = (s) => console.warn('GRL ' + s);
const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(4), args = String(e.message).trim().split(/\\s+/).filter(Boolean);
  const players = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of players) {
    try {
      if (verb === 'show') { p.setProperty('grl:show', Math.max(0, Math.min(1023, parseInt(args[0], 10) || 0))); log('show ' + p.getProperty('grl:show')); }
      else if (verb === 'scale') { const s = num(args[0], 0.1, 4); if (s === null) { log('scale <0.1…4>'); continue; } p.setProperty('grl:sc', Math.round(s * 10000)); log('scale ' + s); }
      else if (verb === 'comp') { p.setProperty('grl:comp', args[0] === '2' ? 2 : args[0] === '1' ? 1 : 0); log('comp ' + p.getProperty('grl:comp')); }
      else if (verb === 'body') { const sc = p.getComponent('minecraft:scale'), v = sc ? sc.value : 1; p.setProperty('grl:body', Math.round(Math.max(0.1, Math.min(4, v)) * 10000)); log('body ' + v); }
      else if (verb === 'zsel') { const k = parseInt(args[0], 10); if (!(k >= 0 && k <= 7)) { log('zsel <0…7>'); continue; } p.setProperty('grl:zsel', k); log('zsel ' + k); }
      else if (verb === 'cam') {
        // (as GeoUI Screen freezes it: minecraft:free where the head is, looking where it looks; the body hidden from it)
        if (args[0] === '1') { p.camera.setCamera('minecraft:free', { location: p.getHeadLocation(), rotation: p.getRotation() }); p.setProperty('grl:hide', 1); }
        else { p.camera.clear(); p.setProperty('grl:hide', 0); }
        log('cam ' + (args[0] === '1' ? 1 : 0));
      }
      else if (verb === 'gain') { const g = num(args[0], 0, 4); if (g === null) { log('gain <0…4>'); continue; } p.setProperty('grl:gain', Math.round(g * 1000)); log('gain ' + g); }
      else if (verb === 'ov') { const a = num(args[0], 0, 1); if (a === null) { log('ov <0…1>'); continue; } p.setProperty('grl:ov', Math.round(a * 1000)); log('ov ' + a); }
      else if (verb === 'sneak') { p.isSneaking = args[0] === '1'; log('sneak ' + p.isSneaking); }
      else if (verb === 'anim') {
        // (one controller of our own: the next animation on it replaces the last; stop = the plain pose)
        p.playAnimation(args[0] === 'stop' ? 'animation.humanoid.base_pose' : args[0], { controller: 'grl_pose', blendOutTime: 0 });
        log('anim ' + args[0]);
      } else if (verb === 'small') { p.triggerEvent(args[0] === '1' ? 'grl:small' : 'grl:normal'); log('small ' + args[0]); }
      else if (verb === 'state') { const sc = p.getComponent('minecraft:scale'); log('state ' + JSON.stringify({ show: p.getProperty('grl:show'), sc: p.getProperty('grl:sc'), comp: p.getProperty('grl:comp'), gain: p.getProperty('grl:gain'), ov: p.getProperty('grl:ov'), zsel: p.getProperty('grl:zsel'), hide: p.getProperty('grl:hide'), body: p.getProperty('grl:body'), sneaking: p.isSneaking, scale: sc ? sc.value : 1 })); }
      else log('unknown ' + verb);
    } catch (err) { log(verb + ' error ' + err); }
  }
}, { namespaces: ['grl'] });
`;

// ---- the real app (Android, 1560 x 720 across): the new questions first (a run that stops early keeps them), the GUI's screens and
//      the control last
const HUD_OFF = ['crosshair', 'health', 'hunger', 'armor', 'progress_bar', 'air_bubbles', 'status_effects', 'item_text', 'tooltips', 'paperdoll', 'touch_controls'];
export function appTxt() {
  const lines = [`# GeoUI の規則を決める 3 本目（bds/geoui/screen/rules.mjs が作る。予測は predictions.json: 走らせる前にコミットしたもの）`,
    `# 1 本目・2 本目（run 40055307539・40061560812）で決まった事と、その予測・手順は bds/geoui/rules-history/run-<番号>/`,
    `# node lab.mjs app ci -a geoui_rules --screen 720x1560 --knobs "APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"（人の許可をもらってから）→ node bds/geoui/screen/rules.mjs verdict <summary.json>`, '',
    // (the game stopped and started again first: the prepared device's first join from its snapshot failed often in the device and
    //  HTML runs — app/DESIGN.md)
    'section title', 'stop', 'launch', 'until title 600000', 'shot title', '',
    'section join', 'join', 'until joined 900000', 'do tp @a 0 -60 0 0 0', 'do gamemode adventure @a', 'do time set noon', 'do weather clear',
    ...HUD_OFF.map((h) => `do hud @a hide ${h}`), 'do scriptevent grl:show 0', 'wait 6000', 'absent clientlog \\bERROR\\b', ''];
  const world = ['do scriptevent grl:show 0', 'wait 1500', 'shot world'];
  const measure = (shot, list) => list.map((p) => `measure color ${shot} ${p.box.join(' ')}`);
  const cal = (shot) => ['wait 1500', `shot ${shot}`, `measure geoui ${shot}`];
  // R4.11: the bottom right — seven depths in first person; the camera frozen as GeoUI Screen freezes it (what changed: the arm gone?);
  // the squares at z 0 under it
  lines.push('section arm', ...world, `do scriptevent grl:show ${BITS.arm}`);
  ARM_Z.forEach((z, k) => lines.push(`do scriptevent grl:zsel ${k}`, 'wait 1200', `shot arm-z${k}`, ...measure(`arm-z${k}`, PROBES.arm)));
  lines.push('do scriptevent grl:show 0', 'do scriptevent grl:cam 1', 'wait 2500', 'shot arm-cam', 'measure diff arm-cam', 'shot world',
    `do scriptevent grl:zsel ${ARM_Z.indexOf(0)}`, `do scriptevent grl:show ${BITS.arm}`, 'wait 1500', 'shot arm-free', ...measure('arm-free', PROBES.arm),
    'do scriptevent grl:show 0', 'do scriptevent grl:cam 0', 'do scriptevent grl:zsel 0', 'wait 2500', '');
  // R3.11: colours on the colour-mask material at the controller's colour 1.32 and 2; the white overlay at 1
  lines.push('section colours', ...world, 'do scriptevent grl:gain 1.32', `do scriptevent grl:show ${BITS.colours}`, 'wait 1500', 'shot colours-132', ...measure('colours-132', PROBES.colours),
    'do scriptevent grl:gain 2', 'wait 1500', 'shot colours-200', ...measure('colours-200', PROBES.colours), 'do scriptevent grl:gain 1', 'do scriptevent grl:show 0', '');
  lines.push('section overlay-1', ...world, 'do scriptevent grl:ov 1', `do scriptevent grl:show ${BITS.bright}`, 'wait 1500', 'shot bright-ov1', ...measure('bright-ov1', PROBES.bright),
    'do scriptevent grl:ov 0', 'do scriptevent grl:show 0', '');
  // R3.12: tilts of 1° and 5°, 45° and 60° about x where the arm is not
  lines.push('section fine', ...world, `do scriptevent grl:show ${BITS.fine}`, 'wait 1500', 'shot tilt-fine', ...measure('tilt-fine', PROBES.fine), 'do scriptevent grl:show 0', '');
  // R4.9: the body's scale sent by the server, divided by in the UI
  lines.push('section body', `do scriptevent grl:show ${BITS.cal}`, 'do scriptevent grl:small 1', 'wait 1000', 'do scriptevent grl:body', 'do scriptevent grl:comp 2', ...cal('cal-body'),
    'do scriptevent grl:comp 0', 'do scriptevent grl:small 0', 'wait 1000', 'do scriptevent grl:body', 'do scriptevent grl:show 0', 'wait 1000', '');
  // R5.3: the GUI scale on 12 screens (the real hotbar hidden: the whole frame is seen)
  lines.push('section gui', 'do hud @a hide hotbar', '');
  for (const [w, h] of GUI3_SIZES) lines.push(`section gui-${w}x${h}`, `size ${w}x${h}`, 'wait 9000', ...world,
    `do scriptevent grl:show ${BITS.gui}`, 'wait 2000', `shot gui-${w}x${h}`, `measure marks gui-${w}x${h}`, '');
  // the control: run 40055307539's scales again, as it saw them (the hotbar shown), and the calibration's black board (z 100) — against
  // a `shot world` of this size (run 40061560812 measured the board against the last GUI screen's and lost it and the rest)
  lines.push('section control', 'size reset', 'wait 6000', 'do hud @a reset', ...HUD_OFF.map((h) => `do hud @a hide ${h}`), ...world, `do scriptevent grl:show ${BITS.cal}`);
  for (const s of CONTROL_SCALES) {
    lines.push(`do scriptevent grl:scale ${s}`, ...cal(`cal-s${tag(s)}`));
    if (s === 0.9375) lines.push(...measure(`cal-s${tag(s)}`, PROBES.calBoard));
  }
  lines.push('do scriptevent grl:scale 0.9375', '');
  lines.push('section end', 'do scriptevent grl:show 0', 'do hud @a reset', 'do time set noon', 'shot end', '');
  return lines.join('\n');
}

// ---- reading a run: each hypothesis held, fell, or was not measured
const grey = (v) => (v ? (v.r + v.g + v.b) / 3 : null);
/** what a colour box shows: a GeoUI plane is one flat colour (its spread under 2.5) unlike the world; the world's own colour (the
 *  newest `shot world`, same box) means nothing was drawn there. o.grey: the plane is grey (r = g = b) — a flat colour that is not
 *  grey is something else in front of it, not the plane (run 40061560812: the bottom right's flat blue and lavender, a little off
 *  the world's picture as it moved, read as drawn planes of 35 and 166 before) */
export function look(v, o = {}) {
  if (!v || !Number.isFinite(v.r)) return { kind: 'none' };
  const g = grey(v), off = Number.isFinite(v.br) ? Math.abs(v.r - v.br) + Math.abs(v.g - v.bg) + Math.abs(v.b - v.bb) : Infinity;
  const notGrey = !!o.grey && Math.max(v.r, v.g, v.b) - Math.min(v.r, v.g, v.b) > 8;
  return { kind: off < 15 || (Number.isFinite(v.spread) && v.spread > 2.5) || notGrey ? 'world' : 'drawn', g, v };
}
/** the boxes whose plane is not grey (the depth's red and green) */
const COLOURED = new Set(['overlap', 'redOnly', 'greenOnly']);
const say = (o) => (o && o.kind === 'drawn' ? o.g.toFixed(0) : o && o.kind === 'world' ? '描かれない' : '—');
const nearest = (x, table) => Object.entries(table).sort((a, b) => Math.abs(x - a[1]) - Math.abs(x - b[1]))[0];
const fit = (pts) => { const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0), sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0); const a = (n * sxy - sx * sy) / (n * sxx - sx * sx); return { a, b: (sy - a * sx) / n }; };

/** summary: summary.json (or its measures). pr: the predictions committed before that run (default: this version's). appText: that
 *  run's app.txt (failed lines → which measure failed: a public summary keeps a failed measure only within its first measures) */
export function verdict(summary, pr = predictions(), appText = null) {
  const measures = Array.isArray(summary) ? summary : (summary && summary.measures) || [];
  const failedLines = new Set(Array.isArray(summary) ? [] : (summary && summary.failed_lines) || []);
  const lineOf = (re) => { if (!appText) return null; const i = appText.split('\n').findIndex((l) => re.test(l)); return i < 0 ? null : i + 1; };
  const out = [];
  const by = (shot, kind) => measures.filter((m) => m.shot === shot && (!kind || m.kind === kind));
  const geo = (shot) => { const m = by(shot, 'geoui')[0]; return m && m.ok ? m.values : null; };
  const pct = (a, b) => 100 * (a - b) / b;
  /** a shot's colour boxes by id (in the order app.txt measured them); grey planes but the depth's red and green (o.grey false: the
   *  hurt flash, whose red is the question) */
  const read = (shot, list, o = {}) => { const ms = by(shot, 'color'); return Object.fromEntries(list.map((p, i) => [p.id, look(ms[i] && ms[i].ok ? ms[i].values : null, { grey: o.grey !== false && !COLOURED.has(p.id) })])); };
  const any = (o) => Object.values(o).some((x) => x.kind !== 'none');
  // ---- version 1 (run 40055307539): scale, origin, the body's scale, poses
  if (Array.isArray(pr.scale)) {
    const sc = pr.scale.map((p) => ({ p, v: geo(p.shot) })).filter((x) => x.v);
    // (the clean scales — whole and half px a unit — decide; 0.9375's unit is 4.21875 px: its edges are smoothed, its height 0.4 % off)
    const clean = sc.filter((x) => x.p.scale !== 0.9375);
    if (clean.length >= 2) {
      const worst = Math.max(...clean.map((x) => Math.abs(pct(x.v.unitsPerScreenH, x.p.unitsPerScreenH))));
      out.push({ rule: 'R4.1', claim: '1 モデル単位 = scripts.scale / 16 x パネルの短い辺', result: worst <= 0.1 ? '成り立つ' : '成り立たない', detail: sc.map((x) => `scale ${x.p.scale}: 高さ ${x.v.unitsPerScreenH.toFixed(3)}（予測 ${x.p.unitsPerScreenH}）`).join(' / ') });
      const d = clean.map((x) => x.v.centreY - 6.5 * 16 / x.p.scale), dm = d.reduce((s, x) => s + x, 0) / d.length, spread = Math.max(...d) - Math.min(...d);
      const eM = Math.max(...clean.map((x) => Math.abs(x.v.centreY - x.p.centreY_M))), eW = Math.max(...clean.map((x) => Math.abs(x.v.centreY - x.p.centreY_W)));
      out.push({ rule: 'R4.2', claim: '原点のずれ D は何で決まるか', result: spread < 0.05 && eM < eW ? `M: モデルの単位で ${dm.toFixed(3)}（scale によらない）` : eW < eM ? 'W: ブロックで決まった長さ' : 'どちらでもない',
        detail: `scale ごとの D: ${d.map((x) => x.toFixed(3)).join(' ')}（予測 M との差 ${eM.toFixed(2)}・W との差 ${eW.toFixed(2)} 単位）` });
    } else out.push({ rule: 'R4.1', claim: '1 モデル単位 = scripts.scale / 16 x パネルの短い辺', result: '測れなかった', detail: `測れた scale ${sc.length} 個` });
    const sm = pr.entityScale && geo(pr.entityScale.shot), base = geo('cal-s0_9375');
    if (sm && base) {
      const ratio = sm.unitsPerScreenH / base.unitsPerScreenH;
      out.push({ rule: 'R4.8', claim: 'プレイヤーの minecraft:scale（他のアドオンが変える）に renderer が付いてくるか', result: Math.abs(ratio - 2) < 0.02 ? '付いてくる（minecraft:scale が単位に掛かる: GeoUI が縮む）' : Math.abs(ratio - 1) < 0.01 ? '付いてこない' : 'どちらでもない',
        detail: `高さ ${sm.unitsPerScreenH.toFixed(2)} 単位（いつもの ${base.unitsPerScreenH.toFixed(2)} の ${ratio.toFixed(3)} 倍）・中心 ${sm.centreY.toFixed(2)}（scale 0.46875 なら ${centreOf(0.46875).toFixed(2)}）` });
    }
    if (Array.isArray(pr.poses)) {
      // (against the same run's shot at the vanilla scale: the same picture but for the pose — not against the formula)
      const seen = pr.poses.map((p) => ({ p, v: geo(p.shot) })).filter((x) => x.v);
      const moved = base ? seen.filter((x) => Math.abs(pct(x.v.unitsPerScreenH, base.unitsPerScreenH)) > 0.1 || Math.abs(x.v.centreY - base.centreY) > 0.1) : [];
      out.push({ rule: 'R2.3', claim: '姿勢・乗り物・視点で GeoUI は動かない', result: !seen.length || !base ? '測れなかった' : moved.length ? `動いた（${moved.map((x) => x.p.shot).join(' ')}）` : '成り立つ（姿勢そのものが起きたかは写真で: 封じた結果）',
        detail: seen.map((x) => `${x.p.shot}: 高さ ${x.v.unitsPerScreenH.toFixed(3)}・中心 ${x.v.centreY.toFixed(3)}`).join(' / ') });
    }
  }
  // ---- R3.11: white as white
  if (pr.bright) {
    const B = pr.bright, P0 = read(B.shots.plain, PROBES.bright), PG = read(B.shots.gain, PROBES.bright), PO = read(B.shots.ov, PROBES.bright);
    if (any(P0) || any(PG) || any(PO)) {
      const g = (o, id) => (o[id] && o[id].kind === 'drawn' ? o[id].g : null);
      const em = g(P0, 'em255z'), fd = g(PG, 'fd255'), ov = g(PO, 'ov128'), refG = g(PG, 'ref128');
      const emSays = P0.em255z.kind === 'world' ? 'アルファ 8 の面は描かれない' : em === null ? '—' : `${nearest(em, { lerp: B.emissive.lerp.em255z, full: B.emissive.full.em255z, none: B.emissive.none.em255z })[0]}（アルファ 8 の白 → ${em.toFixed(0)}）`;
      const ovSays = ov === null ? '—' : `${nearest(ov, { after: B.overlay.after.ov128, before: B.overlay.before.ov128, none: B.overlay.none.ov128 })[0]}（灰 128 → ${ov.toFixed(0)}）`;
      const routes = [em !== null && em >= 240 && 'emissive', fd !== null && fd >= 240 && 'fade と色の倍率', g(PO, 'ov255') !== null && g(PO, 'ov255') >= 240 && 'overlay'].filter(Boolean);
      out.push({ rule: 'R3.11', claim: '光の 0.757 倍より明るく、白を白に出せるか', result: routes.length ? `出せる: ${routes.join('・')}` : '出せる道は無かった',
        detail: `emissive: ${emSays} / fade に色の倍率 ${B.gain}: 白 ${fd === null ? say(PG.fd255) : fd.toFixed(0)}（cutout の灰 128 は ${refG === null ? '—' : refG.toFixed(0)}）/ overlay ${B.ov}: ${ovSays}`
          + ` / そのまま: ${PROBES.bright.map((p) => `${p.id} ${say(P0[p.id])}`).join(' ')}` });
    }
  }
  // ---- R4.10: depth
  if (pr.depth) {
    const D = read(pr.depth.shot, PROBES.depth);
    if (any(D)) {
      const row = (r) => pr.depth.zs.map((z) => `${z} ${say(D[`${r}${z}`])}`).join(' ');
      const drawnZ = (r) => pr.depth.zs.filter((z) => D[`${r}${z}`].kind === 'drawn');
      const o = D.overlap, front = o.kind !== 'drawn' ? null : o.v.r > o.v.g + 40 ? 'red' : o.v.g > o.v.r + 40 ? 'green' : null;
      const zs = [...new Set([...drawnZ('sky'), ...drawnZ('ground')])].sort((a, b) => a - b);
      out.push({ rule: 'R4.10', claim: '奥行き（z）はどこまで描かれるか・どちらが手前か・長い板', result: `${zs.length ? `描かれた z: ${zs.join(' ')}` : '描かれた四角なし'}・${front === 'green' ? '小さい z が手前（pack.js の通り）' : front === 'red' ? '大きい z が手前（pack.js と逆）' : '前後は分からない'}`,
        detail: `空の前: ${row('sky')} / 地面の前: ${row('ground')} / 重なり ${o.kind === 'drawn' ? `rgb(${[o.v.r, o.v.g, o.v.b].map(Math.round)})` : say(o)} / 板: ${BOARDS.flatMap((b) => [-100, 100].map((x) => `${b.id}@${x} ${say(D[`${b.id}@${x}`])}`)).join(' ')}` });
    }
  }
  // ---- R3.7 and R3.12: the light — the ramp's fit (out = a x in + b) per condition; the tilted planes
  const rows = [];
  for (const cond of ['noon', 'midnight', 'nightvision', 'box']) {
    const ms = by(`ramp-${cond}`, 'color');
    if (!ms.length) continue;
    const pts = RAMP.map((r, i) => [r.grey, ms[i] && ms[i].ok ? grey(ms[i].values) : null]).filter((p) => p[1] !== null && p[0] > 0), f = pts.length >= 3 ? fit(pts) : null;
    const board = ms[RAMP.length] ? say(look(ms[RAMP.length].ok ? ms[RAMP.length].values : null, { grey: true })) : null;
    rows.push(`${cond}: ${f ? `出る色 = ${f.a.toFixed(4)} x 入れた色 ${f.b >= 0 ? '+' : '−'} ${Math.abs(f.b).toFixed(1)}` : '—'}${board ? `（z 50 の板 ${board}）` : ''}`);
  }
  if (rows.length) out.push({ rule: 'R3.7', claim: '板の色にかかる光（時刻・暗視・閉じた箱）', result: '値（下）', detail: rows.join(' / ') });
  const tiltIds = pr.tilt ? pr.tilt.planes.map((t) => t.id) : ((pr.light && pr.light.patches) || []).filter((p) => p.startsWith('tilt-')).map((p) => p.slice(5));
  const tiltRows = [];
  for (const cond of ['noon', 'midnight']) {
    const ms = by(`tilt-${cond}`, 'color');
    if (!ms.length) continue;
    tiltRows.push(`${cond}: ${tiltIds.map((id, i) => `${id} ${say(look(ms[i] && ms[i].ok ? ms[i].values : null, { grey: true }))}`).join(' ')}`);
  }
  if (tiltRows.length) {
    const ms = by('tilt-noon', 'color'), seen = (id) => { const i = tiltIds.indexOf(id); return i >= 0 && ms[i] && ms[i].ok ? look(ms[i].values, { grey: true }) : { kind: 'none' }; };
    const gone = tiltIds.filter((id) => seen(id).kind === 'world');
    out.push({ rule: 'R3.12', claim: '面の向きで明るさが変わる（傾けた板）', result: gone.length ? `描かれない面: ${gone.join(' ')}` : '全部描かれた', detail: tiltRows.join(' / ') });
  }
  // ---- R3.9 invisibility
  if (pr.invisible) {
    const o = read(pr.invisible.shot, PROBES.invisible), d = by(pr.invisible.shot, 'diff')[0];
    if (any(o)) out.push({ rule: 'R3.9', claim: '透明化のポーションの間も GeoUI は描かれる', result: o.g255.kind === 'drawn' && Math.abs(o.g255.g - pr.invisible.ifDrawn.g255) < 12 ? '描かれる' : o.g255.kind === 'world' ? '描かれない' : 'どちらでもない',
      detail: `白 ${say(o.g255)}・黒 ${say(o.g0)}${d && d.ok ? `・画面の変わった割合 ${(100 * d.values.share).toFixed(2)} %` : ''}` });
  } else if (failedLines.size && appText) {
    // (run 40055307539 measured it last: its failed line says the grid was not found)
    const line = lineOf(/^measure geoui cal-invisible$/);
    if (line && failedLines.has(line)) out.push({ rule: 'R3.9', claim: '透明化のポーションの間も GeoUI は描かれる', result: '描かれない見込み（目盛りが見つからなかった。写真は封じた結果）', detail: `app.txt ${line} 行目の measure geoui が失敗` });
  }
  // ---- R3.8 the hurt flash
  if (pr.hurt && Array.isArray(pr.hurt.shots)) {
    const hs = pr.hurt.shots.map((s) => read(s, PROBES.hurt, { grey: false })).filter(any);
    if (hs.length) {
      const red = (o) => o.kind === 'drawn' && o.v.r - (o.v.g + o.v.b) / 2 > 20;
      const reds = hs.flatMap((o) => pr.hurt.ids.filter((id) => red(o[id])));
      out.push({ rule: 'R3.8', claim: 'ダメージの赤い点滅（is_hurt_color の a 0）は GeoUI にかからない', result: reds.length ? `赤くなった（${[...new Set(reds)].join(' ')}）` : `赤くならなかった（${hs.length} 回とも。点滅の最中を写せたかは写真で）`,
        detail: hs.map((o, k) => `${k + 1} 回目: ${pr.hurt.ids.map((id) => `${id} ${o[id].kind === 'drawn' ? `rgb(${[o[id].v.r, o[id].v.g, o[id].v.b].map(Math.round)})` : say(o[id])}`).join(' ')}`).join(' / ') });
    }
  }
  // ---- R4.9 cancelling the body's scale
  if (pr.comp) {
    const v = geo(pr.comp.shot);
    // (what q.model_scale must have been: the unit is (0.9375 / it) x 0.5 / 16 of the panel — the screen 160 / that scale high)
    if (v) out.push({ rule: 'R4.9', claim: 'UI の中で scripts.scale を q.model_scale で割ると、体の大きさ（minecraft:scale）を打ち消せる', result: Math.abs(pct(v.unitsPerScreenH, pr.comp.cancels.unitsPerScreenH)) < 0.6 ? '打ち消せる（q.model_scale = minecraft:scale）' : Math.abs(pct(v.unitsPerScreenH, pr.comp.notCancelled.unitsPerScreenH)) < 0.6 ? '打ち消せない（q.model_scale が体の大きさを返さない）' : 'どちらでもない',
      detail: `高さ ${v.unitsPerScreenH.toFixed(2)}（打ち消せれば ${pr.comp.cancels.unitsPerScreenH}、そうでなければ ${pr.comp.notCancelled.unitsPerScreenH}）・q.model_scale は ${(0.9375 * 0.5 * v.unitsPerScreenH / 160).toFixed(3)} だった計算` });
  }
  // ---- R5.3 the GUI scale
  if (Array.isArray(pr.gui)) {
    const gui = pr.gui.map((p) => { const m = by(p.shot, 'marks')[0], v = m && m.ok ? m.values : null; return { p, ui: v && Number.isFinite(v.violetx0) ? (v.violetx1 - v.violetx0) / 182 : null }; });
    const gm = gui.filter((x) => x.ui !== null), aOk = gm.every((x) => Math.abs(x.ui - x.p.A) < 0.1), bOk = gm.every((x) => Math.abs(x.ui - x.p.B) < 0.1);
    if (gm.length) out.push({ rule: 'R5.3', claim: 'GUI の倍率 = min(⌊幅/320⌋, ⌊高さ/240⌋)（A）か ⌊高さ/240⌋（B）か', result: aOk && !bOk ? 'A' : bOk && !aOk ? 'B' : aOk && bOk ? 'A と B を分ける画面が測れていない' : 'どちらでもない',
      detail: gm.map((x) => `${x.p.W}x${x.p.H}: ${x.ui.toFixed(2)}（A ${x.p.A}・B ${x.p.B}）`).join(' / ') });
  }
  // ---- the third run's: R4.11 the bottom right
  if (pr.arm) {
    const shots = pr.arm.shots.map((s) => read(s, PROBES.arm));
    if (shots.some(any)) {
      const row = (id) => pr.arm.zs.map((z, k) => ({ z, o: shots[k][id] || { kind: 'none' } })).filter((x) => x.o.kind !== 'none');
      const drawnZ = (id) => row(id).filter((x) => x.o.kind === 'drawn').map((x) => x.z);
      // (by depth: at each place the drawn ones are the smaller z — once one is hidden, every farther one is)
      const monotone = (id) => { const r = row(id), i = r.findIndex((x) => x.o.kind !== 'drawn'); return i < 0 || r.slice(i).every((x) => x.o.kind !== 'drawn'); };
      const armIds = pr.arm.places.map((p) => p.id).filter((id) => id !== pr.arm.sky);
      const sky = row(pr.arm.sky), skyAll = sky.length > 0 && sky.every((x) => x.o.kind === 'drawn');
      const someDrawn = armIds.some((id) => drawnZ(id).length > 0), someHidden = armIds.some((id) => drawnZ(id).length < row(id).length);
      const how = !someHidden ? 'どこも全部描かれた（右下を隠す物が無かった）' : !someDrawn ? '描く順（右下の所はどの z も隠れる）' : armIds.every(monotone) ? '奥行き（小さい z から描かれ、ある z から先が隠れる）' : 'どちらでもない（奥行きの順でない）';
      const free = read(pr.arm.free.shot, PROBES.arm), freeSeen = armIds.filter((id) => free[id] && free[id].kind !== 'none'), freeDrawn = freeSeen.filter((id) => free[id].kind === 'drawn');
      const cam = by(pr.arm.camera.shot, 'diff')[0], cv = cam && cam.ok ? cam.values : null;
      // (where the frozen camera changed the picture: all of it at the bottom right — the arm gone — or elsewhere too)
      const camSays = cv ? `止めたカメラで変わった所 ${(100 * cv.share).toFixed(2)} %・(${cv.x0}, ${cv.y0})–(${cv.x1}, ${cv.y1})${cv.x0 >= 1000 && cv.y0 >= 330 ? '（全部右下）' : ''}` : '止めたカメラの違いは測れなかった';
      const freeSays = !freeSeen.length ? '止めたカメラの四角は測れなかった' : freeDrawn.length === freeSeen.length ? `止めたカメラでは右下も全部描かれた（${freeDrawn.length} か所）` : `止めたカメラでも ${freeSeen.filter((id) => free[id].kind !== 'drawn').join(' ')} が隠れた`;
      const firstPerson = (id) => { const m = by(pr.arm.shots[pr.arm.zs.indexOf(0)], 'color')[PROBES.arm.findIndex((p) => p.id === id)]; return m && m.ok ? `rgb(${[m.values.br, m.values.bg, m.values.bb].map(Math.round)})` : '—'; };
      const freeWorld = (id) => { const m = by(pr.arm.free.shot, 'color')[PROBES.arm.findIndex((p) => p.id === id)]; return m && m.ok ? `rgb(${[m.values.br, m.values.bg, m.values.bb].map(Math.round)})` : '—'; };
      out.push({ rule: 'R4.11', claim: '画面の右下で GeoUI を隠す物（1 人称の腕か・奥行きか描く順か）', result: `${how}・${freeSays}${skyAll ? '' : '（空の所でも隠れた）'}`,
        detail: [...pr.arm.places.map((p) => `${p.id}: ${row(p.id).map((x) => `${x.z} ${say(x.o)}`).join(' ')}${free[p.id] ? ` | 止めたカメラ ${say(free[p.id])}` : ''}`),
          camSays, `ワールドの色（1 人称 → 止めたカメラ）: ${armIds.map((id) => `${id} ${firstPerson(id)} → ${freeWorld(id)}`).join(' ')}`].join(' / ') });
    }
  }
  // ---- the third run's: R3.11 colours at the controller's colour, the white overlay at 1
  if (pr.colours) {
    const rows3 = [];
    let worst = 0, n = 0, orange = null;
    for (const [g, shot] of Object.entries(pr.colours.shots)) {
      const o = read(shot, PROBES.colours, { grey: false }), want = pr.colours.perChannel[g];
      if (!any(o)) continue;
      const parts = pr.colours.ids.map((id) => {
        const x = o[id]; if (!x || x.kind !== 'drawn') return `${id.slice(2)} ${say(x)}`;
        const got = [x.v.r, x.v.g, x.v.b], d = Math.max(...got.map((v, i) => Math.abs(v - want[id][i]))); worst = Math.max(worst, d); n++;
        if (id === 'c_orange' && g === '1.32') orange = got;
        return `${id.slice(2)} (${got.map(Math.round).join(',')})`;
      });
      rows3.push(`色 ${g}: ${parts.join(' ')}`);
    }
    if (n) {
      const hk = pr.colours.hueKept && pr.colours.hueKept['1.32'] && pr.colours.hueKept['1.32'].c_orange, pc = pr.colours.perChannel['1.32'].c_orange;
      const orangeSays = orange && hk ? (Math.abs(orange[1] - pc[1]) < Math.abs(orange[1] - hk[1]) ? 'チャンネルごと' : '色の全体で（色合いを保って）') : '—';
      out.push({ rule: 'R3.11', claim: 'fade と色の倍率で、色は入れた色のまま出るか（236 で止まるのはチャンネルごとか）', result: worst <= 4 ? `入れた色のまま（チャンネルごとに 236 で止まる: 予測との差 ${worst.toFixed(1)} 以内）` : `予測と ${worst.toFixed(1)} 違う（止まり方: ${orangeSays}）`,
        detail: `${rows3.join(' / ')} / 橙の緑で見る止まり方: ${orangeSays}` });
    }
  }
  if (pr.ov1) {
    const o = read(pr.ov1.shot, PROBES.bright), v = pr.ov1.ids.map((id) => (o[id] && o[id].kind === 'drawn' ? o[id].g : null));
    if (v.some((x) => x !== null)) {
      const near = (x) => (x === null ? null : Math.abs(x - pr.ov1.ifFree.ov255) <= 4 ? '255（止まらない）' : Math.abs(x - pr.ov1.ifHeld.ov255) <= 4 ? '236（止まる）' : 'どちらでもない');
      out.push({ rule: 'R3.11', claim: '白の重ねる色を 1 にすると、255 か 236 か', result: near(v[0]) === near(v[1]) ? near(v[0]) : `白と灰で違う（${near(v[0])}・${near(v[1])}）`,
        detail: `${pr.ov1.ids.map((id, i) => `${id} ${v[i] === null ? say(o[id]) : v[i].toFixed(0)}`).join(' ')}・cutout の白 ${say(o.ref255)}` });
    }
  }
  // ---- the third run's: R3.12 small tilts
  if (pr.fine) {
    const o = read(pr.fine.shot, PROBES.fine);
    if (any(o)) {
      const ids = pr.fine.planes.map((t) => t.id), got = Object.fromEntries(ids.map((id) => [id, o[id] && o[id].kind === 'drawn' ? o[id].g : null]));
      const bySign = ids.every((id) => got[id] !== null && Math.abs(got[id] - pr.fine.bySign[id]) <= 4), smooth = ['ry1', 'rx-1', 'rx1'].every((id) => got[id] !== null && Math.abs(got[id] - pr.fine.bySign.flatf) <= 3);
      out.push({ rule: 'R3.12', claim: '1°・5° の傾き・x のまわりに 45°・60°（右下でない所）', result: bySign ? '向きの符号で決まる（1° でも）' : smooth ? '角度で変わる（1° は平らと同じ）' : 'どちらでもない',
        detail: ids.map((id) => `${id} ${got[id] === null ? say(o[id]) : got[id].toFixed(0)}`).join(' ') });
    }
  }
  // ---- the third run's: R4.9 the body's scale from the server
  if (pr.body) {
    const v = geo(pr.body.shot);
    if (v) out.push({ rule: 'R4.9', claim: 'サーバーが読んだ体の大きさ（grl:body）で scripts.scale を割ると打ち消せる', result: Math.abs(pct(v.unitsPerScreenH, pr.body.cancels.unitsPerScreenH)) < 0.6 ? '打ち消せる' : Math.abs(pct(v.unitsPerScreenH, pr.body.notCancelled.unitsPerScreenH)) < 0.6 ? '打ち消せない' : 'どちらでもない',
      detail: `高さ ${v.unitsPerScreenH.toFixed(2)}・中心 ${v.centreY.toFixed(2)}（打ち消せれば ${pr.body.cancels.unitsPerScreenH}・${pr.body.cancels.centreY}、そうでなければ ${pr.body.notCancelled.unitsPerScreenH}・${pr.body.notCancelled.centreY}）` });
  }
  // ---- the third run's: R5.3 rule C on 12 more screens
  if (Array.isArray(pr.gui3)) {
    const gm = pr.gui3.map((p) => { const m = by(p.shot, 'marks')[0], v = m && m.ok ? m.values : null; return { p, ui: v && Number.isFinite(v.violetx0) ? (v.violetx1 - v.violetx0) / 182 : null }; }).filter((x) => x.ui !== null);
    if (gm.length) {
      const inRange = gm.every((x) => Math.abs(x.ui - Math.round(x.ui)) < 0.1 && Math.round(x.ui) >= x.p.C[0] && Math.round(x.ui) <= x.p.C[1]);
      const fitC = inRange ? guiRuleCFit([...GUI_MEASURED, ...gm.map((x) => [x.p.W, x.p.H, Math.round(x.ui)])]) : null;
      out.push({ rule: 'R5.3', claim: 'GUI の倍率 = min(4, ⌊幅/W0⌋, ⌊高さ/H0⌋)（C）', result: !inRange ? 'C ではない（C の取れる値の外）' : fitC ? `C: W0 ${fitC.W0[0]}〜${fitC.W0[1]}・H0 ${fitC.H0[0]}〜${fitC.H0[1]}（0.05 刻み）` : 'C ではない（どの W0・H0 も全部の画面には合わない）',
        detail: gm.map((x) => `${x.p.W}x${x.p.H}: ${x.ui.toFixed(2)}（C ${x.p.C[0] === x.p.C[1] ? x.p.C[0] : `${x.p.C[0]}〜${x.p.C[1]}`}）`).join(' / ') });
    }
  }
  // ---- the control
  if (Array.isArray(pr.control)) {
    const c = pr.control.map((p) => ({ p, v: geo(p.shot) })).filter((x) => x.v);
    const board = pr.calBoard ? read(pr.calBoard.shot, PROBES.calBoard).board100 : { kind: 'none' };
    if (c.length) out.push({ rule: '対照', claim: '1 本目の scale の結果がこの実行でも同じか（と、目盛りの黒い板 z 100）', result: c.every((x) => Math.abs(pct(x.v.unitsPerScreenH, x.p.unitsPerScreenH)) < 0.6 && Math.abs(x.v.centreY - x.p.centreY) < 0.2) ? '同じ' : '違う',
      detail: `${c.map((x) => `${x.p.shot}: 高さ ${x.v.unitsPerScreenH.toFixed(3)}・中心 ${x.v.centreY.toFixed(3)}（予測 ${x.p.unitsPerScreenH}・${x.p.centreY}）`).join(' / ')} / 黒い板 ${say(board)}` });
  }
  if (!out.length) out.push({ rule: '—', claim: 'この実行の測った値', result: '測れなかった', detail: '' });
  return out;
}
export function verdictText(rows) { return rows.map((r) => `${r.rule.padEnd(6)} ${r.claim}\n       → ${r.result}${r.detail ? `\n         ${r.detail}` : ''}`).join('\n'); }

// ---- the add-on's other files
const TESTS = `# geoui_rules（bds/geoui/screen/rules.mjs が作る）: 規則を決める実験のパックが本物の BDS で動くか（プロパティ・scale・打ち消し・
# 色の倍率・重ねる色・しゃがむ・アニメーション・体の大きさの component・乗り物・閉じた箱）。描画は app.txt（本物のアプリ）が写して測る。

## 読み込める（プロパティが既定値）
@A join
wait 2000
js JSON.stringify([p('A').getProperty('grl:show'), p('A').getProperty('grl:sc'), p('A').getProperty('grl:comp'), p('A').getProperty('grl:gain'), p('A').getProperty('grl:ov')])
= [0,9375,0,1000,0]

## 表示と UI の中の scale・打ち消し・色の倍率・重ねる色を変える
scriptevent grl:show 63
scriptevent grl:scale 0.5
scriptevent grl:comp 1
scriptevent grl:gain 1.32
scriptevent grl:ov 0.24
wait 300
js JSON.stringify([p('A').getProperty('grl:show'), p('A').getProperty('grl:sc'), p('A').getProperty('grl:comp'), p('A').getProperty('grl:gain'), p('A').getProperty('grl:ov')])
= [63,5000,1,1320,240]
scriptevent grl:scale 9
~ GRL scale <0.1…4>
scriptevent grl:show 0
scriptevent grl:scale 0.9375
scriptevent grl:comp 0
scriptevent grl:gain 1
scriptevent grl:ov 0
wait 300

## サーバーからしゃがませる・アニメーション
js const q = p('A'); q.isSneaking = true; q.isSneaking
= true
scriptevent grl:anim animation.player.sleeping
wait 300
scriptevent grl:anim stop
wait 300
~ GRL anim animation.player.sleeping
~ GRL anim stop
!~ GRL .*error

## 3 本目の口（奥行きの選び・止めたカメラ・サーバーが送る体の大きさ）
js JSON.stringify([p('A').getProperty('grl:zsel'), p('A').getProperty('grl:hide'), p('A').getProperty('grl:body')])
= [0,0,10000]
scriptevent grl:show 448
scriptevent grl:zsel 3
scriptevent grl:comp 2
wait 300
js JSON.stringify([p('A').getProperty('grl:show'), p('A').getProperty('grl:zsel'), p('A').getProperty('grl:comp')])
= [448,3,2]
scriptevent grl:zsel 9
~ GRL zsel <0…7>
scriptevent grl:small 1
wait 600
scriptevent grl:body
wait 300
js p('A').getProperty('grl:body')
= 5000
scriptevent grl:cam 1
wait 300
js p('A').getProperty('grl:hide')
= 1
scriptevent grl:cam 0
scriptevent grl:small 0
wait 600
scriptevent grl:body
scriptevent grl:zsel 0
scriptevent grl:comp 0
scriptevent grl:show 0
wait 300
~ GRL cam 1
~ GRL cam 0
~ GRL body 0.5$
!~ GRL .*error
js JSON.stringify([p('A').getProperty('grl:zsel'), p('A').getProperty('grl:comp'), p('A').getProperty('grl:hide'), p('A').getProperty('grl:body')])
= [0,0,0,10000]

## 体の大きさ（minecraft:scale 0.5、他のアドオンがするように）
scriptevent grl:small 1
wait 600
js p('A').getComponent('minecraft:scale').value
= 0.5
scriptevent grl:small 0
wait 600
js const c = p('A').getComponent('minecraft:scale'); c ? c.value : 1
= 1

## 乗り物（ボートに乗る・降りる）
summon boat 0 -60 2
wait 500
ride @a start_riding @e[type=boat,c=1]
wait 500
js const r = p('A').getComponent('minecraft:riding'); r ? r.entityRidingOn.typeId : 'none'
= minecraft:boat
ride @a stop_riding
kill @e[type=boat]

## 閉じた箱を作って壊す（app.txt の light-box と同じコマンド）
fill -2 -61 -2 2 -56 2 stone hollow
tp A 0 -60 0 0 0
js [world.getDimension('overworld').getBlock({ x: 2, y: -58, z: 0 }).typeId, world.getDimension('overworld').getBlock({ x: 0, y: -58, z: 0 }).typeId].join(' ')
= minecraft:stone minecraft:air
fill -2 -60 -2 2 -56 2 air
fill -2 -61 -2 2 -61 2 grass_block
js [world.getDimension('overworld').getBlock({ x: 2, y: -58, z: 0 }).typeId, world.getDimension('overworld').getBlock({ x: 0, y: -61, z: 0 }).typeId].join(' ')
= minecraft:air minecraft:grass_block
`;
const TASK = `# geoui_rules — GeoUI の規則を本物の画面で決める

## Request
「規則を見つけて GeoUI によるマイクラの反映設計を全て網羅してさらに深めて」。規則の台帳は bds/geoui/RULES.md。その中の
仮説（まだ本物の画面で決まっていない規則）を、走らせる前に書いた予測（predictions.json）と比べて決める。
作り方: \`node bds/geoui/screen/rules.mjs\`（このフォルダはそれが書く。手で直さない）。

## 1 本目で決まった事（run 40055307539: bds/geoui/rules-history/run-40055307539/）
- R4.1: renderer の 1 モデル単位 = scripts.scale / 16 x パネルの短い辺（scale 0.5・0.75・1・1.5 でぴったり）
- R4.2: 原点はパネルの真ん中の 24 モデル単位下（scale によらない）
- R4.8: プレイヤーの minecraft:scale が単位に掛かる（体が半分なら GeoUI も半分）
- R2.3: しゃがむ・眠る・泳ぐのアニメーション・ボート・三人称で GeoUI は動かない
- R3.7: カメラを向いた板の色 = 0.757 x 入れた色（まっすぐ・昼も夜も同じ）

## 2 本目で決まった事（run 40061560812: bds/geoui/rules-history/run-40061560812/）
- R3.11: 白は 236 で止まる（fade に色 1.32 で灰 128 は入れた色のまま・emissive のアルファ 8 で 234・重ねる色は光の後）
- R4.10: 小さい z が手前、z −150〜150 の全部が描かれる · R3.12: 傾けた板の明るさは角度でなく向きの符号
- R3.9: 透明化の間は描かれない · R3.8: ダメージの赤はかからない · R4.9: UI の中の q.model_scale は 1（打ち消せない）
- R5.3: GUI の倍率は min(⌊幅/320⌋, ⌊高さ/240⌋) でも ⌊高さ/240⌋ でもない · R4.11（見つけた）: 画面の右下に置いた板は 9 か所とも隠れた

## What it decides now (app.txt)
- R4.11 右下: 白い四角を z −150〜150 の 7 つの奥行きで、2 本目に隠れた所（と空の所）に。次に GeoUI Screen と同じ止めたカメラ（minecraft:free・体を隠す）で
- R3.11 色: fade に色 1.32 と 2 で白・灰・赤・緑・青・黄・橙（チャンネルごとに 236 で止まるか）、白の重ねる色を 1 に（255 か 236 か）
- R3.12 1°・5° の傾きと、x のまわりに 45°・60° を右下でない所で · R4.9 サーバーが読んだ体の大きさ（grl:body）で割る
- R5.3 GUI の倍率を 12 画面で（min(4, ⌊幅/W0⌋, ⌊高さ/H0⌋) の W0・H0・上限）· 対照: scale 0.9375・1 と目盛りの黒い板（z 100）

## Run
\`node lab.mjs app ci -a geoui_rules --screen 720x1560 --knobs "APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"\`（人の許可をもらってから。1 本目と同じ 1560 x 720 の画面: 測る箱はこの画面の px。knobs も 1 本目と同じ: サインインしない準備済みの端末がキャッシュにある。knobs なしの run 40059578622 はサインインありの端末を作り直そうとして 10 分で止まった）→ \`node bds/geoui/screen/rules.mjs verdict <summary.json>\`。

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（プロパティが既定値）
- [ ] 表示と UI の中の scale・打ち消し・色の倍率・重ねる色を変える
- [ ] サーバーからしゃがませる・アニメーション
- [ ] 3 本目の口（奥行きの選び・止めたカメラ・サーバーが送る体の大きさ）
- [ ] 体の大きさ（minecraft:scale 0.5、他のアドオンがするように）
- [ ] 乗り物（ボートに乗る・降りる）
- [ ] 閉じた箱を作って壊す（app.txt の light-box と同じコマンド）
`;

export function files() {
  const built = P.build(scene(), { core: G });
  if (built.warnings.length) throw new Error(built.warnings.join('\n'));
  const out = {};
  for (const [p, c] of Object.entries(built.files)) out[p] = c && c.base64 !== undefined ? Buffer.from(c.base64, 'base64') : c;
  out['tests.txt'] = TESTS;
  out['app.txt'] = appTxt();
  out['TASK.md'] = TASK;
  out['predictions.json'] = JSON.stringify(predictions(), null, 1) + '\n';
  out['imported.json'] = JSON.stringify({ from: 'bds/geoui/screen/rules.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: 'GeoUI の規則を本物の画面で決める（scale・原点・体の大きさ・姿勢・光・GUI の倍率）' }, null, 2) + '\n';
  return { files: out, stats: built.stats };
}

function main(argv) {
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv[0] === 'predict') { console.log(JSON.stringify(predictions(), null, 1)); return; }
  if (argv[0] === 'verdict') {
    let f = argv[1] || '';
    if (f && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = ['summary.json', 'results/summary.json'].map((x) => path.join(argv[1], x)).find((x) => fs.existsSync(x)) || '';
    if (!f || !fs.existsSync(f)) { console.error('node bds/geoui/screen/rules.mjs verdict <summary.json | 実行のフォルダ> [--predictions <その実行の前の predictions.json>] [--app <その実行の app.txt>]'); process.exit(2); }
    const pr = val('--predictions') ? JSON.parse(fs.readFileSync(val('--predictions'), 'utf8')) : predictions();
    const app = val('--app') ? fs.readFileSync(val('--app'), 'utf8') : (val('--predictions') ? null : appTxt());
    console.log(verdictText(verdict(JSON.parse(fs.readFileSync(f, 'utf8')), pr, app)));
    return;
  }
  const { files: F2, stats } = files(), check = argv.includes('--check'), bad = [], want = new Set(Object.keys(F2));
  for (const [rel, c] of Object.entries(F2)) {
    const f = path.join(OUT, rel), buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    if (check) { if (!fs.existsSync(f) || !fs.readFileSync(f).equals(buf)) bad.push(rel); continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
  }
  const walk = (d, pre = '') => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`])) : []);
  for (const rel of walk(OUT)) if (!want.has(rel) && !LAB_OWN.has(rel)) { if (check) bad.push(`${rel}（余分）`); else fs.rmSync(path.join(OUT, rel)); }
  if (check) {
    if (bad.length) { console.error(`bds/addons/${NAME} は rules.mjs が作る物と違います: ${bad.join(' ')}\n→ node bds/geoui/screen/rules.mjs`); process.exit(1); }
    console.log(`OK bds/addons/${NAME} is what rules.mjs makes`);
  } else console.log(`OK bds/addons/${NAME}: グループ ${stats.groups}・ボーン ${stats.bones}・面 ${stats.planes}・プロパティ ${stats.properties}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
