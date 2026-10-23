// The panel in its five languages, without a browser: every Japanese string of its page and code (common/panel-i18n.mjs reads
// them) in each of panel/i18n/<lang>.json — translated, or null for one never shown, the same in every language — with the same
// {0} marks; no Japanese left in a translation but what it quotes on purpose (the schedule's examples: a schedule is written in
// Japanese); each language's own punctuation; the dictionaries as `node lab.mjs panel i18n --merge` writes them. Then the pure
// parts: the code's strings read (lib/i18n.mjs is not a parser to install), which language a browser gets, the lookup — a text
// translated with its spaces, its template's values, its lists — and ui/i18n.mjs: the page told, a report's lines and a table's
// cells, a choice kept.
// node tests/i18n-offline.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(TOP, p)).href);
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.stack?.split('\n').slice(0, 3).join('\n     ') ?? e.message}`); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} want ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const some = (list, n = 5) => list.slice(0, n).map((x) => JSON.stringify(x).slice(0, 120)).join('\n       ');

const I = await imp('common/panel-i18n.mjs'), L = await imp('panel/lib/i18n.mjs');
const cat = I.catalog(), order = [...cat.keys()];
const dicts = Object.fromEntries(await Promise.all(I.TARGETS.map(async (l) => [l, await I.dictionary(l)])));
const where = (k) => { const c = cat.get(k); return c ? `${c.file}:${c.line}` : '?'; };

await t('the languages: Japanese (the code\'s own) and the four of panel/i18n/, each named in itself, each with its dictionary\'s loader', () => {
  eq(L.LANGS.map((l) => l.code), ['ja', ...I.TARGETS]);
  eq(L.LANGS.map((l) => l.name), ['日本語', 'English', '한국어', '简体中文', '繁體中文']);
  for (const l of I.TARGETS) ok(fs.existsSync(path.join(TOP, 'panel/i18n', `${l}.json`)), `panel/i18n/${l}.json`);
  eq(fs.readdirSync(path.join(TOP, 'panel/i18n')).sort(), [...I.TARGETS.map((l) => `${l}.json`)].sort(), 'nothing else there');
  ok(order.length > 2000, `${order.length} strings`);
});

await t('every string of the page and the code is in every language: translated, or null (never shown) — no key the code no longer has', () => {
  for (const l of I.TARGETS) {
    const d = dicts[l];
    const lack = order.filter((k) => !(d[k] === null || (typeof d[k] === 'string' && d[k].trim())));
    eq(lack.length, 0, `${l} lacks ${lack.length} (node lab.mjs panel i18n --sheet):\n       ${some(lack.map((k) => `${where(k)} ${k}`))}\n      `);
    const stale = Object.keys(d).filter((k) => !cat.has(k));
    eq(stale.length, 0, `${l} keeps ${stale.length} the code no longer has:\n       ${some(stale)}\n      `);
  }
});

await t('a string never shown is null in every language, the same ones', () => {
  const nulls = (l) => order.filter((k) => dicts[l][k] === null);
  const en = nulls('en');
  for (const l of I.TARGETS) eq(nulls(l), en, `${l}'s nulls`);
  ok(en.length < order.length / 10, `${en.length} never shown: too many to be true`);
});

await t('every translation has its key\'s marks — {0} {1}… all there, none made up — in any order', () => {
  for (const l of I.TARGETS) {
    const bad = order.filter((k) => typeof dicts[l][k] === 'string' && JSON.stringify(I.marks(dicts[l][k])) !== JSON.stringify(I.marks(k)));
    eq(bad.map((k) => `${k} → ${dicts[l][k]}`), [], `${l}`);
  }
});

