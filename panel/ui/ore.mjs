// ore: what makes the panel look and move like OreUI beyond its stylesheet — the pixel icons in place of the emoji the
// panel's words carry, the loading mark beside 「…を読んでいます…」 and the dock of five (the screens in groups:
// lib/navmenu.mjs GROUPS).
// The emoji stay in the words: an icon is drawn over one (panel/icons.css), so copying, a screen reader and the tests read
// the words as before. Text is always text; no inline style (the page's CSP allows none).
import { h } from './dom.mjs';
import { EMOJI, isColor } from '../lib/pixelicons.mjs';
import { GROUPS } from '../lib/navmenu.mjs';

/** an icon by name (panel/icons.css draws it): decoration — its meaning is in the words beside it */
export const icon = (name, attrs = {}) => h('i', { class: `pi${isColor(name) ? ' pc' : ''}`, 'data-pi': name, 'aria-hidden': 'true', ...attrs });

// ---- the emoji in the words → pixel icons ----
const KEYS = Object.keys(EMOJI).sort((a, b) => b.length - a.length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** the marks this module draws (longest first: ⚠️ before ⚠) — every one in a text (EMOJI_RE), or is there one (HAS: no lastIndex
 *  to carry from one text to the next) */
export const EMOJI_RE = new RegExp(KEYS.map(esc).join('|'), 'gu');
const HAS = new RegExp(KEYS.map(esc).join('|'), 'u');
// (where text must stay text: form fields, scripts, a picture's own markup — and an icon already drawn)
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'OPTGROUP', 'SELECT', 'TITLE', 'svg', 'SVG', 'CODE', 'PRE']);
/** a text → its parts (pure): plain text and { e: the mark, name: its icon } in order */
export function split(text) {
  const out = [];
  let at = 0;
  for (const m of String(text).matchAll(EMOJI_RE)) {
    if (m.index > at) out.push(String(text).slice(at, m.index));
    out.push({ e: m[0], name: EMOJI[m[0]] });
    at = m.index + m[0].length;
  }
  if (at < String(text).length) out.push(String(text).slice(at));
  return out;
}
const skipped = (node) => { for (let p = node.parentNode; p && p.nodeType === 1; p = p.parentNode) { if (SKIP.has(p.nodeName) || p.classList?.contains('pi') || p.isContentEditable) return true; } return false; };
/** one text node's marks drawn as icons (the mark kept inside: the icon's own words). The words and their icons stay one piece
 *  (span.pt): in a flex row — a card's heading, a button — they are one item, so a long heading wraps beside its icon rather
 *  than leaving it alone on a line, and the words read as one (innerText) */
function draw(node) {
  if (!node.nodeValue || !HAS.test(node.nodeValue) || skipped(node)) return;
  const parts = split(node.nodeValue), doc = node.ownerDocument;
  const piece = h('span', { class: 'pt' });
  for (const p of parts) piece.append(typeof p === 'string' ? doc.createTextNode(p) : h('span', { class: `pi${isColor(p.name) ? ' pc' : ''}`, 'data-pi': p.name }, p.e));
  node.parentNode?.replaceChild(piece, node);
}
/** words that say the page is waiting (pure): 「…を読んでいます…」, a tab's own part still coming 「読み込んでいます…」 */
export const isWaiting = (text) => /読(?:み込)?んでいます…\s*$/.test(String(text ?? ''));
/** an element whose own words say it waits gets OreUI's loading mark (panel.css .ore-wait); when its words change, it goes.
 *  (never a button: its ::before is its face.) Words translated from waiting ones still wait: data-ore-wait holds them */
function waiting(el) {
  if (!el || el.nodeType !== 1 || SKIP.has(el.nodeName) || el.nodeName === 'BUTTON' || !el.classList || el.classList.contains('btn')) return;
  let own = '';
  for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
  if (isWaiting(own) || (el.dataset?.oreWait && el.dataset.oreWait === own.trim())) el.classList.add('ore-wait');
  else if (el.classList.contains('ore-wait')) { el.classList.remove('ore-wait'); delete el.dataset.oreWait; }
}

