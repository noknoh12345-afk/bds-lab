// ScriptEval prelude: a client-side, read-only re-implementation of the parts
// of @minecraft/server that make sense on a client, backed by __native.mc
// (memory reads of the client's own world state - no packets, no server).
"use strict";
(() => {
const G = globalThis;
const N = G.__native;
const mc = N.mc, nd = N.dbg, sys = N.sys, U = N.ui;

// ===========================================================================
// inspect / console
// ===========================================================================
const INSPECT = Symbol.for("scripteval.inspect");
let currentTask = null;
// Resources (timers, jobs, event handlers, panels, watches) remember the module
// that created them, so a module can be stopped or hot-reloaded cleanly.
let currentOwner = null;
const handlerOwners = new WeakMap();
const jobOwners = new Map();
const disposers = new Map();   // owner -> [fn]
const withOwner = (owner, fn) => { const prev = currentOwner; currentOwner = owner; try { return fn(); } finally { currentOwner = prev; } };

function isIdent(k) { return /^[A-Za-z_$][\w$]*$/.test(k); }

function inspect(v, opts = {}, depth = 0, seen = new Set()) {
  const maxDepth = opts.depth ?? 3;
  switch (typeof v) {
    case "string": return (depth === 0 && opts.raw) ? v : JSON.stringify(v);
    case "number": return Object.is(v, -0) ? "-0" : String(v);
    case "bigint": return v + "n";
    case "boolean": case "undefined": return String(v);
    case "symbol": return v.toString();
    case "function": {
      const src = Function.prototype.toString.call(v);
      return src.startsWith("class") ? `[class ${v.name}]` : `[Function: ${v.name || "anonymous"}]`;
    }
  }
  if (v === null) return "null";
  if (seen.has(v)) return "[Circular]";
  if (typeof v[INSPECT] === "function") {
    let custom;
    try { custom = v[INSPECT](); } catch (e) { return `<${v.constructor?.name ?? "object"}: ${e.message}>`; }
    if (custom !== v) {
      const name = v.constructor?.name ?? "";
      if (typeof custom === "string") return custom;
      seen.add(v);
      const s = inspect(custom, opts, depth, seen);
      seen.delete(v);
      return name ? `${name} ${s}` : s;
    }
  }
  if (v instanceof Error) return formatError(v);
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Promise) return "Promise { <pending?> }";
  if (v instanceof RegExp) return String(v);
  if (depth > maxDepth) return Array.isArray(v) ? `[Array(${v.length})]` : `[${v.constructor?.name ?? "Object"}]`;
  seen.add(v);
  let parts = [], open = "{", close = "}", prefix = "";
  try {
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      const n = Math.min(v.length, opts.maxItems ?? 100);
      for (let i = 0; i < n; i++) parts.push(inspect(v[i], opts, depth + 1, seen));
      if (v.length > n) parts.push(`... ${v.length - n} more`);
      open = "["; close = "]";
      if (!Array.isArray(v)) prefix = `${v.constructor.name}(${v.length}) `;
    } else if (v instanceof ArrayBuffer) {
      const u = new Uint8Array(v);
      return `ArrayBuffer(${u.length}) <${[...u.slice(0, 64)].map(b => b.toString(16).padStart(2, "0")).join(" ")}${u.length > 64 ? " ..." : ""}>`;
    } else if (v instanceof Map) {
      prefix = `Map(${v.size}) `;
      for (const [k, x] of [...v].slice(0, 100)) parts.push(`${inspect(k, opts, depth + 1, seen)} => ${inspect(x, opts, depth + 1, seen)}`);
    } else if (v instanceof Set) {
      prefix = `Set(${v.size}) `;
      for (const x of [...v].slice(0, 100)) parts.push(inspect(x, opts, depth + 1, seen));
    } else {
      const keys = Object.keys(v);
      const ctor = v.constructor;
      if (ctor && ctor !== Object && ctor.name) prefix = ctor.name + " ";
      for (const k of keys.slice(0, 80)) {
        let x;
        try { x = v[k]; } catch (e) { x = `<${e.message}>`; }
        parts.push(`${isIdent(k) ? k : JSON.stringify(k)}: ${inspect(x, opts, depth + 1, seen)}`);
      }
      if (keys.length > 80) parts.push(`... ${keys.length - 80} more keys`);
    }
  } finally {
    seen.delete(v);
  }
  if (parts.length === 0) return prefix + open + close;
  const single = open === "["
    ? `${prefix}[${parts.join(", ")}]`
    : `${prefix}{ ${parts.join(", ")} }`;
  if (single.length <= 90 && !single.includes("\n")) return single;
  const ind = "  ".repeat(depth + 1);
  return `${prefix}${open}\n${parts.map(p => ind + p).join(",\n")}\n${"  ".repeat(depth)}${close}`;
}

function formatError(e) {
  if (e instanceof Error) {
    let s = `${e.name}: ${e.message}`;
    if (e.stack) {
      const st = String(e.stack).split("\n").filter(l => l.trim() && !l.includes("<prelude>") && !l.includes("(native)")).join("\n");
      if (st) s += "\n" + st;
    }
    return s;
  }
  return "Uncaught " + inspect(e);
}

function formatArgs(args) {
  return args.map(a => typeof a === "string" ? a : inspect(a)).join(" ");
}

function emit(level, text) {
  if (currentTask) currentTask.out.push(text);
  else sys.print(level, text);
}

function table(data) {
  const rows = Array.isArray(data) ? data : Object.entries(data ?? {}).map(([k, v]) => ({ key: k, ...(typeof v === "object" ? v : { value: v }) }));
  const cols = [];
  for (const r of rows) for (const k of Object.keys(r ?? {})) if (!cols.includes(k)) cols.push(k);
  const cell = x => typeof x === "string" ? x : inspect(x, { depth: 0 });
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => cell(r?.[c]).length)));
  const line = cells => cells.map((c, i) => c.padEnd(Math.min(w[i], 40)).slice(0, 40)).join(" | ");
  return [line(cols), w.map(x => "-".repeat(Math.min(x, 40))).join("-+-"), ...rows.map(r => line(cols.map(c => cell(r?.[c]))))].join("\n");
}

const timers = new Map();
const console = {
  log: (...a) => emit(0, formatArgs(a)),
  info: (...a) => emit(1, formatArgs(a)),
  warn: (...a) => emit(2, "[warn] " + formatArgs(a)),
  error: (...a) => emit(3, "[error] " + formatArgs(a)),
  debug: (...a) => emit(0, formatArgs(a)),
  dir: (o, opts) => emit(0, inspect(o, { depth: 6, ...opts })),
  table: d => emit(0, table(d)),
  assert: (c, ...a) => { if (!c) emit(3, "Assertion failed: " + formatArgs(a)); },
  time: (l = "default") => { timers.set(l, sys.now()); },
  timeEnd: (l = "default") => { const t = timers.get(l); if (t !== undefined) emit(0, `${l}: ${(sys.now() - t).toFixed(2)}ms`); timers.delete(l); },
};
G.console = console;
G.inspect = inspect;
G.print = (...a) => console.log(...a);

// ===========================================================================
// vector helpers
// ===========================================================================
const v3 = (x, y, z) => ({ x, y, z });
const r2 = n => Math.round(n * 100) / 100;
function fmt(v) {
  if (v && typeof v === "object" && "x" in v) return "y" in v && "z" in v ? `${r2(v.x)}, ${r2(v.y)}, ${r2(v.z)}` : `${r2(v.x)}, ${r2(v.y)}`;
  return inspect(v);
}
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
const hex = n => "0x" + Number(n).toString(16);
G.fmt = fmt; G.dist = dist; G.hex = hex;

// ===========================================================================
// errors
// ===========================================================================
class InvalidEntityError extends Error {
  constructor(id) { super(`Entity ${id} is no longer valid (unloaded or removed)`); this.name = "InvalidEntityError"; }
}
class NotSupportedOnClientError extends Error {
  constructor(what) { super(`${what} is not available client-side (ScriptEval reads only the client's memory)`); this.name = "NotSupportedOnClientError"; }
}

// ===========================================================================
// entities
// ===========================================================================
const A = Symbol("actor"), E = Symbol("entity");
const DIMENSIONS = {
  0: "minecraft:overworld", 1: "minecraft:nether", 2: "minecraft:the_end",
};
const HEIGHT = {
  "minecraft:overworld": { min: -64, max: 319 },
  "minecraft:nether": { min: 0, max: 127 },
  "minecraft:the_end": { min: 0, max: 255 },
};
const FLAG = { onFire: 0, sneaking: 1, riding: 2, sprinting: 3, usingItem: 4, invisible: 5, baby: 11, gliding: 32, swimming: 57, sleeping: 76, crawling: 114 };
const GAMEMODES = { 0: "Survival", 1: "Creative", 2: "Adventure", 5: "Default", 6: "Spectator" };

