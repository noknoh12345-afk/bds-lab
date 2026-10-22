#!/usr/bin/env node
// GeoUI timeline's runtime (bds/geoui/timeline/runtime.js), no network, no server: the behaviour pack's files (the player's
// properties, the script) and the script's own engine run with a fake world — play, the streamed slots filled before each
// instance shows and emptied after, presses judged by osu!'s windows (hits, misses, score, combo, accuracy, health), seek,
// pause and resume, markers. node tests/tl-runtime-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../bds/geoui/geoui_builder.js');
require('../bds/geoui/timeline/model.js');
const K = require('../bds/geoui/timeline/contract.js');
require('../bds/geoui/timeline/media.js');
const C = require('../bds/geoui/timeline/compile.js');
const O = require('../bds/geoui/timeline/osu.js');
const R = require('../bds/geoui/timeline/runtime.js');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };

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
const map = O.parseOsu(MAP), { doc } = O.toDocument(map, { width: 120 });
doc.sequences[0].markers = [{ id: 'kiai', t: 2.5, name: 'kiai', event: 'flash' }];
const names = Object.values(O.DEFAULT_ELEMENTS);
const plane = (name) => ({ name, parent: 'geo_ui', pivot: [0, 140, 0], cubes: [{ origin: [-5, 135, 0], size: [10, 10, 0], faces: { north: { uv: [0, 0], uv_size: [16, 16], texture: 't' } } }] });
const design = { settings: { ns: 'geoui' }, bones: [{ name: 'geo_ui', pivot: [0, 140, 0] }, ...names.map(plane)], elements: Object.fromEntries(names.map((x) => [x, { type: 'image' }])), textures: { t: { name: 'atlas', width: 16, height: 16, png: 'iVBORw0KGgo=' } } };
const built = G.buildPack(design), rp = C.extendPack(built.files, doc, { design, core: G, bakedMax: 0 });
const out = R.extendBehavior(rp.files, doc, { stats: rp.stats, windows: O.hitWindows(8) });

// ---- the files ----
const pj = JSON.parse(out.files['geoui_BP/entities/player.json']), props = pj['minecraft:entity'].description.properties;
ok(props['geoui:seq'] && props['geoui:seq_from'] && !props['geoui:seq_gen'] && !props['geoui:seq_pause'] && props['geoui:t0s0t'] && props['geoui:t0s0p'] && props['geoui:t0se0'] && !props['geoui:t0s0g'] && props['geoui:aspect'] && Object.keys(props).length <= 32 && /import '\.\/timeline\.js';\n$/.test(out.files['geoui_BP/scripts/main.js']),
  `the player's properties: the timeline's (${Object.keys(props).length} with GeoUI's own) and the script imported`, Object.keys(props).join(' '));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-runtime-')), f = path.join(tmp, 'timeline.mjs');
fs.writeFileSync(f, out.files['geoui_BP/scripts/timeline.js']);
const chk = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
fs.rmSync(tmp, { recursive: true, force: true });
ok(chk.status === 0 && out.cfg.windows.great === 32 && out.cfg.windows.ok === 120, 'the script parses (node --check); osu!\'s windows for OD 8 (32 / 76 / 120 ms)', chk.stderr);
ok(R.extendBehavior({}, doc, {}).warnings.some((w) => /ビヘイビアパック/.test(w)), 'no behaviour pack: said');

// ---- the engine with a fake world (the script's own code) ----
const world = { tick: 0, props: new Map(), events: [] }, A = { id: 'A' };
const io = { tick: () => world.tick, setProp: (p, k, v) => world.props.set(`${p.id}|${k}`, v), players: () => [A], event: (p, id, msg) => world.events.push([id, msg]) };
const E = R.createEngine(out.cfg, io), prop = (k) => world.props.get(`A|geoui:${k}`), seqOf = () => K.seqParts(prop('seq'));
// (a slot's result: its 3 bits of its group's property)
const resultOf = (tag, k) => Math.floor((prop(`${tag}e${Math.floor(k / 8)}`) || 0) / 8 ** (k % 8)) % 8;
const until = (ms) => { while (world.tick * 50 < ms) { world.tick++; E.tick(); } };
ok(E.command(A, 'play', ['1']) === '' && seqOf().seq === 1 && seqOf().gen === 1 && prop('seq_from') === 0 && seqOf().pause === false && prop('v0') === 0 && prop('v3') === 100, 'play: the sequence, a new generation from 0, the score reset');
const cfgSeq = out.cfg.sequences[0], circles = cfgSeq.templates.find((t) => t.mode === 'streamed'), first = circles.items[0], lead = circles.lead;
until(first[0] - lead - 250 - 50);
const before = prop(`t0s${first[1]}t`);
until(first[0] - lead - 200);
ok(before === undefined && prop(`t0s${first[1]}t`) === first[0] && prop(`t0s${first[1]}p`) === K.pack(doc.sequences[0].instances.find((x) => x.id === first[4]).params, doc.sequences[0].templates[0].pack),
  'streamed: an instance put in its slot (its time and packed params) a moment (250 ms) before it shows');
