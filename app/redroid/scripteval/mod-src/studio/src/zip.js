// Resource pack input for Studio: a small ZIP reader (stored + deflate, ZIP64)
// built on the browser's DecompressionStream, and the logic that turns dropped
// archives / folders into packs (one per manifest.json, nested .mcpack inside
// .mcaddon included). No dependencies, so it also runs under Node for tests.

const SIG_EOCD = 0x06054b50, SIG_EOCD64 = 0x06064b50, SIG_LOC64 = 0x07064b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;
const U16 = 0xffff, U32 = 0xffffffff;

async function bytes(blob, start, end) { return new Uint8Array(await blob.slice(start, end).arrayBuffer()); }
const dv = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

// Lists the files of a ZIP blob: [{ path, size, read(): Promise<Uint8Array>, error? }]
export async function readZip(blob, prefix = "") {
  const size = blob.size;
  if (size < 22) throw new Error("ZIP ではありません（小さすぎます）");
  const tailStart = Math.max(0, size - 65557);
  const tail = await bytes(blob, tailStart, size);
  const tv = dv(tail);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === SIG_EOCD) { e = i; break; }
  if (e < 0) throw new Error("ZIP ではありません（終端レコードがありません）");
  let count = tv.getUint16(e + 10, true), cdSize = tv.getUint32(e + 12, true), cdOff = tv.getUint32(e + 16, true);
  if (count === U16 || cdSize === U32 || cdOff === U32) {
    const l = e - 20;
    if (l < 0 || tv.getUint32(l, true) !== SIG_LOC64) throw new Error("ZIP64 の情報が見つかりません");
    const off = Number(tv.getBigUint64(l + 8, true));
    const z = await bytes(blob, off, off + 56);
    const zv = dv(z);
    if (z.length < 56 || zv.getUint32(0, true) !== SIG_EOCD64) throw new Error("ZIP64 の終端レコードが壊れています");
    count = Number(zv.getBigUint64(32, true));
    cdSize = Number(zv.getBigUint64(40, true));
    cdOff = Number(zv.getBigUint64(48, true));
  }
  if (cdOff + cdSize > size) throw new Error("ZIP が途中で切れています");
  const cd = await bytes(blob, cdOff, cdOff + cdSize);
  const v = dv(cd);
  const utf8 = new TextDecoder("utf-8");
  const out = [];
  let p = 0;
  for (let k = 0; k < count; k++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== SIG_CEN) throw new Error("ZIP の目次が壊れています");
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true);
    let csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    let lho = v.getUint32(p + 42, true);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, "/").replace(/^\/+/, "");
    let x = p + 46 + nlen;
    const xe = Math.min(cd.length, x + xlen);
    while (x + 4 <= xe) {  // ZIP64 extended information
      const id = v.getUint16(x, true), sz = v.getUint16(x + 2, true);
      if (id === 1) {
        let y = x + 4;
        if (usize === U32 && y + 8 <= xe) { usize = Number(v.getBigUint64(y, true)); y += 8; }
        if (csize === U32 && y + 8 <= xe) { csize = Number(v.getBigUint64(y, true)); y += 8; }
        if (lho === U32 && y + 8 <= xe) lho = Number(v.getBigUint64(y, true));
      }
      x += 4 + sz;
    }
    p += 46 + nlen + xlen + clen;
    if (!name || name.endsWith("/")) continue;
    const entry = { path: prefix + name, size: usize };
    if (flags & 1) entry.error = "暗号化されています";
    else if (method !== 0 && method !== 8) entry.error = `未対応の圧縮方式です（${method}）`;
    entry.read = async () => {
      if (entry.error) throw new Error(`${name}: ${entry.error}`);
      const lh = await bytes(blob, lho, lho + 30);
      const lv = dv(lh);
      if (lh.length < 30 || lv.getUint32(0, true) !== SIG_LOC) throw new Error(`ZIP が壊れています（${name}）`);
      const start = lho + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
      const raw = blob.slice(start, start + csize);
      if (method === 0) return new Uint8Array(await raw.arrayBuffer());
      const stream = raw.stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const data = new Uint8Array(await new Response(stream).arrayBuffer());
      if (usize && data.length !== usize) throw new Error(`展開したサイズが合いません（${name}）`);
      return data;
    };
    out.push(entry);
  }
  return out;
}

// JSON as Bedrock reads it: BOM, // and /* */ comments, trailing commas.
export function parseLenientJson(text) {
  text = String(text).replace(/^﻿/, "");
  let out = "", i = 0, inStr = false;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === "\\") { out += text[i + 1] ?? ""; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 2; continue; }
    if (c === ",") {  // drop a comma that only precedes } or ]
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") { i++; continue; }
    }
    out += c;
    i++;
  }
  return JSON.parse(out);
}

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;
const ARCHIVE = /\.(mcpack|zip|mcaddon)$/i;
const LANG_KEY = /^[\w-]+(\.[\w-]+)+$/;

