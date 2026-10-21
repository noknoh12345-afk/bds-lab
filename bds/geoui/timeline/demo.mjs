#!/usr/bin/env node
// GeoUI timeline — the sample: an osu!-style rhythm HUD made with the timeline and written to bds/addons/geoui_rhythm/ (an
// add-on the lab can test: tests.txt on a real BDS, app.txt in the real app). Everything is the lab's own: the beatmap, the
// textures (drawn here) and the click track (made here). node bds/geoui/timeline/demo.mjs [--check]
//   --check: write nothing, fail when the add-on in the repository is not what this makes (tests/tl-runtime-offline.mjs runs it)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const G = require('../geoui_builder.js');
require('./model.js'); require('./contract.js');
const Me = require('./media.js'), O = require('./osu.js'), C = require('./compile.js'), R = require('./runtime.js');
const NS = 'geoui', OUT = path.join(TOP, 'bds', 'addons', 'geoui_rhythm');

// ---- the beatmap: 120 BPM, 16 circles in 4 combos, a slider there and back, a spinner (written here, the lab's own)
const objects = [];
const at = (beat) => Math.round(1000 + beat * 500);
[[176, 160], [256, 112], [336, 160], [256, 208], [96, 96], [176, 64], [256, 96], [336, 64], [416, 96], [336, 192], [256, 288], [176, 192], [96, 288]].forEach(([x, y], i) => {
  objects.push(`${x},${y},${at(i)},${i % 4 === 0 ? 5 : 1},0,0:0:0:0:`);
});
objects.push(`128,240,${at(13)},6,0,B|256:320|384:240,2,280`);
objects.push(`256,192,${at(17)},12,0,${at(21)},0:0:0:0:`);
objects.push(`256,192,${at(22)},5,0,0:0:0:0:`, `176,192,${at(22.5)},1,0,0:0:0:0:`, `336,192,${at(23)},1,0,0:0:0:0:`);
const MAP = ['osu file format v14', '', '[General]', 'AudioFilename: click.wav', '', '[Metadata]', 'Title:Lab Click', 'Artist:bds-lab', 'Version:Demo', '',
  '[Difficulty]', 'HPDrainRate:5', 'CircleSize:4', 'OverallDifficulty:6', 'ApproachRate:7', 'SliderMultiplier:1.4', 'SliderTickRate:1', '',
  '[TimingPoints]', '1000,500,4,2,0,60,1,0', '', '[Colours]', 'Combo1 : 255,128,64', 'Combo2 : 64,192,255', 'Combo3 : 128,255,96', 'Combo4 : 255,96,192', '',
  '[HitObjects]', ...objects, ''].join('\n');

// ---- textures: one 128 x 128 atlas, drawn pixel by pixel
const W = 128, img = new Uint8Array(W * W * 4);
const px = (x, y, [r, g, b, a]) => { if (x < 0 || y < 0 || x >= W || y >= W) return; const o = (y * W + x) * 4; img[o] = r; img[o + 1] = g; img[o + 2] = b; img[o + 3] = a; };
const disc = (cx, cy, r0, r1, col) => { for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d >= r0 && d <= r1) px(x, y, col); } };
// (rows of 4 frames: a circle per combo colour, its approach ring per colour — the template's frame param.c picks it by uv_anim)
const REG = {
  hitcircle: [0, 0, 32, 32], approachcircle: [0, 32, 32, 32], hitburst: [0, 64, 32, 32], hitmiss: [32, 64, 32, 32],
  spinner: [64, 64, 32, 32], sliderball: [96, 64, 16, 16], bar: [96, 80, 32, 4], barback: [96, 84, 32, 4], digits: [0, 96, 40, 7],
};
const COLOURS = [[255, 128, 64], [64, 192, 255], [128, 255, 96], [255, 96, 192]];
COLOURS.forEach((c, k) => {
  disc(16 + 32 * k, 16, 0, 15, [40, 40, 60, 230]); disc(16 + 32 * k, 16, 12, 15, [255, 255, 255, 255]); disc(16 + 32 * k, 16, 0, 10, [...c, 255]);
  disc(16 + 32 * k, 48, 13, 16, [...c, 255]);
});
disc(16, 80, 0, 15, [255, 255, 200, 160]);
for (let k = 0; k < 20; k++) for (let w = 0; w < 2; w++) { px(38 + k + w, 70 + k, [255, 64, 64, 255]); px(57 - k + w, 70 + k, [255, 64, 64, 255]); }
disc(80, 80, 13, 15, [255, 255, 255, 255]); for (let y = 66; y < 80; y++) for (let x = 79; x <= 81; x++) px(x, y, [255, 220, 64, 255]);
disc(104, 72, 0, 7, [255, 255, 255, 255]); disc(104, 72, 0, 4, [255, 200, 64, 255]);
for (let x = 96; x < 128; x++) for (let y = 80; y < 84; y++) px(x, y, [96, 255, 128, 255]);
for (let x = 96; x < 128; x++) for (let y = 84; y < 88; y++) px(x, y, [40, 40, 40, 200]);
// (digits: a 3 x 5 font, each in a 4 x 7 cell)
const FONT = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
FONT.forEach((f, d) => { for (let i = 0; i < 15; i++) if (f[i] === '1') px(d * 4 + (i % 3), REG.digits[1] + 1 + Math.floor(i / 3), [255, 255, 255, 255]); });
const png = encodePng({ width: W, height: W, data: img });

