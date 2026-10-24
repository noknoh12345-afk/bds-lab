#!/usr/bin/env node
// GeoUI — the rules probe: one pack whose run in the real app decides the rules bds/geoui/RULES.md still holds as hypotheses —
// each one predicted here, in numbers, before the run (predictions.json beside the pack: commit it, then run, then `verdict`).
//   node bds/geoui/screen/rules.mjs                write bds/addons/geoui_rules (with its predictions.json)
//   node bds/geoui/screen/rules.mjs --check        write nothing; fail when the add-on is not what this makes
//   node bds/geoui/screen/rules.mjs predict        the predictions, as a table
//   node bds/geoui/screen/rules.mjs verdict <summary.json | run folder>   each hypothesis: held, fell, or not measured
// What it decides (RULES.md):
//   R4.1  the renderer's unit is scripts.scale / 16 of its panel: the player's scale made 0.5 / 0.75 / 1.0 / 1.5 in the UI only
//         (scaleScript, property grl:sc) — the calibration grid's height in model units must go as 160 / scale
//   R4.2  what the origin's offset D is: fixed in model units (M) or in blocks (W) — the grid's centre tells them apart
//   R4.8  the entity's own scale (minecraft:scale 0.5, as another add-on would set it) — does the renderer follow it
//   R2.3  poses — sneaking (set by the server), the sleeping and swimming animations, riding a boat, the third-person view — move
//         nothing of GeoUI's (its bones hang off a root of their own)
//   R3.7  the light on a plane: a ramp of 9 greys and 5 tilted white planes, at noon, midnight, with night vision, in a closed box
//   R3.8  the hurt flash (is_hurt_color a 0) and invisibility
//   R5.3  the GUI scale: min(⌊W/320⌋, ⌊H/240⌋) or ⌊H/240⌋ — 6 screens where the two (and the edges of each) disagree
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

// ---- the palette (a texel each, sampled at its middle): the calibration's colours, 9 greys, violet
const GREYS = [0, 32, 64, 96, 128, 160, 192, 224, 255];
const PAL = [['white', [255, 255, 255]], ['red', [255, 0, 0]], ['green', [0, 255, 0]], ['blue', [0, 0, 255]], ['yellow', [255, 255, 0]], ['cyan', [0, 255, 255]],
  ['black', [0, 0, 0]], ['violet', [128, 0, 255]], ...GREYS.map((g) => [`g${g}`, [g, g, g]])];
const PI = Object.fromEntries(PAL.map(([n], i) => [n, i]));
export const BITS = { cal: 1, ramp: 2, tilt: 4, gui: 8 };
export const SCALES = [0.9375, 0.5, 0.75, 1, 1.5];
/** the 6 screens of the GUI scale's rule (landscape px) */
export const GUI_SIZES = [[1100, 1000], [960, 540], [1279, 960], [1280, 960], [1920, 959], [2560, 1440]];
/** the ramp: 9 greys, 3 x 3, model units (x right, y up) round the screen's middle in Studio's frame (0, 135.04) */
export const RAMP = GREYS.map((g, i) => ({ id: `g${g}`, grey: g, x: [-70, 0, 70][i % 3], y: [175, 135, 95][Math.floor(i / 3)], w: 30, h: 30 }));
/** the tilted planes: white, turned about their own middle — the face's normal leans that way */
export const TILT = [['flat', [0, 0, 0]], ['up45', [-45, 0, 0]], ['down45', [45, 0, 0]], ['left45', [0, 45, 0]], ['right45', [0, -45, 0]]]
  .map(([id, rot], i) => ({ id, rot, x: -120 + 60 * i, y: 135, w: 24, h: 24 }));
const SC_DEFAULT = 9375;

