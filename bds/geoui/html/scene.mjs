// HTML → GeoUI, step 2 (no browser): a capture (capture.mjs) → a GeoUI Screen scene (screen/pack.js builds the packs from it)
// and the configuration the pack's script runs on (html/runtime.js). Pure but for reading the capture's PNGs.
//
// Layout: the page is one rigid box — the "contain" scale of screen/layout.js: the design (e.g. 1280 x 720 px, g model units a
// px) fitted inside the screen on every device, centred, its own background colour reaching past it to the screen's edges.
// One renderer draws it all, so the pointer, every control and the hit test share one frame (SPEC.md 6 章: 当たり判定は 1 つのグループの中で).
// Layers, back to front (z and the order of the bones): the background → each page's base → the controls and dynamic parts
// (each state a bone of its own, shown by part_visibility) → the focus ring, the WASD hints and the pointer.
// A picture is stored as parts: cut into blocks of 64 px, a block of one colour (a run of them along a row) is a 4 x 4 sprite
// stretched over it, any other block is trimmed to what it draws — a page of flat panels and text costs the atlas its text and
// edges, not its area. The same picture, and the same block, is stored once; the atlases are filled in layer order (a later
// layer never sits in an earlier atlas than an earlier one: the render controllers draw atlas by atlas).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { decodePng, encodePng } from '../png.mjs';
const require = createRequire(import.meta.url);
const F = require('../screen/font.js');

const STATE_ORDER = ['normal', 'hover', 'focus', 'active'];
const BLOCK = 64, PAD = 2;

/** the alpha's bounding box of an RGBA image (null when all clear) */
function trimBox(img) {
  const { width: W, height: H, data } = img;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function crop(img, b) {
  const out = new Uint8Array(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) out.set(img.data.subarray(((b.y + y) * img.width + b.x) * 4, ((b.y + y) * img.width + b.x + b.w) * 4), y * b.w * 4);
  return { width: b.w, height: b.h, data: out };
}
const hashOf = (img) => crypto.createHash('sha1').update(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length)).update(`${img.width}x${img.height}`).digest('hex');

/** shelf packing in layer order into atlases of at most `max` px: [{ w, h, items: [{ key, x, y }] }] (each image PAD apart,
 *  its edge pixels repeated into the gap so a smooth filter does not bleed a neighbour in) */
