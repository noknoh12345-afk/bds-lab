// The match: path, enemies, towers, units, economy, waves. Pure simulation in studs/seconds; entities only mirror it.
import { world, system, Player, Entity, Dimension } from '@minecraft/server';
import { DEFAULT_MAP, towers, enemies, modes, maps, stats, maxLevel, levelCost, placeCost, waveCash, startCash, timerFor, enemyIn, afterDefense, cashShare, hpFor, RULES, Stats, Group, Ability, Spawn } from './defs';

export let headless = false;
export const log = (ev: string, o: Record<string, unknown> = {}) => { if (!headless) console.log(`[TDS] ${JSON.stringify({ ev, ...o })}`); };
export const TARGETS = ['First', 'Last', 'Strongest', 'Weakest', 'Closest', 'Farthest', 'Random'] as const;

// ---------- path ----------
type Pt = { x: number; z: number };
export class Path {
  pts: Pt[]; seg: number[] = []; len = 0; stud: number; y: number; width: number;
  constructor(public map: string) {
    const m = maps[map]; this.stud = m.stud; this.y = m.y; this.width = m.width; this.pts = m.path.map(([x, z]) => ({ x: x + 0.5, z: z + 0.5 }));
    for (let i = 1; i < this.pts.length; i++) { this.seg.push(this.len); this.len += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z) / this.stud; }
  }
  at(d: number): Pt & { yaw: number } {
    d = Math.max(0, Math.min(this.len, d));
    let i = this.seg.length - 1; while (i > 0 && this.seg[i] > d) i--;
    const a = this.pts[i], b = this.pts[i + 1], sl = Math.hypot(b.x - a.x, b.z - a.z) / this.stud, t = sl ? (d - this.seg[i]) / sl : 0;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: (Math.atan2(-(b.x - a.x), b.z - a.z) * 180) / Math.PI };
  }
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
  slow: number; slowUntil: number; freezeUntil: number; stunUntil: number; dots: { dmg: number; tick: number; next: number; until: number; tw: number }[];
  nextSummon?: number; wave: number; summoned?: boolean; born?: number; x?: number; z?: number; dirty?: boolean;
  aggro?: boolean; regen?: number; abil?: number[]; baseDef?: number; haste?: number; hasteUntil?: number;
};
export type Tower = { id: number; name: string; lvl: number; x: number; y: number; z: number; owner: string; target: string; next: number; burstLeft: number; ammoLeft: number; shots: number; spent: number; dealt: number; nextUnit: number; primary: number; stunUntil?: number; fat?: number; rdeb?: number; debUntil?: number; abReady?: Record<string, number>; selfBuff?: number; selfBuffUntil?: number; ctaBuff?: number; ctaUntil?: number };
/** Per-player match statistics (quests): damage and kills by tower, status effects applied, ability uses, cash earned, towers placed, bosses killed. */
export type PSt = { dmg: Record<string, number>; kills: number; killsBy: Record<string, number>; status: Record<string, number>; abil: Record<string, number>; earned: number; placed: string[]; bosses: string[] };
export type Unit = { id: number; tw: number; d: number; hp: number; dmg: number; next: number };
export type Match = {
  mode: string; map: string; players: string[]; cash: Record<string, number>; baseHP: number; maxHP: number; wave: number; t: number; waveEnd: number; skipAt: number;
  queue: { at: number; name: string; mods: string[] }[]; enemies: Enemy[]; towers: Tower[]; units: Unit[]; seq: number; votes: string[];
  over?: 'win' | 'lose'; hold?: boolean; inter?: boolean; waveDmg?: boolean; stats: { kills: number; leaks: number; dealt: number; income: number }; clearPaid: boolean; leakedThisWave: boolean; seed: number;
  pst?: Record<string, PSt>; loadouts?: Record<string, string[]>;
};