// ---- the words in the person's language (lib/i18n.mjs, given by panel.js): every text and these attributes as drawn ----
let tr = null;
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
// (what is not the panel's own words: a script, a style, what someone typed or pasted, code, and what says translate="no" —
// a chart's words, inside its svg, are the panel's: translated, though its marks are never drawn there)
const KEEP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
const kept = (node) => { for (let p = node.parentNode; p && p.nodeType === 1; p = p.parentNode) { if (KEEP.has(p.nodeName) || p.getAttribute?.('translate') === 'no' || p.isContentEditable) return true; } return false; };
/** one text node in the person's language (a waiting one keeps its mark: its parent remembers the words) */
function word(node) {
  if (!tr || !node.nodeValue || kept(node)) return;
  const was = node.nodeValue, now = tr(was);
  if (now === was) return;
  if (isWaiting(was) && node.parentNode?.dataset) node.parentNode.dataset.oreWait = now.trim();
  node.nodeValue = now;
}
/** an element's own attributes that people read (a tooltip, a box's hint, what a screen reader says) in their language */
function attrsOf(el) {
  if (!tr || !el || el.nodeType !== 1 || KEEP.has(el.nodeName) || el.getAttribute?.('translate') === 'no') return;
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
}
/** every text under a node: translated, its marks drawn, its waiting words marked */
function walk(root) {
  if (root.nodeType === 3) { if (isWaiting(root.nodeValue)) waiting(root.parentNode); word(root); waiting(root.parentNode); return draw(root); }
  if (root.nodeType !== 1 || KEEP.has(root.nodeName) || root.classList?.contains('pi')) return;
  if (tr) { attrsOf(root); for (const el of root.querySelectorAll?.('[title],[placeholder],[aria-label],[alt]') ?? []) attrsOf(el); }
  const doc = root.ownerDocument, it = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */), found = [];
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (!n.nodeValue) continue;
    if (isWaiting(n.nodeValue)) waiting(n.parentNode);
    found.push(n);
  }
  for (const n of found) { word(n); if (n.parentNode) waiting(n.parentNode); if (n.nodeValue && HAS.test(n.nodeValue)) draw(n); }
}
/** from now on every text the page shows is in the person's language (translate: a text → itself translated; none: as written),
 *  every mark drawn as its icon, every 「…を読んでいます…」 with the loading mark — what is there now and whatever comes (the
 *  page draws its screens anew often) → stop() */
export function pixelEmoji(root = globalThis.document?.body, { translate = null } = {}) {
  tr = translate;
  if (!root || !globalThis.MutationObserver) return () => {};
  walk(root);
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'attributes') { attrsOf(r.target); continue; }
      if (r.type === 'characterData') { word(r.target); waiting(r.target.parentNode); draw(r.target); continue; }
      // (an element's words replaced — textContent, replaceChildren: whether it still waits)
      if (r.target.classList?.contains('ore-wait')) waiting(r.target);
      for (const n of r.addedNodes) walk(n);
    }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true, ...(tr ? { attributes: true, attributeFilter: ATTRS } : {}) });
  return () => mo.disconnect();
}

// ---- the dock: the five groups ----
/** each group of lib/navmenu.mjs GROUPS on the dock: a short name and its icon (the group's own title is the menu's) */
export const DOCK = Object.freeze([
  { key: 'home', label: 'ホーム', icon: 'home' },
  { key: 'make', label: '作る', icon: 'cube' },
  { key: 'link', label: 'つなぐ', icon: 'plug' },
  { key: 'team', label: 'チーム', icon: 'people' },
  { key: 'more', label: '設定', icon: 'gear' },
]);
/** the screens this person sees ([[key, label]], their order) → the dock (pure): [{ key, label, icon, title, tabs: [[key,
 *  label]] }] — GROUPS' order, a group with none of them left out; a screen no group names goes to the last one shown */
export function dockOf(tabs) {
  const shown = new Map((tabs ?? []).map(([k, l]) => [k, l])), named = new Set(GROUPS.flatMap(([, ks]) => ks));
  const out = GROUPS.map(([title, ks], i) => ({ ...DOCK[i], title, tabs: ks.filter((k) => shown.has(k)).map((k) => [k, shown.get(k)]) }));
  const rest = [...shown.keys()].filter((k) => !named.has(k)).map((k) => [k, shown.get(k)]);
  const live = out.filter((g) => g.tabs.length);
  if (rest.length && live.length) live[live.length - 1].tabs.push(...rest);
  return live;
}
/** which group a screen is in (pure) → its key, or null */
export const groupOf = (dock, tab) => dock.find((g) => g.tabs.some(([k]) => k === tab))?.key ?? null;
