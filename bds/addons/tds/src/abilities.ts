// Tower abilities ({{Ability}} on each tower page) and the towers that do more than "shoot the target":
// planes, vehicles, traps, sentries, graves, beams, medics, tracks. Every number is read from the tower's level row
// (data/towers.json) or its units (data/units.json); the values the pages leave out are listed in tools/engine_guesses.json.
import { Player } from '@minecraft/server';
import { towers, units, Stats } from './defs';
import * as G from './game';
import type { Tower, Enemy, AbilityCtx, Unit } from './game';

const H = G.hooks;
const now = () => G.M!.t;
const N = (v: unknown, d = 0) => { const x = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : d; };
const row = (tw: Tower) => (towers[tw.name]?.levels[tw.lvl] ?? {}) as Record<string, unknown>;
const st = (tw: Tower) => (tw.st ??= {});
const stud = () => G.path!.stud;
const alive = () => G.M!.enemies.filter((e) => e.hp > 0);
/** enemies within r studs of a path distance */
const along = (d: number, r: number, flying = true) => alive().filter((e) => Math.abs(e.d - d) <= r && (flying || !e.flying));
/** enemies within r studs (world distance) of a point */
const around = (x: number, z: number, r: number) => alive().filter((e) => { const p = G.epos(e); return Math.hypot(p.x - x, p.z - z) / stud() <= r; });
const kb = (e: Enemy, studs: number) => { if (e.boss || studs <= 0) return; e.d = Math.max(0, e.d - studs); e.x = undefined; };
const slowE = (e: Enemy, pct: number, dur: number) => { if (e.boss || e.immune.includes('Slowed')) return; e.slow = Math.max(e.slow, pct); e.slowUntil = Math.max(e.slowUntil, now() + dur); };
const dot = (e: Enemy, tw: Tower, dmg: number, tick: number, dur: number, kind: string, cap = Infinity) => {
  if (kind === 'burn' && e.immune.includes('Burn')) return;
  if (e.dots.filter((o) => o.kind === kind && o.tw === tw.id).length >= cap) return;
  e.dots.push({ dmg, tick, next: now() + tick, until: now() + dur * G.fd(tw), tw: tw.id, kind });
};
const confuse = (e: Enemy, tw: Tower, dur: number, cd = 0) => { if (e.boss || now() < (e.confCd ?? 0)) return; e.conf = now() + dur * G.fd(tw); e.confCd = now() + dur + cd; };
/** the strongest player-owned towers near a point, for buffs and clones */
const towersAround = (tw: Tower, r: number) => G.towersNear(tw.x, tw.z, r).filter((o) => o !== tw && o.temp === undefined);

// ---------- delayed and lasting effects (not saved: they last seconds) ----------
type Zone = { tw: number; d: number; r: number; until: number; dmg: number; every: number; next: number; slow?: number; slowTime?: number; burn?: [number, number, number]; hp?: number; kind: 'thorns' | 'trap' };
type Sweep = { tw: number; from: number; to: number; t0: number; dur: number; dmg: number; hit: Set<number>; pos: number };
type Later = { at: number; fn: () => void };
let zones: Zone[] = [], sweeps: Sweep[] = [], later: Later[] = [], decayAt = 0;
const after = (sec: number, fn: () => void) => later.push({ at: now() + sec, fn });
G.onStart.push(() => { zones = []; sweeps = []; later = []; decayAt = 0; });

H.step.push(() => {
  const M = G.M!; const t = M.t;
  for (const z of [...zones]) {
    if (t >= z.until || (z.hp !== undefined && z.hp <= 0)) { zones.splice(zones.indexOf(z), 1); continue; }
    if (t < z.next) continue;
    const tw = G.towerById(z.tw);
    if (z.kind === 'trap') {   // a trap goes off when an enemy steps on it; it breaks after taking its health in damage dealt
      if (!along(z.d, 0.75, false).length) continue;
      z.next = t + 0.5;
      const hit = along(z.d, z.r, false);
      for (const e of hit) { G.hit(e, z.dmg, tw, 'splash'); if (z.burn && tw) dot(e, tw, z.burn[0], z.burn[1], z.burn[2], 'burn'); }
      z.hp = (z.hp ?? 0) - z.dmg * Math.max(1, hit.length);
      G.log('trap', { tower: z.tw, hits: hit.length });
      continue;
    }
    z.next = t + z.every;
    for (const e of along(z.d, z.r, false)) { G.hit(e, z.dmg, tw, 'splash'); if (z.slow) slowE(e, z.slow, z.slowTime ?? 1); }
  }
  for (const w of [...sweeps]) {   // Sweeper lasers move over the path; each hits an enemy once
    const k = Math.min(1, (t - w.t0) / w.dur), pos = w.from + (w.to - w.from) * k, lo = Math.min(pos, w.pos), hi = Math.max(pos, w.pos);
    const tw = G.towerById(w.tw);
    for (const e of alive()) if (!w.hit.has(e.id) && e.d >= lo - 0.5 && e.d <= hi + 0.5) { w.hit.add(e.id); G.hit(e, w.dmg, tw); }
    w.pos = pos; if (k >= 1) sweeps.splice(sweeps.indexOf(w), 1);
  }
  for (const l of [...later]) if (t >= l.at) { later.splice(later.indexOf(l), 1); l.fn(); }
  // planes circle their tower
  for (const tw of M.towers) if (tw.name === 'Ace Pilot') { const S = st(tw); S.th = ((S.th as number) ?? 0) + ((S.dir as number) ?? 1) * 0.8 * N(row(tw).speedMultiplier, 1) * 0.05; }
  // over-heal above what the players keep fades by 1 per second
  if (t >= decayAt) { decayAt = t + 1; const keep = M.maxHP + G.overCap(); if (M.baseHP > keep) M.baseHP--; }
  // Military Base vehicles with a cannon fire it too
  for (const u of M.units) {
    const tw = G.towerById(u.tw); if (!tw || tw.name !== 'Military Base') continue;
    const L = row(tw), cd = N(L.cannonFirerate), dmg = N(L.cannonSplashDamage); if (!cd || !dmg) continue;
    const U = u as Unit & { cn?: number }; if (t < (U.cn ?? 0)) continue;
    const e = alive().find((x) => Math.abs(x.d - u.d) <= (u.range || 6) && !x.flying && !x.hidden); if (!e) continue;
    U.cn = t + cd; for (const o of along(e.d, 3, false)) G.hit(o, dmg, tw, o === e ? 'direct' : 'splash');
  }
});

