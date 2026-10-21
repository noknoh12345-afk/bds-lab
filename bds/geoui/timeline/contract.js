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
      const s = x.t - lead, e = x.t + tail;
      let k = ends.findIndex((end) => end + gap <= s + 1e-9);
      if (k < 0) { if (ends.length >= maxSlots) { overflow.push(x.id); continue; } k = ends.length; ends.push(e); } else ends[k] = e;
      slotOf[x.id] = k;
    }
    return { slots: ends.length, slotOf, overflow };
  }

  // ---- the properties (on the player: one sequence plays at a time, so every sequence shares them)
  const names = (ns) => ({
    seq: `${ns}:seq`, gen: `${ns}:seq_gen`, from: `${ns}:seq_from`, pause: `${ns}:seq_pause`,
    slot: (tid, k) => ({ t: `${ns}:${tid}${k}t`, p: `${ns}:${tid}${k}p`, g: `${ns}:${tid}${k}g`, r: `${ns}:${tid}${k}r` }),
  });
  const RESULTS = Object.freeze(['none', 'hit', 'miss', 'great', 'good', 'ok']);   // the r property's numbers (0 = none)
  /** what a template needs per slot: t + p when its instances are streamed (p only with params), g + r when its clips answer
   *  events (trigger / until) */
  function slotNeeds(tpl, mode) {
    const events = (tpl.tracks || []).some((tr) => (tr.clips || []).some((c) => c.trigger || c.until));
    return { t: mode === 'streamed', p: mode === 'streamed' && (tpl.params || []).length > 0, g: events, r: events };
  }
  /** a short, stable property-name part for a template (property names are short: namespace:name, lower case) */
  const slotTag = (i) => `t${i}s`;
  /** the budget of a document: per sequence, its templates' instances, slots and mode (baked: every instance written into the
   *  Molang; streamed: the script puts each instance into its slot just before it shows), the properties that takes (the
   *  sequences share them: the largest counts) — warnings when over propertyLimit (32 by default: to be measured on the game) */
  function budget(doc, { propertyLimit = 32, bakedMax = 64, gap = 0.25, ns = 'geoui' } = {}) {
    const sequences = [], warnings = [];
    let most = 0;
    for (const seq of (doc && doc.sequences) || []) {
      let props = 0;
      const templates = (seq.templates || []).map((tpl, i) => {
        const count = (seq.instances || []).filter((x) => x.template === tpl.id).length;
        const mode = count > bakedMax ? 'streamed' : 'baked';
        const a = allocateSlots(seq.instances, tpl, { gap: mode === 'streamed' ? gap : 0 }), need = slotNeeds(tpl, mode);
        const per = Object.values(need).filter(Boolean).length;
        props += per * a.slots;
        return { id: tpl.id, tag: slotTag(i), instances: count, slots: a.slots, mode, perSlot: per, needs: need };
      });
      sequences.push({ id: seq.id, templates, properties: 4 + props });
      most = Math.max(most, 4 + props);
    }
    if (most > propertyLimit) warnings.push(`プロパティが ${most} 個要ります（上限 ${propertyLimit}）: 同時に出る実体を減らす（lead・tail を短く）か、出来事（trigger・until）を使うテンプレートを減らす`);
    return { sequences, properties: most, propertyLimit, warnings, names: names(ns) };
  }
  /** the entity properties (BP player.json "description.properties") for a budget */
  function propertyDefs(b, ns = 'geoui') {
    const N = names(ns), out = {
      [N.seq]: { type: 'int', range: [0, 1023], default: 0, client_sync: true },
      [N.gen]: { type: 'int', range: [0, 1000000], default: 0, client_sync: true },
      [N.from]: { type: 'int', range: [0, 100000000], default: 0, client_sync: true },
      [N.pause]: { type: 'bool', default: false, client_sync: true },
    };
    // (the largest sequence's slots: the others reuse them)
    const big = (b.sequences || []).reduce((a, s) => (!a || s.properties > a.properties ? s : a), null);
    for (const t of (big && big.templates) || []) {
      for (let k = 0; k < t.slots; k++) {
        const P = N.slot(t.tag, k);
        if (t.needs.t) out[P.t] = { type: 'int', range: [-1, 100000000], default: -1, client_sync: true };
        if (t.needs.p) out[P.p] = { type: 'int', range: [0, 2 ** MAX_BITS - 1], default: 0, client_sync: true };
        if (t.needs.g) out[P.g] = { type: 'int', range: [0, 1000000], default: 0, client_sync: true };
        if (t.needs.r) out[P.r] = { type: 'int', range: [0, RESULTS.length - 1], default: 0, client_sync: true };
      }
    }
    return out;
  }

  T.contract = { MAX_BITS, DEFAULT_PACK, RESULTS, checkSpec, stepOf, pack, unpack, unpackMolang, allocateSlots, names, slotNeeds, slotTag, budget, propertyDefs };
  if (typeof module === 'object' && module && module.exports) module.exports = T.contract;
})(typeof globalThis !== 'undefined' ? globalThis : this);
