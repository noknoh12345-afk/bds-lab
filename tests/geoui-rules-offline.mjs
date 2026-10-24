#!/usr/bin/env node
// GeoUI's rules (bds/geoui/RULES.md) and the probe that decides the open ones (bds/geoui/screen/rules.mjs → bds/addons/geoui_rules),
// no network, no game:
//   pack       the probe is what rules.mjs makes; it builds with no warning; its Molang parses and reads nothing unset; the player's
//              scale in the UI follows grl:sc (divided by q.model_scale with grl:comp) and nowhere else (the paper doll, the world:
//              0.9375); minecraft:scale by an event; the experiment's own materials (USE_OVERLAY, USE_EMISSIVE) on their bones only,
//              never in place of a proved one; the texture's alpha where the emissive test needs it; planes at the depths asked
//   history    run 40055307539 (bds/geoui/rules-history/run-40055307539/): its predictions as they were committed before it, and its
//              public summary read back to what RULES.md records — the unit scale / 16, the origin 24 model units, the body's scale
//              followed, the poses still, the light 0.757, right45 not drawn, invisibility not drawn
//   predict    this run's predictions: the GUI scale's two rules — both hold on the 10 screens measured (run 39989463030) and part on
//              the 6 the probe adds; emissive, colour, overlay and depth alternatives that a run can tell apart
//   frame      Studio's frame in px: the screen's middle is the model's (0, centreOf(scale)) — what run 40055307539 measured at every
//              clean scale; every box `measure color` reads is on the 1560 x 720 screen and off the hotbar; every measure fits the public
//              summary (run 40055307539 lost half of its to a cap of 40)
//   verdict    a run that agrees, and one that does not, read back the right way
//   api        every GeoUI Screen pack asks for the @minecraft/server version of the newest API its script uses (R7.1)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = require('../bds/geoui/geoui_builder.js'), P = require('../bds/geoui/screen/pack.js'), L = require('../bds/geoui/screen/layout.js');
const R = await import('../bds/geoui/screen/rules.mjs');
const { decodePng } = await import('../bds/geoui/png.mjs');
const { cleanMeasures } = await import('../app/lib/measure.mjs');
const HIST = path.join(TOP, 'bds/geoui/rules-history/run-40055307539');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${String(d).split('\n').slice(0, 12).join('\n  ')}`}`); };
const get = (rows, id) => rows.find((x) => x.rule === id) || { result: '', detail: '' };

