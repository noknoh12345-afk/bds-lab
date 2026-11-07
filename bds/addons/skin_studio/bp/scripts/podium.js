// Skin Podium — award podium for Skin Changer.
// Each statue copies the skin a Skin Changer player publishes on the client:
// the statue's render controller reads temp.mimic_texture_<slot> whose
// generation matches temp.mimic_epoch_<slot>, then caches it per statue.
// Here we only keep each statue pointed at its owner's current slot/epoch.
import { world, system, Player, GameMode, ItemStack } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { spawnSimulatedPlayer, getPlayerSkin, SimulatedPlayer } from '@minecraft/server-gametest';

const PODIUM = 'skin_podium:podium';
const STATUE = 'skin_podium:statue';
const DIMS = ['overworld', 'nether', 'the_end'];
// feet positions on the model, in model units (16 = 1 block); front = model -z,
// model +x = the podium's own left (the viewer's right) — 2nd left, 3rd right as seen from the front
const STAND = { 1: [0, 22.4, 0], 2: [-18, 16.4, 0], 3: [18, 12.4, 0] };
const RANK_COLOR = { 0: '§f', 1: '§6', 2: '§7', 3: '§n' };
const POSES = ['自動(順位ごと)', '万歳', '手を振る', 'ガッツポーズ', '直立', '指さし'];
const STYLES = ['スキンそのまま', 'メタリック像(順位の色)'];
const K = { cfg: 'sp:cfg', podium: 'sp:podium', rank: 'sp:rank', init: 'sp:init', lock: 'sp:lock' };

let warnedNoSkinChanger = false;

