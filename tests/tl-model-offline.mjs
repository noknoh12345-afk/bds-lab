#!/usr/bin/env node
// GeoUI timeline's model (bds/geoui/timeline/model.js), no network, no browser: easing, time and the beat grid, motion paths
// at constant speed. node tests/tl-model-offline.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../bds/geoui/timeline/model.js');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- easing ----
ok(M.EASES.length === 2 + 10 * 3 && M.EASES.every((e) => M.ease(e, 0) === 0 && M.ease(e, 1) === 1), `every ease (${M.EASES.length}) starts at 0 and ends at 1`);
const mids = { linear: 0.5, 'quad-in': 0.25, 'cubic-out': 0.875, 'sine-inout': 0.5, 'quart-in': 0.0625, 'back-in': -0.0876975, 'bounce-out': 0.765625, 'elastic-out': 1.0153809, 'expo-inout': 0.5, 'circ-inout': 0.5 };
const badMid = Object.entries(mids).filter(([e, v]) => !near(M.ease(e, 0.5), v, 1e-6)).map(([e, v]) => `${e}: ${M.ease(e, 0.5)} ≠ ${v}`);
ok(!badMid.length, 'the curves at their middle (Penner\'s values)', badMid.join(' / '));
ok(M.EASES.every((e) => e === 'step' || (Math.abs(M.ease(e, 1e-12)) < 1e-4 && Math.abs(M.ease(e, 1 - 1e-12) - 1) < 1e-4)), 'every curve meets 0 and 1 without a jump (expo and elastic made to)');
ok(M.ease('step', 0.999) === 0 && M.ease('linear', 0.3) === 0.3 && M.ease('nonsense', 0.3) === 0.3 && M.ease('quad-in', 2) === 1 && M.ease('quad-in', -1) === 0, 'step holds, an unknown ease is linear, x is held to 0..1');
ok(M.EASES.filter((e) => e.endsWith('-inout')).every((e) => near(M.ease(e, 0.3) + M.ease(e, 0.7), 1, 1e-9)), 'every in-out curve is symmetric about its middle');
ok(near(M.ease({ bezier: [0, 0, 1, 1] }, 0.3), 0.3, 1e-6) && near(M.ease({ bezier: [0.25, 0.1, 0.25, 1] }, 0.5), 0.8024033877, 1e-5) && near(M.ease({ bezier: [0.42, 0, 0.58, 1] }, 0.5), 0.5, 1e-6),
  'cubic Bézier: the straight one, CSS ease at 50 % (0.8024), ease-in-out symmetric', `${M.ease({ bezier: [0.25, 0.1, 0.25, 1] }, 0.5)}`);
ok(near(M.ease({ bezier: [0.68, -0.6, 0.32, 1.6] }, 0.1), M.bezierAt([0.68, -0.6, 0.32, 1.6], 0.1)) && M.ease({ bezier: [0.68, -0.6, 0.32, 1.6] }, 0.1) < 0 && M.isEase({ bezier: [0, 0, 1, 1] }) && !M.isEase({ bezier: [0, 0, 1] }) && M.isEase('back-out') && !M.isEase('back'),
  'a Bézier may overshoot (y outside 0..1); isEase knows the names and the Bézier form');

// ---- time ----
ok(M.timecode(61.5, 20) === '01:01:10' && M.timecode(0, 20) === '00:00:00' && M.timecode(-0.5, 20) === '-00:00:10' && M.timecode(3600, 60) === '60:00:00' && M.timecode(3599.99, 60) === '59:59:59', 'timecode mm:ss:ff', M.timecode(3600, 60));
ok(M.parseTimecode('01:01:10', 20) === 61.5 && M.parseTimecode('2.25') === 2.25 && M.parseTimecode('03:05', 20) === 3.25 && Number.isNaN(M.parseTimecode('00:01:25', 20)) && Number.isNaN(M.parseTimecode('abc')), 'parseTimecode: mm:ss:ff, ss:ff, seconds; a frame past fps is no timecode');
ok(M.toFrames(1.26, 20) === 25 && M.fromFrames(25, 20) === 1.25, 'frames ↔ seconds');

