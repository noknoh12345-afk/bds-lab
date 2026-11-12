'use strict';
// BDS 標準のアドオン（ビヘイビアパック / リソースパック）管理
//   - サーバーの behavior_packs/ resource_packs/ と、ワールド内の world_*_packs.json（有効化と順番）
//   - .mcpack / .mcaddon / .zip の取り込み（manifest の modules から種類を判定）
//   - 実験的機能（level.dat の experiments。Beta APIs など）
//   - Script API の許可モジュール（config/default/permissions.json。@minecraft/server-net / server-admin など）
const fsp = require('node:fs/promises');
const path = require('node:path');
const { extractZip } = require('./zip');
const nbt = require('./nbt');
const { parseLooseJson } = require('./textures');

const TYPES = { behavior: 'behavior_packs', resource: 'resource_packs' };
const WORLD_JSON = { behavior: 'world_behavior_packs.json', resource: 'world_resource_packs.json' };
// BDS に最初から入っているパック（消さない・一覧では「標準」）
const BUILTIN = /^(vanilla|chemistry|experimental|editor|server_editor|test_|oreui)/i;

// よく使う実験的機能（level.dat の experiments のキー）。ほかのキーも手で追加できる
const KNOWN_EXPERIMENTS = {
  gametest: 'Beta APIs（@minecraft/server の beta 版など）',
  upcoming_creator_features: 'Upcoming Creator Features（今後のクリエイター向け機能）',
  data_driven_biomes: 'Custom Biomes（カスタムバイオーム）',
  experimental_creator_cameras: 'Experimental Creator Camera Features',
  locator_bar: 'Locator Bar',
};

const SCRIPT_MODULES = {
  '@minecraft/server': 'ワールド・エンティティ・イベント（基本）',
  '@minecraft/server-ui': 'フォーム（ボタン・入力画面）',
  '@minecraft/server-gametest': 'GameTest・シミュレートプレイヤー',
  '@minecraft/server-net': 'HTTP 通信（BDS 専用）',
  '@minecraft/server-admin': '変数・シークレット・サーバー管理（BDS 専用）',
  '@minecraft/server-editor': 'エディター',
  '@minecraft/debug-utilities': 'デバッグ用ユーティリティ',
};

