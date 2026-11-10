import { world, system, BlockVolume, GameMode } from '@minecraft/server';
import { ActionFormData, MessageFormData } from '@minecraft/server-ui';
import { relayOf } from './relay.js';
import { showMobs, forget, wanted as mobsWanted } from './reflections.js';
import { lookOf, MIRRORED_TYPES } from './ghostlook.js';
import { MIRROR, GHOST, WALL, MIRROR_EGG, YAW, facingOf, loaded, set, settle, refund, parsed, canEdit, origin, claim, present } from './util.js';
import { uidOf, renew, record, remember, forgetRecord, records } from './registry.js';

const AHEAD = [
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: 1, z: 0 },
];
const FIGURES = 4;
const DEPTH = 10;
const SIDE = 6;
const GHOST_REACH = 20;
const REACH = 96;
const RISE = 48;
const WALLS = [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25];
const FACE = 0.1;
const BACK = 0.4;
const BODY = 0.3;
const SLACK = 0.15;
const SPAN = 1.6;
const PUSHED = 4;
const CHANNELS = 4;
const NEIGHBOURS = 64;
const FLAGS = 32;
const LOW_SEATS = ['minecraft:minecart', 'minecraft:boat', 'minecraft:chest_boat', 'minecraft:strider'];
const OPEN = ['minecraft:air', 'minecraft:barrier'];
const MIRRORED = MIRRORED_TYPES;
const WHERE = '§c鏡は、壁にあけた 3×3 の窓の「一番下の真ん中」に置いてください。';
const TAKEN = '§cこの窓にはもう鏡があります。';
const FAR = 200000;
const dirty = new Set();
const paused = new Set();
const figures = new Map();
const warned = new Set();
const pushes = new Map();
let mirrors = [];
let tick = 0;

const keyOf = ({ x, y, z }) => `${x},${y},${z}`;
const clamp = (value, low, high) => Math.min(high, Math.max(low, Math.round(value)));
const turned = (yaw) => ((((yaw + 180) % 360) + 360) % 360) - 180;
const windowAt = (facing, { x, y, z }) => ({ x: Math.floor(x - AHEAD[facing].x / 4), y: Math.floor(y + 0.01), z: Math.floor(z - AHEAD[facing].z / 4) });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function frameAt(window, facing) {
  const ahead = AHEAD[facing];
  return {
    facing,
    ahead,
    side: { x: ahead.z, z: -ahead.x },
    window,
    glass: { x: window.x + 0.5 + ahead.x / 2, y: window.y, z: window.z + 0.5 + ahead.z / 2 },
  };
}

function frameOf(mirror) {
  const window = parsed(mirror.getDynamicProperty('ss:w'), null);
  const facing = Number(mirror.getDynamicProperty('ss:f'));
  if (!Array.isArray(window) || window.length !== 3 || !(facing >= 0 && facing <= 3)) return undefined;
  const [x, y, z] = window.map(Number);
  return frameAt({ x, y, z }, facing);
}

const cell = (frame, depth, side, height) => ({
  x: frame.window.x + frame.ahead.x * depth + frame.side.x * side,
  y: frame.window.y + height,
  z: frame.window.z + frame.ahead.z * depth + frame.side.z * side,
});

function blockAt(dimension, location) {
  try {
    return dimension.getBlock(location);
  } catch {
    return undefined;
  }
}

const isOpen = (block) => !!block && (block.isAir || block.typeId === 'minecraft:barrier');
const passable = (block) => !!block && (block.isAir || block.isLiquid);

function scan(dimension, from, to, includeTypes) {
  const { min, max } = dimension.heightRange;
  const low = Math.max(Math.min(from.y, to.y), min);
  const high = Math.min(Math.max(from.y, to.y), max - 1);
  if (low > high) return [];
  const volume = new BlockVolume({ ...from, y: low }, { ...to, y: high });
  return [...dimension.getBlocks(volume, { includeTypes }, true).getBlockLocationIterator()];
}

