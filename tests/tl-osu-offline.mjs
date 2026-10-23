#!/usr/bin/env node
// osu! made whole with the GeoUI timeline, no network, no server: the lab's song and beatmaps (osusong.js), the gameplay config
// from a beatmap (osu.js gameOf: ticks, turns, spinner spins, the score multiplier, hitsounds), osu!'s rules (osugame.js: 300 /
// 100 / 50 windows, aim, notelock, sliders followed or dropped, spinners, score v1, accuracy, rank, health), both looks built
// (osukit.js: the game's limits, no two faces on one plane, every element a template or track moves is there), the behaviour
// pack's script playing it in a fake world (auto, aim with the cursor where the player looks, relax), and the design as
// Blockbench's outliner (bridge.designToOutliner, read back as GeoUI Builder reads a project). node tests/tl-osu-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = require('../bds/geoui/geoui_builder.js');
const M = require('../bds/geoui/timeline/model.js');
const K = require('../bds/geoui/timeline/contract.js');
const Me = require('../bds/geoui/timeline/media.js');
const O = require('../bds/geoui/timeline/osu.js'), OG = require('../bds/geoui/timeline/osugame.js'), KIT = require('../bds/geoui/timeline/osukit.js'), S = require('../bds/geoui/timeline/osusong.js');
const C = require('../bds/geoui/timeline/compile.js'), R = require('../bds/geoui/timeline/runtime.js'), Br = require('../bds/geoui/timeline/bridge.js');
const { lintGeo } = await import('../common/model.mjs');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };

// ---- the song and its maps ----
{
  const notes = S.score(), map = O.parseOsu(S.beatmap('synth')), chip = O.parseOsu(S.beatmap('chip'));
  const kinds = (m) => m.objects.reduce((a, o) => ((a[o.kind] = (a[o.kind] || 0) + 1), a), {});
  ok(notes.length === S.score().length && notes.every((x, i) => x.t === S.score()[i].t) && JSON.stringify(kinds(map)) === JSON.stringify({ circle: 96, slider: 33, spinner: 1 }),
    `the song is the same every time (${notes.length} notes); its beatmap: 96 circles, 33 sliders, a spinner`, JSON.stringify(kinds(map)));
  ok(JSON.stringify(map.objects.map((o) => [o.time, o.kind])) === JSON.stringify(chip.objects.map((o) => [o.time, o.kind])) && map.general.SampleSet === 'Normal' && chip.general.SampleSet === 'Soft',
    'both arrangements share one rhythm (the pixel look\'s map plays soft samples, the skin\'s normal ones)');
  const gaps = map.objects.slice(1).map((o, i) => o.time - map.objects[i].time);
  ok(Math.min(...gaps) >= 105 && map.breaks.length === 1 && map.breaks[0].end - map.breaks[0].start > 5000 && map.timing.filter((p) => p.kiai).length === 2,
    `nothing closer than a 1/4 beat (${Math.min(...gaps)} ms), one break (${map.breaks[0].end - map.breaks[0].start} ms), two kiai sections`);
  const pcm = S.render('chip'), peak = pcm.channels[0].reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  ok(pcm.rate === 22050 && Math.abs(pcm.channels[0].length / pcm.rate - (S.LEAD_IN + S.BARS * S.BAR + 2.5)) < 0.01 && peak > 0.5 && peak <= 0.9, `the chip arrangement: ${(pcm.channels[0].length / pcm.rate).toFixed(1)} s, its peak −1 dB at most (${peak.toFixed(3)})`);
  const chk = spawnSync(process.execPath, [path.join(TOP, 'bds/geoui/osu/music.mjs'), '--check'], { encoding: 'utf8' });
  ok(chk.status === 0, 'bds/geoui/osu/assets: the kept beatmaps are what osusong.js makes', chk.stderr + chk.stdout);
}

// ---- the gameplay config ----
const MAP = `osu file format v14

[General]
SampleSet: Soft

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:8
ApproachRate:9
SliderMultiplier:1.4
SliderTickRate:2

[TimingPoints]
0,500,4,2,0,60,1,0

[HitObjects]
256,192,1000,5,2,0:0:0:0:
100,100,1500,1,8,0:0:0:0:
300,100,2000,2,0,L|440:100,1,140,4|0
200,250,3500,2,0,L|200:150,2,100,0|8|4
120,320,5500,1,0,1:2:0:0:
256,192,6000,12,0,9000,0:0:0:0:
`;
const map = O.parseOsu(MAP), Gc = O.gameOf(map, { width: 512 });
{
  const s1 = Gc.objects[2], s2 = Gc.objects[3];
  // (velocity 1.4 × 100 px a beat of 500 ms: 140 px in 500 ms; ticks every 70 px = 250 ms; the end judged 36 ms early)
  ok(s1.d === 500 && JSON.stringify(s1.ticks) === JSON.stringify([250]) && JSON.stringify(s1.edges) === JSON.stringify([464]), 'a slider\'s ticks every 100 × SV × multiplier / tick rate, its end 36 ms before it (osu!\'s last tick)', JSON.stringify([s1.d, s1.ticks, s1.edges]));
  ok(s2.r === 2 && s2.d === Math.round((100 / 140) * 500 * 2) && JSON.stringify(s2.ticks) === JSON.stringify([250, 464]) && s2.edges.length === 2, 'there and back: a tick each way (mirrored), a turn and its end', JSON.stringify([s2.d, s2.ticks, s2.edges]));
  ok(JSON.stringify(Gc.objects[0].hs) === JSON.stringify(['soft-hitnormal', 'soft-hitwhistle']) && JSON.stringify(Gc.objects[1].hs) === JSON.stringify(['soft-hitnormal', 'soft-hitclap']) && JSON.stringify(Gc.objects[4].hs) === JSON.stringify(['normal-hitnormal']) && JSON.stringify(s1.es) === JSON.stringify([['soft-hitnormal', 'soft-hitfinish'], ['soft-hitnormal']]),
    'hitsounds: the timing point\'s set (soft), whistle / clap / finish, an object\'s own set (normal), each edge of a slider its own', JSON.stringify([Gc.objects[0].hs, Gc.objects[4].hs, s1.es]));
  ok(Gc.objects[5].need === Math.floor(O.diffRange(8, 1.5, 2.5, 3.75) * 3) && Gc.objects[5].need === 9 && Gc.windows.great === 32 && Gc.windows.ok === 120 && Gc.diffMul >= 0 && Gc.diffMul <= 5,
    `a spinner needs osu!lazer's minimum spins for its OD (OD 8, 3 s: ${Gc.objects[5].need}); windows 32 / 76 / 120; score multiplier ${Gc.diffMul}`);
}