async function readManifest(dir) {
  try {
    return parseLooseJson(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

function packType(man) {
  const types = (man?.modules || []).map((m) => m.type);
  if (types.includes('resources')) return 'resource';
  if (types.some((t) => ['data', 'script', 'javascript', 'client_data'].includes(t))) return 'behavior';
  return null;
}

const verStr = (v) => (Array.isArray(v) ? v.join('.') : String(v ?? ''));
const text = (s) => String(s ?? '').replace(/§./g, '');

async function listPacks(instDir, level) {
  const worldDir = path.join(instDir, 'worlds', level);
  const enabled = {};
  for (const [t, f] of Object.entries(WORLD_JSON)) {
    try {
      enabled[t] = JSON.parse(await fsp.readFile(path.join(worldDir, f), 'utf8'));
    } catch {
      enabled[t] = [];
    }
  }
  const out = [];
  const scan = async (root, where) => {
    for (const [t, sub] of Object.entries(TYPES)) {
      const base = path.join(root, sub);
      for (const d of await fsp.readdir(base, { withFileTypes: true }).catch(() => [])) {
        if (!d.isDirectory()) continue;
        const man = await readManifest(path.join(base, d.name));
        if (!man?.header?.uuid) continue;
        const uuid = man.header.uuid;
        const idx = enabled[t].findIndex((e) => e.pack_id === uuid);
        out.push({
          type: t,
          where, // server | world
          dir: d.name,
          uuid,
          version: man.header.version || [1, 0, 0],
          name: text(man.header.name) || d.name,
          description: text(man.header.description),
          builtin: where === 'server' && BUILTIN.test(d.name),
          scripts: (man.modules || []).some((m) => m.type === 'script'),
          scriptModules: (man.dependencies || []).map((x) => x.module_name).filter(Boolean),
          minEngine: verStr(man.header.min_engine_version),
          enabled: idx >= 0,
          order: idx,
        });
      }
    }
  };
  await scan(instDir, 'server');
  await scan(worldDir, 'world');
  return { packs: out, enabled };
}

async function writeEnabled(instDir, level, type, list) {
  if (!WORLD_JSON[type]) throw new Error('種類が不正');
  const file = path.join(instDir, 'worlds', level, WORLD_JSON[type]);
  const data = list.map((e) => ({ pack_id: String(e.uuid || e.pack_id), version: Array.isArray(e.version) ? e.version : String(e.version).split('.').map(Number) }));
  for (const d of data) if (!/^[0-9a-f-]{36}$/i.test(d.pack_id)) throw new Error(`UUID が不正: ${d.pack_id}`);
  await fsp.writeFile(file, JSON.stringify(data, null, 2));
  return data;
}

/** .mcpack / .mcaddon / .zip を取り込む → 入れたパックの一覧 */
async function installArchive(file, instDir, { workDir } = {}) {
  const tmp = await fsp.mkdtemp(path.join(workDir || path.dirname(file), '.addon-'));
  try {
    await extractZip(file, tmp, { maxBytes: 2 * 1024 * 1024 * 1024 });
    // .mcaddon の中に .mcpack が入っていることもある
    for (const f of await walk(tmp, 2)) {
      if (/\.(mcpack|zip)$/i.test(f)) {
        const d = `${f}.d`;
        await extractZip(f, d, { maxBytes: 2 * 1024 * 1024 * 1024 }).catch(() => {});
      }
    }
    const manifests = (await walk(tmp, 5)).filter((f) => path.basename(f) === 'manifest.json');
    if (!manifests.length) throw new Error('manifest.json が見つかりません（.mcpack / .mcaddon ではない？）');
    const installed = [];
    for (const m of manifests) {
      const dir = path.dirname(m);
      const man = await readManifest(dir);
      const type = packType(man);
      if (!type || !man.header?.uuid) continue;
      const safe = `${text(man.header.name).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'pack'}_${man.header.uuid.slice(0, 8)}`;
      const dst = path.join(instDir, TYPES[type], safe);
      await fsp.rm(dst, { recursive: true, force: true });
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.cp(dir, dst, { recursive: true });
      installed.push({ type, uuid: man.header.uuid, version: man.header.version || [1, 0, 0], name: text(man.header.name), dir: safe, scripts: (man.modules || []).some((x) => x.type === 'script') });
    }
    if (!installed.length) throw new Error('取り込めるパックがありません（modules の種類が不明）');
    return installed;
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

async function walk(dir, depth) {
  const out = [];
  if (depth < 0) return out;
  for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, depth - 1)));
    else out.push(p);
  }
  return out;
}

async function removePack(instDir, level, type, dirName) {
  if (!TYPES[type] || !/^[^/\\]+$/.test(dirName) || dirName.startsWith('.')) throw new Error('パックの指定が不正');
  if (BUILTIN.test(dirName)) throw new Error('BDS 標準のパックは消せません');
  const dir = path.join(instDir, TYPES[type], dirName);
  const man = await readManifest(dir);
  await fsp.rm(dir, { recursive: true, force: true });
  if (man?.header?.uuid) {
    const { enabled } = await listPacks(instDir, level);
    await writeEnabled(instDir, level, type, enabled[type].filter((e) => e.pack_id !== man.header.uuid).map((e) => ({ uuid: e.pack_id, version: e.version })));
  }
}

// ---- 実験的機能（level.dat） ----
async function readExperiments(worldDir) {
  const ld = nbt.readLevelDat(await fsp.readFile(path.join(worldDir, 'level.dat')));
  const ex = ld.tag.value.experiments?.value || {};
  const out = {};
  for (const [k, v] of Object.entries(ex)) if (v.type === 'byte') out[k] = !!v.value;
  return out;
}

/** サーバー停止中に呼ぶ */
async function writeExperiments(worldDir, flags) {
  const file = path.join(worldDir, 'level.dat');
  const ld = nbt.readLevelDat(await fsp.readFile(file));
  const v = ld.tag.value;
  v.experiments ??= { type: 'compound', value: {} };
  const ex = v.experiments.value;
  let any = false;
  for (const [k, on] of Object.entries(flags)) {
    if (!/^[a-z0-9_]{1,64}$/.test(k)) throw new Error(`実験的機能の名前が不正: ${k}`);
    ex[k] = { type: 'byte', value: on ? 1 : 0 };
  }
  for (const [k, t] of Object.entries(ex)) if (t.type === 'byte' && t.value && !['experiments_ever_used', 'saved_with_toggled_experiments'].includes(k)) any = true;
  if (any) {
    ex.experiments_ever_used = { type: 'byte', value: 1 };
    ex.saved_with_toggled_experiments = { type: 'byte', value: 1 };
  }
  await fsp.copyFile(file, `${file}.levikit-bak`);
  await fsp.writeFile(file, nbt.writeLevelDat(ld));
}

// ---- Script API の許可モジュール ----
async function readPermissions(instDir) {
  try {
    return parseLooseJson(await fsp.readFile(path.join(instDir, 'config', 'default', 'permissions.json'), 'utf8'));
  } catch {
    return { allowed_modules: ['@minecraft/server-gametest', '@minecraft/server', '@minecraft/server-ui', '@minecraft/server-admin', '@minecraft/server-editor'] };
  }
}

async function writePermissions(instDir, modules) {
  const cur = await readPermissions(instDir);
  const list = [...new Set(modules.map(String))].filter((m) => /^@minecraft\/[a-z0-9-]+$/.test(m));
  const file = path.join(instDir, 'config', 'default', 'permissions.json');
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify({ ...cur, allowed_modules: list }, null, 2));
  return list;
}

module.exports = { listPacks, writeEnabled, installArchive, removePack, readExperiments, writeExperiments, readPermissions, writePermissions, KNOWN_EXPERIMENTS, SCRIPT_MODULES, packType };
