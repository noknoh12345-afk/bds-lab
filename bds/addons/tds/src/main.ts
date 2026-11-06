import { world, system, Player, ItemStack } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { cmd, cmdAny, ask, menu, give, ready, every } from './kit';
import { towers, enemies, modes, maps, stats, maxLevel, levelCost, placeCost, timerFor, MODE_NAMES } from './defs';
import * as G from './game';
import { prof, saveProf, buy, equip, queue, leaveLift, departNow, questAdd, QUESTS, addExp } from './lobby';
import { benchAll, bench, expected } from './bench';

const T = (s: string) => s.replace(/_/g, ' ');
const inMatch = (p: Player) => !!G.M && G.M.players.includes(p.name);
const loadout = (p: Player) => ((G.M as any)?.loadouts?.[p.name] as string[] | undefined) ?? prof(p).loadout;

// ---------- match commands ----------
cmd('tds:play', 'Start a match now (solo or everyone online)', { mode: MODE_NAMES as unknown as string[], 'all?': 'bool' }, (p, a) => {
  const md = modes[a.mode]; if (!md) return `Modes: ${MODE_NAMES.join(' ')}`;
  if (prof(p).level < md.level && !p.hasTag('tds_dev')) return `${a.mode} needs level ${md.level}`;
  const ps = a.all ? world.getAllPlayers() : [p];
  G.start(a.mode, ps); if (G.M) (G.M as any).loadouts = Object.fromEntries(ps.map((x) => [x.name, prof(x).loadout]));
  for (const x of ps) give(x, 'tds:wand', 1);
  return `${a.mode}: ${md.waves} waves, $${G.M!.cash[p.name]}`;
});
cmd('tds:queue', 'Enter an elevator', { lift: MODE_NAMES as unknown as string[] }, (p, a) => queue(p, a.lift));
cmd('tds:leave', 'Leave the elevator', {}, (p) => { leaveLift(p.name); return 'Left'; });
cmdAny('tds:depart', 'Elevator leaves now (test)', { liftmode: MODE_NAMES as unknown as string[] }, (_, a) => { departNow(a.liftmode); return 'ok'; }, true);
cmdAny('tds:stop', 'End the match', {}, () => { G.stop(); return 'Stopped'; }, true);
cmd('tds:skip', 'Vote to skip the wave timer', {}, (p) => G.voteSkip(p));

cmd('tds:place', 'Place a tower (name with _ for spaces)', { tower: 'string', x: 'int', y: 'int', z: 'int' }, (p, a) => {
  const name = T(a.tower); if (!inMatch(p)) return 'Not in a match';
  if (!loadout(p).includes(name) && !p.hasTag('tds_dev')) return `${name} is not in your loadout`;
  const r = G.place(p, name, a.x, a.y, a.z);
  if (!r.ok) { G.log('place_fail', { name, why: r.why }); return `Cannot place: ${r.why}`; }
  questAdd(p, 'places', 1); return `Placed #${r.tower.id} ${name} ($${G.M!.cash[p.name]})`;
});
cmd('tds:upgrade', 'Upgrade a tower', { id: 'int' }, (p, a) => G.upgrade(p.name, a.id));
cmd('tds:sell', 'Sell a tower', { id: 'int' }, (p, a) => G.sell(p.name, a.id));
cmd('tds:target', 'Targeting of a tower', { id: 'int', targeting: G.TARGETS as unknown as string[] }, (_, a) => G.setTarget(a.id, a.targeting));
cmdAny('tds:state', 'One line of match state', {}, () => {
  const M = G.M; if (!M) return 'none';
  return JSON.stringify({ mode: M.mode, wave: M.wave, t: +M.t.toFixed(1), baseHP: M.baseHP, cash: M.cash, enemies: M.enemies.length, towers: M.towers.map((t) => `${t.id}:${t.name}:${t.lvl}`), over: M.over ?? null, units: M.units.length });
});
cmdAny('tds:info', 'Tower stats from the wiki data', { tower: 'string', 'lvl?': 'int' }, (_, a) => {
  const n = T(a.tower), d = towers[n]; if (!d) return `Unknown ${n}`; const l = a.lvl ?? 0;
  const s = stats(n, l);
  return `${n} Lv${l}/${maxLevel(n)} cost $${levelCost(n, l)} dmg ${s.dmg} fr ${s.fr ?? '-'} range ${s.range} ${d.placement} limit ${d.limit ?? '-'} detect H${d.detect.hidden ?? '-'} L${d.detect.lead ?? '-'} F${d.detect.flying ?? '-'} dps ${expected(n, l).toFixed(2)}`;
});

