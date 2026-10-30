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
  // the game's own title durations back timesTicks after each channel title (the channel's title has none: a plain title that
  // sets none would get them — R10.14); F1 without its flag (a touch screen: its pad is drawn in root_panel — R10.12)
  sent.length = 0;
  const M = C.create({ ns: 'zz', slots: 1, width: 64, refreshTicks: 0 }, Object.assign({}, io, { times: (p) => sent.push(`D${p.id}`) })), F = { id: 'f', isValid: true };
  M.url(F, 0, 'http://h/1.png'); M.tick(1); M.tick(2); M.tick(3); M.f1(F, true, { flag: false });
  const during = { text: M.text(F).slice(0, 6), f1: M.state(F).f1 };
  M.tick(4); M.tick(6); M.f1(F, false); M.url(F, 0, ''); for (let t2 = 7; t2 <= 12; t2++) M.tick(t2);
  ok(JSON.stringify(sent) === JSON.stringify(['Tf:0a14', 'Df', 'Hf:', 'Pf:zz:f1=1', 'Tf:0a14', 'Df', 'Rf:hotbar', 'Pf:zz:f1=0', 'Tf:0a14', 'Ef', 'Df']) && during.text === '~gu~0a' && during.f1 === true,
    'channel: io.times puts the game\'s title durations back 2 ticks after each channel title (the empty one too), once; F1 with flag false hides the HUD by the API and the arm by the property but leaves the title\'s F1 flag off', JSON.stringify({ sent, during }));
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
  ok(hud.hud_content.modifications[0].value[0]['ff_vp@hud.ff_vp'] && !(hud.root_panel.modifications || []).some((m) => m.array_name === 'controls' || JSON.stringify(m.value || '').includes('ff_vp'))
    && rp.some((b) => b.binding_name === '#hud_visible' && b.binding_type === 'global' && !b.binding_name_override)
    && rp.some((b) => b.binding_name === '#hud_alpha' && b.binding_name_override === '#alpha') && rp.some((b) => b.binding_name === '#hud_propagate_alpha' && b.binding_name_override === '#propagateAlpha')
    && vis.source_property_name === "(#hud_visible and (not (('%.5s' * #hud_title_text_string) = '~gu~1')))" && jsonui(vis.source_property_name, { '#hud_visible': true, '#hud_title_text_string': '~gu~1a' }) === false && jsonui(vis.source_property_name, { '#hud_visible': true, '#hud_title_text_string': '~gu~0b' }) === true,
  'F1 HUD: the viewport in hud_content (root_panel\'s box); root_panel keeps its own bindings and is hidden while the channel says F1', JSON.stringify(rp));
  {
    // (the game's own title hidden while it is the channel's: by default (5 本目) hud_title_text untouched and root_panel's
    //  hud_title_text_area put back with the same factory and a #visible binding; 'text' the 2〜4 本目 way; 'none' the control)
    const mods = hud.root_panel.modifications || [], ins = mods.find((m) => m.operation === 'insert_after'), area = ins && ins.value[0].ff_title_area;
    const avis = area && area.bindings.find((b) => b.target_property_name === '#visible').source_property_name;
    ok(!hud.hud_title_text && ins && ins.control_name === 'hud_title_text_area' && mods.some((m) => m.operation === 'remove' && m.control_name === 'hud_title_text_area')
      && mods.indexOf(ins) < mods.findIndex((m) => m.operation === 'remove')
      && area.factory.name === 'hud_title_text_factory' && area.factory.control_ids.hud_title_text === 'hud_title_text@hud.hud_title_text'
      && area.bindings[0].binding_name === '#hud_title_text_string' && area.bindings[0].binding_type === 'global'
      && avis === "(not (('%.4s' * #hud_title_text_string) = '~gu~'))" && jsonui(avis, { '#hud_title_text_string': '~gu~0a' }) === false && jsonui(avis, { '#hud_title_text_string': 'HELLO' }) === true
      && jsonui(avis, { '#hud_title_text_string': '' }) === true && rp.length === 5,
    'F1 HUD: the game\'s own title hidden while it is the channel\'s — hud_title_text untouched, its area in root_panel put back with the same factory and a #visible binding (root_panel\'s F1 bindings kept)', JSON.stringify(mods));
    const old = L.hudScreen(Object.assign({}, scene, { titleHide: 'text' })), none = L.hudScreen(Object.assign({}, scene, { titleHide: 'none' }));
    const noMods = (h) => !(h.root_panel.modifications || []).some((m) => m.control_name === 'hud_title_text_area');
    ok(old.hud_title_text.bindings[1].source_property_name === "(not (('%.4s' * #hud_title_text_string) = '~gu~'))" && noMods(old) && !none.hud_title_text && noMods(none)
      && (() => { try { L.hudScreen(Object.assign({}, scene, { titleHide: 'x' })); return false; } catch { return true; } })(),
    'F1 HUD: titleHide text (2〜4 本目: bindings on hud_title_text) and none (the control: the title left alone); anything else refused');
    const noF1 = L.hudScreen({ ns: 'nf', groups: [{ id: 'm' }], urlImages: [{ id: 'p', group: 'm', rect: { x: 0, y: 0, w: 1, h: 1 } }] }), nm = noF1.root_panel.modifications;
    ok(nm.length === 3 && nm[0].operation === 'insert_front' && nm[1].operation === 'insert_after' && nm[2].operation === 'remove' && !noF1.root_panel.bindings,
      'URL images without F1: the viewport first in root_panel, then the title area put back; root_panel\'s own bindings untouched', JSON.stringify(nm));
  }
  const plain = L.hudScreen({ ns: 'pp', groups: [{ id: 'm' }] });
  ok(plain.root_panel.modifications && !plain.hud_content && !plain.hud_title_text, 'without F1 or URL images: the viewport stays in root_panel, nothing of the game\'s HUD changed');
  const pk = P.build(Object.assign({}, scene, { textures: [{ id: 't', width: 4, height: 4, png: Buffer.alloc(0) }], bones: [{ name: 'ff_b', group: 'm' }], planes: [], hideLocalPlayer: 'v.ff_h > 0',
    modules: [{ module_name: '@minecraft/server-net', version: '1.0.0-beta' }], script: '// s' }), { core });
  const ce = JSON.parse(pk.files['rp/entity/player.entity.json'])['minecraft:client_entity'].description, an = JSON.parse(pk.files['rp/animations/ff.animation.json']).animations['animation.ff.f1'];
  const rcs = Object.fromEntries(ce.render_controllers.map((x) => Object.entries(x)[0]));
  ok(JSON.stringify(an.bones) === JSON.stringify({ rightarm: { position: [0, -100, 0], scale: 0 }, leftarm: { position: [0, -100, 0], scale: 0 }, rightitem: { scale: 0 }, leftitem: { scale: 0 } }) && ce.animations.ff_f1 === 'animation.ff.f1'
    && ce.scripts.animate.some((x) => x.ff_f1 === 'v.ff_f1 > 0 && (variable.is_first_person || (q.is_local_player && !q.is_in_ui))') && ce.scripts.pre_animation.includes("v.ff_f1 = variable.is_paperdoll ? 0 : q.property('ff:f1');"),
  'F1 player: the arms moved 100 units down (a first-person held item follows its arm\'s position, not its scale: R10.13) and the arms and held items at scale 0, in first person and for the local player in the world (not in a UI), the property read where the paper doll is guarded');
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
  ok(JSON.stringify(RT.frameOf(CFG, 'b', 720)) === '{"w":1280,"h":720,"barH":72}' && JSON.stringify(RT.frameOf(CFG, 'g', 1080)) === '{"w":2400,"h":1080,"barH":108}' && JSON.stringify(RT.frameOf(CFG, 'g')) === '{"w":2400,"h":1080,"barH":108}'
    && RT.layoutFor(CFG, '20:9') === 'g' && RT.layoutFor(CFG, '2400x1080') === 'g' && RT.layoutFor(CFG, '1024x768') === 'c' && RT.layoutFor(CFG, '2556x1179') === 'f' && RT.layoutFor(CFG, 'x') === null,
  'browser: the frame for a layout and a height (20:9 at 1080 = 2400 x 1080: the real resolution by default), the nearest layout for a screen');
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
  const ch = GS.channel.create({ ns: 'gweb', slots: CFG.slotCount, width: 160, refreshTicks: 0 }, chIo), B = RT.createBrowsers(CFG, io, GS, ch);
  const flush = () => new Promise((r) => setTimeout(r, 5));
  const slots = () => GS.channel.read({ slots: CFG.slotCount, width: 160 }, titles[titles.length - 1]);
  await B.open(P, 'http://127.0.0.1:8787/demo/color.html');
  await flush();
  B.tick();
  let r = slots();
  ok(B.isOpen(P) && !r.f1 && r.layout === 'g' && r.urls[0] === 'http://h/s/S1/f/1.png' && r.urls[1] === 'http://h/s/S1/b/1.png' && !r.urls[2] && logs.includes('hide except TouchControls') && props['gweb:f1'] === 1 && props['gweb:flg'] === 1,
    'browser: opening on a phone (touch): F1 by the API and the property, its touch controls kept (no F1 flag in the title: the pad is in root_panel, R10.12), layout 20:9, the page and the toolbar on top, the pointer shown', JSON.stringify(r));
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
  const box = B.command(P, 'size', ['box', '2400x1080']), boxLay = B.state(P).layout, sz = B.command(P, 'size', ['2400x1080']), needs = B.command(P, 't', ['x']), bad = B.command(P, 'size', ['huge']);
  ok(box === '' && boxLay === 'g' && sz === '' && Math.abs(B.state(P).asp - 2400 / 1080) < 1e-9 && B.state(P).res === 1080 && needs.includes('/web:open') && bad.includes('/web:size'),
    'browser: /web:size box <shape> is the nearest box; /web:size <W>x<H> is the screen\'s own shape (exact) and the height; a command that needs the browser says so; a shape it cannot read is refused', JSON.stringify({ box, boxLay, sz, asp: B.state(P).asp, needs, bad }));
}

