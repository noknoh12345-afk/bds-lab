// Placing towers like the original's tower bar: loadout slots 1-5 are hotbar items. Holding one shows, where you look,
// a ghost of the tower, its range ring (cyan when it can stand there, red when not) and its footprint, and the bar text
// tells the cost, the placement count and why it cannot go there. Using the slot item there places the tower.
// Placed towers show their range ring when looked at with the wand or when their menu is open.
import { world, system, Player, ItemStack, Entity, Vector3 } from '@minecraft/server';
import { towers, maps, placeCost, stats } from './defs';
import * as G from './game';
import { prof } from './lobby';

const SLOT = /^tds:slot_([1-5])$/;
const ghosts = new Map<string, Entity>();
let partOk = true;   // the pack's own particles; vanilla ones when the pack has none
const P = { ok: ['tds:ring_ok', 'minecraft:villager_happy'], bad: ['tds:ring_bad', 'minecraft:redstone_wire_dust_particle'], sel: ['tds:ring_sel', 'minecraft:basic_crit_particle'] } as const;
const dim = () => world.getDimension('overworld');
function dot(kind: keyof typeof P, x: number, y: number, z: number) {
  try { dim().spawnParticle(partOk ? P[kind][0] : P[kind][1], { x, y, z }); }
  catch { if (partOk) { partOk = false; try { dim().spawnParticle(P[kind][1], { x, y, z }); } catch { /* unloaded */ } } }
}
/** a ring of dots: r in blocks around a block-centre point */
export function ring(kind: keyof typeof P, cx: number, y: number, cz: number, r: number, n = 0) {
  const k = n || Math.max(12, Math.min(72, Math.round(r * 5)));
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; dot(kind, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); }
}

export const loadoutOf = (p: Player) => G.M?.loadouts?.[p.name] ?? prof(p).loadout;
const slotIndex = (it?: ItemStack) => { const m = it?.typeId.match(SLOT); return m ? +m[1] - 1 : -1; };

/** hotbar 1-5 = the loadout (named after its tower and cost); the wand moves to the last slot */
export function giveSlots(p: Player) {
  const inv = p.getComponent('inventory')?.container; if (!inv) return;
  const lo = loadoutOf(p);
  for (let i = 0; i < 9; i++) { const t = inv.getItem(i)?.typeId; if (t && SLOT.test(t)) inv.setItem(i, undefined); }
  for (let i = 0; i < 5; i++) {
    const name = lo[i]; if (!name) continue;
    try {
      const it = new ItemStack(`tds:slot_${i + 1}`);
      it.nameTag = `§e${name} §7$${G.infl(placeCost(name))}`;
      const old = inv.getItem(i); if (old && old.typeId !== it.typeId) inv.addItem(old);
      inv.setItem(i, it);
    } catch { return; }   // a pack without the slot items: the wand's menu still places
  }
  for (let i = 0; i < 8; i++) if (inv.getItem(i)?.typeId === 'tds:wand') { const w = inv.getItem(i)!; inv.setItem(i, undefined); const last = inv.getItem(8); if (last) inv.addItem(last); inv.setItem(8, w); break; }
}
G.onStart.push((m, players) => { system.run(() => { for (const p of players) if (p.isValid && m.players.includes(p.name)) giveSlots(p); }); });

type Spot = { x: number; y: number; z: number };
const lookSpot = (p: Player): Spot | undefined => { const b = p.getBlockFromViewDirection({ maxDistance: 40 })?.block; return b ? { x: b.x, y: b.y + 1, z: b.z } : undefined; };

/** why a player could not place a tower there now (the same rules as placing); undefined = it can */
export function whyNot(p: Player, name: string, s: Spot): string | undefined {
  const M = G.M; if (!M || !G.path) return 'no match';
  if ((name === 'Farm' && G.mod('Farm Banned')) || (name === 'Gatling Gun' && G.mod('Gatling Gun Banned'))) return `${name} is banned`;
  const cost = G.infl(placeCost(name)); if (!Number.isFinite(cost)) return 'cannot be placed';
  const lim = G.limitFor(p.name, name), n = M.towers.filter((t) => t.name === name && t.owner === p.name && t.temp === undefined).length;
  if (lim && n >= lim) return `limit ${lim}`;
  const why = G.canStand(name, s.x, s.y, s.z); if (why) return why;
  if ((M.cash[p.name] ?? 0) < cost) return `need $${cost}`;
}

