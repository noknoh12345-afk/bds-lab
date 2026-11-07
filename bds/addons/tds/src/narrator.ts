// Narrators (Features page): a speaker talks at the start of a wave and on the loss screen, with tips about what is coming.
// The lines are our own (lang keys tds.narr.*, ja_JP and en_US); when to speak is read from the wave itself:
// the first wave, a boss, the first hidden / flying / lead enemies of the match, the last wave, and the end.
// One line per wave at most, so the chat stays quiet; every line is also logged ("narrate") for the tests.
import { world, RawMessage } from '@minecraft/server';
import { modes, enemies, Group } from './defs';
import * as G from './game';

type Said = { narr?: string[] };

export function narrate(key: string, ...args: string[]) {
  const M = G.M; if (!M) return;
  G.log('narrate', { key, wave: M.wave, args });
  if (G.headless) return;
  const msg: RawMessage = { rawtext: [{ text: '§6' }, { translate: 'tds.narr.speaker' }, { text: '§r: ' }, { translate: `tds.narr.${key}`, with: args }] };
  for (const p of world.getAllPlayers()) if (M.players.includes(p.name)) { try { p.sendMessage(msg); } catch { /* left */ } }
}

/** the line for this wave, if any: a boss the match has not met yet, then a kind of enemy it has not seen yet, then the last wave,
 *  then the first. `seen` holds what was already said ("hidden", "boss:Brute", ...) so a boss of many waves is announced once. */
export function lineFor(mode: string, wave: number, seen: string[]): [string, string[], string?] | null {
  const md = modes[mode]; if (!md) return null;
  const names = [...new Set(((md.wave[String(wave)] ?? []) as Group[]).map((g) => g.e))];
  const boss = names.find((n) => enemies[n]?.boss && !seen.includes(`boss:${n}`));
  if (boss) return ['boss', [boss], `boss:${boss}`];
  for (const k of ['hidden', 'flying', 'lead'] as const) if (!seen.includes(k) && names.some((n) => enemies[n]?.[k])) return [k, [], k];
  if (wave === md.waves) return ['last', []];
  if (wave === 1) return ['start', []];
  return null;
}

G.onWave.push((m) => {
  const s = m as typeof m & Said; s.narr ??= [];
  const l = lineFor(m.mode, m.wave, s.narr); if (!l) return;
  if (l[2]) s.narr.push(l[2]);
  narrate(l[0], ...l[1]);
});
G.onEnd.push((m, r) => { if (!m.sandbox) narrate(r === 'win' ? 'win' : 'lose'); });
