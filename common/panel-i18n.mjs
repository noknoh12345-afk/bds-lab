// node lab.mjs panel i18n [--sheet [file..]] [--merge <json>]: the panel's words in other languages. The panel is written in
// Japanese; every Japanese string of its page and code (index.html, panel.js, lib/, ui/) is a key, and panel/i18n/<lang>.json
// holds what it is in that language — a template literal's key with {0} {1}… where its ${…} stand (the same marks in the
// translation, in any order); null for a string the page never shows (a pattern to read what someone typed, a search word kept
// in Japanese). JSON, not a module: one address in the source and in the bundle Pages serves (common/panel-bundle.mjs leaves it
// as it is), named by early.js's preload and kept by sw.js — only the one a person reads is ever fetched. panel/ui/i18n.mjs puts
// them on the page as it is drawn. No parser to install: scanStrings() reads the code's strings itself.
//   (none)              how many keys, and what each language still lacks
//   --sheet [file..]    the keys still missing in some language, by file, each with its line of code: what to translate
//   --merge <json>      { "<key>": { "en": "…", "ko": "…", "zh-Hans": "…", "zh-Hant": "…" } } → into panel/i18n/<lang>.json
//                       (each file rewritten in the code's order; keys no longer in the code dropped)
// tests/i18n-offline.mjs holds every language complete, every mark kept.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PANEL = path.join(TOP, 'panel');
/** the languages the panel speaks besides its own (Japanese) */
export const TARGETS = Object.freeze(['en', 'ko', 'zh-Hans', 'zh-Hant']);
/** a string the panel shows: one with Japanese in it (kana, kanji, Japanese punctuation, full-width forms) */
export const JA = /[　-ヿ㐀-䶿一-鿿＀-￯]/;

// ---- reading the code's strings (pure): a small scanner of JavaScript — strings, templates, comments, regular expressions ----
const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
/** a literal's escapes → its value */
function cook(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (_, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e[1] === '{' ? e.slice(2, -1) : e.slice(1), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === '\n' || e === '\r\n' || e === ' ' || e === ' ') return '';
    return ESC[e] ?? e;
  });
}
const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
/** every string and template literal of a script (pure): [{ kind: 'str', value, line } | { kind: 'tpl', parts, exprs, line }] —
 *  a template's ${…} read too (its strings are listed on their own) */
export function scanStrings(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const lineAt = (k) => { let l = 1; for (let j = 0; j < k; j++) if (src.charCodeAt(j) === 10) l++; return l; };
  // (reads code from i until `stop` at depth 0, or the end) → the index of `stop`
  function code(stop) {
    let depth = 0, last = '';
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '\'' || c === '"') { const at = i; const v = quoted(c); out.push({ kind: 'str', value: v, line: lineAt(at), at }); last = 'lit'; continue; }
      if (c === '`') { template(); last = 'lit'; continue; }
      if (c === '/') {
        const regex = last === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(last) || last === '=>' || KEYWORDS_BEFORE_REGEX.has(last);
        if (regex) { regexLit(); last = 'lit'; continue; }
        i++; last = '/'; continue;
      }
      if (c === '{' || c === '(' || c === '[') { depth++; i++; last = c; continue; }
      if (c === '}' || c === ')' || c === ']') {
        if (depth === 0 && c === stop) return i;
        depth--; i++; last = c; continue;
      }
      if (/[\w$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; last = src.slice(i, j); if (/^\d/.test(last)) last = 'num'; i = j; continue; }
      if (c === '=' && src[i + 1] === '>') { i += 2; last = '=>'; continue; }
      i++; last = c;
    }
    return i;
  }
  function quoted(q) {
    const s = ++i;
    while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    const raw = src.slice(s, i); i++;
    return cook(raw);
  }
  function regexLit() {
    i++;
    let cls = false;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) break; else if (c === '\n') break;
      i++;
    }
    i++;
    while (i < n && /[a-z]/i.test(src[i])) i++;
  }
  function template() {
    const at = i, parts = [], exprs = [];
    i++;
    let s = i;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { parts.push(cook(src.slice(s, i))); i++; break; }
      if (c === '$' && src[i + 1] === '{') {
        parts.push(cook(src.slice(s, i)));
        i += 2;
        const e0 = i, e1 = code('}');
        exprs.push(src.slice(e0, e1).trim());
        i = e1 + 1; s = i;
        continue;
      }
      i++;
    }
    out.push({ kind: 'tpl', parts, exprs, line: lineAt(at), at });
  }
  code(null);
  return out;
}