// ---- the design: every element a plane centred on its own pivot (scale and rotation about its middle)
const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }], elements = {};
const plane = (name, parent, [cx, cy], [w, h], reg, z = 0, uvSize) => ({ name, parent, pivot: [cx, cy, z],
  cubes: [{ origin: [cx - w / 2, cy - h / 2, z], size: [w, h, 0], faces: { north: { uv: [reg[0], reg[1]], uv_size: uvSize || [reg[2], reg[3]], texture: 'atlas' } } }] });
const C0 = [0, 140];
for (const [name, size, z] of [['hitcircle', 20, -1], ['approachcircle', 20, -3], ['hitburst', 20, -2], ['hitmiss', 12, -4], ['spinner', 60, 0], ['sliderball', 10, -5]]) {
  bones.push(plane(name, 'geo_ui', C0, [size, size], REG[name], z)); elements[name] = { type: 'image', blend: 'blend' };
}
elements.hitcircle.frames = { cols: 4, rows: 4 }; elements.approachcircle.frames = { cols: 4, rows: 4 };
// numbers: the combo number (template), the score (6 digits, v0), the combo (3 digits, v1); the health gauge (v3)
const digitBones = (name, parent, [cx, cy], count, h) => {
  const w = h * 4 / 7, out = [];
  for (let k = 0; k < count; k++) out.push(Array.from({ length: 10 }, (_, d) => { const b = plane(`${name}_d${k}_${d}`, parent, [cx + (k - (count - 1) / 2) * w, cy], [w, h], [REG.digits[0] + d * 4, REG.digits[1], 4, 7], -6 - d * 0.02); bones.push(b); return b.name; }));   // (one shows at a time; apart in depth all the same)
  return out;
};
bones.push({ name: 'combonumber', parent: 'geo_ui', pivot: [0, 140, 0] });
elements.combonumber = { type: 'number', number: { source: '0', digits: digitBones('combonumber', 'combonumber', C0, 2, 8), hideLeadingZero: true } };
bones.push({ name: 'score', parent: 'geo_ui', pivot: [62, 205, 0] });
elements.score = { type: 'number', anchor: 'top-right', number: { source: `q.property('${NS}:v0')`, digits: digitBones('score', 'score', [62, 205], 6, 7), hideLeadingZero: false } };
bones.push({ name: 'combo', parent: 'geo_ui', pivot: [-70, 80, 0] });
elements.combo = { type: 'number', anchor: 'bottom-left', number: { source: `q.property('${NS}:v1')`, digits: digitBones('combo', 'combo', [-70, 80], 3, 9), hideLeadingZero: true } };
bones.push(plane('healthback', 'geo_ui', [-55, 206], [40, 4], REG.barback, 1)); elements.healthback = { type: 'image', anchor: 'top-left' };
bones.push(Object.assign(plane('health', 'geo_ui', [-55, 206], [40, 4], REG.bar, 0.5), { pivot: [-75, 206, 0.5] }));
elements.health = { type: 'gauge', anchor: 'top-left', gauge: { source: `q.property('${NS}:v3')`, max: 100, fill: 'left' } };
const design = { settings: { ns: NS, name: 'GeoUI Rhythm', description: 'GeoUI timeline sample: an osu!-style HUD (bds-lab)', bp: true, calibration: G.MEASURED.id }, seed: 'geoui_rhythm',
  bones, elements, textures: { atlas: { name: 'atlas', width: W, height: W, png: png.toString('base64') } } };

