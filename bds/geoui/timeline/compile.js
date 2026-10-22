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
  function exprM(src, vars, tVar) {
    const tk = String(src).match(/\d+(?:\.\d+)?|\.\d+|[A-Za-z_][\w.]*|[-+*/(),]|\S/g) || [];
    return `(${tk.map((t) => { const m = /^(?:param|p)\.(\w+)$/.exec(t); return m ? (vars[m[1]] || '0') : t === 't' ? (tVar || '0') : t; }).join(' ')})`;
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
    const ordered = [...clips.filter((c) => c.trigger), ...clips.filter((c) => !c.trigger)];
    for (const c of ordered) {
      const s = valM(c.start, o.vars), e = valM(c.end, o.vars);
      if (c.trigger) {
        if (!o.ev) { report.warnings.push(`trigger（${c.trigger}）はテンプレートの中だけで使えます（${c.id}）`); continue; }
        const start = `${o.ev.t} + ${s}`, end = `${o.ev.t} + ${e}`;
        parts.push({ c, start, end, cut: '0', cond: `(${o.ev.r} == ${code(c.trigger)} && ${o.st} >= ${start} - ${EPS} && ${o.st} < ${end})` });
      } else {
        const start = `${o.zero} + ${s}`, rawEnd = `${o.zero} + ${e}`;
        let end = rawEnd, cut = '0';
        if (c.until && o.ev) { cut = `(${o.ev.r} == ${code(c.until)} && ${o.ev.t} >= ${start} - ${EPS} && ${o.ev.t} < ${rawEnd})`; end = `(${cut} ? ${o.ev.t} : ${rawEnd})`; }
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
    if (has('value')) lines.push(`${P}_v = ${pick((p) => chan(p.c, 'value') || '0', '0')};`, `${P}_vd = ${pick((p) => (chan(p.c, 'value') ? '1' : '0'), '0')};`);
    if (has('fill')) lines.push(`${P}_f = math.clamp(${pick((p) => chan(p.c, 'fill') || '0', '0')}, 0, 1);`, `${P}_fd = ${pick((p) => (chan(p.c, 'fill') ? '1' : '0'), '0')};`);
    if (has('frame')) lines.push(`${P}_fr = ${pick((p) => chan(p.c, 'frame') || '0', '0')};`, `${P}_frd = ${pick((p) => (chan(p.c, 'frame') ? '1' : '0'), '0')};`);
    return { lines, has: { value: has('value'), fill: has('fill'), frame: has('frame'), opacity: parts.some((p) => chan(p.c, 'opacity') || (p.c.transitionIn && p.c.transitionIn.kind === 'fade') || (p.c.transitionOut && p.c.transitionOut.kind === 'fade')), rotation: parts.some((p) => chan(p.c, 'rotation')), instPath: parts.some((p) => own(p.c) && chan(p.c, 'path')) } };
  }

  // ---------------------------------------------------------------------------------------------------------------- the pack
  /** a depth for a cube where no cube of the geometry that overlaps it (seen from the front) lies within 0.02 */
  function freeDepth(geo, cube) {
    const [x0, y0, z0] = cube.origin, x1 = x0 + cube.size[0], y1 = y0 + cube.size[1];
    const near = [];
    for (const b of geo.bones) for (const c of b.cubes || []) {
      const [a0, b0, c0] = c.origin;
      if (a0 < x1 && a0 + c.size[0] > x0 && b0 < y1 && b0 + c.size[1] > y0) near.push(c0, c0 + (c.size[2] || 0));
    }
    for (let k = 1; k < 2000; k++) { const z = Math.round((z0 + 0.021 * k) * 1e4) / 1e4; if (near.every((w) => Math.abs(w - z) >= 0.02)) return z; }
    return z0;
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
    const instAnims = [];   // [{ key, cond, time, bone, keys }]: an instance's own path
    const drive = (bone, kind, i, varName) => { if (!drives.has(bone)) drives.set(bone, { o: [], fr: [], v: [], f: [] }); drives.get(bone)[kind].push([i, varName]); };
    doc.sequences.forEach((seq, si) => {
      const i = si + 1, anim = { loop: true, animation_length: 1, bones: {} }, paths = (id) => (seq.paths || []).find((p) => p.id === id) || null;
      const on = `${V('seq')} == ${i}`, solo = seq.tracks.some((t) => t.solo), seen = new Set(), bind = (bone, Pv, rot) => {
        anim.bones[bone] = Object.assign({ position: [`${Pv}_x`, `${Pv}_y`, 0], scale: [`${Pv}_sx`, `${Pv}_sy`, 1] }, rot ? { rotation: [0, 0, `${Pv}_r`] } : {});
      };
      const add = (bone, Pv, r) => {
        pre.push(...r.lines.map((l) => l.replace(/^(\S+) = (.*);$/, (m0, lhs, rhs) => `${lhs} = ${on} ? (${rhs}) : 0;`)));
        bind(bone, Pv, r.has.rotation);
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
        const r = targetLines(Pv, tr.clips, { st, zero: '0', vars: {}, ev: null, active: '1', paths, hidden: tr.muted || (solo && !tr.solo), report });
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
      const g = parse(files[f]), geo = g['minecraft:geometry'][0], have = new Map(geo.bones.map((b) => [b.name, b]));
      for (const [bone, { of, tag, k }] of clones) {
        if (have.has(bone)) continue;
        const tree = subtree(of);
        if (!have.has(of)) continue;
        for (const name of tree) {
          const src = have.get(name);
          if (!src) continue;
          const copy = parse(src);
          copy.name = `${name}_${tag}${k}`;
          // (a copy moved in depth, 0.02 at a time, until no face it overlaps is within 0.02 of it: never two faces on one plane —
          //  only one of them shows at a time, but two on one plane would flicker if ever they did)
          for (const cube of copy.cubes || []) cube.origin = [cube.origin[0], cube.origin[1], freeDepth(geo, cube)];
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
      for (const [bone, d] of drives) if (d.v.length) {
        const el = (design.elements || {})[bone] || {}, digits = (el.number && Array.isArray(el.number.digits) ? el.number.digits.length : 0), hide = !(el.number && el.number.hideLeadingZero === false);
        for (let k = 0; k < digits; k++) {
          const dv = `v.${ns}_${clean(bone)}_d${k}`, place = Math.pow(10, digits - 1 - k), de = G && G.digitExpr ? G.digitExpr(RCV(bone, 'val'), place, hide) : `math.mod(math.floor(math.abs(${RCV(bone, 'val')})/${place}),10)`;
          digitLines.push(`${dv} = ${RCV(bone, 'vd')} ? ${de} : (${dv} ?? 0);`);
        }
      }
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
    // (the whole pre_animation: bds-lab's geoui_rhythm_big ran with 1109 lines, 906 variables, 200 000 characters; geoui_probe_vc
    //  with 3030 lines and 3023 variables (short lines); geoui_probe_m's 3000 long lines of 577 000 characters left the last of
    //  their variables unset — past what was seen to run, said, to be measured)
    const chars = written.reduce((a, l) => a + l.length, 0), variables = new Set(written.map((l) => (/^\s*((?:v|variable)\.\w+)\s*=/.exec(l) || [])[1]).filter(Boolean)).size;
    if (chars > 210000) warnings.push(`pre_animation が ${Math.round(chars / 1000)} k 文字です（本物のゲームで最後まで動いたのは 20 万文字・1109 行まで。58 万文字では後ろの変数が効かなかった・要実測）: 同時に出る実体（枠）を減らすと小さくなります`);
    if (report.bezier > 0.002) warnings.push(`ベジェのイージングを 16 の折れ線にした誤差: 最大 ${report.bezier.toFixed(4)}`);
    return { files, warnings: [...new Set(warnings)], stats: { bindings, pre: written, slots: slotsOut, longest, deepest, lines: written.length, chars, variables, bezierError: report.bezier, budget, counts } };
  }

  T.compile = { extendPack, easeM, keysM, pathM, pathKeys, exprM, targetLines, searchLines, tableLines, splitLines, maxDepth, mparse };
  if (typeof module === 'object' && module && module.exports) module.exports = T.compile;
})(typeof globalThis !== 'undefined' ? globalThis : this);