async function langLookup(files, key) {
  for (const lang of ["ja_JP", "en_US"]) {
    const f = files.find(x => x.rel === `texts/${lang}.lang`);
    if (!f) continue;
    let text;
    try { text = new TextDecoder().decode(await f.read()); } catch { continue; }
    for (let line of text.split(/\r?\n/)) {
      line = line.replace(/^﻿/, "");
      if (!line.startsWith(key + "=")) continue;
      const v = line.slice(key.length + 1).split("\t#")[0].trim();
      if (v) return v;
    }
  }
  return null;
}

const typeOf = types =>
  types.some(t => t === "data" || t === "script" || t === "javascript") ? "behavior" :
  types.includes("resources") ? "resources" :
  types.includes("skin_pack") ? "skins" :
  types.includes("world_template") ? "world" : (types[0] || "unknown");

async function describe(root, files) {
  const label = root.replace(/\/$/, "").split("/").pop() || "（ルート）";
  const mf = files.find(f => f.rel === "manifest.json");
  let m;
  try { m = parseLenientJson(new TextDecoder().decode(await mf.read())); }
  catch (e) { return { root, files, name: label, kind: "broken", error: `manifest.json を読めません（${e.message}）` }; }
  const h = m?.header ?? {};
  const types = (Array.isArray(m?.modules) ? m.modules : []).map(x => String(x?.type ?? "").toLowerCase());
  let name = String(h.name ?? "");
  if (LANG_KEY.test(name)) name = (await langLookup(files, name)) ?? name;
  name = name.replace(/§./g, "").trim() || label;
  const version = Array.isArray(h.version) ? h.version.join(".") : String(h.version ?? "?");
  return {
    root, files, name, version, uuid: String(h.uuid ?? ""), kind: typeOf(types),
    size: files.reduce((a, f) => a + (f.size || 0), 0),
    icon: files.find(f => f.rel === "pack_icon.png") ?? null,
    subpacks: (Array.isArray(m?.subpacks) ? m.subpacks : []).map(s => String(s?.folder_name ?? "")).filter(Boolean),
  };
}

// inputs: [{ path, size, read }] - files of a dropped folder, or dropped archives.
// Returns { packs: [{ root, name, version, uuid, kind, size, files: [{ rel, size, read }] }], skipped: [{ name, reason }] }
export async function findPacks(inputs, depth = 0) {
  const files = inputs.filter(f => !JUNK.test(f.path) && !f.path.split("/").some(s => s === ".." || s === "."));
  // pack roots: folders with a manifest.json, outermost only
  const roots = files.filter(f => !ARCHIVE.test(f.path) && /(^|\/)manifest\.json$/.test(f.path))
    .map(f => f.path.slice(0, f.path.length - "manifest.json".length))
    .sort((a, b) => a.length - b.length)
    .reduce((acc, r) => (acc.some(x => r.startsWith(x)) ? acc : [...acc, r]), []);
  const result = { packs: [], skipped: [] };
  for (const root of roots) {
    const pf = files.filter(f => f.path.startsWith(root)).map(f => ({ ...f, rel: f.path.slice(root.length) }));
    result.packs.push(await describe(root, pf));
  }
  // archives that are not part of a pack (.mcpack files dropped directly, or inside an .mcaddon)
  for (const a of files) {
    if (!ARCHIVE.test(a.path) || roots.some(r => a.path.startsWith(r))) continue;
    if (depth >= 3) { result.skipped.push({ name: a.path, reason: "入れ子が深すぎます" }); continue; }
    let inner;
    try {
      const data = await a.read();
      inner = await readZip(new Blob([data]), a.path.replace(ARCHIVE, "") + "/");
    } catch (e) { result.skipped.push({ name: a.path, reason: e.message }); continue; }
    const sub = await findPacks(inner, depth + 1);
    result.packs.push(...sub.packs);
    result.skipped.push(...sub.skipped);
  }
  if (depth === 0 && !result.packs.length && !result.skipped.length)
    result.skipped.push({ name: inputs.length === 1 ? inputs[0].path : `${inputs.length} 個のファイル`, reason: "manifest.json が見つかりません（リソースパックではありません）" });
  return result;
}

// Wraps browser File objects ({ path } from a folder / drop) for findPacks.
export const fromFile = (file, path) => ({
  path: (path ?? file.webkitRelativePath ?? file.name).replace(/^\/+/, "") || file.name,
  size: file.size,
  read: async () => new Uint8Array(await file.arrayBuffer()),
});