function hideGhost(p: Player) { const g = ghosts.get(p.name); if (g?.isValid) { try { g.remove(); } catch { /* gone */ } } ghosts.delete(p.name); }
function showGhost(p: Player, name: string, s: Spot, ok: boolean) {
  let g = ghosts.get(p.name);
  const at: Vector3 = { x: s.x + 0.5, y: s.y, z: s.z + 0.5 };
  if (!g?.isValid) { try { g = dim().spawnEntity('tds:ghost' as any, at); ghosts.set(p.name, g); } catch { return; } }
  const lk = G.towerLook(name);
  try { g.teleport(at); g.setProperty('tds:skin', lk[0]); g.setProperty('tds:size', lk[1]); g.setProperty('tds:ok', ok); } catch { /* older pack */ }
}

/** the preview: every other tick for each player holding a slot */
system.runInterval(() => {
  const M = G.M, path = G.path;
  for (const p of world.getAllPlayers()) {
    const inv = p.getComponent('inventory')?.container, it = inv?.getItem(p.selectedSlotIndex), i = slotIndex(it);
    if (!M || !path || M.over || !M.players.includes(p.name)) { hideGhost(p); continue; }
    if (i < 0) {
      hideGhost(p);
      if (it?.typeId === 'tds:wand') {   // looking at a placed tower with the wand shows its range
        const e = p.getEntitiesFromViewDirection({ maxDistance: 24 }).find((x) => x.entity.typeId === 'tds:tower')?.entity;
        const tw = e && G.towerById(e.getDynamicProperty('tds:id') as number);
        if (tw && system.currentTick % 4 === 0) showRange(tw);
      }
      continue;
    }
    const name = loadoutOf(p)[i]; if (!name) { hideGhost(p); p.onScreenDisplay.setActionBar(`§7Slot ${i + 1} is empty`); continue; }
    const s = lookSpot(p); if (!s) { hideGhost(p); continue; }
    const why = whyNot(p, name, s), ok = !why;
    showGhost(p, name, s, ok);
    const st = stats(name, 0), r = st.range * path.stud * (1 + G.skv(p.name, 'Enhanced Optics') / 100) * (G.mod('Fog') ? 0.65 : 1), fp = (G.foot(name) / 2) * path.stud;
    ring(ok ? 'ok' : 'bad', s.x + 0.5, s.y + 0.08, s.z + 0.5, r);
    ring(ok ? 'ok' : 'bad', s.x + 0.5, s.y + 0.05, s.z + 0.5, Math.max(0.3, fp), 10);
    const lim = G.limitFor(p.name, name), n = M.towers.filter((t) => t.name === name && t.owner === p.name && t.temp === undefined).length;
    p.onScreenDisplay.setActionBar(`${ok ? '§a' : '§c'}${name} §e$${G.infl(placeCost(name))}§7 · ${lim ? `${n}/${lim}` : `${n}`} · ${towers[name].placement}${why ? ` §c${why}` : ' §aclick to place'}`);
  }
}, 2);

/** a placed tower's range, for a moment (yellow ring) */
export function showRange(tw: G.Tower) {
  const path = G.path; if (!path) return;
  const r = G.eff(tw).range * path.stud, o = G.origin(tw);
  ring('sel', o.x, tw.y + 0.08, o.z, r);
}
export function flashRange(tw: G.Tower, ticks = 60) { let n = 0; const h = system.runInterval(() => { if (!G.towerById(tw.id) || (n += 4) > ticks) { system.clearRun(h); return; } showRange(tw); }, 4); }

function placeFrom(p: Player, i: number, s?: Spot) {
  const name = loadoutOf(p)[i]; if (!name) { p.sendMessage(`§7Slot ${i + 1} is empty`); return; }
  if (!s) { p.sendMessage('Look at the ground or a cliff'); return; }
  const r = G.place(p, name, s.x, s.y, s.z);
  if (r.ok) { p.sendMessage(`§aPlaced #${r.tower.id} ${name} §7($${G.M!.cash[p.name]})`); flashRange(r.tower, 40); }
  else { G.log('place_fail', { name, why: r.why }); p.sendMessage(`§cCannot place: ${r.why}`); }
}
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const i = slotIndex(ev.itemStack); if (i < 0) return;
  ev.cancel = true; if (!ev.isFirstEvent) return;
  const p = ev.player, { x, y, z } = ev.block;
  system.run(() => { if (G.M?.players.includes(p.name)) placeFrom(p, i, { x, y: y + 1, z }); });
});
world.afterEvents.itemUse.subscribe(({ source: p, itemStack }) => {
  const i = slotIndex(itemStack); if (i < 0 || !G.M?.players.includes(p.name)) return;
  if (p.getBlockFromViewDirection({ maxDistance: 6 })) return;   // close blocks are handled by the block event
  placeFrom(p, i, lookSpot(p));
});
world.afterEvents.playerLeave.subscribe(({ playerName }) => { const g = ghosts.get(playerName); if (g?.isValid) { try { g.remove(); } catch { /* gone */ } } ghosts.delete(playerName); });
