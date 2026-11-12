'use strict';
// サーバーフォルダ内の設定ファイル編集（テキストのみ・ワールドデータや実行ファイルは触らせない）
const path = require('node:path');
const fsp = require('node:fs/promises');

const TEXT_EXT = new Set(['.json', '.properties', '.txt', '.toml', '.yml', '.yaml', '.ini', '.cfg', '.conf', '.js', '.lua', '.py', '.md', '.log', '.mcfunction', '.lang', '']);
const DENY_TOP = new Set(['worlds', 'behavior_packs', 'resource_packs', 'definitions', 'bedrock_server_how_to.html']);
const MAX = 1024 * 1024;

function resolveSafe(root, rel) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(root, clean);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('範囲外のパスです');
  const top = clean.split('/')[0];
  if (DENY_TOP.has(top)) throw new Error('このフォルダは編集対象外です（ワールドやパックはバックアップ機能で扱います）');
  return { abs, rel: clean };
}

async function list(root, rel) {
  const { abs, rel: r } = resolveSafe(root, rel);
  const st = await fsp.stat(abs);
  if (!st.isDirectory()) throw new Error('フォルダではありません');
  const out = [];
  for (const e of await fsp.readdir(abs, { withFileTypes: true })) {
    if (!r && DENY_TOP.has(e.name)) continue;
    if (e.name.startsWith('.')) continue;
    const p = path.join(abs, e.name);
    if (e.isDirectory()) out.push({ name: e.name, dir: true });
    else if (e.isFile()) {
      const s = await fsp.stat(p);
      const ext = path.extname(e.name).toLowerCase();
      out.push({ name: e.name, dir: false, size: s.size, mtime: s.mtimeMs, editable: TEXT_EXT.has(ext) && s.size <= MAX });
    }
  }
  out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  return { path: r, entries: out };
}

async function read(root, rel) {
  const { abs } = resolveSafe(root, rel);
  const st = await fsp.stat(abs);
  if (!st.isFile()) throw new Error('ファイルではありません');
  if (!TEXT_EXT.has(path.extname(abs).toLowerCase())) throw new Error('テキストファイルのみ編集できます');
  if (st.size > MAX) throw new Error('1MB を超えるファイルは開けません');
  return { content: await fsp.readFile(abs, 'utf8'), mtime: st.mtimeMs };
}

async function write(root, rel, content, expectMtime) {
  const { abs } = resolveSafe(root, rel);
  if (!TEXT_EXT.has(path.extname(abs).toLowerCase())) throw new Error('テキストファイルのみ編集できます');
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX) throw new Error('内容が大きすぎます');
  const st = await fsp.stat(abs).catch(() => null);
  if (st && expectMtime && Math.abs(st.mtimeMs - expectMtime) > 1) throw new Error('ファイルが他で更新されています。開き直してください');
  if (abs.endsWith('.json')) {
    try {
      JSON.parse(content.replace(/^﻿/, ''));
    } catch (e) {
      throw new Error(`JSON の構文エラー: ${e.message}`);
    }
  }
  if (st) await fsp.copyFile(abs, `${abs}.levikit-bak`).catch(() => {});
  await fsp.writeFile(abs, content);
  return { mtime: (await fsp.stat(abs)).mtimeMs };
}

module.exports = { list, read, write, resolveSafe };
