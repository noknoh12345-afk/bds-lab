#!/usr/bin/env node
// GeoUI's rules (bds/geoui/RULES.md) and the probe that decides the open ones (bds/geoui/screen/rules.mjs → bds/addons/geoui_rules),
// no network, no game:
//   pack       the probe is what rules.mjs makes; it builds with no warning; its Molang parses and reads nothing unset; the player's
//              scale in the UI follows grl:sc (divided by q.model_scale with grl:comp 1, by the server's grl:body with 2) and nowhere
//              else (the paper doll, the world: 0.9375); minecraft:scale by an event; the experiment's own materials (USE_OVERLAY,
//              USE_EMISSIVE) on their bones only, never in place of a proved one; the texture's alpha where the emissive test needs it;
//              planes at the depths asked; the third run's: a bone per depth at the bottom right (one shown at a time), the colours on
//              a fade bone of their own, the small tilts, the body hidden from the frozen camera
//   history    run 40055307539 (bds/geoui/rules-history/run-40055307539/): its predictions as they were committed before it, and its
//              public summary read back to what RULES.md records — the unit scale / 16, the origin 24 model units, the body's scale
//              followed, the poses still, the light 0.757, right45 not drawn, invisibility not drawn; run 40061560812 (the second) the
//              same way — white held at 236, every depth drawn with the smaller z in front, a tilt's light by its sign, the bottom right
//              hiding every plane there (R4.11), invisible, no red, not cancelled, the GUI scale neither A nor B (16 screens); run
//              40881294595 (the third): the arm hiding by depth and gone under the frozen camera, colours held at 236 channel by channel
//              (the overlay at 1 too), a tilt's light turning with the angle and spent by 15°, the server's body scale cancelling, C to
//              1080p (4K at 5), the control the same on Minecraft 1.26.60
//              The second run's predictions as committed: they parted the GUI scale's two rules and the emissive, colour, overlay and
//              depth alternatives.
//   predict    the third run's predictions: the bottom right by depth or by order, the arm or not under the frozen camera; colours
//              held at 236 per channel or as a whole (orange tells); the overlay at 1 255 or 236; small tilts by sign or by angle; the
//              server's body scale cancelling; rule C's values on 12 screens that pin its W0, H0 and cap
//   frame      Studio's frame in px: the screen's middle is the model's (0, centreOf(scale)) — what run 40055307539 measured at every
//              clean scale; every box `measure color` reads is on the 1560 x 720 screen and off the hotbar; every measure fits the public
//              summary (run 40055307539 lost half of its to a cap of 40); a `shot world` of the same size before every colour measure
//   verdict    a run that agrees, and one that does not, read back the right way (the second run's shape and the third's)
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
  ok(rcMats['*'] === 'material.grl_cutout' && rcMats.grl_b_fade === 'material.grl_fade' && rcMats.grl_b_ovl === 'material.grl_overlay' && rcMats.grl_b_emis === 'material.grl_emissive'
    && rcMats.grl_c_fade === 'material.grl_fade' && Object.keys(rcMats).length === 5 && ent.materials.grl_overlay === 'grl_overlay' && ent.materials.grl_emissive === 'grl_emissive',
    'each material on its own bone only (the controller: cutout for every other bone; the third run\'s colours on a fade bone of their own)');
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
  // the third run's parts
  ok(scaleOf({ 'grl:sc': 9375, 'grl:comp': 2, 'grl:body': 5000 }, { ms: 1 }) === 1.875 && scaleOf({ 'grl:sc': 9375, 'grl:comp': 2, 'grl:body': 10000 }, { ms: 0.5 }) === 0.9375
    && scaleOf({ 'grl:sc': 9375, 'grl:comp': 2, 'grl:body': 5000 }, { doll: 1 }) === 0.9375 && scaleOf({ 'grl:sc': 9375, 'grl:comp': 2, 'grl:body': 5000 }, { ui: 0 }) === 0.9375,
    'with grl:comp 2 it is divided by grl:body / 10000 (the server\'s reading of minecraft:scale) in the UI only, whatever q.model_scale says');
  const anim = JSON.parse(f['rp/animations/grl.animation.json']).animations['animation.grl.ui'].bones;
  const shownZ = (zsel) => { const e = G.envOf({ props: { 'grl:zsel': zsel, 'grl:show': R.BITS.arm } }); G.runPre(ours, e); return R.ARM_Z.map((z, k) => G.molang(anim[`grl_arm_z${k}`].scale, e) * G.molang(anim.grl_arm.scale, e)); };
  ok(R.ARM_Z.every((z, k) => { const b = bone(`grl_arm_z${k}`); return b && b.parent === 'grl_arm' && b.cubes.length === R.ARM_PLACES.length && b.cubes.every((c) => Math.abs(c.origin[2] - z) < 0.1); })
    && R.ARM_Z.every((z, k) => JSON.stringify(shownZ(k)) === JSON.stringify(R.ARM_Z.map((x, j) => (j === k ? 1 : 0)))),
    'the bottom right: a bone per depth (z −150 … 150), its squares at the five places; grl:zsel shows one depth at a time', JSON.stringify(shownZ(3)));
  const pIdx = (n) => R.PROBES.arm.find((x) => x.id === n).box.join(' ');
  ok(pIdx('p3') === R.PROBES.depth.find((d) => d.id === 'ground60').box.join(' ') && pIdx('p4') === R.PROBES.depth.find((d) => d.id === 'ground100').box.join(' ')
    && R.ARM_PLACES.find((x) => x.id === 'p1').x === R.TILT.find((t) => t.id === 'ry-45').x && R.ARM_PLACES.find((x) => x.id === 'p2').x === R.TILT.find((t) => t.id === 'flatb').x,
    'its places are the second run\'s: p3 where z 60 was drawn, p4 where z 100 was hidden (the same boxes), p1 right45\'s place, p2 the flat plane beside it');
  const fadeBone = bone('grl_c_fade'), texel = (c) => { const i = PAL_INDEX(c); return [...png.data.slice(i * 4, i * 4 + 4)]; };
  const PAL_INDEX = (c) => Math.round(fadeBone.cubes[R.COLOURS.findIndex((x) => x.c === c)].uv.north.uv[0] - 0.25);
  ok(fadeBone && fadeBone.parent === 'grl_colours' && fadeBone.cubes.length === R.COLOURS.length && JSON.stringify(texel('orange')) === '[255,128,0,255]' && JSON.stringify(texel('red')) === '[255,0,0,255]' && JSON.stringify(texel('g192')) === '[192,192,192,255]',
    'the colours: one fade bone, each patch on its own texel (orange 255,128,0 among them)', JSON.stringify(R.COLOURS.map((c) => [c.c, texel(c.c)])));
  ok(R.FINE.every((t) => { const b = bone(`grl_fine_${t.id.replace('-', 'm')}`); return b && b.parent === 'grl_fine' && JSON.stringify(b.rotation) === JSON.stringify(t.rot) && b.pivot[0] === t.x && b.pivot[1] === t.y; }),
    'the small tilts turn about their own middles too (1°, 5°, 45°, 60°)');
  const third = ent.render_controllers.map((rc0) => Object.entries(rc0)[0]).filter(([k]) => /third_person/.test(k));
  ok(third.length > 0 && third.every(([, v]) => v.includes('!(q.is_local_player && !q.is_in_ui && (v.grl_hide > 0))')) && JSON.parse(f['bp/entities/player.json'])['minecraft:entity'].description.properties['grl:show'].range[1] === 1023,
    'the frozen camera (grl:cam 1 → grl:hide 1) hides the player\'s own body from it, as GeoUI Screen does; grl:show takes the third run\'s bits (to 1023)');
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

