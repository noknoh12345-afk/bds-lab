#!/usr/bin/env node
// GeoUI timeline — the samples: an osu!-style rhythm HUD made with the timeline and written to bds/addons/geoui_rhythm/ (a
// short map: 19 objects, a click track) and bds/addons/geoui_rhythm_big/ (a map of real size: osu.sampleMap's 300 objects over
// two minutes, no music) — add-ons the lab can test: tests.txt on a real BDS, app.txt in the real app. Everything is the lab's
// own: the beatmaps, the textures (drawn here) and the click track (made here). node bds/geoui/timeline/demo.mjs [--check]
//   --check: write nothing, fail when an add-on in the repository is not what this makes (tests/tl-runtime-offline.mjs runs it)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const G = require('../geoui_builder.js');
require('./model.js'); require('./contract.js');
const Me = require('./media.js'), O = require('./osu.js'), C = require('./compile.js'), R = require('./runtime.js'), Br = require('./bridge.js');
const NS = 'geoui';
let failed = false;

function make(V) {
const OUT = path.join(TOP, 'bds', 'addons', V.name);
// ---- the beatmap: 120 BPM, 16 circles in 4 combos, a slider there and back, a spinner (written here, the lab's own) — or the
//      large one (osu.sampleMap)
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
const map = O.parseOsu(V.big ? O.sampleMap(V.big) : MAP), { doc, bodies, info } = O.toDocument(map, { width: 120, designRadius: 10, sound: 'click' });

// ---- textures: one atlas (128 x 256; the large map's 1024 x 1024 for its bodies), drawn pixel by pixel
const W = V.atlas[0], H = V.atlas[1], img = new Uint8Array(W * H * 4);
const px = (x, y, [r, g, b, a]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; img[o] = r; img[o + 1] = g; img[o + 2] = b; img[o + 3] = a; };
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
// (the slider bodies under the rest: the editor's own atlas of them (bridge.bodyAtlas, a cell each — param f picks it) and its
//  look (media.bodyImage, along the ball's way), drawn without a canvas (media.rasterOps), each centred in its cell)
const BODY_Y = 128, BA = Br.bodyAtlas(bodies, { maxSize: Math.min(W, H - BODY_Y), most: 2 });
if (BODY_Y + BA.h > H) throw new Error(`the slider bodies (${BA.w} x ${BA.h} px) do not fit under the atlas's rest`);
REG.sliderbody = [0, BODY_Y, BA.cell[0], BA.cell[1]];
bodies.forEach((b, i) => {
  const bi = Me.bodyImage(b, { pxPerUnit: BA.pxPerUnit }), [cx, cy] = BA.at(i), dx = (BA.cell[0] - bi.w) / 2, dy = (BA.cell[1] - bi.h) / 2;
  const ras = Me.rasterOps(bi.ops.map(([op, ...a]) => (op === 'moveTo' || op === 'lineTo' ? [op, a[0] + dx, a[1] + dy] : [op, ...a])), BA.cell[0], BA.cell[1]);
  for (let y = 0; y < ras.height; y++) for (let x = 0; x < ras.width; x++) { const s = (y * ras.width + x) * 4; if (ras.data[s + 3]) px(cx + x, BODY_Y + cy + y, [...ras.data.subarray(s, s + 4)]); }
});
const png = encodePng({ width: W, height: H, data: img });

// ---- the design: every element a plane centred on its own pivot (scale and rotation about its middle)
const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }], elements = {};
const plane = (name, parent, [cx, cy], [w, h], reg, z = 0, uvSize) => ({ name, parent, pivot: [cx, cy, z],
  cubes: [{ origin: [cx - w / 2, cy - h / 2, z], size: [w, h, 0], faces: { north: { uv: [reg[0], reg[1]], uv_size: uvSize || [reg[2], reg[3]], texture: 'atlas' } } }] });
