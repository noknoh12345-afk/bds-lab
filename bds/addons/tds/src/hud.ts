// Drives the GeoUI match HUD (tools/hud.mjs builds it): player properties tdsui:* — the screen shape (aspect, centre fix,
// scale) like GeoUI's own script, and the match values each HUD element reads. A property is set only when it changes.
import { world, system, Player, PlatformType, HudElement, HudVisibility } from '@minecraft/server';
import { placeCost } from './defs';
import { cmd } from './kit';
import * as G from './game';
import { prof, lastReward } from './lobby';
import { expFor } from './defs';
import { placeCost as _pc, levelCost, maxLevel } from './defs';

const NS = 'tdsui';
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
void _pc;

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
// the vanilla bars the original does not have are hidden while the HUD is on (the hotbar stays: it holds the tower slots)
const HIDE = ['Health', 'Hunger', 'ProgressBar', 'Armor', 'AirBubbles', 'HorseHealth'].map((n) => (HudElement as unknown as Record<string, HudElement>)[n]).filter((x) => x !== undefined);
const hidden = new Set<string>();
function vanilla(p: Player, hide: boolean) {
  if (hide === hidden.has(p.id)) return;
  try { p.onScreenDisplay.setHudVisibility(hide ? HudVisibility.Hide : HudVisibility.Reset, HIDE); if (hide) hidden.add(p.id); else hidden.delete(p.id); } catch { /* older game */ }
}
world.afterEvents.playerLeave.subscribe(({ playerId }) => hidden.delete(playerId));

system.runInterval(() => {
  bannerNow();
  const M = G.M, t = system.currentTick;
  for (const p of world.getAllPlayers()) {
    const on = hudOn(p);
    vanilla(p, on);
    if (!on || !M) {   // the lobby: level, EXP, coins, gems (mode 15)
      const off = prefOf(p).off; prop(p, 'alpha', off ? 0 : 100); if (off) continue;
      const pr = prof(p); prop(p, 'mode', 15); prop(p, 'wave', Math.min(999, pr.level)); prop(p, 'hp', Math.min(99999, Math.floor(pr.exp))); prop(p, 'hpmax', Math.min(99999, Math.max(1, Math.ceil(expFor(pr.level + 1)))));
      prop(p, 'cash', Math.min(999999, pr.coins)); prop(p, 'rgems', Math.min(99999, pr.gems)); prop(p, 'tinfo', 0); prop(p, 'bn', 0);
      continue;
    }
    prop(p, 'alpha', 100);
    prop(p, 'wave', Math.min(999, M.wave)); prop(p, 'total', Math.min(99, G.lastWave()));
    prop(p, 'timer', M.waveEnd === Infinity ? 0 : Math.min(999, Math.max(0, Math.ceil(M.waveEnd - M.t))));
    prop(p, 'hp', Math.min(99999, Math.max(0, M.baseHP))); prop(p, 'hpmax', Math.min(99999, Math.max(1, M.maxHP)));
    prop(p, 'cash', Math.min(999999, Math.max(0, Math.floor(M.cash[p.name] ?? 0))));
    prop(p, 'enemies', Math.min(999, M.enemies.length));
    const boss = M.enemies.filter((e) => e.boss).sort((a, b) => b.max - a.max)[0];
    prop(p, 'boss', boss ? Math.max(1, Math.min(100, Math.ceil((boss.hp / boss.max) * 100))) : 0);
    prop(p, 'mode', Math.max(0, MODES.indexOf(M.mode)));
    // the tower bar: role per slot (9 = empty) as base-10 digits, costs, the held slot
    const lo = M.loadouts?.[p.name] ?? prof(p).loadout; let roles = 0;
    for (let i = 0; i < 5; i++) { const n = lo[i]; roles += (n ? G.towerSkin(n) : 9) * 10 ** i; prop(p, `c${i + 1}`, n ? Math.min(9999, G.infl(placeCost(n)) || 0) : 0); }
    prop(p, 'roles', roles);
    const held = p.getComponent('inventory')?.container?.getItem(p.selectedSlotIndex)?.typeId.match(/^tds:slot_([1-5])$/);
    prop(p, 'sel', held ? +held[1] : 0);
    const skip = !M.over && !M.inter && M.wave > 0 && Number.isFinite(M.skipAt) && M.t >= M.skipAt;
    prop(p, 'sv', (skip ? 10 : 0) + Math.min(9, M.votes.length));
    prop(p, 'bn', banner * 1000 + Math.min(999, Math.floor((t - bannerAt) / 2)));
    // the result's rewards under the banner
    const rw = M.over ? lastReward.get(p.name) : undefined;
    prop(p, 'rew', rw ? Math.min(9999, rw.coins) * 1000 + Math.min(999, rw.exp) : 0); prop(p, 'rgems', rw ? Math.min(9999, rw.gems) : 0);   // (the result's gems; in the lobby the wallet's)
    // the selected tower: the one whose menu was opened lately, else the one looked at with the wand
    const tw = selectedTower(p);
    if (!tw) { prop(p, 'tinfo', 0); continue; }
    const mx = Math.min(7, maxLevel(tw.name)), lv = Math.min(7, tw.lvl), tg = Math.max(0, G.TARGETS.indexOf(tw.target as (typeof G.TARGETS)[number]));
    prop(p, 'tinfo', 10000 + G.towerSkin(tw.name, tw.temp !== undefined) * 1000 + lv * 100 + mx * 10 + tg);
    prop(p, 'tup', tw.lvl >= maxLevel(tw.name) ? 0 : Math.min(99999, G.infl(levelCost(tw.name, tw.lvl + 1)) || 0));
    prop(p, 'tsell', Math.min(99999, G.sellValue(tw)));
  }
}, 2);
