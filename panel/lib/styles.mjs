// styles: every colour of the panel. OreUI's own first — the game's: its buttons' textures (pressable_*.png in the game's
// OreUI files) read texel by texel — then the looks someone may pick in 「設定」→「表示」: かわいい, かっこいい and the colours of
// Minecraft's places. Each is the same OreUI — the same shapes, bevels and pixel letters — in other colours, with a pixel tile
// of its own behind the page. Pure: the palettes, the bevels worked out from them as the game works out its own, the contrast of
// every pair of words and their ground, and the stylesheet made from it all: panel/styles.css, written by
//   node lab.mjs panel styles
// (tests/ore-offline.mjs fails when styles.css is not what this module makes, or when a pair reads under WCAG AA). A choice is
// kept in this browser (STYLE_KEY) and put on <html> as data-style before anything is drawn (early.js); 見やすさ's strong
// colours (a11y-contrast) lie over any of them.
import { paint, dataUrl, PARTS } from './pixelicons.mjs';

export const STYLE_KEY = 'bdslab.panel.style';
/** the groups of the picker, in its order */
export const GROUPS = Object.freeze([
  { key: 'ore', name: 'OreUI（統合版そのまま）' },
  { key: 'cute', name: 'かわいい' },
  { key: 'cool', name: 'かっこいい' },
  { key: 'place', name: 'マイクラの場所' },
]);

