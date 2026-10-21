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

// ---- media ----
const Me = require('../bds/geoui/timeline/media.js');
const items = Array.from({ length: 24 }, (_, i) => ({ id: `r${i}`, w: 8 + ((i * 37) % 60), h: 6 + ((i * 53) % 45) }));
const at = Me.packAtlas(items, { padding: 2 }), R = Object.entries(at.rects);
const overlap = R.some(([a, p], i) => R.some(([b, q], j) => j > i && p.x < q.x + q.w + 2 && q.x < p.x + p.w + 2 && p.y < q.y + q.h + 2 && q.y < p.y + p.h + 2));
ok(R.length === 24 && !overlap && R.every(([, r]) => r.x >= 0 && r.y >= 0 && r.x + r.w <= at.w && r.y + r.h <= at.h) && [at.w, at.h].every((v) => (v & (v - 1)) === 0) && items.every((it) => at.rects[it.id].w === it.w),
  `packAtlas: 24 images in ${at.w}x${at.h} (powers of two), none overlapping with the padding, all inside`, JSON.stringify(at.rects).slice(0, 200));
let thrown = ''; try { Me.packAtlas([{ id: 'huge', w: 3000, h: 10 }]); } catch (e) { thrown = e.message; }
ok(/huge/.test(thrown) && JSON.stringify(Me.packAtlas([])) === '{"w":1,"h":1,"rects":{}}', 'packAtlas: an image larger than the limit is said by name; nothing is a 1x1');
const fb = Me.flipbook(5, 32, 16), uv4 = fb.uv(4);
ok(fb.cols === 3 && fb.rows === 2 && fb.w === 96 && fb.h === 32 && near(uv4.offset[0], 1 / 3) && uv4.offset[1] === 0.5 && near(uv4.scale[0], 1 / 3) && uv4.scale[1] === 0.5 && JSON.stringify(fb.uv(99)) === JSON.stringify(uv4), 'flipbook: the grid and each frame\'s uv_anim (a frame past the end is the last)');
const font = Me.fontAtlas('AB C\nあ', () => ({ w: 10, h: 12, advance: 10 }));
const lay = Me.layoutText('AB C', font, { maxWidth: 25 }), mid = Me.layoutText('AB', font, { align: 'center', scale: 0.5 });
ok(Object.keys(font.glyphs).join('') === 'AB Cあ' && JSON.stringify(lay.map((g) => [g.ch, g.x, g.y])) === '[["A",0,0],["B",10,0],["C",0,-12]]' && mid[0].x === -5 && mid[1].x === 0 && Me.layoutText('ああああ', font, { maxWidth: 25 }).length === 4,
  'fontAtlas and layoutText: wrapped at the space (not starting the line with it), lines going down, centred, scaled; text without spaces wraps anywhere', JSON.stringify(lay));
const wav = Me.makeWav(new Float32Array(4000).map((_, i) => Math.sin(i / 10)), 8000), wi = Me.wavInfo(wav), st2 = Me.wavInfo(Me.makeWav([new Float32Array(100), new Float32Array(100)], 100));
ok(wi.seconds === 0.5 && wi.rate === 8000 && wi.channels === 1 && wi.bits === 16 && st2.channels === 2 && st2.seconds === 1 && Me.wavInfo(new Uint8Array(20)) === null, 'makeWav / wavInfo: a mono and a stereo file read back (length, rate, channels)');
const page = (granule, body) => { const b = new Uint8Array(27 + 1 + body.length), d = new DataView(b.buffer); b.set([0x4f, 0x67, 0x67, 0x53]); d.setUint32(6, granule, true); b[26] = 1; b[27] = body.length; b.set(body, 28); return b; };
const ident = new Uint8Array(30); ident.set([1, ...[...'vorbis'].map((c) => c.charCodeAt(0))]); ident[11] = 2; new DataView(ident.buffer).setUint32(12, 22050, true);
const ogg = new Uint8Array([...page(0, ident), ...page(0, new Uint8Array(10)), ...page(44100, new Uint8Array(10))]);
ok(JSON.stringify(Me.oggInfo(ogg)) === '{"seconds":2,"rate":22050,"channels":2}' && Me.oggInfo(wav) === null, 'oggInfo: the rate and channels from the Vorbis header, the length from the last page\'s granule');
ok(JSON.stringify(Me.peaks([0, 0.5, -1, 0.25], 2)) === '[0.5,1]', 'peaks: the loudest in each part');
const sd = Me.soundDefinitions([{ id: 'music', ext: 'wav', volume: 0.8 }, { id: 'hit-1' }], 'geoui');
ok(sd.json.format_version === '1.20.20' && sd.json.sound_definitions['geoui.music'].sounds[0].name === 'sounds/geoui/music' && sd.json.sound_definitions['geoui.music'].category === 'ui' && sd.paths.music === 'sounds/geoui/music.wav' && sd.paths['hit-1'] === 'sounds/geoui/hit_1.ogg',
  'soundDefinitions: Bedrock\'s sound_definitions.json and where each file goes in the RP');
