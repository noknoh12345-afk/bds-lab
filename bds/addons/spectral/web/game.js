// Spectral Player as the game plays it, in a worker of the converter page. Two parts, both the ones bds-lab measured against
// recordings of a real client:
//  1. the add-on itself — bp/scripts/main.js, bundled with the recording mock of @minecraft/server (web/build_engine.mjs:
//     self.SpectralMock) — plays the song tick by tick and every SoundInstance call it makes is logged, exactly as a BDS
//     would send them (tools/sim/run_song.mjs does the same in Node);
//  2. the client model turns that log into sound: tools/emu/client.py with tools/emu/spec.json, and the client path of
//     tools/exp/exp.py path24 — the RP's own sound files read linearly at the rate the game mixes at, fades linear in
//     amplitude (0.8 ms at least), one tick's commands landing together and ticks apart by sd 7.3 ms, at most 32 sounds
//     heard (the quietest go), the mix clipped at 2.0 file units, then -32.5 dB into 16 bits and x2 linear to 48 kHz.
// message in: { song: {meta, data} | null, songId, client: 'phone' | 'pc', rp: {name: {pcm: Float32Array, sr}} }
// messages out: { progress: 0..1, stage } … { done: true, pcm: Float32Array (48 kHz mono), info } or { error }
'use strict';
const TICK = 0.05, OUT_SR = 48000;
const CLIENTS = {
  // measured: redroid's Android 14, Minecraft 1.26.60.4 (SPEC.md, tools/emu/spec.json)
  phone: { mobile: true, sr: 24000, maxVoices: 32, block: 512, jitterMs: 7.3, fadeMinMs: 0.8, clip: 2.0, gainDb: -32.5, bits: 16, oneshotMs: -45 },
  // NOT measured: a desktop client taken as the same engine mixing at 48 kHz in floating point, with no limit on sounds
  pc: { mobile: false, sr: 48000, maxVoices: 0, block: 1024, jitterMs: 7.3, fadeMinMs: 0.8, clip: 2.0, gainDb: -32.5, bits: 0, oneshotMs: -45 },
};

// ------------------------------------------------------------------ 1. the add-on, tick by tick, in the mock
async function runAddon(song, songId, client, progress) {
  const mc = self.SpectralMock;
  mc._startup();
  const A = new mc.Player('A');
  if (client.mobile) A.clientSystemInfo = { platformType: 'Mobile' };      // the add-on's own phone defaults apply
  mc._setPlayers([A]);
  mc.world.afterEvents.worldLoad._fire({});
  if (song) mc.system.sendScriptEvent('spectral:song', JSON.stringify({ id: songId, i: 0, n: 1, meta: song.meta, data: song.data }));
  const run = (name, ...a) => mc.commands[name]({ sourceEntity: A, initiator: A }, ...a);
  for (let i = 0; i < 2; i++) await mc._step();
  mc.log.length = 0;
  run('spectral:play', songId, 'phones');
  const frames = song ? song.meta.frames : 460, max = frames + 600;
  let ended = false;
  for (let i = 0; i < max && !ended; i++) {
    await mc._step();
    if (A.msgs.some((m) => /— end/.test(m))) ended = true;
    if ((i & 63) === 0) progress(Math.min(1, i / frames), 'add-on');
  }
  return { log: mc.log, msgs: A.msgs.slice(), ended };
}

// ------------------------------------------------------------------ 2. the client model
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sourceOf(rp, ev) {
  // spectral.osc / spectral.n3 / spectral.b1_2 (and the _l events: the same file at definition volume 4)
  const loud = /_l$/.test(ev), name = ev.replace(/^spectral\./, '').replace(/_l$/, '');
  const s = rp[name];
  if (!s) throw new Error('no sound for ' + ev);
  return { pcm: s.pcm, sr: s.sr, vol: loud ? 4 : 1, rms: s.rms * (loud ? 4 : 1) };
}