export let M: Match | undefined;
export let path: Path | undefined;
const ents = new Map<number, Entity>();
const dim = (): Dimension => world.getDimension('overworld');
let rnd = 1;
const fresh = (): PSt => ({ dmg: {}, kills: 0, killsBy: {}, status: {}, abil: {}, earned: 0, placed: [], bosses: [] });
export const pst = (n: string): PSt => { const m = M!; m.pst ??= {}; return (m.pst[n] ??= fresh()); };
/** cash into a player's purse, counted as earned (Economy Audit) */
export function pay(n: string, amount: number) { if (!M || amount <= 0) return; M.cash[n] = (M.cash[n] ?? 0) + amount; pst(n).earned += amount; }
const mark = (tw: Tower | undefined, k: string) => { if (tw && M?.players.includes(tw.owner)) { const s = pst(tw.owner).status; s[k] = (s[k] ?? 0) + 1; } };
const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---------- arena ----------
export function buildArena(map: string) {
  const m = maps[map], d = dim(), y = m.y;
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
  const p = new Path(map), h = m.width / 2, done = new Set<string>();
  for (let s = 0; s <= p.len; s += 0.5) {
    const q = p.at(s);
    for (let x = Math.floor(q.x - h); x <= Math.floor(q.x + h); x++) for (let z = Math.floor(q.z - h); z <= Math.floor(q.z + h); z++) {
      const k = `${x},${z}`; if (done.has(k) || Math.hypot(x + 0.5 - q.x, z + 0.5 - q.z) > h + 0.2) continue; done.add(k);
      const water = m.grid[z + 32]?.[x + 32] === 'w';
      d.runCommand(`fill ${x} ${y - 1} ${z} ${x} ${y + 1} ${z} air`);
      d.runCommand(`setblock ${x} ${y - 1} ${z} ${water ? 'oak_planks' : 'grass_path'}`);
    }
  }
  const s0 = m.path[0], e = m.path[m.path.length - 1];
  d.runCommand(`setblock ${s0[0]} ${y - 1} ${s0[1]} crimson_nylium`);
  d.runCommand(`setblock ${e[0]} ${y - 1} ${e[1]} warped_nylium`);
  return p;
}

export type Place = 'ground' | 'cliff' | null;
export function surface(x: number, y: number, z: number): Place {
  const m = maps[M?.map ?? DEFAULT_MAP], b = dim().getBlock({ x, y: y - 1, z })?.typeId;
  if (y === m.y && b === 'minecraft:grass_block') return 'ground';
  if (y === m.y + 2 && b === 'minecraft:stone') return 'cliff';
  return null;
}

// ---------- match lifecycle ----------
export function start(mode: string, players: Player[], map = DEFAULT_MAP) {
  stop(true);
  const md = modes[mode]; path = buildArena(map); rnd = 1;
  const cash = startCash(mode, players.length);
  M = { mode, map, players: players.map((p) => p.name), cash: Object.fromEntries(players.map((p) => [p.name, cash])), baseHP: md.baseHP, maxHP: md.baseHP, wave: 0, t: 0, waveEnd: 5, skipAt: 0, inter: true,
    queue: [], enemies: [], towers: [], units: [], seq: 1, votes: [], stats: { kills: 0, leaks: 0, dealt: 0, income: 0 }, clearPaid: false, leakedThisWave: false, seed: 1, pst: Object.fromEntries(players.map((p) => [p.name, fresh()])) };
  const g = maps[map].grid[32]?.[32], onPath = path.dist(0.5, 0.5) < path.width / 2 + 0.5;
  for (const p of players) p.teleport({ x: 0.5, y: maps[map].y + (g === 'x' && !onPath ? 2.2 : 0.2), z: 0.5 });
  if (holdNext) { M.hold = true; holdNext = false; }
  log('match_start', { mode, map, players: M.players, cash, baseHP: md.baseHP, hpScale: hpFor(mode, players.length), pathStuds: +path.len.toFixed(1) });
  persist();
}

let holdNext = false;
export function setHold(on: boolean) { if (M && !M.over) { M.hold = on; persist(); } else holdNext = on; }
export function stop(silent = false) {
  for (const e of dim().getEntities({ families: ['tds'] })) e.remove();
  ents.clear();
  if (M && !silent) log('match_stop', { mode: M.mode, wave: M.wave });
  M = undefined; path = undefined; world.setDynamicProperty('tds:m', undefined);
}

