// GeoUI timeline — the model (pure: no DOM, no Blockbench). The plan's step 1 (bds/geoui/timeline/PLAN.md):
// easing, time and the beat grid, motion paths at constant speed; then the document itself (normalize, evaluate, reduce).
// Loaded as is by Blockbench (one file of the plugin's bundle) and by Node's tests (module.exports).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const PI = Math.PI;
  const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

  // ---------------------------------------------------------------------------------------------------------------- easing
  // Robert Penner's curves (the forms easings.net gives), each eased(0) = 0 and eased(1) = 1. A key's ease shapes the segment
  // from that key to the next. 'step' holds the key's value for the whole segment.
  const C1 = 1.70158, C2 = C1 * 1.525, C3 = C1 + 1, C4 = (2 * PI) / 3, C5 = (2 * PI) / 4.5;
  function bounceOut(x) {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) { x -= 1.5 / d; return n * x * x + 0.75; }
    if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + 0.9375; }
    x -= 2.625 / d; return n * x * x + 0.984375;
  }
  const inOutOf = (inF) => (x) => (x < 0.5 ? inF(2 * x) / 2 : 1 - inF(2 - 2 * x) / 2);
  const outOf = (inF) => (x) => 1 - inF(1 - x);
  const POW = (k) => (x) => Math.pow(x, k);
  const IN = {
    sine: (x) => 1 - Math.cos((x * PI) / 2),
    quad: POW(2), cubic: POW(3), quart: POW(4), quint: POW(5),
    expo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
    circ: (x) => 1 - Math.sqrt(1 - x * x),
    back: (x) => C3 * x * x * x - C1 * x * x,
    elastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * C4)),
    bounce: (x) => 1 - bounceOut(1 - x),
  };
  const CURVES = { linear: (x) => x, step: (x) => (x >= 1 ? 1 : 0) };
  for (const [k, f] of Object.entries(IN)) { CURVES[`${k}-in`] = f; CURVES[`${k}-out`] = outOf(f); CURVES[`${k}-inout`] = inOutOf(f); }
  // (the in-out forms Penner wrote for these differ from the mirrored in: kept as written)
  CURVES['back-inout'] = (x) => (x < 0.5 ? (Math.pow(2 * x, 2) * ((C2 + 1) * 2 * x - C2)) / 2 : (Math.pow(2 * x - 2, 2) * ((C2 + 1) * (x * 2 - 2) + C2) + 2) / 2);
  CURVES['elastic-out'] = (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * C4) + 1);
  CURVES['elastic-inout'] = (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * C5)) / 2 : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * C5)) / 2 + 1);
  CURVES['bounce-out'] = bounceOut;
  CURVES['expo-inout'] = (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2);
  const EASES = Object.freeze(Object.keys(CURVES));

  /** a CSS-style cubic Bézier (0,0) (x1,y1) (x2,y2) (1,1): y at x — the curve's parameter found by Newton's method, bisection
   *  where Newton stalls (x1 and x2 are held to 0..1 so x is monotone) */
  function bezierAt(b, x) {
    const x1 = clamp01(+b[0] || 0), y1 = +b[1] || 0, x2 = clamp01(+b[2] || 0), y2 = +b[3] || 0;
    const ax = 1 + 3 * x1 - 3 * x2, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
    const ay = 1 + 3 * y1 - 3 * y2, by = 3 * y2 - 6 * y1, cy = 3 * y1;
    const X = (s) => ((ax * s + bx) * s + cx) * s, dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
    let s = x;
    for (let i = 0; i < 8; i++) { const e = X(s) - x, d = dX(s); if (Math.abs(e) < 1e-7) break; if (Math.abs(d) < 1e-6) { s = NaN; break; } s -= e / d; }
    if (!(s >= 0 && s <= 1) || Math.abs(X(s) - x) > 1e-6) { let lo = 0, hi = 1; s = x; for (let i = 0; i < 60; i++) { if (X(s) < x) lo = s; else hi = s; s = (lo + hi) / 2; } }
    return ((ay * s + by) * s + cy) * s;
  }
  /** an ease (a name of EASES, or { bezier: [x1, y1, x2, y2] }) at x in 0..1 (0 and 1 exactly at the ends) */
  function ease(e, x) {
    x = clamp01(+x);
    if (x === 0) return 0;
    if (x === 1) return 1;
    if (e && typeof e === 'object' && Array.isArray(e.bezier)) return bezierAt(e.bezier, x);
    return (CURVES[e] || CURVES.linear)(x);
  }
  const isEase = (e) => (e && typeof e === 'object' ? Array.isArray(e.bezier) && e.bezier.length === 4 && e.bezier.every(Number.isFinite) : Object.prototype.hasOwnProperty.call(CURVES, e));

  // ---------------------------------------------------------------------------------------------------------------- time
  const toFrames = (t, fps) => Math.round(t * fps);
  const fromFrames = (f, fps) => f / fps;
  const pad = (n) => String(n).padStart(2, '0');
  /** seconds → 'mm:ss:ff' (frames at fps; a minus sign before it) */
  function timecode(t, fps = 20) {
    const f = Math.round(Math.abs(t) * fps), r = Math.round(fps);
    return `${t < 0 && f ? '-' : ''}${pad(Math.floor(f / r / 60))}:${pad(Math.floor(f / r) % 60)}:${pad(f % r)}`;
  }
  /** 'mm:ss:ff', 'ss:ff' or plain seconds ('1.5') → seconds; NaN when it is none of them */
  function parseTimecode(s, fps = 20) {
    const str = String(s).trim();
    if (/^-?\d+(\.\d+)?$/.test(str)) return +str;
    const m = /^(-?)(?:(\d+):)?(\d+):(\d+)$/.exec(str);
    if (!m || +m[4] >= Math.round(fps)) return NaN;
    const v = (+(m[2] || 0)) * 60 + +m[3] + +m[4] / fps;
    return m[1] ? -v : v;
  }

  // ---------------------------------------------------------------------------------------------------------------- beats
  // seq.tempo = [{ t, bpm, meter }]: each point starts a new beat (an integer beat number) at its time — as osu!'s uninherited
  // timing points restart the grid. None: 120 BPM in 4/4 from 0.
  function tempoOf(seq) {
    const pts = (Array.isArray(seq && seq.tempo) ? seq.tempo : []).filter((p) => p && Number.isFinite(+p.t) && +p.bpm > 0)
      .map((p) => ({ t: +p.t, bpm: +p.bpm, meter: Math.max(1, Math.round(+p.meter || 4)) })).sort((a, b) => a.t - b.t);
    if (!pts.length) pts.push({ t: 0, bpm: 120, meter: 4 });
    let beat = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) { const prev = pts[i - 1], b = prev.beat + ((pts[i].t - prev.t) * prev.bpm) / 60; beat = Math.ceil(b - 1e-9); }
      pts[i].beat = beat;
    }
    return pts;
  }
  const segmentAt = (pts, t) => { let i = 0; while (i + 1 < pts.length && pts[i + 1].t <= t) i++; return pts[i]; };
  /** the beat number at a time (fractional; before the first tempo point it runs backwards at that point's BPM) */
  function beatAt(seq, t) { const p = segmentAt(tempoOf(seq), t); return p.beat + ((t - p.t) * p.bpm) / 60; }
  /** the time of a beat number (a beat skipped where a tempo point restarts the grid: that point's time) */
  function timeAtBeat(seq, b) {
    const pts = tempoOf(seq); let i = 0;
    while (i + 1 < pts.length && pts[i + 1].beat <= b) i++;
    const p = pts[i], t = p.t + ((b - p.beat) * 60) / p.bpm;
    return i + 1 < pts.length ? Math.min(t, pts[i + 1].t) : t;
  }
  /** a time snapped to the grid of 1/div beats (div 1, 2, 3, 4, 6, 8, 12, 16 …) */
  function snapToBeat(seq, t, div = 4) { const d = Math.max(1, Math.round(div)); return timeAtBeat(seq, Math.round(beatAt(seq, t) * d) / d); }
  /** the measure and beat of a time ({ bar, beat } from 1, as a timeline's ruler says them) */
  function barBeat(seq, t) {
    const p = segmentAt(tempoOf(seq), t), b = Math.floor(beatAt(seq, t) - p.beat + 1e-9);
    const before = tempoOf(seq).filter((q) => q.t < p.t).reduce((n, q, i, a) => n + Math.ceil(((i + 1 < a.length ? a[i + 1].beat : p.beat) - q.beat) / q.meter - 1e-9), 0);
    return { bar: before + Math.floor(b / p.meter) + 1, beat: (b % p.meter) + 1 };
  }

  // ---------------------------------------------------------------------------------------------------------------- paths
  // path = { kind: 'linear'|'bezier'|'catmull'|'arc', points: [[x, y], …] }. Followed at constant speed: sampled into a
  // polyline once (cached per path object), then by arc length. bezier: a point given twice splits it into segments (osu!'s
  // red anchors), each of any degree; catmull: uniform Catmull-Rom through the points; arc: the circle through 3 points.
  const SAMPLES = 48;
  const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  function deCasteljau(ps, u) { let q = ps.map((p) => [p[0], p[1]]); while (q.length > 1) q = q.slice(1).map((p, i) => lerp2(q[i], p, u)); return q[0]; }
  function bezierPoly(points) {
    const segs = []; let cur = [points[0]];
    for (let i = 1; i < points.length; i++) { cur.push(points[i]); if (i + 1 < points.length && same(points[i], points[i + 1])) { segs.push(cur); cur = []; } }
    if (cur.length > 1) segs.push(cur);
    const out = [];
    for (const s of segs.filter((x) => x.length > 1)) for (let k = out.length ? 1 : 0; k <= SAMPLES; k++) out.push(deCasteljau(s, k / SAMPLES));
    return out;
  }
  function catmullPoly(points) {
    const p = [points[0], ...points, points[points.length - 1]], out = [points[0]];
    for (let i = 1; i + 2 < p.length; i++) {
      for (let k = 1; k <= SAMPLES; k++) {
        const u = k / SAMPLES, u2 = u * u, u3 = u2 * u, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        out.push([f(p[i - 1][0], p[i][0], p[i + 1][0], p[i + 2][0]), f(p[i - 1][1], p[i][1], p[i + 1][1], p[i + 2][1])]);
      }
    }
    return out;
  }
  function arcPoly(points) {
    const [a, b, c] = points, d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (points.length !== 3 || Math.abs(d) < 1e-9) return points.slice();   // (collinear: a straight line, as osu! does)
    const sq = (p) => p[0] * p[0] + p[1] * p[1];
    const cx = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d, cy = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
    const r = Math.hypot(a[0] - cx, a[1] - cy), ang = (p) => Math.atan2(p[1] - cy, p[0] - cx);
    const a0 = ang(a); let a1 = ang(c) - a0; const am = ang(b) - a0, norm = (x) => ((x % (2 * PI)) + 2 * PI) % (2 * PI);
    // the arc's way round: the one that passes b
    a1 = norm(a1); if (norm(am) > a1) a1 -= 2 * PI;
    const n = Math.max(8, Math.ceil((Math.abs(a1) * r) / 2));
    return Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos(a0 + (a1 * k) / n), cy + r * Math.sin(a0 + (a1 * k) / n)]);
  }
  const POLY = new WeakMap();
  /** a path's polyline and its running lengths: { pts, acc, length } (cached for the same path object) */
  function pathTable(path) {
    if (path && typeof path === 'object' && POLY.has(path)) return POLY.get(path);
    const points = (Array.isArray(path && path.points) ? path.points : []).filter((p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).map((p) => [+p[0], +p[1]]);
    const kind = path && path.kind;
    const pts = points.length < 2 ? (points.length ? [points[0], points[0]] : [[0, 0], [0, 0]])
      : kind === 'bezier' ? bezierPoly(points) : kind === 'catmull' ? catmullPoly(points) : kind === 'arc' ? arcPoly(points) : points;
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const table = { pts, acc, length: acc[acc.length - 1] };
    if (path && typeof path === 'object') POLY.set(path, table);
    return table;
  }
  /** the point at u (0..1) of a path's length, at constant speed. opts.length: osu!'s pixel length — shorter cuts the path,
   *  longer goes on straight from its last piece */
  function pathPoint(path, u, opts = {}) {
    const { pts, acc, length } = pathTable(path), L = Number.isFinite(opts.length) && opts.length > 0 ? opts.length : length;
    const d = clamp01(+u || 0) * L;
    if (d >= length) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return seg > 0 ? [b[0] + ((b[0] - a[0]) * (d - length)) / seg, b[1] + ((b[1] - a[1]) * (d - length)) / seg] : [b[0], b[1]];
    }
    let lo = 0, hi = acc.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acc[mid] <= d) lo = mid; else hi = mid; }
    const span = acc[hi] - acc[lo];
    return lerp2(pts[lo], pts[hi], span > 0 ? (d - acc[lo]) / span : 0);
  }
  const pathLength = (path) => pathTable(path).length;

  T.model = { EASES, ease, isEase, bezierAt, toFrames, fromFrames, timecode, parseTimecode, tempoOf, beatAt, timeAtBeat, snapToBeat, barBeat, pathTable, pathPoint, pathLength };
  if (typeof module === 'object' && module && module.exports) module.exports = T.model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
