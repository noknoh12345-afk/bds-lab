#!/usr/bin/env node
// HTML → GeoUI: an HTML page becomes an add-on whose HUD shows that page, worked with no form at all (bds/geoui/SPEC.md
// 「HTML から GeoUI へ」). The three steps: capture.mjs (a real Chromium draws the page, every control in every state),
// scene.mjs (the pictures into atlases and bones, the Molang, the properties), runtime.js (the behaviour pack's script: the
// head's turns a mouse, W A S D the arrows with nav.js, jump Enter, sneak Escape, the hotbar the wheel and keys 1–9).
//   node bds/geoui/html/convert.mjs <page.html> --out <add-on folder> [--ns gh] [--name "…"] [--design 1280x720] [--dpr 2]
//        [--hold free|speed|lock] [--capture <folder>]     the page captured (into --capture, default <out>/../<name>.capture
//                                                         is not kept: a temporary one) and made into the add-on
//   node bds/geoui/html/convert.mjs --from <capture folder> --out <add-on folder> [...]
//                                                         from a capture already taken (no browser)
//   node bds/geoui/html/convert.mjs --sample [--check]    the lab's sample: bds/geoui/html/examples/menu.html (its capture is
//                                                         kept in examples/menu.capture) → bds/addons/geoui_html_demo
//   --check: write nothing; fail when the add-on is not what the capture makes (CI: tests/geoui-html-offline.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildScene } from './scene.mjs';
const require = createRequire(import.meta.url);
const LAB_OWN = new Set(['lab.mjs', 'tsconfig.json']);
const HERE = path.dirname(fileURLToPath(import.meta.url)), TOP = path.resolve(HERE, '..', '..', '..');
const G = require('../geoui_builder.js'), P = require('../screen/pack.js'), R = require('./runtime.js');
export const SAMPLE = { html: path.join(HERE, 'examples', 'menu.html'), capture: path.join(HERE, 'examples', 'menu.capture'), out: path.join(TOP, 'bds', 'addons', 'geoui_html_demo'), ns: 'ghd', name: 'GeoUI HTML Demo' };

