import { world } from '@minecraft/server';
import { parsed } from './util.js';

const PREFIX = 'ss:r:';

function next() {
  const count = Number(world.getDynamicProperty('ss:uid') ?? 0) + 1;
  world.setDynamicProperty('ss:uid', count);
  return count.toString(36);
}

export function uidOf(entity) {
  const uid = entity.getDynamicProperty('ss:u');
  if (typeof uid === 'string' && uid) return uid;
  return renew(entity);
}

export function renew(entity) {
  const uid = next();
  entity.setDynamicProperty('ss:u', uid);
  return uid;
}

export function record(uid) {
  if (!uid) return undefined;
  const saved = parsed(world.getDynamicProperty(PREFIX + uid), undefined);
  return saved && typeof saved === 'object' && saved.kind ? { ...saved, uid } : undefined;
}

export function remember(uid, data) {
  const text = JSON.stringify(data);
  if (world.getDynamicProperty(PREFIX + uid) !== text) world.setDynamicProperty(PREFIX + uid, text);
}

export function forgetRecord(uid) {
  if (uid) world.setDynamicProperty(PREFIX + uid, undefined);
}

export function records(kind) {
  return world
    .getDynamicPropertyIds()
    .filter((id) => id.startsWith(PREFIX))
    .map((id) => record(id.slice(PREFIX.length)))
    .filter((saved) => saved && (!kind || saved.kind === kind));
}