// ---- the scene
export function scene() {
  const groups = [{ id: 'cal', anchor: 'center', origin: [0, 0], renderer: false }, { id: 'gui', anchor: 'bottom_middle', scale: { mode: 'gui', px: 1 } }];
  const bones = [], planes = [];
  const showIf = (n) => `(math.mod(math.floor(v.grl_show / ${n}), 2) > 0.5) ? 1 : 0`;
  const uv = (c) => [PI[c] + 0.25, 0.25, 0.5, 0.5];
  // (a model rectangle (x, y the lower-left corner, y up) as a plane of the 'cal' group, whose origin is the model's)
  const plane = (bone, x, y, w, h, c, z = 0) => planes.push({ bone, texture: 'pal', rect: { x, y: -(y + h), w, h }, z, uv: uv(c) });
  // the calibration: a black board far behind, the grid's markers (calib.mjs), on bit 1
  bones.push({ name: 'grl_cal', group: 'cal', scale: showIf(BITS.cal) });
  plane('grl_cal', -400, -40, 800, 360, 'black', 100);
  for (const m of markers()) plane('grl_cal', m.x - SIZE / 2, m.y - SIZE / 2, SIZE, SIZE, m.color, m.z);
  // the ramp of greys (bit 2) and the tilted planes (bit 4), on a mid-grey board of their own
  bones.push({ name: 'grl_ramp', group: 'cal', scale: showIf(BITS.ramp) });
  plane('grl_ramp', -120, 65, 240, 140, 'g96', 50);
  for (const r of RAMP) plane('grl_ramp', r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, r.id);
  bones.push({ name: 'grl_tilts', group: 'cal', scale: showIf(BITS.tilt) });
  plane('grl_tilts', -150, 105, 300, 60, 'g96', 50);
  for (const t of TILT) {
    // (each its own bone, turned about the plane's middle: the pivot in the group's local units, y down)
    const b = `grl_tilt_${t.id}`;
    bones.push({ name: b, group: 'cal', parent: 'grl_tilts', pivot: [t.x, -t.y], rotation: t.rot });
    plane(b, t.x - t.w / 2, t.y - t.h / 2, t.w, t.h, 'white');
  }
  // the GUI frame (bit 8): the hotbar's 182 x 22 JSON UI px, filled, at the bottom's middle (the real hotbar hidden when measured)
  bones.push({ name: 'grl_gui', group: 'gui', scale: showIf(BITS.gui) });
  planes.push({ bone: 'grl_gui', texture: 'pal', rect: { x: -91, y: -22, w: 182, h: 22 }, z: 0, uv: uv('violet') });
  const R = (n, def) => `variable.is_paperdoll ? ${def} : q.property('grl:${n}')`;
  const pre = [`v.grl_show = ${R('show', 0)};`, `v.grl_sc = ${R('sc', SC_DEFAULT)};`];
  // GeoUI Studio's renderer (10 % x 10 % at 110 % from the top's middle): the frame `measure geoui` reads the grid in
  const studio = { grl_studio: { type: 'panel', size: ['10%', '10%'], offset: [0, '110%'], anchor_from: 'top_middle', anchor_to: 'top_middle',
    controls: [{ grl_r_studio: { type: 'custom', renderer: 'live_player_renderer', layer: 1, bindings: [{ binding_name: '#hud_visible', binding_name_override: '#visible' }] } }] } };
  const png = (() => {
    const W = 32, H = 2, img = new Uint8Array(W * H * 4);
    PAL.forEach(([, c], i) => { img.set([c[0], c[1], c[2], 255], i * 4); img.set([c[0], c[1], c[2], 255], (W + i) * 4); });
    return Buffer.from(encodePng({ width: W, height: H, data: img }));
  })();
  return {
    ns: NS, name: 'GeoUI Rules Probe', description: 'GeoUI の規則を本物の画面で決める（bds-lab: bds/geoui/RULES.md）', seed: 'grl-1',
    uuids: { rp: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d11', rpMod: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d12', bp: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d13', bpData: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d14', bpScript: 'd4b9f2e3-5c8a-4d2a-8f1b-6e7a8b9c0d15' },
    scale: { mode: 'height', s: 0.1 }, groups, bones, planes, textures: [{ id: 'pal', width: 32, height: 2, png }], pre, initialize: [],
    properties: [{ name: 'show', range: [0, 255], default: 0 }, { name: 'sc', range: [1000, 40000], default: SC_DEFAULT }],
    // (the player's scale in the UI only — the paper doll and the world keep the vanilla 0.9375; read where the doll is guarded)
    scaleScript: `variable.is_paperdoll ? 0.9375 : (q.is_in_ui ? (v.grl_sc ?? ${SC_DEFAULT}) / 10000 : 0.9375)`,
    patchPlayer: ({ bp }) => {
      const e = bp['minecraft:entity'];
      e.component_groups = Object.assign({}, e.component_groups, { 'grl:small': { 'minecraft:scale': { value: 0.5 } } });
      e.events = Object.assign({}, e.events, { 'grl:small': { add: { component_groups: ['grl:small'] } }, 'grl:normal': { remove: { component_groups: ['grl:small'] } } });
    },
    extraControls: [studio], script: SCRIPT,
  };
}

