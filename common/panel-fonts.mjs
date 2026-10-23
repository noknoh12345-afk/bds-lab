// node lab.mjs panel fonts <folder>: the panel's letters as Minecraft draws them, rebuilt from GNU Unifont (SIL OFL 1.1, the
// font Minecraft itself uses for every letter beyond its own pixel set) into panel/fonts/unifont/ and panel/fonts/fonts.css.
// The folder holds GNU Unifont's own builds (https://unifoundry.com/pub/unifont/): unifont-<v>.otf, unifont_jp-<v>.otf (the
// Japanese shapes), unifont_t-<v>.otf (Taiwan's, for Traditional Chinese) and unifont_upper-<v>.otf (pictographs: the emoji
// drawn in pixels too). It needs Python's fontTools (pip install fonttools brotli) to cut them into small WOFF2 files.
//   - one family per shape: "Ore Unifont" (everything), "Ore Unifont JP" (lang ja), "Ore Unifont T" (lang zh-Hant), "Ore Unifont
//     Upper" (pictographs) — panel.css lists them after "Ore Pixel" (the Latin letters, IdreesInc/Minecraft-Font)
//   - each in slices by unicode-range: the browser fetches only the slices of the letters on the screen. A language's common
//     letters (its country's first-level character set, which holds every letter of the panel's own words — tests/ore-offline.mjs
//     checks each language's words; EXTRA for one that is not) sit in one "core" slice declared last, so it is the one asked for
//     first; the rest come in plain blocks, fetched only when a rarer letter shows (a name, a commit message)
//   - Unifont's pixel is 1/16 of its em: at 16px it is drawn 1:1, beside the Latin face's pixels at 2:1 (as the game does)
// planFonts() is the pure part (which letters go where) — tests/ore-offline.mjs reads it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const OUT = path.join(TOP, 'panel', 'fonts');

// ---- the letters a language uses most (pure): the first level of each country's national character set ----
const dec = (enc, bytes) => new TextDecoder(enc).decode(Uint8Array.from(bytes));
const rows = (enc, r0, r1, cells, keep = () => true) => {
  const out = new Set();
  for (let r = r0; r <= r1; r++) for (const c of cells) { const s = dec(enc, [r, c]); if (s.length === 1 && s !== '�' && keep(s.codePointAt(0))) out.add(s.codePointAt(0)); }
  return out;
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const HAN = (cp) => cp >= 0x4e00 && cp <= 0x9fff;
/** JIS X 0208 level 1 (2,965 kanji), GB 2312 level 1 (3,755 hanzi), Big5's common set (5,401), KS X 1001's Hangul (2,350) */
export function commonSets() {
  return {
    ja: rows('euc-jp', 0xb0, 0xcf, range(0xa1, 0xfe), HAN),
    sc: rows('gbk', 0xb0, 0xd7, range(0xa1, 0xfe), HAN),
    tc: rows('big5', 0xa4, 0xc6, [...range(0x40, 0x7e), ...range(0xa1, 0xfe)], HAN),
    ko: rows('euc-kr', 0xb0, 0xc8, range(0xa1, 0xfe), (cp) => cp >= 0xac00 && cp <= 0xd7a3),
  };
}

/** letters a language's words use beyond its common set: put in its core too — tests/ore-offline.mjs names any missing. Simplified
 *  Chinese: 浏(览器), 铃铛's 铛, 酷炫's 炫 and 薰(衣草), beyond GB 2312's first level; and the schedule's examples, quoted in
 *  Japanese in both Chinese (a schedule is written in Japanese: 毎週月曜の朝 9 時 …) */
const cpsOf = (s) => [...s].map((c) => c.codePointAt(0));
export const EXTRA = Object.freeze({ ja: [], sc: cpsOf('浏铛炫薰毎週曜時後間'), tc: cpsOf('毎'), ko: [] });

/** every letter of the panel's own words as written (its source, in Japanese — not its fonts, not the translations in i18n/):
 *  a Set of code points */
export function panelLetters(dir = path.join(TOP, 'panel')) {
  const out = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'fonts' || e.name === 'i18n' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|html|css|json|webmanifest)$/.test(e.name)) for (const ch of fs.readFileSync(p, 'utf8')) { const cp = ch.codePointAt(0); if (cp >= 0x2000) out.add(cp); }
    }
  };
  walk(dir);
  return out;
}

/** code points → the shortest unicode-range text (pure): "U+3042,U+4E00-4E05" */
export function unicodeRange(cps) {
  const s = [...new Set(cps)].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    const h = (n) => n.toString(16).toUpperCase();
    out.push(i === j ? `U+${h(s[i])}` : `U+${h(s[i])}-${h(s[j])}`);
    i = j;
  }
  return out.join(',');
}