const files = [{ name: 'a.txt', data: 'hello' }, { name: '日本/絵.png', data: new Uint8Array([1, 2, 3, 250]) }], zip = Me.zipStore(files), back = Me.unzipStore(zip);
const zlib = await import('node:zlib');
ok(back.length === 2 && back[0].name === 'a.txt' && Buffer.from(back[0].data).toString() === 'hello' && back[1].name === '日本/絵.png' && JSON.stringify([...back[1].data]) === '[1,2,3,250]' && JSON.stringify(Me.zipStore(files)) === JSON.stringify(zip) && (!zlib.crc32 || zlib.crc32(Buffer.from('hello')) === Me.crc32(Buffer.from('hello'))),
  'zipStore / unzipStore: a stored ZIP read back (UTF-8 names, the same bytes each time, CRC32 as zlib\'s)');
const broken = zip.slice(); broken[30 + 5] ^= 1;
let crcErr = ''; try { Me.unzipStore(broken); } catch (e) { crcErr = e.message; }
ok(/CRC/.test(crcErr), 'unzipStore: a changed byte is caught (CRC)');
ok(JSON.stringify(Me.sortSequence(['f_10.png', 'f_2.png', 'f_1.png', 'g_1.png'])) === '["f_1.png","f_2.png","f_10.png","g_1.png"]', 'sortSequence: by their numbers');
const outl = Me.strokeOutline([[0, 0], [10, 0]], 2);
const segDist = (p) => { const x = Math.max(0, Math.min(10, p[0])); return Math.hypot(p[0] - x, p[1]); };
ok(outl.length > 8 && outl.every((p) => Math.abs(segDist(p) - 1) < 1e-9), 'strokeOutline: every point of the outline is half the width from the line (round caps)');
const bi = Me.bodyImage(bodies[0], { pxPerUnit: 4 }), calls = [];
Me.drawOps(new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]), set: (_, k, v) => { calls.push([k, v]); return true; } }), bi.ops);
ok(bi.w > 0 && bi.h > 0 && calls.filter((c) => c[0] === 'stroke').length === 2 && calls.some((c) => c[0] === 'lineWidth' && c[1] === bodies[0].width * 4), 'bodyImage: a slider\'s body drawn as two strokes (border and fill) by drawOps on a canvas');

// ---- presets ----
const P = require('../bds/geoui/timeline/presets.js');
const list = P.presetList(), wrap = (frag) => ({ version: 1, sequences: [{ id: 's', duration: 10, ...frag }] });
const bad = list.map((p) => [p.id, M.validate(wrap(P.makePreset(p.id, { target: 'e' })))]).filter(([, v]) => v.length);
ok(list.length === 11 && !bad.length && list.every((p) => p.name && p.about && typeof p.options === 'object'), `presets: ${list.length}, each a valid fragment`, JSON.stringify(bad));
const base = M.normalize({ sequences: [{ id: 's', duration: 10, tracks: [] }] });
const applied = (id, o, at = 2) => M.reduce(base, { seq: 's', type: 'preset.apply', at, preset: P.makePreset(id, { target: 'e', ...o }) }).doc;
const cd = applied('countdown', {}), pg = applied('progress', { duration: 2 }), bl = applied('blink', { period: 0.5 }), val = (d, t, prop) => M.evaluate(d, 's', t).e[prop];
ok([2.5, 3.5, 4.5].map((t) => val(cd, t, 'value')).join() === '3,2,1' && val(pg, 3, 'fill') === 0.5 && val(bl, 2.1, 'opacity') === 1 && val(bl, 2.3, 'opacity') === 0 && val(bl, 2.55, 'opacity') === 1 && M.evaluate(cd, 's', 1).e.visible === false,
  'presets placed at the playhead (2 s): countdown 3·2·1, a gauge half full half way, blinking every quarter of a second');
let pe = ''; try { P.makePreset('nope'); } catch (e) { pe = e.message; }
ok(/nope/.test(pe) && /countdown/.test(pe), 'an unknown preset is said with the ones there are');

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-assets-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