function packLayers(sprites, max = 2048) {
  const atlases = [];
  let cur = null;
  const open = () => { cur = { w: 0, h: 0, shelves: [], items: [] }; atlases.push(cur); };
  open();
  for (const s of sprites) {
    const w = s.img.width + PAD * 2, h = s.img.height + PAD * 2;
    if (w > max || h > max) throw new Error(`画像（${s.img.width}x${s.img.height}）がアトラスの上限 ${max} より大きい: --dpr を下げてください`);
    let shelf = cur.shelves.find((sh) => sh.h >= h && sh.x + w <= max);
    if (!shelf) {
      const y = cur.shelves.reduce((m, sh) => Math.max(m, sh.y + sh.h), 0);
      if (y + h > max) { open(); return packLayersFrom(atlases, cur, sprites.slice(sprites.indexOf(s)), max); }
      shelf = { x: 0, y, h }; cur.shelves.push(shelf);
    }
    cur.items.push({ key: s.key, x: shelf.x + PAD, y: shelf.y + PAD, img: s.img });
    shelf.x += w; cur.w = Math.max(cur.w, shelf.x); cur.h = Math.max(cur.h, shelf.y + shelf.h);
  }
  return atlases;
}
function packLayersFrom(atlases, cur, rest, max) {
  // (the rest into the new atlas the same way)
  for (const s of rest) {
    const w = s.img.width + PAD * 2, h = s.img.height + PAD * 2;
    let shelf = cur.shelves.find((sh) => sh.h >= h && sh.x + w <= max);
    if (!shelf) {
      const y = cur.shelves.reduce((m, sh) => Math.max(m, sh.y + sh.h), 0);
      if (y + h > max) { cur = { w: 0, h: 0, shelves: [], items: [] }; atlases.push(cur); return packLayersFrom(atlases, cur, rest.slice(rest.indexOf(s)), max); }
      shelf = { x: 0, y, h }; cur.shelves.push(shelf);
    }
    cur.items.push({ key: s.key, x: shelf.x + PAD, y: shelf.y + PAD, img: s.img });
    shelf.x += w; cur.w = Math.max(cur.w, shelf.x); cur.h = Math.max(cur.h, shelf.y + shelf.h);
  }
  return atlases;
}
const pow2 = (v) => 2 ** Math.ceil(Math.log2(Math.max(4, v)));
function drawAtlas(a) {
  const W = pow2(a.w), H = pow2(a.h), data = new Uint8Array(W * H * 4);
  for (const it of a.items) {
    const { img } = it;
    for (let y = -PAD; y < img.height + PAD; y++) for (let x = -PAD; x < img.width + PAD; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, x)), sy = Math.min(img.height - 1, Math.max(0, y)), so = (sy * img.width + sx) * 4;
      const dx = it.x + x, dy = it.y + y;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const d = (dy * W + dx) * 4;
      // (the edge repeated — alpha too: a smooth filter at a sprite's edge, or where two tiles of a page meet, then reads the
      //  sprite's own edge again, never the clear gap: no seam, no dark fringe)
      data[d] = img.data[so]; data[d + 1] = img.data[so + 1]; data[d + 2] = img.data[so + 2]; data[d + 3] = img.data[so + 3];
    }
  }
  return { width: W, height: H, data };
}

/** the pointer (an arrow, white with a dark rim) and the WASD hints, drawn here */
function arrowImage() {
  const rows = ['X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWWWWX', 'XWWWWWWWX', 'XWWWWWWWWX', 'XWWWWWXXXXX', 'XWWXWWX', 'XWX XWWX', 'XX  XWWX', 'X    XWWX', '     XWWX', '      XX'];
  const S = 2, W = 11 * S, H = rows.length * S, data = new Uint8Array(W * H * 4);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === ' ') return; const c = ch === 'W' ? [255, 255, 255, 255] : [24, 24, 32, 255]; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) data.set(c, ((y * S + j) * W + x * S + i) * 4); }));
  return { width: W, height: H, data };
}
function badgeImage(letter) {
  const S = 2, W = 9 * S, H = 9 * S, data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const edge = x < S || y < S || x >= W - S || y >= H - S; data.set(edge ? [255, 220, 64, 255] : [20, 20, 28, 235], (y * W + x) * 4); }
  for (const [x, y] of F.pixels(letter)) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) data.set([255, 255, 255, 255], (((y + 2) * S + j) * W + (x + 3) * S + i) * 4);
  return { width: W, height: H, data };
}
function solid(rgb) { return { width: 4, height: 4, data: new Uint8Array(64).map((_, i) => [rgb[0], rgb[1], rgb[2], rgb[3] ?? 255][i % 4]) }; }
/** the one colour of an image ([r, g, b, a]), or null */
function uniform(img) {
  const d = img.data;
  for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) return null;
  return [d[0], d[1], d[2], d[3]];
}
const parseRgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(String(s)); return m ? m[1].split(',').slice(0, 3).map((v) => Math.round(Number(v))) : [0, 0, 0]; };