// ---------- helpers
const tell = (p, msg) => { try { p.sendMessage(`§e[表彰台]§r ${msg}`); } catch (_) {} };
const MQ_PREFIX = 'Mannequin_';
const isMannequin = p => { try { return p instanceof SimulatedPlayer || p.name.startsWith(MQ_PREFIX); } catch (_) { return false; } };
const allPlayers = () => world.getAllPlayers();
const online = () => allPlayers().filter(p => !isMannequin(p));   // real people only (menus, owners)
const valid = e => { try { return !!e && e.isValid; } catch (_) { return false; } };
function getJSON(e, key, fallback) {
  try { const v = e.getDynamicProperty(key); return typeof v === 'string' ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
}
const setJSON = (e, key, v) => e.setDynamicProperty(key, JSON.stringify(v));
function defaultCfg() { return { ownerId: '', ownerName: '', pose: 0, slim: false, style: 0, showName: true, animate: true, realgeo: true, spin: false, vault: '' }; }
const cfgOf = s => ({ ...defaultCfg(), ...getJSON(s, K.cfg, {}) });

function yawOf(e) { try { return e.getRotation().y; } catch (_) { return 0; } }
function snapYaw(y) { return Math.round(y / 90) * 90; }
// model point -> world, for an entity at `loc` facing `yaw` (yaw 0 = +z)
function modelToWorld(loc, yaw, [mx, my, mz]) {
  const r = yaw * Math.PI / 180;
  const f = { x: -Math.sin(r), z: Math.cos(r) };
  const left = { x: f.z, z: -f.x };
  return {
    x: loc.x + left.x * mx / 16 + f.x * (-mz / 16),
    y: loc.y + my / 16,
    z: loc.z + left.z * mx / 16 + f.z * (-mz / 16),
  };
}
function nearestPlayer(dim, loc, maxDist = 10) {
  let best, bd = maxDist * maxDist;
  for (const p of online()) {
    if (p.dimension.id !== dim.id) continue;
    const d = (p.location.x - loc.x) ** 2 + (p.location.y - loc.y) ** 2 + (p.location.z - loc.z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function canEdit(p, podium) {
  if (p.hasTag('podium_admin')) return true;
  let op = true;
  try { if (p.playerPermissionLevel !== undefined) op = p.playerPermissionLevel >= 2; } catch (_) {}
  if (op) return true;
  const locked = podium && valid(podium) && podium.getDynamicProperty(K.lock) === true;
  return !locked;
}

// ---------- statue state
function applyCfg(statue, cfg, rank) {
  setJSON(statue, K.cfg, cfg);
  try {
    if (rank !== undefined) statue.setProperty('skin_podium:rank', rank);
    statue.setProperty('skin_podium:pose', cfg.pose | 0);
    statue.setProperty('skin_podium:style', cfg.style | 0);
    statue.setProperty('skin_podium:slim', !!cfg.slim);
    statue.setProperty('skin_podium:animate', cfg.animate !== false);
    statue.setProperty('skin_podium:realgeo', cfg.realgeo !== false);
    statue.setProperty('skin_podium:spin', !!cfg.spin);
    if (!cfg.ownerId && !cfg.ownerName) {
      statue.setProperty('skin_podium:target', 0);
      statue.setProperty('skin_podium:target_epoch', 0);
    }
  } catch (e) { console.warn(`[Skin Podium] property: ${e}`); }
  // keep a backup on the podium so a lost statue can be rebuilt
  const pid = statue.getDynamicProperty(K.podium);
  const podium = typeof pid === 'string' ? world.getEntity(pid) : undefined;
  const r = statue.getDynamicProperty(K.rank);
  if (valid(podium) && typeof r === 'number') setJSON(podium, `sp:backup${r}`, cfg);
  refreshName(statue, cfg);
  syncStatue(statue, cfg, new Map(online().map(p => [p.id, p])));
}
function ownerSkinSave(live, cfg) {
  // keep the owner's skin data so a mannequin can wear it when they are offline
  const data = vaultSave(live.name, live);
  if (data) { cfg.vault = live.name; if (data.armSize) cfg.slim = data.armSize === 'Slim'; }
  return cfg;
}
function refreshName(statue, cfg = cfgOf(statue)) {
  const r = statue.getDynamicProperty(K.rank) ?? 0;
  const label = r ? `${RANK_COLOR[r]}§l${r}位§r` : '';
  const name = cfg.ownerName ? `§f${cfg.ownerName}` : '§8(空き)';
  const tag = cfg.showName ? (label ? `${label}\n${name}` : name) : '';
  try { if (statue.nameTag !== tag) statue.nameTag = tag; } catch (_) {}
}
function syncStatue(statue, cfg, byId) {
  let owner = cfg.ownerId ? byId.get(cfg.ownerId) : undefined;
  if (!owner && !cfg.ownerId && cfg.ownerName) {
    // assigned by name (command) before that player was online: bind on first sight
    owner = [...byId.values()].find(p => p.name === cfg.ownerName);
    if (owner) { cfg.ownerId = owner.id; setJSON(statue, K.cfg, cfg); }
  }
  if (!cfg.vault && cfg.ownerName && vaultGet(cfg.ownerName)) { cfg.vault = cfg.ownerName; setJSON(statue, K.cfg, cfg); }   // saved later from the vault menu
  let source = owner;
  if (!owner && cfg.vault) source = mannequinFor(cfg.vault, statue);   // offline: the SimulatedPlayer wearing their saved skin
  else if (owner && cfg.vault) mannequinRelease(cfg.vault, statue);
  if (!source) return;
  if (!owner) { applySlot(statue, source); return; }
  if (owner.name !== cfg.ownerName) { cfg.ownerName = owner.name; setJSON(statue, K.cfg, cfg); refreshName(statue, cfg); }
  if (cfg.vault === owner.name) vaultMaybeRefresh(owner);
  applySlot(statue, owner);
}
function slotOf(p) {
  let slot, epoch;
  try { slot = p.getProperty('mimic:slot'); epoch = p.getProperty('mimic:epoch'); }
  catch (e) {
    if (!warnedNoSkinChanger) { warnedNoSkinChanger = true; console.warn('[Skin Podium] Skin Changer の mimic:slot が読めません。Skin Changer を有効にしてください。'); }
    return undefined;
  }
  if (!Number.isInteger(slot) || !Number.isInteger(epoch) || slot < 1 || epoch < 1) return undefined;
  return { slot, epoch };
}
function applySlot(statue, source) {
  const se = slotOf(source); if (!se) return;
  const { slot, epoch } = se;
  try {
    if (statue.getProperty('skin_podium:target') !== slot) statue.setProperty('skin_podium:target', slot);
    if (statue.getProperty('skin_podium:target_epoch') !== epoch) statue.setProperty('skin_podium:target_epoch', epoch);
  } catch (_) {}
}
// ---------- podium construction
function statuesOf(podium) {
  const out = {};
  for (const r of [1, 2, 3]) {
    const id = podium.getDynamicProperty(`sp:statue${r}`);
    const s = typeof id === 'string' ? world.getEntity(id) : undefined;
    if (valid(s)) out[r] = s;
  }
  return out;
}
function spawnStatue(podium, r) {
  const yaw = yawOf(podium);
  const pos = modelToWorld(podium.location, yaw, STAND[r]);
  const s = podium.dimension.spawnEntity(STATUE, pos);
  s.setDynamicProperty(K.init, true);
  s.setDynamicProperty(K.podium, podium.id);
  s.setDynamicProperty(K.rank, r);
  s.teleport(pos, { rotation: { x: 0, y: yaw } });
  podium.setDynamicProperty(`sp:statue${r}`, s.id);
  const backup = getJSON(podium, `sp:backup${r}`, defaultCfg());
  applyCfg(s, { ...defaultCfg(), ...backup }, r);
  return s;
}
function placeStatues(podium) {
  const yaw = yawOf(podium);
  const have = statuesOf(podium);
  for (const r of [1, 2, 3]) {
    const s = have[r];
    if (!s) {
      const pos = modelToWorld(podium.location, yaw, STAND[r]);
      let loaded = false; try { loaded = !!podium.dimension.getBlock(pos); } catch (_) {}
      if (!loaded) continue;   // its chunk is not loaded: the statue may still exist there
      const found = podium.dimension.getEntities({ type: STATUE, location: pos, maxDistance: 1.5 })
        .find(e => e.getDynamicProperty(K.podium) === podium.id && e.getDynamicProperty(K.rank) === r);
      if (found) { podium.setDynamicProperty(`sp:statue${r}`, found.id); continue; }
      try { spawnStatue(podium, r); } catch (e) { console.warn(`[Skin Podium] spawn statue: ${e}`); } continue; }
    const pos = modelToWorld(podium.location, yaw, STAND[r]);
    const l = s.location;
    if (Math.abs(l.x - pos.x) > 0.02 || Math.abs(l.y - pos.y) > 0.02 || Math.abs(l.z - pos.z) > 0.02 || Math.abs(yawOf(s) - yaw) > 0.5)
      s.teleport(pos, { rotation: { x: 0, y: yaw } });
  }
}
function setupPodium(podium) {
  if (podium.getDynamicProperty(K.init)) return;
  podium.setDynamicProperty(K.init, true);
  const p = nearestPlayer(podium.dimension, podium.location);
  const yaw = p ? snapYaw(yawOf(p) + 180) : 0;   // face the person who placed it
  const l = podium.location;
  const loc = { x: Math.floor(l.x) + 0.5, y: l.y, z: Math.floor(l.z) + 0.5 };
  podium.teleport(loc, { rotation: { x: 0, y: yaw } });
  system.runTimeout(() => { if (valid(podium)) placeStatues(podium); }, 2);
  if (p) tell(p, '表彰台を設置しました。台か像を§b使用(右クリック/長押し)§rすると設定できます。');
}
function removePodium(podium, giver) {
  for (const s of Object.values(statuesOf(podium))) { try { s.remove(); } catch (_) {} }
  try { podium.remove(); } catch (_) {}
  if (giver && giver.getGameMode?.() !== 'creative') {
    try { giver.runCommand('give @s skin_podium:podium_spawn_egg'); } catch (_) {}
  }
}

// ---------- ceremony
function ceremony(podium) {
  const dim = podium.dimension, yaw = yawOf(podium), have = statuesOf(podium);
  for (const s of Object.values(have)) { try { s.setProperty('skin_podium:celebrate', true); } catch (_) {} }
  system.runTimeout(() => { for (const s of Object.values(statuesOf(podium))) { try { s.setProperty('skin_podium:celebrate', false); } catch (_) {} } }, 120);
  try { dim.playSound('random.levelup', podium.location, { volume: 1.5 }); } catch (_) {}
  const names = {};
  for (const r of [1, 2, 3]) {
    const s = have[r]; if (!s) continue;
    names[r] = cfgOf(s).ownerName;
    const top = modelToWorld(podium.location, yaw, [STAND[r][0], STAND[r][1] + 30, 0]);
    for (let i = 0; i < 4; i++) system.runTimeout(() => {
      try { dim.spawnParticle('minecraft:totem_particle', top); } catch (_) {}
      try { dim.playSound('firework.blast', top); } catch (_) {}
    }, 10 * i + r * 4);
  }
  const sub = [2, 3].filter(r => names[r]).map(r => `${RANK_COLOR[r]}${r}位 ${names[r]}`).join('  ');
  for (const p of online()) {
    if (p.dimension.id !== dim.id) continue;
    const d = Math.hypot(p.location.x - podium.location.x, p.location.z - podium.location.z);
    if (d > 48) continue;
    try { p.onScreenDisplay.setTitle(names[1] ? `§6§l1位 §f${names[1]}` : '§6§l表彰式', { subtitle: sub, fadeInDuration: 10, stayDuration: 70, fadeOutDuration: 20 }); } catch (_) {}
  }
}

// ---------- menus
const busy = new Set();
async function guarded(p, fn) {
  if (busy.has(p.id)) return; busy.add(p.id);
  try { await fn(); } catch (e) { tell(p, `§cエラー: ${e}`); } finally { busy.delete(p.id); }
}
function podiumOfStatue(s) {
  const id = s.getDynamicProperty(K.podium);
  const pd = typeof id === 'string' ? world.getEntity(id) : undefined;
  return valid(pd) ? pd : undefined;
}

async function podiumMenu(p, podium) {
  placeStatues(podium);
  const st = statuesOf(podium);
  const f = new ActionFormData().title('§l表彰台').body('順位を選んでプレイヤーを置けます。');
  const acts = [];
  for (const r of [1, 2, 3]) {
    const c = st[r] ? cfgOf(st[r]) : defaultCfg();
    f.button(`${RANK_COLOR[r]}§l${r}位§r  ${c.ownerName || '§8(空き)'}`); acts.push(['rank', r]);
  }
  f.button('§6表彰式を始める'); acts.push(['ceremony']);
  f.button('§3この表彰台を画面に表示(HUD)'); acts.push(['hud']);
  const spinning = Object.values(st).some(s => cfgOf(s).spin);
  f.button(spinning ? '像の回転を止める' : '像を回転させる(ターンテーブル)'); acts.push(['spin', spinning]);
  f.button('§dスキン保管庫(マネキン)'); acts.push(['vault']);
  f.button('向きを90°回転'); acts.push(['rotate']);
  let bd = true; try { bd = podium.getProperty('skin_podium:backdrop') !== false; } catch (_) {}
  f.button(bd ? '背景(カーテン・アーチ・旗)を隠す' : '背景(カーテン・アーチ・旗)を出す'); acts.push(['backdrop', bd]);
  let op = true; try { if (p.playerPermissionLevel !== undefined) op = p.playerPermissionLevel >= 2; } catch (_) {}
  if (op || p.hasTag('podium_admin')) {
    f.button(podium.getDynamicProperty(K.lock) ? 'ロック中(OPのみ編集) → 解除' : '誰でも編集可 → ロック'); acts.push(['lock']);
  }
  f.button('§c撤去する'); acts.push(['remove']);
  const res = await f.show(p);
  if (res.canceled || !valid(podium)) return;
  const [a, r] = acts[res.selection] ?? [];
  if (a === 'rank') { const s = statuesOf(podium)[r]; if (s) await statueMenu(p, s); }
  else if (a === 'ceremony') ceremony(podium);
  else if (a === 'hud') { hudSet(p, { mode: 2, self: false, statues: [1, 2, 3].map(k => statuesOf(podium)[k]?.id ?? '') }); tell(p, '表彰台を画面に表示しました(一人称視点)。設定は §b/scriptevent podium:hud§r'); }
  else if (a === 'spin') { for (const s of Object.values(statuesOf(podium))) applyCfg(s, { ...cfgOf(s), spin: !r }); }
  else if (a === 'vault') { await nextTick(); await vaultMenu(p); }
  else if (a === 'backdrop') { try { podium.setProperty('skin_podium:backdrop', !r); } catch (_) {} }
  else if (a === 'rotate') { podium.teleport(podium.location, { rotation: { x: 0, y: snapYaw(yawOf(podium) + 90) } }); system.runTimeout(() => valid(podium) && placeStatues(podium), 1); }
  else if (a === 'lock') { podium.setDynamicProperty(K.lock, !podium.getDynamicProperty(K.lock)); tell(p, podium.getDynamicProperty(K.lock) ? 'ロックしました。' : 'ロックを解除しました。'); }
  else if (a === 'remove') {
    const c = await new ActionFormData().title('撤去').body('表彰台と3体の像を撤去しますか？').button('§c撤去する').button('やめる').show(p);
    if (!c.canceled && c.selection === 0 && valid(podium)) removePodium(podium, p);
  }
}

async function statueMenu(p, statue) {
  const r = statue.getDynamicProperty(K.rank) ?? 0;
  const cfg = cfgOf(statue);
  const others = online().filter(q => q.id !== p.id);
  const f = new ActionFormData().title(r ? `§l${r}位の像` : '§lスキン像')
    .body(`いま: ${cfg.ownerName || '(空き)'}\n置くプレイヤーを選んでください。`);
  const acts = [];
  f.button('§a自分を置く'); acts.push(['set', p]);
  for (const q of others) { f.button(q.name); acts.push(['set', q]); }
  if (vaultNames().length) { f.button('§d保存スキン(マネキン)から選ぶ'); acts.push(['vault']); }
  f.button('§bポーズ・体型・回転・見た目'); acts.push(['look']);
  f.button('§3この像を画面に表示(HUD)'); acts.push(['hud']);
  f.button('§7空にする'); acts.push(['clear']);
  if (podiumOfStatue(statue)) { f.button('← 表彰台メニュー'); acts.push(['back']); }
  const res = await f.show(p);
  if (res.canceled || !valid(statue)) return;
  const [a, who] = acts[res.selection] ?? [];
  if (a === 'set') {
    const live = online().find(x => x.id === who.id);
    if (!live) return tell(p, 'そのプレイヤーは退出しました。');
    applyCfg(statue, ownerSkinSave(live, { ...cfg, ownerId: live.id, ownerName: live.name }));
    tell(p, `${r ? r + '位に' : '像に'} ${live.name} を置きました。スキンは本人が近くにいる間に読み込まれます。`);
  } else if (a === 'clear') {
    if (cfg.vault) mannequinRelease(cfg.vault, statue);
    applyCfg(statue, { ...cfg, ownerId: '', ownerName: '', vault: '' });
  } else if (a === 'vault') {
    await nextTick(); await vaultPick(p, statue);
  } else if (a === 'hud') {
    hudSet(p, { mode: 1, self: false, statues: [statue.id] }); tell(p, '画面に表示しました。一人称視点で見えます。設定は §b/scriptevent podium:hud§r');
  } else if (a === 'look') {
    await lookMenu(p, statue);
  } else if (a === 'back') {
    const pd = podiumOfStatue(statue); if (pd) { await nextTick(); await podiumMenu(p, pd); }
  }
}
const nextTick = () => new Promise(res => system.runTimeout(res, 1));

async function lookMenu(p, statue) {
  await nextTick();
  const cfg = cfgOf(statue);
  const f = new ModalFormData().title('見た目の設定')
    .dropdown('ポーズ', POSES, { defaultValueIndex: cfg.pose | 0 })
    .toggle('動き(簡易アニメーション)', { defaultValue: cfg.animate !== false })
    .toggle('回転(ターンテーブル)', { defaultValue: !!cfg.spin })
    .toggle('4D・細腕などスキン本来の形を使う(推奨)', { defaultValue: cfg.realgeo !== false })
    .toggle('↑がOFF/未対応のとき: 細腕(Alex型)', { defaultValue: !!cfg.slim })
    .dropdown('スタイル', STYLES, { defaultValueIndex: cfg.style | 0 })
    .toggle('名前を表示', { defaultValue: cfg.showName !== false });
  const res = await f.show(p);
  if (res.canceled || !valid(statue)) return;
  const [pose, animate, spin, realgeo, slim, style, showName] = res.formValues;
  applyCfg(statue, { ...cfgOf(statue), pose: Number(pose) | 0, animate: !!animate, spin: !!spin, realgeo: !!realgeo, slim: !!slim, style: Number(style) | 0, showName: !!showName });
}

// ---------- events
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (!valid(entity)) return;
    if (entity.typeId === PODIUM) system.run(() => valid(entity) && setupPodium(entity));
    else if (entity.typeId === STATUE) system.run(() => {
      if (!valid(entity) || entity.getDynamicProperty(K.init)) return;
      entity.setDynamicProperty(K.init, true);           // a standalone statue from its spawn egg
      const p = nearestPlayer(entity.dimension, entity.location);
      const l = entity.location;
      entity.teleport({ x: Math.floor(l.x) + 0.5, y: l.y, z: Math.floor(l.z) + 0.5 }, { rotation: { x: 0, y: p ? snapYaw(yawOf(p) + 180) : 0 } });
      applyCfg(entity, defaultCfg(), 0);
    });
  } catch (e) { console.warn(`[Skin Podium] spawn: ${e}`); }
});

// The AFTER event only fires for entities with an interact component; ours have
// none, so listen BEFORE (read-only: everything happens in system.run).
const lastUse = new Map();
world.beforeEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (!(player instanceof Player) || !target) return;
  const type = target.typeId;
  if (type !== PODIUM && type !== STATUE) return;
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -100) < 8) return;   // a held button repeats
  lastUse.set(player.id, now);
  system.run(() => {
    if (!valid(target)) return;
    const podium = type === PODIUM ? target : podiumOfStatue(target);
    if (!canEdit(player, podium)) return tell(player, 'この表彰台はロックされています。');
    guarded(player, () => type === PODIUM ? podiumMenu(player, target) : statueMenu(player, target));
  });
});

