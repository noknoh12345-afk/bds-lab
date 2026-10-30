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
    properties: [{ name: 'show', range: [0, 255], default: 0 }, ...READOUT.map(([k]) => ({ name: k, range: [0, 100000], default: 0 }))],
    pre: [`v.gwp_show = ${R('show')};`, ...READOUT.map(([k]) => `v.gwp_${k} = ${R(k)};`)],
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
// readout <k> <n> · cycle <n> <ticks> <slot> (n different pictures) — every answer is a line GWP … in the server's log
import { world, system, HudElement, HudVisibility } from '@minecraft/server';
import { http, HttpRequest, HttpRequestMethod } from '@minecraft/server-net';
import './screen_channel.js';
const NS = 'gwp', SVC = 'http://127.0.0.1:8787';
const log = (s) => console.warn('GWP ' + s);
let svc = null, stay = 600, mark = 0, seq = 0;
const io = {
  title: (p, t) => p.onScreenDisplay.setTitle(t, { stayDuration: stay, fadeInDuration: 0, fadeOutDuration: 0 }),
  clear: (p) => p.runCommand('title @s clear'),
  prop: (p, k, v) => p.setProperty(k, v),
  hideHud: (p, keep) => { const before = p.onScreenDisplay.getHiddenHudElements(); p.onScreenDisplay.hideAllExcept(keep.map((k) => HudElement[k]).filter((v) => v !== undefined)); return before; },
  restoreHud: (p, before) => { p.onScreenDisplay.resetHudElementsVisibility(); if (before && before.length) p.onScreenDisplay.setHudVisibility(HudVisibility.Hide, before); },
};
const ch = globalThis.GeoUIScreen.channel.create({ ns: NS, slots: ${SLOTS}, width: ${WIDTH}, refreshTicks: 40 }, io);
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
    case 'stay': { stay = Math.max(1, Number(a[0]) || 600); ch.cfg.refreshTicks = Math.max(1, Number(a[1]) || 40); log('STAY ' + stay + ' refresh ' + ch.cfg.refreshTicks); for (const p of players()) { const t = ch.text(p); if (t.trim().length > 6) io.title(p, t); } return; }
    case 'raw': { for (const p of players()) p.onScreenDisplay.setTitle(a.join(' '), { stayDuration: 200, fadeInDuration: 0, fadeOutDuration: 0 }); return; }
    case 'reset': { for (const p of players()) { ch.reset(p); p.setProperty(NS + ':show', 0); } for (const k of [0, 1, 2]) readout(k, 0); stay = 600; ch.cfg.refreshTicks = 40; log('RESET'); return; }
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

## 2 つの枠を一度に・枠 5 は枠 0 と同じ所の下
scriptevent gwp:urls 0=/quad/200x100.png 5=/solid/00ff00/64x64.png
wait 1000
~ @A title: ~gu~0ahttp://\\S+/quad/200x100\\.png +http://\\S+/solid/00ff00/64x64\\.png

## F1: HUD を全部隠し、プロパティで腕と持ち物、ゲームモードはそのまま
gamemode survival A
scriptevent gwp:f1 1
wait 1000
js JSON.stringify([p('A').getProperty('gwp:f1'), p('A').onScreenDisplay.getHiddenHudElements().length, p('A').getGameMode()])
= [1,13,"Survival"]
~ @A title: ~gu~1a
scriptevent gwp:f1 0
wait 1000
js JSON.stringify([p('A').getProperty('gwp:f1'), p('A').onScreenDisplay.getHiddenHudElements().length])
= [0,0]

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

