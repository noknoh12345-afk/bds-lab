// i18n on the page: which language this person reads (lib/i18n.mjs pickLang: the one chosen here, else the browser's own), its
// dictionary read before the panel draws anything (panel/i18n/<lang>.json beside the page — none for Japanese, the panel's own;
// early.js has already asked for it, as the page began), t() for what the code itself says (a search, a dialog) and the page's
// lang (fonts.css picks the letters' shapes by it: Japanese, Taiwanese). The words on the page are translated as they are drawn
// (ui/ore.mjs, given t). A new choice reloads the page. sw.js keeps the dictionary for offline when it is told which one.
import { h } from './dom.mjs';
import { LANGS, LANG_KEY, pickLang, compile, translate } from '../lib/i18n.mjs';

/** a language's dictionary: its address beside the page — the same in the source and in the bundle Pages serves, and the one
 *  early.js preloads (a JSON file: no module to bundle, one address to name) */
export const dictUrl = (code, base = globalThis.document?.baseURI) => new URL(`i18n/${code}.json`, base).href;
const fetchDict = async (code) => {
  const r = await fetch(dictUrl(code), { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${code}.json: ${r.status}`);
  return r.json();
};
let current = 'ja', lookup = null;
/** the language in use */
export const lang = () => current;
/** a text in the language in use (Japanese, or one the dictionary does not know: as it is) */
export const t = (text) => (lookup ? translate(text, lookup) : text);
/** a whole text the panel writes — a report, a weekly message, an issue, notes to copy (shown in <pre>, sent, saved: never on
 *  the page as its words are) — in the language in use: line by line, a Markdown table's row cell by cell */
export const tText = (text) => {
  if (!lookup || typeof text !== 'string') return text;
  return text.split('\n').map((line) => {
    const row = /^(\s*\|)(.*)(\|\s*)$/.exec(line);
    return row && !/^[\s|:-]+$/.test(line) ? `${row[1]}${row[2].split('|').map((c) => t(c)).join('|')}${row[3]}` : t(line);
  }).join('\n');
};

/** the language picked, its dictionary read, the page told (lang, title, the browser's own dialogs) → the language. load: a
 *  language's dictionary ({ key: text }) — fetched beside the page unless given (a test) */
export async function startI18n(storage, nav = globalThis.navigator, doc = globalThis.document, load = fetchDict) {
  let saved = null;
  try { saved = storage?.getItem(LANG_KEY); } catch { /* none kept */ }
  current = pickLang(saved, nav?.languages?.length ? nav.languages : [nav?.language]);
  lookup = null;
  if (current !== 'ja') {
    try { lookup = compile(await load(current)); } catch { current = 'ja'; lookup = null; /* not read (offline and never kept, a newer deploy): the panel's own words */ }
  }
  const info = LANGS.find((l) => l.code === current);
  if (doc?.documentElement) doc.documentElement.lang = info?.html ?? 'ja';
  if (lookup && doc) {
    doc.title = t(doc.title);
    // (confirm, prompt and alert say what the code asks in its words: in the person's)
    const w = globalThis.window ?? globalThis;
    for (const f of ['confirm', 'alert']) { const orig = w[f]; if (typeof orig === 'function') w[f] = (m) => orig.call(w, t(String(m ?? ''))); }
    const p = w.prompt; if (typeof p === 'function') w.prompt = (m, d) => p.call(w, t(String(m ?? '')), d);
    // (the tab's title, as panel.js changes it: 「(2) …」)
    const title = doc.querySelector('title');
    if (title && globalThis.MutationObserver) new MutationObserver(() => { const v = t(doc.title); if (v !== doc.title) doc.title = v; }).observe(title, { childList: true, characterData: true, subtree: true });
  }
  return current;
}
/** the service worker (its registration) told to keep this language's dictionary for offline — it fetches it itself, and only
 *  if it is a dictionary of this panel (sw.js isDict); Japanese has none to keep */
export function keepOffline(reg) {
  if (!lookup || !reg?.active) return false;
  try { reg.active.postMessage({ keep: [dictUrl(current)] }); return true; } catch { return false; }
}
/** a language chosen: kept in this browser, the page drawn again in it */
export function setLang(storage, code, reload = () => globalThis.location?.reload()) {
  if (!LANGS.some((l) => l.code === code)) return false;
  try { storage?.setItem(LANG_KEY, code); } catch { return false; }
  reload();
  return true;
}
/** the languages as buttons, each named in itself (on the door: the first thing someone who does not read Japanese needs) */
export function langButtons(storage) {
  return h('div', { class: 'langs', role: 'group', 'aria-label': 'Language / 言語', translate: 'no' },
    LANGS.map((l) => h('button', { class: `linkish${l.code === current ? ' on' : ''}`, lang: l.html, 'data-lang': l.code, 'aria-current': l.code === current ? 'true' : null, onclick: () => setLang(storage, l.code) }, l.name)));
}
/** 「言語」 in 「設定」: a choice of the languages, each named in itself */
export function langSelect(storage) {
  const sel = h('select', { id: 'langsel', 'aria-label': 'Language / 言語', translate: 'no', onchange: (e) => setLang(storage, e.target.value) },
    LANGS.map((l) => h('option', { value: l.code, lang: l.html, selected: l.code === current ? 'selected' : null }, l.name)));
  return h('label', { for: 'langsel' }, '言語（Language）', sel);
}