// ---- history: run 40061560812 (the second run, its predictions and app.txt as committed before it — never rewritten after)
{
  const H2 = path.join(TOP, 'bds/geoui/rules-history/run-40061560812');
  const pr2 = JSON.parse(fs.readFileSync(path.join(H2, 'predictions.json'), 'utf8'));
  const sum2 = JSON.parse(fs.readFileSync(path.join(H2, 'summary.json'), 'utf8')), app2 = fs.readFileSync(path.join(H2, 'app.txt'), 'utf8');
  ok(pr2.version === 2 && sum2.measures.length === 114 && sum2.measures.every((m) => m.ok) && JSON.stringify(sum2.failed_lines) === '[330]' && sum2.failed_codes[0] === 'measure-size-mismatch'
    && /^measure color cal-s0_9375 /.test(app2.split('\n')[329]) && /^size 2560x1440$/m.test(app2) && app2.lastIndexOf('shot world') < app2.indexOf('section control'),
    'its public summary: every measure but the last two — line 330 measured the black board against the `shot world` of the 2560 x 1440 screen, and the control stopped there');
  const rows = R.verdict(sum2, pr2, app2), d = (id) => get(rows, id).detail;
  ok(get(rows, 'R3.11').result === '出せる道は無かった' && /lerp（アルファ 8 の白 → 234）/.test(d('R3.11')) && /白 236（cutout の灰 128 は 98）/.test(d('R3.11')) && /overlay 0\.24: after（灰 128 → 134）/.test(d('R3.11'))
    && /em255 194 em255h 215 em255z 234 em128z 描かれない/.test(d('R3.11')),
    'R3.11: white never reached 255 — the colour 1.32 on fade 236, emissive alpha 8 234 (alpha 128 215), the overlay after the light; alpha 8 grey 128 unseen (the bottom right)', d('R3.11'));
  const fd128 = sum2.measures.find((m) => m.shot === 'bright-gain' && m.values.rx0 === 1001 && m.values.ry0 === 202).values;
  ok(Math.abs((fd128.r + fd128.g + fd128.b) / 3 - 128) < 3, `fade with the colour 1.32 shows grey 128 as it is (${((fd128.r + fd128.g + fd128.b) / 3).toFixed(1)}): only white is held back, at 236`);
  ok(get(rows, 'R4.10').result === '描かれた z: -150 -100 -60 -30 0 30 60 100 150・小さい z が手前（pack.js の通り）' && /空の前: -150 194 -100 194 -60 194 -30 194 0 194 30 194 60 194 100 194 150 194 \//.test(d('R4.10'))
    && /重なり rgb\(2,194,3\)/.test(d('R4.10')) && /board0@-100 75 board0@100 描かれない board50@-100 75 board50@100 75/.test(d('R4.10')),
    'R4.10: every square from z −150 to 150 drawn over the sky, the smaller z in front (green), the long boards at z 0 and 50 to both ends (but where the bottom right hides them)', d('R4.10'));
  ok(/nightvision: 出る色 = 0\.7530 x 入れた色 \+ 2\.0（z 50 の板 74）/.test(d('R3.7')) && /box: 出る色 = 0\.7531 x 入れた色 \+ 2\.4（z 50 の板 75）/.test(d('R3.7')),
    'R3.7: the same light with night vision at midnight and in a closed box (0.753) as at noon and midnight (0.754, 0.757): the UI\'s own', d('R3.7'));
  const tilt = Object.fromEntries([...d('R3.12').matchAll(/(\S+) (\d+|描かれない)(?= |$)/g)].map((m) => [m[1], m[2] === '描かれない' ? null : Number(m[2])]));
  ok(['ry-45b', 'ry-60', 'ry-30', 'ry-15', 'ry15', 'ry30', 'ry45'].every((k) => tilt[k] >= 147 && tilt[k] <= 150) && ['rx-60', 'rx-45', 'rx-30', 'rx-15'].every((k) => tilt[k] >= 105 && tilt[k] <= 109)
    && tilt.rx15 === 235 && tilt.rx30 === 235 && tilt.flat === 194 && tilt.flatc === 194 && get(rows, 'R3.12').result === '描かれない面: ry60 ry-45 flatb rx45 rx60',
    'R3.12: a tilt\'s light is its sign\'s, not its angle\'s (about y ±15…±60° 148, about x −15…−60° 107, +15 and +30° 235); −45° about y on the far left drawn, where run 40055307539 lost it not (nor the flat plane beside it)', JSON.stringify(tilt));
  ok(get(rows, 'R3.9').result === '描かれない' && get(rows, 'R3.8').result.startsWith('赤くならなかった（3 回とも') && get(rows, 'R4.9').result.startsWith('打ち消せない') && /q\.model_scale は 0\.999/.test(d('R4.9'))
    && get(rows, 'R5.3').result === 'どちらでもない' && get(rows, '対照').result === '同じ' && /黒い板 —/.test(d('対照')),
    'R3.9 not drawn while invisible; R3.8 no red, three times; R4.9 not cancelled (q.model_scale 1 in the UI); R5.3 neither A nor B; the control the same as run 40055307539 (the black board unmeasured)', JSON.stringify(rows.map((x) => [x.rule, x.result])));
  // the bottom right (R4.11): every grey plane measured at x ≥ 1139 and y ≥ 339 px hidden, every other drawn; the world there flat blue and
  // lavender, darker at midnight (run 40055307539, the same place); invisibility changed the screen there only
  const coloured = new Set(R.PROBES.depth.filter((p) => ['overlap', 'redOnly', 'greenOnly'].includes(p.id)).map((p) => p.box.join(' ')));
  const seen = sum2.measures.filter((m) => m.kind === 'color' && m.shot !== 'ramp-invisible').map((m) => { const v = m.values; return { v, kind: R.look(v, { grey: !coloured.has([v.rx0, v.ry0, v.rx1, v.ry1].join(' ')) && !/hurt/.test(m.shot) }).kind }; });
  const corner = (v) => v.rx0 >= 1139 && v.ry0 >= 339, hidden = seen.filter((x) => x.kind !== 'drawn');
  const places = new Set(hidden.map((x) => `${x.v.rx0} ${x.v.ry0}`));
  ok(hidden.length === 11 && places.size === 9 && hidden.every((x) => corner(x.v)) && seen.filter((x) => corner(x.v)).every((x) => x.kind !== 'drawn') && seen.filter((x) => !corner(x.v)).length > 80,
    `the bottom right: the grey planes measured at x ≥ 1139 and y ≥ 339 px all hidden (${places.size} places, ${hidden.length} measures), the ${seen.filter((x) => !corner(x.v)).length} others all drawn`);
  const w = (m) => m.values, r45 = (s) => w(s.measures.find((m) => m.shot === 'tilt-noon' && m.values.rx0 === 1266 && m.values.ry0 === 339) || s.measures.find((m) => m.shot === 'tilt-noon' && m.values.rx0 === 1266 && m.values.ry0 === 340));
  const mid1 = sum1Of().measures.find((m) => m.shot === 'tilt-midnight' && m.values.rx0 === 1266).values, inv = sum2.measures.find((m) => m.shot === 'ramp-invisible' && m.kind === 'diff').values;
  ok(r45(sum2).bb > r45(sum2).br + 50 && r45(sum1Of()).bb > r45(sum1Of()).br + 50 && mid1.bb < r45(sum1Of()).bb / 2 && inv.x0 >= 500 && inv.y0 >= 400 && inv.b1x0 >= 1300 && inv.b2x0 >= 1000 && inv.share < 0.05,
    'what is there without GeoUI: blue in both runs, darker at midnight (the world\'s light on it); under invisibility only the bottom right changed (4.25 %) — the first-person arm, as far as the numbers go');
  // R5.3: the 16 screens measured — A and B each miss some; min(4, ⌊W / W0⌋, ⌊H / H0⌋) holds for 320 < W0 ≤ 341.3 and 180 < H0 ≤ 239.75 only
  const gui = [[1024, 768, 3], [1104, 920, 3], [1280, 800, 3], [1560, 720, 3], [1920, 1080, 4], [2160, 1080, 4], [2340, 1080, 4], [2400, 1080, 4], [2520, 1080, 4], [3840, 1080, 4],
    ...sum2.measures.filter((m) => m.kind === 'marks' && /^gui-/.test(m.shot)).map((m) => [m.values.width, m.values.height, Math.round((m.values.violetx1 - m.values.violetx0) / 182)])];
  const C = (w0, h0) => gui.every(([W, Hh, u]) => Math.min(4, Math.floor(W / w0), Math.floor(Hh / h0)) === u);
  ok(gui.length === 16 && JSON.stringify(gui.slice(10)) === '[[1100,1000,3],[960,540,2],[1279,960,3],[1280,960,3],[1920,959,4],[2560,1440,4]]'
    && !gui.every(([W, Hh, u]) => R.guiRuleA(W, Hh) === u) && !gui.every(([W, Hh, u]) => R.guiRuleB(W, Hh) === u)
    && C(320.5, 239.75) && C(341.3, 180.5) && C(330, 230) && !C(320, 230) && !C(342, 230) && !C(330, 240) && !C(330, 180) && !gui.every(([W, Hh, u]) => Math.min(Math.floor(W / 330), Math.floor(Hh / 230)) === u),
    'R5.3: the 16 screens — neither A nor B; min(4, ⌊W / W0⌋, ⌊H / H0⌋) fits them for 320 < W0 ≤ 341.3, 180 < H0 ≤ 239.75 (and only with the cap of 4: 2560 x 1440 is 4)', JSON.stringify(gui));
}
function sum1Of() { return JSON.parse(fs.readFileSync(path.join(HIST, 'summary.json'), 'utf8')); }