until(1000);
const hit = E.press(A);
ok(hit && hit.judge === 'great' && hit.instance === 'o1' && resultOf('t0s', first[1]) === 1 && prop('v0') === 300 && prop('v1') === 1, 'a press on time: great (300), the hit sent to its slot (its 3 bits: 1), the combo', JSON.stringify(hit));
until(1250 + 120 + 50);
const o2 = cfgSeq.hits.find((h) => h[3] === 'o2');
ok(resultOf(o2[1], o2[2]) === 2 && prop('v1') === 0 && prop('v3') < 100 && prop('v2') === 5000, 'no press: a miss once its window passed (its 3 bits: 2), the combo broken, health down, accuracy 50 %');

until(1500 - 60);
const late = E.press(A);
ok(late && late.judge === 'good' && E.press(A) === null, 'a press 60 ms early: good (100); a press with nothing near: nothing', JSON.stringify(late));
until(first[3] + 100);
ok(prop(`t0s${first[1]}t`) === -1 || cfgSeq.templates.find((t) => t.mode === 'streamed').items.some((it) => it[1] === first[1] && it[0] - lead - 250 <= world.tick * 50 && world.tick * 50 < it[3]), 'a slot emptied (-1) after its instance, unless the next one already took it');
until(2600);
ok(world.events.some(([id, msg]) => id === 'geoui:marker' && msg === '1:kiai flash'), 'a marker with an event: /scriptevent geoui:marker 1:kiai flash', JSON.stringify(world.events));
const gen0 = seqOf().gen;
E.command(A, 'seek', ['0.5']);
ok(seqOf().gen === gen0 + 1 && prop('seq_from') === 500 && E.state(A).judged.size === 0 && [0, 1, 2, 3].every((k) => resultOf('t0s', k) === 0), 'seek: a new generation from 0.5 s, the instances after it not judged yet, every slot\'s result back to 0');
E.command(A, 'pause', []);
const pausedAt = prop('seq_from');
world.tick += 40; E.tick();
ok(seqOf().pause === true && seqOf().gen === gen0 + 1 && E.press(A) === null && prop('seq_from') === pausedAt, 'pause: the time held (paused, seq_from), presses ignored');
E.command(A, 'resume', []);
ok(seqOf().pause === false && seqOf().gen === gen0 + 2 && prop('seq_from') === pausedAt, 'resume: from where it stopped, a new generation');
ok(E.command(A, 'play', ['9']).includes('no sequence') && E.command({ id: 'B' }, 'seek', ['1']).includes('nothing') && E.command(A, 'stop', []) === '' && seqOf().seq === 0, 'a sequence that is not there, nothing playing, stop: said / done');
// (the next instance in o1's slot: the slot's result back to 0 the moment it takes the slot — never shown the last one's)
{
  const w3 = { tick: 0, props: new Map() }, Z = { id: 'Z' }, E3 = R.createEngine(out.cfg, { tick: () => w3.tick, setProp: (p, k, v) => w3.props.set(k, v), players: () => [Z] });
  const go = (ms) => { while (w3.tick * 50 < ms) { w3.tick++; E3.tick(); } }, res = (k) => Math.floor((w3.props.get(`geoui:t0se${Math.floor(k / 8)}`) || 0) / 8 ** (k % 8)) % 8;
  const nxt = circles.items.find((it) => it[1] === first[1] && it[0] > first[0]);
  E3.command(Z, 'play', ['1']); go(1000); E3.press(Z);
  go(nxt[5] - 50); const was = res(first[1]); go(nxt[5] + 50);
  ok(was === 1 && res(first[1]) === 0, 'the next instance takes the slot: its result back to 0 (the hit before still there until then)', `${was} ${res(first[1])}`);
}
const plan = R.planOf(doc, rp.stats);
ok(plan.sequences[0].hits.length === 6 && !plan.sequences[0].hits.some((h) => h[3] === 'o7'), 'the instances that take a press: circles and the slider, not the spinner');