// ---------- tower steps ----------
/** Commander attacks only while Call to Arms or Support Caravan is on */
H.towerStep['Commander'] = (tw) => !((tw.st?.self ?? 0) > now());
/** DJ Booth, Farm: no attack of their own */
H.towerStep['DJ Booth'] = () => true;
/** Pulse Trooper stops attacking while its lasers sweep */
H.towerStep['Pulse Trooper'] = (tw) => (tw.st?.busy ?? 0) > now();
/** Gatling Gun under player control does not fire on its own */
H.towerStep['Gatling Gun'] = (tw) => !!tw.st?.fps;
/** Kingpin pauses after placing a bounty */
H.towerStep['Kingpin'] = (tw) => (tw.st?.pause ?? 0) > now();

/** Accelerator: charges (Charge Up), then its beam ticks until it has dealt its Overcharge, then cools down */
for (const name of ['Accelerator']) H.towerStep[name] = (tw) => {
  const M = G.M!, S = st(tw), L = row(tw), s = G.eff(tw), t = M.t;
  const charge = N(L.chargeUp, 6.5), over = N(L.overcharge, 9000), cool = N(L.cooldown, 2.5);
  const e = G.pick(tw, s.range);
  if (!S.ph) { if (!e) return true; S.ph = 'charge'; S.until = t + charge; return true; }
  if (S.ph === 'charge') { if (t >= S.until) { S.ph = 'beam'; S.dealt = 0; tw.next = t; } return true; }
  if (S.ph === 'cool') { if (t >= S.until) S.ph = undefined; return true; }
  if (!e || t < tw.next) return true;
  const before = tw.dealt; G.shoot(tw, s, e); S.dealt += tw.dealt - before; tw.next = t + (s.fr ?? 0.25);
  if (S.dealt >= over) { S.ph = 'cool'; S.until = t + cool; G.log('overcharge', { id: tw.id, dealt: Math.round(S.dealt) }); }
  return true;
};

/** Ace Pilot: the plane circles its tower and drops bombs on what is under it (Bomb Cooldown) */
const ORBIT = 6;
H.origin['Ace Pilot'] = (tw) => { const th = (tw.st?.th as number) ?? 0; return { x: tw.x + 0.5 + Math.cos(th) * ORBIT * stud(), z: tw.z + 0.5 + Math.sin(th) * ORBIT * stud() }; };
H.towerStep['Ace Pilot'] = (tw) => {
  const L = row(tw), S = st(tw), cd = N(L.bombCooldown), dmg = N(L.splashDamage);
  if (cd && dmg && now() >= (S.bomb ?? 0)) {
    const o = H.origin['Ace Pilot'](tw), hit = around(o.x, o.z, N(L.explosionRange, 3)).filter((e) => G.canSee(tw, e) || !e.hidden);
    if (hit.length) { S.bomb = now() + cd; for (const e of hit) G.hit(e, dmg, tw, 'splash'); }
  }
  return false;
};

/** Pursuit: drives up and down its patrol stretch of the path, shooting (ammo, reload) and firing missile bursts */
H.origin['Pursuit'] = (tw) => { const d = (tw.st?.pd as number) ?? G.nearestD(tw); const p = G.path!.at(d); return { x: p.x, z: p.z }; };
H.towerStep['Pursuit'] = (tw, dt) => {
  const L = row(tw), S = st(tw), M = G.M!;
  if (S.center === undefined) { S.center = G.nearestD(tw); S.pd = S.center; S.pdir = 1; }
  const span = N(L.patrolRange, 14), v = N(L.speed, 45) / 5;
  S.pd += S.pdir * v * dt; if (S.pd > S.center + span) { S.pd = S.center + span; S.pdir = -1; } if (S.pd < Math.max(0, S.center - span)) { S.pd = Math.max(0, S.center - span); S.pdir = 1; }
  S.pd = Math.min(G.path!.len, S.pd);
  const cd = N(L.missileCooldown), n = N(L.missileCount), dmg = N(L.splashDamage);
  if (cd && n && dmg && M.t >= (S.mis ?? 0)) {
    const e = G.pick(tw, G.eff(tw).range * 2);
    if (e) { S.mis = M.t + cd; for (let i = 0; i < n; i++) after(i * N(L.burstTime, 0.5), () => { for (const o of along(e.d, N(L.explosionRange, 4))) G.hit(o, dmg, tw, 'splash'); }); }
  }
  return false;
};

