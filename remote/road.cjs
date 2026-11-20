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
B.road_debug = async (a) => { debug = a[0] !== 'off'; log(`road_debug ${debug ? 'on' : 'off'}`); };
B.road_status = async () => log(`road_status: ${JSON.stringify(st)} · armour ${armourText()} · level ${level()}`);

return { builtins: B, armour, armourText, level, count };
};
