// The expedition's road, planned from a height map (pure: no @minecraft import, so node runs it: tools/road_test.mjs).
//
// The road is made of stair blocks only. Two rows run back to back along the way, their high halves facing the middle, so the
// two upper halves make a one-block top on the seam between them; enemies walk across that top. The centre line runs on the
// block grid's lines (integer coordinates) and every step of it is one block along x or z. The stairs stand on the ground, so
// the top is one block above the land beside it. Height changes are one block at a time, on a segment whose two stairs face
// the way up (half a block, then the other half); corners use the stairs' own corner shapes: the cell inside the turn becomes
// an inner corner (its front neighbour is a perpendicular stair) and one more cell outside the turn an outer corner.
//
// The way: from the entrance gate straight in to a square ring around the camp, along the ring most of the way round, then
// straight out to the exit gate (the original's base). Its length is the original Grass Isle's: 170 studs = 85 blocks.

/** weirdo_direction: the side a stair's high half faces (0 east, 1 west, 2 south, 3 north) */
export type Dir = 0 | 1 | 2 | 3;
export type Cell = { x: number; z: number; y: number; dir: Dir; slope?: boolean; corner?: 'inner' | 'outer'; water?: boolean; seg: number };
export type Terrain = {
  /** half the size of the area the height map covers (local coordinates -r..r) */
  r: number;
  /** the y of the top ground block of a column (the water surface where there is water) */
  ground(x: number, z: number): number;
  water(x: number, z: number): boolean;
  /** lava, buildings: the road may not go there */
  blocked(x: number, z: number): boolean;
};
export type Route = {
  /** the centre line: lattice points from the entrance to the exit (local coordinates) */
  pts: [number, number][];
  /** the y of the stair blocks of each segment (pts[k] → pts[k+1]) */
  h: number[];
  /** the y of the walking surface at each lattice point */
  J: number[];
  cells: Cell[];
  /** length in blocks (horizontal; = studs ÷ 2) */
  len: number; steps: number; bridges: number; maxFill: number; corners: number; ring: number;
};

export const LENGTH = 85;
const STEP_EVERY = 2;   // a height change may come every other joint at most: gentle climbs, and no segment is both a step up and a step down

/** a small seeded random generator (mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** smooth value noise in 0..amp (lattice every `scale` blocks): the made-up land of a flat world (src/site.ts) and the tests */
export function valueNoise(seed: number, scale: number, amp: number) {
  const r = rng(seed), g = new Map<string, number>();
  const at = (i: number, j: number) => { const k = `${i},${j}`; let v = g.get(k); if (v === undefined) { v = r(); g.set(k, v); } return v; };
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, z: number) => {
    const fx = x / scale, fz = z / scale, i = Math.floor(fx), j = Math.floor(fz), u = s(fx - i), v = s(fz - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
  };
}

const dirOf = (dx: number, dz: number): Dir => (dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 2 : 3);
const opposite = (d: Dir): Dir => ([1, 0, 3, 2] as Dir[])[d];

/** the centre line for one choice of ring size, entrance side and offset, turning direction and radial lengths (null: does not fit) */
export function shape(r: number, side: number, off: number, cw: boolean, l1: number, l2: number, area: number): [number, number][] | null {
  const A = LENGTH - l1 - l2;
  if (A < 2 * r || A > 8 * r - 6) return null;
  const n: [number, number] = ([[0, -1], [1, 0], [0, 1], [-1, 0]] as [number, number][])[side];
  const j0: [number, number] = n[0] === 0 ? [off, n[1] * r] : [n[0] * r, off];
  const pts: [number, number][] = [];
  for (let k = l1; k > 0; k--) pts.push([j0[0] + n[0] * k, j0[1] + n[1] * k]);
  let p: [number, number] = [j0[0], j0[1]], d: [number, number] = cw ? [-n[1], n[0]] : [n[1], -n[0]];
  pts.push([p[0], p[1]]);
  for (let s = 0; s < A; s++) {
    let q: [number, number] = [p[0] + d[0], p[1] + d[1]];
    if (Math.abs(q[0]) > r || Math.abs(q[1]) > r) { d = cw ? [-d[1], d[0]] : [d[1], -d[0]]; q = [p[0] + d[0], p[1] + d[1]]; }
    p = q; pts.push([p[0], p[1]]);
  }
  // the exit leaves the ring straight out from the side it is on, not from a corner
  const onX = Math.abs(p[0]) === r, onZ = Math.abs(p[1]) === r;
  if (onX === onZ) return null;
  const lat = onX ? p[1] : p[0]; if (Math.abs(lat) > r - 3) return null;
  const o: [number, number] = onX ? [Math.sign(p[0]), 0] : [0, Math.sign(p[1])];
  for (let k = 1; k <= l2; k++) pts.push([p[0] + o[0] * k, p[1] + o[1] * k]);
  // inside the area (room for the gates), and parts of the road far apart along it are 5+ blocks apart on the ground
  if (pts.some(([x, z]) => Math.abs(x) > area - 6 || Math.abs(z) > area - 6)) return null;
  for (let i = 0; i < pts.length; i++) for (let j = i + 10; j < pts.length; j++) if (Math.max(Math.abs(pts[i][0] - pts[j][0]), Math.abs(pts[i][1] - pts[j][1])) < 5) return null;
  return pts;
}

