// GeoUI Screen — spatial navigation (pure): which element a direction moves the focus to, the way a TV remote or a game pad
// moves it — better than Tab's one-dimensional order. The direction is any vector, not only four: W+D at once goes up-right,
// a stick half-way is the angle it points at. When two elements are about as good (the ambiguous case), the one nearer to
// where the player looks (the pointer) wins, then the one nearer the focus's own row or column, then the document's order.
// hintsFor() gives where each of the four keys would go from the focus, so the page can show it before the key is pressed.
//
// targets: [{ id, rect: { x, y, w, h } (y down), disabled?, group? (a container: moves stay in it while it has a candidate) }]
(function (root) {
  'use strict';
  const S = root.GeoUIScreen = root.GeoUIScreen || {};
  const DIRS = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });
  const KEYS = Object.freeze({ W: 'up', A: 'left', S: 'down', D: 'right' });
  const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];

  /** how far apart two intervals are along an axis (0 when they overlap) and how much they overlap */
  function gap(a0, a1, b0, b1) { return { gap: Math.max(0, b0 - a1, a0 - b1), overlap: Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) }; }

  /** the score of moving from rect A to rect B in direction d (unit vector), lower is better; null when B is not that way.
   *  Four-way (an axis): B must start past A's middle that way; the distance is from A's edge to B's near edge along d, plus
   *  twice the sideways distance between them (0 when they share a row/column), less a little for the share of overlap.
   *  Any other way (diagonal, a stick's angle): from centre to centre, B within 60° of d, the sideways part counted 1.5 times */
  function score(A, B, d, opts = {}) {
    const ca = center(A), cb = center(B), v = [cb[0] - ca[0], cb[1] - ca[1]];
    const along = v[0] * d[0] + v[1] * d[1];
    const axis = Math.abs(d[0]) < 1e-9 ? 'y' : Math.abs(d[1]) < 1e-9 ? 'x' : null;
    const eps = opts.eps ?? 0.5;
    if (axis) {
      const s = axis === 'x' ? Math.sign(d[0]) : Math.sign(d[1]);
      // (past A's middle, and not wholly behind A's far edge: a big container's child that starts before A is still that way)
      const aMid = axis === 'x' ? ca[0] : ca[1], bNear = axis === 'x' ? (s > 0 ? B.x : B.x + B.w) : (s > 0 ? B.y : B.y + B.h);
      const bMid = axis === 'x' ? cb[0] : cb[1];
      if ((bMid - aMid) * s <= eps) return null;
      const aEdge = axis === 'x' ? (s > 0 ? A.x + A.w : A.x) : (s > 0 ? A.y + A.h : A.y);
      const dist = Math.max(0, (bNear - aEdge) * s);
      const side = axis === 'x' ? gap(A.y, A.y + A.h, B.y, B.y + B.h) : gap(A.x, A.x + A.w, B.x, B.x + B.w);
      const span = axis === 'x' ? Math.min(A.h, B.h) : Math.min(A.w, B.w);
      const share = span > 0 ? side.overlap / span : 0;
      return { score: dist + 2 * side.gap - 0.5 * share * Math.min(10, dist + 1), along: dist, side: side.gap, share };
    }
    if (along <= eps) return null;
    const side = Math.abs(v[0] * d[1] - v[1] * d[0]);
    if (Math.atan2(side, along) > (opts.cone ?? Math.PI / 3)) return null;
    return { score: along + 1.5 * side, along, side, share: 0 };
  }

  /** a unit direction from a name, a key, or a vector ([x, y], y down); null for a zero vector */
  function dirOf(d) {
    if (typeof d === 'string') { const n = KEYS[d.toUpperCase()] || d.toLowerCase(); if (!DIRS[n]) throw new Error(`向き「${d}」は up down left right W A S D`); return DIRS[n]; }
    const x = Number(d && d[0]) || 0, y = Number(d && d[1]) || 0, l = Math.hypot(x, y);
    if (l < 1e-9) return null;
    // (a vector within 15° of an axis is that axis: a stick a little off, or W with a touch of D, still goes straight)
    const a = Math.atan2(y, x), k = Math.round(a / (Math.PI / 2));
    if (Math.abs(a - k * Math.PI / 2) < Math.PI / 12) return [[1, 0], [0, 1], [-1, 0], [0, -1]][((k % 4) + 4) % 4];
    return [x / l, y / l];
  }

  /** the element the focus moves to from `from` (an id) in direction `dir`, or null. opts.pointer [x, y]: where the player looks
   *  (the tie-break); opts.tie: scores within this are a tie (units, default 2); opts.wrap: 'none' | 'line' (past the last one
   *  of a row/column, the first one of the next: Tab-like) */
  function navigate(targets, from, dir, opts = {}) {
    const d = dirOf(dir);
    if (!d) return null;
    const list = targets.filter((t) => !t.disabled && t.rect);
    const A = list.find((t) => t.id === from);
    if (!A) return list.length ? first(list, opts.pointer) : null;
    const scored = [];
    list.forEach((t, i) => { if (t.id === from) return; const s = score(A.rect, t.rect, d, opts); if (s) scored.push({ t, i, s }); });
    // (a container first: while one in the focus's own group is that way, the others wait)
    const same = A.group ? scored.filter((c) => c.t.group === A.group) : [];
    const pool = same.length ? same : scored;
    if (!pool.length) return opts.wrap === 'line' ? wrapLine(list, A, d) : null;
    pool.sort((a, b) => a.s.score - b.s.score);
    const best = pool[0].s.score, tie = opts.tie ?? 2;
    const tied = pool.filter((c) => c.s.score - best <= tie);
    if (tied.length > 1) {
      const p = opts.pointer;
      tied.sort((a, b) => (p ? dist2(center(a.t.rect), p) - dist2(center(b.t.rect), p) : 0) || (a.s.side - b.s.side) || (a.i - b.i));
    }
    return tied[0].t.id;
  }
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  /** the first focus: the one under the pointer, else nearest to it, else the first in the document */
  function first(list, p) {
    if (!list.length) return null;
    if (!p) return list[0].id;
    const under = list.find((t) => p[0] >= t.rect.x && p[0] <= t.rect.x + t.rect.w && p[1] >= t.rect.y && p[1] <= t.rect.y + t.rect.h);
    if (under) return under.id;
    return list.slice().sort((a, b) => dist2(center(a.rect), p) - dist2(center(b.rect), p))[0].id;
  }
  /** Tab-like wrap: past the end of a row (moving right) the first of the next row down; past a column's end, the next column */
  function wrapLine(list, A, d) {
    const ca = center(A.rect), horizontal = Math.abs(d[0]) > Math.abs(d[1]), s = horizontal ? Math.sign(d[0]) : Math.sign(d[1]);
    const key = (t) => { const c = center(t.rect); return horizontal ? [c[1], c[0] * s] : [c[0], c[1] * s]; };
    const me = key(A);
    const next = list.filter((t) => t !== A).map((t) => ({ t, k: key(t) }))
      .filter((o) => (horizontal ? o.k[0] > ca[1] + 1 : o.k[0] > ca[0] + 1) === (s > 0)).sort((a, b) => (a.k[0] - b.k[0]) * s || a.k[1] - b.k[1]);
    return next.length ? next[0].t.id : (me ? null : null);
  }
  /** where each of W A S D would go from the focus (null where nothing is) — what the page draws as hints */
  function hintsFor(targets, from, opts = {}) {
    const out = {};
    for (const [k, n] of Object.entries(KEYS)) out[k] = navigate(targets, from, DIRS[n], opts);
    return out;
  }
  /** the element under a point (the topmost: the last in the list), or null */
  function hit(targets, p) {
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i], r = t.rect;
      if (!t.disabled && r && p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h) return t.id;
    }
    return null;
  }

  S.nav = { DIRS, KEYS, dirOf, score, navigate, hintsFor, hit, first };
  if (typeof module === 'object' && module && module.exports) module.exports = S.nav;
})(typeof globalThis !== 'undefined' ? globalThis : this);
