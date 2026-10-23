#!/usr/bin/env node
// GeoUI Screen (bds/geoui/screen/: SPEC.md's formulas, the packs, spatial navigation, the form-less input), no network, no game:
//   layout   every group's point on the screen by layout.js, and again by laying out the JSON UI it writes (a small JSON UI layout
//            of its own here: size with % / %x / %y and max_size, anchors, offsets) and the measured renderer — the two agree on
//            13 screens from 4:3 to 32:9, for the height, width, gui and contain scales and all 9 anchors
//   pack     what pack.js builds: files, materials, no two faces on one plane (the lab's own model check), the paper doll guarded
//   nav      four ways, any angle, ties by where the player looks, a container first, the hints, the hit test
//   input    the head's turns as a mouse (no dead zone at the edge, the turn-back read in two frames), keys and their repeat,
//            jump / sneak as press, click and back, the hotbar as the wheel (round the end the short way)
//   device   bds/addons/geoui_device is what device.mjs makes; `measure marks` (app/lib/measure.mjs) reads its marks back from a
//            made-up screenshot to the px
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = require('../bds/geoui/geoui_builder.js');
const L = require('../bds/geoui/screen/layout.js'), P = require('../bds/geoui/screen/pack.js'), N = require('../bds/geoui/screen/nav.js'), I = require('../bds/geoui/screen/input.js');
const { lintGeo } = await import('../common/model.mjs');
const { KINDS, markClass } = await import('../app/lib/measure.mjs');
const D = await import('../bds/geoui/screen/device.mjs');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${String(d).split('\n').slice(0, 12).join('\n  ')}`}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- a JSON UI layout of the subset layout.hudScreen writes (independent of layout.js's own sums)
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
/** a control's rect from its parent's rect (x, y, w, h) — size (with %x / %y of its own other side), max_size, anchors, offset */
function place(ctl, parent, vars = {}) {
  let size = ctl.size || ['100%', '100%'];
  if (typeof size === 'string' && size.startsWith('$')) size = vars[size] || ctl[`${size}|default`];
  let w = null, h = null;
  const own = { w: () => { if (w === null) w = lenOf(size[0], parent.w, own); return w; }, h: () => { if (h === null) h = lenOf(size[1], parent.h, own); return h; } };
  // (a side given by the other is worked out after it)
  if (/%y$/.test(String(size[0]))) { own.h(); own.w(); } else { own.w(); own.h(); }
  if (ctl.max_size) { w = Math.min(w, lenOf(ctl.max_size[0], parent.w, own)); h = Math.min(h, lenOf(ctl.max_size[1], parent.h, own)); }
  const af = AP[ctl.anchor_from || 'center'], at = AP[ctl.anchor_to || 'center'], off = ctl.offset || [0, 0];
  const ox = lenOf(off[0], parent.w, { w: () => w, h: () => h }), oy = lenOf(off[1], parent.h, { w: () => w, h: () => h });
  return { x: parent.x + af[0] * parent.w - at[0] * w + ox, y: parent.y + af[1] * parent.h - at[1] * h + oy, w, h };
}
/** every live_player_renderer's rect in a hud_screen.json on a W x H root panel (compress: the game's $compress_hud_width) */
function renderers(hud, ns, W, H, compress = false) {
  const vp0 = hud[`${ns}_vp`], vars = compress ? { [`$${ns}_vp_size`]: vp0.variables[0][`$${ns}_vp_size`] } : {};
  const root = { x: 0, y: 0, w: compress ? W * 0.9 : W, h: H }, vp = place(Object.assign({}, vp0, { size: vp0.size }), root, vars);
  if (compress) vp.x = (W - vp.w) / 2;
  const out = {};
  const walk = (ctl, rect) => {
    for (const c of ctl.controls || []) {
      const [name, def] = Object.entries(c)[0], r = place(def, rect);
      if (def.type === 'custom' && def.renderer === 'live_player_renderer') out[name] = r;
      walk(def, r);
    }
  };
  walk(vp0, vp);
  return out;
}
/** a model point on the screen through a renderer's rect, the way the game draws it (measured: K, D) */
const viaRenderer = (r, X, Y, k = L.K, d = L.D) => { const u = k * Math.min(r.w, r.h), cx = r.x + r.w / 2, cy = r.y + r.h / 2; return { x: cx + u * X, y: cy - u * (Y - d) }; };

// ---- layout
{
  ok(near(L.K, 0.05859375) && Math.abs(L.K - L.K_MEASURED) / L.K < 1e-4, 'the renderer\'s unit: 0.9375 / 16 of the panel\'s shorter side, within 0.01 % of what was measured (0.058589)');
  ok(near(1 / (L.K * 0.1), 170.6667, 1e-3), 'height scale 0.1: the viewport is 170.67 units high on every screen wider than tall');
  const scene = { ns: 'tt', scale: { mode: 'height', s: 0.1 }, groups: L.ANCHOR_NAMES.map((a, i) => ({ id: `g${i}`, anchor: a })) };
  scene.groups.push({ id: 'w', anchor: 'top_right', scale: { mode: 'width', s: 0.05 } }, { id: 'u', anchor: 'bottom_middle', scale: { mode: 'gui', px: 1 } });
  for (const a of ['center', 'top_left', 'bottom_right', 'right_middle']) scene.groups.push({ id: `k_${a}`, anchor: a, scale: { mode: 'contain', w: 1280, h: 720, g: 0.25 } });
  const hud = L.hudScreen(scene), groups = L.groupsOf(scene);
  let worst = 0, where = '';
  for (const d of L.DEVICES) {
    for (const compress of [false, true]) {
      const R = renderers(hud, 'tt', d.w, d.h, compress);
      for (const g of groups) {
        const r = R[`tt_r_${g.id}`];
        for (const [x, y] of [[0, 0], [10, -7], [-33, 21.5]]) {
          const want = L.localToScreen(g, x, y, d.w, d.h, 1), got = viaRenderer(r, g.origin[0] + x, g.origin[1] - y);
          // (compressed: the viewport is put back to the whole width, so the same numbers)
          const e = Math.hypot(want.x - got.x, want.y - got.y);
          if (e > worst) { worst = e; where = `${d.id} ${g.id} compress=${compress} want ${JSON.stringify(want)} got ${JSON.stringify(got)}`; }
        }
      }
    }
  }
  // (compressed, the viewport's 111.111111 % is 1 / 0.9 to 6 places: a few 1/100000 px)
  ok(worst < 1e-3, `the JSON UI layout.js writes puts every group's point where layout.js says, on ${L.DEVICES.length} screens x 4 scales x 9 anchors, the HUD compressed or not (worst ${worst.toExponential(1)} px)`, where);
  // (the anchors themselves: a corner group's (0, 0) is the screen's corner)
  const g0 = groups.find((g) => g.anchor === 'bottom_right' && g.scale.mode === 'height');
  ok(['emu', 'iphone', 'uw329', 'tablet43'].every((id) => { const d = L.DEVICES.find((x) => x.id === id), p = L.localToScreen(g0, 0, 0, d.w, d.h); return near(p.x, d.w, 1e-6) && near(p.y, d.h, 1e-6); }), 'a group at bottom_right: its (0, 0) is the screen\'s bottom-right corner on every shape (no aspect ratio known to the server)');
  const k = groups.find((g) => g.id === 'k_center');
  const fit = (W, H) => { const a = L.localToScreen(k, -160, -90, W, H), b = L.localToScreen(k, 160, 90, W, H); return [a.x, a.y, b.x, b.y].map((v) => Math.round(v * 1000) / 1000); };
  ok(JSON.stringify(fit(2400, 1080)) === JSON.stringify([240, 0, 2160, 1080]) && JSON.stringify(fit(1024, 768)) === JSON.stringify([0, 96, 1024, 672]),
    'contain: a 16:9 design box fills the height of a 20:9 screen (bars left and right) and the width of a 4:3 one (bars above and below)', JSON.stringify([fit(2400, 1080), fit(1024, 768)]));
  const u = groups.find((g) => g.id === 'u'), gp = L.rectToScreen(u, { x: -91, y: -22, w: 182, h: 22 }, 1920, 1080, 3);
  ok(near(gp.x1 - gp.x0, 546) && near(gp.y1, 1080), 'gui: 182 x 22 model units are the hotbar\'s 182 x 22 JSON UI px at the game\'s GUI scale (3 px a JSON UI px → 546 px)', JSON.stringify(gp));
  // (the measured constants: if the renderer's unit is the measured 0.058589, not 0.9375 / 16, and its origin is off by its
  //  error, how far a group's point moves — a mark the device check finds this far off is this, farther is a formula wrong)
  let drift = 0, far = 0;
  for (const g of groups.filter((x) => x.scale.mode === 'height')) for (const dd of [L.D - L.D_ERR, L.D + L.D_ERR]) {
    const a = L.localToScreen(g, 0, 0, 1920, 1080), b = L.localToScreen(g, 0, 0, 1920, 1080, 1, L.K_MEASURED, dd);
    drift = Math.max(drift, Math.hypot(b.x - a.x, b.y - a.y)); far = Math.max(far, GROUP_OFF(g));
  }
  ok(drift < 3, `the measured constants' error moves a group (up to ${far} units from the origin) by under 3 px on 1080p (${drift.toFixed(2)} px): the device check's tolerance`);
  ok(hud.root_panel.modifications[0].operation === 'insert_front' && hud.tt_vp.variables[0].requires === '($compress_hud_width)', 'the viewport: in front of the HUD\'s root panel, the whole width again when the game compresses the HUD');
  // (every renderer draws the whole model: each group's content, and the player's body at the origin, must be off the screen
  //  in every other renderer — the gui ones see far: a band of their own)
  const sc2 = { ns: 'gh', scale: { mode: 'height', s: 0.1 }, groups: [...L.ANCHOR_NAMES.map((a, i) => ({ id: `g${i}`, anchor: a })), { id: 'u', anchor: 'bottom_middle', scale: { mode: 'gui', px: 1 } }, { id: 'k', anchor: 'center', scale: { mode: 'contain', w: 1280, h: 720, g: 0.25 } }] };
  const gs2 = L.groupsOf(sc2), boxes2 = Object.fromEntries(gs2.map((g) => [g.id, { x0: -60, y0: -40, x1: 60, y1: 40 }]));
  const ghostOn = (gs) => L.DEVICES.flatMap((d) => [1, 2, 3, 4].flatMap((ui) => L.ghosts(gs, boxes2, d.w, d.h, ui).map((h) => `${d.id}@${ui}:${h.by}←${h.seen}`)));
  const crowded = gs2.map((g) => (g.id === 'u' ? Object.assign({}, g, { origin: [0, 600] }) : g));
  ok(ghostOn(gs2).length === 0 && ghostOn(crowded).length > 0, `no renderer shows another group or the player's body, on ${L.DEVICES.length} screens at GUI scales 1–4 (a gui group put among the others would: ${ghostOn(crowded)[0]})`, ghostOn(gs2).slice(0, 4).join(' '));
  const table = L.deviceTable('height');
  ok(table.every((t) => near(t.unitsH, 170.666667, 1e-3)) && near(table.find((t) => t.id === 'uw329').unitsW, 606.814815, 1e-3), 'the device table: the height scale keeps 170.67 units of height; a 32:9 screen is 606.8 units wide');
}
function GROUP_OFF(g) { return Math.round(Math.hypot(g.origin[0], g.origin[1])); }