/** the two cells beside a segment and the way their high halves face (towards the seam) */
function sides(a: [number, number], b: [number, number]): [number, number, Dir][] {
  if (a[1] === b[1]) { const x0 = Math.min(a[0], b[0]), Z = a[1]; return [[x0, Z - 1, 2], [x0, Z, 3]]; }
  const z0 = Math.min(a[1], b[1]), X = a[0]; return [[X - 1, z0, 0], [X, z0, 1]];
}

/** heights, cells and measures for a centre line on a terrain (null: crosses blocked ground, too much water or too high a fill) */
export function build(pts: [number, number][], t: Terrain, fillMax = 6): Route | null {
  const n = pts.length - 1, segs = [...Array(n).keys()];
  const dirs = segs.map((k) => [pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]] as [number, number]);
  const corner = pts.map((_, i) => i > 0 && i < n && (dirs[i - 1][0] !== dirs[i][0] || dirs[i - 1][1] !== dirs[i][1]));
  // the wanted stair height of each segment: on the higher of its two cells' ground
  const want = segs.map((k) => Math.max(...sides(pts[k], pts[k + 1]).map(([x, z]) => t.ground(x, z))) + 1);
  if (segs.some((k) => sides(pts[k], pts[k + 1]).some(([x, z]) => t.blocked(x, z)))) return null;
  // joints where the height may change: every other one, never at or beside a corner, nor at the gates
  const can = segs.slice(0, -1).map((k) => k % STEP_EVERY === 0 && k > 1 && k < n - 3 && !corner[k] && !corner[k + 1] && !corner[k + 2]);
  // the lowest heights at or above the wanted ones with those limits (the road is raised over dips, never cut into the ground)
  // (P: how many joints that may change come before each segment, so the allowed change between two segments is |P[k] - P[j]|)
  const P = [0]; for (let i = 0; i < n - 1; i++) P.push(P[i] + (can[i] ? 1 : 0));
  const h = segs.map((k) => { let m = -Infinity; for (let j = 0; j < n; j++) m = Math.max(m, want[j] - Math.abs(P[k] - P[j])); return m; });
  const maxFill = Math.max(...segs.map((k) => h[k] - want[k]));
  if (maxFill > fillMax) return null;
  // the walking surface at each lattice point
  const J = pts.map((_, i) => (i === 0 ? h[0] + 1 : i === n ? h[n - 1] + 1 : h[i] > h[i - 1] ? h[i - 1] + 1 : h[i] + 1));
  // the cells: the segment's own first (a corner's shared cell keeps the way in's facing: it becomes the inner corner)
  const cells = new Map<string, Cell>();
  const put = (c: Cell) => { const key = `${c.x},${c.z}`; if (!cells.has(key)) cells.set(key, c); };
  let steps = 0;
  for (const k of segs) {
    const up = k > 0 && h[k] > h[k - 1], down = k < n - 1 && h[k + 1] < h[k];
    if (up || down) steps++;
    const face = up ? dirOf(dirs[k][0], dirs[k][1]) : down ? opposite(dirOf(dirs[k][0], dirs[k][1])) : null;
    for (const [x, z, d] of sides(pts[k], pts[k + 1])) put({ x, z, y: h[k], dir: face ?? d, ...(face !== null && { slope: true }), ...(t.water(x, z) && { water: true }), seg: k });
  }
  let corners = 0;
  for (let i = 1; i < n; i++) {
    if (!corner[i]) continue; corners++;
    const d1 = dirs[i - 1], d2 = dirs[i], P = pts[i];
    const qx = d1[0] - d2[0], qz = d1[1] - d2[1];   // the quadrant outside the turn
    const x = P[0] + (qx > 0 ? 0 : -1), z = P[1] + (qz > 0 ? 0 : -1);
    put({ x, z, y: h[i], dir: dirOf(d2[0], d2[1]), corner: 'outer', ...(t.water(x, z) && { water: true }), seg: i });
    const inner = sides(pts[i - 1], P).find(([cx, cz]) => sides(P, pts[i + 1]).some(([ex, ez]) => ex === cx && ez === cz));
    if (inner) { const c = cells.get(`${inner[0]},${inner[1]}`); if (c) c.corner = 'inner'; }
  }
  // water: runs of segments over water are bridges; at most two, none longer than 12 blocks
  let bridges = 0, run = 0, longest = 0;
  for (const k of segs) { const wet = sides(pts[k], pts[k + 1]).some(([x, z]) => t.water(x, z)); if (wet) { if (!run) bridges++; run++; longest = Math.max(longest, run); } else run = 0; }
  if (bridges > 2 || longest > 12) return null;
  return { pts, h, J, cells: [...cells.values()], len: n, steps, bridges, maxFill, corners, ring: 0 };
}