// ---- the timeline: the beatmap imported, the click track as its music
const map = O.parseOsu(MAP), { doc, info } = O.toDocument(map, { width: 120, designRadius: 10, sound: 'click' });
const seq = doc.sequences[0];
seq.name = 'Lab Click (demo)';
seq.markers = [{ id: 'end', t: at(24) / 1000, name: 'おわり', event: 'done' }];
const rate = 22050, len = Math.ceil((at(24) / 1000 + 1) * rate), pcm = new Float32Array(len);
for (let b = 0; b < 24; b++) { const s0 = Math.round((at(b) / 1000) * rate); for (let i = 0; i < 1200 && s0 + i < len; i++) pcm[s0 + i] = Math.sin((i / rate) * 2 * Math.PI * (b % 4 ? 880 : 1320)) * Math.exp(-i / 220) * 0.6; }
const wav = Me.makeWav(pcm, rate);

// ---- the pack: GeoUI Builder's export, the timeline's RP and BP added
const built = G.buildPack(design);
const rp = C.extendPack(built.files, doc, { design, core: G, bakedMax: 64, sounds: [{ id: 'click', ext: 'wav', data: wav }] });
const bp = R.extendBehavior(rp.files, doc, { stats: rp.stats, windows: info.difficulty.windows });
const files = bp.files, warnings = [...built.warnings, ...rp.warnings, ...bp.warnings];

// ---- the add-on folder: rp/ bp/ (the lab's layout), what it is, its tests
const out = new Map();
for (const [f, v] of Object.entries(files)) {
  const rel = f.replace(`${NS}_RP/`, 'rp/').replace(`${NS}_BP/`, 'bp/');
  out.set(rel, v && v.base64 ? Buffer.from(v.base64, 'base64') : v instanceof Uint8Array ? Buffer.from(v) : Buffer.from(String(v)));
}
out.set('imported.json', Buffer.from(`${JSON.stringify({ from: 'bds/geoui/timeline/demo.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: 'GeoUI のタイムラインで作った osu! 風の HUD（見本）: 譜面・絵・音はラボの物' }, null, 2)}\n`));
out.set('TASK.md', Buffer.from(`# geoui_rhythm — GeoUI のタイムラインで作った osu! 風の HUD（見本）

## Request
GeoUI Builder のタイムライン（bds/geoui/timeline）で、osu! のようなリズムゲームの画面を作れることを、本物の BDS と本物のアプリで確かめる。
作り方: \`node bds/geoui/timeline/demo.mjs\`（譜面・絵・クリックの音はラボの物。実在の譜面・曲は入れない）。

## What it is
- 譜面 ${info.counts.circles} 個の円・${info.counts.sliders} 本のスライダー（往復）・${info.counts.spinners} 個のスピナー、120 BPM、AR 7・CS 4・OD 6（判定 ${info.difficulty.windows.great}/${info.difficulty.windows.good}/${info.difficulty.windows.meh} ms）。
- RP: テンプレートの枠（円 ${Object.values(rp.stats.slots).map((s) => s.slots).join('・')} 枠）、出来事（当たり・外れ）、点数・コンボ（v0・v1）・体力のゲージ（v3）。
- BP: \`/scriptevent ${NS}:play 1\`・stop・pause・resume・seek <秒>・offset <ms>。ジャンプ・スニーク・アイテムを使うで判定。

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（タイムラインのプロパティが既定値）
- [ ] play で再生が始まる（seq・seq_gen・seq_from）
- [ ] seek・pause・resume がプロパティに出る
- [ ] stop で止まる
- [ ] 入り直すと、再生中のシーケンスをその時刻から送り直す（世代は続きの番号）
`));
out.set('tests.txt', Buffer.from(`# geoui_rhythm（bds/geoui/timeline/demo.mjs が作る）: タイムラインの BP（scripts/timeline.js）が本物の BDS で命令どおりにプロパティを書くか。
# 描画は app.txt（本物のアプリ）。= 完全一致 | ~ 正規表現 | ! 無い | !~ 無い正規表現 | '## 題' = 節

## 読み込める（タイムラインのプロパティが既定値）
@A join
wait 2000
js const e = p('A'); JSON.stringify(['seq','seq_gen','seq_from','seq_pause','t0s0g','t0s0r'].map((k) => e.getProperty('${NS}:' + k)))
= [0,0,0,false,0,0]

## play で再生が始まる（seq・seq_gen・seq_from）
scriptevent ${NS}:play 1
wait 500
js const e = p('A'); JSON.stringify(['seq','seq_gen','seq_from','seq_pause','v3'].map((k) => e.getProperty('${NS}:' + k)))
= [1,1,0,false,100]

## seek・pause・resume がプロパティに出る
scriptevent ${NS}:seek 4
wait 200
js const e = p('A'); JSON.stringify(['seq_gen','seq_from'].map((k) => e.getProperty('${NS}:' + k)))
= [2,4000]
scriptevent ${NS}:pause
wait 200
js p('A').getProperty('${NS}:seq_pause')
= true
scriptevent ${NS}:resume
wait 200
js const e = p('A'); JSON.stringify(['seq_pause','seq_gen'].map((k) => e.getProperty('${NS}:' + k)))
= [false,3]

## stop で止まる
scriptevent ${NS}:stop
wait 200
js p('A').getProperty('${NS}:seq')
= 0

## 入り直すと、再生中のシーケンスをその時刻から送り直す（世代は続きの番号）
scriptevent ${NS}:play 1 3
wait 1000
@A leave
wait 1500
@A join
wait 2000
js const e = p('A'), f = e.getProperty('${NS}:seq_from'); JSON.stringify([e.getProperty('${NS}:seq'), e.getProperty('${NS}:seq_gen'), Math.min(1, Math.floor(f / 4000)), Math.floor(f / 20000)])
= [1,5,1,0]
scriptevent ${NS}:stop
wait 200
js p('A').getProperty('${NS}:seq')
= 0
`));
const shots = [1.0, 2.0, 3.0, 4.0, 5.0, 6.5, 8.0, 9.5, 11.0, 12.5];
// (measured in the playfield's part of the 1560 x 720 screen: the first-person hand on the right and the chat on top left out)
const REGION = '0 170 1030 720';
out.set('app.txt', Buffer.from(`# geoui_rhythm を本物のアプリで: 再生して、決まった時刻に写す（GeoUI のタイムラインが描く: 円・接近の輪・番号・スライダーの玉・スピナー・点数）
# 時刻は再生を始めてからの目安（サーバーの命令が届くまでの遅れがある）。比べる基準は再生前の画面（world--before-play）。

section title
launch
until title 600000
shot title

section join
join
until joined 300000
wait 3000
do time set noon
do gamerule dodaylightcycle false
do gamerule sendcommandfeedback false
do gamerule commandblockoutput false
do weather clear
do tp @a 0 -60 0 0 90
do hud @a hide paperdoll
do hud @a hide touch_controls
do hud @a hide hotbar
do hud @a hide crosshair
wait 6000
shot world--before-play
absent clientlog \\bERROR\\b

section play
do scriptevent ${NS}:play 1
${shots.map((t, i) => `wait ${Math.round((t - (i ? shots[i - 1] : 0)) * 1000)}\nshot play-${String(t).replace('.', '_')}s\nmeasure diff play-${String(t).replace('.', '_')}s ${REGION}`).join('\n')}
absent clientlog \\bERROR\\b

section seek-pause
do scriptevent ${NS}:seek 6
wait 1500
shot seek-6s
measure diff seek-6s ${REGION}
do scriptevent ${NS}:pause
wait 1500
shot paused-a
wait 1500
shot paused-b
measure diff paused-b ${REGION}
do scriptevent ${NS}:stop
wait 2000
shot stopped
measure diff stopped ${REGION}
absent clientlog \\bERROR\\b

section log-molang
# (a content error of Molang: a pre_animation line that the game cannot run stops the lines after it — the slots then never show)
absent clientlog (?i)molang
`));
out.set('rp/sounds/README.md', Buffer.from('click.wav: the lab\'s own click track (bds/geoui/timeline/demo.mjs makes it: 880 / 1320 Hz on each beat).\n'));