// command blocks / functions:
//   /scriptevent podium:set 1 PlayerName   /scriptevent podium:clear all   /scriptevent podium:ceremony
system.afterEvents.scriptEventReceive.subscribe(e => {
  if (!e.id.startsWith('podium:')) return;
  if (e.id === 'podium:hud' || e.id === 'podium:vault') {
    const src = e.sourceEntity;
    if (!(src instanceof Player)) return;
    const arg = e.message.trim();
    // /scriptevent podium:hud podium|self|off — switch without the menu (command blocks)
    if (e.id === 'podium:hud' && arg) {
      if (arg === 'off') return hudSet(src, { mode: 0 });
      if (arg === 'self') { let slim = false; try { slim = cleanSkin(getPlayerSkin(src))?.armSize === 'Slim'; } catch (_) {} return hudSet(src, { mode: 1, self: true, selfSlim: slim, statues: [] }); }
      if (arg === 'podium') {
        const pd = src.dimension.getEntities({ type: PODIUM, location: src.location, maxDistance: 32, closest: 1 })[0];
        if (pd) return hudSet(src, { mode: 2, self: false, statues: [1, 2, 3].map(k => statuesOf(pd)[k]?.id ?? '') });
        return tell(src, '32ブロック以内に表彰台がありません。');
      }
    }
    system.run(() => guarded(src, () => e.id === 'podium:hud' ? hudMenu(src) : vaultMenu(src)));
    return;
  }
  // /scriptevent podium:vaultcopy <name> slim|wide [#rrggbb] — save MY skin under another name, changed
  // /scriptevent podium:vaultdel <name>
  if (e.id === 'podium:vaultcopy' || e.id === 'podium:vaultdel') {
    const src = e.sourceEntity;
    const [name, arm, color] = e.message.trim().split(/\s+/);
    if (!name || !/^[\w\-]{1,24}$/.test(name)) return;
    if (e.id === 'podium:vaultdel') return vaultDelete(name);
    if (!(src instanceof Player)) return;
    let d; try { d = cleanSkin(getPlayerSkin(src)); } catch (_) {}
    if (!d) return;
    if (arm === 'slim' || arm === 'wide') d.armSize = arm === 'slim' ? 'Slim' : 'Wide';
    const m = /^#?([0-9a-f]{6})$/i.exec(color ?? '');
    if (m) { const n = parseInt(m[1], 16); d.skinColor = { red: (n >> 16 & 255) / 255, green: (n >> 8 & 255) / 255, blue: (n & 255) / 255 }; }
    vaultPut(name, d);
    const mq = mannequins.get(name); if (mq && valid(mq.sp)) dress(mq.sp, d);   // a live mannequin is re-dressed at once
    return;
  }
  const src = e.sourceEntity ?? undefined;
  const dim = src?.dimension ?? e.sourceBlock?.dimension;
  const loc = src?.location ?? e.sourceBlock?.location;
  if (!dim || !loc) return;
  const podium = dim.getEntities({ type: PODIUM, location: loc, maxDistance: 32, closest: 1 })[0];
  if (!podium) { if (src instanceof Player) tell(src, '32ブロック以内に表彰台がありません。'); return; }
  placeStatues(podium);
  const st = statuesOf(podium);
  const [first, ...rest] = e.message.trim().split(/\s+/);
  if (e.id === 'podium:ceremony') return ceremony(podium);
  if (e.id === 'podium:set') {
    const r = Number(first);
    let name = rest.join(' ').replace(/^"|"$/g, '');
    if (name === '@s' && src instanceof Player) name = src.name;     // the player who ran it
    if (![1, 2, 3].includes(r) || !name || !st[r]) return;
    const live = online().find(p => p.name === name);
    const cfg = { ...cfgOf(st[r]), ownerId: live?.id ?? '', ownerName: live?.name ?? name };
    if (live) ownerSkinSave(live, cfg);
    else { const v = vaultGet(name); if (v) { cfg.vault = name; cfg.slim = v.armSize === 'Slim'; } else cfg.vault = ''; }
    applyCfg(st[r], cfg);
  } else if (e.id === 'podium:spin') {          // /scriptevent podium:spin on|off
    for (const s of Object.values(st)) applyCfg(s, { ...cfgOf(s), spin: first !== 'off' });
  } else if (e.id === 'podium:look') {          // /scriptevent podium:look <rank|all> <pose 0-5> <style 0-1>
    const pose = Math.max(0, Math.min(5, Number(rest[0]) | 0)), style = Math.max(0, Math.min(1, Number(rest[1]) | 0));
    for (const r of first === 'all' ? [1, 2, 3] : [Number(first)])
      if (st[r]) applyCfg(st[r], { ...cfgOf(st[r]), pose, style });
  } else if (e.id === 'podium:clear') {
    for (const r of first === 'all' || !first ? [1, 2, 3] : [Number(first)])
      if (st[r]) applyCfg(st[r], { ...cfgOf(st[r]), ownerId: '', ownerName: '' });
  }
});

