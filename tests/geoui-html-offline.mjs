#!/usr/bin/env node
// HTML → GeoUI (bds/geoui/html/), no network, no browser (the sample's capture is kept: examples/menu.capture/), no game:
//   pack     bds/addons/geoui_html_demo is what convert.mjs --sample makes; the game's limits (properties, Molang lines, depth of
//            brackets, bones, atlases); no variable read before it is set (the game stops the rest of pre_animation there)
//   drawn    the pack's own Molang, run as the game runs it (GeoUICore: pre_animation, the transform animation, part_visibility):
//            closed nothing; open, each page its own; every control one look in any mix of focus / hover / pressed / checked
//            (pressed > focused > hovered, among the looks it has); a slider its value's frame, focused its focused frame; the
//            score's digits; the gauge; the pointer and the W A S D hints where the script says
//   tables   the Molang lookup tables (index → value): every value back, any size, short lines
//   script   the behaviour pack's main.js itself, on a made-up @minecraft/server: opened by a scriptevent and by /ghd:open, the
//            camera frozen and the HUD's own parts hidden (the touch controls and the hotbar kept), W A S D, jump, sneak, the
//            hotbar's wheel and keys, the head's turns as the mouse, a swing a click, what happens sent as ghd:on_<name> (and that
//            never comes back as a command), the player's choices kept, a player who left with it open back closed, every
//            property in its range; the three ways of keeping the body still (free / speed / lock)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = require('../bds/geoui/geoui_builder.js'), N = require('../bds/geoui/screen/nav.js'), L = require('../bds/geoui/screen/layout.js');
const R = require('../bds/geoui/html/runtime.js');
const { addonFiles, SAMPLE } = await import('../bds/geoui/html/convert.mjs');
const { tableLines } = await import('../bds/geoui/html/scene.mjs');

let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${String(d).split('\n').slice(0, 12).join('\n  ')}`}`); };
const NS = 'ghd';
const built = addonFiles(SAMPLE.capture, { ns: NS, name: SAMPLE.name, hold: 'free' });
const { files, cfg } = built;
const json = (f) => JSON.parse(files[f]);

