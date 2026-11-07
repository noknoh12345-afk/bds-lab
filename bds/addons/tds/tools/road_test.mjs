// node tools/road_test.mjs [seeds]: plans the expedition road (src/road.ts, pure) on many made-up terrains and checks its rules:
// 170 studs (85 blocks ±3), one step at a time, no gaps, stairs only (one cell each), segments far apart, few bridges.
// Terrains: flat, rolling hills, steep hills with rocks, a river across. Node strips the TypeScript types itself (22.18+).
import { plan, check, rng } from '../src/road.ts';

const N = Number(process.argv[2] ?? 50);
function noise(seed, scale, amp) {
  const r = rng(seed), g = new Map();
  const at = (i, j) => { const k = `${i},${j}`; if (!g.has(k)) g.set(k, r()); return g.get(k); };
  const s = (t) => t * t * (3 - 2 * t);
  return (x, z) => { const fx = x / scale, fz = z / scale, i = Math.floor(fx), j = Math.floor(fz), u = s(fx - i), v = s(fz - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1); return amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v); };
}
const kinds = {
  flat: () => ({ ground: () => 0, water: () => false }),
  hills: (s) => { const h = noise(s, 14, 7); return { ground: (x, z) => Math.round(h(x + 100, z + 100)), water: () => false }; },
  steep: (s) => { const h = noise(s, 9, 12), k = noise(s + 7, 6, 1); return { ground: (x, z) => Math.round(h(x + 100, z + 100) + (k(x + 50, z + 50) > 0.75 ? 4 : 0)), water: () => false }; },
  river: (s) => { const h = noise(s, 14, 5), ph = rng(s)() * 6; const wet = (x, z) => Math.abs(z - 8 * Math.sin(x / 9 + ph) - 14) < 1.5; return { ground: (x, z) => (wet(x, z) ? 0 : Math.round(h(x + 100, z + 100)) + 1), water: wet }; },
};
let fails = 0; const stats = [];
for (const [kind, mk] of Object.entries(kinds)) {
  let ok = 0;
  for (let s = 1; s <= N; s++) {
    const t = { r: 40, blocked: () => false, ...mk(s * 7919) };
    const rt = plan(t, s);
    if (!rt) { console.log(`${kind} seed ${s}: no route`); fails++; continue; }
    const bad = check(rt); if (bad.length) { console.log(`${kind} seed ${s}: ${bad.slice(0, 5).join(', ')}`); fails++; continue; }
    ok++; stats.push({ kind, len: rt.len, steps: rt.steps, bridges: rt.bridges, fill: rt.maxFill, corners: rt.corners, cells: rt.cells.length });
  }
  const st = stats.filter((x) => x.kind === kind), rangeOf = (f) => st.length ? `${Math.min(...st.map(f))}-${Math.max(...st.map(f))}` : '-';
  console.log(`${kind}: ${ok}/${N} routes; steps ${rangeOf((x) => x.steps)}, bridges ${rangeOf((x) => x.bridges)}, fill ${rangeOf((x) => x.fill)}, corners ${rangeOf((x) => x.corners)}, cells ${rangeOf((x) => x.cells)}`);
}
console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exit(fails ? 1 : 0);