// ---- beats (a tempo point restarts the grid on a whole beat, as osu!'s timing points do) ----
const seq = { tempo: [{ t: 1.1, bpm: 60, meter: 3 }, { t: 0, bpm: 120 }] };
ok(near(M.beatAt(seq, 0.5), 1) && near(M.beatAt(seq, 1.1), 3) && near(M.beatAt(seq, 2.1), 4) && near(M.beatAt({}, 1), 2), 'beatAt: 120 BPM, then 60 BPM from 1.1 s on a new whole beat (2.2 → 3); no tempo is 120 BPM');
ok(near(M.timeAtBeat(seq, 3), 1.1) && near(M.timeAtBeat(seq, 2.5), 1.1) && near(M.timeAtBeat(seq, 1), 0.5) && near(M.timeAtBeat(seq, 5), 3.1), 'timeAtBeat: the inverse (a skipped beat → the tempo point)');
ok(near(M.snapToBeat(seq, 0.26, 4), 0.25) && near(M.snapToBeat(seq, 0.26, 3), 0.3333333, 1e-6) && near(M.snapToBeat(seq, 1.6, 2), 1.6) && near(M.snapToBeat(seq, 1.74, 2), 1.6),
  'snapToBeat: quarter beats, triplets, across the tempo change');
const bb = [M.barBeat(seq, 0.5), M.barBeat(seq, 1.1), M.barBeat(seq, 4.2)];
ok(JSON.stringify(bb) === JSON.stringify([{ bar: 1, beat: 2 }, { bar: 2, beat: 1 }, { bar: 3, beat: 1 }]), 'barBeat: a tempo point starts a new bar (3/4 after it)', JSON.stringify(bb));

// ---- paths at constant speed ----
const line = { kind: 'linear', points: [[0, 0], [10, 0], [10, 10]] };
ok(M.pathLength(line) === 20 && JSON.stringify(M.pathPoint(line, 0.75)) === '[10,5]' && JSON.stringify(M.pathPoint(line, 0)) === '[0,0]', 'linear: length and a point by arc length');
ok(JSON.stringify(M.pathPoint({ kind: 'linear', points: [[0, 0], [10, 0]] }, 1, { length: 15 })) === '[15,0]' && JSON.stringify(M.pathPoint({ kind: 'linear', points: [[0, 0], [10, 0]] }, 1, { length: 5 })) === '[5,0]',
  "osu!'s pixel length: longer goes on straight, shorter cuts the path");
const arc = { kind: 'arc', points: [[0, 0], [10, 10], [20, 0]] }, am = M.pathPoint(arc, 0.5);
ok(Math.abs(M.pathLength(arc) - Math.PI * 10) / (Math.PI * 10) < 0.005 && near(am[0], 10, 0.05) && near(am[1], 10, 0.05), 'arc: the circle through 3 points (half a circle of r 10), its middle', `${M.pathLength(arc)} ${am}`);
const arc2 = { kind: 'arc', points: [[0, 0], [10, -10], [20, 0]] };
ok(M.pathPoint(arc2, 0.5)[1] < -9.9 && JSON.stringify(M.pathTable({ kind: 'arc', points: [[0, 0], [5, 0], [10, 0]] }).pts) === '[[0,0],[5,0],[10,0]]', 'arc: the way round that passes the middle point; collinear points are a line');
const qb = { kind: 'bezier', points: [[0, 0], [10, 20], [20, 0]] }, mid = M.pathPoint(qb, 0.5);
const steps = Array.from({ length: 101 }, (_, k) => M.pathPoint(qb, k / 100)), gaps = steps.slice(1).map((p, k) => Math.hypot(p[0] - steps[k][0], p[1] - steps[k][1]));
ok(near(mid[0], 10, 1e-6) && near(mid[1], 10, 0.01) && Math.max(...gaps) / Math.min(...gaps) < 1.005, 'bezier: the apex at half its length, equal steps along it (constant speed, 0.5 %)', `${mid} ${Math.min(...gaps)} ${Math.max(...gaps)}`);
const red = M.pathTable({ kind: 'bezier', points: [[0, 0], [10, 0], [10, 0], [10, 10]] }).pts;
ok(red.every((p) => near(p[1], 0) || near(p[0], 10)), "bezier: a point given twice splits it (osu!'s red anchor: two straight pieces)");
const cm = { kind: 'catmull', points: [[0, 0], [10, 5], [20, 0]] }, cmPts = M.pathTable(cm).pts;
ok([[0, 0], [10, 5], [20, 0]].every((q) => cmPts.some((p) => near(p[0], q[0]) && near(p[1], q[1]))), 'catmull: through every point');
const tbl = M.pathTable(qb);
ok(M.pathTable(qb) === tbl && M.pathLength({ points: [] }) === 0 && JSON.stringify(M.pathPoint({ points: [[3, 4]] }, 0.5)) === '[3,4]', 'the table is kept per path object; an empty or one-point path is a point');