// ---- pack
{
  const built = P.build(D.scene(), { core: G });
  const f = built.files, geo = JSON.parse(f['rp/models/entity/gdev/atlas.geo.json'])['minecraft:geometry'][0];
  const lint = lintGeo(geo);
  ok(Array.isArray(lint) ? lint.length === 0 : !lint.length, 'the device pack\'s geometry passes the lab\'s model check (no two faces on one plane)', JSON.stringify(lint).slice(0, 600));
  ok(built.warnings.length === 0, 'the device pack builds with no warning (no group shows in another\'s renderer)', built.warnings.join('\n'));
  const ent = JSON.parse(f['rp/entity/player.entity.json'])['minecraft:client_entity'].description;
  const reads = ent.scripts.pre_animation.filter((l) => /q\.property|query\.property/.test(l));
  ok(reads.length > 0 && reads.every((l) => /variable\.is_paperdoll \?/.test(l)), 'every property the pack reads is guarded: the pause screen\'s paper doll has none (a read there stops the rest)');
  ok(ent.render_controllers[0]['controller.render.gdev_atlas'] === 'q.is_in_ui && !variable.is_paperdoll', 'GeoUI is drawn in the UI only, never on the paper doll');
  const third = ent.render_controllers.find((r) => Object.keys(r)[0] === 'controller.render.player.third_person');
  ok(/q\.is_local_player && !q\.is_in_ui/.test(Object.values(third)[0]), 'the player\'s own body is hidden from its frozen camera only in the world and only for itself');
  const rc = JSON.parse(f['rp/render_controllers/gdev.render_controllers.json']).render_controllers['controller.render.gdev_atlas'];
  ok(rc.uv_anim && rc.uv_anim.scale[0] === 1 && rc.materials.some((m) => m.gdev_col_half === 'material.gdev_blend'), 'render controller: uv_anim given (the materials define USE_UV_ANIM), a blended bone its own material');
  const mats = JSON.parse(f['rp/materials/entity.material']).materials;
  ok(mats['gdev_cutout:gdev_base'] && mats.gdev_base['+samplerStates'][0].textureFilter === 'Point' && mats.gdev_bases['+samplerStates'][0].textureFilter === 'Bilinear', 'materials: the proven ones (cutout, blend …) on a point-filtered base, a bilinear one for smooth pictures');
  const props = JSON.parse(f['bp/entities/player.json'])['minecraft:entity'].description.properties;
  ok(Object.keys(props).length <= 32 && Object.values(props).every((p) => p.client_sync === true), `the properties: ${Object.keys(props).length} (the game's limit 32), all sent to the client`);
  const lines = ent.scripts.pre_animation.concat(Object.values(JSON.parse(f['rp/animations/gdev.animation.json']).animations).flatMap((a) => Object.values(a.bones).flatMap((b) => Object.values(b).flat())));
  ok(lines.every((l) => String(l).length <= 1000 && G.molangError(String(l).replace(/;\s*$/, '').replace(/^v\.[\w]+ = /, '')) === null), 'every Molang line parses and is under 1000 characters (what the real app was proved with)');
}

