'use strict';
// remote/bot.cjs — a resident bdslab player on someone's real server (not the lab's BDS).
// It stays in: reconnects when dropped, respawns when it dies, and takes commands while it plays, from three places:
//   - this terminal (type a line), - files dropped into run/inbox/ (one command per line), - `node remote/bot.cjs send "<cmd>"`
// It leaves and joins as few times as can be: nothing of its own makes it leave (`update` reloads the commands, remote/brain.cjs,
// in place; a busy thread or a stray NetherNet close is not taken for a lost connection; errors are logged, not fatal). Only when
// the server really dropped it (a disconnect packet, or no packet for a long while) does it join again, once, after a pause long
// enough for the server to let go of the old session (else: server_id_conflict, the account in twice, and another round).
// Every command is a bdslab player action or verb (get_<item>, mine_<block>, goto x z, craft_<item>, fight_ender_dragon ...)
// or one of the built-ins below (`help`). What happens goes to run/out.log, run/status.json and, when set, a Discord webhook.
// Server rules: it never works (digs, places, opens, attacks, uses) within guardRadius of a block someone built or of another
// player, and stops what it is doing when it comes that close (`guard off` lifts it; the config sets the radius).
// Online-mode servers: Xbox sign-in by a microsoft.com/link code (printed, written to status.json, sent to Discord), once;
// the account is kept in run/auth/. NetherNet or RakNet: found by asking the server (GET /v1/join on its TCP port).
const fs = require('node:fs');
// the terminal must never stop the bot: a paused terminal (Ctrl+S, a long selection) blocks a write to it, and a blocked write stopped
// the whole bot for hours at 11:09 (nothing read, nothing written, not even the watchdog's own line). Writes to it are queued instead.
try { for (const s of [process.stdout, process.stderr]) if (s.isTTY) s._handle?.setBlocking?.(false); } catch { /* */ }
const path = require('node:path');
const http = require('node:http');
const readline = require('node:readline');
const { createRequire } = require('node:module');

// (BOT_RUN / BOT_CONFIG / BOT_DEPS: another run folder, config and node_modules - remote/labtest.mjs runs this same bot against the lab's BDS)
const HERE = __dirname, RUN = process.env.BOT_RUN || path.join(HERE, 'run'), INBOX = path.join(RUN, 'inbox');
const CONFIG = process.env.BOT_CONFIG || path.join(HERE, 'config.json');
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
const req = createRequire(path.join(process.env.BOT_DEPS || path.join(HERE, '.deps'), 'package.json'));
// someone's crafting table, furnace or chest is never used: only what this player set down itself (common/goal-exec.cjs)
process.env.LAB_OWN_ONLY = '1';
// a generated world with the game's own rules (day and night, weather, mobs): the goal runner's own night, dusk, storm and
// sword-first reflexes are only on with this (it was never set here: they were all off on the real server until 11/16)
process.env.LAB_WORLD ??= 'normal';
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

