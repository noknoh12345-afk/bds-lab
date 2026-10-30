#!/usr/bin/env node
// GeoUI Web — the probe: what the real game does with URL images in the HUD and with GeoUI's F1, measured on the real app
// (bds/addons/geoui_web_probe: tests.txt on a real BDS with the lab's players, app.txt in the real Android app; SPEC.md 14 章).
//   node bds/geoui/web/probe.mjs              write bds/addons/geoui_web_probe
//   node bds/geoui/web/probe.mjs --check      write nothing; fail when the add-on is not what this makes
//   node bds/geoui/web/probe.mjs expect <W>x<H>   where each image and mark should be on that screen (px)
// What it asks (each a section of app.txt): does an image the game fetches by URL show in the HUD — over plain http on the LAN
// (the lab's own service, bds/geoui/web/server.mjs), https elsewhere (placehold.co), https of our own (a cloudflared tunnel);
// where it lands (GeoUI's own marks beside it); how soon after the title changes it is fetched and shown; what is shown while the
// next one loads (the old one, nothing, or something else) and under it; whether the same URL is fetched again; how big a picture
// may be and how it is fitted to its box; whether the title channel stays after its title's time, hides the game's own title and
// lets a plain title through; the layouts and their backdrop; F1 (the whole HUD, the chat, the arm and the held item hidden with
// the game mode unchanged).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';
import { writeUnit, packFiles } from './out.mjs';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url)), TOP = path.resolve(HERE, '..', '..', '..');
const G = require('../geoui_builder.js'), L = require('../screen/layout.js'), P = require('../screen/pack.js');
export const NS = 'gwp', NAME = 'geoui_web_probe', OUT = path.join(TOP, 'bds', 'addons', NAME);
// the title's control (5 本目): the same pack with the game's title left alone (titleHide none), its own pack ids
export const CTL_NAME = 'geoui_web_title_ctl', CTL_OUT = path.join(TOP, 'bds', 'addons', CTL_NAME);
export const SLOTS = 6, WIDTH = 160;

// ---- the scene: images (slot: where) and GeoUI's marks (bits of gwp:show)
export const IMAGES = {
  main: { group: 'c', slot: 0, rect: { x: -40, y: -40, w: 80, h: 80 } },
  left: { group: 'l', slot: 1, rect: { x: 8, y: -25, w: 50, h: 50 } },
  right: { group: 'r', slot: 2, rect: { x: -58, y: -25, w: 50, h: 50 } },
  top: { group: 't', slot: 3, rect: { x: -40, y: 6, w: 80, h: 20 } },
  lay: { group: 'lb', slot: 4, rect: { x: -70, y: 48, w: 140, h: 30 } },
  under: { group: 'c', slot: 5, rect: { x: -40, y: -40, w: 80, h: 80 }, layer: -1 },
};
const COLORS = [['violet', [128, 0, 255]], ['white', [255, 255, 255]], ['orange', [255, 128, 0]], ['cyan', [0, 255, 255]], ['rose', [255, 0, 128]], ['spring', [0, 255, 128]]];
const CI = Object.fromEntries(COLORS.map(([n], i) => [n, i]));
export const MARKS = {
  frame: { group: 'c', color: 'violet', bit: 1, rects: [[-44, -44, 88, 1], [-44, 43, 88, 1], [-44, -44, 1, 88], [43, -44, 1, 88]] },
  cross: { group: 'c', color: 'white', bit: 4, rects: [[-6, -1, 12, 2], [-1, -6, 2, 12]] },
  layframe: { group: 'lb', color: 'spring', bit: 0, rects: [[-72, 46, 144, 1], [-72, 79, 144, 1], [-72, 46, 1, 34], [71, 46, 1, 34]] },
};
// the readout: bars at the top-left whose length is a number the script measured (0.1 unit each) — numbers out through the
// screen (measure marks): r0 orange (the first fetch's delay, 10 ms a step), r1 cyan (fetches of one URL, 20 a fetch), r2 rose
export const READOUT = [['r0', 'orange'], ['r1', 'cyan'], ['r2', 'rose']];

