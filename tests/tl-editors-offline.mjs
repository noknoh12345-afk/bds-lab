#!/usr/bin/env node
// GeoUI timeline's editors (bds/geoui/timeline/curve.js, inspector.js, instances.js, pathedit.js), no browser: the easing
// curve (its points, the canvas mapping, a handle hit and dragged, the Bézier nearest a named ease), the inspector's fields for
// each kind of selection and the intents a change makes (many selected: one batch, one undo; values that differ: —), the
// instances' table (columns, filter, sort, the rows in view, a pasted table read, TSV out and back), the paths' and positions'
// drawing on the preview (model units ↔ px, a point hit, where a new point goes, snapping to the grid and the beat's ring).
// The editors in a real browser: bds/geoui/timeline/check-editors.mjs. node tests/tl-editors-offline.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../bds/geoui/timeline/model.js');
require('../bds/geoui/timeline/presets.js');
const Cv = require('../bds/geoui/timeline/curve.js');
const I = require('../bds/geoui/timeline/inspector.js');
const X = require('../bds/geoui/timeline/instances.js');
const P = require('../bds/geoui/timeline/pathedit.js');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- the curve
{
  const b = [0.25, 0.1, 0.25, 1];
  ok(JSON.stringify(Cv.bezierPoint(b, 0)) === '[0,0]' && JSON.stringify(Cv.bezierPoint(b, 1)) === '[1,1]' && near(Cv.bezierPoint([1 / 3, 0, 2 / 3, 1 / 3], 0.5)[1], 0.25), 'a Bézier\'s points: its ends, and x² written as one');
  const f = Cv.frame(200, 200), p = Cv.toPx(f, [0.3, 1.2]), q = Cv.fromPx(f, p);
  ok(near(q[0], 0.3) && near(q[1], 1.2) && Cv.toPx(f, [0, 0])[0] === 14 && Cv.toPx(f, [1, 1])[0] === 186, 'the canvas: curve units ↔ px (room above 1 and below 0 for back and elastic)');
  const h1 = Cv.toPx(f, [b[0], b[1]]), h2 = Cv.toPx(f, [b[2], b[3]]);
  ok(Cv.hitHandle(b, f, h1[0] + 3, h1[1]) === 1 && Cv.hitHandle(b, f, h2[0], h2[1] - 4) === 2 && Cv.hitHandle(b, f, 100, 100) === null, 'a handle under the pointer (the nearer one; none away from them)');
  const d = Cv.dragHandle(b, 2, [1.4, 2.7]);
  ok(d[2] === 1 && d[3] === 2 && d[0] === 0.25 && JSON.stringify(Cv.dragHandle(b, 1, [-0.2, 0.12345])) === '[0,0.123,0.25,1]', 'a handle dragged: x held to 0..1 (time runs one way), y to −1..2, 0.001');
  const fits = Object.fromEntries(['linear', 'quad-in', 'cubic-out', 'sine-inout', 'back-out', 'expo-out', 'elastic-out', 'bounce-out'].map((e) => [e, Cv.nearestBezier(e)]));
  ok(fits.linear.error < 1e-6 && fits['quad-in'].error < 0.005 && fits['cubic-out'].error < 0.005 && fits['sine-inout'].error < 0.005 && fits['back-out'].error < 0.005 && fits['expo-out'].error < 0.01,
    'the Bézier nearest a named ease: within 0.005 for the polynomial ones and sine, 0.01 for expo', JSON.stringify(Object.fromEntries(Object.entries(fits).map(([k, v]) => [k, v.error.toFixed(4)]))));
  ok(fits['elastic-out'].error > 0.1 && fits['bounce-out'].error > 0.1 && Cv.nearestBezier({ bezier: [0.1, 0.2, 0.3, 0.4] }).error === 0, 'elastic and bounce have no near Bézier (a large gap, said by the editor); a Bézier is itself');
  const g = Cv.groups(), all = g.flatMap((x) => x[1]);
  ok(all.length === M.EASES.length && M.EASES.every((e) => all.includes(e)) && g[0][1].join() === 'linear,step' && Cv.label({ bezier: [0.1, 0.2, 0.3, 0.4] }) === 'ベジェ(0.1, 0.2, 0.3, 0.4)', 'the picker: every ease, by family');
}

