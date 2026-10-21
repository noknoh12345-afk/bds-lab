/*!
 * GeoUI Builder — Blockbench plugin (bds-lab: bds/geoui/README.md)
 *
 * GeoUI = 2D UI that Minecraft Bedrock draws as flat planes on minecraft:player, shown by a live_player_renderer that a
 * resource pack adds to the HUD (q.is_in_ui). This plugin builds it in Blockbench: a screen frame in the viewport, UI
 * elements as bones of flat cubes, and an export to a resource pack (+ behaviour pack) that works like what
 * GeoUI Studio v10.1 (Au12jp/geouistudio 7fe110f, Apache-2.0) exports.
 *
 * Studio's layout formulas are reproduced here (GeoUICore: anchors, the aspect term, scale and offset, the centre fix,
 * the HUD panel), and every hand-made value of Studio (the screen height 176 units, the centre fixes, the panel at
 * 10% / 110%) is a setting, not a constant, so a measured value can replace it. Where Studio's output is wrong, the
 * export differs on purpose and says why (README: 「Studio との違い」).
 *
 * The same file is a Node module (module.exports = GeoUICore) for bds-lab's tests: tests/geoui-builder-offline.mjs.
 */
/* global BBPlugin, Blockbench, Project, ModelProject, ModelFormat, Property, Group, Cube, Texture, Formats, Format,
   Canvas, Preview, Animation, Animator, Modes, Outliner, Undo, Dialog, Action, BarMenu, MenuBar, newProject, THREE,
   scene, JSZip, Interface, document, window, Image */
'use strict';

