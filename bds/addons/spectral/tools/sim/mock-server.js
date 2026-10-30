// a recording mock of @minecraft/server: just enough to run the Spectral Player bundle tick by tick
export const log = [];
let tick = 0;
const subs = () => { const a = []; return { subscribe: (f) => (a.push(f), f), unsubscribe() {}, _fire: (e) => a.forEach((f) => f(e)) }; };
export const CustomCommandParamType = { Integer: 'int', Float: 'float', String: 'string', Boolean: 'bool', PlayerSelector: 'player', EntitySelector: 'entity', Location: 'loc', ItemType: 'item', BlockType: 'block', Enum: 'enum' };
export const CommandPermissionLevel = { Any: 0, GameDirectors: 1 };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
export const DisplaySlotId = { Sidebar: 'sidebar', List: 'list', BelowName: 'belowname' };
export class ItemStack { constructor(id, n = 1) { this.typeId = id; this.amount = n; } setLore() {} clone() { return new ItemStack(this.typeId, this.amount); } }
let nid = 0;
export class SoundInstance {
  constructor(id, o, who) { this.id = String(++nid); this.soundEventId = id; log.push(['play', tick, this.id, id, o?.pitch ?? 1, o?.volume ?? 1, o?.loopCount ?? 0, who]); }
  setPitch(p) { log.push(['pitch', tick, this.id, p]); } fade(d, v) { log.push(['fade', tick, this.id, d, v]); } setVolume(v) { log.push(['vol', tick, this.id, v]); }
  stop() { log.push(['stop', tick, this.id]); } pause() { log.push(['pause', tick, this.id]); } resume() { log.push(['resume', tick, this.id]); } seekTo(s) { log.push(['seek', tick, this.id, s]); }
}
const dim = { id: 'minecraft:overworld', playSound: (id, loc, o) => new SoundInstance(id, o, 'dim'), spawnParticle() {} };
export class Player {
  constructor(name) { this.name = name; this.id = 'p-' + name; this.isValid = true; this.location = { x: 0, y: -60, z: 0 }; this.dimension = dim; this.dp = new Map(); this.msgs = [];
    this.onScreenDisplay = { setActionBar: (t) => { this.bar = t; } }; }
  playSound(id, o) { return new SoundInstance(id, o, this.name); }
  sendMessage(m) { this.msgs.push(m); log.push(['msg', tick, this.name, m]); }
  getDynamicProperty(k) { return this.dp.get(k); } setDynamicProperty(k, v) { this.dp.set(k, v); }
}
let players = [];
export const _setPlayers = (p) => { players = p; };
export const world = { afterEvents: { worldLoad: subs(), playerSpawn: subs(), playerDimensionChange: subs(), playerLeave: subs() }, beforeEvents: {},
  getPlayers: () => players, getAllPlayers: () => players, sendMessage: (m) => log.push(['world', tick, m]), scoreboard: {} };
const intervals = [], timeouts = [], jobs = [];
export const commands = {};
export const system = {
  beforeEvents: { startup: subs() }, afterEvents: { scriptEventReceive: subs() },
  get currentTick() { return tick; },
  runInterval(fn, n = 1) { intervals.push({ fn, n, next: tick + n }); return intervals.length; },
  runTimeout(fn, n = 1) { timeouts.push({ fn, at: tick + n }); return 0; },
  run(fn) { timeouts.push({ fn, at: tick }); return 0; },
  runJob(g) { jobs.push(g); return 0; },
  waitTicks(n) { return new Promise((res) => timeouts.push({ fn: res, at: tick + n })); },
  clearRun() {},
  sendScriptEvent(id, message) { system.afterEvents.scriptEventReceive._fire({ id, message }); },
};
export function _startup() {
  system.beforeEvents.startup._fire({ customCommandRegistry: { registerCommand: (d, cb) => { commands[d.name] = cb; }, registerEnum() {} },
    itemComponentRegistry: { registerCustomComponent() {} }, blockComponentRegistry: { registerCustomComponent() {} } });
}
const flush = () => new Promise((r) => setImmediate(r));
export async function _step() {
  for (let i = 0; i < jobs.length; i++) { const g = jobs[i]; for (;;) { const r = g.next(); if (r.done) { jobs.splice(i--, 1); break; } } }
  await flush();
  for (let pass = 0; pass < 4; pass++) { const due = timeouts.filter((t) => t.at <= tick); if (!due.length) break; for (const t of due) timeouts.splice(timeouts.indexOf(t), 1); due.forEach((t) => t.fn()); await flush(); }
  for (const iv of intervals) if (iv.next <= tick) { iv.fn(); iv.next = tick + iv.n; }
  await flush();
  tick++;
}
export const _tick = () => tick;
