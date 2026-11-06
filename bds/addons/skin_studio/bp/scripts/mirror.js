// Skin Studio — mirror.
// The server only decides WHO each reflection shows (a slot for the skin, a
// slot for the pose); every frame of motion is worked out on each client:
// players publish their position / yaw / head / limb swing (and the local
// player its camera) into Molang temps from pre_animation, and the reflection
// projects the mirror image onto the glass from that client's own camera.
import { world, system, Player } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { getPlayerSkin, SimulatedPlayer } from '@minecraft/server-gametest';

const MIRROR = 'skin_podium:mirror';
const REFL = 'skin_podium:reflection';
const DIMS = ['overworld', 'nether', 'the_end'];
const POOL = 4;                       // reflections per mirror (the nearest people)
const FRAMES = ['金', '銀', '木', '黒'];
const GLASS_Y = 1.5;                  // glass centre above the mirror's feet (blocks)
const FRONT = 0.03;                   // reflections sit this far in front of the glass
const BACK = 1.4 / 16;                // the frame's back face behind the glass plane
const K = { init: 'sm:init', cfg: 'sm:cfg', pool: i => `sm:r${i}`, mirror: 'sm:mirror' };

const tell = (p, msg) => { try { p.sendMessage(`§b[鏡]§r ${msg}`); } catch (_) {} };
const valid = e => { try { return !!e && e.isValid; } catch (_) { return false; } };
const isMannequin = p => { try { return p instanceof SimulatedPlayer || p.name.startsWith('Mannequin_'); } catch (_) { return false; } };
const people = () => world.getAllPlayers().filter(p => !isMannequin(p));
const yawOf = e => { try { return e.getRotation().y; } catch (_) { return 0; } };
const snap = y => Math.round(y / 90) * 90;
const fwd = yaw => { const r = yaw * Math.PI / 180; return { x: -Math.sin(r), z: Math.cos(r) }; };
function cfgOf(m) {
  let c = {}; try { const v = m.getDynamicProperty(K.cfg); if (typeof v === 'string') c = JSON.parse(v); } catch (_) {}
  return { frame: 0, range: 8, realgeo: true, fix: 0, ...c };
}
function setProp(e, k, v) { try { if (e.getProperty(k) !== v) e.setProperty(k, v); } catch (_) {} }
function slotOf(p) {
  try {
    const slot = p.getProperty('mimic:slot'), epoch = p.getProperty('mimic:epoch');
    return Number.isInteger(slot) && Number.isInteger(epoch) && slot > 0 && epoch > 0 ? { slot, epoch } : undefined;
  } catch (_) { return undefined; }
}
// what the person LOOKS like now: a Skin Changer disguise shows in the mirror too
function lookOf(p) {
  try {
    const t = p.getProperty('mimic:target'), te = p.getProperty('mimic:target_epoch');
    if (p.getProperty('mimic:chat_ready') === true && t > 0 && te > 0) return { slot: t, epoch: te };
  } catch (_) {}
  return slotOf(p);
}
const slimCache = new Map();
function isSlim(p) {
  const c = slimCache.get(p.id);
  if (c && system.currentTick - c.t < 1200) return c.v;
  let v = false; try { v = getPlayerSkin(p)?.armSize === 'Slim'; } catch (_) {}
  slimCache.set(p.id, { v, t: system.currentTick });
  return v;
}

