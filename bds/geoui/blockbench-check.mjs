#!/usr/bin/env node
// GeoUI Builder in the real Blockbench (its web build, in a headless Chromium): the plugin is installed the way "File → Plugins →
// Load Plugin from File" does, GeoUI Studio's template 「スコア＆ゲージ」 is rebuilt with Studio's own textures, and
//   - the pack built inside Blockbench draws every digit and the gauge where Studio's own export does (and the same digit)
//   - Blockbench's own preview (its Molang engine and bone transforms) puts and hides every plane where GeoUICore says
//   - Edit mode shows one numeral per digit, a .bbmodel saved and reopened exports the same files, every dialog opens
//   - Studio's own files rendered by Blockbench at scale 100 / 50 next to Builder's (Studio's digits drift apart at 50)
// and pictures of all of it go to --out. --export <file.mcaddon> writes the template's pack (--uuids <unit folder>: that
// unit's pack UUIDs, so the unit updates in place).
//
// Needs (not the lab's own dependencies; this is a check for the plugin's author):
//   BLOCKBENCH_DIR  a Blockbench source tree built for the web: git clone https://github.com/JannisX11/blockbench, npm ci --ignore-scripts,
//                   npm run build-web (the version this was run with: 5.2.2)
//   GEOUI_NODE_MODULES  a node_modules with playwright-core and @sparticuz/chromium (npm i playwright-core @sparticuz/chromium),
//                   or CHROMIUM=<a Chromium binary> with playwright-core
//   node bds/geoui/blockbench-check.mjs [--out <folder>] [--export <file.mcaddon> [--uuids <unit folder>]]
// (the functions handed to page.evaluate run inside Blockbench: its globals)
/* global window, document, Blockbench, Formats, Plugin, Format, Project, Group, Cube, Texture, Animation, Animator, Modes, Timeline, THREE,
   scene, Canvas, Codecs, Dialog, BarItems */
import fs from 'node:fs';
import path from 'node:path';
import { openBlockbench, pluginFile, DIST, TOP } from './bbpage.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt('out', path.join(TOP, 'bds', '.lab', 'geoui-blockbench')));
// (the one file Blockbench loads: GeoUI Builder with its timeline, bds/geoui/build.mjs's — geoui_builder.js alone when not built)
const PLUGIN = pluginFile(), SRP = path.join(TOP, 'bds', 'addons', 'geoui_studio', 'rp');
const mod = { exports: {} }; new Function('module', fs.readFileSync(PLUGIN, 'utf8'))(mod); const G = mod.exports;
const dataUrl = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const sj = (f) => JSON.parse(fs.readFileSync(path.join(SRP, f), 'utf8'));
const L1 = dataUrl(path.join(SRP, 'textures/geoui/l1.png')), L2 = dataUrl(path.join(SRP, 'textures/geoui/l2.png'));
let fails = 0, n = 0;
const ok = (c, m, d = '') => { n++; console.log(`${c ? '✔' : '✘'} ${m}${c ? '' : '\n   ' + String(d).slice(0, 1500)}`); if (!c) fails++; };

// ---- Blockbench, served from its folder, in Chromium (WebGL by SwiftShader)
const BBP = await openBlockbench('blockbench-check', { out: OUT });
const { ev, shot, errors, version } = BBP;

// ---- install
const inst = await BBP.install(PLUGIN);
const reg = await ev(() => ({ format: !!Formats.geoui, menu: [...document.querySelectorAll('#menu_bar .menu_bar_point')].some((e) => e.textContent === 'GeoUI'), api: !!window.GeoUIBuilder, timeline: !!(window.GeoUIBuilder && window.GeoUIBuilder.timeline) }));
ok(inst.installed && reg.format && reg.menu && reg.api && (PLUGIN !== DIST || reg.timeline), `Blockbench ${version}: installed from a file (${path.relative(TOP, PLUGIN)}: ${inst.id} ${inst.version}), the GeoUI format, menu and API are there${reg.timeline ? ', with the timeline' : ''}`, JSON.stringify({ inst, reg }));