// ---- every aspect ratio exactly: the page by JSON UI's own %, the pointer across by the shape; the shape measured by the game
//      (the aspect probe), typed (/web:size), or marked (/web:fit)
{
  const GS = globalThis.GeoUIScreen, RT = require('../bds/geoui/web/runtime.js'), M = await import('../bds/geoui/web/make.mjs');
  const CFG = M.config(), sc = M.scene(), hud = L.hudScreen(sc, { followHud: true }), ch = L.channelOf(sc), top = Object.fromEntries(hud.gweb_vp.controls.map((c) => Object.entries(c)[0]));
  const T = '#hud_title_text_string', visOf = (ctl, t) => jsonui(ctl.bindings.find((b) => b.target_property_name === '#visible').source_property_name, { [T]: t, '#hud_visible': true });
  const optOf = (ctl, t) => jsonui(ctl.bindings.find((b) => b.target_property_name === '#profile_image_options').source_property_name, { [T]: t });
  const fz = top.gweb_fill_z, inz = Object.fromEntries((fz ? fz.controls : []).map((c) => Object.entries(c)[0]));
  const page = inz.gweb_fill_z_page, bar = inz.gweb_fill_z_bar, tz = L.channelText(ch, { layout: 'z', urls: ['http://h/f.png', 'http://h/b.png'] }), tb = L.channelText(ch, { layout: 'b', urls: ['http://h/f.png', 'http://h/b.png'] });
  const exprOf = (ctl) => ctl.bindings.find((b) => b.target_property_name === '#visible').source_property_name;
  ok(fz && fz.size.join() === '100%,100%' && visOf(fz, tz) && !visOf(fz, tb) && page && bar && page.size.join() === '100%,90%' && page.anchor_from === 'bottom_middle' && page.anchor_to === 'bottom_middle' && !page.offset && bar.size.join() === '100%,10%' && bar.anchor_from === 'top_middle'
    && visOf(page, tz) && !visOf(page, L.channelText(ch, { layout: 'z' })) && optOf(page, tz) === '{"type":7,"url":"http://h/f.png"}' && inz.gweb_fill_z_pu.layer === -1
    && exprOf(page).length < 200 && !/ or /.test(exprOf(page)),
  'exact: the page (bottom 90 %) and the toolbar (top 10 %) laid out by JSON UI\'s own % of the viewport — no offset, every shape — in a panel shown only in the exact layout; each image\'s own expression short (no `or`: R10.19)', exprOf(page || { bindings: [{ target_property_name: '#visible', source_property_name: '' }] }));
  const ap = top.gweb_aspect, setC = ap.controls[0].gweb_aspc, setU = ap.controls[1].gweb_aspu, n = CFG.aspects.length;
  const probe = (set, tag, k) => set.controls.find((c) => c[`gweb_asp${tag}${k}`])[`gweb_asp${tag}${k}`], img = (set, tag, k) => probe(set, tag, k).controls[0][`gweb_asp${tag}${k}_i`];
  const orderOf = (set, tag) => set.controls.map((c) => Number(Object.keys(c)[0].slice(`gweb_asp${tag}`.length)));
  const tp = L.channelText(ch, { layout: 'g', urls: ['', '', '', '', 'http://h/asp/N1'] });
  ok(n === 160 && setC.clips_children === true && setU.clips_children === false && setC.controls.length === n && setU.controls.length === n
    && probe(setC, 'c', 0).size[0] === `${Math.round(CFG.aspects[0] * 100 * 1e6) / 1e6}%y` && probe(setC, 'c', n - 1).size.join() === `${Math.round(CFG.aspects[n - 1] * 100 * 1e6) / 1e6}%y,100%` && img(setC, 'c', 7).anchor_from === 'right_middle' && img(setC, 'c', 7).size.join() === '2,2'
    && optOf(img(setC, 'c', 7), tp) === '{"type":7,"url":"http://h/asp/N1/c7.png"}' && optOf(img(setU, 'u', 159), tp) === '{"type":7,"url":"http://h/asp/N1/u159.png"}'
    && visOf(ap, tp) && !visOf(ap, tz) && !visOf(ap, L.channelText(ch, { layout: 'g', urls: ['', '', '', '', 'fit'] }))
    && orderOf(setC, 'c').slice().sort((x, y) => x - y).every((k, i) => k === i) && orderOf(setC, 'c').filter((k, i) => k === i).length < 10 && orderOf(setC, 'c').join() === orderOf(setU, 'u').join(),
  'exact: the aspect probe — 160 tiny URL images each at the right edge of a box a_k x the height (one set clipped to the viewport, one not), URL base/<c|u><k>.png, shown while the slot has an http base; listed in a fixed shuffled order (a game fetching them as listed cannot fake a run from 0)');
  const em = top.gweb_fit, tf = L.channelText(ch, { layout: 'z', urls: ['', '', '', '', 'fit'] });
  ok(em && visOf(em, tf) && !visOf(em, tp) && !visOf(em, tz) && em.controls[0].gweb_fit_l.anchor_from === 'left_middle' && em.controls[1].gweb_fit_r.anchor_from === 'right_middle' && em.controls[1].gweb_fit_r.texture === 'textures/gweb/atlas',
    'exact: the edge marks (left and right of the viewport) shown while the slot says fit');
  const as = CFG.aspects, mid = (k) => Math.sqrt(as[k] * as[k + 1]), upto = (k) => Array.from({ length: k + 1 }, (_, i) => i);
  ok(Math.abs(RT.aspectFromProbes(as, upto(80)) - mid(80)) < 1e-12 && RT.aspectFromProbes(as, upto(159)) === null && RT.aspectFromProbes(as, []) === null && RT.aspectFromProbes(as, [0, 1, 3]) === null
    && as.every((a, i) => !i || (a / as[i - 1] - 1 < 0.0125)) && as[0] <= 0.56 && as[n - 1] >= 3.99,
  'exact: the shape from the probes — between the widest fetched and the next (to ±0.62 %); none when all, none or not a run from 0 were fetched');
  // the engine: no shape known → measured on opening; the browser exact afterwards; /web:size; /web:fit
  const titles = [], props = {}, acts = [], says = [], logs = [], saved = {};
  let fetched = null;
  const stateJ = (w = 2400, h = 1080) => ({ ok: true, sid: 'S1', frame: 1, bar: 1, w, h, barH: Math.round(h * 0.1), url: 'http://x/', title: 'T', tabs: 1, tab: 0, focus: 'page', frameUrl: 'http://10.0.2.2:8787/s/S1/f/1.png', barUrl: 'http://10.0.2.2:8787/s/S1/b/1.png' });
  const http = async (method, p, body) => {
    if (method === 'POST' && p === '/s') return { status: 200, json: stateJ() };
    if (method === 'POST' && p === '/s/S1') { acts.push(body); return { status: 200, json: stateJ(body.w, body.h) }; }
    if (p.startsWith('/s/S1/next')) return new Promise(() => {});
    if (method === 'GET' && p.startsWith('/asp/')) { logs.push(`asked ${p}`); return { status: 200, json: fetched }; }
    return { status: 404, json: null };
  };
  const P = { id: 'p2', name: 'B', isValid: true };
  const smp = { rot: { x: 0, y: 0 }, move: { x: 0, y: 0 }, jump: false, sneak: false, slot: 0, mode: 'Gamepad', swings: 0, uses: 0 };
  const io = { players: () => [P], sample: () => Object.assign({}, smp), setProp: (p, k, v) => { props[k] = v; }, freeze: () => {}, setRotation: () => {},
    say: (p, t) => says.push(t), log: (l) => logs.push(l), http, touch: () => false, platform: () => 'Desktop', load: (p, k) => saved[k], save: (p, k, v) => { saved[k] = v; }, wait: () => Promise.resolve() };
  const chIo = { title: (p, t) => titles.push(t), prop: (p, k, v) => { props[k] = v; }, hideHud: () => [], restoreHud: () => {} };
  const chn = GS.channel.create({ ns: 'gweb', slots: CFG.slotCount, width: 160, refreshTicks: 0 }, chIo), B = RT.createBrowsers(CFG, io, GS, chn);
  const flush = () => new Promise((r) => setTimeout(r, 5)), last = () => GS.channel.read({ slots: CFG.slotCount, width: 160 }, titles[titles.length - 1]);
  await B.open(P, 'http://x/'); await flush(); B.tick();
  const r0 = last(), nonce = (/\/asp\/([\w-]+)$/.exec(r0.urls[4] || '') || [])[1];
  ok(r0.layout === 'b' && nonce && r0.urls[4] === `http://10.0.2.2:8787/asp/${nonce}`, 'exact: no shape known — the box of the device (16:9) and the aspect probe shown at once, its base where the game fetches the frames', JSON.stringify(r0));
  fetched = { c: upto(98), u: upto(101) };
  for (let i = 0; i < CFG.detectTicks + 2; i++) B.tick();
  await flush(); B.tick();
  const r1 = last(), st = B.state(P), want = mid(98), resize = acts.filter((a) => a.op === 'resize').pop();
  ok(logs.includes(`asked /asp/${nonce}`) && Math.abs(st.asp - want) < 1e-9 && st.layout === 'z' && r1.layout === 'z' && !r1.urls[4] && saved['gweb:asp'] === st.asp && props['gweb:asp'] === Math.round(want * 1000)
    && resize && resize.h === 1080 && Math.abs(resize.w - Math.round(1080 * want / 2) * 2) <= 0,
  'exact: detectTicks later the service is asked; the clipped set gives the shape (between the widest fetched and the next), kept; the browser exact (the frame that shape at 1080), the probe gone, the pointer put across by it', JSON.stringify({ asp: st.asp, want, resize, slot: r1.urls[4] }));
  // the pointer at the right edge of the exact box: its share 1 → drawn at asp x Bh / 2 (the Molang of the bones)
  B.command(P, 'pointer', ['1', '0.5']);
  const ptr = props['gweb:ptr'], px = (ptr % 4096) / 4095, drawn = (px - 0.5) * props['gweb:asp'] * (CFG.layouts.z.Bh / 1000);
  ok(Math.abs(drawn - want * CFG.layouts.z.Bh / 2) < 0.2, 'exact: the pointer at the share 1 is drawn at the screen\'s edge (asp x Bh / 2 units: the edge of a screen that shape)', JSON.stringify({ drawn, edge: want * CFG.layouts.z.Bh / 2 }));
  // /web:fit: the edges marked, the pointer's tip on the right edge of a 2.4 screen, a click → the shape 2.4
  const why = B.command(P, 'fit', []);
  const r2 = last();
  B.state(P).ctl.pointerTo(2.4 * CFG.layouts.z.Bh / 2, 0);
  smp.swings = 1; B.tick(); smp.swings = 0; await flush(); B.tick();
  const r3 = last();
  ok(why === '' && r2.urls[4] === 'fit' && Math.abs(B.state(P).asp - 2.4) < 1e-6 && !B.state(P).fitting && !r3.urls[4] && saved['gweb:asp'] === B.state(P).asp,
    'exact: /web:fit marks the edges (the slot says fit); the pointer\'s tip on the right edge and a click → the shape (2.4), kept, the marks gone', JSON.stringify({ why, asp: B.state(P).asp, slot: r3.urls[4] }));
  // a shape kept: the next opening is exact at once (no probe)
  B.close(P); titles.length = 0;
  await B.open(P, 'http://x/'); await flush(); B.tick();
  const r4 = last();
  ok(r4.layout === 'z' && !r4.urls[4], 'exact: a shape kept — the next browser is exact at once, nothing measured again', JSON.stringify(r4));
  // the probes that say nothing (the game fetched them all): the box stays, the player told how to set it
  saved['gweb:asp'] = undefined; B.close(P); says.length = 0;
  const P3 = P; B.state(P3).asp = null;
  await B.open(P3, 'http://x/'); await flush(); B.tick();
  fetched = { c: upto(159), u: upto(159) };
  for (let i = 0; i < CFG.detectTicks + 2; i++) B.tick();
  await flush(); B.tick();
  ok(B.state(P3).layout === 'b' && !B.state(P3).asp && says.some((t) => t.includes('/web:fit')), 'exact: probes that say nothing (every one fetched) — the box stays and the player is told /web:fit or /web:size', JSON.stringify({ lay: B.state(P3).layout, says }));
}