const CLASS_TYPES = {
  LocalPlayer: "minecraft:player", RemotePlayer: "minecraft:player", Player: "minecraft:player", ServerPlayer: "minecraft:player",
  ItemActor: "minecraft:item", ExperienceOrb: "minecraft:xp_orb", PrimedTnt: "minecraft:tnt", FallingBlock: "minecraft:falling_block",
  Arrow: "minecraft:arrow", ThrownTrident: "minecraft:thrown_trident", FishingHook: "minecraft:fishing_hook",
  MinecartRideable: "minecraft:minecart", Boat: "minecraft:boat", Painting: "minecraft:painting", LightningBolt: "minecraft:lightning_bolt",
  EnderCrystal: "minecraft:ender_crystal", ArmorStand: "minecraft:armor_stand",
};
function classToTypeId(cls) {
  if (!cls) return "minecraft:unknown";
  if (CLASS_TYPES[cls]) return CLASS_TYPES[cls];
  return "minecraft:" + cls.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

const entityCache = new Map();
function wrapActor(a, e) {
  const key = a + ":" + e;
  let ent = entityCache.get(key);
  if (!ent) {
    ent = mc.isPlayer(a, e) ? new Player(a, e) : new Entity(a, e);
    entityCache.set(key, ent);
    if (entityCache.size > 20000) entityCache.clear();
  }
  return ent;
}
function allActors(kind = 0) { return mc.actors(kind).map(([a, e]) => wrapActor(a, e)); }

class EntityHealthComponent {
  constructor(entity, attr) { this.typeId = "minecraft:health"; this.entity = entity; Object.assign(this, attr); delete this.id; }
  setCurrentValue() { throw new NotSupportedOnClientError("setCurrentValue"); }
  resetToMaxValue() { throw new NotSupportedOnClientError("resetToMaxValue"); }
  get [Symbol.toStringTag]() { return "EntityHealthComponent"; }
  [INSPECT]() { return { currentValue: this.currentValue, effectiveMax: this.effectiveMax, defaultValue: this.defaultValue }; }
}
class EntityInventoryComponent {
  constructor(entity, container) {
    this.typeId = "minecraft:inventory";
    this.entity = entity;
    this.container = container;
    this.inventorySize = container.size;
  }
  [INSPECT]() { return { inventorySize: this.inventorySize, container: this.container }; }
}
class EntityAttributeComponent {
  constructor(typeId, entity, attr) { this.typeId = typeId; this.entity = entity; Object.assign(this, attr); delete this.id; }
  [INSPECT]() { return { typeId: this.typeId, currentValue: this.currentValue, effectiveMin: this.effectiveMin, effectiveMax: this.effectiveMax, defaultValue: this.defaultValue }; }
}

class ItemStack {
  constructor(info) {
    this.typeId = info.typeId ?? "minecraft:air";
    this.amount = info.amount ?? 0;
    this.data = info.aux ?? 0;
    Object.defineProperty(this, "address", { value: info.address, enumerable: false });
  }
  get type() { return { id: this.typeId }; }
  [INSPECT]() { return `ItemStack { ${this.typeId} x${this.amount}${this.data ? ` (data ${this.data})` : ""} }`; }
}
function toItem(info) { return info && info.typeId && info.amount > 0 ? new ItemStack(info) : undefined; }

class Container {
  constructor(entity, items, selected) {
    Object.defineProperty(this, "_items", { value: items, enumerable: false });
    this.size = items.length;
    this.emptySlotsCount = items.filter(i => !toItem(i)).length;
    if (selected !== undefined) Object.defineProperty(this, "_selected", { value: selected, enumerable: false });
  }
  getItem(slot) { return toItem(this._items[slot]); }
  getSlot(slot) { return this.getItem(slot); }
  items() { return this._items.map(toItem); }
  isValid() { return true; }
  setItem() { throw new NotSupportedOnClientError("Container.setItem"); }
  [INSPECT]() {
    const filled = this._items.map((it, i) => [i, toItem(it)]).filter(([, it]) => it).map(([i, it]) => `${i}: ${it.typeId} x${it.amount}`);
    return `Container(${this.size}) [${filled.join(", ")}]`;
  }
}

const EQUIP_SLOTS = ["Mainhand", "Offhand", "Head", "Chest", "Legs", "Feet"];
class EntityEquippableComponent {
  constructor(entity, eq) { this.typeId = "minecraft:equippable"; Object.defineProperty(this, "_eq", { value: eq, enumerable: false }); }
  getEquipment(slot) {
    const s = String(slot).toLowerCase();
    if (s === "mainhand") return toItem(this._eq.hand[0]);
    if (s === "offhand") return toItem(this._eq.hand[1]);
    const idx = { head: 0, chest: 1, legs: 2, feet: 3 }[s];
    return idx === undefined ? undefined : toItem(this._eq.armor[idx]);
  }
  getEquipmentSlot(slot) { return this.getEquipment(slot); }
  [INSPECT]() {
    const o = {};
    for (const s of EQUIP_SLOTS) { const it = this.getEquipment(s); if (it) o[s] = `${it.typeId} x${it.amount}`; }
    return o;
  }
}

const COMPONENT_ALIASES = {
  "minecraft:health": "health", health: "health",
  "minecraft:movement": "movement", movement: "movement",
  "minecraft:underwater_movement": "underwater_movement", underwater_movement: "underwater_movement",
  "minecraft:lava_movement": "lava_movement", lava_movement: "lava_movement",
  "minecraft:inventory": "inventory", inventory: "inventory",
  "minecraft:equippable": "equippable", equippable: "equippable",
};

class Entity {
  constructor(a, e) {
    Object.defineProperty(this, A, { value: a });
    Object.defineProperty(this, E, { value: e });
  }
  _ok() { if (!mc.valid(this[A], this[E])) throw new InvalidEntityError(this.address); }
  get isValid() { return mc.valid(this[A], this[E]); }
  get address() { return this[A]; }
  get entityId() { return this[E]; }
  get className() { return mc.cls(this[A]); }
  get id() { this._ok(); return mc.uniqueId(this[A], this[E]) ?? hex(this[A]); }
  get runtimeId() { this._ok(); return mc.runtimeId(this[A], this[E]); }
  get typeId() { this._ok(); return mc.typeId(this[A], this[E]) ?? classToTypeId(this.className); }
  get location() {
    this._ok();
    const p = mc.pos(this[A], this[E]);
    if (!p) throw new Error("position not available");
    return v3(p[0], p[1], p[2]);
  }
  get dimension() {
    this._ok();
    const d = mc.dim(this[A], this[E]);
    return world.getDimension(DIMENSIONS[d] ?? mc.dimensionName(d ?? 0));
  }
  get nameTag() { this._ok(); return mc.nameTag(this[A], this[E]) ?? ""; }
  set nameTag(_) { throw new NotSupportedOnClientError("setting nameTag"); }
  _flag(bit) { const f = mc.flags(this[A], this[E]); return f ? f.includes(bit) : false; }
  get isSneaking() { this._ok(); return this._flag(FLAG.sneaking); }
  get isSprinting() { this._ok(); return this._flag(FLAG.sprinting); }
  get isSwimming() { this._ok(); return this._flag(FLAG.swimming); }
  get isSleeping() { this._ok(); return this._flag(FLAG.sleeping); }
  get isGliding() { this._ok(); return this._flag(FLAG.gliding); }
  get isOnFire() { this._ok(); return this._flag(FLAG.onFire); }
  get isRiding() { this._ok(); return this._flag(FLAG.riding); }
  get isInvisible() { this._ok(); return this._flag(FLAG.invisible); }
  get isOnGround() { this._ok(); return mc.hasComp(this[A], this[E], "OnGroundFlagComponent"); }
  get isInWater() { this._ok(); return mc.hasComp(this[A], this[E], "WasInWaterFlagComponent"); }
  get isFalling() { this._ok(); return !this.isOnGround && this.getVelocity().y < -0.08; }
  get isClimbing() { return false; }
  get flags() { this._ok(); return mc.flags(this[A], this[E]) ?? []; }
  getRotation() {
    this._ok();
    const r = mc.rot(this[A], this[E]);
    return r ? { x: r[0], y: r[1] } : { x: 0, y: 0 };
  }
  getVelocity() {
    this._ok();
    const p = mc.pos(this[A], this[E]);
    return p ? v3(p[9], p[10], p[11]) : v3(0, 0, 0);
  }
  getHeadLocation() {
    this._ok();
    const p = mc.pos(this[A], this[E]);
    const box = mc.aabb(this[A], this[E]);
    if (!p) throw new Error("position not available");
    // players keep their eye height in the raw position
    if (this instanceof Player) return v3(p[3], p[4], p[5]);
    const h = box && Number.isFinite(box[8]) && box[8] > 0 ? box[8] : (box ? box[7] * 0.85 : 0);
    return v3(p[0], p[1] + h, p[2]);
  }
  getViewDirection() {
    const { x: pitch, y: yaw } = this.getRotation();
    const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180;
    return v3(-Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p));
  }
  getAABB() {
    this._ok();
    const b = mc.aabb(this[A], this[E]);
    return b ? { min: v3(b[0], b[1], b[2]), max: v3(b[3], b[4], b[5]), width: b[6], height: b[7] } : undefined;
  }
  getAttributes() { this._ok(); return mc.attributes(this[A], this[E]) ?? []; }
  getComponent(id) {
    this._ok();
    const key = COMPONENT_ALIASES[id] ?? COMPONENT_ALIASES["minecraft:" + id];
    const attrs = () => this.getAttributes();
    switch (key) {
      case "health": {
        const h = attrs().find(a => a.id === "minecraft:health");
        return h ? new EntityHealthComponent(this, h) : undefined;
      }
      case "movement": case "underwater_movement": case "lava_movement": {
        const h = attrs().find(a => a.id === "minecraft:" + key);
        return h ? new EntityAttributeComponent("minecraft:" + key, this, h) : undefined;
      }
      case "inventory": {
        const inv = mc.inventory(this[A], this[E]);
        if (!inv) return undefined;
        return new EntityInventoryComponent(this, new Container(this, inv.items, inv.selectedSlot));
      }
      case "equippable": {
        const eq = mc.equipment(this[A], this[E]);
        return eq ? new EntityEquippableComponent(this, eq) : undefined;
      }
    }
    return undefined;
  }
  getComponents() {
    return ["health", "movement", "inventory", "equippable"].map(c => this.getComponent(c)).filter(Boolean);
  }
  hasComponent(id) { return this.getComponent(id) !== undefined; }
  getTags() { return []; }
  hasTag() { return false; }
  getEffects() { return []; }
  getEffect() { return undefined; }
  getDynamicProperty(k) { return world.getDynamicProperty(`${this.id}/${k}`); }
  setDynamicProperty(k, v) { world.setDynamicProperty(`${this.id}/${k}`, v); }
  matches(options = {}) { return matchEntity(this, options); }
  // ---- ScriptEval extensions
  get ecsComponents() { this._ok(); return mc.comps(this[A], this[E]).map(c => c.name); }
  ecs(name) { this._ok(); return name ? mc.comp(this[A], this[E], name) : mc.comps(this[A], this[E]); }
  synchedData() { this._ok(); return mc.synched(this[A], this[E]); }
  fields(len = 0x200) { return dbg.fields(this[A], len); }
  // ---- unsupported mutators
  teleport() { throw new NotSupportedOnClientError("teleport"); }
  kill() { throw new NotSupportedOnClientError("kill"); }
  remove() { throw new NotSupportedOnClientError("remove"); }
  addTag() { throw new NotSupportedOnClientError("addTag"); }
  applyDamage() { throw new NotSupportedOnClientError("applyDamage"); }
  applyImpulse() { throw new NotSupportedOnClientError("applyImpulse"); }
  addEffect() { throw new NotSupportedOnClientError("addEffect"); }
  runCommand() { throw new NotSupportedOnClientError("runCommand"); }
  triggerEvent() { throw new NotSupportedOnClientError("triggerEvent"); }
  [INSPECT]() {
    if (!this.isValid) return `${this.constructor.name} <invalid ${hex(this[A])}>`;
    const o = {};
    const add = (k, f) => { try { const v = f(); if (v !== undefined && v !== null && v !== "") o[k] = v; } catch (e) { o[k] = `<${e.message}>`; } };
    if (this instanceof Player) add("name", () => this.name);
    add("typeId", () => this.typeId);
    add("id", () => this.id);
    add("nameTag", () => this.nameTag);
    add("location", () => this.location);
    add("dimension", () => this.dimension.id);
    add("rotation", () => this.getRotation());
    add("class", () => this.className);
    return o;
  }
  toString() { return `[${this.constructor.name} ${this.isValid ? this.typeId : "invalid"}]`; }
}

class Player extends Entity {
  get name() { this._ok(); return mc.playerName(this[A], this[E]) ?? this.nameTag; }
  get isLocalPlayer() { return mc.isLocal(this[A]); }
  get selectedSlotIndex() {
    const inv = mc.inventory(this[A], this[E]);
    return inv && inv.selectedSlot >= 0 ? inv.selectedSlot : undefined;
  }
  _entry() { const id = mc.uniqueId(this[A], this[E]); return (mc.playerList() ?? []).find(p => p.id === id); }
  get xuid() { return this._entry()?.xuid; }
  get uuid() { return this._entry()?.uuid; }
  getGameMode() {
    this._ok();
    const m = mc.gameMode(this[A], this[E]);
    return m === null || m === undefined ? undefined : (GAMEMODES[m] ?? String(m));
  }
  sendMessage(msg) { emit(1, `[sendMessage -> ${this.name}] ${typeof msg === "string" ? msg : inspect(msg)}`); }
  getSpawnPoint() { return undefined; }
  isOp() { return undefined; }
  playSound() { throw new NotSupportedOnClientError("playSound"); }
  setGameMode() { throw new NotSupportedOnClientError("setGameMode"); }
}

// ---------------------------------------------------------------------------
// query options (EntityQueryOptions subset)
// ---------------------------------------------------------------------------
let warnedTags = false;
function matchEntity(e, o) {
  if (!e.isValid) return false;
  if (o.type !== undefined) { const t = o.type.includes(":") ? o.type : "minecraft:" + o.type; if (e.typeId !== t) return false; }
  if (o.excludeTypes) { const ts = o.excludeTypes.map(t => t.includes(":") ? t : "minecraft:" + t); if (ts.includes(e.typeId)) return false; }
  if (o.name !== undefined) { const n = e instanceof Player ? e.name : e.nameTag; if (n !== o.name) return false; }
  if (o.excludeNames) { const n = e instanceof Player ? e.name : e.nameTag; if (o.excludeNames.includes(n)) return false; }
  if ((o.tags || o.excludeTags || o.families || o.excludeFamilies || o.scoreOptions) && !warnedTags) {
    warnedTags = true;
    emit(2, "[warn] tags/families/scoreOptions are not visible to the client and are ignored");
  }
  if (o.gameMode !== undefined && e instanceof Player) { if ((e.getGameMode() ?? "").toLowerCase() !== String(o.gameMode).toLowerCase()) return false; }
  if (o.excludeGameModes && e instanceof Player) { const gm = (e.getGameMode() ?? "").toLowerCase(); if (o.excludeGameModes.some(m => String(m).toLowerCase() === gm)) return false; }
  if (o.location) {
    const l = e.location;
    if (o.volume) {
      const a = o.location, v = o.volume;
      const inR = (p, s, d) => d >= 0 ? (p >= s && p <= s + d) : (p <= s && p >= s + d);
      if (!(inR(l.x, a.x, v.x) && inR(l.y, a.y, v.y) && inR(l.z, a.z, v.z))) return false;
    }
    const d = dist(l, o.location);
    if (o.maxDistance !== undefined && d > o.maxDistance) return false;
    if (o.minDistance !== undefined && d < o.minDistance) return false;
  }
  return true;
}
function query(list, o = {}) {
  let r = list.filter(e => { try { return matchEntity(e, o); } catch { return false; } });
  if (o.location && (o.closest || o.farthest)) {
    r.sort((a, b) => dist(a.location, o.location) - dist(b.location, o.location));
    if (o.farthest) r.reverse();
    r = r.slice(0, o.closest ?? o.farthest);
  }
  return r;
}

// ===========================================================================
// blocks (experimental)
// ===========================================================================
class Block {
  constructor(dim, loc, info) {
    this.dimension = dim;
    this.location = v3(Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z));
    this.typeId = info.typeId || "minecraft:unknown";
    Object.defineProperty(this, "_info", { value: info, enumerable: false });
  }
  get x() { return this.location.x; }
  get y() { return this.location.y; }
  get z() { return this.location.z; }
  get type() { return { id: this.typeId }; }
  get isAir() { return this.typeId === "minecraft:air"; }
  get isLiquid() { return /water|lava/.test(this.typeId); }
  get permutation() { const t = this.typeId; return { type: { id: t }, matches: id => id === t, getTags: () => this._info.tags }; }
  getTags() { return this._info.tags ?? []; }
  hasTag(t) { return this.getTags().includes(t); }
  isValid() { return true; }
  above(n = 1) { return this.dimension.getBlock(v3(this.x, this.y + n, this.z)); }
  below(n = 1) { return this.dimension.getBlock(v3(this.x, this.y - n, this.z)); }
  [INSPECT]() { return `Block { ${this.typeId} @ ${fmt(this.location)} }`; }
}

