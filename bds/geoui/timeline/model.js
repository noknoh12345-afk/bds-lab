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
