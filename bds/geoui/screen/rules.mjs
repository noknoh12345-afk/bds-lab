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
// What it left open, and this pack's run decides (app.txt, in this order):
//   R3.11 white as white: the controller's colour above 1 on the colour-mask material, an overlay colour with USE_OVERLAY, an emissive
//         material (USE_EMISSIVE) with the texture's alpha · R4.10 how far in depth planes are drawn (two rows of squares from z −150
//         to 150; which of two planes 10 apart is in front; long boards at z 0 and 50 — run 40055307539 saw the world where boards at
//         50 and 100 should have been) · R3.12 the light by the plane's direction (turned −60…60° about y and about x; one turned −45°
//         about y was not drawn at all) · R3.9 invisibility · R3.8 the hurt flash (3 tries, with and without USE_OVERLAY) · R4.9
//         cancelling the body's scale (scripts.scale / q.model_scale in the UI) · R3.7 the light with night vision and in a closed box ·
//         R5.3 the GUI scale's rule on 6 screens · and the scales 0.9375 and 1 again as a control
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
  ['w_a128', [255, 255, 255, 128]], ['w_a8', [255, 255, 255, 8]], ['g128_a8', [128, 128, 128, 8]]];
const PI = Object.fromEntries(PAL.map(([n], i) => [n, i]));
export const BITS = { cal: 1, ramp: 2, tilt: 4, gui: 8, bright: 16, depth: 32 };
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
  const R = (n, def) => `variable.is_paperdoll ? ${def} : q.property('grl:${n}')`;
  const pre = [`v.grl_show = ${R('show', 0)};`, `v.grl_sc = ${R('sc', SC_DEFAULT)};`, `v.grl_comp = ${R('comp', 0)};`,
    `v.grl_gain = (${R('gain', 1000)}) / 1000;`, `v.grl_ov = (${R('ov', 0)}) / 1000;`];
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
    properties: [{ name: 'show', range: [0, 255], default: 0 }, { name: 'sc', range: [1000, 40000], default: SC_DEFAULT }, { name: 'comp', range: [0, 1], default: 0 },
      { name: 'gain', range: [0, 4000], default: 1000 }, { name: 'ov', range: [0, 1000], default: 0 }],
    // (the player's scale in the UI only — the paper doll and the world keep the vanilla 0.9375; with comp, divided by the entity's
    //  own scale: R4.9 — whether q.model_scale is that scale is what the run decides; none under 0.05 is divided by)
    scaleScript: `variable.is_paperdoll ? 0.9375 : (q.is_in_ui ? ((v.grl_sc ?? ${SC_DEFAULT}) / 10000) / ((((v.grl_comp ?? 0) > 0) && q.model_scale > 0.05) ? q.model_scale : 1) : 0.9375)`,
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
};