// ===========================================================================
// dimension / world
// ===========================================================================
class Dimension {
  constructor(id) { this.id = id; }
  get heightRange() { return HEIGHT[this.id] ?? { min: -64, max: 319 }; }
  get isLoaded() { try { return world.getLocalPlayer().dimension.id === this.id; } catch { return false; } }
  _all(kind) {
    return allActors(kind).filter(e => { try { const d = mc.dim(e[A], e[E]); return (DIMENSIONS[d] ?? mc.dimensionName(d ?? 0)) === this.id; } catch { return false; } });
  }
  getEntities(options) { return query(this._all(0), options); }
  getPlayers(options) { return query(this._all(1), options); }
  getEntitiesAtBlockLocation(loc) {
    const fx = Math.floor(loc.x), fy = Math.floor(loc.y), fz = Math.floor(loc.z);
    return this._all(0).filter(e => { const l = e.location; return Math.floor(l.x) === fx && Math.floor(l.y) === fy && Math.floor(l.z) === fz; });
  }
  getBlock(loc) {
    if (!this.isLoaded) return undefined;
    const info = mc.getBlock(loc.x, loc.y, loc.z);
    return new Block(this, loc, info);
  }
  getBlockBelow(loc, opts = {}) {
    for (let y = Math.floor(loc.y) - 1; y >= this.heightRange.min; y--) {
      const b = this.getBlock(v3(loc.x, y, loc.z));
      if (b && (opts.includeLiquidBlocks || !b.isLiquid) && (opts.includePassableBlocks || !b.isAir)) return b;
    }
    return undefined;
  }
  getTopmostBlock(loc) { return this.getBlockBelow(v3(loc.x, this.heightRange.max + 1, loc.z)); }
  runCommand() { throw new NotSupportedOnClientError("runCommand"); }
  spawnEntity() { throw new NotSupportedOnClientError("spawnEntity"); }
  setBlockType() { throw new NotSupportedOnClientError("setBlockType"); }
  [INSPECT]() { return `Dimension { ${this.id}${this.isLoaded ? "" : " (not loaded on this client)"} }`; }
}

const dims = new Map();
function normDim(id) {
  const s = String(id).toLowerCase().replace(/^minecraft:/, "");
  if (s === "overworld") return "minecraft:overworld";
  if (s === "nether" || s === "the_nether") return "minecraft:nether";
  if (s === "the_end" || s === "end") return "minecraft:the_end";
  return "minecraft:" + s;
}

// ---- event signals (emulated by diffing client state every tick)
class Signal {
  constructor(name, opts = {}) { this.name = name; this.handlers = []; this.unsupported = opts.unsupported; }
  subscribe(cb) {
    if (this.unsupported) emit(2, `[warn] ${this.name} cannot be observed client-side; the callback will never fire`);
    if (typeof cb !== "function") throw new TypeError("callback must be a function");
    this.handlers.push(cb);
    if (currentOwner) handlerOwners.set(cb, currentOwner);
    return cb;
  }
  unsubscribe(cb) { this.handlers = this.handlers.filter(h => h !== cb); }
  get active() { return this.handlers.length > 0; }
  fire(ev) {
    for (const h of [...this.handlers]) {
      try { withOwner(handlerOwners.get(h) ?? null, () => h(ev)); } catch (e) { emit(3, `[error] in ${this.name} handler: ${formatError(e)}`); }
    }
  }
  [INSPECT]() { return `Signal(${this.name}, ${this.handlers.length} subscribers)`; }
}
const unsupportedSignal = name => new Signal(name, { unsupported: true });

const afterEvents = {
  playerJoin: new Signal("playerJoin"),
  playerLeave: new Signal("playerLeave"),
  playerSpawn: new Signal("playerSpawn"),
  entitySpawn: new Signal("entitySpawn"),
  entityRemove: new Signal("entityRemove"),
  playerDimensionChange: new Signal("playerDimensionChange"),
  playerGameModeChange: new Signal("playerGameModeChange"),
  entityHealthChanged: new Signal("entityHealthChanged"),
  chatSend: unsupportedSignal("chatSend"),
  entityHurt: unsupportedSignal("entityHurt"),
  entityDie: unsupportedSignal("entityDie"),
  playerBreakBlock: unsupportedSignal("playerBreakBlock"),
  playerPlaceBlock: unsupportedSignal("playerPlaceBlock"),
  itemUse: unsupportedSignal("itemUse"),
  worldLoad: new Signal("worldLoad"),
};
const beforeEvents = new Proxy({}, { get: (_, k) => typeof k === "string" ? unsupportedSignal("beforeEvents." + k) : undefined });

// ---- scoreboard (client side: only what the server sent to this client)
const IDENTITY_TYPES = { 0: "Invalid", 1: "Player", 2: "Entity", 3: "FakePlayer" };
const SLOT_NAMES = { sidebar: "Sidebar", list: "List", belowname: "BelowName" };
class ScoreboardIdentity {
  constructor(e) {
    this.displayName = e.participant || e.entityId;
    this.id = e.scoreboardId;
    this.type = IDENTITY_TYPES[e.type] ?? "Unknown";
    Object.defineProperty(this, "_entityId", { value: e.entityId, enumerable: false });
  }
  getEntity() { return this.type === "FakePlayer" ? undefined : world.getEntity(this._entityId); }
  isValid() { return true; }
  [INSPECT]() { return `ScoreboardIdentity { ${this.type} ${JSON.stringify(this.displayName)} }`; }
}
class ScoreboardObjective {
  constructor(o) {
    this.id = o.id;
    this.displayName = o.displayName;
    Object.defineProperty(this, "_o", { value: o, enumerable: false });
  }
  get criteria() { return this._o.criteria; }
  isValid() { return true; }
  getScores() { return this._o.scores.map(e => ({ participant: new ScoreboardIdentity(e), score: e.score })); }
  getParticipants() { return this._o.scores.map(e => new ScoreboardIdentity(e)); }
  _find(p) {
    if (p instanceof Entity) { const id = p.id; return this._o.scores.find(e => e.entityId === id || (p instanceof Player && e.participant === p.name)); }
    if (p instanceof ScoreboardIdentity) return this._o.scores.find(e => e.scoreboardId === p.id);
    return this._o.scores.find(e => e.participant === String(p));
  }
  getScore(p) { return this._find(p)?.score; }
  hasParticipant(p) { return this._find(p) !== undefined; }
  setScore() { throw new NotSupportedOnClientError("setScore"); }
  addScore() { throw new NotSupportedOnClientError("addScore"); }
  removeParticipant() { throw new NotSupportedOnClientError("removeParticipant"); }
  [INSPECT]() {
    return { id: this.id, displayName: this.displayName, scores: this._o.scores.map(e => `${e.participant || e.entityId}=${e.score}`).join(", ") };
  }
}
class Scoreboard {
  _data() { return mc.scoreboard(); }
  getObjectives() { return this._data().objectives.map(o => new ScoreboardObjective(o)); }
  getObjective(id) { const o = this._data().objectives.find(x => x.id === id); return o ? new ScoreboardObjective(o) : undefined; }
  getParticipants() {
    const seen = new Map();
    for (const o of this._data().objectives) for (const e of o.scores) seen.set(e.scoreboardId, new ScoreboardIdentity(e));
    return [...seen.values()];
  }
  getObjectiveAtDisplaySlot(slot) {
    const d = this._data();
    const want = String(slot).toLowerCase();
    const disp = d.displays.find(x => x.slot.toLowerCase() === want);
    if (!disp) return undefined;
    const o = d.objectives.find(x => x.id === disp.objective);
    return { objective: o ? new ScoreboardObjective(o) : undefined, sortOrder: disp.sortOrder ? "Descending" : "Ascending" };
  }
  // ScriptEval extension: the sidebar as it is rendered (title + sorted lines)
  sidebar() {
    const s = this.getObjectiveAtDisplaySlot("sidebar");
    if (!s || !s.objective) return undefined;
    const scores = s.objective.getScores().sort((a, b) => s.sortOrder === "Descending" ? b.score - a.score : a.score - b.score);
    return { title: s.objective.displayName, lines: scores.map(x => `${x.participant.displayName}  ${x.score}`) };
  }
  addObjective() { throw new NotSupportedOnClientError("addObjective"); }
  removeObjective() { throw new NotSupportedOnClientError("removeObjective"); }
  setObjectiveAtDisplaySlot() { throw new NotSupportedOnClientError("setObjectiveAtDisplaySlot"); }
  clearObjectiveAtDisplaySlot() { throw new NotSupportedOnClientError("clearObjectiveAtDisplaySlot"); }
  [INSPECT]() {
    try {
      const d = this._data();
      return { objectives: d.objectives.map(o => o.id), displays: Object.fromEntries(d.displays.map(x => [SLOT_NAMES[x.slot] ?? x.slot, x.objective])) };
    } catch (e) { return `Scoreboard <${e.message}>`; }
  }
}
const scoreboard = new Scoreboard();

const dynamicProps = new Map();

class World {
  constructor() { this.afterEvents = afterEvents; this.beforeEvents = beforeEvents; }
  getAllPlayers() { return allActors(1); }
  getPlayers(options) { return query(allActors(1), options); }
  getDimension(id) {
    const n = normDim(id);
    if (!dims.has(n)) dims.set(n, new Dimension(n));
    return dims.get(n);
  }
  getEntity(id) { return allActors(0).find(e => { try { return e.id === String(id); } catch { return false; } }); }
  getLocalPlayer() { const [a, e] = mc.localPlayer(); return wrapActor(a, e); }
  getPlayerList() { return mc.playerList() ?? []; }
  getDefaultSpawnLocation() { return undefined; }
  getTimeOfDay() { throw new NotSupportedOnClientError("getTimeOfDay"); }
  getAbsoluteTime() { throw new NotSupportedOnClientError("getAbsoluteTime"); }
  getDay() { throw new NotSupportedOnClientError("getDay"); }
  getMoonPhase() { throw new NotSupportedOnClientError("getMoonPhase"); }
  sendMessage(msg) { emit(1, `[world.sendMessage] ${typeof msg === "string" ? msg : inspect(msg)}`); }
  getDynamicProperty(k) { return dynamicProps.get(k); }
  setDynamicProperty(k, v) { if (v === undefined) dynamicProps.delete(k); else dynamicProps.set(k, v); }
  getDynamicPropertyIds() { return [...dynamicProps.keys()]; }
  clearDynamicProperties() { dynamicProps.clear(); }
  get scoreboard() { return scoreboard; }
  get gameRules() { return {}; }
  playMusic() { throw new NotSupportedOnClientError("playMusic"); }
  [INSPECT]() { return "World { client-side view }"; }
}
const world = new World();

// ===========================================================================
// system: ticks, timers, jobs
// ===========================================================================
let tickCounter = 0;
let nextRunId = 1;
const runs = new Map();
const jobs = new Map();

class System {
  constructor() { this.afterEvents = { scriptEventReceive: unsupportedSignal("scriptEventReceive") }; this.beforeEvents = {}; }
  get currentTick() { return tickCounter; }
  get isEditorWorld() { return false; }
  get serverSystemInfo() { return undefined; }
  run(cb) { return this.runTimeout(cb, 0); }
  runTimeout(cb, ticks = 1) {
    const id = nextRunId++;
    runs.set(id, { cb, at: tickCounter + Math.max(0, ticks | 0), every: 0, owner: currentOwner });
    return id;
  }
  runInterval(cb, ticks = 1) {
    const id = nextRunId++;
    const every = Math.max(1, ticks | 0);
    runs.set(id, { cb, at: tickCounter + every, every, owner: currentOwner });
    return id;
  }
  clearRun(id) { runs.delete(id); }
  runJob(gen) { const id = nextRunId++; jobs.set(id, gen); if (currentOwner) jobOwners.set(id, currentOwner); return id; }
  clearJob(id) { jobs.delete(id); jobOwners.delete(id); }
  waitTicks(n = 1) { return new Promise(res => this.runTimeout(res, n)); }
  clearAll() { runs.clear(); jobs.clear(); jobOwners.clear(); }
  get runs() { return [...runs.keys()]; }
  [INSPECT]() { return { currentTick: tickCounter, scheduled: runs.size, jobs: jobs.size, realTicks: mc.tickInfo().installed }; }
}
const system = new System();

// ---- per tick work
let prevActors = null, prevPlayers = null, prevDim = null, prevMode = null, prevHealth = new Map(), wasInWorld = false;
function eventsActive() {
  for (const k in afterEvents) if (afterEvents[k].active) return true;
  return false;
}
let lastEnsureAttempt = -1e9;
function diffWorld() {
  let inWorld = false;
  try { inWorld = mc.ensure(false); } catch { inWorld = false; }
  if (!inWorld && sys.now() - lastEnsureAttempt > 5000) {
    // not discovered yet: allow a (rate limited) scan so events work without any other call
    lastEnsureAttempt = sys.now();
    try { inWorld = mc.ensure(true); } catch { inWorld = false; }
  }
  if (inWorld && !wasInWorld) afterEvents.worldLoad.fire({});
  wasInWorld = inWorld;
  if (!inWorld) { prevActors = null; prevPlayers = null; return; }
  if (afterEvents.entitySpawn.active || afterEvents.entityRemove.active || afterEvents.entityHealthChanged.active) {
    const cur = new Map();
    for (const e of allActors(0)) cur.set(e[A] + ":" + e[E], e);
    if (prevActors) {
      for (const [k, e] of cur) if (!prevActors.has(k)) afterEvents.entitySpawn.fire({ entity: e, cause: "Loaded" });
      for (const [k, e] of prevActors) if (!cur.has(k)) afterEvents.entityRemove.fire({ removedEntityId: e._lastId, typeId: e._lastType, entity: e });
    }
    for (const e of cur.values()) {
      try {
        if (e._lastId === undefined) { Object.defineProperty(e, "_lastId", { value: e.id, writable: true }); Object.defineProperty(e, "_lastType", { value: e.typeId, writable: true }); }
        if (afterEvents.entityHealthChanged.active) {
          const h = e.getComponent("health")?.currentValue;
          const k = e[A] + ":" + e[E];
          const old = prevHealth.get(k);
          if (h !== undefined && old !== undefined && h !== old) afterEvents.entityHealthChanged.fire({ entity: e, oldValue: old, newValue: h });
          if (h !== undefined) prevHealth.set(k, h);
        }
      } catch {}
    }
    prevActors = cur;
  }
  if (afterEvents.playerJoin.active || afterEvents.playerLeave.active || afterEvents.playerSpawn.active) {
    const list = mc.playerList() ?? [];
    const cur = new Map(list.map(p => [p.id, p]));
    if (prevPlayers) {
      for (const [id, p] of cur) if (!prevPlayers.has(id)) afterEvents.playerJoin.fire({ playerName: p.name, playerId: id });
      for (const [id, p] of prevPlayers) if (!cur.has(id)) afterEvents.playerLeave.fire({ playerName: p.name, playerId: id });
    }
    if (afterEvents.playerSpawn.active) {
      const loaded = new Set(allActors(1).map(p => p.id));
      if (diffWorld.loaded) for (const p of allActors(1)) if (!diffWorld.loaded.has(p.id)) afterEvents.playerSpawn.fire({ player: p, initialSpawn: !prevPlayers || !prevPlayers.has(p.id) });
      diffWorld.loaded = loaded;
    }
    prevPlayers = cur;
  }
  if (afterEvents.playerDimensionChange.active || afterEvents.playerGameModeChange.active) {
    const lp = world.getLocalPlayer();
    const d = lp.dimension.id, m = lp.getGameMode();
    if (prevDim && d !== prevDim) afterEvents.playerDimensionChange.fire({ player: lp, fromDimension: world.getDimension(prevDim), toDimension: lp.dimension, toLocation: lp.location });
    if (prevMode !== null && m !== prevMode) afterEvents.playerGameModeChange.fire({ player: lp, fromGameMode: prevMode, toGameMode: m });
    prevDim = d; prevMode = m;
  }
}