// ---- the template, with Studio's textures
const template = async (fill, uuids) => ev(async ({ L1, L2, fill, uuids }) => {
  const B = window.GeoUIBuilder;
  B.newProject();
  // (a new project starts from the measured calibration: this one is Studio's template, compared with Studio's own export)
  const fresh = B.settings();
  window.__geouiFresh = { calibration: fresh.calibration, H: fresh.unitsPerScreenH, fixY: fresh.centerFix.mobile.y };
  B.setSettings({ calibration: 'studio-v10.1' });
  if (uuids) B.setSettings({ uuids, name: 'GeoUI Pack', description: 'GeoUI Builder (Blockbench) で作成' });
  await B.addNumber({ name: 'score', digits: 5, heightPct: 9, anchor: 'top_left', padX: 1.2, padY: 1.2, source: "q.property('geoui:v0')", dataUrl: L1, cells: 11 });
  await B.addGauge({ name: 'gauge', dataUrl: L2, widthPct: 34, heightPct: 2.5, anchor: 'top_left', padX: 1.2, padY: 4.4, max: 20, fill, source: "q.property('geoui:v1')" });
  await new Promise((r) => setTimeout(r, 200));
  return { cubes: Cube.all.length, groups: Group.all.length };
}, { L1, L2, fill, uuids });
const made = await template('center');
ok(made.cubes === 51 && made.groups === 58, `the template: ${made.cubes} planes in ${made.groups} bones (5 digits x 10 numerals, a gauge)`, JSON.stringify(made));
const fresh = await ev(() => window.__geouiFresh);
ok(fresh.calibration === G.MEASURED.id && Math.abs(fresh.H - 170.68) < 0.01 && Math.abs(fresh.fixY + 0.02905) < 1e-5, `a new project starts from the measured calibration (${fresh.H} units high, centre fix y ${fresh.fixY}); Studio's template is switched to Studio's values`, JSON.stringify(fresh));
const built = await ev(() => { const b = window.GeoUIBuilder.build(); return { settings: b.settings, pre: b.pre, animation: b.animation, geometries: b.geometries, warnings: b.warnings }; });
ok(!built.warnings.length, 'built inside Blockbench without warnings', built.warnings.join('\n'));

// Studio's export vs the pack built in Blockbench, both run through their own Molang
const sPre = sj('entity/player.entity.json')['minecraft:client_entity'].description.scripts.pre_animation.filter((l) => /^v\.geoui_/.test(l));
const sAnim = sj('animations/geoui.animation.json').animations['animation.geoui_transform'], sRC = sj('render_controllers/geoui.render_controllers.json').render_controllers;
const sGeo = ['l1_d0', 'l1_d1', 'l1_d2', 'l1_d3', 'l1_d4', 'l2'].map((k) => sj(`models/entity/geoui/${k}.geo.json`)['minecraft:geometry'][0]);
let bad = [], cases = 0;
const near = (a, b) => ['x0', 'x1', 'y0', 'y1'].every((c) => Math.abs(a[c] - b[c]) <= 2e-3);
for (const d of G.DEVICES) for (const platform of ['desktop', 'mobile']) for (const v0 of [0, 42, 12345, 99999]) for (const v1 of [0, 5, 20]) {
  const fix = G.settingsOf({}).centerFix[platform];
  const p = { 'geoui:aspect': Math.round(G.qa(d.aspect) * 1000), 'geoui:scale': 100, 'geoui:ox': 0, 'geoui:oy': 0, 'geoui:alpha': 100, 'geoui:cx': Math.round(fix.x * 10000), 'geoui:cy': Math.round(fix.y * 10000), 'geoui:v0': v0, 'geoui:v1': v1 };
  const env = G.envOf({ props: p }); G.runPre(sPre, env);
  const sq = G.pose(sGeo, sAnim, env).quads, sd = [0, 1, 2, 3, 4].map((k) => Math.round(G.molang(sRC[`controller.render.geoui_l1_d${k}`].uv_anim.offset[0], env) * 11));
  const L = G.layoutOf(built, { aspect: d.aspect, platform, props: { 'geoui:v0': v0, 'geoui:v1': v1 } });
  cases++;
  for (let k = 0; k < 5; k++) {
    const shown = L.quads.filter((q) => new RegExp(`^score_d${k}_n\\d$`).test(q.bone) && !q.hidden), bd = shown.length ? +shown[0].bone.slice(-1) : 10;
    if (bd !== sd[k]) bad.push(`${d.label} ${platform} v0 ${v0}: digit ${k} Studio ${sd[k]} Builder ${bd}`);
    else if (sd[k] !== 10 && !near(shown[0].quad, sq[k].quad)) bad.push(`${d.label} ${platform} v0 ${v0}: digit ${k} at ${JSON.stringify(shown[0].quad)} vs ${JSON.stringify(sq[k].quad)}`);
  }
  const bq = L.quads.find((q) => q.bone === 'gauge');
  if (bq.hidden !== sq[5].hidden || (!bq.hidden && !near(bq.quad, sq[5].quad))) bad.push(`${d.label} ${platform} v1 ${v1}: gauge ${JSON.stringify(bq.quad)} vs ${JSON.stringify(sq[5].quad)}`);
}
ok(!bad.length, `the pack built in Blockbench draws what Studio's export draws (${cases} cases: ${G.DEVICES.length} devices x 2 platforms x values; .002 units — Blockbench keeps 4 decimals)`, bad.slice(0, 6).join('\n'));