// ---- the predictions (written before the run)
export function predictions() {
  const H = (s) => r4(16 / (0.1 * s));
  const emis = (g, a) => r4(g * (1 - (a / 255) * (1 - LIGHT)));
  return {
    version: 2, made: 'bds/geoui/screen/rules.mjs', note: 'Written before the run. verdict compares the run with these numbers.',
    earlier: 'bds/geoui/rules-history/run-40055307539/',
    // R3.11: grey of each patch (a GeoUI plane is one flat colour; the world through it is not)
    bright: { shots: { plain: 'bright-plain', gain: 'bright-gain', ov: 'bright-ov' }, gain: 1.32, ov: 0.24, ids: BRIGHT.map((b) => b.id),
      lit: { g255: lit(255), g128: lit(128) },
      emissive: { lerp: { em255: lit(255), em255h: emis(255, 128), em255z: emis(255, 8), em128z: emis(128, 8) }, full: { em255: 255, em255h: 255, em255z: 255, em128z: 128 }, none: { em255: lit(255), em255h: lit(255), em255z: lit(255), em128z: lit(128) },
        why: 'lerp: the light lerp(1, 0.757, alpha) — the texture\'s alpha marks how much is lit (vanilla entity_emissive_alpha: the less alpha the more it glows); full: no light at all; none: USE_EMISSIVE does nothing' },
      colour: { unclamped: { fd255: 255, fd128: r4(Math.min(255, LIGHT * 1.32 * 128)) }, clamped: { fd255: lit(255), fd128: lit(128) }, cutoutUnchanged: { ref255: lit(255), ref128: lit(128) } },
      overlay: { after: { ov255: r4(LIGHT * 255 * 0.76 + 255 * 0.24), ov128: r4(LIGHT * 128 * 0.76 + 255 * 0.24) }, before: { ov255: r4(LIGHT * (255 * 0.76 + 255 * 0.24)), ov128: r4(LIGHT * (128 * 0.76 + 255 * 0.24)) },
        none: { ov255: lit(255), ov128: lit(128) }, cutoutUnchanged: { ref128: lit(128) } } },
    // R4.10: which squares are drawn (lit white if so), which of the two planes is in front, whether the long boards are drawn
    depth: { shot: 'depth', zs: DEPTH_Z, ifDrawn: lit(255), overlap: { ifPlusZFar: 'green', ifPlusZNear: 'red' }, boards: { ifDrawn: lit(96) },
      expect: 'pack.js puts the nearer of two planes at the smaller z (toward the camera is negative): green in front; every square of ±60 drawn (R4.3 measured the grid\'s markers at ±60)' },
    // R3.12: run 40055307539's values where it measured them; none for the new turns (values to fit the light to)
    tilt: { shot: 'tilt-noon', planes: TILT.map((t) => ({ id: t.id, rot: t.rot, x: t.x, y: t.y, ...(Object.prototype.hasOwnProperty.call(TILT_V1, t.id) ? { v1: TILT_V1[t.id] } : {}) })), boardIfDrawn: lit(96) },
    invisible: { shot: 'ramp-invisible', ids: ['g255', 'g0'], ifDrawn: { g255: lit(255), g0: 0 }, expect: 'not drawn (run 40055307539 found no grid)' },
    hurt: { shots: ['bright-hurt1', 'bright-hurt2', 'bright-hurt3'], ids: ['ref255', 'ov255'], ifNoFlash: lit(255), expect: 'no red on either (is_hurt_color a 0; the cutout material has no USE_OVERLAY)' },
    // R4.9: with comp, scripts.scale / q.model_scale — if q.model_scale is the entity's minecraft:scale (0.5), the body's scale cancels
    comp: { shot: 'cal-comp', cancels: { unitsPerScreenH: H(0.9375), centreY: r4(centreOf(0.9375)) }, notCancelled: { unitsPerScreenH: H(0.9375 * 0.5), centreY: r4(centreOf(0.9375 * 0.5)) } },
    light: { conditions: ['nightvision', 'box'], flat: LIGHT, board: lit(96), expect: 'the same 0.757 as at noon and at midnight (the UI has a light of its own)' },
    gui: GUI_SIZES.map(([W, Hh]) => ({ shot: `gui-${W}x${Hh}`, W, H: Hh, A: guiRuleA(W, Hh), B: guiRuleB(W, Hh) })),
    control: CONTROL_SCALES.map((s) => ({ shot: `cal-s${tag(s)}`, scale: s, unitsPerScreenH: H(s), centreY: r4(centreOf(s)) })),
    calBoard: { shot: 'cal-s0_9375', ifDrawn: 0 },
  };
}

