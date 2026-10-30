#!/usr/bin/env node
// GeoUI Web — the add-on: the web in the game (bds/addons/geoui_web). A browser per player (the service: server.mjs + engine.mjs,
// started by the lab beside the BDS: geoui-web.json), shown full-screen in F1 with the game mode unchanged: the page and its
// toolbar are URL images (layout.js) carried by the title channel (channel.js), the pointer is GeoUI's own (a bone the head's
// turns move), one layout a screen shape (16:9 … 32:9: a contain box each, the one shown chosen by the channel's letter) over the
// game's black. The behaviour pack's script: runtime.js.
//   node bds/geoui/web/make.mjs              write bds/addons/geoui_web
//   node bds/geoui/web/make.mjs --check      write nothing; fail when the add-on is not what this makes
//   node bds/geoui/web/make.mjs expect <W>x<H> [layout]   where the page, the toolbar and the pointer should be on that screen (px)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';
import { writeUnit, packFiles } from './out.mjs';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url)), TOP = path.resolve(HERE, '..', '..', '..');
const G = require('../geoui_builder.js'), L = require('../screen/layout.js'), P = require('../screen/pack.js'), R = require('./runtime.js');
export const NS = 'gweb', NAME = 'geoui_web', OUT = path.join(TOP, 'bds', 'addons', NAME);
// the WebSocket edition: the same pack with no @minecraft/server-net — the service reached through the player's own /connect (any
// world: a phone's, a PC's, a Realm, any server; mcws.mjs)
export const WS_NAME = 'geoui_web_ws', WS_OUT = path.join(TOP, 'bds', 'addons', WS_NAME);
const DESIGN_H = 720, G_UNITS = 0.25, BAR = 0.1;

// the screen shapes. Exact first: 'z' (FILL) — the page and the toolbar laid out by JSON UI's own % of the screen (every aspect
// ratio, cut-out and safe area exactly: layout.js fillImages), the pointer in a renderer that follows the screen's height and is put
// across by the screen's shape (the property <ns>:asp) — once the shape is known: measured by the game itself when the browser opens
// (the aspect probe: which tiny URL images the game fetches), or /web:size <W>x<H> | <W>:<H>, or /web:fit (the pointer's tip on the
// screen's edge). Until then the nearest of 24 boxes (a letter of the title channel each: the common shapes exactly — 16:9 4:3 16:10
// 18:9 19.5:9 20:9 21:9 32:9 1:1 5:4 3:2 5:3 3:4 64:27, iPad Pro 11, the folds' inner screens — and the gaps on a log scale), the rest
// the game's black (the backdrop, R10.19)
export const FILL = 'z';
export const LAYOUTS = {
  b: { name: '16:9', aspect: 16 / 9 }, c: { name: '4:3', aspect: 4 / 3 }, d: { name: '16:10', aspect: 16 / 10 }, e: { name: '18:9', aspect: 2 },
  f: { name: '19.5:9', aspect: 19.5 / 9 }, g: { name: '20:9', aspect: 20 / 9 }, h: { name: '21:9', aspect: 21 / 9 }, i: { name: '32:9', aspect: 32 / 9 },
  j: { name: '1:1', aspect: 1 }, k: { name: '5:4', aspect: 5 / 4 }, l: { name: '3:2', aspect: 3 / 2 }, m: { name: '5:3', aspect: 5 / 3 },
  n: { name: '3:4', aspect: 3 / 4 }, o: { name: '64:27', aspect: 64 / 27 }, p: { name: 'iPad Pro 11', aspect: 2388 / 1668 }, q: { name: '折りたたみ（内側）', aspect: 2208 / 1840 },
  r: { name: '3.21', aspect: 3.213 }, s: { name: '0.87', aspect: 0.866 }, t: { name: '0.93', aspect: 0.931 }, u: { name: '1.10', aspect: 1.095 },
  v: { name: '1.89', aspect: 1.886 }, w: { name: '2.49', aspect: 2.494 }, x: { name: '2.62', aspect: 2.623 }, y: { name: '2.90', aspect: 2.903 },
  [FILL]: { name: 'ぴったり', fill: true },
};
// the common screens' shapes: one inside the probe's step is taken as the screen's exactly (1:1 5:4 6:5 4:3 iPad Pro 11 3:2 16:10
// 5:3 16:9 1.85 2:1 18.5:9 19:9 19.5:9 20:9 21:9 3440x1440 64:27 32:9 — never two in one step)
export const COMMON_ASPECTS = [1, 5 / 4, 6 / 5, 4 / 3, 2388 / 1668, 3 / 2, 16 / 10, 5 / 3, 16 / 9, 1.85, 2, 18.5 / 9, 19 / 9, 19.5 / 9, 20 / 9, 21 / 9, 3440 / 1440, 64 / 27, 32 / 9];
// the aspect probe's shapes: 160 on a log scale from 0.56 to 4 (neighbours 1.24 % apart: the shape to ±0.62 %)
export const PROBE_ASPECTS = Array.from({ length: 160 }, (_, k) => Math.round(0.56 * Math.pow(4 / 0.56, k / 159) * 1e5) / 1e5);
export function config() {
  const layouts = {};
  for (const [k, l] of Object.entries(LAYOUTS)) {
    if (l.fill) { layouts[k] = { name: l.name, fill: true, Bh: DESIGN_H * G_UNITS }; continue; }
    const Dw = Math.round(DESIGN_H * l.aspect); layouts[k] = { name: l.name, aspect: l.aspect, Dw, Bw: Dw * G_UNITS, Bh: DESIGN_H * G_UNITS };
  }
  return {
    ns: NS, cmd: 'web', layouts, fill: FILL, barFrac: BAR, slots: { page: 0, bar: 1, pageUnder: 2, barUnder: 3, asp: 4 }, slotCount: 5, width: 160, buffer: true, bufferTicks: 2, frameTicks: 14, refreshTicks: 200,
    // (the screen's shape: measured when the browser opens and none is known (autoAspect) — the probes shown detectTicks, then the
    //  service asked which the game fetched; fitW: the widest shape the pointer may reach while the edges are being marked)
    aspects: PROBE_ASPECTS, commonAspects: COMMON_ASPECTS, autoAspect: true, detectTicks: 100, fitW: 4.5,
    sens: 4, wheelPx: 120, scrollPx: 90, scrollEvery: 3, holdClose: 30, moveEvery: 3, res: 1080, maxRes: 1440,
    service: 'http://127.0.0.1:8787', public: 'lan', mobileLayout: 'g', defaultLayout: 'b',
    // (F1's camera (<ns>:eye) off while the browser is open: with it on, the pad's RT click never reached the page — run
    //  41015216177 (5 本目): click・back・type・close timed out; 6 本目 without it all passed. /web:f1 (F1 alone) uses it: the held
    //  item gone, R10.17)
    f1Camera: false,
  };
}