// ---- osu!'s rules ----
const game = () => OG.createGame(Gc).start(0);
const at = (o) => [o.x, o.y];
{
  const g = game(), [x, y] = at(Gc.objects[0]);
  let r = g.step(1010, { cx: x, cy: y, hold: 0, presses: [1010] });
  ok(JSON.stringify(r.results) === JSON.stringify([['osu-circle/o1', 3]]) && g.state().score === 300 && g.state().combo === 1 && r.sounds.map((s) => s[0]).join() === 'soft-hitnormal,soft-hitwhistle', 'a press on time on the circle: great (300), the combo, its hitsounds', JSON.stringify([r, g.state()]));
  const [x2, y2] = at(Gc.objects[1]);
  r = g.step(1300, { cx: x2 + 40, cy: y2, presses: [1300] });
  ok(!r.results.length, 'a press with the cursor off the circle: nothing (aim)');
  r = g.step(1350, { cx: x2, cy: y2, presses: [1350] });
  ok(JSON.stringify(r.results) === JSON.stringify([['osu-circle/o2', 6]]), 'a press on it before its window (while it shows): it shakes — early (osu!\'s notelock), nothing judged');
  r = g.step(1560, { cx: x2, cy: y2, presses: [1560] });
  // (the second hit: 100 + 100 × (combo before it − 1 = 0) × multiplier / 25 — the bonus starts at the third)
  ok(JSON.stringify(r.results) === JSON.stringify([['osu-circle/o2', 4]]) && g.state().score === 300 + 100 && g.state().combo === 2, 'a press 60 ms late: good (100), its score v1 with the combo before it', JSON.stringify(g.state()));
}
{
  const g = game();
  g.step(1000, { presses: [] }); const r = g.step(1200, { presses: [] });
  ok(r.results.some(([k, c]) => k === 'osu-circle/o1' && c === 2) && g.state().misses === 1 && g.state().hp < 100 && r.events.some((e) => e[0] === 'miss'), 'no press: a miss when its window passes (the miss event, health down)', JSON.stringify(g.state()));
}
{
  // a slider followed all the way, then one let go of halfway
  const follow = (g, i, from, to, hold = (t) => true) => { for (let t = from; t <= to; t += 20) { const b = g.ballAt(i, t); g.step(t, { cx: b[0], cy: b[1], hold: hold(t) ? 1 : 0, presses: t === from ? [Gc.objects[i].t] : [] }); } };
  const g = game(); g.seek(1900);
  follow(g, 2, 2000, 2520);
  const st = g.state();
  ok(st.n300 === 1 && st.combo === 2 && st.score > 300, 'a slider: its head hit, its tick followed, its end held — 300 (head, tick and end all: the combo up by head and tick)', JSON.stringify(st));
  const g2 = game(); g2.seek(3400);
  const evs = [];
  for (let t = 3500; t <= 4280; t += 20) { const b = g2.ballAt(3, t); const r = g2.step(t, { cx: b[0], cy: b[1], hold: t < 3700 ? 1 : 0, presses: t === 3500 ? [3500] : [] }); evs.push(...r.events, ...r.results.map((x) => ['result', x[1]])); }
  ok(g2.state().n100 + g2.state().n50 === 1 && evs.some((e) => e[0] === 'break') && evs.filter((e) => e[0] === 'result').map((e) => e[1]).join() === `1,${g2.state().n100 ? 4 : 5}`, 'let go after its first tick: the combo broken at the next, judged by how much was followed (100 / 50); its head a bare hit (1) first', JSON.stringify(evs));
  const g3 = game(); g3.seek(3400);
  const res3 = [];
  for (let t = 3500; t <= 4300; t += 20) res3.push(...g3.step(t, { cx: 0, cy: 0, hold: 0, presses: [] }).results);
  ok(res3.map((x) => x[1]).join() === '7,2', 'a slider never touched: its head dropped (7: no judgement shown, the slider goes on), then a miss at its end', JSON.stringify(res3));
}
{
  // a spinner: the cursor circled (2 turns a second is not enough for 9 in 3 s; 4 turns a second clears it, then bonus spins)
  const spin = (rps) => { const g = game(); g.seek(5990); const ev = []; for (let t = 6000; t <= 9100; t += 20) { const a = ((t - 6000) / 1000) * rps * Math.PI * 2, r = g.step(t, { cx: Math.cos(a) * 60, cy: Math.sin(a) * 60, hold: 1 }); ev.push(...r.events, ...r.results.map((x) => ['result', x[1]])); } return { st: g.state(), ev }; };
  const slow = spin(2), fast = spin(5);
  ok(slow.ev.some((e) => e[0] === 'result' && e[1] === 2) && !slow.ev.some((e) => e[0] === 'clear'), 'a spinner spun too slowly (2 turns a second): a miss, no clear', JSON.stringify(slow.st));
  ok(fast.ev.some((e) => e[0] === 'clear') && fast.ev.filter((e) => e[0] === 'bonus').length >= 4 && fast.ev.some((e) => e[0] === 'result' && e[1] === 3) && fast.st.spin === 0, 'spun fast (5 a second): cleared, bonus spins (+1000 each), a 300', JSON.stringify(fast.ev.filter((e) => e[0] !== 'combo').slice(0, 12)));
}
{
  // accuracy and rank: osu!'s own thresholds, as the game works them out (its rankOf is what state().rank and the script's
  // <ns>:res say), the letters by contract.js RANKS
  const g = game(), rankOf = (n300, n100, n50, misses) => K.RANKS[g.rankOf(n300, n100, n50, misses)];
  ok(rankOf(10, 0, 0, 0) === 'SS' && rankOf(95, 5, 0, 0) === 'S' && rankOf(95, 4, 0, 1) === 'A' && rankOf(85, 15, 0, 0) === 'A' && rankOf(75, 25, 0, 0) === 'B' && rankOf(65, 35, 0, 0) === 'C' && rankOf(50, 50, 0, 0) === 'D'
    && rankOf(199, 0, 1, 0) === 'S' && rankOf(97, 0, 3, 0) === 'A' && rankOf(91, 0, 0, 9) === 'A' && rankOf(85, 14, 0, 1) === 'B' && g.rankOf(0, 0, 0, 0) === 0 && g.state().rank === 0,
  'ranks: SS, S (no miss, under 1 % 50s), A, B, C, D as osu!stable draws them — the game\'s own (none before anything is judged)');
}
{
  const ap = OG.autoplay(Gc, { fps: 20 }), fin = ap.states[ap.states.length - 1];
  ok(fin.acc === 100 && fin.rank === 6 && fin.misses === 0 && fin.maxcombo > 6 && ap.sounds.length > 6, `the autoplay: SS at the game's 20 ticks a second (score ${fin.score}, max combo ${fin.maxcombo}, ${ap.sounds.length} hitsounds)`, JSON.stringify(fin));
  const song = O.gameOf(O.parseOsu(S.beatmap('synth')), { width: 176 }), a60 = OG.autoplay(song, { fps: 60 }), a20 = OG.autoplay(song, { fps: 20 });
  ok(a60.states.at(-1).rank === 6 && a20.states.at(-1).score === a60.states.at(-1).score, `the lab's song autoplayed: SS, the same score at 20 and 60 steps a second (${a20.states.at(-1).score})`);
  const g = game(); g.seek(5000);
  ok(g.state().score === 0 && (() => { g.step(5520, { cx: Gc.objects[4].x, cy: Gc.objects[4].y, presses: [5520] }); return g.state().n300 === 1 && g.state().misses === 0; })(), 'a seek: what is before it left out (no misses for it), what comes after played');
}