// ---- history: run 40881294595 (the third run, its predictions and app.txt as committed before it — never rewritten after)
{
  const H3 = path.join(TOP, 'bds/geoui/rules-history/run-40881294595');
  const pr3 = JSON.parse(fs.readFileSync(path.join(H3, 'predictions.json'), 'utf8'));
  const sum3 = JSON.parse(fs.readFileSync(path.join(H3, 'summary.json'), 'utf8')), app3 = fs.readFileSync(path.join(H3, 'app.txt'), 'utf8');
  ok(pr3.version === 3 && sum3.ok === true && sum3.steps === 344 && sum3.failed_lines.length === 0 && sum3.measures.length === 93 && sum3.measures.every((m) => m.ok)
    && (app3.match(/^measure /gm) || []).length === 93 && sum3.app === '1.26.60.4' && sum3.bds === '1.26.60.6',
    'its public summary: every step and all 93 measures (Minecraft 1.26.60.4 against BDS 1.26.60.6)');
  const rows = R.verdict(sum3, pr3, app3), d = (id) => get(rows, id).detail, byClaim = (re) => rows.find((x) => re.test(x.claim)) || { result: '', detail: '' };
  ok(get(rows, 'R4.11').result === '奥行き（小さい z から描かれ、ある z から先が隠れる）・止めたカメラでは右下も全部描かれた（4 か所）'
    && /p0: -150 194 -100 194 -50 194 0 194 50 194 100 194 150 194 \| 止めたカメラ 194/.test(d('R4.11')) && /p3: -150 194 -100 194 -50 194 0 194 50 194 100 描かれない 150 描かれない \| 止めたカメラ 194/.test(d('R4.11'))
    && ['p1', 'p2', 'p4'].every((id) => new RegExp(`${id}: -150 描かれない -100 描かれない -50 描かれない 0 描かれない 50 描かれない 100 描かれない 150 描かれない \\| 止めたカメラ 194`).test(d('R4.11'))),
    'R4.11: the first-person arm hides by depth — where it is far (p3) z −150 … 50 drawn, 100 and 150 hidden; where it is near (p1, p2, p4) even z −150; the sky every z; the frozen camera none', d('R4.11'));
  const worlds = [...d('R4.11').matchAll(/(p\d) rgb\((\d+),(\d+),(\d+)\) → rgb\((\d+),(\d+),(\d+)\)/g)].map((m) => ({ id: m[1], fp: m.slice(2, 5).map(Number), free: m.slice(5, 8).map(Number) }));
  ok(worlds.length === 4 && worlds.every((w) => (w.fp[2] > w.fp[0] + 15 && w.fp[0] < 60) || (w.fp[0] > w.fp[1] && w.fp[2] > w.fp[0])) && worlds.every((w) => (w.free[1] > w.free[0] && w.free[1] > w.free[2] - 50)),
    'what was there in first person was the arm\'s blue and lavender at the four places; under the frozen camera the sky and the grass', JSON.stringify(worlds));
  ok(byClaim(/^fade と色の倍率/).result === '入れた色のまま（チャンネルごとに 236 で止まる: 予測との差 1.0 以内）' && /橙の緑で見る止まり方: チャンネルごと/.test(byClaim(/^fade と色の倍率/).detail)
    && /色 1\.32: g255 \(236,236,236\) g192 \(193,193,194\) g128 \(130,130,130\)/.test(byClaim(/^fade と色の倍率/).detail) && /orange \(236,195,3\)/.test(byClaim(/^fade と色の倍率/).detail)
    && byClaim(/重ねる色を 1/).result === '236（止まる）',
    'R3.11: colours on fade at 1.32 and 2 come out channel by channel as predicted (within 1.0), held at 236 each; the white overlay at 1 is 236 too', byClaim(/^fade と色の倍率/).detail);
  ok(get(rows, 'R3.12').result === 'どちらでもない' && d('R3.12') === 'ry1 188 ry5 156 rx-1 167 rx1 216 rx5 233 rx45 235 rx60 235 flatf 194',
    'R3.12: neither by sign alone nor flat at 1° — 1° about y 188, 5° 156; about x −1° 167, +1° 216, +5° 233: it turns with the angle and is spent by 15°', d('R3.12'));
  ok(get(rows, 'R4.9').result === '打ち消せる' && /高さ 171\.29・中心 135\.00/.test(d('R4.9')) && get(rows, '対照').result === '同じ' && /cal-s1: 高さ 160\.000・中心 128\.000/.test(d('対照')) && /黒い板 2$/.test(d('対照')),
    'R4.9: divided by the scale the server read, the body\'s half size cancels (171.29 as at the vanilla scale); the control the same on 1.26.60 (scale 1: 160.000, 128.000), the black board drawn');
  const g3 = sum3.measures.filter((m) => m.kind === 'marks').map((m) => [m.values.width, m.values.height, Math.round((m.values.violetx1 - m.values.violetx0) / 182)]);
  const all = [...R.GUI_MEASURED, ...g3], no4k = all.filter(([W, H]) => !(W === 3840 && H === 2160)), fit = R.guiRuleCFit(no4k);
  ok(get(rows, 'R5.3').result === 'C ではない（C の取れる値の外）' && /3840x2160: 5\.00/.test(d('R5.3')) && g3.filter(([, , u]) => u === 4).length === 3
    && fit && fit.W0[0] > 340 && fit.W0[1] <= 1024 / 3 && fit.H0[0] > 210 && fit.H0[1] <= 220 && [4, 5, 6, 99].every((cap) => R.guiRuleCFit(all, { ...R.C_BOUNDS, cap }) === null),
    `R5.3: the 27 screens to 1080p hold C with W0 ${fit && fit.W0.join('…')} and H0 ${fit && fit.H0.join('…')}; 3840 x 2160 is 5 — no cap holds 2560 x 1440 at 4 and 4K at 5`, JSON.stringify(g3));
}

