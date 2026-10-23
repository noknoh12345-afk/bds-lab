#!/usr/bin/env node
// A preview video of an osu! sample, drawn by render.mjs (not the game): the autoplay (osugame.js), its music and hitsounds —
// or, with --tour, the tour (`/scriptevent geoui:tour`: every look in about 24 s) as the pack's own script plays it: the
// behaviour pack's engine and rules (runtime.js, osugame.js) run in a stand-in world, their properties read back as the client
// reads them (contract.js), the music and the hitsounds where the script started them.
//   node bds/geoui/osu/video.mjs <pixel|skin> <out.mp4> [--tour] [--from s] [--to s] [--w 1280] [--h 720] [--fps 30]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../png.mjs';
import { renderVideo } from './render.mjs';
import { OSU_SAMPLES } from './addon.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GC = require('../geoui_builder.js');
const Mo = require('../timeline/model.js'), Ko = require('../timeline/contract.js'); require('../timeline/media.js');
const O = require('../timeline/osu.js'), OG = require('../timeline/osugame.js'), K = require('../timeline/osukit.js'), C = require('../timeline/compile.js'), R = require('../timeline/runtime.js');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const [skin = 'pixel', file = `osu-${skin}.mp4`] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i && all[i - 1].startsWith('--') && all[i - 1] !== '--tour'));
const V = OSU_SAMPLES.find((x) => x.skin === skin);
if (!V) { console.log('usage: node bds/geoui/osu/video.mjs <pixel|skin> <out.mp4> [--tour]'); process.exit(1); }
const map = O.parseOsu(fs.readFileSync(path.join(HERE, 'assets', V.map), 'utf8')), images = {};
if (skin === 'skin') for (const f of fs.readdirSync(path.join(HERE, 'skin-legacy'))) if (f.endsWith('@2x.png')) images[f.replace('@2x.png', '')] = decodePng(fs.readFileSync(path.join(HERE, 'skin-legacy', f)));
const dir = skin === 'pixel' ? path.join(HERE, 'assets') : path.join(HERE, 'skin-legacy'), files = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ogg') && (skin !== 'pixel' || x.startsWith('chip-')))) files[f.replace(/^chip-/, '').slice(0, -4)] = path.join(dir, f);
const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
const sound = (n) => { const k = files[n] ? n : files[n.replace(/^(soft|drum)-/, 'normal-')] ? n.replace(/^(soft|drum)-/, 'normal-') : null; return k ? `geoui.${clean(k)}` : null; };
const built = K.build(map, { skin, images, music: 'music', sound, settings: { calibration: GC.MEASURED.id } });
const doc = Mo.normalize(built.doc);
const byId = Object.fromEntries(Object.keys(files).map((k) => [`geoui.${clean(k)}`, files[k]]));
const music = path.join(HERE, 'assets', V.music);
const t0 = Date.now(), progress = (k, n) => { if (k % 150 === 0) process.stdout.write(`  ${k}/${n}\n`); };
let r;
if (process.argv.includes('--tour')) {
  const tour = tourPlay();
  r = await renderVideo(file, { design: built.design, doc, at: tour.at, from: 0, to: tour.length, fps: arg('--fps', 30), w: arg('--w', 1280), h: arg('--h', 720),
    music, musicSpans: tour.musicSpans, sounds: byId, hits: tour.hits, onFrame: progress });
} else {
  const play = OG.autoplay(built.game, { fps: arg('--fps', 30) });
  r = await renderVideo(file, { design: built.design, doc, play, from: arg('--from', 0), to: arg('--to', doc.sequences[0].duration), fps: arg('--fps', 30), w: arg('--w', 1280), h: arg('--h', 720),
    music, sounds: byId, hits: play.sounds, onFrame: progress });
}
console.log(`OK ${file}: ${r.frames} frames, ${r.seconds.toFixed(1)} s, ${((Date.now() - t0) / 1000).toFixed(0)} s to draw`);

