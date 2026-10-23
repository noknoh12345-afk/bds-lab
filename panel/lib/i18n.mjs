// i18n: the panel's words in the language its person reads (pure). The panel is written in Japanese; a language's dictionary
// (panel/i18n/<lang>.json, written by `node lab.mjs panel i18n --merge`) maps each Japanese string of the code — a template's
// with {0} {1}… where its ${…} stand — to what is shown instead. ui/i18n.mjs puts it on the page as the page is drawn:
// the code stays as it is, every screen in every language.
//   pickLang  which language: the one chosen in this browser, else the browser's own, else English
//   compile   a dictionary → its lookup (exact strings, and templates as patterns: the most words first)
//   translate a text → itself in the dictionary's language (its spaces kept; a template's values translated too); a text with
//             no Japanese, or none the dictionary knows, as it is; a translation it made, as it is (translating twice changes nothing)

/** the languages the panel speaks, each named in itself; html: the page's lang (fonts.css picks the letters' shapes by it) */
export const LANGS = Object.freeze([
  { code: 'ja', name: '日本語', html: 'ja' },
  { code: 'en', name: 'English', html: 'en' },
  { code: 'ko', name: '한국어', html: 'ko' },
  { code: 'zh-Hans', name: '简体中文', html: 'zh-Hans' },
  { code: 'zh-Hant', name: '繁體中文', html: 'zh-Hant' },
]);
export const LANG_KEY = 'bdslab.panel.lang';
const CODES = new Set(LANGS.map((l) => l.code));

/** a browser's language tag → ours, or null (pure): ja-JP → ja, zh-TW / zh-HK / zh-Hant-… → zh-Hant, zh-CN / zh-Hans-HK →
 *  zh-Hans (the script, when the tag names it, before the region), en-GB → en */
export function langOf(tag) {
  const t = String(tag ?? '').toLowerCase().replace(/_/g, '-');
  if (/^ja\b/.test(t)) return 'ja';
  if (/^ko\b/.test(t)) return 'ko';
  if (/^zh\b/.test(t)) return /-hans\b/.test(t) ? 'zh-Hans' : /-hant\b|-(tw|hk|mo)\b/.test(t) ? 'zh-Hant' : 'zh-Hans';
  if (/^en\b/.test(t)) return 'en';
  return null;
}
/** which language (pure): the saved choice when it is one of ours, else the first of the browser's we speak, else English */
export function pickLang(saved, browser = []) {
  if (CODES.has(saved)) return saved;
  for (const tag of browser ?? []) { const l = langOf(tag); if (l) return l; }
  return 'en';
}

/** does a text hold Japanese (kana, kanji, Japanese punctuation, full-width forms) */
export const hasJa = (s) => /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/.test(s);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SPACES = /^(\s*)([\s\S]*?)(\s*)$/;

/** a dictionary { key: text } → its lookup { exact: Map, patterns: [{ re, value, needle, marks }], cache: Map } (pure) —
 *  a key found without the spaces around it (a text on the page is looked up by its words); the spaces it had are the text's
 *  own, the translation's are the translation's (' 結果を待つ' → ' Wait…', '（{0} 秒ごと）' → ' (every {0} s)') */
export function compile(dict = {}) {
  const exact = new Map(), patterns = [], keep = [];
  for (const [key, v] of Object.entries(dict)) {
    // (null: words kept in Japanese — 「毎週月曜の朝 9 時に verify」, an example of what to type in Japanese — shown, they are
    //  themselves: no smaller template reads into them)
    if (v === null && !/\{\d+\}/.test(key)) { const k = key.trim(); if (!exact.has(k)) { exact.set(k, { value: k, kl: 0, kt: 0 }); if (hasJa(k)) keep.push(k); } continue; }
    if (typeof v !== 'string') continue;
    const [, kl, k, kt] = SPACES.exec(key), entry = { value: v, kl: kl.length, kt: kt.length };
    if (!/\{\d+\}/.test(k)) { if (!exact.has(k) || (!kl && !kt)) exact.set(k, entry); continue; }
    // (a template: its words between the marks must all be there, in order)
    const parts = k.split(/\{(\d+)\}/), lits = parts.filter((_, i) => i % 2 === 0), marks = parts.filter((_, i) => i % 2 === 1).map(Number);
    const words = lits.join('');
    if (!hasJa(words)) continue;
    // (a mark may be empty: an optional part, `${step ? `の ${n} 段目` : ''}`)
    // (frame: its words are marks alone — 「{0}（{1}）」, 「{0}。{1} 」: it fits Chinese as well, so it counts only when it
    //  translates something inside it)
    patterns.push({ re: new RegExp(`^${lits.map(esc).join('([\\s\\S]*?)')}$`), ...entry, marks, needle: lits.reduce((a, b) => (b.length > a.length ? b : a), ''), size: words.length, frame: !WORDS.test(words) });
  }
  patterns.sort((a, b) => b.size - a.size);
  // (what is left untranslated in a result: its kana — and, in a language not written in Han itself, its kanji too)
  const vals = Object.values(dict).filter((v) => typeof v === 'string'), han = vals.filter((v) => HAN.test(v)).length > vals.length / 2;
  // (the dictionary's own words are translations already — but for one that is a key too: 「表示」 is Chinese and Japanese)
  const own = new Set(vals.filter((v) => !/\{\d+\}/.test(v) && !Object.hasOwn(dict, v)).map((v) => v.trim()));
  // (what is left untranslated is counted without the words kept in Japanese: they are as they should be)
  const kept = keep.length ? new RegExp(keep.sort((a, b) => b.length - a.length).map(esc).join('|'), 'g') : null;
  return { exact, patterns, cache: new Map(), made: new Set(), own, han, kept, left: han ? KANA_G : JA_G };
}

