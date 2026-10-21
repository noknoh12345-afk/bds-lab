#!/usr/bin/env node
// GeoUI Builder (bds/geoui/geoui_builder.js, a Blockbench plugin) against GeoUI Studio v10.1's own export
// (bds/addons/geoui_studio: Studio's files as they are). The template 「スコア＆ゲージ」 is rebuilt as a Builder design and
// both packs are run through their own Molang (pre_animation → animation → render controllers) for every aspect Studio
// knows, both platforms' centre fixes, offsets and values: where each digit and the gauge are drawn, and which digit shows.
// At scale 100 the two must agree to 1e-6 of a model unit; at other scales Builder must be the scale-100 picture scaled
// about the screen centre (Studio is not: its digits keep their spacing and its gauge drifts — printed, not failed).
// Also: the generated files parse, the script compiles, the Molang the exporter writes is read back by its own parser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CAL = await import(pathToFileURL(path.join(TOP, 'bds', 'geoui', 'calib.mjs')).href);
const mod = { exports: {} };
new Function('module', fs.readFileSync(path.join(TOP, 'bds', 'geoui', 'geoui_builder.js'), 'utf8'))(mod);
const G = mod.exports;
let fails = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : '\n  ' + String(d).split('\n').slice(0, 14).join('\n  ')}`); if (!c) fails++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const qclose = (a, b, e = 1e-6) => a && b && close(a.x0, b.x0, e) && close(a.x1, b.x1, e) && close(a.y0, b.y0, e) && close(a.y1, b.y1, e);
const fmt = (q) => (q ? `[${q.x0.toFixed(4)}, ${q.y0.toFixed(4)}]-[${q.x1.toFixed(4)}, ${q.y1.toFixed(4)}]` : 'none');

// ---- Studio's export, as it is ----
const SD = path.join(TOP, 'bds', 'addons', 'geoui_studio', 'rp');
const sj = (f) => JSON.parse(fs.readFileSync(path.join(SD, f), 'utf8'));
const sEntity = sj('entity/player.entity.json')['minecraft:client_entity'].description;
const sPre = sEntity.scripts.pre_animation.filter((l) => /^v\.geoui_/.test(l));
const sAnim = sj('animations/geoui.animation.json').animations['animation.geoui_transform'];
const sRC = sj('render_controllers/geoui.render_controllers.json').render_controllers;
const sGeo = {};
for (const f of fs.readdirSync(path.join(SD, 'models', 'entity', 'geoui'))) { const g = sj(`models/entity/geoui/${f}`)['minecraft:geometry'][0]; sGeo[g.description.identifier] = g; }
ok(Object.keys(sGeo).length === 6 && sPre.length >= 9, `Studio's export read: ${Object.keys(sGeo).length} geometries, ${sPre.length} pre_animation lines of its own`, JSON.stringify(Object.keys(sGeo)));
const digitsOf = (env) => [0, 1, 2, 3, 4].map((k) => Math.round(G.molang(sRC[`controller.render.geoui_l1_d${k}`].uv_anim.offset[0], env) * 440 / 40));
function studioAt({ aspect, platform, props }) {
  const S = G.settingsOf({}), p = { 'geoui:aspect': Math.round(G.qa(aspect) * 1000), 'geoui:scale': 100, 'geoui:ox': 0, 'geoui:oy': 0, 'geoui:alpha': 100, 'geoui:v0': 0, 'geoui:v1': 0 };
  const c = S.centerFix[platform]; p['geoui:cx'] = Math.round(c.x * 10000); p['geoui:cy'] = Math.round(c.y * 10000);
  Object.assign(p, props);
  const env = G.envOf({ props: p }); G.runPre(sPre, env);
  const geos = [0, 1, 2, 3, 4].map((k) => sGeo[`geometry.geoui_l1_d${k}`]).concat([sGeo['geometry.geoui_l2']]);
  const ps = G.pose(geos, sAnim, env).quads;
  return { digits: digitsOf(env), digitQuads: [0, 1, 2, 3, 4].map((k) => ps.find((q) => q.geometry === k).quad), bar: ps.find((q) => q.geometry === 5), env };
}