// ---- the behaviour pack's script
const SCRIPT = `// GeoUI rules probe (bds-lab: bds/geoui/screen/rules.mjs makes this file — change that, not this).
// /scriptevent grl:show <bits> · grl:scale <s> (the player's scale in the UI) · grl:comp 0|1 (divided by q.model_scale) · grl:gain <x>
// (the controller's colour) · grl:ov <a> (a white overlay) · grl:sneak 0|1 · grl:anim <animation>|stop · grl:small 0|1 (minecraft:scale 0.5
// by an event, as another add-on would) · grl:state
import { world, system, Player } from '@minecraft/server';
const log = (s) => console.warn('GRL ' + s);
const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(4), args = String(e.message).trim().split(/\\s+/).filter(Boolean);
  const players = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of players) {
    try {
      if (verb === 'show') { p.setProperty('grl:show', Math.max(0, Math.min(255, parseInt(args[0], 10) || 0))); log('show ' + p.getProperty('grl:show')); }
      else if (verb === 'scale') { const s = num(args[0], 0.1, 4); if (s === null) { log('scale <0.1…4>'); continue; } p.setProperty('grl:sc', Math.round(s * 10000)); log('scale ' + s); }
      else if (verb === 'comp') { p.setProperty('grl:comp', args[0] === '1' ? 1 : 0); log('comp ' + p.getProperty('grl:comp')); }
      else if (verb === 'gain') { const g = num(args[0], 0, 4); if (g === null) { log('gain <0…4>'); continue; } p.setProperty('grl:gain', Math.round(g * 1000)); log('gain ' + g); }
      else if (verb === 'ov') { const a = num(args[0], 0, 1); if (a === null) { log('ov <0…1>'); continue; } p.setProperty('grl:ov', Math.round(a * 1000)); log('ov ' + a); }
      else if (verb === 'sneak') { p.isSneaking = args[0] === '1'; log('sneak ' + p.isSneaking); }
      else if (verb === 'anim') {
        // (one controller of our own: the next animation on it replaces the last; stop = the plain pose)
        p.playAnimation(args[0] === 'stop' ? 'animation.humanoid.base_pose' : args[0], { controller: 'grl_pose', blendOutTime: 0 });
        log('anim ' + args[0]);
      } else if (verb === 'small') { p.triggerEvent(args[0] === '1' ? 'grl:small' : 'grl:normal'); log('small ' + args[0]); }
      else if (verb === 'state') { const sc = p.getComponent('minecraft:scale'); log('state ' + JSON.stringify({ show: p.getProperty('grl:show'), sc: p.getProperty('grl:sc'), comp: p.getProperty('grl:comp'), gain: p.getProperty('grl:gain'), ov: p.getProperty('grl:ov'), sneaking: p.isSneaking, scale: sc ? sc.value : 1 })); }
      else log('unknown ' + verb);
    } catch (err) { log(verb + ' error ' + err); }
  }
}, { namespaces: ['grl'] });
`;

