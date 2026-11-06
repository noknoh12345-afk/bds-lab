// Static data (extracted from the TDS wiki by tools/extract.mjs) and the derived rules every system shares.
import TOWERS from '../data/towers.json';
import ENEMIES from '../data/enemies.json';
import MODES from '../data/modes.json';
import MAPS from '../data/maps.json';
import RULESJ from '../data/rules.json';

export type Lv = Record<string, number | string | null>;
export type TowerAbility = { title: string; unlock: number; cd: number | null; cost: number; info: string; simulated: boolean };
export type TowerDef = { abilities?: TowerAbility[]; category: string; unlock: { kind: string; value: number | null; level?: number; triumph?: string }; role: string | null; placement: string; footprint: number; limit: number | null; damageType: string | null; sell: number | null; detect: { hidden: number | null; lead: number | null; flying: number | null }; immune: string | null; levels: Lv[] };
export type EnemyMode = { hp: number | null; speed: number | null; cash: number | null; cashEveryPct?: number; shield?: number; speedNoShield?: number };
export type Spawn = { name?: string; pool?: string[]; n: number };
export type Ability = { title: string; cd: number | null; kind: 'deathSpawn' | 'summon' | 'stun' | 'debuff' | 'heal' | 'speedAura' | 'boneArmor'; spawn?: Spawn[]; dur?: number; radius?: number | null; unitDmg?: number | null; onDeath?: boolean; fatigue?: number; range?: number; amount?: number; every?: number; pct?: number; step?: number; max?: number };
export type EnemyDef = { hidden: boolean; flying: boolean; lead: boolean; ghost: boolean; boss: boolean; defense: number; immune: string[]; per: Record<string, EnemyMode>; spawns?: string[]; spawnMode?: string; abilities?: Ability[] };
export type Group = { n: number; e: string; mods?: string[] };
export type ModeDef = { waves: number; level: number; startCash: number; startBy: number[] | null; baseHP: number; waveCash: { pieces: { to: number; e: string }[]; mult: number[] }; clear: { solo: number; group: number; noDamage: boolean }; rewards: Partial<Record<'coins' | 'gems' | 'exp' | 'texp', Formula>>; hpScale: number[]; timers: { from: number; to: number; timer: number | null; skipAfter: number | null }[]; wave: Record<string, Group[]> };
export type Formula = { base: number; n: number; pow: number; bonus: number };
export type QuestObj = { do: 'triumph' | 'damage' | 'kills' | 'boss' | 'status' | 'ability' | 'cash'; need?: [number, number]; times?: [number, number]; cash?: [number, number]; hpPct?: [number, number]; tower?: boolean; support?: boolean; role?: boolean; boss?: boolean; status?: boolean; map?: boolean; maps?: number; modes?: number; players?: number[]; loadoutMax?: number };
export type QuestDef = { title: string; kind: 'daily' | 'weekly'; coins?: number; gems?: number; exp: number; crate?: string; objs: QuestObj[] };
export type Rules = { sellRate: number; cashSplit: string; xpBoost: { mult: number; utcDays: number[] }; intermission: number; elevators: Record<'Survival' | 'Hardcore', { max: number; wait: number; rotate?: number | null }>; levelRewards: Record<string, { coins: number }>; fifthSlot: number; quests: { daily: number; weekly: number; list: QuestDef[]; statuses: string[] } };
export type MapDef = { stud: number; y: number; path: [number, number][]; width: number; grid: string[]; pathStuds: number; src: string };

export const towers = TOWERS as unknown as Record<string, TowerDef>;
export const enemies = ENEMIES as unknown as Record<string, EnemyDef>;
export const modes = MODES as unknown as Record<string, ModeDef>;
export const maps = MAPS as unknown as Record<string, MapDef>;
export const rules = RULESJ as unknown as Rules;
export const MODE_NAMES = Object.keys(modes);
export const DEFAULT_MAP = Object.keys(maps)[0];