function nextWave() {
  if (!M) return;
  const md = modes[M.mode];
  M.wave++; M.votes = []; M.clearPaid = false; M.leakedThisWave = false; M.waveDmg = false; M.inter = false;
  const tm = timerFor(M.mode, M.wave); M.waveEnd = tm.timer === null ? Infinity : M.t + tm.timer; M.skipAt = tm.skipAfter === null ? Infinity : M.t + tm.skipAfter;
  let at = M.t;
  for (const g of md.wave[String(M.wave)] ?? []) { for (let i = 0; i < g.n; i++) { M.queue.push({ at, name: g.e, mods: g.mods ?? [] }); at += RULES.spawnGap; } at += RULES.groupGap - RULES.spawnGap; }
  log('wave_start', { wave: M.wave, of: md.waves, enemies: (md.wave[String(M.wave)] ?? []).reduce((a: number, g: Group) => a + g.n, 0), timer: tm.timer });
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
  const def = enemies[name], s = enemyIn(name, M.mode);
  const hp = s.hp * (mods.includes('Bloated') ? 2 : 1) * hpFor(M.mode, M.players.length);
  const e: Enemy = { id: M.seq++, name, d, hp, max: hp, shield: s.shield ?? 0, speed: s.speed * (mods.includes('Nimble') ? 2 : 1), def: def?.defense ?? 0, cash: s.cash, every: s.cashEveryPct, paid: 0,
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
  e.baseDef = e.def;
  if (def?.abilities) e.abil = def.abilities.map((a) => (a.cd ? M!.t + a.cd : Infinity));
  M.enemies.push(e); show(e);
  log('enemy_spawn', { id: e.id, name, hp, speed: e.speed, hidden: e.hidden, flying: e.flying, lead: e.lead, boss: e.boss });
}

function show(e: Enemy) {
  if (!path) return;
  const p = path.at(e.d), y = path.y + (e.flying ? 2.5 : 0);
  try {
    const ent = dim().spawnEntity('tds:enemy' as any, { x: p.x, y, z: p.z });
    ent.setProperty('tds:skin', e.lead ? 1 : e.boss ? 2 : e.hidden ? 4 : e.flying ? 5 : 0);
    ent.setProperty('tds:size', e.boss ? 1.6 : e.mods.includes('Bloated') ? 1.5 : 1);
    if (e.hidden) ent.addEffect('invisibility', 20000000, { showParticles: false });
    ents.set(e.id, ent); e.dirty = true; flush(e);
  } catch { /* chunk not loaded: the simulation still runs */ }
}
const bar = (e: Enemy) => `${e.boss ? '§c' : e.hidden ? '§7' : '§f'}${e.name}${e.lead ? ' §8[Lead]' : ''}${e.flying ? ' §b[Fly]' : ''}\n§a${Math.ceil(e.hp)}${e.shield > 0 ? ` §e+${Math.ceil(e.shield)}` : ''}`;
function label(e: Enemy) { if (!headless) e.dirty = true; }
function flush(e: Enemy) { if (!e.dirty) return; e.dirty = false; const x = ents.get(e.id); if (x?.isValid) x.nameTag = bar(e); }

function kill(e: Enemy, tw?: Tower) {
  if (!M) return;
  M.enemies.splice(M.enemies.indexOf(e), 1);
  const x = ents.get(e.id); if (x?.isValid) x.remove(); ents.delete(e.id);
  if (!e.every) give(tw, e.cash);
  M.stats.kills++;
  if (tw && M.players.includes(tw.owner)) { const s = pst(tw.owner); s.kills++; s.killsBy[tw.name] = (s.killsBy[tw.name] ?? 0) + 1; }
  if (e.boss) for (const n of M.players) pst(n).bosses.push(e.name);
  const def = enemies[e.name];
  for (const a of def?.abilities ?? []) if (a.kind === 'deathSpawn' || a.onDeath) useAbility(e, a);
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
export function hit(e: Enemy, dmg: number, tw?: Tower, kind: 'direct' | 'splash' | 'dot' = 'direct'): number {
  if (!M || e.hp <= 0) return 0;
  if (kind === 'splash' && e.immune.includes('Splash Damage')) return 0;
  let d = afterDefense(dmg, Math.max(0, e.def)), done = 0;
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
  if (a.kind === 'deathSpawn' || a.kind === 'summon') spawnList(e, a.spawn ?? []);
  if (a.kind === 'stun') { const f = near(e, a.radius ?? 12); for (const tw of M.towers) if (f(tw) && !/Stun/.test(towers[tw.name].immune ?? '')) tw.stunUntil = Math.max(tw.stunUntil ?? 0, M.t + (a.dur ?? 3)); }
  if (a.kind === 'debuff') { const f = near(e, a.radius ?? 12); for (const tw of M.towers) if (f(tw)) { tw.fat = Math.max(tw.debUntil! > M.t ? tw.fat ?? 0 : 0, (a.fatigue ?? 0) / 100); tw.rdeb = Math.max(tw.debUntil! > M.t ? tw.rdeb ?? 0 : 0, (a.range ?? 0) / 100); tw.debUntil = M.t + (a.dur ?? 10); } }
  if ((a.kind === 'stun' || a.kind === 'debuff') && a.unitDmg) for (const u of M.units) if (Math.abs(u.d - e.d) <= (a.radius ?? 12)) u.hp -= a.unitDmg;
  if (a.kind === 'speedAura') for (const o of M.enemies) if (o !== e && Math.abs(o.d - e.d) <= (a.radius ?? 6)) { o.haste = (a.pct ?? 0) / 100; o.hasteUntil = M.t + (a.dur ?? 10); }
  if (a.kind !== 'boneArmor' && a.kind !== 'heal') log('ability', { id: e.id, name: e.name, ability: a.title, kind: a.kind });
}
function enemyAbilities(e: Enemy) {
  if (!M) return;
  const list = enemies[e.name]?.abilities ?? [];
  list.forEach((a, i) => {
    if (a.kind === 'boneArmor') { const lost = 1 - e.hp / e.max; e.def = Math.max(e.def, Math.min(Math.max(a.max ?? 60, e.baseDef ?? 0), (e.baseDef ?? 0) + (a.step ?? 15) * Math.floor(lost / 0.2))); return; }
    if (a.kind === 'heal') { if ((e.abil![i] === Infinity ? (e.abil![i] = M!.t) : e.abil![i]) <= M!.t) { e.abil![i] = M!.t + (a.every ?? 1); for (const o of M!.enemies) if (o !== e && Math.abs(o.d - e.d) <= (a.radius ?? 8)) { o.hp = Math.min(o.max, o.hp + (a.amount ?? 0)); label(o); } } return; }
    if (a.onDeath || a.kind === 'deathSpawn' || !e.abil || M!.t < e.abil[i]) return;
    e.abil[i] = M!.t + (a.cd ?? 10); useAbility(e, a);
  });
  if (e.regen !== undefined && M.t >= e.regen) { e.regen = M.t + 2; e.hp = Math.min(e.max, e.hp + e.max * 0.02); label(e); }
}

// ---------- towers ----------
export function canSee(tw: Tower, e: Enemy) {
  const d = towers[tw.name].detect;
  if (e.hidden && !(d.hidden !== null && tw.lvl >= d.hidden)) return false;
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
    if (o === tw) continue; const s = stats(o.name, o.lvl);
    if (!s.frBuff && !s.dmgBuff && !s.rangeBuff) continue;
    if (Math.hypot(o.x - tw.x, o.z - tw.z) / path.stud > s.range) continue;
    const cta = (o.ctaUntil ?? 0) > M.t ? o.ctaBuff ?? 0 : 0;
    fr = Math.max(fr, (s.frBuff ?? 0) + cta); dm = Math.max(dm, s.dmgBuff ?? 0); rg = Math.max(rg, s.rangeBuff ?? 0);
  }
  return { fr, dm, rg };
};
export function eff(tw: Tower): Stats & { range: number } {
  const s = stats(tw.name, tw.lvl), b = buffs(tw), deb = M && (tw.debUntil ?? 0) > M.t, f = deb ? tw.fat ?? 0 : 0, rd = deb ? tw.rdeb ?? 0 : 0;
  const self = M && (tw.selfBuffUntil ?? 0) > M.t ? tw.selfBuff ?? 0 : 0;
  let fr = s.fr ? s.fr / (1 + b.fr + self) : s.fr; if (fr && f) fr = fr + fr * (f / (1 + f));   // Fatigue Debuff page
  return { ...s, dmg: s.dmg * (1 + b.dm), fr, range: rd ? s.range * (1 - (rd - b.rg)) : s.range * (1 + b.rg) };  // Range Debuff page
}
const distTo = (tw: Tower, e: Enemy) => { if (e.x === undefined) { const p = path!.at(e.d); e.x = p.x; e.z = p.z; } return Math.hypot(e.x - (tw.x + 0.5), e.z! - (tw.z + 0.5)) / path!.stud; };

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
function pick(tw: Tower, range: number): Enemy | undefined {
  let best: Enemy | undefined, bv = -Infinity; const c: Enemy[] = []; const iv = cover(tw, range);
  for (const e of M!.enemies) {
    let inIv = false; for (const [a, b] of iv) if (e.d >= a && e.d <= b) { inIv = true; break; }
    if (!inIv || e.hp <= 0 || !canSee(tw, e)) continue; const dd = distTo(tw, e); if (dd > range) continue;
    const v = (e.aggro ? 1e12 : 0) + (tw.target === 'First' ? e.d : tw.target === 'Last' ? -e.d : tw.target === 'Strongest' ? e.hp + e.shield : tw.target === 'Weakest' ? -(e.hp + e.shield) : tw.target === 'Closest' ? -dd : tw.target === 'Farthest' ? dd : 0);
    if (tw.target === 'Random') c.push(e); else if (v > bv) { bv = v; best = e; }
  }
  return tw.target === 'Random' ? c[Math.floor(rand() * c.length)] : best;
}

function fire(tw: Tower, s: ReturnType<typeof eff>, e: Enemy) {
  if (!M || !path) return;
  const hits: Enemy[] = [e];
  if (s.splash) { for (const o of M.enemies) if (o !== e && hits.length < Math.max(s.maxHits, 999) && canSee(tw, o) && Math.abs(o.d - e.d) <= s.splash) hits.push(o); }
  else if (s.chain) { let cur = e; while (hits.length < s.maxHits) { let nx: Enemy | undefined, nd = Infinity; for (const o of M.enemies) { if (hits.includes(o) || !canSee(tw, o)) continue; const dd = Math.abs(o.d - cur.d); if (dd <= s.chain && dd < nd) { nd = dd; nx = o; } } if (!nx) break; hits.push(nx); cur = nx; } }
  else if (s.maxHits > 1) { for (const o of M.enemies) if (o !== e && hits.length < s.maxHits && canSee(tw, o) && Math.abs(o.d - e.d) <= 2 && distTo(tw, o) <= s.range) hits.push(o); }
  if (s.splash && s.maxHits > 1) hits.length = Math.min(hits.length, s.maxHits);
  const per = s.dmg * s.pellets;
  for (const h of hits) {
    if (h.hp <= 0) continue;
    if (s.melt) h.def = Math.max(0, h.def - s.melt);
    const done = hit(h, per, tw, s.splash && h !== e ? 'splash' : 'direct');
    if (h === e) tw.primary += done;
    if (h.hp <= 0) continue;
    if (s.burn && !h.immune.includes('Burn')) h.dots.push({ dmg: s.burn[0], tick: s.burn[1], next: M.t + s.burn[1], until: M.t + s.burn[2], tw: tw.id });
    if (s.poison) h.dots.push({ dmg: s.poison[0], tick: s.poison[1], next: M.t + s.poison[1], until: M.t + s.poison[2], tw: tw.id });
    if (s.poison) mark(tw, 'Poison');
    if (s.slowHit && !h.boss && !h.immune.includes('Slowed')) { h.slow = Math.min(s.slowMax ?? s.slowHit, h.slow + s.slowHit); h.slowUntil = M.t + (s.slowTime ?? 2); mark(tw, 'Frost'); }
    if (s.freeze && !h.boss && !h.immune.includes('Freeze') && h.slow >= (s.slowMax ?? 1)) { h.freezeUntil = M.t + s.freeze; mark(tw, 'Freeze'); }
    if (s.stun && !h.boss && !h.immune.includes('Stun')) { h.stunUntil = Math.max(h.stunUntil, M.t + s.stun); mark(tw, 'Shock'); }
  }
  if (s.cashShot && s.income && ++tw.shots % s.cashShot === 0) { pay(tw.owner, s.income); M.stats.income += s.income; log('income', { tower: tw.id, name: tw.name, amount: s.income }); }
  beam(tw, e, hits.length);
}

function beam(tw: Tower, e: Enemy, n: number) {
  if (!path || headless || simSpeed() > 1) return;
  const p = path.at(e.d), d = dim(), y = path.y + (e.flying ? 3.3 : 1.2);
  try { d.spawnParticle(n > 1 ? 'minecraft:large_explosion' : 'minecraft:basic_crit_particle', { x: p.x, y, z: p.z }); } catch { /* unloaded */ }
}

function towerStep(tw: Tower, dt: number) {
  if (!M || !path) return;
  const s0 = stats(tw.name, tw.lvl);
  if (M.t < (tw.stunUntil ?? 0)) { tw.next = Math.max(tw.next, tw.stunUntil!); return; }
  if (M.t < tw.next && !(s0.unitHp && s0.spawnrate && M.t >= tw.nextUnit)) return;
  if (!M.enemies.length && !s0.unitHp) { tw.next = M.t; return; }
  const s = eff(tw);
  if (s.unitHp && s.spawnrate && M.t >= tw.nextUnit) {
    tw.nextUnit = M.t + s.spawnrate;
    if (M.units.filter((u) => u.tw === tw.id).length < RULES.unitMax) { M.units.push({ id: M.seq++, tw: tw.id, d: path.len, hp: s.unitHp, dmg: s.unitDmg ?? 1, next: 0 }); log('unit_spawn', { tower: tw.id, hp: s.unitHp }); }
  }
  if (!s.fr || !s.dmg) return;
  let guard = 0;
  while (M.t >= tw.next && guard++ < 50) {
    const e = pick(tw, s.range); if (!e) { tw.next = M.t + 0.1; return; }
    fire(tw, s, e);
    let gap = s.fr;
    if (s.burst && s.burst > 1) { tw.burstLeft = (tw.burstLeft || s.burst) - 1; if (tw.burstLeft === 0) gap += s.burstCd ?? 0; }
    if (s.ammo && s.reload) { tw.ammoLeft = (tw.ammoLeft || s.ammo) - 1; if (tw.ammoLeft === 0) gap += s.reload; }
    tw.next += gap;
  }
  void dt;
}

export type PlaceResult = { ok: true; tower: Tower } | { ok: false; why: string };
export function place(p: Player | string, name: string, x: number, y: number, z: number, free = false): PlaceResult {
  if (!M || !path) return { ok: false, why: 'no match' };
  const owner = typeof p === 'string' ? p : p.name, def = towers[name];
  if (!def) return { ok: false, why: `unknown tower ${name}` };
  const cost = placeCost(name); if (!Number.isFinite(cost)) return { ok: false, why: 'no cost' };
  if (!free && (M.cash[owner] ?? 0) < cost) return { ok: false, why: `need $${cost}` };
  if (def.limit && M.towers.filter((t) => t.name === name && t.owner === owner).length >= def.limit) return { ok: false, why: `limit ${def.limit}` };
  const r0 = (def.footprint / 2) * path.stud;
  if (y === maps[M.map].y && path.dist(x + 0.5, z + 0.5) < path.width / 2 + r0) return { ok: false, why: 'on the path' };
  const sf = surface(x, y, z);
  if (!sf) return { ok: false, why: 'not placeable here' };
  if (def.placement !== 'both' && def.placement !== sf) return { ok: false, why: `${def.placement} only` };
  const r = (def.footprint / 2) * path.stud;
  if (sf === 'ground' && path.dist(x + 0.5, z + 0.5) < path.width / 2 + r) return { ok: false, why: 'on the path' };
  for (const o of M.towers) if (Math.hypot(o.x - x, o.z - z) < r + (towers[o.name].footprint / 2) * path.stud) return { ok: false, why: `overlaps #${o.id}` };
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
    const role = towers[tw.name].role ?? ''; e.setProperty('tds:skin', /Support/.test(role) ? 1 : /Farm|Income/.test(tw.name) ? 2 : 0);
    e.setDynamicProperty('tds:id', tw.id); ents.set(-tw.id, e); tlabel(tw);
  } catch { /* unloaded */ }
}
export function tlabel(tw: Tower) { const e = ents.get(-tw.id); if (e?.isValid) e.nameTag = `§e#${tw.id} §f${tw.name}\n§bLv${tw.lvl} §7${tw.target}`; }
export const towerById = (id: number) => M?.towers.find((t) => t.id === id);