function renderClient(log, rp, c, progress) {
  const sr = c.sr, blk = c.block;
  // instances and their commands (tools/emu/client.py instances)
  const inst = new Map();
  for (const e of log) {
    if (e[0] === 'play') inst.set(e[2], { ev: e[3], t0: e[1], loop: e[6], cmds: [[e[1], 'start', e[4], e[5]]] });
    else if ((e[0] === 'pitch' || e[0] === 'fade' || e[0] === 'vol' || e[0] === 'stop') && inst.has(e[2])) inst.get(e[2]).cmds.push([e[1], e[0], e[3], e[4]]);
  }
  if (!inst.size) throw new Error('the add-on played nothing');
  // when each tick's commands land (land_times): tick x 50 ms plus a jitter shared by the tick, never before an earlier tick
  const tickSet = new Set();
  for (const s of inst.values()) for (const cm of s.cmds) tickSet.add(cm[0]);
  const ticks = [...tickSet].sort((a, b) => a - b), land = new Map(), rnd = mulberry32(20261031);
  const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let lastS = 0;
  for (const t of ticks) {
    const x = t * TICK + (c.jitterMs ? (gauss() * c.jitterMs) / 1000 : 0);
    let s = Math.max(0, Math.round(x * sr)); if (s < lastS) s = lastS; lastS = s; land.set(t, s);
  }
  const total = Math.ceil((ticks[ticks.length - 1] * TICK + 2) * sr);
  // per instance: the gain events (start / vol: jumps, fade: a linear ramp from wherever the gain had got to, stop) and
  // the pitch changes, each at its tick's landing sample; one-shots play as a whole c.oneshotMs off their tick
  const fmin = c.fadeMinMs / 1000, V = [];
  for (const s of inst.values()) {
    const src = sourceOf(rp, s.ev), loop = s.loop === -1 || s.loop > 0, off = loop ? 0 : Math.round((c.oneshotMs * sr) / 1000);
    const at = (tick) => Math.max(0, land.get(tick) + off);
    const gev = [], marks = [];
    for (const cm of s.cmds) {
      const t = at(cm[0]);
      if (cm[1] === 'start') gev.push([t, cm[3], 0, false]);
      else if (cm[1] === 'vol') gev.push([t, cm[2], 0, false]);
      else if (cm[1] === 'fade') gev.push([t, cm[3], Math.max(cm[2], fmin), false]);
      else if (cm[1] === 'stop') { gev.push([t, 0, 0, true]); marks.push([t, -1]); }
      else if (cm[1] === 'pitch') marks.push([t, cm[2]]);
    }
    gev.sort((a, b) => a[0] - b[0]); marks.sort((a, b) => a[0] - b[0]);
    const t0 = at(s.t0);
    V.push({ src, loop, t0, gev, gi: 0, marks, mi: 0, seg: null, done: false, p: 0, r: (s.cmds[0][2] * src.sr) / sr, end: loop ? Infinity : 0,
      g: new Float32Array(blk), loud: 0 });
  }
  // a one-shot ends with its file at the slowest rate it is given
  for (const v of V) if (!v.loop) { let rmin = v.r; for (const m of v.marks) if (m[1] > 0) rmin = Math.min(rmin, (m[1] * v.src.sr) / sr); v.end = v.t0 + Math.floor(v.src.pcm.length / Math.max(rmin, 1e-3)) + 1; }
  const segValue = (seg, t) => { if (!seg) return 0; const [t0, a, b, n] = seg; if (n <= 0 || t >= t0 + n) return b; return a + ((b - a) * (t - t0)) / n; };
  const mix = new Float32Array(total), order = [];
  for (let B = 0; B < total; B += blk) {
    const n = Math.min(blk, total - B);
    // gains of every instance over this block, and how loud each is (gain x its sound's RMS: the model's voice ranking)
    let live = 0;
    for (const v of V) {
      v.loud = 0;
      if (v.done || B + n <= v.t0) { v.g.fill(0, 0, n); continue; }
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const t = B + i;
        while (v.gi < v.gev.length && v.gev[v.gi][0] <= t) {
          const [te, val, d, stop] = v.gev[v.gi++];
          if (stop) { v.seg = null; v.done = true; break; }
          v.seg = [te, segValue(v.seg, te), val, Math.round(d * sr)];
        }
        const g = v.done || t < v.t0 || t >= v.end ? 0 : segValue(v.seg, t);
        v.g[i] = g; sum += g;
      }
      v.loud = (sum / n) * v.src.rms;
      if (v.loud > 0) live++;
    }
    // at most maxVoices heard: loudest first, at equal loudness the older one stays
    let keep = null;
    if (c.maxVoices && live > c.maxVoices) {
      order.length = 0; for (let i = 0; i < V.length; i++) if (V[i].loud > 0) order.push(i);
      order.sort((a, b) => V[b].loud - V[a].loud || a - b);
      keep = new Set(order.slice(0, c.maxVoices));
    }
    // each instance's sound: its file read linearly at the rate its pitch asks (positions run on whether heard or not)
    for (let k = 0; k < V.length; k++) {
      const v = V[k];
      if (B + n <= v.t0) continue;
      const pcm = v.src.pcm, len = pcm.length, heard = !keep || keep.has(k), vol = v.src.vol;
      for (let i = 0; i < n; i++) {
        const t = B + i;
        if (t < v.t0) continue;
        while (v.mi < v.marks.length && v.marks[v.mi][0] <= t) { const m = v.marks[v.mi++][1]; if (m > 0) v.r = (m * v.src.sr) / sr; }
        if (heard && v.g[i] !== 0) {
          let y = 0;
          if (v.loop) { const p = v.p % len, i0 = Math.floor(p), fr = p - i0, a = pcm[i0], b = pcm[(i0 + 1) % len]; y = a + (b - a) * fr; }
          else if (v.p <= len - 1) { const i0 = Math.floor(v.p), fr = v.p - i0, a = pcm[i0], b = pcm[Math.min(i0 + 1, len - 1)]; y = a + (b - a) * fr; }
          mix[t] += y * v.g[i] * vol;
        }
        v.p += v.r;
        if (v.loop && v.p >= len * 1024) v.p -= len * 1024;
      }
    }
    if ((B / blk) % 256 === 0) progress(B / total, 'client');
  }
  // the client path: the mix clips at c.clip file units, comes out c.gainDb under the files in c.bits, x2 linear to 48 kHz
  const g = Math.pow(10, c.gainDb / 20), Q = c.bits ? Math.pow(2, c.bits - 1) : 0;
  const q = Q ? (x) => Math.round(Math.max(-1, Math.min(1 - 1 / Q, x)) * Q) / Q : (x) => x;
  let clipped = 0, peak = 0;
  for (let i = 0; i < total; i++) {
    let x = mix[i]; const ax = Math.abs(x); if (ax > peak) peak = ax;
    if (ax > c.clip) { x = Math.sign(x) * c.clip; clipped++; }
    mix[i] = q(x * g);
  }
  let out = mix;
  if (sr !== OUT_SR) {
    const k = OUT_SR / sr; out = new Float32Array(total * k);
    for (let i = 0; i < total; i++) { const a = mix[i], b = i + 1 < total ? mix[i + 1] : a; for (let j = 0; j < k; j++) out[i * k + j] = q(a + ((b - a) * j) / k); }
  }
  return { pcm: out, info: { instances: inst.size, peak, clipped, seconds: total / sr } };
}