// ---- the game's WebSocket (/connect): a fake game over TCP (the frames, the encryption handshake and stream, commands answered by
//      the REAL wsLink of the pack's WebSocket build) — the service's requests made through it, a chat line typed
{
  const net = await import('node:net'), crypto = await import('node:crypto');
  const W = await import('../bds/geoui/web/mcws.mjs'), { startServer } = await import('../bds/geoui/web/server.mjs'), RT = require('../bds/geoui/web/runtime.js');
  async function fakeGame(port, { encrypt, link, player, chatLines = [] }) {
    const sock = net.connect(port, '127.0.0.1');
    await new Promise((r) => sock.once('connect', r));
    const key = crypto.randomBytes(16).toString('base64');
    sock.write(`GET / HTTP/1.1\r\nHost: 10.0.2.2:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n${encrypt ? `Sec-WebSocket-Protocol: ${W.SUBPROTOCOL}\r\n` : ''}\r\n`);
    const st = { head: '', open: false, accept: '', proto: '', cipher: null, cmds: [], subs: [], pumps: 0 };
    const reader = W.frameReader();
    const send = (obj) => { const b = Buffer.from(JSON.stringify(obj)); sock.write(W.encodeFrame(1, st.cipher ? st.cipher.enc.update(b) : b, true)); };
    const answer = (id, body) => send({ header: { version: 1, requestId: id, messagePurpose: 'commandResponse' }, body });
    const onMsg = (buf) => {
      const j = JSON.parse((st.cipher ? st.cipher.dec.update(buf) : buf).toString('utf8')), h = j.header;
      if (h.messagePurpose === 'subscribe') { st.subs.push(j.body.eventName); if (chatLines.length) setTimeout(() => { for (const m of chatLines) send({ header: { version: 1, requestId: crypto.randomUUID(), messagePurpose: 'event', eventName: 'PlayerMessage' }, body: { message: m, sender: player.name, type: 'chat' } }); }, 30); return; }
      const line = j.body.commandLine; st.cmds.push(line.slice(0, 40));
      let mm;
      if ((mm = /^enableencryption "([^"]+)" "([^"]+)"$/.exec(line))) {
        const kp = W.newKeyPair(), salt = Buffer.from(mm[2], 'base64');
        answer(h.requestId, { statusCode: 0, publicKey: kp.der.toString('base64') });
        st.cipher = W.cipherPair(W.sessionKey(kp.privateKey, mm[1], salt));
        return;
      }
      if ((mm = /^web:pump "([^"]*)"$/.exec(line))) { st.pumps++; const out = link.pump(player, mm[1]); answer(h.requestId, out ? { statusCode: 0, statusMessage: out } : { statusCode: 0 }); return; }
      answer(h.requestId, { statusCode: -2147483648, statusMessage: 'unknown' });
    };
    sock.on('data', (c) => {
      if (!st.open) {
        st.head += c.toString('latin1');
        const i = st.head.indexOf('\r\n\r\n'); if (i < 0) return;
        st.accept = (/Sec-WebSocket-Accept: (\S+)/i.exec(st.head) || [])[1]; st.proto = (/Sec-WebSocket-Protocol: (\S+)/i.exec(st.head) || [])[1] || '';
        st.open = true; const rest = Buffer.from(st.head.slice(i + 4), 'latin1'); if (!rest.length) return; c = rest;
      }
      for (const f of reader.push(c)) if (f.opcode === 1 || f.opcode === 2) onMsg(f.payload);
    });
    st.close = () => sock.destroy(); st.key = key;
    return st;
  }
  const svc = await startServer({ port: 0, pumpMs: 30, pumpMax: 60, log: () => {} });
  try {
    for (const encrypt of [true, false]) {
      let tick = 0;
      const chatsSeen = [], logs = [];
      const link = RT.wsLink({ tick: () => tick, log: (l) => logs.push(l), run: (fn) => fn(), chat: (p, t) => chatsSeen.push(t) });
      const P = { id: `p${encrypt}`, name: encrypt ? 'Alex' : 'Steve' };
      const game = await fakeGame(svc.port, { encrypt, link, player: P, chatLines: ['!hello world', 'just talking', '!!'] });
      const iv = setInterval(() => { tick++; }, 5);
      for (let i = 0; i < 100 && !link.linked(P.id); i++) await new Promise((r) => setTimeout(r, 10));
      const t0 = Date.now(), r = await link.call('GET', '/info', undefined, P), rtt = Date.now() - t0;
      const asp = await link.call('GET', '/asp/none', undefined, P);
      await new Promise((rr) => setTimeout(rr, 120));
      const info = await (await fetch(`${svc.url}/info`)).json();
      clearInterval(iv);
      const me = (info.ws || []).find((l) => l.player === P.name);
      ok(game.accept === W.acceptKey(game.key) && game.proto === (encrypt ? W.SUBPROTOCOL : '') && (encrypt ? game.cmds[0].startsWith('enableencryption') : !game.cmds.some((c) => c.startsWith('enableencryption')))
        && game.subs.includes('PlayerMessage') && link.linked(P.id) && link.base(P.id) === `http://10.0.2.2:${svc.port}` && logs.some((l) => l.startsWith('ws linked'))
        && r.status === 200 && r.json && r.json.ok && r.json.public === `http://10.0.2.2:${svc.port}` && asp.status === 200 && Array.isArray(asp.json.c)
        && me && me.encrypt === encrypt && me.requests >= 2 && game.pumps >= 3 && chatsSeen.join('|') === 'hello world|\n',
      `WebSocket (${encrypt ? 'encrypted: enableencryption, then AES-256-CFB8 each way' : 'plain'}): the upgrade (accept key${encrypt ? ', the subprotocol' : ''}), PlayerMessage subscribed, /web:pump as the player — the script's requests made by the service (its pictures' address the one the game used: 10.0.2.2), answered in a later pump (split in parts when long), chat lines with ! typed (!! = Enter)`,
      JSON.stringify({ accept: game.accept === W.acceptKey(game.key), proto: game.proto, cmds: game.cmds.slice(0, 3), subs: game.subs, linked: link.linked(P.id), base: link.base(P.id), status: r.status, pub: r.json && r.json.public, me, pumps: game.pumps, chatsSeen, rtt }));
      game.close();
    }
    // a request with no link is refused at once (the player told how to connect); one never answered is given up
    let tick = 0;
    const link = RT.wsLink({ tick: () => tick, log: () => {}, run: (fn) => fn(), chat: () => {} });
    const noLink = await link.call('GET', '/info', undefined, { id: 'x', name: 'X' }).then(() => 'answered', (e) => String(e.message));
    link.pump({ id: 'y', name: 'Y' }, '');
    const lost = link.call('GET', '/info', undefined, { id: 'y', name: 'Y' }).then(() => 'answered', (e) => String(e.message));
    tick = 1000; link.sweep();
    ok(noLink.includes('/connect') && (await lost).includes('no answer'), 'WebSocket: no link — refused at once with how to connect; a request never answered is given up (the caller sees an error)', JSON.stringify({ noLink, lost: await lost }));
    const parts = W.pumpLines('web', { r: [[1, 200, { a: 'x'.repeat(300) }]] }, 7, 100);
    ok(parts.length > 3 && parts.every((l) => /^web:pump "7:\d+\/\d+:[\w-]+"$/.test(l)) && W.pumpLines('web', { h: { base: 'http://x' } }, 1)[0].startsWith('web:pump "'),
      'WebSocket: pump data longer than the limit goes in parts (seq:i/n:part), each a command line with no space, quote or slash in its data');
  } finally { await svc.close(); }
}