export function upgrade(owner: string, id: number): string {
  const tw = towerById(id); if (!M || !tw) return 'No such tower';
  if (tw.lvl >= maxLevel(tw.name)) return 'Max level';
  const c = levelCost(tw.name, tw.lvl + 1); if ((M.cash[owner] ?? 0) < c) return `Need $${c}`;
  M.cash[owner] -= c; tw.lvl++; tw.spent += c; tlabel(tw);
  log('upgrade', { id, name: tw.name, lvl: tw.lvl, cost: c }); persist();
  return `${tw.name} → Lv${tw.lvl}`;
}
export const sellValue = (tw: Tower) => Math.floor(tw.spent * RULES.sellRate + 1e-9);
export function sell(owner: string, id: number): string {
  const tw = towerById(id); if (!M || !tw) return 'No such tower';
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

// ---------- tower abilities (wiki {{Ability}} templates; the simulated ones) ----------
export function abilitiesOf(tw: Tower) { return (towers[tw.name].abilities ?? []).filter((a) => a.simulated && tw.lvl >= a.unlock); }
export function abilityReady(tw: Tower, title: string) { return !M ? 0 : Math.max(0, (tw.abReady?.[title] ?? 0) - M.t); }
export function useTowerAbility(owner: string, id: number, title?: string): string {
  const tw = towerById(id); if (!M || !path || !tw) return 'No such tower';
  const a = abilitiesOf(tw).find((x) => !title || x.title === title); if (!a) return `${tw.name} has no usable ability at Lv${tw.lvl}`;
  const wait = abilityReady(tw, a.title); if (wait > 0) return `${a.title} ready in ${Math.ceil(wait)}s`;
  if ((M.cash[owner] ?? 0) < a.cost) return `Need $${a.cost}`;
  const s = stats(tw.name, tw.lvl), L = towers[tw.name].levels[tw.lvl];
  const lead = M.enemies.filter((e) => canSee(tw, e)).sort((x, y) => y.d - x.d)[0];
  let what = '';
  if (a.title === 'Call to Arms') { tw.ctaBuff = (Number(L.callToArmsBuff) || 0) / 100; tw.ctaUntil = M.t + 10; dropBuffs(); what = `+${Math.round(tw.ctaBuff * 100)}% firerate 10s`; }
  else if (a.title === 'War Cry') { tw.selfBuff = 0.65; tw.selfBuffUntil = M.t + 10; what = '+65% firerate 10s'; }
  else if (a.title === 'Airstrike' || a.title === 'Frost Grenade') {
    if (!lead) return 'No enemy to aim at';
    const r = a.title === 'Airstrike' ? 8 : 6, hits = M.enemies.filter((e) => Math.abs(e.d - lead.d) <= r).slice(0, a.title === 'Frost Grenade' ? 5 : 999);
    for (const e of hits) { if (a.title === 'Airstrike') hit(e, Number(L.airstrikeDamage) || s.dmg, tw, 'splash'); else if (!e.immune.includes('Freeze') && !e.boss) { e.freezeUntil = M.t + 2; mark(tw, 'Freeze'); } }
    what = `${hits.length} enemies`;
  } else return `${a.title} is not simulated`;
  M.cash[owner] -= a.cost; (tw.abReady ??= {})[a.title] = M.t + (a.cd ?? 30);
  if (M.players.includes(owner)) { const u = pst(owner).abil; u[tw.name] = (u[tw.name] ?? 0) + 1; }
  log('tower_ability', { id, name: tw.name, ability: a.title, cost: a.cost, what });
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
    if (v) { e.d += v * DT; e.x = undefined; }
    if (e.nextSummon !== undefined && M.t >= e.nextSummon) { e.nextSummon = M.t + RULES.summonEvery; const c = enemies[e.name].spawns![0]; for (let i = 0; i < RULES.childCount; i++) spawnEnemy(c, [], Math.max(0, e.d - 2 - i), e.wave, true); }
    if (e.d >= path.len) leak(e);
  }
  const ta = Date.now();
  for (const u of [...M.units]) unitStep(u);
  for (const tw of M.towers) towerStep(tw, DT);
  prof.tw += Date.now() - ta;
  const md = modes[M.mode];
  if (M.wave >= md.waves && !M.inter && !M.enemies.length && !M.queue.length) return end('win');
  if (M.inter || M.wave === 0 || M.wave >= md.waves) return;
  // a wave ends when its own enemies are gone (summoned and older ones do not count), its timer runs out, or a skip vote passes
  const own = M.enemies.some((e) => e.wave === M!.wave && !e.summoned) || M.queue.length > 0;
  if (!own || (!M.hold && M.t >= M.waveEnd)) endWave(!own);
}
function endWave(cleared: boolean) {
  if (!M) return;
  const md = modes[M.mode], p = M.players.length, bonus = waveCash(M.mode, M.wave, p);
  for (const n of M.players) pay(n, bonus);
  for (const tw of M.towers) { const s = stats(tw.name, tw.lvl); if (s.income && !s.cashShot) { pay(tw.owner, s.income); M.stats.income += s.income; log('income', { tower: tw.id, name: tw.name, amount: s.income }); } }
  log('wave_cash', { wave: M.wave, bonus });
  const pct = p > 1 ? md.clear.group : md.clear.solo;
  if (cleared && pct && !M.leakedThisWave && !(md.clear.noDamage && M.waveDmg)) { const b = Math.floor(bonus * pct + 1e-6); for (const n of M.players) pay(n, b); log('wave_clear', { wave: M.wave, bonus: b }); }
  M.inter = true; M.waveEnd = M.t + RULES.intermission;   // "a 5-second intermission will count down before the next wave begins"
}
function unitStep(u: Unit) {
  if (!M || !path) return;
  u.d -= RULES.unitSpeed * DT;
  const tw = towerById(u.tw);
  for (const e of M.enemies) {
    if (Math.abs(e.d - u.d) > 1.5 || e.flying) continue;
    const ram = Math.min(u.hp, e.hp + e.shield); u.hp -= ram; hit(e, ram, tw);
    if (u.hp <= 0) break;
  }
  if (u.hp > 0 && M.t >= u.next) { const t = M.enemies.find((e) => Math.abs(e.d - u.d) <= RULES.unitRange && !e.hidden); if (t) { hit(t, u.dmg, tw); u.next = M.t + 1; } }
  if (u.hp <= 0 || u.d <= 0) { M.units.splice(M.units.indexOf(u), 1); const x = ents.get(u.id); if (x?.isValid) x.remove(); ents.delete(u.id); log('unit_end', { id: u.id, hp: Math.max(0, Math.round(u.hp)) }); }
}
function leak(e: Enemy) {
  if (!M) return;
  const dmg = Math.ceil(e.hp + e.shield); M.baseHP -= dmg; M.stats.leaks++; M.waveDmg = true; if (e.wave === M.wave) M.leakedThisWave = true;
  M.enemies.splice(M.enemies.indexOf(e), 1); const x = ents.get(e.id); if (x?.isValid) x.remove(); ents.delete(e.id);
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
  const every = M.enemies.length > 80 ? 4 : 2;
  if (++tick % every === 0) for (const e of M.enemies) {
    if (tick % 10 === 0) flush(e);
    let x = ents.get(e.id); if (!x?.isValid) { if (tick % 40 === 0) show(e); continue; }
    const p = path.at(e.d); try { x.teleport({ x: p.x, y: path.y + (e.flying ? 2.5 : 0), z: p.z }, { rotation: { x: 0, y: p.yaw } }); } catch { /* unloaded */ }
  }
  if (tick % 4 === 0) for (const u of M.units) {
    const p = path.at(u.d); let x = ents.get(u.id);
    if (!x?.isValid) { try { x = dim().spawnEntity('tds:unit' as any, { x: p.x, y: path.y, z: p.z }); x.setProperty('tds:skin', 1); x.nameTag = `§aUnit §f${Math.ceil(u.hp)}`; ents.set(u.id, x); } catch { continue; } }
    try { x.teleport({ x: p.x, y: path.y, z: p.z }, { rotation: { x: 0, y: p.yaw + 180 } }); x.nameTag = `§aUnit §f${Math.ceil(u.hp)}`; } catch { /* unloaded */ }
  }
  prof.vis += Date.now() - t0; t0 = Date.now();
  if (tick % 40 === 0) persist();
  prof.save += Date.now() - t0;
}, 1);