// ---------- dev / test commands (op) ----------
cmdAny('tds:speed', 'Simulation steps per tick (test)', { n: 'int' }, (_, a) => { world.setDynamicProperty('tds:speed', Math.max(1, Math.min(50, a.n))); return `speed ${a.n}`; }, true);
cmdAny('tds:spawn', 'Spawn an enemy (test)', { enemy: 'string', 'mods?': 'string' }, (_, a) => { if (!G.M) return 'no match'; G.debugSpawn(T(a.enemy), a.mods ? a.mods.split(',') : []); return 'ok'; }, true);
cmd('tds:grant', 'Give coins/gems/level and dev tag (test)', { coins: 'int', 'gems?': 'int', 'level?': 'int' }, (p, a) => {
  const pr = prof(p); pr.coins += a.coins; pr.gems += a.gems ?? 0; if (a.level !== undefined) pr.level = a.level; saveProf(p, pr); return `coins ${pr.coins} gems ${pr.gems} level ${pr.level}`;
}, true);
cmd('tds:dev', 'Own every tower; place anything (test)', {}, (p) => { const pr = prof(p); pr.owned = Object.keys(towers); saveProf(p, pr); p.addTag('tds_dev'); return `owned ${pr.owned.length}`; }, true);
cmd('tds:cash', 'Set match cash (test)', { n: 'int' }, (p, a) => { if (!G.M) return 'no match'; G.M.cash[p.name] = a.n; return `$${a.n}`; }, true);
cmdAny('tds:hold', 'Stop or resume the wave clock (test; before a match: for the next one)', { on: 'bool' }, (_, a) => { G.setHold(a.on); return `hold ${a.on}`; }, true);
cmd('tds:auto', 'Let the bot play for you (test)', { on: 'bool' }, (p, a) => { if (a.on) p.addTag('tds_auto'); else p.removeTag('tds_auto'); return `auto ${a.on}`; }, true);
cmdAny('tds:bench', 'Measure every tower level against a dummy', { 'tower?': 'string', 'lvl?': 'int' }, (_, a) => {
  if (a.tower) { const r = bench(T(a.tower), a.lvl ?? 0); G.log('bench', r ?? { name: a.tower, none: true }); return JSON.stringify(r); }
  system.runJob(benchJob()); return 'bench started';
}, true);
function* benchJob() {
  const rows: ReturnType<typeof benchAll> = []; const names = Object.keys(towers);
  for (const n of names) { for (let l = 0; l <= maxLevel(n); l++) { const r = bench(n, l); if (r) rows.push(r); yield; } }
  const bad = rows.filter((r) => r.err > 0.05 || !r.inRange || r.outRange);
  const worst = rows.reduce((a, r) => (r.err > a.err ? r : a), rows[0]);
  for (const r of bad.slice(0, 20)) G.log('bench_bad', r);
  G.log('bench_done', { rows: rows.length, towers: new Set(rows.map((r) => r.name)).size, bad: bad.length, maxErr: worst?.err ?? 0, worst: worst ? `${worst.name} Lv${worst.lvl}` : null });
}

// ---------- lobby commands ----------
cmd('tds:buy', 'Unlock a tower', { tower: 'string' }, (p, a) => buy(p, T(a.tower)));
cmd('tds:equip', 'Put a tower into a loadout slot', { slot: 'int', tower: 'string' }, (p, a) => equip(p, a.slot, T(a.tower)));
cmd('tds:profile', 'Your coins, level and loadout', {}, (p) => {
  const pr = prof(p); return `Lv${pr.level} exp ${Math.floor(pr.exp)} coins ${pr.coins} gems ${pr.gems} owned ${pr.owned.length} loadout ${pr.loadout.join(', ')}`;
});
cmd('tds:quests', 'Daily quests', {}, (p) => { const pr = prof(p); return Object.entries(QUESTS).map(([k, q]) => `${q.text} ${pr.quests[k] ?? 0}/${q.need} (+${q.coins})`).join(' | '); });
cmd('tds:lobby', 'Lobby menu', {}, (p) => { void lobbyMenu(p); });

