// Out-of-match progression: profile, levels, store, loadout, elevators, quests, match rewards (wiki pages named per rule).
import { world, system, Player } from '@minecraft/server';
import { towers, enemies, modes, maps, expFor, rules, rewardFor, xpBoostAt, slotsAt, stats, QuestDef, QuestObj } from './defs';
import { M, start, log, onEnd, Match } from './game';
import { modReward } from './modifiers';
import { expedition, preparing, wildSeed, wildName } from './site';
import { menu } from './kit';

export type Obj = { do: QuestObj['do']; need: number; prog: number; tower?: string; role?: string; boss?: string; status?: string; map?: string; mode?: string; players?: number; cash?: number; hpPct?: number; loadoutMax?: number };
export type Quest = { title: string; kind: 'daily' | 'weekly'; text: string; objs: Obj[]; done: boolean };
export type Profile = { coins: number; gems: number; exp: number; level: number; texp: number; owned: string[]; loadout: string[]; wins: Record<string, number>; mapWins: Record<string, number>; crates: Record<string, number>; badges: string[]; day: number; week: number; quests: Quest[] };

const DAY = 86400000;
export const today = () => Math.floor(Date.now() / DAY);
/** weeks start on Monday 00:00 UTC (1970-01-01 was a Thursday) */
export const weekOf = (day: number) => Math.floor((day + 3) / 7);
const fresh = (): Profile => ({ coins: rules.levelRewards['0']?.coins ?? 0, gems: 0, exp: 0, level: 0, texp: 0, owned: Object.keys(towers).filter((n) => towers[n].unlock.kind === 'free' && sold(n)), loadout: [], wins: {}, mapWins: {}, crates: {}, badges: [], day: -1, week: -1, quests: [] });

export function prof(p: Player): Profile {
  const s = p.getDynamicProperty('tds:p') as string | undefined;
  const pr: Profile = s ? { ...fresh(), ...JSON.parse(s) } : fresh();
  if (!pr.loadout.length) pr.loadout = pr.owned.slice(0, slotsAt(pr.level));
  if (!Array.isArray(pr.quests)) { pr.quests = []; pr.day = pr.week = -1; }   // saved by an older version
  const d = today(), w = weekOf(d);
  if (pr.day !== d) { pr.quests = pr.quests.filter((q) => q.kind !== 'daily').concat(draw(p.name, pr, 'daily', d)); pr.day = d; }
  if (pr.week !== w) { pr.quests = pr.quests.filter((q) => q.kind !== 'weekly').concat(draw(p.name, pr, 'weekly', w)); pr.week = w; }
  return pr;
}
export const saveProf = (p: Player, pr: Profile) => p.setDynamicProperty('tds:p', JSON.stringify(pr));

// ---------- levels (Levels page) ----------
/** towers given by reaching a level ("Reaching some Levels also unlock new towers") */
const levelTowers = (lv: number) => Object.keys(towers).filter((n) => towers[n].unlock.kind === 'level' && (towers[n].unlock.value ?? Infinity) <= lv && sold(n));
export function addExp(pr: Profile, n: number, who = '') {
  pr.exp += n;
  while (pr.exp >= expFor(pr.level + 1)) {
    pr.exp -= expFor(pr.level + 1); pr.level++;
    const c = rules.levelRewards[String(pr.level)]?.coins ?? 0; pr.coins += c;
    const got = levelTowers(pr.level).filter((t) => !pr.owned.includes(t)); pr.owned.push(...got);
    log('level_up', { player: who, level: pr.level, coins: c, towers: got, slots: slotsAt(pr.level) });
  }
}
/** set a level directly (tests): towers and slots follow, as if reached */
export function setLevel(pr: Profile, lv: number) { pr.level = lv; for (const t of levelTowers(lv)) if (!pr.owned.includes(t)) pr.owned.push(t); pr.loadout = pr.loadout.slice(0, slotsAt(lv)); }