await t('no Japanese left in a translation but what its key quotes (a schedule is written in Japanese: its examples stay); English and Korean no kanji either', () => {
  // (kana — not 「・」, which is everyone's — and, for English and Korean, kanji: a run of them must be the key's own words)
  const KANA = /[ぁ-ゖゝ-ゟァ-ヺヽ-ヿ]/;
  const runs = (s, re) => [...s.matchAll(re)].map((m) => m[0]);
  for (const l of I.TARGETS) {
    const han = l === 'en' || l === 'ko';
    const bad = [];
    for (const k of order) {
      const v = dicts[l][k];
      if (typeof v !== 'string') continue;
      for (const r of runs(v, /[ぁ-ゟ゠-ヿ一-鿿々〆]+/g)) if ((KANA.test(r) || (han && /[一-鿿]/.test(r))) && !k.includes(r) && !L.LANGS.some((x) => x.name === v)) bad.push(`${where(k)} ${k} → ${v}`);
    }
    eq(bad.length, 0, `${l}: ${bad.length}\n       ${some(bad)}\n      `);
  }
});

await t('each language its own punctuation: English and Korean none of the full-width kind, Simplified Chinese “” and Traditional 「」, no Japanese 「〜」', () => {
  const strs = (l) => order.map((k) => dicts[l][k]).filter((v) => typeof v === 'string');
  for (const l of ['en', 'ko']) {
    const bad = strs(l).filter((v) => /[（）：、。！？「」『』〜＋]/.test(v));
    eq(bad.length, 0, `${l}:\n       ${some(bad)}\n      `);
  }
  eq(strs('zh-Hans').filter((v) => /[「」]/.test(v)).length, 0, 'zh-Hans quotes with “”');
  eq(strs('zh-Hant').filter((v) => /[“”]/.test(v)).length, 0, 'zh-Hant quotes with 「」');
  for (const l of ['zh-Hans', 'zh-Hant']) eq(strs(l).filter((v) => /〜/.test(v) || (/・/.test(v) && !/[ぁ-ゟ゠-ヺ]/.test(v))).length, 0, `${l}: 「～」 and 「·」`);
});

await t('panel/i18n/<lang>.json is what `panel i18n --merge` writes: JSON, the keys in the code\'s order, one per line', () => {
  for (const l of I.TARGETS) ok(fs.readFileSync(I.dictFile(l), 'utf8') === I.dictText(dicts[l], order), `panel/i18n/${l}.json is not in the code's order: node lab.mjs panel i18n --merge <a file of {}>`);
  eq(I.dictText({ b: 'B', a: null, z: 1 }, ['a', 'b', 'c']), '{\n  "a": null,\n  "b": "B"\n}\n');
  eq(JSON.parse(I.dictText({ '"引用"\n': 'x' }, ['"引用"\n'])), { '"引用"\n': 'x' }, 'any key, written as JSON');
});

await t('the code\'s strings read: quotes, templates and what is inside their ${…}, past comments and regular expressions (a division is not one)', () => {
  const src = "const a = 'x', b = \"y\\u0041\"; // 'not this'\n/* \"nor this\" */ const r = /['\"]/g, q = n / 2 / k;\nconst s = `a${b ? 'c' : `d${e}`}f`;\nreturn /'/.test(z) && 'z';";
  const got = I.scanStrings(src);
  eq(got.map((s) => [s.kind, I.keyOf(s), s.line]), [['str', 'x', 1], ['str', 'yA', 1], ['str', 'c', 3], ['tpl', 'd{0}', 3], ['tpl', 'a{0}f', 3], ['str', 'z', 4]]);
  eq(I.keyOf({ kind: 'tpl', parts: ['予約しました: ', ''], exprs: ['what'] }), '予約しました: {0}');
  eq(I.marks('{1} と {0}・{1}'), ['{0}', '{1}', '{1}']);
});

