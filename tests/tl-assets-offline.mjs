#!/usr/bin/env node
// GeoUI timeline's assets (bds/geoui/timeline/osu.js, media.js, presets.js), no network, no browser. The beatmap here is the
// lab's own (no real map or song). node tests/tl-assets-offline.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../bds/geoui/timeline/model.js');
const O = require('../bds/geoui/timeline/osu.js');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- osu! ----
const MAP = `osu file format v14

[General]
AudioFilename: click.wav
Mode: 0

[Metadata]
Title:Lab Click
Artist:bds-lab
Version:Test

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:8
ApproachRate:9
SliderMultiplier:1.4
SliderTickRate:1

[TimingPoints]
0,500,4,2,0,60,1,0
2000,-50,4,2,0,60,0,0
4000,400,3,2,0,60,1,1

[Colours]
Combo1 : 255,0,0
Combo2 : 0,255,0

[HitObjects]
256,192,500,5,0,0:0:0:0:
100,100,1000,1,0,0:0:0:0:
200,150,1500,2,0,L|300:150,2,140
300,300,2500,6,0,B|350:250|400:300,1,140
256,192,3000,12,0,3800,0:0:0:0:
50,50,4000,1,0,0:0:0:0:
`;
const map = O.parseOsu(MAP);
ok(map.version === 14 && map.metadata.Title === 'Lab Click' && map.difficulty.ApproachRate === 9 && map.timing.length === 3 && map.timing[1].uninherited === false && map.timing[2].kiai && JSON.stringify(map.colours.combos) === '[[255,0,0],[0,255,0]]',
  'parseOsu: sections, timing points (inherited or not, kiai), combo colours');
ok(JSON.stringify(map.objects.map((o) => o.kind)) === '["circle","circle","slider","slider","spinner","circle"]' && map.objects[2].curve === 'linear' && map.objects[2].slides === 2 && map.objects[2].length === 140 && map.objects[3].curve === 'bezier' && map.objects[3].newCombo && map.objects[4].endTime === 3800 && JSON.stringify(map.objects[3].points) === '[[300,300],[350,250],[400,300]]',
  'parseOsu: circles, sliders (curve, slides, length, points from the head), spinners');
const D = O.difficultyOf(map);
ok(D.preempt === 600 && D.fadeIn === 400 && near(D.radius, 36.48) && D.windows.great === 32 && D.windows.good === 76 && D.windows.meh === 120 && O.preempt(5) === 1200 && O.preempt(3) === 1440 && O.fadeIn(10) === 300,
  "osu!'s formulas: AR → preempt and fade-in, CS → radius, OD → the 300/100/50 windows");
ok(near(O.sliderDuration(map, map.objects[2]), 1000) && near(O.sliderDuration(map, map.objects[3]), 250) && O.timingAt(map, 4500).meter === 3, 'slider duration: length, slider multiplier, the inherited point\'s velocity (x2), slides');
ok(JSON.stringify(O.combos(map)) === JSON.stringify([{ n: 1, colour: 0 }, { n: 2, colour: 0 }, { n: 3, colour: 0 }, { n: 1, colour: 1 }, { n: 1, colour: 0 }, { n: 1, colour: 1 }]), 'combo numbers and colours: a new combo, the object after a spinner', JSON.stringify(O.combos(map)));
const { doc, bodies, info } = O.toDocument(map, { width: 120 });
const seq = doc.sequences[0], byId = Object.fromEntries(seq.instances.map((x) => [x.id, x]));
ok(M.validate(doc).length === 0 && seq.templates.length === 3 && seq.instances.length === 6 && bodies.length === 2 && info.counts.sliders === 2 && seq.tempo.length === 2 && seq.tempo[1].bpm === 150 && seq.tempo[1].meter === 3 && seq.tracks[0].kind === 'audio',
  'toDocument: a valid document — templates, an instance per object, a body per slider, tempo from the timing, the music track', M.validate(doc).join(' / '));
ok(byId.o1.params.x === 0 && byId.o1.params.y === 0 && byId.o2.params.x === -36.5625 && byId.o2.params.y === 21.5625 && byId.o3.params.d === 1 && byId.o3.params.r === 2 && byId.o3.tail === 1.5 && byId.o5.params.d === 0.8,
  'the playfield (512 x 384) into model units (centred, y up), a slider\'s duration and slides, a spinner\'s length');
const N = M.normalize(doc), ev = (t, o) => M.evaluate(N, 'osu', t, o);
let st = ev(0.1);
ok(near(st['hitcircle#o1'].opacity, 0.5) && near(st['approachcircle#o1'].scaleX, byId.o1.params.s * (4 - 3 * (0.7 / 0.6) > 0 ? 1 : 1), 1e9) && st['combonumber#o1'].value === 1 && st['hitcircle#o1'].frame === 0,
  'evaluate the import: the circle fading in (half way at 0.2 s of 0.4), its number, its colour frame');
st = ev(0.2);
ok(near(st['approachcircle#o1'].scaleX, byId.o1.params.s * 2.5, 1e-9), 'the approach ring halfway (4x → 1x over the preempt)', JSON.stringify(st['approachcircle#o1']));
st = ev(1.75);
ok(near(st['sliderball#o3'].x, -13.125 + 16.40625, 1e-6) && near(st['sliderball#o3'].y, 9.84375, 1e-4) && near(ev(2.25)['sliderball#o3'].x, -13.125 + 16.40625, 1e-6) && near(ev(2)['sliderball#o3'].x, -13.125 + 32.8125, 1e-6),
  "the slider ball: osu!'s pixel length (140 of a 100 px line: gone on straight), there and back over its 2 slides", `${st['sliderball#o3'] && st['sliderball#o3'].x} ${ev(2)['sliderball#o3'] && ev(2)['sliderball#o3'].x}`);
st = ev(0.55, { events: [{ instance: 'o1', name: 'hit', t: 0.52 }] });
ok(st['hitcircle#o1'].visible === false && st['hitburst#o1'].visible === true && near(ev(3.4)['spinner#o5'].rotation, 252, 1e-6), 'a hit: the circle goes, its burst plays; the spinner turns (t: since its clip began, 0.3 s before)', JSON.stringify([st['hitcircle#o1'], st['hitburst#o1'], ev(3.4)['spinner#o5']]));

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-assets-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