// ---- the pictures GeoUI draws itself: the pointer (an arrow, white with a dark rim, a marker at its tip for the checks) and the
//      ring of a click
function atlasPng() {
  const W = 64, H = 64, d = new Uint8Array(W * H * 4);
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) d.set(c, (y * W + x) * 4); };
  const rows = ['X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWWWWX', 'XWWWWWWWX', 'XWWWWWWWWX', 'XWWWWWXXXXX', 'XWWXWWX', 'XWX XWWX', 'XX  XWWX', 'X    XWWX', '     XWWX', '      XX'];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === ' ') return; const c = ch === 'W' ? [255, 255, 255, 255] : [24, 24, 32, 255]; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(x * 2 + i, y * 2 + j, c); }));
  // the ring (32, 0)–(56, 24): a circle 2 px wide, yellow
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const r = Math.hypot(x + 0.5 - 12, y + 0.5 - 12); if (r >= 9 && r <= 11.5) put(32 + x, y, [255, 214, 0, 255]); }
  // the tip marker (0, 40)–(8, 48): rose, for `measure marks` (shown with the debug bit only)
  for (let y = 40; y < 48; y++) for (let x = 0; x < 8; x++) put(x, y, [255, 0, 128, 255]);
  return Buffer.from(encodePng({ width: W, height: H, data: d }));
}

export function scene(o = {}) {
  const ws = o.transport === 'ws', CFG = config(), groups = [], bones = [], planes = [], urlImages = [];
  const flag = (n) => `(math.mod(math.floor(v.gweb_flg / ${n}), 2) > 0.5)`;
  const fillImages = [];
  for (const [k, l] of Object.entries(CFG.layouts)) {
    if (l.fill) {
      // (exact: a renderer that follows the screen's height — l.Bh units high, like the boxes — the pointer put across by the screen's
      //  shape (v.gweb_asp = the shape x 1000); the page and the toolbar by JSON UI's own %: every aspect ratio exactly)
      const id = `l_${k}`, Bh = l.Bh;
      groups.push({ id, anchor: 'center', layout: k, scale: { mode: 'height', s: 1 / (L.K * Bh) } });
      const pos = [`(v.gweb_px - 0.5) * v.gweb_asp * ${Bh / 1000}`, `${Bh / 2} - v.gweb_py * ${Bh}`, '0'];
      bones.push({ name: `gweb_ptr_${k}`, group: id, pivot: [0, 0], position: pos, scale: `${flag(1)} ? 1 : 0` });
      planes.push({ bone: `gweb_ptr_${k}`, texture: 'atlas', rect: { x: 0, y: 0, w: 3.6, h: 5.6 }, z: -1, uv: [0, 0, 22, 34] });
      bones.push({ name: `gweb_ring_${k}`, group: id, pivot: [0, 0], position: pos, scale: `(${flag(1)} && (${flag(2)} || ${flag(4)})) ? 1 : 0` });
      planes.push({ bone: `gweb_ring_${k}`, texture: 'atlas', rect: { x: -2.5, y: -2.5, w: 5, h: 5 }, z: -0.5, uv: [32, 0, 24, 24] });
      bones.push({ name: `gweb_tip_${k}`, group: id, pivot: [0, 0], position: pos, scale: `(${flag(1)} && ${flag(8)}) ? 1 : 0` });
      planes.push({ bone: `gweb_tip_${k}`, texture: 'atlas', rect: { x: -0.6, y: -0.6, w: 1.2, h: 1.2 }, z: -1.5, uv: [1, 41, 6, 6] });
      fillImages.push({ id: `${k}_page`, slot: CFG.slots.page, layout: k, anchor: 'bottom_middle', w: 1, h: 1 - BAR }, { id: `${k}_bar`, slot: CFG.slots.bar, layout: k, anchor: 'top_middle', w: 1, h: BAR },
        { id: `${k}_pu`, slot: CFG.slots.pageUnder, layout: k, anchor: 'bottom_middle', w: 1, h: 1 - BAR, layer: -1 }, { id: `${k}_bu`, slot: CFG.slots.barUnder, layout: k, anchor: 'top_middle', w: 1, h: BAR, layer: -1 });
      continue;
    }
    const id = `l_${k}`, barU = l.Bh * BAR;
    groups.push({ id, anchor: 'center', layout: k, scale: { mode: 'contain', w: l.Dw, h: DESIGN_H, g: G_UNITS } });
    const page = { x: -l.Bw / 2, y: -l.Bh / 2 + barU, w: l.Bw, h: l.Bh - barU }, bar = { x: -l.Bw / 2, y: -l.Bh / 2, w: l.Bw, h: barU };
    urlImages.push({ id: `${k}_page`, group: id, slot: CFG.slots.page, rect: page }, { id: `${k}_bar`, group: id, slot: CFG.slots.bar, rect: bar },
      { id: `${k}_pu`, group: id, slot: CFG.slots.pageUnder, rect: page, layer: -1 }, { id: `${k}_bu`, group: id, slot: CFG.slots.barUnder, rect: bar, layer: -1 });
    // (the pointer: its tip at the share of the frame the script sends — x right, y down in the box; Molang's y is up)
    const pos = [`${-l.Bw / 2} + v.gweb_px * ${l.Bw}`, `${l.Bh / 2} - v.gweb_py * ${l.Bh}`, '0'];
    bones.push({ name: `gweb_ptr_${k}`, group: id, pivot: [0, 0], position: pos, scale: `${flag(1)} ? 1 : 0` });
    planes.push({ bone: `gweb_ptr_${k}`, texture: 'atlas', rect: { x: 0, y: 0, w: 3.6, h: 5.6 }, z: -1, uv: [0, 0, 22, 34] });
    bones.push({ name: `gweb_ring_${k}`, group: id, pivot: [0, 0], position: pos, scale: `(${flag(1)} && (${flag(2)} || ${flag(4)})) ? 1 : 0` });
    planes.push({ bone: `gweb_ring_${k}`, texture: 'atlas', rect: { x: -2.5, y: -2.5, w: 5, h: 5 }, z: -0.5, uv: [32, 0, 24, 24] });
    bones.push({ name: `gweb_tip_${k}`, group: id, pivot: [0, 0], position: pos, scale: `(${flag(1)} && ${flag(8)}) ? 1 : 0` });
    planes.push({ bone: `gweb_tip_${k}`, texture: 'atlas', rect: { x: -0.6, y: -0.6, w: 1.2, h: 1.2 }, z: -1.5, uv: [1, 41, 6, 6] });
  }
  const Rd = (n) => `variable.is_paperdoll ? 0 : q.property('gweb:${n}')`;
  const sc = {
    ns: NS, name: ws ? 'GeoUI Web (WebSocket)' : 'GeoUI Web', seed: ws ? 'gweb-ws' : 'gweb',
    description: ws ? 'The web in the game over /connect (any world): every site, Chrome-like, full-screen in F1 (bds-lab bds/geoui/web)' : 'The web in the game: every site, Chrome-like, full-screen in F1 (bds-lab bds/geoui/web)',
    scale: { mode: 'height', s: 0.1 }, groups,
    textures: [{ id: 'atlas', width: 64, height: 64, png: atlasPng() }],
    bones, planes, urlImages,
    properties: [{ name: 'ptr', range: [0, 16777215], default: 0 }, { name: 'flg', range: [0, 255], default: 0 }, { name: 'asp', range: [0, 10000], default: 1778 }],
    pre: [`v.gweb_ptr = ${Rd('ptr')};`, `v.gweb_flg = ${Rd('flg')};`, `v.gweb_asp = ${Rd('asp')};`, 'v.gweb_px = math.mod(v.gweb_ptr, 4096) / 4095;', 'v.gweb_py = math.floor(v.gweb_ptr / 4096) / 4095;'],
    fillImages,
    // (the screen's shape measured by the game: CFG.aspects; the screen's edges marked to set it by hand: /web:fit)
    aspectProbe: { slot: CFG.slots.asp, aspects: CFG.aspects },
    edgeMarkers: { slot: CFG.slots.asp, texture: `textures/${NS}/atlas`, uv: [0, 40], uvSize: [8, 8], w: 6, h: 90, text: 'ポインタの先を左か右の線に合わせてクリック（スニークでやめる）' },
    channel: { width: CFG.width }, f1: true, backdrop: { layouts: Object.keys(CFG.layouts).join('') },
    modules: ws ? [] : [{ module_name: '@minecraft/server-net', version: '1.0.0-beta' }],
    script: R.scriptOf(CFG, { transport: ws ? 'ws' : 'http' }),
    extraScripts: {
      'screen_nav.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'nav.js'), 'utf8'),
      'screen_input.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'input.js'), 'utf8'),
      'screen_channel.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'channel.js'), 'utf8'),
    },
  };
  sc.extraControls = fillTestControls(L.channelOf(sc), CFG);
  return sc;
}