await t('the page\'s own HTML read: its title, the words between its tags with their spaces — not a script, a style, a comment or <noscript>', () => {
  const page = '<title>bds-lab 管理パネル</title>\n<style>p::after { content: "字"; }</style><!-- 注 --><h1>bds<span> 管理 &amp; 確認</span></h1>\n<script>x("文")</script><noscript><p>動きます</p></noscript><p>&#x3042;&lt;</p>';
  eq(I.htmlStrings(page).map((s) => [s.value, s.line]), [['bds-lab 管理パネル', 1], ['bds', 2], [' 管理 & 確認', 2], ['あ<', 3]]);
  ok(cat.has('bds-lab 管理パネル') && cat.has(' 管理パネル') && cat.get(' 管理パネル').file === 'index.html', 'index.html\'s title and header are keys');
});

await t('which language: the one chosen in this browser, else the first of the browser\'s own the panel speaks, else English', () => {
  const of = (x) => L.langOf(x);
  eq(['ja-JP', 'JA', 'ko-KR', 'zh-CN', 'zh-SG', 'zh', 'zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-HK', 'zh-Hans-HK', 'zh_TW', 'en-GB', 'en', 'fr-FR', 'jv', 'kok', '', undefined].map(of),
    ['ja', 'ja', 'ko', 'zh-Hans', 'zh-Hans', 'zh-Hans', 'zh-Hant', 'zh-Hant', 'zh-Hant', 'zh-Hant', 'zh-Hant', 'zh-Hans', 'zh-Hant', 'en', 'en', null, null, null, null, null]);
  eq(L.pickLang('ko', ['ja-JP']), 'ko');
  eq(L.pickLang('xx', ['fr', 'zh-TW', 'ja']), 'zh-Hant');
  eq(L.pickLang(null, ['ja-JP']), 'ja');
  eq(L.pickLang(null, []), 'en');
  eq(L.pickLang(undefined, [undefined]), 'en');
  eq(L.pickLang(null, null), 'en');
  eq(['abc', 'あ', '漢', '　', '한국어', 'Ｆ', '→'].map(L.hasJa), [false, true, true, true, false, true, false]);
});

await t('a text translated: exact, its own spaces kept, a key\'s spaces the translation\'s; a template\'s values translated too, in the translation\'s order', () => {
  const c = L.compile({ '設定': 'Settings', ' 結果を待つ': ' Wait for the result', '予約しました: {0}': 'Scheduled: {0}', '{0} を {1} に': '{1} ← {0}', '毎朝': 'every morning', '秘密': null, 'ホーム': 'Home', 'ラボ': 'lab' });
  eq(L.translate('設定', c), 'Settings');
  eq(L.translate('  設定 ', c), '  Settings ', 'the text\'s spaces');
  eq(L.translate(' 結果を待つ', c), ' Wait for the result', 'a key with a space: the translation\'s');
  eq(L.translate('  結果を待つ', c), '  Wait for the result', 'a space beyond the key\'s');
  eq(L.translate('予約しました: verify', c), 'Scheduled: verify');
  eq(L.translate('予約しました: 毎朝', c), 'Scheduled: every morning', 'a value the dictionary knows');
  eq(L.translate('予約しました: 謎', c), 'Scheduled: 謎', 'a value it does not: as it is');
  eq(L.translate('ホーム を ラボ に', c), 'lab ← Home', 'marks in another order');
  eq(L.translate('秘密', c), '秘密', 'null: never shown, so as it is');
  const kept = L.compile({ '毎週月曜の朝 9 時に verify': null, '{0} 時': '{0} h', '{0} 時に {1}': '{0} h: {1}', '例: {0}': 'e.g. {0}', '・': ' · ' });
  eq([L.translate('例: 毎週月曜の朝 9 時に verify', kept), L.translate('9 時', kept)], ['e.g. 毎週月曜の朝 9 時に verify', '9 h'], 'null: words kept in Japanese, no smaller template reading into them');
  eq(L.translate('e.g. 毎週月曜の朝 9 時に verify', kept), 'e.g. 毎週月曜の朝 9 時に verify', 'no Japanese but the words kept: as it is');
  eq([L.translate('hello', c), L.translate(42, c), L.translate('設定', null), L.translate('知らない言葉', c)], ['hello', 42, '設定', '知らない言葉']);
  eq(L.translate('設定', c), 'Settings', 'the same twice (from the cache)');
});