// (blocks in steps: the plain slices — a rare letter brings one of these)
const blocks = (a, b, step) => { const out = []; for (let x = a; x <= b; x += step) out.push([x, Math.min(b, x + step - 1)]); return out; };

/** which letters go in which file (pure): [{ family, file, cps: [code points], core }] — "core" slices last in each family */
export function planFonts({ sets = commonSets(), extra = EXTRA } = {}) {
  const KANA = [...range(0x3000, 0x30ff), ...range(0x31f0, 0x31ff), ...range(0xff00, 0xffef)];
  const plan = [];
  const add = (family, file, cps, core = false) => plan.push({ family, file, cps: [...new Set(cps)].sort((a, b) => a - b), core });
  // Ore Unifont: every script there is — the plain blocks first, then the cores
  add('Ore Unifont', 'unifont/latin-ext', [...range(0x20, 0x2ff), ...range(0x370, 0x52f), ...range(0x1e00, 0x1fff)]);
  add('Ore Unifont', 'unifont/symbols', [...range(0x2000, 0x2bff), ...range(0x2e00, 0x2e7f)]);
  add('Ore Unifont', 'unifont/scripts', [...range(0x530, 0x1dff), ...range(0xa000, 0xabff), ...range(0xfb00, 0xfe2f), ...range(0xfe50, 0xfeff), ...range(0xfff0, 0xfffd)]);
  add('Ore Unifont', 'unifont/cjk-marks', [...range(0x2e80, 0x2fdf), ...range(0x3100, 0x33ff), ...range(0xfe30, 0xfe4f)]);
  blocks(0x3400, 0x4dbf, 2048).forEach(([a, b], i) => add('Ore Unifont', `unifont/han-a${i}`, range(a, b)));
  blocks(0x4e00, 0x9fff, 1536).forEach(([a, b], i) => add('Ore Unifont', `unifont/han-${i}`, range(a, b)));
  add('Ore Unifont', 'unifont/han-compat', range(0xf900, 0xfaff));
  blocks(0xac00, 0xd7a3, 2048).forEach(([a, b], i) => add('Ore Unifont', `unifont/hangul-${i}`, range(a, b)));
  add('Ore Unifont', 'unifont/hangul-jamo', [...range(0x1100, 0x11ff), ...range(0xa960, 0xa97f), ...range(0xd7b0, 0xd7ff)]);
  add('Ore Unifont', 'unifont/core-kana', KANA, true);
  add('Ore Unifont', 'unifont/core-sc', [...sets.sc, ...extra.sc], true);
  add('Ore Unifont', 'unifont/core-ko', [...sets.ko, ...extra.ko, ...range(0x3130, 0x318f)], true);
  // Ore Unifont JP: Japanese shapes where they differ (kana, the unified ideographs, compatibility forms)
  add('Ore Unifont JP', 'unifont-jp/marks', [...range(0x3200, 0x33ff), ...range(0xf900, 0xfaff), ...range(0xfe30, 0xfe4f)]);
  blocks(0x4e00, 0x9fff, 1536).forEach(([a, b], i) => add('Ore Unifont JP', `unifont-jp/han-${i}`, range(a, b)));
  add('Ore Unifont JP', 'unifont-jp/core', [...range(0x3040, 0x30ff), ...range(0x31f0, 0x31ff), ...sets.ja, ...extra.ja, 0x3005, 0x3006, 0x3007], true);
  // Ore Unifont T: Taiwan's shapes (Traditional Chinese) — punctuation centred, the ideographs, bopomofo
  add('Ore Unifont T', 'unifont-t/marks', [...range(0x2e80, 0x2fdf), ...range(0x3100, 0x31ff), ...range(0x3200, 0x33ff), ...range(0xfe30, 0xfe4f)]);
  blocks(0x4e00, 0x9fff, 1536).forEach(([a, b], i) => add('Ore Unifont T', `unifont-t/han-${i}`, range(a, b)));
  add('Ore Unifont T', 'unifont-t/core', [...range(0x3000, 0x303f), ...range(0xff00, 0xffef), ...sets.tc, ...extra.tc], true);
  // Ore Unifont Upper: pictographs (the emoji the words carry, drawn in pixels like the rest)
  add('Ore Unifont Upper', 'unifont-upper/pictographs', [...range(0x1f000, 0x1f2ff), ...range(0x1f300, 0x1f5ff)]);
  add('Ore Unifont Upper', 'unifont-upper/pictographs-2', [...range(0x1f600, 0x1f9ff), ...range(0x1fa00, 0x1faff), ...range(0x1fb00, 0x1fbff)]);
  return plan;
}

