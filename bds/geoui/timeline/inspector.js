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