/** Medic: assigned to up to Max Targets towers in range (Tower Selection Cooldown); shields them from one stun at a time (Shield Recharge Speed); heals the base each wave */
H.towerStep['Medic'] = (tw) => {
  const L = row(tw), S = st(tw), t = now();
  if (t >= (S.sel ?? 0)) {
    S.sel = t + N(L.towerSelectionCooldown, 0.5);
    const r = G.eff(tw).range, pickd = towersAround(tw, r).filter((o) => !['Medic', 'Farm', 'DJ Booth'].includes(o.name)).sort((a, b) => b.spent - a.spent).slice(0, Math.max(1, N(L.maxTargets, 1))).map((o) => o.id);
    if (JSON.stringify(pickd) !== JSON.stringify(S.as ?? [])) { S.as = pickd; G.dropBuffs(); }
  }
  return true;
};
H.guard.push((tw, kind) => {
  for (const m of G.M!.towers) {
    if (m.name !== 'Medic' || !(m.st?.as as number[] | undefined)?.includes(tw.id)) continue;
    if ((m.st!.uber ?? 0) > now()) return true;   // Ubercharge: stun and freeze immunity
    if (kind === 'stun') { const sh = (m.st!.sh ??= {}) as Record<number, number>; if ((sh[tw.id] ?? 0) <= now()) { sh[tw.id] = now() + N(row(m).shieldRechargeSpeed, 8); G.log('medic_shield', { medic: m.id, tower: tw.id }); return true; } }
  }
  return false;
});
H.waveEnd.push(() => {
  for (const m of G.M!.towers) if (m.name === 'Medic' && m.temp === undefined) { const L = row(m), h = G.healBase(N(L.healing), N(L.overhealLimit)); if (h) G.log('medic_heal', { id: m.id, healed: h, baseHP: G.M!.baseHP }); }
});

/** Trapper: lays a trap on the path in range every Firerate seconds, up to Max Traps, each lasting its Lifespan */
H.towerStep['Trapper'] = (tw) => {
  const L = row(tw), S = st(tw), t = now(), s = G.eff(tw);
  if (t < (S.lay ?? 0)) return true;
  S.lay = t + (s.fr ?? N(L.firerate, 4));
  if (zones.filter((z) => z.tw === tw.id && z.kind === 'trap').length >= N(L.maxTraps, 6)) return true;
  const iv = G.cover(tw, s.range); if (!iv.length) return true;
  const [a, b] = iv[Math.floor(Math.random() * iv.length)], d = a + Math.random() * (b - a);
  zones.push({ tw: tw.id, d, r: s.splash ? s.splash : 1, until: t + N(L.lifespan, 25), dmg: s.dmg, every: 0.5, next: t, hp: N(L.health, s.dmg), burn: s.burn, kind: 'trap' });
  return true;
};

/** Engineer: builds sentries (stationary units, best by level) beside the path in its range, up to Max Units; one build per Build Range seconds */
H.towerStep['Engineer'] = (tw) => {
  const L = row(tw), S = st(tw), M = G.M!, t = M.t;
  if (t >= (S.build ?? 0) && M.units.filter((u) => u.tw === tw.id).length < N(L.maxUnits, 1)) {
    S.build = t + N(L.buildRange, 4);
    const kind = bestUnit(tw), base = G.nearestD(tw), r = G.eff(tw).range / 2;
    G.spawnUnit(tw, kind, { d: Math.max(0, Math.min(G.path!.len, base + (Math.random() * 2 - 1) * r)), stationary: true, collide: false, speed: 0 });
  }
  return false;
};
const bestUnit = (tw: Tower) => { const l = Object.entries(units).filter(([, u]) => u.tower === tw.name).sort((a, b) => a[1].order - b[1].order); if (!l.length) return undefined; const withLv = l.filter(([, u]) => u.level > 0 && u.level <= tw.lvl); return (withLv.length ? withLv[withLv.length - 1] : l[Math.min(l.length - 1, Math.floor((tw.lvl * l.length) / ((towers[tw.name].levels.length || 1))))])[0]; };

