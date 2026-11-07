// Skin Studio — mirror (v3: a real mirrored world behind the glass).
// The mirror is set into a wall. Behind the wall the space in front of it is
// copied block for block, flipped across the wall's centre plane (structure
// mirror), and every person in front gets a reflection entity standing at
// their mirror image in that room — real geometry, so walls hide what the
// glass would not show, every viewer sees it right, and shaders apply.
//   reflection position V = P - 2((P - plane)·n) n,  yaw ψ = 2e + 180 - yaw
//   (e = the mirror's yaw; the reflection wears a chirally mirrored skeleton)
import { world, system, Player, StructureMirrorAxis, StructureSaveMode, EquipmentSlot } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { getPlayerSkin, SimulatedPlayer } from '@minecraft/server-gametest';

const MIRROR = 'skin_podium:mirror';
const REFL = 'skin_podium:reflection';
const DIMS = ['overworld', 'nether', 'the_end'];
const POOL = 6;                 // reflections per mirror
const DEPTH = 8;                // blocks reflected in front of the wall (and built behind it)
const SIDE = 6;                 // blocks to each side
const LOW = -1, HIGH = 5;       // heights reflected, from the floor
const FRAMES = ['金', '銀', '木', '黒'];
const K = { init: 'sm:init', cfg: 'sm:cfg', pool: i => `sm:r${i}`, mirror: 'sm:mirror', yaw: 'sm:yaw' };
const SLOTS = [['Head', 'slot.armor.head'], ['Chest', 'slot.armor.chest'], ['Legs', 'slot.armor.legs'], ['Feet', 'slot.armor.feet'],
               ['Mainhand', 'slot.weapon.mainhand'], ['Offhand', 'slot.weapon.offhand']];

const tell = (p, msg) => { try { p.sendMessage(`§b[鏡]§r ${msg}`); } catch (_) {} };
const valid = e => { try { return !!e && e.isValid; } catch (_) { return false; } };
const isMannequin = p => { try { return p instanceof SimulatedPlayer || p.name.startsWith('Mannequin_'); } catch (_) { return false; } };
const people = () => world.getAllPlayers().filter(p => !isMannequin(p));
const yawOf = e => { try { return e.getRotation().y; } catch (_) { return 0; } };
const snap = y => Math.round(y / 90) * 90;
const dirOf = yaw => { const r = yaw * Math.PI / 180; return { x: Math.round(-Math.sin(r)), z: Math.round(Math.cos(r)) }; };
function getJ(e, k, d) { try { const v = e.getDynamicProperty(k); return typeof v === 'string' ? JSON.parse(v) : d; } catch (_) { return d; } }
function cfgOf(m) { return { frame: 0, ...getJ(m, K.cfg, {}) }; }
function setProp(e, k, v) { try { if (e.getProperty(k) !== v) e.setProperty(k, v); } catch (_) {} }
function slotOf(p) {
  try {
    const slot = p.getProperty('mimic:slot'), epoch = p.getProperty('mimic:epoch');
    return Number.isInteger(slot) && Number.isInteger(epoch) && slot > 0 && epoch > 0 ? { slot, epoch } : undefined;
  } catch (_) { return undefined; }
}
function lookOf(p) {   // a Skin Changer disguise shows in the mirror too
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

// ---------- geometry of one mirror (all from its saved setup)
// g = { dim, wall:{x,y,z} (the wall block at the bottom centre of the opening), f:{x,z} (into the room), yaw }
function geo(m) { return getJ(m, 'sm:geo', undefined); }
function boxes(g) {
  const { wall: w, f } = g, r = { x: -f.z, z: f.x };
  const pt = (d, s, h) => ({ x: w.x + f.x * d + r.x * s, y: w.y + h, z: w.z + f.z * d + r.z * s });
  const box = (d0, d1, s0, s1, h0, h1) => {
    const a = pt(d0, s0, h0), b = pt(d1, s1, h1);
    return { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) } };
  };
  return {
    front: box(1, DEPTH, -SIDE, SIDE, LOW, HIGH),
    behind: box(-1, -DEPTH, -SIDE, SIDE, LOW, HIGH),
    opening: box(0, 0, -1, 1, 0, 2),
  };
}
const inBox = (b, l) => l.x >= b.min.x && l.x < b.max.x + 1 && l.y >= b.min.y && l.y < b.max.y + 1 && l.z >= b.min.z && l.z < b.max.z + 1;
const sid = (m, kind) => `skin_studio:m${kind}_${m.id.replace(/[^0-9a-z]/gi, '').slice(-12)}`;
function solid(dim, l) { try { const b = dim.getBlock(l); return !!b && !b.isAir && !b.isLiquid; } catch (_) { return false; } }

