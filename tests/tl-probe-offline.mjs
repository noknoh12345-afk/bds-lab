#!/usr/bin/env node
// GeoUI timeline's probes (bds/geoui/timeline/probe.mjs → bds/addons/geoui_probe*), no network: the add-ons are what probe.mjs
// makes, and each test's plane is shown by the pack's own Molang only while its number is chosen — the pack's pre_animation
// run in GeoUI Builder's evaluator the way the game runs it (it stops at a line that reads a variable never set), every
// animation's channels added up (scale multiplied), each render controller's part_visibility and uv_anim applied, its colour
// alpha only through a material with the colour mask (the game ignores it otherwise: round 2), a cutout dropping texels under
// 0.5 — so that a plane the real app does not draw says something about the game, not about the probe.
// node tests/tl-probe-offline.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = require('../bds/geoui/geoui_builder.js');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };

const r = spawnSync(process.execPath, [path.join(TOP, 'bds/geoui/timeline/probe.mjs'), '--check'], { encoding: 'utf8' });
ok(r.status === 0, 'the probe add-ons are what probe.mjs makes', (r.stderr || r.stdout).trim());

const rd = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
/** an add-on's client side, run as the game would (as far as GeoUI Builder's evaluator goes) with these properties */
function frame(name, ns, props, { lifeTime = 100, frames = 2 } = {}) {
  const dir = path.join(TOP, 'bds/addons', name, 'rp'), ent = rd(dir, 'entity/player.entity.json')['minecraft:client_entity'].description;
  const anims = {};
  for (const f of fs.readdirSync(path.join(dir, 'animations'))) Object.assign(anims, rd(path.join(dir, 'animations'), f).animations);
  const geos = {};
  for (const f of fs.readdirSync(path.join(dir, `models/entity/${ns}`))) { const g = rd(path.join(dir, `models/entity/${ns}`), f)['minecraft:geometry'][0]; geos[g.description.identifier] = g; }
  const rcs = rd(dir, `render_controllers/${ns}.render_controllers.json`).render_controllers;
  const mats = rd(dir, 'materials/entity.material').materials, defs = (name) => { const k = Object.keys(mats).find((x) => x.split(':')[0] === name); return k ? mats[k]['+defines'] || [] : []; };
  const defaults = { aspect: 2167, scale: 100, cx: 0, cy: 0, ox: 0, oy: 0, alpha: 100, v0: 0, v1: 0, v2: 0, v3: 0 };
  const p = Object.fromEntries(Object.entries({ ...defaults, ...props }).map(([k, v]) => [`${ns}:${k}`, v]));
  const env = G.envOf({ props: p, lifeTime });
  const pre = ent.scripts.pre_animation.filter((l) => !/^variable\.|^Math\./.test(l)), init = (ent.scripts.initialize || []).filter((l) => !/^variable\./.test(l));
  G.runPre(init, env);   // (once, at the entity's first moment)
  for (let f = 0; f < frames; f++) G.runPre(pre, env, { stopAtUnset: true, ours: /^variable\.(gp|geoui_)/ });   // (twice: a latch settles)
  const M = (e) => G.molang(e, env), v3 = (v, d) => (v === undefined ? [d, d, d] : Array.isArray(v) ? [0, 1, 2].map((i) => M(v[i] ?? d)) : [M(v), M(v), M(v)]);
  // (a channel keyed by time — { "0.0": [x, y, z], … } — at the animation's time: straight between keys, held past the ends)
  const keyedAt = (v, d, at) => {
    if (!v || Array.isArray(v) || typeof v !== 'object') return v3(v, d);
    const ks = Object.entries(v).map(([t, x]) => [+t, v3(x, d)]).sort((a, b) => a[0] - b[0]);
    if (at <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) if (at <= ks[i][0]) { const [t0, a] = ks[i - 1], [t1, b] = ks[i], u = (at - t0) / (t1 - t0); return a.map((x, j) => x + (b[j] - x) * u); }
    return ks[ks.length - 1][1];
  };
  const merged = {};
  for (const a of ent.scripts.animate) {
    if (typeof a !== 'object') continue;
    const [short, cond] = Object.entries(a)[0], json = anims[ent.animations[short]];
    if (!json || !M(cond)) continue;
    // (its time: anim_time_update's, or the seconds it has run — 0 here: what a keyed channel shows at its start)
    const at = json.anim_time_update !== undefined ? M(json.anim_time_update) : 0;
    for (const [bone, ch] of Object.entries(json.bones || {})) {
      const m = merged[bone] || (merged[bone] = { position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0] });
      const pos = keyedAt(ch.position, 0, at), sc = keyedAt(ch.scale, 1, at), rot = keyedAt(ch.rotation, 0, at);
      for (let i = 0; i < 3; i++) { m.position[i] += pos[i]; m.scale[i] *= sc[i]; m.rotation[i] += rot[i]; }
    }
  }
  const drawn = [];
  for (const entry of ent.render_controllers) {
    if (typeof entry !== 'object') continue;
    const [id, cond] = Object.entries(entry)[0], rc = rcs[id];
    if (!rc || !M(cond)) continue;
    const geo = geos[ent.geometry[rc.geometry.replace(/^Geometry\./, '')]];
    const shows = (bone) => { let v = true; for (const pv of rc.part_visibility || []) { const [k, c] = Object.entries(pv)[0]; if (k === '*' || k === bone) v = !!M(c); } return v; };
    const ctlAlpha = M(rc.color && rc.color.a !== undefined ? rc.color.a : 1), uv = rc.uv_anim ? rc.uv_anim.offset.map(M) : [0, 0];
    // (the bone's material: the last entry that names it or '*'; its defines say whether the colour's alpha counts, and
    //  whether texels under 0.5 are dropped)
    const matOf = (bone) => { let m = null; for (const e of rc.materials || []) { const [k, v] = Object.entries(e)[0]; if (k === '*' || k === bone) m = v; } return String(m || '').replace(/^material\./, ''); };
    const { quads, rotated } = G.pose([geo], { bones: merged }, env);
    for (const q of quads) {
      if (!shows(q.bone) || q.hidden) continue;
      const cube = geo.bones.find((b) => b.name === q.bone).cubes[q.cube], d = defs(matOf(q.bone)), u = cube.uv.north.uv[0] + uv[0] * 64, v = cube.uv.north.uv[1] + uv[1] * 64;
      const texel = u < 16 && v < 16 ? 0 : v >= 32 && v < 48 && u < 16 ? 96 / 255 : 1, alpha = texel * (d.includes('USE_COLOR_MASK') ? ctlAlpha : 1);
      if (d.includes('ALPHA_TEST') ? alpha >= 0.5 : alpha > 0.004) drawn.push({ id, bone: q.bone, quad: q.quad, alpha, uv, cube, rotated: rotated.includes(q.bone) });
    }
  }
  return { drawn, env };
}
// (the frame-0 cell of the probe's texture is clear: a plane on it shows only when uv_anim moves it to another frame)
const clearAt = (d) => { const u = d.cube.uv.north.uv; return u[0] + d.uv[0] * 64 === 0 && u[1] + d.uv[1] * 64 === 0; };
const shown = (fr) => fr.drawn.filter((d) => d.quad.x0 > -300 && !clearAt(d));
const mid = (d) => [(d.quad.x0 + d.quad.x1) / 2, (d.quad.y0 + d.quad.y1) / 2];
const near = (d, [x, y], size = 14) => Math.abs(mid(d)[0] - x) < 0.01 && Math.abs(mid(d)[1] - y) < 0.01 && Math.abs(d.quad.x1 - d.quad.x0 - size) < 0.01;
const COLS = [-160, -125, -90, -55, -20, 15, 50], ROWS = [175, 145, 115, 85], cellAt = (i) => [COLS[i % 7], ROWS[Math.floor(i / 7)]];

