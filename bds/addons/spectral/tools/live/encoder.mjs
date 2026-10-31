#!/usr/bin/env node
// The live encoder on a file (web/live.js, the same code the Discord bridge and a microphone run): any audio ffmpeg reads →
// Spectral Player live frames, as a voice chat would send them.
//   node tools/live/encoder.mjs <audio> --song <out.song.json> [--voices 16] [--id <id>] [--title <t>]
//        a song (format 2) made of the live frames: /spectral:play it, score it in tools/exp, send it with the rig (audio song pack=)
//   node tools/live/encoder.mjs <audio> --live <stream id> [--at follow:<player>|phones:<player>|speaker:x,y,z] [--realtime] [--frames 2]
//        the server console's lines (scriptevent spectral:live …) on stdout, paced as the sound plays with --realtime: pipe them into
//        a server console, or see tools/live/bridge.mjs for a voice channel
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = createRequire(import.meta.url)(path.join(here, '..', '..', 'web', 'live.js'));
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; }, flag = (k) => argv.includes(k);
const file = argv[0];
if (!file || (!opt('--song') && !opt('--live'))) { console.error('usage: node tools/live/encoder.mjs <audio> --song <out.song.json> | --live <stream id> [--at …] [--realtime]'); process.exit(2); }

/** any audio → 48 kHz mono float samples (ffmpeg) */
export function load(f) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-ar', String(L.SR), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${String(r.stderr).trim().slice(-300)}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
}
const x = load(file), voices = Number(opt('--voices', 16));
const enc = new L.LiveEncoder({ voices, win: Number(opt('--win', 2048)), nzWin: Number(opt('--nzwin', 0)) });
if (opt('--song')) {
  enc.collect = true;
  enc.push(x); enc.push(new Float32Array(L.WIN));          // (the tail: the last sound's frames)
  const id = opt('--id', path.basename(file).replace(/\.[^.]+$/, '').replace(/[^\w]/g, '_').slice(0, 32));
  const s = L.toSong(enc, { id, title: opt('--title', id), seconds: Math.round((x.length / L.SR) * 100) / 100 });
  fs.writeFileSync(opt('--song'), JSON.stringify(s));
  console.log(JSON.stringify({ id, frames: s.meta.frames, voices, bytes: Math.round((s.data.length * 3) / 4), kbps: +(((s.data.length * 3) / 4) * 8 / (x.length / L.SR) / 1000).toFixed(1) }));
} else {
  const id = opt('--live'), at = opt('--at'), per = Math.max(1, Number(opt('--frames', 2))), rt = flag('--realtime');
  const frames = [...enc.push(x), ...enc.push(new Float32Array(L.WIN))];
  const t0 = Date.now();
  for (let k = 0; k < frames.length; k += per) {
    const msg = L.message(id, k, frames.slice(k, k + per), k === 0 ? { meta: enc.meta(), at } : {});
    if (rt) { const due = t0 + ((k + per) * 1000) / L.FPS, wait = due - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); }
    process.stdout.write(`scriptevent spectral:live ${msg}\n`);
  }
  process.stdout.write(`scriptevent spectral:live ${JSON.stringify({ id, end: true })}\n`);
}