let runningTimer = 0;
G.__abortTick = function () {
  currentTask = null;
  if (runningTimer && runs.has(runningTimer)) {
    runs.delete(runningTimer);
    sys.print(2, `[warn] system.run* callback #${runningTimer} was interrupted (too slow / endless loop) and has been removed`);
  }
  runningTimer = 0;
};

const realTickTimes = [];
G.__tick = function (real) {
  tickCounter++;
  if (real) { const now = sys.now(); realTickTimes.push(now); while (realTickTimes.length && now - realTickTimes[0] > 2000) realTickTimes.shift(); }
  if (eventsActive()) { try { diffWorld(); } catch (e) { emit(3, "[error] event emulation: " + formatError(e)); } }
  if (panels.size) refreshPanels();
  if (runs.size) {
    for (const [id, r] of [...runs]) {
      if (r.at > tickCounter || !runs.has(id)) continue;
      if (r.every) r.at = tickCounter + r.every; else runs.delete(id);
      runningTimer = id;
      try { withOwner(r.owner ?? null, r.cb); } catch (e) { emit(3, `[error] in system.run callback #${id}: ${formatError(e)}`); if (r.every) emit(2, "[warn] the interval keeps running; use system.clearRun(" + id + ")"); }
      runningTimer = 0;
    }
  }
  if (jobs.size) {
    const deadline = sys.now() + 4;
    for (const [id, gen] of [...jobs]) {
      try {
        const owner = jobOwners.get(id) ?? null;
        while (sys.now() < deadline) { const r = withOwner(owner, () => gen.next()); if (r.done) { jobs.delete(id); jobOwners.delete(id); break; } }
      } catch (e) { jobs.delete(id); emit(3, `[error] in job #${id}: ${formatError(e)}`); }
    }
  }
};

// ===========================================================================
// panels: live overlay windows (watch list, players, custom)
// ===========================================================================
const panels = new Map();  // name -> { title, render, every, due, lastKey }
function refreshPanel(name, p) {
  let items;
  try { items = p.render(); } catch (e) { items = ["error: " + formatError(e)]; }
  if (!Array.isArray(items)) items = [typeof items === "string" ? items : inspect(items, { depth: 3 })];
  const key = JSON.stringify(items);
  if (key !== p.lastKey) { p.lastKey = key; U.panelSet(name, p.title, items); }
}
function refreshPanels() {
  if (!U.available()) return;
  for (const [name, p] of [...panels]) {
    if (tickCounter < p.due) continue;
    p.due = tickCounter + p.every();
    refreshPanel(name, p);
  }
}
function openPanel(name, title, render, every = 10) {
  const p = { title, render, every: typeof every === "function" ? every : () => Math.max(1, every | 0), due: 0, lastKey: undefined, owner: currentOwner };
  panels.set(name, p);
  if (U.available()) { p.due = tickCounter + p.every(); refreshPanel(name, p); }
  return p;
}
function closePanel(name) {
  const had = panels.delete(name);
  U.panelClose(name);
  return had;
}
G.__panelClosed = name => {
  panels.delete(name);
  if (name === "watch") watches.clear();
  U.panelAck(name);
};

// ---- watch list
const watches = new Map();
let nextWatchId = 1;
function watchValue(w) {
  let v;
  try {
    v = w.fn();
    v = typeof v === "string" ? v : inspect(v, { depth: 2, maxItems: 30 });
  } catch (e) { v = `<${e?.name ?? "Error"}: ${e?.message ?? e}>`; }
  return v.length > 1500 ? v.slice(0, 1500) + " ..." : v;
}
function watchRender() {
  if (!watches.size) return ['No watches yet. Add one from the console:\n  client.watch("world.getLocalPlayer().location")\n  client.watch(() => world.getAllPlayers().length, "players")'];
  const items = [];
  for (const [id, w] of watches) {
    if (w.value === undefined || tickCounter >= w.due) { w.value = watchValue(w); w.due = tickCounter + w.every; }
    items.push(`#${id}  ${w.label}\n    ${w.value.replace(/\n/g, "\n    ")}`);
    items.push([`Remove #${id}`, `client.unwatch(${id})`]);
  }
  if (watches.size > 1) items.push(["Remove all", "client.unwatch()"]);
  return items;
}
const watchEvery = () => { let m = 10; for (const w of watches.values()) m = Math.min(m, w.every); return m; };
function ensureWatchPanel() { if (!panels.has("watch")) openPanel("watch", "ScriptEval Watch", watchRender, watchEvery); }

// ---- players
function playerRows() {
  let here = null;
  try { here = world.getLocalPlayer().location; } catch {}
  const rows = [];
  const loadedNames = new Set();
  for (const p of world.getAllPlayers()) {
    const row = { name: "?", loaded: true };
    try { row.name = p.name; loadedNames.add(row.name); } catch {}
    try { if (p.isLocalPlayer) row.you = true; } catch {}
    try { const l = p.location; row.location = v3(r2(l.x), r2(l.y), r2(l.z)); if (here) row.distance = r2(dist(l, here)); } catch {}
    try { row.dimension = p.dimension.id.replace("minecraft:", ""); } catch {}
    try { const m = p.getGameMode(); if (m) row.gameMode = m; } catch {}
    try { const h = p.getComponent("health"); if (h) row.health = r2(h.currentValue); } catch {}
    rows.push(row);
  }
  rows.sort((a, b) => (a.you ? -1 : b.you ? 1 : (a.distance ?? 1e9) - (b.distance ?? 1e9)));
  let list = [];
  try { list = world.getPlayerList(); } catch {}
  for (const e of list) if (!loadedNames.has(e.name)) rows.push({ name: e.name, loaded: false });
  return rows;
}
function playersRender() {
  const rows = playerRows();
  const loaded = rows.filter(r => r.loaded), far = rows.filter(r => !r.loaded);
  const lines = [`${loaded.length} loaded, ${loaded.length + far.length} in the player list`];
  for (const r of loaded) {
    const parts = [r.name + (r.you ? " (you)" : "")];
    if (r.distance !== undefined && !r.you) parts.push(`${r.distance}m`);
    if (r.location) parts.push(fmt(r.location));
    if (r.dimension && r.dimension !== "overworld") parts.push(r.dimension);
    if (r.gameMode) parts.push(r.gameMode);
    if (r.health !== undefined) parts.push(`hp ${r.health}`);
    lines.push(parts.join("  |  "));
  }
  if (far.length) lines.push("not loaded: " + far.map(r => r.name).join(", "));
  return [lines.join("\n")];
}

// ===========================================================================
// task runner (called from C++ for every evaluation)
// ===========================================================================
function isModuleCode(code) { return /^\s*(import|export)\s/m.test(code); }

G.__abortTask = function () { currentTask = null; };

G.__runTask = function (id, code, source, quiet) {
  const task = { id, out: [] };
  const finish = text => {
    const lines = task.out.slice();
    if (text !== undefined && text !== "") lines.push(text);
    let s = lines.join("\n");
    if (s.length > 200000) s = s.slice(0, 200000) + "\n... (output truncated)";
    sys.taskDone(id, s);
  };
  const show = v => quiet ? "" : v === undefined ? (task.out.length ? "" : "undefined") : inspect(v, { raw: true });
  currentTask = task;
  try {
    if (isModuleCode(code)) {
      const p = sys.evalModule(code, source);
      currentTask = null;
      Promise.resolve(p).then(() => finish(""), e => finish(formatError(e)));
      return;
    }
    const useAsync = /\bawait\b/.test(code);
    const r = sys.evalScript(code, source, useAsync);
    currentTask = null;
    if (useAsync) {
      Promise.resolve(r).then(x => finish(show(x && typeof x === "object" && "value" in x ? x.value : x)), e => finish(formatError(e)));
      return;
    }
    if (r instanceof Promise) {
      r.then(x => finish(x === undefined ? "" : show(x)), e => finish(formatError(e)));
      return;
    }
    finish(show(r));
  } catch (e) {
    currentTask = null;
    finish(formatError(e));
  }
};

// completion for the REPL client (".complete <text>"): candidates for the
// identifier at the end of text; the base may be a dotted path with
// zero-argument calls (world.getLocalPlayer().na -> ...name, ...nameTag)
const KEYWORDS = ["await", "break", "case", "catch", "class", "const", "continue", "delete", "do", "else", "export", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "let", "new", "null", "return", "switch", "this", "throw",
  "true", "try", "typeof", "undefined", "var", "void", "while"];
G.__complete = function (text) {
  text = String(text);
  const m = /((?:[A-Za-z_$][\w$]*(?:\(\))?\s*\.\s*)*)([A-Za-z_$][\w$]*)?$/.exec(text);
  if (!m) return "";
  const basePath = m[1].replace(/\s*\.\s*$/, ""), partial = m[2] ?? "";
  const head = text.slice(0, text.length - partial.length);
  const names = new Set();
  if (!basePath) {
    if (m.index > 0 && text[m.index - 1] === ".") return "";
    for (const k of Object.getOwnPropertyNames(G)) if (!k.startsWith("__")) names.add(k);
    for (const k of KEYWORDS) names.add(k);
  } else {
    let v;
    try { v = (0, eval)(basePath); } catch { return ""; }
    if (v === null || v === undefined) return "";
    let o = typeof v === "object" || typeof v === "function" ? v : Object(v);
    for (let depth = 0; o && o !== Object.prototype && o !== Function.prototype && depth < 8; depth++, o = Object.getPrototypeOf(o))
      for (const k of Object.getOwnPropertyNames(o)) if (k !== "constructor" && !k.startsWith("_")) names.add(k);
  }
  return [...names].filter(k => k.startsWith(partial) && /^[A-Za-z_$][\w$]*$/.test(k)).sort().slice(0, 300).map(k => head + k).join("\n");
};

G.runScript = function (name) {
  const file = name.endsWith(".js") ? name : name + ".js";
  const code = sys.readFile("scripts/" + file);
  if (code === null || code === undefined) throw new Error(`scripts/${file} not found in ${sys.info().dataDir}`);
  // running a script again replaces the previous instance (its timers, handlers and panels are released)
  return runModule("scripts/" + file, code);
};