// ---- where things land (px) on a W x H screen, from the formulas: Studio's frame and the GUI frame
/** a model rectangle (x, y lower-left, model units) in Studio's renderer → screen px (scale: the player's, in the UI) */
export function studioRect(r, W, H, scale = 0.9375, d = L.D) {
  const side = Math.min(0.1 * W, 0.1 * H), u = (scale / 16) * side, cx = W / 2, cy = 1.1 * H + 0.05 * H;
  const X = (x) => cx + u * x, Y = (y) => cy - u * (y - d);
  return { x0: X(r.x - r.w / 2), x1: X(r.x + r.w / 2), y0: Y(r.y + r.h / 2), y1: Y(r.y - r.h / 2) };
}
/** the middle of a box, shrunk to its inner part (what `measure color` averages: no edge, no neighbour) */
const inner = (b, f = 0.25) => { const dx = (b.x1 - b.x0) * f, dy = (b.y1 - b.y0) * f; return [b.x0 + dx, b.y0 + dy, b.x1 - dx, b.y1 - dy].map((v) => Math.round(v)); };
export const guiRuleA = (W, H) => Math.min(Math.floor(W / 320), Math.floor(H / 240));
export const guiRuleB = (W, H) => Math.floor(H / 240);

// ---- the predictions (written before the run)
export function predictions() {
  const H0 = 1 / (L.K * 0.1);   // the grid's screen height in model units at the vanilla scale (170.67)
  // (the screen's middle in model units: Studio's panel middle is 1.15 H, the screen's 0.5 H — 0.65 H = 0.65 / 0.1 panel sides = 6.5
  //  panel sides; a panel side is 16 / scale model units)
  const centre = (s, dModel) => dModel + 6.5 * 16 / s;
  const dWorld = L.D * 0.9375;   // D in model units x scale = the same length at any scale (blocks x 16)
  return {
    version: 1, made: 'bds/geoui/screen/rules.mjs', note: 'Written before the run. verdict compares the run with these numbers.',
    scale: SCALES.map((s) => ({ shot: `cal-s${tag(s)}`, scale: s, unitsPerScreenH: r4(H0 * 0.9375 / s), centreY_M: r4(centre(s, L.D)), centreY_W: r4(centre(s, dWorld / s)) })),
    entityScale: { shot: 'cal-small', follows: { unitsPerScreenH: r4(H0 * 2) }, ignores: { unitsPerScreenH: r4(H0) } },
    poses: ['cal-sneak', 'cal-sleep', 'cal-swim', 'cal-ride', 'cal-third', 'cal-front'].map((shot) => ({ shot, unitsPerScreenH: r4(H0), centreY: r4(centre(0.9375, L.D)), tolerance: 0.003 })),
    gui: GUI_SIZES.map(([W, H]) => ({ shot: `gui-${W}x${H}`, W, H, A: guiRuleA(W, H), B: guiRuleB(W, H) })),
    hurt: { shot: 'ramp-hurt', patch: 'g255', expect: 'the same colour as at noon (is_hurt_color a 0)' },
    light: { conditions: ['noon', 'midnight', 'nightvision', 'box'], patches: [...RAMP.map((r) => r.id), ...TILT.map((t) => `tilt-${t.id}`)] },
  };
}
const tag = (s) => String(s).replace('.', '_');
const r4 = (v) => Math.round(v * 10000) / 10000;

