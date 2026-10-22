#!/usr/bin/env node
// GeoUI timeline — the probe: what the real game does with the things the timeline's export leans on, measured in the real app
// (bds-lab's app.txt: shoot, then `measure diff` in the part of the screen the planes are in — where the screen changed, as
// numbers). Three add-ons, each GeoUI Builder's own export with test planes (14 x 14 units, one cell each) shown one at a
// time: app.txt sets <ns>:v2 to a test's number, waits, shoots; the plane drew if the screen changed in its cell.
// `node probe.mjs read <summary.json>…` says which drew.
//   geoui_probe     round 3: opacity — a render controller's colour alpha through materials with the colour mask
//                   (USE_COLOR_MASK: blend, cutout), a texture's half-clear texels (blend, cutout), measured as colour
//                   (`measure color`: how see-through); a bone's rotation's direction; two animations on one bone (scale
//                   multiplied? position added?); a variable set only in initialize; the paper-doll guard on q.property
//   geoui_probe_m   Molang's length and depth in pre_animation (canaries between: the first that stops shows the limit)
//   geoui_probe_tl  compile.js's own output: a sequence's track, a template's slots and an element's fade at fixed times
//                   (paused) and running; then the pause screen (its paper doll reads no property)
// Round 1 (2026-10-21, runs 39601130957 …): bones to #248 and 31 own render controllers draw; q.anim_time runs in an animation,
// q.life_time there is the entity's age; a line reading a variable never set stops the pre_animation from there (a content
// error, "molang" in the content log) — compile.js's clock did that, so no slot ever showed in geoui_rhythm.
// Round 2 (runs 39605771908 …): with ?? the clock works and the canaries after it draw (the stop at an unset read confirmed);
// q.life_time in pre_animation counts seconds as q.anim_time does in an animation; uv_anim (constant and variable) works; a
// render controller's colour alpha changes nothing with GeoUI's blend material (alpha 0 still drawn; GeoUI's own `alpha`
// property neither: geoui_bb's alpha-0 picture is the 42-quarter one); compile.js's slot copy (#140) and track draw where they
// should, paused at 4 and 6 s and running (paused at 2 s it was 2.64 s: a pause right after a play is a moment late).
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
//      row 1: white (the test planes), yellow, magenta, grey (the fillers); row 2: white at alpha 0.376
const TW = 64, img = new Uint8Array(TW * TW * 4);
const fill = (x0, y0, rgba) => { for (let y = y0; y < y0 + 16; y++) for (let x = x0; x < x0 + 16; x++) img.set(rgba, (y * TW + x) * 4); };
fill(16, 0, [255, 40, 40, 255]); fill(32, 0, [40, 255, 40, 255]); fill(48, 0, [40, 80, 255, 255]);
fill(0, 16, [255, 255, 255, 255]); fill(16, 16, [255, 230, 40, 255]); fill(32, 16, [255, 40, 255, 255]); fill(48, 16, [128, 128, 128, 255]);
// row 2: white at alpha 96 / 255 (0.376: under a cutout's 0.5) — a texture's own see-through texels
fill(0, 32, [255, 255, 255, 96]);
const PNG = encodePng({ width: TW, height: TW, data: img }).toString('base64');
const UV = { clear: [0, 0], white: [0, 16], yellow: [16, 16], magenta: [32, 16], grey: [48, 16], half: [0, 32] };
const TEX_HALF = 96 / 255;

// ---- the cells: 7 x 4 in model units (the screen's middle is (0, 140)); measured only in REGION (px of the 1560 x 720 screen):
//      the first-person hand (x ≥ ~1038) and the chat (y < 170) left out
const COLS = [-160, -125, -90, -55, -20, 15, 50], ROWS = [175, 145, 115, 85], SIZE = 14, REGION = [0, 170, 1030, 720];
const cell = (c, r) => [COLS[c], ROWS[r]];
const cellAt = (i) => cell(i % 7, Math.floor(i / 7));
const plane = (name, [cx, cy], { uv = UV.white, z = 0, tex = 'probe', size = SIZE, parent = 'geo_ui' } = {}) => ({ name, parent, pivot: [cx, cy, z],
  cubes: [{ origin: [cx - size / 2, cy - size / 2, z], size: [size, size, 0], faces: { north: { uv, uv_size: [16, 16], texture: tex } } }] });
const filler = (name, tex = 'probe') => ({ name, parent: 'geo_ui', pivot: [-400, 140, 0], cubes: [{ origin: [-400, 140, 0], size: [1, 1, 0], faces: { north: { uv: UV.grey, uv_size: [16, 16], texture: tex } } }] });
const ALL = 99, sel = (k) => `(v.gp_t == ${k} || v.gp_t == ${ALL})`, on = (k) => `${sel(k)} ? 1 : 0`;
const settings = (ns, name) => ({ ns, name, description: `GeoUI probe (bds-lab): ${name}`, bp: true, calibration: G.MEASURED.id });

/** the base controller of the texture `tex` stops drawing some bones; each gets a controller of its own (compile.js's way):
 *  o.material — that bone drawn with material.<ns>_<o.material> (blend, fade, cutfade …); o.alpha — the colour's alpha times it */
