// Drives the GeoUI match HUD (tools/hud.mjs builds it): player properties tdsui:* — the screen shape (aspect, centre fix,
// scale) like GeoUI's own script, and the match values each HUD element reads, small ones packed (an entity has at most 32
// properties: tools/hud.mjs unpacks them in Molang). A property is set only when it changes. In a match the vanilla hotbar is
// hidden: the HUD's tower bar (each slot the tower's picture, its key, its price) takes its place; keys 1-5 and the wheel still
// choose the slot, and on a phone the wand is held (a tap on the ground opens the tower menu with the same pictures).
import { world, system, Player, PlatformType, HudElement, HudVisibility } from '@minecraft/server';
import { placeCost, towers, expFor, levelCost, maxLevel } from './defs';
import { cmd } from './kit';
import * as G from './game';
import { prof, lastReward } from './lobby';

const NS = 'tdsui';
/** a tower's cell in rp/textures/tdsui/towers.png: its place in data/towers.json (tools/art/portraits.py); 99 = none */
const TIDX = new Map(Object.keys(towers).map((n, i) => [n, i] as [string, number]));
const tidx = (n?: string) => (n !== undefined && TIDX.has(n) ? TIDX.get(n)! : 99);
const MODES = ['Easy', 'Casual', 'Intermediate', 'Molten', 'Fallen', 'Hardcore', 'Frost', 'Voidcore', 'Sandbox'];
// GeoUI Studio's screen numbers (bds/geoui: aspect ×1000 by platform; the centre fix ×10000 of the screen height)
const ASPECT: Record<string, number> = { Desktop: 1778, Mobile: 2000, Console: 1778 };
const FIX: Record<string, [number, number]> = { Desktop: [-6, -278], Mobile: [-17, -526], Console: [-6, -278] };

type Pref = { aspect?: number; scale?: number; off?: boolean };
const prefOf = (p: Player): Pref => { try { return JSON.parse((p.getDynamicProperty('tds:hud') as string) ?? '{}') as Pref; } catch { return {}; } };
const savePref = (p: Player, s: Pref) => p.setDynamicProperty('tds:hud', JSON.stringify(s));
const last = new Map<string, Record<string, number>>();
function prop(p: Player, k: string, v: number) {
  const m = last.get(p.id) ?? {}; last.set(p.id, m);
  const n = Math.round(v); if (m[k] === n) return;
  try { p.setProperty(`${NS}:${k}`, n); m[k] = n; } catch { /* a pack without the HUD's player definition */ }
}
const platform = (p: Player) => { try { const t = p.clientSystemInfo.platformType; return t === PlatformType.Mobile ? 'Mobile' : t === PlatformType.Console ? 'Console' : 'Desktop'; } catch { return 'Desktop'; } };

/** the screen shape: once on join and after every change of the settings */
function shape(p: Player) {
  const s = prefOf(p), pf = platform(p);
  prop(p, 'aspect', s.aspect ?? ASPECT[pf]); prop(p, 'scale', s.scale ?? 100); prop(p, 'cx', FIX[pf][0]); prop(p, 'cy', FIX[pf][1]); prop(p, 'ox', 0); prop(p, 'oy', 0);
}
world.afterEvents.playerSpawn.subscribe(({ player }) => { last.delete(player.id); system.runTimeout(() => { if (player.isValid) shape(player); }, 20); });
world.afterEvents.playerLeave.subscribe(({ playerId }) => last.delete(playerId));

// (its enum is named tds:hudset: /tds:xpboost already registers tds:set, and a second registerEnum of one name throws at startup)
cmd('tds:hud', 'Match HUD: on, off, scale <percent>, aspect <width> <height>, reset', { hudset: ['on', 'off', 'scale', 'aspect', 'reset'], 'a?': 'int', 'b?': 'int' }, (p, a) => {
  const s = prefOf(p);
  if (a.hudset === 'on') s.off = false;
  else if (a.hudset === 'off') s.off = true;
  else if (a.hudset === 'scale') { if (!a.a || a.a < 10 || a.a > 400) return 'Scale 10-400 (%)'; s.scale = a.a; }
  else if (a.hudset === 'aspect') { if (!a.a || !a.b) return 'Aspect: width height (e.g. 2340 1080)'; s.aspect = Math.round(Math.min(5000, Math.max(600, (a.a / a.b) * 1000))); }
  else { delete s.aspect; delete s.scale; s.off = false; }
  savePref(p, s); shape(p);
  return `HUD ${s.off ? 'off' : 'on'} · scale ${s.scale ?? 100}% · aspect ${((s.aspect ?? ASPECT[platform(p)]) / 1000).toFixed(3)}`;
});