// ---- colours (pure) ----
const rgb = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) throw new Error(`not a colour: ${hex}`); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };
const hexOf = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** a colour with a share of another mixed in (pure): mix('#3c8527', '#ffffff', 0.2) → '#639d52' */
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hexOf(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (hex) => { const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG's contrast ratio of two colours (pure): 1 … 21 */
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---- the bevel: how the game draws a pressable (pure) ----
// (its textures, 5 × 7 texels: a rim; the top and the left lighter; a lighter texel at the top-right and the bottom-left; the right
//  and the bottom softer; a lip of two texels under the face. Each part is the face with white mixed in — hi, corner, edge —
//  by these shares, exactly: #3c8527 → #639d52 #73a764 #50913d, as pressable_elevated_primary_default.png has them. Hovered, the
//  face darker and its edges brighter; pressed, the face darker still, flat and sunk: the lip gone, the face two texels lower)
export const BEVEL = Object.freeze({ rest: [0.20, 0.28, 0.10], hover: [0.40, 0.58, 0.30], press: [0.20, 0.28, 0.10] });
// (the light button — the game's elevated secondary — draws a stronger bevel, its four sides alike, on a black rim)
export const BEVEL_LIGHT = Object.freeze({ rest: [0.40, 0.64, 0.40], hover: [0.60, 0.85, 0.60], press: [0.20, 0.28, 0.10] });
/** a face's bevel (pure) → { hi, cor, edge } */
export const bevel = (face, [hi, cor, edge]) => ({ hi: mix(face, '#ffffff', hi), cor: mix(face, '#ffffff', cor), edge: mix(face, '#ffffff', edge) });

// ---- the styles: what each says of itself; the rest is worked out (palette) ----
// surfaces: bg (the page), card (a panel), chip/field (sunk things), hi/lo (a panel's light and dark edge), sunk (a field's inner
// shadow), deep (every rim), bgHi (a panel on the page's light edge). words: fg, muted, link, accent, ok, warn, bad. the title
// bar: head, headLo, onHead. pressables: btn (the light button), go (the green one), stop (the red one), nb (the dark one: a
// screen's tabs) — each its face, its face hovered and pressed, its lip (lo), its rim and its words (ink). off: a switch that is
// off. tile: the page's pixel pattern (a grid of letters, and their colours).
const ORE = {
  key: 'ore', group: 'ore', name: 'OreUI', hint: '統合版の画面そのままの色', scheme: 'dark',
  bg: '#313233', card: '#48494a', chip: '#313233', field: '#313233', hi: '#5a5b5c', lo: '#3a3b3c', sunk: '#242425', deep: '#1e1e1f', bgHi: '#3c3d3e', div: '#323334',
  fg: '#ffffff', muted: '#d0d1d4', link: '#a3c2ff', accent: '#6cc349', ok: '#86d562', warn: '#ffd83d', bad: '#ffa3a3',
  head: '#e6e8eb', headLo: '#b1b2b5', onHead: '#1e1e1f',
  btn: { face: '#d0d1d4', hover: '#b1b2b5', press: '#b1b2b5', lo: '#58585a', rim: '#000000', ink: '#1e1e1f', light: true },
  go: { face: '#3c8527', hover: '#2a641c', press: '#1d4d13', lo: '#1d4d13', rim: '#1e1e1f', ink: '#ffffff' },
  stop: { face: '#ca3636', hover: '#c02d2d', press: '#ad1d1d', lo: '#ad1d1d', rim: '#1e1e1f', ink: '#ffffff' },
  nb: { face: '#48494a', hover: '#58585a', press: '#313233', lo: '#313233', rim: '#1e1e1f', ink: '#ffffff' },
  off: '#8c8d90',
};

export const STYLES = Object.freeze([
  ORE,
  // ---- かわいい ----
  { key: 'sakura', group: 'cute', name: 'サクラ', hint: '桜の林のピンク', scheme: 'light',
    bg: '#f2c9d9', card: '#fff4f8', chip: '#fbe4ed', field: '#ffffff', hi: '#ffffff', lo: '#e3b1c4', sunk: '#f1cfdc', deep: '#4b2232', bgHi: '#f8dbe6',
    fg: '#3a1828', muted: '#6e3c51', link: '#a3245c', accent: '#b8365f', ok: '#1d5f24', warn: '#8a4b00', bad: '#a11f19',
    head: '#f5a9c4', headLo: '#d6809f', onHead: '#3a1828',
    btn: { face: '#ffe1ec', hover: '#f6c4d7', press: '#f6c4d7', lo: '#b8728c', rim: '#3a1828', ink: '#3a1828', light: true },
    go: { face: '#b8365f', hover: '#a12c51', press: '#8a2445', lo: '#741c39', rim: '#3a1828', ink: '#ffffff' },
    stop: { face: '#b3261e', hover: '#9f2019', press: '#881a14', lo: '#741510', rim: '#3a1828', ink: '#ffffff' },
    nb: { face: '#fbe1eb', hover: '#f7d0de', press: '#efbccf', lo: '#c98aa2', rim: '#4b2232', ink: '#3a1828' },
    off: '#c995a9',
    tile: { pal: { a: '#f7d7e3', b: '#fbe7ef', c: '#e9b3c7', d: '#efc3d3' }, grid: [
      '................', '..a.............', '.aba........c...', '..a........cdc..', '............c...', '................', '.......a........', '......aba.......',
      '.......a........', '................', '..c.........a...', '.cdc.......aba..', '..c.........a...', '................', '.....a..........', '................'] } },
  { key: 'honey', group: 'cute', name: 'ミツバチ', hint: 'はちみつ色', scheme: 'light',
    bg: '#f4d68f', card: '#fff8e3', chip: '#fdeec4', field: '#fffdf6', hi: '#ffffff', lo: '#e2bd6c', sunk: '#f2e1b1', deep: '#3e2a0a', bgHi: '#f8e3ad',
    fg: '#33240a', muted: '#62491a', link: '#1f4fa3', accent: '#9a5a00', ok: '#2b6a1d', warn: '#8a3f00', bad: '#b3261e',
    head: '#f0b23b', headLo: '#c68a1c', onHead: '#33240a',
    btn: { face: '#fdeab8', hover: '#f3d58b', press: '#f3d58b', lo: '#b48a33', rim: '#33240a', ink: '#33240a', light: true },
    go: { face: '#e8a317', hover: '#cf8f0c', press: '#b57a06', lo: '#8a5a00', rim: '#33240a', ink: '#2a1d06' },
    stop: { face: '#b3261e', hover: '#9f2019', press: '#881a14', lo: '#741510', rim: '#33240a', ink: '#ffffff' },
    nb: { face: '#fdeec4', hover: '#f8e1a4', press: '#f0d184', lo: '#c9a24a', rim: '#3e2a0a', ink: '#33240a' },
    off: '#cfb26e',
    tile: { pal: { a: '#ecc977', b: '#f9e3a8' }, grid: [
      '...aaaa.........', '..a....a........', '.a......a.......', '.a......a.......', '..a....a........', '...aaaa.........', '................', '................',
      '.........aaaa...', '........a.bb.a..', '.......a......a.', '.......a......a.', '........a....a..', '.........aaaa...', '................', '................'] } },
  { key: 'allay', group: 'cute', name: 'アレイ', hint: '空色とラベンダー', scheme: 'light',
    bg: '#cddff9', card: '#f5f8ff', chip: '#e2ebfc', field: '#ffffff', hi: '#ffffff', lo: '#b1c5e8', sunk: '#d7e2f7', deep: '#1f2b4a', bgHi: '#dde8fb',
    fg: '#16213b', muted: '#435273', link: '#2a55c4', accent: '#2a55c4', ok: '#21703a', warn: '#8a4b00', bad: '#b3261e',
    head: '#a3c9ff', headLo: '#739fe0', onHead: '#16213b',
    btn: { face: '#e4edff', hover: '#c8d9fa', press: '#c8d9fa', lo: '#7d95c2', rim: '#16213b', ink: '#16213b', light: true },
    go: { face: '#3765d6', hover: '#2b54bb', press: '#2045a0', lo: '#1b3a88', rim: '#16213b', ink: '#ffffff' },
    stop: { face: '#b3261e', hover: '#9f2019', press: '#881a14', lo: '#741510', rim: '#16213b', ink: '#ffffff' },
    nb: { face: '#e2ebfc', hover: '#d2e0fa', press: '#c2d3f3', lo: '#93aad4', rim: '#1f2b4a', ink: '#16213b' },
    off: '#a3b4d4',
    tile: { pal: { a: '#e8f0fe', b: '#b9cdf1' }, grid: [
      '................', '...a............', '..aaa...........', '...a............', '................', '..........b.....', '................', '......a.........',
      '................', '.............a..', '............aaa.', '.............a..', '...b............', '................', '........a.......', '................'] } },
  // ---- かっこいい ----
  { key: 'netherite', group: 'cool', name: 'ネザライト', hint: '黒と金', scheme: 'dark',
    bg: '#1a1718', card: '#2d2829', chip: '#1f1b1c', field: '#1f1b1c', hi: '#453e3f', lo: '#231f20', sunk: '#141112', deep: '#0b0909', bgHi: '#2a2526',
    fg: '#f4ede6', muted: '#cfc2b8', link: '#a8c7ff', accent: '#f0c04a', ok: '#93d46e', warn: '#ffd27a', bad: '#ff8f85',
    head: '#3b3435', headLo: '#221e1f', onHead: '#f0c04a',
    btn: { face: '#4c4344', hover: '#3e3637', press: '#332c2d', lo: '#211c1d', rim: '#0b0909', ink: '#f4ede6' },
    go: { face: '#d9a521', hover: '#c08f12', press: '#a67a0b', lo: '#6e5108', rim: '#0b0909', ink: '#1a1718' },
    stop: { face: '#b3261e', hover: '#9f2019', press: '#881a14', lo: '#5e0f0b', rim: '#0b0909', ink: '#ffffff' },
    nb: { face: '#3b3435', hover: '#4a4243', press: '#231f20', lo: '#161314', rim: '#0b0909', ink: '#f4ede6' },
    off: '#5d5455',
    tile: { pal: { a: '#211d1e', b: '#262122' }, grid: [
      'a...............', '.a..........b...', '..a..........b..', '...a..........b.', '................', '........a.......', '.........a......', '..........a.....',
      '...........a....', '................', '.b..............', '..b.........a...', '...b.........a..', '..............a.', '................', '................'] } },
  { key: 'sculk', group: 'cool', name: 'ディープダーク', hint: 'スカルクの青緑', scheme: 'dark',
    bg: '#061317', card: '#0c2228', chip: '#08191d', field: '#08191d', hi: '#17404a', lo: '#0a1c21', sunk: '#040e11', deep: '#000507', bgHi: '#0b2026',
    fg: '#dcfbff', muted: '#9fcdd3', link: '#4fe7f2', accent: '#29dfeb', ok: '#7fe08b', warn: '#ffd166', bad: '#ff8f85',
    head: '#0f2d34', headLo: '#06181d', onHead: '#29dfeb',
    btn: { face: '#153a43', hover: '#0f2d34', press: '#0b2429', lo: '#051216', rim: '#000507', ink: '#dcfbff' },
    go: { face: '#29dfeb', hover: '#1cc4cf', press: '#14a7b1', lo: '#0b6d73', rim: '#000507', ink: '#032026' },
    stop: { face: '#b3261e', hover: '#9f2019', press: '#881a14', lo: '#5e0f0b', rim: '#000507', ink: '#ffffff' },
    nb: { face: '#0f2d34', hover: '#15404a', press: '#08191d', lo: '#041014', rim: '#000507', ink: '#dcfbff' },
    off: '#2c4d54',
    tile: { pal: { a: '#0b2a31', b: '#13525c' }, grid: [
      '................', '..a.............', '.aba............', '..a.......a.....', '..........a.....', '.........aaa....', '................', '.....a..........',
      '................', '............a...', '...........aba..', '............a...', '..a.............', '..aa............', '...a............', '................'] } },
  { key: 'realms', group: 'cool', name: 'レルムズ', hint: '統合版の Realms の紫', scheme: 'dark',
    bg: '#1c1530', card: '#2b2245', chip: '#201838', field: '#201838', hi: '#3e3363', lo: '#231b3a', sunk: '#150f26', deep: '#0b0716', bgHi: '#271e40',
    fg: '#ffffff', muted: '#d2c9ef', link: '#b9a3ff', accent: '#ac90f3', ok: '#86d562', warn: '#ffd83d', bad: '#ff8f8f',
    head: '#e3dcfa', headLo: '#b3a6e6', onHead: '#1c1530',
    btn: { face: '#d9d2f5', hover: '#bdb2ea', press: '#bdb2ea', lo: '#5a4a96', rim: '#000000', ink: '#1c1530', light: true },
    go: { face: '#7345e5', hover: '#5d2cc6', press: '#4a1cac', lo: '#4a1cac', rim: '#0b0716', ink: '#ffffff' },
    stop: { face: '#ca3636', hover: '#c02d2d', press: '#ad1d1d', lo: '#ad1d1d', rim: '#0b0716', ink: '#ffffff' },
    nb: { face: '#2b2245', hover: '#3a2f5c', press: '#1c1530', lo: '#150f26', rim: '#0b0716', ink: '#ffffff' },
    off: '#6f6690',
    tile: { pal: { a: '#241b3c' }, grid: [
      '................', '.......a........', '......a.a.......', '.......a........', '................', '................', '................', '................',
      '................', '...............a', 'a.............a.', '...............a', '................', '................', '................', '................'] } },
  // ---- マイクラの場所 ----
  { key: 'nether', group: 'place', name: 'ネザー', hint: 'ネザーラックと溶岩', scheme: 'dark',
    bg: '#2a0d0d', card: '#4a1717', chip: '#320f0f', field: '#320f0f', hi: '#6b2626', lo: '#3a1111', sunk: '#1f0808', deep: '#120404', bgHi: '#3a1414',
    fg: '#fff1e8', muted: '#f2c7b6', link: '#ffbb93', accent: '#ff8c3a', ok: '#a6e07a', warn: '#ffd166', bad: '#ffa497',
    head: '#8e2c2c', headLo: '#5e1a1a', onHead: '#fff1e8',
    btn: { face: '#e8ded3', hover: '#d1c2b4', press: '#d1c2b4', lo: '#7a5b4b', rim: '#000000', ink: '#2a0d0d', light: true },
    go: { face: '#b54a12', hover: '#9e3f0e', press: '#85340b', lo: '#5e2507', rim: '#120404', ink: '#ffffff' },
    stop: { face: '#a01d1d', hover: '#8c1818', press: '#741313', lo: '#560d0d', rim: '#120404', ink: '#ffffff' },
    nb: { face: '#4a1717', hover: '#5c1f1f', press: '#320f0f', lo: '#1f0808', rim: '#120404', ink: '#fff1e8' },
    off: '#6e3a3a',
    tile: { pal: { a: '#341010', b: '#3d1414', c: '#231010' }, grid: [
      'a.....b.....c...', '..b.......a.....', '.....c.........b', '.a........b.....', '....a..c........', '..........a..b..', 'b......a........', '...c.......c....',
      '.........b......', '.a..........a...', '......c.........', '..b.......b...a.', '.............c..', '....a...a.......', 'c...........b...', '......b.........'] } },
  { key: 'end', group: 'place', name: 'ジ・エンド', hint: '虚空とエンドストーン', scheme: 'dark',
    bg: '#100c18', card: '#241d33', chip: '#19142a', field: '#19142a', hi: '#3a2f52', lo: '#1a1526', sunk: '#0b0812', deep: '#050308', bgHi: '#1d1729',
    fg: '#f6f3e3', muted: '#dcd7b9', link: '#d6b8ff', accent: '#c79bf0', ok: '#9ee08a', warn: '#f2e38a', bad: '#ff9a9a',
    head: '#dfe3a6', headLo: '#b4b878', onHead: '#241d33',
    btn: { face: '#eceec4', hover: '#d6da9f', press: '#d6da9f', lo: '#888b52', rim: '#000000', ink: '#1d1729', light: true },
    go: { face: '#8a5aa6', hover: '#774a92', press: '#63397c', lo: '#4f2b64', rim: '#050308', ink: '#ffffff' },
    stop: { face: '#ca3636', hover: '#c02d2d', press: '#ad1d1d', lo: '#ad1d1d', rim: '#050308', ink: '#ffffff' },
    nb: { face: '#2b2340', hover: '#372d52', press: '#19142a', lo: '#0b0812', rim: '#050308', ink: '#f6f3e3' },
    off: '#5a5170',
    tile: { pal: { a: '#625a80', b: '#4a3a66', c: '#2c2440' }, grid: [
      '................', '...........c....', '..a.............', '................', '................', '.......b........', '................', '..............a.',
      '................', '....c...........', '................', '................', '.........a......', '................', '.b..........c...', '................'] } },
  { key: 'ocean', group: 'place', name: '海', hint: 'プリズマリンと深い海', scheme: 'dark',
    bg: '#0b2a33', card: '#12414c', chip: '#0d313b', field: '#0d313b', hi: '#1f5d6a', lo: '#0f3640', sunk: '#071e25', deep: '#031114', bgHi: '#0f3540',
    fg: '#e8fbf7', muted: '#acdfd6', link: '#86e3ff', accent: '#5fd3c2', ok: '#8fe39a', warn: '#ffd166', bad: '#ff9a8a',
    head: '#6fb7a8', headLo: '#4b8f82', onHead: '#072328',
    btn: { face: '#cfeee7', hover: '#a9dcd2', press: '#a9dcd2', lo: '#3f7f74', rim: '#000000', ink: '#072328', light: true },
    go: { face: '#157a6b', hover: '#106457', press: '#0b5146', lo: '#08453b', rim: '#031114', ink: '#ffffff' },
    stop: { face: '#ca3636', hover: '#c02d2d', press: '#ad1d1d', lo: '#ad1d1d', rim: '#031114', ink: '#ffffff' },
    nb: { face: '#134652', hover: '#1a5764', press: '#0d313b', lo: '#071e25', rim: '#031114', ink: '#e8fbf7' },
    off: '#3e6c75',
    tile: { pal: { a: '#0f3540', b: '#12404c' }, grid: [
      '................', '.aa.............', 'a..a....aa......', '....a..a..a.....', '.....aa....a....', '............a..a', '.............aa.', '................',
      '................', '.........bb.....', '........b..b....', '..bb...b....b...', '.b..b.b......b..', 'b....b.........b', '................', '................'] } },
  { key: 'snow', group: 'place', name: '雪原', hint: '雪とトウヒ', scheme: 'light',
    bg: '#dce8f0', card: '#f8fbfd', chip: '#eaf2f7', field: '#ffffff', hi: '#ffffff', lo: '#c2d4e1', sunk: '#dae6ee', deep: '#213244', bgHi: '#e7f0f6',
    fg: '#15212d', muted: '#435465', link: '#1f5c9a', accent: '#2a6fb0', ok: '#24683f', warn: '#8a4b00', bad: '#b3261e',
    head: '#ffffff', headLo: '#c2d4e1', onHead: '#15212d',
    btn: { face: '#eef4f8', hover: '#d5e2ec', press: '#d5e2ec', lo: '#8aa3b8', rim: '#15212d', ink: '#15212d', light: true },
    go: { face: '#2f6b4f', hover: '#255a41', press: '#1c4934', lo: '#163b2a', rim: '#15212d', ink: '#ffffff' },
    stop: { face: '#b3261e', hover: '#9f2019', press: '#881a14', lo: '#741510', rim: '#15212d', ink: '#ffffff' },
    nb: { face: '#eaf2f7', hover: '#dbe7ef', press: '#c9dae6', lo: '#9db4c6', rim: '#213244', ink: '#15212d' },
    off: '#a6bacb',
    tile: { pal: { a: '#ffffff', b: '#eef4f9' }, grid: [
      '................', '...a............', '.a.a.a..........', '..aaa...........', '.aa.aa..........', '..aaa......b....', '.a.a.a..........', '...a............',
      '................', '..........a.....', '.........aaa....', '..........a.....', '....b...........', '................', '..............b.', '................'] } },
]);
/** a style by its key; anything else: OreUI's */
export const styleOf = (key) => STYLES.find((s) => s.key === key) ?? ORE;

/** 見やすさ's strong colours (html.a11y-contrast): over any style, OreUI's shapes in black and white and bright colours */
export const CONTRAST = Object.freeze({
  key: 'contrast', scheme: 'dark',
  bg: '#000000', card: '#121213', chip: '#000000', field: '#000000', hi: '#6e6e70', lo: '#000000', sunk: '#000000', deep: '#b1b2b5', bgHi: '#6e6e70',
  fg: '#ffffff', muted: '#e6e8eb', link: '#b3cdff', accent: '#a0e081', ok: '#a0e081', warn: '#ffe866', bad: '#ff9b9b',
  head: '#ffffff', headLo: '#000000', onHead: '#000000',
  btn: { face: '#ffffff', hover: '#e6e8eb', press: '#d0d1d4', lo: '#000000', rim: '#000000', ink: '#000000', light: true, flat: true },
  go: { face: '#a0e081', hover: '#b6ea9c', press: '#86d562', lo: '#1d4d13', rim: '#000000', ink: '#000000', flat: true },
  stop: { face: '#ff9b9b', hover: '#ffb3b3', press: '#f46d6d', lo: '#7a1010', rim: '#000000', ink: '#000000', flat: true },
  nb: { face: '#121213', hover: '#2a2a2b', press: '#000000', lo: '#000000', rim: '#b1b2b5', ink: '#ffffff', flat: true },
  off: '#8c8d90', line: '#b1b2b5', focus: '#ffe866', toast: '#ffffff', onToast: '#000000', toastBad: '#ff9b9b',
});

// ---- a style → every variable panel.css reads (pure) ----
const VARIANTS = ['btn', 'go', 'stop', 'nb'];
/** a style's variables: { 'bg': '#…', 'btn-hi-h': '#…', … } — the bevel of each pressable in each state worked out, and every
 *  colour a style need not say given its plain default (taken from its others) */
export function palette(s) {
  const v = {
    bg: s.bg, card: s.card, chip: s.chip, field: s.field, hi: s.hi, lo: s.lo, sunk: s.sunk, deep: s.deep, 'bg-hi': s.bgHi,
    fg: s.fg, muted: s.muted, line: s.line ?? s.deep, link: s.link, 'link-h': s.linkH ?? mix(s.link, s.scheme === 'light' ? '#000000' : '#ffffff', 0.3),
    accent: s.accent, ok: s.ok, warn: s.warn, bad: s.bad, focus: s.focus ?? s.fg,
    // (the title bar: a light line over its two-texel shadow, as the game's header — its face with a fifth of white)
    head: s.head, 'head-hi': s.headHi ?? mix(s.head, '#ffffff', 0.2), 'head-lo': s.headLo, 'on-head': s.onHead, 'on-head-dim': s.onHeadDim ?? mix(s.onHead, s.head, 0.2),
    // (a switch's track: a pressable's bevel on its face — the game's toggle, off and on)
    off: s.off, 'off-hi': s.offHi ?? mix(s.off, '#ffffff', BEVEL.rest[0]), 'off-edge': mix(s.off, '#ffffff', BEVEL.rest[2]),
    // (a line between rows: dark, then light — the game's divider: #323334 over #5a5b5c on a panel)
    div: s.div ?? mix(s.card, s.deep, 0.5),
    placeholder: s.placeholder ?? mix(s.fg, s.field, 0.45), veil: s.veil ?? (s.scheme === 'light' ? 'rgb(0 0 0 / 5%)' : 'rgb(255 255 255 / 6%)'),
    note: s.note ?? mix(s.warn, s.card, s.scheme === 'light' ? 0.85 : 0.72), 'note-hi': s.noteHi ?? mix(s.warn, s.card, s.scheme === 'light' ? 0.7 : 0.55),
    code: s.code ?? '#e6e8eb', toast: s.toast ?? (s.scheme === 'light' ? s.fg : s.deep), 'on-toast': s.onToast ?? (s.scheme === 'light' ? '#ffffff' : s.fg), 'toast-bad': s.toastBad ?? s.stop.face,
    'toast-hi': s.toastHi ?? mix(s.toast ?? (s.scheme === 'light' ? s.fg : s.deep), '#ffffff', 0.2),
    // (a pressable that cannot be pressed: the game's grey, whatever the style)
    dis: s.dis ?? '#d0d1d4', 'dis-lo': s.disLo ?? '#b1b2b5', 'dis-rim': s.disRim ?? '#8c8d90', 'on-dis': s.onDis ?? '#58585a',
    // (a field that cannot be typed in: the game's grey, a darker line at its top, on a grey rim)
    'field-dis': s.fieldDis ?? '#b1b2b5', 'field-dis-hi': s.fieldDisHi ?? '#8c8d90', 'field-dis-rim': s.fieldDisRim ?? '#58585a', 'on-field-dis': s.onFieldDis ?? '#313233',
    gold: s.gold ?? '#e5b517', 'gold-hi': s.goldHi ?? '#ffd83d',
  };
  for (const k of VARIANTS) {
    // (the dark one is a screen's tab: the game's tab bar, hovered, keeps the plain shares — tabBar_neutral_hovered.png)
    const p = s[k], shares = p.light ? BEVEL_LIGHT : k === 'nb' ? { ...BEVEL, hover: BEVEL.rest } : BEVEL;
    // (contrast's: flat — the bevel the face itself, nothing between the words and their ground)
    const of = (face, sh) => (p.flat ? { hi: face, cor: face, edge: face } : bevel(face, sh));
    const r = of(p.face, shares.rest), h = of(p.hover, shares.hover), q = of(p.press, shares.press);
    Object.assign(v, {
      [k]: p.face, [`${k}-hi`]: r.hi, [`${k}-cor`]: r.cor, [`${k}-edge`]: r.edge, [`${k}-lo`]: p.lo, [`${k}-rim`]: p.rim,
      [`${k}-hover`]: p.hover, [`${k}-hi-h`]: h.hi, [`${k}-cor-h`]: h.cor, [`${k}-edge-h`]: h.edge,
      [`${k}-press`]: p.press, [`${k}-hi-p`]: q.hi, [`${k}-cor-p`]: q.cor, [`${k}-edge-p`]: q.edge,
    });
  }
  // (each pressable's words: the light button's, the green's — OreUI calls it on-accent — the red's, the dark one's)
  Object.assign(v, { 'on-btn': s.btn.ink, 'on-accent': s.go.ink, 'on-bad': s.stop.ink, 'on-nb': s.nb.ink });
  return v;
}

// ---- the pairs that must read (pure) ----
// [words, ground, at least] — WCAG AA: 4.5:1 for words, 3:1 for a rim or a focus ring against what it is on
export const PAIRS = Object.freeze([
  ['fg', 'bg', 7], ['fg', 'card', 7], ['fg', 'chip', 4.5], ['fg', 'field', 4.5], ['fg', 'nb', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'card', 4.5],
  ['link', 'bg', 4.5], ['link', 'card', 4.5], ['ok', 'card', 4.5], ['ok', 'bg', 4.5], ['warn', 'card', 4.5], ['warn', 'bg', 4.5], ['bad', 'card', 4.5], ['bad', 'bg', 4.5],
  ['on-head', 'head', 7], ['on-head-dim', 'head', 4.5],
  ['on-btn', 'btn', 4.5], ['on-btn', 'btn-hover', 4.5], ['on-btn', 'btn-press', 4.5],
  ['on-accent', 'go', 4.5], ['on-accent', 'go-hover', 4.5], ['on-accent', 'go-press', 4.5],
  ['on-bad', 'stop', 4.5], ['on-bad', 'stop-hover', 4.5], ['on-bad', 'stop-press', 4.5],
  ['on-nb', 'nb', 4.5], ['on-nb', 'nb-hover', 4.5], ['on-nb', 'nb-press', 4.5],
  ['on-toast', 'toast', 7], ['on-toast', 'toast-bad', 4.5], ['on-dis', 'dis', 4.5], ['on-field-dis', 'field-dis', 4.5],
  ['focus', 'bg', 3], ['focus', 'card', 3],
]);
/** every pair under its share in a style (pure) → ['--muted on --card: 4.21 < 4.5', …] */
export function problems(s) {
  const v = palette(s), out = [];
  for (const [a, b, min] of PAIRS) { const r = contrast(v[a], v[b]); if (!(r >= min - 1e-9)) out.push(`${s.key}: --${a} on --${b}: ${r.toFixed(2)} < ${min}`); }
  return out;
}

// ---- the stylesheet (pure) ----
/** a style's pixel tile as a CSS url() (16 × 16 texels, drawn two screen pixels each), or 'none' */
export const tileUrl = (s) => (s.tile ? dataUrl(paint(s.tile.grid, s.tile.pal)) : 'none');
/** the pictures a control draws in its own colours (icons.css has OreUI's): the choice's arrow and the switch's I in their
 *  button's words, the switch's O and the search box's lens readable on their ground, the radio's diamond (pure) */
export function partIcons(s) {
  const v = palette(s), part = (name, pal) => dataUrl(paint(PARTS[name].grid, pal));
  const onOff = [v.deep, v.fg, '#000000', '#ffffff'].sort((a, b) => contrast(b, v.off) - contrast(a, v.off))[0];
  return {
    'chev-ico': part('chev', { k: v['on-btn'] }), 'i-ico': part('switchI', { w: v['on-accent'] }), 'o-ico': part('switchO', { k: onOff }),
    'search-ico': part('lens', { g: v.placeholder }),
    'radio-ico': part('radioOff', { k: v.deep, g: v.off, l: v['off-hi'] }), 'radio-on-ico': part('radioOn', { k: v.deep, g: v.go, l: v['go-hi'], w: v['on-accent'] }),
  };
}
const block = (sel, s, icons = true) => {
  const v = palette(s), lines = [`  color-scheme: ${s.scheme};`];
  for (const [k, x] of Object.entries(v)) lines.push(`  --${k}: ${x};`);
  lines.push(`  --tile: ${tileUrl(s)};`);
  // (OreUI's own pictures are icons.css's: the others' drawn here in their colours)
  if (icons) for (const [k, x] of Object.entries(partIcons(s))) lines.push(`  --${k}: ${x};`);
  return `${sel} {\n${lines.join('\n')}\n}`;
};
/** panel/styles.css as this module writes it (pure) */
export function css() {
  const head = `/* panel/styles.css — written by \`node lab.mjs panel styles\` (panel/lib/styles.mjs): never by hand. Every colour of the
   panel: OreUI's own on :root (the game's buttons read texel by texel — a pressable's bevel is its face with white mixed in,
   as the game's own textures have it), then each style someone may pick in 「設定」 on [data-style] (on <html>: early.js puts it
   there before anything is drawn; on a style's preview in the picker), then 見やすさ's strong colours over any of them. A
   style's --tile is its pixel pattern behind the page. tests/ore-offline.mjs checks this file and every pair of words and
   their ground in every style. */`;
  const blocks = [block(':root, [data-style="ore"]', ORE, false), ...STYLES.filter((s) => s !== ORE).map((s) => block(`[data-style="${s.key}"]`, s)), block('html.a11y-contrast', CONTRAST)];
  return `${head}\n${blocks.join('\n')}\n`;
}
/** the variables every style sets (pure): panel.css may read these and no other colour */
export const VARS = Object.freeze([...Object.keys(palette(ORE)), 'tile']);
