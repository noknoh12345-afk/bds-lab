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
const BUILT = /planks|glass|crafting_table|chest|barrel|_bed$|torch|lantern|wool|(?<!moss_)carpet|concrete|bricks|_slab|_stairs|_door|fence|furnace|smoker|anvil|_sign|bookshelf|rail|redstone_(wire|torch|lamp|block)|repeater|comparator|piston|hopper|composter|lectern|scaffolding|ladder|banner|bell|item_frame|shulker_box|enchanting_table|brewing_stand|beacon|quartz_block|smooth_stone|polished_|cut_|_wall$|campfire|flower_pot|candle|lever|_button|pressure_plate|observer|dispenser|dropper|tnt|(?<!raw_)iron_block|(?<!raw_)gold_block|diamond_block|emerald_block|(?<!raw_)copper_block|hay_block|glazed_terracotta|stained|sea_lantern|end_rod/;
// actions that only move or look: allowed anywhere (they change nothing)
const PASSIVE = /^(auto|restore|bed|bedat|standtest|blk|nightsit|stash|dragon|seal|map|walk_xz|to_surface|shelter|goto|travel|walk|sprint|sneak|jump|swim|look|lookat|turn|pos|inv|near|stop|status|players|survey|around|help|guard|respawn|goto_death|wait|sleepms|leave|fly|land|crawl)$/;
let guardOn = ctx.guardOn ?? true;
const HOSTILE = /^minecraft:(zombie|husk|drowned|skeleton|stray|bogged|spider|cave_spider|creeper|witch|slime|magma_cube|zombie_villager_v2|pillager|vindicator|silverfish|phantom|blaze|wither_skeleton|piglin_brute|hoglin|ghast|endermite|breeze)$/;
function scanBuilt(bot, R) {
  const p = bot.state().pos, X = Math.floor(p.x), Y = Math.floor(p.y), Z = Math.floor(p.z), hits = new Map(), marks = new Set();
  me.marks = marks;
  for (let x = X - R; x <= X + R; x += 1) for (let z = Z - R; z <= Z + R; z += 1) {
    if ((x - X) ** 2 + (z - Z) ** 2 > R * R) continue;
    for (let y = Math.max(-64, Y - 24); y <= Y + 24; y++) {
      const id = bot.world.block(x, y, z)?.name;
      if (id && MARKER.test(id)) marks.add(MARKER.exec(id)[1]);
      if (id && BUILT.test(id) && !bot.placedByMe?.has(`${x},${y},${z}`)) { const k = id.replace('minecraft:', ''); const h = hits.get(k); if (h) { h.n++; h.top = Math.max(h.top, y); } else hits.set(k, { n: 1, top: y, x, y, z, d: Math.round(Math.hypot(x - X, z - Z)) }); }
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
// What the world generated itself is not someone's build (the user, 11/16 16:30: villages, shipwrecks, ruined portals, fortresses and
// strongholds may be used). Told apart by what only generation leaves and no player-only block near; in doubt it is someone's.
//   village: two or more villagers, a path or a bell, away from the world spawn's hub  ·  ruined portal: crying obsidian
//   stronghold: mossy and cracked stone bricks together under the ground, or a portal frame  ·  the Nether and the End: all of it
const MARKER = /^minecraft:(grass_path|bell|crying_obsidian|mossy_stone_bricks|cracked_stone_bricks|end_portal_frame|infested_\w+|web|trial_spawner|vault|reinforced_deepslate|sculk_shrieker|mob_spawner)$/;
const PLAYER_ONLY = /shulker|beacon|concrete|redstone|repeater|comparator|piston|hopper|rail|enchanting_table|ender_chest|item_frame|banner|_sign|scaffolding|quartz|glass_pane|stained_glass/;
function naturalHere(bot, hits) {
  // (an abandoned mineshaft: cobwebs, and nothing but its own timber, rails, torches and chests, all of it under the ground;
  //  raw ore blocks of a vein are the world's too: they are not in BUILT)
  if (me.dim === 'overworld' && (me.marks ?? new Set()).has('web') && hits.length && hits.every((h) => h.top < 50 && /^((dark_)?oak_(planks|fence)|rail|torch|chest)$/.test(h.block))) return 'mineshaft';
  // (a trial chamber by its own blocks when its spawners are out of the scan: all of it deep, tuff and copper among it, its hoppers and
  //  dispensers too - 11/20 in the lab at y 6 over its tuff bricks at -18, then a hopper of it at -25)
  if (me.dim === 'overworld' && hits.every((h) => h.top < 10 && /^(tuff_bricks|polished_tuff|chiseled_tuff(_bricks)?|(polished_)?tuff(_brick)?_(slab|stairs|wall|double_slab)|(waxed_)?(exposed_|weathered_|oxidized_)?(cut_copper(_slab|_stairs)?|copper_(block|grate|bulb|door|trapdoor)|chiseled_copper)|\w+_glazed_terracotta|decorated_pot|(\w+_)?candle|chest|barrel|dispenser|hopper|redstone_(wire|torch)|(\w+_)?button|(\w+_)?pressure_plate|lever)$/.test(h.block)) && hits.some((h) => /tuff|copper/.test(h.block))) return 'trial chamber';
  if (hits.some((h) => PLAYER_ONLY.test(h.block))) return null;
  if (me.dim !== 'overworld') return me.dim;
  const p = bot.state().pos, m = me.marks ?? new Set();
  if (m.has('end_portal_frame') || (p.y < 55 && m.has('mossy_stone_bricks') && m.has('cracked_stone_bricks'))) return 'stronghold';
  // (and seen from the ground over it: only its own kinds of block, all of them deep - 11/20 in the lab the guard stopped `stronghold`
  //  at the surface, 47 blocks off its stone bricks at y 48)
  if ((m.has('mossy_stone_bricks') || m.has('cracked_stone_bricks')) && hits.every((h) => h.top < 55 && /^(stone_bricks|mossy_stone_bricks|cracked_stone_bricks|chiseled_stone_bricks|(mossy_)?stone_brick_(stairs|slab|wall)|stone_brick_double_slab|smooth_stone(_slab)?|stone_slab\d?|iron_bars|iron_door|wooden_door|oak_door|torch|wall_torch|bookshelf|oak_planks|oak_fence|chest|ladder|stone_button|web)$/.test(h.block))) return 'stronghold';
  if (m.has('crying_obsidian')) return 'ruined portal';
  // (deep under the ground by what no player can have: a trial chamber's spawners and vaults, an ancient city's reinforced deepslate
  //  and shriekers - 11/20 in the lab a dig down to the diamonds was stopped at y 6 by a trial chamber's polished tuff 35 blocks off;
  //  a dungeon: its chests and nothing else built, by a spawner)
  if (hits.every((h) => h.top < 20) && (['trial_spawner', 'vault', 'reinforced_deepslate', 'sculk_shrieker'].some((k) => m.has(k)) || hits.slice(0, 2).some((h) => {   // (or beside what was seen, below the scan)
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let dy = -8; dy <= 8; dy++) if (/^minecraft:(trial_spawner|vault|reinforced_deepslate|sculk_shrieker)$/.test(bot.world.block(h.x + dx, h.y + dy, h.z + dz)?.name ?? '')) return true;
    return false; }))) return 'trial chamber or ancient city';
  if (m.has('mob_spawner') && hits.every((h) => h.top < 50 && /^(chest|trapped_chest)$/.test(h.block))) return 'dungeon';
  const folk = [...bot.entities.values()].filter((e) => /^minecraft:(villager_v2|iron_golem)$/.test(e.type) && Math.hypot(e.x - p.x, e.z - p.z) < 80).length;
  if (folk >= 2 && (m.has('grass_path') || m.has('bell')) && Math.hypot(p.x, p.z) > 200) return 'village';
  return null;
}
function guardReason(bot) {
  if (!guardOn || !bot) return null;
  const R = cfg.guardRadius, pl = nearPlayers(bot, R);
  if (pl.length) return `player ${pl[0].name} ${pl[0].d} blocks away`;
  const b = scanBuilt(bot, Math.min(R, 64));
  if (b.length) {
    // (what was once seen to be the world's stays the world's: a dungeon's chest is no one's build once its spawner is out of the scan -
    //  11/20 in the lab 'a dungeon here', and twenty seconds on 'someone's build (chest@-133,33,330)')
    const key = (h) => `${h.block}@${Math.floor(h.x / 16)},${Math.floor(h.z / 16)}`;
    me.naturalAt ??= new Map();
    let nat = naturalHere(bot, b);
    if (!nat && b.every((h) => me.naturalAt.has(key(h)))) nat = me.naturalAt.get(key(b[0]));
    if (nat) { for (const h of b.slice(0, 40)) me.naturalAt.set(key(h), nat); if (me.naturalAt.size > 4000) me.naturalAt.clear();
      if (me.natural !== nat) { me.natural = nat; log(`guard: a ${nat} here (generated by the world, nobody's build): free to work in`, { dc: true }); } return null; }
  }
  me.natural = null;
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
  if (/drown/.test(cause) || /drowned/.test(report.foes ?? '')) AD.avoidWater = true;   // drowned, or killed by drowned (14:42 and 10:16, the same pond at 157-166 62 109-129)                                                // drowned (or drowned mobs): keep out of water
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
  const lastFoesAtDeath = lastFoes; lastFoes = '';
  // after every death the run waits for a review (cfg.reviewDeaths, default on): the death is looked into and the bot improved
  // before it goes on (`resume`); meanwhile it only defends itself where it stands
  if (cfg.reviewDeaths !== false && me.reviewPending) { me.reviewPending.more = (me.reviewPending.more ?? 0) + 1; try { require('node:fs').writeFileSync(require('node:path').join(ctx.RUN, 'review.json'), JSON.stringify(me.reviewPending)); } catch { /* */ } }
  else { const rv = { at: new Date().toISOString(), death: me.deaths + 1, cause: m[1], inv: lastInvText, night: nightNow(me.bot), foes: lastFoesAtDeath }; const dp = me.bot.deathPos?.() ?? me.bot.state().pos; if (me.fetching) { me.abort = true; me.bot?.cancel?.(); return; } fetchThenReview({ x: dp.x, y: dp.y, z: dp.z, t: Date.now() }, rv); }
};
ctx.taps.add(deathTap);
// what it had falls where it died and lies there five minutes: it goes back for it first (a person would), then the review
// (until 15:44 it never did: goto_death only after a step failed, and only for 40 s - 99 deaths, every sword and pickaxe lost)
const REMAKE = [[/netherite|elytra|ender_eye|ender_pearl|blaze_rod|diamond/, 900], [/iron_(pickaxe|sword|axe|shovel|helmet|chestplate|leggings|boots)|shield|bucket|flint_and_steel/, 300], [/iron_ingot|raw_iron|gold_ingot/, 45], [/_bed\b|^bed\b/, 180], [/_wool/, 40], [/cooked_|bread|baked_potato/, 20], [/beef|porkchop|mutton|chicken|rabbit|cod|salmon/, 12], [/stone_(pickaxe|sword|axe|shovel)/, 25], [/wooden_(pickaxe|sword|axe|shovel)/, 35], [/coal|torch/, 8], [/furnace|crafting_table/, 10], [/log|planks|stick|cobblestone|dirt/, 0.5]];
function remakeSeconds(inv) { let s = 0; for (const m of String(inv).matchAll(/minecraft:(\w+)\*(\d+)/g)) { const r = REMAKE.find(([re]) => re.test(m[1])); if (r) s += r[1] * (r[1] >= 25 && !/ingot|raw_|wool|cooked|beef|pork|mutton|chicken|coal|torch|log|planks|stick|cobble|dirt|ender_eye|pearl|blaze/.test(m[1]) ? 1 : Math.min(+m[2], 64)); } return s; }
let lastInvText = '';
timers.push(setInterval(() => { const b = me.bot; if (b && me.connected && !b.state().dead) { const t = b.invText?.(); if (t && !/^inv empty/.test(t)) lastInvText = t; } }, 3000));
async function fetchThenReview(dp, rv) {
  me.fetching = true; me.abort = true; me.bot?.cancel?.();
  try {
    await sleep(2500);   // (respawned, and the old work has stopped)
    const b = me.bot; if (!b || !me.connected) return;
    const q = b.state().pos, far = Math.hypot(q.x - dp.x, q.z - dp.z);
    // (a circuit breaker: back to the same place at most twice in 20 minutes - a recovery that keeps walking into what killed it only
    //  feeds the loop: one bot elsewhere was sent back into a camp 226 times)
    me.fetchLog = (me.fetchLog ?? []).filter((f) => Date.now() - f.t < 1200000);
    if (me.fetchLog.filter((f) => !f.ok && Math.hypot(f.x - dp.x, f.z - dp.z) < 32).length >= 2)   // (trips that brought nothing back; one that did is no loop)
      { log('death: not going back - twice to that place already in the last 20 minutes'); return; }
    if (me.dim !== 'overworld' || far > 450) { log(`death: my things lie ${Math.round(far)} blocks off: too far to reach in time`); return; }
    // which is faster: the walk back, or making it all again? (seconds to make each again, from the plans' own times on this server:
    // a stone tool 15-40 s, a wooden sword ~40 s, a bed ~3 min with the sheep, iron minutes of mining and smelting)
    const go = far / 4.5 + 20, inv = rv.inv ?? '', val = remakeSeconds(inv), danger = rv.night && /zombie|skeleton|spider|creeper|drowned|husk|stray|witch/.test(rv.foes ?? '') && !me.armed;
    if (go > val || danger) { log(`death: not going back (${Math.round(far)} blocks ≈ ${Math.round(go)} s${danger ? ', at night with them still there and nothing in hand' : ''}; making it again ≈ ${Math.round(val)} s)`, { dc: true }); return; }
    log(`death: back for my things at ${Math.round(dp.x)} ${Math.round(dp.y)} ${Math.round(dp.z)} (${Math.round(far)} blocks, ${Math.round((300000 - (Date.now() - dp.t)) / 1000)} s before they vanish)`, { dc: true });
    const trip = { x: dp.x, z: dp.z, t: Date.now(), ok: false }; me.fetchLog.push(trip);   // (counted when it does go)
    me.abort = false; me.fetchArmed = WEAPONS.some((w) => inv.includes('minecraft:' + w + '*'));   // (a weapon lies there: no making one on the way)
    const stop = setTimeout(() => { me.abort = true; b.cancel?.(); }, Math.max(10000, 285000 - (Date.now() - dp.t)));
    try {
      if (far > 6) await BUILTIN.travel([String(Math.round(dp.x)), String(Math.round(dp.z))]);
      // (the dropped things show up a moment after the chunk does: up to 6 s for the first of them - 'back with empty' was this;
      //  then each is walked onto and waited for until the server has taken it off the ground)
      const lying = () => { const p = b.state().pos; return [...b.entities.values()].filter((e) => e.type === 'minecraft:item' && Math.hypot(e.x - dp.x, e.z - dp.z) < 16 && Math.abs(e.y - dp.y) < 8).sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z)); };
      for (let t = 0; t < 12 && !lying().length && !me.abort; t++) await sleep(500);
      let dug = 0;
      for (let k = 0; k < 24 && !me.abort && Date.now() - dp.t < 295000; k++) {
        let items = lying();
        if (!items.length) { await sleep(1500); items = lying(); if (!items.length) break; }   // (the rest of them come into view a moment after the first: 14:42 it left with the sword alone)
        const it = items[0];
        if (process.env.BOT_DEBUG) { const p0 = b.state().pos; log(`death: fetch ${k}: ${items.length} lying, nearest ${Math.hypot(it.x - p0.x, it.z - p0.z).toFixed(1)} off, ${(p0.y - it.y).toFixed(1)} below`); }
        await gotoFor([String(Math.floor(it.x)), String(Math.floor(it.z))], 8000);
        for (let t = 0; t < 8 && [...b.entities.values()].includes(it); t++) await sleep(250);
        // (they lie under the ground: it died down a hole or in its night shelter, and walking stops on the ground above them -
        //  straight down to them, twice at most; never where someone has built)
        const p = b.state().pos, deep = Math.round(p.y - it.y);
        // (one step lower, right beside: the path ends on the block above them, 0.3 away and out of reach for good - 14:54, twenty
        //  rounds of standing there. Onto their very spot)
        if ([...b.entities.values()].includes(it) && p.y - it.y > 0.6 && deep < 2) {
          for (let t = 0; t < 3 && [...b.entities.values()].includes(it) && !me.abort; t++) { await gotoFor([String(it.x), String(it.y), String(it.z)], 1500, 'lookat'); await gotoFor(['forward', '12'], 1800, 'walk'); await sleep(400); }
        }
        if ([...b.entities.values()].includes(it) && deep >= 2 && Math.hypot(it.x - p.x, it.z - p.z) < 2.5 && dug < 2 && !guardReason(b)) {
          dug++; log(`death: they lie ${deep} below me: down to them`);
          // (an open hole: the path stops at its rim - step in over them; closed ground: dig)
          for (let t = 0; t < 5 && b.state().pos.y - it.y > 1.5 && !me.abort; t++) { await gotoFor([String(it.x), String(it.y), String(it.z)], 1500, 'lookat'); await gotoFor(['forward', '12'], 1800, 'walk'); await sleep(400); }
          if (b.state().pos.y - it.y > 1.5) await gotoFor([String(Math.min(12, Math.round(b.state().pos.y - it.y)))], 12000 + deep * 6000, 'dig_down');
          for (let t = 0; t < 8 && [...b.entities.values()].includes(it); t++) await sleep(250);
        }
      }
      if (dug) await gotoFor([], 60000, 'to_surface');
      await b.act('inv', []).catch(() => {});   // (the server's copy of the inventory, not this client's guess)
    } finally { clearTimeout(stop); }
    lastWeaponCheck = 0; me.armed = WEAPONS.some((w) => (b.invText?.() ?? '').includes('minecraft:' + w + '*'));
    trip.ok = /\d+:minecraft:/.test(b.invText?.() ?? '');
    log(`death: back with ${(b.invText?.() ?? 'inv empty').replace(/^inv /, '').slice(0, 400)}`, { dc: true });
  } catch (e) { log('death: fetching failed: ' + e.message); }
  finally {
    me.fetching = false; me.abort = false;
    if (cfg.reviewDeaths !== false) {
      me.reviewPending = rv; try { require('node:fs').writeFileSync(require('node:path').join(ctx.RUN, 'review.json'), JSON.stringify(rv)); } catch { /* */ }
      log('auto: paused for a review of this death (resume when improved)', { dc: true });
    }
  }
}
try { me.reviewPending ??= JSON.parse(require('node:fs').readFileSync(require('node:path').join(ctx.RUN, 'review.json'), 'utf8')); } catch { /* none */ }
async function nightAway() {   // the night at the world spawn, nothing in hand: away until morning (one leave, one join)
  const b = me.bot; if (!b || !me.connected || !ctx.away || me.armed || me.dim !== 'overworld' || !nightNow(b)) return false;
  const q = b.state().pos; if (Math.hypot(q.x, q.z) > FAR) return false;
  const t = b.time?.(), d = t == null ? 13000 : ((t % 24000) + 24000) % 24000, left = me.weather === 'thunder' && d < AD.nightStart ? 300 : Math.max(30, (23300 - d) / 20);
  await ctx.away(Math.round(left * 1000) + 15000, 'night at the world spawn with nothing in hand'); return true;
}
async function reviewWait() { while (me.fetching && !disposed) await sleep(1000); if (!me.reviewPending) return; me.abort = true; me.bot?.cancel?.(); while (me.reviewPending && !disposed) { if (await nightAway()) continue; const b = me.bot; const f = b && me.connected ? hostilesNear(b, 8) : []; if (f.length && !fighting) { fighting = true; try { await breakAway(b, f); } finally { fighting = false; } } else await sleep(2000); } me.abort = false; }   // (fighting set: the fight timer and this wait broke away at once, two ways)
// (a thunderstorm is as dark as the night: monsters spawn and the zombies do not burn - 15:13 it opened its hole 'in the morning' of a
//  thunderstorm and two zombies came in)
const weatherTap = (l) => { const m = /@\S+ weather: (\w+)/.exec(l); if (m) me.weather = m[1]; };
ctx.taps.add(weatherTap);
const nightNow = (b) => { if (me.weather === 'thunder') return true; const t = b.time?.(); if (t === null || t === undefined) return false; const d = ((t % 24000) + 24000) % 24000; return d >= AD.nightStart && d <= 23200; };
// the night out: dug in if it can be; if not (rock, nothing to build with), it does not stand there idle - it watches and fights
// (10:24-10:26: the shelter failed, it stood still 3 minutes with a stone sword in the inventory, three zombies, dead)
function shutIn(b) { const q = b.state().pos, X = Math.floor(q.x), Y = Math.floor(q.y), Z = Math.floor(q.z); const solid = (x, y, z) => { const n = b.world.block(x, y, z)?.name ?? 'air'; return !/air|water|lava|grass$|fern|flower|leaf_litter|snow_layer|torch|carpet/.test(n); }; return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => solid(X + dx, Y, Z + dz) && solid(X + dx, Y + 1, Z + dz)) && solid(X, Y + 2, Z); }
async function sitOutNight(b, stop = () => false) {
  // (shelter night: kept in until morning; a plain shelter went out again at once - 'armed and well' / its own later night start - and
  //  each new try dug 3 deeper: 70 down to 58 in 4 minutes)
  let failed = false; const tap = (l) => { if (/shelter: failed/.test(l)) failed = true; };
  // (never by someone's builds: 14:51 it dug itself into the ground of the spawn hub, two blocks down among the chests, and could not
  //  get out again - the guard forbids every dig there, its own lid too)
  const dig = async () => { failed = false; if (guardReason(b)) { failed = true; log(`night: no digging in here (${guardReason(b)})`); return; } ctx.taps.add(tap); await b.act('shelter', ['night']).catch(() => {}); ctx.taps.delete(tap); };
  await dig();
  let warned = false, lastTry = Date.now();
  while (nightNow(b) && me.connected && !disposed && !stop()) {
    if (shutIn(b)) { await sleep(5000); continue; }
    if (!warned) { warned = true; log('night: not shut in: standing guard, sword in hand'); lastWeaponCheck = 0; await armUp(b).catch(() => {}); }
    const f = hostilesNear(b, 10);
    if (f.length) { if (me.armed && (me.hp ?? 20) > AD.breakAwayHp) await engage(b); else await breakAway(b, f); await sleep(250); }   // (a real wait: engage returns at once while another fight runs, and the loop spun in microtasks - 11/20 the lab's bot froze at 100% for 30 minutes, no tick, no status)
    else { await sleep(1000); if (failed && Date.now() - lastTry > 60000) { lastTry = Date.now(); await dig(); } }   // (after a failed dig-in only: another try a minute on, maybe on better ground; never a new hole after one that worked)
  }
}
async function unbury(b) {
  if (hostilesNear(b, 10).length || nightNow(b)) return 0;   // (not with them about, nor in the dark: the lid is what keeps them out)
  const q = b.state().pos, X = Math.floor(q.x), Y = Math.floor(q.y), Z = Math.floor(q.z); let n = 0;
  for (const [x, y, z] of [[X, Y + 2, Z], ...[[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dx, dz]) => [[X + dx, Y, Z + dz], [X + dx, Y + 1, Z + dz], [X + dx, Y + 2, Z + dz]])]) {
    const nm = b.world.block(x, y, z)?.name ?? 'air';
    if (/air|water|lava/.test(nm) || !b.placedByMe?.has?.(`${x},${y},${z}`)) continue;
    await b.act('dig', [String(x), String(y), String(z)]).catch(() => {}); n++;
  }
  if (n) log(`travel: took away ${n} of my own blocks around me (an old dig-in)`);
  return n;
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
  let bestLeft = Infinity, bestT = Date.now(), armTried = 0;
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
      // nothing in hand, out of the builds' reach, by day: a sword first (logs - planks - sword, half a minute), then on - the long walk
      // unarmed from the world spawn to the bed was three deaths in a row (14:42 - 14:47)
      if (!me.armed) me.armed = WEAPONS.some((w) => (b.invText?.() ?? '').includes('minecraft:' + w + '*'));   // (as it is now, not as it was 15 s ago)
      if (!me.armed && !(me.fetching && me.fetchArmed) && Date.now() - armTried > 180000 && !guardReason(b) && !nightNow(b) && me.dim === 'overworld') {
        armTried = Date.now(); await b.act('sprint', ['off']).catch(() => {}); log('travel: nothing to fight with: a sword first');
        const t = setTimeout(() => b.cancel?.(), 300000); await b.act('get_wooden_sword', []).catch(() => {}); clearTimeout(t);
        lastWeaponCheck = 0; await armUp(b).catch(() => {}); me.armed = WEAPONS.some((w) => (b.invText?.() ?? '').includes('minecraft:' + w + '*'));
        if (!me.armed) { armTried = Date.now() + 600000; log('travel: no sword to be had here (no trees?): on without one'); }   // (the mesa at the lab's spawn: 5 min looking every 3 min walking)
        last = b.state().pos; lastT = Date.now(); bestT = Date.now(); continue;
      }
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
          // walled in by its own blocks (a lid, a wall of an old dig-in): those are ours to take away, builds near or not
          if (stuckFor >= 2) await unbury(b);
          // still nowhere after a few tries and nobody's build near: dig the way ahead (natural ground only), as a person would
          if (stuckFor >= 3 && !guardReason(b)) {
            const ry = ((Math.atan2(-dx, dz) * 180) / Math.PI) * Math.PI / 180; let fx = Math.floor(p.x - Math.sin(ry) * 1.1), fz = Math.floor(p.z + Math.cos(ry) * 1.1);
            if (fx === Math.floor(p.x) && fz === Math.floor(p.z)) { fx = Math.floor(p.x - Math.sin(ry) * 1.8); fz = Math.floor(p.z + Math.cos(ry) * 1.8); }   // (1.1 ahead was still its own cell at 157 129: 'not under the crosshair' x8)
            for (const y of [Math.floor(p.y) + 1, Math.floor(p.y)]) { const n = b.world.block(fx, y, fz)?.name ?? ''; if (n && !/air|water|lava|bedrock/.test(n)) await b.act('dig', [String(fx), String(y), String(fz)]).catch(() => {}); }
            turn = 0;
          } else turn = (stuckFor % 2 ? 1 : -1) * Math.min(150, 40 * stuckFor);
        }
        else { if (Date.now() - bestT < 4000) stuckFor = 0; turn = Math.abs(turn) < 10 ? 0 : turn * 0.5; }   // (moving without getting closer does not clear it: 14:25 it shuffled at -7 66 4 for minutes, 'stuck 2' over and over)
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
  // restore x y z [x y z ...]: put dirt back into cells this bot dug by someone's builds (the 14:51 hole in the spawn's ground) - the
  // dirt comes from natural ground well away from any build; placing it back is mending, not building, so the guard does not stop it
  restore: async (a) => {
    const cells = []; for (let i = 0; i + 2 < a.length; i += 3) cells.push(a.slice(i, i + 3).map(Number));
    const b = me.bot; if (!b || !cells.length) return log('restore x y z [x y z ...]');
    const dirt = () => { const m = /minecraft:dirt\*(\d+)/g; let n = 0, x; const s = b.invText?.() ?? ''; while ((x = m.exec(s))) n += +x[1]; return n; };
    if (dirt() < cells.length) {
      const q = b.state().pos, ang = Math.atan2(q.z - cells[0][2], q.x - cells[0][0]) || 0;
      log(`restore: ${cells.length - dirt()} dirt to fetch from natural ground away from the builds`);
      for (const dist of [70, 110, 150, 200, 260]) {   // (out until no build is within the guard's reach: the spawn has them all around)
        await BUILTIN.travel([String(Math.round(cells[0][0] + Math.cos(ang) * dist)), String(Math.round(cells[0][2] + Math.sin(ang) * dist))]);
        if (!guardReason(b)) break;
      }
      if (guardReason(b)) { log(`restore: still by a build here (${guardReason(b)}): not digging`); return; }
      await b.act('mine_dirt', [String(cells.length + 2)]).catch(() => {});
    }
    if (dirt() < cells.length) return log('restore: no dirt');
    await BUILTIN.travel([String(cells[0][0] + 2), String(cells[0][2])]);
    for (const [x, y, z] of cells.sort((p, q) => p[1] - q[1])) {
      if (!/air|water/.test(b.world.block(x, y, z)?.name ?? '')) continue;
      await b.act('hold_dirt', []).catch(() => {});
      await b.act('useon', [String(x), String(y - 1), String(z), 'up']).catch(() => {});
      await sleep(600);
      log(`restore: ${x} ${y} ${z}: ${(b.world.block(x, y, z)?.name ?? '?').replace('minecraft:', '')}`, { dc: true });
    }
  },
  // pieces of the run by name (the lab's scenario tests use them; by hand too)
  bed: async () => { pieceRun++; try { log(`bed: ${(await bedSpawn()) ? 'respawn point set' : 'not set'}`, { dc: true }); } finally { pieceRun--; } },
  nightsit: async () => { pieceRun++; try { await sitOutNight(me.bot, () => me.abort); log('nightsit: morning'); } finally { pieceRun--; } },
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
timers.push(setInterval(async () => { const b = me.bot; if (!b || !me.connected || fighting) return; const inv = await invList(b); me.armed = WEAPONS.some((w) => inv.includes('minecraft:' + w + '*')); me.armored = /_chestplate\*/.test(inv) || wornChest(); }, 15000));
// (a chestplate worn is not in the inventory's list: 11/20 the lab's bot in full iron dug in for every night, 'night and no armour')
function wornChest() { const k = me.bot?.K, it = k?.inv?.armor?.[1]; return !!it?.network_id && /chestplate/.test(String(k.itemNames.get(it.network_id) ?? '')); }
ctx.taps.add(deathArmTap);
function deathArmTap(l) { if (/ died \(/.test(l)) me.armed = false; }
// in sight: nothing solid on the straight line from the eyes to its middle (a mob behind a wall is not fought: it cannot be reached)
const inSight = (b, P, x) => { const ex = P.x, ey = P.y + 1.62, ez = P.z, tx = x.x, ty = x.y + 0.9, tz = x.z, n = Math.ceil(Math.hypot(tx - ex, ty - ey, tz - ez) * 3);
  for (let i = 1; i < n; i++) { const f = i / n, nm = b.world.block(Math.floor(ex + (tx - ex) * f), Math.floor(ey + (ty - ey) * f), Math.floor(ez + (tz - ez) * f))?.name ?? 'minecraft:air'; if (!/air|water|grass|fern|flower|leaf_litter|snow_layer|vine|torch|sapling|bush/.test(nm)) return false; } return true; };
// (all of them within r, seen or not: for counting the odds and for which way is away - 14:19 in the lab two of six were in sight,
//  it ran from those two into the other four: 20 health to 2)
const hostilesAll = (b, r) => { const P = b.state().pos; return [...b.entities.values()].filter((x) => HOSTILE.test(x.type ?? '') && Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) < r).map((x) => ({ e: x, d: Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) })).sort((p, q) => p.d - q.d); };
const hostilesNear = (b, r) => { const P = b.state().pos; return [...b.entities.values()].filter((x) => HOSTILE.test(x.type ?? '') && Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) < r && inSight(b, P, x)).map((x) => ({ e: x, d: Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) })).sort((p, q) => p.d - q.d); };
async function invList(b) { if (b.invText) { try { return b.invText(); } catch { /* fall back */ } } const seen = []; const tap = (l) => seen.push(l); ctx.taps.add(tap); await b.act('inv', []).catch(() => {}); ctx.taps.delete(tap); return seen.join(' '); }
async function armUp(b) {
  if (Date.now() - lastWeaponCheck < 30000) return; lastWeaponCheck = Date.now();
  const inv = await invList(b), w = WEAPONS.find((x) => inv.includes('minecraft:' + x + '*'));
  lastHeld = w ?? '';
  if (w && !new RegExp(`\\d+:minecraft:${w}\\*\\d+[^|]*\\(holding slot`).test(inv)) await b.act('hold_' + w, []).catch(() => {});
}
async function breakAway(b, foes) {
  const P = b.state().pos; let ax = 0, az = 0; for (const f of [...new Map([...foes, ...hostilesAll(b, 12)].map((f) => [f.e, f])).values()]) { const w = 1 / Math.max(1, f.d * f.d); ax += (P.x - f.e.x) * w; az += (P.z - f.e.z) * w; }   // (the near ones count most: out through the gap)
  const yaw = (Math.atan2(-ax, az) * 180) / Math.PI;
  log(`fight: ${me.armed ? `health ${me.hp}` : 'unarmed'}: breaking away from ${foes.length} (${foes.map((f) => f.e.type.replace('minecraft:', '')).join(' ')})`);
  // in water (a drowned's home): looking level and sprinting barely moves; head up and swim (jump) away, toward air
  const wet = /water/.test(b.world.block(Math.floor(P.x), Math.floor(P.y), Math.floor(P.z))?.name ?? '') || /water/.test(b.world.block(Math.floor(P.x), Math.floor(P.y) + 1, Math.floor(P.z))?.name ?? '');
  await b.act('look', [yaw.toFixed(0), wet ? '-35' : '0']).catch(() => {});
  await b.act('sprint', ['on']).catch(() => {}); await b.act('option', ['autojump', 'on']).catch(() => {});
  if (wet) { for (let i = 0; i < 8; i++) { await b.act('jump', []).catch(() => {}); await sleep(250); } }
  // (14:26 in the lab: 2.5 s of running, then it stood and ate with four husks five blocks behind - dead in 11 s. Running goes on,
  //  re-aimed every second, until none is within 16 blocks or 15 s are up; eating only once clear)
  let clear = false;
  // (nothing in hand at night: a shorter run - ten blocks clear is enough to dig in again; every second out there is another of them)
  const lone = !me.armed && nightNow(b);
  for (let t = 0; t < (lone ? 8 : 15) && me.connected && !b.state().dead; t++) {
    await sleep(1000);
    const near = hostilesAll(b, lone ? 10 : 16); if (!near.length) { clear = true; break; }
    const Q = b.state().pos; let bx = 0, bz = 0; for (const f of near) { const w = 1 / Math.max(1, f.d * f.d); bx += (Q.x - f.e.x) * w; bz += (Q.z - f.e.z) * w; }
    await b.act('look', [((Math.atan2(-bx, bz) * 180) / Math.PI).toFixed(0), wet ? '-35' : '0']).catch(() => {});
    if (wet || t % 2) await b.act('jump', []).catch(() => {});
  }
  await b.act('sprint', ['off']).catch(() => {});
  if (clear && me.armed) await b.act('eat', []).catch(() => {});
}
// fight or leave, worked out before the first swing (the 27-hour run elsewhere: 605 deaths, most of them fights it could have
// counted beforehand). Bedrock: no swing cooldown, a mob cannot be hurt again for half a second → two hits a second; what each of
// them has and deals on normal difficulty; they are fought nearest first, and all of them hit until their turn comes.
const FOE = { zombie: [20, 3], husk: [20, 3], drowned: [20, 3], zombie_villager_v2: [20, 3], skeleton: [20, 2.5], stray: [20, 2.5], bogged: [16, 2.5], spider: [16, 2], cave_spider: [12, 3], creeper: [20, 0], witch: [26, 3], slime: [16, 3], magma_cube: [16, 4], pillager: [24, 3], vindicator: [24, 13], silverfish: [8, 1], phantom: [20, 3], blaze: [20, 5], wither_skeleton: [20, 8], piglin_brute: [50, 13], hoglin: [40, 6], ghast: [10, 6], endermite: [8, 2], breeze: [30, 3] };
const HIT = { netherite_sword: 9, diamond_sword: 8, iron_sword: 7, stone_sword: 6, wooden_sword: 5, diamond_axe: 7, iron_axe: 6, stone_axe: 5, wooden_axe: 4 };
function odds(b, foes) {
  const inv = b.invText?.() ?? '', w = WEAPONS.find((x) => inv.includes('minecraft:' + x + '*')), hit = w ? HIT[w] : 1;
  const armour = (/iron_chestplate|diamond_chestplate|netherite_chestplate/.test(inv) || me.armored ? 0.7 : 1) * (/shield\*/.test(inv) ? 0.8 : 1);
  let t = 0, taken = 0;
  for (const f of foes) { const [hp, dps] = FOE[f.e.type.replace('minecraft:', '')] ?? [20, 4]; t += hp / (hit * 2) + 0.5; taken += dps * 0.6 * t * armour; }   // (0.6: each of my hits knocks it back out of its reach for a moment)
  return { taken: Math.round(taken), secs: Math.round(t), ok: taken * 1.2 < (me.hp ?? 20) - 1 };
}
async function engage(b, maxMs = 12000) {
  if (fighting) return; fighting = true;
  const t0 = Date.now(); let strafe = 1, misses = 0;
  try {
    while (Date.now() - t0 < maxMs && me.connected && !b.state().dead) {
      const foes = hostilesNear(b, 7); if (!foes.length) return;
      if (!me.armed) me.armed = WEAPONS.some((w) => (b.invText?.() ?? '').includes('minecraft:' + w + '*'));   // (as it is now: 14:45 it ran from one zombie with a sword just picked up)
      // nothing to fight with: no fist fight against a zombie (20 health against 1 a punch) - run, sprinting, they are slower
      if (!me.armed || (me.hp !== null && me.hp <= AD.breakAwayHp)) { await breakAway(b, foes); return; }
      { const all = hostilesAll(b, 12), o = odds(b, all);   // (those a little further off join in before it is over)
        if (!o.ok) { log(`fight: not this one: ${all.length} of them would cost about ${o.taken} of my ${me.hp ?? 20} health over ${o.secs} s`, { dc: true }); await breakAway(b, all); return; } }
      const { e, d } = foes[0], kind = e.type.replace('minecraft:', '');
      await armUp(b);
      if (/creeper/.test(kind) && d < 3.2) { await b.act('attack', [kind]).catch(() => {}); await b.act('look', [String((((Math.atan2(-(b.state().pos.x - e.x), b.state().pos.z - e.z)) * 180) / Math.PI).toFixed(0)), '0']).catch(() => {}); await b.act('sprint', ['on']).catch(() => {}); await sleep(1200); await b.act('sprint', ['off']).catch(() => {}); continue; }
      if (d > 2.7) {   // close in, a little to the side each time (arrows)
        const P = b.state().pos, yaw = (Math.atan2(-(e.x - P.x), e.z - P.z) * 180) / Math.PI + (/skeleton|stray|bogged|pillager/.test(kind) ? 25 * (strafe = -strafe) : 0);
        await b.act('look', [yaw.toFixed(0), '0']).catch(() => {});
        await b.act('sprint', ['6']).catch(() => {});
        continue;
      }
      let miss = false; const mt = (l) => { if (/not under the crosshair/.test(l)) miss = true; }; ctx.taps.add(mt);
      await b.act('attack', [kind]).catch(() => {}); ctx.taps.delete(mt);
      // (14:14: 20 misses in a row at 2 blocks, standing still while two zombies hit: dead from 18 health) - after three misses, a step
      //  back and a new angle; after six, away
      misses = miss ? misses + 1 : 0;
      if (misses >= 6) { await breakAway(b, foes); misses = 0; return; }
      if (misses >= 3) { const P = b.state().pos; await b.act('look', [String(((Math.atan2(-(P.x - e.x), P.z - e.z) * 180) / Math.PI + 40 * (strafe = -strafe)).toFixed(0)), '0']).catch(() => {}); await b.act('sprint', ['3']).catch(() => {}); continue; }
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
  if (me.dim === 'overworld' && nightNow(b) && (!me.armored || me.nightIn) && !guardReason(b) && openSky(b, b.state().pos)) { me.interrupt = 'night';   // (underground the night does not matter: it mines on)
    log('auto: night falls mid-task: stopping to dig in', { dc: true }); b.cancel?.(); return; }
  const f = hostilesNear(b, 4).filter((x) => !/creeper/.test(x.e.type) || x.d < 3);
  if (f.length) { me.interrupt = 'fight'; b.cancel?.(); }
}, 400));
timers.push(setInterval(() => {
  const b = me.bot; if (!b || !me.connected || fighting || b.state().dead) return;
  if (/^auto: (get|kill|mine|fight|stronghold|blaze_rods|nether_seek|tunnel_to|portal_go|nether_in|end_fight|quartz_mine|ore_mine)_?/.test(String(me.busy ?? ''))) return;   // (a goal verb fights for itself: 11/20 this one's breaking away ran the bot out of the blaze bunker, among five blazes, to its death)
  const f = hostilesNear(b, AD.engageR); if (!f.length) return;
  engage(b).catch(() => {});
}, 500));
const skipUntil = new Map();


