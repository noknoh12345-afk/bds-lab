#!/usr/bin/env node
// GeoUI timeline — the probe: what the real game does with the things the timeline's export leans on, measured in the real app
// (bds-lab's app.txt: shoot, then `measure diff` in the part of the screen the planes are in — where the screen changed, as
// numbers). Three add-ons, each GeoUI Builder's own export with test planes (14 x 14 units, one cell each) shown one at a
// time: app.txt sets <ns>:v2 to a test's number, waits, shoots; the plane drew if the screen changed in its cell.
// `node probe.mjs read <summary.json>…` says which drew.
//   geoui_probe     pre_animation: canaries between lines that might stop it (q.life_time, q.anim_time, a latch with ??, 700
//                   lines, and last a read of a variable never set — the game stops a pre_animation there), clocks (q.life_time
//                   in pre_animation, q.anim_time in an animation), bones by their own render controller (colour alpha and
//                   uv_anim from constants and from variables; a slot copy as compile.js makes it; blend), bones #121 / #126
//   geoui_probe_m   Molang's length and depth in pre_animation (canaries between: the first that stops shows the limit)
//   geoui_probe_tl  compile.js's own output: a sequence's track and a template's slots at fixed times (play then pause) and running
// Round 1 (2026-10-21, runs 39601130957 …): bones to #248 and 31 own render controllers draw; q.anim_time runs in an animation,
// q.life_time there is the entity's age; a line reading a variable never set stops the pre_animation from there (a content
// error, "molang" in the content log) — compile.js's clock did that, so no slot ever showed in geoui_rhythm.
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
    if (o.alpha !== undefined) c.color = Object.assign({}, c.color, { a: `${c.color.a} * ${o.alpha}` });
    if (o.uv) c.uv_anim = { offset: o.uv, scale: [1, 1] };
    rc.render_controllers[`${id}_${o.bone}`] = c; add.push({ [`${id}_${o.bone}`]: cond });
  }
  dsc.render_controllers = [...dsc.render_controllers, ...add];
  files[rcf] = J(rc); files[entf] = J(ent);
}
const addPre = (files, ns, lines) => { const f = `${ns}_RP/entity/player.entity.json`, e = parse(files[f]); e['minecraft:client_entity'].description.scripts.pre_animation.push(...lines); files[f] = J(e); };