// ---- the behaviour pack's script
const SCRIPT = `// GeoUI rules probe (bds-lab: bds/geoui/screen/rules.mjs makes this file — change that, not this).
// /scriptevent grl:show <bits> · grl:scale <s> (the player's scale in the UI) · grl:sneak 0|1 · grl:anim <animation>|stop · grl:small 0|1
// (minecraft:scale 0.5 by an event, as another add-on would) · grl:state
import { world, system, Player } from '@minecraft/server';
const log = (s) => console.warn('GRL ' + s);
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(4), args = String(e.message).trim().split(/\\s+/).filter(Boolean);
  const players = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of players) {
    try {
      if (verb === 'show') { p.setProperty('grl:show', Math.max(0, Math.min(255, parseInt(args[0], 10) || 0))); log('show ' + p.getProperty('grl:show')); }
      else if (verb === 'scale') { const s = Number(args[0]); if (!(s >= 0.1 && s <= 4)) { log('scale <0.1…4>'); continue; } p.setProperty('grl:sc', Math.round(s * 10000)); log('scale ' + s); }
      else if (verb === 'sneak') { p.isSneaking = args[0] === '1'; log('sneak ' + p.isSneaking); }
      else if (verb === 'anim') {
        // (one controller of our own: the next animation on it replaces the last; stop = the plain pose)
        p.playAnimation(args[0] === 'stop' ? 'animation.humanoid.base_pose' : args[0], { controller: 'grl_pose', blendOutTime: 0 });
        log('anim ' + args[0]);
      } else if (verb === 'small') { p.triggerEvent(args[0] === '1' ? 'grl:small' : 'grl:normal'); log('small ' + args[0]); }
      else if (verb === 'state') { const sc = p.getComponent('minecraft:scale'); log('state ' + JSON.stringify({ show: p.getProperty('grl:show'), sc: p.getProperty('grl:sc'), sneaking: p.isSneaking, scale: sc ? sc.value : 1 })); }
      else log('unknown ' + verb);
    } catch (err) { log(verb + ' error ' + err); }
  }
}, { namespaces: ['grl'] });
`;

