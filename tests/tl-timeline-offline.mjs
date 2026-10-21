#!/usr/bin/env node
// GeoUI timeline's panel geometry and gestures (bds/geoui/timeline/view.js), no browser: time ↔ px, zoom, rows, what is under
// a point, a drag's intent, thousands of instances. The panel itself in a browser: bds/geoui/timeline/check-timeline.mjs.
// node tests/tl-timeline-offline.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../bds/geoui/timeline/model.js');
const V = require('../bds/geoui/timeline/view.js');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

const v = V.createView({ width: 1000, height: 300, pxPerSec: 100, scroll: 0 });
ok(V.timeToX(v, 2) === 350 && near(V.xToTime(v, 350), 2) && JSON.stringify(V.visibleRange(v)) === '[0,8.5]', 'time ↔ px (the header 150 px, 100 px a second)');
const z = V.zoom(v, 2, 350);
ok(near(V.xToTime(z, 350), 2) && z.pxPerSec === 200 && V.zoom(v, 1e9).pxPerSec === 4000 && V.zoom(v, 1e-9).pxPerSec === 10, 'zoom keeps the time under the pointer; 10 … 4000 px a second');
ok(V.pan(v, -500).scroll === 0 && V.pan(v, 250).scroll === 2.5 && near(V.fit(v, 8.3).pxPerSec, (1000 - 150 - 20) / 8.3), 'pan never before 0; fit the whole sequence');
ok(V.tickStep(v, 20) === 1 && V.tickStep(V.zoom(v, 40), 20) === 0.05 && V.tickStep(V.zoom(v, 0.1), 20) === 10, 'ruler steps: frames, seconds, tens of seconds');

const doc = M.normalize({ sequences: [{ id: 's', duration: 20, markers: [{ id: 'm', t: 6, name: 'M' }],
  templates: [{ id: 'tp', lead: 1, tail: 0.5, tracks: [{ id: 'T1', target: 'c', clips: [{ id: 'tc', start: -1, end: 0.5 }] }] }],
  instances: Array.from({ length: 10000 }, (_, i) => ({ id: `i${i}`, template: 'tp', t: i * 0.002 + 10 })),
  tracks: [{ id: 'A', target: 'e', clips: [{ id: 'c1', start: 1, end: 3, channels: { x: [{ t: 0, v: 0 }, { t: 1, v: 10 }] } }] }, { id: 'B', target: 'f', clips: [{ id: 'c2', start: 4, end: 5 }] }] }] });
const seq = doc.sequences[0], rs = V.rows(v, seq);
ok(rs.length === 3 && rs[0].track.id === 'A' && rs[0].y === 24 && rs[1].y === 54 && rs[2].kind === 'lane' && rs[2].y === 84 && V.rows(v, seq, { template: 'tp' }).map((r) => r.track && r.track.id).join() === 'T1', 'rows: the tracks, the instances\' lane; a template\'s own tracks when it is open');
const hit = (x, y) => V.hitTest(v, seq, rs, x, y);
const row = (i) => rs[i].y + 15;
ok(hit(V.timeToX(v, 2.4), row(0)).kind === 'clip' && hit(V.timeToX(v, 1) + 2, rs[0].y + 6).kind === 'clip-start' && hit(V.timeToX(v, 3) - 2, row(0)).kind === 'clip-end' && hit(V.timeToX(v, 3.5), row(0)).kind === 'empty' && hit(V.timeToX(v, 1) + 2, row(0)).kind === 'key',
  'a clip: its body, its start and end edges (6 px; a key on the edge wins at the clip\'s middle line), the empty part beside it');
ok(hit(V.timeToX(v, 2), row(0)).kind === 'key' && hit(V.timeToX(v, 2), row(0)).keys[0].prop === 'x' && hit(V.timeToX(v, 6), 10).kind === 'marker' && hit(V.timeToX(v, 7), 10).kind === 'ruler',
  'a key (its diamond at the clip\'s start + its time), a marker on the ruler, the ruler');
