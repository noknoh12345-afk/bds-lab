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
