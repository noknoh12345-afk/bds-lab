// GeoUI Screen — where a point of a GeoUI model lands on the real screen (pure, no game, no DOM). The one place for the
// formulas of bds/geoui/SPEC.md: the HUD's live_player_renderer mapping (measured by bds-lab), the viewport GeoUI draws in
// (the HUD's root panel = the screen's safe area), the four ways a UI can scale (height / width / gui / contain) and the
// anchored renderers — one live_player_renderer per anchor of the screen, each put there by the game's own JSON UI, so the
// game does every aspect ratio, cut-out and safe area itself and the server never has to know the screen.
//
// Coordinates
//   model   Bedrock geometry units: x to the right of the screen, y up, z away from the camera (the north face is the one
//           seen). One block = 16 units. GeoUI planes are flat cubes (size z 0) with only their north face textured
//   local   a group's own units: x right, y DOWN, from the group's anchor point (what a designer and the HTML converter use)
//   screen  px of the viewport: x right, y down, (0, 0) at its top-left
//   ui      JSON UI px (the game's GUI scale): screen px / uiScale
// The renderer (measured on the real app, 3 panel shapes x 5 screens, 0.08 % / 0.7 px; bds/geoui/README.md):
//   one model unit = K x min(panel width, panel height) px, K = 0.9375 / 16 (one block across the panel's shorter side at the
//   player's render scale 0.9375; measured 0.058589); the model's origin sits D = 24.10 units below the panel's middle,
//   centred across; orthographic (no perspective: x and y scale alike, depth does not move a point)
(function (root) {
  'use strict';
  const S = root.GeoUIScreen = root.GeoUIScreen || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;

  /** the renderer: K exact (0.9375 / 16) and as measured; D measured (± its error) */
  const K = 0.9375 / 16, K_MEASURED = 0.058589, K_ERR = 0.00005, D = 24.10, D_ERR = 0.17;
  /** where the content lives: far from the model's origin (the player's own body, which every renderer also draws) and far
   *  enough that any other renderer of the player — the inventory's doll, the HUD's paper doll — draws it off its screen */
  const BAND_Y = 1200, GROUP_DX = 1500, GROUP_DY = 600;
  const ANCHORS = Object.freeze({
    top_left: [0, 0], top_middle: [0.5, 0], top_right: [1, 0],
    left_middle: [0, 0.5], center: [0.5, 0.5], right_middle: [1, 0.5],
    bottom_left: [0, 1], bottom_middle: [0.5, 1], bottom_right: [1, 1],
  });
  const ANCHOR_NAMES = Object.keys(ANCHORS);
  /** CSS-like names → the JSON UI's */
  const ALIASES = { 'top-left': 'top_left', top: 'top_middle', 'top-right': 'top_right', left: 'left_middle', middle: 'center', right: 'right_middle',
    'bottom-left': 'bottom_left', bottom: 'bottom_middle', 'bottom-right': 'bottom_right', tl: 'top_left', tr: 'top_right', bl: 'bottom_left', br: 'bottom_right', c: 'center' };
  function anchorName(a) {
    const s = String(a || 'center').toLowerCase();
    if (ANCHORS[s]) return s;
    if (ALIASES[s]) return ALIASES[s];
    throw new Error(`寄せる先「${a}」は ${ANCHOR_NAMES.join(' ')} のどれか（top-left・top・right なども）`);
  }

  // ---- scale modes: the renderer's square panel (its side is what one model unit follows) ---------------------------------
  //   height   side = s x the viewport's height      → the UI follows the screen's height (default s 0.1: 170.67 units high)
  //   width    side = s x the viewport's width       → the UI follows the screen's width
  //   gui      side = px / K JSON UI px               → one model unit = px JSON UI px: the game's GUI scale, like its own HUD
  //   contain  a design box Dw x Dh (design px, g model units each) fitted inside the viewport (letterboxed), one renderer
  const MODES = ['height', 'width', 'gui', 'contain'];
  function modeOf(m0) {
    const m = Object.assign({ mode: 'height' }, typeof m0 === 'string' ? { mode: m0 } : m0 || {});
    if (!MODES.includes(m.mode)) throw new Error(`大きさの決め方「${m.mode}」は ${MODES.join(' / ')} のどれか`);
    if (m.mode === 'height' || m.mode === 'width') m.s = num(m.s, 0.1) > 0 ? num(m.s, 0.1) : 0.1;
    if (m.mode === 'gui') m.px = num(m.px, 1) > 0 ? num(m.px, 1) : 1;
    if (m.mode === 'contain') { m.w = num(m.w, 1280) > 0 ? num(m.w, 1280) : 1280; m.h = num(m.h, 720) > 0 ? num(m.h, 720) : 720; m.g = num(m.g, 0.25) > 0 ? num(m.g, 0.25) : 0.25; }
    return m;
  }
  /** the square panel's side (screen px) for a viewport W x H px; uiScale = screen px per JSON UI px (gui only) */
  function sidePx(m0, W, H, uiScale = 1) {
    const m = modeOf(m0);
    if (m.mode === 'height') return m.s * H;
    if (m.mode === 'width') return m.s * W;
    if (m.mode === 'gui') return (m.px / K) * uiScale;
    const q = 1 / (K * m.g);
    return q * Math.min(W / m.w, H / m.h);
  }
  /** screen px of one model unit */
  const unitPx = (m, W, H, uiScale = 1, k = K) => k * sidePx(m, W, H, uiScale);
  /** the viewport in model units: its height and width (what a designer lays out in) */
  function viewportUnits(m, W, H, uiScale = 1) { const u = unitPx(m, W, H, uiScale); return { w: W / u, h: H / u, u }; }

  // ---- groups: content anchored to one point of the viewport, drawn by its own renderer ------------------------------------
  /** the model point each group's anchor point is: groups on a grid far from the origin, GROUP_DX / GROUP_DY apart — a renderer
   *  also draws every other group, and those land GROUP_DX / GROUP_DY off its own anchor, outside any screen (the widest,
   *  32:9, is ~610 units wide at the default height scale) */
  function groupOrigin(i) {
    const col = (i % 5) - 2, row = Math.floor(i / 5);
    return [col * GROUP_DX, BAND_Y + row * GROUP_DY];
  }
  /** JSON UI offset (of the square panel, anchored by its centre) that puts model point G on the anchor point: in % of the
   *  square's own size (%x, %y), so it holds on every screen. ox = −K·side·Gx, oy = K·side·(Gy − D) (screen y is down) */
  function offsetOf(G, k = K, d = D) {
    const f = (v) => `${r6(v)}%`;
    return [`${f(-100 * k * G[0])}x`, `${f(100 * k * (G[1] - d))}y`];
  }
  /** a group as the builders use it: { id, anchor, origin, scale, clip?, layer } (scale: the scene's unless its own) */
  function groupsOf(scene) {
    const m = modeOf(scene.scale);
    const list = (scene.groups || []).map((g0, i) => {
      const g = Object.assign({}, g0);
      if (!/^[a-z0-9_]{1,24}$/.test(String(g.id))) throw new Error(`グループの名前「${g.id}」は英小文字・数字・_ で 24 文字まで`);
      g.anchor = anchorName(g.anchor || 'center');
      g.scale = g.scale ? modeOf(g.scale) : m;
      g.origin = Array.isArray(g.origin) ? g.origin.map(Number) : groupOrigin(i);
      g.index = i;
      return g;
    });
    const seen = new Set();
    for (const g of list) { if (seen.has(g.id)) throw new Error(`グループ ${g.id} が 2 つあります`); seen.add(g.id); }
    return list;
  }

  /** where a group's anchor point is on a W x H viewport (screen px), and its renderer's unit (px). Contain: the design box
   *  centred in the viewport, its own anchors (the box is rigid: one renderer would do; each group keeps its own anyway) */
  function anchorPx(g, W, H, uiScale = 1) {
    const [fx, fy] = ANCHORS[g.anchor];
    if (g.scale.mode === 'contain') {
      const u = unitPx(g.scale, W, H, uiScale), bw = g.scale.w * g.scale.g * u, bh = g.scale.h * g.scale.g * u;
      return { x: (W - bw) / 2 + fx * bw, y: (H - bh) / 2 + fy * bh, u };
    }
    return { x: fx * W, y: fy * H, u: unitPx(g.scale, W, H, uiScale) };
  }
  /** a point in a group's local units (x right, y down from its anchor) → screen px, on a W x H viewport (k, d: what the
   *  game really does, to see what an error in them would move) */
  function localToScreen(g, x, y, W, H, uiScale = 1, k = K, d = D) {
    const a = anchorPx(g, W, H, uiScale), u = a.u * (k / K);
    // (the offset was written with K and D: a game whose k, d differ puts G off the anchor by the difference)
    const G = g.origin, side = a.u / K;
    const cx = a.x - K * side * G[0], cy = a.y + K * side * (G[1] - D);
    const X = G[0] + x, Y = G[1] - y;
    return { x: cx + u * X, y: cy - u * (Y - d) };
  }
  /** a rectangle in local units ({ x, y, w, h }, y down) → its screen box { x0, y0, x1, y1 } */
  function rectToScreen(g, r, W, H, uiScale = 1, k = K, d = D) {
    const a = localToScreen(g, r.x, r.y, W, H, uiScale, k, d), b = localToScreen(g, r.x + r.w, r.y + r.h, W, H, uiScale, k, d);
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  }
  /** the model cube of a local rectangle (a plane: size z 0) — origin is its min corner */
  function rectToModel(g, r, z = 0) {
    const G = g.origin;
    return { origin: [r6(G[0] + r.x), r6(G[1] - r.y - r.h), r6(z)], size: [r6(r.w), r6(r.h), 0] };
  }

  // ---- the JSON UI: a viewport panel in the HUD's root panel, one renderer per group ------------------------------------
  const pct = (v) => `${r6(v)}%`;
  /** the square panel of a group (size, and for contain the two panels that make min(width, height) a square) */
  function squareOf(g, ns, renderer) {
    const off = offsetOf(g.origin);
    const sq = (size, extra) => Object.assign({ type: 'panel', size, anchor_from: g.anchor, anchor_to: 'center', offset: off, controls: [{ [`${ns}_r_${g.id}`]: renderer }] }, extra || {});
    const m = g.scale;
    if (m.mode === 'height') return sq(['100%y', pct(100 * m.s)]);
    if (m.mode === 'width') return sq([pct(100 * m.s), '100%x']);
    if (m.mode === 'gui') { const p = r6(m.px / K); return sq([p, p]); }
    // contain: box (q·W/Dw, q·H/Dh) → middle (width min(box w, box h), the box's height: aligned on the anchor's side) → square
    const q = 1 / (K * m.g);
    const square = sq(['100%', '100%x']);
    const middle = { type: 'panel', size: ['100%y', '100%'], max_size: ['100%', '100%'], anchor_from: g.anchor, anchor_to: g.anchor, controls: [{ [`${ns}_sq_${g.id}`]: square }] };
    // (the square's offset carries the design box's anchor: the box itself is the scale reference, centred in the viewport)
    const bx = m.w * m.g, by = m.h * m.g, [fx, fy] = ANCHORS[g.anchor];
    square.anchor_from = 'center';
    square.offset = offsetOf([g.origin[0] - (fx - 0.5) * bx, g.origin[1] + (fy - 0.5) * by]);
    middle.anchor_from = 'center'; middle.anchor_to = 'center';
    return { type: 'panel', size: [pct(100 * q / m.w), pct(100 * q / m.h)], controls: [{ [`${ns}_mid_${g.id}`]: middle }] };
  }
  /** the hud_screen.json the pack adds (namespace hud): a viewport panel at the front of root_panel — the HUD's size, made the
   *  safe area again when the game compresses the HUD's width ($compress_hud_width: 90 %) — and the groups' renderers in it
   *  (a group with clip: inside a panel that clips_children). opts.followHud: hidden with the HUD (F1) */
  function hudScreen(scene, opts = {}) {
    const ns = scene.ns, groups = groupsOf(scene), followHud = opts.followHud !== false;
    const renderer = () => Object.assign({ type: 'custom', renderer: 'live_player_renderer', layer: 1, size: ['100%', '100%'] },
      followHud ? { bindings: [{ binding_name: '#hud_visible', binding_name_override: '#visible' }] } : {});
    const controls = groups.filter((g) => g.renderer !== false).map((g) => {
      let panel = squareOf(g, ns, renderer());
      if (g.clip) {
        // the clip box: its own size and anchor on the viewport; the group's renderer inside it, anchored as before (to the box)
        const c = g.clip;
        panel = { type: 'panel', size: c.size || ['100%', '100%'], anchor_from: anchorName(c.anchor || 'center'), anchor_to: anchorName(c.anchor || 'center'),
          offset: c.offset || [0, 0], clips_children: true, controls: [{ [`${ns}_g_${g.id}`]: panel }] };
        return { [`${ns}_clip_${g.id}`]: Object.assign(panel, g.layer !== undefined ? { layer: g.layer } : {}) };
      }
      return { [`${ns}_g_${g.id}`]: Object.assign(panel, g.layer !== undefined ? { layer: g.layer } : {}) };
    });
    // (extra controls of the scene's own: a renderer placed some other way, a label bound to a HUD text — as they are)
    for (const c of scene.extraControls || []) controls.push(c);
    const vp = {
      type: 'panel', [`$${ns}_vp_size|default`]: ['100%', '100%'], size: `$${ns}_vp_size`,
      variables: [{ requires: '($compress_hud_width)', [`$${ns}_vp_size`]: ['111.111111%', '100%'] }],
      controls,
    };
    const out = { namespace: 'hud', [`${ns}_vp`]: vp };
    out.root_panel = { modifications: [{ array_name: 'controls', operation: 'insert_front', value: [{ [`${ns}_vp@hud.${ns}_vp`]: {} }] }] };
    return out;
  }

  // ---- devices: the shapes a GeoUI has to hold on (landscape px; the safe area where known) -------------------------------
  // aspect = width / height of the game's screen. 'safe' is the inset the OS reports in landscape (px), where it is fixed;
  // whether Minecraft keeps the HUD out of it is what the device check measures (SPEC.md 「端末ごと」)
  const DEVICES = Object.freeze([
    { id: 'tablet43', label: 'タブレット 4:3（iPad mini・iPad 10.2）', w: 2048, h: 1536, kind: 'tablet' },
    { id: 'ipadpro11', label: 'iPad Pro 11 / Air（約 1.43）', w: 2388, h: 1668, kind: 'tablet' },
    { id: 'fold', label: '折りたたみ（内側 約 1.2）', w: 2208, h: 1840, kind: 'phone' },
    { id: 'tab1610', label: 'Android タブレット 16:10', w: 2560, h: 1600, kind: 'tablet' },
    { id: 'pc169', label: 'PC・ゲーム機 16:9', w: 1920, h: 1080, kind: 'pc' },
    { id: 'pc1610', label: 'PC 16:10（Steam Deck も）', w: 1920, h: 1200, kind: 'pc' },
    { id: 'and189', label: 'Android 18:9', w: 2160, h: 1080, kind: 'phone' },
    { id: 'emu', label: 'ラボの CI の端末（約 19.5:9）', w: 1560, h: 720, kind: 'phone' },
    { id: 'iphone', label: 'iPhone 19.5:9（X〜16）', w: 2556, h: 1179, kind: 'phone', safe: { left: 177, right: 177, top: 0, bottom: 63 }, note: 'Dynamic Island 59pt・ホームバー 21pt（@3x）' },
    { id: 'and209', label: 'Android 20:9', w: 2400, h: 1080, kind: 'phone' },
    { id: 'and219', label: 'Android 21:9（Xperia）', w: 2520, h: 1080, kind: 'phone' },
    { id: 'uw219', label: 'PC ウルトラワイド 21:9（64:27）', w: 2560, h: 1080, kind: 'pc' },
    { id: 'uw329', label: 'PC スーパーウルトラワイド 32:9', w: 3840, h: 1080, kind: 'pc' },
  ].map((d) => Object.freeze(Object.assign({ aspect: r6(d.w / d.h) }, d))));

  /** a table of what a scale mode gives on each device: units across and up, px per unit (what SPEC.md prints) */
  function deviceTable(m0, opts = {}) {
    const m = modeOf(m0), ui = num(opts.uiScale, 2);
    return DEVICES.map((d) => { const v = viewportUnits(m, d.w, d.h, ui); return { id: d.id, label: d.label, w: d.w, h: d.h, aspect: d.aspect, unitsW: r6(v.w), unitsH: r6(v.h), pxPerUnit: r6(v.u) }; });
  }

  S.layout = {
    K, K_MEASURED, K_ERR, D, D_ERR, BAND_Y, GROUP_DX, GROUP_DY, ANCHORS, ANCHOR_NAMES, MODES, DEVICES,
    anchorName, modeOf, sidePx, unitPx, viewportUnits, groupOrigin, offsetOf, groupsOf, anchorPx, localToScreen, rectToScreen, rectToModel,
    squareOf, hudScreen, deviceTable,
  };
  if (typeof module === 'object' && module && module.exports) module.exports = S.layout;
})(typeof globalThis !== 'undefined' ? globalThis : this);