// ---- the real app (the lab's CI device): every number out through measure (the pictures stay sealed)
function appTxt() {
  return `# geoui_web_probe（bds/geoui/web/probe.mjs が作る）: 本物のアプリで、URL の画像が HUD に出るか・どこに・どれだけ速く・F1。
# 予測は SPEC.md 14 章（回す前に書いたもの）。期待の位置: node bds/geoui/web/probe.mjs expect <幅>x<高さ>
# 実行: node lab.mjs app ci -a geoui_web_probe --screen 1080x2400（本物のスマホの解像度）

section join
stop
launch
until title 600000
join
until joined 900000
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

section http
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 0 /solid/ff0000/64x64.png
wait 5000
shot http-red
measure marks http-red
do scriptevent gwp:show 5
wait 2000
shot http-frame
measure marks http-frame

section https-ext
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 1 https://placehold.co/64x64/00ff00/00ff00.png
wait 8000
shot https-green
measure marks https-green

section https-own
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 2 ~/solid/0000ff/64x64.png
wait 10000
shot tunnel-blue
measure marks tunnel-blue

section latency
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:lat 0 /solid/ffff00/64x64.png
until server GWP LAT 25000
wait 200
shot lat-fetch
measure marks lat-fetch
wait 1500
shot lat-later
measure marks lat-later
do scriptevent gwp:show 0
wait 1000
shot readout-lat
measure marks readout-lat

section switch
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 0 /solid/ff0000/64x64.png
wait 5000
do scriptevent gwp:url 0 /solid/0000ff/64x64.png
wait 300
shot sw-300
measure marks sw-300
wait 700
shot sw-1000
measure marks sw-1000
wait 2000
shot sw-3000
measure marks sw-3000

section loading
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 0 /solid/ff0000/64x64.png
wait 5000
do scriptevent gwp:url 0 /slow/8000/solid/0000ff/64x64.png?s=1
wait 3000
shot load-mid
measure marks load-mid
wait 9000
shot load-end
measure marks load-end

section under
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 5 /solid/ff0000/64x64.png
wait 5000
do scriptevent gwp:url 0 /slow/8000/solid/0000ff/64x64.png?s=2
wait 3000
shot under-mid
measure marks under-mid
wait 9000
shot under-end
measure marks under-end

section cache
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:mark
do scriptevent gwp:url 0 /solid/00ffff/64x64.png?k=1
wait 4000
do scriptevent gwp:url 0 /solid/00ff80/64x64.png?k=2
wait 4000
do scriptevent gwp:url 0 /solid/00ffff/64x64.png?k=1
wait 300
shot cache-back
measure marks cache-back
wait 3000
do scriptevent gwp:count /solid/00ffff/64x64.png?k=1
wait 1000
do scriptevent gwp:url 0 -
wait 1500
shot readout-count
measure marks readout-count

section big
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 0 /quad/1280x720.png
wait 6000
shot big-1280
measure marks big-1280
do scriptevent gwp:url 0 /quad/2400x1080.png
wait 6000
shot big-2400
measure marks big-2400
do scriptevent gwp:url 0 /quad/4096x2304.png
wait 8000
shot big-4096
measure marks big-4096
do scriptevent gwp:url 0 /noise/2400x1080.png
wait 10000
shot big-noise
measure diff big-noise

section aspect
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 3 /quad/200x100.png
wait 5000
shot aspect-top
measure marks aspect-top

section cycle
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:cycle 40 6 0
until server GWP CYCLE 60000
wait 1500
shot cycle-end
measure marks cycle-end
do scriptevent gwp:url 0 -
wait 1500
shot readout-cycle
measure marks readout-cycle

section layout
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 4 /solid/ff8000/64x64.png
wait 4000
shot lay-none
measure marks lay-none
do scriptevent gwp:layout b
wait 3000
shot lay-b
measure marks lay-b
measure diff lay-b
do scriptevent gwp:layout c
wait 2000
shot lay-c
measure marks lay-c

section title
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:url 0 /solid/ff0000/64x64.png
wait 4000
shot title-channel
measure diff title-channel 0 0 2400 280
absent text solid
absent text gu~
do scriptevent gwp:reset
wait 1500
do scriptevent gwp:raw HELLO
wait 1200
shot title-raw
expect text HELLO

section persist
do scriptevent gwp:reset
wait 2000
shot world
do scriptevent gwp:stay 20 100000
do scriptevent gwp:url 0 /solid/00ff00/64x64.png
wait 9000
shot persist
measure marks persist

section f1
do scriptevent gwp:reset
do hud @a reset
do replaceitem entity @a slot.weapon.mainhand 0 diamond_sword
do tp @a 0 -60 0 0 60
wait 3000
do scriptevent gwp:f1 1
wait 3000
shot world
do scriptevent gwp:f1 0
wait 3000
shot f1-off
measure diff f1-off
measure diff f1-off 1400 600 2400 1080
do scriptevent gwp:f1 1
wait 3000
shot f1-on
measure diff f1-on
measure diff f1-on 1400 600 2400 1080
do say hello-1
do say hello-2
do title @a actionbar ACTION
wait 1500
shot f1-chat
measure diff f1-chat
do scriptevent gwp:f1 0
wait 2000
`;
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
- \`gwp:f1 1\`: F1（HUD の 13 の部品を API で、残りの HUD（会話・題名など）を通り道の旗で隠し、腕と持ち物はプロパティで大きさ 0）。\`gwp:f1 touch\`: 携帯の操作ボタンは残す。
- \`gwp:layout b\`: 並べ方 b（lay の枠と、画面全体の黒い背景）。\`gwp:lat\`・\`gwp:count\`・\`gwp:cycle\`: サービスが記録した、ゲームが絵を取りに来た時刻と回数（左上の棒の長さにも出る）。

## 人が見ること（携帯・PC で、横向きで）
1. ワールドで \`/scriptevent gwp:url 0 /solid/ff0000/64x64.png\` → 真ん中に赤い四角。\`/scriptevent gwp:show 5\` → 紫の枠の内側にぴったり、白い十字が赤の上。
2. \`/scriptevent gwp:url 1 https://placehold.co/64x64/00ff00/00ff00.png\` → 左に緑。http が出ず https だけ出るなら、その端末は平文の http を取りに行かない。
3. \`/scriptevent gwp:f1 1\` → HUD・会話・手と持ち物が全部消える（ゲームモードはそのまま）。\`/scriptevent gwp:f1 0\` で戻る。
`;

/** every file of the add-on */
export function files() {
  const built = P.build(scene(), { core: G });
  if (built.warnings.length) throw new Error(built.warnings.join('\n'));
  const out = packFiles(built);
  out['tests.txt'] = TESTS;
  out['app.txt'] = appTxt();
  out['TASK.md'] = TASK;
  out['geoui-web.json'] = JSON.stringify({ service: 'bds/geoui/web/server.mjs', tunnel: 'ci' }, null, 2) + '\n';
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
  const { files: F, stats } = files(), check = argv.includes('--check');
  const r = writeUnit(OUT, F, { check });
  if (check) {
    if (!r.ok) { console.error(`bds/addons/${NAME} は probe.mjs が作る物と違います: ${r.bad.join(' ')}\n→ node bds/geoui/web/probe.mjs`); process.exit(1); }
    console.log(`OK bds/addons/${NAME} is what probe.mjs makes`);
  } else console.log(`OK bds/addons/${NAME}: グループ ${stats.groups}・ボーン ${stats.bones}・面 ${stats.planes}・プロパティ ${stats.properties}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