function windowOpen(dimension, frame) {
  for (let side = -1; side <= 1; side++) {
    for (let height = 0; height <= 2; height++) {
      if (!isOpen(blockAt(dimension, cell(frame, 0, side, height)))) return false;
    }
  }
  return true;
}

function owner(dimension, window, except) {
  const here = keyOf(window);
  const mine = except && except.getDynamicProperty('ss:u');
  const live = loaded(MIRROR).find((other) => other.id !== except?.id && other.dimension.id === dimension.id && frameOf(other) && keyOf(frameOf(other).window) === here);
  if (live) return live;
  return records('mirror').find((saved) => saved.uid !== mine && saved.dim === dimension.id && Array.isArray(saved.w) && saved.w.join(',') === here);
}

export function windowProblem(dimension, location, facing, except) {
  const frame = frameAt(windowAt(facing, location), facing);
  if (!windowOpen(dimension, frame)) return WHERE;
  if (owner(dimension, frame.window, except)) return TAKEN;
}

function keep(mirror, frame) {
  remember(uidOf(mirror), { kind: 'mirror', dim: mirror.dimension.id, w: [frame.window.x, frame.window.y, frame.window.z], f: frame.facing });
}

export function setup(mirror, facing, from) {
  const { x, y, z } = windowAt(facing, mirror.location);
  mirror.setDynamicProperty('ss:f', facing);
  mirror.setDynamicProperty('ss:w', JSON.stringify([x, y, z]));
  if (from) claim(mirror, from);
  const frame = frameOf(mirror);
  settle(mirror, frame.glass, facing);
  keep(mirror, frame);
  clearFigures(mirror);
  fence(mirror, frame);
  dirty.add(mirror.id);
}

function owned(entity, mirror) {
  const uid = entity.getDynamicProperty('ss:ou');
  return entity.getDynamicProperty('ss:o') === mirror.id || (uid !== undefined && uid === mirror.getDynamicProperty('ss:u'));
}

function adopt(entity, mirror) {
  if (entity.getDynamicProperty('ss:o') !== mirror.id) entity.setDynamicProperty('ss:o', mirror.id);
  if (entity.getDynamicProperty('ss:ou') !== uidOf(mirror)) entity.setDynamicProperty('ss:ou', uidOf(mirror));
}

function fence(mirror, frame) {
  const mine = mirror.dimension.getEntities({ type: WALL, location: frame.glass, maxDistance: 3 }).filter((wall) => owned(wall, mirror));
  WALLS.forEach((offset, i) => {
    const middle = (FACE - BACK) / 2;
    const spot = {
      x: frame.glass.x + frame.side.x * offset + frame.ahead.x * middle,
      y: frame.glass.y,
      z: frame.glass.z + frame.side.z * offset + frame.ahead.z * middle,
    };
    const [wall, ...extra] = mine.filter((each) => each.getDynamicProperty('ss:i') === i);
    for (const copy of extra) copy.remove();
    if (wall) {
      adopt(wall, mirror);
      return settle(wall, spot, frame.facing);
    }
    try {
      const made = mirror.dimension.spawnEntity(WALL, spot, { initialRotation: 0 });
      made.setDynamicProperty('ss:i', i);
      adopt(made, mirror);
    } catch {}
  });
}

function clearFigures(mirror) {
  for (let k = 1; k <= FIGURES; k++) {
    set(mirror, `skin_studio:r${k}`, 0);
    set(mirror, `skin_studio:g${k}`, 0);
  }
  figures.delete(mirror.id);
}

function clearGhosts(mirror) {
  for (const ghost of mirror.dimension.getEntities({ type: GHOST })) if (owned(ghost, mirror)) ghost.remove();
}

function clearReflections(mirror) {
  forget(mirror);
  clearFigures(mirror);
  for (const type of [GHOST, WALL]) {
    for (const entity of mirror.dimension.getEntities({ type })) if (owned(entity, mirror)) entity.remove();
  }
}

export function removeMirror(mirror, player) {
  clearReflections(mirror);
  forgetRecord(uidOf(mirror));
  paused.delete(mirror.id);
  if (player) refund(mirror, player, MIRROR_EGG);
  else mirror.remove();
}

