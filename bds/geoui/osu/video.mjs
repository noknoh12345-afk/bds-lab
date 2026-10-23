#!/usr/bin/env node
// A preview video of an osu! sample, drawn by render.mjs (not the game): the autoplay (osugame.js), its music and hitsounds.
//   node bds/geoui/osu/video.mjs <pixel|skin> <out.mp4> [--from s] [--to s] [--w 1280] [--h 720] [--fps 30]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../png.mjs';
import { renderVideo } from './render.mjs';
import { OSU_SAMPLES } from './addon.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const Mo = require('../timeline/model.js'); require('../timeline/contract.js'); require('../timeline/media.js');
const O = require('../timeline/osu.js'), OG = require('../timeline/osugame.js'), K = require('../timeline/osukit.js');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const [skin = 'pixel', file = `osu-${skin}.mp4`] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i && all[i - 1].startsWith('--')));
const V = OSU_SAMPLES.find((x) => x.skin === skin);
if (!V) { console.log('usage: node bds/geoui/osu/video.mjs <pixel|skin> <out.mp4>'); process.exit(1); }
const map = O.parseOsu(fs.readFileSync(path.join(HERE, 'assets', V.map), 'utf8')), images = {};
if (skin === 'skin') for (const f of fs.readdirSync(path.join(HERE, 'skin-legacy'))) if (f.endsWith('@2x.png')) images[f.replace('@2x.png', '')] = decodePng(fs.readFileSync(path.join(HERE, 'skin-legacy', f)));
const dir = skin === 'pixel' ? path.join(HERE, 'assets') : path.join(HERE, 'skin-legacy'), files = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ogg') && (skin !== 'pixel' || x.startsWith('chip-')))) files[f.replace(/^chip-/, '').slice(0, -4)] = path.join(dir, f);
const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
const sound = (n) => { const k = files[n] ? n : files[n.replace(/^(soft|drum)-/, 'normal-')] ? n.replace(/^(soft|drum)-/, 'normal-') : null; return k ? `geoui.${clean(k)}` : null; };
const built = K.build(map, { skin, images, music: 'music', sound });
const doc = Mo.normalize(built.doc), play = OG.autoplay(built.game, { fps: arg('--fps', 30) });
const byId = Object.fromEntries(Object.keys(files).map((k) => [`geoui.${clean(k)}`, files[k]]));
const t0 = Date.now();
const r = await renderVideo(file, { design: built.design, doc, play, from: arg('--from', 0), to: arg('--to', doc.sequences[0].duration), fps: arg('--fps', 30), w: arg('--w', 1280), h: arg('--h', 720),
  music: path.join(HERE, 'assets', V.music), sounds: byId, hits: play.sounds, onFrame: (k, n) => { if (k % 150 === 0) process.stdout.write(`  ${k}/${n}\n`); } });
console.log(`OK ${file}: ${r.frames} frames, ${r.seconds.toFixed(1)} s, ${((Date.now() - t0) / 1000).toFixed(0)} s to draw`);
