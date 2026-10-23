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

await t('the fonts: pixel letters only — Latin in "Ore Pixel", every other script in GNU Unifont (its Japanese and Taiwanese shapes too); on disk with their licences (SIL OFL); no game font', async () => {
  const css = read('panel/fonts/fonts.css');
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  ok(urls.length >= 60, `${urls.length} fonts`);
  for (const u of urls) ok(!/^[a-z]+:/i.test(u) && fs.existsSync(path.join(TOP, 'panel', 'fonts', u)), `${u}: a file of the panel`);
  const fams = [...new Set([...css.matchAll(/font-family: "([^"]+)"/g)].map((m) => m[1]))];
  eq(fams, ['Ore Pixel', 'Ore Unifont', 'Ore Unifont JP', 'Ore Unifont T', 'Ore Unifont Upper'], 'the families');
  ok(/font-family: "Ore Pixel";[^}]*size-adjust: 112\.5%/.test(css), 'the Latin face drawn 2:1 at 16px');
  for (const f of ['panel/fonts/pixel/OFL.txt', 'panel/fonts/unifont/OFL-1.1.txt']) ok(/SIL OPEN FONT LICENSE|SIL Open Font License/.test(read(f)), `${f}: the licence`);
  const all = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name)); else all.push(path.join(d, e.name)); } };
  walk(path.join(TOP, 'panel', 'fonts'));
  ok(!all.some((f) => /minecraft[-_ ]?(seven|ten|five)|mojangles|noto/i.test(path.basename(f))), `no game font, nothing but the pixel letters: ${all.filter((f) => /minecraft|mojang|noto/i.test(f)).join(' ')}`);
  // (fonts.css is what common/panel-fonts.mjs writes from its plan: node lab.mjs panel fonts <folder>)
  const F = await imp('common/panel-fonts.mjs');
  const plan = F.planFonts();
  ok(css === F.fontsCss(plan), 'panel/fonts/fonts.css is not what the plan writes: node lab.mjs panel fonts <GNU Unifont のフォルダ>');
  for (const sl of plan) ok(fs.existsSync(path.join(TOP, 'panel', 'fonts', `${sl.file}.woff2`)), `${sl.file}.woff2`);
});

