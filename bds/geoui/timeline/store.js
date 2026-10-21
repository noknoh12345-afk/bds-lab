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