function ownControllers(files, ns, tex, list) {
  const rcf = `${ns}_RP/render_controllers/${ns}.render_controllers.json`, entf = `${ns}_RP/entity/player.entity.json`;
  const rc = parse(files[rcf]), ent = parse(files[entf]), dsc = ent['minecraft:client_entity'].description, id = `controller.render.${ns}_${tex}`;
  const base = rc.render_controllers[id], cond = dsc.render_controllers.find((x) => typeof x === 'object' && x[id])[id];
  base.part_visibility = [{ '*': true }, ...list.map((o) => ({ [o.bone]: false }))];
  const add = [];
  for (const o of list) {
    const c = parse(base);
    c.part_visibility = [{ '*': false }, { [o.bone]: true }];
    if (o.material) c.materials = [...c.materials, { [o.bone]: `material.${ns}_${o.material}` }];
    if (o.alpha !== undefined) c.color = Object.assign({}, c.color, { a: `${c.color.a} * ${o.alpha}` });
    if (o.uv) c.uv_anim = { offset: o.uv, scale: [1, 1] };
    rc.render_controllers[`${id}_${o.bone}`] = c; add.push({ [`${id}_${o.bone}`]: cond });
  }
  dsc.render_controllers = [...dsc.render_controllers, ...add];
  files[rcf] = J(rc); files[entf] = J(ent);
}
const addPre = (files, ns, lines) => { const f = `${ns}_RP/entity/player.entity.json`, e = parse(files[f]); e['minecraft:client_entity'].description.scripts.pre_animation.push(...lines); files[f] = J(e); };
const addInit = (files, ns, lines) => { const f = `${ns}_RP/entity/player.entity.json`, e = parse(files[f]), d = e['minecraft:client_entity'].description; d.scripts.initialize = [...(d.scripts.initialize || []), ...lines]; files[f] = J(e); };
/** more materials on GeoUI Builder's base (name → its definition), declared by the client entity */
function addMaterials(files, ns, defs) {
  const mf = `${ns}_RP/materials/entity.material`, entf = `${ns}_RP/entity/player.entity.json`, m = parse(files[mf]), e = parse(files[entf]), d = e['minecraft:client_entity'].description;
  for (const [name, def] of Object.entries(defs)) { m.materials[`${ns}_${name}:${ns}_base`] = def; d.materials[`${ns}_${name}`] = `${ns}_${name}`; }
  files[mf] = J(m); files[entf] = J(e);
}
// (the colour mask: the vanilla entity_change_color's define — the controller's colour, its alpha with it, applied to the texture)
const MATS = {
  fade: { '+defines': ['USE_UV_ANIM', 'USE_COLOR_MASK'], '+states': ['Blending'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' },
  cutfade: { '+defines': ['USE_UV_ANIM', 'ALPHA_TEST', 'USE_COLOR_MASK'] },
};

// ---------------------------------------------------------------------------------------------------------------- the probes
/** geoui_probe (round 3): opacity by materials and textures (colours measured), rotation's direction, two animations on one
 *  bone, initialize, the paper-doll guard */
function probeStructure() {
  const ns = 'gprobe';
  const T0 = [
    ['ctl', '基準: 共有の render controller（cutout）の白い板・scale で出し入れ（色の測りの「不透明の白」）', { color: true }],
    ['mask1', 'fade（blend + USE_COLOR_MASK）・color.a = 1: 描かれればこのマテリアルは使える', { color: true }],
    ['mask0', 'fade・color.a = 0（定数）: 描かれなければ color.a が効く'],
    ['maskhalf', 'fade・color.a = 0.5: 色を測る（0.5 なら半分透ける）', { color: true, alpha: 0.5 }],
    ['maskvar', 'fade・color.a を変数で（選んだ時だけ 1・scale は 1 のまま）: 描かれれば変数の color.a が効く'],
    ['cutmask0', 'cutfade（cutout + USE_COLOR_MASK）・color.a = 0: 描かれなければ効く（cutout は 0.5 より薄い所を捨てる）'],
    ['cutmaskhalf', 'cutfade・color.a = 0.6: 色を測る（cutout のままなら不透明）', { color: true, alpha: 0.6 }],
    ['texhalf', 'blend・テクスチャの白（不透明度 0.376）: 色を測る（半透明のテクセルが混ざるか）', { color: true, alpha: TEX_HALF }],
    ['texhalfcut', 'cutout・テクスチャの白（0.376）: 描かれなければ 0.5 より薄いテクセルは捨てられる'],
    ['masktexhalf', 'fade・テクスチャ 0.376・color.a = 0.5: 色を測る（掛け算なら 0.188）', { color: true, alpha: TEX_HALF * 0.5 }],
    ['rot90', 'アニメーションの rotation z = +90（板はピボットの右 20 単位）: 上へ行けば左回り・下なら右回り', { rot: true }],
    ['scalemul', '同じボーンに 3 つのアニメーション（scale 1・2・0.5）: 14 単位なら掛け算', { size: true }],
    ['posadd', '同じボーンに 2 つのアニメーション（x +10 ずつ）: +20 なら足し算', { pos: true }],
    ['init', 'initialize だけで入れた変数（7）で出し入れ: 描かれれば initialize が効く'],
    ['atu', 'アニメーションの anim_time_update を変数（0.5）で: 鍵は 0 秒で +0・1 秒で +40 単位。+20 なら変数の時刻で動く（+40 なら時間がそのまま進んだ、+0 なら止まったまま）', { pos: true, expect: 20 }],
    ['atuwrap', '親のボーンを anim_time_update のアニメーションで +20（0.5）、子の板を別のアニメーションで +10: +30 なら重なる（タイムラインの道はこの形）', { pos: true, expect: 30 }],
  ];
  const tests = T0.map(([id, what, o], i) => Object.assign({ k: i + 1, id, what, at: cellAt(i) }, o || {}));
  // (rot90 in the third row: up or down 20 units stays inside the measured part of the screen)
  const K = Object.fromEntries(tests.map((t) => [t.id, t.k])), T = (id) => tests.find((t) => t.id === id);
  T('rot90').at = cell(5, 2);
  const uvOf = (id) => (/texhalf/.test(id) ? UV.half : UV.white);
  const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, { name: 'atuwrap_p', parent: 'geo_ui', pivot: [...T('atuwrap').at, 0] }, ...tests.map((t) => {
    if (t.id === 'atuwrap') return plane(t.id, t.at, { parent: 'atuwrap_p' });
    if (t.id !== 'rot90') return plane(t.id, t.at, { uv: uvOf(t.id) });
    // (the pivot in the cell's middle, the plane 20 units to its right: where +90 takes it says the direction)
    const [cx, cy] = t.at;
    return { name: 'rot90', parent: 'geo_ui', pivot: [cx, cy, 0], cubes: [{ origin: [cx + 20 - SIZE / 2, cy - SIZE / 2, 0], size: [SIZE, SIZE, 0], faces: { north: { uv: UV.white, uv_size: [16, 16], texture: 'probe' } } }] };
  })];
  const elements = { ctl: { type: 'image' }, texhalf: { type: 'image', blend: 'blend' } };
  const anim = { loop: true, animation_length: 1, bones: {} };
  for (const t of tests) {
    const k = t.k, b = t.id;
    if (b === 'maskvar') continue;   // (always scale 1: its alpha alone shows it)
    if (b === 'init') { anim.bones[b] = { scale: `${sel(k)} ? ((v.gp_init ?? 0) == 7 ? 1 : 0) : 0` }; continue; }
    if (b === 'rot90') { anim.bones[b] = { rotation: [0, 0, 90], scale: on(k) }; continue; }
    if (b === 'atuwrap') { anim.bones[b] = { scale: on(k), position: [`${sel(k)} ? 10 : 0`, 0, 0] }; continue; }
    anim.bones[b] = { scale: on(k) };
  }
  // (an animation's own time from a variable — anim_time_update — as the timeline's paths go: keys at 0 and 1 s, the
  //  variable 0.5 while the test is chosen)
  const keyed = (bone) => ({ loop: 'hold_on_last_frame', animation_length: 1, anim_time_update: 'v.gp_u', bones: { [bone]: { position: { '0.0': [0, 0, 0], '1.0': [40, 0, 0] } } } });
  // (two more animations on scalemul and posadd, only while their test is chosen)
  const mulA = { loop: true, animation_length: 1, bones: { scalemul: { scale: 2 }, posadd: { position: [10, 0, 0] } } };
  const mulB = { loop: true, animation_length: 1, bones: { scalemul: { scale: 0.5 }, posadd: { position: [10, 0, 0] } } };
  const chosen = `q.is_in_ui && (${sel(K.scalemul)} || ${sel(K.posadd)})`;
  const design = { settings: settings(ns, 'GeoUI Probe (structure)'), seed: 'geoui_probe', bones, elements, textures: { probe: { name: 'probe', width: TW, height: TW, png: PNG } },
    animations: [{ name: `${ns}.probe`, json: anim, condition: 'q.is_in_ui' }, { name: `${ns}.mul_a`, json: mulA, condition: chosen }, { name: `${ns}.mul_b`, json: mulB, condition: chosen },
      { name: `${ns}.atu`, json: keyed('atu'), condition: 'q.is_in_ui' }, { name: `${ns}.atuwrap`, json: keyed('atuwrap_p'), condition: 'q.is_in_ui' }] };
  const built = G.buildPack(design), files = built.files;
  addMaterials(files, ns, MATS);
  addInit(files, ns, ['v.gp_init = 7;']);
  // (every property read guarded as compile.js guards it: the pause screen's paper doll has none)
  addPre(files, ns, [`v.gp_t = variable.is_paperdoll ? 0 : q.property('${ns}:v2');`, `v.gp_a = ${on(K.maskvar)};`, `v.gp_u = (${sel(K.atu)} || ${sel(K.atuwrap)}) ? 0.5 : 0;`]);
  ownControllers(files, ns, 'probe', [
    { bone: 'mask1', material: 'fade', alpha: '1' }, { bone: 'mask0', material: 'fade', alpha: '0' }, { bone: 'maskhalf', material: 'fade', alpha: '0.5' },
    { bone: 'maskvar', material: 'fade', alpha: 'v.gp_a' }, { bone: 'cutmask0', material: 'cutfade', alpha: '0' }, { bone: 'cutmaskhalf', material: 'cutfade', alpha: '0.6' },
    { bone: 'masktexhalf', material: 'fade', alpha: '0.5' },
  ]);
  return { ns, name: 'geoui_probe', files, warnings: built.warnings, tests, title: 'GeoUI の作りの確かめ 3 回目（不透明度・回転の向き・アニメーションの重ね方・initialize・anim_time_update）',
    notes: ['テストの板を 1 つずつ出して写す。`measure diff` で描かれた所、`measure color` で板の真ん中の平均の色（と、何も出さない画面の同じ所の色）。',
      '透け具合 = (色 − 何も無い所の色) / (不透明の白（ctl）− 何も無い所の色): read が明るさで出す。',
      '2 回目までの答えは probe.mjs の頭と PLAN.md の進み具合に。'] };
}

/** a Molang expression that is 1 when test k is chosen, nested `depth` deep / `length` characters long (flat) */
const nested = (depth, k) => { let s = `(v.gp_t == ${k} ? 1 : 0)`; for (let i = 0; i < depth - 1; i++) s = `(v.gp_t == ${1000 + i} ? 0 : ${s})`; return s; };
const flat = (length, k) => { const head = `(v.gp_t == ${k}) * 0.5 + (v.gp_t == ${k}) * 0.5`, term = ' + v.gp_t * 0'; return head + term.repeat(Math.max(0, Math.ceil((length - head.length) / term.length))); };

/** geoui_probe_m: the Molang the export writes, at its largest — lines cut short (compile.splitLines: 1000 characters, 24
 *  brackets), the lookups of thousands of baked instances (compile.searchLines / tableLines), 3000 lines and 450 000
 *  characters in one pre_animation — a canary after each. Not what it never writes: rounds 2 and 3 also had lines of 6000 …
 *  16 000 characters and 54 and 100 brackets deep, and the app never got into that world (3 runs, while the other probes got
 *  in: the BDS took the pack and a client joined it here) */
function probeMolang() {
  const ns = 'gprobm', steps = [['split', flat(16000, 0), '入れ子なし 16000 文字を compile.js の splitLines で 1000 文字以下・深さ 24 以下の行に分けた物（書き出しはこの形）', 'split'],
    ['w1000', flat(948, 0), '入れ子なし 1000 文字の 1 行（書き出しの 1 行の上限）'], ['d24', nested(23, 0), '入れ子 24 段（書き出しの深さの上限）'],
    ['tbl', null, '2000 個の焼き込みの実体の引き方（compile.js の searchLines と tableLines: 16 個ずつの組と二分木）で 1500 個目を引く', 'tbl'],
    ['lines', null, 'pre_animation に 3000 行・45 万文字（その後の行で 2999 行目の値を読む）', 'lines']];
  const tests = [{ id: 'ctl', what: '基準: ふつうのボーン・scale で出し入れ' }];
  for (const [id, , what] of steps) tests.push({ id, what: `${what}（${id} の式の板）` }, { id: `${id}_c`, what: `カナリア: ${what} の行の後` });
  tests.forEach((t, i) => Object.assign(t, { k: i + 1, at: cellAt(i) }));
  const K = Object.fromEntries(tests.map((t) => [t.id, t.k]));
  const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, ...tests.map((t) => plane(t.id, t.at))];
  const anim = { loop: true, animation_length: 1, bones: {} };
  for (const t of tests) anim.bones[t.id] = { scale: t.id === 'ctl' ? on(t.k) : `${sel(t.k)} ? (v.gpm_${t.id} ?? 0) : 0` };
  const design = { settings: settings(ns, 'GeoUI Probe (Molang)'), seed: 'geoui_probe_m', bones, elements: { ctl: { type: 'image' } }, textures: { probe: { name: 'probe', width: TW, height: TW, png: PNG } },
    animations: [{ name: `${ns}.probe`, json: anim, condition: 'q.is_in_ui' }] };
  const built = G.buildPack(design), files = built.files;
  // (each expression is 1 when its own test is chosen: its plane shows only if the line ran; the canary after it, that the
  //  pre_animation went on past it)
  const lines = [`v.gp_t = q.property('${ns}:v2');`], choose = (id, expr) => expr.replace(/v\.gp_t == 0\)/g, `v.gp_t == ${K[id]} || v.gp_t == ${ALL})`).replace(/v\.gp_t == 0 \?/g, `(v.gp_t == ${K[id]} || v.gp_t == ${ALL}) ?`);
  for (const [id, expr, , kind] of steps) {
    if (kind === 'split') { const r = C.splitLines([`v.gpm_${id} = ${choose(id, expr)};`], { limit: 1000, depth: 24, prefix: 'v.gpm_s' }); lines.push(...r.lines); tests.find((t) => t.id === id).lines = r.lines.length; }
    else if (kind === 'tbl') {
      // (the time 150.05 when chosen: the first of 2000 ends (i + 1) × 0.1 past it is #1500; then its value, i mod 7, by number)
      const tl = [`v.gpm_tk = (v.gp_t == ${K[id]} || v.gp_t == ${ALL}) ? 150.05 : -1;`];
      C.searchLines('v.gpm_tk', Array.from({ length: 2000 }, (_, i) => (i + 1) / 10), 'v.gpm_ti', tl);
      tl.push('v.gpm_tq = math.floor(v.gpm_ti / 16);');
      C.tableLines('v.gpm_ti', Array.from({ length: 2000 }, (_, i) => String(i % 7)), 'v.gpm_tv', '-1', 'v.gpm_tq', tl);
      tl.push(`v.gpm_${id} = ((v.gp_t == ${K[id]} || v.gp_t == ${ALL}) && v.gpm_ti == 1500 && v.gpm_tv == ${1500 % 7}) ? 1 : 0;`);
      lines.push(...tl); tests.find((t) => t.id === id).lines = tl.length;
    } else if (kind === 'lines') { for (let i = 0; i < 3000; i++) lines.push(`v.gpm_l${i} = ${i}${' + v.gp_t * 0'.repeat(10)};`); lines.push(`v.gpm_${id} = ((v.gp_t == ${K[id]} || v.gp_t == ${ALL}) && v.gpm_l2999 == 2999) ? 1 : 0;`); }
    else lines.push(`v.gpm_${id} = ${choose(id, expr)};`);
    lines.push(`v.gpm_${id}_c = 1;`);
  }
  addPre(files, ns, lines);
  for (const [id, expr] of steps) if (expr) tests.find((t) => t.id === id).len = expr.length;
  return { ns, name: 'geoui_probe_m', files, warnings: built.warnings, tests, title: 'GeoUI の Molang の長さ・深さの確かめ（pre_animation）',
    notes: [`式: ${steps.filter(([, e]) => e).map(([id, e]) => `${id} ${e.length} 文字`).join('・')}（split はそれを ${tests.find((t) => t.id === 'split').lines} 行に分けた物）、tbl ${tests.find((t) => t.id === 'tbl').lines} 行。各行の後にカナリア。`,
      '1 回目（2026-10-21）は長い式（3 万・10 万文字、入れ子 400 段）と 600 本のジオメトリを 1 つのパックに入れ、何も描かれなかった。2・3 回目（6000〜16000 文字・入れ子 54 と 100 段も入れた物）は、アプリがそのワールドに 3 回とも入れなかった（BDS は読み込み、手元のクライアントは入れた）。書き出しはどちらの形も出さないので、ここでは書き出しが出す形だけを確かめる。'] };
}