async function lobbyMenu(p: Player) {
  const pr = prof(p);
  const i = await menu(p, '§l§2TDS Lobby', [['Play', () => 0], ['Loadout', () => 0], ['Shop', () => 0], ['Quests', () => 0]], `Lv${pr.level} · ${pr.coins} coins · ${pr.gems} gems`);
  if (i === 0) { const m = await menu(p, 'Elevator', MODE_NAMES.map((n) => [`${n} §8(${modes[n].waves}w, Lv${modes[n].level})`, () => 0])); if (m !== undefined) p.sendMessage(queue(p, MODE_NAMES[m])); }
  if (i === 1) { const s = await menu(p, 'Loadout', [1, 2, 3, 4, 5].map((k) => [`Slot ${k}: ${pr.loadout[k - 1] ?? '-'}`, () => 0])); if (s !== undefined) { const o = pr.owned; const t = await menu(p, `Slot ${s + 1}`, [...o.map((n) => [n, () => 0] as [string, () => number]), ['(empty)', () => 0]]); if (t !== undefined) p.sendMessage(equip(p, s + 1, o[t] ?? 'none')); } }
  if (i === 2) { const list = Object.keys(towers).filter((n) => !pr.owned.includes(n) && ['Starter', 'Intermediate', 'Advanced', 'Hardcore'].includes(towers[n].category)); const t = await menu(p, 'Shop', list.map((n) => [`${n} §8${towers[n].unlock.value ?? ''} ${towers[n].unlock.kind}`, () => 0])); if (t !== undefined) p.sendMessage(buy(p, list[t])); }
  if (i === 3) p.sendMessage(Object.entries(QUESTS).map(([k, q]) => `${q.text} ${pr.quests[k] ?? 0}/${q.need}`).join('\n'));
}

// ---------- in-world UI ----------
world.afterEvents.itemUse.subscribe(({ source: p, itemStack }) => {
  if (itemStack.typeId !== 'tds:wand') return;
  if (!inMatch(p)) { void lobbyMenu(p); return; }
  const hitB = p.getBlockFromViewDirection({ maxDistance: 24 })?.block;
  if (!hitB) { p.sendMessage('Look at the ground or a cliff'); return; }
  void placeMenu(p, hitB.x, hitB.y + 1, hitB.z);
});
async function placeMenu(p: Player, x: number, y: number, z: number) {
  const lo = loadout(p), cash = G.M?.cash[p.name] ?? 0;
  const i = await menu(p, '§l§6Place a tower', lo.map((n) => [`${placeCost(n) <= cash ? '§a' : '§c'}${n} §8$${placeCost(n)}`, () => 0]), `$${cash} · ${x} ${y} ${z}`);
  if (i === undefined) return;
  const r = G.place(p, lo[i], x, y, z); p.sendMessage(r.ok ? `Placed #${r.tower.id} ${lo[i]}` : `§cCannot place: ${r.why}`);
  if (r.ok) questAdd(p, 'places', 1);
}
world.afterEvents.playerInteractWithEntity.subscribe(({ player: p, target }) => {
  if (target.typeId !== 'tds:tower') return;
  const tw = G.towerById(target.getDynamicProperty('tds:id') as number); if (tw) void towerMenu(p, tw.id);
});
async function towerMenu(p: Player, id: number) {
  const tw = G.towerById(id); if (!tw) return; const s = G.eff(tw), max = tw.lvl >= maxLevel(tw.name), nc = max ? 0 : levelCost(tw.name, tw.lvl + 1);
  const body = `Lv${tw.lvl}/${maxLevel(tw.name)} · dmg ${s.dmg} · fr ${s.fr ?? '-'} · range ${s.range.toFixed(1)}\nDamage dealt ${Math.round(tw.dealt)} · Target ${tw.target}`;
  const f = new ActionFormData().title(`§l#${tw.id} ${tw.name}`).body(body).button(max ? 'Max level' : `Upgrade §8$${nc}`).button(`Sell §8$${G.sellValue(tw)}`).button(`Target: ${tw.target}`);
  const r = await ask(p, f); if (!r || r.canceled) return;
  if (r.selection === 0) p.sendMessage(G.upgrade(p.name, id));
  if (r.selection === 1) p.sendMessage(G.sell(p.name, id));
  if (r.selection === 2) { const t = await menu(p, 'Targeting', G.TARGETS.map((x) => [x, () => 0])); if (t !== undefined) p.sendMessage(G.setTarget(id, G.TARGETS[t])); }
}

