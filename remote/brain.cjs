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
const PASSIVE = /^(auto|map|walk_xz|to_surface|shelter|goto|travel|walk|sprint|sneak|jump|swim|look|lookat|turn|pos|inv|near|stop|status|players|survey|around|help|guard|respawn|goto_death|wait|sleepms|leave|fly|land|crawl)$/;
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
  return { connected: me.connected, review: me.reviewPending ?? null, account: me.account, time: day, night: day === null ? null : day >= 12542 && day <= 23460, hostileNear: hostile, pos: { x: +s.pos.x.toFixed(1), y: +s.pos.y.toFixed(1), z: +s.pos.z.toFixed(1) }, dim: me.dim, hp: me.hp, food: me.food, dead: s.dead, deaths: me.deaths, busy: me.busy, queued: me.queue.length, guard: guardOn, players: b.players(), signIn: me.msa, uptime: Math.round((Date.now() - ctx.t0) / 1000) };
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
// ---------- learning from each death: a report, and the knob that cause points at turned one notch (run/adapt.json) ----------
const ADAPTF = require('node:path').join(ctx.RUN, 'adapt.json');
const AD = Object.assign({ drop: 4, breakAwayHp: 6, engageR: 5, nightStart: 12800, avoidWater: false, deaths: {} }, (() => { try { return JSON.parse(require('node:fs').readFileSync(ADAPTF, 'utf8')); } catch { return {}; } })());
AD.breakAwayHp = Math.min(AD.breakAwayHp, 8);   // (an earlier rule let it grow to 12: it fled from every fight)
const saveAD = () => { try { require('node:fs').writeFileSync(ADAPTF, JSON.stringify(AD, null, 1)); } catch { /* */ } };
function learn(cause, report) {
  AD.deaths[cause] = (AD.deaths[cause] ?? 0) + 1;
  const was = JSON.stringify({ drop: AD.drop, breakAwayHp: AD.breakAwayHp, engageR: AD.engageR, nightStart: AD.nightStart, avoidWater: AD.avoidWater });
  if (/fall/.test(cause)) AD.drop = Math.max(2, AD.drop - 1);                                   // fell: smaller drops count as cliffs
  if (/drown/.test(cause)) AD.avoidWater = true;                                                // drowned (or drowned mobs): keep out of water
  if (/arrow|skeleton|stray|bogged|pillager/.test(cause)) AD.engageR = Math.min(12, AD.engageR + 2);   // shot: go for shooters sooner
  // beaten in melee: break away earlier only when it had a weapon (unarmed, running from a zombie only gets it hit in the back:
  // review of 09:42); the cap stays low enough that it still fights
  if (/mob|zombie|spider|husk|drowned|creeper/.test(cause) && report.held) AD.breakAwayHp = Math.min(8, AD.breakAwayHp + 1);
  if (report.night) AD.nightStart = Math.max(11800, AD.nightStart - 300);                      // died at night: dig in earlier
  saveAD();
  const now = JSON.stringify({ drop: AD.drop, breakAwayHp: AD.breakAwayHp, engageR: AD.engageR, nightStart: AD.nightStart, avoidWater: AD.avoidWater });
  log(`death #${me.deaths} (${cause}) at ${report.at}${report.night ? ' at night' : ''}, hp before ${report.hpBefore}, held ${report.held || 'nothing'}, foes ${report.foes || 'none seen'}, doing "${report.busy || 'nothing'}" → ${was === now ? 'no knob to turn' : 'adjusted ' + now}`, { dc: true });
  try { require('node:fs').appendFileSync(require('node:path').join(ctx.RUN, 'deaths.jsonl'), JSON.stringify({ t: new Date().toISOString(), cause, ...report, knobs: AD }) + '\n'); } catch { /* */ }
}
let lastHp = null, lastFoes = '', lastHeld = '';
timers.push(setInterval(() => { const b = me.bot; if (!b || !me.connected) return; if (me.hp) lastHp = me.hp; const f = hostilesNear(b, 10); if (f.length) lastFoes = f.map((x) => `${x.e.type.replace('minecraft:', '')}@${x.d.toFixed(0)}`).join(' '); }, 500));
const deathTap = (l) => {
  const m = / died \(([^)]+)\)/.exec(l); if (!m || !me.bot) return;
  const p = me.bot.state().pos;
  learn(m[1].replace(/^death\.(attack|fell)\./, ''), { at: `${Math.round(p.x)} ${Math.round(p.y)} ${Math.round(p.z)}`, night: nightNow(me.bot), hpBefore: lastHp, held: lastHeld, foes: lastFoes, busy: me.busy });
  lastFoes = '';
  // after every death the run waits for a review (cfg.reviewDeaths, default on): the death is looked into and the bot improved
  // before it goes on (`resume`); meanwhile it only defends itself where it stands
  if (cfg.reviewDeaths !== false && me.reviewPending) { me.reviewPending.more = (me.reviewPending.more ?? 0) + 1; try { require('node:fs').writeFileSync(require('node:path').join(ctx.RUN, 'review.json'), JSON.stringify(me.reviewPending)); } catch { /* */ } }
  else if (cfg.reviewDeaths !== false) { me.reviewPending = { at: new Date().toISOString(), death: me.deaths + 1, cause: m[1] }; try { require('node:fs').writeFileSync(require('node:path').join(ctx.RUN, 'review.json'), JSON.stringify(me.reviewPending)); } catch { /* */ } log('auto: paused for a review of this death (resume when improved)', { dc: true }); }
};
ctx.taps.add(deathTap);
try { me.reviewPending ??= JSON.parse(require('node:fs').readFileSync(require('node:path').join(ctx.RUN, 'review.json'), 'utf8')); } catch { /* none */ }
async function reviewWait() { if (!me.reviewPending) return; me.abort = true; me.bot?.cancel?.(); while (me.reviewPending && !disposed) { const b = me.bot; const f = b && me.connected ? hostilesNear(b, 8) : []; if (f.length) await breakAway(b, f); else await sleep(2000); } me.abort = false; }
const nightNow = (b) => { const t = b.time?.(); if (t === null || t === undefined) return false; const d = ((t % 24000) + 24000) % 24000; return d >= AD.nightStart && d <= 23200; };
// the night out: dug in if it can be; if not (rock, nothing to build with), it does not stand there idle - it watches and fights
// (10:24-10:26: the shelter failed, it stood still 3 minutes with a stone sword in the inventory, three zombies, dead)
function shutIn(b) { const q = b.state().pos, X = Math.floor(q.x), Y = Math.floor(q.y), Z = Math.floor(q.z); const solid = (x, y, z) => { const n = b.world.block(x, y, z)?.name ?? 'air'; return !/air|water|lava|grass$|fern|flower|leaf_litter|snow_layer|torch|carpet/.test(n); }; return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => solid(X + dx, Y, Z + dz) && solid(X + dx, Y + 1, Z + dz)) && solid(X, Y + 2, Z); }
async function sitOutNight(b, stop = () => false) {
  // (shelter night: kept in until morning; a plain shelter went out again at once - 'armed and well' / its own later night start - and
  //  each new try dug 3 deeper: 70 down to 58 in 4 minutes)
  let failed = false; const tap = (l) => { if (/shelter: failed/.test(l)) failed = true; };
  const dig = async () => { failed = false; ctx.taps.add(tap); await b.act('shelter', ['night']).catch(() => {}); ctx.taps.delete(tap); };
  await dig();
  let warned = false, lastTry = Date.now();
  while (nightNow(b) && me.connected && !disposed && !stop()) {
    if (shutIn(b)) { await sleep(5000); continue; }
    if (!warned) { warned = true; log('night: not shut in: standing guard, sword in hand'); lastWeaponCheck = 0; await armUp(b).catch(() => {}); }
    const f = hostilesNear(b, 10);
    if (f.length) { if (me.armed && (me.hp ?? 20) > AD.breakAwayHp) await engage(b); else await breakAway(b, f); }
    else { await sleep(1000); if (failed && Date.now() - lastTry > 60000) { lastTry = Date.now(); await dig(); } }   // (after a failed dig-in only: another try a minute on, maybe on better ground; never a new hole after one that worked)
  }
}
async function walkTo(tx, tz, maxMs = 600000) {
  me.walkTick ??= 0;
  const deaths0 = me.deaths;   // (a death puts it back at the spawn: this walk's way is no longer the way; the caller plans again)
  if (me.walking && me.walking !== ctx) { log('travel: another walk is on (an older brain): calling it off'); me.abort = true; await sleep(1500); me.abort = false; }
  me.walking = ctx;
  const b = me.bot, t0 = Date.now();
  await b.act('option', ['autojump', 'on']).catch(() => {});
  let last = b.state().pos, lastT = Date.now(), turn = 0, stuckFor = 0, builtTurns = 0, dropTurns = 0;
  // progress, not movement: going back and forth (up a slope and back down, round a pit's edge) moves but gets nowhere
  let bestLeft = Infinity, bestT = Date.now();
  await b.act('sprint', ['on']).catch(() => {});
  try {
    while (!me.abort && !disposed && me.connected && Date.now() - t0 < maxMs && me.deaths === deaths0 && !me.reviewPending) {
      const p = b.state().pos, dx = tx - p.x, dz = tz - p.z;
      if (Math.hypot(dx, dz) < 3) return true;
      const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI + turn, r = (yaw * Math.PI) / 180;
      const ax = Math.floor(p.x - Math.sin(r) * 1.6), az = Math.floor(p.z + Math.cos(r) * 1.6);
      let drop = 0;
      for (let y = Math.floor(p.y) - 1; y > Math.floor(p.y) - 7; y--) { const n = b.world.block(ax, y, az)?.name; if (n === undefined || !/^minecraft:(air|cave_air)$/.test(n)) break; drop++; }
      // (water ahead counts too once it has drowned)
      if (AD.avoidWater && /water/.test(b.world.block(ax, Math.floor(p.y), az)?.name ?? '')) drop = 9;
      // (every way a drop or water - in a lake, on a peak: turning round and round without a pause froze the whole process; after a
      //  full turn it goes on anyway)
      if (drop >= AD.drop && dropTurns < 8) { dropTurns++; turn += turn >= 0 ? 45 : -45; if (Math.abs(turn) > 180) turn = -turn % 180; await sleep(30); continue; }
      dropTurns = 0;
      // the rule while walking too: someone's build within 5 blocks ahead is not walked into or along; steer off it
      // (already among builds, every way has one: then just get out, the shortest way, and steer again once clear)
      if (guardOn && builtTurns < 11 && builtAhead(b, p, r)) { builtTurns++; turn += turn >= 0 ? 35 : -35; if (Math.abs(turn) > 180) turn = -turn % 180; await sleep(50); continue; }
      if (builtTurns >= 11 && !guardReason(b)) builtTurns = 0; else if (builtTurns < 11) builtTurns = 0;
      // the night out in the open, no armour: dug in until morning (the way RTA players sit out the night), then on
      if (nightNow(b) && me.dim === 'overworld' && !guardReason(b)) { await b.act('sprint', ['off']).catch(() => {}); log('travel: night: digging in until morning', { dc: true }); await sitOutNight(b, () => me.abort); log('travel: morning: on'); last = b.state().pos; lastT = Date.now(); continue; }
      if (me.armed && hostilesNear(b, AD.engageR).length) { await b.act('sprint', ['off']).catch(() => {}); await engage(b); last = b.state().pos; lastT = Date.now(); continue; }   // (unarmed: it keeps running on its way)
      await b.act('look', [String(yaw.toFixed(1)), '0']).catch(() => {});
      await b.act('sprint', ['on']).catch(() => {});
      await sleep(400);
      if (Date.now() - lastT > 3000) {
        const moved = Math.hypot(p.x - last.x, p.z - last.z), left = Math.hypot(dx, dz);
        if (left < bestLeft - 2) { bestLeft = left; bestT = Date.now(); }
        const noProgress = Date.now() - bestT > 20000;
        if (noProgress) { bestT = Date.now(); log(`travel: 20 s without getting closer (${Math.round(left)} to go): taking it as stuck`); }
        if (moved < 1.5 || noProgress) {
          stuckFor++; await b.act('jump', []).catch(() => {});
          // still nowhere after a few tries and nobody's build near: dig the way ahead (natural ground only), as a person would
          if (stuckFor >= 3 && !guardReason(b)) {
            const ry = ((Math.atan2(-dx, dz) * 180) / Math.PI) * Math.PI / 180; let fx = Math.floor(p.x - Math.sin(ry) * 1.1), fz = Math.floor(p.z + Math.cos(ry) * 1.1);
            if (fx === Math.floor(p.x) && fz === Math.floor(p.z)) { fx = Math.floor(p.x - Math.sin(ry) * 1.8); fz = Math.floor(p.z + Math.cos(ry) * 1.8); }   // (1.1 ahead was still its own cell at 157 129: 'not under the crosshair' x8)
            for (const y of [Math.floor(p.y) + 1, Math.floor(p.y)]) { const n = b.world.block(fx, y, fz)?.name ?? ''; if (n && !/air|water|lava|bedrock/.test(n)) await b.act('dig', [String(fx), String(y), String(fz)]).catch(() => {}); }
            turn = 0;
          } else turn = (stuckFor % 2 ? 1 : -1) * Math.min(150, 40 * stuckFor);
        }
        else { stuckFor = 0; turn = Math.abs(turn) < 10 ? 0 : turn * 0.5; }
        last = p; lastT = Date.now();
        if (++me.walkTick % 10 === 0) log(`travel: at ${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}, ${Math.round(Math.hypot(dx, dz))} to go${stuckFor ? ` (stuck ${stuckFor})` : ''}`);
        if (stuckFor === 6 && !guardReason(b) && !openSky(b, p)) { log('travel: stuck under the ground, going up first'); await b.act('to_surface', []).catch(() => {}); if (!openSky(b, b.state().pos)) await handStairs(tx, tz); }
        if (stuckFor >= 7) { log('travel: the straight walk is stuck: over to the path search'); return false; }   // (travel's walk_xz found the way that the straight walk never did)
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
    if (me.reviewPending) { log('travel: a death waits for its review: not walking now'); return; }
    if (await walkTo(tx, tz)) { const r = me.bot.state().pos; log(`travel: arrived ${r.x.toFixed(0)} ${r.y.toFixed(0)} ${r.z.toFixed(0)}`, { dc: true }); return; }
    if (me.abort || disposed) return;
    const deaths0 = me.deaths;
    for (let i = 0; i < 400 && !me.abort && !disposed && me.deaths === deaths0 && !me.reviewPending; i++) {
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
  // the review of the last death is done (and the improvement in): go on
  resume: () => { me.reviewPending = null; try { require('node:fs').unlinkSync(require('node:path').join(ctx.RUN, 'review.json')); } catch { /* */ } log('auto: review done, going on', { dc: true }); },
  quit: () => ctx.quit(),
  // leave and start again with the newest bdslab (a change to realplayer.cjs or bot.cjs needs it): one leave and one join
  restart: () => { log('restarting with the newest bdslab: leaving and joining once', { dc: true }); try { me.bot?.close(); } catch { /* */ } setTimeout(() => process.exit(75), 1500); },
};
// handled at once, even while something runs
const NOW = {
  stop: () => { me.abort = true; me.queue.length = 0; me.bot?.cancel?.(); me.bot?.act('stop', []).catch(() => {}); log('stopped (queue cleared)'); },
  clear: () => { me.queue.length = 0; log('queue cleared'); },
  status: BUILTIN.status, players: BUILTIN.players, survey: BUILTIN.survey, around: BUILTIN.around, map: BUILTIN.map, help: BUILTIN.help, quit: BUILTIN.quit, guard: BUILTIN.guard, update: BUILTIN.update, reload: BUILTIN.reload, restart: BUILTIN.restart, resume: BUILTIN.resume, reconnect: BUILTIN.reconnect,
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

// ---------- combat: fight like a PvP player, not just swing back ----------
// best weapon in hand; close in on the nearest hostile (strafing a little, as a player does against arrows); hit only when it is
// under the crosshair in reach (legit); a creeper is hit once and backed off from; low on health: break away, sprinting from them,
// and eat. Runs whenever no goal verb is fighting for itself (get_/kill_ have their own reflexes), and inside long walks.
const WEAPONS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'];
let fighting = false, lastWeaponCheck = 0;
// armed or not, from the inventory every 15 s and at once after a death (nothing is carried after one)
me.armed = me.armed ?? false;
timers.push(setInterval(async () => { const b = me.bot; if (!b || !me.connected || fighting) return; const inv = await invList(b); me.armed = WEAPONS.some((w) => inv.includes('minecraft:' + w + '*')); me.armored = /_chestplate\*/.test(inv); }, 15000));
ctx.taps.add(deathArmTap);
function deathArmTap(l) { if (/ died \(/.test(l)) me.armed = false; }
// in sight: nothing solid on the straight line from the eyes to its middle (a mob behind a wall is not fought: it cannot be reached)
const inSight = (b, P, x) => { const ex = P.x, ey = P.y + 1.62, ez = P.z, tx = x.x, ty = x.y + 0.9, tz = x.z, n = Math.ceil(Math.hypot(tx - ex, ty - ey, tz - ez) * 3);
  for (let i = 1; i < n; i++) { const f = i / n, nm = b.world.block(Math.floor(ex + (tx - ex) * f), Math.floor(ey + (ty - ey) * f), Math.floor(ez + (tz - ez) * f))?.name ?? 'minecraft:air'; if (!/air|water|grass|fern|flower|leaf_litter|snow_layer|vine|torch|sapling|bush/.test(nm)) return false; } return true; };
const hostilesNear = (b, r) => { const P = b.state().pos; return [...b.entities.values()].filter((x) => HOSTILE.test(x.type ?? '') && Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) < r && inSight(b, P, x)).map((x) => ({ e: x, d: Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) })).sort((p, q) => p.d - q.d); };
async function invList(b) { if (b.invText) { try { return b.invText(); } catch { /* fall back */ } } const seen = []; const tap = (l) => seen.push(l); ctx.taps.add(tap); await b.act('inv', []).catch(() => {}); ctx.taps.delete(tap); return seen.join(' '); }
async function armUp(b) {
  if (Date.now() - lastWeaponCheck < 30000) return; lastWeaponCheck = Date.now();
  const inv = await invList(b), w = WEAPONS.find((x) => inv.includes('minecraft:' + x + '*'));
  lastHeld = w ?? '';
  if (w && !new RegExp(`\\d+:minecraft:${w}\\*\\d+[^|]*\\(holding slot`).test(inv)) await b.act('hold_' + w, []).catch(() => {});
}
async function breakAway(b, foes) {
  const P = b.state().pos; let ax = 0, az = 0; for (const f of foes) { ax += P.x - f.e.x; az += P.z - f.e.z; }
  const yaw = (Math.atan2(-ax, az) * 180) / Math.PI;
  log(`fight: ${me.armed ? `health ${me.hp}` : 'unarmed'}: breaking away from ${foes.length} (${foes.map((f) => f.e.type.replace('minecraft:', '')).join(' ')})`);
  // in water (a drowned's home): looking level and sprinting barely moves; head up and swim (jump) away, toward air
  const wet = /water/.test(b.world.block(Math.floor(P.x), Math.floor(P.y), Math.floor(P.z))?.name ?? '') || /water/.test(b.world.block(Math.floor(P.x), Math.floor(P.y) + 1, Math.floor(P.z))?.name ?? '');
  await b.act('look', [yaw.toFixed(0), wet ? '-35' : '0']).catch(() => {});
  await b.act('sprint', ['on']).catch(() => {}); await b.act('option', ['autojump', 'on']).catch(() => {});
  if (wet) { for (let i = 0; i < 8; i++) { await b.act('jump', []).catch(() => {}); await sleep(250); } }
  await sleep(me.armed ? 2500 : 5000); await b.act('sprint', ['off']).catch(() => {});
  if (me.armed) await b.act('eat', []).catch(() => {});
}
async function engage(b, maxMs = 12000) {
  if (fighting) return; fighting = true;
  const t0 = Date.now(); let strafe = 1;
  try {
    while (Date.now() - t0 < maxMs && me.connected && !b.state().dead) {
      const foes = hostilesNear(b, 7); if (!foes.length) return;
      // nothing to fight with: no fist fight against a zombie (20 health against 1 a punch) - run, sprinting, they are slower
      if (!me.armed || (me.hp !== null && me.hp <= AD.breakAwayHp)) { await breakAway(b, foes); return; }
      const { e, d } = foes[0], kind = e.type.replace('minecraft:', '');
      await armUp(b);
      if (/creeper/.test(kind) && d < 3.2) { await b.act('attack', [kind]).catch(() => {}); await b.act('look', [String((((Math.atan2(-(b.state().pos.x - e.x), b.state().pos.z - e.z)) * 180) / Math.PI).toFixed(0)), '0']).catch(() => {}); await b.act('sprint', ['on']).catch(() => {}); await sleep(1200); await b.act('sprint', ['off']).catch(() => {}); continue; }
      if (d > 2.7) {   // close in, a little to the side each time (arrows)
        const P = b.state().pos, yaw = (Math.atan2(-(e.x - P.x), e.z - P.z) * 180) / Math.PI + (/skeleton|stray|bogged|pillager/.test(kind) ? 25 * (strafe = -strafe) : 0);
        await b.act('look', [yaw.toFixed(0), '0']).catch(() => {});
        await b.act('sprint', ['6']).catch(() => {});
        continue;
      }
      await b.act('attack', [kind]).catch(() => {});
      await sleep(350);   // (a full swing: 1.9+ style timing hits harder with a sword)
    }
  } finally { fighting = false; }
}
// a goal verb under way is cut short (cancel) when the night comes with no armour on, or a hostile closes in that is in sight:
// then this brain deals with it (dig in / fight) and the step is tried again (review of death 09:10: a cow hunt went on into the
// night, a creeper was run from and a drowned killed it with a stone sword unused in the inventory)
timers.push(setInterval(() => {
  const b = me.bot; if (!b || !me.connected || fighting || me.interrupt || b.state().dead) return;
  if (!/^auto: (get|kill|mine)_/.test(String(me.busy ?? ''))) return;
  if (me.dim === 'overworld' && nightNow(b) && !me.armored && !guardReason(b)) { me.interrupt = 'night'; log('auto: night falls mid-task: stopping to dig in', { dc: true }); b.cancel?.(); return; }
  const f = hostilesNear(b, 4).filter((x) => !/creeper/.test(x.e.type) || x.d < 3);
  if (f.length) { me.interrupt = 'fight'; b.cancel?.(); }
}, 400));
timers.push(setInterval(() => {
  const b = me.bot; if (!b || !me.connected || fighting || b.state().dead) return;
  if (/^auto: (get|kill|mine|fight|stronghold)_?/.test(String(me.busy ?? ''))) return;   // (a goal verb fights for itself)
  const f = hostilesNear(b, AD.engageR); if (!f.length) return;
  engage(b).catch(() => {});
}, 500));
const skipUntil = new Map();


// ---------- auto: the whole run on its own (`auto` starts it, `auto stop` ends it) ----------
// away from builds and players → stone tools → iron gear, bucket, food → eyes of ender (the nether) → the stronghold → the dragon;
// the dragon already gone → the elytra (end gateway, end city); afterwards diamonds, as many as can be mined, until ENDS_AT.
// Every step is retried; a death is followed by fetching the things back; a guard stop by moving away first.
const ENDS_AT = cfg.autoUntil ?? '08:00';   // local time to keep going until (after the goal)
const STEPS = [
  { name: 'stone tools', cmds: ['get_wooden_sword', 'get_stone_pickaxe', 'get_stone_sword', 'get_stone_axe'], has: ['stone_pickaxe', 'stone_sword'] },   // (a weapon before anything: every death so far was with nothing in hand)
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
  await reviewWait();
  if (!(await waitIn())) return false;
  await safeStart();
  const [v, ...a] = cmd.split(/\s+/);
  const g = PASSIVE.test(v) || BUILTIN[v] ? null : guardReason(me.bot);
  if (g) { log(`auto: "${cmd}" waits: ${g}`); await escape(); return false; }
  me.busy = `auto: ${cmd}`; me.abort = false;
  const t = Date.now(); let ok = true;
  const watch = PASSIVE.test(v) ? null : setInterval(() => { const w = me.connected && guardReason(me.bot); if (w && !me.abort) { log(`guard: stopping "${cmd}": ${w}`, { dc: true }); NOW.stop(); ok = false; } }, 3000);
  const seen = []; const tap = (l) => seen.push(l); ctx.taps.add(tap);
  try { await (BUILTIN[v] ? BUILTIN[v](a) : me.bot.act(v, a)); } catch (e) { ok = false; log(`auto: "${cmd}" failed: ${e.message}`); }
  finally { if (watch) clearInterval(watch); ctx.taps.delete(tap); me.busy = null; }
  if (me.interrupt) {
    const why = me.interrupt; me.interrupt = null; ok = false;
    if (why === 'night') { await sitOutNight(me.bot, () => !!me.reviewPending); log('auto: morning: back to work'); }
    if (why === 'fight') await engage(me.bot);
  }
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
const WAYOUT = (cfg.wayOut ?? '0 60').split(/\s+/).map(Number);   // (8 130 led over a drowned cave at -24 43 107 it fell into twice)
// before work: not down in a cave (up to the sky first), and not out in the night with nothing to fight with (dug in until morning)
// (the death of 08:53 under review: a goal started in a drowned cave at night, unarmed, and a skeleton shot it there)
async function safeStart() {
  const b = me.bot; if (!b || me.dim !== 'overworld' || guardReason(b)) return;
  const lastInv = nightNow(b) ? await invList(b) : '';
  if (!openSky(b, b.state().pos)) { log('auto: under the ground: up to the sky before working'); await b.act('to_surface', []).catch(() => {}); if (!openSky(b, b.state().pos)) await handStairs(b.state().pos.x + 8, b.state().pos.z); }
  me.armored = /_chestplate\*/.test(lastInv || (await invList(b)));
  if (nightNow(b) && !me.armored) { log('auto: night and no armour: dug in until morning', { dc: true }); await sitOutNight(b); }
}
async function goFar() {
  await reviewWait();
  if (!(await waitIn()) || me.dim !== 'overworld') return;
  const p = me.bot.state().pos;
  if (Math.hypot(p.x, p.z) >= FAR) return;
  if (me.spawnSet && Math.hypot(p.x - me.spawnSet.x, p.z - me.spawnSet.z) < 64) return;
  log(`auto: near the spawn (${Math.round(p.x)} ${Math.round(p.z)}): out to the work area ${WORK.join(' ')} (by ${WAYOUT.join(' ')})`, { dc: true });
  for (let i = 0; i < 5 && live(); i++) {
    await reviewWait(); if (!(await waitIn())) return;
    me.abort = false;
    const q0 = me.bot.state().pos;
    if (Math.hypot(q0.x, q0.z) < 60 && q0.z < WAYOUT[1] - 10) await BUILTIN.travel([String(WAYOUT[0]), String(WAYOUT[1])]);
    await BUILTIN.travel([String(WORK[0]), String(WORK[1])]);
    const q = me.bot.state().pos; if (Math.hypot(q.x, q.z) >= FAR) return;
  }
}
// a bed set down out in the work area and clicked: the respawn point is here from then on (a death no longer means the long
// walk back from the world spawn through the mobs there). Clicking a bed sets it at any time of day on Bedrock.
async function bedSpawn() {
  if (me.dim !== 'overworld' || me.spawnSet) return true;
  // three wool of one colour (sheep come in several): sheep until some colour has three, then the bed of that colour from the
  // inventory (get_bed plans for white wool only)
  const woolCounts = async () => { const seen = []; const tap = (l) => seen.push(l); ctx.taps.add(tap); await me.bot.act('inv', []).catch(() => {}); ctx.taps.delete(tap);
    const m = new Map(); for (const l of seen) for (const x of l.matchAll(/minecraft:(\w+_wool)\*(\d+)/g)) m.set(x[1], (m.get(x[1]) ?? 0) + Number(x[2])); return m; };
  let bedOk = false;
  for (let i = 0; i < 10 && live() && !bedOk; i++) {
    if ([...(await woolCounts()).values()].some((n) => n >= 3)) { bedOk = await run('craft_bed', 'the bed from three of one colour'); break; }
    await run('kill_sheep 1', 'wool for a bed');
  }
  if (!bedOk) bedOk = await run('get_bed 1', 'a bed');
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
      await reviewWait();
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
return { command, status, dispose: () => { disposed = true; ctx.taps.delete(deathTap); ctx.taps.delete(deathArmTap); for (const t of timers) clearInterval(t); if (live()) { me.autoGen++; me.abort = true; me.bot?.act('stop', []).catch(() => {}); } autoRun = null; }, guardOn: () => guardOn, setGuard: (v) => { guardOn = v; } };
};