await t('a template: the most words first; a mark may be empty (an optional part); a list joined with 「・」 item by item, joined as the language joins', () => {
  const c = L.compile({ '{0}の{1}': '{1} of {0}', '{0}の設定': '{0}\'s settings', '保存しました{0}': 'Saved{0}', '（{0} 件）': ' ({0})', 'ホーム': 'Home', '設定': 'Settings', '・': ' · ', 'の続き{0}': 'continued{0}' });
  eq(L.translate('ラボの設定', c), 'ラボ\'s settings', '「{0}の設定」 (3 words) before 「{0}の{1}」 (1)');
  eq(L.translate('ラボのホーム', c), 'Home of ラボ');
  eq(L.translate('保存しました', c), 'Saved', 'an empty mark');
  eq(L.translate('保存しました（3 件）', c), 'Saved (3)', 'a mark holding a template of its own');
  eq(L.translate('ホーム・設定', c), 'Home · Settings');
  eq(L.translate('ホーム・謎', c), 'Home · 謎', 'an item it does not know: as it is');
  eq(L.translate('謎・謎', c), '謎・謎', 'nothing known: as it is');
  eq([L.translate('API_TOKEN・ACCOUNT_ID', c), L.translate('5・', c)], ['API_TOKEN · ACCOUNT_ID', '5 · '], 'no Japanese but the 「・」: joined as the language joins');
  // (a mark before or after the words: the words translated, the marks kept — `${done ? '✅' : '⬜'} ${title}`)
  eq([L.translate('⬜ ホーム', c), L.translate('✅ 設定 🔔', c), L.translate('→ 謎', c)], ['⬜ Home', '✅ Settings 🔔', '→ 謎']);
  // (two templates fit: the one that leaves nothing untranslated, though it has fewer words)
  const two = L.compile({ '（{0}）': ' ({0})', '（{0}が{1}）': ' ({0} is {1})', 'GitHub Pages がまだ有効ではありません': 'GitHub Pages is not on yet', 'まだ': 'still' });
  eq(L.translate('（GitHub Pages がまだ有効ではありません）', two), ' (GitHub Pages is not on yet)');
  eq(L.translate('（猫が眠い）', two), ' (猫 is 眠い)', 'neither known: the one with the most words');
  const zh = L.compile({ 'ホーム': '主页', '設定': '设置', '・': '·' });
  eq(L.translate('ホーム・設定', zh), '主页·设置');
  const none = L.compile({ 'ホーム': 'Home', '設定': 'Settings' });
  eq(L.translate('ホーム・設定', none), 'Home・Settings', 'no 「・」 of its own: the list\'s');
  ok(!L.compile({ '{0}: {1}': '{0}: {1}' }).patterns.length, 'a template of no Japanese words is no pattern (it would match anything)');
  // (「題: 中身」 the code put together — `${group}: ${screens}`, `${login}: ${label}`: each side, the colon as the language writes it)
  const col = L.compile({ 'いつも見る': 'Everyday', '概要': 'Overview', '実行': 'Runs', '落ちたとき': 'When it fails', '・': ' · ' });
  eq(L.translate('いつも見る: 概要・実行', col), 'Everyday: Overview · Runs', 'a group: its screens');
  eq(L.translate('author1: 落ちたとき', col), 'author1: When it fails', 'a name that is no Japanese');
  eq(L.translate('謎: 謎', col), '謎: 謎', 'neither side known: as it is');
  eq(L.translate('いつも見る: 概要', L.compile({ 'いつも見る': '常用', '概要': '概览' })), '常用：概览', 'a language written in Han: its own colon');
});