// ---- the second run's predictions, as committed before it (bds/geoui/rules-history/run-40061560812/): what they could tell apart
const PR2 = JSON.parse(fs.readFileSync(path.join(TOP, 'bds/geoui/rules-history/run-40061560812/predictions.json'), 'utf8'));
const APP2 = fs.readFileSync(path.join(TOP, 'bds/geoui/rules-history/run-40061560812/app.txt'), 'utf8');
{
  const pr = PR2;
  const measured = [[1024, 768, 3], [1104, 920, 3], [1280, 800, 3], [1560, 720, 3], [1920, 1080, 4], [2160, 1080, 4], [2340, 1080, 4], [2400, 1080, 4], [2520, 1080, 4], [3840, 1080, 4]];
  ok(measured.every(([W, H, u]) => R.guiRuleA(W, H) === u && R.guiRuleB(W, H) === u), 'both GUI scale rules agree with the 10 screens measured (run 39989463030)');
  ok(pr.gui.filter((g) => g.A !== g.B).length >= 2 && pr.gui.some((g) => g.W === 1280 && g.A === 4) && pr.gui.some((g) => g.W === 1279 && g.A === 3), 'the second run\'s 6 screens parted the two rules and stood on each one\'s edges');
  const e = pr.bright.emissive, gap = (a, b) => Math.min(...Object.keys(a).map((k) => Math.abs(a[k] - b[k])).filter((x) => x > 0));
  ok(e.lerp.em255z > 250 && e.lerp.em255h > 220 && Math.abs(e.lerp.em255 - 193.035) < 0.01 && Math.abs(e.none.em255z - e.lerp.em255z) > 50 && e.full.em255 === 255,
    'emissive: lerp (the light by the alpha), full and none were 30+ grey levels apart where the run looked (alpha 8 white: 253 vs 193)');
  const o = pr.bright.overlay;
  ok(Math.abs(o.after.ov128 - o.before.ov128) > 10 && Math.abs(o.before.ov128 - o.none.ov128) > 20 && Math.abs(pr.bright.colour.unclamped.fd255 - pr.bright.colour.clamped.fd255) > 50 && gap(o.after, o.before) > 10,
    'overlay after the light, before it, or not at all, and the colour above 1 or clamped, were told apart by grey 128 and white');
  ok(pr.bright.gain === 1.32 && pr.bright.ov === 0.24 && APP2.includes('do scriptevent grl:gain 1.32\n') && APP2.includes('do scriptevent grl:ov 0.24\n'),
    'the colour 1.32 (= 1 / 0.757) and the overlay 0.24 the predictions were for are the ones its app.txt set');
  ok(pr.depth.zs.includes(-150) && pr.depth.zs.includes(150) && pr.depth.zs.includes(60) && pr.depth.overlap.ifPlusZFar === 'green' && Math.abs(pr.comp.cancels.unitsPerScreenH * 2 - pr.comp.notCancelled.unitsPerScreenH) < 1e-3,
    'depth ran past the ±60 measured, the overlap named which colour meant which, R4.9\'s two outcomes were a factor 2 apart');
  ok(pr.tilt.planes.filter((p) => p.v1 !== undefined).length === 5 && pr.tilt.planes.find((p) => p.id === 'ry-45').v1 === null, 'the tilts carried run 40055307539\'s five values (right45: not drawn)');
  // (its app.txt, as it ran)
  const count = (re) => (APP2.match(re) || []).length, P2 = R.PROBES;
  ok(count(/^measure color /gm) === 3 * P2.bright.length + P2.depth.length + P2.tilt.length + P2.invisible.length + 3 * P2.hurt.length + 2 * P2.ramp.length + P2.calBoard.length
    && count(/^measure geoui /gm) === 1 + R.CONTROL_SCALES.length && count(/^measure marks /gm) === R.GUI_SIZES.length && count(/^measure diff /gm) === 2,
    'its app.txt measured the bright set 3 times, depth, the tilts, invisible, 3 hurts, the ramp in 2 lights, the black board; the grid 3 times; 6 GUI frames — with the boxes PROBES still has');
  const sections = [...APP2.matchAll(/^section (\S+)/gm)].map((m) => m[1]);
  ok(sections.indexOf('brighten') < sections.indexOf('gui') && sections.indexOf('depth') < sections.indexOf('gui') && sections.indexOf('tilt') < sections.indexOf('gui') && sections[sections.length - 1] === 'end',
    'it ran the new questions first (a run that stops early keeps them); the GUI screens and the control last');
  ok(/fill -2 -60 -2 2 -56 2 air\ndo fill -2 -61 -2 2 -61 2 grass_block/.test(APP2) && /fill -2 -60 -2 2 -56 2 air\nfill -2 -61 -2 2 -61 2 grass_block/.test(fs.readFileSync(path.join(TOP, 'bds/addons/geoui_rules/tests.txt'), 'utf8')),
    'its closed box was taken down above the floor first (no hole under the player) — the same commands tests.txt runs on the real BDS');
}

