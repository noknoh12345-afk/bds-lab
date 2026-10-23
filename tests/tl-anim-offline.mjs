#!/usr/bin/env node
// GeoUI timeline's export to the game (bds/geoui/timeline/compile.js), no network: the pack's own Molang run frame by frame
// (1/60 s, its variables kept from frame to frame as the game keeps them) in GeoUI Builder's Molang evaluator, every element
// compared with the editor's preview (model.evaluate): position, scale, rotation, opacity, value, fill, frame — the sequence's
// own tracks with every ease and transition and loop, a template's instances baked and streamed (the properties set as the
// pack's script would set them), hits and misses. Positions are the bones' own: every animation the client entity plays
// that frame (its condition), each at its own time (anim_time_update) — an instance's own path is an animation of its own.
// A large osu! map: what it takes (properties, lines, characters) and the same comparison. node tests/tl-anim-offline.mjs
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
function compare(doc, names, { to, events = [], ctx = {}, quantize = false, dt = 1 / 60, from = 0, stateAt = null, aspect = null } = {}) {
  // (aspect: the screen's, as GeoUI's behaviour pack sets it — <ns>:aspect × 1000 — and screen.dx the preview's from it)
  const design = designOf(names);
  if (aspect) design.settings.bp = true;
  const built = G.buildPack(design), out = C.extendPack(built.files, doc, { design, core: G, ...ctx });
  const S0 = G.settingsOf(design.settings), dx = aspect ? G.r3(S0.unitsPerScreenH / 2) * (Math.round(aspect * 1000) / 1000) - G.r3(G.halfWAt(S0, S0.refAspect)) : 0;
  const ent = JSON.parse(out.files['geoui_RP/entity/player.entity.json']), pre = ent['minecraft:client_entity'].description.scripts.pre_animation;
  // (a variable read on the first frame before it is set is a content error in the game, and the game leaves every line after
  //  it undone, every frame — the whole timeline dead while its first lines still run: what the probe found, 2026-10-21)
  const unset = G.unsetReads(pre, { init: ent['minecraft:client_entity'].description.scripts.initialize });
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
  // (a bone's position: the sum of every playing animation's — an expression, or keys at the animation's own time, straight
  //  between them)
  const desc = ent['minecraft:client_entity'].description, af = JSON.parse(out.files['geoui_RP/animations/geoui.animation.json']).animations;
  const playing = (desc.scripts.animate || []).map((e) => (typeof e === 'string' ? [e, '1'] : Object.entries(e)[0])).map(([k, c]) => ({ anim: af[desc.animations[k]], cond: c })).filter((x) => x.anim);
  const sample = (keys, time) => {
    const ts = Object.keys(keys).map(Number).sort((a, b) => a - b), at = (x) => keys[Object.keys(keys).find((k) => Number(k) === x)];
    if (time <= ts[0]) return at(ts[0]);
    for (let i = 0; i < ts.length - 1; i++) if (time < ts[i + 1]) { const a = at(ts[i]), b = at(ts[i + 1]), f = (time - ts[i]) / (ts[i + 1] - ts[i]); return a.map((v, j) => v + (b[j] - v) * f); }
    return at(ts[ts.length - 1]);
  };
  const boneAt = (bone) => {
    let x = 0, y = 0, any = false;
    for (const { anim, cond } of playing) {
      const b = anim.bones[bone];
      if (!b || !b.position || !G.molang(cond, env)) continue;
      any = true;
      const v = Array.isArray(b.position) ? b.position.map((e) => (typeof e === 'number' ? e : G.molang(String(e), env))) : sample(b.position, G.molang(anim.anim_time_update || '0', env));
      x += v[0]; y += v[1];
    }
    return any ? { x, y } : null;
  };
  for (let f = 0; ; f++) {
    const t = from + f * dt;
    if (t > to + 1e-9) break;
    env.life = 100 + t;
    Object.assign(props, { 'geoui:seq': K.seqValue({ seq: 1, gen: 1 }), 'geoui:seq_from': Math.round(from * 1000) }, aspect ? { 'geoui:aspect': Math.round(aspect * 1000), 'geoui:scale': 100, 'geoui:alpha': 100 } : {});
    // (the pack's script: each slot's instance just before it shows; each slot's result — the instance that last took the
    //  slot, once it has one — 3 bits of its group's property)
    for (const s of slots) {
      const lead = s.tpl.lead, codes = [];
      for (let k = 0; k < s.slots; k++) {
        const names2 = K.names('geoui').slot(s.tag, k), mine = seq.instances.filter((x) => s.slotOf[x.id] === k).sort((a, b) => a.t - b.t);
        if (s.mode === 'streamed') {
          const x = mine.find((y) => t >= y.t - lead - 0.25 - 1e-9 && t < y.t + (y.tail ?? s.tpl.tail));
          props[names2.t] = x ? Math.round(x.t * 1000) : -1; props[names2.p] = x ? K.pack(x.params, s.tpl.pack || K.DEFAULT_PACK) : 0;
        }
        const cur = mine.filter((x) => Math.round((x.t - lead) * 1000) <= Math.round(t * 1000) + 1e-9).at(-1), ev = cur && events.filter((e) => e.instance === cur.id && e.t <= t + 1e-9).at(-1);
        codes.push(ev ? K.RESULTS.indexOf(ev.name) : 0);
      }
      if (s.events) for (let g = 0; g * K.EV_PER < s.slots; g++) props[K.names('geoui').events(s.tag, g)] = K.eventValue(codes.slice(g * K.EV_PER, (g + 1) * K.EV_PER));
    }
    // (the whole play, as the pack's script sets it: each global event's counter, and the states packed in their properties —
    //  the preview then sees the values the game reads back, 0.1 apart for the cursor)
    const gl = out.stats.budget && out.stats.budget.global, seen0 = {};
    if (gl) {
      if (gl.events.length) { const counts = {}; for (const e of events) if (!e.instance && e.t <= t + 1e-9) counts[e.name] = (counts[e.name] || 0) + 1; for (let g = 0; g * K.GE_PER < gl.events.length; g++) props[K.geName('geoui', g * K.GE_PER)] = K.geValue(gl.events, counts, g); }
      const sv = stateAt ? stateAt(t) : {};
      for (const g of gl.groups) { props[`geoui:${g}`] = K.pack(sv, K.STATE_GROUPS[g]); Object.assign(seen0, K.unpack(props[`geoui:${g}`], K.STATE_GROUPS[g])); }
      for (const [nm, so] of Object.entries(K.VALUE_STATES)) if (gl.states.includes(nm)) { props[`geoui:${so.prop}`] = Math.round((sv[nm] || 0) / so.scale); seen0[nm] = props[`geoui:${so.prop}`] * so.scale; }
    }
    G.runPre(pre, env);
    // (the preview at the game's own clock — the same float the game's Molang counted with — and each event at the time the
    //  game learnt of it: the frame its property changed)
    for (const e of events) if (e.t <= t + 1e-9 && !seenAt.has(e)) seenAt.set(e, get('v.geoui_raw'));
    const states = M.evaluate(N, seq.id, get('v.geoui_raw'), { events: events.filter((e) => seenAt.has(e)).map((e) => ({ ...e, t: seenAt.get(e) })), state: seen0, screen: { dx } });
    for (const [key, b] of Object.entries(out.stats.bindings)) {
      const sk = key.replace(/^1:/, ''), s = states[sk], c = get(`${b.prefix}_c`);
      if (!s) { if (!sk.includes('#') && c >= 0) bad.push(`${t.toFixed(3)} ${sk}: shown, the preview leaves it`); continue; }
      if (!s.visible) { if (c >= 0) bad.push(`${t.toFixed(3)} ${sk}: shown, the preview hides it`); continue; }
      if (c < 0) { bad.push(`${t.toFixed(3)} ${sk}: hidden, the preview shows it`); continue; }
      const pos = boneAt(b.bone);
      if (!pos) { bad.push(`${t.toFixed(3)} ${sk}: no animation places its bone`); continue; }
      for (const [prop, v] of [['x', 'x'], ['y', 'y'], ['scaleX', 'sx'], ['scaleY', 'sy'], ['rotation', 'r'], ['rotationX', 'rx'], ['rotationY', 'ry'], ['opacity', 'o'], ['value', 'v'], ['fill', 'f'], ['frame', 'fr']]) {
        if (s[prop] === undefined) continue;
        const got = prop === 'x' || prop === 'y' ? pos[prop] : get(`${b.prefix}_${v}`);
        if (!(Math.abs(got - s[prop]) <= 1e-3)) bad.push(`${t.toFixed(3)} ${sk}.${prop}: game ${got} preview ${s[prop]}`);
      }
    }
  }
  if (unset.length) bad.unshift(`the first frame reads variables before they are set (the game stops there): ${unset.join(', ')}`);
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

// ---- at the very edges: a clip's start and end, a key's time, a transition's edge, a loop's seam, a pingpong's turn — exactly
//      there and a millisecond either side, the game's Molang and the preview pick the same clip, segment and value
//      (a time on an edge belongs to what starts there: the model's rule, and compile's `<` / `>=`)
{
  const edges = [0.1, 1.2, 0.8, 0.9, 1.6, 1.7, 2.3, 0.3, 0.55, 1.3, 1.9, 2.1, 0.2 + 0.1, 0.5 + 0.1, 0.9 + 0.1, 1.1];
  const at = (doc, list) => list.flatMap((T) => [T - 1e-3, T, T + 1e-3]).flatMap((T) => compare(doc, names, { from: T, to: T }).bad.filter((x) => !/ bz\./.test(x)).map((x) => `@${T.toFixed(4)} ${x}`));
  const once = at(own('once', null), edges);
  ok(!once.length, `the edges of clips, keys and transitions (${edges.length} times, exactly and ±1 ms): the same`, once.slice(0, 6).join('\n  '));
  const seams = [...at(own('loop', null), [2.4, 4.8]), ...at(own('pingpong', [0.5, 2]), [2, 3.5, 5]), ...at(own('hold', null), [2.4])];
  ok(!seams.length, 'a loop\'s seams (2.4, 4.8), a pingpong\'s turns (2, 3.5, 5) and a hold\'s end: the same', seams.slice(0, 6).join('\n  '));
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
  // (its own controller draws only its bones, and not at all while fully transparent; through the fade material — the colour
  //  mask: a plain blend ignores the controller's alpha in the game (geoui_probe, 2026-10-21) — declared by the entity)
  const mat = JSON.parse(r.out.files['geoui_RP/materials/entity.material']).materials['geoui_fade:geoui_base'];
  ok(own2.length === 1 && JSON.stringify(own2[0][1].part_visibility) === '[{"*":false},{"hitcircle_t0s0":"v.geoui_a_hitcircle_t0s0 > 0.004"}]' && /v\.geoui_a_hitcircle_t0s0/.test(own2[0][1].color.a)
    && own2[0][1].materials.at(-1).hitcircle_t0s0 === 'material.geoui_fade' && mat && mat['+defines'].includes('USE_COLOR_MASK') && mat['+states'].includes('Blending') && ent.materials.geoui_fade === 'geoui_fade'
    && rc['controller.render.geoui_atlas'].part_visibility.some((p) => p.hitcircle_t0s0 === false) && ent.scripts.initialize.includes('v.geoui_a_hitcircle_t0s0 = 1;') && ent.scripts.initialize.includes('v.geoui_seq = 0;'),
    'opacity per element: its own render controller (only its bones, none while fully transparent, the fade material with the colour mask), the shared one without them, starting values in initialize');
  ok(r.out.stats.longest <= 1000 && r.out.stats.deepest <= 24 && r.pre.every((l) => !G.molangError(l.replace(/;$/, ''))), `every pre_animation line reads as Molang (the longest ${r.out.stats.longest} characters, ${r.out.stats.deepest} brackets deep)`);
  // (the slider's ball: its own path is an animation of the instance's, timed by the slot's progress, played only while the
  //  slot shows that instance — its keys straight between, half the length long)
  const ip = Object.entries(af).filter(([k]) => /^animation\.geoui\.ip_1_t1s0_o5$/.test(k));
  ok(ip.length === 1 && /math\.clamp\(v\.geoui_1_t1s0_\d+_u, 0, 1\) \* 0\.5/.test(ip[0][1].anim_time_update) && Object.keys(ip[0][1].bones.sliderball_t1s0.position).every((k) => +k >= 0 && +k <= 0.5)
    && ent.scripts.animate.some((a) => a.geoui_ip_1_t1s0_o5 === 'q.is_in_ui && v.geoui_seq == 1 && v.geoui_1_t1s0_i == 0'), 'an instance\'s own path: its own animation (anim_time_update by the slot\'s progress, keys over half its length), played while its slot shows it', JSON.stringify(ip[0] && ip[0][1]).slice(0, 300));
}
{
  const r = compare(osu, osuNames, { to: 4.6, events, ctx: { bakedMax: 0 }, quantize: true });
  ok(!r.bad.length && r.out.stats.slots['1:osu-circle'].mode === 'streamed' && r.out.stats.slots['1:osu-slider'].mode === 'baked' && r.out.warnings.some((w) => /pack.*焼き込み/.test(w)),
    'osu! streamed (the properties as the script sets them, params packed in 24 bits): the same every frame; the slider (params past its pack) stays baked and says so', r.bad.slice(0, 8).join('\n  ') + ' ' + r.out.warnings.join(' / '));
}
// ---- a map of real size (osu.sampleMap: 300 objects — circles, sliders of every curve and their slides, spinners) ----
//      what it takes — the player's properties within the game's 32 with GeoUI's own, every line short and shallow — and the
//      same comparison every frame (1/20 s over 40 s), hits and misses on every other object
{
  const { doc: big } = O.toDocument(O.parseOsu(O.sampleMap(300)), { width: 120 });
  const xs = big.sequences[0].instances, judged = xs.filter((x) => x.template !== 'osu-spinner');
  const evs = judged.map((x, i) => (i % 2 ? { instance: x.id, name: 'miss', t: x.t + 0.15 } : { instance: x.id, name: 'hit', t: x.t + 0.02 }));
  const design = { ...designOf(osuNames), settings: { ns: 'geoui', bp: true } }, built = G.buildPack(design);
  const out = C.extendPack(built.files, big, { design, core: G });
  const R = require('../bds/geoui/timeline/runtime.js'), bp = R.extendBehavior(out.files, big, { stats: out.stats });
  const props = Object.keys(JSON.parse(bp.files['geoui_BP/entities/player.json'])['minecraft:entity'].description.properties).length;
  const st = out.stats;
  ok(props <= 32 && st.budget.total === props && !bp.warnings.some((w) => /プロパティ/.test(w)) && st.longest <= 1000 && st.deepest <= 24 && st.chars < 400000 && Object.values(st.slots).every((x) => x.mode === 'baked'),
    `300 objects: ${props} properties on the player with GeoUI's 11 (the game takes 32), ${st.lines} lines, the longest ${st.longest} characters and ${st.deepest} brackets deep, ${Math.round(st.chars / 1000)}k characters, every template baked`,
    JSON.stringify({ props, total: st.budget.total, longest: st.longest, deepest: st.deepest, chars: st.chars, warnings: [...out.warnings, ...bp.warnings].filter((w) => !/コマ|音/.test(w)) }));
  const r = compare(big, osuNames, { to: 40, events: evs, dt: 1 / 20 });
  ok(!r.bad.length, `300 objects: every element of every instance, every frame (1/20 s) to 40 s with ${evs.filter((e) => e.t < 40).length} hits and misses — the game's Molang = the preview`, r.bad.slice(0, 8).join('\n  '));
}

// ---- the whole play (2026-10-23): a tilt out of the screen (rotationX / rotationY, the bone's rotation about x and y), clips on
//      the sequence's own tracks answering any instance's event (a shake on every miss, a pop on every hit — <ns>:ge's
//      counters), and the states the script keeps live (state.cx / cy / hold / combo / spin) in expressions — the game's Molang
//      against the preview frame by frame, the properties set as the script sets them
{
  const doc = { version: 1, sequences: [{ id: 's', duration: 4, tracks: [
    { target: 'fd', clips: [{ start: 0, end: 4, channels: { rotationX: [{ t: 0, v: -20, ease: 'sine-inout' }, { t: 2, v: 15 }, { t: 4, v: -20 }], rotationY: [{ t: 0, v: '10 * math.sin(t * 90)' }] } }] },
    { target: 'sh', clips: [{ start: 0, end: 0.4, trigger: 'miss', channels: { x: [{ t: 0, v: '4 * math.sin(t * 2700) * (1 - t / 0.4)' }], rotation: [{ t: 0, v: 6, ease: 'quad-out' }, { t: 0.4, v: 0 }] } }] },
    { target: 'po', clips: [{ start: 0, end: 0.2, trigger: 'hit', channels: { scaleX: [{ t: 0, v: 1.4, ease: 'quad-out' }, { t: 0.2, v: 1 }], scaleY: [{ t: 0, v: 1.4, ease: 'quad-out' }, { t: 0.2, v: 1 }] } }] },
    { target: 'cu', clips: [{ start: 0, end: 4, channels: { x: [{ t: 0, v: 'state.cx' }], y: [{ t: 0, v: 'state.cy' }], opacity: [{ t: 0, v: '0.5 + state.hold * 0.5' }], value: [{ t: 0, v: 'state.combo' }], rotation: [{ t: 0, v: 'state.sa' }], fill: [{ t: 0, v: 'state.spin' }] } }] },
    { target: 'gu', clips: [{ start: 0.5, end: 3.5, until: 'break', channels: { opacity: [{ t: 0, v: 1 }] } }] },
  ] }] };
  const events = [{ name: 'hit', t: 0.5 }, { name: 'great', t: 0.5 }, { name: 'miss', t: 1.2 }, { name: 'hit', t: 1.9 }, { name: 'miss', t: 2.6 }, { name: 'break', t: 2.6 }, { name: 'miss', t: 2.8 }];
  const stateAt = (t) => ({ cx: 30 * Math.sin(t * 2), cy: -20 + 10 * t, hold: t > 1 && t < 2.5 ? 1 : 0, combo: Math.floor(t * 3), sa: (t * 200) % 358, spin: Math.min(1, t / 3) });
  const r = compare(doc, ['fd', 'sh', 'po', 'cu', 'gu'], { to: 4, events, stateAt });
  const b = r.out.stats.budget.global, props = Object.keys(JSON.parse(r.out.files['geoui_RP/entity/player.entity.json']) && {});
  ok(!r.bad.length && b.events.join() === 'miss,hit,break' && b.groups.join() === 'cur,sp' && b.states.includes('combo'), 'the whole play: a tilt (rotationX / Y), a shake on every miss and a pop on every hit (global events), until a combo break, the cursor / hold / combo / spinner from the script\'s states — the game\'s Molang = the preview every frame', `${r.bad.slice(0, 6).join('\n  ')} ${JSON.stringify(b)} ${props}`);
  const anim = JSON.parse(r.out.files['geoui_RP/animations/geoui.animation.json']).animations['animation.geoui.seq_1'];
  ok(JSON.stringify(anim.bones.fd.rotation) === JSON.stringify(['v.geoui_1_0_rx', 'v.geoui_1_0_ry', 0]) && JSON.stringify(anim.bones.sh.rotation) === JSON.stringify([0, 0, 'v.geoui_1_1_r']), 'a tilt is the bone\'s rotation about x and y (the turn in the screen\'s plane about z, as before)', JSON.stringify([anim.bones.fd.rotation, anim.bones.sh.rotation]));
}

// ---- screen.dx (2026-10-23): an element anchored to one side going to the middle (osu!'s results: the score from the HUD's top
//      right into the ranking panel) takes away how much wider half the screen is than the reference aspect's — GeoUI's own
//      v.geoui_halfw, from the aspect its behaviour pack sets — the game's Molang against the preview at 4:3, 16:9 and 19.5:9
{
  const doc = { version: 1, sequences: [{ id: 's', duration: 2, tracks: [{ target: 'sd', clips: [{ start: 0, end: 2, channels: { x: [{ t: 0, v: 0, ease: 'quad-inout' }, { t: 1, v: '40 - screen.dx' }], y: [{ t: 0, v: 'screen.dx * 0.5' }], scaleX: [{ t: 0, v: '1 + screen.dx / 100' }] } }] }] }] };
  const runs = [4 / 3, 16 / 9, 2.1667].map((aspect) => ({ aspect, r: compare(doc, ['sd'], { to: 2, aspect }) }));
  const ys = runs.map(({ r }) => r.out.stats.bindings), molang = JSON.stringify(runs[0].r.out.stats.pre || runs[0].r.pre);
  ok(runs.every(({ r }) => !r.bad.length) && /v\.geoui_halfw \?\? /.test(molang), `screen.dx: the game's Molang (GeoUI's v.geoui_halfw, read through ??) = the preview at 4:3, 16:9 and 19.5:9`, runs.map(({ aspect, r }) => `${aspect.toFixed(3)}: ${r.bad.slice(0, 3).join(' / ')}`).join('\n  '));
  const M0 = M.normalize(doc), at = (dx) => M.evaluate(M0, 's', 1.5, { screen: { dx } }).sd;
  ok(at(0).x === 40 && at(33).x === 7 && at(-38).x === 78 && at(33).y === 16.5 && M.exprError('screen.dx + 1') === null && /screen\.dx/.test(M.exprError('screen.dy') || ''),
    'screen.dx in the preview: 0 at the reference aspect, what opts.screen says otherwise; screen.dy is not a word (said, with screen.dx among the words)', JSON.stringify([at(0), at(33), at(-38), M.exprError('screen.dy')]));
  void ys;
}

// ---- a template's number in its slot copies: each copy picks its own numerals (2026-10-23: before, a copy had no digit
//      variables and all ten numerals of each digit showed at once)
{
  const digits = (name) => Array.from({ length: 2 }, (_, k) => Array.from({ length: 10 }, (__, d) => `${name}_d${k}_${d}`));
  const design = designOf(['nm']);
  design.bones = design.bones.filter((b) => b.name !== 'nm').concat([{ name: 'nm', parent: 'geo_ui', pivot: [0, 140, 0] }],
    digits('nm').flat().map((b, i) => ({ name: b, parent: 'nm', pivot: [0, 140, 0], cubes: [{ origin: [-5 + (i >= 10 ? 5 : 0), 135, -0.02 * (i % 10)], size: [4, 7, 0], faces: { north: { uv: [0, 0], uv_size: [4, 7], texture: 't' } } }] })));
  design.elements.nm = { type: 'number', number: { source: '0', digits: digits('nm'), hideLeadingZero: true } };
  const doc = { version: 1, sequences: [{ id: 's', duration: 3, templates: [{ id: 'tp', name: 'n', lead: 0.2, tail: 0.3, params: ['n'], tracks: [{ target: 'nm', clips: [{ start: -0.2, end: 0.3, channels: { value: [{ t: 0, v: 'param.n' }] } }] }] }],
    instances: [{ id: 'a', template: 'tp', t: 0.5, params: { n: 7 } }, { id: 'b', template: 'tp', t: 0.6, params: { n: 42 } }] }] };
  const out = C.extendPack(G.buildPack(design).files, doc, { design, core: G });
  const ent = JSON.parse(out.files['geoui_RP/entity/player.entity.json']).description || JSON.parse(out.files['geoui_RP/entity/player.entity.json'])['minecraft:client_entity'].description;
  const tf = JSON.parse(out.files['geoui_RP/animations/geoui.animation.json']).animations['animation.geoui_transform'].bones;
  const vars = {}, env = { vars, query(n0, a) { if (n0 === 'query.property') return a[0] === 'geoui:seq' ? K.seqValue({ seq: 1, gen: 1 }) : 0; if (n0 === 'query.life_time') return this.life; return n0 === 'query.is_in_ui' ? 1 : undefined; }, life: 100 };
  env.query = env.query.bind(env);
  G.runPre(ent.scripts.pre_animation, env); env.life = 100.55; G.runPre(ent.scripts.pre_animation, env);
  const shown = (slot) => digits('nm').map((ds) => ds.filter((b) => G.molang(String(tf[`${b}_${slot}`] && tf[`${b}_${slot}`].scale), env)).map((b) => b.slice(-1)).join('') || '-').join('');
  ok(shown('t0s0') === '-7' && shown('t0s1') === '42', 'a number\'s slot copies: each shows its own instance\'s value (one numeral a digit, the leading zero blank)', `${shown('t0s0')} ${shown('t0s1')}`);
}

// ---- what cannot be exported is said ----
{
  // (a trigger on a sequence's own track answers the whole play's events — 'hit', 'miss'…: contract.GLOBAL_EVENTS — and one
  //  the game never raises is said, as before; before 2026-10-23 every trigger outside a template was)
  const doc = { version: 1, sequences: [{ id: 's', duration: 1, tracks: [{ target: 'nope', clips: [{ start: 0, end: 1, trigger: 'boom' }] }, { target: 'e0', clips: [{ start: 0, end: 1 }] }, { target: 'e0', clips: [{ start: 0, end: 1 }] }] }] };
  const out = C.extendPack(G.buildPack(designOf(['e0'])).files, doc, { design: designOf(['e0']), core: G });
  ok(out.warnings.some((w) => /nope.*ありません/.test(w)) && out.warnings.some((w) => /trigger.*boom|boom.*出来事/.test(w)) && out.warnings.some((w) => /2 本/.test(w)), 'said: an element that is not there, a trigger the game never raises, two tracks on one element', out.warnings.join(' / '));
  const doc2 = { version: 1, sequences: [{ id: 's', duration: 1, tracks: [{ target: 'e0', clips: [{ start: 0, end: 1, trigger: 'miss' }] }] }] };
  const out2 = C.extendPack(G.buildPack(designOf(['e0'])).files, doc2, { design: designOf(['e0']), core: G });
  ok(!out2.warnings.some((w) => /trigger/.test(w)) && out2.stats.budget.global.events.join() === 'miss', 'a trigger on a sequence\'s own track that the game raises (miss): no warning, a global event', out2.warnings.join(' / '));
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-anim-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
