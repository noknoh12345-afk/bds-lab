'use strict';
// remote/bot.cjs — a resident bdslab player on someone's real server (not the lab's BDS).
// It stays in: reconnects when dropped, respawns when it dies, and takes commands while it plays, from three places:
//   - this terminal (type a line), - files dropped into run/inbox/ (one command per line), - `node remote/bot.cjs send "<cmd>"`
// Every command is a bdslab player action or verb (get_<item>, mine_<block>, goto x z, craft_<item>, fight_ender_dragon ...)
// or one of the built-ins below (`help`). What happens goes to run/out.log, run/status.json and, when set, a Discord webhook.
// Server rules: it never works (digs, places, opens, attacks, uses) within guardRadius of a block someone built or of another
// player, and stops what it is doing when it comes that close (`guard off` lifts it; the config sets the radius).
// Online-mode servers: Xbox sign-in by a microsoft.com/link code (printed, written to status.json, sent to Discord), once;
// the account is kept in run/auth/. NetherNet or RakNet: found by asking the server (GET /v1/join on its TCP port).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const readline = require('node:readline');
const { createRequire } = require('node:module');

const HERE = __dirname, RUN = path.join(HERE, 'run'), INBOX = path.join(RUN, 'inbox');
const CONFIG = path.join(HERE, 'config.json');
fs.mkdirSync(INBOX, { recursive: true });

// `node remote/bot.cjs send "<cmd>" ...`: drop commands into the inbox of a running bot and leave
if (process.argv[2] === 'send') {
  const f = path.join(INBOX, `${Date.now()}.txt`);
  fs.writeFileSync(f, process.argv.slice(3).join('\n') + '\n');
  console.log('queued ' + f);
  process.exit(0);
}

const DEF = { host: '127.0.0.1', port: 19132, name: 'bot', version: '1.26.60', webhook: '', guardRadius: 48, transport: 'auto' };
if (!fs.existsSync(CONFIG)) fs.writeFileSync(CONFIG, JSON.stringify(DEF, null, 2) + '\n');
const cfg = { ...DEF, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) };
const req = createRequire(path.join(HERE, '.deps', 'package.json'));
const { createRealPlayer } = require('../common/realplayer.cjs');

// ---------- output: terminal, run/out.log, Discord ----------
const t0 = Date.now();
const stamp = () => new Date().toTimeString().slice(0, 8);
const out = fs.createWriteStream(path.join(RUN, 'out.log'), { flags: 'a' });
let dcQueue = [], dcBusy = false;
function discord(text) {
  if (!cfg.webhook) return;
  dcQueue.push(String(text).slice(0, 1900));
  if (dcBusy) return;
  dcBusy = true;
  (async () => {
    while (dcQueue.length) {
      const content = dcQueue.splice(0, 8).join('\n').slice(0, 1900);
      try {
        const r = await fetch(cfg.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `bdslab ${cfg.name}`, content }) });
        if (r.status === 429) { dcQueue.unshift(content); await new Promise((s) => setTimeout(s, 3000)); }
      } catch { /* offline: drop */ }
      await new Promise((s) => setTimeout(s, 1200));
    }
    dcBusy = false;
  })();
}
function log(line, { dc = false } = {}) {
  const s = `${stamp()} ${line}`;
  console.log(s);
  out.write(s + '\n');
  if (dc) discord(line);
}

// ---------- the rule: keep away from builds and other players ----------
// blocks no world generates by itself in the open (villages and ruins have some too: kept away from as well, which is fine)
const BUILT = /planks|glass|crafting_table|chest|barrel|_bed$|torch|lantern|wool|carpet|concrete|bricks|_slab|_stairs|_door|fence|furnace|smoker|anvil|_sign|bookshelf|rail|redstone_(wire|torch|lamp|block)|repeater|comparator|piston|hopper|composter|lectern|scaffolding|ladder|banner|bell|item_frame|shulker_box|enchanting_table|brewing_stand|beacon|quartz_block|smooth_stone|polished_|cut_|_wall$|campfire|flower_pot|candle|lever|_button|pressure_plate|observer|dispenser|dropper|tnt|iron_block|gold_block|diamond_block|emerald_block|copper_block|hay_block|glazed_terracotta|stained|sea_lantern|end_rod/;
// actions that only move or look: allowed anywhere (they change nothing)
const PASSIVE = /^(goto|travel|walk|sprint|sneak|jump|swim|look|lookat|turn|pos|inv|near|stop|status|players|survey|around|help|guard|respawn|goto_death|wait|sleepms|leave|fly|land|crawl)$/;
let guardOn = true;
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