ok(hit(150 - 10, row(0)).kind === 'lock' && hit(150 - 30, row(0)).kind === 'solo' && hit(150 - 50, row(0)).kind === 'mute' && hit(20, row(0)).kind === 'header', 'a track\'s header: lock, solo, mute, its name');
ok(hit(V.timeToX(v, 10.004), row(2)).kind === 'instance', 'an instance in the lane');
const t0 = performance.now(), seen = V.instancesIn(seq, 12, 12.5), dt = performance.now() - t0;
ok(seen.length === 251 && seen[0].t >= 12 && dt < 5, `10 000 instances: only those in view looked at (${seen.length} in 0.5 s, ${dt.toFixed(2)} ms)`);

// ---- drags → intents
const ctx = { view: v, seq, rows: rs, selection: { clips: [], keys: [], instances: [] }, playhead: 4, beatDiv: 4 };
const drag = (h, x0, y0, x1, y1, mods) => { const d = V.createDrag(h, x0, y0, ctx); d.move(x1, y1, mods); return d.up(x1, y1, mods); };
let r = drag(hit(V.timeToX(v, 2.4), row(0)), V.timeToX(v, 2.4), row(0), V.timeToX(v, 2.9), row(1));
ok(r.type === 'clip.move' && r.ids[0] === 'c1' && near(r.dt, 0.5) && r.dTrack === 1 && r.snap === true && near(r.snapTol, 0.08) && r.playhead === 4 && r.beatDiv === 4, 'dragging a clip: clip.move (its time, a track down, snapping 8 px)', JSON.stringify(r));
r = drag(hit(V.timeToX(v, 2.4), row(0)), V.timeToX(v, 2.4), row(0), V.timeToX(v, 2.9), row(0), { alt: true });
ok(r.snap === false && r.dTrack === 0, 'Alt: no snapping');
r = drag(hit(V.timeToX(v, 3) - 2, row(0)), V.timeToX(v, 3) - 2, row(0), V.timeToX(v, 3.5), row(0));
ok(r.type === 'clip.trim' && r.edge === 'end' && near(r.t, 3.5, 1e-9), 'dragging an edge: clip.trim');
r = drag(hit(V.timeToX(v, 2), row(0)), V.timeToX(v, 2), row(0), V.timeToX(v, 2.25), row(0));
ok(r.type === 'key.move' && near(r.dt, 0.25) && r.keys[0].clip === 'c1', 'dragging a key: key.move');
r = drag(hit(V.timeToX(v, 6), 10), V.timeToX(v, 6), 10, V.timeToX(v, 7), 10);
ok(r.type === 'marker.set' && near(r.patch.t, 7), 'dragging a marker: marker.set');
r = drag(hit(V.timeToX(v, 7), 10), V.timeToX(v, 7), 10, V.timeToX(v, 7.5), 10);
ok(near(r.seek, 7.5) && !r.type, 'the ruler: the playhead follows');
r = drag(hit(V.timeToX(v, 2.4), row(0)), V.timeToX(v, 2.4), row(0), V.timeToX(v, 2.4) + 1, row(0), { shift: true });
ok(JSON.stringify(r.select) === '{"clips":["c1"]}', 'a click on a clip (not moved past 3 px): selects it');
r = drag(hit(V.timeToX(v, 3.5), row(0)), V.timeToX(v, 0.5), rs[0].y + 1, V.timeToX(v, 5.5), rs[1].y + 29);
ok(JSON.stringify(r.select.clips) === '["c1","c2"]' && r.select.keys.length === 2, 'a box from an empty place: the clips and keys it covers', JSON.stringify(r));
r = drag(hit(V.timeToX(v, 10.004), row(2)), V.timeToX(v, 10.004), row(2), V.timeToX(v, 10.504), row(2));
ok(r.type === 'instance.move' && near(r.dt, 0.5) && r.ids.length === 1, 'dragging an instance: instance.move');
const applied = M.reduce(doc, drag(hit(V.timeToX(v, 2.4), row(0)), V.timeToX(v, 2.4), row(0), V.timeToX(v, 2.42), row(0)));
ok(applied.ok && near(applied.doc.sequences[0].tracks[0].clips[0].start, 1) || applied.doc.sequences[0].tracks[0].clips[0].start === 1, 'a drag\'s intent applies (a tiny drag snaps back to the clip\'s own place)', JSON.stringify(applied.doc.sequences[0].tracks[0].clips[0]));

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-timeline-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