// ---- nav
{
  const T = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) T.push({ id: `b${r}${c}`, rect: { x: c * 40, y: r * 30, w: 30, h: 20 }, group: 'grid' });
  T.push({ id: 'wide', rect: { x: 0, y: 70, w: 110, h: 20 } });
  T.push({ id: 'off', rect: { x: 150, y: 5, w: 20, h: 20 } });
  ok(N.navigate(T, 'b00', 'D') === 'b01' && N.navigate(T, 'b01', 'A') === 'b00' && N.navigate(T, 'b01', 'S') === 'b11' && N.navigate(T, 'b11', 'W') === 'b01', 'four ways: right, left, down, up to the neighbour');
  ok(N.navigate(T, 'b10', 'S') === 'wide' && N.navigate(T, 'b12', 'S') === 'wide', 'down from any of a row to the wide one below it');
  ok(N.navigate(T, 'wide', 'W', { pointer: [100, 60] }) === 'b12' && N.navigate(T, 'wide', 'W', { pointer: [0, 60] }) === 'b10', 'ambiguous (three equally above): the one nearer to where the player looks');
  ok(N.navigate(T, 'b10', [0.7, -0.7]) === 'b01', 'any angle: W and D together go up-right');
  const U2 = [{ id: 'f', rect: { x: 30, y: 50, w: 60, h: 16 } }, { id: 'l', rect: { x: 11, y: 0, w: 50, h: 13 } }, { id: 'r', rect: { x: 64, y: 0, w: 50, h: 13 } }];
  ok(N.navigate(U2, 'f', 'W') === 'l' && N.navigate(U2, 'f', 'W', { pointer: [100, 6] }) === 'r', 'ambiguous with no pointer in use: the one more squarely that way (more of it across from the focus); pointing, the one pointed near');
  ok(N.navigate(T, 'b02', 'D') === 'off' && N.navigate(T, 'b12', 'D') === 'off', 'out of a container only when nothing in it is that way');
  ok(N.navigate(T, 'b00', 'W') === null && N.navigate(T, 'b00', 'A') === null, 'nothing that way: the focus stays');
  const T2 = T.filter((t) => t.group === 'grid');
  ok(N.navigate(T2, 'b02', 'D') === null && N.navigate(T2, 'b02', 'D', { wrap: 'line' }) === 'b10' && N.navigate(T2, 'b10', 'A', { wrap: 'line' }) === 'b02'
    && N.navigate(T2, 'b11', 'S', { wrap: 'line' }) === 'b02' && N.navigate(T2, 'b12', 'D', { wrap: 'line' }) === null,
    'Tab-like wrap is a choice: past a row\'s end the next row\'s first, past its start the row above\'s last, past a column\'s foot the next column\'s head (the default keeps the focus)');
  ok(JSON.stringify(N.hintsFor(T, 'b11')) === JSON.stringify({ W: 'b01', A: 'b10', S: 'wide', D: 'b12' }), 'the hints: where W A S D would go from the focus');
  ok(N.hit(T, [45, 35]) === 'b11' && N.hit(T, [35, 35]) === null, 'the hit test: the element under the pointer, none in a gap');
  ok(JSON.stringify(N.dirOf([1, 0.2])) === JSON.stringify([1, 0]) && N.dirOf([0, 0]) === null, 'a stick a little off an axis is that axis; a stick at rest is no direction');
}