// keep statues on their owners' current Skin Changer slot/epoch, and podiums intact
system.runInterval(() => {
  const byId = new Map(online().map(p => [p.id, p]));
  for (const id of DIMS) {
    let dim; try { dim = world.getDimension(id); } catch (_) { continue; }
    let podiums = [], statues = [];
    try { podiums = dim.getEntities({ type: PODIUM }); statues = dim.getEntities({ type: STATUE }); } catch (_) { continue; }
    for (const pd of podiums) { try { if (!pd.getDynamicProperty(K.init)) setupPodium(pd); else placeStatues(pd); } catch (e) { console.warn(`[Skin Podium] podium: ${e}`); } }
    for (const s of statues) {
      try {
        const pid = s.getDynamicProperty(K.podium);
        const owner = typeof pid === 'string' ? world.getEntity(pid) : undefined;
        if (valid(owner) && owner.getDynamicProperty(`sp:statue${s.getDynamicProperty(K.rank)}`) !== s.id) { s.remove(); continue; } // duplicate
        if (typeof pid === 'string' && !valid(owner)) {
          // orphan: its podium is gone (not just unloaded — a podium shares the statue's chunk)
          const near = dim.getEntities({ type: PODIUM, location: s.location, maxDistance: 3 });
          if (!near.length) { s.remove(); continue; }
        }
        syncStatue(s, cfgOf(s), byId);
      } catch (e) { console.warn(`[Skin Podium] statue: ${e}`); }
    }
  }
  try { mannequinTick(); } catch (e) { console.warn(`[Skin Podium] mannequin: ${e}`); }
  try { hudTick(); } catch (e) { console.warn(`[Skin Podium] hud: ${e}`); }
}, 20);