// ---- geoui_probe (round 3): each test alone in its cell, as the game draws it if what the probe asks holds — the colour mask
//      carries the controller's alpha, a cutout drops texels under 0.5, two animations multiply scale and add position
{
  const base = shown(frame('geoui_probe', 'gprobe', { v2: 0 }));
  ok(base.length === 0, 'geoui_probe: nothing is drawn while no test is chosen (the baseline the app compares with)', JSON.stringify(base.map((d) => d.bone)));
  const names = ['ctl', 'mask1', 'mask0', 'maskhalf', 'maskvar', 'cutmask0', 'cutmaskhalf', 'texhalf', 'texhalfcut', 'masktexhalf', 'rot90', 'scalemul', 'posadd', 'init', 'atu', 'atuwrap'];
  const none = new Set(['mask0', 'cutmask0', 'texhalfcut']), alphaOf = { maskhalf: 0.5, cutmaskhalf: 0.6, texhalf: 96 / 255, masktexhalf: 48 / 255 }, bad = [];
  names.forEach((bone, i) => {
    const k = i + 1, s = shown(frame('geoui_probe', 'gprobe', { v2: k }));
    let at = cellAt(i);
    if (bone === 'rot90') at = [15 + 20, 115];   // (its plane right of its pivot: pose does not turn it — the game says which way)
    if (bone === 'posadd') at = [at[0] + 20, at[1]];
    // (anim_time_update 0.5 between keys at +0 and +40: +20; the parent so, its child +10 more: +30)
    if (bone === 'atu') at = [at[0] + 20, at[1]];
    if (bone === 'atuwrap') at = [at[0] + 30, at[1]];
    const good = none.has(bone) ? s.length === 0 : s.length === 1 && s[0].bone === bone && near(s[0], at) && Math.abs(s[0].alpha - (alphaOf[bone] ?? 1)) < 1e-6 && (bone !== 'rot90' || s[0].rotated);
    if (!good) bad.push(`${k} ${bone}: ${JSON.stringify(s.map((d) => [d.bone, d.id, mid(d), d.alpha]))}`);
  });
  ok(!bad.length, `geoui_probe: each of ${names.length} tests draws its own plane in its own cell, at the alpha it asks about (mask 0, cutfade 0, a cutout's 0.376 texel: none), anim_time_update's at +20 and through a parent at +30`, bad.join('\n  '));
  const mats = rd(path.join(TOP, 'bds/addons/geoui_probe/rp'), 'materials/entity.material').materials, ent = rd(path.join(TOP, 'bds/addons/geoui_probe/rp'), 'entity/player.entity.json')['minecraft:client_entity'].description;
  ok(mats['gprobe_fade:gprobe_base']['+defines'].includes('USE_COLOR_MASK') && mats['gprobe_cutfade:gprobe_base']['+defines'].includes('ALPHA_TEST') && ent.materials.gprobe_fade === 'gprobe_fade' && ent.materials.gprobe_cutfade === 'gprobe_cutfade' && ent.scripts.initialize.includes('v.gp_init = 7;'),
    'geoui_probe: the fade materials (blend / cutout with the colour mask) declared by the client entity; the initialize line');
  const pre = ent.scripts.pre_animation.filter((l) => /^v\.gp_t = /.test(l));
  ok(pre.length === 1 && /variable\.is_paperdoll \? 0 : q\.property/.test(pre[0]), 'geoui_probe: its one property read guarded for the paper doll (as compile.js does)', pre.join(' | '));
  const paper = shown(frame('geoui_probe', 'gprobe', { v2: 1 }, {}));
  ok(paper.length === 1, 'geoui_probe: (the control drawn in the HUD, is_paperdoll false)');
}

