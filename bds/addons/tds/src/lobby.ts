// Out-of-match progression: profile (coins, gems, exp, level), tower shop, loadout, elevators, quests, rewards.
import { world, system, Player } from '@minecraft/server';
import { towers, modes, expFor, RULES } from './defs';
import { M, start, log, onEnd, Match } from './game';

export type Profile = { coins: number; gems: number; exp: number; level: number; owned: string[]; loadout: string[]; quests: Record<string, number>; day: number; wins: Record<string, number> };
const fresh = (): Profile => ({ coins: 0, gems: 0, exp: 0, level: 0, owned: ['Scout', 'Sniper'], loadout: ['Scout', 'Sniper'], quests: {}, day: 0, wins: {} });
export function prof(p: Player): Profile {
  const s = p.getDynamicProperty('tds:p') as string | undefined;
  const pr = s ? { ...fresh(), ...JSON.parse(s) } as Profile : fresh();
  const day = Math.floor(Date.now() / 86400000); if (pr.day !== day) { pr.day = day; pr.quests = {}; }
  return pr;
}
export const saveProf = (p: Player, pr: Profile) => p.setDynamicProperty('tds:p', JSON.stringify(pr));

export function addExp(pr: Profile, n: number) { pr.exp += n; while (pr.exp >= expFor(pr.level + 1)) { pr.exp -= expFor(pr.level + 1); pr.level++; } }

export function buy(p: Player, name: string): string {
  const d = towers[name]; if (!d) return `Unknown tower ${name}`;
  const u = d.unlock;
  if (!['free', 'coins', 'gems', 'level'].includes(u.kind) || ['Exclusive', 'Unavailable', 'Golden Perks', 'Evolved'].includes(d.category)) return `${name} is not sold (${d.category})`;
  const pr = prof(p); if (pr.owned.includes(name)) return `Already own ${name}`;
  if (u.kind === 'level' && pr.level < (u.value ?? 0)) return `Needs level ${u.value}`;
  if (u.kind === 'coins') { if (pr.coins < (u.value ?? 0)) return `Need ${u.value} coins`; pr.coins -= u.value ?? 0; }
  if (u.kind === 'gems') { if (pr.gems < (u.value ?? 0)) return `Need ${u.value} gems`; pr.gems -= u.value ?? 0; }
  pr.owned.push(name); saveProf(p, pr); log('unlock', { player: p.name, tower: name, kind: u.kind, value: u.value });
  return `Unlocked ${name}`;
}
export function equip(p: Player, slot: number, name: string): string {
  const pr = prof(p); if (slot < 1 || slot > 5) return 'Slots 1-5';
  if (name === 'none') { pr.loadout.splice(slot - 1, 1); saveProf(p, pr); return `Slot ${slot} cleared`; }
  if (!pr.owned.includes(name)) return `Not owned: ${name}`;
  pr.loadout = pr.loadout.filter((x) => x !== name); pr.loadout.splice(slot - 1, 0, name); pr.loadout = pr.loadout.slice(0, 5);
  saveProf(p, pr); log('equip', { player: p.name, slot, tower: name, loadout: pr.loadout }); return `Loadout: ${pr.loadout.join(', ')}`;
}

// ---------- elevators ----------
type Lift = { mode: string; players: string[]; at: number };
const lifts: Lift[] = [];
export function queue(p: Player, mode: string): string {
  const md = modes[mode]; if (!md) return `Modes: ${Object.keys(modes).join(' ')}`;
  const pr = prof(p); if (pr.level < md.level) return `${mode} needs level ${md.level}`;
  for (const l of lifts) l.players = l.players.filter((n) => n !== p.name);
  let l = lifts.find((x) => x.mode === mode && x.players.length < (mode === 'Hardcore' ? 3 : 4));
  if (!l) { l = { mode, players: [], at: system.currentTick + RULES.elevatorWait * 20 }; lifts.push(l); }
  l.players.push(p.name); log('elevator_join', { player: p.name, mode, count: l.players.length });
  return `Elevator ${mode}: ${l.players.length}/${mode === 'Hardcore' ? 3 : 4}, departs in ${Math.ceil((l.at - system.currentTick) / 20)}s`;
}
export function leaveLift(name: string) { for (const l of lifts) l.players = l.players.filter((n) => n !== name); }
export function departNow(mode: string) { const l = lifts.find((x) => x.mode === mode); if (l) l.at = system.currentTick; }
system.runInterval(() => {
  for (const l of [...lifts]) {
    if (!l.players.length) { lifts.splice(lifts.indexOf(l), 1); continue; }
    if (system.currentTick < l.at || (M && !M.over)) continue;
    const ps = world.getAllPlayers().filter((p) => l.players.includes(p.name));
    lifts.splice(lifts.indexOf(l), 1);
    if (!ps.length) continue;
    log('elevator_depart', { mode: l.mode, players: l.players });
    const lo = Object.fromEntries(ps.map((p) => [p.name, prof(p).loadout]));
    start(l.mode, ps); if (M) (M as Match & { loadouts?: Record<string, string[]> }).loadouts = lo;
  }
}, 20);

// ---------- quests (daily) ----------
export const QUESTS: Record<string, { text: string; need: number; coins: number }> = {
  kills: { text: 'Defeat 300 enemies', need: 300, coins: 150 },
  places: { text: 'Place 20 towers', need: 20, coins: 100 },
  win: { text: 'Win a match', need: 1, coins: 300 },
};
export function questAdd(p: Player, k: string, n: number) {
  const pr = prof(p), q = QUESTS[k]; if (!q) return;
  const was = pr.quests[k] ?? 0; if (was >= q.need) return;
  pr.quests[k] = Math.min(q.need, was + n);
  if (pr.quests[k] >= q.need) { pr.coins += q.coins; log('quest_done', { player: p.name, quest: k, coins: q.coins }); }
  saveProf(p, pr);
}

// ---------- rewards ----------
/** Easy mode's formula (wiki) applied to every mode's listed reward: R ÷ (1 + ((W ÷ wave) − 1)^1.3), full + triumph on a win. */
export function rewardFor(mode: string, wave: number, win: boolean) {
  const md = modes[mode], W = md.waves, f = (R: number) => (wave <= 0 ? 0 : Math.floor(R / (1 + Math.pow(W / wave - 1, 1.3))));
  return win ? { coins: md.rewards.coins, gems: md.rewards.gems, exp: md.rewards.exp } : { coins: f(md.rewards.coins), gems: f(md.rewards.gems), exp: f(md.rewards.exp) };
}
onEnd.push((m, r) => {
  const rw = rewardFor(m.mode, m.wave, r === 'win');
  for (const p of world.getAllPlayers()) {
    if (!m.players.includes(p.name)) continue;
    const pr = prof(p); pr.coins += rw.coins; pr.gems += rw.gems; addExp(pr, rw.exp);
    if (r === 'win') pr.wins[m.mode] = (pr.wins[m.mode] ?? 0) + 1;
    saveProf(p, pr);
    if (r === 'win') questAdd(p, 'win', 1);
    questAdd(p, 'kills', m.stats.kills);
    log('reward', { player: p.name, result: r, ...rw, level: pr.level, coinsTotal: pr.coins });
  }
});
