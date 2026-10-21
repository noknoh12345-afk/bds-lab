#!/usr/bin/env node
// GeoUI timeline's probes (bds/geoui/timeline/probe.mjs → bds/addons/geoui_probe*), no network: the add-ons are what probe.mjs
// makes, and each test's plane is shown by the pack's own Molang only while its number is chosen — the pack's pre_animation
// run in GeoUI Builder's evaluator, every animation's channels added up (scale multiplied), each render controller's
// part_visibility, colour alpha and uv_anim applied — so that a plane the real app does not draw says something about the game,
// not about the probe. node tests/tl-probe-offline.mjs
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
/** an add-on's client side, run as the game would (as far as GeoUI Builder's evaluator goes) at one test number */
function frame(name, ns, props, lifeTime = 100) {
  const dir = path.join(TOP, 'bds/addons', name, 'rp'), ent = rd(dir, 'entity/player.entity.json')['minecraft:client_entity'].description;
  const anims = {};
  for (const f of fs.readdirSync(path.join(dir, 'animations'))) Object.assign(anims, rd(path.join(dir, 'animations'), f).animations);
  const geos = {};
  for (const f of fs.readdirSync(path.join(dir, `models/entity/${ns}`))) { const g = rd(path.join(dir, `models/entity/${ns}`), f)['minecraft:geometry'][0]; geos[g.description.identifier] = g; }
  const rcs = rd(dir, `render_controllers/${ns}.render_controllers.json`).render_controllers;
  const defaults = { aspect: 2167, scale: 100, cx: 0, cy: 0, ox: 0, oy: 0, alpha: 100, v0: 0, v1: 0, v2: 0, v3: 0 };
  const p = Object.fromEntries(Object.entries({ ...defaults, ...props }).map(([k, v]) => [`${ns}:${k}`, v]));
  const env = G.envOf({ props: p, lifeTime });
  const pre = ent.scripts.pre_animation.filter((l) => !/^variable\.|^Math\./.test(l));
  G.runPre(pre, env); G.runPre(pre, env);   // (twice: what latches on a change settles, as a second frame would)
  // (a flat sum of many terms is too deep for the evaluator's recursion: its head is read, the rest checked to be "+ v.gp_t * 0")
  const FLAT = / \+ v\.gp_t \* 0/g, M = (e) => (typeof e === 'string' && e.length > 20000 && e.replace(FLAT, '').length < 64 ? G.molang(e.replace(FLAT, ''), env) : G.molang(e, env)), v3 = (v, d) => (v === undefined ? [d, d, d] : Array.isArray(v) ? [0, 1, 2].map((i) => M(v[i] ?? d)) : [M(v), M(v), M(v)]);
  // the animations that play: animate's conditions; one bone's channels from all of them (positions add, scales multiply)
  const merged = {};
  for (const a of ent.scripts.animate) {
    if (typeof a !== 'object') continue;
    const [short, cond] = Object.entries(a)[0], json = anims[ent.animations[short]];
    if (!json || !M(cond)) continue;
    for (const [bone, ch] of Object.entries(json.bones || {})) {
      const m = merged[bone] || (merged[bone] = { position: [0, 0, 0], scale: [1, 1, 1] });
      const pos = v3(ch.position, 0), sc = v3(ch.scale, 1);
      for (let i = 0; i < 3; i++) { m.position[i] += pos[i]; m.scale[i] *= sc[i]; }
    }
  }
  // each controller that draws: the bones it shows (part_visibility: the last entry that names a bone wins), its alpha and uv offset
  const drawn = [];
  for (const entry of ent.render_controllers) {
    if (typeof entry !== 'object') continue;
    const [id, cond] = Object.entries(entry)[0], rc = rcs[id];
    if (!rc || !M(cond)) continue;
    const geo = geos[ent.geometry[rc.geometry.replace(/^Geometry\./, '')]];
    const shows = (bone) => { let v = true; for (const pv of rc.part_visibility || []) { const [k, c] = Object.entries(pv)[0]; if (k === '*' || k === bone) v = !!M(c); } return v; };
    const alpha = M(rc.color && rc.color.a !== undefined ? rc.color.a : 1), uv = rc.uv_anim ? rc.uv_anim.offset.map(M) : [0, 0];
    const { quads } = G.pose([geo], { bones: merged }, env);
    for (const q of quads) if (shows(q.bone) && !q.hidden && alpha > 0.01) drawn.push({ id, bone: q.bone, quad: q.quad, alpha, uv, cube: geo.bones.find((b) => b.name === q.bone).cubes[q.cube] });
  }
  return { drawn, env };
}
// (the frame-0 cell of the probe's texture is clear: a plane on it shows only when uv_anim moves it to another frame)
const clearAt = (d) => { const u = d.cube.uv.north.uv; return u[0] + d.uv[0] * 64 === 0 && u[1] + d.uv[1] * 64 === 0; };
const shown = (fr) => fr.drawn.filter((d) => d.quad.x0 > -300 && !clearAt(d));
const near = (d, [x, y], size = 14) => Math.abs((d.quad.x0 + d.quad.x1) / 2 - x) < 0.01 && Math.abs((d.quad.y0 + d.quad.y1) / 2 - y) < 0.01 && Math.abs(d.quad.x1 - d.quad.x0 - size) < 0.01;