// ---- the inspector
const doc = M.normalize({ sequences: [{ id: 's', name: 'S', duration: 10, tempo: [{ t: 0, bpm: 120, meter: 4 }], markers: [{ id: 'm1', t: 2, name: 'A', event: 'go' }, { id: 'm2', t: 3, name: 'B' }],
  paths: [{ id: 'p1', kind: 'catmull', points: [[0, 0], [10, 5], [20, 0]] }],
  templates: [{ id: 'tp', name: '円', lead: 0.5, tail: 0.5, params: ['x', 'y'], tracks: [{ id: 'T1', target: 'c', clips: [{ id: 'tc', start: -0.5, end: 0.5, channels: { x: [{ t: 0, v: 'param.x' }] } }] }] }],
  instances: [{ id: 'i1', template: 'tp', t: 1, params: { x: 5, y: 1 } }, { id: 'i2', template: 'tp', t: 2, params: { x: 5, y: 2 } }],
  tracks: [{ id: 'A', target: 'e', name: 'トラック A', clips: [{ id: 'c1', start: 1, end: 3, name: 'one', channels: { x: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 1, v: 10, ease: 'quad-out' }] }, transitionIn: { kind: 'fade', duration: 0.3 } }] },
    { id: 'B', target: 'f', clips: [{ id: 'c2', start: 4, end: 5, name: 'two' }] }, { id: 'S1', kind: 'audio', name: '音', clips: [{ id: 'a1', start: 0, end: 4, sound: 'click' }] }] }] });