function place(mirror) {
  const from = origin(mirror, MIRROR_EGG);
  if (from.kind === 'spawner') {
    mirror.remove();
    return;
  }
  const facing = facingOf((from.yaw ?? 0) + 180);
  const problem = windowProblem(mirror.dimension, mirror.location, facing, mirror);
  if (problem) {
    claim(mirror, from);
    from.player?.sendMessage(problem);
    refund(mirror, from.player, MIRROR_EGG);
    return;
  }
  setup(mirror, facing, from);
}

function inFront(frame, { x, y, z }) {
  const dx = x - frame.glass.x;
  const dz = z - frame.glass.z;
  const front = dx * frame.ahead.x + dz * frame.ahead.z;
  const across = dx * frame.side.x + dz * frame.side.z;
  const ok = front > 0.05 && front < REACH && Math.abs(across) < REACH && Math.abs(y - frame.glass.y) < RISE;
  return ok ? front * front + across * across : undefined;
}

function seen(player) {
  if (player.getEffect('minecraft:invisibility')) return false;
  const health = player.getComponent('minecraft:health');
  return !health || health.currentValue > 0;
}

function poseOf(player) {
  const seat = player.getComponent('minecraft:riding')?.entityRidingOn;
  let flags = player.isSneaking ? 1 : 0;
  if (seat) flags += 2 + (LOW_SEATS.includes(seat.typeId) ? 16 : 0);
  if (player.isSwimming) flags += 4;
  if (player.isSleeping) flags += 8;
  return flags;
}

function reflect(mirror, frame, players) {
  const near = [];
  for (const player of players) {
    const relay = relayOf(player);
    if (!relay || player.dimension.id !== mirror.dimension.id || player.getGameMode() === GameMode.Spectator || !seen(player)) continue;
    const far = inFront(frame, player.location);
    if (far !== undefined) near.push({ ...relay, player, far });
  }
  near.sort((a, b) => a.far - b.far);
  near.length = Math.min(near.length, FIGURES);

  const shown = [];
  for (let k = 1; k <= FIGURES; k++) shown.push(near.find((person) => person.slot === mirror.getProperty(`skin_studio:r${k}`)));
  for (const person of near) if (!shown.includes(person)) shown[shown.indexOf(undefined)] = person;
  shown.forEach((person, i) => {
    set(mirror, `skin_studio:r${i + 1}`, person?.slot ?? 0);
    set(mirror, `skin_studio:g${i + 1}`, person?.gen ?? 0);
  });
  figures.set(mirror.id, { mirror, frame, players: shown.map((person) => person?.player) });
  trace(figures.get(mirror.id));
  showMobs(mirror, frame, (location) => inFront(frame, location) !== undefined, Math.hypot(REACH, REACH, RISE));
}

function trace({ mirror, frame, players }) {
  players.forEach((player, i) => {
    if (!player?.isValid || player.dimension.id !== mirror.dimension.id) return;
    const k = i + 1;
    const { x, y, z } = player.location;
    const { x: pitch, y: yaw } = player.getRotation();
    set(mirror, `skin_studio:x${k}`, clamp((x - frame.glass.x) * 1000, -FAR, FAR));
    set(mirror, `skin_studio:y${k}`, clamp((y - frame.glass.y) * 16, -2048, 8192));
    set(mirror, `skin_studio:z${k}`, clamp((z - frame.glass.z) * 1000, -FAR, FAR));
    set(mirror, `skin_studio:b${k}`, clamp(turned(yaw) * 10, -1800, 1800));
    set(mirror, `skin_studio:a${k}`, clamp((Math.min(90, Math.max(-90, pitch)) + 90) * 10, 0, 1800) * FLAGS + poseOf(player));
  });
}

const sides = new Map();