// ---- the audio clips on the sequence's time (the script plays and stops them); a player who joins again ----
{
  const d2 = JSON.parse(JSON.stringify(doc));
  // (the osu! map's own music track out; a music clip and an effect on tracks of their own: clips on one track never overlap)
  d2.sequences[0].tracks = [...d2.sequences[0].tracks.filter((t) => t.kind !== 'audio'), { id: 'aud', kind: 'audio', name: 'music', clips: [{ id: 'm', start: 0, end: 4, sound: 'Music', volume: 0.8 }] },
    { id: 'aud2', kind: 'audio', name: 'fx', clips: [{ id: 'fx', start: 2, end: 2.5, sound: 'fx-1', pitch: 1.5 }] }];
  const rp2 = C.extendPack(built.files, d2, { design, core: G, bakedMax: 0, sounds: [{ id: 'Music', ext: 'ogg', data: new Uint8Array([79, 103, 103, 83]) }, { id: 'fx-1', ext: 'wav', data: new Uint8Array([82, 73, 70, 70]) }] });
  const out2 = R.extendBehavior(rp2.files, d2, { stats: rp2.stats });
  const anims2 = rp2.files['geoui_RP/animations/geoui.animation.json'], sdj = JSON.parse(rp2.files['geoui_RP/sounds/sound_definitions.json']).sound_definitions;
  ok(!/sound_effects/.test(anims2) && !/sound_effects/.test(rp2.files['geoui_RP/entity/player.entity.json']) && sdj['geoui.music'] && sdj['geoui.fx_1'] && rp2.files['geoui_RP/sounds/geoui/music.ogg'] && rp2.files['geoui_RP/sounds/geoui/fx_1.wav']
    && JSON.stringify(out2.cfg.sequences[0].sounds) === JSON.stringify([[0, 'geoui.music', 0.8, 1], [2000, 'geoui.fx_1', 1, 1.5]]),
  'audio clips: their sounds defined in the RP, none in an animation (its own clock follows no seek); the script has each clip\'s time, name, volume and pitch', JSON.stringify(out2.cfg.sequences[0].sounds));
  ok(/playerSpawn/.test(out2.files['geoui_BP/scripts/timeline.js']) && /stopsound @s/.test(out2.files['geoui_BP/scripts/timeline.js']) && /playSound\(id, \{ volume, pitch \}\)/.test(out2.files['geoui_BP/scripts/timeline.js']),
    'the script: plays a clip (Player.playSound, its volume and pitch), stops it (/stopsound @s), and greets a player who joins again');
  const w = { tick: 0, props: new Map([['geoui:seq', K.seqValue({ seq: 0, gen: 7 })]]), sounds: [], stops: [] }, B = { id: 'B' }, wseq = () => K.seqParts(w.props.get('geoui:seq'));
  const io2 = { tick: () => w.tick, setProp: (p, k, v) => w.props.set(k, v), getProp: (p, k) => w.props.get(k), players: () => [B], event: () => {},
    sound: (p, id, vol, pi) => w.sounds.push([w.tick * 50, id, vol, pi]), stopSound: (p, id) => w.stops.push([w.tick * 50, id]) };
  const E2 = R.createEngine(out2.cfg, io2), go = (ms) => { while (w.tick * 50 < ms) { w.tick++; E2.tick(); } };
  E2.command(B, 'play', ['1']);
  ok(wseq().gen === 8 && wseq().seq === 1, 'the generation goes on from the one the player has (a world keeps it: 7 → 8, never the same number again)', JSON.stringify(wseq()));
  go(2600);
  ok(JSON.stringify(w.sounds) === JSON.stringify([[50, 'geoui.music', 0.8, 1], [2000, 'geoui.fx_1', 1, 1.5]]), 'played: the music at its time, the effect at 2 s, each once, with its volume and pitch', JSON.stringify(w.sounds));
  E2.command(B, 'pause', []);
  ok(w.stops.length === 2 && w.stops.every(([t]) => t === 2600) && new Set(w.stops.map((x) => x[1])).size === 2, 'pause: every sound it started is stopped (a sound in the game cannot be held)', JSON.stringify(w.stops));
  E2.command(B, 'resume', []); go(3000);
  ok(w.sounds.length === 2, 'resume: a sound already past stays silent (one cannot start part-way)', JSON.stringify(w.sounds));
  E2.command(B, 'seek', ['1.9']); go(3400);
  ok(w.sounds.length === 3 && w.sounds[2][1] === 'geoui.fx_1', 'seek before a clip: it plays when the time reaches it again', JSON.stringify(w.sounds));
  // (a player back in the world: the sequence sent again from where it is — a new generation, its time — the score kept)
  const gen = wseq().gen, at = E2.state(B).from + (w.tick - E2.state(B).start) * 50;
  E2.joined(B);
  ok(wseq().gen === gen + 1 && w.props.get('geoui:seq_from') === at && wseq().seq === 1 && wseq().pause === false, 'joined again while playing: the sequence again from where it is (a new generation)', JSON.stringify(wseq()));
  E2.command(B, 'stop', []);
  ok(w.stops.at(-1)[1] === 'geoui.fx_1' && wseq().seq === 0, 'stop: what still rings stopped');
  const C2 = { id: 'C' };
  w.props.set('geoui:seq', K.seqValue({ seq: 1, gen: 3 }));
  E2.joined(C2);
  ok(wseq().seq === 0 && wseq().gen === 3, 'joined with nothing playing for them, but a sequence still in their properties (a world saved while it played): stopped (the generation kept)');
  // (a loop: the clips again each round)
  const cfgL = JSON.parse(JSON.stringify(out2.cfg));
  Object.assign(cfgL.sequences[0], { loop: 'loop', inOut: [0, 3000], templates: [], hits: [] });
  const wl = { tick: 0, sounds: [] }, EL = R.createEngine(cfgL, { tick: () => wl.tick, setProp: () => {}, players: () => [B], sound: (p, id) => wl.sounds.push([wl.tick * 50, id]), stopSound: () => {} });
  EL.command(B, 'play', ['1']);
  while (wl.tick * 50 < 6600) { wl.tick++; EL.tick(); }
  ok(JSON.stringify(wl.sounds.map((x) => x[0])) === JSON.stringify([50, 2000, 3000, 5000, 6000]), 'a loop: the clips again at each round', JSON.stringify(wl.sounds));
  // (a pingpong: forwards, then back — the way back neither heard nor judged — then forwards again, heard again)
  const cfgP = JSON.parse(JSON.stringify(out2.cfg));
  Object.assign(cfgP.sequences[0], { loop: 'pingpong', inOut: [0, 3000] });
  const wp = { tick: 0, sounds: [], props: new Map() }, EP = R.createEngine(cfgP, { tick: () => wp.tick, setProp: (p, k, v) => wp.props.set(k, v), players: () => [B], sound: (p, id) => wp.sounds.push([wp.tick * 50, id]), stopSound: () => {} });
  EP.command(B, 'play', ['1']);
  const presses = [];
  while (wp.tick * 50 < 9100) { wp.tick++; EP.tick(); if ([1000, 5000, 7000].includes(wp.tick * 50)) presses.push(EP.press(B)); }
  ok(JSON.stringify(wp.sounds.map((x) => x[0])) === JSON.stringify([50, 2000, 6000, 8000]) && presses[0] && presses[0].instance === 'o1' && presses[1] === null && presses[2] && presses[2].instance === 'o1',
    'a pingpong: the clips forwards each time (not on the way back: a sound cannot play backwards), presses judged forwards only — o1 again in the third round', JSON.stringify({ s: wp.sounds.map((x) => x[0]), presses }));
}

