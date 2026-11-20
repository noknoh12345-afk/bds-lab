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
// ---------- the road to the End (作業指示書_エンドまでの道担当.md; its code is remote/road.cjs) ----------
// what the bot carries, read from the server itself (the Script API): every slot and the armour worn, the enchantments on each,
// the XP level, the dimension. null when the bot is not in the world.
const carried = () => {
  const out = srv(`js (()=>{const p=world.getPlayers({name:'${NAME}'})[0];if(!p)return 'ROAD null';const m={},en=[];const add=(it,w)=>{const k=it.typeId.replace('minecraft:','');m[k]=(m[k]??0)+it.amount;const e=it.getComponent('enchantable');const l=e?e.getEnchantments():[];if(l.length||w)en.push((w?w+':':'')+k+'['+l.map((x)=>String(x.type.id).replace('minecraft:','')+' '+x.level).join(',')+']');};const c=p.getComponent('inventory').container;for(let i=0;i<c.size;i++){const it=c.getItem(i);if(it)add(it,'');}const eq=p.getComponent('equippable');for(const s of ['Head','Chest','Legs','Feet','Offhand']){const it=eq.getEquipment(s);if(it)add(it,s);}return 'ROAD '+JSON.stringify({m,en,lv:p.level,dim:p.dimension.id.replace('minecraft:',''),hp:Math.round(p.getComponent('health').currentValue)});})()`);
  const l = /^ROAD (.*)$/m.exec(out)?.[1]; try { return JSON.parse(l); } catch { return null; }   // (the line it printed, not the command echoed above it)
};
const ARMOUR = ['helmet', 'chestplate', 'leggings', 'boots'];
const nOf = (c, re) => Object.entries(c?.m ?? {}).filter(([k]) => re.test(k)).reduce((s, [, n]) => s + n, 0);
const protOf = (c, piece) => Math.max(0, ...(c?.en ?? []).filter((e) => new RegExp(`(^|:)iron_${piece}\\[`).test(e)).map((e) => Number(/(^|\[|,)protection (\d)/.exec(e)?.[2] ?? 0)));
// the kit the lab's dragon wins had (HANDOFF: Protection IV iron, Feather Falling III, 16 golden apples, 12 beds, 192 arrows, 256
// cobblestone, a carved pumpkin, sword, pickaxe, shield, food) - the floor of it: what the brief says may not be cut
const KIT = [['Protection IV on all four', (c) => ARMOUR.every((p) => protOf(c, p) >= 4)], ['golden apples 8+', (c) => nOf(c, /^golden_apple$/) >= 8], ['beds 8+', (c) => nOf(c, /(^|_)bed$/) >= 8],
  ['bow', (c) => nOf(c, /^bow$/) >= 1], ['arrows 128+', (c) => nOf(c, /^arrow$/) >= 128], ['cobblestone 128+', (c) => nOf(c, /^cobblestone$/) >= 128], ['carved pumpkin', (c) => nOf(c, /^carved_pumpkin$/) >= 1],
  ['iron sword', (c) => nOf(c, /^(iron|diamond|netherite)_sword$/) >= 1], ['iron pickaxe', (c) => nOf(c, /^(iron|diamond|netherite)_pickaxe$/) >= 1], ['shield', (c) => nOf(c, /^shield$/) >= 1],
  ['food 16+', (c) => nOf(c, /^(cooked_\w+|bread|baked_potato|golden_carrot)$/) >= 16]];
const kitMissing = (c) => KIT.filter(([, f]) => !f(c)).map(([n]) => n);
// the bot moved to x z on the surface for a test, unhurt (spreadplayers into land not yet made dropped it from the sky: 11/20 a death)
async function moveTo(at) {
  const [x, z] = at.split(/\s+/);
  srv(`effect ${NAME} slow_falling 90 0 true`, `effect ${NAME} resistance 90 4 true`, `tp ${NAME} ${x} 140 ${z}`);
  await sleep(8000); srv(`spreadplayers ${x} ${z} 0 4 ${NAME}`); await sleep(3000);
  for (let t = 0, y0 = -999; t < 45; t++) { const y = status().pos?.y ?? 0; if (Math.abs(y - y0) < 0.05) break; y0 = y; await sleep(2000); }   // (on the ground: still for 2 s)
  srv(`effect ${NAME} clear`); await sleep(1000);
}
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
function roadLine(t0, c, d0) {
  const steps = [...since().matchAll(/auto: step "([^"]+)"/g)].map((m) => m[1]), s = status(), p = s.pos ?? {};
  const inv = c ? Object.entries(c.m).sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `${k}*${n}`).join(' ') : '?';
  return `  [${mmss(Date.now() - t0)}] step ${steps.length ? `"${steps.at(-1).slice(0, 48)}"` : '-'} · deaths ${(s.deaths ?? 0) - d0} · ${s.dim ?? '?'} ${Math.round(p.x ?? 0)} ${Math.round(p.y ?? 0)} ${Math.round(p.z ?? 0)} hp ${s.hp ?? '?'} · lv ${c?.lv ?? '?'}${c?.en?.length ? ` · ench ${c.en.join(' ')}` : ''} · ${inv.slice(0, 600)}`;
}
// one stage of the road: a kit given (the stages before it, done), commands sent (`auto` by default), then until check(carried)
// passes or the time is up (ROAD_MS overrides). A line of progress every ROAD_EVERY ms (default 10 min).
async function road({ kit = [], cmds = ['auto'], ms = 3600000, check, why = () => '', setup }) {
  await fresh();
  if (kit.length) { srv(...kit.map((i) => `give ${NAME} ${i}`)); await sleep(2500); }
  if (setup) await setup();
  mark = logText().length;
  if (process.env.ROAD_GUARD === 'off') send('guard off');   // (exploring one verb in the lab: its natural chests are 'someone's build' to the guard)
  for (const c of cmds) send(c);
  const t0 = Date.now(), limit = Number(process.env.ROAD_MS ?? ms), every = Number(process.env.ROAD_EVERY ?? 600000), d0 = status().deaths ?? 0;
  let said = Date.now(), c = null;
  const last = cmds.at(-1), ends = last === 'auto' ? null : new RegExp(`(done|failed) "${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^\\n]*`);   // (a single command: over when the bot says it is)
  while (Date.now() - t0 < limit) {
    await sleep(30000);
    c = carried();
    if (c && check(c)) { console.log(roadLine(t0, c, d0)); return true; }
    if (Date.now() - said >= every) { said = Date.now(); console.log(roadLine(t0, c, d0)); }
    const e = ends?.exec(since()); if (e) { console.log(roadLine(t0, c, d0)); return `${e[0].slice(0, 200)}${c ? why(c) : ''}`; }
  }
  c = carried(); console.log(roadLine(t0, c, d0));
  return `not done in ${mmss(limit)}${c ? why(c) : ' (not in the world)'}`;
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
    // LABTEST_RETRIES=n: a death in the End is not the end of the fight on a real server - the dragon keeps what it lost and the
    // crystals stay broken; the bot comes back with a new kit. Each try after the first: respawned, the kit again, the same arrival
    const tries = 1 + Number(process.env.LABTEST_RETRIES ?? 0), T0 = Date.now(); let m = null;
    for (let k = 0; k < tries; k++) {
    if (k) { await sleep(12000); for (let w = 0; w < 45 && (status().dead || status().dim !== 'overworld' || !status().connected); w++) await sleep(2000); await sleep(6000);   /* (12:15: the server dropped it after the respawn and the new kit went to nobody) */ send('stop'); send('resume'); srv(`clear ${NAME}`); await sleep(3000); console.log(`try ${k + 1} of ${tries} (${Math.round((Date.now() - T0) / 1000)} s in)`); mark = logText().length; }
      srv(...['iron_sword', 'bow', 'arrow 64', 'arrow 64', 'arrow 64', 'cooked_beef 32', 'cobblestone 64', 'cobblestone 64', 'cobblestone 64', 'cobblestone 64', 'iron_pickaxe', ...(process.env.LABTEST_BEDS ? [`bed ${process.env.LABTEST_BEDS} 14`] : []), ...(process.env.LABTEST_GAPPLES ? [`golden_apple ${process.env.LABTEST_GAPPLES}`] : []), ...(process.env.NO_PUMPKIN ? [] : ['carved_pumpkin']), ...['helmet', 'chestplate', 'leggings', 'boots'].map((p) => `${process.env.LABTEST_ARMOR ?? 'iron'}_${p}`), 'shield'].map((i) => `give ${NAME} ${i}`));
      await sleep(2000); if (process.env.LABTEST_PROT) for (const pc of ['helmet', 'chestplate', 'leggings', 'boots']) { send(`hold_${process.env.LABTEST_ARMOR ?? 'iron'}_${pc}`); await sleep(2500); srv(`enchant ${NAME} protection ${process.env.LABTEST_PROT}`); await sleep(500); if (pc === 'boots' && process.env.LABTEST_FEATHER) { srv(`enchant ${NAME} feather_falling ${process.env.LABTEST_FEATHER}`); await sleep(500); } }   /* (LABTEST_FEATHER: Feather Falling on the boots too - 13:02 on 19 Nov, knocked off a cage pillar at 74 to 60 and 19 → 1 by the fall) */   // (Protection: the one thing that lessens its breath - armour points do not)
      send('armor_up'); await sleep(5000); if (!process.env.NO_PUMPKIN) { send('equip carved_pumpkin'); await sleep(3000); }
      if (k) { send('stop'); srv(`effect ${NAME} instant_health 1 20`, `effect ${NAME} saturation 1 20`); await sleep(3000); }   // (11:21: the second try arrived at 4 health with its things being fetched, and fell)
      if (process.env.LABTEST_ARRIVE === 'platform') { srv(`execute in the_end run tp ${NAME} 100.5 70 0.5 90 30`, `effect ${NAME} slow_falling 6 1 true`); await sleep(2500); srv('execute in the_end run fill 98 48 -2 102 48 2 obsidian', 'execute in the_end run fill 98 49 -2 102 51 2 air'); await sleep(4000); }   // (the platform a portal makes: a tp alone finds only void there)
      srv(process.env.LABTEST_ARRIVE === 'platform' ? `execute in the_end run tp ${NAME} 100.5 49 0.5 90 30` : `execute in the_end run tp ${NAME} 30 61 30 0 60`); await waitLog(/dimension the_end/, 20000); await sleep(1500);
      if (process.env.LABTEST_RESIST) srv(`effect ${NAME} resistance 9999 4 true`);   // (for measuring the fight's mechanics only: not a result)
    if (k === 0) {
      if (process.env.LABTEST_NOCRYSTALS) { srv(`execute in the_end run kill @e[type=ender_crystal]`); await sleep(1000); srv(`execute in the_end run kill @e[type=ender_crystal]`); }   // (sitting and the blows on it, measured on their own)
      if (process.env.UNCAGE) { srv(...[[-32, 77, 25], [43, 86, 1], [13, 89, 40], [34, 92, -23], [-11, 95, 40], [-41, 98, 1], [-32, 101, -23], [-11, 104, -38]].map(([x, y, z]) => `execute in the_end run kill @e[type=ender_crystal,x=${x},y=${y},z=${z},r=3]`)); srv(`give ${NAME} cobblestone 64`); }   // (the open ones of seed 11 gone: the two caged left)
    }
      send(process.env.DRAGON_CMD ?? 'dragon');
      const d0 = status().deaths ?? 0;
      m = await waitFor(() => /dragon: (killed|not killed)/.exec(since()) || /(done|failed) "fight_ender_dragon[^"]*"[^\n]*/.exec(since()) || ((status().deaths ?? 0) > d0 ? ['', 'died'] : null), Math.max(10000, Number(process.env.DRAGON_MS ?? 1500000) - (Date.now() - T0)));
      if (m && m[1] === 'killed') { console.log(`killed on try ${k + 1} of ${tries}`); return true; }
      await sleep(5000);   // (the deaths count in status.json comes a moment after 'not killed': 10:06, the retry skipped)
      if (!(m && (m[1] === 'died' || m[1] === 'not killed') && ((status().deaths ?? 0) > d0 || /died \(/.test(since())))) break;
    }
    return m && m[1] === 'killed' ? true : `${m ? m[1] : 'still going'} · ${since().split('\n').filter((l) => /dragon:/.test(l)).slice(-6).join(' | ')}`;
  },
  // mechanics by hand (MECH="cmd;cmd;..."): each sent in turn, 4 s apart, then the log
  async mech() {
    await fresh();
    srv(`give ${NAME} end_stone 16`, `give ${NAME} bed 4 14`, `give ${NAME} cobblestone 64`, `give ${NAME} iron_pickaxe 1`); await sleep(2000);
    if (process.env.MECH_END) { srv(`give ${NAME} carved_pumpkin 1`, `effect ${NAME} resistance 9999 4 true`); await sleep(1000); send('equip carved_pumpkin'); await sleep(2000); srv(`execute in the_end run tp ${NAME} ${process.env.MECH_END.replace(/,/g, ' ')}`); await waitLog(/dimension the_end/, 20000); await sleep(3000); }
    if (process.env.MECH_SETUP) { console.log(String(srv(...process.env.MECH_SETUP.split(';').map((c) => `execute in the_end run ${c}`))).slice(-600)); if (process.env.MECH_END) srv(`execute in the_end run tp ${NAME} ${process.env.MECH_END.replace(/,/g, ' ')}`); await sleep(3000); }   // (after the tp: the chunk is loaded then)
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
  // ---- the road (long: asked for by name only) ----
  // the whole of it: nothing carried, `auto`, until it stands in the End (the exit portal's platform) with the kit that wins
  async road_auto() {
    return road({ ms: 8 * 3600000, check: (c) => c.dim === 'the_end' && !kitMissing(c).length, why: (c) => ` · in ${c.dim}, kit missing: ${kitMissing(c).join(', ') || 'nothing'}` });
  },
  // auto from the iron kit (the early steps behind it) until Protection IV is on all four: mine, obsidian, books, the room, the Nether
  async road_from_iron() {
    return road({ kit: [...IRON_KIT, 'wooden_sword', 'stone_pickaxe', 'stone_sword'], ms: 8 * 3600000, check: (c) => ARMOUR.every((p) => protOf(c, p) >= 4),
      why: (c) => ` · Protection ${ARMOUR.map((p) => protOf(c, p)).join('/')}, level ${c.lv}, ${['diamond', 'lapis_lazuli', 'obsidian', 'bookshelf', 'enchanting_table', 'blaze_rod'].map((k) => `${k} ${c.m[k] ?? 0}`).join(', ')}`,
      setup: async () => { if (process.env.ROAD_AT) await moveTo(process.env.ROAD_AT); } });
  },
  // from nothing to iron: pickaxe, sword, shield, bucket and the four pieces of armour
  async road_iron() {
    const need = ['iron_pickaxe', 'iron_sword', 'shield', 'bucket', ...ARMOUR.map((p) => `iron_${p}`)];
    return road({ ms: 2 * 3600000, check: (c) => need.every((k) => (c.m[k] ?? 0) > 0), why: (c) => ` · missing ${need.filter((k) => !(c.m[k] ?? 0)).join(' ')}` });
  },
  // the table, measured: a level floor in the sky, the bot builds the room (its table, 15 bookshelves), lots of levels; every piece's
  // offers over ROAD_ROUNDS new sets of offers (a book enchanted for each) - how often Protection IV comes up (ench_stats)
  async road_enchtest() {
    await fresh();
    const p = pos(), X = Math.round(p.x), Z = Math.round(p.z), Y = 200;
    srv(`fill ${X - 5} ${Y - 1} ${Z - 5} ${X + 5} ${Y - 1} ${Z + 6} stone`, `fill ${X - 5} ${Y} ${Z - 5} ${X + 5} ${Y + 3} ${Z + 6} air`, `tp ${NAME} ${X + 0.5} ${Y} ${Z + 4.5}`);
    await sleep(3000);
    srv(...['enchanting_table', 'bookshelf 15', 'lapis_lazuli 64', 'book 64', ...ARMOUR.map((a) => `iron_${a}`)].map((i) => `give ${NAME} ${i}`), `xp 300L ${NAME}`);
    await sleep(3000); mark = logText().length;
    send(`ench_stats ${process.env.ROAD_ROUNDS ?? 25}`);
    const m = await waitLog(/ench_stats(?: over|: (?!\d+ book))[^\n]*/, 1800000);
    console.log(since().split('\n').filter((l) => /road: (ench|enchant|the enchanting|bookshelf|enchanting_table)/.test(l)).slice(-60).join('\n'));
    return m && / over \d+ sets/.test(m[0]) ? true : (m ? m[0] : 'no answer').slice(0, 300);
  },
  // a console for trying things by hand: the server commands of ROAD_SETUP (';' between) run, then nothing but waiting (ROAD_MS,
  // default 40 min) - commands go to the bot through <run>/inbox/, to the server by `LAB_PORT=<port> node lab.mjs do -a lamp ...`
  async road_console() {
    await fresh();
    if (process.env.ROAD_SETUP) console.log(String(srv(...process.env.ROAD_SETUP.split(';').map((c) => c.trim()).filter(Boolean))).split('\n').filter((l) => !/Watchdog|^\s*\(x/.test(l)).slice(-30).join('\n'));
    console.log(`console: inbox ${path.join(RUN, 'inbox')}, port ${JSON.parse(fs.readFileSync(path.join(ROOT, 'bds', '.lab', 'live.json'), 'utf8')).port}`);
    await sleep(Number(process.env.ROAD_MS ?? 2400000));
    return true;
  },
  // one verb of the road tried from the iron kit: ROAD_KIT more to give (',' between), ROAD_CMD the commands (';' between),
  // ROAD_WANT '<item regex>:<n>' carried makes it a pass, ROAD_AT 'x z' a place to start from (spread there: the lab's spawn is mesa,
  // no tree, sheep or cow near) - what each get_ of the road does today
  async road_probe() {
    const [re, n = '1'] = (process.env.ROAD_WANT ?? 'diamond:5').split(':'), R = new RegExp(`^(${re})$`);
    return road({ kit: [...IRON_KIT, ...(process.env.ROAD_KIT ?? '').split(',').filter(Boolean)], cmds: ['armor_up', ...(process.env.ROAD_CMD ?? `get_${re} ${n}`).split(';')], ms: Number(process.env.ROAD_MS ?? 2 * 3600000), check: (c) => nOf(c, R) >= Number(n), why: (c) => ` · ${re} ${nOf(c, R)}`,
      setup: async () => { if (process.env.ROAD_AT) await moveTo(process.env.ROAD_AT); } });
  },
  // the Nether trip of road.cjs: the iron kit and 10 obsidian given; the portal built, a fortress found, blazes by the spawner until
  // ROAD_RODS rods (8) and XP level ROAD_LEVEL (0), and back through the portal - a pass is the overworld again with the rods
  async road_nether() {
    const rods = Number(process.env.ROAD_RODS ?? 8), lv = Number(process.env.ROAD_LEVEL ?? 0);
    return road({ kit: [...IRON_KIT, 'obsidian 10', 'cobblestone 64', 'cooked_beef 16'], cmds: ['armor_up', `road_nether ${rods} ${lv}`], ms: 3 * 3600000,
      check: (c) => c.dim === 'overworld' && nOf(c, /^blaze_rod$/) >= rods && c.lv >= lv, why: (c) => ` · in ${c.dim}, rods ${nOf(c, /^blaze_rod$/)}, level ${c.lv}`,
      setup: async () => { if (process.env.ROAD_AT) await moveTo(process.env.ROAD_AT); } });
  },
  // the iron kit given: twelve eyes of ender (the Nether's blaze rods, ender pearls), however get_ender_eye plans them
  async road_eyes() {
    return road({ kit: IRON_KIT, cmds: ['armor_up', process.env.ROAD_CMD ?? 'get_ender_eye 12'], ms: 4 * 3600000, check: (c) => nOf(c, /^ender_eye$/) >= 12, why: (c) => ` · eyes ${nOf(c, /^ender_eye$/)}, pearls ${nOf(c, /^ender_pearl$/)}, rods ${nOf(c, /^blaze_rod$/)}, powder ${nOf(c, /^blaze_powder$/)}, obsidian ${nOf(c, /^obsidian$/)}` });
  },
  // the iron kit and twelve eyes given: the stronghold found, its portal filled and entered
  async road_stronghold() {
    return road({ kit: [...IRON_KIT, 'ender_eye 12'], cmds: ['armor_up', 'stronghold 3600'], ms: 2 * 3600000, check: (c) => c.dim === 'the_end', why: (c) => ` · in ${c.dim}, eyes ${nOf(c, /^ender_eye$/)}` });
  },
};
// what the bot has once the iron step is behind it (the stages after it start from this)
const IRON_KIT = ['iron_pickaxe', 'iron_sword', 'iron_axe', 'iron_shovel', 'shield', 'bucket', 'flint_and_steel', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'cooked_beef 32', 'cobblestone 64', 'oak_planks 32', 'crafting_table', 'furnace', 'coal 16', 'bow', 'arrow 64', 'stone_axe'];
async function main() {
  const want = process.argv.slice(2).filter((a) => S[a]); const names = want.length ? want : Object.keys(S).filter((n) => n !== 'dragon' && n !== 'mech' && !n.startsWith('road_'));
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
  fs.writeFileSync(CFG, JSON.stringify({ host: '127.0.0.1', port: live.port, name: NAME, version: live.version ?? undefined, transport: 'raknet', offline: true, webhook: '', guardRadius: 48, joinEveryMin: 0.2, reviewDeaths: false, ...(process.env.ROAD_WORK ? { workArea: process.env.ROAD_WORK } : {}) }));   // (ROAD_WORK 'x z': where auto works - the lab's spawn is mesa, the nearest wood ~400 off)
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
