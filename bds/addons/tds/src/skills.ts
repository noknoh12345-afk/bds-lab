// Skill tree (Skills page): four paths of levelled skills bought with coins (or skill credits after a reset).
// This file keeps the levels on the player and hands them to the match through onStart; the engine applies the effects.
import { Player } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { rules, modes, SkillDef } from './defs';
import { onStart, log } from './game';
import { prof, saveProf } from './lobby';
import { cmd, ask } from './kit';

export type SkillState = { lv: Record<string, number>; credits: number; resets: number; on: boolean };
const KEY = 'tds:sk';
export const skillDefs: SkillDef[] = rules.skills?.list ?? [];
const PATHS = ['Offensive', 'Economy', 'Strategy', 'Defense'];
const T = (s: string) => s.replace(/_/g, ' ');
export const skillDef = (name: string) => skillDefs.find((s) => s.name.toLowerCase() === name.toLowerCase());

export function skState(p: Player): SkillState {
  const raw = p.getDynamicProperty(KEY) as string | undefined;
  const s: SkillState = { lv: {}, credits: 0, resets: 0, on: true };
  if (raw) { try { Object.assign(s, JSON.parse(raw)); } catch { /* a broken save starts empty */ } }
  return s;
}
export const saveSk = (p: Player, s: SkillState) => p.setDynamicProperty(KEY, JSON.stringify(s));

/** price of one level (Skills page): floor((base × level)^exponent), then to the nearest multiple of 5 */
export const skillCost = (d: SkillDef, level: number) => Math.round(Math.floor(Math.pow((d.base ?? 0) * level, d.exp ?? 1)) / 5) * 5;
/** everything paid for the levels owned (what a reset refunds 95% of) */
export const skillsSpent = (s: SkillState) => skillDefs.reduce((a, d) => { let t = 0; for (let l = 1; l <= (s.lv[d.name] ?? 0); l++) t += skillCost(d, l); return a + t; }, 0);

/** why the next level cannot be bought (max level, or the previous skill of the path not at its required level) */
export function blocked(s: SkillState, d: SkillDef): string | undefined {
  const L = (s.lv[d.name] ?? 0) + 1;
  if (L > d.levels) return `${d.name} is at its max level ${d.levels}`;
  if (d.req && (s.lv[d.req.name] ?? 0) < d.req.level) return `${d.name} needs ${d.req.name} at level ${d.req.level}`;
  return undefined;
}
/** after a reset only credits pay, until no upgrade at all can be paid with the credits left; then coins again */
const creditsOnly = (s: SkillState) => s.credits > 0 && skillDefs.some((d) => !blocked(s, d) && skillCost(d, (s.lv[d.name] ?? 0) + 1) <= s.credits);

export function buySkill(p: Player, name: string): string {
  const d = skillDef(name); if (!d) return `Skills: ${skillDefs.map((x) => x.name.replace(/ /g, '_')).join(' ')}`;
  const s = skState(p), why = blocked(s, d); if (why) return why;
  const L = (s.lv[d.name] ?? 0) + 1, c = skillCost(d, L);
  let paid: 'credits' | 'coins';
  if (creditsOnly(s)) { if (s.credits < c) return `After a reset skills are bought with credits: need ${c}, have ${s.credits}`; s.credits -= c; paid = 'credits'; }
  else { const pr = prof(p); if (pr.coins < c) return `Need ${c} coins`; pr.coins -= c; saveProf(p, pr); paid = 'coins'; }
  s.lv[d.name] = L; saveSk(p, s);
  log('skill_buy', { player: p.name, skill: d.name, level: L, cost: c, paid, credits: s.credits });
  return `${d.name} → Lv${L} (${c} ${paid})`;
}

