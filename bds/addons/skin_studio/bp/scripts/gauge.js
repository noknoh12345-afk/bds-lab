import { system, Player } from '@minecraft/server';

export const GAUGE = 'skin_studio:gauge';
const WALKS = new Map();

const yawToward = (from, to) => (Math.atan2(-(to.x - from.x), to.z - from.z) * 180) / Math.PI;

export function placeGauge(dimension, at, viewer, mode, offset = 0, channel = 1) {
  const yaw = viewer ? yawToward(at, viewer) : 0;
  const gauge = dimension.spawnEntity(GAUGE, at, { initialRotation: yaw });
  gauge.setProperty('skin_studio:pm', Math.max(0, Math.min(9, mode)));
  gauge.setProperty('skin_studio:poy', Math.max(-1024, Math.min(1024, offset)));
  gauge.setProperty('skin_studio:pch', Math.max(1, Math.min(4, channel)));
  return gauge;
}

export function walk(player, x, z, ticks) {
  const length = Math.hypot(x, z) || 1;
  WALKS.set(player.id, { player, x: (x / length) * 0.12, z: (z / length) * 0.12, left: ticks });
}

system.runInterval(() => {
  for (const [id, step] of WALKS) {
    if (!step.player.isValid || step.left <= 0) {
      WALKS.delete(id);
      continue;
    }
    step.left -= 1;
    try {
      if (step.player instanceof Player) step.player.applyKnockback({ x: step.x, z: step.z }, 0);
    } catch {
      WALKS.delete(id);
    }
  }
});
