// Static data (extracted from the TDS wiki by tools/extract.mjs) and the derived rules every system shares.
import TOWERS from '../data/towers.json';
import ENEMIES from '../data/enemies.json';
import MODES from '../data/modes.json';
import MAPS from '../data/maps.json';

export type Lv = Record<string, number | string | null>;
export type TowerDef = { category: string; unlock: { kind: string; value: number | null }; role: string | null; placement: string; footprint: number; limit: number | null; damageType: string | null; sell: number | null; detect: { hidden: number | null; lead: number | null; flying: number | null }; immune: string | null; levels: Lv[] };
export type EnemyMode = { hp: number | null; speed: number | null; cash: number | null; cashEveryPct?: number; shield?: number };
export type EnemyDef = { hidden: boolean; flying: boolean; lead: boolean; ghost: boolean; boss: boolean; defense: number; immune: string[]; per: Record<string, EnemyMode>; spawns?: string[]; spawnMode?: string };
export type Group = { n: number; e: string; mods?: string[] };
export type ModeDef = { waves: number; level: number; startCash: number; baseHP: number; waveCash: string; rewards: { coins: number; exp: number; gems: number }; timers: { from: number; to: number; timer: number | null; skipAfter: number | null }[]; wave: Record<string, Group[]> };
export type MapDef = { stud: number; y: number; path: [number, number][]; width: number; grid: string[]; pathStuds: number; src: string };

export const towers = TOWERS as unknown as Record<string, TowerDef>;
export const enemies = ENEMIES as unknown as Record<string, EnemyDef>;
export const modes = MODES as unknown as Record<string, ModeDef>;
export const maps = MAPS as unknown as Record<string, MapDef>;
export const MODE_NAMES = Object.keys(modes);
export const DEFAULT_MAP = Object.keys(maps)[0];

// Guesses the wiki does not state (each is listed in data/_unknown.json)
export const RULES = { spawnGap: 0.6, groupGap: 1.0, clearWait: 5, childCount: 2, summonEvery: 8, unitSpeed: 4, unitRange: 6, unitMax: 3, sellRate: 1 / 3, elevatorWait: 20 };

const n = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v.replace(/,/g, '')) : NaN);
const f = (L: Lv, ...ks: string[]) => { for (const k of ks) { const v = n(L[k]); if (Number.isFinite(v)) return v; } return undefined; };

/** Stats the engine understands, read from any tower's level row (names differ per tower on the wiki). */
export type Stats = {
  dmg: number; fr?: number; range: number; splash?: number; maxHits: number; pellets: number; burst?: number; burstCd?: number; ammo?: number; reload?: number;
  burn?: [number, number, number]; poison?: [number, number, number]; slowHit?: number; slowMax?: number; slowTime?: number; freeze?: number; stun?: number;
  chain?: number; melt?: number; income?: number; cashShot?: number; frBuff?: number; dmgBuff?: number; rangeBuff?: number; spawnrate?: number; unitHp?: number; unitDmg?: number;
};
const cache = new Map<string, Stats>();
export function stats(name: string, lvl: number): Stats {
  const k = name + '#' + lvl; const c = cache.get(k); if (c) return c;
  const L = towers[name].levels[lvl] ?? {};
  const pct = (v?: number) => (v === undefined ? undefined : v > 1 ? v / 100 : v);
  const s: Stats = {
    dmg: f(L, 'damage', 'normalDamage', 'splashDamage', 'bombDamage', 'fireworkDamage', 'gunnerDamage') ?? 0,
    fr: f(L, 'firerate', 'swingrate', 'cannonFirerate', 'highestFirerate') ?? (f(L, 'damage') !== undefined ? f(L, 'tick') : undefined),
    range: f(L, 'range') ?? 0,
    splash: f(L, 'explosionRange', 'explosionRadius'),
    maxHits: f(L, 'maxHits') ?? 1,
    pellets: f(L, 'bulletCount', 'pelletCount', 'missileCount') ?? 1,
    burst: f(L, 'burstCount', 'burstSize'), burstCd: f(L, 'cooldown', 'burstCooldown'),
    ammo: f(L, 'ammo'), reload: f(L, 'reloadTime'),
    slowHit: pct(f(L, 'slowdownPerHit', 'slowdown')), slowMax: pct(f(L, 'maxSlowdown')), slowTime: f(L, 'slowdownTime'), freeze: f(L, 'freezeTime'),
    stun: f(L, 'shockTime', 'stunTime'), chain: f(L, 'chainRange'), melt: f(L, 'defenseMelt', 'defenseMelting'),
    income: f(L, 'income'), cashShot: f(L, 'cashShot'),
    frBuff: pct(f(L, 'firerateBuff')), dmgBuff: pct(f(L, 'damageBuff')), rangeBuff: pct(f(L, 'rangeBuff')),
    spawnrate: f(L, 'spawnrate'), unitHp: f(L, 'health'),
  };
  const bd = f(L, 'burnDamage'), bt = f(L, 'burnTick', 'tick'), bT = f(L, 'burnTime', 'burnDuration');
  if (bd && bt && bT) s.burn = [bd, bt, bT];
  const pd = f(L, 'poisonDamage'), pT = f(L, 'poisonTime');
  if (pd && pT) s.poison = [pd, f(L, 'tick') ?? 1, pT];
  if (s.spawnrate && s.unitHp) s.unitDmg = f(L, 'gunnerDamage', 'damage', 'normalDamage') ?? 1;
  if (/splash/i.test(towers[name].damageType ?? '') && !s.splash) s.splash = 3;
  cache.set(k, s); return s;
}
export const maxLevel = (name: string) => towers[name].levels.length - 1;
export const levelCost = (name: string, lvl: number) => n(towers[name].levels[lvl]?.cost);
export const placeCost = (name: string) => levelCost(name, 0);

/** Wave bonus from the mode page formula: w = waves completed, p = players. */
export function waveCash(mode: string, w: number, p: number): number {
  const e = modes[mode].waveCash;
  if (!/^[\dwp+\-*/().\s]+$/.test(e)) return 0;
  return Math.floor((Function("w", "p", `return ${e}`)(w, p) as number) + 1e-6);
}
export function timerFor(mode: string, wave: number) { return modes[mode].timers.find((t) => wave >= t.from && wave <= t.to) ?? { timer: 60, skipAfter: 20 }; }

/** Enemy stats in a mode; falls back to the first mode that lists it (a summoned enemy may not be in the roster). */
export function enemyIn(name: string, mode: string): EnemyMode & { speed: number; hp: number; cash: number } {
  const d = enemies[name]; const m = d?.per[mode] ?? Object.values(d?.per ?? {})[0] ?? { hp: 10, speed: 3, cash: 5 };
  return { ...m, hp: m.hp ?? 10, speed: m.speed ?? 3, cash: m.cash ?? 0 };
}

/** EXP needed to go from level-1 to level (Levels page). */
export const expFor = (next: number) => (next <= 10 ? 45 + next * 3.5 : next <= 40 ? next * 8 : 260 + next * 1.5);