/** 14 本目の実験: the page's URL image (slot 0) drawn four ways outside a GeoUI group, in the four corners (a quarter of the
 *  screen each), while the shape's slot says 'filltest' — which of them the game draws (the exact layout's images did not show:
 *  12・13 本目), each with a rose mark (a plain image) in the same parent, to tell a hidden parent from an image not drawn.
 *   ft1 top_left    panel 100 % > image 25 % x 25 %                     (the exact layout's way)
 *   ft2 top_right   image 25 % x 25 % straight in the viewport
 *   ft3 bottom_left panel 100 % > image 120 x 60 JSON UI px             (a size in px, as the game's own uses)
 *   ft4 bottom_right panel 25 % x 25 % > image 100 %, anchored centre → top_left with an offset of −50 % of itself (a group's way) */
function fillTestControls(ch, CFG) {
  const T = '#hud_title_text_string', url = L.slotExpr(ch, CFG.slots.page), gateSlot = L.slotExpr(ch, CFG.slots.asp);
  const gate = [{ binding_name: T, binding_type: 'global' }, { binding_type: 'view', source_property_name: `(${L.isChannelExpr(ch)} and (${gateSlot} = 'filltest'))`, target_property_name: '#visible' }];
  const img = (more) => Object.assign({ type: 'custom', renderer: 'profile_image_renderer', layer: 2, bindings: [{ binding_name: T, binding_type: 'global' },
    { binding_type: 'view', source_property_name: `('{"type":7,"url":"' + ${url} + '"}')`, target_property_name: '#profile_image_options' }] }, more);
  const mark = (anchor) => ({ type: 'image', texture: `textures/${NS}/atlas`, uv: [0, 40], uv_size: [8, 8], size: [10, 10], anchor_from: anchor, anchor_to: anchor, layer: 6 });
  return [
    { [`${NS}_ft`]: { type: 'panel', size: ['100%', '100%'], layer: 2, bindings: gate, controls: [
      { [`${NS}_ft1`]: img({ size: ['25%', '25%'], anchor_from: 'top_left', anchor_to: 'top_left' }) }, { [`${NS}_ft1m`]: mark('top_left') },
      { [`${NS}_ft3`]: img({ size: [120, 60], anchor_from: 'bottom_left', anchor_to: 'bottom_left' }) }, { [`${NS}_ft3m`]: mark('bottom_left') },
    ] } },
    { [`${NS}_ft2`]: img({ size: ['25%', '25%'], anchor_from: 'top_right', anchor_to: 'top_right', bindings: [...gate, { binding_type: 'view', source_property_name: `('{"type":7,"url":"' + ${url} + '"}')`, target_property_name: '#profile_image_options' }] }) },
    { [`${NS}_ft2m`]: Object.assign(mark('top_right'), { bindings: gate }) },
    { [`${NS}_ft4`]: { type: 'panel', size: ['25%', '25%'], anchor_from: 'bottom_right', anchor_to: 'bottom_right', layer: 2, bindings: gate, controls: [
      { [`${NS}_ft4i`]: img({ size: ['100%', '100%'], anchor_from: 'center', anchor_to: 'top_left', offset: ['-50%x', '-50%y'] }) }, { [`${NS}_ft4m`]: mark('bottom_right') },
    ] } },
  ];
}

