// viewer: a run's artifact opened in the panel — its pictures shown as pictures, its videos played, every other file read
// (text and JSON as text, the rest as a hex dump), a .mcaddon / .zip / .tar / .gz inside opened in turn, and a run's
// results.sealed opened with the vault key typed into this browser (a public lab's results: tests/viewer-offline.mjs). On a
// phone as on a computer: nothing to download and unzip first. Over the page, a level at a time: ✕ closes it, Esc and the
// browser's own back (a phone's back, a swipe) go up one. Each file can be saved or shared from here (a .mcaddon shared to
// Minecraft goes straight in). The bytes come through lib/artifact.mjs (the lab's sign-in service, with this person's token)
// and lib/unpack.mjs; pictures and videos are shown from blob: addresses of this page (index.html's img-src and media-src),
// all of them let go when the viewer closes.
//   openViewer(ctx, art, { slug, runUrl }) — art: an artifact as GitHub lists it ({ id, name, size_in_bytes, expires_at })
//   ctx: { authUrl, token() (the person's GitHub token), fresh() (the sign-in renewed: true when it was), vault() (the key typed
//          in 「設定」), saveVault(value) }
import { h, toast } from './dom.mjs';
import { fmtBytes } from '../lib/model.mjs';
import * as U from '../lib/unpack.mjs';
import { artifactReader, artifactBox } from '../lib/artifact.mjs';

const ICON = { image: '🖼', video: '🎬', audio: '🎵', text: '📄', pdf: '📕', archive: '📦', sealed: '🔒', binary: '📎', unknown: '📎' };
const WORD = { image: '画像', video: '動画', audio: '音', text: '文字', pdf: 'PDF', archive: '中に入ったファイル', sealed: '暗号化された結果', binary: 'ファイル', unknown: 'ファイル' };
const FILTERS = [['all', 'すべて'], ['image', '画像'], ['video', '動画'], ['text', '文字'], ['other', 'ほか']];
const PACK = /\.(mcaddon|mcpack|mcworld|mctemplate)$/i;
// (how much is shown at once: a long log a part first, a big folder a page of rows, a gallery a screenful or two)
const TEXT_MAX = 400_000, ROWS = 400, TILES = 60, SEALED_AUTO = 64 * 2 ** 20;

