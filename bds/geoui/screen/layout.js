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
// The renderer (measured on the real app: 3 panel shapes x 5 screens, 0.08 % / 0.7 px, 2026-10-21; then decided by
// bds/addons/geoui_rules, run 40055307539 (2026-10-24): the player's scale in the UI at 0.5 / 0.75 / 1 / 1.5 → the unit exactly
// scale / 16 of the panel's shorter side and the origin exactly 24 model units below its middle, 0.00 px off — RULES.md R4.1 R4.2):
//   one model unit = K x min(panel width, panel height) px, K = scripts.scale / 16 — vanilla's player scale 0.9375 (and any
//   minecraft:scale the entity has multiplies it: R4.8) — i.e. one block of the world across the panel's shorter side; the model's
//   origin sits D = 24 model units below the panel's middle at any scale, centred across; orthographic (no perspective)
(function (root) {
  'use strict';
  const S = root.GeoUIScreen = root.GeoUIScreen || {};
  const num = (v, d = 0) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;

  /** the renderer: K (vanilla's scale 0.9375 / 16) and as measured; D (± what is left of its error) */
  const K = 0.9375 / 16, K_MEASURED = 0.05859375, K_ERR = 0.00001, D = 24, D_ERR = 0.02;
  /** where the content lives: far from the model's origin (the player's own body, which every renderer also draws) and far
   *  enough that any other renderer of the player — the inventory's doll, the HUD's paper doll — draws it off its screen */
  const BAND_Y = 1200, GROUP_DX = 1500, GROUP_DY = 600;
  /** a gui group's unit is a JSON UI px — a few screen px — so its renderer sees far: such groups get a band of their own below
   *  the model, wider apart (what a renderer sees of another group's content: ghosts(), checked by pack.js on every device) */
  const GUI_Y = -3000, GUI_DX = 4500, GUI_DY = 1500;
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
  /** the k-th gui group's model point */
  function guiOrigin(k) { return [((k % 3) - 1) * GUI_DX, GUI_Y - Math.floor(k / 3) * GUI_DY]; }
  /** JSON UI offset (of the square panel, anchored by its centre) that puts model point G on the anchor point: in % of the
   *  square's own size (%x, %y), so it holds on every screen. ox = −K·side·Gx, oy = K·side·(Gy − D) (screen y is down) */
  function offsetOf(G, k = K, d = D) {
    const f = (v) => `${r6(v)}%`;
    return [`${f(-100 * k * G[0])}x`, `${f(100 * k * (G[1] - d))}y`];
  }
  /** a group as the builders use it: { id, anchor, origin, scale, clip?, layer } (scale: the scene's unless its own) */
  function groupsOf(scene) {
    const m = modeOf(scene.scale);
    let main = 0, gui = 0;
    const list = (scene.groups || []).map((g0, i) => {
      const g = Object.assign({}, g0);
      if (!/^[a-z0-9_]{1,24}$/.test(String(g.id))) throw new Error(`グループの名前「${g.id}」は英小文字・数字・_ で 24 文字まで`);
      g.anchor = anchorName(g.anchor || 'center');
      g.scale = g.scale ? modeOf(g.scale) : m;
      g.origin = Array.isArray(g.origin) ? g.origin.map(Number) : g.scale.mode === 'gui' ? guiOrigin(gui++) : groupOrigin(main++);
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
  /** what a renderer sees that is not its own: every live_player_renderer draws the whole model — every group, and the player's
   *  body at the model's origin — so each group's content must be off the screen in every other group's renderer. boxes: { group
   *  id: { x0, y0, x1, y1 } } (its content, local units); margin: room for bones that move. → [{ by, seen }] on a W x H screen */
  const BODY = { id: '(体)', origin: [0, 0] }, BODY_BOX = { x0: -24, y0: -40, x1: 24, y1: 8 };
  function ghosts(groups, boxes, W, H, uiScale = 2, margin = 40) {
    const out = [];
    for (const A of groups) {
      if (A.renderer === false) continue;
      const a = anchorPx(A, W, H, uiScale), u = a.u;
      for (const B of [...groups, BODY]) {
        const b = B === BODY ? BODY_BOX : boxes[B.id];
        if (A === B || !b) continue;
        const dx = B.origin[0] - A.origin[0], dy = B.origin[1] - A.origin[1];
        const x0 = a.x + u * (dx + b.x0 - margin), x1 = a.x + u * (dx + b.x1 + margin), y0 = a.y + u * (b.y0 - margin - dy), y1 = a.y + u * (b.y1 + margin - dy);
        if (x1 > 0 && x0 < W && y1 > 0 && y0 < H) out.push({ by: A.id, seen: B.id });
      }
    }
    return out;
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

  // ---- the title channel: strings from the server to the HUD's JSON UI, one player at a time ------------------------------
  // The title is the one string a server sets for one player that the HUD's JSON UI can read (#hud_title_text_string, global:
  // RULES.md R5.5). GeoUI writes it as PREFIX + a flag (F1 on: '1', off: '0') + a layout letter (which of the scene's layouts
  // shows: 'a' … 'z', see group.layout) + one fixed-width field per URL slot (spaces after the URL; a URL has none), and the
  // HUD's own title is hidden while it starts with PREFIX. JSON UI reads field k as: the string without its first P characters
  // (P = PREFIX + flag + letter + k fields: that prefix occurs once, at the start), cut to the field's width, spaces taken out.
  const CHANNEL = Object.freeze({ prefix: '~gu~', width: 230, maxSlots: 8, layouts: 'abcdefghijklmnopqrstuvwxyz' });
  /** the channel a scene uses, or null: { prefix, width, slots, f1, head } (head: the characters before the first field) */
  function channelOf(scene) {
    const imgs = scene.urlImages || [], lays = (scene.groups || []).some((g) => g.layout !== undefined && g.layout !== null);
    if (!imgs.length && !scene.f1 && !lays) return null;
    const width = Math.round(num(scene.channel && scene.channel.width, CHANNEL.width));
    if (width < 16 || width > 1000) throw new Error(`タイトルの通り道の枠の幅 ${width} は 16〜1000 文字`);
    const slots = imgs.length ? Math.max(...imgs.map((u) => Math.round(num(u.slot, 0)))) + 1 : 0;
    if (slots > CHANNEL.maxSlots) throw new Error(`URL の画像の枠は ${CHANNEL.maxSlots} 個まで（slot 0〜${CHANNEL.maxSlots - 1}）`);
    for (const u of imgs) if (!(Number.isInteger(u.slot ?? 0) && (u.slot ?? 0) >= 0)) throw new Error(`URL の画像 ${u.id} の slot は 0 以上の整数`);
    for (const g of scene.groups || []) if (g.layout !== undefined && g.layout !== null && !(String(g.layout).length === 1 && CHANNEL.layouts.includes(String(g.layout)))) throw new Error(`グループ ${g.id} の layout「${g.layout}」は a〜z の 1 文字`);
    // titleHide: how the game's own title is hidden while it is the channel's — 'area' (the default since 5 本目: hud_title_text
    // untouched, root_panel's hud_title_text_area put back with the same factory and a #visible view binding), 'text' (2〜4 本目:
    // bindings added to hud_title_text — no plain title was seen after it: R10.14), 'none' (not hidden: the control)
    const titleHide = scene.titleHide === undefined ? 'area' : String(scene.titleHide);
    if (!['area', 'text', 'none'].includes(titleHide)) throw new Error(`titleHide「${titleHide}」は area・text・none のどれか`);
    return { prefix: CHANNEL.prefix, width, slots, f1: !!scene.f1, head: CHANNEL.prefix.length + 2, titleHide };
  }
  /** the title text that carries { f1, layout, urls } (what the script sends; JSON UI reads it back with slotExpr) */
  function channelText(ch, state = {}) {
    const lay = state.layout === undefined || state.layout === null || state.layout === '' ? 'a' : String(state.layout);
    if (!(lay.length === 1 && CHANNEL.layouts.includes(lay))) throw new Error(`layout「${lay}」は a〜z の 1 文字`);
    let s = ch.prefix + (state.f1 ? '1' : '0') + lay;
    const urls = state.urls || [];
    for (let k = 0; k < ch.slots; k++) {
      const u = String(urls[k] || '');
      if (u.length > ch.width) throw new Error(`URL が枠（${ch.width} 文字）より長い: ${u.length} 文字`);
      if (/[\s"\\]/.test(u)) throw new Error('URL に空白・" ・\\ は入れられません（%20 などに）');
      s += u + ' '.repeat(ch.width - u.length);
    }
    return s;
  }
  const T = '#hud_title_text_string';
  /** JSON UI: slot k's URL out of the title (an empty string when the slot is empty) */
  function slotExpr(ch, k) {
    const P = ch.prefix.length + 2 + k * ch.width;
    return `(('%.${ch.width}s' * (${T} - ('%.${P}s' * ${T}))) - ' ')`;
  }
  /** JSON UI: the title is the channel's / the channel says F1 / the channel shows layout L (either flag) */
  const isChannelExpr = (ch) => `(('%.${ch.prefix.length}s' * ${T}) = '${ch.prefix}')`;
  const f1Expr = (ch) => `(('%.${ch.prefix.length + 1}s' * ${T}) = '${ch.prefix}1')`;
  const layoutExpr = (ch, L) => `((('%.${ch.prefix.length + 2}s' * ${T}) = '${ch.prefix}0${L}') or (('%.${ch.prefix.length + 2}s' * ${T}) = '${ch.prefix}1${L}'))`;
  /** a URL image (profile_image_renderer with {"type":7,"url":…}: an image the game fetches by its URL — shown only while the
   *  channel has a URL in its slot, and with the HUD), the size of a rect in its group's local units, put where the group's
   *  renderer draws that rect: it is a sibling of the renderer in the group's square panel, and a square's side is what one
   *  model unit follows (K x side), so size = 100 K w % of the square and the offset, in % of its own size, is (G + x) / w */
  function urlImageControl(g, u, ch, followHud) {
    const r = u.rect;
    if (!r || !(r.w > 0) || !(r.h > 0)) throw new Error(`URL の画像 ${u.id} の rect（x, y, w, h: グループの単位）が要ります`);
    const G = g.origin, dx = (G[0] + r.x) / r.w, dy = (r.y + D - G[1]) / r.h;
    const slot = Math.round(num(u.slot, 0)), url = slotExpr(ch, slot);
    const show = `(${isChannelExpr(ch)} and (not (${url} = ''))${followHud ? ' and #hud_visible' : ''})`;
    return { type: 'custom', renderer: 'profile_image_renderer', layer: u.layer !== undefined && u.layer !== null ? num(u.layer, 0) : u.above ? 2 : 0,
      size: [pct(100 * K * r.w), pct(100 * K * r.h)], anchor_from: 'center', anchor_to: 'top_left', offset: [`${r6(100 * dx)}%x`, `${r6(100 * dy)}%y`],
      bindings: [
        { binding_name: T, binding_type: 'global' },
        ...(followHud ? [{ binding_name: '#hud_visible', binding_type: 'global' }] : []),
        { binding_type: 'view', source_property_name: `('{"type":7,"url":"' + ${url} + '"}')`, target_property_name: '#profile_image_options' },
        { binding_type: 'view', source_property_name: show, target_property_name: '#visible' },
      ] };
  }

  // ---- the JSON UI: a viewport panel in the HUD's root panel, one renderer per group ------------------------------------
  const pct = (v) => `${r6(v)}%`;
  /** the square panel of a group (size, and for contain the two panels that make min(width, height) a square); extra: more
   *  controls beside the renderer (URL images) */
  function squareOf(g, ns, renderer, extra = []) {
    const off = offsetOf(g.origin);
    const sq = (size, more) => Object.assign({ type: 'panel', size, anchor_from: g.anchor, anchor_to: 'center', offset: off, controls: [{ [`${ns}_r_${g.id}`]: renderer }, ...extra] }, more || {});
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
   *  (a group with clip: inside a panel that clips_children). opts.followHud: hidden with the HUD (the game's own F1).
   *  With the title channel (scene.urlImages, scene.f1): the URL images beside their groups' renderers, and the HUD's own
   *  title hidden while it is the channel's. With scene.f1: the viewport moves out to hud_content (root_panel's parent, the
   *  same box) and root_panel — the whole of the game's own HUD: hotbar, chat, titles, boss bars, the sidebar … — is hidden
   *  while the channel says F1; GeoUI stays */
  function hudScreen(scene, opts = {}) {
    const ns = scene.ns, groups = groupsOf(scene), followHud = opts.followHud !== false, ch = channelOf(scene);
    const renderer = () => Object.assign({ type: 'custom', renderer: 'live_player_renderer', layer: 1, size: ['100%', '100%'] },
      followHud ? { bindings: [{ binding_name: '#hud_visible', binding_name_override: '#visible' }] } : {});
    const ids = new Set(groups.map((g) => g.id)), seenImg = new Set();
    for (const u of scene.urlImages || []) {
      if (!/^[a-z0-9_]{1,24}$/.test(String(u.id))) throw new Error(`URL の画像の名前「${u.id}」は英小文字・数字・_ で 24 文字まで`);
      if (seenImg.has(u.id)) throw new Error(`URL の画像 ${u.id} が 2 つあります`);
      seenImg.add(u.id);
      if (!ids.has(u.group)) throw new Error(`URL の画像 ${u.id} のグループ「${u.group}」がありません`);
    }
    const controls = groups.filter((g) => g.renderer !== false).map((g) => {
      const imgs = (scene.urlImages || []).filter((u) => u.group === g.id).map((u) => ({ [`${ns}_url_${u.id}`]: urlImageControl(g, u, ch, followHud) }));
      let panel = squareOf(g, ns, renderer(), imgs);
      if (g.clip) {
        // the clip box: its own size and anchor on the viewport; the group's renderer inside it, anchored as before (to the box)
        const c = g.clip;
        panel = { type: 'panel', size: c.size || ['100%', '100%'], anchor_from: anchorName(c.anchor || 'center'), anchor_to: anchorName(c.anchor || 'center'),
          offset: c.offset || [0, 0], clips_children: true, controls: [{ [`${ns}_g_${g.id}`]: panel }] };
      }
      if (g.layer !== undefined) panel.layer = g.layer;
      // (a group of a layout: drawn — its renderer, its URL images — only while the channel shows that layout's letter)
      if (ch && g.layout !== undefined && g.layout !== null) panel.bindings = [{ binding_name: T, binding_type: 'global' }, { binding_type: 'view', source_property_name: layoutExpr(ch, g.layout), target_property_name: '#visible' }];
      return { [`${ns}_${g.clip ? 'clip' : 'g'}_${g.id}`]: panel };
    });
    // (a backdrop over the whole screen, cut-outs too — the HUD's own black, at 200 % as the game's own modal shade — while the
    //  channel shows one of its layouts: what a full-screen GeoUI covers the world with; layer −5: under the URL images (0, or
    //  their own layer: a picture kept under the next one) and the renderers (1))
    if (scene.backdrop) {
      if (!ch) throw new Error('backdrop はタイトルの通り道（urlImages・f1・layout）と使います');
      const b = scene.backdrop, lays = String(b.layouts || '');
      for (const L of lays) if (!CHANNEL.layouts.includes(L)) throw new Error(`backdrop の layouts「${lays}」は a〜z の文字`);
      // (one short sum, not an `or` of two comparisons a layout: the layout's letter (the 6 characters less the 5 before it) taken
      //  out of the backdrop's letters changes them when it is one of them. 8 本目・9 本目: the `or` of 8 layouts (16 comparisons)
      //  never showed — the world beside a 16:9 page on a 20:9 screen — while the probe's one-layout backdrop did, F1 and the
      //  frozen camera or not: R10.19)
      const letter = `(('%.${ch.prefix.length + 2}s' * ${T}) - ('%.${ch.prefix.length + 1}s' * ${T}))`;
      const show = lays ? `(${isChannelExpr(ch)} and (not (('${lays}' - ${letter}) = '${lays}')))` : isChannelExpr(ch);
      controls.unshift({ [`${ns}_backdrop`]: { type: 'image', texture: b.texture || 'textures/ui/Black.png', fill: true, size: ['200%', '200%'], alpha: num(b.alpha, 1), layer: num(b.layer, -5),
        bindings: [{ binding_name: T, binding_type: 'global' }, { binding_type: 'view', source_property_name: show, target_property_name: '#visible' }] } });
    }
    // (extra controls of the scene's own: a renderer placed some other way, a label bound to a HUD text — as they are)
    for (const c of scene.extraControls || []) controls.push(c);
    const vp = {
      type: 'panel', [`$${ns}_vp_size|default`]: ['100%', '100%'], size: `$${ns}_vp_size`,
      variables: [{ requires: '($compress_hud_width)', [`$${ns}_vp_size`]: ['111.111111%', '100%'] }],
      controls,
    };
    const out = { namespace: 'hud', [`${ns}_vp`]: vp };
    const host = ch && ch.f1 ? 'hud_content' : 'root_panel';
    out[host] = { modifications: [{ array_name: 'controls', operation: 'insert_front', value: [{ [`${ns}_vp@hud.${ns}_vp`]: {} }] }] };
    if (ch && ch.titleHide === 'text') {
      // (2〜4 本目: the HUD's title, made by its factory from hud.hud_title_text: hidden while the title is the channel's. No plain
      //  title was seen with it in any way (run 41008713796: title-plain・title-api・web-title 0 %): R10.14)
      out.hud_title_text = { bindings: [{ binding_name: T, binding_type: 'global', binding_condition: 'always' }, { binding_type: 'view', source_property_name: `(not ${isChannelExpr(ch)})`, target_property_name: '#visible', binding_condition: 'always' }] };
    }
    if (ch && ch.titleHide === 'area') {
      // (5 本目: hud.hud_title_text is left as the game has it. The plain panel root_panel holds the title's factory in
      //  (hud_title_text_area) is put back after itself with the same factory and a #visible view binding on the title string —
      //  the form root_panel's own F1 binding has, measured to work (R10.15) — and the game's own is removed: every title the
      //  factory makes is inside this panel, shown unless the title is the channel's)
      const area = { type: 'panel', factory: { name: 'hud_title_text_factory', control_ids: { hud_title_text: 'hud_title_text@hud.hud_title_text' } },
        bindings: [{ binding_name: T, binding_type: 'global' }, { binding_type: 'view', source_property_name: `(not ${isChannelExpr(ch)})`, target_property_name: '#visible' }] };
      out.root_panel = out.root_panel || {};
      out.root_panel.modifications = (out.root_panel.modifications || []).concat([
        { control_name: 'hud_title_text_area', operation: 'insert_after', value: [{ [`${ns}_title_area`]: area }] },
        { control_name: 'hud_title_text_area', operation: 'remove' },
      ]);
    }
    if (ch && ch.f1) {
      // (root_panel's own three bindings as the game has them, and its #visible also off while the channel says F1)
      out.root_panel = Object.assign(out.root_panel || {}, { bindings: [
        { binding_name: '#hud_visible', binding_type: 'global' },
        { binding_name: T, binding_type: 'global' },
        { binding_type: 'view', source_property_name: `(#hud_visible and (not ${f1Expr(ch)}))`, target_property_name: '#visible' },
        { binding_name: '#hud_alpha', binding_name_override: '#alpha', binding_type: 'global' },
        { binding_name: '#hud_propagate_alpha', binding_name_override: '#propagateAlpha', binding_type: 'global' },
      ] });
    }
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
    K, K_MEASURED, K_ERR, D, D_ERR, BAND_Y, GROUP_DX, GROUP_DY, GUI_Y, GUI_DX, GUI_DY, ANCHORS, ANCHOR_NAMES, MODES, DEVICES,
    anchorName, modeOf, sidePx, unitPx, viewportUnits, groupOrigin, guiOrigin, offsetOf, groupsOf, anchorPx, localToScreen, rectToScreen, rectToModel, ghosts,
    squareOf, hudScreen, deviceTable, CHANNEL, channelOf, channelText, slotExpr, isChannelExpr, f1Expr, layoutExpr, urlImageControl,
  };
  if (typeof module === 'object' && module && module.exports) module.exports = S.layout;
})(typeof globalThis !== 'undefined' ? globalThis : this);