// ---------- store and loadout ----------
const SHOP = ['Starter', 'Intermediate', 'Advanced', 'Hardcore'];
export const sold = (n: string) => SHOP.includes(towers[n]?.category) && ['free', 'coins', 'gems', 'level'].includes(towers[n].unlock.kind);
export function buy(p: Player, name: string): string {
  const d = towers[name]; if (!d) return `Unknown tower ${name}`;
  if (!sold(name)) return `${name} is not sold (${d.category})`;
  const u = d.unlock, pr = prof(p); if (pr.owned.includes(name)) return `Already own ${name}`;
  if (u.kind === 'level') return `${name} unlocks at level ${u.value}`;
  if (u.level && pr.level < u.level) return `${name} is sold from level ${u.level}`;
  if (u.triumph && !pr.mapWins[u.triumph]) return `Triumph ${u.triumph} first`;
  const wallet = u.kind === 'gems' ? 'gems' : 'coins', cost = u.value ?? 0;
  if (pr[wallet] < cost) return `Need ${cost} ${wallet}`;
  pr[wallet] -= cost; pr.owned.push(name); saveProf(p, pr); log('unlock', { player: p.name, tower: name, kind: u.kind, value: cost, left: pr[wallet] });
  return `Unlocked ${name}`;
}
export function equip(p: Player, slot: number, name: string): string {
  const pr = prof(p), n = slotsAt(pr.level); if (slot < 1 || slot > n) return `Slots 1-${n} (the fifth opens at level ${rules.fifthSlot})`;
  if (name === 'none') { pr.loadout.splice(slot - 1, 1); saveProf(p, pr); return `Slot ${slot} cleared`; }
  if (!pr.owned.includes(name)) return `Not owned: ${name}`;
  pr.loadout = pr.loadout.filter((x) => x !== name); pr.loadout.splice(slot - 1, 0, name); pr.loadout = pr.loadout.slice(0, n);
  saveProf(p, pr); log('equip', { player: p.name, slot, tower: name, loadout: pr.loadout }); return `Loadout: ${pr.loadout.join(', ')}`;
}

