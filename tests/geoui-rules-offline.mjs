#!/usr/bin/env node
// GeoUI's rules (bds/geoui/RULES.md) and the probe that decides the open ones (bds/geoui/screen/rules.mjs → bds/addons/geoui_rules),
// no network, no game:
//   pack       the probe is what rules.mjs makes; it builds with no warning; its Molang parses and reads nothing unset; the player's
//              scale in the UI follows grl:sc and nowhere else (the paper doll, the world: 0.9375); minecraft:scale by an event
//   predict    the predictions written before the run: the unit goes as 160 / scale, the two hypotheses for the origin, the GUI
//              scale's two rules — both hold on the 10 screens measured (run 39989463030) and part on the 6 the probe adds
//   frame      Studio's frame in px: the screen's middle is the model's (0, 135.04) on 1560 x 720 — what `measure color` boxes use
//   verdict    a run that agrees, and one that does not, read back the right way
//   api        every GeoUI Screen pack asks for the @minecraft/server version of the newest API its script uses (R7.1)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = require('../bds/geoui/geoui_builder.js'), P = require('../bds/geoui/screen/pack.js');
const R = await import('../bds/geoui/screen/rules.mjs');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${String(d).split('\n').slice(0, 12).join('\n  ')}`}`); };

// ---- pack
const built = P.build(R.scene(), { core: G }), f = built.files;
{
  let fresh = true, why = '';
  try { execFileSync(process.execPath, [path.join(TOP, 'bds/geoui/screen/rules.mjs'), '--check'], { stdio: 'pipe' }); } catch (e) { fresh = false; why = String(e.stderr || e.message); }
  ok(fresh, 'bds/addons/geoui_rules is what rules.mjs makes', why);
  ok(built.warnings.length === 0, 'the probe builds with no warning (no group in another\'s renderer, the API version it needs)', built.warnings.join('\n'));
  const ent = JSON.parse(f['rp/entity/player.entity.json'])['minecraft:client_entity'].description;
  const ours = ent.scripts.pre_animation.filter((l) => l.includes('grl_'));
  ok(ours.every((l) => G.molangError(l.replace(/;\s*$/, '')) === null) && G.molangError(ent.scripts.scale) === null, 'its Molang parses (pre_animation and the scale script)');
  ok(G.unsetReads(ent.scripts.pre_animation, { init: ent.scripts.initialize, ours: /^variable\.grl_/ }).length === 0, 'it reads no variable before setting it');
  const scaleOf = (props, o = {}) => {
    const env = G.envOf({ props, isInUi: o.ui ?? 1, isPaperdoll: o.doll ?? 0 });
    G.runPre(ours, env);
    return G.molang(ent.scripts.scale, env);
  };
  ok(scaleOf({ 'grl:sc': 5000 }) === 0.5 && scaleOf({ 'grl:sc': 5000 }, { doll: 1 }) === 0.9375 && scaleOf({ 'grl:sc': 5000 }, { ui: 0 }) === 0.9375 && scaleOf({ 'grl:sc': 9375 }) === 0.9375,
    'the player\'s scale: grl:sc / 10000 in the UI, 0.9375 on the paper doll and in the world (vanilla\'s scripts.scale)');
  const be = JSON.parse(f['bp/entities/player.json'])['minecraft:entity'];
  ok(be.component_groups['grl:small']['minecraft:scale'].value === 0.5 && be.events['grl:small'].add.component_groups[0] === 'grl:small' && be.events['grl:normal'].remove.component_groups[0] === 'grl:small',
    'minecraft:scale 0.5 by the event grl:small (as another add-on would set it), off again by grl:normal');
  const geo = JSON.parse(f['rp/models/entity/grl/pal.geo.json'])['minecraft:geometry'][0];
  const tilt = geo.bones.find((b) => b.name === 'grl_tilt_up45'), t = R.TILT.find((x) => x.id === 'up45');
  ok(tilt && JSON.stringify(tilt.rotation) === JSON.stringify([-45, 0, 0]) && tilt.pivot[0] === t.x && tilt.pivot[1] === t.y, 'a tilted plane turns about its own middle (pivot at its centre, model units)');
  ok(geo.bones.every((b) => !['root', 'waist', 'body', 'head'].includes(b.parent || '')), 'no GeoUI bone hangs off a vanilla bone (the pose animations move root, arms and head only: R2.3)');
}

// ---- predict
const pr = R.predictions();
{
  ok(pr.scale.every((p) => Math.abs(p.unitsPerScreenH * p.scale - 160) < 1e-3), 'R4.1\'s prediction: the screen is 160 / scale model units high in Studio\'s frame (170.67 at 0.9375)');
  const v = pr.scale.find((p) => p.scale === 0.9375);
  ok(Math.abs(v.centreY_M - 135.04) < 0.05 && v.centreY_M === v.centreY_W, 'at the vanilla scale both hypotheses for the origin give the measured centre 135.04');
  ok(pr.scale.filter((p) => Math.abs(p.centreY_M - p.centreY_W) > 5).length >= 2, 'and at 0.5 and 1.5 they are more than 5 units apart: the run tells them apart');
  const measured = [[1024, 768, 3], [1104, 920, 3], [1280, 800, 3], [1560, 720, 3], [1920, 1080, 4], [2160, 1080, 4], [2340, 1080, 4], [2400, 1080, 4], [2520, 1080, 4], [3840, 1080, 4]];
  ok(measured.every(([W, H, u]) => R.guiRuleA(W, H) === u && R.guiRuleB(W, H) === u), 'both GUI scale rules agree with the 10 screens measured (run 39989463030)');
  ok(pr.gui.filter((g) => g.A !== g.B).length >= 2 && pr.gui.some((g) => g.W === 1280 && g.A === 4) && pr.gui.some((g) => g.W === 1279 && g.A === 3), 'the probe\'s 6 screens part the two rules and stand on each one\'s edges');
}

