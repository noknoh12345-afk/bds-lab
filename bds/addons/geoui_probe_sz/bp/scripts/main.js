// GeoUI Builder 0.1.0: the properties the resource pack reads (q.property('gprobz:…')), set per player.
// /gprobz:set <name> <value> · /gprobz:aspect <width> <height> · /gprobz:get · /gprobz:reset
// /scriptevent gprobz:set <name> <value>   (from a command block or another pack: the source player, else everyone)
// scoreboard gprobz_v0 … gprobz_v3 (if you add them) are copied to v0 … v3 every 2 ticks.
import { world, system, Player, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from '@minecraft/server';

const CFG = {"ns":"gprobz","ranges":{"aspect":[600,5000],"scale":[1,1000],"cx":[-3000,3000],"cy":[-3000,3000],"ox":[-4000,4000],"oy":[-4000,4000],"alpha":[0,100],"v0":[-16777216,16777216],"v1":[-16777216,16777216],"v2":[-16777216,16777216],"v3":[-16777216,16777216]},"aspect":{"desktop":1778,"mobile":2000,"console":1778},"center":{"desktop":{"cx":0,"cy":-290},"mobile":{"cx":0,"cy":-290},"console":{"cx":0,"cy":-290}},"centerAuto":true};
const NS = CFG.ns;
const KEEP = ['aspect', 'scale', 'cx', 'cy', 'ox', 'oy', 'alpha'];

function platformOf(p) {
  try { const t = String(p.clientSystemInfo.platformType); return t === 'Mobile' ? 'mobile' : t === 'Console' ? 'console' : 'desktop'; } catch { return 'desktop'; }
}
/** '' or why not (out of range, not an integer, unknown name): nothing is dropped silently */
function setOne(p, name, value, keep) {
  const r = CFG.ranges[name];
  if (!r) return `${NS}: unknown property ${name} (${Object.keys(CFG.ranges).join(', ')})`;
  if (!Number.isInteger(value) || value < r[0] || value > r[1]) return `${NS}:${name} must be an integer ${r[0]}..${r[1]} (got ${value})`;
  p.setProperty(`${NS}:${name}`, value);
  if (keep && KEEP.includes(name)) p.setDynamicProperty(`${NS}:${name}`, value);
  return '';
}
function restore(p) {
  const pl = platformOf(p), def = { aspect: CFG.aspect[pl], cx: CFG.centerAuto ? CFG.center[pl].cx : CFG.center.desktop.cx, cy: CFG.centerAuto ? CFG.center[pl].cy : CFG.center.desktop.cy };
  for (const name of KEEP) {
    let v; try { v = p.getDynamicProperty(`${NS}:${name}`); } catch { v = undefined; }
    if (typeof v !== 'number') v = def[name];
    if (typeof v === 'number') setOne(p, name, v, false);
  }
}
function reset(p) {
  for (const name of KEEP) { try { p.setDynamicProperty(`${NS}:${name}`, undefined); } catch { /* left */ } }
  for (const name of ['scale', 'ox', 'oy', 'alpha']) p.resetProperty(`${NS}:${name}`);
  restore(p);
}
world.afterEvents.playerSpawn.subscribe((e) => { if (e.initialSpawn) system.run(() => { if (e.player.isValid) restore(e.player); }); });
world.afterEvents.worldLoad.subscribe(() => { for (const p of world.getAllPlayers()) restore(p); });

system.beforeEvents.startup.subscribe((e) => {
  const reg = e.customCommandRegistry, ANY = CommandPermissionLevel.Any;
  const who = (o) => { const s = o.initiator ?? o.sourceEntity; return s instanceof Player ? s : undefined; };
  const reply = (p, text) => system.run(() => { if (p && p.isValid) p.sendMessage(text); else console.warn(text); });
  reg.registerEnum(`${NS}:property`, Object.keys(CFG.ranges));
  reg.registerCommand({ name: `${NS}:set`, description: 'GeoUI: set one of your properties', permissionLevel: ANY,
    mandatoryParameters: [{ name: `${NS}:property`, type: CustomCommandParamType.Enum }, { name: 'value', type: CustomCommandParamType.Integer }] },
  (o, name, value) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (!p.isValid) return; const why = setOne(p, name, value, true); reply(p, why || `${NS}:${name} = ${value}`); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: `${NS}:aspect`, description: 'GeoUI: your screen size (e.g. 2340 1080)', permissionLevel: ANY,
    mandatoryParameters: [{ name: 'width', type: CustomCommandParamType.Integer }, { name: 'height', type: CustomCommandParamType.Integer }] },
  (o, w, h) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    if (!(w > 0 && h > 0)) return { status: CustomCommandStatus.Failure, message: 'width and height must be positive' };
    system.run(() => { if (!p.isValid) return; const a = Math.round(w / h * 1000), why = setOne(p, 'aspect', a, true); reply(p, why || `${NS}:aspect = ${a}`); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: `${NS}:get`, description: 'GeoUI: show your properties', permissionLevel: ANY },
  (o) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) reply(p, Object.keys(CFG.ranges).map((k) => `${k}=${p.getProperty(`${NS}:${k}`)}`).join(' ')); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: `${NS}:reset`, description: 'GeoUI: back to the defaults of your device', permissionLevel: ANY },
  (o) => {
    const p = who(o);
    if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) { reset(p); reply(p, `${NS}: reset`); } });
    return { status: CustomCommandStatus.Success };
  });
});

system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id !== `${NS}:set`) return;
  const [name, raw] = String(e.message).trim().split(/\s+/), value = Number(raw);
  const targets = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) { const why = setOne(p, name, value, true); if (why) console.warn(why); }
}, { namespaces: [NS] });

system.runInterval(() => {
  for (let i = 0; i < 4; i++) {
    const o = world.scoreboard.getObjective(`${NS}_v${i}`);
    if (!o) continue;
    const r = CFG.ranges[`v${i}`];
    for (const p of world.getAllPlayers()) {
      if (!o.hasParticipant(p)) continue;
      const s = o.getScore(p);
      if (s === undefined) continue;
      const v = Math.min(r[1], Math.max(r[0], s));
      if (p.getProperty(`${NS}:v${i}`) !== v) p.setProperty(`${NS}:v${i}`, v);
    }
  }
}, 2);