// ---- the same template as a Builder design ----
const S0 = { ns: 'geoui', name: 'Score & gauge', unitsPerScreenH: 176, refAspect: 1.778 };
const S = G.settingsOf(S0), H = S.unitsPerScreenH;
const score = { w: 5 * 8.924, h: H * 0.09, padX: 1.2, padY: 1.2 }, bar = { w: H * 0.34, h: H * 0.025, padX: 1.2, padY: 4.4 };
function design(fill) {
  const bones = [{ name: 'geo_ui', pivot: [0, 140, 0], cubes: [] }];
  const sc = G.studioAnchor(S, score.w, score.h, 'top_left', score.padX, score.padY, S.refAspect);
  const sx0 = sc.x - score.w / 2, sy0 = 140 + sc.y - score.h / 2, dw = score.w / 5;
  bones.push({ name: 'score', parent: 'geo_ui', pivot: [sc.x, 140 + sc.y, -0.2], cubes: [] });
  const digits = [];
  for (let k = 0; k < 5; k++) {
    const cx = sx0 + dw * (k + 0.5);
    bones.push({ name: `score_d${k}`, parent: 'score', pivot: [cx, 140 + sc.y, -0.2], cubes: [] });
    const names = [];
    for (let j = 0; j < 10; j++) {
      bones.push({ name: `score_d${k}_n${j}`, parent: `score_d${k}`, pivot: [cx, 140 + sc.y, -0.2],
        cubes: [{ origin: [cx - dw / 2, sy0, -0.2], size: [dw, score.h, 0], faces: { north: { uv: [j * 40, 0], uv_size: [40, 71], texture: 'digits' } } }] });
      names.push(`score_d${k}_n${j}`);
    }
    digits.push(names);
  }
  const bc = G.studioAnchor(S, bar.w, bar.h, 'top_left', bar.padX, bar.padY, S.refAspect);
  const bx0 = bc.x - bar.w / 2, by0 = 140 + bc.y - bar.h / 2;
  const pivX = fill === 'left' ? bx0 : fill === 'right' ? bx0 + bar.w : bc.x;
  bones.push({ name: 'gauge', parent: 'geo_ui', pivot: [pivX, 140 + bc.y, -0.4],
    cubes: [{ origin: [bx0, by0, -0.4], size: [bar.w, bar.h, 0], faces: { north: { uv: [0, 0], uv_size: [256, 16], texture: 'bar' } } }] });
  return {
    settings: S0, bones, seed: 'test',
    textures: { digits: { name: 'l1', width: 440, height: 71, png: 'AA==' }, bar: { name: 'l2', width: 256, height: 16, png: 'AA==' } },
    elements: {
      score: { type: 'number', anchor: 'top_left', number: { source: "q.property('geoui:v0')", digits, hideLeadingZero: true } },
      gauge: { type: 'gauge', anchor: 'top_left', blend: 'blend', gauge: { source: "q.property('geoui:v1')", max: 20, fill } },
    },
  };
}
function builderAt(built, { aspect, platform, props }) {
  const L = G.layoutOf(built, { aspect, platform, props });
  const digits = [], digitQuads = [];
  for (let k = 0; k < 5; k++) {
    const shown = L.quads.filter((q) => new RegExp(`^score_d${k}_n\\d$`).test(q.bone) && !q.hidden);
    digits.push(shown.length === 1 ? +shown[0].bone.slice(-1) : shown.length === 0 ? 10 : -1);
    digitQuads.push(shown.length === 1 ? shown[0].quad : null);
  }
  return { digits, digitQuads, bar: L.quads.find((q) => q.bone === 'gauge'), L };
}

const built = G.buildPack(design('center'));
ok(!built.warnings.length, 'the template builds without warnings', built.warnings.join('\n'));
const aspects = G.DEVICES.map((d) => d.aspect).concat([1.5]);
const v0s = [0, 7, 42, 305, 12345, 99999, -305], v1s = [0, 5, 10, 20, 37], offs = [[0, 0], [123, -77], [-400, 250]];
let cases = 0, bad = [];
for (const aspect of aspects) for (const platform of ['desktop', 'mobile']) for (const [ox, oy] of offs) for (const v0 of v0s) for (const v1 of v1s) {
  const props = { 'geoui:v0': v0, 'geoui:v1': v1, 'geoui:ox': ox, 'geoui:oy': oy };
  const a = studioAt({ aspect, platform, props }), b = builderAt(built, { aspect, platform, props });
  cases++;
  const why = [];
  if (a.digits.join() !== b.digits.join()) why.push(`digits Studio ${a.digits} / Builder ${b.digits}`);
  a.digits.forEach((d, k) => { if (d !== 10 && !qclose(a.digitQuads[k], b.digitQuads[k])) why.push(`digit ${k}: Studio ${fmt(a.digitQuads[k])} / Builder ${fmt(b.digitQuads[k])}`); });
  if (a.bar.hidden !== b.bar.hidden || (!a.bar.hidden && !qclose(a.bar.quad, b.bar.quad))) why.push(`gauge: Studio ${a.bar.hidden ? 'hidden' : fmt(a.bar.quad)} / Builder ${b.bar.hidden ? 'hidden' : fmt(b.bar.quad)}`);
  if (why.length) bad.push(`aspect ${aspect.toFixed(4)} ${platform} ox ${ox} oy ${oy} v0 ${v0} v1 ${v1}: ${why.join('; ')}`);
}
ok(!bad.length, `scale 100: Builder draws every digit and the gauge where Studio does, and the same digit (${cases} cases: ${aspects.length} aspects x 2 platforms x 3 offsets x ${v0s.length} x ${v1s.length} values)`, bad.slice(0, 8).join('\n'));

