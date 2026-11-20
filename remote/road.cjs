'use strict';
// remote/road.cjs — the road to the End: from nothing carried to the End's portal platform with the kit the lab's dragon wins had
// (Protection IV on all four pieces of iron, golden apples, beds, arrows, cobblestone, a carved pumpkin). The second Claude's part
// (作業指示書_エンドまでの道担当.md). brain.cjs requires it (and drops it from the require cache with itself, so `reload` takes both),
// hands it what it needs, and puts its commands into BUILTIN; its steps stand in brain.cjs's STEPS as those commands.
//   road_enchant   the enchanting room (our own table, fifteen bookshelves round it) and Protection IV on each piece of iron armour
//   ench_peek      what the table offers each piece now (nothing enchanted)        road_status   what road.json holds
module.exports = function road(R) {
const { me, log, sleep } = R;
const fs = require('node:fs'), path = require('node:path');
const STATE = path.join(R.ctx.RUN, 'road.json');
const st = (() => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } })();
const save = () => { try { fs.writeFileSync(STATE, JSON.stringify(st, null, 1)); } catch { /* */ } };
const B = {};
let debug = !!process.env.ROAD_DEBUG;

// ---------- what the player has (realplayer's own inventory, each item with its nbt) ----------
const K = () => me.bot?.K;
const nameOf = (it) => (it?.network_id ? String(K()?.itemNames.get(it.network_id) ?? '').replace(/^minecraft:/, '') : '');
const slots = () => K()?.inv.slots ?? [];
const count = (re) => slots().reduce((s, it) => s + (it?.network_id && re.test(nameOf(it)) ? it.count : 0), 0);
const slotOf = (re, from = 0) => slots().findIndex((it, i) => i >= from && it?.network_id && re.test(nameOf(it)));
const freeSlot = () => { for (let i = 0; i < 36; i++) if (!slots()[i]?.network_id) return i; return -1; };
const level = () => Math.floor(K()?.attrs()['player.level'] ?? 0);
// an act, and what the player said while it ran (the verbs say what went wrong)
async function act(v, args = []) {
  const said = []; const tap = (l) => said.push(l); R.ctx.taps.add(tap);
  try { await me.bot.act(v, args.map(String)); } catch (e) { said.push('error: ' + e.message); } finally { R.ctx.taps.delete(tap); }
  return said.join(' | ');
}
const blk = (x, y, z) => String(me.bot.world.block(x, y, z)?.name ?? '?').replace(/^minecraft:/, '');
const AIRY = /^(air|cave_air|short_grass|tall_grass|fern|large_fern|dandelion|poppy|\w+_tulip|azure_bluet|oxeye_daisy|cornflower|allium|blue_orchid|lily_of_the_valley|deadbush|snow_layer|leaf_litter|wildflowers|bush|firefly_bush|short_dry_grass|tall_dry_grass|pink_petals)$/;
const SOLID = (n) => n !== '?' && !AIRY.test(n) && !/water|lava|leaves|_bed$|torch|sapling|vine|carpet|rail|button|lever|pressure_plate|sign|banner|flower|mushroom|seagrass|kelp|web|fire/.test(n);

// ---------- enchantments (Bedrock ids, as the server writes them in the item and in the table's offers) ----------
const EN = ['protection', 'fire_protection', 'feather_falling', 'blast_protection', 'projectile_protection', 'thorns', 'respiration', 'depth_strider', 'aqua_affinity', 'sharpness', 'smite', 'bane_of_arthropods', 'knockback', 'fire_aspect', 'looting', 'efficiency', 'silk_touch', 'unbreaking', 'fortune', 'power', 'punch', 'flame', 'infinity', 'luck_of_the_sea', 'lure', 'frost_walker', 'mending', 'binding', 'vanishing', 'impaling', 'riptide', 'loyalty', 'channeling', 'multishot', 'piercing', 'quick_charge', 'soul_speed', 'swift_sneak', 'wind_burst', 'density', 'breach'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const enText = (l) => l.map((e) => `${EN[e.id] ?? 'e' + e.id} ${ROMAN[e.lvl] ?? e.lvl}`).join(', ') || 'none';
const plain = (x) => (x && typeof x === 'object' && 'type' in x && 'value' in x ? plain(x.value) : Array.isArray(x) ? x.map(plain) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)])) : x);
function enchOf(it) {
  const seek = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 8) return null; if (Array.isArray(o.ench)) return o.ench; for (const v of Object.values(o)) { const r = seek(v, d + 1); if (r) return r; } return null; };
  return (seek(plain(it?.extra ?? {})) ?? []).map((e) => ({ id: Number(e.id), lvl: Number(e.lvl) }));
}
const lvlOf = (l, name) => l.find((e) => e.id === EN.indexOf(name))?.lvl ?? 0;
const PIECES = ['helmet', 'chestplate', 'leggings', 'boots'], WORN = ['head', 'chest', 'legs', 'feet'];
// each piece of iron armour: where it is (worn: head/chest/legs/feet, else its slot) and what is on it - the best one if there are two
function armour() {
  const k = K(), out = {};
  PIECES.forEach((p, i) => {
    const all = [];
    const w = k.inv.armor[i]; if (w?.network_id && nameOf(w) === `iron_${p}`) all.push({ at: WORN[i], ench: enchOf(w) });
    k.inv.slots.forEach((it, j) => { if (j < 36 && it?.network_id && nameOf(it) === `iron_${p}`) all.push({ at: j, ench: enchOf(it) }); });
    all.sort((a, b) => lvlOf(b.ench, 'protection') - lvlOf(a.ench, 'protection') || (b.at === WORN[i]) - (a.at === WORN[i]));
    out[p] = all[0] ?? null;
  });
  return out;
}
const armourText = () => { const a = armour(); return PIECES.map((p) => `${p}: ${a[p] ? enText(a[p].ench) : 'none'}`).join(' · '); };

