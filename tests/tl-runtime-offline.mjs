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
ok(props['geoui:seq'] && props['geoui:seq_gen'] && props['geoui:seq_pause'].type === 'bool' && props['geoui:t0s0t'] && props['geoui:t0s0p'] && props['geoui:t0s0g'] && props['geoui:aspect'] && /import '\.\/timeline\.js';\n$/.test(out.files['geoui_BP/scripts/main.js']),
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
const E = R.createEngine(out.cfg, io), prop = (k) => world.props.get(`A|geoui:${k}`);
const until = (ms) => { while (world.tick * 50 < ms) { world.tick++; E.tick(); } };
ok(E.command(A, 'play', ['1']) === '' && prop('seq') === 1 && prop('seq_gen') === 1 && prop('seq_from') === 0 && prop('seq_pause') === false && prop('v0') === 0 && prop('v3') === 100, 'play: the sequence, a new generation from 0, the score reset');
const cfgSeq = out.cfg.sequences[0], circles = cfgSeq.templates.find((t) => t.mode === 'streamed'), first = circles.items[0], lead = circles.lead;
until(first[0] - lead - 250 - 50);
const before = prop(`t0s${first[1]}t`);
until(first[0] - lead - 200);
ok(before === undefined && prop(`t0s${first[1]}t`) === first[0] && prop(`t0s${first[1]}p`) === K.pack(doc.sequences[0].instances.find((x) => x.id === first[4]).params, doc.sequences[0].templates[0].pack),
  'streamed: an instance put in its slot (its time and packed params) a moment (250 ms) before it shows');
until(1000);
const hit = E.press(A);
ok(hit && hit.judge === 'great' && hit.instance === 'o1' && prop(`t0s${first[1]}r`) === 1 && prop(`t0s${first[1]}g`) === 1 && prop('v0') === 300 && prop('v1') === 1, 'a press on time: great (300), the hit sent to its slot (r 1, g +1), the combo', JSON.stringify(hit));
until(1250 + 120 + 50);
const o2 = cfgSeq.hits.find((h) => h[3] === 'o2');
ok(prop(`${o2[1]}${o2[2]}r`) === 2 && prop('v1') === 0 && prop('v3') < 100 && prop('v2') === 5000, 'no press: a miss once its window passed (r 2), the combo broken, health down, accuracy 50 %');
until(1500 - 60);
const late = E.press(A);
ok(late && late.judge === 'good' && E.press(A) === null, 'a press 60 ms early: good (100); a press with nothing near: nothing', JSON.stringify(late));
until(first[3] + 100);
ok(prop(`t0s${first[1]}t`) === -1 || cfgSeq.templates.find((t) => t.mode === 'streamed').items.some((it) => it[1] === first[1] && it[0] - lead - 250 <= world.tick * 50 && world.tick * 50 < it[3]), 'a slot emptied (-1) after its instance, unless the next one already took it');
until(2600);
ok(world.events.some(([id, msg]) => id === 'geoui:marker' && msg === '1:kiai flash'), 'a marker with an event: /scriptevent geoui:marker 1:kiai flash', JSON.stringify(world.events));
const gen0 = prop('seq_gen');
E.command(A, 'seek', ['0.5']);
ok(prop('seq_gen') === gen0 + 1 && prop('seq_from') === 500 && E.state(A).judged.size === 0, 'seek: a new generation from 0.5 s, the instances after it not judged yet');
E.command(A, 'pause', []);
const pausedAt = prop('seq_from');
world.tick += 40; E.tick();
ok(prop('seq_pause') === true && E.press(A) === null && prop('seq_from') === pausedAt, 'pause: the time held (seq_pause, seq_from), presses ignored');
E.command(A, 'resume', []);
ok(prop('seq_pause') === false && prop('seq_gen') === gen0 + 2 && prop('seq_from') === pausedAt, 'resume: from where it stopped, a new generation');
ok(E.command(A, 'play', ['9']).includes('no sequence') && E.command({ id: 'B' }, 'seek', ['1']).includes('nothing') && E.command(A, 'stop', []) === '' && prop('seq') === 0, 'a sequence that is not there, nothing playing, stop: said / done');
const plan = R.planOf(doc, rp.stats);
ok(plan.sequences[0].hits.length === 6 && !plan.sequences[0].hits.some((h) => h[3] === 'o7'), 'the instances that take a press: circles and the slider, not the spinner');

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