// ===========================================================================
// client & debug namespaces (ScriptEval extensions)
// ===========================================================================
const client = {
  status() {
    const s = mc.status();
    const t = mc.tickInfo();
    return { ...s, tickHook: t, info: sys.info() };
  },
  rescan() { mc.rescan(); return client.status(); },
  get localPlayer() { return world.getLocalPlayer(); },
  playerList() { return world.getPlayerList(); },
  offsets() { return mc.offsets(); },
  tick() { return mc.tickInfo(); },
  installTickHook() { return mc.installTickHook(); },
  entities(options) { mc.ensure(); return query(allActors(0), options); },
  countByType(options) {
    const m = {};
    for (const e of client.entities(options)) m[e.typeId] = (m[e.typeId] ?? 0) + 1;
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  },
  nearby(radius = 16) {
    const lp = world.getLocalPlayer();
    const here = lp.location;
    return query(allActors(0), { location: here, maxDistance: radius })
      .filter(e => e !== lp)
      .map(e => {
        const o = { typeId: e.typeId, distance: r2(dist(e.location, here)), location: fmt(e.location) };
        const n = e instanceof Player ? e.name : e.nameTag;
        if (n) o.name = n;
        return o;
      })
      .sort((a, b) => a.distance - b.distance);
  },
  log(n = 40) { return nd.log(n).join("\n"); },
  // ---- files under <data dir>/out (export what you found)
  save(name, value) {
    const text = typeof value === "string" ? value : JSON.stringify(value, (k, v) =>
      typeof v === "bigint" ? v.toString() : v && typeof v === "object" && typeof v[INSPECT] === "function" ? v[INSPECT]() : v, 2);
    const rel = "out/" + String(name).replace(/^\/+/, "");
    if (!sys.writeFile(rel, text ?? "undefined")) throw new Error("could not write " + rel);
    return sys.info().dataDir + "/" + rel;
  },
  load(name) {
    const t = sys.readFile("out/" + String(name).replace(/^\/+/, ""));
    if (t === null || t === undefined) throw new Error(`out/${name} not found`);
    try { return JSON.parse(t); } catch { return t; }
  },
  sidebar() { return scoreboard.sidebar(); },
  players() { return playerRows(); },
  // ---- live overlay panels
  watch(what, opts = {}) {
    if (typeof opts === "string") opts = { label: opts };
    let fn, label;
    if (typeof what === "function") {
      fn = what;
      label = opts.label ?? (what.name || Function.prototype.toString.call(what).replace(/\s+/g, " ").slice(0, 80));
    } else {
      const src = String(what);
      fn = new Function(`return (${src});`);
      label = opts.label ?? src;
    }
    const id = nextWatchId++;
    watches.set(id, { fn, label, every: Math.max(1, (opts.every ?? 5) | 0), due: 0, value: undefined, owner: currentOwner });
    ensureWatchPanel();
    if (!U.available()) emit(2, "[warn] the overlay UI is not available here; read the values with client.watches()");
    return id;
  },
  unwatch(id) {
    if (id === undefined) { const n = watches.size; watches.clear(); return n; }
    return watches.delete(Number(id)) ? 1 : 0;
  },
  watches() { return [...watches].map(([id, w]) => ({ id, label: w.label, value: watchValue(w) })); },
  watchPanel(show) {
    const open = panels.has("watch");
    if (show === undefined ? open : !show) { closePanel("watch"); return "watch panel closed"; }
    ensureWatchPanel();
    return "watch panel open";
  },
  playersPanel(show) {
    const open = panels.has("players");
    if (show === undefined ? open : !show) { closePanel("players"); return "players panel closed"; }
    if (!open) openPanel("players", "ScriptEval Players", playersRender, 10);
    return "players panel open";
  },
  panel(name, render, opts = {}) {
    if (typeof render !== "function") throw new TypeError("render must be a function returning text, or an array of text / [label, code] buttons");
    openPanel(String(name), opts.title ?? String(name), render, opts.every ?? 10);
    return name;
  },
  closePanel(name) { return closePanel(String(name)); },
  panels() { return [...panels.keys()]; },
  reset() {
    for (const name of [...modules.keys()]) stopModule(name);
    for (const owner of [...disposers.keys()]) runDisposers(owner);
    system.clearAll();
    let n = 0;
    for (const k in afterEvents) { n += afterEvents[k].handlers.length; afterEvents[k].handlers = []; }
    const np = panels.size;
    for (const name of [...panels.keys()]) closePanel(name);
    watches.clear();
    U.formCloseAll();
    return `cleared timers, jobs, ${n} event handler(s) and ${np} panel(s)`;
  },
};

const dbg = {
  ...nd,
  hexdump: (a, n = 128) => nd.hexdump(a, n),
  rtti: name => nd.rttiInfo(name),
  search: (s, n = 40) => nd.rttiSearch(s, n).map(t => t.name),
  classify: a => nd.classify(a),
  fields(a, len = 0x100) {
    const rows = nd.fields(a, len);
    return rows.map(r => `+${r.offset.toString(16).padStart(4, "0")}  ${r.value.padEnd(18)} ${r.kind.padEnd(13)} ${r.info}`).join("\n");
  },
  find: (cls, derived = true, limit = 10000) => nd.findInstances(cls, derived, limit),
  ecs: (filter) => nd.ecs(filter),
  components(entity) { return mc.comps(entity.address ?? entity, entity.entityId ?? 0); },
  storage: name => nd.ecs(name).find(s => s.name === name),
  vfuncs: (x, n) => nd.vfuncs(x).slice(0, n ?? 1000).map(hex),
  // ---- value scanner (Cheat Engine style): scan, change something in game, refine
  findF32(v, max = 1000) { const dv = new DataView(new ArrayBuffer(4)); dv.setFloat32(0, v, true); return nd.findU32(dv.getUint32(0, true), max); },
  findI32(v, max = 1000) { return nd.findU32(Number(v) >>> 0, max); },
  findF64(v, max = 1000) { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, v, true); return nd.findValue(dv.getBigUint64(0, true), max); },
  findU64: (v, max = 1000) => nd.findValue(typeof v === "bigint" ? v : BigInt(v), max),
  findBytes(pattern, max = 1000) {
    let u8;
    if (typeof pattern === "string") {
      const h = pattern.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
      if (!h.length || h.length % 2) throw new TypeError("hex string with an even number of digits expected, e.g. 'de ad be ef'");
      u8 = new Uint8Array(h.length / 2);
      for (let i = 0; i < u8.length; i++) u8[i] = parseInt(h.substr(i * 2, 2), 16);
    } else if (pattern instanceof ArrayBuffer) u8 = new Uint8Array(pattern);
    else if (ArrayBuffer.isView(pattern)) u8 = new Uint8Array(pattern.buffer, pattern.byteOffset, pattern.byteLength);
    else u8 = Uint8Array.from(pattern);
    return nd.findBytes(u8, max);
  },
  refine(addrs, type, test) {
    const rd = { u8: nd.u8, i8: nd.i8, u16: nd.u16, i16: nd.i16, u32: nd.u32, i32: nd.i32, f32: nd.f32, f64: nd.f64, u64: nd.u64, i64: nd.i64, ptr: nd.ptr }[type];
    if (!rd) throw new TypeError("type must be u8, i8, u16, i16, u32, i32, f32, f64, u64, i64 or ptr");
    let pred = test;
    if (typeof test !== "function") {
      const want = test;
      pred = type === "f32" || type === "f64" ? x => Math.abs(x - want) <= Math.max(1e-4, Math.abs(want) * 1e-5) : x => x == want;
    }
    return addrs.filter(a => { const v = rd(a); return v !== null && pred(v); });
  },
  whereIs(addr, back) {
    const r = nd.whereIs(addr instanceof Entity ? addr.address : addr, back);
    if (r.ecs) {
      try { const e = allActors(0).find(x => x[E] === r.ecs.entity); if (e) r.ecs.actor = e; } catch {}
    }
    return r;
  },
  snapshot(addr, len = 0x200) {
    const a = addr instanceof Entity ? addr.address : addr;
    const buf = nd.read(a, len);
    if (!buf) throw new Error(`cannot read ${len} bytes at ${hex(a)}`);
    const snap = { address: a, length: len, bytes: new Uint8Array(buf), time: sys.now() };
    Object.defineProperty(snap, INSPECT, { value: () => `Snapshot { ${hex(a)} +${len} bytes }`, enumerable: false });
    return snap;
  },
  diff(before, after, opts = {}) {
    if (!before || !before.bytes) throw new TypeError("dbg.diff(snapshot[, snapshot]) - take one with dbg.snapshot(address, length)");
    if (after && !after.bytes) { opts = after; after = undefined; }
    after = after ?? dbg.snapshot(before.address, before.length);
    const n = Math.min(before.bytes.length, after.bytes.length) & ~3;
    const da = new DataView(before.bytes.buffer, before.bytes.byteOffset, n), db = new DataView(after.bytes.buffer, after.bytes.byteOffset, n);
    const okF = x => Number.isFinite(x) && (x === 0 || (Math.abs(x) > 1e-5 && Math.abs(x) < 1e8));
    const rows = [];
    for (let off = 0; off < n; off += 4) {
      const a = da.getUint32(off, true), b = db.getUint32(off, true);
      if (a === b) continue;
      const fa = da.getFloat32(off, true), fb = db.getFloat32(off, true);
      rows.push({ offset: off, old: a, new: b, i32: [a | 0, b | 0], f32: okF(fa) && okF(fb) ? [fa, fb] : undefined });
    }
    if (opts.raw) return rows;
    if (!rows.length) return "(no changes)";
    const f = x => Math.abs(x) >= 1e5 ? x.toExponential(3) : String(Math.round(x * 1000) / 1000);
    return rows.map(r => `+${r.offset.toString(16).padStart(4, "0")}  ${hex(r.old).padEnd(11)} -> ${hex(r.new).padEnd(11)} i32 ${r.i32[0]} -> ${r.i32[1]}` +
      (r.f32 ? `   f32 ${f(r.f32[0])} -> ${f(r.f32[1])}` : "")).join("\n");
  },
  regions: f => nd.regions(f).map(r => `${hex(r.start)}-${hex(r.end)} ${r.perms} ${r.path}`).join("\n"),
};

// ===========================================================================
// input (ScriptEval extension): drive the client like a real player.
// すべての入力・UI 操作を網羅する verb 群。中身は __native.input.inject(core)。
// 連続状態(移動/視点)は毎tick反映、単発/UI はキュー消化。offsets が入れば移動/視点が実際に効く
// (mcpelauncher=Mac も 素APK=Android も同じ libminecraftpe なので同一)。
// ===========================================================================
const input = {
  raw(op) { return JSON.parse(__native.input.inject(typeof op === "string" ? op : JSON.stringify(op ?? {}))); },
  status() { return JSON.parse(__native.input.status()); },
  // 移動(保持)
  move(f = 0, s = 0) { return input.raw({ f, s }); },
  forward(on = true) { return input.raw({ f: on ? 1 : 0 }); },
  back(on = true) { return input.raw({ f: on ? -1 : 0 }); },
  strafe(x = 0) { return input.raw({ s: x }); },
  vertical(v = 0) { return input.raw({ v }); },
  sprint(on = true) { return input.raw({ sprint: !!on }); },
  sneak(on = true) { return input.raw({ sneak: !!on }); },
  jump(on = true) { return input.raw({ jump: !!on }); },
  jumpOnce() { return input.raw({ action: "jumpOnce" }); },
  stop() { return input.raw({ action: "stop" }); },
  reset() { return input.raw({ action: "reset" }); },
  // 視点
  turn(yaw = 0, pitch = 0) { return input.raw({ yaw, pitch }); },
  look(absYaw, absPitch) { return input.raw({ absYaw, absPitch }); },
  // 手
  attack() { return input.raw({ action: "attack" }); },
  use() { return input.raw({ action: "use" }); },
  mine(on = true) { return input.raw({ mine: !!on }); },
  useHold(on = true) { return input.raw({ useHold: !!on }); },
  pick() { return input.raw({ action: "pickBlock" }); },
  // アイテム / ホットバー
  slot(n) { return input.raw({ slot: n }); },
  slotNext() { return input.raw({ action: "slotNext" }); },
  slotPrev() { return input.raw({ action: "slotPrev" }); },
  drop(stack = false) { return input.raw({ action: stack ? "dropStack" : "drop" }); },
  swapHands() { return input.raw({ action: "swapHands" }); },
  // 画面 / ナビ / クライアント
  inventory() { return input.raw({ action: "inventory" }); },
  pause() { return input.raw({ action: "pause" }); },
  perspective() { return input.raw({ action: "perspective" }); },
  nav(dir) { return input.raw({ action: "nav" + String(dir).charAt(0).toUpperCase() + String(dir).slice(1) }); },
  press(name) { return input.raw({ press: name }); },
  hold(name, on = true) { return input.raw({ hold: { [name]: !!on } }); },
  // ポインタ / コンテナ / フォーム / 文字
  pointer(op, x, y, button = 0) { return input.raw({ pointer: { op, x, y, button } }); },
  tap(x, y) { return input.raw({ pointer: { op: "tap", x, y, button: 0 } }); },
  slotClick(index, mode = "left") { return input.raw({ slotClick: { index, mode } }); },
  form(op, arg) { return input.raw({ form: { op, arg } }); },
  formButton(n) { return input.raw({ formButton: n }); },
  chat(text) { return input.raw({ chat: text }); },
  command(text) { return input.raw({ command: text }); },
  type(text) { return input.raw({ type: text }); },
  emote(e) { return input.raw({ emote: e }); },
};

// ===========================================================================
// http (ScriptEval extension): 送信 HTTP(S)。__native.sys.http 経由(ワーカースレッドでブロッキング)。
// デスクトップ mcpelauncher は libcurl で http+https、無い環境は生ソケットで http のみ。
// ===========================================================================
const http = {
  request(opts) {
    const o = typeof opts === "string" ? { url: opts } : (opts || {});
    const r = __native.sys.http(JSON.stringify({
      method: o.method || (o.body != null ? "POST" : "GET"),
      url: o.url, headers: o.headers || {},
      body: typeof o.body === "string" ? o.body : (o.body != null ? JSON.stringify(o.body) : ""),
      timeoutMs: o.timeoutMs ?? 15000, followRedirects: o.followRedirects ?? true,
    }));
    r.json = () => JSON.parse(r.body);
    r.text = () => r.body;
    r.ensureOk = () => { if (!r.ok) throw new Error("http: " + (r.error || "failed")); if (r.status >= 400) throw new Error("http " + r.status); return r; };
    return r;
  },
  get(url, opts = {}) { return http.request({ ...opts, url, method: "GET" }); },
  post(url, body, opts = {}) { return http.request({ ...opts, url, body, method: "POST" }); },
};

G.world = world;
G.system = system;
G.client = client;
G.dbg = dbg;
G.input = input;
G.agent = input;  // 実プレイヤー操作のショートカット
G.http = http;
G.ScriptEval = Object.assign(G.ScriptEval || {}, {
  injectInput: input.raw, input, http,
  // mod 自体の更新: 新しい .so をダウンロードして今の mod ファイルに原子的に差し替える。
  // ネイティブコードはワールド内で差し替えできないため「次回 mcpelauncher 起動で反映」。
  update(url, opts = {}) {
    const r = sys.selfUpdate(JSON.stringify(opts.dest ? { url: String(url), dest: String(opts.dest) } : { url: String(url) }));
    if (!r.ok) throw new Error("update: " + r.error);
    return `更新を書き込みました（${r.bytes} bytes → ${r.path}）。次回 mcpelauncher 起動で反映されます。`;
  },
  // Web からリソースパックを強制導入(グロリソ)。
  installPack(url, opts) { return client.packs.installUrl(url, opts); },
  // スクリプト/モジュール層をライブで止めて読み直す(ワールドから抜けず・再起動なし)。
  reloadScripts() { client.reset(); return "スクリプト/モジュールを停止しました（runScript で読み直せます）"; },
});
G.Entity = Entity; G.Player = Player; G.Dimension = Dimension; G.World = World; G.System = System;
G.ItemStack = ItemStack; G.Block = Block; G.Container = Container;
G.InvalidEntityError = InvalidEntityError; G.NotSupportedOnClientError = NotSupportedOnClientError;

