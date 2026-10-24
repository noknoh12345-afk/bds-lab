import { world, system, Player } from '@minecraft/server';
import { cmd } from './kit';

// 経路②(Android実機クライアント内 scripteval / agent.js)の操作語彙を、
// bds-lab の Script API アドオンとして実装した「サーバ側ツイン」。
// adb の tap/swipe を使わずプレイヤーを制御する verb を、実機BDSで検証できる形にする。
// 語彙は control_protocol.md と一致: tp / move / look / face / place / break / say / query
//   + goto / stop(タッチなしの連続移動=歩行)。

cmd('lab:tp', 'Teleport self to x y z', { to: 'loc' }, (p, a) => {
  p.teleport(a.to);
  const { x, y, z } = p.location;
  return `tp ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`;
});

cmd('lab:move', 'Move relative by dx dy dz', { dx: 'float', dy: 'float', dz: 'float' }, (p, a) => {
  const l = p.location;
  p.teleport({ x: l.x + a.dx, y: l.y + a.dy, z: l.z + a.dz });
  const { x, y, z } = p.location;
  return `move ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`;
});

// 注意: 実クライアントの視点はクライアント権限。server側 setRotation は同tickでは効くが
// 次tickにクライアントの実値で上書きされる(= 恒久的な視点制御は経路②のネイティブ入力
// フック ScriptEval.injectInput が要る)。tp/move/place/break は server 権限で恒久的に効く。
cmd('lab:look', 'Set view to yaw pitch', { yaw: 'float', pitch: 'float' }, (p, a) => {
  p.setRotation({ x: a.pitch, y: a.yaw });
  const r = p.getRotation();
  return `look ${Math.round(r.y)} ${Math.round(r.x)}`;
});

cmd('lab:face', 'Face a point x y z', { at: 'loc' }, (p, a) => {
  p.teleport(p.location, { facingLocation: a.at });
  const r = p.getRotation();
  return `face ${Math.round(r.y)} ${Math.round(r.x)}`;
});

cmd('lab:place', 'Place a block at x y z', { at: 'loc', block: 'block' }, (p, a) => {
  const b = p.dimension.getBlock(a.at);
  if (!b) return 'place: block not loaded';
  b.setType(a.block);
  return `place ${b.typeId.replace('minecraft:', '')}`;
});

cmd('lab:break', 'Break (set air) a block at x y z', { at: 'loc' }, (p, a) => {
  const b = p.dimension.getBlock(a.at);
  if (!b) return 'break: block not loaded';
  b.setType('minecraft:air');
  return 'break air';
});

cmd('lab:say', 'Broadcast a chat message', { msg: 'string' }, (p, a) => {
  world.sendMessage(`${p.name}: ${a.msg}`);
  return `say ${a.msg}`;
});

cmd('lab:query', 'Report self pos/rot and player count', {}, (p) => {
  const { x, y, z } = p.location;
  const r = p.getRotation();
  const n = world.getAllPlayers().length;
  return `self ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} yaw ${Math.round(r.y)} pitch ${Math.round(r.x)} players ${n}`;
});

// ---- タッチなしの移動(歩行): 毎tickの連続テレポートで目的地まで運ぶ ----
// tp は server 権限で実クライアントにも恒久的に効く(検証済み)。これを1tick刻みで
// 繰り返すことで、画面に触れずにプレイヤーを歩かせる。向きは facingLocation で進行方向へ。
const walkers = new Map<string, number>(); // playerId -> runInterval id
function stopWalk(p: Player): void {
  const id = walkers.get(p.id);
  if (id !== undefined) { system.clearRun(id); walkers.delete(p.id); }
}

cmd('lab:goto', 'Walk to x z without touch', { x: 'float', z: 'float', 'speed?': 'float' }, (p, a) => {
  stopWalk(p);
  const speed = Math.max(0.05, Math.min(a.speed ?? 0.4, 1)); // blocks/tick
  const run = system.runInterval(() => {
    if (!p.isValid) { stopWalk(p); return; }
    const l = p.location;
    const dx = a.x - l.x, dz = a.z - l.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) {
      stopWalk(p);
      p.sendMessage(`arrived ${Math.round(l.x)} ${Math.round(l.z)}`);
      return;
    }
    const step = Math.min(speed, d);
    p.teleport(
      { x: l.x + (dx / d) * step, y: l.y, z: l.z + (dz / d) * step },
      { facingLocation: { x: a.x, y: l.y, z: a.z } },
    );
  }, 1);
  walkers.set(p.id, run);
  return `goto ${a.x} ${a.z}`;
});

cmd('lab:stop', 'Stop walking', {}, (p) => { stopWalk(p); return 'stop'; });