every(10, (p) => {
  const M = G.M; if (!M || !M.players.includes(p.name)) return;
  const left = M.waveEnd === Infinity ? '∞' : `${Math.max(0, Math.ceil(M.waveEnd - M.t))}s`;
  p.onScreenDisplay.setActionBar(`§c❤ ${Math.max(0, M.baseHP)}/${M.maxHP} §e$${M.cash[p.name] ?? 0} §fWave ${M.wave}/${modes[M.mode].waves} §7${left} §aEnemies ${M.enemies.length}`);
});

// ---------- autoplay (test bot): greedy damage-per-cash with detection needs ----------
const spots: { x: number; y: number; z: number; cover: number }[] = [];
function findSpots() {
  spots.length = 0; const path = G.path!, m = maps[G.M!.map];
  for (let x = -31; x <= 30; x += 2) for (let z = -31; z <= 30; z += 2) {
    for (const y of [m.y, m.y + 2]) {
      if (!G.surface(x, y, z)) continue; if (y === m.y && path.dist(x + 0.5, z + 0.5) < path.width / 2 + 1.5) continue;
      let c = 0; for (let d = 0; d < path.len; d += 2) { const q = path.at(d); if (Math.hypot(q.x - x - 0.5, q.z - z - 0.5) / path.stud <= 14) c++; }
      if (c) spots.push({ x, y, z, cover: c });
    }
  }
  spots.sort((a, b) => b.cover - a.cover);
}
const dps = (n: string, l: number) => expected(n, l) * (stats(n, l).splash ? 2 : 1) + (stats(n, l).burn ? stats(n, l).burn![0] / stats(n, l).burn![1] : 0);
function need() {
  const M = G.M!, md = modes[M.mode], r = { hidden: false, lead: false, flying: false };
  for (let w = M.wave; w <= Math.min(md.waves, M.wave + 2); w++) for (const g of md.wave[String(w)] ?? []) { const e = enemies[g.e]; if (e?.hidden) r.hidden = true; if (e?.lead) r.lead = true; if (e?.flying) r.flying = true; }
  return r;
}
function sees(n: string, l: number, k: 'hidden' | 'lead' | 'flying') { const d = towers[n].detect[k]; return d !== null && l >= d; }
system.runInterval(() => {
  const M = G.M; if (!M || M.over) return;
  for (const p of world.getAllPlayers()) {
    if (!p.hasTag('tds_auto') || !M.players.includes(p.name)) continue;
    if (!spots.length || (spots as any).map !== M.map + M.mode + M.players.join()) { findSpots(); (spots as any).map = M.map + M.mode + M.players.join(); }
    const cash = M.cash[p.name], nd = need(), mine = M.towers.filter((t) => t.owner === p.name);
    const have = (k: 'hidden' | 'lead' | 'flying') => mine.some((t) => sees(t.name, t.lvl, k));
    let best: { v: number; act: () => unknown } | undefined, dream = 0;
    const consider = (v: number, c: number, act: () => unknown) => { if (!Number.isFinite(c) || c <= 0) return; dream = Math.max(dream, v / c); if (c <= cash && (!best || v / c > best.v)) best = { v: v / c, act }; };
    for (const n of loadout(p)) {
      if (!dps(n, 0)) continue;
      let bonus = 0; for (const k of ['hidden', 'lead', 'flying'] as const) if (nd[k] && !have(k) && sees(n, 0, k)) bonus += 1000;
      const free = spots.find((s) => (towers[n].placement === 'both' || (towers[n].placement === 'cliff') === (s.y !== maps[M.map].y)) && !M.towers.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < 2));
      const lim = Math.min(towers[n].limit ?? 99, n === 'Scout' ? 3 : 6); if (free && !(mine.filter((t) => t.name === n).length >= lim)) consider(dps(n, 0) * free.cover + bonus, placeCost(n), () => G.place(p, n, free.x, free.y, free.z));
    }
    for (const t of mine) {
      if (t.lvl >= maxLevel(t.name)) continue;
      let bonus = 0; for (const k of ['hidden', 'lead', 'flying'] as const) if (nd[k] && !have(k) && sees(t.name, t.lvl + 1, k)) bonus += 1000;
      const sp = spots.find((s) => s.x === t.x && s.z === t.z)?.cover ?? 10;
      consider((dps(t.name, t.lvl + 1) - dps(t.name, t.lvl)) * sp * 1.5 + bonus, levelCost(t.name, t.lvl + 1), () => G.upgrade(p.name, t.id));
    }
    // economy: farms while the defence holds (no leak this wave) in the first half of the match
    const W = modes[M.mode].waves, left = W - M.wave;
    if (loadout(p).includes('Farm') && M.wave >= 1 && M.wave <= W * 0.5 && !M.leakedThisWave) {
      const farms = mine.filter((t) => t.name === 'Farm');
      const up = farms.filter((t) => t.lvl < maxLevel('Farm')).map((t) => ({ t, c: levelCost('Farm', t.lvl + 1), g: (stats('Farm', t.lvl + 1).income ?? 0) - (stats('Farm', t.lvl).income ?? 0) })).sort((a, b) => a.c / a.g - b.c / b.g)[0];
      const spot = spots.find((s) => s.y === maps[M.map].y && !M.towers.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < 2));
      const nw = farms.length < (towers.Farm.limit ?? 10) && spot ? { c: placeCost('Farm'), g: stats('Farm', 0).income ?? 0 } : undefined;
      const opt = [up && { c: up.c, g: up.g, act: () => G.upgrade(p.name, up.t.id) }, nw && { ...nw, act: () => G.place(p, 'Farm', spot!.x, spot!.y, spot!.z) }].filter(Boolean).sort((a: any, b: any) => a.c / a.g - b.c / b.g)[0] as any;
      if (opt && opt.c / opt.g < left / 2 && opt.c <= cash && M.wave % 2 === 0) { opt.act(); continue; }
    }
    if (best && best.v >= dream * 0.6) best.act();
  }
}, 5);

