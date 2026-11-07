// The match: path, enemies, towers, units, economy, waves. Pure simulation in studs/seconds; entities only mirror it.
import { world, system, Player, Entity, Dimension } from '@minecraft/server';
import { ENEMY_LOOK, TOWER_LOOK, UNIT_LOOK } from './looks';
import { DEFAULT_MAP, towers, enemies, modes, maps, stats, maxLevel, levelCost, placeCost, waveCash, startCash, timerFor, enemyIn, afterDefense, cashShare, hpFor, RULES, rules, units, unitsFor, Stats, Group, Ability, Spawn, TowerAbility, SkillDef } from './defs';

export let headless = false;
export const log = (ev: string, o: Record<string, unknown> = {}) => { if (!headless) console.log(`[TDS] ${JSON.stringify({ ev, ...o })}`); };
export const TARGETS = ['First', 'Last', 'Strongest', 'Weakest', 'Closest', 'Farthest', 'Random'] as const;

// ---------- path ----------
/** the lane enemies walk on is this many blocks below the ground; stairs rise from it to the ground on both sides */
export const LANE_DEPTH = 1;
/** half the width of the flat lane, in blocks (the rest of the path width is the stair slope) */
export const LANE_HALF = 0.75;
type Pt = { x: number; z: number };
export class Path {
  pts: Pt[]; seg: number[] = []; len = 0; stud: number; y: number; width: number; floor: number;
  constructor(public map: string) {
    const m = maps[map]; this.stud = m.stud; this.y = m.y; this.width = m.width; this.floor = m.y - LANE_DEPTH; this.pts = m.path.map(([x, z]) => ({ x: x + 0.5, z: z + 0.5 }));
    for (let i = 1; i < this.pts.length; i++) { this.seg.push(this.len); this.len += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z) / this.stud; }
  }
  at(d: number): Pt & { yaw: number } {
    d = Math.max(0, Math.min(this.len, d));
    let i = this.seg.length - 1; while (i > 0 && this.seg[i] > d) i--;
    const a = this.pts[i], b = this.pts[i + 1], sl = Math.hypot(b.x - a.x, b.z - a.z) / this.stud, t = sl ? (d - this.seg[i]) / sl : 0;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: (Math.atan2(-(b.x - a.x), b.z - a.z) * 180) / Math.PI };
  }
  /** the way a walker faces at d: from a little behind to a little ahead, so it turns round a corner instead of snapping */
  yawAt(d: number) { const a = this.at(d - 0.7), b = this.at(d + 0.7); return (Math.atan2(-(b.x - a.x), b.z - a.z) * 180) / Math.PI; }
  /** distance from a block position to the path centreline, in blocks */
  dist(x: number, z: number) {
    let best = Infinity;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return best;
  }
}

// ---------- state ----------
export type Enemy = {
  id: number; name: string; d: number; hp: number; max: number; shield: number; speed: number; def: number; cash: number; every?: number; paid: number;
  hidden: boolean; flying: boolean; lead: boolean; boss: boolean; immune: string[]; mods: string[];
  slow: number; slowUntil: number; freezeUntil: number; stunUntil: number; dots: { dmg: number; tick: number; next: number; until: number; tw: number; kind?: string }[];
  nextSummon?: number; wave: number; summoned?: boolean; born?: number; x?: number; z?: number; dirty?: boolean;
  aggro?: boolean; regen?: number; abil?: number[]; baseDef?: number; haste?: number; hasteUntil?: number; v?: number;
  /** status effects from towers: confusion (walks back), Neuralyzed (forced target, +damage taken), vulnerability, bounty, wire fraud */
  ph?: number[]; rev?: { at: number; name: string; hp: number; d: number };
  conf?: number; confCd?: number; neural?: number; neuralPct?: number; vuln?: number; vulnPct?: number; bounty?: { tw: number; pct: number; cap: number }; wire?: { tw: number; pct: number }; acc?: Record<number, number>;
};
export type Tower = { id: number; name: string; lvl: number; x: number; y: number; z: number; owner: string; target: string; next: number; burstLeft: number; ammoLeft: number; shots: number; spent: number; dealt: number; nextUnit: number; primary: number; stunUntil?: number; stunKind?: 'stun' | 'freeze'; fat?: number; rdeb?: number; debUntil?: number; abReady?: Record<string, number>; selfBuff?: number; selfBuffUntil?: number; ctaBuff?: number; ctaUntil?: number; st?: Record<string, any>; temp?: number };
/** Per-player match statistics (quests): damage and kills by tower, status effects applied, ability uses, cash earned, towers placed, bosses killed. */
export type PSt = { dmg: Record<string, number>; kills: number; killsBy: Record<string, number>; status: Record<string, number>; abil: Record<string, number>; earned: number; placed: string[]; bosses: string[] };
export type Unit = { id: number; tw: number; d: number; hp: number; dmg: number; next: number; max?: number; kind?: string; fr?: number; range?: number; speed?: number; until?: number; stationary?: boolean;
  splash?: number; splashDmg?: number; burst?: number; burstCd?: number; burstLeft?: number; collide?: boolean; explode?: number; detect?: { hidden: boolean; lead: boolean; flying: boolean }; slow?: number; slowTime?: number; freezeEvery?: number; shots?: number };
export type Match = {
  mode: string; map: string; players: string[]; cash: Record<string, number>; baseHP: number; maxHP: number; wave: number; t: number; waveEnd: number; skipAt: number;
  queue: { at: number; name: string; mods: string[] }[]; enemies: Enemy[]; towers: Tower[]; units: Unit[]; seq: number; votes: string[];
  over?: 'win' | 'lose'; hold?: boolean; inter?: boolean; waveDmg?: boolean; stats: { kills: number; leaks: number; dealt: number; income: number }; clearPaid: boolean; leakedThisWave: boolean; seed: number;
  pst?: Record<string, PSt>; loadouts?: Record<string, string[]>;
  /** skill levels per player for this match (set by src/skills.ts through onStart; empty when skills are off) */
  skills?: Record<string, Record<string, number>>;
  /** Hidden Wave (Fallen): armed by the chat codes (src/progress.ts); kingAt/kingDead: when the king of wave 40 appeared/died */
  hidden?: { armed: boolean; kingAt?: number; kingDead?: number; on?: boolean };
  sandbox?: boolean;
  /** match modifiers (src/modifiers.ts picks them; data/rules.json modifiers) */
  mods?: string[];
};
/** called right after a match is created, before its start is logged (skills, Hidden Wave state, Sandbox) */
export const onStart: ((m: Match, players: Player[]) => void)[] = [];

export let M: Match | undefined;
export let path: Path | undefined;
const ents = new Map<number, Entity>();
/** what the client shows of a walker (tools/models/motion.py): tds:pace, how fast its legs go (studs/s x 10, the sim speed
 * in), and tds:st, what happens to it (1 stunned, 2 frozen, 3 dies, 4 leaves, 5 dies in the air; a tower: 3 sold) — sent
 * only when they change */
const shown = new Map<number, [number, number]>();
function showState(id: number, x: Entity, pace: number, st: number) {
  const was = shown.get(id); if (was && was[0] === pace && was[1] === st) return;
  shown.set(id, [pace, st]);
  try { if (pace >= 0 && (!was || was[0] !== pace)) x.setProperty('tds:pace', pace); if (!was || was[1] !== st) x.setProperty('tds:st', st); } catch { /* older pack */ }
}
/** the motion is worth showing: a real match at real speed (not a bench, a headless simulation or a sped-up test) */
const visual = () => !headless && simSpeed() <= 1;
/** an entity leaves with its last motion (a fall, a hop into the base, a fade) and is removed after it */
function vanish(id: number, st: number, ticks: number) {
  const x = ents.get(id); ents.delete(id); shown.delete(id);
  if (!x?.isValid) return;
  if (!visual()) { x.remove(); return; }
  try { x.setProperty('tds:st', st); x.nameTag = ''; } catch { x.remove(); return; }
  system.runTimeout(() => { try { if (x.isValid) x.remove(); } catch { /* gone */ } }, ticks);
}
/** a one-off animation on an entity: an enemy's ability, a unit's shot, a tower's reload or ability */
function act(id: number, anim: string) { if (!visual()) return; const x = ents.get(id); if (x?.isValid) try { x.playAnimation(anim); } catch { /* unloaded */ } }
/** healing left on the path by enemies (puddles, flasks); seconds-long, not saved */
let ezones: { d: number; r: number; amount: number; every: number; next: number; until: number }[] = [];
const dim = (): Dimension => world.getDimension('overworld');
let rnd = 1;
const fresh = (): PSt => ({ dmg: {}, kills: 0, killsBy: {}, status: {}, abil: {}, earned: 0, placed: [], bosses: [] });
export const pst = (n: string): PSt => { const m = M!; m.pst ??= {}; return (m.pst[n] ??= fresh()); };
/** cash into a player's purse, counted as earned (Economy Audit) */
export function pay(n: string, amount: number) {
  if (!M || amount <= 0) return;
  if (mod('Broke')) amount = Math.floor(amount * 0.5);   // Broke: all income halved
  M.cash[n] = (M.cash[n] ?? 0) + amount; pst(n).earned += amount;
}
export const mark = (tw: Tower | undefined, k: string) => { if (tw && M?.players.includes(tw.owner)) { const s = pst(tw.owner).status; s[k] = (s[k] ?? 0) + 1; } };