// =====================================================================
// Skin vault + mannequins (SimulatedPlayer)
//   getPlayerSkin(player)  -> PlayerSkinData { armSize, skinColor, personaPieces }
//   spawnSimulatedPlayer() -> a real player entity, so Skin Changer gives it a
//   slot and it PUBLISHES its skin like anyone else; setSkin() dresses it, and
//   a later setSkin() re-dresses it — every statue pointing at it follows.
//   The RP hides a mannequin's own body (sneaking + holding a barrier) but
//   keeps its invisible publish controller running.
// =====================================================================
const VAULT_INDEX = 'sp:vault_index';
const vaultKey = name => `sp:vault:${name}`;
const MQ_MAX = 16;
const mannequins = new Map();     // vault name -> { sp, idx, users:Set<statueId>, anchor, dim, idle }
const lastRefresh = new Map();    // player name -> tick

function vaultNames() { try { const v = world.getDynamicProperty(VAULT_INDEX); return typeof v === 'string' ? JSON.parse(v) : []; } catch (_) { return []; } }
function vaultGet(name) { try { const v = world.getDynamicProperty(vaultKey(name)); return typeof v === 'string' ? JSON.parse(v) : undefined; } catch (_) { return undefined; } }
function vaultPut(name, data) {
  world.setDynamicProperty(vaultKey(name), JSON.stringify(data));
  const idx = vaultNames(); if (!idx.includes(name)) { idx.push(name); world.setDynamicProperty(VAULT_INDEX, JSON.stringify(idx)); }
}
function vaultDelete(name) {
  world.setDynamicProperty(vaultKey(name), undefined);
  world.setDynamicProperty(VAULT_INDEX, JSON.stringify(vaultNames().filter(n => n !== name)));
  const m = mannequins.get(name); if (m) { dismiss(m); mannequins.delete(name); }
}
function cleanSkin(d) {
  if (!d) return undefined;
  const out = {};
  if (d.armSize) out.armSize = String(d.armSize);
  if (d.skinColor) out.skinColor = { red: +d.skinColor.red || 0, green: +d.skinColor.green || 0, blue: +d.skinColor.blue || 0 };
  if (Array.isArray(d.personaPieces)) out.personaPieces = d.personaPieces.map(p => ({
    id: String(p.id), packId: String(p.packId), productId: String(p.productId), type: p.type, isDefaultPiece: !!p.isDefaultPiece }));
  return out;
}
function vaultSave(name, player) {
  try {
    const data = cleanSkin(getPlayerSkin(player));
    if (!data) return undefined;
    vaultPut(name, data);
    lastRefresh.set(player.name, system.currentTick);
    const m = mannequins.get(name); if (m && valid(m.sp)) dress(m.sp, data);   // re-dress a live mannequin at once
    return data;
  } catch (e) { console.warn(`[Skin Podium] getPlayerSkin: ${e}`); return undefined; }
}
function vaultMaybeRefresh(owner) {
  const last = lastRefresh.get(owner.name) ?? -1e9;
  if (system.currentTick - last > 6000) vaultSave(owner.name, owner);   // keep the saved look fresh (every 5 min)
}
function dress(sp, data) {
  try { sp.setSkin(data); } catch (e) { console.warn(`[Skin Podium] setSkin: ${e}`); }
}
function hideBody(sp) {
  try { sp.isSneaking = true; } catch (_) {}
  try { sp.setItem(new ItemStack('minecraft:barrier', 1), 0, true); } catch (_) {}
  try { if (sp.nameTag !== '') sp.nameTag = ''; } catch (_) {}
}
function anchorFor(statue) {
  // 1.75 blocks behind the statue: behind the backdrop, inside the camera's view whenever the statue is
  return { dim: statue.dimension, loc: modelToWorld(statue.location, yawOf(statue), [0, 0, 28]) };
}
function freeIndex() {
  const used = new Set([...mannequins.values()].map(m => m.idx));
  for (let i = 1; i <= MQ_MAX; i++) if (!used.has(i)) return i;
  return 0;
}
function mannequinFor(name, statue) {
  let m = mannequins.get(name);
  if (m && valid(m.sp)) { m.users.add(statue.id); m.idle = 0; return m.sp; }
  const data = vaultGet(name);
  if (!data) return undefined;
  const idx = m?.idx || freeIndex();
  if (!idx) return undefined;
  const { dim, loc } = anchorFor(statue);
  let sp;
  try { sp = spawnSimulatedPlayer({ dimension: dim, x: loc.x, y: loc.y, z: loc.z }, `${MQ_PREFIX}${String(idx).padStart(2, '0')}`, GameMode.Creative); }
  catch (e) { console.warn(`[Skin Podium] spawnSimulatedPlayer: ${e}`); return undefined; }
  dress(sp, data);                      // wear the skin from the very start
  hideBody(sp);
  try { sp.fly(); } catch (_) {}
  m = { sp, idx, users: new Set([statue.id]), anchor: loc, dim, idle: 0 };
  mannequins.set(name, m);
  return sp;
}
function mannequinRelease(name, statue) { const m = mannequins.get(name); if (m) m.users.delete(statue.id); }
// a SimulatedPlayer leaves with disconnect(); remove() as a fallback
function kick(p) { const sp = /** @type {any} */ (p); try { sp.disconnect(); } catch (_) { try { sp.remove(); } catch (_) {} } }
function dismiss(m) { kick(m.sp); }
function mannequinTick() {
  const tracked = new Set([...mannequins.values()].map(m => m.sp?.id));
  // strays from a /reload or an earlier session
  for (const p of allPlayers()) if (isMannequin(p) && !tracked.has(p.id)) kick(p);
  for (const [name, m] of [...mannequins]) {
    for (const id of [...m.users]) { const s = world.getEntity(id); if (!valid(s) || cfgOf(s).vault !== name) m.users.delete(id); }
    if (!m.users.size) { if (++m.idle > 20) { dismiss(m); mannequins.delete(name); } continue; }
    if (!valid(m.sp)) { mannequins.delete(name); continue; }
    const l = m.sp.location;
    if (Math.abs(l.x - m.anchor.x) + Math.abs(l.y - m.anchor.y) + Math.abs(l.z - m.anchor.z) > 0.6)
      try { m.sp.teleport(m.anchor, { dimension: m.dim }); } catch (_) {}
    hideBody(m.sp);
  }
}