// at other scales: Builder = the scale-100 picture scaled about the screen centre (0, 140) — what Studio does for an image
bad = [];
const studioDrift = { digit: 0, gauge: 0 };
for (const aspect of [1.333, 1.778, 2.222]) for (const scale of [25, 50, 150, 200]) for (const v0 of [42, 12345]) for (const v1 of [5, 20]) {
  const base = { 'geoui:v0': v0, 'geoui:v1': v1, 'geoui:ox': 50, 'geoui:oy': -30 };
  const one = builderAt(built, { aspect, platform: 'desktop', props: base }), sc = builderAt(built, { aspect, platform: 'desktop', props: { ...base, 'geoui:scale': scale } });
  const k = scale / 100, o = { x: 5 + one.L.vars['variable.geoui_cx'], y: -3 + one.L.vars['variable.geoui_cy'] };
  const expect = (q) => q && { x0: (q.x0 - o.x) * k + o.x, x1: (q.x1 - o.x) * k + o.x, y0: 140 + (q.y0 - o.y - 140) * k + o.y, y1: 140 + (q.y1 - o.y - 140) * k + o.y };
  one.digitQuads.forEach((q, i) => { if (q && !qclose(expect(q), sc.digitQuads[i], 1e-5)) bad.push(`aspect ${aspect} scale ${scale} digit ${i}: ${fmt(sc.digitQuads[i])}, expected ${fmt(expect(q))}`); });
  if (!qclose(expect(one.bar.quad), sc.bar.quad, 1e-5)) bad.push(`aspect ${aspect} scale ${scale} gauge: ${fmt(sc.bar.quad)}, expected ${fmt(expect(one.bar.quad))}`);
  const st = studioAt({ aspect, platform: 'desktop', props: { ...base, 'geoui:scale': scale } });
  st.digitQuads.forEach((q, i) => { if (st.digits[i] !== 10 && one.digitQuads[i]) studioDrift.digit = Math.max(studioDrift.digit, Math.abs((q.x0 + q.x1) / 2 - (expect(one.digitQuads[i]).x0 + expect(one.digitQuads[i]).x1) / 2)); });
  studioDrift.gauge = Math.max(studioDrift.gauge, Math.abs((st.bar.quad.x0 + st.bar.quad.x1) / 2 - (expect(one.bar.quad).x0 + expect(one.bar.quad).x1) / 2));
}
ok(!bad.length, 'other scales (25–200 %): Builder is the scale-100 picture scaled about the screen centre, digits and gauge alike', bad.slice(0, 8).join('\n'));
console.log(`  (Studio at those scales: a digit's centre is up to ${studioDrift.digit.toFixed(3)} units off that picture — its digit spacing does not scale — and the gauge's centre up to ${studioDrift.gauge.toFixed(3)} units)`);

// the gauge filled from its left edge (Builder's default; Studio's template pivots the gauge at its centre)
const left = G.buildPack(design('left'));
bad = [];
for (const aspect of [1.333, 1.778, 2.333]) {
  let x0 = null;
  for (const v1 of [1, 5, 10, 15, 20]) {
    const b = builderAt(left, { aspect, platform: 'desktop', props: { 'geoui:v1': v1 } });
    if (x0 === null) x0 = b.bar.quad.x0;
    if (!close(b.bar.quad.x0, x0) || !close(b.bar.quad.x1 - b.bar.quad.x0, bar.w * Math.min(1, v1 / 20), 1e-4)) bad.push(`aspect ${aspect} v1 ${v1}: ${fmt(b.bar.quad)}`);
  }
}
ok(!bad.length, 'fill "left": the gauge keeps its left edge and grows to the right with the value', bad.join('\n'));
const sMid = [5, 20].map((v1) => studioAt({ aspect: 1.778, platform: 'desktop', props: { 'geoui:v1': v1 } }).bar.quad);
console.log(`  (Studio's template at v1 5 and 20: left edge ${sMid[0].x0.toFixed(3)} vs ${sMid[1].x0.toFixed(3)} — it shrinks to its centre)`);

