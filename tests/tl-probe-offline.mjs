#!/usr/bin/env node
// GeoUI timeline's probes (bds/geoui/timeline/probe.mjs → bds/addons/geoui_probe*), no network: the add-ons are what probe.mjs
// makes, and each test's plane is shown by the pack's own Molang only while its number is chosen — the pack's pre_animation
// run in GeoUI Builder's evaluator the way the game runs it (it stops at a line that reads a variable never set), every
// animation's channels added up (scale multiplied), each render controller's part_visibility, colour alpha and uv_anim applied —
// so that a plane the real app does not draw says something about the game, not about the probe. node tests/tl-probe-offline.mjs
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
  const defaults = { aspect: 2167, scale: 100, cx: 0, cy: 0, ox: 0, oy: 0, alpha: 100, v0: 0, v1: 0, v2: 0, v3: 0 };
  const p = Object.fromEntries(Object.entries({ ...defaults, ...props }).map(([k, v]) => [`${ns}:${k}`, v]));
  const env = G.envOf({ props: p, lifeTime });
  const pre = ent.scripts.pre_animation.filter((l) => !/^variable\.|^Math\./.test(l));
  for (let f = 0; f < frames; f++) G.runPre(pre, env, { stopAtUnset: true, ours: /^variable\.(gp|geoui_)/ });   // (twice: a latch settles)
  const M = (e) => G.molang(e, env), v3 = (v, d) => (v === undefined ? [d, d, d] : Array.isArray(v) ? [0, 1, 2].map((i) => M(v[i] ?? d)) : [M(v), M(v), M(v)]);
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
const mid = (d) => [(d.quad.x0 + d.quad.x1) / 2, (d.quad.y0 + d.quad.y1) / 2];
const near = (d, [x, y], size = 14) => Math.abs(mid(d)[0] - x) < 0.01 && Math.abs(mid(d)[1] - y) < 0.01 && Math.abs(d.quad.x1 - d.quad.x0 - size) < 0.01;
const COLS = [-160, -125, -90, -55, -20, 15, 50], ROWS = [175, 145, 115, 85], cellAt = (i) => [COLS[i % 7], ROWS[Math.floor(i / 7)]];

// ---- geoui_probe: each test alone in its cell; canary 6 (after the deliberate unset read) never; the clocks move
{
  const base = shown(frame('geoui_probe', 'gprobe', { v2: 0 }));
  ok(base.length === 0, 'geoui_probe: nothing is drawn while no test is chosen (the baseline the app compares with)', JSON.stringify(base.map((d) => d.bone)));
  const names = ['ctl', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'clockpre', 'clockanim', 'lifepre', 'animpre', 'ownalpha', 'alpha0', 'ownuv', 'uvconst', 'ownproto_t0s0', 'line700', 'b121', 'b126', 'ownblend'];
  const bad = [];
  names.forEach((bone, i) => {
    const k = i + 1, s = shown(frame('geoui_probe', 'gprobe', { v2: k })), at = cellAt(i);
    const want = bone === 'c6' || bone === 'alpha0' ? 0 : 1;   // (c6: the game stops before it; alpha0: drawn only where colour alpha is ignored)
    const inRow = (d) => Math.abs(mid(d)[1] - at[1]) < 0.01;   // (the clocks and the pre_animation readings move along their row)
    const good = s.length === want && (!want || (s[0].bone === bone && (['clockpre', 'clockanim', 'lifepre', 'animpre'].includes(bone) ? inRow(s[0]) : near(s[0], at))));
    if (!good) bad.push(`${k} ${bone}: ${JSON.stringify(s.map((d) => [d.bone, d.id, mid(d)]))}`);
  });
  ok(!bad.length, `geoui_probe: each of ${names.length} tests draws its own plane in its own cell and nothing else (canary 6 and alpha 0 none)`, bad.join('\n  '));
  const geo = rd(path.join(TOP, 'bds/addons/geoui_probe/rp/models/entity/gprobe'), 'probe.geo.json')['minecraft:geometry'][0], idx = (b) => geo.bones.findIndex((x) => x.name === b);
  ok(geo.bones.length === 249 && idx('b121') === 121 && idx('b126') === 126 && idx('ownproto_t0s0') === 140, 'geoui_probe: 249 bones, #121, #126 and the slot copy at #140');
  const f7 = frame('geoui_probe', 'gprobe', { v2: 7 });
  ok(f7.env.stoppedAt !== undefined && f7.env.vars['variable.gp_c5'] === 1 && f7.env.vars['variable.gp_c6'] === undefined && f7.env.vars['variable.gp_l'] === 0,
    'geoui_probe: the pre_animation stops at the deliberate read of a variable never set (canary 5 set, canary 6 not; line 700 ran)');
  const x = (k, life) => { const s = shown(frame('geoui_probe', 'gprobe', { v2: k }, { lifeTime: life })); return s.length ? mid(s[0])[0] : null; };
  // (the ?? clock latches q.life_time when its test is chosen: the first frame chooses it, the next is 1.5 s later)
  const clock = (() => {
    const dir = path.join(TOP, 'bds/addons/geoui_probe/rp'), pre = rd(dir, 'entity/player.entity.json')['minecraft:client_entity'].description.scripts.pre_animation.filter((l) => !/^variable\.|^Math\./.test(l));
    const p = { 'gprobe:v2': 0 }, env = G.envOf({ props: p, lifeTime: 100 }), run = () => G.runPre(pre, env, { stopAtUnset: true, ours: /^variable\.(gp|geoui_)/ });
    run(); p['gprobe:v2'] = 8; run();
    const q0 = env.query; env.query = (nm, a) => (nm === 'query.life_time' ? 101.5 : q0(nm, a)); run();
    return env.vars['variable.gp_cl'];
  })();
  ok(Math.abs(clock - 1.5) < 1e-9 && x(1, 100) === -160, 'geoui_probe: the pre_animation clock (?? latch) counts from the moment its test is chosen (1.5 s → 22.5 units)', `cl ${clock}`);
}

