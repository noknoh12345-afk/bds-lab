// Outside-the-engine rules: Hidden Wave arming by chat codes, mode badges, Sandbox commands.
// (Voidcore's gate and elevator live in lobby.ts; the engine runs waves 41-42 and the sandbox match itself.)
import { world, system, Player } from '@minecraft/server';
import { modes, rules, enemies, BadgeDef } from './defs';
import * as G from './game';
import { prof, saveProf } from './lobby';
import { skState } from './skills';
import { cmd } from './kit';

const T = (s: string) => s.replace(/_/g, ' ');

// ---------- Hidden Wave (its page): codes typed one message at a time during a Fallen match, every player with skills off ----------
const seq = new Map<string, number>();
function onChat(sender: Player, message: string) {
  const M = G.M, H = modes.Fallen?.hidden;
  if (!M || !H || M.mode !== 'Fallen' || M.over || M.wave > 40 || M.hidden?.armed || !M.players.includes(sender.name)) return;
  const msg = message.trim(); if (!/^\d+$/.test(msg)) return;
  const i = seq.get(sender.name) ?? 0;
  if (msg !== H.codes[i]) { seq.set(sender.name, msg === H.codes[0] ? 1 : 0); return; }
  seq.set(sender.name, i + 1);
  G.log('hidden_code', { player: sender.name, step: i + 1, of: H.codes.length });
  if (i + 1 < H.codes.length) return;
  seq.delete(sender.name);
  const on = world.getAllPlayers().filter((p) => M.players.includes(p.name) && skState(p).on).map((p) => p.name);
  if (on.length) { G.log('hidden_refused', { why: 'skills enabled', players: on }); return; }
  M.hidden = { armed: true }; M.skills = Object.fromEntries(M.players.map((n) => [n, {}]));
  G.log('hidden_armed', { player: sender.name, wave: M.wave, baseHP: M.baseHP, need: { baseHP: H.baseHP, king: H.king, within: H.kingWithin } });
  G.persist();
}
const chat = (world.afterEvents as unknown as { chatSend?: { subscribe(f: (e: { sender: Player; message: string }) => void): unknown } }).chatSend
  ?? (world.beforeEvents as unknown as { chatSend?: { subscribe(f: (e: { sender: Player; message: string }) => void): unknown } }).chatSend;
chat?.subscribe((e) => { const p = e.sender, m = e.message; system.run(() => onChat(p, m)); });
/** the same as typing a code in chat (tests, and servers without the chat event) */
cmd('tds:code', 'Type a Hidden Wave code', { code: 'int' }, (p, a) => { onChat(p, String(a.code)); return 'ok'; });   // the codes are numbers (a number is no string to the command parser)

// ---------- badges (mode pages): a triumph badge per mode, rewarded once ----------
export const triumphBadges = (): BadgeDef[] => (rules.badges ?? []).filter((b) => b.cond === 'triumph');
G.onEnd.push((m, r) => {
  if (r !== 'win' || m.sandbox) return;
  const done = [m.mode, ...(m.hidden?.on ? ['Hidden Wave'] : [])];
  for (const p of world.getAllPlayers()) {
    if (!m.players.includes(p.name)) continue;
    const pr = prof(p); pr.badges ??= []; let changed = false;
    for (const b of triumphBadges()) {
      if (!b.mode || !done.includes(b.mode) || pr.badges.includes(b.name)) continue;
      pr.badges.push(b.name); pr.coins += b.coins; pr.gems += b.gems; if (b.crate) pr.crates[b.crate] = (pr.crates[b.crate] ?? 0) + 1; changed = true;
      G.log('badge', { player: p.name, badge: b.name, mode: b.mode, coins: b.coins, gems: b.gems, crate: b.crate });
    }
    if (changed) saveProf(p, pr);
  }
});
export function badgesText(p: Player): string {
  const pr = prof(p), own = new Set(pr.badges ?? []);
  return triumphBadges().map((b) => `${own.has(b.name) ? '✔' : '·'} ${b.name} (${b.mode}: ${[b.coins && `${b.coins} coins`, b.gems && `${b.gems} gems`, b.crate].filter(Boolean).join(', ')})`).join(' | ') || 'No badges';
}
cmd('tds:badges', 'Mode badges and their rewards', {}, (p) => badgesText(p));

// ---------- Sandbox (its page): summon any wave or enemy, set cash and base health ----------
const inSandbox = () => !!G.M?.sandbox && !G.M.over;
cmd('tds:sbwave', 'Sandbox: send a wave of any mode', { mode: 'string', wave: 'int' }, (_, a) => {
  if (!inSandbox()) return 'Not in a Sandbox match';
  const md = modes[T(a.mode)]; if (!md || md.sandbox) return `Modes: ${Object.keys(modes).filter((m) => !modes[m].sandbox).join(' ')}`;
  const groups = md.wave[String(a.wave)] ?? []; if (!groups.length) return `${T(a.mode)} has no wave ${a.wave}`;
  let k = 0; for (const g of groups) for (let i = 0; i < g.n; i++) { const name = g.e, mods = g.mods ?? []; system.runTimeout(() => { if (inSandbox()) G.debugSpawn(name, mods, 0); }, 1 + 12 * k++); }
  G.log('sandbox_wave', { mode: T(a.mode), wave: a.wave, enemies: k });
  return `${T(a.mode)} wave ${a.wave}: ${k} enemies`;
}, true);
cmd('tds:sbenemy', 'Sandbox: spawn an enemy (mods with commas)', { enemy: 'string', 'mods?': 'string' }, (_, a) => {
  if (!inSandbox()) return 'Not in a Sandbox match';
  const n = T(a.enemy); if (!enemies[n]) return `Unknown enemy ${n}`;
  G.debugSpawn(n, a.mods ? T(a.mods).split(',').map((x: string) => x.trim()).filter(Boolean) : [], 0); return `Spawned ${n}`;
}, true);
cmd('tds:sbcash', 'Sandbox: set your cash', { n: 'int' }, (p, a) => { if (!inSandbox()) return 'Not in a Sandbox match'; G.M!.cash[p.name] = Math.max(0, a.n); return `$${G.M!.cash[p.name]}`; }, true);
cmd('tds:sbhp', 'Sandbox: set the base health', { n: 'int' }, (_, a) => { if (!inSandbox()) return 'Not in a Sandbox match'; const M = G.M!; M.baseHP = Math.max(1, a.n); M.maxHP = Math.max(M.maxHP, M.baseHP); G.persist(); return `Base ${M.baseHP}/${M.maxHP}`; }, true);