// ---- pack
{
  let fresh = true, why = '';
  try { execFileSync(process.execPath, [path.join(TOP, 'bds/geoui/html/convert.mjs'), '--sample', '--check'], { stdio: 'pipe' }); } catch (e) { fresh = false; why = String(e.stderr || e.message); }
  ok(fresh, 'bds/addons/geoui_html_demo is what convert.mjs --sample makes (from the kept capture: no browser)', why);
  ok(built.warnings.length === 0, 'the sample converts with no warning', built.warnings.join('\n'));
  const props = json('bp/entities/player.json')['minecraft:entity'].description.properties;
  ok(Object.keys(props).length <= 32, `properties: ${Object.keys(props).length} (the game's limit 32)`);
  const ent = json('rp/entity/player.entity.json')['minecraft:client_entity'].description;
  const ours = ent.scripts.pre_animation.filter((l) => l.includes(`${NS}_`)), anim = json(`rp/animations/${NS}.animation.json`).animations;
  const all = [...ours, ...Object.values(anim).flatMap((a) => Object.values(a.bones).flatMap((b) => Object.values(b).flat().map(String)))];
  const rcs = Object.values(json(`rp/render_controllers/${NS}.render_controllers.json`).render_controllers);
  all.push(...rcs[0].part_visibility.slice(1).map((o) => Object.values(o)[0]));
  const depth = (l) => { let d = 0, m = 0; for (const ch of l) { if (ch === '(') m = Math.max(m, ++d); else if (ch === ')') d--; } return m; };
  const bad = all.filter((l) => l.length > 1000 || depth(l) > 24 || G.molangError(l.replace(/;\s*$/, '')) !== null);
  ok(bad.length === 0, `every Molang line (${all.length}) parses, under 1000 characters and 24 brackets deep (what the real app was proved with)`, bad.slice(0, 3).join('\n'));
  const reads = ours.filter((l) => /q\.property/.test(l));
  ok(reads.every((l) => /variable\.is_paperdoll \?/.test(l)), 'every property read is guarded (the paper doll has none)');
  const unset = G.unsetReads(ent.scripts.pre_animation, { init: ent.scripts.initialize, ours: new RegExp(`^variable\\.${NS}_`) });
  ok(unset.length === 0, 'no variable is read before it is set (the game would stop the rest of pre_animation there)', unset.join(' '));
  const geos = Object.keys(files).filter((f) => f.endsWith('.geo.json')).map((f) => json(f)['minecraft:geometry'][0]);
  ok(geos[0].bones.length <= 600 && geos.every((g) => g.description.texture_width <= 2048 && g.description.texture_height <= 2048),
    `bones ${geos[0].bones.length} (the real app drew 600), atlases ${geos.map((g) => `${g.description.texture_width}x${g.description.texture_height}`).join(' + ')} (≤ 2048)`);
  const leaves = new Set(geos[0].bones.map((b) => b.parent));
  ok(Object.keys(Object.assign({}, ...rcs[0].part_visibility.slice(1))).every((b) => !leaves.has(b)), 'part_visibility only on bones with no children (a hidden parent\'s children: 要実測)');
  const main = files['bp/scripts/main.js'];
  ok(/sendScriptEvent\(CFG\.ns \+ ':on_' \+ name/.test(main) && !/'on_/.test(main.slice(main.indexOf('scriptEventReceive'))), 'what happens goes out as ghd:on_<name>, a name no command of the pack has');
}

// ---- drawn: the pack's Molang run as the game runs it
const ent = json('rp/entity/player.entity.json')['minecraft:client_entity'].description;
const PRE = ent.scripts.pre_animation.filter((l) => l.includes(`${NS}_`)), INIT = ent.scripts.initialize.filter((l) => l.includes(`${NS}_`));
const ANIM = json(`rp/animations/${NS}.animation.json`).animations[`animation.${NS}.ui`];
const VIS = Object.assign({}, ...Object.values(json(`rp/render_controllers/${NS}.render_controllers.json`).render_controllers)[0].part_visibility.slice(1));
const GEOS = Object.keys(files).filter((f) => f.endsWith('.geo.json')).map((f) => json(f)['minecraft:geometry'][0]);
const ORIGIN = L.groupsOf({ ns: NS, scale: { mode: 'contain', w: cfg.design.w, h: cfg.design.h, g: cfg.design.g }, groups: [{ id: 'page', anchor: 'center' }] })[0].origin;
/** properties (short names) → { shown: Map bone → [quads], env } */
function drawn(props) {
  const env = G.envOf({ props: Object.fromEntries(Object.entries(props).map(([k, v]) => [`${NS}:${k}`, v])) });
  G.runPre(INIT, env); G.runPre(PRE, env);
  const shown = new Map();
  for (const q of G.pose(GEOS, ANIM, env).quads) {
    if (q.hidden || (VIS[q.bone] !== undefined && !G.molang(VIS[q.bone], env))) continue;
    if (!shown.has(q.bone)) shown.set(q.bone, []);
    shown.get(q.bone).push(q.quad);
  }
  return { shown, env };
}
const fhaOf = (foc, hov, act) => (foc + 1) + (hov + 1) * 256 + (act + 1) * 65536;
const chkOf = (on) => on.reduce((v, i) => v + 2 ** i, 0);
const C = cfg.controls, page0 = cfg.pages.findIndex((p) => p.id === 'play');
const looks = (shown, i) => [...shown.keys()].filter((b) => b.startsWith(`${NS}_c${i}_`));
{
  ok(drawn({ pg: 0, fha: fhaOf(0, -1, -1) }).shown.size === 0, 'closed (pg 0): nothing is drawn');
  const pagesOk = cfg.pages.every((_, k) => { const s = drawn({ pg: k + 1, fha: 0 }).shown; return cfg.pages.every((__, j) => s.has(`${NS}_p${j}`) === (j === k)) && s.has(`${NS}_bg`); });
  ok(pagesOk, 'open: the background, and of the pages only the one in pg');
  // every control: one look in any mix of states (random, and every one of focus / hover / pressed on each control)
  let worst = null, tried = 0;
  const check = (pg, foc, hov, act, on, f24, why) => {
    tried++;
    const { shown } = drawn({ pg, fha: fhaOf(foc, hov, act), chk0: chkOf(on), vf0: f24 + 6 * 16 });
    for (const c of C) {
      const here = c.page === pg - 1 || c.page < 0, got = looks(shown, c.i);
      let want = [];
      if (here && c.kind === 'slider') want = [`${NS}_c${c.i}_${foc === c.i && GEOS[0].bones.some((b) => b.name === `${NS}_c${c.i}_ff${f24}`) ? 'ff' : 'f'}${f24}`];
      else if (here) {
        const sfx = c.checked !== null && c.checked !== undefined && on.includes(c.i) ? '_on' : '';
        const has = (s) => GEOS[0].bones.some((b) => b.name === `${NS}_c${c.i}_${s}${sfx}`);
        const s = [['active', act], ['focus', foc], ['hover', hov]].find(([st, at]) => at === c.i && has(st));
        want = [`${NS}_c${c.i}_${s ? s[0] : 'normal'}${sfx}`];
      }
      if (JSON.stringify(got) !== JSON.stringify(want) && !worst) worst = `${why} pg=${pg} foc=${foc} hov=${hov} act=${act} on=[${on}] → c${c.i}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`;
    }
  };
  let seed = 7;
  const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
  for (let t = 0; t < 60; t++) {
    const pick = () => rnd(C.length + 1) - 1;
    check(1 + rnd(cfg.pages.length), pick(), pick(), pick(), C.filter(() => rnd(2)).map((c) => c.i), rnd(10), 'random');
  }
  for (const c of C) for (const [foc, hov, act] of [[c.i, -1, -1], [-1, c.i, -1], [-1, -1, c.i], [c.i, c.i, c.i], [c.i, -1, c.i], [-1, c.i, c.i]]) check(Math.max(0, c.page) + 1, foc, hov, act, [0, 19, 22], 3, 'each');
  ok(!worst, `every control shows exactly one look in ${tried} mixes of page, focus, hover, pressed, checked (pressed > focused > hovered among the looks it has)`, worst);
  // pressing a focused button that has no pressed look of its own keeps its focus look (not the plain one)
  const plainPress = C.find((c) => c.kind === 'button' && !c.disabled && GEOS[0].bones.some((b) => b.name === `${NS}_c${c.i}_focus`) && !GEOS[0].bones.some((b) => b.name === `${NS}_c${c.i}_active`));
  ok(!plainPress || looks(drawn({ pg: Math.max(0, plainPress.page) + 1, fha: fhaOf(plainPress.i, -1, plainPress.i) }).shown, plainPress.i)[0] === `${NS}_c${plainPress.i}_focus`,
    'a focused button with no pressed look of its own keeps its focus look while pressed');
  // the slider: its value's frame; focused, its focused frame (the browser drew both: the thumb is the value's, the ring the focus's)
  const sl = C.find((c) => c.kind === 'slider'), slPage = sl.page + 1;
  const fr = (foc, f) => looks(drawn({ pg: slPage, fha: fhaOf(foc, -1, -1), vf0: f }).shown, sl.i);
  ok(JSON.stringify(fr(-1, 7)) === JSON.stringify([`${NS}_c${sl.i}_f7`]) && JSON.stringify(fr(sl.i, 7)) === JSON.stringify([`${NS}_c${sl.i}_ff7`]) && JSON.stringify(fr(sl.i, 0)) === JSON.stringify([`${NS}_c${sl.i}_ff0`]),
    'a slider: the frame of its value, focused the focused frame of that value (never the first value\'s picture over it)');
  // the score: digits of n0, each place its own bone
  const num = cfg.dynamic.find((d) => d.kind === 'number');
  const digits = (v) => { const s = drawn({ pg: 1, fha: 0, [`n${num.i}`]: v }).shown; return Array.from({ length: num.digits }, (_, j) => [...Array(10).keys()].filter((g) => s.has(`${NS}_d${num.i}_${j}_${g}`)).join('')).join(''); };
  ok(digits(1234) === '001234' && digits(987654) === '987654' && digits(0) === '000000', `the score: ${num.digits} places, each the digit of its place (1234 → ${digits(1234)})`);
  const gauge = cfg.dynamic.find((d) => d.kind === 'gauge');
  const gframe = (k) => [...drawn({ pg: gauge.page + 1, fha: 0, vf0: k * 16 }).shown.keys()].filter((b) => b.startsWith(`${NS}_d${gauge.i}_f`));
  ok(JSON.stringify(gframe(6)) === JSON.stringify([`${NS}_d${gauge.i}_f6`]) && JSON.stringify(gframe(10)) === JSON.stringify([`${NS}_d${gauge.i}_f10`]), 'the gauge: the frame in its 4 bits of vf0, only that one');
  // the pointer: where the script's number puts it, its tip at the pointer (model units: x right, y up from the group's origin)
  const q = (v) => Math.min(4095, Math.max(0, Math.round((v + cfg.range) / cfg.step)));
  let ptrErr = 0;
  for (const [x, y] of [[0, 0], [-150.3, 80.2], [120.04, -88.8], [33.3, 17.7]]) {
    const s = drawn({ pg: 1, fha: 0, flg: 1, cur: q(x) + q(y) * 4096 }).shown.get(`${NS}_ptr`);
    if (!s) { ptrErr = Infinity; break; }
    const tip = [s[0].x0 + 0.5 - ORIGIN[0], -(s[0].y1 - 0.5 - ORIGIN[1])];
    ptrErr = Math.max(ptrErr, Math.abs(tip[0] - x), Math.abs(tip[1] - y));
  }
  ok(ptrErr <= cfg.step / 2 + 1e-6, `the pointer is drawn where the script put it, to half its step (${cfg.step} units): off by ${ptrErr.toFixed(4)}`);
  ok(!drawn({ pg: 1, fha: 0, flg: 0, cur: q(0) }).shown.has(`${NS}_ptr`), 'the pointer is hidden while the keys move the focus (flg bit 1 off)');
  // the hints: a badge at the top-left of where each of W A S D goes
  const targets = C.filter((c) => (c.page === page0 || c.page < 0) && !c.disabled).map((c) => ({ id: c.id, rect: c.rect, group: c.group }));
  const h = N.hintsFor(targets, 'c4'), idx = (id) => (id ? C.find((c) => c.id === id).i : -1);
  const hint = ['W', 'A', 'S', 'D'].reduce((v, k, j) => v + (idx(h[k]) + 1) * 64 ** j, 0);
  const hs = drawn({ pg: page0 + 1, fha: fhaOf(4, -1, -1), flg: 2, hint }).shown;
  const badge = ['W', 'A', 'S', 'D'].every((k) => {
    const b = hs.get(`${NS}_hint_${k.toLowerCase()}`);
    if (!h[k]) return !b;
    const r = C.find((c) => c.id === h[k]).rect;
    // (the tables keep a thousandth of a unit: 1/250 of a design px)
    return b && Math.abs(b[0].x0 - ORIGIN[0] - (r.x - 3)) <= 1e-3 && Math.abs(-(b[0].y1 - ORIGIN[1]) - (r.y - 3)) <= 1e-3;
  });
  ok(badge && JSON.stringify(h) === JSON.stringify({ W: 'c1', A: 'c3', S: 'c7', D: 'c5' }), `the W A S D hints from 「2. 洞くつ」: each badge at its target's corner — up the tab more squarely above it (${JSON.stringify(h)})`);
  ok(N.hintsFor(targets, 'c4', { pointer: [0, -56] }).W === 'c2', 'while the player points, the ambiguous one nearer the pointer: up to 「せってい」 when pointing at it');
}

// ---- tables
{
  let worst = '';
  for (const size of [1, 5, 16, 17, 33, 100, 255]) {
    const vals = Array.from({ length: size }, (_, i) => Math.round(((i * 7919) % 1000) / 7 * 1000) / 1000 - 50);
    const t = tableLines('tt', 'x', 'v.tt_i', vals, -1);
    for (const i of [-1, ...vals.keys(), size, size + 5]) {
      const env = G.envOf({ vars: { 'variable.tt_i': i } });
      G.runPre(t.lines, env);
      const want = i >= 0 && i < size ? vals[i] : -1, got = env.vars['variable.tt_x'];
      if (Math.abs(got - want) > 1e-9 && !worst) worst = `size ${size} index ${i}: ${got} ≠ ${want}`;
    }
    if (t.lines.some((l) => l.length > 1000)) worst = worst || `size ${size}: a line of ${Math.max(...t.lines.map((l) => l.length))} characters`;
  }
  ok(!worst, 'a lookup table gives every value back by its index (1 … 255 entries, in lines of 16), outside the range its default, every line under 1000 characters', worst);
}

// ---- script: main.js on a made-up @minecraft/server
function harness(script, opts = {}) {
  const decl = json('bp/entities/player.json')['minecraft:entity'].description.properties;
  const out = { sent: [], logs: [], camera: [], hud: [], perms: [], tp: 0, bar: [], msgs: [], runs: [], badProps: [], cmds: {}, rot: [], delivered: 0 };
  const subs = { script: [], spawn: [], swing: [], use: [], button: [], startup: [] };
  const later = [], queue = [];
  let interval = null;
  class Player { }
  const input = { move: { x: 0, y: 0 }, jump: false, sneak: false, mode: 'KeyboardAndMouse' };
  const p = new Player();
  Object.assign(p, {
    id: '-4294967295', name: 'A', isValid: true, location: { x: 0.5, y: -60, z: 0.5 }, rot: { x: 0, y: 0 }, selectedSlotIndex: 0, props: {}, dyn: {}, speed: 0.1,
    inputInfo: { getMovementVector: () => ({ x: input.move.x, y: input.move.y }), getButtonState: (b) => (input[b === 'Jump' ? 'jump' : 'sneak'] ? 'Pressed' : 'Released'), get lastInputModeUsed() { return input.mode; } },
    getRotation: () => ({ x: p.rot.x, y: p.rot.y }), setRotation: (r) => { p.rot = { x: r.x, y: r.y }; out.rot.push(r); },
    teleport: (loc) => { p.location = { x: loc.x, y: loc.y, z: loc.z }; out.tp++; },
    getHeadLocation: () => ({ x: p.location.x, y: p.location.y + 1.62, z: p.location.z }),
    setProperty: (k, v) => { const d = decl[k]; if (!d || !Number.isInteger(v) || v < d.range[0] || v > d.range[1]) out.badProps.push(`${k}=${v}`); p.props[k] = v; },
    getProperty: (k) => (k in p.props ? p.props[k] : decl[k] && decl[k].default),
    camera: { setCamera: (preset, o) => out.camera.push(['set', preset, o]), clear: () => out.camera.push(['clear']) },
    onScreenDisplay: { setHudVisibility: (vis, els) => out.hud.push(['set', vis, els]), resetHudElementsVisibility: () => out.hud.push(['reset']), setActionBar: (t) => out.bar.push(t) },
    inputPermissions: { setPermissionCategory: (cat, on) => out.perms.push([cat, on]) },
    getComponent: (name) => (name === 'minecraft:movement' ? { get currentValue() { return p.speed; }, setCurrentValue: (v) => { p.speed = v; } } : undefined),
    runCommand: (c) => out.runs.push(c), getDynamicProperty: (k) => p.dyn[k], setDynamicProperty: (k, v) => { if (v === undefined) delete p.dyn[k]; else p.dyn[k] = v; },
    sendMessage: (m) => out.msgs.push(m),
  });
  const mc = {
    world: { getAllPlayers: () => (p.isValid ? [p] : []), afterEvents: { playerSwingStart: { subscribe: (f) => subs.swing.push(f) }, itemUse: { subscribe: (f) => subs.use.push(f) }, playerSpawn: { subscribe: (f) => subs.spawn.push(f) }, playerButtonInput: { subscribe: (f) => subs.button.push(f) } } },
    system: {
      runInterval: (f) => { interval = f; return 1; }, run: (f) => { later.push(f); return 2; },
      sendScriptEvent: (id, message) => { out.sent.push([id, message]); queue.push({ id, message, sourceEntity: undefined }); },
      afterEvents: { scriptEventReceive: { subscribe: (f, o) => subs.script.push([f, o]) } }, beforeEvents: { startup: { subscribe: (f) => subs.startup.push(f) } },
    },
    Player, InputButton: { Jump: 'Jump', Sneak: 'Sneak' }, ButtonState: { Pressed: 'Pressed', Released: 'Released' }, InputPermissionCategory: { Camera: 1, Movement: 2 },
    HudVisibility: { Hide: 0, Reset: 1 }, HudElement: { PaperDoll: 0, Armor: 1, ToolTips: 2, TouchControls: 3, Crosshair: 4, Hotbar: 5, Health: 6, ProgressBar: 7, Hunger: 8, AirBubbles: 9, HorseHealth: 10, StatusEffects: 11, ItemText: 12 },
    CommandPermissionLevel: { Any: 0, GameDirectors: 1 }, CustomCommandParamType: { String: 'String' }, CustomCommandStatus: { Success: 0, Failure: 1 },
  };
  const say = (...a) => out.logs.push(a.map(String).join(' '));
  const ctx = vm.createContext({ console: { log: say, warn: say, error: say, info: say }, __mc: mc });
  vm.runInContext(files['bp/scripts/screen_nav.js'], ctx);
  vm.runInContext(files['bp/scripts/screen_input.js'], ctx);
  const src = script.replace(/^import \{([^}]+)\} from '@minecraft\/server';$/m, 'const {$1} = __mc;').replace(/^import '\.\/screen_(nav|input)\.js';$/gm, '');
  vm.runInContext(src, ctx, { filename: 'main.js' });
  for (const f of subs.startup) f({ customCommandRegistry: { registerCommand: (def, cb) => { out.cmds[def.name] = { def, cb }; }, registerEnum() { } } });
  const deliver = (ev) => { out.delivered++; for (const [f, o] of subs.script) if (!o || !o.namespaces || o.namespaces.includes(ev.id.split(':')[0])) f(ev); };
  const drain = () => { let rounds = 0; while (queue.length && rounds++ < 50) for (const ev of queue.splice(0)) deliver(ev); return queue.length === 0; };
  const H = {
    p, out, input, subs,
    tick(k = 1) { for (let i = 0; i < k; i++) { for (const f of later.splice(0)) f(); if (interval) interval(); if (!drain()) throw new Error('script events loop'); } },
    scriptevent(id, message = '', who) { deliver({ id, message, sourceEntity: who }); if (!drain()) throw new Error('script events loop'); },
    fha() { const v = p.props[`${NS}:fha`] || 0; return [v % 256 - 1, Math.floor(v / 256) % 256 - 1, Math.floor(v / 65536) - 1]; },
    pg: () => p.props[`${NS}:pg`],
    chk: (i) => Math.floor((p.props[`${NS}:chk${Math.floor(i / 24)}`] || 0) / 2 ** (i % 24)) % 2,
    sentNames: () => out.sent.map(([id]) => id),
    last: (name) => { const m = out.sent.filter(([id]) => id === `${NS}:on_${name}`).pop(); return m ? JSON.parse(m[1]) : null; },
    press(field, ticks = 1) { input[field] = true; H.tick(ticks); input[field] = false; H.tick(); },
    move(x, y, ticks = 1) { input.move = { x, y }; H.tick(ticks); input.move = { x: 0, y: 0 }; H.tick(); },
  };
  return H;
}
{
  const S = harness(files['bp/scripts/main.js']), { p, out } = S;
  ok(out.cmds[`${NS}:open`] && out.cmds[`${NS}:t`] && out.cmds[`${NS}:open`].def.permissionLevel === 0, '/ghd:open [page] and /ghd:t <text> are registered for everyone');
  for (const f of S.subs.spawn) f({ player: p, initialSpawn: true });
  S.tick();
  ok(S.pg() === 0 && out.camera.some((c) => c[0] === 'clear'), 'a player who joins: the camera given back, the page closed');
  S.scriptevent(`${NS}:open`, '');
  S.tick(2);
  const hud = out.hud.find((h) => h[0] === 'set');
  ok(S.pg() === 1 && out.camera.some((c) => c[0] === 'set' && c[1] === 'minecraft:free' && c[2].rotation) && hud && !hud[2].includes(3) && !hud[2].includes(5) && hud[2].includes(4),
    'scriptevent ghd:open (the console: every player): the first page, the camera frozen where it looked, the HUD\'s parts hidden but the touch controls and the hotbar (the page has slots)', JSON.stringify([S.pg(), hud]));
  ok(JSON.stringify(S.sentNames()) === JSON.stringify([`${NS}:on_open`]) && out.logs.some((l) => l === 'GEOUI open {"player":"A","page":"play"}'),
    'opening sends ghd:on_open once (it reaches the pack\'s own listener and is no command there: no loop) and logs GEOUI open', JSON.stringify(S.sentNames()));
  ok(JSON.stringify(S.fha()) === JSON.stringify([0, -1, -1]) && (p.props[`${NS}:flg`] & 2) === 2, 'the focus on the first control, the W A S D hints shown');
  S.move(-1, 0);
  ok(JSON.stringify(S.fha()) === JSON.stringify([1, -1, -1]), 'D (the move input x = −1): the focus to the right (the second tab)');
  S.move(0, -1);
  ok(S.fha()[0] === 4, 'S: down from 「もちもの」 to the stage under it the most (「2. 洞くつ」)', JSON.stringify(S.fha()));
  S.input.jump = true; S.tick();
  ok(S.fha()[2] === 4, 'jump held: the control is pressed (its pressed look)');
  S.input.jump = false; S.tick();
  ok(S.fha()[2] === -1 && JSON.stringify(S.last('event')) === JSON.stringify({ player: 'A', name: 'stage2', id: 'c4' }), 'jump let go: a click — its data-geoui-action event:stage2 as ghd:on_event');
  p.selectedSlotIndex = 2; S.tick();
  ok(S.pg() === 3 && S.chk(2) === 1 && S.chk(0) === 0 && S.last('page').page === 'settings', 'hotbar slot 3: the tab on that slot, its page (せってい)');
  S.scriptevent(`${NS}:focus`, 'c19', p); S.tick();
  ok(S.fha()[0] === 19 && S.chk(19) === 1, 'scriptevent ghd:focus c19 (from the player): the focus on 「音楽」, on');
  S.press('jump');
  ok(S.chk(19) === 0 && S.last('change').id === 'c19' && S.last('change').checked === false && /"19":false/.test(p.dyn[`${NS}:state`] || ''), 'jump: 「音楽」 off, ghd:on_change, kept in the world');
  S.scriptevent(`${NS}:focus`, 'c21', p); S.press('jump');
  ok(S.chk(21) === 1 && S.chk(22) === 0 && S.chk(23) === 0, 'a radio: on, and the others of its name off');
  S.scriptevent(`${NS}:focus`, 'c20', p); S.tick();
  for (const f of S.subs.button) { f({ player: p, button: 'Jump', newButtonState: 'Pressed' }); f({ player: p, button: 'Jump', newButtonState: 'Released' }); }
  S.tick(2);
  ok(S.chk(20) === 1, 'a jump tapped quicker than a tick (pressed and let go between two samples) still clicks');
  S.scriptevent(`${NS}:focus`, 'c24', p); S.tick();
  S.move(1, 0);
  ok(S.last('change').id === 'c24' && S.last('change').value === 3 && S.fha()[0] === 24, 'a slider in focus: A lowers it (4 → 3) and keeps the focus');
  ok(p.props[`${NS}:vf0`] === 2 + 6 * 16, 'its frame (3 → the third of 1…10) and the gauge\'s (60 → 6) in vf0');
  p.selectedSlotIndex = 3; S.tick();
  ok(S.last('change').value === 2 && S.fha()[0] === 24 && S.pg() === 3, 'the wheel one notch on a focused slider: its value (3 → 2), not the slot\'s control');
  p.selectedSlotIndex = 2; S.tick();
  ok(S.last('change').value === 3 && S.fha()[0] === 24, 'and back (2 → 3)');
  p.rot = { x: 3.5, y: -2.5 }; S.tick();
  const cur = p.props[`${NS}:cur`], px = (cur % 4096) * cfg.step - cfg.range, py = Math.floor(cur / 4096) * cfg.step - cfg.range;
  ok(Math.abs(px + 10) < cfg.step && Math.abs(py - 14) < cfg.step && S.fha()[1] === 22 && S.fha()[0] === 22 && (p.props[`${NS}:flg`] & 1) === 1,
    'turning the head (yaw −2.5°, pitch +3.5°, 4 units a degree): the pointer to (−10, 14), over 「ふつう」 — hovered and focused, the pointer shown', JSON.stringify([px, py, S.fha()]));
  for (const f of S.subs.swing) f({ player: p, swingSource: 'Attack' });
  S.tick();
  ok(S.chk(22) === 1 && S.chk(21) === 0, 'a swing (left click, a tap): a click under the pointer');
  p.rot = { x: 50, y: -2.5 }; S.tick();
  ok(out.rot.length === 1 && out.rot[0].x === 0, 'past 45° of pitch the player is turned level (the camera is frozen: nothing seen)');
  const y0 = Math.floor(p.props[`${NS}:cur`] / 4096); S.tick();
  p.rot = { x: -5, y: -2.5 }; S.tick();
  const y1 = Math.floor(p.props[`${NS}:cur`] / 4096);
  ok(Math.abs((y1 - y0) * cfg.step + 20) < cfg.step, 'after the turn-back the pointer goes on from where it was (5° up: 20 units up)', JSON.stringify([y0, y1]));
  for (const f of S.subs.use) f({ source: p }); S.tick();
  ok(S.pg() === 1, 'a use (the right button): back — the page before (あそぶ)');
  const before = out.camera.length;
  S.press('sneak');
  ok(S.pg() === 0 && out.camera.length === before + 1 && out.camera[before][0] === 'clear' && out.hud[out.hud.length - 1][0] === 'reset' && S.last('close'), 'sneak on the first page: closed — the camera and the HUD given back, ghd:on_close');
  ok(out.badProps.length === 0, 'every property the script set is an int in its declared range', out.badProps.slice(0, 5).join(' '));
  out.cmds[`${NS}:open`].cb({ sourceEntity: p }, 'settings'); S.tick(2);
  ok(S.pg() === 3 && S.chk(19) === 0 && S.chk(22) === 1, '/ghd:open settings: that page, the player\'s choices as they left them');
  out.cmds[`${NS}:t`].cb({ sourceEntity: p }, 'hello'); S.tick();
  ok(out.msgs.some((m) => /文字を入れる欄に焦点がありません/.test(m)), '/ghd:t with no text field in focus: says so');
  S.scriptevent(`${NS}:set`, 'score 1234'); S.scriptevent(`${NS}:set`, 'progress 80');
  ok(p.props[`${NS}:n${cfg.dynamic.find((d) => d.kind === 'number').i}`] === 1234 && Math.floor(p.props[`${NS}:vf0`] / 16) % 16 === 8, 'scriptevent ghd:set score 1234 / progress 80: the number and the gauge');
  const sent = out.sent.length;
  S.scriptevent('other:open', '');
  ok(out.sent.length === sent && S.pg() === 3, 'another namespace\'s event is not ours');
  // a player who leaves with it open comes back closed (and the engine forgets the old page)
  for (const f of S.subs.spawn) f({ player: p, initialSpawn: true });
  S.tick(3);
  ok(S.pg() === 0 && out.camera[out.camera.length - 1][0] === 'clear', 'a player who left with the page open: back with it closed, and it stays closed');
  // the body kept still: free (put back each tick)
  S.scriptevent(`${NS}:open`, ''); S.tick();
  p.location = { x: 2.5, y: -60, z: 0.5 }; const tp = out.tp; S.tick();
  ok(out.tp === tp + 1 && p.location.x === 0.5, 'hold free: a body moved while open is put back');
}
{
  const S = harness(R.scriptOf(Object.assign({}, cfg, { hold: 'lock' })));
  S.scriptevent(`${NS}:open`, ''); S.tick(); S.press('sneak');
  ok(JSON.stringify(S.out.perms) === JSON.stringify([[2, false], [2, true]]), 'hold lock: the Movement permission off while open, on again when closed');
  const T = harness(R.scriptOf(Object.assign({}, cfg, { hold: 'speed' })));
  T.scriptevent(`${NS}:open`, ''); T.tick();
  const zero = T.p.speed === 0 && T.p.dyn[`${NS}:speed`] === 0.1;
  for (const f of T.subs.spawn) f({ player: T.p, initialSpawn: true });
  T.tick();
  ok(zero && T.p.speed === 0.1 && !(`${NS}:speed` in T.p.dyn), 'hold speed: the speed 0 while open, kept in the world — a player who left then gets it back when they return');
}

console.log(`\n${fails ? 'FAIL' : 'PASS'} geoui-html-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
