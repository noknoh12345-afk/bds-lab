#!/usr/bin/env node
// GeoUI timeline — the probe: what the real game does with the things the timeline's export leans on, measured in the real app
// (bds-lab's app.txt: shoot, then `measure diff` — where the screen changed, as numbers). Three add-ons, each GeoUI Builder's
// own export with test planes (14 x 14 units, one cell each) shown one at a time: app.txt sets <ns>:v2 to a test's number,
// waits, shoots; the plane drew if the screen changed in its cell. `node probe.mjs read <summary.json>…` says which drew.
//   geoui_probe     the structure: a bone's index in a 249-bone geometry (geoui_rhythm's size), bones drawn by their own render
//                   controller (part_visibility on the shared geometry; blend; colour alpha; uv_anim; a slot copy made the way
//                   compile.js makes them; the 31st such controller), q.life_time in pre_animation and q.anim_time / q.life_time
//                   in an animation (planes that move 15 units a second), a variable set on pre_animation line 700
//   geoui_probe_m   Molang: long and deep expressions in pre_animation and in animation channels; a 600-bone geometry
//   geoui_probe_tl  compile.js's own output: a sequence's track and a template's slots at fixed times (play then pause) and running
// Everything here is the lab's own. node bds/geoui/timeline/probe.mjs [--check] | read <summary.json>…
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const G = require('../geoui_builder.js');
require('./model.js'); require('./contract.js'); require('./media.js');
const C = require('./compile.js'), R = require('./runtime.js');
const J = (o) => `${JSON.stringify(o, null, 2)}\n`;
const parse = (s) => JSON.parse(typeof s === 'string' ? s : JSON.stringify(s));

// ---- the texture: 64 x 64 in 16-px cells. Row 0: a flipbook of four frames (clear, red, green, blue: uv_anim's test, 4 x 4);
//      row 1: white (the test planes), yellow, magenta, grey (the fillers)
const TW = 64, img = new Uint8Array(TW * TW * 4);
const fill = (x0, y0, rgba) => { for (let y = y0; y < y0 + 16; y++) for (let x = x0; x < x0 + 16; x++) img.set(rgba, (y * TW + x) * 4); };
fill(16, 0, [255, 40, 40, 255]); fill(32, 0, [40, 255, 40, 255]); fill(48, 0, [40, 80, 255, 255]);
fill(0, 16, [255, 255, 255, 255]); fill(16, 16, [255, 230, 40, 255]); fill(32, 16, [255, 40, 255, 255]); fill(48, 16, [128, 128, 128, 255]);
const PNG = encodePng({ width: TW, height: TW, data: img }).toString('base64');
const UV = { clear: [0, 0], white: [0, 16], yellow: [16, 16], magenta: [32, 16], grey: [48, 16] };

// ---- the cells: 7 x 4 in model units (the screen's middle is near (0, 140); x > 60 is left out: the first-person hand moves there)
const COLS = [-160, -125, -90, -55, -20, 15, 50], ROWS = [175, 145, 115, 85], SIZE = 14;
const cell = (c, r) => [COLS[c], ROWS[r]];
const plane = (name, [cx, cy], { uv = UV.white, z = 0, tex = 'probe', size = SIZE, parent = 'geo_ui' } = {}) => ({ name, parent, pivot: [cx, cy, z],
  cubes: [{ origin: [cx - size / 2, cy - size / 2, z], size: [size, size, 0], faces: { north: { uv, uv_size: [16, 16], texture: tex } } }] });
const filler = (name, tex = 'probe') => ({ name, parent: 'geo_ui', pivot: [-400, 140, 0], cubes: [{ origin: [-400, 140, 0], size: [1, 1, 0], faces: { north: { uv: UV.grey, uv_size: [16, 16], texture: tex } } }] });
const ALL = 99, sel = (k) => `(v.gp_t == ${k} || v.gp_t == ${ALL})`, on = (k) => `${sel(k)} ? 1 : 0`;
const settings = (ns, name) => ({ ns, name, description: `GeoUI probe (bds-lab): ${name}`, bp: true, calibration: G.MEASURED.id });