// ---- the real app (Android): every shot of the grid is measured by \`measure geoui\`, the greys by \`measure color\`
export function appTxt() {
  const W = 1560, H = 720;
  const lines = [`# GeoUI の規則を決める（bds/geoui/screen/rules.mjs が作る。予測は predictions.json: 走らせる前にコミットしたもの）`,
    `# node lab.mjs app ci -a geoui_rules（人の許可をもらってから）→ node bds/geoui/screen/rules.mjs verdict <summary.json>`, '',
    'section title', 'launch', 'until title 600000', 'shot title', '',
    'section join', 'join', 'until joined 900000', 'do tp @a 0 -60 0 0 0', 'do gamemode adventure @a', 'do time set noon', 'do weather clear',
    ...['crosshair', 'health', 'hunger', 'armor', 'progress_bar', 'air_bubbles', 'status_effects', 'item_text', 'tooltips', 'paperdoll', 'touch_controls'].map((h) => `do hud @a hide ${h}`),
    'do scriptevent grl:show 0', 'wait 6000', 'absent clientlog \\bERROR\\b', ''];
  const cal = (shot) => [`wait 1500`, `shot ${shot}`, `measure geoui ${shot}`];
  // R4.1 / R4.2: the player's scale in the UI
  lines.push('section scale', `do scriptevent grl:show ${BITS.cal}`);
  for (const s of SCALES) lines.push(`do scriptevent grl:scale ${s}`, ...cal(`cal-s${tag(s)}`));
  lines.push('do scriptevent grl:scale 0.9375', '');
  // R4.8: the entity's own scale
  lines.push('section entity-scale', 'do scriptevent grl:small 1', ...cal('cal-small'), 'do scriptevent grl:small 0', 'wait 1000', '');
  // R2.3: poses
  lines.push('section poses',
    'do scriptevent grl:sneak 1', ...cal('cal-sneak'), 'do scriptevent grl:sneak 0',
    'do scriptevent grl:anim animation.player.sleeping', ...cal('cal-sleep'),
    'do scriptevent grl:anim animation.player.swim', ...cal('cal-swim'), 'do scriptevent grl:anim stop',
    'do summon boat 0 -60 2', 'wait 500', 'do ride @a start_riding @e[type=boat,c=1]', ...cal('cal-ride'), 'do ride @a stop_riding', 'do kill @e[type=boat]', 'do tp @a 0 -60 0 0 0',
    'perspective', ...cal('cal-third'), 'perspective', ...cal('cal-front'), 'perspective', 'wait 1000', '');
  // R3.7 / R3.8: light — the ramp and the tilted planes under four lights; the hurt flash; invisibility
  const colours = (shot) => {
    const out = [`shot ${shot}`];
    for (const r of RAMP) out.push(`measure color ${shot} ${inner(studioRect(r, W, H)).join(' ')}`);
    return out;
  };
  const tilts = (shot) => {
    const out = [`shot ${shot}`];
    for (const t of TILT) out.push(`measure color ${shot} ${inner(studioRect(t, W, H), 0.3).join(' ')}`);
    return out;
  };
  const light = (cond, setup, undo) => {
    lines.push(`section light-${cond}`, ...setup, 'do scriptevent grl:show 0', 'wait 1500', 'shot world',
      `do scriptevent grl:show ${BITS.ramp}`, 'wait 1500', ...colours(`ramp-${cond}`),
      `do scriptevent grl:show ${BITS.tilt}`, 'wait 1500', ...tilts(`tilt-${cond}`), 'do scriptevent grl:show 0', ...undo, '');
  };
  light('noon', ['do time set noon'], []);
  light('midnight', ['do time set midnight'], []);
  light('nightvision', ['do effect @a night_vision 60 0 true'], ['do effect @a clear']);
  // (a closed stone box round the player: no sky, no light)
  light('box', ['do time set noon', 'do fill -2 -61 -2 2 -56 2 stone hollow', 'do tp @a 0 -60 0 0 0'], ['do fill -2 -61 -2 2 -56 2 air', 'do fill -2 -61 -2 2 -61 2 grass_block', 'do tp @a 0 -60 0 0 0']);
  lines.push('section hurt', `do scriptevent grl:show ${BITS.ramp}`, 'wait 1500', 'do damage @a 1', ...colours('ramp-hurt'), 'do effect @a instant_health 1 1 true', 'do scriptevent grl:show 0', '');
  lines.push('section invisible', `do scriptevent grl:show ${BITS.cal}`, 'do effect @a invisibility 60 0 true', ...cal('cal-invisible'), 'do effect @a clear', 'do scriptevent grl:show 0', '');
  // R5.3: the GUI scale on 6 screens (the real hotbar hidden: the whole frame is seen)
  lines.push('section gui', 'do hud @a hide hotbar', '');
  for (const [w, h] of GUI_SIZES) lines.push(`section gui-${w}x${h}`, `size ${w}x${h}`, 'wait 9000', 'do scriptevent grl:show 0', 'wait 1500', 'shot world',
    `do scriptevent grl:show ${BITS.gui}`, 'wait 2000', `shot gui-${w}x${h}`, `measure marks gui-${w}x${h}`, '');
  lines.push('section end', 'size reset', 'wait 6000', 'do scriptevent grl:show 0', 'do hud @a reset', 'do time set noon', 'shot end', '');
  return lines.join('\n');
}