// ---- geoui_probe: each test alone, nothing else; a clock moves 15 units a second (the pack's own q.life_time)
{
  const base = shown(frame('geoui_probe', 'gprobe', { v2: 0 }));
  ok(base.length === 0, 'geoui_probe: nothing is drawn while no test is chosen (the baseline the app compares with)', JSON.stringify(base.map((d) => d.bone)));
  const tests = [['ctl', 1, [-160, 175]], ['b60', 5, [-160, 145]], ['b115', 6, [-125, 145]], ['b121', 7, [-90, 145]], ['b122', 8, [-55, 145]], ['b126', 9, [-160, 115]],
    ['b130', 10, [-125, 115]], ['b200', 11, [-90, 115]], ['b248', 12, [-55, 115]], ['own1', 13, [-20, 175]], ['ownblend', 14, [15, 175]], ['ownalpha', 15, [50, 175]],
    ['ownuv', 16, [-20, 145]], ['ownproto_t0s0', 17, [15, 145]], ['own31', 18, [50, 145]], ['line700', 19, [-20, 115]]];
  const bad = [];
  for (const [bone, k, at] of tests) { const s = shown(frame('geoui_probe', 'gprobe', { v2: k })); if (!(s.length === 1 && s[0].bone === bone && near(s[0], at))) bad.push(`${k} ${bone}: ${JSON.stringify(s.map((d) => [d.bone, d.id, d.quad]))}`); }
  ok(!bad.length, `geoui_probe: each of ${tests.length} tests draws its own plane in its own cell, and nothing else`, bad.join('\n  '));
  const geo = rd(path.join(TOP, 'bds/addons/geoui_probe/rp/models/entity/gprobe'), 'probe.geo.json')['minecraft:geometry'][0], idx = (b) => geo.bones.findIndex((x) => x.name === b);
  ok(geo.bones.length === 249 && [['ctl', 1], ['b60', 60], ['b121', 121], ['b122', 122], ['b248', 248], ['ownproto_t0s0', 140]].every(([b, i]) => idx(b) === i), 'geoui_probe: 249 bones, the tests at their indices');
  const owners = (k, bone) => frame('geoui_probe', 'gprobe', { v2: k }).drawn.filter((d) => d.bone === bone).map((d) => d.id);
  ok(owners(1, 'ctl').join() === 'controller.render.gprobe_probe' && owners(13, 'own1').join() === 'controller.render.gprobe_probe_own1' && owners(18, 'own31').join() === 'controller.render.gprobe_probe_own31',
    'geoui_probe: a shared-controller test is drawn by the shared controller only, an own-controller test by its own only');
  const rcList = rd(path.join(TOP, 'bds/addons/geoui_probe/rp'), 'entity/player.entity.json')['minecraft:client_entity'].description.render_controllers.map((x) => Object.keys(x)[0] || x);
  ok(rcList.filter((x) => /gprobe_probe_/.test(x)).length === 31 && rcList.indexOf('controller.render.gprobe_probe_own31') === rcList.length - 1, 'geoui_probe: 31 own controllers, own31 the last');
  const at = (k, life, bone) => { const s = frame('geoui_probe', 'gprobe', { v2: k }, life).drawn.find((d) => d.bone === bone); return s ? (s.quad.x0 + s.quad.x1) / 2 : null; };
  // (pre_animation latches q.life_time when the test is chosen: chosen at 100 s, seen at 101.5 → 22.5 units on)
  const cl = (() => {
    const dir = path.join(TOP, 'bds/addons/geoui_probe/rp'), ent = rd(dir, 'entity/player.entity.json')['minecraft:client_entity'].description, pre = ent.scripts.pre_animation.filter((l) => !/^variable\.|^Math\./.test(l));
    const p = { 'gprobe:v2': 0 }, env = G.envOf({ props: p, lifeTime: 100 });
    G.runPre(pre, env); p['gprobe:v2'] = 2; G.runPre(pre, env);
    const q0 = env.query; env.query = (name, args) => (name === 'query.life_time' ? 101.5 : q0(name, args)); G.runPre(pre, env);
    return env.vars['variable.gp_cl'];
  })();
  ok(Math.abs(cl - 1.5) < 1e-9 && at(1, 100, 'ctl') === -160, 'geoui_probe: the pre_animation clock counts from the moment its test is chosen (1.5 s → 22.5 units)', `cl ${cl}`);
}