// the tower a player is looking at (wand) or opened the menu of (for 8 s)
const chosen = new Map<string, { id: number; until: number }>();
export function selectTower(p: Player, id: number) { chosen.set(p.name, { id, until: system.currentTick + 160 }); }
function selectedTower(p: Player): G.Tower | undefined {
  const c = chosen.get(p.name); if (c && system.currentTick < c.until) { const t = G.towerById(c.id); if (t) return t; }
  const held = p.getComponent('inventory')?.container?.getItem(p.selectedSlotIndex)?.typeId;
  if (held !== 'tds:wand') return;
  const e = p.getEntitiesFromViewDirection({ maxDistance: 24 }).find((x) => x.entity.typeId === 'tds:tower')?.entity;
  return e ? G.towerById(e.getDynamicProperty('tds:id') as number) : undefined;
}

// banners: the wave that just started (1), the result (2 triumph / 3 defeat), the Hidden Wave (4); age in half-seconds of ticks
let seenWave = -1, seenHidden = false, banner = 0, bannerAt = 0, seenMatch: G.Match | undefined;
function bannerNow() {
  const M = G.M, t = system.currentTick;
  if (M !== seenMatch) { seenMatch = M; seenWave = M?.wave ?? -1; seenHidden = false; banner = 0; }
  if (!M) return;
  if (M.over) { const b = M.over === 'win' ? 2 : 3; if (banner !== b) { banner = b; bannerAt = t; } return; }
  if (M.hidden?.on && !seenHidden) { seenHidden = true; banner = 4; bannerAt = t; }
  if (M.wave !== seenWave) { seenWave = M.wave; if (M.wave > 0) { banner = M.hidden?.on && banner === 4 && t - bannerAt < 60 ? 4 : 1; bannerAt = t; } }
  if ((banner === 1 || banner === 4) && t - bannerAt > 100) banner = 0;
}

/** whether a player sees the GeoUI HUD now (in a match, not turned off) */
export const hudOn = (p: Player) => !!G.M && G.M.players.includes(p.name) && !prefOf(p).off;
// the vanilla bars the original does not have are hidden while the HUD is on, the hotbar too: the HUD's tower bar takes its place
// (keys 1-5 and the wheel still choose the slot)
const HIDE = ['Health', 'Hunger', 'ProgressBar', 'Armor', 'AirBubbles', 'HorseHealth', 'Hotbar', 'ItemText'].map((n) => (HudElement as unknown as Record<string, HudElement>)[n]).filter((x) => x !== undefined);
const hidden = new Set<string>();
function vanilla(p: Player, hide: boolean) {
  if (hide === hidden.has(p.id)) return;
  try { p.onScreenDisplay.setHudVisibility(hide ? HudVisibility.Hide : HudVisibility.Reset, HIDE); if (hide) hidden.add(p.id); else hidden.delete(p.id); } catch { /* older game */ }
  // a phone has no keys for the hidden hotbar: the wand in hand, so a tap on the ground opens the tower menu. For 2 s from
  // then on (wandUntil): the match's items arrive after the bars are hidden, and the first slot was in hand (seen on redroid)
  if (hide && platform(p) === 'Mobile') wandUntil.set(p.id, system.currentTick + 40);
}
const wandUntil = new Map<string, number>();
function holdWand(p: Player) {
  const u = wandUntil.get(p.id); if (u === undefined) return;
  if (system.currentTick > u) { wandUntil.delete(p.id); return; }
  try { const inv = p.getComponent('inventory')?.container; for (let i = 0; i < 9; i++) if (inv?.getItem(i)?.typeId === 'tds:wand') { if (p.selectedSlotIndex !== i) p.selectedSlotIndex = i; break; } } catch { /* left */ }
}
world.afterEvents.playerLeave.subscribe(({ playerId }) => { hidden.delete(playerId); wandUntil.delete(playerId); });

