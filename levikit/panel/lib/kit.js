'use strict';
// levikit-core の設定 (plugins/levikit-core/config/config.json) の既定値・プリセット・検証
// 既定値は Mod 側 Config.h と同じ内容にしておくこと
const path = require('node:path');
const { readJson, writeJsonAtomic } = require('./util');

const KIT_VERSION = 4;

const RULES_TEMPLATE = {
  gameMode: '',
  inventoryGroup: 'default',
  pvp: true,
  keepInventory: false,
  respawnInWorld: false,
  netherLink: '',
  protection: 'none',
  protectionRadius: 32,
  protectInteract: false,
  builders: [],
  mobSpawning: 'all',
  borderRadius: 0,
  borderCenterOnSpawn: true,
  borderCenterX: 0,
  borderCenterZ: 0,
  timeLock: -1,
  maxPlayers: 0,
  open: true,
  opOnly: false,
  allowedPlayers: [],
  enterTitle: '',
  enterSubtitle: '',
  enterCommands: [],
  leaveCommands: [],
};
const DIM_TEMPLATE = { name: '', displayName: '', description: '', icon: '', generator: 'Overworld', seed: 0, spawn: { x: 0.5, y: 100, z: 0.5 }, landing: 'auto', enabled: true, rules: RULES_TEMPLATE };
const VANILLA_TEMPLATE = { displayName: '', description: '', icon: '', spawn: { x: 0.5, y: 100, z: 0.5 }, landing: 'auto', show: true, rules: RULES_TEMPLATE };
const WARP_TEMPLATE = { name: '', world: 'overworld', x: 0.5, y: 100, z: 0.5, yaw: 0, description: '', opOnly: false };
const PORTAL_TEMPLATE = { name: '', world: 'overworld', x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0, target: '', message: '', enabled: true };
const BAN_TEMPLATE = { name: '', xuid: '', reason: '', until: 0, by: '' };
const ROLE_TEMPLATE = { name: '', members: [] };
const IMPORT_TEMPLATE = { name: '', file: '', clearFirst: true };
const CLONE_TEMPLATE = { from: '', to: '' };

const r = (o) => ({ ...RULES_TEMPLATE, ...o });

const KIT_DEFAULT = {
  version: KIT_VERSION,
  limboMode: false,
  limboMessage: '§e[LeviKit] §fサーバーを更新/復元しています。完了すると自動で元のワールドへ戻ります…',
  dimCommandForEveryone: true,
  rememberLastPosition: true,
  separateInventories: true,
  chatMode: 'global',
  defaultGameMode: 'survival',
  menuItem: 'minecraft:compass',
  hub: { mode: 'none', target: '' },
  tpaEnabled: true,
  tpaCrossWorld: true,
  tpaTimeoutSeconds: 60,
  spawnCommand: true,
  backCommand: true,
  roles: [],
  maintenance: false,
  maintenanceMessage: '§cただいまメンテナンス中です。しばらくお待ちください',
  maintenanceAllow: [],
  bans: [],
  welcomeMessage: '§a{name} さん、ようこそ！ §7/dim でワールドを切り替えられます',
  statsIntervalSeconds: 10,
  overworld: { ...VANILLA_TEMPLATE, displayName: 'オーバーワールド', description: 'メインのサバイバルワールド', icon: 'textures/blocks/grass_side_carried', spawn: { x: 0.5, y: 100, z: 0.5 }, landing: 'surface' },
  nether: { ...VANILLA_TEMPLATE, displayName: 'ネザー', icon: 'textures/blocks/netherrack', spawn: { x: 0.5, y: 70, z: 0.5 }, landing: 'platform' },
  theEnd: { ...VANILLA_TEMPLATE, displayName: 'ジ・エンド', icon: 'textures/blocks/end_stone', spawn: { x: 100.5, y: 49, z: 0.5 }, landing: 'fixed' },
  dimensions: [
    { ...DIM_TEMPLATE, name: 'levikit:resource', displayName: '資源ワールド', description: '定期的にリセットされる採掘用ワールド', icon: 'textures/blocks/iron_ore', seed: 20261106, spawn: { x: 0.5, y: 120, z: 0.5 }, landing: 'surface', rules: r({ borderRadius: 3000, enterTitle: '§6資源ワールド', enterSubtitle: '§7定期的にリセットされます' }) },
    { ...DIM_TEMPLATE, name: 'levikit:flat', displayName: '建築ワールド', description: 'クリエイティブ・持ち物別・モブなし・常に昼', icon: 'textures/blocks/brick', generator: 'Flat', seed: 1, spawn: { x: 0.5, y: -60, z: 0.5 }, landing: 'fixed', rules: r({ gameMode: 'creative', inventoryGroup: 'creative', pvp: false, keepInventory: true, respawnInWorld: true, mobSpawning: 'none', timeLock: 6000 }) },
    { ...DIM_TEMPLATE, name: 'levikit:void', displayName: '虚空ワールド', description: '何もない空間。スカイブロックやイベントに', icon: 'textures/blocks/glass', generator: 'Void', seed: 1, spawn: { x: 0.5, y: 64, z: 0.5 }, landing: 'platform', rules: r({ keepInventory: true, respawnInWorld: true }) },
  ],
  warps: [],
  portals: [],
  pendingResets: [],
  pendingImports: [],
  pendingClones: [],
};

