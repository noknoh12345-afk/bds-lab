// look: how the panel looks for this person on this device — its style and their own copy of Minecraft's fonts.
//   - the style (lib/styles.mjs): OreUI's own colours, or a look they pick — かわいい, かっこいい, Minecraft's places — each a
//     small OreUI screen in its own colours to press; kept in this browser (localStorage) and put on <html> as data-style
//     (early.js does it before anything is drawn when the page opens), the phone's bar in its title bar's colour
//   - the fonts: the panel's letters are pixel letters made to be shared (fonts/fonts.css: a recreation of the game's Latin face
//     and GNU Unifont, the font Minecraft draws every other script with); the game's own font files are Mojang's and are never
//     shipped. Someone who has the game can pick its font files here: they are kept in this browser alone (IndexedDB) and given
//     to the page as FontFace from their bytes — never sent anywhere, never in a URL. "Ore User Body" and "Ore User Title" come
//     first in panel.css's font stacks.
import { h, toast } from './dom.mjs';
import { STYLES, GROUPS, STYLE_KEY, styleOf } from '../lib/styles.mjs';

// ---- the style ----
/** the style this browser chose: its key ('ore' when none, or one no longer there) */
export function currentStyle(storage) {
  let k = null;
  try { k = storage?.getItem(STYLE_KEY); } catch { /* none kept */ }
  return styleOf(k).key;
}
/** the phone's bar (theme-color) in the title bar's colour of the style in use */
export function themeColor(doc = globalThis.document) {
  const meta = doc?.querySelector?.('meta[name="theme-color"]');
  const head = doc?.documentElement && globalThis.getComputedStyle ? globalThis.getComputedStyle(doc.documentElement).getPropertyValue('--head').trim() : '';
  if (meta && /^#[0-9a-f]{6}$/i.test(head)) meta.setAttribute('content', head);
  return head;
}
/** a style put on the page at once (no reload) and kept in this browser → whether it was kept (it is on the page either way) */
export function setStyle(storage, key, doc = globalThis.document) {
  const st = styleOf(key), root = doc?.documentElement;
  if (root) { if (st.key === 'ore') root.removeAttribute('data-style'); else root.setAttribute('data-style', st.key); }
  themeColor(doc);
  try { if (st.key === 'ore') storage?.removeItem(STYLE_KEY); else storage?.setItem(STYLE_KEY, st.key); return true; } catch { return false; }
}
/** 「スタイル」 in 「設定」: the styles by group, each a small OreUI screen in its own colours (its title bar, a panel on its
 *  ground and tile, a button and the green one) — pressed, the page is in it at once; the one in use pressed in */
export function styleCard(storage) {
  const box = h('div', { class: 'card', id: 'stylecard' });
  const draw = () => {
    const now = currentStyle(storage);
    box.replaceChildren(h('h2', {}, '🎨 スタイル（この端末だけ）'),
      h('p', { class: 'muted' }, 'パネルの色を選べます。形とドットの字は、どれも統合版の OreUI のままです。'),
      ...GROUPS.map((g) => h('div', { class: 'stylegroup' }, h('h3', {}, g.name),
        h('div', { class: 'styles', role: 'group', 'aria-label': g.name }, STYLES.filter((x) => x.group === g.key).map((x) => h('button', {
          type: 'button', class: `stylepick${x.key === now ? ' on' : ''}`, 'data-style': x.key, 'data-pick': x.key, 'aria-pressed': x.key === now ? 'true' : 'false', title: x.hint,
          onclick: () => { const kept = setStyle(storage, x.key); toast(kept ? `スタイルを「${x.name}」にしました（この端末だけ）` : `スタイルを「${x.name}」にしました（このブラウザには残せませんでした）`, !kept); draw(); },
        }, h('span', { class: 'sp', 'aria-hidden': 'true' }, h('span', { class: 'sp-head' }), h('span', { class: 'sp-card' }), h('span', { class: 'sp-btn' }), h('span', { class: 'sp-go' })),
        h('span', { class: 'sp-name' }, x.name), h('span', { class: 'sp-hint' }, x.hint)))))));
  };
  draw();
  return box;
}

/** the two places a font of their own may go: the words, and the headings (Bedrock draws its titles in Minecraft Ten) */
export const FONT_ROLES = Object.freeze([
  { key: 'body', family: 'Ore User Body', what: '本文の字', hint: 'Minecraft-Seven（.otf か .ttf）' },
  { key: 'title', family: 'Ore User Title', what: '見出しの字', hint: 'Minecraft-Ten（.otf）' },
]);
export const MAX_FONT_BYTES = 20 * 1024 * 1024;
const DB = 'bdslab-panel', STORE = 'fonts';

/** a font file's first bytes → its kind, or null when it is not a font (pure): TrueType, OpenType (CFF), WOFF, WOFF2 */
export function fontKind(bytes) {
  const b = new Uint8Array(bytes instanceof ArrayBuffer ? bytes.slice(0, 4) : (bytes ?? []).slice(0, 4));
  if (b.length < 4) return null;
  if (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) return 'truetype';
  return { true: 'truetype', OTTO: 'opentype', wOFF: 'woff', wOF2: 'woff2' }[String.fromCharCode(...b)] ?? null;
}

// ---- this browser's keeping: one IndexedDB store, a record per role { name, size, bytes, at } ----
const open = () => new Promise((ok, no) => {
  if (!globalThis.indexedDB) return no(new Error('このブラウザは IndexedDB を使えません'));
  const r = globalThis.indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error ?? new Error('IndexedDB を開けませんでした'));
});
async function store(mode, fn) {
  const d = await open();
  try {
    return await new Promise((ok, no) => {
      const tx = d.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => no(tx.error);
      tx.onabort = () => no(tx.error ?? new Error('IndexedDB'));
    });
  } finally { d.close(); }
}
const faces = new Map();
/** a role's font in the page (the one before it taken out); null: none */
async function use(role, bytes) {
  const r = FONT_ROLES.find((x) => x.key === role);
  const old = faces.get(role);
  if (old) { globalThis.document?.fonts?.delete(old); faces.delete(role); }
  if (!bytes || !r) return null;
  const face = new globalThis.FontFace(r.family, bytes, { display: 'swap' });
  await face.load();
  globalThis.document.fonts.add(face);
  faces.set(role, face);
  return face;
}