// ---- expressions over a template's params (Molang's meaning: math.sin in degrees) ----
ok(M.exprFn('param.x * 2 + math.sin(90)')({ x: 3 }) === 7 && M.exprFn('-(param.a - 1) / 2')({ a: 5 }) === -2 && M.exprFn('math.clamp(param.v, 0, 1) + math.pi * 0')({ v: 7 }) === 1 && M.exprFn('param.missing + 1')({}) === 1,
  'expressions: params, + - * /, unary minus, parentheses, math.* (sin in degrees)');
ok(['param.x +', 'alert(1)', 'param.x % 2', 'this.constructor', 'math.nope(1)'].every((e) => M.exprError(e)) && M.exprError('1 + 2') === null, 'expressions: anything else is refused, never run');

// ---- the document ----
const W = (doc) => JSON.parse(JSON.stringify(doc));
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const raw = { sequences: [{ id: 's', duration: 4, tracks: [
  { id: 'a', target: 'title', clips: [{ id: 'c1', start: 0, end: 2, channels: { x: [{ t: 1, v: 10, ease: 'quad-in' }, { t: 0, v: 0, ease: 'bogus' }] } }, { id: 'c1', start: 1.5, end: 2.5 }] },
  { target: 'gauge', clips: [] }] }] };
const N = M.normalize(raw), s0 = N.sequences[0], [c1, c2] = s0.tracks[0].clips;
ok(N.version === 1 && s0.fps === 20 && s0.loop === 'once' && s0.inOut === null && c1.id === 'c1' && c2.id !== 'c1' && c2.start === 2 && c2.end === 3 && c1.channels.x[0].t === 0 && c1.channels.x[0].ease === 'linear' && s0.tracks[1].id && s0.tracks[1].name === 'gauge',
  'normalize: defaults, a repeated id made new, clips pushed apart (length kept), keys in order, an unknown ease linear', JSON.stringify(s0.tracks[0].clips.map((c) => [c.id, c.start, c.end])));
ok(JSON.stringify(M.normalize(W(N))) === JSON.stringify(N), 'normalize: a normalized document comes back the same (JSON round trip)');
const bad = M.validate(raw).join('\n');
ok(/「c1」が 2 回/.test(bad) && /前のクリップと重なっています/.test(bad) && /イージング "bogus"/.test(bad) && M.validate(N).length === 0 && M.validate({}).length === 1, 'validate: repeated ids, overlaps, unknown eases (Japanese); a normalized document has none', bad);

// ---- evaluate ----
const ev = (doc, t, o) => M.evaluate(doc, 's', t, o);
let st = ev(N, 0.5);
ok(st.title.visible && st.title.x === 5 && st.title.opacity === 1 && st.title.scaleX === 1 && !('gauge' in st) && !('value' in st.title), 'evaluate: the segment takes its first key\'s ease (here linear: the unknown one), the rest at their defaults; a track with no clips is left alone');
const qd = M.normalize({ sequences: [{ id: 's', duration: 2, tracks: [{ target: 'e', clips: [{ start: 0, end: 2, channels: { x: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 1, v: 10 }] } }] }] }] });
ok(M.evaluate(qd, 's', 0.5).e.x === 2.5, 'evaluate: quad-in from the first key (0 → 10: 2.5 at the middle)');
ok(ev(N, 1).title.x === 10 && ev(N, 1.99).title.x === 10 && ev(N, 2).title.x === 0 && ev(N, 3).title.visible === false, 'evaluate: on a key exactly its value, after the last key the last value; the next clip from its start exactly; after the clips hidden');
const tr = (extra, keys) => M.normalize({ sequences: [{ id: 's', duration: 2, ...extra, tracks: [{ id: 'a', target: 'e', clips: [{ id: 'c', start: 0, end: 2, ...keys }] }] }] });
const fade = tr({}, { transitionIn: { kind: 'fade', duration: 0.5, ease: 'linear' }, transitionOut: { kind: 'slide-left', duration: 0.5, ease: 'linear' } });
ok(ev(fade, 0.25).e.opacity === 0.5 && ev(fade, 1).e.opacity === 1 && ev(fade, 1.75).e.x === -20 && ev(fade, 1).e.x === 0, 'transitions: fade in (half way: half), slide out to the left (40 units)');
const pop = tr({}, { transitionIn: { kind: 'pop', duration: 1, ease: 'linear' } });
ok(Math.abs(ev(pop, 0.7).e.scaleX - 1.1) < 1e-9 && ev(pop, 1).e.scaleX === 1 && Math.abs(ev(pop, 0.35).e.scaleY - 0.55) < 1e-9, 'pop: 0 → 1.1 → 1');
const loopDoc = (loop, inOut = null) => tr({ loop, inOut }, { channels: { x: [{ t: 0, v: 0 }, { t: 2, v: 20 }] } });
ok(ev(loopDoc('loop'), 2.5).e.x === 5 && ev(loopDoc('loop'), 2).e.x === 0 && ev(loopDoc('pingpong'), 3).e.x === 10 && Math.abs(ev(loopDoc('hold'), 9).e.x - 20) < 1e-4 && ev(loopDoc('once'), 9).e.visible === false && ev(loopDoc('loop', [1, 2]), 2.25).e.x === 12.5,
  'loop (an exact round is the start again), pingpong, hold (its last picture), once (over), loop over the in/out range');