function keepOut(mirror, frame) {
  const now = system.currentTick;
  for (const player of mirror.dimension.getPlayers({ location: frame.glass, maxDistance: 5 })) {
    if (player.getGameMode() === GameMode.Spectator || player.getComponent('minecraft:riding')) continue;
    const { x, y, z } = player.location;
    const dx = x - frame.glass.x;
    const dz = z - frame.glass.z;
    const front = dx * frame.ahead.x + dz * frame.ahead.z;
    const across = dx * frame.side.x + dz * frame.side.z;
    const before = FACE + BODY;
    const behind = -(BACK + BODY);
    const key = `${mirror.id}:${player.id}`;
    const middle = (FACE - BACK) / 2;
    const here = front >= middle ? 1 : -1;
    const last = sides.get(key);
    const inside = (a, h) => Math.abs(a) <= SPAN && h >= frame.glass.y - 1.8 && h <= frame.glass.y + 2.9;
    const level = inside(across, y);
    const fresh = last !== undefined && now - last.tick <= 2;
    const crossing = fresh && here !== last.side ? (middle - last.front) / (front - last.front) : NaN;
    const through = crossing >= 0 && crossing <= 1 && inside(last.across + (across - last.across) * crossing, last.y + (y - last.y) * crossing);
    const deep = level && front < before - SLACK && front > behind + SLACK;
    if (!deep && !through) {
      sides.set(key, { side: here, tick: now, front, across, y });
      continue;
    }
    const side = fresh ? last.side : here;
    const target = (way) => {
      const to = way > 0 ? before : behind;
      return { x: x + frame.ahead.x * (to - front), y, z: z + frame.ahead.z * (to - front) };
    };
    const free = (spot) => [0, 1].every((up) => passable(blockAt(mirror.dimension, { x: spot.x, y: spot.y + up + 0.01, z: spot.z })));
    const spot = [target(side), target(-side)].find(free);
    if (!spot) continue;
    player.teleport(spot);
    const landed = (spot.x - frame.glass.x) * frame.ahead.x + (spot.z - frame.glass.z) * frame.ahead.z;
    sides.set(key, { side: landed > 0 ? 1 : -1, tick: now, front: landed, across, y });
    pushes.set(mirror.id, (pushes.get(mirror.id) ?? 0) + 1);
  }
}

function rebuild(mirror, frame) {
  const dimension = mirror.dimension;
  const open = new Set();
  for (const spot of scan(dimension, cell(frame, 0, -SIDE, -1), cell(frame, 1 - DEPTH, SIDE, 5), OPEN)) open.add(keyOf(spot));

  const wanted = new Map();
  const covers = [];
  for (const spot of scan(dimension, cell(frame, 1, -SIDE, -1), cell(frame, DEPTH, SIDE, 5), MIRRORED)) {
    const depth = (spot.x - frame.window.x) * frame.ahead.x + (spot.z - frame.window.z) * frame.ahead.z;
    const at = { x: spot.x + frame.ahead.x * (1 - 2 * depth), y: spot.y, z: spot.z + frame.ahead.z * (1 - 2 * depth) };
    const image = keyOf(at);
    const block = blockAt(dimension, spot);
    const look = lookOf(block, frame.facing);
    if (!look) continue;
    if (open.has(image)) wanted.set(image, { ...look, light: lightCell(dimension, spot, frame), inflate: 0 });
    else if (SOLID_IMAGES && exposed(open, at, frame, depth) && !alike(blockAt(dimension, at), block)) covers.push({ image, depth, look, spot });
  }
  covers.sort((a, b) => a.depth - b.depth);
  for (const { image, look, spot } of covers.slice(0, COVERS)) wanted.set(image, { ...look, light: lightCell(dimension, spot, frame), inflate: 1 });

  const channel = channelOf(mirror);
  for (const ghost of dimension.getEntities({ type: GHOST, location: frame.glass, maxDistance: GHOST_REACH })) {
    if (!owned(ghost, mirror)) continue;
    const key = String(ghost.getDynamicProperty('ss:k'));
    const look = wanted.get(key);
    if (look === undefined) {
      ghost.remove();
      continue;
    }
    dress(ghost, frame, key, look, channel, mirror);
    wanted.delete(key);
  }

  for (const [key, look] of wanted) {
    const [x, y, z] = key.split(',').map(Number);
    try {
      const at = look.light ?? { x, y, z };
      const ghost = dimension.spawnEntity(GHOST, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 }, { initialRotation: YAW[frame.facing] });
      ghost.setDynamicProperty('ss:k', key);
      dress(ghost, frame, key, look, channel, mirror);
    } catch {}
  }
}