// ---------- setup: find the wall, cut the opening, build the mirrored room
function setupMirror(m, placer) {
  if (m.getDynamicProperty(K.init)) return true;
  const dim = m.dimension, l = m.location;
  const base = { x: Math.floor(l.x), y: Math.floor(l.y + 0.01), z: Math.floor(l.z) };
  // facing: preset (the showcase), else toward the placer, else any side with a wall behind
  const pre = m.getDynamicProperty(K.yaw);
  const cand = typeof pre === 'number' ? [snap(pre)] : (placer ? [snap(yawOf(placer) + 180)] : []).concat([0, 90, 180, -90]);
  let yaw, f;
  for (const y of cand) {
    const d = dirOf(y), w = { x: base.x - d.x, y: base.y, z: base.z - d.z }, r = { x: -d.z, z: d.x };
    let ok = true;
    for (let s = -1; s <= 1 && ok; s++) for (let h = 0; h <= 2 && ok; h++) ok = solid(dim, { x: w.x + r.x * s, y: w.y + h, z: w.z + r.z * s });
    if (ok) { yaw = y; f = d; break; }
  }
  if (yaw === undefined) {
    if (placer) tell(placer, '§c鏡は壁(横3×高さ3ブロック)に向けて置いてください。');
    try { m.remove(); } catch (_) {}
    return false;
  }
  const wall = { x: base.x - f.x, y: base.y, z: base.z - f.z };
  const g = { dim: dim.id, wall, f, yaw };
  m.setDynamicProperty('sm:geo', JSON.stringify(g));
  m.setDynamicProperty(K.init, true);
  const b = boxes(g);
  try {
    for (const k of ['back', 'open']) try { world.structureManager.delete(sid(m, k)); } catch (_) {}
    world.structureManager.createFromWorld(sid(m, 'back'), dim, b.behind.min, b.behind.max, { includeEntities: false, includeBlocks: true, saveMode: StructureSaveMode.World });
    world.structureManager.createFromWorld(sid(m, 'open'), dim, b.opening.min, b.opening.max, { includeEntities: false, includeBlocks: true, saveMode: StructureSaveMode.World });
  } catch (e) { console.warn(`[Skin Studio] mirror backup: ${e}`); }
  // the opening: barriers (invisible, keep people out of the mirror world)
  for (let s = -1; s <= 1; s++) for (let h = 0; h <= 2; h++) {
    const r = { x: -f.z, z: f.x };
    try { dim.getBlock({ x: wall.x + r.x * s, y: wall.y + h, z: wall.z + r.z * s })?.setType('minecraft:barrier'); } catch (_) {}
  }
  // the glass sits on the wall's front face
  m.teleport({ x: wall.x + 0.5 + f.x * 0.5, y: wall.y, z: wall.z + 0.5 + f.z * 0.5 }, { rotation: { x: 0, y: yaw } });
  reflectBlocks(m);
  if (placer) tell(placer, '鏡を置きました。壁の向こうに鏡の世界ができます。鏡を§b使用§rすると設定できます。');
  return true;
}
function reflectBlocks(m) {
  const g = geo(m); if (!g) return;
  let dim; try { dim = world.getDimension(g.dim); } catch (_) { return; }
  const b = boxes(g), id = sid(m, 'snap');
  try {
    try { world.structureManager.delete(id); } catch (_) {}
    world.structureManager.createFromWorld(id, dim, b.front.min, b.front.max, { includeEntities: false, includeBlocks: true, saveMode: StructureSaveMode.Memory });
    world.structureManager.place(id, dim, b.behind.min, { mirror: g.f.x === 0 ? StructureMirrorAxis.X : StructureMirrorAxis.Z   /* (verified on BDS: X flips z) */, includeEntities: false });
    world.structureManager.delete(id);
    m.setDynamicProperty('sm:copied', system.currentTick);
  } catch (e) { console.warn(`[Skin Studio] mirror copy: ${e}`); }
}
function removeMirror(m) {
  const g = geo(m);
  for (const r of poolOf(m)) if (r) { try { r.remove(); } catch (_) {} }
  if (g) {
    let dim; try { dim = world.getDimension(g.dim); } catch (_) {}
    const b = boxes(g);
    if (dim) {
      try { world.structureManager.place(sid(m, 'back'), dim, b.behind.min); } catch (e) { console.warn(`[Skin Studio] restore: ${e}`); }
      try { world.structureManager.place(sid(m, 'open'), dim, b.opening.min); } catch (e) { console.warn(`[Skin Studio] restore: ${e}`); }
    }
    for (const k of ['back', 'open']) try { world.structureManager.delete(sid(m, k)); } catch (_) {}
  }
  try { m.remove(); } catch (_) {}
}

