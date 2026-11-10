import { world, system } from '@minecraft/server';
import { set, isManager } from './util.js';

const SLOTS = 100;
const GENERATIONS = 16000000;
const holders = new Map();
let replaced = false;

export const ready = (player) => player.getProperty('skin_studio:slot') !== undefined;

export function relayOf(player) {
  if (!ready(player)) return undefined;
  const slot = Number(player.getProperty('skin_studio:slot'));
  const gen = Number(player.getProperty('skin_studio:gen'));
  return slot > 0 && gen > 0 ? { slot, gen } : undefined;
}

export const isReplaced = () => replaced;

function complain(players) {
  if (replaced) return;
  replaced = true;
  console.warn('[Skin Studio] minecraft:player is defined by another pack above Skin Studio; merge them with python3 build.py --player');
  for (const player of players.filter(isManager)) {
    player.sendMessage('§e[Skin Studio] ほかのパックが minecraft:player を上書きしているため、鏡と表彰台に人が映りません。README の「player.json を書き換えるほかのアドオンと一緒に使う」の手順で合体してください。');
  }
}

function refresh() {
  const everyone = world.getAllPlayers();
  const players = everyone.filter(ready);
  if (players.length < everyone.length) complain(everyone);
  const online = new Set(players.map((player) => player.id));
  for (const [slot, id] of holders) if (!online.has(id)) holders.delete(slot);

  const waiting = [];
  for (const player of players) {
    const slot = Number(player.getProperty('skin_studio:slot'));
    const holder = holders.get(slot);
    if (slot > 0 && (holder === undefined || holder === player.id)) holders.set(slot, player.id);
    else waiting.push(player);
  }
  if (!waiting.length) return;

  const start = Number(world.getDynamicProperty('ss:gen') ?? 0);
  let gen = start;
  for (const player of waiting) {
    let slot = 1;
    while (holders.has(slot)) slot++;
    if (slot > SLOTS) {
      set(player, 'skin_studio:slot', 0);
      continue;
    }
    gen = (gen % (GENERATIONS - 1)) + 1;
    holders.set(slot, player.id);
    player.setProperty('skin_studio:slot', slot);
    player.setProperty('skin_studio:gen', gen);
  }
  if (gen !== start) world.setDynamicProperty('ss:gen', gen);
}

world.afterEvents.playerSpawn.subscribe(({ initialSpawn }) => {
  if (initialSpawn) system.run(refresh);
});

system.runInterval(refresh, 20);

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!ready(player)) continue;
    try {
      const { x, y } = player.getRotation();
      set(player, 'skin_studio:rx', Math.max(-900, Math.min(900, Math.round(x * 10))));
      set(player, 'skin_studio:ry', Math.max(-1800, Math.min(1800, Math.round((((y + 180) % 360) + 360) % 360 * 10 - 1800))));
    } catch {}
  }
});