// ---- geoui_probe_m: each expression's plane and its canary only when chosen
{
  const base = shown(frame('geoui_probe_m', 'gprobm', { v2: 0 }));
  ok(base.length === 0, 'geoui_probe_m: nothing is drawn while no test is chosen', JSON.stringify(base.map((d) => d.bone)));
  const names = ['ctl', 'split', 'split_c', 'w1000', 'w1000_c', 'd24', 'd24_c', 'tbl', 'tbl_c', 'lines', 'lines_c'], bad = [];
  names.forEach((bone, i) => { const s = shown(frame('geoui_probe_m', 'gprobm', { v2: i + 1 })); if (!(s.length === 1 && s[0].bone === bone && near(s[0], cellAt(i)))) bad.push(`${i + 1} ${bone}: ${JSON.stringify(s.map((d) => d.bone))}`); });
  ok(!bad.length, `geoui_probe_m: each of ${names.length} tests draws its own plane only (the 2000-instance lookup finds #1500 and its value)`, bad.join('\n  '));
  const pre = rd(path.join(TOP, 'bds/addons/geoui_probe_m/rp'), 'entity/player.entity.json')['minecraft:client_entity'].description.scripts.pre_animation, line = (id) => pre.find((l) => l.startsWith(`v.gpm_${id} =`));
  const C = require('../bds/geoui/timeline/compile.js');
  ok(line('w1000').length >= 980 && line('w1000').length <= 1000 && C.maxDepth(line('d24')) === 24 && pre.every((l) => l.length <= 1000 && C.maxDepth(l) <= 24),
    `geoui_probe_m: as long and deep as the export may write (w1000 ${line('w1000').length} characters, d24 ${C.maxDepth(line('d24'))} brackets) and no line past that`);
  const cut = pre.filter((l) => /^v\.gpm_s\d+ = |^v\.gpm_split = /.test(l)), lines = pre.filter((l) => /^v\.gpm_l\d+ = /.test(l)), tbl = pre.filter((l) => /^v\.gpm_t[kiqvg]\w* = /.test(l));
  ok(cut.length > 10 && cut.every((l) => l.length <= 1000) && cut.reduce((a, l) => a + l.length, 0) > 16000 && lines.length === 3000 && pre.reduce((a, l) => a + l.length, 0) > 450000 && tbl.length > 200,
    `geoui_probe_m: the long line cut into ${cut.length} lines of at most 1000 characters (as the export cuts its own), the lookup in ${tbl.length} lines, 3000 lines before the many-lines test (${Math.round(pre.reduce((a, l) => a + l.length, 0) / 1000)}k characters in all)`);
}