const C0 = [0, 140];
for (const [name, size, z] of [['hitcircle', 20, -1], ['approachcircle', 20, -3], ['hitburst', 20, -2], ['hitmiss', 12, -4], ['spinner', 60, 0], ['sliderball', 10, -5]]) {
  bones.push(plane(name, 'geo_ui', C0, [size, size], REG[name], z)); elements[name] = { type: 'image', blend: 'blend' };
}
elements.hitcircle.frames = { cols: 4, rows: 4 }; elements.approachcircle.frames = { cols: 4, rows: 4 };
// the slider body: a plane its atlas cell's size (in units), behind the circles; the template puts it at its line's middle
bones.push(plane('sliderbody', 'geo_ui', C0, BA.units, REG.sliderbody, 0.7)); elements.sliderbody = { type: 'image', blend: 'blend', frames: { cols: BA.cols, rows: BA.rows } };
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
const design = { settings: { ns: NS, name: V.title, description: V.description, bp: true, calibration: G.MEASURED.id }, seed: V.name,
  bones, elements, textures: { atlas: { name: 'atlas', width: W, height: H, png: png.toString('base64') } } };

// ---- the timeline: the beatmap imported (above), the click track as its music
const seq = doc.sequences[0];
seq.name = V.big ? `Lab Sample ${V.big}` : 'Lab Click (demo)';
let sounds = [];
if (V.big) {
  // (no music for two minutes: the map alone, played silent; the end marked)
  seq.tracks = seq.tracks.filter((t) => t.kind !== 'audio');
  seq.markers = [{ id: 'end', t: Math.round((seq.duration - 1) * 1000) / 1000, name: 'おわり', event: 'done' }];
} else {
  seq.markers = [{ id: 'end', t: at(24) / 1000, name: 'おわり', event: 'done' }];
  const rate = 22050, len = Math.ceil((at(24) / 1000 + 1) * rate), pcm = new Float32Array(len);
  for (let b = 0; b < 24; b++) { const s0 = Math.round((at(b) / 1000) * rate); for (let i = 0; i < 1200 && s0 + i < len; i++) pcm[s0 + i] = Math.sin((i / rate) * 2 * Math.PI * (b % 4 ? 880 : 1320)) * Math.exp(-i / 220) * 0.6; }
  sounds = [{ id: 'click', ext: 'wav', data: Me.makeWav(pcm, rate) }];
}

// ---- the pack: GeoUI Builder's export, the timeline's RP and BP added
const built = G.buildPack(design);
const rp = C.extendPack(built.files, doc, { design, core: G, sounds });
const bp = R.extendBehavior(rp.files, doc, { stats: rp.stats, windows: info.difficulty.windows });
const files = bp.files, warnings = [...built.warnings, ...rp.warnings, ...bp.warnings];

