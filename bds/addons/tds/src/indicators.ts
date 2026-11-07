// Damage Indicators (Features page): while a player has a tower selected (its menu opened lately, or looked at with the wand),
// the damage it deals shows as a number under the enemy's health bar for 0.6 s, summed over quick hits. Like the original's
// "Damage Values" setting it can be turned off: /tds:dmgnumbers off. (src/game.ts adds the number to the bar; src/hud.ts
// marks the selected towers each pass; this file clears the numbers that ran out.)
import { system } from '@minecraft/server';
import * as G from './game';
import { cmdAny } from './kit';

system.runInterval(() => {
  const M = G.M; if (!M) return;
  for (const e of M.enemies) if (e.ind && e.ind.until <= M.t) { e.ind = undefined; e.dirty = true; }
}, 5);

cmdAny('tds:dmgnumbers', 'Damage numbers on enemies hit by a selected tower (on or off)', { state: ['on', 'off'] }, (_, a) => {
  G.indicators.on = a.state === 'on'; if (!G.indicators.on) G.indicators.watched.clear();
  G.log('dmgnumbers', { on: G.indicators.on });
  return `Damage numbers ${a.state}`;
});