// ---- input
{
  const T = [{ id: 'a', rect: { x: -40, y: -10, w: 20, h: 20 } }, { id: 'b', rect: { x: 20, y: -10, w: 20, h: 20 } }];
  const c = I.createController({ targets: T, bounds: { x0: -100, y0: -50, x1: 100, y1: 50 }, sens: 4 });
  c.reset({ x: 0, y: 0 }, 4);
  let o = c.step({ rot: { x: 0, y: 7.5 } });
  ok(o.pointer[0] === 30 && o.hover === 'b' && o.focus === 'b', 'turning right 7.5° moves the pointer 30 units right (sens 4) onto b: hovered and focused');
  o = c.step({ rot: { x: 0, y: 40 } });
  ok(o.pointer[0] === 100, 'at the screen\'s edge the pointer stops');
  o = c.step({ rot: { x: 0, y: 39 } });
  ok(o.pointer[0] === 96, 'and coming back moves it at once (no dead zone: like a mouse)');
  c.reset({ x: 0, y: 178 }, 4); c.pointerTo(0, 0);
  o = c.step({ rot: { x: 0, y: -178 } });
  ok(o.pointer[0] === 16, 'yaw round the back (178° → -178°) is 4° right, not 356° left');
  c.reset({ x: 44, y: 0 }, 4); c.pointerTo(0, 0);
  o = c.step({ rot: { x: 46, y: 0 } });
  const turn = o.actions.find((a) => a.type === 'setRotation');
  ok(turn && turn.rotation.x === 0 && o.pointer[1] === 8, 'past 45° of pitch the player is turned level (the frozen camera hides it)');
  const p1 = c.step({ rot: { x: 47, y: 0 } }).pointer[1], p2 = c.step({ rot: { x: 1, y: 0 } }).pointer[1], p3 = c.step({ rot: { x: 2, y: 0 } }).pointer[1];
  ok(p1 === 12 && p2 === 16 && p3 === 20, 'a sample from before the turn-back and one after it are each read in their own frame: the pointer goes on smoothly', JSON.stringify([p1, p2, p3]));
  const k = I.createController({ targets: T, repeatDelay: 8, repeatEvery: 3 });
  k.reset({ x: 0, y: 0 }, 4); k.focus('a');
  o = k.step({ tick: 1, move: { x: -1, y: 0 } });
  ok(o.focus === 'b' && o.events.some((e) => e.type === 'key' && e.key === 'D'), 'D (the move input\'s x = -1: Bedrock\'s +x is left) moves the focus right');
  const kk = I.createController({ targets: [{ id: 'x0', rect: { x: 0, y: 0, w: 5, h: 5 } }, { id: 'x1', rect: { x: 10, y: 0, w: 5, h: 5 } }, { id: 'x2', rect: { x: 20, y: 0, w: 5, h: 5 } }, { id: 'x3', rect: { x: 30, y: 0, w: 5, h: 5 } }], repeatDelay: 8, repeatEvery: 3 });
  kk.reset({ x: 0, y: 0 }, 0); kk.focus('x0');
  const seen = [];
  for (let t = 1; t <= 16; t++) { const r = kk.step({ tick: t, move: { x: -1, y: 0 } }); if (r.events.some((e) => e.type === 'nav')) seen.push(t); }
  ok(JSON.stringify(seen) === JSON.stringify([1, 9, 12]), 'held, a key repeats after 8 ticks, then every 3 (like a keyboard)', JSON.stringify(seen));
  const b = I.createController({ targets: T });
  b.reset({ x: 0, y: 0 }, 0); b.focus('a');
  const e1 = b.step({ jump: true }).events, e2 = b.step({ jump: false }).events, e3 = b.step({ sneak: true }).events;
  ok(e1.some((e) => e.type === 'down' && e.target === 'a') && e2.some((e) => e.type === 'click' && e.target === 'a') && e3.some((e) => e.type === 'back'), 'jump: down then a click on the focus when let go; sneak: back');
  const w = I.createController({ targets: [] });
  w.reset({ x: 0, y: 0 }, 8);
  const w1 = w.step({ slot: 0 }).events.find((e) => e.type === 'wheel'), w2 = w.step({ slot: 7 }).events.find((e) => e.type === 'wheel'), w3 = w.step({ slot: 2 }).events.find((e) => e.type === 'wheel');
  ok(w1.delta === 1 && w2.delta === -2 && w3.delta === 4, 'the hotbar as a wheel: 8 → 0 is +1 (round the end), 0 → 7 is −2, a jump of 4+ is a number key', JSON.stringify([w1, w2, w3]));
  const s = I.createController({ targets: T }); s.reset({ x: 0, y: 0 }, 0); s.pointerTo(30, 0); s.step({ rot: { x: 0, y: 0.1 } });
  ok(s.step({ swings: 1 }).events.some((e) => e.type === 'click' && e.source === 'swing' && e.target === 'b'), 'a swing (left click, a tap) clicks what is under the pointer');
  ok(I.unpack2(I.pack2(12.3, -45.6)).every((v, i) => near(v, [12.3, -45.6][i], 0.051)), 'the pointer in one property: 12 + 12 bits at 0.1 units');
}