// ---- geoui_probe_lc / geoui_probe_vc: how many lines run, how many variables an entity keeps — each test's plane only when
//      chosen, its line right after what it counts (lc: 5000 lines counting one variable; vc: 3000 variables, read with ??)
for (const [name, ns, ids, lines] of [['geoui_probe_lc', 'gprobl', ['ctl', 'l1000', 'l1500', 'l2000', 'l2500', 'l3000', 'l3500', 'l4000', 'l5000'], 5000],
  ['geoui_probe_vc', 'gprobv', ['ctl', 'v500', 'v800', 'v1000', 'v1024', 'v1100', 'v1500', 'v2000', 'v2048', 'v2100', 'v3000'], 3000],
  ['geoui_probe_sz', 'gprobz', ['ctl', 'l500', 'l1000', 'l1500', 'l2000', 'l2500', 'l3000', 'l3500', 'l4000'], 4000]]) {
  const base = shown(frame(name, ns, { v2: 0 }));
  ok(base.length === 0, `${name}: nothing is drawn while no test is chosen`, JSON.stringify(base.map((d) => d.bone)));
  const bad = [];
  ids.forEach((bone, i) => { const s = shown(frame(name, ns, { v2: i + 1 })); if (!(s.length === 1 && s[0].bone === bone && near(s[0], cellAt(i)))) bad.push(`${i + 1} ${bone}: ${JSON.stringify(s.map((d) => d.bone))}`); });
  const pre = rd(path.join(TOP, 'bds/addons', name, 'rp'), 'entity/player.entity.json')['minecraft:client_entity'].description.scripts.pre_animation;
  // (each test's line right after the line or the variable it counts: where it stands in the file)
  const counter = /^v\.gpl_n = v\.gpl_n \+ 1(?: \+ v\.gp_t \* 0){0,10};$/, at = (id) => pre.findIndex((l) => l.startsWith(`v.gpq_${id} =`)), counted = (id) => (name !== 'geoui_probe_vc' ? pre.slice(0, at(id)).filter((l) => counter.test(l)).length : pre.slice(0, at(id)).filter((l) => /^v\.gpv_\d+ = /.test(l)).length);
  const placed = ids.slice(1).every((id) => counted(id) === Number(id.slice(1)));
  // (sz: each counting line as long as geoui_probe_m's, 150 characters or so)
  const long = name !== 'geoui_probe_sz' || pre.filter((l) => counter.test(l)).every((l) => l.length >= 140);
  ok(!bad.length && placed && long && pre.filter((l) => counter.test(l) || /^v\.gpv_\d+ = \d+;$/.test(l)).length === lines, `${name}: each of ${ids.length} tests draws its own plane only, its line right after the ${name === 'geoui_probe_vc' ? 'variable' : 'line'} it counts (${lines})`, bad.join('\n  '));
}