// ---------- skills (Skills page; levels come from src/skills.ts through onStart) ----------
const skillDef = new Map<string, SkillDef>((rules.skills?.list ?? []).map((d) => [d.name, d]));
export const skillOf = (name: string) => skillDef.get(name);
/** a player's level in a skill this match (0 when skills are off) */
export const skl = (owner: string, name: string) => M?.skills?.[owner]?.[name] ?? 0;
/** the skill's whole effect for that player: level × per-level value (a percentage when the page says %) */
export const skv = (owner: string, name: string) => { const d = skillDef.get(name), l = skl(owner, name); return d && l ? l * (d.per ?? 0) : 0; };
/** "every Nth shot/kill" skills: N for that player (the page's N at level 1, falling by per each level); 0 when not owned */
export const skEvery = (owner: string, name: string) => { const d = skillDef.get(name), l = skl(owner, name); return d?.every && l ? Math.max(1, Math.round(d.every - (l - 1) * (d.per ?? 1))) : 0; };
/** Fortify (the highest of the players) and Bigger Budget (each player) */
function applyStartSkills(m: Match) {
  if (!m.skills) return;
  let fort = 0;
  for (const n of m.players) { fort = Math.max(fort, skv(n, 'Fortify')); const bb = skv(n, 'Bigger Budget'); if (bb) m.cash[n] = Math.floor((m.cash[n] ?? 0) * (1 + bb / 100) + 1e-9); }
  if (fort) { m.baseHP += fort; m.maxHP += fort; }
}
/** Re-enforcements: +1 placement per level solo, 0.8 in duo, 0.5 in trio or more (rounded down) */
export function extraLimit(owner: string) { const d = skillDef.get('Re-enforcements'), l = skl(owner, 'Re-enforcements'); if (!d || !l || !M) return 0; const p = M.players.length; return Math.floor(l * (p >= 3 ? d.trio ?? 0.5 : p === 2 ? d.duo ?? 0.8 : d.per ?? 1) + 1e-9); }
/** over-heal the base may keep above its maximum (Over-Heal, per player) */
export const overCap = () => (M ? M.players.reduce((a, n) => a + skv(n, 'Over-Heal'), 0) : 0);
/** heal the base; up to max + extra (Medic over-heal) */
export function healBase(n: number, extra = 0) {
  if (!M || n <= 0 || M.over || mod('Glass')) return 0;
  const cap = M.maxHP + Math.max(extra, overCap()), was = M.baseHP; M.baseHP = Math.max(M.baseHP, Math.min(cap, M.baseHP + n));
  if (M.baseHP > was && path) { const e = maps[M.map].path[maps[M.map].path.length - 1]; fx('heal', e[0] + 0.5, path.floor + 0.5, e[1] + 0.5); }
  return M.baseHP - was;
}
/** Extreme Conditioning: stuns and debuffs from enemies on that player's towers are shorter */
export const ec = (tw: Tower) => Math.max(0, 1 - skv(tw.owner, 'Extreme Conditioning') / 100);
/** Fight Dirty: debuffs the player's towers put on enemies last longer */
export const fd = (tw: Tower) => 1 + skv(tw.owner, 'Fight Dirty') / 100;

// ---------- match modifiers (each modifier page's Effects) ----------
export const mod = (k: string) => !!M?.mods?.includes(k);
/** Inflation: placement, upgrade and ability costs +50% */
export const infl = (c: number) => (mod('Inflation') ? Math.round(c * 1.5) : c);
/** Quarantine: every footprint +10 studs */
export const foot = (name: string) => (towers[name]?.footprint ?? 1.5) + (mod('Quarantine') ? 10 : 0);
/** modifiers that become enemy attributes: Healthy → Bloated, Speedy → Nimble, Tanky → Tank, Hidden Enemies after wave 5 */
function withMods(mods: string[], wave: number) {
  const add: string[] = [];
  if (mod('Healthy Enemies')) add.push('Bloated');
  if (mod('Speedy Enemies')) add.push('Nimble');
  if (mod('Tanky Enemies')) add.push('Tank');
  if (mod('Hidden Enemies') && wave > 5) add.push('Hidden');
  return add.length ? [...new Set([...mods, ...add])] : mods;
}

// ---------- hooks (src/abilities.ts fills them: special towers, abilities, statuses) ----------
export type AbilityCtx = { tw: Tower; owner: string; a: TowerAbility; L: Record<string, unknown>; s: Stats; lead?: Enemy; at?: { x: number; y: number; z: number }; d?: number; target?: Tower };
export const hooks = {
  /** per tower name; true = handled this step (the default attack is skipped) */
  towerStep: {} as Record<string, (tw: Tower, dt: number) => boolean>,
  /** where a tower attacks from (planes, vehicles); towers without one attack from their block */
  origin: {} as Record<string, (tw: Tower) => { x: number; z: number }>,
  fire: [] as ((tw: Tower, s: Stats & { range: number }, target: Enemy, hits: Enemy[]) => void)[],
  kill: [] as ((e: Enemy, tw?: Tower) => void)[],
  waveEnd: [] as ((cleared: boolean) => void)[],
  step: [] as (() => void)[],
  /** a tower about to be stunned by an enemy: true = it is protected (Medic shield, Ubercharge) */
  guard: [] as ((tw: Tower, kind: 'stun' | 'freeze') => boolean)[],
  ability: {} as Record<string, (c: AbilityCtx) => string>,
};
/** bench: towers measured on their plain Damage ÷ Firerate (no special behaviour, no spin-up) */
export let benchMode = false;
export const setBench = (b: boolean) => { benchMode = b; };
const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---------- arena ----------
export function buildArena(map: string) {
  const m = maps[map], d = dim(), y = m.y;
  d.runCommand(`fill -32 ${y - 2} -32 31 ${y - 2} 31 dirt`);
  d.runCommand(`fill -32 ${y - 1} -32 31 ${y - 1} 31 grass_block`);
  d.runCommand(`fill -32 ${y} -32 31 ${y + 6} 31 air`);
  const blk: Record<string, string> = { w: 'water', v: 'bedrock' };
  m.grid.forEach((row, i) => {
    const z = i - 32; let j = 0;
    while (j < row.length) {
      const c = row[j]; let k = j; while (k + 1 < row.length && row[k + 1] === c) k++;
      if (blk[c]) d.runCommand(`fill ${j - 32} ${y - 1} ${z} ${k - 32} ${y - 1} ${z} ${blk[c]}`);
      if (c === 'x') d.runCommand(`fill ${j - 32} ${y} ${z} ${k - 32} ${y + 1} ${z} stone`);
      j = k + 1;
    }
  });
  // the path: a flat lane one block down, stair blocks rising outward on both sides (the stairs' upper steps make the edge),
  // so the path reads clearly and its walkable part is narrow; small enemies walk in the lane
  const p = new Path(map), h = m.width / 2, cells = new Map<string, { x: number; z: number; dist: number }>();
  for (let s = 0; s <= p.len; s += 0.25) {
    const q = p.at(s);
    for (let x = Math.floor(q.x - h - 1); x <= Math.floor(q.x + h + 1); x++) for (let z = Math.floor(q.z - h - 1); z <= Math.floor(q.z + h + 1); z++) {
      const k = `${x},${z}`; if (cells.has(k)) continue;
      const dist = p.dist(x + 0.5, z + 0.5); if (dist <= h + 0.2) cells.set(k, { x, z, dist });
    }
  }
  const DIR: Record<string, number> = { east: 0, west: 1, south: 2, north: 3 };
  for (const c of cells.values()) {
    const water = m.grid[c.z + 32]?.[c.x + 32] === 'w';
    d.runCommand(`fill ${c.x} ${y - 1} ${c.z} ${c.x} ${y + 1} ${c.z} air`);
    if (c.dist <= LANE_HALF) { d.runCommand(`setblock ${c.x} ${y - 2} ${c.z} ${water ? 'oak_planks' : 'grass_path'}`); continue; }
    // a slope cell: stairs whose high side faces away from the path
    let bd = Infinity, bq = { x: c.x + 0.5, z: c.z + 0.5 };
    for (let s = 0; s <= p.len; s += 0.5) { const q = p.at(s), k = Math.hypot(q.x - c.x - 0.5, q.z - c.z - 0.5); if (k < bd) { bd = k; bq = q; } }
    const vx = c.x + 0.5 - bq.x, vz = c.z + 0.5 - bq.z, face = Math.abs(vx) >= Math.abs(vz) ? (vx > 0 ? 'east' : 'west') : vz > 0 ? 'south' : 'north';
    d.runCommand(`setblock ${c.x} ${y - 2} ${c.z} ${water ? 'oak_planks' : 'dirt'}`);
    d.runCommand(`setblock ${c.x} ${y - 1} ${c.z} ${water ? 'oak_stairs' : 'stone_brick_stairs'} ["weirdo_direction"=${DIR[face]},"upside_down_bit"=false]`);
  }
  const s0 = m.path[0], e = m.path[m.path.length - 1];
  d.runCommand(`setblock ${s0[0]} ${y - 2} ${s0[1]} crimson_nylium`);
  d.runCommand(`setblock ${e[0]} ${y - 2} ${e[1]} warped_nylium`);
  return p;
}

export type Place = 'ground' | 'cliff' | null;
export function surface(x: number, y: number, z: number): Place {
  const m = maps[M?.map ?? DEFAULT_MAP], b = dim().getBlock({ x, y: y - 1, z })?.typeId;
  const free = dim().getBlock({ x, y, z })?.isAir ?? true;   // nothing standing in the tower's own block (stairs, stone)
  if (y === m.y && b === 'minecraft:grass_block' && free) return 'ground';
  if (y === m.y + 2 && b === 'minecraft:stone' && free) return 'cliff';
  return null;
}

// ---------- match lifecycle ----------
export function start(mode: string, players: Player[], map = DEFAULT_MAP) {
  stop(true); ezones = [];
  const md = modes[mode]; path = buildArena(map); rnd = 1;
  const cash = startCash(mode, players.length);
  M = { mode, map, players: players.map((p) => p.name), cash: Object.fromEntries(players.map((p) => [p.name, cash])), baseHP: md.baseHP, maxHP: md.baseHP, wave: 0, t: 0, waveEnd: 5, skipAt: 0, inter: true,
    queue: [], enemies: [], towers: [], units: [], seq: 1, votes: [], stats: { kills: 0, leaks: 0, dealt: 0, income: 0 }, clearPaid: false, leakedThisWave: false, seed: 1, pst: Object.fromEntries(players.map((p) => [p.name, fresh()])) };
  const g = maps[map].grid[32]?.[32], onPath = path.dist(0.5, 0.5) < path.width / 2 + 0.5;
  for (const p of players) p.teleport({ x: 0.5, y: maps[map].y + (g === 'x' && !onPath ? 2.2 : 0.2), z: 0.5 });
  if (holdNext) { M.hold = true; holdNext = false; }
  if (md.sandbox) { M.sandbox = true; M.hold = true; }
  for (const f of onStart) f(M, players);
  applyStartSkills(M);
  if (mod('Glass')) { M.baseHP = 1; M.maxHP = 1; }   // Glass: base at 1, no over-heal
  log('match_start', { mode, map, players: M.players, cash, baseHP: M.baseHP, hpScale: hpFor(mode, players.length), pathStuds: +path.len.toFixed(1) });
  persist();
}

let holdNext = false;
export function setHold(on: boolean) { if (M && !M.over) { M.hold = on; persist(); } else holdNext = on; }
export function stop(silent = false) {
  for (const e of dim().getEntities({ families: ['tds'] })) e.remove();
  ents.clear(); shown.clear();
  if (M && !silent) log('match_stop', { mode: M.mode, wave: M.wave });
  M = undefined; path = undefined; world.setDynamicProperty('tds:m', undefined);
}