// ---- the pixel look's coins on a map of one long combo in 8 colours: a frame for each number (three digits too) — and, when the
//      atlas cannot hold them, coins of a frame a colour without numbers, said, the document without the coins' frames ----
{
  let k = 0;
  const long = O.parseOsu(S.beatmap('chip').replace(/\[HitObjects\]([\s\S]*)$/, (m, body) => '[Colours]\n' + Array.from({ length: 8 }, (_, i) => `Combo${i + 1} : ${50 + i * 25},${200 - i * 20},${100 + i * 15}`).join('\n') + '\n\n[HitObjects]' + body.split('\n').map((l) => { const f = l.split(','); if (f.length < 5) return l; f[3] = String((Number(f[3]) & ~4) | (k++ === 0 ? 4 : 0)); return f.join(','); }).join('\n')));
  const big = KIT.build(long, { skin: 'pixel', music: 'music' }), heads = big.doc.sequences[0].instances.filter((x) => x.template === 'osu-circle' || x.template === 'osu-slider');
  const small = KIT.build(long, { skin: 'pixel', music: 'music', maxAtlas: 1024 }), sh = small.doc.sequences[0].instances.filter((x) => x.template === 'osu-circle');
  ok(Math.max(...heads.map((x) => x.params.n)) > 99 && big.atlas.at.hitcircle.frames === heads.length && big.atlas.width <= 2048 && big.atlas.height <= 2048 && !big.warnings.some((w) => /コンボの数字/.test(w))
    && small.warnings.some((w) => /コンボの数字をコインに描けませんでした/.test(w)) && small.atlas.at.hitcircle.frames === 8 && sh.every((x) => x.params.cf === undefined) && !small.doc.sequences[0].templates.some((t) => t.params.includes('cf')),
    `pixel: a combo of ${heads.length} in 8 colours — the coins a frame a number (three digits too, ${big.atlas.width}x${big.atlas.height}); in an atlas too small for them, a frame a colour without numbers, said`, JSON.stringify([big.atlas.at.hitcircle.frames, big.warnings, small.warnings, small.atlas.at.hitcircle.frames]));
}

