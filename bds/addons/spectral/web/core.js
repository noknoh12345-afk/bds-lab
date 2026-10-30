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
  function chooseTracks(tracks, F, N, minFrames = MIN_TRACK, margin = 1) {
    const cand = [];
    tracks.forEach((t, ti) => {
      if (t.a.length < minFrames) return;
      let sal = 0; for (let i = 0; i < t.a.length; i++) sal += t.a[i] * aWeight(t.f[i]);
      cand.push([sal, ti]);
    });
    cand.sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    const busy = Array.from({ length: N }, () => new Uint8Array(F + 2)), placed = [];
    for (const [, ti] of cand) {
      const t = tracks[ti], lo = Math.max(0, t.k0 - margin), hi = Math.min(F, t.k0 + t.a.length + margin);
      for (let v = 0; v < N; v++) {
        const b = busy[v]; let free = true;
        for (let i = lo; i < hi; i++) if (b[i]) { free = false; break; }
        if (free) { for (let i = lo; i < hi; i++) b[i] = 1; placed.push([v, ti]); break; }
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
    const N = opts.voices ?? 48, hyst = 2.0, progress = opts.progress ?? (() => {}), analysis = opts.analysis ?? 'v2';
    const allPeaks = [];
    const F = Math.ceil(x.length / HOP) + 1, M = NOISE_EDGES.length - 1;
    const res = RES.map(makeRes);
    const fq = new Float64Array(F * N), am = new Float64Array(F * N), att = new Uint8Array(F * N), nz = new Float64Array(F * M);
    let prevF = new Float64Array(N), prevA = new Float64Array(N), sal = new Float64Array(N);
    for (let k = 0; k < F; k++) {
      const pk = [];
      for (const R of res) { spectrum(R, x, k); peaksOf(R, pk); }
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
      const ch = chooseTracks(trackPartials(allPeaks), F, N);
      fq.set(ch.fq); am.set(ch.am); att.set(ch.att); placedN = ch.placed;
      await progress(0.7);
    } else {
      // swells are not attacks
      for (let k = 0; k < F - 1; k++) for (let v = 0; v < N; v++) if (att[k * N + v] && am[(k + 1) * N + v] > am[k * N + v] * 1.6) att[k * N + v] = 0;
    }
    // most energetic voices first
    const energy = new Float64Array(N); for (let k = 0; k < F; k++) for (let v = 0; v < N; v++) energy[v] += am[k * N + v] ** 2;
    const order = [...Array(N).keys()].sort((i, j) => energy[j] - energy[i] || i - j);
    const P = (src, T) => { const o = new T(F * N); for (let k = 0; k < F; k++) for (let v = 0; v < N; v++) o[k * N + v] = src[k * N + order[v]]; return o; };
    const fq2 = P(fq, Float64Array), am2 = P(am, Float64Array), att2 = P(att, Uint8Array);
    await progress(0.75);
    let ev = [], noiseBands = null, nsimBest = null, burstBands = null;
    if (analysis === 'v2') {
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
    for (const [k, , b, a] of ev) {
      const [lo, hi] = BURST_BANDS[b], e = a * a * 0.35;
      for (let bi = 0; bi < M; bi++) if (NOISE_EDGES[bi] < hi && NOISE_EDGES[bi + 1] > lo && k < F) nz[k * M + bi] = Math.sqrt(Math.max(nz[k * M + bi] ** 2 - e / 3, 0));
    }
    let peak = 1e-9;
    for (let k = 0; k < F; k++) { let s = 0; for (let v = 0; v < N; v++) s += am2[k * N + v] * 0.55; for (let b = 0; b < M; b++) s += nz[k * M + b]; peak = Math.max(peak, s); }
    const gain = (0.9 / peak) * Math.pow(10, (opts.gainDb ?? 0) / 20);
    const enc = encode(F, N, M, fq2, am2, att2, nz, ev, gain);
    await progress(1);
    const meta = {
      format: 'spectral-player/1', title: opts.title ?? 'song', artist: opts.artist ?? '', fps: FPS, frames: F, voices: N, base: BASE,
      noise: NOISE_EDGES.slice(0, -1).map((e, i) => [e, NOISE_EDGES[i + 1]]), bursts: BURST_BANDS.length, sub: SUB,
      seconds: Math.round((x.length / SR) * 100) / 100, amp: [AMP_FLOOR_DB, AMP_STEP_DB], nz: [NZ_FLOOR_DB, NZ_STEP_DB], analysis, id: opts.id ?? 'song',
    };
    return { meta, bytes: enc.bytes, stats: { ...enc.stats, events: ev.length, activeAvg: avgActive(am2, F, N), noiseBands, burstBands, nsimLite: nsimBest, placed: placedN } };
  }
  const avgActive = (am, F, N) => { let c = 0; for (let i = 0; i < F * N; i++) if (am[i] > 0) c++; return c / F; };

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
    if (p !== bytes.length) throw new Error('decode: ' + (bytes.length - p) + ' bytes left');
    return { F, N, M, fq, am, att, nz, events };
  }

  // ---------------------------------------------------------------- engine schedule (src/main.ts tick rules, speed 1)
  /** per voice: list of {T, hz, dur, level} commands exactly as the add-on sends them */
  function schedule(dec) {
    const { F, N, fq, am, att } = dec, voices = [];
    for (let v = 0; v < N; v++) {
      const cmds = []; let any = false;
      for (let T = 0; T < F; T++) {
        const a = (k) => (k >= 0 && k < F ? am[k * N + v] : 0), f = (k) => fq[k * N + v], A = (k) => k < F && att[k * N + v] && a(k) > 0;
        if (a(T) > 0) any = true;
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

  const api = { trackPartials, chooseTracks, nsimLite, nsimSpec, checkNoise, checkRenderSines, songPackScript, songPackManifest, SR, FPS, HOP, BASE, NOISE_EDGES, BURST_BANDS, SUB, FADE_SMOOTH, FADE_ATTACK, SILENT, convert, encode, decode, schedule, onsets, fft, toB64, fromB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SpectralCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