// ===========================================================================
// ES modules
// ===========================================================================
const GameMode = { Survival: "Survival", Creative: "Creative", Adventure: "Adventure", Spectator: "Spectator", survival: "Survival", creative: "Creative", adventure: "Adventure", spectator: "Spectator" };
const EquipmentSlot = { Mainhand: "Mainhand", Offhand: "Offhand", Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet" };
const EntityComponentTypes = { Health: "minecraft:health", Inventory: "minecraft:inventory", Equippable: "minecraft:equippable", Movement: "minecraft:movement" };
const MinecraftDimensionTypes = { overworld: "minecraft:overworld", nether: "minecraft:nether", theEnd: "minecraft:the_end" };

// ---------------------------------------------------------------------------
// @minecraft/server-ui: forms are shown locally in a launcher overlay window
// (nothing is sent to the server). show() resolves when a button is clicked
// or the window is closed.
// ---------------------------------------------------------------------------
const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
const FormRejectReason = { MalformedResponse: "MalformedResponse", PlayerQuit: "PlayerQuit", ServerShutdown: "ServerShutdown" };
class FormRejectError extends Error {
  constructor(reason) { super(`form rejected: ${reason}`); this.name = "FormRejectError"; this.reason = reason; }
}
class FormResponse {
  constructor(sel) { this.canceled = sel < 0; this.cancelationReason = sel < 0 ? FormCancelationReason.UserClosed : undefined; }
}
class ActionFormResponse extends FormResponse {
  constructor(sel) { super(sel); this.selection = sel < 0 ? undefined : sel; }
}
class MessageFormResponse extends ActionFormResponse {}
class ModalFormResponse extends FormResponse {
  constructor(sel, values) { super(sel); this.formValues = sel < 0 ? undefined : values; }
}

function rawText(t) {
  if (t === undefined || t === null) return "";
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map(rawText).join("");
  if (typeof t === "object") {
    if (Array.isArray(t.rawtext)) return t.rawtext.map(rawText).join("");
    if (t.text !== undefined) return String(t.text);
    if (t.translate !== undefined) {
      const w = t.with === undefined ? [] : Array.isArray(t.with) ? t.with : (t.with.rawtext ?? []).map(rawText);
      return w.length ? `${t.translate} (${w.join(", ")})` : String(t.translate);
    }
    if (t.score) return `${t.score.name}:${t.score.objective}`;
  }
  return String(t);
}

const pendingForms = new Map();
let nextFormId = 1;
function showForm(title, controls, build) {
  if (!U.available()) return Promise.reject(new NotSupportedOnClientError("forms (the launcher overlay window API is not available)"));
  const id = nextFormId++;
  return new Promise((resolve, reject) => {
    pendingForms.set(id, { resolve, build });
    if (!U.formShow(id, { title, controls })) { pendingForms.delete(id); reject(new Error("could not show the form")); }
  });
}
G.__formDone = (id, selection, values) => {
  const p = pendingForms.get(id);
  if (!p) return;
  pendingForms.delete(id);
  try { p.resolve(p.build(selection, values)); } catch (e) { emit(3, "[error] form result: " + formatError(e)); }
};
const DIVIDER = "------------------------------";

class ActionFormData {
  constructor() { this._title = ""; this._body = ""; this._items = []; }
  title(t) { this._title = rawText(t); return this; }
  body(t) { this._body = rawText(t); return this; }
  button(t, iconPath) { this._items.push({ kind: "button", label: rawText(t) }); return this; }
  header(t) { this._items.push({ kind: "text", label: rawText(t), size: 1 }); return this; }
  label(t) { this._items.push({ kind: "text", label: rawText(t) }); return this; }
  divider() { this._items.push({ kind: "text", label: DIVIDER }); return this; }
  show(player) {
    const controls = this._body ? [{ kind: "text", label: this._body }] : [];
    let n = 0;
    for (const it of this._items) controls.push(it.kind === "button" ? { ...it, result: n++ } : it);
    return showForm(this._title, controls, sel => new ActionFormResponse(sel));
  }
}

class MessageFormData {
  constructor() { this._title = ""; this._body = ""; this._b1 = "OK"; this._b2 = "Cancel"; }
  title(t) { this._title = rawText(t); return this; }
  body(t) { this._body = rawText(t); return this; }
  button1(t) { this._b1 = rawText(t); return this; }
  button2(t) { this._b2 = rawText(t); return this; }
  show(player) {
    const controls = [];
    if (this._body) controls.push({ kind: "text", label: this._body });
    controls.push({ kind: "button", label: this._b1, result: 0 }, { kind: "button", label: this._b2, result: 1 });
    return showForm(this._title, controls, sel => new MessageFormResponse(sel));
  }
}

class ModalFormData {
  constructor() { this._title = ""; this._items = []; this._submit = "Submit"; }
  title(t) { this._title = rawText(t); return this; }
  submitButton(t) { this._submit = rawText(t); return this; }
  header(t) { this._items.push({ kind: "text", label: rawText(t), size: 1 }); return this; }
  label(t) { this._items.push({ kind: "text", label: rawText(t) }); return this; }
  divider() { this._items.push({ kind: "text", label: DIVIDER }); return this; }
  textField(label, placeholder, opts) {
    const def = typeof opts === "object" && opts !== null ? opts.defaultValue : opts;
    this._items.push({ kind: "input", label: rawText(label), value: def === undefined ? "" : rawText(def), value_: true });
    return this;
  }
  slider(label, min, max, opts, legacyDefault) {
    let step = 1, def = min;
    if (typeof opts === "object" && opts !== null) { step = opts.valueStep ?? 1; def = opts.defaultValue ?? min; }
    else { if (opts !== undefined) step = opts; if (legacyDefault !== undefined) def = legacyDefault; }
    this._items.push({ kind: "slider", label: rawText(label), min, max, step, value: def, value_: true });
    return this;
  }
  toggle(label, opts) {
    const def = typeof opts === "object" && opts !== null ? opts.defaultValue : opts;
    this._items.push({ kind: "toggle", label: rawText(label), value: !!def, value_: true });
    return this;
  }
  dropdown(label, options, opts) {
    const def = typeof opts === "object" && opts !== null ? opts.defaultValueIndex : opts;
    this._items.push({ kind: "dropdown", label: rawText(label), options: (options ?? []).map(rawText), value: def ?? 0, value_: true });
    return this;
  }
  show(player) {
    const items = this._items;
    const controls = [...items, { kind: "button", label: this._submit, result: 0 }];
    return showForm(this._title, controls, (sel, values) => {
      if (sel < 0) return new ModalFormResponse(sel);
      // one entry per control in order; text-only controls (label/header/divider) give undefined
      let k = 0;
      return new ModalFormResponse(sel, items.map(it => it.value_ ? values[k++] : undefined));
    });
  }
}

const uiManager = {
  closeAllForms(player) { U.formCloseAll(); },
};
// also available without an import in the console
Object.assign(G, { ActionFormData, MessageFormData, ModalFormData, uiManager });

// ===========================================================================
// modules: named scopes for scripts (hot reload) - used by runScript and Studio
// ===========================================================================
const modules = new Map();  // name -> { name, started, error }
function runDisposers(owner) {
  const list = disposers.get(owner) ?? [];
  disposers.delete(owner);
  let n = 0;
  for (const fn of list.reverse()) {
    try { fn(); n++; } catch (e) { emit(3, `[error] in dispose of ${owner}: ${formatError(e)}`); }
  }
  return n;
}
function ownedResources(owner) {
  const r = { timers: 0, jobs: 0, handlers: 0, panels: 0, watches: 0, disposers: (disposers.get(owner) ?? []).length };
  for (const x of runs.values()) if (x.owner === owner) r.timers++;
  for (const o of jobOwners.values()) if (o === owner) r.jobs++;
  for (const sig of allSignals()) for (const h of sig.handlers) if (handlerOwners.get(h) === owner) r.handlers++;
  for (const p of panels.values()) if (p.owner === owner) r.panels++;
  for (const w of watches.values()) if (w.owner === owner) r.watches++;
  return r;
}
function allSignals() {
  const out = Object.values(afterEvents);
  if (system.afterEvents?.scriptEventReceive) out.push(system.afterEvents.scriptEventReceive);
  return out.filter(x => x instanceof Signal);
}
function releaseOwner(owner) {
  const released = ownedResources(owner);
  runDisposers(owner);
  for (const [id, x] of [...runs]) if (x.owner === owner) runs.delete(id);
  for (const [id, o] of [...jobOwners]) if (o === owner) { jobs.delete(id); jobOwners.delete(id); }
  for (const sig of allSignals()) sig.handlers = sig.handlers.filter(h => handlerOwners.get(h) !== owner);
  for (const [name, p] of [...panels]) if (p.owner === owner) closePanel(name);
  for (const [id, w] of [...watches]) if (w.owner === owner) watches.delete(id);
  return released;
}
function stopModule(name) {
  const had = modules.delete(name);
  const released = releaseOwner(name);
  return { stopped: had, released };
}
function runModule(name, code) {
  name = String(name);
  if (modules.has(name) || disposers.has(name)) releaseOwner(name);
  const m = { name, started: Date.now(), error: undefined };
  modules.set(name, m);
  let p;
  try {
    p = withOwner(name, () => sys.evalModule(code, name));
  } catch (e) {
    m.error = formatError(e);
    throw e;
  }
  return Promise.resolve(p).then(() => undefined, e => { m.error = formatError(e); throw e; });
}

// Evaluates code with its synchronous console output captured (Studio / MCP).
async function evalCaptured(code, source = "<studio>") {
  const cap = { out: [] };
  const saved = currentTask;
  currentTask = cap;
  let value, error;
  try {
    if (isModuleCode(code)) {
      const p = sys.evalModule(code, source);
      currentTask = saved;
      await p;
    } else {
      const useAsync = /\bawait\b/.test(code);
      const r = sys.evalScript(code, source, useAsync);
      currentTask = saved;
      if (useAsync) { const x = await r; value = x && typeof x === "object" && "value" in x ? x.value : x; }
      else value = r instanceof Promise ? await r : r;
    }
  } catch (e) {
    error = e;
  } finally {
    if (currentTask === cap) currentTask = saved;
  }
  return { logs: cap.out, value, error };
}

// ===========================================================================
// doctor: one line that survives photos and copy/paste, plus hints
// ===========================================================================
const tickHz = () => realTickTimes.length >= 2 ? Math.round((realTickTimes.length - 1) * 1000 / (realTickTimes.at(-1) - realTickTimes[0]) * 10) / 10 : 0;
function doctor() {
  const info = sys.info(), ses = sys.session(), st = mc.status(), t = mc.tickInfo();
  const checks = [];
  const add = (name, state, value, hint) => checks.push({ name, state, value: String(value), hint: hint ?? "" });
  let regions = 0;
  try { regions = nd.regions().length; } catch {}
  add("mem", regions > 0 ? "ok" : "FAIL", `${st.memoryBackend}:${regions}`,
    regions > 0 ? "" : "メモリ領域を列挙できていません。Mac なら 0.1.1 以降が必要です");
  let modState = "WAIT", modValue = "-", modHint = "RTTI 索引の作成待ちです（起動から数秒）";
  try {
    const m = dbg.module();
    const kb = k => Number((new RegExp(k + "=(\\d+)KB").exec(m.summary) ?? [])[1] ?? 0);
    const kind = /\((sections|segments)\)/.exec(m.summary)?.[1] ?? "?";
    modState = kb("text") > 0 && kb("relro") > 0 ? "ok" : "FAIL";
    modValue = kind;
    modHint = modState === "ok" ? "" : `libminecraftpe.so の範囲が空です: ${m.summary}`;
  } catch (e) { if (st.rttiReady === false && st.error) { modState = "FAIL"; modHint = st.error; } }
  add("mod", modState, modValue, modHint);
  const classes = Number(/^(\d+) classes/.exec(st.rtti ?? "")?.[1] ?? 0);
  add("rtti", classes > 0 ? "ok" : st.rttiReady === false && st.error ? "FAIL" : "WAIT", classes,
    classes > 0 ? "" : st.error || "RTTI 索引の作成待ちです");
  add("world", st.inWorld ? "ok" : "WAIT", st.inWorld ? st.componentPools : "-",
    st.inWorld ? "" : "ワールドに入ると検出します（client.rescan() で再探索）");
  const hz = tickHz();
  const tickFailed = !t.installed && t.attempted && !t.busy;
  const tickState = t.installed ? (t.ticking ? "ok" : "WAIT") : ses.safeMode ? "OFF" : tickFailed ? "FAIL" : "WAIT";
  const why = (/mmap|mprotect|no ~20Hz|non-code|not readable|malformed/.exec(t.report ?? "")?.[0] ?? "notInstalled").replace(/[^\w]+/g, "-");
  add("tick", tickState, t.installed ? `${hz}Hz` : ses.safeMode ? "safe" : t.busy ? "sampling" : tickFailed ? why : "-",
    tickState === "FAIL" ? `tick フックを入れられませんでした: ${t.report || "client.log() の tick hook の行を見てください"}` :
    tickState === "OFF" ? "セーフモード中です。client.leaveSafeMode() で有効にできます" :
    t.installed && !t.ticking ? "フックは入っていますが tick が来ていません（メニュー画面・一時停止中など）" : "");
  add("studio", ses.studioPort > 0 ? "ok" : "OFF", ses.studioPort > 0 ? ses.studioClients : "-",
    ses.studioPort > 0 ? "" : "Studio が起動していません（ポート使用中か studioPort: 0）");
  let ps = null;
  try { ps = sys.packs("summary"); } catch {}
  if (ps) {
    const st2 = !ps.found ? "OFF" : !ps.fileOk || ps.missing ? "FAIL" : "ok";
    add("packs", st2, ps.found ? `${ps.forced}/${ps.active}` : "-",
      !ps.found ? `com.mojang フォルダが見つかりません（${ps.dir}）。config.json の comMojangDir で場所を指定できます` :
      !ps.fileOk ? "global_resource_packs.json が JSON として読めません（ScriptEval は書き換えません）" :
      ps.missing ? `強制にしたパックのうち ${ps.missing} 個が resource_packs にありません。Studio の「リソースパック」で入れ直すか強制を外してください` :
      ps.restartNeeded ? "グローバルリソースパックの変更は、ゲームを再起動すると反映されます" : "");
  }
  add("safe", ses.safeMode ? "ON" : "off", ses.safeMode ? "on" : "off", ses.safeModeReason);
  const line = `SE-DOC ${info.version} ${info.host}-${info.arch} ${info.gameVersion || "?"} ` +
    checks.map(c => `${c.name}=${c.state === "ok" || c.name === "safe" ? (c.name === "safe" ? c.value : "ok:" + c.value) : c.state + ":" + c.value}`).join(" ");
  return { line, ok: checks.every(c => c.state === "ok" || c.name === "safe" || c.state === "WAIT"), checks };
}

// ===========================================================================
// Studio (browser IDE) RPC and MCP - called from the C++ server via js::call
// ===========================================================================
const SCRIPT_NAME = /^(?:[\w.-]+\/)*[\w.-]+\.(?:js|ts|mjs|json|txt|md)$/;
function checkScriptName(name) {
  name = String(name ?? "");
  if (!SCRIPT_NAME.test(name) || name.includes("..")) throw new Error(`invalid script name: ${name}`);
  return name;
}
function listScripts(dir = "") {
  const out = [];
  for (const n of sys.listDir("scripts" + (dir ? "/" + dir : ""))) {
    const rel = dir ? dir + "/" + n : n;
    if (/\.(js|ts|mjs|json|txt|md)$/.test(n)) {
      const c = sys.readFile("scripts/" + rel);
      out.push({ name: rel, size: c ? c.length : 0, running: modules.has("scripts/" + rel) });
    } else if (!n.includes(".") && dir.split("/").length < 3) {
      out.push(...listScripts(rel));
    }
  }
  return out;
}
function moduleList() {
  return [...modules.values()].map(m => ({ name: m.name, started: m.started, error: m.error, ...ownedResources(m.name) }));
}
const KIND_OF = v => typeof v === "function" ? (/^class\b/.test(Function.prototype.toString.call(v)) ? "class" : "function") : v === null ? "null" : typeof v;
function completeRich(text) {
  text = String(text);
  const m = /((?:[A-Za-z_$][\w$]*(?:\(\))?\s*\.\s*)*)([A-Za-z_$][\w$]*)?$/.exec(text);
  if (!m) return { from: text.length, options: [] };
  const basePath = m[1].replace(/\s*\.\s*$/, ""), partial = m[2] ?? "";
  const from = text.length - partial.length;
  const opts = new Map();
  if (!basePath) {
    if (m.index > 0 && text[m.index - 1] === ".") return { from, options: [] };
    for (const k of Object.getOwnPropertyNames(G)) if (!k.startsWith("__")) { let v; try { v = G[k]; } catch {} opts.set(k, KIND_OF(v)); }
    for (const k of KEYWORDS) if (!opts.has(k)) opts.set(k, "keyword");
  } else {
    let v;
    try { v = (0, eval)(basePath); } catch { return { from, options: [] }; }
    if (v === null || v === undefined) return { from, options: [] };
    let o = typeof v === "object" || typeof v === "function" ? v : Object(v);
    for (let depth = 0; o && o !== Object.prototype && o !== Function.prototype && depth < 8; depth++, o = Object.getPrototypeOf(o))
      for (const k of Object.getOwnPropertyNames(o)) {
        if (k === "constructor" || k.startsWith("_") || opts.has(k)) continue;
        const d = Object.getOwnPropertyDescriptor(o, k);
        opts.set(k, d && d.get ? "property" : d && typeof d.value === "function" ? "method" : "property");
      }
  }
  const options = [...opts].filter(([k]) => k.startsWith(partial) && isIdent(k)).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 400)
    .map(([label, type]) => ({ label, type }));
  return { from, options };
}