/** the base controller of the texture `tex` stops drawing some bones; each gets a controller of its own (compile.js's way) */
function ownControllers(files, ns, tex, list) {
  const rcf = `${ns}_RP/render_controllers/${ns}.render_controllers.json`, entf = `${ns}_RP/entity/player.entity.json`;
  const rc = parse(files[rcf]), ent = parse(files[entf]), dsc = ent['minecraft:client_entity'].description, id = `controller.render.${ns}_${tex}`;
  const base = rc.render_controllers[id], cond = dsc.render_controllers.find((x) => typeof x === 'object' && x[id])[id];
  base.part_visibility = [{ '*': true }, ...list.map((o) => ({ [o.bone]: false }))];
  const add = [];
  for (const o of list) {
    const c = parse(base);
    c.part_visibility = [{ '*': false }, { [o.bone]: true }];
    if (o.blend) c.materials = [...c.materials, { [o.bone]: `material.${ns}_blend` }];
    if (o.alpha) c.color = Object.assign({}, c.color, { a: `${c.color.a} * ${o.alpha}` });
    if (o.uv) c.uv_anim = { offset: o.uv, scale: [1, 1] };
    rc.render_controllers[`${id}_${o.bone}`] = c; add.push({ [`${id}_${o.bone}`]: cond });
  }
  dsc.render_controllers = [...dsc.render_controllers, ...add];
  files[rcf] = J(rc); files[entf] = J(ent);
}
const addPre = (files, ns, lines) => { const f = `${ns}_RP/entity/player.entity.json`, e = parse(files[f]); e['minecraft:client_entity'].description.scripts.pre_animation.push(...lines); files[f] = J(e); };