/** the best of many random layouts for this terrain (null: none fits) */
export function plan(t: Terrain, seed: number, tries = 60, fillMax = 6): Route | null {
  const out: { best: Route | null } = { best: null };
  for (const _ of planSteps(t, seed, tries, fillMax, out)) { /* all at once (node, tests) */ }
  return out.best;
}
/** the same, one layout per step (the game runs it as a job, so a long search never holds a tick) */
export function* planSteps(t: Terrain, seed: number, tries: number, fillMax: number, out: { best: Route | null }): Generator<void, void, void> {
  const rnd = rng(seed); let best: Route | null = out.best, bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    yield;
    const r = 9 + Math.floor(rnd() * 4), side = Math.floor(rnd() * 4), off = Math.round((rnd() * 2 - 1) * (r - 4)), cw = rnd() < 0.5;
    const l1 = 7 + Math.floor(rnd() * 7), l2 = 7 + Math.floor(rnd() * 7);
    const pts = shape(r, side, off, cw, l1, l2, t.r); if (!pts) continue;
    const rt = build(pts, t, fillMax); if (!rt) continue;
    rt.ring = r;
    // a lively road: a few climbs, few bridges, little raised road, and a ring close to the camp
    const score = Math.min(rt.steps, 8) * 1.0 - rt.bridges * 1.5 - rt.maxFill * 0.6 - (r - 9) * 0.4 + rnd() * 0.5;
    if (score > bestScore) { bestScore = score; best = rt; out.best = rt; }
  }
}

/** checks a route keeps the rules (the tests and the build use it): length, one step at a time, stairs only, no gaps on the top */
export function check(rt: Route): string[] {
  const bad: string[] = [];
  if (rt.len < 82 || rt.len > 88) bad.push(`length ${rt.len}`);
  for (let k = 1; k < rt.h.length; k++) if (Math.abs(rt.h[k] - rt.h[k - 1]) > 1) bad.push(`step ${k}`);
  for (let i = 1; i < rt.pts.length; i++) if (Math.abs(rt.pts[i][0] - rt.pts[i - 1][0]) + Math.abs(rt.pts[i][1] - rt.pts[i - 1][1]) !== 1) bad.push(`gap ${i}`);
  for (let i = 1; i < rt.J.length; i++) if (Math.abs(rt.J[i] - rt.J[i - 1]) > 1) bad.push(`walk ${i}`);
  const seen = new Set<string>(); for (const c of rt.cells) { const k = `${c.x},${c.z}`; if (seen.has(k)) bad.push(`cell ${k}`); seen.add(k); }
  return bad;
}
