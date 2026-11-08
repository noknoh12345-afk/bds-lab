// A picture of the match HUD as the game will draw it, without the game: the HUD's own Molang run (GeoUICore: GeoUI's
// pre_animation and ours, the transform and layout animations), every visible plane placed, the digit and tower-picture planes
// moved to their row and cell as their render controllers would, drawn over a stand-in scene (tools/hud_preview.py).
//   node tools/hud_preview.mjs [match|tower|lobby|triumph|all] [--aspect 1.778] [--out file.png]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { built, pre, digitBones, portraitBones } from './hud.mjs';
const require = createRequire(import.meta.url);
const C = require('../../../geoui/geoui_builder.js');
const HERE = path.dirname(new URL(import.meta.url).pathname), ADDON = path.resolve(HERE, '..');
const PORT = JSON.parse(fs.readFileSync(path.join(HERE, 'art/portraits.json'), 'utf8'));
const DIG = JSON.parse(fs.readFileSync(path.join(HERE, 'art/hud_atlas.json'), 'utf8'));
const argv = process.argv.slice(2), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const which = argv.find((a) => !a.startsWith('--') && !/^\d/.test(a) && a !== opt('--out', '') && a !== opt('--aspect', '')) ?? 'all';
const aspect = Number(opt('--aspect', 1.778)), out = opt('--out', path.join(ADDON, '..', '..', '.lab', 'render', `hud_preview_${which}.png`));
const T = (n) => PORT.names.indexOf(n);

const pack = (o) => {
  const sel = o.sel ?? 0, votes = o.votes ?? 0, need = o.need ?? 1, skip = o.skip ?? 0, t = o.t ?? [99, 99, 99, 99, 99], tsel = o.tsel ?? 99;
  return { alpha: 100, scale: 100, mode: o.mode ?? 0, wt: (o.wave ?? 0) * 100 + (o.total ?? 0), timer: o.timer ?? 0, hp: o.hp ?? 0, hpmax: o.hpmax ?? 1, cash: o.cash ?? 0,
    eb: (o.enemies ?? 0) * 1000 + (o.boss ?? 0), misc: sel + 8 * votes + 80 * need + 800 * skip, t123: t[0] + 100 * t[1] + 10000 * t[2], t45: t[3] + 100 * t[4] + 10000 * tsel,
    c1: o.c?.[0] ?? 0, c2: o.c?.[1] ?? 0, c3: o.c?.[2] ?? 0, c4: o.c?.[3] ?? 0, c5: o.c?.[4] ?? 0, bn: o.bn ?? 0, tinfo: o.tinfo ?? 0, tup: o.tup ?? 0, tsell: o.tsell ?? 0, rew: o.rew ?? 0, rgems: o.rgems ?? 0 };
};
const loadout = { t: [T('Scout'), T('Sniper'), T('Minigunner'), T('Farm'), 99], c: [200, 300, 1300, 250, 0] };
export const STATES = {
  match: pack({ mode: 0, wave: 12, total: 20, timer: 45, hp: 150, hpmax: 200, cash: 2350, enemies: 17, boss: 64, sel: 2, skip: 1, votes: 0, need: 1, ...loadout, bn: 1020 }),
  tower: pack({ mode: 3, wave: 27, total: 35, timer: 128, hp: 61, hpmax: 200, cash: 18420, enemies: 143, sel: 0, ...loadout, tsel: T('Sniper'), tinfo: 10000 + 2 * 100 + 4 * 10 + 0, tup: 950, tsell: 412 }),
  lobby: pack({ mode: 15, wave: 12, hp: 340, hpmax: 600, cash: 12500, rgems: 37 }),
  triumph: pack({ mode: 0, wave: 20, total: 20, timer: 0, hp: 200, hpmax: 200, cash: 9120, ...loadout, bn: 2030, rew: 350 * 1000 + 125, rgems: 12 }),
};

/** the quads drawn for one state: [texture, src x, y, w, h, dst x0, y0, x1, y1 (model), z] */
function quads(props) {
  const p = {}; for (const [k, v] of Object.entries(props)) p[`tdsui:${k}`] = v;
  const S = built.settings, fix = S.centerFix.desktop;
  p['tdsui:aspect'] = Math.round(aspect * 1000); p['tdsui:cx'] = Math.round(fix.x * 10000); p['tdsui:cy'] = Math.round(fix.y * 10000); p['tdsui:ox'] = 0; p['tdsui:oy'] = 0;
  const env = C.envOf({ props: p });
  C.runPre(built.pre, env); C.runPre(pre, env);
  // the transform animation and ours, on the same bones: positions add, scales multiply (bds/geoui/SPEC.md)
  const anims = [built.animation, ...Object.entries(JSON.parse(built.files[Object.keys(built.files).find((f) => /animations\//.test(f))]).animations).filter(([n]) => n !== 'animation.tdsui_transform').map(([, a]) => a)];
  const vec = (x, d) => (x === undefined ? [d, d, d] : Array.isArray(x) ? x : [x, x, x]);
  const merged = {};
  for (const a of anims) for (const [b, t] of Object.entries(a.bones || {})) {
    const m = (merged[b] ??= {});
    if (t.position) { const q = vec(t.position, 0); m.position = m.position ? m.position.map((e, i) => `(${e})+(${q[i]})`) : q.map(String); }
    if (t.scale !== undefined) { const q = vec(t.scale, 1); m.scale = m.scale ? m.scale.map((e, i) => `(${e})*(${q[i]})`) : q.map(String); }
  }
  const geos = built.geometries.map((g) => g['minecraft:geometry'][0]);
  const { quads: qs } = C.pose(geos, { bones: merged }, env);
  const val = (v) => C.molang(v, env);
  const dig = new Map(digitBones.map((d) => [d.name, d])), por = new Map(portraitBones.map((d) => [d.name, d]));
  const outq = [];
  for (const q of qs) {
    if (q.hidden) continue;
    const g = geos[q.geometry], tex = g.description.identifier.replace('geometry.tdsui_', ''), cube = g.bones.find((b) => b.name === q.bone).cubes[q.cube];
    let [u, v] = cube.uv.north.uv; const [uw, uh] = cube.uv.north.uv_size;
    if (tex === 'digits') { const k = val(dig.get(q.bone).v); if (!(k >= 0 && k <= 9)) continue; v += k * (DIG.digits.height / 10); }
    if (tex === 'towers') { const i = val(por.get(q.bone).idx); if (!(i >= 0 && i < 99)) continue; u += (i % PORT.cols) * PORT.cell; v += Math.floor(i / PORT.cols) * PORT.cell; }
    outq.push([tex, u, v, uw, uh, q.quad.x0, q.quad.y0, q.quad.x1, q.quad.y1, q.quad.z]);
  }
  return { quads: outq, halfw: C.halfWAt(S, aspect) };
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const names = which === 'all' ? Object.keys(STATES) : [which];
  const job = { aspect, out, textures: Object.fromEntries(['hud', 'digits', 'towers'].map((t) => [t, path.join(ADDON, 'rp/textures/tdsui', `${t}.png`)])),
    shots: names.map((n) => ({ name: n, ...quads(STATES[n]) })) };
  const jf = path.join(os.tmpdir(), `hud_preview_${process.pid}.json`);
  fs.writeFileSync(jf, JSON.stringify(job));
  const r = spawnSync('python3', ['-I', path.join(HERE, 'hud_preview.py'), jf], { encoding: 'utf8' });
  process.stdout.write(r.stdout + r.stderr);
  fs.rmSync(jf, { force: true });
}