/** the last wave: 42 once the Hidden Wave is on (Fallen) */
export const lastWave = () => (!M ? 0 : M.hidden?.on && modes[M.mode].hidden ? 42 : modes[M.mode].waves);
function nextWave() {
  if (!M) return;
  const md = modes[M.mode];
  M.wave++; M.votes = []; M.clearPaid = false; M.leakedThisWave = false; M.waveDmg = false; M.inter = false;
  const hd = md.hidden, tm = M.wave > md.waves && hd ? hd.timers.find((x) => M!.wave >= x.from && M!.wave <= x.to) ?? { timer: null, skipAfter: null } : timerFor(M.mode, M.wave); M.waveEnd = tm.timer === null ? Infinity : M.t + tm.timer; M.skipAt = tm.skipAfter === null ? Infinity : M.t + tm.skipAfter;
  let at = M.t;
  for (const g of md.wave[String(M.wave)] ?? []) { for (let i = 0, cnt = mod('Lost Souls') ? Math.floor(g.n * 1.5) : g.n; i < cnt; i++) { M.queue.push({ at, name: g.e, mods: g.mods ?? [] }); at += RULES.spawnGap; } at += RULES.groupGap - RULES.spawnGap; }
  log('wave_start', { wave: M.wave, of: lastWave(), enemies: (md.wave[String(M.wave)] ?? []).reduce((a: number, g: Group) => a + g.n, 0), timer: tm.timer });
}

export function voteSkip(p: Player): string {
  if (!M) return 'No match';
  if (M.inter || M.wave === 0) return 'Next wave is starting';
  if (M.t < M.skipAt) return `Skip opens in ${Math.ceil(M.skipAt - M.t)}s`;
  if (!M.votes.includes(p.name)) M.votes.push(p.name);
  if (M.votes.length >= Math.max(1, M.players.length - 1)) { log('skip', { wave: M.wave }); M.waveEnd = M.t; return 'Skipped'; }
  return `Votes ${M.votes.length}/${M.players.length}`;
}

// ---------- enemies ----------
function spawnEnemy(name: string, mods: string[], d = 0, wave = M!.wave, summoned = false) {
  if (!M || !path) return;
  mods = withMods(mods, wave);
  const def = enemies[name], s = enemyIn(name, M.mode);
  const hp = s.hp * (mods.includes('Bloated') ? 2 : 1) * hpFor(M.mode, M.players.length) * (mod('Double Health') ? 2 : 1) * (mod('Small') ? 0.5 : 1);
  const e: Enemy = { id: M.seq++, name, d, hp, max: hp, shield: s.shield ?? 0, speed: s.speed * (mods.includes('Nimble') ? 2 : 1) * (mod('Small') ? 2 : 1), def: def?.defense ?? 0, cash: s.cash, every: s.cashEveryPct, paid: 0,
    hidden: !!def?.hidden, flying: !!def?.flying, lead: !!def?.lead, boss: !!def?.boss || mods.includes('Boss'), immune: def?.immune ?? [], mods,
    slow: 0, slowUntil: 0, freezeUntil: 0, stunUntil: 0, dots: [], wave, summoned, born: M.t };
  if (def?.spawns && def.spawnMode === 'periodic') e.nextSummon = M.t + RULES.summonEvery;
  // wave modifiers (wiki attribute pages)
  if (mods.includes('Hidden')) e.hidden = true;
  if (mods.includes('Freeze Immune')) e.immune = [...e.immune, 'Freeze'];
  if (mods.includes('Stun Immune')) e.immune = [...e.immune, 'Stun'];
  if (mods.includes('Health Regen')) e.regen = M.t + 2;
  if (mods.includes('Blessed')) e.def += 100;
  if (mods.includes('Aggro')) e.aggro = true;
  if (mod('Flying Enemies') && wave > 5) e.flying = true;   // Flying Enemies: every enemy after wave 5
  if (mod('Lost Souls')) e.def += 20;
  e.baseDef = e.def;
  if (def?.abilities) e.abil = def.abilities.map((a) => (a.cd ? M!.t + a.cd : Infinity));
  M.enemies.push(e); show(e);
  if (M.hidden && wave === modes[M.mode].waves && name === modes[M.mode].hidden?.king && M.hidden.kingAt === undefined) M.hidden.kingAt = M.t;
  log('enemy_spawn', { id: e.id, name, hp, speed: e.speed, hidden: e.hidden, flying: e.flying, lead: e.lead, boss: e.boss });
}

/** the look of an enemy: its own (src/looks.ts, one per enemy of the data); an enemy the data lacks wears its class's look */
const enemyLook = (e: Enemy) => ENEMY_LOOK[e.name] ?? ENEMY_LOOK[e.boss ? 'Normal Boss' : e.hidden ? 'Hidden' : e.flying ? 'Void Floater' : e.lead ? 'Lead'
  : (M?.mode === 'Frost' || /Frost|Ice|Yeti|Snow|Shiver|Glacial|Polar/.test(e.name)) ? 'Frozen' : (e.def >= 40 || /Slow|Heavy|Tank|Armored|Bulwark|Giant/.test(e.name)) ? 'Heavy'
  : e.speed >= 5 ? 'Speedy' : 'Normal'] ?? [0, 1];
export const enemySkin = (e: Enemy) => enemyLook(e)[0];
/** the look of a tower (src/looks.ts, one per tower of the data): [tds:skin, tds:size, the shot it plays]; a tower the data
 * lacks wears the Scout's */
export const towerLook = (name: string): [number, number, string] => TOWER_LOOK[name] ?? TOWER_LOOK['Scout'] ?? [0, 1, 'fire'];
/** the tower's role for the HUD's icons: 0 offense, 1 support, 2 income, 3 defense/splash, 4 cliff, 5 spawner, 6 hologram, 7 slow/freeze */
export function towerRole(name: string, hologram = false) {
  if (hologram) return 6;
  const d = towers[name]; if (!d) return 0;
  if (d.levels.some((l) => Number(l.income) > 0) && !d.levels.some((l) => Number(l.damage) > 0)) return 2;
  if (d.placement === 'cliff') return 4;
  if (Object.values(units).some((u) => u.tower === name) || d.levels.some((l) => Number(l.spawnrate) > 0)) return 5;
  if (/Freez|Cryo|Frost|Ice|Snow|Crystal/.test(name) || d.levels.some((l) => Number(l.slowdownPerHit) > 0 || Number(l.slowdown) > 0)) return 7;
  if (/Support/.test(d.role ?? '')) return 1;
  if (/splash/i.test(d.damageType ?? '') || /Defense/.test(d.role ?? '')) return 3;
  return 0;
}
/** the look of a unit (src/looks.ts, one per unit of the data): [tds:skin, tds:size]; a unit without a name takes the look of
 * what it is (an ice wall: the ice turret, a stationary guard: a sentry, a raised dead: a skeleton, else a rifleman) */
export const unitLook = (u: Unit): [number, number] => (u.kind ? UNIT_LOOK[u.kind] : undefined)
  ?? UNIT_LOOK[u.slow && u.stationary ? 'Ice Turret' : u.stationary ? 'Sentry (Unit)' : !u.kind ? 'Skeleton (Unit)' : /Vehicle/i.test(units[u.kind]?.type ?? '') ? 'Truck1' : 'Rifleman'] ?? [0, 1];
function show(e: Enemy) {
  if (!path) return;
  const p = path.at(e.d), y = path.floor + (e.flying ? 2.5 : 0);
  try {
    const ent = dim().spawnEntity('tds:enemy' as any, { x: p.x, y, z: p.z });
    ent.setProperty('tds:skin', enemySkin(e));
    ent.setProperty('tds:size', Math.min(8, enemyLook(e)[1] * (e.mods.includes('Bloated') ? 1.5 : 1)));
    if (e.hidden) ent.addEffect('invisibility', 20000000, { showParticles: false });
    ents.set(e.id, ent); shown.delete(e.id); e.dirty = true; flush(e);
  } catch { /* chunk not loaded: the simulation still runs */ }
}
const bar = (e: Enemy) => `${e.boss ? '§c' : e.hidden ? '§7' : '§f'}${e.name}${e.lead ? ' §8[Lead]' : ''}${e.flying ? ' §b[Fly]' : ''}\n§a${Math.ceil(e.hp)}${e.shield > 0 ? ` §e+${Math.ceil(e.shield)}` : ''}`;
function label(e: Enemy) { if (!headless) e.dirty = true; }
function flush(e: Enemy) { if (!e.dirty) return; e.dirty = false; const x = ents.get(e.id); if (x?.isValid) x.nameTag = bar(e); }

function kill(e: Enemy, tw?: Tower) {
  if (!M) return;
  M.enemies.splice(M.enemies.indexOf(e), 1);
  vanish(e.id, e.flying ? 5 : 3, e.boss ? 24 : 18);   // it topples (or falls from the air) and fades
  let cash = e.cash;
  if (tw && M.players.includes(tw.owner)) { const N = skEvery(tw.owner, 'Scavenger'); if (N && (pst(tw.owner).kills + 1) % N === 0) cash = Math.floor(cash * (skillDef.get('Scavenger')?.mult ?? 1.5)); }
  if (!e.every) give(tw, cash);
  if (e.bounty) { const b = towerById(e.bounty.tw), bonus = Math.min(e.bounty.cap, Math.floor(e.cash * e.bounty.pct)); if (b && bonus > 0) { pay(b.owner, bonus); log('bounty', { id: e.id, name: e.name, tower: b.id, bonus }); } }
  if (e.wire) { const b = towerById(e.wire.tw), bonus = Math.floor(e.cash * e.wire.pct); if (b && bonus > 0) pay(b.owner, bonus); }
  M.stats.kills++;
  if (tw && M.players.includes(tw.owner)) { const s = pst(tw.owner); s.kills++; s.killsBy[tw.name] = (s.killsBy[tw.name] ?? 0) + 1; }
  if (e.boss) for (const n of M.players) pst(n).bosses.push(e.name);
  if (M.hidden && e.name === modes[M.mode].hidden?.king && e.wave === modes[M.mode].waves) M.hidden.kingDead = M.t;
  for (const f of hooks.kill) f(e, tw);
  const def = enemies[e.name];
  for (const a of def?.abilities ?? []) if (a.kind === 'deathSpawn' || a.onDeath) useAbility(e, a);
  for (const a of def?.abilities ?? []) if (a.kind === 'deathRandom') {   // turns into / spawns random enemies of its kind's pool
    const pool = (def!.spawns?.length ? def!.spawns : Object.keys(enemies).filter((n) => enemies[n].per[M!.mode] && !enemies[n].boss)).filter((n) => enemies[n]);
    for (let i = 0; i < (a.n ?? 1) && pool.length; i++) spawnEnemy(pool[Math.floor(rand() * pool.length)], [], Math.max(0, e.d - i * 0.6), e.wave, true);
  }
  if (mod('Exploding Enemies')) { const f = near(e, 6); for (const t of M.towers) if (f(t)) stunTower(t, 1); for (const u of M.units) if (Math.abs(u.d - e.d) <= 6) u.hp -= 20; }   // like a Boomer: 1 s stun, 20 damage to units
  for (const o of M.enemies) for (const a of enemies[o.name]?.abilities ?? []) if (a.kind === 'revive' && a.target === e.name && !o.rev) o.rev = { at: M.t + (a.dur ?? 10), name: e.name, hp: a.hp ?? e.max, d: e.d };
  if (def?.spawns && def.spawnMode === 'death') for (const c of def.spawns.slice(0, 1)) for (let i = 0; i < RULES.childCount; i++) spawnEnemy(c, [], Math.max(0, e.d - i * 1.5), e.wave, true);
  log('enemy_kill', { id: e.id, name: e.name, by: tw?.id ?? null, d: +e.d.toFixed(1) });
}
/** Enemy cash (mode pages): the same amount whoever dealt the damage, split evenly between the players (.5 rounds up). */
function give(_tw: Tower | undefined, amount: number) {
  if (!M || amount <= 0) return;
  const share = cashShare(amount, M.players.length);
  for (const n of M.players) pay(n, share);
}

