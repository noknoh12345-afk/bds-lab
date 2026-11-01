#!/usr/bin/env node
// k talkers speaking at once in real time (20 ms chunks, as Discord sends): how late each frame comes out — on the main thread (0),
// each in a new worker thread (1), or on threads warmed beforehand (pool: bridge.mjs WorkerPool). The test songs as voices.
//   node tools/live/bench_talkers.mjs <k 1-5> <0|1|pool> [seconds 10] [ms the threads get before anyone talks, 0]
// → { first_2s_med_p95_max, after_med_p95_max }: ms after a frame was due (its 2400 samples in, plus the refinement's 2 frames)
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const U = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { Talker, WorkerPool, monoOf } = await import(U + '/tools/live/bridge.mjs');
const k = Number(process.argv[2] || 2), mode = process.argv[3], secs = Number(process.argv[4] || 10);
const pool = mode === 'pool' ? new WorkerPool({ voices: 16, refine: 2, spare: k }) : null;
if (pool) { await new Promise((r) => setTimeout(r, 4000)); pool.spare = 0; }
const worker = mode === 'pool' ? pool : mode === '1';
const files = ['speech_ja_soseki', 'speech_en_wordsworth', 'vocal_name_of_love', 'rock_big', 'choir_how_long'];
const pcms = files.slice(0, k).map((f) => spawnSync('ffmpeg', ['-v', 'error', '-i', `${U}/corpus/audio/${f}.mp3`, '-t', String(secs), '-f', 's16le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 1 << 30 }).stdout);
const late = [];
let t0 = 0;
const ts = pcms.map((_, i) => {
  let n = 0;
  // (frame n is due when its 2400 samples are in: (n + 1) * 50 ms after the start, plus the refinement's 2 frames)
  return new Talker({ id: 'vc_' + i, gamertag: 'P' + i, voices: 16, refine: 2, worker, quietMs: 0, send: (l) => { if (l.includes('"end"')) return; late.push([n, Date.now() - t0 - (n + 3) * 50]); n++; } });
});
// (the threads started a second before anyone talks: a talker's thread is made as they are first heard)
await new Promise((r) => setTimeout(r, Number(process.argv[5] || 0)));
const chunk = 3840, steps = Math.floor(pcms[0].length / chunk);
t0 = Date.now();
for (let i = 0; i < steps; i++) {
  for (let j = 0; j < k; j++) ts[j].push(monoOf(pcms[j].subarray(i * chunk, (i + 1) * chunk)));
  const wait = t0 + (i + 1) * 20 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
for (const t of ts) t.end();
await Promise.all(ts.map((t) => t.done));
const stat = (xs) => { xs = xs.slice().sort((a, b) => a - b); const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]; return [q(0.5), q(0.95), xs[xs.length - 1]]; };
const first = late.filter(([n]) => n < 40).map(([, v]) => v), rest = late.filter(([n]) => n >= 40).map(([, v]) => v);
console.log(JSON.stringify({ talkers: k, mode, warm_ms: Number(process.argv[5] || 0), first_2s_med_p95_max: stat(first), after_med_p95_max: stat(rest) }));
pool?.close(); process.exit(0);