/** where the page, the toolbar and the pointer's tip (at nx, ny) are on a W x H screen for a layout (px) */
export function expected(W, H, lay = 'b', nx = 0.5, ny = 0.5) {
  const CFG0 = config();
  // (exact: the page fills the screen below the toolbar, the pointer's tip at that share of the screen)
  if (CFG0.layouts[lay] && CFG0.layouts[lay].fill) return { toolbar: { x0: 0, y0: 0, x1: W, y1: H * BAR }, page: { x0: 0, y0: H * BAR, x1: W, y1: H }, tip: { x0: nx * W, y0: ny * H, x1: nx * W, y1: ny * H } };
  const CFG = CFG0, sc = scene(), g = L.groupsOf(sc).find((x) => x.id === `l_${lay}`), l = CFG.layouts[lay], barU = l.Bh * BAR;
  if (!g) throw new Error(`並べ方 ${lay} はありません（${Object.keys(CFG.layouts).join(' ')}）`);
  const r = (x, y, w, h) => L.rectToScreen(g, { x, y, w, h }, W, H, 1);
  const tip = L.localToScreen(g, -l.Bw / 2 + nx * l.Bw, -l.Bh / 2 + ny * l.Bh, W, H, 1);
  return { toolbar: r(-l.Bw / 2, -l.Bh / 2, l.Bw, barU), page: r(-l.Bw / 2, -l.Bh / 2 + barU, l.Bw, l.Bh - barU), tip: { x0: tip.x, y0: tip.y, x1: tip.x, y1: tip.y } };
}

// ---- the lab's tests on a real BDS (its players see titles, not pictures: the channel, the service's pages by their title)
const TESTS = `# geoui_web（bds/geoui/web/make.mjs が作る）: ゲームの中のウェブ — サービス（Chromium）にページを開かせ、F1 で全画面に出す。
# サービスはラボが BDS の横に起こす（geoui-web.json）。ページは GWEB page の行（URL・題名）で読む。絵は app.txt（本物のアプリ）。

## 開く: セッションができ、F1（HUD 13 部品・プロパティ）、題名の通り道に並べ方 b とページ・ツールバーの絵
@A join
wait 1000
@A cmd /web:open "http://127.0.0.1:8787/demo/color.html?c=ff0000"
until GWEB page .*color\\.html\\?c=ff0000 150000
until @A title: ~gu~1bhttp 10000
~ GWEB open .*"layout":"b","w":1920,"h":1080
~ @A title: ~gu~1bhttp://\\S+/s/[0-9a-f]{32}/f/\\d+\\.png +http://\\S+/s/[0-9a-f]{32}/b/\\d+\\.png
js JSON.stringify([p('A').getProperty('gweb:f1'), p('A').getProperty('gweb:flg') % 2, p('A').onScreenDisplay.getHiddenHudElements().length, p('A').getGameMode()])
= [1,1,13,"Survival"]

## クリック（ポインタの所）: 色のページは次の色へ
scriptevent gweb:pointer 0.5 0.6
@A cmd /web:click
until GWEB page .*c=ff8000 20000

## 腕の振り（左クリック・タップ）もクリック
@A swing
until GWEB page .*c=ffff00 20000

## 戻る・進む
@A cmd /web:back
until GWEB page .*c=ff8000 20000
@A cmd /web:forward
until GWEB page .*c=ffff00 20000

## スニークを短く: 戻る
@A sneak on
wait 300
@A sneak off
until GWEB page .*c=ff8000 20000

## 文字: 欄を押して /web:t（欄が 2 つのフォームなので Enter は押さない）
@A cmd /web:go "http://127.0.0.1:8787/demo/form.html"
until GWEB page .*form\\.html 20000
scriptevent gweb:pointer 0.289 0.144
@A cmd /web:click
wait 500
@A cmd /web:t Steve
until GWEB page .*入力フォーム — Steve 20000

## タブ: 新しいタブで開き、閉じる
@A cmd /web:newtab "http://127.0.0.1:8787/demo/scroll.html"
until GWEB page .*"tabs":2 20000
@A cmd /web:closetab
until GWEB page .*"tabs":1 20000

## 頭を回すとポインタが動く（右へ・下へ）
scriptevent gweb:pointer 0.5 0.5
wait 200
js const v = p('A').getProperty('gweb:ptr'); JSON.stringify([v % 4096, Math.floor(v / 4096)])
= [2048,2048]
@A turn 10 5 4
wait 600
js const v = p('A').getProperty('gweb:ptr'), x = v % 4096, y = Math.floor(v / 4096); JSON.stringify([x > 2300, y > 2150])
= [true,true]

## 画面の形と解像度: 箱（/web:size box 2400x1080）— いちばん近い箱 g
@A cmd /web:size box 2400x1080
wait 1500
~ @A title: ~gu~1g
scriptevent gweb:state
~ GWEB state .*"layout":"g"

## 画面の形と解像度: 自分の画面 2400x1080 — ぴったり（z）、絵は 2400 x 1080、形のプロパティ 2222
@A cmd /web:size 2400x1080
wait 1500
~ @A title: ~gu~1z
~ GWEB aspect .*"asp":2\\.2222,"why":"size"
scriptevent gweb:state
~ GWEB state .*"layout":"z","w":2400,"h":1080
js p('A').getProperty('gweb:asp')
= 2222

## 端に合わせる（/web:fit）: 印が出て（形の枠に fit）、右の端でクリック → 形 2.2222
scriptevent gweb:fit
wait 500
~ @A title: ~gu~1z.*fit
scriptevent gweb:pointer 0.746914 0.5
scriptevent gweb:click
wait 500
~ GWEB aspect .*"asp":2\\.2222,"why":"fit"

## スニークを長く: 閉じる（F1 も戻り、題名も消える）
@A sneak on
until GWEB close 8000
@A sneak off
js JSON.stringify([p('A').getProperty('gweb:f1'), p('A').getProperty('gweb:flg'), p('A').onScreenDisplay.getHiddenHudElements().length])
= [0,0,0]

## F1 だけ（ブラウザなし）: HUD・腕・持ち物を消す、ゲームモードはそのまま
@A cmd /web:f1 on
wait 500
js JSON.stringify([p('A').getProperty('gweb:f1'), p('A').onScreenDisplay.getHiddenHudElements().length, p('A').getGameMode()])
= [1,13,"Survival"]
@A cmd /web:f1 off
wait 500
js JSON.stringify([p('A').getProperty('gweb:f1'), p('A').onScreenDisplay.getHiddenHudElements().length])
= [0,0]

## このサーバーの中の場所は開かない
@A cmd /web:open "http://192.168.1.1/"
wait 3000
@A cmd /web:close
`;