const two = M.normalize({ sequences: [{ id: 's', duration: 2, tracks: [{ id: 'a', target: 'e', muted: true, clips: [{ start: 0, end: 2 }] }, { id: 'b', target: 'f', clips: [{ start: 0, end: 2 }] }, { id: 'c', target: 'g', solo: true, clips: [{ start: 0, end: 2 }] }] }] });
st = ev(two, 1);
ok(st.e.visible === false && st.f.visible === false && st.g.visible === true, 'muted hides; solo shows only the solo tracks');
const pathDoc = M.normalize({ sequences: [{ id: 's', duration: 2, paths: [{ id: 'p', kind: 'linear', points: [[0, 0], [10, 0]] }], tracks: [{ target: 'e', clips: [{ start: 0, end: 2, path: 'p', channels: { path: [{ t: 0, v: 0 }, { t: 1, v: 1 }], y: [{ t: 0, v: 3 }] } }] }] }] });
ok(ev(pathDoc, 0.5).e.x === 5 && ev(pathDoc, 0.5).e.y === 3 && ev(pathDoc, 1.5).e.x === 10, 'a path channel: the point along it (0..1) added to x, y');
const game = M.normalize({ sequences: [{ id: 's', duration: 10,
  templates: [{ id: 'hc', lead: 1, tail: 0.5, params: ['x'], tracks: [
    { target: 'circle', clips: [{ start: -1, end: 0.5, until: 'hit', channels: { x: [{ t: 0, v: 'param.x' }] } }] },
    { target: 'ring', clips: [{ start: -1, end: 0, channels: { scaleX: [{ t: 0, v: 3 }, { t: 1, v: 1 }] } }] },
    { target: 'burst', clips: [{ start: 0, end: 0.3, trigger: 'hit', channels: { opacity: [{ t: 0, v: 1 }, { t: 0.3, v: 0 }] } }] }] }],
  instances: [{ id: 'i2', template: 'hc', t: 4, params: { x: -5 } }, { id: 'i1', template: 'hc', t: 2, params: { x: 10 } }] }] });
st = ev(game, 1.5);
ok(st['circle#i1'].x === 10 && st['ring#i1'].scaleX === 2 && st['burst#i1'].visible === false && !('circle#i2' in st), 'instances: shown from t − lead (params in expressions, keys from the hit time), the others not at all', JSON.stringify(st));
ok(!('circle#i1' in ev(game, 0.9)) && !('circle#i1' in ev(game, 2.5)) && ev(game, 3.2)['circle#i2'].x === -5, 'instances: gone before t − lead and from t + tail');
st = ev(game, 2.2, { events: [{ instance: 'i1', name: 'hit', t: 2.1 }] });
ok(st['circle#i1'].visible === false && Math.abs(st['burst#i1'].opacity - 2 / 3) < 1e-9 && ev(game, 2.05, { events: [{ instance: 'i1', name: 'hit', t: 2.1 }] })['circle#i1'].visible === true && ev(game, 2.2, { events: [{ instance: 'i2', name: 'hit', t: 2.1 }] })['burst#i1'].visible === false,
  'events: until cuts the circle at the hit, the trigger clip plays from it — only for its own instance');