// ---------- reflections
function poolOf(m) {
  const out = [];
  for (let i = 0; i < POOL; i++) {
    const id = m.getDynamicProperty(K.pool(i));
    const r = typeof id === 'string' ? world.getEntity(id) : undefined;
    out.push(valid(r) ? r : undefined);
  }
  return out;
}
function parking(g) {   // an idle reflection waits inside the solid wall beside the opening, hidden
  const r = { x: -g.f.z, z: g.f.x };
  return { x: g.wall.x + 0.5 + r.x * 2, y: g.wall.y + 0.05, z: g.wall.z + 0.5 + r.z * 2 };
}
function ensurePool(m, g) {
  const pool = poolOf(m);
  for (let i = 0; i < POOL; i++) {
    if (pool[i]) continue;
    const park = parking(g);
    let r = m.dimension.getEntities({ type: REFL, location: park, maxDistance: DEPTH * 2 })
      .find(e => e.getDynamicProperty(K.mirror) === m.id && e.getDynamicProperty('sm:i') === i);
    if (!r) {
      try { r = m.dimension.spawnEntity(REFL, park); } catch (e) { continue; }
      r.setDynamicProperty(K.mirror, m.id);
      r.setDynamicProperty('sm:i', i);
    }
    m.setDynamicProperty(K.pool(i), r.id);
    pool[i] = r;
  }
  return pool;
}
function mirrorOf(g, p) {   // the mirror image of a player's place and facing
  const n = g.f, c = { x: g.wall.x + 0.5, z: g.wall.z + 0.5 };   // the plane through the wall's centre
  const q = p.location, dw = (q.x - c.x) * n.x + (q.z - c.z) * n.z;
  const rot = p.getRotation();
  return { loc: { x: q.x - 2 * dw * n.x, y: q.y, z: q.z - 2 * dw * n.z }, rot: { x: rot.x, y: 2 * g.yaw + 180 - rot.y }, dw };
}
function copyGear(p, r) {
  const eq = p.getComponent('equippable');
  const seen = getJ(r, 'sm:gear', {});
  let changed = false;
  for (const [slot, cmdSlot] of SLOTS) {
    let id = 'air';
    try { id = eq?.getEquipment(EquipmentSlot[slot])?.typeId ?? 'air'; } catch (_) {}
    if (seen[slot] === id) continue;
    seen[slot] = id; changed = true;
    try { r.runCommand(`replaceitem entity @s ${cmdSlot} 0 ${id === 'air' ? 'air' : id}`); } catch (_) {}
  }
  if (changed) r.setDynamicProperty('sm:gear', JSON.stringify(seen));
}
function tickMirror(m, ppl, t) {
  const g = geo(m); if (!g) return;
  const pool = ensurePool(m, g), b = boxes(g);
  const near = ppl.filter(p => p.dimension.id === g.dim && inBox(b.front, p.location))
    .map(p => ({ p, d: mirrorOf(g, p).dw })).sort((x, y) => x.d - y.d).slice(0, POOL);
  for (let i = 0; i < POOL; i++) {
    const r = pool[i]; if (!r) continue;
    const who = near[i]?.p;
    const pose = who && slotOf(who), look = who && lookOf(who);
    if (pose && look) {
      const v = mirrorOf(g, who);
      try { r.teleport(v.loc, { rotation: v.rot }); } catch (_) {}
      setProp(r, 'skin_podium:pslot', pose.slot); setProp(r, 'skin_podium:pepoch', pose.epoch);
      setProp(r, 'skin_podium:target', look.slot); setProp(r, 'skin_podium:target_epoch', look.epoch);
      setProp(r, 'skin_podium:slim', isSlim(who));
      if (t % 10 === i) copyGear(who, r);
    } else if (r.getProperty('skin_podium:pslot') !== 0) {
      setProp(r, 'skin_podium:pslot', 0);
      try { r.teleport(parking(g)); } catch (_) {}
    }
  }
}