// ---- a loop of streamed instances: the second round streamed and judged anew (a loop went round only once before) ----
{
  const dl = JSON.parse(JSON.stringify(doc));
  Object.assign(dl.sequences[0], { loop: 'loop', inOut: [0, 3.2] });
  const rpl = C.extendPack(built.files, dl, { design, core: G, bakedMax: 0 }), outl = R.extendBehavior(rpl.files, dl, { stats: rpl.stats, windows: O.hitWindows(8) });
  const wl = { tick: 0, props: new Map() }, L = { id: 'L' }, EL = R.createEngine(outl.cfg, { tick: () => wl.tick, setProp: (p, k, v) => wl.props.set(k, v), players: () => [L] });
  const go = (ms) => { while (wl.tick * 50 < ms) { wl.tick++; EL.tick(); } };
  const c0 = outl.cfg.sequences[0].templates.find((t) => t.mode === 'streamed'), it0 = c0.items[0], slotT = () => wl.props.get(`geoui:t0s${it0[1]}t`);
  EL.command(L, 'play', ['1']);
  go(1000); const h1 = EL.press(L);
  go(3200 + it0[5] - 250 + 100); const back = slotT();
  go(3200 + 1000); const h2 = EL.press(L);
  ok(h1 && h1.instance === 'o1' && back === it0[0] && h2 && h2.instance === 'o1' && h2.judge === 'great', 'loop: the first instance streamed into its slot again in the second round and judged again', JSON.stringify({ h1, back, h2 }));
}

// ---- the sample add-on (bds/addons/geoui_rhythm) is what demo.mjs makes ----
const demo = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'bds', 'geoui', 'timeline', 'demo.mjs'), '--check'], { encoding: 'utf8' });
ok(demo.status === 0, 'bds/addons/geoui_rhythm is up to date with demo.mjs', demo.stderr + demo.stdout);
// (the game stops a pre_animation at a line that reads a variable not set yet: in geoui_rhythm that left every slot dead)
{
  const ent = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'bds', 'addons', 'geoui_rhythm', 'rp', 'entity', 'player.entity.json'), 'utf8'))['minecraft:client_entity'].description;
  const unset = G.unsetReads(ent.scripts.pre_animation, { init: ent.scripts.initialize });
  ok(!unset.length, 'geoui_rhythm: its pre_animation reads no variable before setting it (the game would stop there, every frame)', unset.join(', '));
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-runtime-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