var GeoUICore = (function () {
  const VERSION = '0.1.0';
  const num = (v, d = 0) => (v !== null && v !== '' && v !== undefined && Number.isFinite(+v) ? +v : d);
  /** Studio's rounding (r3): 3 decimals, the way every number in its Molang is written */
  const r3 = (v) => Math.round(num(v) * 1000) / 1000;
  const r4 = (v) => Math.round(num(v) * 10000) / 10000;
  const clean = (s, fb) => String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || fb;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const J = (o) => JSON.stringify(o, null, 2);
  /** the height (model units) GeoUI is drawn at: the doll itself stays below the screen */
  const PIVOT_Y = 140;

  /** What GeoUI Studio v10.1 was built with — values made by hand or reported by players, kept as the defaults */
  const STUDIO = Object.freeze({
    ref: 'GeoUI Studio v10.1 (Au12jp/geouistudio 7fe110f, 2026-08-01)',
    // 「画面の高さ＝モデル何単位か」: 「実機で 20.25 倍にしたらちょうど良かった」という報告から 176
    unitsPerScreenH: 176,
    // json-ui 単位 ÷ モデル単位: 画面の高さを 240 json-ui 単位と仮定した 240 / 176
    uiPxPerUnit: 240 / 176,
    // 中心のずれ（画面の高さに対する割合）: PC x -0.1 / y -4.9、iOS x -0.3 / y -9.25（176 単位で一度だけ実測）
    centerFix: { desktop: { x: -0.00057, y: -0.02784 }, mobile: { x: -0.00170, y: -0.05256 }, console: { x: -0.00057, y: -0.02784 } },
    // 画面比はスクリプトが端末の種類から推測する（1000 倍の整数）
    platformAspect: { Desktop: 1778, Mobile: 2000, Console: 1778 },
    // HUD に足す live_player_renderer の枠（上の値はこの枠でだけ成り立つ）
    panel: { size: [10, 10], offset: [0, 110] },
    layerZ: -0.2,
  });

  /** What bds-lab measured on the real app (bds/geoui/report.mjs over the app runs of bds/addons/geoui_calib*: an Android
   *  emulator 1560x720, Minecraft 1.26.52.3, 2026-10-21; five screens of three frames — 10 x 10, 20 x 20, 2 x 10 % — agree to
   *  0.08 % and 0.7 px, the same frame in two runs to 0.003 %). The HUD's live_player_renderer draws one model unit as
   *  k x the frame's smaller side (px) and pins the model's origin d units below the frame's middle (centred across):
   *  Studio's frame (10 % x 10 % at 110 %) on any screen wider than tall is 170.68 units high, centred at y = 135.04
   *  (Studio: 176 and 140, then a fix measured once on a PC — −4.9 units, close to this — and once on an iPhone: −9.25) */
  const MEASURED = Object.freeze({ id: 'bds-lab-2026-10', k: 0.058589, d: 24.10, ref: 'bds-lab app runs (geoui_calib*), Android 1560x720, Minecraft 1.26.52.3, 2026-10-21' });
  const CALIBRATIONS = { [MEASURED.id]: '実機で測った値（bds-lab: HUD の枠から計算）', 'studio-v10.1': 'GeoUI Studio v10.1 と同じ値', manual: '自分で入れた値' };
  /** the screen a HUD frame shows, by the measured model (pure): its height in model units and its centre's y, at an aspect
   *  (a frame narrower than tall on the screen — w % x aspect < h % — is scaled by its width, so then the aspect matters) */
  function frameScreen(panel, aspect, M = MEASURED) {
    const w = (num(panel && panel.size && panel.size[0], 10) / 100) * qa(aspect), h = num(panel && panel.size && panel.size[1], 10) / 100;
    const H = 1 / (M.k * Math.min(w, h)), top = num(panel && panel.offset && panel.offset[1], 110) / 100;
    return { H, cy: H * (top + h / 2 - 0.5) + M.d, cx: 0 };
  }

  const DEVICES = [
    { id: 'pc', label: 'PC 16:9', aspect: 16 / 9 }, { id: 'pc16', label: 'PC 16:10', aspect: 1.6 },
    { id: 'uw', label: 'ウルトラワイド 21:9', aspect: 2.3333 }, { id: 'iphone', label: 'iPhone 19.5:9', aspect: 2.1667 },
    { id: 'android', label: 'Android 20:9', aspect: 2.2222 }, { id: 'and18', label: 'Android 18:9', aspect: 2.0 },
    { id: 'ipad', label: 'iPad 4:3', aspect: 4 / 3 }, { id: 'switch', label: 'Switch 16:9', aspect: 16 / 9 },
  ];
  const ANCHORS = ['top_left', 'top_middle', 'top_right', 'left_middle', 'center', 'right_middle', 'bottom_left', 'bottom_middle', 'bottom_right'];
  const BLENDS = ['cutout', 'blend', 'add'];
  const FILLS = ['left', 'right', 'bottom', 'top', 'center'];

  function defaults() {
    return {
      ns: 'geoui', name: 'GeoUI Pack', description: 'GeoUI Builder (Blockbench) で作成', version: [1, 0, 0], minEngine: [1, 26, 50],
      unitsPerScreenH: STUDIO.unitsPerScreenH,
      refAspect: 1.778, previewAspect: 1.778, previewPlatform: 'desktop',
      centerFix: clone(STUDIO.centerFix), centerAuto: true,
      platformAspect: clone(STUDIO.platformAspect),
      panel: clone(STUDIO.panel),
      hud: 'insert', followHud: true, hideInPaperdoll: true,
      filter: 'Point', bp: true,
      calibration: 'studio-v10.1',
      // the packs' UUIDs, made once per project and kept in the .bbmodel (a new UUID would be a new pack in every world)
      uuids: null,
      // each export after the first goes one patch version up (Minecraft keeps a pack by UUID and version)
      autoBump: true, exported: 0,
    };
  }
  /** an aspect the way the game sees it: a property is an integer x1000 (16:9 → 1.778) */
  const qa = (a, d = 1.778) => Math.round(Math.min(5, Math.max(0.6, num(a, d))) * 1000) / 1000;
  /** settings filled from defaults and checked (never throws: a bad value falls back to the default) */
  function settingsOf(s0) {
    const D = defaults(), s = Object.assign({}, D, s0 || {});
    s.ns = clean(s.ns, 'geoui').slice(0, 24);
    s.unitsPerScreenH = num(s.unitsPerScreenH, D.unitsPerScreenH) > 0 ? num(s.unitsPerScreenH) : D.unitsPerScreenH;
    s.refAspect = qa(s.refAspect); s.previewAspect = qa(s.previewAspect);
    s.centerFix = Object.assign(clone(D.centerFix), s.centerFix || {});
    for (const k of ['desktop', 'mobile', 'console']) s.centerFix[k] = { x: num(s.centerFix[k] && s.centerFix[k].x, 0), y: num(s.centerFix[k] && s.centerFix[k].y, 0) };
    s.platformAspect = Object.assign(clone(D.platformAspect), s.platformAspect || {});
    s.panel = { size: [num(s.panel && s.panel.size && s.panel.size[0], 10), num(s.panel && s.panel.size && s.panel.size[1], 10)],
      offset: [num(s.panel && s.panel.offset && s.panel.offset[0], 0), num(s.panel && s.panel.offset && s.panel.offset[1], 110)] };
    if (!['insert', 'studio'].includes(s.hud)) s.hud = 'insert';
    if (!['desktop', 'mobile', 'console'].includes(s.previewPlatform)) s.previewPlatform = 'desktop';
    s.version = Array.isArray(s.version) && s.version.length === 3 ? s.version.map((v) => Math.max(0, Math.round(num(v)))) : D.version;
    s.minEngine = Array.isArray(s.minEngine) && s.minEngine.length === 3 ? s.minEngine.map((v) => Math.max(0, Math.round(num(v)))) : D.minEngine;
    const UU = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    s.uuids = s.uuids && typeof s.uuids === 'object' && ['rp', 'rpMod', 'bp', 'bpData', 'bpScript'].every((k) => UU.test(String(s.uuids[k]))) ? Object.assign({}, s.uuids) : null;
    s.autoBump = s.autoBump !== false; s.exported = Math.max(0, Math.round(num(s.exported)));
    // (the measured calibration: the screen's height and centre follow the HUD frame — whatever is typed in for them)
    if (!CALIBRATIONS[s.calibration]) s.calibration = 'manual';
    // (Studio's: its two numbers, whatever was left in the fields — a project from before calibrations, with numbers of its
    //  own typed in, is 'manual': they stay)
    if (s.calibration === 'studio-v10.1') {
      const fixOf = (c) => ['desktop', 'mobile', 'console'].map((k) => `${num(c[k] && c[k].x)},${num(c[k] && c[k].y)}`).join(';');
      const own = !(s0 && s0.calibration) && (s.unitsPerScreenH !== STUDIO.unitsPerScreenH || fixOf(s.centerFix) !== fixOf(STUDIO.centerFix));
      if (own) s.calibration = 'manual';
      else { s.unitsPerScreenH = STUDIO.unitsPerScreenH; s.centerFix = clone(STUDIO.centerFix); }
    }
    if (s.calibration === MEASURED.id) {
      const f = frameScreen(s.panel, s.refAspect), fix = { x: r4(f.cx / f.H), y: Math.round(((f.cy - PIVOT_Y) / f.H) * 1e5) / 1e5 };
      s.unitsPerScreenH = r4(f.H); s.centerFix = { desktop: Object.assign({}, fix), mobile: Object.assign({}, fix), console: Object.assign({}, fix) };
    }
    return s;
  }
  /** a new project's settings: the measured calibration (defaults() stays Studio's: what an older project and the tests read) */
  const newProjectSettings = () => Object.assign(defaults(), { calibration: MEASURED.id });

  // ---------------------------------------------------------------------------------------------------------------
  // The screen in model units (Bedrock geometry coordinates: x to the right of the screen, y up)
  // ---------------------------------------------------------------------------------------------------------------
  /** Studio: v.geoui_halfw = r3(H/2) * v.geoui_aspect */
  const halfWAt = (S, aspect) => r3(S.unitsPerScreenH / 2) * qa(aspect);
  /** the centre fix as the game applies it: with the script, an integer property x10000 (Studio: round(fix*10000)) */
  function centerOf(S, platform, withScript) {
    const f = S.centerFix[platform || 'desktop'] || { x: 0, y: 0 }, H = S.unitsPerScreenH;
    return withScript ? { x: Math.round(f.x * 10000) / 10000 * H, y: Math.round(f.y * 10000) / 10000 * H } : { x: r3(f.x * H), y: r3(f.y * H) };
  }
  /** where the visible screen is, in model units, for one aspect and platform (the content is moved by the centre fix) */
  function screenAt(S, aspect, platform, withScript = true) {
    const c = centerOf(S, platform, withScript), hw = halfWAt(S, aspect), hh = S.unitsPerScreenH / 2;
    return { aspect: qa(aspect), cx: c.x, cy: PIVOT_Y + c.y, halfW: hw, halfH: hh, left: c.x - hw, right: c.x + hw, top: PIVOT_Y + c.y + hh, bottom: PIVOT_Y + c.y - hh };
  }
  const hAnchor = (a) => { a = String(a || 'center'); return a.includes('left') ? 'left' : a.includes('right') ? 'right' : 'center'; };
  const vAnchor = (a) => { a = String(a || 'center'); return a.includes('top') ? 'top' : a.includes('bottom') ? 'bottom' : 'middle'; };
  /** the pads of a box (model units, at the reference aspect) from the edges it is anchored to — Studio's padX / padY */
  function padsOf(S, box, anchor) {
    const hw = halfWAt(S, S.refAspect), hh = S.unitsPerScreenH / 2, h = hAnchor(anchor), v = vAnchor(anchor);
    return {
      x: h === 'left' ? box.x0 + hw : h === 'right' ? hw - box.x1 : (box.x0 + box.x1) / 2,
      y: v === 'top' ? PIVOT_Y + hh - box.y1 : v === 'bottom' ? box.y0 - (PIVOT_Y - hh) : (box.y0 + box.y1) / 2 - PIVOT_Y,
    };
  }
  /** Studio's anchorJS: where the centre of a w x h box goes for an anchor and pads (model units, relative to (0, 140)) */
  function studioAnchor(S, w, h, anchor, padX, padY, aspect) {
    const H = S.unitsPerScreenH, halfw = H * qa(aspect) / 2, a = String(anchor || 'center');
    let x = 0, y = 0;
    if (a.includes('left')) x = -(halfw - (w / 2 + padX));
    if (a.includes('right')) x = halfw - (w / 2 + padX);
    if (a.includes('top')) y = H / 2 - h / 2 - padY;
    if (a.includes('bottom')) y = -(H / 2 - h / 2 - padY);
    return { x, y };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Molang: the subset GeoUI writes, to check an expression and to evaluate a layout without the game
  // ---------------------------------------------------------------------------------------------------------------
  const ALIAS = { v: 'variable', q: 'query', t: 'temp', c: 'context' };
  function tokens(src) {
    const s = String(src), t = [];
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        if (/[eE]/.test(s[j] || '') && /[-+0-9]/.test(s[j + 1] || '')) { j += 2; while (j < s.length && /[0-9]/.test(s[j])) j++; }
        if (/[fF]/.test(s[j] || '')) j++;
        t.push({ k: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i; while (j < s.length && /[A-Za-z0-9_.]/.test(s[j])) j++;
        let id = s.slice(i, j).toLowerCase(); const dot = id.indexOf('.');
        if (dot > 0 && ALIAS[id.slice(0, dot)]) id = ALIAS[id.slice(0, dot)] + id.slice(dot);
        t.push({ k: 'id', v: id }); i = j; continue;
      }
      if (c === "'" || c === '"') { const j = s.indexOf(c, i + 1); if (j < 0) throw new Error('閉じていない文字列'); t.push({ k: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      const two = s.slice(i, i + 2);
      if (['&&', '||', '==', '!=', '<=', '>=', '??'].includes(two)) { t.push({ k: 'op', v: two }); i += 2; continue; }
      if ('+-*/<>!?:(),;=[]{}'.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
      throw new Error(`読めない文字 '${c}'（${i} 文字目）`);
    }
    return t;
  }
  /** an expression or statements → a tree (throws with a reason on a syntax error) */
  function parse(src) {
    const t = tokens(src); let p = 0;
    const peek = (v) => t[p] && t[p].k === 'op' && t[p].v === v;
    const eat = (v) => { if (!peek(v)) throw new Error(`'${v}' がありません（${p} 番目の語）`); p++; };
    function primary() {
      const x = t[p++];
      if (!x) throw new Error('式が途中で終わっています');
      if (x.k === 'num') return { n: 'num', v: x.v };
      if (x.k === 'str') return { n: 'str', v: x.v };
      if (x.k === 'op' && x.v === '(') { const e = expr(); eat(')'); return e; }
      if (x.k === 'id') {
        if (peek('(')) { p++; const args = []; if (!peek(')')) { do { args.push(expr()); } while (peek(',') && ++p); } eat(')'); return { n: 'call', id: x.v, args }; }
        return { n: 'id', id: x.v };
      }
      throw new Error(`'${x.v}' はここに置けません`);
    }
    function unary() {
      if (peek('-')) { p++; return { n: 'neg', a: unary() }; }
      if (peek('+')) { p++; return unary(); }
      if (peek('!')) { p++; return { n: 'not', a: unary() }; }
      return primary();
    }
    const bin = (next, ops) => () => { let a = next(); while (t[p] && t[p].k === 'op' && ops.includes(t[p].v)) { const op = t[p++].v; a = { n: 'bin', op, a, b: next() }; } return a; };
    const mul = bin(unary, ['*', '/']), add = bin(mul, ['+', '-']), rel = bin(add, ['<', '>', '<=', '>=']), eq = bin(rel, ['==', '!=']),
      and = bin(eq, ['&&']), or = bin(and, ['||']), nul = bin(or, ['??']);
    function expr() {
      const c = nul();
      if (peek('?')) { p++; const a = expr(); if (peek(':')) { p++; return { n: 'if', c, a, b: expr() }; } return { n: 'if', c, a, b: { n: 'num', v: 0 } }; }
      return c;
    }
    function statement() {
      if (t[p] && t[p].k === 'id' && t[p + 1] && t[p + 1].k === 'op' && t[p + 1].v === '=') { const id = t[p].v; p += 2; return { n: 'set', id, e: expr() }; }
      if (t[p] && t[p].k === 'id' && t[p].v === 'return') { p++; return { n: 'ret', e: expr() }; }
      return expr();
    }
    const list = [];
    while (p < t.length) { list.push(statement()); if (peek(';')) p++; else if (p < t.length) throw new Error(`'${t[p].v}' の前に ; がありません`); }
    if (!list.length) throw new Error('式が空です');
    return list.length === 1 ? list[0] : { n: 'seq', list };
  }
  const D2R = Math.PI / 180;
  const MATH = {
    'math.abs': Math.abs, 'math.ceil': Math.ceil, 'math.floor': Math.floor, 'math.sqrt': Math.sqrt, 'math.exp': Math.exp, 'math.ln': Math.log,
    'math.trunc': Math.trunc, 'math.round': (x) => Math.sign(x) * Math.round(Math.abs(x)), 'math.sin': (x) => Math.sin(x * D2R), 'math.cos': (x) => Math.cos(x * D2R),
    'math.atan': (x) => Math.atan(x) / D2R, 'math.atan2': (y, x) => Math.atan2(y, x) / D2R, 'math.pow': Math.pow, 'math.min': Math.min, 'math.max': Math.max,
    'math.mod': (a, b) => (b === 0 ? 0 : a % b), 'math.clamp': (x, a, b) => Math.min(Math.max(x, a), b), 'math.lerp': (a, b, u) => a + (b - a) * u,
    'math.random': (a, b) => (a + b) / 2, 'math.random_integer': (a, b) => Math.round((a + b) / 2), 'math.hermite_blend': (x) => 3 * x * x - 2 * x * x * x,
    'math.sign': Math.sign,
  };
  /** evaluate a tree; env: { vars: {name: number}, query(name, args) → number|undefined } (unknown names are 0, as in the game) */
  function evaluate(tree, env) {
    const vars = env.vars || (env.vars = {});
    const ev = (x) => {
      switch (x.n) {
        case 'num': return x.v;
        case 'str': return x.v;
        case 'neg': return -ev(x.a);
        case 'not': return ev(x.a) ? 0 : 1;
        case 'if': return ev(x.c) ? ev(x.a) : ev(x.b);
        case 'set': { const v = ev(x.e); vars[x.id] = v; return v; }
        case 'ret': return ev(x.e);
        case 'seq': { let v = 0; for (const s of x.list) { v = ev(s); if (s.n === 'ret') return v; } return v; }
        case 'id': {
          if (x.id === 'math.pi') return Math.PI;
          if (x.id in vars) return vars[x.id];
          if (x.id.startsWith('query.') && env.query) { const q = env.query(x.id, []); if (q !== undefined) return q; }
          (env.unknown || (env.unknown = new Set())).add(x.id); return 0;
        }
        case 'call': {
          const args = x.args.map(ev);
          if (MATH[x.id]) return MATH[x.id](...args);
          if (env.query) { const q = env.query(x.id, args); if (q !== undefined) return q; }
          (env.unknown || (env.unknown = new Set())).add(`${x.id}(${args.map((a) => (typeof a === 'string' ? `'${a}'` : a)).join(',')})`); return 0;
        }
        case 'bin': {
          if (x.op === '&&') return ev(x.a) && ev(x.b) ? 1 : 0;
          if (x.op === '||') return ev(x.a) || ev(x.b) ? 1 : 0;
          // (a variable never set — the game's "not valid" — gives the right side; reading one without ?? is what env.unknown lists)
          if (x.op === '??') { if (x.a.n === 'id' && x.a.id.startsWith('variable.') && !(x.a.id in vars)) return ev(x.b); const a = ev(x.a); return a === undefined || a === null ? ev(x.b) : a; }
          const a = ev(x.a), b = ev(x.b);
          switch (x.op) {
            case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? 0 : a / b;
            case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
            case '==': return a === b ? 1 : 0; case '!=': return a !== b ? 1 : 0;
          }
        }
      }
      throw new Error(`評価できない式（${x.n}）`);
    };
    return ev(tree);
  }
  const PARSED = new Map();
  /** a number, or an expression evaluated in env */
  function molang(v, env) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const s = String(v).trim();
    if (s === '') return 0;
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
    let tr = PARSED.get(s); if (!tr) { tr = parse(s); PARSED.set(s, tr); }
    return evaluate(tr, env);
  }
  /** null, or why an expression cannot be read */
  function molangError(src) { try { parse(src); return null; } catch (e) { return String(e.message || e); } }
  /** the env a GeoUI pack sees: properties by name, plus the queries Studio and this exporter read */
  function envOf({ props = {}, vars = {}, isInUi = 1, isPaperdoll = 0, lifeTime = 0 } = {}) {
    return {
      vars: Object.assign({ 'variable.is_paperdoll': isPaperdoll }, vars),
      query(name, args) {
        if (name === 'query.property') return num(props[args[0]], 0);
        if (name === 'query.is_in_ui') return isInUi;
        if (name === 'query.life_time') return lifeTime;
        return undefined;
      },
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Bedrock pose: geometry + one animation → where every cube's north face is (model units). The game's order:
  // a bone moves its cubes by T(pivot + position) R S T(-pivot), inside its parent's transform.
  // ---------------------------------------------------------------------------------------------------------------
  const mat = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    mul(a, b) {   // 3x4 affine (row-major), a after b
      const r = new Array(12);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
        r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
      }
      return r;
    },
    t: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z],
    s: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0],
    apply: (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]],
  };
  const vec3 = (v, env, d) => {
    if (v === undefined || v === null) return [d, d, d];
    if (!Array.isArray(v)) { const x = molang(v, env); return [x, x, x]; }
    return [0, 1, 2].map((i) => molang(v[i] === undefined ? d : v[i], env));
  };
  /**
   * geometries: [{ bones: [{name, parent, pivot, rotation, cubes:[{origin,size}]}] }] (Bedrock JSON), animation: {bones:{name:{position,rotation,scale}}}
   * → [{ geometry, bone, cube, quad: {x0,y0,x1,y1,z}, hidden }]. Rotations are not evaluated (GeoUI layouts have none): a bone
   * that has one is reported in `rotated`.
   */
  function pose(geometries, animation, env) {
    const out = [], rotated = new Set(), anim = (animation && animation.bones) || {};
    geometries.forEach((g, gi) => {
      const bones = g.bones || [], byName = {}, world = {};
      for (const b of bones) byName[b.name] = b;
      const worldOf = (b) => {
        if (world[b.name]) return world[b.name];
        const a = anim[b.name] || {}, piv = b.pivot || [0, 0, 0];
        const pos = vec3(a.position, env, 0), sc = vec3(a.scale, env, 1), rot = vec3(a.rotation, env, 0);
        if ((b.rotation && b.rotation.some((v) => num(v))) || rot.some((v) => v)) rotated.add(b.name);
        let m = mat.mul(mat.t(piv[0] + pos[0], piv[1] + pos[1], piv[2] + pos[2]), mat.mul(mat.s(sc[0], sc[1], sc[2]), mat.t(-piv[0], -piv[1], -piv[2])));
        if (b.parent && byName[b.parent]) m = mat.mul(worldOf(byName[b.parent]), m);
        return (world[b.name] = m);
      };
      for (const b of bones) {
        const m = worldOf(b);
        (b.cubes || []).forEach((c, ci) => {
          const o = c.origin, s = c.size, a = mat.apply(m, [o[0], o[1], o[2]]), z = mat.apply(m, [o[0] + s[0], o[1] + s[1], o[2]]);
          const quad = { x0: Math.min(a[0], z[0]), x1: Math.max(a[0], z[0]), y0: Math.min(a[1], z[1]), y1: Math.max(a[1], z[1]), z: a[2] };
          out.push({ geometry: gi, bone: b.name, cube: ci, quad, hidden: quad.x1 - quad.x0 < 1e-9 || quad.y1 - quad.y0 < 1e-9 });
        });
      }
    });
    return { quads: out, rotated: [...rotated] };
  }
  /** the variables a list of pre_animation lines sets (variable.name, lower case: as the evaluator names them) */
  const ownVars = (lines) => new Set((lines || []).map((l) => /^\s*(?:v|variable)\.(\w+)\s*=[^=]/.exec(l)).filter(Boolean).map((m) => `variable.${m[1].toLowerCase()}`));
  /** run pre_animation statements in env (vars filled in place). opts.stopAtUnset: as the game does — the first line that reads
   *  a variable the lines set but that is not set yet (without ??) is a content error, and the game stops there: that line and
   *  every one after it left undone (env.stoppedAt: its index). opts.ours: a RegExp of more names that are never the game's
   *  own (a variable read but set nowhere — a slip of the pen — stops it just the same) */
  function runPre(lines, env, opts = {}) {
    const set = opts.stopAtUnset ? ownVars(lines) : null, own = set && { has: (n) => set.has(n) || !!(opts.ours && opts.ours.test(n)) };
    delete env.stoppedAt;
    for (let i = 0; i < (lines || []).length; i++) {
      const l = lines[i].replace(/;\s*$/, '');
      if (!own) { molang(l, env); continue; }
      const saved = env.unknown, keep = Object.assign({}, env.vars);
      env.unknown = new Set();
      molang(l, env);
      const bad = [...env.unknown].some((n) => own.has(n));
      env.unknown = new Set([...(saved || []), ...env.unknown]);
      if (bad) { env.vars = keep; env.stoppedAt = i; break; }
    }
    return env;
  }
  /** the variables a pre_animation reads on its first frame before setting them (without ??) — of those it sets itself
   *  (the game's own, like variable.is_paperdoll, are not ours to set) or named like ours (opts.ours, GeoUI's by default). Each
   *  is a content error in the game, and the game leaves every line after it undone, every frame (bds-lab's probe, 2026-10-21).
   *  opts: { props, init: [lines] (initialize), ours } */
  function unsetReads(lines, { props = {}, init = [], ours = /^variable\.geoui_/ } = {}) {
    const own = ownVars(lines), env = envOf({ props });
    runPre(init, env); env.unknown = new Set();
    runPre(lines, env);
    return [...env.unknown].filter((n) => own.has(n) || (ours && ours.test(n))).sort();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Building a pack from a design (what the Blockbench project holds, as plain data)
  // ---------------------------------------------------------------------------------------------------------------
  /*
   design = {
     settings,                                   // settingsOf()
     bones: [{ name, parent, pivot, rotation, cubes: [{ origin, size, faces: { north: { uv, uv_size, texture }, ... } }] }],
                                                 // Bedrock geometry coordinates; the root bone is `geo_ui` (pivot [0,140,0])
     elements: { <bone name>: { type: 'image'|'number'|'gauge', anchor, blend, visible, opacity,
                                gauge: { source, max, fill }, number: { source, digits: [[numeral bone x10] per digit, most significant first], hideLeadingZero } } },
     textures: { <id>: { name, width, height, png: base64 } },
     animations: [ { name, json } ]              // the project's own animations, already in Bedrock JSON (Blockbench compiles them)
   }
  */
  const ROOT = 'geo_ui';
  const PROP_RANGES = (S) => ({
    aspect: [600, 5000, Math.round(qa(S.refAspect) * 1000)], scale: [1, 1000, 100],
    cx: [-3000, 3000, Math.round(S.centerFix.desktop.x * 10000)], cy: [-3000, 3000, Math.round(S.centerFix.desktop.y * 10000)],
    ox: [-4000, 4000, 0], oy: [-4000, 4000, 0], alpha: [0, 100, 100],
    // (an int property is a float32 in the game: past 2^24 it is no longer exact, so the range stops there)
    v0: [-16777216, 16777216, 0], v1: [-16777216, 16777216, 0], v2: [-16777216, 16777216, 0], v3: [-16777216, 16777216, 0],
  });
  /** the pre_animation lines: Studio's, word for word, when the behaviour pack drives them; constants when it does not */
  function preAnimation(S, withScript) {
    const ns = S.ns, H = S.unitsPerScreenH, P = (n) => `q.property('${ns}:${n}')`;
    // (the paper doll — the pause screen's — is a player the game builds for the picture: its properties are not read)
    const guard = (expr, fallback) => (S.hideInPaperdoll ? `variable.is_paperdoll ? ${fallback} : ${expr}` : expr);
    if (!withScript) {
      const c = centerOf(S, 'desktop', false);
      return [`v.geoui_aspect = ${r3(S.refAspect)};`, `v.geoui_halfw = ${r3(H / 2)}*v.geoui_aspect;`, 'v.geoui_scale = 1.0;', 'v.geoui_ox = 0.0;', 'v.geoui_oy = 0.0;',
        'v.geoui_alpha = 1.0;', `v.geoui_cx = ${r3(c.x)};`, `v.geoui_cy = ${r3(c.y)};`];
    }
    return [
      `v.geoui_aspect = ${guard(`${P('aspect')}/1000.0`, r3(S.refAspect))};`,
      `v.geoui_halfw = ${r3(H / 2)}*v.geoui_aspect;`,
      `v.geoui_scale = ${guard(`${P('scale')}/100.0`, '1.0')};`,
      `v.geoui_ox = ${guard(`${P('ox')}/10.0`, '0.0')};`,
      `v.geoui_oy = ${guard(`${P('oy')}/10.0`, '0.0')};`,
      `v.geoui_alpha = ${guard(`${P('alpha')}/100.0`, '1.0')};`,
      `v.geoui_cx = ${guard(`${P('cx')}/10000.0*${r3(H)}`, '0.0')};`,
      `v.geoui_cy = ${guard(`${P('cy')}/10000.0*${r3(H)}`, '0.0')};`,
    ];
  }
  /** Studio's digit: the frame shown in place `place` (10 = blank) */
  function digitExpr(source, place, hideLeadingZero) {
    const a = `math.abs(${source})`, dg = `math.mod(math.floor(${a}/${place}),10)`;
    return place > 1 && hideLeadingZero !== false ? `(${a}<${place} ? 10 : ${dg})` : dg;
  }
  const varOf = (ns, bone, k) => `v.${ns}_${clean(bone, 'e')}_d${k}`;
  /** the transform animation: the whole UI on the root, the aspect term on each anchored element, values on gauges and digits */
  function transformAnimation(design, S) {
    const bones = {}, ref = r3(halfWAt(S, S.refAspect)), extraPre = [];
    // (alpha 0 hides the whole UI by its scale too: the game ignores a render controller's colour alpha with these materials —
    //  bds-lab's probe, geoui_probe 2026-10-21; a fade between needs the colour mask, see timeline/PLAN.md)
    bones[ROOT] = { position: ['v.geoui_ox+v.geoui_cx', 'v.geoui_oy+v.geoui_cy', 0], scale: 'v.geoui_scale*(v.geoui_alpha>0.004?1:0)' };
    for (const [name, el0] of Object.entries(design.elements || {})) {
      const el = el0 || {}, h = hAnchor(el.anchor), ch = {};
      if (h === 'left') ch.position = [`-(v.geoui_halfw-${ref})`, 0, 0];
      if (h === 'right') ch.position = [`(v.geoui_halfw-${ref})`, 0, 0];
      const vis = el.visible && String(el.visible).trim() ? `((${el.visible}) ? 1 : 0)` : null;
      if (el.type === 'gauge') {
        const g = el.gauge || {}, fill = `math.clamp((${g.source || `q.property('${S.ns}:v0')`})/${r3(Math.max(1e-6, num(g.max, 100)))},0,1)`;
        const f = FILLS.includes(g.fill) ? g.fill : 'left', k = vis ? `${fill}*${vis}` : fill, one = vis || 1;
        ch.scale = f === 'bottom' || f === 'top' ? [one, k, one] : [k, one, one];
      } else if (vis) ch.scale = vis;
      if (el.type === 'number' && el.number && Array.isArray(el.number.digits)) {
        const n = el.number, src = n.source || `q.property('${S.ns}:v0')`, D = n.digits.length;
        n.digits.forEach((numerals, k) => {
          const v = varOf(S.ns, name, k), place = Math.pow(10, D - 1 - k);
          extraPre.push(`${v} = ${digitExpr(src, place, n.hideLeadingZero)};`);
          (numerals || []).forEach((bn, j) => { if (bn) bones[bn] = { scale: `${v}==${j}` }; });
        });
      }
      if (Object.keys(ch).length) bones[name] = Object.assign(bones[name] || {}, ch);
    }
    return { json: { loop: true, animation_length: 1, bones }, pre: extraPre };
  }
  /** the bounds (model units) a geometry covers, for its description (the screen at the widest aspect, at least) */
  function visibleBounds(S) {
    const H = S.unitsPerScreenH, w = r3(H * 5 + 32), h = r3(H * 2 + 32);
    return { visible_bounds_width: w, visible_bounds_height: h, visible_bounds_offset: [0, PIVOT_Y, 0] };
  }
  function faceUv(f) {
    const o = { uv: [r4(f.uv[0]), r4(f.uv[1])], uv_size: [r4(f.uv_size[0]), r4(f.uv_size[1])] };
    if (f.rotation) o.uv_rotation = f.rotation;
    return o;
  }
  /** one geometry per texture (a render controller draws one geometry with one texture); every geometry keeps every bone */
  function geometriesOf(design, S) {
    const groups = new Map(), ns = S.ns;
    for (const b of design.bones) for (const c of b.cubes || []) for (const f of Object.values(c.faces || {})) {
      if (f && f.texture != null && !groups.has(f.texture)) groups.set(f.texture, { tex: f.texture });
    }
    const out = [];
    let i = 0;
    for (const [texId] of groups) {
      const tex = (design.textures || {})[texId] || {};
      const id = `${ns}_${clean(tex.name || `t${i}`, `t${i}`)}`;
      i++;
      const bones = design.bones.map((b) => {
        const bone = { name: b.name };
        if (b.parent) bone.parent = b.parent;
        bone.pivot = b.pivot.map(r4);
        if (b.rotation && b.rotation.some((v) => num(v))) bone.rotation = b.rotation.map(r4);
        const cubes = [];
        for (const c of b.cubes || []) {
          const uv = {};
          for (const [face, f] of Object.entries(c.faces || {})) if (f && f.texture === texId) uv[face] = faceUv(f);
          if (!Object.keys(uv).length) continue;
          const cube = { origin: c.origin.map(r4), size: c.size.map(r4), uv };
          if (c.pivot && c.rotation && c.rotation.some((v) => num(v))) { cube.pivot = c.pivot.map(r4); cube.rotation = c.rotation.map(r4); }
          cubes.push(cube);
        }
        if (cubes.length) bone.cubes = cubes;
        return bone;
      });
      out.push({ key: id, texture: texId, texName: clean(tex.name || id, id), json: {
        format_version: '1.12.0',
        'minecraft:geometry': [{ description: Object.assign({ identifier: `geometry.${id}`, texture_width: tex.uvWidth || tex.width || 16, texture_height: tex.uvHeight || tex.height || 16 }, visibleBounds(S)), bones }],
      } });
    }
    return out;
  }
  function materialsFile(S) {
    const ns = S.ns, m = { materials: { version: '1.0.0' } };
    m.materials[`${ns}_base`] = {
      vertexShader: 'shaders/entity.vertex', vrGeometryShader: 'shaders/entity.geometry', fragmentShader: 'shaders/entity.fragment',
      vertexFields: [{ field: 'Position' }, { field: 'Normal' }, { field: 'UV0' }],
      variants: [
        { skinning: { '+defines': ['USE_SKINNING'], vertexFields: [{ field: 'Position' }, { field: 'BoneId0' }, { field: 'Normal' }, { field: 'UV0' }] } },
        { skinning_color: { '+defines': ['USE_SKINNING'], vertexFields: [{ field: 'Position' }, { field: 'BoneId0' }, { field: 'Color' }, { field: 'Normal' }, { field: 'UV0' }] } },
      ],
      msaaSupport: 'Both',
      '+samplerStates': [{ samplerIndex: 0, textureFilter: S.filter === 'Bilinear' ? 'Bilinear' : 'Point' }],
    };
    m.materials[`${ns}_cutout:${ns}_base`] = { '+defines': ['USE_UV_ANIM', 'ALPHA_TEST'] };
    m.materials[`${ns}_blend:${ns}_base`] = { '+defines': ['USE_UV_ANIM'], '+states': ['Blending'], blendSrc: 'SourceAlpha', blendDst: 'OneMinusSrcAlpha' };
    m.materials[`${ns}_add:${ns}_base`] = { '+defines': ['USE_UV_ANIM'], '+states': ['Blending', 'DisableDepthWrite'], blendSrc: 'SourceAlpha', blendDst: 'One' };
    return m;
  }
  /** the HUD: a live_player_renderer in a panel at 10% x 10%, 110% down from the top (Studio's), added to root_panel */
  function hudScreen(S) {
    const ns = S.ns, size = [`${r3(S.panel.size[0])}%`, `${r3(S.panel.size[1])}%`], offset = [S.panel.offset[0] ? `${r3(S.panel.offset[0])}%` : 0, `${r3(S.panel.offset[1])}%`];
    const renderer = {
      type: 'custom', renderer: 'live_player_renderer', layer: 1, animation_reset_name: 'screen_animation_reset',
      anims: ['@common.screen_exit_size_animation_push', '@common.screen_exit_size_animation_pop', '@common.screen_entrance_size_animation_push', '@common.screen_entrance_size_animation_pop'],
      bindings: S.followHud === false ? [] : [{ binding_name: '#hud_visible', binding_name_override: '#visible' }],
    };
    const panel = { type: 'panel', size, offset, anchor_from: 'top_middle', anchor_to: 'top_middle', controls: [{ [`${ns}_renderer`]: renderer }] };
    if (S.hud === 'studio') {
      // Studio's: hud_content copied and replaced (it drops what a newer game adds to hud_content: kept only on request)
      return {
        namespace: 'hud', format_version: '1.8.0', [`${ns}_panel`]: panel,
        hud_content: {
          type: 'panel', $hud_size: ['100%', '100%'], '$hud_player_rend_desktop_offset|default': [15, 15],
          variables: [{ requires: '($compress_hud_width)', $hud_size: ['90%', '100%'] }], size: '$hud_size',
          controls: [{ 'root_panel@hud.root_panel': {} }, { 'camera_renderer@camera_renderer': {} }, { [`${ns}_panel@hud.${ns}_panel`]: {} }],
        },
      };
    }
    return {
      namespace: 'hud',
      [`${ns}_panel`]: panel,
      root_panel: { modifications: [{ array_name: 'controls', operation: 'insert_front', value: [{ [`${ns}_panel@hud.${ns}_panel`]: {} }] }] },
    };
  }
  const VANILLA_RP_PLAYER = "{\"format_version\":\"1.26.0\",\"minecraft:client_entity\":{\"description\":{\"identifier\":\"minecraft:player\",\"materials\":{\"default\":\"entity_alphatest\",\"cape\":\"entity_alphatest\",\"animated\":\"player_animated\",\"spectator\":\"player_spectator\"},\"textures\":{\"default\":\"textures/entity/steve\",\"cape\":\"textures/entity/cape_invisible\"},\"geometry\":{\"default\":\"geometry.humanoid.custom\",\"cape\":\"geometry.cape\"},\"scripts\":{\"scale\":\"0.9375\",\"initialize\":[\"variable.is_holding_right = 0.0;\",\"variable.is_blinking = 0.0;\",\"variable.last_blink_time = 0.0;\",\"variable.hand_bob = 0.0;\"],\"pre_animation\":[\"variable.helmet_layer_visible = !query.has_head_gear;\",\"variable.leg_layer_visible = 1.0;\",\"variable.boot_layer_visible = 1.0;\",\"variable.chest_layer_visible = 1.0;\",\"variable.attack_body_rot_y = Math.sin(360*Math.sqrt(variable.attack_time)) * 5.0;\",\"variable.tcos0 = (math.cos(query.modified_distance_moved * 38.17) * query.modified_move_speed / variable.gliding_speed_value) * 57.3;\",\"variable.first_person_rotation_factor = math.sin((1 - variable.attack_time) * 180.0);\",\"variable.hand_bob = query.life_time < 0.01 ? 0.0 : variable.hand_bob + ((query.is_on_ground && query.is_alive ? math.clamp(math.sqrt(math.pow(query.position_delta(0), 2.0) + math.pow(query.position_delta(2), 2.0)), 0.0, 0.1) : 0.0) - variable.hand_bob) * 0.02;\",\"variable.map_angle = math.clamp(1 - variable.player_x_rotation / 45.1, 0.0, 1.0);\",\"variable.item_use_normalized = query.main_hand_item_use_duration / query.main_hand_item_max_duration;\",\"variable.riding_y_offset = query.is_riding_any_entity_of_type('minecraft:minecart', 'minecraft:boat', 'minecraft:chest_boat', 'minecraft:strider') ? -3.0 : 0.0;\"],\"animate\":[\"root\"],\"variables\":{\"variable.fp_melee_spear_use_attachable_rotation_z\":\"public\",\"variable.tp_melee_spear_use_attachable_rotation_z\":\"public\",\"variable.fp_melee_spear_attack_attachable_rotation_z\":\"public\",\"variable.tp_melee_spear_attack_attachable_position_z\":\"public\",\"variable.attack_time\":\"public\",\"variable.item_use_normalized\":\"public\"},\"should_update_effects_offscreen\":\"1.0\"},\"animations\":{\"root\":\"controller.animation.player.root\",\"base_controller\":\"controller.animation.player.base\",\"hudplayer\":\"controller.animation.player.hudplayer\",\"humanoid_base_pose\":\"animation.humanoid.base_pose\",\"look_at_target\":\"controller.animation.humanoid.look_at_target\",\"look_at_target_ui\":\"animation.player.look_at_target.ui\",\"look_at_target_default\":\"animation.humanoid.look_at_target.default\",\"look_at_target_gliding\":\"animation.humanoid.look_at_target.gliding\",\"look_at_target_swimming\":\"animation.humanoid.look_at_target.swimming\",\"look_at_target_inverted\":\"animation.player.look_at_target.inverted\",\"cape\":\"animation.player.cape\",\"move.arms\":\"animation.player.move.arms\",\"move.legs\":\"animation.player.move.legs\",\"swimming\":\"animation.player.swim\",\"swimming.legs\":\"animation.player.swim.legs\",\"riding.arms\":\"animation.player.riding.arms\",\"riding.legs\":\"animation.player.riding.legs\",\"holding\":\"animation.player.holding\",\"brandish_spear\":\"animation.humanoid.brandish_spear\",\"charging\":\"animation.humanoid.charging\",\"attack.positions\":\"animation.player.attack.positions\",\"attack.rotations\":\"animation.player.attack.rotations\",\"sneaking\":\"animation.player.sneaking\",\"bob\":\"animation.player.bob\",\"damage_nearby_mobs\":\"animation.humanoid.damage_nearby_mobs\",\"bow_and_arrow\":\"animation.humanoid.bow_and_arrow\",\"use_item_progress\":\"animation.humanoid.use_item_progress\",\"skeleton_attack\":\"animation.skeleton.attack\",\"sleeping\":\"animation.player.sleeping\",\"first_person_base_pose\":\"animation.player.first_person.base_pose\",\"first_person_empty_hand\":\"animation.player.first_person.empty_hand\",\"first_person_swap_item\":\"animation.player.first_person.swap_item\",\"first_person_attack_controller\":\"controller.animation.player.first_person_attack\",\"first_person_attack_rotation\":\"animation.player.first_person.attack_rotation\",\"first_person_attack_rotation_item\":\"animation.player.first_person.attack_rotation_item\",\"first_person_vr_attack_rotation\":\"animation.player.first_person.vr_attack_rotation\",\"first_person_walk\":\"animation.player.first_person.walk\",\"first_person_map_controller\":\"controller.animation.player.first_person_map\",\"first_person_map_hold\":\"animation.player.first_person.map_hold\",\"first_person_map_hold_attack\":\"animation.player.first_person.map_hold_attack\",\"first_person_map_hold_off_hand\":\"animation.player.first_person.map_hold_off_hand\",\"first_person_map_hold_main_hand\":\"animation.player.first_person.map_hold_main_hand\",\"first_person_crossbow_equipped\":\"animation.player.first_person.crossbow_equipped\",\"first_person_crossbow_hold\":\"animation.player.first_person.crossbow_hold\",\"first_person_breathing_bob\":\"animation.player.first_person.breathing_bob\",\"third_person_crossbow_equipped\":\"animation.player.crossbow_equipped\",\"third_person_bow_equipped\":\"animation.player.bow_equipped\",\"crossbow_hold\":\"animation.player.crossbow_hold\",\"crossbow_controller\":\"controller.animation.player.crossbow\",\"shield_block_main_hand\":\"animation.player.shield_block_main_hand\",\"shield_block_off_hand\":\"animation.player.shield_block_off_hand\",\"blink\":\"controller.animation.persona.blink\",\"fishing_rod\":\"animation.humanoid.fishing_rod\",\"holding_spyglass\":\"animation.humanoid.holding_spyglass\",\"first_person_shield_block\":\"animation.player.first_person.shield_block\",\"tooting_goat_horn\":\"animation.humanoid.tooting_goat_horn\",\"holding_brush\":\"animation.humanoid.holding_brush\",\"brushing\":\"animation.humanoid.brushing\",\"crawling\":\"animation.player.crawl\",\"crawling.legs\":\"animation.player.crawl.legs\",\"swimming.no_right_arm\":\"animation.player.swim.no_right_arm\",\"crawling.no_right_arm\":\"animation.player.crawl.no_right_arm\",\"riding.root\":\"animation.player.riding.root\",\"holding_heavy_core\":\"animation.player.holding_heavy_core\",\"first_person_melee_spear_use\":\"animation.player.first_person.melee_spear_use\",\"first_person_melee_spear_hold\":\"animation.player.first_person.melee_spear_hold\",\"first_person_melee_spear_attack\":\"animation.player.first_person.melee_spear_attack\",\"first_person_melee_spear_controller\":\"controller.animation.player.first_person_melee_spear\",\"third_person_melee_spear_use\":\"animation.humanoid.melee_spear_use\",\"third_person_melee_spear_hold\":\"animation.humanoid.melee_spear_hold\",\"third_person_melee_spear_attack\":\"animation.player.melee_spear_attack\",\"third_person_melee_spear_controller\":\"controller.animation.player.melee_spear\"},\"render_controllers\":[{\"controller.render.player.first_person_spectator\":\"variable.is_first_person && query.is_spectator\"},{\"controller.render.player.third_person_spectator\":\"!variable.is_first_person && !variable.map_face_icon && query.is_spectator\"},{\"controller.render.player.first_person\":\"variable.is_first_person && !query.is_spectator\"},{\"controller.render.player.third_person\":\"!variable.is_first_person && !variable.map_face_icon && !query.is_spectator\"},{\"controller.render.player.map\":\"variable.map_face_icon\"}],\"enable_attachables\":true}}}";
  const VANILLA_BP_PLAYER = "{\"format_version\":\"1.26.30\",\"minecraft:entity\":{\"description\":{\"identifier\":\"minecraft:player\",\"is_summonable\":false,\"is_spawnable\":false,\"spawn_category\":\"creature\"},\"components\":{\"minecraft:attack\":{\"damage\":1},\"minecraft:block_climber\":{},\"minecraft:breathable\":{\"generates_bubbles\":false,\"inhale_time\":3.75,\"suffocate_time\":-1,\"total_supply\":15},\"minecraft:can_climb\":{},\"minecraft:collision_box\":{\"height\":1.8,\"width\":0.6},\"minecraft:conditional_bandwidth_optimization\":{},\"minecraft:environment_sensor\":{\"triggers\":{\"event\":\"minecraft:gain_raid_omen\",\"filters\":{\"all_of\":[{\"subject\":\"self\",\"test\":\"has_mob_effect\",\"value\":\"bad_omen\"},{\"subject\":\"self\",\"test\":\"is_in_village\",\"value\":true}]}}},\"minecraft:exhaustion_values\":{\"sprint\":0.1,\"jump\":0.05,\"attack\":0.1,\"damage\":0.1,\"heal\":6.0,\"lunge\":4.0,\"sprint_jump\":0.2,\"mine\":0.005,\"swim\":0.01,\"walk\":0.0},\"minecraft:experience_reward\":{\"on_death\":\"Math.Min(query.player_level * 7, 100)\"},\"minecraft:hurt_on_condition\":{\"damage_conditions\":[{\"cause\":\"lava\",\"damage_per_tick\":4,\"filters\":{\"operator\":\"==\",\"test\":\"in_lava\",\"subject\":\"self\",\"value\":true}}]},\"minecraft:insomnia\":{\"days_until_insomnia\":3},\"minecraft:is_hidden_when_invisible\":{},\"minecraft:loot\":{\"table\":\"loot_tables/empty.json\"},\"minecraft:movement\":{\"value\":0.1},\"minecraft:nameable\":{\"allow_name_tag_renaming\":false,\"always_show\":true},\"minecraft:physics\":{\"push_towards_closest_space\":true},\"minecraft:player.exhaustion\":{\"max\":20,\"value\":0},\"minecraft:player.experience\":{\"max\":1,\"value\":0},\"minecraft:player.level\":{\"max\":24791,\"value\":0},\"minecraft:player.saturation\":{\"max\":20,\"value\":5},\"minecraft:pushable_by_block\":{},\"minecraft:apply_knockback_rules\":{\"presets\":[{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"bouncy\"},\"horizontal_power\":0.165,\"vertical_power\":0.105,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"regular\"},\"horizontal_power\":0.165,\"vertical_power\":0.105,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"slow_bouncy\"},\"horizontal_power\":0.165,\"vertical_power\":0.24,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"slow_flat\"},\"horizontal_power\":0.165,\"vertical_power\":0.105,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"fast_flat\"},\"horizontal_power\":0.365,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"light\"},\"horizontal_power\":0.165,\"vertical_power\":0.18,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"fast_sliding\"},\"horizontal_power\":0.265,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"slow_sliding\"},\"horizontal_power\":0.165,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"sticky\"},\"horizontal_power\":0.165,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"high_resistance\"},\"horizontal_power\":0.165,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"explosive\"},\"horizontal_power\":0.165,\"vertical_power\":0.09,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"},{\"filter\":{\"test\":\"enum_property\",\"subject\":\"other\",\"domain\":\"minecraft:sulfur_cube_archetype\",\"value\":\"hot\"},\"horizontal_power\":0.165,\"vertical_power\":0.105,\"vertical_velocity_cap\":8.0,\"slowdown_scale\":1.0,\"scale_with_damage\":true,\"knockback_mode\":\"hit_direction\",\"extra_knockback_approach\":\"multiply_reduced\"}]},\"minecraft:rideable\":{\"family_types\":[\"parrot_tame\"],\"pull_in_entities\":true,\"seat_count\":2,\"seats\":[{\"lock_rider_rotation\":0,\"min_rider_count\":0,\"max_rider_count\":0,\"position\":[0.4,-0.2,-0.1]},{\"lock_rider_rotation\":0,\"min_rider_count\":1,\"max_rider_count\":2,\"position\":[-0.4,-0.2,-0.1]}]},\"minecraft:type_family\":{\"family\":[\"player\"]}},\"component_groups\":{\"minecraft:add_raid_omen\":{\"minecraft:spell_effects\":{\"add_effects\":[{\"display_on_screen_animation\":true,\"duration\":30,\"effect\":\"raid_omen\"}],\"remove_effects\":\"bad_omen\"},\"minecraft:timer\":{\"looping\":false,\"time\":[0.0,0.0],\"time_down_event\":{\"event\":\"minecraft:clear_add_raid_omen\",\"target\":\"self\"}}},\"minecraft:clear_raid_omen_spell_effect\":{\"minecraft:spell_effects\":{}},\"minecraft:raid_trigger\":{\"minecraft:raid_trigger\":{\"triggered_event\":{\"event\":\"minecraft:remove_raid_trigger\",\"target\":\"self\"}}}},\"events\":{\"minecraft:clear_add_raid_omen\":{\"add\":{\"component_groups\":[\"minecraft:clear_raid_omen_spell_effect\"]},\"remove\":{\"component_groups\":[\"minecraft:add_raid_omen\"]}},\"minecraft:remove_raid_trigger\":{\"remove\":{\"component_groups\":[\"minecraft:raid_trigger\"]}},\"minecraft:gain_raid_omen\":{\"add\":{\"component_groups\":[\"minecraft:add_raid_omen\"]}},\"minecraft:trigger_raid\":{\"add\":{\"component_groups\":[\"minecraft:raid_trigger\"]}}}}}";

  function uuidFrom(seed) {   // a stable UUID v4-shaped id from text (FNV-1a, 4 rounds): the same project keeps its pack ids
    const hex = [];
    for (let r = 0; r < 4; r++) {
      let h = 0x811c9dc5 ^ (r * 0x9e3779b9);
      for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      hex.push((h >>> 0).toString(16).padStart(8, '0'));
    }
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${((parseInt(s[16], 16) & 3) | 8).toString(16)}${s.slice(17, 20)}-${s.slice(20, 32)}`;
  }
  /** the behaviour pack's script: properties from the platform or what the player set before; typed commands; no silent failure */
  function scriptOf(S) {
    const R = PROP_RANGES(S), cfg = {
      ns: S.ns, ranges: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, [v[0], v[1]]])),
      aspect: { desktop: S.platformAspect.Desktop, mobile: S.platformAspect.Mobile, console: S.platformAspect.Console },
      center: Object.fromEntries(['desktop', 'mobile', 'console'].map((k) => [k, { cx: Math.round(S.centerFix[k].x * 10000), cy: Math.round(S.centerFix[k].y * 10000) }])),
      centerAuto: S.centerAuto !== false,
    };
    return `// GeoUI Builder ${VERSION}: the properties the resource pack reads (q.property('${S.ns}:…')), set per player.
// /${S.ns}:set <name> <value> · /${S.ns}:aspect <width> <height> · /${S.ns}:get · /${S.ns}:reset
// /scriptevent ${S.ns}:set <name> <value>   (from a command block or another pack: the source player, else everyone)
// scoreboard ${S.ns}_v0 … ${S.ns}_v3 (if you add them) are copied to v0 … v3 every 2 ticks.
import { world, system, Player, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from '@minecraft/server';

const CFG = ${JSON.stringify(cfg)};
const NS = CFG.ns;
const KEEP = ['aspect', 'scale', 'cx', 'cy', 'ox', 'oy', 'alpha'];

function platformOf(p) {
  try { const t = String(p.clientSystemInfo.platformType); return t === 'Mobile' ? 'mobile' : t === 'Console' ? 'console' : 'desktop'; } catch { return 'desktop'; }
}
/** '' or why not (out of range, not an integer, unknown name): nothing is dropped silently */
function setOne(p, name, value, keep) {
  const r = CFG.ranges[name];
  if (!r) return \`\${NS}: unknown property \${name} (\${Object.keys(CFG.ranges).join(', ')})\`;
  if (!Number.isInteger(value) || value < r[0] || value > r[1]) return \`\${NS}:\${name} must be an integer \${r[0]}..\${r[1]} (got \${value})\`;
  p.setProperty(\`\${NS}:\${name}\`, value);
  if (keep && KEEP.includes(name)) p.setDynamicProperty(\`\${NS}:\${name}\`, value);
  return '';
}
function restore(p) {
  const pl = platformOf(p), def = { aspect: CFG.aspect[pl], cx: CFG.centerAuto ? CFG.center[pl].cx : CFG.center.desktop.cx, cy: CFG.centerAuto ? CFG.center[pl].cy : CFG.center.desktop.cy };
  for (const name of KEEP) {
    let v; try { v = p.getDynamicProperty(\`\${NS}:\${name}\`); } catch { v = undefined; }
    if (typeof v !== 'number') v = def[name];
    if (typeof v === 'number') setOne(p, name, v, false);
  }
}
function reset(p) {
  for (const name of KEEP) { try { p.setDynamicProperty(\`\${NS}:\${name}\`, undefined); } catch { /* left */ } }
  for (const name of ['scale', 'ox', 'oy', 'alpha']) p.resetProperty(\`\${NS}:\${name}\`);
  restore(p);
}
world.afterEvents.playerSpawn.subscribe((e) => { if (e.initialSpawn) system.run(() => { if (e.player.isValid) restore(e.player); }); });
world.afterEvents.worldLoad.subscribe(() => { for (const p of world.getAllPlayers()) restore(p); });

system.beforeEvents.startup.subscribe((e) => {
  const reg = e.customCommandRegistry, ANY = CommandPermissionLevel.Any;
  const who = (o) => { const s = o.initiator ?? o.sourceEntity; return s instanceof Player ? s : undefined; };
  const reply = (p, text) => system.run(() => { if (p && p.isValid) p.sendMessage(text); else console.warn(text); });
  reg.registerEnum(\`\${NS}:property\`, Object.keys(CFG.ranges));
  reg.registerCommand({ name: \`\${NS}:set\`, description: 'GeoUI: set one of your properties', permissionLevel: ANY,
    mandatoryParameters: [{ name: \`\${NS}:property\`, type: CustomCommandParamType.Enum }, { name: 'value', type: CustomCommandParamType.Integer }] },
  (o, name, value) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (!p.isValid) return; const why = setOne(p, name, value, true); reply(p, why || \`\${NS}:\${name} = \${value}\`); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: \`\${NS}:aspect\`, description: 'GeoUI: your screen size (e.g. 2340 1080)', permissionLevel: ANY,
    mandatoryParameters: [{ name: 'width', type: CustomCommandParamType.Integer }, { name: 'height', type: CustomCommandParamType.Integer }] },
  (o, w, h) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    if (!(w > 0 && h > 0)) return { status: CustomCommandStatus.Failure, message: 'width and height must be positive' };
    system.run(() => { if (!p.isValid) return; const a = Math.round(w / h * 1000), why = setOne(p, 'aspect', a, true); reply(p, why || \`\${NS}:aspect = \${a}\`); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: \`\${NS}:get\`, description: 'GeoUI: show your properties', permissionLevel: ANY },
  (o) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) reply(p, Object.keys(CFG.ranges).map((k) => \`\${k}=\${p.getProperty(\`\${NS}:\${k}\`)}\`).join(' ')); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: \`\${NS}:reset\`, description: 'GeoUI: back to the defaults of your device', permissionLevel: ANY },
  (o) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) { reset(p); reply(p, \`\${NS}: reset\`); } });
    return { status: CustomCommandStatus.Success };
  });
});

system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id !== \`\${NS}:set\`) return;
  const [name, raw] = String(e.message).trim().split(/\\s+/), value = Number(raw);
  const targets = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) { const why = setOne(p, name, value, true); if (why) console.warn(why); }
}, { namespaces: [NS] });

system.runInterval(() => {
  for (let i = 0; i < 4; i++) {
    const o = world.scoreboard.getObjective(\`\${NS}_v\${i}\`);
    if (!o) continue;
    const r = CFG.ranges[\`v\${i}\`];
    for (const p of world.getAllPlayers()) {
      if (!o.hasParticipant(p)) continue;
      const s = o.getScore(p);
      if (s === undefined) continue;
      const v = Math.min(r[1], Math.max(r[0], s));
      if (p.getProperty(\`\${NS}:v\${i}\`) !== v) p.setProperty(\`\${NS}:v\${i}\`, v);
    }
  }
}, 2);
`;
  }

  /**
   * design → { files: {path: string | Uint8Array | {base64}}, report: [lines], warnings: [lines] }
   * Paths are inside the .mcaddon: <ns>_RP/…, <ns>_BP/….
   */
  function buildPack(design) {
    const S = settingsOf(design.settings), ns = S.ns, warnings = [], files = {};
    const withScript = S.bp !== false;
    // (the .mcaddon layout bds-lab's own `pack` writes: one folder per pack at the top)
    const rpDir = `${ns}_RP`, bpDir = `${ns}_BP`;
    if (!design.bones || !design.bones.find((b) => b.name === ROOT)) warnings.push(`いちばん上のボーン ${ROOT} がありません（GeoUI → 新しいプロジェクトで作ると入ります）`);
    for (const [name, el] of Object.entries(design.elements || {})) {
      for (const [what, src] of [['表示の条件', el.visible], ['ゲージの値', el.gauge && el.gauge.source], ['数字の値', el.number && el.number.source], ['不透明度', el.opacity]]) {
        if (src && String(src).trim() && typeof src !== 'number') { const why = molangError(src); if (why) warnings.push(`${name}: ${what}「${src}」が読めません: ${why}`); }
      }
    }
    const geos = geometriesOf(design, S);
    if (!geos.length) warnings.push('テクスチャの付いた面がひとつもありません（何も描かれません）');
    const tr = transformAnimation(design, S);
    const pre = [...preAnimation(S, withScript), ...tr.pre];
    const animations = { [`animation.${ns}_transform`]: tr.json };
    for (const a of design.animations || []) if (a && a.name && a.json) animations[a.name.startsWith('animation.') ? a.name : `animation.${a.name}`] = a.json;
    const used = new Set(['cutout']);
    for (const el of Object.values(design.elements || {})) if (BLENDS.includes(el && el.blend)) used.add(el.blend);

    // render controllers: one per geometry; materials by element (a whole element and its children, by bone name prefix)
    const controllers = {}, rcList = [], entityGeo = {}, entityTex = {};
    const cond = ['q.is_in_ui', ...(S.hideInPaperdoll ? ['!variable.is_paperdoll'] : [])].join(' && ');
    const descendants = (name) => { const out = [name]; for (const b of design.bones) if (b.parent && out.includes(b.parent) && !out.includes(b.name)) out.push(b.name); return out; };
    for (const g of geos) {
      const mats = [{ '*': `material.${ns}_cutout` }];
      for (const [name, el] of Object.entries(design.elements || {})) {
        if (el && el.blend && el.blend !== 'cutout' && BLENDS.includes(el.blend)) for (const bn of descendants(name)) mats.push({ [bn]: `material.${ns}_${el.blend}` });
      }
      controllers[`controller.render.${g.key}`] = {
        geometry: `Geometry.${g.key}`, materials: mats, textures: [`Texture.${g.key}`],
        uv_anim: { offset: [0, 0], scale: [1, 1] },
        color: { r: 1, g: 1, b: 1, a: 'v.geoui_alpha' },
        is_hurt_color: { r: 0, g: 0, b: 0, a: 0 }, on_fire_color: { r: 0, g: 0, b: 0, a: 0 },
      };
      rcList.push({ [`controller.render.${g.key}`]: cond });
      entityGeo[g.key] = `geometry.${g.key}`;
      entityTex[g.key] = `textures/${ns}/${g.texName}`;
      files[`${rpDir}/models/entity/${ns}/${g.texName}.geo.json`] = J(g.json);
      const tex = (design.textures || {})[g.texture];
      if (tex && tex.png) files[`${rpDir}/textures/${ns}/${g.texName}.png`] = { base64: tex.png };
      else warnings.push(`テクスチャ ${g.texName} の画像がありません`);
    }
    const U = S.uuids || { rp: uuidFrom(`${ns}:rp:${design.seed || ''}`), rpMod: uuidFrom(`${ns}:rp-mod:${design.seed || ''}`), bp: uuidFrom(`${ns}:bp:${design.seed || ''}`),
      bpData: uuidFrom(`${ns}:bp-data:${design.seed || ''}`), bpScript: uuidFrom(`${ns}:bp-script:${design.seed || ''}`) };
    const rpUuid = U.rp, bpUuid = U.bp;
    files[`${rpDir}/manifest.json`] = J({
      format_version: 2,
      header: { name: `${S.name} RP`, description: S.description, uuid: rpUuid, version: S.version, min_engine_version: S.minEngine },
      modules: [{ type: 'resources', uuid: U.rpMod, version: [1, 0, 0] }],
    });
    files[`${rpDir}/materials/entity.material`] = J(materialsFile(S));
    files[`${rpDir}/render_controllers/${ns}.render_controllers.json`] = J({ format_version: '1.8.0', render_controllers: controllers });
    files[`${rpDir}/animations/${ns}.animation.json`] = J({ format_version: '1.8.0', animations });
    files[`${rpDir}/ui/hud_screen.json`] = J(hudScreen(S));

    const ce = JSON.parse(VANILLA_RP_PLAYER), d = ce['minecraft:client_entity'].description;
    for (const b of used) d.materials[`${ns}_${b}`] = `${ns}_${b}`;
    Object.assign(d.textures, entityTex);
    Object.assign(d.geometry, entityGeo);
    d.scripts.pre_animation.push(...pre);
    const animate = [{ [`${ns}_transform`]: 'q.is_in_ui' }];
    d.animations[`${ns}_transform`] = `animation.${ns}_transform`;
    for (const a of design.animations || []) {
      const full = a.name.startsWith('animation.') ? a.name : `animation.${a.name}`, base = clean(full.replace(/^animation\./, ''), 'anim');
      const short = base.startsWith(`${ns}_`) ? base : `${ns}_${base}`;
      d.animations[short] = full; animate.push({ [short]: a.condition || 'q.is_in_ui' });
    }
    d.scripts.animate = [...animate, ...d.scripts.animate];
    d.render_controllers = [...rcList, ...d.render_controllers];
    files[`${rpDir}/entity/player.entity.json`] = J(ce);
    const lang = `pack.name=${String(S.name).replace(/[\r\n=]/g, ' ')}\npack.description=${String(S.description).replace(/[\r\n=]/g, ' ')}\n`;
    // (the pack redefines minecraft:player: its name is given again, the game's own words)
    files[`${rpDir}/texts/languages.json`] = J(['en_US', 'ja_JP']);
    files[`${rpDir}/texts/en_US.lang`] = `${lang}entity.minecraft:player.name=Player\n`; files[`${rpDir}/texts/ja_JP.lang`] = `${lang}entity.minecraft:player.name=プレイヤー\n`;

    if (withScript) {
      const props = {};
      for (const [k, [a, b, def]] of Object.entries(PROP_RANGES(S))) props[`${ns}:${k}`] = { client_sync: true, type: 'int', range: [a, b], default: Math.min(b, Math.max(a, def)) };
      const be = JSON.parse(VANILLA_BP_PLAYER);
      be['minecraft:entity'].description.properties = props;
      files[`${bpDir}/manifest.json`] = J({
        format_version: 2,
        header: { name: `${S.name} BP`, description: S.description, uuid: bpUuid, version: S.version, min_engine_version: S.minEngine },
        modules: [{ type: 'data', uuid: U.bpData, version: [1, 0, 0] },
          { type: 'script', language: 'javascript', uuid: U.bpScript, entry: 'scripts/main.js', version: [1, 0, 0] }],
        dependencies: [{ uuid: rpUuid, version: S.version }, { module_name: '@minecraft/server', version: '2.1.0' }],
      });
      files[`${bpDir}/entities/player.json`] = J(be);
      // (the player's loot table, as the vanilla behaviour pack has it: the pack does not lean on another pack's file)
      files[`${bpDir}/loot_tables/empty.json`] = J({ pools: [] });
      files[`${bpDir}/scripts/main.js`] = scriptOf(S);
      files[`${bpDir}/texts/languages.json`] = J(['en_US', 'ja_JP']);
      files[`${bpDir}/texts/en_US.lang`] = lang; files[`${bpDir}/texts/ja_JP.lang`] = lang;
    }
    const report = [
      `GeoUI Builder ${VERSION}: ${ns}（画面の高さ ${r3(S.unitsPerScreenH)} 単位・基準の画面比 ${r3(S.refAspect)}・HUD の枠 ${S.panel.size.join('% x ')}% / ${S.panel.offset[1]}%）`,
      `要素 ${Object.keys(design.elements || {}).length} ・ジオメトリ ${geos.length} ・アニメーション ${Object.keys(animations).length} ・${withScript ? 'ビヘイビアパックあり（スクリプトで画面比と中心を決める）' : 'リソースパックだけ（画面比 ' + r3(S.refAspect) + ' に固定）'}`,
    ];
    return { files, report, warnings, settings: S, pre, animation: tr.json, geometries: geos.map((g) => g.json) };
  }

  /** where each element is drawn (model units) for an aspect, platform and properties — the exporter's own Molang, run */
  function layoutOf(built, { aspect, platform = 'desktop', props = {}, isPaperdoll = 0 } = {}) {
    const S = built.settings, ns = S.ns, R = PROP_RANGES(S), p = {};
    for (const [k, v] of Object.entries(R)) p[`${ns}:${k}`] = v[2];
    if (aspect) p[`${ns}:aspect`] = Math.round(qa(aspect) * 1000);
    const c = S.centerFix[platform] || S.centerFix.desktop;
    p[`${ns}:cx`] = Math.round(c.x * 10000); p[`${ns}:cy`] = Math.round(c.y * 10000);
    Object.assign(p, props);
    const env = envOf({ props: p, isPaperdoll });
    runPre(built.pre, env);
    const geos = built.geometries.map((g) => g['minecraft:geometry'][0]);
    return Object.assign(pose(geos, built.animation, env), { vars: env.vars, unknown: env.unknown ? [...env.unknown] : [] });
  }

  return {
    VERSION, STUDIO, MEASURED, CALIBRATIONS, DEVICES, ANCHORS, BLENDS, FILLS, PIVOT_Y, ROOT,
    num, r3, r4, clean, qa, defaults, newProjectSettings, frameScreen, settingsOf, halfWAt, centerOf, screenAt, hAnchor, vAnchor, padsOf, studioAnchor,
    parse, evaluate, molang, molangError, envOf, pose, runPre, unsetReads, digitExpr, preAnimation, transformAnimation,
    geometriesOf, materialsFile, hudScreen, scriptOf, buildPack, layoutOf, uuidFrom, PROP_RANGES,
  };
})();

if (typeof module === 'object' && module && module.exports && typeof BBPlugin === 'undefined') module.exports = GeoUICore;

// =====================================================================================================================
// The Blockbench side: a GeoUI project format, the screen frame in the viewport, elements, the preview, the export.
// Coordinates: GeoUICore works in Bedrock geometry units (x = to the right of the screen); Blockbench keeps x mirrored
// (its Bedrock codec turns x into -x), so every point crosses with toBB / fromBB.
// =====================================================================================================================
if (typeof BBPlugin !== 'undefined') (function () {
  const G = GeoUICore, FORMAT_ID = 'geoui';
  const toBB = (v) => [-v[0], v[1], v[2]], fromBB = (v) => [-v[0], v[1], v[2]];
  const state = { format: null, menu: null, overlay: null, actions: [], props: [], listeners: [], bridge: null };
  const isGeo = () => typeof Format !== 'undefined' && Format && Format.id === FORMAT_ID && typeof Project !== 'undefined' && Project;
  const say = (text, kind) => Blockbench.showQuickMessage(text, kind === 'error' ? 3500 : 2000);

  // ---------------------------------------------------------------- settings (kept in the .bbmodel)
  function settings() {
    if (typeof Project === 'undefined' || !Project) return G.settingsOf({});
    if (!Project.geoui_settings || typeof Project.geoui_settings !== 'object' || !Object.keys(Project.geoui_settings).length) Project.geoui_settings = G.defaults();
    return G.settingsOf(Project.geoui_settings);
  }
  function setSettings(patch) {
    Project.geoui_settings = G.settingsOf(Object.assign({}, settings(), patch || {}));
    Project.saved = false;
    refreshOverlay();
    return Project.geoui_settings;
  }

  // ---------------------------------------------------------------- the outliner
  const rootOf = () => Group.all.find((g) => g.name === G.ROOT && !(g.parent instanceof Group));
  function ensureRoot() {
    let r = rootOf();
    if (!r) r = new Group({ name: G.ROOT, origin: toBB([0, G.PIVOT_Y, 0]) }).init();
    return r;
  }
  function uniqueName(base) {
    const b = G.clean(base, 'ui'), names = new Set(Group.all.map((g) => g.name).concat(Cube.all.map((c) => c.name)));
    let n = b, i = 1;
    while (names.has(n)) n = `${b}_${++i}`;
    return n;
  }
  /** the next layer: Studio's -0.2 per layer, towards the camera */
  function nextZ() {
    let z = 0;
    for (const c of Cube.all) z = Math.min(z, c.from[2], c.to[2]);
    return G.r3(z + G.STUDIO.layerZ);
  }
  const q4 = (v) => v.map((x) => G.r4(x) + 0);
  function group(name, parent, pivot, meta) {
    const g = new Group({ name, origin: q4(toBB(pivot)) });
    g.addTo(parent || ensureRoot()).init();
    if (meta) g.geoui = meta;
    return g;
  }
  /** a flat cube facing the camera (north face only), box in Bedrock units {x0, y0, x1, y1, z} */
  function plane(name, parent, box, tex, uv) {
    const off = { uv: [0, 0, 0, 0], texture: null };
    const c = new Cube({
      name, from: q4([-box.x1, box.y0, box.z]), to: q4([-box.x0, box.y1, box.z]), origin: parent.origin.slice(), box_uv: false,
      faces: { north: { uv: uv.slice(), texture: tex ? tex.uuid : false }, south: off, east: off, west: off, up: off, down: off },
    });
    c.addTo(parent).init();
    return c;
  }
  function textureFrom(name, dataUrl, w, h) {
    const t = new Texture({ name: G.clean(name, 'ui') }).fromDataURL(dataUrl);
    t.uv_width = w; t.uv_height = h;
    t.add(false);
    return t;
  }
  const imageSize = (dataUrl) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => no(new Error('画像を読めません')); im.src = dataUrl; });

  // pictures the plugin draws itself: a digit strip (0-9 and a blank cell) and a gauge
  const FONT = ['01110100011001110101110011000101110', '00100011000010000100001000010001110', '01110100010000100010001000100011111', '11111000100010000010000011000101110',
    '00010001100101010010111110001000010', '11111100001111000001000011000101110', '00110010001000011110100011000101110', '11111000010001000100010000100001000',
    '01110100011000101110100011000101110', '01110100011000101111000010001001100'];
  function digitStrip(color = '#ffffff', outline = '#000000') {
    const cw = 12, ch = 16, c = document.createElement('canvas'); c.width = cw * 11; c.height = ch;
    const x = c.getContext('2d');
    for (let d = 0; d < 10; d++) {
      const ox = d * cw + 1, oy = 1, on = (i, j) => i >= 0 && i < 5 && j >= 0 && j < 7 && FONT[d][j * 5 + i] === '1';
      for (let j = -1; j <= 7; j++) for (let i = -1; i <= 5; i++) {
        let fill = null;
        if (on(i, j)) fill = color;
        else if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => on(i + a, j + b))) fill = outline;
        if (fill) { x.fillStyle = fill; x.fillRect(ox + (i + 0.5) * 2, oy + (j + 0.5) * 2, 2, 2); }
      }
    }
    return { dataUrl: c.toDataURL('image/png'), w: cw * 11, h: ch, cells: 11 };
  }
  function gaugeImage(from = '#3B5BFF', to = '#8B5CF6') {
    const w = 64, h = 8, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, from); g.addColorStop(1, to);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 0, w, 2);
    return { dataUrl: c.toDataURL('image/png'), w, h };
  }

  /** where a w x h box goes: an anchor and pads (Studio's padX / padY, model units), or a centre (x, y relative to the screen centre) */
  function placeBox(S, w, h, o) {
    let cx = G.num(o.x, 0), cy = G.num(o.y, 0);
    if (o.padX != null || o.padY != null) { const a = G.studioAnchor(S, w, h, o.anchor, G.num(o.padX), G.num(o.padY), S.refAspect); cx = a.x; cy = a.y; }
    const z = o.z != null ? G.num(o.z) : nextZ();
    return { x0: cx - w / 2, x1: cx + w / 2, y0: G.PIVOT_Y + cy - h / 2, y1: G.PIVOT_Y + cy + h / 2, z, cx, cy: G.PIVOT_Y + cy };
  }

  // ---------------------------------------------------------------- elements
  /** an image: {name, dataUrl | texture, heightPct (of the screen height, Studio's) | height, anchor, padX, padY | x, y, z, blend, visible} */
  async function addImage(o = {}) {
    const S = settings();
    Undo.initEdit({ outliner: true, elements: [], textures: [] });
    let tex = o.texture ? Texture.all.find((t) => t.uuid === o.texture || t.name === o.texture) : null, w0, h0;
    if (!tex) { [w0, h0] = await imageSize(o.dataUrl); tex = textureFrom(o.name || 'image', o.dataUrl, w0, h0); } else { w0 = tex.uv_width; h0 = tex.uv_height; }
    const h = o.height != null ? G.num(o.height) : S.unitsPerScreenH * G.num(o.heightPct, 30) / 100, w = o.width != null ? G.num(o.width) : h * w0 / h0;
    const box = placeBox(S, w, h, o), name = uniqueName(o.name || 'image');
    const g = group(name, null, [box.cx, box.cy, box.z], { type: 'image', anchor: o.anchor || 'center', blend: o.blend || 'cutout', visible: o.visible || '' });
    const c = plane(`${name}_plane`, g, box, tex, o.uv || [0, 0, w0, h0]);
    Undo.finishEdit('GeoUI: 画像を足す', { outliner: true, elements: [c], textures: [tex] });
    Canvas.updateAll();
    return g;
  }
  /** a number: {name, digits, source (Molang), heightPct, anchor, padX, padY | x, y, texture | dataUrl + cells (10 or 11 in a row: 0-9 and a blank), hideLeadingZero, blend} */
  async function addNumber(o = {}) {
    const S = settings(), D = Math.max(1, Math.min(9, Math.round(G.num(o.digits, 3))));
    Undo.initEdit({ outliner: true, elements: [], textures: [] });
    let tex = o.texture ? Texture.all.find((t) => t.uuid === o.texture || t.name === o.texture) : null, cells = G.num(o.cells, 11), strip;
    if (!tex && o.dataUrl) { const [w0, h0] = await imageSize(o.dataUrl); tex = textureFrom(`${o.name || 'number'}_digits`, o.dataUrl, w0, h0); }
    if (!tex) { strip = digitStrip(o.color, o.outline); tex = textureFrom(`${o.name || 'number'}_digits`, strip.dataUrl, strip.w, strip.h); cells = strip.cells; }
    const cw = tex.uv_width / cells, ch = tex.uv_height;
    const h = o.height != null ? G.num(o.height) : S.unitsPerScreenH * G.num(o.heightPct, 9) / 100, dw = h * cw / ch, w = dw * D;
    const box = placeBox(S, w, h, o), name = uniqueName(o.name || 'number');
    const el = group(name, null, [box.cx, box.cy, box.z], { type: 'number', anchor: o.anchor || 'center', blend: o.blend || 'cutout', visible: o.visible || '',
      number: { source: o.source || `q.property('${S.ns}:v0')`, hideLeadingZero: o.hideLeadingZero !== false } });
    const cubes = [];
    for (let k = 0; k < D; k++) {
      const x0 = box.x0 + dw * k, dc = x0 + dw / 2;
      const dg = group(`${name}_d${k}`, el, [dc, box.cy, box.z], { role: 'digit', index: k });
      for (let j = 0; j < 10; j++) {
        const ng = group(`${name}_d${k}_n${j}`, dg, [dc, box.cy, box.z], { role: 'numeral', value: j });
        // (the ten planes of a digit are never seen together — all but one are scaled to 0 — but they do not share a plane:
        //  0.02 apart towards the camera, inside the layer's 0.2)
        cubes.push(plane(`${name}_d${k}_n${j}_plane`, ng, { x0, x1: x0 + dw, y0: box.y0, y1: box.y1, z: G.r3(box.z - 0.02 * j) }, tex, [cw * j, 0, cw * (j + 1), ch]));
      }
    }
    Undo.finishEdit('GeoUI: 数字を足す', { outliner: true, elements: cubes, textures: [tex] });
    syncNumerals();
    Canvas.updateAll();
    return el;
  }
  /** a gauge: {name, source, max, fill ('left'|'right'|'bottom'|'top'|'center'), widthPct, heightPct, anchor, padX, padY | x, y, colors | texture, blend} */
  async function addGauge(o = {}) {
    const S = settings();
    Undo.initEdit({ outliner: true, elements: [], textures: [] });
    let tex = o.texture ? Texture.all.find((t) => t.uuid === o.texture || t.name === o.texture) : null, tw, th;
    if (!tex) { const im = o.dataUrl ? { dataUrl: o.dataUrl } : gaugeImage(...(o.colors || [])); [tw, th] = im.w ? [im.w, im.h] : await imageSize(im.dataUrl); tex = textureFrom(`${o.name || 'gauge'}_fill`, im.dataUrl, tw, th); } else { tw = tex.uv_width; th = tex.uv_height; }
    const w = o.width != null ? G.num(o.width) : S.unitsPerScreenH * G.num(o.widthPct, 34) / 100, h = o.height != null ? G.num(o.height) : S.unitsPerScreenH * G.num(o.heightPct, 2.5) / 100;
    const box = placeBox(S, w, h, o), name = uniqueName(o.name || 'gauge'), fill = G.FILLS.includes(o.fill) ? o.fill : 'left';
    const pivot = [fill === 'left' ? box.x0 : fill === 'right' ? box.x1 : box.cx, fill === 'bottom' ? box.y0 : fill === 'top' ? box.y1 : box.cy, box.z];
    const g = group(name, null, pivot, { type: 'gauge', anchor: o.anchor || 'center', blend: o.blend || 'blend', visible: o.visible || '',
      gauge: { source: o.source || `q.property('${S.ns}:v1')`, max: G.num(o.max, 100), fill } });
    const c = plane(`${name}_plane`, g, box, tex, [0, 0, tw, th]);
    Undo.finishEdit('GeoUI: ゲージを足す', { outliner: true, elements: [c], textures: [tex] });
    Canvas.updateAll();
    return g;
  }
  /** a number's ten planes per digit sit on top of each other: outside the preview only the 0s are shown (export takes all) */
  function syncNumerals() {
    if (!isGeo()) return;
    const all = Modes.animate;
    let changed = false;
    for (const g of Group.all) {
      if (!g.geoui || g.geoui.role !== 'numeral') continue;
      const v = all || g.geoui.value === 0;
      for (const c of g.children) if (c instanceof Cube && c.visibility !== v) { c.visibility = v; changed = true; }
    }
    if (changed) Canvas.updateVisibility();
  }
  /** the element (a bone with GeoUI settings) a node belongs to */
  function elementOf(node) {
    for (let g = node instanceof Group ? node : node && node.parent; g instanceof Group; g = g.parent) if (g.geoui && g.geoui.type) return g;
    return null;
  }
  /** the box (Bedrock units) the cubes under a group cover */
  function boxOf(g) {
    let b = null;
    g.forEachChild((c) => {
      if (!(c instanceof Cube)) return;
      const [a, z] = [fromBB(c.from), fromBB(c.to)];
      const x0 = Math.min(a[0], z[0]), x1 = Math.max(a[0], z[0]), y0 = Math.min(a[1], z[1]), y1 = Math.max(a[1], z[1]);
      b = b ? { x0: Math.min(b.x0, x0), x1: Math.max(b.x1, x1), y0: Math.min(b.y0, y0), y1: Math.max(b.y1, y1) } : { x0, x1, y0, y1 };
    }, null, true);
    return b;
  }
  /** move an element so it sits at an anchor with pads (model units) — Studio's "anchor + pad" placement */
  function align(g, anchor, padX, padY) {
    const S = settings(), b = boxOf(g);
    if (!b) return;
    const w = b.x1 - b.x0, h = b.y1 - b.y0, a = G.studioAnchor(S, w, h, anchor, G.num(padX), G.num(padY), S.refAspect);
    const dx = a.x - (b.x0 + b.x1) / 2, dy = G.PIVOT_Y + a.y - (b.y0 + b.y1) / 2;
    Undo.initEdit({ outliner: true, elements: [] });
    const moved = [];
    g.forEachChild((n) => {
      if (n instanceof Cube) { n.from = q4([n.from[0] - dx, n.from[1] + dy, n.from[2]]); n.to = q4([n.to[0] - dx, n.to[1] + dy, n.to[2]]); n.origin = q4([n.origin[0] - dx, n.origin[1] + dy, n.origin[2]]); moved.push(n); }
      if (n instanceof Group) n.origin = q4([n.origin[0] - dx, n.origin[1] + dy, n.origin[2]]);
    }, null, true);
    g.origin = q4([g.origin[0] - dx, g.origin[1] + dy, g.origin[2]]);
    g.geoui = Object.assign({}, g.geoui, { anchor });
    Undo.finishEdit('GeoUI: 寄せる', { outliner: true, elements: moved });
    Canvas.updateAll();
  }
  /** every cube scaled about the screen centre by k (the screen height changed: Studio rebuilds its planes the same way) */
  function rescale(k) {
    Undo.initEdit({ outliner: true, elements: Cube.all.slice() });
    const c0 = toBB([0, G.PIVOT_Y, 0]), f = (v, i) => (i === 2 ? v : c0[i] + (v - c0[i]) * k);
    for (const c of Cube.all) { c.from = q4(c.from.map(f)); c.to = q4(c.to.map(f)); c.origin = q4(c.origin.map(f)); }
    for (const g of Group.all) g.origin = q4(g.origin.map(f));
    Undo.finishEdit('GeoUI: 画面の高さに合わせて拡大縮小', { outliner: true, elements: Cube.all.slice() });
    Canvas.updateAll();
  }

  // ---------------------------------------------------------------- the project → a design → a pack
  const PREVIEW_NAME = () => `animation.${settings().ns}_transform`;
  function design() {
    const S = settings(), bones = [], elements = {}, textures = {}, warnings = [];
    const faceOf = (c, key) => {
      const f = c.faces[key], t = f && f.getTexture && f.getTexture();
      if (!(t instanceof Texture)) return null;
      const out = { uv: [f.uv[0], f.uv[1]], uv_size: [f.uv[2] - f.uv[0], f.uv[3] - f.uv[1]], texture: t.uuid };
      if (key === 'up' || key === 'down') { out.uv = [out.uv[0] + out.uv_size[0], out.uv[1] + out.uv_size[1]]; out.uv_size = [-out.uv_size[0], -out.uv_size[1]]; }
      if (f.rotation) out.rotation = f.rotation;
      return out;
    };
    const walk = (g, parent) => {
      if (g.export === false) return;
      const b = { name: g.name, parent, pivot: fromBB(g.origin), rotation: [-g.rotation[0], -g.rotation[1], g.rotation[2]], cubes: [] };
      bones.push(b);
      if (g.geoui && g.geoui.type) elements[g.name] = Object.assign({}, g.geoui);
      for (const c of g.children) {
        if (c instanceof Group) walk(c, g.name);
        else if (c instanceof Cube) {
          if (c.export === false) continue;
          if (c.inflate) warnings.push(`${c.name}: inflate は書き出しません`);
          const size = c.size(), cube = { origin: [-(c.from[0] + size[0]), c.from[1], c.from[2]], size: size.slice(), faces: {} };
          if (c.rotation.some((v) => v)) { cube.pivot = fromBB(c.origin); cube.rotation = [-c.rotation[0], -c.rotation[1], c.rotation[2]]; }
          for (const key of ['north', 'south', 'east', 'west', 'up', 'down']) { const f = faceOf(c, key); if (f) cube.faces[key] = f; }
          b.cubes.push(cube);
        } else if (c.type) warnings.push(`${c.name}: ${c.type} は書き出しません（キューブだけ）`);
      }
    };
    for (const n of Outliner.root) {
      if (n instanceof Group) walk(n, undefined);
      else if (n instanceof Cube) warnings.push(`${n.name}: ボーンの外のキューブは書き出しません（${G.ROOT} の中へ）`);
    }
    // numbers: their digits (most significant first) and numerals
    for (const [name, el] of Object.entries(elements)) {
      if (el.type !== 'number') continue;
      const g = Group.all.find((x) => x.name === name), digits = [];
      g.forEachChild((d) => {
        if (!(d instanceof Group) || !d.geoui || d.geoui.role !== 'digit') return;
        const numerals = [];
        d.forEachChild((n) => { if (n instanceof Group && n.geoui && n.geoui.role === 'numeral') numerals[n.geoui.value] = n.name; }, Group, true);
        digits[d.geoui.index] = numerals;
      }, Group, true);
      el.number = Object.assign({}, el.number, { digits: digits.filter(Boolean) });
    }
    for (const t of Texture.all) textures[t.uuid] = { name: t.name.replace(/\.png$/i, ''), width: t.uv_width, height: t.uv_height, uvWidth: t.uv_width, uvHeight: t.uv_height, png: t.getBase64() };
    const animations = [], codec = Format.animation_codec || (Formats.bedrock && Formats.bedrock.animation_codec);
    for (const a of Animation.all) if (a.name !== PREVIEW_NAME() && codec) animations.push({ name: a.name, json: codec.compileAnimation(a) });
    return { settings: S, bones, elements, textures, animations, seed: Project.uuid || '', warnings };
  }
  /** the pack: GeoUICore's, and the timeline's RP and BP when the project has sequences (o.timeline false: the layout alone —
   *  what the preview needs) */
  function build(o = {}) {
    const d = design(), built = G.buildPack(d);
    built.warnings = [...d.warnings, ...built.warnings];
    if (state.bridge && o.timeline !== false) state.bridge.extend(built, d);
    return built;
  }
  async function zip(built, type = 'blob') {
    const z = new JSZip();
    for (const [p, c] of Object.entries(built.files)) { if (c && c.base64 !== undefined) z.file(p, c.base64, { base64: true }); else z.file(p, c); }
    return z.generateAsync({ type, compression: 'DEFLATE' });
  }
  async function exportAddon() {
    packUuids();
    const S0 = settings();
    if (S0.autoBump && S0.exported > 0) setSettings({ version: [S0.version[0], S0.version[1], S0.version[2] + 1] });
    const built = build(), go = async () => {
      setSettings({ exported: settings().exported + 1 });
      const blob = await zip(built);
      Blockbench.export({ resource_id: 'geoui', type: 'Minecraft Add-On', extensions: ['mcaddon'], name: `${built.settings.ns}.mcaddon`, content: blob, savetype: 'zip' },
        () => say('GeoUI のアドオンを書き出しました'));
    };
    if (!built.warnings.length) return go();
    new Dialog({ id: 'geoui_export_warnings', title: 'GeoUI: 書き出す前に', lines: built.warnings.map((w) => `<p>⚠ ${escape(w)}</p>`).concat(built.report.map((r) => `<p class="geoui_note">${escape(r)}</p>`)),
      buttons: ['このまま書き出す', 'やめる'], onConfirm: go }).show();
  }
  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- preview: the export's own Molang, run by Blockbench
  /** the pre_animation and the properties as Variable Placeholders (Blockbench runs them for the animation) */
  function placeholders(built, o = {}) {
    const S = built.settings, ns = S.ns, R = G.PROP_RANGES(S), lines = ['# GeoUI Builder: the properties (edit the numbers) and the pre_animation of the export'];
    const fix = S.centerFix[o.platform || S.previewPlatform] || S.centerFix.desktop;
    const val = { aspect: Math.round(G.qa(o.aspect || S.previewAspect) * 1000), cx: Math.round(fix.x * 10000), cy: Math.round(fix.y * 10000) };
    for (const k of Object.keys(R)) {
      const v = o.props && o.props[`${ns}:${k}`] != null ? o.props[`${ns}:${k}`] : val[k] != null ? val[k] : R[k][2];
      lines.push(/^v\d$/.test(k) && !(o.props && o.props[`${ns}:${k}`] != null) ? `q.property('${ns}:${k}') = slider('${k}', 1, ${R[k][0]}, ${R[k][1]})` : `q.property('${ns}:${k}') = ${v}`);
    }
    for (const l of built.pre) lines.push(l.replace(/;\s*$/, ''));
    return lines.join('\n');
  }
  function preview(o = {}) {
    if (!isGeo()) return say('GeoUI のプロジェクトではありません', 'error');
    if (o.aspect || o.platform) setSettings({ previewAspect: o.aspect || settings().previewAspect, previewPlatform: o.platform || settings().previewPlatform });
    const built = build({ timeline: false }), name = PREVIEW_NAME(), codec = AnimationCodecOf();
    for (const a of Animation.all.filter((x) => x.name === name)) a.remove(false, false);
    const [anim] = codec.loadFile({ json: { format_version: '1.8.0', animations: { [name]: built.animation } }, path: '' }, [name]);
    const text = placeholders(built, o), vue = Interface.Panels.variable_placeholders && Interface.Panels.variable_placeholders.inside_vue;
    Project.variable_placeholders = text;
    if (vue) { vue.text = text; if (typeof vue.updateButtons === 'function') vue.updateButtons(); }
    // (the panel's watcher parses the text on Vue's next tick: done here at once, the same way, so the preview is right now)
    Animator.global_variable_lines = {};
    for (const line of text.split('\n')) {
      const [key, val] = line.split(/=\s*(.+)/);
      if (val === undefined) continue;
      Animator.global_variable_lines[key.replace(/[\s;]/g, '').replace(/^v\./, 'variable.').replace(/^q\./, 'query.').replace(/^t\./, 'temp.').replace(/^c\./, 'context.')] = val.trim();
    }
    if (!Modes.animate && Modes.options.animate) Modes.options.animate.select();
    syncNumerals();
    if (anim) anim.select();
    if (vue && o.props) for (const b of vue.buttons) { const k = `${built.settings.ns}:${b.id}`; if (o.props[k] != null) b.value = o.props[k]; }
    Animator.preview();
    refreshOverlay();
    return anim;
  }
  const AnimationCodecOf = () => Format.animation_codec || Formats.bedrock.animation_codec;

  // ---------------------------------------------------------------- the screen frame in the viewport
  function frame() {
    const S = settings(), previewing = Modes.animate && Animation.selected && Animation.selected.name === PREVIEW_NAME();
    return { S, previewing, now: previewing ? G.screenAt(S, S.previewAspect, S.previewPlatform) : G.screenAt(Object.assign({}, S, { centerFix: { desktop: { x: 0, y: 0 } } }), S.refAspect, 'desktop'),
      ref: G.screenAt(Object.assign({}, S, { centerFix: { desktop: { x: 0, y: 0 } } }), S.refAspect, 'desktop') };
  }
  function refreshOverlay() {
    const host = typeof scene !== 'undefined' ? scene : (Canvas && Canvas.scene);
    if (!host || typeof THREE === 'undefined') return;
    if (!state.overlay) { state.overlay = new THREE.Group(); state.overlay.name = 'geoui_frame'; host.add(state.overlay); }
    const o = state.overlay;
    while (o.children.length) { const c = o.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
    o.visible = !!isGeo();
    if (!o.visible) return;
    const { now, ref, previewing } = frame(), z = -3;
    const lines = (pts, color, opacity = 1) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...toBB([p[0], p[1], z]))));
      const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
      m.renderOrder = 999; o.add(m);
    };
    const rect = (s) => [[s.left, s.bottom], [s.right, s.bottom], [s.right, s.bottom], [s.right, s.top], [s.right, s.top], [s.left, s.top], [s.left, s.top], [s.left, s.bottom]];
    lines(rect(now), 0x35c4ff);
    const c = [(now.left + now.right) / 2, (now.top + now.bottom) / 2], k = now.halfH * 0.04;
    lines([[c[0] - k, c[1]], [c[0] + k, c[1]], [c[0], c[1] - k], [c[0], c[1] + k]], 0x35c4ff, 0.8);
    if (previewing && Math.abs(now.aspect - ref.aspect) > 1e-6) lines(rect(Object.assign({}, ref, { left: ref.left + now.cx, right: ref.right + now.cx, top: ref.top + (now.cy - G.PIVOT_Y), bottom: ref.bottom + (now.cy - G.PIVOT_Y) })), 0xffb000, 0.45);
  }
  /** an orthographic camera looking at the screen the way the HUD renderer does (from the north, +x to the right) */
  function view() {
    const { now } = frame(), p = Preview.selected;
    if (!p) return;
    const cy = (now.top + now.bottom) / 2, cx = (now.left + now.right) / 2;
    const zoom = Math.min(p.height / (40 * (now.top - now.bottom) * 1.08), p.width / (40 * (now.right - now.left) * 1.08));
    p.loadAnglePreset({ projection: 'orthographic', position: toBB([cx, cy, -600]), target: toBB([cx, cy, 0]), zoom });
  }

  // ---------------------------------------------------------------- dialogs
  const CALIB_OPTIONS = () => Object.assign({}, G.CALIBRATIONS);
  function settingsDialog() {
    const S = settings(), dev = Object.fromEntries(G.DEVICES.map((d) => [String(G.qa(d.aspect)), `${d.label}（${G.qa(d.aspect)}）`]));
    const cf = S.centerFix;
    new Dialog({
      id: 'geoui_settings', title: 'GeoUI: 画面と書き出しの設定', width: 640,
      form: {
        ns: { label: '名前空間（プロパティ・ファイル名）', type: 'text', value: S.ns },
        name: { label: 'パックの名前', type: 'text', value: S.name },
        description: { label: 'パックの説明', type: 'text', value: S.description },
        _s1: '_',
        calibration: { label: '画面の高さ・中心の値', type: 'select', options: CALIB_OPTIONS(), value: S.calibration, description: `実機で測った値: ${G.MEASURED.ref}。HUD の枠を変えても、画面の高さと中心がそれに合わせて決まる（下の 2 つの欄は使わない）` },
        unitsPerScreenH: { label: '画面の高さ（モデル単位）', type: 'number', value: S.unitsPerScreenH, min: 1, step: 0.01, description: `GeoUI Studio v10.1 は 176（実機の報告から決めた値）。本物のアプリで測った値があれば入れる` },
        refAspect: { label: '作る画面の比（基準）', type: 'select', options: Object.assign({ [String(S.refAspect)]: String(S.refAspect) }, dev), value: String(S.refAspect) },
        previewAspect: { label: 'プレビューの画面比', type: 'select', options: Object.assign({ [String(S.previewAspect)]: String(S.previewAspect) }, dev), value: String(S.previewAspect) },
        previewPlatform: { label: 'プレビューの端末（中心のずれ）', type: 'select', options: { desktop: 'PC', mobile: 'スマホ', console: 'ゲーム機' }, value: S.previewPlatform },
        cfDesktop: { label: '中心のずれ PC（画面の高さに対する割合 x, y）', type: 'vector', dimensions: 2, value: [cf.desktop.x, cf.desktop.y], step: 0.0001 },
        cfMobile: { label: '中心のずれ スマホ', type: 'vector', dimensions: 2, value: [cf.mobile.x, cf.mobile.y], step: 0.0001 },
        cfConsole: { label: '中心のずれ ゲーム機', type: 'vector', dimensions: 2, value: [cf.console.x, cf.console.y], step: 0.0001 },
        _s2: '_',
        panelSize: { label: 'HUD の枠の大きさ（% 幅・高さ）', type: 'vector', dimensions: 2, value: S.panel.size, step: 0.1 },
        panelOffset: { label: 'HUD の枠の位置（% 横・上から）', type: 'vector', dimensions: 2, value: S.panel.offset, step: 0.1 },
        hud: { label: 'HUD への足し方', type: 'select', options: { insert: 'root_panel に足す（hud_content はそのまま）', studio: 'Studio と同じ（hud_content を置き換える）' }, value: S.hud },
        hideInPaperdoll: { label: 'ポーズ画面の人形には出さない', type: 'checkbox', value: S.hideInPaperdoll },
        followHud: { label: 'HUD を隠すと一緒に隠す', type: 'checkbox', value: S.followHud },
        filter: { label: 'テクスチャの補間', type: 'select', options: { Point: 'Point（ドット）', Bilinear: 'Bilinear（なめらか）' }, value: S.filter },
        bp: { label: 'ビヘイビアパックも作る（画面比・中心を端末ごとに・値をコマンドで）', type: 'checkbox', value: S.bp },
      },
      onConfirm(r) {
        const old = settings().unitsPerScreenH;
        // (the same calibration kept, its numbers typed over: the person's own numbers — 'manual'. Another one chosen: its numbers)
        const typed = Math.abs(G.num(r.unitsPerScreenH) - S.unitsPerScreenH) > 1e-6
          || [['desktop', r.cfDesktop], ['mobile', r.cfMobile], ['console', r.cfConsole]].some(([k, v]) => Math.abs(G.num(v[0]) - cf[k].x) > 1e-6 || Math.abs(G.num(v[1]) - cf[k].y) > 1e-6);
        const calibration = r.calibration === S.calibration && typed ? 'manual' : r.calibration;
        setSettings({
          ns: r.ns, name: r.name, description: r.description, calibration, unitsPerScreenH: r.unitsPerScreenH, refAspect: +r.refAspect, previewAspect: +r.previewAspect, previewPlatform: r.previewPlatform,
          centerFix: { desktop: { x: r.cfDesktop[0], y: r.cfDesktop[1] }, mobile: { x: r.cfMobile[0], y: r.cfMobile[1] }, console: { x: r.cfConsole[0], y: r.cfConsole[1] } },
          panel: { size: r.panelSize, offset: r.panelOffset }, hud: r.hud, hideInPaperdoll: r.hideInPaperdoll, followHud: r.followHud, filter: r.filter, bp: r.bp,
        });
        const now = settings().unitsPerScreenH;
        if (Math.abs(now - old) > 1e-9 && Cube.all.length) Blockbench.showMessageBox({ title: 'GeoUI', message: `画面の高さが ${old} → ${now} になりました。置いた UI も同じ比率で拡大縮小しますか？`, buttons: ['する', 'しない'] }, (b) => { if (b === 0) rescale(now / old); });
        if (Modes.animate) preview(); else refreshOverlay();
      },
    }).show();
  }
  function elementDialog() {
    const g = elementOf(Group.first_selected || (Outliner.selected && Outliner.selected[0]));
    if (!g) return say('GeoUI の要素（画像・数字・ゲージ）のボーンを選んでください', 'error');
    const m = Object.assign({}, g.geoui), S = settings(), b = boxOf(g), pads = b ? G.padsOf(S, b, m.anchor) : { x: 0, y: 0 };
    const form = {
      _info: { type: 'info', text: `${g.name}（${{ image: '画像', number: '数字', gauge: 'ゲージ' }[m.type]}）: 今の位置の余白 x ${G.r3(pads.x)} / y ${G.r3(pads.y)} 単位` },
      anchor: { label: '寄せる先（画面比が変わっても、この辺からの距離を保つ）', type: 'select', options: Object.fromEntries(G.ANCHORS.map((a) => [a, a])), value: m.anchor || 'center' },
      move: { label: '寄せる先へ動かす（下の余白で）', type: 'checkbox', value: false },
      padX: { label: '横の余白（単位）', type: 'number', value: G.r3(pads.x), step: 0.1 },
      padY: { label: '縦の余白（単位）', type: 'number', value: G.r3(pads.y), step: 0.1 },
      blend: { label: '重ね方', type: 'select', options: { cutout: 'cutout（くり抜き）', blend: 'blend（半透明）', add: 'add（加算）' }, value: m.blend || 'cutout' },
      visible: { label: '表示の条件（Molang。空なら常に）', type: 'text', value: m.visible || '' },
    };
    if (m.type === 'gauge') Object.assign(form, {
      source: { label: '値（Molang）', type: 'text', value: (m.gauge || {}).source || '' },
      max: { label: '満タンの値', type: 'number', value: G.num((m.gauge || {}).max, 100) },
      fill: { label: '伸びる向き（中心は Studio のひな形と同じ縮み方）', type: 'select', options: { left: '左から', right: '右から', bottom: '下から', top: '上から', center: '中心から' }, value: (m.gauge || {}).fill || 'left' },
    });
    if (m.type === 'number') Object.assign(form, {
      source: { label: '値（Molang）', type: 'text', value: (m.number || {}).source || '' },
      hideLeadingZero: { label: '頭の 0 を出さない', type: 'checkbox', value: (m.number || {}).hideLeadingZero !== false },
    });
    new Dialog({
      id: 'geoui_element', title: 'GeoUI: 要素の設定', width: 560, form,
      onConfirm(r) {
        for (const [what, src] of [['表示の条件', r.visible], ['値', r.source]]) { const why = src && G.molangError(src); if (why) { say(`${what}が読めません: ${why}`, 'error'); return false; } }
        const meta = Object.assign({}, g.geoui, { anchor: r.anchor, blend: r.blend, visible: r.visible });
        if (m.type === 'gauge') {
          meta.gauge = { source: r.source, max: r.max, fill: r.fill };
          const bx = boxOf(g);
          if (bx && r.fill !== (m.gauge || {}).fill) { Undo.initEdit({ outliner: true }); const p = fromBB(g.origin); g.origin = toBB([r.fill === 'left' ? bx.x0 : r.fill === 'right' ? bx.x1 : (bx.x0 + bx.x1) / 2, r.fill === 'bottom' ? bx.y0 : r.fill === 'top' ? bx.y1 : (bx.y0 + bx.y1) / 2, p[2]]); Undo.finishEdit('GeoUI: ゲージの向き', { outliner: true }); }
        }
        if (m.type === 'number') meta.number = Object.assign({}, m.number, { source: r.source, hideLeadingZero: r.hideLeadingZero });
        g.geoui = meta; Project.saved = false;
        if (r.move) align(g, r.anchor, r.padX, r.padY);
        if (Modes.animate) preview();
      },
    }).show();
  }
  function addDialog(kind) {
    const S = settings(), base = {
      name: { label: '名前', type: 'text', value: kind },
      anchor: { label: '寄せる先', type: 'select', options: Object.fromEntries(G.ANCHORS.map((a) => [a, a])), value: kind === 'image' ? 'center' : 'top_left' },
      padX: { label: '横の余白（単位）', type: 'number', value: kind === 'image' ? 0 : 1.2, step: 0.1 },
      padY: { label: '縦の余白（単位）', type: 'number', value: kind === 'gauge' ? 4.4 : kind === 'image' ? 0 : 1.2, step: 0.1 },
    };
    const extra = {
      image: { file: { label: '画像（PNG）', type: 'file', extensions: ['png'], readtype: 'image' }, heightPct: { label: '高さ（画面の高さの %）', type: 'number', value: 30, step: 0.1 },
        blend: { label: '重ね方', type: 'select', options: { cutout: 'cutout', blend: 'blend', add: 'add' }, value: 'cutout' } },
      number: { digits: { label: '桁数', type: 'number', value: 5, min: 1, max: 9 }, source: { label: '値（Molang）', type: 'text', value: `q.property('${S.ns}:v0')` }, heightPct: { label: '高さ（%）', type: 'number', value: 9, step: 0.1 } },
      gauge: { source: { label: '値（Molang）', type: 'text', value: `q.property('${S.ns}:v1')` }, max: { label: '満タンの値', type: 'number', value: 20 },
        fill: { label: '伸びる向き', type: 'select', options: { left: '左から', right: '右から', bottom: '下から', top: '上から', center: '中心から（Studio のひな形）' }, value: 'left' },
        widthPct: { label: '幅（%）', type: 'number', value: 34, step: 0.1 }, heightPct: { label: '高さ（%）', type: 'number', value: 2.5, step: 0.1 } },
    }[kind];
    new Dialog({
      id: `geoui_add_${kind}`, title: { image: 'GeoUI: 画像を足す', number: 'GeoUI: 数字を足す', gauge: 'GeoUI: ゲージを足す' }[kind], width: 520, form: Object.assign({}, base, extra),
      async onConfirm(r) {
        if (!isGeo()) newGeoProject();
        if (r.source && G.molangError(r.source)) { say(`値が読めません: ${G.molangError(r.source)}`, 'error'); return false; }
        if (kind === 'image') { if (!r.file) { say('画像を選んでください', 'error'); return false; } await addImage(Object.assign({}, r, { dataUrl: r.file })); }
        if (kind === 'number') await addNumber(r);
        if (kind === 'gauge') await addGauge(r);
      },
    }).show();
  }
  function checkDialog() {
    const built = build(), S = built.settings, lines = [...built.report.map(escape)];
    for (const w of built.warnings) lines.push(`⚠ ${escape(w)}`);
    for (const d of G.DEVICES) for (const pl of ['desktop', 'mobile']) {
      const L = G.layoutOf(built, { aspect: d.aspect, platform: pl }), sc = G.screenAt(S, d.aspect, pl), out = new Set();
      for (const q of L.quads) if (!q.hidden && (q.quad.x0 < sc.left - 1e-6 || q.quad.x1 > sc.right + 1e-6 || q.quad.y0 < sc.bottom - 1e-6 || q.quad.y1 > sc.top + 1e-6)) out.add(q.bone);
      if (out.size) lines.push(`${escape(d.label)} ${pl === 'desktop' ? 'PC' : 'スマホ'}: 画面の外にはみ出す — ${[...out].slice(0, 6).map(escape).join(', ')}${out.size > 6 ? ' …' : ''}`);
    }
    if (lines.length === built.report.length) lines.push('✔ どの画面比でも、どの要素も画面の中に収まります（画面の高さ・中心のずれは今の設定の値で）');
    new Dialog({ id: 'geoui_check', title: 'GeoUI: 確かめる', lines: lines.map((l) => `<p>${l}</p>`), buttons: ['OK'], width: 640 }).show();
  }
  const newUuid = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : G.uuidFrom(`${Date.now()}:${Math.random()}`));
  function packUuids() {
    const S = settings();
    if (!S.uuids) setSettings({ uuids: { rp: newUuid(), rpMod: newUuid(), bp: newUuid(), bpData: newUuid(), bpScript: newUuid() } });
    return settings().uuids;
  }
  function newGeoProject() {
    if (!newProject(state.format)) return false;
    Project.geoui_settings = G.newProjectSettings();
    packUuids();
    ensureRoot();
    Canvas.updateAll();
    refreshOverlay();
    setTimeout(view, 50);
    return true;
  }

  // ---------------------------------------------------------------- registration
  function setup() {
    state.props.push(new Property(ModelProject, 'object', 'geoui_settings', { default: undefined }));
    state.props.push(new Property(Group, 'object', 'geoui', { default: undefined }));
    state.format = new ModelFormat(FORMAT_ID, {
      name: 'GeoUI（統合版の HUD に描く UI）', description: 'live_player_renderer で HUD に描く 2D UI（GeoUI）。GeoUI Studio と同じ式で書き出す',
      icon: 'dashboard', category: 'minecraft', target: 'Minecraft: Bedrock Edition',
      rotate_cubes: true, box_uv: false, optional_box_uv: false, single_texture: false, per_texture_uv_size: true, uv_rotation: true,
      bone_rig: true, centered_grid: true, animation_mode: true, molang: true, locators: false,
      animation_codec: Formats.bedrock && Formats.bedrock.animation_codec,
      node_name_regex: '\\w.-',
      onSetup(project, newModel) { if (newModel) project.geoui_settings = G.newProjectSettings(); },
      onActivation() { setTimeout(refreshOverlay, 0); },
      onDeactivation() { setTimeout(refreshOverlay, 0); },
    });
    const A = (id, o) => { const a = new Action(id, o); state.actions.push(a); return a; };
    A('geoui_new', { name: '新しい GeoUI プロジェクト', icon: 'add_box', click: newGeoProject });
    A('geoui_settings', { name: '画面と書き出しの設定…', icon: 'tune', condition: isGeo, click: settingsDialog });
    A('geoui_add_image', { name: '画像を足す…', icon: 'image', click: () => addDialog('image') });
    A('geoui_add_number', { name: '数字を足す…', icon: 'pin', click: () => addDialog('number') });
    A('geoui_add_gauge', { name: 'ゲージを足す…', icon: 'linear_scale', click: () => addDialog('gauge') });
    A('geoui_element', { name: '選んだ要素の設定（寄せ先・値・条件）…', icon: 'settings', condition: isGeo, click: elementDialog });
    A('geoui_view', { name: '画面を正面から見る', icon: 'crop_free', condition: isGeo, click: view });
    A('geoui_preview', { name: 'プレビュー（書き出す式をそのまま動かす）', icon: 'play_circle', condition: isGeo, click: () => { preview(); view(); } });
    A('geoui_check', { name: 'はみ出し・式を確かめる…', icon: 'fact_check', condition: isGeo, click: checkDialog });
    A('geoui_export', { name: 'アドオンを書き出す（.mcaddon）', icon: 'file_download', condition: isGeo, click: exportAddon });
    // (the timeline — bds/geoui/timeline/, bundled before this file in dist/geoui_builder.js: its panels, preview and export)
    const TL = window.GeoUITimeline;
    if (TL && TL.bridge) {
      try {
        state.bridge = TL.bridge.install({ G, isGeo, settings, elementOf, boxOf, preview, frame, toBB, fromBB, say, addImage, addNumber, view,
          setFrameVisible: (v) => { if (state.overlay) state.overlay.visible = !!v && !!isGeo(); } });
      } catch (e) { console.error(e); say(`GeoUI のタイムラインを読み込めません: ${e.message || e}`, 'error'); }
    }
    state.menu = new BarMenu('geoui', ['geoui_new', 'geoui_settings', '_', 'geoui_add_image', 'geoui_add_number', 'geoui_add_gauge', 'geoui_element', '_',
      'geoui_view', 'geoui_preview', 'geoui_check', '_', 'geoui_export', ...(state.bridge ? ['_', ...state.bridge.actions] : [])], { name: 'GeoUI', icon: 'dashboard' });
    MenuBar.update();
    const on = (ev, f) => { Blockbench.on(ev, f); state.listeners.push([ev, f]); };
    for (const ev of ['select_project', 'unselect_project', 'select_mode', 'select_animation', 'finished_edit']) on(ev, () => setTimeout(() => { syncNumerals(); refreshOverlay(); }, 0));
    window.GeoUIBuilder = { core: G, settings, setSettings, newProject: newGeoProject, addImage, addNumber, addGauge, align, rescale, elementOf, boxOf,
      design, build, zip, exportAddon, preview, placeholders, view, refreshOverlay, frame, packUuids, syncNumerals, timeline: state.bridge || null };
    refreshOverlay();
  }
  function teardown() {
    if (state.bridge) { try { state.bridge.uninstall(); } catch (e) { console.error(e); } state.bridge = null; delete window.GeoUITimeline; }
    for (const [ev, f] of state.listeners) Blockbench.removeListener(ev, f);
    for (const a of state.actions) a.delete();
    if (state.menu) state.menu.delete();
    MenuBar.update();
    if (state.overlay && state.overlay.parent) state.overlay.parent.remove(state.overlay);
    if (state.format) state.format.delete();
    for (const p of state.props) p.delete();
    delete window.GeoUIBuilder;
  }

  BBPlugin.register('geoui_builder', {
    title: 'GeoUI Builder',
    author: 'bds-lab',
    icon: 'dashboard',
    version: G.VERSION,
    variant: 'both',
    min_version: '5.0.0',
    tags: ['Minecraft: Bedrock Edition', 'UI'],
    description: 'Build GeoUI (2D UI drawn on the HUD by live_player_renderer) for Minecraft Bedrock, with GeoUI Studio\'s layout formulas.',
    about: 'GeoUI → 新しい GeoUI プロジェクト。画像・数字・ゲージを足し、寄せ先（左上など）を決め、プレビューで画面比を変えて確かめ、アドオンを書き出す。'
      + '画面の高さ（176 単位）・中心のずれは GeoUI Studio v10.1 の値を初期値に、設定で変えられる（本物のアプリで測った値に）。',
    onload: setup,
    onunload: teardown,
  });
})();