// ---------- the enchanting room ----------
// our own table with bookshelves on the 5x5 ring round it, the cell between each and the table empty; the gap in the ring (south
// middle) is the way in. Fifteen shelves give the table's top offer level 30, the only one that can bring Protection IV.
const RING = []; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2) RING.push([dx, dz]);
const DOOR = [0, 2];
function shelvesAt([x, y, z]) {
  let n = 0;
  for (const [dx, dz] of RING) for (const dy of [0, 1]) {
    if (blk(x + dx, y + dy, z + dz) !== 'bookshelf') continue;
    const mx = x + Math.sign(dx), mz = z + Math.sign(dz);   // the cell between it and the table must be empty
    if (Math.abs(dx) === 2 && Math.abs(dz) === 2 ? AIRY.test(blk(mx, y + dy, mz)) : AIRY.test(blk(x + (Math.abs(dx) === 2 ? Math.sign(dx) : dx), y + dy, z + (Math.abs(dz) === 2 ? Math.sign(dz) : dz)))) n++;
  }
  return n;
}
function ownTable(r = 10) {
  const b = me.bot, f = b.state().pos, X = Math.floor(f.x), Y = Math.floor(f.y + 0.01), Z = Math.floor(f.z);
  let best = null;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -3; dy <= 3; dy++) {
    const x = X + dx, y = Y + dy, z = Z + dz;
    if (blk(x, y, z) !== 'enchanting_table' || !b.placedByMe?.has?.(`${x},${y},${z}`)) continue;
    const d = Math.hypot(dx, dy, dz); if (!best || d < best.d) best = { at: [x, y, z], d };
  }
  return best?.at ?? null;
}
// a level place for the room near here: 5x5 cells empty two high over solid ground, no water - the nearest of those looked at
function roomSite() {
  const b = me.bot, f = b.state().pos, X = Math.floor(f.x), Y = Math.floor(f.y + 0.01), Z = Math.floor(f.z);
  for (let r = 0; r <= 10; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    for (const dy of [0, -1, 1, -2, 2]) {
      const cx = X + dx, cy = Y + dy, cz = Z + dz; let ok = true;
      for (let ax = -2; ax <= 2 && ok; ax++) for (let az = -2; az <= 3 && ok; az++) {   // (az 3: the cell outside the door, to walk in from)
        if (!AIRY.test(blk(cx + ax, cy, cz + az)) || !AIRY.test(blk(cx + ax, cy + 1, cz + az)) || !SOLID(blk(cx + ax, cy - 1, cz + az))) ok = false;
      }
      if (ok) return [cx, cy, cz];
    }
  }
  return null;
}
// to the middle of a cell (goto's x z is a point: 'goto 78 61' stopped on the corner, the body over the cell the table was to go in)
async function standAt(x, z) {
  for (let k = 0; k < 3; k++) { const f = me.bot.state().pos; if (Math.hypot(f.x - (x + 0.5), f.z - (z + 0.5)) < 0.35) return true; await R.gotoFor([String(x + 0.5), String(z + 0.5)], 15000); }
  const f = me.bot.state().pos; return Math.hypot(f.x - (x + 0.5), f.z - (z + 0.5)) < 0.6;
}
async function placeOn(item, x, y, z) {   // the item set on top of the block under (x y z)
  if (!AIRY.test(blk(x, y, z))) return blk(x, y, z) === item;
  const h = await act(`hold_${item}`); if (/not|no /.test(h) && !count(new RegExp(`^${item}$`))) return false;
  const said = await act('useon', [x, y - 1, z, 'up']);
  for (let t = 0; t < 20 && blk(x, y, z) !== item; t++) await sleep(100);   // (the server's word on the new block comes a moment later)
  if (blk(x, y, z) === item) { me.bot.placedByMe?.add?.(`${x},${y},${z}`); return true; }
  if (said) log(`road: ${item} at ${x} ${y} ${z} did not go down: ${said.slice(0, 160)}`);
  return false;
}
async function buildRoom() {
  const b = me.bot;
  { const g = R.guardReason(b); if (g) return `no room here: ${g}`; }
  const C = roomSite(); if (!C) return 'no level place for the room near here';
  const [x, y, z] = C;
  log(`road: the enchanting room at ${x} ${y} ${z} (table), the way in from the south`);
  await standAt(x, z + 1);
  if (!(await placeOn('enchanting_table', x, y, z))) return `the table did not go down at ${x} ${y} ${z}`;
  // the shelves side by side, each side from the cell inside it, its corners first (11/20: the south-east corner, clicked from the
  // south over the shelf just set beside it, was 'not under the crosshair' - behind it)
  let n = 0;
  const SIDES = [[[0, -1], [[-2, -2], [2, -2], [-1, -2], [1, -2], [0, -2]]], [[1, 0], [[2, 2], [2, -1], [2, 1], [2, 0]]], [[-1, 0], [[-2, 2], [-2, -1], [-2, 1], [-2, 0]]], [[0, 1], [[-1, 2], [1, 2]]]];
  for (const [[sx, sz], cells] of SIDES) {
    if (!count(/^bookshelf$/)) break;
    await standAt(x + sx, z + sz);
    for (const [dx, dz] of cells) { if (!count(/^bookshelf$/)) break; if (await placeOn('bookshelf', x + dx, y, z + dz)) n++; }
  }
  await standAt(x, z + 1);
  st.room = { x, y, z }; save();
  return true;
}