// ---------------------------------------------------------------------------------------------------------------- the probes
/** geoui_probe: the structure. Bones in this order: the tests at fixed indices, fillers between (249 in all, as geoui_rhythm) */
function probeStructure() {
  const ns = 'gprobe', tests = [
    { k: 1, id: 'ctl', at: cell(0, 0), bone: 1, what: '基準: ボーン #1・共有の render controller・scale で出し入れ' },
    { k: 2, id: 'clockpre', at: cell(1, 0), clock: true, what: 'pre_animation の q.life_time（選んでからの秒 x 15 単位、右へ）' },
    { k: 3, id: 'clockanim', at: cell(2, 0), clock: true, what: 'アニメーションの中の q.anim_time（選ぶと始まるアニメーション: 秒 x 15 単位、右へ）' },
    { k: 4, id: 'clocklife', at: cell(3, 0), clock: true, what: 'アニメーションの中の q.life_time（動けば「アニメーションが始まってから」、+90 で止まれば実体の寿命）' },
    { k: 5, id: 'b60', at: cell(0, 1), bone: 60, what: 'ボーン #60（共有の render controller）' },
    { k: 6, id: 'b115', at: cell(1, 1), bone: 115, what: 'ボーン #115' },
    { k: 7, id: 'b121', at: cell(2, 1), bone: 121, what: 'ボーン #121（geoui_rhythm で映った最後の番号）' },
    { k: 8, id: 'b122', at: cell(3, 1), bone: 122, what: 'ボーン #122（geoui_rhythm で枠の複製が始まった番号）' },
    { k: 9, id: 'b126', at: cell(0, 2), bone: 126, what: 'ボーン #126' },
    { k: 10, id: 'b130', at: cell(1, 2), bone: 130, what: 'ボーン #130' },
    { k: 11, id: 'b200', at: cell(2, 2), bone: 200, what: 'ボーン #200' },
    { k: 12, id: 'b248', at: cell(3, 2), bone: 248, what: 'ボーン #248（249 本の最後）' },
    { k: 13, id: 'own1', at: cell(4, 0), bone: 2, what: '自分の render controller（共有のジオメトリに part_visibility）・cutout' },
    { k: 14, id: 'ownblend', at: cell(5, 0), bone: 3, what: '自分の render controller・blend（ボーンの名前でマテリアル）' },
    { k: 15, id: 'ownalpha', at: cell(6, 0), bone: 4, what: '自分の render controller・color.a を変数で（scale は 1 のまま、不透明度だけで出し入れ）' },
    { k: 16, id: 'ownuv', at: cell(4, 1), bone: 5, what: '自分の render controller・uv_anim の offset を式で（コマ 0 は透明、選ぶとコマ 2）' },
    { k: 17, id: 'ownclone', at: cell(5, 1), bone: 140, what: 'compile.js と同じ作りの枠の複製（ボーン #140・原型の名前_t0s0・奥へ 0.021・その render controller）' },
    { k: 18, id: 'own31', at: cell(6, 1), bone: 6, what: '31 個目の自分の render controller（6〜30 個目は何も描かない複製）' },
    { k: 19, id: 'line700', at: cell(4, 2), bone: 10, what: 'pre_animation の 700 行目の変数で出し入れ' },
  ];
  const N = 249, byIndex = new Map(), bones = new Array(N);
  bones[0] = { name: 'geo_ui', pivot: [0, 140, 0] };
  for (const t of tests) if (t.bone !== undefined) byIndex.set(t.bone, t);
  for (const t of tests) if (t.clock) { const free = [7, 8, 9].find((i) => !byIndex.has(i)); byIndex.set(free, t); t.bone = free; }
  for (const t of tests) if (t.id === 'ownclone') t.proto = 11;   // (its prototype, never shown: the clone is moved from it to its cell)
  const dummies = Array.from({ length: 25 }, (_, i) => 12 + i);   // (bones 12…36: the do-nothing own controllers 6…30)
  for (let i = 1; i < N; i++) {
    const t = byIndex.get(i);
    if (t && t.id === 'ownclone') bones[i] = Object.assign(plane('ownproto_t0s0', [0, 140], { z: 0.021 }), { pivot: [0, 140, 0] });
    else if (t) bones[i] = plane(t.id, t.at, { uv: t.id === 'ownuv' ? UV.clear : UV.white });
    else if (i === 11) bones[i] = plane('ownproto', [0, 140]);
    else bones[i] = filler(dummies.includes(i) ? `d${i}` : `f${i}`);
  }
  for (const t of tests) t.boneName = bones[t.bone].name;
  // (the planes are design elements only where the export needs them: blend's material is declared by an element that uses it)
  const elements = { ctl: { type: 'image' }, ownblend: { type: 'image', blend: 'blend' } };
  const anim = { loop: true, animation_length: 1, bones: {} };
  for (const t of tests) {
    if (t.id === 'ownalpha' || t.id === 'ownuv') continue;   // (always scale 1: alpha / uv_anim alone shows them)
    if (t.id === 'line700') { anim.bones[t.boneName] = { scale: 'v.gp_l' }; continue; }
    if (t.id === 'ownclone') { const [x, y] = t.at; anim.bones[t.boneName] = { position: [`${sel(t.k)} ? ${x} : 0`, `${sel(t.k)} ? ${y - 140} : 0`, 0], scale: [on(t.k), on(t.k), 1] }; continue; }
    if (t.id === 'clockpre') { anim.bones[t.boneName] = { position: [`${sel(t.k)} ? math.clamp(v.gp_cl, 0, 6) * 15 : 0`, 0, 0], scale: on(t.k) }; continue; }
    anim.bones[t.boneName] = { scale: on(t.k) };
  }
  anim.bones.ownproto = { scale: 0 };
  const clock = (q) => ({ loop: true, animation_length: 100, bones: { [q === 'anim' ? 'clockanim' : 'clocklife']: { position: [`math.clamp(${q === 'anim' ? 'q.anim_time' : 'q.life_time'}, 0, 6) * 15`, 0, 0] } } });
  const design = { settings: settings(ns, 'GeoUI Probe (structure)'), seed: 'geoui_probe', bones, elements, textures: { probe: { name: 'probe', width: TW, height: TW, png: PNG } },
    animations: [{ name: `${ns}.probe`, json: anim, condition: 'q.is_in_ui' }, { name: `${ns}.clockanim`, json: clock('anim'), condition: 'q.is_in_ui && v.gp_t == 3' },
      { name: `${ns}.clocklife`, json: clock('life'), condition: 'q.is_in_ui && v.gp_t == 4' }] };
  const built = G.buildPack(design), files = built.files;
  addPre(files, ns, [
    `v.gp_t = q.property('${ns}:v2');`,
    'v.gp_c0 = (v.gp_t != v.gp_tp) ? q.life_time : v.gp_c0;', 'v.gp_tp = v.gp_t;', 'v.gp_cl = q.life_time - v.gp_c0;',
    `v.gp_a = ${on(15)};`, `v.gp_fr = ${sel(16)} ? 2 : 0;`, `v.${ns}_a_ownproto_t0s0 = 1;`, `v.${ns}_fr_ownproto_t0s0 = 0;`,
    ...Array.from({ length: 700 - 8 }, (_, i) => `v.gp_z${i} = ${i};`),
    `v.gp_l = ${on(19)};`,
  ]);
  ownControllers(files, ns, 'probe', [
    { bone: 'own1' }, { bone: 'ownblend', blend: true }, { bone: 'ownalpha', blend: true, alpha: 'v.gp_a' },
    { bone: 'ownuv', uv: ['math.mod(v.gp_fr, 4) / 4', 'math.floor(v.gp_fr / 4) / 4'] },
    // (as compile.js writes a slot's controller: the shared one copied, its colour's alpha and its flipbook by variables)
    { bone: 'ownproto_t0s0', alpha: `v.${ns}_a_ownproto_t0s0`, uv: [`math.mod(v.${ns}_fr_ownproto_t0s0, 4) / 4`, `math.floor(v.${ns}_fr_ownproto_t0s0 / 4) / 4`] },
    ...dummies.map((i) => ({ bone: `d${i}` })), { bone: 'own31' },
  ]);
  return { ns, name: 'geoui_probe', files, warnings: built.warnings, tests, title: 'GeoUI の作りの確かめ（ボーンの番号・自分の render controller・時間）',
    notes: ['ボーンは 249 本（geoui_rhythm と同じ数）。テストのボーンは決まった番号に置き、間は画面の外の小さな板で埋める。',
      '自分の render controller は 31 個（6〜30 個目は何も描かない）。共有の render controller はそれらのボーンを part_visibility で描かない。',
      '時計の 3 つは、選んでから 1.5 秒と 3 秒で写す（毎秒 15 単位で右へ動けば、その時間が進んでいる）。'] };
}

