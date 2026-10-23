// GeoUI Builder 0.1.0 with its timeline — one file for Blockbench (made by bds/geoui/build.mjs from bds/geoui/geoui_builder.js and
// bds/geoui/timeline/*.js: change those, then node bds/geoui/build.mjs). sources 2d9cdcb0e400
// ---- timeline/model.js
(function (module) {
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
  // (expo and elastic as Penner wrote them jump by ~0.001 at their ends: here they are made to meet 0 and 1 exactly — a time a
  //  hair either side of a key gives the same picture, in the preview and in the game's Molang alike)
  const elasticInRaw = (x) => -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * C4);
  const elasticIORaw = (x) => (x < 0.5 ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * C5)) / 2 : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * C5)) / 2 + 1);
  const EASE_K = Object.freeze({ ei0: elasticInRaw(0), ei1: elasticInRaw(1), eo0: elasticIORaw(0), eo1: elasticIORaw(1) });
  const IN = {
    sine: (x) => 1 - Math.cos((x * PI) / 2),
    quad: POW(2), cubic: POW(3), quart: POW(4), quint: POW(5),
    expo: (x) => (Math.pow(2, 10 * x) - 1) / 1023,
    circ: (x) => 1 - Math.sqrt(Math.max(0, 1 - x * x)),
    back: (x) => C3 * x * x * x - C1 * x * x,
    elastic: (x) => elasticInRaw(x) - EASE_K.ei0 * (1 - x) - (EASE_K.ei1 - 1) * x,
    bounce: (x) => 1 - bounceOut(1 - x),
  };
  const CURVES = { linear: (x) => x, step: (x) => (x >= 1 ? 1 : 0) };
  for (const [k, f] of Object.entries(IN)) { CURVES[`${k}-in`] = f; CURVES[`${k}-out`] = outOf(f); CURVES[`${k}-inout`] = inOutOf(f); }
  // (the in-out forms Penner wrote for these differ from the mirrored in: kept as written)
  CURVES['back-inout'] = (x) => (x < 0.5 ? (Math.pow(2 * x, 2) * ((C2 + 1) * 2 * x - C2)) / 2 : (Math.pow(2 * x - 2, 2) * ((C2 + 1) * (x * 2 - 2) + C2) + 2) / 2);
  CURVES['elastic-inout'] = (x) => elasticIORaw(x) - EASE_K.eo0 * (1 - x) - (EASE_K.eo1 - 1) * x;
  CURVES['bounce-out'] = bounceOut;
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

  // ---------------------------------------------------------------------------------------------------------------- expressions
  // A key's value may be an expression over a template's params ('param.x + 10') and t, the seconds since its clip started
  // ('1 - math.abs(math.mod(t * param.r / param.d, 2) - 1)': a slider's ball going back and forth): numbers, param.<name>, t,
  // + - * /, unary minus, parentheses and Molang's math functions with Molang's meaning (math.sin in degrees) — compile writes
  // the same text into Molang, so what the preview shows is what the game draws. A template's clip may start and end at an
  // expression over params too ('param.d'). Never eval. → (params, t) => number
  const MATH = {
    abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, sign: Math.sign, exp: Math.exp, ln: Math.log, pow: Math.pow,
    sin: (d) => Math.sin((d * PI) / 180), cos: (d) => Math.cos((d * PI) / 180), min: Math.min, max: Math.max,
    clamp: (v, a, b) => Math.min(Math.max(v, a), b), lerp: (a, b, u) => a + (b - a) * u, mod: (a, b) => a % b,
  };
  // (state.<name>: what the game keeps live for the whole play — the cursor, the score, the combo, a spinner's spin: contract.STATES.
  //  evaluate takes them from opts.state — the editor's autoplay, autoplay.js — and the game from the properties the script sets)
  // (screen.dx: how much wider half the screen is than the design's reference aspect, model units — 0 there; GeoUI moves an
  //  element anchored right that much right and one anchored left that much left, so an element moving from one to the other
  //  adds it: evaluate takes it from opts.screen.dx, the game from GeoUI's own v.geoui_halfw)
  let STATE = {}, SCREEN = {};
  const EXPRS = new Map();
  function exprFn(src) {
    const s = String(src);
    if (EXPRS.has(s)) return EXPRS.get(s);
    const tk = s.match(/\d+(?:\.\d+)?|\.\d+|[A-Za-z_][\w.]*|[-+*/(),]|\S/g) || [];
    let i = 0;
    const peek = () => tk[i], take = (x) => { if (x !== undefined && tk[i] !== x) throw new Error(`式「${s}」: ${x} がありません`); return tk[i++]; };
    const primary = () => {
      const t = take();
      if (t === undefined) throw new Error(`式「${s}」が途中で終わっています`);
      if (/^(\d|\.\d)/.test(t)) { const v = +t; return () => v; }
      if (t === 't') return (p, tt) => num(tt);
      if (t === '(') { const e = sum(); take(')'); return e; }
      const m = /^(?:param|p)\.(\w+)$/.exec(t);
      if (m) return (p) => num(p && p[m[1]]);
      const sm = /^state\.(\w+)$/.exec(t);
      if (sm) { if (!STATE_NAMES().includes(sm[1])) throw new Error(`式「${s}」: state.${sm[1]} はありません（${STATE_NAMES().map((x) => `state.${x}`).join('・')}）`); return () => num(STATE[sm[1]]); }
      if (t === 'math.pi') return () => PI;
      if (t === 'screen.dx') return () => num(SCREEN.dx);
      const f = /^math\.(\w+)$/.exec(t);
      if (f && MATH[f[1]]) { take('('); const args = []; if (peek() !== ')') { args.push(sum()); while (peek() === ',') { take(','); args.push(sum()); } } take(')'); const fn = MATH[f[1]]; return (p, tt) => fn(...args.map((a) => a(p, tt))); }
      throw new Error(`式「${s}」: 「${t}」は使えません（param.名前・state.名前・screen.dx・t・数・+ - * /・math.〜 だけ）`);
    };
    const unary = () => { if (peek() === '-') { take(); const e = unary(); return (p, t) => -e(p, t); } if (peek() === '+') { take(); return unary(); } return primary(); };
    const prod = () => { let e = unary(); while (peek() === '*' || peek() === '/') { const op = take(), a = e, b = unary(); e = op === '*' ? (p, t) => a(p, t) * b(p, t) : (p, t) => a(p, t) / b(p, t); } return e; };
    const sum = () => { let e = prod(); while (peek() === '+' || peek() === '-') { const op = take(), a = e, b = prod(); e = op === '+' ? (p, t) => a(p, t) + b(p, t) : (p, t) => a(p, t) - b(p, t); } return e; };
    const fn = sum();
    if (i < tk.length) throw new Error(`式「${s}」: 「${tk[i]}」の所が読めません`);
    EXPRS.set(s, fn);
    return fn;
  }
  const exprError = (src) => { try { exprFn(src); return null; } catch (e) { return e.message; } };
  // (the state names: contract.js's when it is loaded — the one list the game and the preview share — else the same list here)
  const STATE_NAMES = () => (T.contract && T.contract.STATE_NAMES) || ['score', 'combo', 'acc', 'hp', 'cx', 'cy', 'hold', 'spin', 'rpm', 'sa', 'rank', 'maxcombo', 'misses', 'n300', 'n100', 'n50',
    'hd', 'fl', 'nf', 'sd', 'pf', 'auto', 'fc', 'failed', 'record'];
  /** the state names an expression reads (state.<name>), in order of first use */
  const stateRefs = (src) => [...new Set((String(src).match(/\bstate\.(\w+)/g) || []).map((x) => x.slice(6)))];
  const keyValue = (k, params, t) => (typeof k.v === 'string' ? exprFn(k.v)(params || {}, t) : k.v);
  /** a time that may be an expression over params (a template's clip) */
  const timeOf = (v, params) => (typeof v === 'string' ? exprFn(v)(params || {}, 0) : v);
  const isExpr = (v) => typeof v === 'string' && v.trim() !== '' && !exprError(v);

  // ---------------------------------------------------------------------------------------------------------------- the document
  const LOOPS = ['once', 'loop', 'hold', 'pingpong'];
  // (rotationX / rotationY: the element tilted out of the screen, in degrees, as the game's bone rotation about x and y — what
  //  shows the sides of a model's cubes; rotation is the turn in the screen's own plane)
  const PROPS = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'rotationX', 'rotationY', 'opacity', 'value', 'fill', 'frame', 'path'];
  const DEFAULTS = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, rotationX: 0, rotationY: 0, opacity: 1, value: 0, fill: 0, frame: 0, path: 0 };
  const TRANSITIONS = ['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom', 'pop'];
  const SLIDE = 40;          // model units a slide comes in from (or goes out to)
  const MIN_LEN = 1e-3;      // the shortest clip (seconds)
  function num(v, d = 0) { const x = typeof v === 'string' && v.trim() === '' ? NaN : +v; return v !== null && v !== undefined && Number.isFinite(x) ? x : d; }
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const mod = (x, m) => ((x % m) + m) % m;
  const str = (s, d = '') => (typeof s === 'string' ? s : s === undefined || s === null ? d : String(s));
  /** every id in a document (sequences and all in them), to make new ones that clash with none */
  function allIds(doc) {
    const out = [];
    const tracks = (ts) => { for (const tr of ts || []) { out.push(tr && tr.id); for (const c of (tr && tr.clips) || []) out.push(c && c.id); } };
    for (const s of (doc && doc.sequences) || []) {
      if (!s) continue;
      out.push(s.id); tracks(s.tracks);
      for (const k of ['markers', 'paths', 'instances']) for (const x of s[k] || []) out.push(x && x.id);
      for (const tp of s.templates || []) { out.push(tp && tp.id); tracks(tp && tp.tracks); }
    }
    return out.filter((x) => typeof x === 'string' && x);
  }
  function idMaker(used) {
    const taken = new Set(used);
    return (prefix) => { let i = 1; while (taken.has(`${prefix}${i}`)) i++; taken.add(`${prefix}${i}`); return `${prefix}${i}`; };
  }

  // ---- normalize: any document → the plan's shape (defaults filled, ids unique, clips in time order and not overlapping)
  function normKey(k) { return { t: num(k && k.t), v: typeof (k && k.v) === 'string' && k.v.trim() ? k.v.trim() : num(k && k.v), ease: isEase(k && k.ease) ? clone(k.ease) : 'linear' }; }
  function normTransition(tr) { return tr && TRANSITIONS.includes(tr.kind) ? { kind: tr.kind, duration: Math.max(0, num(tr.duration, 0.3)), ease: isEase(tr.ease) ? clone(tr.ease) : 'quad-out' } : null; }
  function normClip(c, id, free) {
    const s0 = free && isExpr(c.start) ? c.start.trim() : num(c.start), start = typeof s0 === 'string' || free ? s0 : Math.max(0, s0);
    const end = free && isExpr(c.end) ? c.end.trim() : typeof start === 'string' ? num(c.end, 1) : Math.max(num(c.end, start + 1), start + MIN_LEN), channels = {};
    for (const p of PROPS) { const ks = c.channels && c.channels[p]; if (Array.isArray(ks) && ks.length) channels[p] = ks.map(normKey).sort((a, b) => a.t - b.t); }
    const out = { id, start, end, offset: num(c.offset), transitionIn: normTransition(c.transitionIn), transitionOut: normTransition(c.transitionOut), channels };
    for (const k of ['name', 'path', 'trigger', 'until', 'sound', 'text', 'media']) if (typeof c[k] === 'string' && c[k]) out[k] = c[k];
    if (c.volume !== undefined) out.volume = num(c.volume, 1);
    if (c.pitch !== undefined) out.pitch = num(c.pitch, 1);
    return out;
  }
  /** a track's clips in time order, each pushed after the one before it when they overlap (its length kept) */
  function settle(track) {
    if (track.clips.some((c) => typeof c.start === 'string' || typeof c.end === 'string')) return track;   // (a template's clips timed by params: as written)
    track.clips.sort((a, b) => a.start - b.start);
    for (let i = 1; i < track.clips.length; i++) { const p = track.clips[i - 1], c = track.clips[i]; if (!c.trigger && !p.trigger && c.start < p.end - 1e-9) { const len = c.end - c.start; c.start = p.end; c.end = p.end + len; } }
    return track;
  }
  function normalize(doc0) {
    const doc = doc0 && typeof doc0 === 'object' ? doc0 : {};
    const mk = idMaker(allIds(doc)), seen = new Set();
    const idOf = (id, prefix) => { if (typeof id === 'string' && id && !seen.has(id)) { seen.add(id); return id; } const n = mk(prefix); seen.add(n); return n; };
    const normTrack = (tr, free) => settle({
      id: idOf(tr && tr.id, 'tr'), kind: tr && tr.kind === 'audio' ? 'audio' : 'layer', target: str(tr && tr.target), name: str(tr && tr.name, str(tr && tr.target)),
      muted: Boolean(tr && tr.muted), locked: Boolean(tr && tr.locked), solo: Boolean(tr && tr.solo),
      clips: ((tr && tr.clips) || []).filter((c) => c && typeof c === 'object').map((c) => normClip(c, idOf(c.id, 'c'), free)),
    });
    const sequences = ((doc && doc.sequences) || []).filter((s) => s && typeof s === 'object').map((s) => {
      const duration = Math.max(0.05, num(s.duration, 10)), io = Array.isArray(s.inOut) ? s.inOut.map((x) => num(x, NaN)) : null;
      return {
        id: idOf(s.id, 'seq'), name: str(s.name, 'シーケンス') || 'シーケンス', duration, fps: Math.min(240, Math.max(1, Math.round(num(s.fps, 20)))), loop: LOOPS.includes(s.loop) ? s.loop : 'once',
        inOut: io && io.length === 2 && io[0] >= 0 && io[1] > io[0] && io[1] <= duration + 1e-9 ? io : null,
        tempo: (s.tempo || []).filter((p) => p && num(p.bpm) > 0).map((p) => ({ t: num(p.t), bpm: num(p.bpm), meter: Math.max(1, Math.round(num(p.meter, 4))) })).sort((a, b) => a.t - b.t),
        markers: (s.markers || []).filter(Boolean).map((m) => Object.assign({ id: idOf(m.id, 'm'), t: Math.max(0, num(m.t)), name: str(m.name) }, typeof m.event === 'string' && m.event ? { event: m.event } : {})).sort((a, b) => a.t - b.t),
        paths: (s.paths || []).filter(Boolean).map((p) => Object.assign({ id: idOf(p.id, 'p'), kind: ['linear', 'bezier', 'catmull', 'arc'].includes(p.kind) ? p.kind : 'linear', points: (p.points || []).filter((q) => Array.isArray(q) && q.length >= 2).map((q) => [num(q[0]), num(q[1])]) },
          num(p.length) > 0 ? { length: num(p.length) } : {})),   // (length: osu!'s pixel length — the path cut, or gone on straight, to it)
        templates: (s.templates || []).filter(Boolean).map((tp) => Object.assign({ id: idOf(tp.id, 'tpl'), name: str(tp.name, 'テンプレート'), lead: Math.max(0, num(tp.lead, 1)), tail: Math.max(0, num(tp.tail, 0.5)),
          params: (tp.params || []).filter((x) => typeof x === 'string' && /^\w+$/.test(x)), tracks: (tp.tracks || []).filter(Boolean).map((tr) => normTrack(tr, true)) },
          // (how a streamed instance's params fit in one property: contract.js checks it)
          Array.isArray(tp.pack) && tp.pack.length && tp.pack.every((f) => f && /^\w+$/.test(String(f.name)) && Number.isInteger(f.bits) && num(f.max, NaN) > num(f.min, NaN)) ? { pack: tp.pack.map((f) => ({ name: String(f.name), bits: f.bits, min: num(f.min), max: num(f.max) })) } : {},
          // (how the game judges its instances — a hit circle, a slider, a spinner: runtime.js — kept as written)
          tp.judge && typeof tp.judge === 'object' && ['circle', 'slider', 'spinner'].includes(tp.judge.kind) ? { judge: clone(tp.judge) } : {})),
        instances: (s.instances || []).filter(Boolean).map((x) => Object.assign({ id: idOf(x.id, 'i'), template: str(x.template), t: num(x.t), params: Object.fromEntries(Object.entries(x.params || {}).filter(([k]) => /^\w+$/.test(k)).map(([k, v]) => [k, num(v)])) },
          typeof x.path === 'string' && x.path ? { path: x.path } : {}, num(x.tail, NaN) >= 0 ? { tail: num(x.tail) } : {})).sort((a, b) => a.t - b.t),
        tracks: (s.tracks || []).filter(Boolean).map((tr) => normTrack(tr, false)),
        // (how the game plays it — osu!'s rules for a beatmap, osugame.js: kept as written, the runtime and the preview read it)
        ...(s.game && typeof s.game === 'object' && Array.isArray(s.game.objects) ? { game: s.game } : {}),
      };
    });
    return { version: 1, sequences };
  }

  // ---- validate: what is wrong with a document as given (Japanese, one line each; [] = nothing)
  function validate(doc) {
    const out = [];
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.sequences)) return ['文書の形ではありません（{ version: 1, sequences: [...] }）'];
    const ids = new Map();
    for (const id of allIds(doc)) ids.set(id, (ids.get(id) || 0) + 1);
    for (const [id, n] of ids) if (n > 1) out.push(`id「${id}」が ${n} 回使われています`);
    for (const s of doc.sequences) {
      const at = `シーケンス「${str(s && s.name, '?')}」`;
      if (!s || typeof s !== 'object') { out.push('シーケンスの形ではない物があります'); continue; }
      if (!(num(s.duration, NaN) > 0)) out.push(`${at}: 長さ（duration）が正の数ではありません`);
      if (s.loop !== undefined && !LOOPS.includes(s.loop)) out.push(`${at}: loop「${s.loop}」は once・loop・hold・pingpong のどれでもありません`);
      const pathIds = new Set((s.paths || []).map((p) => p && p.id)), tplIds = new Set((s.templates || []).map((x) => x && x.id));
      const tracks = (ts, where, free) => {
        for (const tr of ts || []) {
          const clips = ((tr && tr.clips) || []).slice().sort((a, b) => num(a.start) - num(b.start));
          clips.forEach((c, i) => {
            const cat = `${where} トラック「${str(tr.name || tr.target || tr.id)}」のクリップ ${str(c.id, '?')}`;
            if (free && (typeof c.start === 'string' || typeof c.end === 'string')) { for (const v of [c.start, c.end]) if (typeof v === 'string' && exprError(v)) out.push(`${cat}: ${exprError(v)}`); }
            else if (!(num(c.end, NaN) > num(c.start, NaN))) out.push(`${cat}: 終わりが始まりより後ではありません`);
            if (!free && num(c.start) < 0) out.push(`${cat}: 始まりが 0 より前です`);
            if (i && !c.trigger && !clips[i - 1].trigger && num(c.start) < num(clips[i - 1].end) - 1e-9) out.push(`${cat}: 前のクリップと重なっています`);
            if (c.path && c.path !== '@instance' && !pathIds.has(c.path)) out.push(`${cat}: 道「${c.path}」がありません`);
            for (const tr2 of [c.transitionIn, c.transitionOut]) if (tr2 && !TRANSITIONS.includes(tr2.kind)) out.push(`${cat}: トランジション「${tr2.kind}」は知りません`);
            for (const [p, ks] of Object.entries(c.channels || {})) {
              if (!PROPS.includes(p)) { out.push(`${cat}: 「${p}」は動かせるものではありません（${PROPS.join('・')}）`); continue; }
              for (const k of ks || []) {
                if (k.ease !== undefined && !isEase(k.ease)) out.push(`${cat} の ${p}: イージング ${JSON.stringify(k.ease)} は知りません`);
                if (typeof k.v === 'string') { const e = exprError(k.v); if (e) out.push(`${cat} の ${p}: ${e}`); } else if (!Number.isFinite(+k.v)) out.push(`${cat} の ${p}: 値が数ではありません`);
              }
            }
          });
        }
      };
      tracks(s.tracks, at, false);
      for (const tp of s.templates || []) tracks(tp && tp.tracks, `${at} のテンプレート「${str(tp && tp.name, '?')}」`, true);
      for (const x of s.instances || []) if (!tplIds.has(x && x.template)) out.push(`${at}: 実体 ${str(x && x.id, '?')} のテンプレート「${str(x && x.template)}」がありません`);
      for (const p of s.tempo || []) if (!(num(p && p.bpm) > 0)) out.push(`${at}: tempo の BPM が正の数ではありません`);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------- evaluate
  /** where a sequence is at time t of playing it: loop and pingpong over its in/out range (or the whole), hold stops on its
   *  end (a microsecond before it, where the clips ending there still show), once runs on (past its end every clip is
   *  over). An exact loop length is the next round (its start) */
  function seqTime(seq, t) {
    const [a, b] = seq.inOut || [0, seq.duration], len = b - a;
    if (seq.loop === 'hold') return Math.min(t, b - 1e-6);   // (its last picture: a clip ends just before its end time)
    if (!(len > 0) || t < a) return t;
    if (seq.loop === 'loop') return a + mod(t - a, len);
    if (seq.loop === 'pingpong') { const m = mod(t - a, 2 * len); return a + (m <= len ? m : 2 * len - m); }
    return t;
  }
  /** a channel's value at tc seconds from its clip's start (undefined: the clip has no such channel). Before the first key:
   *  the first value; after the last: the last; between: the segment's ease from its first key (a time exactly on a key
   *  belongs to the segment that starts there) */
  function channelAt(clip, prop, tc, params) {
    const ks = clip && clip.channels && clip.channels[prop];
    if (!ks || !ks.length) return undefined;
    if (ks.length === 1 || tc <= ks[0].t) return keyValue(ks[0], params, tc);
    const last = ks[ks.length - 1];
    if (tc >= last.t) return keyValue(last, params, tc);
    let lo = 0, hi = ks.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ks[mid].t <= tc) lo = mid; else hi = mid; }
    const a = ks[lo], b = ks[hi], v0 = keyValue(a, params, tc), v1 = keyValue(b, params, tc);
    return v0 + (v1 - v0) * ease(a.ease, (tc - a.t) / (b.t - a.t));
  }
  /** a transition at p (0: not in, 1: fully in) on a state */
  function applyTransition(s, kind, p) {
    if (kind === 'fade') s.opacity *= p;
    else if (kind === 'slide-left') s.x -= (1 - p) * SLIDE;       // (comes in from the left, goes out to it)
    else if (kind === 'slide-right') s.x += (1 - p) * SLIDE;
    else if (kind === 'slide-up') s.y += (1 - p) * SLIDE;         // (from above: the model's y is up)
    else if (kind === 'slide-down') s.y -= (1 - p) * SLIDE;
    else if (kind === 'zoom') { s.scaleX *= p; s.scaleY *= p; }
    else if (kind === 'pop') { const f = p < 0.7 ? (p / 0.7) * 1.1 : 1.1 - ((p - 0.7) / 0.3) * 0.1; s.scaleX *= f; s.scaleY *= f; }
  }
  /** whether an event answers a clip's trigger / until: its own name, and 'hit' for every judgement of a hit (osu!'s 300 / 100 / 50:
   *  great, good, ok — contract.RESULTS; and 'tap' for a bare 'hit' alone: an osu! slider's head, not its final judgement) */
  const evMatch = (want, name) => want === name || (want === 'hit' && (name === 'great' || name === 'good' || name === 'ok')) || (want === 'tap' && name === 'hit');
  /** the clip of a track shown at sequence time u (zero: the track's time origin — 0, or an instance's time), with the time
   *  in it: trigger clips (from the latest such event) before the others; until cuts a clip at its first such event */
  function activeClip(track, u, zero, events, inst, params) {
    let found = null;
    const is = evMatch;
    for (const c of track.clips) {
      let s0, e0, cut = false;
      const cs = timeOf(c.start, params), ce = timeOf(c.end, params);
      if (c.trigger) { let ev = null; for (const e of events) if (is(c.trigger, e.name) && (e.instance || null) === inst && e.t <= u + 1e-9 && (!ev || e.t > ev.t)) ev = e; if (!ev) continue; s0 = ev.t + cs; e0 = ev.t + ce; }
      else { s0 = zero + cs; e0 = zero + ce; }
      if (c.until) for (const e of events) if (is(c.until, e.name) && (e.instance || null) === inst && e.t >= s0 - 1e-9 && e.t < e0) { e0 = e.t; cut = true; }
      if (u >= s0 - 1e-9 && u < e0) { const hit = { clip: c, tc: Math.max(0, u - s0), left: e0 - u, cut }; if (c.trigger) return hit; if (!found) found = hit; }
    }
    return found;
  }
  function clipState(seq, hit, params, instPath) {
    const c = hit.clip, s = {};
    for (const p of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity']) { const v = channelAt(c, p, hit.tc, params); s[p] = v === undefined ? DEFAULTS[p] : v; }
    for (const p of ['rotationX', 'rotationY']) { const v = channelAt(c, p, hit.tc, params); if (v !== undefined) s[p] = v; }
    for (const p of ['value', 'fill', 'frame']) { const v = channelAt(c, p, hit.tc, params); if (v !== undefined) s[p] = v; }
    const pid = c.path === '@instance' ? instPath : c.path, path = pid && (seq.paths || []).find((x) => x.id === pid), u = channelAt(c, 'path', hit.tc, params);
    if (path && u !== undefined) { const pt = pathPoint(path, u, { length: path.length }); s.x += pt[0]; s.y += pt[1]; }
    if (c.transitionIn && hit.tc < c.transitionIn.duration) applyTransition(s, c.transitionIn.kind, ease(c.transitionIn.ease, hit.tc / c.transitionIn.duration));
    if (c.transitionOut && !hit.cut && hit.left < c.transitionOut.duration) applyTransition(s, c.transitionOut.kind, ease(c.transitionOut.ease, hit.left / c.transitionOut.duration));
    s.opacity = clamp01(s.opacity);
    if (s.fill !== undefined) s.fill = clamp01(s.fill);
    s.visible = true;
    return s;
  }
  /** the states of a set of tracks at sequence time u: { target: state } — a track with no clips leaves its element alone;
   *  muted (or not solo while one is) hides it; the top track with a clip there wins */
  function tracksState(seq, tracks, u, zero, ctx, inst, suffix, out) {
    for (const tr of tracks) {
      if (tr.kind !== 'layer' || !tr.target || !tr.clips.length) continue;
      const key = tr.target + suffix;
      if (out[key] && out[key].visible) continue;
      if (tr.muted || (ctx.solo && !tr.solo && !inst)) { out[key] = out[key] || { visible: false }; continue; }
      const hit = activeClip(tr, u, zero, ctx.events, inst, ctx.params);
      out[key] = hit ? clipState(seq, hit, ctx.params, ctx.path) : out[key] || { visible: false };
    }
  }
  // (the longest an instance stays out after its time, kept per instances list: the window evaluate searches)
  const TAILS = new WeakMap();
  function maxTailOf(seq) { const xs = seq.instances; if (!TAILS.has(xs)) TAILS.set(xs, xs.reduce((m, x) => (x.tail !== undefined ? Math.max(m, x.tail) : m), 0)); return TAILS.get(xs); }
  const seqOf = (doc, seqId) => ((doc && doc.sequences) || []).find((s) => s.id === seqId) || (seqId == null ? ((doc && doc.sequences) || [])[0] : null);
  /** every element's state at time t of playing a sequence: { 'element': { visible, x, y, scaleX, scaleY, rotation,
   *  opacity, value?, fill?, frame? } }; a template's instance only while it is out (t − lead … t + tail), as
   *  'element#instance'. opts.events = [{ instance, name, t }] (hits, misses: what trigger and until clips answer; an event with
   *  no instance answers the sequence's own tracks: a shake on any miss), opts.state = { name: value } (state.<name>),
   *  opts.screen = { dx } (screen.dx: the screen's half width past the reference aspect's) */
  function evaluate(doc, seqId, t, opts = {}) {
    const seq = seqOf(doc, seqId), out = {};
    if (!seq) return out;
    const u = seqTime(seq, num(t)), events = Array.isArray(opts.events) ? opts.events : [];
    STATE = opts.state && typeof opts.state === 'object' ? opts.state : {};
    SCREEN = opts.screen && typeof opts.screen === 'object' ? opts.screen : {};
    const solo = seq.tracks.some((tr) => tr.solo);
    tracksState(seq, seq.tracks, u, 0, { events, solo, params: {} }, null, '', out);
    const tpls = new Map((seq.templates || []).map((x) => [x.id, x]));
    if (seq.instances && seq.instances.length && tpls.size) {
      let lead = 0, tail = maxTailOf(seq);
      for (const x of tpls.values()) { lead = Math.max(lead, x.lead); tail = Math.max(tail, x.tail); }
      const xs = seq.instances;
      let lo = 0, hi = xs.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid].t < u - tail) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < xs.length && xs[i].t <= u + lead; i++) {
        const x = xs[i], tp = tpls.get(x.template);
        if (!tp || u < x.t - tp.lead - 1e-9 || u >= x.t + (x.tail !== undefined ? x.tail : tp.tail)) continue;
        tracksState(seq, tp.tracks, u, x.t, { events, solo: false, params: x.params, path: x.path }, x.id, `#${x.id}`, out);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------- reduce
  // An edit (an intent from the timeline, the inspector, a preset, an import) → a new document; the old one is never
  // changed (only the sequence edited is copied). Fails with a reason the person reads (Japanese)
  const fail = (m) => { throw new Error(m); };
  function containerOf(seq, intent) {
    if (!intent.template) return { tracks: seq.tracks, free: false };
    const tp = seq.templates.find((x) => x.id === intent.template) || fail(`テンプレート「${intent.template}」がありません`);
    return { tracks: tp.tracks, free: true };
  }
  function clipAt(cont, id) {
    for (const track of cont.tracks) { const i = track.clips.findIndex((c) => c.id === id); if (i >= 0) return { track, clip: track.clips[i], i }; }
    return fail(`クリップ「${id}」がありません`);
  }
  const unlocked = (track) => (track.locked ? fail(`トラック「${track.name || track.target}」は固定されています`) : track);
  function snapPoints(seq, cont, skip, intent) {
    const c = [];
    for (const tr of cont.tracks) for (const cl of tr.clips) {
      if (skip.has(cl.id)) continue;
      c.push(cl.start, cl.end);
      for (const ks of Object.values(cl.channels)) for (const k of ks) c.push(cl.start + k.t);
    }
    for (const m of seq.markers) c.push(m.t);
    if (Number.isFinite(intent.playhead)) c.push(intent.playhead);
    return c;
  }
  /** t snapped: to the nearest point within snapTol (default 0.1 s), else to the beat grid (beatDiv) within it, else to frames */
  function snapOne(seq, t, points, intent) {
    const tol = num(intent.snapTol, 0.1);
    let best = null, bd = tol;
    for (const p of points) { const d = Math.abs(p - t); if (d <= bd) { bd = d; best = p; } }
    if (best !== null) return best;
    if (intent.beatDiv) { const b = snapToBeat(seq, t, intent.beatDiv); if (Math.abs(b - t) <= tol) return b; }
    return Math.round(t * seq.fps) / seq.fps;
  }
  /** the delta nearest dt that puts every moved clip on its track without overlapping the others there (and not before 0) */
  function freeDelta(moves, dt, free) {
    const ok = (d) => moves.every(({ clip, to }) => (free || clip.start + d >= -1e-9) && to.clips.every((o) => o.trigger || clip.trigger || moves.some((m) => m.clip === o) || clip.end + d <= o.start + 1e-9 || clip.start + d >= o.end - 1e-9));
    if (ok(dt)) return dt;
    const cands = [];
    for (const { clip, to } of moves) for (const o of to.clips) { if (moves.some((m) => m.clip === o)) continue; cands.push(o.end - clip.start, o.start - clip.end); }
    if (!free) for (const { clip } of moves) cands.push(-clip.start);
    cands.sort((a, b) => Math.abs(a - dt) - Math.abs(b - dt));
    for (const d of cands) if (ok(d)) return d;
    return fail('重ならない場所がありません');
  }
  function shiftAfter(track, from, by, skip) { for (const c of track.clips) if (!skip.has(c.id) && c.start >= from - 1e-9) { c.start += by; c.end += by; } }
  function keyAt(clip, prop, tc, v, easeName) {
    const ks = (clip.channels[prop] = clip.channels[prop] || []);
    const i = ks.findIndex((k) => Math.abs(k.t - tc) < 1e-6);
    const k = { t: tc, v: v === undefined ? (channelAt(clip, prop, tc, {}) ?? DEFAULTS[prop]) : typeof v === 'string' ? v : num(v), ease: isEase(easeName) ? clone(easeName) : i >= 0 ? ks[i].ease : 'linear' };
    if (i >= 0) ks[i] = k; else { ks.push(k); ks.sort((a, b) => a.t - b.t); }
  }
  /** one clip cut in two at sequence time t: the left keeps its keys up to t, the right gets the rest; both get a key on the
   *  cut with the value there (the picture does not jump); the out-transition goes to the right */
  function splitClip(track, clip, t, mk) {
    const tc = t - clip.start, right = clone(clip);
    right.id = mk('c'); right.start = t; right.offset = clip.offset + tc; right.transitionIn = null;
    for (const p of Object.keys(clip.channels)) {
      const v = channelAt(clip, p, tc, {}), L = clip.channels[p].filter((k) => k.t < tc - 1e-9), R = clip.channels[p].filter((k) => k.t > tc + 1e-9).map((k) => ({ ...k, t: k.t - tc }));
      const at = clip.channels[p].find((k) => Math.abs(k.t - tc) <= 1e-9), easeAt = at ? at.ease : (L.length ? L[L.length - 1].ease : 'linear');
      clip.channels[p] = [...L, { t: tc, v, ease: L.length ? L[L.length - 1].ease : 'linear' }];
      right.channels[p] = [{ t: 0, v, ease: easeAt }, ...R];
    }
    clip.end = t; clip.transitionOut = null;
    track.clips.splice(track.clips.indexOf(clip) + 1, 0, right);
    return right;
  }
  function remapIds(frag, mk) {
    // (a fragment pasted in — a preset, an import: every id made new, its references with it)
    const map = new Map(), id = (old, prefix) => { const n = mk(prefix); if (old) map.set(old, n); return n; };
    const f = clone(frag) || {};
    for (const p of f.paths || []) p.id = id(p.id, 'p');
    for (const tp of f.templates || []) { tp.id = id(tp.id, 'tpl'); for (const tr of tp.tracks || []) { tr.id = id(tr.id, 'tr'); for (const c of tr.clips || []) c.id = id(c.id, 'c'); } }
    for (const tr of f.tracks || []) { tr.id = id(tr.id, 'tr'); for (const c of tr.clips || []) c.id = id(c.id, 'c'); }
    for (const m of f.markers || []) m.id = id(m.id, 'm');
    for (const x of f.instances || []) x.id = id(x.id, 'i');
    const re = (c) => { if (c.path && map.has(c.path)) c.path = map.get(c.path); };
    for (const tp of f.templates || []) for (const tr of tp.tracks || []) (tr.clips || []).forEach(re);
    for (const tr of f.tracks || []) (tr.clips || []).forEach(re);
    for (const x of f.instances || []) { if (map.has(x.template)) x.template = map.get(x.template); re(x); }   // (an instance's own path too: osu!'s sliders)
    return f;
  }
  /** the fragment's parts in the sequence's shape (normalize's rules, the ids kept) */
  function normPart(frag) {
    const s = normalize({ sequences: [Object.assign({ id: '__frag', duration: 1 }, frag)] }).sequences[0];
    return s;
  }
  const PATCH = {
    seq: ['name', 'duration', 'fps', 'loop', 'inOut'], track: ['name', 'muted', 'locked', 'solo', 'target'],
    clip: ['name', 'offset', 'transitionIn', 'transitionOut', 'path', 'trigger', 'until', 'sound', 'volume', 'pitch', 'text', 'media'],
    marker: ['t', 'name', 'event'], tempo: ['t', 'bpm', 'meter'], path: ['kind', 'points', 'length'], template: ['name', 'lead', 'tail', 'params'], instance: ['t', 'template', 'params'],
  };
  const patchOf = (kind, patch) => Object.fromEntries(Object.entries(patch || {}).filter(([k]) => PATCH[kind].includes(k)));
  function reduce(doc, intent) {
    try {
      if (!intent || typeof intent.type !== 'string') fail('intent の形ではありません');
      // (several edits as one — the inspector's change to many selected things, one undo step: all of them or none)
      // (a later intent may name what an earlier one made: '$0' is the id the first one returned, '$1' the second's …)
      if (intent.type === 'batch') {
        let d = doc;
        const ids = [];
        for (const it0 of intent.intents || []) {
          const it = Object.fromEntries(Object.entries(it0 || {}).map(([k, v]) => { const m = typeof v === 'string' && /^\$(\d+)$/.exec(v); return [k, m ? ids[+m[1]] : v]; }));
          const r = reduce(d, it);
          if (!r.ok) return { doc, ok: false, error: r.error };
          d = r.doc; ids.push(r.id);
        }
        return { doc: d, ok: true, ids, id: ids[ids.length - 1] };
      }
      const mk = idMaker(allIds(doc));
      if (intent.type === 'seq.add') {
        const s = normalize({ sequences: [{ id: mk('seq'), name: intent.name || `シーケンス ${((doc && doc.sequences) || []).length + 1}`, duration: num(intent.duration, 10), fps: num(intent.fps, 20) }] }).sequences[0];
        return { doc: { version: 1, sequences: [...((doc && doc.sequences) || []), s] }, ok: true, id: s.id };
      }
      const src = seqOf(doc, intent.seq) || fail(`シーケンス「${intent.seq}」がありません`);
      if (intent.type === 'seq.remove') return { doc: { ...doc, sequences: doc.sequences.filter((s) => s !== src) }, ok: true };
      const seq = clone(src), next = { ...doc, sequences: doc.sequences.map((s) => (s === src ? seq : s)) };
      const done = (extra) => Object.assign({ doc: next, ok: true }, extra || {});
      const T0 = intent.type;
      if (T0 === 'seq.set') { const n = normalize({ sequences: [Object.assign({}, seq, patchOf('seq', intent.patch))] }).sequences[0]; Object.assign(seq, { name: n.name, duration: n.duration, fps: n.fps, loop: n.loop, inOut: n.inOut }); return done(); }
      if (T0.startsWith('track.')) {
        const cont = containerOf(seq, intent);
        if (T0 === 'track.add') {
          const tr = { id: mk('tr'), kind: intent.kind === 'audio' ? 'audio' : 'layer', target: str(intent.target), name: str(intent.name, str(intent.target)), muted: false, locked: false, solo: false, clips: [] };
          cont.tracks.splice(Number.isInteger(intent.index) ? Math.max(0, Math.min(intent.index, cont.tracks.length)) : cont.tracks.length, 0, tr);
          return done({ id: tr.id });
        }
        const i = cont.tracks.findIndex((x) => x.id === intent.track);
        if (i < 0) fail(`トラック「${intent.track}」がありません`);
        if (T0 === 'track.remove') { cont.tracks.splice(i, 1); return done(); }
        if (T0 === 'track.set') { Object.assign(cont.tracks[i], patchOf('track', intent.patch)); return done(); }
        if (T0 === 'track.move') { const [tr] = cont.tracks.splice(i, 1); cont.tracks.splice(Math.max(0, Math.min(num(intent.index), cont.tracks.length)), 0, tr); return done(); }
      }
      if (T0.startsWith('clip.')) {
        const cont = containerOf(seq, intent);
        if (T0 === 'clip.add') {
          const track = unlocked(cont.tracks.find((x) => x.id === intent.track) || fail(`トラック「${intent.track}」がありません`));
          const c = normClip(Object.assign({}, intent.clip || {}, { start: intent.start, end: intent.end }), mk('c'), cont.free);
          const d = freeDelta([{ clip: c, to: track }], 0, cont.free);
          c.start += d; c.end += d; track.clips.push(c); settle(track);
          return done({ id: c.id });
        }
        if (T0 === 'clip.remove') {
          const ids = new Set(intent.ids || []);
          for (const id of ids) {
            const { track, clip } = clipAt(cont, id); unlocked(track);
            track.clips.splice(track.clips.indexOf(clip), 1);
            if (intent.ripple) shiftAfter(track, clip.end, -(clip.end - clip.start), new Set());
          }
          return done();
        }
        if (T0 === 'clip.move') {
          const ids = new Set(intent.ids || []);
          if (!ids.size) fail('動かすクリップがありません');
          const found = [...ids].map((id) => clipAt(cont, id)), dTrack = Math.round(num(intent.dTrack));
          const moves = found.map(({ track, clip }) => {
            unlocked(track);
            if (!dTrack) return { clip, from: track, to: track };
            const same = cont.tracks.filter((x) => x.kind === track.kind), j = Math.max(0, Math.min(same.length - 1, same.indexOf(track) + dTrack));
            return { clip, from: track, to: unlocked(same[j]) };
          });
          let dt = num(intent.dt);
          if (intent.snap) {
            const pts = snapPoints(seq, cont, ids, intent);
            const lo = Math.min(...moves.map((m) => m.clip.start)), hi = Math.max(...moves.map((m) => m.clip.end));
            const adj = [snapOne(seq, lo + dt, pts, intent) - (lo + dt), snapOne(seq, hi + dt, pts, intent) - (hi + dt)].filter((a) => Math.abs(a) > 1e-12);
            if (adj.length) dt += adj.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
          }
          dt = freeDelta(moves, dt, cont.free);
          for (const m of moves) { m.clip.start += dt; m.clip.end += dt; if (m.to !== m.from) { m.from.clips.splice(m.from.clips.indexOf(m.clip), 1); m.to.clips.push(m.clip); } }
          for (const tr of new Set(moves.flatMap((m) => [m.from, m.to]))) tr.clips.sort((a, b) => a.start - b.start);
          return done({ dt });
        }
        if (T0 === 'clip.trim') {
          const { track, clip, i } = clipAt(cont, intent.id); unlocked(track);
          let t = num(intent.t, NaN);
          if (!Number.isFinite(t)) fail('トリムする時刻がありません');
          if (intent.snap) t = snapOne(seq, t, snapPoints(seq, cont, new Set([clip.id]), intent), intent);
          const prev = track.clips[i - 1], nextC = track.clips[i + 1];
          if (intent.edge === 'start') {
            t = Math.min(t, clip.end - MIN_LEN); if (prev) t = Math.max(t, prev.end); if (!cont.free) t = Math.max(0, t);
            const d = t - clip.start;
            for (const ks of Object.values(clip.channels)) for (const k of ks) k.t -= d;
            clip.start = t; clip.offset += d;
          } else {
            const old = clip.end;
            t = Math.max(t, clip.start + MIN_LEN); if (nextC && !intent.ripple) t = Math.min(t, nextC.start);
            clip.end = t;
            if (intent.ripple) shiftAfter(track, old, t - old, new Set([clip.id]));
          }
          return done();
        }
        if (T0 === 'clip.split') {
          const t = num(intent.t, NaN), made = [];
          if (!Number.isFinite(t)) fail('切る時刻がありません');
          const ids = intent.ids && intent.ids.length ? new Set(intent.ids) : null;
          for (const track of cont.tracks) {
            if (track.locked) continue;
            for (const clip of track.clips.slice()) if ((!ids || ids.has(clip.id)) && clip.start < t - MIN_LEN && clip.end > t + MIN_LEN) made.push(splitClip(track, clip, t, mk).id);
          }
          return done({ ids: made });
        }
        if (T0 === 'clip.duplicate') {
          const found = (intent.ids || []).map((id) => clipAt(cont, id));
          if (!found.length) fail('複製するクリップがありません');
          const lo = Math.min(...found.map((f) => f.clip.start)), hi = Math.max(...found.map((f) => f.clip.end)), shift = (Number.isFinite(intent.at) ? intent.at : hi) - lo, made = [];
          const copies = found.map(({ track, clip }) => { const c = clone(clip); c.id = mk('c'); return { clip: c, from: unlocked(track), to: track }; });
          for (const m of copies) m.to.clips.push(m.clip);
          const d = freeDelta(copies, shift, cont.free);
          for (const m of copies) { m.clip.start += d; m.clip.end += d; made.push(m.clip.id); m.to.clips.sort((a, b) => a.start - b.start); }
          return done({ ids: made });
        }
        if (T0 === 'clip.set') {
          const { track, clip } = clipAt(cont, intent.id); unlocked(track);
          const n = normClip(Object.assign(clone(clip), patchOf('clip', intent.patch)), clip.id, cont.free);
          for (const k of PATCH.clip) { if (n[k] === undefined) delete clip[k]; else clip[k] = n[k]; }
          return done();
        }
      }
      if (T0.startsWith('key.')) {
        const cont = containerOf(seq, intent);
        if (T0 === 'key.add') {
          if (!PROPS.includes(intent.prop)) fail(`「${intent.prop}」は動かせるものではありません`);
          const { track, clip } = clipAt(cont, intent.clip); unlocked(track);
          keyAt(clip, intent.prop, num(intent.t), intent.v, intent.ease);
          return done();
        }
        const keysOf = (list) => (list || []).map((k) => { const { track, clip } = clipAt(cont, k.clip); unlocked(track); const ks = clip.channels[k.prop]; if (!ks || !ks[k.index]) fail(`鍵（${k.clip} ${k.prop} ${k.index}）がありません`); return { clip, prop: k.prop, key: ks[k.index] }; });
        if (T0 === 'key.remove') {
          for (const { clip, prop, key } of keysOf(intent.keys)) { const ks = clip.channels[prop]; ks.splice(ks.indexOf(key), 1); if (!ks.length) delete clip.channels[prop]; }
          return done();
        }
        if (T0 === 'key.move') {
          const ks = keysOf(intent.keys), dt = num(intent.dt), dv = num(intent.dv);
          for (const { key } of ks) { key.t += dt; if (dv && typeof key.v === 'number') key.v += dv; }
          for (const { clip, prop } of ks) clip.channels[prop].sort((a, b) => a.t - b.t);
          return done();
        }
        if (T0 === 'key.set') {
          const [{ clip, prop, key }] = keysOf([{ clip: intent.clip, prop: intent.prop, index: intent.index }]), p = intent.patch || {};
          if (p.t !== undefined) key.t = num(p.t, key.t);
          if (p.v !== undefined) key.v = typeof p.v === 'string' && p.v.trim() && !Number.isFinite(+p.v) ? (exprError(p.v) ? fail(exprError(p.v)) : p.v.trim()) : num(p.v, key.v);
          if (p.ease !== undefined) key.ease = isEase(p.ease) ? clone(p.ease) : fail(`イージング ${JSON.stringify(p.ease)} は知りません`);
          clip.channels[prop].sort((a, b) => a.t - b.t);
          return done();
        }
      }
      const listOp = (kind, list, prefix, made) => {
        if (T0 === `${kind}.add`) { const x = made(mk(prefix)); list.push(x); return done({ id: x.id }); }
        const i = list.findIndex((x) => x.id === intent.id);
        if (i < 0 && T0 !== `${kind}.remove`) fail(`「${intent.id}」がありません`);
        if (T0 === `${kind}.remove`) { const ids = new Set(intent.ids || [intent.id]); for (let k = list.length - 1; k >= 0; k--) if (ids.has(list[k].id)) list.splice(k, 1); return null; }
        Object.assign(list[i], patchOf(kind, intent.patch));
        return null;
      };
      if (T0.startsWith('marker.')) {
        const r = listOp('marker', seq.markers, 'm', (id) => Object.assign({ id, t: Math.max(0, num(intent.t)), name: str(intent.name) }, intent.event ? { event: str(intent.event) } : {}));
        seq.markers.sort((a, b) => a.t - b.t); return r || done();
      }
      if (T0.startsWith('tempo.')) {
        if (T0 === 'tempo.add') { if (!(num(intent.bpm) > 0)) fail('BPM は正の数で'); seq.tempo.push({ t: num(intent.t), bpm: num(intent.bpm), meter: Math.max(1, Math.round(num(intent.meter, 4))) }); }
        else { const i = Math.round(num(intent.index, -1)); if (!seq.tempo[i]) fail('その tempo の点はありません'); if (T0 === 'tempo.remove') seq.tempo.splice(i, 1); else { Object.assign(seq.tempo[i], patchOf('tempo', intent.patch)); if (!(seq.tempo[i].bpm > 0)) fail('BPM は正の数で'); } }
        seq.tempo.sort((a, b) => a.t - b.t); return done();
      }
      if (T0.startsWith('path.')) {
        const r = listOp('path', seq.paths, 'p', (id) => normPart({ paths: [Object.assign({}, intent.path || {}, { id })] }).paths[0]);
        if (T0 === 'path.set') { const p = seq.paths.find((x) => x.id === intent.id); Object.assign(p, normPart({ paths: [p] }).paths[0]); }
        return r || done();
      }
      if (T0.startsWith('template.')) {
        const r = listOp('template', seq.templates, 'tpl', (id) => normPart({ templates: [Object.assign({ name: 'テンプレート' }, intent.template || {}, { id })] }).templates[0]);
        if (T0 === 'template.remove') { const ids = new Set(intent.ids || [intent.id]); seq.instances = seq.instances.filter((x) => !ids.has(x.template)); }
        return r || done();
      }
      if (T0.startsWith('instance.')) {
        if (T0 === 'instance.add' && !seq.templates.some((x) => x.id === intent.template)) fail(`テンプレート「${intent.template}」がありません`);
        if (T0 === 'instance.move') {
          const ids = new Set(intent.ids || []), dt = num(intent.dt), dx = num(intent.dx), dy = num(intent.dy);
          for (const x of seq.instances) if (ids.has(x.id)) { x.t += dt; if (dx) x.params.x = num(x.params.x) + dx; if (dy) x.params.y = num(x.params.y) + dy; }
          seq.instances.sort((a, b) => a.t - b.t); return done();
        }
        const r = listOp('instance', seq.instances, 'i', (id) => ({ id, template: str(intent.template), t: num(intent.t), params: normPart({ instances: [{ template: 'x', params: intent.params || {} }] }).instances[0].params }));
        seq.instances.sort((a, b) => a.t - b.t); return r || done();
      }
      if (T0 === 'instances.import' || T0 === 'preset.apply') {
        const frag = remapIds(T0 === 'preset.apply' ? intent.preset : { instances: intent.instances, templates: intent.templates, tempo: intent.tempo, tracks: intent.tracks, paths: intent.paths, markers: intent.markers }, mk);
        const at = num(intent.at), part = normPart(frag);
        for (const p of part.paths) seq.paths.push(p);
        for (const tp of part.templates) seq.templates.push(tp);
        for (const x of part.instances) { x.t += at; seq.instances.push(x); }
        for (const m of part.markers) { m.t += at; seq.markers.push(m); }
        if (part.tempo.length) seq.tempo = [...seq.tempo, ...part.tempo.map((p) => ({ ...p, t: p.t + at }))].sort((a, b) => a.t - b.t);
        const into = intent.track && seq.tracks.find((x) => x.id === intent.track);
        for (const tr of part.tracks) {
          for (const c of tr.clips) { c.start += at; c.end += at; }
          if (into && part.tracks.length === 1 && tr.kind === into.kind) { unlocked(into); for (const c of tr.clips) { const d = freeDelta([{ clip: c, to: into }], 0, false); c.start += d; c.end += d; into.clips.push(c); } settle(into); }
          else seq.tracks.push(settle(tr));
        }
        seq.instances.sort((a, b) => a.t - b.t); seq.markers.sort((a, b) => a.t - b.t);
        return done();
      }
      return fail(`知らない intent「${T0}」`);
    } catch (e) {
      return { doc, ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  T.model = {
    EASES, EASE_K, ease, isEase, bezierAt, toFrames, fromFrames, timecode, parseTimecode, tempoOf, beatAt, timeAtBeat, snapToBeat, barBeat, pathTable, pathPoint, pathLength,
    PROPS, DEFAULTS, TRANSITIONS, LOOPS, SLIDE, exprFn, exprError, stateRefs, evMatch, timeOf, normalize, validate, allIds, seqTime, channelAt, applyTransition, evaluate, reduce,
  };
  if (typeof module === 'object' && module && module.exports) module.exports = T.model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/contract.js
(function (module) {
// GeoUI timeline — the contract between the pack and the game (pure): which slot (a copy of a template's bones) each instance
// is drawn in, the entity properties the server sets and the client's Molang reads, and how an instance's params fit in one
// of them. compile (RP: Molang), runtime (BP: the script) and the editor's preview all follow this one file.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

  // ---- packing: an instance's params in one int property. Molang's numbers are float32: integers are exact up to 2^24,
  // so a packed value never uses more than 24 bits. Each field is quantized evenly over [min, max]
  const MAX_BITS = 24;
  const DEFAULT_PACK = Object.freeze([{ name: 'x', bits: 10, min: -200, max: 200 }, { name: 'y', bits: 10, min: -200, max: 200 }, { name: 'v', bits: 4, min: 0, max: 15 }]);
  function checkSpec(spec) {
    if (!Array.isArray(spec) || !spec.length) throw new Error('詰め方（pack）が空です');
    let bits = 0;
    for (const f of spec) {
      if (!f || !/^\w+$/.test(String(f.name))) throw new Error(`詰め方の名前「${f && f.name}」が使えません`);
      if (!(Number.isInteger(f.bits) && f.bits >= 1)) throw new Error(`詰め方「${f.name}」の bits は 1 以上の整数で`);
      if (!(num(f.max, NaN) > num(f.min, NaN))) throw new Error(`詰め方「${f.name}」は max > min で`);
      bits += f.bits;
    }
    if (bits > MAX_BITS) throw new Error(`詰め方が ${bits} bit です（Molang の数で正確なのは ${MAX_BITS} bit まで）`);
    return spec;
  }
  const levels = (f) => 2 ** f.bits - 1;
  /** the quantization step of a field (what a packed value can be off by: half of it) */
  const stepOf = (f) => (f.max - f.min) / levels(f);
  function pack(values, spec = DEFAULT_PACK) {
    checkSpec(spec);
    let n = 0, shift = 0;
    for (const f of spec) {
      const v = Math.min(Math.max(num(values && values[f.name], f.min), f.min), f.max);
      n += Math.round(((v - f.min) / (f.max - f.min)) * levels(f)) * 2 ** shift;
      shift += f.bits;
    }
    return n;
  }
  function unpack(n, spec = DEFAULT_PACK) {
    checkSpec(spec);
    const out = {}; let shift = 0;
    for (const f of spec) { out[f.name] = f.min + ((f.max - f.min) * (Math.floor(num(n) / 2 ** shift) % 2 ** f.bits)) / levels(f); shift += f.bits; }
    return out;
  }
  /** the same unpacking as Molang (expr: the packed number, e.g. q.property('ns:s0p')) → { name: Molang expression } */
  function unpackMolang(expr, spec = DEFAULT_PACK) {
    checkSpec(spec);
    const out = {}; let shift = 0;
    const r = (x) => String(Math.round(x * 1e6) / 1e6);
    for (const f of spec) {
      const field = shift ? `math.mod(math.floor((${expr}) / ${2 ** shift}), ${2 ** f.bits})` : `math.mod(${expr}, ${2 ** f.bits})`;
      out[f.name] = `(${r(f.min)} + ${r(f.max - f.min)} * ${field} / ${levels(f)})`;   // (the same order of operations as unpack)
      shift += f.bits;
    }
    return out;
  }

  // ---- slots: instances drawn by k copies of a template's bones, each copy showing one instance at a time
  /** each instance of a template → a slot, so that no slot shows two at once: [t − lead, t + tail), plus gap seconds between
   *  two in the same slot (the time the game needs to take a slot's new values). Sorted by start and given the first free
   *  slot — as few slots as the most instances out at once. maxSlots: the ones that do not fit are overflow */
  function allocateSlots(instances, tpl, { maxSlots = Infinity, gap = 0 } = {}) {
    const lead = num(tpl && tpl.lead, 1), tail = num(tpl && tpl.tail, 0.5), ends = [], slotOf = {}, overflow = [];
    const xs = (instances || []).filter((x) => x && x.template === (tpl && tpl.id)).slice().sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
    for (const x of xs) {
      const s = x.t - lead, e = x.t + (Number.isFinite(x.tail) ? x.tail : tail);   // (an instance may stay out longer: a slider, a spinner)
      let k = ends.findIndex((end) => end + gap <= s + 1e-9);
      if (k < 0) { if (ends.length >= maxSlots) { overflow.push(x.id); continue; } k = ends.length; ends.push(e); } else ends[k] = e;
      slotOf[x.id] = k;
    }
    return { slots: ends.length, slotOf, overflow };
  }

  // ---- the properties (on the player: one sequence plays at a time, so every sequence shares them). A player has at most 32
  // (the game's documented limit) and GeoUI Builder's own pack takes 11 of them: the timeline takes as few as it can —
  //   <ns>:seq       the sequence (0 none, 1…1023) + 1024 × paused + 2048 × the generation (0…8191, +1 at each play, seek
  //                  and resume): the client counts from the moment this number changes
  //   <ns>:seq_from  the time it counts from (ms)
  //   <ns>:<tag><k>t, <ns>:<tag><k>p   a streamed slot's instance: its time (ms, −1 none) and its params packed in 24 bits
  //   <ns>:<tag>e<g> the results (hit, miss…) of the instances now in slots 8g … 8g + 7, 3 bits a slot: 0 until the slot's
  //                  instance has one (the script sets it back to 0 when the next instance takes the slot)
  // Every value is an integer below 2^24: Molang's numbers are float32, exact to there.
  const SEQ = Object.freeze({ max: 1023, pause: 1024, gen: 2048, gens: 8192 });
  const EV_BITS = 3, EV_PER = 8;
  const names = (ns) => ({
    seq: `${ns}:seq`, from: `${ns}:seq_from`,
    slot: (tid, k) => ({ t: `${ns}:${tid}${k}t`, p: `${ns}:${tid}${k}p` }),
    events: (tid, g) => `${ns}:${tid}e${g}`,
    ge: `${ns}:ge`, state: (group) => `${ns}:${group}`,
  });
  // (a result's number in its 3 bits, 0 = none: hit — a press that counts, an osu! slider's head; great / good / ok — osu!'s
  //  300 / 100 / 50; early — pressed before its window (osu!'s shake, notelock); drop — a slider's head missed, the slider going on)
  const RESULTS = Object.freeze(['none', 'hit', 'miss', 'great', 'good', 'ok', 'early', 'drop']);
  /** the seq property's number for a sequence, paused or not, and a generation */
  const seqValue = ({ seq = 0, pause = false, gen = 0 } = {}) => Math.min(SEQ.max, Math.max(0, Math.round(num(seq)))) + (pause ? SEQ.pause : 0) + SEQ.gen * (((Math.round(num(gen)) % SEQ.gens) + SEQ.gens) % SEQ.gens);
  const seqParts = (v) => { const x = Math.max(0, Math.round(num(v))); return { seq: x % SEQ.pause, pause: Math.floor(x / SEQ.pause) % 2 === 1, gen: Math.floor(x / SEQ.gen) % SEQ.gens }; };
  /** the same as Molang (expr: the property read) → { seq, pause } */
  const seqMolang = (expr) => ({ seq: `math.mod(${expr}, ${SEQ.pause})`, pause: `math.mod(math.floor((${expr}) / ${SEQ.pause}), 2)` });
  /** which events property a slot's result is in, and where: { group, shift (the slot's place, 0…7) } */
  const eventSlot = (k) => ({ group: Math.floor(k / EV_PER), shift: k % EV_PER });
  /** a group's number from its slots' results (codes 0…7; slot 8g + i at bits 3i) */
  const eventValue = (codes) => { let v = 0; (codes || []).slice(0, EV_PER).forEach((c, i) => { v += (Math.max(0, Math.min(7, Math.round(num(c)))) * 2 ** (EV_BITS * i)); }); return v; };
  /** slot k's result as Molang (expr: its group's property read) */
  const eventMolang = (expr, k) => { const sh = k % EV_PER; return sh ? `math.mod(math.floor((${expr}) / ${2 ** (EV_BITS * sh)}), 8)` : `math.mod(${expr}, 8)`; };
  // ---- the whole play, not one instance (osu!'s HUD and its effects): events any instance raises, and states the script keeps
  // live. A clip on a sequence's own track with trigger <name> (or until <name>) answers the latest such event of the whole
  // play — a shake of the playfield on any miss, the combo's pop on any hit:
  //   <ns>:ge, <ns>:ge1   up to 8 event names (GLOBAL_EVENTS, the ones the document uses), a 6-bit counter each (+1 each
  //             time, mod 64), 4 to a property: the client sees the number change and takes that moment as the event's time
  // An expression may read state.<name> (STATES): the cursor where the player looks, whether a button is held, a spinner's spin,
  // the score… — the script sets them in a few properties (each 24 bits at most, packed as an instance's params are):
  //   <ns>:v0 … v3  GeoUI's own values (score, combo, accuracy × 100, health): as they are
  //   <ns>:cur   the cursor (cx, cy: model units, 0.1 apart) and hold (a button held: 0 / 1)
  //   <ns>:sp    the spinner now: spin (0…1 of the spins it needs), rpm, sa (its angle, degrees)
  //   <ns>:res   rank (0 none, 1 D … 5 S, 6 SS), maxcombo, misses
  //   <ns>:cnt   n300, n100, n50
  //   <ns>:mod   the mods on (hd, fl, nf, sd, pf: 1 each), auto (the game plays itself), fc (no miss or break so far), failed (the
  //              play failed: osu!'s fail), record (this play beat the player's best: told at its end)
  // (hit: any hit — a 300 / 100 / 50 or a slider's head; combo: the combo went up — a hit, a slider's tick or turn; break: the combo
  //  was broken; tick: a slider's tick or turn followed; clear: a spinner spun enough; bonus: a spin past it; fail: health ran out;
  //  kiai: a kiai section began)
  const GLOBAL_EVENTS = Object.freeze(['hit', 'miss', 'great', 'good', 'ok', 'combo', 'break', 'tick', 'clear', 'bonus', 'fail', 'kiai']);
  const GE_BITS = 6, GE_PER = 4, GE_MAX = 8;
  const STATE_GROUPS = Object.freeze({
    cur: Object.freeze([{ name: 'cx', bits: 11, min: -102.4, max: 102.3 }, { name: 'cy', bits: 11, min: -102.4, max: 102.3 }, { name: 'hold', bits: 1, min: 0, max: 1 }]),
    sp: Object.freeze([{ name: 'spin', bits: 7, min: 0, max: 1 }, { name: 'rpm', bits: 9, min: 0, max: 511 }, { name: 'sa', bits: 8, min: 0, max: 358.59375 }]),
    res: Object.freeze([{ name: 'rank', bits: 3, min: 0, max: 7 }, { name: 'maxcombo', bits: 11, min: 0, max: 2047 }, { name: 'misses', bits: 10, min: 0, max: 1023 }]),
    cnt: Object.freeze([{ name: 'n300', bits: 10, min: 0, max: 1023 }, { name: 'n100', bits: 7, min: 0, max: 127 }, { name: 'n50', bits: 7, min: 0, max: 127 }]),
    mod: Object.freeze(['hd', 'fl', 'nf', 'sd', 'pf', 'auto', 'fc', 'failed', 'record'].map((name) => Object.freeze({ name, bits: 1, min: 0, max: 1 }))),
  });
  // (GeoUI's own values: v0 … v3 — the runtime's CFG.values says which is which; accuracy is kept × 100)
  const VALUE_STATES = Object.freeze({ score: { prop: 'v0', scale: 1 }, combo: { prop: 'v1', scale: 1 }, acc: { prop: 'v2', scale: 0.01 }, hp: { prop: 'v3', scale: 1 } });
  const STATE_NAMES = Object.freeze([...Object.keys(VALUE_STATES), ...Object.values(STATE_GROUPS).flatMap((g) => g.map((f) => f.name))]);
  const RANKS = Object.freeze(['', 'D', 'C', 'B', 'A', 'S', 'SS']);
  /** where a state lives: { group, field } (a packed group) or { prop, scale } (one of GeoUI's values) */
  function stateOf(name) {
    if (VALUE_STATES[name]) return Object.assign({ value: true }, VALUE_STATES[name]);
    for (const [group, spec] of Object.entries(STATE_GROUPS)) { const field = spec.find((f) => f.name === name); if (field) return { group, field }; }
    return null;
  }
  /** the global events' counter number from counts { name: n } in the document's order (events: the names it uses) */
  const geValue = (events, counts, g = 0) => { let v = 0; (events || []).slice(g * GE_PER, (g + 1) * GE_PER).forEach((e, k) => { v += (((Math.round(num(counts && counts[e])) % 64) + 64) % 64) * 2 ** (GE_BITS * k); }); return v; };
  /** the property event k is counted in (its group: 4 to a property) */
  const geName = (ns, k) => (Math.floor(k / GE_PER) ? `${ns}:ge${Math.floor(k / GE_PER)}` : `${ns}:ge`);
  /** event k's counter as Molang (expr: its property read — geName) */
  const geMolang = (expr, k) => { const sh = k % GE_PER; return sh ? `math.mod(math.floor((${expr}) / ${2 ** (GE_BITS * sh)}), 64)` : `math.mod(${expr}, 64)`; };
  /** what a document's sequences use of the whole play: the global events (triggers / untils on a sequence's own tracks, in first
   *  use order, at most GE_MAX) and the states (state.<name> in any key's value or a clip's start / end) → { events, states,
   *  groups (the packed groups the states need), warnings } */
  function globalNeeds(doc) {
    const events = [], states = [], warnings = [];
    const addState = (src) => { const m = String(src).match(/\bstate\.(\w+)/g) || []; for (const x of m) { const k = x.slice(6); if (!states.includes(k)) states.push(k); } };
    const scan = (tracks, own) => {
      for (const tr of tracks || []) for (const c of (tr && tr.clips) || []) {
        if (own) for (const e of [c.trigger, c.until]) if (typeof e === 'string' && e && !events.includes(e)) events.push(e);
        for (const v of [c.start, c.end]) if (typeof v === 'string') addState(v);
        for (const ks of Object.values(c.channels || {})) for (const k of ks || []) if (typeof k.v === 'string') addState(k.v);
      }
    };
    for (const seq of (doc && doc.sequences) || []) { scan(seq.tracks, true); for (const tp of seq.templates || []) scan(tp.tracks, false); }
    for (const e of events) if (!GLOBAL_EVENTS.includes(e)) warnings.push(`シーケンスのトラックの trigger / until「${e}」は、ゲームの中のどの出来事でもありません（${GLOBAL_EVENTS.join('・')}）`);
    const known = events.filter((e) => GLOBAL_EVENTS.includes(e));
    if (known.length > GE_MAX) warnings.push(`シーケンスのトラックが答える出来事が ${known.length} 種類あります（${GE_MAX} 種類まで: ${known.slice(GE_MAX).join('・')} は書き出しません）`);
    const bad = states.filter((x) => !stateOf(x));
    if (bad.length) warnings.push(`state.${bad.join('・state.')} はありません（${STATE_NAMES.join('・')}）`);
    const ok = states.filter((x) => stateOf(x));
    const groups = Object.keys(STATE_GROUPS).filter((g) => ok.some((x) => (stateOf(x) || {}).group === g));
    return { events: known.slice(0, GE_MAX), states: ok, groups, warnings };
  }

  /** a template whose params all fit its pack (or that has none) can be streamed */
  const canStream = (tpl) => { const spec = (tpl && tpl.pack) || DEFAULT_PACK; return ((tpl && tpl.params) || []).every((p) => spec.some((f) => f.name === p)); };
  /** what a template needs: per slot t + p when its instances are streamed (p only with params); a share of an events
   *  property when its clips answer events (trigger / until) */
  function slotNeeds(tpl, mode) {
    const events = (tpl.tracks || []).some((tr) => (tr.clips || []).some((c) => c.trigger || c.until));
    return { t: mode === 'streamed', p: mode === 'streamed' && (tpl.params || []).length > 0, events };
  }
  /** a short, stable property-name part for a template (property names are short: namespace:name, lower case) */
  const slotTag = (i) => `t${i}s`;
  /** the budget of a document: per sequence, its templates' instances, slots and mode — baked (each slot's instances written
   *  into the Molang: what shows runs on the client's own clock, no property per instance) unless a template has more than
   *  bakedMax instances and its params fit its pack: streamed (the script puts each instance into its slot just before it
   *  shows). The properties are shared by the sequences (a template's tag is its place in its sequence): what every
   *  sequence needs, together, plus base (the pack's own) — warnings when over propertyLimit (32: the game's) */
  function budget(doc, { propertyLimit = 32, bakedMax = 2000, gap = 0.25, ns = 'geoui', base = 0 } = {}) {
    const sequences = [], warnings = [], tags = new Map();   // tag → { t, p, groups }
    for (const seq of (doc && doc.sequences) || []) {
      const templates = (seq.templates || []).map((tpl, i) => {
        const count = (seq.instances || []).filter((x) => x.template === tpl.id).length;
        const mode = count > bakedMax && canStream(tpl) ? 'streamed' : 'baked';
        if (count > bakedMax && mode === 'baked') warnings.push(`テンプレート「${tpl.name || tpl.id}」は実体が ${count} 個ですが、param が詰め方（pack）に入りきらないので焼き込みで書き出します（式が長くなります）`);
        const a = allocateSlots(seq.instances, tpl, { gap: mode === 'streamed' ? gap : 0 }), need = slotNeeds(tpl, mode), tag = slotTag(i);
        const groups = need.events ? Math.ceil(a.slots / EV_PER) : 0, u = tags.get(tag) || { t: 0, p: 0, groups: 0 };
        tags.set(tag, { t: Math.max(u.t, need.t ? a.slots : 0), p: Math.max(u.p, need.p ? a.slots : 0), groups: Math.max(u.groups, groups) });
        return { id: tpl.id, tag, instances: count, slots: a.slots, mode, needs: need, eventGroups: groups, properties: (need.t ? a.slots : 0) + (need.p ? a.slots : 0) + groups };
      });
      sequences.push({ id: seq.id, templates, properties: 2 + templates.reduce((s, t) => s + t.properties, 0) });
    }
    const g = globalNeeds(doc);
    warnings.push(...g.warnings);
    const own = 2 + [...tags.values()].reduce((s, u) => s + u.t + u.p + u.groups, 0) + Math.ceil(g.events.length / GE_PER) + g.groups.length, total = base + own;
    if (total > propertyLimit) warnings.push(`プロパティが ${total} 個要ります（GeoUI の ${base} 個とタイムラインの ${own} 個。上限 ${propertyLimit}）: 流し込みのテンプレートを焼き込みに（bakedMax を上げる）するか、同時に出る実体を減らす（lead・tail を短く）`);
    return { sequences, properties: own, total, base, propertyLimit, warnings, names: names(ns), tags: Object.fromEntries(tags), global: { events: g.events, states: g.states, groups: g.groups } };
  }
  /** the entity properties (BP player.json "description.properties") for a budget */
  function propertyDefs(b, ns = 'geoui') {
    const N = names(ns), top = 2 ** MAX_BITS - 1, out = {
      [N.seq]: { type: 'int', range: [0, top], default: 0, client_sync: true },
      [N.from]: { type: 'int', range: [0, top], default: 0, client_sync: true },
    };
    for (const [tag, u] of Object.entries((b && b.tags) || {})) {
      for (let k = 0; k < u.t; k++) out[N.slot(tag, k).t] = { type: 'int', range: [-1, top], default: -1, client_sync: true };
      for (let k = 0; k < u.p; k++) out[N.slot(tag, k).p] = { type: 'int', range: [0, top], default: 0, client_sync: true };
      for (let g = 0; g < u.groups; g++) out[N.events(tag, g)] = { type: 'int', range: [0, top], default: 0, client_sync: true };
    }
    const gl = (b && b.global) || {};
    for (let k = 0; k < (gl.events || []).length; k += GE_PER) out[geName(ns, k)] = { type: 'int', range: [0, top], default: 0, client_sync: true };
    for (const grp of gl.groups || []) out[N.state(grp)] = { type: 'int', range: [0, top], default: grp === 'cur' ? pack({ cx: 0, cy: 0, hold: 0 }, STATE_GROUPS.cur) : 0, client_sync: true };
    return out;
  }

  T.contract = { MAX_BITS, DEFAULT_PACK, RESULTS, SEQ, EV_BITS, EV_PER, GLOBAL_EVENTS, GE_BITS, GE_PER, GE_MAX, STATE_GROUPS, VALUE_STATES, STATE_NAMES, RANKS,
    checkSpec, stepOf, pack, unpack, unpackMolang, allocateSlots, names, seqValue, seqParts, seqMolang, eventSlot, eventValue, eventMolang, stateOf, geValue, geName, geMolang, globalNeeds,
    canStream, slotNeeds, slotTag, budget, propertyDefs };
  if (typeof module === 'object' && module && module.exports) module.exports = T.contract;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/media.js
(function (module) {
// GeoUI timeline — media (pure): images packed into one atlas, image sequences as flipbooks (render controller uv_anim), text
// laid out from a glyph atlas, audio (WAV made and read, OGG's length, a waveform's peaks, Bedrock's sound definitions), a stored
// ZIP, and a slider's body drawn as a thick line. Whatever needs pixels takes a function from the caller (the browser's canvas)
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

  // ---------------------------------------------------------------------------------------------------------------- atlas
  /** MaxRects (best short side fit): items [{ id, w, h }] → { w, h, rects: { id: { x, y, w, h } } } — the smallest size tried
   *  first (a power of two each side when pow2), up to maxSize; padding px between them. Throws when they cannot fit */
  function packAtlas(items, { maxSize = 2048, padding = 1, pow2 = true } = {}) {
    const list = (items || []).map((it, i) => ({ id: String(it.id ?? i), w: Math.ceil(num(it.w)), h: Math.ceil(num(it.h)), i })).filter((it) => it.w > 0 && it.h > 0)
      .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.i - b.i);
    if (!list.length) return { w: 1, h: 1, rects: {} };
    const big = list.find((it) => it.w > maxSize || it.h > maxSize);
    if (big) throw new Error(`画像「${big.id}」（${big.w}x${big.h}）がアトラスの上限 ${maxSize} より大きい`);
    const area = list.reduce((s, it) => s + (it.w + padding) * (it.h + padding), 0), up = (x) => (pow2 ? 2 ** Math.ceil(Math.log2(Math.max(1, x))) : Math.ceil(x));
    let w = up(Math.max(Math.sqrt(area), ...list.map((it) => it.w + padding))), h = up(Math.max(area / w, ...list.map((it) => it.h + padding)));
    for (;;) {
      // (the padding is only needed between images: past the atlas's own right and bottom edges it may hang over)
      const r = maxRects(list, Math.min(w, maxSize) + padding, Math.min(h, maxSize) + padding, padding);
      if (r) return { w: Math.min(w, maxSize), h: Math.min(h, maxSize), rects: r };
      if (w >= maxSize && h >= maxSize) throw new Error(`アトラスに入りません（${list.length} 枚、上限 ${maxSize}x${maxSize}）`);
      if (w <= h && w < maxSize) w = pow2 ? w * 2 : Math.ceil(w * 1.25); else h = pow2 ? h * 2 : Math.ceil(h * 1.25);
    }
  }
  function maxRects(list, W, H, pad) {
    let free = [{ x: 0, y: 0, w: W, h: H }];
    const out = {};
    for (const it of list) {
      const iw = it.w + pad, ih = it.h + pad;
      let best = null, bs = Infinity, bl = Infinity;
      for (const f of free) {
        if (iw > f.w || ih > f.h) continue;
        const ss = Math.min(f.w - iw, f.h - ih), ls = Math.max(f.w - iw, f.h - ih);
        if (ss < bs || (ss === bs && ls < bl)) { best = f; bs = ss; bl = ls; }
      }
      if (!best) return null;
      const placed = { x: best.x, y: best.y, w: iw, h: ih };
      out[it.id] = { x: placed.x, y: placed.y, w: it.w, h: it.h };
      const next = [];
      for (const f of free) {
        if (placed.x >= f.x + f.w || placed.x + placed.w <= f.x || placed.y >= f.y + f.h || placed.y + placed.h <= f.y) { next.push(f); continue; }
        if (placed.x > f.x) next.push({ x: f.x, y: f.y, w: placed.x - f.x, h: f.h });
        if (placed.x + placed.w < f.x + f.w) next.push({ x: placed.x + placed.w, y: f.y, w: f.x + f.w - placed.x - placed.w, h: f.h });
        if (placed.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: placed.y - f.y });
        if (placed.y + placed.h < f.y + f.h) next.push({ x: f.x, y: placed.y + placed.h, w: f.w, h: f.y + f.h - placed.y - placed.h });
      }
      free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
    }
    return out;
  }
  /** n frames of frameW x frameH in a grid (cols, default the squarest) → its size and each frame's uv_anim { offset, scale }
   *  (fractions of the texture: what a render controller's uv_anim takes) */
  function flipbook(n, frameW, frameH, { cols } = {}) {
    const c = Math.max(1, Math.round(num(cols, Math.ceil(Math.sqrt(Math.max(1, n)))))), rows = Math.max(1, Math.ceil(Math.max(1, n) / c)), w = c * frameW, h = rows * frameH;
    return { cols: c, rows, w, h, uv: (i) => { const k = Math.max(0, Math.min(Math.max(1, n) - 1, Math.round(num(i)))); return { offset: [((k % c) * frameW) / w, (Math.floor(k / c) * frameH) / h], scale: [frameW / w, frameH / h] }; } };
  }

  // ---------------------------------------------------------------------------------------------------------------- text
  /** the glyphs of chars measured by measure(ch) → { w, h, advance } (px) and packed: { w, h, lineHeight, glyphs: { ch: { x, y, w,
   *  h, advance } } } — the caller draws each glyph into its rectangle */
  function fontAtlas(chars, measure, { padding = 2, maxSize = 2048 } = {}) {
    const set = [...new Set(Array.from(String(chars)).filter((c) => c !== '\n'))];
    const m = new Map(set.map((ch) => [ch, measure(ch) || {}]));
    const a = packAtlas(set.map((ch, i) => ({ id: `g${i}`, w: Math.max(1, num(m.get(ch).w)), h: Math.max(1, num(m.get(ch).h)) })), { padding, maxSize });
    const glyphs = {};
    set.forEach((ch, i) => { const r = a.rects[`g${i}`], g = m.get(ch); glyphs[ch] = { x: r.x, y: r.y, w: r.w, h: r.h, advance: num(g.advance, r.w) }; });
    return { w: a.w, h: a.h, lineHeight: Math.max(1, ...set.map((ch) => num(m.get(ch).h))), glyphs };
  }
  /** text laid out with a font (fontAtlas) → [{ ch, x, y, w, h }] in model units (scale: model units per px), lines going down
   *  (y down from 0: the model's y is up, so a line's y is −its top). Wraps at maxWidth (at a space when there is one; Japanese
   *  and other text without spaces at any character); align: left | center | right */
  function layoutText(text, font, { align = 'left', letterSpacing = 0, lineHeight, maxWidth = Infinity, scale = 1 } = {}) {
    const lh = num(lineHeight, font.lineHeight), adv = (ch) => (font.glyphs[ch] ? font.glyphs[ch].advance : ch === ' ' ? font.lineHeight / 3 : font.lineHeight / 2) + letterSpacing;
    const lines = [];
    for (const raw of String(text).split('\n')) {
      let line = [], wsum = 0, lastSpace = -1;
      for (const ch of Array.from(raw)) {
        const a = adv(ch);
        if (line.length && wsum + a > maxWidth / scale + 1e-9) {
          if (lastSpace > 0 && ch !== ' ') { const rest = line.slice(lastSpace + 1); lines.push(line.slice(0, lastSpace)); line = rest; wsum = rest.reduce((s, c) => s + adv(c), 0); }
          else { lines.push(line); line = []; wsum = 0; }
          lastSpace = -1;
          if (ch === ' ') continue;   // (a line does not start with the space it broke at)
        }
        if (ch === ' ') lastSpace = line.length;
        line.push(ch); wsum += a;
      }
      lines.push(line);
    }
    const out = [];
    lines.forEach((line, li) => {
      const width = line.reduce((s, c) => s + adv(c), 0) - (line.length ? letterSpacing : 0);
      let x = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
      for (const ch of line) {
        const g = font.glyphs[ch];
        if (g) out.push({ ch, x: x * scale, y: -li * lh * scale, w: g.w * scale, h: g.h * scale });
        x += adv(ch);
      }
    });
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------- audio
  const u8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
  const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (b, at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  /** a WAV file's { seconds, rate, channels, bits } (null: not one) */
  function wavInfo(bytes) {
    const b = u8(bytes), d = dv(b);
    if (b.length < 12 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WAVE') return null;
    let fmt = null, data = 0;
    for (let at = 12; at + 8 <= b.length;) {
      const id = tag(b, at), size = d.getUint32(at + 4, true);
      if (id === 'fmt ') fmt = { channels: d.getUint16(at + 10, true), rate: d.getUint32(at + 12, true), bits: d.getUint16(at + 22, true) };
      if (id === 'data') data = Math.min(size, b.length - at - 8);
      at += 8 + size + (size & 1);
    }
    return fmt ? { ...fmt, seconds: data / (fmt.rate * fmt.channels * (fmt.bits / 8)) } : null;
  }
  /** samples (-1..1: one Float32Array or array for mono, or an array of them per channel) → a 16-bit PCM WAV file */
  function makeWav(pcm, rate = 44100) {
    const chans = Array.isArray(pcm) && pcm.length && (ArrayBuffer.isView(pcm[0]) || Array.isArray(pcm[0])) ? pcm : [pcm];
    const n = Math.max(...chans.map((c) => c.length)), ch = chans.length, data = n * ch * 2, b = new Uint8Array(44 + data), d = dv(b);
    const put = (at, s) => { for (let i = 0; i < 4; i++) b[at + i] = s.charCodeAt(i); };
    put(0, 'RIFF'); d.setUint32(4, 36 + data, true); put(8, 'WAVE'); put(12, 'fmt ');
    d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, ch, true); d.setUint32(24, rate, true); d.setUint32(28, rate * ch * 2, true); d.setUint16(32, ch * 2, true); d.setUint16(34, 16, true);
    put(36, 'data'); d.setUint32(40, data, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, num(chans[c][i]))); d.setInt16(44 + (i * ch + c) * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true); }
    return b;
  }
  /** an Ogg Vorbis file's { seconds, rate, channels } (from its identification header and its last page's granule; null: not one) */
  function oggInfo(bytes) {
    const b = u8(bytes), d = dv(b);
    if (b.length < 58 || tag(b, 0) !== 'OggS') return null;
    const segs = b[26], body = 27 + segs;
    if (b[body] !== 1 || String.fromCharCode(...b.subarray(body + 1, body + 7)) !== 'vorbis') return null;
    const channels = b[body + 11], rate = d.getUint32(body + 12, true);
    for (let at = b.length - 27; at >= 0; at--) {
      if (b[at] === 0x4f && tag(b, at) === 'OggS') { const g = d.getUint32(at + 6, true) + d.getUint32(at + 10, true) * 2 ** 32; return { seconds: rate ? g / rate : 0, rate, channels }; }
    }
    return null;
  }
  /** a waveform's peaks: the loudest |sample| in each of buckets equal parts (0..1) — what a timeline draws */
  function peaks(pcm, buckets) {
    const n = Math.max(1, Math.round(num(buckets, 100))), out = new Array(n).fill(0), len = pcm.length;
    for (let i = 0; i < len; i++) { const k = Math.min(n - 1, Math.floor((i * n) / len)), a = Math.abs(pcm[i]); if (a > out[k]) out[k] = a; }
    return out.map((x) => Math.min(1, x));
  }
  /** Bedrock's sound definitions for sounds [{ id, ext ('ogg'|'wav'), volume, pitch, stream }] → { json, paths: { id: path in the RP } } */
  function soundDefinitions(sounds, ns = 'geoui') {
    const defs = {}, paths = {};
    for (const s of sounds || []) {
      const id = String(s.id).replace(/[^\w.]/g, '_'), file = `sounds/${ns}/${id}`;
      paths[s.id] = `${file}.${s.ext === 'wav' ? 'wav' : 'ogg'}`;
      defs[`${ns}.${id}`] = { category: 'ui', sounds: [Object.assign({ name: file, volume: num(s.volume, 1), pitch: num(s.pitch, 1), load_on_low_memory: true }, s.stream ? { stream: true } : {})] };
    }
    return { json: { format_version: '1.20.20', sound_definitions: defs }, paths };
  }

  // ---------------------------------------------------------------------------------------------------------------- zip
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(String(s)) : Uint8Array.from(Buffer.from(String(s), 'utf8')));
  const fromUtf8 = (b) => (typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(b) : Buffer.from(b).toString('utf8'));
  /** files [{ name, data (Uint8Array | string) }] → a ZIP (stored, no compression: PNG frames and packs are compressed already;
   *  the same input gives the same bytes) */
  function zipStore(files) {
    const parts = [], central = [];
    let at = 0;
    for (const f of files || []) {
      const name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : u8(f.data), crc = crc32(data);
      const h = new Uint8Array(30 + name.length), d = dv(h);
      d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true); d.setUint16(6, 0x0800, true); d.setUint16(8, 0, true); d.setUint16(10, 0, true); d.setUint16(12, 0x21, true);
      d.setUint32(14, crc, true); d.setUint32(18, data.length, true); d.setUint32(22, data.length, true); d.setUint16(26, name.length, true); h.set(name, 30);
      const c = new Uint8Array(46 + name.length), e = dv(c);
      e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true); e.setUint16(14, 0x21, true);
      e.setUint32(16, crc, true); e.setUint32(20, data.length, true); e.setUint32(24, data.length, true); e.setUint16(28, name.length, true); e.setUint32(42, at, true); c.set(name, 46);
      parts.push(h, data); central.push(c); at += h.length + data.length;
    }
    const size = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), d = dv(end);
    d.setUint32(0, 0x06054b50, true); d.setUint16(8, central.length, true); d.setUint16(10, central.length, true); d.setUint32(12, size, true); d.setUint32(16, at, true);
    const out = new Uint8Array(at + size + 22);
    let o = 0;
    for (const p of [...parts, ...central, end]) { out.set(p, o); o += p.length; }
    return out;
  }
  /** a stored ZIP (zipStore's) → [{ name, data }]; checks each file's CRC */
  function unzipStore(bytes) {
    const b = u8(bytes), d = dv(b), out = [];
    for (let at = 0; at + 30 <= b.length && d.getUint32(at, true) === 0x04034b50;) {
      if (d.getUint16(at + 8, true) !== 0) throw new Error('圧縮された ZIP は読めません（無圧縮だけ）');
      const size = d.getUint32(at + 18, true), nl = d.getUint16(at + 26, true), xl = d.getUint16(at + 28, true);
      const name = fromUtf8(b.subarray(at + 30, at + 30 + nl)), data = b.slice(at + 30 + nl + xl, at + 30 + nl + xl + size);
      if (crc32(data) !== d.getUint32(at + 14, true)) throw new Error(`ZIP の「${name}」が壊れています（CRC）`);
      out.push({ name, data }); at += 30 + nl + xl + size;
    }
    return out;
  }
  /** file names of an image sequence in their numbers' order (file_2.png before file_10.png) */
  const sortSequence = (names) => (names || []).slice().sort((a, b) => String(a).replace(/\d+/g, (m) => m.padStart(12, '0')).localeCompare(String(b).replace(/\d+/g, (m) => m.padStart(12, '0'))));

  // ---------------------------------------------------------------------------------------------------------------- slider bodies
  /** a thick line's outline (round caps, round where it turns): a closed polygon [[x, y]…] — for hit tests and a quick look */
  function strokeOutline(points, width, { arc = 8 } = {}) {
    const pts = (points || []).filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-9), r = width / 2;
    if (!pts.length) return [];
    if (pts.length === 1) return Array.from({ length: arc * 2 }, (_, k) => [pts[0][0] + r * Math.cos((Math.PI * k) / arc), pts[0][1] + r * Math.sin((Math.PI * k) / arc)]);
    const side = (dir) => {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        out.push([pts[i][0] - (dy / L) * r * dir, pts[i][1] + (dx / L) * r * dir]);
      }
      return out;
    };
    const cap = (p, q) => { const ang = Math.atan2(p[1] - q[1], p[0] - q[0]), out = []; for (let k = 1; k < arc; k++) { const t = ang + Math.PI / 2 - (Math.PI * k) / arc; out.push([p[0] + r * Math.cos(t), p[1] + r * Math.sin(t)]); } return out; };
    const L = side(1), R = side(-1).reverse(), n = pts.length;
    return [...L, ...cap(pts[n - 1], pts[n - 2]), ...R, ...cap(pts[0], pts[1])];
  }
  /** a slider's body as an image: its size in px and the canvas steps that draw it (an osu!-like border and fill: a wide stroke,
   *  a narrower one inside), the middle of its line at the image's centre. body = osu.toDocument's ({ line — the ball's way,
   *  else points — and width, in model units) */
  function bodyImage(body, { pxPerUnit = 4, border = 0.12, colours = { border: '#ffffff', fill: '#1a1a2a' } } = {}) {
    const way = body.line && body.line.length ? body.line : body.points;
    const xs = way.map((p) => p[0]), ys = way.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const pad = body.width / 2 + 1, w = Math.ceil((Math.max(...xs) - Math.min(...xs) + 2 * pad) * pxPerUnit), h = Math.ceil((Math.max(...ys) - Math.min(...ys) + 2 * pad) * pxPerUnit);
    const px = (p) => [(p[0] - cx) * pxPerUnit + w / 2, h / 2 - (p[1] - cy) * pxPerUnit];
    const line = way.map(px), path = [['moveTo', ...line[0]], ...line.slice(1).map((p) => ['lineTo', ...p])];
    return { w, h, centre: [cx, cy], ops: [['lineJoin', 'round'], ['lineCap', 'round'],
      ['strokeStyle', colours.border], ['lineWidth', body.width * pxPerUnit], ['beginPath'], ...path, ['stroke'],
      ['strokeStyle', colours.fill], ['lineWidth', body.width * pxPerUnit * (1 - 2 * border)], ['beginPath'], ...path, ['stroke']] };
  }
  /** canvas steps (bodyImage's ops) run on a 2D context */
  function drawOps(ctx, ops) { for (const [op, ...a] of ops) { if (typeof ctx[op] === 'function') ctx[op](...a); else ctx[op] = a[0]; } }
  /** a colour as canvas takes it (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) → [r, g, b, a 0..1] */
  function parseColour(s) {
    const t = String(s).trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(t);
    if (m) { let hx = m[1]; if (hx.length <= 4) hx = [...hx].map((c) => c + c).join(''); const v = (i) => parseInt(hx.slice(i, i + 2), 16); return [v(0), v(2), v(4), hx.length >= 8 ? v(6) / 255 : 1]; }
    m = /^rgba?\(([^)]*)\)$/i.exec(t);
    if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1]; }
    return [0, 0, 0, 1];
  }
  /** canvas steps drawn without a canvas, for Node (the sample add-on, the tests): the strokes bodyImage makes — straight
   *  lines, round where they turn and at their ends — each pixel covered by how far its middle is from the line (so the
   *  edge is smooth), painted over what is there. Other steps are left out → { width, height, data: RGBA bytes } */
  function rasterOps(ops, w, h) {
    const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h)), data = new Uint8Array(W * H * 4), st = { strokeStyle: '#000000', lineWidth: 1 };
    let subs = [], cur = null;
    const segDist = (x, y, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, u = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0;
      return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
    };
    const stroke = () => {
      const r = Math.max(0, +st.lineWidth || 0) / 2, [cr, cg, cb, ca] = parseColour(st.strokeStyle), all = subs.filter((s) => s.length);
      if (!all.length || r <= 0 || ca <= 0) return;
      const pts = all.flat(), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs) + r + 1));
      const y0 = Math.max(0, Math.floor(Math.min(...ys) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys) + r + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        // (one stroke is one shape: where its pieces overlap it is painted once)
        let d = Infinity;
        for (const s of all) { if (s.length === 1) d = Math.min(d, segDist(x + 0.5, y + 0.5, s[0], s[0])); else for (let i = 1; i < s.length; i++) d = Math.min(d, segDist(x + 0.5, y + 0.5, s[i - 1], s[i])); }
        const a = Math.max(0, Math.min(1, r - d + 0.5)) * ca;
        if (a <= 0) continue;
        const o = (y * W + x) * 4, da = data[o + 3] / 255, oa = a + da * (1 - a);
        data[o] = Math.round((cr * a + data[o] * da * (1 - a)) / oa); data[o + 1] = Math.round((cg * a + data[o + 1] * da * (1 - a)) / oa); data[o + 2] = Math.round((cb * a + data[o + 2] * da * (1 - a)) / oa);
        data[o + 3] = Math.round(oa * 255);
      }
    };
    for (const [op, ...a] of ops || []) {
      if (op === 'beginPath') { subs = []; cur = null; }
      else if (op === 'moveTo') { cur = [[+a[0], +a[1]]]; subs.push(cur); }
      else if (op === 'lineTo') { if (cur) cur.push([+a[0], +a[1]]); else { cur = [[+a[0], +a[1]]]; subs.push(cur); } }
      else if (op === 'stroke') stroke();
      else if (op === 'strokeStyle' || op === 'lineWidth') st[op] = a[0];
    }
    return { width: W, height: H, data };
  }

  T.media = { packAtlas, flipbook, fontAtlas, layoutText, wavInfo, makeWav, oggInfo, peaks, soundDefinitions, crc32, zipStore, unzipStore, sortSequence, strokeOutline, bodyImage, drawOps, parseColour, rasterOps };
  if (typeof module === 'object' && module && module.exports) module.exports = T.media;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/osu.js
(function (module) {
// GeoUI timeline — osu! beatmaps (.osu, file format v14) read into a timeline document (pure): hit circles, sliders and
// spinners as instances of templates (bds/geoui/timeline/PLAN.md), their timing and BPM, combo numbers and colours, the
// music as an audio track. The formulas are osu!'s own (approach rate → preempt and fade-in, circle size → radius, overall
// difficulty → hit windows, slider length → duration). The lab ships no real beatmap or song: a person imports their own.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(+v) ? +v : d);
  const CURVES = { B: 'bezier', C: 'catmull', L: 'linear', P: 'arc' };

  /** a .osu file's text → { version, general, editor, metadata, difficulty, timing, colours, objects } */
  function parseOsu(text) {
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    const head = /^\s*osu file format v(\d+)/.exec(lines[0] || '');
    const out = { version: head ? +head[1] : null, general: {}, editor: {}, metadata: {}, difficulty: {}, timing: [], colours: { combos: [] }, objects: [], breaks: [] };
    let sec = null;
    for (const raw of lines.slice(head ? 1 : 0)) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      const m = /^\[(\w+)\]$/.exec(line);
      if (m) { sec = m[1]; continue; }
      if (['General', 'Editor', 'Metadata', 'Difficulty', 'Colours'].includes(sec)) {
        const i = line.indexOf(':');
        if (i < 0) continue;
        const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
        if (sec === 'Colours') { const c = v.split(',').map((x) => Math.max(0, Math.min(255, Math.round(num(x))))); if (/^Combo\d+$/.test(k) && c.length >= 3) out.colours.combos[+k.slice(5) - 1] = c.slice(0, 3); else out.colours[k] = c.slice(0, 3); continue; }
        out[sec.toLowerCase()][k] = /^-?\d+(\.\d+)?$/.test(v) ? +v : v;
      } else if (sec === 'Events') {
        const f = line.split(',');
        if ((f[0] === '2' || f[0] === 'Break') && f.length >= 3) (out.breaks = out.breaks || []).push({ start: num(f[1]), end: num(f[2]) });
        else if (f[0] === '0' && f[2]) out.background = String(f[2]).replace(/^"|"$/g, '');
      } else if (sec === 'TimingPoints') {
        const f = line.split(',');
        if (f.length < 2) continue;
        out.timing.push({ time: num(f[0]), beatLength: num(f[1]), meter: Math.max(1, num(f[2], 4)), uninherited: f[6] === undefined || f[6].trim() === '1', kiai: (num(f[7]) & 1) === 1,
          sampleSet: Math.max(0, Math.min(3, num(f[3], 0))), volume: Math.max(0, Math.min(100, num(f[5], 100))) });
      } else if (sec === 'HitObjects') {
        const f = line.split(',');
        if (f.length < 4) continue;
        const x = num(f[0]), y = num(f[1]), time = num(f[2]), type = num(f[3]);
        // (its hitsound: whistle 2, finish 4, clap 8 over the normal one; its sample sets — 0: the timing point's — normal:addition)
        const sample = (str) => { const q = String(str || '').split(':'); return { normalSet: Math.max(0, Math.min(3, num(q[0]))), additionSet: Math.max(0, Math.min(3, num(q[1]))) }; };
        const base = { x, y, time, newCombo: Boolean(type & 4), comboSkip: (type >> 4) & 7, hitSound: num(f[4]) & 14 };
        if (type & 1) out.objects.push({ kind: 'circle', ...base, ...sample(f[5]) });
        else if (type & 2) {
          const [c, ...pts] = String(f[5] || '').split('|'), points = [[x, y], ...pts.map((p) => p.split(':').map((q) => num(q))).filter((p) => p.length === 2)];
          // (a perfect circle needs three points: otherwise osu! draws it as a Bézier)
          const curve = CURVES[c] === 'arc' && points.length !== 3 ? 'bezier' : CURVES[c] || 'bezier';
          const slides = Math.max(1, Math.round(num(f[6], 1)));
          // (each edge — the head, every turn, the end — with its own hitsound and sets: edgeSounds, edgeSets)
          const es = String(f[8] || '').split('|').map((v) => num(v) & 14), ets = String(f[9] || '').split('|').map(sample);
          out.objects.push({ kind: 'slider', ...base, ...sample(f[10]), curve, points, slides, length: Math.max(0, num(f[7])),
            edges: Array.from({ length: slides + 1 }, (_, i) => Object.assign({ hitSound: f[8] !== undefined && es[i] !== undefined ? es[i] : base.hitSound }, f[9] !== undefined && ets[i] ? ets[i] : { normalSet: 0, additionSet: 0 })) });
        } else if (type & 8) out.objects.push({ kind: 'spinner', ...base, ...sample(f[6]), endTime: Math.max(time, num(f[5], time)) });
      }
    }
    out.timing.sort((a, b) => a.time - b.time);
    out.breaks = (out.breaks || []).filter((b) => b.end > b.start).sort((a, b) => a.start - b.start);
    out.colours.combos = out.colours.combos.filter(Boolean);
    out.objects.sort((a, b) => a.time - b.time);
    return out;
  }

  // ---- osu!'s formulas (milliseconds, osu! pixels)
  const preempt = (ar) => (ar < 5 ? 1200 + (600 * (5 - ar)) / 5 : ar > 5 ? 1200 - (750 * (ar - 5)) / 5 : 1200);
  const fadeIn = (ar) => (ar < 5 ? 800 + (400 * (5 - ar)) / 5 : ar > 5 ? 800 - (500 * (ar - 5)) / 5 : 800);
  const radius = (cs) => 54.4 - 4.48 * cs;
  /** the hit windows either side of an object's time: 300 (great), 100 (good), 50 (meh) */
  const hitWindows = (od) => ({ great: 80 - 6 * od, good: 140 - 8 * od, meh: 200 - 10 * od });
  function difficultyOf(map) {
    const d = (map && map.difficulty) || {}, od = num(d.OverallDifficulty, 5), ar = num(d.ApproachRate, od), cs = num(d.CircleSize, 5);
    return { ar, od, cs, hp: num(d.HPDrainRate, 5), preempt: preempt(ar), fadeIn: fadeIn(ar), radius: radius(cs), windows: hitWindows(od), sliderMultiplier: num(d.SliderMultiplier, 1.4), tickRate: num(d.SliderTickRate, 1) };
  }
  /** the timing at a time: the uninherited point's beat length and meter, and the slider velocity of an inherited point after it */
  function timingAt(map, time) {
    let red = null, sv = 1;
    for (const p of (map && map.timing) || []) {
      if (p.time > time + 1e-9) break;
      if (p.uninherited) { red = p; sv = 1; } else if (p.beatLength < 0) sv = Math.min(10, Math.max(0.1, -100 / p.beatLength));
    }
    red = red || ((map && map.timing) || []).find((p) => p.uninherited) || { time: 0, beatLength: 500, meter: 4 };
    return { beatLength: red.beatLength, meter: red.meter, sv };
  }
  /** a slider's duration in ms (all its slides) */
  function sliderDuration(map, obj) {
    const { beatLength, sv } = timingAt(map, obj.time), diff = difficultyOf(map);
    return ((obj.length / (diff.sliderMultiplier * 100 * sv)) * beatLength) * obj.slides;
  }
  /** each object's combo number and colour index (a new combo, or the object after a spinner, starts at 1 with the next colour,
   *  skipping comboSkip colours) */
  function combos(map) {
    let colour = -1, n = 0, after = false;
    const nColours = Math.max(1, ((map && map.colours && map.colours.combos) || []).length || 4);
    return ((map && map.objects) || []).map((o, i) => {
      if (i === 0 || o.newCombo || after) { colour = (colour + 1 + (i === 0 ? 0 : o.comboSkip)) % nColours; n = 1; } else n++;
      after = o.kind === 'spinner';
      return { n, colour };
    });
  }

  // ---- the document
  const DEFAULT_ELEMENTS = { circle: 'hitcircle', number: 'combonumber', approach: 'approachcircle', burst: 'hitburst', miss: 'hitmiss', body: 'sliderbody', ball: 'sliderball', spinner: 'spinner' };
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  /** a slider's body: the line its ball follows — the path's own polyline (model.pathTable) cut at osu!'s length, or carried
   *  on straight to it, as model.pathPoint goes. Not the points as given: a Bézier's middle points are off its curve.
   *  (Without model.js loaded: the points) */
  function lineOf(path) {
    const Mo = T.model;
    if (!Mo || !Mo.pathTable) return path.points.map((p) => [p[0], p[1]]);
    const { pts, acc, length } = Mo.pathTable(path), L = path.length > 0 ? path.length : length, out = [];
    for (let i = 0; i < pts.length && acc[i] < L - 1e-6; i++) out.push([r4(pts[i][0]), r4(pts[i][1])]);
    const end = Mo.pathPoint(path, 1, { length: L });
    out.push([r4(end[0]), r4(end[1])]);
    return out;
  }
  /** a beatmap → { doc, bodies, info }. opts: width (model units for the playfield's 512 osu! pixels, default 120; it keeps
   *  4:3, centred on 0, y up), designRadius (the radius the hit circle element is drawn at, model units, default 10),
   *  elements (the GeoUI elements' names, DEFAULT_ELEMENTS), sound (the music's sound id). bodies: each slider's path in
   *  model units — its points, the line its ball follows (line) and that line's middle (centre: the instance's bx, by,
   *  where the body element is put) — and width, for the editor to draw into an atlas (its frame is the instance's param f) */
  function toDocument(map, opts = {}) {
    const diff = difficultyOf(map), k = num(opts.width, 120) / 512, E = Object.assign({}, DEFAULT_ELEMENTS, opts.elements || {});
    const px = (x) => r4((x - 256) * k), py = (y) => r4((192 - y) * k);
    const lead = diff.preempt / 1000, fade = diff.fadeIn / 1000, late = diff.windows.meh / 1000, s = r4((diff.radius * k) / num(opts.designRadius, 10));
    const at = (v) => [{ t: 0, v }];
    // (the circles' size is the map's, the same for all: a number in the template, not a param of each instance)
    const place = { x: at('param.x'), y: at('param.y') }, size = { scaleX: at(s), scaleY: at(s) };
    // how a streamed instance's params fit in one property (24 bits): the playfield's x and y, the combo number and colour
    const hw = r4(num(opts.width, 120) / 2), field = [{ name: 'x', bits: 8, min: -hw, max: hw }, { name: 'y', bits: 7, min: r4(-hw * 0.75), max: r4(hw * 0.75) }, { name: 'n', bits: 6, min: 0, max: 63 }, { name: 'c', bits: 3, min: 0, max: 7 }];
    const fadeKeys = (to) => [{ t: 0, v: 0 }, { t: fade, v: to }];
    // the hit circle's look, shared by the circle and the slider's head: the circle (its colour a frame of the element's
    // image), its number, the approach ring closing in, the burst on a hit, the miss mark
    const circleTracks = () => [
      { target: E.circle, clips: [{ start: -lead, end: late, until: 'hit', channels: { ...place, ...size, opacity: fadeKeys(1), frame: at('param.c') } }] },
      { target: E.number, clips: [{ start: -lead, end: late, until: 'hit', channels: { ...place, ...size, opacity: fadeKeys(1), value: at('param.n') } }] },
      { target: E.approach, clips: [{ start: -lead, end: 0, channels: { ...place, scaleX: [{ t: 0, v: r4(s * 4) }, { t: lead, v: s }], scaleY: [{ t: 0, v: r4(s * 4) }, { t: lead, v: s }], opacity: fadeKeys(0.9), frame: at('param.c') } }] },
      { target: E.burst, clips: [{ start: 0, end: 0.25, trigger: 'hit', channels: { ...place, scaleX: [{ t: 0, v: s, ease: 'quad-out' }, { t: 0.25, v: r4(s * 1.4) }], scaleY: [{ t: 0, v: s, ease: 'quad-out' }, { t: 0.25, v: r4(s * 1.4) }], opacity: [{ t: 0, v: 1, ease: 'quad-in' }, { t: 0.25, v: 0 }] } }] },
      { target: E.miss, clips: [{ start: 0, end: 0.5, trigger: 'miss', channels: { x: at('param.x'), y: [{ t: 0, v: 'param.y' }, { t: 0.5, v: 'param.y - 5' }], opacity: [{ t: 0, v: 1 }, { t: 0.5, v: 0 }] } }] },
    ];
    const templates = [
      { id: 'osu-circle', name: 'osu! 円', lead, tail: r4(late + 0.5), params: ['x', 'y', 'n', 'c'], pack: field, tracks: circleTracks() },
      { id: 'osu-slider', name: 'osu! スライダー', lead, tail: 0.5, params: ['x', 'y', 'n', 'c', 'd', 'r', 'f', 'bx', 'by'], tracks: [
        { target: E.body, clips: [{ start: -lead, end: 'param.d + 0.15', channels: { x: at('param.bx'), y: at('param.by'), opacity: fadeKeys(0.85), frame: at('param.f') } }] },
        ...circleTracks(),
        { target: E.ball, clips: [{ start: 0, end: 'param.d', path: '@instance', channels: { ...size, path: at('1 - math.abs(math.mod(t * param.r / param.d, 2) - 1)') } }] },
      ] },
      { id: 'osu-spinner', name: 'osu! スピナー', lead: 0.3, tail: 0.3, params: ['d'], pack: [{ name: 'd', bits: 12, min: 0, max: 40.95 }], tracks: [
        { target: E.spinner, clips: [{ start: -0.3, end: 'param.d', channels: { opacity: [{ t: 0, v: 0 }, { t: 0.3, v: 1 }], rotation: at('t * 360') } }] }] },
    ];
    const cs = combos(map), instances = [], paths = [], bodies = [];
    let end = 0;
    (map.objects || []).forEach((o, i) => {
      const t = r4(o.time / 1000), c = cs[i];
      if (o.kind === 'circle') { instances.push({ id: `o${i + 1}`, template: 'osu-circle', t, params: { x: px(o.x), y: py(o.y), n: c.n, c: c.colour } }); end = Math.max(end, t + late); }
      else if (o.kind === 'slider') {
        const d = r4(sliderDuration(map, o) / 1000), pts = o.points.map((p) => [px(p[0]), py(p[1])]);
        const path = { id: `op${i + 1}`, kind: o.curve, points: pts, length: r4(o.length * k) };
        paths.push(path);
        // (the body drawn along the ball's line, put where that line's middle is)
        const line = lineOf(path), xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
        const bx = r4((Math.min(...xs) + Math.max(...xs)) / 2), by = r4((Math.min(...ys) + Math.max(...ys)) / 2);
        bodies.push({ frame: bodies.length, path: path.id, kind: o.curve, points: pts, line, centre: [bx, by], length: r4(o.length * k), width: r4(2 * diff.radius * k) });
        instances.push({ id: `o${i + 1}`, template: 'osu-slider', t, path: path.id, tail: r4(d + 0.5),
          params: { x: px(o.x), y: py(o.y), n: c.n, c: c.colour, d, r: o.slides, f: bodies.length - 1, bx, by } });
        end = Math.max(end, t + d + 0.5);
      } else if (o.kind === 'spinner') {
        const d = r4((o.endTime - o.time) / 1000);
        instances.push({ id: `o${i + 1}`, template: 'osu-spinner', t, tail: r4(d + 0.3), params: { d } });
        end = Math.max(end, t + d + 0.3);
      }
    });
    const tempo = (map.timing || []).filter((p) => p.uninherited && p.beatLength > 0).map((p) => ({ t: r4(p.time / 1000), bpm: r4(60000 / p.beatLength), meter: p.meter }));
    const duration = r4(Math.max(1, end + 1));
    const md = map.metadata || {};
    const seq = {
      id: 'osu', name: `${md.Title || 'osu!'}${md.Version ? ` [${md.Version}]` : ''}`, duration, fps: 60, loop: 'once', tempo, paths, templates, instances, markers: [],
      tracks: [{ id: 'osu-music', kind: 'audio', name: '音楽', target: '', clips: [{ id: 'osu-music-clip', start: 0, end: duration, sound: String(opts.sound || 'music') }] }],
    };
    return {
      doc: { version: 1, sequences: [seq] }, bodies,
      info: { title: md.Title || '', artist: md.Artist || '', creator: md.Creator || '', version: md.Version || '', audio: (map.general || {}).AudioFilename || '', difficulty: diff,
        counts: { circles: map.objects.filter((o) => o.kind === 'circle').length, sliders: map.objects.filter((o) => o.kind === 'slider').length, spinners: map.objects.filter((o) => o.kind === 'spinner').length },
        colours: (map.colours.combos.length ? map.colours.combos : [[255, 192, 0], [0, 202, 0], [18, 124, 255], [242, 24, 57]]) },
    };
  }

  /** a made-up beatmap of n objects (the lab's own: no real map or song) — circles on the half beat, sliders of every curve
   *  (Bézier, perfect circle, linear, Catmull) and their slides, now and then a spinner; 180 BPM, AR 9, OD 8, CS 4. The same
   *  seed, the same map: the tests and the large sample (demo.mjs) share it */
  function sampleMap(n = 300, seed = 7) {
    let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const lines = ['osu file format v14', '', '[Metadata]', 'Title:Lab Sample', 'Artist:bds-lab', `Version:${n} objects`, '', '[Difficulty]', 'HPDrainRate:5', 'CircleSize:4', 'OverallDifficulty:8', 'ApproachRate:9', 'SliderMultiplier:1.8', '',
      '[TimingPoints]', '1000,333.333,4,2,0,60,1,0', '', '[HitObjects]'];
    let t = 1000;
    for (let i = 0; i < n; i++) {
      const x = Math.round(40 + rnd() * 432), y = Math.round(40 + rnd() * 304), nc = i % 6 === 0 ? 4 : 0, r = rnd();
      if (r < 0.6) { lines.push(`${x},${y},${Math.round(t)},${1 | nc},0,0:0:0:0:`); t += 333.333 / 2; }
      else if (r < 0.95) {
        const k = ['B', 'P', 'L', 'C'][i % 4], pts = k === 'P' ? [[x + 60, y + 40], [x + 120, y]] : k === 'L' ? [[x + 100, y + 30]] : [[x + 40, y - 60], [x + 90, y + 50], [x + 140, y]];
        const len = Math.round(120 + rnd() * 100), sl = 1 + (i % 3 === 0 ? 1 : 0);
        lines.push(`${x},${y},${Math.round(t)},${2 | nc},0,${k}|${pts.map((p) => p.map((v) => Math.max(0, Math.min(512, Math.round(v)))).join(':')).join('|')},${sl},${len}`);
        t += (len / (1.8 * 100)) * 333.333 * sl + 333.333 / 2;
      } else { lines.push(`256,192,${Math.round(t)},12,0,${Math.round(t + 1500)},0:0:0:0:`); t += 2000; }
    }
    return `${lines.join('\n')}\n`;
  }

  // ---- the gameplay (osugame.js): what the game judges a beatmap by
  /** osu!'s difficulty range: a value at OD (or AR…) 0, 5 and 10, straight between */
  const diffRange = (v, lo, mid, hi) => (v > 5 ? mid + ((hi - mid) * (v - 5)) / 5 : v < 5 ? mid - ((mid - lo) * (5 - v)) / 5 : mid);
  /** a slider's ticks (ms from its start, every slide — mirrored on the way back) and edges (each turn and its end): ticks every
   *  100 × SliderMultiplier × SV / SliderTickRate osu! pixels, none within 10 ms of an edge (osu!lazer's rule) */
  function sliderMarks(map, obj) {
    const { beatLength, sv } = timingAt(map, obj.time), diff = difficultyOf(map), span = sliderDuration(map, obj) / obj.slides;
    const velocity = (diff.sliderMultiplier * 100 * sv) / beatLength, tickDist = (diff.sliderMultiplier * 100 * sv) / Math.max(0.1, diff.tickRate), minEnd = velocity * 10;
    const ticks = [], edges = [];
    for (let k = 0; k < obj.slides; k++) {
      const inSpan = [];
      for (let d = tickDist; d < obj.length - minEnd; d += tickDist) inSpan.push(d);
      for (const d of k % 2 ? inSpan.slice().reverse().map((x) => obj.length - x) : inSpan) ticks.push(Math.round(k * span + (d / obj.length) * span));
      edges.push(Math.round((k + 1) * span));
    }
    // (the end is judged 36 ms before it — osu!'s "legacy last tick": a release right at the end still counts)
    edges[edges.length - 1] = Math.round(Math.max(edges[edges.length - 1] - 36, (edges.length - 1) * span + span / 2));
    return { ticks, edges, span };
  }
  /** an object's hitsound names (osu!'s sample names, '<set>-hit<sound>'): the normal one always, and whistle / finish / clap */
  function hitsoundsOf(map, obj, hitSound = obj.hitSound, sets = obj) {
    const SETS = ['normal', 'normal', 'soft', 'drum'], tp = (() => { let t = null; for (const p of (map && map.timing) || []) { if (p.time > obj.time + 1e-9) break; t = p; } return t; })();
    const def = { Normal: 1, Soft: 2, Drum: 3 }[String((map.general || {}).SampleSet || 'Normal')] || 1;
    const base = (sets && sets.normalSet) || (tp && tp.sampleSet) || def, add = (sets && sets.additionSet) || base;
    const out = [`${SETS[base]}-hitnormal`];
    if (hitSound & 2) out.push(`${SETS[add]}-hitwhistle`);
    if (hitSound & 4) out.push(`${SETS[add]}-hitfinish`);
    if (hitSound & 8) out.push(`${SETS[add]}-hitclap`);
    return out;
  }
  /** a beatmap → osugame's config (G), in the model units toDocument places things in (opts.width; the same instance ids and
   *  templates). opts.sound(name) → the pack's sound id for an osu! sample name, or null (not played) */
  function gameOf(map, opts = {}) {
    const diff = difficultyOf(map), k = num(opts.width, 120) / 512, px = (x) => r4((x - 256) * k), py = (y) => r4((192 - y) * k);
    const snd = typeof opts.sound === 'function' ? opts.sound : (x) => x, ids = (names) => names.map(snd).filter(Boolean);
    const tpl = Object.assign({ circle: 'osu-circle', slider: 'osu-slider', spinner: 'osu-spinner' }, opts.templates || {});
    const objects = [], drainStart = map.objects.length ? map.objects[0].time : 0;
    let drainEnd = drainStart;
    (map.objects || []).forEach((o, i) => {
      const id = `o${i + 1}`;
      if (o.kind === 'circle') { objects.push({ k: 'c', t: Math.round(o.time), x: px(o.x), y: py(o.y), key: `${tpl.circle}/${id}`, hs: ids(hitsoundsOf(map, o)) }); drainEnd = Math.max(drainEnd, o.time); }
      else if (o.kind === 'slider') {
        const pts = o.points.map((p) => [px(p[0]), py(p[1])]), path = { id: `op${i + 1}`, kind: o.curve, points: pts, length: r4(o.length * k) }, line = lineOf(path);
        const acc = [0]; for (let j = 1; j < line.length; j++) acc.push(r4(acc[j - 1] + Math.hypot(line[j][0] - line[j - 1][0], line[j][1] - line[j - 1][1])));
        const m = sliderMarks(map, o), d = Math.round(sliderDuration(map, o));
        objects.push({ k: 's', t: Math.round(o.time), x: px(o.x), y: py(o.y), key: `${tpl.slider}/${id}`, hs: ids(hitsoundsOf(map, o)), d, r: o.slides, line, acc, len: acc[acc.length - 1],
          ticks: m.ticks, edges: m.edges, es: (o.edges || []).map((e) => ids(hitsoundsOf(map, o, e.hitSound, e.normalSet || e.additionSet ? e : o))) });
        drainEnd = Math.max(drainEnd, o.time + d);
      } else if (o.kind === 'spinner') {
        const secs = (o.endTime - o.time) / 1000;
        objects.push({ k: 'p', t: Math.round(o.time), e: Math.round(o.endTime), x: 0, y: 0, key: `${tpl.spinner}/${id}`, hs: ids(hitsoundsOf(map, o)), need: Math.max(0, Math.floor(diffRange(diff.od, 1.5, 2.5, 3.75) * secs)) });
        drainEnd = Math.max(drainEnd, o.endTime);
      }
    });
    const breaks = (map.breaks || []).map((b) => [Math.round(b.start), Math.round(b.end)]);
    const drainSecs = Math.max(1, (drainEnd - drainStart - breaks.reduce((n, b) => n + (b[1] - b[0]), 0)) / 1000);
    // (osu!stable's score multiplier: HP, CS, OD and the object density, 0…5)
    const diffMul = Math.round(((diff.hp + diff.cs + diff.od + Math.max(0, Math.min(16, (objects.length / drainSecs) * 8))) / 38) * 5);
    const kiai = [];
    let open = null;
    for (const p of map.timing || []) { if (p.kiai && open === null) open = p.time; else if (!p.kiai && open !== null) { kiai.push([Math.round(open), Math.round(p.time)]); open = null; } }
    if (open !== null) kiai.push([Math.round(open), Math.round(drainEnd + 1000)]);
    return { r: r4(diff.radius * k), follow: r4(diff.radius * k * 2.4), windows: { great: diff.windows.great, good: diff.windows.good, ok: diff.windows.meh }, preempt: diff.preempt, hp: diff.hp, od: diff.od, diffMul,
      objects, breaks, kiai, sounds: Object.assign({ break: snd('combobreak'), tick: snd('normal-slidertick'), bonus: snd('spinnerbonus'), clear: null, fail: snd('failsound'), applause: snd('applause') }, opts.sounds || {}) };
  }

  T.osu = { parseOsu, sampleMap, preempt, fadeIn, radius, hitWindows, difficultyOf, timingAt, sliderDuration, sliderMarks, hitsoundsOf, gameOf, diffRange, combos, lineOf, toDocument, DEFAULT_ELEMENTS };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osu;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/osugame.js
(function (module) {
// GeoUI timeline — osu!'s gameplay (pure, self-contained): the rules a beatmap is played by, the same in the game and in the
// editor's preview. A hit circle is hit by a press on time with the cursor on it (osu!'s 300 / 100 / 50 windows; a press before
// its window shakes it — notelock); a slider's head is a hit circle, then its ball is followed — the button held and the cursor
// inside the follow circle — through its ticks and turns, and judged at its end by how much of it was (all: 300, half: 100,
// some: 50); a spinner is spun around the playfield's middle, the spins it needs counted (osu!lazer's minimum spins per second
// for its OD), bonus spins past it. Score v1 (each hit's value grows with the combo and the beatmap's difficulty), accuracy,
// rank (SS … D), health (drained over time, filled by hits, emptied by misses), the combo and its breaks, hitsounds.
// Mods (osu!'s letters): HD and FL change what the client draws and the score (×1.06, ×1.12), NF never fails (×0.5), SD fails
// on a miss or a combo break, PF on anything but a 300. A failed play judges nothing more (osu! ends it: the script stops it).
// createGame's source goes into the behaviour pack's script as it is (runtime.js): it names nothing outside itself. autoInput
// is the autoplay (the cursor eased from object to object, the ball followed, spinners spun at 477 rpm): the preview plays it
// and `/scriptevent <ns>:mode auto` makes the game play itself. The config (G) is made from a beatmap by osu.js gameOf.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};

  /** G: { r (circle radius, model units), follow (follow circle radius), windows { great, good, ok } (ms), preempt (ms),
   *  diffMul (score), hp (0…10), objects: [{ k: 'c' | 's' | 'p', t (ms), x, y, key, hs: [sound ids] — a slider also d (ms, all
   *  its slides), r (slides), line [[x, y]…] and acc (its cumulative lengths) and len (osu!'s length), ticks [ms from t],
   *  edges [ms from t] (each turn and the end), es [[sound ids] each edge], a spinner e (end ms), need (spins) }],
   *  breaks [[ms, ms]], kiai [[ms, ms]], sounds { break, tick, bonus, clear, spin } }.
   *  → { start(ms), seek(ms), step(ms, input) → { results: [[key, code]], events: [[name, ms]], sounds: [[id, ms]] }, state(),
   *    autoInput(ms0, ms1) → input, ballAt(index, ms), rankOf(…), fail(ms) → { events } (the play failed now: the tour's),
   *    fastForward(ms) (played by the autoplay up to ms, nothing told: a jump with the score it would have), mods } — input:
   *  { cx, cy, hold, presses: [ms], aim (false: the cursor not needed — relax) }. opts: { mods: ['HD', 'FL', 'NF', 'SD', 'PF'] } */
  function createGame(G, opts) {
    const CODE = { hit: 1, miss: 2, great: 3, good: 4, ok: 5, early: 6, drop: 7 };
    const VALUE = { great: 300, good: 100, ok: 50 };
    const objs = G.objects || [], W = G.windows, R = G.r, FOLLOW = G.follow || R * 2.4, TAU = Math.PI * 2;
    const lastEnd = objs.length ? Math.max(...objs.map((o) => (o.k === 's' ? o.t + o.d : o.k === 'p' ? o.e : o.t))) : 0;
    const firstT = objs.length ? objs[0].t : 0;
    // (the mods: what the rules see of them — the client draws HD and FL by itself from the script's state)
    const MODS = new Set([].concat((opts && opts.mods) || []).map((m) => String(m).toUpperCase()).filter((m) => ['HD', 'FL', 'NF', 'SD', 'PF'].includes(m)));
    const MODMUL = (MODS.has('HD') ? 1.06 : 1) * (MODS.has('FL') ? 1.12 : 1) * (MODS.has('NF') ? 0.5 : 1);
    let S = null;
    const fresh = () => ({ t: 0, lo: 0, score: 0, combo: 0, maxcombo: 0, n300: 0, n100: 0, n50: 0, misses: 0, hp: 1, failed: false, failedAt: -1, broken: false,
      done: objs.map(() => false), head: objs.map(() => 0), parts: objs.map(() => [0, 0]), next: objs.map(() => 0), spins: objs.map(() => 0),
      angle: objs.map(() => null), sa: 0, rpmLog: [], bonus: objs.map(() => 0), cleared: objs.map(() => false), cx: 0, cy: 0, hold: 0, active: -1, kiaiAt: -1 });
    const inBreak = (t) => (G.breaks || []).some((b) => t >= b[0] && t < b[1]);
    const kiaiOf = (t) => (G.kiai || []).findIndex((b) => t >= b[0] && t < b[1]);
    /** where a slider's ball is at a time (model units): along its line, there and back by its slides */
    function ballAt(i, t) {
      const o = objs[i], span = o.d / o.r, e = Math.min(Math.max(0, t - o.t), o.d - 1e-6), n = Math.floor(e / span);
      let u = (e - n * span) / span;
      if (n % 2 === 1) u = 1 - u;
      const L = u * o.len, a = o.acc, p = o.line;
      if (L <= 0) return [p[0][0], p[0][1]];
      for (let j = 1; j < p.length; j++) if (a[j] >= L || j === p.length - 1) { const f = a[j] > a[j - 1] ? (L - a[j - 1]) / (a[j] - a[j - 1]) : 1; return [p[j - 1][0] + (p[j][0] - p[j - 1][0]) * f, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * f]; }
      return [p[p.length - 1][0], p[p.length - 1][1]];
    }
    /** osu!stable's rank from the counts: 0 none yet, 1 D, 2 C, 3 B, 4 A, 5 S, 6 SS (contract.js RANKS). SS: all 300s; S: over
     *  90 % 300s, under 1 % 50s and no miss; A: over 80 % with no miss, or over 90 %; B: over 70 % with no miss, or over 80 %;
     *  C: over 60 %; else D */
    function rankOf(n300, n100, n50, misses) {
      const total = n300 + n100 + n50 + misses;
      if (!total) return 0;
      const acc = (300 * n300 + 100 * n100 + 50 * n50) / (300 * total), r300 = n300 / total, r50 = n50 / total;
      return acc >= 1 ? 6 : r300 > 0.9 && r50 < 0.01 && !misses ? 5 : (r300 > 0.8 && !misses) || r300 > 0.9 ? 4 : (r300 > 0.7 && !misses) || r300 > 0.8 ? 3 : r300 > 0.6 ? 2 : 1;
    }
    const near = (x, y, cx, cy, r) => (cx - x) * (cx - x) + (cy - y) * (cy - y) <= r * r;
    function out() { return { results: [], events: [], sounds: [] }; }
    function judgeOf(dt) { const a = Math.abs(dt); return a <= W.great ? 'great' : a <= W.good ? 'good' : a <= W.ok ? 'ok' : null; }
    /** the play failed at t (once): judged no more — osu! ends it there */
    function failNow(o, t) { if (S.failed) return; S.failed = true; S.failedAt = t; o.events.push(['fail', t]); }
    // (health out: a fail, but with NF — the bar stays empty and the play goes on)
    function hpAdd(o, v, t) { S.hp = Math.min(1, Math.max(0, S.hp + v)); if (S.hp <= 0 && !MODS.has('NF')) failNow(o, t === undefined ? S.t : t); }
    const HPK = 1 + (G.hp || 5) / 5;
    function comboUp(o, t) { S.combo++; S.maxcombo = Math.max(S.maxcombo, S.combo); o.events.push(['combo', t]); }
    // (a break — a miss, a slider's head or tick let go — ends a full combo; SD and PF fail on it)
    function breakCombo(o, t) {
      if (S.combo > 0) { o.events.push(['break', t]); if (S.combo >= 20 && G.sounds && G.sounds.break) o.sounds.push([G.sounds.break, t]); }
      S.combo = 0; S.broken = true;
      if (MODS.has('SD') || MODS.has('PF')) failNow(o, t);
    }
    /** a judgement that counts towards accuracy (a circle, a slider's end, a spinner): its score with the combo before it */
    function judge(o, i, name, t) {
      const ob = objs[i];
      S.done[i] = true;
      if (name === 'miss') {
        S.misses++; o.results.push([ob.key, CODE.miss]); o.events.push(['miss', t]);
        breakCombo(o, t); hpAdd(o, -0.06 * HPK, t);
        return;
      }
      const v = VALUE[name];
      // (score v1: the hit's value, and its value again by the combo before it × the difficulty × the mods, over 25)
      S.score += v + Math.floor((v * Math.max(0, S.combo - 1) * (G.diffMul || 1) * MODMUL) / 25);
      if (name === 'great') S.n300++; else if (name === 'good') S.n100++; else S.n50++;
      // (a slider's end and a spinner add no combo of their own here: the combo went up on their head, ticks and turns — a spinner
      //  does count one, as in osu!)
      if (ob.k !== 's') comboUp(o, t);
      hpAdd(o, name === 'great' ? 0.05 : name === 'good' ? 0.025 : 0.008, t);
      o.results.push([ob.key, CODE[name]]); o.events.push(['hit', t], [name, t]);
      if (name !== 'great' && MODS.has('PF')) failNow(o, t);
    }
    /** a press at time pt with the cursor at cx, cy (aim: it must be on the object) */
    function press(o, pt, cx, cy, aim) {
      // (the earliest object still to be hit: only it can be — osu!'s notelock)
      let i = -1;
      for (let j = 0; j < objs.length; j++) { const ob = objs[j]; if (S.done[j] || ob.k === 'p' || (ob.k === 's' && S.head[j])) continue; if (ob.t + W.ok < pt) continue; i = j; break; }
      if (i < 0) return;
      const ob = objs[i];
      if (aim && !near(ob.x, ob.y, cx, cy, R)) return;
      const j = judgeOf(pt - ob.t);
      if (!j) {
        // (pressed before its window, while it shows: it shakes, nothing else)
        if (pt >= ob.t - (G.preempt || 1200)) o.results.push([ob.key, CODE.early]);
        return;
      }
      if (ob.k === 'c') { judge(o, i, j, pt); for (const id of ob.hs || []) o.sounds.push([id, pt]); return; }
      // a slider's head: a part of it (counted at its end), the combo up, its hitsound
      S.head[i] = 1; S.parts[i][0]++; S.parts[i][1]++; comboUp(o, pt); S.score += 30; hpAdd(o, 0.02);
      o.results.push([ob.key, CODE.hit]); o.events.push(['hit', pt]);
      for (const id of ob.es && ob.es[0] ? ob.es[0] : ob.hs || []) o.sounds.push([id, pt]);
    }
    /** everything due by time t that needs no press: missed heads and circles, slider ticks and turns, spinners, health */
    function settle(o, t0, t, inp) {
      // (S.lo: the first object not judged yet — those before it are all done)
      while (S.lo < objs.length && S.done[S.lo]) S.lo++;
      for (let i = S.lo; i < objs.length; i++) {
        const ob = objs[i];
        if (S.failed) return;
        if (S.done[i]) continue;
        if (ob.t - (G.preempt || 1200) > t) break;
        if (ob.k === 'c') { if (ob.t + W.ok < t) judge(o, i, 'miss', ob.t + W.ok); continue; }
        if (ob.k === 's') {
          if (!S.head[i] && ob.t + W.ok < t) { S.head[i] = 2; S.parts[i][1]++; breakCombo(o, ob.t + W.ok); o.results.push([ob.key, CODE.drop]); }
          // ticks and turns passed since the last step: followed when held with the cursor near the ball
          const marks = [...(ob.ticks || []).map((x) => [x, 'tick']), ...(ob.edges || []).map((x, k) => [x, k === ob.edges.length - 1 ? 'end' : 'turn', k])].sort((a, b) => a[0] - b[0]);
          while (S.next[i] < marks.length && ob.t + marks[S.next[i]][0] <= t) {
            const [dt, kind, k] = marks[S.next[i]++], at = ob.t + dt, b = ballAt(i, at), ok = inp.hold && (inp.aim === false || near(b[0], b[1], inp.cx, inp.cy, FOLLOW));
            S.parts[i][1]++;
            if (ok) {
              S.parts[i][0]++;
              if (kind !== 'end') { S.score += kind === 'tick' ? 10 : 30; comboUp(o, at); o.events.push(['tick', at]); hpAdd(o, 0.01); }
              const snd = kind === 'tick' ? (G.sounds && G.sounds.tick ? [G.sounds.tick] : []) : ob.es && ob.es[k + 1] ? ob.es[k + 1] : ob.hs || [];
              for (const id of snd) o.sounds.push([id, at]);
            } else if (kind !== 'end') breakCombo(o, at);
          }
          if (ob.t + ob.d <= t) {
            const [got, all] = S.parts[i], f = all ? got / all : 0;
            judge(o, i, f >= 1 ? 'great' : f >= 0.5 ? 'good' : f > 0 ? 'ok' : 'miss', ob.t + ob.d);
          }
          continue;
        }
        // a spinner: the cursor's turn around the middle while held, between its start and its end
        if (ob.k === 'p') {
          if (t >= ob.t && t0 < ob.e && inp.hold) {
            const a = Math.atan2(inp.cy - (ob.y || 0), inp.cx - (ob.x || 0)), prev = S.angle[i];
            if (prev !== null && Math.hypot(inp.cx - (ob.x || 0), inp.cy - (ob.y || 0)) > R * 0.25) {
              let d = a - prev;
              while (d > Math.PI) d -= TAU;
              while (d < -Math.PI) d += TAU;
              const turns = Math.abs(d) / TAU, before = Math.floor(S.spins[i]);
              S.spins[i] += turns; S.sa = (S.sa + (d * 180) / Math.PI + 3600) % 360;
              S.rpmLog.push([t, turns]);
              for (let k = before + 1; k <= Math.floor(S.spins[i]); k++) {
                if (k <= ob.need) S.score += 100;
                else { S.score += 1000; S.bonus[i]++; o.events.push(['bonus', t]); if (G.sounds && G.sounds.bonus) o.sounds.push([G.sounds.bonus, t]); }
              }
              if (!S.cleared[i] && S.spins[i] >= ob.need) { S.cleared[i] = true; o.events.push(['clear', t]); if (G.sounds && G.sounds.clear) o.sounds.push([G.sounds.clear, t]); }
            }
            S.angle[i] = a;
          } else if (!inp.hold) S.angle[i] = null;
          if (ob.e <= t) {
            const f = ob.need > 0 ? S.spins[i] / ob.need : 1;
            judge(o, i, f >= 1 ? 'great' : f > 0.9 ? 'good' : f > 0.75 ? 'ok' : 'miss', ob.e);
          }
        }
      }
      // (health drains while there is something to play, not in a break)
      if (t > firstT && t0 < lastEnd && !inBreak(t)) hpAdd(o, -((t - t0) / 1000) * (0.008 + 0.004 * (G.hp || 5)), t);
      if (S.failed) return;
      const k = kiaiOf(t);
      if (k >= 0 && k !== S.kiaiAt) o.events.push(['kiai', (G.kiai[k] || [t])[0]]);
      S.kiaiAt = k;
    }
    const api = {
      /** a new play from a time: everything scored afresh, what is before it left out */
      start(ms) { S = fresh(); api.seek(ms); return api; },
      /** from another time (a seek, a resume, a loop going round): what is before it left out, the score kept (the very time it
       *  is at already: nothing left out — a slider being followed stays followed) */
      seek(ms) {
        if (!S) S = fresh();
        if (ms === S.t && S.lo !== undefined) return api;
        S.t = ms; S.angle = objs.map(() => null); S.rpmLog = []; S.lo = 0;
        objs.forEach((ob, i) => {
          const end = ob.k === 's' ? ob.t + ob.d : ob.k === 'p' ? ob.e : ob.t + W.ok;
          S.done[i] = end < ms;
          if (!S.done[i] && ob.k === 's' && ob.t + W.ok < ms) { S.head[i] = 2; S.parts[i] = [0, 1]; const marks = (ob.ticks || []).length + (ob.edges || []).length; S.next[i] = [...(ob.ticks || []), ...(ob.edges || [])].filter((x) => ob.t + x <= ms).length; S.parts[i][1] += Math.min(marks, S.next[i]); }
          else if (!S.done[i]) { S.head[i] = 0; S.parts[i] = [0, 0]; S.next[i] = 0; }
        });
        S.kiaiAt = kiaiOf(ms);
        return api;
      },
      step(ms, inp0) {
        if (!S) S = fresh();
        const inp = Object.assign({ cx: S.cx, cy: S.cy, hold: 0, presses: [], aim: true }, inp0 || {}), o = out();
        S.cx = inp.cx; S.cy = inp.cy; S.hold = inp.hold ? 1 : 0;
        // (failed: nothing judged any more — the cursor still follows)
        if (S.failed) { S.t = Math.max(S.t, ms); return o; }
        // presses in time order, each after what was due before it (none once a press or what came due made the play fail)
        for (const pt of [...(inp.presses || [])].sort((a, b) => a - b)) { if (pt > ms || S.failed) continue; settle(o, S.t, Math.max(S.t, pt), inp); S.t = Math.max(S.t, pt); if (!S.failed) press(o, pt, inp.cx, inp.cy, inp.aim !== false); }
        if (!S.failed) settle(o, S.t, ms, inp);
        S.t = Math.max(S.t, ms);
        S.rpmLog = S.rpmLog.filter((x) => x[0] > ms - 1000);
        S.active = objs.findIndex((ob, i) => !S.done[i] && ob.t - (G.preempt || 1200) <= ms);
        return o;
      },
      state() {
        const total = S.n300 + S.n100 + S.n50 + S.misses, acc = total ? (300 * S.n300 + 100 * S.n100 + 50 * S.n50) / (300 * total) : 1;
        const rank = rankOf(S.n300, S.n100, S.n50, S.misses);
        const sp = objs.findIndex((ob, i) => ob.k === 'p' && S.t >= ob.t && S.t < ob.e);
        return { score: S.score, combo: S.combo, acc: Math.round(acc * 10000) / 100, hp: Math.round(S.hp * 100), cx: S.cx, cy: S.cy, hold: S.hold,
          spin: sp >= 0 && objs[sp].need > 0 ? Math.min(1, S.spins[sp] / objs[sp].need) : 0, rpm: Math.min(511, Math.round(S.rpmLog.reduce((a, x) => a + x[1], 0) * 60)), sa: S.sa,
          rank, maxcombo: S.maxcombo, misses: S.misses, n300: S.n300, n100: S.n100, n50: S.n50, failed: S.failed ? 1 : 0, failedAt: S.failedAt,
          // (a full combo so far: no miss and no break — osu!'s "perfect" stamp; done: every object judged, the play over)
          fc: S.broken ? 0 : 1, done: objs.length && S.t > lastEnd ? 1 : 0 };
      },
      /** the play fails now (a fail shown on purpose — the tour): the fail event, nothing judged after */
      fail(ms) { if (!S) S = fresh(); const o = out(); S.hp = 0; S.t = Math.max(S.t, ms); failNow(o, ms); return o; },
      /** the autoplay from where the play is up to ms, its results and sounds dropped: the score a jump would have. Every 50 ms
       *  through a slider or a spinner (the ball followed, the spinner turned), else one step to the next object — the server's
       *  script runs it within a tick (the tour's results: the whole play at once) */
      fastForward(ms) {
        if (!S) S = fresh();
        for (let t = S.t; t < ms && !S.failed;) {
          let busy = false, next = ms;
          for (let i = S.lo; i < objs.length; i++) {
            const ob = objs[i];
            if (ob.t > t) { next = Math.min(next, ob.t); if (ob.t - t > 50) break; }
            if ((ob.k === 's' && t + 50 > ob.t && t < ob.t + ob.d + 20) || (ob.k === 'p' && t + 50 > ob.t && t < ob.e)) { busy = true; break; }
          }
          const nt = busy || next <= t ? Math.min(ms, t + 50) : Math.min(ms, next);
          api.step(nt, api.autoInput(t, nt)); t = nt;
        }
        return api;
      },
      mods: [...MODS],
      /** the autoplay's input between two times: the cursor eased from where it was to the next object (on it at its time),
       *  along a slider's ball, around a spinner at 477 rpm; every press exactly on time */
      autoInput(ms0, ms) {
        const presses = [];
        for (const ob of objs) if ((ob.k === 'c' || ob.k === 's') && ob.t > ms0 && ob.t <= ms) presses.push(ob.t);
        let cx = 0, cy = 0, hold = 0;
        // (the object now: the first not over — a slider held a moment past its end, a spinner to its end)
        const i = objs.findIndex((ob) => (ob.k === 's' ? ob.t + ob.d + 20 : ob.k === 'p' ? ob.e : ob.t) >= ms);
        if (i < 0) { const l = objs[objs.length - 1]; if (l) { const e = l.k === 's' ? ballAt(objs.length - 1, l.t + l.d) : [l.x || 0, l.y || 0]; cx = e[0]; cy = e[1]; } }
        else {
          const ob = objs[i];
          if (ob.k === 's' && ms >= ob.t) { const b = ballAt(i, Math.min(ms, ob.t + ob.d)); cx = b[0]; cy = b[1]; hold = 1; }
          else if (ob.k === 'p' && ms >= ob.t) { const a = ((ms - ob.t) / 60000) * 477 * TAU; cx = (ob.x || 0) + Math.cos(a) * R * 1.6; cy = (ob.y || 0) + Math.sin(a) * R * 1.6; hold = 1; }
          else {
            // between the one before (its end) and this one: eased, there at its time
            const p = objs[i - 1], from = p ? (p.k === 's' ? ballAt(i - 1, p.t + p.d) : p.k === 'p' ? [p.x || 0, p.y || 0] : [p.x, p.y]) : [0, 0];
            const tFrom = p ? (p.k === 's' ? p.t + p.d : p.k === 'p' ? p.e : p.t) : Math.max(0, ob.t - 1000), to = ob.k === 'p' ? [(ob.x || 0) + R * 1.6, ob.y || 0] : [ob.x, ob.y];
            const f = Math.min(1, Math.max(0, (ms - tFrom) / Math.max(1, ob.t - tFrom))), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
            cx = from[0] + (to[0] - from[0]) * e; cy = from[1] + (to[1] - from[1]) * e;
            hold = presses.length ? 1 : 0;
          }
        }
        return { cx, cy, hold, presses, aim: true };
      },
      ballAt,
      rankOf,
    };
    return api;
  }

  /** the autoplay of a whole map, for the preview: every 1/fps s → { events: [{ instance (key's instance id, or null for the
   *  whole play), name, t (s) }], states: [{ … }] at i / fps, sounds: [[id, t (s)]] (its hitsounds), at(t) → the state at t } */
  function autoplay(G, { fps = 60, until, mods } = {}) {
    const g = createGame(G, { mods }).start(0), end = until !== undefined ? until : (G.objects || []).reduce((m, o) => Math.max(m, o.k === 's' ? o.t + o.d : o.k === 'p' ? o.e : o.t), 0) + 2000;
    const events = [], states = [], sounds = [], dt = 1000 / fps, inst = (key) => String(key).split('/').pop();
    const NAMES = ['none', 'hit', 'miss', 'great', 'good', 'ok', 'early', 'drop'];
    let prev = 0;
    for (let i = 0; i * dt <= end; i++) {
      const ms = i * dt, r = g.step(ms, g.autoInput(prev, ms));
      for (const [key, code] of r.results) events.push({ instance: inst(key), name: NAMES[code], t: Math.round(ms) / 1000 });
      for (const [name, t] of r.events) events.push({ instance: null, name, t: Math.round(t) / 1000 });
      for (const [id, t] of r.sounds) sounds.push([id, Math.round(t) / 1000]);
      states.push(g.state());
      prev = ms;
    }
    return { events, states, sounds, at: (t) => states[Math.max(0, Math.min(states.length - 1, Math.round(t * fps)))] || {} };
  }

  T.osugame = { createGame, autoplay };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osugame;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/osukit.js
(function (module) {
// GeoUI timeline — osu! made whole (pure): a beatmap into a GeoUI design (its elements and one texture atlas), a timeline
// document (the hit objects as instances of templates, the playfield's own motion, the HUD) and the gameplay config
// (osugame.js) — in two looks:
//   pixel: low-res pixel art built of cubes. Every sprite is a voxel model — its front the pixels, its sides the same pixels
//          darker — and the whole playfield stands tilted in 3D (its sides show) and leans with the cursor (parallax); circles
//          pop in, burst into cubes, numbers and judgements are voxel digits. A chiptune hitsound set.
//   skin:  osu!'s own skin (the Legacy skin: hit circles tinted by combo colour under their overlay, approach circles, default
//          numbers, 300 / 100 / 50 / miss, slider balls rolling, follow circles, reverse arrows, ticks, follow points, the
//          spinner, score digits, the health bar, the cursor, rank letters) in a high-resolution atlas, flat like osu!.
// Both: the music, the playfield shaking on a miss, pulsing on each beat of a kiai section and leaning with the cursor, osu!'s
// early-press shake (notelock), circles exploding on a hit, the combo counter popping, the spinner turning with the cursor,
// a section pass / fail in the break, the rank at the end — and the game's rules (osugame.js: score v1, accuracy, health).
// Images in and out are { width, height, data: RGBA bytes }; the caller decodes and encodes PNGs (Node: png.mjs, Blockbench:
// a canvas). build(map, opts) → { design, doc, game, info, sounds, stats, warnings }.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

  // ---------------------------------------------------------------------------------------------------------------- images
  const img = (w, h) => ({ width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)), data: new Uint8Array(Math.max(1, Math.ceil(w)) * Math.max(1, Math.ceil(h)) * 4) });
  function put(im, x, y, c) {
    if (x < 0 || y < 0 || x >= im.width || y >= im.height || !(c[3] > 0)) return;
    const o = (y * im.width + x) * 4, a = c[3] / 255, b = im.data[o + 3] / 255, out = a + b * (1 - a);
    for (let k = 0; k < 3; k++) im.data[o + k] = Math.round((c[k] * a + im.data[o + k] * b * (1 - a)) / (out || 1));
    im.data[o + 3] = Math.round(out * 255);
  }
  const get = (im, x, y) => { if (x < 0 || y < 0 || x >= im.width || y >= im.height) return [0, 0, 0, 0]; const o = (y * im.width + x) * 4; return [im.data[o], im.data[o + 1], im.data[o + 2], im.data[o + 3]]; };
  /** src drawn over dst at (dx, dy), each pixel's colour multiplied by tint ([r, g, b] 0…255) */
  function blit(dst, src, dx, dy, tint) { for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) { const c = get(src, x, y); if (tint) for (let k = 0; k < 3; k++) c[k] = Math.round((c[k] * tint[k]) / 255); put(dst, dx + x, dy + y, c); } }
  /** a resized copy: each output pixel the average of what it covers (premultiplied: no dark fringe), bilinear when growing */
  function resize(src, w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    const out = img(w, h), sx = src.width / w, sy = src.height / h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      if (sx <= 1 && sy <= 1) {
        const fx = Math.max(0, (x + 0.5) * sx - 0.5), fy = Math.max(0, (y + 0.5) * sy - 0.5), x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        for (const [xx, yy, wgt] of [[x0, y0, (1 - ax) * (1 - ay)], [x0 + 1, y0, ax * (1 - ay)], [x0, y0 + 1, (1 - ax) * ay], [x0 + 1, y0 + 1, ax * ay]]) { const c = get(src, Math.min(src.width - 1, xx), Math.min(src.height - 1, yy)), al = c[3] / 255; r += c[0] * al * wgt; g += c[1] * al * wgt; b += c[2] * al * wgt; a += al * wgt; n += wgt; }
      } else {
        const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy;
        for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wgt = (Math.min(x1, xx + 1) - Math.max(x0, xx)) * (Math.min(y1, yy + 1) - Math.max(y0, yy));
          if (wgt <= 0) continue;
          const c = get(src, xx, yy), al = c[3] / 255; r += c[0] * al * wgt; g += c[1] * al * wgt; b += c[2] * al * wgt; a += al * wgt; n += wgt;
        }
      }
      const o = (y * w + x) * 4, A = n ? a / n : 0;
      if (A > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); out.data[o + 3] = Math.round(A * 255); }
    }
    return out;
  }
  /** the same picture placed in the middle of a w × h canvas */
  function centred(src, w, h) { const o = img(w, h); blit(o, src, Math.floor((w - src.width) / 2), Math.floor((h - src.height) / 2)); return o; }
  const shade = (c, f) => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f), c[3]];
  const mix = (a, b, f) => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)).concat([a[3] === undefined ? 255 : a[3]]);

  // ---------------------------------------------------------------------------------------------------------------- pixel art
  // a 3 × 5 font (each glyph 5 rows of 3 bits, top first) and a few 5-wide glyphs
  const FONT = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'], A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    I: ['111', '010', '010', '010', '111'], L: ['100', '100', '100', '100', '111'], N: ['101', '111', '111', '111', '101'], P: ['110', '101', '110', '100', '100'],
    R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], '!': ['010', '010', '010', '000', '010'], '.': ['000', '000', '000', '000', '010'],
    x: ['000', '101', '010', '101', '000'], '%': ['101', '001', '010', '100', '101'], X: ['10001', '01010', '00100', '01010', '10001'],
    H: ['101', '101', '111', '101', '101'], O: ['111', '101', '101', '101', '111'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
    Y: ['101', '101', '010', '010', '010'], G: ['011', '100', '101', '101', '011'], K: ['101', '101', '110', '101', '101'],
    M: ['10001', '11011', '10101', '10001', '10001'], W: ['10001', '10001', '10101', '11011', '10001'], ' ': ['0', '0', '0', '0', '0'],
    ':': ['000', '010', '000', '010', '000'], J: ['001', '001', '001', '101', '111'],
  };
  /** text in the font → an image (1 px a pixel, gap px between glyphs), colour c, a darker outline row below (depth on a flat face) */
  function textImage(s, c, { gap = 1 } = {}) {
    const glyphs = [...String(s)].map((ch) => FONT[ch] || FONT[ch.toUpperCase()] || ['000', '000', '000', '000', '000']), w = glyphs.reduce((n, g) => n + g[0].length, 0) + gap * (glyphs.length - 1);
    const im = img(w, 5);
    let x0 = 0;
    for (const g of glyphs) { g.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') put(im, x0 + x, y, y === 0 ? mix(c, [255, 255, 255], 0.35) : c); })); x0 += g[0].length + gap; }
    return im;
  }
  // a stroke font for the skin look's words that osu!'s skin has no picture for (FAILED, NEW RECORD!, the mods): each glyph lines
  // on a 4 × 6 grid (y down), drawn smooth — round-capped strokes (media.js rasterOps), an outline under a lit fill
  const STROKES = {
    A: [[[0, 6], [2, 0], [4, 6]], [[0.75, 4], [3.25, 4]]], B: [[[0, 3], [0, 0], [2.6, 0], [3.6, 0.8], [3.6, 2.2], [2.6, 3], [0, 3], [3, 3], [4, 3.9], [4, 5.1], [3, 6], [0, 6], [0, 3]]],
    C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]], D: [[[0, 0], [0, 6], [2.4, 6], [4, 4.4], [4, 1.6], [2.4, 0], [0, 0]]],
    E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]], F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
    G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.4], [2.4, 3.4]]], H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    I: [[[0, 0], [2, 0]], [[1, 0], [1, 6]], [[0, 6], [2, 6]]], J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]], K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.4, 2.6], [4, 6]]],
    L: [[[0, 0], [0, 6], [4, 6]]], M: [[[0, 6], [0, 0], [2, 3.4], [4, 0], [4, 6]]], N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
    O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]], P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.2], [3, 3.2], [0, 3.2]]],
    R: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.2], [3, 3.2], [0, 3.2]], [[2.2, 3.2], [4, 6]]], S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
    T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]], U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]], W: [[[0, 0], [0.9, 6], [2, 2.4], [3.1, 6], [4, 0]]],
    X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]], Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]], '!': [[[0, 0], [0, 4]], [[0, 6], [0, 6]]], ':': [[[0, 1.6], [0, 1.6]], [[0, 4.6], [0, 4.6]]],
  };
  /** text in the stroke font → an image: ppu pixels a grid unit, the fill weight units wide (lit from the top: lighter above,
   *  darker below), an outline edge units round it. → { image, cap } (cap: the glyphs' height over the image's) */
  function strokeText(s, { colour = [255, 255, 255], outline = [0, 0, 0], ppu = 8, weight = 1.15, edge = 0.5, gap = 2 } = {}) {
    const glyphs = [...String(s).toUpperCase()].map((ch) => (ch === ' ' ? null : STROKES[ch] || null)), widthOf = (g) => (g ? Math.max(...g.flat().map((p) => p[0])) : 1.6);
    const pad = weight / 2 + edge + 0.4, path = [];
    let x = pad;
    glyphs.forEach((g, i) => { if (g) for (const l of g) { path.push(['moveTo', (x + l[0][0]) * ppu, (pad + l[0][1]) * ppu]); for (const p of l.slice(1)) path.push(['lineTo', (x + p[0]) * ppu, (pad + p[1]) * ppu]); } x += widthOf(g) + (i < glyphs.length - 1 ? gap : 0); });
    const W = (x + pad) * ppu, Hh = (6 + 2 * pad) * ppu, rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
    const under = T.media.rasterOps([['strokeStyle', rgb(outline)], ['lineWidth', (weight + 2 * edge) * ppu], ['beginPath'], ...path, ['stroke']], W, Hh);
    const fill = T.media.rasterOps([['strokeStyle', rgb(colour)], ['lineWidth', weight * ppu], ['beginPath'], ...path, ['stroke']], W, Hh);
    const im = { width: under.width, height: under.height, data: under.data };
    for (let y = 0; y < fill.height; y++) { const f = 1.14 - 0.3 * (y / fill.height); for (let x2 = 0; x2 < fill.width; x2++) { const c = get(fill, x2, y); if (c[3]) put(im, x2, y, [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f)), c[3]]); } }
    return { image: im, cap: 6 / (6 + 2 * pad) };
  }
  /** a disc / ring of pixels (centre at the middle of an n × n image), coloured by fn(x, y, d) */
  function discImage(n, fn) { const im = img(n, n), c = n / 2; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c), col = fn(x, y, d, c); if (col) put(im, x, y, col); } return im; }
  const WHITE = [255, 255, 255, 255];
  /** the pixel look's sprites for a combo colour palette → { name: image | [images] (frames) } */
  function pixelSprites(colours) {
    const S = {};
    // hit circle (16 px): a white rim, the combo colour lit from the top left, a dark ring between
    S.hitcircle = colours.map((cc) => discImage(16, (x, y, d) => { if (d > 7.9) return null; if (d > 6.6) return WHITE; if (d > 5.7) return shade([...cc, 255], 0.55); const l = (8 - x - y) / 16; return l > 0.18 && d < 4.2 ? mix([...cc, 255], [255, 255, 255], 0.45) : l < -0.3 ? shade([...cc, 255], 0.78) : [...cc, 255]; }));
    S.approachcircle = colours.map((cc) => discImage(16, (x, y, d) => (d > 6.9 && d <= 7.9 ? mix([...cc, 255], [255, 255, 255], 0.3) : null)));
    S.hitburst = discImage(16, (x, y, d, c) => { const a = Math.atan2(y + 0.5 - c, x + 0.5 - c), k = ((a / (Math.PI * 2)) * 8 + 8.5) % 1; return d > 5 && d <= 7.6 && k > 0.35 && k < 0.65 ? (d > 6.5 ? [255, 236, 140, 255] : WHITE) : null; });
    S.sliderball = discImage(8, (x, y, d) => (d > 3.95 ? null : d > 3 ? [255, 160, 40, 255] : (x + y < 6 ? [255, 255, 220, 255] : [255, 212, 90, 255])));
    S.followcircle = discImage(28, (x, y, d) => (d > 12.9 && d <= 13.95 ? [255, 255, 255, 255] : d > 12 && d <= 12.9 ? [255, 190, 80, 255] : null));
    S.reversearrow = (() => { const im = img(7, 7); ['0010000', '0011000', '1111100', '1111110', '1111100', '0011000', '0010000'].forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') put(im, x, y, y === 3 ? [255, 255, 160, 255] : WHITE); })); return im; })();
    S.slidertick = discImage(3, (x, y, d) => (d < 1.6 ? WHITE : null));
    S.followpoint = (() => { const im = img(3, 5); [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]].forEach(([x, y]) => put(im, x, y, [200, 220, 255, 255])); return im; })();
    S.spinner = discImage(32, (x, y, d, c) => { const a = Math.atan2(y + 0.5 - c, x + 0.5 - c), spoke = Math.abs(((a / (Math.PI * 2)) * 6 + 6) % 1 - 0.5) > 0.42; if (d > 15.9) return null; if (d > 14.6) return WHITE; if (d > 13.4) return [70, 110, 255, 255]; if (spoke && d > 3 && d < 13.4) return [140, 170, 255, 255]; if (d <= 2.5) return [255, 255, 255, 255]; return null; });
    S.spinnerapproach = discImage(32, (x, y, d) => (d > 14.9 && d <= 15.9 ? [140, 220, 255, 255] : null));
    S.cursor = (() => { const im = img(7, 7); ['0001000', '0011100', '0110110', '1100011', '0110110', '0011100', '0001000'].forEach((r, y) => [...r].forEach((b, x) => { if (b === '1') put(im, x, y, (x + y) % 2 ? [255, 230, 120, 255] : WHITE); })); return im; })();
    S.judgement = [textImage('300', [94, 200, 255, 255]), textImage('100', [124, 255, 94, 255]), textImage('50', [255, 179, 71, 255]), textImage('X', [255, 64, 64, 255])];
    S.digit = Array.from({ length: 10 }, (_, d) => textImage(String(d), WHITE));
    S.spin = textImage('SPIN!', [140, 220, 255, 255]); S.clear = textImage('CLEAR', [255, 220, 80, 255]);
    S.rank = ['SS', 'S', 'A', 'B', 'C', 'D'].map((r, i) => textImage(r, [[255, 240, 120], [255, 210, 64], [120, 255, 120], [90, 180, 255], [220, 120, 255], [255, 90, 90]][i].concat([255])));
    S.section = [textImage('PASS', [120, 255, 140, 255]), textImage('FAIL', [255, 90, 90, 255])];
    S.x = textImage('x', WHITE); S.dot = textImage('.', WHITE); S.pct = textImage('%', WHITE);
    // the HUD's bars (1 px tall strips, a few long) and the board under the playfield (a grid, dark see-through)
    S.barback = (() => { const im = img(42, 3); for (let x = 0; x < 42; x++) for (let y = 0; y < 3; y++) put(im, x, y, y === 0 ? [90, 90, 130, 255] : [36, 36, 54, 255]); return im; })();
    S.barfill = (() => { const im = img(40, 1); for (let x = 0; x < 40; x++) put(im, x, 0, mix([255, 90, 120, 255], [120, 255, 160, 255], x / 39)); return im; })();
    S.board = (() => { const im = img(64, 48); for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) put(im, x, y, x % 8 === 0 || y % 8 === 0 ? [52, 58, 98, 200] : (x + y) % 2 ? [12, 14, 28, 190] : [16, 18, 34, 190]); return im; })();
    S.glow = discImage(16, (x, y, d) => (d < 7.9 ? [255, 255, 255, Math.round(150 * (1 - d / 8))] : null));
    // the rank letters again, silver (HD or FL on: osu!'s silver SS and S)
    S.rank.push(textImage('SS', [220, 230, 245, 255]), textImage('S', [190, 205, 225, 255]));
    // the results: the board (a dark panel, a frame of bright cubes), its words, the full combo's and the new best's stamps
    S.resboard = (() => { const im = img(48, 39); for (let y = 0; y < 39; y++) for (let x = 0; x < 48; x++) { const e = Math.min(x, y, 47 - x, 38 - y), bar = y >= 1 && y <= 6; put(im, x, y, e === 0 ? [120, 140, 230, 255] : bar ? (y === 1 ? [70, 80, 150, 235] : [38, 44, 92, 235]) : y === 7 ? [120, 140, 230, 255] : e === 1 ? [30, 34, 70, 230] : (x + y) % 2 ? [14, 16, 32, 225] : [18, 20, 40, 225]); } return im; })();
    S.restitle = textImage('RESULTS', [255, 220, 120, 255]); S.maxcombo = textImage('MAX COMBO', [150, 200, 255, 255]); S.accuracy = textImage('ACCURACY', [150, 200, 255, 255]);
    S.fc = textImage('FULL COMBO', [255, 214, 64, 255]); S.record = textImage('NEW RECORD!', [120, 255, 140, 255]);
    S.failed = textImage('FAILED', [255, 70, 70, 255]); S.retry = textImage('JUMP: RETRY', [255, 200, 200, 255]);
    S.j300 = S.judgement[0]; S.j100 = S.judgement[1]; S.j50 = S.judgement[2]; S.jx = S.judgement[3];
    // the mods on (top right): osu!'s letters, each its own colour; AUTO when the game plays itself
    for (const [m, c] of [['HD', [255, 220, 90]], ['FL', [240, 240, 240]], ['NF', [110, 170, 255]], ['SD', [255, 130, 80]], ['PF', [255, 90, 160]], ['AUTO', [150, 255, 200]]]) S[`mod${m}`] = textImage(m, [...c, 255]);
    // the flashlight (build draws it the look's pixel a pixel: black but for a pixel circle round the cursor, dithered at its
    // edge — this one for a look of its own); the fail's shade: a dark curtain, see-through
    S.flashlight = (() => { const n = 64, im = img(n, n), c = n / 2; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d > 25 || (d > 23.4 && (x + y) % 2 === 0)) put(im, x, y, [0, 0, 0, 255]); } return im; })();
    S.shade = (() => { const im = img(8, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put(im, x, y, [12, 0, 4, 170]); return im; })();
    return S;
  }

  // ---------------------------------------------------------------------------------------------------------------- the atlas
  /** items { id, image } (frames: a list, laid side by side: one cell each) → { image, at: id → { x, y, w, h, cell: [w, h] } } */
  function atlasOf(items, { maxSize = 4096, padding = 2 } = {}) {
    // (frames in a grid: as many a row as keep it within half the largest size)
    const blocks = items.map((it) => { const ims = Array.isArray(it.image) ? it.image : [it.image], cw = Math.max(...ims.map((m) => m.width)), ch = Math.max(...ims.map((m) => m.height)), extra = it.shade ? 2 : 1;
      const cols = Math.max(1, Math.min(ims.length, Math.floor(maxSize / 2 / (cw * extra)))), rows = Math.ceil(ims.length / cols);
      return { id: it.id, ims, cw, ch, cols, rows, w: cw * cols * extra, h: ch * rows, shade: it.shade }; });
    const P = T.media.packAtlas(blocks.map((b) => ({ id: b.id, w: b.w, h: b.h })), { maxSize, padding, pow2: true }), im = img(P.w, P.h), at = {};
    for (const b of blocks) {
      const r = P.rects[b.id];
      b.ims.forEach((m, k) => {
        // (each frame a cell: the picture in its top left — a voxel sprite's cubes read it pixel by pixel — and, for a voxel sprite,
        //  its darker copy beside it in the same cell: the sides of its cubes)
        const x0 = r.x + (k % b.cols) * b.cw * (b.shade ? 2 : 1), y0 = r.y + Math.floor(k / b.cols) * b.ch;
        blit(im, m, x0, y0);
        if (b.shade) { const dk = img(m.width, m.height); for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const c = get(m, x, y); if (c[3]) put(dk, x, y, shade(c, 0.58)); } blit(im, dk, x0 + b.cw, y0); }
      });
      at[b.id] = { x: r.x, y: r.y, cell: [b.cw * (b.shade ? 2 : 1), b.ch], w: b.cw, h: b.ch, frames: b.ims.length, cols: b.cols, rows: b.rows };
    }
    return { image: im, at, width: P.w, height: P.h };
  }

  // ---------------------------------------------------------------------------------------------------------------- geometry
  /** a flat element: a plane w × h model units centred on (cx, cy) at depth z, its face the atlas rect */
  const plane = (name, parent, [cx, cy], [w, h], uv, z, uvSize) => ({ name, parent, pivot: [r4(cx), r4(cy), r4(z)],
    cubes: [{ origin: [r4(cx - w / 2), r4(cy - h / 2), r4(z)], size: [r4(w), r4(h), 0], faces: { north: { uv: [uv[0], uv[1]], uv_size: uvSize || [uv[2], uv[3]], texture: 'atlas' } } }] });
  /** a voxel element: the pixels of a sprite as cubes px units a pixel, depth d units deep, its front at z, centred on (cx, cy).
   *  Merged into as few rectangles as the picture allows (each face shows its own pixels: front from the picture, the sides
   *  from its darker copy) — or a cube a pixel (perPixel: the pixels any of its frames has, so that a frame's own picture
   *  decides which show: an empty texel is cut out) */
  /** the rectangles of cubes a picture's pixels make: a cube a pixel (perPixel), or as few as the picture allows — runs of a row,
   *  each grown down while the rows below have the very same run (and the same edges beside it) → [[x0, y0, x1, y1]] */
  function rectsOf(on, w, h, perPixel) {
    const rects = [];
    if (perPixel) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) rects.push([x, y, x, y]); return rects; }
    const used = new Set();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!on(x, y) || used.has(`${x},${y}`)) continue;
      let x1 = x; while (x1 + 1 < w && on(x1 + 1, y) && !used.has(`${x1 + 1},${y}`)) x1++;
      let y1 = y; const rowOk = (yy) => { for (let k = x; k <= x1; k++) if (!on(k, yy) || used.has(`${k},${yy}`)) return false; return !on(x - 1, yy) === !on(x - 1, y) && !on(x1 + 1, yy) === !on(x1 + 1, y); };
      while (y1 + 1 < h && rowOk(y1 + 1)) y1++;
      for (let yy = y; yy <= y1; yy++) for (let k = x; k <= x1; k++) used.add(`${k},${yy}`);
      rects.push([x, y, x1, y1]);
    }
    return rects;
  }
  function voxel(name, parent, [cx, cy], images, cellAt, px, d, z, { perPixel = false } = {}) {
    const ims = Array.isArray(images) ? images : [images], w = Math.max(...ims.map((m) => m.width)), h = Math.max(...ims.map((m) => m.height));
    const on = (x, y) => ims.some((m) => get(m, x, y)[3] > 0), rects = rectsOf(on, w, h, perPixel);
    const left = cx - (w * px) / 2, top = cy + (h * px) / 2, [ux, uy] = cellAt, sx = ux + w;   // (the darker copy: right of the picture)
    const cubes = rects.map(([x0, y0, x1, y1]) => {
      const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
      return { origin: [r4(left + x0 * px), r4(top - (y1 + 1) * px), r4(z)], size: [r4(rw * px), r4(rh * px), r4(d)], faces: {
        north: { uv: [ux + x0, uy + y0], uv_size: [rw, rh], texture: 'atlas' },
        east: { uv: [sx + x1, uy + y0], uv_size: [1, rh], texture: 'atlas' }, west: { uv: [sx + x0, uy + y0], uv_size: [1, rh], texture: 'atlas' },
        up: { uv: [sx + x0, uy + y0], uv_size: [rw, 1], texture: 'atlas' }, down: { uv: [sx + x0, uy + y1], uv_size: [rw, 1], texture: 'atlas' },
      } };
    });
    return { name, parent, pivot: [r4(cx), r4(cy), r4(z)], cubes };
  }

  // ---------------------------------------------------------------------------------------------------------------- 3D models
  // The pixel look's models are built of cubes the way a block model is: layers of blocks, each a pixel picture made solid —
  // its own outline, its own depth, its own place in front of or behind the others (a coin: its plate, its body, its rim, its
  // dome; a ball: its slices; a gem; a wheel: its hub, rim and spokes; a word standing on its shadow). Every face keeps the
  // pixel art: the front the picture, the sides, the top and the bottom the same pixels in their own light (sides darker, the
  // top lit, the bottom darkest) — so the forms read as solid from every side the playfield's lean shows.
  const LIGHT = { side: 0.62, top: 0.84, bottom: 0.44 };
  const lit = (im, f) => { const o = img(im.width, im.height); for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) { const c = get(im, x, y); if (c[3]) put(o, x, y, shade(c, f)); } return o; };
  /** a model's layers into atlas cells: one cell a frame (the largest number of frames of its layers; a layer of one picture the
   *  same in each), each layer's picture and its three lights side by side in it → { cells, layers: [{ u, w, h, dx, dy, z, d,
   *  perPixel, on }] } (on(x, y): a pixel any frame of the layer has) */
  function modelCells(model) {
    const Ls = model.layers.map((L) => { const ims = [].concat(L.ims || L.im); return { ...L, ims, w: Math.max(...ims.map((m) => m.width)), h: Math.max(...ims.map((m) => m.height)) }; });
    const frames = Math.max(...Ls.map((L) => L.ims.length));
    let u = 0;
    for (const L of Ls) { L.u = u; u += 4 * L.w; }
    const H = Math.max(...Ls.map((L) => L.h)), cells = [];
    for (let f = 0; f < frames; f++) {
      const cell = img(u, H);
      for (const L of Ls) { const m = L.ims[Math.min(f, L.ims.length - 1)]; blit(cell, m, L.u, 0); blit(cell, lit(m, LIGHT.side), L.u + L.w, 0); blit(cell, lit(m, LIGHT.top), L.u + 2 * L.w, 0); blit(cell, lit(m, LIGHT.bottom), L.u + 3 * L.w, 0); }
      cells.push(cell);
    }
    return { cells, zs: model.zs || 1, layers: Ls.map((L) => ({ u: L.u, w: L.w, h: L.h, dx: L.dx || 0, dy: L.dy || 0, z: L.z || 0, d: L.d || 1, perPixel: Boolean(L.perPixel), on: (x, y) => L.ims.some((m) => get(m, x, y)[3] > 0) })) };
  }
  /** a model's bone: its layers' cubes, px model units a pixel across, zs × px a pixel deep; z: the model's front plane (a
   *  layer's z counts back from it, a negative one stands out in front), centred on (cx, cy) */
  function modelBone(name, parent, [cx, cy], cellAt, px, z, meta) {
    const [ux, uy] = cellAt, zp = px * meta.zs, cubes = [];
    for (const L of meta.layers) {
      const left = cx + L.dx * px - (L.w * px) / 2, top = cy + L.dy * px + (L.h * px) / 2, u0 = ux + L.u;
      for (const [x0, y0, x1, y1] of rectsOf(L.on, L.w, L.h, L.perPixel)) {
        const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
        cubes.push({ origin: [r4(left + x0 * px), r4(top - (y1 + 1) * px), r4(z + L.z * zp)], size: [r4(rw * px), r4(rh * px), r4(L.d * zp)], faces: {
          north: { uv: [u0 + x0, uy + y0], uv_size: [rw, rh], texture: 'atlas' },
          east: { uv: [u0 + L.w + x1, uy + y0], uv_size: [1, rh], texture: 'atlas' }, west: { uv: [u0 + L.w + x0, uy + y0], uv_size: [1, rh], texture: 'atlas' },
          up: { uv: [u0 + 2 * L.w + x0, uy + y0], uv_size: [rw, 1], texture: 'atlas' }, down: { uv: [u0 + 3 * L.w + x0, uy + y1], uv_size: [rw, 1], texture: 'atlas' },
        } });
      }
    }
    return { name, parent, pivot: [r4(cx), r4(cy), r4(z)], cubes };
  }
  /** every bone after the first moved as little as it takes (compile.freePlace: back 0.021 at a time, up, down or across 0.02)
   *  for no face of its cubes to lie on a plane with a face of an earlier bone's that looks the same way and overlaps it: models
   *  of many layers, all resting at the playfield's middle on one pixel grid, never share a plane (two faces on one plane flicker) */
  function settleDepths(bones) {
    const F = T.compile && T.compile.freePlace;
    if (!F) throw new Error('GeoUITimeline.compile が要ります（compile.js を先に読み込む）');
    const placed = [];
    for (const b of bones) {
      const cubes = b.cubes || [];
      if (!cubes.length) continue;
      const [dx, dy, dz] = F(placed, cubes, { kz: 0 });
      if (dx || dy || dz) for (const c of cubes) c.origin = [r4(c.origin[0] + dx), r4(c.origin[1] + dy), r4(c.origin[2] + dz)];
      placed.push(...cubes);
    }
    return bones;
  }
  /** a tray's frame of blocks round a w × h floor centred on c: four walls (3 thick, 5 deep from zw), a lip inside them on the
   *  floor (1.4 wide, 1.2 high, a hair from the walls), and four posts at the corners (6 × 6, standing 3 out of the walls) with
   *  a cap on each — their faces from a bar's picture `bar` (an atlas place of a shaded item: its top row lit, its second row,
   *  its darker copy for the sides). No two faces share a plane */
  function trayCubes(c, w, h, zw, bar, { out: o = 4 } = {}) {
    // (the floor is at zw + 4: walls `o` out of it — less for a panel under words — the lip 0.2, the posts 3 more)
    zw += 4 - o;
    const out = [], face = (row, side) => ({ uv: [bar.x + (side ? bar.w : 0), bar.y + row], uv_size: [bar.w, 1], texture: 'atlas' });
    const box = (cx, cy, bw, bh, z0, d, row) => out.push({ origin: [r4(cx - bw / 2), r4(cy - bh / 2), r4(z0)], size: [r4(bw), r4(bh), r4(d)], faces: { north: face(row, false), east: face(1, true), west: face(1, true), up: face(0, true), down: face(2, true) } });
    const [x0, y0] = c, hw = w / 2, hh = h / 2;
    // (the top and bottom walls the whole width, the sides between them)
    box(x0, y0 + hh, w + 3, 3, zw, o + 1, 1); box(x0, y0 - hh, w + 3, 3, zw, o + 1, 1); box(x0 - hw, y0, 3, h - 3, zw, o + 1, 1); box(x0 + hw, y0, 3, h - 3, zw, o + 1, 1);
    const li = 1.6 + 0.7 + 0.1, zl = zw + o - 0.2;   // (the lip's middle: inside the wall's inner face, a hair off it; its front)
    box(x0, y0 + hh - li, w - 2 * li - 1.4, 1.4, zl, 1.2, 0); box(x0, y0 - hh + li, w - 2 * li - 1.4, 1.4, zl, 1.2, 0);
    box(x0 - hw + li, y0, 1.4, h - 2 * li + 1.4, zl + 0.01, 1.2, 0); box(x0 + hw - li, y0, 1.4, h - 2 * li + 1.4, zl + 0.01, 1.2, 0);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { box(x0 + sx * hw, y0 + sy * hh, 6, 6, zw - 3, o + 4, 0); box(x0 + sx * hw, y0 + sy * hh, 4, 4, zw - 4, 1, 0); }
    return out;
  }
  /** the pixel look's models (modelCells' input): each object of the game modeled — a few layers of blocks, the pixel art on their
   *  faces. Layers: { im | ims (frames), dx, dy (px from the middle, up), z (px behind the front), d (px deep), perPixel }; zs: how
   *  deep a px is, against its width */
  function pixelModels(colours, S, pairs = null) {
    const M = {}, C4 = (c) => [...c, 255];
    const diamond = (n, col) => { const im = img(7, 7); for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (Math.abs(x - 3) + Math.abs(y - 3) <= n) put(im, x, y, col(x, y)); return im; };
    // (raised letters: the letters a pixel deep, and behind them their shadow half a pixel right and down — a block of letters)
    // (a block a pixel when the letters change with the frame — each frame's own outline then shows from the side; one picture's
    //  pixels in rows and columns of blocks: fewer faces)
    const text = (ims, o = {}) => { const a = [].concat(ims), pp = a.length > 1; return { layers: [{ ims: a, z: 0, d: o.d || 1, perPixel: pp }, { ims: a.map((m) => lit(m, 0.34)), dx: 0.5, dy: -0.5, z: o.d || 1, d: 0.7, perPixel: pp }] }; };
    // hit circle: a coin — its white rim and a dome standing out of its body (the combo colour lit from the top left), a dark
    // plate under it all, a little wider — and its combo number standing out of the dome on its shadow, a part of the coin: one
    // frame for each combo number and colour the map's circles show (pairs: [[n, colour], …]; none: a frame a colour, no number)
    const rim = discImage(16, (x, y, d) => (d > 6.0 && d <= 7.0 ? WHITE : null));
    // (the dome: the coin's colour a little darker at its edge, one lit pixel at its top left — the white number stands on it)
    const domes = colours.map((cc) => discImage(16, (x, y, d) => (d > 3.3 ? null : x === 6 && y === 6 ? mix(C4(cc), WHITE, 0.45) : d > 2.3 ? shade(C4(cc), 0.78) : shade(C4(cc), 0.9))));
    const bodies = colours.map((cc) => discImage(16, (x, y, d) => { if (d > 7.0) return null; const l = (8 - x - y) / 16; return l > 0.18 ? mix(C4(cc), WHITE, 0.3) : l < -0.3 ? shade(C4(cc), 0.75) : C4(cc); }));
    const plates = colours.map((cc) => discImage(16, (x, y, d) => (d <= 7.95 ? shade(C4(cc), 0.45) : null)));
    const frames = pairs || colours.map((cc, c) => [0, c]);
    // (a number in the middle of a picture as wide as the widest: 3 pixels a digit, 1 between)
    const nw = Math.max(3, ...frames.map(([n]) => 4 * String(n).length - 1));
    const number = (n) => { const o = img(nw, 5); if (n > 0) { const t = textImage(String(n), WHITE); blit(o, t, Math.floor((nw - t.width) / 2), 0); } return o; };
    const each = (fn) => frames.map(([n, c]) => fn(n, c));
    M.hitcircle = { layers: [
      { ims: each(() => rim), z: 0, d: 0.5 },
      { ims: each((n, c) => domes[c]), z: -0.5, d: 1.0 },
      { ims: each((n, c) => bodies[c]), z: 0.5, d: 1.2 },
      { ims: each((n, c) => plates[c]), z: 1.7, d: 0.9 },
      // (the number: white blocks a pixel deep on their dark shadow, half a pixel right and down)
      ...(pairs ? [{ ims: each((n) => number(n)), z: -1.5, d: 0.6, perPixel: true }, { ims: each((n) => lit(number(n), 0.3)), dx: 0.5, dy: -0.5, z: -0.9, d: 0.4 }] : []),
    ] };
    // approach circle: a hoop — a bright ring at its front, a wider darker one behind it
    M.approachcircle = { layers: [
      { ims: colours.map((cc) => discImage(16, (x, y, d) => (d > 7.05 && d <= 7.75 ? mix(C4(cc), WHITE, 0.45) : null))), z: 0, d: 0.5 },
      { ims: colours.map((cc) => discImage(16, (x, y, d) => (d > 6.6 && d <= 7.95 ? shade(C4(cc), 0.7) : null))), z: 0.5, d: 0.8 },
    ] };
    // the burst: eight chunks round the circle, every other one deeper (they fly out and turn)
    const chunks = (k0) => { const im = img(16, 16); for (let k = k0; k < 8; k += 2) { const a = (k * Math.PI) / 4, cx = 8 + Math.cos(a) * 6, cy = 8 + Math.sin(a) * 6; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) put(im, Math.floor(cx - 1 + x), Math.floor(cy - 1 + y), k % 4 ? [255, 236, 140, 255] : WHITE); } return im; };
    M.hitburst = { layers: [{ im: chunks(0), z: 0, d: 1.6 }, { im: chunks(1), z: 1.6, d: 1.6 }] };
    // the slider's ball: a sphere of eight slices (front to back), orange with a white band — it rolls
    M.sliderball = { zs: 0.6, layers: Array.from({ length: 8 }, (_, k) => {
      const zc = k - 3.5, r = Math.sqrt(Math.max(0, 16 - zc * zc)) + 0.15;
      return { im: discImage(8, (x, y, d) => { if (d > r) return null; const band = Math.abs(x - y) <= 0.5, l = 1.12 - k * 0.06 - (x + y) * 0.018; return [...(band ? [255, 248, 228] : [255, 166, 46]).map((v) => Math.min(255, Math.round(v * l))), 255]; }), z: k, d: 1 };
    }) };
    // the follow circle: a hoop; the reverse arrow and the follow points: raised on their shadow; a tick: a little gem
    M.followcircle = { layers: [{ im: discImage(28, (x, y, d) => (d > 12.9 && d <= 13.95 ? WHITE : null)), z: 0, d: 0.5 }, { im: discImage(28, (x, y, d) => (d > 11.9 && d <= 13.95 ? [255, 190, 80, 255] : null)), z: 0.5, d: 0.7 }] };
    M.reversearrow = text(S.reversearrow, { d: 1.2 });
    M.followpoint = text(S.followpoint, { d: 0.8 });
    M.slidertick = { layers: [{ im: (() => { const im = img(3, 3); put(im, 1, 1, WHITE); return im; })(), z: -0.7, d: 0.7 }, { im: discImage(3, (x, y, d) => (d < 1.6 ? [200, 220, 255, 255] : null)), z: 0, d: 0.9 }] };
    // the spinner: a wheel — its hub standing out, its rim, the blue ring and the spokes set back behind it
    const spokes = discImage(32, (x, y, d, c) => { const a = Math.atan2(y + 0.5 - c, x + 0.5 - c), on = Math.abs(((a / (Math.PI * 2)) * 6 + 6) % 1 - 0.5) > 0.42; return on && d > 2.5 && d <= 13.4 ? [140, 170, 255, 255] : null; });
    M.spinner = { zs: 0.35, layers: [
      { im: discImage(32, (x, y, d) => (d <= 2.5 ? (d < 1.2 ? WHITE : [210, 225, 255, 255]) : null)), z: -3, d: 3 },
      { im: discImage(32, (x, y, d) => (d > 14.6 && d <= 15.9 ? WHITE : null)), z: 0, d: 3 },
      { im: spokes, z: 1, d: 2 },
      { im: discImage(32, (x, y, d) => (d > 13.4 && d <= 14.6 ? [70, 110, 255, 255] : null)), z: 3, d: 2 },
    ] };
    M.spinnerapproach = { zs: 0.35, layers: [{ im: discImage(32, (x, y, d) => (d > 14.9 && d <= 15.9 ? [140, 220, 255, 255] : null)), z: 0, d: 1.5 }, { im: discImage(32, (x, y, d) => (d > 14.2 && d <= 15.9 ? [70, 130, 200, 255] : null)), z: 1.5, d: 1.5 }] };
    // the cursor: a gem (an octahedron of seven-pixel diamonds, its point toward the player)
    const gem = (x, y) => ((x + y) % 2 ? [255, 230, 120, 255] : WHITE);
    M.cursor = { layers: [
      { im: diamond(0, () => WHITE), z: -3, d: 1 }, { im: diamond(1, gem), z: -2, d: 1 }, { im: diamond(2, gem), z: -1, d: 1 }, { im: diamond(3, gem), z: 0, d: 1 },
      { im: diamond(2, (x, y) => shade(gem(x, y), 0.8)), z: 1, d: 1 }, { im: diamond(1, (x, y) => shade(gem(x, y), 0.65)), z: 2, d: 1 },
    ] };
    // words and numbers: raised letters on their shadow
    for (const id of ['judgement', 'spin', 'clear', 'rank', 'section', 'x', 'dot', 'pct', 'restitle', 'maxcombo', 'accuracy', 'fc', 'record', 'failed', 'retry', 'j300', 'j100', 'j50', 'jx']) M[id] = text(S[id]);
    M.digitframes = text([...S.digit, img(3, 5)]);
    // (a number's numerals, each its own block of letters: the results' counts)
    for (let d = 0; d < 10; d++) M[`num${d}`] = text(S.digit[d]);
    // the mods: a plate, its letters standing out of it
    for (const m of ['HD', 'FL', 'NF', 'SD', 'PF', 'AUTO']) { const pl = S[`mod${m}`], letters = img(pl.width, pl.height); for (let y = 2; y < pl.height - 2; y++) for (let x = 2; x < pl.width - 2; x++) { const c = get(pl, x, y); if (c[3] && (c[0] + c[1] + c[2]) > 200) put(letters, x, y, c); } M[`mod${m}`] = { layers: [{ im: letters, z: 0, d: 0.4 }, { im: pl, z: 0.4, d: 0.8 }] }; }
    return M;
  }

  // ---------------------------------------------------------------------------------------------------------------- bodies
  /** each slider's body drawn along its ball's line, one cell each (all the same size) → { cells: [image], centre: [[x, y]] } */
  function bodies(G, colours, combosOf, { ppu, pixel }) {
    const sl = G.objects.map((o, i) => [o, i]).filter(([o]) => o.k === 's'), W = 2 * G.r;
    const ext = (o, ax) => { const v = o.line.map((p) => p[ax]); return Math.max(...v) - Math.min(...v) + W + 2; };
    const cw = Math.ceil(Math.max(1, ...sl.map(([o]) => ext(o, 0))) * ppu), ch = Math.ceil(Math.max(1, ...sl.map(([o]) => ext(o, 1))) * ppu), cells = [], centre = [];
    for (const [o, i] of sl) {
      const xs = o.line.map((p) => p[0]), ys = o.line.map((p) => p[1]), mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
      const pt = (p) => [(p[0] - mx) * ppu + cw / 2, ch / 2 - (p[1] - my) * ppu], line = o.line.map(pt), path = [['moveTo', ...line[0]], ...line.slice(1).map((p) => ['lineTo', ...p])];
      const cc = colours[combosOf[i] % colours.length], hex = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
      // (a tube: the white border, then bands from the combo colour's dark edge to its light middle)
      const bands = pixel ? [[1, [255, 255, 255]], [0.78, shade(cc, 0.42)], [0.42, shade(cc, 0.6)]] : [[1, [255, 255, 255]], [0.86, shade(cc, 0.22)], [0.7, shade(cc, 0.32)], [0.52, shade(cc, 0.42)], [0.32, shade(cc, 0.55)]];
      const ops = [['lineJoin', 'round'], ['lineCap', 'round']];
      for (const [f, c] of bands) ops.push(['strokeStyle', hex(c)], ['lineWidth', W * ppu * f], ['beginPath'], ...path, ['stroke']);
      let im = T.media.rasterOps(ops, cw, ch);
      if (pixel) { for (let k = 3; k < im.data.length; k += 4) im.data[k] = im.data[k] >= 128 ? 255 : 0; }
      else for (let k = 3; k < im.data.length; k += 4) im.data[k] = Math.round(im.data[k] * 0.9);
      im = { width: im.width, height: im.height, data: im.data };
      cells.push(im); centre.push([r4(mx), r4(my)]);
    }
    return { cells, centre, units: [cw / ppu, ch / ppu], ppu };
  }

  // ---------------------------------------------------------------------------------------------------------------- the document
  /** the timeline document for a beatmap and its gameplay config (the same ids: o<n> for objects) — L: { pixel (the look), C
   *  (the playfield's middle), bpm, kiai [[s, s]], breaks, duration } */
  function docOf(map, G, L) {
    const O = T.osu, diff = O.difficultyOf(map), lead = r4(diff.preempt / 1000), fade = r4(diff.fadeIn / 1000), late = r4(diff.windows.meh / 1000), cs = O.combos(map), P = L.pixel;
    const at = (v) => [{ t: 0, v }], place = { x: at('param.x'), y: at('param.y') };
    const beat = 60 / L.bpm;
    // ---- how a circle looks (the circle template and a slider's head): it comes in (fades — pops, in the pixel look), shakes when
    //      pressed too early, explodes on its hit (bursts into cubes)
    // (HD — osu!'s Hidden, state.hd: no approach circles; a circle and its number gone again by 70 % of its approach — in by
    //  40 %, out over the next 30 % — a slider's body fading as its ball goes)
    const hdA = r4(lead * 0.4), hdB = r4(lead * 0.7), hdOut = `(1 - state.hd * math.clamp((t - ${hdA}) / ${r4(hdB - hdA)}, 0, 1))`;
    const popHd = (k) => [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.16, v: 1 }, { t: hdA, v: 1 }, { t: hdB, v: k }];
    const comeIn = P ? { scaleX: popHd('1 - state.hd'), scaleY: popHd('1 - state.hd') }
      : { opacity: at(`math.clamp(t / ${fade}, 0, 1) * (1 - state.hd) + state.hd * math.clamp(t / ${hdA}, 0, 1) * ${hdOut}`) };
    const shakeX = 'param.x + 2.4 * math.sin(t * 2880) * (1 - t / 0.25)', noHd = at('1 - state.hd');
    // (the circle's frame: its combo colour — in the pixel look its number too, the coin's own: the instance's cf, its pair's frame)
    const cf = at(L.coinFrame ? 'param.cf' : 'param.c');
    const circleLook = (hitName, endExpr) => [
      { target: 'hitcircle', clips: [
        { start: 0, end: 0.25, trigger: 'early', channels: { x: at(shakeX), y: at('param.y'), frame: cf, scaleX: noHd, scaleY: noHd } },
        P ? { start: 0, end: 0.12, trigger: hitName, channels: { ...place, frame: cf, scaleX: [{ t: 0, v: '1.25 * (1 - state.hd)', ease: 'quad-in' }, { t: 0.12, v: 0 }], scaleY: [{ t: 0, v: '1.25 * (1 - state.hd)', ease: 'quad-in' }, { t: 0.12, v: 0 }] } }
          : { start: 0, end: 0.24, trigger: hitName, channels: { ...place, frame: cf, scaleX: [{ t: 0, v: 1, ease: 'quad-out' }, { t: 0.24, v: 1.45 }], scaleY: [{ t: 0, v: 1, ease: 'quad-out' }, { t: 0.24, v: 1.45 }], opacity: [{ t: 0, v: '1 - state.hd', ease: 'quad-in' }, { t: 0.24, v: 0 }] } },
        { start: -lead, end: endExpr, until: 'hit', channels: { ...place, frame: cf, ...comeIn } }] },
      ...(P ? [] : [{ target: 'combonumber', clips: [
        { start: 0, end: 0.25, trigger: 'early', channels: { x: at(shakeX), y: at('param.y'), value: at('param.n'), scaleX: noHd, scaleY: noHd } },
        { start: -lead, end: endExpr, until: 'hit', channels: { ...place, value: at('param.n'), scaleX: at(hdOut), scaleY: at(hdOut) } }] }]),
      { target: 'approachcircle', clips: [{ start: -lead, end: 0, until: 'hit', channels: { ...place, frame: at('param.c'),
        scaleX: [{ t: 0, v: '4 * (1 - state.hd)' }, { t: lead, v: '1 - state.hd' }], scaleY: [{ t: 0, v: '4 * (1 - state.hd)' }, { t: lead, v: '1 - state.hd' }], ...(P ? {} : { opacity: [{ t: 0, v: 0 }, { t: Math.min(lead, fade * 2), v: 0.9 }] }) } }] },
      ...(P ? [{ target: 'hitburst', clips: [{ start: 0, end: 0.32, trigger: hitName, channels: { ...place, scaleX: [{ t: 0, v: 0.8, ease: 'quad-out' }, { t: 0.32, v: 2.3 }], scaleY: [{ t: 0, v: 0.8, ease: 'quad-out' }, { t: 0.32, v: 2.3 }], rotation: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.32, v: 60 }] } }] }] : []),
    ];
    // ---- the judgement: 300 / 100 / 50 / miss where it was judged (jx, jy: a slider's end), popping in and away
    const judgement = (k) => ({ target: 'judgement', clips: [
      ...['great', 'good', 'ok'].map((name, f) => ({ start: 0, end: 0.6, trigger: name, channels: { x: at(`param.${k}x`), y: [{ t: 0, v: `param.${k}y` }, { t: 0.6, v: `param.${k}y + 2.5` }], frame: at(f),
        scaleX: [{ t: 0, v: 0.6, ease: 'back-out' }, { t: 0.12, v: 1 }, { t: 0.45, v: 1, ease: 'quad-in' }, { t: 0.6, v: P ? 0 : 0.95 }], scaleY: [{ t: 0, v: 0.6, ease: 'back-out' }, { t: 0.12, v: 1 }, { t: 0.45, v: 1, ease: 'quad-in' }, { t: 0.6, v: P ? 0 : 0.95 }],
        ...(P ? {} : { opacity: [{ t: 0, v: 1 }, { t: 0.4, v: 1, ease: 'quad-in' }, { t: 0.6, v: 0 }] }) } })),
      { start: 0, end: 0.7, trigger: 'miss', channels: { x: at(`param.${k}x`), y: [{ t: 0, v: `param.${k}y + 2`, ease: 'quad-in' }, { t: 0.7, v: `param.${k}y - 6` }], frame: at(3),
        rotation: [{ t: 0, v: 0 }, { t: 0.7, v: 'param.n * 7 - 20' }], scaleX: [{ t: 0, v: 1.5, ease: 'quad-out' }, { t: 0.1, v: 1 }, { t: 0.55, v: 1 }, { t: 0.7, v: P ? 0 : 1 }], scaleY: [{ t: 0, v: 1.5, ease: 'quad-out' }, { t: 0.1, v: 1 }, { t: 0.55, v: 1 }, { t: 0.7, v: P ? 0 : 1 }],
        ...(P ? {} : { opacity: [{ t: 0, v: 1 }, { t: 0.5, v: 1 }, { t: 0.7, v: 0 }] }) } }] });
    const templates = [
      { id: 'osu-circle', name: 'osu! 円', lead, tail: r4(late + 0.7), params: ['x', 'y', 'n', 'c', ...(L.coinFrame ? ['cf'] : []), 'jx', 'jy'], judge: { kind: 'circle' }, tracks: [...circleLook('hit', late), judgement('j')] },
      { id: 'osu-slider', name: 'osu! スライダー', lead, tail: 0.7, params: ['x', 'y', 'n', 'c', ...(L.coinFrame ? ['cf'] : []), 'd', 'r', 'f', 'bx', 'by', 'ex', 'ey', 'ea', 'jx', 'jy'], judge: { kind: 'slider' }, tracks: [
        { target: 'sliderbody', clips: [{ start: -lead, end: 'param.d + 0.1', channels: { x: at('param.bx'), y: at('param.by'), frame: at('param.f'),
          ...(P ? { scaleX: [{ t: 0, v: 0.2, ease: 'back-out' }, { t: 0.2, v: 1 }, { t: lead, v: 1, ease: 'quad-in' }, { t: r4(lead + 0.18), v: '1 - state.hd' }], scaleY: [{ t: 0, v: 0.2, ease: 'back-out' }, { t: 0.2, v: 1 }, { t: lead, v: 1, ease: 'quad-in' }, { t: r4(lead + 0.18), v: '1 - state.hd' }] }
            : { opacity: at(`math.clamp(t / ${fade}, 0, 1) * 0.9 * (1 - state.hd * math.clamp((t - ${lead}) / math.max(0.05, param.d), 0, 1))`) }) } }] },
        ...circleLook('tap', 'math.min(' + late + ', param.d)'),
        { target: 'reversearrow', clips: [{ start: -lead, end: 'param.d * (param.r - 1) / param.r', channels: { x: at('param.ex'), y: at('param.ey'), rotation: at('param.ea'),
          scaleX: at(`math.min(1, param.r - 1) * (1 + 0.15 * math.abs(math.sin(t * ${r4(180 / beat)})))`), scaleY: at(`math.min(1, param.r - 1) * (1 + 0.15 * math.abs(math.sin(t * ${r4(180 / beat)})))`) } }] },
        { target: 'sliderball', clips: [{ start: 0, end: 'param.d', path: '@instance', channels: { path: at('1 - math.abs(math.mod(t * param.r / param.d, 2) - 1)'), ...(P ? { rotation: at('t * 540') } : { frame: at('math.mod(math.floor(t * 40), 10)') }) } }] },
        { target: 'followcircle', clips: [{ start: 0, end: 'param.d', path: '@instance', channels: { path: at('1 - math.abs(math.mod(t * param.r / param.d, 2) - 1)'),
          scaleX: at('math.min(1, 0.5 + t * 5) * (0.55 + 0.45 * state.hold)'), scaleY: at('math.min(1, 0.5 + t * 5) * (0.55 + 0.45 * state.hold)') } }] },
        judgement('j')] },
      { id: 'osu-tick', name: 'osu! ティック', lead: 0, tail: 0, params: ['x', 'y', 'w'], tracks: [
        { target: 'slidertick', clips: [{ start: '0 - param.w', end: 0, channels: { ...place, scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.15, v: 1 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.15, v: 1 }] } }] }] },
      { id: 'osu-follow', name: 'osu! フォローポイント', lead: 0.5, tail: 0, params: ['x', 'y', 'a'], tracks: [
        { target: 'followpoint', clips: [{ start: -0.5, end: 0, channels: { ...place, rotation: at('param.a'), scaleX: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.12, v: 1 }, { t: 0.38, v: 1, ease: 'quad-in' }, { t: 0.5, v: 0 }], scaleY: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.12, v: 1 }, { t: 0.38, v: 1, ease: 'quad-in' }, { t: 0.5, v: 0 }] } }] }] },
      { id: 'osu-spinner', name: 'osu! スピナー', lead: 0.3, tail: 0.4, params: ['d'], judge: { kind: 'spinner' }, tracks: [
        { target: 'spinner', clips: [{ start: -0.3, end: 'param.d', channels: { rotation: at('0 - state.sa'), scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.3, v: 1 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.3, v: 1 }] } }] },
        { target: 'spinnerapproach', clips: [{ start: 0, end: 'param.d', channels: { scaleX: at('math.clamp(1 - t / param.d, 0.03, 1)'), scaleY: at('math.clamp(1 - t / param.d, 0.03, 1)') } }] },
        { target: 'spinnerspin', clips: [{ start: -0.3, end: 1.0, channels: { scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.25, v: 1 }, { t: 1.0, v: 1, ease: 'quad-in' }, { t: 1.3, v: 0 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.25, v: 1 }, { t: 1.0, v: 1, ease: 'quad-in' }, { t: 1.3, v: 0 }] } }] },
        { target: 'spinnerclear', clips: [{ start: 0, end: 'param.d + 0.4', channels: { scaleX: at('math.floor(state.spin) * (1 + 0.08 * math.sin(t * 720))'), scaleY: at('math.floor(state.spin) * (1 + 0.08 * math.sin(t * 720))') } }] },
        ...[0, 1, 2].map((k) => ({ target: `spinnerrpm${k}`, clips: [{ start: 0, end: 'param.d', channels: { frame: at(`math.mod(math.floor(state.rpm / ${[100, 10, 1][k]}), 10)`) } }] })),
        ...(P ? [] : [{ target: 'spinnerrpmbg', clips: [{ start: 0, end: 'param.d', channels: {} }] }]),
      ] },
    ];
    // ---- the instances
    const instances = [], paths = [], ticks = [], follows = [];
    const objs = map.objects || [];
    objs.forEach((o, i) => {
      const g = G.objects[i], id = `o${i + 1}`, t = r4(o.time / 1000), c = cs[i];
      // (the coin's frame of its number and colour: the pixel look's — L.coinFrame)
      const cfOf = () => (L.coinFrame ? { cf: L.coinFrame[`${Math.min(9999, c.n)}/${c.colour % L.colours}`] } : {});
      if (g.k === 'c') instances.push({ id, template: 'osu-circle', t, params: { x: g.x, y: g.y, n: c.n, c: c.colour % L.colours, ...cfOf(), jx: g.x, jy: g.y } });
      else if (g.k === 's') {
        const d = r4(g.d / 1000), line = g.line, end = line[line.length - 1], prev = line[Math.max(0, line.length - 2)], fin = g.r % 2 ? end : line[0], pid = `op${i + 1}`;
        paths.push({ id: pid, kind: 'linear', points: line.map((p) => [p[0], p[1]]), length: g.len });
        const ea = r4((-Math.atan2(prev[1] - end[1], prev[0] - end[0]) * 180) / Math.PI);
        instances.push({ id, template: 'osu-slider', t, path: pid, tail: r4(d + 0.7), params: { x: g.x, y: g.y, n: c.n, c: c.colour % L.colours, ...cfOf(), d, r: g.r, f: L.bodyFrame[i], bx: L.bodyCentre[i][0], by: L.bodyCentre[i][1], ex: end[0], ey: end[1], ea, jx: fin[0], jy: fin[1] } });
        // (its ticks, first slide only: each shows from the slider's coming in until the ball reaches it)
        const span = g.d / g.r;
        for (const tk of g.ticks) if (tk < span) { const tt = (g.t + tk) / 1000, p = (() => { const gg = T.osugame.createGame({ objects: [g], windows: G.windows, r: G.r }); return gg.ballAt(0, g.t + tk); })(); ticks.push({ t: r4(tt), x: r4(p[0]), y: r4(p[1]), w: r4(tt - (t - lead)) }); }
      } else instances.push({ id, template: 'osu-spinner', t, tail: r4((g.e - g.t) / 1000 + 0.4), params: { d: r4((g.e - g.t) / 1000) } });
      // (follow points to the next object of the same combo: every 32 osu! pixels along the way, each shown just before the cursor
      //  should pass it)
      const nx = objs[i + 1], gn = G.objects[i + 1];
      if (nx && gn && !nx.newCombo && g.k !== 'p' && gn.k !== 'p') {
        const from = g.k === 's' ? (g.r % 2 ? g.line[g.line.length - 1] : g.line[0]) : [g.x, g.y], tFrom = (g.k === 's' ? g.t + g.d : g.t) / 1000, tTo = gn.t / 1000;
        const dx = gn.x - from[0], dy = gn.y - from[1], dist = Math.hypot(dx, dy), step = 32 * (L.width / 512), a = r4((-Math.atan2(dy, dx) * 180) / Math.PI);
        for (let s = step * 1.5; s < dist - step * 0.75 - G.r * 0.5; s += step) { const f = s / dist; follows.push({ t: r4(tFrom + f * (tTo - tFrom)), x: r4(from[0] + dx * f), y: r4(from[1] + dy * f), a }); }
      }
    });
    ticks.forEach((k, i) => instances.push({ id: `k${i + 1}`, template: 'osu-tick', t: k.t, params: { x: k.x, y: k.y, w: k.w } }));
    follows.forEach((f, i) => instances.push({ id: `f${i + 1}`, template: 'osu-follow', t: f.t, params: { x: f.x, y: f.y, a: f.a } }));
    // (the ticks' template shows its instances from param.w before: its lead is the longest of them)
    templates.find((x) => x.id === 'osu-tick').lead = r4(Math.max(0.1, ...ticks.map((k) => k.w)));
    // ---- the playfield's own motion and the HUD
    const dur = L.duration, kiai = L.kiai.map(([a, b]) => [a / 1000, b / 1000]);
    const firstT = objs.length ? objs[0].time / 1000 : 0, lastEnd = Math.max(...G.objects.map((g) => (g.k === 's' ? g.t + g.d : g.k === 'p' ? g.e : g.t))) / 1000;
    const span = (from, to, channels, extra = {}) => Object.assign({ start: r4(from), end: r4(to), channels }, extra);
    // the pulse: in a kiai section, every beat (1.035 on the beat, back by 40 % of it); at the start, the field grows in
    const pulseClips = [span(0, 1.0, { scaleX: [{ t: 0, v: 0.9, ease: 'back-out' }, { t: 1.0, v: 1 }], scaleY: [{ t: 0, v: 0.9, ease: 'back-out' }, { t: 1.0, v: 1 }] })];
    let tt = 1.0;
    for (const [a, b] of kiai) {
      if (a > tt) pulseClips.push(span(tt, a, {}));
      const keys = [];
      for (let bt = 0; a + bt < b - 1e-6; bt += beat) keys.push({ t: r4(bt), v: 1.035, ease: 'quad-out' }, { t: r4(bt + beat * 0.4), v: 1 });
      pulseClips.push(span(a, b, { scaleX: keys, scaleY: keys.map((k) => ({ ...k })) }));
      tt = b;
    }
    if (tt < dur) pulseClips.push(span(tt, dur, {}));
    // the lean: the cursor tilts the playfield (parallax); the pixel look stands it at an angle, and sways it in a kiai
    const tiltX = (sway) => `${P ? -16 : 0} + state.cy * ${P ? -0.16 : -0.07}${sway ? ` + ${P ? 3 : 1.2} * math.sin(t * ${r4(90 / beat)})` : ''}`;
    const tiltY = (sway) => `${P ? 10 : 0} + state.cx * ${P ? 0.16 : 0.06}${sway ? ` + ${P ? 4 : 1.5} * math.cos(t * ${r4(45 / beat)})` : ''}`;
    const tiltClips = [];
    tt = 0;
    for (const [a, b] of kiai) { if (a > tt) tiltClips.push(span(tt, a, { rotationX: at(tiltX(false)), rotationY: at(tiltY(false)) })); tiltClips.push(span(a, b, { rotationX: at(tiltX(true)), rotationY: at(tiltY(true)) })); tt = b; }
    if (tt < dur) tiltClips.push(span(tt, dur, { rotationX: at(tiltX(false)), rotationY: at(tiltY(false)) }));
    // the glow behind the field, on each beat of a kiai section
    const glowClips = kiai.map(([a, b]) => { const keys = []; for (let bt = 0; a + bt < b - 1e-6; bt += beat) keys.push({ t: r4(bt), v: P ? 0.55 : 0.45, ease: 'quad-out' }, { t: r4(bt + beat * 0.8), v: 0 }); return span(a, b, { opacity: keys, scaleX: at(P ? 1 : 1.0), scaleY: at(1) }); });
    // HUD numbers: a frame a digit (10: blank)
    const dg = (src, place) => `math.mod(math.floor(${src} / ${place}), 10)`;
    const scoreTracks = Array.from({ length: 8 }, (_, k) => ({ target: `score${k}`, clips: [span(0, dur, { frame: at(dg('state.score', 10 ** (7 - k))) })] }));
    const accSrc = 'math.floor(state.acc * 100 + 0.5)';
    const accTracks = [
      { target: 'acc0', clips: [span(0, dur, { frame: at(`10 - 9 * math.floor(${accSrc} / 10000)`) })] },
      { target: 'acc1', clips: [span(0, dur, { frame: at(dg(accSrc, 1000)) })] }, { target: 'acc2', clips: [span(0, dur, { frame: at(dg(accSrc, 100)) })] },
      { target: 'acc3', clips: [span(0, dur, { frame: at(dg(accSrc, 10)) })] }, { target: 'acc4', clips: [span(0, dur, { frame: at(dg(accSrc, 1)) })] }];
    // the combo: right-aligned digits (blank above its size), the group moved left by the blanks; it pops on each combo
    const ndig = '(1 + math.min(1, math.floor(state.combo / 10)) + math.min(1, math.floor(state.combo / 100)) + math.min(1, math.floor(state.combo / 1000)))';
    // (the results come R0 after the last object: the HUD's combo, health and progress go then; the score and the accuracy fly
    //  into the ranking panel)
    const R0 = r4(lastEnd + 0.8);
    const comboTracks = [0, 1, 2, 3].map((k) => { const place = 10 ** (3 - k); return { target: `combo${k}`, clips: [span(0, R0, { frame: at(k === 3 ? dg('state.combo', 1) : `10 - (10 - ${dg('state.combo', place)}) * math.min(1, math.floor(state.combo / ${place}))`) })] }; });
    const comboShift = `0 - (4 - ${ndig}) * ${r4(L.comboDigitW)}`;
    comboTracks.push({ target: 'combo', clips: [
      span(0, 0.18, { x: at(comboShift), scaleX: [{ t: 0, v: 1.35, ease: 'quad-out' }, { t: 0.18, v: 1 }], scaleY: [{ t: 0, v: 1.35, ease: 'quad-out' }, { t: 0.18, v: 1 }] }, { trigger: 'combo' }),
      span(0, R0, { x: at(comboShift) })] });
    // ---- FL (state.fl): the light's square on the cursor and the four shutters up to it, all smaller at a combo of 100 and 200
    const flk = '(1 - 0.15 * math.min(2, math.floor(state.combo / 100)))', fs = r4(L.flS), FX = r4(L.flX), FY = r4(L.flY);
    const flTracks = [
      { target: 'flhole', clips: [span(0, R0, { x: at('state.cx'), y: at('state.cy'), scaleX: at(`${flk} * state.fl`), scaleY: at(`${flk} * state.fl`) })] },
      { target: 'flleft', clips: [span(0, R0, { scaleX: at(`math.max(0, state.cx - ${fs} * ${flk} + ${FX} + 0.4) * state.fl`) })] },
      { target: 'flright', clips: [span(0, R0, { scaleX: at(`math.max(0, ${FX} - state.cx - ${fs} * ${flk} + 0.4) * state.fl`) })] },
      { target: 'fltop', clips: [span(0, R0, { x: at('state.cx'), scaleX: at(`${flk} * state.fl`), scaleY: at(`math.max(0, ${FY} - state.cy - ${fs} * ${flk} + 0.4) * state.fl`) })] },
      { target: 'flbottom', clips: [span(0, R0, { x: at('state.cx'), scaleX: at(`${flk} * state.fl`), scaleY: at(`math.max(0, ${FY} + state.cy - ${fs} * ${flk} + 0.4) * state.fl`) })] },
    ];
    // ---- the fail (the play's fail event): the field drops away, a dark curtain comes down, FAILED, the retry's hint
    const pop = (d, k = 1) => [{ t: 0, v: 0, ease: 'back-out' }, { t: d, v: k }];
    const failTracks = [
      { target: 'failshade', clips: [{ start: 0, end: 6, trigger: 'fail', channels: { scaleY: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 0.7, v: 1 }] } }] },
      { target: 'failtext', clips: [{ start: 0.3, end: 6, trigger: 'fail', channels: { scaleX: pop(0.4), scaleY: pop(0.4), rotation: [{ t: 0, v: -14, ease: 'back-out' }, { t: 0.4, v: 0 }], y: at('1.2 * math.sin(t * 160)') } }] },
      ...(L.failButton ? ['failretry', 'failbutton'] : ['failretry']).map((target) => ({ target, clips: [{ start: 1.0, end: 6, trigger: 'fail', channels: { scaleX: at('math.min(1, t / 0.2) * (1 + 0.05 * math.sin(t * 300))'), scaleY: at('math.min(1, t / 0.2) * (1 + 0.05 * math.sin(t * 300))') } }] })),
    ];
    // ---- the mods on: each by its flag, moved left by the width of those after it that are on
    const modTracks = L.mods.map((m, i) => ({ target: `mod${m.m.toUpperCase()}`, clips: [span(0, dur, { scaleX: at(`state.${m.m}`), scaleY: at(`state.${m.m}`),
      ...(i < L.mods.length - 1 ? { x: at(`0 - (${L.mods.slice(i + 1).map((n) => `${n.w} * state.${n.m}`).join(' + ')})`) } : {}) })] }));
    // ---- the results (none after a fail): the panel slides in, the counts count up, the grade comes down hard (the panel shakes
    //      with it), the full combo's stamp, a new best
    const RR = L.R, nf = '(1 - state.failed)', countUp = (src) => at(`math.floor(${src} * math.clamp(t / 0.8, 0, 1) + 0.5)`);
    const fly = (g, to, sc) => { const tx = r4(to[0] - sc * g.right - g.pivot[0]), ty = r4(to[1] - g.pivot[1]);
      return [span(0, R0, {}), span(R0, dur, { x: [{ t: 0, v: 0, ease: 'quad-inout' }, { t: 0.6, v: `(${tx} - screen.dx) * ${nf}` }], y: [{ t: 0, v: 0, ease: 'quad-inout' }, { t: 0.6, v: `${ty} * ${nf}` }],
        scaleX: [{ t: 0, v: 1, ease: 'quad-inout' }, { t: 0.6, v: `1 + ${r4(sc - 1)} * ${nf}` }], scaleY: [{ t: 0, v: 1, ease: 'quad-inout' }, { t: 0.6, v: `1 + ${r4(sc - 1)} * ${nf}` }] })]; };
    const rankFrame = '(6 - state.rank) + 6 * math.min(1, state.hd + state.fl) * math.clamp(state.rank - 4, 0, 1)';
    const resTracks = [
      { target: 'res', clips: [span(R0, dur, { scaleX: at(nf), scaleY: at(nf), x: at('2.2 * math.sin(t * 2600) * math.clamp(1 - math.abs(t - 1.32) / 0.14, 0, 1)') })] },
      { target: 'respanel', clips: [span(R0, dur, { x: [{ t: 0, v: -24, ease: 'quad-out' }, { t: 0.35, v: 0 }], scaleY: [{ t: 0, v: 0.3, ease: 'back-out' }, { t: 0.35, v: 1 }] })] },
      { target: 'restitle', clips: [span(R0 + 0.15, dur, { scaleX: pop(0.3), scaleY: pop(0.3) })] },
      ...['300', '100', '50', 'miss'].flatMap((n, k) => [
        { target: `res${n}_icon`, clips: [span(R0 + 0.25 + k * 0.05, dur, { scaleX: pop(0.25), scaleY: pop(0.25) })] },
        { target: `res${n}`, clips: [span(R0 + 0.3, dur, { value: countUp(`state.${n === 'miss' ? 'misses' : `n${n}`}`), scaleX: pop(0.2), scaleY: pop(0.2) })] }]),
      { target: 'reslabelcombo', clips: [span(R0 + 0.3, dur, { scaleX: pop(0.25), scaleY: pop(0.25) })] },
      { target: 'reslabelacc', clips: [span(R0 + 0.3, dur, { scaleX: pop(0.25), scaleY: pop(0.25) })] },
      { target: 'resmaxcombo', clips: [span(R0 + 0.35, dur, { value: countUp('state.maxcombo'), scaleX: pop(0.2), scaleY: pop(0.2) })] },
      // (the grade: the pixel look's cubes turn slowly, their sides showing)
      { target: 'resrank', clips: [span(R0 + 1.0, dur, { frame: at(rankFrame), scaleX: [{ t: 0, v: 2.4, ease: 'quad-in' }, { t: 0.2, v: 0.94, ease: 'quad-out' }, { t: 0.32, v: 1 }], scaleY: [{ t: 0, v: 2.4, ease: 'quad-in' }, { t: 0.2, v: 0.94, ease: 'quad-out' }, { t: 0.32, v: 1 }], rotation: [{ t: 0, v: -16, ease: 'quad-in' }, { t: 0.2, v: 0 }],
        ...(P ? { rotationY: at('18 * math.sin(t * 50)'), rotationX: at('-8 + 4 * math.sin(t * 37)') } : {}) })] },
      { target: 'resfc', clips: [span(R0 + 1.6, dur, { scaleX: [{ t: 0, v: '1.8 * state.fc', ease: 'quad-in' }, { t: 0.18, v: 'state.fc' }], scaleY: [{ t: 0, v: '1.8 * state.fc', ease: 'quad-in' }, { t: 0.18, v: 'state.fc' }], rotation: [{ t: 0, v: -22, ease: 'quad-in' }, { t: 0.18, v: -8 }] })] },
      { target: 'resrecord', clips: [span(R0 + 2.0, dur, { scaleX: at('state.record * math.min(1, t / 0.25) * (1 + 0.06 * math.sin(t * 400))'), scaleY: at('state.record * math.min(1, t / 0.25) * (1 + 0.06 * math.sin(t * 400))') })] },
      { target: 'score', clips: fly(L.score, RR.scoreTo, RR.scoreScale) },
      { target: 'acc', clips: fly(L.acc, RR.accTo, RR.accScale) },
    ];
    const tracks = [
      // (the fall: a fail drops the field away, tumbling; the results take it away)
      { target: 'osu_fall', clips: [{ start: 0, end: 6, trigger: 'fail', channels: { y: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 1.5, v: -210 }], rotation: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 1.5, v: 26 }], rotationX: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 1.5, v: 50 }] } },
        span(0, R0, {}), span(R0, dur, { scaleX: [{ t: 0, v: 1, ease: 'back-in' }, { t: 0.5, v: 0 }], scaleY: [{ t: 0, v: 1, ease: 'back-in' }, { t: 0.5, v: 0 }], rotation: [{ t: 0, v: 0, ease: 'quad-in' }, { t: 0.5, v: -10 }] })] },
      { target: 'osu_shake', clips: [span(0, 0.35, { x: at('2.6 * math.sin(t * 3100) * (1 - t / 0.35)'), y: at('1.6 * math.cos(t * 2300) * (1 - t / 0.35)'), rotation: at('1.4 * math.sin(t * 1900) * (1 - t / 0.35)') }, { trigger: 'miss' }), span(0, dur, {})] },
      { target: 'osu_tilt', clips: tiltClips },
      { target: 'osu_pulse', clips: pulseClips },
      { target: 'cursor', clips: [span(0, lastEnd + 0.3, { x: at('state.cx'), y: at('state.cy'), scaleX: at('1 + 0.25 * state.hold'), scaleY: at('1 + 0.25 * state.hold'), ...(P ? { rotation: at('t * 90') } : {}) })] },
      { target: 'kiaiglow', clips: glowClips },
      ...scoreTracks, ...accTracks, ...comboTracks,
      { target: 'progress', clips: [span(0, R0, { fill: [{ t: 0, v: 0 }, { t: r4(firstT), v: 0 }, { t: r4(lastEnd), v: 1 }] })] },
      ...['progressback', 'health', 'healthback'].map((target) => ({ target, clips: [span(0, R0, {})] })),
      ...flTracks, ...failTracks, ...modTracks, ...resTracks,
      ...(L.breaks.length ? [{ target: 'section', clips: L.breaks.map(([a, b]) => span(a / 1000 + 1.2, Math.min(b / 1000 - 1.2, a / 1000 + 4.2), { frame: at('math.clamp(math.floor((50 - state.hp) / 50) + 1, 0, 1)'),
        scaleX: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.3, v: 1 }, { t: 2.6, v: 1, ease: 'quad-in' }, { t: 3.0, v: 0 }], scaleY: [{ t: 0, v: 0, ease: 'back-out' }, { t: 0.3, v: 1 }, { t: 2.6, v: 1, ease: 'quad-in' }, { t: 3.0, v: 0 }] })) }] : []),
      { id: 'osu-music', kind: 'audio', name: '音楽', target: '', clips: [{ id: 'osu-music-clip', start: 0, end: dur, sound: L.music }] },
    ];
    const md = map.metadata || {};
    const seq = { id: 'osu', name: `${md.Title || 'osu!'}${md.Version ? ` [${md.Version}]` : ''}`, duration: dur, fps: 60, loop: 'hold', tempo: [{ t: r4((map.timing.find((p) => p.uninherited) || { time: 0 }).time / 1000), bpm: L.bpm, meter: 4 }],
      paths, templates, instances, markers: [{ id: 'end', t: r4(lastEnd + 0.5), name: 'おわり', event: 'done' }], tracks, game: G };
    return { version: 1, sequences: [seq] };
  }

  // ---------------------------------------------------------------------------------------------------------------- the design
  /** the playfield's frame of bones: the fall (a fail: it drops away; the results: it goes), the shake, the lean, the pulse — each
   *  a bone of its own (one track a bone), the pulse's children the playfield's elements */
  const FIELD = (C) => [{ name: 'osu_fall', parent: 'osu_root', pivot: [C[0], C[1], 0] }, { name: 'osu_shake', parent: 'osu_fall', pivot: [C[0], C[1], 0] }, { name: 'osu_tilt', parent: 'osu_shake', pivot: [C[0], C[1], 0] }, { name: 'osu_pulse', parent: 'osu_tilt', pivot: [C[0], C[1], 0] }];

  /** the tour: every look of the game in about 23 seconds, scene by scene at fixed times — what runtime.js plays for
   *  `<ns>:tour` (and the menu's 検証ツアー), the real app's one quick check of it all: circles, a slider with its turns, a kiai, HD,
   *  FL, the spinner, a break's PASS, misses (aim, nothing pressed: the shake), a fail, the results (the autoplay's whole play).
   *  → { scenes: [[ms, what, a, b, c]] (play: from ms of the song, mode, mods · seek: likewise · fail · results: the song's ms ·
   *  stop), shots: [[ms, name]] (a moment of each scene to look at), length } */
  function tourOf(G) {
    const objs = G.objects || [], end = (o) => (o.k === 's' ? o.t + o.d : o.k === 'p' ? o.e : o.t);
    if (!objs.length) return { scenes: [], shots: [], length: 0 };
    const first = objs[0].t, lastEnd = Math.max(...objs.map(end)), kiai = G.kiai || [], brk = (G.breaks || [])[0], sp = objs.find((o) => o.k === 'p');
    // (the slider with the most turns, the longest of them; the 2.2 s with the most objects after a time; the object at a time)
    const slider = objs.filter((o) => o.k === 's').sort((a, b) => b.r - a.r || b.d - a.d)[0];
    const dense = (from, to = Infinity) => { let best = null, n = -1; for (const o of objs) { if (o.t < from || o.t > to) continue; const c = objs.filter((x) => x.t >= o.t && x.t < o.t + 2200).length; if (c > n) { n = c; best = o.t; } } return best === null ? from : best; };
    const scenes = [], shots = [];
    let at = 0;
    const add = (dt, row, shot, name) => { scenes.push([at, ...row]); if (shot !== null) shots.push([at + shot, name]); at += dt; };
    add(2200, ['play', Math.max(0, first - 1200), 'auto', ''], 1500, 'circles');
    if (slider) add(2200, ['seek', Math.max(0, slider.t - 600), 'auto', ''], 1300, 'slider');
    if (kiai[0]) add(2200, ['seek', kiai[0][0] + 150, 'auto', ''], 1150, 'kiai');
    const hdAt = dense(first + 4000, kiai[0] ? kiai[0][0] - 2500 : Infinity);
    add(2200, ['seek', Math.max(0, hdAt - 500), 'auto', 'HD'], 1400, 'hidden');
    const flAt = kiai[1] ? kiai[1][0] + 300 : dense(lastEnd / 2);
    add(2200, ['seek', Math.max(0, flAt - 300), 'auto', 'FL'], 1300, 'flashlight');
    if (sp) add(2400, ['seek', Math.max(0, sp.t - 300), 'auto', ''], 1700, 'spinner');
    if (brk) add(2200, ['seek', brk[0] + 900, 'auto', ''], 1000, 'break');
    // (aim, and nothing pressed: misses — the shake, the combo gone, the health down — then the fail)
    const missAt = dense(kiai[0] ? kiai[0][0] + 1500 : first + 3000);
    add(1700, ['seek', Math.max(0, missAt - 300), 'aim', ''], 1350, 'miss');
    add(3000, ['fail'], 1500, 'fail');
    add(3700, ['results', lastEnd + 100], 2900, 'results');
    scenes.push([at, 'stop']);
    return { scenes, shots, length: at };
  }

  /** a beatmap (parsed: osu.parseOsu) → the whole game. opts: { skin: 'pixel' | 'skin', images ({ name: image } of an osu! skin:
   *  the Legacy skin's @2x names without '@2x', for 'skin'), ns, title, description, width (the playfield's, model units: 176),
   *  centre ([0, 130]), music (its sound id), sound(name) → a sound id for an osu! sample or null, ppu (the skin's pixels a unit:
   *  6) } */
  function build(map, opts = {}) {
    const O = T.osu, skin = opts.skin === 'skin' ? 'skin' : 'pixel', P = skin === 'pixel', ns = opts.ns || 'geoui', FW = num(opts.width, 176), C = opts.centre || [0, 130];
    const warnings = [], diff = O.difficultyOf(map), G = O.gameOf(map, { width: FW, sound: opts.sound || ((x) => x) }), R = G.r;
    const colours = (map.colours.combos.length ? map.colours.combos : [[255, 192, 0], [0, 202, 0], [18, 124, 255], [242, 24, 57]]).slice(0, 8);
    const cs = O.combos(map), bpm = r4(60000 / ((map.timing.find((p) => p.uninherited) || { beatLength: 500 }).beatLength));
    // (the pixel look's circles carry their numbers: a frame for each combo number and colour a circle or a slider's head shows —
    //  the pairs the map has, not all of them: the coin's frames stay few however long a combo runs)
    const pairKey = ([n, c]) => `${n}/${c}`;
    let coinPairs = P ? [...new Map(G.objects.map((g, i) => [g.k, [Math.min(9999, cs[i].n), cs[i].colour % colours.length]]).filter(([k]) => k === 'c' || k === 's').map(([, p]) => [pairKey(p), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]) : null;
    const lastEnd = Math.max(...G.objects.map((g) => (g.k === 's' ? g.t + g.d : g.k === 'p' ? g.e : g.t)));
    const duration = r4(Math.max(lastEnd / 1000 + 4, num(opts.duration, 0)));
    // ---- the sprites and their sizes (model units)
    const items = [], size = {};
    let bodyInfo;
    const HALFW = 151.7, TOP = 220.4, BOTTOM = 49.7;   // (the screen at 16:9 by bds-lab's measure: GeoUI's measured calibration)
    // (FL: the light round the cursor — its radius at a combo under 100, 0.3 of the field's height (osu!'s shrinks at 100 and
    //  200), the square it is drawn in; the field and its frame it darkens, with room for the tilt — the board lies deeper than
    //  the light, so a lean shows it a little beside where the light's plane is — but not as far as the combo at the bottom left)
    const FLR = r4(FW * 0.75 * 0.3), FLS = r4(FLR * 1.12), FLX = r4(FW / 2 + 13.5), FLY = r4(FW * 0.375 + 19.5);
    // (the mods on: osu!'s letters, each its colour)
    const MODC = [['HD', [234, 178, 40]], ['FL', [96, 96, 112]], ['NF', [60, 130, 230]], ['SD', [230, 110, 50]], ['PF', [220, 70, 150]], ['AUTO', [60, 190, 150]]];
    if (P) {
      const S = pixelSprites(colours), pu = (2 * R) / 16;   // (a hit circle 16 px across)
      Object.assign(size, { pu });
      // (the flashlight a pixel of the look a pixel: black but for a pixel circle round the cursor, dithered at its edge)
      S.flashlight = (() => { const n = 2 * Math.ceil(FLS / pu), im = img(n, n), c = n / 2, rr = FLR / pu; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d > rr || (d > rr - 1.6 && (x + y) % 2 === 0)) put(im, x, y, [0, 0, 0, 255]); } return im; })();
      size.flS = (S.flashlight.width * pu) / 2;
      // (the mods on: a plate a mod — its colour's border, its letters)
      for (const [m, c] of MODC) { const t = textImage(m, [...c.map((v) => Math.min(255, v + 40)), 255]), o = img(t.width + 4, 9); for (let y = 0; y < 9; y++) for (let x = 0; x < o.width; x++) { const e = Math.min(x, y, o.width - 1 - x, 8 - y), corner = (x === 0 || x === o.width - 1) && (y === 0 || y === 8); if (!corner) put(o, x, y, e === 0 ? [...c.map((v) => Math.round(v * 0.7)), 255] : [18, 20, 32, 255]); } blit(o, t, 2, 2); S[`mod${m}`] = o; }
      // the models (pixelModels: each object of the game built of blocks, the pixel art on their faces)
      const MODELS = pixelModels(colours, S, coinPairs), models = {};
      MODELS.rank.zs = 0.45; for (const id of ['digitframes', 'x', 'dot', 'pct', ...Array.from({ length: 10 }, (_, d) => `num${d}`)]) MODELS[id].zs = 0.5;
      for (const [id, im, sh] of [['hitcircle', S.hitcircle, 1], ['approachcircle', S.approachcircle, 1], ['hitburst', S.hitburst, 1], ['sliderball', S.sliderball, 1], ['followcircle', S.followcircle, 1],
        ['reversearrow', S.reversearrow, 1], ['slidertick', S.slidertick, 1], ['followpoint', S.followpoint, 1], ['spinner', S.spinner, 1], ['spinnerapproach', S.spinnerapproach, 1], ['cursor', S.cursor, 1],
        ['judgement', S.judgement, 1], ['digit', S.digit, 1], ['digitframes', [...S.digit, img(3, 5)], 1], ...S.digit.map((im, d) => [`num${d}`, im, 1]), ['spin', S.spin, 1], ['clear', S.clear, 1], ['rank', S.rank, 1], ['section', S.section, 1],
        ['x', S.x, 1], ['dot', S.dot, 1], ['pct', S.pct, 1], ['barback', S.barback, 1], ['barfill', S.barfill, 1], ['board', S.board, 0], ['glow', S.glow, 0],
        ['resboard', S.resboard, 0], ['restitle', S.restitle, 1], ['maxcombo', S.maxcombo, 1], ['accuracy', S.accuracy, 1], ['fc', S.fc, 1], ['record', S.record, 1], ['failed', S.failed, 1], ['retry', S.retry, 1],
        ['j300', S.j300, 1], ['j100', S.j100, 1], ['j50', S.j50, 1], ['jx', S.jx, 1], ...['HD', 'FL', 'NF', 'SD', 'PF', 'AUTO'].map((m) => [`mod${m}`, S[`mod${m}`], 1]), ['flashlight', S.flashlight, 0], ['shade', S.shade, 0]]) {
        // (a modeled object: its layers' cells — the pixel art and its lights; the rest as before: a picture made solid)
        if (MODELS[id]) { const mc = modelCells(MODELS[id]); models[id] = mc; items.push({ id, image: mc.cells, shade: false }); }
        else items.push({ id, image: im, shade: Boolean(sh) });
      }
      Object.assign(size, { models, sprites: S });
      bodyInfo = bodies(G, colours, cs.map((c) => c.colour), { ppu: 1 / pu, pixel: true });
    } else {
      const I = opts.images || {}, need = (n) => { if (!I[n]) throw new Error(`osu! のスキンに「${n}」がありません`); return I[n]; };
      const ppu = num(opts.ppu, 6), k = R / 128;   // (an @2x pixel of the skin in model units: hitcircle@2x is 256 px across a circle)
      const px = (im, f = k) => [im.width * f, im.height * f], sc = (im, f = k) => resize(im, im.width * f * ppu, im.height * f * ppu);
      // hit circles: the circle tinted by each combo colour, its overlay over it — one frame a colour; the approach circle likewise
      const cell = Math.round(2 * R * ppu);
      const hc = need('hitcircle'), ov = need('hitcircleoverlay'), ap = need('approachcircle');
      items.push({ id: 'hitcircle', image: colours.map((c) => { const o = img(256, 256); blit(o, centred(hc, 256, 256), 0, 0, c); blit(o, centred(ov, 256, 256), 0, 0); return resize(o, cell, cell); }) });
      items.push({ id: 'approachcircle', image: colours.map((c) => { const o = img(256, 256); blit(o, centred(ap, 256, 256), 0, 0, c); return resize(o, cell, cell); }) });
      size.circle = [2 * R, 2 * R];
      // numbers (default-0…9), judgements (one cell each, the largest), slider balls (10 frames), the rest one picture each
      const digits = Array.from({ length: 10 }, (_, d) => need(`default-${d}`)), dh = Math.max(...digits.map((m) => m.height));
      items.push(...digits.map((m, d) => ({ id: `default-${d}`, image: sc(m) })));
      size.digits = digits.map((m) => px(m)); size.digitH = dh * k;
      const judg = ['hit300', 'hit100', 'hit50', 'hit0'].map(need), jw = Math.max(...judg.map((m) => m.width)), jh = Math.max(...judg.map((m) => m.height));
      items.push({ id: 'judgement', image: judg.map((m) => sc(centred(m, jw, jh), k * 0.8)) }); size.judgement = [jw * k * 0.8, jh * k * 0.8];
      const balls = Array.from({ length: 10 }, (_, d) => need(`sliderb${d}`));
      items.push({ id: 'sliderball', image: balls.map((m) => sc(m)) }); size.sliderball = px(balls[0]);
      for (const [id, name, f] of [['followcircle', 'sliderfollowcircle', k], ['reversearrow', 'reversearrow', k], ['slidertick', 'sliderscorepoint', k], ['followpoint', 'followpoint', k * 0.8], ['cursor', 'cursor', k * 0.9]]) { const m = need(name); items.push({ id, image: sc(m, f) }); size[id] = px(m, f); }
      // the spinner: the field's height across
      const sp = need('spinner-circle'), f = (132 * 0.92) / sp.width, ppuSp = Math.min(ppu, 512 / (sp.width * f));
      const scS = (m) => resize(m, m.width * f * ppuSp, m.height * f * ppuSp);
      items.push({ id: 'spinner', image: scS(sp) }); size.spinner = px(sp, f);
      const spa = need('spinner-approachcircle'); items.push({ id: 'spinnerapproach', image: scS(resize(spa, sp.width, sp.width * (spa.height / spa.width))) }); size.spinnerapproach = [sp.width * f, sp.width * f];
      for (const [id, name] of [['spinnerclear', 'spinner-clear'], ['spinnerspin', 'spinner-spin'], ['spinnerrpmbg', 'spinner-rpm']]) { const m = need(name); items.push({ id, image: sc(m, f * 0.75) }); size[id] = px(m, f * 0.75); }
      // HUD: score digits (and blank), %, x, the health bar, the rank letters, section pass / fail, the glow, the backing
      const sd = Array.from({ length: 10 }, (_, d) => need(`score-${d}`)), sw = Math.max(...sd.map((m) => m.width)), sh = Math.max(...sd.map((m) => m.height)), hud = 9 / sh;
      items.push({ id: 'scoredigits', image: [...sd.map((m) => sc(centred(m, sw, sh), hud)), sc(img(sw, sh), hud)] }); size.score = [sw * hud, sh * hud];
      for (const [id, name, ff] of [['x', 'score-x', hud], ['pct', 'score-percent', hud], ['dot', 'score-dot', hud], ['barback', 'scorebar-bg', 0.09], ['barfill', 'scorebar-colour', 0.09]]) { const m = need(name); items.push({ id, image: sc(m, ff) }); size[id] = px(m, ff); }
      // (the glow: soft, a small picture stretched)
      items.push({ id: 'glow', image: resize(need('lighting'), 128, 128) });
      // the grade on the results: the big letters (X = SS), silver XH / SH with HD or FL — the small ones where a skin has no big ones
      const opt = (n) => I[n] || null;
      const ranks = ['X', 'S', 'A', 'B', 'C', 'D', 'XH', 'SH'].map((g) => opt(`ranking-${g}`) || opt(`ranking-${g.replace('H', '')}`) || need(`ranking-${g.replace('H', '')}-small`));
      const rw = Math.max(...ranks.map((m) => m.width)), rh = Math.max(...ranks.map((m) => m.height)), rf = 68 / rh, rppu = 1.75;
      items.push({ id: 'rank', image: ranks.map((m) => resize(centred(m, rw, rh), rw * rf * rppu, rh * rf * rppu)) }); size.rank = [rw * rf, rh * rf];
      // the results' panel and words (the skin's own, else drawn here: a dark panel, the pixel font's words)
      const res = (n, h, ppx, fallback) => { const m = opt(n); if (!m) { const t = fallback(); items.push({ id: n, image: t }); size[n] = [t.width * (h / t.height), h]; return; } const f = h / m.height; items.push({ id: n, image: resize(m, m.width * f * ppx, m.height * f * ppx) }); size[n] = [m.width * f, h]; };
      res('ranking-panel', 112, 1.6, () => { const o = img(62, 50); for (let y = 0; y < 50; y++) for (let x = 0; x < 62; x++) put(o, x, y, y < 1 || (y > 7 && y < 9) ? [0, 0, 0, 0] : y < 8 ? [230, 205, 160, 230] : [62, 124, 214, 230]); return o; });
      res('ranking-title', 13, 3, () => strokeText('RANKING').image);
      res('ranking-maxcombo', 8, 4, () => strokeText('MAX COMBO').image);
      res('ranking-accuracy', 8, 4, () => strokeText('ACCURACY').image);
      res('ranking-perfect', 18, 3, () => strokeText('PERFECT', { colour: [255, 214, 64] }).image);
      // (the words the skin has none of — a new best, the fail, its hint — in the stroke font, cap the height asked; the retry
      //  button the skin's own where it has one)
      const word = (id, s, cap, colour, outline) => { const t = strokeText(s, { colour, outline, ppu: Math.max(4, Math.round(cap * 0.75)) }); items.push({ id, image: t.image }); size[id] = [(t.image.width / t.image.height) * (cap / t.cap), cap / t.cap]; };
      word('record', 'NEW RECORD!', 6, [150, 255, 160], [10, 50, 20]); word('failed', 'FAILED', 15, [255, 84, 96], [50, 0, 10]); word('retry', 'JUMP: RETRY', 4.2, [255, 236, 236], [40, 20, 20]);
      if (opt('pause-retry')) res('pause-retry', 15, 3, () => img(1, 1));
      // the mods on: a pill a mod (its colour, lit from the top), its letters white
      for (const [m, c] of MODC) {
        const t = strokeText(m, { colour: [255, 255, 255], outline: c.map((v) => Math.round(v * 0.45)), ppu: 8 }).image, Hp = Math.round(t.height * 1.08), Wp = t.width + Math.round(Hp * 0.55);
        const pill = (w, cc) => T.media.rasterOps([['strokeStyle', `rgb(${cc[0]},${cc[1]},${cc[2]})`], ['lineWidth', w], ['beginPath'], ['moveTo', Hp / 2, Hp / 2], ['lineTo', Wp - Hp / 2, Hp / 2], ['stroke']], Wp, Hp);
        const o = img(Wp, Hp), back = pill(Hp, c.map((v) => Math.round(v * 0.5))), face = pill(Hp - 6, c);
        blit(o, { width: back.width, height: back.height, data: back.data }, 0, 0);
        for (let y = 0; y < face.height; y++) { const f = 1.18 - 0.36 * (y / face.height); for (let x = 0; x < face.width; x++) { const cc = get(face, x, y); if (cc[3]) put(o, x, y, [Math.min(255, Math.round(cc[0] * f)), Math.min(255, Math.round(cc[1] * f)), Math.min(255, Math.round(cc[2] * f)), cc[3]]); } }
        blit(o, t, Math.round((Wp - t.width) / 2), Math.round((Hp - t.height) / 2));
        items.push({ id: `mod${m}`, image: o }); size[`mod${m}`] = [(Wp / Hp) * 6.8, 6.8];
      }
      // the flashlight: black, a soft hole round the cursor (its edge a fifth of the square's half); the fail's shade: black,
      // see-through
      items.push({ id: 'flashlight', image: (() => { const n = 128, o = img(n, n), c = n / 2, uh = FLR / FLS; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c; put(o, x, y, [0, 0, 0, Math.round(255 * Math.min(1, Math.max(0, (u - (uh - 0.22)) / 0.22)))]); } return o; })() });
      size.flS = FLS;
      items.push({ id: 'shade', image: (() => { const o = img(8, 8); for (let k = 3; k < o.data.length; k += 4) o.data[k] = 160; return o; })() });
      const sec = ['section-pass', 'section-fail'].map(need), sw2 = Math.max(...sec.map((m) => m.width)), sh2 = Math.max(...sec.map((m) => m.height)), sf = 46 / sh2;
      items.push({ id: 'section', image: sec.map((m) => sc(centred(m, sw2, sh2), sf)) }); size.section = [sw2 * sf, sh2 * sf];
      const back = (() => { const o = img(64, 48); for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) { const e = Math.min(x, y, 63 - x, 47 - y); put(o, x, y, [0, 0, 0, Math.round(Math.min(1, e / 3) * 180)]); } return o; })();
      items.push({ id: 'board', image: back });
      Object.assign(size, { ppu, k });
      bodyInfo = bodies(G, colours, cs.map((c) => c.colour), { ppu: Math.min(ppu, num(opts.bodyPpu, 2.2)), pixel: false });
    }
    items.push({ id: 'bodies', image: bodyInfo.cells.length ? bodyInfo.cells : [img(1, 1)] });
    // (2048 at most: the size every device takes — the slider bodies, the largest part, drawn smaller until it all fits)
    let A = null;
    for (let tries = 0, bp = bodyInfo.ppu; !A; tries++) {
      try { A = atlasOf(items, { maxSize: num(opts.maxAtlas, 2048) }); }
      catch (e) {
        // (the coins' numbers when nothing else is left to make smaller: a frame for each number and colour → a frame a colour)
        if ((tries >= 6 || !bodyInfo.cells.length) && P && coinPairs) {
          const mc = modelCells(pixelModels(colours, size.sprites, null).hitcircle);
          size.models.hitcircle = mc; items.find((x) => x.id === 'hitcircle').image = mc.cells;
          warnings.push(`コンボの数字をコインに描けませんでした（数字と色の組 ${coinPairs.length} 個がアトラス（${num(opts.maxAtlas, 2048)} x ${num(opts.maxAtlas, 2048)}）に入りません）。数字のない円にしました`);
          coinPairs = null; continue;
        }
        if (tries >= 6 || !bodyInfo.cells.length) throw e;
        bp *= 0.84; bodyInfo = bodies(G, colours, cs.map((c) => c.colour), { ppu: bp, pixel: P }); items.find((x) => x.id === 'bodies').image = bodyInfo.cells;
        if (tries === 0) warnings.push('アトラス（2048 x 2048）に入りきらないので、スライダーの体を小さい絵にしました（画面での大きさは同じ・きめが粗い）');
      }
    }
    // ---- the bones (GeoUI's design): the field, the playfield's elements under its pulse, the HUD under the root
    // (osu_root: everything, shown only while a sequence plays — GeoUI's visible condition on it; the HUD's bones under it too)
    const bones = [{ name: 'geo_ui', pivot: [0, 140, 0] }, { name: 'osu_root', parent: 'geo_ui', pivot: [0, 140, 0] }, ...FIELD(C)], F = 'osu_pulse', H = 'osu_root';
    const elements = { osu_root: { type: 'image', visible: `v.${ns}_seq > 0` } };
    const cellOf = (id, frame = 0) => { const a = A.at[id]; return [a.x + (frame % a.cols) * a.cell[0], a.y + Math.floor(frame / a.cols) * a.cell[1]]; };
    const framesOf = (id) => { const a = A.at[id]; return { cols: a.cols, rows: a.rows, step: a.cell }; };
    const imageEl = (name, frames, blend = P ? 'cutout' : 'blend') => { elements[name] = Object.assign({ type: 'image', blend }, frames ? { frames } : {}); };
    // (a modeled object — pixelModels — as its model; any other sprite made solid: its picture d units deep)
    const vox = (name, id, parent, at, z, d, o = {}) => {
      const fr = A.at[id].frames, mdl = size.models && size.models[id];
      if (mdl) bones.push(modelBone(name, parent, at, cellOf(id), o.px || size.pu, z, mdl));
      else { const ims = items.find((x) => x.id === id).image; bones.push(voxel(name, parent, at, Array.isArray(ims) ? ims : [ims], cellOf(id), o.px || size.pu, d, z, { perPixel: Boolean(o.perPixel) })); }
      imageEl(name, fr > 1 && !o.noFrames ? framesOf(id) : null);
    };
    const flat = (name, id, parent, at, z, sz, o = {}) => {
      const a = A.at[id];
      bones.push(plane(name, parent, at, sz, [a.x, a.y, a.w, a.h], z));
      imageEl(name, a.frames > 1 ? framesOf(id) : null, o.blend);
    };
    // z: the nearer the more negative (GeoUI's layers): the board behind all, then follow points, bodies, ticks, the spinner,
    // circles, numbers, approach circles, the ball and its follow circle, judgements, the cursor in front
    const bodyFrames = framesOf('bodies');
    const bodyFrame = {}, bodyCentre = {};
    G.objects.forEach((g, i) => { if (g.k === 's') { const n = Object.keys(bodyFrame).length; bodyFrame[i] = n; bodyCentre[i] = bodyInfo.centre[n]; } });
    // (what the document needs of the layout: build's places for the HUD, the flashlight, the mods, the results)
    const L0 = {};
    const hudDigits = (prefix, n, [x0, y0], dw, z, idDigits, anchor, o = {}) => {
      bones.push({ name: prefix, parent: H, pivot: [r4(x0), r4(y0), 0] });
      if (anchor) elements[prefix] = { type: 'image', anchor };
      for (let k = 0; k < n; k++) {
        const at = [x0 + (k - (n - 1)) * dw, y0];   // (right-aligned: the last digit at x0)
        if (P) { vox(`${prefix}${k}`, 'digitframes', prefix, at, z, 0.9, { px: o.px, perPixel: true }); elements[`${prefix}${k}`].frames = framesOf('digitframes'); }
        else { flat(`${prefix}${k}`, 'scoredigits', prefix, at, z - k * 0.021, o.size || size.score); }   // (overlapping a little: each its own depth)
      }
    };
    if (P) {
      const pu = size.pu, D = 2.2;   // (a sprite's depth: about one and a half pixels)
      bones.push(plane('board', F, C, [FW + 14, FW * 0.75 + 14], [A.at.board.x, A.at.board.y, A.at.board.w, A.at.board.h], 10)); imageEl('board', null, 'blend');
      // the board's frame, modeled: walls round the field (deep: their sides show as the field leans), a lip inside them on
      // the floor, a post at each corner standing out of the walls with a cap on it — one bone of blocks
      bones.push({ name: 'board_frame', parent: F, pivot: [C[0], C[1], 8], cubes: trayCubes(C, FW + 16, FW * 0.75 + 16, 6, A.at.barback) });
      bones.push(plane('kiaiglow', F, C, [FW * 1.1, FW * 0.85], [A.at.glow.x, A.at.glow.y, A.at.glow.w, A.at.glow.h], 9)); imageEl('kiaiglow', null, 'add');
      vox('followpoint', 'followpoint', F, C, 4, 0.8, { px: pu * 0.9 });
      bones.push(plane('sliderbody', F, C, bodyInfo.units, [A.at.bodies.x, A.at.bodies.y, A.at.bodies.w, A.at.bodies.h], 3)); elements.sliderbody = { type: 'image', blend: 'cutout', frames: bodyFrames };
      vox('slidertick', 'slidertick', F, C, 2, 0.8, { px: pu });
      vox('spinner', 'spinner', F, C, 1.5, 2.5, { px: (FW * 0.75 * 0.9) / 32 });
      vox('spinnerapproach', 'spinnerapproach', F, C, -3, 1, { px: (FW * 0.75 * 0.9) / 32 });
      // (each a depth of its own, front to back without two overlapping: a voxel's sides then share no plane with another's)
      vox('spinnerspin', 'spin', F, [C[0], C[1] - 34], -14.6, 1.5, { px: pu * 1.3 });
      vox('spinnerclear', 'clear', F, [C[0], C[1] + 30], -16.4, 1.5, { px: pu * 1.6 });
      [0, 1, 2].forEach((k) => { vox(`spinnerrpm${k}`, 'digitframes', F, [C[0] + (k - 1) * pu * 4.2, C[1] - 48], -18, 1, { px: pu * 1.05, perPixel: true }); elements[`spinnerrpm${k}`].frames = framesOf('digitframes'); });
      // (the coin and its number in one model: a frame a combo colour and number — no numerals of their own, so no slot of
      //  the circles carries twenty of them)
      vox('hitcircle', 'hitcircle', F, C, -3, D);
      vox('followcircle', 'followcircle', F, C, -4.4, 0.8, { px: (2.4 * 2 * R) / 28 });
      vox('approachcircle', 'approachcircle', F, C, -6, 1.0);
      vox('reversearrow', 'reversearrow', F, C, -7.4, 1.2, { px: pu * 1.2 });
      vox('sliderball', 'sliderball', F, C, -9.8, 2, { px: (1.6 * R) / 8 });
      vox('hitburst', 'hitburst', F, C, -11.4, 1.4);
      vox('judgement', 'judgement', F, C, -13, 1.4, { px: pu * 0.85, perPixel: true });
      // (the gem whole in front of the flashlight's plane: its back at -18.3)
      vox('cursor', 'cursor', F, C, -22.5, 1.6, { px: pu * 0.9 });
      // HUD (score top right, accuracy under it, the combo bottom left, health top left, progress, section) — in front of the
      // playfield and its flashlight (HZ: the HUD's layer; osu!'s HUD stays over the flashlight)
      const spx = 1.9, sdw = spx * 4, HZ = -28;
      hudDigits('score', 8, [HALFW - 6, TOP - 9], sdw, HZ, 'digitframes', 'top-right', { px: spx });
      const apx = 1.2, adw = apx * 4, ay = TOP - 22;
      hudDigits('acc', 5, [HALFW - 6 - adw * 2.2, ay], adw, HZ, 'digitframes', 'top-right', { px: apx });
      // (the accuracy reads 99.87%: its point after the third digit — the digits are at fixed places, the point and % beside)
      const accBones = bones.filter((b) => /^acc[0-4]$/.test(b.name));
      accBones.forEach((b) => { const k = +b.name.slice(3); const dx = k >= 3 ? adw * 0.9 : 0; for (const c of b.cubes) c.origin[0] = r4(c.origin[0] + dx); b.pivot[0] = r4(b.pivot[0] + dx); });
      vox('accdot', 'dot', 'acc', [HALFW - 6 - adw * 2.2 - adw * 1.05, ay], HZ, 0.9, { px: apx });
      vox('accpct', 'pct', 'acc', [HALFW - 6 - adw * 2.2 + adw * 1.9, ay], HZ, 0.9, { px: apx });
      const cpx = 2.6, cdw = cpx * 4, cy0 = BOTTOM + 11;
      bones.push({ name: 'combo', parent: H, pivot: [r4(-HALFW + 8), cy0, 0] }); elements.combo = { type: 'image', anchor: 'bottom-left' };
      for (let k = 0; k < 4; k++) { vox(`combo${k}`, 'digitframes', 'combo', [-HALFW + 8 + k * cdw, cy0], HZ, 1.4, { px: cpx, perPixel: true }); elements[`combo${k}`].frames = framesOf('digitframes'); }
      vox('combox', 'x', 'combo', [-HALFW + 8 + 4 * cdw - cdw * 0.15, cy0 - cpx], HZ, 1.4, { px: cpx });
      vox('healthback', 'barback', H, [-HALFW + 6 + 63, TOP - 7], HZ + 1, 1.5, { px: 3 }); elements.healthback.anchor = 'top-left';
      vox('health', 'barfill', H, [-HALFW + 6 + 63, TOP - 7], HZ - 0.6, 1.5, { px: 3 });
      Object.assign(bones.find((b) => b.name === 'health'), { pivot: [r4(-HALFW + 6 + 3), TOP - 7, HZ - 0.6] });
      elements.health = { type: 'gauge', anchor: 'top-left', blend: 'cutout', gauge: { source: `q.property('${ns}:v3')`, max: 100, fill: 'left' } };
      vox('progressback', 'barback', H, [HALFW - 6 - 25.2, TOP - 30], HZ + 1, 0.8, { px: 1.2 }); elements.progressback.anchor = 'top-right';
      vox('progress', 'barfill', H, [HALFW - 6 - 25.2, TOP - 30], HZ, 0.8, { px: 1.2 });
      Object.assign(bones.find((b) => b.name === 'progress'), { pivot: [r4(HALFW - 6 - 49.2), TOP - 30, HZ] });
      elements.progress = { type: 'gauge', anchor: 'top-right', blend: 'cutout', gauge: { source: '0', max: 1, fill: 'left' } };
      vox('section', 'section', H, [0, C[1]], HZ - 6, 2, { px: 3.2, perPixel: true });
      // (where the score and the accuracy are, for the results: each group's pivot — its last digit — and how far it reaches left
      //  and right of it)
      Object.assign(L0, { HZ, score: { pivot: [HALFW - 6, TOP - 9], left: 7 * sdw + 1.5 * spx, right: 1.5 * spx, h: 5 * spx },
        acc: { pivot: [HALFW - 6 - adw * 2.2, ay], left: 4 * adw + 1.5 * apx, right: adw * 1.9 + 1.5 * apx, h: 5 * apx } });
    } else {
      flat('board', 'board', F, C, 12, [FW + 16, FW * 0.75 + 16]);
      flat('kiaiglow', 'glow', F, C, 11, [FW * 1.15, FW * 0.9], { blend: 'add' });
      flat('followpoint', 'followpoint', F, C, 6, size.followpoint);
      bones.push(plane('sliderbody', F, C, bodyInfo.units, [A.at.bodies.x, A.at.bodies.y, A.at.bodies.w, A.at.bodies.h], 5)); elements.sliderbody = { type: 'image', blend: 'blend', frames: bodyFrames };
      flat('slidertick', 'slidertick', F, C, 4, size.slidertick);
      flat('spinnerapproach', 'spinnerapproach', F, C, 3.5, size.spinnerapproach);
      flat('spinner', 'spinner', F, C, 3, size.spinner);
      flat('spinnerspin', 'spinnerspin', F, [C[0], C[1] - 36], -10.25, size.spinnerspin);
      flat('spinnerclear', 'spinnerclear', F, [C[0], C[1] + 30], -10.5, size.spinnerclear);
      flat('spinnerrpmbg', 'spinnerrpmbg', F, [C[0] + 8, C[1] - 54], -9.8, size.spinnerrpmbg);
      [0, 1, 2].forEach((j) => flat(`spinnerrpm${j}`, 'scoredigits', F, [C[0] + 14 + j * size.score[0] * 0.62, C[1] - 54], -10, [size.score[0] * 0.62, size.score[1] * 0.62]));
      // (the rpm's backing shows only while a spinner does: it rides on the template with the digits)
      flat('hitcircle', 'hitcircle', F, C, -3, size.circle);
      bones.push({ name: 'combonumber', parent: F, pivot: [C[0], C[1], -6] });
      const dws = size.digits.map((d) => d[0]), gap = Math.max(...dws) * 0.78;
      const digits = [0, 1].map((kk) => Array.from({ length: 10 }, (_, d) => { const a = A.at[`default-${d}`], b = plane(`combonumber_d${kk}_${d}`, 'combonumber', [C[0] + (kk - 0.5) * gap, C[1]], size.digits[d], [a.x, a.y, a.w, a.h], -6.1 - (kk * 10 + d) * 0.021); bones.push(b); return b.name; }));
      elements.combonumber = { type: 'number', number: { source: '0', digits, hideLeadingZero: true } };
      flat('approachcircle', 'approachcircle', F, C, -7.0, size.circle);
      flat('reversearrow', 'reversearrow', F, C, -8, size.reversearrow);
      flat('followcircle', 'followcircle', F, C, -8.5, size.followcircle);
      flat('sliderball', 'sliderball', F, C, -9, size.sliderball);
      flat('judgement', 'judgement', F, C, -11, size.judgement);
      flat('cursor', 'cursor', F, C, -13, size.cursor);
      // HUD — in front of the playfield and its flashlight (HZ: the HUD's layer)
      const sw = size.score[0] * 0.95, HZ = -18;
      hudDigits('score', 8, [HALFW - 4 - size.score[0] / 2, TOP - 7], sw, HZ, 'scoredigits', 'top-right');
      const as = 0.62, aw = sw * as, ay = TOP - 18;
      hudDigits('acc', 5, [HALFW - 4 - size.pct[0] * as - aw * 0.5, ay], aw, HZ, 'scoredigits', 'top-right', { size: [size.score[0] * as, size.score[1] * as] });
      const accBones = bones.filter((b) => /^acc[0-4]$/.test(b.name));
      accBones.forEach((b) => { const kk = +b.name.slice(3); const dx = kk < 3 ? -size.dot[0] * as * 0.9 : 0; for (const c of b.cubes) c.origin[0] = r4(c.origin[0] + dx); b.pivot[0] = r4(b.pivot[0] + dx); });
      flat('accdot', 'dot', 'acc', [HALFW - 4 - size.pct[0] * as - aw * 2.0 - size.dot[0] * as * 0.45, ay], HZ - 0.2, [size.dot[0] * as, size.dot[1] * as]);
      flat('accpct', 'pct', 'acc', [HALFW - 4 - size.pct[0] * as / 2, ay], HZ - 0.25, [size.pct[0] * as, size.pct[1] * as]);
      const cs2 = 1.25, cw = size.score[0] * cs2 * 0.92, cy0 = BOTTOM + 9;
      bones.push({ name: 'combo', parent: H, pivot: [r4(-HALFW + 6), cy0, 0] }); elements.combo = { type: 'image', anchor: 'bottom-left' };
      for (let kk = 0; kk < 4; kk++) flat(`combo${kk}`, 'scoredigits', 'combo', [-HALFW + 6 + cw / 2 + kk * cw, cy0], HZ - kk * 0.021, [size.score[0] * cs2, size.score[1] * cs2]);
      flat('combox', 'x', 'combo', [-HALFW + 6 + cw * 4 + size.x[0] * cs2 * 0.4, cy0], HZ - 0.1, [size.x[0] * cs2, size.x[1] * cs2]);
      const hb = size.barback, hx = -HALFW + 4 + hb[0] / 2, hy = TOP - 2 - hb[1] / 2;
      flat('healthback', 'barback', H, [hx, hy], HZ + 1, hb); elements.healthback.anchor = 'top-left';
      const hf = size.barfill, fx = -HALFW + 4 + hb[0] * 0.018 + hf[0] / 2, fy = hy + hb[1] * 0.06;
      flat('health', 'barfill', H, [fx, fy], HZ, hf);
      Object.assign(bones.find((b) => b.name === 'health'), { pivot: [r4(fx - hf[0] / 2), r4(fy), HZ] });
      elements.health = { type: 'gauge', anchor: 'top-left', blend: 'blend', gauge: { source: `q.property('${ns}:v3')`, max: 100, fill: 'left' } };
      const pw = 36, ph = 1.6, ppx = HALFW - 4 - pw / 2, ppy = TOP - 27;
      bones.push(plane('progressback', H, [ppx, ppy], [pw, ph], [A.at.barback.x, A.at.barback.y + 2, A.at.barback.w, Math.max(1, A.at.barback.h - 4)], HZ + 1)); imageEl('progressback'); elements.progressback.anchor = 'top-right';
      bones.push(plane('progress', H, [ppx, ppy], [pw, ph * 0.7], [A.at.barfill.x, A.at.barfill.y, A.at.barfill.w, A.at.barfill.h], HZ)); bones[bones.length - 1].pivot = [r4(ppx - pw / 2), r4(ppy), HZ];
      elements.progress = { type: 'gauge', anchor: 'top-right', blend: 'blend', gauge: { source: '0', max: 1, fill: 'left' } };
      flat('section', 'section', H, [0, C[1]], HZ - 4, size.section);
      Object.assign(L0, { HZ, score: { pivot: [HALFW - 4 - size.score[0] / 2, TOP - 7], left: 7 * sw + size.score[0] / 2, right: size.score[0] / 2, h: size.score[1] },
        acc: { pivot: [HALFW - 4 - size.pct[0] * as - aw * 0.5, ay], left: 4 * aw + size.dot[0] * as * 0.9 + (size.score[0] * as) / 2, right: size.pct[0] * as + aw / 2, h: size.score[1] * as } });
    }
    // ---- what both looks have past the HUD above: the flashlight, the fail, the mods on, the results
    {
      const Z = P ? { fl: -18.2, shade: -25.6, fail: -36, mods: L0.HZ, panel: -26, res: -29.5, grade: -31, stamp: -34 } : { fl: -12.5, shade: -15.5, fail: -22.6, mods: L0.HZ, panel: -16, res: -19, grade: -20, stamp: -21 };
      const blackUv = [A.at.flashlight.x, A.at.flashlight.y, 1, 1];   // (the flashlight's corner: black, opaque)
      const flBlend = P ? 'cutout' : 'blend';
      // the flashlight (FL): a square with the light in it, following the cursor, and four shutters from the field's frame to the
      // square (each scaled to reach it) — in the playfield's frame, in front of all but the cursor; the HUD in front of it
      const fs = size.flS;
      bones.push(plane('flhole', F, C, [2 * fs, 2 * fs], [A.at.flashlight.x, A.at.flashlight.y, A.at.flashlight.w, A.at.flashlight.h], Z.fl)); imageEl('flhole', null, flBlend);
      // (the shutters opaque — cut out: what is behind them is hidden whatever order the game draws in)
      const shutter = (name, pivot, origin, sz) => { bones.push({ name, parent: F, pivot: [r4(pivot[0]), r4(pivot[1]), Z.fl], cubes: [{ origin: [r4(origin[0]), r4(origin[1]), Z.fl], size: [r4(sz[0]), r4(sz[1]), 0], faces: { north: { uv: [blackUv[0], blackUv[1]], uv_size: [1, 1], texture: 'atlas' } } }] }); imageEl(name, null, 'cutout'); };
      shutter('flleft', [C[0] - FLX, C[1]], [C[0] - FLX, C[1] - FLY], [1, 2 * FLY]);
      shutter('flright', [C[0] + FLX, C[1]], [C[0] + FLX - 1, C[1] - FLY], [1, 2 * FLY]);
      shutter('fltop', [C[0], C[1] + FLY], [C[0] - fs * 1.01, C[1] + FLY - 1], [2 * fs * 1.01, 1]);
      shutter('flbottom', [C[0], C[1] - FLY], [C[0] - fs * 1.01, C[1] - FLY], [2 * fs * 1.01, 1]);
      Object.assign(L0, { flS: fs, flX: FLX, flY: FLY });
      // the fail: a dark curtain over the screen (under the HUD), FAILED, the retry's hint
      const shadeW = 2 * (HALFW + 60), shadeTop = TOP + 2;
      bones.push({ name: 'failshade', parent: H, pivot: [0, r4(shadeTop), Z.shade], cubes: [{ origin: [r4(-shadeW / 2), r4(BOTTOM - 2), Z.shade], size: [r4(shadeW), r4(shadeTop - BOTTOM + 2), 0], faces: { north: { uv: [A.at.shade.x + 1, A.at.shade.y + 1], uv_size: [Math.max(1, A.at.shade.w - 2), Math.max(1, A.at.shade.h - 2)], texture: 'atlas' } } }] }); imageEl('failshade', null, 'blend');
      if (P) {
        vox('failtext', 'failed', H, [0, C[1] + 22], Z.fail, 3, { px: 3.4 });
        vox('failretry', 'retry', H, [0, C[1] - 14], Z.fail, 1.2, { px: 1.3 });
      } else {
        // (each its own depth: no two faces on one plane — the break's section is in front of the HUD too)
        flat('failtext', 'failed', H, [0, C[1] + 22], Z.fail, size.failed);
        if (A.at['pause-retry']) { flat('failbutton', 'pause-retry', H, [0, C[1] - 10], Z.fail - 0.2, size['pause-retry']); flat('failretry', 'retry', H, [0, C[1] - 23], Z.fail - 0.4, size.retry); L0.failButton = true; }
        else flat('failretry', 'retry', H, [0, C[1] - 12], Z.fail - 0.4, size.retry);
      }
      // the mods on (top right, under the score): a row from the right, each shown by its state, those after it moving it left
      const modY = 184, modR = HALFW - 6, gapM = P ? 1.6 : 1.4, mods = [];
      bones.push({ name: 'mods', parent: H, pivot: [r4(modR), modY, 0] }); elements.mods = { type: 'image', anchor: 'top-right' };
      // (they rest on one another until moved: each its own depth, 0.05 apart, and its own edges, 0.03 apart)
      MODC.forEach(([m], i) => {
        const id = `mod${m}`, w = P ? size.sprites[id].width * 0.75 : size[id][0], at = [modR - w / 2 - i * 0.03, modY - i * 0.03];
        if (P) vox(id, id, 'mods', at, Z.mods - i * 0.05, 1, { px: 0.75 }); else flat(id, id, 'mods', at, Z.mods - i * 0.05, size[id]);
        mods.push({ m: m.toLowerCase(), w: r4(w + gapM) });
      });
      L0.mods = mods;
      // the results: osu!'s ranking — its panel (the score in its bar, the counts of 300 / 100 / 50 / miss, the max combo and the
      // accuracy under their labels), the title, the grade, the full combo's stamp, a new best. Laid out to fit a 4:3 screen
      // (±110 model units), not anchored: the score and the accuracy fly in from the HUD (anchored right: screen.dx)
      const RL = -110, PT = TOP - 22, PH = 112, PW = r4(P ? 137.9 : size['ranking-panel'][0]), PB = PT - PH;
      bones.push({ name: 'res', parent: H, pivot: [0, 140, 0] }); elements.res = { type: 'image' };
      if (P) {
        bones.push(plane('respanel', 'res', [RL + PW / 2, PT - PH / 2], [PW, PH], [A.at.resboard.x, A.at.resboard.y, A.at.resboard.w, A.at.resboard.h], Z.panel)); imageEl('respanel', null, 'blend');
        // (its frame: a tray as the playfield's board — walls, a lip, corner posts — standing out of the panel)
        bones.push({ name: 'respanel_frame', parent: 'respanel', pivot: [r4(RL + PW / 2), r4(PT - PH / 2), Z.panel], cubes: trayCubes([RL + PW / 2, PT - PH / 2], PW, PH, Z.panel - 4, A.at.barback, { out: 1.6 }) });
      } else flat('respanel', 'ranking-panel', 'res', [RL + PW / 2, PT - PH / 2], Z.panel, [PW, PH]);
      if (P) vox('restitle', 'restitle', 'res', [110 - (size.sprites.restitle.width * 1.6) / 2, TOP - 10], Z.res, 1.4, { px: 1.6 });
      else flat('restitle', 'ranking-title', 'res', [110 - size['ranking-title'][0] / 2, TOP - 10], Z.res, size['ranking-title']);
      // (a number in the results: digits right-aligned, the last at x0; 10 numerals a digit — a number element: no render
      //  controller. The pixel look's numerals blocks of letters on their shadow, as the HUD's: each a model of its own)
      const dig = P ? { w: 3 * 1.7 * 1.25, plane: (nm, par, at, z, d) => modelBone(nm, par, at, cellOf(`num${d}`), 1.7, z, size.models[`num${d}`]) }
        : { w: size.score[0] * 0.85 * 0.95, plane: (nm, par, at, z, d) => { const a = cellOf('scoredigits', d), at2 = A.at.scoredigits; return plane(nm, par, at, [size.score[0] * 0.85, size.score[1] * 0.85], [a[0], a[1], at2.w, at2.h], z); } };
      const numberEl = (name, [x0, y0], n, xParent) => {
        bones.push({ name, parent: 'res', pivot: [r4(x0), r4(y0), Z.res] });
        const digits = Array.from({ length: n }, (_, k) => Array.from({ length: 10 }, (_, d) => { const b = dig.plane(`${name}_d${k}_${d}`, name, [x0 + (k - (n - 1)) * dig.w, y0], Z.res - (k * 10 + d) * 0.021, d); bones.push(b); return b.name; }));
        elements[name] = { type: 'number', number: { source: '0', digits, hideLeadingZero: true } };
        // (its x: osu!'s "123x" — on its label's bone: a number element's own children are its numerals)
        const xs = P ? 1.7 : 0.85, xw = P ? 3 * xs : size.x[0] * xs, xat = [x0 + dig.w * 0.5 + xw * 0.6, y0 - (P ? xs * 0.5 : 0)];
        if (P) bones.push(modelBone(`${name}_x`, xParent, xat, cellOf('x'), xs, Z.res - 0.3, size.models.x));
        else bones.push(plane(`${name}_x`, xParent, xat, [xw, size.x[1] * xs], [A.at.x.x, A.at.x.y, A.at.x.w, A.at.x.h], Z.res - 0.3));
      };
      const nd = String(G.objects.length).length, top = T.osugame.createGame(G).start(0).fastForward(lastEnd + 100).state();
      // (the counts: 300 and 100 in the left column, 50 and miss in the right; each its judgement's picture)
      const cols = [RL + 16, RL + 72], rows = [PT - 44, PT - 63];
      [['300', 0], ['100', 1], ['50', 2], ['miss', 3]].forEach(([n, k]) => {
        const at = [cols[k >> 1], rows[k & 1]], id = `res${n}`;
        if (P) vox(`${id}_icon`, ['j300', 'j100', 'j50', 'jx'][k], 'res', at, Z.res, 1.2, { px: 1.5 });
        else { const c = cellOf('judgement', k), jw = size.judgement[0] * 0.95, jh = size.judgement[1] * 0.95; bones.push(plane(`${id}_icon`, 'res', at, [jw, jh], [c[0], c[1], A.at.judgement.w, A.at.judgement.h], Z.res)); imageEl(`${id}_icon`); }
        numberEl(id, [at[0] + 14 + (nd - 1) * dig.w, at[1]], nd, `${id}_icon`);
      });
      // (the max combo and the accuracy at the panel's foot, under their labels)
      const lab = (name, id, at) => (P ? vox(name, id, 'res', at, Z.res, 1, { px: 1.0 }) : flat(name, id, 'res', at, Z.res, size[id]));
      lab('reslabelcombo', P ? 'maxcombo' : 'ranking-maxcombo', [RL + 30, PB + 23]);
      lab('reslabelacc', P ? 'accuracy' : 'ranking-accuracy', [RL + 100, PB + 23]);
      const nc = String(Math.max(1, top.maxcombo)).length;
      numberEl('resmaxcombo', [RL + 22 + (nc - 1) * dig.w, PB + 11], nc, 'reslabelcombo');
      // (the grade: osu!'s letters, silver with HD or FL)
      if (P) vox('resrank', 'rank', 'res', [72, 144], Z.grade, 3, { px: 8, perPixel: true }); else flat('resrank', 'rank', 'res', [72, 144], Z.grade, size.rank);
      // (a full combo: osu!'s "perfect"; a new best of this player's)
      if (P) vox('resfc', 'fc', 'res', [72, 98], Z.stamp, 1.4, { px: 1.6 }); else flat('resfc', 'ranking-perfect', 'res', [72, 98], Z.stamp, size['ranking-perfect']);
      if (P) vox('resrecord', 'record', 'res', [72, 195], Z.stamp, 1.2, { px: 1.3 }); else flat('resrecord', 'record', 'res', [72, 195], Z.stamp, size.record);
      Object.assign(L0, { R: { RL, PT, PH, PW, PB, scoreTo: [RL + PW - 9, PT - 10], scoreScale: P ? 1.25 : 1.3, accTo: [RL + PW - 10, PB + 11], accScale: P ? 1.6 : 1.25 }, top });
    }
    // (the pixel look's models: no two of them share a plane where they overlap)
    if (P) settleDepths(bones);
    // ---- the timeline and the game
    const L = Object.assign({ pixel: P, C, bpm, colours: colours.length, coinFrame: coinPairs ? Object.fromEntries(coinPairs.map((p, f) => [pairKey(p), f])) : null, kiai: G.kiai, breaks: G.breaks, duration, music: opts.music || 'music', bodyFrame, bodyCentre, width: FW, comboDigitW: P ? 2.6 * 4 : size.score[0] * 1.25 * 0.92, flR: FLR }, L0);
    const doc = docOf(map, G, L);
    // (the tour rides on the game's config: the script plays its scenes)
    const tour = tourOf(G);
    G.tour = tour.scenes;
    const md = map.metadata || {};
    const design = { settings: Object.assign({ ns, name: opts.title || `${md.Title || 'osu!'} (${P ? 'pixel' : 'skin'})`, description: opts.description || 'GeoUI timeline: osu! (bds-lab)', bp: true }, opts.settings || {}),
      seed: opts.seed || `osu-${skin}`, bones, elements, textures: { atlas: { name: 'atlas', width: A.width, height: A.height, image: A.image } } };
    // (what the game needs: sounds the script plays — the hitsounds each object names and the gameplay's own)
    const sounds = [...new Set(G.objects.flatMap((g) => [...(g.hs || []), ...(g.es || []).flat()]).concat(Object.values(G.sounds).filter(Boolean)))];
    const info = { title: md.Title || '', artist: md.Artist || '', version: md.Version || '', bpm, duration, difficulty: diff, colours, counts: { circles: G.objects.filter((g) => g.k === 'c').length, sliders: G.objects.filter((g) => g.k === 's').length, spinners: G.objects.filter((g) => g.k === 'p').length,
      ticks: doc.sequences[0].instances.filter((x) => x.template === 'osu-tick').length, followpoints: doc.sequences[0].instances.filter((x) => x.template === 'osu-follow').length } };
    return { design, doc, game: G, info, sounds, atlas: A, warnings, tour };
  }

  // (an osu! skin's files this uses: its @2x pictures by these names — a skin with only 1x pictures is read as they are, doubled —
  //  and the hitsounds; bds/geoui/osu/fetch-skin.mjs keeps the Legacy skin's, the plugin reads a .osk or fetches the Legacy skin)
  const SKIN_IMAGES = ['hitcircle', 'hitcircleoverlay', 'approachcircle', ...Array.from({ length: 10 }, (_, d) => `default-${d}`), 'hit0', 'hit50', 'hit100', 'hit300', ...Array.from({ length: 10 }, (_, d) => `sliderb${d}`),
    'sliderfollowcircle', 'reversearrow', 'sliderscorepoint', 'followpoint', 'spinner-circle', 'spinner-approachcircle', 'spinner-clear', 'spinner-spin', 'spinner-rpm', ...Array.from({ length: 10 }, (_, d) => `score-${d}`),
    'score-x', 'score-percent', 'score-dot', 'scorebar-bg', 'scorebar-colour', 'cursor', 'lighting', 'ranking-X-small', 'ranking-S-small', 'ranking-A-small', 'ranking-B-small', 'ranking-C-small', 'ranking-D-small', 'section-pass', 'section-fail'];
  // (what a skin may have besides: the results' panel, words and big grades, the fail's retry button — drawn here where it has none)
  const SKIN_EXTRA = ['ranking-panel', 'ranking-title', 'ranking-maxcombo', 'ranking-accuracy', 'ranking-perfect', 'ranking-X', 'ranking-XH', 'ranking-S', 'ranking-SH', 'ranking-A', 'ranking-B', 'ranking-C', 'ranking-D', 'pause-retry'];
  const SKIN_SOUNDS = ['normal-hitnormal', 'normal-hitwhistle', 'normal-hitfinish', 'normal-hitclap', 'soft-hitnormal', 'soft-hitwhistle', 'soft-hitfinish', 'soft-hitclap', 'drum-hitnormal', 'drum-hitwhistle', 'drum-hitfinish', 'drum-hitclap', 'normal-slidertick', 'spinnerbonus', 'combobreak', 'failsound', 'applause'];
  const LEGACY_SKIN = 'https://raw.githubusercontent.com/ppy/osu-resources/46d344264e5938e168cfbbd2c8fab5f572ebeda4/osu.Game.Resources/Skins/Legacy/';
  /** a skin's picture named n where its @2x is missing: the 1x one doubled (osukit reads @2x sizes) */
  const as2x = (im) => resize(im, im.width * 2, im.height * 2);

  T.osukit = { build, tourOf, pixelSprites, textImage, strokeText, voxel, plane, atlasOf, resize, img, FONT, SKIN_IMAGES, SKIN_EXTRA, SKIN_SOUNDS, LEGACY_SKIN, as2x };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osukit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/osusong.js
(function (module) {
// GeoUI timeline — the lab's own song and beatmap for osu! (pure): "Cubic Pulse" (140 BPM, 40 bars, C major / A minor,
// vi–IV–I–V) in two arrangements — chiptune (pulse waves, a triangle bass, noise drums: the pixel look) and a modern synth (detuned
// saws, a sub bass, punchy drums, a pad, a delay: osu!'s own skin) — its chip hitsounds (blips), and a beatmap mapped to it
// (circles on the drums and the melody, sliders on long notes, streams on the fills, jumps in the kiai, a break, a spinner at
// the end). Deterministic (a seeded noise): the same numbers every time. bds/geoui/osu/music.mjs writes them as .ogg and .osu
// for the sample add-ons; the plugin makes them in the browser (osu! を丸ごと作る, the lab's song).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const BPM = 140, BEAT = 60 / BPM, BAR = BEAT * 4, BARS = 40, LEAD_IN = 1.0;   // (seconds: the song starts after a second of silence)
  const SONG = { title: 'Cubic Pulse', artist: 'bds-lab', bpm: BPM, bars: BARS };
  // (sections, in bars: what plays and what the map does)
  const SECTIONS = [
    { name: 'intro', from: 0, to: 4 }, { name: 'verse', from: 4, to: 12 }, { name: 'chorus', from: 12, to: 20, kiai: true },
    { name: 'break', from: 20, to: 24 }, { name: 'build', from: 24, to: 32 }, { name: 'chorus2', from: 32, to: 38, kiai: true }, { name: 'outro', from: 38, to: 40 },
  ];
  const sectionAt = (bar) => SECTIONS.find((s) => bar >= s.from && bar < s.to) || SECTIONS[SECTIONS.length - 1];
  // the chords, a bar each (vi IV I V): root (MIDI) and the triad
  const PROG = [[57, [57, 60, 64]], [53, [53, 57, 60]], [48, [48, 52, 55]], [55, [55, 59, 62]]];
  const chordAt = (bar) => PROG[bar % 4];
  // the hook: 4 bars of [beat, length (beats), MIDI] — sung over vi IV I V, in C major's pentatonic-ish shape
  const HOOK = [
    [0, 0.5, 76], [0.5, 0.5, 74], [1, 1, 72], [2, 0.5, 69], [2.5, 0.5, 72], [3, 1, 74],
    [4, 0.5, 72], [4.5, 0.5, 69], [5, 1.5, 65], [6.5, 0.5, 67], [7, 1, 69],
    [8, 0.5, 67], [8.5, 0.5, 69], [9, 1, 72], [10, 0.5, 76], [10.5, 0.5, 79], [11, 1, 76],
    [12, 0.75, 74], [12.75, 0.75, 72], [13.5, 0.5, 74], [14, 2, 71],
  ];
  // the verse's answer: lower, sparser
  const VERSE = [[0, 1.5, 69], [1.5, 0.5, 67], [2, 2, 64], [4, 1, 65], [5, 1, 69], [6, 2, 72], [8, 1.5, 67], [9.5, 0.5, 69], [10, 2, 72], [12, 1, 74], [13, 1, 71], [14, 2, 67]];
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const tOf = (bar, beat = 0) => LEAD_IN + bar * BAR + beat * BEAT;

  /** every note of the song: { t, len (s), m (MIDI), part: 'lead'|'bass'|'arp'|'pad'|'kick'|'snare'|'hat'|'crash'|'tom' , vel } */
  function score() {
    const notes = [], add = (o) => notes.push(o);
    for (let bar = 0; bar < BARS; bar++) {
      const sec = sectionAt(bar), [root, triad] = chordAt(bar), b = (beat) => tOf(bar, beat);
      const full = ['verse', 'chorus', 'build', 'chorus2'].includes(sec.name), kiai = Boolean(sec.kiai);
      // pad: always but in the outro's last bar; softer in the verse
      if (sec.name !== 'outro' || bar === 38) for (const m of triad) add({ t: b(0), len: BAR, m: m + 12, part: 'pad', vel: sec.name === 'break' ? 0.9 : kiai ? 0.55 : 0.45 });
      // bass: 8ths on the root (octave jumps in the kiai), held in the intro and the break
      if (full) for (let i = 0; i < 8; i++) add({ t: b(i / 2), len: BEAT / 2 * 0.9, m: root - 12 + (kiai && i % 2 ? 12 : 0), part: 'bass', vel: i % 2 ? 0.75 : 1 });
      else if (sec.name !== 'outro') add({ t: b(0), len: BAR, m: root - 12, part: 'bass', vel: 0.6 });
      // arpeggio: 16ths over the triad in the build and the kiai, 8ths in the verse
      if (full) { const step = sec.name === 'verse' ? 0.5 : 0.25, seq = [0, 1, 2, 1]; for (let k = 0; k * step < 4; k++) add({ t: b(k * step), len: BEAT * step * 0.8, m: triad[seq[k % 4]] + 24, part: 'arp', vel: 0.5 + (k % 4 === 0 ? 0.2 : 0) }); }
      // drums
      if (full || sec.name === 'intro' || sec.name === 'outro') {
        const kicks = kiai ? [0, 1, 2, 3] : sec.name === 'intro' ? [0, 2] : sec.name === 'outro' ? [0] : [0, 1.5, 2, 3.5];
        for (const k of kicks) add({ t: b(k), len: 0.3, m: 36, part: 'kick', vel: 1 });
        if (full) for (const k of [1, 3]) add({ t: b(k), len: 0.25, m: 38, part: 'snare', vel: 1 });
        if (full || sec.name === 'intro') for (let k = 0; k < 8; k++) add({ t: b(k / 2), len: 0.05, m: 42, part: 'hat', vel: k % 2 ? 0.55 : 0.8 });
        if (kiai) for (let k = 0; k < 4; k++) add({ t: b(k + 0.5), len: 0.08, m: 46, part: 'hat', vel: 0.6 });
      }
      // crash at each section's start (not the break's), a fill (16th snares, toms) in its last bar
      if (bar === sec.from && sec.name !== 'break' && bar > 0) add({ t: b(0), len: 1.5, m: 49, part: 'crash', vel: 1 });
      if (bar === sec.to - 1 && full) for (let k = 0; k < 4; k++) add({ t: b(3 + k / 4), len: 0.15, m: [50, 47, 45, 43][k], part: 'tom', vel: 0.9 });
      // melody: the hook in the kiai (and its last bar's long note), the verse's answer in the verse and the build (an octave up
      // in the build's second half)
      const phrase = kiai ? HOOK : ['verse', 'build'].includes(sec.name) ? VERSE : null;
      if (phrase) {
        const p0 = (bar - sec.from) % 4, up = sec.name === 'build' && bar >= 28 ? 12 : 0;
        for (const [beat, len, m] of phrase) if (beat >= p0 * 4 && beat < p0 * 4 + 4) add({ t: b(beat - p0 * 4), len: len * BEAT * 0.95, m: m + up, part: 'lead', vel: 0.9 });
      }
      if (sec.name === 'outro' && bar === 38) add({ t: b(0), len: BAR * 2, m: 72, part: 'lead', vel: 0.7 });
    }
    return notes.sort((a, b) => a.t - b.t);
  }

  // ---- synthesis (deterministic: a seeded noise)
  function noiseGen(seed = 1) { let s = seed >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296) * 2 - 1; }; }
  // (band-limited edges: polyBLEP — a naive saw or pulse folds its harmonics back down as a hiss)
  const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
  const sawB = (ph, dt) => { const p = ph - Math.floor(ph); return 2 * p - 1 - blep(p, dt); };
  const pulseB = (ph, duty, dt) => sawB(ph, dt) - sawB(ph + 1 - duty, dt);
  const env = (t, len, a, d, s, r) => (t < 0 ? 0 : t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : t < len ? s : t < len + r ? s * (1 - (t - len) / r) : 0);
  /** the song as PCM: arrangement 'chip' (mono, 22050 Hz) or 'synth' (stereo, 44100 Hz) → { rate, channels: [Float32Array] } */
  function render(arr = 'synth') {
    const rate = arr === 'chip' ? 22050 : 44100, dur = tOf(BARS) + 2.5, n = Math.ceil(dur * rate), L = new Float32Array(n), R = new Float32Array(n);
    const rnd = noiseGen(arr === 'chip' ? 7 : 11), notes = score();
    const put = (i, v, pan = 0) => { if (i >= 0 && i < n) { L[i] += v * (1 - Math.max(0, pan)); R[i] += v * (1 + Math.min(0, pan)); } };
    for (const nt of notes) {
      const i0 = Math.round(nt.t * rate), f = midiHz(nt.m);
      if (arr === 'chip') {
        const dtc = f / rate, pulse = (ph, duty) => pulseB(ph, duty, dtc);
        if (nt.part === 'lead') { const len = nt.len; for (let i = 0; i < (len + 0.08) * rate; i++) { const t = i / rate, vib = t > 0.15 ? Math.sin(t * 2 * Math.PI * 5.5) * 0.004 : 0; put(i0 + i, pulse(t * f * (1 + vib), 0.25) * 0.16 * nt.vel * env(t, len, 0.005, 0.05, 0.75, 0.06)); } }
        else if (nt.part === 'arp') { for (let i = 0; i < nt.len * rate; i++) { const t = i / rate; put(i0 + i, pulse(t * f, 0.125) * 0.07 * nt.vel * env(t, nt.len, 0.002, 0.04, 0.5, 0.01)); } }
        else if (nt.part === 'pad') { for (let i = 0; i < nt.len * rate; i++) { const t = i / rate; put(i0 + i, pulse(t * f, 0.5) * 0.025 * nt.vel * env(t, nt.len, 0.08, 0.2, 0.7, 0.1)); } }
        else if (nt.part === 'bass') { for (let i = 0; i < (nt.len + 0.02) * rate; i++) { const t = i / rate, ph = (t * f) % 1; put(i0 + i, (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) * 0.22 * nt.vel * env(t, nt.len, 0.003, 0.05, 0.85, 0.02)); } }
        else if (nt.part === 'kick') { let ph = 0; for (let i = 0; i < 0.18 * rate; i++) { const t = i / rate; ph += (55 + 180 * Math.exp(-t * 35)) / rate; put(i0 + i, (ph % 1 < 0.5 ? 1 : -1) * 0.3 * Math.exp(-t * 18)); } }
        else if (nt.part === 'snare') { let ph = 0; for (let i = 0; i < 0.16 * rate; i++) { const t = i / rate; ph += 190 / rate; put(i0 + i, (rnd() * 0.7 + (ph % 1 < 0.5 ? 0.3 : -0.3)) * 0.2 * Math.exp(-t * 22)); } }
        else if (nt.part === 'hat') { for (let i = 0; i < (nt.m === 46 ? 0.09 : 0.035) * rate; i++) { const t = i / rate; put(i0 + i, (rnd() > 0.6 ? 1 : -1) * 0.05 * nt.vel * Math.exp(-t * (nt.m === 46 ? 30 : 90))); } }
        else if (nt.part === 'crash') { for (let i = 0; i < 1.2 * rate; i++) { const t = i / rate; put(i0 + i, rnd() * 0.09 * Math.exp(-t * 3.2)); } }
        else if (nt.part === 'tom') { let ph = 0; for (let i = 0; i < 0.15 * rate; i++) { const t = i / rate; ph += (midiHz(nt.m) * 0.5 * (1 + Math.exp(-t * 20))) / rate; put(i0 + i, (ph % 1 < 0.5 ? 1 : -1) * 0.18 * Math.exp(-t * 16)); } }
      } else {
        const dts = f / rate, saw = (ph) => sawB(ph, dts * 1.01);
        if (nt.part === 'lead') {
          const det = [-0.12, -0.05, 0, 0.05, 0.12], len = nt.len; let lp = 0;
          for (let i = 0; i < (len + 0.25) * rate; i++) {
            const t = i / rate, vib = t > 0.18 ? Math.sin(t * 2 * Math.PI * 5.2) * 0.003 : 0;
            let v = 0; det.forEach((d, k) => { v += saw(t * f * Math.pow(2, d / 12) * (1 + vib) + k * 0.13); });
            lp += (v / det.length - lp) * 0.22;
            const e = env(t, len, 0.01, 0.12, 0.7, 0.22) * 0.18 * nt.vel;
            put(i0 + i, lp * e, -0.15); put(i0 + i, lp * e * 0.0, 0);
            // (a dotted-8th delay, quieter, panned the other way)
            put(i0 + i + Math.round(BEAT * 0.75 * rate), lp * e * 0.35, 0.5);
          }
        } else if (nt.part === 'arp') { let lp = 0; for (let i = 0; i < nt.len * rate; i++) { const t = i / rate, v = saw(t * f) * 0.5 + saw(t * f * 1.005) * 0.5; lp += (v - lp) * 0.22; put(i0 + i, lp * 0.07 * nt.vel * env(t, nt.len, 0.002, 0.06, 0.4, 0.02), (nt.m % 2 ? 0.45 : -0.45)); } }
        else if (nt.part === 'pad') {
          let lp = 0;
          for (let i = 0; i < (nt.len + 0.4) * rate; i++) { const t = i / rate, v = saw(t * f * 0.997) + saw(t * f * 1.004 + 0.3) + saw(t * f * 2.001 + 0.6) * 0.4; lp += (v - lp) * 0.04; put(i0 + i, lp * 0.05 * nt.vel * env(t, nt.len, 0.35, 0.3, 0.8, 0.4), Math.sin(t * 0.7) * 0.6); }
        } else if (nt.part === 'bass') {
          let lp = 0;
          for (let i = 0; i < (nt.len + 0.03) * rate; i++) { const t = i / rate, sub = Math.sin(2 * Math.PI * f * t), v = saw(t * f); lp += (v - lp) * (0.05 + 0.25 * Math.exp(-t * 18)); put(i0 + i, (sub * 0.5 + lp * 0.5) * 0.3 * nt.vel * env(t, nt.len, 0.004, 0.08, 0.8, 0.03)); }
        } else if (nt.part === 'kick') {
          let ph = 0;
          for (let i = 0; i < 0.35 * rate; i++) { const t = i / rate; ph += (48 + 150 * Math.exp(-t * 28)) / rate; put(i0 + i, (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 7) + (t < 0.004 ? rnd() * 0.5 : 0)) * 0.55); }
        } else if (nt.part === 'snare') {
          let lp = 0, ph = 0;
          for (let i = 0; i < 0.25 * rate; i++) { const t = i / rate, w = rnd(); lp += (w - lp) * 0.6; ph += 185 / rate; put(i0 + i, ((w - lp) * 0.8 * Math.exp(-t * 14) + Math.sin(2 * Math.PI * ph) * 0.5 * Math.exp(-t * 30)) * 0.32); }
        } else if (nt.part === 'hat') {
          let lp = 0;
          for (let i = 0; i < (nt.m === 46 ? 0.18 : 0.05) * rate; i++) { const t = i / rate, w = rnd(); lp += (w - lp) * 0.5; put(i0 + i, (w - lp) * 0.06 * nt.vel * Math.exp(-t * (nt.m === 46 ? 16 : 70)), 0.3); }
        } else if (nt.part === 'crash') {
          let lp = 0;
          for (let i = 0; i < 2.2 * rate; i++) { const t = i / rate, w = rnd(); lp += (w - lp) * 0.3; put(i0 + i, (w - lp) * 0.14 * Math.exp(-t * 1.8), (i % 2 ? 0.3 : -0.3)); }
        } else if (nt.part === 'tom') {
          let ph = 0;
          for (let i = 0; i < 0.3 * rate; i++) { const t = i / rate; ph += (midiHz(nt.m) * 0.5 * (1 + 0.6 * Math.exp(-t * 18))) / rate; put(i0 + i, Math.sin(2 * Math.PI * ph) * 0.35 * Math.exp(-t * 9)); }
        }
      }
    }
    // (a gentle bus: the kick ducks the pad and the arp a little; a soft clip; normalised to −1 dB)
    let peak = 0;
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
    const g = peak > 0 ? 0.89 / peak : 1;
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return { rate, channels: arr === 'chip' ? [L] : [L, R] };
  }

  /** the chip version's hitsounds (osu!'s names: normal-hitnormal, …-hitwhistle, …-hitfinish, …-hitclap, slidertick, combobreak,
   *  spinnerbonus) and the play's own (failsound: a fall down the scale; applause: a fanfare, the results'): short blips made here
   *  → { name: { rate, channels } } */
  function chipHitsounds() {
    const rate = 22050, out = {}, rnd = noiseGen(3);
    const make = (len, fn) => { const a = new Float32Array(Math.round(len * rate)); for (let i = 0; i < a.length; i++) a[i] = fn(i / rate, i); return { rate, channels: [a] }; };
    const sq = (ph, d = 0.5) => ((ph % 1) < d ? 1 : -1);
    out['normal-hitnormal'] = make(0.07, (t) => sq(t * (1320 - t * 6000), 0.5) * 0.45 * Math.exp(-t * 45));
    out['normal-hitwhistle'] = make(0.16, (t) => sq(t * (1760 + 400 * Math.sin(t * 90)), 0.25) * 0.3 * Math.exp(-t * 14));
    out['normal-hitfinish'] = make(0.6, (t) => (rnd() * 0.5 + sq(t * 330, 0.5) * 0.3 * Math.exp(-t * 10)) * 0.5 * Math.exp(-t * 5));
    out['normal-hitclap'] = make(0.12, (t) => rnd() * 0.5 * Math.exp(-t * 30));
    out['normal-slidertick'] = make(0.04, (t) => sq(t * 2640, 0.5) * 0.25 * Math.exp(-t * 80));
    out.combobreak = make(0.5, (t) => sq(t * (440 - t * 500), 0.5) * 0.35 * Math.exp(-t * 4));
    out.spinnerbonus = make(0.25, (t) => sq(t * (880 + t * 2400), 0.125) * 0.3 * Math.exp(-t * 9));
    // (the fail: a square wave sliding from 660 Hz to 82 Hz, wobbling — the phase summed so the slide stays smooth)
    let ph = 0;
    out.failsound = make(1.5, (t) => { const f = 82 + 578 * Math.pow(1 - t / 1.5, 2.2), v = 1 + 0.03 * Math.sin(t * 38); ph += (f * v) / rate; return sq(ph, 0.5) * 0.32 * Math.min(1, t * 60) * Math.exp(-t * 1.1); });
    // (the applause: C E G C' as 16ths up, then the chord held with a sparkle of noise)
    const ARP = [523.25, 659.26, 783.99, 1046.5];
    out.applause = make(1.6, (t) => { const k = Math.min(3, Math.floor(t / 0.09)), held = t >= 0.36; const tone = held ? ARP.reduce((a, f, i) => a + sq(t * f * (1 + i * 0.002), 0.25), 0) / 4 : sq(t * ARP[k], 0.25); return (tone * 0.34 * (held ? Math.exp(-(t - 0.36) * 1.8) : 1) + (held ? rnd() * 0.07 * Math.exp(-(t - 0.36) * 2.4) : 0)) * Math.min(1, t * 80); });
    return out;
  }

  // ---- the beatmap: objects on the music, placed by flowing patterns (osu! pixels: 512 x 384)
  const clampP = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  /** the beatmap for an arrangement: the .osu text (v14). The same rhythm for both (its sample set: soft for chip, normal for
   *  synth); AR 8.5, OD 7, CS 4, HP 5 */
  function beatmap(arr = 'synth', { version } = {}) {
    const ms = (t) => Math.round(t * 1000), bt = BEAT * 1000;
    const objs = [];   // { t (ms), kind: 'c'|'s'|'p', x, y, nc, hs, slider? }
    const lead = score().filter((n) => n.part === 'lead');
    // the cursor's flow: a slow Lissajous over the field — patterns are cut along it
    const flow = (t) => [256 + 170 * Math.sin(t * 0.61 + 0.5) * Math.cos(t * 0.13), 192 + 120 * Math.sin(t * 0.47 + 1.3)];
    let last = [256, 192];
    const place = (t, spacing, jump = false) => {
      const f = flow(t / 1000), dx = f[0] - last[0], dy = f[1] - last[1], d = Math.hypot(dx, dy) || 1;
      let p = [last[0] + (dx / d) * spacing, last[1] + (dy / d) * spacing];
      if (jump) p = [512 - last[0] + (f[0] - 256) * 0.3, 384 - last[1] + (f[1] - 192) * 0.3];
      if (p[0] < 40 || p[0] > 472 || p[1] < 40 || p[1] > 344) p = [last[0] - (dx / d) * spacing, last[1] - (dy / d) * spacing];
      p = [clampP(Math.round(p[0]), 32, 480), clampP(Math.round(p[1]), 32, 352)];
      last = p;
      return p;
    };
    const HS = { normal: 0, whistle: 2, finish: 4, clap: 8 };
    for (let bar = 0; bar < BARS; bar++) {
      const sec = sectionAt(bar), b0 = ms(tOf(bar)), kiai = Boolean(sec.kiai), newCombo = (bar - sec.from) % 2 === 0;
      if (sec.name === 'break') continue;
      if (sec.name === 'outro') {
        if (bar === 38) objs.push({ t: b0, kind: 'p', end: ms(tOf(39, 3)), nc: true, hs: HS.finish });
        continue;
      }
      const at = (beat) => b0 + Math.round(beat * bt);
      if (sec.name === 'intro') {
        // beats 1 and 3, a slider over the last two beats of every other bar
        const p0 = place(at(0), 110);
        objs.push({ t: at(0), kind: 'c', x: p0[0], y: p0[1], nc: newCombo, hs: bar === 0 ? HS.finish : 0 });
        if (bar % 2) { const p = place(at(2), 120); objs.push({ t: at(2), kind: 's', x: p[0], y: p[1], beats: 1.5, slides: 1, curve: 'B', hs: HS.whistle }); }
        else { const p = place(at(2), 120); objs.push({ t: at(2), kind: 'c', x: p[0], y: p[1], hs: 0 }); }
        continue;
      }
      // the bar's melody notes (their starts, in beats from the bar) and whether long
      const notes = lead.filter((n) => n.t >= tOf(bar) - 1e-6 && n.t < tOf(bar + 1) - 1e-6).map((n) => ({ beat: Math.round(((n.t - tOf(bar)) / BEAT) * 4) / 4, len: n.len / BEAT }));
      const used = new Set();
      let first = true;
      for (const n of notes) {
        if (used.has(n.beat)) continue;
        used.add(n.beat);
        const t = at(n.beat), hs = n.beat % 2 === 1 ? HS.clap : n.beat === 0 ? (kiai ? HS.finish : HS.whistle) : 0;
        if (n.len >= 1.4 && n.beat + 1 <= 4) {
          // a long note: a slider over it (a turn on the longest), along the flow
          const p = place(t, kiai ? 140 : 100), beats = Math.min(Math.floor(n.len * 2) / 2, 4 - n.beat);
          objs.push({ t, kind: 's', x: p[0], y: p[1], beats, slides: n.len >= 1.9 && kiai ? 2 : 1, curve: ['B', 'P', 'L', 'B'][objs.length % 4], hs, nc: first && newCombo });
          for (let k = n.beat + 0.5; k < n.beat + beats; k += 0.5) used.add(k);
        } else {
          const p = place(t, kiai ? (n.beat % 1 === 0 ? 150 : 90) : 80, kiai && n.beat % 2 === 0 && n.beat > 0);
          objs.push({ t, kind: 'c', x: p[0], y: p[1], hs, nc: first && newCombo });
        }
        first = false;
      }
      // the drums where the melody rests: the snares on 2 and 4 (and kicks in the kiai) as circles
      for (const beat of kiai ? [0, 1, 2, 3] : [1, 3]) if (![...used].some((u) => Math.abs(u - beat) < 0.49)) { const p = place(at(beat), kiai ? 130 : 90); objs.push({ t: at(beat), kind: 'c', x: p[0], y: p[1], hs: beat % 2 ? HS.clap : 0 }); used.add(beat); }
      // the fill in a section's last bar: a stream of 1/4s over beat 3 (four notes on an arc: the next bar's downbeat ends it)
      if (bar === sec.to - 1) {
        for (const u of [...used]) if (u >= 3) used.delete(u);
        for (let i = objs.length - 1; i >= 0 && objs[i].t >= at(3); i--) objs.splice(i, 1);
        const c = place(at(3), 60), a0 = Math.atan2(192 - c[1], 256 - c[0]);
        for (let k = 0; k < 4; k++) { const a = a0 + (k - 1.5) * 0.35, p = [clampP(Math.round(c[0] + Math.cos(a) * k * 22), 32, 480), clampP(Math.round(c[1] + Math.sin(a) * k * 22), 32, 352)]; objs.push({ t: at(3 + k / 4), kind: 'c', x: p[0], y: p[1], hs: k === 3 ? HS.whistle : 0 }); last = p; }
      }
    }
    objs.sort((a, b) => a.t - b.t);
    // (no two on the same moment; a slider's end not over the next one's start)
    const clean = [];
    for (const o of objs) { const p = clean[clean.length - 1]; if (p && o.t - (p.kind === 's' ? p.t + p.beats * p.slides * bt : p.kind === 'p' ? p.end : p.t) < bt / 4 - 2) continue; clean.push(o); }
    // the slider curves: from its head along the flow, its length from its beats (SliderMultiplier 1.6, SV 1)
    const SM = 1.6, pxPerBeat = SM * 100;
    const lines = [];
    for (const o of clean) {
      const type = (o.kind === 'c' ? 1 : o.kind === 's' ? 2 : 8) | (o.nc ? 4 : 0);
      if (o.kind === 'c') lines.push(`${o.x},${o.y},${o.t},${type},${o.hs},0:0:0:0:`);
      else if (o.kind === 'p') lines.push(`256,192,${o.t},${type},${o.hs},${o.end},0:0:0:0:`);
      else {
        const len = Math.round(o.beats * pxPerBeat), f = flow(o.t / 1000 + 0.4), dx = f[0] - o.x, dy = f[1] - o.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const end = [clampP(Math.round(o.x + ux * len * 0.85), 24, 488), clampP(Math.round(o.y + uy * len * 0.85), 24, 360)], nx = -uy, ny = ux, bend = (o.t / 97) % 2 < 1 ? 1 : -1;
        const mid = [clampP(Math.round((o.x + end[0]) / 2 + nx * len * 0.3 * bend), 16, 496), clampP(Math.round((o.y + end[1]) / 2 + ny * len * 0.3 * bend), 16, 368)];
        const pts = o.curve === 'L' ? [end] : o.curve === 'P' ? [mid, end] : [mid, end];
        const edge = Array.from({ length: o.slides + 1 }, (_, k) => (k === 0 ? o.hs : k === o.slides ? HS.finish * (o.slides > 1 ? 1 : 0) : HS.clap)).join('|');
        lines.push(`${o.x},${o.y},${o.t},${type},${o.hs},${o.curve}|${pts.map((p) => p.join(':')).join('|')},${o.slides},${len},${edge}`);
      }
    }
    const kiaiPts = [];
    for (const s of SECTIONS) {
      const t0 = ms(tOf(s.from)), t1 = ms(tOf(s.to));
      kiaiPts.push(`${t0},-100,4,${arr === 'chip' ? 2 : 1},0,${s.name === 'break' ? 40 : 70},0,${s.kiai ? 1 : 0}`);
      if (s.kiai) kiaiPts.push(`${t1},-100,4,${arr === 'chip' ? 2 : 1},0,70,0,0`);
    }
    const brk = SECTIONS.find((s) => s.name === 'break'), bs = ms(tOf(brk.from)) + 400, be = ms(tOf(brk.to)) - 600;
    return ['osu file format v14', '', '[General]', `AudioFilename: ${arr === 'chip' ? 'cubic_pulse_chip' : 'cubic_pulse'}.ogg`, 'AudioLeadIn: 0', 'PreviewTime: ' + ms(tOf(12)), 'Countdown: 0', `SampleSet: ${arr === 'chip' ? 'Soft' : 'Normal'}`, 'StackLeniency: 0.7', 'Mode: 0', '',
      '[Metadata]', `Title:${SONG.title}${arr === 'chip' ? ' (8-bit)' : ''}`, `Artist:${SONG.artist}`, 'Creator:bds-lab', `Version:${version || (arr === 'chip' ? 'Pixel' : 'Skin')}`, 'Source:GeoUI timeline', 'Tags:bds-lab geoui minecraft', '',
      '[Difficulty]', 'HPDrainRate:5', 'CircleSize:4', 'OverallDifficulty:7', 'ApproachRate:8.5', `SliderMultiplier:${SM}`, 'SliderTickRate:2', '',
      '[Events]', `2,${bs},${be}`, '', '[TimingPoints]', `${ms(LEAD_IN)},${(bt).toFixed(6)},4,${arr === 'chip' ? 2 : 1},0,70,1,0`, ...kiaiPts, '',
      '[Colours]', ...(arr === 'chip' ? ['Combo1 : 255,92,92', 'Combo2 : 92,220,255', 'Combo3 : 255,214,64', 'Combo4 : 140,255,110'] : ['Combo1 : 255,192,0', 'Combo2 : 0,202,0', 'Combo3 : 18,124,255', 'Combo4 : 242,24,57']), '',
      '[HitObjects]', ...lines, ''].join('\r\n');
  }

  T.osusong = { BPM, BEAT, BAR, BARS, LEAD_IN, SONG, SECTIONS, score, render, chipHitsounds, beatmap };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osusong;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/presets.js
(function (module) {
// GeoUI timeline — presets (pure): the moves a video editor offers ready-made, and a rhythm game's, as fragments of a
// sequence ({ tracks, markers }, times from 0) for the intent preset.apply (placed at the playhead). Each on one element.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const k = (t, v, ease) => (ease ? { t, v, ease } : { t, v });
  const clip = (start, end, extra) => Object.assign({ start, end, channels: {} }, extra);
  const one = (o, name, clips) => ({ tracks: [{ kind: 'layer', target: String(o.target || ''), name: `${name}${o.target ? `: ${o.target}` : ''}`, clips }], markers: [] });

  const PRESETS = [
    { id: 'title', name: 'タイトル', about: 'フェードイン・少し寄る・保つ・フェードアウト', options: { duration: 3, fade: 0.4 },
      make: (o) => one(o, 'タイトル', [clip(0, o.duration, { transitionIn: { kind: 'fade', duration: o.fade, ease: 'quad-out' }, transitionOut: { kind: 'fade', duration: o.fade, ease: 'quad-in' },
        channels: { scaleX: [k(0, 0.95, 'cubic-out'), k(o.duration, 1)], scaleY: [k(0, 0.95, 'cubic-out'), k(o.duration, 1)] } })]) },
    { id: 'lower-third', name: '名前のテロップ', about: '左から滑り込み、保ち、左へ出る', options: { duration: 4, slide: 0.45 },
      make: (o) => one(o, '名前のテロップ', [clip(0, o.duration, { transitionIn: { kind: 'slide-left', duration: o.slide, ease: 'cubic-out' }, transitionOut: { kind: 'slide-left', duration: o.slide, ease: 'cubic-in' } })]) },
    { id: 'score-pop', name: '点数のポップ', about: '値を数え上げ、ポンと出る（数字の要素）', options: { duration: 1.5, from: 0, to: 1000, count: 0.8 },
      make: (o) => one(o, '点数のポップ', [clip(0, o.duration, { transitionIn: { kind: 'pop', duration: 0.3, ease: 'linear' }, channels: { value: [k(0, o.from, 'quad-out'), k(o.count, o.to)] } })]) },
    { id: 'countdown', name: 'カウントダウン', about: '3・2・1（数字の要素。1 つずつ寄って消える）', options: { from: 3, step: 1 },
      make: (o) => one(o, 'カウントダウン', Array.from({ length: Math.max(1, Math.round(o.from)) }, (_, i) => clip(i * o.step, (i + 1) * o.step, {
        channels: { value: [k(0, Math.round(o.from) - i)], scaleX: [k(0, 1.6, 'back-out'), k(o.step * 0.4, 1)], scaleY: [k(0, 1.6, 'back-out'), k(o.step * 0.4, 1)], opacity: [k(0, 1), k(o.step * 0.75, 1, 'quad-in'), k(o.step, 0)] } }))) },
    { id: 'toast', name: '通知', about: '上から出て、少し保ち、消える', options: { duration: 2.5 },
      make: (o) => one(o, '通知', [clip(0, o.duration, { transitionIn: { kind: 'slide-up', duration: 0.35, ease: 'back-out' }, transitionOut: { kind: 'fade', duration: 0.4, ease: 'linear' } })]) },
    { id: 'progress', name: '進むゲージ', about: 'ゲージを 0 から 1 へ（ゲージの要素）', options: { duration: 3, ease: 'linear' },
      make: (o) => one(o, '進むゲージ', [clip(0, o.duration, { channels: { fill: [k(0, 0, o.ease), k(o.duration, 1)] } })]) },
    { id: 'blink', name: '点滅', about: '一定の間隔で消えては出る', options: { duration: 2, period: 0.5 },
      make: (o) => one(o, '点滅', [clip(0, o.duration, { channels: { opacity: Array.from({ length: Math.max(1, Math.ceil(o.duration / (o.period / 2))) }, (_, i) => k((i * o.period) / 2, i % 2 ? 0 : 1, 'step')) } })]) },
    { id: 'shake', name: '揺れ', about: '左右に揺れて収まる', options: { duration: 0.6, amplitude: 4, times: 6 },
      make: (o) => one(o, '揺れ', [clip(0, o.duration, { channels: { x: [...Array.from({ length: o.times }, (_, i) => k((i * o.duration) / o.times, (i % 2 ? -1 : 1) * o.amplitude * (1 - i / o.times), 'sine-inout')), k(o.duration, 0)] } })]) },
    { id: 'hit-burst', name: 'ヒットの弾け', about: '広がりながら消える（当たった時に: trigger hit）', options: { duration: 0.3, scale: 1.5, trigger: 'hit' },
      make: (o) => one(o, 'ヒットの弾け', [clip(0, o.duration, Object.assign(o.trigger ? { trigger: o.trigger } : {}, { channels: { scaleX: [k(0, 1, 'quad-out'), k(o.duration, o.scale)], scaleY: [k(0, 1, 'quad-out'), k(o.duration, o.scale)], opacity: [k(0, 1, 'quad-in'), k(o.duration, 0)] } }))]) },
    { id: 'combo-pop', name: 'コンボのポップ', about: '大きく出て元の大きさへ（数字の要素）', options: { duration: 0.25, scale: 1.3 },
      make: (o) => one(o, 'コンボのポップ', [clip(0, o.duration, { channels: { scaleX: [k(0, o.scale, 'back-out'), k(o.duration, 1)], scaleY: [k(0, o.scale, 'back-out'), k(o.duration, 1)] } })]) },
    { id: 'judgement', name: '判定の文字', about: '少し上がりながら消える（300・100・50・miss）', options: { duration: 0.6, rise: 8 },
      make: (o) => one(o, '判定の文字', [clip(0, o.duration, { channels: { y: [k(0, 0, 'quad-out'), k(o.duration, o.rise)], opacity: [k(0, 1), k(o.duration * 0.5, 1, 'quad-in'), k(o.duration, 0)] } })]) },
  ];
  const byId = new Map(PRESETS.map((p) => [p.id, p]));
  /** the presets: [{ id, name, about, options }] (options: their defaults) */
  const presetList = () => PRESETS.map(({ make: _m, ...p }) => ({ ...p, options: { ...p.options } }));
  /** a preset made for an element → the fragment preset.apply takes. opts: target (the element's name) and the preset's options */
  function makePreset(id, opts = {}) {
    const p = byId.get(id);
    if (!p) throw new Error(`プリセット「${id}」はありません（${PRESETS.map((x) => x.id).join('・')}）`);
    const o = { target: opts.target };
    for (const [key, d] of Object.entries(p.options)) o[key] = typeof d === 'number' ? Math.max(0, num(opts[key], d)) : opts[key] !== undefined ? opts[key] : d;
    if ('duration' in o) o.duration = Math.max(0.05, o.duration);
    return p.make(o);
  }

  T.presets = { presetList, makePreset };
  if (typeof module === 'object' && module && module.exports) module.exports = T.presets;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/view.js
(function (module) {
// GeoUI timeline — the timeline panel's geometry and gestures (pure: no DOM). Time ↔ px, the rows (tracks, the instances'
// lane, the ruler), the rectangles of clips, keys, markers and instances, what is under a point, the snap candidates, and a
// drag as a small state machine that ends in an intent for store.dispatch (bds/geoui/timeline/PLAN.md step 5).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const EDGE = 6, KEY = 5;

  /** a view: how much time a pixel is, where it starts, the panel's size and its fixed parts */
  function createView(o = {}) {
    return { pxPerSec: num(o.pxPerSec, 120), scroll: num(o.scroll, 0), width: num(o.width, 800), height: num(o.height, 240), headerW: num(o.headerW, 150), rulerH: num(o.rulerH, 24), rowH: num(o.rowH, 30), laneH: num(o.laneH, 20), top: num(o.top, 0) };
  }
  const timeToX = (v, t) => v.headerW + (t - v.scroll) * v.pxPerSec;
  const xToTime = (v, x) => v.scroll + (x - v.headerW) / v.pxPerSec;
  /** the time span the panel shows */
  const visibleRange = (v) => [v.scroll, xToTime(v, v.width)];
  /** zoomed by f around the time under x (that time stays under x); 10 px a second … 4000 */
  function zoom(v, f, x = v.headerW) {
    const t = xToTime(v, x), pxPerSec = Math.min(4000, Math.max(10, v.pxPerSec * f));
    return { ...v, pxPerSec, scroll: Math.max(0, t - (x - v.headerW) / pxPerSec) };
  }
  /** the whole sequence in view */
  const fit = (v, duration) => ({ ...v, scroll: 0, pxPerSec: Math.min(4000, Math.max(10, (v.width - v.headerW - 20) / Math.max(0.1, duration))) });
  /** a scroll by dx px (never before 0) */
  const pan = (v, dx) => ({ ...v, scroll: Math.max(0, v.scroll + dx / v.pxPerSec) });
  /** where the ruler's ticks go: a step in seconds that leaves ≥ 60 px between labels (frames, then seconds, then minutes) */
  function tickStep(v, fps = 20) {
    const steps = [1 / fps, 2 / fps, 5 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    return steps.find((s) => s * v.pxPerSec >= 60) || 600;
  }

  /** the rows: the sequence's tracks (or a template's, when one is open), then the instances' lane when it has instances.
   *  → [{ kind: 'track' | 'lane', track?, y, h }] (y from the panel's top: under the ruler) */
  function rows(v, seq, { template } = {}) {
    const out = [], tpl = template && (seq.templates || []).find((x) => x.id === template), tracks = tpl ? tpl.tracks : seq.tracks || [];
    let y = v.rulerH - v.top;
    for (const track of tracks) { out.push({ kind: 'track', track, y, h: v.rowH }); y += v.rowH; }
    if (!tpl && (seq.instances || []).length) out.push({ kind: 'lane', y, h: v.laneH });
    return out;
  }
  const clipTimes = (c, params) => [typeof c.start === 'string' ? T.model.timeOf(c.start, params) : c.start, typeof c.end === 'string' ? T.model.timeOf(c.end, params) : c.end];
  /** the clips' rectangles (a template's clips around its 0: their times as written, an expression's at params 0) */
  function clipRects(v, rs) {
    const out = [];
    for (const r of rs) if (r.kind === 'track') for (const c of r.track.clips) {
      const [s, e] = clipTimes(c, {});
      out.push({ id: c.id, track: r.track.id, clip: c, x0: timeToX(v, s), x1: timeToX(v, e), y0: r.y + 3, y1: r.y + r.h - 3 });
    }
    return out;
  }
  /** the keys' diamonds: per clip, each channel's keys at their time (a diamond per time: the props there listed) */
  function keyRects(v, rects) {
    const out = [];
    for (const cr of rects) {
      const at = new Map();
      for (const [prop, ks] of Object.entries(cr.clip.channels || {})) ks.forEach((k, index) => { const key = Math.round(k.t * 1e6); if (!at.has(key)) at.set(key, { t: k.t, keys: [] }); at.get(key).keys.push({ clip: cr.id, prop, index }); });
      for (const { t, keys } of at.values()) { const s = clipTimes(cr.clip, {})[0], x = timeToX(v, s + t); out.push({ x, y: (cr.y0 + cr.y1) / 2, t: s + t, keys, clip: cr.id }); }
    }
    return out;
  }
  /** the instances in [t0, t1] by binary search (the list is in time order): thousands cost only what is seen */
  function instancesIn(seq, t0, t1) {
    const xs = seq.instances || [];
    let lo = 0, hi = xs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m].t < t0) lo = m + 1; else hi = m; }
    const out = [];
    for (let i = lo; i < xs.length && xs[i].t <= t1; i++) out.push(xs[i]);
    return out;
  }
  /** what is under (x, y): the ruler, a track's header (its name, mute, solo, lock), a clip's body or edge, a key, a marker,
   *  an instance, or nothing (a track's empty part) */
  function hitTest(v, seq, rs, x, y, opts = {}) {
    if (y < v.rulerH) {
      for (const m of seq.markers || []) if (Math.abs(timeToX(v, m.t) - x) <= 5) return { kind: 'marker', id: m.id, t: m.t };
      return { kind: 'ruler', t: xToTime(v, x) };
    }
    const r = rs.find((q) => y >= q.y && y < q.y + q.h);
    if (!r) return { kind: 'empty', t: xToTime(v, x) };
    if (x < v.headerW) {
      if (r.kind !== 'track') return { kind: 'header', row: r.kind };
      const b = v.headerW - x;
      return { kind: b <= 20 ? 'lock' : b <= 40 ? 'solo' : b <= 60 ? 'mute' : 'header', track: r.track.id };
    }
    if (r.kind === 'lane') {
      const [t0, t1] = [xToTime(v, x - 4), xToTime(v, x + 4)], near = instancesIn(seq, t0, t1);
      return near.length ? { kind: 'instance', id: near[0].id, t: near[0].t } : { kind: 'empty', t: xToTime(v, x), lane: true };
    }
    const rects = clipRects(v, [r]);
    if (opts.keys !== false) for (const k of keyRects(v, rects)) if (Math.abs(k.x - x) <= KEY && Math.abs(k.y - y) <= KEY) return { kind: 'key', clip: k.clip, keys: k.keys, t: k.t, track: r.track.id };
    for (const cr of rects) {
      if (x < cr.x0 - 1 || x > cr.x1 + 1 || y < cr.y0 || y > cr.y1) continue;
      const edge = cr.x1 - cr.x0 > 3 * EDGE ? EDGE : (cr.x1 - cr.x0) / 3;
      if (x - cr.x0 <= edge) return { kind: 'clip-start', id: cr.id, track: r.track.id };
      if (cr.x1 - x <= edge) return { kind: 'clip-end', id: cr.id, track: r.track.id };
      return { kind: 'clip', id: cr.id, track: r.track.id };
    }
    return { kind: 'empty', t: xToTime(v, x), track: r.track.id };
  }
  /** the times a drag snaps to (all of them, for drawing a guide): clip edges, keys, markers, the playhead */
  function snapTimes(seq, rs, playhead, skip = new Set()) {
    const out = new Set();
    for (const r of rs) if (r.kind === 'track') for (const c of r.track.clips) {
      if (skip.has(c.id)) continue;
      const [s, e] = clipTimes(c, {});
      out.add(s); out.add(e);
      for (const ks of Object.values(c.channels || {})) for (const k of ks) out.add(s + k.t);
    }
    for (const m of seq.markers || []) out.add(m.t);
    if (Number.isFinite(playhead)) out.add(playhead);
    return [...out].sort((a, b) => a - b);
  }

  /** a drag from a hit (hitTest's) at x, y → { move(x, y, mods) → { preview }, up(x, y, mods) → intent | { seek } | { select } |
   *  null }. mods: { alt (no snapping), shift (add to the selection) }. ctx: { view, seq, rows, selection: { clips, keys,
   *  instances }, playhead, beatDiv, template } */
  function createDrag(hit, x0, y0, ctx) {
    const v = ctx.view, seqId = ctx.seq.id, dtOf = (x) => (x - x0) / v.pxPerSec, base = { seq: seqId, ...(ctx.template ? { template: ctx.template } : {}) };
    const snap = (mods) => ({ snap: !(mods && mods.alt), snapTol: 8 / v.pxPerSec, playhead: ctx.playhead, ...(ctx.beatDiv ? { beatDiv: ctx.beatDiv } : {}) });
    const sel = ctx.selection || { clips: [], keys: [], instances: [] };
    let moved = false;
    const far = (x, y) => moved || (moved = Math.abs(x - x0) > 3 || Math.abs(y - y0) > 3);
    if (hit.kind === 'ruler' || (hit.kind === 'empty' && hit.lane)) return { move: (x) => ({ seek: Math.max(0, xToTime(v, x)) }), up: (x) => ({ seek: Math.max(0, xToTime(v, x)) }) };
    if (hit.kind === 'clip' || hit.kind === 'clip-start' || hit.kind === 'clip-end') {
      const ids = sel.clips && sel.clips.includes(hit.id) ? sel.clips : [hit.id];
      const rowOf = (y) => ctx.rows.findIndex((r) => y >= r.y && y < r.y + r.h), r0 = rowOf(y0);
      return {
        move: (x, y) => (far(x, y) ? { preview: { ids, dt: dtOf(x), dTrack: hit.kind === 'clip' && rowOf(y) >= 0 ? rowOf(y) - r0 : 0, edge: hit.kind } } : null),
        up: (x, y, mods) => {
          if (!far(x, y)) return { select: { clips: mods && mods.shift ? [...new Set([...(sel.clips || []), hit.id])] : [hit.id] } };
          if (hit.kind === 'clip') return { ...base, type: 'clip.move', ids, dt: dtOf(x), dTrack: rowOf(y) >= 0 ? rowOf(y) - r0 : 0, ...snap(mods) };
          return { ...base, type: 'clip.trim', id: hit.id, edge: hit.kind === 'clip-start' ? 'start' : 'end', t: xToTime(v, x), ...snap(mods) };
        },
      };
    }
    if (hit.kind === 'key') return {
      move: (x, y) => (far(x, y) ? { preview: { keys: hit.keys, dt: dtOf(x) } } : null),
      up: (x, y, mods) => (far(x, y) ? { ...base, type: 'key.move', keys: hit.keys, dt: dtOf(x) } : { select: { keys: mods && mods.shift ? [...(sel.keys || []), ...hit.keys] : hit.keys, clips: [hit.clip] }, seek: hit.t }),
    };
    if (hit.kind === 'marker') return {
      move: (x, y) => (far(x, y) ? { preview: { marker: hit.id, t: Math.max(0, hit.t + dtOf(x)) } } : null),
      up: (x, y) => (far(x, y) ? { ...base, type: 'marker.set', id: hit.id, patch: { t: Math.max(0, hit.t + dtOf(x)) } } : { seek: hit.t }),
    };
    if (hit.kind === 'instance') {
      const ids = sel.instances && sel.instances.includes(hit.id) ? sel.instances : [hit.id];
      return {
        move: (x, y) => (far(x, y) ? { preview: { instances: ids, dt: dtOf(x) } } : null),
        up: (x, y, mods) => (far(x, y) ? { seq: seqId, type: 'instance.move', ids, dt: dtOf(x) } : { select: { instances: mods && mods.shift ? [...new Set([...(sel.instances || []), hit.id])] : [hit.id] }, seek: hit.t }),
      };
    }
    if (hit.kind === 'empty') {
      // (a box from an empty place: what it covers is selected; a click there clears the selection and moves the playhead)
      return {
        move: (x, y) => (far(x, y) ? { preview: { box: [Math.min(x0, x), Math.min(y0, y), Math.max(x0, x), Math.max(y0, y)] } } : null),
        up: (x, y) => {
          if (!far(x, y)) return { select: { clips: [], keys: [], instances: [] }, seek: Math.max(0, xToTime(v, x)) };
          const [a, b, c, d] = [Math.min(x0, x), Math.min(y0, y), Math.max(x0, x), Math.max(y0, y)], rects = clipRects(v, ctx.rows);
          return { select: { clips: rects.filter((r) => r.x1 >= a && r.x0 <= c && r.y1 >= b && r.y0 <= d).map((r) => r.id), keys: keyRects(v, rects).filter((k) => k.x >= a && k.x <= c && k.y >= b && k.y <= d).flatMap((k) => k.keys) } };
        },
      };
    }
    return { move: () => null, up: () => null };
  }

  T.view = { createView, timeToX, xToTime, visibleRange, zoom, fit, pan, tickStep, rows, clipRects, keyRects, instancesIn, hitTest, snapTimes, createDrag, EDGE };
  if (typeof module === 'object' && module && module.exports) module.exports = T.view;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/timeline.js
(function (module) {
/* global document */
// GeoUI timeline — the timeline panel (DOM and canvas): a toolbar (transport, timecode, snapping, the beat grid, zoom), the
// ruler with timecode and bars, the tracks with their clips, keys and transitions, the instances' lane, markers, the in/out
// range and the playhead. It never changes the document itself: every edit is an intent for store.dispatch, made by view.js
// (bds/geoui/timeline/PLAN.md step 5). mount(el, store) → { unmount, redraw, view }
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const COLORS = { bg: '#1e1f24', header: '#26272e', row: '#23242a', rowAlt: '#202127', grid: '#2e3038', beat: '#34363f', bar: '#4a4d58', text: '#cfd2da', dim: '#8b8f9a',
    clip: '#3b6fd6', clipSel: '#6f9bff', clipText: '#ffffff', audio: '#2f9e6b', key: '#ffcf4a', keySel: '#ffffff', marker: '#ff7a59', playhead: '#ff4d4d', inout: 'rgba(255,255,255,0.06)',
    lane: '#2b2c33', inst: '#c58cff', instSel: '#ffffff', ghost: 'rgba(255,255,255,0.25)', box: 'rgba(111,155,255,0.25)', trans: 'rgba(255,255,255,0.35)', muted: '#555a66' };
  const h = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of [].concat(kids)) e.append(c); return e; };

  function mount(el, store, opts = {}) {
    const V = T.view, M = T.model, state = { view: V.createView({ width: el.clientWidth || 800, height: el.clientHeight || 240 }), template: null, drag: null, preview: null, snap: true, beatDiv: 4, raf: 0, menu: null };
    const seqOf = () => { const doc = store.doc(), sel = store.selection(); return (doc.sequences || []).find((s) => s.id === (sel && sel.seq)) || (doc.sequences || [])[0] || null; };
    const tc = h('span', { style: 'font: 12px monospace; color: #fff; min-width: 84px; display: inline-block' });
    const btn = (label, title, fn) => h('button', { title, style: 'background:#33353d;color:#ddd;border:0;border-radius:3px;margin-right:4px;padding:2px 7px;cursor:pointer', onclick: (e) => { e.preventDefault(); fn(); canvas.focus(); } }, label);
    const snapBox = h('input', { type: 'checkbox', checked: '', title: '吸い付く（Alt を押しながらドラッグで外す）', onchange: () => { state.snap = snapBox.checked; } });
    const divSel = h('select', { title: '拍の分け方（1〜6 のキー）', style: 'background:#33353d;color:#ddd;border:0', onchange: () => { state.beatDiv = Number(divSel.value); draw(); } }, [1, 2, 3, 4, 6, 8, 12, 16].map((d) => h('option', d === 4 ? { value: d, selected: '' } : { value: d }, `1/${d}`)));
    const crumb = h('span', { class: 'geoui-tl-crumb', style: 'color:#9cf;margin-left:8px;cursor:pointer', onclick: () => { state.template = null; draw(); } });
    const bar = h('div', { style: 'display:flex;align-items:center;gap:2px;padding:3px 6px;background:#18191d;border-bottom:1px solid #2e3038;font:12px sans-serif;color:#ccc' }, [
      btn('⏮', '頭へ（Home）', () => store.seek(inOut()[0])), btn('◀◀', '1 コマ戻る（←）', () => step(-1)), btn('▶ / ❚❚', '再生・停止（Space）', () => store.transport.toggle()),
      btn('▶▶', '1 コマ進む（→）', () => step(1)), btn('■', '止めて頭へ', () => { store.transport.stop(); }), tc,
      h('label', { style: 'margin-left:8px' }, [snapBox, ' 吸い付く']), h('span', { style: 'margin-left:8px' }, '拍 '), divSel,
      btn('－', '縮める（-）', () => zoomBy(1 / 1.25)), btn('＋', '広げる（+）', () => zoomBy(1.25)), btn('全体', '全体を見る（\\）', () => { const s = seqOf(); if (s) { state.view = V.fit(state.view, s.duration); draw(); } }), crumb]);
    const canvas = h('canvas', { tabindex: '0', style: 'display:block;outline:none;cursor:default' });
    const wrap = h('div', { class: 'geoui-timeline', style: 'display:flex;flex-direction:column;width:100%;height:100%;background:#1e1f24;user-select:none' }, [bar, canvas]);
    el.append(wrap);
    const ctx = canvas.getContext('2d');
    const inOut = () => { const s = seqOf(); return s ? s.inOut || [0, s.duration] : [0, 0]; };
    const fpsOf = () => (seqOf() || {}).fps || 20;
    function step(n) { store.seek(Math.max(0, Math.round((store.time() + n / fpsOf()) * fpsOf()) / fpsOf())); }
    function zoomBy(f, x) { state.view = V.zoom(state.view, f, x === undefined ? V.timeToX(state.view, store.time()) : x); draw(); }
    function resize() {
      const r = wrap.getBoundingClientRect(), w = Math.max(200, Math.floor(r.width || el.clientWidth || 800)), hgt = Math.max(80, Math.floor((r.height || el.clientHeight || 240) - bar.offsetHeight)), dpr = root.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = hgt * dpr; canvas.style.width = `${w}px`; canvas.style.height = `${hgt}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.view = { ...state.view, width: w, height: hgt };
    }
    const draw = () => { if (!state.raf) state.raf = (root.requestAnimationFrame || ((f) => setTimeout(f, 16)))(() => { state.raf = 0; paint(); }); };
    function paint() {
      const v = state.view, seq = seqOf(), W = v.width, H = v.height;
      ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);
      tc.textContent = M.timecode(store.time(), fpsOf());
      crumb.textContent = state.template && seq ? `▸ テンプレート「${((seq.templates || []).find((x) => x.id === state.template) || {}).name || state.template}」（クリックで戻る）` : '';
      if (!seq) { ctx.fillStyle = COLORS.dim; ctx.font = '13px sans-serif'; ctx.fillText('シーケンスがありません（GeoUI → シーケンスを足す）', 16, 40); return; }
      const rs = V.rows(v, seq, { template: state.template }), sel = store.selection() || {}, selClips = new Set(sel.clips || []), selInst = new Set(sel.instances || []);
      const selKeys = new Set((sel.keys || []).map((k) => `${k.clip}/${k.prop}/${k.index}`));
      const [t0, t1] = V.visibleRange(v), X = (t) => V.timeToX(v, t);
      // rows
      rs.forEach((r, i) => { ctx.fillStyle = r.kind === 'lane' ? COLORS.lane : i % 2 ? COLORS.rowAlt : COLORS.row; ctx.fillRect(v.headerW, r.y, W - v.headerW, r.h); });
      // the beat grid (from the tempo; the beat division's lines fainter) and the in/out range
      if (M.tempoOf) {
        const b0 = Math.floor(M.beatAt(seq, Math.max(0, t0)) * state.beatDiv), b1 = Math.ceil(M.beatAt(seq, t1) * state.beatDiv);
        if (b1 - b0 < (W - v.headerW) / 3) for (let b = b0; b <= b1; b++) {
          const t = M.timeAtBeat(seq, b / state.beatDiv), x = X(t);
          if (x < v.headerW) continue;
          ctx.fillStyle = b % state.beatDiv ? COLORS.grid : M.barBeat(seq, t).beat === 1 ? COLORS.bar : COLORS.beat;
          ctx.fillRect(Math.round(x), v.rulerH, 1, H - v.rulerH);
        }
      }
      const [ia, ib] = inOut();
      if (seq.inOut) { ctx.fillStyle = COLORS.inout; ctx.fillRect(Math.max(v.headerW, X(ia)), v.rulerH, X(ib) - Math.max(v.headerW, X(ia)), H - v.rulerH); }
      // clips, their transitions and keys; audio clips with the sound's waveform
      const rects = V.clipRects(v, rs), media = (store.media && store.media()) || [], pv = state.preview;
      for (const r of rects) {
        if (r.x1 < v.headerW || r.x0 > W) continue;
        const track = rs.find((q) => q.track && q.track.id === r.track).track, isAudio = track.kind === 'audio';
        let x0 = r.x0, x1 = r.x1, y0 = r.y0;
        if (pv && pv.ids && pv.ids.includes(r.id)) {
          const d = pv.dt * v.pxPerSec;
          if (pv.edge === 'clip-start') x0 += d; else if (pv.edge === 'clip-end') x1 += d; else { x0 += d; x1 += d; y0 += (pv.dTrack || 0) * v.rowH; }
        }
        ctx.fillStyle = track.muted ? COLORS.muted : isAudio ? COLORS.audio : selClips.has(r.id) ? COLORS.clipSel : COLORS.clip;
        ctx.fillRect(Math.max(v.headerW, x0), y0, x1 - Math.max(v.headerW, x0), r.y1 - r.y0);
        if (isAudio) {
          const m = media.find((x) => x.id === r.clip.sound), pk = m && m.peaks;
          if (pk && pk.length && m.duration > 0) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; for (let x = Math.max(v.headerW, x0); x < x1; x += 2) { const tt = (x - x0) / v.pxPerSec + (r.clip.offset || 0), p = pk[Math.min(pk.length - 1, Math.floor((tt / m.duration) * pk.length))] || 0, hh = p * (r.y1 - r.y0) / 2; ctx.fillRect(x, (y0 + r.y1) / 2 - hh, 1, hh * 2 || 1); } }
        }
        ctx.fillStyle = COLORS.trans;
        for (const [tr, start] of [[r.clip.transitionIn, true], [r.clip.transitionOut, false]]) if (tr && tr.duration > 0) {
          const w = tr.duration * v.pxPerSec, xa = start ? x0 : x1 - w;
          ctx.beginPath(); ctx.moveTo(start ? xa : xa + w, y0); ctx.lineTo(start ? xa + w : xa, y0); ctx.lineTo(start ? xa : xa + w, r.y1); ctx.fill();
        }
        if (x1 - x0 > 24) { ctx.fillStyle = COLORS.clipText; ctx.font = '11px sans-serif'; ctx.fillText(`${r.clip.name || track.target || ''}${r.clip.trigger ? ` ⚡${r.clip.trigger}` : ''}${r.clip.until ? ` ✂${r.clip.until}` : ''}`, Math.max(v.headerW, x0) + 4, y0 + 12, Math.max(10, x1 - Math.max(v.headerW, x0) - 8)); }
      }
      for (const k of V.keyRects(v, rects)) {
        if (k.x < v.headerW || k.x > W) continue;
        let x = k.x;
        if (pv && pv.keys && pv.keys.some((q) => k.keys.some((w) => w.clip === q.clip && w.prop === q.prop && w.index === q.index))) x += pv.dt * v.pxPerSec;
        ctx.fillStyle = k.keys.some((q) => selKeys.has(`${q.clip}/${q.prop}/${q.index}`)) ? COLORS.keySel : COLORS.key;
        ctx.beginPath(); ctx.moveTo(x, k.y - 5); ctx.lineTo(x + 5, k.y); ctx.lineTo(x, k.y + 5); ctx.lineTo(x - 5, k.y); ctx.fill();
      }
      // the instances' lane: a tick per instance in view (and their count)
      const lane = rs.find((q) => q.kind === 'lane');
      if (lane) {
        const xs = V.instancesIn(seq, t0, t1);
        for (const x of xs) { let xx = X(x.t); if (pv && pv.instances && pv.instances.includes(x.id)) xx += pv.dt * v.pxPerSec; ctx.fillStyle = selInst.has(x.id) ? COLORS.instSel : COLORS.inst; ctx.fillRect(Math.round(xx) - 1, lane.y + 3, 3, lane.h - 6); }
      }
      // headers
      ctx.fillStyle = COLORS.header; ctx.fillRect(0, v.rulerH, v.headerW, H - v.rulerH);
      ctx.font = '12px sans-serif';
      for (const r of rs) {
        ctx.fillStyle = COLORS.text;
        if (r.kind === 'lane') { ctx.fillText(`実体 ${(seq.instances || []).length}`, 8, r.y + 14); continue; }
        const t = r.track;
        ctx.fillText(`${t.kind === 'audio' ? '♪ ' : ''}${t.name || t.target || '（無名）'}`, 8, r.y + 19, v.headerW - 72);
        [['M', t.muted, 60], ['S', t.solo, 40], ['🔒', t.locked, 20]].forEach(([s, on, b]) => { ctx.fillStyle = on ? '#ffcf4a' : COLORS.dim; ctx.fillText(s, v.headerW - b + 4, r.y + 19); });
      }
      // the ruler: timecode labels, bar numbers, markers
      ctx.fillStyle = '#16171b'; ctx.fillRect(0, 0, W, v.rulerH);
      const stepS = V.tickStep(v, fpsOf());
      ctx.fillStyle = COLORS.dim; ctx.font = '10px monospace';
      for (let t = Math.floor(Math.max(0, t0) / stepS) * stepS; t <= t1; t += stepS) { const x = X(t); if (x < v.headerW) continue; ctx.fillRect(Math.round(x), v.rulerH - 6, 1, 6); ctx.fillText(M.timecode(t, fpsOf()), x + 2, 10); }
      for (const m of seq.markers || []) { let x = X(m.t); if (pv && pv.marker === m.id) x = X(pv.t); if (x < v.headerW) continue; ctx.fillStyle = COLORS.marker; ctx.beginPath(); ctx.moveTo(x, v.rulerH); ctx.lineTo(x - 5, v.rulerH - 8); ctx.lineTo(x + 5, v.rulerH - 8); ctx.fill(); if (m.name) ctx.fillText(m.name, x + 6, v.rulerH - 2); }
      // a box being drawn, the playhead
      if (pv && pv.box) { const [a, b, c, d] = pv.box; ctx.fillStyle = COLORS.box; ctx.fillRect(a, b, c - a, d - b); }
      const px = X(store.time());
      if (px >= v.headerW) { ctx.fillStyle = COLORS.playhead; ctx.fillRect(Math.round(px), 0, 1, H); ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 7); ctx.fill(); }
    }
    // ---- input
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const mods = (e) => ({ alt: e.altKey || !state.snap, shift: e.shiftKey || e.ctrlKey || e.metaKey });
    const apply = (res) => {
      if (!res) return;
      if (res.seek !== undefined) store.seek(res.seek);
      if (res.select) store.select({ ...(store.selection() || {}), ...res.select });
      if (res.type) { const r = store.dispatch(res); if (r && !r.ok && opts.say) opts.say(r.error); }
    };
    const onDown = (e) => {
      if (e.button === 2) return;
      canvas.focus(); closeMenu();
      const [x, y] = local(e), seq = seqOf();
      if (!seq) return;
      const rs = V.rows(state.view, seq, { template: state.template }), hit = V.hitTest(state.view, seq, rs, x, y);
      if (['mute', 'solo', 'lock'].includes(hit.kind)) { const t = rs.find((r) => r.track && r.track.id === hit.track).track, key = hit.kind === 'mute' ? 'muted' : hit.kind === 'solo' ? 'solo' : 'locked'; apply({ seq: seq.id, ...(state.template ? { template: state.template } : {}), type: 'track.set', track: hit.track, patch: { [key]: !t[key] } }); return; }
      state.drag = V.createDrag(hit, x, y, { view: state.view, seq, rows: rs, selection: store.selection(), playhead: store.time(), beatDiv: state.beatDiv, template: state.template });
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      const [x, y] = local(e);
      if (!state.drag) { const seq = seqOf(); if (!seq) return; const hit = V.hitTest(state.view, seq, V.rows(state.view, seq, { template: state.template }), x, y); canvas.style.cursor = hit.kind === 'clip-start' || hit.kind === 'clip-end' ? 'ew-resize' : hit.kind === 'clip' || hit.kind === 'key' || hit.kind === 'instance' || hit.kind === 'marker' ? 'grab' : 'default'; return; }
      const r = state.drag.move(x, y, mods(e));
      if (r && r.seek !== undefined) store.seek(r.seek);
      state.preview = r && r.preview ? r.preview : null; draw();
    };
    const onUp = (e) => { if (!state.drag) return; const [x, y] = local(e), d = state.drag; state.drag = null; state.preview = null; apply(d.up(x, y, mods(e))); draw(); };
    const onDbl = (e) => {
      const [x, y] = local(e), seq = seqOf(), rs = V.rows(state.view, seq, { template: state.template }), hit = V.hitTest(state.view, seq, rs, x, y);
      // (an instance: into its template; an empty part of a track: a new clip there)
      if (hit.kind === 'instance') { const inst = seq.instances.find((i) => i.id === hit.id); state.template = inst && inst.template; draw(); }
      else if (hit.kind === 'empty' && hit.track) apply({ seq: seq.id, ...(state.template ? { template: state.template } : {}), type: 'clip.add', track: hit.track, start: Math.max(state.template ? -Infinity : 0, hit.t), end: hit.t + 1 });
    };
    const onWheel = (e) => {
      e.preventDefault();
      const [x] = local(e);
      if (e.ctrlKey || e.metaKey) zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, x);
      else { state.view = e.shiftKey ? { ...state.view, top: Math.max(0, state.view.top + e.deltaY) } : V.pan(state.view, e.deltaY || e.deltaX); draw(); }
    };
    const selected = () => store.selection() || {};
    const base = () => ({ seq: (seqOf() || {}).id, ...(state.template ? { template: state.template } : {}) });
    function keyAtPlayhead() {
      const seq = seqOf(), s = selected(), t = store.time();
      for (const id of s.clips || []) {
        const c = (state.template ? (seq.templates.find((x) => x.id === state.template) || { tracks: [] }).tracks : seq.tracks).flatMap((tr) => tr.clips).find((q) => q.id === id);
        if (!c) continue;
        const props = Object.keys(c.channels || {}).filter((p) => p !== 'path');
        for (const prop of props.length ? props : ['x', 'y']) apply({ ...base(), type: 'key.add', clip: id, prop, t: t - (typeof c.start === 'number' ? c.start : 0) });
      }
    }
    function jumpKey(dir) {
      const seq = seqOf(), ks = V.keyRects(state.view, V.clipRects(state.view, V.rows(state.view, seq, { template: state.template }))).map((k) => k.t).sort((a, b) => a - b), t = store.time();
      const next = dir > 0 ? ks.find((x) => x > t + 1e-6) : ks.reverse().find((x) => x < t - 1e-6);
      if (next !== undefined) store.seek(next);
    }
    const onKey = (e) => {
      const k = e.key, s = selected(), t = store.time(), seq = seqOf();
      if (!seq) return;
      const handled = () => { e.preventDefault(); e.stopPropagation(); };
      if (k === ' ') { store.transport.toggle(); return handled(); }
      if (k === 'k' || k === 'K') { if (s.clips && s.clips.length) keyAtPlayhead(); else store.transport.pause(); return handled(); }
      if (k === 'j' || k === 'J') { store.transport.rate(-1); store.transport.play(); return handled(); }
      if (k === 'l' || k === 'L') { store.transport.rate(store.transport.playing() ? 2 : 1); store.transport.play(); return handled(); }
      if (k === 'ArrowLeft' || k === 'ArrowRight') { const d = k === 'ArrowLeft' ? -1 : 1; if (e.shiftKey) store.seek(Math.max(0, M.timeAtBeat(seq, Math.round(M.beatAt(seq, t)) + d))); else step(d); return handled(); }
      if (k === 'Home') { store.seek(inOut()[0]); return handled(); }
      if (k === 's' || k === 'S') { apply({ ...base(), type: 'clip.split', ids: s.clips || [], t }); return handled(); }
      if (k === 'Delete' || k === 'Backspace') {
        if (s.keys && s.keys.length) apply({ ...base(), type: 'key.remove', keys: s.keys });
        else if (s.clips && s.clips.length) apply({ ...base(), type: 'clip.remove', ids: s.clips, ripple: e.shiftKey });
        else if (s.instances && s.instances.length) apply({ seq: seq.id, type: 'instance.remove', ids: s.instances });
        store.select({ ...s, clips: [], keys: [], instances: [] }); return handled();
      }
      if ((k === 'd' || k === 'D') && (e.ctrlKey || e.metaKey)) { if (s.clips && s.clips.length) apply({ ...base(), type: 'clip.duplicate', ids: s.clips }); return handled(); }
      if (k === ',' || k === '.') { jumpKey(k === '.' ? 1 : -1); return handled(); }
      if (k === 'i' || k === 'I') { apply({ seq: seq.id, type: 'seq.set', patch: { inOut: [t, Math.max(t + 0.05, inOut()[1])] } }); return handled(); }
      if (k === 'o' || k === 'O') { apply({ seq: seq.id, type: 'seq.set', patch: { inOut: [Math.min(inOut()[0], t - 0.05), t] } }); return handled(); }
      if (k === 'm' || k === 'M') { apply({ seq: seq.id, type: 'marker.add', t, name: `M${(seq.markers || []).length + 1}` }); return handled(); }
      if (/^[1-6]$/.test(k)) { state.beatDiv = [1, 2, 3, 4, 8, 16][Number(k) - 1]; divSel.value = String(state.beatDiv); draw(); return handled(); }
      if (k === '+' || k === '=') { zoomBy(1.25); return handled(); }
      if (k === '-') { zoomBy(1 / 1.25); return handled(); }
      if (k === '\\') { state.view = V.fit(state.view, seq.duration); draw(); return handled(); }
      if (k === 'Escape') { if (state.template) state.template = null; else store.select({ ...s, clips: [], keys: [], instances: [] }); draw(); return handled(); }
    };
    // ---- the context menu (Blockbench's Menu when there is one)
    function closeMenu() { if (state.menu) { state.menu.remove(); state.menu = null; } }
    const onContext = (e) => {
      e.preventDefault();
      const [x, y] = local(e), seq = seqOf();
      if (!seq) return;
      const hit = V.hitTest(state.view, seq, V.rows(state.view, seq, { template: state.template }), x, y), s = selected();
      if (hit.kind === 'clip' && !(s.clips || []).includes(hit.id)) store.select({ ...s, clips: [hit.id] });
      const ids = hit.id && (hit.kind || '').startsWith('clip') ? ((s.clips || []).includes(hit.id) ? s.clips : [hit.id]) : s.clips || [];
      const items = [
        ['ここで切る（S）', () => apply({ ...base(), type: 'clip.split', ids, t: store.time() }), ids.length],
        ['複製（Ctrl+D）', () => apply({ ...base(), type: 'clip.duplicate', ids }), ids.length],
        ['消す（Delete）', () => apply({ ...base(), type: 'clip.remove', ids }), ids.length],
        ['消して詰める（Shift+Delete）', () => apply({ ...base(), type: 'clip.remove', ids, ripple: true }), ids.length],
        ['フェードイン', () => ids.forEach((id) => apply({ ...base(), type: 'clip.set', id, patch: { transitionIn: { kind: 'fade', duration: 0.3, ease: 'quad-out' } } })), ids.length],
        ['フェードアウト', () => ids.forEach((id) => apply({ ...base(), type: 'clip.set', id, patch: { transitionOut: { kind: 'fade', duration: 0.3, ease: 'quad-in' } } })), ids.length],
        ['鍵を打つ（K）', () => keyAtPlayhead(), ids.length],
        ['マーカー（M）', () => apply({ seq: seq.id, type: 'marker.add', t: hit.t !== undefined ? hit.t : store.time() }), true],
        ['トラックを足す', () => apply({ ...base(), type: 'track.add', kind: 'layer', name: '新しいトラック' }), true],
        ['音のトラックを足す', () => apply({ ...base(), type: 'track.add', kind: 'audio', name: '音' }), !state.template],
      ].filter((i) => i[2]);
      if (opts.menu) { opts.menu(items.map(([name, click]) => ({ name, click })), e); return; }
      closeMenu();
      state.menu = h('div', { class: 'geoui-tl-menu', style: `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#2a2b31;border:1px solid #444;border-radius:4px;padding:3px 0;font:12px sans-serif;color:#ddd;z-index:10000;min-width:180px` },
        items.map(([name, click]) => h('div', { style: 'padding:4px 12px;cursor:pointer', onmouseover: (ev) => { ev.target.style.background = '#3b6fd6'; }, onmouseout: (ev) => { ev.target.style.background = ''; }, onclick: () => { closeMenu(); click(); } }, name)));
      document.body.append(state.menu);
    };
    const listeners = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['dblclick', onDbl], ['wheel', onWheel, { passive: false }], ['keydown', onKey], ['contextmenu', onContext]];
    for (const [ev, fn, o] of listeners) canvas.addEventListener(ev, fn, o);
    const offDoc = () => closeMenu();
    document.addEventListener('pointerdown', offDoc, true);
    const ro = root.ResizeObserver ? new root.ResizeObserver(() => { resize(); draw(); }) : null;
    if (ro) ro.observe(wrap);
    const unsub = store.subscribe(draw);
    resize(); paint();
    return {
      unmount() { unsub && unsub(); ro && ro.disconnect(); for (const [ev, fn, o] of listeners) canvas.removeEventListener(ev, fn, o); document.removeEventListener('pointerdown', offDoc, true); closeMenu(); if (state.raf && root.cancelAnimationFrame) root.cancelAnimationFrame(state.raf); wrap.remove(); },
      redraw: () => { resize(); paint(); },
      view: () => state.view,
      setView: (v) => { state.view = { ...state.view, ...v }; draw(); },
      openTemplate: (id) => { state.template = id; draw(); },
      canvas,
    };
  }

  T.timeline = { mount, COLORS };
  if (typeof module === 'object' && module && module.exports) module.exports = T.timeline;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/curve.js
(function (module) {
/* global document */
// GeoUI timeline — the easing curve editor (bds/geoui/timeline/PLAN.md step 6): a cubic Bézier's two handles dragged on a
// canvas, the named easings to pick from (and a named one turned into the Bézier nearest it, to fine-tune), a dot that moves
// with the curve. The pure part (the curve's points, the canvas mapping, which handle is under a point, a handle dragged, the
// nearest Bézier) is tested in Node; mount() is the DOM. It changes nothing itself: onChange(ease) gets the new ease.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const M = () => T.model;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const isBezier = (e) => !!(e && typeof e === 'object' && Array.isArray(e.bezier) && e.bezier.length === 4);

  // ---------------------------------------------------------------------------------------------------------------- pure
  /** the Bézier (0,0) (x1,y1) (x2,y2) (1,1) at its parameter s → [x, y] */
  function bezierPoint(b, s) {
    const u = 1 - s, a = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    return [a * b[0] + c * b[2] + d, a * b[1] + c * b[3] + d];
  }
  /** an ease (a name or { bezier }) as n + 1 points [x, y] over x in 0..1 (what is drawn) */
  function sample(ease, n = 64) { return Array.from({ length: n + 1 }, (_, i) => [i / n, M().ease(ease, i / n)]); }
  /** the canvas's mapping: x 0..1 across, y from lo (bottom) to hi (top) — room above and below for back and elastic */
  function frame(w, h, { pad = 14, lo = -0.35, hi = 1.35 } = {}) { return { w, h, pad, lo, hi }; }
  const toPx = (f, [x, y]) => [f.pad + x * (f.w - 2 * f.pad), f.pad + ((f.hi - y) / (f.hi - f.lo)) * (f.h - 2 * f.pad)];
  const fromPx = (f, [px, py]) => [(px - f.pad) / (f.w - 2 * f.pad), f.hi - ((py - f.pad) / (f.h - 2 * f.pad)) * (f.hi - f.lo)];
  /** which handle (1 or 2) of a Bézier is within r px of (px, py), the nearer one; null when neither */
  function hitHandle(b, f, px, py, r = 9) {
    const d = (i) => { const [x, y] = toPx(f, [b[i * 2 - 2], b[i * 2 - 1]]); return Math.hypot(x - px, y - py); };
    const d1 = d(1), d2 = d(2);
    if (Math.min(d1, d2) > r) return null;
    return d1 <= d2 ? 1 : 2;
  }
  /** handle `which` moved to the curve point p ([x, y]): x held to 0..1 (time runs one way), y to −1..2; rounded to 0.001 */
  function dragHandle(b, which, [x, y]) {
    const out = b.slice(), i = which === 1 ? 0 : 2;
    out[i] = r3(clamp(x, 0, 1)); out[i + 1] = r3(clamp(y, -1, 2));
    return out;
  }
  /** the largest gap between two eases over x in 0..1 */
  function easeError(a, b, n = 64) { let e = 0; for (let i = 1; i < n; i++) e = Math.max(e, Math.abs(M().ease(a, i / n) - M().ease(b, i / n))); return e; }
  const FITS = new Map();
  /** the Bézier nearest a named ease (least squares over x, Nelder–Mead from a few starts): { bezier, error } — error is the
   *  largest gap left (bounce and elastic have no near Bézier: a large error, said by the editor) */
  function nearestBezier(name) {
    if (isBezier(name)) return { bezier: name.bezier.slice(), error: 0 };
    if (FITS.has(name)) return FITS.get(name);
    const xs = Array.from({ length: 33 }, (_, i) => i / 32), want = xs.map((x) => M().ease(name, x));
    const cost = (p) => { if (p[0] < 0 || p[0] > 1 || p[2] < 0 || p[2] > 1 || p[1] < -1 || p[1] > 2 || p[3] < -1 || p[3] > 2) return 1e9; let s = 0; for (let i = 0; i < xs.length; i++) { const d = M().bezierAt(p, xs[i]) - want[i]; s += d * d; } return s; };
    let best = null;
    for (const start of [[0.25, 0.1, 0.25, 1], [0.42, 0, 1, 1], [0, 0, 0.58, 1], [0.42, 0, 0.58, 1], [0.33, 0.33, 0.67, 0.67], [0.6, -0.3, 0.7, 0.05], [0.3, 0.95, 0.4, 1.3]]) {
      const p = nelderMead(cost, start);
      if (!best || p.f < best.f) best = p;
    }
    const bezier = best.x.map(r3), out = { bezier, error: easeError(name, { bezier }) };
    FITS.set(name, out);
    return out;
  }
  function nelderMead(f, x0, { iter = 400, step = 0.1 } = {}) {
    const n = x0.length;
    let s = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))].map((x) => ({ x, f: f(x) }));
    for (let k = 0; k < iter; k++) {
      s.sort((a, b) => a.f - b.f);
      if (Math.abs(s[n].f - s[0].f) < 1e-12) break;
      const c = x0.map((_, j) => s.slice(0, n).reduce((a, p) => a + p.x[j], 0) / n), at = (t) => c.map((v, j) => v + t * (s[n].x[j] - v));
      const r = { x: at(-1) }; r.f = f(r.x);
      if (r.f < s[0].f) { const e = { x: at(-2) }; e.f = f(e.x); s[n] = e.f < r.f ? e : r; continue; }
      if (r.f < s[n - 1].f) { s[n] = r; continue; }
      const ct = { x: at(r.f < s[n].f ? -0.5 : 0.5) }; ct.f = f(ct.x);
      if (ct.f < Math.min(r.f, s[n].f)) { s[n] = ct; continue; }
      s = s.map((p, i) => (i ? (() => { const x = p.x.map((v, j) => s[0].x[j] + 0.5 * (v - s[0].x[j])); return { x, f: f(x) }; })() : p));
    }
    s.sort((a, b) => a.f - b.f);
    return s[0];
  }
  /** the easings by family, for the picker: [[family, [names]]] ('linear' and 'step' first) */
  function groups() {
    const out = [['基本', ['linear', 'step']]], fam = new Map();
    for (const e of M().EASES) { const m = /^(\w+)-(in|out|inout)$/.exec(e); if (m) { if (!fam.has(m[1])) fam.set(m[1], []); fam.get(m[1]).push(e); } }
    for (const [k, v] of fam) out.push([k, v]);
    return out;
  }
  /** an ease as words (the inspector's label) */
  const label = (e) => (isBezier(e) ? `ベジェ(${e.bezier.map(r3).join(', ')})` : String(e || 'linear'));

  // ---------------------------------------------------------------------------------------------------------------- DOM
  const h = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v); } for (const c of [].concat(kids)) e.append(c); return e; };
  /** the editor in el: mount(el, { value, onChange(ease), size }) → { set(ease), get(), unmount, canvas } */
  function mount(el, opts = {}) {
    const size = opts.size || 200, f = frame(size, size);
    let value = opts.value || 'linear', drag = 0, raf = 0, t0 = 0, alive = true;
    const canvas = h('canvas', { width: size, height: size, class: 'geoui-curve', style: `display:block;background:#1a1b20;border:1px solid #333;border-radius:3px;cursor:default;touch-action:none;width:${size}px;height:${size}px` });
    const track = h('canvas', { width: size, height: 14, style: `display:block;margin-top:4px;width:${size}px;height:14px` });
    const pick = h('select', { class: 'geoui-curve-pick', style: 'background:#2a2b31;color:#ddd;border:1px solid #444;max-width:130px', onchange: () => { const v = pick.value; commit(v === 'bezier' ? { bezier: nearestBezier(value).bezier } : v); } },
      [...groups().map(([g, names]) => h('optgroup', { label: g }, names.map((n) => h('option', { value: n }, n)))), h('option', { value: 'bezier' }, 'ベジェ（自由に）')]);
    const fit = h('button', { title: 'いまのイージングに近いベジェにして、点を動かせるようにする', style: 'background:#33353d;color:#ddd;border:0;border-radius:3px;margin-left:4px;padding:1px 6px;cursor:pointer', onclick: () => commit({ bezier: nearestBezier(value).bezier }) }, 'ベジェにする');
    const nums = [0, 1, 2, 3].map((i) => h('input', { 'data-i': i, size: 4, style: 'width:42px;background:#2a2b31;color:#ddd;border:1px solid #444;margin-right:2px', onchange: (e) => { if (!isBezier(value)) return; const b = value.bezier.slice(); const v = +e.target.value; if (Number.isFinite(v)) { b[i] = i % 2 ? clamp(v, -1, 2) : clamp(v, 0, 1); commit({ bezier: b.map(r3) }); } } }));
    const note = h('div', { style: 'font:11px sans-serif;color:#e8a23a;min-height:14px' });
    const wrap = h('div', { class: 'geoui-curve-editor', style: 'display:inline-block;font:12px sans-serif;color:#ccc' }, [canvas, track, h('div', { style: 'margin-top:4px;display:flex;align-items:center' }, [pick, fit]), h('div', { style: 'margin-top:4px' }, nums), note]);
    el.append(wrap);
    const ctx = canvas.getContext('2d'), tctx = track.getContext('2d');
    function paint() {
      ctx.clearRect(0, 0, size, size);
      const P = (p) => toPx(f, p);
      ctx.strokeStyle = '#2e3038'; ctx.lineWidth = 1;
      for (const y of [0, 1]) { const [, py] = P([0, y]); ctx.beginPath(); ctx.moveTo(f.pad, py); ctx.lineTo(size - f.pad, py); ctx.stroke(); }
      for (const x of [0, 1]) { const [px] = P([x, 0]); ctx.beginPath(); ctx.moveTo(px, f.pad); ctx.lineTo(px, size - f.pad); ctx.stroke(); }
      ctx.strokeStyle = '#3a3c46'; ctx.beginPath(); ctx.moveTo(...P([0, 0])); ctx.lineTo(...P([1, 1])); ctx.stroke();
      ctx.strokeStyle = '#6f9bff'; ctx.lineWidth = 2; ctx.beginPath();
      sample(value, 96).forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.stroke();
      if (isBezier(value)) {
        const b = value.bezier;
        for (const [a, c] of [[[0, 0], [b[0], b[1]]], [[1, 1], [b[2], b[3]]]]) {
          ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(c)); ctx.stroke();
          ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(...P(c), 5, 0, 2 * Math.PI); ctx.fill();
        }
      }
      pick.value = isBezier(value) ? 'bezier' : String(value);
      fit.style.display = isBezier(value) ? 'none' : '';
      nums.forEach((n, i) => { n.value = isBezier(value) ? String(value.bezier[i]) : ''; n.disabled = !isBezier(value); });
      const err = isBezier(value) ? 0 : nearestBezier(value).error;
      note.textContent = !isBezier(value) && err > 0.05 ? `（${value} にはベジェで近い形がありません: ずれ ${err.toFixed(2)}）` : '';
    }
    function dot(now) {
      if (!alive) return;
      if (!t0) t0 = now;
      const u = ((now - t0) / 1200) % 1.4, x = Math.min(1, u), y = M().ease(value, x);
      tctx.clearRect(0, 0, size, 14); tctx.fillStyle = '#2e3038'; tctx.fillRect(f.pad, 6, size - 2 * f.pad, 2);
      tctx.fillStyle = '#ffcf4a'; tctx.beginPath(); tctx.arc(f.pad + clamp(y, -0.2, 1.2) * (size - 2 * f.pad), 7, 5, 0, 2 * Math.PI); tctx.fill();
      raf = (root.requestAnimationFrame || ((fn) => setTimeout(() => fn(Date.now()), 33)))(dot);
    }
    function commit(v) { value = v; paint(); if (opts.onChange) opts.onChange(v); }
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (size / (r.width || size)), (e.clientY - r.top) * (size / (r.height || size))]; };
    const onDown = (e) => { if (!isBezier(value)) return; const [x, y] = local(e); drag = hitHandle(value.bezier, f, x, y) || 0; if (drag && canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); };
    const onMove = (e) => {
      const [x, y] = local(e);
      if (!drag) { canvas.style.cursor = isBezier(value) && hitHandle(value.bezier, f, x, y) ? 'grab' : 'default'; return; }
      value = { bezier: dragHandle(value.bezier, drag, fromPx(f, [x, y])) }; paint();
    };
    const onUp = () => { if (!drag) return; drag = 0; commit(value); };
    const listeners = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp]];
    for (const [ev, fn] of listeners) canvas.addEventListener(ev, fn);
    paint(); raf = (root.requestAnimationFrame || ((fn) => setTimeout(() => fn(Date.now()), 33)))(dot);
    return {
      set(v) { value = v || 'linear'; paint(); }, get: () => value, canvas,
      unmount() { alive = false; if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); for (const [ev, fn] of listeners) canvas.removeEventListener(ev, fn); wrap.remove(); },
    };
  }

  T.curve = { bezierPoint, sample, frame, toPx, fromPx, hitHandle, dragHandle, easeError, nearestBezier, groups, label, isBezier, mount };
  if (typeof module === 'object' && module && module.exports) module.exports = T.curve;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/inspector.js
(function (module) {
/* global document */
// GeoUI timeline — the inspector (bds/geoui/timeline/PLAN.md step 6): the fields of what is selected — a sequence (and its
// tempo, templates and paths), a clip (and its track), keys, markers, instances, a path — every change an intent for
// store.dispatch (many selected: one `batch`, one undo). Several selected: only the fields they share; a field whose values
// differ shows "—". Below: the transitions (onto the selected clips' start or end) and the presets (at the playhead).
// sections(doc, selection, ctx) is the pure part (tested in Node); mount(el, store) → { unmount, refresh } the DOM.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const M = () => T.model;
  const MIXED = Object.freeze({ mixed: true });
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** one value for many things: the value when all agree, MIXED when they do not */
  function common(list, get) { if (!list.length) return undefined; const v0 = get(list[0]); return list.every((x) => same(get(x), v0)) ? v0 : MIXED; }
  const TR_LABEL = { fade: 'フェード', 'slide-left': '左から', 'slide-right': '右から', 'slide-up': '上から', 'slide-down': '下から', zoom: 'ズーム', pop: 'ポップ' };
  const LOOP_LABEL = { once: '1 回', loop: 'くり返す', hold: '最後で止める', pingpong: '行って戻る' };
  const PATH_LABEL = { linear: '折れ線', bezier: 'ベジェ', catmull: 'なめらか（Catmull-Rom）', arc: '円弧（3 点）' };
  const PROP_LABEL = { x: 'x（右へ）', y: 'y（上へ）', scaleX: '横の倍率', scaleY: '縦の倍率', rotation: '回転（度）', opacity: '不透明度', value: '値', fill: 'ゲージの量', frame: 'コマ', path: '道の進み' };

  // ---------------------------------------------------------------------------------------------------------------- pure
  /** where each selected thing is: the clips (of the sequence's tracks or a template's), keys, markers, instances, path */
  function resolve(doc, sel = {}) {
    const seqs = (doc && doc.sequences) || [], seq = seqs.find((s) => s.id === sel.seq) || seqs[0] || null;
    if (!seq) return { seq: null };
    const clips = [];
    const find = (id) => {
      for (const tr of seq.tracks) for (const c of tr.clips) if (c.id === id) return { clip: c, track: tr, template: null };
      for (const tp of seq.templates || []) for (const tr of tp.tracks) for (const c of tr.clips) if (c.id === id) return { clip: c, track: tr, template: tp };
      return null;
    };
    for (const id of sel.clips || []) { const f = find(id); if (f) clips.push(f); }
    const keys = [];
    for (const k of sel.keys || []) { const f = find(k.clip), key = f && f.clip.channels[k.prop] && f.clip.channels[k.prop][k.index]; if (key) keys.push({ ...f, prop: k.prop, index: k.index, key }); }
    const markers = (seq.markers || []).filter((m) => (sel.markers || []).includes(m.id));
    const instances = (seq.instances || []).filter((x) => (sel.instances || []).includes(x.id));
    const path = sel.path ? (seq.paths || []).find((p) => p.id === sel.path) || null : null;
    const template = sel.template ? (seq.templates || []).find((t) => t.id === sel.template) || null : null;
    return { seq, clips, keys, markers, instances, path, template };
  }
  /** the panel for a selection: [{ id, title, fields: [field], actions?: [{ label, intents() }] }] — a field: { id, label,
   *  kind: 'number' | 'time' | 'text' | 'select' | 'bool' | 'ease' | 'value' | 'info', value (MIXED when they differ),
   *  options?: [[value, label]], step?, apply(v) → [intent] }. ctx: { elements: [{ name }], media: [{ id, kind, name }], time,
   *  now() (the time when an action is taken) } */
  function sections(doc, sel, ctx = {}) {
    const R = resolve(doc, sel), out = [];
    if (!R.seq) return [{ id: 'none', title: 'シーケンスがありません', fields: [] }];
    const seq = R.seq, base = (tp) => ({ seq: seq.id, ...(tp ? { template: tp.id } : {}) }), fps = seq.fps || 20;
    const elements = (ctx.elements || []).map((e) => e.name), sounds = (ctx.media || []).filter((m) => m.kind === 'sound');
    const F = (o) => Object.assign({ kind: 'text', options: null }, o);
    // ---- keys
    if (R.keys.length) {
      const ks = R.keys, one = ks.length === 1 ? ks[0] : null, set = (patch) => ks.map((k) => ({ ...base(k.template), type: 'key.set', clip: k.clip.id, prop: k.prop, index: k.index, patch }));
      out.push({ id: 'key', title: ks.length === 1 ? `鍵（${PROP_LABEL[one.prop] || one.prop}）` : `鍵 ${ks.length} 個`, fields: [
        ...(one ? [F({ id: 'key.t', label: '時刻（クリップの頭から）', kind: 'time', value: one.key.t, apply: (v) => set({ t: v }) })] : []),
        F({ id: 'key.v', label: '値（数か param の式）', kind: 'value', value: common(ks, (k) => k.key.v), apply: (v) => set({ v }) }),
        F({ id: 'key.ease', label: '次の鍵までのイージング', kind: 'ease', value: common(ks, (k) => k.key.ease), apply: (v) => set({ ease: v }) }),
      ] });
    }
    // ---- clips (and the first one's track)
    if (R.clips.length) {
      const cs = R.clips, one = cs.length === 1 ? cs[0] : null, audio = cs.every((c) => c.track.kind === 'audio');
      const set = (patch) => cs.map((c) => ({ ...base(c.template), type: 'clip.set', id: c.clip.id, patch }));
      const trans = (which) => (v) => set({ [which]: v ? { kind: v, duration: 0.3, ease: which === 'transitionIn' ? 'quad-out' : 'quad-in' } : null });
      const trSet = (which, k) => (v) => cs.map((c) => ({ ...base(c.template), type: 'clip.set', id: c.clip.id, patch: { [which]: c.clip[which] ? { ...c.clip[which], [k]: v } : null } }));
      const fields = [F({ id: 'clip.name', label: '名前', value: common(cs, (c) => c.clip.name || ''), apply: (v) => set({ name: v }) })];
      if (one && typeof one.clip.start === 'number' && typeof one.clip.end === 'number') {
        const c = one.clip, b = base(one.template), from = one.template ? '（実体の時刻から）' : '';
        fields.push(
          F({ id: 'clip.start', label: `始まり${from}`, kind: 'time', value: c.start, apply: (v) => [{ ...b, type: 'clip.move', ids: [c.id], dt: v - c.start }] }),
          F({ id: 'clip.end', label: `終わり${from}`, kind: 'time', value: c.end, apply: (v) => [{ ...b, type: 'clip.trim', id: c.id, edge: 'end', t: v }] }),
          F({ id: 'clip.len', label: '長さ', kind: 'time', value: r6(c.end - c.start), apply: (v) => [{ ...b, type: 'clip.trim', id: c.id, edge: 'end', t: c.start + Math.max(0.001, v) }] }));
      } else if (one) fields.push(F({ id: 'clip.when', label: '時刻（実体の時刻から）', kind: 'info', value: `${one.clip.start} 〜 ${one.clip.end}` }));
      fields.push(F({ id: 'clip.offset', label: '素材の始まり（秒）', kind: 'number', step: 0.05, value: common(cs, (c) => c.clip.offset || 0), apply: (v) => set({ offset: v }) }));
      for (const [which, label] of [['transitionIn', '入り'], ['transitionOut', '出']]) {
        const kind = common(cs, (c) => (c.clip[which] ? c.clip[which].kind : '')), has = cs.some((c) => c.clip[which]);
        fields.push(F({ id: `clip.${which}`, label: `${label}のトランジション`, kind: 'select', value: kind, options: [['', 'なし'], ...M().TRANSITIONS.map((k) => [k, TR_LABEL[k] || k])], apply: trans(which) }));
        if (has) fields.push(
          F({ id: `clip.${which}.duration`, label: `${label}の長さ（秒）`, kind: 'number', step: 0.05, value: common(cs.filter((c) => c.clip[which]), (c) => c.clip[which].duration), apply: trSet(which, 'duration') }),
          F({ id: `clip.${which}.ease`, label: `${label}のイージング`, kind: 'ease', value: common(cs.filter((c) => c.clip[which]), (c) => c.clip[which].ease), apply: trSet(which, 'ease') }));
      }
      if (cs.every((c) => c.template)) {
        const ev = (v) => (v === '' ? undefined : v);
        fields.push(F({ id: 'clip.trigger', label: '出来事から再生（trigger）', kind: 'select', value: common(cs, (c) => c.clip.trigger || ''), options: [['', 'なし'], ['hit', '当たり（hit）'], ['miss', '外れ（miss）']], apply: (v) => set({ trigger: ev(v) }) }),
          F({ id: 'clip.until', label: '出来事で切る（until）', kind: 'select', value: common(cs, (c) => c.clip.until || ''), options: [['', 'なし'], ['hit', '当たり（hit）'], ['miss', '外れ（miss）']], apply: (v) => set({ until: ev(v) }) }));
      }
      const paths = (seq.paths || []).map((p) => [p.id, `${p.id}（${PATH_LABEL[p.kind] || p.kind}・${p.points.length} 点）`]);
      fields.push(F({ id: 'clip.path', label: '道（path の鍵で進む）', kind: 'select', value: common(cs, (c) => c.clip.path || ''), options: [['', 'なし'], ...(cs.every((c) => c.template) ? [['@instance', '実体ごとの道']] : []), ...paths], apply: (v) => set({ path: v || undefined }) }));
      if (audio) fields.push(
        F({ id: 'clip.sound', label: '音', kind: 'select', value: common(cs, (c) => c.clip.sound || ''), options: [['', '（なし）'], ...sounds.map((m) => [m.id, m.name || m.id])], apply: (v) => set({ sound: v || undefined }) }),
        F({ id: 'clip.volume', label: '音量', kind: 'number', step: 0.05, value: common(cs, (c) => (c.clip.volume === undefined ? 1 : c.clip.volume)), apply: (v) => set({ volume: v }) }),
        F({ id: 'clip.pitch', label: '高さ（倍）', kind: 'number', step: 0.05, value: common(cs, (c) => (c.clip.pitch === undefined ? 1 : c.clip.pitch)), apply: (v) => set({ pitch: v }) }));
      out.push({ id: 'clip', title: cs.length === 1 ? `クリップ${one.template ? `（テンプレート「${one.template.name}」）` : ''}` : `クリップ ${cs.length} 個`, fields });
      // the track of the first selected clip (the tracks of all of them when they are one)
      const tracks = [...new Set(cs.map((c) => c.track))], tp = cs[0].template;
      const tset = (patch) => tracks.map((t) => ({ ...base(tp), type: 'track.set', track: t.id, patch }));
      if (cs.every((c) => c.template === tp)) out.push({ id: 'track', title: tracks.length === 1 ? `トラック「${tracks[0].name || tracks[0].target || tracks[0].id}」` : `トラック ${tracks.length} 本`, fields: [
        F({ id: 'track.name', label: '名前', value: common(tracks, (t) => t.name || ''), apply: (v) => tset({ name: v }) }),
        ...(tracks.every((t) => t.kind === 'layer') ? [F({ id: 'track.target', label: '動かす要素', kind: 'select', value: common(tracks, (t) => t.target || ''), options: [['', '（なし）'], ...[...new Set([...elements, ...tracks.map((t) => t.target).filter(Boolean)])].map((n) => [n, n])], apply: (v) => tset({ target: v }) })] : []),
        F({ id: 'track.muted', label: 'ミュート（見せない）', kind: 'bool', value: common(tracks, (t) => !!t.muted), apply: (v) => tset({ muted: !!v }) }),
        F({ id: 'track.solo', label: 'ソロ', kind: 'bool', value: common(tracks, (t) => !!t.solo), apply: (v) => tset({ solo: !!v }) }),
        F({ id: 'track.locked', label: '固定（動かさない）', kind: 'bool', value: common(tracks, (t) => !!t.locked), apply: (v) => tset({ locked: !!v }) }),
      ] });
    }
    // ---- markers
    if (R.markers.length) {
      const ms = R.markers, set = (patch) => ms.map((m) => ({ seq: seq.id, type: 'marker.set', id: m.id, patch }));
      out.push({ id: 'marker', title: ms.length === 1 ? `マーカー「${ms[0].name || ms[0].id}」` : `マーカー ${ms.length} 個`, fields: [
        ...(ms.length === 1 ? [F({ id: 'marker.t', label: '時刻', kind: 'time', value: ms[0].t, apply: (v) => set({ t: Math.max(0, v) }) })] : []),
        F({ id: 'marker.name', label: '名前', value: common(ms, (m) => m.name || ''), apply: (v) => set({ name: v }) }),
        F({ id: 'marker.event', label: 'ゲームへの合図（scriptevent）', value: common(ms, (m) => m.event || ''), apply: (v) => set({ event: v || undefined }) }),
      ] });
    }
    // ---- instances (and their template)
    if (R.instances.length) {
      const xs = R.instances, one = xs.length === 1 ? xs[0] : null, tpls = seq.templates || [];
      const tps = [...new Set(xs.map((x) => x.template))], tp = tps.length === 1 ? tpls.find((t) => t.id === tps[0]) : null;
      const names = tp ? tp.params : [...new Set(xs.flatMap((x) => Object.keys(x.params || {})))];
      const set = (patchOf) => xs.map((x) => ({ seq: seq.id, type: 'instance.set', id: x.id, patch: patchOf(x) }));
      out.push({ id: 'instance', title: one ? `実体 ${one.id}` : `実体 ${xs.length} 個`, fields: [
        ...(one ? [F({ id: 'instance.t', label: '本番の時刻', kind: 'time', value: one.t, apply: (v) => set(() => ({ t: v })) })] : []),
        F({ id: 'instance.template', label: 'テンプレート', kind: 'select', value: common(xs, (x) => x.template), options: tpls.map((t) => [t.id, t.name || t.id]), apply: (v) => set(() => ({ template: v })) }),
        ...names.map((k) => F({ id: `instance.param.${k}`, label: `param.${k}`, kind: 'number', step: 1, value: common(xs, (x) => (x.params && x.params[k] !== undefined ? x.params[k] : 0)), apply: (v) => set((x) => ({ params: { ...x.params, [k]: v } })) })),
      ] });
      if (tp) out.push(templateSection(seq, tp, F));
    }
    if (R.template && !R.instances.length) out.push(templateSection(seq, R.template, F));
    // ---- a path
    if (R.path) {
      const p = R.path, set = (patch) => [{ seq: seq.id, type: 'path.set', id: p.id, patch }];
      out.push({ id: 'path', title: `道「${p.id}」`, fields: [
        F({ id: 'path.kind', label: '線の種類', kind: 'select', value: p.kind, options: Object.entries(PATH_LABEL), apply: (v) => set({ kind: v }) }),
        F({ id: 'path.points', label: '点', kind: 'info', value: `${p.points.length} 点・長さ ${r6(M().pathLength(p)).toFixed(1)} 単位` }),
        F({ id: 'path.length', label: '長さ（0 で線のまま。osu! の長さ）', kind: 'number', step: 1, value: p.length || 0, apply: (v) => set({ length: v > 0 ? v : undefined }) }),
      ], actions: [{ label: '道を消す', intents: () => [{ seq: seq.id, type: 'path.remove', id: p.id }] }] });
    }
    // ---- nothing selected: the sequence, its tempo, templates and paths
    if (!out.length) {
      const set = (patch) => [{ seq: seq.id, type: 'seq.set', patch }];
      out.push({ id: 'seq', title: `シーケンス「${seq.name}」`, fields: [
        F({ id: 'seq.name', label: '名前', value: seq.name, apply: (v) => set({ name: v }) }),
        F({ id: 'seq.duration', label: '長さ', kind: 'time', value: seq.duration, apply: (v) => set({ duration: v }) }),
        F({ id: 'seq.fps', label: 'コマ / 秒', kind: 'number', step: 1, value: fps, apply: (v) => set({ fps: v }) }),
        F({ id: 'seq.loop', label: '終わったら', kind: 'select', value: seq.loop, options: Object.entries(LOOP_LABEL), apply: (v) => set({ loop: v }) }),
        F({ id: 'seq.in', label: '入（I）', kind: 'time', value: seq.inOut ? seq.inOut[0] : 0, apply: (v) => set({ inOut: [v, seq.inOut ? seq.inOut[1] : seq.duration] }) }),
        F({ id: 'seq.out', label: '出（O）', kind: 'time', value: seq.inOut ? seq.inOut[1] : seq.duration, apply: (v) => set({ inOut: [seq.inOut ? seq.inOut[0] : 0, v] }) }),
      ], actions: seq.inOut ? [{ label: '入・出を外す', intents: () => set({ inOut: null }) }] : [] });
      const tempo = seq.tempo || [];
      out.push({ id: 'tempo', title: `テンポ（BPM と拍子）${tempo.length ? '' : ': なし（120 BPM・4 拍子）'}`, fields: tempo.flatMap((p, i) => [
        F({ id: `tempo.${i}.t`, label: `${i + 1}: 時刻`, kind: 'time', value: p.t, apply: (v) => [{ seq: seq.id, type: 'tempo.set', index: i, patch: { t: v } }] }),
        F({ id: `tempo.${i}.bpm`, label: `${i + 1}: BPM`, kind: 'number', step: 1, value: p.bpm, apply: (v) => [{ seq: seq.id, type: 'tempo.set', index: i, patch: { bpm: v } }] }),
        F({ id: `tempo.${i}.meter`, label: `${i + 1}: 拍子`, kind: 'number', step: 1, value: p.meter, apply: (v) => [{ seq: seq.id, type: 'tempo.set', index: i, patch: { meter: v } }] }),
      ]), actions: [{ label: '再生位置にテンポを足す', intents: () => { const at = num(ctx.now ? ctx.now() : ctx.time), before = M().tempoOf(seq).filter((q) => q.t <= at); return [{ seq: seq.id, type: 'tempo.add', t: at, bpm: (before.length ? before[before.length - 1] : M().tempoOf(seq)[0]).bpm, meter: 4 }]; } },
        ...tempo.map((p, i) => ({ label: `${i + 1} を消す`, intents: () => [{ seq: seq.id, type: 'tempo.remove', index: i }] }))] });
      out.push({ id: 'templates', title: `テンプレート ${(seq.templates || []).length}・実体 ${(seq.instances || []).length}`, fields: (seq.templates || []).map((tp) => F({ id: `tpl.${tp.id}`, label: tp.name || tp.id, kind: 'info', value: `前 ${tp.lead} 秒・後 ${tp.tail} 秒・param ${tp.params.join(', ') || 'なし'}・実体 ${(seq.instances || []).filter((x) => x.template === tp.id).length}` })),
        actions: [{ label: 'テンプレートを足す', intents: () => [{ seq: seq.id, type: 'template.add', template: { name: `テンプレート ${(seq.templates || []).length + 1}`, lead: 0.5, tail: 0.5, params: ['x', 'y'] } }] }] });
      out.push({ id: 'paths', title: `道 ${(seq.paths || []).length}`, fields: (seq.paths || []).map((p) => F({ id: `path.${p.id}`, label: p.id, kind: 'info', value: `${PATH_LABEL[p.kind] || p.kind}・${p.points.length} 点` })),
        actions: [{ label: '道を足す', intents: () => [{ seq: seq.id, type: 'path.add', path: { kind: 'catmull', points: [[-20, 0], [0, 10], [20, 0]] } }] }] });
    }
    return out;
  }
  function templateSection(seq, tp, F) {
    const set = (patch) => [{ seq: seq.id, type: 'template.set', id: tp.id, patch }];
    return { id: 'template', title: `テンプレート「${tp.name || tp.id}」`, fields: [
      F({ id: 'template.name', label: '名前', value: tp.name, apply: (v) => set({ name: v }) }),
      F({ id: 'template.lead', label: '前に出る（秒）', kind: 'number', step: 0.05, value: tp.lead, apply: (v) => set({ lead: Math.max(0, v) }) }),
      F({ id: 'template.tail', label: '後に残る（秒）', kind: 'number', step: 0.05, value: tp.tail, apply: (v) => set({ tail: Math.max(0, v) }) }),
      F({ id: 'template.params', label: 'param（, で区切る）', value: tp.params.join(', '), apply: (v) => set({ params: String(v).split(/[,\s]+/).filter((x) => /^\w+$/.test(x)) }) }),
    ] };
  }
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  /** what a field's text means: a number (NaN when not), a time ('mm:ss:ff' or seconds), a key's value (a number or an expression) */
  function parseField(kind, text, fps = 20) {
    const s = String(text).trim();
    if (kind === 'time') return M().parseTimecode(s, fps);
    if (kind === 'number') return s === '' ? NaN : +s;
    if (kind === 'value') { if (s !== '' && Number.isFinite(+s)) return +s; const why = M().exprError(s); return why ? { error: why } : s; }
    return s;
  }
  /** a field's value as text (MIXED: '') */
  function showField(f, fps = 20) {
    if (f.value === MIXED || f.value === undefined) return '';
    if (f.kind === 'time') return M().timecode(f.value, fps);
    if (f.kind === 'ease') return T.curve ? T.curve.label(f.value) : JSON.stringify(f.value);
    return String(f.value);
  }
  /** a field's intents for a value: one, or a batch of many (one undo) */
  function intentOf(f, v) {
    const list = f.apply ? f.apply(v) : [];
    return list.length === 1 ? list[0] : list.length ? { seq: list[0].seq, type: 'batch', intents: list } : null;
  }
  /** the transitions (onto the selected clips) and presets (at the playhead, on an element) as intents */
  function transitionIntent(doc, sel, kind, which) {
    const R = resolve(doc, sel);
    const list = (R.clips || []).map((c) => ({ seq: R.seq.id, ...(c.template ? { template: c.template.id } : {}), type: 'clip.set', id: c.clip.id, patch: { [which]: kind ? { kind, duration: Math.min(0.5, Math.max(0.05, (c.clip.end - c.clip.start) / 3 || 0.3)), ease: which === 'transitionIn' ? 'quad-out' : 'quad-in' } : null } }));
    return list.length === 1 ? list[0] : list.length ? { seq: R.seq.id, type: 'batch', intents: list } : null;
  }
  function presetIntent(doc, sel, id, { target, time, options } = {}) {
    const R = resolve(doc, sel), P = T.presets;
    if (!R.seq || !P) return null;
    const into = (R.clips || []).map((c) => c.track).find((t) => !t.locked && t.kind === 'layer' && t.target === target && !(R.clips[0] && R.clips[0].template));
    return Object.assign({ seq: R.seq.id, type: 'preset.apply', at: Math.max(0, num(time)), preset: P.makePreset(id, Object.assign({}, options || {}, { target })) }, into ? { track: into.id } : {});
  }

  // ---------------------------------------------------------------------------------------------------------------- DOM
  const h = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c !== null && c !== undefined) e.append(c); return e; };
  const CSS = { input: 'background:#2a2b31;color:#e0e0e0;border:1px solid #444;border-radius:2px;padding:1px 4px;font:12px sans-serif;width:120px', btn: 'background:#33353d;color:#ddd;border:0;border-radius:3px;margin:2px 4px 2px 0;padding:2px 7px;cursor:pointer;font:12px sans-serif' };
  /** the inspector in el: mount(el, store, opts) → { unmount, refresh }. opts.say(text): where an error goes (else the panel's line) */
  function mount(el, store, opts = {}) {
    let raf = 0, editing = false, curve = null, curveFor = null, presetTarget = '';
    const status = h('div', { class: 'gi-status', style: 'color:#ff8a7a;font:12px sans-serif;min-height:16px;padding:2px 0' });
    const body = h('div', { class: 'gi-body' }), tail = h('div', { class: 'gi-tail' });
    const wrap = h('div', { class: 'geoui-inspector', style: 'background:#1e1f24;color:#cfd2da;font:12px sans-serif;padding:6px 8px;overflow:auto;height:100%;box-sizing:border-box' }, [status, body, tail]);
    el.append(wrap);
    const fpsOf = () => { const R = resolve(store.doc(), store.selection()); return (R.seq && R.seq.fps) || 20; };
    const send = (it) => {
      if (!it) return;
      const r = store.dispatch(it);
      status.textContent = r && !r.ok ? `できません: ${r.error}` : '';
      if (r && !r.ok && opts.say) opts.say(r.error);
    };
    function row(f) {
      const fps = fpsOf(), lab = h('label', { style: 'display:inline-block;width:150px;color:#aeb2bc;vertical-align:middle', title: f.label }, f.label);
      let input;
      const commit = (v) => { editing = false; if (typeof v === 'number' && !Number.isFinite(v)) { status.textContent = `「${f.label}」: 数で（時刻は 00:01:05 か 1.25）`; render(); return; } if (v && v.error) { status.textContent = v.error; return; } send(intentOf(f, v)); };
      if (f.kind === 'info') input = h('span', { style: 'color:#ddd' }, String(f.value));
      else if (f.kind === 'bool') input = h('input', { type: 'checkbox', 'data-f': f.id, checked: f.value === true ? '' : null, onchange: (e) => commit(e.target.checked) });
      else if (f.kind === 'select') {
        input = h('select', { 'data-f': f.id, style: CSS.input, onchange: (e) => commit(e.target.value) }, [...(f.value === MIXED ? [h('option', { value: '\u0000' }, '—')] : []), ...f.options.map(([v, l]) => h('option', { value: v }, l))]);
        input.value = f.value === MIXED ? '\u0000' : String(f.value === undefined ? '' : f.value);
      } else if (f.kind === 'ease') {
        const groups = T.curve ? T.curve.groups() : [['', (M().EASES || [])]];
        const isB = f.value && typeof f.value === 'object' && f.value.bezier;
        input = h('span', {}, [
          h('select', { 'data-f': f.id, style: `${CSS.input};width:110px`, onchange: (e) => { if (e.target.value === 'bezier') return openCurve(f); commit(e.target.value); } },
            [...(f.value === MIXED ? [h('option', { value: '\u0000' }, '—')] : []), ...groups.map(([g, names]) => h('optgroup', { label: g }, names.map((n) => h('option', { value: n }, n)))), h('option', { value: 'bezier' }, isB ? T.curve.label(f.value) : 'ベジェ…')]),
          T.curve ? h('button', { style: CSS.btn, title: '曲線を開いて点を動かす', onclick: () => openCurve(f) }, '曲線') : null]);
        input.firstChild.value = f.value === MIXED ? '\u0000' : isB ? 'bezier' : String(f.value || 'linear');
      } else {
        input = h('input', { 'data-f': f.id, style: CSS.input, value: showField(f, fps), placeholder: f.value === MIXED ? '—' : '',
          onfocus: () => { editing = true; }, onblur: () => { if (editing) { editing = false; render(); } },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(parseField(f.kind, e.target.value, fps)); } else if (e.key === 'Escape') { editing = false; render(); } e.stopPropagation(); },
          onchange: (e) => commit(parseField(f.kind, e.target.value, fps)) });
        // (a number's label dragged sideways changes it — sent once, when let go)
        if (f.kind === 'number' || f.kind === 'time') {
          lab.style.cursor = 'ew-resize';
          lab.addEventListener('pointerdown', (e) => {
            if (f.value === MIXED) return;
            const x0 = e.clientX, v0 = +f.value, step = f.step || (f.kind === 'time' ? 1 / fps : 0.1);
            let v = v0;
            const mv = (ev) => { v = Math.round((v0 + Math.round((ev.clientX - x0) / 4) * step) * 1e6) / 1e6; input.value = f.kind === 'time' ? M().timecode(v, fps) : String(v); };
            const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); if (v !== v0) commit(v); };
            document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
          });
        }
      }
      return h('div', { class: 'gi-row', 'data-row': f.id, style: 'margin:2px 0;display:flex;align-items:center' }, [lab, input]);
    }
    function openCurve(f) {
      if (!T.curve) return;
      if (curve) { curve.unmount(); curve = null; }
      curveFor = f.id;
      const holder = body.querySelector(`[data-row="${f.id}"]`), box = h('div', { class: 'gi-curve', style: 'margin:4px 0 6px 150px' });
      if (holder) holder.after(box);
      curve = T.curve.mount(box, { value: f.value === MIXED || !f.value ? 'linear' : f.value, onChange: (v) => send(intentOf(f, v)) });
    }
    function render() {
      if (editing) return;
      const doc = store.doc(), sel = store.selection() || {}, secs = sections(doc, sel, { elements: store.elements ? store.elements() : [], media: store.media ? store.media() : [], time: store.time(), now: () => store.time() });
      if (curve) { curve.unmount(); curve = null; }
      body.textContent = '';
      for (const s of secs) {
        body.append(h('div', { class: 'gi-sec', 'data-sec': s.id, style: 'margin:4px 0 8px;border-top:1px solid #2e3038;padding-top:4px' }, [
          h('div', { style: 'font-weight:bold;color:#fff;margin-bottom:3px' }, s.title), ...s.fields.map(row),
          ...(s.actions || []).map((a) => h('button', { style: CSS.btn, onclick: () => send(intentOf({ apply: a.intents }, null)) }, a.label))]));
      }
      if (curveFor) { const f = secs.flatMap((s) => s.fields).find((x) => x.id === curveFor); if (f) openCurve(f); else curveFor = null; }
      renderTail(doc, sel);
    }
    function renderTail(doc, sel) {
      tail.textContent = '';
      const R = resolve(doc, sel);
      if (!R.seq) return;
      if (R.clips && R.clips.length) {
        tail.append(h('div', { class: 'gi-sec', 'data-sec': 'transitions', style: 'margin:4px 0 8px;border-top:1px solid #2e3038;padding-top:4px' }, [
          h('div', { style: 'font-weight:bold;color:#fff;margin-bottom:3px' }, 'トランジション（選んだクリップへ）'),
          ...M().TRANSITIONS.map((k) => h('div', { style: 'display:flex;align-items:center' }, [h('span', { style: 'width:80px' }, TR_LABEL[k] || k),
            h('button', { style: CSS.btn, 'data-tr': `${k}:in`, onclick: () => send(transitionIntent(store.doc(), store.selection(), k, 'transitionIn')) }, '頭へ'),
            h('button', { style: CSS.btn, 'data-tr': `${k}:out`, onclick: () => send(transitionIntent(store.doc(), store.selection(), k, 'transitionOut')) }, '尻へ')]))]));
      }
      const P = T.presets, list = P ? P.presetList() : [];
      if (!list.length) return;
      const elements = (store.elements ? store.elements() : []).map((e) => e.name), first = R.clips && R.clips[0] && R.clips[0].track.target;
      if (!presetTarget || !elements.includes(presetTarget)) presetTarget = first || elements[0] || '';
      const sel2 = h('select', { class: 'gi-preset-target', style: CSS.input, onchange: (e) => { presetTarget = e.target.value; } }, elements.map((n) => h('option', { value: n }, n)));
      sel2.value = presetTarget;
      tail.append(h('div', { class: 'gi-sec', 'data-sec': 'presets', style: 'margin:4px 0 8px;border-top:1px solid #2e3038;padding-top:4px' }, [
        h('div', { style: 'font-weight:bold;color:#fff;margin-bottom:3px' }, 'プリセット（再生位置へ）'),
        h('div', {}, [h('span', { style: 'margin-right:6px' }, '要素'), sel2]),
        ...list.map((p) => h('div', { style: 'display:flex;align-items:center' }, [h('button', { style: CSS.btn, 'data-preset': p.id, title: p.about, onclick: () => { if (!presetTarget) { status.textContent = 'プリセットを置く要素がありません'; return; } send(presetIntent(store.doc(), store.selection(), p.id, { target: presetTarget, time: store.time() })); } }, p.name), h('span', { style: 'color:#8b8f9a' }, p.about)]))]));
    }
    const draw = () => { if (!raf) raf = (root.requestAnimationFrame || ((f) => setTimeout(f, 16)))(() => { raf = 0; render(); }); };
    // (the time alone changing — 60 times a second while playing — draws nothing here: what a field shows does not follow it)
    const unsub = store.subscribe((what) => { if (!what || what.doc || what.selection || what.external) draw(); });
    render();
    return {
      refresh: render,
      unmount() { unsub && unsub(); if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); if (curve) curve.unmount(); wrap.remove(); },
    };
  }

  T.inspector = { MIXED, common, resolve, sections, parseField, showField, intentOf, transitionIntent, presetIntent, mount };
  if (typeof module === 'object' && module && module.exports) module.exports = T.inspector;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/instances.js
(function (module) {
/* global document, FileReader */
// GeoUI timeline — the instances' table (bds/geoui/timeline/PLAN.md step 6): every instance of the sequence's templates as a
// row (time, template, each param), sorted by any column, filtered ("x>0 template=osu-circle", or a word), only the rows in
// view drawn (thousands stay quick), a row clicked selects it and moves the playhead there, a cell edited in place, rows pasted
// from a spreadsheet (TSV / CSV) added in one go, the selection copied out as TSV, and an osu! beatmap (.osu) read in. Every
// change an intent for store.dispatch. The pure part (columns, filter, sort, the rows in view, reading a table) is tested in
// Node; mount(el, store, opts) → { unmount, refresh } is the DOM.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const M = () => T.model;
  const num = (v, d = NaN) => (v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(+v) ? +v : d);
  const ROW = 20;

  // ---------------------------------------------------------------------------------------------------------------- pure
  /** the table's columns: time, template, then every param the sequence's templates have (in their order, each once) */
  function columns(seq) {
    const params = [];
    for (const tp of (seq && seq.templates) || []) for (const p of tp.params || []) if (!params.includes(p)) params.push(p);
    for (const x of (seq && seq.instances) || []) for (const p of Object.keys(x.params || {})) if (!params.includes(p)) params.push(p);
    return [{ key: 't', label: '時刻' }, { key: 'template', label: 'テンプレート' }, ...params.map((p) => ({ key: p, label: p, param: true }))];
  }
  const cell = (x, key) => (key === 't' ? x.t : key === 'template' ? x.template : key === 'id' ? x.id : x.params ? x.params[key] : undefined);
  /** a filter's text → a test for an instance: terms (all must hold) "key op value" (op = != < <= > >= ~) or a bare word
   *  (in its id or template). → { test, error } */
  function parseFilter(text, seq) {
    const terms = String(text || '').trim().split(/\s+/).filter(Boolean), tests = [];
    const names = new Map(((seq && seq.templates) || []).map((tp) => [tp.id, String(tp.name || '').toLowerCase()]));
    for (const term of terms) {
      const m = /^([\w.]+)(<=|>=|!=|=|<|>|~)(.*)$/.exec(term);
      if (!m) { const w = term.toLowerCase(); tests.push((x) => x.id.toLowerCase().includes(w) || x.template.toLowerCase().includes(w) || (names.get(x.template) || '').includes(w)); continue; }
      const [, k0, op, v] = m, key = k0.replace(/^param\./, ''), n = num(v);
      if (['<', '<=', '>', '>='].includes(op) && !Number.isFinite(n)) return { test: () => true, error: `「${term}」: ${op} の右は数で` };
      tests.push((x) => {
        const c = cell(x, key);
        if (c === undefined) return op === '!=';
        if (op === '~') return String(c).toLowerCase().includes(v.toLowerCase()) || (key === 'template' && (names.get(c) || '').includes(v.toLowerCase()));
        const eq = Number.isFinite(n) && Number.isFinite(+c) ? Math.abs(+c - n) < 1e-9 : String(c) === v || (key === 'template' && names.get(c) === v.toLowerCase());
        return op === '=' ? eq : op === '!=' ? !eq : op === '<' ? +c < n : op === '<=' ? +c <= n : op === '>' ? +c > n : +c >= n;
      });
    }
    return { test: (x) => tests.every((f) => f(x)), error: null };
  }
  const CACHE = new WeakMap();
  /** the rows shown: filtered, then sorted (sort: { key, dir: 1 | -1 }; time order when none). Kept for the same instances
   *  list, sort and filter */
  function rowsOf(seq, { sort = null, filter = '' } = {}) {
    const xs = (seq && seq.instances) || [], key = `${sort ? `${sort.key}:${sort.dir}` : ''}|${filter}`;
    const c = CACHE.get(xs);
    if (c && c.key === key) return c.rows;
    const f = parseFilter(filter, seq);
    let rows = filter ? xs.filter(f.test) : xs.slice();
    if (sort && sort.key !== 't') {
      const k = sort.key, d = sort.dir || 1;
      rows = rows.map((x, i) => [x, i]).sort((a, b) => { const p = cell(a[0], k), q = cell(b[0], k); const r = typeof p === 'number' && typeof q === 'number' ? p - q : String(p ?? '').localeCompare(String(q ?? '')); return r * d || a[1] - b[1]; }).map((p) => p[0]);
    } else if (sort && sort.dir === -1) rows.reverse();
    CACHE.set(xs, { key, rows });
    return rows;
  }
  /** the rows in view of a scrolled list: [from, to) with a few more above and below */
  function windowOf(scrollTop, height, count, rowH = ROW, more = 6) {
    const from = Math.max(0, Math.floor(scrollTop / rowH) - more), to = Math.min(count, Math.ceil((scrollTop + height) / rowH) + more);
    return [from, Math.max(from, to)];
  }
  /** a line of a CSV (quotes, "" inside them) */
  function csvCells(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }
  const TIME_NAMES = ['t', 'time', '時刻', 'ms'], TPL_NAMES = ['template', 'tpl', 'テンプレート'];
  /** a pasted table (TSV, CSV or spaces; a header row or not) → { instances: [{ template, t, params }], errors: [] }.
   *  Columns by the header's names (t / time / 時刻 — or ms, in milliseconds —, template, param names); without one: the
   *  time, then the template when it is not a number, then the template's params in order. Times: seconds or 'mm:ss:ff'.
   *  opts: { template (the default: else the only one, else the first), fps } */
  function parseTable(text, seq, opts = {}) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()), errors = [], instances = [];
    if (!lines.length) return { instances, errors: ['空です'] };
    const tpls = (seq && seq.templates) || [], fps = opts.fps || (seq && seq.fps) || 20;
    const split = lines.some((l) => l.includes('\t')) ? (l) => l.split('\t').map((s) => s.trim()) : lines.some((l) => l.includes(',')) ? csvCells : (l) => l.trim().split(/\s+/);
    const byName = (s) => tpls.find((tp) => tp.id === s || tp.name === s) || null;
    const fallback = byName(opts.template || '') || (tpls.length === 1 ? tpls[0] : tpls[0] || null);
    let rows = lines.map(split), head = null, names0 = null;
    const isHead = (cells) => cells.some((c) => TIME_NAMES.includes(c.toLowerCase()) || TPL_NAMES.includes(c.toLowerCase())) && cells.every((c) => !Number.isFinite(num(c)));
    if (isHead(rows[0])) { names0 = rows[0].map((c) => c.replace(/^param\./, '')); head = names0.map((c) => c.toLowerCase()); rows = rows.slice(1); }
    rows.forEach((cells, i) => {
      const at = `${i + 1 + (head ? 1 : 0)} 行目`;
      let t, tp = fallback, params = {};
      if (head) {
        const get = (names) => { const j = head.findIndex((c) => names.includes(c)); return j >= 0 ? cells[j] : undefined; };
        const ms = head.includes('ms') ? num(get(['ms'])) : NaN, tv = get(['t', 'time', '時刻']);
        t = Number.isFinite(ms) ? ms / 1000 : tv === undefined ? NaN : M().parseTimecode(tv, fps);
        const tn = get(TPL_NAMES);
        if (tn !== undefined && tn !== '') { tp = byName(tn); if (!tp) { errors.push(`${at}: テンプレート「${tn}」がありません`); return; } }
        head.forEach((c, j) => { const name = names0[j]; if (!TIME_NAMES.includes(c) && !TPL_NAMES.includes(c) && c !== 'id' && /^\w+$/.test(name) && cells[j] !== undefined && cells[j] !== '') { const v = num(cells[j]); if (Number.isFinite(v)) params[name] = v; else errors.push(`${at}: ${name} の「${cells[j]}」が数ではありません`); } });
      } else {
        t = M().parseTimecode(cells[0], fps);
        let rest = cells.slice(1);
        if (rest.length && !Number.isFinite(num(rest[0]))) { tp = byName(rest[0]); if (!tp) { errors.push(`${at}: テンプレート「${rest[0]}」がありません`); return; } rest = rest.slice(1); }
        const names = tp ? tp.params : [];
        if (rest.length > names.length) errors.push(`${at}: 値が ${rest.length} 個、テンプレートの param は ${names.length} 個（多い分は捨てる）`);
        names.forEach((p, j) => { if (rest[j] !== undefined) { const v = num(rest[j]); if (Number.isFinite(v)) params[p] = v; else errors.push(`${at}: ${p} の「${rest[j]}」が数ではありません`); } });
      }
      if (!Number.isFinite(t)) { errors.push(`${at}: 時刻が読めません（秒か 00:01:05）`); return; }
      if (!tp) { errors.push(`${at}: テンプレートがありません（先にテンプレートを作る）`); return; }
      instances.push({ template: tp.id, t, params });
    });
    return { instances, errors };
  }
  /** rows as TSV with a header (what a spreadsheet takes, and parseTable reads back) */
  function toTsv(rows, cols) {
    return [cols.map((c) => c.key).join('\t'), ...rows.map((x) => cols.map((c) => { const v = cell(x, c.key); return v === undefined ? '' : String(v); }).join('\t'))].join('\n');
  }

  // ---------------------------------------------------------------------------------------------------------------- DOM
  const h = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c !== null && c !== undefined) e.append(c); return e; };
  const BTN = 'background:#33353d;color:#ddd;border:0;border-radius:3px;margin-left:4px;padding:2px 7px;cursor:pointer;font:12px sans-serif';
  /** the table in el: mount(el, store, opts) → { unmount, refresh, state }. opts.osu: toDocument's options (width, elements,
   *  designRadius); opts.importOsu(text, file): the bridge's own import (an atlas for the sliders' bodies) instead of the plain one */
  function mount(el, store, opts = {}) {
    const state = { sort: null, filter: '', anchor: null, raf: 0, editing: null };
    const seqOf = () => { const d = store.doc(), s = store.selection() || {}; return (d.sequences || []).find((q) => q.id === s.seq) || (d.sequences || [])[0] || null; };
    const say = (m) => { msg.textContent = m || ''; };
    const filter = h('input', { class: 'gin-filter', placeholder: '絞り込み（例 x>0 template=osu-circle）', style: 'background:#2a2b31;color:#ddd;border:1px solid #444;padding:1px 4px;width:220px;max-width:100%;font:12px sans-serif',
      oninput: (e) => { state.filter = e.target.value; const f = parseFilter(state.filter, seqOf()); say(f.error || ''); scroller.scrollTop = 0; paint(); }, onkeydown: (e) => e.stopPropagation() });
    const count = h('span', { class: 'gin-count', style: 'margin-left:8px;color:#8b8f9a' });
    const file = h('input', { type: 'file', accept: '.osu', style: 'display:none', onchange: () => { const f = file.files && file.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { importOsu(String(rd.result), f); file.value = ''; }; rd.readAsText(f); } });
    const tools = h('div', { style: 'display:flex;flex-wrap:wrap;gap:3px;align-items:center;padding:3px 6px;background:#18191d;border-bottom:1px solid #2e3038;font:12px sans-serif;color:#ccc' }, [
      filter, count, h('button', { class: 'gin-paste', style: BTN, title: '表計算ソフトからコピーした行（時刻・テンプレート・param）を足す', onclick: () => openPaste() }, '貼り付けで足す…'),
      T.osu ? h('button', { class: 'gin-osu', style: BTN, title: 'osu! の譜面（.osu）を読んで実体・テンプレート・道・テンポを足す', onclick: () => file.click() }, 'osu! を取り込む') : null, file]);
    const msg = h('div', { class: 'gin-msg', style: 'color:#e8a23a;font:11px sans-serif;min-height:14px;padding:0 6px' });
    const head = h('div', { class: 'gin-head', style: 'display:flex;background:#23242a;color:#aeb2bc;font:12px sans-serif;border-bottom:1px solid #2e3038' });
    const spacer = h('div', { style: 'position:relative' });
    const scroller = h('div', { class: 'gin-rows', tabindex: '0', style: 'flex:1;overflow:auto;position:relative;outline:none;font:12px monospace;color:#ddd' }, [spacer]);
    const wrap = h('div', { class: 'geoui-instances', style: 'display:flex;flex-direction:column;height:100%;background:#1e1f24' }, [tools, msg, head, scroller]);
    el.append(wrap);
    const widthOf = (c) => (c.key === 't' ? 84 : c.key === 'template' ? 120 : 70);
    function paint() {
      // (a cell being edited is kept: a repaint queued by the click before the double-click would take its input away — the
      //  edit then repaints when it is done)
      if (state.editing && state.editing.isConnected) return;
      const seq = seqOf();
      if (!seq) { spacer.textContent = ''; count.textContent = 'シーケンスがありません'; return; }
      const cols = columns(seq), rows = rowsOf(seq, state), sel = new Set((store.selection() || {}).instances || []), fps = seq.fps || 20;
      count.textContent = `${seq.instances.length} 個${state.filter ? `中 ${rows.length} 個` : ''}`;
      head.textContent = '';
      for (const c of cols) head.append(h('div', { 'data-col': c.key, style: `width:${widthOf(c)}px;padding:2px 4px;cursor:pointer;flex:none`, onclick: () => { state.sort = state.sort && state.sort.key === c.key ? (state.sort.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }; scroller.scrollTop = 0; paint(); } },
        `${c.label}${state.sort && state.sort.key === c.key ? (state.sort.dir === 1 ? ' ▲' : ' ▼') : ''}`));
      spacer.style.height = `${rows.length * ROW}px`;
      const [from, to] = windowOf(scroller.scrollTop, scroller.clientHeight || 300, rows.length);
      spacer.textContent = '';
      const names = new Map((seq.templates || []).map((tp) => [tp.id, tp.name || tp.id]));
      for (let i = from; i < to; i++) {
        const x = rows[i];
        const r = h('div', { class: 'gin-row', 'data-id': x.id, style: `position:absolute;top:${i * ROW}px;left:0;right:0;height:${ROW}px;display:flex;align-items:center;cursor:default;${sel.has(x.id) ? 'background:#3b6fd6;color:#fff' : i % 2 ? 'background:#202127' : ''}` },
          cols.map((c) => h('div', { 'data-key': c.key, style: `width:${widthOf(c)}px;padding:0 4px;overflow:hidden;white-space:nowrap;flex:none` }, c.key === 't' ? M().timecode(x.t, fps) : c.key === 'template' ? names.get(x.template) || x.template : (() => { const v = cell(x, c.key); return v === undefined ? '' : String(Math.round(v * 1e4) / 1e4); })())));
        spacer.append(r);
      }
    }
    const draw = () => { if (!state.raf) state.raf = (root.requestAnimationFrame || ((f) => setTimeout(f, 16)))(() => { state.raf = 0; paint(); }); };
    const send = (it) => { const r = store.dispatch(it); say(r && !r.ok ? `できません: ${r.error}` : ''); return r; };
    const rowAt = (e) => { const r = e.target.closest && e.target.closest('.gin-row'); return r ? r.getAttribute('data-id') : null; };
    const onClick = (e) => {
      const id = rowAt(e), seq = seqOf();
      if (!id || !seq) return;
      const rows = rowsOf(seq, state), s = store.selection() || {}, cur = s.instances || [];
      let ids = [id];
      if (e.shiftKey && state.anchor) { const a = rows.findIndex((x) => x.id === state.anchor), b = rows.findIndex((x) => x.id === id); if (a >= 0 && b >= 0) ids = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id); }
      else if (e.ctrlKey || e.metaKey) ids = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (!e.shiftKey) state.anchor = id;
      store.select({ ...s, instances: ids, clips: [], keys: [] });
      const x = seq.instances.find((q) => q.id === id);
      if (x) store.seek(x.t);
      scroller.focus();
    };
    const onDbl = (e) => {
      const id = rowAt(e), c = e.target.closest && e.target.closest('[data-key]'), seq = seqOf();
      if (!id || !c || !seq) return;
      const key = c.getAttribute('data-key'), x = seq.instances.find((q) => q.id === id), fps = seq.fps || 20;
      const was = key === 't' ? M().timecode(x.t, fps) : key === 'template' ? x.template : String(cell(x, key) ?? '');
      const input = h('input', { value: was, style: 'width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #6f9bff;font:12px monospace' });
      const done = (ok) => {
        state.editing = null;
        if (ok && input.value !== was) {
          const v = input.value.trim();
          if (key === 't') { const t = M().parseTimecode(v, fps); if (!Number.isFinite(t)) { say('時刻が読めません（秒か 00:01:05）'); paint(); return; } send({ seq: seq.id, type: 'instance.set', id, patch: { t } }); }
          else if (key === 'template') { const tp = (seq.templates || []).find((q) => q.id === v || q.name === v); if (!tp) { say(`テンプレート「${v}」がありません`); paint(); return; } send({ seq: seq.id, type: 'instance.set', id, patch: { template: tp.id } }); }
          else { const n = num(v); if (!Number.isFinite(n)) { say(`${key}: 数で`); paint(); return; } send({ seq: seq.id, type: 'instance.set', id, patch: { params: { ...x.params, [key]: n } } }); }
        }
        paint();
      };
      input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); });
      input.addEventListener('blur', () => { if (state.editing === input) done(true); });
      c.textContent = ''; c.append(input); state.editing = input; input.focus(); input.select();
    };
    function addRows(text) {
      const seq = seqOf();
      if (!seq) return null;
      const s = store.selection() || {}, cur = (seq.instances || []).find((x) => (s.instances || []).includes(x.id));
      const r = parseTable(text, seq, { template: cur ? cur.template : undefined });
      if (!r.instances.length) { say(r.errors.slice(0, 3).join(' / ') || '足す行がありません'); return r; }
      const res = send({ seq: seq.id, type: 'instances.import', instances: r.instances });
      if (res && res.ok) say(`${r.instances.length} 個を足しました${r.errors.length ? `（読めなかった行: ${r.errors.slice(0, 3).join(' / ')}）` : ''}`);
      return r;
    }
    function openPaste() {
      if (wrap.querySelector('.gin-paste-box')) return;
      const ta = h('textarea', { rows: 6, placeholder: '時刻<TAB>テンプレート<TAB>x<TAB>y …（1 行目に見出しがあってもよい）', style: 'width:100%;box-sizing:border-box;background:#111;color:#ddd;border:1px solid #444;font:12px monospace', onkeydown: (e) => e.stopPropagation() });
      const box = h('div', { class: 'gin-paste-box', style: 'padding:4px 6px;background:#18191d' }, [ta,
        h('button', { style: BTN, onclick: () => { addRows(ta.value); box.remove(); } }, '足す'), h('button', { style: BTN, onclick: () => box.remove() }, 'やめる')]);
      msg.after(box); ta.focus();
    }
    function importOsu(text, f) {
      const seq = seqOf(), O = T.osu;
      if (!seq || !O) return;
      if (opts.importOsu) { opts.importOsu(text, f); return; }
      try {
        const map = O.parseOsu(text), { doc, info } = O.toDocument(map, opts.osu || {}), s = doc.sequences[0];
        const r = send({ seq: seq.id, type: 'instances.import', instances: s.instances, templates: s.templates, tempo: s.tempo, paths: s.paths, markers: s.markers, tracks: s.tracks });
        if (r && r.ok) say(`osu!「${info.title}」: 円 ${info.counts.circles}・スライダー ${info.counts.sliders}・スピナー ${info.counts.spinners}（スライダーの体の絵は GeoUI の osu! の取り込みで）`);
      } catch (e) { say(`読めません: ${e.message || e}`); }
    }
    const onKey = (e) => {
      const seq = seqOf(), s = store.selection() || {};
      if (!seq || state.editing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && (s.instances || []).length) { send({ seq: seq.id, type: 'instance.remove', ids: s.instances }); store.select({ ...s, instances: [] }); e.preventDefault(); e.stopPropagation(); }
      else if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey) && (s.instances || []).length) {
        const ids = new Set(s.instances), text = toTsv(rowsOf(seq, state).filter((x) => ids.has(x.id)), columns(seq));
        if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(text).catch(() => {});
        state.copied = text; say(`${ids.size} 行をコピーしました（TSV）`); e.preventDefault(); e.stopPropagation();
      }
    };
    const onPaste = (e) => { const text = e.clipboardData && e.clipboardData.getData('text/plain'); if (!text || state.editing) return; e.preventDefault(); addRows(text); };
    const onScroll = () => draw();
    const listeners = [[scroller, 'click', onClick], [scroller, 'dblclick', onDbl], [scroller, 'keydown', onKey], [scroller, 'paste', onPaste], [scroller, 'scroll', onScroll]];
    for (const [t, ev, fn] of listeners) t.addEventListener(ev, fn);
    // (the time alone changing draws nothing: the rows do not follow the playhead)
    const unsub = store.subscribe((what) => { if (!what || what.doc || what.selection || what.external) draw(); });
    paint();
    return {
      refresh: paint, state, addRows, importOsu,
      /** the row of an instance into view (the timeline's selection followed) */
      reveal(id) { const seq = seqOf(), i = seq ? rowsOf(seq, state).findIndex((x) => x.id === id) : -1; if (i >= 0) { scroller.scrollTop = Math.max(0, i * ROW - scroller.clientHeight / 2); paint(); } },
      unmount() { unsub && unsub(); for (const [t, ev, fn] of listeners) t.removeEventListener(ev, fn); if (state.raf && root.cancelAnimationFrame) root.cancelAnimationFrame(state.raf); wrap.remove(); },
    };
  }

  T.instances = { columns, parseFilter, rowsOf, windowOf, csvCells, parseTable, toTsv, ROW, mount };
  if (typeof module === 'object' && module && module.exports) module.exports = T.instances;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/pathedit.js
(function (module) {
/* global document */
// GeoUI timeline — paths and positions edited on the preview (bds/geoui/timeline/PLAN.md step 6): a drawing over the preview's
// canvas (host.frameRect: the GeoUI screen there, model units ↔ px) of the sequence's paths, the selected path's points
// (dragged; Ctrl+click adds one — into the nearest piece when near it, else at the end —; Alt+click removes one), the instances
// out around the playhead and the selected ones' positions (param.x / param.y, dragged together), a grid and, while an instance
// is dragged, the ring at the distance of a beat's spacing from the one before it (osu!'s distance snap). It only sends intents.
// The pointer goes to the preview (Blockbench's camera) unless it is on something of ours. The pure part is tested in Node.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const M = () => T.model;
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const r4 = (x) => Math.round(x * 1e4) / 1e4;

  // ---------------------------------------------------------------------------------------------------------------- pure
  /** the GeoUI screen in the canvas: rect { x, y, w, h } (px) shows unitsH model units from bottom to top around center
   *  (model units, default (0, 140): GeoUI's middle) → { toPx([x, y]), toModel([px, py]), k (px a unit) } */
  function mapping(rect, { unitsH = 170.68, center = [0, 140] } = {}) {
    const k = rect.h / unitsH, cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    return { k, toPx: ([x, y]) => [cx + (x - center[0]) * k, cy - (y - center[1]) * k], toModel: ([px, py]) => [center[0] + (px - cx) / k, center[1] - (py - cy) / k] };
  }
  /** where an element rests (model units: its own x, y when the host knows them, else GeoUI's middle) */
  const restOf = (elements, name) => { const e = (elements || []).find((x) => x.name === name); return e && Number.isFinite(+e.x) && Number.isFinite(+e.y) ? [+e.x, +e.y] : [0, 140]; };
  /** the element a path moves (the first clip that follows it — or follows an instance's own path, for an instance's) */
  function pathTarget(seq, pathId) {
    const uses = (tr) => tr.clips.some((c) => c.path === pathId);
    for (const tr of seq.tracks || []) if (uses(tr)) return tr.target;
    for (const tp of seq.templates || []) for (const tr of tp.tracks) if (uses(tr) || (tr.clips.some((c) => c.path === '@instance') && (seq.instances || []).some((x) => x.path === pathId && x.template === tp.id))) return tr.target;
    return null;
  }
  /** an instance's place element: the first of its template's tracks with x or y keys (its position's element) */
  function placeTarget(seq, templateId) {
    const tp = (seq.templates || []).find((x) => x.id === templateId);
    if (!tp) return null;
    const tr = tp.tracks.find((t) => t.clips.some((c) => c.channels && (c.channels.x || c.channels.y))) || tp.tracks[0];
    return tr ? tr.target : null;
  }
  /** the point (index) of a list near (px, py): within r px, the nearest; −1 none */
  function hitPoint(points, origin, map, px, py, r = 8) {
    let best = -1, bd = r;
    points.forEach((p, i) => { const [x, y] = map.toPx([origin[0] + p[0], origin[1] + p[1]]), d = Math.hypot(x - px, y - py); if (d <= bd) { bd = d; best = i; } });
    return best;
  }
  /** where a new point goes into a list: after the piece (control polygon) nearest (px, py) when within r px, else at the end */
  function insertAt(points, origin, map, px, py, r = 10) {
    let best = points.length, bd = r;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = map.toPx([origin[0] + points[i][0], origin[1] + points[i][1]]), b = map.toPx([origin[0] + points[i + 1][0], origin[1] + points[i + 1][1]]);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
      const d = Math.hypot(a[0] + u * dx - px, a[1] + u * dy - py);
      if (d <= bd) { bd = d; best = i + 1; }
    }
    return best;
  }
  /** a point snapped: onto the ring at `ring` units from `prev` when near it (within 15 %), else onto the grid (grid units) */
  function snapPoint(p, { grid = 0, prev = null, ring = 0 } = {}) {
    if (prev && ring > 0) {
      const dx = p[0] - prev[0], dy = p[1] - prev[1], d = Math.hypot(dx, dy);
      if (d > 0 && Math.abs(d - ring) <= ring * 0.15) return [r4(prev[0] + (dx / d) * ring), r4(prev[1] + (dy / d) * ring)];
    }
    if (grid > 0) return [r4(Math.round(p[0] / grid) * grid), r4(Math.round(p[1] / grid) * grid)];
    return [r4(p[0]), r4(p[1])];
  }
  /** the instance before one in time (of the same template) and the beats between them — what the distance ring is from */
  function before(seq, inst) {
    const xs = (seq.instances || []).filter((x) => x.template === inst.template && x.t < inst.t - 1e-9);
    if (!xs.length) return null;
    const p = xs[xs.length - 1];
    return { inst: p, beats: M().beatAt(seq, inst.t) - M().beatAt(seq, p.t) };
  }
  const setPoints = (seq, path, points) => ({ seq: seq.id, type: 'path.set', id: path.id, patch: { points: points.map((q) => [r4(q[0]), r4(q[1])]) } });

  // ---------------------------------------------------------------------------------------------------------------- DOM
  /** attach(host, store, opts) → { detach, refresh, state }. host: { canvas(), frameRect() (null: not shown now), elements(), screen?() → { unitsH,
   *  center } }. opts: { grid (units, 0 = none), spacing (units a beat for the ring, 0 = none), window (s around the playhead) } */
  function attach(host, store, opts = {}) {
    const cv = host.canvas(), parent = cv && cv.parentElement;
    if (!cv || !parent) return { detach() {}, refresh() {}, state: {} };
    const state = { grid: num(opts.grid, 0), spacing: num(opts.spacing, 0), drag: null, raf: 0, hover: null };
    const over = document.createElement('canvas');
    over.className = 'geoui-pathedit';
    over.style.cssText = 'position:absolute;pointer-events:none;z-index:5';
    if (getComputedStyleSafe(parent).position === 'static') { state.parentPos = parent.style.position; parent.style.position = 'relative'; }
    parent.append(over);
    const ctx = over.getContext('2d');
    const seqOf = () => { const d = store.doc(), s = store.selection() || {}; return (d.sequences || []).find((q) => q.id === s.seq) || (d.sequences || [])[0] || null; };
    const mapOf = () => mapping(host.frameRect(), host.screen ? host.screen() : {});
    const els = () => (host.elements ? host.elements() : store.elements ? store.elements() : []);
    function place() {
      const r = cv.getBoundingClientRect(), pr = parent.getBoundingClientRect(), dpr = root.devicePixelRatio || 1;
      over.style.left = `${r.left - pr.left + parent.scrollLeft}px`; over.style.top = `${r.top - pr.top + parent.scrollTop}px`;
      over.style.width = `${r.width}px`; over.style.height = `${r.height}px`;
      if (over.width !== Math.round(r.width * dpr) || over.height !== Math.round(r.height * dpr)) { over.width = Math.round(r.width * dpr); over.height = Math.round(r.height * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    /** what is shown and can be dragged now: the selected path (its points, at its element), the instances out and the selected */
    function scene() {
      const seq = seqOf(), sel = store.selection() || {};
      // (no GeoUI screen in the canvas — the camera turned away from the front view: nothing drawn, the pointer the preview's)
      if (!seq || !host.frameRect()) return null;
      const map = mapOf(), E = els(), path = sel.path ? (seq.paths || []).find((p) => p.id === sel.path) : null;
      const pOrigin = path ? restOf(E, pathTarget(seq, path.id)) : null;
      const selected = new Set(sel.instances || []), t = store.time(), w = num(opts.window, 2);
      const xs = T.view ? T.view.instancesIn(seq, t - w, t + w) : (seq.instances || []).filter((x) => Math.abs(x.t - t) <= w);
      const shown = [...xs.slice(0, 600), ...(seq.instances || []).filter((x) => selected.has(x.id) && Math.abs(x.t - t) > w)];
      const inst = shown.map((x) => ({ x, at: (() => { const o = restOf(E, placeTarget(seq, x.template)); return [o[0] + num(x.params && x.params.x), o[1] + num(x.params && x.params.y)]; })(), sel: selected.has(x.id) }));
      return { seq, sel, map, path, pOrigin, inst };
    }
    function paint() {
      place();
      const r = cv.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      const S = scene();
      if (!S) return;
      const { seq, map, path, pOrigin, inst } = S, P = (o, p) => map.toPx([o[0] + p[0], o[1] + p[1]]);
      const rect = host.frameRect();
      if (state.grid > 0 && (path || inst.some((i) => i.sel))) {
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
        const step = state.grid * map.k;
        if (step >= 6) { for (let x = rect.x + ((rect.w / 2) % step); x < rect.x + rect.w; x += step) { ctx.beginPath(); ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h); ctx.stroke(); } for (let y = rect.y + ((rect.h / 2) % step); y < rect.y + rect.h; y += step) { ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke(); } }
      }
      // the sequence's paths (faint), the selected one with its points
      for (const p of seq.paths || []) {
        if (p === path) continue;
        const o = restOf(els(), pathTarget(seq, p.id)), tb = M().pathTable(p);
        ctx.strokeStyle = 'rgba(160,170,190,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); tb.pts.forEach((q, i) => (i ? ctx.lineTo(...P(o, q)) : ctx.moveTo(...P(o, q)))); ctx.stroke();
      }
      if (path) {
        const pts = state.drag && state.drag.kind === 'point' ? state.drag.points : path.points, tb = M().pathTable(Object.assign({}, path, { points: pts }));
        ctx.strokeStyle = 'rgba(255,207,74,0.45)'; ctx.setLineDash([4, 3]); ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(...P(pOrigin, q)) : ctx.moveTo(...P(pOrigin, q)))); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 2; ctx.beginPath(); tb.pts.forEach((q, i) => (i ? ctx.lineTo(...P(pOrigin, q)) : ctx.moveTo(...P(pOrigin, q)))); ctx.stroke();
        pts.forEach((q, i) => { const [x, y] = P(pOrigin, q); ctx.fillStyle = i === 0 ? '#ff7a59' : state.hover === i ? '#ffffff' : '#ffcf4a'; ctx.fillRect(x - 4, y - 4, 8, 8); });
      }
      // the instances out now (faint) and the selected (white; moved while dragged); the ring of distance snap
      const d = state.drag && state.drag.kind === 'inst' ? state.drag : null;
      for (const i of inst) {
        const at = d && i.sel ? [i.at[0] + d.dx, i.at[1] + d.dy] : i.at, [x, y] = map.toPx(at);
        ctx.strokeStyle = i.sel ? '#ffffff' : 'rgba(197,140,255,0.5)'; ctx.lineWidth = i.sel ? 2 : 1;
        ctx.beginPath(); ctx.arc(x, y, i.sel ? 7 : 4, 0, 2 * Math.PI); ctx.stroke();
      }
      if (d && d.ring) { const [x, y] = map.toPx(d.ring.at); ctx.strokeStyle = 'rgba(111,155,255,0.6)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, d.ring.r * map.k, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    }
    const draw = () => { if (!state.raf) state.raf = (root.requestAnimationFrame || ((f) => setTimeout(f, 16)))(() => { state.raf = 0; paint(); }); };
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const send = (it) => { const r = store.dispatch(it); if (r && !r.ok && opts.say) opts.say(r.error); return r; };
    const ours = (e) => { e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); e.preventDefault(); };
    const onDown = (e) => {
      if (e.button !== 0) return;
      const S = scene();
      if (!S) return;
      const [px, py] = local(e);
      if (S.path) {
        const i = hitPoint(S.path.points, S.pOrigin, S.map, px, py);
        if (i >= 0 && e.altKey) { ours(e); if (S.path.points.length > 2) send(setPoints(S.seq, S.path, S.path.points.filter((_, j) => j !== i))); return; }
        if (i >= 0) { ours(e); state.drag = { kind: 'point', i, points: S.path.points.map((q) => q.slice()), p0: S.path.points[i].slice(), m0: S.map.toModel([px, py]) }; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); return; }
        if (e.ctrlKey || e.metaKey) {
          ours(e);
          const m = S.map.toModel([px, py]), q = snapPoint([m[0] - S.pOrigin[0], m[1] - S.pOrigin[1]], { grid: state.grid }), at = insertAt(S.path.points, S.pOrigin, S.map, px, py);
          const pts = S.path.points.slice(); pts.splice(at, 0, q); send(setPoints(S.seq, S.path, pts)); return;
        }
      }
      // (the selected first, then the nearest: instances out at once may lie on one another)
      const dist = (i) => { const [x, y] = S.map.toPx(i.at); return Math.hypot(x - px, y - py); };
      const hit = S.inst.filter((i) => dist(i) <= 8).sort((a, b) => (b.sel - a.sel) || dist(a) - dist(b))[0];
      if (hit) {
        ours(e);
        if (!hit.sel) store.select({ ...(store.selection() || {}), instances: e.shiftKey ? [...((store.selection() || {}).instances || []), hit.x.id] : [hit.x.id] });
        const b = before(S.seq, hit.x), ring = b && state.spacing > 0 ? { at: S.inst.find((i) => i.x === b.inst) ? S.inst.find((i) => i.x === b.inst).at : (() => { const o = restOf(els(), placeTarget(S.seq, b.inst.template)); return [o[0] + num(b.inst.params.x), o[1] + num(b.inst.params.y)]; })(), r: state.spacing * b.beats } : null;
        state.drag = { kind: 'inst', id: hit.x.id, at0: hit.at, m0: S.map.toModel([px, py]), dx: 0, dy: 0, ring };
        cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e) => {
      const S = scene();
      if (!S) return;
      const [px, py] = local(e);
      if (!state.drag) { const h0 = state.hover; state.hover = S.path ? hitPoint(S.path.points, S.pOrigin, S.map, px, py) : -1; if (state.hover >= 0 || S.inst.some((i) => { const [x, y] = S.map.toPx(i.at); return Math.hypot(x - px, y - py) <= 8; })) cv.style.cursor = 'move'; else if (cv.style.cursor === 'move') cv.style.cursor = ''; if (h0 !== state.hover) draw(); return; }
      ours(e);
      const d = state.drag;
      // (what was grabbed moves with the pointer — by as much as it moved, not to it — then snaps; Alt: no snapping)
      const m = S.map.toModel([px, py]), dm = [m[0] - d.m0[0], m[1] - d.m0[1]];
      if (d.kind === 'point') { const q = [d.p0[0] + dm[0], d.p0[1] + dm[1]]; d.points[d.i] = e.altKey ? [r4(q[0]), r4(q[1])] : snapPoint(q, { grid: state.grid }); }
      else { const q = [d.at0[0] + dm[0], d.at0[1] + dm[1]], want = e.altKey ? q : snapPoint(q, { grid: state.grid, prev: d.ring && d.ring.at, ring: d.ring && d.ring.r }); d.dx = r4(want[0] - d.at0[0]); d.dy = r4(want[1] - d.at0[1]); }
      draw();
    };
    const onUp = (e) => {
      const d = state.drag;
      if (!d) return;
      ours(e); state.drag = null;
      const S = scene();
      if (S && d.kind === 'point' && S.path) send(setPoints(S.seq, S.path, d.points));
      if (S && d.kind === 'inst' && (d.dx || d.dy)) send({ seq: S.seq.id, type: 'instance.move', ids: (store.selection() || {}).instances || [d.id], dt: 0, dx: d.dx, dy: d.dy });
      draw();
    };
    const listeners = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp]];
    for (const [ev, fn] of listeners) cv.addEventListener(ev, fn, true);
    const ro = root.ResizeObserver ? new root.ResizeObserver(draw) : null;
    if (ro) ro.observe(cv);
    const unsub = store.subscribe(draw);
    paint();
    return {
      state, refresh: paint, overlay: over,
      setGrid(g) { state.grid = num(g, 0); draw(); }, setSpacing(s) { state.spacing = num(s, 0); draw(); },
      detach() { unsub && unsub(); ro && ro.disconnect(); for (const [ev, fn] of listeners) cv.removeEventListener(ev, fn, true); if (state.raf && root.cancelAnimationFrame) root.cancelAnimationFrame(state.raf); over.remove(); if (state.parentPos !== undefined) parent.style.position = state.parentPos; },
    };
  }
  function getComputedStyleSafe(e) { try { return root.getComputedStyle ? root.getComputedStyle(e) : { position: e.style.position || 'static' }; } catch { return { position: 'static' }; } }

  T.pathedit = { mapping, restOf, pathTarget, placeTarget, hitPoint, insertAt, snapPoint, before, setPoints, attach };
  if (typeof module === 'object' && module && module.exports) module.exports = T.pathedit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/player.js
(function (module) {
// GeoUI timeline — the player (bds/geoui/timeline/PLAN.md step 7): the preview's transport and clock. Its time is "where it
// started + the clock's time since × the rate", never a sum of frame times (a frame drawn late is late, not behind), and the
// clock is the audio's own while there is sound (WebAudio's currentTime, less its output latency: the picture follows what is
// heard — there is no drift to measure and correct). A loop over the in/out range, seeking, stepping by frames, J/K/L's rates.
// Each frame the sequence is evaluated (model.evaluate: the same values the export's Molang computes) and handed to the host to
// draw; instances' hits are the autoplay's (every instance hit on its time: what a trigger clip shows), or misses, or none.
// The audio clips play through WebAudio where they lie on the timeline (a few seconds ahead are scheduled; a seek, a pause, a
// new rate or a loop's turn start them again), each with its volume and pitch, muted / solo as their tracks.
// Frames for a video: renderFrames, and exportVideo — webm through MediaRecorder (a canvas stream, a frame requested at each
// frame's moment, the audio mixed in), or the frames as PNGs in a zip (media.zipStore).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const M = () => T.model;
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const LOOK = 3;   // (seconds of audio scheduled ahead)

  /** the browser's clock: seconds, and its frames */
  const browserClock = () => ({
    now: () => (root.performance ? root.performance.now() : Date.now()) / 1000,
    raf: (f) => (root.requestAnimationFrame ? root.requestAnimationFrame(f) : setTimeout(() => f(Date.now()), 16)),
    caf: (id) => (root.cancelAnimationFrame ? root.cancelAnimationFrame(id) : clearTimeout(id)),
    wait: (s) => new Promise((r) => setTimeout(r, Math.max(0, s * 1000))),
  });

  /** WebAudio for the player: o.context (an AudioContext), o.buffer(id) → an AudioBuffer or null (decoding then: the player
   *  asks again next frame). Its clock is the context's; every source it starts can be stopped at once */
  function createAudio(o) {
    const ctx = o.context, live = new Set();
    let dest = ctx.destination, extra = null;
    return {
      context: ctx,
      now: () => ctx.currentTime,
      running: () => ctx.state === 'running',
      resume: () => (ctx.resume ? ctx.resume() : Promise.resolve()),
      latency: () => num(ctx.outputLatency, 0) || num(ctx.baseLatency, 0),
      buffer: (id) => o.buffer(id),
      /** also to another destination while a video is recorded (null: no longer) */
      tap(node) { extra = node || null; },
      start({ buffer, when, offset, duration, volume = 1, rate = 1 }) {
        const src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buffer; src.playbackRate.value = rate; g.gain.value = volume;
        src.connect(g); g.connect(dest); if (extra) g.connect(extra);
        src.start(Math.max(ctx.currentTime, when), Math.max(0, offset), Math.max(0.001, duration));
        live.add(src);
        src.onended = () => { live.delete(src); try { g.disconnect(); } catch (e) { /* (gone) */ } };
        return src;
      },
      stopAll() { for (const s of live) { try { s.stop(); } catch (e) { /* (not started yet or ended) */ } } live.clear(); },
      /** how many of its sources are started and not ended (scheduled ones too) */
      count: () => live.size,
      dispose() { this.stopAll(); extra = null; },
    };
  }

  /** the hits of an autoplay: every instance of a template that answers a hit (or a miss) at its own time */
  function autoEvents(seq, name = 'hit') {
    const judged = new Set((seq.templates || []).filter((tp) => tp.tracks.some((tr) => tr.clips.some((c) => c.trigger || c.until))).map((tp) => tp.id));
    return (seq.instances || []).filter((x) => judged.has(x.template)).map((x) => ({ instance: x.id, name, t: name === 'miss' ? x.t + 0.15 : x.t }));
  }

  /** the audio clips of a sequence that sound (muted tracks not; with a solo audio track, only the solo ones) */
  function audioClips(seq) {
    const tracks = (seq.tracks || []).filter((tr) => tr.kind === 'audio');
    const solo = tracks.some((tr) => tr.solo);
    const out = [];
    for (const tr of tracks) if (!tr.muted && (!solo || tr.solo)) for (const c of tr.clips) if (c.sound) out.push({ id: c.id, sound: c.sound, start: c.start, end: c.end, offset: num(c.offset), volume: num(c.volume, 1), pitch: num(c.pitch, 1) || 1 });
    return out.sort((a, b) => a.start - b.start);
  }

  /** o: { store (doc(), selection(), timeChanged()), host: { apply(states, t, seq), clear?(), capture?({ scale }) → Promise<bytes>,
   *  frameCanvas?({ scale }) → a canvas the frame is drawn into for a video }, clock (browserClock's shape), audio
   *  (createAudio's or null), events: 'hit' | 'miss' | 'none', onTime(t) } */
  function createPlayer(o = {}) {
    const store = o.store, host = o.host || { apply() {} }, base = o.clock || browserClock(), audio = o.audio || null;
    const evaluate = o.evaluate || ((d, s, t, opts) => M().evaluate(d, s, t, opts));
    const st = { playing: false, rate: 1, anchorT: 0, anchorC: 0, clock: base, latency: 0, raf: 0, loop: true, range: null, events: o.events || 'hit',
      run: 0, scheduled: new Set(), cache: { doc: null, seq: null, events: null, clips: null }, disposed: false, last: 0 };
    const seqOf = () => { const d = store.doc(), s = store.selection ? store.selection() : {}; return (d.sequences || []).find((q) => q.id === (s && s.seq)) || (d.sequences || [])[0] || null; };
    /** the sequence's events and audio clips, made again only when the document changed (an audio clip edited while playing:
     *  the sounds started again from where the time is, as they now lie) */
    function prepared() {
      const d = store.doc(), seq = seqOf();
      if (st.cache.doc !== d || st.cache.seq !== seq) {
        const clips = seq ? audioClips(seq) : [], sig = JSON.stringify(clips);
        if (st.playing && st.cache.sig !== undefined && sig !== st.cache.sig) silence();
        // (a game — osu!: osugame.js — plays itself: its events and its live states (the cursor, the score…) from its autoplay;
        //  'miss' shows it missing everything, 'none' nothing pressed)
        const game = seq && seq.game && T.osugame ? (st.events === 'hit' ? T.osugame.autoplay(seq.game, { fps: 60 }) : null) : null;
        // (and its hitsounds, where the autoplay hits: a short clip each, the sound's id in the project without the namespace)
        if (game) for (const [i, [id, t]] of game.sounds.entries()) clips.push({ id: `gs${i}`, sound: String(id).replace(/^[^.]*\./, ''), start: t, end: t + 0.8, offset: 0, volume: 0.7, pitch: 1 });
        st.cache = { doc: d, seq, events: game ? game.events : seq && st.events !== 'none' ? autoEvents(seq, st.events) : [], clips, sig, game };
      }
      return st.cache;
    }
    const rangeOf = (seq) => { if (st.range) return st.range; if (seq && seq.inOut) return seq.inOut; return [0, seq ? seq.duration : 0]; };
    const raw = () => (st.playing ? st.anchorT + Math.max(0, st.clock.now() - st.anchorC - st.latency) * st.rate : st.anchorT);
    function anchor(t) { st.anchorT = t; st.anchorC = st.clock.now(); }
    function silence() { if (audio) audio.stopAll(); st.scheduled = new Set(); st.run++; }
    /** the audio clips that start (or sound) within the next LOOK seconds of timeline time t, each once a run; whenOf(x): the
     *  audio clock's time at which timeline time x is to be heard */
    function schedule(t, rate, whenOf) {
      if (!audio || !(rate > 0)) return;
      const { clips, seq } = prepared(), [, end] = rangeOf(seq), ahead = t + LOOK * rate;
      for (const c of clips) {
        if (st.scheduled.has(c.id) || c.end <= t + 1e-6 || c.start >= ahead || c.start >= end) continue;
        const buf = audio.buffer(c.sound);
        if (!buf) continue;   // (decoding: asked again next frame, then from where the time is)
        const from = Math.max(c.start, t), until = Math.min(c.end, end);
        if (until - from <= 1e-6) continue;
        st.scheduled.add(c.id);
        audio.start({ buffer: buf, when: whenOf(from), offset: c.offset + (from - c.start) * c.pitch, duration: (until - from) * c.pitch, volume: c.volume, rate: rate * c.pitch });
      }
    }
    /** while playing: timeline time x is shown at the audio clock's anchorC + latency + (x − anchorT) / rate, so a sound for x
     *  starts at anchorC + (x − anchorT) / rate and is heard (after the output's latency) as the picture shows x */
    const playing = (t) => { if (st.playing && audio) schedule(t, st.rate, (x) => st.anchorC + (x - st.anchorT) / st.rate); };
    function render(t) {
      const seq = seqOf();
      if (!seq) { if (host.apply) host.apply({}, t, null); return; }
      const { events, game } = prepared();
      host.apply(evaluate(store.doc(), seq.id, t, { events, state: game ? game.at(t) : undefined }), t, seq);
    }
    function told(t) { st.last = t; if (o.onTime) o.onTime(t); if (store.timeChanged) store.timeChanged(); }
    function frame() {
      st.raf = 0;
      if (!st.playing || st.disposed) return;
      const seq = seqOf(), [a, b] = rangeOf(seq);
      let t = raw();
      if (st.rate > 0 && t >= b) {
        if (st.loop && b > a) { t = a + ((t - a) % (b - a)); anchor(t); silence(); }
        else { t = b; api.pause(); api.seekTo(b); return; }
      } else if (st.rate < 0 && t <= a) {
        if (st.loop && b > a) { t = b - ((a - t) % (b - a)); anchor(t); }
        else { t = a; api.pause(); api.seekTo(a); return; }
      }
      playing(t);
      render(t);
      told(t);
      st.raf = st.clock.raf(frame);
    }
    function start() {
      // (the audio's clock while there is sound to hear; the browser's otherwise)
      const useAudio = !!(audio && prepared().clips.length && st.rate > 0);
      if (useAudio && !audio.running()) audio.resume();
      st.clock = useAudio ? { now: audio.now, raf: base.raf, caf: base.caf } : base;
      st.latency = useAudio ? audio.latency() : 0;
      anchor(st.anchorT);
      if (!st.raf) st.raf = st.clock.raf(frame);
    }
    const api = {
      time: () => (st.playing ? Math.max(0, raw()) : st.anchorT),
      playing: () => st.playing,
      play() {
        if (st.playing || st.disposed) return;
        const seq = seqOf(), [a, b] = rangeOf(seq);
        // (from the start of the range when at its end — or before it)
        if (st.rate > 0 && (st.anchorT >= b - 1e-6 || st.anchorT < a)) st.anchorT = a;
        if (st.rate < 0 && st.anchorT <= a + 1e-6) st.anchorT = b;
        st.playing = true; silence(); start();
        told(st.anchorT);
      },
      pause() {
        if (!st.playing) return;
        st.anchorT = Math.max(0, raw()); st.playing = false;
        if (st.raf) { st.clock.caf(st.raf); st.raf = 0; }
        silence(); render(st.anchorT); told(st.anchorT);
      },
      toggle() { if (st.playing) api.pause(); else api.play(); },
      stop() { const was = st.playing; if (was) api.pause(); api.seekTo(rangeOf(seqOf())[0]); },
      seekTo(t) {
        const v = Math.max(0, num(t));
        if (st.playing) { anchor(v); silence(); playing(v); } else st.anchorT = v;
        render(v); told(v);
      },
      step(n = 1) { const seq = seqOf(), fps = (seq && seq.fps) || 20; if (st.playing) api.pause(); api.seekTo(Math.max(0, Math.round((st.anchorT + num(n, 1) / fps) * fps) / fps)); },
      /** J/K/L's rates: 1, 2, −1 … (a new anchor: the time goes on from where it is) */
      rate(r) { const v = num(r, 1) || 1; if (v === st.rate) return; const t = api.time(); st.rate = v; if (st.playing) { st.anchorT = t; silence(); start(); } },
      getRate: () => st.rate,
      setLoop(on) { st.loop = !!on; },
      /** the range played (and looped): [a, b] seconds, or null for the sequence's in/out (else all of it) */
      setRange(r) { st.range = Array.isArray(r) && r.length === 2 && r[1] > r[0] ? [num(r[0]), num(r[1])] : null; },
      range: () => rangeOf(seqOf()),
      setEvents(kind) { st.events = ['hit', 'miss', 'none'].includes(kind) ? kind : 'hit'; st.cache.doc = null; if (!st.playing) render(st.anchorT); },
      /** draw the time now again (the document or the sequence changed) */
      refresh() { if (!st.playing) render(st.anchorT); },
      render,
      /** every frame of [from, to) at fps drawn, each handed to each(i, t) (awaited) */
      async renderFrames({ from = 0, to, fps = 30, each, signal } = {}) {
        const seq = seqOf(), end = to !== undefined ? num(to) : rangeOf(seq)[1], n = Math.max(0, Math.ceil((end - num(from)) * fps - 1e-9));
        if (st.playing) api.pause();
        for (let i = 0; i < n; i++) {
          if (signal && signal.aborted) throw abortError();
          const t = num(from) + i / fps;
          render(t);
          if (each) await each(i, t, n);
        }
        return n;
      },
      /** a video of [from, to): { format: 'webm' | 'png-zip', fps, scale, background (webm: a colour under the screen, black when
       *  not given; null: clear — VP9 keeps the alpha), pngBackground (PNGs: clear unless given), onProgress(done, all), signal }
       *  → { data (Blob | bytes), frames, mime } */
      async exportVideo(opts = {}) {
        const fps = Math.max(1, Math.min(120, num(opts.fps, 30))), seq = seqOf(), [a, b] = rangeOf(seq);
        const from = opts.from !== undefined ? num(opts.from) : a, to = opts.to !== undefined ? num(opts.to) : b, format = opts.format || 'webm';
        if (!(to > from)) throw new Error('書き出す範囲がありません（終わりが始まりより後に）');
        const back = st.anchorT, progress = opts.onProgress || (() => {});
        try {
          if (format === 'png-zip') {
            if (!host.capture) throw new Error('この画面からはコマを取り出せません');
            const files = [];
            const n = await api.renderFrames({ from, to, fps, signal: opts.signal, each: async (i, t, all) => { files.push({ name: `frame_${String(i).padStart(5, '0')}.png`, data: await host.capture({ scale: opts.scale, background: opts.pngBackground || null }) }); progress(i + 1, all); } });
            files.push({ name: 'frames.txt', data: `GeoUI timeline: ${n} frames at ${fps} fps, ${from}–${to} s (frame_00000.png = ${from} s)\n` });
            return { data: T.media.zipStore(files), frames: n, mime: 'application/zip' };
          }
          if (format !== 'webm') throw new Error(`知らない形式: ${format}`);
          return await recordWebm({ from, to, fps, scale: opts.scale, background: opts.background === undefined ? '#000000' : opts.background, signal: opts.signal, progress });
        } finally { api.seekTo(back); }
      },
      dispose() {
        st.disposed = true; st.playing = false;
        if (st.raf) { st.clock.caf(st.raf); st.raf = 0; }
        silence(); if (audio && audio.dispose) audio.dispose();
        if (host.clear) host.clear();
      },
      state: st,
    };
    const abortError = () => { const e = new Error('書き出しをやめました'); e.name = 'AbortError'; return e; };
    /** webm: a canvas the host draws each frame into, its stream with a frame requested at each frame's moment (real time: a
     *  video player shows them as they were made), the audio clips played into it as they lie */
    async function recordWebm({ from, to, fps, scale, background, signal, progress }) {
      const R = root.MediaRecorder;
      if (!R || !host.frameCanvas) throw new Error('この環境では webm を作れません（MediaRecorder がありません）: PNG の連番（zip）で書き出してください');
      const cv = host.frameCanvas({ scale }), stream = cv.captureStream(0), track = stream.getVideoTracks()[0];
      let mixed = null, hum = null;
      const { clips } = prepared();
      if (audio && clips.length && audio.context.createMediaStreamDestination) {
        mixed = audio.context.createMediaStreamDestination(); audio.tap(mixed);
        // (a silent source into it from the start: a destination with nothing playing gives the recorder no audio, and it then
        //  keeps every video frame waiting for some — the file would hold nothing)
        if (audio.context.createConstantSource) { const c = audio.context.createConstantSource(), g = audio.context.createGain(); g.gain.value = 0; c.connect(g); g.connect(mixed); c.start(); hum = c; }
        for (const t of mixed.stream.getAudioTracks()) stream.addTrack(t);
      }
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => !R.isTypeSupported || R.isTypeSupported(m)) || 'video/webm';
      const rec = new R(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }), parts = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      const done = new Promise((ok) => { rec.onstop = ok; });
      const n = Math.max(1, Math.ceil((to - from) * fps - 1e-9));
      if (st.playing) api.pause();
      // (the frames on the browser's clock — the recorder stamps a video frame with the moment it is requested — and the audio
      //  as when playing from `from` at rate 1 on the audio clock, from the same moment: what the recorder takes in is not delayed
      //  by the speakers' latency, so timeline time x is heard at ta + (x − from). Not the audio clock for the frames: with no
      //  sound device — a headless browser — it may run faster than the wall, and the recorder then gets nothing in order)
      const useAudio = !!mixed, sleep = (s) => (base.wait ? base.wait(s) : new Promise((r) => setTimeout(r, s * 1000)));
      if (useAudio && !audio.running()) await audio.resume();
      // (every sound decoded before: one still decoding would be missing from the file — 3 s at most)
      if (useAudio) { const ids = [...new Set(clips.map((c) => c.sound))]; for (let k = 0; k < 60 && ids.some((id) => !audio.buffer(id)); k++) await sleep(0.05); }
      // (the first frame drawn once before: its shaders compiled, its canvases made — a first frame that comes late to a recorder
      //  just started left a file with nothing in it; and the recorder given a moment to start before the frames come)
      render(from);
      if (host.drawFrame) host.drawFrame(cv, { scale, background });
      silence();
      rec.start(1000);
      await sleep(0.2);
      const clock = base, t0 = clock.now() + 0.05, ta = useAudio ? audio.now() + 0.05 : 0, whenOf = (x) => ta + (x - from);
      try {
        for (let i = 0; i < n; i++) {
          if (signal && signal.aborted) throw abortError();
          const t = from + i / fps;
          if (useAudio && i % Math.max(1, Math.round(fps)) === 0) schedule(t, 1, whenOf);
          const due = t0 + i / fps, wait = due - clock.now();
          if (wait > 0) await sleep(wait);
          render(t);
          if (host.drawFrame) host.drawFrame(cv, { scale, background });
          if (track.requestFrame) track.requestFrame();
          progress(i + 1, n);
        }
        // (the last frame's own time, and a little more: the encoder still has frames in hand when the last one is asked)
        const tail = t0 + n / fps - clock.now() + Math.max(0.3, 2 / fps);
        if (tail > 0) await sleep(tail);
      } finally {
        if (rec.state !== 'inactive') rec.stop();
        await done;
        silence(); if (audio) audio.tap(null);
        if (hum) { try { hum.stop(); hum.disconnect(); } catch (e) { /* (ended) */ } }
        for (const t of stream.getTracks()) t.stop();
      }
      return { data: new root.Blob(parts, { type: mime.split(';')[0] }), frames: n, mime: mime.split(';')[0] };
    }
    return api;
  }

  T.player = { createPlayer, createAudio, browserClock, autoEvents, audioClips, LOOK };
  if (typeof module === 'object' && module && module.exports) module.exports = T.player;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/compile.js
(function (module) {
// GeoUI timeline — compile: a timeline document into the resource pack GeoUI Builder exports (bds/geoui/timeline/PLAN.md step 3).
// Every value is worked out in the client entity's pre_animation, one Molang variable per channel; each sequence's animation
// only moves its bones by those variables, and per-element render controllers take their opacity and flipbook frame from them.
// The Molang is the model's own arithmetic written out (model.evaluate is the preview): tests/tl-anim-offline.mjs runs it
// frame by frame in GeoUI Builder's Molang evaluator and compares every element with model.evaluate.
// Time: the server sets <ns>:seq (the sequence, paused or not, and a generation: contract.js) and <ns>:seq_from (ms); the
// client counts from the moment it sees seq change (q.life_time). Many instances of a template are drawn by slots (copies of
// its bones, contract.js): baked (each slot's instances written into the Molang as short lookups — groups of 16, a balanced
// tree in each: a frame works out a few comparisons however many there are) or streamed (the script puts the next instance
// into the slot's properties before it shows). An instance's own path (an osu! slider's) is an animation of its own, timed by
// anim_time_update. Hits and misses: <ns>:<tag>e<g>, 3 bits a slot. Every line is cut short at the end (splitLines): the
// game stops an entity at a line past its limits.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const Mo = () => T.model, Ko = () => T.contract;
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  // (numbers in the Molang: 6 decimals — the model's own numbers to well under the 1e-3 the tests hold it to)
  const n = (x) => { const v = Math.round(num(x) * 1e6) / 1e6; return String(Object.is(v, -0) ? 0 : v); };
  const EPS = '0.000001';
  const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'e';
  const J = (o) => JSON.stringify(o, null, 2) + '\n';
  const parse = (f) => JSON.parse(typeof f === 'string' ? f : JSON.stringify(f));

  // ---------------------------------------------------------------------------------------------------------------- easing
  const C1 = 1.70158, C2 = C1 * 1.525, C3 = C1 + 1;
  const POWM = (k) => (u) => `math.pow(${u}, ${k})`;
  function bounceOutM(u) {
    const a = 7.5625, d = 2.75, sq = (c) => `${a} * (${u} - ${n(c)}) * (${u} - ${n(c)})`;
    return `(${u} < ${n(1 / d)} ? ${a} * ${u} * ${u} : (${u} < ${n(2 / d)} ? ${sq(1.5 / d)} + 0.75 : (${u} < ${n(2.5 / d)} ? ${sq(2.25 / d)} + 0.9375 : ${sq(2.625 / d)} + 0.984375)))`;
  }
  const IN = {
    sine: (u) => `(1 - math.cos(${u} * 90))`,
    quad: (u) => `(${u} * ${u})`, cubic: POWM(3), quart: POWM(4), quint: POWM(5),
    expo: (u) => `((math.pow(2, 10 * ${u}) - 1) / 1023)`,
    circ: (u) => `(1 - math.sqrt(math.max(0, 1 - ${u} * ${u})))`,
    back: (u) => `(${C3} * math.pow(${u}, 3) - ${C1} * ${u} * ${u})`,
    // (made to meet 0 and 1 exactly, as the model's: model.EASE_K)
    elastic: (u) => { const K = Mo().EASE_K; return `(-math.pow(2, 10 * ${u} - 10) * math.sin((${u} * 10 - 10.75) * 120) - ${K.ei0} * (1 - ${u}) - ${K.ei1 - 1} * ${u})`; },
    bounce: (u) => `(1 - ${bounceOutM(`(1 - ${u})`)})`,
  };
  const OUT = { 'bounce-out': bounceOutM };
  const INOUT = {
    back: (u) => `(${u} < 0.5 ? math.pow(2 * ${u}, 2) * (${C2 + 1} * 2 * ${u} - ${C2}) / 2 : (math.pow(2 * ${u} - 2, 2) * (${C2 + 1} * (${u} * 2 - 2) + ${C2}) + 2) / 2)`,
    elastic: (u) => { const K = Mo().EASE_K; return `((${u} < 0.5 ? -(math.pow(2, 20 * ${u} - 10) * math.sin((20 * ${u} - 11.125) * 80)) / 2 : (math.pow(2, -20 * ${u} + 10) * math.sin((20 * ${u} - 11.125) * 80)) / 2 + 1) - ${K.eo0} * (1 - ${u}) - ${K.eo1 - 1} * ${u})`; },
  };
  /** an ease of a Molang expression u (0..1) → Molang; a Bézier as 16 straight pieces (its largest error is reported) */
  function easeM(e, u, report) {
    if (e && typeof e === 'object' && Array.isArray(e.bezier)) {
      const p = Array.from({ length: 17 }, (_, i) => Mo().ease(e, i / 16));
      let err = 0;
      for (let i = 0; i < 160; i++) { const x = i / 160, k = Math.min(15, Math.floor(x * 16)); err = Math.max(err, Math.abs(Mo().ease(e, x) - (p[k] + (p[k + 1] - p[k]) * (x * 16 - k)))); }
      if (report) report.bezier = Math.max(report.bezier || 0, err);
      const seg = (i) => `${n(p[i])} + ${n((p[i + 1] - p[i]) * 16)} * (${u} - ${n(i / 16)})`;
      let s = seg(15);
      for (let i = 14; i >= 0; i--) s = `(${u} < ${n((i + 1) / 16)} ? ${seg(i)} : ${s})`;
      return s;
    }
    if (e === 'step') return '0';
    const m = /^(\w+)-(in|out|inout)$/.exec(String(e));
    if (!m || !IN[m[1]]) return u;   // linear (and anything unknown, as the model does)
    if (m[2] === 'in') return IN[m[1]](u);
    if (m[2] === 'out') return OUT[e] ? OUT[e](u) : `(1 - ${IN[m[1]](`(1 - ${u})`)})`;
    return INOUT[m[1]] ? INOUT[m[1]](u) : `(${u} < 0.5 ? ${IN[m[1]](`(2 * ${u})`)} / 2 : 1 - ${IN[m[1]](`(2 - 2 * ${u})`)} / 2)`;
  }

  // ---------------------------------------------------------------------------------------------------------------- expressions
  // the model's key expressions are Molang already (param.<name>, t, math.*): their params and t become variables
  // (state.<name>: the variable extendPack made for it — STATEV, set while it writes a pack; '0' outside one. screen.dx: the
  //  screen's half width past the reference aspect's, from GeoUI's own v.geoui_halfw — SCREENDX, set likewise)
  let STATEV = {}, SCREENDX = '0';
  function exprM(src, vars, tVar) {
    const tk = String(src).match(/\d+(?:\.\d+)?|\.\d+|[A-Za-z_][\w.]*|[-+*/(),]|\S/g) || [];
    return `(${tk.map((t) => { const m = /^(?:param|p)\.(\w+)$/.exec(t), sm = /^state\.(\w+)$/.exec(t); return m ? (vars[m[1]] || '0') : sm ? (STATEV[sm[1]] || '0') : t === 't' ? (tVar || '0') : t === 'screen.dx' ? SCREENDX : t; }).join(' ')})`;
  }
  const valM = (v, vars, tVar) => (typeof v === 'string' ? exprM(v, vars, tVar) : n(v));

  /** a channel's keys → Molang of its value at tc (a variable): channelAt's rule, a time on a key is the segment it starts */
  function keysM(keys, tc, vars, report) {
    const V = (k) => valM(k.v, vars, tc);
    if (keys.length === 1) return V(keys[0]);
    let s = V(keys[keys.length - 1]);
    for (let i = keys.length - 2; i >= 0; i--) {
      const a = keys[i], b = keys[i + 1], span = b.t - a.t;
      const seg = span > 1e-9 ? `${V(a)} + (${V(b)} - ${V(a)}) * ${easeM(a.ease, `((${tc} - ${n(a.t)}) / ${n(span)})`, report)}` : V(b);
      s = `(${tc} < ${n(b.t)} ? ${seg} : ${s})`;
    }
    return `(${tc} < ${n(keys[0].t)} ? ${V(keys[0])} : ${s})`;
  }
  /** the point along a path at a progress (a variable, 0..1) → { x, y } Molang: the path's own polyline by arc length (cut or
   *  gone on straight at its osu! length), points closer than tol to a straight run dropped first */
  function pathPoly(path, tol = 1e-9) {
    const tb = Mo().pathTable(path), L = path.length > 0 ? path.length : tb.length;
    let pts = tb.pts;
    if (pts.length > 2) {
      const keep = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = keep[keep.length - 1], b = pts[i + 1], p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len > tol) keep.push(p);
      }
      keep.push(pts[pts.length - 1]); pts = keep;
    }
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const scale = acc[acc.length - 1] > 0 ? tb.length / acc[acc.length - 1] : 1;
    // (D: how far along the polyline progress 1 is — the osu! length, past the polyline's end on straight or short of it)
    return { pts, acc, D: L / scale };
  }
  function pathM(path, u, tol = 1e-9) {
    const { pts, acc, D } = pathPoly(path, tol), d = `(math.clamp(${u}, 0, 1) * ${n(D)})`;
    const out = {};
    for (const ax of [0, 1]) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1], seg = acc[acc.length - 1] - acc[acc.length - 2];
      let s = seg > 0 ? `${n(b[ax])} + ${n((b[ax] - a[ax]) / seg)} * (${d} - ${n(acc[acc.length - 1])})` : n(b[ax]);
      for (let i = pts.length - 2; i >= 0; i--) {
        const span = acc[i + 1] - acc[i];
        if (span <= 0) continue;
        s = `(${d} < ${n(acc[i + 1])} ? ${n(pts[i][ax])} + ${n((pts[i + 1][ax] - pts[i][ax]) / span)} * (${d} - ${n(acc[i])}) : ${s})`;
      }
      out[ax ? 'y' : 'x'] = s;
    }
    return out;
  }
  /** the same path as keys over progress 0..1 → [[u, x, y]]: straight between them is pathM's polyline exactly (an animation's
   *  keys are straight between, and progress is straight in the distance) */
  function pathKeys(path, tol = 1e-9) {
    const { pts, acc, D } = pathPoly(path, tol), last = acc.length - 1;
    if (!(D > 0) || pts.length < 2) return [[0, pts[0][0], pts[0][1]]];
    const keys = [];
    for (let i = 0; i <= last && acc[i] < D - 1e-9; i++) keys.push([acc[i] / D, pts[i][0], pts[i][1]]);
    // the end, at D: inside a segment, or past the last point on along the last segment (pathM's rule)
    let i = 0;
    while (i < last - 1 && !(D < acc[i + 1])) i++;
    const a = pts[i], b = pts[i + 1], seg = acc[i + 1] - acc[i], f = seg > 0 ? (D - acc[i]) / seg : 0;
    keys.push([1, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    return keys;
  }
  /** a transition (at p, a Molang expression 0..1) as Molang terms: added to x / y, multiplied into opacity / scale */
  function transM(kind, p) {
    const S = String(Mo().SLIDE);
    if (kind === 'fade') return { o: p };
    if (kind === 'slide-left') return { x: `-(1 - ${p}) * ${S}` };
    if (kind === 'slide-right') return { x: `(1 - ${p}) * ${S}` };
    if (kind === 'slide-up') return { y: `(1 - ${p}) * ${S}` };
    if (kind === 'slide-down') return { y: `-(1 - ${p}) * ${S}` };
    if (kind === 'zoom') return { s: p };
    if (kind === 'pop') return { s: `(${p} < 0.7 ? (${p} / 0.7) * 1.1 : 1.1 - ((${p} - 0.7) / 0.3) * 0.1)` };
    return {};
  }

  // ---------------------------------------------------------------------------------------------------------------- long lines
  // The game's limits on one Molang line (its length, how deep its brackets go) are not documented, and a line past them stops
  // the whole entity (bds-lab's probe, round 1: nothing drew). So no line is left long or deep: a part of it is worked out on a
  // line of its own first, into a variable of its own (<prefix><n>), and the line reads that variable. A chain of choices —
  // (c0 ? a0 : (c1 ? a1 : … : d)), as every table here is written — becomes a ladder: `x = d;` then `x = (ck) ? (ak) : x;`
  // from the last choice to the first, so a choice's value is still worked out only when its condition holds. Only parts the
  // grammar marks off whatever its precedences (a bracket, an argument, a condition or a branch of a choice, an operand of
  // + - * / < > <= >= == != && ||) are cut out; a part that reads a property outside the paper doll's guard never is (worked
  // out on its own line it would be read where the guard said not to).
  const OPS2 = ['&&', '||', '==', '!=', '<=', '>=', '??'];
  const PREC = { '??': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7 };
  function mtokens(s) {
    const out = [];
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/\d/.test(c) || (c === '.' && /\d/.test(s[i + 1] || ''))) { const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?f?/.exec(s.slice(i)); out.push({ k: 'num', s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if (/[A-Za-z_]/.test(c)) { const m = /^[A-Za-z_][\w.]*/.exec(s.slice(i)); out.push({ k: 'id', v: m[0].toLowerCase(), s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if (c === "'" || c === '"') { const j = s.indexOf(c, i + 1); if (j < 0) throw new Error('closing quote'); out.push({ k: 'str', s: i, e: j + 1 }); i = j + 1; continue; }
      const two = s.slice(i, i + 2);
      if (OPS2.includes(two)) { out.push({ k: 'op', v: two, s: i, e: i + 2 }); i += 2; continue; }
      if ('+-*/<>!?:(),'.includes(c)) { out.push({ k: 'op', v: c, s: i, e: i + 1 }); i++; continue; }
      throw new Error(`character ${c}`);
    }
    return out;
  }
  /** an expression → a tree of { t, s, e, kids } over its own text (t: num str id call un bin if paren) */
  function mparse(src) {
    const tk = mtokens(src); let p = 0;
    const is = (v) => tk[p] && tk[p].k === 'op' && tk[p].v === v;
    const eat = (v) => { if (!is(v)) throw new Error(`expected ${v}`); return tk[p++]; };
    function primary() {
      const x = tk[p++];
      if (!x) throw new Error('end of expression');
      if (x.k === 'num' || x.k === 'str') return { t: x.k, s: x.s, e: x.e, kids: [] };
      if (x.k === 'op' && x.v === '(') { const inner = ternary(); const close = eat(')'); return { t: 'paren', s: x.s, e: close.e, kids: [inner] }; }
      if (x.k === 'id') {
        if (is('(')) { p++; const args = []; if (!is(')')) { args.push(ternary()); while (is(',')) { p++; args.push(ternary()); } } const close = eat(')'); return { t: 'call', id: x.v, s: x.s, e: close.e, kids: args }; }
        return { t: 'id', id: x.v, s: x.s, e: x.e, kids: [] };
      }
      throw new Error(`unexpected ${x.v}`);
    }
    function unary() { if (is('-') || is('!') || is('+')) { const op = tk[p++]; const a = unary(); return { t: 'un', op: op.v, s: op.s, e: a.e, kids: [a] }; } return primary(); }
    function binary(min) {
      let a = unary();
      for (;;) {
        const o = tk[p];
        if (!o || o.k !== 'op' || !(PREC[o.v] >= min)) return a;
        p++;
        const b = binary(PREC[o.v] + 1);
        a = { t: 'bin', op: o.v, s: a.s, e: b.e, kids: [a, b] };
      }
    }
    function ternary() {
      const c = binary(1);
      if (!is('?')) return c;
      p++;
      const a = ternary();
      if (!is(':')) return { t: 'if', s: c.s, e: a.e, kids: [c, a] };
      p++;
      const b = ternary();
      return { t: 'if', s: c.s, e: b.e, kids: [c, a, b] };
    }
    const tree = ternary();
    if (p < tk.length) throw new Error(`unexpected ${tk[p].v || tk[p].k}`);
    return tree;
  }
  /** lines (`name = expression;`, or anything else kept as it is) → the same values with no line over `limit` characters and
   *  no bracket deeper than `depth` (beyond a part that cannot be cut: said in `uncut`). → { lines, cuts, uncut } */
  function splitLines(lines, { limit = 1000, depth = 24, prefix = 'v.geoui__' } = {}) {
    const out = [], uncut = [];
    let n = 0, cuts = 0;
    for (const line of lines) {
      const m = /^\s*([A-Za-z_][\w.]*)\s*=\s*([\s\S]*?);?\s*$/.exec(line);
      if (line.length <= limit && maxDepth(line) <= depth) { out.push(line); continue; }
      let tree = null;
      // (a part the grammar here does not know — or nested past what a parse of it can hold — is kept as it is, and said)
      if (m && !/[;{}]/.test(m[2])) { try { tree = mparse(m[2]); } catch (e) { tree = null; } }
      if (!tree) { out.push(line); uncut.push(line.slice(0, 80)); continue; }
      const src = m[2], room = Math.max(40, limit - m[1].length - 4), DEEP = Math.max(4, depth - 2);
      // (each part's length and depth as it now stands — a part cut out is a variable: its name's length, no depth)
      const isGuard = (x) => { if (x.t !== 'if' || x.kids.length < 3) return false; let c = x.kids[0]; while (c.t === 'paren') c = c.kids[0]; return c.t === 'id' && /^(v|variable)\.is_paperdoll$/.test(c.id); };
      const measure = (x) => {
        let len = x.e - x.s, dep = 0, ung = x.t === 'call' && /^(q|query)\.property$/.test(x.id);
        for (const k of x.kids) { len += k.len - (k.e - k.s); dep = Math.max(dep, k.dep); if (k.ung) ung = true; }
        x.len = len; x.dep = dep + (x.t === 'paren' || x.t === 'call' ? 1 : 0); x.ung = ung && !isGuard(x);
      };
      const text = (x) => {
        if (x.rep) return x.rep;
        let s = '', at = x.s;
        for (const k of x.kids) { s += src.slice(at, k.s) + text(k); at = k.e; }
        return s + src.slice(at, x.e);
      };
      const replace = (x, v) => { x.rep = v; x.len = v.length; x.dep = 0; x.ung = false; x.kids = []; cuts++; };
      const fits = (x) => x.len <= room && x.dep <= DEEP;
      // (a part that may stand as a variable: what the grammar marks off whatever the game's ranks are — never one that reads a
      //  property outside the paper doll's guard, nor an operand of ?? that is not in brackets)
      const cuttable = (x, parent) => !x.rep && !x.ung && x.t !== 'num' && x.t !== 'str' && x.t !== 'id' && !(parent && parent.t === 'bin' && parent.op === '??' && x.t !== 'paren');
      const hoist = (x) => { const v = `${prefix}${n++}`; out.push(`${v} = ${text(x)};`); replace(x, v); };
      const chainOf = (x) => {
        // (c0 ? a0 : (c1 ? a1 : … d)) → [[c0, a0], [c1, a1], …] and d (the first part that is not a choice)
        const steps = []; let y = x;
        for (;;) {
          while (y.t === 'paren' && !y.rep) y = y.kids[0];
          if (y.rep || y.t !== 'if' || y.kids.length < 3 || y.kids[0].ung) return { steps, rest: y };
          steps.push([y, y.kids[0], y.kids[1]]); y = y.kids[2];
        }
      };
      const ladder = (x) => {
        const { steps, rest } = chainOf(x), v = `${prefix}${n++}`;
        out.push(`${v} = ${text(rest)};`);
        for (let i = steps.length - 1; i >= 0; i--) {
          const [node, c, a] = steps[i];
          // (a step's line too long or deep: its value worked out first, then its condition — each fits alone)
          for (const part of [a, c]) if (c.len + a.len + v.length * 2 + 16 > room || Math.max(c.dep, a.dep) + 1 > DEEP) { if (cuttable(part, node)) hoist(part); }
          out.push(`${v} = (${text(c)}) ? (${text(a)}) : ${v};`);
        }
        replace(x, v);
      };
      // bottom up: a part too long or too deep is cut where it first grows past the limits
      const fit = (x, parent) => {
        for (const k of x.kids) fit(k, x);
        measure(x);
        if (fits(x)) return;
        let y = x; while (y.t === 'paren' && !y.rep) y = y.kids[0];
        if (y.t === 'if' && y.kids.length === 3 && !y.kids[0].ung && cuttable(x, parent)) { ladder(x); return; }
        const kids = x.kids.filter((k) => cuttable(k, x)).sort((p, q) => q.len - p.len || q.dep - p.dep);
        for (const k of kids) { hoist(k); measure(x); if (fits(x)) return; }
      };
      const mark = out.length;
      try { fit(tree, null); } catch (e) { out.length = mark; out.push(line); uncut.push(line.slice(0, 80)); continue; }
      const full = `${m[1]} = ${text(tree)};`;
      if (full.length > limit || maxDepth(full) > depth) uncut.push(full.slice(0, 80));
      out.push(full);
    }
    return { lines: out, cuts, uncut };
  }
  /** how deep a line's brackets go */
  function maxDepth(s) { let d = 0, most = 0; for (const c of s) { if (c === '(') most = Math.max(most, ++d); else if (c === ')') d--; } return most; }

  // ---------------------------------------------------------------------------------------------------------------- lookups
  // A slot's instances (baked) are found by the time and their values by the instance's number — for thousands of instances
  // too: in groups of 16 (one line each, a group's line worked out only in the frame's own group: the ternary does not work out
  // the branch it does not take) with a balanced tree inside, so a frame does a handful of comparisons, and no line is long
  const GROUP = 16;
  /** lines that set `name` to the first i with key < thr[i] (thr ascending), thr.length when none */
  function searchLines(key, thr, name, lines) {
    const tree = (lo, hi) => { if (lo >= hi) return String(lo); const mid = (lo + hi) >> 1; return `(${key} < ${n(thr[mid])} ? ${tree(lo, mid)} : ${tree(mid + 1, hi)})`; };
    if (thr.length <= GROUP) { lines.push(`${name} = ${tree(0, thr.length)};`); return; }
    const groups = [];
    for (let g = 0; g * GROUP < thr.length; g++) groups.push(thr[Math.min(thr.length, (g + 1) * GROUP) - 1]);
    searchLines(key, groups, `${name}g`, lines);
    lines.push(`${name} = ${thr.length};`);
    // (the first group whose last threshold is past the key: the answer is in it — key is at or past the one before it)
    groups.forEach((_, g) => {
      const lo = g * GROUP, hi = Math.min(thr.length, lo + GROUP) - 1;
      lines.push(`${name} = (${name}g == ${g}) ? ${tree(lo, hi)} : ${name};`);
    });
  }
  /** lines that set `name` to values[idx] (idx an integer 0…values.length − 1; anything else: dflt). q: a variable already set
   *  to math.floor(idx / 16) (more than 16 values) */
  function tableLines(idx, values, name, dflt, q, lines) {
    const m = values.length, same = (lo, hi) => { for (let j = lo + 1; j <= hi; j++) if (values[j] !== values[lo]) return false; return true; };
    const tree = (lo, hi) => (same(lo, hi) ? values[lo] : (() => { const mid = (lo + hi) >> 1; return `(${idx} < ${mid + 0.5} ? ${tree(lo, mid)} : ${tree(mid + 1, hi)})`; })());
    if (!m) { lines.push(`${name} = ${dflt};`); return; }
    if (m <= GROUP || same(0, m - 1)) { lines.push(`${name} = (${idx} > -0.5 && ${idx} < ${m - 0.5}) ? ${tree(0, m - 1)} : ${dflt};`); return; }
    lines.push(`${name} = ${dflt};`);
    for (let g = 0; g * GROUP < m; g++) lines.push(`${name} = (${q} == ${g}) ? ${tree(g * GROUP, Math.min(m, (g + 1) * GROUP) - 1)} : ${name};`);
  }

  // ---------------------------------------------------------------------------------------------------------------- a target
  /** one element's clips (on one track) → pre_animation lines that put its state in variables P_x, P_y, P_sx, P_sy, P_r, P_o
   *  (and P_v, P_f, P_fr when its clips have them). o: { st, zero, vars (params), ev: { t, r } | null, active, paths, instPath,
   *  hidden (muted / not solo), report }. An instance's own path (@instance) is not in x / y: it is the instance's animation,
   *  timed by P_u (has.instPath) */
  function targetLines(P, clips, o) {
    const lines = [], report = o.report, parts = [];
    const RES = Ko().RESULTS, code = (name) => Math.max(0, RES.indexOf(name));
    // (a result answering a trigger / until: its own code — and 'hit' every hit: hit, great, good, ok — model.evMatch)
    const is = (r, name) => (name === 'hit' ? `(${r} == ${code('hit')} || (${r} >= ${code('great')} && ${r} <= ${code('ok')}))` : name === 'tap' ? `${r} == ${code('hit')}` : `${r} == ${code(name)}`);
    const ordered = [...clips.filter((c) => c.trigger), ...clips.filter((c) => !c.trigger)];
    for (const c of ordered) {
      const s = valM(c.start, o.vars), e = valM(c.end, o.vars);
      if (c.trigger) {
        // (on a sequence's own track: the latest such event of the whole play — o.gev, the global events' times)
        const gt = !o.ev && o.gev ? o.gev(c.trigger) : null;
        if (!o.ev && !gt) { report.warnings.push(`trigger（${c.trigger}）は、テンプレートの中か、ゲームの中の出来事（${Ko().GLOBAL_EVENTS.join('・')}）で使えます（${c.id}）`); continue; }
        const start = `${o.ev ? o.ev.t : gt} + ${s}`, end = `${o.ev ? o.ev.t : gt} + ${e}`;
        parts.push({ c, start, end, cut: '0', cond: o.ev ? `(${is(o.ev.r, c.trigger)} && ${o.st} >= ${start} - ${EPS} && ${o.st} < ${end})` : `(${o.st} >= ${start} - ${EPS} && ${o.st} < ${end})` });
      } else {
        const start = `${o.zero} + ${s}`, rawEnd = `${o.zero} + ${e}`;
        let end = rawEnd, cut = '0';
        if (c.until && o.ev) { cut = `(${is(o.ev.r, c.until)} && ${o.ev.t} >= ${start} - ${EPS} && ${o.ev.t} < ${rawEnd})`; end = `(${cut} ? ${o.ev.t} : ${rawEnd})`; }
        else if (c.until && o.gev && o.gev(c.until)) { const gt = o.gev(c.until); cut = `(${gt} >= ${start} - ${EPS} && ${gt} < ${rawEnd})`; end = `(${cut} ? ${gt} : ${rawEnd})`; }
        parts.push({ c, start, end, cut, cond: `(${o.st} >= ${start} - ${EPS} && ${o.st} < ${end})` });
      }
    }
    // which clip (its index in parts, −1 none), the time in it, the time left in it, whether an event cut it
    let chain = '-1';
    for (let i = parts.length - 1; i >= 0; i--) chain = `(${parts[i].cond} ? ${i} : ${chain})`;
    const pick = (f, dflt) => { let s = dflt; for (let i = parts.length - 1; i >= 0; i--) s = `(${P}_c == ${i} ? ${f(parts[i])} : ${s})`; return s; };
    lines.push(`${P}_c = ${o.hidden ? '-1' : `${o.active} ? ${chain} : -1`};`);
    lines.push(`${P}_tc = math.max(0, ${o.st} - ${pick((p) => p.start, '0')});`);
    if (parts.some((p) => p.c.transitionOut)) lines.push(`${P}_l = ${pick((p) => p.end, '0')} - ${o.st};`);
    if (parts.some((p) => p.cut !== '0')) lines.push(`${P}_k = ${pick((p) => p.cut, '0')};`);
    const D = Mo().DEFAULTS, tc = `${P}_tc`;
    const chan = (c, prop) => (c.channels && c.channels[prop] && c.channels[prop].length ? keysM(c.channels[prop], tc, o.vars, report) : null);
    // the progress along a path first (x and y use it)
    const own = (c) => c.path === '@instance' && Boolean(o.instPath);
    const pathOf = (c) => { if (own(c)) return null; const id = c.path === '@instance' ? null : c.path; return id ? o.paths(id) : null; };
    const usesPath = (c) => chan(c, 'path') && (own(c) || pathOf(c));
    if (parts.some((p) => usesPath(p.c))) lines.push(`${P}_u = ${pick((p) => (usesPath(p.c) ? chan(p.c, 'path') : '0'), '0')};`);
    // per clip: its values with its transitions
    const val = (p, prop) => {
      const c = p.c, base = chan(c, prop) ?? n(D[prop]);
      const terms = [], muls = [];
      if (prop === 'x' || prop === 'y') {
        const path = chan(c, 'path') && pathOf(c);
        if (path) terms.push(pathM(path, `${P}_u`)[prop]);
        else if (c.path && chan(c, 'path') && !own(c)) report.warnings.push(`道「${c.path}」がありません（${c.id}）`);
      }
      for (const [tr, pv] of [[c.transitionIn, `math.clamp(${tc} / ${n(c.transitionIn && c.transitionIn.duration)}, 0, 1)`], [c.transitionOut, `math.clamp(${P}_l / ${n(c.transitionOut && c.transitionOut.duration)}, 0, 1)`]]) {
        if (!tr || !(tr.duration > 0)) continue;
        const on = tr === c.transitionIn ? `${tc} < ${n(tr.duration)}` : `(${P}_l < ${n(tr.duration)}${p.cut !== '0' ? ` && ${P}_k == 0` : ''})`;
        const m = transM(tr.kind, easeM(tr.ease, pv, report));
        if (prop === 'x' && m.x) terms.push(`(${on} ? ${m.x} : 0)`);
        if (prop === 'y' && m.y) terms.push(`(${on} ? ${m.y} : 0)`);
        if (prop === 'opacity' && m.o) muls.push(`(${on} ? ${m.o} : 1)`);
        if ((prop === 'scaleX' || prop === 'scaleY') && m.s) muls.push(`(${on} ? ${m.s} : 1)`);
      }
      let s = [base, ...terms].join(' + ');
      if (muls.length) s = `(${s}) * ${muls.join(' * ')}`;
      return prop === 'opacity' ? `math.clamp(${s}, 0, 1)` : s;
    };
    for (const [v, prop, hid] of [['x', 'x', '0'], ['y', 'y', '0'], ['sx', 'scaleX', '0'], ['sy', 'scaleY', '0'], ['r', 'rotation', '0'], ['o', 'opacity', '0']]) lines.push(`${P}_${v} = ${pick((p) => val(p, prop), hid)};`);
    const has = (prop) => parts.some((p) => chan(p.c, prop));
    // (a tilt out of the screen: only when a clip has one — most elements turn in the screen's plane alone)
    if (has('rotationX')) lines.push(`${P}_rx = ${pick((p) => chan(p.c, 'rotationX') || '0', '0')};`);
    if (has('rotationY')) lines.push(`${P}_ry = ${pick((p) => chan(p.c, 'rotationY') || '0', '0')};`);
    if (has('value')) lines.push(`${P}_v = ${pick((p) => chan(p.c, 'value') || '0', '0')};`, `${P}_vd = ${pick((p) => (chan(p.c, 'value') ? '1' : '0'), '0')};`);
    if (has('fill')) lines.push(`${P}_f = math.clamp(${pick((p) => chan(p.c, 'fill') || '0', '0')}, 0, 1);`, `${P}_fd = ${pick((p) => (chan(p.c, 'fill') ? '1' : '0'), '0')};`);
    if (has('frame')) lines.push(`${P}_fr = ${pick((p) => chan(p.c, 'frame') || '0', '0')};`, `${P}_frd = ${pick((p) => (chan(p.c, 'frame') ? '1' : '0'), '0')};`);
    return { lines, has: { value: has('value'), fill: has('fill'), frame: has('frame'), opacity: parts.some((p) => chan(p.c, 'opacity') || (p.c.transitionIn && p.c.transitionIn.kind === 'fade') || (p.c.transitionOut && p.c.transitionOut.kind === 'fade')), rotation: parts.some((p) => chan(p.c, 'rotation')), rx: has('rotationX'), ry: has('rotationY'), instPath: parts.some((p) => own(p.c) && chan(p.c, 'path')) } };
  }

  // ---------------------------------------------------------------------------------------------------------------- the pack
  /** where to move a model's cubes — all of them alike, so that a model of many blocks keeps its shape — for none of their
   *  faces to lie within 0.02 of a face of one of `placed` that looks the same way and overlaps it there (two faces on one plane
   *  flicker; a face of no area, a flat plate's side, is none): back in depth (0.021 at a time, from `kz` steps) to the first
   *  step where no front or back is near, then up or down and across (0.02 at a time, either way) for the sides — again, as
   *  each move changes what the others overlap — and when the sides find no room there, the next step back. Cubes as a
   *  geometry has them (origin, size, inflate); rotated ones are left out. → [dx, dy, dz] */
  function freePlace(placed, cubes, { kz = 1, maxZ = 2000, maxXY = 25 } = {}) {
    const M = 0.02 - 1e-6, A = 1e-6, R4 = (v) => Math.round(v * 1e4) / 1e4;
    const boxOf = (c) => { const i = num(c.inflate), o = c.origin, s = c.size || [0, 0, 0]; return [o[0] - i, o[1] - i, o[2] - i, o[0] + num(s[0]) + i, o[1] + num(s[1]) + i, o[2] + num(s[2]) + i]; };
    const mine = cubes.filter((c) => !c.rotation).map(boxOf), others = placed.filter((c) => !c.rotation).map(boxOf), pad = maxXY * 0.02 + 0.05;
    const near = mine.map((q) => others.filter((w) => w[0] < q[3] + pad && w[3] > q[0] - pad && w[1] < q[4] + pad && w[4] > q[1] - pad));
    const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    // (the moves along axis a that would bring a face of ours near one of theirs — the other two moves as d has them)
    const near1 = (a, d) => {
      const b = (a + 1) % 3, c = (a + 2) % 3, out = [];
      for (let i = 0; i < mine.length; i++) {
        const q = mine[i];
        for (const w of near[i]) if (ov(q[b] + d[b], q[b + 3] + d[b], w[b], w[b + 3]) * ov(q[c] + d[c], q[c + 3] + d[c], w[c], w[c + 3]) > A) out.push(w[a] - q[a], w[a + 3] - q[a + 3]);
      }
      return out;
    };
    const first = (a, d, cands, from = 0) => { const ws = near1(a, d); for (let k = from; k < cands.length; k++) if (ws.every((w) => Math.abs(w - cands[k]) >= M)) return k; return -1; };
    const free = (d) => [2, 1, 0].every((a) => first(a, d, [d[a]]) === 0);
    const zs = [], xys = [0];
    for (let k = kz; k < maxZ; k++) zs.push(R4(0.021 * k));
    for (let j = 1; j <= maxXY; j++) xys.push(R4(0.02 * j), R4(-0.02 * j));
    let d = [0, 0, zs[0]];
    for (let from = 0, tries = 0; from < zs.length && tries < 60; tries++) {
      let zi = from;
      d = [0, 0, zs[from]];
      for (let round = 0; round < 6; round++) {
        zi = first(2, d, zs, from);
        if (zi < 0) return d;
        d = [d[0], d[1], zs[zi]];
        const yi = first(1, d, xys);
        if (yi >= 0) d = [d[0], xys[yi], d[2]];
        const xi = first(0, d, xys);
        if (xi >= 0) d = [xys[xi], d[1], d[2]];
        if (free(d)) return d;
      }
      from = zi + 1;
    }
    return d;
  }
  // ---------------------------------------------------------------------------------------------------------------- the pack (cont.)
  /** the timeline (doc) into GeoUI Builder's files (buildPack's), RP side. ctx: { design (buildPack's input), core (GeoUICore;
   *  else the global one), propertyLimit, bakedMax (instances a template may bake: more are streamed when their params fit),
   *  lineLimit / lineDepth (the longest / deepest Molang line: 1000 characters, 24 brackets), sounds: [{ id, ext, data }] }.
   *  → { files, warnings, stats: { bindings, pre, slots, longest, deepest, lines, chars, budget, counts } } */
  function extendPack(files0, doc0, ctx = {}) {
    const M = Mo(), K = Ko();
    if (!M || !K) throw new Error('GeoUITimeline.model と contract が要ります（model.js・contract.js を先に読み込む）');
    const doc = M.normalize(doc0), design = ctx.design || {}, files = Object.assign({}, files0), warnings = [], report = { warnings, bezier: 0 };
    const G = ctx.core || T.core || root.GeoUICore || null;
    const S = G && G.settingsOf ? G.settingsOf(design.settings) : Object.assign({ ns: 'geoui' }, design.settings || {});
    // (screen.dx as GeoUI's anchors have it: the half width now less the reference aspect's — 0 without GeoUI's core)
    const REFW = G && G.halfWAt && G.r3 && S.unitsPerScreenH ? G.r3(G.halfWAt(S, S.refAspect)) : null;
    SCREENDX = REFW !== null ? `((v.geoui_halfw ?? ${REFW}) - ${REFW})` : '0';
    const ns = clean(S.ns || 'geoui'), rpDir = `${ns}_RP`, V = (s) => `v.${ns}_${s}`;
    if (!doc.sequences.length) return { files, warnings, stats: { bindings: {}, pre: [], slots: {}, longest: 0 } };
    const bones = design.bones || [], boneSet = new Set(bones.map((b) => b.name));
    const subtree = (name) => { const out = [name]; for (let grew = true; grew;) { grew = false; for (const b of bones) if (b.parent && out.includes(b.parent) && !out.includes(b.name)) { out.push(b.name); grew = true; } } return out; };
    // (the player's properties: GeoUI's own, when its behaviour pack is there, count towards the game's limit too)
    const bpPlayer = files[`${ns}_BP/entities/player.json`], base = bpPlayer ? Object.keys((parse(bpPlayer)['minecraft:entity'].description || {}).properties || {}).length : 0;
    const budget = K.budget(doc, { propertyLimit: num(ctx.propertyLimit, 32), bakedMax: num(ctx.bakedMax, 2000), ns, base });
    warnings.push(...budget.warnings);
    // (the pause screen's paper doll is a player the game builds for the picture: it has no properties, and reading one there
    //  is a Molang error that leaves the rest of that doll's pre_animation undone — GeoUI Builder's own lines guard the same way)
    const N = K.names(ns), P = (s) => `(variable.is_paperdoll ? 0 : q.property('${s}'))`;
    // ---- time
    // (every variable read before this frame sets it goes through ??: the game's pre_animation stops at a line that reads a
    //  variable never set — every line after it is left undone, every frame (bds-lab's probe, geoui_probe, 2026-10-21))
    // (seq: the sequence, paused or not, and a generation in one number — the client counts again whenever it changes: a
    //  play, a seek, a resume change the generation; a pause holds the time at from)
    const SQ = K.seqMolang(V('sq'));
    const pre = [
      `${V('sq')} = ${P(N.seq)};`,
      `${V('seq')} = ${SQ.seq};`,
      // (seq changed this frame: a play, a seek, a resume, a stop — the global events' times start over with it)
      `${V('sqc')} = ${V('sq')} != (${V('sqp')} ?? -1);`,
      `${V('t0')} = (${V('sq')} != (${V('sqp')} ?? -1)) ? q.life_time : (${V('t0')} ?? q.life_time);`,
      `${V('sqp')} = ${V('sq')};`,
      `${V('raw')} = ${SQ.pause} ? ${P(N.from)} / 1000 : q.life_time - ${V('t0')} + ${P(N.from)} / 1000;`,
      `${V('st')} = ${V('raw')};`,
    ];
    doc.sequences.forEach((seq, si) => {
      const i = si + 1, [a, b] = seq.inOut || [0, seq.duration], len = b - a, raw = V('raw');
      if (seq.loop === 'hold') pre.push(`${V('st')} = ${V('seq')} == ${i} ? math.min(${raw}, ${n(b - 1e-6)}) : ${V('st')};`);
      else if (seq.loop === 'loop' && len > 0) pre.push(`${V('st')} = (${V('seq')} == ${i} && ${raw} >= ${n(a)}) ? ${n(a)} + math.mod(${raw} - ${n(a)}, ${n(len)}) : ${V('st')};`);
      else if (seq.loop === 'pingpong' && len > 0) pre.push(`${V('m')} = math.mod(${raw} - ${n(a)}, ${n(2 * len)});`, `${V('st')} = (${V('seq')} == ${i} && ${raw} >= ${n(a)}) ? ${n(a)} + (${V('m')} <= ${n(len)} ? ${V('m')} : ${n(2 * len)} - ${V('m')}) : ${V('st')};`);
    });
    const st = V('st'), bindings = {}, slotsOut = {}, anims = {}, clones = new Map(), drives = new Map();   // drives: bone → { o: [[seq, var]], fr, v, f }
    // ---- the whole play: the global events (a counter each in <ns>:ge — its change is the event's time) and the states
    //      (state.<name> in an expression: the script's live values — contract.js STATES)
    const GL = budget.global || { events: [], states: [], groups: [] }, gevVar = {};
    GL.events.forEach((e, k) => {
      const c = V(`ge${k}`), p = V(`gep${k}`), t = V(`get${k}`);
      pre.push(`${c} = ${K.geMolang(P(K.geName(ns, k)), k)};`, `${t} = (${c} != (${p} ?? ${c})) ? ${st} : (${V('sqc')} ? -1000 : (${t} ?? -1000));`, `${p} = ${c};`);
      gevVar[e] = t;
    });
    const gev = (name) => gevVar[name] || null;
    STATEV = {};
    for (const grp of GL.groups) {
      const un = K.unpackMolang(P(N.state(grp)), K.STATE_GROUPS[grp]);
      for (const f of K.STATE_GROUPS[grp]) if (GL.states.includes(f.name)) { pre.push(`${V(`s_${f.name}`)} = ${un[f.name]};`); STATEV[f.name] = V(`s_${f.name}`); }
    }
    for (const name of GL.states) {
      const so = K.stateOf(name);
      if (so && so.value) { const prop = (ctx.values && ctx.values[name]) || so.prop; pre.push(`${V(`s_${name}`)} = ${P(`${ns}:${prop}`)}${so.scale !== 1 ? ` * ${so.scale}` : ''};`); STATEV[name] = V(`s_${name}`); }
    }
    const instAnims = [];   // [{ key, cond, time, bone, keys }]: an instance's own path
    const drive = (bone, kind, i, varName) => { if (!drives.has(bone)) drives.set(bone, { o: [], fr: [], v: [], f: [] }); drives.get(bone)[kind].push([i, varName]); };
    doc.sequences.forEach((seq, si) => {
      const i = si + 1, anim = { loop: true, animation_length: 1, bones: {} }, paths = (id) => (seq.paths || []).find((p) => p.id === id) || null;
      const on = `${V('seq')} == ${i}`, solo = seq.tracks.some((t) => t.solo), seen = new Set(), bind = (bone, Pv, r) => {
        const rot = r.has.rotation || r.has.rx || r.has.ry;
        anim.bones[bone] = Object.assign({ position: [`${Pv}_x`, `${Pv}_y`, 0], scale: [`${Pv}_sx`, `${Pv}_sy`, 1] }, rot ? { rotation: [r.has.rx ? `${Pv}_rx` : 0, r.has.ry ? `${Pv}_ry` : 0, r.has.rotation ? `${Pv}_r` : 0] } : {});
      };
      const add = (bone, Pv, r) => {
        pre.push(...r.lines.map((l) => l.replace(/^(\S+) = (.*);$/, (m0, lhs, rhs) => `${lhs} = ${on} ? (${rhs}) : 0;`)));
        bind(bone, Pv, r);
        if (r.has.opacity) drive(bone, 'o', i, `${Pv}_o`);
        if (r.has.frame) drive(bone, 'fr', i, Pv);
        if (r.has.value) drive(bone, 'v', i, Pv);
        if (r.has.fill) drive(bone, 'f', i, Pv);
      };
      // ---- the sequence's own tracks (the first track per element; the others are said)
      seq.tracks.forEach((tr, ti) => {
        if (tr.kind !== 'layer' || !tr.target || !tr.clips.length) return;
        if (seen.has(tr.target)) { warnings.push(`「${tr.target}」を動かすトラックが 2 本あります（${seq.name}）: 上の 1 本だけを書き出します`); return; }
        seen.add(tr.target);
        if (!boneSet.has(tr.target)) warnings.push(`要素（ボーン）「${tr.target}」がありません（${seq.name}）`);
        const Pv = V(`${i}_${ti}`);
        const r = targetLines(Pv, tr.clips, { st, zero: '0', vars: {}, ev: null, gev, active: '1', paths, hidden: tr.muted || (solo && !tr.solo), report });
        add(tr.target, Pv, r);
        bindings[`${i}:${tr.target}`] = { prefix: Pv, bone: tr.target };
      });
      // ---- templates and their instances, by slots
      const bt = (budget.sequences[si] || { templates: [] }).templates;
      (seq.templates || []).forEach((tpl, pi) => {
        const B = bt[pi], xs = seq.instances.filter((x) => x.template === tpl.id);
        if (!B || !xs.length) return;
        const mode = B.mode, alloc = K.allocateSlots(seq.instances, tpl, { gap: mode === 'streamed' ? 0.25 : 0 });
        const tag = B.tag, spec = tpl.pack || K.DEFAULT_PACK, all = [...new Set(tpl.tracks.filter((t) => t.kind === 'layer' && t.target).map((t) => t.target))];
        // (an element the design does not have: said, and left out — nothing to copy, nothing to move)
        const targets = all.filter((x) => boneSet.has(x) || !bones.length);
        for (const x of all) if (!targets.includes(x)) warnings.push(`テンプレート「${tpl.name}」の要素（ボーン）「${x}」がありません: 書き出しません`);
        slotsOut[`${i}:${tpl.id}`] = { mode, slots: alloc.slots, slotOf: alloc.slotOf, tag, events: B.needs.events };
        const usesEvents = B.needs.events;
        for (let k = 0; k < alloc.slots; k++) {
          const Q = V(`${i}_${tag}${k}`), SP = K.names(ns).slot(tag, k), mine = xs.filter((x) => alloc.slotOf[x.id] === k).sort((a, b) => a.t - b.t), vars = {};
          const tailOf = (x) => (x.tail !== undefined ? x.tail : tpl.tail);
          if (mode === 'baked') {
            // (the slot's instance now: the first whose end is past the time, if it has begun; then its values by its number)
            const m = mine.length;
            searchLines(st, mine.map((x) => x.t + tailOf(x)), `${Q}_j`, pre);
            tableLines(`${Q}_j`, mine.map((x) => n(x.t - tpl.lead)), `${Q}_s0`, '0', `math.floor(${Q}_j / ${GROUP})`, pre);
            pre.push(`${Q}_i = (${on} && ${Q}_j < ${m - 0.5} && ${st} >= ${Q}_s0 - ${EPS}) ? ${Q}_j : -1;`);
            if (m > GROUP) pre.push(`${Q}_q = math.floor(${Q}_i / ${GROUP});`);
            tableLines(`${Q}_i`, mine.map((x) => n(x.t)), `${Q}_h`, '0', `${Q}_q`, pre);
            for (const p of tpl.params) { tableLines(`${Q}_i`, mine.map((x) => n(x.params[p])), `${Q}_p${clean(p)}`, '0', `${Q}_q`, pre); vars[p] = `${Q}_p${clean(p)}`; }
          } else {
            const un = K.unpackMolang(P(SP.p), spec);
            pre.push(`${Q}_h = ${P(SP.t)} / 1000;`, `${Q}_i = (${on} && ${P(SP.t)} >= 0 && ${st} >= ${Q}_h - ${n(tpl.lead)} - ${EPS} && ${st} < ${Q}_h + ${n(Math.max(tpl.tail, ...xs.map(tailOf)))}) ? 0 : -1;`);
            for (const p of tpl.params) { const f = spec.find((x) => x.name === p); pre.push(`${Q}_p${clean(p)} = ${f ? un[p] : '0'};`); vars[p] = `${Q}_p${clean(p)}`; }
          }
          let ev = null;
          if (usesEvents) {
            // (the slot's result, 3 bits of its group's property; the moment it changes is the event's time — the script sets
            //  it back to 0 when the next instance takes the slot, and a result older than the instance does not count)
            const es = K.eventSlot(k);
            pre.push(`${Q}_r = ${K.eventMolang(P(K.names(ns).events(tag, es.group)), k)};`, `${Q}_et = (${Q}_r != (${Q}_rp ?? 0)) ? ${st} : (${Q}_et ?? -1000);`, `${Q}_rp = ${Q}_r;`,
              `${Q}_er = (${Q}_et >= ${Q}_h - ${n(tpl.lead)} - ${EPS}) ? ${Q}_r : 0;`);
            ev = { t: `${Q}_et`, r: `${Q}_er` };
          }
          // (an instance's own path: an animation of the instance's, on the slot's bone, while the slot shows it)
          const instPath = xs.some((x) => x.path) ? '@instance' : null;
          targets.forEach((target, ti) => {
            const tr = tpl.tracks.find((t) => t.kind === 'layer' && t.target === target), bone = `${target}_${tag}${k}`, Pv = `${Q}_${ti}`;
            const r = targetLines(Pv, tr.clips, { st, zero: `${Q}_h`, vars, ev, active: `${Q}_i >= 0`, paths, instPath, hidden: tr.muted, report });
            add(bone, Pv, r);
            if (r.has.instPath) mine.forEach((x, j) => {
              const path = x.path && paths(x.path);
              if (!x.path) return;
              if (!path) { warnings.push(`道「${x.path}」がありません（実体 ${x.id}）`); return; }
              const cond = mode === 'baked' ? `${Q}_i == ${j}` : `${Q}_i >= 0 && math.abs(${Q}_h * 1000 - ${Math.round(x.t * 1000)}) < 0.5`;
              instAnims.push({ key: `${i}_${tag}${k}_${clean(x.id)}`, seq: i, cond, time: `${Pv}_u`, bone, keys: pathKeys(path) });
            });
            if (!clones.has(bone)) clones.set(bone, { of: target, tag, k });
            for (const x of mine) bindings[`${i}:${target}#${x.id}`] = { prefix: Pv, bone };
          });
        }
        for (const target of targets) if (!anim.bones[target]) anim.bones[target] = { scale: 0 };   // (the template's own elements: only their copies show)
      });
      anims[`animation.${ns}.seq_${i}`] = anim;
    });
    // (a slot's bones that another sequence uses: hidden in this one; all of them when no sequence plays. A template's own
    //  elements — its prototypes — never show in the game, playing or not: only their copies do)
    const protos = new Set([...clones.values()].map((c) => c.of));
    for (const a of Object.values(anims)) for (const bone of [...clones.keys(), ...protos]) if (!a.bones[bone]) a.bones[bone] = { scale: 0 };
    anims[`animation.${ns}.seq_idle`] = { loop: true, animation_length: 1, bones: Object.fromEntries([...clones.keys(), ...protos].map((b) => [b, { scale: 0 }])) };
    // (an instance's own path: its keys over half the animation's length, timed by the slot's progress — the time never comes
    //  to the length, where a looping animation would start again; straight between keys, as the game does by default)
    for (const a of instAnims) {
      const pos = {};
      for (const [u, x, y] of a.keys) pos[n(u * 0.5)] = [Number(n(x)), Number(n(y)), 0];
      anims[`animation.${ns}.ip_${a.key}`] = { loop: true, animation_length: 1, anim_time_update: `math.clamp(${a.time}, 0, 1) * 0.5`, bones: { [a.bone]: { position: pos } } };
    }
    // ---- per-element drives: opacity and frame (render controllers), value (digits), fill (gauges)
    const RCV = (bone, what) => V(`${what}_${clean(bone)}`);
    for (const [bone, d] of drives) {
      if (d.o.length) { let s = '1'; for (const [i, v] of d.o) s = `(${V('seq')} == ${i} ? ${v} : ${s})`; pre.push(`${RCV(bone, 'a')} = ${s};`); }
      if (d.fr.length) { let s = '0'; for (const [i, Pv] of d.fr) s = `(${V('seq')} == ${i} && ${Pv}_frd ? ${Pv}_fr : ${s})`; pre.push(`${RCV(bone, 'fr')} = math.floor(${s});`); }
      if (d.v.length) { let s = '0', on = '0'; for (const [i, Pv] of d.v) { s = `(${V('seq')} == ${i} && ${Pv}_vd ? ${Pv}_v : ${s})`; on = `(${V('seq')} == ${i} && ${Pv}_vd ? 1 : ${on})`; } pre.push(`${RCV(bone, 'val')} = ${s};`, `${RCV(bone, 'vd')} = ${on};`); }
      if (d.f.length) { let s = '0', on = '0'; for (const [i, Pv] of d.f) { s = `(${V('seq')} == ${i} && ${Pv}_fd ? ${Pv}_f : ${s})`; on = `(${V('seq')} == ${i} && ${Pv}_fd ? 1 : ${on})`; } pre.push(`${RCV(bone, 'fill')} = ${s};`, `${RCV(bone, 'fd')} = ${on};`); }
    }
    // ---- the files: geometry copies for the slots, the animations, the client entity, render controllers
    const geoFiles = Object.keys(files).filter((f) => f.startsWith(`${rpDir}/models/entity/`) && f.endsWith('.geo.json'));
    for (const f of geoFiles) {
      const g = parse(files[f]), geo = g['minecraft:geometry'][0], have = new Map(geo.bones.map((b) => [b.name, b])), nth = new Map();
      for (const [bone, { of, tag, k }] of clones) {
        if (have.has(bone)) continue;
        const tree = subtree(of);
        if (!have.has(of)) continue;
        // (a copy of a deep cube — a voxel — also moved 0.02 a copy across the screen: its sides then share no plane with its
        //  prototype's or another copy's, which a move in depth alone leaves on one plane. Flat planes move in depth only, as before)
        const nc = (nth.get(of) || 0) + 1; nth.set(of, nc);
        for (const name of tree) {
          const src = have.get(name);
          if (!src) continue;
          const copy = parse(src);
          copy.name = `${name}_${tag}${k}`;
          // (a copy moved in depth, 0.021 at a time, until no face it overlaps is within 0.02 of one of its own: never two faces on
          //  one plane — only one of them shows at a time, but two on one plane would flicker if ever they did. The whole copy
          //  alike: a model of blocks in layers keeps its shape)
          for (const cube of copy.cubes || []) { const dxy = cube.size && cube.size[2] > 0 ? Math.round(nc * 0.02 * 1e4) / 1e4 : 0; cube.origin = [Math.round((cube.origin[0] + dxy) * 1e4) / 1e4, Math.round((cube.origin[1] + dxy) * 1e4) / 1e4, cube.origin[2]]; }
          const [dx, dy, dz] = freePlace(geo.bones.flatMap((b) => b.cubes || []), copy.cubes || []);
          for (const cube of copy.cubes || []) cube.origin = cube.origin.map((v, i) => Math.round((v + [dx, dy, dz][i]) * 1e4) / 1e4);
          if (name !== of && src.parent) copy.parent = tree.includes(src.parent) ? `${src.parent}_${tag}${k}` : src.parent;
          geo.bones.push(copy); have.set(copy.name, copy);
        }
      }
      files[f] = J(g);
    }
    const animFile = `${rpDir}/animations/${ns}.animation.json`, af = files[animFile] ? parse(files[animFile]) : { format_version: '1.8.0', animations: {} };
    Object.assign(af.animations, anims);
    // (a gauge whose fill a clip drives: the transform's fill gives way to the clip's while it does)
    const tfm = af.animations[`animation.${ns}_transform`];
    for (const [bone, d] of drives) if (d.f.length && tfm && tfm.bones[bone] && Array.isArray(tfm.bones[bone].scale)) {
      const el = (design.elements || {})[bone] || {}, axis = el.gauge && ['top', 'bottom'].includes(el.gauge.fill) ? 1 : 0, sc = tfm.bones[bone].scale;
      sc[axis] = `(${RCV(bone, 'fd')} ? ${RCV(bone, 'fill')} : (${sc[axis]}))`;
    }
    files[animFile] = J(af);
    const entFile = `${rpDir}/entity/player.entity.json`, ent = files[entFile] ? parse(files[entFile]) : null;
    const lineLimit = num(ctx.lineLimit, 1000), lineDepth = num(ctx.lineDepth, 24);
    let written = pre, counts = { renderControllers: 0, animations: 0, bones: 0 };
    if (ent) {
      const dsc = ent['minecraft:client_entity'].description;
      // (a number whose value a clip drives: its digits are worked out again from the clip's value while it does)
      const digitLines = [];
      // (a slot's copy of a number: the prototype's digits — its numerals copied too, each shown by the copy's own digit
      //  variable in the transform animation. Before 2026-10-23 a copy had no digit variables: all ten numerals of every digit
      //  showed at once — an osu! combo number drew as a block of overlaid numerals)
      const tfa = af.animations[`animation.${ns}_transform`];
      for (const [bone, d] of drives) if (d.v.length) {
        const c0 = clones.get(bone), el = (design.elements || {})[c0 ? c0.of : bone] || {}, digits = (el.number && Array.isArray(el.number.digits) ? el.number.digits.length : 0), hide = !(el.number && el.number.hideLeadingZero === false);
        for (let k = 0; k < digits; k++) {
          const dv = `v.${ns}_${clean(bone)}_d${k}`, place = Math.pow(10, digits - 1 - k), de = G && G.digitExpr ? G.digitExpr(RCV(bone, 'val'), place, hide) : `math.mod(math.floor(math.abs(${RCV(bone, 'val')})/${place}),10)`;
          digitLines.push(`${dv} = ${RCV(bone, 'vd')} ? ${de} : (${dv} ?? 0);`);
          if (c0 && tfa) (el.number.digits[k] || []).forEach((bn, j) => { if (bn) tfa.bones[`${bn}_${c0.tag}${c0.k}`] = { scale: `${dv}==${j}` }; });
        }
      }
      if (tfa) files[animFile] = J(af);
      // (every line short and shallow: a part of a long one worked out first on a line of its own — splitLines)
      const cut = splitLines([...pre, ...digitLines], { limit: lineLimit, depth: lineDepth, prefix: `v.${ns}__` });
      if (cut.uncut.length) warnings.push(`Molang の行を ${lineLimit} 文字・括弧 ${lineDepth} 段に収められませんでした（${cut.uncut.length} 行: ${cut.uncut[0]}…）`);
      written = cut.lines;
      dsc.scripts.pre_animation.push(...written);
      // (what is read outside the pre_animation — the animate conditions, the render controllers — has a value from the
      //  entity's first moment: initialize runs once, before anything else reads them)
      const init = [`${V('seq')} = 0;`];
      for (const [bone, d] of drives) { if (d.o.length) init.push(`${RCV(bone, 'a')} = 1;`); if (d.fr.length) init.push(`${RCV(bone, 'fr')} = 0;`); }
      dsc.scripts.initialize = [...(dsc.scripts.initialize || []), ...init];
      dsc.animations = dsc.animations || {};
      const animate = [];
      doc.sequences.forEach((_, si) => { dsc.animations[`${ns}_seq_${si + 1}`] = `animation.${ns}.seq_${si + 1}`; animate.push({ [`${ns}_seq_${si + 1}`]: `q.is_in_ui && ${V('seq')} == ${si + 1}` }); });
      if (clones.size) { dsc.animations[`${ns}_seq_idle`] = `animation.${ns}.seq_idle`; animate.push({ [`${ns}_seq_idle`]: `q.is_in_ui && (${V('seq')} < 1 || ${V('seq')} > ${doc.sequences.length})` }); }
      for (const a of instAnims) { dsc.animations[`${ns}_ip_${a.key}`] = `animation.${ns}.ip_${a.key}`; animate.push({ [`${ns}_ip_${a.key}`]: `q.is_in_ui && ${V('seq')} == ${a.seq} && ${a.cond}` }); }
      // (a flipbook's frame step in the texture: the element's own cell size over the texture's — an atlas holds more than it)
      const stepOf = (name, fb) => {
        const b = bones.find((x) => x.name === name), faces = b && (b.cubes || []).map((c) => Object.values(c.faces || {}).find((f) => f && f.uv_size)).filter(Boolean), f = faces && faces[0];
        const tex = f && (design.textures || {})[f.texture], tw = tex && num(tex.uvWidth || tex.width), th = tex && num(tex.uvHeight || tex.height);
        // (an explicit step in texels: a voxel element's cell, its cubes each a small part of it — osukit.js)
        if (Array.isArray(fb.step) && tw > 0 && th > 0) return [num(fb.step[0]) / tw, num(fb.step[1]) / th];
        return f && tw > 0 && th > 0 ? [Math.abs(f.uv_size[0]) / tw, Math.abs(f.uv_size[1]) / th] : [1 / fb.cols, 1 / fb.rows];
      };
      dsc.scripts.animate = [...(dsc.scripts.animate || []), ...animate];
      // ---- render controllers: an element with its own opacity or frame drawn by its own controller (its bones only), the
      // shared controllers drawing everything else
      const rcFile = `${rpDir}/render_controllers/${ns}.render_controllers.json`, rc = files[rcFile] ? parse(files[rcFile]) : null;
      // (the element's front: the nearest face to the camera — GeoUI's layers go towards it in −z)
      const frontOf = (name) => { const b = bones.find((x) => x.name === name); const zs = b ? (b.cubes || []).map((c) => num(c.origin && c.origin[2])) : []; return zs.length ? Math.min(...zs) : 0; };
      const protoOf = (bone) => (clones.has(bone) ? clones.get(bone).of : bone);
      // (drawn back to front: a see-through element over another is blended over what is already drawn behind it)
      const own = [...drives].filter(([, d]) => d.o.length || d.fr.length).map(([bone]) => bone).sort((a, b) => frontOf(protoOf(b)) - frontOf(protoOf(a)));
      const fades = new Set();
      if (rc && own.length) {
        const base = Object.entries(rc.render_controllers), addList = [];
        const treeOf = (bone) => { const c = clones.get(bone); return c ? subtree(c.of).map((x) => `${x}_${c.tag}${c.k}`) : subtree(bone); };
        for (const [id, r] of base) {
          r.part_visibility = [{ '*': true }, ...own.flatMap((b) => treeOf(b).map((x) => ({ [x]: false })))];
          for (const bone of own) {
            const el = (design.elements || {})[protoOf(bone)] || {}, d = drives.get(bone), id2 = `${id}_${clean(bone)}`;
            const copy = parse(r), c0 = clones.get(bone);
            copy.part_visibility = [{ '*': false }, ...treeOf(bone).map((x) => ({ [x]: true }))];
            // (a slot's copy drawn with its prototype's material: the shared list names the prototype's bones, not the copy's)
            if (c0) for (const x of subtree(c0.of)) { const m = (r.materials || []).find((e) => Object.keys(e)[0] === x); if (m) copy.materials.push({ [`${x}_${c0.tag}${c0.k}`]: m[x] }); }
            if (d.o.length) {
              // (opacity: the game takes a render controller's colour alpha only through a material with the colour mask —
              //  a plain blend draws the same at alpha 0 (bds-lab's probe, geoui_probe, 2026-10-21). The element's parts are
              //  drawn with the fade material (blend, or additive for an additive element, with the mask) while this
              //  controller draws them, and not at all while fully transparent: no invisible plane in front of what is behind)
              const fade = el.blend === 'add' ? `${ns}_addfade` : `${ns}_fade`;
              fades.add(fade);
              for (const x of treeOf(bone)) copy.materials.push({ [x]: `material.${fade}` });
              copy.color = Object.assign({}, r.color, { a: `${r.color && r.color.a !== undefined ? r.color.a : 1} * ${RCV(bone, 'a')}` });
              copy.part_visibility = [{ '*': false }, ...treeOf(bone).map((x) => ({ [x]: `${RCV(bone, 'a')} > 0.004` }))];
            }
            if (d.fr.length) {
              const fb = el.frames;
              if (fb && fb.cols > 0 && fb.rows > 0) { const [du, dv] = stepOf(clones.has(bone) ? clones.get(bone).of : bone, fb); copy.uv_anim = { offset: [`math.mod(${RCV(bone, 'fr')}, ${fb.cols}) * ${n(du)}`, `math.floor(${RCV(bone, 'fr')} / ${fb.cols}) * ${n(dv)}`], scale: [1, 1] }; }
              else warnings.push(`「${bone}」のコマ（frame）を書き出せません: 要素に連番の並び（frames: { cols, rows }）がありません`);
            }
            rc.render_controllers[id2] = copy;
            addList.push({ [id2]: (dsc.render_controllers.find((x) => typeof x === 'object' && x[id]) || {})[id] || 'q.is_in_ui' });
          }
        }
        dsc.render_controllers = [...dsc.render_controllers, ...addList];
        counts.renderControllers = addList.length;
        files[rcFile] = J(rc);
      }
      // ---- the fade materials (GeoUI Builder's base material with the colour mask: the controller's colour alpha counts)
      const matFile = `${rpDir}/materials/entity.material`;
      if (fades.size && files[matFile]) {
        const mf = parse(files[matFile]), FADE = {
          [`${ns}_fade`]: { '+defines': ['USE_UV_ANIM', 'USE_COLOR_MASK'], '+states': ['Blending'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' },
          [`${ns}_addfade`]: { '+defines': ['USE_UV_ANIM', 'USE_COLOR_MASK'], '+states': ['Blending', 'DisableDepthWrite'], blendSrc: 'SourceAlpha', blendDst: 'One' },
        };
        for (const f of fades) { mf.materials[`${f}:${ns}_base`] = FADE[f]; dsc.materials = Object.assign(dsc.materials || {}, { [f]: f }); }
        files[matFile] = J(mf);
      } else if (fades.size) warnings.push('マテリアルのファイルがありません: 不透明度（opacity）はゲームの中で効きません');
      // ---- sounds: their definitions and files. The behaviour pack's script plays an audio clip when the sequence's time
      //  reaches it and stops it at a pause, a seek or a stop (runtime.js: each clip's own volume and pitch) — a sequence's
      //  animation runs on a clock of its own that neither a seek nor a pause moves, and it can neither stop a sound nor start
      //  one part-way
      const sounds = (ctx.sounds || []), sdefs = [];
      doc.sequences.forEach((seq) => {
        for (const tr of seq.tracks) if (tr.kind === 'audio' && !tr.muted) for (const c of tr.clips) if (c.sound) {
          if (!sdefs.some((s) => s.id === clean(c.sound))) { const src = sounds.find((s) => clean(s.id) === clean(c.sound)); sdefs.push({ id: clean(c.sound), ext: src && src.ext === 'wav' ? 'wav' : 'ogg', data: src && src.data }); }
          if (c.offset > 1e-6) warnings.push(`音のクリップ（${c.id}）は頭を ${n(c.offset)} 秒切ってあります: ゲームでは音の頭から鳴ります`);
        }
      });
      // (sounds the behaviour pack's script plays that no audio clip names: osu!'s hitsounds — ctx.extraSounds, their ids)
      for (const id of ctx.extraSounds || []) if (!sdefs.some((x) => x.id === clean(id))) { const src = sounds.find((x) => clean(x.id) === clean(id)); sdefs.push({ id: clean(id), ext: src && src.ext === 'wav' ? 'wav' : 'ogg', data: src && src.data }); }
      if (sdefs.length) {
        const Me = T.media, sd = Me ? Me.soundDefinitions(sdefs, ns) : null;
        if (sd) {
          const sdf = `${rpDir}/sounds/sound_definitions.json`, prev = files[sdf] ? parse(files[sdf]) : { format_version: '1.20.20', sound_definitions: {} };
          Object.assign(prev.sound_definitions, sd.json.sound_definitions); files[sdf] = J(prev);
          for (const s of sdefs) { if (s.data) files[`${rpDir}/${sd.paths[s.id]}`] = s.data; else warnings.push(`音「${s.id}」の中身がありません（素材として取り込む）`); }
        }
      }
      files[entFile] = J(ent);
    }
    // (what the game was seen to draw — bds-lab's probes: 600 bones, 70 render controllers of one's own, 1200 animations; past
    //  that it is not known)
    counts.animations = Object.keys(anims).length;
    for (const f of geoFiles) counts.bones = Math.max(counts.bones, parse(files[f])['minecraft:geometry'][0].bones.length);
    if (counts.bones > 600) warnings.push(`ボーンが ${counts.bones} 本です（本物のゲームで確かめたのは 600 本まで・要実測）`);
    if (counts.renderControllers > 70) warnings.push(`要素ごとの render controller が ${counts.renderControllers} 個です（本物のゲームで確かめたのは 70 個まで・要実測）`);
    if (counts.animations > 1200) warnings.push(`アニメーションが ${counts.animations} 個です（本物のゲームで確かめたのは 1200 個まで・要実測）`);
    const longest = Math.max(0, ...written.map((l) => l.length)), deepest = Math.max(0, ...written.map(maxDepth));
    // (the whole pre_animation, as bds-lab's probes saw it run in the game: 610 000 characters in 4029 lines of 150 (geoui_probe_sz)
    //  and 5029 short lines (geoui_probe_lc) — the size is not what stops it; the entity's variables up to its 5023rd all worked,
    //  read with ?? or without, the early ones still there after them (geoui_probe_vx, 2026-10-22) — the count is not either.
    //  geoui_probe_m's 3053rd that read back wrong is still unexplained. A 1000-instance map (geoui_rhythm_huge: 437 000
    //  characters, about 1020 variables) played to the end in the real app. Counted over the whole entity, the player's own lines
    //  too, as the probes count. Past what was seen to run: said, to be measured)
    const chars = written.reduce((a, l) => a + l.length, 0), setIn = (ls) => (ls || []).map((l) => (/^\s*(?:v|variable)\.(\w+)\s*=(?!=)/i.exec(String(l)) || [])[1]).filter(Boolean).map((k) => k.toLowerCase());
    const variables = new Set(setIn(written)).size;
    const dscW = ent && ent['minecraft:client_entity'].description, entityVariables = dscW ? new Set([...setIn((dscW.scripts || {}).initialize), ...setIn((dscW.scripts || {}).pre_animation)]).size : variables;
    if (entityVariables > 5000) warnings.push(`変数が ${entityVariables} 個です（プレイヤーの分も込み。本物のゲームで効いたのは約 5000 個まで・その先は要実測）: 同時に出る実体（枠）を減らすと少なくなります`);
    if (chars > 610000 || written.length > 5029) warnings.push(`pre_animation が ${Math.round(chars / 1000)} k 文字・${written.length} 行です（本物のゲームで最後まで動いたのは 61 万文字・4029 行、短い行なら 5029 行まで・要実測）: 同時に出る実体（枠）を減らすと小さくなります`);
    if (report.bezier > 0.002) warnings.push(`ベジェのイージングを 16 の折れ線にした誤差: 最大 ${report.bezier.toFixed(4)}`);
    return { files, warnings: [...new Set(warnings)], stats: { bindings, pre: written, slots: slotsOut, longest, deepest, lines: written.length, chars, variables, entityVariables, bezierError: report.bezier, budget, counts } };
  }

  T.compile = { extendPack, freePlace, easeM, keysM, pathM, pathKeys, exprM, targetLines, searchLines, tableLines, splitLines, maxDepth, mparse };
  if (typeof module === 'object' && module && module.exports) module.exports = T.compile;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/runtime.js
(function (module) {
// GeoUI timeline — runtime: the behaviour pack's side (bds/geoui/timeline/PLAN.md step 4). The script that plays a sequence
// for a player (scriptevent <ns>:play / stop / pause / resume / seek / offset), puts each streamed instance into its slot just
// before it shows, judges the player's presses against the instances' times (osu!'s 300 / 100 / 50 windows), sends hits and
// misses to the slots (the resource pack's trigger / until clips answer), keeps score, combo, accuracy and health in the
// pack's v0 … v3, plays the audio clips on the sequence's time (and stops them at a pause, a seek or a stop) and sends a
// player who joins again the sequence from where it is. A loop or a pingpong goes round again: each round its instances are
// streamed and judged anew (a pingpong's way back, where the time runs backwards, is shown but not judged and not heard).
// The engine below is one self-contained function: the pack's script carries its source, and the tests run the very same
// code with a fake world. The properties are contract.js's (seq: sequence + 1024 × paused + 2048 × generation).
// A game (osu!, osugame.js) also has: each player's own settings kept in the world (mode, sensitivity, offset, mods), a failed
// play stopped after its fall (a press meanwhile plays it again), its end (the best kept — not an autoplay's — the scoreboard,
// a line in the chat, the applause), and the tour: every look of the game in about 20 seconds, scene by scene at fixed times
// (osukit.js writes the scenes for the beatmap) — for seeing the whole of it at once, the real app's quick check above all.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  // (a name as compile.js and media.js make it: a sound's id in the pack)
  const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'e';

  /** the engine (no outside names: its source goes into the pack's script as is). io: { tick() (the server's tick), setProp(p,
   *  name, value), getProp(p, name) (what the player has: a world keeps its players' properties), players() (everyone in the
   *  world), event(p, id, message) (a scriptevent: markers), sound(p, id, volume, pitch) and stopSound(p, id) (the sequence's
   *  audio clips), rotation(p) and held(p) (a game's cursor and button), load(p, key) and save(p, key, value) (the player's own
   *  values kept in the world: a game's settings and best), scoreboard(p, id, name, score), message(p, text) } */
  function createEngine(CFG, io, createGame) {
    const P = (x) => `${CFG.ns}:${x}`, players = new Map(), HIT = 1, MISS = 2, LATE = 250, PAUSE = 1024, GEN = 2048, GENS = 8192;
    const W = CFG.windows, POINTS = { great: 300, good: 100, ok: 50 };
    // (a game: a failed play is shown this long — its fall, FAILED — then stopped; a press after the first second of it plays
    //  it again. The mods a player may choose, osu!'s letters)
    const FAIL_HOLD = 4500, RETRY_AFTER = 1000, MOD_NAMES = ['HD', 'FL', 'NF', 'SD', 'PF'];
    const get = (p, name) => { try { return io.getProp ? io.getProp(p, name) : undefined; } catch (e) { return undefined; } };
    const load = (p, key) => { try { return io.load ? io.load(p, key) : undefined; } catch (e) { return undefined; } };
    const save = (p, key, v) => { try { if (io.save) io.save(p, key, v); } catch (e) { /* (kept for this session only) */ } };
    function stateOf(p) {
      let s = players.get(p.id);
      // (the generation goes on from the one the player has: a client that saw it already would not count again from a
      //  play that only set it to the same number — after a server restart the script begins at 0, the world keeps it)
      if (!s) {
        const v0 = Number(get(p, P('seq'))), g0 = Number.isFinite(v0) ? Math.floor(v0 / GEN) % GENS : 0;
        s = { seq: 0, gen: g0, from: 0, start: 0, paused: false, offset: 0, slots: new Map(), results: new Map(), cur: new Map(), groups: new Map(), judged: new Set(), marks: new Set(), played: new Set(), ringing: new Set(), round: 0, score: 0, combo: 0, best: 0, total: 0, earned: 0, health: 100,
          game: null, mode: CFG.mode || 'aim', sens: CFG.sens || 2.4, mods: [], ref: null, pending: [], prevMs: null, ge: {}, gp: {}, failAt: -1, stopAt: -1, done: false, record: 0, tour: null, last: 0 };
        players.set(p.id, s);
        // (the player's own settings for a game, kept in the world: what they chose last time)
        let o = null; try { o = JSON.parse(String(load(p, P('prefs')) || 'null')); } catch (e) { o = null; }
        if (o && typeof o === 'object') {
          if (['auto', 'aim', 'relax'].includes(o.mode)) s.mode = o.mode;
          if (o.sens > 0 && o.sens < 50) s.sens = o.sens;
          if (Number.isFinite(o.offset)) s.offset = Math.max(-500, Math.min(500, o.offset));
          if (Array.isArray(o.mods)) s.mods = o.mods.filter((m) => MOD_NAMES.includes(m));
        }
      }
      return s;
    }
    const savePrefs = (p, s) => save(p, P('prefs'), JSON.stringify({ mode: s.mode, sens: s.sens, offset: s.offset, mods: s.mods }));
    /** mods from words ('HD FL', 'hdfl', 'none') → [letters] or a reason: NF never with SD or PF (osu!'s own rule), PF over SD */
    function modsOf(words) {
      const w = words.join('').toUpperCase().replace(/[^A-Z]/g, '');
      if (!w || w === 'NONE' || w === 'NM') return [];
      const out = [];
      for (let i = 0; i < w.length; i += 2) { const m = w.slice(i, i + 2); if (!MOD_NAMES.includes(m)) return `${CFG.ns}: mods ${MOD_NAMES.join(' ')} | none (${m}?)`; if (!out.includes(m)) out.push(m); }
      if (out.includes('NF') && (out.includes('SD') || out.includes('PF'))) return `${CFG.ns}: NF cannot go with SD or PF`;
      return out.includes('PF') ? out.filter((m) => m !== 'SD') : out;
    }
    const play1 = (p, s, id) => { if (!id || !io.sound) return; try { io.sound(p, id, 1, 1); } catch (e) { /* (a sound the pack does not have: silent) */ } };
    /** every sound this player was sent stops (a pause, a seek, a stop: a sound in the game cannot be held or moved) */
    function silence(p, s) { if (io.stopSound) for (const id of s.ringing) { try { io.stopSound(p, id); } catch (e) { /* (gone) */ } } s.ringing.clear(); }
    const seqOf = (s) => CFG.sequences.find((q) => q.index === s.seq) || null;
    const nowMs = (s) => (s.paused ? s.from : s.from + (io.tick() - s.start) * 50);
    // (where the sequence is, as the client's Molang has it: loop and pingpong over its range, hold on its end)
    function seqTime(q, t) {
      const a = q.inOut ? q.inOut[0] : 0, b = q.inOut ? q.inOut[1] : q.duration, len = b - a;
      if (q.loop === 'hold') return Math.min(t, b - 0.001);
      if (!(len > 0) || t < a) return t;
      if (q.loop === 'loop') return a + ((t - a) % len);
      if (q.loop === 'pingpong') { const m = (t - a) % (2 * len); return a + (m <= len ? m : 2 * len - m); }
      return t;
    }
    // (which round of a loop or a pingpong it is: 0 before the range; a pingpong's odd rounds run backwards)
    function roundOf(q, t) {
      const a = q.inOut ? q.inOut[0] : 0, b = q.inOut ? q.inOut[1] : q.duration, len = b - a;
      if ((q.loop !== 'loop' && q.loop !== 'pingpong') || !(len > 0) || t < a) return 0;
      return Math.floor((t - a) / len);
    }
    const backwards = (q, s) => q.loop === 'pingpong' && s.round % 2 === 1;
    /** the seq property: the sequence, paused or not, the generation */
    const seqProp = (p, s) => set(p, P('seq'), s.seq + (s.paused ? PAUSE : 0) + GEN * s.gen);
    const set = (p, name, v) => { try { io.setProp(p, name, v); } catch (e) { /* (a property the pack does not have: said once by the pack's check) */ } };
    function values(p, s) {
      const acc = s.game ? s.acc : s.total ? Math.round((s.earned / s.total) * 10000) : 10000;
      set(p, P(CFG.values.score), s.score); set(p, P(CFG.values.combo), s.combo); set(p, P(CFG.values.accuracy), acc); set(p, P(CFG.values.health), Math.round(s.health));
    }
    function clearSlots(p, s) { for (const key of s.slots.keys()) set(p, P(`${key}t`), -1); s.slots.clear(); }
    /** each slot's result (3 bits of its group's property, contract.js): the result of the instance now in the slot (the last
     *  to have begun in it), 0 while it has none. Sent: the groups whose slots changed instance, and `also` (true: all) */
    function results(p, s, q, t, also) {
      for (const tp of q.templates) {
        if (!tp.events) continue;
        const now = new Map(), dirty = new Set();
        // (items in time order: in start order too — one lead for a template)
        for (const it of tp.items) { if (it[5] > t) break; now.set(it[1], it[6]); }
        for (const [k, id] of now) { const key = `${tp.tag}${k}`; if (s.cur.get(key) !== id) { s.cur.set(key, id); dirty.add(Math.floor(k / 8)); } }
        for (let g = 0; g * 8 < tp.slots; g++) {
          const name = `${tp.tag}e${g}`;
          if (!(also === true || (also && also.has(name)) || dirty.has(g))) continue;
          let v = 0;
          for (let k = g * 8; k < Math.min(tp.slots, g * 8 + 8); k++) v += (s.results.get(s.cur.get(`${tp.tag}${k}`)) || 0) * 2 ** (3 * (k - g * 8));
          if (also === true || s.groups.get(name) !== v) { s.groups.set(name, v); set(p, P(name), v); }
        }
      }
    }
    /** a new round (a play, a seek, a resume, a loop going round): nothing judged, every slot sent again */
    function newRound(p, s, q, t) {
      clearSlots(p, s);
      s.judged = new Set(); s.marks = new Set(); s.played = new Set(); s.results = new Map(); s.cur = new Map();
      if (q) {
        // (what is behind the time is judged already, with no result: a press cannot take it and it is no miss)
        for (const h of q.hits) if (h[0] + W.ok < t) s.judged.add(h[4]);
        for (const m of q.markers) if (m[0] < t) s.marks.add(m[1]);
        results(p, s, q, t, true);
      }
    }
    /** from a time on (a play, a seek, a resume): the client counts again from it (a new generation) */
    function restart(p, s, fromMs) {
      s.from = Math.max(0, Math.min(16777215, Math.round(fromMs))); s.start = io.tick(); s.gen = (s.gen + 1) % GENS;
      set(p, P('seq_from'), s.from); seqProp(p, s);
      silence(p, s);
      const q = seqOf(s);
      // (a sound starts only within LATE of its time: one already past at a seek or a resume stays silent)
      s.round = q ? roundOf(q, s.from) : 0;
      newRound(p, s, q, q ? seqTime(q, s.from) : s.from);
      if (q && q.game) gameStart(p, s, q, seqTime(q, s.from), false);
    }
    /** an instance's result, to its slot's group (seen only while it is the instance in its slot) */
    function send(p, s, q, h, result) {
      s.results.set(h[4], result);
      results(p, s, q, seqTime(q, nowMs(s)), new Set([`${h[1]}e${Math.floor(h[2] / 8)}`]));
    }
    function judgeOf(dt) { const a = Math.abs(dt); return a <= W.great ? 'great' : a <= W.good ? 'good' : a <= W.ok ? 'ok' : null; }
    // ---- osu!'s rules (osugame.js, a sequence with a game): the cursor from where the player looks, presses queued with their
    //      time, the game stepped each tick — its results to the slots, its events to the whole play's counters, its sounds
    //      played, its states to their properties (contract.js: 24 bits a property, packed as an instance's params)
    const GL = CFG.global || { events: [], groups: [], specs: {} };
    const packOf = (vals, spec) => { let n = 0, sh = 0; for (const f of spec) { const v = Math.min(Math.max(Number(vals[f.name]) || 0, f.min), f.max), L = 2 ** f.bits - 1; n += Math.round(((v - f.min) / (f.max - f.min)) * L) * 2 ** sh; sh += f.bits; } return n; };
    function gameStart(p, s, q, ms, fresh) {
      if (!q.game || !createGame) { s.game = null; return; }
      if (fresh || !s.game) { s.game = createGame(q.game, { mods: s.mods }).start(ms); s.failAt = -1; s.stopAt = -1; s.done = false; s.record = 0; }
      else s.game.seek(ms);
      s.ref = null; s.pending = []; s.prevMs = null;
    }
    /** the whole play's events (a hit, a miss, a fail…) counted up: the client takes a counter's change as the event's time */
    function countEvents(p, s, events) {
      let dirty = false;
      for (const [name] of events) if (GL.events.includes(name)) { s.ge[name] = ((s.ge[name] || 0) + 1) % 64; dirty = true; }
      if (dirty) for (let k = 0; k < GL.events.length; k += 4) { let v = 0; GL.events.slice(k, k + 4).forEach((e, j) => { v += (s.ge[e] || 0) * 2 ** (6 * j); }); set(p, P(k ? `ge${k / 4}` : 'ge'), v); }
    }
    /** the play's end (every object judged, not failed): the best kept and the scoreboard (not an autoplay's: osu! keeps none),
     *  the applause, a line in the chat */
    function finish(p, s, q, st) {
      const auto = s.mode === 'auto' || Boolean(s.tour), key = P(`best_${q.id}`);
      const best0 = Number(load(p, key)) || 0;
      if (!auto && st.score > best0) { s.record = 1; save(p, key, st.score); }
      const best = Math.max(best0, auto ? 0 : st.score);
      if (!auto && io.scoreboard) { try { io.scoreboard(p, `${CFG.ns}_best`, `osu! ${q.title || q.id}`, best); } catch (e) { /* (no scoreboard: the best is kept all the same) */ } }
      play1(p, s, q.game.sounds && q.game.sounds.applause);
      const ranks = ['-', 'D', 'C', 'B', 'A', 'S', 'SS'], mods = s.mods.length ? ` +${s.mods.join('')}` : '';
      if (io.message) { try { io.message(p, `§e${q.title || q.id}§r ${String(st.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${ranks[st.rank] || '-'} ${st.acc.toFixed(2)}% ×${st.maxcombo}${mods}${st.fc ? ' FULL COMBO' : ''}${auto ? ' (auto: not kept)' : s.record ? ' §a★ NEW RECORD§r' : ` (best ${String(best).replace(/\B(?=(\d{3})+(?!\d))/g, ',')})`}`); } catch (e) { /* (left) */ } }
    }
    function gameTick(p, s, q, ms) {
      const g = s.game, prev = s.prevMs === null ? ms : s.prevMs;
      let inp;
      if (s.mode === 'auto') inp = g.autoInput(prev, ms);
      else {
        const rot = io.rotation ? io.rotation(p) : { x: 0, y: 0 };
        if (!s.ref) s.ref = { x: rot.x, y: rot.y };
        let dy = rot.y - s.ref.y; while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
        const hx = (CFG.field && CFG.field[0]) || 90, hy = (CFG.field && CFG.field[1]) || 68;
        inp = { cx: Math.max(-hx, Math.min(hx, dy * s.sens)), cy: Math.max(-hy, Math.min(hy, -(rot.x - s.ref.x) * s.sens)), hold: io.held ? (io.held(p) ? 1 : 0) : 0, presses: s.pending.splice(0), aim: s.mode !== 'relax' };
        // (relax: held through a spinner, it spins by itself — a phone's thumb cannot draw circles with the camera)
        if (s.mode === 'relax' && inp.hold) { const a = g.autoInput(prev, ms); if (a.hold && !a.presses.length) { inp.cx = a.cx; inp.cy = a.cy; } }
      }
      s.prevMs = ms;
      const r = g.step(ms, inp);
      for (const [key, code] of r.results) { const h = q.keyMap && q.keyMap[key]; if (h) send(p, s, q, h, code); }
      countEvents(p, s, r.events);
      for (const [id] of r.sounds) play1(p, s, id);
      gameState(p, s, q);
    }
    /** the game's state to the properties: GeoUI's values, the packed groups (with the play's flags: the mods on, auto, a full
     *  combo so far, failed, a new best), and what a fail or the end calls for */
    function gameState(p, s, q) {
      const st = s.game.state();
      s.score = st.score; s.combo = st.combo; s.health = st.hp; s.acc = Math.round(st.acc * 100);
      sendGroups(p, s, st); values(p, s);
      // (failed: the music stops, the fail's sound, the play stopped once its fall has been seen — osu!'s fail screen)
      if (st.failed && s.failAt < 0) { s.failAt = nowMs(s); s.stopAt = s.failAt + FAIL_HOLD; silence(p, s); play1(p, s, q.game.sounds && q.game.sounds.fail); }
      if (st.done && !st.failed && !s.done) { s.done = true; finish(p, s, q, st); sendGroups(p, s, st); }
    }
    /** the packed groups the pack reads (contract.js STATE_GROUPS), the play's own flags with them */
    function sendGroups(p, s, st) {
      const has = (m) => (s.mods.includes(m) ? 1 : 0);
      const all = Object.assign({}, st, { hd: has('HD'), fl: has('FL'), nf: has('NF'), sd: has('SD'), pf: has('PF'), auto: s.mode === 'auto' ? 1 : 0, record: s.record });
      for (const grp of GL.groups) { const v = packOf(all, GL.specs[grp]); if (s.gp[grp] !== v) { s.gp[grp] = v; set(p, P(grp), v); } }
    }
    // ---- the tour: every look of the game, scene by scene at fixed times from its start (q.game.tour: [ms, what, …]). A scene
    //      the autoplay plays from a time on (a seek in auto, the results) takes the autoplay's play up to that time, made ready
    //      during the scene before it a slice a tick (the server's script is slow: a whole play at once stalls its tick)
    const modsIn = (c, now) => (c !== undefined && c !== null ? String(c).split(',').filter(Boolean) : now);
    /** the next scene that wants a play made ready: { k, at (the song's ms), mods } — or null */
    function prepOf(s, T0) {
      const sc = T0.q.game.tour;
      for (let k = T0.next; k < sc.length; k++) {
        const [, what, a, b, c] = sc[k];
        if (what === 'results') return { k, at: a, mods: [] };
        if (what === 'seek' && b === 'auto') return { k, at: a, mods: modsIn(c, s.mods) };
        if (what === 'stop') return null;
      }
      return null;
    }
    /** a slice of the next scene's play: as much of the song as finishes it by the scene's time (a stepped tour held on a scene:
     *  as much as finishes it in a second and a half — it waits for `tour next`) */
    function prepStep(s, T0, el) {
      const want = prepOf(s, T0);
      if (!want) { T0.prep = null; return; }
      if (!T0.prep || T0.prep.k !== want.k) T0.prep = { k: want.k, at: want.at, mods: want.mods, game: createGame(T0.q.game, { mods: want.mods }).start(0), done: 0 };
      const P0 = T0.prep;
      if (P0.done >= P0.at) return;
      const ticksLeft = Math.max(T0.held ? 30 : 1, Math.floor((T0.q.game.tour[P0.k][0] - el) / 50) - 1), slice = Math.max(1500, Math.ceil((P0.at - P0.done) / ticksLeft));
      P0.done = Math.min(P0.at, P0.done + slice); P0.game.fastForward(P0.done);
    }
    /** the play for scene k at the song's ms `at`: the one made ready (finished now if it is not yet), else made now */
    function takePrep(T0, k, at, mods) {
      const P0 = T0.prep && T0.prep.k === k && T0.prep.mods.join() === mods.join() ? T0.prep : null;
      T0.prep = null;
      return (P0 ? P0.game : createGame(T0.q.game, { mods }).start(0)).fastForward(at);
    }
    function tourStep(p, s) {
      const T0 = s.tour, q = T0.q, sc = q.game.tour;
      // (a stepped tour — `tour step`, then `tour next` for each scene after the first: its clock runs while a scene plays; at the
      //  next scene's time it holds, the play paused on the scene's last moment, until `tour next` — a shot taken late still sees
      //  its scene)
      let el;
      if (T0.manual) {
        const now = io.tick();
        if (!T0.held) T0.el += (now - T0.at) * 50;
        T0.at = now; el = T0.el;
        if (T0.next < sc.length && T0.next > T0.allow && el >= sc[T0.next][0]) {
          T0.el = el = sc[T0.next][0];
          if (!T0.held) { T0.held = true; if (s.seq && !s.paused) api.command(p, 'pause', []); }
        }
      } else el = (io.tick() - T0.t0) * 50;
      while (s.tour === T0 && T0.next < sc.length && sc[T0.next][0] <= el && (!T0.manual || T0.next <= T0.allow)) {
        const k = T0.next++, [, what, a, b, c] = sc[k];
        if (what === 'play') { s.mode = b || 'auto'; s.mods = modsIn(c, []); api.command(p, 'play', [String(q.index), String(a / 1000)]); }
        else if (what === 'seek') {
          if (b) s.mode = b;
          const mods = modsIn(c, s.mods);
          // (in auto: the autoplay's play up to the scene by the scene's mods — as if it had played so; else the play goes on
          //  from there, other mods by their rules from the start)
          if (s.game && s.mode === 'auto') s.game = takePrep(T0, k, a, mods);
          else if (s.game && mods.join() !== s.mods.join()) s.game = createGame(q.game, { mods }).start(0);
          s.mods = mods;
          if (s.seq) restart(p, s, a);
        } else if (what === 'mode') { s.mode = a; s.ref = null; }
        else if (what === 'results') {
          // (a whole play by the autoplay up to the end: the results as a full play would show them)
          s.mode = 'auto'; s.mods = [];
          if (!s.seq) api.command(p, 'play', [String(q.index), '0']);
          s.game = takePrep(T0, k, a, []); s.failAt = -1; s.stopAt = -1; s.done = false; s.record = 0;
          restart(p, s, a);
        } else if (what === 'fail' && s.game) { const r = s.game.fail(seqTime(q, nowMs(s))); countEvents(p, s, r.events); gameState(p, s, q); }
        else if (what === 'stop') api.command(p, 'stop', []);
      }
      // (over: the player's own settings back; else the next scene's play a slice nearer)
      if (s.tour === T0 && T0.next >= sc.length) { s.mode = T0.keep.mode; s.mods = T0.keep.mods; s.tour = null; }
      else if (s.tour === T0) prepStep(s, T0, el);
    }
    const api = {
      /** a scriptevent's verb and words for a player */
      command(p, verb, args) {
        const s = stateOf(p);
        if (verb === 'play') {
          const want = String(args[0] || '1'), q = CFG.sequences.find((x) => String(x.index) === want || x.id === want);
          if (!q) return `${CFG.ns}: no sequence ${want} (${CFG.sequences.map((x) => `${x.index}=${x.id}`).join(', ')})`;
          s.seq = q.index; s.last = q.index; s.paused = false; s.score = 0; s.combo = 0; s.best = 0; s.total = 0; s.earned = 0; s.health = 100; s.game = null;
          if (q.game) gameStart(p, s, q, Number(args[1] || 0) * 1000, true);
          restart(p, s, Number(args[1] || 0) * 1000); values(p, s);
          if (s.game) gameState(p, s, q);
          return '';
        }
        if (verb === 'stop') {
          // (a tour stopped, or over: the player's own settings back)
          if (s.tour) { s.mode = s.tour.keep.mode; s.mods = s.tour.keep.mods; s.tour = null; }
          s.seq = 0; s.paused = false; s.game = null; s.failAt = -1; s.stopAt = -1; seqProp(p, s); clearSlots(p, s); silence(p, s); return '';
        }
        // (how the player plays a game: auto — it plays itself; aim — the cursor where they look, a press to hit; relax — any
        //  press on time hits, sliders followed and spinners spun while held. sens: model units of cursor a degree of looking.
        //  Each kept for the player, as are the offset and the mods)
        if (verb === 'mode') { if (!['auto', 'aim', 'relax'].includes(String(args[0]))) return `${CFG.ns}: mode auto | aim | relax`; s.mode = String(args[0]); s.ref = null; if (!s.tour) savePrefs(p, s); return ''; }
        if (verb === 'sens') { const v = Number(args[0]); if (!(v > 0 && v < 50)) return `${CFG.ns}: sens <0.1…50>`; s.sens = v; savePrefs(p, s); return ''; }
        if (verb === 'offset') { const v = Number(args[0] || 0); if (!(Math.abs(v) <= 500)) return `${CFG.ns}: offset <-500…500 ms>`; s.offset = v; savePrefs(p, s); return ''; }
        // (the mods of the next play: HD FL NF SD PF, or none — osu!'s letters)
        if (verb === 'mods') { const m = modsOf(args); if (typeof m === 'string') return m; s.mods = m; if (!s.tour) savePrefs(p, s); return ''; }
        // (the last play again from its start: the same mode and mods)
        if (verb === 'retry') { if (!s.last) return `${CFG.ns}: nothing to retry`; if (s.tour) { s.mode = s.tour.keep.mode; s.mods = s.tour.keep.mods; s.tour = null; } return api.command(p, 'play', [String(s.last)]); }
        // (the tour: every look of a game in about 20 seconds, its scenes at fixed times — q.game.tour. `tour step`: the same scenes
        //  one at a time, each held on its last moment until `tour next` — what a slow camera can still take one by one)
        if (verb === 'tour') {
          if (String(args[0]) === 'next') {
            const T0 = s.tour;
            if (!T0 || !T0.manual) return `${CFG.ns}: no stepped tour (tour step first)`;
            const sc = T0.q.game.tour;
            T0.allow = T0.next; T0.at = io.tick();
            if (T0.held) { T0.held = false; if (s.seq && s.paused) api.command(p, 'resume', []); }
            if (T0.next < sc.length) T0.el = Math.max(T0.el, sc[T0.next][0]);
            tourStep(p, s);
            return '';
          }
          const manual = String(args[0]) === 'step', want = args[manual ? 1 : 0] ? String(args[manual ? 1 : 0]) : null;
          const q = CFG.sequences.find((x) => x.game && x.game.tour && (!want || String(x.index) === want || x.id === want));
          if (!q) return `${CFG.ns}: no tour (a game sequence has one)`;
          const keep = s.tour ? s.tour.keep : { mode: s.mode, mods: s.mods };
          s.tour = { q, t0: io.tick(), next: 0, keep, prep: null, ...(manual ? { manual: true, allow: 0, el: 0, at: io.tick(), held: false } : {}) };
          tourStep(p, s);
          return '';
        }
        if (!s.seq) return `${CFG.ns}: nothing is playing`;
        if (verb === 'pause') { if (!s.paused) { s.from = Math.round(nowMs(s)); s.paused = true; set(p, P('seq_from'), s.from); seqProp(p, s); silence(p, s); } return ''; }
        if (verb === 'resume') { if (s.paused) { s.paused = false; restart(p, s, s.from); } return ''; }
        if (verb === 'seek') { restart(p, s, Number(args[0] || 0) * 1000); return ''; }
        return `${CFG.ns}: unknown ${verb} (play stop pause resume seek offset mode sens mods retry tour [step|next])`;
      },
      /** what a game's menu shows a player: the game, their best, their settings (the script's forms) */
      menuInfo(p) {
        const s = stateOf(p), q = CFG.sequences.find((x) => x.game);
        if (!q) return null;
        return { index: q.index, id: q.id, title: q.title || q.id, best: Number(load(p, P(`best_${q.id}`))) || 0, mode: s.mode, sens: s.sens, offset: s.offset, mods: s.mods.slice(), playing: Boolean(s.seq), tour: Boolean(q.game.tour) };
      },
      /** every tick: the streamed slots, the misses, the markers */
      tick() {
        for (const p of io.players()) {
          const s = players.get(p.id);
          if (s && s.tour) tourStep(p, s);
          if (!s || !s.seq) continue;
          const q = seqOf(s);
          if (!q) continue;
          const raw = nowMs(s), round = roundOf(q, raw), t = seqTime(q, raw);
          // (a loop or a pingpong going round: its instances streamed and judged anew)
          if (round !== s.round) { s.round = round; newRound(p, s, q, t); }
          const back = backwards(q, s);
          for (const tp of q.templates) {
            if (tp.mode !== 'streamed') continue;
            const want = new Map();
            for (const it of tp.items) if (t >= it[0] - tp.lead - CFG.margin && t < it[3]) want.set(`${tp.tag}${it[1]}`, it);
            for (const [key, it] of want) if (s.slots.get(key) !== it) { s.slots.set(key, it); set(p, P(`${key}p`), it[2]); set(p, P(`${key}t`), it[0]); }
            for (const key of [...s.slots.keys()]) if (key.startsWith(tp.tag) && !want.has(key) && q.templates.every((o) => o === tp || !key.startsWith(o.tag))) { s.slots.delete(key); set(p, P(`${key}t`), -1); }
          }
          results(p, s, q, t, false);
          if (s.game && !s.paused) {
            gameTick(p, s, q, t);
            // (a failed play: stopped once its fall has been seen; a game held on its end: stopped a while after, its results seen)
            if (s.stopAt >= 0 && raw >= s.stopAt) { api.command(p, 'stop', []); continue; }
            if (q.autoStop && raw > q.autoStop) { api.command(p, 'stop', []); continue; }
            // (the music and the other audio clips — none once the play failed: osu!'s music stops there)
            if (s.failAt < 0) (q.sounds || []).forEach((c, i) => { if (s.played.has(i) || t < c[0] || t >= c[0] + LATE) return; s.played.add(i); if (!io.sound) return; try { io.sound(p, c[1], c[2], c[3]); s.ringing.add(c[1]); } catch (e) { /* (silent) */ } });
            for (const m of q.markers) if (!s.marks.has(m[1]) && t >= m[0]) { s.marks.add(m[1]); if (m[2] !== undefined && io.event) io.event(p, `${CFG.ns}:marker`, `${q.index}:${m[1]}${m[2] ? ` ${m[2]}` : ''}`); }
            continue;
          }
          if (!s.paused && !back) {
            // (the sequence's audio clips, each once a round)
            (q.sounds || []).forEach((c, i) => {
              if (s.played.has(i) || t < c[0] || t >= c[0] + LATE) return;
              s.played.add(i);
              if (!io.sound) return;
              try { io.sound(p, c[1], c[2], c[3]); s.ringing.add(c[1]); } catch (e) { /* (a sound the pack does not have: silent) */ }
            });
            for (const h of q.hits) if (!s.judged.has(h[4]) && t > h[0] + W.ok) {
              s.judged.add(h[4]); send(p, s, q, h, MISS);
              s.combo = 0; s.total += 1; s.health = Math.max(0, s.health - CFG.missDrain); values(p, s);
            }
            for (const m of q.markers) if (!s.marks.has(m[1]) && t >= m[0]) { s.marks.add(m[1]); if (m[2] !== undefined && io.event) io.event(p, `${CFG.ns}:marker`, `${q.index}:${m[1]}${m[2] ? ` ${m[2]}` : ''}`); }
          }
        }
      },
      /** a press (a button, an item used): the nearest instance not judged yet, within the widest window */
      press(p) {
        const s = players.get(p.id);
        if (!s || !s.seq || s.paused) return null;
        const q = seqOf(s);
        if (!q || backwards(q, s)) return null;
        // (a game: the press queued with its time, judged by the game on the next tick — where the cursor is. A failed play: a
        //  press after its first second plays it again — osu!'s retry)
        if (s.game) {
          if (s.failAt >= 0) { if (nowMs(s) - s.failAt >= RETRY_AFTER && !s.tour) { api.command(p, 'retry', []); return { retry: true }; } return null; }
          if (s.mode !== 'auto') s.pending.push(seqTime(q, nowMs(s)) + s.offset);
          return { queued: true };
        }
        const t = seqTime(q, nowMs(s)) + s.offset;
        let best = null;
        for (const h of q.hits) if (!s.judged.has(h[4]) && Math.abs(t - h[0]) <= W.ok && (!best || Math.abs(t - h[0]) < Math.abs(t - best[0]))) best = h;
        if (!best) return null;
        const j = judgeOf(t - best[0]);
        s.judged.add(best[4]); send(p, s, q, best, HIT);
        s.combo += 1; s.best = Math.max(s.best, s.combo); s.total += 1; s.earned += POINTS[j] / 300;
        s.score += POINTS[j] * (1 + Math.floor(s.combo / 10) / 10); s.score = Math.round(s.score);
        s.health = Math.min(100, s.health + CFG.hitGain); values(p, s);
        return { judge: j, dt: t - best[0], instance: best[3] };
      },
      /** a player (back) in the world: a client that joins again counts from its own first moment, so the sequence it was
       *  playing is sent again from where it is now; with nothing playing for it, a sequence its properties still name (a
       *  world saved while one played) is stopped */
      joined(p) {
        const s = players.get(p.id);
        if (s && s.seq) { restart(p, s, nowMs(s)); values(p, s); return; }
        const st = stateOf(p);
        if (Number(get(p, P('seq'))) % PAUSE !== 0) { st.seq = 0; st.paused = false; seqProp(p, st); }
      },
      state: (p) => players.get(p.id),
    };
    return api;
  }

  /** what the script needs of a document (and of compile's stats: each template's slots) → its CFG */
  function planOf(doc0, stats, opts = {}) {
    const M = T.model, K = T.contract, doc = M.normalize(doc0), ns = String(opts.ns || 'geoui');
    const windows = Object.assign({ great: 50, good: 100, ok: 150 }, opts.windows || {});
    const sequences = doc.sequences.map((seq, si) => {
      const i = si + 1, templates = [], hits = [];
      (seq.templates || []).forEach((tpl) => {
        const sl = stats && stats.slots && stats.slots[`${i}:${tpl.id}`];
        if (!sl) return;
        const judged = tpl.tracks.some((tr) => tr.clips.some((c) => c.trigger === 'hit' || c.until === 'hit' || c.trigger === 'miss'));
        const spec = tpl.pack || K.DEFAULT_PACK, items = [];
        for (const x of seq.instances.filter((y) => y.template === tpl.id).sort((a, b) => a.t - b.t)) {
          const slot = sl.slotOf[x.id];
          if (slot === undefined) continue;
          const tail = x.tail !== undefined ? x.tail : tpl.tail;
          // (time, slot, packed params, end, the instance, its start (when it takes its slot), its key (template/instance))
          items.push([Math.round(x.t * 1000), slot, sl.mode === 'streamed' ? K.pack(x.params, spec) : 0, Math.round((x.t + tail) * 1000), x.id, Math.round((x.t - tpl.lead) * 1000), `${tpl.id}/${x.id}`]);
          if (judged) hits.push([Math.round(x.t * 1000), sl.tag, slot, x.id, `${tpl.id}/${x.id}`]);
        }
        templates.push({ tag: sl.tag, mode: sl.mode, lead: Math.round(tpl.lead * 1000), slots: sl.slots, events: Boolean(sl.events), items });
      });
      // (each audio clip: its time, the sound's name as compile.js defines it, its volume and pitch)
      const sounds = [];
      for (const tr of seq.tracks) if (tr.kind === 'audio' && !tr.muted) for (const c of tr.clips) if (c.sound) sounds.push([Math.round(c.start * 1000), `${ns}.${clean(c.sound)}`, num(c.volume, 1), num(c.pitch, 1)]);
      const out = { index: i, id: seq.id, duration: Math.round(seq.duration * 1000), loop: seq.loop, inOut: seq.inOut ? seq.inOut.map((x) => Math.round(x * 1000)) : null,
        markers: seq.markers.map((m) => [Math.round(m.t * 1000), m.id, m.event]), templates, hits: hits.sort((a, b) => a[0] - b[0]), sounds: sounds.sort((a, b) => a[0] - b[0]) };
      // (a game: osu!'s rules for it — osugame.js — and each instance's key to its slot; held on its end, stopped 8 s after)
      if (seq.game) { out.game = seq.game; out.title = seq.name; out.keyMap = Object.fromEntries(out.hits.map((h) => [h[4], h])); if (seq.loop === 'hold') out.autoStop = out.duration + 8000; }
      return out;
    });
    const gl = (stats && stats.budget && stats.budget.global) || { events: [], groups: [], states: [] };
    return { ns, windows, margin: num(opts.margin, 250), missDrain: num(opts.missDrain, 8), hitGain: num(opts.hitGain, 2), mode: opts.mode || 'aim', sens: num(opts.sens, 2.4), field: opts.field || [90, 68],
      global: { events: gl.events, groups: gl.groups, specs: Object.fromEntries(gl.groups.map((g) => [g, K.STATE_GROUPS[g]])) },
      values: Object.assign({ score: 'v0', combo: 'v1', accuracy: 'v2', health: 'v3' }, opts.values || {}), sequences };
  }

  /** a game's menu in the pack's script (server-ui forms): /<ns>:osu or /scriptevent <ns>:menu — play (aim / relax / auto), the
   *  mods, the settings (sensitivity, offset), the tour. Japanese, as the lab's screens; the game's own words (osu!'s mods) as they are */
  const MENU = `
// osu!'s menu: /\${CFG.ns}:osu (or /scriptevent \${CFG.ns}:menu) — play, the mods, the settings, the tour
const MODS = [['HD', '円が消えていく・接近の輪なし ×1.06'], ['FL', 'カーソルのまわりだけ見える ×1.12'], ['NF', '失敗しない ×0.5'], ['SD', '1 つ落とすと失敗'], ['PF', '300 以外で失敗']];
const HOW = { aim: '見ている所がカーソル', relax: '押すタイミングだけ', auto: 'オート' };
const fmt = (n) => String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
async function menu(p) {
  const m = engine.menuInfo(p);
  if (!m || !p.isValid) return;
  const f = new ActionFormData().title('osu! — ' + m.title)
    .body('ベスト ' + fmt(m.best) + '\\n遊び方: ' + HOW[m.mode] + '　Mods: ' + (m.mods.join(' ') || 'なし') + '\\n感度 ' + m.sens + '・ずれ ' + m.offset + ' ms\\n押す: ジャンプ・スニーク・アイテムを使う');
  const acts = [];
  const add = (label, fn) => { f.button(label); acts.push(fn); };
  const play = (mode) => () => { engine.command(p, 'mode', [mode]); return engine.command(p, 'play', [String(m.index)]); };
  add('▶ プレイ（見ている所がカーソル）', play('aim'));
  add('▶ プレイ（押すタイミングだけ）', play('relax'));
  add('▶ オートで見る', play('auto'));
  add('Mods: ' + (m.mods.join(' ') || 'なし'), () => mods(p));
  add('設定（感度・ずれ）', () => settings(p));
  if (m.tour) add('検証ツアー（全部の演出を約 20 秒で）', () => engine.command(p, 'tour', []));
  if (m.playing) add('やめる', () => engine.command(p, 'stop', []));
  const r = await f.show(p);
  if (r.canceled || r.selection === undefined || !p.isValid) return;
  const why = await acts[r.selection]();
  if (typeof why === 'string' && why) p.sendMessage(why);
}
async function mods(p) {
  const m = engine.menuInfo(p), f = new ModalFormData().title('osu! — Mods');
  for (const [k, what] of MODS) f.toggle(k + '（' + what + '）', { defaultValue: m.mods.includes(k) });
  const r = await f.show(p);
  if (r.canceled || !r.formValues || !p.isValid) return;
  const on = MODS.filter((x, i) => r.formValues[i]).map((x) => x[0]), why = engine.command(p, 'mods', on.length ? on : ['none']);
  if (why) p.sendMessage(why);
  return menu(p);
}
async function settings(p) {
  const m = engine.menuInfo(p), f = new ModalFormData().title('osu! — 設定')
    .slider('感度（1 度でカーソルが動く量 ×10）', 5, 60, { valueStep: 1, defaultValue: Math.max(5, Math.min(60, Math.round(m.sens * 10))) })
    .slider('ずれ（押した時刻を遅らせる ms）', -200, 200, { valueStep: 10, defaultValue: Math.max(-200, Math.min(200, Math.round(m.offset / 10) * 10)) });
  const r = await f.show(p);
  if (r.canceled || !r.formValues || !p.isValid) return;
  engine.command(p, 'sens', [String(r.formValues[0] / 10)]);
  engine.command(p, 'offset', [String(r.formValues[1])]);
  return menu(p);
}
system.beforeEvents.startup.subscribe((e) => {
  e.customCommandRegistry.registerCommand({ name: CFG.ns + ':osu', description: 'osu!: menu (play, mods, settings, the tour)', permissionLevel: CommandPermissionLevel.Any }, (o) => {
    const p = o.initiator ?? o.sourceEntity;
    if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) menu(p); });
    return { status: CustomCommandStatus.Success };
  });
});
`;

  /** the pack's script for a CFG: the engine, wired to the world */
  function scriptOf(CFG) {
    const game = CFG.sequences.some((q) => q.game) && T.osugame;
    return `// GeoUI timeline: plays the pack's sequences for each player (GeoUI Builder's timeline; bds-lab bds/geoui/timeline).
// /scriptevent ${CFG.ns}:play <sequence number or id> [from seconds] · ${CFG.ns}:stop · ${CFG.ns}:pause · ${CFG.ns}:resume
// ${CFG.ns}:seek <seconds> · ${CFG.ns}:offset <ms> (presses judged that much later: the lag of a device)
// A game (osu!): ${CFG.ns}:mode auto | aim | relax (it plays itself / the cursor where you look / any press on time) · ${CFG.ns}:sens <units a degree>
// · ${CFG.ns}:mods HD FL NF SD PF | none · ${CFG.ns}:retry · ${CFG.ns}:tour (every look in about 20 s) · ${CFG.ns}:menu (or /${CFG.ns}:osu)
// Presses: jump or sneak, or using an item. Score, combo, accuracy (x100) and health go to ${CFG.ns}:${CFG.values.score} … ${CFG.values.health}.
// Markers with an event send /scriptevent ${CFG.ns}:marker <sequence>:<marker> <event>. Audio clips play when the time
// reaches them and stop at a pause, a seek or a stop (a sound already past at a seek or a resume stays silent).
import { world, system, ButtonState, InputButton${game ? ', Player, CommandPermissionLevel, CustomCommandStatus' : ''} } from '@minecraft/server';
${game ? "import { ActionFormData, ModalFormData } from '@minecraft/server-ui';\n" : ''}
const CFG = ${JSON.stringify(CFG)};
const createEngine = ${createEngine.toString()};
${CFG.sequences.some((q) => q.game) && T.osugame ? `// osu!'s rules (GeoUI timeline osugame.js): what a game sequence is played by
const createGame = ${T.osugame.createGame.toString()};
` : 'const createGame = null;\n'}const engine = createEngine(CFG, {
  tick: () => system.currentTick,
  setProp: (p, name, value) => { if (p.isValid) p.setProperty(name, value); },
  getProp: (p, name) => (p.isValid ? p.getProperty(name) : undefined),
  players: () => world.getAllPlayers(),
  event: (p, id, message) => system.sendScriptEvent(id, message),
  sound: (p, id, volume, pitch) => { if (p.isValid) p.playSound(id, { volume, pitch }); },
  stopSound: (p, id) => { if (p.isValid) p.runCommand(\`stopsound @s \${id}\`); },
  rotation: (p) => (p.isValid ? p.getRotation() : { x: 0, y: 0 }),
  held: (p) => { if (!p.isValid) return false; const i = p.inputInfo; return i.getButtonState(InputButton.Jump) === ButtonState.Pressed || i.getButtonState(InputButton.Sneak) === ButtonState.Pressed; },
  // (the player's own values kept in the world: a game's settings and best)
  load: (p, key) => (p.isValid ? p.getDynamicProperty(key) : undefined),
  save: (p, key, v) => { if (p.isValid) p.setDynamicProperty(key, v); },
  scoreboard: (p, id, name, score) => { const sb = world.scoreboard, o = sb.getObjective(id) ?? sb.addObjective(id, name); if (p.isValid) o.setScore(p, score); },
  message: (p, text) => { if (p.isValid) p.sendMessage(text); },
}, createGame);
// (a player who joins again counts from their own first moment: what they were playing is sent again from where it is)
world.afterEvents.playerSpawn.subscribe((e) => { if (e.initialSpawn) system.run(() => { if (e.player.isValid) engine.joined(e.player); }); });
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(CFG.ns.length + 1);
  if (!['play', 'stop', 'pause', 'resume', 'seek', 'offset', 'mode', 'sens', 'mods', 'retry', 'tour'${game ? ", 'menu'" : ''}].includes(verb)) return;
  const words = String(e.message).trim().split(/\\s+/).filter(Boolean);
  const targets = e.sourceEntity && e.sourceEntity.typeId === 'minecraft:player' ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) {${game ? " if (verb === 'menu') { menu(p); continue; }" : ''} const why = engine.command(p, verb, words); if (why) console.warn(why); }
}, { namespaces: [CFG.ns] });
system.runInterval(() => engine.tick(), 1);
world.afterEvents.playerButtonInput.subscribe((e) => { if (e.newButtonState === ButtonState.Pressed) engine.press(e.player); });
world.afterEvents.itemUse.subscribe((e) => engine.press(e.source));
${game ? MENU.replace(/\$\{CFG\.ns\}/g, CFG.ns) : ''}`;
  }

  /** the timeline into GeoUI Builder's files, BP side: the properties (contract.propertyDefs) on the player and the script.
   *  ctx: { stats (compile.extendPack's), ns, windows (osu.js hitWindows: { great, good, meh }), margin, mode (a game's: 'aim',
   *  'relax', 'auto'), sens (model units of cursor a degree of looking), field ([half width, half height] the cursor stays in) }
   *  → { files, warnings, cfg } */
  function extendBehavior(files0, doc, ctx = {}) {
    const files = Object.assign({}, files0), warnings = [], ns = String(ctx.ns || 'geoui'), bpDir = `${ns}_BP`, K = T.contract;
    const playerFile = `${bpDir}/entities/player.json`, mainFile = `${bpDir}/scripts/main.js`;
    if (!files[playerFile] || !files[mainFile]) { warnings.push('ビヘイビアパックがありません（GeoUI の設定で「ビヘイビアパックも作る」）: ゲームの中で再生する命令は書き出せません'); return { files, warnings, cfg: null }; }
    const w = ctx.windows || {}, cfg = planOf(doc, ctx.stats, { ns, margin: ctx.margin, windows: w.great !== undefined ? { great: w.great, good: w.good, ok: w.meh !== undefined ? w.meh : w.ok } : undefined, mode: ctx.mode, sens: ctx.sens, field: ctx.field });
    const pj = JSON.parse(typeof files[playerFile] === 'string' ? files[playerFile] : JSON.stringify(files[playerFile]));
    const desc = pj['minecraft:entity'].description, budget = ctx.stats && ctx.stats.budget ? ctx.stats.budget : K.budget(T.model.normalize(doc), { ns });
    desc.properties = Object.assign({}, desc.properties || {}, K.propertyDefs(budget, ns));
    const count = Object.keys(desc.properties).length;
    if (count > 32) warnings.push(`プレイヤーのプロパティが ${count} 個です（上限は 32 と見込む・要実測）`);
    files[playerFile] = `${JSON.stringify(pj, null, 2)}\n`;
    // (a game's menu takes server-ui's forms: the behaviour pack depends on it — 2.2.0, the stable one of this BDS; any 2.x
    //  takes the pack's @minecraft/server 2.x)
    if (cfg.sequences.some((q) => q.game) && T.osugame) {
      const mf = `${bpDir}/manifest.json`;
      if (files[mf]) {
        const m = JSON.parse(typeof files[mf] === 'string' ? files[mf] : JSON.stringify(files[mf]));
        m.dependencies = m.dependencies || [];
        if (!m.dependencies.some((d) => d.module_name === '@minecraft/server-ui')) m.dependencies.push({ module_name: '@minecraft/server-ui', version: '2.2.0' });
        files[mf] = `${JSON.stringify(m, null, 2)}\n`;
      } else warnings.push('ビヘイビアパックの manifest.json がありません: ゲームのメニュー（フォーム）は動きません');
    }
    files[`${bpDir}/scripts/timeline.js`] = scriptOf(cfg);
    const main = String(files[mainFile]);
    if (!/import '\.\/timeline\.js';/.test(main)) files[mainFile] = `${main.replace(/\n*$/, '\n')}import './timeline.js';\n`;
    return { files, warnings, cfg };
  }

  T.runtime = { createEngine, planOf, scriptOf, extendBehavior };
  if (typeof module === 'object' && module && module.exports) module.exports = T.runtime;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/store.js
(function (module) {
// GeoUI timeline — the store (bds/geoui/timeline/PLAN.md step 7): the one place the editors (timeline.js, inspector.js,
// instances.js, pathedit.js) read the document and send their edits. Every edit is an intent run through
// GeoUITimeline.model.reduce — nothing else changes the document — and a host's undo wraps it (in Blockbench one step of its
// Undo a dispatch: undo and redo bring the document back, store.refresh() tells the editors). The selection is the editors'
// own (neither saved nor undone, and never naming a thing the document no longer has); the time and the transport are the
// player's (player.js) when there is one. Subscribers hear what changed: { doc, selection, time } (a playing timeline changes
// only the time 60 times a second — an inspector need not draw itself again for that).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const M = () => T.model;
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

  // the words of an undo step (Blockbench's history shows them): an intent's type → what it did
  const LABELS = {
    'seq.add': 'シーケンスを足す', 'seq.remove': 'シーケンスを消す', 'seq.set': 'シーケンスを変える',
    'track.add': 'トラックを足す', 'track.remove': 'トラックを消す', 'track.set': 'トラックを変える', 'track.move': 'トラックを並べ替える',
    'clip.add': 'クリップを足す', 'clip.remove': 'クリップを消す', 'clip.set': 'クリップを変える', 'clip.move': 'クリップを動かす', 'clip.trim': 'クリップの端を動かす',
    'clip.split': 'クリップを切る', 'clip.duplicate': 'クリップを複製する',
    'key.add': '鍵を足す', 'key.remove': '鍵を消す', 'key.set': '鍵を変える', 'key.move': '鍵を動かす',
    'marker.add': 'マーカーを足す', 'marker.remove': 'マーカーを消す', 'marker.set': 'マーカーを変える',
    'tempo.add': 'テンポを足す', 'tempo.remove': 'テンポを消す', 'tempo.set': 'テンポを変える',
    'path.add': '道を足す', 'path.remove': '道を消す', 'path.set': '道を変える',
    'template.add': 'テンプレートを足す', 'template.remove': 'テンプレートを消す', 'template.set': 'テンプレートを変える',
    'instance.add': '実体を足す', 'instance.remove': '実体を消す', 'instance.set': '実体を変える', 'instance.move': '実体を動かす',
    'instances.import': '実体を取り込む', 'preset.apply': 'プリセットを置く',
  };
  /** an intent's words for an undo step (a batch: its first's, with how many) */
  function labelOf(intent) {
    if (!intent || typeof intent.type !== 'string') return 'タイムライン';
    if (intent.type === 'batch') { const xs = intent.intents || []; return xs.length ? `${labelOf(xs[0])}${xs.length > 1 ? `（${xs.length} 件）` : ''}` : 'タイムライン'; }
    return intent.label || LABELS[intent.type] || intent.type;
  }

  /** a selection with only what the document has: its sequence (else the first), clips, keys (of clips there), instances,
   *  markers, path and template there — the same object back when nothing had to go */
  function prune(sel, doc) {
    const seqs = (doc && doc.sequences) || [], seq = seqs.find((s) => s.id === sel.seq) || seqs[0] || null;
    const out = { ...sel, seq: seq ? seq.id : null, clips: [], keys: [], instances: [], markers: [] };
    if (seq) {
      const clips = new Map();
      for (const tr of seq.tracks) for (const c of tr.clips) clips.set(c.id, c);
      for (const tp of seq.templates || []) for (const tr of tp.tracks) for (const c of tr.clips) clips.set(c.id, c);
      const has = (list, id) => list.some((x) => x.id === id);
      out.clips = (sel.clips || []).filter((id) => clips.has(id));
      out.keys = (sel.keys || []).filter((k) => { const c = clips.get(k.clip), ks = c && c.channels && c.channels[k.prop]; return !!(ks && ks[k.index]); });
      out.instances = (sel.instances || []).filter((id) => has(seq.instances || [], id));
      out.markers = (sel.markers || []).filter((id) => has(seq.markers || [], id));
      if (sel.path && !has(seq.paths || [], sel.path)) out.path = null;
      if (sel.template && !has(seq.templates || [], sel.template)) out.template = null;
    } else { out.path = null; out.template = null; }
    const same = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));
    return Object.keys(out).every((k) => same(out[k], sel[k])) && Object.keys(sel).every((k) => k in out) ? sel : out;
  }

  /** two selections that name the same things */
  function sameSel(a, b) {
    if (a === b) return true;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const x = a[k], y = b[k];
      if (Array.isArray(x) && Array.isArray(y)) { if (x.length !== y.length || x.some((v, i) => (v && typeof v === 'object' ? JSON.stringify(v) !== JSON.stringify(y[i]) : v !== y[i]))) return false; }
      else if (x !== y && !((x === null || x === undefined) && (y === null || y === undefined))) return false;
    }
    return true;
  }

  /** o: { getDoc() (the host's document, e.g. the project's), setDoc(doc) (keep it there), undo: { edit(label, apply) } (the host's
   *  undo around one edit), elements() ([{ name, x, y }]: the design's), media() ([{ id, kind, name, duration, peaks }]),
   *  player (player.js; else a time of its own and a transport that only moves it), onError(e) } */
  function createStore(o = {}) {
    const empty = () => ({ version: 1, sequences: [] });
    const read = () => M().normalize((o.getDoc && o.getDoc()) || empty());
    let doc = read(), player = o.player || null, local = { time: 0, playing: false, rate: 1 };
    let sel = prune({ seq: null, clips: [], keys: [], instances: [], markers: [], path: null, template: null }, doc);
    const subs = new Set();
    function notify(what) {
      for (const f of [...subs]) { try { f(what); } catch (e) { if (o.onError) o.onError(e); else if (root.console) root.console.error(e); } }
    }
    const fpsOf = () => { const s = (doc.sequences || []).find((q) => q.id === sel.seq); return (s && s.fps) || 20; };
    // (without a player: a time of its own; play / pause only say so — nothing runs it)
    const transport = {
      play() { if (player) player.play(); else { local.playing = true; notify({ time: true, transport: true }); } },
      pause() { if (player) player.pause(); else { local.playing = false; notify({ time: true, transport: true }); } },
      toggle() { if (player) player.toggle(); else { local.playing = !local.playing; notify({ time: true, transport: true }); } },
      stop() { if (player) player.stop(); else { local.playing = false; local.time = 0; notify({ time: true, transport: true }); } },
      step(n = 1) { if (player) player.step(n); else api.seek(Math.max(0, Math.round((local.time + num(n, 1) / fpsOf()) * fpsOf()) / fpsOf())); },
      rate(r) { if (player) player.rate(r); else local.rate = num(r, 1) || 1; },
      playing: () => (player ? player.playing() : local.playing),
    };
    const api = {
      doc: () => doc,
      /** an edit: { ok, doc, error, id } — the document changed only when ok (one undo step) */
      dispatch(intent) {
        const r = M().reduce(doc, intent);
        if (!r.ok || r.doc === doc) return r;
        const next = r.doc, apply = () => { doc = next; if (o.setDoc) o.setDoc(next); };
        try {
          if (o.undo && typeof o.undo.edit === 'function') o.undo.edit(labelOf(intent), apply); else apply();
        } catch (e) { return { doc, ok: false, error: String(e && e.message ? e.message : e) }; }
        // (a new sequence is the one shown)
        const s2 = prune(intent && intent.type === 'seq.add' && r.id ? { ...sel, seq: r.id } : sel, doc), moved = s2 !== sel;
        sel = s2;
        notify({ doc: true, selection: moved, intent });
        return r;
      },
      selection: () => sel,
      select(partial) { const s2 = prune({ ...sel, ...(partial || {}) }, doc); if (sameSel(s2, sel)) return; sel = s2; notify({ selection: true }); },
      time: () => (player ? player.time() : local.time),
      seek(t) { if (player) player.seekTo(t); else { local.time = Math.max(0, num(t)); notify({ time: true }); } },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      elements: () => (o.elements ? o.elements() || [] : []),
      media: () => (o.media ? o.media() || [] : []),
      transport,
      /** the host's document changed under the store (an undo or redo, another project): read it again */
      refresh() { doc = read(); sel = prune(sel, doc); notify({ doc: true, selection: true, external: true }); },
      /** the player's time moved (it calls this every frame it draws) */
      timeChanged() { notify({ time: true }); },
      setPlayer(p) { player = p || null; },
      player: () => player,
      label: labelOf,
      dispose() { subs.clear(); if (player && player.dispose) player.dispose(); player = null; },
    };
    return api;
  }

  /** is a store's notice one an editor that does not show the time must draw itself again for? (no argument: yes) */
  const needsDraw = (what) => !what || !!(what.doc || what.selection || what.external);

  T.store = { createStore, labelOf, prune, sameSel, needsDraw, LABELS };
  if (typeof module === 'object' && module && module.exports) module.exports = T.store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- timeline/bridge.js
(function (module) {
/* global document, Image, Blockbench, Project, ModelProject, Property, Group, Cube, Modes, Animator, Preview, Panel, Undo, Action, Dialog, THREE, Canvas, JSZip */
// GeoUI timeline — the bridge (bds/geoui/timeline/PLAN.md step 7): the timeline inside GeoUI Builder in Blockbench.
//  - the document and its sounds kept in the project (.bbmodel: Project.geoui_timeline, Project.geoui_media); every edit one
//    step of Blockbench's Undo (its history names it; undo and redo bring the document back)
//  - three panels — the timeline below (with its sequences), the inspector and the instances' table on the right — and the
//    paths and instances drawn over the preview (pathedit.js)
//  - a preview that plays: the sequence evaluated each frame (model.evaluate: the export's own values) and put on the bones over
//    Blockbench's own pose (GeoUI's layout for the preview's screen), see-through and flipbook frames by a material of the bone's
//    own while it plays, each instance by a copy of its template's bones (never saved: made and dropped as instances come and
//    go), the sounds through WebAudio — and a video of it (webm, or PNGs in a zip)
//  - the export: GeoUI Builder's pack with the timeline's RP (compile.js) and BP (runtime.js)
//  - osu! maps (.osu, .osz) with the elements they need drawn when the project lacks them (slider bodies into an atlas)
// The pure parts are tested in Node (tests/tl-bridge-offline.mjs); the rest in the real Blockbench (check-bridge.mjs).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const TINY = 1e-5;   // (Blockbench's own "scale 0": a bone collapsed to a point)
  const nz = (v) => (Math.abs(v) < TINY ? TINY : v);
  const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'e';

  // ---------------------------------------------------------------------------------------------------------------- pure
  /** a number's digits for a value (most significant first): the numeral each shows, −1 for a leading zero not shown — GeoUI
   *  Builder's own rule (GeoUICore.digitExpr): the last `count` digits, the last one always shown */
  function digitsOf(value, count, hideLeadingZero = true) {
    const v = Math.floor(Math.abs(num(value))), out = [];
    for (let k = 0; k < count; k++) {
      const place = 10 ** (count - 1 - k);
      out.push(hideLeadingZero && k < count - 1 && v < place ? -1 : Math.floor(v / place) % 10);
    }
    return out;
  }
  /** Blockbench's texture shader (as written, or minified as its build ships it) with an alpha and a uv offset of the bone's own:
   *  the map sampled at vUv + GEOUI_UV, the colour's alpha times GEOUI_ALPHA at the end (null: a shader this does not know) */
  function patchShader(src) {
    const decl = /uniform\s+sampler2D\s+map\s*;/, sample = /texture2D\s*\(\s*map\s*,\s*vUv\s*\)/g, clip = /#include\s*<clipping_planes_fragment>/;
    if (typeof src !== 'string' || !decl.test(src) || !src.match(sample) || !/void\s+main\s*\(/.test(src)) return null;
    let out = src.replace(decl, (m) => `${m}\nuniform float GEOUI_ALPHA;\nuniform vec2 GEOUI_UV;\n`).replace(sample, 'texture2D(map, vUv + GEOUI_UV)');
    if (clip.test(out)) out = out.replace(clip, (m) => `gl_FragColor.a *= GEOUI_ALPHA;\n${m}`);
    else { const end = out.lastIndexOf('}'); if (end < 0) return null; out = `${out.slice(0, end)}gl_FragColor.a *= GEOUI_ALPHA;\n${out.slice(end)}`; }
    return out;
  }
  /** four corners in px [top-left, top-right, bottom-right, bottom-left] → an upright rectangle { x, y, w, h }, or null (the
   *  camera turned: the screen is not shown face on) */
  function rectOf(pts, tol = 1.5) {
    if (!Array.isArray(pts) || pts.length !== 4 || !pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return null;
    const [tl, tr, br, bl] = pts;
    if (Math.abs(tl[1] - tr[1]) > tol || Math.abs(bl[1] - br[1]) > tol || Math.abs(tl[0] - bl[0]) > tol || Math.abs(tr[0] - br[0]) > tol) return null;
    const x = Math.min(tl[0], bl[0]), y = Math.min(tl[1], tr[1]), w = Math.max(tr[0], br[0]) - x, h = Math.max(bl[1], br[1]) - y;
    return w > 1 && h > 1 && tr[0] > tl[0] && bl[1] > tl[1] ? { x, y, w, h } : null;
  }
  /** a flipbook's frame as a uv offset (0…1 units; three.js's v goes up): its column and row of `cols`, a cell du × dv */
  function frameOffset(fr, cols, du, dv) { const f = Math.max(0, Math.floor(num(fr))), c = Math.max(1, Math.round(num(cols, 1))); return [(f % c) * du, -Math.floor(f / c) * dv]; }
  /** the elements a sequence's templates move (their prototypes: hidden while it plays — their copies show) */
  function protosOf(seq) { const out = new Set(); for (const tp of (seq && seq.templates) || []) for (const tr of tp.tracks) if (tr.kind === 'layer' && tr.target) out.add(tr.target); return out; }
  /** a sound's id in the pack (compile.js's name for it), not one already taken */
  function soundId(name, taken) { const base = clean(String(name).replace(/\.[^.]*$/, '')); let id = base, i = 1; while ((taken || []).includes(id)) id = `${base}_${++i}`; return id; }
  /** a design (GeoUICore's input: bones, elements — osukit.js builds one) as Blockbench's outliner: groups (origin, rotation, the
   *  element's settings — a number's numerals under digit groups, as GeoUI Builder reads them) and cubes (from, to, faces' uv) —
   *  the inverse of GeoUI Builder's design(): x mirrored, up and down faces' uv turned round. The root (geo_ui) is the project's
   *  own. toBB: GeoUI Builder's (Bedrock → Blockbench) */
  function designToOutliner(design, toBB = (v) => [-v[0], v[1], v[2]]) {
    const els = design.elements || {}, groups = [], cubes = [], r4 = (v) => v.map((x) => Math.round(x * 1e4) / 1e4 + 0);
    const parentOf = new Map(), numeralOf = new Map();
    // (a number's numerals: under a digit group each — GeoUI Builder finds them by the digit's index and the numeral's value)
    for (const [name, el] of Object.entries(els)) if (el.type === 'number' && el.number && Array.isArray(el.number.digits)) el.number.digits.forEach((ns, k) => ns.forEach((n, v) => { if (n) numeralOf.set(n, { number: name, k, v }); }));
    const madeDigit = new Set();
    for (const b of design.bones || []) {
      if (!b.parent) { groups.push({ name: b.name, root: true }); continue; }
      let parent = b.parent;
      const nm = numeralOf.get(b.name);
      if (nm) {
        const dg = `${nm.number}_d${nm.k}`;
        if (!madeDigit.has(dg)) { madeDigit.add(dg); const owner = (design.bones || []).find((x) => x.name === nm.number); groups.push({ name: dg, parent: nm.number, origin: r4(toBB(owner ? owner.pivot : b.pivot)), rotation: [0, 0, 0], geoui: { role: 'digit', index: nm.k } }); }
        parent = dg;
      }
      parentOf.set(b.name, parent);
      const el = els[b.name], meta = el ? Object.assign({}, el) : nm ? { role: 'numeral', value: nm.v } : null;
      if (meta && meta.number) meta.number = { source: meta.number.source, hideLeadingZero: meta.number.hideLeadingZero };
      groups.push({ name: b.name, parent, origin: r4(toBB(b.pivot || [0, 0, 0])), rotation: b.rotation ? [-b.rotation[0], -b.rotation[1], b.rotation[2]] : [0, 0, 0], geoui: meta });
      (b.cubes || []).forEach((c, i) => {
        const [x, y, z] = c.origin, [w, h, d] = c.size, faces = {};
        for (const key of ['north', 'south', 'east', 'west', 'up', 'down']) {
          const f = c.faces && c.faces[key];
          if (!f) continue;
          const [u, v] = f.uv, [sw, sh] = f.uv_size;
          faces[key] = { uv: key === 'up' || key === 'down' ? [u + sw, v + sh, u, v] : [u, v, u + sw, v + sh], texture: f.texture };
        }
        cubes.push({ name: `${b.name}_c${i}`, parent: b.name, from: r4([-(x + w), y, z]), to: r4([-x, y + h, z + d]), origin: r4(toBB(b.pivot || [0, 0, 0])), faces });
      });
    }
    return { groups, cubes };
  }
  /** slider bodies (osu.toDocument's) in one flipbook of equal cells: { cols, rows, cell: [w, h] px, pxPerUnit, w, h, at(i) → [x, y] }
   *  — px a unit as many as fit in maxSize (4 at most) */
  function bodyAtlas(bodies, { maxSize = 2048, most = 4 } = {}) {
    // (each body's extent: the line its ball follows, as bodyImage draws it)
    const n = Math.max(1, bodies.length), span = (b, ax) => { const v = (b.line && b.line.length ? b.line : b.points).map((p) => p[ax]); return Math.max(...v) - Math.min(...v) + b.width + 2; };
    const W = Math.max(1, ...bodies.map((b) => span(b, 0))), H = Math.max(1, ...bodies.map((b) => span(b, 1))), cols = Math.ceil(Math.sqrt((n * H) / W)) || 1, rows = Math.ceil(n / cols);
    // (a cell a whole number of px at most maxSize / cols wide: the atlas never passes maxSize)
    const p = Math.max(0.25, Math.min(most, Math.floor(maxSize / cols) / W, Math.floor(maxSize / rows) / H));
    const cw = Math.ceil(W * p), ch = Math.ceil(H * p);
    return { cols, rows, cell: [cw, ch], pxPerUnit: p, w: cols * cw, h: rows * ch, units: [cw / p, ch / p], at: (i) => [(i % cols) * cw, Math.floor(i / cols) * ch] };
  }
  /** base64 ↔ bytes (the sounds kept in the project) */
  function toB64(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== 'undefined' && typeof root.btoa !== 'function') return Buffer.from(b).toString('base64');
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return root.btoa(s);
  }
  function fromB64(s) {
    if (typeof Buffer !== 'undefined' && typeof root.atob !== 'function') return new Uint8Array(Buffer.from(String(s), 'base64'));
    const bin = root.atob(String(s)), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /** what a sound file is: { ext, seconds } (null: not one the game plays — .ogg and .wav — though the preview may) */
  function soundInfo(name, bytes) {
    const ext = String(name).toLowerCase().split('.').pop(), Me = T.media;
    if (ext === 'wav') { const i = Me.wavInfo(bytes); return i ? { ext, seconds: i.seconds, game: true } : null; }
    if (ext === 'ogg') { const i = Me.oggInfo(bytes); return { ext, seconds: i ? i.seconds : 0, game: true }; }
    if (ext === 'mp3' || ext === 'm4a' || ext === 'flac') return { ext, seconds: 0, game: false };
    return null;
  }

  // ---------------------------------------------------------------------------------------------------------------- Blockbench
  /** the bridge in Blockbench. ctx: GeoUI Builder's own — { G (GeoUICore), isGeo(), settings(), elementOf(node), boxOf(group),
   *  preview(), frame(), toBB, fromBB, say(text, kind), addImage(o), addNumber(o), setFrameVisible(bool), view() } →
   *  { uninstall(), extend(built, design), actions (ids for GeoUI's menu), store, player } */
  function install(ctx) {
    const G = ctx.G, isGeo = ctx.isGeo, say = ctx.say;
    const st = { props: [], panels: [], actions: [], listeners: [], mounts: [], pe: null, states: null, seq: null, wrapped: new Map(), clones: new Map(), warned: new Set(),
      decoded: new Map(), decoding: new Set(), audioCtx: null, elemCache: null, previewing: false, exporting: false };
    const on = (ev, f) => { Blockbench.on(ev, f); st.listeners.push([ev, f]); };
    const warnOnce = (k, m) => { if (!st.warned.has(k)) { st.warned.add(k); say(m, 'error'); } };

    // ---- the document and its sounds, kept in the project (and in Undo's saves: the documents are never changed in place)
    st.props.push(new Property(ModelProject, 'object', 'geoui_timeline', { default: undefined }));
    st.props.push(new Property(ModelProject, 'array', 'geoui_media', { default: [] }));
    const proj = () => (typeof Project !== 'undefined' && Project ? Project : null);
    const getDoc = () => { const p = proj(); return p && p.geoui_timeline && p.geoui_timeline.sequences ? p.geoui_timeline : null; };
    const setDoc = (d) => { const p = proj(); if (p) { p.geoui_timeline = d; p.saved = false; } };
    const mediaAll = () => { const p = proj(); return (p && Array.isArray(p.geoui_media) ? p.geoui_media : []); };
    const undo = { edit(label, apply) { Undo.initEdit({ geoui_timeline: true }); apply(); Undo.finishEdit(`GeoUI: ${label}`, { geoui_timeline: true }); } };
    on('create_undo_save', ({ save, aspects }) => { if (aspects && aspects.geoui_timeline && proj()) { save.geoui_timeline = proj().geoui_timeline || null; save.geoui_media = mediaAll().slice(); } });
    on('load_undo_save', ({ save }) => {
      if (!save || !('geoui_timeline' in save) || !proj()) return;
      proj().geoui_timeline = save.geoui_timeline || undefined;
      if (Array.isArray(save.geoui_media)) proj().geoui_media = save.geoui_media.slice();
      store.refresh(); player.refresh();
    });
    /** the media changed (a sound in or out): one undo step */
    function setMedia(list, label) { undo.edit(label, () => { proj().geoui_media = list; proj().saved = false; }); store.refresh(); }

    // ---- what the editors see of the design: the GeoUI elements and where they rest (model units: the middle of their box)
    function elements() {
      if (!isGeo()) return [];
      if (st.elemCache) return st.elemCache;
      st.elemCache = Group.all.filter((g) => g.geoui && g.geoui.type && g.export !== false).map((g) => {
        const b = ctx.boxOf(g);
        return { name: g.name, type: g.geoui.type, x: b ? (b.x0 + b.x1) / 2 : 0, y: b ? (b.y0 + b.y1) / 2 : G.PIVOT_Y, frames: g.geoui.frames || null };
      });
      return st.elemCache;
    }
    for (const ev of ['finished_edit', 'select_project', 'undo', 'redo', 'update_selection']) on(ev, () => { st.elemCache = null; });
    // (the design edited — a template's bones moved, resized, retextured: its copies are made again from it at the next frame)
    on('finished_edit', ({ aspects } = {}) => { if (!(aspects && aspects.geoui_timeline) && st.clones.size) { for (const [key, c] of [...st.clones]) dropClone(key, c); if (PREVIEW_ON()) Animator.preview(); } });
    const media = () => mediaAll().map((m) => ({ id: m.id, kind: m.kind, name: m.name, ext: m.ext, duration: m.duration, peaks: m.peaks, game: m.game !== false }));

    // ---- the sounds for the preview: decoded once each
    function audioContext() {
      if (st.audioCtx) return st.audioCtx;
      const AC = root.AudioContext || root.webkitAudioContext;
      st.audioCtx = AC ? new AC() : null;
      return st.audioCtx;
    }
    function buffer(id) {
      if (st.decoded.has(id)) return st.decoded.get(id);
      const m = mediaAll().find((x) => x.id === id), ac = audioContext();
      if (!m || !ac || st.decoding.has(id)) return null;
      st.decoding.add(id);
      const bytes = fromB64(m.data);
      ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).then((buf) => { st.decoded.set(id, buf); }, () => { warnOnce(`decode:${id}`, `音「${m.name}」を読めません`); }).finally(() => st.decoding.delete(id));
      return null;
    }
    // (the audio engine: a context that starts suspended — Blockbench's first play, a person's click, lets it run)
    const audioEngine = audioContext() ? T.player.createAudio({ context: audioContext(), buffer }) : null;

    // ---- the preview: the evaluated states on the bones, over Blockbench's own pose
    const PREVIEW_ON = () => isGeo() && Modes.animate && !!st.states;
    function host() {
      return {
        apply(states, t, seq) { st.states = states; st.seq = seq; if (Modes.animate && isGeo()) Animator.preview(); },
        clear() { st.states = null; st.seq = null; restore(); if (Modes.animate && isGeo()) Animator.preview(); },
        canvas: () => (Preview.selected ? Preview.selected.canvas : null),
        frameRect, screen, elements, capture, frameCanvas, drawFrame,
      };
    }
    /** into the preview (animate mode, GeoUI's layout animation chosen) the first time the person plays or seeks */
    function enterPreview() {
      if (!isGeo()) return false;
      const name = `animation.${ctx.settings().ns}_transform`, sel = typeof root.Animation !== 'undefined' && root.Animation.selected;
      if (!Modes.animate || !sel || sel.name !== name) ctx.preview();
      return true;
    }
    on('display_animation_frame', () => { if (PREVIEW_ON()) { try { overlay(); } catch (e) { warnOnce('overlay', `タイムラインのプレビューで問題: ${e.message || e}`); } } });
    on('select_mode', () => setTimeout(() => { if (!Modes.animate) { player.pause(); restore(); } }, 0));
    /** the bone (its mesh) of an element and how far below it a node is (child indices: the same in a copy) */
    let names = null;   // (the bones by name, once a frame)
    const groupOf = (name) => { if (!names) names = new Map(Group.all.map((g) => [g.name, g])); return names.get(name) || null; };
    const pathTo = (from, to) => { const out = []; for (let o = to; o && o !== from; o = o.parent) { if (!o.parent) return null; out.unshift(o.parent.children.indexOf(o)); } return out; };
    const follow = (obj, path) => { let o = obj; for (const i of path || []) { o = o && o.children[i]; } return o || null; };
    function overlay() {
      names = null;
      const states = st.states, seq = st.seq, protos = protosOf(seq), rest = new Map();
      for (const w of st.wrapped.values()) setUniforms(w, 1, [0, 0]);
      // (the prototypes: where they rest now — their copies start there — then hidden)
      for (const name of protos) {
        const g = groupOf(name);
        if (!g || !g.mesh) continue;
        rest.set(name, { p: g.mesh.position.clone(), r: g.mesh.rotation.clone(), s: g.mesh.scale.clone() });
        g.mesh.scale.set(TINY, TINY, TINY);
      }
      const seen = new Set();
      for (const [key, s] of Object.entries(states || {})) {
        const hash = key.indexOf('#'), name = hash < 0 ? key : key.slice(0, hash), g = groupOf(name);
        if (!g || !g.mesh) continue;
        if (hash < 0) { if (!protos.has(name)) applyState(g, g.mesh, s, null); continue; }
        if (s.visible === false) continue;
        seen.add(key);
        const c = cloneFor(key, g), r = rest.get(name);
        if (r) { c.position.copy(r.p); c.rotation.copy(r.r); c.scale.copy(r.s); }
        c.visible = true;
        applyState(g, c, s, c);
      }
      for (const [key, c] of st.clones) if (!seen.has(key)) dropClone(key, c);
    }
    /** an element's state on a mesh (the bone itself, or a copy): moved, turned, scaled over the pose it has; see-through, its
     *  flipbook frame, a number's digits and a gauge's fill by the meshes below it */
    function applyState(g, mesh, s, copy) {
      if (s.visible === false) { mesh.scale.set(TINY, TINY, TINY); return; }
      // (Blockbench keeps x mirrored: the export's +x is its −x — as its own animations do)
      mesh.position.x -= num(s.x); mesh.position.y += num(s.y);
      if (num(s.rotation)) mesh.rotation.z += (num(s.rotation) * Math.PI) / 180;
      const sx = num(s.scaleX, 1), sy = num(s.scaleY, 1);
      mesh.scale.x = nz(mesh.scale.x * sx); mesh.scale.y = nz(mesh.scale.y * sy);
      const el = g.geoui || {};
      if (s.fill !== undefined && el.type === 'gauge') {
        const ax = el.gauge && ['top', 'bottom'].includes(el.gauge.fill) ? 'y' : 'x', f = Math.max(0, Math.min(1, num(s.fill)));
        mesh.scale[ax] = nz(f * (ax === 'x' ? sx : sy));
      }
      if (s.value !== undefined && el.type === 'number') numerals(g, mesh, s.value, copy);
      const alpha = Math.max(0, Math.min(1, num(s.opacity, 1)));
      const uv = s.frame !== undefined && el.frames ? frameUv(g, s.frame) : [0, 0];
      if (alpha < 0.999 || uv[0] || uv[1]) for (const m of meshesBelow(g, copy)) { const w = wrapped(m); if (w) setUniforms(w, alpha, uv); else warnOnce('shader', 'この Blockbench では、プレビューで不透明度とコマを見せられません（書き出しには効きます）'); }
    }
    /** the cube meshes below an element: its own, or the same ones in a copy */
    function meshesBelow(g, copy) {
      const out = [];
      g.forEachChild((c) => { if (c instanceof Cube && c.mesh) out.push(copy ? follow(copy, pathTo(g.mesh, c.mesh)) : c.mesh); }, null, true);
      return out.filter(Boolean);
    }
    function numerals(g, mesh, value, copy) {
      const digits = [];
      g.forEachChild((d) => { if (d instanceof Group && d.geoui && d.geoui.role === 'digit') digits[d.geoui.index] = d; }, Group, true);
      const D = digits.filter(Boolean), shown = digitsOf(value, D.length, !(g.geoui.number && g.geoui.number.hideLeadingZero === false));
      D.forEach((d, k) => d.forEachChild((n) => {
        if (!(n instanceof Group) || !n.geoui || n.geoui.role !== 'numeral' || !n.mesh) return;
        const m = copy ? follow(copy, pathTo(g.mesh, n.mesh)) : n.mesh, v = n.geoui.value === shown[k] ? 1 : TINY;
        if (m) m.scale.set(v, v, v);
      }, Group, true));
    }
    /** a flipbook element's frame: the step of its cell (its first plane's uv size over its texture's) */
    function frameUv(g, fr) {
      const fb = g.geoui.frames, c = (() => { let x = null; g.forEachChild((n) => { if (!x && n instanceof Cube) x = n; }, null, true); return x; })();
      const face = c && c.faces && c.faces.north, tex = face && face.getTexture && face.getTexture();
      if (!fb || !face || !tex) return [0, 0];
      // (an explicit step — a voxel element's cell, its cubes each a part of it: osukit.js — else the first plane's own size)
      if (Array.isArray(fb.step)) return frameOffset(fr, fb.cols, fb.step[0] / (tex.uv_width || tex.width || 1), fb.step[1] / (tex.uv_height || tex.height || 1));
      return frameOffset(fr, fb.cols, Math.abs(face.uv[2] - face.uv[0]) / (tex.uv_width || tex.width || 1), Math.abs(face.uv[3] - face.uv[1]) / (tex.uv_height || tex.height || 1));
    }
    // ---- a material of the mesh's own while it plays (Blockbench's own, its shader given an alpha and a uv offset)
    function patchMaterial(m) {
      if (!m || !m.isShaderMaterial || !m.uniforms || !m.uniforms.map) return m;
      const frag = patchShader(m.fragmentShader);
      if (!frag) return null;
      const n = m.clone();
      n.fragmentShader = frag;
      n.uniforms = Object.assign({}, n.uniforms, { map: m.uniforms.map, GEOUI_ALPHA: { value: 1 }, GEOUI_UV: { value: new THREE.Vector2(0, 0) } });
      n.transparent = true; n.needsUpdate = true; n.__geouiFrom = m;
      return n;
    }
    function wrapped(mesh) {
      let w = st.wrapped.get(mesh);
      if (w && mesh.material === w.mat) return w;
      if (w) unwrap(mesh, w, false);   // (Blockbench gave it another material: wrapped anew)
      const orig = mesh.material, list = (Array.isArray(orig) ? orig : [orig]).map(patchMaterial);
      if (list.some((x) => x === null)) { for (const x of list) if (x && x.__geouiFrom) x.dispose(); return null; }
      const mat = Array.isArray(orig) ? list : list[0];
      mesh.material = mat;
      w = { mesh, orig, mat, list: list.filter((x) => x && x.__geouiFrom) };
      st.wrapped.set(mesh, w);
      return w;
    }
    function setUniforms(w, alpha, uv) { for (const m of w.list) { m.uniforms.GEOUI_ALPHA.value = alpha; m.uniforms.GEOUI_UV.value.set(uv[0], uv[1]); m.uniforms.map = m.__geouiFrom.uniforms.map; } }
    function unwrap(mesh, w, put = true) { if (put && mesh.material === w.mat) mesh.material = w.orig; for (const m of w.list) m.dispose(); st.wrapped.delete(mesh); }
    // ---- the instances' copies (the scene's only, never the project's)
    function cloneFor(key, g) {
      let c = st.clones.get(key);
      if (c && c.parent) return c;
      c = g.mesh.clone(true);
      c.name = `geoui_copy:${key}`;
      c.traverse((o) => { o.raycast = () => {}; o.userData = Object.assign({}, o.userData, { geouiCopy: true }); });
      (g.mesh.parent || Canvas.scene).add(c);
      st.clones.set(key, c);
      return c;
    }
    function dropClone(key, c) {
      c.traverse((o) => { const w = st.wrapped.get(o); if (w) unwrap(o, w); });
      if (c.parent) c.parent.remove(c);
      st.clones.delete(key);
    }
    /** everything of the preview's own away: the copies, the materials back */
    function restore() {
      for (const [key, c] of [...st.clones]) dropClone(key, c);
      for (const [mesh, w] of [...st.wrapped]) unwrap(mesh, w);
    }
    // ---- the screen in the canvas (pathedit's mapping, the video's frame)
    function frameRect() {
      const p = Preview.selected;
      if (!p || !p.canvas || !isGeo()) return null;
      const { now } = ctx.frame(), cam = p.camera;
      cam.updateMatrixWorld();
      const pts = [[now.left, now.top], [now.right, now.top], [now.right, now.bottom], [now.left, now.bottom]].map(([x, y]) => {
        const v = new THREE.Vector3(...ctx.toBB([x, y, 0])).project(cam);
        return [((v.x + 1) / 2) * p.width, ((1 - v.y) / 2) * p.height];
      });
      return rectOf(pts);
    }
    function screen() { const { now } = ctx.frame(); return { unitsH: now.top - now.bottom, center: [(now.left + now.right) / 2, (now.top + now.bottom) / 2] }; }
    /** the preview canvas's own px per CSS px (Blockbench's pixel ratio: the screen's, or its own setting) */
    const pxRatio = () => { const p = Preview.selected; return p && p.canvas && p.width ? p.canvas.width / p.width : root.devicePixelRatio || 1; };
    function frameCanvas({ scale = 1 } = {}) {
      const r = frameRect();
      if (!r) throw new Error('GeoUI の画面が正面から見えていません（GeoUI → 画面を正面から見る）');
      const dpr = pxRatio(), cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.round((r.w * dpr * num(scale, 1)) / 2) * 2); cv.height = Math.max(2, Math.round((r.h * dpr * num(scale, 1)) / 2) * 2);
      return cv;
    }
    /** the preview drawn now (no grid, gizmo or GeoUI frame) and the screen's part copied into cv (bg: a colour under it, or clear) */
    function drawFrame(cv, { background = null } = {}) {
      const p = Preview.selected, r = frameRect(), dpr = pxRatio(), c2 = cv.getContext('2d');
      if (!p || !r) return;
      ctx.setFrameVisible(false);
      try {
        Canvas.withoutGizmos(() => {
          p.render();
          c2.clearRect(0, 0, cv.width, cv.height);
          if (background) { c2.fillStyle = background; c2.fillRect(0, 0, cv.width, cv.height); }
          c2.drawImage(p.canvas, r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr, 0, 0, cv.width, cv.height);
        });
      } finally { ctx.setFrameVisible(true); }
    }
    async function capture({ scale = 1, background = null } = {}) {
      const cv = frameCanvas({ scale });
      drawFrame(cv, { background });
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
      return new Uint8Array(await blob.arrayBuffer());
    }

    // ---- the store and the player
    const H = host();
    const store = T.store.createStore({ getDoc, setDoc, undo, elements, media, onError: (e) => warnOnce(`store:${e && e.message}`, `タイムライン: ${e && e.message ? e.message : e}`) });
    const player = T.player.createPlayer({ store, host: H, audio: audioEngine, events: 'hit' });
    // (playing or moving the playhead takes the preview into animate mode with GeoUI's layout: what the person asked to see)
    store.setPlayer(Object.assign(Object.create(player), {
      play() { if (enterPreview()) player.play(); },
      toggle() { if (player.playing()) player.pause(); else if (enterPreview()) player.play(); },
      seekTo(t) { enterPreview(); player.seekTo(t); },
      step(n) { enterPreview(); player.step(n); },
    }));
    store.subscribe((what) => { if (what && (what.doc || what.external) && !player.playing()) player.refresh(); });
    on('select_project', () => setTimeout(() => { player.pause(); restore(); st.states = null; st.elemCache = null; store.refresh(); attachPaths(); }, 0));
    on('unselect_project', () => { player.pause(); restore(); st.states = null; });

    // ---- the panels (Blockbench styles every button, select and input of the page its own way — big, or invisible for a
    //  checkbox: in these panels they are the browser's own again, with each one's own inline style over that)
    const css = document.createElement('style');
    css.id = 'geoui-timeline-css';
    css.textContent = ['#panel_geoui_timeline', '#panel_geoui_inspector', '#panel_geoui_instances'].map((p) => `${p} button, ${p} select, ${p} input, ${p} textarea`).join(', ')
      + ' { all: revert; cursor: default; }\n#panel_geoui_timeline button, #panel_geoui_inspector button, #panel_geoui_instances button { cursor: pointer; }\n'
      + '#panel_geoui_timeline .panel_vue_wrapper, #panel_geoui_inspector .panel_vue_wrapper, #panel_geoui_instances .panel_vue_wrapper { height: 100%; }\n';
    document.head.append(css);
    const h = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c !== null && c !== undefined) e.append(c); return e; };
    const BTN = 'background:#33353d;color:#ddd;border:0;border-radius:3px;margin-right:4px;padding:2px 7px;cursor:pointer';
    function panel(id, name, icon, slot, make, extra = {}) {
      const p = new Panel(id, Object.assign({
        name, icon, condition: { formats: ['geoui'] }, growable: true, resizable: true,
        default_position: { slot, float_position: [100, 100], float_size: [520, 320], height: slot === 'bottom' ? 300 : 360 },
        component: { template: `<div class="${id}" style="height:100%;min-height:120px;display:flex;flex-direction:column"></div>`, mounted() { st.mounts.push(make(this.$el)); } },
      }, extra));
      st.panels.push(p);
      return p;
    }
    /** the sequence bar over the timeline: which sequence, a new one, its removal; what plays as the hits; the loop */
    function seqBar(el) {
      const sel = h('select', { class: 'geoui-tl-seq', style: 'background:#33353d;color:#ddd;border:0;max-width:220px', onchange: (e) => store.select({ seq: e.target.value }) });
      const hits = h('select', { title: 'プレビューの当たり（テンプレートの trigger・until が答える）', style: 'background:#33353d;color:#ddd;border:0;margin-left:8px', onchange: (e) => player.setEvents(e.target.value) },
        [['hit', '当たり（オート）'], ['miss', '外れ'], ['none', 'なし']].map(([v, l]) => h('option', { value: v }, l)));
      const loop = h('input', { type: 'checkbox', checked: '', title: '範囲（in / out）をくり返す', onchange: (e) => player.setLoop(e.target.checked) });
      const bar = h('div', { class: 'geoui-tl-seqbar', style: 'display:flex;align-items:center;gap:4px;padding:3px 6px;background:#141518;font:12px sans-serif;color:#ccc' }, [
        h('span', {}, 'シーケンス '), sel,
        h('button', { class: 'geoui-tl-seq-add', style: BTN, title: '新しいシーケンス', onclick: () => store.dispatch({ type: 'seq.add' }) }, '＋'),
        h('button', { class: 'geoui-tl-seq-del', style: BTN, title: 'このシーケンスを消す', onclick: () => { const s = store.selection().seq; if (s && root.confirm && root.confirm('このシーケンスを消しますか？（取り消せます）')) store.dispatch({ seq: s, type: 'seq.remove' }); } }, '🗑'),
        h('span', { style: 'margin-left:10px' }, 'プレビューの当たり'), hits,
        h('label', { style: 'margin-left:10px' }, [loop, ' ループ']),
      ]);
      const empty = h('div', { class: 'geoui-tl-empty', style: 'padding:16px;color:#aaa;font:13px sans-serif;display:none' }, [
        'まだシーケンスがありません。', h('button', { style: `${BTN};margin-left:8px`, onclick: () => store.dispatch({ type: 'seq.add', name: 'シーケンス 1' }) }, 'シーケンスを作る')]);
      const paint = () => {
        const d = store.doc(), cur = store.selection().seq;
        sel.textContent = '';
        for (const s of d.sequences) sel.append(h('option', { value: s.id }, s.name || s.id));
        sel.value = cur || '';
        empty.style.display = d.sequences.length ? 'none' : 'block';
      };
      el.append(bar, empty);
      paint();
      const off = store.subscribe((w) => { if (T.store.needsDraw(w)) paint(); });
      return { unmount() { off(); bar.remove(); empty.remove(); } };
    }
    panel('geoui_timeline', 'GeoUI タイムライン', 'movie', 'bottom', (el) => {
      const sb = seqBar(el), box = h('div', { style: 'flex:1;min-height:0' });
      el.append(box);
      const tl = T.timeline.mount(box, store, { say: (m) => say(m, 'error') });
      return { unmount() { tl.unmount(); sb.unmount(); box.remove(); } };
    });
    panel('geoui_inspector', 'GeoUI インスペクタ', 'tune', 'right_bar', (el) => T.inspector.mount(el, store));
    panel('geoui_instances', 'GeoUI 実体', 'scatter_plot', 'right_bar', (el) => T.instances.mount(el, store, { importOsu: (text) => importOsuText(text) }));
    function attachPaths() {
      if (st.pe) { st.pe.detach(); st.pe = null; }
      if (!isGeo() || !T.pathedit || !Preview.selected) return;
      st.pe = T.pathedit.attach({ canvas: H.canvas, frameRect, screen, elements }, store, { grid: 1 });
    }
    attachPaths();

    // ---- actions (GeoUI's menu)
    const A = (id, o) => { const a = new Action(id, o); st.actions.push(a); return a; };
    A('geoui_tl_play', { name: 'タイムライン: 再生・停止', icon: 'play_arrow', condition: isGeo, click: () => store.transport.toggle() });
    A('geoui_tl_track', { name: 'タイムライン: 選んだ要素のトラックを足す', icon: 'playlist_add', condition: isGeo, click: addTrackForSelected });
    A('geoui_tl_media', { name: 'タイムライン: 音・画像・連番を取り込む…', icon: 'library_music', condition: isGeo, click: importMedia });
    A('geoui_tl_osu', { name: 'タイムライン: osu! の譜面を取り込む（.osu・.osz）…', icon: 'radio_button_checked', condition: isGeo, click: importOsuFile });
    A('geoui_tl_osu_full', { name: 'osu! を丸ごと作る（ドット絵のキューブ・公式の素材・曲つき）…', icon: 'sports_esports', condition: isGeo, click: osuFullDialog });
    A('geoui_tl_video', { name: 'タイムライン: 動画を書き出す…', icon: 'movie_creation', condition: isGeo, click: videoDialog });

    function ensureSeq() {
      if (store.doc().sequences.length) return store.selection().seq;
      const r = store.dispatch({ type: 'seq.add', name: 'シーケンス 1' });
      return r.ok ? r.id : null;
    }
    function addTrackForSelected() {
      const g = ctx.elementOf(Group.first_selected || (root.Outliner && root.Outliner.selected && root.Outliner.selected[0]));
      if (!g) return say('GeoUI の要素（画像・数字・ゲージ）のボーンを選んでください', 'error');
      const seq = ensureSeq(), t = store.time();
      const r = store.dispatch({ type: 'batch', intents: [{ seq, type: 'track.add', kind: 'layer', target: g.name, name: g.name }, { seq, type: 'clip.add', track: '$0', start: t, end: t + 2 }] });
      if (!r.ok) return say(r.error, 'error');
      store.select({ clips: [r.id] });
      say(`「${g.name}」のトラックを足しました（${t.toFixed(2)} 秒から 2 秒のクリップ）`);
    }

    // ---- media: sounds (into the project and a track), an image (an element), an image sequence (a flipbook element)
    function importMedia() {
      Blockbench.import({ extensions: ['ogg', 'wav', 'mp3', 'png'], type: '音・画像', multiple: true, readtype: (name) => (/\.png$/i.test(name) ? 'image' : 'buffer') }, async (files) => {
        const sounds = files.filter((f) => !/\.png$/i.test(f.name)), images = files.filter((f) => /\.png$/i.test(f.name));
        if (sounds.length) await addSounds(sounds);
        if (images.length === 1) await ctx.addImage({ name: images[0].name.replace(/\.png$/i, ''), dataUrl: images[0].content });
        else if (images.length > 1) await addSequence(images);
      });
    }
    async function addSounds(files) {
      const list = mediaAll().slice(), added = [];
      for (const f of files) {
        const bytes = new Uint8Array(f.content), info = soundInfo(f.name, bytes);
        if (!info) { say(`「${f.name}」は音として読めません（.ogg・.wav）`, 'error'); continue; }
        let peaks = [], duration = info.seconds;
        try {
          const ac = audioContext(), buf = ac && (await ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
          if (buf) { duration = buf.duration; peaks = T.media.peaks(buf.getChannelData(0), 1000); }
        } catch (e) { if (!info.game) { say(`「${f.name}」を読めません`, 'error'); continue; } }
        const id = soundId(f.name, list.map((m) => m.id));
        list.push({ id, kind: 'sound', name: f.name, ext: info.ext, game: info.game, duration, peaks, data: toB64(bytes) });
        added.push({ id, duration, game: info.game, name: f.name });
      }
      if (!added.length) return;
      setMedia(list, '音を取り込む');
      for (const a of added) st.decoded.delete(a.id);
      // (each on an audio track of its own, at the playhead)
      const seq = ensureSeq(), t = store.time();
      for (const a of added) store.dispatch({ type: 'batch', intents: [{ seq, type: 'track.add', kind: 'audio', name: a.name }, { seq, type: 'clip.add', track: '$0', start: t, end: t + Math.max(0.1, a.duration || 1), clip: { sound: a.id, name: a.name } }] });
      const notGame = added.filter((a) => !a.game);
      say(`音 ${added.length} 個を取り込みました${notGame.length ? `（${notGame.map((a) => a.name).join('・')} はプレビューだけ: ゲームでは .ogg か .wav に）` : ''}`, notGame.length ? 'error' : undefined);
    }
    /** an image sequence (file names in their numbers' order) into one flipbook texture and an element that shows a frame each */
    async function addSequence(files) {
      const names = T.media.sortSequence(files.map((f) => f.name)), byName = new Map(files.map((f) => [f.name, f]));
      const imgs = await Promise.all(names.map((n) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error(`${n} を読めません`)); im.src = byName.get(n).content; })));
      const fw = imgs[0].naturalWidth, fh = imgs[0].naturalHeight, fb = T.media.flipbook(imgs.length, fw, fh);
      const cv = document.createElement('canvas'); cv.width = fb.w; cv.height = fb.h;
      const c2 = cv.getContext('2d');
      imgs.forEach((im, i) => c2.drawImage(im, (i % fb.cols) * fw, Math.floor(i / fb.cols) * fh, fw, fh));
      const S = ctx.settings(), hgt = S.unitsPerScreenH * 0.3, base = names[0].replace(/[_-]?\d+\.png$/i, '').replace(/\.png$/i, '') || 'sequence';
      const g = await ctx.addImage({ name: base, dataUrl: cv.toDataURL('image/png'), uv: [0, 0, fw, fh], height: hgt, width: (hgt * fw) / fh, blend: 'blend' });
      g.geoui = Object.assign({}, g.geoui, { frames: { cols: fb.cols, rows: fb.rows, count: imgs.length } });
      proj().saved = false; st.elemCache = null;
      // (a track that runs through the frames once at the sequence's fps, from the playhead)
      const seq = ensureSeq(), fps = (store.doc().sequences.find((s) => s.id === seq) || {}).fps || 20, t = store.time(), len = imgs.length / fps;
      store.dispatch({ type: 'batch', intents: [{ seq, type: 'track.add', kind: 'layer', target: g.name, name: g.name },
        { seq, type: 'clip.add', track: '$0', start: t, end: t + len, clip: { name: g.name, channels: { frame: [{ t: 0, v: 0, ease: 'linear' }, { t: len, v: imgs.length - 0.001 }] } } }] });
      say(`連番 ${imgs.length} 枚を 1 枚のテクスチャ（${fb.cols} x ${fb.rows}）にして「${g.name}」に（${len.toFixed(2)} 秒）`);
    }

    // ---- osu!: the map's instances, templates, paths, tempo into the sequence; the elements it needs drawn when missing
    function importOsuFile() {
      Blockbench.import({ extensions: ['osu', 'osz'], type: 'osu! の譜面', readtype: (name) => (/\.osz$/i.test(name) ? 'buffer' : 'text') }, async (files) => {
        const f = files[0];
        if (!f) return;
        if (!/\.osz$/i.test(f.name)) return importOsuText(f.content);
        if (typeof JSZip === 'undefined') return say('.osz を開けません（JSZip がありません）: 中の .osu を取り込んでください', 'error');
        const zip = await JSZip.loadAsync(f.content), osus = Object.keys(zip.files).filter((n) => /\.osu$/i.test(n));
        if (!osus.length) return say('.osz に .osu がありません', 'error');
        const pick = async (name) => {
          const text = await zip.file(name).async('string'), map = T.osu.parseOsu(text), audio = (map.general || {}).AudioFilename;
          const af = audio && Object.keys(zip.files).find((n) => n.toLowerCase() === String(audio).toLowerCase());
          let soundIdFor = null;
          if (af) { const bytes = await zip.file(af).async('uint8array'); await addSounds([{ name: af, content: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }]); soundIdFor = soundId(af, []); }
          await importOsuText(text, { sound: soundIdFor && mediaAll().some((m) => m.id === soundIdFor) ? soundIdFor : undefined, skipMusicTrack: !!soundIdFor });
        };
        if (osus.length === 1) return pick(osus[0]);
        new Dialog({ id: 'geoui_osz', title: 'osu!: どの難しさを取り込みますか', form: { which: { label: '譜面', type: 'select', options: Object.fromEntries(osus.map((n) => [n, n.replace(/\.osu$/i, '')])), value: osus[0] } }, onConfirm: (r) => { pick(r.which); } }).show();
      });
    }
    async function importOsuText(text, o = {}) {
      let map, out;
      try { map = T.osu.parseOsu(text); } catch (e) { return say(`osu! の譜面を読めません: ${e.message || e}`, 'error'); }
      const sounds = mediaAll().filter((m) => m.kind === 'sound'), audio = (map.general || {}).AudioFilename || '';
      const music = o.sound || (sounds.find((m) => clean(m.name.replace(/\.[^.]*$/, '')) === clean(audio.replace(/\.[^.]*$/, ''))) || (sounds.length === 1 ? sounds[0] : null) || { id: 'music' }).id;
      try { out = T.osu.toDocument(map, { width: 120, designRadius: 10, sound: music }); } catch (e) { return say(`osu! の譜面を変換できません: ${e.message || e}`, 'error'); }
      const s = out.doc.sequences[0];
      await ensureElements(out);
      let seq = store.selection().seq;
      if (!seq) { const r = store.dispatch({ type: 'seq.add', name: s.name, duration: s.duration, fps: s.fps }); seq = r.id; }
      // (the music track only when the sound is not on a track already: an .osz's music was put on one as it came in)
      const tracks = o.skipMusicTrack ? s.tracks.filter((tr) => tr.kind !== 'audio') : s.tracks;
      const cur = store.doc().sequences.find((q) => q.id === seq), dur = Math.max(cur.duration, s.duration);
      const r = store.dispatch({ type: 'batch', intents: [{ seq, type: 'seq.set', patch: { duration: dur } }, { seq, type: 'instances.import', instances: s.instances, templates: s.templates, tempo: s.tempo, paths: s.paths, markers: s.markers, tracks }] });
      if (!r.ok) return say(r.error, 'error');
      const i = out.info;
      say(`osu!「${i.title}」[${i.version}]: 円 ${i.counts.circles}・スライダー ${i.counts.sliders}・スピナー ${i.counts.spinners}${sounds.some((m) => m.id === music) ? '' : `（音楽「${audio}」は .ogg にして「音・画像・連番を取り込む」で: id ${music}）`}`);
    }
    /** the elements an osu! map moves, drawn here when the project has none of that name: circles and approach rings in the
     *  map's combo colours (a frame each), the combo number, the burst, the miss mark, the spinner, the ball, the slider bodies */
    function ensureElements(out) {
      const E = T.osu.DEFAULT_ELEMENTS, have = (n) => !!groupOf(n), cols = out.info.colours.slice(0, 8), made = [];
      const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      const draw = (w, hgt, fn) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt; fn(cv.getContext('2d')); return cv.toDataURL('image/png'); };
      const ring = (c2, x, y, r, width, colour) => { c2.beginPath(); c2.arc(x, y, r, 0, Math.PI * 2); c2.lineWidth = width; c2.strokeStyle = colour; c2.stroke(); };
      const disc = (c2, x, y, r, colour) => { c2.beginPath(); c2.arc(x, y, r, 0, Math.PI * 2); c2.fillStyle = colour; c2.fill(); };
      const at0 = { x: 0, y: 0 };
      const jobs = [];
      if (!have(E.circle)) jobs.push(async () => { const g = await ctx.addImage({ name: E.circle, ...at0, height: 20, width: 20, blend: 'blend', uv: [0, 0, 64, 64], dataUrl: draw(64 * cols.length, 64, (c2) => cols.forEach((c, k) => { disc(c2, 32 + 64 * k, 32, 29, 'rgba(30,30,40,0.9)'); disc(c2, 32 + 64 * k, 32, 22, rgb(c)); ring(c2, 32 + 64 * k, 32, 26, 5, '#ffffff'); })) }); g.geoui = Object.assign({}, g.geoui, { frames: { cols: cols.length, rows: 1 } }); made.push(E.circle); });
      if (!have(E.approach)) jobs.push(async () => { const g = await ctx.addImage({ name: E.approach, ...at0, height: 20, width: 20, blend: 'blend', uv: [0, 0, 64, 64], dataUrl: draw(64 * cols.length, 64, (c2) => cols.forEach((c, k) => ring(c2, 32 + 64 * k, 32, 28, 4, rgb(c)))) }); g.geoui = Object.assign({}, g.geoui, { frames: { cols: cols.length, rows: 1 } }); made.push(E.approach); });
      if (!have(E.number)) jobs.push(async () => { await ctx.addNumber({ name: E.number, digits: 2, height: 8, x: 0, y: 0, source: '0', hideLeadingZero: true }); made.push(E.number); });
      if (!have(E.burst)) jobs.push(async () => { await ctx.addImage({ name: E.burst, ...at0, height: 20, width: 20, blend: 'add', dataUrl: draw(64, 64, (c2) => { const gr = c2.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,220,0.9)'); gr.addColorStop(1, 'rgba(255,255,220,0)'); c2.fillStyle = gr; c2.fillRect(0, 0, 64, 64); }) }); made.push(E.burst); });
      if (!have(E.miss)) jobs.push(async () => { await ctx.addImage({ name: E.miss, ...at0, height: 12, width: 12, blend: 'blend', dataUrl: draw(64, 64, (c2) => { c2.strokeStyle = '#ff4040'; c2.lineWidth = 9; c2.lineCap = 'round'; c2.beginPath(); c2.moveTo(12, 12); c2.lineTo(52, 52); c2.moveTo(52, 12); c2.lineTo(12, 52); c2.stroke(); }) }); made.push(E.miss); });
      if (!have(E.spinner)) jobs.push(async () => { await ctx.addImage({ name: E.spinner, ...at0, height: 60, width: 60, blend: 'blend', dataUrl: draw(128, 128, (c2) => { ring(c2, 64, 64, 58, 6, '#ffffff'); c2.fillStyle = '#ffd040'; c2.fillRect(61, 8, 6, 40); }) }); made.push(E.spinner); });
      if (!have(E.ball)) jobs.push(async () => { await ctx.addImage({ name: E.ball, ...at0, height: 10, width: 10, blend: 'blend', dataUrl: draw(32, 32, (c2) => { disc(c2, 16, 16, 14, '#ffffff'); disc(c2, 16, 16, 9, '#ffc040'); }) }); made.push(E.ball); });
      if (!have(E.body) && out.bodies.length) jobs.push(async () => {
        const A2 = bodyAtlas(out.bodies), Me = T.media;
        const url = draw(A2.w, A2.h, (c2) => out.bodies.forEach((b, i) => {
          const img = Me.bodyImage(b, { pxPerUnit: A2.pxPerUnit }), [x, y] = A2.at(i);
          c2.save(); c2.translate(x + (A2.cell[0] - img.w) / 2, y + (A2.cell[1] - img.h) / 2); Me.drawOps(c2, img.ops); c2.restore();
        }));
        const g = await ctx.addImage({ name: E.body, ...at0, width: A2.units[0], height: A2.units[1], blend: 'blend', uv: [0, 0, A2.cell[0], A2.cell[1]], dataUrl: url, z: 0.5 });
        g.geoui = Object.assign({}, g.geoui, { frames: { cols: A2.cols, rows: A2.rows } });
        made.push(E.body);
        if (A2.pxPerUnit < 1) say(`スライダーの体 ${out.bodies.length} 本を 1 枚に入れるため、1 単位 ${A2.pxPerUnit.toFixed(2)} px に縮めました（粗く見えます）`, 'error');
      });
      return jobs.reduce((p, j) => p.then(j), Promise.resolve()).then(() => { st.elemCache = null; if (made.length) say(`osu! の要素を描いて足しました: ${made.join('・')}`); });
    }

    // ---- osu! made whole (osukit.js): its design built into this project (groups, cubes, one atlas), its timeline, its music and
    //      hitsounds — the lab's own song made here (osusong.js) or the person's map; the pixel look of cubes, or a skin's pictures
    function osuFullDialog() {
      new Dialog({
        id: 'geoui_osu_full', title: 'GeoUI: osu! を丸ごと作る', width: 620,
        form: {
          look: { label: '見た目', type: 'select', options: { pixel: 'ドット絵をキューブで（角度のついた 3D の盤面・チップチューン）', skin: 'osu! の公式の素材（スキン）' }, value: 'pixel' },
          map: { label: '譜面と曲', type: 'select', options: { lab: 'ラボの曲「Cubic Pulse」と譜面（ここで作る・140 BPM・72 秒）', file: '自分の譜面（.osz・.osu）' }, value: 'lab' },
          skin: { label: 'スキン（公式の素材のとき）', type: 'select', options: { legacy: 'osu! の Legacy スキン（ppy/osu-resources から取る・CC-BY-NC 4.0・営利は不可）', osk: '自分のスキン（.osk）' }, value: 'legacy' },
          _info: { type: 'info', text: 'このプロジェクトの要素とタイムラインを置き換えます（新しい GeoUI プロジェクトで）。ゲームでは /scriptevent geoui:mode auto（ひとりでに遊ぶ）・aim（見ている所がカーソル）・relax → /scriptevent geoui:play 1。' },
        },
        onConfirm: (r) => { osuFull(r).catch((e) => say(`osu! を作れません: ${e.message || e}`, 'error')); },
      }).show();
    }
    const pickFile = (extensions, type, readtype = 'buffer') => new Promise((ok) => Blockbench.import({ extensions, type, readtype }, (files) => ok((files && files[0]) || null)));
    /** PNG bytes → { width, height, data } (a canvas reads them) */
    const imageOf = (bytes) => new Promise((ok, no) => {
      const url = URL.createObjectURL(new root.Blob([bytes], { type: 'image/png' })), im = new Image();
      im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const c2 = cv.getContext('2d'); c2.drawImage(im, 0, 0); const d = c2.getImageData(0, 0, cv.width, cv.height); URL.revokeObjectURL(url); ok({ width: cv.width, height: cv.height, data: new Uint8Array(d.data.buffer.slice(0)) }); };
      im.onerror = () => { URL.revokeObjectURL(url); no(new Error('画像を読めません')); };
      im.src = url;
    });
    /** a skin's files by name → { images: { name: image (@2x sizes) }, sounds: { name: { ext, bytes } } } — get(file) → bytes or null */
    async function skinFrom(get) {
      const K = T.osukit, images = {}, sounds = {}, missing = [];
      for (const n of K.SKIN_IMAGES) {
        const b2 = await get(`${n}@2x.png`);
        if (b2) { images[n] = await imageOf(b2); continue; }
        const b1 = await get(`${n}.png`);
        if (b1) images[n] = K.as2x(await imageOf(b1)); else missing.push(n);
      }
      // (the results' and the fail's pictures where the skin has them — else osukit draws its own)
      for (const n of K.SKIN_EXTRA || []) { const b2 = await get(`${n}@2x.png`), b1 = b2 ? null : await get(`${n}.png`); if (b2) images[n] = await imageOf(b2); else if (b1) images[n] = K.as2x(await imageOf(b1)); }
      for (const n of K.SKIN_SOUNDS) for (const ext of ['ogg', 'wav']) { const b = await get(`${n}.${ext}`); if (b) { sounds[n] = { ext, bytes: new Uint8Array(b) }; break; } }
      if (missing.length) throw new Error(`スキンに足りない絵があります: ${missing.slice(0, 6).join('・')}${missing.length > 6 ? ' …' : ''}`);
      return { images, sounds };
    }
    async function osuFull(r) {
      const K = T.osukit, S = T.osusong, ns = (ctx.settings() || {}).ns || 'geoui';
      say('osu! を作っています…（曲を作り、絵を並べます。少しかかります）');
      // the map and its music
      let mapText = null, music = null;
      if (r.map === 'lab') {
        mapText = S.beatmap(r.look === 'pixel' ? 'chip' : 'synth');
        const pcm = S.render(r.look === 'pixel' ? 'chip' : 'synth'), mono = pcm.channels.length > 1 ? pcm.channels[0].map((v, i) => (v + pcm.channels[1][i]) / 2) : pcm.channels[0];
        // (the game plays .wav: mono, the chip's 22050 Hz, the synth's at 32000 to keep the pack small)
        const rate = r.look === 'pixel' ? pcm.rate : 32000, step = pcm.rate / rate, out = new Float32Array(Math.floor(mono.length / step));
        for (let i = 0; i < out.length; i++) out[i] = mono[Math.floor(i * step)];
        music = { name: 'cubic_pulse.wav', bytes: T.media.makeWav(out, rate) };
      } else {
        const f = await pickFile(['osz', 'osu'], 'osu! の譜面', 'buffer');
        if (!f) return;
        if (/\.osu$/i.test(f.name)) mapText = new TextDecoder().decode(new Uint8Array(f.content));
        else {
          if (typeof JSZip === 'undefined') throw new Error('.osz を開けません（JSZip がありません）');
          const zip = await JSZip.loadAsync(f.content), osus = Object.keys(zip.files).filter((n) => /\.osu$/i.test(n));
          if (!osus.length) throw new Error('.osz に .osu がありません');
          mapText = await zip.file(osus[0]).async('string');
          const audio = (T.osu.parseOsu(mapText).general || {}).AudioFilename, af = audio && Object.keys(zip.files).find((n) => n.toLowerCase() === String(audio).toLowerCase());
          if (af) music = { name: af, bytes: await zip.file(af).async('uint8array') };
          if (osus.length > 1) say(`.osz に譜面が ${osus.length} 個: 最初の「${osus[0].replace(/\.osu$/i, '')}」で作りました`);
        }
      }
      const map = T.osu.parseOsu(mapText);
      // the look: the pixel art (and its blips, made here), or a skin's pictures and hitsounds
      let images = null, skinSounds = {};
      if (r.look === 'skin') {
        if (r.skin === 'osk') {
          const f = await pickFile(['osk', 'zip'], 'osu! のスキン（.osk）', 'buffer');
          if (!f) return;
          const zip = await JSZip.loadAsync(f.content), byName = new Map(Object.keys(zip.files).map((n) => [n.split('/').pop().toLowerCase(), n]));
          ({ images, sounds: skinSounds } = await skinFrom(async (n) => { const k = byName.get(n.toLowerCase()); return k ? zip.file(k).async('uint8array') : null; }));
        } else {
          ({ images, sounds: skinSounds } = await skinFrom(async (n) => { try { const res = await root.fetch(K.LEGACY_SKIN + n); return res.ok ? new Uint8Array(await res.arrayBuffer()) : null; } catch (e) { return null; } }));
        }
      } else {
        const chip = S.chipHitsounds();
        for (const [n, pcm] of Object.entries(chip)) skinSounds[n] = { ext: 'wav', bytes: T.media.makeWav(pcm.channels[0], pcm.rate) };
      }
      const used = new Set(), sound = (n) => { const k = skinSounds[n] ? n : skinSounds[n.replace(/^(soft|drum)-/, 'normal-')] ? n.replace(/^(soft|drum)-/, 'normal-') : null; if (!k) return null; used.add(k); return `${ns}.${clean(k)}`; };
      const built = K.build(map, { skin: r.look, images, music: 'music', sound, ns });
      // into the project: its outliner (under the root), its atlas, its timeline and sounds — one step of Undo
      const spec = designToOutliner(built.design, ctx.toBB), A2 = built.atlas.image;
      const cv = document.createElement('canvas'); cv.width = A2.width; cv.height = A2.height;
      cv.getContext('2d').putImageData(new root.ImageData(new Uint8ClampedArray(A2.data.buffer.slice(A2.data.byteOffset, A2.data.byteOffset + A2.data.byteLength)), A2.width, A2.height), 0, 0);
      Undo.initEdit({ outliner: true, elements: [], textures: [] });
      const rootG = Group.all.find((g) => g.name === ctx.G.ROOT && !(g.parent instanceof Group));
      if (!rootG) throw new Error(`${ctx.G.ROOT} のボーンがありません（新しい GeoUI プロジェクトで）`);
      for (const c of [...rootG.children]) c.remove();
      const tex = new root.Texture({ name: `osu_${r.look}` }).fromDataURL(cv.toDataURL('image/png'));
      tex.uv_width = A2.width; tex.uv_height = A2.height; tex.add(false);
      const made = new Map([[rootG.name, rootG]]), cubes = [];
      for (const g of spec.groups) { if (g.root) continue; const ng = new Group({ name: g.name, origin: g.origin, rotation: g.rotation }); ng.addTo(made.get(g.parent) || rootG).init(); if (g.geoui) ng.geoui = g.geoui; made.set(g.name, ng); }
      for (const c of spec.cubes) {
        const faces = {};
        for (const k of ['north', 'south', 'east', 'west', 'up', 'down']) faces[k] = c.faces[k] ? { uv: c.faces[k].uv, texture: tex.uuid } : { uv: [0, 0, 0, 0], texture: null };
        const nc = new Cube({ name: c.name, from: c.from, to: c.to, origin: c.origin, box_uv: false, faces });
        nc.addTo(made.get(c.parent) || rootG).init(); cubes.push(nc);
      }
      Undo.finishEdit('GeoUI: osu! を作る', { outliner: true, elements: cubes, textures: [tex] });
      const media2 = [];
      if (music) { const info = soundInfo(music.name, music.bytes); media2.push({ id: 'music', kind: 'sound', name: music.name, ext: (info && info.ext) || 'ogg', game: Boolean(info && info.game), duration: info ? info.seconds : built.info.duration, peaks: [], data: toB64(music.bytes) }); }
      for (const k of used) media2.push({ id: clean(k), kind: 'sound', name: `${k}.${skinSounds[k].ext}`, ext: skinSounds[k].ext, game: true, duration: 1, peaks: [], data: toB64(skinSounds[k].bytes) });
      setMedia(media2, 'osu! の曲と音');
      undo.edit('osu! のタイムライン', () => setDoc(built.doc));
      store.refresh(); store.select({ seq: built.doc.sequences[0].id });
      st.elemCache = null; Canvas.updateAll();
      const i = built.info;
      say(`osu!「${i.title}」[${i.version}]（${r.look === 'pixel' ? 'ドット絵のキューブ' : 'スキン'}）を作りました: 円 ${i.counts.circles}・スライダー ${i.counts.sliders}・スピナー ${i.counts.spinners}・ボーン ${built.design.bones.length}・キューブ ${cubes.length}・アトラス ${A2.width}x${A2.height}${music && !(soundInfo(music.name, music.bytes) || {}).game ? `（曲「${music.name}」はプレビューだけ: ゲームでは .ogg か .wav に）` : ''}`);
    }

    // ---- a video of the timeline
    function videoDialog() {
      const seqId = store.selection().seq, seq = store.doc().sequences.find((s) => s.id === seqId);
      if (!seq) return say('シーケンスがありません', 'error');
      const [a, b] = player.range();
      new Dialog({
        id: 'geoui_tl_video', title: 'GeoUI: タイムラインを動画に', width: 520,
        form: {
          format: { label: '形式', type: 'select', options: { webm: 'WebM（動画と音）', 'png-zip': 'PNG の連番（zip・背景は透明）' }, value: 'webm' },
          fps: { label: 'コマ数 / 秒', type: 'number', value: 30, min: 1, max: 120 },
          from: { label: '始め（秒）', type: 'number', value: a, min: 0, step: 0.05 },
          to: { label: '終わり（秒）', type: 'number', value: b, min: 0, step: 0.05 },
          scale: { label: '大きさ（画面の何倍）', type: 'select', options: { 1: '1 倍', 2: '2 倍', 0.5: '0.5 倍' }, value: '1' },
          background: { label: '背景（WebM）', type: 'select', options: { '#000000': '黒', '#00ff00': '緑（クロマキー）', '#ffffff': '白', transparent: '透明（VP9 のアルファ: 対応する編集ソフトで）' }, value: '#000000' },
          _info: { type: 'info', text: 'WebM は実時間で作ります（長さの分だけかかる）。プレビューは GeoUI → 画面を正面から見る の向きで写します。' },
        },
        onConfirm: (r) => { exportVideo({ format: r.format, fps: r.fps, from: r.from, to: r.to, scale: +r.scale, background: r.background === 'transparent' ? null : r.background }); },
      }).show();
    }
    async function exportVideo(o) {
      if (st.exporting) return say('いま書き出しています', 'error');
      if (!enterPreview()) return;
      ctx.view();
      st.exporting = true;
      const ac = { aborted: false }, seqName = clean((store.doc().sequences.find((s) => s.id === store.selection().seq) || {}).name || 'timeline');
      Blockbench.setProgress && Blockbench.setProgress(0.001);
      try {
        const out = await player.exportVideo({ format: o.format, fps: o.fps, from: o.from, to: o.to, scale: o.scale, signal: ac, onProgress: (d, n) => Blockbench.setProgress && Blockbench.setProgress(d / n), background: o.background });
        const blob = out.data instanceof root.Blob ? out.data : new root.Blob([out.data], { type: out.mime });
        Blockbench.export({ resource_id: 'geoui_video', type: o.format === 'webm' ? 'WebM 動画' : 'PNG の連番（zip）', extensions: [o.format === 'webm' ? 'webm' : 'zip'], name: `${seqName}.${o.format === 'webm' ? 'webm' : 'zip'}`, content: blob, savetype: 'zip' },
          () => say(`動画を書き出しました（${out.frames} コマ）`));
      } catch (e) { say(`書き出せません: ${e.message || e}`, 'error'); } finally { st.exporting = false; Blockbench.setProgress && Blockbench.setProgress(0); }
    }
    // (webm's frames over a background colour: the player hands drawFrame its options)
    const drawFrame0 = drawFrame;
    H.drawFrame = (cv, o) => drawFrame0(cv, o);

    // ---- the export: the timeline's RP and BP added to GeoUI Builder's pack
    function extend(built, design) {
      const doc = getDoc();
      if (!doc || !doc.sequences.length) return built;
      const S = built.settings, warnings = [];
      const sounds = mediaAll().filter((m) => m.kind === 'sound').flatMap((m) => {
        if (m.game === false || !['ogg', 'wav'].includes(m.ext)) { warnings.push(`音「${m.name}」は .${m.ext}: ゲームでは鳴りません（.ogg か .wav にして取り込み直す）`); return []; }
        return [{ id: m.id, ext: m.ext, data: fromB64(m.data) }];
      });
      // (a game's hitsounds — osu!'s: the script plays them, no audio clip names them — defined in the pack too)
      const extraSounds = [...new Set(doc.sequences.flatMap((q) => (q.game ? [...q.game.objects.flatMap((o) => [...(o.hs || []), ...((o.es || []).flat())]), ...Object.values(q.game.sounds || {})] : [])).filter(Boolean).map((id) => String(id).replace(/^[^.]*\./, '')))];
      const rp = T.compile.extendPack(built.files, doc, { design, core: G, sounds, extraSounds });
      let files = rp.files;
      warnings.push(...rp.warnings);
      if (S.bp) { const bp = T.runtime.extendBehavior(files, doc, { stats: rp.stats, ns: S.ns }); files = bp.files; warnings.push(...bp.warnings); }
      else warnings.push('ビヘイビアパックを作らない設定です: ゲームの中で再生する命令（scriptevent）は書き出しません');
      // (「確かめる」: what the timeline takes of the game's limits — the player's properties with GeoUI's own, the Molang,
      //  the bones, the element's own render controllers, the animations)
      const st2 = rp.stats, b2 = st2.budget || {}, c2 = st2.counts || {};
      if (Array.isArray(built.report)) built.report.push(`タイムライン: プロパティ ${b2.total ?? '?'} 個（GeoUI の ${b2.base ?? 0} 個込み・上限 ${b2.propertyLimit ?? 32}）・Molang ${st2.lines ?? 0} 行・${Math.round((st2.chars ?? 0) / 1000)} k 文字・変数 ${st2.variables ?? 0} 個（プレイヤーの分も込みで ${st2.entityVariables ?? st2.variables ?? 0} 個）（最長 ${st2.longest ?? 0} 文字・括弧 ${st2.deepest ?? 0} 段）・ボーン ${c2.bones ?? 0} 本・要素の render controller ${c2.renderControllers ?? 0} 個・アニメーション ${c2.animations ?? 0} 個`);
      return Object.assign(built, { files, warnings: [...built.warnings, ...warnings], timeline: rp.stats });
    }

    function uninstall() {
      player.dispose(); restore();
      css.remove();
      if (st.pe) { st.pe.detach(); st.pe = null; }
      for (const m of st.mounts) { try { m.unmount(); } catch (e) { /* (gone) */ } }
      for (const p of st.panels) p.delete();
      for (const a of st.actions) a.delete();
      for (const [ev, f] of st.listeners) Blockbench.removeListener(ev, f);
      for (const p of st.props) p.delete();
      if (st.audioCtx && st.audioCtx.close) st.audioCtx.close();
      store.dispose();
    }
    return { uninstall, extend, store, player, host: H, actions: ['geoui_tl_play', 'geoui_tl_track', 'geoui_tl_media', 'geoui_tl_osu', 'geoui_tl_osu_full', 'geoui_tl_video'], state: st, importOsuText, addSounds, exportVideo, frameRect, osuFull,
      audio: audioEngine, audioCount: () => (audioEngine ? audioEngine.count() : 0) };
  }

  T.bridge = { designToOutliner, install, digitsOf, patchShader, rectOf, frameOffset, protosOf, soundId, bodyAtlas, toB64, fromB64, soundInfo };
  if (typeof module === 'object' && module && module.exports) module.exports = T.bridge;
})(typeof globalThis !== 'undefined' ? globalThis : this);
})(undefined);

// ---- geoui_builder.js
/*!
 * GeoUI Builder — Blockbench plugin (bds-lab: bds/geoui/README.md)
 *
 * GeoUI = 2D UI that Minecraft Bedrock draws as flat planes on minecraft:player, shown by a live_player_renderer that a
 * resource pack adds to the HUD (q.is_in_ui). This plugin builds it in Blockbench: a screen frame in the viewport, UI
 * elements as bones of flat cubes, and an export to a resource pack (+ behaviour pack) that works like what
 * GeoUI Studio v10.1 (Au12jp/geouistudio 7fe110f, Apache-2.0) exports.
 *
 * Studio's layout formulas are reproduced here (GeoUICore: anchors, the aspect term, scale and offset, the centre fix,
 * the HUD panel), and every hand-made value of Studio (the screen height 176 units, the centre fixes, the panel at
 * 10% / 110%) is a setting, not a constant, so a measured value can replace it. Where Studio's output is wrong, the
 * export differs on purpose and says why (README: 「Studio との違い」).
 *
 * The same file is a Node module (module.exports = GeoUICore) for bds-lab's tests: tests/geoui-builder-offline.mjs.
 */
/* global BBPlugin, Blockbench, Project, ModelProject, ModelFormat, Property, Group, Cube, Texture, Formats, Format,
   Canvas, Preview, Animation, Animator, Modes, Outliner, Undo, Dialog, Action, BarMenu, MenuBar, newProject, THREE,
   scene, JSZip, Interface, document, window, Image */
'use strict';

var GeoUICore = (function () {
  const VERSION = '0.1.0';
  const num = (v, d = 0) => (v !== null && v !== '' && v !== undefined && Number.isFinite(+v) ? +v : d);
  /** Studio's rounding (r3): 3 decimals, the way every number in its Molang is written */
  const r3 = (v) => Math.round(num(v) * 1000) / 1000;
  const r4 = (v) => Math.round(num(v) * 10000) / 10000;
  const clean = (s, fb) => String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || fb;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const J = (o) => JSON.stringify(o, null, 2);
  /** the height (model units) GeoUI is drawn at: the doll itself stays below the screen */
  const PIVOT_Y = 140;

  /** What GeoUI Studio v10.1 was built with — values made by hand or reported by players, kept as the defaults */
  const STUDIO = Object.freeze({
    ref: 'GeoUI Studio v10.1 (Au12jp/geouistudio 7fe110f, 2026-08-01)',
    // 「画面の高さ＝モデル何単位か」: 「実機で 20.25 倍にしたらちょうど良かった」という報告から 176
    unitsPerScreenH: 176,
    // json-ui 単位 ÷ モデル単位: 画面の高さを 240 json-ui 単位と仮定した 240 / 176
    uiPxPerUnit: 240 / 176,
    // 中心のずれ（画面の高さに対する割合）: PC x -0.1 / y -4.9、iOS x -0.3 / y -9.25（176 単位で一度だけ実測）
    centerFix: { desktop: { x: -0.00057, y: -0.02784 }, mobile: { x: -0.00170, y: -0.05256 }, console: { x: -0.00057, y: -0.02784 } },
    // 画面比はスクリプトが端末の種類から推測する（1000 倍の整数）
    platformAspect: { Desktop: 1778, Mobile: 2000, Console: 1778 },
    // HUD に足す live_player_renderer の枠（上の値はこの枠でだけ成り立つ）
    panel: { size: [10, 10], offset: [0, 110] },
    layerZ: -0.2,
  });

  /** What bds-lab measured on the real app (bds/geoui/report.mjs over the app runs of bds/addons/geoui_calib*: an Android
   *  emulator 1560x720, Minecraft 1.26.52.3, 2026-10-21; five screens of three frames — 10 x 10, 20 x 20, 2 x 10 % — agree to
   *  0.08 % and 0.7 px, the same frame in two runs to 0.003 %). The HUD's live_player_renderer draws one model unit as
   *  k x the frame's smaller side (px) and pins the model's origin d units below the frame's middle (centred across):
   *  Studio's frame (10 % x 10 % at 110 %) on any screen wider than tall is 170.68 units high, centred at y = 135.04
   *  (Studio: 176 and 140, then a fix measured once on a PC — −4.9 units, close to this — and once on an iPhone: −9.25) */
  const MEASURED = Object.freeze({ id: 'bds-lab-2026-10', k: 0.058589, d: 24.10, ref: 'bds-lab app runs (geoui_calib*), Android 1560x720, Minecraft 1.26.52.3, 2026-10-21' });
  const CALIBRATIONS = { [MEASURED.id]: '実機で測った値（bds-lab: HUD の枠から計算）', 'studio-v10.1': 'GeoUI Studio v10.1 と同じ値', manual: '自分で入れた値' };
  /** the screen a HUD frame shows, by the measured model (pure): its height in model units and its centre's y, at an aspect
   *  (a frame narrower than tall on the screen — w % x aspect < h % — is scaled by its width, so then the aspect matters) */
  function frameScreen(panel, aspect, M = MEASURED) {
    const w = (num(panel && panel.size && panel.size[0], 10) / 100) * qa(aspect), h = num(panel && panel.size && panel.size[1], 10) / 100;
    const H = 1 / (M.k * Math.min(w, h)), top = num(panel && panel.offset && panel.offset[1], 110) / 100;
    return { H, cy: H * (top + h / 2 - 0.5) + M.d, cx: 0 };
  }

  const DEVICES = [
    { id: 'pc', label: 'PC 16:9', aspect: 16 / 9 }, { id: 'pc16', label: 'PC 16:10', aspect: 1.6 },
    { id: 'uw', label: 'ウルトラワイド 21:9', aspect: 2.3333 }, { id: 'iphone', label: 'iPhone 19.5:9', aspect: 2.1667 },
    { id: 'android', label: 'Android 20:9', aspect: 2.2222 }, { id: 'and18', label: 'Android 18:9', aspect: 2.0 },
    { id: 'ipad', label: 'iPad 4:3', aspect: 4 / 3 }, { id: 'switch', label: 'Switch 16:9', aspect: 16 / 9 },
  ];
  const ANCHORS = ['top_left', 'top_middle', 'top_right', 'left_middle', 'center', 'right_middle', 'bottom_left', 'bottom_middle', 'bottom_right'];
  const BLENDS = ['cutout', 'blend', 'add'];
  const FILLS = ['left', 'right', 'bottom', 'top', 'center'];

  function defaults() {
    return {
      ns: 'geoui', name: 'GeoUI Pack', description: 'GeoUI Builder (Blockbench) で作成', version: [1, 0, 0], minEngine: [1, 26, 50],
      unitsPerScreenH: STUDIO.unitsPerScreenH,
      refAspect: 1.778, previewAspect: 1.778, previewPlatform: 'desktop',
      centerFix: clone(STUDIO.centerFix), centerAuto: true,
      platformAspect: clone(STUDIO.platformAspect),
      panel: clone(STUDIO.panel),
      hud: 'insert', followHud: true, hideInPaperdoll: true,
      filter: 'Point', bp: true,
      calibration: 'studio-v10.1',
      // the packs' UUIDs, made once per project and kept in the .bbmodel (a new UUID would be a new pack in every world)
      uuids: null,
      // each export after the first goes one patch version up (Minecraft keeps a pack by UUID and version)
      autoBump: true, exported: 0,
    };
  }
  /** an aspect the way the game sees it: a property is an integer x1000 (16:9 → 1.778) */
  const qa = (a, d = 1.778) => Math.round(Math.min(5, Math.max(0.6, num(a, d))) * 1000) / 1000;
  /** settings filled from defaults and checked (never throws: a bad value falls back to the default) */
  function settingsOf(s0) {
    const D = defaults(), s = Object.assign({}, D, s0 || {});
    s.ns = clean(s.ns, 'geoui').slice(0, 24);
    s.unitsPerScreenH = num(s.unitsPerScreenH, D.unitsPerScreenH) > 0 ? num(s.unitsPerScreenH) : D.unitsPerScreenH;
    s.refAspect = qa(s.refAspect); s.previewAspect = qa(s.previewAspect);
    s.centerFix = Object.assign(clone(D.centerFix), s.centerFix || {});
    for (const k of ['desktop', 'mobile', 'console']) s.centerFix[k] = { x: num(s.centerFix[k] && s.centerFix[k].x, 0), y: num(s.centerFix[k] && s.centerFix[k].y, 0) };
    s.platformAspect = Object.assign(clone(D.platformAspect), s.platformAspect || {});
    s.panel = { size: [num(s.panel && s.panel.size && s.panel.size[0], 10), num(s.panel && s.panel.size && s.panel.size[1], 10)],
      offset: [num(s.panel && s.panel.offset && s.panel.offset[0], 0), num(s.panel && s.panel.offset && s.panel.offset[1], 110)] };
    if (!['insert', 'studio'].includes(s.hud)) s.hud = 'insert';
    if (!['desktop', 'mobile', 'console'].includes(s.previewPlatform)) s.previewPlatform = 'desktop';
    s.version = Array.isArray(s.version) && s.version.length === 3 ? s.version.map((v) => Math.max(0, Math.round(num(v)))) : D.version;
    s.minEngine = Array.isArray(s.minEngine) && s.minEngine.length === 3 ? s.minEngine.map((v) => Math.max(0, Math.round(num(v)))) : D.minEngine;
    const UU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    s.uuids = s.uuids && typeof s.uuids === 'object' && ['rp', 'rpMod', 'bp', 'bpData', 'bpScript'].every((k) => UU.test(String(s.uuids[k]))) ? Object.assign({}, s.uuids) : null;
    s.autoBump = s.autoBump !== false; s.exported = Math.max(0, Math.round(num(s.exported)));
    // (the measured calibration: the screen's height and centre follow the HUD frame — whatever is typed in for them)
    if (!CALIBRATIONS[s.calibration]) s.calibration = 'manual';
    // (Studio's: its two numbers, whatever was left in the fields — a project from before calibrations, with numbers of its
    //  own typed in, is 'manual': they stay)
    if (s.calibration === 'studio-v10.1') {
      const fixOf = (c) => ['desktop', 'mobile', 'console'].map((k) => `${num(c[k] && c[k].x)},${num(c[k] && c[k].y)}`).join(';');
      const own = !(s0 && s0.calibration) && (s.unitsPerScreenH !== STUDIO.unitsPerScreenH || fixOf(s.centerFix) !== fixOf(STUDIO.centerFix));
      if (own) s.calibration = 'manual';
      else { s.unitsPerScreenH = STUDIO.unitsPerScreenH; s.centerFix = clone(STUDIO.centerFix); }
    }
    if (s.calibration === MEASURED.id) {
      const f = frameScreen(s.panel, s.refAspect), fix = { x: r4(f.cx / f.H), y: Math.round(((f.cy - PIVOT_Y) / f.H) * 1e5) / 1e5 };
      s.unitsPerScreenH = r4(f.H); s.centerFix = { desktop: Object.assign({}, fix), mobile: Object.assign({}, fix), console: Object.assign({}, fix) };
    }
    return s;
  }
  /** a new project's settings: the measured calibration (defaults() stays Studio's: what an older project and the tests read) */
  const newProjectSettings = () => Object.assign(defaults(), { calibration: MEASURED.id });

  // ---------------------------------------------------------------------------------------------------------------
  // The screen in model units (Bedrock geometry coordinates: x to the right of the screen, y up)
  // ---------------------------------------------------------------------------------------------------------------
  /** Studio: v.geoui_halfw = r3(H/2) * v.geoui_aspect */
  const halfWAt = (S, aspect) => r3(S.unitsPerScreenH / 2) * qa(aspect);
  /** the centre fix as the game applies it: with the script, an integer property x10000 (Studio: round(fix*10000)) */
  function centerOf(S, platform, withScript) {
    const f = S.centerFix[platform || 'desktop'] || { x: 0, y: 0 }, H = S.unitsPerScreenH;
    return withScript ? { x: Math.round(f.x * 10000) / 10000 * H, y: Math.round(f.y * 10000) / 10000 * H } : { x: r3(f.x * H), y: r3(f.y * H) };
  }
  /** where the visible screen is, in model units, for one aspect and platform (the content is moved by the centre fix) */
  function screenAt(S, aspect, platform, withScript = true) {
    const c = centerOf(S, platform, withScript), hw = halfWAt(S, aspect), hh = S.unitsPerScreenH / 2;
    return { aspect: qa(aspect), cx: c.x, cy: PIVOT_Y + c.y, halfW: hw, halfH: hh, left: c.x - hw, right: c.x + hw, top: PIVOT_Y + c.y + hh, bottom: PIVOT_Y + c.y - hh };
  }
  const hAnchor = (a) => { a = String(a || 'center'); return a.includes('left') ? 'left' : a.includes('right') ? 'right' : 'center'; };
  const vAnchor = (a) => { a = String(a || 'center'); return a.includes('top') ? 'top' : a.includes('bottom') ? 'bottom' : 'middle'; };
  /** the pads of a box (model units, at the reference aspect) from the edges it is anchored to — Studio's padX / padY */
  function padsOf(S, box, anchor) {
    const hw = halfWAt(S, S.refAspect), hh = S.unitsPerScreenH / 2, h = hAnchor(anchor), v = vAnchor(anchor);
    return {
      x: h === 'left' ? box.x0 + hw : h === 'right' ? hw - box.x1 : (box.x0 + box.x1) / 2,
      y: v === 'top' ? PIVOT_Y + hh - box.y1 : v === 'bottom' ? box.y0 - (PIVOT_Y - hh) : (box.y0 + box.y1) / 2 - PIVOT_Y,
    };
  }
  /** Studio's anchorJS: where the centre of a w x h box goes for an anchor and pads (model units, relative to (0, 140)) */
  function studioAnchor(S, w, h, anchor, padX, padY, aspect) {
    const H = S.unitsPerScreenH, halfw = H * qa(aspect) / 2, a = String(anchor || 'center');
    let x = 0, y = 0;
    if (a.includes('left')) x = -(halfw - (w / 2 + padX));
    if (a.includes('right')) x = halfw - (w / 2 + padX);
    if (a.includes('top')) y = H / 2 - h / 2 - padY;
    if (a.includes('bottom')) y = -(H / 2 - h / 2 - padY);
    return { x, y };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Molang: the subset GeoUI writes, to check an expression and to evaluate a layout without the game
  // ---------------------------------------------------------------------------------------------------------------
  const ALIAS = { v: 'variable', q: 'query', t: 'temp', c: 'context' };
  function tokens(src) {
    const s = String(src), t = [];
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        if (/[eE]/.test(s[j] || '') && /[-+0-9]/.test(s[j + 1] || '')) { j += 2; while (j < s.length && /[0-9]/.test(s[j])) j++; }
        if (/[fF]/.test(s[j] || '')) j++;
        t.push({ k: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i; while (j < s.length && /[A-Za-z0-9_.]/.test(s[j])) j++;
        let id = s.slice(i, j).toLowerCase(); const dot = id.indexOf('.');
        if (dot > 0 && ALIAS[id.slice(0, dot)]) id = ALIAS[id.slice(0, dot)] + id.slice(dot);
        t.push({ k: 'id', v: id }); i = j; continue;
      }
      if (c === "'" || c === '"') { const j = s.indexOf(c, i + 1); if (j < 0) throw new Error('閉じていない文字列'); t.push({ k: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      const two = s.slice(i, i + 2);
      if (['&&', '||', '==', '!=', '<=', '>=', '??'].includes(two)) { t.push({ k: 'op', v: two }); i += 2; continue; }
      if ('+-*/<>!?:(),;=[]{}'.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
      throw new Error(`読めない文字 '${c}'（${i} 文字目）`);
    }
    return t;
  }
  /** an expression or statements → a tree (throws with a reason on a syntax error) */
  function parse(src) {
    const t = tokens(src); let p = 0;
    const peek = (v) => t[p] && t[p].k === 'op' && t[p].v === v;
    const eat = (v) => { if (!peek(v)) throw new Error(`'${v}' がありません（${p} 番目の語）`); p++; };
    function primary() {
      const x = t[p++];
      if (!x) throw new Error('式が途中で終わっています');
      if (x.k === 'num') return { n: 'num', v: x.v };
      if (x.k === 'str') return { n: 'str', v: x.v };
      if (x.k === 'op' && x.v === '(') { const e = expr(); eat(')'); return e; }
      if (x.k === 'id') {
        if (peek('(')) { p++; const args = []; if (!peek(')')) { do { args.push(expr()); } while (peek(',') && ++p); } eat(')'); return { n: 'call', id: x.v, args }; }
        return { n: 'id', id: x.v };
      }
      throw new Error(`'${x.v}' はここに置けません`);
    }
    function unary() {
      if (peek('-')) { p++; return { n: 'neg', a: unary() }; }
      if (peek('+')) { p++; return unary(); }
      if (peek('!')) { p++; return { n: 'not', a: unary() }; }
      return primary();
    }
    const bin = (next, ops) => () => { let a = next(); while (t[p] && t[p].k === 'op' && ops.includes(t[p].v)) { const op = t[p++].v; a = { n: 'bin', op, a, b: next() }; } return a; };
    const mul = bin(unary, ['*', '/']), add = bin(mul, ['+', '-']), rel = bin(add, ['<', '>', '<=', '>=']), eq = bin(rel, ['==', '!=']),
      and = bin(eq, ['&&']), or = bin(and, ['||']), nul = bin(or, ['??']);
    function expr() {
      const c = nul();
      if (peek('?')) { p++; const a = expr(); if (peek(':')) { p++; return { n: 'if', c, a, b: expr() }; } return { n: 'if', c, a, b: { n: 'num', v: 0 } }; }
      return c;
    }
    function statement() {
      if (t[p] && t[p].k === 'id' && t[p + 1] && t[p + 1].k === 'op' && t[p + 1].v === '=') { const id = t[p].v; p += 2; return { n: 'set', id, e: expr() }; }
      if (t[p] && t[p].k === 'id' && t[p].v === 'return') { p++; return { n: 'ret', e: expr() }; }
      return expr();
    }
    const list = [];
    while (p < t.length) { list.push(statement()); if (peek(';')) p++; else if (p < t.length) throw new Error(`'${t[p].v}' の前に ; がありません`); }
    if (!list.length) throw new Error('式が空です');
    return list.length === 1 ? list[0] : { n: 'seq', list };
  }
  const D2R = Math.PI / 180;
  const MATH = {
    'math.abs': Math.abs, 'math.ceil': Math.ceil, 'math.floor': Math.floor, 'math.sqrt': Math.sqrt, 'math.exp': Math.exp, 'math.ln': Math.log,
    'math.trunc': Math.trunc, 'math.round': (x) => Math.sign(x) * Math.round(Math.abs(x)), 'math.sin': (x) => Math.sin(x * D2R), 'math.cos': (x) => Math.cos(x * D2R),
    'math.atan': (x) => Math.atan(x) / D2R, 'math.atan2': (y, x) => Math.atan2(y, x) / D2R, 'math.pow': Math.pow, 'math.min': Math.min, 'math.max': Math.max,
    'math.mod': (a, b) => (b === 0 ? 0 : a % b), 'math.clamp': (x, a, b) => Math.min(Math.max(x, a), b), 'math.lerp': (a, b, u) => a + (b - a) * u,
    'math.random': (a, b) => (a + b) / 2, 'math.random_integer': (a, b) => Math.round((a + b) / 2), 'math.hermite_blend': (x) => 3 * x * x - 2 * x * x * x,
    'math.sign': Math.sign,
  };
  /** evaluate a tree; env: { vars: {name: number}, query(name, args) → number|undefined } (unknown names are 0, as in the game) */
  function evaluate(tree, env) {
    const vars = env.vars || (env.vars = {});
    const ev = (x) => {
      switch (x.n) {
        case 'num': return x.v;
        case 'str': return x.v;
        case 'neg': return -ev(x.a);
        case 'not': return ev(x.a) ? 0 : 1;
        case 'if': return ev(x.c) ? ev(x.a) : ev(x.b);
        case 'set': { const v = ev(x.e); vars[x.id] = v; return v; }
        case 'ret': return ev(x.e);
        case 'seq': { let v = 0; for (const s of x.list) { v = ev(s); if (s.n === 'ret') return v; } return v; }
        case 'id': {
          if (x.id === 'math.pi') return Math.PI;
          if (x.id in vars) return vars[x.id];
          if (x.id.startsWith('query.') && env.query) { const q = env.query(x.id, []); if (q !== undefined) return q; }
          (env.unknown || (env.unknown = new Set())).add(x.id); return 0;
        }
        case 'call': {
          const args = x.args.map(ev);
          if (MATH[x.id]) return MATH[x.id](...args);
          if (env.query) { const q = env.query(x.id, args); if (q !== undefined) return q; }
          (env.unknown || (env.unknown = new Set())).add(`${x.id}(${args.map((a) => (typeof a === 'string' ? `'${a}'` : a)).join(',')})`); return 0;
        }
        case 'bin': {
          if (x.op === '&&') return ev(x.a) && ev(x.b) ? 1 : 0;
          if (x.op === '||') return ev(x.a) || ev(x.b) ? 1 : 0;
          // (a variable never set — the game's "not valid" — gives the right side; reading one without ?? is what env.unknown lists)
          if (x.op === '??') { if (x.a.n === 'id' && x.a.id.startsWith('variable.') && !(x.a.id in vars)) return ev(x.b); const a = ev(x.a); return a === undefined || a === null ? ev(x.b) : a; }
          const a = ev(x.a), b = ev(x.b);
          switch (x.op) {
            case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? 0 : a / b;
            case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
            case '==': return a === b ? 1 : 0; case '!=': return a !== b ? 1 : 0;
          }
        }
      }
      throw new Error(`評価できない式（${x.n}）`);
    };
    return ev(tree);
  }
  const PARSED = new Map();
  /** a number, or an expression evaluated in env */
  function molang(v, env) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const s = String(v).trim();
    if (s === '') return 0;
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
    let tr = PARSED.get(s); if (!tr) { tr = parse(s); PARSED.set(s, tr); }
    return evaluate(tr, env);
  }
  /** null, or why an expression cannot be read */
  function molangError(src) { try { parse(src); return null; } catch (e) { return String(e.message || e); } }
  /** the env a GeoUI pack sees: properties by name, plus the queries Studio and this exporter read */
  function envOf({ props = {}, vars = {}, isInUi = 1, isPaperdoll = 0, lifeTime = 0 } = {}) {
    return {
      vars: Object.assign({ 'variable.is_paperdoll': isPaperdoll }, vars),
      query(name, args) {
        if (name === 'query.property') return num(props[args[0]], 0);
        if (name === 'query.is_in_ui') return isInUi;
        if (name === 'query.life_time') return lifeTime;
        return undefined;
      },
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Bedrock pose: geometry + one animation → where every cube's north face is (model units). The game's order:
  // a bone moves its cubes by T(pivot + position) R S T(-pivot), inside its parent's transform.
  // ---------------------------------------------------------------------------------------------------------------
  const mat = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    mul(a, b) {   // 3x4 affine (row-major), a after b
      const r = new Array(12);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
        r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
      }
      return r;
    },
    t: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z],
    s: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0],
    apply: (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]],
  };
  const vec3 = (v, env, d) => {
    if (v === undefined || v === null) return [d, d, d];
    if (!Array.isArray(v)) { const x = molang(v, env); return [x, x, x]; }
    return [0, 1, 2].map((i) => molang(v[i] === undefined ? d : v[i], env));
  };
  /**
   * geometries: [{ bones: [{name, parent, pivot, rotation, cubes:[{origin,size}]}] }] (Bedrock JSON), animation: {bones:{name:{position,rotation,scale}}}
   * → [{ geometry, bone, cube, quad: {x0,y0,x1,y1,z}, hidden }]. Rotations are not evaluated (GeoUI layouts have none): a bone
   * that has one is reported in `rotated`.
   */
  function pose(geometries, animation, env) {
    const out = [], rotated = new Set(), anim = (animation && animation.bones) || {};
    geometries.forEach((g, gi) => {
      const bones = g.bones || [], byName = {}, world = {};
      for (const b of bones) byName[b.name] = b;
      const worldOf = (b) => {
        if (world[b.name]) return world[b.name];
        const a = anim[b.name] || {}, piv = b.pivot || [0, 0, 0];
        const pos = vec3(a.position, env, 0), sc = vec3(a.scale, env, 1), rot = vec3(a.rotation, env, 0);
        if ((b.rotation && b.rotation.some((v) => num(v))) || rot.some((v) => v)) rotated.add(b.name);
        let m = mat.mul(mat.t(piv[0] + pos[0], piv[1] + pos[1], piv[2] + pos[2]), mat.mul(mat.s(sc[0], sc[1], sc[2]), mat.t(-piv[0], -piv[1], -piv[2])));
        if (b.parent && byName[b.parent]) m = mat.mul(worldOf(byName[b.parent]), m);
        return (world[b.name] = m);
      };
      for (const b of bones) {
        const m = worldOf(b);
        (b.cubes || []).forEach((c, ci) => {
          const o = c.origin, s = c.size, a = mat.apply(m, [o[0], o[1], o[2]]), z = mat.apply(m, [o[0] + s[0], o[1] + s[1], o[2]]);
          const quad = { x0: Math.min(a[0], z[0]), x1: Math.max(a[0], z[0]), y0: Math.min(a[1], z[1]), y1: Math.max(a[1], z[1]), z: a[2] };
          out.push({ geometry: gi, bone: b.name, cube: ci, quad, hidden: quad.x1 - quad.x0 < 1e-9 || quad.y1 - quad.y0 < 1e-9 });
        });
      }
    });
    return { quads: out, rotated: [...rotated] };
  }
  /** the variables a list of pre_animation lines sets (variable.name, lower case: as the evaluator names them) */
  const ownVars = (lines) => new Set((lines || []).map((l) => /^\s*(?:v|variable)\.(\w+)\s*=[^=]/.exec(l)).filter(Boolean).map((m) => `variable.${m[1].toLowerCase()}`));
  /** run pre_animation statements in env (vars filled in place). opts.stopAtUnset: as the game does — the first line that reads
   *  a variable the lines set but that is not set yet (without ??) is a content error, and the game stops there: that line and
   *  every one after it left undone (env.stoppedAt: its index). opts.ours: a RegExp of more names that are never the game's
   *  own (a variable read but set nowhere — a slip of the pen — stops it just the same) */
  function runPre(lines, env, opts = {}) {
    const set = opts.stopAtUnset ? ownVars(lines) : null, own = set && { has: (n) => set.has(n) || !!(opts.ours && opts.ours.test(n)) };
    delete env.stoppedAt;
    for (let i = 0; i < (lines || []).length; i++) {
      const l = lines[i].replace(/;\s*$/, '');
      if (!own) { molang(l, env); continue; }
      const saved = env.unknown, keep = Object.assign({}, env.vars);
      env.unknown = new Set();
      molang(l, env);
      const bad = [...env.unknown].some((n) => own.has(n));
      env.unknown = new Set([...(saved || []), ...env.unknown]);
      if (bad) { env.vars = keep; env.stoppedAt = i; break; }
    }
    return env;
  }
  /** the variables a pre_animation reads on its first frame before setting them (without ??) — of those it sets itself
   *  (the game's own, like variable.is_paperdoll, are not ours to set) or named like ours (opts.ours, GeoUI's by default). Each
   *  is a content error in the game, and the game leaves every line after it undone, every frame (bds-lab's probe, 2026-10-21).
   *  opts: { props, init: [lines] (initialize), ours } */
  function unsetReads(lines, { props = {}, init = [], ours = /^variable\.geoui_/ } = {}) {
    const own = ownVars(lines), env = envOf({ props });
    runPre(init, env); env.unknown = new Set();
    runPre(lines, env);
    return [...env.unknown].filter((n) => own.has(n) || (ours && ours.test(n))).sort();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Building a pack from a design (what the Blockbench project holds, as plain data)
  // ---------------------------------------------------------------------------------------------------------------
  /*
   design = {
     settings,                                   // settingsOf()
     bones: [{ name, parent, pivot, rotation, cubes: [{ origin, size, faces: { north: { uv, uv_size, texture }, ... } }] }],
                                                 // Bedrock geometry coordinates; the root bone is `geo_ui` (pivot [0,140,0])
     elements: { <bone name>: { type: 'image'|'number'|'gauge', anchor, blend, visible, opacity,
                                gauge: { source, max, fill }, number: { source, digits: [[numeral bone x10] per digit, most significant first], hideLeadingZero } } },
     textures: { <id>: { name, width, height, png: base64 } },
     animations: [ { name, json } ]              // the project's own animations, already in Bedrock JSON (Blockbench compiles them)
   }
  */
  const ROOT = 'geo_ui';
  const PROP_RANGES = (S) => ({
    aspect: [600, 5000, Math.round(qa(S.refAspect) * 1000)], scale: [1, 1000, 100],
    cx: [-3000, 3000, Math.round(S.centerFix.desktop.x * 10000)], cy: [-3000, 3000, Math.round(S.centerFix.desktop.y * 10000)],
    ox: [-4000, 4000, 0], oy: [-4000, 4000, 0], alpha: [0, 100, 100],
    // (an int property is a float32 in the game: past 2^24 it is no longer exact, so the range stops there)
    v0: [-16777216, 16777216, 0], v1: [-16777216, 16777216, 0], v2: [-16777216, 16777216, 0], v3: [-16777216, 16777216, 0],
  });
  /** the pre_animation lines: Studio's, word for word, when the behaviour pack drives them; constants when it does not */
  function preAnimation(S, withScript) {
    const ns = S.ns, H = S.unitsPerScreenH, P = (n) => `q.property('${ns}:${n}')`;
    // (the paper doll — the pause screen's — is a player the game builds for the picture: its properties are not read)
    const guard = (expr, fallback) => (S.hideInPaperdoll ? `variable.is_paperdoll ? ${fallback} : ${expr}` : expr);
    if (!withScript) {
      const c = centerOf(S, 'desktop', false);
      return [`v.geoui_aspect = ${r3(S.refAspect)};`, `v.geoui_halfw = ${r3(H / 2)}*v.geoui_aspect;`, 'v.geoui_scale = 1.0;', 'v.geoui_ox = 0.0;', 'v.geoui_oy = 0.0;',
        'v.geoui_alpha = 1.0;', `v.geoui_cx = ${r3(c.x)};`, `v.geoui_cy = ${r3(c.y)};`];
    }
    return [
      `v.geoui_aspect = ${guard(`${P('aspect')}/1000.0`, r3(S.refAspect))};`,
      `v.geoui_halfw = ${r3(H / 2)}*v.geoui_aspect;`,
      `v.geoui_scale = ${guard(`${P('scale')}/100.0`, '1.0')};`,
      `v.geoui_ox = ${guard(`${P('ox')}/10.0`, '0.0')};`,
      `v.geoui_oy = ${guard(`${P('oy')}/10.0`, '0.0')};`,
      `v.geoui_alpha = ${guard(`${P('alpha')}/100.0`, '1.0')};`,
      `v.geoui_cx = ${guard(`${P('cx')}/10000.0*${r3(H)}`, '0.0')};`,
      `v.geoui_cy = ${guard(`${P('cy')}/10000.0*${r3(H)}`, '0.0')};`,
    ];
  }
  /** Studio's digit: the frame shown in place `place` (10 = blank) */
  function digitExpr(source, place, hideLeadingZero) {
    const a = `math.abs(${source})`, dg = `math.mod(math.floor(${a}/${place}),10)`;
    return place > 1 && hideLeadingZero !== false ? `(${a}<${place} ? 10 : ${dg})` : dg;
  }
  const varOf = (ns, bone, k) => `v.${ns}_${clean(bone, 'e')}_d${k}`;
  /** the transform animation: the whole UI on the root, the aspect term on each anchored element, values on gauges and digits */
  function transformAnimation(design, S) {
    const bones = {}, ref = r3(halfWAt(S, S.refAspect)), extraPre = [];
    // (alpha 0 hides the whole UI by its scale too: the game ignores a render controller's colour alpha with these materials —
    //  bds-lab's probe, geoui_probe 2026-10-21; a fade between needs the colour mask, see timeline/PLAN.md)
    bones[ROOT] = { position: ['v.geoui_ox+v.geoui_cx', 'v.geoui_oy+v.geoui_cy', 0], scale: 'v.geoui_scale*(v.geoui_alpha>0.004?1:0)' };
    for (const [name, el0] of Object.entries(design.elements || {})) {
      const el = el0 || {}, h = hAnchor(el.anchor), ch = {};
      if (h === 'left') ch.position = [`-(v.geoui_halfw-${ref})`, 0, 0];
      if (h === 'right') ch.position = [`(v.geoui_halfw-${ref})`, 0, 0];
      const vis = el.visible && String(el.visible).trim() ? `((${el.visible}) ? 1 : 0)` : null;
      if (el.type === 'gauge') {
        const g = el.gauge || {}, fill = `math.clamp((${g.source || `q.property('${S.ns}:v0')`})/${r3(Math.max(1e-6, num(g.max, 100)))},0,1)`;
        const f = FILLS.includes(g.fill) ? g.fill : 'left', k = vis ? `${fill}*${vis}` : fill, one = vis || 1;
        ch.scale = f === 'bottom' || f === 'top' ? [one, k, one] : [k, one, one];
      } else if (vis) ch.scale = vis;
      if (el.type === 'number' && el.number && Array.isArray(el.number.digits)) {
        const n = el.number, src = n.source || `q.property('${S.ns}:v0')`, D = n.digits.length;
        n.digits.forEach((numerals, k) => {
          const v = varOf(S.ns, name, k), place = Math.pow(10, D - 1 - k);
          extraPre.push(`${v} = ${digitExpr(src, place, n.hideLeadingZero)};`);
          (numerals || []).forEach((bn, j) => { if (bn) bones[bn] = { scale: `${v}==${j}` }; });
        });
      }
      if (Object.keys(ch).length) bones[name] = Object.assign(bones[name] || {}, ch);
    }
    return { json: { loop: true, animation_length: 1, bones }, pre: extraPre };
  }
  /** the bounds (model units) a geometry covers, for its description (the screen at the widest aspect, at least) */
  function visibleBounds(S) {
    const H = S.unitsPerScreenH, w = r3(H * 5 + 32), h = r3(H * 2 + 32);
    return { visible_bounds_width: w, visible_bounds_height: h, visible_bounds_offset: [0, PIVOT_Y, 0] };
  }
  function faceUv(f) {
    const o = { uv: [r4(f.uv[0]), r4(f.uv[1])], uv_size: [r4(f.uv_size[0]), r4(f.uv_size[1])] };
    if (f.rotation) o.uv_rotation = f.rotation;
    return o;
  }
  /** one geometry per texture (a render controller draws one geometry with one texture); every geometry keeps every bone */
  function geometriesOf(design, S) {
    const groups = new Map(), ns = S.ns;
    for (const b of design.bones) for (const c of b.cubes || []) for (const f of Object.values(c.faces || {})) {
      if (f && f.texture != null && !groups.has(f.texture)) groups.set(f.texture, { tex: f.texture });
    }
    const out = [];
    let i = 0;
    for (const [texId] of groups) {
      const tex = (design.textures || {})[texId] || {};
      const id = `${ns}_${clean(tex.name || `t${i}`, `t${i}`)}`;
      i++;
      const bones = design.bones.map((b) => {
        const bone = { name: b.name };
        if (b.parent) bone.parent = b.parent;
        bone.pivot = b.pivot.map(r4);
        if (b.rotation && b.rotation.some((v) => num(v))) bone.rotation = b.rotation.map(r4);
        const cubes = [];
        for (const c of b.cubes || []) {
          const uv = {};
          for (const [face, f] of Object.entries(c.faces || {})) if (f && f.texture === texId) uv[face] = faceUv(f);
          if (!Object.keys(uv).length) continue;
          const cube = { origin: c.origin.map(r4), size: c.size.map(r4), uv };
          if (c.pivot && c.rotation && c.rotation.some((v) => num(v))) { cube.pivot = c.pivot.map(r4); cube.rotation = c.rotation.map(r4); }
          cubes.push(cube);
        }
        if (cubes.length) bone.cubes = cubes;
        return bone;
      });
      out.push({ key: id, texture: texId, texName: clean(tex.name || id, id), json: {
        format_version: '1.12.0',
        'minecraft:geometry': [{ description: Object.assign({ identifier: `geometry.${id}`, texture_width: tex.uvWidth || tex.width || 16, texture_height: tex.uvHeight || tex.height || 16 }, visibleBounds(S)), bones }],
      } });
    }
    return out;
  }
  function materialsFile(S) {
    const ns = S.ns, m = { materials: { version: '1.0.0' } };
    m.materials[`${ns}_base`] = {
      vertexShader: 'shaders/entity.vertex', vrGeometryShader: 'shaders/entity.geometry', fragmentShader: 'shaders/entity.fragment',
      vertexFields: [{ field: 'Position' }, { field: 'Normal' }, { field: 'UV0' }],
      variants: [
        { skinning: { '+defines': ['USE_SKINNING'], vertexFields: [{ field: 'Position' }, { field: 'BoneId0' }, { field: 'Normal' }, { field: 'UV0' }] } },
        { skinning_color: { '+defines': ['USE_SKINNING'], vertexFields: [{ field: 'Position' }, { field: 'BoneId0' }, { field: 'Color' }, { field: 'Normal' }, { field: 'UV0' }] } },
      ],
      msaaSupport: 'Both',
      '+samplerStates': [{ samplerIndex: 0, textureFilter: S.filter === 'Bilinear' ? 'Bilinear' : 'Point' }],
    };
    m.materials[`${ns}_cutout:${ns}_base`] = { '+defines': ['USE_UV_ANIM', 'ALPHA_TEST'] };
    m.materials[`${ns}_blend:${ns}_base`] = { '+defines': ['USE_UV_ANIM'], '+states': ['Blending'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' };
    m.materials[`${ns}_add:${ns}_base`] = { '+defines': ['USE_UV_ANIM'], '+states': ['Blending', 'DisableDepthWrite'], blendSrc: 'SourceAlpha', blendDst: 'One' };
    return m;
  }
  /** the HUD: a live_player_renderer in a panel at 10% x 10%, 110% down from the top (Studio's), added to root_panel */
  function hudScreen(S) {
    const ns = S.ns, size = [`${r3(S.panel.size[0])}%`, `${r3(S.panel.size[1])}%`], offset = [S.panel.offset[0] ? `${r3(S.panel.offset[0])}%` : 0, `${r3(S.panel.offset[1])}%`];
    const renderer = {
      type: 'custom', renderer: 'live_player_renderer', layer: 1, animation_reset_name: 'screen_animation_reset',
      anims: ['@common.screen_exit_size_animation_push', '@common.screen_exit_size_animation_pop', '@common.screen_entrance_size_animation_push', '@common.screen_entrance_size_animation_pop'],
      bindings: S.followHud === false ? [] : [{ binding_name: '#hud_visible', binding_name_override: '#visible' }],
    };
    const panel = { type: 'panel', size, offset, anchor_from: 'top_middle', anchor_to: 'top_middle', controls: [{ [`${ns}_renderer`]: renderer }] };
    if (S.hud === 'studio') {
      // Studio's: hud_content copied and replaced (it drops what a newer game adds to hud_content: kept only on request)
      return {
        namespace: 'hud', format_version: '1.8.0', [`${ns}_panel`]: panel,
        hud_content: {
          type: 'panel', $hud_size: ['100%', '100%'], '$hud_player_rend_desktop_offset|default': [15, 15],
          variables: [{ requires: '($compress_hud_width)', $hud_size: ['90%', '100%'] }], size: '$hud_size',
          controls: [{ 'root_panel@hud.root_panel': {} }, { 'camera_renderer@camera_renderer': {} }, { [`${ns}_panel@hud.${ns}_panel`]: {} }],
        },
      };
    }
    return {
      namespace: 'hud',
      [`${ns}_panel`]: panel,
      root_panel: { modifications: [{ array_name: 'controls', operation: 'insert_front', value: [{ [`${ns}_panel@hud.${ns}_panel`]: {} }] }] },
    };
  }
  const VANILLA_RP_PLAYER = "{\"format_version\":\"1.26.0\",\"minecraft:client_entity\":{\"description\":{\"identifier\":\"minecraft:player\",\"materials\":{\"default\":\"entity_alphatest\",\"cape\":\"entity_alphatest\",\"animated\":\"player_animated\",\"spectator\":\"player_spectator\"},\"textures\":{\"default\":\"textures/entity/steve\",\"cape\":\"textures/entity/cape_invisible\"},\"geometry\":{\"default\":\"geometry.humanoid.custom\",\"cape\":\"geometry.cape\"},\"scripts\":{\"scale\":\"0.9375\",\"initialize\":[\"variable.is_holding_right = 0.0;\",\"variable.is_blinking = 0.0;\",\"variable.last_blink_time = 0.0;\",\"variable.hand_bob = 0.0;\"],\"pre_animation\":[\"variable.helmet_layer_visible = !query.has_head_gear;\",\"variable.leg_layer_visible = 1.0;\",\"variable.boot_layer_visible = 1.0;\",\"variable.chest_layer_visible = 1.0;\",\"variable.attack_body_rot_y = Math.sin(360*Math.sqrt(variable.attack_time)) * 5.0;\",\"variable.tcos0 = (math.cos(query.modified_distance_moved * 38.17) * query.modified_move_speed / variable.gliding_speed_value) * 57.3;\",\"variable.first_person_rotation_factor = math.sin((1 - variable.attack_time) * 180.0);\",\"variable.hand_bob = query.life_time < 0.01 ? 0.0 : variable.hand_bob + ((query.is_on_ground && query.is_alive ? math.clamp(math.sqrt(math.pow(query.position_delta(0), 2.0) + math.pow(query.position_delta(2), 2.0)), 0.0, 0.1) : 0.0) - variable.hand_bob) * 0.02;\",\"variable.map_angle = math.clamp(1 - variable.player_x_rotation / 45.1, 0.0, 1.0);\",\"variable.item_use_normalized = query.main_hand_item_use_duration / query.main_hand_item_max_duration;\",\"variable.riding_y_offset = query.is_riding_any_entity_of_type('minecraft:minecart', 'minecraft:boat', 'minecraft:chest_boat', 'minecraft:strider') ? -3.0 : 0.0;\"],\"animate\":[\"root\"],\"variables\":{\"variable.fp_melee_spear_use_attachable_rotation_z\":\"public\",\"variable.tp_melee_spear_use_attachable_rotation_z\":\"public\",\"variable.fp_melee_spear_attack_attachable_rotation_z\":\"public\",\"variable.tp_melee_spear_attack_attachable_position_z\":\"public\",\"variable.attack_time\":\"public\",\"variable.item_use_normalized\":\"public\"},\"should_update_effects_offscreen\":\"1.0\"},\"animations\":{\"root\":\"controller.animation.player.root\",\"base_controller\":\"controller.animation.player.base\",\"hudplayer\":\"controller.animation.player.hudplayer\",\"humanoid_base_pose\":\"animation.humanoid.base_pose\",\"look_at_target\":\"controller.animation.humanoid.look_at_target\",\"look_at_target_ui\":\"animation.player.look_at_target.ui\",\"look_at_target_default\":\"animation.humanoid.look_at_target.default\",\"look_at_target_gliding\":\"animation.humanoid.look_at_target.gliding\",\"look_at_target_swimming\":\"animation.humanoid.look_at_target.swimming\",\"look_at_target_inverted\":\"animation.player.look_at_target.inverted\",\"cape\":\"animation.player.cape\",\"move.arms\":\"animation.player.move.arms\",\"move.legs\":\"animation.player.move.legs\",\"swimming\":\"animation.player.swim\",\"swimming.legs\":\"animation.player.swim.legs\",\"riding.arms\":\"animation.player.riding.arms\",\"riding.legs\":\"animation.player.riding.legs\",\"holding\":\"animation.player.holding\",\"brandish_spear\":\"animation.humanoid.brandish_spear\",\"charging\":\"animation.humanoid.charging\",\"attack.positions\":\"animation.player.attack.positions\",\"attack.rotations\":\"animation.player.attack.rotations\",\"sneaking\":\"animation.player.sneaking\",\"bob\":\"animation.player.bob\",\"damage_nearby_mobs\":\"animation.humanoid.damage_nearby_mobs\",\"bow_and_arrow\":\"animation.humanoid.bow_and_arrow\",\"use_item_progress\":\"animation.humanoid.use_item_progress\",\"skeleton_attack\":\"animation.skeleton.attack\",\"sleeping\":\"animation.player.sleeping\",\"first_person_base_pose\":\"animation.player.first_person.base_pose\",\"first_person_empty_hand\":\"animation.player.first_person.empty_hand\",\"first_person_swap_item\":\"animation.player.first_person.swap_item\",\"first_person_attack_controller\":\"controller.animation.player.first_person_attack\",\"first_person_attack_rotation\":\"animation.player.first_person.attack_rotation\",\"first_person_attack_rotation_item\":\"animation.player.first_person.attack_rotation_item\",\"first_person_vr_attack_rotation\":\"animation.player.first_person.vr_attack_rotation\",\"first_person_walk\":\"animation.player.first_person.walk\",\"first_person_map_controller\":\"controller.animation.player.first_person_map\",\"first_person_map_hold\":\"animation.player.first_person.map_hold\",\"first_person_map_hold_attack\":\"animation.player.first_person.map_hold_attack\",\"first_person_map_hold_off_hand\":\"animation.player.first_person.map_hold_off_hand\",\"first_person_map_hold_main_hand\":\"animation.player.first_person.map_hold_main_hand\",\"first_person_crossbow_equipped\":\"animation.player.first_person.crossbow_equipped\",\"first_person_crossbow_hold\":\"animation.player.first_person.crossbow_hold\",\"first_person_breathing_bob\":\"animation.player.first_person.breathing_bob\",\"third_person_crossbow_equipped\":\"animation.player.crossbow_equipped\",\"third_person_bow_equipped\":\"animation.player.bow_equipped\",\"crossbow_hold\":\"animation.player.crossbow_hold\",\"crossbow_controller\":\"controller.animation.player.crossbow\",\"shield_block_main_hand\":\"animation.player.shield_block_main_hand\",\"shield_block_off_hand\":\"animation.player.shield_block_off_hand\",\"blink\":\"controller.animation.persona.blink\",\"fishing_rod\":\"animation.humanoid.fishing_rod\",\"holding_spyglass\":\"animation.humanoid.holding_spyglass\",\"first_person_shield_block\":\"animation.player.first_person.shield_block\",\"tooting_goat_horn\":\"animation.humanoid.tooting_goat_horn\",\"holding_brush\":\"animation.humanoid.holding_brush\",\"brushing\":\"animation.humanoid.brushing\",\"crawling\":\"animation.player.crawl\",\"crawling.legs\":\"animation.player.crawl.legs\",\"swimming.no_right_arm\":\"animation.player.swim.no_right_arm\",\"crawling.no_right_arm\":\"animation.player.crawl.no_right_arm\",\"riding.root\":\"animation.player.riding.root\",\"holding_heavy_core\":\"animation.player.holding_heavy_core\",\"first_person_melee_spear_use\":\"animation.player.first_person.melee_spear_use\",\"first_person_melee_spear_hold\":\"animation.player.first_person.melee_spear_hold\",\"first_person_melee_spear_attack\":\"animation.player.first_person.melee_spear_attack\",\"first_person_melee_spear_controller\":\"controller.animation.player.first_person_melee_spear\",\"third_person_melee_spear_use\":\"animation.humanoid.melee_spear_use\",\"third_person_melee_spear_hold\":\"animation.humanoid.melee_spear_hold\",\"third_person_melee_spear_attack\":\"animation.player.melee_spear_attack\",\"third_person_melee_spear_controller\":\"controller.animation.player.melee_spear\"},\"render_controllers\":[{\"controller.render.player.first_person_spectator\":\"variable.is_first_person && query.is_spectator\"},{\"controller.render.player.third_person_spectator\":\"!variable.is_first_person && !variable.map_face_icon && query.is_spectator\"},{\"controller.render.player.first_person\":\"variable.is_first_person && !query.is_spectator\"},{\"controller.render.player.third_person\":\"!variable.is_first_person && !variable.map_face_icon && !query.is_spectator\"},{\"controller.render.player.map\":\"variable.map_face_icon\"}],\"enable_attachables\":true}}}";
  const VANILLA_BP_PLAYER = "{\"format_version\":\"1.26.30\",\"minecraft:entity\":{\"description\":{\"identifier\":\"minecraft:player\",\"is_summonable\":false,\"is_spawnable\":false,\"spawn_category\":\"creature\"},\"components\":{\"minecraft:attack\":{\"damage\":1},\"minecraft:block_climber\":{},\"minecraft:breathable\":{\"generates_bubbles\":false,\"inhale_time\":3.75,\"suffocate_time\":-1,\"total_supply\":15},\"minecraft:can_climb\":{},\"minecraft:collision_box\":{\"height\":1.8,\"width\":0.6},\"minecraft:conditional_bandwidth_optimization\":{},\"minecraft:environment_sensor\":{\"triggers\":{\"event\":\"minecraft:gain_raid_omen\",\"filters\":{\"all_of\":[{\"subject\":\"self\",\"test\":\"has_mob_effect\",\"value\":\"bad_omen\"},{\"subject\":\"self\",\"test\":\"is_in_village\",\"value\":true}]}}},\"minecraft:exhaustion_values\":{\"sprint\":0.1,\"jump\":0.05,\"attack\":0.1,\"damage\":0.1,\"heal\":6.0,\"lunge\":4.0,\"sprint_jump\":0.2,\"mine\":0.005,\"swim\":0.01,\"walk\":0.0},\"minecraft:experience_reward\":{\"on_death\":\"Math.Min(query.player_level * 7, 100)\"},\"minecraft:hurt_on_condition\":{\"damage_conditions\":[{\"cause\":\"lava\",\"damage_per_tick\":4,\"filters\":{\"operator\":\"==\",\"test\":\"in_lava\",\"subject\":\"self\",\"value\":true}}]},\"minecraft:insomnia\":{\"days_until_insomnia\":3},\"minecraft:is_hidden_when_invisible\":{},\"minecraft:loot\":{\"table\":\"loot_tables/empty.json\"},\"minecraft:movement\":{\"value\":0.1},\"minecraft:nameable\":{\"allow_name_tag_renaming\":false,\"always_show\":true},\"minecraft:physics\":{\"push_towards_closest_space\":true},\"minecraft:player.exhaustion\":{\"max\":20,\"value\":0},\"minecraft:player.experience\":{\"max\":1,\"value\":0},\"minecraft:player.level\":{\"max\":24791,\"value\":0},\"minecraft:player.saturation\":{\"max\":20,\"value\":5},\"minecraft:pushable_by_block\":{},\"minecraft:apply_knockback_rules\":{\"presets\":[{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"bouncy\"},\"horizontal_power\":0.165,\"vertical_power\":0.105,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"regular\"},\"horizontal_power\":0.165,\"vertical_power\":0.105,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"slow_bouncy\"},\"horizontal_power\":0.165,\"vertical_power\":0.24,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"slow_flat\"},\"horizontal_power\":0.165,\"vertical_power\":0.105,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"fast_flat\"},\"horizontal_power\":0.365,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"light\"},\"horizontal_power\":0.165,\"vertical_power\":0.18,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"fast_sliding\"},\"horizontal_power\":0.265,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"slow_sliding\"},\"horizontal_power\":0.165,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"sticky\"},\"horizontal_power\":0.165,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"high_resistance\"},\"horizontal_power\":0.165,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"explosive\"},\"horizontal_power\":0.165,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"hot\"},\"horizontal_power\":0.165,\"vertical_power\":0.105,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"}]},\"minecraft:rideable\":{\"family_types\":[\"parrot_tame\"],\"pull_in_entities\":true,\"seat_count\":2,\"seats\":[{\"lock_rider_rotation\":0,\"min_rider_count\":0,\"max_rider_count\":0,\"position\":[0.4,-0.2,-0.1]},{\"lock_rider_rotation\":0,\"min_rider_count\":1,\"max_rider_count\":2,\"position\":[-0.4,-0.2,-0.1]}]},\"minecraft:type_family\":{\"family\":[\"player\"]}},\"component_groups\":{\"minecraft:add_raid_omen\":{\"minecraft:spell_effects\":{\"add_effects\":[{\"display_on_screen_animation\":true,\"duration\":30,\"effect\":\"raid_omen\"}],\"remove_effects\":\"bad_omen\"},\"minecraft:timer\":{\"looping\":false,\"time\":[0.0,0.0],\"time_down_event\":{\"event\":\"minecraft:clear_add_raid_omen\",\"target\":\"self\"}}},\"minecraft:clear_raid_omen_spell_effect\":{\"minecraft:spell_effects\":{}},\"minecraft:raid_trigger\":{\"minecraft:raid_trigger\":{\"triggered_event\":{\"event\":\"minecraft:remove_raid_trigger\",\"target\":\"self\"}}}},\"events\":{\"minecraft:clear_add_raid_omen\":{\"add\":{\"component_groups\":[\"minecraft:clear_raid_omen_spell_effect\"]},\"remove\":{\"component_groups\":[\"minecraft:add_raid_omen\"]}},\"minecraft:remove_raid_trigger\":{\"remove\":{\"component_groups\":[\"minecraft:raid_trigger\"]}},\"minecraft:gain_raid_omen\":{\"add\":{\"component_groups\":[\"minecraft:add_raid_omen\"]}},\"minecraft:trigger_raid\":{\"add\":{\"component_groups\":[\"minecraft:raid_trigger\"]}}}}}";

  function uuidFrom(seed) {   // a stable UUID v4-shaped id from text (FNV-1a, 4 rounds): the same project keeps its pack ids
    const hex = [];
    for (let r = 0; r < 4; r++) {
      let h = 0x811c9dc5 ^ (r * 0x9e3779b9);
      for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      hex.push((h >>> 0).toString(16).padStart(8, '0'));
    }
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${((parseInt(s[16], 16) & 3) | 8).toString(16)}${s.slice(17, 20)}-${s.slice(20, 32)}`;
  }
  /** the behaviour pack's script: properties from the platform or what the player set before; typed commands; no silent failure */
  function scriptOf(S) {
    const R = PROP_RANGES(S), cfg = {
      ns: S.ns, ranges: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, [v[0], v[1]]])),
      aspect: { desktop: S.platformAspect.Desktop, mobile: S.platformAspect.Mobile, console: S.platformAspect.Console },
      center: Object.fromEntries(['desktop', 'mobile', 'console'].map((k) => [k, { cx: Math.round(S.centerFix[k].x * 10000), cy: Math.round(S.centerFix[k].y * 10000) }])),
      centerAuto: S.centerAuto !== false,
    };
    return `// GeoUI Builder ${VERSION}: the properties the resource pack reads (q.property('${S.ns}:…')), set per player.
// /${S.ns}:set <name> <value> · /${S.ns}:aspect <width> <height> · /${S.ns}:get · /${S.ns}:reset
// /scriptevent ${S.ns}:set <name> <value>   (from a command block or another pack: the source player, else everyone)
// scoreboard ${S.ns}_v0 … ${S.ns}_v3 (if you add them) are copied to v0 … v3 every 2 ticks.
import { world, system, Player, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from '@minecraft/server';

const CFG = ${JSON.stringify(cfg)};
const NS = CFG.ns;
const KEEP = ['aspect', 'scale', 'cx', 'cy', 'ox', 'oy', 'alpha'];

function platformOf(p) {
  try { const t = String(p.clientSystemInfo.platformType); return t === 'Mobile' ? 'mobile' : t === 'Console' ? 'console' : 'desktop'; } catch { return 'desktop'; }
}
/** '' or why not (out of range, not an integer, unknown name): nothing is dropped silently */
function setOne(p, name, value, keep) {
  const r = CFG.ranges[name];
  if (!r) return \`\${NS}: unknown property \${name} (\${Object.keys(CFG.ranges).join(', ')})\`;
  if (!Number.isInteger(value) || value < r[0] || value > r[1]) return \`\${NS}:\${name} must be an integer \${r[0]}..\${r[1]} (got \${value})\`;
  p.setProperty(\`\${NS}:\${name}\`, value);
  if (keep && KEEP.includes(name)) p.setDynamicProperty(\`\${NS}:\${name}\`, value);
  return '';
}
function restore(p) {
  const pl = platformOf(p), def = { aspect: CFG.aspect[pl], cx: CFG.centerAuto ? CFG.center[pl].cx : CFG.center.desktop.cx, cy: CFG.centerAuto ? CFG.center[pl].cy : CFG.center.desktop.cy };
  for (const name of KEEP) {
    let v; try { v = p.getDynamicProperty(\`\${NS}:\${name}\`); } catch { v = undefined; }
    if (typeof v !== 'number') v = def[name];
    if (typeof v === 'number') setOne(p, name, v, false);
  }
}
function reset(p) {
  for (const name of KEEP) { try { p.setDynamicProperty(\`\${NS}:\${name}\`, undefined); } catch { /* left */ } }
  for (const name of ['scale', 'ox', 'oy', 'alpha']) p.resetProperty(\`\${NS}:\${name}\`);
  restore(p);
}
world.afterEvents.playerSpawn.subscribe((e) => { if (e.initialSpawn) system.run(() => { if (e.player.isValid) restore(e.player); }); });
world.afterEvents.worldLoad.subscribe(() => { for (const p of world.getAllPlayers()) restore(p); });

system.beforeEvents.startup.subscribe((e) => {
  const reg = e.customCommandRegistry, ANY = CommandPermissionLevel.Any;
  const who = (o) => { const s = o.initiator ?? o.sourceEntity; return s instanceof Player ? s : undefined; };
  const reply = (p, text) => system.run(() => { if (p && p.isValid) p.sendMessage(text); else console.warn(text); });
  reg.registerEnum(\`\${NS}:property\`, Object.keys(CFG.ranges));
  reg.registerCommand({ name: \`\${NS}:set\`, description: 'GeoUI: set one of your properties', permissionLevel: ANY,
    mandatoryParameters: [{ name: \`\${NS}:property\`, type: CustomCommandParamType.Enum }, { name: 'value', type: CustomCommandParamType.Integer }] },
  (o, name, value) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (!p.isValid) return; const why = setOne(p, name, value, true); reply(p, why || \`\${NS}:\${name} = \${value}\`); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: \`\${NS}:aspect\`, description: 'GeoUI: your screen size (e.g. 2340 1080)', permissionLevel: ANY,
    mandatoryParameters: [{ name: 'width', type: CustomCommandParamType.Integer }, { name: 'height', type: CustomCommandParamType.Integer }] },
  (o, w, h) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    if (!(w > 0 && h > 0)) return { status: CustomCommandStatus.Failure, message: 'width and height must be positive' };
    system.run(() => { if (!p.isValid) return; const a = Math.round(w / h * 1000), why = setOne(p, 'aspect', a, true); reply(p, why || \`\${NS}:aspect = \${a}\`); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: \`\${NS}:get\`, description: 'GeoUI: show your properties', permissionLevel: ANY },
  (o) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) reply(p, Object.keys(CFG.ranges).map((k) => \`\${k}=\${p.getProperty(\`\${NS}:\${k}\`)}\`).join(' ')); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: \`\${NS}:reset\`, description: 'GeoUI: back to the defaults of your device', permissionLevel: ANY },
  (o) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) { reset(p); reply(p, \`\${NS}: reset\`); } });
    return { status: CustomCommandStatus.Success };
  });
});

system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id !== \`\${NS}:set\`) return;
  const [name, raw] = String(e.message).trim().split(/\\s+/), value = Number(raw);
  const targets = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) { const why = setOne(p, name, value, true); if (why) console.warn(why); }
}, { namespaces: [NS] });

system.runInterval(() => {
  for (let i = 0; i < 4; i++) {
    const o = world.scoreboard.getObjective(\`\${NS}_v\${i}\`);
    if (!o) continue;
    const r = CFG.ranges[\`v\${i}\`];
    for (const p of world.getAllPlayers()) {
      if (!o.hasParticipant(p)) continue;
      const s = o.getScore(p);
      if (s === undefined) continue;
      const v = Math.min(r[1], Math.max(r[0], s));
      if (p.getProperty(\`\${NS}:v\${i}\`) !== v) p.setProperty(\`\${NS}:v\${i}\`, v);
    }
  }
}, 2);
`;
  }

  /**
   * design → { files: {path: string | Uint8Array | {base64}}, report: [lines], warnings: [lines] }
   * Paths are inside the .mcaddon: <ns>_RP/…, <ns>_BP/….
   */
  function buildPack(design) {
    const S = settingsOf(design.settings), ns = S.ns, warnings = [], files = {};
    const withScript = S.bp !== false;
    // (the .mcaddon layout bds-lab's own `pack` writes: one folder per pack at the top)
    const rpDir = `${ns}_RP`, bpDir = `${ns}_BP`;
    if (!design.bones || !design.bones.find((b) => b.name === ROOT)) warnings.push(`いちばん上のボーン ${ROOT} がありません（GeoUI → 新しいプロジェクトで作ると入ります）`);
    for (const [name, el] of Object.entries(design.elements || {})) {
      for (const [what, src] of [['表示の条件', el.visible], ['ゲージの値', el.gauge && el.gauge.source], ['数字の値', el.number && el.number.source], ['不透明度', el.opacity]]) {
        if (src && String(src).trim() && typeof src !== 'number') { const why = molangError(src); if (why) warnings.push(`${name}: ${what}「${src}」が読めません: ${why}`); }
      }
    }
    const geos = geometriesOf(design, S);
    if (!geos.length) warnings.push('テクスチャの付いた面がひとつもありません（何も描かれません）');
    const tr = transformAnimation(design, S);
    const pre = [...preAnimation(S, withScript), ...tr.pre];
    const animations = { [`animation.${ns}_transform`]: tr.json };
    for (const a of design.animations || []) if (a && a.name && a.json) animations[a.name.startsWith('animation.') ? a.name : `animation.${a.name}`] = a.json;
    const used = new Set(['cutout']);
    for (const el of Object.values(design.elements || {})) if (BLENDS.includes(el && el.blend)) used.add(el.blend);

    // render controllers: one per geometry; materials by element (a whole element and its children, by bone name prefix)
    const controllers = {}, rcList = [], entityGeo = {}, entityTex = {};
    const cond = ['q.is_in_ui', ...(S.hideInPaperdoll ? ['!variable.is_paperdoll'] : [])].join(' && ');
    const descendants = (name) => { const out = [name]; for (const b of design.bones) if (b.parent && out.includes(b.parent) && !out.includes(b.name)) out.push(b.name); return out; };
    for (const g of geos) {
      const mats = [{ '*': `material.${ns}_cutout` }];
      for (const [name, el] of Object.entries(design.elements || {})) {
        if (el && el.blend && el.blend !== 'cutout' && BLENDS.includes(el.blend)) for (const bn of descendants(name)) mats.push({ [bn]: `material.${ns}_${el.blend}` });
      }
      controllers[`controller.render.${g.key}`] = {
        geometry: `Geometry.${g.key}`, materials: mats, textures: [`Texture.${g.key}`],
        uv_anim: { offset: [0, 0], scale: [1, 1] },
        color: { r: 1, g: 1, b: 1, a: 'v.geoui_alpha' },
        is_hurt_color: { r: 0, g: 0, b: 0, a: 0 }, on_fire_color: { r: 0, g: 0, b: 0, a: 0 },
      };
      rcList.push({ [`controller.render.${g.key}`]: cond });
      entityGeo[g.key] = `geometry.${g.key}`;
      entityTex[g.key] = `textures/${ns}/${g.texName}`;
      files[`${rpDir}/models/entity/${ns}/${g.texName}.geo.json`] = J(g.json);
      const tex = (design.textures || {})[g.texture];
      if (tex && tex.png) files[`${rpDir}/textures/${ns}/${g.texName}.png`] = { base64: tex.png };
      else warnings.push(`テクスチャ ${g.texName} の画像がありません`);
    }
    const U = S.uuids || { rp: uuidFrom(`${ns}:rp:${design.seed || ''}`), rpMod: uuidFrom(`${ns}:rp-mod:${design.seed || ''}`), bp: uuidFrom(`${ns}:bp:${design.seed || ''}`),
      bpData: uuidFrom(`${ns}:bp-data:${design.seed || ''}`), bpScript: uuidFrom(`${ns}:bp-script:${design.seed || ''}`) };
    const rpUuid = U.rp, bpUuid = U.bp;
    files[`${rpDir}/manifest.json`] = J({
      format_version: 2,
      header: { name: `${S.name} RP`, description: S.description, uuid: rpUuid, version: S.version, min_engine_version: S.minEngine },
      modules: [{ type: 'resources', uuid: U.rpMod, version: [1, 0, 0] }],
    });
    files[`${rpDir}/materials/entity.material`] = J(materialsFile(S));
    files[`${rpDir}/render_controllers/${ns}.render_controllers.json`] = J({ format_version: '1.8.0', render_controllers: controllers });
    files[`${rpDir}/animations/${ns}.animation.json`] = J({ format_version: '1.8.0', animations });
    files[`${rpDir}/ui/hud_screen.json`] = J(hudScreen(S));

    const ce = JSON.parse(VANILLA_RP_PLAYER), d = ce['minecraft:client_entity'].description;
    for (const b of used) d.materials[`${ns}_${b}`] = `${ns}_${b}`;
    Object.assign(d.textures, entityTex);
    Object.assign(d.geometry, entityGeo);
    d.scripts.pre_animation.push(...pre);
    const animate = [{ [`${ns}_transform`]: 'q.is_in_ui' }];
    d.animations[`${ns}_transform`] = `animation.${ns}_transform`;
    for (const a of design.animations || []) {
      const full = a.name.startsWith('animation.') ? a.name : `animation.${a.name}`, base = clean(full.replace(/^animation\./, ''), 'anim');
      const short = base.startsWith(`${ns}_`) ? base : `${ns}_${base}`;
      d.animations[short] = full; animate.push({ [short]: a.condition || 'q.is_in_ui' });
    }
    d.scripts.animate = [...animate, ...d.scripts.animate];
    d.render_controllers = [...rcList, ...d.render_controllers];
    files[`${rpDir}/entity/player.entity.json`] = J(ce);
    const lang = `pack.name=${String(S.name).replace(/[\r\n=]/g, ' ')}\npack.description=${String(S.description).replace(/[\r\n=]/g, ' ')}\n`;
    // (the pack redefines minecraft:player: its name is given again, the game's own words)
    files[`${rpDir}/texts/languages.json`] = J(['en_US', 'ja_JP']);
    files[`${rpDir}/texts/en_US.lang`] = `${lang}entity.minecraft:player.name=Player\n`; files[`${rpDir}/texts/ja_JP.lang`] = `${lang}entity.minecraft:player.name=プレイヤー\n`;

    if (withScript) {
      const props = {};
      for (const [k, [a, b, def]] of Object.entries(PROP_RANGES(S))) props[`${ns}:${k}`] = { client_sync: true, type: 'int', range: [a, b], default: Math.min(b, Math.max(a, def)) };
      const be = JSON.parse(VANILLA_BP_PLAYER);
      be['minecraft:entity'].description.properties = props;
      files[`${bpDir}/manifest.json`] = J({
        format_version: 2,
        header: { name: `${S.name} BP`, description: S.description, uuid: bpUuid, version: S.version, min_engine_version: S.minEngine },
        modules: [{ type: 'data', uuid: U.bpData, version: [1, 0, 0] },
          { type: 'script', language: 'javascript', uuid: U.bpScript, entry: 'scripts/main.js', version: [1, 0, 0] }],
        dependencies: [{ uuid: rpUuid, version: S.version }, { module_name: '@minecraft/server', version: '2.1.0' }],
      });
      files[`${bpDir}/entities/player.json`] = J(be);
      // (the player's loot table, as the vanilla behaviour pack has it: the pack does not lean on another pack's file)
      files[`${bpDir}/loot_tables/empty.json`] = J({ pools: [] });
      files[`${bpDir}/scripts/main.js`] = scriptOf(S);
      files[`${bpDir}/texts/languages.json`] = J(['en_US', 'ja_JP']);
      files[`${bpDir}/texts/en_US.lang`] = lang; files[`${bpDir}/texts/ja_JP.lang`] = lang;
    }
    const report = [
      `GeoUI Builder ${VERSION}: ${ns}（画面の高さ ${r3(S.unitsPerScreenH)} 単位・基準の画面比 ${r3(S.refAspect)}・HUD の枠 ${S.panel.size.join('% x ')}% / ${S.panel.offset[1]}%）`,
      `要素 ${Object.keys(design.elements || {}).length} ・ジオメトリ ${geos.length} ・アニメーション ${Object.keys(animations).length} ・${withScript ? 'ビヘイビアパックあり（スクリプトで画面比と中心を決める）' : 'リソースパックだけ（画面比 ' + r3(S.refAspect) + ' に固定）'}`,
    ];
    return { files, report, warnings, settings: S, pre, animation: tr.json, geometries: geos.map((g) => g.json) };
  }

  /** where each element is drawn (model units) for an aspect, platform and properties — the exporter's own Molang, run */
  function layoutOf(built, { aspect, platform = 'desktop', props = {}, isPaperdoll = 0 } = {}) {
    const S = built.settings, ns = S.ns, R = PROP_RANGES(S), p = {};
    for (const [k, v] of Object.entries(R)) p[`${ns}:${k}`] = v[2];
    if (aspect) p[`${ns}:aspect`] = Math.round(qa(aspect) * 1000);
    const c = S.centerFix[platform] || S.centerFix.desktop;
    p[`${ns}:cx`] = Math.round(c.x * 10000); p[`${ns}:cy`] = Math.round(c.y * 10000);
    Object.assign(p, props);
    const env = envOf({ props: p, isPaperdoll });
    runPre(built.pre, env);
    const geos = built.geometries.map((g) => g['minecraft:geometry'][0]);
    return Object.assign(pose(geos, built.animation, env), { vars: env.vars, unknown: env.unknown ? [...env.unknown] : [] });
  }

  return {
    VERSION, STUDIO, MEASURED, CALIBRATIONS, DEVICES, ANCHORS, BLENDS, FILLS, PIVOT_Y, ROOT,
    num, r3, r4, clean, qa, defaults, newProjectSettings, frameScreen, settingsOf, halfWAt, centerOf, screenAt, hAnchor, vAnchor, padsOf, studioAnchor,
    parse, evaluate, molang, molangError, envOf, pose, runPre, unsetReads, digitExpr, preAnimation, transformAnimation,
    geometriesOf, materialsFile, hudScreen, scriptOf, buildPack, layoutOf, uuidFrom, PROP_RANGES,
  };
})();

if (typeof module === 'object' && module && module.exports && typeof BBPlugin === 'undefined') module.exports = GeoUICore;

// =====================================================================================================================
// The Blockbench side: a GeoUI project format, the screen frame in the viewport, elements, the preview, the export.
// Coordinates: GeoUICore works in Bedrock geometry units (x = to the right of the screen); Blockbench keeps x mirrored
// (its Bedrock codec turns x into -x), so every point crosses with toBB / fromBB.
// =====================================================================================================================
if (typeof BBPlugin !== 'undefined') (function () {
  const G = GeoUICore, FORMAT_ID = 'geoui';
  const toBB = (v) => [-v[0], v[1], v[2]], fromBB = (v) => [-v[0], v[1], v[2]];
  const state = { format: null, menu: null, overlay: null, actions: [], props: [], listeners: [], bridge: null };
  const isGeo = () => typeof Format !== 'undefined' && Format && Format.id === FORMAT_ID && typeof Project !== 'undefined' && Project;
  const say = (text, kind) => Blockbench.showQuickMessage(text, kind === 'error' ? 3500 : 2000);

  // ---------------------------------------------------------------- settings (kept in the .bbmodel)
  function settings() {
    if (typeof Project === 'undefined' || !Project) return G.settingsOf({});
    if (!Project.geoui_settings || typeof Project.geoui_settings !== 'object' || !Object.keys(Project.geoui_settings).length) Project.geoui_settings = G.defaults();
    return G.settingsOf(Project.geoui_settings);
  }
  function setSettings(patch) {
    Project.geoui_settings = G.settingsOf(Object.assign({}, settings(), patch || {}));
    Project.saved = false;
    refreshOverlay();
    return Project.geoui_settings;
  }

  // ---------------------------------------------------------------- the outliner
  const rootOf = () => Group.all.find((g) => g.name === G.ROOT && !(g.parent instanceof Group));
  function ensureRoot() {
    let r = rootOf();
    if (!r) r = new Group({ name: G.ROOT, origin: toBB([0, G.PIVOT_Y, 0]) }).init();
    return r;
  }
  function uniqueName(base) {
    const b = G.clean(base, 'ui'), names = new Set(Group.all.map((g) => g.name).concat(Cube.all.map((c) => c.name)));
    let n = b, i = 1;
    while (names.has(n)) n = `${b}_${++i}`;
    return n;
  }
  /** the next layer: Studio's -0.2 per layer, towards the camera */
  function nextZ() {
    let z = 0;
    for (const c of Cube.all) z = Math.min(z, c.from[2], c.to[2]);
    return G.r3(z + G.STUDIO.layerZ);
  }
  const q4 = (v) => v.map((x) => G.r4(x) + 0);
  function group(name, parent, pivot, meta) {
    const g = new Group({ name, origin: q4(toBB(pivot)) });
    g.addTo(parent || ensureRoot()).init();
    if (meta) g.geoui = meta;
    return g;
  }
  /** a flat cube facing the camera (north face only), box in Bedrock units {x0, y0, x1, y1, z} */
  function plane(name, parent, box, tex, uv) {
    const off = { uv: [0, 0, 0, 0], texture: null };
    const c = new Cube({
      name, from: q4([-box.x1, box.y0, box.z]), to: q4([-box.x0, box.y1, box.z]), origin: parent.origin.slice(), box_uv: false,
      faces: { north: { uv: uv.slice(), texture: tex ? tex.uuid : false }, south: off, east: off, west: off, up: off, down: off },
    });
    c.addTo(parent).init();
    return c;
  }
  function textureFrom(name, dataUrl, w, h) {
    const t = new Texture({ name: G.clean(name, 'ui') }).fromDataURL(dataUrl);
    t.uv_width = w; t.uv_height = h;
    t.add(false);
    return t;
  }
  const imageSize = (dataUrl) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => no(new Error('画像を読めません')); im.src = dataUrl; });

  // pictures the plugin draws itself: a digit strip (0-9 and a blank cell) and a gauge
  const FONT = ['01110100011001110101110011000101110', '00100011000010000100001000010001110', '01110100010000100010001000100011111', '11111000100010000010000011000101110',
    '00010001100101010010111110001000010', '11111100001111000001000011000101110', '00110010001000011110100011000101110', '11111000010001000100010000100001000',
    '01110100011000101110100011000101110', '01110100011000101111000010001001100'];
  function digitStrip(color = '#ffffff', outline = '#000000') {
    const cw = 12, ch = 16, c = document.createElement('canvas'); c.width = cw * 11; c.height = ch;
    const x = c.getContext('2d');
    for (let d = 0; d < 10; d++) {
      const ox = d * cw + 1, oy = 1, on = (i, j) => i >= 0 && i < 5 && j >= 0 && j < 7 && FONT[d][j * 5 + i] === '1';
      for (let j = -1; j <= 7; j++) for (let i = -1; i <= 5; i++) {
        let fill = null;
        if (on(i, j)) fill = color;
        else if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => on(i + a, j + b))) fill = outline;
        if (fill) { x.fillStyle = fill; x.fillRect(ox + (i + 0.5) * 2, oy + (j + 0.5) * 2, 2, 2); }
      }
    }
    return { dataUrl: c.toDataURL('image/png'), w: cw * 11, h: ch, cells: 11 };
  }
  function gaugeImage(from = '#3B5BFF', to = '#8B5CF6') {
    const w = 64, h = 8, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, from); g.addColorStop(1, to);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 0, w, 2);
    return { dataUrl: c.toDataURL('image/png'), w, h };
  }

  /** where a w x h box goes: an anchor and pads (Studio's padX / padY, model units), or a centre (x, y relative to the screen centre) */
  function placeBox(S, w, h, o) {
    let cx = G.num(o.x, 0), cy = G.num(o.y, 0);
    if (o.padX != null || o.padY != null) { const a = G.studioAnchor(S, w, h, o.anchor, G.num(o.padX), G.num(o.padY), S.refAspect); cx = a.x; cy = a.y; }
    const z = o.z != null ? G.num(o.z) : nextZ();
    return { x0: cx - w / 2, x1: cx + w / 2, y0: G.PIVOT_Y + cy - h / 2, y1: G.PIVOT_Y + cy + h / 2, z, cx, cy: G.PIVOT_Y + cy };
  }

  // ---------------------------------------------------------------- elements
  /** an image: {name, dataUrl | texture, heightPct (of the screen height, Studio's) | height, anchor, padX, padY | x, y, z, blend, visible} */
  async function addImage(o = {}) {
    const S = settings();
    Undo.initEdit({ outliner: true, elements: [], textures: [] });
    let tex = o.texture ? Texture.all.find((t) => t.uuid === o.texture || t.name === o.texture) : null, w0, h0;
    if (!tex) { [w0, h0] = await imageSize(o.dataUrl); tex = textureFrom(o.name || 'image', o.dataUrl, w0, h0); } else { w0 = tex.uv_width; h0 = tex.uv_height; }
    const h = o.height != null ? G.num(o.height) : S.unitsPerScreenH * G.num(o.heightPct, 30) / 100, w = o.width != null ? G.num(o.width) : h * w0 / h0;
    const box = placeBox(S, w, h, o), name = uniqueName(o.name || 'image');
    const g = group(name, null, [box.cx, box.cy, box.z], { type: 'image', anchor: o.anchor || 'center', blend: o.blend || 'cutout', visible: o.visible || '' });
    const c = plane(`${name}_plane`, g, box, tex, o.uv || [0, 0, w0, h0]);
    Undo.finishEdit('GeoUI: 画像を足す', { outliner: true, elements: [c], textures: [tex] });
    Canvas.updateAll();
    return g;
  }
  /** a number: {name, digits, source (Molang), heightPct, anchor, padX, padY | x, y, texture | dataUrl + cells (10 or 11 in a row: 0-9 and a blank), hideLeadingZero, blend} */
  async function addNumber(o = {}) {
    const S = settings(), D = Math.max(1, Math.min(9, Math.round(G.num(o.digits, 3))));
    Undo.initEdit({ outliner: true, elements: [], textures: [] });
    let tex = o.texture ? Texture.all.find((t) => t.uuid === o.texture || t.name === o.texture) : null, cells = G.num(o.cells, 11), strip;
    if (!tex && o.dataUrl) { const [w0, h0] = await imageSize(o.dataUrl); tex = textureFrom(`${o.name || 'number'}_digits`, o.dataUrl, w0, h0); }
    if (!tex) { strip = digitStrip(o.color, o.outline); tex = textureFrom(`${o.name || 'number'}_digits`, strip.dataUrl, strip.w, strip.h); cells = strip.cells; }
    const cw = tex.uv_width / cells, ch = tex.uv_height;
    const h = o.height != null ? G.num(o.height) : S.unitsPerScreenH * G.num(o.heightPct, 9) / 100, dw = h * cw / ch, w = dw * D;
    const box = placeBox(S, w, h, o), name = uniqueName(o.name || 'number');
    const el = group(name, null, [box.cx, box.cy, box.z], { type: 'number', anchor: o.anchor || 'center', blend: o.blend || 'cutout', visible: o.visible || '',
      number: { source: o.source || `q.property('${S.ns}:v0')`, hideLeadingZero: o.hideLeadingZero !== false } });
    const cubes = [];
    for (let k = 0; k < D; k++) {
      const x0 = box.x0 + dw * k, dc = x0 + dw / 2;
      const dg = group(`${name}_d${k}`, el, [dc, box.cy, box.z], { role: 'digit', index: k });
      for (let j = 0; j < 10; j++) {
        const ng = group(`${name}_d${k}_n${j}`, dg, [dc, box.cy, box.z], { role: 'numeral', value: j });
        // (the ten planes of a digit are never seen together — all but one are scaled to 0 — but they do not share a plane:
        //  0.02 apart towards the camera, inside the layer's 0.2)
        cubes.push(plane(`${name}_d${k}_n${j}_plane`, ng, { x0, x1: x0 + dw, y0: box.y0, y1: box.y1, z: G.r3(box.z - 0.02 * j) }, tex, [cw * j, 0, cw * (j + 1), ch]));
      }
    }
    Undo.finishEdit('GeoUI: 数字を足す', { outliner: true, elements: cubes, textures: [tex] });
    syncNumerals();
    Canvas.updateAll();
    return el;
  }
  /** a gauge: {name, source, max, fill ('left'|'right'|'bottom'|'top'|'center'), widthPct, heightPct, anchor, padX, padY | x, y, colors | texture, blend} */
  async function addGauge(o = {}) {
    const S = settings();
    Undo.initEdit({ outliner: true, elements: [], textures: [] });
    let tex = o.texture ? Texture.all.find((t) => t.uuid === o.texture || t.name === o.texture) : null, tw, th;
    if (!tex) { const im = o.dataUrl ? { dataUrl: o.dataUrl } : gaugeImage(...(o.colors || [])); [tw, th] = im.w ? [im.w, im.h] : await imageSize(im.dataUrl); tex = textureFrom(`${o.name || 'gauge'}_fill`, im.dataUrl, tw, th); } else { tw = tex.uv_width; th = tex.uv_height; }
    const w = o.width != null ? G.num(o.width) : S.unitsPerScreenH * G.num(o.widthPct, 34) / 100, h = o.height != null ? G.num(o.height) : S.unitsPerScreenH * G.num(o.heightPct, 2.5) / 100;
    const box = placeBox(S, w, h, o), name = uniqueName(o.name || 'gauge'), fill = G.FILLS.includes(o.fill) ? o.fill : 'left';
    const pivot = [fill === 'left' ? box.x0 : fill === 'right' ? box.x1 : box.cx, fill === 'bottom' ? box.y0 : fill === 'top' ? box.y1 : box.cy, box.z];
    const g = group(name, null, pivot, { type: 'gauge', anchor: o.anchor || 'center', blend: o.blend || 'blend', visible: o.visible || '',
      gauge: { source: o.source || `q.property('${S.ns}:v1')`, max: G.num(o.max, 100), fill } });
    const c = plane(`${name}_plane`, g, box, tex, [0, 0, tw, th]);
    Undo.finishEdit('GeoUI: ゲージを足す', { outliner: true, elements: [c], textures: [tex] });
    Canvas.updateAll();
    return g;
  }
  /** a number's ten planes per digit sit on top of each other: outside the preview only the 0s are shown (export takes all) */
  function syncNumerals() {
    if (!isGeo()) return;
    const all = Modes.animate;
    let changed = false;
    for (const g of Group.all) {
      if (!g.geoui || g.geoui.role !== 'numeral') continue;
      const v = all || g.geoui.value === 0;
      for (const c of g.children) if (c instanceof Cube && c.visibility !== v) { c.visibility = v; changed = true; }
    }
    if (changed) Canvas.updateVisibility();
  }
  /** the element (a bone with GeoUI settings) a node belongs to */
  function elementOf(node) {
    for (let g = node instanceof Group ? node : node && node.parent; g instanceof Group; g = g.parent) if (g.geoui && g.geoui.type) return g;
    return null;
  }
  /** the box (Bedrock units) the cubes under a group cover */
  function boxOf(g) {
    let b = null;
    g.forEachChild((c) => {
      if (!(c instanceof Cube)) return;
      const [a, z] = [fromBB(c.from), fromBB(c.to)];
      const x0 = Math.min(a[0], z[0]), x1 = Math.max(a[0], z[0]), y0 = Math.min(a[1], z[1]), y1 = Math.max(a[1], z[1]);
      b = b ? { x0: Math.min(b.x0, x0), x1: Math.max(b.x1, x1), y0: Math.min(b.y0, y0), y1: Math.max(b.y1, y1) } : { x0, x1, y0, y1 };
    }, null, true);
    return b;
  }
  /** move an element so it sits at an anchor with pads (model units) — Studio's "anchor + pad" placement */
  function align(g, anchor, padX, padY) {
    const S = settings(), b = boxOf(g);
    if (!b) return;
    const w = b.x1 - b.x0, h = b.y1 - b.y0, a = G.studioAnchor(S, w, h, anchor, G.num(padX), G.num(padY), S.refAspect);
    const dx = a.x - (b.x0 + b.x1) / 2, dy = G.PIVOT_Y + a.y - (b.y0 + b.y1) / 2;
    Undo.initEdit({ outliner: true, elements: [] });
    const moved = [];
    g.forEachChild((n) => {
      if (n instanceof Cube) { n.from = q4([n.from[0] - dx, n.from[1] + dy, n.from[2]]); n.to = q4([n.to[0] - dx, n.to[1] + dy, n.to[2]]); n.origin = q4([n.origin[0] - dx, n.origin[1] + dy, n.origin[2]]); moved.push(n); }
      if (n instanceof Group) n.origin = q4([n.origin[0] - dx, n.origin[1] + dy, n.origin[2]]);
    }, null, true);
    g.origin = q4([g.origin[0] - dx, g.origin[1] + dy, g.origin[2]]);
    g.geoui = Object.assign({}, g.geoui, { anchor });
    Undo.finishEdit('GeoUI: 寄せる', { outliner: true, elements: moved });
    Canvas.updateAll();
  }
  /** every cube scaled about the screen centre by k (the screen height changed: Studio rebuilds its planes the same way) */
  function rescale(k) {
    Undo.initEdit({ outliner: true, elements: Cube.all.slice() });
    const c0 = toBB([0, G.PIVOT_Y, 0]), f = (v, i) => (i === 2 ? v : c0[i] + (v - c0[i]) * k);
    for (const c of Cube.all) { c.from = q4(c.from.map(f)); c.to = q4(c.to.map(f)); c.origin = q4(c.origin.map(f)); }
    for (const g of Group.all) g.origin = q4(g.origin.map(f));
    Undo.finishEdit('GeoUI: 画面の高さに合わせて拡大縮小', { outliner: true, elements: Cube.all.slice() });
    Canvas.updateAll();
  }

  // ---------------------------------------------------------------- the project → a design → a pack
  const PREVIEW_NAME = () => `animation.${settings().ns}_transform`;
  function design() {
    const S = settings(), bones = [], elements = {}, textures = {}, warnings = [];
    const faceOf = (c, key) => {
      const f = c.faces[key], t = f && f.getTexture && f.getTexture();
      if (!(t instanceof Texture)) return null;
      const out = { uv: [f.uv[0], f.uv[1]], uv_size: [f.uv[2] - f.uv[0], f.uv[3] - f.uv[1]], texture: t.uuid };
      if (key === 'up' || key === 'down') { out.uv = [out.uv[0] + out.uv_size[0], out.uv[1] + out.uv_size[1]]; out.uv_size = [-out.uv_size[0], -out.uv_size[1]]; }
      if (f.rotation) out.rotation = f.rotation;
      return out;
    };
    const walk = (g, parent) => {
      if (g.export === false) return;
      const b = { name: g.name, parent, pivot: fromBB(g.origin), rotation: [-g.rotation[0], -g.rotation[1], g.rotation[2]], cubes: [] };
      bones.push(b);
      if (g.geoui && g.geoui.type) elements[g.name] = Object.assign({}, g.geoui);
      for (const c of g.children) {
        if (c instanceof Group) walk(c, g.name);
        else if (c instanceof Cube) {
          if (c.export === false) continue;
          if (c.inflate) warnings.push(`${c.name}: inflate は書き出しません`);
          const size = c.size(), cube = { origin: [-(c.from[0] + size[0]), c.from[1], c.from[2]], size: size.slice(), faces: {} };
          if (c.rotation.some((v) => v)) { cube.pivot = fromBB(c.origin); cube.rotation = [-c.rotation[0], -c.rotation[1], c.rotation[2]]; }
          for (const key of ['north', 'south', 'east', 'west', 'up', 'down']) { const f = faceOf(c, key); if (f) cube.faces[key] = f; }
          b.cubes.push(cube);
        } else if (c.type) warnings.push(`${c.name}: ${c.type} は書き出しません（キューブだけ）`);
      }
    };
    for (const n of Outliner.root) {
      if (n instanceof Group) walk(n, undefined);
      else if (n instanceof Cube) warnings.push(`${n.name}: ボーンの外のキューブは書き出しません（${G.ROOT} の中へ）`);
    }
    // numbers: their digits (most significant first) and numerals
    for (const [name, el] of Object.entries(elements)) {
      if (el.type !== 'number') continue;
      const g = Group.all.find((x) => x.name === name), digits = [];
      g.forEachChild((d) => {
        if (!(d instanceof Group) || !d.geoui || d.geoui.role !== 'digit') return;
        const numerals = [];
        d.forEachChild((n) => { if (n instanceof Group && n.geoui && n.geoui.role === 'numeral') numerals[n.geoui.value] = n.name; }, Group, true);
        digits[d.geoui.index] = numerals;
      }, Group, true);
      el.number = Object.assign({}, el.number, { digits: digits.filter(Boolean) });
    }
    for (const t of Texture.all) textures[t.uuid] = { name: t.name.replace(/\.png$/i, ''), width: t.uv_width, height: t.uv_height, uvWidth: t.uv_width, uvHeight: t.uv_height, png: t.getBase64() };
    const animations = [], codec = Format.animation_codec || (Formats.bedrock && Formats.bedrock.animation_codec);
    for (const a of Animation.all) if (a.name !== PREVIEW_NAME() && codec) animations.push({ name: a.name, json: codec.compileAnimation(a) });
    return { settings: S, bones, elements, textures, animations, seed: Project.uuid || '', warnings };
  }
  /** the pack: GeoUICore's, and the timeline's RP and BP when the project has sequences (o.timeline false: the layout alone —
   *  what the preview needs) */
  function build(o = {}) {
    const d = design(), built = G.buildPack(d);
    built.warnings = [...d.warnings, ...built.warnings];
    if (state.bridge && o.timeline !== false) state.bridge.extend(built, d);
    return built;
  }
  async function zip(built, type = 'blob') {
    const z = new JSZip();
    for (const [p, c] of Object.entries(built.files)) { if (c && c.base64 !== undefined) z.file(p, c.base64, { base64: true }); else z.file(p, c); }
    return z.generateAsync({ type, compression: 'DEFLATE' });
  }
  async function exportAddon() {
    packUuids();
    const S0 = settings();
    if (S0.autoBump && S0.exported > 0) setSettings({ version: [S0.version[0], S0.version[1], S0.version[2] + 1] });
    const built = build(), go = async () => {
      setSettings({ exported: settings().exported + 1 });
      const blob = await zip(built);
      Blockbench.export({ resource_id: 'geoui', type: 'Minecraft Add-On', extensions: ['mcaddon'], name: `${built.settings.ns}.mcaddon`, content: blob, savetype: 'zip' },
        () => say('GeoUI のアドオンを書き出しました'));
    };
    if (!built.warnings.length) return go();
    new Dialog({ id: 'geoui_export_warnings', title: 'GeoUI: 書き出す前に', lines: built.warnings.map((w) => `<p>⚠ ${escape(w)}</p>`).concat(built.report.map((r) => `<p class="geoui_note">${escape(r)}</p>`)),
      buttons: ['このまま書き出す', 'やめる'], onConfirm: go }).show();
  }
  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- preview: the export's own Molang, run by Blockbench
  /** the pre_animation and the properties as Variable Placeholders (Blockbench runs them for the animation) */
  function placeholders(built, o = {}) {
    const S = built.settings, ns = S.ns, R = G.PROP_RANGES(S), lines = ['# GeoUI Builder: the properties (edit the numbers) and the pre_animation of the export'];
    const fix = S.centerFix[o.platform || S.previewPlatform] || S.centerFix.desktop;
    const val = { aspect: Math.round(G.qa(o.aspect || S.previewAspect) * 1000), cx: Math.round(fix.x * 10000), cy: Math.round(fix.y * 10000) };
    for (const k of Object.keys(R)) {
      const v = o.props && o.props[`${ns}:${k}`] != null ? o.props[`${ns}:${k}`] : val[k] != null ? val[k] : R[k][2];
      lines.push(/^v\d$/.test(k) && !(o.props && o.props[`${ns}:${k}`] != null) ? `q.property('${ns}:${k}') = slider('${k}', 1, ${R[k][0]}, ${R[k][1]})` : `q.property('${ns}:${k}') = ${v}`);
    }
    for (const l of built.pre) lines.push(l.replace(/;\s*$/, ''));
    return lines.join('\n');
  }
  function preview(o = {}) {
    if (!isGeo()) return say('GeoUI のプロジェクトではありません', 'error');
    if (o.aspect || o.platform) setSettings({ previewAspect: o.aspect || settings().previewAspect, previewPlatform: o.platform || settings().previewPlatform });
    const built = build({ timeline: false }), name = PREVIEW_NAME(), codec = AnimationCodecOf();
    for (const a of Animation.all.filter((x) => x.name === name)) a.remove(false, false);
    const [anim] = codec.loadFile({ json: { format_version: '1.8.0', animations: { [name]: built.animation } }, path: '' }, [name]);
    const text = placeholders(built, o), vue = Interface.Panels.variable_placeholders && Interface.Panels.variable_placeholders.inside_vue;
    Project.variable_placeholders = text;
    if (vue) { vue.text = text; if (typeof vue.updateButtons === 'function') vue.updateButtons(); }
    // (the panel's watcher parses the text on Vue's next tick: done here at once, the same way, so the preview is right now)
    Animator.global_variable_lines = {};
    for (const line of text.split('\n')) {
      const [key, val] = line.split(/=\s*(.+)/);
      if (val === undefined) continue;
      Animator.global_variable_lines[key.replace(/[\s;]/g, '').replace(/^v\./, 'variable.').replace(/^q\./, 'query.').replace(/^t\./, 'temp.').replace(/^c\./, 'context.')] = val.trim();
    }
    if (!Modes.animate && Modes.options.animate) Modes.options.animate.select();
    syncNumerals();
    if (anim) anim.select();
    if (vue && o.props) for (const b of vue.buttons) { const k = `${built.settings.ns}:${b.id}`; if (o.props[k] != null) b.value = o.props[k]; }
    Animator.preview();
    refreshOverlay();
    return anim;
  }
  const AnimationCodecOf = () => Format.animation_codec || Formats.bedrock.animation_codec;

  // ---------------------------------------------------------------- the screen frame in the viewport
  function frame() {
    const S = settings(), previewing = Modes.animate && Animation.selected && Animation.selected.name === PREVIEW_NAME();
    return { S, previewing, now: previewing ? G.screenAt(S, S.previewAspect, S.previewPlatform) : G.screenAt(Object.assign({}, S, { centerFix: { desktop: { x: 0, y: 0 } } }), S.refAspect, 'desktop'),
      ref: G.screenAt(Object.assign({}, S, { centerFix: { desktop: { x: 0, y: 0 } } }), S.refAspect, 'desktop') };
  }
  function refreshOverlay() {
    const host = typeof scene !== 'undefined' ? scene : (Canvas && Canvas.scene);
    if (!host || typeof THREE === 'undefined') return;
    if (!state.overlay) { state.overlay = new THREE.Group(); state.overlay.name = 'geoui_frame'; host.add(state.overlay); }
    const o = state.overlay;
    while (o.children.length) { const c = o.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
    o.visible = !!isGeo();
    if (!o.visible) return;
    const { now, ref, previewing } = frame(), z = -3;
    const lines = (pts, color, opacity = 1) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...toBB([p[0], p[1], z]))));
      const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
      m.renderOrder = 999; o.add(m);
    };
    const rect = (s) => [[s.left, s.bottom], [s.right, s.bottom], [s.right, s.bottom], [s.right, s.top], [s.right, s.top], [s.left, s.top], [s.left, s.top], [s.left, s.bottom]];
    lines(rect(now), 0x35c4ff);
    const c = [(now.left + now.right) / 2, (now.top + now.bottom) / 2], k = now.halfH * 0.04;
    lines([[c[0] - k, c[1]], [c[0] + k, c[1]], [c[0], c[1] - k], [c[0], c[1] + k]], 0x35c4ff, 0.8);
    if (previewing && Math.abs(now.aspect - ref.aspect) > 1e-6) lines(rect(Object.assign({}, ref, { left: ref.left + now.cx, right: ref.right + now.cx, top: ref.top + (now.cy - G.PIVOT_Y), bottom: ref.bottom + (now.cy - G.PIVOT_Y) })), 0xffb000, 0.45);
  }
  /** an orthographic camera looking at the screen the way the HUD renderer does (from the north, +x to the right) */
  function view() {
    const { now } = frame(), p = Preview.selected;
    if (!p) return;
    const cy = (now.top + now.bottom) / 2, cx = (now.left + now.right) / 2;
    const zoom = Math.min(p.height / (40 * (now.top - now.bottom) * 1.08), p.width / (40 * (now.right - now.left) * 1.08));
    p.loadAnglePreset({ projection: 'orthographic', position: toBB([cx, cy, -600]), target: toBB([cx, cy, 0]), zoom });
  }

  // ---------------------------------------------------------------- dialogs
  const CALIB_OPTIONS = () => Object.assign({}, G.CALIBRATIONS);
  function settingsDialog() {
    const S = settings(), dev = Object.fromEntries(G.DEVICES.map((d) => [String(G.qa(d.aspect)), `${d.label}（${G.qa(d.aspect)}）`]));
    const cf = S.centerFix;
    new Dialog({
      id: 'geoui_settings', title: 'GeoUI: 画面と書き出しの設定', width: 640,
      form: {
        ns: { label: '名前空間（プロパティ・ファイル名）', type: 'text', value: S.ns },
        name: { label: 'パックの名前', type: 'text', value: S.name },
        description: { label: 'パックの説明', type: 'text', value: S.description },
        _s1: '_',
        calibration: { label: '画面の高さ・中心の値', type: 'select', options: CALIB_OPTIONS(), value: S.calibration, description: `実機で測った値: ${G.MEASURED.ref}。HUD の枠を変えても、画面の高さと中心がそれに合わせて決まる（下の 2 つの欄は使わない）` },
        unitsPerScreenH: { label: '画面の高さ（モデル単位）', type: 'number', value: S.unitsPerScreenH, min: 1, step: 0.01, description: `GeoUI Studio v10.1 は 176（実機の報告から決めた値）。本物のアプリで測った値があれば入れる` },
        refAspect: { label: '作る画面の比（基準）', type: 'select', options: Object.assign({ [String(S.refAspect)]: String(S.refAspect) }, dev), value: String(S.refAspect) },
        previewAspect: { label: 'プレビューの画面比', type: 'select', options: Object.assign({ [String(S.previewAspect)]: String(S.previewAspect) }, dev), value: String(S.previewAspect) },
        previewPlatform: { label: 'プレビューの端末（中心のずれ）', type: 'select', options: { desktop: 'PC', mobile: 'スマホ', console: 'ゲーム機' }, value: S.previewPlatform },
        cfDesktop: { label: '中心のずれ PC（画面の高さに対する割合 x, y）', type: 'vector', dimensions: 2, value: [cf.desktop.x, cf.desktop.y], step: 0.0001 },
        cfMobile: { label: '中心のずれ スマホ', type: 'vector', dimensions: 2, value: [cf.mobile.x, cf.mobile.y], step: 0.0001 },
        cfConsole: { label: '中心のずれ ゲーム機', type: 'vector', dimensions: 2, value: [cf.console.x, cf.console.y], step: 0.0001 },
        _s2: '_',
        panelSize: { label: 'HUD の枠の大きさ（% 幅・高さ）', type: 'vector', dimensions: 2, value: S.panel.size, step: 0.1 },
        panelOffset: { label: 'HUD の枠の位置（% 横・上から）', type: 'vector', dimensions: 2, value: S.panel.offset, step: 0.1 },
        hud: { label: 'HUD への足し方', type: 'select', options: { insert: 'root_panel に足す（hud_content はそのまま）', studio: 'Studio と同じ（hud_content を置き換える）' }, value: S.hud },
        hideInPaperdoll: { label: 'ポーズ画面の人形には出さない', type: 'checkbox', value: S.hideInPaperdoll },
        followHud: { label: 'HUD を隠すと一緒に隠す', type: 'checkbox', value: S.followHud },
        filter: { label: 'テクスチャの補間', type: 'select', options: { Point: 'Point（ドット）', Bilinear: 'Bilinear（なめらか）' }, value: S.filter },
        bp: { label: 'ビヘイビアパックも作る（画面比・中心を端末ごとに・値をコマンドで）', type: 'checkbox', value: S.bp },
      },
      onConfirm(r) {
        const old = settings().unitsPerScreenH;
        // (the same calibration kept, its numbers typed over: the person's own numbers — 'manual'. Another one chosen: its numbers)
        const typed = Math.abs(G.num(r.unitsPerScreenH) - S.unitsPerScreenH) > 1e-6
          || [['desktop', r.cfDesktop], ['mobile', r.cfMobile], ['console', r.cfConsole]].some(([k, v]) => Math.abs(G.num(v[0]) - cf[k].x) > 1e-6 || Math.abs(G.num(v[1]) - cf[k].y) > 1e-6);
        const calibration = r.calibration === S.calibration && typed ? 'manual' : r.calibration;
        setSettings({
          ns: r.ns, name: r.name, description: r.description, calibration, unitsPerScreenH: r.unitsPerScreenH, refAspect: +r.refAspect, previewAspect: +r.previewAspect, previewPlatform: r.previewPlatform,
          centerFix: { desktop: { x: r.cfDesktop[0], y: r.cfDesktop[1] }, mobile: { x: r.cfMobile[0], y: r.cfMobile[1] }, console: { x: r.cfConsole[0], y: r.cfConsole[1] } },
          panel: { size: r.panelSize, offset: r.panelOffset }, hud: r.hud, hideInPaperdoll: r.hideInPaperdoll, followHud: r.followHud, filter: r.filter, bp: r.bp,
        });
        const now = settings().unitsPerScreenH;
        if (Math.abs(now - old) > 1e-9 && Cube.all.length) Blockbench.showMessageBox({ title: 'GeoUI', message: `画面の高さが ${old} → ${now} になりました。置いた UI も同じ比率で拡大縮小しますか？`, buttons: ['する', 'しない'] }, (b) => { if (b === 0) rescale(now / old); });
        if (Modes.animate) preview(); else refreshOverlay();
      },
    }).show();
  }
  function elementDialog() {
    const g = elementOf(Group.first_selected || (Outliner.selected && Outliner.selected[0]));
    if (!g) return say('GeoUI の要素（画像・数字・ゲージ）のボーンを選んでください', 'error');
    const m = Object.assign({}, g.geoui), S = settings(), b = boxOf(g), pads = b ? G.padsOf(S, b, m.anchor) : { x: 0, y: 0 };
    const form = {
      _info: { type: 'info', text: `${g.name}（${{ image: '画像', number: '数字', gauge: 'ゲージ' }[m.type]}）: 今の位置の余白 x ${G.r3(pads.x)} / y ${G.r3(pads.y)} 単位` },
      anchor: { label: '寄せる先（画面比が変わっても、この辺からの距離を保つ）', type: 'select', options: Object.fromEntries(G.ANCHORS.map((a) => [a, a])), value: m.anchor || 'center' },
      move: { label: '寄せる先へ動かす（下の余白で）', type: 'checkbox', value: false },
      padX: { label: '横の余白（単位）', type: 'number', value: G.r3(pads.x), step: 0.1 },
      padY: { label: '縦の余白（単位）', type: 'number', value: G.r3(pads.y), step: 0.1 },
      blend: { label: '重ね方', type: 'select', options: { cutout: 'cutout（くり抜き）', blend: 'blend（半透明）', add: 'add（加算）' }, value: m.blend || 'cutout' },
      visible: { label: '表示の条件（Molang。空なら常に）', type: 'text', value: m.visible || '' },
    };
    if (m.type === 'gauge') Object.assign(form, {
      source: { label: '値（Molang）', type: 'text', value: (m.gauge || {}).source || '' },
      max: { label: '満タンの値', type: 'number', value: G.num((m.gauge || {}).max, 100) },
      fill: { label: '伸びる向き（中心は Studio のひな形と同じ縮み方）', type: 'select', options: { left: '左から', right: '右から', bottom: '下から', top: '上から', center: '中心から' }, value: (m.gauge || {}).fill || 'left' },
    });
    if (m.type === 'number') Object.assign(form, {
      source: { label: '値（Molang）', type: 'text', value: (m.number || {}).source || '' },
      hideLeadingZero: { label: '頭の 0 を出さない', type: 'checkbox', value: (m.number || {}).hideLeadingZero !== false },
    });
    new Dialog({
      id: 'geoui_element', title: 'GeoUI: 要素の設定', width: 560, form,
      onConfirm(r) {
        for (const [what, src] of [['表示の条件', r.visible], ['値', r.source]]) { const why = src && G.molangError(src); if (why) { say(`${what}が読めません: ${why}`, 'error'); return false; } }
        const meta = Object.assign({}, g.geoui, { anchor: r.anchor, blend: r.blend, visible: r.visible });
        if (m.type === 'gauge') {
          meta.gauge = { source: r.source, max: r.max, fill: r.fill };
          const bx = boxOf(g);
          if (bx && r.fill !== (m.gauge || {}).fill) { Undo.initEdit({ outliner: true }); const p = fromBB(g.origin); g.origin = toBB([r.fill === 'left' ? bx.x0 : r.fill === 'right' ? bx.x1 : (bx.x0 + bx.x1) / 2, r.fill === 'bottom' ? bx.y0 : r.fill === 'top' ? bx.y1 : (bx.y0 + bx.y1) / 2, p[2]]); Undo.finishEdit('GeoUI: ゲージの向き', { outliner: true }); }
        }
        if (m.type === 'number') meta.number = Object.assign({}, m.number, { source: r.source, hideLeadingZero: r.hideLeadingZero });
        g.geoui = meta; Project.saved = false;
        if (r.move) align(g, r.anchor, r.padX, r.padY);
        if (Modes.animate) preview();
      },
    }).show();
  }
  function addDialog(kind) {
    const S = settings(), base = {
      name: { label: '名前', type: 'text', value: kind },
      anchor: { label: '寄せる先', type: 'select', options: Object.fromEntries(G.ANCHORS.map((a) => [a, a])), value: kind === 'image' ? 'center' : 'top_left' },
      padX: { label: '横の余白（単位）', type: 'number', value: kind === 'image' ? 0 : 1.2, step: 0.1 },
      padY: { label: '縦の余白（単位）', type: 'number', value: kind === 'gauge' ? 4.4 : kind === 'image' ? 0 : 1.2, step: 0.1 },
    };
    const extra = {
      image: { file: { label: '画像（PNG）', type: 'file', extensions: ['png'], readtype: 'image' }, heightPct: { label: '高さ（画面の高さの %）', type: 'number', value: 30, step: 0.1 },
        blend: { label: '重ね方', type: 'select', options: { cutout: 'cutout', blend: 'blend', add: 'add' }, value: 'cutout' } },
      number: { digits: { label: '桁数', type: 'number', value: 5, min: 1, max: 9 }, source: { label: '値（Molang）', type: 'text', value: `q.property('${S.ns}:v0')` }, heightPct: { label: '高さ（%）', type: 'number', value: 9, step: 0.1 } },
      gauge: { source: { label: '値（Molang）', type: 'text', value: `q.property('${S.ns}:v1')` }, max: { label: '満タンの値', type: 'number', value: 20 },
        fill: { label: '伸びる向き', type: 'select', options: { left: '左から', right: '右から', bottom: '下から', top: '上から', center: '中心から（Studio のひな形）' }, value: 'left' },
        widthPct: { label: '幅（%）', type: 'number', value: 34, step: 0.1 }, heightPct: { label: '高さ（%）', type: 'number', value: 2.5, step: 0.1 } },
    }[kind];
    new Dialog({
      id: `geoui_add_${kind}`, title: { image: 'GeoUI: 画像を足す', number: 'GeoUI: 数字を足す', gauge: 'GeoUI: ゲージを足す' }[kind], width: 520, form: Object.assign({}, base, extra),
      async onConfirm(r) {
        if (!isGeo()) newGeoProject();
        if (r.source && G.molangError(r.source)) { say(`値が読めません: ${G.molangError(r.source)}`, 'error'); return false; }
        if (kind === 'image') { if (!r.file) { say('画像を選んでください', 'error'); return false; } await addImage(Object.assign({}, r, { dataUrl: r.file })); }
        if (kind === 'number') await addNumber(r);
        if (kind === 'gauge') await addGauge(r);
      },
    }).show();
  }
  function checkDialog() {
    const built = build(), S = built.settings, lines = [...built.report.map(escape)];
    for (const w of built.warnings) lines.push(`⚠ ${escape(w)}`);
    for (const d of G.DEVICES) for (const pl of ['desktop', 'mobile']) {
      const L = G.layoutOf(built, { aspect: d.aspect, platform: pl }), sc = G.screenAt(S, d.aspect, pl), out = new Set();
      for (const q of L.quads) if (!q.hidden && (q.quad.x0 < sc.left - 1e-6 || q.quad.x1 > sc.right + 1e-6 || q.quad.y0 < sc.bottom - 1e-6 || q.quad.y1 > sc.top + 1e-6)) out.add(q.bone);
      if (out.size) lines.push(`${escape(d.label)} ${pl === 'desktop' ? 'PC' : 'スマホ'}: 画面の外にはみ出す — ${[...out].slice(0, 6).map(escape).join(', ')}${out.size > 6 ? ' …' : ''}`);
    }
    if (lines.length === built.report.length) lines.push('✔ どの画面比でも、どの要素も画面の中に収まります（画面の高さ・中心のずれは今の設定の値で）');
    new Dialog({ id: 'geoui_check', title: 'GeoUI: 確かめる', lines: lines.map((l) => `<p>${l}</p>`), buttons: ['OK'], width: 640 }).show();
  }
  const newUuid = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : G.uuidFrom(`${Date.now()}:${Math.random()}`));
  function packUuids() {
    const S = settings();
    if (!S.uuids) setSettings({ uuids: { rp: newUuid(), rpMod: newUuid(), bp: newUuid(), bpData: newUuid(), bpScript: newUuid() } });
    return settings().uuids;
  }
  function newGeoProject() {
    if (!newProject(state.format)) return false;
    Project.geoui_settings = G.newProjectSettings();
    packUuids();
    ensureRoot();
    Canvas.updateAll();
    refreshOverlay();
    setTimeout(view, 50);
    return true;
  }

  // ---------------------------------------------------------------- registration
  function setup() {
    state.props.push(new Property(ModelProject, 'object', 'geoui_settings', { default: undefined }));
    state.props.push(new Property(Group, 'object', 'geoui', { default: undefined }));
    state.format = new ModelFormat(FORMAT_ID, {
      name: 'GeoUI（統合版の HUD に描く UI）', description: 'live_player_renderer で HUD に描く 2D UI（GeoUI）。GeoUI Studio と同じ式で書き出す',
      icon: 'dashboard', category: 'minecraft', target: 'Minecraft: Bedrock Edition',
      rotate_cubes: true, box_uv: false, optional_box_uv: false, single_texture: false, per_texture_uv_size: true, uv_rotation: true,
      bone_rig: true, centered_grid: true, animation_mode: true, molang: true, locators: false,
      animation_codec: Formats.bedrock && Formats.bedrock.animation_codec,
      node_name_regex: '\\w.-',
      onSetup(project, newModel) { if (newModel) project.geoui_settings = G.newProjectSettings(); },
      onActivation() { setTimeout(refreshOverlay, 0); },
      onDeactivation() { setTimeout(refreshOverlay, 0); },
    });
    const A = (id, o) => { const a = new Action(id, o); state.actions.push(a); return a; };
    A('geoui_new', { name: '新しい GeoUI プロジェクト', icon: 'add_box', click: newGeoProject });
    A('geoui_settings', { name: '画面と書き出しの設定…', icon: 'tune', condition: isGeo, click: settingsDialog });
    A('geoui_add_image', { name: '画像を足す…', icon: 'image', click: () => addDialog('image') });
    A('geoui_add_number', { name: '数字を足す…', icon: 'pin', click: () => addDialog('number') });
    A('geoui_add_gauge', { name: 'ゲージを足す…', icon: 'linear_scale', click: () => addDialog('gauge') });
    A('geoui_element', { name: '選んだ要素の設定（寄せ先・値・条件）…', icon: 'settings', condition: isGeo, click: elementDialog });
    A('geoui_view', { name: '画面を正面から見る', icon: 'crop_free', condition: isGeo, click: view });
    A('geoui_preview', { name: 'プレビュー（書き出す式をそのまま動かす）', icon: 'play_circle', condition: isGeo, click: () => { preview(); view(); } });
    A('geoui_check', { name: 'はみ出し・式を確かめる…', icon: 'fact_check', condition: isGeo, click: checkDialog });
    A('geoui_export', { name: 'アドオンを書き出す（.mcaddon）', icon: 'file_download', condition: isGeo, click: exportAddon });
    // (the timeline — bds/geoui/timeline/, bundled before this file in dist/geoui_builder.js: its panels, preview and export)
    const TL = window.GeoUITimeline;
    if (TL && TL.bridge) {
      try {
        state.bridge = TL.bridge.install({ G, isGeo, settings, elementOf, boxOf, preview, frame, toBB, fromBB, say, addImage, addNumber, view,
          setFrameVisible: (v) => { if (state.overlay) state.overlay.visible = !!v && !!isGeo(); } });
      } catch (e) { console.error(e); say(`GeoUI のタイムラインを読み込めません: ${e.message || e}`, 'error'); }
    }
    state.menu = new BarMenu('geoui', ['geoui_new', 'geoui_settings', '_', 'geoui_add_image', 'geoui_add_number', 'geoui_add_gauge', 'geoui_element', '_',
      'geoui_view', 'geoui_preview', 'geoui_check', '_', 'geoui_export', ...(state.bridge ? ['_', ...state.bridge.actions] : [])], { name: 'GeoUI', icon: 'dashboard' });
    MenuBar.update();
    const on = (ev, f) => { Blockbench.on(ev, f); state.listeners.push([ev, f]); };
    for (const ev of ['select_project', 'unselect_project', 'select_mode', 'select_animation', 'finished_edit']) on(ev, () => setTimeout(() => { syncNumerals(); refreshOverlay(); }, 0));
    window.GeoUIBuilder = { core: G, settings, setSettings, newProject: newGeoProject, addImage, addNumber, addGauge, align, rescale, elementOf, boxOf,
      design, build, zip, exportAddon, preview, placeholders, view, refreshOverlay, frame, packUuids, syncNumerals, timeline: state.bridge || null };
    refreshOverlay();
  }
  function teardown() {
    if (state.bridge) { try { state.bridge.uninstall(); } catch (e) { console.error(e); } state.bridge = null; delete window.GeoUITimeline; }
    for (const [ev, f] of state.listeners) Blockbench.removeListener(ev, f);
    for (const a of state.actions) a.delete();
    if (state.menu) state.menu.delete();
    MenuBar.update();
    if (state.overlay && state.overlay.parent) state.overlay.parent.remove(state.overlay);
    if (state.format) state.format.delete();
    for (const p of state.props) p.delete();
    delete window.GeoUIBuilder;
  }

  BBPlugin.register('geoui_builder', {
    title: 'GeoUI Builder',
    author: 'bds-lab',
    icon: 'dashboard',
    version: G.VERSION,
    variant: 'both',
    min_version: '5.0.0',
    tags: ['Minecraft: Bedrock Edition', 'UI'],
    description: 'Build GeoUI (2D UI drawn on the HUD by live_player_renderer) for Minecraft Bedrock, with GeoUI Studio\'s layout formulas.',
    about: 'GeoUI → 新しい GeoUI プロジェクト。画像・数字・ゲージを足し、寄せ先（左上など）を決め、プレビューで画面比を変えて確かめ、アドオンを書き出す。'
      + '画面の高さ（176 単位）・中心のずれは GeoUI Studio v10.1 の値を初期値に、設定で変えられる（本物のアプリで測った値に）。',
    onload: setup,
    onunload: teardown,
  });
})();