// ---- reduce (the input frozen: any change to it throws) ----
const base = deepFreeze(M.normalize({ sequences: [{ id: 's', duration: 10, markers: [{ id: 'm', t: 5 }], tracks: [
  { id: 'A', target: 'e', clips: [{ id: 'a1', start: 0, end: 2, channels: { x: [{ t: 0, v: 0 }, { t: 2, v: 20 }] } }, { id: 'a2', start: 3, end: 4 }] },
  { id: 'B', target: 'f', clips: [{ id: 'b1', start: 1, end: 2 }] }, { id: 'L', target: 'g', locked: true, clips: [{ id: 'l1', start: 0, end: 1 }] }] }] }));
const R = (intent) => M.reduce(base, { seq: 's', ...intent });
const clipsOf = (r, tr) => r.doc.sequences[0].tracks.find((x) => x.id === tr).clips.map((c) => [c.id, +c.start.toFixed(6), +c.end.toFixed(6)]);
let r = R({ type: 'clip.add', track: 'A', start: 1, end: 2 });
ok(r.ok && JSON.stringify(clipsOf(r, 'A').map((c) => c.slice(1))) === '[[0,2],[2,3],[3,4]]' && r.doc !== base && base.sequences[0].tracks[0].clips.length === 2, 'clip.add: put where it fits nearest (between the two), the old document unchanged', JSON.stringify(r));
r = R({ type: 'clip.move', ids: ['a2'], dt: -2.5 });
ok(r.ok && JSON.stringify(clipsOf(r, 'A')) === '[["a1",0,2],["a2",2,3]]', 'clip.move: onto a neighbour → the nearest free place', JSON.stringify(r.doc && clipsOf(r, 'A')));
r = R({ type: 'clip.move', ids: ['a2'], dt: 0.95, snap: true, snapTol: 0.1 });
ok(r.ok && clipsOf(r, 'A')[1][2] === 5, 'clip.move with snap: its end onto the marker at 5', JSON.stringify(r.doc && clipsOf(r, 'A')));
r = R({ type: 'clip.move', ids: ['b1'], dt: 3, dTrack: -1 });
ok(r.ok && clipsOf(r, 'B').length === 0 && JSON.stringify(clipsOf(r, 'A')) === '[["a1",0,2],["a2",3,4],["b1",4,5]]', 'clip.move to another track (nearest free there)', JSON.stringify(r.doc && clipsOf(r, 'A')));
r = R({ type: 'clip.trim', id: 'a1', edge: 'start', t: 1 });
const a1 = r.doc.sequences[0].tracks[0].clips[0];
ok(r.ok && a1.start === 1 && a1.offset === 1 && a1.channels.x[0].t === -1 && M.evaluate(r.doc, 's', 1.5).e.x === M.evaluate(base, 's', 1.5).e.x, 'clip.trim start: the keys stay where they were in time (the picture does not change)');
r = R({ type: 'clip.trim', id: 'a1', edge: 'end', t: 2.5, ripple: true });
ok(r.ok && JSON.stringify(clipsOf(r, 'A')) === '[["a1",0,2.5],["a2",3.5,4.5]]' && !R({ type: 'clip.trim', id: 'a1', edge: 'end', t: 9 }).doc.sequences[0].tracks[0].clips.some((c) => c.id === 'a1' && c.end > 3), 'clip.trim end: ripple pushes the next; without ripple it stops at the next clip');
r = R({ type: 'clip.split', ids: ['a1'], t: 1 });
const parts = r.doc.sequences[0].tracks[0].clips;
ok(r.ok && parts.length === 3 && parts[0].end === 1 && parts[1].start === 1 && [0.5, 0.999, 1, 1.5].every((t) => Math.abs(M.evaluate(r.doc, 's', t).e.x - M.evaluate(base, 's', t).e.x) < 1e-9), 'clip.split: two clips, the picture the same either side of the cut');
r = R({ type: 'clip.remove', ids: ['a1'], ripple: true });
ok(r.ok && JSON.stringify(clipsOf(r, 'A')) === '[["a2",1,2]]', 'clip.remove with ripple: the later clips close the gap');
r = R({ type: 'clip.duplicate', ids: ['a1'] });
ok(r.ok && JSON.stringify(clipsOf(r, 'A').map((c) => c.slice(1))) === '[[0,2],[3,4],[4,6]]' && JSON.stringify(R({ type: 'clip.duplicate', ids: ['a2'] }).doc && clipsOf(R({ type: 'clip.duplicate', ids: ['a2'] }), 'A').map((c) => c.slice(1))) === '[[0,2],[3,4],[4,5]]', 'clip.duplicate: a copy right after it, or the nearest free place after that', JSON.stringify(r.doc && clipsOf(r, 'A')));
r = R({ type: 'key.add', clip: 'a1', prop: 'x', t: 1 });
ok(r.ok && r.doc.sequences[0].tracks[0].clips[0].channels.x.length === 3 && r.doc.sequences[0].tracks[0].clips[0].channels.x[1].v === 10, 'key.add: its value where it is put (the picture does not change)');
r = R({ type: 'key.set', clip: 'a1', prop: 'x', index: 1, patch: { v: 'param.x + 1', ease: 'back-out' } });
ok(r.ok && r.doc.sequences[0].tracks[0].clips[0].channels.x[1].v === 'param.x + 1' && !R({ type: 'key.set', clip: 'a1', prop: 'x', index: 1, patch: { v: 'param.x +' } }).ok, 'key.set: an expression (checked), an ease');
ok(!R({ type: 'clip.move', ids: ['l1'], dt: 1 }).ok && /固定/.test(R({ type: 'clip.add', track: 'L', start: 5, end: 6 }).error) && !R({ type: 'nope' }).ok && R({ type: 'nope' }).doc === base, 'locked tracks refuse; an unknown intent is an error and the document stays');
r = R({ type: 'preset.apply', at: 6, preset: { tracks: [{ id: 'x', target: 'pop', clips: [{ id: 'a1', start: 0, end: 1 }] }], markers: [{ id: 'm', t: 0.5, name: 'pop' }] } });
const ids = M.allIds(r.doc);
ok(r.ok && new Set(ids).size === ids.length && r.doc.sequences[0].tracks.at(-1).clips[0].start === 6 && r.doc.sequences[0].markers.some((m) => m.t === 6.5), 'preset.apply: new ids for everything (no clash), placed at the playhead');
r = M.reduce(game, { seq: 's', type: 'instances.import', at: 1, templates: [{ id: 'hc', lead: 0.5, tail: 0.5, tracks: [] }], instances: [{ id: 'i1', template: 'hc', t: 0, params: { x: 1 } }] });
const s1 = r.doc.sequences[0], newTpl = s1.templates[1];
ok(r.ok && s1.templates.length === 2 && newTpl.id !== 'hc' && s1.instances.find((x) => x.template === newTpl.id).t === 1 && new Set(M.allIds(r.doc)).size === M.allIds(r.doc).length, 'instances.import: its templates and instances get new ids (references kept), times from at');
r = M.reduce(game, { seq: 's', type: 'instance.move', ids: ['i1'], dt: 0.5, dx: 2 });
ok(r.ok && r.doc.sequences[0].instances.find((x) => x.id === 'i1').t === 2.5 && r.doc.sequences[0].instances.find((x) => x.id === 'i1').params.x === 12 && M.reduce(game, { seq: 's', type: 'template.remove', id: 'hc' }).doc.sequences[0].instances.length === 0,
  'instance.move (time and place); removing a template removes its instances');