/** a Molang expression that is 1 when test k is chosen, nested `depth` deep / `length` characters long (flat) */
const nested = (depth, k) => { let s = `(v.gp_t == ${k} ? 1 : 0)`; for (let i = 0; i < depth - 1; i++) s = `(v.gp_t == ${1000 + i} ? 0 : ${s})`; return s; };
const flat = (length, k) => { const head = `(v.gp_t == ${k}) * 0.5 + (v.gp_t == ${k}) * 0.5`, term = ' + v.gp_t * 0'; return head + term.repeat(Math.max(0, Math.ceil((length - head.length) / term.length))); };

/** geoui_probe_m: Molang's length and depth (pre_animation and animation channels, one animation file each) and 600 bones */
function probeMolang() {
  const ns = 'gprobm', tests = [
    { k: 1, id: 'ctl', at: cell(0, 0), what: '基準: ふつうのボーン・scale で出し入れ' },
    { k: 2, id: 'pre16', at: cell(1, 0), pre: nested(16, 2), what: 'pre_animation: 入れ子 16 段' },
    { k: 3, id: 'pre54', at: cell(2, 0), pre: nested(54, 3), what: 'pre_animation: 入れ子 54 段（geoui_rhythm のスライダーの玉と同じ深さ）' },
    { k: 4, id: 'pre150', at: cell(3, 0), pre: nested(150, 4), what: 'pre_animation: 入れ子 150 段' },
    { k: 5, id: 'pref8k', at: cell(4, 0), pre: flat(8000, 5), what: 'pre_animation: 入れ子なし 8000 文字' },
    { k: 6, id: 'ch54', at: cell(0, 1), ch: nested(54, 6), what: 'アニメーションの式: 入れ子 54 段' },
    { k: 7, id: 'ch400', at: cell(1, 1), ch: nested(400, 7), what: 'アニメーションの式: 入れ子 400 段' },
    { k: 8, id: 'chf30k', at: cell(2, 1), ch: flat(30000, 8), what: 'アニメーションの式: 入れ子なし 30000 文字' },
    { k: 9, id: 'chf100k', at: cell(3, 1), ch: flat(100000, 9), what: 'アニメーションの式: 入れ子なし 100000 文字' },
    { k: 10, id: 'big1', at: cell(0, 2), big: 1, what: '600 本のジオメトリ（2 枚目のテクスチャ・自分の render controller）のボーン #1' },
    { k: 11, id: 'big300', at: cell(1, 2), big: 300, what: '600 本のジオメトリのボーン #300' },
    { k: 12, id: 'big599', at: cell(2, 2), big: 599, what: '600 本のジオメトリのボーン #599' },
  ];
  for (const t of tests) { if (t.pre) t.len = t.pre.length; if (t.ch) t.len = t.ch.length; }
  const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, ...tests.filter((t) => !t.big).map((t) => plane(t.id, t.at))];
  const anim = { loop: true, animation_length: 1, bones: {} };
  for (const t of tests) if (t.id === 'ctl' || t.big) anim.bones[t.id] = { scale: on(t.k) }; else if (t.pre) anim.bones[t.id] = { scale: `v.gpm_${t.id}` };
  const animations = [{ name: `${ns}.probe`, json: anim, condition: 'q.is_in_ui' }];
  const design = { settings: settings(ns, 'GeoUI Probe (Molang)'), seed: 'geoui_probe_m', bones, elements: { ctl: { type: 'image' } }, textures: { probe: { name: 'probe', width: TW, height: TW, png: PNG } }, animations };
  const built = G.buildPack(design), files = built.files;
  addPre(files, ns, [`v.gp_t = q.property('${ns}:v2');`, ...tests.filter((t) => t.pre).map((t) => `v.gpm_${t.id} = ${t.pre};`)]);
  // (each channel test its own animation file: one that the game cannot read takes nothing else with it)
  const entf = `${ns}_RP/entity/player.entity.json`, ent = parse(files[entf]), dsc = ent['minecraft:client_entity'].description;
  for (const t of tests.filter((x) => x.ch)) {
    files[`${ns}_RP/animations/${ns}_${t.id}.animation.json`] = J({ format_version: '1.8.0', animations: { [`animation.${ns}.${t.id}`]: { loop: true, animation_length: 1, bones: { [t.id]: { scale: t.ch } } } } });
    dsc.animations[`${ns}_${t.id}`] = `animation.${ns}.${t.id}`; dsc.scripts.animate.push({ [`${ns}_${t.id}`]: 'q.is_in_ui' });
  }
  // (the 600-bone geometry: its own texture, geometry and controller, bones under the GeoUI root so the root's transform moves them)
  const big = tests.filter((t) => t.big), gb = [{ name: 'geo_ui', pivot: [0, 140, 0] }];
  for (let i = 1; i < 600; i++) { const t = big.find((x) => x.big === i); gb.push(t ? Object.assign(plane(t.id, t.at), { cubes: [{ origin: [t.at[0] - SIZE / 2, t.at[1] - SIZE / 2, 0], size: [SIZE, SIZE, 0], uv: { north: { uv: UV.yellow, uv_size: [16, 16] } } }] }) : { name: `g${i}`, parent: 'geo_ui', pivot: [-400, 140, 0], cubes: [{ origin: [-400, 140, 0], size: [1, 1, 0], uv: { north: { uv: UV.grey, uv_size: [16, 16] } } }] }); }
  const key = `${ns}_big`, geo = parse(files[`${ns}_RP/models/entity/${ns}/probe.geo.json`]);
  geo['minecraft:geometry'][0].description.identifier = `geometry.${key}`; geo['minecraft:geometry'][0].bones = gb.map((b) => { const o = { name: b.name, pivot: b.pivot }; if (b.parent) o.parent = b.parent; if (b.cubes) o.cubes = b.cubes; return o; });
  files[`${ns}_RP/models/entity/${ns}/big.geo.json`] = J(geo); files[`${ns}_RP/textures/${ns}/big.png`] = { base64: PNG };
  dsc.geometry[key] = `geometry.${key}`; dsc.textures[key] = `textures/${ns}/big`;
  const rcf = `${ns}_RP/render_controllers/${ns}.render_controllers.json`, rc = parse(files[rcf]), base = rc.render_controllers[`controller.render.${ns}_probe`];
  rc.render_controllers[`controller.render.${key}`] = Object.assign(parse(base), { geometry: `Geometry.${key}`, textures: [`Texture.${key}`] });
  dsc.render_controllers.push({ [`controller.render.${key}`]: 'q.is_in_ui && !variable.is_paperdoll' });
  files[rcf] = J(rc); files[entf] = J(ent);
  return { ns, name: 'geoui_probe_m', files, warnings: built.warnings, tests, title: 'GeoUI の Molang の長さ・深さと、600 本のジオメトリの確かめ',
    notes: [`式の長さ: ${tests.filter((t) => t.len).map((t) => `${t.id} ${t.len} 文字`).join('・')}。アニメーションの式は 1 つずつ別のファイル（読めない物が他を巻き込まない）。`,
      '600 本のジオメトリは 2 枚目のテクスチャ（big）の、自分の render controller で描く。'] };
}

