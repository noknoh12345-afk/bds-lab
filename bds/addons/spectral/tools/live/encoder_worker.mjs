// A talker's live encoder in a worker thread (tools/live/bridge.mjs: each talker's analysis and refinement on a core of its own —
// the refinement takes about a third of a core for one voice, and several people talking at once would fall behind on one thread).
// Messages in order, each answered in order: { push: Float32Array } → its frames; { quiet: true } → two frames of silence and what
// the refinement held (the end of a sentence); { end: true } → what it held, then { end: true }.
// workerData { voices, refine, warm }: with warm, the thread first encodes 2 s of a made-up voice with an encoder of its own, so
// that its code is compiled before anyone talks (a new thread's first second of frames came 0.4-0.5 s late: measured, 2-core cloud
// machine) — bridge.mjs keeps such a thread ready for the next talker (WorkerPool).
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = createRequire(import.meta.url)(path.join(here, '..', '..', 'web', 'live.js'));
const { warm, ...opts } = workerData ?? {};
if (warm) {
  // (a voice: 120 Hz with a slow vibrato, its harmonics falling off, syllables 4 a second, a little noise — any sound would do)
  const n = 2 * L.SR, x = new Float32Array(n);
  let seed = 1, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / L.SR, f0 = 120 + 15 * Math.sin(2 * Math.PI * 5 * t);
    ph += (2 * Math.PI * f0) / L.SR;
    let s = 0; for (let h = 1; h <= 20; h++) s += Math.sin(h * ph) / h;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    x[i] = 0.1 * s * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t)) + 0.01 * (seed / 4294967296 - 0.5);
  }
  const w = new L.LiveEncoder(opts);
  w.push(x); w.flush();
}
let enc;
parentPort.on('message', (m) => {
  // (the first message may carry the talker's voice count: a ready thread was warmed for any — bridge.mjs --voices auto)
  enc ??= new L.LiveEncoder({ ...opts, ...(m.voices ? { voices: m.voices } : {}) });
  let frames = [];
  if (m.push) frames = enc.push(m.push);
  else if (m.quiet) frames = [...enc.push(new Float32Array(2 * L.HOP)), ...enc.flush()];
  else if (m.end) frames = enc.flush();
  parentPort.postMessage({ frames, ...(m.end ? { end: true } : {}) });
});