await t('a translation is translated already: shown again (the page sees its own words come back), it stays — a language written in Han reads as Japanese, and the page\'s observer would never rest', () => {
  // (Chinese text fits 「{0}。{1} 」 — a frame of marks alone: once each time it was read, a space more each time)
  const c = L.compile({ '{0}。{1} ': '{0}。{1} ', '（{0}）': '（{0}）', '保存しました。{0}': '已保存。{0}', '概要': '概览', '時間': '时间' });
  const once = L.translate('保存しました。概要', c);
  eq([once, L.translate(once, c), L.translate(L.translate(once, c), c)], ['已保存。概览', '已保存。概览', '已保存。概览'], 'its own translation, as it is');
  eq(L.translate('无法写入。操作仍然有效', c), '无法写入。操作仍然有效', 'a frame that translates nothing inside it: not used');
  eq(L.translate('概要。時間', c), '概览。时间 ', 'a frame that translates what is inside: used');
  eq(L.translate('（时间）', c), '（时间）', 'the dictionary\'s own words: translations already');
  eq(L.translate('（概要）', c), '（概览）');
  // (every key of the real dictionaries, its marks filled: twice is once — in every language)
  for (const l of I.TARGETS) {
    const r = L.compile(dicts[l]), bad = [];
    for (const k of Object.keys(dicts[l])) { const s = k.replace(/\{(\d+)\}/g, (_, i) => ['概要', '12', 'author1'][i % 3]), a = L.translate(s, r); if (L.translate(a, r) !== a) bad.push(a.slice(0, 60)); }
    eq(bad, [], `${l}: translating twice changes nothing`);
  }
});

await t('the real dictionaries: the dock, a sentence with a value, a list, the page\'s title — in each language', () => {
  const want = { en: ['Home', 'Settings', 'Loading…', 'bds-lab management panel'], ko: ['홈', '설정', '불러오는 중…', 'bds-lab 관리 패널'], 'zh-Hans': ['主页', '设置', '正在加载…', 'bds-lab 管理面板'], 'zh-Hant': ['首頁', '設定', '正在載入…', 'bds-lab 管理面板'] };
  for (const l of I.TARGETS) {
    const c = L.compile(dicts[l]);
    eq(['ホーム', '設定', '読み込んでいます…', 'bds-lab 管理パネル'].map((x) => L.translate(x, c)), want[l], l);
    ok(!L.hasJa(L.translate('ホーム・設定', c).replace(/[·・]/g, '')) || l.startsWith('zh'), `${l}: a list`);
  }
});

// (ui/i18n.mjs on a page made of what it touches: the storage, the browser's languages, the document's lang and title)
class E { constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.kids = []; } setAttribute(k, v) { this.attrs[k] = String(v); } addEventListener() {} append(...xs) { this.kids.push(...xs); } }
globalThis.Node ??= class {};
globalThis.document ??= { createElement: (tag) => new E(tag), createTextNode: (s) => ({ data: String(s) }), baseURI: 'https://o.github.io/bds-lab/' };
const U = await imp('panel/ui/i18n.mjs');