// ---------- auto: the whole run on its own (`auto` starts it, `auto stop` ends it) ----------
// away from builds and players → stone tools → iron gear, bucket, food → eyes of ender (the nether) → the stronghold → the dragon;
// the dragon already gone → the elytra (end gateway, end city); afterwards diamonds, as many as can be mined, until ENDS_AT.
// Every step is retried; a death is followed by fetching the things back; a guard stop by moving away first.
const ENDS_AT = cfg.autoUntil ?? '08:00';   // local time to keep going until (after the goal)
// worked back from the goal (the dragon dead): the End needs ~12 eyes = 12 ender pearls + 6 blaze rods; the rods need the Nether =
// a portal (bucket + flint and steel on a lava pool) and a fortress fought through (iron sword, shield, chestplate); the dragon itself
// goes fastest to beds (they explode in the End on Bedrock). So: iron first - mined underground, where the night does not reach it -
// then only as much food as the trip needs, then the Nether, pearls, the stronghold. (Until 15:50 the order had 10 cooked meat of
// one kind before any iron: three nights in a row cut the hunt short and it never got past food.)
// the road to the End's own commands (remote/road.cjs, the second Claude's part: the enchanting, golden apples, the Nether ...)
delete require.cache[require.resolve('./road.cjs')];
const ROAD = require('./road.cjs')({ me, cfg, log, sleep, ctx, run: (c, w) => run(c, w), guardReason: (b) => guardReason(b), gotoFor: (a, ms, v) => gotoFor(a, ms, v), live: () => live(), piece: async (fn) => { pieceRun++; try { return await fn(); } finally { pieceRun--; } }, travel: (x, z) => BUILTIN.travel([String(x), String(z)]) });
Object.assign(BUILTIN, ROAD.builtins);
const STEPS = [
  { name: 'stone tools', cmds: ['get_wooden_sword', 'get_stone_pickaxe', 'get_stone_sword', 'get_stone_axe'], has: ['stone_pickaxe', 'stone_sword'] },   // (a weapon before anything: every death so far was with nothing in hand)
  { name: 'a bed as the spawn point (out here, not among the builds)', special: 'bedspawn', optional: true },
  { name: 'iron: pickaxe, bucket, sword, shield, chestplate', cmds: ['get_iron_pickaxe', 'get_bucket', 'get_iron_sword', 'get_shield', 'get_iron_chestplate', 'armor_up'], has: ['iron_pickaxe', 'bucket', 'iron_sword'] },
  { name: 'a chest of our own by the bed: what a death must not cost goes in', special: 'stash', optional: true },
  { name: 'food (enough for the trip, any kind)', cmds: ['get_cooked_beef 6', 'get_cooked_porkchop 6', 'get_cooked_mutton 6', 'get_cooked_chicken 6', 'get_bread 6'], food: 8, optional: true },
  { name: 'flint and steel', cmds: ['get_flint_and_steel'], has: ['flint_and_steel'] },
  { name: 'a sugar cane farm by water (paper for 45 books: it grows while the rest is done)', cmds: ['road_cane 138'], optional: true },
  // (all four pieces now: each takes Protection IV - with Protection III the lab's dragon fights were 0 of 5, with IV they are won)
  { name: 'iron: the rest of the armour', cmds: ['get_iron_helmet', 'get_iron_leggings', 'get_iron_boots', 'armor_up'], has: ['iron_helmet', 'iron_leggings', 'iron_boots'] },
  // ---- the road's own steps (remote/road.cjs): the enchanting table, its room, the Nether's levels, Protection IV ----
  { name: 'diamonds and lapis (the enchanting table, a diamond pickaxe; the table\'s lapis)', cmds: ['road_mine'], has: ['diamond'] },
  { name: 'obsidian (the portal, the enchanting table)', cmds: ['road_obsidian'], has: ['obsidian'] },
  { name: 'books: the enchanting table, fifteen bookshelves; wooden shovels', cmds: ['road_books'], has: ['bookshelf'] },
  { name: 'the enchanting room by the bed', cmds: ['road_room'], has: ['enchanting_table'] },
  { name: 'Protection IV on all four (the Nether\'s blazes for the levels, and blaze rods)', cmds: ['road_prot'], has: ['protection'] },
  // (golden apples: the lab's wins on the real terms ate 5-19 - without them its breath wins in 10-20 minutes. 8 at the least, 16 wanted)
  { name: 'golden apples (its breath): 8 at the least', cmds: ['get_golden_apple 8'], has: ['golden_apple'] },
  { name: 'golden apples: 16', cmds: ['get_golden_apple 16'], optional: true },
  { name: 'beds for the dragon (4-7 blown in the lab wins)', cmds: ['road_beds 12'], has: ['bed'] },
  { name: 'a bow and arrows (the crystals on the pillars, the cages, its last points: 105-158 used in the lab wins)', cmds: ['road_arrows 192'], has: ['arrow'] },
  { name: 'eyes of ender (blaze rods from the Nether; pearls)', cmds: ['road_nether 7', 'get_ender_eye 12'], has: ['ender_eye'] },
  { name: 'out of the chest: everything for the way to the end', special: 'unstash', optional: true },
  { name: 'blocks for the End (pillars, a seal over a hole, stands for beds)', cmds: ['get_cobblestone 256'], has: ['cobblestone'] },
  { name: 'a carved pumpkin (the endermen in the End: looked at, they stay calm)', cmds: ['road_pumpkin'], has: ['carved_pumpkin'] },
  { name: 'food for the End', cmds: ['get_cooked_beef 32'], food: 32, optional: true },
  { name: 'the kit counted (what is still missing goes back to its step)', cmds: ['road_kit'], optional: true },
  { name: 'stronghold → the end', cmds: ['stronghold 3600'], dim: 'the_end' },
  { name: 'the dragon', special: 'dragon' },
];
let autoRun = null;   // this brain's run; me.autoGen says which run is the live one (one at a time, across reloads)
me.autoGen ??= 0;
let pieceRun = 0;   // a single piece of the run asked for by name (`bed`, `nightsit`: remote/labtest.mjs, or by hand)
const live = () => pieceRun > 0 || (autoRun && autoRun.gen === me.autoGen);
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
  // (not from inside bedSpawn: its own run()s come back here - 13:36 that was an endless chain of promises that never let the process
  //  breathe: frozen until the watchdog)
  if (me.dim === 'overworld' && !me.spawnSet && !inBedSpawn && !nightNow(b) && /\d+:minecraft:(\w+_)?bed\*/.test(await invList(b))) { log('auto: a bed carried and no respawn point yet: setting it down first'); await bedSpawn(); }
  const lastInv = nightNow(b) ? await invList(b) : '';
  if (!openSky(b, b.state().pos) && !nightNow(b)) { log('auto: under the ground: up to the sky before working'); await b.act('to_surface', []).catch(() => {}); if (!openSky(b, b.state().pos)) await handStairs(b.state().pos.x + 8, b.state().pos.z); }
  me.armored = /_chestplate\*/.test(lastInv || (await invList(b))) || wornChest();
  if (nightNow(b) && (!me.armored || me.nightIn)) { log(me.nightIn ? 'auto: night: dug in until morning (the road shelters every night until Protection IV)' : 'auto: night and no armour: dug in until morning', { dc: true }); await sitOutNight(b); }
}
async function goFar() {
  await reviewWait();
  if (!(await waitIn()) || me.dim !== 'overworld') return;
  const p = me.bot.state().pos;
  if (Math.hypot(p.x, p.z) >= FAR) return;
  if (me.spawnSet && Math.hypot(p.x - me.spawnSet.x, p.z - me.spawnSet.z) < 64) return;
  // night and nothing in hand: not out into the dark fields (14:46, 14:47, 14:50: three deaths walking out at night unarmed) - the
  // spawn's lit buildings until morning, stepping away from what comes
  // (15:47-15:52: waiting there was a death a minute - seven in one night; the user, 15:57: then leave for the night, one leave and one
  //  join a night, only when the night finds it unarmed at the world spawn)
  if (nightNow(me.bot) && !me.armed && ctx.away) {
    const t = me.bot.time?.(), d = t == null ? 13000 : ((t % 24000) + 24000) % 24000, left = me.weather === 'thunder' && d < AD.nightStart ? 300 : Math.max(30, (23300 - d) / 20);
    await ctx.away(Math.round(left * 1000) + 15000, 'night at the world spawn with nothing in hand');
    await waitIn();
  }
  log(`auto: near the spawn (${Math.round(p.x)} ${Math.round(p.z)}): out to the work area ${WORK.join(' ')} (by ${WAYOUT.join(' ')})`, { dc: true });
  for (let i = 0; i < 5 && live(); i++) {
    await reviewWait(); if (!(await waitIn())) return;
    me.abort = false;
    const q0 = me.bot.state().pos;
    if (Math.hypot(q0.x, q0.z) < 60 && q0.z < WAYOUT[1] - 10) await BUILTIN.travel([String(WAYOUT[0]), String(WAYOUT[1])]);
    { let pb = null; try { pb = JSON.parse(require('node:fs').readFileSync(require('node:path').join(ctx.RUN, 'bed.json'), 'utf8')); } catch { /* */ } await BUILTIN.travel(pb ? [String(pb.x + 2), String(pb.z)] : [String(WORK[0]), String(WORK[1])]); }   // (our bed's place is the work area once there is one)
    const q = me.bot.state().pos; if (Math.hypot(q.x, q.z) >= FAR) return;
  }
}
// a bed set down out in the work area and clicked: the respawn point is here from then on (a death no longer means the long
// walk back from the world spawn through the mobs there). Clicking a bed sets it at any time of day on Bedrock.
// (kept over restarts: the bed stays where it was set down; a death sends it there, not to the world spawn)
if (!me.spawnSet) { try { me.spawnSet = JSON.parse(require('node:fs').readFileSync(require('node:path').join(ctx.RUN, 'spawn.json'), 'utf8')); } catch { /* none yet */ } }
function findBed0() { const b = me.bot; if (!b) return null; const p = b.state().pos; for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -2; dy <= 2; dy++) { const x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy, z = Math.floor(p.z) + dz; if (/(^|:)(\w+_)?bed$/.test(b.world.block(x, y, z)?.name ?? '') && b.placedByMe?.has?.(`${x},${y},${z}`)) return [x, y, z]; } return null; }
let inBedSpawn = false;
async function bedSpawn() { if (inBedSpawn) return false; inBedSpawn = true; try { return await bedSpawn0(); } finally { inBedSpawn = false; } }
async function bedSpawn0() {
  if (me.dim !== 'overworld' || me.spawnSet) return true;
  // three wool of one colour (sheep come in several): sheep until some colour has three, then the bed of that colour from the
  // inventory (get_bed plans for white wool only)
  const woolCounts = async () => { const seen = []; const tap = (l) => seen.push(l); ctx.taps.add(tap); await me.bot.act('inv', []).catch(() => {}); ctx.taps.delete(tap);
    const m = new Map(); for (const l of seen) for (const x of l.matchAll(/minecraft:(\w+_wool)\*(\d+)/g)) m.set(x[1], (m.get(x[1]) ?? 0) + Number(x[2])); return m; };
  // a bed of ours already standing somewhere (set down before, not yet taken as the respawn point): back to it rather than a new one
  { let pb = null; try { pb = JSON.parse(require('node:fs').readFileSync(require('node:path').join(ctx.RUN, 'bed.json'), 'utf8')); } catch { /* */ }
    const q = me.bot.state().pos;
    if (pb && Math.hypot(q.x - pb.x, q.z - pb.z) > 4 && Math.hypot(q.x - pb.x, q.z - pb.z) < 600) { log(`auto: back to our bed at ${pb.x} ${pb.y} ${pb.z} to set it as the respawn point`); await BUILTIN.travel([String(pb.x + 2), String(pb.z)]); } }
  let bedOk = /\d+:minecraft:(\w+_)?bed\*/.test(await invList(me.bot)) || !!findBed0();   // (one carried already: straight to setting it down)
  for (let i = 0; i < 10 && live() && !bedOk; i++) {
    if ([...(await woolCounts()).values()].some((n) => n >= 3)) { bedOk = await run('craft_bed', 'the bed from three of one colour'); break; }
    await run('kill_sheep 1', 'wool for a bed');
  }
  if (!bedOk) bedOk = await run('get_bed 1', 'a bed');
  if (!bedOk) return false;
  // (13:17 the bed was made in the night's hole: the floor of the spot beside it could not be seen from down there, the bed did not go
  //  down - up to the open sky first; then every spot around, not only the first one, each checked)
  if (!openSky(me.bot, me.bot.state().pos)) { await me.bot.act('to_surface', []).catch(() => {}); }
  const findBed = findBed0;   // (our own bed only: never someone else's)
  let bed = findBed();
  for (let k = 0; k < 2 && !bed && live(); k++) {   // (a spot two cells long on open ground beside it: air with air over it, over something solid)
    const q = me.bot.state().pos, X = Math.floor(q.x), Y = Math.floor(q.y), Z = Math.floor(q.z);
    const free = (x, y, z) => /air/.test(me.bot.world.block(x, y, z)?.name ?? '') && /air/.test(me.bot.world.block(x, y + 1, z)?.name ?? '') && !/air|water|lava|leaves|_bed/.test(me.bot.world.block(x, y - 1, z)?.name ?? 'air');
    const spots = [[2, 0, 1, 0, 'east'], [-2, 0, -1, 0, 'west'], [0, 2, 0, 1, 'south'], [0, -2, 0, -1, 'north'], [1, 0, 1, 0, 'east'], [-1, 0, -1, 0, 'west'], [0, 1, 0, 1, 'south'], [0, -1, 0, -1, 'north']].filter(([dx, dz, hx, hz]) => free(X + dx, Y, Z + dz) && free(X + dx + hx, Y, Z + dz + hz));
    for (const s of spots) { await run(`place_bed ${X + s[0]} ${Y} ${Z + s[1]} ${s[4]}`, 'set the bed down'); await sleep(500); bed = findBed(); if (bed || !live()) break; }
    if (!bed && k === 0) { log('auto: no spot for the bed took it here: a few steps on and again'); await gotoFor([String(X + 6), String(Z)], 15000); }
  }
  if (!bed) { log('auto: the bed did not go down'); return false; }
  try { require('node:fs').writeFileSync(require('node:path').join(ctx.RUN, 'bed.json'), JSON.stringify({ x: bed[0], y: bed[1], z: bed[2] })); } catch { /* */ }
  const seen = []; const tap = (l) => seen.push(l); ctx.taps.add(tap);
  // (14:29 in the lab: '%tile.bed.tooFar' - clicked from three blocks off. Right beside it first, on a free cell next to either half,
  //  and the half nearest; once more from another side if the server still says too far)
  const isBed = (x, y, z) => /(^|:)(\w+_)?bed$/.test(me.bot.world.block(x, y, z)?.name ?? '');
  const halves = [bed, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [bed[0] + dx, bed[1], bed[2] + dz]).filter((c) => isBed(...c))];
  const sides = halves.flatMap((h) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ h, x: h[0] + dx, z: h[2] + dz }))).filter((c) => /air/.test(me.bot.world.block(c.x, bed[1], c.z)?.name ?? '') && /air/.test(me.bot.world.block(c.x, bed[1] + 1, c.z)?.name ?? ''));
  for (let k = 0; k < 3 && live(); k++) {
    const q = me.bot.state().pos; sides.sort((u, v) => Math.hypot(u.x + 0.5 - q.x, u.z + 0.5 - q.z) - Math.hypot(v.x + 0.5 - q.x, v.z + 0.5 - q.z));
    const sd = sides[k % Math.max(1, sides.length)]; if (sd) await gotoFor([String(sd.x), String(sd.z)], 8000);
    seen.length = 0;
    await me.bot.act('useon', (sd?.h ?? bed).map(String)).catch(() => {}); await sleep(1500);
    if (!seen.some((l) => /tooFar|not under the crosshair/.test(l))) break;
  }
  ctx.taps.delete(tap);
  // (only when the server says so: 13:43 the click never went out - 'not under the crosshair' - and 'respawn point set' was logged
  //  anyway; the death at 14:14 went back to the world spawn)
  if (!seen.some((l) => /respawnSet|respawn point set/i.test(l))) { log(`auto: the bed at ${bed.join(' ')} did not take as the respawn point (${seen.filter((l) => /useon|bed/.test(l)).slice(-1)[0] ?? 'no answer'})`, { dc: true }); return false; }
  me.spawnSet = { x: bed[0], y: bed[1], z: bed[2] }; try { require('node:fs').writeFileSync(require('node:path').join(ctx.RUN, 'spawn.json'), JSON.stringify(me.spawnSet)); } catch { /* */ }
  log(`auto: respawn point set at the bed ${bed.join(' ')}`, { dc: true });
  return true;
}
// ---------- the dragon (Bedrock) ----------
// The crystals first: each heals it while it flies within 32 blocks of one. They stand on a ring 43 out from the fountain; shot from
// the far side of the fountain (60-80 blocks: over the pillar's rim) with the arrow's drop allowed for, and counted gone only when
// the crystal is no longer there. One that eight arrows do not reach (the two in iron cages) is left: the fountain, where the dragon
// lands, is beyond their 32 blocks, so what the sword does to it there stays done. Then at the fountain: the sword whenever it is
// within reach (no cooldown on Bedrock; arrows do nothing to it while it sits), arrows while it flies, out of its breath, food
// under 10 health. Over when the exit portal in the fountain is open.
// one block of end stone over the head, set against a wall of the hole (its face toward us)
async function sealOverHead(b, say = () => {}) {
const bname = (x, y, z) => (b.world.block(x, y, z)?.name ?? '?').replace('minecraft:', '');
  const Q = b.state().pos, fx = Math.floor(Q.x), fz = Math.floor(Q.z), fy = Math.floor(Q.y + 0.01);
  if (bname(fx, fy + 2, fz) !== 'air') return true;
  // (end stone if carried - the dragon flies through anything else - else cobblestone: 17:07, the end stone dug a moment before
  //  not yet picked up, no seal, and the dragon itself into the open shaft)
  for (let t = 0; t < 6 && !/minecraft:end_stone\*/.test(b.invText?.() ?? ''); t++) await sleep(250);
  await gotoFor([], 1500, /minecraft:end_stone\*/.test(b.invText?.() ?? '') ? 'hold_end_stone' : 'hold_cobblestone');
  for (const [dx, dz, face] of [[1, 0, 'west'], [-1, 0, 'east'], [0, 1, 'north'], [0, -1, 'south']]) {
    if (/^(air|\?)$/.test(bname(fx + dx, fy + 2, fz + dz))) continue;
    const said = []; const tap = (l) => said.push(l); ctx.taps.add(tap);
    await b.act('useon', [String(fx + dx), String(fy + 2), String(fz + dz), face]).catch((e) => said.push(e.message)); await sleep(500); ctx.taps.delete(tap);
    say(`seal: ${face} face of ${fx + dx} ${fy + 2} ${fz + dz} (${bname(fx + dx, fy + 2, fz + dz)}) → over the head ${bname(fx, fy + 2, fz)}${said.length ? ' · ' + said.join(' | ').slice(0, 160) : ''}`);
    if (bname(fx, fy + 2, fz) !== 'air') return true;
  }
  return false;
}
BUILTIN.bedat = async () => { pieceRun++; try { const b = me.bot, Q = b.state().pos, X = Math.floor(Q.x) + Number(process.env.BEDAT_DX ?? 2), Y = Math.floor(Q.y + 0.01), Z = Math.floor(Q.z); const said = []; const tap = (l) => said.push(l); ctx.taps.add(tap); await gotoFor([String(X), String(Y), String(Z), process.env.BEDAT_DIR ?? "east"], 5000, 'place_bed'); ctx.taps.delete(tap); log(`bedat: ${X} ${Y} ${Z} (under it ${b.world.block(X, Y - 1, Z)?.name}, feet ${Q.x.toFixed(2)} ${Q.y.toFixed(2)} ${Q.z.toFixed(2)}) → ${(b.world.block(X, Y, Z)?.name ?? "?")} · ${said.join(' | ').slice(0, 300)}`); } finally { pieceRun--; } };
BUILTIN.standtest = async (a) => { pieceRun++; try { const b = me.bot, H = Number(a[0] ?? 2), Q = b.state().pos, fx = Math.floor(Q.x), fy = Math.floor(Q.y + 0.01), fz = Math.floor(Q.z), bn = (x, y, z) => (b.world.block(x, y, z)?.name ?? '?').replace('minecraft:', '');
  const cs = [[fx + 1, fz], [fx + 2, fz]]; log(`standtest: at ${fx} ${fy} ${fz}, cells ${cs.map(([x, z]) => [0, 1, 2, 3].map((k) => bn(x, fy - 1 + k, z)).join('/')).join(' | ')}`);
  await gotoFor([], 1500, 'hold_cobblestone');
  for (let k = 0; k < H; k++) for (const [x, z] of [...cs].reverse()) { const said = []; const tap = (l) => said.push(l); ctx.taps.add(tap); await b.act('useon', [String(x), String(fy + k - 1), String(z), 'up']).catch((e) => said.push(e.message)); await sleep(300); ctx.taps.delete(tap); log(`standtest: up face of ${x} ${fy + k - 1} ${z} (${bn(x, fy + k - 1, z)}) → ${bn(x, fy + k, z)} ${said.join(' | ').slice(0, 150)}`); }
} finally { pieceRun--; } };
BUILTIN.blk = async (a) => { const b = me.bot, [x, y, z] = a.map(Number), w = b.world.block(x, y, z), P = b.state().pos; log(`blk ${x} ${y} ${z}: ${w?.name} shape ${JSON.stringify(w?.shape)} · me ${P.x.toFixed(2)} ${P.y.toFixed(2)} ${P.z.toFixed(2)} yaw ${b.state().yaw?.toFixed?.(0)} pitch ${b.state().pitch?.toFixed?.(0)}`); };
BUILTIN.seal = async () => { pieceRun++; try { log(`seal: ${(await sealOverHead(me.bot, (m) => log(m))) ? 'shut' : 'not shut'}`); } finally { pieceRun--; } };
const BOWL = !!process.env.BOT_BOWL;
const CLOUD_MARGIN = Number(process.env.BOT_CLOUD_MARGIN ?? 3);
// (a blow on the way down from a jump: half again as much, the critical hit)
const CRIT = process.env.BOT_CRIT !== '0';
async function dragonFight() {
  const b = me.bot, t0 = Date.now(), tries = new Map(), left = new Set();
  // (no click on a bed but the one meant: 14:19 on 19 Nov, a bed left standing from a click that missed, then a block for the next
  //  stand or the blast cover set 'on' it - it blew up at our feet, 19.8 → dead. Every useon here is looked at first; a bed is only
  //  clicked inside bedClick)
  const act0 = b.act; let bedOK = false;
  b.act = function (v, a, ...r) { if (v === 'useon' && !bedOK && a && a.length >= 3) { const w = b.world?.block?.(Math.floor(+a[0]), Math.floor(+a[1]), Math.floor(+a[2])); if (w && /(^|_)bed$/.test(String(w.name ?? '').replace(/^minecraft:/, ''))) { log(`dragon: not clicking the bed at ${a.slice(0, 3).join(' ')} (a block meant for beside it)`); return Promise.resolve(); } } return act0.call(this, v, a, ...r); };
  try { return await dragonFight0(); } finally { b.act = act0; }
  async function dragonFight0() {
  // (a cloud's size now, not as it came: they grow by their change rate each tick and go when their time is up - 12:05, twenty
  //  health gone in seven seconds with no cloud 'near' by the radius as sent. And where health went with nothing to explain it, a
  //  burn spot of our own, 4 round, for 10 s)
  const cloudSeen = new Map(), burns = [];
  const cr = (e) => { if (e.burn) return 4; let t0 = cloudSeen.get(e); if (!t0) { t0 = Date.now(); cloudSeen.set(e, t0); } const age = (Date.now() - t0) / 50; return Math.max(5, (e.radius ?? 5) + (Number.isFinite(e.cloudRate) ? e.cloudRate * age : 0)) + CLOUD_MARGIN; };   /* (hurt with the nearest cloud 12-17 off by its radius as sent, many times: a wider berth, CLOUD_MARGIN, 3 by default) */
  const ents = (re) => { const l = [...b.entities.values()].filter((e) => re.test(e.type ?? '') && !(/area_effect_cloud/.test(e.type ?? '') && Number.isFinite(e.cloudDur) && e.cloudDur > 0 && (Date.now() - (cloudSeen.get(e) ?? Date.now())) / 50 > e.cloudDur + 10));
    if (re.test('minecraft:area_effect_cloud')) { const now = Date.now(); for (let i = burns.length - 1; i >= 0; i--) if (now - burns[i].t > 10000) burns.splice(i, 1); l.push(...burns); }
    return l; };
  const cnt = (id) => [...(b.invText?.() ?? '').matchAll(new RegExp(`minecraft:${id}\\*(\\d+)`, 'g'))].reduce((n, m) => n + Number(m[1]), 0);
  const portalOpen = () => { for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 40; y <= 80; y++) if (/(^|:)end_portal$/.test(b.world.block(x, y, z)?.name ?? '')) return true; return false; };
  const blockId = () => ['cobblestone', 'end_stone', 'dirt', 'netherrack', 'cobbled_deepslate', 'stone'].find((i) => cnt(i) > 0) ?? 'cobblestone';   // (pillar with blocks in hand, not the bow: 18:17, four tries and no pillar)
  // sitting: by the fountain, low, and still for a second (17:00: 'it sits' said of it passing low over the middle, and every
  //  spell in our hole cut short by it)
  // (sampled four times a second whatever else is going on: sampled only when asked, it said 'sits' and 'not' by turns while it
  //  sat still at -0.5 66.6 -0.0 for a minute - 20:57)
  let dLast = null, dMoved = 0;
  const dSample = setInterval(() => { const d = [...b.entities.values()].find((e) => /ender_dragon$/.test(e.type ?? '')); if (!d) { dLast = null; return; } if (!dLast || Math.hypot(d.x - dLast.x, d.y - dLast.y, d.z - dLast.z) > 0.25) { dMoved = Date.now(); dLast = { x: d.x, y: d.y, z: d.z }; } }, 250);
  const perchedNow = () => { const d = ents(/ender_dragon$/)[0]; return !!d && Math.hypot(d.x, d.z) < 8 && d.y < 72 && Date.now() - dMoved > 800; };
  const bname = (x, y, z) => (b.world.block(x, y, z)?.name ?? '?').replace('minecraft:', '');
  async function uncage(c) {
    const bx = Math.floor(c.x), by = Math.floor(c.y), bz = Math.floor(c.z);
    const [dx, dz] = Math.abs(c.x) > Math.abs(c.z) ? [-Math.sign(c.x), 0] : [0, -Math.sign(c.z)], [lx, lz] = [-dz, dx];
    let kw = 0; for (let k = 1; k <= 6 && !kw; k++) if (bname(bx + dx * k, by, bz + dz * k) === 'iron_bars') kw = k;
    if (!kw) { log(`dragon: no cage wall found toward the middle from the crystal at ${key(c)}`, { dc: true }); return false; }
    // (a cell with end stone for ground and room above it, one to three out from the wall, nearest first: 'beside the wall' was
    //  obsidian or air at 12 -36 and the path search set the pillar down eight blocks off - 23:12)
    let sx = bx + dx * (kw + 1), sz = bz + dz * (kw + 1);
    { const ground = (x, z) => { for (let y = 72; y > 50; y--) if (!/^(air|\?)$/.test(bname(x, y, z))) return { y, n: bname(x, y, z) }; return null; };
      // (the highest ground of them, open sky over it all the way up: 23:55, 12 -36 lies in a dip at 58 and the pillar would not rise
      //  there - something over it, or the dip's walls)
      const cands = [];
      for (const k of [1, 2, 3]) for (const l of [0, -1, 1, -2, 2]) { const x = bx + dx * (kw + k) + lx * l, z = bz + dz * (kw + k) + lz * l, g = ground(x, z);
        if (g && g.n === 'end_stone' && [...Array(by - g.y + 3).keys()].slice(1).every((h) => bname(x, g.y + h, z) === 'air')) cands.push({ x, z, y: g.y, k }); }
      cands.sort((u, w) => w.y - u.y || u.k - w.k);
      const best = cands[0] ? [cands[0].x, cands[0].z] : null;
      if (best) [sx, sz] = best; else { log(`dragon: uncage: no ground beside the cage of ${key(c)}`); return false; } }
    log(`dragon: the caged crystal at ${key(c)} (y ${by}): up beside its wall at ${sx} ${sz}, the bars out, back down, shot from out by the middle`, { dc: true });
    // (there by the path search with the watches off, twice if need be: walk() waited on its breath and gave up - 21:43)
    // (on the way the breath watch stays on: 03:04, walking to the second cage with every watch off, through its breath, dead in six
    //  seconds from full health. Cut short if a cloud is met; the pillar and the bars are done with the watches off)
    for (let t = 0; t < 3 && Math.hypot(b.state().pos.x - sx - 0.5, b.state().pos.z - sz - 0.5) > 1; t++) { if (inCloud()) { uncageWait = Date.now() + 25000; log('dragon: uncage: its breath on the way: later (25 s)'); return false; } await walk(sx + 0.5, sz + 0.5, 6000, true); if (Math.hypot(b.state().pos.x - sx - 0.5, b.state().pos.z - sz - 0.5) > 1 && !inCloud()) await gotoFor([String(sx), String(sz)], 8000); }
    let P = b.state().pos; if (Math.hypot(Math.floor(P.x) - sx, Math.floor(P.z) - sz) > 1.5 || Math.hypot(Math.floor(P.x) - (bx + dx * kw), Math.floor(P.z) - (bz + dz * kw)) < 0.5) {   /* (a cell beside it does: 07:03, one block off and given up) */ log(`dragon: uncage: could not stand at ${sx} ${sz} (at ${Math.floor(P.x)} ${Math.floor(P.z)})`); return false; }
    const feet = () => Math.floor(b.state().pos.y + 0.01), up = by - 1 - feet();
    // (up in steps, the breath watch off meanwhile - it stopped the pillar at 60 and 69 of 82 and 79, 07:12: up there, there is no
    //  getting away from it anyway)
    delegating = true; try {
      // (on the middle of the cell first: off its middle each pillar step slid it about - 22:25, 12 to 16.8 and never up)
      { const C = b.state().pos; if (Math.abs(C.x - Math.floor(C.x) - 0.5) > 0.2 || Math.abs(C.z - Math.floor(C.z) - 0.5) > 0.2) { await b.act('lookat', [String(Math.floor(C.x) + 0.5), String(C.y), String(Math.floor(C.z) + 0.5)]).catch(() => {}); await b.act('sneak', ['on']).catch(() => {}); await b.act('walk', ['forward', '3']).catch(() => {}); await b.act('sneak', ['off']).catch(() => {}); } }
      // (14:02-14:03 on 19 Nov with Protection III: pushed about by its breath at the foot of a cage pillar, the watches off while
      //  delegating, 19 → dead in a minute and one apple eaten. Off at 13 health, in its breath, or pushed off twice)
      const f00 = feet(); let pushes = 0, aborted = false;
      for (let t = 0, last = feet(); t < 12 && feet() < by - 1 && me.connected && !b.state().dead; t++) { if ((me.hp ?? 20) < 13 || (feet() <= f00 + 1 && inCloud())) { log(`dragon: uncage: ${(me.hp ?? 20) < 13 ? `health ${me.hp}` : 'its breath on us'} at the foot of the pillar: off, later (25 s)`); uncageWait = Date.now() + 25000; aborted = true; break; } if (feet() <= f00 + 1 && Math.hypot(b.state().pos.x - sx - 0.5, b.state().pos.z - sz - 0.5) > 1) { if (++pushes > 1) { log('dragon: uncage: pushed off the spot twice (its breath): off, later (25 s)'); uncageWait = Date.now() + 25000; aborted = true; break; } log(`dragon: uncage: pushed off the spot (${b.state().pos.x.toFixed(1)} ${b.state().pos.z.toFixed(1)}) before the pillar rose: back to ${sx} ${sz}`); await gotoFor([String(sx), String(sz)], 5000); } /* (11:25 on 19 Nov: pushed 4 blocks off at step 0, the pillar went up at 30 28 for the wall at 30 24 and twenty blocks for nothing) */ const said = []; const tap = (l) => said.push(l); ctx.taps.add(tap); const p0 = b.state().pos; await b.act('stop', []).catch(() => {}); await b.act('sneak', ['on']).catch(() => {}); await gotoFor([String(Math.min(6, by - 1 - feet())), blockId()], 12000, 'pillar'); await b.act('sneak', ['off']).catch(() => {});   /* (sneaking: it slid off its own pillar's edge, 12 to 16.8 to 20 - 23:12) */ ctx.taps.delete(tap); log(`dragon: uncage: pillar step ${t}: from ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} ${p0.z.toFixed(1)} to feet ${feet()} · ${blockId()} ${cnt(blockId())} · ${said.filter((l) => /pillar|cancel|stopp|not /.test(l)).slice(-2).join(' | ').slice(0, 160)}`); if (feet() === last && t > 1) break; if (feet() < last - 1) { log(`dragon: uncage: knocked off the pillar (${last} → ${feet()}): not again this time`); break; } if (Math.hypot(Math.floor(b.state().pos.x) - sx, Math.floor(b.state().pos.z) - sz) > 1.5) { log(`dragon: uncage: the pillar is going up at ${Math.floor(b.state().pos.x)} ${Math.floor(b.state().pos.z)}, not at ${sx} ${sz}: stopped there (21:22, seven blocks off by step 1 and twenty blocks for nothing)`); break; } last = feet(); }
    } finally { delegating = false; }
    const down = async () => {
    delegating = true; try { await holdPick();
      for (let t = 0; t < 40 && me.connected && !b.state().dead; t++) { const F = b.state().pos, x1 = Math.floor(F.x), z1 = Math.floor(F.z), y1 = Math.floor(F.y + 0.01), under = bname(x1, y1 - 1, z1);
        if (!/^(cobblestone|end_stone|dirt|netherrack|cobbled_deepslate|stone)$/.test(under) || (under === 'end_stone' && y1 <= 62)) break;
        // (an apple on the way down at 14 or less: 02:57 on 20 Nov, killed by its breath digging down the cage pillar, no apple)
        if (await gapple()) { await holdPick(); continue; }
        await gotoFor([String(x1), String(y1 - 1), String(z1)], 3000, 'dig');
        for (let w = 0; w < 15 && Math.floor(b.state().pos.y + 0.01) >= y1; w++) await sleep(100); }
    } finally { delegating = false; }
    };
    // (down again first: 05:16, left twelve up on its pillar when the climb was cut short, dead there a minute later)
    if (feet() < by - 2) { log(`dragon: uncage: the pillar stopped at ${feet()} (wanted ${by - 1})`); await down(); return false; }
    let misplaced = false; { const A = b.state().pos; if (Math.hypot(Math.floor(A.x) - sx, Math.floor(A.z) - sz) > 1.5) { misplaced = true; log(`dragon: uncage: the pillar went up at ${Math.floor(A.x)} ${Math.floor(A.z)}, not beside the wall (${sx} ${sz}): down again`); } }   /* (22:57: up at 20 -37, eight from the bars) */   /* (one short is near enough to reach the bars: 22:25, stopped at 78 of 79 under the cage's edge) */
    let broke = 0;
    // (the pickaxe, not the cobblestone the pillar left in hand: 22:51, 28 s on one bar by hand, then off the pillar)
    delegating = true; try { await holdPick(); if (!misplaced) for (const y of [by - 1, by, by + 1]) for (const l of [0, -1, 1]) { const x = bx + dx * kw + lx * l, z = bz + dz * kw + lz * l; if (bname(x, y, z) !== 'iron_bars') continue; await gotoFor([String(x), String(y), String(z)], 3000, 'dig'); if (bname(x, y, z) !== 'iron_bars') broke++; } } finally { delegating = false; }
    log(`dragon: uncage: ${broke} bars broken out; down again`);
    if (broke >= 3) gaps.set(key(c), { bx, bz, by, dx, dz, kw });
    // (down our own pillar a block at a time, the pickaxe in hand and each fall waited for: dig_down took three minutes of 'nothing to
    //  dig (air)' - 22:07)
    await down();
    // shot from a pillar of ours nine out along the gap's line, the eyes level with the gap: from the ground the line only passes a
    // wall four blocks from the crystal from 33+ out - the fountain (04:16, 'to the line of the gap' for minutes). Nine out its blast
    // is mostly spent
    if (broke >= 3) {
      const tx = bx + dx * (kw + 9), tz = bz + dz * (kw + 9);
      for (let t = 0; t < 3 && Math.hypot(b.state().pos.x - tx - 0.5, b.state().pos.z - tz - 0.5) > 1; t++) { if (inCloud()) return true; await walk(tx + 0.5, tz + 0.5, 6000, true); if (Math.hypot(b.state().pos.x - tx - 0.5, b.state().pos.z - tz - 0.5) > 1) await gotoFor([String(tx), String(tz)], 8000); }
      if (Math.hypot(b.state().pos.x - tx - 0.5, b.state().pos.z - tz - 0.5) <= 1.2) {
        delegating = true; try {
          await b.act('stop', []).catch(() => {});
          for (let tries = 0; tries < 2 && feet() < by - 2 && me.connected && !b.state().dead && (me.hp ?? 0) >= 12 && cnt('cobblestone') + cnt('end_stone') >= by - feet(); tries++) {
            if (tries) { log('dragon: uncage: up the shooting pillar once more'); if (Math.hypot(b.state().pos.x - tx - 0.5, b.state().pos.z - tz - 0.5) > 1) await gotoFor([String(tx), String(tz)], 6000); await b.act('stop', []).catch(() => {});
              // (09:44 on 19 Nov: knocked off, the second pillar went up wherever it stood - 1 out from the crystal - and its blast
              //  killed us at the first arrow. Only from the spot nine out)
              if (Math.hypot(b.state().pos.x - tx - 0.5, b.state().pos.z - tz - 0.5) > 1.2) { log(`dragon: uncage: not back on the shooting spot (${Math.round(b.state().pos.x)} ${Math.round(b.state().pos.z)} for ${tx} ${tz}): not again this time`); break; } }
            for (let t = 0, last = feet(); t < 8 && feet() < by - 1 && me.connected && !b.state().dead; t++) { await b.act('sneak', ['on']).catch(() => {}); await gotoFor([String(Math.min(6, by - 1 - feet())), blockId()], 12000, 'pillar'); await b.act('sneak', ['off']).catch(() => {}); if (feet() === last && t > 1) break; if (feet() < last - 1) { log(`dragon: uncage: knocked off the pillar (${last} → ${feet()}): not again this time`); break; } last = feet(); }
          }
          // (shot only with the eyes level with the gap: 06:28, knocked down to 64 and six arrows sent from there into the bars)
          if (feet() < by - 3) { log(`dragon: uncage: not up to the gap (feet ${feet()}): from the ground on its line later`); }
          else if (Math.hypot(c.x - b.state().pos.x, c.z - b.state().pos.z) < 6) { log(`dragon: uncage: ${Math.round(Math.hypot(c.x - b.state().pos.x, c.z - b.state().pos.z))} from the crystal: too near its blast to shoot`); }
          else {
          log(`dragon: uncage: on a pillar ${Math.round(Math.hypot(c.x - b.state().pos.x, c.z - b.state().pos.z))} out, eyes at ${(b.state().pos.y + 1.62).toFixed(1)}: shooting through the gap`);
          // (10:07-10:08 on 19 Nov: six arrows from the shooting pillar while its breath took us from 19 to 5 - no apple while up there.
          //  An apple at 12 or less between arrows, and down at 8)
          for (let n = 0; n < 6 && [...b.entities.values()].includes(c); n++) { if ((me.hp ?? 20) <= 8) { log(`dragon: uncage: health ${me.hp} on the shooting pillar: down`); break; } if (await gapple()) await sleep(300); await shootAt(c.x, c.y + 1, c.z, [1, 0.97, 1.03, 1, 0.94, 1.06][n]); for (let w = 0; w < 6 && [...b.entities.values()].includes(c); w++) await sleep(300); }
          const hit = ![...b.entities.values()].includes(c);
          log(`dragon: uncage: ${hit ? 'the caged crystal is gone' : 'six arrows and it stands'}`, { dc: true });
          }
          await holdPick();
          for (let t = 0; t < 40 && me.connected && !b.state().dead; t++) { const F = b.state().pos, x1 = Math.floor(F.x), z1 = Math.floor(F.z), y1 = Math.floor(F.y + 0.01), under = bname(x1, y1 - 1, z1);
            if (!/^(cobblestone|end_stone|dirt|netherrack|cobbled_deepslate|stone)$/.test(under) || (under === 'end_stone' && y1 <= 62)) break;
            await gotoFor([String(x1), String(y1 - 1), String(z1)], 3000, 'dig'); for (let w = 0; w < 15 && Math.floor(b.state().pos.y + 0.01) >= y1; w++) await sleep(100); }
        } finally { delegating = false; }
      }
    }
    // (fewer than three bars out and the crystal still there: not opened - tried again later, not counted as open: 21:35 on 19 Nov,
    //  two bars broken, the cage taken as open, eight arrows into the bars from the ground, and left alone for good)
    if (broke < 3 && [...b.entities.values()].includes(c)) { uncageWait = Date.now() + 25000; log(`dragon: uncage: only ${broke} bars out: the cage still shut, later`); return false; }
    return true;
  }
  let fox = null;
  const sealOver = () => sealOverHead(b, (m) => log(m));
  // beforehand: a shaft three deep, 30 out on this side, dug (its end stone kept for the seal) and filled again with our cobblestone
  async function prepFox() {
    const Q = b.state().pos, l = Math.hypot(Q.x, Q.z) || 1, tx = Math.round((Q.x / l) * 30), tz = Math.round((Q.z / l) * 30);
    await walk(tx + 0.5, tz + 0.5, 12000, true); await gotoFor([String(tx), String(tz)], 6000);
    const R = b.state().pos, fx = Math.floor(R.x), fz = Math.floor(R.z), fy = Math.floor(R.y + 0.01);
    if (bname(fx, fy - 1, fz) !== 'end_stone') { log(`dragon: no hole made: ${bname(fx, fy - 1, fz)} underfoot at ${fx} ${fz}`); return; }
    await gotoFor(['3'], 9000, 'dig_down'); const dy = fy - Math.floor(b.state().pos.y + 0.01);
    await gotoFor([String(dy), 'cobblestone'], dy * 1600 + 2000, 'pillar');
    fox = { x: fx, z: fz }; log(`dragon: a hole to heal in made ready at ${fx} ${fz} (${dy} deep, filled with our cobblestone; end stone ${cnt('end_stone')})`);
  }
  // its health as its bar shows it (the attribute updates seldom: 63.8 for four minutes while the bar went 63% to 100%, 09:47)
  const bar = () => (b.bossHealth ? Math.round(b.bossHealth.v * 200) : '?');
  // before the click: four and a half out from the bed straight back along its line (the furthest a click reaches), a block of ours
  // set on the floor between, then the click over it (12:13 in the lab: from a block and a half, 18 health to dead by our own bed)
  // a bed clicked on the face the eyes can see: its top when the eyes are well over it, else the side toward us, then the other
  // (10:18 on 19 Nov: a bed on a stand, its top at 62.56 and the eyes at 62.6 after the step back down the slope - 'not under the
  //  crosshair' on the top face twice, the bed left standing for the next perch)
  async function bedClick(X, BY, Z, dx, dz) {
    const isB = () => /(^|_)bed$/.test(bname(X, BY, Z)), side = dx > 0 ? 'west' : dx < 0 ? 'east' : dz > 0 ? 'north' : 'south';
    // (health read again at the click, not at the start of the try: 00:50 on 20 Nov, eighteen seconds of stands that did not go up
    //  between, then clicked uncovered from 4.4 and dead by it)
    if ((me.hp ?? 0) < Number(process.env.BOT_BED_HP ?? 18.5) - 0.5) { log(`dragon: health ${me.hp} at the click: the bed left for now`); return false; }
    const eye = b.state().pos.y + 1.62, faces = eye > BY + 0.5625 + 0.25 ? ['up', side] : [side, 'up'];
    const said2 = []; const t2 = (l) => said2.push(l); ctx.taps.add(t2);
    // (both halves of it: 06:37 on 20 Nov in the lab, the side of the far half asked for and the crosshair on the near half - 'not under
    //  the crosshair' though it was the same bed. The half nearer us first)
    const Q0 = b.state().pos, halves = [[X, Z], ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([u, w]) => [X + u, Z + w]).filter(([x, z]) => /(^|_)bed$/.test(bname(x, BY, z)))].sort((u, w) => Math.hypot(u[0] + 0.5 - Q0.x, u[1] + 0.5 - Q0.z) - Math.hypot(w[0] + 0.5 - Q0.x, w[1] + 0.5 - Q0.z));
    const anyB = () => halves.some(([x, z]) => /(^|_)bed$/.test(bname(x, BY, z)));
    bedOK = true; try { for (const [hx, hz] of halves) for (const f of faces) { if (!anyB()) break; await b.act('useon', [String(hx), String(BY), String(hz), f]).catch(() => {}); await sleep(600); } } finally { bedOK = false; ctx.taps.delete(t2); }
    if (anyB()) log(`dragon: the bed would not take the click (${faces.join(', then ')}; eyes ${eye.toFixed(2)}, its top ${(BY + 0.5625).toFixed(2)}): ${said2.slice(-1)[0] ?? '?'}`);
    return !anyB();
  }
  async function backOff(bx, by, bz, dx, dz) {
    const tx = bx - dx * 4.2, tz = bz - dz * 4.2;
    for (let t = 0; t < 3 && Math.hypot(b.state().pos.x - bx - 0.5, b.state().pos.z - bz - 0.5) < 4.0; t++) { if (t === 0) await dash(tx + 0.5, tz + 0.5, 1500); else await gotoFor([String(tx), String(tz)], 2500); }
    const Q = b.state().pos, fx = Math.floor(Q.x), fz = Math.floor(Q.z), fy = Math.floor(Q.y + 0.01), cx = fx + dx, cz = fz + dz;
    // (the block between only where the line from the eyes to the bed's top still passes over it: 09:51 on 19 Nov, set at 3.2 off
    //  and the bed 'not under the crosshair' twice - the line from the eyes ran into the block's far top edge)
    const offB = Math.hypot(Q.x - bx - 0.5, Q.z - bz - 0.5), farEdge = Math.abs(dx ? (dx > 0 ? cx + 1 - Q.x : Q.x - cx) : (dz > 0 ? cz + 1 - Q.z : Q.z - cz)), eyeY = Q.y + 1.62, lineY = eyeY - ((eyeY - (by + 0.5625)) * farEdge) / (offB || 1), clears = lineY > fy + 1.08;
    if (!clears) log(`dragon: no block between (the line to the bed would run into it: ${lineY.toFixed(2)} over its top at ${fy + 1})`);
    if (clears && bname(cx, fy, cz) === 'air' && !/^(air|\?)$/.test(bname(cx, fy - 1, cz)) && Math.hypot(cx - bx, cz - bz) > 0.5) { await gotoFor([], 1200, 'hold_' + blockId()); await b.act('useon', [String(cx), String(fy - 1), String(cz), 'up']).catch(() => {}); await sleep(250); }
    const off = Math.hypot(Q.x - bx - 0.5, Q.z - bz - 0.5);
    log(`dragon: ${off < 3.1 ? 'not clicking' : 'clicking'} the bed from ${off.toFixed(1)} off${bname(cx, fy, cz) !== 'air' ? ', a block between' : ''}`);
    // (no block between and under 4.2 off: not clicked - 18:39 on 19 Nov, 3.1 off with nothing between, 19 → 3.8 by our own bed and
    //  dead a few seconds later)
    // (and nothing between for any reason - the cell taken, the click refused: 21:40, 3.7 off and uncovered, 20 → 5.8, dead 14 s on)
    if ((!clears || bname(cx, fy, cz) === 'air') && off < Number(process.env.BOT_BED_BARE ?? 99)) { log(`dragon: not clicking the bed from ${off.toFixed(1)} off with nothing between`); return false; }
    return off >= 3.1;   /* (12:57: 'from 0.2 off' - standing on it - and dead by it) */
  }
  // (how deep: 17:58 in the lab, three deep and sealed with end stone, killed by the dragon's own body flying low over it)
  const DEEP = Number(process.env.BOT_DEEP ?? 5);
  const burrow = { at: null, out: null, in: null, kills: 0 };
  // (the pickaxe in hand before any digging: 'dig' uses what is held - with the bow, end stone took the whole 20 s and did not
  //  break, 16:53; every hole of the first burrow runs was '0 deep')
  const holdPick = async () => { const pk = /minecraft:(\w+_pickaxe)\*/.exec(b.invText?.() ?? '')?.[1]; if (pk) await gotoFor([], 1500, 'hold_' + pk); };
  const key = (e) => `${Math.round(e.x)},${Math.round(e.z)}`;
  // (the arrow's flight worked out, not guessed: full draw 3 blocks a tick, 0.05 down a tick, 1% lost a tick; the pitch that
  //  brings it to the height of the target at its distance, the lower of the two. k nudges the speed when it keeps missing)
  const pitchFor = (h, dy, v = 3) => { let best = null; for (let a = -30; a <= 60; a += 0.25) { const r = (a * Math.PI) / 180; let x = 0, y = 0, vx = Math.cos(r) * v, vy = Math.sin(r) * v; for (let t = 0; t < 200 && x < h; t++) { x += vx; y += vy; vx *= 0.99; vy = vy * 0.99 - 0.05; } if (x >= h && (best === null || Math.abs(y - dy) < best.e)) { best = { a, e: Math.abs(y - dy) }; if (best.e < 0.15) break; } } return best ? best.a : 45; };
  const shootAt = async (x, y, z, k = 1) => { const P = b.state().pos, eye = P.y + 1.62, h = Math.hypot(x - P.x, z - P.z), a = pitchFor(h, y - eye, 3 * k); await b.act('hold_bow', []).catch(() => {}); await gotoFor([String(x), String(eye + h * Math.tan((a * Math.PI) / 180)), String(z)], 1500, 'lookat'); await gotoFor(['22'], 3000, 'use'); };
  // (BOT_NEAR_S/BOT_FAR_S: near for so many seconds, then far for so many, while it flies - to be asked to sit without standing in its
  //  fireballs the whole time; off unless both are set)
  const farByClock = () => { const n = Number(process.env.BOT_NEAR_S || 0), f = Number(process.env.BOT_FAR_S || 0); if (!n || !f) return false; return ((Date.now() - t0) / 1000) % (n + f) >= n; };
  let circDir = 1, farMode = false; const again = new Map(); let perchRec = null, bedsBlown = 0, eatingG = false, stuckAt = null, uncageWait = 0, digSaid = 0, seenDragon = false, lastSay = 0, shots = 0, hits = 0, hpWas = null, hurtAt = 0, emSaid = 0, emHits = 0, onPillar = null, guardSaid = 0, dodgeSaid = 0, holedAt = 0, bedAt = 0, noRoomAt = 0, seekSaid = 0, pillarFail = 0, gappleAt = 0, gapSaid = 0, sideSaid = 0, sideSaid2 = 0, dbgPerch = 0, uncaging = false, opened = new Set(), gaps = new Map(), caged = new Set(), leftAt = new Map(), aim = null, resting = false, perchSaid = 0, moved = ''; const all = new Set(), gone = new Set();
  const gapple = async () => { if (me.hp !== null && me.hp <= (process.env.BOT_NOHEALHOLE ? 14 : 12) && Date.now() - gappleAt > 6000) { const g = /minecraft:(enchanted_golden_apple|golden_apple)\*/.exec(b.invText?.() ?? '')?.[1]; if (g) { gappleAt = Date.now(); log(`dragon: health ${me.hp}: a ${g.replace(/_/g, ' ')}`); eatingG = true; try { await gotoFor([g], 2600, 'eat'); } finally { eatingG = false; } return true; } } return false; };
  await gotoFor([], 8000, 'armor_up');   // (what is carried is worn)
  if (/minecraft:shield\*/.test(b.invText?.() ?? '')) await gotoFor(['shield'], 4000, 'offhand');
  // (a carved pumpkin on the head: an enderman looked at stays calm. 19:12 and 19:15 in the lab, killed by one in the first four
  //  seconds both times - its seven a blow is worth more than the iron helmet's two points)
  if (/minecraft:carved_pumpkin\*/.test(b.invText?.() ?? '')) { await gotoFor(['carved_pumpkin'], 4000, 'equip'); log('dragon: a carved pumpkin on: the endermen stay calm'); }   // (armor_up leaves the shield in the pack: 18:36, every 'shield up' was a crouch with nothing in the left hand)
  const down = async () => { await b.act('look', [String(Math.round(b.state().yaw ?? 0)), '55']).catch(() => {}); };   // (eyes on the ground while walking: an enderman looked at is an enderman fought)
  // a walk that does not cross its breath (each cloud's own radius and three more) nor, while it flies, the middle where it lands
  // and breathes: round the fountain at the distance it stands instead (15:35 in the lab: from 15 health to dead in nine seconds,
  // walking through one on the way to a better spot)
  const segD = (ax, az, bx, bz, cx, cz) => { const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cz - az) * vz) / l2)); return Math.hypot(ax + vx * t - cx, az + vz * t - cz); };
  // (out of its breath at once: straight there at a sprint, no path search first - 18:50, five seconds on one spot in a cloud while
  //  a path was worked out; the path search only when the straight run did not get anywhere)
  const dash = async (tx, tz, ms = 3000) => {
    // (never out past the island's edge on a dash: 14:40 on 19 Nov, away from its breath outward from 35 18 to 47 42 and on into the
    //  void. A target beyond BOT_EDGE_R from the middle is drawn back onto that circle while we stand on the island)
    { const E = Number(process.env.BOT_EDGE_R ?? 50), q = b.state().pos, rt = Math.hypot(tx, tz); if (rt > E && Math.hypot(q.x, q.z) < E + 12) { tx = (tx / rt) * E; tz = (tz / rt) * E; } }
    const Q = b.state().pos, yaw = (Math.atan2(-(tx - Q.x), tz - Q.z) * 180) / Math.PI, d = Math.hypot(tx - Q.x, tz - Q.z);
    await b.act('look', [yaw.toFixed(0), '35']).catch(() => {}); await b.act('sprint', ['on']).catch(() => {});
    await b.act('walk', ['forward', String(Math.min(Math.round(ms / 50), Math.round((d / 5.6) * 20) + 2))]).catch(() => {});
    await b.act('sprint', ['off']).catch(() => {});
    const R = b.state().pos; if (Math.hypot(R.x - Q.x, R.z - Q.z) < Math.min(2, d / 2)) await gotoFor([String(Math.round(tx)), String(Math.round(tz))], ms);
  };
  const walk = async (tx, tz, ms = 3000, mid = false) => {
    const Q = b.state().pos, cl = ents(/area_effect_cloud$/);
    // (to it while it sits, the clouds' berth is narrower and the ways round wider: 12:17 on 19 Nov, of thirty perches twenty passed
    //  with no sword and no bed - 'no way to -1 4 clear of its breath: waiting' while it sat 54 s)
    const M = mid ? Number(process.env.BOT_PERCH_MARGIN ?? 0.8) : 3;
    const bad = (x, z) => cl.some((e) => segD(Q.x, Q.z, x, z, e.x, e.z) < cr(e) + M) || (!mid && segD(Q.x, Q.z, x, z, 0, 0) < 12);
    if (bad(tx, tz)) { const r = Math.max(16, Math.min(40, Math.hypot(Q.x, Q.z))), a0 = Math.atan2(Q.z, Q.x), want = Math.atan2(tz, tx); let da = want - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const opts = (mid ? [0.5, -0.5, 1.0, -1.0] : [0.5, -0.5]).map((k) => Math.sign(da || 1) * k).map((d) => [Math.cos(a0 + d) * r, Math.sin(a0 + d) * r]).filter(([x, z]) => !cl.some((e) => segD(Q.x, Q.z, x, z, e.x, e.z) < cr(e) + M));
      // (to it while it sits, with health to spare, straight through: 15:13 on 19 Nov, 'no way to -3 -3 clear of its breath' and a
      //  31 s perch gone by with no sword and no bed even at 0.8 of berth - a second in its breath costs less than a perch)
      if (!opts.length && mid && (me.hp ?? 0) >= Number(process.env.BOT_PERCH_THROUGH_HP ?? 21)) { if (Date.now() - (walk.thru ?? 0) > 15000) { walk.thru = Date.now(); log(`dragon: through its breath to it while it sits (health ${me.hp})`); } eatingG = true; try { await dash(tx, tz, 2500); } finally { eatingG = false; } return; }
      if (!opts.length) { if (Date.now() - (walk.said ?? 0) > 15000) { walk.said = Date.now(); log(`dragon: no way to ${Math.round(tx)} ${Math.round(tz)} clear of its breath: waiting`); }
        // (not waiting inside one: 05:30, 'waiting' with its breath on us, 20 to 3 in fourteen seconds - straight away from its middle)
        const e0 = cl.map((e) => ({ e, d: Math.hypot(Q.x - e.x, Q.z - e.z) })).filter((x) => x.d < cr(x.e) + 1.5).sort((u, w) => u.d - w.d)[0];
        if (e0) { const l = e0.d || 1, ux = e0.d < 0.3 ? 1 : (Q.x - e0.e.x) / l, uz = e0.d < 0.3 ? 0 : (Q.z - e0.e.z) / l, run = cr(e0.e) + 3 - e0.d; await dash(Q.x + ux * run, Q.z + uz * run, 2500); return; }
        await sleep(400); return; } [tx, tz] = opts[0]; }
    await down(); await gotoFor([String(Math.round(tx)), String(Math.round(tz))], ms);
  };
  // (its breath is six blocks across and is there in an instant; a shot takes four seconds. Whatever is being done is dropped the
  //  moment a cloud reaches to within two blocks - looked for three times a second, not once a shot)
  let fleeing = false, inFight = false, emFight = false, delegating = false;
  const inCloud = () => { const Q = b.state().pos; return ents(/area_effect_cloud$/).some((e) => Math.hypot(e.x - Q.x, e.z - Q.z) < cr(e) + 2 && Math.abs(e.y - Q.y) < 6); };
  // (and an enderman at arm's length while health is falling: 15:43, twenty health gone in six seconds mid-shot)
  let wHp = me.hp, wHurt = 0;
  const emOnMe = () => { const Q = b.state().pos; return Date.now() - wHurt < 4000 && ents(/enderman$/).some((e) => Math.hypot(e.x - Q.x, e.y - Q.y, e.z - Q.z) < 3.4); };
  // (17:43 in the lab: 20 health to dead in nine seconds, by the dragon itself, while walking to a better spot. When it comes at us
  //  low and close, whatever is going on stops: face it, the shield up (sneaking, shield in the offhand), until it has gone past)
  const charging = () => { const Q = b.state().pos, d = ents(/ender_dragon$/)[0]; if (!d || (Math.hypot(d.x, d.z) < 8 && d.y < 76)) return null; const h = Math.hypot(d.x - Q.x, d.z - Q.z); return h < 16 && d.y - Q.y < 10 && d.y - Q.y > -4 ? d : null; };
  let guarding = false;
  const dbgT = process.env.BOT_DEBUG ? setInterval(() => log(`dragon: dbg clouds ${ents(/area_effect_cloud$/).map((e) => `${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.z)}`).join(' ')} me ${Object.values(b.state().pos).slice(0, 3).map(Math.round).join(',')}`), 12000) : null;
  const fbSeen = new Map();
  // (18:13 in the lab: a fireball came down three blocks off and its cloud took the last eleven health in four seconds. Each one is
  //  followed: where it will be over the next three seconds; one that will pass within six blocks of us - out of its line, sideways)
  let dodge = null;
  const watch3 = setInterval(() => { const Q = b.state().pos, now = new Set(ents(/dragon_fireball$/));
    for (const f of now) { const o = fbSeen.get(f); if (o && Date.now() - o.t > 100) { const dt = (Date.now() - o.t) / 1000, vx = (f.x - o.x) / dt, vy = (f.y - o.y) / dt, vz = (f.z - o.z) / dt;
        for (let s = 0; s <= 3; s += 0.1) { const px = f.x + vx * s, py = f.y + vy * s, pz = f.z + vz * s; if (py < Q.y - 2) { if (Math.hypot(px - Q.x, pz - Q.z) < 6.5 && !dodge) { const l = Math.hypot(vx, vz) || 1; let sx = -vz / l, sz = vx / l; if ((Q.x - px) * sx + (Q.z - pz) * sz < 0) { sx = -sx; sz = -sz; } dodge = { x: Q.x + sx * 10 + (Q.x - px) * 0.5, z: Q.z + sz * 10 + (Q.z - pz) * 0.5, t: Date.now() }; if (!fleeing && !delegating) b.cancel?.(); } break; } if (Math.hypot(px - Q.x, py - Q.y, pz - Q.z) < 4 && !dodge) { const l = Math.hypot(vx, vz) || 1; dodge = { x: Q.x - (vz / l) * 10, z: Q.z + (vx / l) * 10, t: Date.now() }; if (!fleeing && !delegating) b.cancel?.(); break; } } }
      if (process.env.BOT_DEBUG2) log(`dragon: dbg fb ${f.id ?? '?'} ${f.x.toFixed(1)} ${f.y.toFixed(1)} ${f.z.toFixed(1)} me ${Q.x.toFixed(1)} ${Q.y.toFixed(1)} ${Q.z.toFixed(1)}`);
      fbSeen.set(f, { x: f.x, y: f.y, z: f.z, t: Date.now() }); } for (const [f, l] of fbSeen) if (!now.has(f)) { fbSeen.delete(f); if (process.env.BOT_DEBUG) log(`dragon: dbg a fireball ended ${Math.hypot(l.x - Q.x, l.z - Q.z).toFixed(1)} off (dy ${(l.y - Q.y).toFixed(1)}) health ${me.hp}`); } }, 150);
  // (no cancel while a golden apple is being eaten: 10:52-10:53 on 19 Nov, 18 → 1 in eleven seconds in its breath and no apple
  //  went down - the cloud watch cancelled every eat at once)
  const watch = setInterval(() => { if (delegating || eatingG) return; if (!guarding && !fleeing && !inFight && me.connected && charging()) b.cancel?.(); }, 250);
  const watch2 = setInterval(() => { if (delegating || eatingG) return; if (me.hp !== null && wHp !== null && me.hp < wHp - 0.5) wHurt = Date.now(); wHp = me.hp; if (!fleeing && (!inFight || inCloud()) && me.connected && (inCloud() || (emOnMe() && !emFight))) { b.cancel?.(); if (inCloud()) onPillar = null; } }, 300);
  // (an apple before anything at 8 or less: 21:00 on 19 Nov, its bar at 1 of 200, us at 4.4 with seven apples left, and seventeen
  //  seconds of dashes from its breath with none eaten - then dead. Whatever is going on is cut short so the round's apple comes)
  let lowSaid = 0;
  const watch4 = setInterval(() => { if ((me.hp ?? 20) <= 8 && Date.now() - lowSaid > 5000) { lowSaid = Date.now(); const iv = b.invText?.() ?? ''; log(`dragon: low ${me.hp}: apples ${(/golden_apple\*(\d+)/.exec(iv) ?? [])[1] ?? 'none in the text'}, last eaten ${gappleAt ? Math.round((Date.now() - gappleAt) / 1000) + ' s ago' : 'never'}, eating ${eatingG}, delegating ${delegating}, fleeing ${fleeing}, guarding ${guarding}`); } if (eatingG || delegating || !me.connected) return; if ((me.hp ?? 20) <= 12 && Date.now() - gappleAt > 6000 && /minecraft:(enchanted_)?golden_apple\*/.test(b.invText?.() ?? '')) b.cancel?.(); }, 300);
  try { return await dragonLoop(); } finally { clearInterval(watch4); clearInterval(watch); clearInterval(watch2); clearInterval(watch3); clearInterval(dSample); if (dbgT) clearInterval(dbgT); await b.act('sneak', ['off']).catch(() => {}); }
  async function dragonLoop() {
  setTimeout(() => {}, 0);
  log(`dragon: in the End with ${cnt('arrow')} arrows; crystals in view: ${ents(/ender_crystal$/).length}`, { dc: true });
  // arriving through the portal: the obsidian platform out over the void (100 out from the middle). A bridge of our blocks toward the
  // island, sneaking at the edge, until there is end stone under us
  { const A0 = b.state().pos, under = () => bname(Math.floor(b.state().pos.x), Math.floor(b.state().pos.y + 0.01) - 1, Math.floor(b.state().pos.z));
    if (under() === 'obsidian' || Math.hypot(A0.x, A0.z) > 75) {
      const [ddx, ddz] = Math.abs(A0.x) > Math.abs(A0.z) ? [-Math.sign(A0.x), 0] : [0, -Math.sign(A0.z)], yaw = ddx === 1 ? -90 : ddx === -1 ? 90 : ddz === 1 ? 0 : 180;
      log(`dragon: on the platform at ${Math.round(A0.x)} ${Math.round(A0.z)}: a bridge toward the island`, { dc: true });
      delegating = true;
      try {
        // (up to the island's height first: bridged at the platform's 49, it ran in under the island's edge at 68 and could not climb
        //  out - 01:35. Its top out there lies about 55-62)
        for (let t = 0; t < 6 && Math.floor(b.state().pos.y + 0.01) < 63; t++) { await b.act('sneak', ['on']).catch(() => {}); await gotoFor([String(Math.min(6, 63 - Math.floor(b.state().pos.y + 0.01))), blockId()], 12000, 'pillar'); await b.act('sneak', ['off']).catch(() => {}); }
        let bHp = me.hp;
        // (19:39 on 19 Nov: at the bridge's island end its breath took 20 → 0 in ten seconds inside one 9 s bridge step - nothing
        //  looked in between. A watch on the bridge: at 12 or in its breath the step is cut short, then an apple, then back along
        //  the bridge, sneaking, until clear)
        const bw = setInterval(() => { if (!eatingG && me.connected && ((me.hp ?? 20) <= 12 || inCloud())) b.cancel?.(); }, 250);
        try {
        for (let t = 0; t < 60 && me.connected && !b.state().dead; t++) {
          for (let k = 0; k < 8 && inCloud() && me.connected && !b.state().dead; k++) { if (k === 0) log('dragon: its breath on the bridge: back along it'); await b.act('sneak', ['on']).catch(() => {}); await b.act('look', [String(yaw + 180), '60']).catch(() => {}); eatingG = true; try { await b.act('walk', ['forward', '12']).catch(() => {}); } finally { eatingG = false; } await sleep(300); }
          // (09:25-09:29 on 19 Nov in the lab: four silent minutes on the bridge, health down to 1 with nothing logged and no apple
          //  eaten - the watches are off while delegating - then knocked off it into the void. Health said when it falls, and a
          //  golden apple at 12 or less here too, sneaking so a knock does not carry us over the edge while we eat)
          if (me.hp !== null && bHp !== null && me.hp < bHp - 0.5) log(`dragon: hurt on the bridge: ${bHp} → ${me.hp} at ${Math.round(b.state().pos.x)} ${Math.round(b.state().pos.y)} ${Math.round(b.state().pos.z)}`);
          bHp = me.hp;
          if (me.hp !== null && me.hp <= 12 && /minecraft:(enchanted_)?golden_apple\*/.test(b.invText?.() ?? '')) { const g = /minecraft:(enchanted_golden_apple|golden_apple)\*/.exec(b.invText?.() ?? '')[1]; log(`dragon: health ${me.hp} on the bridge: a ${g.replace(/_/g, ' ')}`); await b.act('sneak', ['on']).catch(() => {}); eatingG = true; try { await gotoFor([g], 2600, 'eat'); } finally { eatingG = false; } bHp = me.hp; }
          if (process.env.BOT_DEBUG) { const C = b.state().pos; log(`dragon: dbg bridge ${t}: at ${C.x.toFixed(1)} ${C.y.toFixed(1)} ${C.z.toFixed(1)} on ${under()}`); }
          // (on to the edge of what is under us first, along the bridge's line, then a few blocks out)
          for (let w = 0; w < 6 && /^(obsidian|cobblestone|end_stone)$/.test(bname(Math.floor(b.state().pos.x) + ddx, Math.floor(b.state().pos.y + 0.01) - 1, Math.floor(b.state().pos.z) + ddz)); w++) await gotoFor([String(Math.floor(b.state().pos.x) + ddx), String(Math.floor(b.state().pos.z) + ddz)], 2000);
          if (under() === 'end_stone' && Math.hypot(b.state().pos.x, b.state().pos.z) < 75) break;
          // (on the line's middle: it drifted half a block sideways and the next click aimed at the cell beside the bridge - 01:27)
          { const C = b.state().pos; const cx = ddx ? C.x : Math.floor(A0.x) + 0.5, cz = ddz ? C.z : Math.floor(A0.z) + 0.5; if (Math.abs(C.x - cx) > 0.2 || Math.abs(C.z - cz) > 0.2) { await b.act('sneak', ['on']).catch(() => {}); await b.act('lookat', [String(cx), String(C.y), String(cz)]).catch(() => {}); await b.act('walk', ['forward', '3']).catch(() => {}); await b.act('sneak', ['off']).catch(() => {}); } }
          // (the island's side ahead, higher than the bridge: up a block onto it)
          { const C = b.state().pos, ax = Math.floor(C.x) + ddx, az = Math.floor(C.z) + ddz, fy0 = Math.floor(C.y + 0.01); if (!/^(air|\?)$/.test(bname(ax, fy0, az))) { await gotoFor(['1', blockId()], 3000, 'pillar'); await gotoFor([String(ax), String(az)], 3000); continue; } }
          await b.act('look', [String(yaw), '75']).catch(() => {});
          const x0 = b.state().pos.x, z0 = b.state().pos.z;
          await gotoFor(['3', blockId()], 9000, 'bridge');
          if (Math.hypot(b.state().pos.x - x0, b.state().pos.z - z0) < 0.5) { log(`dragon: the bridge did not go on at ${Math.round(x0)} ${Math.round(z0)}`); if (t > 3) break; }
        }
        } finally { clearInterval(bw); }
        log(`dragon: off the bridge at ${Math.round(b.state().pos.x)} ${Math.round(b.state().pos.z)} on ${under()}`);
      } finally { delegating = false; }
    } }
  if (process.env.BOT_FOX && cnt('cobblestone') >= 8 && /pickaxe/.test(b.invText?.() ?? '')) await prepFox().catch((e) => log(`dragon: hole: ${e.message}`));
  let itT = Date.now();
  while (live() && me.connected && me.dim === 'the_end' && Date.now() - t0 < Number(process.env.BOT_FIGHT_MS ?? 10800000)) {
    if (process.env.BOT_DEBUG && Date.now() - itT > 3500) log(`dragon: dbg a round took ${((Date.now() - itT) / 1000).toFixed(1)} s`); itT = Date.now();
    if (b.state().dead) { log('dragon: dead', { dc: true }); return false; }
    if (portalOpen() && seenDragon && !ents(/ender_dragon$/).length) { log(`dragon: the exit portal is open: the dragon is dead (${Math.round((Date.now() - t0) / 1000)} s, ${shots} arrows, ${hits} sword hits)`, { dc: true }); return true; }
    const P = b.state().pos;
    if (onPillar && (Math.hypot(P.x - onPillar.x - 0.5, P.z - onPillar.z - 0.5) > 1.2 || P.y < onPillar.y - 1)) onPillar = null;   // (knocked or walked off it)
    // (stuck down below the island's top: 10:24-10:45 on 19 Nov in the lab, knocked down to 46 48 -15 beside the island's flank and
    //  twenty minutes there - 'no way ... waiting' - with its bar at 137 and full health. Not moved 2 blocks in 60 s and the feet
    //  under 56: a pillar of our blocks up to 60, sneaking, then on)
    // (low counts, not only still: 00:56-01:09 on 20 Nov, thirteen minutes in the pit at 46-48 48 -10..-16, pacing six blocks to and
    //  fro, so never 'still' - the clock runs while the feet stay under 56 and only resets above it)
    if (!stuckAt || Math.floor(P.y + 0.01) >= 56 || Math.abs(P.y - stuckAt.y) > 3) stuckAt = { x: P.x, y: P.y, z: P.z, t: Date.now() };
    // (never out on the portal's platform, 100 out at 49 over the void: 09:11 on 20 Nov, 'up by digging' there went down into the void)
    // (no blocks left for the pillar: up by digging alone - 07:48-08:22 on 20 Nov, out of cobblestone after the cages, half an hour
    //  in the pit at 48 47 -9 with nothing tried)
    else if (Date.now() - stuckAt.t > 60000 && Math.floor(P.y + 0.01) < 56 && Math.hypot(P.x, P.z) < 70 && !perchedNow() && cnt(blockId()) < 4) { log(`dragon: stuck at ${Math.round(P.x)} ${Math.floor(P.y + 0.01)} ${Math.round(P.z)} with no blocks: up to the sky by digging`, { dc: true }); await holdPick(); delegating = true; try { await gotoFor([], 40000, 'to_surface'); } finally { delegating = false; } if (Math.floor(b.state().pos.y + 0.01) < 56) await gotoFor([String(Math.round(P.x * 0.6)), String(Math.round(P.z * 0.6))], 15000); stuckAt = null; continue; }
    else if (Date.now() - stuckAt.t > 60000 && Math.floor(P.y + 0.01) < 56 && Math.hypot(P.x, P.z) < 70 && !perchedNow() && cnt(blockId()) >= 4) {
      const y0 = Math.floor(P.y + 0.01), up = Math.min(6, 60 - y0); log(`dragon: stuck at ${Math.round(P.x)} ${y0} ${Math.round(P.z)} for ${Math.round((Date.now() - stuckAt.t) / 1000)} s: ${up} up on a pillar`, { dc: true });
      delegating = true; try { await b.act('sneak', ['on']).catch(() => {}); await gotoFor([String(up), blockId()], 12000, 'pillar'); } finally { await b.act('sneak', ['off']).catch(() => {}); delegating = false; }
      // (11:05-11:08: the same pit at 46 48 -15 again, and the pillar rose two under an overhang. Up through it to the sky then -
      //  goal-exec's to_surface digs its own way - and only if that fails a walk toward the middle)
      if (Math.floor(b.state().pos.y + 0.01) < Math.min(56, y0 + 4)) { log(`dragon: the pillar stopped at ${Math.floor(b.state().pos.y + 0.01)}: up to the sky by digging`); await holdPick(); delegating = true; try { await gotoFor([], 40000, 'to_surface'); } finally { delegating = false; } }
      if (Math.floor(b.state().pos.y + 0.01) < 56) { log(`dragon: still at ${Math.floor(b.state().pos.y + 0.01)}: a walk toward the middle`); await gotoFor([String(Math.round(P.x * 0.6)), String(Math.round(P.z * 0.6))], 15000); }
      stuckAt = null; continue;
    }
    if (Date.now() - lastSay > 30000) { lastSay = Date.now(); log(`dragon: ${Math.round((Date.now() - t0) / 1000)} s · its health ${bar()} of 200 (from its bar) · health ${me.hp} · crystals ${all.size - gone.size} of ${all.size} seen stand (${left.size} left alone) · arrows ${cnt('arrow')} · at ${Math.round(P.x)} ${Math.round(P.y)} ${Math.round(P.z)}`); }
    // its breath on the ground, a fireball coming: ten blocks round the fountain, away from it
    // a golden apple at 12 or less (regeneration and absorption at once - what keeps a player in iron alive through its breath)
    if (me.hp !== null && me.hp <= 12 && /minecraft:(enchanted_)?golden_apple\*/.test(b.invText?.() ?? '') && Date.now() - gappleAt > 6000) { gappleAt = Date.now(); const g = /minecraft:(enchanted_golden_apple|golden_apple)\*/.exec(b.invText?.() ?? '')[1]; log(`dragon: health ${me.hp}: a ${g.replace(/_/g, ' ')}`); eatingG = true; try { await gotoFor([g], 2600, 'eat'); } finally { eatingG = false; } continue; }
    // BURROW (default; BOT_NOBURROW to leave): out in the open only in short spells. Measured in the lab, 16:20-16:40: a player
    // standing still on open ground beside the dragon was dead in 70 s (twice); in a 1x1 hole two deep it lived the three minutes
    // two times of three; sealed over with end stone three of three. So: one hole of ours, out of it to shoot (two crystals, 15 s,
    // or until hurt), back down into it and shut in until full health and 10 s at least; out again by digging the seal and a
    // pillar of cobblestone (which the next going-down digs out again in a moment). It sitting on the fountain: out for that
    if (!process.env.BOT_NOBURROW && !perchedNow() && /pickaxe/.test(b.invText?.() ?? '') && cnt('cobblestone') >= 6) {
      const crystalsLeft = ents(/ender_crystal$/).filter((e) => !left.has(key(e))).length + [...all].filter((k0) => !gone.has(k0) && !left.has(k0)).length;
      const outFor = Date.now() - (burrow.out ?? Date.now());
      const want = burrow.out && (outFor > 15000 || (me.hp ?? 20) < 17 || burrow.kills >= 2);
      if (!burrow.out || want) {
        delegating = true;
        try {
          const Q = b.state().pos, fx = Math.floor(Q.x), fz = Math.floor(Q.z), fy = Math.floor(Q.y + 0.01);
          if (!burrow.at || Math.hypot(fx - burrow.at.x, fz - burrow.at.z) > 2) {
            // a new hole where we stand if the ground is end stone, ≥14 from the middle, no obsidian within 4; else just here
            const here = bname(fx, fy - 1, fz) === 'end_stone' && Math.hypot(fx, fz) > 14;
            if (!here && !burrow.at) { const l = Math.hypot(Q.x, Q.z) || 1; await dash((Q.x / l) * 26, (Q.z / l) * 26, 4000); }
            // (end stone four deep under it, or in toward the middle until there is: 16:59, a hole dug through the island's thin edge
            //  and out of the world)
            for (let t = 0; t < 4; t++) { const R0 = b.state().pos, x0 = Math.floor(R0.x), z0 = Math.floor(R0.z), y0 = Math.floor(R0.y + 0.01);
              if ([...Array(DEEP + 1).keys()].slice(1).every((k) => bname(x0, y0 - k, z0) === 'end_stone')) break;
              const l0 = Math.hypot(R0.x, R0.z) || 1; await dash(R0.x - (R0.x / l0) * 5, R0.z - (R0.z / l0) * 5, 2500); }
            const R = b.state().pos; burrow.at = { x: Math.floor(R.x), z: Math.floor(R.z), y: Math.floor(R.y + 0.01) };
            log(`dragon: our hole at ${burrow.at.x} ${burrow.at.z} (y ${burrow.at.y})`);
          } else if (Math.hypot(Q.x - burrow.at.x - 0.5, Q.z - burrow.at.z - 0.5) > 0.6) await gotoFor([String(burrow.at.x), String(burrow.at.z)], 4000);
          const T = Math.floor(b.state().pos.y + 0.01);
          // (onto the middle of the hole's block first: standing on its edge, the block dug from under us left us on the next one
          //  and the next digs found air - 17:47, twelve seconds and one deep)
          { const C = b.state().pos; if (Math.abs(C.x - burrow.at.x - 0.5) > 0.2 || Math.abs(C.z - burrow.at.z - 0.5) > 0.2) { await gotoFor([String(burrow.at.x), String(burrow.at.z)], 3000); const C2 = b.state().pos; if (Math.abs(C2.x - burrow.at.x - 0.5) > 0.25 || Math.abs(C2.z - burrow.at.z - 0.5) > 0.25) { await b.act('lookat', [String(burrow.at.x + 0.5), String(burrow.at.y), String(burrow.at.z + 0.5)]).catch(() => {}); await b.act('walk', ['forward', '3']).catch(() => {}); } } }
          // (one block at a time, the fall waited for before the next: dig_down dug the next block before the fall, found air, and
          //  the holes were '0 deep' - 17:11)
          await holdPick();
          const deepNow = burrow.at.y - Math.floor(b.state().pos.y + 0.01);   // (already down: no deeper)
          // (3 deep read back, a few tries more if not: 17:36, '1 deep, open' and flung out of the world by it)
          log(`dragon: dbg down from ${Math.floor(b.state().pos.y + 0.01)} (ground ${burrow.at.y}) under ${[1, 2, 3, 4, 5].map((k) => bname(Math.floor(b.state().pos.x), Math.floor(b.state().pos.y + 0.01) - k, Math.floor(b.state().pos.z))).join(' ')}`);
          for (let k = deepNow, tries = 0; burrow.at.y - Math.floor(b.state().pos.y + 0.01) < DEEP && tries < DEEP + 3 && me.connected && !b.state().dead; k++, tries++) { const f = b.state().pos, fy0 = Math.floor(f.y + 0.01); await gotoFor([String(Math.floor(f.x)), String(fy0 - 1), String(Math.floor(f.z))], 3000, 'dig');
            for (let t = 0; t < 12 && Math.floor(b.state().pos.y + 0.01) >= fy0; t++) await sleep(100); }
          const sealed = await sealOver();
          burrow.in = Date.now(); burrow.kills = 0;
          log(`dragon: down in our hole (${T - Math.floor(b.state().pos.y + 0.01)} deep${sealed ? ', shut' : ', open'}) · health ${me.hp}${outFor ? ` · out ${Math.round(outFor / 1000)} s` : ''}`);
          for (let t = 0; t < 120 && me.connected && !b.state().dead && !perchedNow() && ((me.hp ?? 0) < 19.5 || Date.now() - burrow.in < 10000); t++) {
            if (me.hp !== null && burrow.hp0 != null && me.hp < burrow.hp0 - 0.5) { const d = ents(/ender_dragon$/)[0], Q = b.state().pos; log(`dragon: hurt in our hole ${burrow.hp0} → ${me.hp} at y ${Q.y.toFixed(1)}: it at ${d ? `${Math.round(Math.hypot(d.x - Q.x, d.z - Q.z))} off, y ${d.y.toFixed(1)}` : '?'} · clouds within 8: ${ents(/area_effect_cloud$/).filter((e) => !e.burn && Math.hypot(e.x - Q.x, e.z - Q.z) < 8).map((e) => `${Math.hypot(e.x - Q.x, e.z - Q.z).toFixed(1)}/y${e.y.toFixed(0)}`).join(' ') || '-'} · over me ${bname(Math.floor(Q.x), Math.floor(Q.y + 0.01) + 2, Math.floor(Q.z))}`); }
            burrow.hp0 = me.hp;
            // (an enderman in the hole with us, health going: the sword at it - 17:19, killed by one down there with the pickaxe in hand)
            { const hp1 = me.hp; const em = ents(/enderman$/).find((e) => Math.hypot(e.x - b.state().pos.x, e.y - b.state().pos.y, e.z - b.state().pos.z) < 3.5);
              if (em && (Date.now() - wHurt < 3000 || (hp1 ?? 20) < 19)) { if (Date.now() - emSaid > 8000) { emSaid = Date.now(); log(`dragon: an enderman at our hole (health ${me.hp}): the sword`); } await armUp(b); for (let k = 0; k < 6 && [...b.entities.values()].includes(em); k++) { await b.act('attack', ['enderman']).catch(() => {}); await sleep(250); } continue; } }
            if (await gapple()) continue;
            const food = /minecraft:(cooked_\w+|bread|baked_potato|golden_carrot|apple|carrot)\*/.exec(b.invText?.() ?? '')?.[1];
            if (food && (me.food ?? 20) < 20) await gotoFor([food], 2600, 'eat'); else await sleep(1000);
          }
          // (not out into its breath lying over the hole: 17:58, out of the hole into a cloud on its top, 20 to 5 in seconds)
          for (let t = 0; t < 150 && me.connected && !b.state().dead && ents(/area_effect_cloud$/).some((e) => !e.burn && Math.hypot(e.x - burrow.at.x - 0.5, e.z - burrow.at.z - 0.5) < cr(e) + 1.5); t++) { if (t % 20 === 0) log(`dragon: its breath lies over our hole: waiting under it (health ${me.hp})`); if (!(await gapple())) await sleep(1000); }
          // out: the seal dug, up our cobblestone to the ground
          const P2 = b.state().pos, gx = Math.floor(P2.x), gz = Math.floor(P2.z), gy = Math.floor(P2.y + 0.01);
          // (a block at a time up to the ground's level, what is over the head dug first each time; read back: 17:20, the way out
          //  failed once, and every going-down after it dug three more from wherever it stood - to y 36 under the island)
          for (let t = 0; t < 12 && me.connected && !b.state().dead && Math.floor(b.state().pos.y + 0.01) < burrow.at.y; t++) {
            const F = b.state().pos, x1 = Math.floor(F.x), z1 = Math.floor(F.z), y1 = Math.floor(F.y + 0.01);
            for (const y of [y1 + 2, y1 + 1]) if (!/^(air|\?)$/.test(bname(x1, y, z1))) { await holdPick(); await gotoFor([String(x1), String(y), String(z1)], 3000, 'dig'); }
            await gotoFor(['1', 'cobblestone'], 2500, 'pillar');
            if (process.env.BOT_DEBUG || t > 3) log(`dragon: dbg out step ${t}: feet ${y1} → ${Math.floor(b.state().pos.y + 0.01)} at ${x1} ${z1} · over ${bname(x1, y1 + 2, z1)} · under ${bname(x1, y1 - 1, z1)} ${bname(x1, y1 - 2, z1)} · cobble ${cnt('cobblestone')}`);
            if (Math.floor(b.state().pos.y + 0.01) <= y1 && t > 2) { log(`dragon: stuck in our hole at y ${y1} (ground ${burrow.at.y})`); break; }
          }
          burrow.out = Date.now();
          log(`dragon: out of our hole (y ${Math.floor(b.state().pos.y + 0.01)}) · health ${me.hp}${perchedNow() ? ' · it sits' : ''} · ${crystalsLeft} crystals to go`);
        } finally { delegating = false; dodge = null; }
        continue;
      }
    }
    // (before the breath's own branch, which kept it running from cloud to cloud down to 2 health - 05:54. Out of the cloud is enough)
    // (measured in the lab, 18:59: a player standing still under end stone lived three minutes beside the dragon and its breath,
    //  one in the open died in twenty seconds. Hurt: down into the end stone, shut in above, eat and heal to full, then out again)
    // (BOT_NOHEALHOLE: none - 05:08 and 05:12 in the lab, dead ten seconds after digging in, to its breath and to its bite)
    if (!process.env.BOT_NOHEALHOLE && me.hp !== null && me.hp < 16 && !inCloud() && !(perchedNow() && me.hp >= 10) && !ents(/enderman$/).some((e) => Math.hypot(e.x - P.x, e.y - P.y, e.z - P.z) < 5) && Date.now() - holedAt > 20000 && cnt('end_stone') + cnt('cobblestone') + cnt('dirt') > 0) {
      holedAt = Date.now(); log(`dragon: health ${me.hp}: dug in to heal`, { dc: true });
      delegating = true;
      try {
        const said = []; const tap = (l) => said.push(l); ctx.taps.add(tap);
        // (out of its way first: it comes down to the fountain through the middle - a hole 17 out was on its path. 30 out, round
        //  the ring from where we are, then down)
        // (the hole made beforehand: its shaft holds only our cobblestone - three quick digs and one block of end stone over the head,
        //  three seconds where shelter took eight with its breath landing meanwhile, 06:13)
        let r = null;
        if (fox && cnt('end_stone') > 0) { await dash(fox.x + 0.5, fox.z + 0.5, 5000); const Q = b.state().pos;
          if (Math.floor(Q.x) === fox.x && Math.floor(Q.z) === fox.z) { await gotoFor(['3'], 6000, 'dig_down'); r = (await sealOver()) ? 'shelter: into our hole, end stone over it' : null; } }
        if (!r) { { const Q = b.state().pos, l = Math.hypot(Q.x, Q.z) || 1; if (l < 28) await dash((Q.x / l) * 32, (Q.z / l) * 32, 4500); }
          await gotoFor([], 30000, 'shelter'); r = said.reverse().find((l) => /shelter:/.test(l)) ?? 'no answer'; }
        // (shut in, read back: what is over the head. 06:43, shelter took it for morning and left the shaft open; a minute in the
        //  open shaft and the dragon's own body killed it. Sealed again with end stone when it is not)
        { const Q = b.state().pos, fx = Math.floor(Q.x), fz = Math.floor(Q.z), fy = Math.floor(Q.y + 0.01), over = bname(fx, fy + 2, fz);
          // (shelter failed outright, 07:13 and 07:18: still on the ground - down three ourselves first)
          let deep = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let t = 0; for (let y = fy; y < fy + 4; y++) if (!/^(air|\?)$/.test(bname(fx + dx, y, fz + dz))) t = y - fy + 1; deep = Math.max(deep, t); }
          if (deep < 2) { await gotoFor(['3'], 12000, 'dig_down'); r += ' · dug down 3 ourselves'; }
          if (over !== 'end_stone' && over !== 'obsidian') { if (over !== 'air' && over !== '?') await gotoFor([String(fx), String(fy + 2), String(fz)], 3000, 'dig'); const ok = await sealOver(); r += ` · over the head: ${over} → ${bname(fx, fy + 2, fz)}${ok ? '' : ' (not sealed)'}`; } }
        ctx.taps.delete(tap);
        log(`dragon: ${r.replace(/^.*?shelter:/, 'shelter:')}`);
        for (let t = 0; t < 90 && me.connected && !b.state().dead && (me.hp ?? 0) < 19.5; t++) {
          const food = /minecraft:(cooked_\w+|bread|baked_potato|golden_carrot|golden_apple|apple|carrot)\*/.exec(b.invText?.() ?? '')?.[1];
          if (food && (me.food ?? 20) < 20) await gotoFor([food], 2600, 'eat'); else await sleep(1000);
        }
        log(`dragon: healed to ${me.hp}: out again`);
        // (out by hand: to_surface took the sealed hole's floor for the surface - 06:05, a minute and a half stuck down there in
        //  its breath. The seal and what is over it dug, then up a pillar of our own to the ground's top)
        for (let t = 0; t < 4 && me.connected && !b.state().dead; t++) {
          const Q = b.state().pos, fx = Math.floor(Q.x), fz = Math.floor(Q.z), fy = Math.floor(Q.y + 0.01);
          // (the ground's top round the shaft, not what is over the head: 06:27, 'out' at the bottom of an open shaft, shooting at
          //  walls - six crystals given up for caged)
          let top = fy - 1; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let y = fy; y < fy + 5; y++) if (/^(end_stone|cobblestone|dirt)$/.test(bname(fx + dx, y, fz + dz))) top = Math.max(top, y);   /* (the ground, not a pillar beside it: 09:56, up the obsidian to 83 and off) */
          for (let y = fy + 2; y <= top + 2; y++) if (!/^(air|\?)$/.test(bname(fx, y, fz))) await gotoFor([String(fx), String(y), String(fz)], 3000, 'dig');
          if (top < fy) break;
          await gotoFor([String(top + 1 - fy), blockId()], (top + 1 - fy) * 1600 + 2000, 'pillar');
        }
        log(`dragon: out of the hole at y ${Math.floor(b.state().pos.y + 0.01)}`);
      } finally { delegating = false; dodge = null; }
      continue;
    }
    // (15:09 in the lab: 17 health gone in six seconds standing in it. Straight away from it, fourteen blocks, at a sprint; near the
    //  island's edge, along the edge instead)
    const cloud = ents(/area_effect_cloud$|dragon_fireball$/).filter((e) => Math.hypot(e.x - P.x, e.z - P.z) < cr(e) + 6 && Math.abs(e.y - P.y) < 8).sort((u, v) => Math.hypot(u.x - P.x, u.z - P.z) - Math.hypot(v.x - P.x, v.z - P.z))[0];
    if (dodge && Date.now() - dodge.t < 3000) { const dd = dodge; dodge = null; if (Date.now() - dodgeSaid > 8000) { dodgeSaid = Date.now(); log('dragon: a fireball coming down near me: out of its line'); }
      // (18:19 in the lab: out of the fireball's line straight into an older cloud. Of the two sides, and further out on each, the
      //  first whose way crosses no cloud and stays on the island)
      const cl = ents(/area_effect_cloud$/), ok2 = (x, z) => Math.hypot(x, z) < 44 && !cl.some((e) => segD(P.x, P.z, x, z, e.x, e.z) < cr(e) + 1.5);
      const cands = [[dd.x, dd.z], [2 * P.x - dd.x, 2 * P.z - dd.z], [P.x + (dd.x - P.x) * 1.6, P.z + (dd.z - P.z) * 1.6], [P.x - (dd.x - P.x) * 1.6, P.z - (dd.z - P.z) * 1.6], [P.x + (dd.x - P.x) * 0.6, P.z + (dd.z - P.z) * 0.6], [P.x - (dd.x - P.x) * 0.6, P.z - (dd.z - P.z) * 0.6]];
      let [tx, tz] = cands.find(([x, z]) => ok2(x, z)) ?? cands[0];
      fleeing = true; try { await down(); await dash(tx, tz, 2500); } finally { fleeing = false; } continue; }
    dodge = null;
    // (an apple before the shield at 12 or less: 01:49 on 20 Nov, 15 → 8 → dead by its charge, shield up, seven apples carried)
    if ((me.hp ?? 20) <= 12 && charging() && (await gapple())) continue;
    { const ch = charging(); if (ch && !inCloud()) { guarding = true; try {
        if (Date.now() - guardSaid > 15000) { guardSaid = Date.now(); log(`dragon: it comes at me (${Math.round(Math.hypot(ch.x - P.x, ch.z - P.z))} blocks): shield up`); }
        // (at most four seconds, and only while it is still closing in and nothing else hurts: 18:03, fourteen health gone standing
        //  shield-up while it hovered close and breathed)
        const hp0 = me.hp; let dPrev = Infinity;
        for (let t = 0; t < 5 && charging() && !inCloud() && !dodge && !(me.hp !== null && hp0 !== null && me.hp < hp0 - 1); t++) { const d = charging(); if (!d) break; const dd = Math.hypot(d.x - b.state().pos.x, d.z - b.state().pos.z); if (t >= 2 && dd > dPrev - 0.3) break; dPrev = dd; await gotoFor([String(d.x), String(d.y + 1), String(d.z)], 400, 'lookat'); await b.act('sneak', ['on']).catch(() => {}); await sleep(200); }
      } finally { await b.act('sneak', ['off']).catch(() => {}); guarding = false; } continue; } }
    const dr0 = ents(/ender_dragon$/)[0], perched = perchedNow();
    // each perch measured: how long it sat, its bar from and to, our sword hits and beds in it (a Bedrock runner's word, 19 Nov: 'if
    // the dragon takes too much damage it will fly away' - five crits at most; BOT_SWORD_MAX caps the swings a perch)
    if (perched && !perchRec) perchRec = { t: Date.now(), bar: bar(), hits, beds: bedsBlown };
    else if (!perched && perchRec && Date.now() - perchRec.t > 1500) { log(`dragon: perch over: ${((Date.now() - perchRec.t) / 1000).toFixed(0)} s, its bar ${perchRec.bar} → ${bar()}, ${hits - perchRec.hits} sword hits, ${bedsBlown - perchRec.beds} beds`, { dc: true }); perchRec = null; }
    else if (!perched && perchRec) perchRec = null;
    if (process.env.BOT_DEBUG && dr0 && Math.hypot(dr0.x, dr0.z) < 14 && Date.now() - (dbgPerch ?? 0) > 1000) { dbgPerch = Date.now(); log(`dragon: dbg near the middle ${dr0.x.toFixed(1)} ${dr0.y.toFixed(1)} ${dr0.z.toFixed(1)} yaw ${dr0.yaw?.toFixed?.(0)} · sits ${perched}`); }
    // (15:23 in the lab: dead at the fountain, 14 health in seven seconds - where it sits it breathes. The middle is for when it sits
    //  and health is good: then the sword counts for more than the breath costs. Hurt: out to 24 blocks, eat, back at 16)
    if (me.hp !== null && me.hp < 10) resting = true; else if (me.hp === null || me.hp >= 16) resting = false;
    if (resting || (!BOWL && !perched && Math.hypot(P.x, P.z) < 13)) {
      if (Math.hypot(P.x, P.z) < 22) { const l = Math.hypot(P.x, P.z) || 1, ux = l < 1.5 ? 1 : P.x / l, uz = l < 1.5 ? 0 : P.z / l; await down(); await b.act('sprint', ['on']).catch(() => {}); await gotoFor([String(Math.round(ux * 24)), String(Math.round(uz * 24))], 3000); await b.act('sprint', ['off']).catch(() => {}); continue; }
      if (resting) { const food = /minecraft:(cooked_\w+|bread|baked_potato|golden_carrot|(?<!golden_)apple)\*/.exec(b.invText?.() ?? '')?.[1]; if (food && (me.food ?? 20) < 20) await gotoFor([food], 2600, 'eat'); else if (!cloud) await sleep(700); if (!cloud) continue; }
    }
    // (while it sits and health is 12+, only a cloud we stand in or a fireball sends us off - not one six blocks off: 20:24-20:25 on
    //  19 Nov, a 57 s perch of approach, 'away', approach, and no swing; the escape ran ten past its edge every time)
    const cloudIn = cloud && (/dragon_fireball$/.test(cloud.type ?? '') || Math.hypot(cloud.x - P.x, cloud.z - P.z) < cr(cloud) + 0.6);
    if (cloud && !(perched && (me.hp ?? 20) >= 12 && (Math.hypot(P.x, P.z) < 9 || !cloudIn))) { let ux = P.x - cloud.x, uz = P.z - cloud.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; const far = (cloud.radius ?? 3) + 10; let tx = cloud.x + ux * far, tz = cloud.z + uz * far;
      if (Math.hypot(tx, tz) < 14) { const l2 = Math.hypot(P.x, P.z) || 1; tx = (P.x / l2) * 24; tz = (P.z / l2) * 24; }   // (never through the middle)
      if (Math.hypot(tx, tz) > 42) { tx = P.x - uz * 14; tz = P.z + ux * 14; if (Math.hypot(tx, tz) > 42) { tx = P.x + uz * 14; tz = P.z - ux * 14; } }
      if (!me.breathSaid || Date.now() - me.breathSaid > 10000) { me.breathSaid = Date.now(); log(`dragon: its breath ${Math.round(l)} blocks off: away`); }
      fleeing = true; try { await down(); await dash(tx, tz, 3000); } finally { fleeing = false; } continue; }
    // (15:11 in the lab: dead in twenty seconds to an enderman it had looked at on the way, sword in the pack. Hurt, and one within
    //  five blocks: that one first - 40 health, six swings of an iron sword)
    if (me.hp !== null && hpWas !== null && me.hp < hpWas - 0.5) hurtAt = Date.now();
    if (me.hp !== null && hpWas !== null && me.hp < hpWas - 0.5) { const dN = ents(/ender_dragon$/)[0]; if ((!dN || Math.hypot(dN.x - P.x, dN.y - P.y, dN.z - P.z) > 14) && !ents(/enderman$/).some((e) => Math.hypot(e.x - P.x, e.z - P.z) < 4)) burns.push({ type: 'minecraft:area_effect_cloud', burn: true, x: P.x, y: P.y, z: P.z, t: Date.now() }); }
    if (process.env.BOT_DEBUG && me.hp !== null && hpWas !== null && me.hp < hpWas - 0.5) { const cs = ents(/area_effect_cloud$|dragon_fireball$/).map((e) => `${e.type.replace('minecraft:', '').slice(0, 5)}@${Math.hypot(e.x - P.x, e.z - P.z).toFixed(1)}/r${e.radius ?? '?'}/dy${(e.y - P.y).toFixed(1)}`).sort().slice(0, 4).join(' '); setTimeout(() => { const Q = b.state().pos; log(`dragon: dbg +1s near: ${ents(/area_effect_cloud$|dragon_fireball$/).map((e) => `${e.type.replace('minecraft:', '').slice(0, 5)}@${Math.hypot(e.x - Q.x, e.z - Q.z).toFixed(1)}/r${e.radius ?? '?'}`).sort().slice(0, 4).join(' ')}`); }, 1000); log(`dragon: dbg hurt ${hpWas}→${me.hp} at ${P.x.toFixed(0)} ${P.y.toFixed(0)} ${P.z.toFixed(0)}: ${cs || 'no cloud known'}; dragon ${dr0 ? Math.hypot(dr0.x - P.x, dr0.z - P.z).toFixed(0) : '-'} off`); }
    hpWas = me.hp;
    emFight = false;
    if (Date.now() - hurtAt < 15000 || Date.now() - wHurt < 15000) {
      // (16:00 in the lab: one swing, it stepped back out of reach, the bow came out again, and it killed from behind during the
      //  shot. While health is falling and one is within eight blocks nothing else is done: face it, the sword when it is in reach)
      const em = ents(/enderman$/).map((e) => ({ e, d: Math.hypot(e.x - P.x, e.y - P.y, e.z - P.z) })).filter((x) => x.d < 8 && (x.e.angry || (x.e.target && !/^-?[01]$/.test(x.e.target)))).sort((u, v) => u.d - v.d)[0];
      // (only one that is after us - its angry flag or a target set; 04:58 in the lab, calm ones struck while the dragon hurt us and
      //  four came for us in a minute. And only when nothing else can have done it: the dragon well away, no breath near. 19:42 in the lab: the dragon's hit taken
      //  for an enderman's, a calm one struck, and dead to it in four seconds - with the pumpkin on, they are never the first)
      const other = (dr0 && Math.hypot(dr0.x - P.x, dr0.y - P.y, dr0.z - P.z) < 22) || ents(/area_effect_cloud$/).some((e) => Math.hypot(e.x - P.x, e.z - P.z) < cr(e) + 3);
      if (em && !other && Date.now() - Math.max(hurtAt, wHurt) < 8000) { emFight = true; if (Date.now() - emSaid > 10000) { emSaid = Date.now(); log(`dragon: an enderman on me (health ${me.hp}): the sword`); }
        // (sword against sword it costs some 14 health each time, and it steps away and comes back: three blocks up on our own
        //  pillar it cannot reach, and is hit from above; the crystals are shot from up there too)
        if (!onPillar && cnt('cobblestone') + cnt('end_stone') >= 3 && !ents(/area_effect_cloud$/).some((e) => Math.hypot(e.x - P.x, e.z - P.z) < cr(e) + 5)) {   // (not beside its breath: 18:29, up a pillar by a cloud and dead in it)
        log('dragon: three up on a pillar, out of its reach'); await gotoFor(['3', blockId()], 6000, 'pillar'); onPillar = { x: Math.floor(b.state().pos.x), z: Math.floor(b.state().pos.z), y: b.state().pos.y }; continue; }
        await armUp(b);
        if (em.d < 3.6) { await b.act('attack', ['enderman']).catch(() => {}); emHits++; } else await gotoFor([String(em.e.x), String(em.e.y + 1.5), String(em.e.z)], 600, 'lookat');
        await sleep(150); continue; }
    }
    // (food by name: `eat` with the bow in hand drew the bow - 15:19, 7.5 health for a minute and never a bite. Kept full enough
    //  to heal by itself: under 18 of 20 hunger nothing comes back)
    { const food = /minecraft:(cooked_\w+|bread|baked_potato|golden_carrot|golden_apple|apple|carrot|melon_slice|sweet_berries|cookie|pumpkin_pie|beef|porkchop|mutton|chicken)\*/.exec(b.invText?.() ?? '')?.[1];
      if (food && ((me.food !== null && me.food < 18) || (me.hp !== null && me.hp < 10 && (me.food ?? 20) < 20))) { await gotoFor([food], 2600, 'eat'); continue; } }
    const dr = ents(/ender_dragon$/)[0]; if (dr) seenDragon = true;
    // within reach: the sword, whatever else was going on - in flight only. Sitting, the perch's own turn below (beds first, then the
    // sword): 12:07 on 19 Nov, 16 beds carried and none used in five perches - this caught every round while it sat 5 off
    if (dr && !perched && Math.hypot(dr.x - P.x, dr.y - P.y, dr.z - P.z) < 5.5) { await armUp(b); let miss = false; const mt = (l) => { if (/not under the crosshair|no .* in (view|reach)/.test(l)) miss = true; }; ctx.taps.add(mt); await b.act('attack', ['ender_dragon']).catch(() => {}); ctx.taps.delete(mt); if (!miss) hits++; await sleep(250); continue; }
    // (gone is said when it is out of sight after a shot; one that shows again was only out of sight: back on the list)
    for (const e of ents(/ender_crystal$/)) { all.add(key(e)); if (gone.delete(key(e))) log(`dragon: the crystal at ${key(e)} stands after all`); }
    // (a cage is seen, not guessed from misses: iron bars two out on its sides. 07:50, three open ones given up from one bad spot)
    for (const e of ents(/ender_crystal$/)) { const k0 = key(e); if (left.has(k0) || opened.has(k0)) continue; const X = Math.floor(e.x), Y = Math.floor(e.y), Z = Math.floor(e.z);
      if (!gaps.has(k0) && [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dz]) => bname(X + dx, Y, Z + dz) === 'iron_bars').length >= 2) { left.add(k0); caged.add(k0); log(`dragon: the crystal at ${k0} (y ${Y}) is in a cage of iron bars`); } }
    // (one given up for misses alone, not caged: tried again a minute later from wherever it is then)
    // (twice more at most, and only while arrows last: 12:49-13:14 on 19 Nov, the two caged ones - their bars not seen - tried eleven
    //  times, 88 arrows of 192, none left for anything after)
    for (const k0 of [...left]) if (!caged.has(k0) && Date.now() - (leftAt.get(k0) ?? 0) > 60000 && (gaps.has(k0) || (again.get(k0) ?? 0) < 2) && cnt('arrow') > 24) { again.set(k0, (again.get(k0) ?? 0) + 1); left.delete(k0); tries.set(k0, 0); log(`dragon: the crystal at ${k0} once more (${again.get(k0)} of 2)`); }
    const crystals = ents(/ender_crystal$/).filter((e) => !left.has(key(e)));
    if (crystals.length && cnt('arrow') > 0) {
      // (one at a time until it is gone or given up: the one begun, else the one best placed from here - 45 to 75 blocks off)
      const c = crystals.sort((u, v) => (key(v) === aim) - (key(u) === aim) || Math.abs(Math.hypot(u.x - P.x, u.z - P.z) - 60) - Math.abs(Math.hypot(v.x - P.x, v.z - P.z) - 60))[0], k = key(c), n = tries.get(k) ?? 0; aim = k;
      // from the far side of the fountain: the higher the pillar, the further back
      const clouds = ents(/area_effect_cloud$/);
      const r = Math.hypot(c.x, c.z) || 1, back = Math.max(18, Math.min(34, (c.y - P.y) * 0.8 - 6)) + (n >= 4 ? -8 : 0), turn = clouds.some((e) => Math.hypot(e.x - (-c.x / r) * back, e.z - (-c.z / r) * back) < 8) ? 0.8 : 0,   // (its breath lies on the spot: another, round the fountain)
        sx = Math.round(((-c.x * Math.cos(turn) + c.z * Math.sin(turn)) / r) * back), sz = Math.round(((-c.z * Math.cos(turn) - c.x * Math.sin(turn)) / r) * back);
      const D = Math.hypot(c.x - P.x, c.z - P.z);
      // (BOWL: shot from the fountain's bowl, three out on the crystal's side - its charges pass over the bowl, the old runner's notes)
      if (BOWL) { const bx = Math.round((c.x / r) * 3), bz = Math.round((c.z / r) * 3); if (Math.hypot(P.x - bx, P.z - bz) > 2.2 && !perched) { await walk(bx, bz, 4000, true); continue; } }
      else
      // (from where it stands when the distance will do: every walk is a chance to be hit; else toward the spot in short legs)
      // (an opened cage is shot only along its gap's line: 03:49, twelve arrows from wherever the dodging left it, all on the bars)
      if (gaps.has(k)) { const g = gaps.get(k), eye = P.y + 1.62, along = g.dx ? (P.x - (g.bx + 0.5)) * g.dx : (P.z - (g.bz + 0.5)) * g.dz, lat = g.dx ? P.z - (g.bz + 0.5) : P.x - (g.bx + 0.5);
        const f = (g.kw - 0.5) / Math.max(1, along), yAt = c.y + 1 + (eye - c.y - 1) * f, latAt = lat * f;
        if (!(along > 15 && Math.abs(latAt) < 1.2 && yAt >= g.by - 1 && yAt <= g.by + 2)) { const tx = g.bx + g.dx * (g.kw + 30), tz = g.bz + g.dz * (g.kw + 30); if (Date.now() - (gapSaid ?? 0) > 15000) { gapSaid = Date.now(); log(`dragon: to the line of the cage's gap (${tx} ${tz})`); } await walk(tx + 0.5, tz + 0.5, 5000, true); continue; } }
      else if (!opened.has(k) && (D < 18 || D > 70) && Math.hypot(P.x - sx, P.z - sz) > 4) { await walk(sx, sz); continue; }   // (an opened cage: from where uncage left us, in line with its gap)
      if (!opened.has(k) && n && n % 3 === 0 && moved !== `${k}:${n}`) { moved = `${k}:${n}`; const a = Math.atan2(P.z, P.x) + 0.45, rr = Math.max(18, Math.min(36, Math.hypot(P.x, P.z))); await walk(Math.cos(a) * rr, Math.sin(a) * rr, 4000); continue; }   // (three misses: another angle, round the ring)   // (in short legs: what hurts is looked at in between)
      await shootAt(c.x, c.y + 1, c.z, [1, 0.97, 1.03, 0.94, 1, 1.06, 0.91, 1][n % 8]); shots++; tries.set(k, n + 1);   // (1.12 first: what hit in the lab, three times of three)
      for (let t = 0; t < 6 && [...b.entities.values()].includes(c); t++) { await sleep(300); const Q = b.state().pos; if (ents(/area_effect_cloud$|dragon_fireball$/).some((e) => Math.hypot(e.x - Q.x, e.z - Q.z) < 6)) break; }   // (the arrow's flight, an eye on its breath)
      if (![...b.entities.values()].includes(c)) { aim = null; gone.add(k); burrow.kills = (burrow.kills ?? 0) + 1; }
      if (![...b.entities.values()].includes(c)) log(`dragon: crystal at ${k} gone (${n + 1} arrows)`, { dc: true });
      else if (n + 1 >= 16) { aim = null; left.add(k); leftAt.set(k, Date.now()); log(`dragon: the crystal at ${k} (y ${Math.round(c.y)}) took eight arrows and stands: caged or out of reach - left alone`, { dc: true }); }
      continue;
    }
    // the caged ones (iron bars all round: arrows stop on them). Up our own pillar beside the cage wall on the side toward the
    // middle, the bars of that wall broken out (three wide, three high), down the pillar again, and the crystal shot from 26+ blocks
    // out through the gap - never from close: its blast at four blocks is more than full health in iron
    // (one known to stand but out of sight - beyond what the server shows from here: toward where it was seen. 11:10-11:17, two
    //  open ones out of view and seven minutes waiting at the fountain for a dragon that does not sit while they stand)
    // (a remembered one that is not there when we are near enough to see it, or that lies on one already gone, is gone: 20:20, a
    //  phantom 'crystal 3 of 10' walked toward for ten minutes while the dragon sat waiting)
    { const near = (k0, set) => { const [x0, z0] = k0.split(',').map(Number); return [...set].some((k1) => { const [x1, z1] = k1.split(',').map(Number); return k1 !== k0 && Math.hypot(x1 - x0, z1 - z0) < 4; }); };
      for (const k0 of [...all]) { if (gone.has(k0) || left.has(k0)) continue; const [x0, z0] = k0.split(',').map(Number);
        if (near(k0, gone) || near(k0, left) || (Math.hypot(x0 - P.x, z0 - P.z) < 36 && !ents(/ender_crystal$/).some((e) => key(e) === k0))) { all.delete(k0); } } }
    if (!crystals.length && cnt('arrow') > 0) { const want = [...all].filter((k0) => !gone.has(k0) && !left.has(k0)).map((k0) => k0.split(',').map(Number)).sort((u, w) => Math.hypot(u[0] - P.x, u[1] - P.z) - Math.hypot(w[0] - P.x, w[1] - P.z))[0];
      if (want) { const l = Math.hypot(want[0], want[1]) || 1; if (Date.now() - (seekSaid ?? 0) > 20000) { seekSaid = Date.now(); log(`dragon: the crystal at ${want.join(',')} is out of sight: over toward it`); } await walk((want[0] / l) * 22, (want[1] / l) * 22, 6000, true); continue; } }
    // (BOT_UNCAGE only: up twenty blocks beside a pillar with the dragon about it was knocked off or breathed on, 07:44, 08:02, 08:04;
    //  it heals only within 32 blocks of one and the cages stand 42 out - sitting on the fountain it does not heal at all)
    // (while it sits: in flight it knocked the bot off the pillar every time, 21:40-22:38; sitting it stayed a minute and more)
    // (blocks for the cage pillars are carried, not dug here: 06:47, the ground beside us 'not under the crosshair' and nothing
    //  gained - 256 are brought, see get_cobblestone)
    if ((process.env.BOT_UNCAGE || process.env.BOT_UNCAGE_PERCH) && !uncaging && Date.now() > uncageWait && (process.env.BOT_UNCAGE_PERCH ? perchedNow() : !perchedNow()) && (me.hp ?? 0) >= 16 && left.size && !crystals.length && cnt('arrow') > 0 && cnt('cobblestone') + cnt('end_stone') >= 24 && /pickaxe/.test(b.invText?.() ?? '')) {
      const cc = ents(/ender_crystal$/).find((e) => left.has(key(e)) && !opened.has(key(e)));
      if (cc) { uncaging = true; try { const ok = await uncage(cc); if (ok) { opened.add(key(cc)); caged.delete(key(cc)); left.delete(key(cc)); tries.set(key(cc), 0); } } finally { uncaging = false; } continue; }
    }
    // no crystal left to shoot: the fight at the fountain is the goal runner's end_fight (tick by tick: the bowl by the pillar away
    // from it, the shield toward it while it is low and near, out of the puddles by their landing point, the sword with a crit when
    // it sits). Its answer read back: dead only when the dragon is gone
    if (process.env.BOT_END_FIGHT) {   // (tried: it died in the clouds as often as this loop; kept for comparison)
      log(`dragon: the crystals done (${left.size} left alone): to the fountain, end_fight`, { dc: true });
      const said = []; const tap = (l) => said.push(l); ctx.taps.add(tap);
      delegating = true; try { await gotoFor([String(Math.max(60, Math.round((3600000 - (Date.now() - t0)) / 1000)))], 3600000 - (Date.now() - t0) + 5000, 'end_fight'); } finally { delegating = false; dodge = null; ctx.taps.delete(tap); }
      const r = said.reverse().find((l) => /end_fight:|dragon: (dead|it killed me|not dead)/.test(l)) ?? 'no answer'; log(`dragon: end_fight says: ${r.replace(/^.*?(end_fight:|dragon:)/, '$1')}`, { dc: true });
      if (b.state().dead) continue;
      if (/the dragon is dead/.test(r) || (!ents(/ender_dragon$/).length && portalOpen())) { seenDragon = true; continue; }
      await sleep(1000); continue;
    }
    // no crystal to shoot: beside the fountain, where it comes down; arrows at it while it flies near
    // (BOT_WAIT_FAR: out there to heal from 12 health until 19.5, then in at BOT_WAIT_R where it comes down - 19:12-19:34 on 19 Nov,
    //  waiting at 46 nothing hurt us but it did not sit once in 22 minutes; at 18 it sat every few minutes and its breath wore us down)
    // (out at 18 while it flies - BOT_WAIT_R to try farther: 09:42 on 19 Nov, both cages broken by 13 min and every crystal gone,
    //  then three minutes of its breath 1-10 blocks off at 18 out, six golden apples, dead; in to the fountain's side when it sits)
    { const l = Math.hypot(P.x, P.z) || 1, want = perched ? 4 : (process.env.BOT_WAIT_FAR && (farMode = (me.hp ?? 20) <= 12 ? true : (me.hp ?? 20) >= 19.5 ? false : farMode, farMode || farByClock())) ? Number(process.env.BOT_WAIT_FAR) : Number(process.env.BOT_WAIT_R || 18), wx = Math.round((P.x / l) * want), wz = Math.round((P.z / l) * want); if (Math.abs(l - want) > 2.5) { await walk(wx, wz, 3000, perched); continue; } }
    // (BOT_CIRCLE: while it flies, never standing still on the circle - round it 20 degrees a step: its fireballs are aimed at where
    //  we stand and come at 27 blocks a second; 04:12 on 20 Nov, 17 → dead in seventeen seconds standing on the circle at 18)
    if (process.env.BOT_CIRCLE && !perched && !(bar() <= 12 && cnt('arrow') > 0)) { const a = Math.atan2(P.z, P.x) + (circDir * 20 * Math.PI) / 180, r0 = Math.hypot(P.x, P.z) || 18; if (Math.random() < 0.08) circDir = -circDir; await walk(Math.cos(a) * r0, Math.sin(a) * r0, 2500, false); continue; }
    if (perched && Date.now() - perchSaid > 20000) { perchSaid = Date.now(); log(`dragon: it sits on the fountain: its box from y ${dr.y.toFixed(1)} (${dr.bw ?? '?'} wide, ${dr.bh ?? '?'} high), my eyes at ${(P.y + 1.62).toFixed(1)}, ${Math.round(Math.hypot(dr.x - P.x, dr.z - P.z))} blocks off`); }
    // (15:32 in the lab: 65 swings from the ground beside the fountain, none on it - its box begins more than a sword's reach over
    //  the ground. Up on a pillar of our own blocks until the underside is within reach)
    // (a pillar that does not rise is not tried again for twenty seconds: 11:46, a hundred tries in a pit with no blocks left
    //  while it sat there healing back to 162)
    if (perched && dr && dr.y - (P.y + 1.62) > 2.4 && Date.now() - pillarFail > 20000 && cnt(blockId()) > 0) { const up = Math.min(5, Math.ceil(dr.y - (P.y + 1.62) - 1.8)), y0 = P.y; log(`dragon: ${up} up on a pillar to reach it`); await gotoFor([String(up), blockId()], 2500 * up, 'pillar'); if (b.state().pos.y < y0 + 0.9) { pillarFail = Date.now(); log(`dragon: the pillar did not rise (${cnt(blockId())} ${blockId()} left): the sword from here`); } continue; }
    inFight = !!(perched && dr && (me.hp ?? 20) >= 12);
    // (its head points against its yaw as Bedrock sends it: its breath while sitting lay at -0.98 of yaw's way, 13:29)
    // sitting, it breathes ahead of its head: never in front of it - to its side, four and a half out from its middle (13:03-13:17
    // in the lab: five times it sat, five times the bowl in front of it took the health and the time it sat went on healing)
    if (perched && dr && Number.isFinite(dr.yaw)) {
      const r = (dr.yaw * Math.PI) / 180, hx = Math.sin(r), hz = -Math.cos(r), ox = P.x - dr.x, oz = P.z - dr.z, ol = Math.hypot(ox, oz) || 1, ahead = (ox * hx + oz * hz) / ol;
      if (process.env.BOT_DEBUG && Date.now() - (sideSaid ?? 0) > 3000) { sideSaid = Date.now(); const cl = ents(/area_effect_cloud$/).filter((e) => !e.burn && Math.hypot(e.x - dr.x, e.z - dr.z) < 14).map((e) => (((e.x - dr.x) * hx + (e.z - dr.z) * hz) / (Math.hypot(e.x - dr.x, e.z - dr.z) || 1)).toFixed(2)); log(`dragon: dbg sitting yaw ${dr.yaw.toFixed(0)}, me ahead ${ahead.toFixed(2)}, clouds near it ahead ${cl.join(' ') || '-'}`); }
      if (ahead > 0.3) { const s1 = [dr.x - hz * 4.5, dr.z + hx * 4.5], s2 = [dr.x + hz * 4.5, dr.z - hx * 4.5], sd = Math.hypot(s1[0] - P.x, s1[1] - P.z) < Math.hypot(s2[0] - P.x, s2[1] - P.z) ? s1 : s2;
        if (Date.now() - (sideSaid2 ?? 0) > 8000) { sideSaid2 = Date.now(); log('dragon: in front of its head: round to its side'); }
        await dash(sd[0], sd[1], 1500); continue; }
    }
    // beds: one blows up when used in the End - set down by it while it sits, a step back, and clicked (a fifth of its health a bed,
    // the guides say; read back from its health here). BOT_NOBED to leave them
    if (perched && dr && !process.env.BOT_NOBED && (me.hp ?? 0) >= Number(process.env.BOT_BED_HP ?? 18.5) && Date.now() - bedAt > 600 && /\d+:minecraft:(\w+_)?bed\*/.test(b.invText?.() ?? '')) {
      bedAt = Date.now(); const bar0 = bar(), me0 = me.hp, nb0 = bedsBlown; const said = []; const tap = (l) => said.push(l); ctx.taps.add(tap);
      // (a bed try that blew nothing leaves the sword eight seconds before the next: 18:38-18:43 on 19 Nov, perch after perch in
      //  stands that did not go up and clicks that did not take, and hardly a swing - 0 to 3 hits a perch)
      try {
      try {
        // (where a bed can go: just outside its box, to the side of its head, about 9 from its middle - beds set inside its box are
        //  refused by the server; of 40 tries 21:00-21:10 only those 6+ off went down, and the one at 7 off toward its head took 52)
        if (Number.isFinite(dr.yaw)) { const r = (dr.yaw * Math.PI) / 180, hx = Math.sin(r), hz = -Math.cos(r), Q0 = b.state().pos;
          const sides = [[hx * 0.7 - hz * 0.7, hz * 0.7 + hx * 0.7], [hx * 0.7 + hz * 0.7, hz * 0.7 - hx * 0.7]].map(([ux, uz]) => [dr.x + ux * 9, dr.z + uz * 9]).sort((u, w) => Math.hypot(u[0] - Q0.x, u[1] - Q0.z) - Math.hypot(w[0] - Q0.x, w[1] - Q0.z));
          const [tx, tz] = sides[0]; if (Math.hypot(Q0.x - tx, Q0.z - tz) > 1.5) { await dash(tx, tz, 2500); if (Math.hypot(b.state().pos.x - tx, b.state().pos.z - tz) > 2) await gotoFor([String(Math.floor(tx)), String(Math.floor(tz))], 2500); } }
        const Q = b.state().pos, fx = Math.floor(Q.x), fy = Math.floor(Q.y + 0.01), fz = Math.floor(Q.z), vx = dr.x - Q.x, vz = dr.z - Q.z;
        // (a cell with ground under it and under its head end, free above both, toward it first: 09:20, set down on air three times)
        const solidAt = (x, y, z) => !/^(air|\?|.*fire|.*water|.*lava)$/.test(bname(x, y, z)), freeAt = (x, y, z) => /^(air)$/.test(bname(x, y, z));
        const DIRS = [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north']].sort((u, w) => (w[0] * vx + w[1] * vz) - (u[0] * vx + u[1] * vz));
        // (higher: a stand of our blocks under each half up to two below its box's foot - from the floor a bed did 6 to 9, 10:21; each
        //  of the four ways tried, the one toward it first)
        // (one high at most: a top face above the eyes cannot be clicked, so neither a second layer nor a bed on it - 21:23)
        const H = Math.max(0, Math.min(1, Math.round(dr.y - 2 - fy)));
        if (!process.env.BOT_BED_FLOOR && H > 0 && cnt(blockId()) >= 2 * H) {
          let done = false;
          for (const [ddx, ddz, ddir] of DIRS) { if (done) break;
            const cs = [[fx + ddx, fz + ddz], [fx + 2 * ddx, fz + 2 * ddz]];
            if (!cs.every(([x, z]) => [...Array(H + 2).keys()].every((k) => bname(x, fy + k, z) === 'air') && !/^(air|\?)$/.test(bname(x, fy - 1, z)))) continue;
            await gotoFor([], 1500, 'hold_' + blockId());
            // (the far one first: the near one's block hid the far one's face - 21:22, 'not under the crosshair' every time)
            for (let k = 0; k < H; k++) for (const [x, z] of [...cs].reverse()) { await b.act('useon', [String(x), String(fy + k - 1), String(z), 'up']).catch(() => {}); await sleep(200); }
            if (!cs.every(([x, z]) => bname(x, fy + H - 1, z) !== 'air')) { log(`dragon: the stand for a bed (${H} high, ${ddir}) did not go up`); continue; }
            await gotoFor([String(cs[0][0]), String(fy + H), String(cs[0][1]), ddir], 2500, 'place_bed'); await sleep(250);
            if (!/(^|_)bed$/.test(bname(cs[0][0], fy + H, cs[0][1]))) { log(`dragon: no bed on the stand ${H} high (${ddir})`); continue; }
            if (!(await backOff(cs[0][0], fy + H, cs[0][1], ddx, ddz))) { done = true; break; }
            await bedClick(cs[0][0], fy + H, cs[0][1], ddx, ddz);
            bedsBlown++; log(`dragon: a bed on a stand ${H} high blown at ${cs[0][0]} ${fy + H} ${cs[0][1]}: its bar ${bar0} → ${bar()}, mine ${me0} → ${me.hp}`, { dc: true }); if ((me.hp ?? 20) <= 12) { gappleAt = 0; await gapple(); } done = true;
          }
          if (done) continue;
        }
        const picks = [];
        for (const [ddx, ddz, ddir] of DIRS) for (const k of [1, 2]) for (const yy of [fy + 1, fy, fy - 1]) { const x = fx + ddx * k, z = fz + ddz * k; if (freeAt(x, yy, z) && freeAt(x + ddx, yy, z + ddz) && solidAt(x, yy - 1, z) && solidAt(x + ddx, yy - 1, z + ddz) && freeAt(x, yy + 1, z)) picks.push([ddx, ddz, ddir, x, z, yy]); }
        if (!picks.length) { if (Date.now() - (noRoomAt ?? 0) > 10000) { noRoomAt = Date.now(); log('dragon: no room for a bed here'); } bedAt = Date.now() + 4000; }
        if (!picks.length) continue;
        // (the higher the better: 62 under its box did 1.6, 63 did 17 - 09:44, 09:45. Each spot of the four best tried in turn)
        picks.sort((u, w) => w[5] - u[5]);
        const isBed = (x, y, z) => /(^|_)bed$/.test(bname(x, y, z));
        let pick = null; for (const pk of picks.slice(0, 4)) { await gotoFor([String(pk[3]), String(pk[5]), String(pk[4]), pk[2]], 2500, 'place_bed'); await sleep(250); if (isBed(pk[3], pk[5], pk[4])) { pick = pk; break; } }
        const [dx, dz, dir, X, Z, BY] = pick ?? picks[0];
        if (isBed(X, BY, Z)) {
          if (!(await backOff(X, BY, Z, dx, dz))) continue;
          // (once more when it still stands: 07:25, 'not clicked?' and the bed left there for the next perch)
          await bedClick(X, BY, Z, dx, dz);
          bedsBlown++; log(`dragon: a bed blown at ${X} ${BY} ${Z}: its bar ${bar0} → ${bar()}, mine ${me0} → ${me.hp}${isBed(X, BY, Z) ? ' (the bed still stands: not clicked?)' : ''}`, { dc: true }); if ((me.hp ?? 20) <= 12) { gappleAt = 0; await gapple(); }
        } else log(`dragon: no bed set down at ${X} ${BY} ${Z} (${bname(X, BY, Z)}): ${said.filter((l) => /bed|put/.test(l)).slice(-1)[0] ?? '?'}`);
      } finally { ctx.taps.delete(tap); }
      } finally { if (bedsBlown === nb0) bedAt = Math.max(bedAt, Date.now() + 7400); }
      continue; }
    if (perched && dr && process.env.BOT_SWORD_MAX && perchRec && hits - perchRec.hits >= Number(process.env.BOT_SWORD_MAX)) { await sleep(300); continue; }
    if (perched && dr) { await armUp(b); let miss = false; const mt = (l) => { if (/not under the crosshair|no .* in (view|reach)/.test(l)) miss = true; }; ctx.taps.add(mt); if (CRIT) { await b.act('jump', ['on']).catch(() => {}); await sleep(100); await b.act('jump', ['off']).catch(() => {}); await sleep(330); } await b.act('attack', ['ender_dragon']).catch(() => {}); ctx.taps.delete(mt); if (!miss) { hits++; if (hits % 10 === 1) log(`dragon: the sword is on it (${hits}) · its health ${bar()}`); } await sleep(200); continue; }
    // (arrows at it in flight only while more than 48 are left - those are for crystals a respawn brings and the cages: 10:23 on 19
    //  Nov, 192 → 22 in 25 minutes from 36 out and its bar 200 → 190 for them)
    // (its last few points from the bow at any count of arrows: 21:00, its bar at 1 for a minute and 108 arrows kept back)
    if (dr && cnt('arrow') > (bar() <= 12 ? 0 : Number(process.env.BOT_ARROW_KEEP ?? 48)) && Math.hypot(dr.x - P.x, dr.z - P.z) < (bar() <= 12 ? 60 : 45)) { await shootAt(dr.x, dr.y + 1, dr.z); shots++; continue; }
    await sleep(500);
  }
  return false;
  }
  }
}
BUILTIN.dragon = async () => { pieceRun++; try { log(`dragon: ${(await dragonFight()) ? 'killed' : 'not killed'}`, { dc: true }); } finally { pieceRun--; } };
async function dragon() {
  if (me.dim !== 'the_end') return false;
  await sleep(4000);
  const d = [...me.bot.entities.values()].find((e) => e.type === 'minecraft:ender_dragon');
  if (d) return dragonFight();
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
      else if (st.special === 'stash') ok = await stash(false);
      else if (st.special === 'unstash') ok = await stash(true);
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
    await run('get_diamond 16', 'diamonds');
    await stash(false);   // (into the chest every sixteen: a death down there costs one trip's worth, not the day's)
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
// the base: one chest of our own (made and set down by this player, never someone's) beside the bed. What a death must not cost
// and the work at hand does not need goes in; `stash take` brings it all out again. Said only after reading it back: the things
// are counted in the open chest and in the inventory after the clicks (a click that did not go through is "still carried").
const CHESTF = require('node:path').join(ctx.RUN, 'chest.json');
const SAFE = /^(diamond|emerald|raw_gold|gold_ingot|ender_pearl|blaze_rod|blaze_powder|ender_eye|obsidian|lapis_lazuli|elytra|dragon_egg|dragon_head|ancient_debris|netherite_\w+|shulker_shell|totem_of_undying)$/;
const slotsOf = (t) => [...String(t ?? '').matchAll(/(\d+):minecraft:(\w+)\*(\d+)/g)].map((m) => ({ i: Number(m[1]), id: m[2], n: Number(m[3]) }));
const sumOf = (ss) => { const m = new Map(); for (const s of ss) m.set(s.id, (m.get(s.id) ?? 0) + s.n); return [...m].map(([k, n]) => `${k}*${n}`).join(' ') || 'nothing'; };
const isChest = (b, x, y, z) => /(^|:)chest$/.test(b.world.block(x, y, z)?.name ?? '');
async function stash(take) {
  const b = me.bot; if (!b || me.dim !== 'overworld') return false;
  let c = null; try { c = JSON.parse(fsx.readFileSync(CHESTF, 'utf8')); } catch { /* none yet */ }
  const carried = () => slotsOf(b.invText()).filter((s) => SAFE.test(s.id));
  if (take ? !c || !c.has : !carried().length) return true;   // nothing to move: no walk
  if (!c) {   // the chest first: made from our own wood, set down by the bed (or right here when there is no bed yet)
    if (!(await run('get_chest 1', 'a chest of our own'))) { log('stash: no chest made'); return false; }
    let pb = null; try { pb = JSON.parse(fsx.readFileSync(require('node:path').join(ctx.RUN, 'bed.json'), 'utf8')); } catch { /* */ }
    const q = b.state().pos;
    if (pb && Math.hypot(q.x - pb.x, q.z - pb.z) < 600 && Math.hypot(q.x - pb.x, q.z - pb.z) > 6) await BUILTIN.travel([String(pb.x + 3), String(pb.z + 1)]);
    if (!openSky(b, b.state().pos)) await b.act('to_surface', []).catch(() => {});
    const g = guardReason(b); if (g) { log(`stash: no chest here: ${g}`); return false; }
    const said = []; const tap = (l) => said.push(l); ctx.taps.add(tap);
    // (no free spot in front - a slope, a hole's rim, tall grass: each of the four ways, then a few steps on and again)
    for (let k = 0; k < 8 && live(); k++) {
      said.length = 0; await run('place_chest', 'set the chest down'); await sleep(600);
      if (/chest set at/.test(said.join('\n'))) break;
      await b.act('look', [String((k % 4) * 90), '0']).catch(() => {});
      if (k === 3) { const q2 = b.state().pos; await gotoFor([String(Math.floor(q2.x) + 5), String(Math.floor(q2.z) + 3)], 12000); }
    }
    ctx.taps.delete(tap);
    // (where the verb says it set it, checked in the world: a chest stands there now)
    { const m = /chest set at (-?\d+) (-?\d+) (-?\d+)/.exec(said.join('\n')); for (let t = 0; t < 10 && m && !c; t++) { if (isChest(b, +m[1], +m[2], +m[3])) c = { x: +m[1], y: +m[2], z: +m[3] }; else await sleep(300); } }   // (the block's update comes a moment after the verb's word)
    const p = b.state().pos, X = Math.floor(p.x), Y = Math.floor(p.y), Z = Math.floor(p.z);
    for (let dx = -5; dx <= 5 && !c; dx++) for (let dz = -5; dz <= 5 && !c; dz++) for (let dy = -2; dy <= 2 && !c; dy++) if (isChest(b, X + dx, Y + dy, Z + dz) && b.placedByMe?.has?.(`${X + dx},${Y + dy},${Z + dz}`)) c = { x: X + dx, y: Y + dy, z: Z + dz };
    if (!c) { log('stash: the chest did not go down', { dc: true }); return false; }
    try { fsx.writeFileSync(CHESTF, JSON.stringify(c)); } catch { /* */ }
    log(`stash: our chest stands at ${c.x} ${c.y} ${c.z}`, { dc: true });
  }
  { const q = b.state().pos; if (Math.hypot(q.x - c.x, q.z - c.z) > 3) { if (Math.hypot(q.x - c.x, q.z - c.z) > 40) await BUILTIN.travel([String(c.x + 1), String(c.z)]); await gotoFor([String(c.x + 1), String(c.z)], 30000); } }
  if (!isChest(b, c.x, c.y, c.z)) { log(`stash: no chest at ${c.x} ${c.y} ${c.z} any more (${(b.world.block(c.x, c.y, c.z)?.name ?? 'not loaded').replace('minecraft:', '')})`, { dc: true }); if (b.world.block(c.x, c.y, c.z)) { try { fsx.rmSync(CHESTF); } catch { /* */ } } return false; }
  b.placedByMe?.add?.(`${c.x},${c.y},${c.z}`);   // (ours from an earlier run: chest.json says so)
  let inBox = null;
  for (let k = 0; k < 3 && inBox == null && live(); k++) { await b.act('open', [String(c.x), String(c.y), String(c.z)]).catch(() => {}); await sleep(500); inBox = b.boxText?.() ?? null; if (inBox == null) await gotoFor([String(c.x + (k ? -1 : 1)), String(c.z + k)], 8000); }
  if (inBox == null) { log('stash: the chest did not open', { dc: true }); return false; }
  let ok;
  if (take) {
    for (let k = 0; k < 40; k++) { const s = slotsOf(b.boxText?.())[0]; if (!s) break; await b.act('quick', [`box:${s.i}`]).catch(() => {}); await sleep(150); }
    const left = slotsOf(b.boxText?.()); ok = !left.length;
    log(`stash: ${ok ? 'everything taken out' : `still in the chest: ${sumOf(left)} (no room?)`} · carried now: ${sumOf(carried())}`, { dc: true });
    c.has = ok ? '' : sumOf(left);
  } else {
    for (let k = 0; k < 40; k++) { const s = carried()[0]; if (!s) break; await b.act('quick', [String(s.i)]).catch(() => {}); await sleep(150); }
    const left = carried(); ok = !left.length; c.has = sumOf(slotsOf(b.boxText?.()));
    log(`stash: in the chest: ${c.has}${ok ? '' : ` · still carried: ${sumOf(left)} (the chest is full?)`}`, { dc: true });
  }
  await b.act('close', []).catch(() => {});
  try { fsx.writeFileSync(CHESTF, JSON.stringify(c)); } catch { /* */ }
  return ok;
}
BUILTIN.stash = async (a) => { pieceRun++; try { await stash(a[0] === 'take'); } finally { pieceRun--; } };
NOW['auto'] = (a) => { if (a[0] === 'stop') return BUILTIN.auto(a); me.queue.push('auto'); };

worker();
return { command, status, dispose: () => { disposed = true; ctx.taps.delete(deathTap); ctx.taps.delete(weatherTap); ctx.taps.delete(deathArmTap); for (const t of timers) clearInterval(t); if (live()) { me.autoGen++; me.abort = true; me.bot?.act('stop', []).catch(() => {}); } autoRun = null; }, guardOn: () => guardOn, setGuard: (v) => { guardOn = v; } };
};