// ---- the real app (Android, 1560 x 720 across): the new questions first (a run that stops early keeps them), the GUI's screens and
//      the control last
const HUD_OFF = ['crosshair', 'health', 'hunger', 'armor', 'progress_bar', 'air_bubbles', 'status_effects', 'item_text', 'tooltips', 'paperdoll', 'touch_controls'];
export function appTxt() {
  const lines = [`# GeoUI の規則を決める 2 本目（bds/geoui/screen/rules.mjs が作る。予測は predictions.json: 走らせる前にコミットしたもの）`,
    `# 1 本目（run 40055307539）で決まった事と、その予測・手順は bds/geoui/rules-history/run-40055307539/`,
    `# node lab.mjs app ci -a geoui_rules --screen 720x1560 --knobs "APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"（人の許可をもらってから）→ node bds/geoui/screen/rules.mjs verdict <summary.json>`, '',
    'section title', 'launch', 'until title 600000', 'shot title', '',
    'section join', 'join', 'until joined 900000', 'do tp @a 0 -60 0 0 0', 'do gamemode adventure @a', 'do time set noon', 'do weather clear',
    ...HUD_OFF.map((h) => `do hud @a hide ${h}`), 'do scriptevent grl:show 0', 'wait 6000', 'absent clientlog \\bERROR\\b', ''];
  const world = ['do scriptevent grl:show 0', 'wait 1500', 'shot world'];
  const measure = (shot, list) => list.map((p) => `measure color ${shot} ${p.box.join(' ')}`);
  const cal = (shot) => ['wait 1500', `shot ${shot}`, `measure geoui ${shot}`];
  // R3.11: white as white — as it is, the controller's colour at 1.32, a white overlay at 0.24
  lines.push('section brighten', ...world, `do scriptevent grl:show ${BITS.bright}`, 'wait 1500', 'shot bright-plain', ...measure('bright-plain', PROBES.bright),
    'do scriptevent grl:gain 1.32', 'wait 1500', 'shot bright-gain', ...measure('bright-gain', PROBES.bright),
    'do scriptevent grl:gain 1', 'do scriptevent grl:ov 0.24', 'wait 1500', 'shot bright-ov', ...measure('bright-ov', PROBES.bright),
    'do scriptevent grl:ov 0', 'do scriptevent grl:show 0', '');
  // R4.10: depth — squares from z −150 to 150, two planes 10 apart, two long boards
  lines.push('section depth', ...world, `do scriptevent grl:show ${BITS.depth}`, 'wait 1500', 'shot depth', ...measure('depth', PROBES.depth), 'measure diff depth', 'do scriptevent grl:show 0', '');
  // R3.12: the light by the plane's direction (and run 40055307539's right45 again)
  lines.push('section tilt', ...world, `do scriptevent grl:show ${BITS.tilt}`, 'wait 1500', 'shot tilt-noon', ...measure('tilt-noon', PROBES.tilt), 'do scriptevent grl:show 0', '');
  // R3.9: invisibility (the ramp: big opaque patches)
  lines.push('section invisible', ...world, `do scriptevent grl:show ${BITS.ramp}`, 'do effect @a invisibility 60 0 true', 'wait 1500', 'shot ramp-invisible',
    ...measure('ramp-invisible', PROBES.invisible), 'measure diff ramp-invisible', 'do effect @a clear', 'do scriptevent grl:show 0', '');
  // R3.8: the hurt flash, three tries (it lasts about half a second), on a plane without USE_OVERLAY and one with
  lines.push('section hurt', ...world, `do scriptevent grl:show ${BITS.bright}`, 'wait 1500');
  for (const k of [1, 2, 3]) lines.push('do damage @a 1', `shot bright-hurt${k}`, ...measure(`bright-hurt${k}`, PROBES.hurt), 'wait 1200');
  lines.push('do effect @a instant_health 1 1 true', 'do scriptevent grl:show 0', '');
  // R4.9: cancelling the body's scale
  lines.push('section comp', `do scriptevent grl:show ${BITS.cal}`, 'do scriptevent grl:small 1', 'do scriptevent grl:comp 1', ...cal('cal-comp'),
    'do scriptevent grl:comp 0', 'do scriptevent grl:small 0', 'do scriptevent grl:show 0', 'wait 1000', '');
  // R3.7: the light with night vision at midnight, and in a closed stone box (no sky, no light)
  const light = (cond, setup, undo) => lines.push(`section light-${cond}`, ...setup, ...world, `do scriptevent grl:show ${BITS.ramp}`, 'wait 1500',
    `shot ramp-${cond}`, ...measure(`ramp-${cond}`, PROBES.ramp), 'do scriptevent grl:show 0', ...undo, '');
  light('nightvision', ['do time set midnight', 'do effect @a night_vision 60 0 true'], ['do effect @a clear', 'do time set noon']);
  light('box', ['do fill -2 -61 -2 2 -56 2 stone hollow', 'do tp @a 0 -60 0 0 0'], ['do fill -2 -60 -2 2 -56 2 air', 'do fill -2 -61 -2 2 -61 2 grass_block', 'do tp @a 0 -60 0 0 0']);
  // R5.3: the GUI scale on 6 screens (the real hotbar hidden: the whole frame is seen)
  lines.push('section gui', 'do hud @a hide hotbar', '');
  for (const [w, h] of GUI_SIZES) lines.push(`section gui-${w}x${h}`, `size ${w}x${h}`, 'wait 9000', ...world,
    `do scriptevent grl:show ${BITS.gui}`, 'wait 2000', `shot gui-${w}x${h}`, `measure marks gui-${w}x${h}`, '');
  // the control: run 40055307539's scales again, as it saw them (the hotbar shown), and the calibration's black board (z 100)
  lines.push('section control', 'size reset', 'wait 6000', 'do hud @a reset', ...HUD_OFF.map((h) => `do hud @a hide ${h}`), `do scriptevent grl:show ${BITS.cal}`);
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
 *  newest `shot world`, same box) means nothing was drawn there */