r = M.reduce(base, { seq: 's', type: 'tempo.add', t: 0, bpm: 150 });
ok(r.ok && r.doc.sequences[0].tempo[0].bpm === 150 && !M.reduce(base, { seq: 's', type: 'tempo.add', t: 0, bpm: 0 }).ok && M.reduce(base, { type: 'seq.add', name: 'B' }).doc.sequences.length === 2, 'tempo.add (a BPM > 0); seq.add');

// ---- the contract (bds/geoui/timeline/contract.js) ----
const K = require('../bds/geoui/timeline/contract.js');
const G = require('../bds/geoui/geoui_builder.js');
const vals = { x: 37.3, y: -150.2, v: 9 }, back = K.unpack(K.pack(vals)), stepX = K.stepOf(K.DEFAULT_PACK[0]);
ok(Math.abs(back.x - vals.x) <= stepX / 2 && Math.abs(back.y - vals.y) <= stepX / 2 && back.v === 9 && K.pack(vals) < 2 ** 24 && K.pack({ x: 999, y: -999, v: -3 }) === K.pack({ x: 200, y: -200, v: 0 }), 'pack / unpack: back within half a step, below 2^24, values held to their range');
let threw = ''; try { K.pack({}, [{ name: 'a', bits: 20, min: 0, max: 1 }, { name: 'b', bits: 5, min: 0, max: 1 }]); } catch (e) { threw = e.message; }
ok(/25 bit/.test(threw), 'more than 24 bits is refused (Molang\'s numbers are float32)');
const um = K.unpackMolang("q.property('geoui:t0s0p')"), packed = K.pack(vals), env = G.envOf({ props: { 'geoui:t0s0p': packed } });
ok(['x', 'y', 'v'].every((k) => Math.abs(G.molang(um[k], env) - back[k]) < 1e-6), 'unpackMolang: the game\'s Molang reads the same numbers (GeoUI Builder\'s evaluator)', JSON.stringify(um));
const tplA = { id: 'hc', lead: 1, tail: 0.5 }, inst = [0, 0.5, 1, 3].map((t, i) => ({ id: `i${i}`, template: 'hc', t }));
let a = K.allocateSlots(inst, tplA);
ok(a.slots === 3 && a.slotOf.i3 === 0 && !a.overflow.length && [0, 1, 2].every((k) => { const xs = inst.filter((x) => a.slotOf[x.id] === k).sort((p, q) => p.t - q.t); return xs.every((x, i) => !i || xs[i - 1].t + 0.5 <= x.t - 1); }),
  'allocateSlots: as many slots as are out at once, a slot reused once free, never two at once in one');
