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
const DESIGN_H = 720, G_UNITS = 0.25, BAR = 0.1;

// the screen shapes: a letter of the title channel each ('a' = none), a contain box of the shape (DESIGN_H design px high).
// Every letter the channel has (25): the common shapes exactly (b–i as before, then 1:1・5:4・3:2・5:3・3:4・64:27 ultrawide・iPad Pro 11・
// the folds' inner screens) and the gaps between them filled on a log scale (no two neighbours more than 10.7 % apart: any screen from
// 3:4 to 32:9 gets a page within 2.6 % of its shape on each side, the rest the game's black — the backdrop, R10.19). /web:size <W>x<H>
// (or a ratio) picks the nearest (runtime.js layoutFor)
export const LAYOUTS = {
  b: { name: '16:9', aspect: 16 / 9 }, c: { name: '4:3', aspect: 4 / 3 }, d: { name: '16:10', aspect: 16 / 10 }, e: { name: '18:9', aspect: 2 },
  f: { name: '19.5:9', aspect: 19.5 / 9 }, g: { name: '20:9', aspect: 20 / 9 }, h: { name: '21:9', aspect: 21 / 9 }, i: { name: '32:9', aspect: 32 / 9 },
  j: { name: '1:1', aspect: 1 }, k: { name: '5:4', aspect: 5 / 4 }, l: { name: '3:2', aspect: 3 / 2 }, m: { name: '5:3', aspect: 5 / 3 },
  n: { name: '3:4', aspect: 3 / 4 }, o: { name: '64:27', aspect: 64 / 27 }, p: { name: 'iPad Pro 11', aspect: 2388 / 1668 }, q: { name: '折りたたみ（内側）', aspect: 2208 / 1840 },
  r: { name: '0.81', aspect: 0.806 }, s: { name: '0.87', aspect: 0.866 }, t: { name: '0.93', aspect: 0.931 }, u: { name: '1.10', aspect: 1.095 },
  v: { name: '1.89', aspect: 1.886 }, w: { name: '2.49', aspect: 2.494 }, x: { name: '2.62', aspect: 2.623 }, y: { name: '2.90', aspect: 2.903 }, z: { name: '3.21', aspect: 3.213 },
};
export function config() {
  const layouts = {};
  for (const [k, l] of Object.entries(LAYOUTS)) { const Dw = Math.round(DESIGN_H * l.aspect); layouts[k] = { name: l.name, aspect: l.aspect, Dw, Bw: Dw * G_UNITS, Bh: DESIGN_H * G_UNITS }; }
  return {
    ns: NS, cmd: 'web', layouts, barFrac: BAR, slots: { page: 0, bar: 1, pageUnder: 2, barUnder: 3 }, slotCount: 4, width: 160, buffer: true, bufferTicks: 2, frameTicks: 14, refreshTicks: 200,
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

export function scene() {
  const CFG = config(), groups = [], bones = [], planes = [], urlImages = [];
  const flag = (n) => `(math.mod(math.floor(v.gweb_flg / ${n}), 2) > 0.5)`;
  for (const [k, l] of Object.entries(CFG.layouts)) {
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
  return {
    ns: NS, name: 'GeoUI Web', description: 'The web in the game: every site, Chrome-like, full-screen in F1 (bds-lab bds/geoui/web)', seed: 'gweb',
    scale: { mode: 'height', s: 0.1 }, groups,
    textures: [{ id: 'atlas', width: 64, height: 64, png: atlasPng() }],
    bones, planes, urlImages,
    properties: [{ name: 'ptr', range: [0, 16777215], default: 0 }, { name: 'flg', range: [0, 255], default: 0 }],
    pre: [`v.gweb_ptr = ${Rd('ptr')};`, `v.gweb_flg = ${Rd('flg')};`, 'v.gweb_px = math.mod(v.gweb_ptr, 4096) / 4095;', 'v.gweb_py = math.floor(v.gweb_ptr / 4096) / 4095;'],
    channel: { width: CFG.width }, f1: true, backdrop: { layouts: Object.keys(CFG.layouts).join('') },
    modules: [{ module_name: '@minecraft/server-net', version: '1.0.0-beta' }],
    script: R.scriptOf(CFG),
    extraScripts: {
      'screen_nav.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'nav.js'), 'utf8'),
      'screen_input.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'input.js'), 'utf8'),
      'screen_channel.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'channel.js'), 'utf8'),
    },
  };
}

/** where the page, the toolbar and the pointer's tip (at nx, ny) are on a W x H screen for a layout (px) */
export function expected(W, H, lay = 'b', nx = 0.5, ny = 0.5) {
  const CFG = config(), sc = scene(), g = L.groupsOf(sc).find((x) => x.id === `l_${lay}`), l = CFG.layouts[lay], barU = l.Bh * BAR;
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

## 画面の形と解像度: 20:9・高さ 1080（本物のスマホ）
@A cmd /web:size 2400x1080
wait 1500
~ @A title: ~gu~1g
scriptevent gweb:state
~ GWEB state .*"layout":"g","w":2400,"h":1080

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
// (11 本目: every letter — screens of shapes in between, the browser sized by the screen's own W x H: the nearest layout)
const nearest = (W, H) => R.layoutFor(config(), `${W}x${H}`);
export const ASPECTS = [
  { id: 'box', screen: [2400, 1080], size: '16:9', lay: 'b' },
  { id: '169', screen: [1920, 1080], size: '16:9', lay: 'b' },
  { id: '43', screen: [2048, 1536], size: '4:3', lay: 'c' },
  { id: '219', screen: [2560, 1080], size: '21:9', lay: 'h' },
  ...[[2340, 1080], [2388, 1668], [2208, 1840], [1280, 1024], [3440, 1440], [1440, 1440]].map(([W, H]) => ({ id: `s${W}x${H}`, screen: [W, H], size: `${W}x${H}`, lay: nearest(W, H) })),
];
function aspectsTxt() {
  const f = (b) => `(${b.x0.toFixed(1)}, ${b.y0.toFixed(1)})–(${b.x1.toFixed(1)}, ${b.y1.toFixed(1)})`;
  const parts = ASPECTS.map((a) => {
    const [W, H] = a.screen, e = expected(W, H, a.lay), c = expected(W, H, a.lay, 0.5, 0.6);
    return `section ${a.id}
# ${W}x${H}・${a.size}（並べ方 ${a.lay} = ${config().layouts[a.lay].name}）: ページ ${f(e.page)}、ツールバー ${f(e.toolbar)}、ポインタの先 ${f(e.tip)}${a.id === 'box' ? '（20:9 の画面に 16:9: 左右は黒）' : ''}
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
# （クリックの所: ${f(c.tip)}）
`;
  });
  return `# geoui_web（bds/geoui/web/make.mjs が作る）: ほかの画面の形の本物の解像度で、ゲームの中のウェブの場所とクリック（8 本目）。
# 期待の位置: node bds/geoui/web/make.mjs expect <幅>x<高さ> <並べ方>。実行: アプリのワークフローの scenario に bds/addons/geoui_web/app-aspects.txt

section join
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

${parts.join('\n')}
section end
do scriptevent gweb:close
wait 2000
size 2400x1080
`;
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
  const { files: F, stats } = files(), check = argv.includes('--check');
  const r = writeUnit(OUT, F, { check });
  if (check) {
    if (!r.ok) { console.error(`bds/addons/${NAME} は make.mjs が作る物と違います: ${r.bad.join(' ')}\n→ node bds/geoui/web/make.mjs`); process.exit(1); }
    console.log(`OK bds/addons/${NAME} is what make.mjs makes`);
  } else console.log(`OK bds/addons/${NAME}: グループ ${stats.groups}・ボーン ${stats.bones}・面 ${stats.planes}・プロパティ ${stats.properties}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
