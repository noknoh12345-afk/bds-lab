#!/usr/bin/env node
// GeoUI timeline's export to the game (bds/geoui/timeline/compile.js), no network: the pack's own Molang run frame by frame
// (1/60 s, its variables kept from frame to frame as the game keeps them) in GeoUI Builder's Molang evaluator, every element
// compared with the editor's preview (model.evaluate): position, scale, rotation, opacity, value, fill, frame — the sequence's
// own tracks with every ease and transition and loop, a template's instances baked and streamed (the properties set as the
// pack's script would set them), hits and misses. node tests/tl-anim-offline.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../bds/geoui/geoui_builder.js');
const M = require('../bds/geoui/timeline/model.js');
const K = require('../bds/geoui/timeline/contract.js');
require('../bds/geoui/timeline/media.js');
const C = require('../bds/geoui/timeline/compile.js');
const O = require('../bds/geoui/timeline/osu.js');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };

// a design of plain image elements (a 10 x 10 plane each under the root)
const plane = (name) => ({ name, parent: 'geo_ui', pivot: [0, 140, 0], cubes: [{ origin: [-5, 135, 0], size: [10, 10, 0], faces: { north: { uv: [0, 0], uv_size: [16, 16], texture: 't' } } }] });
const designOf = (names) => ({ settings: { ns: 'geoui', bp: false }, bones: [{ name: 'geo_ui', pivot: [0, 140, 0] }, ...names.map(plane)],
  elements: Object.fromEntries(names.map((x) => [x, { type: 'image' }])), textures: { t: { name: 'atlas', width: 16, height: 16, png: 'iVBORw0KGgo=' } } });

/** the pack's Molang against the preview: every frame from 0 to `to`; returns the mismatches (and the built files) */
function compare(doc, names, { to, events = [], ctx = {}, quantize = false, dt = 1 / 60, from = 0 } = {}) {
  const design = designOf(names), built = G.buildPack(design), out = C.extendPack(built.files, doc, { design, core: G, ...ctx });
  const ent = JSON.parse(out.files['geoui_RP/entity/player.entity.json']), pre = ent['minecraft:client_entity'].description.scripts.pre_animation;
  let N = M.normalize(doc);
  const seq = N.sequences[0], slots = Object.entries(out.stats.slots).map(([k, v]) => ({ tpl: seq.templates.find((x) => x.id === k.split(':')[1]), ...v }));
  // (streamed: the game sees each instance's params as the property packs them — the preview compared with those numbers)
  if (quantize) {
    const streamed = new Set(slots.filter((s) => s.mode === 'streamed').map((s) => s.tpl.id));
    const packOf = (x) => (seq.templates.find((tp) => tp.id === x.template) || {}).pack || K.DEFAULT_PACK;
    N = { ...N, sequences: [{ ...seq, instances: seq.instances.map((x) => (streamed.has(x.template) ? { ...x, params: { ...x.params, ...K.unpack(K.pack(x.params, packOf(x)), packOf(x)) } } : x)) }] };
  }
  const props = {}, vars = {}, env = { vars, life: 0, query(name, args) { if (name === 'query.property') return +props[args[0]] || 0; if (name === 'query.life_time') return this.life; if (name === 'query.is_in_ui') return 1; return undefined; } };
  env.query = env.query.bind(env);
  const get = (v) => vars[v.replace(/^v\./, 'variable.')] ?? 0, bad = [], seenAt = new Map();
  for (let f = 0; ; f++) {
    const t = from + f * dt;
    if (t > to + 1e-9) break;
    env.life = 100 + t;
    Object.assign(props, { 'geoui:seq': 1, 'geoui:seq_gen': 1, 'geoui:seq_from': Math.round(from * 1000), 'geoui:seq_pause': 0 });
    // (the pack's script: each slot's instance just before it shows; the hits and misses so far)
    for (const s of slots) {
      const lead = s.tpl.lead;
      for (let k = 0; k < s.slots; k++) {
        const names2 = K.names('geoui').slot(s.tag, k), mine = seq.instances.filter((x) => s.slotOf[x.id] === k);
        if (s.mode === 'streamed') {
          const x = mine.find((y) => t >= y.t - lead - 0.25 - 1e-9 && t < y.t + (y.tail ?? s.tpl.tail));
          props[names2.t] = x ? Math.round(x.t * 1000) : -1; props[names2.p] = x ? K.pack(x.params, s.tpl.pack || K.DEFAULT_PACK) : 0;
        }
        const evs = events.filter((e) => mine.some((x) => x.id === e.instance) && e.t <= t + 1e-9);
        props[names2.g] = evs.length; props[names2.r] = evs.length ? K.RESULTS.indexOf(evs[evs.length - 1].name) : 0;
      }
    }
    G.runPre(pre, env);
    // (the preview at the game's own clock — the same float the game's Molang counted with — and each event at the time the
    //  game learnt of it: the frame its property changed)
    for (const e of events) if (e.t <= t + 1e-9 && !seenAt.has(e)) seenAt.set(e, get('v.geoui_raw'));
    const states = M.evaluate(N, seq.id, get('v.geoui_raw'), { events: events.filter((e) => seenAt.has(e)).map((e) => ({ ...e, t: seenAt.get(e) })) });
    for (const [key, b] of Object.entries(out.stats.bindings)) {
      const sk = key.replace(/^1:/, ''), s = states[sk], c = get(`${b.prefix}_c`);
      if (!s) { if (!sk.includes('#') && c >= 0) bad.push(`${t.toFixed(3)} ${sk}: shown, the preview leaves it`); continue; }
      if (!s.visible) { if (c >= 0) bad.push(`${t.toFixed(3)} ${sk}: shown, the preview hides it`); continue; }
      if (c < 0) { bad.push(`${t.toFixed(3)} ${sk}: hidden, the preview shows it`); continue; }
      for (const [prop, v] of [['x', 'x'], ['y', 'y'], ['scaleX', 'sx'], ['scaleY', 'sy'], ['rotation', 'r'], ['opacity', 'o'], ['value', 'v'], ['fill', 'f'], ['frame', 'fr']]) {
        if (s[prop] === undefined) continue;
        const got = get(`${b.prefix}_${v}`);
        if (!(Math.abs(got - s[prop]) <= 1e-3)) bad.push(`${t.toFixed(3)} ${sk}.${prop}: game ${got} preview ${s[prop]}`);
      }
    }
  }
  return { bad, out, pre };
}