/** Crook Boss: keeps bodyguards standing on the path next to it (one, two from Level 3) */
H.towerStep['Crook Boss'] = (tw) => {
  const S = st(tw), M = G.M!, want = tw.lvl >= 3 ? 2 : 1;
  if (M.t >= (S.guard ?? 0) && M.units.filter((u) => u.tw === tw.id).length < want) { S.guard = M.t + 10; G.spawnUnit(tw, bestUnit(tw), { d: G.nearestD(tw), stationary: true, collide: false, speed: 0 }); }
  return false;
};
/** Elf Camp: sends its best elf up the path (the unit's Spawnrate, else every 15 s) */
H.towerStep['Elf Camp'] = (tw) => {
  const S = st(tw), M = G.M!, kind = bestUnit(tw); if (!kind) return true;
  if (M.t >= (S.elf ?? 0) && M.units.filter((u) => u.tw === tw.id).length < 3 + tw.lvl) { S.elf = M.t + (units[kind]?.spawnrate ?? 15) * Math.max(0.1, 1 - G.skv(tw.owner, 'Expanded Barracks') / 100); G.spawnUnit(tw, kind); }
  return true;
};
/** Mercenary Base: every Spawnrate sends Unit Queue units, cycling through the kinds it has at its level; Buff raises their damage */
H.towerStep['Mercenary Base'] = (tw) => {
  const L = row(tw), S = st(tw), M = G.M!;
  const kinds = Object.entries(units).filter(([, u]) => u.tower === 'Mercenary Base' && u.level <= tw.lvl).sort((a, b) => a[1].order - b[1].order).map(([n]) => n);
  if (!kinds.length || M.t < (S.merc ?? 0)) return true;
  S.merc = M.t + (units[kinds[0]].spawnrate ?? 30) * Math.max(0.1, 1 - G.skv(tw.owner, 'Expanded Barracks') / 100);
  const q = Math.max(1, N(L.unitQueue, 1)), buff = 1 + N(L.buff) / 100;
  for (let i = 0; i < q; i++) { const k = kinds[((S.mi ?? 0) + i) % kinds.length]; const u0 = units[k]; G.spawnUnit(tw, k, { dmg: u0.dmg * buff }); }
  S.mi = ((S.mi ?? 0) + q) % kinds.length;
  return true;
};

/** Necromancer: souls from enemies that die in its range fill its Soul Meter; a full meter builds a gravestone (Build Time) or levels one up; Raise the Dead turns graves into skeletons */
H.kill.push((e) => {
  for (const tw of G.M!.towers) {
    if (tw.name !== 'Necromancer' || tw.temp !== undefined) continue;
    if (G.distTo(tw, e) <= G.eff(tw).range) { const S = st(tw); S.souls = (S.souls ?? 0) + e.max; }
  }
});
H.towerStep['Necromancer'] = (tw) => {
  const L = row(tw), S = st(tw), t = now(), meter = N(L.soulMeter, 105);
  S.graves ??= [];
  if (S.building !== undefined && t >= S.building) { S.building = undefined; S.graves.push(1); G.log('gravestone', { id: tw.id, graves: S.graves.length }); }
  if (S.building === undefined && (S.souls ?? 0) >= meter) {
    const graves = S.graves as number[];
    if (graves.length < N(L.maxGravestones, 3)) { S.souls -= meter; S.building = t + N(L.buildTime, 1.5); }
    else { const i = graves.indexOf(Math.min(...graves)); if (graves[i] < N(L.maxGravestoneLevel, 1)) { S.souls -= meter; graves[i]++; } }
  }
  return false;
};

/** Hacker: Wire Fraud — enemies it hits pay that much more cash when they die */
H.fire.push((tw, _s, e, hits) => {
  if (tw.name !== 'Hacker') return; const pct = N(row(tw).wireFraud) / 100; if (!pct) return;
  for (const h of hits) h.wire = { tw: tw.id, pct };
  void e;
});

/** Mecha Base and War Machine: a second weapon (missiles / rocket volleys) on its own cooldown */
for (const name of ['Mecha Base', 'War Machine']) H.towerStep[name] = (tw) => {
  const L = row(tw), S = st(tw), t = now();
  const dmg = N(L.missileDamage) || N(L.rocketDamage), cd = N(L.missileCooldown) || N(L.rocketCooldown), n = Math.max(1, N(L.rocketValleyCount, 1));
  if (dmg && cd && t >= (S.sec ?? 0)) { const e = G.pick(tw, G.eff(tw).range); if (e) { S.sec = t + cd; for (let i = 0; i < n; i++) after(i * 0.15, () => { for (const o of along(e.d, 4)) G.hit(o, dmg, tw, 'splash'); }); } }
  return false;
};