/** the tour as the pack's script plays it, a tick (50 ms) at a time: → { at(s) → { t, events, state }, musicSpans, hits, length } */
function tourPlay() {
  // (the pack's config: GeoUI Builder's export, the timeline's RP and BP, as addon.mjs makes them — the atlas left out)
  const design = { ...built.design, textures: { atlas: { ...built.design.textures.atlas, png: 'iVBORw0KGgo=' } } };
  delete design.textures.atlas.image;
  const pack = GC.buildPack(design), rp = C.extendPack(pack.files, built.doc, { design, core: GC });
  const cfg = R.extendBehavior(rp.files, built.doc, { stats: rp.stats, windows: built.info.difficulty.windows, field: [96, 72] }).cfg;
  const NAMES = Ko.RESULTS, w = { tick: 0, props: new Map() }, A = { id: 'A' }, hits = [], musicSpans = [];
  let events = [], quiet = 0, musicOn = null;
  // (what the client sees of the game: the results to the instances' slots, the play's events to its counters — each kept
  //  with its time; a seek or a play starts the client's count again, so they start again with it)
  const createGame = (G, o) => {
    const g = OG.createGame(G, o), step = g.step, fail = g.fail, ff = g.fastForward;
    g.step = (ms, inp) => { const res = step(ms, inp); if (!quiet) { for (const [key, code] of res.results) events.push({ instance: String(key).split('/').pop(), name: NAMES[code], t: ms / 1000 }); for (const [name, t] of res.events) events.push({ instance: null, name, t: t / 1000 }); } return res; };
    g.fail = (ms) => { const res = fail(ms); for (const [name, t] of res.events) events.push({ instance: null, name, t: t / 1000 }); return res; };
    g.fastForward = (ms) => { quiet++; try { return ff(ms); } finally { quiet--; } };
    return g;
  };
  const E = R.createEngine(cfg, { tick: () => w.tick, setProp: (p, k, v) => { if (k === 'geoui:seq' && v !== w.props.get(k)) events = []; w.props.set(k, v); }, getProp: (p, k) => w.props.get(k), players: () => [A],
    sound: (p, id) => { if (id === 'geoui.music') { const s = E.state(A); musicOn = [w.tick * 0.05, (s.from + (w.tick - s.start) * 50) / 1000]; } else hits.push([id, w.tick * 0.05]); },
    stopSound: (p, id) => { if (id === 'geoui.music' && musicOn) { musicSpans.push([musicOn[0], w.tick * 0.05, musicOn[1]]); musicOn = null; } },
    rotation: () => ({ x: 0, y: 0 }), held: () => false, load: () => undefined, save: () => {}, message: () => {} }, createGame);
  const frames = [], st = (name) => Ko.unpack(w.props.get(`geoui:${name}`) || 0, Ko.STATE_GROUPS[name]);
  E.command(A, 'tour', []);
  const length = (built.tour.length + 1500) / 1000;
  while (w.tick * 50 <= length * 1000) {
    w.tick++; E.tick();
    const s = E.state(A);
    const q = cfg.sequences.find((x) => x.index === s.seq), t = q ? Math.min((s.paused ? s.from : s.from + (w.tick - s.start) * 50), q.duration - 1) / 1000 : null;
    const state = Object.assign({}, ...Object.keys(Ko.STATE_GROUPS).map(st), { score: w.props.get('geoui:v0') || 0, combo: w.props.get('geoui:v1') || 0, acc: (w.props.get('geoui:v2') || 0) / 100, hp: w.props.get('geoui:v3') ?? 100 });
    frames.push({ t, start: s.start, paused: s.paused, events: events.slice(), state });
  }
  if (musicOn) musicSpans.push([musicOn[0], length, musicOn[1]]);
  // (between two ticks the sequence's time goes on as the client's clock does)
  const at = (sec) => { const k = Math.max(0, Math.min(frames.length - 1, Math.floor(sec * 20) - 1)), f = frames[k]; return { t: f.t === null ? null : f.t + (f.paused ? 0 : Math.max(0, sec - (k + 1) * 0.05)), events: f.events, state: f.state }; };
  return { at, musicSpans, hits, length };
}