// Blockbench's own preview vs GeoUICore.layoutOf
const bbQuads = (o) => ev((o) => {
  const B = window.GeoUIBuilder; B.preview(o); Timeline.setTime(0); Animator.preview(); scene.updateMatrixWorld(true);
  const out = {};
  for (const c of Cube.all) {
    if (!c.mesh) continue;
    const pos = c.mesh.geometry.attributes.position, v = new THREE.Vector3();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(c.mesh.matrixWorld); x0 = Math.min(x0, -v.x); x1 = Math.max(x1, -v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    out[c.parent.name] = { x0, x1, y0, y1 };
  }
  return out;
}, o);
bad = []; cases = 0;
for (const [aspect, scale, v0, v1, ox, oy, platform] of [[1.778, 100, 12345, 20, 0, 0, 'desktop'], [1.333, 100, 42, 5, 0, 0, 'desktop'], [2.333, 100, 99999, 10, 0, 0, 'mobile'],
  [2.167, 50, 305, 15, 0, 0, 'mobile'], [1.778, 200, 7, 20, 120, -80, 'desktop'], [1.6, 75, 88888, 1, -300, 200, 'console']]) {
  const props = { 'geoui:v0': v0, 'geoui:v1': v1, 'geoui:scale': scale, 'geoui:ox': ox, 'geoui:oy': oy };
  const q = await bbQuads({ aspect, platform, props }), L = G.layoutOf(built, { aspect, platform, props });
  cases++;
  for (const lq of L.quads) {
    const b = q[lq.bone];
    if (!b) { bad.push(`${lq.bone}: not in Blockbench`); continue; }
    // (Blockbench draws a scale of 0 as 0.00001: collapsed to a point, as the game hides it)
    const hid = b.x1 - b.x0 < 1e-3 || b.y1 - b.y0 < 1e-3;
    if (hid !== lq.hidden) bad.push(`aspect ${aspect} scale ${scale} ${lq.bone}: hidden in Blockbench ${hid}, in GeoUICore ${lq.hidden}`);
    else if (!lq.hidden && !['x0', 'x1', 'y0', 'y1'].every((c) => Math.abs(b[c] - lq.quad[c]) < 1e-3)) bad.push(`aspect ${aspect} scale ${scale} ${lq.bone}: ${JSON.stringify(b)} / ${JSON.stringify(lq.quad)}`);
  }
}
ok(!bad.length, `Blockbench's own preview puts and hides every plane where GeoUICore says (${cases} settings: aspects, scale 50–200 %, offsets, 3 platforms)`, bad.slice(0, 8).join('\n'));

// pictures: Edit mode, the preview at three aspects, scale 50
const pic = async (file, o) => { await ev((o) => { const B = window.GeoUIBuilder; if (o) B.preview(o); else Modes.options.edit.select(); B.syncNumerals(); B.view(); B.refreshOverlay(); }, o); await shot(file); };
await pic('01-edit.png', null);
const vis = await ev(() => Cube.all.filter((c) => /_n\d_plane$/.test(c.name)).map((c) => [c.name.match(/_n(\d)_/)[1], c.visibility]));
ok(vis.length === 50 && vis.every(([d, v]) => v === (d === '0')), 'Edit mode: of the ten planes of each digit only the 0 shows', JSON.stringify(vis.slice(0, 12)));
await pic('02-preview-16x9.png', { aspect: 1.778, platform: 'desktop', props: { 'geoui:v0': 12345, 'geoui:v1': 20 } });
await pic('03-preview-4x3.png', { aspect: 1.333, platform: 'desktop', props: { 'geoui:v0': 42, 'geoui:v1': 5 } });
await pic('04-preview-21x9.png', { aspect: 2.333, platform: 'mobile', props: { 'geoui:v0': 99999, 'geoui:v1': 10 } });
await pic('05-preview-scale50.png', { aspect: 1.778, platform: 'desktop', props: { 'geoui:v0': 305, 'geoui:v1': 15, 'geoui:scale': 50 } });

// .bbmodel round trip
const rt = await ev(async () => {
  const B = window.GeoUIBuilder, strip = (f) => JSON.stringify(f, (k, v) => (k === 'base64' ? '…' : v));
  Modes.options.edit.select();
  const before = strip(B.build().files), text = Codecs.project.compile({ raw: false });
  Codecs.project.load(JSON.parse(text), { path: 'roundtrip.bbmodel', name: 'roundtrip.bbmodel' });
  await new Promise((r) => setTimeout(r, 300));
  return { same: strip(B.build().files) === before, format: Format.id, size: text.length };
});
ok(rt.same && rt.format === 'geoui', `.bbmodel saved (${Math.round(rt.size / 1024)} KB) and reopened: the same export, file for file (pack UUIDs, settings and element data kept)`, JSON.stringify(rt));

// dialogs
const dl = await ev(async () => {
  const seen = [];
  for (const [id, before] of [['geoui_settings'], ['geoui_add_image'], ['geoui_add_number'], ['geoui_add_gauge'], ['geoui_element', () => { Modes.options.edit.select(); Group.all.find((g) => g.name === 'gauge').select(); }], ['geoui_check']]) {
    if (before) before();
    BarItems[id].click(); await new Promise((r) => setTimeout(r, 150));
    seen.push([id, Dialog.open ? Dialog.open.id : null]); if (Dialog.open) Dialog.open.cancel();
  }
  return seen;
});
ok(dl.every(([a, b]) => b === a || (a === 'geoui_add_image' && b === 'geoui_add_image')), `every dialog opens: ${dl.map(([a, b]) => `${a}${b ? '' : ' ✘'}`).join(', ')}`, JSON.stringify(dl));

// Studio's own files in Blockbench next to Builder's, scale 100 and 50
const studio = { geo: sGeo, anim: sj('animations/geoui.animation.json'), rc: sRC, pre: sPre };
const studioPic = async (file, props) => {
  await ev(async ({ studio, props, L1, L2 }) => {
    const B = window.GeoUIBuilder, G = B.core;
    B.newProject();
    for (const g of [...Group.all]) g.remove();
    const tx = (name, url, w, h) => { const t = new Texture({ name }).fromDataURL(url); t.uv_width = w; t.uv_height = h; t.add(false); return t; };
    const t1 = tx('l1', L1, 440, 71), t2 = tx('l2', L2, 256, 16), root = new Group({ name: 'geo_ui', origin: [0, 140, 0] }).init();
    const env = G.envOf({ props }); G.runPre(studio.pre, env);
    studio.geo.forEach((g, i) => {
      const b = g.bones[1], c = g.bones[1].cubes[0], u = i < 5 ? Math.round(G.molang(studio.rc[`controller.render.geoui_l1_d${i}`].uv_anim.offset[0], env) * 440) : 0, uv = c.uv.north;
      const grp = new Group({ name: b.name, origin: [-b.pivot[0], b.pivot[1], b.pivot[2]] }).addTo(root).init(), off = { texture: null };
      new Cube({ name: `${b.name}_plane`, from: [-(c.origin[0] + c.size[0]), c.origin[1], c.origin[2]], to: [-c.origin[0], c.origin[1] + c.size[1], c.origin[2]], box_uv: false, origin: grp.origin.slice(),
        faces: { north: { uv: [uv.uv[0] + u, uv.uv[1], uv.uv[0] + u + uv.uv_size[0], uv.uv[1] + uv.uv_size[1]], texture: (i < 5 ? t1 : t2).uuid }, south: off, east: off, west: off, up: off, down: off } }).addTo(grp).init();
    });
    Canvas.updateAll();
    for (const a of [...Animation.all]) a.remove(false, false);
    const [anim] = Format.animation_codec.loadFile({ json: studio.anim, path: '' }, ['animation.geoui_transform']);
    const lines = Object.entries(props).map(([k, v]) => `q.property('${k}') = ${v}`).concat(studio.pre.map((l) => l.replace(/;$/, '')));
    Project.variable_placeholders = lines.join('\n'); Animator.global_variable_lines = {};
    for (const line of lines) { const [key, val] = line.split(/=\s*(.+)/); Animator.global_variable_lines[key.replace(/[\s;]/g, '').replace(/^v\./, 'variable.').replace(/^q\./, 'query.')] = val.trim(); }
    Modes.options.animate.select(); anim.select(); Timeline.setTime(0); Animator.preview();
    B.setSettings({ previewAspect: props['geoui:aspect'] / 1000 }); B.view();
  }, { studio, props, L1, L2 });
  await shot(file);
};
const P = (scale) => ({ 'geoui:aspect': 1778, 'geoui:scale': scale, 'geoui:ox': 0, 'geoui:oy': 0, 'geoui:alpha': 100, 'geoui:cx': -6, 'geoui:cy': -278, 'geoui:v0': 12345, 'geoui:v1': 10 });
await studioPic('10-studio-scale100.png', P(100));
await studioPic('11-studio-scale50.png', P(50));
for (const [file, scale] of [['12-builder-scale100.png', 100], ['13-builder-scale50.png', 50]]) {
  await template('left');
  await ev((props) => { const B = window.GeoUIBuilder; B.preview({ aspect: 1.778, platform: 'desktop', props }); B.view(); }, { 'geoui:v0': 12345, 'geoui:v1': 10, 'geoui:scale': scale });
  await shot(file);
}

// the template's pack, for a lab unit
if (opt('export')) {
  let uuids = null;
  const unit = opt('uuids');
  if (unit) {
    const m = (f) => JSON.parse(fs.readFileSync(path.join(unit, f, 'manifest.json'), 'utf8'));
    const rp = m('rp'), bp = m('bp');
    uuids = { rp: rp.header.uuid, rpMod: rp.modules[0].uuid, bp: bp.header.uuid, bpData: bp.modules.find((x) => x.type === 'data').uuid, bpScript: bp.modules.find((x) => x.type === 'script').uuid };
  }
  await template('left', uuids);
  const b64 = await ev(async () => { const B = window.GeoUIBuilder; Modes.options.edit.select(); return B.zip(B.build(), 'base64'); });
  fs.writeFileSync(path.resolve(opt('export')), Buffer.from(b64, 'base64'));
  console.log(`OK ${path.resolve(opt('export'))}${uuids ? ` (the UUIDs of ${unit})` : ''}`);
}

ok(!errors.length, 'no errors on the page', errors.join('\n'));
await BBP.close();
console.log(`\n${fails ? 'FAIL' : 'PASS'} blockbench-check (${n - fails}/${n}) — pictures in ${OUT}`);
process.exit(fails ? 1 : 0);