// aspect: an element anchored left keeps its distance from the left edge of the screen, right from the right edge
bad = [];
for (const aspect of aspects) {
  const b = builderAt(built, { aspect, platform: 'desktop', props: { 'geoui:v0': 88888, 'geoui:v1': 20 } }), sc = G.screenAt(S, aspect, 'desktop');
  if (!close(b.digitQuads[0].x0 - sc.left, 1.2, 1e-3) || !close(sc.top - b.digitQuads[0].y1, 1.2, 1e-3)) bad.push(`aspect ${aspect}: left pad ${(b.digitQuads[0].x0 - sc.left).toFixed(4)} top pad ${(sc.top - b.digitQuads[0].y1).toFixed(4)}`);
}
ok(!bad.length, 'the score stays 1.2 units from the left and top edges of the screen at every aspect (the screen as Studio defines it)', bad.join('\n'));

// the files
const F = built.files, names = Object.keys(F);
const jsonBad = names.filter((f) => /\.(json|material)$/.test(f)).filter((f) => { try { JSON.parse(F[f]); return false; } catch { return true; } });
ok(!jsonBad.length && names.length >= 14, `${names.length} files, every JSON parses`, jsonBad.join('\n'));
const ce = JSON.parse(F['geoui_RP/entity/player.entity.json'])['minecraft:client_entity'].description;
ok(ce.render_controllers.slice(0, 2).every((r) => Object.values(r)[0] === 'q.is_in_ui && !variable.is_paperdoll') && ce.render_controllers.length === 7
  && ce.scripts.animate[0].geoui_transform === 'q.is_in_ui' && ce.scripts.animate.includes('root') && ce.geometry.default === 'geometry.humanoid.custom'
  && Object.keys(ce.scripts.variables).length === 6, 'player.entity.json: the vanilla 1.26.50 one, with 2 geometries drawn in the UI only, the transform animation first', JSON.stringify(ce.render_controllers));
const unreadable = [];
for (const l of ce.scripts.pre_animation) if (G.molangError(l.replace(/;$/, ''))) unreadable.push(`${l} → ${G.molangError(l.replace(/;$/, ''))}`);
const an = JSON.parse(F['geoui_RP/animations/geoui.animation.json']).animations;
for (const a of Object.values(an)) for (const [bn, ch] of Object.entries(a.bones)) for (const v of Object.values(ch)) for (const e of [].concat(v)) if (typeof e === 'string' && G.molangError(e)) unreadable.push(`${bn}: ${e} → ${G.molangError(e)}`);
ok(!unreadable.length, 'every pre_animation line and animation expression the exporter wrote reads back as Molang', unreadable.slice(0, 6).join('\n'));
const hud = JSON.parse(F['geoui_RP/ui/hud_screen.json']);
ok(hud.root_panel && hud.root_panel.modifications[0].operation === 'insert_front' && !hud.hud_content && hud.geoui_panel.size.join() === '10%,10%' && hud.geoui_panel.offset[1] === '110%',
  'hud_screen.json adds the panel to root_panel (Studio replaced all of hud_content) at 10% x 10%, 110% down', JSON.stringify(hud));
const be = JSON.parse(F['geoui_BP/entities/player.json'])['minecraft:entity'];
const props = be.description.properties;
ok(Object.keys(props).length === 11 && props['geoui:aspect'].default === 1778 && props['geoui:v0'].range[1] === 16777216 && be.events['minecraft:gain_raid_omen'] && !be.events['minecraft:gain_bad_omen'],
  'BP player.json: the vanilla 1.26.50 one (raid omen, not the old bad omen) with 11 client_sync properties, values inside float32\'s exact range', JSON.stringify(Object.keys(props)));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'geoui-builder-')), js = path.join(T, 'main.mjs');