export function scene() {
  const groups = [{ id: 'c', anchor: 'center' }, { id: 'l', anchor: 'left_middle' }, { id: 'r', anchor: 'right_middle' }, { id: 't', anchor: 'top_middle' },
    { id: 'lb', anchor: 'center', layout: 'b' }, { id: 'rd', anchor: 'top_left' }];
  const bones = [], planes = [];
  const uv = (c) => [CI[c] + 0.25, 0.25, 0.5, 0.5];
  const bit = (n) => `(math.mod(math.floor(v.gwp_show / ${n}), 2) > 0.5)`;
  for (const [name, m] of Object.entries(MARKS)) {
    bones.push({ name: `gwp_${name}`, group: m.group, ...(m.bit ? { scale: `${bit(m.bit)} ? 1 : 0` } : {}) });
    for (const [x, y, w, h] of m.rects) planes.push({ bone: `gwp_${name}`, texture: 'atlas', rect: { x, y, w, h }, z: 0, uv: uv(m.color) });
  }
  READOUT.forEach(([k, c], i) => {
    bones.push({ name: `gwp_${k}`, group: 'rd', pivot: [0, 0], position: [6, -(6 + 5 * i), 0], scale: [`v.gwp_${k} * 0.1`, '3', '1'] });
    planes.push({ bone: `gwp_${k}`, texture: 'atlas', rect: { x: 0, y: 0, w: 1, h: 1 }, z: 0, uv: uv(c) });
  });
  const atlas = new Uint8Array(16 * 4 * 4);
  COLORS.forEach(([, rgb], i) => { for (let y = 0; y < 4; y++) atlas.set([rgb[0], rgb[1], rgb[2], 255], (y * 16 + i) * 4); });
  const R = (n) => `variable.is_paperdoll ? 0 : q.property('gwp:${n}')`;
  return {
    ns: NS, name: 'GeoUI Web Probe', description: 'GeoUI: URL images and F1 measured on the real game (bds-lab bds/geoui/web/probe.mjs)', seed: 'gwp',
    scale: { mode: 'height', s: 0.1 }, groups,
    textures: [{ id: 'atlas', width: 16, height: 4, png: Buffer.from(encodePng({ width: 16, height: 4, data: atlas })) }],
    bones, planes,
    properties: [{ name: 'show', range: [0, 255], default: 0 }, ...READOUT.map(([k]) => ({ name: k, range: [0, 100000], default: 0 })), { name: 'fx', range: [0, 3], default: 0 }],
    pre: [`v.gwp_show = ${R('show')};`, ...READOUT.map(([k]) => `v.gwp_${k} = ${R(k)};`), `v.gwp_fx = ${R('fx')};`],
    // (the first-person hand, one way at a time (4 本目): fx 1 — the arms and items at scale 0 only; fx 2 — the arms moved down
    //  only; blue wool in the hand — the arm moved down with no property at all (whether a property reaches the first-person
    //  pass). F1 itself (f1: true) does both, in pack.js)
    animations: [
      { name: 'fx_scale', condition: 'v.gwp_fx == 1', bones: { rightarm: { scale: 0 }, leftarm: { scale: 0 }, rightitem: { scale: 0 }, leftitem: { scale: 0 } } },
      { name: 'fx_move', condition: 'v.gwp_fx == 2', bones: { rightarm: { position: [0, -100, 0] }, leftarm: { position: [0, -100, 0] } } },
      { name: 'fx_blue', condition: '1.0', bones: { rightarm: { position: [0, "query.get_equipped_item_name('main_hand') == 'blue_wool' ? -100 : 0", 0] } } },
    ],
    urlImages: Object.entries(IMAGES).map(([id, u]) => Object.assign({ id }, u)),
    channel: { width: WIDTH }, f1: true, backdrop: { layouts: 'b' },
    modules: [{ module_name: '@minecraft/server-net', version: '1.0.0-beta' }],
    script: SCRIPT,
    extraScripts: { 'screen_channel.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'channel.js'), 'utf8') },
  };
}

/** where each image and mark should be on a W x H screen (px; the HUD the whole screen) */
export function expected(W, H) {
  const sc = scene(), gs = Object.fromEntries(L.groupsOf(sc).map((g) => [g.id, g])), out = {};
  for (const [id, u] of Object.entries(IMAGES)) out[`image ${id}`] = L.rectToScreen(gs[u.group], u.rect, W, H, 1);
  for (const [id, m] of Object.entries(MARKS)) {
    const xs = m.rects.flatMap(([x, , w]) => [x, x + w]), ys = m.rects.flatMap(([, y, , h]) => [y, y + h]);
    out[`mark ${id} (${m.color})`] = L.rectToScreen(gs[m.group], { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, W, H, 1);
  }
  out['readout unit (px a value step of 0.1 unit)'] = { x0: 0, y0: 0, x1: L.unitPx(L.modeOf(sc.scale), W, H) * 0.1, y1: 0 };
  return out;
}

// ---- the behaviour pack's script
const SCRIPT = `// GeoUI Web probe (bds-lab: bds/geoui/web/probe.mjs makes this file — change that, not this).
// /scriptevent gwp:<verb> — info · url <slot> <URL | /path (the service's own) | ~/path (through its tunnel) | -> · f1 0|1|touch ·
// layout <letter|-> · show <bits> · stay <ticks> [refresh ticks] · raw <title> · reset · mark · lat <slot> <URL…> · count <URL…> ·
// readout <k> <n> · cycle <n> <ticks> <slot> (n different pictures) · part api|flag|arm|cam 0|1 (F1's parts alone) · fx 0|1|2 (the
// first-person hand one way at a time: 1 scale 0, 2 moved down) ·
// frames <n> <ticks> <buffered 0|1> <ms> (a browser's pictures) — every answer is a line GWP … in the server's log
import { world, system, HudElement, HudVisibility, ControlScheme } from '@minecraft/server';
import { http, HttpRequest, HttpRequestMethod } from '@minecraft/server-net';
import './screen_channel.js';
const NS = 'gwp', SVC = 'http://127.0.0.1:8787';
const log = (s) => console.warn('GWP ' + s);
let svc = null, stay = 0, mark = 0, seq = 0;
const lastYaw = new Map();
const io = {
  // (the channel's title: no time (stay 0: its control ends at once — channel.js), or the old way (stay > 0, 2・3 本目) to compare)
  title: (p, t) => p.onScreenDisplay.setTitle(t, { stayDuration: stay, fadeInDuration: 0, fadeOutDuration: 0 }),
  times: (p) => { if (stay === 0) p.runCommand('title @s times 10 70 20'); },
  prop: (p, k, v) => p.setProperty(k, v),
  hideHud: (p, keep) => { const before = p.onScreenDisplay.getHiddenHudElements(); p.onScreenDisplay.hideAllExcept(keep.map((k) => HudElement[k]).filter((v) => v !== undefined)); return before; },
  restoreHud: (p, before) => { p.onScreenDisplay.resetHudElementsVisibility(); if (before && before.length) p.onScreenDisplay.setHudVisibility(HudVisibility.Hide, before); },
  // (F1's camera (5 本目): the pack's gwp:eye — follow_orbit at the eyes; the player turns with it (LockedPlayerRelativeStrafe, a
  //  scheme follow_orbit takes). Off: the camera cleared, the scheme back to the game's)
  camera: (p, id) => {
    if (id) { p.camera.setCamera(id); try { p.setControlScheme(ControlScheme.LockedPlayerRelativeStrafe); } catch (e) { log('SCHEME ' + e); } }
    else { p.camera.clear(); try { p.setControlScheme(); } catch (e) { log('SCHEME ' + e); } }
    log('CAMERA ' + (id || 'clear'));
  },
};
const ch = globalThis.GeoUIScreen.channel.create({ ns: NS, slots: ${SLOTS}, width: ${WIDTH}, refreshTicks: 0, camera: NS + ':eye' }, io);
const players = () => world.getAllPlayers();
async function getJson(p) {
  const r = await http.request(new HttpRequest(SVC + p).setMethod(HttpRequestMethod.Get).setTimeout(10));
  if (r.status !== 200) throw new Error('HTTP ' + r.status);
  return JSON.parse(r.body);
}
async function info() { try { svc = await getJson('/info'); return svc; } catch (e) { log('INFO FAIL ' + e); return null; } }
/** a URL as given: /path — the service's own (its address for the game), ~/path — through its tunnel, - — none */
async function full(u) {
  if (!u || u === '-') return '';
  if (!svc && (u.startsWith('/') || u.startsWith('~/'))) await info();
  if (u.startsWith('~/')) { if (!svc || !svc.tunnel) { log('NO TUNNEL'); return ''; } return svc.tunnel + u.slice(1); }
  if (u.startsWith('/')) return svc ? svc.public + u : '';
  return u;
}
const readout = (k, v) => { for (const p of players()) { try { p.setProperty(NS + ':r' + k, Math.max(0, Math.min(100000, Math.round(v)))); } catch (e) { log('readout ' + e); } } };
async function hitsSince(t) { const h = await getJson('/hits?since=' + (t - 1)); return h.hits || []; }
async function setUrl(slot, u) { const f = await full(u); for (const p of players()) ch.url(p, slot, f); log('URL slot=' + slot + ' ' + (f || '-')); return f; }
async function verb(v, a) {
  switch (v) {
    case 'rot': {
      // (5 本目: whether the player still turns with the look while F1's camera is on — the rotation now, and TURNED when it moved
      //  more than 20° since the last rot)
      for (const p of players()) { const r = p.getRotation(), y0 = lastYaw.get(p.id); lastYaw.set(p.id, r.y); const d = y0 === undefined ? 0 : Math.abs(((r.y - y0 + 540) % 360) - 180); log('ROT y=' + r.y.toFixed(1) + ' x=' + r.x.toFixed(1) + ' d=' + d.toFixed(1)); if (d > 20) log('TURNED ' + d.toFixed(1)); }
      return;
    }
    case 'info': {
      const i = await info();
      if (i) log('INFO public=' + i.public + ' tunnel=' + (i.tunnel || '-') + ' fonts=' + i.fonts + ' version=' + i.version);
      log('CHECK svc ' + (i ? 'PASS' : 'FAIL'));
      return;
    }
    case 'url': return void await setUrl(Number(a[0]) || 0, a[1]);
    case 'urls': { const list = {}; for (const w of a) { const m = /^(\\d)=(.*)$/.exec(w); if (m) list[m[1]] = await full(m[2]); } for (const p of players()) ch.urls(p, list); log('URLS ' + JSON.stringify(list)); return; }
    case 'f1': { for (const p of players()) ch.f1(p, a[0] !== '0', a[0] === 'touch' ? { keep: ['TouchControls'] } : undefined); log('F1 ' + a[0]); return; }
    case 'layout': { for (const p of players()) ch.layout(p, a[0] && a[0] !== '-' ? a[0] : ''); log('LAYOUT ' + (a[0] || '-')); return; }
    case 'show': { for (const p of players()) p.setProperty(NS + ':show', Number(a[0]) || 0); return; }
    case 'fx': { for (const p of players()) p.setProperty(NS + ':fx', Math.max(0, Math.min(3, Number(a[0]) || 0))); log('FX ' + (a[0] || 0)); return; }
    case 'stay': { stay = Math.max(0, Number(a[0]) || 0); ch.cfg.refreshTicks = Math.max(0, Number(a[1]) || 0); log('STAY ' + stay + ' refresh ' + ch.cfg.refreshTicks); for (const p of players()) { const t = ch.text(p); if (t.trim().length > 6) io.title(p, t); } return; }
    case 'raw': { for (const p of players()) p.onScreenDisplay.setTitle(a.join(' '), { stayDuration: 200, fadeInDuration: 0, fadeOutDuration: 0 }); return; }
    case 'reset': { for (const p of players()) { ch.reset(p); p.setProperty(NS + ':show', 0); } for (const k of [0, 1, 2]) readout(k, 0); stay = 0; ch.cfg.refreshTicks = 0; log('RESET'); return; }
    case 'mark': { mark = Date.now(); for (const k of [0, 1, 2]) readout(k, 0); log('MARK'); return; }
    case 'readout': return void readout(Number(a[0]) || 0, Number(a[1]) || 0);
    case 'lat': {
      // (the time from the title's change to the game's fetch of that picture: the service writes down each fetch)
      const slot = Number(a[0]) || 0, f = (await full(a[1])) + ((a[1] || '').includes('?') ? '&' : '?') + 'lat=' + (++seq), want = f.replace(/^https?:\\/\\/[^/]+/, '');
      const t0 = Date.now();
      for (const p of players()) ch.url(p, slot, f);
      for (let i = 0; i < 100; i++) {
        await system.waitTicks(4);
        let hit = null;
        try { hit = (await hitsSince(t0)).find((h) => h.path === want); } catch (e) { log('hits ' + e); }
        if (hit) { const ms = hit.t - t0; readout(0, ms / 10); log('LAT ms=' + ms + ' path=' + want); log('CHECK lat ' + (ms < 3000 ? 'PASS' : 'FAIL') + ' ms=' + ms); return; }
      }
      readout(0, 0); log('LAT timeout path=' + want); log('CHECK lat FAIL timeout');
      return;
    }
    case 'count': {
      const f = await full(a[0]), want = f.replace(/^https?:\\/\\/[^/]+/, '');
      let n = -1;
      try { n = (await hitsSince(mark)).filter((h) => h.path === want).length; } catch (e) { log('hits ' + e); }
      readout(1, n * 20); log('COUNT n=' + n + ' path=' + want);
      return;
    }
    case 'cycle': {
      const n = Math.max(1, Math.min(200, Number(a[0]) || 10)), every = Math.max(1, Number(a[1]) || 10), slot = Number(a[2]) || 0, t0 = Date.now();
      const HUES = ['ff0000', 'ff8000', 'ffff00', '80ff00', '00ff00', '00ff80', '00ffff', '0080ff', '0000ff', '8000ff', 'ff0080'];
      for (let i = 0; i < n; i++) { await setUrl(slot, '/solid/' + HUES[i % HUES.length] + '/64x64.png?cyc=' + (++seq)); await system.waitTicks(every); }
      let got = -1;
      try { got = (await hitsSince(t0)).filter((h) => h.path.includes('cyc=')).length; } catch (e) { log('hits ' + e); }
      readout(2, got * 10); log('CYCLE n=' + n + ' fetched=' + got);
      return;
    }
    case 'part': {
      // (F1's three parts one at a time: api — the HUD's elements; flag — the channel's F1 flag (root_panel); arm — the property)
      const on = a[1] === '1';
      for (const p of players()) {
        if (a[0] === 'api') { if (on) p.onScreenDisplay.hideAllExcept([]); else p.onScreenDisplay.resetHudElementsVisibility(); }
        else if (a[0] === 'flag') io.title(p, on ? '~gu~1a' : '~gu~0a');
        else if (a[0] === 'arm') p.setProperty(NS + ':f1', on ? 1 : 0);
        else if (a[0] === 'cam') io.camera(p, on ? NS + ':eye' : null);
      }
      log('PART ' + a.join(' '));
      return;
    }
    case 'frames': {
      // (a browser's pictures: n new ones, one every few ticks, each fetched slowly (ms) — with the two layers (the shown one put
      //  under, the new one on top two ticks later) or without)
      const n = Math.max(1, Math.min(200, Number(a[0]) || 20)), every = Math.max(1, Number(a[1]) || 5), buffered = a[2] !== '0', ms = Math.max(0, Number(a[3]) || 0);
      const HUES = ['ff0000', 'ff8000', 'ffff00', '80ff00', '00ff00', '00ff80', '00ffff', '0080ff', '0000ff', '8000ff', 'ff0080'];
      let shown = '';
      for (let i = 0; i < n; i++) {
        const u = await full((ms ? '/slow/' + ms : '') + '/solid/' + HUES[i % HUES.length] + '/64x64.png?fr=' + (++seq));
        if (buffered && shown) { for (const p of players()) ch.url(p, 5, shown); await system.waitTicks(2); }
        for (const p of players()) ch.url(p, 0, u);
        shown = u;
        await system.waitTicks(Math.max(1, every - (buffered ? 2 : 0)));
      }
      log('FRAMES n=' + n + ' buffered=' + buffered + ' ms=' + ms);
      return;
    }
    default: log('unknown verb ' + v);
  }
}
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const v = e.id.slice(NS.length + 1), a = String(e.message || '').trim().split(/\\s+/).filter(Boolean);
  verb(v, a).catch((x) => log('ERROR ' + v + ' ' + x));
}, { namespaces: [NS] });
system.runInterval(() => ch.tick(system.currentTick), 1);
world.afterEvents.playerLeave.subscribe((e) => ch.drop({ id: e.playerId }));
`;

// ---- the lab's tests on a real BDS (its players see titles, not pictures: the channel's text, F1's state, the service's answers)
const TESTS = `# geoui_web_probe（bds/geoui/web/probe.mjs が作る）: URL の画像と F1 の、サーバーの側。絵は app.txt（本物のアプリ）。
# サービス（bds/geoui/web/server.mjs）はラボが BDS の横に起こす（geoui-web.json）。

## サービスに届く（@minecraft/server-net）
scriptevent gwp:info
wait 1500
~ GWP INFO public=http://\\S+ tunnel=\\S+ fonts=
~ GWP CHECK svc PASS

## URL を送ると、題名の通り道の決まった枠に入る（プレイヤーが見る題名）
@A join
wait 1500
scriptevent gwp:url 0 /solid/ff0000/64x64.png
wait 1000
~ GWP URL slot=0 http://\\S+/solid/ff0000/64x64.png
~ @A title: ~gu~0ahttp://\\S+/solid/ff0000/64x64\\.png

## 通り道の題名は時間なし（その題名はすぐ終わる）、2 tick 後にゲームの題名の時間（10・70・20）を戻す: 時間を付けない普通の題名のため
@A watch set_title
scriptevent gwp:url 3 /solid/0000ff/64x64.png
wait 1000
@A watch off
~ @A saw set_title \{"type":"set_durations","text":"","fade_in_time":0,"stay_time":0,"fade_out_time":0
~ @A saw set_title \{"type":"set_title","text":"~gu~0ahttp
~ @A saw set_title \{"type":"set_durations","text":"","fade_in_time":10,"stay_time":70,"fade_out_time":20
scriptevent gwp:url 3 -

## 2 つの枠を一度に・枠 5 は枠 0 と同じ所の下
scriptevent gwp:urls 0=/quad/200x100.png 5=/solid/00ff00/64x64.png
wait 1000
~ @A title: ~gu~0ahttp://\\S+/quad/200x100\\.png +http://\\S+/solid/00ff00/64x64\\.png

## F1: HUD を全部隠し、プロパティで腕と持ち物、カメラ gwp:eye（目の所の 3 人称: 1 人称の持ち物を描かない）、ゲームモードはそのまま
gamemode survival A
scriptevent gwp:f1 1
wait 1000
~ GWP CAMERA gwp:eye
!~ GWP SCHEME
js JSON.stringify([p('A').getProperty('gwp:f1'), p('A').onScreenDisplay.getHiddenHudElements().length, p('A').getGameMode()])
= [1,13,"Survival"]
~ @A title: ~gu~1a
scriptevent gwp:f1 0
wait 1000
~ GWP CAMERA clear
!~ GWP SCHEME
js JSON.stringify([p('A').getProperty('gwp:f1'), p('A').onScreenDisplay.getHiddenHudElements().length])
= [0,0]

## カメラだけ（part cam）と、向きの読み（rot）
scriptevent gwp:part cam 1
wait 500
scriptevent gwp:rot
tp A 0 -60 0 90 0
wait 500
scriptevent gwp:rot
scriptevent gwp:part cam 0
wait 500
~ GWP CAMERA gwp:eye
~ GWP ROT y=
~ GWP TURNED
~ GWP CAMERA clear
!~ GWP SCHEME

## F1 でも携帯の操作ボタンは残せる（touch）
scriptevent gwp:f1 touch
wait 1000
js JSON.stringify([p('A').getProperty('gwp:f1'), p('A').onScreenDisplay.getHiddenHudElements().length, p('A').onScreenDisplay.isForcedHidden(3)])
= [1,12,false]
scriptevent gwp:f1 0

## 並べ方（layout）の文字
scriptevent gwp:layout b
wait 1000
~ @A title: ~gu~0b

## reset: 全部戻り、題名も消える
scriptevent gwp:reset
wait 1000
~ GWP RESET
js JSON.stringify([p('A').getProperty('gwp:f1'), p('A').onScreenDisplay.getHiddenHudElements().length, p('A').getProperty('gwp:show')])
= [0,0,0]

## 数を画面に（readout）
scriptevent gwp:readout 2 1234
wait 500
js p('A').getProperty('gwp:r2')
= 1234

## 何枚も変える（cycle）: プレイヤーが取りに来ないので取りに来た数は 0
scriptevent gwp:cycle 5 2 0
wait 2500
~ GWP CYCLE n=5 fetched=0
`;

const JOIN = `section join
stop
launch
until title 600000
join
until joined 900000
size 2400x1080
wait 9000
do tp @a 0 -60 0 0 90
do hud @a hide crosshair
do hud @a hide health
do hud @a hide hunger
do hud @a hide armor
do hud @a hide progress_bar
do hud @a hide air_bubbles
do hud @a hide status_effects
do hud @a hide item_text
do hud @a hide tooltips
do hud @a hide paperdoll
do hud @a hide touch_controls
do hud @a hide hotbar
do scriptevent gwp:info
wait 6000
expect server GWP CHECK svc PASS
absent clientlog \\bERROR\\b
`;
// (the title section, the same in the probe and the control: a vanilla title before anything of the channel (title-first), the
//  channel's title, then plain and API titles after it)
const TITLE = `section title
do scriptevent gwp:reset
do title @a times 10 70 20
wait 2000
shot world
do title @a title HELLO
wait 1500
shot title-first
measure diff title-first 900 300 1500 700
wait 6000
shot world
do scriptevent gwp:url 1 /solid/00ff00/64x64.png
wait 3000
shot title-chan
measure diff title-chan 900 300 1500 700
do title @a title HELLO
wait 1500
shot title-plain
measure diff title-plain 900 300 1500 700
wait 6000
do scriptevent gwp:raw HELLO
wait 1500
shot title-api
measure diff title-api 900 300 1500 700
do scriptevent gwp:reset
do title @a reset
wait 2000
`;

// ---- the real app (the lab's CI device): every number out through measure (the pictures stay sealed)
function appTxt() {
  // (5 本目: 4 本目（run 41008713796）で残ったこと — 普通の題名（hud_title_text に触らず、root_panel の hud_title_text_area を置き換える。
  //  対照は geoui_web_title_ctl: 題名を隠さない同じパック）・F1 の持ち物（ボーンでは動かない: カメラ gwp:eye で 1 人称を止める）)
  return `# geoui_web_probe（bds/geoui/web/probe.mjs が作る）: 本物のアプリで、URL の画像と F1 を測る（5 本目）。
# 1〜4 本目（run 40998593826・41001422618・41004077706・41008713796）の結果と手順は bds/geoui/rules-history/。予測は SPEC.md 17 章（回す前に書いたもの）。
# 実行: node lab.mjs app ci --batch geoui_web_title_ctl,geoui_web_probe,geoui_web（参加したらゲームの画面を 2400x1080 = 本物の 20:9 のスマホの解像度に）

${JOIN}
${TITLE}
section f1-hand
do scriptevent gwp:reset
do hud @a reset
do hud @a hide hotbar
do hud @a hide touch_controls
do hud @a hide crosshair
do hud @a hide item_text
do replaceitem entity @a slot.weapon.mainhand 0 air
do tp @a 0 -60 0 0 30
wait 4000
shot world
do replaceitem entity @a slot.weapon.mainhand 0 red_wool
wait 3000
shot wool-shown
measure marks wool-shown 1600 600 2400 1080
do scriptevent gwp:part cam 1
wait 3000
shot wool-cam
measure marks wool-cam 1600 600 2400 1080
measure diff wool-cam
do scriptevent gwp:part cam 0
wait 3000
shot wool-cam-off
measure marks wool-cam-off 1600 600 2400 1080
do replaceitem entity @a slot.weapon.mainhand 0 air
wait 3000
shot hand-empty
measure diff hand-empty 1600 600 2400 1080
do scriptevent gwp:f1 1
wait 3000
shot hand-f1
measure diff hand-f1 1600 600 2400 1080
do replaceitem entity @a slot.weapon.mainhand 0 red_wool
wait 3000
shot wool-f1
measure marks wool-f1 1600 600 2400 1080
measure diff wool-f1
do scriptevent gwp:f1 0
wait 3000
shot wool-f1-off
measure marks wool-f1-off 1600 600 2400 1080
do replaceitem entity @a slot.weapon.mainhand 0 air

section f1-look
do scriptevent gwp:reset
do tp @a 0 -60 0 0 30
do scriptevent gwp:f1 1
wait 3000
do scriptevent gwp:rot
wait 500
shot world
look right 600 60
wait 2000
shot cam-look
measure diff cam-look
do scriptevent gwp:rot
until server GWP TURNED 5000
do scriptevent gwp:f1 0
wait 3000

section f1-chat
do scriptevent gwp:reset
do hud @a reset
wait 2000
do scriptevent gwp:f1 1
wait 3000
shot world
do say chat-in-f1-one
do say chat-in-f1-two
do title @a actionbar ACTIONBAR-IN-F1
wait 1500
shot f1-chat
measure diff f1-chat
measure diff f1-chat 0 0 1200 500
do scriptevent gwp:f1 0
wait 3000
shot f1-off
measure diff f1-off
measure diff f1-off 700 940 1700 1080
`;
}

/** the control's app.txt: the same pack with the game's title left alone (titleHide none) — is a title seen at all by the lab */
function ctlAppTxt() {
  return `# geoui_web_title_ctl（bds/geoui/web/probe.mjs が作る）: 題名の対照（5 本目）。geoui_web_probe と同じパックで、ゲームの題名を隠さない
# （titleHide: none）。ここで HELLO が写るなら、写らないのは題名の隠し方のせい。写らないなら、このラボ・この写し方のせい。
# 実行: node lab.mjs app ci --batch geoui_web_title_ctl,geoui_web_probe,geoui_web

${JOIN}
${TITLE}`;
}

const TASK = `# geoui_web_probe — URL の画像と F1 を本物のゲームで測る

## Request
URL の画像（profile_image_renderer の {"type":7,"url":…}）を GeoUI に組み込み、F1（HUD・腕・持ち物を全部消す、ゲームモードは変えない）を作る前に、
本物のアプリで何が起きるかを測る（bds/geoui/SPEC.md 14 章）。作り方: \`node bds/geoui/web/probe.mjs\`（このフォルダはそれが書く。手で直さない）。

## What it is
- HUD に URL の画像の枠が 6 つ: main（真ん中 80 x 80 単位・枠 0）・left（左 50 x 50・枠 1）・right（右・枠 2）・top（上 80 x 20・枠 3）・
  lay（並べ方 b のときだけ・枠 4）・under（main の下に重なる・枠 5）。高さに合わせる大きさ（画面の高さ = 170.67 単位）。
- \`/scriptevent gwp:url <枠> <URL>\`: その枠に絵を出す。\`/path\` はラボのサービス（bds/geoui/web/server.mjs）の絵（/solid/rrggbb/WxH.png・/quad/WxH.png・
  /noise/WxH.png・/slow/<ミリ秒>/…）、\`~/path\` はそのトンネル（https）、\`-\` で消す。題名（タイトル）の通り道で送る（layout.js・channel.js）。
- \`gwp:show 1\` = main の外の紫の枠（GeoUI の印: 絵がその中にぴったり入るか）、\`gwp:show 4\` = 真ん中の白い十字（絵の上に GeoUI が描かれるか）。
- \`gwp:f1 1\`: F1（HUD の 13 の部品を API で、残りの HUD（会話・題名など）を通り道の旗で隠し、空の手の腕はプロパティ（render controller）で、持ち物はカメラ \`gwp:eye\`（目の所の 3 人称: 1 人称を描かない）で消す）。\`gwp:f1 touch\`: 携帯の操作ボタンは残す。\`gwp:part cam 1\`: カメラだけ。\`gwp:rot\`: 向き（20° より回ったら TURNED）。
- \`gwp:fx 1\`・\`gwp:fx 2\`: 1 人称の手の消し方を 1 つずつ（1: 大きさ 0 だけ、2: 下へ動かすだけ）。青い羊毛を持つと、プロパティなしで腕が下へ（4 本目の実験）。
- \`gwp:layout b\`: 並べ方 b（lay の枠と、画面全体の黒い背景）。\`gwp:lat\`・\`gwp:count\`・\`gwp:cycle\`: サービスが記録した、ゲームが絵を取りに来た時刻と回数（左上の棒の長さにも出る）。

## 人が見ること（携帯・PC で、横向きで）
1. ワールドで \`/scriptevent gwp:url 0 /solid/ff0000/64x64.png\` → 真ん中に赤い四角。\`/scriptevent gwp:show 5\` → 紫の枠の内側にぴったり、白い十字が赤の上。
2. \`/scriptevent gwp:url 1 https://placehold.co/64x64/00ff00/00ff00.png\` → 左に緑。http が出ず https だけ出るなら、その端末は平文の http を取りに行かない。
3. \`/scriptevent gwp:f1 1\` → HUD・会話・手と持ち物が全部消える（ゲームモードはそのまま）。\`/scriptevent gwp:f1 0\` で戻る。
`;

/** the control's scene: the probe's, with the game's title left alone and its own name and pack ids */
export function ctlScene() {
  return Object.assign(scene(), { titleHide: 'none', name: 'GeoUI Web Title Control', seed: 'gwp-title-ctl',
    description: 'GeoUI: the title control — the probe with the game title left alone (bds-lab bds/geoui/web/probe.mjs)' });
}
const CTL_TASK = `# geoui_web_title_ctl — 題名の対照（GeoUI の 5 本目）

## Request
geoui_web_probe で普通の題名（\`/title @a title HELLO\`）がどのやり方でも写らなかった（bds/geoui/RULES.md R10.14）。同じパックでゲームの題名を
隠さない物（titleHide: none）を本物のアプリで回し、HELLO が写るかを見る。作り方: \`node bds/geoui/web/probe.mjs\`（このフォルダはそれが書く。手で直さない）。

## What it is
- geoui_web_probe と同じ（URL の画像・F1・\`/scriptevent gwp:…\`）。違いはゲームの題名を隠さないことだけ: 通り道の題名（\`~gu~…\`）も画面に文字で出る。
- 写るなら原因は題名の隠し方（probe は 5 本目から hud_title_text_area の置き換え）、写らないならラボ・写し方の側。
`;

/** every file of the control add-on */
export function ctlFiles() {
  const built = P.build(ctlScene(), { core: G });
  if (built.warnings.length) throw new Error(built.warnings.join('\n'));
  const out = packFiles(built);
  out['tests.txt'] = TESTS;
  out['app.txt'] = ctlAppTxt();
  out['TASK.md'] = CTL_TASK;
  out['geoui-web.json'] = JSON.stringify({ service: 'bds/geoui/web/server.mjs', tunnel: 'app' }, null, 2) + '\n';
  out['imported.json'] = JSON.stringify({ from: 'bds/geoui/web/probe.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: '題名の対照: probe と同じパックでゲームの題名を隠さない' }, null, 2) + '\n';
  return { files: out, stats: built.stats };
}

/** every file of the add-on */
export function files() {
  const built = P.build(scene(), { core: G });
  if (built.warnings.length) throw new Error(built.warnings.join('\n'));
  const out = packFiles(built);
  out['tests.txt'] = TESTS;
  out['app.txt'] = appTxt();
  out['TASK.md'] = TASK;
  out['geoui-web.json'] = JSON.stringify({ service: 'bds/geoui/web/server.mjs', tunnel: 'app' }, null, 2) + '\n';
  out['imported.json'] = JSON.stringify({ from: 'bds/geoui/web/probe.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: 'URL の画像（profile_image_renderer）と F1 を本物のゲームで測る' }, null, 2) + '\n';
  return { files: out, stats: built.stats };
}

function main(argv) {
  if (argv[0] === 'expect') {
    const m = /^(\d+)x(\d+)$/.exec(argv[1] || '');
    if (!m) { console.error('node bds/geoui/web/probe.mjs expect <幅>x<高さ>'); process.exit(2); }
    for (const [k, b] of Object.entries(expected(Number(m[1]), Number(m[2])))) console.log(`${k.padEnd(44)} (${b.x0.toFixed(1)}, ${b.y0.toFixed(1)})–(${b.x1.toFixed(1)}, ${b.y1.toFixed(1)})`);
    return;
  }
  const check = argv.includes('--check');
  let bad = false;
  for (const [name, out, make] of [[NAME, OUT, files], [CTL_NAME, CTL_OUT, ctlFiles]]) {
    const { files: F, stats } = make(), r = writeUnit(out, F, { check });
    if (check) {
      if (!r.ok) { console.error(`bds/addons/${name} は probe.mjs が作る物と違います: ${r.bad.join(' ')}\n→ node bds/geoui/web/probe.mjs`); bad = true; }
      else console.log(`OK bds/addons/${name} is what probe.mjs makes`);
    } else console.log(`OK bds/addons/${name}: グループ ${stats.groups}・ボーン ${stats.bones}・面 ${stats.planes}・プロパティ ${stats.properties}`);
  }
  if (bad) process.exit(1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