/** geoui_probe_tl: compile.js's own output for a sequence (a track that moves 10 units a second) and a template (a dot per
 *  instance, two slots) — shown at fixed times (play then pause) and while it runs */
function probeTimeline() {
  const ns = 'gprobt', bar = cell(0, 3), dotAt = [0, 140];
  const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, plane('bar', bar), plane('dot', dotAt, { uv: UV.yellow, size: 10 })];
  const design = { settings: settings(ns, 'GeoUI Probe (timeline)'), seed: 'geoui_probe_tl', bones, elements: { bar: { type: 'image' }, dot: { type: 'image' } },
    textures: { probe: { name: 'probe', width: TW, height: TW, png: PNG } } };
  const inst = (id, t, [x, y]) => ({ id, template: 'blip', t, params: { x: x - dotAt[0], y: y - dotAt[1] } });
  const doc = { version: 1, sequences: [{ id: 'probe', name: 'probe', duration: 20, fps: 20, loop: 'once', inOut: null, markers: [], tempo: [], paths: [],
    tracks: [{ id: 'tbar', kind: 'layer', target: 'bar', name: 'bar', clips: [{ id: 'cbar', start: 0, end: 20, channels: { x: [{ t: 0, v: 0, ease: 'linear' }, { t: 10, v: 100 }] } }] }],
    templates: [{ id: 'blip', name: 'blip', lead: 0.5, tail: 0.5, params: ['x', 'y'], tracks: [{ id: 'tdot', kind: 'layer', target: 'dot', name: 'dot', clips: [{ id: 'cdot', start: -0.5, end: 0.5, channels: { x: [{ t: 0, v: 'param.x' }], y: [{ t: 0, v: 'param.y' }] } }] }] }],
    instances: [inst('i1', 2, cell(1, 2)), inst('i2', 4, cell(2, 2)), inst('i3', 6, cell(3, 2)), inst('i4', 6.2, cell(4, 2))] }] };
  const built = G.buildPack(design), rp = C.extendPack(built.files, doc, { design, core: G }), bp = R.extendBehavior(rp.files, doc, { stats: rp.stats, ns });
  const tests = [
    { k: 1, id: 'st2', cmd: ['play 1 2', 'pause'], what: '止めて st = 2: バーは +20 単位、i1 の点（2 列目）', expect: [{ at: [bar[0] + 20, bar[1]], name: 'bar' }, { at: cell(1, 2), name: 'i1', size: 10 }] },
    { k: 2, id: 'st4', cmd: ['seek 4', 'pause'], what: '止めて st = 4: バーは +40、i2 の点（3 列目）', expect: [{ at: [bar[0] + 40, bar[1]], name: 'bar' }, { at: cell(2, 2), name: 'i2', size: 10 }] },
    { k: 3, id: 'st6', cmd: ['seek 6', 'pause'], what: '止めて st = 6: バーは +60、i3 と i4 の点（別の枠）', expect: [{ at: [bar[0] + 60, bar[1]], name: 'bar' }, { at: cell(3, 2), name: 'i3', size: 10 }, { at: cell(4, 2), name: 'i4', size: 10 }] },
    { k: 4, id: 'run', cmd: ['play 1 0'], run: true, what: '0 秒から再生: 2.5 秒と 4 秒で写す（時間が進めばバーが +25・+40、4 秒で i2 の点）' },
  ];
  return { ns, name: 'geoui_probe_tl', files: bp.files, warnings: [...built.warnings, ...rp.warnings, ...bp.warnings], tests, timeline: true, stats: rp.stats, bar, dotAt,
    title: 'GeoUI のタイムラインの書き出し（compile.js）をそのまま確かめる',
    notes: [`シーケンスのトラック（bar: 毎秒 10 単位右へ）と、テンプレート blip（点。実体 4 つ・枠 ${Object.values(rp.stats.slots).map((s) => `${s.slots} ${s.mode}`).join('・')}）。`,
      'play と pause で時刻を止めて写す（q.life_time が進まなくても st は seq_from）。最後に止めずに再生して、時間が進むかを見る。'] };
}

