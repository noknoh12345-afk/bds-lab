import { world, system } from '@minecraft/server';
import { PODIUM, set, parsed } from './util.js';
import { ready } from './relay.js';
import { uidOf, record } from './registry.js';
import { findPodium, slotsOf } from './podium.js';

const RANKS = [1, 2, 3];
const SCREENS = {
  Desktop: { cx: -6, cy: -278 },
  Mobile: { cx: -417, cy: -526 },
  Console: { cx: -6, cy: -278 },
};

const strange = new Set();

export function hudOf(player) {
  const target = parsed(player.getDynamicProperty('ss:hud'), null);
  return target && typeof target === 'object' ? target : null;
}

export function showHud(player, podium) {
  if (podium) {
    const { x, y, z } = podium.location;
    player.setDynamicProperty('ss:hud', JSON.stringify({ uid: uidOf(podium), dim: podium.dimension.id, x, y, z }));
  } else {
    player.setDynamicProperty('ss:hud', undefined);
  }
  refresh(player);
}

export function resizeHud(player, percent) {
  player.setDynamicProperty('ss:size', percent === 100 ? undefined : percent);
  refresh(player);
}

function show(player, slots) {
  slots.forEach(({ slot, gen }, i) => {
    set(player, `skin_studio:h${RANKS[i]}s`, slot);
    set(player, `skin_studio:h${RANKS[i]}g`, gen);
  });
  set(player, 'skin_studio:hud', true);
}

function stop(player) {
  if (player.getDynamicProperty('ss:hud') !== undefined) player.setDynamicProperty('ss:hud', undefined);
  set(player, 'skin_studio:hud', false);
}

function refresh(player) {
  if (!ready(player)) return;
  const type = player.clientSystemInfo.platformType;
  if (!SCREENS[type] && !strange.has(type)) {
    strange.add(type);
    console.warn(`[Skin Studio] unknown platform ${type}; the screen podium uses the desktop corner (adjust with /studio:hudsize)`);
  }
  const screen = SCREENS[type] ?? SCREENS.Desktop;
  set(player, 'skin_studio:cx', screen.cx);
  set(player, 'skin_studio:cy', screen.cy);
  set(player, 'skin_studio:size', Number(player.getDynamicProperty('ss:size') ?? 100));

  const target = hudOf(player);
  if (!target) return set(player, 'skin_studio:hud', false);
  let podium = findPodium(target.uid);
  if (!podium && typeof target.id === 'string') {
    const old = world.getEntity(target.id);
    if (old?.typeId === PODIUM) {
      podium = old;
      player.setDynamicProperty('ss:hud', JSON.stringify({ ...target, uid: uidOf(old) }));
    }
  }
  if (podium) {
    return show(
      player,
      RANKS.map((rank) => ({ slot: Number(podium.getProperty(`skin_studio:s${rank}`)), gen: Number(podium.getProperty(`skin_studio:g${rank}`)) })),
    );
  }
  const saved = record(target.uid);
  if (!saved) return stop(player);
  show(player, slotsOf(saved.who ?? [null, null, null], world.getAllPlayers()));
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      refresh(player);
    } catch (error) {
      console.warn(`[Skin Studio] screen podium for ${player.name}: ${error}`);
    }
  }
}, 20);
