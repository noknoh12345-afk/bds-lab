// navmenu: the panel's screens for the 「☰」 menu and the tab strip (pure) — each tab's icon, the screens in a few groups by
// what a person comes to do, and one line of what each is for (the first sentence of its help, lib/guide.mjs HELP). A phone
// shows five tabs of the strip at a time: the menu shows them all at once, grouped and said. 「かんたん表示」 (the default)
// leaves the screens few need out of both; the menu keeps them in a fold.

/** each tab's icon (the strip draws it from data-icon, outside the button's words: the words stay the tab's name) */
export const TAB_ICONS = Object.freeze({
  overview: '🏠', runs: '📈', start: '▶️', units: '🧩', releases: '📦', files: '📁', schedule: '⏰', stats: '📊', discord: '💬',
  secrets: '🔑', live: '📱', hosts: '🤝', members: '👥', setup: '🛠️', connect: '🔗', audit: '📜', settings: '⚙️',
});
/** the groups, in the menu's order: what a person comes to do */
export const GROUPS = Object.freeze([
  ['いつも見る', ['overview', 'runs', 'start', 'live']],
  ['作る・配る', ['units', 'releases', 'files', 'schedule']],
  ['つなぐ・鍵', ['connect', 'secrets', 'discord', 'setup']],
  ['人と時間', ['members', 'hosts', 'audit']],
  ['見る・このブラウザ', ['stats', 'settings']],
]);
/** 「かんたん表示」 (the default; 「設定」's 「すべての機能を出す」 turns it off, per browser): the screens it leaves out of the
 *  strip and the menu — numbers to look at (統計), what 「進み具合」 already has for each run (成果物), what 「連携」 and
 *  「設定」 already set (Discord), a team's (メンバー, 監査). Hidden, never gone: 🔎, a link and the menu's fold still open them */
export const ADVANCED_TABS = Object.freeze(['files', 'stats', 'discord', 'members', 'audit']);
/** what 「かんたん表示」 leaves out, in words (the 「設定」 card says it): the screens above and the cards panel.js holds back */
export const SIMPLE_HIDES = Object.freeze([
  '画面: 成果物・統計・Discord・メンバー・監査（🔎 と ☰ の「隠している画面」からは開けます）',
  'どの画面にもある「？ ここでできること」（☰ に一言ずつあります）',
  '概要: 🧭 何がしたい？・🩺 健康度と報告書・あなたのカード',
  '実行: ワークフローを選んで（よく使うものは「すぐ始める」に）',
  'アドオン: 🎮 遊び方カード・📝 リリースの説明　配布: 説明の下書き・2 つの版の比較',
  '秘密: 古い秘密のカード（一覧にも出ます）　貸し借り: 空き時間の見込み',
  '設定: トークンの説明・デバッグ・ことばの意味（🔎 で「デバッグ」と入れると出ます）',
]);
/** the tabs this person may open ([[key, label]], in the strip's order) → the ones the strip and the menu show: all of them
 *  in full; else all but ADVANCED_TABS — and the tab shown now always (one opened from 🔎 or a link stays in sight while open) */
export function visibleTabs(tabs, { full = false, current = null } = {}) {
  return (tabs ?? []).filter(([k]) => full || k === current || !ADVANCED_TABS.includes(k));
}
/** the tabs 「かんたん表示」 hides now ([[key, label]]): the menu's fold lists them */
export function hiddenTabs(tabs, opts = {}) {
  const shown = new Set(visibleTabs(tabs, opts).map(([k]) => k));
  return (tabs ?? []).filter(([k]) => !shown.has(k));
}
/** a help text → its first sentence (to 。 or ！ or ？, the mark kept), at most `max` characters */
export function firstSentence(s, max = 60) {
  const t = String(s ?? '').trim(), m = /^[^。！？]*[。！？]/.exec(t), one = (m ? m[0] : t).trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
/** the tabs this person sees ([[key, label]], the strip's own list) → the menu: [{ title, items: [{ key, label, icon, what }] }]
 *  in GROUPS' order; a tab no group names goes in the last group; a group with none of them is left out */
export function menuGroups(tabs, help = {}) {
  const shown = new Map((tabs ?? []).map(([k, label]) => [k, label]));
  const item = (k) => ({ key: k, label: shown.get(k), icon: TAB_ICONS[k] ?? '•', what: firstSentence(help[k]?.what) });
  const named = new Set(GROUPS.flatMap(([, ks]) => ks));
  const out = GROUPS.map(([title, ks]) => ({ title, items: ks.filter((k) => shown.has(k)).map(item) }));
  const rest = [...shown.keys()].filter((k) => !named.has(k)).map(item);
  if (rest.length) out[out.length - 1].items.push(...rest);
  return out.filter((g) => g.items.length);
}
