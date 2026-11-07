// Match modifiers (Modifiers page; each modifier's own page gives its effect and reward boost).
// A player picks modifiers for their next match; the first player of a match decides for it. The effects live in src/game.ts.
import { Player } from '@minecraft/server';
import { rules, towers, maps } from './defs';
import { cmd, menu } from './kit';
import * as G from './game';

const all = () => rules.modifiers ?? [];
const key = 'tds:mods';
export const chosen = (p: Player): string[] => { try { const v = JSON.parse((p.getDynamicProperty(key) as string) ?? '[]'); return Array.isArray(v) ? v.filter((n) => all().some((m) => m.name === n)) : []; } catch { return []; } };
const save = (p: Player, l: string[]) => p.setDynamicProperty(key, JSON.stringify(l));
/** the reward boost of a match's modifiers (their pages' "rewards increase", added up) */
export const modReward = (m: G.Match) => (m.mods ?? []).reduce((a, n) => a + (all().find((x) => x.name === n)?.reward ?? 0), 0);

export function toggleMod(p: Player, name: string): string {
  const m = all().find((x) => x.name.toLowerCase() === name.toLowerCase()); if (!m) return `Modifiers: ${all().map((x) => x.name).join(', ')}`;
  const l = chosen(p), i = l.indexOf(m.name);
  if (i >= 0) l.splice(i, 1); else l.push(m.name);
  save(p, l); G.log('modifier_pick', { player: p.name, mods: l });
  return `${m.name} ${i >= 0 ? 'off' : 'on'} · rewards +${Math.round(l.reduce((a, n) => a + (all().find((x) => x.name === n)?.reward ?? 0), 0) * 100)}%`;
}
export const modsText = (p: Player) => { const l = chosen(p); return l.length ? `${l.join(', ')} · rewards +${Math.round(l.reduce((a, n) => a + (all().find((x) => x.name === n)?.reward ?? 0), 0) * 100)}%` : 'No modifiers'; };
export async function modsMenu(p: Player) {
  const l = chosen(p);
  const i = await menu(p, 'Modifiers', all().map((m) => [`${l.includes(m.name) ? '§a✔ ' : '§7'}${m.name} §8+${Math.round(m.reward * 100)}%`, () => 0]), modsText(p));
  if (i !== undefined) p.sendMessage(toggleMod(p, all()[i].name));
}

cmd('tds:mod', 'Turn a match modifier on or off for your next match (name with _ for spaces)', { name: 'string' }, (p, a) => toggleMod(p, String(a.name).replace(/_/g, ' ')));
cmd('tds:mods', 'Your match modifiers', {}, (p) => modsText(p));
cmd('tds:modmenu', 'Pick match modifiers', {}, (p) => { void modsMenu(p); });

G.onStart.push((m, players) => {
  if (m.sandbox || !players.length) return;
  const l = chosen(players[0]); if (!l.length) return;
  m.mods = l; G.log('modifiers', { mods: l, reward: +modReward(m).toFixed(2) });
});

/** Random Tower Positions: every wave each tower jumps to a random free spot of its kind */
G.hooks.waveEnd.push(() => {
  const M = G.M; if (!M || !G.mod('Random Tower Positions') || !G.path) return;
  const y0 = maps[M.map].y, wild = maps[M.map].site ? G.siteHooks.spots?.() ?? [] : null;   // an expedition: the spots of its land
  for (const tw of [...M.towers]) {
    if (tw.temp !== undefined) continue;
    const kind = towers[tw.name].placement;
    if (wild) { const ok = wild.filter((q) => kind === 'both' || q.kind === kind); for (let k = 0; k < 20 && ok.length; k++) { const q = ok[Math.floor(Math.random() * ok.length)]; if (!G.moveTower(tw, q.x, q.y, q.z)) break; } continue; }
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(Math.random() * 62) - 31, z = Math.floor(Math.random() * 62) - 31, y = kind === 'cliff' ? y0 + 2 : kind === 'both' && Math.random() < 0.5 ? y0 + 2 : y0;
      if (G.path.dist(x + 0.5, z + 0.5) > 14) continue;
      if (!G.canStand(tw.name, x, y, z, tw)) { G.moveTower(tw, x, y, z); break; }
    }
  }
});