// ---- pack
const built = P.build(R.scene(), { core: G }), f = built.files;
{
  let fresh = true, why = '';
  try { execFileSync(process.execPath, [path.join(TOP, 'bds/geoui/screen/rules.mjs'), '--check'], { stdio: 'pipe' }); } catch (e) { fresh = false; why = String(e.stderr || e.message); }
  ok(fresh, 'bds/addons/geoui_rules is what rules.mjs makes', why);
  ok(built.warnings.length === 0, 'the probe builds with no warning (no group in another\'s renderer, the API version it needs)', built.warnings.join('\n'));
  const ent = JSON.parse(f['rp/entity/player.entity.json'])['minecraft:client_entity'].description;
  const ours = ent.scripts.pre_animation.filter((l) => l.includes('grl_'));
  const rc = JSON.parse(f['rp/render_controllers/grl.render_controllers.json']).render_controllers['controller.render.grl_pal'];
  ok(ours.every((l) => G.molangError(l.replace(/;\s*$/, '')) === null) && G.molangError(ent.scripts.scale) === null && [rc.color.r, rc.overlay_color.a].every((x) => G.molangError(x) === null),
    'its Molang parses (pre_animation, the scale script, the controller\'s colour and overlay)');
  ok(G.unsetReads(ent.scripts.pre_animation, { init: ent.scripts.initialize, ours: /^variable\.grl_/ }).length === 0, 'it reads no variable before setting it');
  const scaleOf = (props, o = {}) => {
    const env = G.envOf({ props, isInUi: o.ui ?? 1, isPaperdoll: o.doll ?? 0 });
    const q0 = env.query; env.query = (name, a) => (name === 'query.model_scale' ? (o.ms ?? 1) : q0(name, a));
    G.runPre(ours, env);
    return G.molang(ent.scripts.scale, env);
  };
  ok(scaleOf({ 'grl:sc': 5000 }) === 0.5 && scaleOf({ 'grl:sc': 5000 }, { doll: 1 }) === 0.9375 && scaleOf({ 'grl:sc': 5000 }, { ui: 0 }) === 0.9375 && scaleOf({ 'grl:sc': 9375 }) === 0.9375,
    'the player\'s scale: grl:sc / 10000 in the UI, 0.9375 on the paper doll and in the world (vanilla\'s scripts.scale)');
  ok(scaleOf({ 'grl:sc': 9375, 'grl:comp': 1 }, { ms: 0.5 }) === 1.875 && scaleOf({ 'grl:sc': 9375, 'grl:comp': 0 }, { ms: 0.5 }) === 0.9375 && scaleOf({ 'grl:sc': 9375, 'grl:comp': 1 }, { ms: 0.5, doll: 1 }) === 0.9375
    && scaleOf({ 'grl:sc': 9375, 'grl:comp': 1 }, { ms: 0 }) === 0.9375 && scaleOf({ 'grl:sc': 9375, 'grl:comp': 1 }, { ms: 0.5, ui: 0 }) === 0.9375,
    'with grl:comp it is divided by q.model_scale in the UI only (0.5 → 1.875: the body\'s half size cancelled), never by one under 0.05');
  const env = G.envOf({ props: { 'grl:gain': 1320, 'grl:ov': 240 } }); G.runPre(ours, env);
  const env0 = G.envOf({ props: { 'grl:gain': 1000, 'grl:ov': 0 } }); G.runPre(ours, env0);
  ok(G.molang(rc.color.r, env) === 1.32 && G.molang(rc.overlay_color.a, env) === 0.24 && G.molang(rc.color.r, env0) === 1 && G.molang(rc.overlay_color.a, env0) === 0 && rc.is_hurt_color.a === 0 && rc.on_fire_color.a === 0,
    'the controller\'s colour is grl:gain / 1000 and the white overlay\'s alpha grl:ov / 1000 (1 and 0 by default); hurt and fire stay at alpha 0');
  const be = JSON.parse(f['bp/entities/player.json'])['minecraft:entity'];
  ok(be.component_groups['grl:small']['minecraft:scale'].value === 0.5 && be.events['grl:small'].add.component_groups[0] === 'grl:small' && be.events['grl:normal'].remove.component_groups[0] === 'grl:small',
    'minecraft:scale 0.5 by the event grl:small (as another add-on would set it), off again by grl:normal');
  const geo = JSON.parse(f['rp/models/entity/grl/pal.geo.json'])['minecraft:geometry'][0], bone = (nm) => geo.bones.find((b) => b.name === nm);
  const tilt = bone('grl_tilt_rxm45'), t = R.TILT.find((x) => x.id === 'rx-45');
  ok(tilt && JSON.stringify(tilt.rotation) === JSON.stringify([-45, 0, 0]) && tilt.pivot[0] === t.x && tilt.pivot[1] === t.y && R.TILT.every((x) => bone(`grl_tilt_${x.id.replace('-', 'm')}`)),
    'every tilted plane turns about its own middle (pivot at its centre, model units)');
  const v1 = R.TILT.find((x) => x.id === 'ry-45');
  ok(v1.x === 120 && v1.y === 135 && v1.w === 24 && JSON.stringify(v1.rot) === JSON.stringify([0, -45, 0]) && R.TILT.find((x) => x.id === 'ry-45b').x < 0,
    'run 40055307539\'s right45 is drawn again where it was (120, 135, 24 units, −45° about y), and the same turn on the far left');
  ok(geo.bones.every((b) => !['root', 'waist', 'body', 'head'].includes(b.parent || '')), 'no GeoUI bone hangs off a vanilla bone (the pose animations move root, arms and head only: R2.3)');
  // the experiment's own materials
  const mats = JSON.parse(f['rp/materials/entity.material']).materials;
  ok(JSON.stringify(mats['grl_overlay:grl_base']['+defines']) === JSON.stringify(['USE_UV_ANIM', 'ALPHA_TEST', 'USE_OVERLAY']) && JSON.stringify(mats['grl_emissive:grl_base']['+defines']) === JSON.stringify(['USE_UV_ANIM', 'USE_EMISSIVE'])
    && JSON.stringify(mats['grl_cutout:grl_base']) === JSON.stringify(P.MATS.cutout) && JSON.stringify(mats['grl_fade:grl_base']) === JSON.stringify(P.MATS.fade),
    'the probe\'s own materials: USE_OVERLAY (with the alpha test) and USE_EMISSIVE (without), beside the proved cutout and fade unchanged');
  const rcMats = Object.assign({}, ...rc.materials);
  ok(rcMats['*'] === 'material.grl_cutout' && rcMats.grl_b_fade === 'material.grl_fade' && rcMats.grl_b_ovl === 'material.grl_overlay' && rcMats.grl_b_emis === 'material.grl_emissive' && Object.keys(rcMats).length === 4
    && ent.materials.grl_overlay === 'grl_overlay' && ent.materials.grl_emissive === 'grl_emissive',
    'each material on its own bone only (the controller: cutout for every other bone)');
  let refused = '';
  try { P.build(Object.assign(R.scene(), { extraMaterials: { cutout: { '+defines': ['USE_EMISSIVE'] } } }), { core: G }); } catch (e) { refused = e.message; }
  ok(/cutout/.test(refused) && !P.MAT_NAMES.includes('overlay') && !P.MAT_NAMES.includes('emissive'), 'an experiment never redefines a proved material, and the unproved ones stay out of pack.js MATS', refused);
  // the texture's alpha (the emissive test) and the depths
  const png = decodePng(Buffer.from(f['rp/textures/grl/pal.png'].base64, 'base64')), alphaAt = (i) => png.data[i * 4 + 3];
  const uvOf = (bn, k = 0) => (bone(bn).cubes[k].uv.north.uv[0] - 0.25);
  ok(alphaAt(uvOf('grl_b_emis', 0)) === 255 && alphaAt(uvOf('grl_b_emis', 1)) === 128 && alphaAt(uvOf('grl_b_emis', 2)) === 8 && alphaAt(uvOf('grl_b_emis', 3)) === 8 && alphaAt(uvOf('grl_b_cutout', 0)) === 255
    && png.data[uvOf('grl_b_emis', 2) * 4] === 255 && png.data[uvOf('grl_b_emis', 3) * 4] === 128 && bone('grl_b_emis').cubes.length === 4,
    'the emissive patches sample texels of alpha 255, 128, 8 (white) and 8 (grey 128); the others are opaque');
  const dz = bone('grl_depth').cubes;
  ok(R.DEPTH.every((d, i) => Math.abs(dz[i].origin[2] - d.z) < 0.1 && Math.abs(dz[i].origin[0] - (d.x - d.w / 2)) < 1e-6) && dz[R.DEPTH.length].origin[2] === 5 && dz[R.DEPTH.length + 1].origin[2] === -5
    && Math.abs(dz[R.DEPTH.length + 2].origin[2]) < 0.1 && Math.abs(dz[R.DEPTH.length + 3].origin[2] - 50) < 0.1 && dz[R.DEPTH.length + 2].size[0] === 300,
    'depth: the squares at z −150 … 150, red at +5 and green at −5, the long boards at 0 and 50');
}