/** a string's key (pure): its value, or a template's parts with {0} {1}… where its ${…} stand */
export const keyOf = (s) => (s.kind === 'str' ? s.value : s.parts.map((p, k) => (k ? `{${k - 1}}` : '') + p).join(''));
/** the marks of a key or a translation (pure), sorted: ['{0}', '{1}'] */
export const marks = (s) => [...String(s).matchAll(/\{(\d+)\}/g)].map((m) => m[0]).sort();

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: '\u00a0' };
/** the words of a page's own HTML (pure): its title and every text between its tags — not in <script>, <style> or <noscript>
 *  (no script runs there to translate it: index.html says that one in both languages) nor a comment — as strings, each with
 *  its line; ui/ore.mjs translates them on the page at start, ui/i18n.mjs the title */
export function htmlStrings(src) {
  const out = [], text = String(src).replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi, (m) => m.replace(/[^\n]/g, ' '));
  const lineAt = (k) => text.slice(0, k).split('\n').length;
  for (const m of text.matchAll(/>([^<>]+)</g)) {
    const value = m[1].replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? all));
    if (value.trim()) out.push({ kind: 'str', value, line: lineAt(m.index) });
  }
  return out;
}

/** the files whose strings the panel shows: its page, its script, its libraries and views */
export function sourceFiles(dir = PANEL) {
  const mods = (d) => (fs.existsSync(path.join(dir, d)) ? fs.readdirSync(path.join(dir, d)).filter((f) => /\.m?js$/.test(f)).sort().map((f) => `${d}/${f}`) : []);
  return [...(fs.existsSync(path.join(dir, 'index.html')) ? ['index.html'] : []), 'panel.js', ...mods('lib'), ...mods('ui')];
}
/** every key, in the code's order: Map(key → { file, line, code }) — the first place it is written */
export function catalog(dir = PANEL) {
  const cat = new Map();
  for (const f of sourceFiles(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8'), lines = src.split('\n');
    for (const s of f.endsWith('.html') ? htmlStrings(src) : scanStrings(src)) {
      const key = keyOf(s);
      if (!JA.test(key) || cat.has(key)) continue;
      cat.set(key, { file: f, line: s.line, code: (lines[s.line - 1] ?? '').trim().slice(0, 160) });
    }
  }
  return cat;
}
/** a language's dictionary file */
export const dictFile = (lang, dir = PANEL) => path.join(dir, 'i18n', `${lang}.json`);
/** a language's dictionary as it is on disk: { key: text } ({} when there is none yet) */
export async function dictionary(lang, dir = PANEL) {
  const f = dictFile(lang, dir);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
}
/** a dictionary as its file (pure): JSON, the keys in the catalog's order, one per line (a change is a line in a diff) */
export function dictText(dict, order) {
  const keys = order.filter((k) => typeof dict[k] === 'string' || dict[k] === null);
  return `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dict[k])}`).join(',\n')}\n}\n`;
}
/** what each language still lacks: { lang: [keys] } */
export async function missing(dir = PANEL) {
  const order = [...catalog(dir).keys()], out = {};
  for (const l of TARGETS) { const d = await dictionary(l, dir); out[l] = order.filter((k) => !(d[k] === null || (typeof d[k] === 'string' && d[k].trim()))); }
  return out;
}

export async function i18nCmd(args, out = console.log) {
  const cat = catalog(), order = [...cat.keys()];
  const m = args.indexOf('--merge');
  if (m >= 0) {
    const add = JSON.parse(fs.readFileSync(path.resolve(args[m + 1]), 'utf8'));
    fs.mkdirSync(path.join(PANEL, 'i18n'), { recursive: true });
    for (const l of TARGETS) {
      const d = await dictionary(l);
      for (const [k, v] of Object.entries(add)) if (typeof v?.[l] === 'string' || v?.[l] === null) d[k] = v[l];
      fs.writeFileSync(dictFile(l), dictText(d, order));
    }
    const left = await missing();
    out(`✔ panel/i18n: ${Object.keys(add).length} 個を入れました。足りないもの: ${TARGETS.map((l) => `${l} ${left[l].length}`).join('・')}`);
    return true;
  }
  const left = await missing();
  if (args.includes('--sheet')) {
    const only = args.filter((a) => !a.startsWith('--'));
    const need = new Set(TARGETS.flatMap((l) => left[l]));
    let last = '';
    for (const k of order) {
      const c = cat.get(k);
      if (!need.has(k) || (only.length && !only.some((f) => c.file.includes(f)))) continue;
      if (c.file !== last) { out(`\n## ${c.file}`); last = c.file; }
      out(`${JSON.stringify(k)}\t// ${c.line}: ${c.code}`);
    }
    return true;
  }
  out(`panel の文言: ${order.length} 個。足りないもの: ${TARGETS.map((l) => `${l} ${left[l].length}`).join('・')}`);
  return TARGETS.every((l) => !left[l].length);
}