// ---------- vault menus
async function vaultPick(p, statue) {
  const names = vaultNames();
  const f = new ActionFormData().title('保存スキンから選ぶ').body('本人がオフラインでも、マネキン(SimulatedPlayer)が代わりに着て像に映します。');
  names.forEach(n => f.button(n));
  const res = await f.show(p);
  if (res.canceled || !valid(statue)) return;
  const name = names[res.selection];
  const data = vaultGet(name);
  const live = online().find(q => q.name === name);
  applyCfg(statue, { ...cfgOf(statue), ownerId: live?.id ?? '', ownerName: name, vault: name, slim: data?.armSize === 'Slim' });
  tell(p, `${name} の保存スキンを置きました。`);
}
async function vaultMenu(p) {
  const names = vaultNames();
  const f = new ActionFormData().title('§lスキン保管庫')
    .body(`保存数: ${names.length}\n保存したスキンはマネキン(SimulatedPlayer)が着て、オフラインの人の像にも映ります。`);
  const acts = [];
  f.button('§a自分のスキンを保存/更新'); acts.push(['save', p]);
  for (const q of online().filter(q => q.id !== p.id)) { f.button(`保存/更新: ${q.name}`); acts.push(['save', q]); }
  for (const n of names) { f.button(`§d着せ替え・削除: ${n}`); acts.push(['edit', n]); }
  const res = await f.show(p);
  if (res.canceled) return;
  const [a, x] = acts[res.selection] ?? [];
  if (a === 'save') {
    const live = online().find(q => q.id === x.id);
    if (!live) return tell(p, 'そのプレイヤーは退出しました。');
    const d = vaultSave(live.name, live);
    tell(p, d ? `${live.name} のスキンを保存しました(${(d.personaPieces ?? []).length}パーツ / ${d.armSize ?? '?'})。` : '§cスキンを取得できませんでした(Beta APIが必要)。');
  } else if (a === 'edit') { await nextTick(); await vaultEdit(p, x); }
}
async function vaultEdit(p, name) {
  const d = vaultGet(name); if (!d) return;
  const hex = d.skinColor ? '#' + [d.skinColor.red, d.skinColor.green, d.skinColor.blue].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('') : '';
  const f = new ModalFormData().title(`着せ替え: ${name}`)
    .dropdown('腕の太さ', ['Wide(Steve型)', 'Slim(Alex型)'], { defaultValueIndex: d.armSize === 'Slim' ? 1 : 0 })
    .textField('肌の色 (#RRGGBB・空欄で変更なし)', '#c08060', { defaultValue: hex })
    .toggle('§cこの保存スキンを削除', { defaultValue: false });
  const res = await f.show(p);
  if (res.canceled) return;
  const [arm, color, del] = res.formValues;
  if (del) { vaultDelete(name); return tell(p, `${name} を削除しました。`); }
  d.armSize = arm === 1 ? 'Slim' : 'Wide';
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (m) { const n = parseInt(m[1], 16); d.skinColor = { red: (n >> 16 & 255) / 255, green: (n >> 8 & 255) / 255, blue: (n & 255) / 255 }; }
  vaultPut(name, d);
  const mq = mannequins.get(name); if (mq && valid(mq.sp)) dress(mq.sp, d);   // re-dress: statues follow on the next frame
  tell(p, `${name} を着せ替えました。`);
}