// ---- API search (MCP api_search and the Studio help box)
function apiIndex() {
  const roots = [
    ["world", world], ["system", system], ["client", client], ["client.packs", packs], ["dbg", dbg], ["world.afterEvents", afterEvents],
    ["world.scoreboard", scoreboard], ["Entity#", Entity.prototype], ["Player#", Player.prototype],
    ["Dimension#", Dimension.prototype], ["Block#", Block.prototype], ["ItemStack#", ItemStack.prototype],
    ["Container#", Container.prototype], ["ScoreboardObjective#", ScoreboardObjective.prototype],
    ["ActionFormData#", ActionFormData.prototype], ["ModalFormData#", ModalFormData.prototype], ["MessageFormData#", MessageFormData.prototype],
  ];
  const out = [];
  for (const [prefix, obj] of roots) {
    const seen = new Set();
    for (let o = obj, d = 0; o && o !== Object.prototype && d < 3; o = Object.getPrototypeOf(o), d++) {
      for (const k of Object.getOwnPropertyNames(o)) {
        if (k === "constructor" || k.startsWith("_") || seen.has(k)) continue;
        seen.add(k);
        const desc = Object.getOwnPropertyDescriptor(o, k);
        const kind = desc.get ? "property" : typeof desc.value === "function" ? "method" : "value";
        const sep = prefix.endsWith("#") ? "" : ".";
        out.push({ name: prefix + sep + k + (kind === "method" ? "()" : ""), kind });
      }
    }
  }
  for (const [mod, f] of Object.entries(MODULES)) {
    for (const k of Object.keys(f())) out.push({ name: `import { ${k} } from "${mod}"`, kind: "export" });
  }
  return out;
}
function apiSearch(query, limit = 40) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const all = apiIndex();
  const hits = words.length ? all.filter(e => words.every(w => e.name.toLowerCase().includes(w))) : all;
  return { total: hits.length, results: hits.slice(0, limit) };
}

function studioStatus() {
  const st = mc.status(), t = mc.tickInfo(), ses = sys.session();
  const o = {
    time: Date.now(), inWorld: st.inWorld, error: st.error, rtti: st.rtti, actors: st.actors, pools: st.componentPools,
    tick: { installed: t.installed, ticking: t.ticking, hz: tickHz(), real: t.installed && t.ticking }, currentTick: tickCounter,
    safeMode: ses.safeMode, studioClients: ses.studioClients, mcpCalls: ses.mcpCalls, modules: modules.size, mcpPaused: mcpState.paused,
  };
  if (st.inWorld) {
    try {
      const lp = world.getLocalPlayer();
      o.player = { name: lp.name, location: lp.location, dimension: lp.dimension.id, gameMode: lp.getGameMode?.() };
      o.players = { loaded: world.getAllPlayers().length };
      try { o.players.list = world.getPlayerList().length; } catch {}
    } catch (e) { o.playerError = e?.message ?? String(e); }
  }
  return o;
}
G.__studioStatus = () => JSON.stringify(studioStatus(), jsonSafe);

function jsonSafe(k, v) {
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v === "object" && typeof v[INSPECT] === "function" && !Array.isArray(v)) { try { return v[INSPECT](); } catch { return String(v); } }
  return v;
}
const shortInspect = (v, depth = 4) => { const t = inspect(v, { depth, maxItems: 100 }); return t.length > 100000 ? t.slice(0, 100000) + "\n... (truncated)" : t; };

const studioMethods = {
  hello() {
    const info = sys.info(), ses = sys.session();
    return { version: info.version, gameVersion: info.gameVersion, host: info.host, arch: info.arch, dataDir: info.dataDir,
      safeMode: ses.safeMode, safeModeReason: ses.safeModeReason, mcp: ses.mcp, studioUrl: ses.studioUrl };
  },
  async eval({ code, source }) {
    const r = await evalCaptured(String(code ?? ""), source ? String(source) : "<studio>");
    return { logs: r.logs, result: r.error ? undefined : (r.value === undefined && r.logs.length ? undefined : shortInspect(r.value)),
      error: r.error ? formatError(r.error) : undefined };
  },
  complete({ text }) { return completeRich(text); },
  "scripts.list"() { return listScripts(); },
  "scripts.read"({ name }) {
    name = checkScriptName(name);
    const content = sys.readFile("scripts/" + name);
    if (content === null || content === undefined) throw new Error(`scripts/${name} not found`);
    return { name, content };
  },
  "scripts.write"({ name, content }) {
    name = checkScriptName(name);
    if (!sys.writeFile("scripts/" + name, String(content ?? ""))) throw new Error(`could not write scripts/${name}`);
    return { ok: true, name };
  },
  "scripts.delete"({ name }) {
    name = checkScriptName(name);
    if (modules.has("scripts/" + name)) stopModule("scripts/" + name);
    if (!sys.removeFile("scripts/" + name)) throw new Error(`could not delete scripts/${name}`);
    return { ok: true };
  },
  async "module.run"({ name, code }) {
    name = String(name ?? "<studio module>");
    const cap = { out: [] };
    const saved = currentTask;
    currentTask = cap;
    let error;
    try {
      const p = runModule(name, String(code ?? ""));
      currentTask = saved;
      await p;
    } catch (e) { error = e; } finally { if (currentTask === cap) currentTask = saved; }
    return { ok: !error, logs: cap.out, error: error ? formatError(error) : undefined, resources: ownedResources(name) };
  },
  "module.stop"({ name }) { return stopModule(String(name)); },
  "module.list"() { return moduleList(); },
  doctor() { return doctor(); },
  status() { return studioStatus(); },
  "watch.eval"({ exprs }) {
    return (Array.isArray(exprs) ? exprs : []).slice(0, 50).map(src => {
      try { const v = (0, eval)(String(src)); return { ok: true, value: typeof v === "string" ? v : shortInspect(v, 2).slice(0, 2000) }; }
      catch (e) { return { ok: false, value: `${e?.name ?? "Error"}: ${e?.message ?? e}` }; }
    });
  },
  "api.search"({ query, limit }) { return apiSearch(query, Math.min(200, limit ?? 60)); },
  "log.tail"({ lines }) { return nd.log(Math.min(2000, lines ?? 200)); },
  "ai.recent"() { return { paused: mcpState.paused, calls: mcpState.log.slice(-200) }; },
  "ai.pause"({ paused }) { mcpState.paused = !!paused; return { paused: mcpState.paused }; },
  "mcp.info"() { return mcpInfo(); },
  "mcp.regenerate"() { sys.secret("newMcpToken"); return mcpInfo(); },
  "safe.leave"() { return client.leaveSafeMode(); },
  reset() { return client.reset(); },
};
function mcpInfo() {
  const ses = sys.session(), info = sys.info();
  const url = ses.studioUrl ? ses.studioUrl + "mcp" : "";
  const token = sys.secret("mcpToken");
  const tokenPath = info.dataDir + "/mcp.token";
  return { enabled: ses.mcp, url, token, tokenPath,
    command: url ? `claude mcp add --transport http scripteval ${url} --header "Authorization: Bearer ${token}"` : "" };
}

