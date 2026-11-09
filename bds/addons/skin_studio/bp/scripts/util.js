import { world, system, GameMode, ItemStack, CommandPermissionLevel } from '@minecraft/server';
import { FormCancelationReason } from '@minecraft/server-ui';

export const PODIUM = 'skin_studio:podium';
export const MIRROR = 'skin_studio:mirror';
export const GHOST = 'skin_studio:ghost';
export const WALL = 'skin_studio:mirror_wall';
export const PODIUM_EGG = 'skin_studio:podium_spawn_egg';
export const MIRROR_EGG = 'skin_studio:mirror_spawn_egg';
export const YAW = [0, 90, 180, -90];
export const FACINGS = ['south', 'west', 'north', 'east'];
export const DIMENSIONS = ['minecraft:overworld', 'minecraft:nether', 'minecraft:the_end'];

const EGGS = [PODIUM_EGG, MIRROR_EGG];
const SPAWNER = 'minecraft:mob_spawner';
const DISPENSER = 'minecraft:dispenser';
const DISPENSED = [
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 1 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
];
const eggUses = [];

export const facingOf = (yaw) => ((Math.round(yaw / 90) % 4) + 4) % 4;
export const yawOf = ({ x, z }) => (Math.atan2(-x, z) * 180) / Math.PI;
export const isManager = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
export const canEdit = (player, entity) => isManager(player) || entity.getDynamicProperty('ss:by') === player.id;

export async function present(form, player) {
  for (let tries = 1; ; tries++) {
    const response = await form.show(player);
    if (response.cancelationReason !== FormCancelationReason.UserBusy || tries >= 20 || !player.isValid) return response;
    await system.waitTicks(10);
  }
}

export function dimensions() {
  const ids = new Set(DIMENSIONS);
  for (const player of world.getAllPlayers()) ids.add(player.dimension.id);
  return [...ids].map((id) => world.getDimension(id));
}

export const loaded = (type) => dimensions().flatMap((dimension) => dimension.getEntities({ type }));

export function parsed(text, fallback) {
  try {
    const value = JSON.parse(String(text));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function set(entity, key, value) {
  if (entity.getProperty(key) !== value) entity.setProperty(key, value);
}

export function settle(entity, spot, facing) {
  const { x, y, z } = entity.location;
  const turn = (((entity.getRotation().y - YAW[facing]) % 360) + 360) % 360;
  const moved = Math.abs(x - spot.x) + Math.abs(y - spot.y) + Math.abs(z - spot.z) > 0.01;
  if (!moved && !(turn > 0.5 && turn < 359.5)) return;
  entity.teleport(spot, { rotation: { x: 0, y: YAW[facing] } });
  if (turn > 0.5 && turn < 359.5) {
    try {
      entity.runCommand(`tp @s ~ ~ ~ ${YAW[facing]} 0`);
    } catch {}
  }
}

function blockAt(dimension, location) {
  try {
    return dimension.getBlock(location);
  } catch {
    return undefined;
  }
}

function dispenserOf(entity) {
  const at = { x: Math.floor(entity.location.x), y: Math.floor(entity.location.y + 0.01), z: Math.floor(entity.location.z) };
  for (const [index, way] of DISPENSED.entries()) {
    const block = blockAt(entity.dimension, { x: at.x - way.x, y: at.y - way.y, z: at.z - way.z });
    if (block?.typeId !== DISPENSER) continue;
    let facing;
    try {
      facing = Number(block.permutation.getState('facing_direction'));
    } catch {
      continue;
    }
    if (facing === index) return way;
  }
}

function nearSpawner(entity) {
  const { x, y, z } = entity.location;
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -4; dz <= 4; dz++) {
        if (blockAt(entity.dimension, { x: x + dx, y: y + dy, z: z + dz })?.typeId === SPAWNER) return true;
      }
    }
  }
  return false;
}

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, beforeItemStack, isFirstEvent }) => {
  if (!isFirstEvent || !EGGS.includes(beforeItemStack?.typeId)) return;
  eggUses.push({ player, egg: beforeItemStack.typeId, dimension: block.dimension.id, at: { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }, tick: system.currentTick });
  while (eggUses.length > 32) eggUses.shift();
});

export function origin(entity, egg) {
  const now = system.currentTick;
  const close = ({ at }) => Math.hypot(at.x - entity.location.x, at.y - entity.location.y, at.z - entity.location.z) < 3;
  const index = eggUses.findIndex((use) => use.egg === egg && now - use.tick <= 4 && use.dimension === entity.dimension.id && close(use));
  if (index >= 0) {
    const [use] = eggUses.splice(index, 1);
    if (use.player.isValid) return { kind: 'egg', player: use.player, yaw: use.player.getRotation().y };
  }
  const way = dispenserOf(entity);
  if (way) return { kind: 'dispenser', yaw: yawOf(way) };
  if (nearSpawner(entity)) return { kind: 'spawner' };
  const viewer = entity.dimension.getPlayers({ location: entity.location, maxDistance: 8, closest: 1 })[0];
  return { kind: 'summon', player: viewer, yaw: viewer?.getRotation().y };
}

export function claim(entity, from) {
  if (from.kind === 'egg' || from.kind === 'dispenser') entity.setDynamicProperty('ss:egg', from.kind);
  if (from.player && (from.kind === 'egg' || from.kind === 'command')) entity.setDynamicProperty('ss:by', from.player.id);
}

export function refund(entity, player, egg) {
  const paid = entity.getDynamicProperty('ss:egg');
  const where = { ...entity.location };
  const dimension = entity.dimension;
  entity.remove();
  if (paid === 'dispenser') {
    dimension.spawnItem(new ItemStack(egg), where);
    return;
  }
  if (paid !== 'egg' || !player?.isValid || player.getGameMode() === GameMode.Creative) return;
  const left = player.getComponent('minecraft:inventory')?.container.addItem(new ItemStack(egg));
  if (left) player.dimension.spawnItem(left, player.location);
}