// ---------- the table: what it offers, and taking an offer ----------
let optsSeen = 0, optsLast = [];
const onOpts = (p) => { optsSeen++; optsLast = p.options ?? []; };
let hooked = null;
function hook() { const c = me.bot?.client; if (!c || hooked === c) return; try { hooked?.removeListener?.('player_enchant_options', onOpts); } catch { /* */ } c.on('player_enchant_options', onOpts); hooked = c; }
const FLAGS = { helmet: 1, chestplate: 2, boots: 4, leggings: 8 };
const offerOf = (o) => ({ cost: o.cost, list: [...(o.equip_enchants ?? []), ...(o.held_enchants ?? []), ...(o.self_enchants ?? [])].map((e) => ({ id: Number(e.id), lvl: Number(e.level) })) });
async function offersFor(from) {   // the item in slot `from` put on the open table (lapis beside it): the three offers, or null
  const n0 = optsSeen;
  const r = await act('move', [from, 'box:0', 1]); if (/rejected|empty|error/.test(r)) { log(`road: enchant: the item did not go onto the table: ${r.slice(0, 120)}`); return null; }
  // (the offers come a moment after the move, and the ones for the item before can come late, after it: 11/20 in the lab each
  //  piece was read with the last one's offers. The last word once none has come for 400 ms)
  // (each offer carries the kind of slot it is for: armour head 1, chest 2, feet 4, legs 8 - an offer for another kind is not this one's)
  const want = FLAGS[nameOf(K().inv.ui?.[14]).replace(/^iron_/, '')], fits = () => !want || !optsLast.length || optsLast.every((o) => Number(o.slot_flags) === want);
  let last = n0, at = 0; const t0 = Date.now(), times = [];
  while (Date.now() - t0 < 5000) { if (optsSeen !== last) { last = optsSeen; at = Date.now(); times.push(at - t0); } if (last !== n0 && fits() && Date.now() - at > 300) break; await sleep(50); }
  if (last !== n0 && !fits()) { log(`road: enchant: the offers that came are for another kind of item (flags ${optsLast.map((o) => o.slot_flags).join(',')}, want ${want})`); return []; }
  if (debug) log(`road: enchant: offers for ${nameOf(K().inv.ui?.[14])} after ${times.join(',')} ms: ${optsLast.map((o) => `L${o.cost} flags ${o.slot_flags} ${JSON.stringify([...(o.equip_enchants ?? []), ...(o.held_enchants ?? []), ...(o.self_enchants ?? [])])}`).join(' | ')}`);
  return last === n0 ? [] : optsLast.map(offerOf);
}
async function openTable(T) {
  if (/enchant/.test(K().screen())) return true;
  if (K().screen()) await act('close');
  const said = await act('open', T);
  if (!/enchant/.test(K().screen())) { log(`road: enchant: the table at ${T.join(' ')} did not open (${said.slice(0, 120)})`); return false; }
  hook();
  return true;
}
async function lapisOn() {   // lapis into the table's second slot, as much as it takes (up to a stack)
  const box1 = K().inv.ui?.[15]; if (box1?.network_id && box1.count >= 3) return true;
  const i = slotOf(/^lapis_lazuli$/); if (i < 0) return !!box1?.network_id;
  await act('move', [i, 'box:1']);
  return true;
}
async function backOut() { const it = K().inv.ui?.[14]; if (!it?.network_id) return; const j = freeSlot(); if (j >= 0) await act('move', ['box:0', j]); }
// a cheap thing to enchant for nothing but a new set of offers (Bedrock deals new offers only after something was enchanted)
const REROLL = [/^wooden_shovel$/, /^(wooden_hoe|stone_shovel|stone_hoe|wooden_sword|wooden_pickaxe|wooden_axe|fishing_rod)$/, /^book$/];
const rerollSlot = () => { for (const re of REROLL) { const i = slots().findIndex((it, j) => j < 36 && it?.network_id && re.test(nameOf(it)) && !enchOf(it).length); if (i >= 0) return i; } return -1; };   // (one enchanted already gets no offers)
async function enchantArmour({ peekOnly = false, maxRerolls = 60 } = {}) {
  const b = me.bot; hook();
  let T = ownTable(); if (!T && st.room) { const r = st.room; if (blk(r.x, r.y, r.z) === 'enchanting_table') T = [r.x, r.y, r.z]; }
  if (!T) {
    if (!count(/^enchanting_table$/)) return 'no enchanting table (ours) and none carried';
    const r = await buildRoom(); if (r !== true) return r;
    T = ownTable(); if (!T) return 'the table is not there after building the room';
  }
  const shelves = shelvesAt(T);
  if (shelves < 15) log(`road: enchant: only ${shelves} bookshelves count round the table at ${T.join(' ')}: its top offer is under level 30`);
  // to the cell south of the table, inside the ring
  await standAt(T[0], T[2] + 1);
  const lack = () => { const a = armour(); return PIECES.filter((p) => a[p] && lvlOf(a[p].ench, 'protection') < 4); };
  if (!lack().length && !peekOnly) return true;
  // the pieces worn come off to go on the table (back on at the end)
  for (const [i, p] of PIECES.entries()) { const a = armour()[p]; if (a && a.at === WORN[i] && lvlOf(a.ench, 'protection') < 4) { const j = freeSlot(); if (j < 0) return 'no free slot to take the armour off into'; await act('move', [WORN[i], j]); } }
  let rerolls = 0, done = 0, why = null;
  try {
    for (let round = 0; round < 200; round++) {
      const want = lack(); if (!want.length) break;
      await K().sync();   // (the server's inventory, not this client's guess: 11/20 a slot it took for a shovel held lapis, and the move was refused)
      if (!(await openTable(T))) { why = 'the table did not open'; break; }
      if (!(await lapisOn())) { why = 'no lapis lazuli'; break; }
      const lv = level(), seen = [];
      let pick = null;
      for (const p of want) {
        const a = armour()[p]; if (typeof a?.at !== 'number') continue;
        await backOut();
        const o = await offersFor(a.at); if (!o) continue;
        seen.push(`${p}: ${o.map((x, k) => `${k}:L${x.cost} ${enText(x.list)}`).join(' / ') || 'no offers'}`);
        o.forEach((x, k) => { if (lvlOf(x.list, 'protection') >= 4 && x.cost <= lv) { const ff = p === 'boots' ? lvlOf(x.list, 'feather_falling') : 0; const score = ff * 10 - x.cost; if (!pick || score > pick.score) pick = { p, k, score, x }; } });
        if (peekOnly) continue;
        if (pick && pick.p === p) break;   // (this one now: it is on the table)
      }
      log(`road: enchant: level ${lv}, lapis ${count(/^lapis_lazuli$/) + (K().inv.ui?.[15]?.count ?? 0)} · ${seen.join(' · ')}`);
      if (peekOnly) { await backOut(); return true; }
      if (pick) {
        const cur = nameOf(K().inv.ui?.[14]);
        if (cur !== `iron_${pick.p}`) { await backOut(); const a = armour()[pick.p]; await offersFor(a.at); }
        const r = await act('enchant', [pick.k]);
        log(`road: enchant: ${pick.p} ← offer ${pick.k} (level ${pick.x.cost}): ${enText(pick.x.list)} · ${r.slice(0, 100)}`);
        await sleep(300); await backOut(); done++;
        continue;
      }
      // nothing offers it now: a new set of offers, bought with the cheapest offer on something cheap
      if (rerolls >= maxRerolls) { why = `no Protection IV offered after ${rerolls} new sets of offers`; break; }
      if (lv < 30) { why = `level ${lv}: the top offer (Protection IV) needs level 30`; break; }
      await backOut();
      await K().sync();
      if (count(/^lapis_lazuli$/) + (K().inv.ui?.[15]?.count ?? 0) < 1) { why = 'no lapis lazuli left'; break; }
      await lapisOn();
      const ri = rerollSlot(); if (ri < 0) { why = 'nothing cheap left to enchant for new offers (wooden shovels)'; break; }
      const o = await offersFor(ri); if (!o?.length) { why = `no offers for the ${nameOf(K().inv.ui?.[14]) || 'cheap item'} (the table: ${shelvesAt(T)} shelves, lapis ${K().inv.ui?.[15]?.count ?? 0})`; break; }
      const r = await act('enchant', [0]); rerolls++;
      if (!/enchanted/.test(r)) { why = `the new offers were not bought: ${r.slice(0, 100)}`; break; }
      await sleep(250); await backOut();
    }
  } finally {
    if (K().screen()) await act('close');
    await act('armor_up');
  }
  st.enchant = { at: new Date().toISOString(), rerolls: (st.enchant?.rerolls ?? 0) + rerolls, done: (st.enchant?.done ?? 0) + done, armour: armourText() }; save();
  log(`road: enchant: ${armourText()} · ${done} enchanted, ${rerolls} new sets of offers, level ${level()} left`, { dc: true });
  return lack().length ? why ?? 'not all four have Protection IV' : true;
}

