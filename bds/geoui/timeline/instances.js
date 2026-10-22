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
