'use strict';
// remote/brain.cjs — what the resident bot (remote/bot.cjs) does with a command: the rule guard, the built-in commands, the work
// queue, self-defense. Reloaded in place by `update`/`reload` (the connection in bot.cjs stays: the bot joins the server once).
module.exports = function brain(ctx) {
const { me, cfg, log, sleep } = ctx;
ctx.RUN ??= require('node:path').join(__dirname, 'run'); ctx.taps ??= new Set(); ctx.t0 ??= Date.now();   // (an older bot.cjs does not pass these)
let disposed = false;
const timers = [];

// ---------- the rule: keep away from builds and other players ----------
// blocks no world generates by itself in the open (villages and ruins have some too: kept away from as well, which is fine)
const BUILT = /planks|glass|crafting_table|chest|barrel|_bed$|torch|lantern|wool|(?<!moss_)carpet|concrete|bricks|_slab|_stairs|_door|fence|furnace|smoker|anvil|_sign|bookshelf|rail|redstone_(wire|torch|lamp|block)|repeater|comparator|piston|hopper|composter|lectern|scaffolding|ladder|banner|bell|item_frame|shulker_box|enchanting_table|brewing_stand|beacon|quartz_block|smooth_stone|polished_|cut_|_wall$|campfire|flower_pot|candle|lever|_button|pressure_plate|observer|dispenser|dropper|tnt|iron_block|gold_block|diamond_block|emerald_block|copper_block|hay_block|glazed_terracotta|stained|sea_lantern|end_rod/;
// actions that only move or look: allowed anywhere (they change nothing)
const PASSIVE = /^(auto|map|walk_xz|to_surface|goto|travel|walk|sprint|sneak|jump|swim|look|lookat|turn|pos|inv|near|stop|status|players|survey|around|help|guard|respawn|goto_death|wait|sleepms|leave|fly|land|crawl)$/;
let guardOn = ctx.guardOn ?? true;
const HOSTILE = /^minecraft:(zombie|husk|drowned|skeleton|stray|bogged|spider|cave_spider|creeper|witch|slime|magma_cube|zombie_villager_v2|pillager|vindicator|silverfish|phantom|blaze|wither_skeleton|piglin_brute|hoglin|ghast|endermite|breeze)$/;
function scanBuilt(bot, R) {
  const p = bot.state().pos, X = Math.floor(p.x), Y = Math.floor(p.y), Z = Math.floor(p.z), hits = new Map();
  for (let x = X - R; x <= X + R; x += 1) for (let z = Z - R; z <= Z + R; z += 1) {
    if ((x - X) ** 2 + (z - Z) ** 2 > R * R) continue;
    for (let y = Math.max(-64, Y - 24); y <= Y + 24; y++) {
      const id = bot.world.block(x, y, z)?.name;
      if (id && BUILT.test(id) && !bot.placedByMe?.has(`${x},${y},${z}`)) { const k = id.replace('minecraft:', ''); const h = hits.get(k); if (h) h.n++; else hits.set(k, { n: 1, x, y, z, d: Math.round(Math.hypot(x - X, z - Z)) }); }
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
  // (one chest, furnace, table, bed or sign of someone's is enough: those are theirs to use)
  if (b.length >= 3 || (b.length && b[0].n >= 4) || b.some((h) => /chest|barrel|furnace|smoker|crafting_table|_bed|sign|shulker|anvil|brewing|enchanting/.test(h.block))) return `someone's build (${b.slice(0, 3).map((h) => `${h.block}@${h.x},${h.y},${h.z}`).join(' ')}) ${b[0].d} blocks away`;
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
// walking a long way the way a person does: face the target, run (sprint, auto-jump up 1-block steps), and when nothing moves
// for 3 s jump and veer off to one side; a drop of 4 or more right ahead is gone round instead of jumped down
function builtAhead(b, p, r) {
  for (let s = 1; s <= 5; s++) for (const side of [-1, 0, 1]) {
    const x = Math.floor(p.x - Math.sin(r) * s + Math.cos(r) * side), z = Math.floor(p.z + Math.cos(r) * s + Math.sin(r) * side);
    for (let y = Math.floor(p.y) - 1; y <= Math.floor(p.y) + 2; y++) { const n = b.world.block(x, y, z)?.name; if (n && BUILT.test(n)) return true; }
  }
  return false;
}
// up out of a cave without a pickaxe or blocks to stand on: a staircase dug by hand, one step up each time (what a person with
// nothing in hand does): the block ahead at head height and the one above it, then the head room over the feet, then a jump up
const openSky = (b, p) => { for (let y = Math.floor(p.y) + 2; y < Math.floor(p.y) + 60; y++) { const n = b.world.block(Math.floor(p.x), y, Math.floor(p.z))?.name; if (n === undefined) return true; if (!/air|leaves|water/.test(n)) return false; } return true; };
async function handStairs(tx, tz, maxSteps = 60) {
  const b = me.bot;
  const deaths0 = me.deaths;
  for (let i = 0; i < maxSteps && !me.abort && !disposed && me.connected && me.deaths === deaths0; i++) {
    const p = b.state().pos;
    if (openSky(b, p)) { log(`travel: out under the sky at y=${Math.floor(p.y)}`); return true; }
    if (guardReason(b)) return false;
    const r = Math.atan2(-(tx - p.x), tz - p.z), dx = Math.round(-Math.sin(r)), dz = Math.round(Math.cos(r));
    const X = Math.floor(p.x), Y = Math.floor(p.y), Z = Math.floor(p.z);
    for (const c of [[X, Y + 2, Z], [X + dx, Y + 1, Z + dz], [X + dx, Y + 2, Z + dz]]) {
      const n = b.world.block(...c)?.name ?? '';
      if (n && !/air|water|lava|bedrock|torch/.test(n)) await b.act('dig', c.map(String)).catch(() => {});
    }
    await b.act('look', [String(((Math.atan2(-dx, dz) * 180) / Math.PI).toFixed(0)), '0']).catch(() => {});
    await b.act('walk', ['forward', 'on']).catch(() => {}); await b.act('jump', ['4']).catch(() => {}); await b.act('walk', ['off']).catch(() => {});
    if (i % 5 === 4) log(`travel: digging up by hand, y=${Math.floor(b.state().pos.y)}`);
  }
  return openSky(b, b.state().pos);
}
async function walkTo(tx, tz, maxMs = 600000) {
  me.walkTick ??= 0;
  const deaths0 = me.deaths;   // (a death puts it back at the spawn: this walk's way is no longer the way; the caller plans again)
  if (me.walking && me.walking !== ctx) { log('travel: another walk is on (an older brain): calling it off'); me.abort = true; await sleep(1500); me.abort = false; }
  me.walking = ctx;
  const b = me.bot, t0 = Date.now();
  await b.act('option', ['autojump', 'on']).catch(() => {});
  let last = b.state().pos, lastT = Date.now(), turn = 0, stuckFor = 0, builtTurns = 0;
  await b.act('sprint', ['on']).catch(() => {});
  try {
    while (!me.abort && !disposed && me.connected && Date.now() - t0 < maxMs && me.deaths === deaths0) {
      const p = b.state().pos, dx = tx - p.x, dz = tz - p.z;
      if (Math.hypot(dx, dz) < 3) return true;
      const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI + turn, r = (yaw * Math.PI) / 180;
      const ax = Math.floor(p.x - Math.sin(r) * 1.6), az = Math.floor(p.z + Math.cos(r) * 1.6);
      let drop = 0;
      for (let y = Math.floor(p.y) - 1; y > Math.floor(p.y) - 7; y--) { const n = b.world.block(ax, y, az)?.name; if (n === undefined || !/^minecraft:(air|cave_air)$/.test(n)) break; drop++; }
      if (drop >= 4) { turn += turn >= 0 ? 45 : -45; if (Math.abs(turn) > 180) turn = -turn % 180; continue; }
      // the rule while walking too: someone's build within 5 blocks ahead is not walked into or along; steer off it
      // (already among builds, every way has one: then just get out, the shortest way, and steer again once clear)
      if (guardOn && builtTurns < 11 && builtAhead(b, p, r)) { builtTurns++; turn += turn >= 0 ? 35 : -35; if (Math.abs(turn) > 180) turn = -turn % 180; await sleep(50); continue; }
      if (builtTurns >= 11 && !guardReason(b)) builtTurns = 0; else if (builtTurns < 11) builtTurns = 0;
      await b.act('look', [String(yaw.toFixed(1)), '0']).catch(() => {});
      await b.act('sprint', ['on']).catch(() => {});
      await sleep(400);
      if (Date.now() - lastT > 3000) {
        const moved = Math.hypot(p.x - last.x, p.z - last.z);
        if (moved < 1.5) {
          stuckFor++; await b.act('jump', []).catch(() => {});
          // still nowhere after a few tries and nobody's build near: dig the way ahead (natural ground only), as a person would
          if (stuckFor >= 3 && !guardReason(b)) {
            const ry = ((Math.atan2(-dx, dz) * 180) / Math.PI) * Math.PI / 180, fx = Math.floor(p.x - Math.sin(ry) * 1.1), fz = Math.floor(p.z + Math.cos(ry) * 1.1);
            for (const y of [Math.floor(p.y) + 1, Math.floor(p.y)]) { const n = b.world.block(fx, y, fz)?.name ?? ''; if (n && !/air|water|lava|bedrock/.test(n)) await b.act('dig', [String(fx), String(y), String(fz)]).catch(() => {}); }
            turn = 0;
          } else turn = (stuckFor % 2 ? 1 : -1) * Math.min(150, 40 * stuckFor);
        }
        else { stuckFor = 0; turn = Math.abs(turn) < 10 ? 0 : turn * 0.5; }
        last = p; lastT = Date.now();
        if (++me.walkTick % 10 === 0) log(`travel: at ${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}, ${Math.round(Math.hypot(dx, dz))} to go${stuckFor ? ` (stuck ${stuckFor})` : ''}`);
        if (stuckFor === 6 && !guardReason(b) && !openSky(b, p)) { log('travel: stuck under the ground, going up first'); await b.act('to_surface', []).catch(() => {}); if (!openSky(b, b.state().pos)) await handStairs(tx, tz); }
        if (stuckFor >= 10) return false;
      }
    }
  } finally { if (me.walking === ctx) me.walking = null; await b.act('sprint', ['off']).catch(() => {}); }
  return false;
}
// a goto that takes too long (a path search over far too much, a step it keeps retrying) is called off after 30 s
async function gotoFor(args, ms = 30000, verb = 'goto') {
  const b = me.bot; let timer;
  const g = b.act(verb, args);
  // (walk_xz may dig: called off at once when someone's build or a player comes within the guard radius)
  const watch = verb === 'walk_xz' ? setInterval(() => { if (guardReason(b)) { log('travel: a build or a player near: no digging walk here'); b.cancel?.(); } }, 1500) : null;
  await Promise.race([g.catch(() => {}), new Promise((r) => { timer = setTimeout(() => { b.cancel?.(); r(); }, ms); })]);
  clearTimeout(timer); if (watch) clearInterval(watch);
  await g.catch(() => {});
}
const BUILTIN = {
  help: () => log('commands: any bdslab action/verb (get_<item> [n], mine_<block> [n], goto x z, craft_<item>, kill_<mob>, fight_ender_dragon, inv, pos, near ...) · status · players · survey [r] · around · travel x z · guard on|off|<radius> · stop · clear · auto [stop] · reconnect · update · reload · restart · quit'),
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
  // a top view around the feet: what is at feet height (upper letter) / under the feet (lower): . air  # solid  ~ water  f fence/wall/trapdoor  @ me
  map: (a) => {
    const R = +(a[0] ?? 8), q = me.bot.state().pos, X = Math.floor(q.x), Y = Math.floor(q.y), Z = Math.floor(q.z), rows = [];
    const ch = (b) => { const n = b?.name ?? '?'; return n === '?' ? '?' : /air/.test(n) ? '.' : /water/.test(n) ? '~' : /lava/.test(n) ? '!' : /fence|wall|trapdoor|pane|bars|door/.test(n) ? 'f' : /slab|stairs|carpet|snow/.test(n) ? 's' : /leaves/.test(n) ? 'l' : /grass|flower|fern|bush|sapling|vine/.test(n) && !/block/.test(n) ? ',' : '#'; };
    for (let dz = -R; dz <= R; dz++) { let r = ''; for (let dx = -R; dx <= R; dx++) { if (!dx && !dz) { r += '@ '; continue; } const f = ch(me.bot.world.block(X + dx, Y, Z + dz)), u = ch(me.bot.world.block(X + dx, Y - 1, Z + dz)); r += (f === '.' ? (u === '.' ? (ch(me.bot.world.block(X + dx, Y - 2, Z + dz)) === '.' ? '_' : 'v') : u.toLowerCase()) : f.toUpperCase()) + ' '; } rows.push(r); }
    log(`map around ${X} ${Y} ${Z} (north up, east right; capital = blocks the way at feet height, lower = floor, v = 1 down, _ = 2+ down)\n` + rows.join('\n'));
  },
  guard: (a) => { if (a[0] === 'off') guardOn = false; else if (a[0] === 'on') guardOn = true; else if (+a[0] > 0) cfg.guardRadius = +a[0]; log(`guard ${guardOn ? 'on' : 'off'} radius ${cfg.guardRadius}`); },
  // a long walk in steps over the chunks the client has (goto alone only paths through what it already knows)
  travel: async (a) => {
    const tx = +a[0], tz = +a[1];
    if (await walkTo(tx, tz)) { const r = me.bot.state().pos; log(`travel: arrived ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}`, { dc: true }); return; }
    if (me.abort || disposed) return;
    const deaths0 = me.deaths;
    for (let i = 0; i < 400 && !me.abort && !disposed && me.deaths === deaths0; i++) {
      while (!me.connected || !me.bot) { if (me.abort || disposed) return; await sleep(1000); }   // dropped on the way: carry on once back in
      const q = me.bot.state().pos, dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
      if (d < 4) break;
      const st = Math.min(32, d);
      try { await gotoFor([String(Math.round(q.x + (dx / d) * st)), String(Math.round(q.z + (dz / d) * st))], 60000, guardReason(me.bot) ? 'goto' : 'walk_xz'); } catch { continue; }
      if (!me.connected) continue;
      const r = me.bot.state().pos;
      if (Math.hypot(r.x - q.x, r.z - q.z) < 2) {
        // no way straight on (a cliff, a lake, a wall): around it, to the side at 45 / 90 degrees, either hand
        let moved = false;
        for (const turn of [0.785, -0.785, 1.571, -1.571, 2.356, -2.356]) {
          const ang = Math.atan2(dz, dx) + turn, sx = Math.round(r.x + Math.cos(ang) * 24), sz = Math.round(r.z + Math.sin(ang) * 24);
          try { await gotoFor([String(sx), String(sz)]); } catch { /* */ }
          const t = me.bot.state().pos; if (Math.hypot(t.x - r.x, t.z - r.z) > 6) { moved = true; break; }
          if (me.abort) return;
        }
        if (!moved) { log(`travel: stuck at ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}`, { dc: true }); return; }
        continue;
      }
      if (i % 2 === 1) log(`travel: at ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}, ${Math.round(Math.hypot(tx - r.x, tz - r.z))} to go`);
    }
    const r = me.bot.state().pos, left = Math.round(Math.hypot(tx - r.x, tz - r.z));
    log(left < 8 ? `travel: arrived ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}` : `travel: called off at ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}, ${left} to go`, { dc: left < 8 });
  },
  wait: async (a) => sleep(+(a[0] ?? 1000)),
  // join again now (it also does by itself, once, when the server really dropped it)
  reconnect: () => ctx.rejoin(),
  // the newest bdslab, without leaving: these commands (brain.cjs) are reloaded in place; a change to realplayer.cjs waits for a restart
  update: () => ctx.update(),
  reload: () => ctx.reload(),
  quit: () => ctx.quit(),
  // leave and start again with the newest bdslab (a change to realplayer.cjs or bot.cjs needs it): one leave and one join
  restart: () => { log('restarting with the newest bdslab: leaving and joining once', { dc: true }); try { me.bot?.close(); } catch { /* */ } setTimeout(() => process.exit(75), 1500); },
};
// handled at once, even while something runs
const NOW = {
  stop: () => { me.abort = true; me.queue.length = 0; me.bot?.cancel?.(); me.bot?.act('stop', []).catch(() => {}); log('stopped (queue cleared)'); },
  clear: () => { me.queue.length = 0; log('queue cleared'); },
  status: BUILTIN.status, players: BUILTIN.players, survey: BUILTIN.survey, around: BUILTIN.around, map: BUILTIN.map, help: BUILTIN.help, quit: BUILTIN.quit, guard: BUILTIN.guard, update: BUILTIN.update, reload: BUILTIN.reload, restart: BUILTIN.restart, reconnect: BUILTIN.reconnect,
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

// ---------- air: under water, keep the jump key down (swim up) until the head is out again; a person does the same ----------
let surfacing = false;
timers.push(setInterval(() => {
  const b = me.bot; if (!b || !me.connected || b.state().dead) return;
  const p = b.state().pos, head = b.world.block(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z))?.name ?? '';
  const wet = /water/.test(head);
  if (wet !== surfacing) { surfacing = wet; b.act('jump', [wet ? 'on' : 'off']).catch(() => {}); }
}, 400));

// ---------- self-defense: a hostile mob within reach gets hit back (no block is touched: allowed near builds too) ----------
let swinging = false;
const skipUntil = new Map();
timers.push(setInterval(async () => {
  const b = me.bot; if (!b || !me.connected || swinging || b.state().dead) return;
  const P = b.state().pos, e = [...b.entities.values()].filter((x) => HOSTILE.test(x.type ?? '') && !/creeper/.test(x.type) && Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) < 2.9 && !(skipUntil.get(String(x.id)) > Date.now()))[0];
  if (!e) return;
  skipUntil.set(String(e.id), Date.now() + 2500);   // one try per mob every 2.5 s (a mob behind a block is not swung at over and over)
  swinging = true;
  try { await b.act('attack', [e.type.replace('minecraft:', '')]); } catch { /* gone */ } finally { swinging = false; }
}, 700));


// ---------- auto: the whole run on its own (`auto` starts it, `auto stop` ends it) ----------
// away from builds and players → stone tools → iron gear, bucket, food → eyes of ender (the nether) → the stronghold → the dragon;
// the dragon already gone → the elytra (end gateway, end city); afterwards diamonds, as many as can be mined, until ENDS_AT.
// Every step is retried; a death is followed by fetching the things back; a guard stop by moving away first.
const ENDS_AT = cfg.autoUntil ?? '08:00';   // local time to keep going until (after the goal)
const STEPS = [
  { name: 'stone tools', cmds: ['get_stone_pickaxe', 'get_stone_sword', 'get_stone_axe'], has: ['stone_pickaxe', 'stone_sword'] },
  { name: 'a bed as the spawn point (out here, not among the builds)', special: 'bedspawn', optional: true },
  { name: 'food', cmds: ['get_cooked_beef 10', 'get_cooked_porkchop 10', 'get_cooked_mutton 10', 'get_cooked_chicken 10', 'get_bread 10'], food: 8 },
  { name: 'iron gear', cmds: ['get_iron_pickaxe', 'get_iron_sword', 'get_bucket', 'get_shield', 'get_iron_chestplate', 'get_iron_leggings', 'get_iron_helmet', 'get_iron_boots'], has: ['iron_pickaxe', 'iron_sword', 'bucket'] },
  { name: 'flint and steel', cmds: ['get_flint_and_steel'], has: ['flint_and_steel'] },
  { name: 'beds (dragon)', cmds: ['get_white_bed 4'], optional: true },
  { name: 'eyes of ender', cmds: ['get_ender_eye 14'], has: ['ender_eye'] },
  { name: 'stronghold → the end', cmds: ['stronghold'], dim: 'the_end' },
  { name: 'the dragon', special: 'dragon' },
];
let autoRun = null;   // this brain's run; me.autoGen says which run is the live one (one at a time, across reloads)
me.autoGen ??= 0;
const live = () => autoRun && autoRun.gen === me.autoGen;
function untilEnd() { const [h, m] = ENDS_AT.split(':').map(Number), n = new Date(), t = new Date(n); t.setHours(h, m, 0, 0); if (t <= n) t.setDate(t.getDate() + 1); return t; }
async function waitIn() { while (!me.connected || !me.bot) { if (!live()) return false; await sleep(2000); } return true; }
async function run(cmd, why) {   // one command, as the worker would: guard first, then the bot; true when it finished without a failure
  if (!(await waitIn())) return false;
  const [v, ...a] = cmd.split(/\s+/);
  const g = PASSIVE.test(v) || BUILTIN[v] ? null : guardReason(me.bot);
  if (g) { log(`auto: "${cmd}" waits: ${g}`); await escape(); return false; }
  me.busy = `auto: ${cmd}`; me.abort = false;
  const t = Date.now(); let ok = true;
  const watch = PASSIVE.test(v) ? null : setInterval(() => { const w = me.connected && guardReason(me.bot); if (w && !me.abort) { log(`guard: stopping "${cmd}": ${w}`, { dc: true }); NOW.stop(); ok = false; } }, 3000);
  const seen = []; const tap = (l) => seen.push(l); ctx.taps.add(tap);
  try { await (BUILTIN[v] ? BUILTIN[v](a) : me.bot.act(v, a)); } catch (e) { ok = false; log(`auto: "${cmd}" failed: ${e.message}`); }
  finally { if (watch) clearInterval(watch); ctx.taps.delete(tap); me.busy = null; }
  if (seen.some((l) => /: (gave up|failed|could not|cannot|no way|not found|nothing to)|did not break|not under the crosshair/i.test(l))) ok = false;
  log(`auto: ${ok ? 'done' : 'not done'} "${cmd}"${why ? ` (${why})` : ''} in ${Math.round((Date.now() - t) / 1000)}s`, { dc: ok });
  return ok && !me.abort;
}
// away from builds and players: walk out in the direction with the fewest built blocks, further each time
let escapes = 0;
async function escape() {
  if (!(await waitIn())) return;
  escapes++; me.abort = false;
  { const q = me.bot.state().pos; if (me.dim === 'overworld' && Math.hypot(q.x, q.z) < FAR) return goFar(); }
  const p = me.bot.state().pos, b = scanBuilt(me.bot, 64), far = 160 + 80 * Math.min(escapes, 10);
  let best = null;
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
    const score = b.reduce((s, h) => s + h.n * Math.max(0, ((h.x - p.x) * dx + (h.z - p.z) * dz) / (h.d + 1)), 0);
    if (!best || score < best.score) best = { score, x: Math.round(p.x + dx * far), z: Math.round(p.z + dz * far) };
  }
  log(`auto: moving away from builds/players toward ${best.x} ${best.z}`, { dc: true });
  if (!live()) return;
  await BUILTIN.travel([String(best.x), String(best.z)]);
  // still on top of something someone built (a roof, a deck): step off it, every way, jumping
  if (guardReason(me.bot) && Math.hypot(me.bot.state().pos.x - p.x, me.bot.state().pos.z - p.z) < 3) {
    for (const yaw of [0, 90, 180, 270, 45, 135, 225, 315]) { await me.bot.act('look', [String(yaw), '0']); await me.bot.act('jump', []).catch(() => {}); await me.bot.act('walk', ['forward', '30']).catch(() => {}); if (Math.hypot(me.bot.state().pos.x - p.x, me.bot.state().pos.z - p.z) > 4) break; }
  }
}
// work far from everyone: the builds are around the world spawn, where a death also brings it back. Out to the work area
// (cfg.workArea, default 700 700) whenever it is closer than 450 to the spawn; things lost in a death are fetched on the way
// only when that death was out there too
const WORK = (cfg.workArea ?? '260 260').split(/\s+/).map(Number), FAR = cfg.farFromSpawn ?? 220;
// the way out of the spawn: south first (the builds east of it, x 40-95 z 20-45, are not walked through or near), then on
const WAYOUT = (cfg.wayOut ?? '8 130').split(/\s+/).map(Number);
async function goFar() {
  if (!(await waitIn()) || me.dim !== 'overworld') return;
  const p = me.bot.state().pos;
  if (Math.hypot(p.x, p.z) >= FAR) return;
  if (me.spawnSet && Math.hypot(p.x - me.spawnSet.x, p.z - me.spawnSet.z) < 64) return;
  log(`auto: near the spawn (${Math.round(p.x)} ${Math.round(p.z)}): out to the work area ${WORK.join(' ')} (by ${WAYOUT.join(' ')})`, { dc: true });
  for (let i = 0; i < 5 && live(); i++) {
    me.abort = false;
    const q0 = me.bot.state().pos;
    if (Math.hypot(q0.x, q0.z) < 100 && q0.z < WAYOUT[1] - 10) await BUILTIN.travel([String(WAYOUT[0]), String(WAYOUT[1])]);
    await BUILTIN.travel([String(WORK[0]), String(WORK[1])]);
    const q = me.bot.state().pos; if (Math.hypot(q.x, q.z) >= FAR) return;
  }
}
// a bed set down out in the work area and clicked: the respawn point is here from then on (a death no longer means the long
// walk back from the world spawn through the mobs there). Clicking a bed sets it at any time of day on Bedrock.
async function bedSpawn() {
  if (me.dim !== 'overworld' || me.spawnSet) return true;
  const bedOk = await run('get_bed 1', 'a bed');   // (Bedrock calls every colour's item minecraft:bed)
  if (!bedOk) return false;
  { // a spot two cells long on open ground beside it: air over something solid, for the foot and the head
    const q = me.bot.state().pos, X = Math.floor(q.x), Y = Math.floor(q.y), Z = Math.floor(q.z);
    const free = (x, y, z) => /air/.test(me.bot.world.block(x, y, z)?.name ?? '') && !/air|water|lava/.test(me.bot.world.block(x, y - 1, z)?.name ?? 'air');
    const spot = [[2, 0, 1, 0, 'east'], [-2, 0, -1, 0, 'west'], [0, 2, 0, 1, 'south'], [0, -2, 0, -1, 'north']].find(([dx, dz, hx, hz]) => free(X + dx, Y, Z + dz) && free(X + dx + hx, Y, Z + dz + hz));
    if (spot) await run(`place_bed ${X + spot[0]} ${Y} ${Z + spot[1]} ${spot[4]}`, 'set the bed down');
  }
  const p = me.bot.state().pos; let bed = null;
  for (let dx = -4; dx <= 4 && !bed; dx++) for (let dz = -4; dz <= 4 && !bed; dz++) for (let dy = -2; dy <= 2 && !bed; dy++) { const n = me.bot.world.block(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz)?.name ?? ''; if (/_bed$/.test(n)) bed = [Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz]; }
  if (!bed) { log('auto: the bed did not go down'); return false; }
  const seen = []; const tap = (l) => seen.push(l); ctx.taps.add(tap);
  await me.bot.act('useon', bed.map(String)).catch(() => {}); await sleep(1500); ctx.taps.delete(tap);
  me.spawnSet = { x: bed[0], y: bed[1], z: bed[2] };
  log(`auto: respawn point set at the bed ${bed.join(' ')}`, { dc: true });
  return true;
}
async function dragon() {
  if (me.dim !== 'the_end') return false;
  await sleep(4000);
  const d = [...me.bot.entities.values()].find((e) => e.type === 'minecraft:ender_dragon');
  if (d) return run('fight_ender_dragon', 'the dragon');
  log('auto: no dragon in the end (already killed on this server): going for the elytra', { dc: true });
  return elytra();
}
async function elytra() {
  // the outer islands: through an end gateway (an ender pearl thrown into it), then find an end city by its purpur and take the
  // elytra from the item frame on the ship; back home through the gateway and the exit portal
  for (let i = 0; i < 6 && live(); i++) {
    if (await run('get_elytra', 'elytra')) return true;
    if (!(await run('get_ender_pearl 4', 'pearls for the gateway'))) await sleep(5000);
  }
  return false;
}
async function auto() {
  log(`auto: start (goal: the dragon, or the elytra home; then diamonds until ${ENDS_AT})`, { dc: true });
  ctx.setLegit?.(true);
  for (const st of STEPS) {
    if (!live()) return;
    for (let tries = 0; live(); tries++) {
      await goFar();
      log(`auto: step "${st.name}"${tries ? ` (try ${tries + 1})` : ''}`, { dc: !tries });
      let ok = true;
      if (st.special === 'dragon') ok = await dragon();
      else if (st.special === 'bedspawn') ok = await bedSpawn();
      else if (st.food) { ok = false; for (const c of st.cmds) if (await run(c, st.name)) { ok = true; break; } }
      else for (const c of st.cmds) { const r = await run(c, st.name); if (!r && !st.optional) ok = false; }
      if (st.dim && me.dim !== st.dim) ok = false;
      if (ok || st.optional) break;
      if (me.deaths > (st.deaths ?? 0)) { st.deaths = me.deaths; const dp = me.bot?.deathPos?.(); if (!dp || Math.hypot(dp.x, dp.z) >= FAR) await run('goto_death', 'fetch the things back'); }
      if (tries >= 7 && !st.has) break;
      await sleep(3000);
    }
  }
  log('auto: goal reached — now diamonds until ' + ENDS_AT, { dc: true });
  const end = untilEnd();
  while (live() && Date.now() < end) {
    if (me.dim !== 'overworld') { await run('goto_death', 'home'); }
    await run('get_diamond 64', 'diamonds');
  }
  log('auto: finished', { dc: true });
}
const AUTOF = require('node:path').join(ctx.RUN, 'auto.json'), fsx = require('node:fs');
const autoMark = (on) => { try { fsx.writeFileSync(AUTOF, JSON.stringify({ on, at: new Date().toISOString() })); } catch { /* */ } };
BUILTIN.auto = async (a) => {
  if (a[0] === 'stop') { me.autoGen++; autoRun = null; autoMark(false); NOW.stop(); return log('auto: stopped', { dc: true }); }
  if (live()) return log('auto: already running');
  autoRun = { gen: ++me.autoGen }; autoMark(true); try { await auto(); } catch (e) { log('auto: error ' + e.message, { dc: true }); } finally { if (live()) autoMark(false); autoRun = null; }
};
// a watchdog: auto is meant to be running (auto.json) but no run is live and nothing is queued: start it again
timers.push(setInterval(() => {
  let on = false; try { on = JSON.parse(fsx.readFileSync(AUTOF, 'utf8')).on; } catch { /* */ }
  if (on && !live() && !me.queue.includes('auto') && me.connected && !String(me.busy ?? '').startsWith('auto')) { log('auto: not running though it should: starting it again'); me.queue.push('auto'); }
}, 30000));
// it was running when the bot last stopped: carry on (the run is not over until the goal and the hours are)
try { if (JSON.parse(fsx.readFileSync(AUTOF, 'utf8')).on) { me.queue.push('auto'); log('auto: resuming'); } } catch { /* never started */ }
NOW['auto'] = (a) => { if (a[0] === 'stop') return BUILTIN.auto(a); me.queue.push('auto'); };

worker();
return { command, status, dispose: () => { disposed = true; for (const t of timers) clearInterval(t); if (live()) { me.autoGen++; me.abort = true; me.bot?.act('stop', []).catch(() => {}); } autoRun = null; }, guardOn: () => guardOn, setGuard: (v) => { guardOn = v; } };
};
