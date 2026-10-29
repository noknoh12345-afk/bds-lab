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
import fs from 'node:fs';
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
  ok(near(L.K, 0.05859375) && Math.abs(L.K - L.K_MEASURED) / L.K < 1e-4, 'the renderer\'s unit: 0.9375 / 16 of the panel\'s shorter side — what was measured (0.058589 in 2026-10, exactly scale / 16 at 4 scales in run 40055307539)');
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
  const firsts = ent.render_controllers.filter((r) => /^controller\.render\.player\.first_person/.test(Object.keys(r)[0])), map = ent.render_controllers.find((r) => Object.keys(r)[0] === 'controller.render.player.map');
  ok(firsts.length === 2 && firsts.every((r) => /q\.is_local_player && !q\.is_in_ui && \(v\.gdev_hide > 0\)/.test(Object.values(r)[0])) && Object.values(map)[0] === 'variable.map_face_icon',
    'the first-person controllers hidden the same way (a frozen camera may keep the first-person view and its arm); the map\'s face icon untouched');
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
  // what compare reads off the looks (values as measure marks gives them: a box and a mean colour a class)
  {
    const W = 1560, H = 720, e = D.expected(W, H), u = L.K * 0.1 * H;
    const vals = (boxes) => {
      const v = { width: W, height: H, classes: Object.keys(boxes).length };
      for (const [c, b] of Object.entries(boxes)) Object.assign(v, { [`${c}x0`]: Math.round(b.x0), [`${c}y0`]: Math.round(b.y0), [`${c}x1`]: Math.round(b.x1), [`${c}y1`]: Math.round(b.y1), [`${c}n`]: b.n ?? 100, [`${c}r`]: b.rgb?.[0] ?? 0, [`${c}g`]: b.rgb?.[1] ?? 0, [`${c}b`]: b.rgb?.[2] ?? 0 });
      return v;
    };
    const run = (...shots) => D.compare(shots.map(([shot, boxes]) => ({ kind: 'marks', shot, ok: true, values: vals(boxes) }))).rows;
    const said = (rows, what) => (rows.find((x) => x.what === what) || {}).note || '';
    // clip: the square in the panel's box (clipped), over the whole screen (not), none at all (the renderer draws nothing)
    const clip = (b) => said(run(['clip-default', b ? { rose: b } : {}]), '切り抜き（30 % x 30 % の枠）');
    const cl = [clip(e.clip), clip({ x0: 0, y0: 0, x1: W, y1: H }), clip(null)];
    ok(/枠いっぱい/.test(cl[0]) && /画面いっぱい: 切り抜かれない/.test(cl[1]) && /何も描いていない/.test(cl[2]), 'compare: the clip square — the panel\'s box is clipped, the whole screen is not, none at all is a renderer that draws nothing', cl.join(' / '));
    // order: the whole blue plane on top is depth; only its part out of the red one is the drawing order
    const order = (x0) => said(run(['order', { blue: { ...e['order blue'], x0 }, red: e['order red'] }]), '描く順と奥行き');
    ok(/奥行きが効く/.test(order(e['order blue'].x0)) && /描いた順/.test(order(e['order red'].x1)), 'compare: the order test — the blue plane whole is depth, cut at the red one\'s edge is the drawing order', [order(e['order blue'].x0), order(e['order red'].x1)].join(' / '));
    // order: by the red plane's pixels when the blue one's box took in other blue (run 40877717430: the arm's)
    const er = e['order red'], eb = e['order blue'], area = (er.x1 - er.x0) * (er.y1 - er.y0), over = (Math.min(er.x1, eb.x1) - Math.max(er.x0, eb.x0)) * (Math.min(er.y1, eb.y1) - Math.max(er.y0, eb.y0));
    const byRed = (n) => said(run(['order', { blue: { x0: 500, y0: 300, x1: 1300, y1: 700 }, red: { ...er, n } }]), '描く順と奥行き');
    ok(/^奥行きが効く: 赤の画素/.test(byRed(Math.round(area - over))) && /^描いた順: 赤の画素/.test(byRed(Math.round(area))) && /^分からない/.test(byRed(Math.round(area / 2))),
      'compare: the order test read by the red plane\'s pixels — short of the overlap is depth, whole is the drawing order', [byRed(Math.round(area - over)), byRed(Math.round(area))].join(' / '));
    // glyph: as drawn, and mirrored across the screen's middle
    const flip = (b) => ({ ...b, x0: W - b.x1, x1: W - b.x0 });
    const glyph = (f) => said(run(['glyph', { white: f(e['glyph F']), red: f(e['glyph red']), blue: f(e['glyph blue']) }]), 'F の向き');
    ok(/鏡写しではない/.test(glyph((b) => b)) && /左右が逆/.test(glyph(flip)), 'compare: the F — its red dot right of it is not mirrored, left of it is', [glyph((b) => b), glyph(flip)].join(' / '));
    // rc: bars of one length (pre_animation once a frame) or of many (per renderer); the bottom's blue ones not counted
    const rc = (lens) => said(run(['rc', Object.fromEntries(['red', 'orange', 'yellow', 'chartreuse', 'green', 'spring', 'cyan', 'azure', 'blue'].map((c, i) => [c, { x0: 100, y0: 12 * i, x1: 100 + lens[i] * u, y1: 12 * i + 2 * u }]))]), 'pre_animation の回数');
    ok(/1 フレームに 1 回/.test(rc([6, 6, 6, 6, 6, 6, 6, 22, 2])) && /renderer ごとに動いている/.test(rc([2, 4, 6, 8, 10, 12, 14, 16, 18])), 'compare: the rc bars — one length is once a frame (the bottom\'s azure and blue left out), many lengths per renderer', [rc([6, 6, 6, 6, 6, 6, 6, 22, 2]), rc([2, 4, 6, 8, 10, 12, 14, 16, 18])].join(' / '));
    // query: each bar's length is its value; before and after a turn, the change (the short way round)
    const qb = (degs) => Object.fromEntries(degs.map((d, k) => [D.HUES[k][0], { ...e[`query ${k}`], x1: e[`query ${k}`].x0 + (4 + (56 * d) / 360) * u }]));
    // (by bar: camera(0), eye target y, camera(1), eye target x, head y, head x, is_local_player, body y, body x, target y, target x)
    const qr = run(['query-before', qb([350, 350, 0, 0, 350, 0, 300, 90, 0, 350, 0])], ['query-after', qb([20, 350, 0, 0, 20, 0, 300, 90, 0, 20, 0])]);
    // (a px of bar is 360 / 56 / u ≈ 1.5° at 720 px high: the change read to a few degrees)
    const turn = Number((/^([+-]\d+)°/.exec(said(qr, 'q.head_y_rotation(0) の変化')) || [])[1]);
    ok(Math.abs(turn - 30) <= 3 && /^動かない/.test(said(qr, 'q.body_y_rotation の変化')) && /^動かない/.test(said(qr, 'q.eye_target_y_rotation の変化')) && / = 300°/.test(said(qr.filter((x) => x.shot === 'query-after'), 'q.is_local_player x 300')),
      'compare: the rotation queries — a bar\'s length read back as its value, the turn between the two pictures the short way (350° → 20° is +30°)', qr.filter((x) => x.summary).map((x) => `${x.what} ${x.note}`).join(' / '));
    // colors: how much the renderer lit each plane (a channel drawn 255 measured 194: 0.761)
    const co = run(['colors', { white: { ...e['color white'], rgb: [194, 194, 194] }, red: { ...e['color red'], rgb: [194, 2, 3] }, gray: { ...e['color gray'], rgb: [97, 97, 97] } }]);
    ok(/明るさ 0\.761/.test(said(co, '色 white')) && /明るさ 0\.761/.test(said(co, '色 red')) && /明るさ 0\.758/.test(said(co, '色 gray')) && said(co, '色 blue') === 'その色が無い', 'compare: the colours — lit by the measured channel over the drawn one, a missing one said', ['white', 'red', 'gray', 'blue'].map((c) => said(co, `色 ${c}`)).join(' / '));
  }
  // app.txt: the looks on the device's own screen and one picture a kind of mark; the query bars against a world without them;
  // each cut-out with the game started and joined again; the clip square rose (grey did not show on the CI device)
  {
    const at = D.appTxt(), sec = (name) => at.split(/\n(?=section )/).find((s) => s.startsWith(`section ${name}\n`)) || '';
    ok(/^section look\nsize reset\n/.test(sec('look')) && ['colors', 'glyph', 'order', 'rc'].every((n) => new RegExp(`^shot ${n}\\nmeasure marks ${n}$`, 'm').test(sec('look'))) && !/gdev:show (3136|513)\b/.test(at),
      'device app.txt: the looks measured on the device\'s own size, the colours, the F, the order test and the rc bars each in a picture of its own', sec('look'));
    ok(/do scriptevent gdev:show 0\nwait \d+\nshot world\ndo scriptevent gdev:show 256\nwait \d+\nshot query-before\nmeasure marks query-before\nlook left [\d ]+\nwait \d+\nshot query-after\nmeasure marks query-after/.test(sec('in-query')),
      'device app.txt: the query bars measured against a world without them, before and after the turn', sec('in-query'));
    const cuts = ['tall', 'hole'].map((c) => sec(`cutout-${c}`));
    ok(cuts.every((s, i) => new RegExp(`^section cutout-${['tall', 'hole'][i]}\\ndo scriptevent gdev:kick\\nwait \\d+\\nstop\\ncutout ${['tall', 'hole'][i]}\\nwait \\d+\\nlaunch\\nuntil title \\d+\\njoin\\nuntil joined \\d+\\nshot world\\nwait \\d+\\nshot rejoin-${['tall', 'hole'][i]}\\nmeasure diff rejoin-${['tall', 'hole'][i]}\\ndo testfor @a\\ndo tp @a 0 -60 0 0 90`).test(s) && /\nshot world\n[^]*measure marks anchors-cut-/.test(s)) && /^section over\n[^]*measure marks over$/m.test(sec('over')) && at.indexOf('section over') < at.indexOf('section cutout-'),
      'device app.txt: the edge with no cut-out first, then each cut-out with the game stopped, started and joined again before its marks', cuts.join('\n'));
    // (the anchors with the hotbar hidden — it is drawn over GeoUI, the bottom middle's square under it — and shown again, with
    //  a world shot of its own, for the box whose gui frame is the hotbar's)
    const sizes = at.split(/\n(?=section )/).filter((s) => s.startsWith('section size-'));
    ok(sizes.length === 10 && sizes.every((s) => /\ndo hud @a hide hotbar\ndo scriptevent gdev:show 0\nwait \d+\nshot world\n[^]*\nmeasure marks anchors-\S+\ndo hud @a reset hotbar\ndo scriptevent gdev:show 0\nwait \d+\nshot world\n[^]*\nmeasure marks box-/.test(s))
      && cuts.every((t) => /do hud @a hide hotbar\nwait \d+\nshot world\n[^]*measure marks anchors-cut-\S+\ndo hud @a reset hotbar\n/.test(t)),
      'device app.txt: the anchors shot with the hotbar hidden (each size and cut-out), the box with it shown and a world of its own', sizes[1]);
    // (the game stopped and started right before its first join — in a batch this section is where the add-on starts: the
    //  first joins of a device come back from its snapshot failed three runs in a row on 2026-10-24, the joins after a restart went in)
    ok(/^section join\nstop\nlaunch\nuntil title \d+\nshot title\njoin\nuntil joined \d+\n/.test(sec('join')) && !/^section title$/m.test(at),
      'device app.txt: its first join from a game just started again (stop, launch, the title), no section before it', sec('join').slice(0, 200));
    // (the marks with the camera frozen — no first-person arm in front of them, RULES R4.11 — from the set-up to the end of the
    //  looks, and again for the density and the edge; the inputs in first person between)
    const camOn = (t) => /do scriptevent gdev:cam 1\n/.test(t), camOffAt = (t) => t.indexOf('do scriptevent gdev:cam 0');
    ok(camOn(sec('join')) && sec('join').indexOf('gdev:cam 1') > sec('join').indexOf('do tp @a') && camOffAt(sec('look')) > sec('look').indexOf('measure marks rc') && camOn(sec('density'))
      && ['in-key-free', 'in-query', 'in-text'].every((n) => !/gdev:cam/.test(sec(n))) && cuts.every((t) => camOn(t) && t.indexOf('gdev:cam 1') < t.indexOf('measure marks anchors-cut-')) && /gdev:cam 0/.test(sec('end')),
      'device app.txt: the marks shot with the camera frozen where the head is (the set-up, the density, the cut-outs), given back before the inputs and at the end', [sec('join'), sec('look')].join('\n').slice(-600));
    ok(/^press 5 \d+$/m.test(sec('in-slot-key')) && !/^key /m.test(sec('in-slot-key')) && /^press T \d+$/m.test(sec('in-text')) && /^press SHIFT\+SEMICOLON \d+$/m.test(sec('in-text')) && /^press ENTER \d+$/m.test(sec('in-text')) && !/^chat /m.test(sec('in-text'))
      && sec('in-text').split('\n').filter((l) => /^press /.test(l)).map((l) => l.split(' ')[1]).join(' ') === 'T SLASH G D E V SHIFT+SEMICOLON T SPACE H E L L O ENTER'
      && /replaceitem entity @a slot\.weapon\.mainhand 0 snowball \d+\n[^]*\nuse 0\.3\n/.test(sec('in-use-pad')) && /^hold 0\.6 0\.4 \d+$/m.test(sec('in-swing-hold')),
      'device app.txt: the digit and the chat by the device\'s own keyboard (/gdev:t hello key by key), a snowball to use, a touch held for the attack', sec('in-text'));
    // (how far the chat got, in numbers the public summary keeps: each step's picture against the world shot before it — run
    //  40924847860 sent nothing and its pictures are sealed — and the chat opened by / as a second way in; the title's letters likewise)
    const steps = (n, l) => new RegExp(`^section ${n}\\ndo scriptevent gdev:mark\\nshot world\\npress \\S+ \\d+\\nwait \\d+\\nshot ${l}-open\\nmeasure diff ${l}-open\\n[^]*\\nshot ${l}-typed\\nmeasure diff ${l}-typed\\npress ENTER \\d+\\nwait \\d+\\nshot ${l}-sent\\nmeasure diff ${l}-sent\\ndo scriptevent gdev:check text ${l}-text\\n`);
    ok(steps('in-text', 'chat').test(sec('in-text')) && steps('in-text-slash', 'slash').test(sec('in-text-slash'))
      && sec('in-text-slash').split('\n').filter((l) => /^press /.test(l)).map((l) => l.split(' ')[1]).join(' ') === 'SLASH G D E V SHIFT+SEMICOLON T SPACE H I ENTER'
      && /^shot world\ndo scriptevent gdev:title QZX7JK2W SUBLINE\nwait \d+\nshot text\nmeasure diff text\nexpect text QZX7JK2W$/m.test(sec('text')),
      'device app.txt: the chat measured step by step against the world (open, typed, sent), once by T and once by /, and the title\'s letters by a diff', [sec('in-text-slash'), sec('text')].join('\n'));
    const script = D.files().files['bp/scripts/main.js'].toString();
    ok(/for \(const p of world\.getAllPlayers\(\)\) \{\n\s+[^\n]*\n[^\n]*\n\s+if \(!p\.isValid\) continue;\n\s+try \{ tickOf\(p\); \} catch \(e\)/.test(script) && /verb === 'cam'/.test(script) && /verb === 'kick'\) \{ try \{ p\.dimension\.runCommand\('kick "' \+ p\.name/.test(script) && /\{ name: 'ui', range: \[0, 2\]/.test(fs.readFileSync(path.join(TOP, 'bds/geoui/screen/device.mjs'), 'utf8')),
      'device script: the tick loop skips a player not valid and never throws (a leaving player once stopped it every tick); gdev:cam freezes the camera alone (ui 2: the body hidden); gdev:kick sends each player off by name (never an error with nobody on)');
    const plate = D.scene().planes.find((p) => p.bone === 'gdev_clip' && p.rect.w === 400);
    ok(plate && plate.uv[0] === D.HUES.findIndex(([nm]) => nm === 'rose') + 0.25, 'device: the clip square is rose (a hue no floor has; grey was not found at all on the CI device)', JSON.stringify(plate && plate.uv));
  }
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} geoui-screen-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