// ---- both looks built: the game's limits, the geometry clean, every target there ----
const fakeSkin = () => { const out = {}; for (const nme of KIT.SKIN_IMAGES) { const w = /scorebar/.test(nme) ? 120 : /spinner-circle|approachcircle/.test(nme) ? 96 : 40, h = /scorebar/.test(nme) ? 10 : 40, im = KIT.img(w, h); for (let i = 3; i < im.data.length; i += 4) { im.data[i] = 255; im.data[i - 3] = 200; } out[nme] = im; } return out; };
const songMap = O.parseOsu(S.beatmap('chip'));
for (const skin of ['pixel', 'skin']) {
  const out = KIT.build(songMap, { skin, images: skin === 'skin' ? fakeSkin() : null, music: 'music', sound: (s) => `geoui.${s.replace(/[^a-z0-9]+/g, '_')}` });
  out.design.textures.atlas.png = 'iVBORw0KGgo='; delete out.design.textures.atlas.image;
  out.design.settings.calibration = G.MEASURED.id;
  const built = G.buildPack(out.design), rp = C.extendPack(built.files, out.doc, { design: out.design, core: G, extraSounds: out.sounds.map((x) => x.replace(/^geoui\./, '')) });
  const bp = R.extendBehavior(rp.files, out.doc, { stats: rp.stats, windows: out.info.difficulty.windows });
  const props = Object.keys(JSON.parse(bp.files['geoui_BP/entities/player.json'])['minecraft:entity'].description.properties).length, st = rp.stats;
  ok(props <= 32 && st.counts.bones <= 600 && st.counts.renderControllers <= 70 && st.counts.animations <= 1200 && st.longest <= 1000 && st.chars <= 610000 && (st.entityVariables || 0) <= 5000 && !rp.warnings.some((w) => /上限|確かめたのは|収められません/.test(w)),
    `${skin}: within what the real game was seen to take — properties ${props}/32, bones ${st.counts.bones}/600, render controllers ${st.counts.renderControllers}/70, animations ${st.counts.animations}, longest line ${st.longest}`, rp.warnings.join(' / '));
  const bones = new Set(out.design.bones.map((b) => b.name)), seq = out.doc.sequences[0], targets = [...seq.tracks, ...seq.templates.flatMap((t) => t.tracks)].filter((t) => t.kind !== 'audio' && t.target).map((t) => t.target);
  ok(targets.every((t) => bones.has(t)) && M.validate(out.doc).length === 0 && Object.values(out.design.elements).every((e) => !e.frames || (Array.isArray(e.frames.step) && e.frames.cols >= 1)), `${skin}: every element a track or template moves is in the design, the document validates, every flipbook has its step`, `${targets.filter((t) => !bones.has(t))} ${M.validate(out.doc).slice(0, 3)}`);
  const geoFile = Object.keys(rp.files).find((f) => f.endsWith('.geo.json')), g0 = JSON.parse(rp.files[geoFile])['minecraft:geometry'][0], lint = lintGeo({ bones: g0.bones, tw: g0.description.texture_width, th: g0.description.texture_height });
  ok(!lint.errs.length, `${skin}: the geometry passes the lab's model check (${lint.cubes} cubes: no two faces on one plane — a voxel's slot copies moved 0.02 across, the numerals 0.021 apart)`, lint.errs.slice(0, 3).join('\n  '));
  const sdj = JSON.parse(rp.files['geoui_RP/sounds/sound_definitions.json']).sound_definitions;
  ok(sdj['geoui.music'] && out.sounds.every((id) => sdj[id]) && /osu!'s rules/.test(bp.files['geoui_BP/scripts/timeline.js']) && bp.cfg.sequences[0].game && Object.keys(bp.cfg.sequences[0].keyMap).length > 100,
    `${skin}: the music and every hitsound defined, the script carries osu!'s rules and each instance's slot`, Object.keys(sdj).join(' '));
  if (skin === 'pixel') {
    // ---- the script in a fake world: auto, aim, relax ----
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-osu-')), f = path.join(tmp, 'timeline.mjs');
    fs.writeFileSync(f, bp.files['geoui_BP/scripts/timeline.js']);
    const chk = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    fs.rmSync(tmp, { recursive: true, force: true });
    ok(chk.status === 0, 'the script parses (node --check)', chk.stderr);
    // (a world of one player: the properties, the sounds sent and stopped, the player's kept values (dynamic properties), the
    //  scoreboard, the chat — a store shared by worlds to see what a player keeps across sessions)
    const keep = new Map();
    const world = ({ rot, held, store = keep } = {}) => {
      const w = { tick: 0, props: new Map(), sounds: [], stopped: [], board: new Map(), chat: [] }, A = { id: 'A' };
      w.E = R.createEngine(bp.cfg, { tick: () => w.tick, setProp: (p, k, v) => w.props.set(k, v), getProp: (p, k) => w.props.get(k), players: () => [A], sound: (p, id) => w.sounds.push([id, w.tick]), stopSound: (p, id) => w.stopped.push([id, w.tick]),
        rotation: () => (rot ? rot(w.tick * 50) : { x: 0, y: 0 }), held: () => (held ? held(w.tick * 50) : false), load: (p, k) => store.get(k), save: (p, k, v) => store.set(k, v),
        scoreboard: (p, id, name, score) => w.board.set(id, { name, score }), message: (p, text) => w.chat.push(text) }, OG.createGame);
      w.A = A; w.st = (g) => K.unpack(w.props.get(`geoui:${g}`) || 0, K.STATE_GROUPS[g]);
      w.until = (ms, pressAt) => { while (w.tick * 50 < ms) { w.tick++; if (pressAt && pressAt(w.tick * 50)) w.E.press(A); w.E.tick(); } return w; };
      return w;
    };
    const run = (mode, { rot, held, pressAt, mods, store } = {}) => {
      const w = world({ rot, held, store });
      w.E.command(w.A, 'mode', [mode]); if (mods) w.E.command(w.A, 'mods', [mods]); w.E.command(w.A, 'play', ['1']);
      w.until(seq.duration * 1000 - 3000, pressAt);
      const res = w.st('res');
      return { w, res, acc: w.props.get('geoui:v2'), score: w.props.get('geoui:v0'), ge: w.props.get('geoui:ge'), seq: w.props.get('geoui:seq') % 1024 };
    };
    const auto = run('auto', { store: new Map() }), ref = OG.autoplay(out.game, { fps: 20 }).states.at(-1);
    ok(auto.acc === 10000 && Math.round(auto.res.rank) === 6 && Math.round(auto.res.misses) === 0 && auto.score === ref.score && auto.w.sounds.length > 100 && auto.ge > 0,
      `mode auto: the script plays it by itself — SS, the autoplay's score (${auto.score}), its hitsounds (${auto.w.sounds.length}), the combo events counted`, JSON.stringify({ acc: auto.acc, res: auto.res, score: auto.score, ref: ref.score }));
    const fin = auto.w.st('mod');
    ok(fin.fc === 1 && fin.auto === 1 && fin.record === 0 && auto.w.sounds.some(([id]) => id === out.game.sounds.applause) && auto.w.chat.length === 1 && /SS 100\.00% ×\d+ FULL COMBO \(auto: not kept\)/.test(auto.w.chat[0]) && !auto.w.board.size,
      'its end: a full combo, the applause, a line in the chat — an autoplay\'s score not kept (no best, no scoreboard: osu! keeps none)', JSON.stringify({ fin, chat: auto.w.chat, board: [...auto.w.board] }));
    // ---- a fail: nothing pressed in aim, the health runs out — judged no more, the music stopped and the fail's sound, the
    //      FAILED shown 4.5 s, then the play stopped; a press a second after it plays it again from the start
    const none = run('aim', { store: new Map() }), failG = OG.createGame(out.game).start(0);
    for (let t = 0; t <= 60000 && !failG.state().failed; t += 50) failG.step(t, { presses: [] });
    const failedAt = failG.state().failedAt, geFail = bp.cfg.global.events.indexOf('fail');
    ok(failedAt > 0 && none.seq === 0 && Math.round(none.res.misses) === failG.state().misses && none.w.sounds.some(([id]) => id === out.game.sounds.fail) && none.w.stopped.some(([id]) => id === 'geoui.music') && geFail >= 0 && Math.floor((none.w.props.get(K.geName('geoui', geFail)) || 0) / 2 ** (6 * (geFail % 4))) % 64 === 1,
      `mode aim, nothing pressed: failed when the health ran out (${(failedAt / 1000).toFixed(2)} s, ${failG.state().misses} misses) — the music stopped, the fail's sound, the fail event counted, the play stopped after its fall`, JSON.stringify({ seq: none.seq, res: none.res, failedAt }));
    const mid = world({ store: new Map() });
    mid.E.command(mid.A, 'mode', ['aim']); mid.E.command(mid.A, 'play', ['1']);
    mid.until(failedAt + 500);
    const then = { failAt: mid.E.state(mid.A).failAt, failed: mid.st('mod').failed, hp: mid.props.get('geoui:v3') }, early = mid.E.press(mid.A);
    mid.until(failedAt + 1300); const gen0 = Math.floor(mid.props.get('geoui:seq') / 2048), again = mid.E.press(mid.A);
    ok(then.failAt > 0 && then.failed === 1 && then.hp === 0 && early === null && again && again.retry && Math.floor(mid.props.get('geoui:seq') / 2048) !== gen0 && mid.props.get('geoui:v0') === 0 && mid.st('mod').failed === 0 && mid.E.state(mid.A).failAt === -1,
      'failed: state.failed for the pack, the health empty; a press in its first second does nothing, one after it plays the same map again from the start (osu!\'s retry)', JSON.stringify({ then, early, again }));
    const nf = run('aim', { mods: 'NF', store: new Map() });
    ok(Math.round(nf.res.misses) === out.game.objects.length && nf.w.st('mod').nf === 1 && nf.w.st('mod').failed === 0 && Math.round(nf.res.rank) === 1 && /D 0\.00% ×0 \+NF/.test(nf.w.chat[0] || ''),
      `NF: the same nothing pressed never fails — every object missed (${Math.round(nf.res.misses)}), D, to the end and its results`, JSON.stringify({ res: nf.res, chat: nf.w.chat }));
    // (SD: the first miss fails; PF: the first hit that is not a 300 — here a press 70 ms late)
    const sd = world({ store: new Map() }); sd.E.command(sd.A, 'mode', ['aim']); sd.E.command(sd.A, 'mods', ['sd']); sd.E.command(sd.A, 'play', ['1']); sd.until(4000);
    const firstMiss = out.game.objects[0].t + out.game.windows.ok;
    ok(sd.E.state(sd.A).failAt > 0 && Math.abs(sd.E.state(sd.A).failAt - firstMiss) <= 100 && Math.round(sd.st('res').misses) === 1, `SD: failed on the first miss (${firstMiss} ms)`, JSON.stringify({ failAt: sd.E.state(sd.A).failAt }));
    const objs0 = out.game.objects, lookAt = (o) => ({ x: -o.y / 2.4, y: o.x / 2.4 });
    const pf = world({ rot: (t) => (t <= 100 ? { x: 0, y: 0 } : lookAt(objs0[0])), store: new Map() }); pf.E.command(pf.A, 'mode', ['aim']); pf.E.command(pf.A, 'mods', ['PF']); pf.E.command(pf.A, 'play', ['1']);
    pf.until(objs0[0].t + 70, (t) => t === Math.ceil((objs0[0].t + 70) / 50) * 50); pf.until(objs0[0].t + 400);
    ok(pf.E.state(pf.A).failAt > 0 && pf.st('cnt').n100 + pf.st('cnt').n50 === 1 && Math.round(pf.st('res').misses) === 0, 'PF: failed on the first hit that is not a 300', JSON.stringify(pf.st('cnt')));
    // (the mods: osu!'s letters, NF never with SD or PF, PF over SD, none; kept for the player with the mode, sensitivity and offset)
    const m0 = world({ store: new Map() }), say = (...a) => m0.E.command(m0.A, 'mods', a);
    ok(say('hdfl') === '' && m0.E.menuInfo(m0.A).mods.join() === 'HD,FL' && /NF cannot/.test(say('NF', 'SD')) && say('pf sd') === '' && m0.E.menuInfo(m0.A).mods.join() === 'PF' && /mods HD FL NF SD PF/.test(say('XX')) && say('none') === '' && !m0.E.menuInfo(m0.A).mods.length,
      'mods: HD FL as letters run together, NF never with SD or PF, PF over SD, an unknown one said, none', JSON.stringify(m0.E.menuInfo(m0.A)));
    const store = new Map(), p1 = world({ store });
    p1.E.command(p1.A, 'mode', ['relax']); p1.E.command(p1.A, 'sens', ['3.5']); p1.E.command(p1.A, 'offset', ['-40']); p1.E.command(p1.A, 'mods', ['HD']);
    const p2 = world({ store }), mi = p2.E.menuInfo(p2.A);
    ok(mi.mode === 'relax' && mi.sens === 3.5 && mi.offset === -40 && mi.mods.join() === 'HD' && mi.tour === true && mi.best === 0 && mi.title === seq.name,
      'the player\'s own settings kept in the world (a new session reads them back): mode, sensitivity, offset, mods — and what the menu shows', JSON.stringify(mi));
    // (aim: the player looks at each object — its place back through sens, 2.4 units a degree — and presses on its tick)
    // (looking straight ahead when the play starts — where the cursor's middle is taken from — then at the object due next,
    //  along a slider's ball while it slides)
    const objs = out.game.objects, balls = OG.createGame(out.game);
    const look = (t) => {
      if (t <= 100) return { x: 0, y: 0 };
      const i = objs.findIndex((o) => (o.k === 's' ? o.t + o.d : o.k === 'p' ? o.e : o.t) > t - 50), o = objs[i];
      if (!o || o.k === 'p') return { x: 0, y: 0 };
      const [x, y] = o.k === 's' && t >= o.t ? balls.ballAt(i, t) : [o.x, o.y];
      return { x: -y / 2.4, y: x / 2.4 };
    };
    const pressTick = (t) => objs.some((o) => o.k !== 'p' && o.t > t - 50 && o.t <= t);
    const aim = run('aim', { rot: look, pressAt: pressTick, held: (t) => objs.some((o) => o.k === 's' && t >= o.t && t <= o.t + o.d) });
    ok(aim.res.misses < 25 && aim.acc > 6000 && aim.score > 100000, `mode aim, looking at each object and pressing on its tick: played (accuracy ${(aim.acc / 100).toFixed(2)} %, misses ${Math.round(aim.res.misses)} — a press lands on the server's 50 ms tick)`, JSON.stringify(aim.res));
    const relax = run('relax', { pressAt: pressTick, held: (t) => objs.some((o) => (o.k === 's' && t >= o.t && t <= o.t + o.d) || (o.k === 'p' && t >= o.t && t <= o.e)) });
    ok(relax.res.misses < 25 && relax.score > aim.score * 0.5, `mode relax: pressing on time is enough — sliders held, the spinner spun while held (accuracy ${(relax.acc / 100).toFixed(2)} %)`, JSON.stringify(relax.res));
    // ---- the best: a play's score kept for the player (the scoreboard, NEW RECORD in the chat and for the pack) — a lower one later
    //      keeps the best and says it
    const bestKey = `geoui:best_${seq.id}`, bstore = new Map(), heldS = (t) => objs.some((o) => (o.k === 's' && t >= o.t && t <= o.t + o.d) || (o.k === 'p' && t >= o.t && t <= o.e));
    const b1 = run('relax', { pressAt: pressTick, held: heldS, store: bstore }), b2 = run('relax', { pressAt: (t) => pressTick(t) && t < 30000, held: heldS, store: bstore, mods: 'NF' });
    ok(b1.w.st('mod').record === 1 && bstore.get(bestKey) === b1.score && b1.w.board.get('geoui_best').score === b1.score && /NEW RECORD/.test(b1.w.chat[0]) && b2.w.st('mod').record === 0 && b2.score < b1.score && bstore.get(bestKey) === b1.score && b2.w.board.get('geoui_best').score === b1.score && new RegExp(`\\(best ${b1.score.toLocaleString('en-US')}\\)`).test(b2.w.chat[0]),
      `the best kept for the player (${b1.score}): NEW RECORD, the scoreboard; a lower play after it (NF, half its presses) keeps the best and says it`, JSON.stringify({ c1: b1.w.chat, c2: b2.w.chat, best: bstore.get(bestKey) }));
    // ---- the tour: every look in about 24 s at fixed times — play, seeks with modes and mods, a fail, the results, a stop — the
    //      player's own mode and mods back after it
    const tw = world({ store: new Map() });
    tw.E.command(tw.A, 'mode', ['relax']); tw.E.command(tw.A, 'mods', ['NF']);
    const sc = out.game.tour, seen = [];
    ok(Array.isArray(sc) && sc.length >= 8 && sc[0][1] === 'play' && sc.at(-1)[1] === 'stop' && sc.some((x) => x[1] === 'fail') && sc.some((x) => x[1] === 'results') && sc.some((x) => x[4] === 'HD') && sc.some((x) => x[4] === 'FL') && sc.at(-1)[0] <= 26000,
      `the tour: ${sc.length} scenes in ${(sc.at(-1)[0] / 1000).toFixed(1)} s (${sc.map((x) => x[1] + (x[4] ? `+${x[4]}` : '') + (x[3] && x[1] !== 'fail' ? `/${x[3]}` : '')).join(' ')})`);
    tw.E.command(tw.A, 'tour', []);
    for (let k = 0; tw.tick * 50 <= sc.at(-1)[0] + 200; k++) {
      tw.until((tw.tick + 1) * 50); const s = tw.E.state(tw.A), md = tw.st('mod');
      seen.push({ ms: tw.tick * 50, mode: s.mode, hd: md.hd, fl: md.fl, failed: md.failed, auto: md.auto, seq: s.seq, t: s.seq ? s.from + (tw.tick - s.start) * 50 : null, done: s.done });
    }
    const atMs = (ms) => seen.find((x) => x.ms >= ms) || {};
    const scene = (what) => sc.find((x) => x[1] === what || x[4] === what);
    const hdS = scene('HD'), flS = scene('FL'), failS = scene('fail'), resS = scene('results'), missS = sc.find((x) => x[2] === 'aim' || x[3] === 'aim');
    const end = tw.E.state(tw.A);
    ok(atMs(hdS[0] + 500).hd === 1 && atMs(hdS[0] + 500).fl === 0 && atMs(flS[0] + 500).fl === 1 && atMs(flS[0] + 500).hd === 0 && atMs(missS[0] + 500).auto === 0 && atMs(failS[0] + 300).failed === 1 && atMs(resS[0] + 500).failed === 0 && atMs(resS[0] + 500).done
      && Math.abs(atMs(hdS[0] + 500).t - (hdS[2] + 500)) <= 60 && seen.at(-1).seq === 0 && end.mode === 'relax' && end.mods.join() === 'NF' && !end.tour,
      'the tour as the script plays it: HD then FL on their scenes, aim (no autoplay) for the misses, the fail, the results of a whole play, then stopped — the player\'s own mode and mods back', JSON.stringify({ hd: atMs(hdS[0] + 500), fl: atMs(flS[0] + 500), fail: atMs(failS[0] + 300), res: atMs(resS[0] + 500), last: seen.at(-1), mode: end.mode, mods: end.mods }));
    ok(!tw.board.size && tw.chat.length === 1 && /auto: not kept/.test(tw.chat[0]) && tw.sounds.some(([id]) => id === out.game.sounds.fail) && tw.sounds.some(([id]) => id === out.game.sounds.applause),
      'the tour keeps no best (an autoplay\'s): its results say so; the fail\'s sound and the applause played', JSON.stringify(tw.chat));
    // ---- the stepped tour (`tour step`, then `tour next`): each scene plays its time, then holds on its last moment — paused,
    //      its mode and mods on — however long a slow camera takes before the next; at the last `next` stopped, the player's own
    //      mode and mods back
    const sw = world({ store: new Map() });
    sw.E.command(sw.A, 'mode', ['relax']); sw.E.command(sw.A, 'mods', ['NF']);
    const notYet = sw.E.command(sw.A, 'tour', ['next']);
    sw.E.command(sw.A, 'tour', ['step']);
    const held = [];
    for (let k = 0; k < sc.length - 1; k++) {
      const len = sc[k + 1][0] - sc[k][0];
      sw.until(sw.tick * 50 + len + 2500 + (k % 3) * 1700);
      const st = sw.E.state(sw.A), md = sw.st('mod');
      held.push({ k, what: sc[k][1], mods: sc[k][4] || '', paused: st.paused, seq: st.seq, hd: md.hd, fl: md.fl, auto: md.auto, failed: md.failed, done: st.done, from: st.from, at: sc[k][2], len, chat: sw.chat.length });
      sw.E.command(sw.A, 'tour', ['next']);
    }
    sw.until(sw.tick * 50 + 1000);
    const swEnd = sw.E.state(sw.A), sceneOk = (h) => (h.what === 'seek' && h.mods === 'HD' ? h.hd === 1 && h.fl === 0 : h.what === 'seek' && h.mods === 'FL' ? h.fl === 1 && h.hd === 0 : h.what === 'fail' ? h.failed === 1 : h.what === 'results' ? h.done && h.failed === 0 && h.chat === 1 : true)
      && (h.what !== 'seek' || sc[h.k][3] !== 'auto' || Math.abs(h.from - (h.at + h.len)) <= 60);
    ok(/tour step first/.test(notYet) && held.length === sc.length - 1 && held.every((h) => h.paused && h.seq > 0 && sceneOk(h)) && held.some((h) => h.auto === 0) && swEnd.seq === 0 && swEnd.mode === 'relax' && swEnd.mods.join() === 'NF' && !swEnd.tour,
      `the stepped tour: each of the ${held.length} scenes played and held on its last moment (paused, its mods and mode on) until the next, however late; stopped at the last — the player's own mode and mods back`, JSON.stringify({ notYet, held: held.filter((h) => !(h.paused && h.seq > 0 && sceneOk(h))), end: { seq: swEnd.seq, mode: swEnd.mode, mods: swEnd.mods } }));
  }
  // ---- the design as Blockbench's outliner, read back as GeoUI Builder reads a project ----
  const spec = Br.designToOutliner(out.design), byName = new Map(spec.groups.map((g) => [g.name, g]));
  const fromBB = (v) => [-v[0], v[1], v[2]];
  const back = spec.cubes.map((c) => { const size = [c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]], faces = {}; for (const [k, f] of Object.entries(c.faces)) { const o = { uv: [f.uv[0], f.uv[1]], uv_size: [f.uv[2] - f.uv[0], f.uv[3] - f.uv[1]] }; if (k === 'up' || k === 'down') { o.uv = [o.uv[0] + o.uv_size[0], o.uv[1] + o.uv_size[1]]; o.uv_size = [-o.uv_size[0], -o.uv_size[1]]; } faces[k] = o; } return { bone: c.parent, origin: [-(c.from[0] + size[0]), c.from[1], c.from[2]], size, faces }; });
  const orig = out.design.bones.flatMap((b) => (b.cubes || []).map((c) => ({ bone: b.name, origin: c.origin, size: c.size, faces: Object.fromEntries(Object.entries(c.faces).map(([k, f]) => [k, { uv: f.uv, uv_size: f.uv_size }])) })));
  const numbers = Object.entries(out.design.elements).filter(([, e]) => e.type === 'number');
  const near4 = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.002 : a && b && typeof a === 'object' ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => near4(a[k], b[k])) : a === b);
  // (every number: its digit groups under it, each numeral under its digit with its value)
  const digitsOk = numbers.every(([nm, e]) => spec.groups.filter((g) => g.parent === nm && g.geoui && g.geoui.role === 'digit').length === e.number.digits.length
    && e.number.digits.every((ds, k) => ds.every((b, v) => byName.get(b).parent === `${nm}_d${k}` && byName.get(b).geoui.value === v)));
  // (the pixel look's combo number is the coin's own — its frames, the looks' test below — the skin's its numerals)
  ok(near4(back, orig) && numbers.length >= (skin === 'pixel' ? 5 : 6) && digitsOk && byName.get('osu_root').geoui.visible,
    `${skin}: as Blockbench's outliner (the plugin's 「osu! を丸ごと作る」) and read back as GeoUI Builder reads it: the same ${back.length} cubes and faces, every number's numerals (${numbers.length} numbers) under its digit groups, every element's settings`);
  void fromBB;
}
// ---- the play's looks in the preview (model.evaluate with the script's states — the export is the same Molang, tl-anim): HD
//      takes the approach circles away and the circles before their time, FL's light follows the cursor and closes in with the
//      combo, the mods' row packs from the right, a fail drops the field under FAILED, the results (none after a fail; the
//      grade silver with HD or FL; the counts counted up; the score into its panel whatever the screen's width)
for (const skin of ['pixel', 'skin']) {
  const out = KIT.build(songMap, { skin, images: skin === 'skin' ? fakeSkin() : null, music: 'music' }), N = M.normalize(out.doc), sq = N.sequences[0];
  const ev = (t, state = {}, o = {}) => M.evaluate(N, sq.id, t, { state, ...o });
  const tp = sq.templates.find((x) => x.id === 'osu-circle'), c1 = sq.instances.find((x) => x.template === 'osu-circle'), lead = tp.lead;
  const ap = (st) => ev(c1.t - lead / 2, st)[`approachcircle#${c1.id}`], hc = (st, f) => ev(c1.t - lead * f, st)[`hitcircle#${c1.id}`], vis = (h) => (skin === 'pixel' ? h.scaleX : h.opacity);
  ok(Math.abs(ap({}).scaleX - 2.5) < 1e-6 && ap({ hd: 1 }).scaleX === 0 && Math.abs(vis(hc({}, 0.2)) - 1) < 1e-6 && Math.abs(vis(hc({ hd: 1 }, 0.2))) < 1e-6 && vis(hc({ hd: 1 }, 0.7)) >= 0.5 && vis(hc({ hd: 1 }, 0.45)) > 0 && vis(hc({ hd: 1 }, 0.45)) < 1,
    `${skin}: HD — no approach circle; a circle in by 40 % of its approach, fading after it, gone by 70 % (without HD: there to the end)`, JSON.stringify([ap({}), ap({ hd: 1 }), hc({}, 0.2), hc({ hd: 1 }, 0.2), hc({ hd: 1 }, 0.7), hc({ hd: 1 }, 0.45)]));
  if (skin === 'pixel') {
    // (the combo number a part of the coin: a frame for each number and colour the map's circles show — every circle and slider
    //  head shows the frame of its own pair (its cf), one pair one frame, and that frame's picture holds its number's digits,
    //  white, as the pixel font draws them, and no other number's)
    const a = out.atlas.at.hitcircle, im = out.atlas.image, heads = sq.instances.filter((x) => x.template === 'osu-circle' || x.template === 'osu-slider');
    const pairOf = (x) => `${x.params.n}/${x.params.c}`, frameOf = (x) => ev(x.t - lead * 0.3, {})[`hitcircle#${x.id}`].frame;
    const nw = Math.max(3, ...heads.map((x) => 4 * String(x.params.n).length - 1)), byPair = new Map(), byFrame = new Map();
    for (const x of heads) { byPair.set(pairOf(x), new Set([...(byPair.get(pairOf(x)) || []), frameOf(x)])); byFrame.set(frameOf(x), new Set([...(byFrame.get(frameOf(x)) || []), pairOf(x)])); }
    const holds = (f, n) => {
      const t = KIT.textImage(String(n), [255, 255, 255, 255]), x0 = a.x + (f % a.cols) * a.cell[0], y0 = a.y + Math.floor(f / a.cols) * a.cell[1], lx = Math.floor((nw - t.width) / 2);
      const white = (x, y) => { const p = ((y0 + y) * im.width + x0 + x) * 4; return im.data[p + 3] > 0 && im.data[p] > 240 && im.data[p + 1] > 240 && im.data[p + 2] > 240; };
      for (let ox = 0; ox + nw <= a.cell[0]; ox++) for (let oy = 0; oy + 5 <= a.cell[1]; oy++) {
        let all = true;
        for (let y = 0; y < 5 && all; y++) for (let x = 0; x < nw && all; x++) { const tx = x - lx, on = tx >= 0 && tx < t.width && t.data[(y * t.width + tx) * 4 + 3] > 0; if (on !== white(ox + x, oy + y)) all = false; }
        if (all) return true;
      }
      return false;
    };
    const wrong = heads.filter((x) => frameOf(x) !== x.params.cf || !holds(frameOf(x), x.params.n) || holds(frameOf(x), x.params.n === 1 ? 7 : x.params.n - 1));
    ok(a.frames === byPair.size && [...byPair.values()].every((v) => v.size === 1) && [...byFrame.values()].every((v) => v.size === 1) && heads.length > 100 && !wrong.length && !out.design.elements.combonumber,
      `pixel: the combo number is the coin's own (${byPair.size} numbers and colours the map shows, ${a.frames} frames): each of the ${heads.length} circles and slider heads shows its own pair's frame, its digits in that frame's picture — no numerals of their own`, JSON.stringify(wrong.slice(0, 3).map((x) => [x.id, x.params.n, x.params.c, x.params.cf, frameOf(x)])));
  }
  const fl = ev(20, { fl: 1, cx: 30, cy: -10, combo: 150 }), fl0 = ev(20, { fl: 0, cx: 30, cy: -10, combo: 150 }), fl2 = ev(20, { fl: 1, cx: 30, cy: -10, combo: 230 });
  const hole = out.design.bones.find((b) => b.name === 'flhole').cubes[0].size[0] / 2, pv = (nm) => out.design.bones.find((b) => b.name === nm).pivot, C0 = pv('flhole');
  // (the left shutter from the frame's left edge to the square's left edge, the right one likewise — 0.4 over it each)
  ok(fl.flhole.x === 30 && fl.flhole.y === -10 && Math.abs(fl.flhole.scaleX - 0.85) < 1e-9 && Math.abs(fl2.flhole.scaleX - 0.7) < 1e-9 && fl0.flhole.scaleX === 0 && fl0.flleft.scaleX === 0 && fl0.fltop.scaleY === 0
    && Math.abs(pv('flleft')[0] + fl.flleft.scaleX - (C0[0] + 30 - hole * 0.85 + 0.4)) < 1e-6 && Math.abs(pv('flright')[0] - fl.flright.scaleX - (C0[0] + 30 + hole * 0.85 - 0.4)) < 1e-6
    && Math.abs(pv('fltop')[1] - fl.fltop.scaleY - (C0[1] - 10 + hole * 0.85 - 0.4)) < 1e-6 && Math.abs(pv('flbottom')[1] + fl.flbottom.scaleY - (C0[1] - 10 - hole * 0.85 + 0.4)) < 1e-6 && fl.fltop.x === 30,
    `${skin}: FL — the light on the cursor, smaller at 100 and 200 combo (0.85, 0.7); the four shutters reach its square from the field's frame (0.4 over it); none without FL`, JSON.stringify([fl.flhole, fl.flleft, fl.flright, fl.fltop, fl2.flhole]));
  const m1 = ev(20, { hd: 1 }), m2 = ev(20, { hd: 1, auto: 1 }), m3 = ev(20, { hd: 1, fl: 1, auto: 1 });
  ok(m1.modHD.scaleX === 1 && m1.modFL.scaleX === 0 && m1.modHD.x === 0 && m2.modHD.x < -5 && m3.modHD.x < m2.modHD.x && m3.modFL.x === m2.modHD.x && m2.modAUTO.scaleX === 1,
    `${skin}: the mods on, a row from the right: HD alone at the edge, moved left by AUTO and by FL when they are on`, JSON.stringify([m1.modHD, m2.modHD, m3.modHD, m3.modFL]));
  const fe = [{ instance: null, name: 'fail', t: 30 }], f1 = ev(31.6, { failed: 1 }, { events: fe }), f0 = ev(29, {}, { events: fe });
  ok(f1.osu_fall.y <= -200 && f1.osu_fall.rotation > 20 && f1.failshade.scaleY === 1 && f1.failtext.visible !== false && f1.failretry.visible !== false && !(f0.failtext && f0.failtext.visible) && f0.osu_fall.y === 0,
    `${skin}: a fail — the field drops away, the curtain, FAILED and the retry's hint; nothing of it before the fail`, JSON.stringify([f1.osu_fall, f1.failshade, f0.osu_fall]));
  const lastEnd = Math.max(...out.game.objects.map((o) => (o.k === 's' ? o.t + o.d : o.k === 'p' ? o.e : o.t))) / 1000, R0 = Math.round((lastEnd + 0.8) * 1e4) / 1e4;
  const grade = (st) => ev(R0 + 3, st).resrank.frame, r3 = ev(R0 + 3, { rank: 6, fc: 1, record: 1, n300: 130, n100: 2, misses: 1, maxcombo: 193 }), r05 = ev(R0 + 0.7, { n300: 130 });
  ok(grade({ rank: 6 }) === 0 && grade({ rank: 6, hd: 1 }) === 6 && grade({ rank: 5, fl: 1 }) === 7 && grade({ rank: 4, hd: 1 }) === 2 && grade({ rank: 1 }) === 5,
    `${skin}: the grade — SS S A B C D, SS and S silver with HD or FL`);
  ok(r3.res.scaleX === 1 && ev(R0 + 3, { failed: 1 }).res.scaleX === 0 && r3.res300.value === 130 && r3.res100.value === 2 && r3.resmiss.value === 1 && r3.resmaxcombo.value === 193 && r05.res300.value > 0 && r05.res300.value < 130
    && r3.resfc.scaleX === 1 && ev(R0 + 3, { fc: 0 }).resfc.scaleX === 0 && Math.abs(r3.resrecord.scaleX - 1) < 0.07 && ev(R0 + 3, { record: 0 }).resrecord.scaleX === 0 && !(ev(R0 - 0.1, {}).respanel || {}).visible && !(r3.combo || {}).visible && !(r3.health || {}).visible,
    `${skin}: the results — the counts counted up, the max combo, the full combo's stamp and a new best by their flags, none after a fail; the HUD's combo and health gone`, JSON.stringify([r3.res300, r05.res300, r3.resrecord]));
  const sx = (dx) => ev(R0 + 2, {}, { screen: { dx } }).score.x;
  ok(Math.abs(sx(0) - sx(33) - 33) < 1e-6 && Math.abs(sx(-38) - sx(0) - 38) < 1e-6 && ev(R0 + 2, { failed: 1 }).score.x === 0,
    `${skin}: the score flies into its panel whatever the screen's width (anchored right, the panel in the middle: screen.dx taken away); not after a fail`);
}
{
  // (fastForward — the tour's jumps and its results: the whole play at once — is the autoplay: the same as stepping it every 50 ms)
  const song = O.gameOf(O.parseOsu(S.beatmap('chip')), { width: 176 }), a20 = OG.autoplay(song, { fps: 20 });
  const same = [5000, 22000, 36000, 52000, 69500].every((ms) => { const a = OG.createGame(song).start(0).fastForward(ms).state(), b = a20.at(ms / 1000); return a.score === b.score && a.combo === b.combo && a.n300 === b.n300 && a.misses === b.misses; });
  const mods = OG.createGame(song, { mods: ['HD', 'FL'] }).start(0).fastForward(70000).state().score, plain = a20.states.at(-1).score;
  ok(same && mods > plain * 1.15 && mods < plain * 1.2, `fastForward = the autoplay at 20 steps a second (score, combo, counts at 5 times); HD + FL score ×1.06 × 1.12 on the combo's part (${mods} / ${plain})`);
}
void Me;
console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-osu-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