await t('ui/i18n.mjs: the chosen language read before anything is drawn — its dictionary, the page\'s lang and title, the browser\'s dialogs in it', async () => {
  const kept = new Map([['bdslab.panel.lang', 'en']]), storage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
  const doc = { documentElement: { lang: 'ja' }, title: 'bds-lab 管理パネル', querySelector: () => null };
  const said = [], w = globalThis.window = { confirm: (m) => { said.push(m); return true; }, alert: (m) => said.push(m), prompt: (m, d) => { said.push(m); return d; } };
  const asked = [], load = async (code) => { asked.push(code); return dicts[code]; };
  eq(await U.startI18n(storage, { languages: ['ja-JP'] }, doc, load), 'en');
  eq(asked, ['en'], 'the chosen one\'s dictionary, and only it');
  eq([U.lang(), doc.documentElement.lang, doc.title], ['en', 'en', 'bds-lab management panel']);
  eq(U.t('設定'), 'Settings');
  w.confirm('設定'); w.alert('ホーム'); eq(w.prompt('設定', 'x'), 'x');
  eq(said, ['Settings', 'Home', 'Settings']);
  delete globalThis.window;
  // (the worker told to keep it: its address beside the page)
  const posted = [];
  ok(U.keepOffline({ active: { postMessage: (m) => posted.push(m) } }) && !U.keepOffline(null) && !U.keepOffline({}), 'told when there is a worker');
  eq(posted, [{ keep: ['https://o.github.io/bds-lab/i18n/en.json'] }]);
  eq(U.dictUrl('ko', 'https://o.github.io/bds-lab/?code=x#runs'), 'https://o.github.io/bds-lab/i18n/ko.json');
  eq(U.dictUrl('zh-Hant', 'https://o.github.io/bds-lab/index.html'), 'https://o.github.io/bds-lab/i18n/zh-Hant.json');
  // (a dictionary that cannot be read — offline and never kept: the panel's own words, Japanese)
  const doc2 = { documentElement: { lang: 'ja' }, title: 'x', querySelector: () => null };
  eq(await U.startI18n({ getItem: () => 'ko' }, {}, doc2, async () => { throw new Error('offline'); }), 'ja');
  eq([U.lang(), doc2.documentElement.lang, U.t('設定'), U.keepOffline({ active: { postMessage: () => {} } })], ['ja', 'ja', '設定', false]);
  // (Japanese: nothing fetched)
  const none = [];
  eq(await U.startI18n({ getItem: () => null }, { languages: ['ja-JP', 'en'] }, null, async (c) => { none.push(c); return {}; }), 'ja');
  eq(none, []);
  await U.startI18n(storage, {}, null, load);
});

await t('ui/i18n.mjs tText: a whole text line by line, a Markdown table cell by cell (its rule row as it is), a line it does not know as it is', () => {
  const md = '# 設定\n\n| ホーム | 設定 |\n|---|:-:|\n| 謎 | ホーム |\n知らない行\n';
  eq(U.tText(md), '# 設定\n\n| Home | Settings |\n|---|:-:|\n| 謎 | Home |\n知らない行\n', '(「# 設定」 is no key: as it is)');
  eq(U.tText(null), null);
});

await t('ui/i18n.mjs setLang: one of the five kept in this browser and the page drawn again; any other refused', () => {
  const kept = new Map(), storage = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
  let reloads = 0;
  eq(U.setLang(storage, 'fr', () => reloads++), false);
  eq(U.setLang(storage, 'zh-Hant', () => reloads++), true);
  eq([kept.get('bdslab.panel.lang'), reloads], ['zh-Hant', 1]);
  eq(U.setLang({ setItem: () => { throw new Error('full'); } }, 'ko', () => reloads++), false, 'a storage that refuses');
});

// ---- early.js: the same choices as the modules, made before anything is drawn ----
const vm = await import('node:vm');
const A11Y = await imp('panel/lib/a11y.mjs');
/** early.js run as a page runs it: <html>, its head, this browser's storage, its languages and media → what it put on <html> */
function early({ saved = {}, langs = [], lang = undefined, media = [], refuse = false } = {}) {
  const root = { lang: 'ja', attrs: {}, classes: new Set(), setAttribute(k, v) { this.attrs[k] = String(v); }, classList: { add: (c) => root.classes.add(c) } };
  const head = [], storage = { getItem: (k) => (k in saved ? saved[k] : null) };
  const sandbox = { document: { documentElement: root, head: { appendChild: (x) => head.push(x) }, createElement: (tag) => ({ tag }) },
    navigator: { languages: langs, language: lang }, matchMedia: (q) => ({ matches: media.includes(q) }), JSON };
  Object.defineProperty(sandbox, 'localStorage', { get: () => { if (refuse) throw new Error('SecurityError'); return storage; } });
  sandbox.globalThis = sandbox;
  vm.runInContext(fs.readFileSync(path.join(TOP, 'panel/early.js'), 'utf8'), vm.createContext(sandbox), { filename: 'panel/early.js' });
  return { lang: root.lang, style: root.attrs['data-style'] ?? null, classes: [...root.classes].sort(), head };
}