// ---------------------------------------------------------------------------------------------------------------- the probes
/** geoui_probe: the pre_animation's canaries, the clocks, the own controllers, two bone indices round 1 could not read */
function probeStructure() {
  const ns = 'gprobe';
  const T0 = [
    ['ctl', '基準: ボーン #1・共有の render controller・scale で出し入れ'],
    ['c1', 'カナリア 1: pre_animation の最初の行の後'], ['c2', 'カナリア 2: q.life_time を読んだ行の後'], ['c3', 'カナリア 3: q.anim_time を読んだ行の後'],
    ['c4', 'カナリア 4: ?? で守った時計（前の値と変わったら q.life_time を覚える）の後'], ['c5', 'カナリア 5: 700 行目の後'],
    ['c6', 'カナリア 6: 一度も入れていない変数を ?? なしで読んだ行の後（描かれなければ「そこで止まる」の確かめ）'],
    ['clockpre', 'pre_animation の q.life_time（?? の時計: 選んでからの秒 x 15 単位、右へ）', { clock: true }],
    ['clockanim', 'アニメーションの中の q.anim_time（選ぶと始まるアニメーション: 秒 x 15 単位、右へ）', { clock: true }],
    ['lifepre', 'pre_animation の q.life_time の値（1 秒より大きければ +60 単位右に描く）'],
    ['animpre', 'pre_animation の q.anim_time の値（0 でなければ +60 単位右に描く）'],
    ['ownalpha', '自分の render controller・blend・color.a を変数で（scale は 1 のまま、不透明度だけで出し入れ）'],
    ['alpha0', '自分の render controller・blend・color.a を 0（定数）: 描かれたら color.a は効かない'],
    ['ownuv', '自分の render controller・uv_anim の offset を変数で（コマ 0 は透明、選ぶとコマ 2）'],
    ['uvconst', '自分の render controller・uv_anim の offset を 0.5（定数）: 透明のコマ 0 から緑のコマ 2 へ（描かれたら uv_anim が効く）'],
    ['ownclone', 'compile.js と同じ作りの枠の複製（ボーン #140・原型の名前_t0s0・奥へ 0.021・その render controller・color.a と uv を変数で）'],
    ['line700', 'pre_animation の 700 行目の変数で出し入れ'],
    ['b121', 'ボーン #121'], ['b126', 'ボーン #126'], ['ownblend', '自分の render controller・blend（ボーンの名前でマテリアル）'],
  ];
  const tests = T0.map(([id, what, o], i) => Object.assign({ k: i + 1, id, what, at: cellAt(i) }, o || {}));
  const K = Object.fromEntries(tests.map((t) => [t.id, t.k]));
  // the bones: the tests at #1…, b121 / b126 / the clone at their indices, fillers between (249 in all, as geoui_rhythm)
  const N = 249, bones = new Array(N), fixed = { b121: 121, b126: 126, ownclone: 140 };
  bones[0] = { name: 'geo_ui', pivot: [0, 140, 0] };
  let next = 1;
  for (const t of tests) if (!(t.id in fixed)) t.bone = next++;
  for (const [id, i] of Object.entries(fixed)) tests.find((t) => t.id === id).bone = i;
  const protoAt = next++;
  for (let i = 1; i < N; i++) {
    const t = tests.find((x) => x.bone === i);
    if (t && t.id === 'ownclone') bones[i] = Object.assign(plane('ownproto_t0s0', [0, 140], { z: 0.021 }), { pivot: [0, 140, 0] });
    else if (t) bones[i] = plane(t.id, t.at, { uv: t.id === 'ownuv' || t.id === 'uvconst' ? UV.clear : UV.white });
    else if (i === protoAt) bones[i] = plane('ownproto', [0, 140]);
    else bones[i] = filler(`f${i}`);
  }
  for (const t of tests) t.boneName = bones[t.bone].name;
  const elements = { ctl: { type: 'image' }, ownblend: { type: 'image', blend: 'blend' } };
  const anim = { loop: true, animation_length: 1, bones: { ownproto: { scale: 0 } } };
  for (const t of tests) {
    const k = t.k, b = t.boneName;
    if (['ownalpha', 'ownuv'].includes(t.id)) continue;   // (always scale 1: alpha / uv_anim alone shows them)
    if (/^c\d$/.test(t.id)) { anim.bones[b] = { scale: `${sel(k)} ? (v.gp_${t.id} ?? 0) : 0` }; continue; }
    if (t.id === 'line700') { anim.bones[b] = { scale: 'v.gp_l ?? 0' }; continue; }
    if (t.id === 'ownclone') { const [x, y] = t.at; anim.bones[b] = { position: [`${sel(k)} ? ${x} : 0`, `${sel(k)} ? ${y - 140} : 0`, 0], scale: [on(k), on(k), 1] }; continue; }
    if (t.id === 'clockpre') { anim.bones[b] = { position: [`${sel(k)} ? math.clamp(v.gp_cl ?? 0, 0, 6) * 15 : 0`, 0, 0], scale: on(k) }; continue; }
    if (t.id === 'lifepre') { anim.bones[b] = { position: [`((v.gp_life ?? 0) > 1 ? 60 : 0)`, 0, 0], scale: on(k) }; continue; }
    if (t.id === 'animpre') { anim.bones[b] = { position: [`((v.gp_anim ?? 0) != 0 ? 60 : 0)`, 0, 0], scale: on(k) }; continue; }
    anim.bones[b] = { scale: on(k) };
  }
  const clock = { loop: true, animation_length: 100, bones: { clockanim: { position: ['math.clamp(q.anim_time, 0, 6) * 15', 0, 0] } } };
  const design = { settings: settings(ns, 'GeoUI Probe (structure)'), seed: 'geoui_probe', bones, elements, textures: { probe: { name: 'probe', width: TW, height: TW, png: PNG } },
    animations: [{ name: `${ns}.probe`, json: anim, condition: 'q.is_in_ui' }, { name: `${ns}.clockanim`, json: clock, condition: `q.is_in_ui && v.gp_t == ${K.clockanim}` }] };
  const built = G.buildPack(design), files = built.files;
  addPre(files, ns, [
    `v.gp_t = q.property('${ns}:v2');`, 'v.gp_c1 = 1;',
    'v.gp_life = q.life_time;', 'v.gp_c2 = 1;',
    'v.gp_anim = q.anim_time;', 'v.gp_c3 = 1;',
    'v.gp_t0 = (v.gp_t != (v.gp_tp ?? -1)) ? q.life_time : (v.gp_t0 ?? 0);', 'v.gp_tp = v.gp_t;', 'v.gp_cl = q.life_time - v.gp_t0;', 'v.gp_c4 = 1;',
    `v.gp_a = ${on(K.ownalpha)};`, `v.gp_fr = ${sel(K.ownuv)} ? 2 : 0;`, `v.${ns}_a_ownproto_t0s0 = 1;`, `v.${ns}_fr_ownproto_t0s0 = 0;`,
    ...Array.from({ length: 680 }, (_, i) => `v.gp_z${i} = ${i};`),
    `v.gp_l = ${on(K.line700)};`, 'v.gp_c5 = 1;',
    'v.gp_bad = v.gp_never + 1;', 'v.gp_c6 = 1;',
  ]);
  ownControllers(files, ns, 'probe', [
    { bone: 'ownalpha', blend: true, alpha: 'v.gp_a' }, { bone: 'alpha0', blend: true, alpha: '0' },
    { bone: 'ownuv', uv: ['math.mod(v.gp_fr, 4) / 4', 'math.floor(v.gp_fr / 4) / 4'] }, { bone: 'uvconst', uv: [0.5, 0] },
    // (as compile.js writes a slot's controller: the shared one copied, its colour's alpha and its flipbook by variables)
    { bone: 'ownproto_t0s0', alpha: `v.${ns}_a_ownproto_t0s0`, uv: [`math.mod(v.${ns}_fr_ownproto_t0s0, 4) * 0.25`, `math.floor(v.${ns}_fr_ownproto_t0s0 / 4) * 0.25`] },
    { bone: 'ownblend', blend: true },
  ]);
  return { ns, name: 'geoui_probe', files, warnings: built.warnings, tests, title: 'GeoUI の作りの確かめ（pre_animation が止まる所・時計・自分の render controller）',
    notes: ['pre_animation に足した行の間にカナリア（1 なら板を描く変数）を置く: 描かれない最初のカナリアの前の行で、pre_animation が止まっている。',
      '最後の行は、一度も入れていない変数を ?? なしで読む（ゲームはここで止まるはず: カナリア 6 は描かれないのが正しい）。',
      '時計の 2 つは、選んでから 1.5 秒と 3 秒で写す（毎秒 15 単位で右へ動けば、その時間が進んでいる）。'] };
}

