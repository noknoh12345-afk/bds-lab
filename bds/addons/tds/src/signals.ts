// Team signals: the original added a team communication wheel in v2.1.0 (June 2026, per its update notes; its exact options are
// not on the wiki pages read so far). Here: sneak and use the wand in a match (or /tds:signal <kind>) to send a short signal to the
// other players of the match — a column of particles where you look for 5 s, a sound, and a line with your name in their chat.
// The wording is our own (lang keys tds.sig.*). One signal per player every 2 s.
import { world, system, Player, Vector3 } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import * as G from './game';
import { cmd } from './kit';

export const SIGNALS = ['defend', 'boss', 'place', 'save', 'help', 'thanks'] as const;
export type Signal = (typeof SIGNALS)[number];
const last = new Map<string, number>();

function lookPoint(p: Player): Vector3 {
  const b = p.getBlockFromViewDirection({ maxDistance: 48 })?.block;
  if (b) return { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 };
  const v = p.getViewDirection(), h = p.getHeadLocation();
  return { x: h.x + v.x * 8, y: h.y + v.y * 8, z: h.z + v.z * 8 };
}
function beam(at: Vector3) {
  const d = world.getDimension('overworld');
  let n = 0;
  const id = system.runInterval(() => {
    for (let i = 0; i < 6; i++) { try { d.spawnParticle('minecraft:blue_flame_particle', { x: at.x, y: at.y + i * 0.6, z: at.z }); } catch { /* unloaded */ } }
    if (++n >= 10) system.clearRun(id);
  }, 10);
}

export function sendSignal(p: Player, kind: string, at?: Vector3): string {
  const M = G.M; if (!M || M.over || !M.players.includes(p.name)) return 'Not in a match';
  if (!(SIGNALS as readonly string[]).includes(kind)) return `Signals: ${SIGNALS.join(', ')}`;
  const now = system.currentTick; if ((last.get(p.name) ?? -1e9) + 40 > now) return 'Wait a moment'; last.set(p.name, now);
  const loc = at ?? lookPoint(p);
  G.log('signal', { player: p.name, kind, at: [Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z)] });
  if (!G.headless) {
    beam(loc);
    for (const q of world.getAllPlayers()) {
      if (!M.players.includes(q.name)) continue;
      try { q.sendMessage({ rawtext: [{ text: `§b${p.name}§r ▸ ` }, { translate: `tds.sig.${kind}` }] }); q.playSound('note.pling', { pitch: 1.4, volume: 0.6 }); } catch { /* left */ }
    }
  }
  return `Signal ${kind}`;
}

export async function signalMenu(p: Player, at?: Vector3) {
  const f = new ActionFormData().title({ translate: 'tds.sig.title' });
  for (const k of SIGNALS) f.button({ translate: `tds.sig.${k}` });
  const r = await f.show(p); if (r.canceled || r.selection === undefined) return;
  const msg = sendSignal(p, SIGNALS[r.selection], at); if (!msg.startsWith('Signal')) p.sendMessage(msg);
}

cmd('tds:signal', 'Send a team signal (defend, boss, place, save, help, thanks) where you look', { kind: 'string' }, (p, a) => sendSignal(p, String(a.kind)));