// ---- the add-on folder: rp/ bp/ (the lab's layout), what it is, its tests
const out = new Map();
for (const [f, v] of Object.entries(files)) {
  const rel = f.replace(`${NS}_RP/`, 'rp/').replace(`${NS}_BP/`, 'bp/');
  out.set(rel, v && v.base64 ? Buffer.from(v.base64, 'base64') : v instanceof Uint8Array ? Buffer.from(v) : Buffer.from(String(v)));
}
out.set('imported.json', Buffer.from(`${JSON.stringify({ from: 'bds/geoui/timeline/demo.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: V.big ? `GeoUI のタイムラインで作った osu! 風の HUD（本物の大きさの譜面 ${V.big} 個の見本）: 譜面・絵はラボの物` : 'GeoUI のタイムラインで作った osu! 風の HUD（見本）: 譜面・絵・音はラボの物' }, null, 2)}\n`));
const props = Object.keys(JSON.parse(files[`${NS}_BP/entities/player.json`])['minecraft:entity'].description.properties).length;
out.set('TASK.md', Buffer.from(`# ${V.name} — GeoUI のタイムラインで作った osu! 風の HUD（${V.big ? `本物の大きさの譜面 ${V.big} 個の見本` : '見本'}）

## Request
GeoUI Builder のタイムライン（bds/geoui/timeline）で、osu! のようなリズムゲームの画面を作れることを、本物の BDS と本物のアプリで確かめる${V.big ? '。本物の大きさの譜面（何百個）でも、プロパティ・Molang の行・ボーン・アニメーションがゲームの限度に収まり、写した画が動くこと' : ''}。
作り方: \`node bds/geoui/timeline/demo.mjs\`（譜面・絵${V.big ? '' : '・クリックの音'}はラボの物。実在の譜面・曲は入れない）。

## What it is
- 譜面 ${info.counts.circles} 個の円・${info.counts.sliders} 本のスライダー（往復も）・${info.counts.spinners} 個のスピナー、${V.big ? '180 BPM、AR 9・CS 4・OD 8' : '120 BPM、AR 7・CS 4・OD 6'}（判定 ${info.difficulty.windows.great}/${info.difficulty.windows.good}/${info.difficulty.windows.meh} ms）、${Math.round(seq.duration)} 秒${V.big ? '（音楽なし）' : ''}。
- RP: テンプレートの枠（${Object.values(rp.stats.slots).map((s) => `${s.slots} 枠`).join('・')}、焼き込み: 見た目はクライアントの時計だけで動く）、スライダーの玉は実体ごとのアニメーション、出来事（当たり・外れ）、点数・コンボ（v0・v1）・体力のゲージ（v3）。
- 大きさ: プレイヤーのプロパティ ${props} 個（GeoUI の 11 個を含む・上限 32）、pre_animation ${rp.stats.lines} 行（最長 ${rp.stats.longest} 文字・括弧 ${rp.stats.deepest} 段）、ボーン ${rp.stats.counts.bones} 本、要素ごとの render controller ${rp.stats.counts.renderControllers} 個、アニメーション ${rp.stats.counts.animations} 個。
- BP: \`/scriptevent ${NS}:play 1\`・stop・pause・resume・seek <秒>・offset <ms>。ジャンプ・スニーク・アイテムを使うで判定。

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（タイムラインのプロパティが既定値）
- [ ] play で再生が始まる（seq の番号と世代・seq_from）
- [ ] seek・pause・resume がプロパティに出る
- [ ] stop で止まる
- [ ] 入り直すと、再生中のシーケンスをその時刻から送り直す（世代は続きの番号）
`));
// (the seq property, as contract.js packs it: [the sequence, paused, the generation])
const SEQ = 'const q = (v) => [v % 1024, Math.floor(v / 1024) % 2 === 1, Math.floor(v / 2048)];';
out.set('tests.txt', Buffer.from(`# ${V.name}（bds/geoui/timeline/demo.mjs が作る）: タイムラインの BP（scripts/timeline.js）が本物の BDS で命令どおりにプロパティを書くか。
# 描画は app.txt（本物のアプリ）。= 完全一致 | ~ 正規表現 | ! 無い | !~ 無い正規表現 | '## 題' = 節
# seq は 1 つの数: シーケンス + 1024 × 止め + 2048 × 世代（contract.js）。q() が [シーケンス, 止め, 世代] に戻す。

## 読み込める（タイムラインのプロパティが既定値）
@A join
wait 2000
js const e = p('A'); ${SEQ} JSON.stringify([...q(e.getProperty('${NS}:seq')), ...['seq_from','t0se0'].map((k) => e.getProperty('${NS}:' + k))])
= [0,false,0,0,0]

## play で再生が始まる（seq の番号と世代・seq_from）
scriptevent ${NS}:play 1
wait 500
js const e = p('A'); ${SEQ} JSON.stringify([...q(e.getProperty('${NS}:seq')), ...['seq_from','v3'].map((k) => e.getProperty('${NS}:' + k))])
= [1,false,1,0,100]

## seek・pause・resume がプロパティに出る
scriptevent ${NS}:seek 4
wait 200
js const e = p('A'); ${SEQ} JSON.stringify([q(e.getProperty('${NS}:seq'))[2], e.getProperty('${NS}:seq_from')])
= [2,4000]
scriptevent ${NS}:pause
wait 200
js ${SEQ} JSON.stringify(q(p('A').getProperty('${NS}:seq')))
= [1,true,2]
scriptevent ${NS}:resume
wait 200
js ${SEQ} JSON.stringify(q(p('A').getProperty('${NS}:seq')))
= [1,false,3]

## stop で止まる
scriptevent ${NS}:stop
wait 200
js ${SEQ} q(p('A').getProperty('${NS}:seq'))[0]
= 0

## 入り直すと、再生中のシーケンスをその時刻から送り直す（世代は続きの番号）
scriptevent ${NS}:play 1 3
wait 1000
@A leave
wait 1500
@A join
wait 2000
js const e = p('A'), f = e.getProperty('${NS}:seq_from'); ${SEQ} const v = q(e.getProperty('${NS}:seq')); JSON.stringify([v[0], v[2], Math.min(1, Math.floor(f / 4000)), Math.floor(f / 20000)])
= [1,5,1,0]
scriptevent ${NS}:stop
wait 200
js ${SEQ} q(p('A').getProperty('${NS}:seq'))[0]
= 0
`));
const shots = V.shots;
// (measured in the playfield's part of the 1560 x 720 screen: the first-person hand on the right and the chat on top left out)
const REGION = '0 170 1030 720';
out.set('app.txt', Buffer.from(`# ${V.name} を本物のアプリで: 再生して、決まった時刻に写す（GeoUI のタイムラインが描く: 円・接近の輪・番号・スライダーの体と玉・スピナー・点数）
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
do scriptevent ${NS}:seek ${V.seek}
wait 1500
shot seek-${V.seek}s
measure diff seek-${V.seek}s ${REGION}
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
if (!V.big) out.set('rp/sounds/README.md', Buffer.from('click.wav: the lab\'s own click track (bds/geoui/timeline/demo.mjs makes it: 880 / 1320 Hz on each beat).\n'));

const rel0 = `bds/addons/${V.name}`;
if (process.argv.includes('--check')) {
  const stale = [];
  for (const [rel, data] of out) { const f = path.join(OUT, rel); if (!fs.existsSync(f) || !fs.readFileSync(f).equals(data)) stale.push(rel); }
  // (and nothing left over that this no longer makes)
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(OUT, path.join(d, e.name)).split(path.sep).join('/')])) : []);
  for (const rel of [...walk(path.join(OUT, 'rp')), ...walk(path.join(OUT, 'bp'))]) if (!out.has(rel)) stale.push(`${rel} (left over)`);
  if (stale.length) { console.error(`${rel0} is not what demo.mjs makes (${stale.slice(0, 5).join(', ')}): node bds/geoui/timeline/demo.mjs`); failed = true; }
  else console.log(`OK ${rel0} is up to date (${out.size} files)`);
} else {
  fs.rmSync(path.join(OUT, 'rp'), { recursive: true, force: true }); fs.rmSync(path.join(OUT, 'bp'), { recursive: true, force: true });
  for (const [rel, data] of out) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); }
  console.log(`OK ${rel0}: ${out.size} files · slots ${JSON.stringify(Object.fromEntries(Object.entries(rp.stats.slots).map(([k, v]) => [k, `${v.slots} ${v.mode}`])))} · ${rp.stats.lines} lines, longest ${rp.stats.longest} · properties ${props}`);
}
// (what a sample cannot help: the large map's frame-less elements are none of these)
for (const w of [...new Set(warnings)]) console.log(`W ${w}`);
return warnings;
}

make({ name: 'geoui_rhythm', title: 'GeoUI Rhythm', description: 'GeoUI timeline sample: an osu!-style HUD (bds-lab)', atlas: [128, 256], shots: [1.0, 2.0, 3.0, 4.0, 5.0, 6.5, 8.0, 9.5, 11.0, 12.5], seek: 6 });
make({ name: 'geoui_rhythm_big', big: 300, title: 'GeoUI Rhythm 300', description: 'GeoUI timeline sample: a map of real size, 300 objects (bds-lab)', atlas: [1024, 1024], shots: [2, 5, 10, 20, 30, 45, 60, 80, 100, 112], seek: 60 });
if (failed) process.exit(1);