// (the lab: how often the table offers Protection IV - every piece's offers looked at, then new offers bought, n times)
async function enchStats(n) {
  let T = ownTable(); if (!T) { const r = await buildRoom(); if (r !== true) return r; T = ownTable(); if (!T) return 'no table'; }
  log(`road: ench_stats: ${shelvesAt(T)} bookshelves count round the table at ${T.join(' ')}`);
  await standAt(T[0], T[2] + 1);
  for (const [i] of PIECES.entries()) { const it = K().inv.armor[i]; if (it?.network_id) { const j = freeSlot(); if (j >= 0) await act('move', [WORN[i], j]); } }
  const hits = Object.fromEntries(PIECES.map((p) => [p, 0])), tops = {}; let rounds = 0;
  for (let k = 0; k < n; k++) {
    if (!(await openTable(T)) || !(await lapisOn())) break;
    const line = [];
    for (const p of PIECES) {
      const a = armour()[p]; if (typeof a?.at !== 'number') continue;
      await backOut(); const o = await offersFor(a.at); if (!o?.length) continue;
      if (o.some((x) => lvlOf(x.list, 'protection') >= 4)) hits[p]++;
      const top = o.at(-1); const key = `${p} L${top.cost}: ${enText(top.list)}`; tops[key] = (tops[key] ?? 0) + 1;
      line.push(`${p}: ${o.map((x, j) => `${j}:L${x.cost} ${enText(x.list)}`).join(' / ')}`);
    }
    rounds++;
    log(`road: ench_stats ${k + 1}/${n} (level ${level()}): ${line.join(' · ')}`);
    await backOut();
    await K().sync(); const ri = rerollSlot(); if (ri < 0) { log('road: ench_stats: nothing left to enchant for new offers'); break; }
    await offersFor(ri); const r = await act('enchant', [0]); if (!/enchanted/.test(r)) { log(`road: ench_stats: new offers not bought: ${r.slice(0, 120)}`); break; }
    await sleep(250); await backOut();
  }
  if (K().screen()) await act('close');
  log(`road: ench_stats over ${rounds} sets of offers: Protection IV offered to ${PIECES.map((p) => `${p} ${hits[p]}`).join(', ')} · top offers: ${Object.entries(tops).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v}x ${k}`).join(' | ')}`, { dc: true });
  return true;
}
B.ench_stats = async (a) => { const r = await enchStats(Number(a[0]) || 20); if (r !== true) log(`ench_stats: ${r}`); };
B.road_enchant = async () => { const r = await enchantArmour(); log(`road_enchant: ${r === true ? 'Protection IV on all four' : 'could not finish: ' + r}`); };
B.ench_peek = async () => { const r = await enchantArmour({ peekOnly: true }); if (r !== true) log(`ench_peek: ${r}`); };
// ---------- the steps of the road (each a command in brain.cjs's STEPS: it ends with '<name>: done' or '<name>: could not finish: ...'
// - auto takes the second as a step to try again - and each picks up where an earlier try left off, from what is carried and road.json)
const n = (re) => count(re);
const allProt4 = () => { const a = armour(); return PIECES.every((p) => a[p] && lvlOf(a[p].ench, 'protection') >= 4); };
const roomKnown = () => !!st.room && (blk(st.room.x, st.room.y, st.room.z) === 'enchanting_table' || blk(st.room.x, st.room.y, st.room.z) === '?');
async function stepRun(name, fn) {
  return R.piece(async () => { let r; try { r = await fn(); } catch (e) { r = 'error ' + e.message; } log(`${name}: ${r === true ? 'done' : 'could not finish: ' + r}`, { dc: true }); return r; });
}
// far, the path finder's legs of 32 (the Nether: lava kept away from, dug through and climbed where the way needs it)
async function walkFar(x, z, tol = 3) {
  for (let k = 0, stuck = 0; k < 80 && R.live(); k++) {
    const f = me.bot.state().pos, d = Math.hypot(x - f.x, z - f.z);
    if (d <= tol) return true;
    const s = Math.min(32, d), ang = Math.atan2(z - f.z, x - f.x) + (stuck ? (stuck % 2 ? 1 : -1) * Math.min(2.4, 0.8 * Math.ceil(stuck / 2)) : 0);
    await R.gotoFor([String(Math.round(f.x + Math.cos(ang) * s)), String(Math.round(f.z + Math.sin(ang) * s)), String(s < 32 ? tol : 3)], 90000, 'walk_xz');
    const g = me.bot.state().pos; stuck = Math.hypot(g.x - f.x, g.z - f.z) < 2 ? stuck + 1 : 0;
    if (stuck >= 8) { log(`road: walk to ${x} ${z}: stuck at ${Math.round(g.x)} ${Math.round(g.y)} ${Math.round(g.z)}`); return false; }
  }
  const f = me.bot.state().pos; return Math.hypot(x - f.x, z - f.z) <= tol + 2;
}
// diamonds (two for the table, three for the pickaxe that mines obsidian) and lapis (the table: 3 an offer taken, 1 a new set)
B.road_mine = () => stepRun('road_mine', async () => {
  const dWant = () => (roomKnown() || n(/^enchanting_table$/) ? 0 : 2) + (n(/^(diamond|netherite)_pickaxe$/) || st.obsidianDone ? 0 : 3), lWant = () => (allProt4() ? 0 : 32);
  for (let k = 0; k < 3 && R.live(); k++) {
    // (a spare iron pickaxe down there: 11/20 the one carried broke at y -58, and a stone one does not take diamonds)
    if (n(/^diamond$/) < dWant() && n(/^(iron|diamond|netherite)_pickaxe$/) < 2) await R.run('get_iron_pickaxe 2', 'a spare iron pickaxe for the deep mine');
    if (n(/^diamond$/) < dWant()) await R.run(`get_diamond ${dWant()}`, 'diamonds: the enchanting table, a diamond pickaxe');
    if (n(/^lapis_lazuli$/) < lWant()) await R.run(`get_lapis_lazuli ${lWant()}`, 'lapis for the enchanting table');
    if (n(/^diamond$/) >= dWant() && n(/^lapis_lazuli$/) >= lWant()) return true;
  }
  return `diamonds ${n(/^diamond$/)} of ${dWant()}, lapis ${n(/^lapis_lazuli$/)} of ${lWant()}`;
});
// obsidian cast from a lava pool: water poured on the pool's rim flows over it and every still lava it covers turns to obsidian (in the
// lab one pour made a 3x5 pool all obsidian); the water taken up again, then each obsidian with solid ground under it dug with the
// diamond pickaxe (one over more lava is left: dug, the drop falls in and burns, and the lava is open)
const lavaSrc = (x, y, z) => { const b = me.bot.world.block(x, y, z); return /^minecraft:lava$/.test(b?.name ?? '') && !(b.states?.liquid_depth > 0); };
function lavaShore(r = 40) {
  const f = me.bot.state().pos, X = Math.floor(f.x), Y = Math.floor(f.y + 0.01), Z = Math.floor(f.z); let best = null;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -16; dy <= 8; dy++) {
    const x = X + dx, y = Y + dy, z = Z + dz; if (!lavaSrc(x, y, z) || !AIRY.test(blk(x, y + 1, z))) continue;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // a solid rim beside it, air over the rim, and a dry place to stand behind the rim
      const rx = x + sx, rz = z + sz; if (!SOLID(blk(rx, y, rz)) || !AIRY.test(blk(rx, y + 1, rz)) || !AIRY.test(blk(rx, y + 2, rz))) continue;
      const tx = rx + sx, tz = rz + sz; if (!SOLID(blk(tx, y, tz)) || !AIRY.test(blk(tx, y + 1, tz)) || !AIRY.test(blk(tx, y + 2, tz)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => /lava/.test(blk(tx + a, y + 1, tz + c)))) continue;
      const d = Math.hypot(dx, dy, dz); if (!best || d < best.d) best = { lava: [x, y, z], rim: [rx, y, rz], stand: [tx, y + 1, tz], d };
    }
  }
  return best;
}
async function castObsidian(want) {
  if (!n(/^(diamond|netherite)_pickaxe$/)) return 'no diamond pickaxe';
  for (let round = 0; round < 6 && n(/^obsidian$/) < want && R.live(); round++) {
    if (!n(/^water_bucket$/)) await R.run('get_water_bucket', 'water to cast obsidian');
    if (!n(/^water_bucket$/)) return 'no water bucket';
    const s = lavaShore();
    if (!s) return 'no still lava with a rim to pour on found near';
    log(`road: obsidian: the lava at ${s.lava.join(' ')}, the rim ${s.rim.join(' ')}`);
    await R.gotoFor([String(s.stand[0]), String(s.stand[2]), '0.4'], 60000, 'walk_xz');
    const f = me.bot.state().pos; if (Math.hypot(f.x - (s.stand[0] + 0.5), f.z - (s.stand[2] + 0.5)) > 1.2) { log('road: obsidian: could not get to the rim'); continue; }
    await act('hold_water_bucket'); await act('useon', [s.rim[0], s.rim[1], s.rim[2], 'up']); await sleep(3500);
    await act('hold_bucket'); await act('useon', [s.rim[0], s.rim[1] + 1, s.rim[2], 'up']); await sleep(800); await K().sync();
    // the obsidian made, dug where it lies on solid ground, the nearest first, from where it can be reached
    for (let k = 0; k < 40 && n(/^obsidian$/) < want && R.live(); k++) {
      const g = me.bot.state().pos; let t = null;
      for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = -3; dy <= 1; dy++) {
        const x = Math.floor(g.x) + dx, y = Math.floor(g.y) + dy, z = Math.floor(g.z) + dz;
        if (blk(x, y, z) !== 'obsidian' || !SOLID(blk(x, y - 1, z)) || /lava/.test(blk(x, y - 1, z)) || me.bot.placedByMe?.has?.(`${x},${y},${z}`)) continue;
        const d = Math.hypot(x + 0.5 - g.x, y - g.y, z + 0.5 - g.z); if (d < 4.4 && (!t || d < t.d)) t = { x, y, z, d };
      }
      if (!t) {   // none in reach: into the cells already dug (dry, solid under), nearer the rest
        const more = []; for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let dy = -3; dy <= 1; dy++) { const x = Math.floor(g.x) + dx, y = Math.floor(g.y) + dy, z = Math.floor(g.z) + dz; if (blk(x, y, z) === 'obsidian' && SOLID(blk(x, y - 1, z)) && !me.bot.placedByMe?.has?.(`${x},${y},${z}`)) more.push([x, y, z]); }
        const w = more.length ? (() => { const [x, y, z] = more[0]; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (AIRY.test(blk(x + a, y + 1, z + c)) && AIRY.test(blk(x + a, y + 2, z + c)) && SOLID(blk(x + a, y, z + c)) && ![[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]].some(([p, q]) => /lava/.test(blk(x + a + p, y + 1, z + c + q)) || /lava/.test(blk(x + a + p, y, z + c + q)))) return [x + a, z + c]; return null; })() : null;
        if (!w || k > 30) break;
        await R.gotoFor([String(w[0]), String(w[1]), '0.4'], 20000, 'walk_xz'); continue;
      }
      await act('hold_diamond_pickaxe'); const said = await act('dig', [t.x, t.y, t.z]);
      if (blk(t.x, t.y, t.z) === 'obsidian') { log(`road: obsidian at ${t.x} ${t.y} ${t.z} not dug: ${said.slice(0, 120)}`); me.bot.placedByMe?.add?.(`${t.x},${t.y},${t.z}`); continue; }   // (not tried again)
      await sleep(400);
    }
    await act('collect', ['8']); await sleep(800); await act('collect', ['8']); await sleep(1000); await K().sync(); await sleep(500);   // (the count read at once said 0 with 9 picked up)
    log(`road: obsidian ${n(/^obsidian$/)} of ${want}`);
  }
  return n(/^obsidian$/) >= want ? true : `obsidian ${n(/^obsidian$/)} of ${want}`;
}
B.cast_obsidian = (a) => stepRun('cast_obsidian', () => castObsidian(Number(a?.[0]) || 14));
// obsidian: ten for the portal, four for the table (a diamond pickaxe first)
B.road_obsidian = () => stepRun('road_obsidian', async () => {
  const want = () => (st.portalO ? 0 : 10) + (roomKnown() || n(/^enchanting_table$/) ? 0 : 4);
  for (let k = 0; k < 3 && R.live() && n(/^obsidian$/) < want(); k++) {
    if (!n(/^(diamond|netherite)_pickaxe$/)) await R.run('get_diamond_pickaxe', 'a diamond pickaxe: obsidian');
    if (!n(/^bucket$|^water_bucket$/)) await R.run('get_bucket', 'a bucket: water for casting');
    let r = await castObsidian(want());   // (cast from lava: obsidian in the open is rare - 11/20 get_obsidian walked about looking for it)
    // no lava near: to a lava lake (a bucket of it fetched is the way there: down to the bottom of the world, along a tunnel), cast there
    if (r !== true && /no still lava/.test(String(r))) { if (!n(/^bucket$/)) await R.run('get_bucket', 'a second bucket: lava'); await R.run('get_lava_bucket', 'the way to a lava lake'); if (n(/^lava_bucket$/)) r = await castObsidian(want()); }
    if (r !== true) { log(`road: casting: ${r}`); await R.run(`get_obsidian ${want()}`, 'obsidian: the portal, the enchanting table'); }
  }
  if (n(/^obsidian$/) >= want()) { st.obsidianDone = true; save(); return true; }
  return `obsidian ${n(/^obsidian$/)} of ${want()}`;
});
// the enchanting room's makings: the table, fifteen bookshelves (45 books), wooden shovels to buy new offers with
B.road_books = () => stepRun('road_books', async () => {
  const need = () => roomKnown() && (st.room.shelves ?? 15) >= 15 ? [['wooden_shovel', 4]] : [['enchanting_table', 1], ['bookshelf', 15], ['wooden_shovel', 6]];
  const short = () => need().filter(([it, m]) => n(new RegExp(`^${it}$`)) < m);
  for (let k = 0; k < 3 && R.live() && short().length; k++) for (const [it, m] of short()) await R.run(`get_${it} ${m}`, `the enchanting room: ${it}`);
  return short().length ? short().map(([it, m]) => `${it} ${n(new RegExp(`^${it}$`))} of ${m}`).join(', ') : true;
});
// the room set up at the base (by the bed), before the Nether: the portal is built beside it, and the levels go straight to the table
B.road_room = () => stepRun('road_room', async () => {
  if (roomKnown()) return true;
  if (!n(/^enchanting_table$/)) return 'no enchanting table carried';
  let pb = null; try { pb = JSON.parse(fs.readFileSync(path.join(R.ctx.RUN, 'bed.json'), 'utf8')); } catch { /* */ }
  if (pb && me.dim === 'overworld') { const f = me.bot.state().pos; if (Math.hypot(f.x - pb.x, f.z - pb.z) > 12) await R.travel(pb.x + 6, pb.z + 6); }
  const r = await buildRoom(); if (r !== true) return r;
  st.room.shelves = shelvesAt([st.room.x, st.room.y, st.room.z]); save();
  return st.room.shelves >= 15 ? true : `the room has ${st.room.shelves} bookshelves that count`;
});
// a trip into the Nether: in by the portal beside the room (built the first time), to a fortress, blazes by its spawner until there are
// `rods` blaze rods and the XP level is `level`, back the way it came
async function netherTrip({ rods = 8, lv = 0, minutes = 40 } = {}) {
  if (me.dim === 'overworld') {
    const at = st.portalO ?? (st.room ? { x: st.room.x + 5, z: st.room.z } : null);
    if (at) { const f = me.bot.state().pos; if (Math.hypot(f.x - at.x, f.z - at.z) > 10) await R.travel(at.x, at.z); }
    const before = me.bot.state().pos;
    await R.run('nether_in', 'into the Nether (a portal by the room)');
    for (let t = 0; t < 20 && me.dim !== 'nether'; t++) await sleep(500);
    if (me.dim !== 'nether') return 'not into the Nether';
    if (!st.portalO) st.portalO = { x: Math.floor(before.x), y: Math.floor(before.y), z: Math.floor(before.z) };
    const f = me.bot.state().pos; st.portalN = { x: Math.floor(f.x), y: Math.floor(f.y), z: Math.floor(f.z) }; save();
    log(`road: in the Nether at ${st.portalN.x} ${st.portalN.y} ${st.portalN.z} (the overworld's portal by ${st.portalO.x} ${st.portalO.z})`, { dc: true });
  }
  if (me.dim !== 'nether') return `in the ${me.dim}, not the Nether`;
  const t0 = Date.now(), d0 = me.deaths;
  await R.run('nether_seek 1200', 'a nether fortress');
  // the rods at the spawner (and its XP); the levels after that from nether quartz along tunnels - faster than waiting for blazes at a
  // slit (the lab: about one blaze a minute)
  if (me.dim === 'nether' && me.deaths === d0 && n(/^blaze_rod$/) < rods) await R.run(`blaze_rods ${rods} ${Math.max(300, Math.min(1200, minutes * 60 - Math.round((Date.now() - t0) / 1000)))} 0`, 'blaze rods');
  // (away from the spawner first - back toward the portal by the tunnel: 11/20 the quartz tunnel went past the spawner, nine blazes, burned)
  if (me.dim === 'nether' && me.deaths === d0 && level() < lv && st.portalN) await R.run(`tunnel_to ${st.portalN.x} ${st.portalN.z} 600 6`, 'away from the spawner, toward the portal');
  if (me.dim === 'nether' && me.deaths === d0 && level() < lv) await R.run(`quartz_mine ${lv} ${Math.max(300, minutes * 60 - Math.round((Date.now() - t0) / 1000))}`, 'levels from nether quartz');
  if (me.dim !== 'nether' || me.deaths !== d0) return `the trip ended in the Nether: ${me.deaths !== d0 ? 'died' : 'out of it'} (rods ${n(/^blaze_rod$/)}, level ${level()})`;   // (11/20: killed by magma cubes, it went on to 'the way back' from the overworld)
  log(`road: the Nether: ${n(/^blaze_rod$/)} rods, level ${level()} - back to the portal at ${st.portalN.x} ${st.portalN.z}`, { dc: true });
  if (st.portalN) await R.run(`tunnel_to ${st.portalN.x} ${st.portalN.z} 600 3`, 'back toward the portal by a tunnel');   // (the Nether's ledges: no walking in the open)
  await R.run('portal_go 160', 'back through the portal');
  for (let t = 0; t < 20 && me.dim === 'nether'; t++) await sleep(500);
  return me.dim === 'overworld' ? true : 'still in the Nether (the way back to the portal?)';
}
B.road_nether = (a) => stepRun('road_nether', async () => {
  const rods = Number(a?.[0]) || 8, lv = Number(a?.[1]) || 0;
  if (n(/^blaze_rod$/) + Math.ceil(n(/^blaze_powder$/) / 2) + Math.ceil(n(/^ender_eye$/) / 2) >= rods && level() >= lv) return true;
  return netherTrip({ rods, lv });
});
// Protection IV on all four: to the room with level 30 and enchant; short of levels, to the Nether's blazes for them (and back)
B.road_prot = () => stepRun('road_prot', async () => {
  for (let k = 0; k < 6 && R.live(); k++) {
    if (allProt4()) return true;
    if (level() >= 30) {
      if (st.room && me.dim === 'overworld') { const f = me.bot.state().pos; if (Math.hypot(f.x - st.room.x, f.z - st.room.z) > 6) await R.travel(st.room.x, st.room.z + 3); }
      const r = await enchantArmour(); if (r === true) return true;
      if (!/^level \d+/.test(String(r))) return r;
    }
    const lacking = PIECES.filter((p) => { const a = armour()[p]; return a && lvlOf(a.ench, 'protection') < 4; }).length;
    const r = await netherTrip({ rods: 8, lv: Math.min(45, 30 + 4 * lacking), minutes: 45 });
    if (r !== true) log(`road: the trip for levels: ${r}`);
  }
  return allProt4() ? true : `Protection IV on ${PIECES.filter((p) => { const a = armour()[p]; return a && lvlOf(a.ench, 'protection') >= 4; }).length} of 4, level ${level()}`;
});
// ---------- the rest of the kit ----------
// a cell beside the feet to set a block in: empty (or a plant) over solid ground
function cellBeside() {
  const f = me.bot.state().pos, X = Math.floor(f.x), Y = Math.floor(f.y + 0.01), Z = Math.floor(f.z);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
    const x = X + dx, z = Z + dz; if (AIRY.test(blk(x, Y, z)) && AIRY.test(blk(x, Y + 1, z)) && SOLID(blk(x, Y - 1, z))) return [x, Y, z, dx, dz];
  }
  return null;
}
// a carved pumpkin (the endermen in the End: looked at, they stay calm): a pumpkin set down, carved with shears, broken and taken up
B.road_pumpkin = () => stepRun('road_pumpkin', async () => {
  if (n(/^carved_pumpkin$/)) return true;
  if (!n(/^shears$/)) await R.run('get_shears', 'shears: a pumpkin to carve');
  if (!n(/^pumpkin$/)) await R.run('get_pumpkin 1', 'a pumpkin');
  if (!n(/^pumpkin$/) || !n(/^shears$/)) return `pumpkin ${n(/^pumpkin$/)}, shears ${n(/^shears$/)}`;
  for (let k = 0; k < 3 && R.live() && !n(/^carved_pumpkin$/); k++) {
    const c = cellBeside(); if (!c) { await R.gotoFor([String(Math.floor(me.bot.state().pos.x) + 4), String(Math.floor(me.bot.state().pos.z) + 3)], 10000); continue; }
    const [x, y, z, dx, dz] = c;
    if (!(await placeOn('pumpkin', x, y, z))) continue;
    await act('hold_shears');
    const said = await act('useon', [x, y, z, dx > 0 ? 'west' : dx < 0 ? 'east' : dz > 0 ? 'north' : 'south']);   // (the face toward us)
    for (let t = 0; t < 10 && blk(x, y, z) !== 'carved_pumpkin'; t++) await sleep(150);
    if (blk(x, y, z) !== 'carved_pumpkin') log(`road: the pumpkin at ${x} ${y} ${z} was not carved (${blk(x, y, z)}): ${said.slice(0, 120)}`);
    await act('dig', [x, y, z]); await sleep(700); await act('collect', ['4']); await K().sync();
  }
  return n(/^carved_pumpkin$/) ? true : 'the pumpkin was not carved';
});
// flint: gravel set down and dug again with a shovel, one in ten gives flint (what a person does with a stack of gravel)
async function flintFarm(want) {
  if (n(/^flint$/) >= want) return true;
  if (n(/^gravel$/) < 4) await R.run('get_gravel 16', 'gravel to sift for flint');
  if (!n(/^gravel$/)) return false;
  if (!n(/_shovel$/)) await R.run('get_stone_shovel', 'a shovel for the gravel');
  const shovel = ['netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel'].find((s) => n(new RegExp(`^${s}$`))) ?? null;
  const c = cellBeside(); if (!c) return false;
  const [x, y, z] = c, f0 = n(/^flint$/);
  for (let k = 0; k < want * 30 && n(/^flint$/) < want && n(/^gravel$/) && R.live(); k++) {
    if (!(await placeOn('gravel', x, y, z))) { if (k > 3) break; continue; }
    if (shovel) await act(`hold_${shovel}`);
    await act('dig', [x, y, z]); await sleep(350);
    if (k % 10 === 9) { await act('collect', ['3']); await K().sync(); }
  }
  await act('collect', ['3']); await K().sync();
  log(`road: flint ${n(/^flint$/)} (${n(/^flint$/) - f0} sifted from gravel)`);
  return n(/^flint$/) >= want;
}
// a bow and arrows (the crystals, the cages, its last points: 105-158 used in the lab's wins): crafted from flint, feathers, sticks
B.road_arrows = (a) => stepRun('road_arrows', async () => {
  const want = Number(a?.[0]) || 192;
  if (!n(/^bow$/)) await R.run('get_bow', 'a bow');
  for (let k = 0; k < 4 && R.live() && n(/^arrow$/) < want; k++) {
    const crafts = Math.ceil((want - n(/^arrow$/)) / 4);
    if (n(/^feather$/) < crafts) await R.run(`get_feather ${crafts}`, 'feathers for arrows');
    if (n(/^flint$/) < crafts) await flintFarm(crafts);
    if (n(/^feather$/) >= Math.min(crafts, 1) && n(/^flint$/) >= 1) await R.run(`get_arrow ${Math.min(want, n(/^arrow$/) + 4 * Math.min(n(/^feather$/), n(/^flint$/)))}`, 'arrows');
  }
  return n(/^arrow$/) >= want && n(/^bow$/) ? true : `bow ${n(/^bow$/)}, arrows ${n(/^arrow$/)} of ${want} (feathers ${n(/^feather$/)}, flint ${n(/^flint$/)})`;
});
// beds (12: 4-7 blown in the lab's wins): shears first (a sheep shorn gives 1-3 wool, killed 1)
B.road_beds = (a) => stepRun('road_beds', async () => {
  const want = Number(a?.[0]) || 12, beds = () => n(/(^|_)bed$/);
  if (beds() >= want) return true;
  if (!n(/^shears$/)) await R.run('get_shears', 'shears: wool');
  for (let k = 0; k < 3 && R.live() && beds() < want; k++) await R.run(`get_bed ${want}`, 'beds for the dragon');
  return beds() >= want ? true : `beds ${beds()} of ${want}`;
});
// what the End needs, counted (the kit of the lab's wins; golden apples 8 at the least): what is still missing
const KIT = [['Protection IV on all four', () => allProt4()], ['golden apples 8', () => n(/^golden_apple$/) >= 8], ['beds 12', () => n(/(^|_)bed$/) >= 12], ['a bow', () => n(/^bow$/) >= 1],
  ['arrows 192', () => n(/^arrow$/) >= 192], ['cobblestone 256', () => n(/^cobblestone$/) >= 256], ['a carved pumpkin', () => n(/^carved_pumpkin$/) >= 1],
  ['an iron sword', () => n(/^(iron|diamond|netherite)_sword$/) >= 1], ['an iron pickaxe', () => n(/^(iron|diamond|netherite)_pickaxe$/) >= 1], ['a shield', () => n(/^shield$/) + (nameOf(K()?.inv.offhand?.[0]) === 'shield' ? 1 : 0) >= 1],
  ['food 32', () => n(/^(cooked_\w+|bread|baked_potato|golden_carrot)$/) >= 32], ['eyes of ender 12', () => n(/^ender_eye$/) >= 12]];