// ---- device
{
  let fresh = true, why = '';
  try { execFileSync(process.execPath, [path.join(TOP, 'bds/geoui/screen/device.mjs'), '--check'], { stdio: 'pipe' }); } catch (e) { fresh = false; why = String(e.stderr || e.message); }
  ok(fresh, 'bds/addons/geoui_device is what device.mjs makes', why);
  ok(markClass(216, 0, 0) === 'red' && markClass(0, 108, 216) === 'azure' && markClass(190, 190, 190) === 'white' && markClass(110, 110, 110) === 'gray' && markClass(70, 140, 40) === 'chartreuse' && markClass(255, 0, 255) === null,
    'a pixel\'s mark class: hues 30° apart (lit darker still the same), white and grey, the missing texture\'s magenta none');
  // a made-up screenshot: the 9 anchor marks where expected() says (lit at 85 %), on a noisy floor that is the same in shot world
  for (const [W, H] of [[1560, 720], [2400, 1080], [1024, 768]]) {
    const mk = () => ({ width: W, height: H, data: new Uint8Array(W * H * 4) }), base = mk(), img = mk();
    for (let i = 0; i < W * H; i++) { const g = 120 + ((i * 2654435761) >>> 27); base.data.set([70, g, 40, 255], i * 4); img.data.set([70, g, 40, 255], i * 4); }
    const e = D.expected(W, H), cols = { tl: [255, 0, 0], t: [255, 128, 0], tr: [255, 255, 0], l: [128, 255, 0], c: [0, 255, 0], r: [0, 255, 128], bl: [0, 255, 255], b: [0, 128, 255], br: [0, 0, 255] };
    const names = { tl: 'red', t: 'orange', tr: 'yellow', l: 'chartreuse', c: 'green', r: 'spring', bl: 'cyan', b: 'azure', br: 'blue' };
    for (const [k2, col] of Object.entries(cols)) { const bx = e[`anchor ${k2}`]; for (let y = Math.round(bx.y0); y < Math.round(bx.y1); y++) for (let x = Math.round(bx.x0); x < Math.round(bx.x1); x++) img.data.set(col.map((v) => v * 0.85).concat(255), (y * W + x) * 4); }
    const r = await KINDS.marks.run(img, { baseline: base });
    const off = Object.entries(names).map(([k2, nm]) => Math.max(Math.abs(r.values[`${nm}x0`] - Math.round(e[`anchor ${k2}`].x0)), Math.abs(r.values[`${nm}y1`] - Math.round(e[`anchor ${k2}`].y1))));
    ok(r.ok && r.values.classes === 9 && Math.max(...off) <= 1, `measure marks reads the 9 anchors of a ${W}x${H} screen back to 1 px`, JSON.stringify(off));
    const cmp = D.compare([{ kind: 'marks', shot: `anchors-${W}x${H}`, ok: true, values: r.values }]), worstD = Math.max(...cmp.rows.map((x) => x.d));
    const ins = cmp.screens[0] && cmp.screens[0].inset;
    ok(worstD <= 1.5 && ins && Object.values(ins).every((x) => Math.abs(x) <= 1), `device.mjs compare: the marks against the formulas, ${worstD.toFixed(1)} px off, the HUD's insets read as 0`, JSON.stringify([worstD, ins]));
  }
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} geoui-screen-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