const LIGHT_AT_REAL = true;
const SOLID_IMAGES = true;
const COVERS = 96;

function exposed(open, at, frame, depth) {
  const near = [
    { x: at.x, y: at.y + 1, z: at.z },
    { x: at.x, y: at.y - 1, z: at.z },
    { x: at.x + frame.side.x, y: at.y, z: at.z + frame.side.z },
    { x: at.x - frame.side.x, y: at.y, z: at.z - frame.side.z },
  ];
  if (depth > 1) near.push({ x: at.x + frame.ahead.x, y: at.y, z: at.z + frame.ahead.z });
  return near.some((place) => open.has(keyOf(place)));
}

function alike(real, source) {
  if (!real || !source || real.typeId !== source.typeId) return false;
  try {
    return JSON.stringify(real.permutation.getAllStates()) === JSON.stringify(source.permutation.getAllStates());
  } catch {
    return true;
  }
}

function lightCell(dimension, spot, frame) {
  if (!LIGHT_AT_REAL) return undefined;
  const toward = { x: spot.x - frame.ahead.x, y: spot.y, z: spot.z - frame.ahead.z };
  const above = { x: spot.x, y: spot.y + 1, z: spot.z };
  return [toward, above].find((place) => passable(blockAt(dimension, place)));
}

function dress(ghost, frame, key, look, channel, mirror) {
  const [ix, iy, iz] = key.split(',').map(Number);
  const { x, y, z } = look.light ?? { x: ix, y: iy, z: iz };
  adopt(ghost, mirror);
  settle(ghost, { x: x + 0.5, y, z: z + 0.5 }, frame.facing);
  set(ghost, 'skin_studio:in', look.inflate ?? 0);
  set(ghost, 'skin_studio:sx', clamp((ix - x) * 2, -64, 64));
  set(ghost, 'skin_studio:sy', clamp(iy - y, -64, 64));
  set(ghost, 'skin_studio:sz', clamp((iz - z) * 2, -64, 64));
  set(ghost, 'skin_studio:tex', look.tex);
  set(ghost, 'skin_studio:ew', look.ew);
  set(ghost, 'skin_studio:up', look.up);
  set(ghost, 'skin_studio:dn', look.dn);
  set(ghost, 'skin_studio:ax', look.ax);
  set(ghost, 'skin_studio:sh', look.sh);
  set(ghost, 'skin_studio:ch', channel);
  set(ghost, 'skin_studio:gx', clamp((frame.glass.x - x - 0.5) * 2, -64, 64));
  set(ghost, 'skin_studio:gy', clamp(frame.glass.y - y, -64, 64));
  set(ghost, 'skin_studio:gz', clamp((frame.glass.z - z - 0.5) * 2, -64, 64));
  set(ghost, 'skin_studio:gf', frame.facing);
}

export const channelOf = (mirror) => {
  const channel = Number(mirror.getProperty('skin_studio:ch'));
  return channel >= 1 && channel <= CHANNELS ? channel : 1;
};

function channels(list) {
  const placed = list.filter((mirror) => mirror.isValid && frameOf(mirror));
  placed.forEach((mirror, index) => {
    const here = frameOf(mirror).glass;
    const used = new Set(
      placed
        .slice(0, index)
        .filter((other) => other.dimension.id === mirror.dimension.id && distance(frameOf(other).glass, here) < NEIGHBOURS)
        .map(channelOf),
    );
    const current = channelOf(mirror);
    if (!used.has(current)) return set(mirror, 'skin_studio:ch', current);
    let pick = 1;
    while (used.has(pick) && pick < CHANNELS) pick++;
    set(mirror, 'skin_studio:ch', pick);
  });
}