// ---- geoui_probe_b: the limits — each test plane only when chosen, moved 20 units by its own bone (#250 … #599), drawn by its
//      own render controller (the 40th, the 70th) or moved by the 1200th animation (anim_time_update); nothing while idle
{
  const base = shown(frame('geoui_probe_b', 'gprobb', { v2: 0 }));
  ok(base.length === 0, 'geoui_probe_b: nothing is drawn while no test is chosen (the "idle" shot the app compares with everything hidden)', JSON.stringify(base.map((d) => d.bone)));
  const names = ['ctl', 'b250', 'b255', 'b256', 'b257', 'b300', 'b400', 'b511', 'b512', 'b599', 'rc40', 'rc70', 'an1200'], bad = [];
  names.forEach((bone, i) => {
    // (6 columns: moved 20 units right, the last one stays in the measured part of the screen — probe.mjs checks that too)
    const s = shown(frame('geoui_probe_b', 'gprobb', { v2: i + 1 })), at = [COLS[i % 6] + 20, ROWS[Math.floor(i / 6)]];
    if (!(s.length === 1 && s[0].bone === bone && near(s[0], at))) bad.push(`${i + 1} ${bone}: ${JSON.stringify(s.map((d) => [d.bone, d.id, mid(d)]))}`);
  });
  ok(!bad.length, `geoui_probe_b: each of ${names.length} tests draws its own plane 20 units on from its cell, only when chosen`, bad.join('\n  '));
  const dir = path.join(TOP, 'bds/addons/geoui_probe_b/rp'), geo = rd(path.join(dir, 'models/entity/gprobb'), fs.readdirSync(path.join(dir, 'models/entity/gprobb'))[0])['minecraft:geometry'][0];
  const ent = rd(dir, 'entity/player.entity.json')['minecraft:client_entity'].description, rcs = rd(dir, 'render_controllers/gprobb.render_controllers.json').render_controllers;
  const idx = (b) => geo.bones.findIndex((x) => x.name === b), own = Object.keys(rcs).filter((k) => k !== 'controller.render.gprobb_probe');
  ok(geo.bones.length >= 600 && [250, 255, 256, 257, 300, 400, 511, 512, 599].every((b) => idx(`b${b}`) === b) && own.length === 70 && own[39].endsWith('_rc40') && own[69].endsWith('_rc70')
    && Object.keys(ent.animations).filter((k) => /^gprobb_a\d+$/.test(k)).length === 1200 && ent.scripts.animate.length >= 1200,
  `geoui_probe_b: ${geo.bones.length} bones with each test plane at its own index, 70 controllers of their own (the 40th and 70th the tests), 1200 animations`);
}