/** a Molang expression that is 1 when test k is chosen, nested `depth` deep / `length` characters long (flat) */
const nested = (depth, k) => { let s = `(v.gp_t == ${k} ? 1 : 0)`; for (let i = 0; i < depth - 1; i++) s = `(v.gp_t == ${1000 + i} ? 0 : ${s})`; return s; };
const flat = (length, k) => { const head = `(v.gp_t == ${k}) * 0.5 + (v.gp_t == ${k}) * 0.5`, term = ' + v.gp_t * 0'; return head + term.repeat(Math.max(0, Math.ceil((length - head.length) / term.length))); };

/** geoui_probe_m: Molang's length and depth in pre_animation, from short to long, a canary after each (round 1 put longer ones
 *  and a 600-bone geometry in one pack, and nothing of it drew: something there stops the whole entity) */
function probeMolang() {
  const ns = 'gprobm', steps = [['d54', nested(54, 0), '入れ子 54 段（geoui_rhythm のスライダーの玉と同じ深さ）'], ['f6k', flat(6000, 0), '入れ子なし 6000 文字'],
    ['f8k', flat(8000, 0), '入れ子なし 8000 文字（compile.js の上限の見込み）'], ['f12k', flat(12000, 0), '入れ子なし 12000 文字'], ['d100', nested(100, 0), '入れ子 100 段'], ['f16k', flat(16000, 0), '入れ子なし 16000 文字']];
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
  const lines = [`v.gp_t = q.property('${ns}:v2');`];
  for (const [id, expr] of steps) { lines.push(`v.gpm_${id} = ${expr.replace(/v\.gp_t == 0\)/g, `v.gp_t == ${K[id]} || v.gp_t == ${ALL})`).replace(/v\.gp_t == 0 \?/g, `(v.gp_t == ${K[id]} || v.gp_t == ${ALL}) ?`)};`, `v.gpm_${id}_c = 1;`); }
  addPre(files, ns, lines);
  for (const [id, expr] of steps) tests.find((t) => t.id === id).len = expr.length;
  return { ns, name: 'geoui_probe_m', files, warnings: built.warnings, tests, title: 'GeoUI の Molang の長さ・深さの確かめ（pre_animation）',
    notes: [`式の長さ: ${steps.map(([id, e]) => `${id} ${e.length} 文字`).join('・')}。短い物から順に、各行の後にカナリア。`,
      '1 回目（2026-10-21）は長い式（3 万・10 万文字、入れ子 400 段）と 600 本のジオメトリを 1 つのパックに入れ、何も描かれなかった（エンティティごと読まれていない）。'] };
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
const LOGS = `
section log-molang
absent clientlog (?i)molang
section log-variable
absent clientlog (?i)variable
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
const measure = (name) => `measure diff ${name} ${REGION.join(' ')}`;
function appTxt(P) {
  let s = `# ${P.name}（bds/geoui/timeline/probe.mjs が作る）: ${P.title}。node bds/geoui/timeline/probe.mjs read <summary.json> が読む。\n# 基準は何も出さない画面（world--probe-off）。テストを 1 つずつ出して写し、measure diff で変わった所（px。板のある所だけ）を数で出す。\n\n${HEAD(P.ns)}`;
  if (P.timeline) {
    for (const t of P.tests) {
      s += `\nsection ${shotName(t)}\n${t.cmd.map((c) => `do scriptevent ${P.ns}:${c}`).join('\n')}\n`;
      if (t.run) s += `wait 2500\nshot ${shotName(t, '-a')}\n${measure(shotName(t, '-a'))}\nwait 1500\nshot ${shotName(t, '-b')}\n${measure(shotName(t, '-b'))}\n`;
      else s += `wait 1500\nshot ${shotName(t)}\n${measure(shotName(t))}\n`;
    }
    s += `\nsection stop\ndo scriptevent ${P.ns}:stop\nwait 1500\nshot stopped\n${measure('stopped')}\n`;
  } else {
    for (const t of P.tests) {
      s += `\nsection ${shotName(t)}\n${setV2(P.ns, t.k)}\n`;
      if (t.clock) s += `wait 1500\nshot ${shotName(t, '-a')}\n${measure(shotName(t, '-a'))}\nwait 1500\nshot ${shotName(t, '-b')}\n${measure(shotName(t, '-b'))}\n`;
      else s += `wait 1500\nshot ${shotName(t)}\n${measure(shotName(t))}\n`;
    }
    s += `\nsection all\n${setV2(P.ns, ALL)}\nwait 1500\nshot all\n${measure('all')}\n${setV2(P.ns, 0)}\n`;
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
/** a run's summary.json → what each test drew. The screen's scale: GeoUI's measured one (720 px are 170.68 units, the model's
 *  (0, 140) in the middle), checked against the control plane when it is there. A test's plane: a part of the change of about
 *  its size within a third of a plane of its cell */
function read(files) {
  const all = [probeStructure(), probeMolang(), probeTimeline()];
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
    for (const t of P.tests) {
      if (P.timeline && t.run) {
        for (const [s2, tt] of [['-a', 2.5], ['-b', 4]]) { const v = shots.get(shotName(t, s2)), m = along(v, P.bar); console.log(`  ${shotName(t, s2)} 再生 ${tt} 秒後: バー ${m.length ? m.map((x) => `+${x.toFixed(1)}`).join(' / ') : '見つからない'} 単位（時間が進めば +${tt * 10}）${rest(v)}`); }
        continue;
      }
      if (P.timeline) { const v = shots.get(shotName(t)); console.log(`  ${shotName(t)} ${t.what}${rest(v)}`); for (const e of t.expect) console.log(`    ${e.name}: ${say(find(v, e.at, e.size), e.at)}`); continue; }
      if (t.clock) {
        const pa = along(shots.get(shotName(t, '-a')), t.at), pb = along(shots.get(shotName(t, '-b')), t.at);
        console.log(`  ${shotName(t).padEnd(14)} 1.5 秒: ${pa.length ? pa.map((x) => x.toFixed(1)).join(' / ') : '—'} 単位、3 秒: ${pb.length ? pb.map((x) => x.toFixed(1)).join(' / ') : '—'} 単位${pa.length && pb.length ? `（その間 ${(pb[0] - pa[0]).toFixed(1)} 単位）` : ''} — ${t.what}`);
        continue;
      }
      const v = shots.get(shotName(t));
      if (t.id === 'lifepre' || t.id === 'animpre') { const m = along(v, t.at); console.log(`  ${shotName(t).padEnd(14)} ${m.length ? m.map((x) => `+${x.toFixed(1)}`).join(' / ') : '見つからない'} 単位 — ${t.what}`); continue; }
      console.log(`  ${shotName(t).padEnd(14)} ${say(find(v, t.at), t.at)} ${rest(v)} — ${t.what}`);
    }
    if (!P.timeline) { const v = shots.get('all'); console.log(`  all（全部を出す）: ${v ? `${v.parts} か所` : '測っていない'}`); }
    const lines = appTxt(P).split('\n');
    for (const n of s.failed_lines || []) if (/clientlog/.test(lines[n - 1] || '')) console.log(`  コンテンツログ: ${n} 行目「${lines[n - 1]}」が落ちた（その種類の行がある）`);
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