// ---- the real app (the lab's CI device): the browser drawn, worked by the device's own inputs (numbers through measure)
function appTxt() {
  return `# geoui_web（bds/geoui/web/make.mjs が作る）: 本物のアプリで、ゲームの中のウェブ（ページ・ツールバー・ポインタ）が全画面に出て、
# 端末の入力で動くか。期待の位置: node bds/geoui/web/make.mjs expect 2400x1080 g
# 実行: node lab.mjs app ci -a geoui_web（参加したらゲームの画面を 2400x1080 = 本物の 20:9 のスマホの解像度に）

section join
stop
launch
until title 600000
join
until joined 900000
size 2400x1080
wait 9000
do tp @a 0 -60 0 0 0
do scriptevent gweb:size 20:9 1080
wait 6000
absent clientlog \\bERROR\\b

section open
shot world
do scriptevent gweb:open http://127.0.0.1:8787/demo/color.html?c=0000ff
until server GWEB page .*c=0000ff 60000
wait 5000
shot open-blue
measure marks open-blue
measure diff open-blue
do scriptevent gweb:debug 1
wait 1500
shot open-tip
measure marks open-tip

section pointer
do scriptevent gweb:pointer 0.25 0.5
wait 1500
shot ptr-left
measure marks ptr-left
look right 600 60
wait 1500
shot ptr-look
measure marks ptr-look

section click
do scriptevent gweb:pointer 0.5 0.6
wait 800
attack 0.3
until server GWEB page .*c=8000ff 20000
wait 3000
shot click-violet
measure marks click-violet

section back
sneak
until server GWEB page .*c=0000ff 20000
wait 3000
shot back-blue
measure marks back-blue

section scroll
do scriptevent gweb:go http://127.0.0.1:8787/demo/scroll.html
until server GWEB page .*scroll\\.html 20000
wait 4000
shot world
walk back 1.5
wait 3000
shot scrolled
measure diff scrolled
slot next
wait 3000
shot wheel
measure diff wheel

section dynamic
do scriptevent gweb:go http://127.0.0.1:8787/demo/dynamic.html
until server GWEB page .*dynamic\\.html 20000
wait 4000
shot world
wait 3000
shot dyn-later
measure diff dyn-later

section type
do scriptevent gweb:go http://127.0.0.1:8787/demo/form.html
until server GWEB page .*form\\.html 20000
do scriptevent gweb:pointer 0.2 0.144
wait 500
attack 0.3
wait 1000
do scriptevent gweb:t Steve
until server GWEB page .*Steve 20000
wait 3000
shot typed
measure diff typed

section site
do scriptevent gweb:go https://ja.wikipedia.org/wiki/Minecraft
until server GWEB page .*wikipedia 60000
wait 6000
shot wiki
measure diff wiki
do scriptevent gweb:go https://www.youtube.com/
until server GWEB page .*youtube 60000
wait 8000
shot youtube
measure diff youtube
do scriptevent gweb:go https://noknoh12345-afk.github.io/bds-lab/
until server GWEB page .*github\\.io 60000
wait 8000
shot panel
measure diff panel

section close
do scriptevent gweb:pointer 0.9837 0.0723
wait 1500
shot world
attack 0.3
until server GWEB close 10000
wait 3000
shot closed
measure diff closed
measure diff closed 700 940 1700 1080

section after
do tp @a 0 -60 0 0 90
wait 3000
shot world
do title @a title HELLO
wait 1500
shot web-title
measure diff web-title 900 300 1500 700
wait 5000
do tp @a 0 -60 0 0 30
do replaceitem entity @a slot.weapon.mainhand 0 red_wool
wait 3000
shot hand-shown
measure marks hand-shown 1600 600 2400 1080
do scriptevent gweb:f1 on
wait 3000
shot hand-f1
measure marks hand-f1 1600 600 2400 1080
do scriptevent gweb:f1 off
wait 3000
shot hand-back
measure marks hand-back 1600 600 2400 1080
do replaceitem entity @a slot.weapon.mainhand 0 air
`;
}

const TASK = `# geoui_web — ゲームの中のウェブ（どのサイトも、Chrome のように）

## Request
F1 にして（HUD・腕・持ち物を全部消し、ゲームモードは変えない）、全部のサイト（動くサイトも）をほぼ Chrome のように操作できるウェブを
GeoUI で（URL の画像で絵を出す）。本物の解像度で確かめる。作り方: \`node bds/geoui/web/make.mjs\`（このフォルダはそれが書く。手で直さない）。

## What it is
- \`/web:open [URL]\` でブラウザ（ラボが BDS の横に起こすサービス bds/geoui/web/server.mjs の Chromium）。画面は F1 の全画面: ツールバー
  （タブ・戻る・進む・再読み込み・ホーム・アドレス欄・✕）とページは URL の画像、ポインタは GeoUI。画面の形ごとの並べ方（16:9・4:3・16:10・
  18:9・19.5:9・20:9・21:9・32:9）、携帯は 20:9、ほかは 16:9 から。絵は本物の解像度（高さ 1080 px: 20:9 なら 2400 x 1080）、
  \`/web:size 20:9 1440\`・\`/web:res 720\` で形と絵の高さを変える。
- 操作: 視点 = マウス・攻撃（左クリック・タップ）= クリック・ジャンプ = ボタンを押したまま（ドラッグ）・スニーク = 戻る（1.5 秒で閉じる）・
  W / S と ホットバー = ホイール・\`/web:t <言葉>\` = 文字（検索の欄なら Enter も）・\`/web:key <キー>\`・\`/web:go <URL か言葉>\`・\`/web:tab\`・
  \`/web:newtab\`・\`/web:zoom\`・\`/web:f1\`（F1 だけ）。
- サーバーの中の場所（127.0.0.1・192.168.x…）は開かない。操作は BDS と同じ機械からだけ。

## 人が見ること（携帯・PC で）
1. \`/web:open\` → 黒い背景にスタートページ。視点を動かすと矢印が動き、タップ（攻撃）でタイルが開く。スニークで戻る。
2. \`/web:go ja.wikipedia.org\` → ページが出る。W / S（パッド・スティック）でスクロール。\`/web:t マイクラ\` で検索の欄に打てる。
3. スニークを 1.5 秒押し続けると閉じ、HUD が元に戻る。
`;

