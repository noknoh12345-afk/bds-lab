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
    const run = (mode, { rot, held, pressAt } = {}) => {
      const w = { tick: 0, props: new Map(), sounds: [] }, A = { id: 'A' };
      const E = R.createEngine(bp.cfg, { tick: () => w.tick, setProp: (p, k, v) => w.props.set(k, v), getProp: (p, k) => w.props.get(k), players: () => [A], sound: (p, id) => w.sounds.push(id), stopSound: () => {}, rotation: () => (rot ? rot(w.tick * 50) : { x: 0, y: 0 }), held: () => (held ? held(w.tick * 50) : false) }, OG.createGame);
      E.command(A, 'mode', [mode]); E.command(A, 'play', ['1']);
      const end = seq.duration * 1000 - 3000;
      while (w.tick * 50 < end) { w.tick++; if (pressAt && pressAt(w.tick * 50)) E.press(A); E.tick(); }
      const res = K.unpack(w.props.get('geoui:res') || 0, K.STATE_GROUPS.res);
      return { w, res, acc: w.props.get('geoui:v2'), score: w.props.get('geoui:v0'), ge: w.props.get('geoui:ge') };
    };
    const auto = run('auto'), ref = OG.autoplay(out.game, { fps: 20 }).states.at(-1);
    ok(auto.acc === 10000 && Math.round(auto.res.rank) === 6 && Math.round(auto.res.misses) === 0 && auto.score === ref.score && auto.w.sounds.length > 100 && auto.ge > 0,
      `mode auto: the script plays it by itself — SS, the autoplay's score (${auto.score}), its hitsounds (${auto.w.sounds.length}), the combo events counted`, JSON.stringify({ acc: auto.acc, res: auto.res, score: auto.score, ref: ref.score }));
    const none = run('aim');
    ok(none.res.misses > 100 && none.score < 20000 && none.w.props.get('geoui:v3') < 100, `mode aim, nothing pressed: missed (${Math.round(none.res.misses)}), health down`, JSON.stringify(none.res));
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
  }
  // ---- the design as Blockbench's outliner, read back as GeoUI Builder reads a project ----
  const spec = Br.designToOutliner(out.design), byName = new Map(spec.groups.map((g) => [g.name, g]));
  const fromBB = (v) => [-v[0], v[1], v[2]];
  const back = spec.cubes.map((c) => { const size = [c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]], faces = {}; for (const [k, f] of Object.entries(c.faces)) { const o = { uv: [f.uv[0], f.uv[1]], uv_size: [f.uv[2] - f.uv[0], f.uv[3] - f.uv[1]] }; if (k === 'up' || k === 'down') { o.uv = [o.uv[0] + o.uv_size[0], o.uv[1] + o.uv_size[1]]; o.uv_size = [-o.uv_size[0], -o.uv_size[1]]; } faces[k] = o; } return { bone: c.parent, origin: [-(c.from[0] + size[0]), c.from[1], c.from[2]], size, faces }; });
  const orig = out.design.bones.flatMap((b) => (b.cubes || []).map((c) => ({ bone: b.name, origin: c.origin, size: c.size, faces: Object.fromEntries(Object.entries(c.faces).map(([k, f]) => [k, { uv: f.uv, uv_size: f.uv_size }])) })));
  const numeral = Object.values(out.design.elements).find((e) => e.type === 'number');
  const near4 = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.002 : a && b && typeof a === 'object' ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => near4(a[k], b[k])) : a === b);
  ok(near4(back, orig) && spec.groups.filter((g) => g.geoui && g.geoui.role === 'digit').length === numeral.number.digits.length && byName.get(numeral.number.digits[0][3]).geoui.value === 3 && byName.get('osu_root').geoui.visible,
    `${skin}: as Blockbench's outliner (the plugin's 「osu! を丸ごと作る」) and read back as GeoUI Builder reads it: the same ${back.length} cubes and faces, the numerals under digit groups, every element's settings`);
  void fromBB;
}
void Me;
console.log(`\n${fails ? 'FAIL' : 'PASS'} tl-osu-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