// ---------- menu
const busy = new Set();
async function mirrorMenu(p, m) {
  if (busy.has(p.id)) return; busy.add(p.id);
  try {
    const c = cfgOf(m);
    const f = new ActionFormData().title('§l鏡').body('前に立つと、壁の向こうの鏡の世界に映ります（最大6人）。ブロックの変化は自動で映ります。');
    const acts = [];
    f.button(`枠の色: ${FRAMES[c.frame | 0]}`); acts.push('frame');
    f.button('鏡の世界を今すぐ更新'); acts.push('refresh');
    f.button('§c撤去する（壁を元に戻す）'); acts.push('remove');
    const res = await f.show(p);
    if (res.canceled || !valid(m)) return;
    const a = acts[res.selection];
    if (a === 'frame') applyFrame(m, ((c.frame | 0) + 1) % FRAMES.length);
    else if (a === 'refresh') { reflectBlocks(m); tell(p, '更新しました。'); }
    else if (a === 'remove') removeMirror(m);
  } catch (e) { tell(p, `§cエラー: ${e}`); } finally { busy.delete(p.id); }
}
function applyFrame(m, n) {
  m.setDynamicProperty(K.cfg, JSON.stringify({ ...cfgOf(m), frame: n }));
  setProp(m, 'skin_podium:frame', n);
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
      if (setupMirror(entity, near)) applyFrame(entity, cfgOf(entity).frame);
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
// blocks changed in front of a mirror: copy again soon
const dirty = new Set();
function touched(dim, l) {
  for (const m of dim.getEntities({ type: MIRROR, location: l, maxDistance: DEPTH + SIDE + 4 })) {
    const g = geo(m); if (g && inBox(boxes(g).front, l)) dirty.add(m.id);
  }
}
world.afterEvents.playerPlaceBlock.subscribe(e => { try { touched(e.block.dimension, e.block.location); } catch (_) {} });
world.afterEvents.playerBreakBlock.subscribe(e => { try { touched(e.block.dimension, e.block.location); } catch (_) {} });
world.afterEvents.blockExplode.subscribe(e => { try { touched(e.dimension, e.block.location); } catch (_) {} });
system.afterEvents.scriptEventReceive.subscribe(e => {
  // /scriptevent mirror:frame <0-3>   /scriptevent mirror:refresh   /scriptevent mirror:remove
  if (e.id !== 'mirror:frame' && e.id !== 'mirror:refresh' && e.id !== 'mirror:remove') return;
  const src = e.sourceEntity; if (!src) return;
  const m = src.dimension.getEntities({ type: MIRROR, location: src.location, maxDistance: 24, closest: 1 })[0];
  if (!m) return;
  if (e.id === 'mirror:frame') applyFrame(m, Math.max(0, Math.min(3, parseInt(e.message, 10) || 0)));
  else if (e.id === 'mirror:remove') removeMirror(m);
  else reflectBlocks(m);
});

let t = 0;
const firstSeen = new Map();
const cache = new Map();
system.runInterval(() => {
  t++;
  const ppl = people();
  for (const id of DIMS) {
    let dim;
    try { dim = world.getDimension(id); } catch (_) { continue; }
    // the mirror list is looked up once a second; reflections still move every tick
    if (t % 20 === 1 || !cache.has(id)) { try { cache.set(id, dim.getEntities({ type: MIRROR })); } catch (_) { cache.set(id, []); } }
    const mirrors = cache.get(id).filter(valid);
    for (const m of mirrors) {
      try {
        if (!m.getDynamicProperty(K.init)) {
          const seen = firstSeen.get(m.id) ?? t; firstSeen.set(m.id, seen);
          if (t - seen > 40 && setupMirror(m, undefined)) applyFrame(m, cfgOf(m).frame);
          continue;
        }
        tickMirror(m, ppl, t);
        const since = t % 200 === 0;
        if (dirty.has(m.id) && t % 10 === 0) { dirty.delete(m.id); reflectBlocks(m); }
        else if (since) reflectBlocks(m);       // pistons, water, redstone… every 10 s
      } catch (e) { console.warn(`[Skin Studio] mirror: ${e}`); }
    }
    if (t % 40) continue;
    // reflections whose mirror is gone
    try {
      for (const r of dim.getEntities({ type: REFL })) {
        const mid = r.getDynamicProperty(K.mirror);
        const m = typeof mid === 'string' ? world.getEntity(mid) : undefined;
        if (valid(m)) { if (m.getDynamicProperty(K.pool(r.getDynamicProperty('sm:i'))) !== r.id) r.remove(); continue; }
        if (!dim.getEntities({ type: MIRROR, location: r.location, maxDistance: DEPTH * 2 + SIDE }).length) r.remove();
      }
    } catch (_) {}
  }
}, 1);