// ---- the sequence's own tracks: every ease, transitions, keys, a path, expressions of t ----
const eases = M.EASES.filter((e) => e !== 'step');
const tracks = [
  ...eases.map((e, i) => ({ target: `e${i}`, clips: [{ start: 0.1, end: 1.2, channels: { x: [{ t: 0, v: -3, ease: e }, { t: 1, v: 17 }], y: [{ t: 0.2, v: 5, ease: e }, { t: 0.5, v: -5, ease: 'step' }, { t: 0.9, v: 2 }] } }] })),
  { target: 'bz', clips: [{ start: 0, end: 1, channels: { scaleX: [{ t: 0, v: 1, ease: { bezier: [0.68, -0.6, 0.32, 1.6] } }, { t: 1, v: 3 }] } }] },
  { target: 'tr', clips: [
    { start: 0, end: 0.8, transitionIn: { kind: 'fade', duration: 0.3, ease: 'quad-out' }, transitionOut: { kind: 'slide-left', duration: 0.25, ease: 'cubic-in' }, channels: { rotation: [{ t: 0, v: 0 }, { t: 0.8, v: 90, ease: 'linear' }] } },
    { start: 0.9, end: 1.6, transitionIn: { kind: 'pop', duration: 0.4, ease: 'linear' }, transitionOut: { kind: 'zoom', duration: 0.3, ease: 'sine-out' }, channels: { opacity: [{ t: 0, v: 0.5 }, { t: 0.6, v: 1 }] } },
    { start: 1.7, end: 2.3, transitionIn: { kind: 'slide-up', duration: 0.2, ease: 'back-out' }, transitionOut: { kind: 'slide-down', duration: 0.2, ease: 'bounce-out' }, channels: { value: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.5, v: 1000 }], fill: [{ t: 0, v: -0.5 }, { t: 0.6, v: 1.5 }] } }] },
  { target: 'pa', clips: [{ start: 0, end: 2, path: 'pp', channels: { path: [{ t: 0, v: 0, ease: 'sine-inout' }, { t: 2, v: 1 }], scaleY: [{ t: 0, v: '1 + math.sin(t * 360) * 0.5' }] } }] },
  { target: 'mu', muted: true, clips: [{ start: 0, end: 2 }] },
];
const own = (loop, inOut) => ({ version: 1, sequences: [{ id: 's', duration: 2.4, loop, inOut, tracks, paths: [{ id: 'pp', kind: 'bezier', points: [[0, 0], [20, 30], [40, -10], [60, 0]] }] }] });
const names = [...eases.map((_, i) => `e${i}`), 'bz', 'tr', 'pa', 'mu'];
for (const [loop, inOut, to] of [['once', null, 2.6], ['loop', null, 5], ['pingpong', [0.5, 2], 6], ['hold', null, 3.5]]) {
  const r = compare(own(loop, inOut), names, { to, ctx: {} });
  const bz = r.bad.filter((x) => / bz\./.test(x)), rest = r.bad.filter((x) => !/ bz\./.test(x));
  ok(!rest.length, `${loop}${inOut ? ` (in/out ${inOut})` : ''}: every element, every frame to ${to} s — the game's Molang = the preview (1e-3)`, rest.slice(0, 6).join('\n  '));
  if (loop === 'once') {
    const maxBz = Math.max(0, ...bz.map((x) => Math.abs(+/game (\S+)/.exec(x)[1] - +/preview (\S+)/.exec(x)[1])));
    ok(r.out.stats.bezierError > 0 && r.out.stats.bezierError < 0.02 && maxBz <= r.out.stats.bezierError * 2 + 1e-3 && r.out.warnings.some((w) => /16 の折れ線/.test(w)), `a Bézier ease: 16 straight pieces (largest error ${r.out.stats.bezierError.toFixed(4)}, said)`, `${maxBz}`);
  }
}

