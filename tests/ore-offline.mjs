// OreUI, the panel's look, without a browser: the pixel icons (panel/lib/pixelicons.mjs) — every grid well made, panel/icons.css
// what the module writes, each emoji the panel's words use for a screen drawn — the fonts on disk and their licences, the
// stylesheet's shapes (square, no gradient of the old look), the page linking it all, and ui/ore.mjs's pure parts: the emoji
// split out of words, the dock of five made from the screens someone may open.
// node tests/ore-offline.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(TOP, p)).href);
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.stack?.split('\n').slice(0, 3).join('\n     ') ?? e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const read = (p) => fs.readFileSync(path.join(TOP, p), 'utf8');

// (a DOM just big enough for ui/dom.mjs's h(), which ui/ore.mjs's icon() uses)
class E { constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.kids = []; this.className = ''; } setAttribute(k, v) { this.attrs[k] = String(v); } addEventListener() {} append(...xs) { this.kids.push(...xs); } }
globalThis.Node ??= class {};
globalThis.document ??= { createElement: (tag) => new E(tag), createTextNode: (s) => ({ data: String(s) }) };

const PX = await imp('panel/lib/pixelicons.mjs'), NAV = await imp('panel/lib/navmenu.mjs'), ORE = await imp('panel/ui/ore.mjs');

await t('pixel icons: every grid 12 × 12 of its own letters, every colour letter in its palette, every emoji mapped to an icon that is there', () => {
  eq(PX.problems(), []);
  ok(Object.keys(PX.ICONS).length >= 80, `${Object.keys(PX.ICONS).length} mono icons`);
  for (const n of [...Object.keys(PX.ICONS), ...Object.keys(PX.COLOR), ...Object.keys(PX.PARTS)]) ok(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 12 12"/.test(PX.svg(n)), `${n}: an SVG of 12 × 12`);
  eq(PX.svg('no-such-icon'), null);
  ok(PX.WORDMARK.grid.length === 8 && PX.WORDMARK.grid.every((r) => r.length === PX.WORDMARK.grid[0].length), 'the door\'s mark: 8 rows of one length');
});

await t('pixel icons: an SVG is pixels (one rectangle a run of a row), a colour icon in its own colours, a mono one a shape for a mask', () => {
  eq(PX.pathOf(['#..##', '.....']), 'M0 0h1v1h-1zM3 0h2v1h-2z');
  const okSvg = PX.svg('ok');
  ok(/fill="#3c8527"/.test(okSvg) && /fill="#ffffff"/.test(okSvg) && /shape-rendering="crispEdges"/.test(okSvg), 'ok: green and white, crisp');
  ok(!/fill=/.test(PX.svg('home')), 'home: a shape only');
  const u = PX.dataUrl(okSvg);
  ok(/^url\("data:image\/svg\+xml,/.test(u) && !/[<>#"](?![)]$)/.test(u.slice(5, -2)), `a data address with nothing to break CSS: ${u.slice(0, 80)}`);
});

await t('panel/icons.css is what pixelicons.mjs writes (node lab.mjs panel icons), and every icon has its class', () => {
  const css = read('panel/icons.css');
  ok(css === PX.css(), 'panel/icons.css is out of date: node lab.mjs panel icons');
  for (const n of [...Object.keys(PX.ICONS), ...Object.keys(PX.COLOR)]) ok(css.includes(`.pi[data-pi="${n}"] { --pi: url("data:image/svg+xml,`), `${n}: its class`);
  for (const v of ['--x-ico', '--down-ico', '--up-ico', '--i-ico', '--o-ico', '--radio-ico', '--radio-on-ico', '--chev-ico', '--search-ico', '--ext-ico', '--wordmark']) ok(css.includes(`${v}: url(`), `${v} for panel.css`);
  ok(css.startsWith('/* panel/icons.css — written by `node lab.mjs panel icons`'), 'its header names the command that writes it');
});

await t('every screen\'s emoji (the menu\'s) and every status mark the panel says (✅ ⚠️ ❌ ❔ ➖ ℹ️) is drawn as a pixel icon', () => {
  for (const [k, e] of Object.entries(NAV.TAB_ICONS)) ok(PX.EMOJI[e], `${k}: ${e} has no icon`);
  for (const e of ['✅', '⚠️', '❌', '❔', '➖', 'ℹ️', '🔔', '🔎', '⚠']) ok(PX.EMOJI[e], `${e} has no icon`);
  ok(PX.isColor('ok') && PX.isColor('warn') && PX.isColor('bad') && !PX.isColor('home'), 'the status marks keep their colours');
});