/** 追加ダイアログのプリセット */
const PRESETS = {
  blank: { label: '標準（オーバーワールド型）', dim: { generator: 'Overworld', landing: 'surface', icon: 'textures/blocks/grass_side_carried', rules: r({}) } },
  lobby: {
    label: 'ロビー（保護・アドベンチャー・PvPなし）',
    dim: { generator: 'Void', landing: 'platform', icon: 'textures/items/nether_star', description: '参加時に集まる場所', rules: r({ gameMode: 'adventure', pvp: false, keepInventory: true, respawnInWorld: true, protection: 'all', mobSpawning: 'none', timeLock: 6000, enterTitle: '§bロビー' }) },
  },
  resource: {
    label: '資源ワールド（ボーダー・定期リセット向け）',
    dim: { generator: 'Overworld', landing: 'surface', icon: 'textures/blocks/iron_ore', description: '定期的にリセットされます', rules: r({ borderRadius: 3000, enterTitle: '§6資源ワールド' }) },
  },
  creative: {
    label: '建築（クリエ・持ち物別・常に昼）',
    dim: { generator: 'Flat', landing: 'fixed', spawn: { x: 0.5, y: -60, z: 0.5 }, icon: 'textures/blocks/brick', description: 'クリエイティブで自由に建築', rules: r({ gameMode: 'creative', inventoryGroup: 'creative', pvp: false, keepInventory: true, respawnInWorld: true, mobSpawning: 'none', timeLock: 6000 }) },
  },
  pvp: {
    label: 'PvP アリーナ（持ち物別・キット配布）',
    dim: {
      generator: 'Flat',
      landing: 'fixed',
      spawn: { x: 0.5, y: -60, z: 0.5 },
      icon: 'textures/items/diamond_sword',
      description: '入場時に装備が配られます',
      rules: r({ gameMode: 'adventure', inventoryGroup: 'pvp', pvp: true, keepInventory: false, respawnInWorld: true, protection: 'all', mobSpawning: 'none', maxPlayers: 20, enterTitle: '§cPvP', enterCommands: ['clear {player}', 'give {player} iron_sword', 'give {player} bow', 'give {player} arrow 32', 'give {player} cooked_beef 16'], leaveCommands: ['clear {player}'] }),
    },
  },
  event: {
    label: 'イベント会場（初期は閉鎖・保護）',
    dim: { generator: 'Void', landing: 'platform', icon: 'textures/items/fireworks', description: 'イベント開催時だけ開放', rules: r({ gameMode: 'adventure', inventoryGroup: 'event', pvp: false, keepInventory: true, respawnInWorld: true, protection: 'all', mobSpawning: 'none', open: false }) },
  },
  skyblock: {
    label: 'スカイブロック（虚空・持ち物別）',
    dim: { generator: 'Void', landing: 'platform', icon: 'textures/blocks/sapling_oak', description: '何もない空から始める', rules: r({ inventoryGroup: 'skyblock', respawnInWorld: true, enterCommands: [] }) },
  },
  nether: { label: '第2のネザー（資源用）', dim: { generator: 'Nether', landing: 'platform', icon: 'textures/blocks/netherrack', rules: r({ borderRadius: 1500 }) } },
  end: { label: '第2のエンド', dim: { generator: 'TheEnd', landing: 'platform', icon: 'textures/blocks/end_stone', rules: r({}) } },
};