// ---------- on-hit effects ----------
H.fire.push((tw, s, e, hits) => {
  const L = row(tw), S = st(tw), t = now();
  switch (tw.name) {
    case 'Mortar': {   // cluster bombs land around the shell
      const n = N(L.clusterCount), dmg = N(L.clusterDamage), r = N(L.clusterExplosionRadius, 3), spread = s.splash ?? 5;
      for (let i = 0; i < n; i++) { const d = e.d + (Math.random() * 2 - 1) * spread; after(0.4 + i * 0.05, () => { for (const o of along(d, r, false)) G.hit(o, dmg, tw, 'splash'); }); }
      break;
    }
    case 'Tesla': {   // every Smite Meter attacks a bolt strikes around the target
      const m = N(L.smiteMeter); if (!m) break; S.sm = (S.sm ?? 0) + 1;
      if (S.sm % m === 0) { const p = G.epos(e); for (const o of around(p.x, p.z, N(L.smiteRadius, 5))) G.hit(o, N(L.smiteDamage), tw, 'splash'); }
      break;
    }
    case 'Assassin': {   // a whirlwind every few hits; knives after enough damage
      const ww = N(L.whirlwindHit); if (ww) { S.ww = (S.ww ?? 0) + 1; if (S.ww % ww === 0) { const o = G.origin(tw); for (const x of around(o.x, o.z, N(L.whirlwindRange, 5))) G.hit(x, N(L.whirlwindDamage), tw, 'splash'); } }
      const thr = N(L.damageThreshold); if (thr) { S.kd = (S.kd ?? 0) + s.dmg; if (S.kd >= thr) { S.kd = 0; for (let k = 0; k < N(L.knifeCount, 1); k++) after(k * N(L.knifeCooldown, 0.5), () => { const o = G.origin(tw); for (const x of around(o.x, o.z, N(L.knifeRange, 8)).slice(0, N(L.knifeMaxHits, 1))) G.hit(x, N(L.knifeDamage), tw); }); } }
      break;
    }
    case 'Warden': {   // every third hit is critical
      const m = N(L.criticalHitMultiplier); if (!m) break; S.cr = (S.cr ?? 0) + 1;
      if (S.cr % 3 === 0 && e.hp > 0) G.hit(e, s.dmg * (m - 1), tw);
      break;
    }
    case 'Boomerang': {   // each extra boomerang passes through the target and those right next to it
      const n = N(L.boomerangCount, 1);
      for (let k = 1; k < n; k++) after(k * N(L.throwDelay, 0.25), () => { for (const o of along(e.d, 2).slice(0, 3)) if (G.canSee(tw, o)) G.hit(o, s.dmg, tw); });
      break;
    }
    case 'Freezer': case 'Cryomancer': {   // chill damage on enemies already at the most slow
      const c = N(L.chillDamage); if (!c) break;
      for (const h of hits) if (h.hp > 0 && h.slow >= (s.slowMax ?? 1) - 1e-9) G.hit(h, c, tw);
      break;
    }
    case 'Swarmer': {   // stinging: bee damage every second for Sting Time, up to Stack Limit stacks
      for (const h of hits) if (h.hp > 0) dot(h, tw, N(L.beeDamage, 1), 1, N(L.stingTime, 10), 'sting', N(L.stackLimit, 30));
      break;
    }
    case 'Slasher': {   // bleed stacks; every few swings a critical hit
      for (const h of hits) if (h.hp > 0) dot(h, tw, N(L.baseBleedDamage, 1), 1, 5, 'bleed', Math.max(1, Math.floor(N(L.maxStack, 450) / Math.max(1, N(L.bleedStack, 45)))));
      const cs = N(L.critSwing); if (cs) { S.cs = (S.cs ?? 0) + 1; if (S.cs % cs === 0 && e.hp > 0) G.hit(e, s.dmg * (N(L.critMultiplier, 2) - 1), tw); }
      break;
    }
    case 'Crystallizer': {   // crystals leave enemies vulnerable
      for (const h of hits) { h.vuln = t + N(L.vulnerabilityTime, 5) * G.fd(tw); h.vulnPct = N(L.damageVulnerability) / 100; }
      break;
    }
    case 'Brawler': {   // the last hit of a combo hits harder and knocks back
      const n = N(L.hitCount); if (!n) break; S.cb = (S.cb ?? 0) + 1;
      if (S.cb % n === 0 && e.hp > 0) { G.hit(e, N(L.finalHitDamage), tw); kb(e, N(L.knockbackForce) * 0.1); }
      break;
    }
    case 'Hallow Punk': case 'Warlock': {
      const f = N(L.knockback) || N(L.knockbackForce); for (const h of hits) if (h.hp > 0) kb(h, f * 0.1);
      break;
    }
    case 'Spotlight Tech': {   // enough damage under the light confuses an enemy
      const thr = N(L.confusionThreshold); if (!thr) break;
      for (const h of hits) { const acc = (h.acc ??= {}); acc[tw.id] = (acc[tw.id] ?? 0) + s.dmg; if (acc[tw.id] >= thr) { acc[tw.id] = 0; confuse(h, tw, N(L.confusionTime, 2), N(L.confusionCooldown, 5)); } }
      break;
    }
    case 'Sledger': {   // an aftershock follows each slam
      const dl = N(L.aftershockDelay, 0.4), dmg = N(L.aftershockDamage) || s.dmg * 0.5, d = e.d;
      after(dl, () => { for (const o of along(d, s.splash ?? 3, false)) G.hit(o, dmg, tw, 'splash'); });
      break;
    }
    case 'Jester': {   // the equipped bomb adds its effect
      const b = (S.bomb as string) ?? 'Fire';
      for (const h of hits) {
        if (h.hp <= 0) continue;
        if (b === 'Fire') dot(h, tw, Math.max(1, s.dmg * 0.25), 0.5, 3, 'burn');
        else if (b === 'Ice') slowE(h, 0.2, 2 * G.fd(tw));
        else if (b === 'Poison') { dot(h, tw, Math.max(1, s.dmg * 0.2), 1, 5, 'poison'); G.mark(tw, 'Poison'); }
        else if (b === 'Confusion') confuse(h, tw, 1, 5);
      }
      break;
    }
  }
});
/** Ranger: a kill gives towers within Buff Range its Range Buff for Buff Time */
H.kill.push((_e, tw) => {
  if (!tw || tw.name !== 'Ranger') return; const L = row(tw), pct = N(L.rangeBuff) / 100; if (!pct) return;
  for (const o of towersAround(tw, N(L.buffRange, 12))) { const S = st(o); S.rgPct = pct; S.rgUntil = now() + N(L.buffTime, 20); }
});