// ---------- the player ----------
const me = { lastPacket: 0, closedAt: null, bot: null, account: null, busy: null, queue: [], abort: false, hp: null, food: null, dim: 'overworld', msa: null, connected: false, deaths: 0 };
async function transport() {
  if (cfg.transport !== 'auto') return cfg.transport;
  return new Promise((res) => {
    const r = http.get({ host: cfg.host, port: cfg.port, path: '/v1/join', timeout: 5000 }, (x) => { x.resume(); res(x.statusCode >= 200 && x.statusCode < 300 ? 'nethernet' : 'raknet'); });
    r.on('timeout', () => { r.destroy(); res('raknet'); });
    r.on('error', () => res('raknet'));
  });
}
async function connect() {
  const tr = await transport();
  log(`connecting to ${cfg.host}:${cfg.port} (${tr}) as ${cfg.name}`);
  const emit = (l) => {
    log(l);
    if (/ died \(|disconnected|kicked|error: /.test(l)) discord(l);
    if (/ died \(/.test(l)) { me.deaths++; setTimeout(() => me.bot?.act('respawn', []).catch(() => {}), 1500); }
    const m = /^@\S+ %death\.\S+ \[(\S+)\]/.exec(l); if (m) me.account = m[1];
  };
  const bot = await createRealPlayer({
    req, host: cfg.host, port: cfg.port, name: cfg.name, version: cfg.version, emit, transport: tr,
    rtc: tr === 'nethernet' ? req('node-datachannel/polyfill') : null, nn: { pins: path.join(RUN, 'nethernet-pins.json') }, opts: {}, timeoutMs: 300000,   // (the first join includes the sign-in)
    online: { profilesFolder: path.join(RUN, 'auth'), onMsaCode: (d) => { me.msa = d.user_code; log(`SIGN IN: open ${d.verification_uri} and enter ${d.user_code}`, { dc: true }); } },
  });
  me.msa = null; me.bot = bot; me.connected = true; me.closedAt = null;
  bot.client.on('update_attributes', (p) => { for (const a of p.attributes ?? []) { if (a.name === 'minecraft:health') me.hp = a.current; if (a.name === 'minecraft:player.hunger') me.food = a.current; } });
  bot.client.on('change_dimension', (p) => { me.dim = ['overworld', 'nether', 'the_end'][p.dimension] ?? String(p.dimension); });
  bot.client.on('start_game', (p) => { me.dim = ['overworld', 'nether', 'the_end'][p.dimension] ?? me.dim; });
  // 'close' can fire while the server still talks to us (a NetherNet data channel closing): gone only when packets stopped too
  // (joining again while still in = server_id_conflict, the account being in twice)
  me.lastPacket = Date.now();
  bot.client.on('packet', () => { me.lastPacket = Date.now(); });
  bot.client.on('close', () => { me.closedAt = Date.now(); });
  const p = bot.state().pos;
  log(`in the world at ${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}`, { dc: true });
}
async function stayIn() {
  let wait = 5000;
  for (;;) {
    // (a long path search can hold this thread for seconds: packets wait unread meanwhile, so look again after letting them in)
    if (me.connected && Date.now() - me.lastPacket > (me.closedAt ? 15000 : 30000) && (await sleep(4000), Date.now() - me.lastPacket > 12000)) {
      me.connected = false; me.closedAt = null; log('connection lost: joining again', { dc: true });
      try { me.bot?.close(); } catch { /* */ }
      await sleep(5000);
    }
    if (!me.connected) {
      try { await connect(); wait = 5000; } catch (e) { log(`connect failed: ${e.message}`); await sleep(wait); wait = Math.min(wait * 2, 120000); continue; }
    }
    await sleep(2000);
  }
}
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// ---------- built-in commands ----------
function status() {
  const b = me.bot; if (!b) return { connected: false, signIn: me.msa };
  const s = b.state();
  const t = b.time?.(), day = t === null || t === undefined ? null : ((t % 24000) + 24000) % 24000;
  const P = s.pos, hostile = [...b.entities.values()].filter((e) => HOSTILE.test(e.type ?? '') && Math.hypot(e.x - P.x, e.z - P.z) < 16).length;
  return { connected: me.connected, account: me.account, time: day, night: day === null ? null : day >= 12542 && day <= 23460, hostileNear: hostile, pos: { x: +s.pos.x.toFixed(1), y: +s.pos.y.toFixed(1), z: +s.pos.z.toFixed(1) }, dim: me.dim, hp: me.hp, food: me.food, dead: s.dead, deaths: me.deaths, busy: me.busy, queued: me.queue.length, guard: guardOn, players: b.players(), signIn: me.msa, uptime: Math.round((Date.now() - t0) / 1000) };
}
const BUILTIN = {
  help: () => log('commands: any bdslab action/verb (get_<item> [n], mine_<block> [n], goto x z, craft_<item>, kill_<mob>, fight_ender_dragon, inv, pos, near ...) · status · players · survey [r] · around · travel x z · guard on|off|<radius> · stop · clear · reconnect · update · quit'),
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
  reconnect: () => { try { me.bot?.close(); } catch { /* */ } me.connected = false; },
  // fetch the newest bdslab and start again (start.sh does it on exit code 75)
  update: () => { log('updating: back in a moment', { dc: true }); try { me.bot?.close(); } catch { /* */ } setTimeout(() => process.exit(75), 800); },
  quit: () => { log('bye', { dc: true }); try { me.bot?.close(); } catch { /* */ } setTimeout(() => process.exit(0), 800); },
};
// handled at once, even while something runs
const NOW = {
  stop: () => { me.abort = true; me.queue.length = 0; me.bot?.act('stop', []).catch(() => {}); log('stopped (queue cleared)'); },
  clear: () => { me.queue.length = 0; log('queue cleared'); },
  status: BUILTIN.status, players: BUILTIN.players, help: BUILTIN.help, quit: BUILTIN.quit, guard: BUILTIN.guard, update: BUILTIN.update,
};
function command(line) {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const [v, ...a] = line.replace(/^@\S+\s+/, '').replace(/^\//, '').split(/\s+/);
  if (NOW[v]) return NOW[v](a);
  me.queue.push(line);
}
async function worker() {
  for (;;) {
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
setInterval(async () => {
  const b = me.bot; if (!b || !me.connected || swinging || b.state().dead) return;
  const P = b.state().pos, e = [...b.entities.values()].filter((x) => HOSTILE.test(x.type ?? '') && !/creeper/.test(x.type) && Math.hypot(x.x - P.x, x.y - P.y, x.z - P.z) < 3.2)[0];
  if (!e) return;
  swinging = true;
  try { await b.act('attack', [e.type.replace('minecraft:', '')]); } catch { /* gone */ } finally { swinging = false; }
}, 700);

// ---------- inputs and status ----------
readline.createInterface({ input: process.stdin }).on('line', command);
setInterval(() => {
  for (const f of fs.readdirSync(INBOX).sort()) {
    const p = path.join(INBOX, f);
    try { const t = fs.readFileSync(p, 'utf8'); fs.renameSync(p, path.join(RUN, 'done-' + f)); for (const l of t.split('\n')) command(l); } catch { /* being written */ }
  }
  try { fs.writeFileSync(path.join(RUN, 'status.json'), JSON.stringify(status(), null, 1)); } catch { /* */ }
}, 1000);
process.on('unhandledRejection', (e) => log('error: ' + (e?.message ?? e)));
process.on('uncaughtException', (e) => log('error: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | ')));
log(`bdslab remote bot: ${cfg.name} → ${cfg.host}:${cfg.port} (type "help")`, { dc: true });
stayIn();
worker();