// ---- reading a run: each hypothesis held, fell, or was not measured
export function verdict(measures) {
  const pr = predictions(), out = [];
  const by = (shot, kind) => (measures || []).filter((m) => m.shot === shot && (!kind || m.kind === kind));
  const geo = (shot) => { const m = by(shot, 'geoui')[0]; return m && m.ok ? m.values : null; };
  const pct = (a, b) => (100 * (a - b) / b);
  // R4.1: the unit goes as the scale
  const sc = pr.scale.map((p) => ({ p, v: geo(p.shot) }));
  const scOk = sc.filter((x) => x.v);
  if (scOk.length >= 2) {
    const worst = Math.max(...scOk.map((x) => Math.abs(pct(x.v.unitsPerScreenH, x.p.unitsPerScreenH))));
    out.push({ rule: 'R4.1', claim: '1 モデル単位 = scripts.scale / 16 x パネルの短い辺', result: worst <= 0.5 ? '成り立つ' : '成り立たない', detail: scOk.map((x) => `scale ${x.p.scale}: 高さ ${x.v.unitsPerScreenH.toFixed(2)}（予測 ${x.p.unitsPerScreenH}、${pct(x.v.unitsPerScreenH, x.p.unitsPerScreenH).toFixed(2)} %）`).join(' / ') });
    // R4.2: the centre's model y under M (D fixed in model units) and W (fixed in blocks)
    const eM = Math.max(...scOk.map((x) => Math.abs(x.v.centreY - x.p.centreY_M))), eW = Math.max(...scOk.map((x) => Math.abs(x.v.centreY - x.p.centreY_W)));
    const which = eM < 1 && eM < eW ? 'M: モデルの単位で決まった長さ' : eW < 1 && eW < eM ? 'W: ブロックで決まった長さ（scale で割った単位）' : 'どちらでもない';
    out.push({ rule: 'R4.2', claim: '原点のずれ D は何で決まるか', result: which, detail: `中心の y のずれ: M ${eM.toFixed(2)}・W ${eW.toFixed(2)} 単位` });
  } else out.push({ rule: 'R4.1', claim: '1 モデル単位 = scripts.scale / 16 x パネルの短い辺', result: '測れなかった', detail: `測れた scale ${scOk.length} 個` });
  const sm = geo(pr.entityScale.shot);
  if (sm) {
    const f = Math.abs(pct(sm.unitsPerScreenH, pr.entityScale.follows.unitsPerScreenH)), i = Math.abs(pct(sm.unitsPerScreenH, pr.entityScale.ignores.unitsPerScreenH));
    out.push({ rule: 'R4.8', claim: 'プレイヤーの minecraft:scale（他のアドオンが変える）に renderer が付いてくるか', result: f < 1 ? '付いてくる（GeoUI が縮む）' : i < 1 ? '付いてこない' : 'どちらでもない', detail: `高さ ${sm.unitsPerScreenH.toFixed(2)} 単位` });
  } else out.push({ rule: 'R4.8', claim: 'プレイヤーの minecraft:scale', result: '測れなかった', detail: '' });
  const poses = pr.poses.map((p) => ({ p, v: geo(p.shot) })), moved = poses.filter((x) => x.v && (Math.abs(pct(x.v.unitsPerScreenH, x.p.unitsPerScreenH)) > 100 * x.p.tolerance || Math.abs(x.v.centreY - x.p.centreY) > 0.5));
  const seen = poses.filter((x) => x.v);
  out.push({ rule: 'R2.3', claim: '姿勢・乗り物・視点で GeoUI は動かない', result: !seen.length ? '測れなかった' : moved.length ? `動いた（${moved.map((x) => x.p.shot).join(' ')}）` : '成り立つ', detail: seen.map((x) => `${x.p.shot}: 高さ ${x.v.unitsPerScreenH.toFixed(2)}・中心 ${x.v.centreY.toFixed(2)}`).join(' / ') });
  // R5.3: the GUI scale's rule
  const gui = pr.gui.map((p) => { const m = by(p.shot, 'marks')[0], v = m && m.ok ? m.values : null; return { p, ui: v && Number.isFinite(v.violetx0) ? (v.violetx1 - v.violetx0) / 182 : null }; });
  const gm = gui.filter((x) => x.ui !== null), aOk = gm.every((x) => Math.abs(x.ui - x.p.A) < 0.1), bOk = gm.every((x) => Math.abs(x.ui - x.p.B) < 0.1);
  out.push({ rule: 'R5.3', claim: 'GUI の倍率 = min(⌊幅/320⌋, ⌊高さ/240⌋)（A）か ⌊高さ/240⌋（B）か', result: !gm.length ? '測れなかった' : aOk && !bOk ? 'A' : bOk && !aOk ? 'B' : aOk && bOk ? 'A と B を分ける画面が測れていない' : 'どちらでもない',
    detail: gm.map((x) => `${x.p.W}x${x.p.H}: ${x.ui.toFixed(2)}（A ${x.p.A}・B ${x.p.B}）`).join(' / ') });
  // R3.7: light — each patch's brightness against its grey (the factor), per condition
  const col = (shot) => by(shot, 'color').map((m) => (m.ok ? m.values : null));
  const rows = [];
  for (const cond of pr.light.conditions) {
    const ramp = col(`ramp-${cond}`), tilt = col(`tilt-${cond}`);
    if (!ramp.length && !tilt.length) { rows.push(`${cond}: 測れなかった`); continue; }
    const f = ramp.map((v, i) => (v && RAMP[i].grey ? (v.r + v.g + v.b) / 3 / RAMP[i].grey : null)).filter((x) => x !== null);
    const t = tilt.map((v, i) => (v ? `${TILT[i].id} ${((v.r + v.g + v.b) / 3).toFixed(0)}` : null)).filter(Boolean);
    rows.push(`${cond}: 灰色の倍率 ${f.length ? `${Math.min(...f).toFixed(3)}〜${Math.max(...f).toFixed(3)}` : '—'}・傾き ${t.join(' ')}`);
  }
  out.push({ rule: 'R3.7', claim: '板の色にかかる光（明るさ・法線・時刻・暗視・暗い箱）', result: '値（下）', detail: rows.join(' / ') });
  const hurt = col('ramp-hurt')[RAMP.findIndex((r) => r.id === 'g255')], noon = col('ramp-noon')[RAMP.findIndex((r) => r.id === 'g255')];
  // (the flash lasts about half a second: a shot that missed it looks the same as no flash — only "red" is a sure answer)
  out.push({ rule: 'R3.8', claim: 'ダメージの赤い点滅（is_hurt_color の a 0）は GeoUI にかからない', result: hurt && noon ? (Math.abs(hurt.r - noon.r) + Math.abs(hurt.g - noon.g) + Math.abs(hurt.b - noon.b) < 12 ? '赤くならなかった（写した時に点滅していたかは分からない）' : '赤くなった') : '測れなかった',
    detail: hurt && noon ? `白: 昼 rgb(${[noon.r, noon.g, noon.b].map(Math.round)}) / ダメージ rgb(${[hurt.r, hurt.g, hurt.b].map(Math.round)})` : '' });
  const inv = by('cal-invisible', 'geoui')[0];
  out.push({ rule: 'R3.9', claim: '透明化のポーションの間も GeoUI は描かれる', result: inv ? (inv.ok ? '描かれる' : '描かれない（目盛りが無い）') : '測れなかった', detail: inv && !inv.ok ? String(inv.why || '') : '' });
  return out;
}
export function verdictText(rows) { return rows.map((r) => `${r.rule.padEnd(6)} ${r.claim}\n       → ${r.result}${r.detail ? `\n         ${r.detail}` : ''}`).join('\n'); }