// Guesses the wiki does not state (each is listed in data/_unknown.json)
export const RULES = { spawnGap: 0.6, groupGap: 1.0, intermission: rules.intermission, childCount: 2, summonEvery: 8, unitSpeed: 4, unitRange: 6, unitMax: 3, sellRate: rules.sellRate };

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
  const L = towers[name]?.levels[lvl] ?? {};
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
  if (/splash/i.test(towers[name]?.damageType ?? '') && !s.splash) s.splash = 3;
  cache.set(k, s); return s;
}
export const maxLevel = (name: string) => (towers[name]?.levels.length ?? 1) - 1;
export const levelCost = (name: string, lvl: number) => n(towers[name]?.levels[lvl]?.cost);
export const placeCost = (name: string) => levelCost(name, 0);

/** Wave bonus from the mode page formula: w = waves completed, p = players. */
const fcache = new Map<string, (w: number, p: number) => number>();
export function waveCash(mode: string, w: number, p: number): number {
  const c = modes[mode].waveCash, e = (c.pieces.find((x) => w <= x.to) ?? c.pieces[c.pieces.length - 1]).e;
  if (!/^[\dwp+\-*/().\s]+$/.test(e)) return 0;
  let f = fcache.get(e); if (!f) { f = Function('w', 'p', `return ${e}`) as (w: number, p: number) => number; fcache.set(e, f); }
  return Math.floor(f(w, p) * (c.mult[Math.min(4, Math.max(1, p)) - 1] ?? 1) + 1e-6);
}
export const startCash = (mode: string, p: number) => modes[mode].startBy?.[Math.min(4, Math.max(1, p)) - 1] ?? modes[mode].startCash;
export function timerFor(mode: string, wave: number) { return modes[mode].timers.find((t) => wave >= t.from && wave <= t.to) ?? { timer: 60, skipAfter: 20 }; }

/** Enemy stats in a mode; falls back to the first mode that lists it (a summoned enemy may not be in the roster). */
export function enemyIn(name: string, mode: string): EnemyMode & { speed: number; hp: number; cash: number } {
  const d = enemies[name]; const m = d?.per[mode] ?? Object.values(d?.per ?? {})[0] ?? { hp: 10, speed: 3, cash: 5 };
  return { ...m, hp: m.hp ?? 10, speed: m.speed ?? 3, cash: m.cash ?? 0 };
}

/** Effective damage (Defense page): damage ÷ (1 + defense), rounded up when defense applies. */
export const afterDefense = (dmg: number, def: number) => (def > 0 ? Math.ceil(dmg / (1 + def / 100) - 1e-9) : dmg);

/** EXP needed to go from level-1 to level (Levels page). */
export const expFor = (next: number) => (next <= 10 ? 45 + next * 3.5 : next <= 40 ? next * 8 : 260 + next * 1.5);

/** Mode rewards (mode pages): each currency R ÷ (1 + [(N ÷ wave) − 1]^k) + its triumph bonus, rounded down; EXP is multiplied by the XP Boost. */
export function rewardFor(mode: string, wave: number, win: boolean, boost = 1) {
  const r = modes[mode].rewards, f = (F?: Formula) => (!F ? 0 : (wave > 0 ? F.base / (1 + Math.pow(Math.max(0, F.n / wave - 1), F.pow)) : 0) + (win ? F.bonus : 0));
  return { coins: Math.floor(f(r.coins) + 1e-9), gems: Math.floor(f(r.gems) + 1e-9), exp: Math.floor(f(r.exp) * boost + 1e-9), texp: Math.floor(f(r.texp) + 1e-9) };
}
/** XP Boost (Experience page): EXP from matches ×1.5 from 00:00 UTC Friday to 00:00 UTC Sunday. */
export const xpBoostAt = (ms: number) => (rules.xpBoost.utcDays.includes(new Date(ms).getUTCDay()) ? rules.xpBoost.mult : 1);
/** Loadout slots (Levels page): the fifth slot opens at level 15. */
export const slotsAt = (level: number) => (level >= rules.fifthSlot ? 5 : 4);
/** Kill cash share (mode pages): split evenly between the players, a decimal of .5 or more rounds up. */
export const cashShare = (amount: number, players: number) => Math.floor(amount / Math.max(1, players) + 0.5);
/** Enemy health in a mode for a party (|health_scale): ×(1 + 15/25/40%) for 2/3/4 players in Molten and Fallen. */
export const hpFor = (mode: string, players: number) => 1 + (modes[mode].hpScale?.[Math.min(4, Math.max(1, players)) - 1] ?? 0);