// ---- frame
{
  const c = R.studioRect({ x: 0, y: 135.0333, w: 0, h: 0 }, 1560, 720);
  ok(Math.abs(c.x0 - 780) < 0.01 && Math.abs(c.y0 - 360) < 0.05, 'Studio\'s frame: the model\'s (0, 135.04) is the middle of a 1560 x 720 screen', JSON.stringify(c));
  const box = R.studioRect(R.RAMP[4], 1560, 720);
  ok(Math.abs((box.x1 - box.x0) - 30 * 0.9375 / 16 * 72) < 1e-9, 'a 30-unit patch is 30 x K x 72 px wide (the panel\'s shorter side 10 % of 720)');
  const app = f['app.txt'] || R.appTxt();
  const shots = [...app.matchAll(/^shot (\S+)/gm)].map((m) => m[1]), measured = [...app.matchAll(/^measure \w+ (\S+)/gm)].map((m) => m[1]);
  ok(measured.every((s) => shots.includes(s)), 'every measured shot is taken first in app.txt');
  ok((app.match(/^measure color /gm) || []).length === 4 * (R.RAMP.length + R.TILT.length) + R.RAMP.length && (app.match(/^measure geoui /gm) || []).length === R.SCALES.length + 8,
    'app.txt measures 14 patches under 4 lights, the ramp once hurt, and the grid at 5 scales, small, 6 poses and invisible');
}

// ---- verdict
{
  const mk = (ver) => {
    const m = [];
    for (const p of pr.scale) m.push({ shot: p.shot, kind: 'geoui', ok: true, values: { unitsPerScreenH: ver.unit(p), centreY: ver.centre(p) } });
    m.push({ shot: 'cal-small', kind: 'geoui', ok: true, values: { unitsPerScreenH: ver.small, centreY: 135 } });
    for (const p of pr.poses) m.push({ shot: p.shot, kind: 'geoui', ok: true, values: { unitsPerScreenH: p.unitsPerScreenH * (1 + (ver.poseMove && p.shot === 'cal-sneak' ? 0.02 : 0)), centreY: p.centreY } });
    for (const g of pr.gui) m.push({ shot: g.shot, kind: 'marks', ok: true, values: { violetx0: 100, violetx1: 100 + 182 * ver.gui(g) } });
    for (const cond of pr.light.conditions) for (const r of [...R.RAMP, ...R.TILT]) m.push({ shot: `${R.RAMP.includes(r) ? 'ramp' : 'tilt'}-${cond}`, kind: 'color', ok: true, values: { r: (r.grey ?? 255) * 0.76, g: (r.grey ?? 255) * 0.76, b: (r.grey ?? 255) * 0.76 } });
    for (const r of R.RAMP) m.push({ shot: 'ramp-hurt', kind: 'color', ok: true, values: { r: r.grey * 0.76 + (ver.red || 0), g: r.grey * 0.76, b: r.grey * 0.76 } });
    m.push({ shot: 'cal-invisible', kind: 'geoui', ok: ver.inv, values: {}, why: 'no grid' });
    return R.verdict(m);
  };
  const get = (rows, id) => rows.find((x) => x.rule === id);
  const good = mk({ unit: (p) => p.unitsPerScreenH * 1.001, centre: (p) => p.centreY_W, small: pr.entityScale.ignores.unitsPerScreenH, gui: (g) => g.A, inv: true });
  ok(get(good, 'R4.1').result === '成り立つ' && /^W/.test(get(good, 'R4.2').result) && get(good, 'R4.8').result === '付いてこない' && get(good, 'R2.3').result === '成り立つ'
    && get(good, 'R5.3').result === 'A' && get(good, 'R3.8').result.startsWith('赤くならなかった') && get(good, 'R3.9').result === '描かれる' && /0\.760/.test(get(good, 'R3.7').detail),
    'verdict: a run that agrees reads as held (R4.1), W (R4.2), not followed (R4.8), still (R2.3), rule A (R5.3), no red (R3.8), drawn (R3.9), the light 0.76', JSON.stringify(good.map((x) => [x.rule, x.result])));
  const bad = mk({ unit: () => 170.6667, centre: (p) => p.centreY_M, small: pr.entityScale.follows.unitsPerScreenH, gui: (g) => g.B, inv: false, poseMove: true, red: 60 });
  ok(get(bad, 'R4.1').result === '成り立たない' && get(bad, 'R4.8').result.startsWith('付いてくる') && get(bad, 'R2.3').result.startsWith('動いた') && get(bad, 'R5.3').result === 'B'
    && get(bad, 'R3.8').result === '赤くなった' && get(bad, 'R3.9').result.startsWith('描かれない'),
    'and a run that does not, reads as fell: the unit not following the scale, the body\'s scale followed, sneaking moved it, rule B, red, not drawn', JSON.stringify(bad.map((x) => [x.rule, x.result])));
  ok(R.verdict([]).every((x) => /測れなかった|値/.test(x.result)), 'with nothing measured every rule says so (never a guess)');
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