// ---- geoui_probe_m: each expression's plane and its canary only when chosen
{
  const base = shown(frame('geoui_probe_m', 'gprobm', { v2: 0 }));
  ok(base.length === 0, 'geoui_probe_m: nothing is drawn while no test is chosen', JSON.stringify(base.map((d) => d.bone)));
  const names = ['ctl', 'd54', 'd54_c', 'f6k', 'f6k_c', 'f8k', 'f8k_c', 'f12k', 'f12k_c', 'd100', 'd100_c', 'f16k', 'f16k_c'], bad = [];
  names.forEach((bone, i) => { const s = shown(frame('geoui_probe_m', 'gprobm', { v2: i + 1 })); if (!(s.length === 1 && s[0].bone === bone && near(s[0], cellAt(i)))) bad.push(`${i + 1} ${bone}: ${JSON.stringify(s.map((d) => d.bone))}`); });
  ok(!bad.length, `geoui_probe_m: each of ${names.length} tests draws its own plane only`, bad.join('\n  '));
  const pre = rd(path.join(TOP, 'bds/addons/geoui_probe_m/rp'), 'entity/player.entity.json')['minecraft:client_entity'].description.scripts.pre_animation, len = (id) => pre.find((l) => l.startsWith(`v.gpm_${id} =`)).length;
  ok(len('f8k') > 8000 && len('f16k') > 16000 && len('f6k') < 6100, `geoui_probe_m: the expressions are as long as they say (f6k ${len('f6k')} … f16k ${len('f16k')})`);
}

// ---- geoui_probe_tl: compile.js's own pack, paused at 2, 4 and 6 s: the track's bar and the instances' dots where they belong
{
  const tl = (props) => shown(frame('geoui_probe_tl', 'gprobt', props));
  const run = (from) => ({ seq: 1, seq_gen: 1, seq_from: from * 1000, seq_pause: 1 });
  const idle = tl({ seq: 0 });
  ok(idle.length === 1 && idle[0].bone === 'bar', 'geoui_probe_tl: idle, the design without the template\'s dot (a prototype never shows) — the baseline', JSON.stringify(idle.map((d) => d.bone)));
  const bad = [];
  for (const [from, want] of [[2, [['bar', [-140, 85]], ['dot', [-125, 115], 10]]], [4, [['bar', [-120, 85]], ['dot', [-90, 115], 10]]], [6, [['bar', [-100, 85]], ['dot', [-55, 115], 10], ['dot', [-20, 115], 10]]]]) {
    const s = tl(run(from));
    const okAll = s.length === want.length && want.every(([b, at, size]) => s.some((d) => d.bone.startsWith(b) && (b === 'bar' ? d.bone === 'bar' : d.bone !== 'dot') && near(d, at, size)));
    if (!okAll) bad.push(`st ${from}: ${JSON.stringify(s.map((d) => [d.bone, d.quad]))}`);
  }
  ok(!bad.length, 'geoui_probe_tl: paused at 2 / 4 / 6 s, the bar is 20 / 40 / 60 units on and the dots of the instances out then are in their cells (copies, not the dot)', bad.join('\n  '));
  const ent = rd(path.join(TOP, 'bds/addons/geoui_probe_tl/rp'), 'entity/player.entity.json')['minecraft:client_entity'].description;
  const unset = G.unsetReads(ent.scripts.pre_animation, { init: ent.scripts.initialize, ours: /^variable\.(geoui|gprobt)_/ });
  ok(!unset.length, 'geoui_probe_tl: compile.js\'s pre_animation reads no variable before it is set (the game would stop there)', unset.join(', '));
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-probe-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
