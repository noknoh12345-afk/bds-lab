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
    constructor({ voices = 16, agc = true, gain = 1, keyEvery = 20, win = 2048, nzWin = 0 } = {}) {
      this.N = voices; this.M = NOISE_EDGES.length - 1; this.agc = agc; this.gain = gain; this.peak = 0.25; this.keyEvery = keyEvery;
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
        if (++this.pending === HOP) { this.pending = 0; out.push(this.frame()); }
      }
      return out;
    }
    /** one frame from the last WIN samples */
    frame() {
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
      // the frame: the voices that changed (all of them in a key frame), the bands, the fades into this frame
      const key = this.k % this.keyEvery === 0, mask = new Uint8Array((N + 7) >> 3), body = [], vfade = new Uint8Array(N), nfade = new Uint8Array(M);
      for (let v = 0; v < N; v++) {
        const c = ampCode(nA[v] * g), pc = c ? pitchCode(nF[v]) : this.sent.p[v];
        const was = vA[v] > 0 ? 20 * Math.log10(vA[v] * g) : -200, now = nA[v] > 0 ? 20 * Math.log10(nA[v] * g) : -200, dd = now - was;
        vfade[v] = att[v] ? 0 : nA[v] <= 0 ? 1 : Math.abs(dd) > 9 ? 1 : Math.abs(dd) > 4 ? 2 : 3;
        const pitchMoved = c && Math.abs(pc - this.sent.p[v]) > 15;       // 3 cents
        if (key || c !== this.sent.a[v] || pitchMoved || att[v]) {
          mask[v >> 3] |= 1 << (v & 7);
          body.push(c | (att[v] ? 0x80 : 0));
          if (c) { body.push(pc & 255, pc >> 8); this.sent.p[v] = pc; }
          this.sent.a[v] = c;
        }
      }
      const nzc = new Uint8Array(M);
      for (let b = 0; b < M; b++) {
        nzc[b] = nzCode(nz[b] * g);
        const dd = 20 * Math.log10((nz[b] + 1e-9) / (this.nzLast[b] + 1e-9));
        nfade[b] = dd > 6 ? 0 : dd > 3 ? 1 : dd < -6 ? 2 : 3;
      }
      const fv = new Uint8Array((N + 3) >> 2), fn = new Uint8Array((M + 3) >> 2);
      for (let v = 0; v < N; v++) fv[v >> 2] |= vfade[v] << (2 * (v & 3));
      for (let b = 0; b < M; b++) fn[b >> 2] |= nfade[b] << (2 * (b & 3));
      const bytes = new Uint8Array(mask.length + body.length + M + fv.length + fn.length);
      let o = 0; bytes.set(mask, o); o += mask.length; bytes.set(body, o); o += body.length; bytes.set(nzc, o); o += M; bytes.set(fv, o); o += fv.length; bytes.set(fn, o);
      this.vF = nF; this.vA = nA; this.nzLast = nz; this.k++;
      if (this.collect) this.frames.push({ a: Array.from(nA, (x) => ampCode(x * g)), f: Array.from(nF), att: Array.from(att), nz: Array.from(nzc), vf: Array.from(vfade), nf: Array.from(nfade) });
      return bytes;
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

  const api = { LiveEncoder, message, toSong, b64, ampCode, nzCode, pitchCode, ampVal, nzVal, SR, HOP, WIN, FPS, NOISE_EDGES, AMP, NZ, FADES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpectralLive = api;
})(typeof window !== 'undefined' ? window : globalThis);