// ---------- the player ----------
const me = { lastPacket: 0, closedAt: null, kicked: null, checking: false, quitting: false, bot: null, account: null, busy: null, queue: [], abort: false, hp: null, food: null, dim: 'overworld', msa: null, connected: false, deaths: 0 };
let knownTransport = null;   // what the server answered last time (a server restarting answers nothing for a while: not RakNet then)
async function transport() {
  if (cfg.transport !== 'auto') return cfg.transport;
  if (knownTransport) return knownTransport;
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
    for (const t of taps) { try { t(l); } catch { /* */ } }
    if (/ died \(|disconnected|kicked|error: /.test(l)) discord(l);
    if (/server_id_conflict/.test(l)) me.lastConflict = Date.now();
    if (/ died \(/.test(l)) { me.deaths++; setTimeout(() => me.bot?.act('respawn', []).catch(() => {}), 1500); }
    const m = /^@\S+ %death\.\S+ \[(\S+)\]/.exec(l); if (m) me.account = m[1];
  };
  const bot = await createRealPlayer({
    req, host: cfg.host, port: cfg.port, name: cfg.name, version: cfg.version, emit, transport: tr,
    rtc: tr === 'nethernet' ? req('node-datachannel/polyfill') : null, nn: { pins: path.join(RUN, 'nethernet-pins.json') }, opts: {}, timeoutMs: 300000,   // (the first join includes the sign-in)
    online: cfg.offline ? null : { profilesFolder: path.join(RUN, 'auth'), onMsaCode: (d) => { me.msa = d.user_code; log(`SIGN IN: open ${d.verification_uri} and enter ${d.user_code}`, { dc: true }); } },
  });
  knownTransport = tr; me.msa = null; me.bot = bot; me.connected = true; me.closedAt = null; me.kicked = null;
  bot.setLegit?.(cfg.legit !== false);
  // what it set down before (its own table, furnace, bed) stays its own across restarts
  try { for (const k of JSON.parse(fs.readFileSync(path.join(RUN, 'placed.json'), 'utf8'))) bot.placedByMe?.add(k); } catch { /* none yet */ }   // only what a person could do: looking at it, in reach, nothing in between
  bot.client.on('update_attributes', (p) => { const r = bot.rid?.(); if (r === null || r === undefined || BigInt(p.runtime_entity_id) !== BigInt(r)) return;   // (its own only: every mob's health came through here too - 'health 0' while alive, and running from a fight it was winning)
    for (const a of p.attributes ?? []) { if (a.name === 'minecraft:health') me.hp = a.current; if (a.name === 'minecraft:player.hunger') me.food = a.current; } });
  bot.client.on('change_dimension', (p) => { me.dim = ['overworld', 'nether', 'the_end'][p.dimension] ?? String(p.dimension); });
  bot.client.on('start_game', (p) => { me.dim = ['overworld', 'nether', 'the_end'][p.dimension] ?? me.dim; });
  // 'close' can fire while the server still talks to us (a NetherNet data channel closing): gone only when packets stopped too
  // (joining again while still in = server_id_conflict, the account being in twice)
  me.lastPacket = Date.now();
  bot.client.on('packet', () => { me.lastPacket = Date.now(); });
  bot.client.on('close', () => { me.closedAt = Date.now(); });
  bot.client.on('disconnect', (p) => { me.kicked = [p.reason, p.message].filter(Boolean).join(' ') || 'disconnected'; });
  const p = bot.state().pos;
  log(`in the world at ${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}`, { dc: true });
}
// join; then watch. Gone for real = the server said so (disconnect), or no packet for 45 s (30 s after a close) measured after
// the thread had time to read what was waiting. Then: one rejoin after a pause (60 s after server_id_conflict); a manual
// `reconnect` any time; `quit` stops for good.
async function joinOnce() {
  // the server may be down for a while (a restart, an update): keep trying every cfg.joinEveryMin minutes (default 30), never give up
  const every = (cfg.joinEveryMin ?? 30) * 60000;
  // (server_id_conflict = the server still holds our last session, e.g. just after our own restart: not a server that is down -
  //  it lets go within a minute or two, so up to 3 short retries 90 s apart before the 30-minute rhythm)
  let conflicts = 0;
  for (let i = 0; !me.connected && !me.quitting; i++) {
    try { await connect(); } catch (e) {
      const conflict = Date.now() - (me.lastConflict ?? 0) < 15000 || /server_id_conflict/.test(String(e.message));
      const wait = conflict && conflicts++ < 3 ? 90000 : every;
      log(`join failed: ${e.message}${conflict ? ' (server_id_conflict: the old session is still held)' : ''}: next try in ${wait < 60000 * 2 ? Math.round(wait / 1000) + ' s' : Math.round(wait / 60000) + ' min'}`, { dc: true });
      me.kicked = null; await sleep(wait);
    }
  }
}
setInterval(async () => {
  if (!me.connected || me.checking || me.away) return;
  if (!me.kicked && Date.now() - me.lastPacket < (me.closedAt ? 30000 : 45000)) return;
  me.checking = true; await sleep(5000); me.checking = false;
  if (!me.kicked && Date.now() - me.lastPacket < 15000) return;
  me.connected = false;
  const why = me.kicked ?? `no packet for ${Math.round((Date.now() - me.lastPacket) / 1000)}s`;
  try { me.bot?.close(); } catch { /* */ }
  if (me.quitting) return;
  log(`dropped by the server (${why}): joining again in ${cfg.joinEveryMin ?? 30} min`, { dc: true });
  await sleep((cfg.joinEveryMin ?? 30) * 60000);
  me.kicked = null;
  if (!me.connected) await joinOnce();
}, 2000);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

const taps = new Set();   // the brain listens to what the player says (an auto step reads its outcome)

// ---------- the brain (commands, guard, work): reloadable in place ----------
const BRAIN = path.join(HERE, 'brain.cjs');
let brain = null;
function loadBrain() {
  const old = brain;
  delete require.cache[require.resolve(BRAIN)];
  const make = require(BRAIN);
  if (old) old.dispose();
  brain = make({ me, cfg, log, sleep, t0, taps, RUN, guardOn: old?.guardOn(), setLegit: (v) => me.bot?.setLegit?.(v),
    rejoin: async () => { if (me.connected) return log('already in the server'); me.kicked = null; await joinOnce(); },
    reload: () => { try { loadBrain(); log('reloaded brain.cjs (still in the server)', { dc: true }); } catch (e) { log('reload failed, keeping the old one: ' + e.message, { dc: true }); } },
    update: () => {
      const r = require('node:child_process').spawnSync('bash', ['-c', 'b=$(git rev-parse --abbrev-ref HEAD) && git fetch -q --depth 1 origin "$b" && git checkout -q -B "$b" FETCH_HEAD && git log --oneline -1'], { cwd: path.join(HERE, '..'), encoding: 'utf8' });
      if (r.status !== 0) return log('update failed: ' + (r.stderr || r.stdout).trim(), { dc: true });
      log('updated to ' + r.stdout.trim() + ' (brain reloaded; realplayer changes take effect at the next start)', { dc: true });
      try { loadBrain(); } catch (e) { log('reload failed, keeping the old one: ' + e.message, { dc: true }); }
    },
    // away for a while, then back once (the user, 15:57: when the night catches it unarmed at the world spawn - where nothing may be dug
    // or built - it leaves for the night and joins again in the morning; one leave and one join a night)
    away: async (ms, why) => { if (!me.connected) return; me.away = true; log(`leaving for ${Math.round(ms / 1000)} s (${why}); back once after`, { dc: true }); me.connected = false; try { me.bot?.close(); } catch { /* */ } await sleep(ms); me.away = false; me.kicked = null; await joinOnce(); },
    quit: () => { me.quitting = true; log('bye', { dc: true }); try { me.bot?.close(); } catch { /* */ } setTimeout(() => process.exit(0), 800); },
  });
}

// ---------- inputs and status ----------
const command = (l) => { try { brain.command(l); } catch (e) { log('error: ' + e.message); } };
readline.createInterface({ input: process.stdin }).on('line', command);
setInterval(() => {
  for (const f of fs.readdirSync(INBOX).sort()) {
    const p = path.join(INBOX, f);
    try { const t = fs.readFileSync(p, 'utf8'); fs.renameSync(p, path.join(RUN, 'done-' + f)); for (const l of t.split('\n')) command(l); } catch { /* being written */ }
  }
  try { fs.writeFileSync(path.join(RUN, 'status.json'), JSON.stringify(brain.status(), null, 1)); } catch { /* */ }
  if (me.bot?.placedByMe?.size && me.bot.placedByMe.size !== me.placedSaved) { try { fs.writeFileSync(path.join(RUN, 'placed.json'), JSON.stringify([...me.bot.placedByMe].slice(-5000))); me.placedSaved = me.bot.placedByMe.size; } catch { /* */ } }
}, 1000);
process.on('unhandledRejection', (e) => log('error: ' + (e?.message ?? e)));
process.on('uncaughtException', (e) => log('error: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | ')));
loadBrain();
log(`bdslab remote bot: ${cfg.name} → ${cfg.host}:${cfg.port} (type "help")`, { dc: true });
// after our own restart (exit 75) the server may still hold the old session for a few seconds: give it 20 s first
(async () => { if (process.env.LAB_RESTARTED || fs.existsSync(path.join(RUN, 'auto.json'))) await sleep(20000); joinOnce(); })();