// ---------- start ----------
ready(() => {
  if (world.getDynamicProperty('tds:speed') === undefined) world.setDynamicProperty('tds:speed', 1);
  G.restore();
  G.log('ready', { towers: Object.keys(towers).length, enemies: Object.keys(enemies).length, modes: MODE_NAMES.length, maps: Object.keys(maps).length, timer1: timerFor('Easy', 1).timer });
});
world.afterEvents.playerSpawn.subscribe(({ player: p, initialSpawn }) => {
  if (!initialSpawn) return;
  const pr = prof(p); saveProf(p, pr);
  if (![...Array(36).keys()].some((i) => p.getComponent('inventory')!.container!.getItem(i)?.typeId === 'tds:wand')) p.getComponent('inventory')!.container!.addItem(new ItemStack('tds:wand'));
  void addExp; void ask;
});

// ---------- performance probe ----------
let tpsT = Date.now(), tpsN = 0, tps = 20;
system.runInterval(() => { if (++tpsN >= 100) { const now = Date.now(); tps = (tpsN * 1000) / (now - tpsT); tpsT = now; tpsN = 0; } }, 1);
cmdAny('tds:tps', 'Ticks per second over the last 100 ticks', {}, () => { const r = `tps ${tps.toFixed(1)} sim ${(G.prof.sim / Math.max(1, G.prof.n)).toFixed(2)}ms vis ${(G.prof.vis / Math.max(1, G.prof.n)).toFixed(2)}ms save ${(G.prof.save / Math.max(1, G.prof.n)).toFixed(2)}ms towers ${(G.prof.tw / Math.max(1, G.prof.n)).toFixed(2)}ms`; G.prof.tw = 0; G.prof.sim = G.prof.vis = G.prof.save = G.prof.n = 0; return r; }, true);
cmd('tds:stress', 'Spawn enemies and towers for a load test (test)', { enemies: 'int', towers: 'int' }, (p, a) => {
  if (!G.M || !G.path) return 'no match';
  for (let i = 0; i < a.enemies; i++) G.debugSpawn('Slow Boss', [], (i * 0.9) % G.path.len);
  let n = 0; for (let x = -30; x <= 30 && n < a.towers; x += 3) for (let z = -30; z <= 30 && n < a.towers; z += 3) if (G.place(p, 'Scout', x, -60, z, true).ok) n++;
  return `stress ${a.enemies} enemies ${n} towers`;
}, true);