self.onmessage = async (e) => {
  const { song, songId, client: name, rp } = e.data;
  const c = CLIENTS[name] || CLIENTS.phone;
  try {
    for (const s of Object.values(rp)) { let e2 = 0; for (let i = 0; i < s.pcm.length; i++) e2 += s.pcm[i] * s.pcm[i]; s.rms = Math.sqrt(e2 / s.pcm.length); }
    const progress = (p, stage) => self.postMessage({ progress: p, stage });
    const a = await runAddon(song, songId, c, progress);
    const calls = a.log.filter((x) => x[0] === 'pitch' || x[0] === 'fade' || x[0] === 'vol').length, ticks = new Set(a.log.map((x) => x[1])).size || 1;
    const r = renderClient(a.log, rp, c, progress);
    // from the song's first frame (the tick its first fade goes out), so that it lines up with the original
    let first = Infinity; for (const x of a.log) if ((x[0] === 'fade' || x[0] === 'vol') && x[1] < first) first = x[1];
    if (Number.isFinite(first) && first > 0) r.pcm = r.pcm.slice(Math.round(first * TICK * OUT_SR));
    self.postMessage({ done: true, pcm: r.pcm, info: { ...r.info, callsPerTick: calls / ticks, ended: a.ended, voices: new Set(a.log.filter((x) => x[0] === 'play' && /osc/.test(x[3])).map((x) => x[2])).size } }, [r.pcm.buffer]);
  } catch (err) { self.postMessage({ error: String(err && err.message || err) }); }
};