await t('every letter of the panel\'s own words is in a "core" slice of its family (one file for a language\'s common letters), and unicodeRange writes the shortest list', async () => {
  const F = await imp('common/panel-fonts.mjs');
  eq(F.unicodeRange([0x41, 0x42, 0x43, 0x3042, 0x4e00, 0x4e01]), 'U+41-43,U+3042,U+4E00-4E01');
  eq(F.unicodeRange([]), '');
  const sets = F.commonSets();
  eq([sets.ja.size, sets.tc.size, sets.ko.size], [2965, 5401, 2350], 'JIS level 1, Big5\'s common set, KS X 1001\'s Hangul');
  ok(sets.sc.size >= 3755, `GB 2312 level 1: ${sets.sc.size}`);
  const plan = F.planFonts({ sets });
  const core = (fam, file) => new Set(plan.filter((x) => x.family === fam && x.core && (!file || x.file === file)).flatMap((x) => x.cps));
  // (each language's own words, in its own core: Japanese — the panel's source; the others — their dictionaries, panel/i18n/)
  const han = (cps) => [...cps].filter((cp) => (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7a3));
  const lettersOf = (lang) => { const f = path.join(TOP, 'panel', 'i18n', `${lang}.json`); return fs.existsSync(f) ? new Set([...Object.values(JSON.parse(read(`panel/i18n/${lang}.json`))).filter((v) => typeof v === 'string').join('')].map((c) => c.codePointAt(0))) : new Set(); };
  const miss = (cps, set) => han(cps).filter((cp) => !set.has(cp)).map((cp) => String.fromCodePoint(cp)).join('');
  // (the languages' names, each in its own shapes — panel.css .langs [lang] — so each in its own language's core; the others'
  //  names are no Japanese words of the panel)
  const L = await imp('panel/lib/i18n.mjs'), cps = (s) => [...s].map((c) => c.codePointAt(0));
  const coreOf = { ja: core('Ore Unifont JP'), en: new Set(), ko: core('Ore Unifont', 'unifont/core-ko'), 'zh-Hans': core('Ore Unifont', 'unifont/core-sc'), 'zh-Hant': core('Ore Unifont T') };
  for (const l of L.LANGS) eq(miss(cps(l.name), coreOf[l.code]), '', `${l.code}: its name, 「${l.name}」, outside its core`);
  // (and the waiting words panel.css draws before the page has its script: each in its language's shapes, from its core)
  const boot = Object.fromEntries([...read('panel/panel.css').matchAll(/:root:lang\(([\w-]+)\) #main > \.boot::after \{ content: "([^"]+)"; \}/g)].map((m) => [m[1], m[2]]));
  eq(Object.keys(boot), ['en', 'ko', 'zh-Hans', 'zh-Hant'], 'the waiting words in each language');
  for (const [l, w] of Object.entries(boot)) eq(miss(cps(w), coreOf[l]), '', `${l}: 「${w}」 outside its core`);
  const names = new Set([...L.LANGS.filter((l) => l.code !== 'ja').flatMap((l) => cps(l.name)), ...Object.values(boot).flatMap(cps)]);
  eq(miss([...F.panelLetters(path.join(TOP, 'panel'))].filter((cp) => !names.has(cp)), new Set([...core('Ore Unifont JP'), ...core('Ore Unifont', 'unifont/core-ko')])), '', 'a Japanese kanji of the panel outside the Japanese core (EXTRA.ja)');
  eq(miss(lettersOf('zh-Hans'), core('Ore Unifont', 'unifont/core-sc')), '', 'a hanzi of the Simplified Chinese words outside its core (EXTRA.sc)');
  eq(miss(lettersOf('zh-Hant'), core('Ore Unifont T')), '', 'a hanzi of the Traditional Chinese words outside its core (EXTRA.tc)');
  eq(miss([...lettersOf('ko')].filter((cp) => cp >= 0xac00), core('Ore Unifont', 'unifont/core-ko')), '', 'a Hangul syllable of the Korean words outside its core (EXTRA.ko)');
  // (the cores are declared last in each family: asked for first)
  const css = F.fontsCss(plan), last = (fam) => [...css.matchAll(new RegExp(`font-family: "${fam}";[^}]*url\\(([^)]+)\\)`, 'g'))].map((m) => m[1]).pop();
  ok(/core/.test(last('Ore Unifont JP')) && /core/.test(last('Ore Unifont T')) && /core/.test(last('Ore Unifont')), 'cores last');
});

await t('the page: its fonts, icons, look and 見やすさ in that order; its own fonts alone (font-src \'self\'); a light title bar as the theme', () => {
  const html = read('panel/index.html');
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  eq(links, ['fonts/fonts.css', 'icons.css', 'styles.css', 'panel.css', 'a11y.css']);
  ok(html.indexOf('<script src="early.js"></script>') > 0 && html.indexOf('<script src="early.js"></script>') < html.indexOf('<link rel="stylesheet"'), 'early.js before anything is drawn: in <head>, before the stylesheets');
  ok(/font-src 'self';/.test(html) && /<header id="top"><div class="nstart" id="nstart"><\/div><h1 id="title">/.test(html) && /name="theme-color" content="#e6e8eb"/.test(html), 'the policy and the title bar');
});

await t('panel.css is OreUI\'s shapes: square (no rounded corners), no gradient of the old look, a pixel unit, the dock and the switch drawn', () => {
  const css = read('panel/panel.css').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/border-radius:\s*(?!0)[\d.]+(px|em|%)/.test(css), 'no rounded corner');
  ok(!/#4f46e5|#9333ea|backdrop-filter|radial-gradient/.test(css), 'nothing of the old look');
  ok(/--u: 2px/.test(css) && /#dock \{/.test(css) && /input\[type=checkbox\]::after/.test(css) && /button:active:not\(:disabled, \[aria-disabled=true\]\)::before/.test(css), 'the pixel unit, the dock, the switch, the sinking button');
  ok(/--f-px: "Ore User Body", "Ore Pixel", var\(--f-cjk\), monospace;/.test(css) && /:root:lang\(ja\) \{ --f-cjk: "Ore Unifont JP"/.test(css) && /:root:lang\(zh-Hant\)[^{]*\{ --f-cjk: "Ore Unifont T"/.test(css), 'one pixel font stack: their own game font first, the Latin face, Unifont in the page\'s language\'s shapes');
  ok(!/Noto|Hiragino|Meiryo|system-ui|sans-serif|ui-monospace|Menlo|Consolas/.test(css), 'no font but the pixel letters (and monospace, the last resort)');
  ok(!/html\.ore-smooth/.test(css), 'no smooth face');
});

// ---- the colours: lib/styles.mjs → styles.css ----
const ST = await imp('panel/lib/styles.mjs');
await t('styles.css is what lib/styles.mjs writes (node lab.mjs panel styles): OreUI on :root, each style on [data-style], the strong colours last', () => {
  const css = read('panel/styles.css');
  ok(css === ST.css(), 'panel/styles.css is out of date: node lab.mjs panel styles');
  ok(css.startsWith('/* panel/styles.css — written by `node lab.mjs panel styles`'), 'its header names the command that writes it');
  eq([...css.matchAll(/^(\S[^{\n]*) \{$/gm)].map((m) => m[1]), [':root, [data-style="ore"]', ...ST.STYLES.slice(1).map((x) => `[data-style="${x.key}"]`), 'html.a11y-contrast']);
  eq(ST.STYLES[0].key, 'ore');
  eq(ST.GROUPS.map((g) => g.key), ['ore', 'cute', 'cool', 'place']);
  for (const g of ST.GROUPS.slice(1)) ok(ST.STYLES.filter((x) => x.group === g.key).length >= 3, `${g.key}: at least three to choose from`);
  eq(new Set(ST.STYLES.map((x) => x.key)).size, ST.STYLES.length, 'each key once');
  for (const x of ST.STYLES) ok(/^[a-z][a-z0-9-]{0,23}$/.test(x.key) && x.name && x.hint && /^(dark|light)$/.test(x.scheme), `${x.key}: a key early.js takes, a name, a hint, a scheme`);
});

await t('the bevel is the game\'s: OreUI\'s pressables worked out from their faces give the texels of the game\'s own textures (pressable_*.png), to a step', () => {
  const v = ST.palette(ST.STYLES[0]);
  // (read from the game's pressable_elevated_* and pressable_*_pressed textures, texel by texel: [face, top/left, corner, right/bottom])
  const GAME = {
    go: ['#3c8527', '#639d52', '#73a764', '#50913d'], 'go-h': ['#2a641c', '#7fa277', '#a6bea0', '#6a9260'], 'go-p': ['#1d4d13', '#4a7142', '#5d7f55', '#345f2b'],
    btn: ['#d0d1d4', '#e3e3e5', '#eeeeef', '#e3e3e5'], 'btn-h': ['#b1b2b5', '#e0e0e1', '#f3f3f3', '#e0e0e1'], 'btn-p': ['#b1b2b5', '#c1c1c4', '#c7c8c9', '#b9babc'],
    stop: ['#ca3636', '#d55e5e', '#d96e6e', '#cf4a4a'], 'stop-h': ['#c02d2d', '#d98181', '#e5a7a7', '#d36c6c'], 'stop-p': ['#ad1d1d', '#bd4a4a', '#c45d5d', '#b53434'],
    nb: ['#48494a', '#6d6d6e', '#7b7c7d', '#5a5b5c'], 'nb-h': ['#58585a', '#79797b', '#878789', '#69696b'], 'nb-p': ['#313233', '#5a5b5c', '#6b6c6c', '#464747'],
  };
  const near = (a, b) => { const x = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), y = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return x.every((c, i) => Math.abs(c - y[i]) <= 1); };
  for (const [k, [face, hi, cor, edge]] of Object.entries(GAME)) {
    const [base, st] = k.split('-'), sfx = st ? `-${st}` : '', faceVar = st === 'h' ? `${base}-hover` : st === 'p' ? `${base}-press` : base;
    ok(near(v[faceVar], face), `${k} face: ${v[faceVar]} ≠ ${face}`);
    ok(near(v[`${base}-hi${sfx}`], hi) && near(v[`${base}-cor${sfx}`], cor) && near(v[`${base}-edge${sfx}`], edge), `${k}: ${v[`${base}-hi${sfx}`]} ${v[`${base}-cor${sfx}`]} ${v[`${base}-edge${sfx}`]} ≠ ${hi} ${cor} ${edge}`);
  }
  eq([v['go-lo'], v['btn-lo'], v['stop-lo'], v['nb-lo'], v['btn-rim'], v['go-rim']], ['#1d4d13', '#58585a', '#ad1d1d', '#313233', '#000000', '#1e1e1f'], 'the lips and rims');
  eq([v.dis, v['dis-lo'], v['dis-rim']], ['#d0d1d4', '#b1b2b5', '#8c8d90'], 'pressable_elevated_disabled.png');
  // (the other parts, as OreUI's recreations in the game's own UI files draw them — bedrock-core/ui's ore-styled textures)
  ok(near(v['off-hi'], '#a3a4a6') && near(v['off-edge'], '#97989b') && v.off === '#8c8d90', `the toggle's track, off: ${v.off} ${v['off-hi']} ${v['off-edge']}`);
  eq([v.head, v['head-hi'], v['head-lo']], ['#e6e8eb', '#ebedef', '#b1b2b5'], 'the header: its face, a light line, its shadow');
  eq([v.div, v.hi], ['#323334', '#5a5b5c'], 'the divider');
  eq([v.field, v.sunk, v.deep, v['field-dis'], v['field-dis-hi'], v['field-dis-rim']], ['#313233', '#242425', '#1e1e1f', '#b1b2b5', '#8c8d90', '#58585a'], 'the field, and the field that cannot be typed in');
  eq(ST.mix('#3c8527', '#ffffff', 0.2), '#639d52');
});

await t('every style reads: each pair of words and their ground at WCAG AA or more (the main words 7:1), in every style and the strong colours', () => {
  eq([...ST.STYLES, ST.CONTRAST].flatMap((x) => ST.problems(x)), []);
  ok(Math.abs(ST.contrast('#000000', '#ffffff') - 21) < 1e-9 && Math.abs(ST.contrast('#767676', '#ffffff') - 4.54) < 0.01, 'the formula');
  for (const x of ST.STYLES) {
    const v = ST.palette(x);
    for (const [k, c] of Object.entries(v)) ok(/^#[0-9a-f]{6}$|^rgb\(\d+ \d+ \d+ \/ \d+%\)$/.test(c), `${x.key} --${k}: ${c}`);
    eq(Object.keys(v), Object.keys(ST.palette(ST.STYLES[0])), `${x.key}: every variable`);
    // (a link, a warning, a failure, a success: each its own colour, never one for two)
    eq(new Set([v.link, v.warn, v.bad, v.ok]).size, 4, `${x.key}: link, warn, bad and ok each its own colour`);
  }
});

await t('each style\'s pixel tile: 16 × 16 texels of its own palette, drawn faintly behind the page (none in OreUI\'s own and in the strong colours)', () => {
  for (const x of ST.STYLES.slice(1)) {
    ok(x.tile && x.tile.grid.length === 16 && x.tile.grid.every((r) => r.length === 16 && [...r].every((c) => c === '.' || x.tile.pal[c])), `${x.key}: its grid`);
    // (faint: no texel too far from the ground it is drawn on)
    for (const c of Object.values(x.tile.pal)) ok(ST.contrast(c, x.bg) < 3.2, `${x.key}: ${c} on ${x.bg} is no faint tile (${ST.contrast(c, x.bg).toFixed(2)})`);
    ok(/^url\("data:image\/svg\+xml,/.test(ST.tileUrl(x)), `${x.key}: a data address`);
  }
  eq([ST.tileUrl(ST.STYLES[0]), ST.tileUrl(ST.CONTRAST)], ['none', 'none']);
});

await t('panel.css names no colour of its own — every one a variable of styles.css (or a picture\'s black backdrop); every variable it reads is set somewhere', () => {
  const css = read('panel/panel.css').replace(/\/\*[\s\S]*?\*\//g, ''), a11y = read('panel/a11y.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const hexes = [...new Set([...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()))].sort();
  eq(hexes, ['#000', '#313233', '#3a3b3c', '#fff'], 'only black and white (a picture\'s frame and its veil) and the artifact viewer\'s chequer');
  const used = new Set([...`${css}${a11y}`.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]));
  const set = new Set([...ST.VARS, ...Object.keys(ST.partIcons(ST.STYLES[1])), ...[...`${css}${a11y}${read('panel/icons.css')}`.matchAll(/(?:^|[;{\s])--([a-z0-9-]+)\s*:/g)].map((m) => m[1]), 'hdr', 'pi-size']);
  eq([...used].filter((v) => !set.has(v)), [], 'read and never set');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