// ---------- elevators (Elevators page) ----------
/** votes: a training ground's name, or "wild:<seed>" for one of the three places (cands) offered; veto and ready: who asked */
type Lift = { mode: string; size: number; players: string[]; at: number; votes: Record<string, string>; cands: number[]; round: number; veto: string[]; ready: string[] };
const lifts: Lift[] = [];
/** Survival elevators for the difficulty modes; Hardcore and Voidcore have their own (3 players, map rotating every minute) */
const liftOf = (mode: string) => rules.elevators[mode] ?? rules.elevators.Survival;
const rotates = (mode: string) => !!rules.elevators[mode]?.rotate;
/** the map a rotating elevator (Hardcore, Voidcore) goes to this minute */
// every elevator goes on an expedition (src/site.ts) unless its players vote for a training ground; the place changes every minute
const period = (mode: string, ms = Date.now()) => Math.floor(ms / 1000 / (rules.elevators[mode]?.rotate ?? 60));
export const rotMap = (mode: string, ms = Date.now()) => wildName(wildSeed(mode, period(mode, ms)));
export const hardcoreMap = (ms = Date.now()) => rotMap('Hardcore', ms);
export function queue(p: Player, mode: string, size?: number): string {
  const md = modes[mode]; if (!md) return `Modes: ${Object.keys(modes).join(' ')}`;
  const pr = prof(p); if (pr.level < md.level && !p.hasTag('tds_dev')) return `${mode} needs level ${md.level}`;
  if (md.needsTriumph && !(pr.wins[md.needsTriumph] > 0) && !p.hasTag('tds_dev')) return `${mode} needs a ${md.needsTriumph} triumph`;
  const L = liftOf(mode);
  for (const l of lifts) l.players = l.players.filter((n) => n !== p.name);
  let l = lifts.find((x) => x.mode === mode && x.players.length && x.players.length < x.size);
  if (!l) {   // the first player chooses the party size; the timer starts then
    const s = Math.max(1, Math.min(L.max, md.maxPlayers ?? 4, size ?? L.max));
    l = { mode, size: s, players: [], at: system.currentTick + L.wait * 20, votes: {}, cands: rotates(mode) ? [] : candsFor(mode, 0), round: 0, veto: [], ready: [] }; lifts.push(l);
  }
  l.players.push(p.name); log('elevator_join', { player: p.name, mode, count: l.players.length, size: l.size, map: rotates(mode) ? rotMap(mode) : null });
  if (l.players.length >= l.size) l.at = system.currentTick;
  return `Elevator ${mode}: ${l.players.length}/${l.size}${rotates(mode) ? ` · ${rotMap(mode)}` : ''}, departs in ${Math.max(0, Math.ceil((l.at - system.currentTick) / 20))}s${l.cands.length ? ` · vote: ${l.cands.map(wildName).join(' / ')}` : ''}`;
}
export function voteMap(p: Player, map: string): string {
  const l = lifts.find((x) => x.players.includes(p.name)); if (!l) return 'Not in an elevator';
  if (rotates(l.mode)) return `${l.mode} elevators go to ${rotMap(l.mode)}`;
  if (map !== 'Wild' && !(maps[map] && !maps[map].site)) return `Maps: ${[...Object.keys(maps).filter((n) => !maps[n].site), 'Wild'].join(', ')}`;
  if (map === 'Wild') return voteWild(p, 1);
  l.votes[p.name] = map; log('map_vote', { player: p.name, map }); return `Voted ${map}`;
}
/** the intermission (Elevators page; the v1.8.0 notes: a veto may come again and again, each starts a 25 s timer) */
const candsFor = (mode: string, round: number) => [0, 1, 2].map((k) => wildSeed(`${mode}/${round}/${k}`, period(mode)));
const myLift = (p: Player) => lifts.find((x) => x.players.includes(p.name));
export function voteWild(p: Player, n: number): string {
  const l = myLift(p); if (!l) return 'Not in an elevator';
  if (rotates(l.mode)) return `${l.mode} elevators go to ${rotMap(l.mode)}`;
  const seed = l.cands[n - 1]; if (seed === undefined) return 'Places: 1, 2, 3';
  l.votes[p.name] = `wild:${seed}`; log('map_vote', { player: p.name, map: wildName(seed), place: n }); return `Voted ${wildName(seed)}`;
}
export function veto(p: Player): string {
  const l = myLift(p); if (!l) return 'Not in an elevator';
  if (rotates(l.mode)) return `${l.mode} elevators go to ${rotMap(l.mode)}`;
  if (!l.veto.includes(p.name)) l.veto.push(p.name);
  const need = Math.floor(l.players.length / 2) + 1;
  if (l.veto.length < need) return `Veto ${l.veto.length}/${need}`;
  l.round++; l.cands = candsFor(l.mode, l.round); l.veto = []; l.ready = []; l.votes = {}; l.at = system.currentTick + 25 * 20;
  log('elevator_veto', { mode: l.mode, round: l.round, places: l.cands.map(wildName) });
  const msg = `Veto: new places ${l.cands.map(wildName).join(' / ')}, departs in 25s`;
  for (const q of world.getAllPlayers()) if (l.players.includes(q.name) && q.name !== p.name) q.sendMessage(msg);
  return msg;
}
export function ready(p: Player): string {
  const l = myLift(p); if (!l) return 'Not in an elevator';
  if (!l.ready.includes(p.name)) l.ready.push(p.name);
  if (l.players.every((n) => l.ready.includes(n))) { l.at = system.currentTick; log('elevator_ready', { mode: l.mode, players: l.players }); return `Ready ${l.ready.length}/${l.players.length}: departing`; }
  return `Ready ${l.ready.length}/${l.players.length}`;
}
/** the lobby's form for the elevator a player is in: the three places with their votes, the training grounds, veto, ready */
export async function destinationMenu(p: Player) {
  const l = myLift(p); if (!l) { p.sendMessage('Not in an elevator'); return; }
  if (rotates(l.mode)) { p.sendMessage(`${l.mode} elevators go to ${rotMap(l.mode)}`); return; }
  const count = (v: string) => Object.values(l.votes).filter((x) => x === v).length;
  const grounds = Object.keys(maps).filter((n) => !maps[n].site);
  const items: [string, (p: Player) => unknown][] = [
    ...l.cands.map((s, i) => [`${wildName(s)} §8(${count(`wild:${s}`)})`, (q: Player) => q.sendMessage(voteWild(q, i + 1))] as [string, (p: Player) => unknown]),
    ...grounds.map((g) => [`§7${g} §8(${count(g)})`, (q: Player) => q.sendMessage(voteMap(q, g))] as [string, (p: Player) => unknown]),
    [`§cVeto §8(${l.veto.length}/${Math.floor(l.players.length / 2) + 1})`, (q: Player) => q.sendMessage(veto(q))],
    [`§aReady §8(${l.ready.length}/${l.players.length})`, (q: Player) => q.sendMessage(ready(q))],
  ];
  await menu(p, `Elevator ${l.mode}`, items, `Departs in ${Math.max(0, Math.ceil((l.at - system.currentTick) / 20))}s`);
}
export function leaveLift(name: string) { for (const l of lifts) l.players = l.players.filter((n) => n !== name); }
export function departNow(mode: string) { const l = lifts.find((x) => x.mode === mode); if (l) l.at = system.currentTick; }
system.runInterval(() => {
  for (const l of [...lifts]) {
    if (!l.players.length) { lifts.splice(lifts.indexOf(l), 1); continue; }
    if (system.currentTick < l.at || (M && !M.over) || preparing()) continue;
    const all = world.getAllPlayers(), ps = l.players.map((n) => all.find((p) => p.name === n)).filter((p): p is Player => !!p);   // in the order they got in
    lifts.splice(lifts.indexOf(l), 1);
    if (!ps.length) continue;
    // the most votes win (a tie: one of them); no vote: the first place offered; a rotating elevator: this minute's place
    let map = '', seed: number | undefined = rotates(l.mode) ? wildSeed(l.mode, period(l.mode)) : l.cands[0];
    if (!rotates(l.mode)) {
      const tally: Record<string, number> = {}; for (const v of Object.values(l.votes)) tally[v] = (tally[v] ?? 0) + 1;
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1]), best = top.filter((x) => x[1] === top[0]?.[1]);
      if (best.length) { const w = best[Math.floor(Math.random() * best.length)][0]; if (w.startsWith('wild:')) seed = Number(w.slice(5)); else { map = w; seed = undefined; } }
    }
    if (seed !== undefined) map = wildName(seed);
    log('elevator_depart', { mode: l.mode, players: l.players, size: l.size, map });
    const lo = Object.fromEntries(ps.map((p) => [p.name, prof(p).loadout]));
    if (seed !== undefined) void expedition(l.mode, ps, { seed }).then((r) => { if (M) M.loadouts = lo; log('expedition', { mode: l.mode, result: r }); });
    else { start(l.mode, ps, map); if (M) M.loadouts = lo; }
  }
}, 20);