await t('ui/ore.mjs split: the words around each mark kept, the mark with its icon — ⚠️ whole (not ⚠ and a stray selector), unknown marks left as words', () => {
  eq(ORE.split('✅ DISCORD_BOT_TOKEN'), [{ e: '✅', name: 'ok' }, ' DISCORD_BOT_TOKEN']);
  eq(ORE.split('⚠️ 400 日前に登録'), [{ e: '⚠️', name: 'warn' }, ' 400 日前に登録']);
  eq(ORE.split('🔔 3'), [{ e: '🔔', name: 'bell' }, ' 3']);
  eq(ORE.split('設定 → デバッグ'), ['設定 → デバッグ'], 'an arrow in a sentence stays a word');
  eq(ORE.split('a🦄b'), ['a🦄b'], 'a mark with no icon stays as it is');
  eq(ORE.split(''), []);
  // (the words that say the page waits: they get the loading mark)
  eq(['読んでいます…', '実行を読んでいます…', `${'x'} の入力を読んでいます… `, '読み込んでいます…', '読みました', '読んでいます', '読んでいます…ね', '込んでいます…', '', null].map(ORE.isWaiting), [true, true, true, true, false, false, false, false, false, false]);
  const i = ORE.icon('home');
  ok(i.tagName === 'I' && i.className === 'pi' && i.attrs['data-pi'] === 'home' && i.attrs['aria-hidden'] === 'true', 'icon(): <i class="pi" data-pi> hidden from screen readers');
  eq(ORE.icon('ok').className, 'pi pc', 'a colour icon: pc');
});

await t('ui/ore.mjs dockOf: the screens someone may open as the five groups (lib/navmenu.mjs GROUPS), a group with none left out, its own name and icon', () => {
  const all = [['overview', '概要'], ['runs', '進み具合'], ['start', '実行'], ['units', 'アドオン'], ['releases', '配布'], ['files', '成果物'], ['schedule', '予約'], ['stats', '統計'], ['discord', 'Discord'], ['secrets', '秘密'],
    ['live', '端末'], ['hosts', '貸し借り'], ['members', 'メンバー'], ['setup', '準備'], ['connect', '連携'], ['audit', '監査'], ['settings', '設定']];
  const d = ORE.dockOf(all);
  eq(d.map((g) => g.key), ['home', 'make', 'link', 'team', 'more']);
  eq(d.map((g) => g.label), ['ホーム', '作る', 'つなぐ', 'チーム', '設定']);
  eq(d.flatMap((g) => g.tabs.map(([k]) => k)).sort(), all.map(([k]) => k).sort(), 'every screen once');
  eq(d[0].tabs, [['overview', '概要'], ['runs', '進み具合'], ['start', '実行'], ['live', '端末']]);
  eq(d.map((g) => g.title), NAV.GROUPS.map(([title]) => title), 'the menu\'s titles');
  // (a lender: three screens, three groups)
  const lender = ORE.dockOf([['overview', '概要'], ['hosts', '貸し借り'], ['settings', '設定']]);
  eq(lender.map((g) => [g.key, g.tabs.map(([k]) => k)]), [['home', ['overview']], ['team', ['hosts']], ['more', ['settings']]]);
  // (a screen no group names: in the last group shown)
  eq(ORE.dockOf([['overview', '概要'], ['newone', '新しい']]).map((g) => g.tabs.map(([k]) => k)), [['overview', 'newone']]);
  eq(ORE.groupOf(d, 'secrets'), 'link'); eq(ORE.groupOf(d, 'nope'), null);
  eq(ORE.dockOf(undefined), []);
});

await t('the fonts: on disk with their licences (SIL OFL), every address of fonts.css a file of the panel, the pixel face for Latin, Noto Sans JP for Japanese', () => {
  const css = read('panel/fonts/fonts.css');
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  ok(urls.length >= 120, `${urls.length} fonts`);
  for (const u of urls) ok(!/^[a-z]+:/i.test(u) && fs.existsSync(path.join(TOP, 'panel', 'fonts', u)), `${u}: a file of the panel`);
  ok(/font-family: "Ore Pixel"/.test(css) && /font-family: "Ore Sans JP"/.test(css) && /unicode-range:/.test(css), 'the two families, Japanese in slices');
  for (const f of ['panel/fonts/pixel/OFL.txt', 'panel/fonts/noto-sans-jp/OFL.txt']) ok(/SIL Open Font License/.test(read(f)), `${f}: the licence`);
  ok(!fs.readdirSync(path.join(TOP, 'panel', 'fonts', 'pixel')).some((f) => /minecraft|mojang/i.test(f)), 'no game font');
});

await t('the page: its fonts, icons, look and 見やすさ in that order; its own fonts alone (font-src \'self\'); a light title bar as the theme', () => {
  const html = read('panel/index.html');
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  eq(links, ['fonts/fonts.css', 'icons.css', 'panel.css', 'a11y.css']);
  ok(/font-src 'self';/.test(html) && /<header id="top"><div class="nstart" id="nstart"><\/div><h1 id="title">/.test(html) && /name="theme-color" content="#e6e8eb"/.test(html), 'the policy and the title bar');
});

await t('panel.css is OreUI\'s shapes: square (no rounded corners), no gradient of the old look, a pixel unit, the dock and the switch drawn', () => {
  const css = read('panel/panel.css').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/border-radius:\s*(?!0)[\d.]+(px|em|%)/.test(css), 'no rounded corner');
  ok(!/#4f46e5|#9333ea|backdrop-filter|radial-gradient/.test(css), 'nothing of the old look');
  ok(/--u: 2px/.test(css) && /#dock \{/.test(css) && /input\[type=checkbox\]::after/.test(css) && /button:active:not\(:disabled\)::before/.test(css), 'the pixel unit, the dock, the switch, the sinking button');
  ok(/font-family|font:/.test(css) && /--f-ui: "Ore Pixel"/.test(css) && /html\.ore-smooth \{ --f-ui: var\(--f-text\); \}/.test(css), 'the faces, and 「なめらかな字」');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