const kitMissing = () => KIT.filter(([, f]) => !f()).map(([k]) => k);
B.road_kit = () => stepRun('road_kit', async () => { const m = kitMissing(); return m.length ? `still missing: ${m.join(', ')}` : true; });
// ---------- room in the bag: junk dropped when the inventory is nearly full (11/20 a miner with 580 cobbled deepslate could not craft
// a table: 'inventory full', and its golden apple step ended there after 27 minutes) ----------
const KEEP = { cobblestone: 320, cobbled_deepslate: 64, netherrack: 64, blackstone: 32, gravel: 16, dirt: 16, sand: 0, diorite: 0, andesite: 0, granite: 0, tuff: 0, calcite: 0, basalt: 0, smooth_basalt: 0, deepslate: 0, rotten_flesh: 0, spider_eye: 0, poisonous_potato: 0, wheat_seeds: 0, pumpkin_seeds: 0, beetroot_seeds: 0, cobweb: 0, flint_and_steel_broken: 0, bone: 8, arrow_stuck: 0, red_sand: 0, terracotta: 0, magma: 0, soul_sand: 0, soul_soil: 0, moss_block: 0, clay_ball: 0, kelp: 0, ink_sac: 0, gold_nugget: 999, egg: 0, mud: 0, stick: 64 };
async function tidy() {
  const k = K(); if (!k || !me.connected || k.screen()) return;
  const free = () => slots().filter((it, i) => i < 36 && !it?.network_id).length;
  if (free() >= 4) return;
  const byKind = new Map(); slots().forEach((it, i) => { if (i >= 36 || !it?.network_id) return; const nmx = nameOf(it); if (!(nmx in KEEP)) return; (byKind.get(nmx) ?? byKind.set(nmx, []).get(nmx)).push({ i, c: it.count }); });
  for (const [nmx, list] of [...byKind].sort((a, b) => b[1].reduce((s, x) => s + x.c, 0) - a[1].reduce((s, x) => s + x.c, 0))) {
    let total = list.reduce((s, x) => s + x.c, 0); const keep = KEEP[nmx];
    for (const x of list.sort((a, b) => a.c - b.c)) { if (total - x.c < keep || free() >= 6) break; await act('drop_all', [x.i]); total -= x.c; await sleep(150); }
    if (free() >= 6) break;
  }
}
// every night dug in until Protection IV is on (11/20 in the lab, in plain iron: a witch, then zombies and a skeleton in a cave, both
// probes dead at night); ROAD_NIGHT=fight leaves it to the old rule (armed and well: on in the dark)
const nightPolicy = () => { const on = process.env.ROAD_NIGHT !== 'fight' && !(K() && allProt4()); me.nightIn = on; K()?.memo?.set('goal:nightIn', on); };
if (me.roadTidy) clearInterval(me.roadTidy);
me.roadTidy = setInterval(() => { try { nightPolicy(); } catch { /* */ } if (!tidy.busy) { tidy.busy = true; tidy().catch(() => {}).finally(() => { tidy.busy = false; }); } }, 15000);
B.road_debug = async (a) => { debug = a[0] !== 'off'; log(`road_debug ${debug ? 'on' : 'off'}`); };
B.road_status = async () => log(`road_status: ${JSON.stringify(st)} · armour ${armourText()} · level ${level()}`);

return { builtins: B, armour, armourText, level, count };
};
