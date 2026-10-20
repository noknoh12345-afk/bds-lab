// navmenu: the panel's screens for the 「☰」 menu and the tab strip (pure) — each tab's icon, the screens in a few groups by
// what a person comes to do, and one line of what each is for (the first sentence of its help, lib/guide.mjs HELP). A phone
// shows five tabs of the strip at a time: the menu shows them all at once, grouped and said.

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
