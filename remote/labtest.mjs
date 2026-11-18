// remote/labtest.mjs — the remote bot (bot.cjs + brain.cjs, the very code that plays on someone's server) run against the lab's own
// BDS in a generated world, one scenario after another, each with a pass/fail check read from the server or the bot's own files.
//   node remote/labtest.mjs            all scenarios        node remote/labtest.mjs bed fight      some
// A fix for the remote bot is tried here first: reproduce the failure, fix, all scenarios green, then `restart` on the real server.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.dirname(HERE);
const RUN = process.env.LABTEST_RUN || '/tmp/labbot/run', CFG = path.join(path.dirname(RUN), 'config.json');
const ENV = { ...process.env, LAB_WORLD: 'normal', LAB_SEED: process.env.LAB_SEED ?? '11' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lab = (...a) => { const r = spawnSync(process.execPath, ['lab.mjs', ...a], { cwd: ROOT, env: ENV, encoding: 'utf8', timeout: 400000 }); return (r.stdout ?? '') + (r.stderr ?? ''); };
const srv = (...cmds) => lab('do', '-a', 'lamp', ...cmds);
const NAME = 'LabBot';
let bot = null, sent = 0;
const send = (...cmds) => fs.writeFileSync(path.join(RUN, 'inbox', `t${String(++sent).padStart(4, '0')}.txt`), cmds.join('\n') + '\n');
const status = () => { try { return JSON.parse(fs.readFileSync(path.join(RUN, 'status.json'), 'utf8')); } catch { return {}; } };
const logText = () => { try { return fs.readFileSync(path.join(RUN, 'out.log'), 'utf8'); } catch { return ''; } };
let mark = 0;
const since = () => logText().slice(mark);
const waitLog = async (re, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { const m = re.exec(since()); if (m) return m; await sleep(500); } return null; };
const waitFor = async (fn, ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { const v = await fn(); if (v) return v; await sleep(700); } return null; };
const pos = () => status().pos ?? { x: 0, y: 0, z: 0 };
// a clean start for a scenario: alive, nothing carried, day, no monsters about, nothing queued
async function fresh({ time = 'day', keep = false } = {}) {
  send('stop'); await sleep(800); send('auto stop'); send('resume');
  srv(`time set ${time}`, 'weather clear', ...(keep ? [] : [`clear ${NAME}`]), 'kill @e[type=!player,family=monster]', `effect ${NAME} instant_health 1 20`, `effect ${NAME} saturation 1 20`);
  await sleep(1500); mark = logText().length;
}
const S = {
  // a bed set down and clicked becomes the respawn point - said by the server, and a death comes back to it
  async bed() {
    await fresh();
    srv(`spreadplayers ~ ~ 0 200 false ${NAME}`); await sleep(3000);   // (somewhere away from the world spawn)
    srv(`give ${NAME} bed 1`); await sleep(1500);
    send('bed');
    const m = await waitLog(/bed: (respawn point set|not set)/, 90000);
    if (!m || m[1] !== 'respawn point set') return `bed: ${m ? m[1] : 'no answer'} · ${since().split('\n').filter((l) => /bed|useon|respawn/.test(l)).slice(-4).join(' | ')}`;
    const at = pos();
    srv(`kill ${NAME}`);
    await waitLog(/respawned/, 20000); await sleep(4000);
    const p = pos(), d = Math.hypot(p.x - at.x, p.z - at.z);
    return d < 12 ? true : `respawned ${Math.round(d)} blocks from the bed (${Math.round(p.x)} ${Math.round(p.z)} vs ${Math.round(at.x)} ${Math.round(at.z)})`;
  },
  // nothing in hand, night, two zombies: three minutes on, still alive
  async night_unarmed() {
    await fresh({ time: '14000' });
    srv(`execute at ${NAME} run summon zombie ~6 ~ ~`, `execute at ${NAME} run summon zombie ~-6 ~ ~2`);
    send('nightsit');
    const d0 = status().deaths ?? 0;
    for (let t = 0; t < 36; t++) { await sleep(5000); if ((status().deaths ?? 0) > d0) return `died after ${t * 5} s · ${since().split('\n').filter((l) => /fight|shelter|night|died|death/.test(l)).slice(-6).join(' | ')}`; }
    send('stop');
    return true;
  },
  // a stone sword against one zombie by day: the zombie dies, the bot does not
  async fight_zombie() {
    await fresh();
    srv(`give ${NAME} stone_sword 1`, `execute at ${NAME} run summon zombie ~5 ~ ~`); 
    const d0 = status().deaths ?? 0;
    const gone = await waitFor(() => (status().deaths ?? 0) > d0 || /No targets/.test(srv(`execute at ${NAME} run testfor @e[type=zombie,r=30]`)), 60000);
    if ((status().deaths ?? 0) > d0) return `died · ${since().split('\n').filter((l) => /fight|attack|died/.test(l)).slice(-6).join(' | ')}`;
    return gone ? true : `the zombie still lives after 60 s (hp ${status().hp}) · ${since().split('\n').filter((l) => /fight|attack/.test(l)).slice(-5).join(' | ')}`;
  },
  // dead with tools: back for them, and they are in the inventory again
  async fetch() {
    await fresh();
    srv(`give ${NAME} stone_sword 1`, `give ${NAME} stone_pickaxe 1`, `give ${NAME} cobblestone 20`); await sleep(4000);
    srv(`kill ${NAME}`);
    const m = await waitLog(/death: (back with .*|not going back.*|my things lie.*|fetching failed.*)/, 120000);
    if (!m) return `no fetch report · ${since().split('\n').slice(-6).join(' | ')}`;
    return /back with .*stone_sword/.test(m[1]) && /stone_pickaxe/.test(m[1]) ? true : m[1].slice(0, 200);
  },
  // dead at the bottom of a hole three deep: down to the things, back up with them
  async fetch_hole() {
    await fresh();
    srv(`give ${NAME} stone_sword 1`, `give ${NAME} stone_pickaxe 1`, `give ${NAME} cobblestone 20`); await sleep(2000);
    send('dig_down 3'); await sleep(9000);
    srv(`kill ${NAME}`);
    const m = await waitLog(/death: (back with .*|not going back.*|my things lie.*|fetching failed.*)/, 150000);
    if (!m) return `no fetch report · ${since().split('\n').slice(-6).join(' | ')}`;
    return /back with .*stone_sword/.test(m[1]) && /stone_pickaxe/.test(m[1]) ? true : m[1].slice(0, 200);
  },
  // a stone sword and six husks: counted beforehand, not fought - away from them, and alive 40 s on
  async flee_many() {
    await fresh();
    srv(`give ${NAME} stone_sword 1`); await sleep(1500);
    srv(...[4, -4, 5, -5, 6, -6].map((d, i) => `execute at ${NAME} run summon husk ~${d} ~ ~${i % 2 ? 3 : -3}`));
    const d0 = status().deaths ?? 0;
    const m = await waitLog(/fight: not this one/, 20000);
    for (let t = 0; t < 8; t++) { await sleep(5000); if ((status().deaths ?? 0) > d0) return `died after ${t * 5} s · ${since().split('\n').filter((l) => /fight|died/.test(l)).slice(-6).join(' | ')}`; }
    return m ? true : `it never counted the odds · ${since().split('\n').filter((l) => /fight/.test(l)).slice(-5).join(' | ')}`;
  },
  // the End, with what the plan brings there: the crystals, then the dragon (long: asked for by name only)
  async dragon() {
    await fresh();
    srv(...['iron_sword', 'bow', 'arrow 64', 'arrow 64', 'arrow 64', 'cooked_beef 32', 'cobblestone 64', 'cobblestone 64', 'iron_pickaxe', ...(process.env.LABTEST_BEDS ? [`bed ${process.env.LABTEST_BEDS} 14`] : []), ...(process.env.NO_PUMPKIN ? [] : ['carved_pumpkin']), 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'shield'].map((i) => `give ${NAME} ${i}`));
    await sleep(2000); send('armor_up'); await sleep(5000); if (!process.env.NO_PUMPKIN) { send('equip carved_pumpkin'); await sleep(3000); }
    srv(`execute in the_end run tp ${NAME} 30 61 30 0 60`); await waitLog(/dimension the_end/, 20000); await sleep(1500);
    // UNCAGE=1: the open crystals are gone already, only the two in cages are left (the part being worked on, without 3 min first)
    if (process.env.UNCAGE) { srv(...[[-32, 77, 25], [43, 86, 1], [13, 89, 40], [34, 92, -23], [-11, 95, 40], [-41, 98, 1], [-32, 101, -23], [-11, 104, -38]].map(([x, y, z]) => `execute in the_end run kill @e[type=ender_crystal,x=${x},y=${y},z=${z},r=3]`)); srv(`give ${NAME} cobblestone 64`); }   // (the open ones of seed 11 gone: the two caged left)
    if (process.env.LABTEST_RESIST) srv(`effect ${NAME} resistance 9999 4 true`);   // (for measuring the fight's mechanics only: not a result)
    send(process.env.DRAGON_CMD ?? 'dragon');
    const d0 = status().deaths ?? 0;
    const m = await waitFor(() => /dragon: (killed|not killed)/.exec(since()) || /(done|failed) "fight_ender_dragon[^"]*"[^\n]*/.exec(since()) || ((status().deaths ?? 0) > d0 ? ['', 'died'] : null), Number(process.env.DRAGON_MS ?? 1500000));
    return m && m[1] === 'killed' ? true : `${m ? m[1] : 'still going'} · ${since().split('\n').filter((l) => /dragon:/.test(l)).slice(-6).join(' | ')}`;
  },
  // mechanics by hand (MECH="cmd;cmd;..."): each sent in turn, 4 s apart, then the log
  async mech() {
    await fresh();
    srv(`give ${NAME} end_stone 16`, `give ${NAME} bed 4 14`, `give ${NAME} cobblestone 64`, `give ${NAME} iron_pickaxe 1`); await sleep(2000);
    for (const c of (process.env.MECH ?? '').split(';')) { send(c.trim()); await sleep(Number(process.env.MECH_GAP ?? 4000)); }
    console.log(since().split('\n').filter((l) => !/dbg/.test(l)).slice(-40).join('\n'));
    return true;
  },
  // a chest of our own: the diamonds go in (read back from the open chest), the inventory is lost, they come out again
  async stash() {
    await fresh();
    srv(`give ${NAME} chest 1`, `give ${NAME} diamond 3`, `give ${NAME} stone_sword 1`); await sleep(3000);
    send('stash');
    const m = await waitLog(/stash: (in the chest: .*|no chest.*|the chest did not.*)/, 90000);
    if (!m || !/in the chest: .*diamond\*3/.test(m[1]) || /still carried/.test(m[1])) return `put: ${m ? m[1].slice(0, 160) : 'no answer'} · ${since().split('\n').filter((l) => /stash|chest|open/.test(l)).slice(-5).join(' | ')}`;
    srv(`clear ${NAME}`); await sleep(2500); mark = logText().length;
    send('stash take');
    const t = await waitLog(/stash: (everything taken out.*|still in the chest.*|the chest did not.*|no chest.*)/, 60000);
    return t && /everything taken out .*diamond\*3/.test(t[1]) ? true : `take: ${t ? t[1].slice(0, 160) : 'no answer'}`;
  },
};
async function main() {
  const want = process.argv.slice(2).filter((a) => S[a]); const names = want.length ? want : Object.keys(S).filter((n) => n !== 'dragon' && n !== 'mech');
  fs.rmSync(path.dirname(RUN), { recursive: true, force: true }); fs.mkdirSync(path.join(RUN, 'inbox'), { recursive: true });
  // the same untouched world every run: `up` keeps what a run left behind (a chest from the last run's stash scenario was "someone's
  // build" to the next) - a clean copy is put aside the first time and put back before each run
  { const tpl = path.join(ROOT, 'bds', '.lab', `world-normal-${ENV.LAB_SEED}`), clean = tpl + '.clean';
    if (fs.existsSync(clean)) { fs.rmSync(tpl, { recursive: true, force: true }); fs.cpSync(clean, tpl, { recursive: true }); }
    else if (!fs.existsSync(tpl)) { lab('up', '-a', 'lamp'); lab('down'); if (fs.existsSync(tpl)) fs.cpSync(tpl, clean, { recursive: true }); } }
  process.stdout.write('lab server (generated world) ... ');
  const up = lab('up', '-a', 'lamp'); if (!/OK live/.test(up)) { console.log('FAIL\n' + up.slice(-1500)); process.exit(1); }
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'bds', '.lab', 'live.json'), 'utf8'));
  console.log(`up on ${live.port}`);
  fs.writeFileSync(CFG, JSON.stringify({ host: '127.0.0.1', port: live.port, name: NAME, version: live.version ?? undefined, transport: 'raknet', offline: true, webhook: '', guardRadius: 48, joinEveryMin: 0.2, reviewDeaths: false }));
  bot = spawn(process.execPath, [path.join(HERE, 'bot.cjs')], { env: { ...ENV, BOT_RUN: RUN, BOT_CONFIG: CFG, BOT_DEPS: path.join(ROOT, 'bds', '.lab', 'node') }, stdio: ['pipe', fs.openSync(path.join(path.dirname(RUN), 'terminal.log'), 'w'), 'inherit'] });
  let fail = 0;
  try {
    if (!(await waitFor(() => /in the world at/.test(logText()), 90000))) { console.log('FAIL the bot did not join\n' + logText().slice(-1500)); process.exit(1); }
    srv(`op ${NAME}`, 'gamerule keepinventory false', 'difficulty normal');
    for (const n of names) {
      const t0 = Date.now(); let r; try { r = await S[n](); } catch (e) { r = 'error: ' + e.message; }
      if (r !== true) fail++;
      console.log(`${r === true ? 'PASS' : 'FAIL'} ${n} (${Math.round((Date.now() - t0) / 1000)} s)${r === true ? '' : ' — ' + r}`);
    }
  } finally {
    try { send('quit'); await sleep(1500); bot.kill(); } catch { /* */ }
    lab('down');
    if (fail || process.env.LABTEST_KEEP) console.log(`(the bot's log: ${path.join(RUN, 'out.log')})`);
  }
  console.log(fail ? `FAIL ${fail} of ${names.length}` : `OK ${names.length} scenarios`);
  process.exit(fail ? 1 : 0);
}
main();