// ---- the real app on other screens (8 本目): the game's screen set to each shape's real resolution and the browser to that
//      shape — where the page, the toolbar's ✕ and the pointer's tip land, and whether a click still lands (app-aspects.txt;
//      run it with the workflow's scenario bds/addons/geoui_web/app-aspects.txt)
// (9 本目: the 20:9 screen with a 16:9 page first, before the screen is resized — 8 本目 showed the world beside it, not the black)
// (12 本目: the boxes (/web:size box <shape>: as 8〜11 本目), then exact — every screen's shape measured by the game (the aspect
//  probe, the browser opened with none known) and the page filling it; and the edges marked by hand (/web:fit))
const nearest = (W, H) => R.layoutFor(config(), `${W}x${H}`);
export const ASPECTS = [
  { id: 'box', screen: [2400, 1080], size: 'box 16:9', lay: 'b' },
  { id: 'box219', screen: [3440, 1440], size: `box 3440x1440`, lay: nearest(3440, 1440) },
];
export const EXACT = [[2400, 1080], [1920, 1080], [2048, 1536], [3440, 1440], [1440, 1440], [2208, 1840], [1280, 1024], [2340, 1080]];
/** what the aspect probe gives for a screen W x H (the clipped set: the widest probe inside and the next) — as the log writes it */
export function probeGuess(W, H) {
  const a = W / H, as = PROBE_ASPECTS;
  let k = -1; for (let i = 0; i < as.length; i++) if (as[i] <= a + 1e-9) k = i;
  const g = k < 0 ? null : R.aspectFromProbes(as, Array.from({ length: k + 1 }, (_, i) => i), COMMON_ASPECTS);
  return g === null ? null : Math.round(g * 10000) / 10000;
}
const JOIN_TXT = `section join
stop
launch
until title 600000
join
until joined 900000
size 2400x1080
wait 9000
do tp @a 0 -60 0 0 0
wait 3000
absent clientlog \\bERROR\\b
`;
function aspectsTxt() {
  const f = (b) => `(${b.x0.toFixed(1)}, ${b.y0.toFixed(1)})–(${b.x1.toFixed(1)}, ${b.y1.toFixed(1)})`;
  const boxes = ASPECTS.map((a) => {
    const [W, H] = a.screen, e = expected(W, H, a.lay), c = expected(W, H, a.lay, 0.5, 0.6);
    return `section ${a.id}
# ${W}x${H}・${a.size}（並べ方 ${a.lay} = ${config().layouts[a.lay].name}）: ページ ${f(e.page)}、ポインタの先 ${f(e.tip)}、クリックの所 ${f(c.tip)}
do scriptevent gweb:close
wait 2000
size ${W}x${H}
wait 6000
do scriptevent gweb:size ${a.size} ${H}
wait 1000
shot world
do scriptevent gweb:open http://127.0.0.1:8787/demo/color.html?c=0000ff
until server GWEB page .*c=0000ff 60000
wait 5000
do scriptevent gweb:debug 1
wait 1500
shot ${a.id}-open
measure marks ${a.id}-open
do scriptevent gweb:pointer 0.5 0.6
wait 1500
attack 0.3
until server GWEB page .*c=8000ff 20000
wait 3000
shot ${a.id}-click
measure marks ${a.id}-click
`;
  });
  const exact = EXACT.map(([W, H]) => {
    const e = expected(W, H, FILL), c = expected(W, H, FILL, 0.5, 0.6), g = probeGuess(W, H), id = `x${W}x${H}`;
    return `section ${id}
# ${W}x${H}（${(W / H).toFixed(4)}）・ぴったり: 開くと形を測る（プローブの見込み ${g}）→ ページ ${f(e.page)}、ポインタの先 ${f(e.tip)}、クリックの所 ${f(c.tip)}
do scriptevent gweb:close
wait 2000
size ${W}x${H}
wait 6000
do scriptevent gweb:size auto
do scriptevent gweb:res ${Math.min(1440, H)}
wait 1000
shot world
do scriptevent gweb:open http://127.0.0.1:8787/demo/color.html?c=0000ff
until server GWEB page .*c=0000ff 60000
wait 9000
do scriptevent gweb:debug 1
wait 1500
shot ${id}-open
measure marks ${id}-open
do scriptevent gweb:pointer 0.5 0.6
wait 1500
attack 0.3
until server GWEB page .*c=8000ff 20000
wait 3000
shot ${id}-click
measure marks ${id}-click
until server GWEB aspect .*"asp":${String(g).replace('.', '\\.')},"why":"probe- 2000
`;
  });
  // (the edges marked: the pointer's tip put on the right edge of this 20:9 screen — 0.5 + (20/9) / (2 x fitW) of the marking box —
  //  and a click: the shape exactly 20:9)
  const fitNx = 0.5 + (2400 / 1080) / (2 * config().fitW);
  const fit = `section fit
# 2400x1080: /web:fit の印（左右の端）、ポインタの先を右の端に（marking の箱の ${fitNx.toFixed(6)}）→ 形 2.2222
do scriptevent gweb:close
wait 2000
size 2400x1080
wait 6000
do scriptevent gweb:size box 16:9
do scriptevent gweb:open http://127.0.0.1:8787/demo/color.html?c=0000ff
until server GWEB page .*c=0000ff 60000
wait 4000
do scriptevent gweb:fit
wait 2500
shot fit-marks
measure marks fit-marks
do scriptevent gweb:pointer ${fitNx.toFixed(6)} 0.5
wait 1000
attack 0.3
until server GWEB aspect .*"asp":2\\.2222,"why":"fit" 10000
wait 6000
shot fit-done
measure marks fit-done
`;
  // (13 本目: the first browser opened with no shape known at 2400x1080, then what the probe saw — each a section of one line
  //  (expect: the whole log; only this one probe has run yet) — then exact by /web:size alone (the page by JSON UI's %, whatever the
  //  probe did), then the boxes, the other screens, the edges)
  const n0 = PROBE_ASPECTS.filter((a) => a <= 2400 / 1080 + 1e-9).length;
  const diag = [
    ['d-probe', 'GWEB probe'], ['d-c-drawn', `GWEB probe .*"c":${n0},`], ['d-c-all', 'GWEB probe .*"c":160,'], ['d-c-none', 'GWEB probe .*"c":0,'],
    ['d-u-drawn', `GWEB probe .*"u":${n0},`], ['d-u-all', 'GWEB probe .*"u":160,'], ['d-c-top', 'GWEB probe .*"cTop":2\\.222'], ['d-u-top', 'GWEB probe .*"uTop":2\\.222'],
    ['d-aspect', 'GWEB aspect .*"why":"probe'],
    // (where the clipped set stopped: its widest fetched probe, in ranges)
    ['d-cmax-0-49', 'GWEB probe .*"cMax":([0-9]|[1-4][0-9]),'], ['d-cmax-50-89', 'GWEB probe .*"cMax":([5-8][0-9]),'], ['d-cmax-90-105', 'GWEB probe .*"cMax":(9[0-9]|10[0-5]),'],
    ['d-cmax-106-110', 'GWEB probe .*"cMax":(10[6-9]|110),'], ['d-cmax-111', 'GWEB probe .*"cMax":111,'], ['d-cmax-112-118', 'GWEB probe .*"cMax":(11[2-8]),'],
    ['d-cmax-119-129', 'GWEB probe .*"cMax":(119|12[0-9]),'], ['d-cmax-130-159', 'GWEB probe .*"cMax":(1[3-5][0-9]),'],
    ['d-ccount-lt-cmax', 'GWEB probe .*"c":([0-9]{1,2}|1[0-5][0-9]),.*"cTop":null'],
  ].map(([id, re]) => `section ${id}\nexpect server ${re}\n`).join('\n');
  // (the page's URL image drawn four ways outside a group, in the corners — measured a corner at a time; the page itself in a 1:1 box
  //  in the middle, so the corners are free)
  const q = [['ft1', 0, 0, 600, 270], ['ft2', 1800, 0, 2400, 270], ['ft3', 0, 810, 600, 1080], ['ft4', 1800, 810, 2400, 1080]];
  const fillTest = `section filltest
# 2400x1080: ページ（青）を 1:1 の箱で真ん中に、ページの URL の画像を 4 通りに四隅へ（ft1 左上: パネル 100 % > 25 %、ft2 右上: ビューポートに直に、
# ft3 左下: パネル > 120 x 60 px、ft4 右下: パネル 25 % > 100 %・グループと同じ寄せ方）、それぞれの隅に rose の印（ふつうの画像）
do scriptevent gweb:close
wait 2000
do scriptevent gweb:size box 1440x1440 1080
do scriptevent gweb:open http://127.0.0.1:8787/demo/color.html?c=0000ff
until server GWEB page .*c=0000ff 60000
wait 4000
do scriptevent gweb:filltest
wait 4000
shot filltest
measure marks filltest
${q.map(([id, x0, y0, x1, y1]) => `measure marks filltest ${x0} ${y0} ${x1} ${y1}`).join('\n')}
do scriptevent gweb:filltest 0
`;
  const sizeExact = `section exact-size
# 2400x1080・/web:size 2400x1080（測らずに）: ページ ${f(expected(2400, 1080, FILL).page)}、黒なし
do scriptevent gweb:close
wait 2000
do scriptevent gweb:size 2400x1080 1080
do scriptevent gweb:open http://127.0.0.1:8787/demo/color.html?c=0000ff
until server GWEB page .*c=0000ff 60000
wait 6000
do scriptevent gweb:debug 1
wait 1500
shot exact-size
measure marks exact-size
`;
  return `# geoui_web（bds/geoui/web/make.mjs が作る）: どの画面の形でもぴったり（13 本目）— ぴったり（開いた時にゲームが形を測る: 小さな URL の画像の
# どれを取りに来たか、と /web:size）と、箱（/web:size box）と、端に合わせる（/web:fit）。期待の位置: node bds/geoui/web/make.mjs expect <幅>x<高さ> <並べ方|z>
# 実行: アプリのワークフローの scenario に bds/addons/geoui_web/app-aspects.txt

${JOIN_TXT}
${exact[0]}
${diag}
${fillTest}
${sizeExact}
${boxes.join('\n')}
${exact.slice(1).join('\n')}
${fit}
section end
do scriptevent gweb:close
wait 2000
size 2400x1080
`;
}