/** One hit on an enemy; returns damage done to health+shield. Defense reduces, shield first, boss cash per % lost. */
export function hit(e: Enemy, dmg: number, tw?: Tower, kind: 'direct' | 'splash' | 'dot' | 'true' = 'direct'): number {
  if (!M || e.hp <= 0) return 0;
  if (kind === 'splash' && e.immune.includes('Splash Damage')) return 0;
  const taken = benchMode ? 1 : 1 + ((e.neural ?? 0) > M.t ? e.neuralPct ?? 0 : 0) + ((e.vuln ?? 0) > M.t ? e.vulnPct ?? 0 : 0);   // Neuralyzed / vulnerability: more damage taken (not on the bench: it measures the tower's own damage)
  let d = kind === 'true' ? dmg * taken : afterDefense(dmg * taken, Math.max(0, e.def)), done = 0;
  if (e.mods.includes('Tank') && kind !== 'dot') d = Math.min(d, 1);   // Tank attribute: most damage becomes 1
  if (e.shield > 0) { const s = Math.min(e.shield, d); e.shield -= s; d -= s; done += s; if (e.shield <= 0 && e.lead) { e.lead = false; log('lead_broken', { id: e.id }); } if (e.shield <= 0 && e.flying && e.name === 'Balloon') { e.flying = false; } if (e.shield <= 0) { const ns = enemyIn(e.name, M.mode).speedNoShield; if (ns) { e.speed = ns * (e.mods.includes('Nimble') ? 2 : 1); log('shield_broken', { id: e.id, name: e.name, speed: e.speed }); } } }
  const before = e.hp; e.hp = Math.max(0, e.hp - d); done += before - e.hp;
  if (e.every) { const steps = Math.floor(((e.max - e.hp) / e.max) * 100 / e.every); while (e.paid < steps) { e.paid++; give(tw, e.cash); } }
  if (tw) { tw.dealt += done; M.stats.dealt += done; if (M.players.includes(tw.owner)) { const s = pst(tw.owner).dmg; s[tw.name] = (s[tw.name] ?? 0) + done; } }
  label(e);
  if (e.hp <= 0) kill(e, tw);
  return done;
}

// ---------- enemy abilities (parsed from the wiki infobox) ----------
const near = (e: Enemy, r: number) => { const p = path!.at(e.d); return (tw: { x: number; z: number }) => Math.hypot(p.x - (tw.x + 0.5), p.z - (tw.z + 0.5)) / path!.stud <= r; };
function spawnList(e: Enemy, list: Spawn[]) {
  let k = 0;
  for (const s of list) for (let i = 0; i < s.n; i++) { const name = s.pool ? s.pool[Math.floor(rand() * s.pool.length)] : s.name!; if (enemies[name]) spawnEnemy(name, [], Math.max(0, e.d - 0.6 * k++), e.wave, true); }
}
export function useAbility(e: Enemy, a: Ability) {
  if (!M || !path) return;
  act(e.id, 'animation.tds_look.cast');   // it rears back and slams its arms down
  if (a.kind === 'deathSpawn' || a.kind === 'summon') spawnList(e, a.spawn ?? []);
  if (a.kind === 'stun') { const f = near(e, a.radius ?? 12); for (const tw of M.towers) if (f(tw)) stunTower(tw, a.dur ?? 3); }
  if (a.kind === 'debuff') { const f = near(e, a.radius ?? 12); for (const tw of M.towers) if (f(tw)) { tw.fat = Math.max(tw.debUntil! > M.t ? tw.fat ?? 0 : 0, (a.fatigue ?? 0) / 100); tw.rdeb = Math.max(tw.debUntil! > M.t ? tw.rdeb ?? 0 : 0, (a.range ?? 0) / 100); tw.debUntil = M.t + (a.dur ?? 10) * ec(tw); } }
  if ((a.kind === 'stun' || a.kind === 'debuff') && a.unitDmg) for (const u of M.units) if (Math.abs(u.d - e.d) <= (a.radius ?? 12)) u.hp -= a.unitDmg;
  if (a.kind === 'freezeTower') {   // frozen towers stop like stunned ones (Ubercharge protects)
    const f = near(e, a.radius ?? 12); let n = 0;
    for (const tw of M.towers) { if (a.max && n >= a.max) break; if (f(tw) && stunTower(tw, a.dur ?? 3, 'freeze')) n++; }
    if (a.unitDmg) for (const u of M.units) if (Math.abs(u.d - e.d) <= (a.radius ?? 12)) u.hp -= a.unitDmg;
  }
  if (a.kind === 'unitBlast') for (const u of M.units) if (Math.abs(u.d - e.d) <= (a.radius ?? 6)) u.hp -= a.unitDmg ?? 0;
  if (a.kind === 'healZone') ezones.push({ d: e.d, r: a.radius ?? 4, amount: a.amount ?? 0, every: a.every ?? 1, next: M.t, until: M.t + (a.dur ?? 5) });
  if (a.kind === 'gift') for (const o of M.enemies) if (o !== e && Math.abs(o.d - e.d) <= (a.radius ?? 6)) {   // the attribute pages' effects
    const k = a.attrs?.[Math.floor(rand() * (a.attrs?.length ?? 1))];
    if (k === 'Bloated' && !o.mods.includes('Bloated')) { o.mods.push('Bloated'); o.hp *= 2; o.max *= 2; }
    if (k === 'Blessed' && !o.mods.includes('Blessed')) { o.mods.push('Blessed'); o.def += 100; o.baseDef = (o.baseDef ?? 0) + 100; }
    if (k === 'Aggro') o.aggro = true;
    label(o);
  }
  if (a.kind === 'speedAura') for (const o of M.enemies) if (o !== e && Math.abs(o.d - e.d) <= (a.radius ?? 6)) { o.haste = (a.pct ?? 0) / 100; o.hasteUntil = M.t + (a.dur ?? 10); }
  if (a.kind !== 'boneArmor' && a.kind !== 'heal') log('ability', { id: e.id, name: e.name, ability: a.title, kind: a.kind });
}
function enemyAbilities(e: Enemy) {
  if (!M) return;
  const list = enemies[e.name]?.abilities ?? [];
  list.forEach((a, i) => {
    if (a.kind === 'phase') {   // a health threshold changes the enemy once
      if (e.ph?.includes(i) || !((a.at != null && e.hp <= e.max * a.at) || (a.atHp != null && e.hp <= a.atHp))) return;
      (e.ph ??= []).push(i); act(e.id, 'animation.tds_look.cast');
      if (a.hidden) { e.hidden = true; try { ents.get(e.id)?.addEffect('invisibility', 20000000, { showParticles: false }); } catch { /* unloaded */ } }
      if (a.speed) e.speed = a.speed * (e.mods.includes('Nimble') ? 2 : 1);
      if (a.aggro) e.aggro = true;
      if (a.shield) e.shield += a.shield;
      if (a.stop) e.stunUntil = Math.max(e.stunUntil, M!.t + a.stop);
      label(e); log('phase', { id: e.id, name: e.name, phase: a.title, hp: Math.round(e.hp) }); return;
    }
    if (a.kind === 'revive' || a.kind === 'deathRandom') return;
    if (a.kind === 'boneArmor') { const lost = 1 - e.hp / e.max; e.def = Math.max(e.def, Math.min(Math.max(a.max ?? 60, e.baseDef ?? 0), (e.baseDef ?? 0) + (a.step ?? 15) * Math.floor(lost / 0.2))); return; }
    if (a.kind === 'heal') { if ((e.abil![i] === Infinity ? (e.abil![i] = M!.t) : e.abil![i]) <= M!.t) { e.abil![i] = M!.t + (a.every ?? 1); for (const o of M!.enemies) if (o !== e && Math.abs(o.d - e.d) <= (a.radius ?? 8)) { o.hp = Math.min(o.max, o.hp + (a.amount ?? 0)); label(o); } } return; }
    if (a.onDeath || a.kind === 'deathSpawn' || !e.abil || M!.t < e.abil[i]) return;
    e.abil[i] = M!.t + (a.cd ?? 10); useAbility(e, a);
  });
  if (e.regen !== undefined && M.t >= e.regen) { e.regen = M.t + 2; e.hp = Math.min(e.max, e.hp + e.max * 0.02); label(e); }
  if (e.rev && M.t >= e.rev.at) { const r = e.rev; e.rev = undefined; spawnEnemy(r.name, [], r.d, e.wave, true); const o = M.enemies[M.enemies.length - 1]; if (o?.name === r.name) { o.hp = o.max = r.hp; label(o); } log('revive', { by: e.name, name: r.name, hp: r.hp }); }
}

/** an enemy stuns a tower (immune towers, Medic shields and Ubercharge protect; Extreme Conditioning shortens it) */
export function stunTower(tw: Tower, dur: number, kind: 'stun' | 'freeze' = 'stun') {
  if (!M || (kind === 'stun' && /Stun/.test(towers[tw.name]?.immune ?? '')) || (kind === 'freeze' && /Freeze/.test(towers[tw.name]?.immune ?? ''))) return false;
  for (const g of hooks.guard) if (g(tw, kind)) return false;
  tw.stunUntil = Math.max(tw.stunUntil ?? 0, M.t + dur * ec(tw)); tw.stunKind = kind; return true;
}