/** a Molang table: index v → value (a balanced tree of comparisons in chunks of 16, each its own line: no line is long) */
export function tableLines(ns, name, idx, values, def = 0) {
  const n = values.length, f = (v) => String(Math.round(v * 1000) / 1000);
  if (!n) return { lines: [`v.${ns}_${name} = ${f(def)};`], v: `v.${ns}_${name}` };
  const tree = (lo, hi) => (hi - lo === 1 ? f(values[lo]) : `(${idx} < ${lo + ((hi - lo) >> 1)} ? ${tree(lo, lo + ((hi - lo) >> 1))} : ${tree(lo + ((hi - lo) >> 1), hi)})`);
  const lines = [];
  if (n <= 16) lines.push(`v.${ns}_${name} = (${idx} < 0 || ${idx} >= ${n}) ? ${f(def)} : ${tree(0, n)};`);
  else {
    const chunks = Math.ceil(n / 16);
    for (let c = 0; c < chunks; c++) lines.push(`v.${ns}_${name}_${c} = ${tree(c * 16, Math.min(n, c * 16 + 16))};`);
    const top = (lo, hi) => (hi - lo === 1 ? `v.${ns}_${name}_${lo}` : `(${idx} < ${(lo + ((hi - lo) >> 1)) * 16} ? ${top(lo, lo + ((hi - lo) >> 1))} : ${top(lo + ((hi - lo) >> 1), hi)})`);
    lines.push(`v.${ns}_${name} = (${idx} < 0 || ${idx} >= ${n}) ? ${f(def)} : ${top(0, chunks)};`);
  }
  return { lines, v: `v.${ns}_${name}` };
}