// ---- history: run 40055307539
{
  const pr1 = JSON.parse(fs.readFileSync(path.join(HIST, 'predictions.json'), 'utf8'));
  const sum1 = JSON.parse(fs.readFileSync(path.join(HIST, 'summary.json'), 'utf8')), app1 = fs.readFileSync(path.join(HIST, 'app.txt'), 'utf8');
  ok(pr1.version === 1 && pr1.scale.every((p) => Math.abs(p.unitsPerScreenH * p.scale - 160) < 1e-3), 'run 40055307539\'s predictions as committed: the screen 160 / scale model units high in Studio\'s frame (170.67 at 0.9375)');
  const v = pr1.scale.find((p) => p.scale === 0.9375);
  ok(Math.abs(v.centreY_M - 135.03) < 0.05 && v.centreY_M === v.centreY_W && pr1.scale.filter((p) => Math.abs(p.centreY_M - p.centreY_W) > 5).length >= 2,
    'its two hypotheses for the origin met at 0.9375 and stood more than 5 units apart at 0.5 and 1.5: the run told them apart');
  ok(sum1.measures.length === 40 && sum1.measures.every((m) => m.ok) && JSON.stringify(sum1.failed_lines) === '[234]' && /^measure geoui cal-invisible$/.test(app1.split('\n')[233])
    && (app1.match(/^measure /gm) || []).length > 80,
    'its public summary: 40 measures of its 80+ (the rest lost to the cap of 40), one failed line — 234, the grid under invisibility');
  const rows = R.verdict(sum1, pr1, app1);
  ok(get(rows, 'R4.1').result === '成り立つ' && /^M: モデルの単位で 24\.000/.test(get(rows, 'R4.2').result) && get(rows, 'R4.8').result.startsWith('付いてくる') && get(rows, 'R2.3').result.startsWith('成り立つ'),
    'read back: the unit is scale / 16 (R4.1), the origin 24.000 model units at every scale (R4.2), the body\'s scale followed (R4.8), the poses moved nothing (R2.3)', JSON.stringify(rows.map((x) => [x.rule, x.result])));
  ok(/noon: 出る色 = 0\.7536 x 入れた色 \+ 2\.3/.test(get(rows, 'R3.7').detail) && /midnight: 出る色 = 0\.7572 x 入れた色 − 0\.3/.test(get(rows, 'R3.7').detail)
    && get(rows, 'R3.12').result === '描かれない面: right45' && /flat 194 up45 107 down45 235 left45 148 right45 描かれない/.test(get(rows, 'R3.12').detail) && get(rows, 'R3.9').result.startsWith('描かれない見込み'),
    'the light 0.7536 / 0.7572 x the colour (R3.7), right45 not drawn at noon or midnight (R3.12), the grid not found under invisibility (R3.9)', JSON.stringify(rows.map((x) => [x.rule, x.result, x.detail])));
  ok(sum1.measures.filter((m) => m.kind === 'geoui' && /^cal-s\d/.test(m.shot) && m.shot !== 'cal-s0_9375').length === 4 && sum1.measures.filter((m) => m.kind === 'geoui' && /^cal-s\d/.test(m.shot) && m.shot !== 'cal-s0_9375').every((m) => Math.abs(m.values.centreY - R.centreOf(Number(m.shot.slice(5).replace('_', '.')))) < 0.01
    && Math.abs(m.values.unitsPerScreenH - 160 / Number(m.shot.slice(5).replace('_', '.'))) < 1e-3),
    'layout\'s renderer (D 24, K scale / 16) gives every clean scale\'s centre and height of that run within 0.01 unit');
  ok(L.D === 24 && L.K === 0.9375 / 16, 'layout.js holds what it decided: D = 24, K = 0.9375 / 16');
}