const GENERATORS = ['Overworld', 'Flat', 'Nether', 'TheEnd', 'Void'];
const LANDINGS = ['auto', 'surface', 'platform', 'fixed'];
const GAMEMODES = ['', 'survival', 'creative', 'adventure', 'spectator'];
const PROTECTIONS = ['none', 'all', 'spawn'];
const MOBSPAWN = ['all', 'noHostile', 'none'];
const CHATMODES = ['global', 'prefix', 'world'];
const HUBMODES = ['none', 'firstJoin', 'always'];
const DIM_KEYS = ['dimensions', 'overworld', 'nether', 'theEnd', 'dimCommandForEveryone', 'rememberLastPosition', 'separateInventories', 'chatMode', 'defaultGameMode', 'menuItem', 'hub', 'tpaEnabled', 'tpaCrossWorld', 'tpaTimeoutSeconds', 'spawnCommand', 'backCommand'];
const ACCESS_KEYS = ['maintenance', 'maintenanceMessage', 'maintenanceAllow', 'bans', 'welcomeMessage', 'roles'];

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** 深いマージ（配列は置き換え） */
function deepMerge(base, over) {
  if (!isObj(over)) return over === undefined ? structuredClone(base) : over;
  const out = isObj(base) ? structuredClone(base) : {};
  for (const [k, v] of Object.entries(over)) out[k] = isObj(base?.[k]) && isObj(v) ? deepMerge(base[k], v) : v;
  return out;
}

/** v1/v2 の形を v3 へ（Mod 側 migrate と同じ） */
function migrate(kit) {
  const moveRules = (e) => {
    if (!isObj(e)) return;
    if (!isObj(e.rules)) e.rules = {};
    for (const k of ['gameMode', 'inventoryGroup', 'opOnly']) {
      if (k in e) {
        e.rules[k] = e[k];
        delete e[k];
      }
    }
  };
  if ((kit.version || 1) < 3) {
    (kit.dimensions || []).forEach(moveRules);
    ['overworld', 'nether', 'theEnd'].forEach((k) => moveRules(kit[k]));
  }
  return kit;
}

function normalizeKit(raw) {
  const data = migrate(structuredClone(raw || {}));
  const kit = deepMerge(KIT_DEFAULT, data);
  kit.dimensions = (Array.isArray(data.dimensions) ? data.dimensions : KIT_DEFAULT.dimensions).map((d) => deepMerge(DIM_TEMPLATE, d));
  kit.warps = (Array.isArray(data.warps) ? data.warps : []).map((w) => deepMerge(WARP_TEMPLATE, w));
  kit.portals = (Array.isArray(data.portals) ? data.portals : []).map((p) => deepMerge(PORTAL_TEMPLATE, p));
  kit.bans = (Array.isArray(data.bans) ? data.bans : []).map((b) => deepMerge(BAN_TEMPLATE, b));
  kit.roles = (Array.isArray(data.roles) ? data.roles : []).map((x) => deepMerge(ROLE_TEMPLATE, x));
  kit.pendingImports = (Array.isArray(data.pendingImports) ? data.pendingImports : []).map((x) => deepMerge(IMPORT_TEMPLATE, x));
  kit.pendingClones = (Array.isArray(data.pendingClones) ? data.pendingClones : []).map((x) => deepMerge(CLONE_TEMPLATE, x));
  for (const v of ['overworld', 'nether', 'theEnd']) kit[v] = deepMerge(VANILLA_TEMPLATE, kit[v]);
  kit.version = KIT_VERSION;
  return kit;
}