export function persist() { try { world.setDynamicProperty('tds:m', M ? JSON.stringify(M) : undefined); } catch (e) { log('persist_error', { msg: String(e).slice(0, 80) }); } }
export function restore() {
  const s = world.getDynamicProperty('tds:m') as string | undefined; if (!s) return false;
  for (const e of dim().getEntities({ families: ['tds'] })) e.remove();
  ents.clear(); M = JSON.parse(s) as Match; path = new Path(M.map);
  for (const e of M.enemies) show(e); for (const t of M.towers) body(t);
  log('restored', { mode: M.mode, wave: M.wave, enemies: M.enemies.length, towers: M.towers.length, baseHP: M.baseHP });
  return true;
}
export function debugSpawn(name: string, mods: string[] = [], d = 0) { spawnEnemy(name, mods, d); }
export function debugKill(name: string) { if (!M) return 0; const l = M.enemies.filter((e) => e.name === name); for (const e of l) hit(e, 1e15); return l.length; }
export function debugHurt(name: string, n: number) { const e = M?.enemies.find((x) => x.name === name); if (!e) return false; const d = e.def; e.def = 0; hit(e, Math.min(n, e.hp + e.shield - 1)); e.def = d; return true; }
export function debugAbility(name: string, i: number) { const e = M?.enemies.find((x) => x.name === name); const a = e && enemies[e.name].abilities?.[i]; if (!e || !a) return false; useAbility(e, a); return true; }
/** path distance (studs) closest to a tower */
export function nearestD(tw: Tower) { let best = 0, bd = Infinity; for (let d = 0; d <= path!.len; d += 0.25) { const p = path!.at(d), x = Math.hypot(p.x - tw.x - 0.5, p.z - tw.z - 0.5); if (x < bd) { bd = x; best = d; } } return best; }