fs.writeFileSync(js, F['geoui_BP/scripts/main.js']);
const chk = spawnSync(process.execPath, ['--check', js], { encoding: 'utf8' });
ok(chk.status === 0, 'the behaviour pack script compiles', chk.stderr);
fs.rmSync(T, { recursive: true, force: true });
const noBp = G.buildPack({ ...design('left'), settings: { ...S0, bp: false } });
ok(!Object.keys(noBp.files).some((f) => f.startsWith('geoui_BP/')) && noBp.pre[0] === 'v.geoui_aspect = 1.778;' && noBp.pre.some((l) => l === 'v.geoui_cy = -4.9;'),
  'resource pack only: no BP, the aspect and the PC centre fix written as numbers (Studio\'s values)', noBp.pre.join('\n'));
const studioHud = G.buildPack({ ...design('left'), settings: { ...S0, hud: 'studio' } });
ok(JSON.parse(studioHud.files['geoui_RP/ui/hud_screen.json']).hud_content.controls.length === 3, 'hud "studio": Studio\'s hud_content replacement, on request');

// Molang: the parser and evaluator on what Studio writes
const env = G.envOf({ props: { 'geoui:v0': 12345 } });
ok(G.molang("(math.mod((math.abs(q.property('geoui:v0'))<10000 ? 10 : math.mod(math.floor(math.abs(q.property('geoui:v0'))/10000),10)),11))*40/440", env) === 1 * 40 / 440
  && G.molang('math.clamp(5/20,0,1)', env) === 0.25 && G.molang('v.a = 3; v.b = v.a * 2; return v.b + 1', G.envOf()) === 7 && G.molangError('1 +') && !G.molangError("q.is_in_ui && !v.is_paperdoll"),
  'Molang: Studio\'s digit expression, clamp, statements and return; a broken expression is reported');

// the calibration pack (bds/geoui/calib.mjs make): with every centre fix 0 the exporter adds nothing — each marker is drawn
// at its own model coordinates, so a picture of it measures the game's mapping and nothing of Studio's
const cal = G.buildPack(CAL.design(G)), marks = CAL.markers();
const cl = G.layoutOf(cal, { aspect: 2.167, platform: 'mobile' }), cq = cl.quads.filter((q) => q.bone === 'gcal_marks');
bad = marks.filter((m, i) => !cq[i] || !close((cq[i].quad.x0 + cq[i].quad.x1) / 2, m.x) || !close((cq[i].quad.y0 + cq[i].quad.y1) / 2, m.y) || !close(cq[i].quad.z, m.z)).map((m) => m.id);
ok(!cal.warnings.length && marks.length === 92 && cq.length === 92 && !bad.length, 'calibration pack: 92 markers drawn at their own model coordinates on a phone (no centre fix, no anchor term)', bad.join(' '));
// measuring: made-up screenshots with a known answer (a HUD in the grid's colours on top; a perspective camera)
const meas = [
  { o: { h: 176, cx: -0.1, cy: -4.9, w: 1560, hpx: 720, hud: true }, near: 1, far: 1 },
  { o: { h: 150, cx: 3, cy: 10, w: 1024, hpx: 768, persp: 0.002, hud: true }, near: 1 / (1 - 0.12), far: 1 / (1 + 0.12) },
  { o: { h: 220, cx: 0, cy: -9.25, w: 2400, hpx: 1080, dim: 0.6 }, near: 1, far: 1 },
].map(({ o, near, far }) => ({ o, near, far, r: CAL.measure(CAL.synth(o)) }));
bad = meas.filter(({ o, r, near, far }) => !r.ok || Math.abs(r.unitsPerScreenH / o.h - 1) > 0.004 || Math.abs(r.centre.x - o.cx) > 0.1 || Math.abs(r.centre.y - (140 + o.cy)) > 0.1
  || Math.abs(r.depth.near.ratio - near) > 0.01 || Math.abs(r.depth.far.ratio - far) > 0.01).map(({ o, r }) => `${JSON.stringify(o)} → ${CAL.describe('synth', r)}`);
ok(!bad.length, 'calib.mjs measure reads back the screen height (0.4 %), the centre (0.1 unit) and the depth scale (1 %) it was given — HUD pieces, perspective, a dim picture', bad.join('\n'));
const pngBack = (await import(pathToFileURL(path.join(TOP, 'bds', 'geoui', 'png.mjs')).href));
const img = CAL.synth({ w: 64, hpx: 32 }), back = pngBack.decodePng(pngBack.encodePng(img));
ok(back.width === 64 && back.height === 32 && Buffer.compare(Buffer.from(back.data), Buffer.from(img.data)) === 0, 'png.mjs: a picture written and read back is the same');

console.log(`\n${fails ? 'FAIL' : 'PASS'} geoui-builder-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
