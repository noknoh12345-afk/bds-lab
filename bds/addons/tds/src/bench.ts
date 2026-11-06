// Headless measurements on the real engine code: a tower against a stationary dummy, simulated time.
import { towers, stats, maxLevel, DEFAULT_MAP } from './defs';
import * as G from './game';

export type BenchRow = { name: string; lvl: number; measured: number; expected: number; err: number; inRange: boolean; outRange: boolean };

/** Expected sustained single-target DPS from the wiki row (Damage ÷ Firerate, with bursts and reloads). */
export function expected(name: string, lvl: number) {
  const s = stats(name, lvl); if (!s.fr || !s.dmg) return 0;
  let shots = 1, time = s.fr;
  if (s.burst && s.burst > 1) { shots = s.burst; time = s.fr * s.burst + (s.burstCd ?? 0); }
  if (s.ammo && s.reload) { const k = s.ammo; const cyc = (time / shots) * k + s.reload; return (s.dmg * s.pellets * k) / cyc; }
  return (s.dmg * s.pellets * shots) / time;
}

export function bench(name: string, lvl: number, T0 = 60): BenchRow | undefined {
  const s = stats(name, lvl); if (!s.fr || !s.dmg || !s.range) return;
  const T = Math.min(400, Math.max(T0, (s.fr * (s.burst ?? 1) + (s.burstCd ?? 0) + (s.reload ?? 0)) * 25));
  const saved = G.M;
  const run = (dist: number) => {
    const m: G.Match = { mode: 'Easy', map: DEFAULT_MAP, players: ['bench'], cash: { bench: 0 }, baseHP: 1, maxHP: 1, wave: 1, t: 0, waveEnd: Infinity, skipAt: Infinity, queue: [], enemies: [], towers: [], units: [], seq: 1, votes: [], stats: { kills: 0, leaks: 0, dealt: 0, income: 0 }, clearPaid: true, leakedThisWave: false, seed: 1 };
    setM(m);
    const p = G.path!.at(G.path!.len * 0.5); // mid-path; place the tower `dist` studs to the side
    const tw: G.Tower = { id: 1e9, name, lvl, x: Math.floor(p.x), y: 0, z: Math.floor(p.z - dist * G.path!.stud) - 0, owner: 'bench', target: 'First', next: 0, burstLeft: 0, ammoLeft: 0, shots: 0, spent: 0, dealt: 0, nextUnit: Infinity, primary: 0 };
    tw.z = p.z - 0.5 - dist * G.path!.stud; tw.x = p.x - 0.5;
    m.towers.push(tw);
    m.enemies.push({ id: 1e9 + 1, name: 'Dummy', d: G.path!.len * 0.5, hp: 1e12, max: 1e12, shield: 0, speed: 0, def: 0, cash: 0, paid: 0, hidden: false, flying: false, lead: false, boss: true, immune: ['Stun', 'Freeze', 'Slowed', 'Burn'], mods: [], slow: 0, slowUntil: 0, freezeUntil: 0, stunUntil: 0, dots: [], wave: 1 });
    G.simulate(T);
    return tw.primary;
  };
  try {
    const d = run(s.range * 0.9) / T, out = run(s.range + 1) > 0, e = expected(name, lvl);
    return { name, lvl, measured: +d.toFixed(3), expected: +e.toFixed(3), err: e ? +(Math.abs(d - e) / e).toFixed(4) : 0, inRange: d > 0, outRange: out };
  } finally { setM(saved); }
}
function setM(m: G.Match | undefined) { G.__setM(m); }

export function benchAll(T = 60) {
  const rows: BenchRow[] = [];
  for (const n of Object.keys(towers)) for (let l = 0; l <= maxLevel(n); l++) { const r = bench(n, l, T); if (r) rows.push(r); }
  return rows;
}