function sweep() {
  const live = new Map(mirrors.filter((mirror) => mirror.isValid).map((mirror) => [mirror.getDynamicProperty('ss:u'), mirror]));
  for (const { type, reach } of [
    { type: GHOST, reach: GHOST_REACH },
    { type: WALL, reach: 2.5 },
  ]) {
    for (const entity of loaded(type)) {
      const uid = entity.getDynamicProperty('ss:ou');
      const byId = world.getEntity(String(entity.getDynamicProperty('ss:o')));
      const mirror = (byId?.typeId === MIRROR ? byId : undefined) ?? live.get(uid);
      if (mirror) {
        const frame = frameOf(mirror);
        if (!frame || distance(entity.location, frame.glass) > reach || (type === GHOST && paused.has(mirror.id))) entity.remove();
        else adopt(entity, mirror);
        continue;
      }
      const saved = record(uid);
      if (!saved || saved.dim !== entity.dimension.id || !Array.isArray(saved.w)) {
        entity.remove();
        continue;
      }
      const glass = frameAt({ x: saved.w[0], y: saved.w[1], z: saved.w[2] }, saved.f).glass;
      if (distance(entity.location, glass) > reach || entity.dimension.isChunkLoaded(glass)) entity.remove();
    }
  }
}

async function ask(player, mirror) {
  if (!canEdit(player, mirror)) {
    await present(new ActionFormData().title('鏡').body('前に立つと映ります。').button('閉じる'), player);
    return;
  }
  const response = await present(
    new MessageFormData().title('鏡').body('前に立つと映ります。窓の奥の空いている所に、手前のブロックと人と生き物が映ります。').button1('§c片付ける').button2('閉じる'),
    player,
  );
  if (response.selection !== 0 || !mirror.isValid) return;
  removeMirror(mirror, player);
}

function touch({ x, y, z }, dimension) {
  for (const mirror of mirrors) {
    if (!mirror.isValid || mirror.dimension.id !== dimension.id) continue;
    const at = mirror.location;
    if (Math.abs(at.x - x) + Math.abs(at.y - y) + Math.abs(at.z - z) < 24) dirty.add(mirror.id);
  }
}

function untangle(list) {
  const groups = new Map();
  for (const mirror of list) {
    const uid = mirror.getDynamicProperty('ss:u');
    if (typeof uid === 'string') groups.set(uid, [...(groups.get(uid) ?? []), mirror]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const home = (mirror) => {
      const frame = frameOf(mirror);
      return frame ? distance(mirror.location, frame.glass) : Infinity;
    };
    group.sort((a, b) => home(a) - home(b));
    for (const copy of group.slice(1)) {
      renew(copy);
      copy.setDynamicProperty('ss:egg', undefined);
      relocate(copy);
    }
  }
}

function relocate(mirror) {
  const frame = frameOf(mirror);
  const facing = frame?.facing ?? facingOf(mirror.getRotation().y);
  if (!windowProblem(mirror.dimension, mirror.location, facing, mirror)) setup(mirror, facing);
  else removeMirror(mirror);
}

function watched(frame, dimension, players) {
  return players.some((player) => player.dimension.id === dimension.id && distance(player.location, frame.glass) < REACH);
}

function update(mirror, players) {
  if (mirror.getDynamicProperty('ss:f') === undefined) return place(mirror);
  const frame = frameOf(mirror);
  if (!frame) return relocate(mirror);
  uidOf(mirror);
  if (distance(mirror.location, frame.glass) >= PUSHED) {
    if (!windowProblem(mirror.dimension, mirror.location, frame.facing, mirror)) return setup(mirror, frame.facing);
    if (!windowOpen(mirror.dimension, frame)) return removeMirror(mirror);
    settle(mirror, frame.glass, frame.facing);
  }
  keep(mirror, frame);
  if (tick % 5 === 0) settle(mirror, frame.glass, frame.facing);
  if (tick % 5 === 2) fence(mirror, frame);
  if (!windowOpen(mirror.dimension, frame)) {
    if (!paused.has(mirror.id)) {
      paused.add(mirror.id);
      forget(mirror);
      clearFigures(mirror);
      clearGhosts(mirror);
    }
    return;
  }
  if (paused.delete(mirror.id)) dirty.add(mirror.id);
  reflect(mirror, frame, players);
  if (dirty.delete(mirror.id) || (tick % 10 === 0 && watched(frame, mirror.dimension, players))) rebuild(mirror, frame);
}

export function mirrorState(mirror) {
  return {
    uid: mirror.getDynamicProperty('ss:u'),
    paused: paused.has(mirror.id),
    channel: channelOf(mirror),
    people: (figures.get(mirror.id)?.players ?? []).map((player) => player?.name).filter(Boolean),
    ghosts: mirror.dimension.getEntities({ type: GHOST }).filter((ghost) => owned(ghost, mirror)).length,
    walls: mirror.dimension.getEntities({ type: WALL }).filter((wall) => owned(wall, mirror)).length,
    pushed: pushes.get(mirror.id) ?? 0,
  };
}

export function restoreMirrors() {
  let count = 0;
  for (const saved of records('mirror')) {
    if (!Array.isArray(saved.w)) continue;
    const dimension = world.getDimension(saved.dim);
    const frame = frameAt({ x: saved.w[0], y: saved.w[1], z: saved.w[2] }, saved.f);
    if (!dimension.isChunkLoaded(frame.glass) || loaded(MIRROR).some((mirror) => mirror.getDynamicProperty('ss:u') === saved.uid)) continue;
    if (!windowOpen(dimension, frame)) continue;
    const mirror = dimension.spawnEntity(MIRROR, frame.glass, { initialRotation: YAW[saved.f] });
    mirror.setDynamicProperty('ss:u', saved.uid);
    setup(mirror, saved.f);
    count++;
  }
  return count;
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (!entity.isValid || entity.typeId !== MIRROR) return;
  system.run(() => {
    if (entity.isValid && entity.getDynamicProperty('ss:f') === undefined) place(entity);
  });
});