// ---- the backdrop of many layouts: one short sum (8 本目・9 本目: an `or` of 16 comparisons never showed in the game — R10.19)
{
  const scene = { ns: 'bk', scale: { mode: 'height', s: 0.1 }, groups: 'bcdefghi'.split('').map((L) => ({ id: `l_${L}`, layout: L })), urlImages: [{ id: 'p', group: 'l_b', rect: { x: 0, y: 0, w: 1, h: 1 } }], f1: true, backdrop: { layouts: 'bcdefghi' } };
  const hud = L.hudScreen(scene), ch = L.channelOf(scene), bd = hud.bk_vp.controls[0].bk_backdrop, expr = bd.bindings.find((b) => b.target_property_name === '#visible').source_property_name;
  const v = (t) => jsonui(expr, { '#hud_title_text_string': t });
  ok('bcdefghi'.split('').every((Lt) => v(L.channelText(ch, { layout: Lt })) && v(L.channelText(ch, { layout: Lt, f1: true }))) && !v(L.channelText(ch, {})) && !v(L.channelText(ch, { f1: true })) && !v('Hello') && !v('') && expr.length < 200 && (expr.match(/ or /g) || []).length === 0,
    'backdrop of 8 layouts: shown for each of b–i (F1 or not), not for a, a plain title or none — one short sum, no `or`', expr);
}