// ---- predict: the third run's
const pr = R.predictions();
{
  ok(pr.version === 3 && pr.earlier.length === 2 && pr.earlier.every((d) => fs.existsSync(path.join(TOP, d, 'predictions.json')) && fs.existsSync(path.join(TOP, d, 'app.txt')) && fs.existsSync(path.join(TOP, d, 'summary.json'))),
    'version 3; the runs before it (their predictions, steps and public summaries) are in rules-history');
  const a = pr.arm;
  ok(a.zs.length === 7 && a.zs[0] === -150 && a.zs[6] === 150 && a.zs.includes(0) && a.shots.length === 7 && a.places.length === 5 && a.sky === 'p0' && /p3: z\* at least 50/.test(a.ifDepth) && /hidden at every z/.test(a.ifOrder) && a.free.z === 0,
    'R4.11: seven depths at five places (one in the sky), by depth (a z* per place) or by order (all hidden), then the frozen camera at z 0');
  const c = pr.colours, pc = c.perChannel, hk = c.hueKept;
  ok(Object.values(pc).every((g) => Object.values(g).every((rgb) => rgb.every((v) => v >= 2 && v <= c.cap))) && pc['1.32'].c_g128[0] > 128 && pc['1.32'].c_g128[0] < 131 && pc['1.32'].c_g255[0] === 236
    && pc['2'].c_g128[0] > 190 && pc['2'].c_g192[0] === 236 && Math.abs(pc['1.32'].c_orange[1] - hk['1.32'].c_orange[1]) > 8 && Math.abs(pc['2'].c_orange[1] - hk['2'].c_orange[1]) > 60,
    'R3.11: each channel 0.757 x the colour x its value + 2 held at 236 — grey 128 as it is at 1.32, 196 at 2; orange\'s green tells per channel from a whole-colour hold (10 apart at 1.32, 77 at 2)', JSON.stringify([pc['1.32'].c_orange, hk['1.32'].c_orange, pc['2'].c_orange, hk['2'].c_orange]));
  ok(pr.ov1.ifFree.ov255 - pr.ov1.ifHeld.ov255 === 19 && pr.ov1.ov === 1 && pr.fine.bySign.ry1 === 148 && pr.fine.bySign['rx-1'] === 107 && pr.fine.bySign.rx1 === 235 && pr.fine.bySign.flatf === 194,
    'the overlay at 1: 255 or 236 (19 apart); small tilts by sign (148, 107, 235) or by angle (194 at 1°)');
  ok(Math.abs(pr.body.cancels.unitsPerScreenH * 2 - pr.body.notCancelled.unitsPerScreenH) < 1e-3, 'R4.9 by the server\'s scale: cancelled or not, a factor 2 apart');
  const fit16 = R.guiRuleCFit(R.GUI_MEASURED);
  ok(R.GUI_MEASURED.length === 16 && fit16 && fit16.W0[0] > 320 && fit16.W0[1] <= 1024 / 3 && fit16.H0[0] > 180 && fit16.H0[1] <= 959 / 4 + 1e-9
    && R.GUI_MEASURED.every(([W, H, u]) => { const [lo, hi] = R.guiRuleCRange(W, H); return lo <= u && u <= hi; }),
    `R5.3: rule C holds on the 16 screens measured for W0 ${fit16 && fit16.W0.join('…')}, H0 ${fit16 && fit16.H0.join('…')} (the bounds it is predicted with)`);
  const g3 = pr.gui3;
  ok(g3.length === 12 && g3.slice(0, 11).every((g) => g.C[0] === 3 && g.C[1] === 4) && JSON.stringify(g3[11].C) === '[4,4]' && g3.slice(0, 5).every((g) => g.H === 960) && g3.slice(5, 11).every((g) => g.W === 1920),
    'the 12 screens: each of the first 11 is 3 or 4 by where W0 (at 960 high) or H0 (at 1920 wide) is — it pins them; 3840 x 2160 is 4 by the cap alone', JSON.stringify(g3.map((g) => [g.W, g.H, g.C])));
  // (a made-up GUI: W0 330, H0 225 — the readings narrow the bounds round them)
  const made = [...R.GUI_MEASURED, ...R.GUI3_SIZES.map(([W, H]) => [W, H, R.guiRuleC(W, H, 330, 225)])], fitM = R.guiRuleCFit(made);
  ok(fitM && fitM.W0[0] > 325 && fitM.W0[0] <= 325.05 && fitM.W0[1] >= 329.95 && fitM.W0[1] <= 330 && fitM.H0[0] > 220 && fitM.H0[0] <= 220.05 && fitM.H0[1] >= 229.95 && fitM.H0[1] <= 230,
    'with W0 330 and H0 225 the 12 screens narrow W0 to (325, 330] and H0 to (220, 230] (on the 0.05 grid)', JSON.stringify(fitM));
}

