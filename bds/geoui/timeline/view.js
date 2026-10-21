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