/** geoui_probe_b: the limits a big export leans on — a geometry of 600 bones (planes on bones #250 … #599: a bone's index
 *  may be kept in a byte), 70 render controllers of the element's own, 1200 animations each driven by anim_time_update (as
 *  the timeline's paths are). Each test plane moves 20 units right when chosen, by its own bone: one drawn and moved says
 *  the bone (controller, animation) works; one not moved (or drawn while not chosen: the "idle" shot) says it does not */
function probeLimits() {
  const ns = 'gprobb', TOTAL = 600, HIGH = [250, 255, 256, 257, 300, 400, 511, 512, 599];
  const tests = [{ id: 'ctl', what: '基準: ボーン #1 の板（scale で出し入れ・選ぶと +20 単位）', move: true }];
  for (const b of HIGH) tests.push({ id: `b${b}`, bone: b, what: `ボーン #${b} の板（選ぶと +20 単位）: 動けばこの番号のボーンも効く`, move: true });
  tests.push({ id: 'rc40', what: '自分の render controller の 40 個目が描く板（選ぶと +20）', move: true, rc: 40 },
    { id: 'rc70', what: '自分の render controller の 70 個目が描く板（選ぶと +20）', move: true, rc: 70 },
    { id: 'an1200', what: '1200 個目のアニメーション（anim_time_update が 0.5 の時に +20: 鍵は 0 秒 +0・1 秒 +40）が動かす板', anim: 1200 });
  tests.forEach((t, i) => Object.assign(t, { k: i + 1, at: cellAt(i) }));
  const K = Object.fromEntries(tests.map((t) => [t.id, t.k]));
  // (the bones in order: the root, the control, fillers — a 1 x 1 plane each, far off the screen — and the test planes at
  //  their own index)
  const at = new Map(tests.filter((t) => t.bone).map((t) => [t.bone, t])), bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, plane('ctl', cellAt(0))];
  for (let i = bones.length; i < TOTAL; i++) bones.push(at.has(i) ? plane(at.get(i).id, at.get(i).at) : filler(`f${i}`));
  bones.push(plane('rc40', tests.find((t) => t.id === 'rc40').at), plane('rc70', tests.find((t) => t.id === 'rc70').at), plane('an1200', tests.find((t) => t.id === 'an1200').at));
  const anim = { loop: true, animation_length: 1, bones: {} };
  for (const t of tests) anim.bones[t.id] = t.anim ? { scale: on(t.k) } : { scale: on(t.k), position: [`${sel(t.k)} ? 20 : 0`, 0, 0] };
  // (1200 animations as the timeline's paths: keyed 0 … 1 s, their time a variable — all but the last never on)
  const keyed = (bone) => ({ loop: 'hold_on_last_frame', animation_length: 1, anim_time_update: 'v.gpb_u', bones: { [bone]: { position: { '0.0': [0, 0, 0], '0.5': [20, 0, 0], '1.0': [40, 0, 0] } } } });
  const many = [];
  for (let i = 1; i < 1200; i++) many.push({ name: `${ns}.a${i}`, json: keyed(`f${10 + (i % 200)}`), condition: `v.gpb_t == ${5000 + i}` });
  many.push({ name: `${ns}.a1200`, json: keyed('an1200'), condition: `q.is_in_ui && ${sel(K.an1200)}` });
  const design = { settings: settings(ns, 'GeoUI Probe (limits)'), seed: 'geoui_probe_b', bones, elements: { ctl: { type: 'image' } }, textures: { probe: { name: 'probe', width: TW, height: TW, png: PNG } },
    animations: [{ name: `${ns}.probe`, json: anim, condition: 'q.is_in_ui' }, ...many] };
  const built = G.buildPack(design), files = built.files;
  addPre(files, ns, [`v.gp_t = variable.is_paperdoll ? 0 : q.property('${ns}:v2');`, `v.gpb_t = v.gp_t;`, `v.gpb_u = ${sel(K.an1200)} ? 0.5 : 0;`]);
  // (70 controllers of their own: each draws one bone; the 40th and the 70th the test planes)
  const own = [];
  for (let i = 1; i <= 70; i++) own.push({ bone: i === 40 ? 'rc40' : i === 70 ? 'rc70' : `f${100 + i}` });
  ownControllers(files, ns, 'probe', own);
  return { ns, name: 'geoui_probe_b', files, warnings: built.warnings, tests, limits: true, title: 'GeoUI の大きい書き出しが頼る上限（ボーン 600 本・自分の render controller 70 個・アニメーション 1200 個）',
    notes: ['ボーンの番号は 1 バイト（256 で 1 周）で持たれているかもしれない: #250〜#599 の板が自分のボーンで動くかを見る。',
      '始めに GeoUI の alpha を 0 にして全部を隠した画面（world--hidden）を撮り、何も選ばない画面（idle）と比べる: 違えば、選んでいない板が別のボーンで出ている。',
      '一体のエンティティごと読まれなければ、何も描かれない（基準の ctl も）。'] };
}

