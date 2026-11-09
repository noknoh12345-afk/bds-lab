import { world, system, Player, CommandPermissionLevel, CustomCommandParamType as Param, CustomCommandStatus } from '@minecraft/server';
import { PODIUM, MIRROR, FACINGS, YAW, facingOf, yawOf, isManager } from './util.js';
import { setup as setupPodium, assign, podiumAt, removePodium, restorePodiums, podiumState } from './podium.js';
import { setup as setupMirror, windowProblem, removeMirror, restoreMirrors, mirrorState } from './mirror.js';
import { showHud, resizeHud } from './hud.js';
import { isReplaced } from './relay.js';
import { records } from './registry.js';
import { VERSION, SAMPLES } from './about.js';

const REACH = 32;
const ENUMS = { 'studio:facing': FACINGS, 'studio:switch': ['on', 'off'] };
const BLOCK_FACING = { 2: { x: 0, z: -1 }, 3: { x: 0, z: 1 }, 4: { x: -1, z: 0 }, 5: { x: 1, z: 0 } };
const ok = (message) => ({ status: CustomCommandStatus.Success, message });
const no = (message) => ({ status: CustomCommandStatus.Failure, message: message.replace(/§./g, '') });
const selfOf = (origin) => (origin.sourceEntity instanceof Player ? origin.sourceEntity : undefined);
const names = (players) => players.map((player) => player.name).join('、');

function sourceOf(origin) {
  const entity = origin.sourceEntity;
  if (entity) return { entity, dimension: entity.dimension, location: entity.location };
  const block = origin.sourceBlock;
  if (block) return { block, dimension: block.dimension, location: { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 } };
}

function nearest(origin, types) {
  const source = sourceOf(origin);
  if (!source) return undefined;
  if (types.includes(source.entity?.typeId)) return source.entity;
  const { x, y, z } = source.location;
  const far = ({ location }) => (location.x - x) ** 2 + (location.y - y) ** 2 + (location.z - z) ** 2;
  const found = types.flatMap((type) => source.dimension.getEntities({ type, location: source.location, maxDistance: REACH, closest: 1 }));
  return found.sort((a, b) => far(a) - far(b) || types.indexOf(a.typeId) - types.indexOf(b.typeId))[0];
}

function facingFor(origin, dimension, location, name) {
  if (name) return FACINGS.indexOf(name);
  const self = selfOf(origin);
  if (self) return facingOf(self.getRotation().y + 180);
  if (origin.sourceBlock) {
    try {
      const way = BLOCK_FACING[Number(origin.sourceBlock.permutation.getState('facing_direction'))];
      if (way) return facingOf(yawOf(way) + 180);
    } catch {}
  }
  const viewer = dimension.getPlayers({ location, maxDistance: 16, closest: 1 })[0];
  return viewer ? facingOf(viewer.getRotation().y + 180) : 0;
}

function targets(origin, players) {
  const self = selfOf(origin);
  const list = players ?? (self ? [self] : []);
  const others = list.some((player) => player.id !== self?.id);
  if (others && self && !isManager(self)) return undefined;
  return list;
}

function blockAt(dimension, location) {
  try {
    return dimension.getBlock(location);
  } catch {
    return undefined;
  }
}

const solid = (block) => !!block && !block.isAir && !block.isLiquid;

function podiumSpot(dimension, spot) {
  const x = Math.floor(spot.x) + 0.5;
  const z = Math.floor(spot.z) + 0.5;
  const base = Math.floor(spot.y + 0.01);
  if (solid(blockAt(dimension, { x, y: base, z }))) return spot.y - base < 0.01 ? undefined : { x, y: spot.y, z };
  return { x, y: solid(blockAt(dimension, { x, y: base - 1, z })) ? base : spot.y, z };
}