// ---- F1's camera: cfg.camera set on F1, cleared off and on reset; { camera: false } leaves it out (the browser: RULES R10.18)
{
  const calls = [], io = { title() {}, prop() {}, hideHud: () => [], restoreHud() {}, camera: (p, id) => calls.push(`${p.id}:${id}`) };
  const ch = C.create({ ns: 'cc', slots: 0, width: 16, refreshTicks: 0, camera: 'cc:eye' }, io), A = { id: 'A' }, B = { id: 'B' };
  ch.f1(A, true); ch.f1(A, false); ch.f1(B, true, { camera: false }); ch.f1(B, false); ch.f1(A, true); ch.reset(A);
  const none = []; C.create({ ns: 'cc', slots: 0, width: 16, refreshTicks: 0 }, Object.assign({}, io, { camera: (p, id) => none.push(id) })).f1(A, true);
  ok(calls.join() === 'A:cc:eye,A:null,B:null,A:cc:eye,A:null' && none.length === 0,
    'F1 camera: set on F1, cleared off and on reset; an F1 with camera false does not set it; no cfg.camera, no camera', calls.join());
  const pk = P.build({ ns: 'cc', scale: { mode: 'height', s: 0.1 }, groups: [{ id: 'm', anchor: 'center' }], f1: true, textures: [{ id: 't', width: 4, height: 4, png: Buffer.alloc(0) }], bones: [{ name: 'cc_b', group: 'm' }], planes: [] }, { core });
  const cam = JSON.parse(pk.files['bp/cameras/presets/cc_eye.json'])['minecraft:camera_preset'];
  const off = P.build({ ns: 'cc', scale: { mode: 'height', s: 0.1 }, groups: [{ id: 'm', anchor: 'center' }], f1: true, f1Camera: false, textures: [{ id: 't', width: 4, height: 4, png: Buffer.alloc(0) }], bones: [{ name: 'cc_b', group: 'm' }], planes: [] }, { core });
  ok(cam.identifier === 'cc:eye' && cam.inherit_from === 'minecraft:follow_orbit' && cam.radius === 0.1 && cam.entity_offset.join() === '0,1.62,0' && cam.view_offset.join() === '0,0' && !('extend_player_rendering' in cam)
    && !off.files['bp/cameras/presets/cc_eye.json'],
  'F1 camera: the pack makes <ns>:eye (follow_orbit at the eyes, radius 0.1, no extend_player_rendering); f1Camera false leaves it out');
}