// ---------- placement
function reflectionSpot(m) {
  const f = fwd(yawOf(m)), l = m.location;
  return { x: l.x + f.x * FRONT, y: l.y + GLASS_Y, z: l.z + f.z * FRONT };
}
function solid(dim, loc) { try { const b = dim.getBlock(loc); return !!b && !b.isAir && !b.isLiquid; } catch (_) { return false; } }
function setupMirror(m, placer) {
  if (m.getDynamicProperty(K.init)) return;
  m.setDynamicProperty(K.init, true);
  const yaw = placer ? snap(yawOf(placer) + 180) : snap(yawOf(m));
  const f = fwd(yaw), l = m.location;
  let loc = { x: Math.floor(l.x) + 0.5, y: Math.floor(l.y + 0.01), z: Math.floor(l.z) + 0.5 };
  // against a wall: if the block behind is solid, the frame's back goes flat on it
  const behind = { x: loc.x - f.x, y: loc.y + 1, z: loc.z - f.z };
  if (solid(m.dimension, behind)) {
    const d = 0.5 - BACK - 0.01;
    loc = { x: loc.x - f.x * d, y: loc.y, z: loc.z - f.z * d };
  }
  m.teleport(loc, { rotation: { x: 0, y: yaw } });
  if (placer) tell(placer, '鏡を置きました。前に立つと映ります。鏡を§b使用§rすると設定できます。');
}
function poolOf(m) {
  const out = [];
  for (let i = 0; i < POOL; i++) {
    const id = m.getDynamicProperty(K.pool(i));
    const r = typeof id === 'string' ? world.getEntity(id) : undefined;
    out.push(valid(r) ? r : undefined);
  }
  return out;
}
function ensurePool(m) {
  const pool = poolOf(m), spot = reflectionSpot(m), yaw = yawOf(m);
  let loaded = false; try { loaded = !!m.dimension.getBlock(spot); } catch (_) {}
  if (!loaded) return pool;
  for (let i = 0; i < POOL; i++) {
    let r = pool[i];
    if (!r) {
      // one left behind by a reload may still be here
      r = m.dimension.getEntities({ type: REFL, location: spot, maxDistance: 0.5 })
        .find(e => e.getDynamicProperty(K.mirror) === m.id && e.getDynamicProperty('sm:i') === i);
      if (!r) {
        try { r = m.dimension.spawnEntity(REFL, spot); } catch (e) { console.warn(`[Skin Studio] reflection: ${e}`); continue; }
        r.setDynamicProperty(K.mirror, m.id);
        r.setDynamicProperty('sm:i', i);
      }
      m.setDynamicProperty(K.pool(i), r.id);
      pool[i] = r;
    }
    const l = r.location;
    if (Math.abs(l.x - spot.x) + Math.abs(l.y - spot.y) + Math.abs(l.z - spot.z) > 0.01 || Math.abs(yawOf(r) - yaw) > 0.5)
      r.teleport(spot, { rotation: { x: 0, y: yaw } });
  }
  return pool;
}
function applyCfg(m, c) {
  m.setDynamicProperty(K.cfg, JSON.stringify(c));
  setProp(m, 'skin_podium:frame', c.frame | 0);
  for (const r of poolOf(m)) if (r) { setProp(r, 'skin_podium:realgeo', !!c.realgeo); setProp(r, 'skin_podium:mfix', c.fix | 0); }
}

// ---------- who stands in front of which mirror
function inFront(m, p, range) {
  if (p.dimension.id !== m.dimension.id) return undefined;
  const f = fwd(yawOf(m)), l = m.location, q = p.location;
  const dx = q.x - l.x, dz = q.z - l.z;
  const w = dx * f.x + dz * f.z, u = dx * f.z - dz * f.x, dy = q.y - l.y;
  if (w < 0.15 || w > range || Math.abs(u) > range * 0.75 || dy < -2 || dy > 3) return undefined;
  return w * w + u * u;
}
function tickMirror(m, ppl) {
  const c = cfgOf(m);
  const pool = ensurePool(m);
  const near = ppl.map(p => ({ p, d: inFront(m, p, c.range) })).filter(x => x.d !== undefined).sort((a, b) => a.d - b.d).slice(0, POOL);
  for (let i = 0; i < POOL; i++) {
    const r = pool[i]; if (!r) continue;
    const who = near[i]?.p;
    const pose = who && slotOf(who), look = who && lookOf(who);
    if (pose && look) {
      setProp(r, 'skin_podium:pslot', pose.slot); setProp(r, 'skin_podium:pepoch', pose.epoch);
      setProp(r, 'skin_podium:target', look.slot); setProp(r, 'skin_podium:target_epoch', look.epoch);
      setProp(r, 'skin_podium:slim', isSlim(who));
    } else setProp(r, 'skin_podium:pslot', 0);
    setProp(r, 'skin_podium:realgeo', !!c.realgeo); setProp(r, 'skin_podium:mfix', c.fix | 0);
  }
}