const HAN = /[\u4e00-\u9fff]/;
const WORDS = /[\u3040-\u30fa\u30fc-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
const KANA_G = /[\u3040-\u30fa\u30fc-\u30ff]/g, JA_G = /[\u3040-\u30fa\u30fc-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g;
// (a mark or a picture before or after the words — ⬜, ✅, 🔔, →: kept as it is, the words between translated)
const SYMS = /^((?:[\p{Extended_Pictographic}\p{S}\uFE0F\u200D]|\s)*)([\s\S]*?)((?:[\p{Extended_Pictographic}\p{S}\uFE0F\u200D]|\s)*)$/u;
const NONE = { kl: 0, kt: 0 };

/** a text → itself in the lookup's language (pure but for the lookup's cache). Exact first; else the way that leaves the least
 *  untranslated — every template that fits (the most words first when two do as well), a list joined with 「・」 item by item,
 *  「題: 中身」 each side, the words between a mark before or after them */
export function translate(text, c) {
  if (!c || typeof text !== 'string' || !hasJa(text)) return text;
  const hit = c.cache.get(text);
  if (hit !== undefined) return hit;
  // (a translation is translated already: shown again — the page sees its own words come back — it stays as it is. A language
  //  written in Han reads as Japanese to hasJa, and a template of marks alone (「{0}。{1} 」) fits it: translated again and again,
  //  the page's observer would never rest)
  if (c.made?.has(text) || c.own?.has(text.trim())) return text;
  // (no Japanese but the words kept in it — 「For example: 毎週月曜の朝 9 時に verify」: as it is)
  if (c.kept && !hasJa(text.replace(c.kept, ''))) return text;
  const m = SPACES.exec(text), core = m[2];
  let best = null;
  const left = (s) => ((c.kept ? s.replace(c.kept, '') : s).match(c.left) ?? []).length;
  const consider = (out, e, size) => { const n = left(out); if (!best || n < best.n || (n === best.n && size > best.size)) best = { out, e, n, size }; };
  const ex = c.exact.get(core);
  if (ex) best = { out: ex.value, e: ex, n: 0, size: Infinity };
  else {
    for (const p of c.patterns) {
      if (!core.includes(p.needle)) continue;
      const g = p.re.exec(core);
      if (!g) continue;
      // (a mark's value is translated too: a role's name, a screen's — the words around it already are)
      const vs = p.marks.map((_, i) => translate(g[i + 1], c));
      if (p.frame && vs.every((v, i) => v === g[i + 1])) continue;
      consider(p.value.replace(/\{(\d+)\}/g, (all, k) => { const i = p.marks.indexOf(Number(k)); return i < 0 ? all : vs[i]; }), p, p.size);
      // (nothing left untranslated: no smaller template can do better)
      if (best.n === 0) break;
    }
    // (a list the code joined with 「・」, not a key itself: each of its items, joined as the language joins them — when none of
    //  them is known, the list as it is, its 「・」 too)
    if ((!best || best.n) && core.includes('・') && core.length < 2000) {
      const items = core.split('・'), done = items.map((x) => translate(x, c));
      // (and a list of no Japanese but its 「・」 — names, numbers: joined as the language joins)
      if (done.some((x, i) => x !== items[i]) || done.every((x) => !hasJa(x))) consider(done.join(c.exact.get('・')?.value ?? '・'), NONE, 0);
    }
    // (「題: 中身」 the code put together — `${group}: ${screens}`, `${login}: ${label}`: the title and what follows it, each
    //  translated, joined as the language writes a colon)
    const ci = (!best || best.n) && core.length < 2000 ? core.indexOf(': ') : -1;
    if (ci > 0) {
      const a = core.slice(0, ci), b = core.slice(ci + 2), ta = translate(a, c), tb = translate(b, c);
      if (ta !== a || tb !== b) consider(ta + (c.han ? String.fromCharCode(0xff1a) : ': ') + tb, NONE, 0);
    }
    // (a mark before or after the words — `${done ? '✅' : '⬜'} ${title}`: the words translated, the marks kept)
    const sm = (!best || best.n) && SYMS.exec(core);
    if (sm && (sm[1] || sm[3]) && hasJa(sm[2])) { const w = translate(sm[2], c); if (w !== sm[2]) consider(sm[1] + w + sm[3], NONE, 0); }
  }
  // (the text's spaces beyond the key's own stay; the key's own are the translation's to say)
  const res = !best || best.out === core ? text : m[1].slice(0, Math.max(0, m[1].length - best.e.kl)) + best.out + m[3].slice(Math.min(m[3].length, best.e.kt));
  if (c.cache.size > 20000) c.cache.clear();
  c.cache.set(text, res);
  if (res !== text) { if (c.made.size > 20000) c.made.clear(); c.made.add(res); }
  return res;
}