export function look(v) {
  if (!v || !Number.isFinite(v.r)) return { kind: 'none' };
  const g = grey(v), off = Number.isFinite(v.br) ? Math.abs(v.r - v.br) + Math.abs(v.g - v.bg) + Math.abs(v.b - v.bb) : Infinity;
  return { kind: off < 15 || (Number.isFinite(v.spread) && v.spread > 2.5) ? 'world' : 'drawn', g, v };
}
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
  /** a shot's colour boxes by id (in the order app.txt measured them) */
  const read = (shot, list) => { const ms = by(shot, 'color'); return Object.fromEntries(list.map((p, i) => [p.id, look(ms[i] && ms[i].ok ? ms[i].values : null)])); };
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
    const board = ms[RAMP.length] ? say(look(ms[RAMP.length].ok ? ms[RAMP.length].values : null)) : null;
    rows.push(`${cond}: ${f ? `出る色 = ${f.a.toFixed(4)} x 入れた色 ${f.b >= 0 ? '+' : '−'} ${Math.abs(f.b).toFixed(1)}` : '—'}${board ? `（z 50 の板 ${board}）` : ''}`);
  }
  if (rows.length) out.push({ rule: 'R3.7', claim: '板の色にかかる光（時刻・暗視・閉じた箱）', result: '値（下）', detail: rows.join(' / ') });
  const tiltIds = pr.tilt ? pr.tilt.planes.map((t) => t.id) : ((pr.light && pr.light.patches) || []).filter((p) => p.startsWith('tilt-')).map((p) => p.slice(5));
  const tiltRows = [];
  for (const cond of ['noon', 'midnight']) {
    const ms = by(`tilt-${cond}`, 'color');
    if (!ms.length) continue;
    tiltRows.push(`${cond}: ${tiltIds.map((id, i) => `${id} ${say(look(ms[i] && ms[i].ok ? ms[i].values : null))}`).join(' ')}`);
  }
  if (tiltRows.length) {
    const ms = by('tilt-noon', 'color'), seen = (id) => { const i = tiltIds.indexOf(id); return i >= 0 && ms[i] && ms[i].ok ? look(ms[i].values) : { kind: 'none' }; };
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
    const hs = pr.hurt.shots.map((s) => read(s, PROBES.hurt)).filter(any);
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

## What it decides now (app.txt)
- R3.11 白を白に: cutout（基準）・fade に render controller の色 1.32・USE_OVERLAY の材質に overlay_color 0.24・USE_EMISSIVE の材質とテクスチャのアルファ
- R4.10 奥行き: z −150〜150 の四角（空の前・地面の前）・10 離れた 2 枚の前後・z 0 と 50 の長い板
- R3.12 面の向き: y と x のまわりに −60〜60° 傾けた板（1 本目で描かれなかった右 45° を同じ所と左端で）
- R3.9 透明化 · R3.8 ダメージの点滅（3 回、USE_OVERLAY の有り無し）· R4.9 体の大きさを打ち消す（scale / q.model_scale）
- R3.7 暗視・閉じた箱 · R5.3 GUI の倍率の決まり（6 画面）· 対照: scale 0.9375・1 と目盛りの黒い板（z 100）

## Run
\`node lab.mjs app ci -a geoui_rules --screen 720x1560 --knobs "APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"\`（人の許可をもらってから。1 本目と同じ 1560 x 720 の画面: 測る箱はこの画面の px。knobs も 1 本目と同じ: サインインしない準備済みの端末がキャッシュにある。knobs なしの run 40059578622 はサインインありの端末を作り直そうとして 10 分で止まった）→ \`node bds/geoui/screen/rules.mjs verdict <summary.json>\`。

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（プロパティが既定値）
- [ ] 表示と UI の中の scale・打ち消し・色の倍率・重ねる色を変える
- [ ] サーバーからしゃがませる・アニメーション
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