// ---- seek and pause: from (ms) and the pause flag ----
{
  const r = compare(own('once', null), names, { from: 0.75, to: 2 });
  ok(!r.bad.filter((x) => !/ bz\./.test(x)).length, 'played from 0.75 s (a seek): the same', r.bad.slice(0, 4).join('\n  '));
}

// ---- osu!: a template's instances, baked and streamed, hits and misses ----
const MAP = `osu file format v14

[Difficulty]
CircleSize:4
OverallDifficulty:8
ApproachRate:9
SliderMultiplier:1.4

[TimingPoints]
0,500,4,2,0,60,1,0

[HitObjects]
256,192,1000,5,0,0:0:0:0:
100,100,1250,1,0,0:0:0:0:
300,100,1500,1,0,0:0:0:0:
400,300,1750,1,0,0:0:0:0:
200,150,2000,2,0,B|250:100|300:150,2,140
120,320,3000,1,0,0:0:0:0:
256,192,3500,12,0,4100,0:0:0:0:
`;
const { doc: osu } = O.toDocument(O.parseOsu(MAP), { width: 120 });
const osuNames = Object.values(O.DEFAULT_ELEMENTS);
const events = [{ instance: 'o1', name: 'hit', t: 1 + 1 / 60 }, { instance: 'o2', name: 'miss', t: 1.25 + 0.15 }, { instance: 'o5', name: 'hit', t: 2 }, { instance: 'o4', name: 'hit', t: 1.75 - 3 / 60 }];
{
  const r = compare(osu, osuNames, { to: 4.6, events });
  ok(!r.bad.length, `osu! baked (${Object.values(r.out.stats.slots).map((s) => `${s.slots} slots ${s.mode}`).join(', ')}): circles, the slider's own path there and back, the spinner, hits and a miss — every frame`, r.bad.slice(0, 8).join('\n  '));
  const geo = JSON.parse(r.out.files['geoui_RP/models/entity/geoui/atlas.geo.json'])['minecraft:geometry'][0].bones.map((b) => b.name);
  const af = JSON.parse(r.out.files['geoui_RP/animations/geoui.animation.json']).animations, ent = JSON.parse(r.out.files['geoui_RP/entity/player.entity.json'])['minecraft:client_entity'].description;
  const rc = JSON.parse(r.out.files['geoui_RP/render_controllers/geoui.render_controllers.json']).render_controllers;
  ok(geo.includes('hitcircle_t0s0') && geo.includes('sliderball_t1s0') && af['animation.geoui.seq_1'].bones.hitcircle.scale === 0 && af['animation.geoui.seq_idle'].bones.hitcircle_t0s0.scale === 0 && ent.animations.geoui_seq_1 === 'animation.geoui.seq_1' && ent.scripts.animate.some((a) => a.geoui_seq_1),
    'the files: slot copies of the template\'s bones, the sequence\'s animation (the template\'s own elements hidden), idle hides the copies, the client entity plays it');
  const own2 = Object.entries(rc).filter(([id]) => /_hitcircle_t0s0$/.test(id));
  ok(own2.length === 1 && JSON.stringify(own2[0][1].part_visibility) === '[{"*":false},{"hitcircle_t0s0":true}]' && /v\.geoui_a_hitcircle_t0s0/.test(own2[0][1].color.a) && rc['controller.render.geoui_atlas'].part_visibility.some((p) => p.hitcircle_t0s0 === false),
    'opacity per element: its own render controller (only its bones), the shared one without them');
  ok(r.out.stats.longest < 8000 && r.pre.every((l) => !G.molangError(l.replace(/;$/, ''))), `every pre_animation line reads as Molang (the longest ${r.out.stats.longest} characters)`);
}
{
  const r = compare(osu, osuNames, { to: 4.6, events, ctx: { bakedMax: 0 }, quantize: true });
  ok(!r.bad.length && Object.values(r.out.stats.slots).some((s) => s.mode === 'streamed') && r.out.warnings.some((w) => /実体ごとの道/.test(w)),
    'osu! streamed (the properties as the script sets them, params packed in 24 bits): the same every frame; the slider (its own path) stays baked and says so', r.bad.slice(0, 8).join('\n  '));
}
// ---- what cannot be exported is said ----
{
  const doc = { version: 1, sequences: [{ id: 's', duration: 1, tracks: [{ target: 'nope', clips: [{ start: 0, end: 1, trigger: 'hit' }] }, { target: 'e0', clips: [{ start: 0, end: 1 }] }, { target: 'e0', clips: [{ start: 0, end: 1 }] }] }] };
  const out = C.extendPack(G.buildPack(designOf(['e0'])).files, doc, { design: designOf(['e0']), core: G });
  ok(out.warnings.some((w) => /nope.*ありません/.test(w)) && out.warnings.some((w) => /trigger/.test(w)) && out.warnings.some((w) => /2 本/.test(w)), 'said: an element that is not there, a trigger outside a template, two tracks on one element', out.warnings.join(' / '));
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-anim-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
