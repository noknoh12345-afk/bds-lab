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
const mids = { linear: 0.5, 'quad-in': 0.25, 'cubic-out': 0.875, 'sine-inout': 0.5, 'quart-in': 0.0625, 'back-in': -0.0876975, 'bounce-out': 0.765625, 'elastic-out': 1.015625, 'expo-inout': 0.5, 'circ-inout': 0.5 };
const badMid = Object.entries(mids).filter(([e, v]) => !near(M.ease(e, 0.5), v, 1e-6)).map(([e, v]) => `${e}: ${M.ease(e, 0.5)} ≠ ${v}`);
ok(!badMid.length, 'the curves at their middle (Penner\'s values)', badMid.join(' / '));
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

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-model-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