let current = null;
/** the artifact `art` (as GitHub lists it) opened over the page → { close } */
export function openViewer(ctx, art, { slug, runUrl = null } = {}) {
  current?.close(true);
  const urls = new Set(), was = document.activeElement, levels = [];
  const run = art?.workflow_run?.id, github = runUrl ? `${runUrl}#artifacts` : slug && run ? `https://github.com/${slug}/actions/runs/${run}#artifacts` : null;
  /** a file's bytes → a blob: address of this page (one a file and its type), let go when the viewer closes */
  const made = new WeakMap();
  const urlOf = (f, b) => {
    const got = made.get(f);
    if (got?.mime === f.mime) return got.url;
    const url = URL.createObjectURL(new Blob([b], { type: f.mime }));
    urls.add(url); made.set(f, { mime: f.mime, url });
    return url;
  };

  // ---- the frame: a bar (back, where, ✕), how far a big read is, the level's body ----
  const back = h('button', { class: 'vback', type: 'button', 'aria-label': '戻る', title: '戻る（Esc）', onclick: () => up() }, '←');
  const title = h('div', { class: 'vtitle', id: 'viewer-title', tabindex: '-1' }), close = h('button', { class: 'x', type: 'button', 'aria-label': '閉じる', title: '閉じる', onclick: () => shut() }, '✕');
  const bar = h('i'), barText = h('span'), prog = h('div', { class: 'vprog', hidden: true, role: 'status', 'aria-live': 'polite' }, h('div', { class: 'bar' }, bar), barText);
  const body = h('div', { class: 'vbody' });
  const root = h('div', { id: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'viewer-title' },
    h('div', { class: 'vbar' }, back, title, close), prog, body);
  // (keys wherever the focus is — a level drawn again takes the button that was pressed away: Esc goes up a level, a
  //  picture's ← → to the one before or after)
  let keys = null;
  const onKey = (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '');
    // (Esc in a box with words in it clears them, as the browser does: the viewer stays)
    if (e.key === 'Escape') { if (typing && e.target.value) return; e.preventDefault(); up(); return; }
    if (keys && !typing) keys(e);
  };
  /** a read's progress, for the big ones (a megabyte or more) */
  const onProgress = (done, total) => {
    if (!(total >= 1e6)) return;
    prog.hidden = done >= total;
    bar.style.width = `${Math.min(100, Math.round((done / total) * 100))}%`;
    barText.textContent = `読み込み中 ${fmtBytes(done)} / ${fmtBytes(total)}`;
  };

  // ---- levels: the artifact, a file, an archive inside — the browser's back goes up one (a history entry each) ----
  let pushed = 0, hist = true;
  const onPop = () => { pushed = Math.max(0, pushed - 1); if (levels.length > 1) { levels.pop(); draw(); } else shut(true); };
  function push(level) {
    levels.push(level);
    if (hist) { try { history.pushState({ bdslabViewer: levels.length }, ''); pushed++; } catch { hist = false; } }
    draw();
  }
  /** this level swapped for another (the next picture): no new step back */
  const swap = (level) => { levels[levels.length - 1] = level; draw(); };
  function up() {
    if (hist && pushed > 0) return history.back();
    if (levels.length > 1) { levels.pop(); draw(); } else shut();
  }
  function shut(fromPop = false, quiet = false) {
    globalThis.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey);
    // (quiet: another viewer takes this one's place at once — its steps back are left, so the two never cross)
    if (!fromPop && !quiet && hist && pushed > 0) { try { history.go(-pushed); } catch { /* left as it is */ } }
    pushed = 0;
    root.remove();
    document.body.classList.remove('vopen');
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
    io?.disconnect();
    if (current === me) current = null;
    was?.focus?.();
  }
  function draw() {
    const l = levels.at(-1), pane = h('div', { class: 'vpane' });
    keys = null;
    // (the tiles of the level before: no longer watched, their reads not started)
    io?.disconnect(); jobs.clear(); queue.length = 0;
    back.hidden = levels.length < 2;
    title.replaceChildren(h('b', {}, l.title), l.sub ? h('small', {}, l.sub) : null);
    // (a pane of its own each time: a level still reading when another is shown finishes into a pane no longer there)
    body.replaceChildren(pane);
    body.scrollTop = 0;
    prog.hidden = true;
    l.draw(pane);
    // (a level after the first: the focus on its name, read out first)
    if (levels.length > 1 && root.isConnected) title.focus({ preventScroll: true });
  }

  // ---- pictures and videos in the gallery: read when they come into sight, three at a time ----
  const jobs = new Map(), queue = [];
  let running = 0;
  const pump = () => { while (running < 3 && queue.length) { const job = queue.shift(); running++; job().catch(() => { /* the tile stays a name: tapping it says why */ }).finally(() => { running--; pump(); }); } };
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); const j = jobs.get(e.target); jobs.delete(e.target); if (j) { queue.push(j); pump(); } } }, { rootMargin: '300px' }) : null;
  const later = (el, job) => { if (io) { jobs.set(el, job); io.observe(el); } else { queue.push(job); pump(); } };

  /** a failure where the level's content would be: what, why, and the ways on */
  const failed = (box, e, retry) => box.replaceChildren(h('div', { class: 'bad', role: 'alert' }, e?.message ?? String(e ?? '読めませんでした')),
    h('div', { class: 'row' }, retry ? h('button', { type: 'button', onclick: retry }, 'もう一度') : null, github ? h('a', { href: github, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub で取る') : null));
  const loading = (what = '読み込んでいます…') => h('p', { class: 'muted' }, what);

  // ---- a box: its sealed results (opened with the key), its gallery, its files ----
  /** the files shown for a box: its own, and those of each results.sealed opened in it (under its name) */
  const entries = (box) => [...box.files.map((f) => ({ f, folder: f.folder })), ...[...(box.opened ?? new Map())].flatMap(([sf, ib]) => ib.files.map((f) => ({ f, folder: [`🔓 ${sf.path}`, f.folder].filter(Boolean).join('/') })))];
  function drawBox(el, box, { head = null } = {}) {
    box.opened ??= new Map();
    const all = entries(box), media = all.filter((x) => x.f.kind === 'image' || x.f.kind === 'video');
    const total = all.reduce((n, x) => n + x.f.size, 0);
    el.append(head, h('p', { class: 'muted vinfo' }, `${all.length} ファイル・${fmtBytes(total)}${media.length ? `・画像と動画 ${media.length}` : ''}`));
    for (const sf of box.files.filter((f) => f.kind === 'sealed' && !box.opened.has(f))) {
      const card = sealedCard(sf, (r) => { box.opened.set(sf, r.box); toast(`${sf.name} を開きました（${r.box.files.length} ファイル${r.how === 'GOOGLE_AAS_TOKEN' ? '・GOOGLE_AAS_TOKEN の鍵' : ''}）`); if (card.isConnected) draw(); });
      el.append(card);
    }
    if (media.length) el.append(gallery(media.map((x) => x.f)));
    el.append(fileList(all));
  }
  function gallery(files) {
    const grid = h('div', { class: 'vgal' });
    let shown = 0;
    const more = h('button', { type: 'button', class: 'vmore', onclick: () => fillTiles() });
    const fillTiles = () => {
      for (const f of files.slice(shown, shown + TILES)) grid.append(tile(f, files));
      shown = Math.min(files.length, shown + TILES);
      more.hidden = shown >= files.length;
      more.textContent = `もっと出す（あと ${files.length - shown}）`;
    };
    fillTiles();
    return h('section', { class: 'vsec' }, h('h3', {}, `画像と動画（${files.length}）`), grid, more);
  }
  function tile(f, files) {
    const t = h('button', { type: 'button', class: `vtile ${f.kind}`, title: f.path, 'aria-label': `${f.name}（${WORD[f.kind]}・${fmtBytes(f.size)}）を開く`, onclick: () => openFile(f, files) },
      h('span', { class: 'vname' }, f.name), f.kind === 'video' ? h('span', { class: 'vplay', 'aria-hidden': 'true' }, '▶') : null);
    later(t, async () => {
      const b = await f.get();
      U.settle(f, b);
      if (f.kind === 'image') { const img = h('img', { src: urlOf(f, b), alt: '', decoding: 'async' }); img.addEventListener('load', () => { if (img.naturalWidth <= 64) img.classList.add('px'); }); t.prepend(img); }
      // (a video's first frame as its picture: the address with #t)
      else if (f.kind === 'video') t.prepend(h('video', { src: `${urlOf(f, b)}#t=0.1`, muted: true, playsinline: true, preload: 'metadata', 'aria-hidden': 'true', tabindex: '-1' }));
    });
    return t;
  }
  function fileList(all) {
    const q = h('input', { type: 'search', placeholder: 'ファイルを探す（名前・フォルダ）', 'aria-label': 'ファイルを探す', oninput: () => list() });
    let kind = 'all', limit = ROWS;
    const buttons = FILTERS.map(([k, label]) => h('button', { type: 'button', class: k === kind ? 'on' : '', 'aria-pressed': String(k === kind), onclick: () => { kind = k; for (const b of buttons) { const on = b.dataset.k === k; b.className = on ? 'on' : ''; b.setAttribute('aria-pressed', String(on)); } list(); }, 'data-k': k }, label));
    const ul = h('ul', { class: 'plain vfiles' }), more = h('button', { type: 'button', class: 'vmore', onclick: () => { limit += ROWS; list(); } });
    const files = all.map((x) => x.f);
    function list() {
      const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const hit = all.filter(({ f, folder }) => (kind === 'all' || (kind === 'other' ? !['image', 'video', 'text'].includes(f.kind) : f.kind === kind)) && words.every((w) => `${folder}/${f.name}`.toLowerCase().includes(w)));
      ul.replaceChildren(...hit.slice(0, limit).map(({ f, folder }) => h('li', {}, h('button', { type: 'button', class: 'vrow', onclick: () => openFile(f, files) },
        h('span', { class: 'vicon', 'aria-hidden': 'true' }, ICON[f.kind] ?? ICON.binary),
        h('span', { class: 'vpath' }, folder ? h('span', { class: 'muted' }, `${folder}/`) : null, h('b', {}, f.name), f.note ? h('span', { class: 'chip' }, f.note) : null),
        h('span', { class: 'muted vsize' }, fmtBytes(f.size))))));
      if (!hit.length) ul.replaceChildren(h('li', { class: 'muted' }, all.length ? '当てはまるファイルはありません' : 'ファイルはありません'));
      more.hidden = hit.length <= limit;
      more.textContent = `もっと出す（あと ${hit.length - limit}）`;
    }
    list();
    return h('section', { class: 'vsec' }, h('h3', {}, 'すべてのファイル'), all.length > 8 ? h('div', { class: 'row vfind' }, q) : null, h('div', { class: 'row vkinds', role: 'group', 'aria-label': '種類' }, buttons), ul, more);
  }

  // ---- a run's results.sealed: the key typed here (or in 「設定」) opens it in this browser ----
  function sealedCard(sf, opened) {
    const msg = h('p', { class: 'muted' }, `${sf.path}（${fmtBytes(sf.size)}）は、公開リポジトリなので暗号化されています。`);
    const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'APP_CACHE_KEY（無ければ GOOGLE_AAS_TOKEN）の値', 'aria-label': '暗号化を解く鍵' });
    const keep = h('input', { type: 'checkbox', checked: true });
    const go = h('button', { type: 'button', class: 'primary' }, '🔓 開く');
    const card = h('div', { class: 'card vsealed' }, h('h3', {}, `🔒 暗号化された結果`), msg,
      h('div', { class: 'row' }, key, go), h('label', { class: 'vkeep' }, keep, ' この端末に覚える（「設定」の APP_CACHE_KEY。このブラウザだけ）'));
    const tryOpen = async (value, typed) => {
      go.disabled = true; msg.textContent = `開いています…（${fmtBytes(sf.size)}）`;
      try {
        const r = await U.openSealed(await sf.get(), value);
        if (r.ok) { if (typed && keep.checked) ctx.saveVault?.(value.trim()); opened(r); return; }
        msg.textContent = U.sealedWords(r.why); msg.className = r.why === 'key' ? 'muted' : 'bad';
      } catch (e) { msg.textContent = e?.message ?? String(e); msg.className = 'bad'; }
      go.disabled = false;
    };
    go.addEventListener('click', () => { if (!key.value.trim()) { key.focus(); return; } tryOpen(key.value, true); });
    key.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    // (a key kept in this browser: tried at once — a big file only when asked)
    const kept = String(ctx.vault?.() ?? '').trim();
    if (kept && sf.size <= SEALED_AUTO) setTimeout(() => tryOpen(kept, false), 0);
    else if (kept) { go.textContent = `🔓 開く（${fmtBytes(sf.size)} を読みます）`; key.value = kept; }
    else msg.append(U.sealedWords('key'), '。');
    return card;
  }

  // ---- a file: shown as what it is, saved or shared ----
  const fileLevel = (f, siblings) => ({ title: f.name, sub: [f.folder, fmtBytes(f.size)].filter(Boolean).join(' · '), draw: (el) => drawFile(el, f, siblings) });
  function openFile(f, siblings = []) {
    if (f.kind === 'archive') return openArchive(f);
    push(fileLevel(f, siblings));
  }
  function openArchive(f) {
    push({ title: f.name, sub: `${fmtBytes(f.size)} · の中`, draw: (el) => {
      el.append(loading());
      const show = async () => {
        el.replaceChildren(loading(`${f.name} を開いています…`));
        try {
          const ib = await U.boxOf(f);
          if (!el.isConnected) return;
          if (!ib) { f.kind = 'binary'; el.replaceChildren(); return drawFile(el, f, []); }
          // (a .gz of one file: that file itself)
          if (ib.kind === 'single' && ib.files.length === 1) { el.replaceChildren(); return drawFile(el, ib.files[0], []); }
          el.replaceChildren();
          drawBox(el, ib, { head: actions(f, await f.get(), { pack: PACK.test(f.name) }) });
        } catch (e) { failed(el, e, show); }
      };
      show();
    } });
  }
  /** 保存 and 共有 (and for a pack, how it goes into Minecraft) */
  function actions(f, b, { pack = false } = {}) {
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (() => { try { return navigator.canShare?.({ files: [new File([], f.name, { type: f.mime })] }) ?? false; } catch { return false; } })();
    return h('div', { class: 'vact' }, h('div', { class: 'row' },
      h('button', { type: 'button', onclick: () => { const a = h('a', { href: urlOf(f, b), download: f.name }); document.body.append(a); a.click(); a.remove(); } }, '⬇ 保存'),
      canShare ? h('button', { type: 'button', onclick: () => navigator.share({ files: [new File([b], f.name, { type: f.mime })], title: f.name }).catch((e) => { if (e?.name !== 'AbortError') toast(`共有できませんでした（${e?.message ?? e}）`, true); }) }, pack ? '📲 共有（Minecraft で開く）' : '📤 共有') : null),
    pack ? h('p', { class: 'muted' }, canShare ? 'スマホでは「共有」から Minecraft を選ぶと、そのまま入ります（パソコンは保存して開く）。' : '保存して開くと Minecraft に入ります。') : null);
  }
  function drawFile(el, f, siblings) {
    el.append(loading());
    const show = async () => {
      el.replaceChildren(loading(`${f.name} を読んでいます…`));
      let b;
      try { b = await f.get(); } catch (e) { return failed(el, e, show); }
      if (!el.isConnected) return;
      U.settle(f, b);
      el.replaceChildren();
      if (f.kind === 'archive') { el.append(actions(f, b, { pack: PACK.test(f.name) }), h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: () => openArchive(f) }, '📦 中を見る'))); return; }
      el.append(actions(f, b, { pack: PACK.test(f.name) }), f.note ? h('p', { class: 'warn' }, f.note) : null);
      if (f.kind === 'image') return el.append(...picture(f, b, siblings));
      if (f.kind === 'video') return el.append(h('video', { class: 'vvideo', src: urlOf(f, b), controls: true, playsinline: true, preload: 'metadata' }), h('p', { class: 'muted' }, '再生できないときは「保存」してから開いてください（ブラウザが読めない形のとき）'));
      if (f.kind === 'audio') return el.append(h('audio', { class: 'vaudio', src: urlOf(f, b), controls: true, preload: 'metadata' }));
      if (f.kind === 'sealed') return el.append(sealedCard(f, (r) => { el.replaceChildren(); drawBox(el, r.box); }));
      if (f.kind === 'text') return el.append(...textView(f, b));
      if (f.kind === 'pdf') return el.append(h('p', { class: 'muted' }, 'PDF です: 「保存」か「共有」で開いてください。'));
      el.append(h('p', { class: 'muted' }, `中身はそのまま読めない形です（${fmtBytes(b.length)}）。始めの ${fmtBytes(Math.min(b.length, 4096))} を 16 進で:`), h('pre', { class: 'vtext vhex' }, U.hexDump(b, 4096)));
    };
    show();
  }
  function picture(f, b, siblings) {
    const pics = siblings.filter((x) => x.kind === 'image'), i = pics.indexOf(f);
    const img = h('img', { class: 'vimg', src: urlOf(f, b), alt: f.path, onclick: () => img.classList.toggle('zoom') });
    const size = h('span', { class: 'muted' });
    // (a texture of a few pixels shown big, its pixels square — Minecraft's own look)
    img.addEventListener('load', () => { size.textContent = `${img.naturalWidth} × ${img.naturalHeight} px・タップで${img.naturalWidth <= 128 ? '縮める・広げる' : '原寸'}`; if (img.naturalWidth <= 128 && img.naturalHeight <= 128) img.classList.add('px'); });
    img.addEventListener('error', () => { size.textContent = 'このブラウザでは表示できない画像です（「保存」してから開いてください）'; size.className = 'warn'; });
    const step = (d) => { const g = pics[i + d]; if (g) swap(fileLevel(g, siblings)); };
    const nav = pics.length > 1 ? h('div', { class: 'row vnav' }, h('button', { type: 'button', disabled: i <= 0, onclick: () => step(-1) }, '← 前'), h('span', { class: 'muted grow' }, `${i + 1} / ${pics.length}`), h('button', { type: 'button', disabled: i >= pics.length - 1, onclick: () => step(1) }, '次 →')) : null;
    if (nav) keys = (e) => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); };
    return [h('div', { class: 'vpic' }, img), size, nav];
  }
  function textView(f, b) {
    const jsonl = /\.(jsonl|ndjson)$/i.test(f.name), json = jsonl || f.mime === 'application/json' || /\.(json|material)$/i.test(f.name);
    let full = b.length <= TEXT_MAX, pretty = json && b.length <= 3e6, wrap = true;
    const pre = h('pre', { class: 'vtext wrap', tabindex: '0' }), info = h('span', { class: 'muted grow' });
    const pb = json ? h('button', { type: 'button', 'aria-pressed': String(pretty), onclick: () => { pretty = !pretty; pb.setAttribute('aria-pressed', String(pretty)); pb.className = pretty ? 'on' : ''; render(); } }, '整形') : null;
    if (pb && pretty) pb.className = 'on';
    const wb = h('button', { type: 'button', class: 'on', 'aria-pressed': 'true', onclick: () => { wrap = !wrap; pre.classList.toggle('wrap', wrap); wb.className = wrap ? 'on' : ''; wb.setAttribute('aria-pressed', String(wrap)); } }, '折り返す');
    const all = h('button', { type: 'button', onclick: () => { full = true; render(); } }, `全部出す（${fmtBytes(b.length)}）`);
    function render() {
      const t = U.textOf(b, full || pretty ? Infinity : TEXT_MAX), p = pretty ? U.prettyJson(t.text, jsonl) : null;
      pre.textContent = p ?? t.text;
      all.hidden = !t.cut;
      info.textContent = `${t.encoding}${t.cut ? `・始めの ${fmtBytes(TEXT_MAX)} だけ` : ''}${pretty && p === null ? '・JSON として読めないのでそのまま' : ''}`;
    }
    render();
    return [h('div', { class: 'row vtools' }, info, pb, wb), pre, h('div', { class: 'row' }, all)];
  }

  // ---- the artifact itself: the first level ----
  const reader = artifactReader({ authUrl: ctx.authUrl, token: ctx.token, fresh: ctx.fresh, repo: slug, id: art.id, size: art.size_in_bytes });
  let boxP = null;
  push({ title: `📦 ${art.name}`, sub: [fmtBytes(art.size_in_bytes ?? 0), art.expires_at ? `${String(art.expires_at).slice(0, 10)} まで` : null].filter(Boolean).join(' · '), draw: (el) => {
    el.append(loading());
    const show = async () => {
      el.replaceChildren(loading(art.size_in_bytes > 1e6 ? `成果物を読んでいます…（${fmtBytes(art.size_in_bytes)}）` : '成果物を読んでいます…'));
      try {
        const box = await (boxP ??= artifactBox(reader, art, { onProgress }).catch((e) => { boxP = null; throw e; }));
        if (!el.isConnected) return;
        el.replaceChildren();
        // (an artifact kept as one file: that file at once)
        if (box.kind === 'single') return drawFile(el, box.files[0], box.files);
        drawBox(el, box, { head: github ? h('p', { class: 'muted vgh' }, h('a', { href: github, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub で取る（zip）')) : null });
      } catch (e) { failed(el, e, show); }
    };
    show();
  } });
  globalThis.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey);
  document.body.classList.add('vopen');
  document.body.append(root);
  close.focus();
  const me = { close: (quiet = false) => shut(false, quiet) };
  current = me;
  return me;
}
