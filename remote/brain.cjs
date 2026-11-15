'use strict';
// remote/brain.cjs — what the resident bot (remote/bot.cjs) does with a command: the rule guard, the built-in commands, the work
// queue, self-defense. Reloaded in place by `update`/`reload` (the connection in bot.cjs stays: the bot joins the server once).
module.exports = function brain(ctx) {
const { me, cfg, log, sleep } = ctx;
let disposed = false;
const timers = [];

// ---------- the rule: keep away from builds and other players ----------
// blocks no world generates by itself in the open (villages and ruins have some too: kept away from as well, which is fine)
const BUILT = /planks|glass|crafting_table|chest|barrel|_bed$|torch|lantern|wool|carpet|concrete|bricks|_slab|_stairs|_door|fence|furnace|smoker|anvil|_sign|bookshelf|rail|redstone_(wire|torch|lamp|block)|repeater|comparator|piston|hopper|composter|lectern|scaffolding|ladder|banner|bell|item_frame|shulker_box|enchanting_table|brewing_stand|beacon|quartz_block|smooth_stone|polished_|cut_|_wall$|campfire|flower_pot|candle|lever|_button|pressure_plate|observer|dispenser|dropper|tnt|iron_block|gold_block|diamond_block|emerald_block|copper_block|hay_block|glazed_terracotta|stained|sea_lantern|end_rod/;
// actions that only move or look: allowed anywhere (they change nothing)
const PASSIVE = /^(goto|travel|walk|sprint|sneak|jump|swim|look|lookat|turn|pos|inv|near|stop|status|players|survey|around|help|guard|respawn|goto_death|wait|sleepms|leave|fly|land|crawl)$/;
let guardOn = ctx.guardOn ?? true;
const HOSTILE = /^minecraft:(zombie|husk|drowned|skeleton|stray|bogged|spider|cave_spider|creeper|witch|slime|magma_cube|zombie_villager_v2|pillager|vindicator|silverfish|phantom|blaze|wither_skeleton|piglin_brute|hoglin|ghast|endermite|breeze)$/;
function scanBuilt(bot, R) {
  const p = bot.state().pos, X = Math.floor(p.x), Y = Math.floor(p.y), Z = Math.floor(p.z), hits = new Map();
  for (let x = X - R; x <= X + R; x += 1) for (let z = Z - R; z <= Z + R; z += 1) {
    if ((x - X) ** 2 + (z - Z) ** 2 > R * R) continue;
    for (let y = Math.max(-64, Y - 24); y <= Y + 24; y++) {
      const id = bot.world.block(x, y, z)?.name;
      if (id && BUILT.test(id)) { const k = id.replace('minecraft:', ''); const h = hits.get(k); if (h) h.n++; else hits.set(k, { n: 1, x, y, z, d: Math.round(Math.hypot(x - X, z - Z)) }); }
    }
  }
  return [...hits].map(([k, h]) => ({ block: k, ...h })).sort((a, b) => a.d - b.d);
}
function nearPlayers(bot, R) {
  const p = bot.state().pos;
  return [...bot.entities.values()].filter((e) => e.type === 'minecraft:player' && e.name && e.name !== me.account)
    .map((e) => ({ name: e.name, d: Math.round(Math.hypot(e.x - p.x, e.z - p.z)), x: Math.round(e.x), y: Math.round(e.y), z: Math.round(e.z) }))
    .filter((e) => e.d <= R).sort((a, b) => a.d - b.d);
}
function guardReason(bot) {
  if (!guardOn || !bot) return null;
  const R = cfg.guardRadius, pl = nearPlayers(bot, R);
  if (pl.length) return `player ${pl[0].name} ${pl[0].d} blocks away`;
  const b = scanBuilt(bot, Math.min(R, 64));
  if (b.length >= 3 || (b.length && b[0].n >= 4)) return `someone's build (${b.slice(0, 3).map((h) => `${h.block}@${h.x},${h.y},${h.z}`).join(' ')}) ${b[0].d} blocks away`;
  return null;
}


// ---------- built-in commands ----------
function status() {
  const b = me.bot; if (!b) return { connected: false, signIn: me.msa };
  const s = b.state();
  const t = b.time?.(), day = t === null || t === undefined ? null : ((t % 24000) + 24000) % 24000;
  const P = s.pos, hostile = [...b.entities.values()].filter((e) => HOSTILE.test(e.type ?? '') && Math.hypot(e.x - P.x, e.z - P.z) < 16).length;
  return { connected: me.connected, account: me.account, time: day, night: day === null ? null : day >= 12542 && day <= 23460, hostileNear: hostile, pos: { x: +s.pos.x.toFixed(1), y: +s.pos.y.toFixed(1), z: +s.pos.z.toFixed(1) }, dim: me.dim, hp: me.hp, food: me.food, dead: s.dead, deaths: me.deaths, busy: me.busy, queued: me.queue.length, guard: guardOn, players: b.players(), signIn: me.msa, uptime: Math.round((Date.now() - ctx.t0) / 1000) };
}
const BUILTIN = {
  help: () => log('commands: any bdslab action/verb (get_<item> [n], mine_<block> [n], goto x z, craft_<item>, kill_<mob>, fight_ender_dragon, inv, pos, near ...) · status · players · survey [r] · around · travel x z · guard on|off|<radius> · stop · clear · reconnect · update · reload · quit'),
  status: () => log('status ' + JSON.stringify(status())),
  players: () => { const l = me.bot?.players() ?? []; log(`players (${l.length}): ${l.join(', ')}`, { dc: true }); },
  survey: (a) => {
    const R = +(a[0] ?? cfg.guardRadius), b = scanBuilt(me.bot, Math.min(R, 96)), pl = nearPlayers(me.bot, R);
    log(`survey r=${R}: builds ${b.length ? b.slice(0, 8).map((h) => `${h.block}x${h.n}@${h.x},${h.y},${h.z}(${h.d})`).join(' ') : 'none'} · players ${pl.length ? pl.map((e) => `${e.name}(${e.d})`).join(' ') : 'none'}`, { dc: true });
  },
  around: () => {
    const q = me.bot.state().pos, X = Math.floor(q.x), Y = Math.floor(q.y), Z = Math.floor(q.z), rows = [];
    for (let dy = 2; dy >= -3; dy--) { const r = []; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) r.push((me.bot.world.block(X + dx, Y + dy, Z + dz)?.name ?? '?').replace('minecraft:', '').slice(0, 8)); rows.push(`y${Y + dy}: ${r.join(',')}`); }
    log('around\n' + rows.join('\n'));
  },
  guard: (a) => { if (a[0] === 'off') guardOn = false; else if (a[0] === 'on') guardOn = true; else if (+a[0] > 0) cfg.guardRadius = +a[0]; log(`guard ${guardOn ? 'on' : 'off'} radius ${cfg.guardRadius}`); },
  // a long walk in steps over the chunks the client has (goto alone only paths through what it already knows)
  travel: async (a) => {
    const tx = +a[0], tz = +a[1];
    for (let i = 0; i < 400 && !me.abort; i++) {
      while (!me.connected || !me.bot) { if (me.abort) return; await sleep(1000); }   // dropped on the way: carry on once back in
      const q = me.bot.state().pos, dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
      if (d < 4) break;
      const st = Math.min(32, d);
      try { await me.bot.act('goto', [String(Math.round(q.x + (dx / d) * st)), String(Math.round(q.z + (dz / d) * st))]); } catch { continue; }
      if (!me.connected) continue;
      const r = me.bot.state().pos;
      if (Math.hypot(r.x - q.x, r.z - q.z) < 2) { log(`travel: stuck at ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}`, { dc: true }); return; }
      if (i % 2 === 1) log(`travel: at ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}, ${Math.round(Math.hypot(tx - r.x, tz - r.z))} to go`);
    }
    const r = me.bot.state().pos;
    log(`travel: arrived ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}`, { dc: true });
  },
  wait: async (a) => sleep(+(a[0] ?? 1000)),
  // join again now (it also does by itself, once, when the server really dropped it)
  reconnect: () => ctx.rejoin(),
  // the newest bdslab, without leaving: these commands (brain.cjs) are reloaded in place; a change to realplayer.cjs waits for a restart
  update: () => ctx.update(),
  reload: () => ctx.reload(),
  quit: () => ctx.quit(),
};
// handled at once, even while something runs
const NOW = {
  stop: () => { me.abort = true; me.queue.length = 0; me.bot?.act('stop', []).catch(() => {}); log('stopped (queue cleared)'); },
  clear: () => { me.queue.length = 0; log('queue cleared'); },
  status: BUILTIN.status, players: BUILTIN.players, help: BUILTIN.help, quit: BUILTIN.quit, guard: BUILTIN.guard, update: BUILTIN.update, reload: BUILTIN.reload, reconnect: BUILTIN.reconnect,
};
function command(line) {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const [v, ...a] = line.replace(/^@\S+\s+/, '').replace(/^\//, '').split(/\s+/);
  if (NOW[v]) return NOW[v](a);
  me.queue.push(line);
}
async function worker() {
  while (!disposed) {
    if (!me.queue.length || !me.bot || !me.connected) { await sleep(300); continue; }
    const line = me.queue.shift(), [v, ...a] = line.split(/\s+/);
    me.busy = line; me.abort = false;
    const why = PASSIVE.test(v) || BUILTIN[v] ? null : guardReason(me.bot);
    if (why) { log(`refused "${line}": ${why} (server rule; move away first, or guard off)`, { dc: true }); me.busy = null; continue; }
    const t = Date.now();
    log(`> ${line}`);
    // while it runs: leave off when a build or a player comes close
    const watch = PASSIVE.test(v) ? null : setInterval(() => { if (!me.connected) return; const w = guardReason(me.bot); if (w && !me.abort) { log(`guard: stopping "${line}": ${w}`, { dc: true }); NOW.stop(); } }, 3000);
    try { await (BUILTIN[v] ? BUILTIN[v](a) : me.bot.act(v, a)); log(`done "${line}" in ${((Date.now() - t) / 1000).toFixed(0)}s`, { dc: !/^(pos|inv|near|look|turn|wait|around)$/.test(v) }); }
    catch (e) { log(`failed "${line}": ${e.message}`, { dc: true }); }
    finally { if (watch) clearInterval(watch); me.busy = null; }
  }
}

// ---------- self-defense: a hostile mob within reach gets hit back (no block is touched: allowed near builds too) ----------
let swinging = false;
timers.push(setInterval(async () => {
  const b = me.bot; if (!b || !me.connected || swinging || b.state().dead) return;
  const P = b.state().pos, e = [...b.entities.values()].filter((x) => HOSTILE.test(x.type ?? '') && !/creeper/.test(x.type) && Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) < 3.2)[0];
  if (!e) return;
  swinging = true;
  try { await b.act('attack', [e.type.replace('minecraft:', '')]); } catch { /* gone */ } finally { swinging = false; }
}, 700));


worker();
return { command, status, dispose: () => { disposed = true; for (const t of timers) clearInterval(t); }, guardOn: () => guardOn, setGuard: (v) => { guardOn = v; } };
};