// ---------- menu
const busy = new Set();
async function mirrorMenu(p, m) {
  if (busy.has(p.id)) return; busy.add(p.id);
  try {
    const c = cfgOf(m);
    const f = new ActionFormData().title('§l鏡').body('前に立つと映ります（最大4人）。');
    const acts = [];
    f.button(`枠の色: ${FRAMES[c.frame | 0]}`); acts.push('frame');
    f.button('映り方の設定'); acts.push('look');
    f.button('向きを90°回転'); acts.push('rotate');
    f.button('§c撤去する'); acts.push('remove');
    const res = await f.show(p);
    if (res.canceled || !valid(m)) return;
    const a = acts[res.selection];
    if (a === 'frame') applyCfg(m, { ...c, frame: ((c.frame | 0) + 1) % FRAMES.length });
    else if (a === 'rotate') { m.teleport(m.location, { rotation: { x: 0, y: snap(yawOf(m) + 90) } }); ensurePool(m); }
    else if (a === 'remove') { for (const r of poolOf(m)) if (r) { try { r.remove(); } catch (_) {} } m.remove(); }
    else if (a === 'look') {
      await new Promise(res => system.runTimeout(res, 1));
      const g = await new ModalFormData().title('映り方の設定')
        .slider('映る距離(ブロック)', 2, 16, { valueStep: 1, defaultValue: c.range | 0 })
        .toggle('4D・細腕などスキン本来の形で映す', { defaultValue: !!c.realgeo })
        .toggle('調整: 左右の位置を反転', { defaultValue: (c.fix & 1) !== 0 })
        .toggle('調整: 体の向きを反転', { defaultValue: (c.fix & 2) !== 0 })
        .toggle('調整: 高さを目の位置基準にする', { defaultValue: (c.fix & 4) !== 0 })
        .show(p);
      if (g.canceled || !valid(m)) return;
      const [range, realgeo, f1, f2, f4] = g.formValues;
      applyCfg(m, { ...c, range: Number(range), realgeo: !!realgeo, fix: (f1 ? 1 : 0) | (f2 ? 2 : 0) | (f4 ? 4 : 0) });
      tell(p, '設定しました。');
    }
  } catch (e) { tell(p, `§cエラー: ${e}`); } finally { busy.delete(p.id); }
}

// ---------- events
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (!valid(entity) || entity.typeId !== MIRROR) return;
    system.run(() => {
      if (!valid(entity) || entity.getDynamicProperty(K.init)) return;
      let near, bd = 100;
      for (const p of people()) {
        if (p.dimension.id !== entity.dimension.id) continue;
        const d = (p.location.x - entity.location.x) ** 2 + (p.location.z - entity.location.z) ** 2;
        if (d < bd) { bd = d; near = p; }
      }
      setupMirror(entity, near);
      applyCfg(entity, cfgOf(entity));
    });
  } catch (e) { console.warn(`[Skin Studio] mirror spawn: ${e}`); }
});
const lastUse = new Map();
world.beforeEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (!(player instanceof Player) || target?.typeId !== MIRROR) return;
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -100) < 8) return;
  lastUse.set(player.id, now);
  system.run(() => { if (valid(target)) mirrorMenu(player, target); });
});
system.afterEvents.scriptEventReceive.subscribe(e => {
  if (e.id !== 'mirror:fix') return;    // /scriptevent mirror:fix <0-7>: the nearest mirror's calibration
  const src = e.sourceEntity; if (!src) return;
  const m = src.dimension.getEntities({ type: MIRROR, location: src.location, maxDistance: 16, closest: 1 })[0];
  if (!m) return;
  applyCfg(m, { ...cfgOf(m), fix: Math.max(0, Math.min(7, parseInt(e.message, 10) || 0)) });
});

let tick = 0;
system.runInterval(() => {
  tick++;
  const ppl = people();
  for (const id of DIMS) {
    let dim; try { dim = world.getDimension(id); } catch (_) { continue; }
    let mirrors = [], refls = [];
    try { mirrors = dim.getEntities({ type: MIRROR }); } catch (_) { continue; }
    for (const m of mirrors) { try { if (!m.getDynamicProperty(K.init)) { setupMirror(m, undefined); applyCfg(m, cfgOf(m)); } tickMirror(m, ppl); } catch (e) { console.warn(`[Skin Studio] mirror: ${e}`); } }
    if (tick % 4) continue;
    // reflections whose mirror is gone (or that a mirror no longer lists)
    try { refls = dim.getEntities({ type: REFL }); } catch (_) { continue; }
    for (const r of refls) {
      try {
        const mid = r.getDynamicProperty(K.mirror);
        const m = typeof mid === 'string' ? world.getEntity(mid) : undefined;
        if (valid(m)) { if (m.getDynamicProperty(K.pool(r.getDynamicProperty('sm:i'))) !== r.id) r.remove(); continue; }
        if (!dim.getEntities({ type: MIRROR, location: r.location, maxDistance: 2 }).length) r.remove();
      } catch (_) {}
    }
  }
}, 10);
