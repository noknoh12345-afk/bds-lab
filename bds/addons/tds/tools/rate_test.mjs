// node tools/rate_test.mjs [seeds]: how the land score (src/road.ts rate) spreads over made-up lands, so the stars mean something:
// a flat world's lands (synthLand, as an expedition builds them) and the road tests' hills, steep hills and river.
// Prints the spread of each part and of the stars; fails if a land gets no route, or if ★5 is common or ★1 the rule.
import { planSteps, appraise, synthLand, valueNoise, rng, starsOf, landValue } from '../src/road.ts';

const N = Number(process.argv[2] ?? 200), R = 40, S = 2 * R + 1;
const lands = [];
for (let s = 1; s <= N; s++) {
  const seed = (s * 7919) % 1000000, L = synthLand(seed, R);
  const at = (x, z) => (Math.max(-R, Math.min(R, x)) + R) * S + (Math.max(-R, Math.min(R, z)) + R);
  lands.push({ kind: 'flat world', seed, t: { r: R, ground: (x, z) => L.H[at(x, z)], water: (x, z) => L.wet[at(x, z)] === 1, blocked: (x, z) => Math.abs(x) > R || Math.abs(z) > R } });
}
for (let s = 1; s <= Math.ceil(N / 4); s++) {
  const h = valueNoise(s * 31, 9, 12), k = valueNoise(s * 31 + 7, 6, 1), g = valueNoise(s * 17, 14, 7), ph = rng(s)() * 6;
  const wet = (x, z) => Math.abs(z - 8 * Math.sin(x / 9 + ph) - 14) < 1.5;
  lands.push({ kind: 'steep', seed: s, t: { r: R, ground: (x, z) => Math.round(h(x + 100, z + 100) + (k(x + 50, z + 50) > 0.75 ? 4 : 0)), water: () => false, blocked: () => false } });
  lands.push({ kind: 'hills', seed: s, t: { r: R, ground: (x, z) => Math.round(g(x + 100, z + 100)), water: () => false, blocked: () => false } });
  lands.push({ kind: 'river', seed: s, t: { r: R, ground: (x, z) => (wet(x, z) ? 0 : Math.round(g(x + 10, z + 10) * 0.7) + 1), water: wet, blocked: () => false } });
}
const rows = [], none = [];
for (const l of lands) {
  const out = { best: null };
  for (const _ of planSteps(l.t, l.seed, 60, 6, out)) { /* all at once */ }
  if (!out.best) for (const _ of planSteps(l.t, l.seed + 1, 120, 10, out)) { /* a taller raised road */ }
  if (!out.best) { none.push(`${l.kind} ${l.seed}`); continue; }
  const a = appraise(l.t, out.best, l.seed);
  rows.push({ kind: l.kind, rocks: a.rocks.length, ...a.rate });
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const spread = (f) => { const a = rows.map(f); return `min ${Math.min(...a)} p25 ${q(a, 0.25)} p50 ${q(a, 0.5)} p75 ${q(a, 0.75)} max ${Math.max(...a)}`; };
console.log(`${rows.length} lands with a road (${none.length} without: ${none.slice(0, 5).join(', ')})`);
console.log(`keys    ${spread((r) => r.keys)}`);
console.log(`heights ${spread((r) => r.heights)}`);
console.log(`footing ${spread((r) => r.footing)}`);
console.log(`cliffs  ${spread((r) => r.cliffs)}`);
console.log(`rocks   ${spread((r) => r.rocks)}`);
console.log(`value   ${spread((r) => +landValue(r.keys, r.heights, r.footing).toFixed(2))}  (p10 ${q(rows.map((r) => +landValue(r.keys, r.heights, r.footing).toFixed(2)), 0.1)} p90 ${q(rows.map((r) => +landValue(r.keys, r.heights, r.footing).toFixed(2)), 0.9)})`);
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(rows));
const stars = [1, 2, 3, 4, 5].map((k) => rows.filter((r) => r.stars === k).length);
console.log(`stars   ${stars.map((c, i) => `★${i + 1} ${Math.round((100 * c) / rows.length)}%`).join('  ')}`);
for (const kind of [...new Set(rows.map((r) => r.kind))]) {
  const k = rows.filter((r) => r.kind === kind), avg = (k.reduce((a, r) => a + r.stars, 0) / k.length).toFixed(2);
  console.log(`  ${kind}: ${k.length} lands, ★ average ${avg}`);
}
const bad = [];
if (none.length > lands.length * 0.05) bad.push(`${none.length} lands without a road`);
if (stars[4] > rows.length * 0.12) bad.push('★5 too common');
if (stars[0] > rows.length * 0.35) bad.push('★1 the rule');
if (starsOf(0, 0, 0) !== 1) bad.push('an empty land is not ★1');
console.log(bad.length ? `FAIL ${bad.join(', ')}` : 'PASS');
process.exit(bad.length ? 1 : 0);
