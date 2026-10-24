import { world } from '@minecraft/server';
import { cmd } from './kit';

// 経路②(Android実機クライアント内 scripteval / agent.js)の操作語彙を、
// bds-lab の Script API アドオンとして実装した「サーバ側ツイン」。
// adb の tap/swipe を使わずプレイヤーを制御する verb を、実機BDSで検証できる形にする。
// 語彙は control_protocol.md と一致: tp / move / look / face / place / break / say / query。

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
