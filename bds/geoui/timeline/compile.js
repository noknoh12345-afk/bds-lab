// GeoUI timeline — compile: a timeline document into the resource pack GeoUI Builder exports (bds/geoui/timeline/PLAN.md step 3).
// Every value is worked out in the client entity's pre_animation, one Molang variable per channel; each sequence's animation
// only moves its bones by those variables, and per-element render controllers take their opacity and flipbook frame from them.
// The Molang is the model's own arithmetic written out (model.evaluate is the preview): tests/tl-anim-offline.mjs runs it
// frame by frame in GeoUI Builder's Molang evaluator and compares every element with model.evaluate.
// Time: the server sets <ns>:seq (which sequence, 1…; 0 none), <ns>:seq_gen (+1 at each play or seek), <ns>:seq_from (ms) and
// <ns>:seq_pause; the client counts from the moment it sees seq_gen change (q.life_time). Many instances of a template are drawn
// by slots (copies of its bones, contract.js): baked (each slot's instances written into the Molang) or streamed (the script
// puts the next instance into the slot's properties before it shows). Hits and misses: <ns>:<tag><k>g (+1) and r (the result).
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const Mo = () => T.model, Ko = () => T.contract;
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  // (numbers in the Molang: 6 decimals — the model's own numbers to well under the 1e-3 the tests hold it to)
  const n = (x) => { const v = Math.round(num(x) * 1e6) / 1e6; return String(Object.is(v, -0) ? 0 : v); };
  const EPS = '0.000001';
  const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'e';
  const J = (o) => JSON.stringify(o, null, 2) + '\n';
  const parse = (f) => JSON.parse(typeof f === 'string' ? f : JSON.stringify(f));

  // ---------------------------------------------------------------------------------------------------------------- easing
  const C1 = 1.70158, C2 = C1 * 1.525, C3 = C1 + 1;
  const POWM = (k) => (u) => `math.pow(${u}, ${k})`;
  function bounceOutM(u) {
    const a = 7.5625, d = 2.75, sq = (c) => `${a} * (${u} - ${n(c)}) * (${u} - ${n(c)})`;
    return `(${u} < ${n(1 / d)} ? ${a} * ${u} * ${u} : (${u} < ${n(2 / d)} ? ${sq(1.5 / d)} + 0.75 : (${u} < ${n(2.5 / d)} ? ${sq(2.25 / d)} + 0.9375 : ${sq(2.625 / d)} + 0.984375)))`;
  }
  const IN = {
    sine: (u) => `(1 - math.cos(${u} * 90))`,
    quad: (u) => `(${u} * ${u})`, cubic: POWM(3), quart: POWM(4), quint: POWM(5),
    expo: (u) => `((math.pow(2, 10 * ${u}) - 1) / 1023)`,
    circ: (u) => `(1 - math.sqrt(math.max(0, 1 - ${u} * ${u})))`,
    back: (u) => `(${C3} * math.pow(${u}, 3) - ${C1} * ${u} * ${u})`,
    // (made to meet 0 and 1 exactly, as the model's: model.EASE_K)
    elastic: (u) => { const K = Mo().EASE_K; return `(-math.pow(2, 10 * ${u} - 10) * math.sin((${u} * 10 - 10.75) * 120) - ${K.ei0} * (1 - ${u}) - ${K.ei1 - 1} * ${u})`; },
    bounce: (u) => `(1 - ${bounceOutM(`(1 - ${u})`)})`,
  };
  const OUT = { 'bounce-out': bounceOutM };
  const INOUT = {
    back: (u) => `(${u} < 0.5 ? math.pow(2 * ${u}, 2) * (${C2 + 1} * 2 * ${u} - ${C2}) / 2 : (math.pow(2 * ${u} - 2, 2) * (${C2 + 1} * (${u} * 2 - 2) + ${C2}) + 2) / 2)`,
    elastic: (u) => { const K = Mo().EASE_K; return `((${u} < 0.5 ? -(math.pow(2, 20 * ${u} - 10) * math.sin((20 * ${u} - 11.125) * 80)) / 2 : (math.pow(2, -20 * ${u} + 10) * math.sin((20 * ${u} - 11.125) * 80)) / 2 + 1) - ${K.eo0} * (1 - ${u}) - ${K.eo1 - 1} * ${u})`; },
  };
  /** an ease of a Molang expression u (0..1) → Molang; a Bézier as 16 straight pieces (its largest error is reported) */
  function easeM(e, u, report) {
    if (e && typeof e === 'object' && Array.isArray(e.bezier)) {
      const p = Array.from({ length: 17 }, (_, i) => Mo().ease(e, i / 16));
      let err = 0;
      for (let i = 0; i < 160; i++) { const x = i / 160, k = Math.min(15, Math.floor(x * 16)); err = Math.max(err, Math.abs(Mo().ease(e, x) - (p[k] + (p[k + 1] - p[k]) * (x * 16 - k)))); }
      if (report) report.bezier = Math.max(report.bezier || 0, err);
      const seg = (i) => `${n(p[i])} + ${n((p[i + 1] - p[i]) * 16)} * (${u} - ${n(i / 16)})`;
      let s = seg(15);
      for (let i = 14; i >= 0; i--) s = `(${u} < ${n((i + 1) / 16)} ? ${seg(i)} : ${s})`;
      return s;
    }
    if (e === 'step') return '0';
    const m = /^(\w+)-(in|out|inout)$/.exec(String(e));
    if (!m || !IN[m[1]]) return u;   // linear (and anything unknown, as the model does)
    if (m[2] === 'in') return IN[m[1]](u);
    if (m[2] === 'out') return OUT[e] ? OUT[e](u) : `(1 - ${IN[m[1]](`(1 - ${u})`)})`;
    return INOUT[m[1]] ? INOUT[m[1]](u) : `(${u} < 0.5 ? ${IN[m[1]](`(2 * ${u})`)} / 2 : 1 - ${IN[m[1]](`(2 - 2 * ${u})`)} / 2)`;
  }

  // ---------------------------------------------------------------------------------------------------------------- expressions
  // the model's key expressions are Molang already (param.<name>, t, math.*): their params and t become variables
  function exprM(src, vars, tVar) {
    const tk = String(src).match(/\d+(?:\.\d+)?|\.\d+|[A-Za-z_][\w.]*|[-+*/(),]|\S/g) || [];
    return `(${tk.map((t) => { const m = /^(?:param|p)\.(\w+)$/.exec(t); return m ? (vars[m[1]] || '0') : t === 't' ? (tVar || '0') : t; }).join(' ')})`;
  }
  const valM = (v, vars, tVar) => (typeof v === 'string' ? exprM(v, vars, tVar) : n(v));

  /** a channel's keys → Molang of its value at tc (a variable): channelAt's rule, a time on a key is the segment it starts */
  function keysM(keys, tc, vars, report) {
    const V = (k) => valM(k.v, vars, tc);
    if (keys.length === 1) return V(keys[0]);
    let s = V(keys[keys.length - 1]);
    for (let i = keys.length - 2; i >= 0; i--) {
      const a = keys[i], b = keys[i + 1], span = b.t - a.t;
      const seg = span > 1e-9 ? `${V(a)} + (${V(b)} - ${V(a)}) * ${easeM(a.ease, `((${tc} - ${n(a.t)}) / ${n(span)})`, report)}` : V(b);
      s = `(${tc} < ${n(b.t)} ? ${seg} : ${s})`;
    }
    return `(${tc} < ${n(keys[0].t)} ? ${V(keys[0])} : ${s})`;
  }
  /** the point along a path at a progress (a variable, 0..1) → { x, y } Molang: the path's own polyline by arc length (cut or
   *  gone on straight at its osu! length), points closer than tol to a straight run dropped first */
  function pathM(path, u, tol = 1e-9) {
    const tb = Mo().pathTable(path), L = path.length > 0 ? path.length : tb.length;
    let pts = tb.pts;
    if (pts.length > 2) {
      const keep = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = keep[keep.length - 1], b = pts[i + 1], p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len > tol) keep.push(p);
      }
      keep.push(pts[pts.length - 1]); pts = keep;
    }
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const scale = acc[acc.length - 1] > 0 ? tb.length / acc[acc.length - 1] : 1, d = `(math.clamp(${u}, 0, 1) * ${n(L / scale)})`;
    const out = {};
    for (const ax of [0, 1]) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1], seg = acc[acc.length - 1] - acc[acc.length - 2];
      let s = seg > 0 ? `${n(b[ax])} + ${n((b[ax] - a[ax]) / seg)} * (${d} - ${n(acc[acc.length - 1])})` : n(b[ax]);
      for (let i = pts.length - 2; i >= 0; i--) {
        const span = acc[i + 1] - acc[i];
        if (span <= 0) continue;
        s = `(${d} < ${n(acc[i + 1])} ? ${n(pts[i][ax])} + ${n((pts[i + 1][ax] - pts[i][ax]) / span)} * (${d} - ${n(acc[i])}) : ${s})`;
      }
      out[ax ? 'y' : 'x'] = s;
    }
    return out;
  }
  /** a transition (at p, a Molang expression 0..1) as Molang terms: added to x / y, multiplied into opacity / scale */
  function transM(kind, p) {
    const S = String(Mo().SLIDE);
    if (kind === 'fade') return { o: p };
    if (kind === 'slide-left') return { x: `-(1 - ${p}) * ${S}` };
    if (kind === 'slide-right') return { x: `(1 - ${p}) * ${S}` };
    if (kind === 'slide-up') return { y: `(1 - ${p}) * ${S}` };
    if (kind === 'slide-down') return { y: `-(1 - ${p}) * ${S}` };
    if (kind === 'zoom') return { s: p };
    if (kind === 'pop') return { s: `(${p} < 0.7 ? (${p} / 0.7) * 1.1 : 1.1 - ((${p} - 0.7) / 0.3) * 0.1)` };
    return {};
  }

  // ---------------------------------------------------------------------------------------------------------------- a target
  /** one element's clips (on one track) → pre_animation lines that put its state in variables P_x, P_y, P_sx, P_sy, P_r, P_o
   *  (and P_v, P_f, P_fr when its clips have them). o: { st, zero, vars (params), ev: { t, r } | null, active, paths, instPath,
   *  hidden (muted / not solo), report } */
  function targetLines(P, clips, o) {
    const lines = [], report = o.report, parts = [];
    const RES = Ko().RESULTS, code = (name) => Math.max(0, RES.indexOf(name));
    const ordered = [...clips.filter((c) => c.trigger), ...clips.filter((c) => !c.trigger)];
    for (const c of ordered) {
      const s = valM(c.start, o.vars), e = valM(c.end, o.vars);
      if (c.trigger) {
        if (!o.ev) { report.warnings.push(`trigger（${c.trigger}）はテンプレートの中だけで使えます（${c.id}）`); continue; }
        const start = `${o.ev.t} + ${s}`, end = `${o.ev.t} + ${e}`;
        parts.push({ c, start, end, cut: '0', cond: `(${o.ev.r} == ${code(c.trigger)} && ${o.st} >= ${start} - ${EPS} && ${o.st} < ${end})` });
      } else {
        const start = `${o.zero} + ${s}`, rawEnd = `${o.zero} + ${e}`;
        let end = rawEnd, cut = '0';
        if (c.until && o.ev) { cut = `(${o.ev.r} == ${code(c.until)} && ${o.ev.t} >= ${start} - ${EPS} && ${o.ev.t} < ${rawEnd})`; end = `(${cut} ? ${o.ev.t} : ${rawEnd})`; }
        parts.push({ c, start, end, cut, cond: `(${o.st} >= ${start} - ${EPS} && ${o.st} < ${end})` });
      }
    }
    // which clip (its index in parts, −1 none), the time in it, the time left in it, whether an event cut it
    let chain = '-1';
    for (let i = parts.length - 1; i >= 0; i--) chain = `(${parts[i].cond} ? ${i} : ${chain})`;
    const pick = (f, dflt) => { let s = dflt; for (let i = parts.length - 1; i >= 0; i--) s = `(${P}_c == ${i} ? ${f(parts[i])} : ${s})`; return s; };
    lines.push(`${P}_c = ${o.hidden ? '-1' : `${o.active} ? ${chain} : -1`};`);
    lines.push(`${P}_tc = math.max(0, ${o.st} - ${pick((p) => p.start, '0')});`);
    if (parts.some((p) => p.c.transitionOut)) lines.push(`${P}_l = ${pick((p) => p.end, '0')} - ${o.st};`);
    if (parts.some((p) => p.cut !== '0')) lines.push(`${P}_k = ${pick((p) => p.cut, '0')};`);
    const D = Mo().DEFAULTS, tc = `${P}_tc`;
    const chan = (c, prop) => (c.channels && c.channels[prop] && c.channels[prop].length ? keysM(c.channels[prop], tc, o.vars, report) : null);
    // the progress along a path first (x and y use it)
    const pathOf = (c) => { const id = c.path === '@instance' ? o.instPath : c.path; return id ? o.paths(id) : null; };
    if (parts.some((p) => pathOf(p.c) && chan(p.c, 'path'))) lines.push(`${P}_u = ${pick((p) => chan(p.c, 'path') || '0', '0')};`);
    // per clip: its values with its transitions
    const val = (p, prop) => {
      const c = p.c, base = chan(c, prop) ?? n(D[prop]);
      const terms = [], muls = [];
      if (prop === 'x' || prop === 'y') {
        const path = chan(c, 'path') && pathOf(c);
        if (path && path.__pick) {
          // (each instance's own path: the one of the slot's instance now)
          let s = '0';
          for (let j = path.__pick.length - 1; j >= 0; j--) s = `(${path.__sel} == ${j} ? ${path.__pick[j] ? pathM(path.__pick[j], `${P}_u`)[prop] : '0'} : ${s})`;
          terms.push(s);
        } else if (path) terms.push(pathM(path, `${P}_u`)[prop]);
        else if (c.path && chan(c, 'path')) report.warnings.push(`道「${c.path}」がありません（${c.id}）`);
      }
      for (const [tr, pv] of [[c.transitionIn, `math.clamp(${tc} / ${n(c.transitionIn && c.transitionIn.duration)}, 0, 1)`], [c.transitionOut, `math.clamp(${P}_l / ${n(c.transitionOut && c.transitionOut.duration)}, 0, 1)`]]) {
        if (!tr || !(tr.duration > 0)) continue;
        const on = tr === c.transitionIn ? `${tc} < ${n(tr.duration)}` : `(${P}_l < ${n(tr.duration)}${p.cut !== '0' ? ` && ${P}_k == 0` : ''})`;
        const m = transM(tr.kind, easeM(tr.ease, pv, report));
        if (prop === 'x' && m.x) terms.push(`(${on} ? ${m.x} : 0)`);
        if (prop === 'y' && m.y) terms.push(`(${on} ? ${m.y} : 0)`);
        if (prop === 'opacity' && m.o) muls.push(`(${on} ? ${m.o} : 1)`);
        if ((prop === 'scaleX' || prop === 'scaleY') && m.s) muls.push(`(${on} ? ${m.s} : 1)`);
      }
      let s = [base, ...terms].join(' + ');
      if (muls.length) s = `(${s}) * ${muls.join(' * ')}`;
      return prop === 'opacity' ? `math.clamp(${s}, 0, 1)` : s;
    };
    for (const [v, prop, hid] of [['x', 'x', '0'], ['y', 'y', '0'], ['sx', 'scaleX', '0'], ['sy', 'scaleY', '0'], ['r', 'rotation', '0'], ['o', 'opacity', '0']]) lines.push(`${P}_${v} = ${pick((p) => val(p, prop), hid)};`);
    const has = (prop) => parts.some((p) => chan(p.c, prop));
    if (has('value')) lines.push(`${P}_v = ${pick((p) => chan(p.c, 'value') || '0', '0')};`, `${P}_vd = ${pick((p) => (chan(p.c, 'value') ? '1' : '0'), '0')};`);
    if (has('fill')) lines.push(`${P}_f = math.clamp(${pick((p) => chan(p.c, 'fill') || '0', '0')}, 0, 1);`, `${P}_fd = ${pick((p) => (chan(p.c, 'fill') ? '1' : '0'), '0')};`);
    if (has('frame')) lines.push(`${P}_fr = ${pick((p) => chan(p.c, 'frame') || '0', '0')};`, `${P}_frd = ${pick((p) => (chan(p.c, 'frame') ? '1' : '0'), '0')};`);
    return { lines, has: { value: has('value'), fill: has('fill'), frame: has('frame'), opacity: parts.some((p) => chan(p.c, 'opacity') || (p.c.transitionIn && p.c.transitionIn.kind === 'fade') || (p.c.transitionOut && p.c.transitionOut.kind === 'fade')), rotation: parts.some((p) => chan(p.c, 'rotation')) } };
  }

  // ---------------------------------------------------------------------------------------------------------------- the pack
  /** a depth for a cube where no cube of the geometry that overlaps it (seen from the front) lies within 0.02 */
  function freeDepth(geo, cube) {
    const [x0, y0, z0] = cube.origin, x1 = x0 + cube.size[0], y1 = y0 + cube.size[1];
    const near = [];
    for (const b of geo.bones) for (const c of b.cubes || []) {
      const [a0, b0, c0] = c.origin;
      if (a0 < x1 && a0 + c.size[0] > x0 && b0 < y1 && b0 + c.size[1] > y0) near.push(c0, c0 + (c.size[2] || 0));
    }
    for (let k = 1; k < 2000; k++) { const z = Math.round((z0 + 0.021 * k) * 1e4) / 1e4; if (near.every((w) => Math.abs(w - z) >= 0.02)) return z; }
    return z0;
  }
  // ---------------------------------------------------------------------------------------------------------------- the pack (cont.)
  /** the timeline (doc) into GeoUI Builder's files (buildPack's), RP side. ctx: { design (buildPack's input), core (GeoUICore;
   *  else the global one), propertyLimit,
   *  bakedMax, molangLimit, sounds: [{ id, ext, data }] }. → { files, warnings, stats: { bindings, pre, slots, longest } } */
  function extendPack(files0, doc0, ctx = {}) {
    const M = Mo(), K = Ko();
    if (!M || !K) throw new Error('GeoUITimeline.model と contract が要ります（model.js・contract.js を先に読み込む）');
    const doc = M.normalize(doc0), design = ctx.design || {}, files = Object.assign({}, files0), warnings = [], report = { warnings, bezier: 0 };
    const G = ctx.core || T.core || root.GeoUICore || null;
    const S = G && G.settingsOf ? G.settingsOf(design.settings) : Object.assign({ ns: 'geoui' }, design.settings || {});
    const ns = clean(S.ns || 'geoui'), rpDir = `${ns}_RP`, V = (s) => `v.${ns}_${s}`;
    if (!doc.sequences.length) return { files, warnings, stats: { bindings: {}, pre: [], slots: {}, longest: 0 } };
    const bones = design.bones || [], boneSet = new Set(bones.map((b) => b.name));
    const subtree = (name) => { const out = [name]; for (let grew = true; grew;) { grew = false; for (const b of bones) if (b.parent && out.includes(b.parent) && !out.includes(b.name)) { out.push(b.name); grew = true; } } return out; };
    const budget = K.budget(doc, { propertyLimit: num(ctx.propertyLimit, 32), bakedMax: num(ctx.bakedMax, 64), ns });
    warnings.push(...budget.warnings);
    // (the pause screen's paper doll is a player the game builds for the picture: it has no properties, and reading one there
    //  is a Molang error that leaves the rest of that doll's pre_animation undone — GeoUI Builder's own lines guard the same way)
    const N = K.names(ns), P = (s) => `(variable.is_paperdoll ? 0 : q.property('${s}'))`;
    // ---- time
    // (every variable read before this frame sets it goes through ??: the game's pre_animation stops at a line that reads a
    //  variable never set — every line after it is left undone, every frame (bds-lab's probe, geoui_probe, 2026-10-21))
    const pre = [
      `${V('seq')} = ${P(N.seq)};`,
      `${V('t0')} = (${P(N.gen)} != (${V('gen')} ?? -1)) ? q.life_time : (${V('t0')} ?? q.life_time);`,
      `${V('gen')} = ${P(N.gen)};`,
      `${V('raw')} = ${P(N.pause)} ? ${P(N.from)} / 1000 : q.life_time - ${V('t0')} + ${P(N.from)} / 1000;`,
      `${V('st')} = ${V('raw')};`,
    ];
    doc.sequences.forEach((seq, si) => {
      const i = si + 1, [a, b] = seq.inOut || [0, seq.duration], len = b - a, raw = V('raw');
      if (seq.loop === 'hold') pre.push(`${V('st')} = ${V('seq')} == ${i} ? math.min(${raw}, ${n(b - 1e-6)}) : ${V('st')};`);
      else if (seq.loop === 'loop' && len > 0) pre.push(`${V('st')} = (${V('seq')} == ${i} && ${raw} >= ${n(a)}) ? ${n(a)} + math.mod(${raw} - ${n(a)}, ${n(len)}) : ${V('st')};`);
      else if (seq.loop === 'pingpong' && len > 0) pre.push(`${V('m')} = math.mod(${raw} - ${n(a)}, ${n(2 * len)});`, `${V('st')} = (${V('seq')} == ${i} && ${raw} >= ${n(a)}) ? ${n(a)} + (${V('m')} <= ${n(len)} ? ${V('m')} : ${n(2 * len)} - ${V('m')}) : ${V('st')};`);
    });
    const st = V('st'), bindings = {}, slotsOut = {}, anims = {}, clones = new Map(), drives = new Map();   // drives: bone → { o: [[seq, var]], fr, v, f }
    const drive = (bone, kind, i, varName) => { if (!drives.has(bone)) drives.set(bone, { o: [], fr: [], v: [], f: [] }); drives.get(bone)[kind].push([i, varName]); };
    doc.sequences.forEach((seq, si) => {
      const i = si + 1, anim = { loop: true, animation_length: 1, bones: {} }, paths = (id) => (seq.paths || []).find((p) => p.id === id) || null;
      const on = `${V('seq')} == ${i}`, solo = seq.tracks.some((t) => t.solo), seen = new Set(), bind = (bone, Pv, rot) => {
        anim.bones[bone] = Object.assign({ position: [`${Pv}_x`, `${Pv}_y`, 0], scale: [`${Pv}_sx`, `${Pv}_sy`, 1] }, rot ? { rotation: [0, 0, `${Pv}_r`] } : {});
      };
      const add = (bone, Pv, r) => {
        pre.push(...r.lines.map((l) => l.replace(/^(\S+) = (.*);$/, (m0, lhs, rhs) => `${lhs} = ${on} ? (${rhs}) : 0;`)));
        bind(bone, Pv, r.has.rotation);
        if (r.has.opacity) drive(bone, 'o', i, `${Pv}_o`);
        if (r.has.frame) drive(bone, 'fr', i, Pv);
        if (r.has.value) drive(bone, 'v', i, Pv);
        if (r.has.fill) drive(bone, 'f', i, Pv);
      };
      // ---- the sequence's own tracks (the first track per element; the others are said)
      seq.tracks.forEach((tr, ti) => {
        if (tr.kind !== 'layer' || !tr.target || !tr.clips.length) return;
        if (seen.has(tr.target)) { warnings.push(`「${tr.target}」を動かすトラックが 2 本あります（${seq.name}）: 上の 1 本だけを書き出します`); return; }
        seen.add(tr.target);
        if (!boneSet.has(tr.target)) warnings.push(`要素（ボーン）「${tr.target}」がありません（${seq.name}）`);
        const Pv = V(`${i}_${ti}`);
        const r = targetLines(Pv, tr.clips, { st, zero: '0', vars: {}, ev: null, active: '1', paths, hidden: tr.muted || (solo && !tr.solo), report });
        add(tr.target, Pv, r);
        bindings[`${i}:${tr.target}`] = { prefix: Pv, bone: tr.target };
      });
      // ---- templates and their instances, by slots
      const bt = (budget.sequences[si] || { templates: [] }).templates;
      (seq.templates || []).forEach((tpl, pi) => {
        const B = bt[pi], xs = seq.instances.filter((x) => x.template === tpl.id);
        if (!B || !xs.length) return;
        const instPaths = xs.some((x) => x.path), mode = instPaths && B.mode === 'streamed' ? 'baked' : B.mode;
        if (instPaths && B.mode === 'streamed') warnings.push(`テンプレート「${tpl.name}」は実体ごとの道を持つので、焼き込みで書き出します（実体 ${xs.length} 個: 式が長くなります）`);
        const alloc = K.allocateSlots(seq.instances, tpl, { gap: mode === 'streamed' ? 0.25 : 0 });
        const tag = B.tag, spec = tpl.pack || K.DEFAULT_PACK, all = [...new Set(tpl.tracks.filter((t) => t.kind === 'layer' && t.target).map((t) => t.target))];
        // (an element the design does not have: said, and left out — nothing to copy, nothing to move)
        const targets = all.filter((x) => boneSet.has(x) || !bones.length);
        for (const x of all) if (!targets.includes(x)) warnings.push(`テンプレート「${tpl.name}」の要素（ボーン）「${x}」がありません: 書き出しません`);
        slotsOut[`${i}:${tpl.id}`] = { mode, slots: alloc.slots, slotOf: alloc.slotOf, tag };
        const usesEvents = tpl.tracks.some((t) => t.clips.some((c) => c.trigger || c.until));
        if (mode === 'streamed') for (const p of tpl.params) if (!spec.some((f) => f.name === p)) warnings.push(`テンプレート「${tpl.name}」の param「${p}」は流し込みの詰め方（pack）にありません（0 になります）`);
        for (let k = 0; k < alloc.slots; k++) {
          const Q = V(`${i}_${tag}${k}`), SP = K.names(ns).slot(tag, k), mine = xs.filter((x) => alloc.slotOf[x.id] === k).sort((a, b) => a.t - b.t), vars = {};
          const tailOf = (x) => (x.tail !== undefined ? x.tail : tpl.tail);
          if (mode === 'baked') {
            let sel = '-1';
            for (let j = mine.length - 1; j >= 0; j--) sel = `(${st} < ${n(mine[j].t - tpl.lead)} - ${EPS} ? -1 : (${st} < ${n(mine[j].t + tailOf(mine[j]))} ? ${j} : ${sel}))`;
            const pickI = (f) => { let s = '0'; for (let j = mine.length - 1; j >= 0; j--) s = `(${Q}_i == ${j} ? ${f(mine[j])} : ${s})`; return s; };
            pre.push(`${Q}_i = ${on} ? ${sel} : -1;`, `${Q}_h = ${pickI((x) => n(x.t))};`);
            for (const p of tpl.params) { pre.push(`${Q}_p${clean(p)} = ${pickI((x) => n(x.params[p]))};`); vars[p] = `${Q}_p${clean(p)}`; }
          } else {
            const un = K.unpackMolang(P(SP.p), spec);
            pre.push(`${Q}_h = ${P(SP.t)} / 1000;`, `${Q}_i = (${on} && ${P(SP.t)} >= 0 && ${st} >= ${Q}_h - ${n(tpl.lead)} - ${EPS} && ${st} < ${Q}_h + ${n(Math.max(tpl.tail, ...xs.map(tailOf)))}) ? 0 : -1;`);
            for (const p of tpl.params) { const f = spec.find((x) => x.name === p); pre.push(`${Q}_p${clean(p)} = ${f ? un[p] : '0'};`); vars[p] = `${Q}_p${clean(p)}`; }
          }
          let ev = null;
          if (usesEvents) {
            pre.push(`${Q}_et = (${P(SP.g)} != (${Q}_eg ?? 0)) ? ${st} : (${Q}_et ?? -1000);`, `${Q}_eg = ${P(SP.g)};`, `${Q}_er = (${Q}_et >= ${Q}_h - ${n(tpl.lead)} - ${EPS}) ? ${P(SP.r)} : 0;`);
            ev = { t: `${Q}_et`, r: `${Q}_er` };
          }
          // (an instance's own path, baked: which one by the slot's instance)
          const instPath = mode === 'baked' && instPaths ? `__inst_${i}_${tag}${k}` : null;
          const pathsHere = (id) => {
            if (id !== instPath) return paths(id);
            // (each instance's path, chosen by the slot's instance index: one table per instance, picked in the Molang)
            return { __pick: mine.map((x) => paths(x.path)), __sel: `${Q}_i` };
          };
          targets.forEach((target, ti) => {
            const tr = tpl.tracks.find((t) => t.kind === 'layer' && t.target === target), bone = `${target}_${tag}${k}`, Pv = `${Q}_${ti}`;
            const r = targetLines(Pv, tr.clips, { st, zero: `${Q}_h`, vars, ev, active: `${Q}_i >= 0`, paths: pathsHere, instPath, hidden: tr.muted, report });
            add(bone, Pv, r);
            if (!clones.has(bone)) clones.set(bone, { of: target, tag, k });
            for (const x of mine) bindings[`${i}:${target}#${x.id}`] = { prefix: Pv, bone };
          });
        }
        for (const target of targets) if (!anim.bones[target]) anim.bones[target] = { scale: 0 };   // (the template's own elements: only their copies show)
      });
      anims[`animation.${ns}.seq_${i}`] = anim;
    });
    // (a slot's bones that another sequence uses: hidden in this one; all of them when no sequence plays. A template's own
    //  elements — its prototypes — never show in the game, playing or not: only their copies do)
    const protos = new Set([...clones.values()].map((c) => c.of));
    for (const a of Object.values(anims)) for (const bone of [...clones.keys(), ...protos]) if (!a.bones[bone]) a.bones[bone] = { scale: 0 };
    anims[`animation.${ns}.seq_idle`] = { loop: true, animation_length: 1, bones: Object.fromEntries([...clones.keys(), ...protos].map((b) => [b, { scale: 0 }])) };
    // ---- per-element drives: opacity and frame (render controllers), value (digits), fill (gauges)
    const RCV = (bone, what) => V(`${what}_${clean(bone)}`);
    for (const [bone, d] of drives) {
      if (d.o.length) { let s = '1'; for (const [i, v] of d.o) s = `(${V('seq')} == ${i} ? ${v} : ${s})`; pre.push(`${RCV(bone, 'a')} = ${s};`); }
      if (d.fr.length) { let s = '0'; for (const [i, Pv] of d.fr) s = `(${V('seq')} == ${i} && ${Pv}_frd ? ${Pv}_fr : ${s})`; pre.push(`${RCV(bone, 'fr')} = math.floor(${s});`); }
      if (d.v.length) { let s = '0', on = '0'; for (const [i, Pv] of d.v) { s = `(${V('seq')} == ${i} && ${Pv}_vd ? ${Pv}_v : ${s})`; on = `(${V('seq')} == ${i} && ${Pv}_vd ? 1 : ${on})`; } pre.push(`${RCV(bone, 'val')} = ${s};`, `${RCV(bone, 'vd')} = ${on};`); }
      if (d.f.length) { let s = '0', on = '0'; for (const [i, Pv] of d.f) { s = `(${V('seq')} == ${i} && ${Pv}_fd ? ${Pv}_f : ${s})`; on = `(${V('seq')} == ${i} && ${Pv}_fd ? 1 : ${on})`; } pre.push(`${RCV(bone, 'fill')} = ${s};`, `${RCV(bone, 'fd')} = ${on};`); }
    }
    // ---- the files: geometry copies for the slots, the animations, the client entity, render controllers
    const geoFiles = Object.keys(files).filter((f) => f.startsWith(`${rpDir}/models/entity/`) && f.endsWith('.geo.json'));
    for (const f of geoFiles) {
      const g = parse(files[f]), geo = g['minecraft:geometry'][0], have = new Map(geo.bones.map((b) => [b.name, b]));
      for (const [bone, { of, tag, k }] of clones) {
        if (have.has(bone)) continue;
        const tree = subtree(of);
        if (!have.has(of)) continue;
        for (const name of tree) {
          const src = have.get(name);
          if (!src) continue;
          const copy = parse(src);
          copy.name = `${name}_${tag}${k}`;
          // (a copy moved in depth, 0.02 at a time, until no face it overlaps is within 0.02 of it: never two faces on one plane —
          //  only one of them shows at a time, but two on one plane would flicker if ever they did)
          for (const cube of copy.cubes || []) cube.origin = [cube.origin[0], cube.origin[1], freeDepth(geo, cube)];
          if (name !== of && src.parent) copy.parent = tree.includes(src.parent) ? `${src.parent}_${tag}${k}` : src.parent;
          geo.bones.push(copy); have.set(copy.name, copy);
        }
      }
      files[f] = J(g);
    }
    const animFile = `${rpDir}/animations/${ns}.animation.json`, af = files[animFile] ? parse(files[animFile]) : { format_version: '1.8.0', animations: {} };
    Object.assign(af.animations, anims);
    // (a gauge whose fill a clip drives: the transform's fill gives way to the clip's while it does)
    const tfm = af.animations[`animation.${ns}_transform`];
    for (const [bone, d] of drives) if (d.f.length && tfm && tfm.bones[bone] && Array.isArray(tfm.bones[bone].scale)) {
      const el = (design.elements || {})[bone] || {}, axis = el.gauge && ['top', 'bottom'].includes(el.gauge.fill) ? 1 : 0, sc = tfm.bones[bone].scale;
      sc[axis] = `(${RCV(bone, 'fd')} ? ${RCV(bone, 'fill')} : (${sc[axis]}))`;
    }
    files[animFile] = J(af);
    const entFile = `${rpDir}/entity/player.entity.json`, ent = files[entFile] ? parse(files[entFile]) : null;
    if (ent) {
      const dsc = ent['minecraft:client_entity'].description;
      // (a number whose value a clip drives: its digits are worked out again from the clip's value while it does)
      const digitLines = [];
      for (const [bone, d] of drives) if (d.v.length) {
        const el = (design.elements || {})[bone] || {}, digits = (el.number && Array.isArray(el.number.digits) ? el.number.digits.length : 0), hide = !(el.number && el.number.hideLeadingZero === false);
        for (let k = 0; k < digits; k++) {
          const dv = `v.${ns}_${clean(bone)}_d${k}`, place = Math.pow(10, digits - 1 - k), de = G && G.digitExpr ? G.digitExpr(RCV(bone, 'val'), place, hide) : `math.mod(math.floor(math.abs(${RCV(bone, 'val')})/${place}),10)`;
          digitLines.push(`${dv} = ${RCV(bone, 'vd')} ? ${de} : (${dv} ?? 0);`);
        }
      }
      dsc.scripts.pre_animation.push(...pre, ...digitLines);
      // (what is read outside the pre_animation — the animate conditions, the render controllers — has a value from the
      //  entity's first moment: initialize runs once, before anything else reads them)
      const init = [`${V('seq')} = 0;`];
      for (const [bone, d] of drives) { if (d.o.length) init.push(`${RCV(bone, 'a')} = 1;`); if (d.fr.length) init.push(`${RCV(bone, 'fr')} = 0;`); }
      dsc.scripts.initialize = [...(dsc.scripts.initialize || []), ...init];
      dsc.animations = dsc.animations || {};
      const animate = [];
      doc.sequences.forEach((_, si) => { dsc.animations[`${ns}_seq_${si + 1}`] = `animation.${ns}.seq_${si + 1}`; animate.push({ [`${ns}_seq_${si + 1}`]: `q.is_in_ui && ${V('seq')} == ${si + 1}` }); });
      if (clones.size) { dsc.animations[`${ns}_seq_idle`] = `animation.${ns}.seq_idle`; animate.push({ [`${ns}_seq_idle`]: `q.is_in_ui && (${V('seq')} < 1 || ${V('seq')} > ${doc.sequences.length})` }); }
      // (a flipbook's frame step in the texture: the element's own cell size over the texture's — an atlas holds more than it)
      const stepOf = (name, fb) => {
        const b = bones.find((x) => x.name === name), faces = b && (b.cubes || []).map((c) => Object.values(c.faces || {}).find((f) => f && f.uv_size)).filter(Boolean), f = faces && faces[0];
        const tex = f && (design.textures || {})[f.texture], tw = tex && num(tex.uvWidth || tex.width), th = tex && num(tex.uvHeight || tex.height);
        return f && tw > 0 && th > 0 ? [Math.abs(f.uv_size[0]) / tw, Math.abs(f.uv_size[1]) / th] : [1 / fb.cols, 1 / fb.rows];
      };
      dsc.scripts.animate = [...(dsc.scripts.animate || []), ...animate];
      // ---- render controllers: an element with its own opacity or frame drawn by its own controller (its bones only), the
      // shared controllers drawing everything else
      const rcFile = `${rpDir}/render_controllers/${ns}.render_controllers.json`, rc = files[rcFile] ? parse(files[rcFile]) : null;
      // (the element's front: the nearest face to the camera — GeoUI's layers go towards it in −z)
      const frontOf = (name) => { const b = bones.find((x) => x.name === name); const zs = b ? (b.cubes || []).map((c) => num(c.origin && c.origin[2])) : []; return zs.length ? Math.min(...zs) : 0; };
      const protoOf = (bone) => (clones.has(bone) ? clones.get(bone).of : bone);
      // (drawn back to front: a see-through element over another is blended over what is already drawn behind it)
      const own = [...drives].filter(([, d]) => d.o.length || d.fr.length).map(([bone]) => bone).sort((a, b) => frontOf(protoOf(b)) - frontOf(protoOf(a)));
      const fades = new Set();
      if (rc && own.length) {
        const base = Object.entries(rc.render_controllers), addList = [];
        const treeOf = (bone) => { const c = clones.get(bone); return c ? subtree(c.of).map((x) => `${x}_${c.tag}${c.k}`) : subtree(bone); };
        for (const [id, r] of base) {
          r.part_visibility = [{ '*': true }, ...own.flatMap((b) => treeOf(b).map((x) => ({ [x]: false })))];
          for (const bone of own) {
            const el = (design.elements || {})[protoOf(bone)] || {}, d = drives.get(bone), id2 = `${id}_${clean(bone)}`;
            const copy = parse(r), c0 = clones.get(bone);
            copy.part_visibility = [{ '*': false }, ...treeOf(bone).map((x) => ({ [x]: true }))];
            // (a slot's copy drawn with its prototype's material: the shared list names the prototype's bones, not the copy's)
            if (c0) for (const x of subtree(c0.of)) { const m = (r.materials || []).find((e) => Object.keys(e)[0] === x); if (m) copy.materials.push({ [`${x}_${c0.tag}${c0.k}`]: m[x] }); }
            if (d.o.length) {
              // (opacity: the game takes a render controller's colour alpha only through a material with the colour mask —
              //  a plain blend draws the same at alpha 0 (bds-lab's probe, geoui_probe, 2026-10-21). The element's parts are
              //  drawn with the fade material (blend, or additive for an additive element, with the mask) while this
              //  controller draws them, and not at all while fully transparent: no invisible plane in front of what is behind)
              const fade = el.blend === 'add' ? `${ns}_addfade` : `${ns}_fade`;
              fades.add(fade);
              for (const x of treeOf(bone)) copy.materials.push({ [x]: `material.${fade}` });
              copy.color = Object.assign({}, r.color, { a: `${r.color && r.color.a !== undefined ? r.color.a : 1} * ${RCV(bone, 'a')}` });
              copy.part_visibility = [{ '*': false }, ...treeOf(bone).map((x) => ({ [x]: `${RCV(bone, 'a')} > 0.004` }))];
            }
            if (d.fr.length) {
              const fb = el.frames;
              if (fb && fb.cols > 0 && fb.rows > 0) { const [du, dv] = stepOf(clones.has(bone) ? clones.get(bone).of : bone, fb); copy.uv_anim = { offset: [`math.mod(${RCV(bone, 'fr')}, ${fb.cols}) * ${n(du)}`, `math.floor(${RCV(bone, 'fr')} / ${fb.cols}) * ${n(dv)}`], scale: [1, 1] }; }
              else warnings.push(`「${bone}」のコマ（frame）を書き出せません: 要素に連番の並び（frames: { cols, rows }）がありません`);
            }
            rc.render_controllers[id2] = copy;
            addList.push({ [id2]: (dsc.render_controllers.find((x) => typeof x === 'object' && x[id]) || {})[id] || 'q.is_in_ui' });
          }
        }
        dsc.render_controllers = [...dsc.render_controllers, ...addList];
        files[rcFile] = J(rc);
      }
      // ---- the fade materials (GeoUI Builder's base material with the colour mask: the controller's colour alpha counts)
      const matFile = `${rpDir}/materials/entity.material`;
      if (fades.size && files[matFile]) {
        const mf = parse(files[matFile]), FADE = {
          [`${ns}_fade`]: { '+defines': ['USE_UV_ANIM', 'USE_COLOR_MASK'], '+states': ['Blending'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' },
          [`${ns}_addfade`]: { '+defines': ['USE_UV_ANIM', 'USE_COLOR_MASK'], '+states': ['Blending', 'DisableDepthWrite'], blendSrc: 'SourceAlpha', blendDst: 'One' },
        };
        for (const f of fades) { mf.materials[`${f}:${ns}_base`] = FADE[f]; dsc.materials = Object.assign(dsc.materials || {}, { [f]: f }); }
        files[matFile] = J(mf);
      } else if (fades.size) warnings.push('マテリアルのファイルがありません: 不透明度（opacity）はゲームの中で効きません');
      // ---- sounds: their definitions and files. The behaviour pack's script plays an audio clip when the sequence's time
      //  reaches it and stops it at a pause, a seek or a stop (runtime.js: each clip's own volume and pitch) — a sequence's
      //  animation runs on a clock of its own that neither a seek nor a pause moves, and it can neither stop a sound nor start
      //  one part-way
      const sounds = (ctx.sounds || []), sdefs = [];
      doc.sequences.forEach((seq) => {
        for (const tr of seq.tracks) if (tr.kind === 'audio' && !tr.muted) for (const c of tr.clips) if (c.sound) {
          if (!sdefs.some((s) => s.id === clean(c.sound))) { const src = sounds.find((s) => clean(s.id) === clean(c.sound)); sdefs.push({ id: clean(c.sound), ext: src && src.ext === 'wav' ? 'wav' : 'ogg', data: src && src.data }); }
          if (c.offset > 1e-6) warnings.push(`音のクリップ（${c.id}）は頭を ${n(c.offset)} 秒切ってあります: ゲームでは音の頭から鳴ります`);
        }
      });
      if (sdefs.length) {
        const Me = T.media, sd = Me ? Me.soundDefinitions(sdefs, ns) : null;
        if (sd) {
          const sdf = `${rpDir}/sounds/sound_definitions.json`, prev = files[sdf] ? parse(files[sdf]) : { format_version: '1.20.20', sound_definitions: {} };
          Object.assign(prev.sound_definitions, sd.json.sound_definitions); files[sdf] = J(prev);
          for (const s of sdefs) { if (s.data) files[`${rpDir}/${sd.paths[s.id]}`] = s.data; else warnings.push(`音「${s.id}」の中身がありません（素材として取り込む）`); }
        }
      }
      files[entFile] = J(ent);
    }
    const longest = Math.max(...pre.map((l) => l.length));
    if (longest > num(ctx.molangLimit, 8000)) warnings.push(`Molang の式がいちばん長い所で ${longest} 文字です（上限の見込み ${num(ctx.molangLimit, 8000)}・要実測）: 鍵や実体を減らすか、流し込みに`);
    if (report.bezier > 0.002) warnings.push(`ベジェのイージングを 16 の折れ線にした誤差: 最大 ${report.bezier.toFixed(4)}`);
    return { files, warnings: [...new Set(warnings)], stats: { bindings, pre, slots: slotsOut, longest, bezierError: report.bezier, budget } };
  }

  T.compile = { extendPack, easeM, keysM, pathM, exprM, targetLines };
  if (typeof module === 'object' && module && module.exports) module.exports = T.compile;
})(typeof globalThis !== 'undefined' ? globalThis : this);