// ---- frame
{
  const c = R.studioRect({ x: 0, y: R.centreOf(0.9375), w: 0, h: 0 }, 1560, 720);
  ok(Math.abs(c.x0 - 780) < 0.01 && Math.abs(c.y0 - 360) < 0.01 && Math.abs(R.centreOf(0.9375) - 134.9333) < 1e-3, 'Studio\'s frame: the model\'s (0, 134.93) is the middle of a 1560 x 720 screen', JSON.stringify(c));
  const box = R.studioRect(R.RAMP[4], 1560, 720);
  ok(Math.abs((box.x1 - box.x0) - 30 * 0.9375 / 16 * 72) < 1e-9, 'a 30-unit patch is 30 x K x 72 px wide (the panel\'s shorter side 10 % of 720)');
  const app = R.appTxt();
  ok(app === fs.readFileSync(path.join(TOP, 'bds/addons/geoui_rules/app.txt'), 'utf8'), 'app.txt in the add-on is what rules.mjs makes');
  const how = app.split('\n')[2], task = fs.readFileSync(path.join(TOP, 'bds/addons/geoui_rules/TASK.md'), 'utf8');
  ok([how, task].every((t) => t.includes('--screen 720x1560 --knobs "APP_SIGNIN=0 APP_LAN_JOIN_MS=420000"')),
    'the way to run it is run 40055307539\'s: the same screen and the same knobs (without them run 40059578622 made a signed-in device and stopped at the sign-in)');
  const shots = [...app.matchAll(/^shot (\S+)/gm)].map((m) => m[1]), measured = [...app.matchAll(/^measure \w+ (\S+)/gm)].map((m) => m[1]);
  ok(measured.every((s) => shots.includes(s)) && measured.every((s) => app.indexOf(`shot ${s}\n`) < app.indexOf(`measure`, app.indexOf(`shot ${s}\n`))), 'every measured shot is taken first in app.txt');
  const sizeWrong = (txt) => {
    // (color, marks and diff compare with the newest `shot world`: taken at another `size`, the app stops the run there — measure-size-mismatch)
    let size = 'reset', worldAt = null; const bad = [];
    txt.split('\n').forEach((l, i) => {
      if (/^size /.test(l)) size = l.slice(5);
      if (l === 'shot world') worldAt = size;
      if (/^measure (color|marks|diff) /.test(l) && worldAt !== size) bad.push(i + 1);
    });
    return bad;
  };
  const old2 = fs.readFileSync(path.join(TOP, 'bds/geoui/rules-history/run-40061560812/app.txt'), 'utf8');
  ok(sizeWrong(app).length === 0 && JSON.stringify(sizeWrong(old2)) === '[330]', 'every colour, marks and diff measure has a `shot world` of its own size before it (run 40061560812\'s line 330 had not)', JSON.stringify(sizeWrong(app)));
  const count = (re) => (app.match(re) || []).length, P2 = R.PROBES;
  ok(count(/^measure color /gm) === R.ARM_Z.length * P2.arm.length + P2.arm.length + 2 * P2.colours.length + P2.bright.length + P2.fine.length + P2.calBoard.length
    && count(/^measure geoui /gm) === 1 + R.CONTROL_SCALES.length && count(/^measure marks /gm) === R.GUI3_SIZES.length && count(/^measure diff /gm) === 1,
    'the third run\'s app.txt measures the bottom right at 7 depths and under the frozen camera, the colours twice, the bright set with the overlay at 1, the small tilts, the black board; the grid twice; 12 GUI frames; the frozen camera\'s change');
  const all = Object.values(P2).flat();
  ok(all.every((p) => p.box[0] >= 0 && p.box[1] >= 0 && p.box[2] <= 1560 && p.box[3] <= 720 && p.box[2] > p.box[0] && p.box[3] > p.box[1]) && all.every((p) => !(p.box[3] > 650 && p.box[2] > 500 && p.box[0] < 1060)),
    'every box measured is on the 1560 x 720 screen and clear of the hotbar (546 x 66 px at the bottom\'s middle)');
  const kept = cleanMeasures(Array.from({ length: 400 }, () => ({ kind: 'color', shot: 'x', ok: true, values: {} }))).length, total = count(/^measure /gm);
  ok(total <= kept, `every measure (${total}) fits the public summary (${kept}): none lost as run 40055307539 lost its last half`);
  const firstMeasure = app.split('\n').findIndex((l) => l.startsWith('measure ')), sections = [...app.matchAll(/^section (\S+)/gm)].map((m) => m[1]);
  ok(sections[2] === 'arm' && ['colours', 'overlay-1', 'fine', 'body'].every((x) => sections.indexOf(x) > 2 && sections.indexOf(x) < sections.indexOf('gui')) && sections.indexOf('control') > sections.indexOf('gui') && sections[sections.length - 1] === 'end' && firstMeasure > 0,
    'the bottom right first (a run that stops early keeps it), the GUI screens and the control last', JSON.stringify(sections));
  ok(/^section title\nstop\nlaunch\n/m.test(app), 'the game is stopped and started again before the join (the prepared device\'s first join from its snapshot failed often)');
  const camAt = app.indexOf('do scriptevent grl:cam 1\n'), lines = app.slice(camAt).split('\n');
  ok(camAt > app.indexOf('shot arm-z6\n') && lines[2] === 'shot arm-cam' && lines[3] === 'measure diff arm-cam' && lines[4] === 'shot world' && app.indexOf('shot arm-free\n') > camAt + 1
    && app.indexOf('do scriptevent grl:cam 0\n') > app.indexOf('measure color arm-free') && app.indexOf('do scriptevent grl:cam 0\n') < app.indexOf('section colours'),
    'the frozen camera after the seven depths: what it changed against the first-person world, then a world of its own for the squares under it, given back before the colours');
  ok(/do scriptevent grl:small 1\nwait 1000\ndo scriptevent grl:body\ndo scriptevent grl:comp 2\n/.test(app) && /do scriptevent grl:small 0\nwait 1000\ndo scriptevent grl:body\n/.test(app),
    'the body\'s scale read by the server after the event has taken (and read again after it is undone)');
}

