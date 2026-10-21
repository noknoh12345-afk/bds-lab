// GeoUI timeline — osu! beatmaps (.osu, file format v14) read into a timeline document (pure): hit circles, sliders and
// spinners as instances of templates (bds/geoui/timeline/PLAN.md), their timing and BPM, combo numbers and colours, the
// music as an audio track. The formulas are osu!'s own (approach rate → preempt and fade-in, circle size → radius, overall
// difficulty → hit windows, slider length → duration). The lab ships no real beatmap or song: a person imports their own.
(function (root) {
  'use strict';
  const T = root.GeoUITimeline = root.GeoUITimeline || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(+v) ? +v : d);
  const CURVES = { B: 'bezier', C: 'catmull', L: 'linear', P: 'arc' };

  /** a .osu file's text → { version, general, editor, metadata, difficulty, timing, colours, objects } */
  function parseOsu(text) {
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    const head = /^\s*osu file format v(\d+)/.exec(lines[0] || '');
    const out = { version: head ? +head[1] : null, general: {}, editor: {}, metadata: {}, difficulty: {}, timing: [], colours: { combos: [] }, objects: [] };
    let sec = null;
    for (const raw of lines.slice(head ? 1 : 0)) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      const m = /^\[(\w+)\]$/.exec(line);
      if (m) { sec = m[1]; continue; }
      if (['General', 'Editor', 'Metadata', 'Difficulty', 'Colours'].includes(sec)) {
        const i = line.indexOf(':');
        if (i < 0) continue;
        const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
        if (sec === 'Colours') { const c = v.split(',').map((x) => Math.max(0, Math.min(255, Math.round(num(x))))); if (/^Combo\d+$/.test(k) && c.length >= 3) out.colours.combos[+k.slice(5) - 1] = c.slice(0, 3); else out.colours[k] = c.slice(0, 3); continue; }
        out[sec.toLowerCase()][k] = /^-?\d+(\.\d+)?$/.test(v) ? +v : v;
      } else if (sec === 'TimingPoints') {
        const f = line.split(',');
        if (f.length < 2) continue;
        out.timing.push({ time: num(f[0]), beatLength: num(f[1]), meter: Math.max(1, num(f[2], 4)), uninherited: f[6] === undefined || f[6].trim() === '1', kiai: (num(f[7]) & 1) === 1 });
      } else if (sec === 'HitObjects') {
        const f = line.split(',');
        if (f.length < 4) continue;
        const x = num(f[0]), y = num(f[1]), time = num(f[2]), type = num(f[3]);
        const base = { x, y, time, newCombo: Boolean(type & 4), comboSkip: (type >> 4) & 7 };
        if (type & 1) out.objects.push({ kind: 'circle', ...base });
        else if (type & 2) {
          const [c, ...pts] = String(f[5] || '').split('|'), points = [[x, y], ...pts.map((p) => p.split(':').map((q) => num(q))).filter((p) => p.length === 2)];
          // (a perfect circle needs three points: otherwise osu! draws it as a Bézier)
          const curve = CURVES[c] === 'arc' && points.length !== 3 ? 'bezier' : CURVES[c] || 'bezier';
          out.objects.push({ kind: 'slider', ...base, curve, points, slides: Math.max(1, Math.round(num(f[6], 1))), length: Math.max(0, num(f[7])) });
        } else if (type & 8) out.objects.push({ kind: 'spinner', ...base, endTime: Math.max(time, num(f[5], time)) });
      }
    }
    out.timing.sort((a, b) => a.time - b.time);
    out.colours.combos = out.colours.combos.filter(Boolean);
    out.objects.sort((a, b) => a.time - b.time);
    return out;
  }

  // ---- osu!'s formulas (milliseconds, osu! pixels)
  const preempt = (ar) => (ar < 5 ? 1200 + (600 * (5 - ar)) / 5 : ar > 5 ? 1200 - (750 * (ar - 5)) / 5 : 1200);
  const fadeIn = (ar) => (ar < 5 ? 800 + (400 * (5 - ar)) / 5 : ar > 5 ? 800 - (500 * (ar - 5)) / 5 : 800);
  const radius = (cs) => 54.4 - 4.48 * cs;
  /** the hit windows either side of an object's time: 300 (great), 100 (good), 50 (meh) */
  const hitWindows = (od) => ({ great: 80 - 6 * od, good: 140 - 8 * od, meh: 200 - 10 * od });
  function difficultyOf(map) {
    const d = (map && map.difficulty) || {}, od = num(d.OverallDifficulty, 5), ar = num(d.ApproachRate, od), cs = num(d.CircleSize, 5);
    return { ar, od, cs, hp: num(d.HPDrainRate, 5), preempt: preempt(ar), fadeIn: fadeIn(ar), radius: radius(cs), windows: hitWindows(od), sliderMultiplier: num(d.SliderMultiplier, 1.4), tickRate: num(d.SliderTickRate, 1) };
  }
  /** the timing at a time: the uninherited point's beat length and meter, and the slider velocity of an inherited point after it */
  function timingAt(map, time) {
    let red = null, sv = 1;
    for (const p of (map && map.timing) || []) {
      if (p.time > time + 1e-9) break;
      if (p.uninherited) { red = p; sv = 1; } else if (p.beatLength < 0) sv = Math.min(10, Math.max(0.1, -100 / p.beatLength));
    }
    red = red || ((map && map.timing) || []).find((p) => p.uninherited) || { time: 0, beatLength: 500, meter: 4 };
    return { beatLength: red.beatLength, meter: red.meter, sv };
  }
  /** a slider's duration in ms (all its slides) */
  function sliderDuration(map, obj) {
    const { beatLength, sv } = timingAt(map, obj.time), diff = difficultyOf(map);
    return ((obj.length / (diff.sliderMultiplier * 100 * sv)) * beatLength) * obj.slides;
  }
  /** each object's combo number and colour index (a new combo, or the object after a spinner, starts at 1 with the next colour,
   *  skipping comboSkip colours) */
  function combos(map) {
    let colour = -1, n = 0, after = false;
    const nColours = Math.max(1, ((map && map.colours && map.colours.combos) || []).length || 4);
    return ((map && map.objects) || []).map((o, i) => {
      if (i === 0 || o.newCombo || after) { colour = (colour + 1 + (i === 0 ? 0 : o.comboSkip)) % nColours; n = 1; } else n++;
      after = o.kind === 'spinner';
      return { n, colour };
    });
  }

  // ---- the document
  const DEFAULT_ELEMENTS = { circle: 'hitcircle', number: 'combonumber', approach: 'approachcircle', burst: 'hitburst', miss: 'hitmiss', body: 'sliderbody', ball: 'sliderball', spinner: 'spinner' };
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  /** a slider's body: the line its ball follows — the path's own polyline (model.pathTable) cut at osu!'s length, or carried
   *  on straight to it, as model.pathPoint goes. Not the points as given: a Bézier's middle points are off its curve.
   *  (Without model.js loaded: the points) */
  function lineOf(path) {
    const Mo = T.model;
    if (!Mo || !Mo.pathTable) return path.points.map((p) => [p[0], p[1]]);
    const { pts, acc, length } = Mo.pathTable(path), L = path.length > 0 ? path.length : length, out = [];
    for (let i = 0; i < pts.length && acc[i] < L - 1e-6; i++) out.push([r4(pts[i][0]), r4(pts[i][1])]);
    const end = Mo.pathPoint(path, 1, { length: L });
    out.push([r4(end[0]), r4(end[1])]);
    return out;
  }
  /** a beatmap → { doc, bodies, info }. opts: width (model units for the playfield's 512 osu! pixels, default 120; it keeps
   *  4:3, centred on 0, y up), designRadius (the radius the hit circle element is drawn at, model units, default 10),
   *  elements (the GeoUI elements' names, DEFAULT_ELEMENTS), sound (the music's sound id). bodies: each slider's path in
   *  model units — its points, the line its ball follows (line) and that line's middle (centre: the instance's bx, by,
   *  where the body element is put) — and width, for the editor to draw into an atlas (its frame is the instance's param f) */
  function toDocument(map, opts = {}) {
    const diff = difficultyOf(map), k = num(opts.width, 120) / 512, E = Object.assign({}, DEFAULT_ELEMENTS, opts.elements || {});
    const px = (x) => r4((x - 256) * k), py = (y) => r4((192 - y) * k);
    const lead = diff.preempt / 1000, fade = diff.fadeIn / 1000, late = diff.windows.meh / 1000, s = r4((diff.radius * k) / num(opts.designRadius, 10));
    const at = (v) => [{ t: 0, v }];
    // (the circles' size is the map's, the same for all: a number in the template, not a param of each instance)
    const place = { x: at('param.x'), y: at('param.y') }, size = { scaleX: at(s), scaleY: at(s) };
    // how a streamed instance's params fit in one property (24 bits): the playfield's x and y, the combo number and colour
    const hw = r4(num(opts.width, 120) / 2), field = [{ name: 'x', bits: 8, min: -hw, max: hw }, { name: 'y', bits: 7, min: r4(-hw * 0.75), max: r4(hw * 0.75) }, { name: 'n', bits: 6, min: 0, max: 63 }, { name: 'c', bits: 3, min: 0, max: 7 }];
    const fadeKeys = (to) => [{ t: 0, v: 0 }, { t: fade, v: to }];
    // the hit circle's look, shared by the circle and the slider's head: the circle (its colour a frame of the element's
    // image), its number, the approach ring closing in, the burst on a hit, the miss mark
    const circleTracks = () => [
      { target: E.circle, clips: [{ start: -lead, end: late, until: 'hit', channels: { ...place, ...size, opacity: fadeKeys(1), frame: at('param.c') } }] },
      { target: E.number, clips: [{ start: -lead, end: late, until: 'hit', channels: { ...place, ...size, opacity: fadeKeys(1), value: at('param.n') } }] },
      { target: E.approach, clips: [{ start: -lead, end: 0, channels: { ...place, scaleX: [{ t: 0, v: r4(s * 4) }, { t: lead, v: s }], scaleY: [{ t: 0, v: r4(s * 4) }, { t: lead, v: s }], opacity: fadeKeys(0.9), frame: at('param.c') } }] },
      { target: E.burst, clips: [{ start: 0, end: 0.25, trigger: 'hit', channels: { ...place, scaleX: [{ t: 0, v: s, ease: 'quad-out' }, { t: 0.25, v: r4(s * 1.4) }], scaleY: [{ t: 0, v: s, ease: 'quad-out' }, { t: 0.25, v: r4(s * 1.4) }], opacity: [{ t: 0, v: 1, ease: 'quad-in' }, { t: 0.25, v: 0 }] } }] },
      { target: E.miss, clips: [{ start: 0, end: 0.5, trigger: 'miss', channels: { x: at('param.x'), y: [{ t: 0, v: 'param.y' }, { t: 0.5, v: 'param.y - 5' }], opacity: [{ t: 0, v: 1 }, { t: 0.5, v: 0 }] } }] },
    ];
    const templates = [
      { id: 'osu-circle', name: 'osu! 円', lead, tail: r4(late + 0.5), params: ['x', 'y', 'n', 'c'], pack: field, tracks: circleTracks() },
      { id: 'osu-slider', name: 'osu! スライダー', lead, tail: 0.5, params: ['x', 'y', 'n', 'c', 'd', 'r', 'f', 'bx', 'by'], tracks: [
        { target: E.body, clips: [{ start: -lead, end: 'param.d + 0.15', channels: { x: at('param.bx'), y: at('param.by'), opacity: fadeKeys(0.85), frame: at('param.f') } }] },
        ...circleTracks(),
        { target: E.ball, clips: [{ start: 0, end: 'param.d', path: '@instance', channels: { ...size, path: at('1 - math.abs(math.mod(t * param.r / param.d, 2) - 1)') } }] },
      ] },
      { id: 'osu-spinner', name: 'osu! スピナー', lead: 0.3, tail: 0.3, params: ['d'], pack: [{ name: 'd', bits: 12, min: 0, max: 40.95 }], tracks: [
        { target: E.spinner, clips: [{ start: -0.3, end: 'param.d', channels: { opacity: [{ t: 0, v: 0 }, { t: 0.3, v: 1 }], rotation: at('t * 360') } }] }] },
    ];
    const cs = combos(map), instances = [], paths = [], bodies = [];
    let end = 0;
    (map.objects || []).forEach((o, i) => {
      const t = r4(o.time / 1000), c = cs[i];
      if (o.kind === 'circle') { instances.push({ id: `o${i + 1}`, template: 'osu-circle', t, params: { x: px(o.x), y: py(o.y), n: c.n, c: c.colour } }); end = Math.max(end, t + late); }
      else if (o.kind === 'slider') {
        const d = r4(sliderDuration(map, o) / 1000), pts = o.points.map((p) => [px(p[0]), py(p[1])]);
        const path = { id: `op${i + 1}`, kind: o.curve, points: pts, length: r4(o.length * k) };
        paths.push(path);
        // (the body drawn along the ball's line, put where that line's middle is)
        const line = lineOf(path), xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
        const bx = r4((Math.min(...xs) + Math.max(...xs)) / 2), by = r4((Math.min(...ys) + Math.max(...ys)) / 2);
        bodies.push({ frame: bodies.length, path: path.id, kind: o.curve, points: pts, line, centre: [bx, by], length: r4(o.length * k), width: r4(2 * diff.radius * k) });
        instances.push({ id: `o${i + 1}`, template: 'osu-slider', t, path: path.id, tail: r4(d + 0.5),
          params: { x: px(o.x), y: py(o.y), n: c.n, c: c.colour, d, r: o.slides, f: bodies.length - 1, bx, by } });
        end = Math.max(end, t + d + 0.5);
      } else if (o.kind === 'spinner') {
        const d = r4((o.endTime - o.time) / 1000);
        instances.push({ id: `o${i + 1}`, template: 'osu-spinner', t, tail: r4(d + 0.3), params: { d } });
        end = Math.max(end, t + d + 0.3);
      }
    });
    const tempo = (map.timing || []).filter((p) => p.uninherited && p.beatLength > 0).map((p) => ({ t: r4(p.time / 1000), bpm: r4(60000 / p.beatLength), meter: p.meter }));
    const duration = r4(Math.max(1, end + 1));
    const md = map.metadata || {};
    const seq = {
      id: 'osu', name: `${md.Title || 'osu!'}${md.Version ? ` [${md.Version}]` : ''}`, duration, fps: 60, loop: 'once', tempo, paths, templates, instances, markers: [],
      tracks: [{ id: 'osu-music', kind: 'audio', name: '音楽', target: '', clips: [{ id: 'osu-music-clip', start: 0, end: duration, sound: String(opts.sound || 'music') }] }],
    };
    return {
      doc: { version: 1, sequences: [seq] }, bodies,
      info: { title: md.Title || '', artist: md.Artist || '', creator: md.Creator || '', version: md.Version || '', audio: (map.general || {}).AudioFilename || '', difficulty: diff,
        counts: { circles: map.objects.filter((o) => o.kind === 'circle').length, sliders: map.objects.filter((o) => o.kind === 'slider').length, spinners: map.objects.filter((o) => o.kind === 'spinner').length },
        colours: (map.colours.combos.length ? map.colours.combos : [[255, 192, 0], [0, 202, 0], [18, 124, 255], [242, 24, 57]]) },
    };
  }

  T.osu = { parseOsu, preempt, fadeIn, radius, hitWindows, difficultyOf, timingAt, sliderDuration, combos, lineOf, toDocument, DEFAULT_ELEMENTS };
  if (typeof module === 'object' && module && module.exports) module.exports = T.osu;
})(typeof globalThis !== 'undefined' ? globalThis : this);