function placeWith(type, label, check) {
  return (origin, location, facing) => {
    const source = sourceOf(origin);
    const spot = location ?? source?.location;
    if (!spot) return no('置く場所を指定してください（例: 0 64 0）');
    const dimension = source?.dimension ?? world.getDimension('overworld');
    const { min, max } = dimension.heightRange;
    if (spot.y < min || spot.y >= max || !dimension.isChunkLoaded(spot)) return no('そこは読み込まれていないか、高さの外です');
    const turn = facingFor(origin, dimension, spot, facing);
    const problem = check(dimension, spot, turn);
    if (typeof problem === 'string') return no(problem);
    const at = problem;
    const from = { kind: 'command', player: selfOf(origin) };
    system.run(() => {
      const entity = dimension.spawnEntity(type, at, { initialRotation: YAW[turn] });
      if (type === PODIUM) setupPodium(entity, turn, from);
      else setupMirror(entity, turn, from);
    });
    return ok(`${label}を置きました（${at.x} ${at.y} ${at.z}、${FACINGS[turn]} 向き）`);
  };
}

function checkPodium(dimension, spot) {
  const at = podiumSpot(dimension, spot);
  if (!at) return 'ブロックの中には置けません';
  if (podiumAt(dimension, at)) return 'そこにはもう表彰台があります';
  return at;
}

function checkMirror(dimension, spot, turn) {
  const problem = windowProblem(dimension, spot, turn);
  if (problem) return problem;
  return { x: Math.floor(spot.x) + 0.5, y: spot.y, z: Math.floor(spot.z) + 0.5 };
}

function setRank(origin, place, players) {
  if (![1, 2, 3].includes(place)) return no('順位は 1・2・3 のどれかです');
  if (players && players.length !== 1) return no('入れる人は 1 人だけ指定してください');
  const podium = nearest(origin, [PODIUM]);
  if (!podium) return no(`${REACH} ブロック以内に表彰台がありません`);
  const player = players?.[0];
  system.run(() => podium.isValid && assign(podium, place, player));
  return ok(player ? `${place}位に ${player.name} を入れました` : `${place}位を空けました`);
}

function hud(origin, state, players) {
  const list = targets(origin, players);
  if (!list) return no('ほかの人の画面を変えられるのはオペレーターだけです');
  if (!list.length) return no('だれの画面かを指定してください（例: @a）');
  if (state === 'off') {
    system.run(() => list.forEach((player) => player.isValid && showHud(player, undefined)));
    return ok(`画面の表彰台を消しました（${names(list)}）`);
  }
  const podium = nearest(origin, [PODIUM]);
  if (!podium) return no(`${REACH} ブロック以内に表彰台がありません`);
  system.run(() => list.forEach((player) => player.isValid && podium.isValid && showHud(player, podium)));
  return ok(`画面に表彰台を出しました（${names(list)}）`);
}

function resize(origin, percent, players) {
  const list = targets(origin, players);
  if (!list) return no('ほかの人の画面を変えられるのはオペレーターだけです');
  if (!list.length) return no('だれの画面かを指定してください（例: @a）');
  if (!(percent >= 30 && percent <= 300)) return no('大きさは 30〜300（%）です。ふつうは 100');
  system.run(() => list.forEach((player) => player.isValid && resizeHud(player, Math.round(percent))));
  return ok(`画面の表彰台を ${Math.round(percent)}% にしました（${names(list)}）`);
}

function debug(origin, state, players) {
  const list = targets(origin, players);
  if (!list) return no('ほかの人の表示を変えられるのはオペレーターだけです');
  if (!list.length) return no('だれの表示かを指定してください（例: @s）');
  system.run(() => list.forEach((player) => player.isValid && player.getProperty('skin_studio:debug') !== undefined && player.setProperty('skin_studio:debug', state === 'on')));
  return ok(state === 'on' ? `鏡像の上に、いまの映り方の印を出しました（${names(list)}）` : `印を消しました（${names(list)}）`);
}

function remove(origin) {
  const target = nearest(origin, [MIRROR, PODIUM]);
  if (!target) return no(`${REACH} ブロック以内に表彰台も鏡もありません`);
  const mirror = target.typeId === MIRROR;
  system.run(() => target.isValid && (mirror ? removeMirror(target) : removePodium(target)));
  return ok(mirror ? '鏡を片付けました' : '表彰台を片付けました');
}

function restore() {
  system.run(() => {
    const count = restorePodiums() + restoreMirrors();
    console.warn(`[Skin Studio] restored ${count}`);
  });
  return ok('台帳から、消えた表彰台と鏡を元の場所に戻します（読み込まれている所だけ）');
}