a = K.allocateSlots(inst, tplA, { maxSlots: 2 });
ok(a.slots === 2 && JSON.stringify(a.overflow) === '["i2"]' && K.allocateSlots(inst, tplA, { gap: 2 }).slots === 4, 'maxSlots: the rest overflow; a gap between two in one slot needs more slots');
const many = { sequences: [{ id: 's', templates: [{ id: 'hc', lead: 1, tail: 0.5, params: ['x', 'y'], tracks: [{ clips: [{ trigger: 'hit' }] }] }], instances: Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, template: 'hc', t: i * 0.25 })) }] };
// (baked by default: the instances in the Molang, only the results a property — 3 bits a slot, 8 slots a property)
const bud = K.budget(many), defs = K.propertyDefs(bud);
ok(bud.sequences[0].templates[0].mode === 'baked' && bud.sequences[0].templates[0].slots === 6 && bud.properties === 2 + 1 && Object.keys(defs).length === bud.properties && defs['geoui:t0se0'] && defs['geoui:seq'].range[1] === 2 ** 24 - 1 && !defs['geoui:t0s0t'],
  'budget: 100 instances baked by default, 6 slots, 3 properties (the sequence, its time, one for the results of up to 8 slots); the definitions match', JSON.stringify(bud.sequences[0].templates[0]) + ' ' + bud.properties);
// (streamed past bakedMax: time and params a slot, with the gap; GeoUI's own properties count towards the game's 32)
const bs = K.budget(many, { bakedMax: 50 }), ds = K.propertyDefs(bs);
ok(bs.sequences[0].templates[0].mode === 'streamed' && bs.sequences[0].templates[0].slots === 7 && bs.properties === 2 + 7 * 2 + 1 && bs.warnings.length === 0 && K.budget(many, { bakedMax: 50, base: 16 }).warnings.length === 1 && K.budget(many, { bakedMax: 50, base: 15 }).warnings.length === 0
  && Object.keys(ds).length === bs.properties && ds['geoui:t0s6p'].range[1] === 2 ** 24 - 1 && ds['geoui:t0s6t'].default === -1,
  'budget: past bakedMax streamed — 7 slots (with the gap), time and params a slot, the results in one; with the pack\'s own 16 that is 33 (said), with 15 it fits', JSON.stringify(bs.sequences[0].templates[0]) + ' ' + bs.properties);