world.afterEvents.entityLoad.subscribe(({ entity }) => {
  if (!entity.isValid || entity.typeId !== MIRROR) return;
  clearFigures(entity);
  dirty.add(entity.id);
});

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  if (target.typeId !== MIRROR && target.typeId !== WALL) return;
  event.cancel = true;
  const mirror = target.typeId === MIRROR ? target : world.getEntity(String(target.getDynamicProperty('ss:o')));
  if (mirror?.typeId === MIRROR) system.run(() => ask(player, mirror));
});

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => touch(block, block.dimension));
world.afterEvents.playerBreakBlock.subscribe(({ block }) => touch(block, block.dimension));
world.afterEvents.explosion.subscribe((event) => {
  for (const block of event.getImpactedBlocks().slice(0, 64)) touch(block, event.dimension);
});
world.afterEvents.pistonActivate.subscribe(({ block, dimension }) => touch(block, dimension));

system.runInterval(() => {
  tick++;
  mirrors = loaded(MIRROR);
  const players = world.getAllPlayers();
  untangle(mirrors);
  channels(mirrors);
  for (const mirror of mirrors) {
    try {
      if (mirror.isValid) update(mirror, players);
    } catch (error) {
      if (!warned.has(mirror.id)) console.warn(`[Skin Studio] mirror ${mirror.id}: ${error}`);
      warned.add(mirror.id);
    }
  }
  const ids = new Set(mirrors.map((mirror) => mirror.id));
  for (const list of [warned, paused]) for (const id of list) if (!ids.has(id)) list.delete(id);
  for (const id of pushes.keys()) if (!ids.has(id)) pushes.delete(id);
  if (tick % 50 === 25) sweep();
}, 4);

system.runInterval(() => {
  for (const mirror of mirrors) {
    try {
      if (!mirror.isValid || paused.has(mirror.id)) continue;
      const frame = frameOf(mirror);
      if (!frame) continue;
      keepOut(mirror, frame);
      if (mobsWanted()) showMobs(mirror, frame, (location) => inFront(frame, location) !== undefined, Math.hypot(REACH, REACH, RISE));
    } catch {}
  }
  for (const [id, entry] of figures) {
    if (!entry.mirror.isValid) {
      figures.delete(id);
      continue;
    }
    try {
      trace(entry);
    } catch {}
  }
});