function report(origin) {
  const lines = [`Skin Studio ${VERSION.join('.')}（bedrock-samples ${SAMPLES}）`];
  const mirror = nearest(origin, [MIRROR]);
  if (mirror) {
    const state = mirrorState(mirror);
    lines.push(
      `鏡 ${state.uid ?? '?'}: ${state.paused ? '窓がふさがっていて止めている' : '映している'}・番号 ${state.channel}・人 ${state.people.join('、') || 'なし'}・鏡の中のブロック ${state.ghosts}・見えない箱 ${state.walls}・押し戻し ${state.pushed} 回・向き ${Math.round(mirror.getRotation().y)}`,
    );
  }
  const podium = nearest(origin, [PODIUM]);
  if (podium) {
    const state = podiumState(podium);
    lines.push(`表彰台 ${state.uid ?? '?'}: ${state.who.map((name, i) => `${i + 1}位 ${name}`).join('・')}`);
  }
  lines.push(`台帳: 表彰台 ${records('podium').length}・鏡 ${records('mirror').length}`);
  lines.push(isReplaced() ? 'プレイヤーの定義: ほかのパックが上書きしている（人が映らない）' : 'プレイヤーの定義: Skin Studio のまま');
  const self = selfOf(origin);
  if (!self) return ok(lines.join('\n'));
  system.run(() => self.isValid && lines.slice(1).forEach((line) => self.sendMessage(line)));
  return ok(lines[0]);
}

function register(registry, definition, callback) {
  try {
    registry.registerCommand(definition, callback);
  } catch (error) {
    console.warn(`[Skin Studio] /${definition.name} was not registered: ${error}`);
  }
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry: registry }) => {
  const op = { permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false };
  const anyone = { permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false };
  const where = [
    { name: 'location', type: Param.Location },
    { name: 'studio:facing', type: Param.Enum },
  ];
  const players = { name: 'players', type: Param.PlayerSelector };
  const toggle = { name: 'studio:switch', type: Param.Enum };

  for (const [name, values] of Object.entries(ENUMS)) {
    try {
      registry.registerEnum(name, values);
    } catch (error) {
      console.warn(`[Skin Studio] ${name} was not registered: ${error}`);
    }
  }
  register(registry, { name: 'studio:podium', description: '表彰台を置く', ...op, optionalParameters: where }, placeWith(PODIUM, '表彰台', checkPodium));
  register(registry, { name: 'studio:mirror', description: '鏡を置く（壁にあけた 3×3 の窓の一番下の真ん中に）', ...op, optionalParameters: where }, placeWith(MIRROR, '鏡', checkMirror));
  register(
    registry,
    {
      name: 'studio:rank',
      description: '近くの表彰台の順位に人を入れる（人を省くと空ける）',
      ...op,
      mandatoryParameters: [{ name: 'rank', type: Param.Integer }],
      optionalParameters: [{ name: 'player', type: Param.PlayerSelector }],
    },
    setRank,
  );
  register(registry, { name: 'studio:hud', description: '近くの表彰台を画面に出す・消す', ...anyone, mandatoryParameters: [toggle], optionalParameters: [players] }, hud);
  register(
    registry,
    { name: 'studio:hudsize', description: '画面の表彰台の大きさ（%。ふつうは 100）', ...anyone, mandatoryParameters: [{ name: 'percent', type: Param.Integer }], optionalParameters: [players] },
    resize,
  );
  register(registry, { name: 'studio:remove', description: '近くの鏡か表彰台を片付ける（同じ距離なら鏡）', ...op }, remove);
  register(registry, { name: 'studio:restore', description: '台帳から、消えた表彰台と鏡を元の場所に戻す', ...op }, restore);
  register(registry, { name: 'studio:report', description: '近くの鏡と表彰台の状態を出す', ...anyone }, report);
  register(registry, { name: 'studio:debug', description: '鏡像の上に、いまの映り方の印を出す・消す', ...anyone, mandatoryParameters: [toggle], optionalParameters: [players] }, debug);
});