// ---- geoui_probe_tl: compile.js's own pack, paused at 0, 2, 4 and 6 s: the track's bar, the instances' dots where they belong,
//      the fader at its opacity (none at 0: not drawn at all)
{
  const tl = (props) => shown(frame('geoui_probe_tl', 'gprobt', props));
  const run = (from) => ({ seq: 1, seq_gen: 1, seq_from: from * 1000, seq_pause: 1 });
  const idle = tl({ seq: 0 });
  ok(idle.length === 2 && idle.some((d) => d.bone === 'bar') && idle.some((d) => d.bone === 'fader' && d.alpha === 1), 'geoui_probe_tl: idle, the design without the template\'s dot (a prototype never shows), the fader opaque — the baseline', JSON.stringify(idle.map((d) => [d.bone, d.alpha])));
  const bad = [];
  for (const [from, want, fade] of [[0, [['bar', [-160, 85]]], 0], [2, [['bar', [-140, 85]], ['dot', [-125, 115], 10]], 0.5], [4, [['bar', [-120, 85]], ['dot', [-90, 115], 10]], 1], [6, [['bar', [-100, 85]], ['dot', [-55, 115], 10], ['dot', [-20, 115], 10]], 1]]) {
    const s = tl(run(from)), f = s.filter((d) => d.bone === 'fader'), rest = s.filter((d) => d.bone !== 'fader');
    const okAll = rest.length === want.length && want.every(([b, at, size]) => rest.some((d) => d.bone.startsWith(b) && (b === 'bar' ? d.bone === 'bar' : d.bone !== 'dot') && near(d, at, size)))
      && (fade === 0 ? f.length === 0 : f.length === 1 && Math.abs(f[0].alpha - fade) < 1e-6 && near(f[0], [50, 85]));
    if (!okAll) bad.push(`st ${from}: ${JSON.stringify(s.map((d) => [d.bone, d.quad, d.alpha]))}`);
  }
  ok(!bad.length, 'geoui_probe_tl: paused at 0 / 2 / 4 / 6 s, the bar 0 / 20 / 40 / 60 units on, the dots of the instances out then in their cells (copies, not the dot), the fader 0 (not drawn) / 0.5 / 1 / 1', bad.join('\n  '));
  const ent = rd(path.join(TOP, 'bds/addons/geoui_probe_tl/rp'), 'entity/player.entity.json')['minecraft:client_entity'].description;
  const unset = G.unsetReads(ent.scripts.pre_animation, { init: ent.scripts.initialize, ours: /^variable\.(geoui|gprobt)_/ });
  ok(!unset.length, 'geoui_probe_tl: compile.js\'s pre_animation reads no variable before it is set (the game would stop there)', unset.join(', '));
  const reads = ent.scripts.pre_animation.join('\n').match(/[^ (]*q\.property\('[^']+'\)/g) || [];
  ok(reads.length > 0 && reads.every((r) => /variable\.is_paperdoll \? 0 : q\.property/.test(r) || /^:?$/.test(r.replace(/q\.property.*/, ''))) && !/[^:] q\.property/.test(ent.scripts.pre_animation.join('\n').replace(/variable\.is_paperdoll \? 0 : q\.property/g, '')),
    'geoui_probe_tl: every property read of compile.js is guarded for the paper doll (the pause screen\'s has none: reading one there is a Molang error)');
  const env = frame('geoui_probe_tl', 'gprobt', { seq: 1, seq_gen: 1, seq_from: 2000, seq_pause: 1 }).env;
  env.vars['variable.is_paperdoll'] = 1;
  const pre = ent.scripts.pre_animation.filter((l) => !/^variable\.|^Math\./.test(l));
  G.runPre(pre, env, { stopAtUnset: true, ours: /^variable\.(gp|geoui_)/ });
  ok(env.stoppedAt === undefined && env.vars['variable.gprobt_seq'] === 0, 'geoui_probe_tl: in the paper doll the lines run to the end and play nothing (seq 0)', `stopped at ${env.stoppedAt}`);
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-probe-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
