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
  /** attach(host, store, opts) → { detach, refresh, state }. host: { canvas(), frameRect(), elements(), screen?() → { unitsH,
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
      if (!seq) return null;
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
