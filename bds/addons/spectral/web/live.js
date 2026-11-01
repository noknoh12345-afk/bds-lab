// Spectral Player live encoder — audio in as it comes (a voice chat, a microphone), Spectral Player's live frames out: one every
// 50 ms, each from the last 43 ms of sound only (a causal analysis: no look-ahead, so a frame is ready as soon as its 50 ms are in).
// Its window (2048 at 48 kHz, the noise bands from the same spectrum less the voices' main lobes) won over 4096 and over a shorter
// window of the bands' own on both test speeches through the client model (tools/exp/score_pack.py: 2.92 / 2.86 against 2.82 /
// 2.84 with 4096; the converter's own analysis, no look-ahead limit, 2.99 / 2.92 before its refinement — emulated, not recordings).
// A frame (src/main.ts LiveStream.push): the voices' mask (N bits: the voices whose level or pitch changed, every voice in a key
// frame each second), for each one in it its level code (bit 7: an attack) and, sounding, its pitch code (2 bytes, 0.2 cents
// above 16 Hz), the M noise bands' codes, then the fade codes (2 bits: 5 / 12 / 25 / 50 ms) of the N voices and of the M bands
// — the fade INTO this frame. Levels are the song format's (tools/spectral.py encode): a voice's sine amplitude and a band's RMS
// in file units, 0.75 dB and 0.5 dB codes; a slow automatic gain keeps the loudest moments near 0.9 as the converter does.
// The same frames make a song (toSong: format 2) for /spectral:play, the emulator and the measuring rig.
// Browser: window.SpectralLive; Node: module.exports (tools/live/encoder.mjs, tools/live/bridge.mjs).
(function (root) {
  'use strict';
  const SR = 48000, HOP = 2400, WIN = 4096, FPS = 20, BASE = 1760;
  const NOISE_EDGES = [180, 360, 720, 1440, 2880, 5000, 8000, 12000, 17000];
  const AMP = [-90, 0.75], NZ = [-100, 0.5], FADES = [5, 12, 25, 50];
  const FMIN = 40, FMAX = 11500;            // a voice above ~11.5 kHz only folds down in the game's 24 kHz mix (SPEC.md)

  // ---- FFT (radix-2, in place)
  const tabs = new Map();
  function fft(re, im) {
    const n = re.length;
    let t = tabs.get(n);
    if (!t) {
      const rev = new Uint32Array(n), bits = Math.log2(n) | 0, c = new Float64Array(n / 2), s = new Float64Array(n / 2);
      for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
      for (let i = 0; i < n / 2; i++) { c[i] = Math.cos((2 * Math.PI * i) / n); s[i] = -Math.sin((2 * Math.PI * i) / n); }
      t = { rev, c, s }; tabs.set(n, t);
    }
    for (let i = 0; i < n; i++) { const j = t.rev[i]; if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let s0 = 0; s0 < n; s0 += size) for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = s0 + k, b = a + half, cr = t.c[w], ci = t.s[w], tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  function aWeight(f) {
    f = Math.max(f, 1); const f2 = f * f;
    return (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)) / 0.7943;
  }
  const ampCode = (a) => (a <= 0 ? 0 : Math.max(1, Math.min(127, Math.round((20 * Math.log10(a) - AMP[0]) / AMP[1]) + 1)));
  const nzCode = (a) => { if (a <= 0) return 0; const c = Math.round((20 * Math.log10(a) - NZ[0]) / NZ[1]) + 1; return c > 0 ? Math.min(255, c) : 0; };
  const pitchCode = (f) => Math.max(0, Math.min(65535, Math.round(6000 * Math.log2(f / 16))));
  const ampVal = (c) => (c ? Math.pow(10, (AMP[0] + (c - 1) * AMP[1]) / 20) : 0);
  const nzVal = (c) => (c ? Math.pow(10, (NZ[0] + (c - 1) * NZ[1]) / 20) : 0);

  class LiveEncoder {
    /** voices: sine voices a frame may use (a talker: 16 leave room for another in the 32 sounds a phone plays at once);
     *  agc: the slow automatic gain (off: `gain` fixed). The input is 48 kHz mono (a voice chat's own rate; ffmpeg -ar 48000) */
    constructor({ voices = 16, agc = true, gain = 1, keyEvery = 20, win = 2048, nzWin = 0, refine = 0, level = 10 } = {}) {
      this.N = voices; this.M = NOISE_EDGES.length - 1; this.agc = agc; this.gain = gain; this.peak = 0.25; this.keyEvery = keyEvery;
      // (refine: frames of look-ahead for the refinement as it goes, LiveRefiner — 2 = +100 ms; 0 = none; level: the listener's
      // level over the files it plays for, +10 dB: a phone's, and 3D's)
      this.refiner = refine > 0 ? new LiveRefiner(voices, NOISE_EDGES.length - 1, { ahead: refine, level }) : null;
      this.out = 0;
      // (win: the voices' window; nzWin: the noise bands' own shorter window, 0 = the voices' — their energy less the voices')
      this.W = win; this.NW = nzWin;
      this.ring = new Float32Array(WIN); this.at = 0; this.pending = 0; this.k = 0;
      const hann = (n) => { const w = new Float64Array(n); let s = 0, s2 = 0; for (let i = 0; i < n; i++) { w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); s += w[i]; s2 += w[i] * w[i]; } return { w, s, s2 }; };
      const h = hann(win); this.win = h.w; this.wSum = h.s; this.wSq = h.s2;
      if (nzWin) { const q = hann(nzWin); this.nwin = q.w; this.nwSq = q.s2; this.nre = new Float64Array(nzWin); this.nim = new Float64Array(nzWin); }
      this.re = new Float64Array(win); this.im = new Float64Array(win); this.mag = new Float64Array(win / 2 + 1);
      this.vF = new Float64Array(this.N); this.vA = new Float64Array(this.N);          // the voices as last analysed (Hz, amplitude)
      this.sent = { a: new Int32Array(this.N), p: new Int32Array(this.N).fill(-1) };   // the codes as last sent (delta frames)
      this.nzLast = new Float64Array(this.M);
      this.bandBins = [];
      const BW = nzWin || win;
      for (let b = 0; b < this.M; b++) this.bandBins.push([Math.ceil((NOISE_EDGES[b] * BW) / SR), Math.min(BW / 2, Math.floor((NOISE_EDGES[b + 1] * BW) / SR))]);
      this.frames = []; this.collect = false;
    }
    meta(title) { return { N: this.N, M: this.M, amp: AMP, nz: NZ, fd: FADES, ...(title ? { title } : {}) }; }
    /** 48 kHz samples (Float32Array or array) → the frames they complete (Uint8Array each): one every 2400 samples */
    push(x) {
      const out = [];
      for (let i = 0; i < x.length; i++) {
        this.ring[this.at] = x[i]; this.at = (this.at + 1) % WIN;
        if (++this.pending === HOP) { this.pending = 0; for (const f of this.frame()) out.push(f); }
      }
      return out;
    }
    /** the frames the refinement still holds (its look-ahead), at the end of a stream or a talkspurt */
    flush() { return this.refiner ? this.refiner.flush().map((f) => this.pack(f)) : []; }
    /** the last HOP samples' frame: [] or [bytes] (with the refinement, the frame of `refine` frames before) */
    frame() {
      const fr = this.analyse();
      if (!this.refiner) return [this.pack(fr)];
      const x = new Float32Array(HOP);
      for (let i = 0; i < HOP; i++) x[i] = this.ring[(this.at - HOP + i + WIN) % WIN];
      return this.refiner.frame(fr, x).map((f) => this.pack(f));
    }
    /** one frame's analysis from the last WIN samples: the codes as they would be sent { a, p (Hz, 0: none), att, nz, vf, nf } */
    analyse() {
      const { N, M, re, im, mag, win, ring } = this, WN = this.W, off0 = WIN - WN;
      for (let i = 0; i < WN; i++) { re[i] = ring[(this.at + off0 + i) % WIN] * win[i]; im[i] = 0; }
      fft(re, im);
      const nb = WN / 2 + 1;
      for (let k = 0; k < nb; k++) mag[k] = Math.hypot(re[k], im[k]);
      // peaks: local maxima over two bins each side, within 50 dB of the frame's loudest and over -80 dBFS
      const kmin = Math.ceil((FMIN * WN) / SR), kmax = Math.floor((FMAX * WN) / SR), scale = 2 / this.wSum;
      let mx = 0; for (let k = kmin; k <= kmax; k++) mx = Math.max(mx, mag[k]);
      const floor = Math.max(mx * Math.pow(10, -50 / 20), Math.pow(10, -80 / 20) / scale), peaks = [];
      for (let k = Math.max(kmin, 2); k <= Math.min(kmax, nb - 3); k++) {
        const m = mag[k];
        if (m < floor || m < mag[k - 1] || m <= mag[k + 1] || m < mag[k - 2] || m <= mag[k + 2]) continue;
        const a = Math.log(mag[k - 1] + 1e-30), b = Math.log(m + 1e-30), c = Math.log(mag[k + 1] + 1e-30), d = a - 2 * b + c;
        const off = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0;
        const f = ((k + off) * SR) / WN, A = Math.exp(b - 0.25 * (a - c) * off) * scale;
        peaks.push({ k, f, A, s: A * aWeight(f) });
      }
      peaks.sort((p, q) => q.s - p.s);
      const pick = peaks.slice(0, N);
      // tracking: each voice keeps the peak nearest its own pitch (within 80 cents), the strongest peaks first; the rest start
      // voices that were silent (an attack)
      const vF = this.vF, vA = this.vA, nF = new Float64Array(N), nA = new Float64Array(N), att = new Uint8Array(N), used = new Uint8Array(N);
      const rest = [];
      for (const p of pick) {
        let best = -1, bd = 80;
        for (let v = 0; v < N; v++) { if (used[v] || !(vA[v] > 0)) continue; const c = Math.abs(1200 * Math.log2(p.f / vF[v])); if (c < bd) { bd = c; best = v; } }
        if (best >= 0) { used[best] = 1; nF[best] = p.f; nA[best] = p.A; } else rest.push(p);
      }
      for (const p of rest) { let v = 0; while (v < N && (used[v] || vA[v] > 0)) v++; if (v === N) { v = 0; while (v < N && used[v]) v++; } if (v === N) break; used[v] = 1; nF[v] = p.f; nA[v] = p.A; att[v] = 1; }
      // the noise bands: each band's energy without the main lobes of the peaks the voices took, as its RMS
      const nz = new Float64Array(M);
      if (this.NW) {
        // (a shorter window of their own: the band's mean square less the voices' sines in it, A^2 / 2 each)
        const NW = this.NW, o2 = WIN - NW, nre = this.nre, nim = this.nim;
        for (let i = 0; i < NW; i++) { nre[i] = ring[(this.at + o2 + i) % WIN] * this.nwin[i]; nim[i] = 0; }
        fft(nre, nim);
        for (let b = 0; b < M; b++) {
          let e = 0; const [k0, k1] = this.bandBins[b];
          for (let k = k0; k <= k1; k++) e += nre[k] * nre[k] + nim[k] * nim[k];
          let pv = 0; for (let v = 0; v < N; v++) if (nA[v] > 0 && nF[v] >= NOISE_EDGES[b] && nF[v] < NOISE_EDGES[b + 1]) pv += (nA[v] * nA[v]) / 2;
          nz[b] = Math.sqrt(Math.max(0, (2 * e) / (NW * this.nwSq) - pv));
        }
      } else {
        const lobe = new Uint8Array(nb);
        for (let v = 0; v < N; v++) if (nA[v] > 0) { const k = Math.round((nF[v] * WN) / SR); for (let j = -2; j <= 2; j++) if (k + j >= 0 && k + j < nb) lobe[k + j] = 1; }
        for (let b = 0; b < M; b++) { let e = 0; const [k0, k1] = this.bandBins[b]; for (let k = k0; k <= k1; k++) if (!lobe[k]) e += mag[k] * mag[k]; nz[b] = Math.sqrt((2 * e) / (WN * this.wSq)); }
      }
      // the slow automatic gain: the loudest frame (the converter's measure: the voices' amplitudes x 0.55 and the bands) near 0.9
      let sum = 0; for (let v = 0; v < N; v++) sum += nA[v] * 0.55; for (let b = 0; b < M; b++) sum += nz[b];
      if (this.agc) { this.peak = Math.max(sum, this.peak * 0.998, 1e-4); this.gain = Math.min(1000, 0.9 / this.peak); }
      const g = this.gain;
      // the codes: the voices' levels and pitches, the bands, the fades into this frame
      const a = new Int32Array(N), p = new Float64Array(N), vfade = new Uint8Array(N), nfade = new Uint8Array(M), nzc = new Int32Array(M);
      for (let v = 0; v < N; v++) {
        a[v] = ampCode(nA[v] * g); p[v] = a[v] ? nF[v] : 0;
        const was = vA[v] > 0 ? 20 * Math.log10(vA[v] * g) : -200, now = nA[v] > 0 ? 20 * Math.log10(nA[v] * g) : -200, dd = now - was;
        vfade[v] = att[v] ? 0 : nA[v] <= 0 ? 1 : Math.abs(dd) > 9 ? 1 : Math.abs(dd) > 4 ? 2 : 3;
      }
      for (let b = 0; b < M; b++) {
        nzc[b] = nzCode(nz[b] * g);
        const dd = 20 * Math.log10((nz[b] + 1e-9) / (this.nzLast[b] + 1e-9));
        nfade[b] = dd > 6 ? 0 : dd > 3 ? 1 : dd < -6 ? 2 : 3;
      }
      this.vF = nF; this.vA = nA; this.nzLast = nz; this.k++;
      return { a, p, att, nz: nzc, vf: vfade, nf: nfade };
    }
    /** a frame's codes → its bytes: the voices that changed (all of them in a key frame), the bands, the fades into this frame */
    pack({ a, p, att, nz, vf, nf }) {
      const { N, M } = this, key = this.out % this.keyEvery === 0, mask = new Uint8Array((N + 7) >> 3), body = [];
      for (let v = 0; v < N; v++) {
        const c = a[v], pc = c ? pitchCode(p[v]) : this.sent.p[v];
        const pitchMoved = c && Math.abs(pc - this.sent.p[v]) > 15;       // 3 cents
        if (key || c !== this.sent.a[v] || pitchMoved || att[v]) {
          mask[v >> 3] |= 1 << (v & 7);
          body.push(c | (att[v] ? 0x80 : 0));
          if (c) { body.push(pc & 255, pc >> 8); this.sent.p[v] = pc; }
          this.sent.a[v] = c;
        }
      }
      const fv = new Uint8Array((N + 3) >> 2), fn = new Uint8Array((M + 3) >> 2);
      for (let v = 0; v < N; v++) fv[v >> 2] |= vf[v] << (2 * (v & 3));
      for (let b = 0; b < M; b++) fn[b >> 2] |= nf[b] << (2 * (b & 3));
      const bytes = new Uint8Array(mask.length + body.length + M + fv.length + fn.length);
      let o = 0; bytes.set(mask, o); o += mask.length; bytes.set(body, o); o += body.length;
      for (let b = 0; b < M; b++) bytes[o + b] = nz[b];
      o += M; bytes.set(fv, o); o += fv.length; bytes.set(fn, o);
      this.out++;
      if (this.collect) this.frames.push({ a: Array.from(a), f: Array.from(p), att: Array.from(att), nz: Array.from(nz), vf: Array.from(vf), nf: Array.from(nf) });
      return bytes;
    }
  }

  // ---- the refinement as it goes: web/core.js's analysis by synthesis (tools/spectral.py refine_client: each tick's level and
  // fade of every sound chosen so that the frame as the measured client plays it comes closest to the original in ViSQOL's 32
  // bands, by its NSIM) in one forward pass, each tick decided once the original around it has come — `ahead` frames later.
  // Emulated (tools/exp/live_refine.py: refine_client's first sweep on live frames, the whole song at once), it lifted the live
  // encoder's songs through the client model 2.88 -> 3.20, 3.05 -> 3.50 and 3.45 -> 3.60 (two speeches and a song, +10 dB)
  function coreLib() {
    if (root.SpectralCore) return root.SpectralCore;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') { try { return require('./core.js'); } catch (e) { /* not beside */ } }
    return null;
  }
  const f32 = Math.fround;
  const pitchVal = (c) => 16 * Math.pow(2, c / 6000);
  class LiveRefiner {
    /** N voices, M bands; ahead: frames of look-ahead (2: +100 ms, the frames whose ViSQOL windows meet the tick; 3: +150 ms,
     *  those of the next tick too, as refine_client); level: dB over the files the listener plays (+10); lagMs: the original's
     *  time against the playback's (a live frame is its 43 ms before its end, and played in the tick before it: 50 ms) */
    constructor(N, M, { ahead = 2, level = 10, lagMs = 50, weights = 'svr' } = {}) {
      const C = coreLib();
      if (!C || !C.CL) throw new Error('the refinement needs web/core.js (window.SpectralCore, or beside this file)');
      const K = C.CL;
      this.C = C; this.K = K; this.N = N; this.M = M; this.S = N + M; this.ahead = Math.max(2, Math.min(3, ahead | 0)); this.lag = lagMs;
      this.cm = C.clientModel(NOISE_EDGES);
      this.lv = Math.pow(10, level / 20); this.gv = this.lv / K.OSC_AMP;
      this.nrms = M === K.NOISE_RMS.length ? K.NOISE_RMS : new Array(M).fill(0.18);
      this.aval = new Float64Array(128); for (let c = 1; c < 128; c++) this.aval[c] = f32(ampVal(c));
      this.nval = new Float64Array(256); for (let c = 1; c < 256; c++) this.nval[c] = f32(nzVal(c));
      this.dsend = Math.pow(10, K.SEND_DB / 20); this.csend = Math.pow(2, K.SEND_CENTS / 1200) - 1;
      this.ws = K.WEIGHT_SETS[weights].map((w) => w / 1000);
      this.floorA = new Float64Array(this.S);
      for (let s = 0; s < this.S; s++) this.floorA[s] = s < N ? K.SILENT * K.OSC_AMP : K.SILENT * this.nrms[s - N];
      // the decided state at the start of the next tick to decide (each sound's amplitude and the level it was last sent; each
      // voice's pitch as last sent), and the decided ticks' envelopes and band responses (3 back, for the windows that reach them)
      this.cur = Float64Array.from(this.floorA); this.last = new Float64Array(this.S).fill(f32(K.SILENT)); this.lastP = new Float64Array(N).fill(-1);
      this.hist = [];                                    // [{ env: Float64Array(S * TICK), G: Float64Array(S * 32), Gt }] oldest first
      this.frames = [];                                  // the frames from this.base on: decided (one), then the pending ones
      this.base = 0; this.k = -1;                        // this.k: the last tick decided (-1: none)
      // the original: its samples from this.a0 on, and its ViSQOL bands per window (m → 32 powers)
      this.audio = new Float32Array(0); this.a0 = 0; this.n = 0; this.ref = new Map();
      const L = 3840, nfft = 4096, nb = nfft / 2 + 1;
      this.rw = new Float64Array(L); for (let i = 0; i < L; i++) this.rw[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1));
      const fb = new Float64Array(nb); for (let i = 0; i < nb; i++) fb[i] = (i * SR) / nfft;
      this.H = C.gtH2(fb); for (let j = 0; j < 32; j++) { this.H[j * nb] = 0; this.H[j * nb + nb - 1] = 0; }
      this.re = new Float64Array(nfft); this.im = new Float64Array(nfft); this.P2 = new Float64Array(nb);
      // the playback's and the original's power so far (ViSQOL scales the playback to the original's: the objective's s2)
      this.px = 0; this.pn = 0; this.tot = 0; this.tn = 0;
      this.sineCache = new Map();
    }
    sine(hz) {
      const key = Math.round(hz * 100);
      let g = this.sineCache.get(key);
      if (!g) { g = this.cm.sine(hz); if (this.sineCache.size > 4096) this.sineCache.clear(); this.sineCache.set(key, g); }
      return g;
    }
    levelOf(s, c) {
      const K = this.K;
      if (s < this.N) { const L = Math.min(10, Math.max(K.SILENT, this.aval[c] * this.gv)); return [L, L * K.OSC_AMP]; }
      const b = s - this.N, L = Math.min(10, Math.max(K.SILENT, (this.nval[c] * this.lv) / this.nrms[b]));
      return [L, L * this.nrms[b]];
    }
    code(fr, s) { return s < this.N ? fr.a[s] : fr.nz[s - this.N]; }
    fade(fr, s) { return this.K.FADES[s < this.N ? fr.vf[s] : fr.nf[s - this.N]]; }
    /** frame j (from the encoder's analysis) and the HOP samples that completed it → the frames now final ([] while it looks ahead) */
    frame(fr, x) {
      this.addAudio(x);
      this.frames.push(fr);
      // (tick k is decided once frame k + 1 + ahead is in, then frame k + 1 is final; frame 0 is played from silence as it is)
      const out = [], j = this.base + this.frames.length - 1;
      if (this.k < 0 && this.base === 0 && j === this.ahead) out.push(this.frames[0]);
      while (j >= this.k + 2 + this.ahead && this.frames.length > 1) { this.decide(this.k + 1); out.push(this.frames[1]); this.drop(); }
      return out;
    }
    /** the frames still held (the end of a stream or of a talkspurt), each decided with what has come: the original after it as
     *  silence. The next frames go on from the last one */
    flush() {
      const out = [];
      const end = this.base + this.frames.length - 1;
      if (end < 0) return out;
      if (this.k < 0 && this.base === 0 && end < this.ahead) out.push(this.frames[0]);
      while (this.k + 1 < end) { this.decide(this.k + 1); out.push(this.frames[1]); this.drop(); }
      return out;
    }
    drop() { this.frames.shift(); this.base++; }
    addAudio(x) {
      const keep = Math.round(SR * 0.6), all = new Float32Array(Math.min(this.audio.length, keep) + x.length);
      const from = Math.max(0, this.audio.length - keep);
      all.set(this.audio.subarray(from)); all.set(x, this.audio.length - from);
      this.a0 += from; this.audio = all; this.n += x.length;
      for (let i = 0; i < x.length; i++) this.px += x[i] * x[i];
      this.pn += x.length;
    }
    /** the original's 32 band powers in the ViSQOL window of playback frame m (80 ms from 20 m ms, `lag` ms later in the original) */
    refBands(m) {
      let r = this.ref.get(m);
      if (r) return r;
      const L = 3840, nfft = 4096, nb = nfft / 2 + 1, t0 = Math.round(((m * 20 + this.lag) * SR) / 1000) - this.a0;
      const { re, im, P2, H } = this;
      re.fill(0); im.fill(0);
      for (let i = 0; i < L; i++) { const q = t0 + i; re[i] = q >= 0 && q < this.audio.length ? this.audio[q] * this.rw[i] : 0; }
      fft(re, im);
      for (let i = 0; i < nb; i++) P2[i] = re[i] * re[i] + im[i] * im[i];
      r = new Float64Array(32);
      const sc = 2 / (L * nfft);
      for (let j = 0; j < 32; j++) { let acc = 0; for (let i = 0; i < nb; i++) acc += P2[i] * H[j * nb + i]; r[j] = sc * acc; }
      // (kept once the window has all come: a flush judges with what has)
      if (t0 + L <= this.audio.length) { this.ref.set(m, r); if (this.ref.size > 64) this.ref.delete(this.ref.keys().next().value); }
      return r;
    }
    /** a sound's envelope (amplitude per ms) over ticks from `cur`/`last`, toward the codes and fades of the frames given: { env, cur, last } */
    run(s, cur, last, targets, env, off) {
      const T = this.K.TICK, dsend = this.dsend;
      for (const [c, d] of targets) {
        const [L, A] = this.levelOf(s, c);
        if (L / last < dsend && last / L < dsend) { for (let u = 0; u < T; u++) env[off + u] = cur; off += T; continue; }
        for (let u = 0; u < T; u++) env[off + u] = cur + (A - cur) * Math.min(1, (u + 0.5) / d);
        cur = A; last = f32(L); off += T;
      }
      return [cur, last];
    }
    /** tick k (toward frame k+1): every sound's level and fade chosen against the original, one after another (refine_client's
     *  candidates: its codes around its own, each of the 4 fades, and off) */
    decide(k) {
      const { N, M, S, K, cm } = this, T = K.TICK, Q = K.Q, FL = K.FLOOR * Q, A = this.ahead;
      const fr = (kk) => this.frames[Math.min(kk - this.base, this.frames.length - 1)];
      // the ticks the windows of the frames to judge reach: 3 decided ones before k (hist), k .. k + A (k on: from the state now)
      const nh = this.hist.length, t0 = k - nh, nT = nh + A + 1;
      const env = new Float64Array(S * nT * T), G = new Float64Array(S * nT * 32), Gt = new Float64Array(S * nT);
      for (let h = 0; h < nh; h++) {
        const H = this.hist[h];
        for (let s = 0; s < S; s++) { env.set(H.env.subarray(s * T, s * T + T), (s * nT + h) * T); G.set(H.G.subarray(s * 32, s * 32 + 32), (s * nT + h) * 32); Gt[s * nT + h] = H.Gt[s]; }
      }
      // the pitch each voice is at in ticks k .. k + A (the engine's geometric mean of the two frames, its 3-cent rule) and its response
      for (let v = 0; v < N; v++) {
        let lp = this.lastP[v];
        for (let i = 0; i <= A; i++) {
          const f0 = fr(k + i), f1 = fr(k + i + 1);
          const q0 = f0.a[v] > 0 && f0.p[v] > 0 ? f32(pitchVal(pitchCode(f0.p[v]))) : 0, q1 = f1.a[v] > 0 && f1.p[v] > 0 ? f32(pitchVal(pitchCode(f1.p[v]))) : 0;
          const hz = q0 && q1 ? Math.sqrt(q0 * q1) : q1 || q0;
          if (hz > 0) { const pp = Math.min(10, Math.max(0.01, hz / BASE)); if (!(lp > 0 && Math.abs(pp / lp - 1) < this.csend)) lp = f32(pp); }
          if (lp > 0) { const [g, gt] = this.sine(lp * BASE); G.set(g, (v * nT + nh + i) * 32); Gt[v * nT + nh + i] = gt; }
        }
      }
      for (let b = 0; b < M; b++) for (let i = 0; i <= A; i++) { G.set(cm.noise[b], ((N + b) * nT + nh + i) * 32); Gt[(N + b) * nT + nh + i] = cm.noiseTot[b]; }
      // every sound from the decided state toward the frames as they stand
      const tg = (s, i0) => { const out = []; for (let i = i0; i <= A; i++) { const f = fr(k + i + 1); out.push([this.code(f, s), this.fade(f, s)]); } return out; };
      for (let s = 0; s < S; s++) this.run(s, this.cur[s], this.last[s], tg(s, 0), env, (s * nT + nh) * T);
      // the frames to judge: those whose windows meet ticks k .. k + A - 2, and one each side for the 3x3 neighbourhoods
      const ta = k * T, tb = (k + A - 1) * T;
      const m0 = Math.ceil((ta - K.WIN + 1) / K.HOP), m1 = Math.floor((tb - 1) / K.HOP), ma = m0 - 1, mb = m1 + 1, nf = mb - ma + 1;
      // a sound's power in those frames from its envelope over ticks i0.. (null: the stored one)
      const w2 = cm.w2, P = new Float64Array(32 * nf), tickE = new Float64Array(nT);
      const contrib = (s, e, eoff, out, sign, i0 = 0) => {
        // e: the sound's envelope over all nT ticks (offset eoff); only ticks i0.. counted (the ones a candidate changes)
        const lo = i0 * T;
        for (let m = ma; m <= mb; m++) {
          tickE.fill(0);
          for (let w = 0; w < K.WIN; w++) {
            const t = m * K.HOP + w - t0 * T; if (t < lo || t >= nT * T) continue;
            const v = e[eoff + t]; tickE[(t / T) | 0] += v * v * w2[w];
          }
          for (let i = i0; i < nT; i++) {
            const val = tickE[i] / K.WIN; if (val === 0) continue;
            const g = (s * nT + i) * 32;
            for (let j = 0; j < 32; j++) out[j * nf + (m - ma)] += sign * G[g + j] * val;
          }
        }
      };
      for (let j = 0; j < 32; j++) for (let m = 0; m < nf; m++) P[j * nf + m] = cm.qfloor[j] * cm.mw2;
      for (let s = 0; s < S; s++) contrib(s, env, s * nT * T, P, 1);
      // the scale ViSQOL gives the playback (the original's power over the playback's, so far: at least the frames judged)
      let tw = 0, tn = 0;
      for (let s = 0; s < S; s++) for (let i = nh; i < nT; i++) { let acc = 0; for (let u = 0; u < T; u++) { const v = env[(s * nT + i) * T + u]; acc += v * v; } tw += acc * Gt[s * nT + i]; }
      tn = (nT - nh) * T;
      const pxm = this.pn ? this.px / this.pn : 0, totm = cm.qfloorTot + (this.tn > 2000 ? this.tot / this.tn : (this.tot + tw) / (this.tn + tn));
      const s2 = totm > 0 ? pxm / totm : 1;
      const qdb = (p) => Math.floor(Q * 5 * Math.log10(Math.max(p * s2, 1e-30)) + 0.5);
      const R = new Int32Array(32 * nf), D = new Int32Array(32 * nf), fl = new Int32Array(nf);
      for (let m = 0; m < nf; m++) {
        const r = this.refBands(ma + m);
        let mx = -Infinity;
        for (let j = 0; j < 32; j++) { const rq = Math.max(Math.floor(Q * 5 * Math.log10(Math.max(r[j], 1e-30)) + 0.5), -FL); R[j * nf + m] = rq; mx = Math.max(mx, rq, Math.max(qdb(P[j * nf + m]), -FL)); }
        fl[m] = mx - FL;
        for (let j = 0; j < 32; j++) { R[j * nf + m] = Math.max(R[j * nf + m], fl[m]); D[j * nf + m] = Math.max(Math.max(qdb(P[j * nf + m]), -FL), fl[m]); }
      }
      const lowq = -FL;
      // each sound in turn: its candidates for tick k, the ticks after it run again from where each leaves the sound
      const fk1 = fr(k + 1), segE = new Float64Array((A + 1) * T), con = new Float64Array(32 * nf), old = new Float64Array(32 * nf);
      const one = new Float64Array(S * nT * T);
      for (let s = 0; s < S; s++) {
        const c0 = this.code(fk1, s);
        if (c0 <= 0) continue;
        const isv = s < N, hi = isv ? 127 : 255, steps = isv ? K.VSTEPS : K.NSTEPS;
        const codes = [...new Set(steps.map((d) => Math.min(hi, Math.max(1, c0 + d))))].sort((p, q) => p - q);
        const fc0 = isv ? fk1.vf[s] : fk1.nf[s - N];
        const rest = tg(s, 1);
        old.fill(0); contrib(s, env, s * nT * T, old, 1, nh);
        const nC = codes.length * 4 + 1, Dc = new Int32Array(nC * 32 * nf);
        const base = new Float64Array(32 * nf); for (let i = 0; i < 32 * nf; i++) base[i] = P[i] - old[i];
        // (the bands this sound reaches in ticks k .. k + A: over -90 dB of its loudest; the others stay as they are for every candidate)
        let gmax = 0; for (let i = nh; i < nT; i++) for (let j = 0; j < 32; j++) gmax = Math.max(gmax, G[(s * nT + i) * 32 + j]);
        const act = [];
        for (let j = 0; j < 32; j++) { let g = 0; for (let i = nh; i < nT; i++) g = Math.max(g, G[(s * nT + i) * 32 + j]); if (g > gmax * 1e-9) act.push(j); }
        for (let ci = 0; ci < nC; ci++) {
          const c = ci < nC - 1 ? codes[ci >> 2] : 0, fcode = ci < nC - 1 ? ci & 3 : 3;
          // (this sound's envelope with the candidate: ticks k .. k + A run again; the ones before are the same for all)
          this.run(s, this.cur[s], this.last[s], [[c, K.FADES[fcode]], ...rest], one, (s * nT + nh) * T);
          con.fill(0); contrib(s, one, s * nT * T, con, 1, nh);
          for (let j = 0; j < 32; j++) for (let m = 0; m < nf; m++) Dc[(ci * 32 + j) * nf + m] = D[j * nf + m];
          for (const j of act) for (let m = 0; m < nf; m++) Dc[(ci * 32 + j) * nf + m] = Math.max(Math.max(qdb(base[j * nf + m] + con[j * nf + m]), -FL), fl[m]);
        }
        // ViSQOL's similarity over the bands a candidate changes (and their neighbours), the judged frames (and theirs)
        let jl = -1, jh = -1;
        for (const j of act) {
          let ch = false;
          for (let ci = 0; ci < nC && !ch; ci++) for (let m = 0; m < nf; m++) if (Dc[(ci * 32 + j) * nf + m] !== D[j * nf + m]) { ch = true; break; }
          if (ch) { if (jl < 0) jl = j; jh = j; }
        }
        if (jl < 0) continue;
        const ja = Math.max(0, jl - 1), jb = Math.min(31, jh + 1), rows = [];
        for (let i = ja - 1; i <= jb + 1; i++) rows.push(Math.min(31, Math.max(0, i)));
        const nr = rows.length, ncol = nf, rr = new Float64Array(nr * ncol), dn = new Float64Array(nr * ncol), dc = new Float64Array(nr * ncol), wsr = [];
        for (let i = ja; i <= jb; i++) wsr.push(this.ws[i]);
        for (let i = 0; i < nr; i++) for (let m = 0; m < ncol; m++) { rr[i * ncol + m] = (R[rows[i] * nf + m] - lowq) / Q; dn[i * ncol + m] = (D[rows[i] * nf + m] - lowq) / Q; }
        const ref = this.C.nsimRef(rr, nr, ncol), Ln = -this.C.nsimSum(ref, dn, wsr);
        let best = -1, bestL = Infinity;
        for (let ci = 0; ci < nC; ci++) {
          for (let i = 0; i < nr; i++) for (let m = 0; m < ncol; m++) dc[i * ncol + m] = (Dc[(ci * 32 + rows[i]) * nf + m] - lowq) / Q;
          const Lc = -this.C.nsimSum(ref, dc, wsr);
          if (Lc < bestL) { bestL = Lc; best = ci; }
        }
        const bc = best < nC - 1 ? codes[best >> 2] : 0, bf = best < nC - 1 ? best & 3 : 3;
        if (best >= 0 && bestL < Ln && (bc !== c0 || bf !== fc0)) {
          // (taken: the frame's code and fade, this sound's envelope and the frames' power and dB as they now stand)
          if (isv) { fk1.a[s] = bc; fk1.vf[s] = bf; if (!bc) fk1.p[s] = 0; } else { fk1.nz[s - N] = bc; fk1.nf[s - N] = bf; }
          this.run(s, this.cur[s], this.last[s], tg(s, 0), env, (s * nT + nh) * T);
          con.fill(0); contrib(s, env, s * nT * T, con, 1, nh);
          for (let i = 0; i < 32 * nf; i++) { P[i] = base[i] + con[i]; D[i] = Math.max(Math.max(qdb(P[i]), -FL), fl[i % nf]); }
        }
      }
      // tick k is decided: its envelopes and responses kept (3 back), the state after it, the playback's power
      const H = { env: new Float64Array(S * T), G: new Float64Array(S * 32), Gt: new Float64Array(S) };
      let acc = 0;
      for (let s = 0; s < S; s++) {
        const [c1, l1] = this.run(s, this.cur[s], this.last[s], [[this.code(fk1, s), this.fade(fk1, s)]], H.env, s * T);
        this.cur[s] = c1; this.last[s] = l1;
        H.G.set(G.subarray((s * nT + nh) * 32, (s * nT + nh) * 32 + 32), s * 32); H.Gt[s] = Gt[s * nT + nh];
        let e2 = 0; for (let u = 0; u < T; u++) { const v = H.env[s * T + u]; e2 += v * v; }
        acc += e2 * H.Gt[s];
      }
      this.tot += acc; this.tn += T;
      // (the voices' pitch as the engine leaves it after tick k: frames k and k + 1 as decided)
      const f0 = fr(k);
      for (let v = 0; v < N; v++) {
        const q0 = f0.a[v] > 0 && f0.p[v] > 0 ? f32(pitchVal(pitchCode(f0.p[v]))) : 0, q1 = fk1.a[v] > 0 && fk1.p[v] > 0 ? f32(pitchVal(pitchCode(fk1.p[v]))) : 0;
        const hz = q0 && q1 ? Math.sqrt(q0 * q1) : q1 || q0;
        if (hz > 0) { const pp = Math.min(10, Math.max(0.01, hz / BASE)); if (!(this.lastP[v] > 0 && Math.abs(pp / this.lastP[v] - 1) < this.csend)) this.lastP[v] = f32(pp); }
      }
      this.hist.push(H); if (this.hist.length > 3) this.hist.shift();
      this.k = k;
    }
  }

  /** frames as a live message (spectral:live) for the server console: within /scriptevent's 2048 characters */
  function message(id, seq, frames, { meta, at } = {}) {
    let n = 0; for (const f of frames) n += f.length;
    const all = new Uint8Array(n); let o = 0; for (const f of frames) { all.set(f, o); o += f.length; }
    return JSON.stringify({ id, s: seq, f: b64(all), ...(meta ? { m: meta } : {}), ...(at ? { at } : {}) });
  }
  function b64(b) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = '';
    for (let i = 0; i < b.length; i += 3) { const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0); s += A[n >> 18] + A[(n >> 12) & 63] + (i + 1 < b.length ? A[(n >> 6) & 63] : '=') + (i + 2 < b.length ? A[n & 63] : '='); }
    return s;
  }

  /** an encoder's collected frames (collect = true) → a song (format 2, tools/spectral.py encode's layout): { meta, data }. The
   *  song's fade at tick k leads to frame k+1: the live fade INTO frame k+1 */
  function toSong(enc, { id = 'live', title = 'live', seconds } = {}) {
    const fr = enc.frames, F = fr.length, N = enc.N, M = enc.M, nb = (N + 7) >> 3, bytes = [];
    const curA = new Int32Array(N), curP = new Int32Array(N).fill(-1);
    for (let k = 0; k < F; k++) {
      const mask = new Uint8Array(nb), body = [];
      for (let v = 0; v < N; v++) {
        const c = fr[k].a[v], pc = c ? pitchCode(fr[k].f[v]) : curP[v];
        if (c !== curA[v] || (c && pc !== curP[v]) || fr[k].att[v]) {
          mask[v >> 3] |= 1 << (v & 7); body.push(c | (fr[k].att[v] ? 0x80 : 0));
          if (c) { body.push(pc & 255, pc >> 8); curP[v] = pc; }
          curA[v] = c;
        }
      }
      bytes.push(...mask, ...body, ...fr[k].nz, 0);
    }
    const per = (n) => (n + 3) >> 2, vd = [], nd = [];
    for (let k = 0; k < F; k++) {
      const nx = fr[Math.min(F - 1, k + 1)], a = new Uint8Array(per(N)), b = new Uint8Array(per(M));
      for (let v = 0; v < N; v++) a[v >> 2] |= (k + 1 < F ? nx.vf[v] : 3) << (2 * (v & 3));
      for (let j = 0; j < M; j++) b[j >> 2] |= (k + 1 < F ? nx.nf[j] : 3) << (2 * (j & 3));
      vd.push(...a); nd.push(...b);
    }
    const data = new Uint8Array([...bytes, ...vd, ...nd]);
    const meta = { format: 'spectral-player/2', title, artist: 'live', fps: FPS, frames: F, voices: N, base: BASE, noise: NOISE_EDGES.slice(0, -1).map((x, i) => [x, NOISE_EDGES[i + 1]]),
      bursts: 3, sub: 4, seconds: seconds ?? Math.round((F / FPS) * 100) / 100, amp: AMP, nz: NZ, analysis: 'live', fd: { ms: FADES, v: vd.length, nz: nd.length }, id };
    return { meta, data: b64(data) };
  }

  const api = { LiveEncoder, LiveRefiner, message, toSong, b64, ampCode, nzCode, pitchCode, ampVal, nzVal, SR, HOP, WIN, FPS, NOISE_EDGES, AMP, NZ, FADES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpectralLive = api;
})(typeof window !== 'undefined' ? window : globalThis);