G.__studioRpc = async function (text) {
  let msg;
  try { msg = JSON.parse(text); } catch (e) { return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  const id = msg.id ?? null;
  const fn = Object.prototype.hasOwnProperty.call(studioMethods, msg.method) ? studioMethods[msg.method] : undefined;
  if (!fn) return JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method: ${msg.method}` } });
  try {
    const result = await fn(msg.params ?? {});
    return JSON.stringify({ jsonrpc: "2.0", id, result: result === undefined ? null : result }, jsonSafe);
  } catch (e) {
    return JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: formatError(e) } });
  }
};

// ---- MCP (Model Context Protocol, Streamable HTTP, JSON responses)
const mcpState = { paused: false, log: [] };
const MCP_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const ro = { readOnlyHint: true, openWorldHint: false };
const textArg = (name, desc) => ({ type: "object", properties: { [name]: { type: "string", description: desc } }, required: [name] });
const MCP_TOOLS = [
  { name: "status", title: "Status", description: "Doctor line and a summary of the game client: world detection, local player, tick hook, Studio. Call this first.",
    inputSchema: { type: "object", properties: {} }, annotations: ro,
    run: () => `${doctor().line}\n${JSON.stringify(studioStatus(), jsonSafe, 2)}` },
  { name: "doctor", title: "Doctor", description: "Runs every self-check (memory, module, RTTI, world, tick hook, Studio, safe mode) with hints for failures.",
    inputSchema: { type: "object", properties: {} }, annotations: ro,
    run: () => { const d = doctor(); return d.line + "\n" + d.checks.map(c => `${c.name.padEnd(6)} ${c.state.padEnd(4)} ${c.value}${c.hint ? "  - " + c.hint : ""}`).join("\n"); } },
  { name: "eval", title: "Evaluate JavaScript", description:
      "Evaluates JavaScript inside the Minecraft Bedrock client (QuickJS) with a @minecraft/server-like API: world, system, client, dbg are globals. " +
      "Top-level await works. Code containing import/export runs as a module. Returns console output and the inspected result. " +
      "The API is client-side: reading works, changing the world mostly does not (see api_search).",
    inputSchema: textArg("code", "JavaScript source"),
    run: async ({ code }) => {
      const r = await evalCaptured(String(code ?? ""), "<mcp>");
      const parts = [...r.logs];
      if (r.error) return { text: [...parts, formatError(r.error)].join("\n"), isError: true };
      parts.push("=> " + shortInspect(r.value));
      return parts.join("\n");
    } },
  { name: "inspect", title: "Inspect a value", description: "Evaluates an expression and returns a deep inspection (depth configurable).",
    inputSchema: { type: "object", properties: { expression: { type: "string" }, depth: { type: "number", description: "default 3" } }, required: ["expression"] },
    annotations: ro, run: ({ expression, depth }) => shortInspect((0, eval)(String(expression)), Math.max(0, Math.min(8, depth ?? 3))) },
  { name: "logs", title: "Logs", description: "Recent console lines (script output) and/or ScriptEval's own log (detection, tick hook, errors).",
    inputSchema: { type: "object", properties: { lines: { type: "number", description: "default 100" }, source: { type: "string", enum: ["console", "log", "both"] } } },
    annotations: ro, run: ({ lines, source }) => {
      const n = Math.max(1, Math.min(1000, lines ?? 100)), src = source ?? "both", out = [];
      if (src !== "log") out.push("--- console ---", ...sys.consoleTail(n).map(l => l.text));
      if (src !== "console") out.push("--- log ---", ...nd.log(n));
      return out.join("\n");
    } },
  { name: "api_search", title: "Search the API", description: "Finds members of the ScriptEval API (world, Entity#, Player#, client, dbg, module exports). Words are AND-matched, e.g. \"player location\".",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } }, annotations: ro,
    run: ({ query, limit }) => { const r = apiSearch(query, Math.min(200, limit ?? 40)); return `${r.total} match(es)\n` + r.results.map(e => `${e.name}  [${e.kind}]`).join("\n"); } },
  { name: "scripts_list", title: "List scripts", description: "Lists files under scripts/ and whether they are running as modules.",
    inputSchema: { type: "object", properties: {} }, annotations: ro, run: () => JSON.stringify(listScripts(), null, 2) },
  { name: "script_read", title: "Read a script", description: "Returns the content of scripts/<name>.", inputSchema: textArg("name", "e.g. probe.js"), annotations: ro,
    run: ({ name }) => studioMethods["scripts.read"]({ name }).content },
  { name: "script_write", title: "Write a script", description: "Creates or replaces scripts/<name> (JavaScript; .ts files can only be run from Studio).",
    inputSchema: { type: "object", properties: { name: { type: "string" }, content: { type: "string" } }, required: ["name", "content"] },
    annotations: { destructiveHint: true, openWorldHint: false }, run: ({ name, content }) => (studioMethods["scripts.write"]({ name, content }), `wrote scripts/${name}`) },
  { name: "script_run", title: "Run a script", description: "Runs scripts/<name> as a module. Running it again replaces the previous instance (its timers, handlers, panels are released).",
    inputSchema: textArg("name", "e.g. probe.js"), run: async ({ name }) => {
      name = checkScriptName(name);
      if (!/\.(m?js)$/.test(name)) return { text: "only .js modules can run from MCP (TypeScript is compiled by Studio)", isError: true };
      const code = sys.readFile("scripts/" + name);
      if (code === null || code === undefined) return { text: `scripts/${name} not found`, isError: true };
      const r = await studioMethods["module.run"]({ name: "scripts/" + name, code });
      return { text: [...r.logs, r.ok ? `running scripts/${name} ${JSON.stringify(r.resources)}` : r.error].join("\n"), isError: !r.ok };
    } },
  { name: "script_stop", title: "Stop a script", description: "Stops a running module and releases its timers, event handlers, panels and watches.",
    inputSchema: textArg("name", "module name as listed by modules_list, e.g. scripts/probe.js"),
    run: ({ name }) => JSON.stringify(stopModule(String(name).startsWith("scripts/") || String(name).startsWith("<") ? String(name) : "scripts/" + name)) },
  { name: "modules_list", title: "Running modules", description: "Modules started by Studio, MCP or runScript, with the resources each one holds.",
    inputSchema: { type: "object", properties: {} }, annotations: ro, run: () => JSON.stringify(moduleList(), null, 2) },
];

G.__mcp = async function (text) {
  let msg;
  try { msg = JSON.parse(text); } catch { return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  const id = msg.id ?? null;
  const ok = result => JSON.stringify({ jsonrpc: "2.0", id, result }, jsonSafe);
  const fail = (code, message) => JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  const p = msg.params ?? {};
  switch (msg.method) {
    case "initialize": {
      const info = sys.info();
      return ok({
        protocolVersion: MCP_VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "scripteval", title: "ScriptEval (Minecraft Bedrock client)", version: info.version },
        instructions: `ScriptEval runs JavaScript inside a Minecraft Bedrock ${info.gameVersion || ""} client (mcpelauncher). ` +
          "Start with `status`. Use `api_search` before writing code - the API is a client-side emulation of @minecraft/server " +
          "(reads world state; most writes are not possible client-side). `eval` for quick experiments, `script_write` + `script_run` for code that keeps running.",
      });
    }
    case "ping": return ok({});
    case "tools/list":
      return ok({ tools: MCP_TOOLS.map(({ run, ...t }) => t) });
    case "tools/call": {
      const tool = MCP_TOOLS.find(t => t.name === p.name);
      if (!tool) return fail(-32602, `unknown tool: ${p.name}`);
      const t0 = sys.now();
      const entry = { time: Date.now(), tool: tool.name, args: JSON.stringify(p.arguments ?? {}).slice(0, 300), ok: true, ms: 0, summary: "" };
      let text, isError = false;
      if (mcpState.paused) { text = "Paused by the user in ScriptEval Studio. Ask them to resume (AI tab)."; isError = true; }
      else {
        try {
          const r = await tool.run(p.arguments ?? {});
          if (r && typeof r === "object" && "text" in r) { text = r.text; isError = !!r.isError; } else text = String(r);
        } catch (e) { text = formatError(e); isError = true; }
      }
      if (text.length > 200000) text = text.slice(0, 200000) + "\n... (truncated)";
      entry.ok = !isError; entry.ms = Math.round(sys.now() - t0); entry.summary = text.split("\n")[0].slice(0, 160);
      mcpState.log.push(entry);
      if (mcpState.log.length > 500) mcpState.log.splice(0, mcpState.log.length - 500);
      return ok({ content: [{ type: "text", text }], isError });
    }
    default:
      return fail(-32601, `method not found: ${msg.method}`);
  }
};

// js::call entry: globalThis[fn](arg) -> string | Promise<string>
G.__callTask = function (id, fn, arg) {
  const saved = currentTask;
  currentTask = null;
  const fail = e => JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: formatError(e) } });
  let r;
  try { r = G[fn](arg); } catch (e) { currentTask = saved; sys.taskDone(id, fail(e)); return; }
  currentTask = saved;
  Promise.resolve(r).then(v => sys.taskDone(id, typeof v === "string" ? v : JSON.stringify(v, jsonSafe)), e => sys.taskDone(id, fail(e)));
};

Object.assign(client, {
  doctor() { const d = doctor(); return { line: d.line, checks: d.checks.map(c => ({ name: c.name, state: c.state, value: c.value, hint: c.hint })) }; },
  studio(open = true) {
    const ses = sys.session();
    if (!ses.studioPort) throw new Error("Studio is not running (config.json: studioPort, or the port is in use - see client.log())");
    const url = sys.secret("studioUrl");
    if (open && sys.openUrl(url)) return `opened ${ses.studioUrl} in your browser`;
    return `open this address in your browser (it contains this session's token, do not share it):\n${url}`;
  },
  mcp() {
    const m = mcpInfo();
    if (!m.enabled) return "MCP is disabled (config.json: \"mcp\": false, or Studio is not running)";
    return `MCP endpoint: ${m.url}\nRegister it in Claude Code:\n  ${m.command}\n(the token is stored in ${m.tokenPath}; Studio > AI can regenerate it)`;
  },
  onDispose(fn) {
    if (typeof fn !== "function") throw new TypeError("onDispose expects a function");
    const owner = currentOwner ?? "<global>";
    if (!disposers.has(owner)) disposers.set(owner, []);
    disposers.get(owner).push(fn);
    return fn;
  },
  modules() { return moduleList(); },
  stopModule(name) { return stopModule(String(name)); },
  get safeMode() { return sys.session().safeMode; },
  leaveSafeMode() {
    const was = sys.leaveSafeMode();
    if (!was) return "not in safe mode";
    let tick = "";
    try { mc.installTickHook(); tick = "tick hook installation started"; } catch (e) { tick = "tick hook: " + (e?.message ?? e); }
    try { if (sys.readFile("scripts/autorun.js")) G.runScript("autorun.js"); } catch (e) { emit(3, "[error] autorun: " + formatError(e)); }
    return `left safe mode (${tick}; autorun started)`;
  },
});

// ===========================================================================
// global resource packs (games/com.mojang) - the same operations as Studio > リソースパック.
// Changes are written to global_resource_packs.json; the game applies them at its next start.
// ===========================================================================
const packState = () => sys.packs("list");
const packRow = p => {
  const r = { name: p.name, version: p.version, active: p.active, forced: p.forced, id: p.id };
  if (p.subpack) r.subpack = p.subpack;
  if (p.folder) r.folder = p.folder;
  if (!p.installed) r.installed = false;
  if (p.error) r.error = p.error;
  return r;
};
function packOp(method, params, done) {
  const st = sys.packs(method, JSON.stringify(params));
  const p = [...st.active, ...st.inactive].find(x => x.id === params.id || x.name === params.id || x.folder === params.id);
  const name = p ? `「${p.name}」` : params.id;
  return `${name}${done(p)}${st.restartNeeded ? "。ゲームを再起動すると反映されます" : ""}`;
}
const packs = {
  list() { const st = packState(); return [...st.active, ...st.inactive].map(packRow); },
  state() { return packState(); },
  get dir() { return sys.packs("summary").dir; },
  enable(id, opts = {}) {
    const params = { id: String(id), force: opts.force === undefined ? true : !!opts.force };
    if (opts.subpack !== undefined) params.subpack = String(opts.subpack);
    return packOp("enable", params, p => `を有効にしました${p?.forced ? "（強制）" : ""}`);
  },
  disable(id) { return packOp("disable", { id: String(id) }, () => "を無効にしました"); },
  force(id, on = true) { return packOp("force", { id: String(id), on: !!on }, () => on ? "を強制にしました" : "の強制を外しました"); },
  move(id, delta) { return packOp("move", { id: String(id), delta: Number(delta) | 0 }, () => "の順番を変えました"); },
  subpack(id, name) { return packOp("subpack", { id: String(id), subpack: String(name ?? "") }, () => `のサブパックを ${name || "（既定）"} にしました`); },
  remove(id) { return packOp("remove", { id: String(id) }, () => "を削除しました"); },
  // Web からリソースパックをダウンロードして強制導入(既定で有効化＋強制)。
  installUrl(url, opts = {}) {
    return sys.packs("install_url", JSON.stringify({ url: String(url), activate: opts.activate !== false, force: opts.force !== false }));
  },
  [INSPECT]() {
    try {
      const st = packState();
      return { dir: st.dir, active: st.active.map(p => `${p.name} ${p.version}${p.forced ? " (強制)" : ""}${p.installed ? "" : " (未インストール)"}`),
        inactive: st.inactive.map(p => p.name), restartNeeded: st.restartNeeded };
    } catch (e) { return `packs <${e?.message ?? e}>`; }
  },
};
client.packs = packs;

const MODULES = {
  "@minecraft/server": () => ({
    world, system, Entity, Player, Dimension, World, System, ItemStack, Block, Container,
    Scoreboard, ScoreboardObjective, ScoreboardIdentity,
    DisplaySlotId: { BelowName: "BelowName", List: "List", Sidebar: "Sidebar" },
    ObjectiveSortOrder: { Ascending: "Ascending", Descending: "Descending" },
    ScoreboardIdentityType: { Entity: "Entity", FakePlayer: "FakePlayer", Player: "Player" },
    EntityHealthComponent, EntityEquippableComponent, GameMode, EquipmentSlot, EntityComponentTypes,
    MinecraftDimensionTypes, InvalidEntityError,
  }),
  "@minecraft/server-ui": () => ({
    ActionFormData, MessageFormData, ModalFormData, ActionFormResponse, MessageFormResponse, ModalFormResponse, FormResponse,
    FormCancelationReason, FormRejectReason, FormRejectError, uiManager,
  }),
  "scripteval": () => ({ client, dbg, inspect, fmt, dist, hex, runScript: G.runScript }),
};
G.__modules = {};
G.__moduleSource = function (name) {
  const f = MODULES[name];
  if (!f) return undefined;
  const m = f();
  G.__modules[name] = m;
  const keys = Object.keys(m).filter(isIdent);
  return `const __m = globalThis.__modules[${JSON.stringify(name)}];\nexport default __m;\n` +
    keys.map(k => `export const ${k} = __m.${k};`).join("\n");
};
})();