// ---- verdict (made-up runs)
{
  const sky = { br: 150, bg: 185, bb: 225, bspread: 20 };
  const flat = (gv, extra = {}) => ({ r: gv, g: gv, b: gv, spread: 0, ...sky, ...extra });
  const world = () => ({ r: 150, g: 185, b: 225, spread: 20, ...sky });
  const col = (shot, v) => ({ shot, kind: 'color', ok: true, values: v });
  const mk = (ver) => {
    const m = [];
    const pr = PR2;
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
    return R.verdict(m, pr);
  };
  const B = PR2.bright;
  const good = mk({ bright: (k, b) => (k === 'plain' ? (b.mat === 'emissive' ? B.emissive.lerp[b.id] : b.c === 'g255' ? 193 : 96.9) : k === 'gain' ? (b.mat === 'fade' ? B.colour.unclamped[b.id] : b.mat === 'emissive' ? B.emissive.lerp[b.id] : b.c === 'g255' ? 193 : 96.9)
    : (b.mat === 'overlay' ? B.overlay.after[b.id] : b.mat === 'emissive' ? B.emissive.lerp[b.id] : b.c === 'g255' ? 193 : 96.9)),
  depthMax: 60, front: 'green', r45gone: true, inv: false, comp: PR2.comp.cancels.unitsPerScreenH, gui: (g) => g.A, control: 1.001, board100: true });
  ok(get(good, 'R3.11').result === '出せる: emissive・fade と色の倍率' && /emissive: lerp/.test(get(good, 'R3.11').detail) && /overlay 0\.24: after/.test(get(good, 'R3.11').detail)
    && get(good, 'R4.10').result === '描かれた z: -60 -30 0 30 60・小さい z が手前（pack.js の通り）' && /board0@-100 73 board0@100 73 board50@-100 描かれない/.test(get(good, 'R4.10').detail)
    && get(good, 'R3.12').result === '描かれない面: ry-45' && get(good, 'R3.9').result === '描かれない' && get(good, 'R3.8').result.startsWith('赤くならなかった（3 回とも')
    && get(good, 'R4.9').result.startsWith('打ち消せる') && /q\.model_scale は 0\.500/.test(get(good, 'R4.9').detail) && /nightvision: 出る色 = 0\.7570 x/.test(get(good, 'R3.7').detail) && /z 50 の板 描かれない/.test(get(good, 'R3.7').detail)
    && get(good, 'R5.3').result === 'A' && get(good, '対照').result === '同じ' && /黒い板 0/.test(get(good, '対照').detail),
  'verdict: one run reads as emissive and colour above 1 reaching white, the overlay after the light (R3.11), depth ±60 with the smaller z in front and the board at 50 not drawn (R4.10), right45 gone (R3.12), invisible (R3.9), no red (R3.8), cancelled (R4.9), 0.757 (R3.7), rule A, the control the same',
  JSON.stringify(good.map((x) => [x.rule, x.result])));
  const bad = mk({ bright: (k, b) => (b.c === 'g255' || b.c === 'w_a128' || b.c === 'w_a8' ? 193 : 96.9), depthMax: 150, front: 'red', r45gone: false, inv: true, red: true,
    comp: PR2.comp.notCancelled.unitsPerScreenH, gui: (g) => g.B, control: 1.05, board100: false });
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

// ---- verdict (made-up third runs)
{
  const sky = { br: 150, bg: 185, bb: 225, bspread: 20 }, arm = { br: 41, bg: 68, bb: 143, bspread: 0.5 };
  const flat = (r, g = r, b = r, base = sky) => ({ r, g, b, spread: 0, ...base });
  const armSeen = () => ({ r: 42, g: 68, b: 141, spread: 0.6, ...arm });
  const col = (shot, v) => ({ shot, kind: 'color', ok: true, values: v });
  const mk3 = (ver) => {
    const m = [];
    pr.arm.shots.forEach((shot, k) => { for (const p of R.PROBES.arm) m.push(col(shot, p.id === 'p0' ? flat(193) : ver.armDrawn(p.id, pr.arm.zs[k]) ? flat(193, 193, 193, arm) : armSeen())); });
    m.push({ shot: 'arm-cam', kind: 'diff', ok: true, values: { share: 0.042, x0: ver.camX0, y0: 416, x1: 1560, y1: 720 } });
    for (const p of R.PROBES.arm) m.push(col('arm-free', p.id === 'p0' || ver.freeDrawn ? flat(193) : armSeen()));
    for (const [g, shot] of Object.entries(pr.colours.shots)) for (const c of R.COLOURS) { const v = ver.colour(g, c.id); m.push(col(shot, flat(v[0], v[1], v[2]))); }
    for (const b of R.BRIGHT) m.push(col('bright-ov1', flat(b.mat === 'overlay' ? ver.ov1 : b.c === 'g255' ? 193 : 97)));
    for (const t of R.FINE) m.push(col('tilt-fine', flat(ver.fine(t.id))));
    m.push({ shot: 'cal-body', kind: 'geoui', ok: true, values: { unitsPerScreenH: ver.body, centreY: 135 } });
    for (const g of pr.gui3) m.push({ shot: g.shot, kind: 'marks', ok: true, values: { violetx0: 100, violetx1: 100 + 182 * ver.gui(g) } });
    for (const c of pr.control) m.push({ shot: c.shot, kind: 'geoui', ok: true, values: { unitsPerScreenH: c.unitsPerScreenH * 1.001, centreY: c.centreY } });
    m.push(col('cal-s0_9375', flat(0)));
    return R.verdict(m, pr);
  };
  const byClaim = (rows, re) => rows.find((x) => re.test(x.claim)) || { result: '', detail: '' };
  const zStar = { p1: -100, p2: -150, p3: 50, p4: 0 };
  const good = mk3({ armDrawn: (id, z) => z <= zStar[id], freeDrawn: true, camX0: 1050, colour: (g, id) => pr.colours.perChannel[g][id], ov1: 255,
    fine: (id) => pr.fine.bySign[id], body: pr.body.cancels.unitsPerScreenH, gui: (g) => R.guiRuleC(g.W, g.H, 330, 225) });
  ok(get(good, 'R4.11').result === '奥行き（小さい z から描かれ、ある z から先が隠れる）・止めたカメラでは右下も全部描かれた（4 か所）' && /p3: -150 193 -100 193 -50 193 0 193 50 193 100 描かれない 150 描かれない \| 止めたカメラ 193/.test(get(good, 'R4.11').detail)
    && /（全部右下）/.test(get(good, 'R4.11').detail) && /p1 rgb\(41,68,143\) → rgb\(150,185,225\)/.test(get(good, 'R4.11').detail)
    && byClaim(good, /^fade と色の倍率/).result.startsWith('入れた色のまま（チャンネルごとに 236 で止まる') && byClaim(good, /重ねる色を 1/).result === '255（止まらない）'
    && get(good, 'R3.12').result === '向きの符号で決まる（1° でも）' && get(good, 'R4.9').result === '打ち消せる' && /^C: W0 325\.05〜330・H0 220\.05〜230（0\.05 刻み）$/.test(get(good, 'R5.3').result) && get(good, '対照').result === '同じ',
    'verdict (third run): the bottom right by depth with the arm gone under the frozen camera; colours per channel at 236; the overlay at 1 255; tilts by sign at 1°; the server\'s scale cancelling; rule C with W0 and H0 narrowed',
    JSON.stringify(good.map((x) => [x.rule, x.result])));
  const hk = (g, id) => (id === 'c_orange' ? pr.colours.hueKept[g].c_orange : pr.colours.perChannel[g][id]);
  const bad = mk3({ armDrawn: () => false, freeDrawn: false, camX0: 300, colour: hk, ov1: 236,
    fine: (id) => ({ ry1: 194, ry5: 190, 'rx-1': 194, rx1: 194, rx5: 197, rx45: 235, rx60: 235, flatf: 194 })[id], body: pr.body.notCancelled.unitsPerScreenH, gui: (g) => (g.W === 3840 ? 6 : 3) });
  ok(get(bad, 'R4.11').result === '描く順（右下の所はどの z も隠れる）・止めたカメラでも p1 p2 p3 p4 が隠れた' && !/（全部右下）/.test(get(bad, 'R4.11').detail)
    && /色の全体で（色合いを保って）/.test(byClaim(bad, /^fade と色の倍率/).result) && byClaim(bad, /重ねる色を 1/).result === '236（止まる）'
    && get(bad, 'R3.12').result === '角度で変わる（1° は平らと同じ）' && get(bad, 'R4.9').result === '打ち消せない' && get(bad, 'R5.3').result === 'C ではない（C の取れる値の外）',
    'and the other way: by order with nothing at the bottom right drawn, the frozen camera no help; orange held as a whole colour; the overlay held at 236; tilts by angle; not cancelled; a 4K screen at 6 — not C',
    JSON.stringify(bad.map((x) => [x.rule, x.result])));
  const mixed = mk3({ armDrawn: (id, z) => (id === 'p3' ? z !== 50 : z <= zStar[id]), freeDrawn: true, camX0: 1050, colour: (g, id) => pr.colours.perChannel[g][id], ov1: 250,
    fine: (id) => pr.fine.bySign[id], body: 250, gui: (g) => R.guiRuleC(g.W, g.H, 335, 238) });
  ok(get(mixed, 'R4.11').result.startsWith('どちらでもない（奥行きの順でない）') && byClaim(mixed, /重ねる色を 1/).result === 'どちらでもない' && get(mixed, 'R4.9').result === 'どちらでもない' && /^C: W0 33\d/.test(get(mixed, 'R5.3').result),
    'a place drawn again farther than a hidden depth is neither by depth nor by order; an overlay of 250 and a scale of neither outcome say so', JSON.stringify(mixed.map((x) => [x.rule, x.result])));
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