// ---- the WebSocket edition's checks: on a real BDS with no service — the lab's player is the game, /web:pump typed as the service
//      would send it (the link, a browser's first request in the outbox, its answer turned into the title channel, the long poll next)
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const WS_STATE = { ok: true, sid: 'S1', frame: 1, bar: 1, w: 1920, h: 1080, barH: 108, url: 'http://x/', title: 'T', tabs: 1, tab: 0, focus: 'page', frameUrl: 'http://10.0.2.2:8787/s/S1/f/1.png', barUrl: 'http://10.0.2.2:8787/s/S1/b/1.png' };
const WS_TESTS = `# geoui_web_ws（bds/geoui/web/make.mjs が作る）: ゲームの中のウェブの WebSocket 版 — @minecraft/server-net なし。サービスはプレイヤーの
# /connect（mcws.mjs）で /web:pump を打ち、その出力（スクリプトの送りたい要求）を受け取り、次の pump で答えを返す。ここではサービスの代わりに
# プレイヤーが /web:pump を打つ（中身はサービスが送るものと同じ base64url の JSON）。

## つながる: /web:pump に名前と空の出力
@A join
@A cmd /web:pump "${b64u({ h: { base: 'http://10.0.2.2:8787', v: 'test' } })}"
~ @A cmd: \\{"n":"A","o":\\[\\]\\}
~ GWEB ws linked .*10\\.0\\.2\\.2

## ブラウザを開く: 最初の要求（POST /s、持ち主はプレイヤー）が出力に
scriptevent gweb:open http://127.0.0.1:8787/demo/color.html?c=0000ff
wait 300
@A cmd /web:pump "${b64u({})}"
~ @A .*"o":\\[\\[1,"POST","/s",\\{"owner":
!~ GWEB open failed

## 答えを pump で: 題名の通り道にページと道具の絵（F1）、次の要求はページの変わり目を待つ GET
@A cmd /web:pump "${b64u({ r: [[1, 200, WS_STATE]] })}"
wait 300
~ @A title: ~gu~.*s/S1/f/1\\.png
@A cmd /web:pump "${b64u({})}"
~ @A .*\\[2,"GET","/s/S1/next

## 長い答えは分けて: 3 つに分けた pump の最後で出力（途中は空）
@A cmd /web:pump "9:1/3:${b64u({ r: [[2, 200, WS_STATE]] }).slice(0, 60)}"
@A cmd /web:pump "9:2/3:${b64u({ r: [[2, 200, WS_STATE]] }).slice(60, 120)}"
@A cmd /web:pump "9:3/3:${b64u({ r: [[2, 200, WS_STATE]] }).slice(120)}"
~ @A cmd: \\{"n":"A","o":\\[

## 閉じる
@A cmd /web:close
wait 300
~ GWEB close
`;
function wsAppTxt() {
  // (/connect typed on the device's keyboard, one key at a time: the lab's `cmd`/`chat` (Android's input text) never reached the game
  //  — 3 本目; a key held through the keyboard device is a real key press. ':' is shift + ;)
  const keys = [];
  for (const ch of '/connect 10.0.2.2:8787') keys.push(ch === '/' ? 'SLASH' : ch === ' ' ? 'SPACE' : ch === '.' ? 'PERIOD' : ch === ':' ? 'SHIFT+SEMICOLON' : ch.toUpperCase());
  return `# geoui_web_ws（bds/geoui/web/make.mjs が作る）: WebSocket 版を本物のアプリで（13 本目: 12 本目はつながらず — キーで打てたか・ゲームの答えを文字で見る、だめならチャットで）— プレイヤーが /connect 10.0.2.2:8787 を打つと、
# ゲームがサービスに WebSocket でつながり（暗号化はゲームが求めれば）、サービスが /web:pump でスクリプトとやりとりする。@minecraft/server-net なし。
# 実行: node lab.mjs app ci --batch geoui_web,geoui_web_ws（geoui_web は app-aspects.txt を scenario に、または単独）

${JOIN_TXT}
section type-key
key T
wait 2500
text /connect 10.0.2.2:8787
wait 1200
shot ws-typed-key
expect text (?i)connect

section send-key
key ENTER
wait 2500
shot ws-sent-key
until server GWEB ws linked 25000

section type-press
press T 80
wait 2500
${keys.map((k) => `press ${k} 60`).join('\n')}
wait 1200
shot ws-typed-press
expect text (?i)connect

section send-press
press ENTER 80
wait 2500
shot ws-sent-press
until server GWEB ws linked 25000

section ocr-after
expect text (?i)(connect|websocket|wss?:|接続|unknown|不明|permission|権限|cheat|チート|syntax|構文|encrypt|暗号)

section open
shot world
do scriptevent gweb:open http://127.0.0.1:8787/demo/color.html?c=0000ff
until server GWEB page .*c=0000ff 60000
wait 9000
do scriptevent gweb:debug 1
wait 1500
shot ws-open
measure marks ws-open

section click
do scriptevent gweb:pointer 0.5 0.6
wait 1500
attack 0.3
until server GWEB page .*c=8000ff 20000
wait 3000
shot ws-click
measure marks ws-click

section site
do scriptevent gweb:go https://ja.wikipedia.org/wiki/Minecraft
until server GWEB page .*wikipedia 60000
wait 8000
shot ws-wiki
measure diff ws-wiki

section close
do scriptevent gweb:close
until server GWEB close 10000
wait 3000
shot ws-closed
measure diff ws-closed
`;
}
const WS_TASK = `# geoui_web_ws — ゲームの中のウェブ（WebSocket 版: どのワールドでも）

## Request
@minecraft/server-net（BDS だけにある）が無いワールド — スマホや PC のワールド、Realm、ほかのサーバー — でも、ゲームの中で Chrome のように
ウェブを使う。外との通り道はゲーム自身の WebSocket（/connect）。作り方: \`node bds/geoui/web/make.mjs\`（このフォルダはそれが書く。手で直さない）。

## 使い方
1. PC で \`node bds/geoui/web/server.mjs\`（Chromium のサービス。最初に Playwright を入れる）。表示される「/connect <アドレス>:8787」を覚える。
2. ワールドにこのアドオンを入れる（チートを有効に）。ゲームの設定の「暗号化された WebSocket を必須にする」はそのままでよい（サービスが暗号化する）。
3. ゲームで \`/connect <PC のアドレス>:8787\` → \`/web:open\`。あとは geoui_web と同じ（頭の向きがポインタ、振るとクリック、/web:t で文字）。
   チャットで ! から始めた文字はページに打たれる（!! で Enter）。画面の形は開いた時にゲームが測る（/web:size・/web:fit でも）。
`;
/** every file of the WebSocket edition */
export function wsFiles() {
  const built = P.build(scene({ transport: 'ws' }), { core: G });
  if (built.warnings.length) throw new Error(built.warnings.join('\n'));
  const out = packFiles(built);
  out['tests.txt'] = WS_TESTS;
  out['app.txt'] = wsAppTxt();
  out['TASK.md'] = WS_TASK;
  out['geoui-web.json'] = JSON.stringify({ service: 'bds/geoui/web/server.mjs', tunnel: false }, null, 2) + '\n';
  out['imported.json'] = JSON.stringify({ from: 'bds/geoui/web/make.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: 'ゲームの中のウェブの WebSocket 版: どのワールドでも /connect で' }, null, 2) + '\n';
  return { files: out, stats: built.stats };
}

/** every file of the add-on */
export function files() {
  const built = P.build(scene(), { core: G });
  if (built.warnings.length) throw new Error(built.warnings.join('\n'));
  const out = packFiles(built);
  out['tests.txt'] = TESTS;
  out['app.txt'] = appTxt();
  out['app-aspects.txt'] = aspectsTxt();
  out['TASK.md'] = TASK;
  out['geoui-web.json'] = JSON.stringify({ service: 'bds/geoui/web/server.mjs', tunnel: false }, null, 2) + '\n';
  out['imported.json'] = JSON.stringify({ from: 'bds/geoui/web/make.mjs', rp: [1, 0, 0], bp: [1, 0, 0], request: 'ゲームの中のウェブ: F1 で全画面、全部のサイト、ほぼ Chrome の操作' }, null, 2) + '\n';
  return { files: out, stats: built.stats };
}

function main(argv) {
  if (argv[0] === 'expect') {
    const m = /^(\d+)x(\d+)$/.exec(argv[1] || '');
    if (!m) { console.error('node bds/geoui/web/make.mjs expect <幅>x<高さ> [並べ方 b〜i]'); process.exit(2); }
    for (const [k, b] of Object.entries(expected(Number(m[1]), Number(m[2]), argv[2] || 'b'))) console.log(`${k.padEnd(10)} (${b.x0.toFixed(1)}, ${b.y0.toFixed(1)})–(${b.x1.toFixed(1)}, ${b.y1.toFixed(1)})`);
    return;
  }
  const check = argv.includes('--check');
  let bad = false;
  for (const [name, out, make] of [[NAME, OUT, files], [WS_NAME, WS_OUT, wsFiles]]) {
    const { files: F, stats } = make(), r = writeUnit(out, F, { check });
    if (check) {
      if (!r.ok) { console.error(`bds/addons/${name} は make.mjs が作る物と違います: ${r.bad.join(' ')}\n→ node bds/geoui/web/make.mjs`); bad = true; }
      else console.log(`OK bds/addons/${name} is what make.mjs makes`);
    } else console.log(`OK bds/addons/${name}: グループ ${stats.groups}・ボーン ${stats.bones}・面 ${stats.planes}・プロパティ ${stats.properties}`);
  }
  if (bad) process.exit(1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
