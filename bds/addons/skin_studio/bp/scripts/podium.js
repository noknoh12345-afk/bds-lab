import { world, system } from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
import { relayOf } from './relay.js';
import { hudOf, showHud } from './hud.js';
import { PODIUM, PODIUM_EGG, YAW, facingOf, loaded, set, settle, refund, parsed, canEdit, origin, claim, present } from './util.js';
import { uidOf, renew, record, records, remember, forgetRecord } from './registry.js';

const RANKS = [1, 2, 3];
const LABELS = ['§61位', '§72位', '§c3位'];
const STEPS = [
  [0, 22.4],
  [-18, 16.4],
  [18, 12.4],
];
const TAKEN = '§cそこにはもう表彰台があります。';
const busy = new Set();

export function ranking(podium) {
  const who = parsed(podium.getDynamicProperty('ss:who'), null);
  if (!Array.isArray(who) || who.length !== 3) return [null, null, null];
  return who.map((entry) => (entry && typeof entry.id === 'string' && typeof entry.name === 'string' ? { id: entry.id, name: entry.name } : null));
}

export function findPlayer(entry, players) {
  if (!entry) return undefined;
  return players.find((player) => player.id === entry.id) ?? players.find((player) => player.name === entry.name);
}

export function slotsOf(who, players) {
  return who.map((entry) => {
    const player = findPlayer(entry, players);
    return (player && relayOf(player)) ?? { slot: 0, gen: 0 };
  });
}

const spotOf = ({ location: { x, y, z } }) => ({ x: Math.floor(x) + 0.5, y, z: Math.floor(z) + 0.5 });
const sameBlock = (a, b) => Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y + 0.01) === Math.floor(b.y + 0.01) && Math.floor(a.z) === Math.floor(b.z);

export function podiumAt(dimension, location, except) {
  return dimension.getEntities({ type: PODIUM, location, maxDistance: 2 }).find((other) => other.id !== except?.id && sameBlock(other.location, location));
}

export function findPodium(uid) {
  if (!uid) return undefined;
  return loaded(PODIUM).find((podium) => podium.getDynamicProperty('ss:u') === uid);
}

function keep(podium) {
  const { x, y, z } = spotOf(podium);
  remember(uidOf(podium), { kind: 'podium', dim: podium.dimension.id, x, y, z, f: Number(podium.getDynamicProperty('ss:f')), who: ranking(podium) });
}

export function setup(podium, facing, from) {
  podium.setDynamicProperty('ss:f', facing);
  if (from) claim(podium, from);
  uidOf(podium);
  update(podium, world.getAllPlayers());
}

export function assign(podium, place, player) {
  const who = ranking(podium);
  who[place - 1] = player ? { id: player.id, name: player.name } : null;
  save(podium, who);
}

function save(podium, who) {
  const before = ranking(podium);
  podium.setDynamicProperty('ss:who', JSON.stringify(who));
  update(podium, world.getAllPlayers());
  for (const place of RANKS) {
    if (who[place - 1] && who[place - 1].id !== before[place - 1]?.id) cheer(podium, place);
  }
}

function cheer(podium, place) {
  try {
    const [across, top] = STEPS[place - 1];
    const turn = (YAW[Number(podium.getDynamicProperty('ss:f'))] * Math.PI) / 180;
    const { x, y, z } = podium.location;
    const spot = { x: x + (Math.cos(turn) * across) / 16, y: y + (top + 34) / 16, z: z + (Math.sin(turn) * across) / 16 };
    podium.dimension.spawnParticle('minecraft:totem_particle', spot);
    podium.dimension.playSound(place === 1 ? 'random.levelup' : 'random.orb', spot, { volume: 0.7, pitch: 1 + (place - 1) * 0.15 });
  } catch {}
}

function update(podium, players) {
  settle(podium, spotOf(podium), Number(podium.getDynamicProperty('ss:f')));
  const who = ranking(podium);
  const lines = [];
  for (const place of RANKS) {
    const entry = who[place - 1];
    const player = findPlayer(entry, players);
    const relay = player && relayOf(player);
    if (relay || !entry) {
      set(podium, `skin_studio:s${place}`, relay?.slot ?? 0);
      set(podium, `skin_studio:g${place}`, relay?.gen ?? 0);
    }
    if (entry) lines.push(`${LABELS[place - 1]} §f${entry.name}`);
  }
  const tag = lines.join('\n');
  if (podium.nameTag !== tag) podium.nameTag = tag;
  keep(podium);
}

export function removePodium(podium, player) {
  forgetRecord(uidOf(podium));
  refund(podium, player, PODIUM_EGG);
}

