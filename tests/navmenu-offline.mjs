// the 「☰」 menu and the tab strip's icons (panel/lib/navmenu.mjs, pure): every tab the panel has is in one group and has an
// icon and a line of what it is for (its help's first sentence); the menu shows only the tabs this person sees, in the
// groups' order, an unknown tab in the last group, an empty group left out; the strip's words stay the tabs' names.
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
await t('first sentence: to 。！？ with the mark, cut at 60 with …', () => {
  eq(NAV.firstSentence('いまの様子をひと目で。やることの一覧'), 'いまの様子をひと目で。');
  eq(NAV.firstSentence('ない'), 'ない');
  eq(NAV.firstSentence('あ'.repeat(80)).length, 60);
  eq(NAV.firstSentence(undefined), '');
});
await t('the strip in panel.js: the icon from data-icon (outside the words), 「☰」 outside nav.tabs, the tab shown scrolled into sight', () => {
  ok(/'data-icon': NAV\.TAB_ICONS\[k\]/.test(src) && /h\('div', \{ class: 'tabbar' \}, menuBtn, strip\)/.test(src) && /showActiveTab\(strip\)/.test(src), 'panel.js');
  const css = fs.readFileSync(path.join(TOP, 'panel', 'panel.css'), 'utf8');
  ok(/nav\.tabs button::before \{ content: attr\(data-icon\)/.test(css) && /\.tabbar \{[^}]*position: sticky; top: var\(--hdr/.test(css), 'panel.css');
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