// ---- predict
const pr = R.predictions();
{
  const measured = [[1024, 768, 3], [1104, 920, 3], [1280, 800, 3], [1560, 720, 3], [1920, 1080, 4], [2160, 1080, 4], [2340, 1080, 4], [2400, 1080, 4], [2520, 1080, 4], [3840, 1080, 4]];
  ok(measured.every(([W, H, u]) => R.guiRuleA(W, H) === u && R.guiRuleB(W, H) === u), 'both GUI scale rules agree with the 10 screens measured (run 39989463030)');
  ok(pr.gui.filter((g) => g.A !== g.B).length >= 2 && pr.gui.some((g) => g.W === 1280 && g.A === 4) && pr.gui.some((g) => g.W === 1279 && g.A === 3), 'the probe\'s 6 screens part the two rules and stand on each one\'s edges');
  const e = pr.bright.emissive, gap = (a, b) => Math.min(...Object.keys(a).map((k) => Math.abs(a[k] - b[k])).filter((x) => x > 0));
  ok(e.lerp.em255z > 250 && e.lerp.em255h > 220 && Math.abs(e.lerp.em255 - 193.035) < 0.01 && Math.abs(e.none.em255z - e.lerp.em255z) > 50 && e.full.em255 === 255,
    'emissive: lerp (the light by the alpha), full and none are 30+ grey levels apart where the run looks (alpha 8 white: 253 vs 193)');
  const o = pr.bright.overlay;
  ok(Math.abs(o.after.ov128 - o.before.ov128) > 10 && Math.abs(o.before.ov128 - o.none.ov128) > 20 && Math.abs(pr.bright.colour.unclamped.fd255 - pr.bright.colour.clamped.fd255) > 50 && gap(o.after, o.before) > 10,
    'overlay after the light, before it, or not at all, and the colour above 1 or clamped, are told apart by grey 128 and white');
  ok(pr.bright.gain === 1.32 && pr.bright.ov === 0.24 && R.appTxt().includes('do scriptevent grl:gain 1.32\n') && R.appTxt().includes('do scriptevent grl:ov 0.24\n'),
    'the colour 1.32 (= 1 / 0.757) and the overlay 0.24 the predictions are for are the ones app.txt sets');
  ok(pr.depth.zs.includes(-150) && pr.depth.zs.includes(150) && pr.depth.zs.includes(60) && pr.depth.overlap.ifPlusZFar === 'green' && Math.abs(pr.comp.cancels.unitsPerScreenH * 2 - pr.comp.notCancelled.unitsPerScreenH) < 1e-3,
    'depth runs past the ±60 measured, the overlap names which colour means which, R4.9\'s two outcomes are a factor 2 apart');
  ok(pr.tilt.planes.filter((p) => p.v1 !== undefined).length === 5 && pr.tilt.planes.find((p) => p.id === 'ry-45').v1 === null, 'the tilts carry run 40055307539\'s five values (right45: not drawn)');
}