// ---- geoui_probe_m: each Molang test draws only when chosen (the evaluator reads every expression); the 600-bone geometry
{
  const base = shown(frame('geoui_probe_m', 'gprobm', { v2: 0 }));
  ok(base.length === 0, 'geoui_probe_m: nothing is drawn while no test is chosen', JSON.stringify(base.map((d) => d.bone)));
  const tests = [['ctl', 1], ['pre16', 2], ['pre54', 3], ['pre150', 4], ['pref8k', 5], ['ch54', 6], ['ch400', 7], ['chf30k', 8], ['chf100k', 9], ['big1', 10], ['big300', 11], ['big599', 12]];
  const bad = [];
  for (const [bone, k] of tests) { const s = shown(frame('geoui_probe_m', 'gprobm', { v2: k })); if (!(s.length === 1 && s[0].bone === bone)) bad.push(`${k} ${bone}: ${JSON.stringify(s.map((d) => d.bone))}`); }
  ok(!bad.length, `geoui_probe_m: each of ${tests.length} tests draws its own plane only`, bad.join('\n  '));
  const dir = path.join(TOP, 'bds/addons/geoui_probe_m/rp'), big = rd(dir, 'models/entity/gprobm/big.geo.json')['minecraft:geometry'][0];
  const len = (f) => fs.readFileSync(path.join(dir, 'animations', f), 'utf8').length;
  ok(big.bones.length === 600 && big.bones.findIndex((b) => b.name === 'big599') === 599 && len('gprobm_chf100k.animation.json') > 100000, 'geoui_probe_m: the big geometry has 600 bones (big599 the last), the longest channel 100 000 characters');
}

// ---- geoui_probe_tl: compile.js's own pack, paused at 2, 4 and 6 s: the track's bar and the instances' dots where they belong
{
  const tl = (props) => shown(frame('geoui_probe_tl', 'gprobt', props));
  const run = (from) => ({ seq: 1, seq_gen: 1, seq_from: from * 1000, seq_pause: 1 });
  const idle = tl({ seq: 0 });
  ok(idle.length === 2 && idle.some((d) => d.bone === 'bar') && idle.some((d) => d.bone === 'dot'), 'geoui_probe_tl: idle, the design as it is (the bar and the template\'s dot) — the baseline', JSON.stringify(idle.map((d) => d.bone)));
  const bad = [];
  for (const [from, want] of [[2, [['bar', [-140, 85]], ['dot', [-125, 115], 10]]], [4, [['bar', [-120, 85]], ['dot', [-90, 115], 10]]], [6, [['bar', [-100, 85]], ['dot', [-55, 115], 10], ['dot', [-20, 115], 10]]]]) {
    const s = tl(run(from));
    const okAll = s.length === want.length && want.every(([b, at, size]) => s.some((d) => d.bone.startsWith(b) && (b === 'bar' ? d.bone === 'bar' : d.bone !== 'dot') && near(d, at, size)));
    if (!okAll) bad.push(`st ${from}: ${JSON.stringify(s.map((d) => [d.bone, d.quad]))}`);
  }
  ok(!bad.length, 'geoui_probe_tl: paused at 2 / 4 / 6 s, the bar is 20 / 40 / 60 units on and the dots of the instances out then are in their cells (copies, not the dot)', bad.join('\n  '));
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-probe-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