// (params that do not fit the pack: baked however many, and said)
const wide = JSON.parse(JSON.stringify(many)); wide.sequences[0].templates[0].params = ['x', 'y', 'q'];
const bw = K.budget(wide, { bakedMax: 50 });
ok(bw.sequences[0].templates[0].mode === 'baked' && bw.warnings.some((w) => /焼き込み/.test(w)) && !K.canStream(wide.sequences[0].templates[0]) && K.canStream(many.sequences[0].templates[0]), 'budget: a template whose params do not fit its pack stays baked past bakedMax, and says so');
// (two sequences share the properties: a tag's slots are the most any sequence needs)
const twoSeq = { sequences: [many.sequences[0], { id: 's2', templates: [{ id: 'z', lead: 3, tail: 3, params: [], tracks: [{ clips: [{ until: 'hit' }] }] }], instances: Array.from({ length: 60 }, (_, i) => ({ id: `z${i}`, template: 'z', t: i * 0.2 })) }] };
const b2 = K.budget(twoSeq), d2 = K.propertyDefs(b2);
ok(b2.sequences[1].templates[0].slots > 8 && d2['geoui:t0se1'] && b2.properties === 2 + Math.ceil(b2.sequences[1].templates[0].slots / 8), 'budget: two sequences share their properties — a tag takes the most slots any sequence needs (here 2 result properties)', JSON.stringify(b2.tags));
// (the seq property: sequence, pause and generation in 24 bits; the game's Molang reads the same)
const sv = K.seqValue({ seq: 37, pause: true, gen: 8191 }), sp = K.seqParts(sv), sm = K.seqMolang("q.property('geoui:seq')"), senv = G.envOf({ props: { 'geoui:seq': sv } });
ok(sv < 2 ** 24 && sp.seq === 37 && sp.pause === true && sp.gen === 8191 && K.seqParts(K.seqValue({ seq: 2, gen: 8192 })).gen === 0 && G.molang(sm.seq, senv) === 37 && G.molang(sm.pause, senv) === 1
  && G.molang(sm.pause, G.envOf({ props: { 'geoui:seq': K.seqValue({ seq: 5, gen: 77 }) } })) === 0, 'seq: the sequence, paused, the generation (it wraps at 8192) in one number below 2^24 — the Molang reads the sequence and the pause back');
// (results: 3 bits a slot, 8 slots a property; the Molang reads each slot's)
const codes = [1, 2, 0, 5, 3, 7, 4, 6], evv = K.eventValue(codes), eenv = G.envOf({ props: { "geoui:t0se0": evv } });
ok(evv < 2 ** 24 && codes.every((c, k) => G.molang(K.eventMolang("q.property('geoui:t0se0')", k), eenv) === c) && K.eventSlot(13).group === 1 && K.eventSlot(13).shift === 5, 'results: 8 slots in one number below 2^24, each slot\'s read back by its Molang');

// ---- a template timed by its instance (a slider: its length and path its own; the ball back and forth with t) ----
const sl = M.normalize({ sequences: [{ id: 's', duration: 10, paths: [{ id: 'p1', kind: 'linear', points: [[0, 0], [10, 0]] }],
  templates: [{ id: 'sl', lead: 1, tail: 0, params: ['d', 'r'], tracks: [{ target: 'ball', clips: [{ start: 0, end: 'param.d', path: '@instance', channels: { path: [{ t: 0, v: '1 - math.abs(math.mod(t * param.r / param.d, 2) - 1)' }] } }] }] }],
  instances: [{ id: 'a', template: 'sl', t: 1, params: { d: 2, r: 2 }, path: 'p1', tail: 2 }] }] });
const bx = (t) => (M.evaluate(sl, 's', t)['ball#a'] || {}).x;
ok(M.validate(sl).length === 0 && bx(1.5) === 5 && bx(2) === 10 && bx(2.5) === 5 && Math.abs(bx(2.99) - 0.1) < 1e-9 && !('ball#a' in M.evaluate(sl, 's', 3)) && sl.sequences[0].templates[0].tracks[0].clips[0].end === 'param.d',
  'a clip ending at param.d, the instance\'s own path (@instance) and tail, a key\'s expression of t (there and back)', [1.5, 2, 2.5, 2.99, 3].map(bx).join(' '));
ok(K.allocateSlots([{ id: 'a', template: 'sl', t: 1, tail: 2 }, { id: 'b', template: 'sl', t: 3.5 }], { id: 'sl', lead: 1, tail: 0 }).slots === 2, 'allocateSlots: an instance\'s own tail keeps its slot longer');

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-model-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