// ---- frame
{
  const c = R.studioRect({ x: 0, y: R.centreOf(0.9375), w: 0, h: 0 }, 1560, 720);
  ok(Math.abs(c.x0 - 780) < 0.01 && Math.abs(c.y0 - 360) < 0.01 && Math.abs(R.centreOf(0.9375) - 134.9333) < 1e-3, 'Studio\'s frame: the model\'s (0, 134.93) is the middle of a 1560 x 720 screen', JSON.stringify(c));
  const box = R.studioRect(R.RAMP[4], 1560, 720);
  ok(Math.abs((box.x1 - box.x0) - 30 * 0.9375 / 16 * 72) < 1e-9, 'a 30-unit patch is 30 x K x 72 px wide (the panel\'s shorter side 10 % of 720)');
  const app = R.appTxt();
  ok(app === fs.readFileSync(path.join(TOP, 'bds/addons/geoui_rules/app.txt'), 'utf8'), 'app.txt in the add-on is what rules.mjs makes');
  const shots = [...app.matchAll(/^shot (\S+)/gm)].map((m) => m[1]), measured = [...app.matchAll(/^measure \w+ (\S+)/gm)].map((m) => m[1]);
  ok(measured.every((s) => shots.includes(s)) && measured.every((s) => app.indexOf(`shot ${s}\n`) < app.indexOf(`measure`, app.indexOf(`shot ${s}\n`))), 'every measured shot is taken first in app.txt');
  const count = (re) => (app.match(re) || []).length, P2 = R.PROBES;
  ok(count(/^measure color /gm) === 3 * P2.bright.length + P2.depth.length + P2.tilt.length + P2.invisible.length + 3 * P2.hurt.length + 2 * P2.ramp.length + P2.calBoard.length
    && count(/^measure geoui /gm) === 1 + R.CONTROL_SCALES.length && count(/^measure marks /gm) === R.GUI_SIZES.length && count(/^measure diff /gm) === 2,
    'app.txt measures the bright set 3 times, depth, the tilts, invisible, 3 hurts, the ramp in 2 lights, the black board; the grid 3 times; 6 GUI frames');
  const all = Object.values(P2).flat();
  ok(all.every((p) => p.box[0] >= 0 && p.box[1] >= 0 && p.box[2] <= 1560 && p.box[3] <= 720 && p.box[2] > p.box[0] && p.box[3] > p.box[1]) && all.every((p) => !(p.box[3] > 650 && p.box[2] > 500 && p.box[0] < 1060)),
    'every box measured is on the 1560 x 720 screen and clear of the hotbar (546 x 66 px at the bottom\'s middle)');
  const kept = cleanMeasures(Array.from({ length: 400 }, () => ({ kind: 'color', shot: 'x', ok: true, values: {} }))).length, total = count(/^measure /gm);
  ok(total <= kept, `every measure (${total}) fits the public summary (${kept}): none lost as run 40055307539 lost its last half`);
  const firstMeasure = app.split('\n').findIndex((l) => l.startsWith('measure ')), sections = [...app.matchAll(/^section (\S+)/gm)].map((m) => m[1]);
  ok(sections.indexOf('brighten') < sections.indexOf('gui') && sections.indexOf('depth') < sections.indexOf('gui') && sections.indexOf('tilt') < sections.indexOf('gui') && sections[sections.length - 1] === 'end' && firstMeasure > 0,
    'the new questions run first (a run that stops early keeps them); the GUI screens and the control last');
  ok(/fill -2 -60 -2 2 -56 2 air\ndo fill -2 -61 -2 2 -61 2 grass_block/.test(app) && /fill -2 -60 -2 2 -56 2 air\nfill -2 -61 -2 2 -61 2 grass_block/.test(fs.readFileSync(path.join(TOP, 'bds/addons/geoui_rules/tests.txt'), 'utf8')),
    'the closed box is taken down above the floor first (no hole under the player) — the same commands tests.txt runs on the real BDS');
}