// ---- every screen before its shape is known: 24 boxes (b–y) and the exact layout (z); any landscape screen 1:1–32:9 gets a box of
//      its shape within 4.9 % a side (the rest the backdrop); the page lands where the formula says on each
{
  const M = await import('../bds/geoui/web/make.mjs'), RT = require('../bds/geoui/web/runtime.js'), CFG = M.config();
  const ks = Object.keys(CFG.layouts), boxes = ks.filter((k) => !CFG.layouts[k].fill), as = boxes.map((k) => CFG.layouts[k].aspect).sort((a, b) => a - b).filter((a) => a >= 1);
  const gap = Math.max(...as.slice(1).map((a, i) => a / as[i] - 1));
  let worst = 0, worstAt = '';
  for (let r = 1; r <= 32 / 9 + 1e-9; r *= 1.003) {
    const H = 1080, W = Math.round(H * r), k = RT.layoutFor(CFG, `${W}x${H}`), e = M.expected(W, H, k);
    const lost = 1 - Math.min((e.page.x1 - e.page.x0) / W, (e.page.y1 - e.toolbar.y0) / H); if (lost > worst) { worst = lost; worstAt = `${W}x${H} ${k}`; }
  }
  ok(ks.length === 25 && boxes.join('') === 'bcdefghijklmnopqrstuvwxy' && CFG.layouts.z.fill && CFG.fill === 'z' && gap < 0.108 && worst < 0.049,
    'every screen: 24 boxes (b–y) and the exact layout z; landscape boxes at most 10.7 % apart, any screen 1:1–32:9 loses at most 4.9 % of one side to the backdrop until its shape is known', JSON.stringify({ gap, worst, worstAt }));
  const named = { '2340x1080': 'f', '2388x1668': 'p', '2208x1840': 'q', '1280x1024': 'k', '3440x1440': 'o', '1440x1440': 'j', '2560x1600': 'd', '2732x2048': 'c', '1179x2556': 'n' };
  ok(Object.entries(named).every(([s2, k]) => RT.layoutFor(CFG, s2) === k), 'every screen: common resolutions pick their own shape (19.5:9, iPad Pro, folds, 5:4, ultrawide, 1:1, 16:10, iPad, a phone held upright)',
    JSON.stringify(Object.keys(named).map((s2) => [s2, RT.layoutFor(CFG, s2)])));
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