/** at start: each font this browser keeps, in the page; one that no longer loads is forgotten (said once) */
export async function loadUserFonts() {
  if (!globalThis.FontFace || !globalThis.indexedDB) return [];
  const used = [];
  for (const r of FONT_ROLES) {
    let rec = null;
    try { rec = await store('readonly', (s) => s.get(r.key)); } catch { return used; /* no storage here: the panel's own letters */ }
    if (!rec?.bytes) continue;
    try { await use(r.key, rec.bytes); used.push(r.key); } catch {
      await store('readwrite', (s) => s.delete(r.key)).catch(() => {});
      toast(`${r.what}（${rec.name}）を読めなかったので、パネルの字に戻しました`, true);
    }
  }
  return used;
}
/** a file they chose → that role's font, kept in this browser (the file is checked to be a font and to load first) */
export async function setUserFont(role, file) {
  if (!file) return null;
  if (file.size > MAX_FONT_BYTES) throw new Error(`大きすぎます（${Math.round(file.size / 1024 / 1024)} MB。20 MB まで）`);
  const bytes = await file.arrayBuffer();
  if (!fontKind(bytes)) throw new Error('フォントのファイルではありません（.ttf・.otf・.woff・.woff2）');
  try { await use(role, bytes); } catch (e) { throw new Error(`このフォントは読めませんでした（${e?.message ?? e}）`); }
  await store('readwrite', (s) => s.put({ name: file.name, size: file.size, bytes, at: Date.now() }, role));
  return { name: file.name, size: file.size };
}
/** that role's font taken out: the panel's own letters again */
export async function clearUserFont(role) {
  await use(role, null);
  await store('readwrite', (s) => s.delete(role));
}
/** what this browser keeps: { body: { name, size } | null, title: … } */
export async function userFonts() {
  const out = {};
  for (const r of FONT_ROLES) {
    try { const rec = await store('readonly', (s) => s.get(r.key)); out[r.key] = rec ? { name: rec.name, size: rec.size } : null; } catch { out[r.key] = null; }
  }
  return out;
}

/** 「マイクラのフォント」 in 「設定」: where the game's font files are, a file to pick for the words and for the headings, 外す */
export function fontsCard() {
  const rows = h('div', {});
  const draw = async () => {
    const now = await userFonts();
    rows.replaceChildren(...FONT_ROLES.map((r) => {
      const pick = h('input', { type: 'file', id: `font-${r.key}`, accept: '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2', 'aria-label': `${r.what}のフォントを選ぶ` });
      pick.addEventListener('change', async () => {
        try { const got = await setUserFont(r.key, pick.files?.[0]); if (got) toast(`${r.what}を ${got.name} にしました（この端末だけ）`); } catch (e) { toast(`${r.what}: ${e.message}`, true); }
        draw();
      });
      const cur = now[r.key];
      return h('div', { class: 'fontrow', 'data-font': r.key },
        h('div', { class: 'grow' }, h('strong', {}, r.what), h('div', { class: 'muted' }, cur ? `使っています: ${cur.name}（${Math.max(1, Math.round(cur.size / 1024))} KB）` : `なし（パネルのドットの字）・${r.hint}`)),
        h('label', { class: 'btn', for: `font-${r.key}` }, 'ファイルを選ぶ'), pick,
        cur ? h('button', { class: 'danger', 'data-clear': r.key, onclick: async () => { await clearUserFont(r.key).catch((e) => toast(e.message, true)); toast(`${r.what}をパネルのドットの字に戻しました`); draw(); } }, '外す') : null);
    }));
  };
  draw();
  return h('div', { class: 'card', id: 'fontscard' }, h('h2', {}, 'マイクラのフォント（この端末だけ）'),
    h('p', { class: 'muted' }, 'パネルの字は、マイクラと同じドットの字です（英数字はゲームの字の作り直し、日本語・韓国語・中国語などはマイクラが実際に使っている GNU Unifont）。ゲームのフォントのファイルそのものは Mojang のものなので、パネルには入れていません。'),
    h('p', { class: 'muted' }, '統合版を持っていれば、ゲームのフォルダの data/gui/dist/hbui/fonts にあるフォント（本文は Minecraft-Seven、見出しは Minecraft-Ten）を選ぶと、この端末ではその字で出ます。選んだファイルはこのブラウザの中だけに置き、どこにも送りません。日本語などゲームのフォントにない字は、Unifont のままです。'),
    rows);
}