const ctx = { elements: [{ name: 'e' }, { name: 'f' }, { name: 'g' }], media: [{ id: 'click', kind: 'sound', name: 'クリック' }, { id: 'pic', kind: 'image', name: '絵' }], time: 2.5 };
const sec = (sel) => I.sections(doc, { seq: 's', ...sel }, ctx), field = (ss, id) => ss.flatMap((s) => s.fields).find((f) => f.id === id);
const run = (intent) => M.reduce(doc, intent);
{
  const ss = sec({});
  ok(ss.map((s) => s.id).join() === 'seq,tempo,templates,paths' && field(ss, 'seq.duration').value === 10 && field(ss, 'seq.loop').options.length === 4 && field(ss, 'tempo.0.bpm').value === 120,
    'nothing selected: the sequence (name, length, fps, loop, in/out), its tempo, templates and paths', ss.map((s) => s.id).join());
  const r = run(I.intentOf(field(ss, 'seq.duration'), 12));
  ok(r.ok && r.doc.sequences[0].duration === 12 && r.doc !== doc && doc.sequences[0].duration === 10, 'a sequence field changed: seq.set (the old document untouched)');
  const add = ss.find((s) => s.id === 'tempo').actions[0].intents();
  ok(add[0].type === 'tempo.add' && add[0].t === 2.5 && add[0].bpm === 120 && run(add[0]).ok, 'tempo: one added at the playhead, at the BPM there');
}
{
  const ss = sec({ clips: ['c1'] }), name = field(ss, 'clip.name'), start = field(ss, 'clip.start'), tin = field(ss, 'clip.transitionIn');
  ok(name.value === 'one' && start.value === 1 && field(ss, 'clip.end').value === 3 && tin.value === 'fade' && field(ss, 'clip.transitionIn.duration').value === 0.3 && ss.some((s) => s.id === 'track') && field(ss, 'track.target').value === 'e',
    'one clip: its name, times, transitions; its track (target from the elements)');
  let r = run(I.intentOf(start, 1.5));
  ok(r.ok && r.doc.sequences[0].tracks[0].clips[0].start === 1.5 && r.doc.sequences[0].tracks[0].clips[0].end === 3.5, 'its start: the clip moved (its length kept: clip.move)');
  r = run(I.intentOf(field(ss, 'clip.len'), 0.5));
  ok(r.ok && r.doc.sequences[0].tracks[0].clips[0].end === 1.5, 'its length: its end trimmed (clip.trim)');
  r = run(I.intentOf(tin, ''));
  ok(r.ok && r.doc.sequences[0].tracks[0].clips[0].transitionIn === null, 'its transition taken off (なし)');
  r = run(I.intentOf(field(ss, 'track.muted'), true));
  ok(r.ok && r.doc.sequences[0].tracks[0].muted === true, 'its track muted (track.set)');
  ok(!ss.some((s) => s.fields.some((f) => f.id === 'clip.trigger')), 'a sequence\'s clip: no trigger / until (a template\'s only)');
}
{
  const ss = sec({ clips: ['c1', 'c2'] }), name = field(ss, 'clip.name'), it = I.intentOf(name, 'both');
  ok(name.value === I.MIXED && !field(ss, 'clip.start') && field(ss, 'clip.offset').value === 0, 'two clips: only their common fields; a name that differs is — (MIXED)');
  const r = run(it);
  ok(it.type === 'batch' && it.intents.length === 2 && r.ok && r.doc.sequences[0].tracks.slice(0, 2).every((t) => t.clips[0].name === 'both'), 'a change to both: one batch (one undo), both renamed');
  const bad = run({ seq: 's', type: 'batch', intents: [{ seq: 's', type: 'clip.set', id: 'c1', patch: { name: 'x' } }, { seq: 's', type: 'clip.set', id: 'nope', patch: {} }] });
  ok(!bad.ok && bad.doc === doc && /nope/.test(bad.error), 'a batch with one bad edit: none of it (the document as it was)', bad.error);
}
{
  const ss = sec({ clips: ['tc'] });
  ok(field(ss, 'clip.trigger') && field(ss, 'clip.start').value === -0.5 && /実体の時刻から/.test(field(ss, 'clip.start').label) && I.intentOf(field(ss, 'clip.trigger'), 'hit').template === 'tp' && run(I.intentOf(field(ss, 'clip.trigger'), 'hit')).doc.sequences[0].templates[0].tracks[0].clips[0].trigger === 'hit',
    'a template\'s clip: trigger / until, its times from the instance\'s; its intents name the template');
  const ex = I.sections(M.normalize({ sequences: [{ id: 's', templates: [{ id: 'tp', params: ['d'], tracks: [{ id: 'T', target: 'c', clips: [{ id: 'q', start: 0, end: 'param.d' }] }] }] }] }), { seq: 's', clips: ['q'] }, ctx);
  ok(field(ex, 'clip.when').kind === 'info' && !field(ex, 'clip.start'), 'a template\'s clip timed by an expression: its times shown as written');
  const a = sec({ clips: ['a1'] });
  ok(field(a, 'clip.sound').value === 'click' && field(a, 'clip.sound').options.some(([v]) => v === 'click') && !field(a, 'clip.sound').options.some(([v]) => v === 'pic') && field(a, 'clip.volume').value === 1,
    'an audio clip: its sound (from the sounds of the media), volume, pitch');
}
{
  const ss = sec({ keys: [{ clip: 'c1', prop: 'x', index: 0 }, { clip: 'c1', prop: 'x', index: 1 }] }), ease = field(ss, 'key.ease'), v = field(ss, 'key.v');
  ok(ease.value === 'quad-out' && v.value === I.MIXED && !field(ss, 'key.t'), 'two keys: their common ease; values that differ —; no time (one key\'s only)');
  const it = I.intentOf(ease, { bezier: [0.2, 0, 0.3, 1] }), r = run(it);
  ok(it.type === 'batch' && r.ok && r.doc.sequences[0].tracks[0].clips[0].channels.x.every((k) => k.ease.bezier[0] === 0.2), 'a Bézier ease to both keys: one batch');
  const one = sec({ keys: [{ clip: 'c1', prop: 'x', index: 1 }] }), r2 = run(I.intentOf(field(one, 'key.v'), 'param.x * 2'));
  ok(field(one, 'key.t').value === 1 && r2.ok && r2.doc.sequences[0].tracks[0].clips[0].channels.x[1].v === 'param.x * 2', 'one key: its time; an expression as its value');
}
{
  const ss = sec({ instances: ['i1', 'i2'] }), x = field(ss, 'instance.param.x'), y = field(ss, 'instance.param.y');
  ok(x.value === 5 && y.value === I.MIXED && ss.some((s) => s.id === 'template') && field(ss, 'template.lead').value === 0.5, 'two instances: their params (common x, differing y —), their template\'s fields');
  const r = run(I.intentOf(y, 7));
  ok(r.ok && r.doc.sequences[0].instances.every((i) => i.params.y === 7 && i.params.x === 5), 'a param to both: each keeps its other params');
  const r2 = run(I.intentOf(field(ss, 'template.params'), 'x, y, size'));
  ok(r2.ok && r2.doc.sequences[0].templates[0].params.join() === 'x,y,size', 'the template\'s params from a list');
}
{
  const m = sec({ markers: ['m1'] }), p = sec({ path: 'p1' });
  ok(field(m, 'marker.event').value === 'go' && run(I.intentOf(field(m, 'marker.t'), 2.75)).doc.sequences[0].markers.find((x) => x.id === 'm1').t === 2.75, 'a marker: its time, name, event');
  ok(field(p, 'path.kind').value === 'catmull' && /3 点/.test(field(p, 'path.points').value) && run(I.intentOf(field(p, 'path.kind'), 'bezier')).doc.sequences[0].paths[0].kind === 'bezier', 'a path: its kind, its points and length');
}
{
  ok(I.parseField('time', '00:01:05', 20) === 1.25 && I.parseField('time', '1.5') === 1.5 && Number.isNaN(I.parseField('time', 'x')) && I.parseField('value', '3') === 3 && I.parseField('value', 'param.x + 1') === 'param.x + 1' && I.parseField('value', 'nope(').error,
    'what a field\'s text means: timecode or seconds, a number or an expression (a bad one said)');
  const t = I.transitionIntent(doc, { seq: 's', clips: ['c1', 'c2'] }, 'slide-left', 'transitionOut'), r = run(t);
  ok(t.type === 'batch' && r.ok && r.doc.sequences[0].tracks[1].clips[0].transitionOut.kind === 'slide-left' && r.doc.sequences[0].tracks[1].clips[0].transitionOut.duration <= 1 / 3 + 1e-9,
    'a transition onto the selected clips\' ends (no longer than a third of a clip)');
  const pi = I.presetIntent(doc, { seq: 's', clips: ['c1'] }, 'title', { target: 'e', time: 6 }), r2 = run(pi);
  ok(pi.type === 'preset.apply' && pi.track === 'A' && pi.at === 6 && r2.ok && r2.doc.sequences[0].tracks[0].clips.some((c) => c.start === 6), 'a preset at the playhead, into the selected clip\'s track when it moves the same element');
  const pi2 = I.presetIntent(doc, { seq: 's' }, 'blink', { target: 'g', time: 1 }), r3 = run(pi2);
  ok(!pi2.track && r3.ok && r3.doc.sequences[0].tracks.length === 4 && r3.doc.sequences[0].tracks[3].target === 'g', 'a preset on another element: a track of its own');
}