async function edit(player, podium) {
  const uid = uidOf(podium);
  const showing = hudOf(player)?.uid === uid;
  if (!canEdit(player, podium)) {
    const response = await present(new ModalFormData().title('表彰台').toggle('自分の画面に出す', { defaultValue: showing }), player);
    if (response.canceled || !podium.isValid) return;
    const [show] = response.formValues;
    if (show) showHud(player, podium);
    else if (showing) showHud(player, undefined);
    return;
  }
  const who = ranking(podium);
  const people = world.getAllPlayers().map(({ id, name }) => ({ id, name }));
  const form = new ModalFormData().title('表彰台');
  const choices = RANKS.map((place) => {
    const list = [null, ...people];
    const current = who[place - 1];
    let index = current ? list.findIndex((entry) => entry?.id === current.id) : 0;
    if (index < 0) index = list.push(current) - 1;
    form.dropdown(`${place}位`, list.map((entry) => entry?.name ?? '（なし）'), { defaultValueIndex: index });
    return list;
  });
  form.toggle('自分の画面に出す', { defaultValue: showing });
  form.toggle('§c片付ける', { defaultValue: false });

  const response = await present(form, player);
  if (response.canceled || !podium.isValid) return;
  const [first, second, third, show, remove] = response.formValues;
  if (remove) {
    removePodium(podium, player);
    return;
  }
  save(podium, [first, second, third].map((pick, i) => choices[i][Number(pick)] ?? null));
  if (show) showHud(player, podium);
  else if (showing) showHud(player, undefined);
}

export function restorePodiums() {
  let count = 0;
  for (const saved of records('podium')) {
    const dimension = world.getDimension(saved.dim);
    const spot = { x: saved.x, y: saved.y, z: saved.z };
    if (!dimension.isChunkLoaded(spot) || findPodium(saved.uid) || podiumAt(dimension, spot)) continue;
    const podium = dimension.spawnEntity(PODIUM, spot, { initialRotation: YAW[saved.f] ?? 0 });
    podium.setDynamicProperty('ss:u', saved.uid);
    podium.setDynamicProperty('ss:who', JSON.stringify(Array.isArray(saved.who) ? saved.who : [null, null, null]));
    setup(podium, Number(saved.f) || 0);
    count++;
  }
  return count;
}

export function podiumState(podium) {
  return { uid: podium.getDynamicProperty('ss:u'), who: ranking(podium).map((entry) => entry?.name ?? '-') };
}

function arrive(podium) {
  const from = origin(podium, PODIUM_EGG);
  if (from.kind === 'spawner') {
    podium.remove();
    return;
  }
  if (podiumAt(podium.dimension, podium.location, podium)) {
    claim(podium, from);
    from.player?.sendMessage(TAKEN);
    refund(podium, from.player, PODIUM_EGG);
    return;
  }
  setup(podium, facingOf((from.yaw ?? 0) + 180), from);
}

function untangle(podiums) {
  const groups = new Map();
  for (const podium of podiums) {
    const uid = podium.getDynamicProperty('ss:u');
    if (typeof uid === 'string') groups.set(uid, [...(groups.get(uid) ?? []), podium]);
  }
  for (const [uid, group] of groups) {
    if (group.length < 2) continue;
    const saved = record(uid);
    const home = saved ? (podium) => (saved.dim === podium.dimension.id && sameBlock(podium.location, saved) ? 0 : 1) : () => 0;
    group.sort((a, b) => home(a) - home(b));
    for (const copy of group.slice(1)) {
      renew(copy);
      copy.setDynamicProperty('ss:egg', undefined);
    }
  }
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (!entity.isValid || entity.typeId !== PODIUM) return;
  system.run(() => {
    if (entity.isValid && entity.getDynamicProperty('ss:f') === undefined) arrive(entity);
  });
});

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  if (event.target.typeId !== PODIUM) return;
  event.cancel = true;
  const { player, target } = event;
  if (busy.has(player.id)) return;
  busy.add(player.id);
  system.run(() => edit(player, target).finally(() => busy.delete(player.id)));
});

system.runInterval(() => {
  const players = world.getAllPlayers();
  const podiums = loaded(PODIUM);
  untangle(podiums);
  for (const podium of podiums) {
    try {
      if (!podium.isValid) continue;
      if (podium.getDynamicProperty('ss:f') === undefined) arrive(podium);
      else update(podium, players);
    } catch (error) {
      console.warn(`[Skin Studio] podium ${podium.id}: ${error}`);
    }
  }
}, 20);
