// GeoUI timeline — the contract between the pack and the game (pure): which slot (a copy of a template's bones) each instance
// is drawn in, the entity properties the server sets and the client's Molang reads, and how an instance's params fit in one
// of them. compile (RP: Molang), runtime (BP: the script) and the editor's preview all follow this one file.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);

  // ---- packing: an instance's params in one int property. Molang's numbers are float32: integers are exact up to 2^24,
  // so a packed value never uses more than 24 bits. Each field is quantized evenly over [min, max]
  const MAX_BITS = 24;
  const DEFAULT_PACK = Object.freeze([{ name: 'x', bits: 10, min: -200, max: 200 }, { name: 'y', bits: 10, min: -200, max: 200 }, { name: 'v', bits: 4, min: 0, max: 15 }]);
  function checkSpec(spec) {
    if (!Array.isArray(spec) || !spec.length) throw new Error('詰め方（pack）が空です');
    let bits = 0;
    for (const f of spec) {
      if (!f || !/^\w+$/.test(String(f.name))) throw new Error(`詰め方の名前「${f && f.name}」が使えません`);
      if (!(Number.isInteger(f.bits) && f.bits >= 1)) throw new Error(`詰め方「${f.name}」の bits は 1 以上の整数で`);
      if (!(num(f.max, NaN) > num(f.min, NaN))) throw new Error(`詰め方「${f.name}」は max > min で`);
      bits += f.bits;
    }
    if (bits > MAX_BITS) throw new Error(`詰め方が ${bits} bit です（Molang の数で正確なのは ${MAX_BITS} bit まで）`);
    return spec;
  }
  const levels = (f) => 2 ** f.bits - 1;
  /** the quantization step of a field (what a packed value can be off by: half of it) */
  const stepOf = (f) => (f.max - f.min) / levels(f);
  function pack(values, spec = DEFAULT_PACK) {
    checkSpec(spec);
    let n = 0, shift = 0;
    for (const f of spec) {
      const v = Math.min(Math.max(num(values && values[f.name], f.min), f.min), f.max);
      n += Math.round(((v - f.min) / (f.max - f.min)) * levels(f)) * 2 ** shift;
      shift += f.bits;
    }
    return n;
  }
  function unpack(n, spec = DEFAULT_PACK) {
    checkSpec(spec);
    const out = {}; let shift = 0;
    for (const f of spec) { out[f.name] = f.min + ((f.max - f.min) * (Math.floor(num(n) / 2 ** shift) % 2 ** f.bits)) / levels(f); shift += f.bits; }
    return out;
  }
  /** the same unpacking as Molang (expr: the packed number, e.g. q.property('ns:s0p')) → { name: Molang expression } */
  function unpackMolang(expr, spec = DEFAULT_PACK) {
    checkSpec(spec);
    const out = {}; let shift = 0;
    const r = (x) => String(Math.round(x * 1e6) / 1e6);
    for (const f of spec) {
      const field = shift ? `math.mod(math.floor((${expr}) / ${2 ** shift}), ${2 ** f.bits})` : `math.mod(${expr}, ${2 ** f.bits})`;
      out[f.name] = `(${r(f.min)} + ${r(f.max - f.min)} * ${field} / ${levels(f)})`;   // (the same order of operations as unpack)
      shift += f.bits;
    }
    return out;
  }

  // ---- slots: instances drawn by k copies of a template's bones, each copy showing one instance at a time
  /** each instance of a template → a slot, so that no slot shows two at once: [t − lead, t + tail), plus gap seconds between
   *  two in the same slot (the time the game needs to take a slot's new values). Sorted by start and given the first free
   *  slot — as few slots as the most instances out at once. maxSlots: the ones that do not fit are overflow */
  function allocateSlots(instances, tpl, { maxSlots = Infinity, gap = 0 } = {}) {
    const lead = num(tpl && tpl.lead, 1), tail = num(tpl && tpl.tail, 0.5), ends = [], slotOf = {}, overflow = [];
    const xs = (instances || []).filter((x) => x && x.template === (tpl && tpl.id)).slice().sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id)));
    for (const x of xs) {
      const s = x.t - lead, e = x.t + (Number.isFinite(x.tail) ? x.tail : tail);   // (an instance may stay out longer: a slider, a spinner)
      let k = ends.findIndex((end) => end + gap <= s + 1e-9);
      if (k < 0) { if (ends.length >= maxSlots) { overflow.push(x.id); continue; } k = ends.length; ends.push(e); } else ends[k] = e;
      slotOf[x.id] = k;
    }
    return { slots: ends.length, slotOf, overflow };
  }

  // ---- the properties (on the player: one sequence plays at a time, so every sequence shares them). A player has at most 32
  // (the game's documented limit) and GeoUI Builder's own pack takes 11 of them: the timeline takes as few as it can —
  //   <ns>:seq       the sequence (0 none, 1…1023) + 1024 × paused + 2048 × the generation (0…8191, +1 at each play, seek
  //                  and resume): the client counts from the moment this number changes
  //   <ns>:seq_from  the time it counts from (ms)
  //   <ns>:<tag><k>t, <ns>:<tag><k>p   a streamed slot's instance: its time (ms, −1 none) and its params packed in 24 bits
  //   <ns>:<tag>e<g> the results (hit, miss…) of the instances now in slots 8g … 8g + 7, 3 bits a slot: 0 until the slot's
  //                  instance has one (the script sets it back to 0 when the next instance takes the slot)
  // Every value is an integer below 2^24: Molang's numbers are float32, exact to there.
  const SEQ = Object.freeze({ max: 1023, pause: 1024, gen: 2048, gens: 8192 });
  const EV_BITS = 3, EV_PER = 8;
  const names = (ns) => ({
    seq: `${ns}:seq`, from: `${ns}:seq_from`,
    slot: (tid, k) => ({ t: `${ns}:${tid}${k}t`, p: `${ns}:${tid}${k}p` }),
    events: (tid, g) => `${ns}:${tid}e${g}`,
  });
  const RESULTS = Object.freeze(['none', 'hit', 'miss', 'great', 'good', 'ok']);   // a result's number in its 3 bits (0 = none)
  /** the seq property's number for a sequence, paused or not, and a generation */
  const seqValue = ({ seq = 0, pause = false, gen = 0 } = {}) => Math.min(SEQ.max, Math.max(0, Math.round(num(seq)))) + (pause ? SEQ.pause : 0) + SEQ.gen * (((Math.round(num(gen)) % SEQ.gens) + SEQ.gens) % SEQ.gens);
  const seqParts = (v) => { const x = Math.max(0, Math.round(num(v))); return { seq: x % SEQ.pause, pause: Math.floor(x / SEQ.pause) % 2 === 1, gen: Math.floor(x / SEQ.gen) % SEQ.gens }; };
  /** the same as Molang (expr: the property read) → { seq, pause } */
  const seqMolang = (expr) => ({ seq: `math.mod(${expr}, ${SEQ.pause})`, pause: `math.mod(math.floor((${expr}) / ${SEQ.pause}), 2)` });
  /** which events property a slot's result is in, and where: { group, shift (the slot's place, 0…7) } */
  const eventSlot = (k) => ({ group: Math.floor(k / EV_PER), shift: k % EV_PER });
  /** a group's number from its slots' results (codes 0…7; slot 8g + i at bits 3i) */
  const eventValue = (codes) => { let v = 0; (codes || []).slice(0, EV_PER).forEach((c, i) => { v += (Math.max(0, Math.min(7, Math.round(num(c)))) * 2 ** (EV_BITS * i)); }); return v; };
  /** slot k's result as Molang (expr: its group's property read) */
  const eventMolang = (expr, k) => { const sh = k % EV_PER; return sh ? `math.mod(math.floor((${expr}) / ${2 ** (EV_BITS * sh)}), 8)` : `math.mod(${expr}, 8)`; };
  /** a template whose params all fit its pack (or that has none) can be streamed */
  const canStream = (tpl) => { const spec = (tpl && tpl.pack) || DEFAULT_PACK; return ((tpl && tpl.params) || []).every((p) => spec.some((f) => f.name === p)); };
  /** what a template needs: per slot t + p when its instances are streamed (p only with params); a share of an events
   *  property when its clips answer events (trigger / until) */
  function slotNeeds(tpl, mode) {
    const events = (tpl.tracks || []).some((tr) => (tr.clips || []).some((c) => c.trigger || c.until));
    return { t: mode === 'streamed', p: mode === 'streamed' && (tpl.params || []).length > 0, events };
  }
  /** a short, stable property-name part for a template (property names are short: namespace:name, lower case) */
  const slotTag = (i) => `t${i}s`;
  /** the budget of a document: per sequence, its templates' instances, slots and mode — baked (each slot's instances written
   *  into the Molang: what shows runs on the client's own clock, no property per instance) unless a template has more than
   *  bakedMax instances and its params fit its pack: streamed (the script puts each instance into its slot just before it
   *  shows). The properties are shared by the sequences (a template's tag is its place in its sequence): what every
   *  sequence needs, together, plus base (the pack's own) — warnings when over propertyLimit (32: the game's) */
  function budget(doc, { propertyLimit = 32, bakedMax = 2000, gap = 0.25, ns = 'geoui', base = 0 } = {}) {
    const sequences = [], warnings = [], tags = new Map();   // tag → { t, p, groups }
    for (const seq of (doc && doc.sequences) || []) {
      const templates = (seq.templates || []).map((tpl, i) => {
        const count = (seq.instances || []).filter((x) => x.template === tpl.id).length;
        const mode = count > bakedMax && canStream(tpl) ? 'streamed' : 'baked';
        if (count > bakedMax && mode === 'baked') warnings.push(`テンプレート「${tpl.name || tpl.id}」は実体が ${count} 個ですが、param が詰め方（pack）に入りきらないので焼き込みで書き出します（式が長くなります）`);
        const a = allocateSlots(seq.instances, tpl, { gap: mode === 'streamed' ? gap : 0 }), need = slotNeeds(tpl, mode), tag = slotTag(i);
        const groups = need.events ? Math.ceil(a.slots / EV_PER) : 0, u = tags.get(tag) || { t: 0, p: 0, groups: 0 };
        tags.set(tag, { t: Math.max(u.t, need.t ? a.slots : 0), p: Math.max(u.p, need.p ? a.slots : 0), groups: Math.max(u.groups, groups) });
        return { id: tpl.id, tag, instances: count, slots: a.slots, mode, needs: need, eventGroups: groups, properties: (need.t ? a.slots : 0) + (need.p ? a.slots : 0) + groups };
      });
      sequences.push({ id: seq.id, templates, properties: 2 + templates.reduce((s, t) => s + t.properties, 0) });
    }
    const own = 2 + [...tags.values()].reduce((s, u) => s + u.t + u.p + u.groups, 0), total = base + own;
    if (total > propertyLimit) warnings.push(`プロパティが ${total} 個要ります（GeoUI の ${base} 個とタイムラインの ${own} 個。上限 ${propertyLimit}）: 流し込みのテンプレートを焼き込みに（bakedMax を上げる）するか、同時に出る実体を減らす（lead・tail を短く）`);
    return { sequences, properties: own, total, base, propertyLimit, warnings, names: names(ns), tags: Object.fromEntries(tags) };
  }
  /** the entity properties (BP player.json "description.properties") for a budget */
  function propertyDefs(b, ns = 'geoui') {
    const N = names(ns), top = 2 ** MAX_BITS - 1, out = {
      [N.seq]: { type: 'int', range: [0, top], default: 0, client_sync: true },
      [N.from]: { type: 'int', range: [0, top], default: 0, client_sync: true },
    };
    for (const [tag, u] of Object.entries((b && b.tags) || {})) {
      for (let k = 0; k < u.t; k++) out[N.slot(tag, k).t] = { type: 'int', range: [-1, top], default: -1, client_sync: true };
      for (let k = 0; k < u.p; k++) out[N.slot(tag, k).p] = { type: 'int', range: [0, top], default: 0, client_sync: true };
      for (let g = 0; g < u.groups; g++) out[N.events(tag, g)] = { type: 'int', range: [0, top], default: 0, client_sync: true };
    }
    return out;
  }

  T.contract = { MAX_BITS, DEFAULT_PACK, RESULTS, SEQ, EV_BITS, EV_PER, checkSpec, stepOf, pack, unpack, unpackMolang, allocateSlots, names, seqValue, seqParts, seqMolang, eventSlot, eventValue, eventMolang, canStream, slotNeeds, slotTag, budget, propertyDefs };
  if (typeof module === 'object' && module && module.exports) module.exports = T.contract;
})(typeof globalThis !== 'undefined' ? globalThis : this);