// ---------- towers ----------
/** towers that see hidden enemies only close to them (Ace Pilot: Hidden Detection Range) */
const seesHiddenNear = (tw: Tower, e: Enemy) => { const r = Number(towers[tw.name].levels[tw.lvl]?.hiddenDetectionRange); return r > 0 && distTo(tw, e) <= r; };
export function canSee(tw: Tower, e: Enemy) {
  const d = towers[tw.name].detect;
  if (e.hidden && !(d.hidden !== null && tw.lvl >= d.hidden) && !seesHiddenNear(tw, e)) return false;
  if (e.lead && !(d.lead !== null && tw.lvl >= d.lead)) return false;
  if (e.flying && !(d.flying !== null && tw.lvl >= d.flying)) return false;
  return true;
}
const bcache = new Map<number, { at: number; v: { fr: number; dm: number; rg: number } }>();
export const dropBuffs = () => bcache.clear();
const buffs = (tw: Tower) => {
  const c = bcache.get(tw.id); if (c && M && Math.abs(M.t - c.at) < 1) return c.v;
  const v = buffs0(tw); if (M) bcache.set(tw.id, { at: M.t, v }); return v;
};
const buffs0 = (tw: Tower) => {
  let fr = 0, dm = 0, rg = 0;
  if (!M || !path) return { fr, dm, rg };
  for (const o of M.towers) {
    if (o === tw) continue; const s = stats(o.name, o.lvl), L = towers[o.name].levels[o.lvl] ?? {};
    const cdb = Number(L.coordinationDamageBoost);   // Operator: damage boost around it
    if (cdb > 0 && Math.hypot(o.x - tw.x, o.z - tw.z) / path.stud <= (Number(L.coordinationRadius) || s.range)) dm = Math.max(dm, cdb / 100);
    if (!s.frBuff && !s.dmgBuff && !s.rangeBuff) continue;
    if (Math.hypot(o.x - tw.x, o.z - tw.z) / path.stud > s.range) continue;
    if (o.name === 'Medic') {   // the Medic buffs only the towers it is assigned to; its damage buff is for Ubercharge
      if (!(o.st?.as as number[] | undefined)?.includes(tw.id)) continue;
      fr = Math.max(fr, s.frBuff ?? 0); if ((o.st?.uber ?? 0) > M.t) dm = Math.max(dm, s.dmgBuff ?? 0); continue;
    }
    const cta = (o.ctaUntil ?? 0) > M.t ? o.ctaBuff ?? 0 : 0;
    fr = Math.max(fr, (s.frBuff ?? 0) + cta); dm = Math.max(dm, s.dmgBuff ?? 0); rg = Math.max(rg, s.rangeBuff ?? 0);
  }
  return { fr, dm, rg };
};
export function eff(tw: Tower): Stats & { range: number } {
  const s = stats(tw.name, tw.lvl), b = buffs(tw), deb = M && (tw.debUntil ?? 0) > M.t, f = deb ? tw.fat ?? 0 : 0, rd = deb ? tw.rdeb ?? 0 : 0;
  const self = M && (tw.selfBuffUntil ?? 0) > M.t ? tw.selfBuff ?? 0 : 0;
  let fr = s.fr ? s.fr / (1 + b.fr + self) : s.fr; if (fr && f) fr = fr + fr * (f / (1 + f));   // Fatigue Debuff page
  const optics = 1 + skv(tw.owner, 'Enhanced Optics') / 100, gun = 1 + skv(tw.owner, 'Improved Gunpowder') / 100;
  const rb = M && (tw.st?.rgUntil ?? 0) > M.t ? tw.st!.rgPct ?? 0 : 0, mul = (tw.st?.dmgMul as number | undefined) ?? 1;   // Ranger's range buff; holograms deal a share of the damage
  const sr = mod('Fog') ? Math.round(s.range * 0.65) : s.range;   // Fog: base range × 0.65, rounded
  const range = (rd ? sr * (1 - (rd - b.rg)) : sr * (1 + b.rg + rb)) * optics;   // Range Debuff page
  return { ...s, dmg: s.dmg * (1 + b.dm) * mul, fr, range, splash: s.splash ? s.splash * gun : s.splash };
}
export const origin = (tw: Tower) => (!benchMode && hooks.origin[tw.name]?.(tw)) || { x: tw.x + 0.5, z: tw.z + 0.5 };
export const epos = (e: Enemy) => { if (e.x === undefined) { const p = path!.at(e.d); e.x = p.x; e.z = p.z; } return { x: e.x, z: e.z! }; };
export const distTo = (tw: Tower, e: Enemy) => { const p = epos(e), o = origin(tw); return Math.hypot(p.x - o.x, p.z - o.z) / path!.stud; };

/** Path intervals (studs) inside a tower's range, so a scan skips enemies by their path distance alone. */
const covers = new Map<string, [number, number][]>();
export function cover(tw: Tower, range: number) {
  const k = `${tw.id}:${tw.x}:${tw.z}:${range.toFixed(3)}`; let c = covers.get(k); if (c) return c;
  c = []; const p = path!, st = 0.25; let open: number | undefined;
  for (let d = 0; d <= p.len + st; d += st) {
    const q = p.at(d), inside = Math.hypot(q.x - tw.x - 0.5, q.z - tw.z - 0.5) / p.stud <= range + 0.3;
    if (inside && open === undefined) open = Math.max(0, d - st); if (!inside && open !== undefined) { c.push([open, d]); open = undefined; }
  }
  if (open !== undefined) c.push([open, p.len]);
  if (covers.size > 2000) covers.clear(); covers.set(k, c); return c;
}
export function pick(tw: Tower, range: number, dz = 0): Enemy | undefined {
  let best: Enemy | undefined, bv = -Infinity; const c: Enemy[] = []; const moving = !benchMode && !!hooks.origin[tw.name], iv = moving ? [] : cover(tw, range);
  for (const e of M!.enemies) {
    let inIv = moving; for (const [a, b] of iv) if (e.d >= a && e.d <= b) { inIv = true; break; }
    if (!inIv || e.hp <= 0 || !canSee(tw, e)) continue; const dd = distTo(tw, e); if (dd > range || dd < dz) continue;
    const v = (e.aggro || (e.neural ?? 0) > M!.t ? 1e12 : 0) + (tw.target === 'First' ? e.d : tw.target === 'Last' ? -e.d : tw.target === 'Strongest' ? e.hp + e.shield : tw.target === 'Weakest' ? -(e.hp + e.shield) : tw.target === 'Closest' ? -dd : tw.target === 'Farthest' ? dd : 0);
    if (tw.target === 'Random') c.push(e); else if (v > bv) { bv = v; best = e; }
  }
  return tw.target === 'Random' ? c[Math.floor(rand() * c.length)] : best;
}

function fire(tw: Tower, s: ReturnType<typeof eff>, e: Enemy) {
  if (!M || !path) return;
  const hits: Enemy[] = [e];
  if (s.splash) { for (const o of M.enemies) if (o !== e && hits.length < Math.max(s.maxHits, 999) && canSee(tw, o) && Math.abs(o.d - e.d) <= s.splash) hits.push(o); }
  else if (s.chain) { let cur = e; while (hits.length < s.maxHits) { let nx: Enemy | undefined, nd = Infinity; for (const o of M.enemies) { if (hits.includes(o) || !canSee(tw, o)) continue; const dd = Math.abs(o.d - cur.d); if (dd <= s.chain && dd < nd) { nd = dd; nx = o; } } if (!nx) break; hits.push(nx); cur = nx; } }
  else if (s.maxHits > 1) { for (const o of M.enemies) if (o !== e && hits.length < s.maxHits && canSee(tw, o) && Math.abs(o.d - e.d) <= (s.hitbox ?? 2) && distTo(tw, o) <= s.range) hits.push(o); }
  if (s.splash && s.maxHits > 1) hits.length = Math.min(hits.length, s.maxHits);
  let per = s.dmg * s.pellets; const F = fd(tw);
  const N = skEvery(tw.owner, 'Precision'); if (N) { tw.st ??= {}; tw.st.pn = (tw.st.pn ?? 0) + 1; if (tw.st.pn % N === 0) per *= skillDef.get('Precision')?.mult ?? 1.25; }   // every Nth shot is a critical hit
  for (const h of hits) {
    if (h.hp <= 0) continue;
    if (s.melt) h.def = Math.max(s.meltCap ? Math.max(0, (h.baseDef ?? h.def) - s.meltCap) : 0, h.def - s.melt);
    const done = hit(h, per, tw, s.splash && h !== e ? 'splash' : 'direct');
    if (h === e) tw.primary += done;
    if (h.hp <= 0) continue;
    if (s.burn && !h.immune.includes('Burn')) h.dots.push({ dmg: s.burn[0], tick: s.burn[1], next: M.t + s.burn[1], until: M.t + s.burn[2] * F, tw: tw.id, kind: 'burn' });
    if (s.poison) h.dots.push({ dmg: s.poison[0], tick: s.poison[1], next: M.t + s.poison[1], until: M.t + s.poison[2] * F, tw: tw.id, kind: 'poison' });
    if (s.poison) mark(tw, 'Poison');
    if (s.slowHit && !h.boss && !h.immune.includes('Slowed')) { h.slow = Math.min(s.slowMax ?? s.slowHit, h.slow + s.slowHit); h.slowUntil = M.t + (s.slowTime ?? 2) * F; mark(tw, 'Frost'); }
    if (s.freeze && !h.boss && !h.immune.includes('Freeze') && h.slow >= (s.slowMax ?? 1)) { h.freezeUntil = M.t + s.freeze * F; mark(tw, 'Freeze'); const q = epos(h); fx('freeze', q.x, path.floor + 0.3, q.z); }
    if (s.stun && !h.boss && !h.immune.includes('Stun')) { h.stunUntil = Math.max(h.stunUntil, M.t + s.stun * F); mark(tw, 'Shock'); }
  }
  if (s.cashShot && s.income && ++tw.shots % s.cashShot === 0) { pay(tw.owner, s.income); M.stats.income += s.income; log('income', { tower: tw.id, name: tw.name, amount: s.income }); }
  for (const f of hooks.fire) f(tw, s, e, hits);
  beam(tw, e, hits.length);
}

/** one attack of a tower on a target (its statuses, splash, chain and the fire hooks) */
export const shoot = (tw: Tower, s: ReturnType<typeof eff>, e: Enemy) => fire(tw, s, e);
/** a small effect (the pack's particles; vanilla ones when the pack has none) */
let ownFx = true;
const FX: Record<string, [string, string]> = { hit: ['tds:hit', 'minecraft:basic_crit_particle'], boom: ['tds:boom', 'minecraft:large_explosion'], freeze: ['tds:freeze', 'minecraft:snowflake_particle'], heal: ['tds:heal', 'minecraft:villager_happy'] };
export function fx(kind: keyof typeof FX, x: number, y: number, z: number) {
  if (headless || simSpeed() > 1) return;
  const d = dim();
  try { d.spawnParticle(ownFx ? FX[kind][0] : FX[kind][1], { x, y, z }); } catch { if (ownFx) { ownFx = false; try { d.spawnParticle(FX[kind][1], { x, y, z }); } catch { /* unloaded */ } } }
}
function beam(tw: Tower, e: Enemy, n: number) {
  if (!path || headless || simSpeed() > 1) return;
  const p = path.at(e.d), d = dim(), y = path.floor + (e.flying ? 2.7 : 0.3);
  fx(n > 1 ? 'boom' : 'hit', p.x, y, p.z);
  look(tw, e);
}
/** The tower's model turns to its target like the original: tds:yaw is the yaw a mob standing on the tower would have
 * facing the enemy (the client entity turns the turret bone by it), and each shot plays the recoil (throttled). */