/** a capture folder → every file of the add-on (path → text | bytes), and what it is */
export function addonFiles(captureDir, opts = {}) {
  const b = buildScene(captureDir, opts);
  const cfg = Object.assign({ title: b.capture.title, hold: opts.hold || 'free', sens: Number(opts.sens) || 4 }, b.config);
  const scene = Object.assign({}, b.scene, {
    script: R.scriptOf(cfg),
    extraScripts: { 'screen_nav.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'nav.js'), 'utf8'), 'screen_input.js': fs.readFileSync(path.join(HERE, '..', 'screen', 'input.js'), 'utf8') },
  });
  if (opts.uuids) scene.uuids = opts.uuids;
  const built = P.build(scene, { core: G });
  const files = {};
  for (const [p, c] of Object.entries(built.files)) files[p] = c && c.base64 !== undefined ? Buffer.from(c.base64, 'base64') : c;
  const first = b.capture.previews && b.capture.previews[cfg.start || 0];
  if (first) files['preview.png'] = fs.readFileSync(path.join(captureDir, first));
  return { files, cfg, stats: Object.assign({}, b.stats, built.stats), warnings: [...b.warnings, ...built.warnings], capture: b.capture };
}

/** the sample's own files beside the packs: what it is, the tests on a real BDS and the steps in the real app */
function sampleDocs(cfg, stats) {
  const ns = cfg.ns, pageNo = (id) => cfg.pages.findIndex((p) => p.id === id) + 1, C = (label) => cfg.controls.find((c) => c.label === label);
  const idx = (label) => (C(label) ? C(label).i : -1);
  const music = cfg.controls.find((c) => c.prop === 'music'), sens = cfg.controls.find((c) => c.prop === 'sens');
  const fha = (n) => `js const v = p('A').getProperty('${ns}:fha'); JSON.stringify([v % 256 - 1, Math.floor(v / 256) % 256 - 1, Math.floor(v / 65536) - 1])`;
  const tests = `# geoui_html_demo（bds/geoui/html/convert.mjs --sample が作る）: HTML のページを GeoUI にした物が、フォームなしで動くか —
# 開く・視点のポインタ・W A S D の焦点・ジャンプで決定・スニークで戻る・スロット（タブ）・切り替え・ラジオ・スライダー（ホイール）・閉じる。
# fha = [焦点, ポインタの下, 押している] の番号（-1 = なし）。描画は app.txt（本物のアプリ）。

## 読み込める（閉じている）
@A join
wait 2000
js JSON.stringify([p('A').getProperty('${ns}:pg'), p('A').getProperty('${ns}:fha')])
= [0,0]

## 開くと最初のページ（あそぶ）で、焦点は最初の操作できる物
scriptevent ${ns}:open
wait 600
js p('A').getProperty('${ns}:pg')
= ${pageNo('play')}
${fha()}
= [0,-1,-1]

## W A S D で焦点が動く（右へ → タブの 2 つ目、下へ → ステージのボタン）
@A walk right 4
wait 600
${fha()}
= [1,-1,-1]
@A walk back 4
wait 600
js const f = p('A').getProperty('${ns}:fha') % 256 - 1; JSON.stringify([f > ${idx('1. 草原') - 1}, f < ${idx('5. 空の島') + 1}])
= [true,true]

## ジャンプで決定（ステージのボタン → event）
@A jump
wait 600
~ GEOUI event .*"name":"stage

## スロット 3 でタブ「せってい」へ
@A slot 2
wait 600
js p('A').getProperty('${ns}:pg')
= ${pageNo('settings')}

## 切り替え（音楽）をジャンプで OFF に
scriptevent ${ns}:focus ${music ? music.id : 'c0'}
wait 300
js Math.floor(p('A').getProperty('${ns}:chk${music ? Math.floor(music.i / 24) : 0}') / ${music ? 2 ** (music.i % 24) : 1}) % 2
= 1
@A jump
wait 600
js Math.floor(p('A').getProperty('${ns}:chk${music ? Math.floor(music.i / 24) : 0}') / ${music ? 2 ** (music.i % 24) : 1}) % 2
= 0

## スライダーはホイールで変わる（スロットの物は選ばれない）
scriptevent ${ns}:focus ${sens ? sens.id : 'c0'}
wait 300
@A hotbar prev
wait 600
~ GEOUI change .*"value":5
js JSON.stringify([p('A').getProperty('${ns}:pg'), p('A').getProperty('${ns}:fha') % 256 - 1])
= [${pageNo('settings')},${sens ? sens.i : 0}]

## 視点を回すとポインタが動き、下の物に焦点が移る
scriptevent ${ns}:page play
wait 400
@A turn -40 10 10
wait 800
js const v = p('A').getProperty('${ns}:cur'); v !== ${2048 + 2048 * 4096}
= true

## スニークで前のページへ戻り、最初のページでもう一度で閉じる
scriptevent ${ns}:close
wait 300
scriptevent ${ns}:open
wait 400
scriptevent ${ns}:page settings
wait 400
@A sneak on
wait 300
@A sneak off
wait 500
js p('A').getProperty('${ns}:pg')
= ${pageNo('play')}
@A sneak on
wait 300
@A sneak off
wait 600
js p('A').getProperty('${ns}:pg')
= 0

## 開いたまま抜けて戻ると閉じている
scriptevent ${ns}:open
wait 600
js p('A').getProperty('${ns}:pg')
= ${pageNo('play')}
@A leave
wait 1500
@A join
wait 3000
js p('A').getProperty('${ns}:pg')
= 0
wait 1500
js p('A').getProperty('${ns}:pg')
= 0
`;
  const app = `# geoui_html_demo（bds/geoui/html/convert.mjs --sample が作る）を本物のアプリで: ページの見た目・焦点・ポインタ・ページの切り替え
section title
launch
until title 600000
shot title

section join
join
until joined 900000
do tp @a 0 -60 0 0 90
do gamemode adventure @a
wait 6000
shot world
absent clientlog \\bERROR\\b

section open
do scriptevent ${ns}:open
wait 2500
shot page-play
changed 0.2
measure diff page-play

section keys
press D 300
wait 800
press S 300
wait 800
shot keys-focus
press SPACE 200
wait 800
until server GEOUI event 5000

section tabs
key 2
wait 1500
shot page-items
key 3
wait 1500
shot page-settings
press S 300
wait 600
press SPACE 200
wait 1000
shot settings-toggle

section pointer
key 1
wait 1200
look left 400 50
wait 800
shot pointer
look right 600 50
wait 800
shot pointer-2

section sizes
size 1024x768
wait 9000
shot page-4x3
size 2400x1080
wait 9000
shot page-20x9
size reset
wait 6000

section close
press SHIFT_LEFT 300
wait 600
press SHIFT_LEFT 300
wait 1500
shot closed
`;
  const task = `# geoui_html_demo — HTML のページを GeoUI に（フォームなしで操作する）

## Request
HTML を GeoUI に変える物を作る。スクロールでスロット移動、視点でマウス（3D の角度から）、W A S D で焦点（見ている向きで上・右を決め、曖昧でも分かるように）、
ジャンプ・スニークなど使えるキー全部で PC を再現、ボタンにも対応。フォームはマウスしか受け付けないので使わない。
作り方: \`node bds/geoui/html/convert.mjs --sample\`（ページは bds/geoui/html/examples/menu.html、写しは examples/menu.capture/）。

## What it is
- ページ ${stats.pages} 枚・操作できる物 ${stats.controls} 個・動く物 ${stats.dynamic} 個・絵 ${stats.sprites} 枚（アトラス ${stats.atlases.join(' / ')}）・ボーン ${stats.bones} 本・面 ${stats.planes} 枚・プロパティ ${stats.properties} 個。
- 開く: \`/${ns}:open\`（または \`/scriptevent ${ns}:open [ページ]\`）。カメラが止まり、HUD はタッチの操作（と、スロットのある時はホットバー）だけになる。
- 操作（PC の再現）: 視点 = マウス（白い矢印。端で止まり、戻せばすぐ動く）、左クリック（腕の振り）= クリック、W A S D・スティック・タッチのパッド = 矢印キー
  （焦点はその向きの一番近い物へ。斜めも。曖昧なら見ている所に近い方。黄色い W A S D の札が行き先）、ジャンプ = 決定、スニーク = 戻る（最初のページで閉じる）、
  ホイール・1〜9 = スロット（タブ・もちものは数字のスロットに付いている。スロットの無いページではホイールが Tab）、スライダーは A / D とホイールで変わる。
- ゲームの側へ: \`/scriptevent ${ns}:on_open|on_close|on_page|on_click|on_change|on_event <json>\`（system.sendScriptEvent）。値は \`/scriptevent ${ns}:set score 1234\`・\`${ns}:set progress 80\`。
- 見た目はページの CSS そのまま（通常・:hover・:focus-visible・:active・ON/OFF・使えない）。preview.png はブラウザで描いたページ（ゲームの画面ではない: 本物は app.txt）。

## Acceptance (one tests.txt \`## \` section each)
- [ ] 読み込める（閉じている）
- [ ] 開くと最初のページ（あそぶ）で、焦点は最初の操作できる物
- [ ] W A S D で焦点が動く（右へ → タブの 2 つ目、下へ → ステージのボタン）
- [ ] ジャンプで決定（ステージのボタン → event）
- [ ] スロット 3 でタブ「せってい」へ
- [ ] 切り替え（音楽）をジャンプで OFF に
- [ ] スライダーはホイールで変わる（スロットの物は選ばれない）
- [ ] 視点を回すとポインタが動き、下の物に焦点が移る
- [ ] スニークで前のページへ戻り、最初のページでもう一度で閉じる
- [ ] 開いたまま抜けて戻ると閉じている
`;
  return { 'tests.txt': tests, 'app.txt': app, 'TASK.md': task,
    'imported.json': JSON.stringify({ from: 'bds/geoui/html/convert.mjs --sample', rp: [1, 0, 0], bp: [1, 0, 0], request: 'HTML を GeoUI に（フォームなし: 視点でマウス・WASD で焦点・ジャンプで決定・スニークで戻る・スロット）' }, null, 2) + '\n' };
}

function writeAddon(out, files, check) {
  const bad = [], want = new Set(Object.keys(files));
  for (const [rel, c] of Object.entries(files)) {
    const f = path.join(out, rel), buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    if (check) { if (!fs.existsSync(f) || !fs.readFileSync(f).equals(buf)) bad.push(rel); continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
  }
  const walk = (d, pre = '') => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`])) : []);
  // (the lab's own files beside a unit it tested — lab.mjs, tsconfig.json: git ignores them — are not the add-on's)
  for (const rel of walk(out)) if (!want.has(rel) && !LAB_OWN.has(rel)) { if (check) bad.push(`${rel}（余分）`); else fs.rmSync(path.join(out, rel)); }
  return bad;
}

async function main(argv) {
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const check = argv.includes('--check');
  if (argv.includes('--sample')) {
    if (argv.includes('--recapture') || !fs.existsSync(path.join(SAMPLE.capture, 'capture.json'))) {
      const { capture } = await import('./capture.mjs');
      fs.rmSync(SAMPLE.capture, { recursive: true, force: true });
      await capture(SAMPLE.html, SAMPLE.capture, { dpr: 2 });
    }
    const uuids = { rp: 'b6e0c2a4-7d31-4f58-8a2c-1e9f0d3b5a61', rpMod: 'b6e0c2a4-7d31-4f58-8a2c-1e9f0d3b5a62', bp: 'b6e0c2a4-7d31-4f58-8a2c-1e9f0d3b5a63', bpData: 'b6e0c2a4-7d31-4f58-8a2c-1e9f0d3b5a64', bpScript: 'b6e0c2a4-7d31-4f58-8a2c-1e9f0d3b5a65' };
    const r = addonFiles(SAMPLE.capture, { ns: SAMPLE.ns, name: SAMPLE.name, uuids, hold: 'free' });
    Object.assign(r.files, sampleDocs(r.cfg, r.stats));
    const bad = writeAddon(SAMPLE.out, r.files, check);
    for (const w of r.warnings) console.warn(`W ${w}`);
    if (check) { if (bad.length) { console.error(`bds/addons/geoui_html_demo は convert.mjs --sample が作る物と違います: ${bad.join(' ')}\n→ node bds/geoui/html/convert.mjs --sample`); process.exit(1); } console.log('OK bds/addons/geoui_html_demo is what convert.mjs --sample makes'); return; }
    console.log(`OK bds/addons/geoui_html_demo: ${JSON.stringify(r.stats)}`);
    return;
  }
  const input = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--check'].includes(argv[i - 1])));
  const out = val('--out'), from = val('--from');
  if ((!input && !from) || !out) { console.error('node bds/geoui/html/convert.mjs <page.html> --out <add-on folder> [--ns gh] [--name "…"] [--design 1280x720] [--dpr 2] [--hold free|speed|lock]\n   or --from <capture folder> --out <folder> · --sample [--check] [--recapture]'); process.exit(2); }
  let dir = from;
  if (!dir) {
    const { capture } = await import('./capture.mjs');
    dir = val('--capture') || fs.mkdtempSync(path.join(os.tmpdir(), 'geoui-capture-'));
    const c = await capture(input, dir, { design: val('--design'), dpr: val('--dpr') });
    console.log(`撮った: ページ ${c.pages.length}・操作できる物 ${c.controls.length}・動く物 ${c.dynamic.length}（${dir}）`);
  }
  const r = addonFiles(dir, { ns: val('--ns') || 'gh', name: val('--name'), hold: val('--hold'), sens: val('--sens'), filter: val('--filter') });
  const bad = writeAddon(path.resolve(out), r.files, check);
  for (const w of r.warnings) console.warn(`W ${w}`);
  if (check && bad.length) { console.error(`違います: ${bad.join(' ')}`); process.exit(1); }
  console.log(`OK ${out}: ${JSON.stringify(r.stats)}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