// ---------- abilities ----------
const A = H.ability;
const need = (c: AbilityCtx) => (c.d === undefined ? '!No enemy or spot to aim at' : undefined);
const unitNamed = (tower: string, part: RegExp) => Object.entries(units).find(([n, u]) => u.tower === tower && part.test(n))?.[0];

A['Call to Arms'] = (c) => { c.tw.ctaBuff = N(c.L.callToArmsBuff) / 100; c.tw.ctaUntil = now() + 10; st(c.tw).self = now() + 10; G.dropBuffs(); return `+${Math.round(c.tw.ctaBuff * 100)}% firerate 10s`; };
A['War Cry'] = (c) => { c.tw.selfBuff = 0.65; c.tw.selfBuffUntil = now() + 10; return '+65% firerate 10s'; };
A['Airstrike'] = (c) => {
  if (!c.lead) return '!No enemy to aim at';
  const raw = String(c.L.airstrikeDamage ?? ''), m = raw.match(/([\d.]+)\s*x\s*(\d+)/), dmg = m ? +m[1] : N(raw) || c.s.dmg, n = m ? +m[2] : 1;
  const hits = along(c.lead.d, 8);
  for (let k = 0; k < n; k++) after(k * 0.2, () => { for (const e of along(c.lead!.d, 8)) G.hit(e, dmg, c.tw, 'splash'); });
  return `${hits.length} enemies`;
};
A['Frost Grenade'] = (c) => {
  if (!c.lead) return '!No enemy to aim at';
  const hits = along(c.lead.d, 6).slice(0, 5);
  for (const e of hits) if (!e.immune.includes('Freeze') && !e.boss) { e.freezeUntil = now() + 2 * G.fd(c.tw); G.mark(c.tw, 'Freeze'); }
  return `${hits.length} enemies`;
};
A['Toggle Reverse'] = (c) => { const S = st(c.tw); S.dir = -((S.dir as number) ?? 1); return S.dir > 0 ? 'flying clockwise' : 'flying counter-clockwise'; };
A['Ubercharge'] = (c) => { const S = st(c.tw), dur = N(c.L.uberchargeDuration, 10); S.uber = now() + dur; G.dropBuffs(); return `${(S.as as number[] | undefined)?.length ?? 0} towers for ${dur}s`; };
A['Sweeper'] = (c) => {
  const dur = N(c.L.laserDuration, 6), dmg = N(c.L.laserDamage), len = G.path!.len; st(c.tw).busy = now() + dur;
  sweeps.push({ tw: c.tw.id, from: 0, to: len, t0: now(), dur, dmg, hit: new Set(), pos: 0 }, { tw: c.tw.id, from: len, to: 0, t0: now(), dur, dmg, hit: new Set(), pos: len });
  return `two lasers for ${dur}s`;
};
A['Support Caravan'] = (c) => {
  const gun = unitNamed('Commander', /Gunner/i), mis = unitNamed('Commander', /Missile/i);
  G.spawnUnit(c.tw, gun); G.spawnUnit(c.tw, gun, { next: 0.5 }); G.spawnUnit(c.tw, mis, { next: 1 });
  st(c.tw).self = now() + 10;
  return '2 Gunner APCs, 1 Missile APC';
};
const TRACKS = ['Purple', 'Green', 'Red'] as const;
/** DJ Booth track (Purple: knockback and slowness; Green: cash; Red: damage and defense loss); each tower in its range makes the effect stronger */
export function setTrack(id: number, track: string): string {
  const tw = G.towerById(id); if (!tw || tw.name !== 'DJ Booth') return 'Not a DJ Booth';
  const tr = TRACKS.find((x) => x.toLowerCase() === track.toLowerCase()); if (!tr) return `Tracks: ${TRACKS.join(' ')}`;
  st(tw).track = tr; G.log('dj_track', { id, track: tr }); return `Track: ${tr}`;
}
A['Drop the Beat'] = (c) => {
  const S = st(c.tw), tr = (S.track as string) ?? 'Purple', n = towersAround(c.tw, G.eff(c.tw).range).length, lvl = c.tw.lvl + 1, r = G.eff(c.tw).range;
  if (tr === 'Green') { const cash = 50 * lvl + 25 * n; G.pay(c.owner, cash); return `$${cash} (${n} towers)`; }
  const o = G.origin(c.tw);
  for (let k = 0; k < 3; k++) after(k, () => {
    for (const e of around(o.x, o.z, r)) {
      if (tr === 'Purple') { kb(e, 3); slowE(e, Math.min(0.6, 0.1 + 0.02 * n), 3 * G.fd(c.tw)); G.mark(c.tw, 'Frost'); }
      else { G.hit(e, 30 * lvl, c.tw, 'splash'); e.def = Math.max(0, e.def - (5 + n)); }
    }
  });
  return `${tr} track, ${n} towers`;
};
A['Aggressive Toxins'] = (c) => {
  const no = need(c); if (no) return no;
  const r = N(c.L.neuralyzeGrenadeRadius, 3.5), dur = N(c.L.neuralyzeDuration, 7.5) * G.fd(c.tw), pct = N(c.L.damageTakenBonus, 15) / 100;
  const hits = along(c.d!, r); for (const e of hits) { e.neural = now() + dur; e.neuralPct = pct; }
  return `${hits.length} enemies Neuralyzed`;
};
A['Patrol'] = (c) => { const S = st(c.tw), d = c.d ?? G.nearestD(c.tw); S.center = d; S.pd = d; return `patrol at ${d.toFixed(1)} studs`; };
A['FPS'] = (c) => { const S = st(c.tw); if (S.fps) { S.fps = undefined; return 'control returned'; } for (const o of G.M!.towers) if (o.st?.fps === c.owner) o.st.fps = undefined; S.fps = c.owner; return 'you are in control (use the wand to fire)'; };
A['Air-Drop'] = (c) => {
  const no = need(c); if (no) return no;
  const kinds = Object.entries(units).filter(([, u]) => u.tower === 'Mercenary Base' && u.level <= c.tw.lvl).map(([k]) => k), q = Math.max(1, N(c.L.unitQueue, 1));
  if (!kinds.length) return '!No units to drop';
  for (let i = 0; i < q; i++) G.spawnUnit(c.tw, kinds[i % kinds.length], { d: c.d });
  return `${q} units dropped`;
};
A['Reposition'] = (c) => {
  if (!c.at) return '!Look at the spot to leap to';
  const why = G.moveTower(c.tw, c.at.x, c.at.y, c.at.z); if (why) return `!Cannot leap there: ${why}`;
  const reach = c.tw.lvl >= 4 ? 10 : 7.5, base = G.nearestD(c.tw), hits = along(base, reach, false).slice(0, 20);
  for (const e of hits) { G.hit(e, N(c.L.repositionDamage), c.tw, 'splash'); kb(e, 25 * 0.1); }
  return `leapt; ${hits.length} enemies hit`;
};
A['Raise the Dead'] = (c) => {
  const S = st(c.tw), graves = (S.graves as number[] | undefined) ?? []; if (!graves.length) return '!No gravestones yet';
  const per = Math.max(1, N(c.L.gravestoneSpawnCount, 3)); let n = 0;
  for (const g of graves) for (let i = 0; i < per; i++) { G.spawnUnit(c.tw, undefined, { hp: 30 * g, dmg: 5 * g, fr: 1, range: 4, speed: 4, next: i * 0.3 }); n++; }
  S.graves = [];
  return `${n} skeletons from ${graves.length} graves`;
};
A['Hologram Tower'] = (c) => {
  const pickd = c.target ?? towersAround(c.tw, G.eff(c.tw).range).filter((o) => o.name !== 'Hacker' && o.name !== 'Farm').sort((a, b) => b.spent - a.spent)[0];
  if (!pickd || pickd.temp !== undefined) return '!No tower to clone in range';
  const cost = Math.floor(pickd.spent * N(c.L.cloneCost, 25) / 100);
  if ((G.M!.cash[c.owner] ?? 0) < c.a.cost + cost) return `!Need $${c.a.cost + cost}`;
  G.M!.cash[c.owner] -= cost;
  const k = G.cloneTower(pickd, c.owner, now() + N(c.L.hologramLifetime, 25), N(c.L.hologramEv, 0.5));
  return `hologram of #${pickd.id} ${pickd.name} for $${cost} (#${k?.id})`;
};
A['Helicopter Reposition'] = (c) => {
  if (!c.target) return '!Choose a tower to move (target)';
  if (['Farm', 'Pursuit', 'Ace Pilot', 'Gatling Gun'].includes(c.target.name)) return `!${c.target.name} cannot be moved`;
  if (c.target.owner !== c.owner) return '!Only your own towers';
  if (!c.at) return '!Look at the spot to move it to';
  const why = G.moveTower(c.target, c.at.x, c.at.y, c.at.z); if (why) return `!Cannot move there: ${why}`;
  return `#${c.target.id} moved`;
};
A['SWAT Van'] = (c) => {
  const gunner = c.tw.lvl >= 6, name = unitNamed('Enforcer', gunner ? /Gunner/i : /^Swat Van$/i), n = gunner ? 2 : 1;
  for (let i = 0; i < n; i++) { const u = G.spawnUnit(c.tw, name, { next: i * 0.5 }); if (u) u.explode = Math.round(u.max! * 0.5); }
  return `${n} ${name ?? 'Swat Van'}`;
};
A['Bounty'] = (c) => {
  const s = G.eff(c.tw), e = alive().filter((x) => G.canSee(c.tw, x) && G.distTo(c.tw, x) <= s.range).sort((a, b) => b.hp - a.hp)[0];
  if (!e) return '!No enemy in range';
  e.bounty = { tw: c.tw.id, pct: 0.5, cap: 5000 }; st(c.tw).pause = now() + 2;
  return `hit on ${e.name}`;
};
A['Missile'] = (c) => {
  const no = need(c); if (no) return no;
  const n = c.tw.lvl >= 4 ? 4 : 2, p = G.path!.at(c.d!), o = G.origin(c.tw);
  if (Math.hypot(p.x - o.x, p.z - o.z) / stud() > G.eff(c.tw).range * 2) return '!Out of missile range';
  for (let i = 0; i < n; i++) after(0.3 + i * 0.2, () => { for (const e of along(c.d!, 4)) G.hit(e, c.s.dmg * 4, c.tw, 'splash'); });
  return `${n} missiles`;
};
A['Bee Swarm Grenade'] = (c) => {
  const no = need(c); if (no) return no;
  const hits = along(c.d!, 5);
  for (const e of hits) { G.hit(e, N(c.L.grenadeDamage, 100), c.tw, 'true'); for (let k = 0; k < 5; k++) dot(e, c.tw, N(c.L.beeDamage, 1), 1, N(c.L.stingTime, 10), 'sting', N(c.L.stackLimit, 30)); }
  return `${hits.length} enemies stung`;
};
A['Equip Bombs'] = (c) => { const B = ['Fire', 'Ice', 'Poison', 'Confusion'], S = st(c.tw); S.bomb = B[(B.indexOf((S.bomb as string) ?? 'Fire') + 1) % B.length]; return `${S.bomb} bombs`; };
A['Thorns'] = (c) => {
  const no = need(c); if (no) return no;
  const dmg = c.s.dmg || 10, t = now();
  zones.push({ tw: c.tw.id, d: c.d!, r: 5, until: t + 10, dmg, every: 0.5, next: t, slow: 0.25, slowTime: 1, kind: 'thorns' });
  let bond = 0;   // Nature's Bond: Farms in range that touch the track grow thorns at half strength
  for (const f of towersAround(c.tw, G.eff(c.tw).range)) if (f.name === 'Farm' && G.path!.dist(f.x + 0.5, f.z + 0.5) <= G.path!.width / 2 + 3) { zones.push({ tw: c.tw.id, d: G.nearestD(f), r: 2.5, until: t + 10, dmg: dmg / 2, every: 0.5, next: t, slow: 0.125, slowTime: 1, kind: 'thorns' }); bond++; }
  return `thorns${bond ? ` (+${bond} from Farms)` : ''}`;
};
A['Heatwave'] = (c) => {
  const o = G.origin(c.tw), hits = around(o.x, o.z, G.eff(c.tw).range), b = c.s.burn ?? [Math.max(1, c.s.dmg * 0.25), 0.5, 3];
  for (const e of hits) { G.hit(e, c.s.dmg * 3, c.tw, 'splash'); kb(e, 4); dot(e, c.tw, b[0], b[1], b[2], 'burn'); }
  return `${hits.length} enemies`;
};
A['Ice Turret'] = (c) => {
  const no = need(c); if (no) return no;
  G.spawnUnit(c.tw, undefined, { d: c.d, hp: 1e9, dmg: Math.max(1, c.s.dmg), fr: 1, range: 8, stationary: true, speed: 0, collide: false, slow: 0.2, slowTime: 2, freezeEvery: 5, until: now() + 20, detect: { hidden: false, lead: true, flying: true } });
  return 'Ice Turret for 20s';
};
A['Convoy'] = (c) => {
  const n = Math.max(1, N(c.L.railgunTankSpawnCount, 3)), name = Object.keys(units).find((k) => /Railgun Tank/i.test(k));
  for (let i = 0; i < n; i++) G.spawnUnit(c.tw, name, { next: i * 0.5, ...(name ? {} : { hp: 500, dmg: 50, fr: 1, range: 15 }) });
  return `${n} Railgun Tanks`;
};
A["Warrior's Call"] = () => 'no effect (the page says it likely had none)';