const aimed = new Map<number, number>(), kicked = new Map<number, number>();
function look(tw: Tower, e: Enemy) {
  const ent = ents.get(-tw.id); if (!ent?.isValid) return;
  const q = epos(e), yaw = Math.round((Math.atan2(-(q.x - tw.x - 0.5), q.z - tw.z - 0.5) * 180) / Math.PI + 360) % 360, last = aimed.get(tw.id);
  if (last === undefined || Math.abs(((yaw - last + 540) % 360) - 180) >= 3) { try { ent.setProperty('tds:yaw', yaw); aimed.set(tw.id, yaw); } catch { /* older pack */ } }
  const now = Date.now();
  const shot = towerLook(tw.name)[2];
  if (shot && now - (kicked.get(tw.id) ?? 0) >= 150) { kicked.set(tw.id, now); try { ent.playAnimation(`animation.tds_tower.${shot}`); } catch { /* unloaded */ } }
}

/** towers whose units come only with an ability (the Commander's APCs: Support Caravan), never on a spawn timer */
const BY_ABILITY = new Set(['Commander']);
function towerStep(tw: Tower, dt: number) {
  if (!M || !path) return;
  if (tw.temp !== undefined && M.t >= tw.temp) { removeTower(tw, 'expired'); return; }
  const s0 = stats(tw.name, tw.lvl);
  if (M.t < (tw.stunUntil ?? 0)) { tw.next = Math.max(tw.next, tw.stunUntil!); return; }
  const sp = !benchMode && hooks.towerStep[tw.name]; if (sp && sp(tw, dt)) return;
  // units: the tower row's Spawnrate, else the unit's own (Units page)
  const ud = tw.temp === undefined && !BY_ABILITY.has(tw.name) ? unitsFor(tw.name, tw.lvl, maxLevel(tw.name))[0] : undefined, rate = s0.spawnrate ?? ud?.[1].spawnrate ?? undefined;
  const spawns = !!rate && (!!s0.unitHp || !!ud);
  if (M.t < tw.next && !(spawns && M.t >= tw.nextUnit)) return;
  if (!M.enemies.length && !spawns) { tw.next = M.t; return; }
  const s = eff(tw);
  if (spawns && M.t >= tw.nextUnit) {
    tw.nextUnit = M.t + rate! * Math.max(0.1, 1 - skv(tw.owner, 'Expanded Barracks') / 100);
    const q = Math.max(1, s0.unitQueue ?? 1), mine = M.units.filter((u) => u.tw === tw.id).length;
    for (let i = 0; i < q && mine + i < RULES.unitMax * q; i++) spawnUnit(tw, ud?.[0], { hp: s0.unitHp, dmg: s0.unitHp ? s0.unitDmg ?? 1 : undefined });
  }
  if (!s.fr || !s.dmg) return;
  let guard = 0;
  while (M.t >= tw.next && guard++ < 50) {
    const e = pick(tw, s.range, s.deadzone ?? 0); if (!e) { tw.next = M.t + 0.1; return; }
    if (s.rev && !benchMode && M.t - (tw.st?.last ?? -99) > 1) { (tw.st ??= {}).last = M.t; tw.next = M.t + s.rev; return; }   // Rev-Up Time after a pause
    fire(tw, s, e); (tw.st ??= {}).last = M.t;
    let gap = s.fr;
    if (s.burst && s.burst > 1) { tw.burstLeft = (tw.burstLeft || s.burst) - 1; if (tw.burstLeft === 0) gap += s.burstCd ?? 0; }
    if (s.ammo && s.reload) { tw.ammoLeft = (tw.ammoLeft || s.ammo) - 1; if (tw.ammoLeft === 0) { gap += s.reload; if (s.reload >= 0.5) act(-tw.id, 'animation.tds_tower.reload'); } }
    tw.next += gap;
  }
  void dt;
}

/** a unit sent by a tower (Units page stats; the tower row's health and damage first). opts: d (where), stationary, until, ... */
export function spawnUnit(tw: Tower, name: string | undefined, o: Partial<Unit> = {}): Unit | undefined {
  if (!M || !path) return;
  const u0 = name ? units[name] : undefined, boost = 1 + skv(tw.owner, 'Beefed Up Minions') / 100;
  const hp = (o.hp ?? u0?.hp ?? 10) * boost, det = u0?.detect;
  const u: Unit = { id: M.seq++, tw: tw.id, kind: name, d: o.d ?? path.len, hp, max: hp, dmg: o.dmg ?? u0?.dmg ?? 0, next: M.t + (o.next ?? 0), fr: o.fr ?? u0?.fr ?? undefined, range: o.range ?? (u0?.range || undefined),
    speed: o.speed ?? (u0 ? u0.speed : RULES.unitSpeed), stationary: o.stationary ?? u0?.stationary ?? false, until: o.until ?? (u0?.lifespan ? M.t + u0.lifespan : undefined),
    splash: o.splash ?? u0?.splash ?? undefined, splashDmg: o.splashDmg ?? u0?.splashDmg ?? undefined, burst: o.burst ?? u0?.burst ?? undefined, burstCd: o.burstCd ?? u0?.burstCd ?? undefined,
    collide: o.collide ?? (u0 ? u0.collision : true), explode: o.explode, slow: o.slow, slowTime: o.slowTime, freezeEvery: o.freezeEvery,
    detect: o.detect ?? { hidden: det?.hidden != null && tw.lvl >= det.hidden, lead: det?.lead != null && tw.lvl >= det.lead, flying: det?.flying != null && tw.lvl >= det.flying } };
  if (u.stationary && u.speed) u.speed = 0;
  M.units.push(u); log('unit_spawn', { tower: tw.id, hp: Math.round(hp * 100) / 100, unit: name ?? null });
  if (!headless && simSpeed() <= 1) { const te = ents.get(-tw.id); if (te?.isValid) try { te.playAnimation('animation.tds_tower.spawn'); } catch { /* unloaded */ } }   // the barracks door opens
  return u;
}
/** take a tower off the field (sold, expired hologram) */
export function removeTower(tw: Tower, why = 'removed') {
  if (!M) return; const i = M.towers.indexOf(tw); if (i < 0) return;
  M.towers.splice(i, 1); M.units = M.units.filter((u) => u.tw !== tw.id);
  if (why === 'sold' || why === 'expired') vanish(-tw.id, 3, 6); else { const e = ents.get(-tw.id); if (e?.isValid) e.remove(); ents.delete(-tw.id); shown.delete(-tw.id); }
  dropBuffs();
  if (why !== 'sold') log('tower_remove', { id: tw.id, name: tw.name, why });
}
/** whether a tower of this kind could stand on a block (surface, path, overlap); undefined = yes */
export function canStand(name: string, x: number, y: number, z: number, ignore?: Tower): string | undefined {
  if (!M || !path) return 'no match';
  const def = towers[name]; if (!def) return `unknown tower ${name}`;
  const r = (foot(name) / 2) * path.stud, sf = surface(x, y, z);
  if (!sf) return 'not placeable here';
  if (def.placement !== 'both' && def.placement !== sf) return `${def.placement} only`;
  if (sf === 'ground' && path.dist(x + 0.5, z + 0.5) < path.width / 2 + r) return 'on the path';
  for (const o of M.towers) if (o !== ignore && o.temp === undefined && Math.hypot(o.x - x, o.z - z) < r + (foot(o.name) / 2) * path.stud) return `overlaps #${o.id}`;
}
/** move a placed tower (Brawler's Reposition, Enforcer's helicopter) */
export function moveTower(tw: Tower, x: number, y: number, z: number): string | undefined {
  const why = canStand(tw.name, x, y, z, tw); if (why) return why;
  tw.x = x; tw.y = y; tw.z = z; dropBuffs();
  const e = ents.get(-tw.id); try { if (e?.isValid) e.teleport({ x: x + 0.5, y, z: z + 0.5 }); } catch { /* unloaded */ }
  log('tower_move', { id: tw.id, name: tw.name, x, y, z }); persist();
}
/** a copy of a tower for a while (Hacker's Hologram Tower): same kind and level, a share of the damage */
export function cloneTower(src: Tower, owner: string, until: number, dmgMul: number): Tower | undefined {
  if (!M) return;
  const tw: Tower = { ...src, id: M.seq++, owner, next: M.t, burstLeft: 0, ammoLeft: 0, shots: 0, spent: 0, dealt: 0, nextUnit: Infinity, primary: 0, abReady: {}, st: { dmgMul }, temp: until, x: src.x + 1, z: src.z };
  M.towers.push(tw); body(tw); log('tower_clone', { id: tw.id, of: src.id, name: src.name, until: +until.toFixed(1) }); return tw;
}
/** a player's placement limit for a tower: the page's limit (halved by Limitation Makes Creativity) + Re-enforcements; 0 = none */
export function limitFor(owner: string, name: string) { const def = towers[name]; return def?.limit ? (mod('Limitation Makes Creativity') ? Math.max(1, Math.floor(def.limit * 0.5)) : def.limit) + extraLimit(owner) : 0; }
export const towersNear = (x: number, z: number, r: number) => (M && path ? M.towers.filter((t) => Math.hypot(t.x - x, t.z - z) / path!.stud <= r) : []);

