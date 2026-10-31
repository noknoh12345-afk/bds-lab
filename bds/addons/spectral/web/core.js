// Spectral Player converter core — a line-for-line port of tools/spectral.py (same analysis, same allocation,
// same encoding, same engine tick rules), streamed frame by frame so a whole song never sits in memory as spectra.
// Works in the browser (window.SpectralCore) and in Node (module.exports) for parity tests.
(function (root) {
  'use strict';
  const SR = 44100, FPS = 20, HOP = SR / FPS, BASE = 1760, FMIN = 25, FMAX = 16000;
  const NOISE_EDGES = [180, 360, 720, 1440, 2880, 5000, 8000, 12000, 17000];
  const BURST_BANDS = [[30, 200], [200, 4000], [4000, 16000]];
  const SUB = 4, AMP_FLOOR_DB = -90, AMP_STEP_DB = 0.75, NZ_FLOOR_DB = -100, NZ_STEP_DB = 0.5;
  const RES = [[8192, 16384, FMIN, 330], [4096, 8192, 330, 2000], [2048, 4096, 2000, FMAX]];
  const FLOOR_W = 90, PEAK_DB = 8, MAX_PER_FRAME = 160;
  const FADE_SMOOTH = 0.05, FADE_ATTACK = 0.012, SILENT = 1e-4;

  // ---------------------------------------------------------------- FFT (iterative radix-2, cached tables)
  const fftCache = new Map();
  function tables(n) {
    let t = fftCache.get(n);
    if (t) return t;
    const rev = new Uint32Array(n), bits = Math.log2(n) | 0;
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
    t = { rev, cos, sin }; fftCache.set(n, t); return t;
  }
  /** in-place complex FFT of (re, im), length a power of two */
  function fft(re, im) {
    const n = re.length, { rev, cos, sin } = tables(n);
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let s = 0; s < n; s += size) {
        for (let k = 0, w = 0; k < half; k++, w += step) {
          const a = s + k, b = a + half, c = cos[w], d = sin[w];
          const tr = re[b] * c - im[b] * d, ti = re[b] * d + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  }
  const bh = (n) => { const w = new Float64Array(n); for (let i = 0; i < n; i++) { const t = (2 * Math.PI * i) / n; w[i] = 0.35875 - 0.48829 * Math.cos(t) + 0.14128 * Math.cos(2 * t) - 0.01168 * Math.cos(3 * t); } return w; };
  const hann = (n) => { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); return w; };   // numpy.hanning
  function aWeight(f) {
    f = Math.max(f, 1); const f2 = f * f;
    const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
    return ra / 0.7943;
  }
  const bark = (f) => 13 * Math.atan(0.00076 * f) + 3.5 * Math.atan((f / 7500) ** 2);
  const cents = (a, b) => 1200 * Math.log2(a / b);
  function movingAvg(a, w, out) {
    const n = a.length, c = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) c[i + 1] = c[i] + a[i];
    for (let i = 0; i < n; i++) { const lo = Math.max(i - w, 0), hi = Math.min(i + w + 1, n); out[i] = (c[hi] - c[lo]) / (hi - lo); }
    return out;
  }

  // ---------------------------------------------------------------- one resolution: spectrum of frame k
  function makeRes([nw, nfft, flo, fhi]) {
    const w = bh(nw); let sw = 0, sw2 = 0; for (let i = 0; i < nw; i++) { sw += w[i]; sw2 += w[i] * w[i]; }
    const nb = nfft / 2 + 1;
    return { nw, nfft, flo, fhi, w, sw, sw2, nb, binhz: SR / nfft, ml: Math.floor((4 * nfft) / nw) + 1,
      re: new Float64Array(nfft), im: new Float64Array(nfft), pw: new Float64Array(nb), db: new Float64Array(nb),
      m1: new Float64Array(nb), cl: new Float64Array(nb), floor: new Float64Array(nb) };
  }
  function spectrum(R, x, k) {
    const { nw, nfft, w, re, im, pw, db, nb } = R, c = k * HOP - nw / 2;
    re.fill(0); im.fill(0);
    for (let i = 0; i < nw; i++) { const j = c + i; re[i] = j >= 0 && j < x.length ? x[j] * w[i] : 0; }
    fft(re, im);
    for (let i = 0; i < nb; i++) { const p = re[i] * re[i] + im[i] * im[i]; pw[i] = p; db[i] = 20 * Math.log10(Math.sqrt(p) + 1e-12); }
    movingAvg(db, FLOOR_W, R.m1);
    for (let i = 0; i < nb; i++) R.cl[i] = Math.min(db[i], R.m1[i]);
    movingAvg(R.cl, FLOOR_W, R.floor);
  }
  function peaksOf(R, out) {
    const { db, floor, nb, binhz, flo, fhi, sw } = R, g = 20 * Math.log10(2 / sw);
    const lo = Math.floor(flo / binhz), hi = Math.min(Math.floor(fhi / binhz) + 1, nb - 3);
    for (let i = Math.max(2, lo); i < hi; i++) {
      const c = db[i];
      if (!(c > db[i - 1] && c >= db[i + 1] && c > db[i - 2] && c >= db[i + 2])) continue;
      if (!(c + g > -88 && c - floor[i] > PEAK_DB)) continue;
      const a = db[i - 1], b = c, gg = db[i + 1], den = a - 2 * b + gg;
      let p = Math.abs(den) > 1e-9 ? (0.5 * (a - gg)) / den : 0; p = Math.max(-0.5, Math.min(0.5, p));
      const f = (i + p) * binhz;
      if (!(f >= flo && f < fhi)) continue;
      out.push([f, Math.pow(10, (b - 0.25 * (a - gg) * p + g) / 20)]);
    }
  }
  function maskAndRank(pk) {
    if (!pk.length) return [];
    const s = pk.map(([f, a]) => a * aWeight(f)), z = pk.map(([f]) => bark(f));
    const order = pk.map((_, i) => i).sort((i, j) => s[j] - s[i] || i - j);
    const chosen = [];
    for (const i of order) {
      let masked = false;
      for (const j of chosen) {
        const dz = Math.abs(z[i] - z[j]);
        if (dz < 3) { const slope = z[i] > z[j] ? 10 : 25; if (s[i] < s[j] * Math.pow(10, -(14 + slope * dz) / 20)) { masked = true; break; } }
      }
      if (!masked) chosen.push(i);
    }
    return chosen.map((i) => [pk[i][0], pk[i][1], s[i]]);
  }

  // ---------------------------------------------------------------- onsets (SuperFlux per burst band)
  function onsets(x, nFrames, delta = 0.35) {
    const hop = 128, events = [];
    for (let bnd = 0; bnd < BURST_BANDS.length; bnd++) {
      const [lo, hi] = BURST_BANDS[bnd], nw = [2048, 1024, 512][bnd], w = hann(nw);
      let w2 = 0; for (let i = 0; i < nw; i++) w2 += w[i] * w[i];
      const n = Math.floor((x.length - nw) / hop); if (n <= 8) continue;
      const binhz = SR / nw, i0 = Math.max(1, Math.floor(lo / binhz)), i1 = Math.floor(hi / binhz) + 1, nbins = i1 - i0;
      const re = new Float64Array(nw), im = new Float64Array(nw);
      const L = new Float32Array(n * nbins), pw = new Float64Array(n), flux = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < nw; j++) { re[j] = x[i * hop + j] * w[j]; im[j] = 0; }
        fft(re, im);
        let p = 0;
        for (let b = 0; b < nbins; b++) { const q = re[i0 + b] ** 2 + im[i0 + b] ** 2; p += q; L[i * nbins + b] = Math.log10(1 + 100 * Math.sqrt(q)); }
        pw[i] = (p * 2) / (nw * w2);
      }
      const mu = 3;
      for (let i = mu; i < n; i++) {
        let s = 0; const a = i * nbins, r = (i - mu) * nbins;
        for (let b = 0; b < nbins; b++) {
          const ref = Math.max(L[r + Math.max(b - 1, 0)], L[r + b], L[r + Math.min(b + 1, nbins - 1)]);
          const d = L[a + b] - ref; if (d > 0) s += d;
        }
        flux[i] = s / nbins;
      }
      const sizeM = (Math.floor((0.1 * SR) / hop) | 1), sizeL = (Math.floor((0.03 * SR) / hop) | 1);
      const at = (i) => flux[Math.max(0, Math.min(n - 1, i))];
      let last = -1e9;
      for (let i = 0; i < n; i++) {
        let mx = -Infinity; for (let k = -(sizeL >> 1); k <= sizeL >> 1; k++) mx = Math.max(mx, at(i + k));
        if (flux[i] !== mx) continue;
        let mean = 0; for (let k = -(sizeM >> 1); k <= sizeM >> 1; k++) mean += at(i + k); mean /= sizeM;
        if (!(flux[i] > mean + delta * 0.1 && flux[i] > delta * 0.15)) continue;
        const t = (i * hop + nw / 2) / SR;
        if (t - last < 0.05) continue;
        let pre = 0, pn = 0; for (let k = Math.max(i - 8, 0); k < Math.max(i - 2, 1); k++) { pre += pw[k]; pn++; } pre = pn ? pre / pn : 0;
        let post = 0, qn = 0; for (let k = i; k < Math.min(i + 4, n); k++) { post += pw[k]; qn++; } post /= qn;
        const p = post - pre; if (p <= 1e-9) continue;
        last = t;
        const pos = t * FPS; let k = Math.floor(pos), sub = Math.round((pos - k) * SUB);
        if (sub >= SUB) { k++; sub = 0; }
        if (k >= 0 && k < nFrames) events.push([k, sub, bnd, Math.sqrt(p)]);
      }
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    const hiT = events.filter((e) => e[2] > 0).map((e) => e[0] * SUB + e[1]);
    return events.filter((e) => e[2] !== 0 || hiT.some((h) => Math.abs(e[0] * SUB + e[1] - h) <= 1) || e[3] >= 0.08);
  }

  // ---------------------------------------------------------------- analysis v2 (tools/spectral.py: track_partials ... choose_noise_bands)
  const MIN_TRACK = 3, TRACK_GAP = 1, NSIM_MARGIN = 0.003;
  function trackPartials(peaks, maxDev = 60, gap = TRACK_GAP) {
    let active = []; const done = [];
    for (let k = 0; k < peaks.length; k++) {
      const pk = peaks[k], used = new Uint8Array(pk.length);
      const key = (i) => -Math.max(active[i].a[active[i].a.length - 1], 1e-12);
      const order = active.map((_, i) => i).sort((i, j) => key(i) - key(j));
      for (const i of order) {
        const tr = active[i], lf = tr.lf, la = tr.la, dev = Math.max(maxDev, cents(lf + 9, lf));
        let best = -1, bc = 1e9;
        for (let j = 0; j < pk.length; j++) {
          if (used[j]) continue;
          const f = pk[j][0], a = pk[j][1], dc = Math.abs(cents(f, lf));
          if (dc > dev) continue;
          const cost = dc + 3 * Math.abs(20 * Math.log10(a / la));
          if (cost < bc) { best = j; bc = cost; }
        }
        if (best >= 0) { used[best] = 1; const f = pk[best][0], a = pk[best][1]; tr.f.push(f); tr.a.push(a); tr.lf = f; tr.la = a; tr.miss = 0; }
        else { tr.miss++; tr.f.push(lf); tr.a.push(0); }
      }
      const still = [];
      for (const tr of active) {
        if (tr.miss > gap) { tr.f.length -= tr.miss; tr.a.length -= tr.miss; done.push(tr); } else still.push(tr);
      }
      active = still;
      for (let j = 0; j < pk.length; j++) if (!used[j]) active.push({ k0: k, f: [pk[j][0]], a: [pk[j][1]], lf: pk[j][0], la: pk[j][1], miss: 0 });
    }
    for (const tr of active) { if (tr.miss) { tr.f.length -= tr.miss; tr.a.length -= tr.miss; } done.push(tr); }
    const out = [];
    for (const tr of done) {
      const a = tr.a;
      for (let i = 1; i < a.length - 1; i++) if (a[i] === 0 && a[i - 1] > 0 && a[i + 1] > 0) a[i] = Math.sqrt(a[i - 1] * a[i + 1]);
      if (a.length) out.push(tr);
    }
    return out;
  }
  function chooseTracks(tracks, F, N, minFrames = MIN_TRACK, margin = 1, salience = null, groups = null) {
    const cand = [];
    tracks.forEach((t, ti) => {
      if (t.a.length < minFrames) return;
      let sal = 0;
      if (salience) sal = salience[ti]; else for (let i = 0; i < t.a.length; i++) sal += t.a[i] * aWeight(t.f[i]);
      cand.push([sal, ti]);
    });
    cand.sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    const busy = Array.from({ length: N }, () => new Uint8Array(F + 2)), placed = [], taken = new Uint8Array(tracks.length);
    // groups: [[first voice, end voice, allowed(track index) or null], ...] filled one after the other (tools/spectral.py)
    for (const [v0, v1, ok] of groups ?? [[0, N, null]]) {
      for (const [, ti] of cand) {
        if (taken[ti] || (ok && !ok(ti))) continue;
        const t = tracks[ti], lo = Math.max(0, t.k0 - margin), hi = Math.min(F, t.k0 + t.a.length + margin);
        for (let v = v0; v < v1; v++) {
          const b = busy[v]; let free = true;
          for (let i = lo; i < hi; i++) if (b[i]) { free = false; break; }
          if (free) { for (let i = lo; i < hi; i++) b[i] = 1; placed.push([v, ti]); taken[ti] = 1; break; }
        }
      }
    }
    const fq = new Float64Array(F * N), am = new Float64Array(F * N), att = new Uint8Array(F * N);
    for (const [v, ti] of placed) {
      const { k0, f, a } = tracks[ti];
      for (let i = 0; i < a.length; i++) { fq[(k0 + i) * N + v] = f[i]; am[(k0 + i) * N + v] = a[i]; }
      if (!(a.length > 1 && a[1] > a[0] * 1.6)) att[k0 * N + v] = 1;
      for (let i = 1; i < a.length; i++) if (a[i - 1] > 0 && a[i] > a[i - 1] * 2.8) att[(k0 + i) * N + v] = 1;
    }
    return { fq, am, att, placed: placed.length };
  }
  // ---------------------------------------------------------------- ERB bands (ViSQOL's 32 from 50 Hz): power per frame, track salience, noise fit
  // (tools/spectral.py erb_band_power, erb_salience, fit_noise)
  const ERB_N = 32;
  const ERB_EDGES = (() => {
    const lo = 21.4 * Math.log10(1 + 0.00437 * 50), hi = 21.4 * Math.log10(1 + 0.00437 * (SR / 2)), e = [];
    for (let i = 0; i <= ERB_N; i++) e.push((Math.pow(10, (lo + ((hi - lo) * i) / ERB_N) / 21.4) - 1) / 0.00437);
    return e;
  })();
  /** the frame's power in each ERB band from one resolution (over its own range; the outer ones down to 0 and up to SR/2) */
  function erbAdd(R, P, k) {
    const scale = 2 / (R.nfft * R.sw2);
    for (let j = 0; j < ERB_N; j++) {
      const blo = Math.max(ERB_EDGES[j], R.flo > FMIN ? R.flo : 0), bhi = Math.min(ERB_EDGES[j + 1], R.fhi < FMAX ? R.fhi : SR / 2);
      if (bhi <= blo) continue;
      let s = 0; for (let i = Math.floor(blo / R.binhz); i < Math.floor(bhi / R.binhz); i++) s += R.pw[i];
      P[k * ERB_N + j] += s * scale;
    }
  }
  /** numpy.searchsorted(ERB_EDGES, f) - 1: the band f falls in (edges[j] < f <= edges[j+1]) */
  const erbBand = (f) => { let j = 0; while (j <= ERB_N && ERB_EDGES[j] < f) j++; return j - 1; };
  function erbSalience(tracks, P, F, floorDb = 45) {
    const top = new Float64Array(F), thr = Math.pow(10, -floorDb / 10);
    for (let k = 0; k < F; k++) { let m = -Infinity; for (let j = 0; j < ERB_N; j++) m = Math.max(m, P[k * ERB_N + j]); top[k] = m; }
    return tracks.map((t) => {
      let s = 0;
      for (let i = 0; i < t.a.length; i++) {
        const k = t.k0 + i; if (k >= F || t.a[i] <= 0) continue;
        const j = erbBand(t.f[i]); if (j < 0 || j >= ERB_N) continue;
        const e = P[k * ERB_N + j]; if (e <= top[k] * thr) continue;
        s += Math.min(1, (0.5 * t.a[i] * t.a[i]) / Math.max(e, 1e-30));
      }
      return s;
    });
  }
  /** noise band levels that, with the voices, give each ERB band of each frame the original's power (relative least squares,
   *  coordinate descent on non-negative band powers, a fixed number of sweeps) -> band RMS (F x M) */
  function fitNoise(P, fq, am, F, N, edges, floorDb = 45, sweeps = 60) {
    const M = edges.length - 1, J = ERB_N, D = new Float64Array(M * J), thr = Math.pow(10, -floorDb / 10);
    for (let b = 0; b < M; b++) for (let j = 0; j < J; j++) {
      const ov = Math.min(edges[b + 1], ERB_EDGES[j + 1]) - Math.max(edges[b], ERB_EDGES[j]);
      if (ov > 0) D[b * J + j] = ov / (edges[b + 1] - edges[b]);
    }
    const out = new Float64Array(F * M), pv = new Float64Array(J), w = new Float64Array(J), r = new Float64Array(J), cur = new Float64Array(J), n = new Float64Array(M);
    for (let k = 0; k < F; k++) {
      pv.fill(0);
      for (let v = 0; v < N; v++) {
        const a = am[k * N + v]; if (!(a > 0)) continue;
        const j = erbBand(fq[k * N + v]); if (j >= 0 && j < J) pv[j] += 0.5 * (a * a);
      }
      let top = -Infinity; for (let j = 0; j < J; j++) top = Math.max(top, P[k * J + j]);
      if (!(top > 0)) continue;
      const eps = top * thr;
      for (let j = 0; j < J; j++) { const p = P[k * J + j]; w[j] = 1 / ((p + eps) * (p + eps)); r[j] = Math.max(p - pv[j], 0); }
      n.fill(0); cur.fill(0);
      for (let it = 0; it < sweeps; it++) for (let b = 0; b < M; b++) {
        let den = 0; for (let j = 0; j < J; j++) { const d = D[b * J + j]; den += w[j] * d * d; }
        if (den <= 0) continue;
        let num = 0; for (let j = 0; j < J; j++) { const d = D[b * J + j]; num += w[j] * d * (r[j] - (cur[j] - d * n[b])); }
        const nb = Math.max(0, num / den);
        for (let j = 0; j < J; j++) cur[j] += D[b * J + j] * (nb - n[b]);
        n[b] = nb;
      }
      for (let b = 0; b < M; b++) out[k * M + b] = Math.sqrt(n[b]);
    }
    return out;
  }
  const ampVal = (c) => (c === 0 ? 0 : Math.pow(10, (AMP_FLOOR_DB + (c - 1) * AMP_STEP_DB) / 20));
  const pitchVal = (c) => 16 * Math.pow(2, c / 6000);
  const nzVal = (c) => (c === 0 ? 0 : Math.pow(10, (NZ_FLOOR_DB + (c - 1) * NZ_STEP_DB) / 20));
  /** a unit-RMS band noise loop of n samples (raised-cosine edges, xorshift32 phases): the converter's own, as in Python */
  function checkNoise(lo, hi, n = 65536, seed = 1) {
    let st = ((seed * 2654435761 + 12345) >>> 0) || 1;
    const next = () => { st ^= (st << 13) >>> 0; st >>>= 0; st ^= st >>> 17; st ^= (st << 5) >>> 0; st >>>= 0; return st; };
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 1; i < n / 2; i++) {
      const fi = Math.max(i * (SR / n), 1); let e = 1;
      for (const [c, d] of [[lo, -1], [hi, 1]]) {
        const oc = Math.log2(fi / c) * d;
        e *= oc < -1 / 12 ? 1 : oc > 1 / 12 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (oc + 1 / 12) * 6);
      }
      const ph = next() / 4294967296 * 2 * Math.PI;
      if (e > 0) { re[i] = e * Math.cos(ph); im[i] = e * Math.sin(ph); re[n - i] = re[i]; im[n - i] = -im[i]; }
    }
    for (let i = 0; i < n; i++) im[i] = -im[i];                    // inverse FFT = conj(FFT(conj X)) / n
    fft(re, im);
    let ss = 0; for (let i = 0; i < n; i++) { re[i] /= n; ss += re[i] * re[i]; }
    const r = Math.sqrt(ss / n + 1e-30);
    for (let i = 0; i < n; i++) re[i] /= r;
    return re;
  }
  /** the sine voices at speed 1 (schedule's tick rules), values already quantised: F x N (fq, am, att) -> n samples at SR */
  function checkRenderSines(fq, am, att, F, N, n) {
    const out = new Float64Array(n), nA = Math.floor(FADE_ATTACK * SR), nS = Math.floor(FADE_SMOOTH * SR);
    for (let v = 0; v < N; v++) {
      let any = false; for (let k = 0; k < F; k++) if (am[k * N + v] > 0) { any = true; break; }
      if (!any) continue;
      const a = (k) => (k >= 0 && k < F ? am[k * N + v] : 0), f = (k) => fq[k * N + v], A = (k) => k < F && att[k * N + v] && a(k) > 0;
      let cur = SILENT, curP = BASE, ph = 0;
      for (let T = 0; T < F; T++) {
        const s0 = T * HOP; if (s0 >= n) break;
        let p = 0, d = -1, tgt = 0;
        if (A(T)) { p = f(T); d = FADE_ATTACK; tgt = a(T); }
        else if (A(T + 1)) { p = a(T) > 0 ? f(T) : 0; }
        else { const fa = a(T) > 0 ? f(T) : 0, fb = T + 1 < F && a(T + 1) > 0 ? f(T + 1) : 0; p = fa && fb ? Math.sqrt(fa * fb) : fb || fa; d = FADE_SMOOTH; tgt = T + 1 < F ? a(T + 1) : 0; }
        if (p) curP = p;
        const s1 = Math.min(n, s0 + HOP);
        let from = cur, to = cur, len = 0;
        if (d >= 0) { to = Math.max(tgt, SILENT); len = Math.max(1, d === FADE_ATTACK ? nA : nS); cur = to; }
        for (let i = s0; i < s1; i++) {
          ph += curP;
          const j = i - s0, env = len && j < len ? from + (to - from) * ((j + 1) / len) : to;
          out[i] += Math.sin(2 * Math.PI * ph / SR) * env;
        }
      }
    }
    return out;
  }
  function checkRenderNoise(col, F, loop, n) {
    const out = new Float64Array(n), nS = Math.floor(FADE_SMOOTH * SR);
    let cur = SILENT;
    for (let T = 0; T < F; T++) {
      const s0 = T * HOP; if (s0 >= n) break;
      const to = Math.max(T + 1 < F ? col[T + 1] : 0, SILENT), from = cur, s1 = Math.min(n, s0 + HOP);
      for (let i = s0; i < s1; i++) { const j = i - s0, env = j < nS ? from + (to - from) * ((j + 1) / nS) : to; out[i] = loop[i % loop.length] * env; }
      cur = to;
    }
    return out;
  }
  let nsimW = null;
  /** NSIM-lite (tools/spectral.py nsim_lite): ViSQOL's similarity core on an STFT filterbank, aligned signals */
  function nsimSpec(x, n) {
    const nw = Math.round(SR * 0.08), hop = nw >> 2, nfft = 4096, nb = 32;
    if (!nsimW) {
      const earQ = 9.26449, minBW = 24.7, hiF = SR / 2, loF = 50;
      const aa = -(earQ * minBW), bb = -Math.log(hiF + earQ * minBW), cc = Math.log(loF + earQ * minBW), dd = hiF + earQ * minBW, ee = (bb + cc) / nb;
      const cf = []; for (let i = 0; i < nb; i++) cf.push(aa + Math.exp((i + 1) * ee) * dd);
      cf.sort((p, q) => p - q);
      const W = cf.map((c) => { const erb = minBW + c / earQ, w = new Float64Array(nfft / 2 + 1); let s = 0; for (let k = 0; k <= nfft / 2; k++) { const fr = k * (SR / nfft); w[k] = Math.exp(-0.5 * ((fr - c) / (0.5 * erb)) ** 2); s += w[k]; } for (let k = 0; k <= nfft / 2; k++) w[k] /= s; return w; });
      const win = new Float64Array(nw); for (let i = 0; i < nw; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (nw - 1));
      nsimW = { W, win, nw, hop, nfft, nb };
    }
    const { W, win } = nsimW, m = 1 + Math.floor((n - nw) / hop), out = new Float64Array(nb * m);
    const re = new Float64Array(nfft), im = new Float64Array(nfft), P = new Float64Array(nfft / 2 + 1);
    for (let t = 0; t < m; t++) {
      re.fill(0); im.fill(0);
      for (let i = 0; i < nw; i++) re[i] = x[t * hop + i] * win[i];
      fft(re, im);
      for (let k = 0; k <= nfft / 2; k++) P[k] = re[k] * re[k] + im[k] * im[k];
      for (let b = 0; b < nb; b++) { let s = 0; const w = W[b]; for (let k = 0; k <= nfft / 2; k++) s += w[k] * P[k]; out[b * m + t] = Math.sqrt(s / nw); }
    }
    return { S: out, m };
  }
  function nsimLite(refSpec, test, n) {
    const { S: R0, m } = refSpec, D0 = nsimSpec(test, n).S, nb = 32, EPS = 2.220446049250313e-16;
    const r = new Float64Array(nb * m), d = new Float64Array(nb * m);
    for (let i = 0; i < nb * m; i++) { r[i] = Math.max(10 * Math.log10(R0[i] === 0 ? EPS : R0[i]), -45); d[i] = Math.max(10 * Math.log10(D0[i] === 0 ? EPS : D0[i]), -45); }
    for (let t = 0; t < m; t++) {
      let mx = -Infinity; for (let b = 0; b < nb; b++) mx = Math.max(mx, r[b * m + t], d[b * m + t]);
      const fl = mx - 45; for (let b = 0; b < nb; b++) { r[b * m + t] = Math.max(r[b * m + t], fl); d[b * m + t] = Math.max(d[b * m + t], fl); }
    }
    let low = Infinity; for (let i = 0; i < nb * m; i++) low = Math.min(low, r[i], d[i]);
    for (let i = 0; i < nb * m; i++) { r[i] -= low; d[i] -= low; }
    const w3 = [0.0113033910173052, 0.0838251475442633, 0.0113033910173052, 0.0838251475442633, 0.619485845753726, 0.0838251475442633, 0.0113033910173052, 0.0838251475442633, 0.0113033910173052];
    const conv = (fn) => { const o = new Float64Array(nb * m); for (let b = 0; b < nb; b++) for (let t = 0; t < m; t++) { let s = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const bb = Math.min(nb - 1, Math.max(0, b + i - 1)), tt = Math.min(m - 1, Math.max(0, t + j - 1)); s += fn(bb * m + tt) * w3[i * 3 + j]; } o[b * m + t] = s; } return o; };
    const mr = conv((i) => r[i]), md = conv((i) => d[i]), rr = conv((i) => r[i] * r[i]), dd2 = conv((i) => d[i] * d[i]), rd = conv((i) => r[i] * d[i]);
    const c1 = 0.01 ** 2, c3 = 0.03 ** 2 / 2;
    let tot = 0;
    for (let b = 0; b < nb; b++) {
      let rowSum = 0;
      for (let t = 0; t < m; t++) {
        const i = b * m + t, sr2 = rr[i] - mr[i] * mr[i], sd2 = dd2[i] - md[i] * md[i], srd = rd[i] - mr[i] * md[i];
        const inten = (2 * mr[i] * md[i] + c1) / (mr[i] * mr[i] + md[i] * md[i] + c1), sdd = sr2 * sd2;
        rowSum += inten * ((srd + c3) / (sdd < 0 ? c3 : Math.sqrt(Math.max(sdd, 0)) + c3));
      }
      tot += rowSum / m;
    }
    return tot / nb;
  }
  function chooseNoiseBands(x, F, N, M, fq, am, att, nz, gain, margin = NSIM_MARGIN) {
    const n = x.length, amQ = new Float64Array(F * N), fqQ = new Float64Array(F * N), nzQ = new Float64Array(F * M);
    for (let i = 0; i < F * N; i++) { amQ[i] = ampVal(ampCode(am[i] * gain)); fqQ[i] = amQ[i] > 0 && fq[i] > 0 ? pitchVal(pitchCode(fq[i])) : 0; }
    for (let i = 0; i < F * M; i++) nzQ[i] = nzVal(nzCode(nz[i] * gain));
    let cur = checkRenderSines(fqQ, amQ, att, F, N, n);
    let xs = 0; for (let i = 0; i < n; i++) xs += x[i] * x[i];
    const xr = Math.sqrt(xs / n + 1e-30), refSpec = nsimSpec(x, n);
    const score = (y) => { let ys = 0; for (let i = 0; i < n; i++) ys += y[i] * y[i]; const g = xr / Math.sqrt(ys / n + 1e-30), z = new Float64Array(n); for (let i = 0; i < n; i++) z[i] = y[i] * g; return nsimLite(refSpec, z, n); };
    let best = score(cur);
    const keep = new Array(M).fill(false);
    for (let b = M - 1; b >= 0; b--) {
      const col = new Float64Array(F); let any = false; for (let k = 0; k < F; k++) { col[k] = nzQ[k * M + b]; if (col[k] > 0) any = true; }
      if (!any) continue;
      const band = checkRenderNoise(col, F, checkNoise(NOISE_EDGES[b], NOISE_EDGES[b + 1], 65536, b + 1), n);
      const trial = new Float64Array(n); for (let i = 0; i < n; i++) trial[i] = cur[i] + band[i];
      const s2 = score(trial);
      if (s2 > best + margin) { best = s2; cur = trial; keep[b] = true; }
    }
    return { keep, best, cur };
  }
  function checkBurst(bnd, len) {
    const [lo, hi] = BURST_BANDS[bnd], y = checkNoise(lo, hi, 8192, 50 + bnd).slice(0, len), decay = [22, 45, 75][bnd];
    for (let i = 0; i < len; i++) { const t = i / SR; y[i] = y[i] * Math.exp(-t * decay) * Math.min(1, Math.max(0, t / 0.0015)); }
    const n10 = Math.floor(0.01 * SR); let s = 0; for (let i = 0; i < n10; i++) s += y[i] * y[i];
    const r = Math.sqrt(s / n10);
    for (let i = 0; i < len; i++) y[i] /= r;
    return y;
  }
  function chooseBursts(x, cur, events, gain, margin = NSIM_MARGIN) {
    const n = x.length, refSpec = nsimSpec(x, n);
    let xs = 0; for (let i = 0; i < n; i++) xs += x[i] * x[i];
    const xr = Math.sqrt(xs / n + 1e-30);
    const score = (y) => { let ys = 0; for (let i = 0; i < n; i++) ys += y[i] * y[i]; const g = xr / Math.sqrt(ys / n + 1e-30), z = new Float64Array(n); for (let i = 0; i < n; i++) z[i] = y[i] * g; return nsimLite(refSpec, z, n); };
    let best = score(cur);
    const keep = new Array(BURST_BANDS.length).fill(false), nb = Math.floor(0.12 * SR);
    for (let b = BURST_BANDS.length - 1; b >= 0; b--) {
      const evb = events.filter((e) => e[2] === b); if (!evb.length) continue;
      const unit = checkBurst(b, nb), trial = Float64Array.from(cur);
      for (const [k, sub, , a] of evb) {
        const s0 = k * HOP + Math.floor((sub * HOP) / SUB); if (s0 >= n) continue;
        const m = Math.min(nb, n - s0), v = nzVal(nzCode(a * gain));
        for (let i = 0; i < m; i++) trial[s0 + i] += unit[i] * v;
      }
      const s2 = score(trial);
      if (s2 > best + margin) { best = s2; cur = trial; keep[b] = true; }
    }
    return { keep, best };
  }

  // ---------------------------------------------------------------- whole conversion
  /** x: Float32Array mono at 44.1 kHz. progress(fraction) may be async-awaited to keep a page responsive. */
  async function convert(x, opts = {}) {
    // (refine, default on as tools/spectral.py: the analysis by synthesis through the client model takes about half the time,
    // so the stages before it report 0 .. REFINE_SHARE and it the rest)
    const refineOn = opts.refine ?? true, progress0 = opts.progress ?? (() => {});
    const N = opts.voices ?? 48, hyst = 2.0, progress = refineOn ? (f) => progress0(f * REFINE_SHARE) : progress0, analysis = opts.analysis ?? 'v2';
    const residual = opts.residual ?? 'voiced', salienceKind = opts.salience ?? 'a';   // tools/spectral.py convert(residual=, salience=, nested=, hf=): the same defaults
    const nested = opts.nested ?? 0, hfLimit = opts.hf ?? 0;
    let groups = null;
    const allPeaks = [];
    const F = Math.ceil(x.length / HOP) + 1, M = NOISE_EDGES.length - 1;
    const res = RES.map(makeRes);
    const fq = new Float64Array(F * N), am = new Float64Array(F * N), att = new Uint8Array(F * N), nz = new Float64Array(F * M);
    let prevF = new Float64Array(N), prevA = new Float64Array(N), sal = new Float64Array(N);
    const PE = analysis === 'v2' && (residual === 'fit' || salienceKind === 'erb') ? new Float64Array(F * ERB_N) : null;   // ERB band power per frame
    for (let k = 0; k < F; k++) {
      const pk = [];
      for (const R of res) { spectrum(R, x, k); peaksOf(R, pk); if (PE) erbAdd(R, PE, k); }
      pk.sort((a, b) => b[1] - a[1]); pk.length = Math.min(pk.length, MAX_PER_FRAME);
      if (analysis === 'v2') {
        allPeaks.push(pk);
        // ---- stochastic residual of this frame (tools/spectral.py stochastic_residual): every peak's main lobe removed
        const pwb = new Float64Array(M);
        for (const R of res) {
          const row = R.pw, scale = 2 / (R.nfft * R.sw2), saved = [];
          for (const p of pk) {
            const b = Math.round(p[0] / R.binhz);
            for (let i = Math.max(b - R.ml, 0); i <= Math.min(b + R.ml, R.nb - 1); i++) { if (row[i] !== 0) { saved.push(i, row[i]); row[i] = 0; } }
          }
          for (let bi = 0; bi < M; bi++) {
            const blo = Math.max(NOISE_EDGES[bi], R.flo), bhi = Math.min(NOISE_EDGES[bi + 1], R.fhi);
            if (bhi <= blo) continue;
            let s2 = 0; for (let i = Math.floor(blo / R.binhz); i < Math.floor(bhi / R.binhz); i++) s2 += row[i];
            pwb[bi] += s2 * scale;
          }
        }
        for (let bi = 0; bi < M; bi++) nz[k * M + bi] = Math.sqrt(Math.max(pwb[bi], 0)) * (NOISE_EDGES[bi + 1] <= 720 ? 0.5 : 1);
        if ((k & 15) === 15) await progress((0.6 * k) / F);
        continue;
      }
      // ---- allocation (tools/spectral.py allocate)
      const cands = maskAndRank(pk).slice(0, 3 * N), used = new Uint8Array(cands.length);
      const curF = new Float64Array(N), curA = new Float64Array(N), curS = new Float64Array(N);
      const byS = [...Array(N).keys()].sort((i, j) => sal[j] - sal[i] || i - j);
      for (const v of byS) {
        if (prevA[v] <= 0) continue;
        let best = -1, bc = 1e9; const dev = Math.max(60, cents(prevF[v] + 9, prevF[v]));
        for (let i = 0; i < cands.length; i++) {
          if (used[i]) continue;
          const dc = Math.abs(cents(cands[i][0], prevF[v])); if (dc > dev) continue;
          const cost = dc + 3 * Math.abs(20 * Math.log10(cands[i][1] / prevA[v]));
          if (cost < bc) { best = i; bc = cost; }
        }
        if (best >= 0) { used[best] = 1; [curF[v], curA[v], curS[v]] = cands[best]; }
      }
      const free = []; for (let v = 0; v < N; v++) if (prevA[v] <= 0) free.push(v);
      const weakest = [...Array(N).keys()].filter((v) => curA[v] > 0).sort((i, j) => curS[i] - curS[j] || i - j);
      for (let i = 0; i < cands.length; i++) {
        if (used[i]) continue;
        const [f, a, s] = cands[i];
        if (free.length) { const v = free.shift(); curF[v] = f; curA[v] = a; curS[v] = s; used[i] = 1; att[k * N + v] = 1; }
        else if (weakest.length && s > hyst * curS[weakest[0]]) { const v = weakest.shift(); curF[v] = 0; curA[v] = 0; curS[v] = 0; }
      }
      for (let v = 0; v < N; v++) {
        if (prevA[v] > 0 && curA[v] > prevA[v] * 2.8) att[k * N + v] = 1;
        fq[k * N + v] = curF[v]; am[k * N + v] = curA[v];
      }
      const nf = new Float64Array(N); for (let v = 0; v < N; v++) nf[v] = curA[v] > 0 ? curF[v] : prevF[v];
      prevF = nf; prevA = curA; sal = curS;
      // ---- residual noise of this frame (voiced main lobes removed in every resolution)
      const pwb = new Float64Array(M);
      for (const R of res) {
        const row = R.pw, scale = 2 / (R.nfft * R.sw2);
        const saved = [];
        for (let v = 0; v < N; v++) {
          if (curA[v] <= 0) continue;
          const b = Math.round(curF[v] / R.binhz);
          for (let i = Math.max(b - R.ml, 0); i <= Math.min(b + R.ml, R.nb - 1); i++) { if (row[i] !== 0) { saved.push(i, row[i]); row[i] = 0; } }
        }
        for (let bi = 0; bi < M; bi++) {
          const blo = Math.max(NOISE_EDGES[bi], R.flo), bhi = Math.min(NOISE_EDGES[bi + 1], R.fhi);
          if (bhi <= blo) continue;
          let s = 0; for (let i = Math.floor(blo / R.binhz); i < Math.floor(bhi / R.binhz); i++) s += row[i];
          pwb[bi] += s * scale;
        }
      }
      for (let bi = 0; bi < M; bi++) nz[k * M + bi] = Math.sqrt(Math.max(pwb[bi], 0)) * (NOISE_EDGES[bi + 1] <= 720 ? 0.5 : 1);
      if ((k & 15) === 15) await progress((0.85 * k) / F);
    }
    let placedN = 0;
    if (analysis === 'v2') {
      const tracks = trackPartials(allPeaks);
      const median = (a) => { const b = [...a].sort((p, q) => p - q), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
      if (nested && nested < N) groups = [[0, nested, (ti) => !hfLimit || median(tracks[ti].f) < hfLimit], [nested, N, null]];
      const ch = chooseTracks(tracks, F, N, MIN_TRACK, 1, salienceKind === 'erb' ? erbSalience(tracks, PE, F) : null, groups);
      fq.set(ch.fq); am.set(ch.am); att.set(ch.att); placedN = ch.placed;
      await progress(0.7);
    } else {
      // swells are not attacks
      for (let k = 0; k < F - 1; k++) for (let v = 0; v < N; v++) if (att[k * N + v] && am[(k + 1) * N + v] > am[k * N + v] * 1.6) att[k * N + v] = 0;
    }
    // most energetic voices first
    const energy = new Float64Array(N); for (let k = 0; k < F; k++) for (let v = 0; v < N; v++) energy[v] += am[k * N + v] ** 2;
    const byE = (a) => a.sort((i, j) => energy[j] - energy[i] || i - j);
    const order = groups ? [...byE([...Array(nested).keys()]), ...byE([...Array(N - nested).keys()].map((i) => i + nested))] : byE([...Array(N).keys()]);
    const P = (src, T) => { const o = new T(F * N); for (let k = 0; k < F; k++) for (let v = 0; v < N; v++) o[k * N + v] = src[k * N + order[v]]; return o; };
    const fq2 = P(fq, Float64Array), am2 = P(am, Float64Array), att2 = P(att, Uint8Array);
    await progress(0.75);
    let ev = [], noiseBands = null, nsimBest = null, burstBands = null;
    if (analysis === 'v2') {
      if (residual === 'fit') nz.set(fitNoise(PE, fq2, am2, F, N, NOISE_EDGES));
      else if (residual === 'voiced') {
        // tools/spectral.py residual_noise: the band power with the main lobes of the VOICES only taken out (a second pass over
        // the frames: the unvoiced peaks stay in the noise), bands under 720 Hz x 0.5
        for (let k = 0; k < F; k++) {
          const pwb = new Float64Array(M);
          for (const R of res) {
            spectrum(R, x, k);
            const row = R.pw, scale = 2 / (R.nfft * R.sw2);
            for (let v = 0; v < N; v++) {
              if (am2[k * N + v] <= 0) continue;
              const b = Math.round(fq2[k * N + v] / R.binhz);
              for (let i = Math.max(b - R.ml, 0); i <= Math.min(b + R.ml, R.nb - 1); i++) row[i] = 0;
            }
            for (let bi = 0; bi < M; bi++) {
              const blo = Math.max(NOISE_EDGES[bi], R.flo), bhi = Math.min(NOISE_EDGES[bi + 1], R.fhi);
              if (bhi <= blo) continue;
              let s2 = 0; for (let i = Math.floor(blo / R.binhz); i < Math.floor(bhi / R.binhz); i++) s2 += row[i];
              pwb[bi] += s2 * scale;
            }
          }
          for (let bi = 0; bi < M; bi++) nz[k * M + bi] = Math.sqrt(Math.max(pwb[bi], 0)) * (NOISE_EDGES[bi + 1] <= 720 ? 0.5 : 1);
          if ((k & 15) === 15) await progress(0.7 + (0.05 * k) / F);
        }
      }
      let pk0 = 1e-9;
      for (let k = 0; k < F; k++) { let s2 = 0; for (let v = 0; v < N; v++) s2 += am2[k * N + v] * 0.55; for (let b = 0; b < M; b++) s2 += nz[k * M + b]; pk0 = Math.max(pk0, s2); }
      const g0 = (0.9 / pk0) * Math.pow(10, (opts.gainDb ?? 0) / 20);
      const r = chooseNoiseBands(x, F, N, M, fq2, am2, att2, nz, g0);
      for (let b = 0; b < M; b++) if (!r.keep[b]) for (let k = 0; k < F; k++) nz[k * M + b] = 0;
      noiseBands = r.keep.map((x) => (x ? '1' : '0')).join(''); nsimBest = r.best;
      const all = onsets(x, F), rb = chooseBursts(x, r.cur, all, g0);
      ev = all.filter((e) => rb.keep[e[2]]);
      burstBands = rb.keep.map((x) => (x ? '1' : '0')).join(''); if (rb.best > nsimBest) nsimBest = rb.best;
    } else ev = onsets(x, F);
    await progress(0.9);
    // (tools/spectral.py nz_fade: the bands' fades follow the 10 ms envelope; the bursts' energy stays in the noise)
    let nzd = null, vd = null, fs = null;
    // (default on, as tools/spectral.py: v_fade / nz_fade false turns them off)
    if (opts.v_fade ?? true) { fs = fineSpec(x, F); vd = fitVoiceFades(fs, fq2, am2, F, N); }
    if (opts.nz_fade ?? true) { nzd = fitNoiseFades(fs ?? fineSpec(x, F), nz, F, M); ev = []; }
    for (const [k, , b, a] of ev) {
      const [lo, hi] = BURST_BANDS[b], e = a * a * 0.35;
      for (let bi = 0; bi < M; bi++) if (NOISE_EDGES[bi] < hi && NOISE_EDGES[bi + 1] > lo && k < F) nz[k * M + bi] = Math.sqrt(Math.max(nz[k * M + bi] ** 2 - e / 3, 0));
    }
    let peak = 1e-9;
    for (let k = 0; k < F; k++) { let s = 0; for (let v = 0; v < N; v++) s += am2[k * N + v] * 0.55; for (let b = 0; b < M; b++) s += nz[k * M + b]; peak = Math.max(peak, s); }
    const gain = (0.9 / peak) * Math.pow(10, (opts.gainDb ?? 0) / 20);
    let refined = null;
    if (refineOn && vd && nzd) {
      // analysis by synthesis through the client model (tools/spectral.py refine_client): every tick's levels and fades
      const unpack = (packed, n) => { const per4 = (n + 3) >> 2, c = new Uint8Array(F * n); for (let k = 0; k < F; k++) for (let j = 0; j < n; j++) c[k * n + j] = (packed[k * per4 + (j >> 2)] >> (2 * (j & 3))) & 3; return c; };
      const vc = unpack(vd, N), nc = unpack(nzd, M);
      // (the options also by tools/spectral.py's names, for tools/parity.py)
      refined = await refineClient(x, F, N, M, fq2, am2, vc, nz, nc, gain, { voices: opts.refineVoices ?? opts.refine_voices, level: opts.refineLevel ?? opts.refine_level,
        sweeps: opts.refineSweeps ?? opts.refine_sweeps, weights: opts.refineWeights ?? opts.refine_weights, objective: opts.refineObjective ?? opts.refine_objective,
        hold: opts.refineHold ?? opts.refine_hold,
        progress: (f) => progress0(REFINE_SHARE + (1 - REFINE_SHARE) * f) });
      vd = pack2(vc, F, N); nzd = pack2(nc, F, M);
    }
    const enc = encode(F, N, M, fq2, am2, att2, nz, ev, gain);
    await progress0(1);
    const meta = {
      format: 'spectral-player/1', title: opts.title ?? 'song', artist: opts.artist ?? '', fps: FPS, frames: F, voices: N, base: BASE,
      noise: NOISE_EDGES.slice(0, -1).map((e, i) => [e, NOISE_EDGES[i + 1]]), bursts: BURST_BANDS.length, sub: SUB,
      seconds: Math.round((x.length / SR) * 100) / 100, amp: [AMP_FLOOR_DB, AMP_STEP_DB], nz: [NZ_FLOOR_DB, NZ_STEP_DB], analysis, id: opts.id ?? 'song',
    };
    // format 2 (tools/spectral.py): the fitted fades after the frames in the data, their lengths in meta.fd
    if (nzd || vd) {
      meta.format = 'spectral-player/2';
      meta.fd = { ms: NZ_FADES_MS, v: vd ? vd.length : 0, nz: nzd ? nzd.length : 0 };
      const all = new Uint8Array(enc.bytes.length + meta.fd.v + meta.fd.nz);
      all.set(enc.bytes, 0); if (vd) all.set(vd, enc.bytes.length); if (nzd) all.set(nzd, enc.bytes.length + meta.fd.v);
      enc.bytes = all;
    }
    return { meta, bytes: enc.bytes, stats: { ...enc.stats, events: ev.length, activeAvg: avgActive(am2, F, N), noiseBands, burstBands, nsimLite: nsimBest, placed: placedN, ...(refined ? { refineLoss: refined.loss, refineChanges: refined.changes } : {}) } };
  }
  const avgActive = (am, F, N) => { let c = 0; for (let i = 0; i < F * N; i++) if (am[i] > 0) c++; return c / F; };

  // ---------------------------------------------------------------- the noise bands' fades (tools/spectral.py fit_noise_fades)
  const NZ_FADES_MS = [5, 12, 25, 50], FINE_HOP = 441, FINE_NFFT = 1024, FADE_GAIN = 0.9, FADE_MARGIN_DB2 = 1.0;
  /** per tick and noise band one fade(d, v), linear from where the band is to v over d ms and then held, chosen to follow the
   *  band's 10 ms envelope over the tick; returns the fade codes packed 2 bits a band, 4 bands a byte (nz is changed in place:
   *  nz[k+1] = v of tick k) */
  /** the 10 ms STFT power (20 ms Hann, zero-padded to FINE_NFFT) of x: nfine frames x nb bins */
  function fineSpec(x, F) {
    const nw = 2 * FINE_HOP, per = HOP / FINE_HOP, nfine = F * per + per + 2, nb = FINE_NFFT / 2 + 1;
    const w = new Float64Array(nw); for (let i = 0; i < nw; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (nw - 1));
    const P = new Float64Array(nfine * nb), re = new Float64Array(FINE_NFFT), im = new Float64Array(FINE_NFFT);
    for (let j = 0; j < nfine; j++) {
      re.fill(0); im.fill(0);
      const c = j * FINE_HOP - nw / 2;
      for (let i = 0; i < nw; i++) { const t = c + i; re[i] = t >= 0 && t < x.length ? x[t] * w[i] : 0; }
      fft(re, im);
      for (let i = 0; i < nb; i++) P[j * nb + i] = re[i] * re[i] + im[i] * im[i];
    }
    return { P, nfine, nb, per };
  }
  const fadeL = (a) => 20 * Math.log10(Math.max(a, 1e-7));
  const fadeInterp = (t, ys) => { if (t <= 0) return ys[0]; if (t >= ys.length - 1) return ys[ys.length - 1]; const i = Math.floor(t), f = t - i; return ys[i] + (ys[i + 1] - ys[i]) * f; };
  /** one tick's fade: from cur, the longest of NZ_FADES_MS unless a shorter one follows the 5 points tgt[q0+1..q0+5] clearly better */
  function fitTick(r, q0, per, cur) {
    let best = null;
    for (let ci = NZ_FADES_MS.length - 1; ci >= 0; ci--) {       // the longest fade first: a shorter one must follow clearly better
      const d = NZ_FADES_MS[ci] / 1000;
      let sl = 0, nl = 0;
      for (let q = 1; q <= per; q++) if (q * (FINE_HOP / SR) >= d - 1e-9) { sl += fadeL(r[q0 + q]); nl++; }
      const v = Math.pow(10, (nl ? sl / nl : fadeL(r[q0 + per])) / 20);
      let err = 0;
      for (let q = 1; q <= per; q++) {
        const t = q * (FINE_HOP / SR), g = cur + (v - cur) * Math.min(1, t / d), dd = fadeL(g) - fadeL(r[q0 + q]);
        err += dd * dd;
      }
      if (best === null || err < best[0] * FADE_GAIN - FADE_MARGIN_DB2) best = [err, ci, v];
    }
    return best;
  }
  const pack2 = (codes, F, n) => {
    const per4 = (n + 3) >> 2, packed = new Uint8Array(F * per4);
    for (let k = 0; k < F; k++) for (let j = 0; j < n; j++) packed[k * per4 + (j >> 2)] |= codes[k * n + j] << (2 * (j & 3));
    return packed;
  };
  /** tools/spectral.py fit_voice_fades: am changed in place (am[k+1] = v of tick k), the codes packed */
  function fitVoiceFades(fs, fq, am, F, N) {
    const { P, nfine, nb, per } = fs, binhz = SR / FINE_NFFT;
    const codes = new Uint8Array(F * N).fill(3);
    const a = new Float64Array(F), a2 = new Float64Array(F), E = new Float64Array(nfine), Ef = new Float64Array(F), r = new Float64Array(nfine);
    for (let v = 0; v < N; v++) {
      let any = false;
      for (let k = 0; k < F; k++) { a[k] = am[k * N + v]; a2[k] = a[k] * a[k]; if (a[k] > 0) any = true; }
      if (!any) continue;
      for (let j = 0; j < nfine; j++) {
        const fr = Math.min(F - 1, Math.round(j / per));
        if (a[fr] > 0) {
          const bi = Math.max(1, Math.min(nb - 2, Math.round(fq[fr * N + v] / binhz)));
          E[j] = P[j * nb + bi - 1] + P[j * nb + bi] + P[j * nb + bi + 1] + 1e-20;
        } else E[j] = 0 + 1e-20;
      }
      for (let k = 0; k < F; k++) { let s = 0, c = 0; for (let j = Math.max(0, k * per - 2); j < k * per + 3; j++) { s += E[j]; c++; } Ef[k] = s / c; }
      for (let j = 0; j < nfine; j++) { const tf = j / per; r[j] = Math.sqrt(Math.max((E[j] / fadeInterp(tf, Ef)) * fadeInterp(tf, a2), 0)); }
      let cur = 0;
      for (let k = 0; k < F - 1; k++) {
        if (a[k + 1] <= 0) { cur = 0; continue; }
        const best = fitTick(r, k * per, per, cur);
        codes[k * N + v] = best[1]; am[(k + 1) * N + v] = best[2]; cur = best[2];
      }
    }
    return pack2(codes, F, N);
  }
  function fitNoiseFades(fs, nz, F, M) {
    const { P, nfine, nb, per } = fs, binhz = SR / FINE_NFFT;
    const codes = new Uint8Array(F * M);
    const L = fadeL, interp = fadeInterp;
    for (let b = 0; b < M; b++) {
      let any = false; for (let k = 0; k < F; k++) if (nz[k * M + b] > 0) { any = true; break; }
      if (!any) continue;
      const i0 = Math.floor(NOISE_EDGES[b] / binhz), i1 = Math.max(i0 + 1, Math.floor(NOISE_EDGES[b + 1] / binhz));
      const e = new Float64Array(nfine);
      for (let j = 0; j < nfine; j++) { let s = 0; for (let i = i0; i < i1; i++) s += P[j * nb + i]; e[j] = s + 1e-20; }
      const ef = new Float64Array(F), n2 = new Float64Array(F);
      for (let k = 0; k < F; k++) {
        let s = 0, c = 0; for (let j = Math.max(0, k * per - 2); j < k * per + 3; j++) { s += e[j]; c++; }
        ef[k] = s / c; n2[k] = nz[k * M + b] * nz[k * M + b];
      }
      const r = new Float64Array(nfine);
      for (let j = 0; j < nfine; j++) { const tf = j / per; r[j] = Math.sqrt(Math.max((e[j] / interp(tf, ef)) * interp(tf, n2), 0)); }
      let cur = nz[b];
      for (let k = 0; k < F - 1; k++) {
        const best = fitTick(r, k * per, per, cur);
        codes[k * M + b] = best[1]; nz[(k + 1) * M + b] = best[2]; cur = best[2];
      }
    }
    return pack2(codes, F, M);
  }

  // ---------------------------------------------------------------- analysis by synthesis through the client model
  // (tools/spectral.py refine_client, line for line: the song as the phone plays it — its 24 voices and the noise bands, +6 dB,
  // the engine's send rules, the 24 kHz mix with its folding, x2 linear, the 16-bit floor — measured in ViSQOL's 32 gammatone
  // bands against the original, each tick's level and fade of every sound chosen to bring them closest; the squared
  // difference counted in whole 1/64ths of a dB, so both converters choose the same)
  const CL_VOICES = 24, CL_LEVEL_DB = 6, CL_OSC_AMP = 0.9, CL_SILENT = 1e-4, CL_SEND_DB = 0.75, CL_SEND_CENTS = 3;
  const CL_NOISE_RMS = [0.181311, 0.180788, 0.179998, 0.179116, 0.178403, 0.177544, 0.177018, 0.175986], NOISE_RMS_ALL = 0.18;
  const CL_OUT_DB = -32.5, CL_BITS = 16, CL_TICK = 50, CL_HOP = 20, CL_WIN = 80, CL_Q = 64, CL_FLOOR = 45, CL_SWEEPS = 5;
  const CL_VSTEPS = [-12, -8, -6, -4, -3, -2, -1, 0, 1, 2, 3, 4], CL_NSTEPS = [-16, -12, -8, -6, -4, -2, 0, 2, 4, 6];
  const CL_WEIGHTS = new Array(32).fill(1000), REFINE_SHARE = 0.45, CL_OBJECTIVE = 'nsim', CL_WEIGHTS_DEFAULT = 'svr', CL_HOLD = true;
  const CL_WEIGHT_SETS = { svr: [100, 70, 50, 50, 50, 50, 70, 80, 70, 70, 70, 70, 70, 60, 60, 60, 60, 60, 60, 50, 50, 50, 50, 120, 330, 390, 480, 560, 570, 460, 390, 280], uni: CL_WEIGHTS };
  const CL_W3 = [[0.0113033910173052, 0.0838251475442633, 0.0113033910173052], [0.0838251475442633, 0.619485845753726, 0.0838251475442633],
    [0.0113033910173052, 0.0838251475442633, 0.0113033910173052]];
  const CL_C1 = 0.01 * 0.01, CL_C3 = (0.03 * 0.03) / 2;
  /** tools/spectral.py nsim_valid, in two halves: nsimRef once for the reference map r (rows x cols, Float64Array row-major)
   *  -> its 3x3 means and variances over the inner (rows-2) x (cols-2); nsimSum for a map d against it -> ViSQOL's NSIM of each
   *  inner cell, weighted per inner row by ws and summed row by row in order. Every sum in the order of tools/spectral.py */
  const W3f = CL_W3.flat();
  function nsimRef(r, rows, cols) {
    const R = rows - 2, C = cols - 2, mr = new Float64Array(R * C), sr2 = new Float64Array(R * C);
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      let m = 0, q2 = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { const q = (i + a) * cols + j + b, w = W3f[a * 3 + b]; m = m + r[q] * w; q2 = q2 + (r[q] * r[q]) * w; }
      mr[i * C + j] = m; sr2[i * C + j] = q2 - m * m;
    }
    return { r, rows, cols, mr, sr2 };
  }
  function nsimSum(ref, d, ws) {
    const { r, rows, cols, mr, sr2 } = ref, R = rows - 2, C = cols - 2;
    let acc = 0;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      let md = 0, qd = 0, qrd = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const q = (i + a) * cols + j + b, w = W3f[a * 3 + b], dv = d[q];
        md = md + dv * w; qd = qd + (dv * dv) * w; qrd = qrd + (r[q] * dv) * w;
      }
      const m = mr[i * C + j], sd2 = qd - md * md, srd = qrd - m * md;
      const inten = (2 * m * md + CL_C1) / (m * m + md * md + CL_C1), sdd = sr2[i * C + j] * sd2;
      const struct = (srd + CL_C3) / (sdd < 0 ? CL_C3 : Math.sqrt(Math.max(sdd, 0)) + CL_C3);
      acc = acc + ws[i] * (inten * struct);
    }
    return acc;
  }
  const nsimValidSum = (r, d, rows, cols, ws) => nsimSum(nsimRef(r, rows, cols), d, ws);
  const f32 = Math.fround;
  /** |H_j(f)|^2 of ViSQOL's 32 gammatone filters (48 kHz, from 50 Hz, the centre at 1), row 0 the lowest: Float64Array(32 * n) */
  function gtH2(freqs) {
    const sr = 48000, T = 1 / sr, nb = 32, n = freqs.length, earQ = 9.26449, minBW = 24.7;
    const a = -(earQ * minBW), b = -Math.log(sr / 2 + earQ * minBW), c = Math.log(50 + earQ * minBW), d = sr / 2 + earQ * minBW, e = (b + c) / nb;
    const s1 = Math.sqrt(3 + 2 ** 1.5), s2 = Math.sqrt(3 - 2 ** 1.5);
    const co = new Float64Array(n), si = new Float64Array(n);
    for (let i = 0; i < n; i++) { const om = (2 * Math.PI * freqs[i]) / sr; co[i] = Math.cos(om); si[i] = Math.sin(om); }
    const mag2 = (A1s, B1, B2, cs, sn) => {
      let num = 1;
      for (const A1 of A1s) num = num * (T * T + A1 * A1 + 2 * T * A1 * cs);
      const dr = (1 + B2) * cs + B1, di = (1 - B2) * sn, den = dr * dr + di * di;
      return num / (den * den * den * den);
    };
    const out = new Float64Array(nb * n);
    for (let i = 0; i < nb; i++) {
      const cf = a + Math.exp((i + 1) * e) * d, erb = cf / earQ + minBW, B = 1.019 * 2 * Math.PI * erb, ebt = Math.exp(B * T);
      const B1 = (-2 * Math.cos(2 * cf * Math.PI * T)) / ebt, B2 = Math.exp(-2 * B * T);
      const b1 = Math.sin(cf * 2 * Math.PI * T) * T, bp = b1 * 2 * s1, bn = b1 * 2 * s2, aa = Math.cos(cf * 2 * Math.PI * T) * 2 * T;
      const A1s = [-(aa / ebt + bp / ebt) / 2, -(aa / ebt - bp / ebt) / 2, -(aa / ebt + bn / ebt) / 2, -(aa / ebt - bn / ebt) / 2];
      const oc = (2 * Math.PI * cf) / sr, g2 = mag2(A1s, B1, B2, Math.cos(oc), Math.sin(oc)), row = (nb - 1 - i) * n;
      for (let k = 0; k < n; k++) out[row + k] = mag2(A1s, B1, B2, co[k], si[k]) / g2;
    }
    return out;
  }
  /** the measured client path as band responses (tools/spectral.py ClientModel) */
  function clientModel(edges) {
    const sr = 48000, L = 3840, w2 = new Float64Array(CL_WIN);
    for (let u = 0; u < CL_WIN; u++) { let s = 0; for (let i = u * 48; i < u * 48 + 48; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1)); s += w * w; } w2[u] = s / 48; }
    let mw = 0; for (let u = 0; u < CL_WIN; u++) mw += w2[u];
    const mw2 = mw / CL_WIN, df = 2, NG = 6001;
    const g = new Float64Array(NG), gm = new Float64Array(NG), c4 = new Float64Array(NG), s4 = new Float64Array(NG);
    for (let i = 0; i < NG; i++) { g[i] = i * df; gm[i] = 24000 - g[i]; c4[i] = Math.cos((Math.PI * g[i]) / sr) ** 4; s4[i] = Math.sin((Math.PI * g[i]) / sr) ** 4; }
    const Hd = gtH2(g), Hi = gtH2(gm), M = edges.length - 1, noise = [], noiseTot = new Float64Array(M);
    const NF = 12001, full = new Float64Array(NF); for (let i = 0; i < NF; i++) full[i] = i * df;
    for (let bnd = 0; bnd < M; bnd++) {
      const lo = edges[bnd], hi = edges[bnd + 1], S2 = new Float64Array(NF);
      for (let i = 0; i < NF; i++) {
        let e = 1;
        for (const [cc, dd] of [[lo, -1], [hi, 1]]) {
          const oc = Math.log2(Math.max(full[i], 1) / cc) * dd;
          e = e * (oc < -1 / 12 ? 1 : oc > 1 / 12 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (oc + 1 / 12) * 6));
        }
        S2[i] = e * e;
      }
      S2[0] = 0;
      let tot = 0; for (let i = 0; i < NF; i++) tot += S2[i];
      for (let i = 0; i < NF; i++) S2[i] = S2[i] / tot;
      const Mg = new Float64Array(NG); for (let i = 0; i < NG; i++) Mg[i] = S2[i] + S2[12000 - i];
      const row = new Float64Array(32);
      for (let j = 0; j < 32; j++) {
        let sd = 0, si2 = 0;
        for (let i = 0; i < NG; i++) sd += Hd[j * NG + i] * (Mg[i] * c4[i]);
        for (let i = 0; i < NG; i++) si2 += Hi[j * NG + i] * (Mg[i] * s4[i]);
        row[j] = sd + si2;
      }
      noise.push(row);
      let nt = 0; for (let i = 0; i < NG; i++) nt += Mg[i] * (c4[i] + s4[i]);
      noiseTot[bnd] = nt;
    }
    const q = (2 ** (1 - CL_BITS)) ** 2 / 12 / Math.pow(10, CL_OUT_DB / 10), Ho = gtH2(full), qfloor = new Float64Array(32);
    for (let j = 0; j < 32; j++) {
      let sd = 0, si2 = 0, so = 0;
      for (let i = 0; i < NG; i++) sd += Hd[j * NG + i] * c4[i];
      for (let i = 0; i < NG; i++) si2 += Hi[j * NG + i] * s4[i];
      for (let i = 0; i < NF; i++) so += Ho[j * NF + i];
      qfloor[j] = (q / 12000 * df) * (sd + si2) + (q / 24000 * df) * so;
    }
    let cs = 0; for (let i = 0; i < NG; i++) cs += c4[i] + s4[i];
    const qfloorTot = (q * cs) / NG + q;
    /** a sine of amplitude 1 at f Hz: [band power (32), full-band power] */
    const sine = (f) => {
      if (f <= 0) return [new Float64Array(32), 0];
      const fp = f <= 12000 ? f : 24000 - f, cc = Math.cos((Math.PI * fp) / 48000) ** 4, ss = Math.sin((Math.PI * fp) / 48000) ** 4;
      const h = gtH2([fp, 24000 - fp]), out = new Float64Array(32);
      for (let j = 0; j < 32; j++) out[j] = 0.5 * (cc * h[j * 2] + ss * h[j * 2 + 1]);
      return [out, 0.5 * (cc + ss)];
    };
    return { w2, mw2, noise, noiseTot, qfloor, qfloorTot, sine };
  }
  /** the original in ViSQOL's bands (tools/spectral.py target_bands): { R: Float64Array(32 * nfr), nfr } */
  function targetBands(x) {
    const L = Math.round(SR * 0.08), hop = Math.round(SR * 0.02), nfft = 4096, nb = nfft / 2 + 1;
    const nfr = x.length >= L ? 1 + Math.floor((x.length - L) / hop) : 0;
    const w = new Float64Array(L); for (let i = 0; i < L; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1));
    const fb = new Float64Array(nb); for (let i = 0; i < nb; i++) fb[i] = i * (SR / nfft);
    const H = gtH2(fb); for (let j = 0; j < 32; j++) { H[j * nb] = 0; H[j * nb + nb - 1] = 0; }
    const R = new Float64Array(32 * nfr), re = new Float64Array(nfft), im = new Float64Array(nfft), P = new Float64Array(nb), sc = 2 / (L * nfft);
    for (let m = 0; m < nfr; m++) {
      re.fill(0); im.fill(0);
      for (let i = 0; i < L; i++) re[i] = x[m * hop + i] * w[i];
      fft(re, im);
      for (let i = 0; i < nb; i++) P[i] = re[i] * re[i] + im[i] * im[i];
      for (let j = 0; j < 32; j++) { let s = 0; for (let i = 0; i < nb; i++) s += P[i] * H[j * nb + i]; R[j * nfr + m] = sc * s; }
    }
    return { R, nfr };
  }
  const qdb = (P, s2) => Math.floor(CL_Q * 5 * Math.log10(Math.max(P * s2, 1e-30)) + 0.5);
  /** tools/spectral.py refine_client: am (F*N) and nz (F*M) changed in place (the converter's levels, before gain); vcodes
   *  (F*N) and ncodes (F*M) the fade codes, changed in place. Returns { loss: [...], changes: [...] } */
  async function refineClient(x, F, N, M, fq, am, vcodes, nz, ncodes, gain, opts = {}) {
    const progress = opts.progress ?? (() => {});
    const Nc = Math.min(opts.voices ?? CL_VOICES, N), lv = Math.pow(10, (opts.level ?? CL_LEVEL_DB) / 20), sweeps = opts.sweeps ?? CL_SWEEPS;
    const cm = clientModel(NOISE_EDGES), gv = (1 * lv) / CL_OSC_AMP;
    const nrms = M === CL_NOISE_RMS.length ? CL_NOISE_RMS : new Array(M).fill(NOISE_RMS_ALL);
    const dsend = Math.pow(10, CL_SEND_DB / 20), csend = Math.pow(2, CL_SEND_CENTS / 1200) - 1, fades = NZ_FADES_MS.map((d) => d);
    const amc = new Int32Array(F * Nc), nzc = new Int32Array(F * M);
    for (let k = 0; k < F; k++) { for (let v = 0; v < Nc; v++) amc[k * Nc + v] = ampCode(am[k * N + v] * gain); for (let b = 0; b < M; b++) nzc[k * M + b] = nzCode(nz[k * M + b] * gain); }
    const vcod = new Int32Array(F * Nc); for (let k = 0; k < F; k++) for (let v = 0; v < Nc; v++) vcod[k * Nc + v] = vcodes[k * N + v];
    const ncod = Int32Array.from(ncodes);
    const aval = new Float64Array(128), nval = new Float64Array(256);
    for (let c = 1; c < 128; c++) aval[c] = f32(ampVal(c));
    for (let c = 1; c < 256; c++) nval[c] = f32(nzVal(c));
    const S = Nc + M, floor = new Float64Array(S);
    for (let s = 0; s < S; s++) floor[s] = s < Nc ? CL_SILENT * CL_OSC_AMP : CL_SILENT * nrms[s - Nc];
    const levelOf = (s, c) => {
      if (s < Nc) { const L = Math.min(10, Math.max(CL_SILENT, aval[c] * gv)); return [L, L * CL_OSC_AMP]; }
      const b = s - Nc, L = Math.min(10, Math.max(CL_SILENT, ((nval[c] * 1) * lv) / nrms[b]));
      return [L, L * nrms[b]];
    };
    // each voice's pitch per tick (the engine's geometric mean, its 3-cent rule) and its band response
    const G = new Float64Array(S * F * 32), Gt = new Float64Array(S * F);
    for (let v = 0; v < Nc; v++) {
      let lastP = -1;
      for (let k = 0; k < F; k++) {
        if (k < F - 1) {
          const q0 = fq[k * N + v], q1 = fq[(k + 1) * N + v];
          const f0 = amc[k * Nc + v] > 0 && q0 > 0 ? f32(pitchVal(pitchCode(q0))) : 0, f1 = amc[(k + 1) * Nc + v] > 0 && q1 > 0 ? f32(pitchVal(pitchCode(q1))) : 0;
          const hz = f0 && f1 ? Math.sqrt(f0 * f1) : f1 || f0;
          if (hz > 0) { const p = Math.min(10, Math.max(0.01, hz / BASE)); if (!(lastP > 0 && Math.abs(p / lastP - 1) < csend)) lastP = f32(p); }
        }
        if (lastP > 0) { const [r, t] = cm.sine(lastP * BASE); G.set(r, (v * F + k) * 32); Gt[v * F + k] = t; }
      }
    }
    for (let b = 0; b < M; b++) for (let k = 0; k < F; k++) { G.set(cm.noise[b], ((Nc + b) * F + k) * 32); Gt[(Nc + b) * F + k] = cm.noiseTot[b]; }
    const nms = (F + 1) * CL_TICK, env = new Float64Array(S * nms), tStart = new Float64Array(S * (F + 1)), tLast = new Float64Array(S * (F + 1));
    const codeOf = (s, k) => (s < Nc ? amc[k * Nc + s] : nzc[k * M + s - Nc]);
    const fadeOf = (s, k) => fades[s < Nc ? vcod[k * Nc + s] : ncod[k * M + s - Nc]];
    const run = (s, k0, cur, lastL, stopSame) => {
      const base = s * nms;
      for (let k = k0; k < F; k++) {
        if (stopSame && k > k0 + 1 && cur === tStart[s * (F + 1) + k] && lastL === tLast[s * (F + 1) + k]) return k * CL_TICK;
        tStart[s * (F + 1) + k] = cur; tLast[s * (F + 1) + k] = lastL;
        let L, A, d;
        if (k === F - 1) { L = CL_SILENT; A = floor[s]; d = 50; } else { [L, A] = levelOf(s, codeOf(s, k + 1)); d = fadeOf(s, k); }
        const t0 = base + k * CL_TICK;
        if (L / lastL < dsend && lastL / L < dsend) { for (let u = 0; u < CL_TICK; u++) env[t0 + u] = cur; continue; }
        for (let u = 0; u < CL_TICK; u++) env[t0 + u] = cur + (A - cur) * Math.min(1, (u + 0.5) / d);
        cur = A; lastL = f32(L);
      }
      tStart[s * (F + 1) + F] = cur; tLast[s * (F + 1) + F] = lastL;
      return nms;
    };
    for (let s = 0; s < S; s++) run(s, 0, floor[s], f32(CL_SILENT), false);
    const tb = targetBands(x), nfr = Math.min(tb.nfr, Math.floor((nms - CL_WIN) / CL_HOP) + 1);
    const Rq0 = new Int32Array(32 * nfr);
    for (let j = 0; j < 32; j++) for (let m = 0; m < nfr; m++) Rq0[j * nfr + m] = Math.max(qdb(tb.R[j * tb.nfr + m], 1), -CL_FLOOR * CL_Q);
    let px = 0; for (let i = 0; i < x.length; i++) px += x[i] * x[i];
    px = px / Math.max(1, x.length);
    const wsel = opts.weights ?? CL_WEIGHTS_DEFAULT, W = typeof wsel === 'string' ? CL_WEIGHT_SETS[wsel] : wsel, dur = (x.length * 1000) / SR;
    /** power of sound s in frames m0..m1 from its envelope e (ms t0 .. t0 + e.length), added (sign 1) or taken (sign -1) into P */
    const addContrib = (P, s, m0, m1, e, eOff, t0, n, sign) => {
      const isv = s < Nc, E = new Float64Array(F);
      for (let m = m0; m <= m1; m++) {
        if (isv) {
          let k0 = F, k1 = -1;
          for (let w = 0; w < CL_WIN; w++) {
            const t = m * CL_HOP + w - t0; if (t < 0 || t >= n) continue;
            const v = e[eOff + t], kk = Math.min(Math.floor((t + t0) / CL_TICK), F - 1);
            E[kk] += v * v * cm.w2[w]; if (kk < k0) k0 = kk; if (kk > k1) k1 = kk;
          }
          for (let kk = k0; kk <= k1; kk++) {
            const val = E[kk] / CL_WIN; E[kk] = 0;
            if (val === 0) continue;
            const g = (s * F + kk) * 32;
            for (let j = 0; j < 32; j++) P[j * nfr + m] += sign * G[g + j] * val;
          }
        } else {
          let acc = 0;
          for (let w = 0; w < CL_WIN; w++) { const t = m * CL_HOP + w - t0; if (t < 0 || t >= n) continue; const v = e[eOff + t]; acc += v * v * cm.w2[w]; }
          const val = acc / CL_WIN, g = s * F * 32;
          for (let j = 0; j < 32; j++) P[j * nfr + m] += sign * G[g + j] * val;
        }
      }
    };
    const tmpA = new Float64Array(32 * nfr), tmpB = new Float64Array(32 * nfr);
    const power = () => {
      const P = new Float64Array(32 * nfr);
      for (let j = 0; j < 32; j++) for (let m = 0; m < nfr; m++) P[j * nfr + m] = cm.qfloor[j] * cm.mw2;
      let tot = cm.qfloorTot;
      for (let s = 0; s < S; s++) {
        // (as tools/spectral.py: the sound's contribution summed over its ticks first, then added)
        tmpA.fill(0); addContrib(tmpA, s, 0, nfr - 1, env, s * nms, 0, nms, 1);
        for (let i = 0; i < 32 * nfr; i++) P[i] += tmpA[i];
        let acc = 0;
        for (let t = 0; t < nms; t++) { const v = env[s * nms + t]; acc += v * v * Gt[s * F + Math.min(Math.floor(t / CL_TICK), F - 1)]; }
        tot += acc / dur;
      }
      return { P, tot };
    };
    const framesOf = (ta, tb2) => [Math.max(0, Math.ceil((ta - CL_WIN + 1) / CL_HOP)), Math.min(nfr - 1, Math.floor((tb2 - 1) / CL_HOP))];
    const hist = [], changes = [], u05 = new Float64Array(CL_TICK); for (let u = 0; u < CL_TICK; u++) u05[u] = u + 0.5;
    const fl = new Int32Array(nfr), Rq = new Int32Array(32 * nfr), Dcur = new Int32Array(32 * nfr);
    const seg = new Float64Array(2 * CL_TICK), old = new Float64Array(32 * nfr);
    let Dc = new Int32Array(0);
    const objective = opts.objective ?? CL_OBJECTIVE, wf = W.map((w) => w / 1000), hold = opts.hold ?? CL_HOLD, dbs = [];
    let tot0 = null;
    for (let sw = 0; sw <= sweeps; sw++) {
      let { P, tot } = power();
      if (hold && tot0 !== null) {
        // (hold, as tools/spectral.py: the playback's power back where it started, every code moved alike — the scale ViSQOL
        // gives the playback would otherwise sink the song toward the 16-bit floor sweep after sweep)
        const dl = 10 * Math.log10(tot0 / tot), cv = Math.floor(dl / AMP_STEP_DB + 0.5), cn = Math.floor(dl / NZ_STEP_DB + 0.5);
        if (cv || cn) {
          for (let i = 0; i < amc.length; i++) if (amc[i] > 0) amc[i] = Math.min(127, Math.max(1, amc[i] + cv));
          for (let i = 0; i < nzc.length; i++) if (nzc[i] > 0) nzc[i] = Math.min(255, Math.max(1, nzc[i] + cn));
          for (let s = 0; s < S; s++) run(s, 0, floor[s], f32(CL_SILENT), false);
          ({ P, tot } = power());
        }
      }
      if (tot0 === null) tot0 = tot;
      dbs.push(Math.round(1000 * Math.log10(tot / tot0)) / 100);
      const s2 = px / tot;
      for (let m = 0; m < nfr; m++) {
        let mx = -Infinity;
        for (let j = 0; j < 32; j++) { mx = Math.max(mx, Rq0[j * nfr + m], Math.max(qdb(P[j * nfr + m], s2), -CL_FLOOR * CL_Q)); }
        fl[m] = mx - CL_FLOOR * CL_Q;
        for (let j = 0; j < 32; j++) { Rq[j * nfr + m] = Math.max(Rq0[j * nfr + m], fl[m]); Dcur[j * nfr + m] = Math.max(Math.max(qdb(P[j * nfr + m], s2), -CL_FLOOR * CL_Q), fl[m]); }
      }
      let lowq = Infinity; for (let i = 0; i < 32 * nfr; i++) lowq = Math.min(lowq, Rq[i], Dcur[i]);
      if (objective === 'nsim') {
        // (the whole map, edges replicated: its mean NSIM)
        const rr = new Float64Array(34 * (nfr + 2)), dd = new Float64Array(34 * (nfr + 2));
        for (let i = 0; i < 34; i++) for (let j = 0; j < nfr + 2; j++) {
          const a = Math.min(31, Math.max(0, i - 1)) * nfr + Math.min(nfr - 1, Math.max(0, j - 1));
          rr[i * (nfr + 2) + j] = (Rq[a] - lowq) / CL_Q; dd[i * (nfr + 2) + j] = (Dcur[a] - lowq) / CL_Q;
        }
        hist.push(nsimValidSum(rr, dd, 34, nfr + 2, new Array(32).fill(1)) / (32 * nfr));
      } else {
        let L0 = 0;
        for (let j = 0; j < 32; j++) for (let m = 0; m < nfr; m++) { const dd = Dcur[j * nfr + m] - Rq[j * nfr + m]; L0 += W[j] * dd * dd; }
        hist.push(L0 / (1000 * CL_Q * CL_Q * 32 * nfr));
      }
      if (sw === sweeps) break;
      let changed = 0;
      for (let k = 0; k < F - 1; k++) {
        if ((k & 15) === 15) await progress((sw + k / F) / sweeps);
        const [m0, m1] = framesOf(k * CL_TICK, (k + 2) * CL_TICK);
        if (m1 < m0) continue;
        const nf = m1 - m0 + 1;
        for (let s = 0; s < S; s++) {
          const c0 = codeOf(s, k + 1);
          if (c0 <= 0) continue;
          const isv = s < Nc, hi = isv ? 127 : 255, steps = isv ? CL_VSTEPS : CL_NSTEPS;
          const codes = [...new Set(steps.map((d) => Math.min(hi, Math.max(1, c0 + d))))].sort((p, q) => p - q);
          const cur = tStart[s * (F + 1) + k], lastL = tLast[s * (F + 1) + k];
          let L1, A1, d1;
          if (k + 1 === F - 1) { L1 = CL_SILENT; A1 = floor[s]; d1 = 50; } else { [L1, A1] = levelOf(s, codeOf(s, k + 2)); d1 = fadeOf(s, k + 1); }
          // the frames' power without this sound over ticks k and k+1
          // (this sound's current power in those frames over ticks k and k+1: the candidates' own formula, as tools/spectral.py)
          const eb = s * nms + k * CL_TICK;
          for (let m = m0; m <= m1; m++) {
            let ek = 0, ek1 = 0, ea = 0;
            for (let w = 0; w < CL_WIN; w++) {
              const t = m * CL_HOP + w - k * CL_TICK; if (t < 0 || t >= 2 * CL_TICK) continue;
              const v = env[eb + t] * env[eb + t] * (cm.w2[w] / CL_WIN);
              if (t < CL_TICK) ek += v; else ek1 += v;
              ea += v;
            }
            const gk = (s * F + (isv ? k : 0)) * 32, gk1 = (s * F + (isv ? k + 1 : 0)) * 32;
            for (let j = 0; j < 32; j++) old[j * nfr + m] = isv ? ek * G[gk + j] + ek1 * G[gk1 + j] : ea * G[gk + j];
          }
          let best = -1, bestL = Infinity, bestC = 0, bestF = 0;
          const fc0 = isv ? vcod[k * Nc + s] : ncod[k * M + s - Nc];
          const nC = codes.length * 4 + 1;
          if (Dc.length < nC * 32 * nf) Dc = new Int32Array(nC * 32 * nf * 2);
          for (let ci = 0; ci < nC; ci++) {
            const c = ci < nC - 1 ? codes[ci >> 2] : 0, fcode = ci < nC - 1 ? ci & 3 : 3;
            const [Lk, Ak] = levelOf(s, c), sent0 = !(Lk / lastL < dsend && lastL / Lk < dsend), dk = fades[fcode];
            for (let u = 0; u < CL_TICK; u++) seg[u] = sent0 ? cur + (Ak - cur) * Math.min(1, u05[u] / dk) : cur;
            const end0 = sent0 ? Ak : cur, last0 = sent0 ? f32(Lk) : lastL, sent1 = !(L1 / last0 < dsend && last0 / L1 < dsend);
            for (let u = 0; u < CL_TICK; u++) seg[CL_TICK + u] = sent1 ? end0 + (A1 - end0) * Math.min(1, u05[u] / d1) : end0;
            for (let m = m0; m <= m1; m++) {
              let ek = 0, ek1 = 0, ea = 0;
              for (let w = 0; w < CL_WIN; w++) {
                const t = m * CL_HOP + w - k * CL_TICK; if (t < 0 || t >= 2 * CL_TICK) continue;
                const v = seg[t] * seg[t] * (cm.w2[w] / CL_WIN);
                if (t < CL_TICK) ek += v; else ek1 += v;
                ea += v;
              }
              const gk = (s * F + (isv ? k : 0)) * 32, gk1 = (s * F + (isv ? k + 1 : 0)) * 32;
              for (let j = 0; j < 32; j++) {
                const con = isv ? ek * G[gk + j] + ek1 * G[gk1 + j] : ea * G[gk + j];
                Dc[(ci * 32 + j) * nf + (m - m0)] = Math.max(Math.max(qdb((P[j * nfr + m] - old[j * nfr + m]) + con, s2), -CL_FLOOR * CL_Q), fl[m]);
              }
            }
          }
          let Ln = 0;
          if (objective === 'nsim') {
            // ViSQOL's similarity over the bands a candidate can change (and their neighbours) and the frames whose neighbourhoods
            // reach the changed ones (tools/spectral.py)
            let jl = -1, jh = -1;
            for (let j = 0; j < 32; j++) {
              let ch = false;
              for (let ci = 0; ci < nC && !ch; ci++) for (let m = 0; m < nf; m++) if (Dc[(ci * 32 + j) * nf + m] !== Dcur[j * nfr + m0 + m]) { ch = true; break; }
              if (ch) { if (jl < 0) jl = j; jh = j; }
            }
            if (jl < 0) continue;
            const ja = Math.max(0, jl - 1), jb = Math.min(31, jh + 1), ea = Math.max(0, m0 - 1), eb = Math.min(nfr - 1, m1 + 1);
            const nr = jb - ja + 3, ncol = eb - ea + 3;
            const rows = [], colsI = [];
            for (let i = ja - 1; i <= jb + 1; i++) rows.push(Math.min(31, Math.max(0, i)));
            for (let i = ea - 1; i <= eb + 1; i++) colsI.push(Math.min(nfr - 1, Math.max(0, i)));
            const rr = new Float64Array(nr * ncol), dn = new Float64Array(nr * ncol), dc = new Float64Array(nr * ncol), ws = [];
            for (let i = ja; i <= jb; i++) ws.push(wf[i]);
            for (let i = 0; i < nr; i++) for (let j = 0; j < ncol; j++) {
              rr[i * ncol + j] = (Rq[rows[i] * nfr + colsI[j]] - lowq) / CL_Q; dn[i * ncol + j] = (Dcur[rows[i] * nfr + colsI[j]] - lowq) / CL_Q;
            }
            const ref = nsimRef(rr, nr, ncol);
            Ln = -nsimSum(ref, dn, ws);
            for (let ci = 0; ci < nC; ci++) {
              for (let i = 0; i < nr; i++) for (let j = 0; j < ncol; j++) {
                const col = colsI[j];
                dc[i * ncol + j] = col >= m0 && col <= m1 ? (Dc[(ci * 32 + rows[i]) * nf + (col - m0)] - lowq) / CL_Q : dn[i * ncol + j];
              }
              const Lc = -nsimSum(ref, dc, ws);
              if (Lc < bestL) { bestL = Lc; best = ci; bestC = ci < nC - 1 ? codes[ci >> 2] : 0; bestF = ci < nC - 1 ? ci & 3 : 3; }
            }
          } else {
            for (let m = m0; m <= m1; m++) for (let j = 0; j < 32; j++) { const dd = Dcur[j * nfr + m] - Rq[j * nfr + m]; Ln += W[j] * dd * dd; }
            for (let ci = 0; ci < nC; ci++) {
              let Lc = 0;
              for (let m = m0; m <= m1; m++) for (let j = 0; j < 32; j++) { const dd = Dc[(ci * 32 + j) * nf + (m - m0)] - Rq[j * nfr + m]; Lc += W[j] * dd * dd; }
              if (Lc < bestL) { bestL = Lc; best = ci; bestC = ci < nC - 1 ? codes[ci >> 2] : 0; bestF = ci < nC - 1 ? ci & 3 : 3; }
            }
          }
          if (best >= 0 && bestL < Ln && (bestC !== c0 || bestF !== fc0)) {
            if (isv) { amc[(k + 1) * Nc + s] = bestC; vcod[k * Nc + s] = bestF; } else { nzc[(k + 1) * M + s - Nc] = bestC; ncod[k * M + s - Nc] = bestF; }
            const ta = k * CL_TICK, oldEnv = env.slice(s * nms + ta, s * nms + nms);
            const tEnd = run(s, k, cur, lastL, true);
            const [n0, n1] = framesOf(ta, tEnd);
            if (n1 >= n0) {
              // P += new - old over those frames (as tools/spectral.py)
              for (let j = 0; j < 32; j++) for (let m = n0; m <= n1; m++) { tmpA[j * nfr + m] = 0; tmpB[j * nfr + m] = 0; }
              addContrib(tmpA, s, n0, n1, env, s * nms + ta, ta, tEnd - ta, 1);
              addContrib(tmpB, s, n0, n1, oldEnv, 0, ta, tEnd - ta, 1);
              for (let j = 0; j < 32; j++) for (let m = n0; m <= n1; m++) {
                P[j * nfr + m] += tmpA[j * nfr + m] - tmpB[j * nfr + m];
                Dcur[j * nfr + m] = Math.max(Math.max(qdb(P[j * nfr + m], s2), -CL_FLOOR * CL_Q), fl[m]);
              }
            }
            changed++;
          }
        }
      }
      changes.push(changed);
    }
    for (let k = 0; k < F; k++) {
      for (let v = 0; v < Nc; v++) { const c = amc[k * Nc + v]; am[k * N + v] = c ? ampVal(c) / gain : 0; vcodes[k * N + v] = vcod[k * Nc + v]; }
      for (let b = 0; b < M; b++) { const c = nzc[k * M + b]; nz[k * M + b] = c ? nzVal(c) / gain : 0; ncodes[k * M + b] = ncod[k * M + b]; }
    }
    return { loss: hist, changes, db: dbs };
  }

  // ---------------------------------------------------------------- encode / decode (identical layout to the Python)
  const ampCode = (a) => (a <= 0 ? 0 : Math.max(1, Math.min(127, Math.round((20 * Math.log10(a) - AMP_FLOOR_DB) / AMP_STEP_DB) + 1)));
  const pitchCode = (f) => Math.max(0, Math.min(65535, Math.round(1200 * Math.log2(f / 16) * 5)));
  const nzCode = (a) => { if (a <= 0) return 0; const c = Math.round((20 * Math.log10(a) - NZ_FLOOR_DB) / NZ_STEP_DB) + 1; return c > 0 ? Math.min(255, c) : 0; };
  function encode(F, N, M, fq, am, att, nz, events, gain) {
    const out = []; const lastP = new Int32Array(N).fill(-1), lastA = new Int32Array(N);
    const byK = new Map(); for (const e of events) { if (!byK.has(e[0])) byK.set(e[0], []); byK.get(e[0]).push(e); }
    let changes = 0, pitchCalls = 0;
    for (let k = 0; k < F; k++) {
      const mask = new Uint8Array((N + 7) >> 3), body = [];
      for (let v = 0; v < N; v++) {
        const ac = ampCode(am[k * N + v] * gain), pc = ac > 0 ? pitchCode(fq[k * N + v]) : 0, aflag = !!att[k * N + v] && ac > 0;
        if (!(ac !== lastA[v] || (ac > 0 && Math.abs(pc - lastP[v]) >= 10) || aflag)) continue;
        mask[v >> 3] |= 1 << (v & 7);
        body.push((aflag ? 0x80 : 0) | ac);
        if (ac > 0) { body.push(pc & 255, pc >> 8); lastP[v] = pc; pitchCalls++; }
        lastA[v] = ac; changes++;
      }
      out.push(...mask, ...body);
      for (let b = 0; b < M; b++) out.push(nzCode(nz[k * M + b] * gain));
      const ev = (byK.get(k) ?? []).slice(0, 15);
      out.push(ev.length);
      for (const [, sub, b, a] of ev) out.push((b << 2) | sub, nzCode(a * gain));
    }
    return { bytes: Uint8Array.from(out), stats: { changesPerTick: changes / F, pitchCallsPerTick: pitchCalls / F } };
  }
  function decode(bytes, meta) {
    const F = meta.frames, N = meta.voices, M = meta.noise.length, nb = (N + 7) >> 3;
    const fq = new Float64Array(F * N), am = new Float64Array(F * N), att = new Uint8Array(F * N), nz = new Float64Array(F * M), events = [];
    const curF = new Float64Array(N), curA = new Float64Array(N);
    const av = (c) => (c ? Math.pow(10, (meta.amp[0] + (c - 1) * meta.amp[1]) / 20) : 0), nv = (c) => (c ? Math.pow(10, (meta.nz[0] + (c - 1) * meta.nz[1]) / 20) : 0);
    let p = 0;
    for (let k = 0; k < F; k++) {
      const mp = p; p += nb;
      for (let v = 0; v < N; v++) {
        if (!((bytes[mp + (v >> 3)] >> (v & 7)) & 1)) continue;
        const b = bytes[p++], ac = b & 0x7f; curA[v] = av(ac);
        if (ac) { curF[v] = 16 * Math.pow(2, (bytes[p] | (bytes[p + 1] << 8)) / 6000); p += 2; }
        if (b & 0x80) att[k * N + v] = 1;
      }
      fq.set(curF, k * N); am.set(curA, k * N);
      for (let b = 0; b < M; b++) nz[k * M + b] = nv(bytes[p++]);
      const ne = bytes[p++];
      for (let e = 0; e < ne; e++) { const bb = bytes[p++]; events.push([k, bb & 3, bb >> 2, nv(bytes[p++])]); }
    }
    const tail = meta.fd ? (meta.fd.v || 0) + (meta.fd.nz || 0) : 0;      // (format 2: the fitted fades follow the frames)
    if (p !== bytes.length - tail) throw new Error('decode: ' + (bytes.length - tail - p) + ' bytes left');
    // format 2: the fade length (s) of voice v at tick k = fms[vd[k * N + v]], of noise band b = fms[nzd[k * M + b]] (src/main.ts decodeJob)
    let vd = null, nzd = null, fms = null;
    if (meta.fd && meta.fd.ms && meta.fd.ms.length === 4) {
      fms = meta.fd.ms.map((x) => x / 1000);
      const codes = (at, len, n) => {
        const per = (n + 3) >> 2; if (!len || len !== F * per) return null;
        const c = new Uint8Array(F * n);
        for (let k = 0; k < F; k++) for (let j = 0; j < n; j++) c[k * n + j] = (bytes[at + k * per + (j >> 2)] >> (2 * (j & 3))) & 3;
        return c;
      };
      vd = codes(p, meta.fd.v || 0, N); nzd = codes(p + (meta.fd.v || 0), meta.fd.nz || 0, M);
    }
    return { F, N, M, fq, am, att, nz, events, vd, nzd, fms };
  }

  // ---------------------------------------------------------------- engine schedule (src/main.ts tick rules, speed 1)
  /** per voice: list of {T, hz, dur, level} commands exactly as the add-on sends them */
  function schedule(dec) {
    const { F, N, fq, am, att, vd, fms } = dec, voices = [];
    for (let v = 0; v < N; v++) {
      const cmds = []; let any = false;
      for (let T = 0; T < F; T++) {
        const a = (k) => (k >= 0 && k < F ? am[k * N + v] : 0), f = (k) => fq[k * N + v], A = (k) => k < F && att[k * N + v] && a(k) > 0;
        if (a(T) > 0) any = true;
        if (vd) {
          // format 2: every tick fades to the next frame in its own fitted length (no attack rule), the last one to silence
          const fa = a(T) > 0 ? f(T) : 0, fb = T + 1 < F && a(T + 1) > 0 ? f(T + 1) : 0;
          if (T + 1 < F) cmds.push([T, fa && fb ? Math.sqrt(fa * fb) : fb || fa, fms[vd[T * N + v]], a(T + 1)]);
          else cmds.push([T, 0, FADE_SMOOTH, 0]);
          continue;
        }
        if (A(T)) { cmds.push([T, f(T), FADE_ATTACK, a(T)]); continue; }
        if (A(T + 1)) { cmds.push([T, a(T) > 0 ? f(T) : 0, -1, 0]); continue; }
        const fa = a(T) > 0 ? f(T) : 0, fb = T + 1 < F && a(T + 1) > 0 ? f(T + 1) : 0;
        cmds.push([T, fa && fb ? Math.sqrt(fa * fb) : fb || fa, FADE_SMOOTH, T + 1 < F ? a(T + 1) : 0]);
      }
      voices.push(any ? cmds : null);
    }
    return voices;
  }
  // ---------------------------------------------------------------- base64
  function toB64(bytes) {
    let s = ''; const C = 0x8000;
    for (let i = 0; i < bytes.length; i += C) s += String.fromCharCode.apply(null, bytes.subarray(i, i + C));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
  }
  function fromB64(s) {
    if (typeof atob !== 'function') return new Uint8Array(Buffer.from(s, 'base64'));
    const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o;
  }

  // ---------------------------------------------------------------- song pack (a behaviour pack that hands its songs to the player)
  /** list: [{meta, data(base64)}] → scripts/main.js of the song pack */
  function songPackScript(list) {
    return `// Spectral Player song pack: ${list.map((s) => s.meta.title).join(', ').replace(/[\r\n]/g, ' ')}\n` +
      `import { world, system } from '@minecraft/server';\nconst SONGS = ${JSON.stringify(list)};\n` +
      `function send() { for (const s of SONGS) system.sendScriptEvent('spectral:song', JSON.stringify({ id: s.meta.id, i: 0, n: 1, meta: s.meta, data: s.data })); }\n` +
      `world.afterEvents.worldLoad.subscribe(() => system.runTimeout(send, 10));\n` +
      `system.afterEvents.scriptEventReceive.subscribe((e) => { if (e.id === 'spectral:hello') system.runTimeout(send, 2); });\n`;
  }
  function songPackManifest(name, list, uuid) {
    return { format_version: 2,
      header: { name: `Spectral Songs: ${name}`.slice(0, 80), description: `Spectral Player の曲パック（${list.map((s) => s.meta.id).join(', ')}）`, uuid: uuid(), version: [1, 0, 0], min_engine_version: [1, 26, 60] },
      modules: [{ type: 'script', language: 'javascript', uuid: uuid(), version: [1, 0, 0], entry: 'scripts/main.js' }],
      dependencies: [{ module_name: '@minecraft/server', version: '2.11.0' }] };
  }

  const api = { refineClient, clientModel, targetBands, gtH2, trackPartials, chooseTracks, nsimLite, nsimSpec, checkNoise, checkRenderSines, songPackScript, songPackManifest, SR, FPS, HOP, BASE, NOISE_EDGES, BURST_BANDS, SUB, FADE_SMOOTH, FADE_ATTACK, SILENT, convert, encode, decode, schedule, onsets, fft, toB64, fromB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpectralCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
