// the 「☰」 menu and the tab strip's icons (panel/lib/navmenu.mjs, pure): every tab the panel has is in one group and has an
// icon and a line of what it is for (its help's first sentence); the menu shows only the tabs this person sees, in the
// groups' order, an unknown tab in the last group, an empty group left out; the strip's words stay the tabs' names.
// 「かんたん表示」: the screens few need left out of the strip and the menu (the one open now kept), said in words, and
// panel.js drawing it so — 🔎 still finding every screen.
// node tests/navmenu-offline.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(TOP, p)).href);
const NAV = await imp('panel/lib/navmenu.mjs'), G = await imp('panel/lib/guide.mjs');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

// (the panel's own tab list, read from panel.js: the menu must know every one of them)
const src = fs.readFileSync(path.join(TOP, 'panel', 'panel.js'), 'utf8');
const TABS = [...(/const TABS = \[([\s\S]*?)\];/.exec(src)?.[1] ?? '').matchAll(/\['(\w+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]);

await t('every tab of the panel: in exactly one group, with an icon and a line of what it is for', () => {
  ok(TABS.length >= 15, `the tabs read from panel.js: ${TABS.length}`);
  const inGroups = NAV.GROUPS.flatMap(([, ks]) => ks);
  eq(new Set(inGroups).size, inGroups.length, 'no tab twice');
  eq([...inGroups].sort(), TABS.map(([k]) => k).sort(), 'the groups name every tab, and only those');
  for (const [k] of TABS) ok(NAV.TAB_ICONS[k] && G.HELP[k]?.what, `${k}: an icon and its help`);
});
await t('the menu: only the tabs shown, the groups\' order, each item its label, icon and first sentence; an empty group left out', () => {
  const shown = TABS.filter(([k]) => !['audit', 'members', 'hosts'].includes(k));
  const m = NAV.menuGroups(shown, G.HELP);
  eq(m.map((g) => g.title), ['いつも見る', '作る・配る', 'つなぐ・鍵', '見る・このブラウザ'], '人と時間 has none of them');
  const ov = m[0].items[0];
  eq([ov.key, ov.label, ov.icon], ['overview', '概要', '🏠']);
  ok(ov.what.endsWith('。') && G.HELP.overview.what.startsWith(ov.what), ov.what);
  ok(m.flatMap((g) => g.items).every((x) => x.what.length <= 60), 'each line short');
});
await t('a tab no group knows yet goes in the last group (a new tab is never lost from the menu)', () => {
  const m = NAV.menuGroups([['overview', '概要'], ['newone', '新しい']], {});
  eq(m.map((g) => [g.title, g.items.map((x) => x.key)]), [['いつも見る', ['overview']], ['見る・このブラウザ', ['newone']]]);
  eq(m[1].items[0].icon, '•');
});
await t('かんたん表示: the strip and ☰ without 成果物・統計・Discord・メンバー・監査, the order kept; all of them in full', () => {
  eq([...NAV.ADVANCED_TABS], ['files', 'stats', 'discord', 'members', 'audit']);
  for (const k of NAV.ADVANCED_TABS) ok(TABS.some(([x]) => x === k), `${k}: a tab of the panel`);
  const simple = NAV.visibleTabs(TABS), hidden = NAV.hiddenTabs(TABS);
  eq(simple.map(([, l]) => l), ['概要', '進み具合', '実行', 'アドオン', '配布', '予約', '秘密', '端末', '貸し借り', '準備', '連携', '設定']);
  eq(hidden.map(([k]) => k), ['files', 'stats', 'discord', 'members', 'audit'], 'the hidden ones, in the strip\'s order');
  eq(NAV.visibleTabs(TABS, { full: true }), TABS, 'full: every tab');
  eq(NAV.hiddenTabs(TABS, { full: true }), [], 'full: none hidden');
  eq(simple.length + hidden.length, TABS.length, 'each tab shown or hidden, never lost');
});
await t('かんたん表示: the tab shown now always in the strip (opened from 🔎, a link, ☰\'s fold) — and not in the fold then', () => {
  const v = NAV.visibleTabs(TABS, { current: 'stats' });
  ok(v.some(([k]) => k === 'stats'), 'the current hidden tab shown');
  eq(v.map(([k]) => k).indexOf('stats'), v.map(([k]) => k).indexOf('schedule') + 1, 'in its own place (after 予約)');
  eq(NAV.hiddenTabs(TABS, { current: 'stats' }).map(([k]) => k), ['files', 'discord', 'members', 'audit']);
  eq(NAV.visibleTabs([['overview', '概要'], ['settings', '設定']]), [['overview', '概要'], ['settings', '設定']], 'a lender\'s three-or-fewer: nothing to hide');
  eq(NAV.visibleTabs(undefined), []);
  eq(NAV.hiddenTabs(null), []);
});
await t('かんたん表示 said in words: each hidden screen named; held back, not gone', () => {
  ok(NAV.SIMPLE_HIDES.length >= 5 && NAV.SIMPLE_HIDES.every((x) => typeof x === 'string' && x.length <= 80), 'short lines');
  const words = NAV.SIMPLE_HIDES.join('\n');
  for (const [k, label] of TABS) if (NAV.ADVANCED_TABS.includes(k)) ok(words.includes(label), `${label} named`);
  ok(/🔎/.test(words), 'where they still are');
});
await t('panel.js: the strip and ☰ from visibleTabs, 🔎 from every tab permitted, the held-back cards behind full() / adv(), the choice in 「設定」', () => {
  ok(/NAV\.visibleTabs\(allowed, view\)/.test(src) && /NAV\.hiddenTabs\(allowed, view\)/.test(src) && /dockOf\(tabs\)/.test(src) && /openMenu\(st\.nav\.tabs, st\.nav\.hidden\)/.test(src), 'the dock and the menu');
  ok(/palette\(\{ tabs: \(\) => permittedTabs\(\)\.map/.test(src), '🔎: every tab this person may open');
  ok(/adv\('labhealth'\)/.test(src) && /adv\('debug'\)/.test(src) && /go\(tab, anchor\)/.test(src), 'the cards 🔎 leads to, shown when it does');
  ok(/const FULL_KEY = 'bdslab\.panel\.full'/.test(src) && /function viewCard\(\)/.test(src) && /id: 'fullview'/.test(src) && /id: 'showall'/.test(src) && /id: 'showsimple'/.test(src), '「表示」 in 設定, and ☰\'s two buttons');
  ok(/simple: !full\(\)/.test(src), 'the screens of ui/ told (アドオン・配布)');
});
await t('first sentence: to 。！？ with the mark, cut at 60 with …', () => {
  eq(NAV.firstSentence('いまの様子をひと目で。やることの一覧'), 'いまの様子をひと目で。');
  eq(NAV.firstSentence('ない'), 'ない');
  eq(NAV.firstSentence('あ'.repeat(80)).length, 60);
  eq(NAV.firstSentence(undefined), '');
});
await t('the frame in panel.js (OreUI): the five groups on the dock, the group\'s screens as nav.tabs (none for a group of one), 「☰」 in the title bar, the screen shown scrolled into sight', () => {
  ok(/h\('nav', \{ id: 'dock'/.test(src) && /'data-tabs': g\.tabs\.map/.test(src) && /h\('nav', \{ class: 'tabs', 'aria-label': group\.title \}/.test(src) && /group\.tabs\.length < 2 \? ' single' : ''/.test(src) && /\$\('nstart'\)\?\.replaceChildren\(h\('button', \{ id: 'menubtn'/.test(src) && /showActiveTab\(strip\)/.test(src), 'panel.js');
  const css = fs.readFileSync(path.join(TOP, 'panel', 'panel.css'), 'utf8');
  ok(/#dock \{[^}]*position: fixed/.test(css) && /\.tabbar \{[^}]*position: sticky; top: var\(--hdr/.test(css) && /\.tabbar\.single \{ display: none; \}/.test(css), 'panel.css');
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