// ---------------------------------------------------------------------------------------------------------------- the add-on
const HEAD = (ns) => `section title
launch
until title 600000
shot title

section join
join
until joined 300000
wait 3000
do time set noon
do gamerule dodaylightcycle false
do weather clear
do tp @a 0 -60 0 0 90
do hud @a hide paperdoll
do hud @a hide touch_controls
do hud @a hide hotbar
do hud @a hide crosshair
do js for (const q of world.getAllPlayers()) q.setProperty('${ns}:v2', 0); 'probe off'
wait 6000
shot world--probe-off
absent clientlog \\bERROR\\b
`;
const LOGS = `
section log-molang
absent clientlog (?i)molang
section log-geometry
absent clientlog (?i)geometr|\\bbones?\\b
section log-render
absent clientlog (?i)render.?controller|part_visibility|uv_anim
section log-animation
absent clientlog (?i)animation
section log-warn
absent clientlog \\bWARN
section log-error
absent clientlog \\bERROR\\b
`;
const setV2 = (ns, k) => `do js for (const q of world.getAllPlayers()) q.setProperty('${ns}:v2', ${k}); 'probe ${k}'`;
const shotName = (t, s = '') => `t${String(t.k).padStart(2, '0')}-${t.id}${s}`;
function appTxt(P) {
  let s = `# ${P.name}（bds/geoui/timeline/probe.mjs が作る）: ${P.title}。node bds/geoui/timeline/probe.mjs read <summary.json> が読む。\n# 基準は何も出さない画面（world--probe-off）。テストを 1 つずつ出して写し、measure diff で変わった所（px）を数で出す。\n\n${HEAD(P.ns)}`;
  if (P.timeline) {
    for (const t of P.tests) {
      s += `\nsection ${shotName(t)}\n${t.cmd.map((c) => `do scriptevent ${P.ns}:${c}`).join('\n')}\n`;
      if (t.run) s += `wait 2500\nshot ${shotName(t, '-a')}\nmeasure diff ${shotName(t, '-a')}\nwait 1500\nshot ${shotName(t, '-b')}\nmeasure diff ${shotName(t, '-b')}\n`;
      else s += `wait 1500\nshot ${shotName(t)}\nmeasure diff ${shotName(t)}\n`;
    }
    s += `\nsection stop\ndo scriptevent ${P.ns}:stop\nwait 1500\nshot stopped\nmeasure diff stopped\n`;
  } else {
    for (const t of P.tests) {
      s += `\nsection ${shotName(t)}\n${setV2(P.ns, t.k)}\n`;
      if (t.clock) s += `wait 1500\nshot ${shotName(t, '-a')}\nmeasure diff ${shotName(t, '-a')}\nwait 1500\nshot ${shotName(t, '-b')}\nmeasure diff ${shotName(t, '-b')}\n`;
      else s += `wait 1500\nshot ${shotName(t)}\nmeasure diff ${shotName(t)}\n`;
    }
    s += `\nsection all\n${setV2(P.ns, ALL)}\nwait 1500\nshot all\nmeasure diff all\n${setV2(P.ns, 0)}\n`;
  }
  return s + LOGS;
}
function addon(P) {
  const out = new Map();
  for (const [f, v] of Object.entries(P.files)) {
    const rel = f.replace(`${P.ns}_RP/`, 'rp/').replace(`${P.ns}_BP/`, 'bp/');
    out.set(rel, v && v.base64 ? Buffer.from(v.base64, 'base64') : v instanceof Uint8Array ? Buffer.from(v) : Buffer.from(String(v)));
  }
  out.set('imported.json', Buffer.from(J({ from: 'bds/geoui/timeline/probe.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: `${P.title}（ラボの確かめ。絵はラボの物）` })));
  out.set('TASK.md', Buffer.from(`# ${P.name} — ${P.title}

## Request
GeoUI のタイムラインの書き出しが頼る物を、本物のアプリで 1 つずつ確かめる（bds/geoui/timeline/probe.mjs が作る。手で変えない）。
app.txt がテストを 1 つずつ出して写し、\`measure diff\` が変わった所を数で出す。\`node bds/geoui/timeline/probe.mjs read <summary.json>\` が読む。

## What it is
${P.notes.map((x) => `- ${x}`).join('\n')}
${P.tests.map((t) => `- テスト ${t.k}（${t.id}）: ${t.what}`).join('\n')}

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（プロパティが既定値）

## Not proven here (needs the real app: app.txt)
- どのテストの板が描かれるか（probe.mjs read が答える）
`));
  const props = P.timeline ? `['v2','seq','seq_gen']` : `['v2','alpha']`, want = P.timeline ? '[0,0,0]' : '[0,100]';
  out.set('tests.txt', Buffer.from(`# ${P.name}（bds/geoui/timeline/probe.mjs が作る）: BP が読み込めること。描画は app.txt（本物のアプリ）で。
# = 完全一致 | ~ 正規表現 | ! 無い | !~ 無い正規表現 | '## 題' = 節

## 読み込める（プロパティが既定値）
@A join
wait 2000
js const e = p('A'); JSON.stringify(${props}.map((k) => e.getProperty('${P.ns}:' + k)))
= ${want}
`));
  out.set('app.txt', Buffer.from(appTxt(P)));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- read
/** a run's summary.json → what each test drew: the control plane gives the screen's scale and place, every other test's
 *  plane is looked for in its cell (a part of the change within a third of a plane of where it should be, of about its size) */
function read(files) {
  const all = [probeStructure(), probeMolang(), probeTimeline()];
  for (const f of files) {
    const s = JSON.parse(fs.readFileSync(f, 'utf8')), P = all.find((p) => p.name === s.addon);
    if (!P) { console.log(`${f}: ${s.addon} は probe の add-on ではありません`); continue; }
    const shots = new Map((s.measures || []).filter((m) => m.kind === 'diff').map((m) => [m.shot, m.values]));
    const boxes = (v) => (v ? [1, 2, 3, 4].filter((i) => Number.isFinite(v[`b${i}n`])).map((i) => ({ x0: v[`b${i}x0`], y0: v[`b${i}y0`], x1: v[`b${i}x1`], y1: v[`b${i}y1`], n: v[`b${i}n`] })) : []);
    const ctr = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], side = (b) => ((b.x1 - b.x0) + (b.y1 - b.y0)) / 2;
    console.log(`\n${P.name} (${s.run}: ${s.ok ? 'ok' : 'failed'}${(s.failed_lines || []).length ? `, 失敗した行 ${s.failed_lines.join(' ')}` : ''})`);
    // the screen: the control plane (probe) or the stopped bar (timeline) — px per unit and where the model's (0, 140) is
    let U = 720 / 170.68, O = [780, 360];
    const ref = P.timeline ? null : boxes(shots.get(shotName(P.tests[0])))[0];
    if (ref) { U = side(ref) / SIZE; const [cx, cy] = ctr(ref), [mx, my] = P.tests[0].at; O = [cx - mx * U, cy + (my - 140) * U]; console.log(`  画面: 1 単位 = ${U.toFixed(3)} px、モデルの (0, 140) は (${O[0].toFixed(0)}, ${O[1].toFixed(0)}) px（基準の板から）`); }
    else if (!P.timeline) console.log('  基準の板が見つかりません（全部が描かれていない？）: 見込みの目盛りで読みます');
    const px = ([x, y]) => [O[0] + x * U, O[1] - (y - 140) * U];
    const find = (v, at, size = SIZE) => { const [ex, ey] = px(at); return boxes(v).find((b) => { const [cx, cy] = ctr(b); return Math.hypot(cx - ex, cy - ey) < (size * U) / 3 && Math.abs(side(b) / U - size) < size * 0.35; }) || null; };
    const say = (b, at) => { if (!b) return '✘ 描かれていない'; const [ex, ey] = px(at), [cx, cy] = ctr(b); return `✔ 描かれた（ずれ ${(cx - ex).toFixed(0)}, ${(cy - ey).toFixed(0)} px）`; };
    const rest = (v) => `（変わった所 ${v ? `${v.parts} か所・${(v.share * 100).toFixed(2)}%` : '測っていない'}）`;
    for (const t of P.tests) {
      if (P.timeline) {
        if (t.run) {
          for (const [s2, tt] of [['-a', 2.5], ['-b', 4]]) {
            const v = shots.get(shotName(t, s2)), b = boxes(v).filter((x) => Math.abs(ctr(x)[1] - px(P.bar)[1]) < SIZE * U / 2 && Math.abs(side(x) / U - SIZE) < SIZE * 0.35);
            const moved = b.map((x) => (ctr(x)[0] - px(P.bar)[0]) / U);
            console.log(`  ${shotName(t, s2)} 再生 ${tt} 秒後: バーの位置 ${moved.length ? moved.map((m) => `+${m.toFixed(1)}`).join(' / ') : '見つからない'} 単位（時間が進めば +${tt * 10}）${rest(v)}`);
          }
          continue;
        }
        const v = shots.get(shotName(t));
        console.log(`  ${shotName(t)} ${t.what}${rest(v)}`);
        for (const e of t.expect) console.log(`    ${e.name}: ${say(find(v, e.at, e.size), e.at)}`);
        continue;
      }
      if (t.clock) {
        const a = boxes(shots.get(shotName(t, '-a'))), b = boxes(shots.get(shotName(t, '-b')));
        const pos = (bs) => bs.filter((x) => Math.abs(ctr(x)[1] - px(t.at)[1]) < SIZE * U / 2 && Math.abs(side(x) / U - SIZE) < SIZE * 0.35).map((x) => (ctr(x)[0] - px(t.at)[0]) / U);
        const pa = pos(a), pb = pos(b);
        console.log(`  ${shotName(t)} ${t.what}\n    1.5 秒: ${pa.length ? pa.map((x) => x.toFixed(1)).join(' / ') : '—'} 単位、3 秒: ${pb.length ? pb.map((x) => x.toFixed(1)).join(' / ') : '—'} 単位${pa.length && pb.length ? `（1.5 秒で ${(pb[0] - pa[0]).toFixed(1)} 単位: 毎秒 ${((pb[0] - pa[0]) / 1.5).toFixed(1)}、15 なら時計どおり）` : ''}`);
        continue;
      }
      const v = shots.get(shotName(t));
      console.log(`  ${shotName(t).padEnd(16)} ${say(find(v, t.at), t.at)} ${rest(v)} — ${t.what}`);
    }
    if (!P.timeline) { const v = shots.get('all'); console.log(`  all（全部を出す）: ${v ? `${v.parts} か所・全体 (${v.x0}, ${v.y0})–(${v.x1}, ${v.y1})` : '測っていない'}`); }
    const logs = (s.failed_lines || []).length ? appTxt(P).split('\n').map((l, i) => [i + 1, l]).filter(([i, l]) => s.failed_lines.includes(i) && /clientlog/.test(l)) : [];
    for (const [i, l] of logs) console.log(`  コンテンツログ: ${i} 行目「${l}」が落ちた（その種類の行がある）`);
  }
}

// ---------------------------------------------------------------------------------------------------------------- main
if (process.argv[2] === 'read') { read(process.argv.slice(3)); process.exit(0); }
const check = process.argv.includes('--check'), stale = [];
for (const P of [probeStructure(), probeMolang(), probeTimeline()]) {
  const OUT = path.join(TOP, 'bds', 'addons', P.name), out = addon(P);
  if (check) { for (const [rel, data] of out) { const f = path.join(OUT, rel); if (!fs.existsSync(f) || !fs.readFileSync(f).equals(data)) stale.push(`${P.name}/${rel}`); } continue; }
  fs.rmSync(path.join(OUT, 'rp'), { recursive: true, force: true }); fs.rmSync(path.join(OUT, 'bp'), { recursive: true, force: true });
  for (const [rel, data] of out) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); }
  console.log(`OK bds/addons/${P.name}: ${out.size} files · ${P.tests.length} tests`);
  for (const w of [...new Set(P.warnings)]) console.log(`W ${w}`);
}
if (check) { if (stale.length) { console.error(`the probes are not what probe.mjs makes (${stale.slice(0, 5).join(', ')}): node bds/geoui/timeline/probe.mjs`); process.exit(1); } console.log('OK the probes are up to date'); }