/** geoui_probe_tl: compile.js's own output for a sequence (a track that moves 10 units a second, an element that fades in over
 *  4 s) and a template (a dot per instance, two slots) — shown at fixed times (paused: a seek while paused is exact) and while
 *  it runs; then the pause screen (its paper doll: compile.js reads no property there) */
function probeTimeline() {
  const ns = 'gprobt', bar = cell(0, 3), dotAt = [0, 140], fader = cell(6, 3);
  const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, plane('bar', bar), plane('dot', dotAt, { uv: UV.yellow, size: 10 }), plane('fader', fader)];
  const design = { settings: settings(ns, 'GeoUI Probe (timeline)'), seed: 'geoui_probe_tl', bones, elements: { bar: { type: 'image' }, dot: { type: 'image' }, fader: { type: 'image' } },
    textures: { probe: { name: 'probe', width: TW, height: TW, png: PNG } } };
  const inst = (id, t, [x, y]) => ({ id, template: 'blip', t, params: { x: x - dotAt[0], y: y - dotAt[1] } });
  const doc = { version: 1, sequences: [{ id: 'probe', name: 'probe', duration: 20, fps: 20, loop: 'once', inOut: null, markers: [], tempo: [], paths: [],
    tracks: [{ id: 'tbar', kind: 'layer', target: 'bar', name: 'bar', clips: [{ id: 'cbar', start: 0, end: 20, channels: { x: [{ t: 0, v: 0, ease: 'linear' }, { t: 10, v: 100 }] } }] },
      { id: 'tfade', kind: 'layer', target: 'fader', name: 'fader', clips: [{ id: 'cfade', start: 0, end: 20, channels: { opacity: [{ t: 0, v: 0, ease: 'linear' }, { t: 4, v: 1 }] } }] }],
    templates: [{ id: 'blip', name: 'blip', lead: 0.5, tail: 0.5, params: ['x', 'y'], tracks: [{ id: 'tdot', kind: 'layer', target: 'dot', name: 'dot', clips: [{ id: 'cdot', start: -0.5, end: 0.5, channels: { x: [{ t: 0, v: 'param.x' }], y: [{ t: 0, v: 'param.y' }] } }] }] }],
    instances: [inst('i1', 2, cell(1, 2)), inst('i2', 4, cell(2, 2)), inst('i3', 6, cell(3, 2)), inst('i4', 6.2, cell(4, 2))] }] };
  const built = G.buildPack(design), rp = C.extendPack(built.files, doc, { design, core: G }), bp = R.extendBehavior(rp.files, doc, { stats: rp.stats, ns });
  const tests = [
    { k: 1, id: 'st0', cmd: ['play 1 0', 'pause', 'seek 0'], fade: 0, what: '止めて st = 0: バーは +0（休みと同じ）、fader は不透明度 0（透明なら fade が効く）', expect: [] },
    { k: 2, id: 'st2', cmd: ['seek 2'], fade: 0.5, what: '止めて st = 2: バーは +20 単位、i1 の点（2 列目）、fader は 0.5', expect: [{ at: [bar[0] + 20, bar[1]], name: 'bar' }, { at: cell(1, 2), name: 'i1', size: 10 }] },
    { k: 3, id: 'st4', cmd: ['seek 4'], fade: 1, what: '止めて st = 4: バーは +40、i2 の点（3 列目）、fader は 1', expect: [{ at: [bar[0] + 40, bar[1]], name: 'bar' }, { at: cell(2, 2), name: 'i2', size: 10 }] },
    { k: 4, id: 'st6', cmd: ['seek 6'], what: '止めて st = 6: バーは +60、i3 と i4 の点（別の枠）', expect: [{ at: [bar[0] + 60, bar[1]], name: 'bar' }, { at: cell(3, 2), name: 'i3', size: 10 }, { at: cell(4, 2), name: 'i4', size: 10 }] },
    { k: 5, id: 'run', cmd: ['play 1 0'], run: true, what: '0 秒から再生: 2.5 秒と 4 秒で写す（時間が進めばバーが +25・+40、4 秒で i2 の点）' },
  ];
  return { ns, name: 'geoui_probe_tl', files: bp.files, warnings: [...built.warnings, ...rp.warnings, ...bp.warnings], tests, timeline: true, stats: rp.stats, bar, dotAt, fader,
    title: 'GeoUI のタイムラインの書き出し（compile.js）をそのまま確かめる',
    notes: [`シーケンスのトラック（bar: 毎秒 10 単位右へ）、fader（4 秒かけて不透明度 0 → 1: 色を測る）と、テンプレート blip（点。実体 4 つ・枠 ${Object.values(rp.stats.slots).map((s) => `${s.slots} ${s.mode}`).join('・')}）。`,
      '0 秒から再生してすぐ止め、止めたまま seek で時刻を決めて写す（止めたままの seek はその時刻ちょうど）。最後に止めずに再生して、時間が進むかを見る。',
      '最後にポーズ画面を開く（人形 = paper doll。compile.js はそこでプロパティを読まない: コンテンツログに何も出ないこと）。'] };
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
do gamerule sendcommandfeedback false
do gamerule commandblockoutput false
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
// (each absent is a yes / no about the content log — the log itself stays sealed: the narrower ones say what a line is about)
const LOGS = (ns) => `
section log-molang
absent clientlog (?i)molang
section log-variable
absent clientlog (?i)variable
section log-property
absent clientlog (?i)property
section log-paperdoll
absent clientlog (?i)paper.?doll
section log-ours
absent clientlog (?i)${ns}
section log-unknown
absent clientlog (?i)unknown|not found|doesn.?t exist|undefined|invalid
section log-geometry
absent clientlog (?i)geometr|\\bbones?\\b
section log-render
absent clientlog (?i)render.?controller|part_visibility|uv_anim
section log-material
absent clientlog (?i)material|shader|define
section log-animation
absent clientlog (?i)animation
section log-warn
absent clientlog \\bWARN
section log-error
absent clientlog \\bERROR\\b
# (round 3: lines with "molang", "variable" and "unknown|not found|…" were there, none with the pack's namespace, "property" or
#  "paperdoll" — which names they are about, one section each: the vanilla player's own variables this pack copies, GeoUI's)
section log-n-geoui
absent clientlog (?i)geoui_
section log-n-gliding
absent clientlog (?i)gliding
section log-n-attack
absent clientlog (?i)attack_time|attack_body
section log-n-firstperson
absent clientlog (?i)first_person
section log-n-mapface
absent clientlog (?i)map_face|map_angle
section log-n-rotation
absent clientlog (?i)x_rotation|look_at
section log-n-handbob
absent clientlog (?i)hand_bob|tcos|riding_y
section log-n-item
absent clientlog (?i)item_use|main_hand|holding|spear
section log-n-blink
absent clientlog (?i)blink|layer_visible|cape
section log-n-query
absent clientlog (?i)query\\.|\\bq\\.
section log-n-math
absent clientlog (?i)math\\.
`;
const setV2 = (ns, k) => `do js for (const q of world.getAllPlayers()) q.setProperty('${ns}:v2', ${k}); 'probe ${k}'`;
const shotName = (t, s = '') => `t${String(t.k).padStart(2, '0')}-${t.id}${s}`;
const measure = (name) => `measure diff ${name} ${REGION.join(' ')}`;
// (a model point → px of the 1560 x 720 screen, GeoUI's measured scale: 720 px are 170.68 units, (0, 140) in the middle)
const U_PX = 720 / 170.68, toPx = ([x, y]) => [780 + x * U_PX, 360 - (y - 140) * U_PX];
const measureColor = (name, at) => { const [x, y] = toPx(at).map(Math.round); return `measure color ${name} ${x - 15} ${y - 15} ${x + 15} ${y + 15}`; };
function appTxt(P) {
  let s = `# ${P.name}（bds/geoui/timeline/probe.mjs が作る）: ${P.title}。node bds/geoui/timeline/probe.mjs read <summary.json> が読む。\n# 基準は何も出さない画面（world--probe-off）。テストを 1 つずつ出して写し、measure diff で変わった所（px。板のある所だけ）を、measure color で板の真ん中の色を数で出す。\n\n${HEAD(P.ns)}`;
  if (P.timeline) {
    for (const t of P.tests) {
      s += `\nsection ${shotName(t)}\n${t.cmd.map((c) => `do scriptevent ${P.ns}:${c}`).join('\n')}\n`;
      if (t.run) s += `wait 2500\nshot ${shotName(t, '-a')}\n${measure(shotName(t, '-a'))}\nwait 1500\nshot ${shotName(t, '-b')}\n${measure(shotName(t, '-b'))}\n`;
      else s += `wait 1500\nshot ${shotName(t)}\n${measure(shotName(t))}\n${t.fade !== undefined ? `${measureColor(shotName(t), P.fader)}\n` : ''}`;
    }
    s += `\nsection stop\ndo scriptevent ${P.ns}:stop\nwait 1500\nshot stopped\n${measure('stopped')}\n`;
    s += `\nsection pause-screen\n# ポーズ画面の人形（paper doll）: プロパティが無い。compile.js の行はそこで読まない（コンテンツログに出ない）\npause\nwait 3000\nshot pause\nkey BACK\nwait 2000\n`;
  } else {
    if (P.limits) s += `\nsection idle\n# GeoUI の alpha 0 で全部を隠した画面を基準に、何も選ばない画面を比べる（選んでいない板が別のボーンで出ていないか）\ndo js for (const q of world.getAllPlayers()) q.setProperty('${P.ns}:alpha', 0); 'hidden'\nwait 3000\nshot world--hidden\ndo js for (const q of world.getAllPlayers()) q.setProperty('${P.ns}:alpha', 100); 'shown'\nwait 3000\nshot idle\n${measure('idle')}\nshot world--probe-off2\n`;
    for (const t of P.tests) {
      s += `\nsection ${shotName(t)}\n${setV2(P.ns, t.k)}\n`;
      s += `wait 1500\nshot ${shotName(t)}\n${measure(shotName(t))}\n${t.color ? `${measureColor(shotName(t), t.at)}\n` : ''}`;
    }
    s += `\nsection all\n${setV2(P.ns, ALL)}\nwait 1500\nshot all\n${measure('all')}\n${setV2(P.ns, 0)}\n`;
  }
  return s + LOGS(P.ns);
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
  const props = P.timeline ? `['v2','seq','seq_from']` : `['v2','alpha']`, want = P.timeline ? '[0,0,0]' : '[0,100]';
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
/** a run's summary.json → what each test drew. The screen's scale: GeoUI's measured one (720 px are 170.68 units, the model's
 *  (0, 140) in the middle), checked against the control plane when it is there. A test's plane: a part of the change of about
 *  its size within a third of a plane of its cell */
function read(files) {
  const all = [probeStructure(), probeMolang(), probeTimeline(), probeLimits()];
  for (const f of files) {
    const s = JSON.parse(fs.readFileSync(f, 'utf8')), P = all.find((p) => p.name === s.addon);
    if (!P) { console.log(`${f}: ${s.addon} は probe の add-on ではありません`); continue; }
    const shots = new Map((s.measures || []).filter((m) => m.kind === 'diff').map((m) => [m.shot, m.values]));
    const boxes = (v) => (v ? [1, 2, 3, 4, 5, 6, 7, 8].filter((i) => Number.isFinite(v[`b${i}n`])).map((i) => ({ x0: v[`b${i}x0`], y0: v[`b${i}y0`], x1: v[`b${i}x1`], y1: v[`b${i}y1`], n: v[`b${i}n`] })) : []);
    const ctr = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], side = (b) => ((b.x1 - b.x0) + (b.y1 - b.y0)) / 2;
    const W = (s.measures || []).find((m) => m.values && m.values.width) ? (s.measures.find((m) => m.values && m.values.width).values) : { width: 1560, height: 720 };
    const U = W.height / 170.68, O = [W.width / 2, W.height / 2];
    const px = ([x, y]) => [O[0] + x * U, O[1] - (y - 140) * U];
    const find = (v, at, size = SIZE) => { const [ex, ey] = px(at); return boxes(v).find((b) => { const [cx, cy] = ctr(b); return Math.hypot(cx - ex, cy - ey) < (size * U) / 3 && Math.abs(side(b) / U - size) < size * 0.35; }) || null; };
    const say = (b, at) => { if (!b) return '✘ 描かれていない'; const [ex, ey] = px(at), [cx, cy] = ctr(b); return `✔ 描かれた（ずれ ${(cx - ex).toFixed(0)}, ${(cy - ey).toFixed(0)} px）`; };
    const rest = (v) => `（変わった所 ${v ? `${v.parts} か所` : '測っていない'}）`;
    console.log(`\n${P.name} (${s.run}: ${s.ok ? 'ok' : 'failed'}${(s.failed_lines || []).length ? `, 失敗した行 ${s.failed_lines.join(' ')}` : ''}) — 1 単位 ${U.toFixed(3)} px`);
    // (a plane in its row, moved sideways: how far, in units)
    const along = (v, at, size = SIZE) => boxes(v).filter((x) => Math.abs(ctr(x)[1] - px(at)[1]) < size * U / 2 && Math.abs(side(x) / U - size) < size * 0.35).map((x) => (ctr(x)[0] - px(at)[0]) / U);
    // (colours: luminance of a measured box; how see-through = (it − the world's there) / (opaque − the world's there))
    const colors = new Map((s.measures || []).filter((m) => m.kind === 'color').map((m) => [m.shot, m.values]));
    const lum = (v, pre = '') => (v && Number.isFinite(v[`${pre}r`]) ? 0.2126 * v[`${pre}r`] + 0.7152 * v[`${pre}g`] + 0.0722 * v[`${pre}b`] : null);
    const ctlT = P.tests.find((t) => t.id === 'ctl'), opaque = ctlT ? lum(colors.get(shotName(ctlT))) : null;
    const seeThrough = (v, top = opaque, under = lum(v, 'b')) => (v && top !== null && under !== null && Math.abs(top - under) > 8 ? (lum(v) - under) / (top - under) : null);
    const fmt = (a) => (a === null ? '測れない' : a.toFixed(2));
    for (const t of P.tests) {
      if (P.timeline && t.run) {
        for (const [s2, tt] of [['-a', 2.5], ['-b', 4]]) { const v = shots.get(shotName(t, s2)), m = along(v, P.bar); console.log(`  ${shotName(t, s2)} 再生 ${tt} 秒後: バー ${m.length ? m.map((x) => `+${x.toFixed(1)}`).join(' / ') : '見つからない'} 単位（時間が進めば +${tt * 10}）${rest(v)}`); }
        continue;
      }
      if (P.timeline) {
        const v = shots.get(shotName(t));
        console.log(`  ${shotName(t)} ${t.what}${rest(v)}`);
        for (const e of t.expect) console.log(`    ${e.name}: ${say(find(v, e.at, e.size), e.at)}`);
        if (t.fade !== undefined) {
          // (the fader: opaque white at rest (the world shot), the ground where it is see-through — st0 has it at 0)
          const c = colors.get(shotName(t)), c0 = colors.get(shotName(P.tests.find((x) => x.fade === 0))), top = lum(c, 'b'), ground = lum(c0);
          const a = c && top !== null && ground !== null && Math.abs(top - ground) > 8 ? (lum(c) - ground) / (top - ground) : null;
          console.log(`    fader（不透明度 ${t.fade} のはず）: 明るさ ${c ? lum(c).toFixed(1) : '—'}（休みの不透明 ${top !== null ? top.toFixed(1) : '—'}）${t.fade === 0 ? (c && top !== null && Math.abs(lum(c) - top) < 8 ? ' ✘ 不透明のまま: fade が効かない' : ' ✔ 透けた（地面の色）') : `・透け具合 ${fmt(a)}`}`);
        }
        continue;
      }
      const v = shots.get(shotName(t)), c = colors.get(shotName(t));
      if (t.rot) {
        const [cx, cy] = t.at, where = [['上（左回り）', [cx, cy + 20]], ['下（右回り）', [cx, cy - 20]], ['右（回らない）', [cx + 20, cy]], ['左（180 度）', [cx - 20, cy]]].filter(([, at]) => find(v, at));
        console.log(`  ${shotName(t).padEnd(14)} ${where.length ? `✔ ${where.map((w) => w[0]).join('・')}` : '✘ 見つからない'} ${rest(v)} — ${t.what}`);
        continue;
      }
      if (t.size) {
        const [ex, ey] = px(t.at), bs = boxes(v).filter((b) => Math.hypot(ctr(b)[0] - ex, ctr(b)[1] - ey) < SIZE * U / 2);
        console.log(`  ${shotName(t).padEnd(14)} ${bs.length ? bs.map((b) => `${(side(b) / U).toFixed(1)} 単位`).join(' / ') : '✘ 見つからない'} ${rest(v)} — ${t.what}`);
        continue;
      }
      if (t.pos || t.move || t.anim) {
        // (moved along its row: how far, in units — against what the test expects when it works)
        const m = along(v, t.at), want = t.expect !== undefined ? t.expect : 20, hit = m.some((x) => Math.abs(x - want) < 1.5);
        console.log(`  ${shotName(t).padEnd(14)} ${m.length ? `${hit ? '✔' : '✘'} ${m.map((x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)} 単位`).join(' / ')}（効けば +${want}）` : '✘ 見つからない'} ${rest(v)} — ${t.what}`);
        continue;
      }
      const col = t.color && c ? `・明るさ ${lum(c).toFixed(1)}（何も無い所 ${lum(c, 'b').toFixed(1)}）${t.id === 'ctl' ? '（不透明の白）' : `・透け具合 ${fmt(seeThrough(c))}${t.alpha !== undefined ? `（効けば ${t.alpha.toFixed(2)}）` : ''}`}` : '';
      console.log(`  ${shotName(t).padEnd(14)} ${say(find(v, t.at), t.at)}${col} ${rest(v)} — ${t.what}`);
    }
    if (!P.timeline) { const v = shots.get('all'); console.log(`  all（全部を出す）: ${v ? `${v.parts} か所` : '測っていない'}`); }
    if (P.limits) {
      // (nothing chosen, against everything hidden: what shows there is a plane drawn by a bone other than its own)
      const v = shots.get('idle'), cellOf = (b) => { const [cx, cy] = ctr(b); let best = null, bd = Infinity; for (const t of P.tests) { const [ex, ey] = px(t.at), d = Math.hypot(cx - ex, cy - ey); if (d < bd) { bd = d; best = t; } } return best && bd < SIZE * U ? best.id : `(${cx.toFixed(0)}, ${cy.toFixed(0)}) px`; };
      console.log(`  idle（何も選ばない・全部を隠した画面と比べる）: ${v ? (v.parts ? `✘ ${v.parts} か所に出ている: ${boxes(v).map(cellOf).join('・')}` : '✔ 何も出ていない') : '測っていない'}`);
    }
    const lines = appTxt(P).split('\n');
    for (const n of s.failed_lines || []) if (/clientlog/.test(lines[n - 1] || '')) console.log(`  コンテンツログ: ${n} 行目「${lines[n - 1]}」が落ちた（その種類の行がある）`);
  }
}

// ---------------------------------------------------------------------------------------------------------------- main
if (process.argv[2] === 'read') { read(process.argv.slice(3)); process.exit(0); }
const check = process.argv.includes('--check'), stale = [];
for (const P of [probeStructure(), probeMolang(), probeTimeline(), probeLimits()]) {
  const OUT = path.join(TOP, 'bds', 'addons', P.name), out = addon(P);
  if (check) { for (const [rel, data] of out) { const f = path.join(OUT, rel); if (!fs.existsSync(f) || !fs.readFileSync(f).equals(data)) stale.push(`${P.name}/${rel}`); } continue; }
  fs.rmSync(path.join(OUT, 'rp'), { recursive: true, force: true }); fs.rmSync(path.join(OUT, 'bp'), { recursive: true, force: true });
  for (const [rel, data] of out) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); }
  console.log(`OK bds/addons/${P.name}: ${out.size} files · ${P.tests.length} tests`);
  for (const w of [...new Set(P.warnings)]) console.log(`W ${w}`);
}
if (check) { if (stale.length) { console.error(`the probes are not what probe.mjs makes (${stale.slice(0, 5).join(', ')}): node bds/geoui/timeline/probe.mjs`); process.exit(1); } console.log('OK the probes are up to date'); }
