#!/usr/bin/env node
// GeoUI's URL images, F1 and the title channel (bds/geoui/screen/layout.js, pack.js, channel.js) — no network, no game:
//   url      every URL image laid out by the JSON UI layout.js writes (a small JSON UI layout of its own here) lands on the rect
//            its group's renderer draws, on 13 screens x 4 scales x 9 anchors, the HUD compressed or not
//   channel  the title the script sends and what the JSON UI reads back (the same sums as slotExpr), F1 and slots, refreshes
//   layouts  a group drawn only while the channel shows its letter, the backdrop
//   f1       the HUD: the viewport in hud_content, root_panel hidden by the channel, the game's own title hidden for it; the
//            player: its arms and items at scale 0 and its body hidden in the world only, the property, more script modules
//   service  bds/geoui/web/server.mjs with no browser: the check pictures, the record of fetches, who may act; the browser's
//            address rules (engine.mjs); the probe add-on is what probe.mjs makes
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../bds/geoui/geoui_builder.js');
const L = require('../bds/geoui/screen/layout.js'), P = require('../bds/geoui/screen/pack.js'), C = require('../bds/geoui/screen/channel.js');
// (the in-game browser's engine runs here with a fake world: runtime.js)
const core = globalThis.GeoUICore || G;

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${String(d).split('\n').slice(0, 12).join('\n  ')}`}`); };

// ---- a JSON UI layout of the subset layout.hudScreen writes (independent of layout.js's sums: size with % / %x / %y of the
//      control's own other side and max_size, anchors, offsets in % of the control's own size)
function lenOf(v, parentLen, own) {
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  let m;
  if ((m = /^(-?[\d.]+)%x$/.exec(s))) return own.w() * Number(m[1]) / 100;
  if ((m = /^(-?[\d.]+)%y$/.exec(s))) return own.h() * Number(m[1]) / 100;
  if ((m = /^(-?[\d.]+)%$/.exec(s))) return parentLen * Number(m[1]) / 100;
  if ((m = /^(-?[\d.]+)(px)?$/.exec(s))) return Number(m[1]);
  throw new Error(`unknown length ${s}`);
}
const AP = { top_left: [0, 0], top_middle: [0.5, 0], top_right: [1, 0], left_middle: [0, 0.5], center: [0.5, 0.5], right_middle: [1, 0.5], bottom_left: [0, 1], bottom_middle: [0.5, 1], bottom_right: [1, 1] };
function place(ctl, parent, vars = {}) {
  let size = ctl.size || ['100%', '100%'];
  if (typeof size === 'string' && size.startsWith('$')) size = vars[size] || ctl[`${size}|default`];
  let w = null, h = null;
  const own = { w: () => { if (w === null) w = lenOf(size[0], parent.w, own); return w; }, h: () => { if (h === null) h = lenOf(size[1], parent.h, own); return h; } };
  if (/%y$/.test(String(size[0]))) { own.h(); own.w(); } else { own.w(); own.h(); }
  if (ctl.max_size) { w = Math.min(w, lenOf(ctl.max_size[0], parent.w, own)); h = Math.min(h, lenOf(ctl.max_size[1], parent.h, own)); }
  const af = AP[ctl.anchor_from || 'center'], at = AP[ctl.anchor_to || 'center'], off = ctl.offset || [0, 0];
  const ox = lenOf(off[0], parent.w, { w: () => w, h: () => h }), oy = lenOf(off[1], parent.h, { w: () => w, h: () => h });
  return { x: parent.x + af[0] * parent.w - at[0] * w + ox, y: parent.y + af[1] * parent.h - at[1] * h + oy, w, h };
}
/** every control of a kind (renderer name) laid out in the viewport of a hud_screen.json on a W x H HUD */
function rects(hud, ns, W, H, compress, renderer) {
  const vp0 = hud[`${ns}_vp`], vars = compress ? { [`$${ns}_vp_size`]: vp0.variables[0][`$${ns}_vp_size`] } : {};
  const root = { x: 0, y: 0, w: compress ? W * 0.9 : W, h: H }, vp = place(Object.assign({}, vp0), root, vars);
  if (compress) vp.x = (W - vp.w) / 2;
  const out = {};
  const walk = (ctl, rect) => { for (const c of ctl.controls || []) { const [name, def] = Object.entries(c)[0], r = place(def, rect); if (def.type === 'custom' && def.renderer === renderer) out[name] = r; walk(def, r); } };
  walk(vp0, vp);
  return out;
}