// ---- the instances' table
{
  const seq = M.normalize({ sequences: [{ id: 's', templates: [{ id: 'oc', name: 'osu-circle', params: ['x', 'y', 'n'] }, { id: 'sp', name: 'spinner', params: ['d'] }],
    instances: Array.from({ length: 5000 }, (_, i) => ({ id: `i${i}`, template: i % 10 ? 'oc' : 'sp', t: i * 0.1, params: i % 10 ? { x: (i % 7) - 3, y: i % 5, n: i % 4 } : { d: 1 } })) }] }).sequences[0];
  ok(X.columns(seq).map((c) => c.key).join() === 't,template,x,y,n,d', 'columns: time, template, then every param once');
  const f = X.parseFilter('x>0 template=osu-circle', seq), g = X.parseFilter('spinner', seq), e = X.parseFilter('x<abc', seq);
  ok(f.test(seq.instances[4]) && !f.test(seq.instances[1]) && !f.test(seq.instances[10]) && g.test(seq.instances[10]) && !g.test(seq.instances[1]) && e.error, 'a filter: terms by column (a template by its name too), a bare word, a bad term said');
  const t0 = performance.now(), rows = X.rowsOf(seq, { filter: 'x>=2', sort: { key: 'x', dir: -1 } }), dt = performance.now() - t0;
  ok(rows.length > 0 && rows.every((x) => x.params.x >= 2) && rows[0].params.x === 3 && rows[rows.length - 1].params.x === 2 && rows[0].t < rows[1].t && dt < 100, `filtered and sorted (ties in time order): 5000 in ${dt.toFixed(1)} ms`);
  ok(X.rowsOf(seq, { filter: 'x>=2', sort: { key: 'x', dir: -1 } }) === rows, 'the same view again: the same rows (kept)');
  ok(JSON.stringify(X.windowOf(0, 300, 5000)) === '[0,21]' && JSON.stringify(X.windowOf(2000, 300, 5000)) === '[94,121]' && JSON.stringify(X.windowOf(99990, 300, 5000)) === '[4993,5000]', 'the rows in view (and a few more): what is drawn of thousands');
  const tsv = 't\ttemplate\tx\ty\n1.5\tosu-circle\t3\t-2\n00:02:10\toc\t1\t0\nbad\toc\t1\t1\n3\tnope\t0\t0';
  const a = X.parseTable(tsv, seq);
  ok(a.instances.length === 2 && a.instances[0].t === 1.5 && a.instances[0].template === 'oc' && a.instances[0].params.y === -2 && a.instances[1].t === 2.5 && a.errors.length === 2 && /時刻/.test(a.errors[0]) && /nope/.test(a.errors[1]),
    'a pasted TSV with a header: by its names (a template by name or id, timecodes), bad rows said', JSON.stringify(a));
  const b = X.parseTable('1, spinner, 2\n"2", osu-circle, "1", 2, 3\n3,4,5', seq, { template: 'oc' });
  ok(b.instances.length === 3 && b.instances[0].template === 'sp' && b.instances[0].params.d === 2 && b.instances[1].params.n === 3 && b.instances[2].template === 'oc' && b.instances[2].params.x === 4, 'a CSV without a header: time, a template when not a number, then its params in order (quotes read)', JSON.stringify(b));
  const ms = X.parseTable('ms template x\n1500 oc 2', seq);
  ok(ms.instances[0].t === 1.5 && ms.instances[0].params.x === 2, 'spaces and a column in milliseconds');
  const back = X.parseTable(X.toTsv(seq.instances.slice(1, 4), X.columns(seq)), seq);
  ok(back.instances.length === 3 && back.instances.every((x, i) => x.t === seq.instances[i + 1].t && x.params.x === seq.instances[i + 1].params.x), 'TSV out (copy) and back in (paste): the same instances');
  const imp = M.reduce({ version: 1, sequences: [seq] }, { seq: 's', type: 'instances.import', instances: a.instances });
  ok(imp.ok && imp.doc.sequences[0].instances.length === 5002, 'the pasted rows into the document: instances.import, at once');
  // (an import with its own paths — osu!'s sliders — into a sequence that has a path of that id: the instance follows the
  //  import's path under its new id, not the old one)
  const had = M.normalize({ sequences: [{ id: 's', paths: [{ id: 'op1', kind: 'linear', points: [[0, 0], [1, 1]] }], templates: [{ id: 'sl', params: [] }] }] });
  const im2 = M.reduce(had, { seq: 's', type: 'instances.import', paths: [{ id: 'op1', kind: 'bezier', points: [[0, 0], [9, 9], [18, 0]] }], instances: [{ id: 'x1', template: 'sl', t: 1, path: 'op1', params: {} }] });
  const s2 = im2.ok && im2.doc.sequences[0], mine = s2 && s2.paths.find((p) => p.id === s2.instances[0].path);
  ok(im2.ok && s2.paths.length === 2 && mine && mine.kind === 'bezier', 'an import\'s instance keeps its own path (renamed with it)', JSON.stringify(s2 && { paths: s2.paths.map((p) => p.id), inst: s2.instances[0] }));
}