/** the stylesheet for a plan (pure): Ore Pixel first, then each family's slices (plain blocks, then cores: the later rule wins) */
export function fontsCss(plan, { pixel = 'pixel/pixel-regular.otf' } = {}) {
  const head = `/* The panel's letters — written by \`node lab.mjs panel fonts\` (common/panel-fonts.mjs): never by hand. Every letter is a pixel
   letter, as in Minecraft: "Ore Pixel" for Latin (IdreesInc/Minecraft-Font, SIL OFL 1.1: pixel/OFL.txt — a fan-made recreation
   of the game's own; no game file), GNU Unifont for everything else (SIL OFL 1.1: unifont/OFL-1.1.txt — the font Minecraft
   itself draws its other letters with), in shapes for Japanese ("Ore Unifont JP") and Traditional Chinese ("Ore Unifont T").
   Sizes: "Ore Pixel" is a 9-pixel em drawn 2:1 at 16px (size-adjust 112.5%), Unifont a 16-pixel em drawn 1:1 at 16px. Each
   family in slices by unicode-range: the browser fetches only those of the letters shown; a later rule is asked first, so a
   language's common letters ("core", last) come in one file. */`;
  const face = (family, src, extra = '') => `@font-face { font-family: "${family}"; font-style: normal; font-weight: 400; font-display: swap; src: url(${src}) format("${src.endsWith('.woff2') ? 'woff2' : 'opentype'}");${extra} }`;
  const lines = [head, face('Ore Pixel', pixel, ' size-adjust: 112.5%;')];
  for (const fam of [...new Set(plan.map((s) => s.family))]) {
    const slices = plan.filter((s) => s.family === fam);
    for (const s of [...slices.filter((x) => !x.core), ...slices.filter((x) => x.core)]) lines.push(face(fam, `${s.file}.woff2`, ` unicode-range: ${unicodeRange(s.cps)};`));
  }
  return `${lines.join('\n')}\n`;
}

/** the files written from Unifont's builds in `dir` (fontTools' subsetter) → { files, bytes } */
export function buildFonts(dir, { out = OUT, py = process.env.PYTHON || 'python3', log = console.log } = {}) {
  const pick = (re) => { const f = fs.readdirSync(dir).filter((x) => re.test(x)).sort().pop(); if (!f) throw new Error(`${dir} に ${re} がありません（https://unifoundry.com/pub/unifont/ の font-builds）`); return path.join(dir, f); };
  const SRC = { 'Ore Unifont': pick(/^unifont-[\d.]+\.otf$/), 'Ore Unifont JP': pick(/^unifont_jp-[\d.]+\.otf$/), 'Ore Unifont T': pick(/^unifont_t-[\d.]+\.otf$/), 'Ore Unifont Upper': pick(/^unifont_upper-[\d.]+\.otf$/) };
  const plan = planFonts();
  for (const d of ['unifont', 'unifont-jp', 'unifont-t', 'unifont-upper']) { fs.rmSync(path.join(out, d), { recursive: true, force: true }); fs.mkdirSync(path.join(out, d), { recursive: true }); }
  let bytes = 0;
  for (const s of plan) {
    const target = path.join(out, `${s.file}.woff2`);
    const r = spawnSync(py, ['-I', '-m', 'fontTools.subset', SRC[s.family], `--unicodes=${s.cps.map((c) => c.toString(16)).join(',')}`, '--flavor=woff2', `--output-file=${target}`,
      '--name-IDs=*', '--name-languages=*', '--notdef-outline', '--no-hinting', '--layout-features=', '--drop-tables+=DSIG'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${s.file}: ${r.stderr || r.error?.message}`);
    bytes += fs.statSync(target).size;
  }
  // (the licence beside the letters: SIL OFL 1.1, as Unifont's own release carries it)
  const ofl = path.join(path.dirname(SRC['Ore Unifont']), 'OFL-1.1.txt');
  if (fs.existsSync(ofl)) fs.copyFileSync(ofl, path.join(out, 'unifont', 'OFL-1.1.txt'));
  fs.writeFileSync(path.join(out, 'fonts.css'), fontsCss(plan));
  log(`✔ panel/fonts: ${plan.length} 個のファイル（${Math.round(bytes / 1024)} KB）と fonts.css`);
  return { files: plan.length, bytes };
}