// ---------- quests (Quests page) ----------
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
/** a need between the page's low and high end, by level (0 → low, 100+ → high) */
export const scaled = (r: [number, number] | undefined, level: number, def = 1) => (r ? Math.round(r[0] + (r[1] - r[0]) * Math.min(1, level / 100)) : def);
const ROLES = ['Cliff', 'Spawner', 'Offense', 'Defense', 'Support'];
export const hasRole = (n: string, role: string) => { const d = towers[n]; if (!d) return false; if (role === 'Cliff') return d.placement !== 'ground'; if (role === 'Spawner') return d.levels.some((_, i) => !!stats(n, i).spawnrate); return d.role === role; };
const fights = (n: string) => !!stats(n, 0).dmg || towers[n].levels.some((_, i) => !!stats(n, i).dmg);
const abilityTowers = (pr: Profile, support = false) => pr.owned.filter((n) => towers[n]?.abilities?.some((a) => a.simulated) && (!support || towers[n].role === 'Support'));
/** major bosses: the strongest boss in the last wave of each mode the player can enter */
export function majorBosses(level: number) {
  const out: string[] = [];
  for (const [m, md] of Object.entries(modes)) {
    if (md.level > level) continue;
    const last = (md.wave[String(md.waves)] ?? []).filter((g) => enemies[g.e]?.boss || g.mods?.includes('Boss'));
    const b = last.sort((a, c) => (enemies[c.e]?.per[m]?.hp ?? 0) - (enemies[a.e]?.per[m]?.hp ?? 0))[0]?.e; if (b && !out.includes(b)) out.push(b);
  }
  return out;
}
/** turn a page quest into objectives for this player; undefined when it cannot be done with what they own */
export function makeQuest(def: QuestDef, pr: Profile, r: () => number, force: Record<string, string> = {}): Quest | undefined {
  const pickOf = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const lv = pr.level, objs: Obj[] = [];
  const ownedFight = pr.owned.filter(fights), support = def.objs.some((o) => o.support);
  const tower = force.tower ?? (def.objs.some((o) => o.do === 'ability') ? pickOf(abilityTowers(pr, support)) : support ? pickOf(abilityTowers(pr, true)) : pickOf(ownedFight));
  if (def.objs.some((o) => o.tower) && !tower) return undefined;
  const role = force.role ?? pickOf(ROLES), status = force.status ?? pickOf(rules.quests.statuses);
  const bosses = majorBosses(lv), modeNames = Object.keys(modes).filter((m) => modes[m].level <= lv), mapNames = Object.keys(maps).filter((n) => !maps[n].site);   // the named maps (training grounds), not the expeditions' sites
  const shuffled = <T,>(xs: T[]) => xs.map((x) => [r(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const bossList = force.boss ? force.boss.split(',') : shuffled(bosses);
  let bi = 0;
  for (const o of def.objs) {
    const base: Obj = { do: o.do, need: o.do === 'triumph' ? scaled(o.times, lv) : scaled(o.need, lv), prog: 0 };
    if (o.tower) base.tower = tower;
    if (o.do === 'status') base.status = status;
    if (o.role) base.role = role;
    if (o.cash) base.cash = scaled(o.cash, lv);
    if (o.hpPct) base.hpPct = scaled(o.hpPct, lv);
    if (o.loadoutMax) base.loadoutMax = o.loadoutMax;
    if (o.players) base.players = force.players ? +force.players : pickOf(o.players);
    if (o.map) base.map = force.map ?? pickOf(mapNames);
    if (o.boss) { base.boss = bossList[bi++ % Math.max(1, bossList.length)]; if (!base.boss) return undefined; base.need = 1; }
    if (o.maps) { for (const m of (force.maps?.split(',') ?? shuffled(mapNames)).slice(0, Math.min(o.maps, mapNames.length))) objs.push({ ...base, map: m, need: 1 }); continue; }
    if (o.modes) { if (modeNames.length < 1) return undefined; for (const m of (force.modes?.split(',') ?? shuffled(modeNames)).slice(0, Math.min(o.modes, modeNames.length))) objs.push({ ...base, mode: m, need: 1 }); continue; }
    objs.push(base);
  }
  if (def.objs.filter((o) => o.boss).length > 1 && new Set(objs.filter((o) => o.boss).map((o) => o.boss)).size < objs.filter((o) => o.boss).length) return undefined;   // two separate bosses
  const b0 = objs.find((o) => o.boss)?.boss ?? '', m0 = objs.find((o) => o.map)?.map ?? '';
  const text = def.objs.some((o) => o.role) ? `${role} Formation` : def.title.replace(/^Tower Spotlight$/, 'TOWER Spotlight').replace(/TOWER/g, tower ?? '').replace('BOSS', b0).replace('MAP', m0).trim();
  return { title: def.title, kind: def.kind, text, objs, done: false };
}
function draw(name: string, pr: Profile, kind: 'daily' | 'weekly', period: number): Quest[] {
  const r = rng(hash(`${name}:${kind}:${period}`)), pool = rules.quests.list.filter((q) => q.kind === kind), out: Quest[] = [];
  const order = pool.map((q) => [r(), q] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const q of order) { if (out.length >= rules.quests[kind]) break; const made = makeQuest(q, pr, r); if (made) out.push(made); }
  return out;
}
/** put a given page quest into a player's list (tests), replacing one of the same title; "none" empties the list */
export function forceQuest(p: Player, title: string, force: Record<string, string>): string {
  if (title === 'none') { const pr = prof(p); pr.quests = []; saveProf(p, pr); return 'No quests'; }
  const def = rules.quests.list.find((q) => q.title === title); if (!def) return `Quests: ${rules.quests.list.map((q) => q.title).join(' | ')}`;
  const pr = prof(p), q = makeQuest(def, pr, rng(1), force); if (!q) return `${title} cannot be given with what you own`;
  const i = pr.quests.findIndex((x) => x.title === title);
  if (i < 0) pr.quests.push(q); else pr.quests[i] = q;
  saveProf(p, pr); log('quest_set', { player: p.name, title, text: q.text, objs: q.objs.map(objText) }); return q.text;
}
export const objText = (o: Obj) => {
  const w = o.do === 'triumph' ? `Triumph${o.mode ? ` ${o.mode}` : ''}${o.map ? ` on ${o.map}` : ''}${o.tower ? ` with ${o.tower}` : ''}${o.role ? ` with a ${o.role} tower` : ''}${o.players ? ` in a team of ${o.players}` : ''}${o.cash ? ` holding $${o.cash}` : ''}${o.hpPct ? ` above ${o.hpPct}% base health` : ''}${o.loadoutMax ? ` with ${o.loadoutMax} or fewer towers` : ''}`
    : o.do === 'damage' ? `Deal damage with ${o.tower}` : o.do === 'kills' ? `Defeat enemies${o.tower ? ` with ${o.tower}` : ''}` : o.do === 'boss' ? `Defeat ${o.boss}` : o.do === 'status' ? `Apply ${o.status}` : o.do === 'ability' ? `Use ${o.tower}'s ability` : 'Earn cash';
  return `${w} ${Math.min(o.prog, o.need)}/${o.need}`;
};

/** progress of one finished match for one player (counts for the owner of the towers) */
export function questsAfter(p: Player, pr: Profile, m: Match, win: boolean) {
  const s = m.pst?.[p.name]; if (!s) return;
  const lo = m.loadouts?.[p.name] ?? pr.loadout, hp = (Math.max(0, m.baseHP) / m.maxHP) * 100, cash = m.cash[p.name] ?? 0;
  for (const q of pr.quests) {
    if (q.done) continue;
    for (const o of q.objs) {
      if (o.prog >= o.need) continue;
      let add = 0;
      if (o.do === 'damage') add = s.dmg[o.tower!] ?? 0;
      else if (o.do === 'kills') add = o.tower ? s.killsBy[o.tower] ?? 0 : s.kills;
      else if (o.do === 'status') add = s.status[o.status!] ?? 0;
      else if (o.do === 'ability') add = s.abil[o.tower!] ?? 0;
      else if (o.do === 'cash') add = s.earned;
      else if (o.do === 'boss') add = s.bosses.includes(o.boss!) ? 1 : 0;
      else if (o.do === 'triumph' && win && (!o.tower || s.placed.includes(o.tower)) && (!o.role || s.placed.some((n) => hasRole(n, o.role!))) && (!o.map || m.map === o.map) && (!o.mode || m.mode === o.mode)
        && (!o.players || m.players.length === o.players) && (!o.cash || cash >= o.cash) && (!o.hpPct || hp >= o.hpPct) && (!o.loadoutMax || lo.length <= o.loadoutMax)) add = 1;
      o.prog = Math.min(o.need, o.prog + Math.floor(add));
    }
    if (q.objs.every((o) => o.prog >= o.need)) {
      q.done = true; const d = rules.quests.list.find((x) => x.title === q.title)!;
      pr.coins += d.coins ?? 0; pr.gems += d.gems ?? 0; addExp(pr, d.exp, p.name); if (d.crate) pr.crates[d.crate] = (pr.crates[d.crate] ?? 0) + 1;
      log('quest_done', { player: p.name, quest: q.title, text: q.text, coins: d.coins ?? 0, gems: d.gems ?? 0, exp: d.exp, crate: d.crate ?? null });
    }
  }
}

// ---------- match rewards (mode pages) ----------
/** XP Boost: on its days unless a test fixed it (tds:xpboost on/off) */
export const xpBoost = () => { const f = world.getDynamicProperty('tds:xpboost') as string | undefined; return f === 'on' ? rules.xpBoost.mult : f === 'off' ? 1 : xpBoostAt(Date.now()); };
/** Hidden Wave triumph (its page): its own reward instead of Fallen's — the last regular difficulty label, plus the first-triumph gems once */
function hiddenReward(first: boolean, boost: number) {
  const H = modes.Fallen?.hidden, reg = (H?.rewards ?? []).filter((x) => !/First/i.test(x.label)), last = reg[reg.length - 1], once = (H?.rewards ?? []).find((x) => /First/i.test(x.label));
  return { coins: 0, gems: (last?.gems ?? 0) + (first ? once?.gems ?? 0 : 0), exp: Math.floor((last?.exp ?? 0) * boost + 1e-9), texp: last?.texp ?? 0 };
}
/** the last match reward of each player (the HUD shows it under the result banner) */
export const lastReward = new Map<string, { coins: number; gems: number; exp: number }>();
onEnd.push((m, r) => {
  if (m.sandbox || modes[m.mode]?.sandbox) { log('reward', { mode: m.mode, result: r, sandbox: true, none: true }); return; }   // Sandbox gives nothing
  const win = r === 'win', boost = xpBoost(), hidden = win && !!m.hidden?.on, base = rewardFor(m.mode, win ? modes[m.mode].waves : m.wave, win, boost);
  for (const p of world.getAllPlayers()) {
    if (!m.players.includes(p.name)) continue;
    const pr = prof(p), lv0 = pr.level, r0 = hidden ? hiddenReward(!(pr.wins['Hidden Wave'] > 0), boost) : base, mr = 1 + modReward(m);   // modifiers raise rewards by their page's %
    const rw = mr === 1 ? r0 : { coins: Math.floor(r0.coins * mr), gems: Math.floor(r0.gems * mr), exp: Math.floor(r0.exp * mr), texp: Math.floor(r0.texp * mr) };
    pr.coins += rw.coins; pr.gems += rw.gems; pr.texp += rw.texp; addExp(pr, rw.exp, p.name);
    if (win) { pr.wins[m.mode] = (pr.wins[m.mode] ?? 0) + 1; pr.mapWins[m.map] = (pr.mapWins[m.map] ?? 0) + 1; }
    if (hidden) pr.wins['Hidden Wave'] = (pr.wins['Hidden Wave'] ?? 0) + 1;
    lastReward.set(p.name, { coins: rw.coins, gems: rw.gems, exp: rw.exp });
    log('reward', { player: p.name, result: r, mode: m.mode, wave: m.wave, ...rw, boost, level: pr.level, from: lv0, coinsTotal: pr.coins, gemsTotal: pr.gems, ...(hidden && { hidden: true }) });
    questsAfter(p, pr, m, win);
    saveProf(p, pr);
  }
});