await t('early.js: the page\'s language before anything is drawn — what pickLang picks, every time — and that language\'s dictionary asked for at once', () => {
  const cases = [[{}, ['ja-JP']], [{}, ['fr', 'zh-TW', 'ja']], [{}, []], [{}, ['zh-Hans-HK']], [{}, ['ko-KR', 'en']], [{ 'bdslab.panel.lang': 'zh-Hant' }, ['ja']], [{ 'bdslab.panel.lang': 'xx' }, ['en-GB']], [{ 'bdslab.panel.lang': 'en' }, []]];
  for (const [saved, langs] of cases) eq(early({ saved, langs }).lang, L.pickLang(saved['bdslab.panel.lang'] ?? null, langs), JSON.stringify([saved, langs]));
  eq(early({ lang: 'ko' }).lang, 'ko', 'navigator.language when there is no list');
  const en = early({ langs: ['en-US'] });
  eq(en.head, [{ tag: 'link', rel: 'preload', as: 'fetch', href: 'i18n/en.json', crossOrigin: 'anonymous' }], 'its dictionary, beside the page, as ui/i18n.mjs fetches it');
  eq(early({ langs: ['ja'] }).head, [], 'Japanese: none to fetch');
  eq(early({ langs: ['ko'], refuse: true }).lang, 'ko', 'a storage that refuses: the browser\'s own');
});

await t('early.js: the style and 見やすさ on <html> before anything is drawn — as ui/look.mjs and lib/a11y.mjs load(fromMedia()) make them', async () => {
  eq(early({ saved: { 'bdslab.panel.style': 'sakura' } }).style, 'sakura');
  for (const bad of ['ore', 'Sakura', '"><x', 'a'.repeat(30), '', null]) eq(early({ saved: { 'bdslab.panel.style': bad } }).style, null, String(bad));
  const ST = await imp('panel/lib/styles.mjs');
  eq(ST.STYLES.filter((x) => early({ saved: { 'bdslab.panel.style': x.key } }).style !== (x.key === 'ore' ? null : x.key)).map((x) => x.key), [], 'every style\'s key taken');
  const cases = [
    [{}, []], [{}, ['(prefers-reduced-motion: reduce)']], [{}, ['(prefers-contrast: more)']], [{}, ['(forced-colors: active)']],
    [{ 'bdslab.panel.a11y': '{"big":true}' }, []], [{ 'bdslab.panel.a11y': '{"calm":false}' }, ['(prefers-reduced-motion: reduce)']], [{ 'bdslab.panel.a11y': 'not json' }, ['(prefers-contrast: more)']],
    [{ 'bdslab.panel.a11y': '[true]' }, []], [{ 'bdslab.panel.a11y': '{"big":"yes","links":true}' }, []],
  ];
  for (const [saved, media] of cases) {
    const st = { getItem: (k) => saved[k] ?? null }, want = A11Y.classes(A11Y.load(st, A11Y.fromMedia((q) => ({ matches: media.includes(q) })))).sort();
    eq(early({ saved, media }).classes, want, JSON.stringify([saved, media]));
  }
});

await t('the waiting words the page shows before its script (panel.css .boot) are each language\'s own — its dictionary\'s', () => {
  const css = fs.readFileSync(path.join(TOP, 'panel/panel.css'), 'utf8');
  eq(/#main > \.boot::after \{ content: "([^"]+)"; \}/.exec(css)?.[1], '読み込んでいます…');
  for (const l of I.TARGETS) eq(new RegExp(`:root:lang\\(${l}\\) #main > \\.boot::after \\{ content: "([^"]+)"; \\}`).exec(css)?.[1], dicts[l]['読み込んでいます…'], l);
  ok(/<main id="main"><p class="muted boot ore-wait" role="status"><\/p><\/main>/.test(fs.readFileSync(path.join(TOP, 'panel/index.html'), 'utf8')), 'index.html: no words of its own there');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