// ---- the JSON UI's string sums, done here on a title (a small parser of the binding language's subset the channel uses:
//      'text', #names, ( ), * (a '%.Ns' format: the first N characters), - (every occurrence taken out), + (joined), = (equal),
//      and, or, not) — independent of layout.js: what the game would compute for an expression it writes
function jsonui(expr, vars) {
  const toks = [];
  for (let i = 0; i < expr.length;) {
    const c = expr[i];
    if (c === ' ') { i++; continue; }
    if (c === "'") { const j = expr.indexOf("'", i + 1); toks.push({ s: expr.slice(i + 1, j) }); i = j + 1; continue; }
    if ('()*-+='.includes(c)) { toks.push({ op: c }); i++; continue; }
    const m = /^(#?[A-Za-z_][\w]*)/.exec(expr.slice(i));
    if (!m) throw new Error(`cannot read ${expr.slice(i, i + 20)}`);
    toks.push(['and', 'or', 'not'].includes(m[1]) ? { op: m[1] } : { name: m[1] }); i += m[1].length;
  }
  let k = 0;
  const peek = () => toks[k], take = () => toks[k++];
  const PREC = { or: 1, and: 2, '=': 3, '+': 4, '-': 4, '*': 5 };
  const prim = () => {
    const t = take();
    if (!t) throw new Error('end');
    if (t.op === '(') { const v = expr2(0); if ((take() || {}).op !== ')') throw new Error(') missing'); return v; }
    if (t.op === 'not') return !prim();
    if (t.s !== undefined) return t.s;
    if (t.name) { if (!(t.name in vars)) throw new Error(`unknown ${t.name}`); return vars[t.name]; }
    throw new Error(`unexpected ${JSON.stringify(t)}`);
  };
  const expr2 = (min) => {
    let a = prim();
    for (;;) {
      const t = peek();
      if (!t || !t.op || !(t.op in PREC) || PREC[t.op] < min) return a;
      take();
      const b = expr2(PREC[t.op] + 1);
      if (t.op === '*') { const m = /^%\.(\d+)s$/.exec(a); if (!m) throw new Error(`format ${a}`); a = String(b).slice(0, Number(m[1])); }
      else if (t.op === '-') a = String(a).split(String(b)).join('');
      else if (t.op === '+') a = String(a) + String(b);
      else if (t.op === '=') a = a === b;
      else if (t.op === 'and') a = !!a && !!b;
      else if (t.op === 'or') a = !!a || !!b;
    }
  };
  const v = expr2(0);
  if (k !== toks.length) throw new Error(`left over: ${JSON.stringify(toks.slice(k))}`);
  return v;
}

// ---- url: each image on the rect its group's renderer draws
{
  const groups = [];
  L.ANCHOR_NAMES.forEach((a, i) => groups.push({ id: `h${i}`, anchor: a }));
  groups.push({ id: 'w', anchor: 'top_right', scale: { mode: 'width', s: 0.05 } }, { id: 'u', anchor: 'bottom_middle', scale: { mode: 'gui', px: 1 } });
  for (const a of ['center', 'top_left', 'bottom_right', 'right_middle']) groups.push({ id: `k_${a}`, anchor: a, scale: { mode: 'contain', w: 1280, h: 720, g: 0.25 } });
  const rectFor = (g) => (g.id.startsWith('k_') ? { x: -160 + (g.id.length % 7), y: -90 + 3, w: 300, h: 160 } : { x: -20, y: 5, w: 40, h: 24 });
  const scene = { ns: 'uu', scale: { mode: 'height', s: 0.1 }, groups, urlImages: groups.map((g, i) => ({ id: `i_${g.id}`, group: g.id, slot: i % 8, rect: rectFor(g) })) };
  const hud = L.hudScreen(scene), gs = L.groupsOf(scene);
  let worst = 0, where = '', count = 0;
  for (const d of L.DEVICES) for (const compress of [false, true]) {
    const R = rects(hud, 'uu', d.w, d.h, compress, 'profile_image_renderer');
    for (const g of gs) {
      const r = R[`uu_url_i_${g.id}`];
      if (!r) { worst = Infinity; where = `no image for ${g.id}`; continue; }
      const want = L.rectToScreen(g, rectFor(g), d.w, d.h, 1), e = Math.max(Math.abs(r.x - want.x0), Math.abs(r.y - want.y0), Math.abs(r.x + r.w - want.x1), Math.abs(r.y + r.h - want.y1));
      count++;
      if (e > worst) { worst = e; where = `${d.id} ${g.id} compress=${compress} want ${JSON.stringify(want)} got ${JSON.stringify(r)}`; }
    }
  }
  ok(worst < 1e-3 && count === L.DEVICES.length * 2 * gs.length, `URL images: each one on the rect its group's renderer draws — ${L.DEVICES.length} screens x 4 scales x 9 anchors, compressed or not (worst ${worst.toExponential(1)} px)`, where);
  const img = hud.uu_vp.controls.map((c) => Object.values(c)[0]).flatMap(function f(x) { return [x, ...(x.controls || []).flatMap((c) => f(Object.values(c)[0]))]; }).find((x) => x.renderer === 'profile_image_renderer');
  const opts = img.bindings.find((b) => b.target_property_name === '#profile_image_options').source_property_name, vis = img.bindings.find((b) => b.target_property_name === '#visible').source_property_name;
  ok(/^\('\{"type":7,"url":"' \+ \(\('%\.230s' \* \(#hud_title_text_string - \('%\.6s' \* #hud_title_text_string\)\)\) - ' '\) \+ '"\}'\)$/.test(opts)
    && vis.includes("(('%.4s' * #hud_title_text_string) = '~gu~')") && vis.includes('#hud_visible') && img.bindings[0].binding_name === '#hud_title_text_string' && img.layer === 0,
  'URL image: profile_image_renderer with {"type":7,"url":…} from its slot of the title; shown only for the channel, a URL there and the HUD; below the renderer', `${opts}\n${vis}`);
  const throws = (f) => { try { f(); return false; } catch { return true; } };
  ok(throws(() => L.hudScreen({ ns: 'x', groups: [{ id: 'a' }], urlImages: [{ id: 'i', group: 'nope', rect: { x: 0, y: 0, w: 1, h: 1 } }] }))
    && throws(() => L.hudScreen({ ns: 'x', groups: [{ id: 'a' }], urlImages: [{ id: 'i', group: 'a', rect: { x: 0, y: 0, w: 0, h: 1 } }] }))
    && throws(() => L.hudScreen({ ns: 'x', groups: [{ id: 'a' }], urlImages: [{ id: 'i', group: 'a', slot: 8, rect: { x: 0, y: 0, w: 1, h: 1 } }] }))
    && throws(() => L.hudScreen({ ns: 'x', groups: [{ id: 'a' }], urlImages: [{ id: 'i', group: 'a', rect: { x: 0, y: 0, w: 1, h: 1 } }, { id: 'i', group: 'a', rect: { x: 0, y: 0, w: 1, h: 1 } }] })),
  'URL image: a missing group, an empty rect, a ninth slot, a name twice are refused');
}

// ---- channel: what the script sends, what the JSON UI reads
{
  const ch = L.channelOf({ urlImages: [{ id: 'a', slot: 0, rect: {} }, { id: 'b', slot: 2, rect: {} }], f1: true, channel: { width: 64 } });
  const urls = ['http://10.0.2.2:8787/f/12.png', '', 'https://placehold.co/64x64/ff8000/ff8000.png?x=1'];
  const t = L.channelText(ch, { f1: true, layout: 'c', urls });
  ok(ch.slots === 3 && ch.width === 64 && ch.head === 6 && t === C.text({ slots: 3, width: 64 }, { f1: true, layout: 'c', urls }) && t.length === 6 + 3 * 64 && t.startsWith('~gu~1chttp'),
    'channel: layout.js and the script write the same title (prefix, F1 flag, layout letter, fixed-width fields)', JSON.stringify(t));
  // (the slot's own expression, as the game computes it on the title, and the same done by hand: drop the first P characters —
  //  they occur once —, cut to the width, no spaces)
  const byHand = (title, k) => { const P = 6 + k * ch.width, head = title.slice(0, P); return title.split(head).join('').slice(0, ch.width).replace(/ /g, ''); };
  const T = '#hud_title_text_string', ev = (e, title) => jsonui(e, { [T]: title, '#hud_visible': true });
  const exprNums = [0, 1, 2].map((k) => /'%\.(\d+)s' \* \(#hud_title_text_string - \('%\.(\d+)s'/.exec(L.slotExpr(ch, k)).slice(1).map(Number));
  ok([0, 1, 2].every((k) => byHand(t, k) === urls[k] && ev(L.slotExpr(ch, k), t) === urls[k] && C.read(ch, t).urls[k] === urls[k]) && JSON.stringify(exprNums) === JSON.stringify([[64, 6], [64, 70], [64, 134]]),
    'channel: each slot read back by its JSON UI expression (it drops 6 + 64 k characters and keeps 64), by hand and by channel.read', JSON.stringify(exprNums));
  ok(ev(L.isChannelExpr(ch), t) === true && ev(L.f1Expr(ch), t) === true && ev(L.layoutExpr(ch, 'c'), t) === true && ev(L.layoutExpr(ch, 'b'), t) === false
    && ev(L.f1Expr(ch), L.channelText(ch, { layout: 'c', urls })) === false && ev(L.layoutExpr(ch, 'c'), L.channelText(ch, { layout: 'c', urls })) === true
    && ev(L.isChannelExpr(ch), 'Welcome!') === false && ev(L.layoutExpr(ch, 'a'), 'Welcome!') === false && C.read(ch, t).layout === 'c',
  'channel: the channel, its F1 flag and its layout letter read by their JSON UI expressions (either flag for a layout; another title is none of them)');
  const r0 = C.read(ch, 'Welcome!'), r1 = C.read(ch, L.channelText(ch, {}));
  ok(!r0.channel && r1.channel && !r1.f1 && r1.layout === 'a' && r1.urls.every((u) => u === ''), 'channel: another pack\'s title is not the channel; an empty one is (no F1, layout a, no URLs)');
  const throws = (f) => { try { f(); return false; } catch { return true; } };
  ok(throws(() => C.text({ slots: 1, width: 16 }, { urls: ['http://a.b/' + 'x'.repeat(10)] })) && throws(() => C.text({ slots: 1, width: 64 }, { urls: ['http://a b'] })) && throws(() => C.text({ slots: 1, width: 64 }, { urls: ['http://a"b'] }))
    && throws(() => C.text({ slots: 0 }, { layout: 'B' })) && throws(() => L.channelText(ch, { layout: 'ab' })),
  'channel: a URL longer than its field, or with a space or a quote, and a layout that is not one letter a–z are refused (the JSON UI could not carry them)');
  // the per-player state: sent once when it changes, again every refreshTicks, cleared when nothing is on
  const sent = [], io = { title: (p, x) => sent.push(x === C.EMPTY ? `E${p.id}` : `T${p.id}:${x.slice(4, 6)}${x.slice(6).trim().length}`), prop: (p, k, v) => sent.push(`P${p.id}:${k}=${v}`),
    hideHud: (p, keep) => { sent.push(`H${p.id}:${keep.join()}`); return ['hotbar']; }, restoreHud: (p, b) => sent.push(`R${p.id}:${b.join()}`) };
  const c = C.create({ ns: 'zz', slots: 2, width: 64, refreshTicks: 10 }, io), A = { id: 'a', isValid: true }, B = { id: 'b', isValid: true };
  c.f1(A, true, { keep: ['TouchControls'] }); c.f1(A, true); c.url(A, 1, 'http://h/1.png'); c.url(B, 0, 'http://h/2.png');
  for (let t2 = 1; t2 <= 10; t2++) c.tick(t2);
  B.isValid = false; c.tick(11);
  c.f1(A, false); c.url(A, 1, '');
  ok(JSON.stringify(sent) === JSON.stringify(['Ha:TouchControls', 'Pa:zz:f1=1', 'Ta:1a0', 'Ta:1a14', 'Tb:0a14', 'Ta:1a14', 'Tb:0a14', 'Ra:hotbar', 'Pa:zz:f1=0', 'Ta:0a14', 'Ea']),
    'channel: F1 on hides the HUD (but what is kept) and sets the property, once; each change is sent at once, the same again after refreshTicks; a player who left is dropped; off gives the HUD back; nothing on sends the empty channel (`title clear` keeps the text: R10.7)', JSON.stringify(sent));
  sent.length = 0;
  const N = C.create({ ns: 'zz', slots: 1, width: 64, refreshTicks: 0 }, io), E = { id: 'e', isValid: true };
  N.url(E, 0, 'http://h/1.png'); for (let t2 = 1; t2 <= 500; t2++) N.tick(t2); N.url(E, 0, ''); N.tick(501); N.tick(900);
  ok(JSON.stringify(sent) === JSON.stringify(['Te:0a14', 'Ee']) && C.read({ slots: 1, width: 64 }, C.EMPTY).channel && C.read({ slots: 1, width: 64 }, C.EMPTY).urls[0] === '',
    'channel: refreshTicks 0 never sends the same text again; the empty channel is sent once and reads as no picture', JSON.stringify(sent));
  sent.length = 0;
  const D = { id: 'd', isValid: true };
  c.layout(D, 'b'); c.urls(D, { 0: 'http://h/p.png', 1: 'http://h/t.png' }); c.urls(D, { 0: 'http://h/p.png', 1: 'http://h/t.png' }); c.f1(D, true); c.reset(D);
  ok(JSON.stringify(sent) === JSON.stringify(['Td:0b0', 'Td:0b78', 'Hd:', 'Pd:zz:f1=1', 'Td:1b78', 'Rd:hotbar', 'Pd:zz:f1=0', 'Ed']) && C.read({ slots: 2, width: 64 }, c.text(D)).layout === 'a',
    'channel: a layout alone keeps the title; two slots change in one title (the same pair again sends nothing); reset gives everything back at once and clears it', JSON.stringify(sent));
}

// ---- layouts: a group drawn only while the channel shows its letter; the backdrop
{
  const scene = { ns: 'll', scale: { mode: 'contain', w: 1280, h: 720, g: 0.25 }, groups: [{ id: 'plain' }, { id: 'wide', layout: 'b', scale: { mode: 'contain', w: 1600, h: 720, g: 0.25 } }, { id: 'tall', layout: 'c', clip: { size: ['50%', '50%'] } }],
    urlImages: [{ id: 'pg', group: 'wide', slot: 0, rect: { x: -200, y: -80, w: 400, h: 160 } }], backdrop: { layouts: 'bc' } };
  const hud = L.hudScreen(scene), ch = L.channelOf(scene), top = Object.fromEntries(hud.ll_vp.controls.map((c) => Object.entries(c)[0]));
  const T = '#hud_title_text_string', vis = (ctl, title) => jsonui(ctl.bindings.find((b) => b.target_property_name === '#visible').source_property_name, { [T]: title, '#hud_visible': true });
  const tb = L.channelText(ch, { layout: 'b', urls: ['http://x/1.png'] }), tc = L.channelText(ch, { f1: true, layout: 'c' }), ta = L.channelText(ch, {});
  ok(!top.ll_g_plain.bindings && vis(top.ll_g_wide, tb) && !vis(top.ll_g_wide, tc) && !vis(top.ll_g_wide, ta) && vis(top.ll_clip_tall, tc) && !vis(top.ll_clip_tall, tb) && !vis(top.ll_g_wide, 'Hello'),
    'layouts: a group of layout b is drawn only while the channel says b (with or without F1), a clipped one of c only for c; a group of no layout always');
  const bd = top.ll_backdrop;
  ok(hud.ll_vp.controls[0].ll_backdrop === bd && bd.type === 'image' && bd.texture === 'textures/ui/Black.png' && bd.size.join() === '200%,200%' && bd.layer === -5
    && vis(bd, tb) && vis(bd, tc) && !vis(bd, ta) && !vis(bd, 'Hello'),
  'layouts: the backdrop (the game\'s own black, 200 % of the screen, first and at layer −5: under everything) shows while the channel shows one of its layouts');
  const throws = (f) => { try { f(); return false; } catch { return true; } };
  ok(throws(() => L.hudScreen({ ns: 'x', groups: [{ id: 'a', layout: 'B' }] })) && throws(() => L.hudScreen({ ns: 'x', groups: [{ id: 'a' }], backdrop: {} })) && throws(() => L.hudScreen({ ns: 'x', groups: [{ id: 'a', layout: 'b' }], backdrop: { layouts: 'b1' } })),
    'layouts: a layout that is not a letter a–z, a backdrop with no channel, a backdrop of a layout that is not a letter are refused');
  // (the image of the layout group still lands where that group's renderer draws: its square panel is the one with the bindings)
  const g = L.groupsOf(scene).find((x) => x.id === 'wide'), R = rects(hud, 'll', 2400, 1080, false, 'profile_image_renderer').ll_url_pg, want = L.rectToScreen(g, scene.urlImages[0].rect, 2400, 1080, 1);
  ok(R && Math.max(Math.abs(R.x - want.x0), Math.abs(R.y - want.y0), Math.abs(R.x + R.w - want.x1), Math.abs(R.y + R.h - want.y1)) < 1e-3,
    'layouts: a URL image in a layout group on its rect (2400 x 1080, a 1600 x 720 design: the whole screen)', JSON.stringify({ R, want }));
}

// ---- f1: the HUD and the player
{
  const scene = { ns: 'ff', scale: { mode: 'height', s: 0.1 }, groups: [{ id: 'm', anchor: 'center' }], f1: true, urlImages: [{ id: 'p', group: 'm', rect: { x: -10, y: -10, w: 20, h: 20 } }] };
  const hud = L.hudScreen(scene);
  const rp = hud.root_panel.bindings, vis = rp.find((b) => b.target_property_name === '#visible');
  ok(hud.hud_content.modifications[0].value[0]['ff_vp@hud.ff_vp'] && !hud.root_panel.modifications
    && rp.some((b) => b.binding_name === '#hud_visible' && b.binding_type === 'global' && !b.binding_name_override)
    && rp.some((b) => b.binding_name === '#hud_alpha' && b.binding_name_override === '#alpha') && rp.some((b) => b.binding_name === '#hud_propagate_alpha' && b.binding_name_override === '#propagateAlpha')
    && vis.source_property_name === "(#hud_visible and (not (('%.5s' * #hud_title_text_string) = '~gu~1')))" && jsonui(vis.source_property_name, { '#hud_visible': true, '#hud_title_text_string': '~gu~1a' }) === false && jsonui(vis.source_property_name, { '#hud_visible': true, '#hud_title_text_string': '~gu~0b' }) === true,
  'F1 HUD: the viewport in hud_content (root_panel\'s box); root_panel keeps its own bindings and is hidden while the channel says F1', JSON.stringify(rp));
  ok(hud.hud_title_text.bindings[1].source_property_name === "(not (('%.4s' * #hud_title_text_string) = '~gu~'))", 'F1 HUD: the game\'s own title hidden while it is the channel\'s');
  const plain = L.hudScreen({ ns: 'pp', groups: [{ id: 'm' }] });
  ok(plain.root_panel.modifications && !plain.hud_content && !plain.hud_title_text, 'without F1 or URL images: the viewport stays in root_panel, nothing of the game\'s HUD changed');
  const pk = P.build(Object.assign({}, scene, { textures: [{ id: 't', width: 4, height: 4, png: Buffer.alloc(0) }], bones: [{ name: 'ff_b', group: 'm' }], planes: [], hideLocalPlayer: 'v.ff_h > 0',
    modules: [{ module_name: '@minecraft/server-net', version: '1.0.0-beta' }], script: '// s' }), { core });
  const ce = JSON.parse(pk.files['rp/entity/player.entity.json'])['minecraft:client_entity'].description, an = JSON.parse(pk.files['rp/animations/ff.animation.json']).animations['animation.ff.f1'];
  const rcs = Object.fromEntries(ce.render_controllers.map((x) => Object.entries(x)[0]));
  ok(JSON.stringify(an.bones) === JSON.stringify({ rightArm: { scale: 0 }, leftArm: { scale: 0 }, rightItem: { scale: 0 }, leftItem: { scale: 0 } }) && ce.animations.ff_f1 === 'animation.ff.f1'
    && ce.scripts.animate.some((x) => x.ff_f1 === 'v.ff_f1 > 0 && (variable.is_first_person || (q.is_local_player && !q.is_in_ui))') && ce.scripts.pre_animation.includes("v.ff_f1 = variable.is_paperdoll ? 0 : q.property('ff:f1');"),
  'F1 player: the arms and held items at scale 0 in first person and for the local player in the world (not in a UI), the property read where the paper doll is guarded');
  ok(['third_person', 'third_person_spectator'].every((k) => rcs[`controller.render.player.${k}`].endsWith(') && !(q.is_local_player && !q.is_in_ui && ((v.ff_h > 0) || (v.ff_f1 > 0)))'))
    && ['first_person', 'first_person_spectator'].every((k) => rcs[`controller.render.player.${k}`].endsWith(') && !((q.is_local_player && !q.is_in_ui && (v.ff_h > 0)) || (v.ff_f1 > 0))'))
    && rcs['controller.render.player.map'] === 'variable.map_face_icon',
  'F1 player: its body hidden from itself in the world (third person: the local player out of a UI; first person: F1 alone — the first-person view is the local player\'s own), the map icon as it was', JSON.stringify(rcs));
  const be = JSON.parse(pk.files['bp/entities/player.json'])['minecraft:entity'].description.properties, man = JSON.parse(pk.files['bp/manifest.json']);
  ok(be['ff:f1'] && be['ff:f1'].range.join() === '0,1' && be['ff:f1'].client_sync && man.dependencies.some((d) => d.module_name === '@minecraft/server-net' && d.version === '1.0.0-beta'),
    'F1 player: the property ff:f1 (0..1, synced to the client); a scene\'s extra script module in the manifest');
}

// ---- the service (bds/geoui/web/server.mjs) with no browser: the pictures for the checks, the record of fetches, who may act
{
  const { startServer, solidPng, quadPng } = await import('../bds/geoui/web/server.mjs');
  const { decodePng } = await import('../bds/geoui/png.mjs');
  const { isPrivateHost, toUrl } = await import('../bds/geoui/web/engine.mjs');
  const s = await startServer({ port: 0, host: '127.0.0.1', public: 'http://10.0.2.2:8787', exitOnQuit: false });
  const get = async (p, h = {}) => { const r = await fetch(s.url + p, { headers: h }); return { status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), buf: Buffer.from(await r.arrayBuffer()) }; };
  const px = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
  const a = await get('/solid/ff8000/40x20.png'), ai = decodePng(a.buf);
  const q = await get('/quad/64x32.png'), qi = decodePng(q.buf);
  ok(a.status === 200 && a.type === 'image/png' && ai.width === 40 && ai.height === 20 && px(ai, 0, 0).join() === '255,128,0' && px(ai, 39, 19).join() === '255,128,0' && /immutable/.test(a.cache)
    && qi.width === 64 && [px(qi, 1, 1), px(qi, 62, 1), px(qi, 1, 30), px(qi, 62, 30)].map((c) => c.join()).join(' ') === '255,0,0 0,255,0 0,0,255 255,255,0',
  'service: one colour and the four quarters (red green / blue yellow) at the size asked, kept by the game\'s cache (immutable)');
  const c1 = decodePng((await get('/count/zz/8x8.png')).buf), c2 = decodePng((await get('/count/zz/8x8.png')).buf), slow0 = Date.now(), sl = await get('/slow/300/solid/0000ff/4x4.png'), slowMs = Date.now() - slow0;
  ok(px(c1, 0, 0).join() === '255,0,0' && px(c2, 0, 0).join() === '255,128,0' && sl.status === 200 && slowMs >= 280 && px(decodePng(sl.buf), 0, 0).join() === '0,0,255',
    'service: /count gives the next hue at each fetch of the same address, /slow the same picture after its wait', `${px(c1, 0, 0)} ${px(c2, 0, 0)} ${slowMs} ms`);
  const hits = JSON.parse((await get('/hits')).buf).hits.map((h) => h.path);
  ok(['/solid/ff8000/40x20.png', '/quad/64x32.png', '/count/zz/8x8.png', '/slow/300/solid/0000ff/4x4.png'].every((p) => hits.includes(p)) && hits.filter((p) => p === '/count/zz/8x8.png').length === 2,
    'service: every picture fetched is written down (/hits: when and what, a fetch of the same address twice)', hits.join(' '));
  const info = JSON.parse((await get('/info')).buf), viaHeader = JSON.parse((await get('/info', { 'x-geoui-public': 'http://192.168.1.5:8787' })).buf);
  ok(info.public === 'http://10.0.2.2:8787' && viaHeader.public === 'http://192.168.1.5:8787' && info.browser === false,
    'service: the pictures\' address is --public, or what the script says in x-geoui-public; no browser until a session is asked for');
  const fwd = await fetch(s.url + '/s', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: '{"owner":"x"}' });
  const tun = await fetch(s.url + '/tunnel', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' }, body: '{"url":"https://a.trycloudflare.com"}' });
  const tun2 = await fetch(s.url + '/tunnel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"url":"https://a-b.trycloudflare.com"}' });
  const viaTunnel = JSON.parse((await get('/info', { 'x-geoui-public': 'tunnel' })).buf);
  ok(fwd.status === 403 && tun.status === 403 && tun2.status === 200 && viaTunnel.tunnel === 'https://a-b.trycloudflare.com' && viaTunnel.public === 'https://a-b.trycloudflare.com',
    'service: actions only from this machine (a request through a proxy or a tunnel is refused); the tunnel\'s address set from here, and given to whoever asks for it');
  await s.close();
  ok(isPrivateHost('127.0.0.1') && isPrivateHost('10.0.2.2') && isPrivateHost('192.168.0.1') && isPrivateHost('172.20.1.1') && isPrivateHost('localhost') && isPrivateHost('[::1]') && isPrivateHost('169.254.169.254') && isPrivateHost('router.local')
    && !isPrivateHost('example.com') && !isPrivateHost('8.8.8.8') && !isPrivateHost('172.32.0.1'),
  'browser: the machine\'s own and private addresses are told apart from the internet\'s (a player must not reach the server\'s network)');
  ok(toUrl('example.com') === 'https://example.com' && toUrl('localhost:8787/demo') === 'http://localhost:8787/demo' && toUrl('マイクラ 建築', 'https://s/?q=%s') === 'https://s/?q=%E3%83%9E%E3%82%A4%E3%82%AF%E3%83%A9%20%E5%BB%BA%E7%AF%89'
    && toUrl('https://a.b/c?d') === 'https://a.b/c?d' && toUrl('file:///etc/passwd') === null && toUrl('javascript:alert(1)') === null && toUrl('') === null,
  'browser: the address bar\'s text → a URL (https added), a search, or nothing (file:, javascript:)');
  void solidPng; void quadPng;
}

// ---- the in-game browser's engine (runtime.js) with a fake world and a fake service: open, frames two-layered, input → actions
{
  require('../bds/geoui/screen/nav.js'); require('../bds/geoui/screen/input.js');
  const GS = globalThis.GeoUIScreen, RT = require('../bds/geoui/web/runtime.js');
  const { config } = await import('../bds/geoui/web/make.mjs');
  const CFG = config();
  ok(JSON.stringify(RT.frameOf(CFG, 'b', 720)) === '{"w":1280,"h":720,"barH":72}' && JSON.stringify(RT.frameOf(CFG, 'g', 1080)) === '{"w":2400,"h":1080,"barH":108}'
    && RT.layoutFor(CFG, '20:9') === 'g' && RT.layoutFor(CFG, '2400x1080') === 'g' && RT.layoutFor(CFG, '1024x768') === 'c' && RT.layoutFor(CFG, '2556x1179') === 'f' && RT.layoutFor(CFG, 'x') === null,
  'browser: the frame for a layout and a height (20:9 at 1080 = 2400 x 1080), the nearest layout for a screen');
  const titles = [], props = {}, acts = [], says = [], logs = [];
  let frame = 0, bar = 0, nextResolve = null;
  const stateJ = () => ({ ok: true, sid: 'S1', frame, bar, w: 1280, h: 720, barH: 72, url: 'http://x/', title: 'T', tabs: 1, tab: 0, focus: 'page', frameUrl: `http://h/s/S1/f/${frame}.png`, barUrl: `http://h/s/S1/b/${bar}.png` });
  const http = async (method, p, body) => {
    if (method === 'POST' && p === '/s') { frame = 1; bar = 1; return { status: 200, json: stateJ() }; }
    if (method === 'POST' && p === '/s/S1') { acts.push(body); if (body.op === 'click') frame++; return { status: 200, json: stateJ() }; }
    if (p.startsWith('/s/S1/next')) return new Promise((r) => { nextResolve = () => r({ status: 200, json: stateJ() }); });
    return { status: 404, json: null };
  };
  const P = { id: 'p1', name: 'A', isValid: true };
  let smp = { rot: { x: 0, y: 0 }, move: { x: 0, y: 0 }, jump: false, sneak: false, slot: 0, mode: 'Touch', swings: 0, uses: 0 };
  const io = { players: () => [P], sample: () => Object.assign({}, smp), setProp: (p, k, v) => { props[k] = v; }, freeze: (p, on) => logs.push(`freeze ${on}`), setRotation: () => {},
    say: (p, t) => says.push(t), log: (l) => logs.push(l), http, touch: () => true, platform: () => 'Mobile', load: () => undefined, save: () => {}, wait: () => Promise.resolve() };
  const chIo = { title: (p, t) => titles.push(t), prop: (p, k, v) => { props[k] = v; }, hideHud: (p, keep) => { logs.push(`hide except ${keep.join()}`); return []; }, restoreHud: () => logs.push('restore') };
  const ch = GS.channel.create({ ns: 'gweb', slots: 4, width: 160, refreshTicks: 0 }, chIo), B = RT.createBrowsers(CFG, io, GS, ch);
  const flush = () => new Promise((r) => setTimeout(r, 5));
  const slots = () => GS.channel.read({ slots: 4, width: 160 }, titles[titles.length - 1]);
  await B.open(P, 'http://127.0.0.1:8787/demo/color.html');
  await flush();
  B.tick();
  let r = slots();
  ok(B.isOpen(P) && r.f1 && r.layout === 'g' && r.urls[0] === 'http://h/s/S1/f/1.png' && r.urls[1] === 'http://h/s/S1/b/1.png' && !r.urls[2] && logs.includes('hide except TouchControls') && props['gweb:f1'] === 1 && props['gweb:flg'] === 1,
    'browser: opening on a phone (touch): F1 but its touch controls, layout 20:9, the page and the toolbar on top, the pointer shown', JSON.stringify(r));
  // a new frame: kept until the one on top has had frameTicks; then the shown one under first, the new one on top two ticks later
  frame = 2; nextResolve(); await flush();
  const seen = [];
  for (let i = 0; i < 20; i++) { B.tick(); const x = slots(); seen.push(`${x.urls[0].slice(-5)}|${(x.urls[2] || '-').slice(-5)}`); }
  const firstUnder = seen.findIndex((x) => x === '1.png|1.png'), firstTop = seen.findIndex((x) => x === '2.png|1.png');
  ok(seen[0] === '1.png|-' && firstUnder >= 12 && firstTop === firstUnder + 2,
    'browser: a new frame waits until the one on top has been there frameTicks (the game must get to fetch it), then the shown one is copied under and the new one goes on top two ticks later (R10.4, R10.5)', seen.join(' '));
  // the pointer: the head turned right and down → the pointer's share; a swing clicks there
  smp.rot = { x: 10, y: 20 }; B.tick(); B.tick(); B.tick(); B.tick(); await flush();
  const ptr = props['gweb:ptr'], px = (ptr % 4096) / 4095, py = Math.floor(ptr / 4096) / 4095;
  smp.swings = 1; B.tick(); smp.swings = 0; await flush();
  const click = acts.find((a) => a.op === 'click'), move = acts.find((a) => a.op === 'move');
  ok(px > 0.6 && py > 0.6 && move && click && Math.abs(click.x - Math.round(px * 1279)) <= 1 && Math.abs(click.y - Math.round(py * 719)) <= 1,
    'browser: turning the head moves the pointer (right, down), its hover goes to the page, a swing clicks at it (frame px)', JSON.stringify({ px, py, click, move }));
  // W held: the wheel; a short sneak: back; a long one: close
  smp.move = { x: 0, y: -1 }; for (let i = 0; i < 7; i++) B.tick(); smp.move = { x: 0, y: 0 }; await flush();
  smp.sneak = true; B.tick(); smp.sneak = false; B.tick(); await flush();
  const wheel = acts.filter((a) => a.op === 'wheel'), back = acts.find((a) => a.op === 'back');
  ok(wheel.length >= 1 && wheel.every((w) => w.dy > 0) && wheel.reduce((n, w) => n + w.dy, 0) >= 180 && back,
    'browser: S held scrolls down (a step every 3 ticks), a short sneak is back', JSON.stringify({ wheel, back }));
  smp.sneak = true; for (let i = 0; i < 32; i++) B.tick(); smp.sneak = false; B.tick();
  r = slots();
  ok(!B.isOpen(P) && titles[titles.length - 1] === GS.channel.EMPTY && logs.includes('restore') && logs.includes('freeze false') && props['gweb:flg'] === 0 && props['gweb:f1'] === 0,
    'browser: sneak held 1.5 s closes it: the empty channel (no picture, no F1), the HUD and the camera back, the pointer gone');
  const sz = B.command(P, 'size', ['2400x1080']), needs = B.command(P, 't', ['x']), bad = B.command(P, 'size', ['huge']);
  ok(sz === '' && B.state(P).layout === 'g' && B.state(P).res === 1080 && needs.includes('/web:open') && bad.includes('/web:size'),
    'browser: /web:size chooses the layout and the height (2400x1080 → 20:9 at 1080); a command that needs the browser says so; a shape it cannot read is refused', JSON.stringify({ sz, needs, bad }));
}

// ---- the probe and the web add-ons are what probe.mjs and make.mjs make (bds/addons/geoui_web_probe, geoui_web)
{
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [new URL('../bds/geoui/web/probe.mjs', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
  ok(r.status === 0, 'probe: bds/addons/geoui_web_probe is what bds/geoui/web/probe.mjs makes', r.stderr || r.stdout);
  const w = spawnSync(process.execPath, [new URL('../bds/geoui/web/make.mjs', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
  ok(w.status === 0, 'web: bds/addons/geoui_web is what bds/geoui/web/make.mjs makes', w.stderr || w.stdout);
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} geoui-web-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