// ---------- player control (Gatling Gun's FPS) ----------
/** the wand fires the Gatling Gun a player controls: pierces everything along the view line, sees hidden enemies, ignores range */
export function fpsShoot(p: Player): boolean {
  const M = G.M; if (!M || !G.path) return false;
  const tw = M.towers.find((x) => x.st?.fps === p.name); if (!tw) return false;
  const S = st(tw), s: Stats & { range: number } = G.eff(tw);
  if (M.t < (S.fpsNext ?? 0)) return true;
  S.fpsNext = M.t + (s.fr ?? 0.1);
  const h = p.getHeadLocation(), v = p.getViewDirection(), hits: Enemy[] = [];
  for (const e of alive()) {
    const q = G.epos(e), y = G.path.at(e.d).y + (e.flying ? 2.7 : 0.25), dx = q.x - h.x, dy = y - h.y, dz = q.z - h.z, k = dx * v.x + dy * v.y + dz * v.z;
    if (k < 0) continue;
    if (Math.hypot(h.x + v.x * k - q.x, h.y + v.y * k - y, h.z + v.z * k - q.z) <= 1.2) hits.push(e);
  }
  for (const e of hits) G.hit(e, s.dmg * s.pellets, tw);
  G.log('fps_shot', { id: tw.id, hits: hits.length });
  return true;
}
/** what an ability needs from the player: a spot on the map, a tower, or nothing */
export const abilityNeeds = (title: string): 'spot' | 'tower' | 'tower+spot' | 'none' =>
  ['Aggressive Toxins', 'Patrol', 'Air-Drop', 'Reposition', 'Missile', 'Bee Swarm Grenade', 'Thorns', 'Ice Turret'].includes(title) ? 'spot' : title === 'Helicopter Reposition' ? 'tower+spot' : title === 'Hologram Tower' ? 'tower' : 'none';