/** reset (Skills page): 95% of what was spent comes back as credits; it costs coins, more after every reset */
export function resetSkills(p: Player): string {
  const s = skState(p), sk = rules.skills ?? { refund: 0.95, resetCost: 200, resetStep: 200 };
  const fee = sk.resetCost + sk.resetStep * s.resets, spent = skillsSpent(s);
  if (!spent) return 'No skills to reset';
  const pr = prof(p); if (pr.coins < fee) return `A reset costs ${fee} coins`;
  pr.coins -= fee; saveProf(p, pr);
  const back = Math.floor(spent * sk.refund);
  s.credits += back; s.resets++; s.lv = {}; saveSk(p, s);
  log('skill_reset', { player: p.name, fee, spent, credits: s.credits, resets: s.resets });
  return `Skills reset: +${back} credits (${s.credits}), fee ${fee} coins`;
}

/** levels this player brings into a match ({} when the Skills Enabled setting is off) */
export function skillLevels(p: Player): Record<string, number> { const s = skState(p); return s.on ? { ...s.lv } : {}; }
export const skillsOn = (p: Player) => skState(p).on;

export function skillsText(p: Player): string {
  const s = skState(p), pr = prof(p);
  const head = `Skills ${s.on ? 'on' : 'off'} · coins ${pr.coins} · credits ${s.credits} · resets ${s.resets} (next ${(rules.skills?.resetCost ?? 200) + (rules.skills?.resetStep ?? 200) * s.resets})`;
  const rows = PATHS.map((path) => `${path}: ` + skillDefs.filter((d) => d.type === path).map((d) => { const l = s.lv[d.name] ?? 0; return `${d.name} ${l}/${d.levels}${l < d.levels ? ` (${skillCost(d, l + 1)})` : ''}`; }).join(', '));
  return [head, ...rows].join(' | ');
}

export async function skillsMenu(p: Player): Promise<void> {
  const s = skState(p), pr = prof(p);
  const list = PATHS.flatMap((path) => skillDefs.filter((d) => d.type === path));
  const f = new ActionFormData().title('§l§dSkills').body(`Coins ${pr.coins} · credits ${s.credits}${s.on ? '' : ' · §cskills are off'}`);
  for (const d of list) { const l = s.lv[d.name] ?? 0, why = blocked(s, d); f.button(`${why ? '§8' : ''}${d.type[0]} ${d.name} ${l}/${d.levels}${l < d.levels ? ` §8${skillCost(d, l + 1)}` : ''}`); }
  f.button(`Reset §8${(rules.skills?.resetCost ?? 200) + (rules.skills?.resetStep ?? 200) * s.resets} coins`); f.button(`Skills enabled: ${s.on ? 'on' : 'off'}`);
  const r = await ask(p, f); if (!r || r.canceled || r.selection === undefined) return;
  if (r.selection < list.length) p.sendMessage(buySkill(p, list[r.selection].name));
  else if (r.selection === list.length) p.sendMessage(resetSkills(p));
  else { const t = skState(p); t.on = !t.on; saveSk(p, t); p.sendMessage(`Skills ${t.on ? 'on' : 'off'}`); }
}

// the match gets every player's levels; modes without skills (Voidcore) and an armed Hidden Wave get none
onStart.push((m, players) => {
  const off = !!modes[m.mode]?.noSkills || !!m.hidden?.armed || !!m.sandbox;
  m.skills = Object.fromEntries(players.map((p) => [p.name, off ? {} : skillLevels(p)]));
});

cmd('tds:skills', 'Your skill tree', {}, (p) => skillsText(p));
cmd('tds:skill', 'Buy one level of a skill (name with _ for spaces)', { skill: 'string' }, (p, a) => buySkill(p, T(a.skill)));
cmd('tds:skillreset', 'Reset your skills for credits', {}, (p) => resetSkills(p));
cmd('tds:skillson', 'Skills Enabled setting', { on: 'bool' }, (p, a) => { const s = skState(p); s.on = a.on; saveSk(p, s); log('skills_setting', { player: p.name, on: a.on }); return `Skills ${a.on ? 'on' : 'off'}`; });
cmd('tds:skillmenu', 'Skill tree menu', {}, (p) => { void skillsMenu(p); });
