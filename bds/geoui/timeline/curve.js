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