// ---- paths and positions on the preview
{
  const map = P.mapping({ x: 100, y: 50, w: 800, h: 400 }, { unitsH: 200, center: [0, 140] });
  ok(JSON.stringify(map.toPx([0, 140])) === '[500,250]' && JSON.stringify(map.toPx([10, 150])) === '[520,230]' && JSON.stringify(map.toModel([520, 230])) === '[10,150]' && map.k === 2, 'the preview\'s frame: model units ↔ px (y up, the middle at (0, 140))');
  const seq = M.normalize({ sequences: [{ id: 's', paths: [{ id: 'p1', kind: 'linear', points: [[0, 0], [20, 0], [20, 20]] }, { id: 'op1', kind: 'bezier', points: [[0, 0], [5, 5]] }],
    tempo: [{ t: 0, bpm: 120 }], tracks: [{ id: 'A', target: 'ball', clips: [{ id: 'c', start: 0, end: 1, path: 'p1', channels: { path: [{ t: 0, v: 0 }, { t: 1, v: 1 }] } }] }],
    templates: [{ id: 'sl', params: ['x', 'y'], tracks: [{ id: 'T', target: 'head', clips: [{ id: 'h', start: -1, end: 0, channels: { x: [{ t: 0, v: 'param.x' }] } }] }, { id: 'T2', target: 'sball', clips: [{ id: 'b', start: 0, end: 1, path: '@instance', channels: { path: [{ t: 0, v: 0 }] } }] }] }],
    instances: [{ id: 'i1', template: 'sl', t: 1, params: { x: 0, y: 0 } }, { id: 'i2', template: 'sl', t: 2, path: 'op1', params: { x: 30, y: 0 } }] }] }).sequences[0];
  const els = [{ name: 'ball', x: 10, y: 130 }, { name: 'head', x: 0, y: 140 }];
  ok(P.pathTarget(seq, 'p1') === 'ball' && P.pathTarget(seq, 'op1') === 'sball' && P.placeTarget(seq, 'sl') === 'head' && JSON.stringify(P.restOf(els, 'ball')) === '[10,130]' && JSON.stringify(P.restOf(els, 'nope')) === '[0,140]',
    'a path\'s element (a clip that follows it, or an instance\'s own), an instance\'s place element, where an element rests');
  const o = P.restOf(els, 'ball'), pts = seq.paths[0].points, at = map.toPx([o[0] + 20, o[1] + 0]);
  ok(P.hitPoint(pts, o, map, at[0] + 3, at[1] - 2) === 1 && P.hitPoint(pts, o, map, 0, 0) === -1, 'a point under the pointer (at its element)');
  const mid = map.toPx([o[0] + 10, o[1]]), far = map.toPx([o[0] + 60, o[1] + 60]);
  ok(P.insertAt(pts, o, map, mid[0], mid[1] + 3) === 1 && P.insertAt(pts, o, map, far[0], far[1]) === 3, 'a new point: into the piece it is near, else at the end');
  ok(JSON.stringify(P.snapPoint([3.2, 7.9], { grid: 4 })) === '[4,8]' && JSON.stringify(P.snapPoint([10.5, 0.4], { prev: [0, 0], ring: 10 })) === '[9.9928,0.3807]' && JSON.stringify(P.snapPoint([30, 0], { prev: [0, 0], ring: 10, grid: 4 })) === '[32,0]',
    'snapping: to the grid, onto the ring of a beat\'s distance when near it');
  const bf = P.before(seq, seq.instances[1]);
  ok(bf && bf.inst.id === 'i1' && near(bf.beats, 2), 'the instance before (same template) and the beats between: the ring\'s radius');
  const it = P.setPoints(seq, seq.paths[0], [[0, 0], [1.23456, 2]]), r = M.reduce({ version: 1, sequences: [seq] }, it);
  ok(it.type === 'path.set' && r.ok && r.doc.sequences[0].paths[0].points[1][0] === 1.2346, 'points set: path.set (0.0001 units)');
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-editors-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