/** capture folder → { scene, config, warnings, stats } */
export function buildScene(dir, opts = {}) {
  const cap = JSON.parse(fs.readFileSync(path.join(dir, 'capture.json'), 'utf8'));
  const ns = String(opts.ns || 'gh').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 16), warnings = [];
  const Dw = cap.design.w, Dh = cap.design.h, dpr = cap.dpr, g = Number(opts.g) || 0.25;
  const U = (px) => px * g, X = (px) => U(px - Dw / 2), Y = (py) => U(py - Dh / 2);
  const read = (f) => decodePng(fs.readFileSync(path.join(dir, f)));
  // ---- sprites, in layer order; the same image once
  const sprites = [], byHash = new Map();
  const sprite = (img, layer) => { const h = hashOf(img); if (byHash.has(h)) return byHash.get(h); const key = `s${sprites.length}`; sprites.push({ key, img, layer }); byHash.set(h, key); return key; };
  /** a picture → its parts in its own px ({ key, x, y, w, h }): runs of one-colour blocks along each row, the other blocks trimmed */
  const partsCache = new Map();
  function partsOf(img, layer) {
    const h = hashOf(img);
    if (partsCache.has(h)) return partsCache.get(h);
    const parts = [];
    for (let by = 0; by < img.height; by += BLOCK) {
      let run = null;
      const flush = () => { if (run) { parts.push({ key: sprite(solid(run.c), layer), x: run.x, y: by, w: run.w, h: run.h }); run = null; } };
      for (let bx = 0; bx < img.width; bx += BLOCK) {
        const blk = crop(img, { x: bx, y: by, w: Math.min(BLOCK, img.width - bx), h: Math.min(BLOCK, img.height - by) }), b = trimBox(blk);
        if (!b) { flush(); continue; }
        const u = uniform(blk);
        if (u) {
          if (run && run.c.join() === u.join() && run.x + run.w === bx && run.h === blk.height) run.w += blk.width;
          else { flush(); run = { c: u, x: bx, w: blk.width, h: blk.height }; }
          continue;
        }
        flush();
        parts.push({ key: sprite(crop(blk, b), layer), x: bx + b.x, y: by + b.y, w: b.w, h: b.h });
      }
      flush();
    }
    partsCache.set(h, { id: h, parts });
    return partsCache.get(h);
  }
  /** a captured PNG of a box at (clip.x, clip.y) design px → { key (the picture: the same look, the same key), parts: [{ key, rect
   *  (local units) }] }, or null when it draws nothing */
  const cut = (file, clip, layer) => {
    const pic = partsOf(read(file), layer);
    if (!pic.parts.length) return null;
    return { key: pic.id, parts: pic.parts.map((q) => ({ key: q.key, rect: { x: X(clip.x + q.x / dpr), y: Y(clip.y + q.y / dpr), w: U(q.w / dpr), h: U(q.h / dpr) } })) };
  };
  const bg = parseRgb(cap.background && cap.background.color);
  const bgKey = sprite(solid(bg), 0);
  // pages: their base as parts
  const pages = cap.pages.map((p, k) => ({ id: p.id || `page${k}`, index: k, pic: cut(p.base, { x: 0, y: 0 }, 1) }));
  const pageIndex = (id) => (id === null || id === undefined ? -1 : cap.pages.findIndex((p) => p.id === id));
  // controls: each state (and checked state) a sprite
  const controls = cap.controls.map((c, i) => {
    const st = {};
    for (const [name, file] of Object.entries(c.states || {})) st[name] = cut(file, c.clip, 2);
    const frames = (c.frames || []).map((f) => cut(f, c.clip, 2));
    // (a slider drawn focused at each value too: when that differs from the plain frames, its frames are its focus look)
    const ff = (c.framesFocus || []).map((f) => cut(f, c.clip, 2));
    const focusFrames = frames.length > 0 && ff.length === frames.length && ff.some((f, k) => (f && f.key) !== (frames[k] && frames[k].key)) ? ff : null;
    // (no focus style of its own: the lab's ring shows where the focus is)
    const ring = c.kind === 'slider' && frames.length ? !focusFrames : !st.focus || !st.normal || (st.focus && st.normal && st.focus.key === st.normal.key);
    return Object.assign({}, c, { i, st, frames, focusFrames, ring, pageIndex: pageIndex(c.page),
      local: { x: X(c.rect.x), y: Y(c.rect.y), w: U(c.rect.w), h: U(c.rect.h) } });
  });
  const dynamic = cap.dynamic.map((d, i) => {
    const o = Object.assign({}, d, { i, pageIndex: pageIndex(d.page), local: { x: X(d.rect.x), y: Y(d.rect.y), w: U(d.rect.w), h: U(d.rect.h) } });
    if (d.kind === 'gauge') o.fr = d.frames.map((f) => cut(f, d.clip, 2));
    if (d.kind === 'show') o.img = cut(d.image, d.clip, 2);
    if (d.kind === 'number') {
      // each place's column of each digit's picture (where the browser put that place's glyph)
      o.cols = d.places.map((pl) => d.glyphs.map((gf) => {
        const img = read(gf), x0 = Math.max(0, Math.floor((pl.x - d.clip.x) * dpr)), x1 = Math.min(img.width, Math.ceil((pl.x + pl.w - d.clip.x) * dpr));
        const col = crop(img, { x: x0, y: 0, w: Math.max(1, x1 - x0), h: img.height }), pic = partsOf(col, 2);
        if (!pic.parts.length) return null;
        return { key: pic.id, parts: pic.parts.map((q) => ({ key: q.key, rect: { x: X(d.clip.x + (x0 + q.x) / dpr), y: Y(d.clip.y + q.y / dpr), w: U(q.w / dpr), h: U(q.h / dpr) } })) };
      }));
    }
    return o;
  });
  const arrowKey = sprite(arrowImage(), 3), badge = Object.fromEntries(['W', 'A', 'S', 'D'].map((k) => [k, sprite(badgeImage(k), 3)]));
  const ringKey = sprite(solid([255, 220, 64]), 3);
  // ---- atlases (layer order), then every sprite's place
  sprites.sort((a, b) => a.layer - b.layer);
  const atlases = packLayers(sprites, Number(opts.maxAtlas) || 2048);
  const where = {};
  const textures = atlases.map((a, k) => {
    const img = drawAtlas(a);
    for (const it of a.items) where[it.key] = { tex: `a${k}`, uv: [it.x, it.y, it.img.width, it.img.height] };
    return { id: `a${k}`, width: img.width, height: img.height, png: Buffer.from(encodePng(img)) };
  });
  // ---- the scene: one group (the design box), bones in layer order
  const bones = [], planes = [], P = (n) => `v.${ns}_${n}`;
  const bone = (name, o = {}) => { bones.push(Object.assign({ name, group: 'page' }, o)); return name; };
  const plane = (b, key, rect, z) => { const w = where[key]; planes.push({ bone: b, texture: w.tex, rect, z, uv: w.uv }); };
  /** a picture's parts on a bone (all at one depth: they never overlap) */
  const picture = (b, pic, z) => { if (pic) for (const q of pic.parts) plane(b, q.key, q.rect, z); };
  const mat = opts.filter === 'point' ? 'blend' : 'blend_s';
  const root = bone(`${ns}_ui`, { scale: `${P('pg')} > 0 ? 1 : 0`, material: mat });
  // the page's colour past the design box: three times its size each way (reaches the edges of any screen the box fits in)
  bone(`${ns}_bg`, { parent: root, material: 'cutout' });
  plane(`${ns}_bg`, bgKey, { x: -U(Dw) * 1.5 - U(Dw), y: -U(Dh) * 1.5 - U(Dh), w: U(Dw) * 5, h: U(Dh) * 5 }, 3);
  for (const p of pages) {
    const pb = bone(`${ns}_p${p.index}`, { parent: root, scale: `${P('pg')} == ${p.index + 1} ? 1 : 0`, material: mat });
    picture(pb, p.pic, 2);
  }
  const pageBone = (k) => (k >= 0 ? `${ns}_p${k}` : root);
  const zc = (i) => 1 - (i % 40) * 0.021;   // (each control a little in front of the one before: overlapping ones keep the page's order)
  for (const c of controls) {
    const cb = bone(`${ns}_c${c.i}`, { parent: pageBone(c.pageIndex), material: mat });
    const chk = c.checked !== null && c.checked !== undefined;
    const ci = `${P('chk')}${Math.floor(c.i / 24)}`, onExpr = `(math.mod(math.floor(${ci} / ${2 ** (c.i % 24)}), 2) > 0.5)`;
    if (c.kind === 'slider' && c.frames.length) {
      // a slider: the frame nearest its value (v.<ns>_f<i>: 0…10 from the value's property), its focused frame while it has the
      // focus (when it looks different focused; else the lab's ring)
      const ff = c.focusFrames, foc = `${P('foc')} == ${c.i}`, nofoc = `${P('foc')} != ${c.i}`;
      c.frames.forEach((f, k) => {
        if (f) picture(bone(`${ns}_c${c.i}_f${k}`, { parent: cb, material: mat, visible: `${P(`f${c.i}`)} == ${k}${ff ? ` && ${nofoc}` : ''}` }), f, zc(c.i));
        if (ff && ff[k]) picture(bone(`${ns}_c${c.i}_ff${k}`, { parent: cb, material: mat, visible: `${P(`f${c.i}`)} == ${k} && ${foc}` }), ff[k], zc(c.i));
      });
      continue;
    }
    for (const on of chk ? [false, true] : [false]) {
      const sfx = on ? '-on' : '', want = (k) => c.st[`${k}${sfx}`] || c.st[k];
      // (the states that look different from normal — one with the same picture is not drawn twice —, and among them the
      //  precedence pressed > focused > hovered: a focused button with no :active look of its own keeps its focus look pressed)
      const own = STATE_ORDER.filter((o) => o !== 'normal' && want(o) && want(o).key !== want('normal')?.key);
      const is = (o) => `${P(o === 'active' ? 'act' : o === 'focus' ? 'foc' : 'hov')} == ${c.i}`, isnt = (o) => is(o).replace(' == ', ' != ');
      for (const s of STATE_ORDER) {
        const pic = want(s);
        if (!pic || (s !== 'normal' && !own.includes(s))) continue;
        const higher = own.filter((o) => STATE_ORDER.indexOf(o) > STATE_ORDER.indexOf(s));
        let vis = (s === 'normal' ? own.map(isnt) : [is(s), ...higher.map(isnt)]).join(' && ') || null;
        if (chk) vis = `${on ? '' : '!'}${onExpr}${vis ? ` && ${vis}` : ''}`;
        const sb = bone(`${ns}_c${c.i}_${s}${on ? '_on' : ''}`, { parent: cb, material: mat, ...(vis ? { visible: vis } : {}) });
        picture(sb, pic, zc(c.i) - (s === 'normal' ? 0 : 0.005));
      }
    }
  }
  for (const d of dynamic) {
    const db = bone(`${ns}_d${d.i}`, { parent: pageBone(d.pageIndex), material: mat });
    if (d.kind === 'gauge') d.fr.forEach((f, k) => { if (!f) return; const fb = bone(`${ns}_d${d.i}_f${k}`, { parent: db, material: mat, visible: `${P(`g${d.i}`)} == ${k}` }); picture(fb, f, 0.9); });
    if (d.kind === 'show' && d.img) { const sb = bone(`${ns}_d${d.i}_s`, { parent: db, material: mat, visible: `${P(`s${d.i}`)} > 0` }); picture(sb, d.img, 0.9); }
    if (d.kind === 'number') d.cols.forEach((col, j) => col.forEach((gl, digit) => { if (!gl) return; const gb = bone(`${ns}_d${d.i}_${j}_${digit}`, { parent: db, material: mat, visible: `${P(`n${d.i}_${j}`)} == ${digit}` }); picture(gb, gl, 0.9); }));
  }
  // the focus ring (where a control has no focus style of its own), the hints, the pointer — on top of everything
  const ringed = controls.filter((c) => c.ring && !c.disabled);
  const rx = controls.map((c) => c.local.x - 1), ry = controls.map((c) => c.local.y - 1), rw = controls.map((c) => c.local.w + 2), rh = controls.map((c) => c.local.h + 2);
  const ringOn = controls.map((c) => (c.ring && !c.disabled ? 1 : 0));
  const T = [tableLines(ns, 'rx', P('foc'), rx), tableLines(ns, 'ry', P('foc'), ry), tableLines(ns, 'rw', P('foc'), rw), tableLines(ns, 'rh', P('foc'), rh), tableLines(ns, 'ron', P('foc'), ringOn)];
  if (ringed.length) {
    // four bars, each a 1 x 1 plane at the design's centre moved and stretched to the focused control's box (y is up in Molang)
    const bar = (name, pos, scale) => { const b = bone(`${ns}_ring_${name}`, { parent: root, material: 'cutout', pivot: [0, 0], position: [pos[0], pos[1], 0], scale: [scale[0], scale[1], 1] }); plane(b, ringKey, { x: 0, y: 0, w: 1, h: 1 }, 0.2); };
    const on = `(${P('ron')} > 0)`;
    bar('t', [P('rx'), `-${P('ry')}`], [`${on} ? ${P('rw')} : 0`, `${on} ? 0.75 : 0`]);
    bar('b', [P('rx'), `-(${P('ry')} + ${P('rh')} - 0.75)`], [`${on} ? ${P('rw')} : 0`, `${on} ? 0.75 : 0`]);
    bar('l', [P('rx'), `-${P('ry')}`], [`${on} ? 0.75 : 0`, `${on} ? ${P('rh')} : 0`]);
    bar('r', [`${P('rx')} + ${P('rw')} - 0.75`, `-${P('ry')}`], [`${on} ? 0.75 : 0`, `${on} ? ${P('rh')} : 0`]);
    // (each bar's 1 x 1 plane hangs below and right of its pivot: scaled, it grows right and down from the box's corner)
  }
  // hints: a badge at the top-left corner of where W, A, S and D would move the focus (flg bit 1)
  const hx = controls.map((c) => c.local.x - 3), hy = controls.map((c) => c.local.y - 3);
  T.push(tableLines(ns, 'hxw', P('hw'), hx), tableLines(ns, 'hyw', P('hw'), hy), tableLines(ns, 'hxa', P('ha'), hx), tableLines(ns, 'hya', P('ha'), hy),
    tableLines(ns, 'hxs', P('hs'), hx), tableLines(ns, 'hys', P('hs'), hy), tableLines(ns, 'hxd', P('hd'), hx), tableLines(ns, 'hyd', P('hd'), hy));
  for (const k of ['W', 'A', 'S', 'D']) {
    const l = k.toLowerCase(), b = bone(`${ns}_hint_${l}`, { parent: root, material: 'cutout', pivot: [0, 0], position: [P(`hx${l}`), `-${P(`hy${l}`)}`, 0],
      scale: `(${P(`h${l}`)} >= 0 && math.mod(math.floor(${P('flg')} / 2), 2) > 0.5) ? 1 : 0` });
    plane(b, badge[k], { x: 0, y: 0, w: 4.5, h: 4.5 }, 0.1);
  }
  const ptr = bone(`${ns}_ptr`, { parent: root, material: 'cutout', pivot: [0, 0], position: [P('cx'), `-${P('cy')}`, 0], scale: `math.mod(${P('flg')}, 2) > 0.5 ? 1 : 0` });
  plane(ptr, arrowKey, { x: -0.5, y: -0.5, w: 5.5, h: 8.5 }, 0);
  // ---- properties and the Molang that reads them (every read guarded: the pause screen's paper doll has none)
  const rangeU = Math.ceil(Math.max(U(Dw), U(Dh)) / 2 + 20), step = Math.ceil((rangeU * 2 / 4096) * 1000) / 1000;
  const props = [{ name: 'pg', range: [0, 255], default: 0 }, { name: 'fha', range: [0, 16777215], default: 0 }, { name: 'cur', range: [0, 16777215], default: 0 },
    { name: 'hint', range: [0, 16777215], default: 0 }, { name: 'flg', range: [0, 255], default: 0 }];
  const R = (n, def = 0) => `variable.is_paperdoll ? ${def} : q.property('${ns}:${n}')`;
  const pre = [`${P('pg')} = ${R('pg')};`, `${P('fha')} = ${R('fha')};`, `${P('foc')} = math.mod(${P('fha')}, 256) - 1;`, `${P('hov')} = math.mod(math.floor(${P('fha')} / 256), 256) - 1;`,
    `${P('act')} = math.floor(${P('fha')} / 65536) - 1;`, `${P('cur')} = ${R('cur')};`, `${P('cx')} = math.mod(${P('cur')}, 4096) * ${step} - ${rangeU};`, `${P('cy')} = math.floor(${P('cur')} / 4096) * ${step} - ${rangeU};`,
    `${P('flg')} = ${R('flg')};`, `${P('hint')} = ${R('hint')};`];
  ['w', 'a', 's', 'd'].forEach((k, j) => pre.push(`${P(`h${k}`)} = math.mod(math.floor(${P('hint')} / ${64 ** j}), 64) - 1;`));
  const nChk = Math.ceil(controls.length / 24);
  for (let k = 0; k < nChk; k++) { props.push({ name: `chk${k}`, range: [0, 16777215], default: 0 }); pre.push(`${P(`chk${k}`)} = ${R(`chk${k}`)};`); }
  // values: a slider's or a gauge's frame (0…10), 6 to a property (4 bits each); a number's digits from its own property
  const framed = [...controls.filter((c) => c.kind === 'slider' && c.frames.length).map((c) => ({ key: `f${c.i}`, ref: c })), ...dynamic.filter((d) => d.kind === 'gauge').map((d) => ({ key: `g${d.i}`, ref: d }))];
  framed.forEach((f, j) => { f.prop = `vf${Math.floor(j / 6)}`; f.shift = (j % 6) * 4; });
  for (let k = 0; k * 6 < framed.length; k++) { props.push({ name: `vf${k}`, range: [0, 16777215], default: 0 }); pre.push(`${P(`vf${k}`)} = ${R(`vf${k}`)};`); }
  for (const f of framed) pre.push(`${P(f.key)} = math.mod(math.floor(${P(f.prop)} / ${2 ** f.shift}), 16);`);
  const shows = dynamic.filter((d) => d.kind === 'show');
  if (shows.length) { props.push({ name: 'shw', range: [0, 16777215], default: 0 }); pre.push(`${P('shw')} = ${R('shw')};`); shows.forEach((d, j) => { d.bit = j; pre.push(`${P(`s${d.i}`)} = math.mod(math.floor(${P('shw')} / ${2 ** j}), 2);`); }); }
  for (const d of dynamic.filter((x) => x.kind === 'number')) {
    const name = `n${d.i}`;
    props.push({ name, range: [-8388607, 8388607], default: 0 });
    pre.push(`${P(name)} = math.abs(${R(name)});`);
    d.cols.forEach((_, j) => { const place = 10 ** (d.cols.length - 1 - j); pre.push(`${P(`${name}_${j}`)} = math.mod(math.floor(${P(name)} / ${place}), 10);`); });
  }
  for (const t of T) pre.push(...t.lines);
  if (controls.length > 255) warnings.push(`操作できる物が ${controls.length} 個: 焦点・ポインタ・押している物の番号は 8 bit（255 個まで）。ページを分けてください`);
  else if (controls.length > 63) warnings.push(`操作できる物が ${controls.length} 個: W A S D のヒントは 63 個目まで（それより後の物の上には出ない）`);
  if (props.length > 32) warnings.push(`プロパティが ${props.length} 個になります（上限 32）: 操作できる物・動く物を減らすか、ページを分けてください`);
  const scene = {
    ns, name: opts.name || cap.title || 'GeoUI HTML', description: opts.description || `${cap.source} を GeoUI に（bds-lab: bds/geoui/html）`, seed: opts.seed || `${ns}:${cap.source}`,
    scale: { mode: 'contain', w: Dw, h: Dh, g }, groups: [{ id: 'page', anchor: 'center' }], textures, bones, planes, pre, properties: props,
    initialize: [], hideLocalPlayer: `${P('hide')} > 0`,
  };
  scene.pre.push(`${P('hide')} = ${P('pg')} > 0 ? 1 : 0;`);
  scene.initialize.push(`${P('hide')} = 0;`);
  // ---- the script's configuration: what each control is and does, in the design's units (y down, from its centre)
  const config = {
    ns, design: { w: Dw, h: Dh, g }, range: rangeU, step, start: Math.max(0, pageIndex(cap.start)),
    pages: pages.map((p) => ({ id: p.id })),
    controls: controls.map((c) => ({ i: c.i, id: c.id || c.key, kind: c.kind, page: c.pageIndex, rect: c.local, action: c.action || '', slot: c.slot, group: c.group,
      name: c.name, checked: c.checked, disabled: c.disabled, min: c.min, max: c.max, step: c.step, value: c.value, prop: c.prop, label: c.label, frameValues: c.frameValues || null,
      frame: framed.find((f) => f.ref === c) ? { prop: framed.find((f) => f.ref === c).prop, shift: framed.find((f) => f.ref === c).shift } : null })),
    dynamic: dynamic.map((d) => ({ i: d.i, kind: d.kind, prop: d.prop, page: d.pageIndex, min: d.min, max: d.max, value: d.value, digits: d.digits, bit: d.bit ?? null, frameValues: d.frameValues || null,
      frame: framed.find((f) => f.ref === d) ? { prop: framed.find((f) => f.ref === d).prop, shift: framed.find((f) => f.ref === d).shift } : null })),
  };
  const stats = { pages: pages.length, controls: controls.length, dynamic: dynamic.length, sprites: sprites.length, spritePx: sprites.reduce((n, q) => n + q.img.width * q.img.height, 0), atlases: textures.map((t) => `${t.width}x${t.height}`), properties: props.length, bones: bones.length, planes: planes.length };
  return { scene, config, warnings, stats, capture: cap };
}