export type PlaceResult = { ok: true; tower: Tower } | { ok: false; why: string };
export function place(p: Player | string, name: string, x: number, y: number, z: number, free = false): PlaceResult {
  if (!M || !path) return { ok: false, why: 'no match' };
  const owner = typeof p === 'string' ? p : p.name, def = towers[name];
  if (!def) return { ok: false, why: `unknown tower ${name}` };
  if ((name === 'Farm' && mod('Farm Banned')) || (name === 'Gatling Gun' && mod('Gatling Gun Banned'))) return { ok: false, why: `${name} is banned` };
  const cost = infl(placeCost(name)); if (!Number.isFinite(cost)) return { ok: false, why: 'no cost' };
  if (!free && (M.cash[owner] ?? 0) < cost) return { ok: false, why: `need $${cost}` };
  const lim = limitFor(owner, name);
  if (lim && M.towers.filter((t) => t.name === name && t.owner === owner && t.temp === undefined).length >= lim) return { ok: false, why: `limit ${lim}` };
  const r0 = (foot(name) / 2) * path.stud;
  if (y === maps[M.map].y && path.dist(x + 0.5, z + 0.5) < path.width / 2 + r0) return { ok: false, why: 'on the path' };
  const sf = surface(x, y, z);
  if (!sf) return { ok: false, why: 'not placeable here' };
  if (def.placement !== 'both' && def.placement !== sf) return { ok: false, why: `${def.placement} only` };
  const r = (foot(name) / 2) * path.stud;
  if (sf === 'ground' && path.dist(x + 0.5, z + 0.5) < path.width / 2 + r) return { ok: false, why: 'on the path' };
  for (const o of M.towers) if (o.temp === undefined && Math.hypot(o.x - x, o.z - z) < r + (foot(o.name) / 2) * path.stud) return { ok: false, why: `overlaps #${o.id}` };
  if (!free) M.cash[owner] -= cost;
  const tw: Tower = { id: M.seq++, name, lvl: 0, x, y, z, owner, target: 'First', next: M.t, burstLeft: 0, ammoLeft: 0, shots: 0, spent: cost, dealt: 0, nextUnit: M.t, primary: 0 };
  M.towers.push(tw); body(tw);
  if (M.players.includes(owner) && !pst(owner).placed.includes(name)) pst(owner).placed.push(name);
  log('tower_place', { id: tw.id, name, x, y, z, cost, owner }); persist();
  return { ok: true, tower: tw };
}
function body(tw: Tower) {
  try {
    const e = dim().spawnEntity('tds:tower' as any, { x: tw.x + 0.5, y: tw.y, z: tw.z + 0.5 });
    const lk = towerLook(tw.name);
    e.setProperty('tds:skin', lk[0]); try { e.setProperty('tds:size', lk[1]); e.setProperty('tds:holo', tw.temp !== undefined); e.setProperty('tds:lvl', Math.min(7, tw.lvl)); } catch { /* older pack */ }
    e.setDynamicProperty('tds:id', tw.id); ents.set(-tw.id, e); shown.delete(-tw.id); aimed.delete(tw.id); tlabel(tw);
  } catch { /* unloaded */ }
}
export function tlabel(tw: Tower) { const e = ents.get(-tw.id); if (e?.isValid) { e.nameTag = `§e#${tw.id} §f${tw.name}\n§bLv${tw.lvl} §7${tw.target}`; try { e.setProperty('tds:lvl', Math.min(7, tw.lvl)); } catch { /* older pack */ } } }
export const towerById = (id: number) => M?.towers.find((t) => t.id === id);

export function upgrade(owner: string, id: number): string {
  const tw = towerById(id); if (!M || !tw) return 'No such tower';
  if (tw.temp !== undefined) return 'Holograms cannot be upgraded';
  if (tw.lvl >= maxLevel(tw.name)) return 'Max level';
  const c = infl(levelCost(tw.name, tw.lvl + 1)); if ((M.cash[owner] ?? 0) < c) return `Need $${c}`;
  M.cash[owner] -= c; tw.lvl++; tw.spent += c; tlabel(tw);
  log('upgrade', { id, name: tw.name, lvl: tw.lvl, cost: c }); persist();
  return `${tw.name} → Lv${tw.lvl}`;
}
/** sell value: a third of what was spent; Resourcefulness adds 1.2 points per level (Skills page: ~34.53% at level 1) */
export const sellValue = (tw: Tower) => Math.floor(tw.spent * (RULES.sellRate + skv(tw.owner, 'Resourcefulness') / 100) + 1e-9);
export function sell(owner: string, id: number): string {
  const tw = towerById(id); if (!M || !tw) return 'No such tower';
  if (tw.temp !== undefined) return 'Holograms cannot be sold';
  if (mod('Committed')) return 'Selling is disabled (Committed)';
  const v = sellValue(tw); M.cash[owner] = (M.cash[owner] ?? 0) + v;
  M.towers.splice(M.towers.indexOf(tw), 1); M.units = M.units.filter((u) => u.tw !== id);
  const e = ents.get(-id); if (e?.isValid) e.remove(); ents.delete(-id);
  log('sell', { id, name: tw.name, value: v }); persist();
  return `Sold for $${v}`;
}
export function setTarget(id: number, t: string): string {
  const tw = towerById(id); if (!tw) return 'No such tower';
  if (!(TARGETS as readonly string[]).includes(t)) return `Targets: ${TARGETS.join(' ')}`;
  tw.target = t; tlabel(tw); log('target', { id, target: t }); return `#${id} → ${t}`;
}

// ---------- tower abilities (wiki {{Ability}} templates; each one is written in src/abilities.ts) ----------
export function abilitiesOf(tw: Tower) { return (towers[tw.name].abilities ?? []).filter((a) => a.simulated && tw.lvl >= a.unlock && !!hooks.ability[a.title] && tw.temp === undefined); }
export function abilityReady(tw: Tower, title: string) { return !M ? 0 : Math.max(0, (tw.abReady?.[title] ?? 0) - M.t); }
/** cooldown at the tower's level (some differ per level), shortened by the Accelerator skill */
export const cooldownOf = (tw: Tower, a: TowerAbility) => (a.cdBy?.[String(tw.lvl)] ?? a.cd ?? 30) * Math.max(0, 1 - skv(tw.owner, 'Accelerator') / 100);
/** the path distance nearest to a block (an ability's selected spot) */
export function nearestDAt(x: number, z: number) { let best = 0, bd = Infinity; for (let d = 0; d <= path!.len; d += 0.25) { const p = path!.at(d), k = Math.hypot(p.x - x - 0.5, p.z - z - 0.5); if (k < bd) { bd = k; best = d; } } return best; }
export function useTowerAbility(owner: string, id: number, title?: string, at?: { x: number; y: number; z: number }, target?: number): string {
  const tw = towerById(id); if (!M || !path || !tw) return 'No such tower';
  const a = abilitiesOf(tw).find((x) => !title || x.title === title); if (!a) return `${tw.name} has no usable ability at Lv${tw.lvl}`;
  const wait = abilityReady(tw, a.title); if (wait > 0) return `${a.title} ready in ${Math.ceil(wait)}s`;
  const cost = infl(a.cost); if ((M.cash[owner] ?? 0) < cost) return `Need $${cost}`;
  const lead = M.enemies.filter((e) => canSee(tw, e)).sort((x, y) => y.d - x.d)[0];
  const ctx: AbilityCtx = { tw, owner, a, L: towers[tw.name].levels[tw.lvl] as Record<string, unknown>, s: stats(tw.name, tw.lvl), lead, at, d: at ? nearestDAt(at.x, at.z) : lead?.d, target: target !== undefined ? towerById(target) : undefined };
  const what = hooks.ability[a.title](ctx);
  if (what.startsWith('!')) return what.slice(1);
  M.cash[owner] -= cost; (tw.abReady ??= {})[a.title] = M.t + cooldownOf(tw, a);
  if (M.players.includes(owner)) { const u = pst(owner).abil; u[tw.name] = (u[tw.name] ?? 0) + 1; }
  act(-tw.id, 'animation.tds_tower.ability');
  log('tower_ability', { id, name: tw.name, ability: a.title, cost, what });
  persist();
  return `${a.title}: ${what}`;
}