if (process.argv.includes('--check')) {
  const stale = [];
  for (const [rel, data] of out) { const f = path.join(OUT, rel); if (!fs.existsSync(f) || !fs.readFileSync(f).equals(data)) stale.push(rel); }
  if (stale.length) { console.error(`bds/addons/geoui_rhythm is not what demo.mjs makes (${stale.slice(0, 5).join(', ')}): node bds/geoui/timeline/demo.mjs`); process.exit(1); }
  console.log(`OK bds/addons/geoui_rhythm is up to date (${out.size} files)`);
} else {
  fs.rmSync(path.join(OUT, 'rp'), { recursive: true, force: true }); fs.rmSync(path.join(OUT, 'bp'), { recursive: true, force: true });
  for (const [rel, data] of out) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); }
  console.log(`OK bds/addons/geoui_rhythm: ${out.size} files · slots ${JSON.stringify(Object.fromEntries(Object.entries(rp.stats.slots).map(([k, v]) => [k, `${v.slots} ${v.mode}`])))} · longest Molang ${rp.stats.longest} · properties ${bp.cfg ? Object.keys(JSON.parse(files[`${NS}_BP/entities/player.json`])['minecraft:entity'].description.properties).length : 0}`);
}
for (const w of [...new Set(warnings)]) console.log(`W ${w}`);