system.runInterval(() => {
  bannerNow();
  const M = G.M, t = system.currentTick;
  G.indicators.watched.clear();   // damage indicators: refilled below with the towers selected now
  for (const p of world.getAllPlayers()) {
    const on = hudOn(p);
    vanilla(p, on);
    if (on) holdWand(p);
    if (!on || !M) {   // the lobby: level, EXP, coins, gems (mode 15)
      const off = prefOf(p).off; prop(p, 'alpha', off ? 0 : 100); if (off) continue;
      const pr = prof(p); prop(p, 'mode', 15); prop(p, 'wt', Math.min(999, pr.level) * 100); prop(p, 'hp', Math.min(99999, Math.floor(pr.exp))); prop(p, 'hpmax', Math.min(99999, Math.max(1, Math.ceil(expFor(pr.level + 1)))));
      prop(p, 'cash', Math.min(999999, pr.coins)); prop(p, 'rgems', Math.min(99999, pr.gems)); prop(p, 'tinfo', 0); prop(p, 'bn', 0);
      continue;
    }
    prop(p, 'alpha', 100);
    prop(p, 'wt', Math.min(999, M.wave) * 100 + Math.min(99, G.lastWave()));
    prop(p, 'timer', M.waveEnd === Infinity ? 0 : Math.min(999, Math.max(0, Math.ceil(M.waveEnd - M.t))));
    prop(p, 'hp', Math.min(99999, Math.max(0, M.baseHP))); prop(p, 'hpmax', Math.min(99999, Math.max(1, M.maxHP)));
    prop(p, 'cash', Math.min(999999, Math.max(0, Math.floor(M.cash[p.name] ?? 0))));
    const boss = M.enemies.filter((e) => e.boss).sort((a, b) => b.max - a.max)[0];
    prop(p, 'eb', Math.min(999, M.enemies.length) * 1000 + (boss ? Math.max(1, Math.min(100, Math.ceil((boss.hp / boss.max) * 100))) : 0));
    prop(p, 'mode', Math.max(0, MODES.indexOf(M.mode)));
    // the tower bar: each slot's tower (its picture's cell, 99 = empty) and price, the held slot
    const lo = M.loadouts?.[p.name] ?? prof(p).loadout, ti = [0, 1, 2, 3, 4].map((i) => tidx(lo[i]));
    for (let i = 0; i < 5; i++) { const n = lo[i]; prop(p, `c${i + 1}`, n ? Math.min(99999, G.infl(placeCost(n)) || 0) : 0); }
    const held = p.getComponent('inventory')?.container?.getItem(p.selectedSlotIndex)?.typeId.match(/^tds:slot_([1-5])$/);
    const skip = !M.over && !M.inter && M.wave > 0 && Number.isFinite(M.skipAt) && M.t >= M.skipAt;
    // misc = held slot + 8 × votes + 80 × votes needed + 800 × the skip vote open
    prop(p, 'misc', (held ? +held[1] : 0) + 8 * Math.min(9, M.votes.length) + 80 * Math.min(9, Math.max(1, M.players.length - 1)) + (skip ? 800 : 0));
    prop(p, 'bn', banner * 1000 + Math.min(999, Math.floor((t - bannerAt) / 2)));
    // the result's rewards under the banner
    const rw = M.over ? lastReward.get(p.name) : undefined;
    prop(p, 'rew', rw ? Math.min(9999, rw.coins) * 1000 + Math.min(999, rw.exp) : 0); prop(p, 'rgems', rw ? Math.min(9999, rw.gems) : 0);   // (the result's gems; in the lobby the wallet's)
    // the selected tower: the one whose menu was opened lately, else the one looked at with the wand
    const tw = selectedTower(p);
    prop(p, 't123', ti[0] + 100 * ti[1] + 10000 * ti[2]);
    prop(p, 't45', ti[3] + 100 * ti[4] + 10000 * (tw ? tidx(tw.name) : 99));
    if (!tw) { prop(p, 'tinfo', 0); continue; }
    if (G.indicators.on) G.indicators.watched.add(tw.id);
    const mx = Math.min(7, maxLevel(tw.name)), lv = Math.min(7, tw.lvl), tg = Math.max(0, G.TARGETS.indexOf(tw.target as (typeof G.TARGETS)[number]));
    prop(p, 'tinfo', 10000 + G.towerRole(tw.name, tw.temp !== undefined) * 1000 + lv * 100 + mx * 10 + tg);
    prop(p, 'tup', tw.lvl >= maxLevel(tw.name) ? 0 : Math.min(99999, G.infl(levelCost(tw.name, tw.lvl + 1)) || 0));
    prop(p, 'tsell', Math.min(99999, G.sellValue(tw)));
  }
}, 2);