// ---- the add-on's other files
const TESTS = `# geoui_rules（bds/geoui/screen/rules.mjs が作る）: 規則を決める実験のパックが本物の BDS で動くか（プロパティ・scale・しゃがむ・
# アニメーション・体の大きさの component・乗り物）。描画（目盛り・灰色・GUI の枠）は app.txt（本物のアプリ）が写して測る。

## 読み込める（プロパティが既定値）
@A join
wait 2000
js JSON.stringify([p('A').getProperty('grl:show'), p('A').getProperty('grl:sc')])
= [0,9375]

## 表示と UI の中の scale を変える
scriptevent grl:show 3
scriptevent grl:scale 0.5
wait 300
js JSON.stringify([p('A').getProperty('grl:show'), p('A').getProperty('grl:sc')])
= [3,5000]
scriptevent grl:scale 9
~ GRL scale <0.1…4>
scriptevent grl:scale 0.9375
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
`;
const TASK = `# geoui_rules — GeoUI の規則を本物の画面で決める

## Request
「規則を見つけて GeoUI によるマイクラの反映設計を全て網羅してさらに深めて」。規則の台帳は bds/geoui/RULES.md。その中の
仮説（まだ本物の画面で決まっていない規則）を、走らせる前に書いた予測（predictions.json）と比べて決める。
作り方: \`node bds/geoui/screen/rules.mjs\`（このフォルダはそれが書く。手で直さない）。

## What it decides
- R4.1: renderer の 1 モデル単位 = scripts.scale / 16 x パネルの短い辺（UI の中だけ scale を 0.5・0.75・1・1.5 に。目盛りの高さが 160 / scale になるか）
- R4.2: 原点のずれ D がモデルの単位で決まっているか、ブロックで決まっているか（目盛りの中心で分ける）
- R4.8: プレイヤーの minecraft:scale（他のアドオンが変える）に renderer が付いてくるか
- R2.3: しゃがむ（サーバーから）・眠る・泳ぐのアニメーション・ボート・三人称（後ろ・前）で GeoUI が動かないか
- R3.7: 板の色にかかる光（9 段の灰色と 5 枚の傾けた白、昼・夜・暗視・閉じた石の箱）
- R3.8・R3.9: ダメージの赤い点滅・透明化
- R5.3: GUI の倍率の決まり（6 つの画面で、A = min(⌊幅/320⌋, ⌊高さ/240⌋) と B = ⌊高さ/240⌋ を分ける）

## Run
\`node lab.mjs app ci -a geoui_rules --screen 720x1560\`（人の許可をもらってから）→ \`node bds/geoui/screen/rules.mjs verdict <summary.json>\`。

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（プロパティが既定値）
- [ ] 表示と UI の中の scale を変える
- [ ] サーバーからしゃがませる・アニメーション
- [ ] 体の大きさ（minecraft:scale 0.5、他のアドオンがするように）
- [ ] 乗り物（ボートに乗る・降りる）
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
  if (argv[0] === 'predict') { console.log(JSON.stringify(predictions(), null, 1)); return; }
  if (argv[0] === 'verdict') {
    let f = argv[1] || '';
    if (f && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = ['summary.json', 'results/summary.json'].map((x) => path.join(argv[1], x)).find((x) => fs.existsSync(x)) || '';
    if (!f || !fs.existsSync(f)) { console.error('node bds/geoui/screen/rules.mjs verdict <summary.json | 実行のフォルダ>'); process.exit(2); }
    console.log(verdictText(verdict(JSON.parse(fs.readFileSync(f, 'utf8')).measures || [])));
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