// =====================================================================
// geoUI-style HUD: the statues drawn on YOUR screen.
//   The RP hangs small figures under a bone named "body", which the vanilla
//   first-person base pose turns with the camera — so they stay on screen.
//   Here we only tell each viewer's player entity which slot/epoch to show.
// =====================================================================
const HUD_KEY = 'sp:hud';
function hudGet(p) { return { mode: 0, statues: [], size: 10, x: 35, y: 18, spin: true, ...getJSON(p, HUD_KEY, {}) }; }
function hudSet(p, patch) { setJSON(p, HUD_KEY, { ...hudGet(p), ...patch }); hudApply(p); }
function setProp(p, k, v) { try { if (p.getProperty(k) !== v) p.setProperty(k, v); } catch (_) {} }
function hudApply(p) {
  const h = hudGet(p);
  let slimBits = 0;
  for (let k = 0; k < 3; k++) {
    if (k === 0 && h.self) {
      const se = slotOf(p);
      if (se) { setProp(p, 'skin_podium:hud_s1', se.slot); setProp(p, 'skin_podium:hud_e1', se.epoch); }
      if (h.selfSlim) slimBits |= 1;
      continue;
    }
    const id = h.statues[k];
    const s = id ? world.getEntity(id) : undefined;
    if (!valid(s)) { if (!id) { setProp(p, `skin_podium:hud_s${k + 1}`, 0); setProp(p, `skin_podium:hud_e${k + 1}`, 0); } continue; }
    let slot = 0, epoch = 0;
    try { slot = s.getProperty('skin_podium:target'); epoch = s.getProperty('skin_podium:target_epoch'); } catch (_) {}
    if (slot > 0 && epoch > 0) { setProp(p, `skin_podium:hud_s${k + 1}`, slot); setProp(p, `skin_podium:hud_e${k + 1}`, epoch); }
    if (cfgOf(s).slim) slimBits |= 1 << k;
  }
  setProp(p, 'skin_podium:hud', h.mode | 0);
  setProp(p, 'skin_podium:hud_slim', slimBits);
  setProp(p, 'skin_podium:hud_size', Math.max(3, Math.min(30, h.size | 0)));
  setProp(p, 'skin_podium:hud_x', Math.max(-60, Math.min(60, h.x | 0)));
  setProp(p, 'skin_podium:hud_y', Math.max(-60, Math.min(60, h.y | 0)));
  setProp(p, 'skin_podium:hud_spin', !!h.spin);
}
function hudTick() { for (const p of online()) if (hudGet(p).mode > 0) hudApply(p); }
async function hudMenu(p) {
  const h = hudGet(p);
  const f = new ModalFormData().title('画面表示(HUD)の設定')
    .dropdown('表示', ['オフ', '1体', '表彰台(3体)'], { defaultValueIndex: h.mode | 0 })
    .slider('大きさ', 3, 30, { valueStep: 1, defaultValue: h.size | 0 })
    .slider('左右の位置', -60, 60, { valueStep: 1, defaultValue: h.x | 0 })
    .slider('上下の位置', -60, 60, { valueStep: 1, defaultValue: h.y | 0 })
    .toggle('回転させる', { defaultValue: !!h.spin })
    .toggle('1体表示を「自分」にする', { defaultValue: false });
  const res = await f.show(p);
  if (res.canceled) return;
  const [mode, size, x, y, spin, self] = res.formValues;
  const patch = { mode: Number(mode) | 0, size: Number(size), x: Number(x), y: Number(y), spin: !!spin, self: false };
  if (self) {
    patch.mode = 1; patch.self = true; patch.statues = [];
    try { patch.selfSlim = cleanSkin(getPlayerSkin(p))?.armSize === 'Slim'; } catch (_) { patch.selfSlim = false; }
  }
  hudSet(p, patch);
}