// ---- verdict (made-up runs)
{
  const sky = { br: 150, bg: 185, bb: 225, bspread: 20 };
  const flat = (gv, extra = {}) => ({ r: gv, g: gv, b: gv, spread: 0, ...sky, ...extra });
  const world = () => ({ r: 150, g: 185, b: 225, spread: 20, ...sky });
  const col = (shot, v) => ({ shot, kind: 'color', ok: true, values: v });
  const mk = (ver) => {
    const m = [];
    for (const [k, shot] of Object.entries(pr.bright.shots)) for (const b of R.BRIGHT) m.push(col(shot, flat(ver.bright(k, b))));
    for (const p of R.PROBES.depth) {
      const d = R.DEPTH.find((x) => x.id === p.id);
      m.push(col('depth', d ? (Math.abs(d.z) <= ver.depthMax ? flat(193) : world())
        : p.id === 'overlap' ? flat(0, ver.front === 'green' ? { g: 193, r: 0, b: 0 } : { r: 193, g: 0, b: 0 }) : p.id === 'redOnly' ? flat(0, { r: 193, g: 0, b: 0 }) : p.id === 'greenOnly' ? flat(0, { g: 193, r: 0, b: 0 })
          : /^board0/.test(p.id) ? flat(72.7) : world()));
    }
    for (const t of R.TILT) m.push(col('tilt-noon', t.id === 'ry-45' && ver.r45gone ? world() : flat(193)));
    m.push(col('tilt-noon', world()));
    for (const p of R.PROBES.invisible) m.push(col('ramp-invisible', ver.inv ? flat(p.id === 'g255' ? 193 : 0) : world()));
    for (const s of pr.hurt.shots) for (const id of pr.hurt.ids) m.push(col(s, flat(193, ver.red && id === 'ov255' ? { r: 253 } : {})));
    m.push({ shot: 'cal-comp', kind: 'geoui', ok: true, values: { unitsPerScreenH: ver.comp, centreY: 135 } });
    for (const cond of pr.light.conditions) { for (const r of R.RAMP) m.push(col(`ramp-${cond}`, flat(r.grey * 0.757))); m.push(col(`ramp-${cond}`, world())); }
    for (const g of pr.gui) m.push({ shot: g.shot, kind: 'marks', ok: true, values: { violetx0: 100, violetx1: 100 + 182 * ver.gui(g) } });
    for (const c of pr.control) m.push({ shot: c.shot, kind: 'geoui', ok: true, values: { unitsPerScreenH: c.unitsPerScreenH * ver.control, centreY: c.centreY } });
    m.push(col('cal-s0_9375', ver.board100 ? flat(0) : world()));
    return R.verdict(m);
  };
  const B = pr.bright;
  const good = mk({ bright: (k, b) => (k === 'plain' ? (b.mat === 'emissive' ? B.emissive.lerp[b.id] : b.c === 'g255' ? 193 : 96.9) : k === 'gain' ? (b.mat === 'fade' ? B.colour.unclamped[b.id] : b.mat === 'emissive' ? B.emissive.lerp[b.id] : b.c === 'g255' ? 193 : 96.9)
    : (b.mat === 'overlay' ? B.overlay.after[b.id] : b.mat === 'emissive' ? B.emissive.lerp[b.id] : b.c === 'g255' ? 193 : 96.9)),
  depthMax: 60, front: 'green', r45gone: true, inv: false, comp: pr.comp.cancels.unitsPerScreenH, gui: (g) => g.A, control: 1.001, board100: true });
  ok(get(good, 'R3.11').result === '出せる: emissive・fade と色の倍率' && /emissive: lerp/.test(get(good, 'R3.11').detail) && /overlay 0\.24: after/.test(get(good, 'R3.11').detail)
    && get(good, 'R4.10').result === '描かれた z: -60 -30 0 30 60・小さい z が手前（pack.js の通り）' && /board0@-100 73 board0@100 73 board50@-100 描かれない/.test(get(good, 'R4.10').detail)
    && get(good, 'R3.12').result === '描かれない面: ry-45' && get(good, 'R3.9').result === '描かれない' && get(good, 'R3.8').result.startsWith('赤くならなかった（3 回とも')
    && get(good, 'R4.9').result.startsWith('打ち消せる') && /q\.model_scale は 0\.500/.test(get(good, 'R4.9').detail) && /nightvision: 出る色 = 0\.7570 x/.test(get(good, 'R3.7').detail) && /z 50 の板 描かれない/.test(get(good, 'R3.7').detail)
    && get(good, 'R5.3').result === 'A' && get(good, '対照').result === '同じ' && /黒い板 0/.test(get(good, '対照').detail),
  'verdict: one run reads as emissive and colour above 1 reaching white, the overlay after the light (R3.11), depth ±60 with the smaller z in front and the board at 50 not drawn (R4.10), right45 gone (R3.12), invisible (R3.9), no red (R3.8), cancelled (R4.9), 0.757 (R3.7), rule A, the control the same',
  JSON.stringify(good.map((x) => [x.rule, x.result])));
  const bad = mk({ bright: (k, b) => (b.c === 'g255' || b.c === 'w_a128' || b.c === 'w_a8' ? 193 : 96.9), depthMax: 150, front: 'red', r45gone: false, inv: true, red: true,
    comp: pr.comp.notCancelled.unitsPerScreenH, gui: (g) => g.B, control: 1.05, board100: false });
  ok(get(bad, 'R3.11').result === '出せる道は無かった' && /emissive: none/.test(get(bad, 'R3.11').detail) && /overlay 0\.24: none/.test(get(bad, 'R3.11').detail) && get(bad, 'R4.10').result === '描かれた z: -150 -100 -60 -30 0 30 60 100 150・大きい z が手前（pack.js と逆）'
    && get(bad, 'R3.12').result === '全部描かれた' && get(bad, 'R3.9').result === '描かれる' && get(bad, 'R3.8').result === '赤くなった（ov255）' && get(bad, 'R4.9').result.startsWith('打ち消せない')
    && get(bad, 'R5.3').result === 'B' && get(bad, '対照').result === '違う' && /黒い板 描かれない/.test(get(bad, '対照').detail),
  'and the other way: no route to white, every depth drawn with the larger z in front, every tilt drawn, drawn while invisible, red with USE_OVERLAY, not cancelled, rule B, the control off',
  JSON.stringify(bad.map((x) => [x.rule, x.result])));
  ok(R.verdict([]).every((x) => /測れなかった|値/.test(x.result)), 'with nothing measured every rule says so (never a guess)');
  ok(R.look({ r: 193, g: 193, b: 193, spread: 0, br: 150, bg: 185, bb: 225 }).kind === 'drawn' && R.look({ r: 29.7, g: 46.1, b: 97.1, spread: 20.1, br: 39.8, bg: 48.1, bb: 122.3 }).kind === 'world'
    && R.look({ r: 8, g: 13.5, b: 45.2, spread: 6.4, br: 7.5, bg: 13.5, bb: 43.4 }).kind === 'world' && R.look({ r: 0, g: 0, b: 0, spread: 0, br: 0.5, bg: 0.5, bb: 0.5 }).kind === 'world',
    'a box is a drawn plane only when flat (spread ≤ 2.5) and unlike the world there: run 40055307539\'s right45 (noon and midnight) reads as the world');
}

// ---- api
{
  for (const name of ['geoui_device', 'geoui_html_demo', 'geoui_rules']) {
    const dir = path.join(TOP, 'bds/addons', name), man = JSON.parse(fs.readFileSync(path.join(dir, 'bp/manifest.json'), 'utf8'));
    const dep = man.dependencies.find((d) => d.module_name === '@minecraft/server'), main = fs.readFileSync(path.join(dir, 'bp/scripts/main.js'), 'utf8');
    const need = P.apiNeeds(main), v = (s) => s.split('.').map(Number).reduce((a, x) => a * 1000 + x, 0);
    ok(v(dep.version) >= v(need.need), `${name} asks for @minecraft/server ${dep.version}: its script uses up to ${need.need} (${need.uses.join(' ') || 'nothing newer'})`);
  }
  ok(P.build(Object.assign(R.scene(), { serverVersion: '2.1.0', script: 'world.afterEvents.playerSwingStart.subscribe(() => {});' }), { core: G }).warnings.some((w) => /2\.5\.0/.test(w)), 'asking for 2.1.0 with playerSwingStart (2.5.0) is warned of');
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} geoui-rules-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