// ---------- simulation ----------
export const prof = { sim: 0, vis: 0, save: 0, n: 0, tw: 0 };
export const simSpeed = () => (world.getDynamicProperty('tds:speed') as number) ?? 1;
const DT = 0.05;
function step() {
  if (!M || !path || M.over) return;
  M.t += DT;
  if (!M.hold && M.inter && M.t >= M.waveEnd) nextWave();
  while (M.queue.length && M.queue[0].at <= M.t) { const q = M.queue.shift()!; spawnEnemy(q.name, q.mods); }
  for (const e of [...M.enemies]) {
    for (const o of [...e.dots]) { while (o.next <= M.t && o.next <= o.until && e.hp > 0) { hit(e, o.dmg, towerById(o.tw), 'dot'); o.next += o.tick; } if (o.next > o.until) e.dots.splice(e.dots.indexOf(o), 1); }
    if (e.hp <= 0) continue;
    if (e.slowUntil < M.t) e.slow = 0;
    enemyAbilities(e); if (e.hp <= 0) continue;
    const v = M.t < e.freezeUntil || M.t < e.stunUntil ? 0 : e.speed * (1 - e.slow) * (e.hasteUntil && M.t < e.hasteUntil ? 1 + (e.haste ?? 0) : 1);
    e.v = v;
    if (v) { e.d = Math.max(0, e.d + v * DT * (M.t < (e.conf ?? 0) ? -1 : 1)); e.x = undefined; }   // confused enemies walk back
    if (e.nextSummon !== undefined && M.t >= e.nextSummon) { e.nextSummon = M.t + RULES.summonEvery; const c = enemies[e.name].spawns![0]; for (let i = 0; i < RULES.childCount; i++) spawnEnemy(c, [], Math.max(0, e.d - 2 - i), e.wave, true); }
    if (e.d >= path.len) leak(e);
  }
  const ta = Date.now();
  for (const u of [...M.units]) unitStep(u);
  for (const tw of [...M.towers]) towerStep(tw, DT);
  for (const z of [...ezones]) { if (M.t >= z.until) { ezones.splice(ezones.indexOf(z), 1); continue; } if (M.t < z.next) continue; z.next = M.t + z.every; for (const o of M.enemies) if (Math.abs(o.d - z.d) <= z.r && o.hp < o.max) { o.hp = Math.min(o.max, o.hp + z.amount); label(o); } }
  for (const f of hooks.step) f();
  prof.tw += Date.now() - ta;
  if (!M || M.over) return;
  const md = modes[M.mode], last = lastWave();
  if (!M.sandbox && M.wave >= last && !M.inter && !M.enemies.length && !M.queue.length) {
    if (M.wave === md.waves && md.hidden && M.hidden?.armed && !M.hidden.on && hiddenReady()) {   // Hidden Wave page: base at 1 and the king beaten in time → wave 41
      M.hidden.on = true; log('hidden_wave', { baseHP: M.baseHP, king: +((M.hidden.kingDead ?? 0) - (M.hidden.kingAt ?? 0)).toFixed(1) }); endWave(true); return;
    }
    return end('win');
  }
  if (M.inter || M.wave === 0 || M.wave >= last) return;
  // a wave ends when its own enemies are gone (summoned and older ones do not count), its timer runs out, or a skip vote passes
  const own = M.enemies.some((e) => e.wave === M!.wave && !e.summoned) || M.queue.length > 0;
  if (!own || (!M.hold && M.t >= M.waveEnd)) endWave(!own);
}
function hiddenReady() {
  const hd = modes[M!.mode].hidden!, h = M!.hidden!;
  return M!.baseHP === hd.baseHP && h.kingAt !== undefined && h.kingDead !== undefined && h.kingDead - h.kingAt <= hd.kingWithin;
}
function endWave(cleared: boolean) {
  if (!M) return;
  const md = modes[M.mode], p = M.players.length, bonus = waveCash(M.mode, M.wave, p);
  const mine = (n: string) => Math.floor(bonus * (1 + skv(n, 'Stonks') / 100) + 1e-6);   // Stonks: each player's wave bonus multiplier
  for (const n of M.players) pay(n, mine(n));
  for (const tw of M.towers) { if (tw.temp !== undefined) continue; const s = stats(tw.name, tw.lvl); if (s.income && !s.cashShot) { pay(tw.owner, s.income); M.stats.income += s.income; log('income', { tower: tw.id, name: tw.name, amount: s.income }); } }
  log('wave_cash', { wave: M.wave, bonus });
  const pct = p > 1 ? md.clear.group : md.clear.solo;
  if (cleared && pct && !M.leakedThisWave && !(md.clear.noDamage && M.waveDmg)) { const b = Math.floor(bonus * pct + 1e-6); for (const n of M.players) pay(n, Math.floor(mine(n) * pct + 1e-6)); log('wave_clear', { wave: M.wave, bonus: b }); }
  for (const n of M.players) { const h = skv(n, 'Bandages'); if (h) healBase(h); }   // Bandages: base health per player each wave
  for (const f of hooks.waveEnd) f(cleared);
  M.inter = true; M.waveEnd = M.t + RULES.intermission;   // "a 5-second intermission will count down before the next wave begins"
}
const unitKick = new Map<number, number>();
function unitStep(u: Unit) {
  if (!M || !path) return;
  const tw = towerById(u.tw);
  if (!u.stationary) { u.d -= (u.speed ?? RULES.unitSpeed) * DT; }
  if (u.collide !== false) for (const e of M.enemies) {   // collision reaches hidden and lead enemies too (unit pages)
    if (Math.abs(e.d - u.d) > 1.5 || e.flying || e.hp <= 0) continue;
    const ram = Math.min(u.hp, e.hp + e.shield); u.hp -= ram; hit(e, ram, tw);
    if (u.hp <= 0) break;
  }
  if (u.hp > 0 && u.dmg > 0 && M.t >= u.next) {
    const rg = u.range || RULES.unitRange;
    const t = M.enemies.find((e) => e.hp > 0 && Math.abs(e.d - u.d) <= rg && (!e.hidden || !!u.detect?.hidden) && (!e.flying || !!u.detect?.flying));
    if (t) {
      if (u.splash) { for (const o of [...M.enemies]) if (Math.abs(o.d - t.d) <= u.splash && (!o.flying || !!u.detect?.flying)) hit(o, u.splashDmg ?? u.dmg, tw, o === t ? 'direct' : 'splash'); }
      else hit(t, u.dmg, tw);
      if (u.slow && t.hp > 0 && !t.boss && !t.immune.includes('Slowed')) { t.slow = Math.max(t.slow, u.slow); t.slowUntil = M.t + (u.slowTime ?? 2); mark(tw, 'Frost'); }
      u.shots = (u.shots ?? 0) + 1;
      const now = Date.now(); if (now - (unitKick.get(u.id) ?? 0) >= 120) { unitKick.set(u.id, now); act(u.id, 'animation.tds_look.shot'); }
      if (u.freezeEvery && u.shots % u.freezeEvery === 0 && t.hp > 0 && !t.boss && !t.immune.includes('Freeze')) { t.freezeUntil = M.t + 1; mark(tw, 'Freeze'); }
      let gap = u.fr ?? 1;
      if (u.burst && u.burst > 1) { u.burstLeft = (u.burstLeft || u.burst) - 1; if (u.burstLeft === 0) gap += u.burstCd ?? 0; }
      u.next = M.t + gap;
    }
  }
  const dead = u.hp <= 0, gone = (!u.stationary && u.d <= 0) || (u.until !== undefined && M.t >= u.until);
  if (dead && u.explode) for (const e of [...M.enemies]) if (Math.abs(e.d - u.d) <= 4) hit(e, u.explode, tw, 'splash');   // a van blows up when destroyed
  if (dead || gone) { M.units.splice(M.units.indexOf(u), 1); vanish(u.id, dead ? 3 : 4, dead ? 18 : 7); log('unit_end', { id: u.id, hp: Math.max(0, Math.round(u.hp)) }); }
}
function leak(e: Enemy) {
  if (!M) return;
  const dmg = Math.ceil(e.hp + e.shield); M.baseHP -= dmg; M.stats.leaks++; M.waveDmg = true; if (e.wave === M.wave) M.leakedThisWave = true;
  M.enemies.splice(M.enemies.indexOf(e), 1); vanish(e.id, 4, 7);   // into the base
  log('leak', { id: e.id, name: e.name, dmg, baseHP: Math.max(0, M.baseHP), took: +(M.t - (e.born ?? 0)).toFixed(2) });
  if (M.baseHP <= 0) end('lose');
}

export const onEnd: ((m: Match, r: 'win' | 'lose') => void)[] = [];
function end(r: 'win' | 'lose') {
  if (!M || M.over) return;
  M.over = r; M.baseHP = Math.max(0, M.baseHP);
  log('game_end', { result: r, mode: M.mode, wave: M.wave, baseHP: M.baseHP, ...M.stats, dealt: Math.round(M.stats.dealt) });
  for (const f of onEnd) f(M, r);
  persist();
}

/** End the match now (tests of rewards and quests) */
export function finish(r: 'win' | 'lose') { if (M && !M.over) { if (r === 'win') M.wave = modes[M.mode].waves; end(r); } }
/** Run simulated seconds without the world (bench, tests of the rules). */
export function simulate(sec: number) { headless = true; try { for (let i = 0; i < sec / DT; i++) step(); } finally { headless = false; } }
export function __setM(m: Match | undefined) { M = m; path = m ? (path?.map === m.map ? path : new Path(m.map)) : undefined; }

// ---------- visuals, persistence ----------
let tick = 0;

system.runInterval(() => {
  if (!M || !path) return;
  const n = simSpeed(); let t0 = Date.now();
  for (let i = 0; i < n && M && !M.over; i++) step();
  if (!M || !path) return;
  prof.sim += Date.now() - t0; t0 = Date.now(); prof.n++;
  // the walkers move every tick while few (smooth), every 2 or 4 when many; each faces the way it goes, easing round corners,
  // and tells its look how fast its legs go and whether it is stunned or frozen
  const every = M.enemies.length > 80 ? 4 : M.enemies.length > 40 ? 2 : 1;
  if (++tick % every === 0) for (const e of M.enemies) {
    if (tick % 10 === 0) flush(e);
    let x = ents.get(e.id); if (!x?.isValid) { if (tick % 40 === 0) show(e); continue; }
    const p = path.at(e.d), back = M.t < (e.conf ?? 0) ? 180 : 0;
    try { x.teleport({ x: p.x, y: path.floor + (e.flying ? 2.5 : 0), z: p.z }, { rotation: { x: 0, y: path.yawAt(e.d) + back } }); } catch { /* unloaded */ }
    if (!headless) showState(e.id, x, Math.min(255, Math.round((e.v ?? e.speed) * 10 * n)), M.t < e.freezeUntil ? 2 : M.t < e.stunUntil ? 1 : 0);
  }
  if (tick % (M.units.length > 20 ? 2 : 1) === 0) for (const u of M.units) {
    const p = path.at(u.d); let x = ents.get(u.id);
    const tag = `§a${u.kind ?? 'Unit'} §f${Math.ceil(u.hp)}`;
    if (!x?.isValid) { try { x = dim().spawnEntity('tds:unit' as any, { x: p.x, y: path.floor, z: p.z }); try { const lk = unitLook(u); x.setProperty('tds:skin', lk[0]); x.setProperty('tds:size', lk[1]); } catch { /* older pack */ } x.nameTag = tag; ents.set(u.id, x); shown.delete(u.id); } catch { continue; } }
    try { x.teleport({ x: p.x, y: path.floor, z: p.z }, { rotation: { x: 0, y: path.yawAt(u.d) + 180 } }); if (x.nameTag !== tag) x.nameTag = tag; } catch { /* unloaded */ }
    if (!headless) showState(u.id, x, u.stationary ? 0 : Math.min(255, Math.round((u.speed ?? RULES.unitSpeed) * 10 * n)), 0);
  }
  if (tick % 4 === 0 && !headless) for (const tw of M.towers) {   // a stunned tower reels, a frozen one stands still
    const x = ents.get(-tw.id); if (!x?.isValid) continue;
    showState(-tw.id, x, -1, M.t < (tw.stunUntil ?? 0) ? (tw.stunKind === 'freeze' ? 2 : 1) : 0);
  }
  prof.vis += Date.now() - t0; t0 = Date.now();
  if (tick % 40 === 0) persist();
  prof.save += Date.now() - t0;
}, 1);

export function persist() { try { world.setDynamicProperty('tds:m', M ? JSON.stringify(M) : undefined); } catch (e) { log('persist_error', { msg: String(e).slice(0, 80) }); } }
export function restore() {
  const s = world.getDynamicProperty('tds:m') as string | undefined; if (!s) return false;
  for (const e of dim().getEntities({ families: ['tds'] })) e.remove();
  ents.clear(); shown.clear(); M = JSON.parse(s) as Match; path = new Path(M.map);
  for (const e of M.enemies) show(e); for (const t of M.towers) body(t);
  log('restored', { mode: M.mode, wave: M.wave, enemies: M.enemies.length, towers: M.towers.length, baseHP: M.baseHP });
  return true;
}
export function debugSpawn(name: string, mods: string[] = [], d = 0) { spawnEnemy(name, mods, d); }
export function debugKill(name: string) { if (!M) return 0; const l = M.enemies.filter((e) => e.name === name); for (const e of l) hit(e, 1e15); return l.length; }
export function debugHurt(name: string, n: number) { const e = M?.enemies.find((x) => x.name === name); if (!e) return false; const d = e.def; e.def = 0; hit(e, Math.min(n, e.hp + e.shield - 1)); e.def = d; return true; }
export function debugStun(name: string, sec: number) { if (!M) return 0; const l = M.enemies.filter((e) => e.name === name); for (const e of l) e.stunUntil = M.t + sec; return l.length; }
export function debugAbility(name: string, i: number) { const e = M?.enemies.find((x) => x.name === name); const a = e && enemies[e.name].abilities?.[i]; if (!e || !a) return false; useAbility(e, a); return true; }
/** path distance (studs) closest to a tower */
export function nearestD(tw: Tower) { let best = 0, bd = Infinity; for (let d = 0; d <= path!.len; d += 0.25) { const p = path!.at(d), x = Math.hypot(p.x - tw.x - 0.5, p.z - tw.z - 0.5); if (x < bd) { bd = x; best = d; } } return best; }