const kitPath = (instDir) => path.join(instDir, 'plugins', 'levikit-core', 'config', 'config.json');

async function readKit(instDir) {
  return normalizeKit(await readJson(kitPath(instDir), {}));
}

async function writeKit(instDir, kit) {
  const k = normalizeKit(kit);
  k.limboMode = false;
  await writeJsonAtomic(kitPath(instDir), k);
  return k;
}

const strList = (v, max = 64) =>
  (Array.isArray(v) ? v : String(v || '').split(/\n/))
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, max);

function num(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function validateRules(rr, label) {
  if (!GAMEMODES.includes(rr.gameMode || '')) throw new Error(`${label}: ゲームモードが不正 (${rr.gameMode})`);
  rr.inventoryGroup = String(rr.inventoryGroup || 'default').trim() || 'default';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(rr.inventoryGroup)) throw new Error(`${label}: 持ち物グループ名は英数字/_/- (32文字まで): ${rr.inventoryGroup}`);
  if (!PROTECTIONS.includes(rr.protection)) throw new Error(`${label}: 保護モードが不正`);
  if (!MOBSPAWN.includes(rr.mobSpawning)) throw new Error(`${label}: モブスポーン設定が不正`);
  rr.protectionRadius = Math.round(num(rr.protectionRadius, 32, 1, 100000));
  rr.borderRadius = Math.round(num(rr.borderRadius, 0, 0, 30000000));
  rr.borderCenterX = num(rr.borderCenterX, 0, -30000000, 30000000);
  rr.borderCenterZ = num(rr.borderCenterZ, 0, -30000000, 30000000);
  rr.timeLock = Math.round(num(rr.timeLock, -1, -1, 23999));
  rr.maxPlayers = Math.round(num(rr.maxPlayers, 0, 0, 1000));
  for (const k of ['pvp', 'keepInventory', 'respawnInWorld', 'protectInteract', 'borderCenterOnSpawn', 'open', 'opOnly']) rr[k] = !!rr[k];
  rr.builders = strList(rr.builders);
  rr.allowedPlayers = strList(rr.allowedPlayers, 500);
  rr.enterCommands = strList(rr.enterCommands, 32).map((c) => c.replace(/^\//, ''));
  rr.leaveCommands = strList(rr.leaveCommands, 32).map((c) => c.replace(/^\//, ''));
  rr.enterTitle = String(rr.enterTitle || '').slice(0, 120);
  rr.enterSubtitle = String(rr.enterSubtitle || '').slice(0, 120);
}

function worldKeys(kit) {
  return ['overworld', 'nether', 'the_end', ...kit.dimensions.map((d) => d.name)];
}

function validateTarget(t, kit, label) {
  if (!t) return;
  const m = /^(world|warp|last):(.+)$/.exec(t);
  const isWarp = (n) => kit.warps.some((w) => w.name === n);
  const ok = m ? (m[1] === 'warp' ? isWarp(m[2]) : worldKeys(kit).includes(m[2])) : worldKeys(kit).includes(t) || isWarp(t);
  if (!ok) throw new Error(`${label}: 行き先 "${t}" が見つかりません（world:<ID> / warp:<名前> / last:<ID>）`);
}

function validateDims(kit) {
  const names = new Set();
  for (const d of kit.dimensions) {
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(d.name)) throw new Error(`ID は "namespace:name" 形式（小文字英数）にしてください: ${d.name}`);
    if (d.name.startsWith('minecraft:')) throw new Error('minecraft: 名前空間は使えません');
    if (names.has(d.name)) throw new Error(`ID が重複しています: ${d.name}`);
    names.add(d.name);
    if (!GENERATORS.includes(d.generator)) throw new Error(`生成タイプが不正: ${d.generator}`);
    if (!LANDINGS.includes(d.landing)) throw new Error(`着地が不正: ${d.landing}`);
    d.seed = Math.max(0, Math.min(4294967295, parseInt(d.seed, 10) || 0));
    for (const k of ['x', 'y', 'z']) d.spawn[k] = Number(d.spawn?.[k]) || 0;
    {
      // 生成タイプごとの高さの範囲（MoreDimensions: ネザー型 0〜128 / エンド型 0〜256 / それ以外 -64〜320）
      const [lo, hi] = d.generator === 'Nether' ? [1, 125] : d.generator === 'TheEnd' ? [1, 254] : [-63, 318];
      if (d.spawn.y < lo || d.spawn.y > hi) throw new Error(`${d.displayName || d.name}: スポーンの高さ ${d.spawn.y} は ${d.generator} 型の範囲外です（${lo}〜${hi}）`);
    }
    d.displayName = String(d.displayName || '').slice(0, 40);
    d.description = String(d.description || '').slice(0, 80);
    d.icon = String(d.icon || '').trim();
    if (d.icon && !/^textures\/[A-Za-z0-9_./-]+$/.test(d.icon)) throw new Error(`${d.name}: アイコンは textures/... のパス`);
    d.enabled = !!d.enabled;
    validateRules(d.rules, d.name);
  }
  for (const k of ['overworld', 'nether', 'theEnd']) {
    const v = kit[k];
    for (const c of ['x', 'y', 'z']) v.spawn[c] = Number(v.spawn?.[c]) || 0;
    if (!LANDINGS.includes(v.landing)) throw new Error(`${k}: 着地が不正`);
    v.show = !!v.show;
    validateRules(v.rules, k);
  }
  if (!CHATMODES.includes(kit.chatMode)) throw new Error('チャットモードが不正');
  if (!['survival', 'creative', 'adventure'].includes(kit.defaultGameMode)) throw new Error('既定のゲームモードが不正');
  if (kit.menuItem && !/^[a-z0-9_]+:[a-z0-9_.]+$/.test(kit.menuItem)) throw new Error('メニューアイテムは minecraft:compass のような ID');
  kit.tpaTimeoutSeconds = Math.round(num(kit.tpaTimeoutSeconds, 60, 10, 600));
  for (const k of ['tpaEnabled', 'tpaCrossWorld', 'spawnCommand', 'backCommand']) kit[k] = !!kit[k];
  if (!HUBMODES.includes(kit.hub.mode)) throw new Error('ロビーのモードが不正');
  if (kit.hub.mode !== 'none' && !kit.hub.target) throw new Error('ロビーの行き先を指定してください');
  validateTarget(kit.hub.target, kit, 'ロビー');
  validateRoleRefs(kit);
  // ワールド専用のネザー
  const linked = new Map();
  for (const d of kit.dimensions) {
    const t = String(d.rules.netherLink || '');
    d.rules.netherLink = t;
    if (!t) continue;
    const n = kit.dimensions.find((x) => x.name === t);
    if (!n || n.generator !== 'Nether') throw new Error(`${d.displayName || d.name}: 専用のネザーにはネザー型のカスタムワールドを選んでください（${t}）`);
    if (t === d.name) throw new Error(`${d.displayName || d.name}: 自分自身は専用のネザーにできません`);
    if (n.rules.netherLink) throw new Error(`${n.displayName || n.name}: 専用のネザーにしたワールドには、さらに専用のネザーを設定できません`);
    if (linked.has(t)) throw new Error(`${t} はすでに ${linked.get(t)} の専用のネザーです（1つのネザーは1つのワールド専用）`);
    linked.set(t, d.name);
  }
  for (const v of [kit.overworld, kit.nether, kit.theEnd]) if (v.rules) v.rules.netherLink = '';
}

/** 権限グループ（"@名前" で各リストから参照できる） */
function validateRoles(kit) {
  const names = new Set();
  kit.roles = (kit.roles || []).map((x) => ({ name: String(x.name || '').trim(), members: strList(x.members, 500) }));
  for (const role of kit.roles) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(role.name)) throw new Error(`グループ名は英数字/_/- (32文字まで): ${role.name}`);
    if (names.has(role.name)) throw new Error(`グループ名が重複: ${role.name}`);
    names.add(role.name);
    if (role.members.some((m) => m.startsWith('@'))) throw new Error(`グループ ${role.name}: グループの入れ子はできません`);
  }
  validateRoleRefs(kit);
}

/** リスト中の "@名前" が存在するグループか */
function validateRoleRefs(kit) {
  const names = new Set((kit.roles || []).map((x) => x.name));
  const lists = [['メンテナンス中に入れる人', kit.maintenanceAllow || []]];
  for (const [label, e] of [['オーバーワールド', kit.overworld], ['ネザー', kit.nether], ['ジ・エンド', kit.theEnd], ...kit.dimensions.map((d) => [d.displayName || d.name, d])]) {
    lists.push([`${label} の建築できる人`, e.rules?.builders || []], [`${label} の入場許可`, e.rules?.allowedPlayers || []]);
  }
  for (const [label, list] of lists) {
    for (const item of list) {
      if (String(item).startsWith('@') && !names.has(String(item).slice(1))) throw new Error(`${label}: グループ ${item} がありません（アクセス制御 → 権限グループ）`);
    }
  }
}

function validateWarps(kit) {
  const names = new Set();
  const keys = worldKeys(kit);
  for (const w of kit.warps) {
    w.name = String(w.name || '').trim();
    if (!/^[^\s"\\]{1,32}$/.test(w.name)) throw new Error(`ワープ名は空白なし32文字まで: ${w.name}`);
    if (names.has(w.name)) throw new Error(`ワープ名が重複: ${w.name}`);
    names.add(w.name);
    if (!keys.includes(w.world)) throw new Error(`ワープ ${w.name}: ワールド ${w.world} がありません`);
    for (const k of ['x', 'y', 'z', 'yaw']) w[k] = Number(w[k]) || 0;
    w.description = String(w.description || '').slice(0, 60);
    w.opOnly = !!w.opOnly;
  }
}

function validatePortals(kit) {
  const names = new Set();
  const keys = worldKeys(kit);
  for (const p of kit.portals) {
    p.name = String(p.name || '').trim();
    if (!/^[^\s"\\]{1,32}$/.test(p.name)) throw new Error(`ポータル名は空白なし32文字まで: ${p.name}`);
    if (names.has(p.name)) throw new Error(`ポータル名が重複: ${p.name}`);
    names.add(p.name);
    if (!keys.includes(p.world)) throw new Error(`ポータル ${p.name}: ワールド ${p.world} がありません`);
    for (const k of ['x1', 'y1', 'z1', 'x2', 'y2', 'z2']) p[k] = Math.round(Number(p[k]) || 0);
    const vol = (Math.abs(p.x1 - p.x2) + 1) * (Math.abs(p.y1 - p.y2) + 1) * (Math.abs(p.z1 - p.z2) + 1);
    if (vol > 4096) throw new Error(`ポータル ${p.name}: 範囲が大きすぎます（${vol} ブロック, 4096 まで）`);
    p.target = String(p.target || '').trim();
    if (!p.target) throw new Error(`ポータル ${p.name}: 行き先が空です`);
    validateTarget(p.target, kit, `ポータル ${p.name}`);
    p.message = String(p.message || '').slice(0, 120);
    p.enabled = !!p.enabled;
  }
}

module.exports = {
  KIT_VERSION,
  KIT_DEFAULT,
  DIM_TEMPLATE,
  RULES_TEMPLATE,
  WARP_TEMPLATE,
  PORTAL_TEMPLATE,
  PRESETS,
  GENERATORS,
  LANDINGS,
  GAMEMODES,
  PROTECTIONS,
  MOBSPAWN,
  CHATMODES,
  HUBMODES,
  DIM_KEYS,
  ACCESS_KEYS,
  normalizeKit,
  readKit,
  writeKit,
  kitPath,
  validateDims,
  validateRoles,
  validateRoleRefs,
  validateWarps,
  validatePortals,
  deepMerge,
};
