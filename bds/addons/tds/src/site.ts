// Expeditions (the user's request: no built maps). Every match from the lobby goes somewhere new, far out in the world, and is
// fought on the land as it is there: hills, woods, rivers, rocks. Only four things are built: the road, the entrance gate (the
// enemies come out of it), the exit gate (the original's base: an enemy that reaches it takes base health) and a camp in the
// middle, where the players arrive and the road turns around. The road is made of stair blocks only (src/road.ts plans it):
// two rows back to back, enemies cross the one-block top they make. A flat world has no land to use, so a seeded one is made
// there first (hills, rocks, a stream, trees, flowers). The numbers of the game stay the original's: the road is 170 studs.
import { world, system, Player, BlockPermutation, Vector3, CatmullRomSpline, InputButton, ButtonState } from '@minecraft/server';
import * as G from './game';
import { maps, modes, MODE_NAMES, SiteDef } from './defs';
import { plan, Route, Dir, rng, valueNoise } from './road';
import { cmd, cmdAny, give } from './kit';

const AREA = 40, CAMP = 4, AREA_ID = 'tds_site';
const dim = () => world.getDimension('overworld');
const sleep = (t: number) => new Promise<void>((r) => system.runTimeout(() => r(), t));
function job(gen: Generator<void, void, void>): Promise<void> {
  return new Promise((res, rej) => { system.runJob((function* () { try { yield* gen; res(); } catch (e) { rej(e); } })()); });
}

// ---------- looks by mode (a region of its own for each) ----------
type Theme = { road: string; inP: string; inL: string; outP: string; outL: string; light: string };
const THEMES: Record<string, Theme> = {
  Easy: { road: 'mossy_cobblestone_stairs', inP: 'mossy_stone_bricks', inL: 'stone_bricks', outP: 'oak_log', outL: 'spruce_planks', light: 'lantern' },
  Casual: { road: 'stone_stairs', inP: 'birch_log', inL: 'birch_planks', outP: 'oak_log', outL: 'oak_planks', light: 'lantern' },
  Intermediate: { road: 'stone_brick_stairs', inP: 'stone_bricks', inL: 'chiseled_stone_bricks', outP: 'spruce_log', outL: 'spruce_planks', light: 'lantern' },
  Molten: { road: 'red_sandstone_stairs', inP: 'nether_brick', inL: 'red_nether_brick', outP: 'blackstone', outL: 'polished_blackstone_bricks', light: 'lantern' },
  Fallen: { road: 'deepslate_brick_stairs', inP: 'cracked_deepslate_bricks', inL: 'deepslate_bricks', outP: 'dark_oak_log', outL: 'dark_oak_planks', light: 'soul_lantern' },
  Frost: { road: 'polished_diorite_stairs', inP: 'packed_ice', inL: 'blue_ice', outP: 'spruce_log', outL: 'snow', light: 'lantern' },
  Voidcore: { road: 'polished_blackstone_brick_stairs', inP: 'obsidian', inL: 'crying_obsidian', outP: 'polished_blackstone', outL: 'polished_blackstone_bricks', light: 'soul_lantern' },
  Hardcore: { road: 'cobbled_deepslate_stairs', inP: 'polished_deepslate', inL: 'deepslate_tiles', outP: 'dark_oak_log', outL: 'dark_oak_planks', light: 'soul_lantern' },
};
const themeOf = (mode: string) => THEMES[mode] ?? THEMES.Intermediate;
const BRIDGE = 'spruce_stairs';
const NOUNS: [RegExp, string][] = [[/birch/, 'birch'], [/taiga|spruce|pine/, 'taiga'], [/snow|ice|frozen|grove|cold/, 'snow'], [/desert/, 'desert'], [/mesa|badlands/, 'badlands'],
  [/savanna/, 'savanna'], [/swamp|mangrove/, 'swamp'], [/jungle|bamboo/, 'jungle'], [/peak|mountain|hills|slopes|windswept|stony/, 'peaks'], [/forest|roofed|dark/, 'forest'], [/plains|meadow|sunflower|flower/, 'plains']];

// ---------- blocks ----------
const perms = new Map<string, BlockPermutation | null>();
function pm(id: string, st?: Record<string, string | number | boolean>): BlockPermutation | null {
  const k = id + (st ? JSON.stringify(st) : ''); if (perms.has(k)) return perms.get(k)!;
  let p: BlockPermutation | null = null; try { p = BlockPermutation.resolve(id.includes(':') ? id : `minecraft:${id}`, st); } catch { p = null; }
  perms.set(k, p); return p;
}
function put(x: number, y: number, z: number, id: string, st?: Record<string, string | number | boolean>, fb?: string): boolean {
  const p = pm(id, st) ?? (fb ? pm(fb, st) : null); if (!p) return false;
  try { dim().setBlockPermutation({ x, y, z }, p); return true; } catch { return false; }
}
const stair = (x: number, y: number, z: number, id: string, dir: Dir, up = false) => put(x, y, z, id, { weirdo_direction: dir, upside_down_bit: up }, 'stone_brick_stairs');
function fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: string) {
  if (y1 < y0) return; try { dim().runCommand(`fill ${x0} ${y0} ${z0} ${x1} ${y1} ${z1} ${id}`); } catch { /* unloaded or a bad id */ }
}

// ---------- the land: one height per column (the water surface where there is water) ----------
const SOFT = /leaves|_log$|log$|_wood$|stem$|grass$|fern|flower|tulip|dandelion|poppy|orchid|allium|bluet|oxeye|cornflower|lily|bush|vine|mushroom|snow_layer|sapling|bamboo|reeds|cane|cactus|dripleaf|azalea|carpet|lichen|petals|leaf_litter|pumpkin|melon|berry|roots$|pitcher|cocoa|cobweb|propagule/;
const MADE = /planks|glass|_bed$|door|fence|hay_block|cobblestone$|torch|lantern|bell|crafting_table|furnace|chest|wool|bookshelf|brick/;
const NATURAL = /grass_block|dirt|podzol|mycelium|moss_block|mud|sand|gravel|snow|stone|andesite|diorite|granite|deepslate|tuff|calcite|terracotta|ice|clay|netherrack|blackstone|basalt|dripstone/;
type Col = { g: number; w: boolean; lava: boolean; made: boolean; top: string };
function column(x: number, z: number): Col | null {
  let b; try { b = dim().getTopmostBlock({ x, z }); } catch { return null; }
  for (let i = 0; i < 48 && b && SOFT.test(b.typeId); i++) b = b.below();
  if (!b) return null;
  return { g: b.y, w: /water/.test(b.typeId), lava: /lava/.test(b.typeId), made: MADE.test(b.typeId), top: b.typeId };
}
class HMap {
  s = 2 * AREA + 1; g = new Int16Array(this.s * this.s); w = new Uint8Array(this.s * this.s); bad = new Uint8Array(this.s * this.s);
  i(x: number, z: number) { const c = (v: number) => Math.max(-AREA, Math.min(AREA, v)) + AREA; return c(x) * this.s + c(z); }
  get(x: number, z: number) { return this.g[this.i(x, z)]; }
  wet(x: number, z: number) { return this.w[this.i(x, z)] === 1; }
  blocked(x: number, z: number) { return this.bad[this.i(x, z)] === 1 || Math.abs(x) > AREA || Math.abs(z) > AREA; }
}
type Scan = { made: number; lava: number; water: number; min: number; max: number; grass: number; cols: number };
function* scan(cx: number, cz: number, hm: HMap, st: Scan): Generator<void, void, void> {
  for (let x = -AREA; x <= AREA; x++) {
    for (let z = -AREA; z <= AREA; z++) {
      const c = column(cx + x, cz + z), i = hm.i(x, z); st.cols++;
      if (!c) { hm.bad[i] = 1; continue; }
      hm.g[i] = c.g; hm.w[i] = c.w ? 1 : 0; if (c.lava || c.made) hm.bad[i] = 1;
      if (c.made) st.made++; if (c.lava) st.lava++; if (c.w) st.water++; if (c.top === 'minecraft:grass_block') st.grass++;
      st.min = Math.min(st.min, c.g); st.max = Math.max(st.max, c.g);
    }
    yield;
  }
}

// ---------- a flat world: hills, rocks, a stream, trees and flowers, all from the seed ----------
const FEATURES = ['minecraft:oak_tree_feature', 'minecraft:birch_tree_feature'];
function tree(x: number, y: number, z: number, r: () => number) {
  if (r() < 0.5) for (const f of FEATURES) { try { if (dim().placeFeature(f, { x, y, z }, false)) return; } catch { /* no such feature here */ } }
  const h = 4 + Math.floor(r() * 2), wood = r() < 0.6 ? 'oak' : 'birch';
  fill(x - 2, y + h - 2, z - 2, x + 2, y + h - 1, z + 2, `${wood}_leaves`); fill(x - 1, y + h, z - 1, x + 1, y + h, z + 1, `${wood}_leaves`);
  fill(x, y, z, x, y + h - 1, z, `${wood}_log`);
}
function* synth(cx: number, cz: number, g0: number, hm: HMap, seed: number): Generator<void, void, void> {
  const hill = valueNoise(seed, 16, 8), rock = valueNoise(seed + 3, 7, 1), r = rng(seed + 5), ph = r() * 6.28, alongX = r() < 0.5, off = Math.floor(r() * 30) - 15;
  const bank = (x: number, z: number) => { const a = alongX ? x : z, b = alongX ? z : x; return Math.abs(b - (7 * Math.sin(a / 10 + ph) + off)); };
  for (let x = -AREA; x <= AREA; x++) {
    for (let z = -AREA; z <= AREA; z++) {
      const i = hm.i(x, z), bk = bank(x, z), camp = Math.max(Math.abs(x), Math.abs(z)) <= CAMP + 2;
      let H = Math.max(0, Math.min(6, Math.round(hill(x + 200, z + 200) - 2.2)));
      if (bk < 3.5 || camp) H = 0;
      const wet = bk < 1.5 && !camp, isRock = !wet && bk >= 3.5 && !camp && rock(x + 300, z + 300) > 0.8;
      if (isRock) H += 3;
      hm.g[i] = g0 + H; hm.w[i] = wet ? 1 : 0;
      const X = cx + x, Z = cz + z;
      if (wet) fill(X, g0 - 1, Z, X, g0, Z, 'water');
      else if (H > 0) { fill(X, g0, Z, X, g0 + H - 1, Z, isRock ? 'stone' : 'dirt'); put(X, g0 + H, Z, isRock ? (H > 4 ? 'moss_block' : 'andesite') : 'grass_block'); }
    }
    yield;
  }
  for (let k = 0; k < 34; k++) {   // trees, not by the stream nor in the camp
    const x = Math.floor((r() * 2 - 1) * (AREA - 3)), z = Math.floor((r() * 2 - 1) * (AREA - 3));
    if (Math.max(Math.abs(x), Math.abs(z)) <= CAMP + 3 || bank(x, z) < 4 || hm.get(x, z) - g0 > 4) continue;
    tree(cx + x, hm.get(x, z) + 1, cz + z, r); if (k % 4 === 0) yield;
  }
  const FLOWERS = ['poppy', 'dandelion', 'cornflower', 'azure_bluet', 'short_grass', 'short_grass', 'short_grass'];
  for (let k = 0; k < 160; k++) {
    const x = Math.floor((r() * 2 - 1) * AREA), z = Math.floor((r() * 2 - 1) * AREA);
    if (hm.wet(x, z) || Math.max(Math.abs(x), Math.abs(z)) <= CAMP) continue;
    const y = hm.get(x, z) + 1; if (dim().getBlock({ x: cx + x, y: y - 1, z: cz + z })?.typeId === 'minecraft:grass_block') put(cx + x, y, cz + z, FLOWERS[Math.floor(r() * FLOWERS.length)]);
  }
}

// ---------- building: the camp, the road, the gates, lanterns along the way ----------
function* buildCamp(cx: number, cy: number, cz: number, hm: HMap): Generator<void, void, void> {
  for (let x = -CAMP; x <= CAMP; x++) for (let z = -CAMP; z <= CAMP; z++) {
    const X = cx + x, Z = cz + z, g = hm.get(x, z);
    fill(X, cy + 1, Z, X, cy + 12, Z, 'air');
    if (g < cy) fill(X, g + 1, Z, X, cy - 1, Z, 'dirt');
    put(X, cy, Z, 'grass_block');
  }
  yield;
  const at = (x: number, z: number, id: string, st?: Record<string, string | number | boolean>) => put(cx + x, cy + 1, cz + z, id, st);
  at(0, 0, 'campfire');
  at(2, 0, 'spruce_stairs', { weirdo_direction: 0, upside_down_bit: false }); at(-2, 0, 'spruce_stairs', { weirdo_direction: 1, upside_down_bit: false });
  at(0, 2, 'spruce_stairs', { weirdo_direction: 2, upside_down_bit: false }); at(0, -2, 'spruce_stairs', { weirdo_direction: 3, upside_down_bit: false });
  at(3, -3, 'bell', { attachment: 'standing', direction: 0 }); at(-3, -3, 'lectern'); at(3, 3, 'chest'); at(-3, 3, 'barrel'); at(-3, 2, 'crafting_table');
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { at(x, z, 'oak_fence'); put(cx + x, cy + 2, cz + z, 'lantern'); }
  for (const [x, z] of [[0, 3], [0, -3]]) { fill(cx + x - 1, cy + 1, cz + z, cx + x + 1, cy + 1, cz + z, 'white_wool'); put(cx + x, cy + 2, cz + z, 'white_wool'); }   // two small tents
}
function* buildRoad(cx: number, cz: number, rt: Route, hm: HMap, th: Theme): Generator<void, void, void> {
  const cells = [...rt.cells].sort((a, b) => a.seg - b.seg);
  for (const c of cells) {
    const X = cx + c.x, Z = cz + c.z, g = hm.get(c.x, c.z), id = c.water ? BRIDGE : th.road;
    fill(X, c.y + 1, Z, X, c.y + 5, Z, 'air');
    stair(X, c.y, Z, id, c.dir);
    if (c.water) {   // piles of stairs every third segment, down to the bed
      if (c.seg % 3 === 0) for (let y = c.y - 1; y > c.y - 14; y--) { const b = dim().getBlock({ x: X, y, z: Z }); if (!b || !(b.isAir || b.isLiquid || SOFT.test(b.typeId))) break; stair(X, y, Z, BRIDGE, c.dir, true); }
    } else for (let y = g + 1; y < c.y; y++) stair(X, y, Z, id, c.dir, true);   // a raised road stands on stairs too
    yield;
  }
}
/** a gate over one end of the road: two pillars beside it, a lintel high enough for flyers, lanterns under it; returns its middle */
function gate(cx: number, cz: number, rt: Route, hm: HMap, first: boolean, P: string, L: string, light: string): [number, number, number] {
  const n = rt.pts.length - 1, a = first ? rt.pts[0] : rt.pts[n], b = first ? rt.pts[1] : rt.pts[n - 1], y = first ? rt.J[0] : rt.J[n], top = y + 6;
  const row: [number, number][] = a[1] === b[1] ? [-2, -1, 0, 1].map((k) => [Math.min(a[0], b[0]), a[1] + k]) : [-2, -1, 0, 1].map((k) => [a[0] + k, Math.min(a[1], b[1])]);
  for (const [i, [x, z]] of row.entries()) {
    const X = cx + x, Z = cz + z;
    if (i === 0 || i === 3) fill(X, hm.get(x, z) + 1, Z, X, top, Z, P);
    else { put(X, top, Z, L); put(X, top - 1, Z, light, { hanging: true }); }
  }
  put(cx + row[0][0], top + 1, cz + row[0][1], light); put(cx + row[3][0], top + 1, cz + row[3][1], light);
  return [cx + a[0], y, cz + a[1]];
}
function posts(cx: number, cz: number, rt: Route, hm: HMap, road: Set<string>, light: string) {
  for (let k = 5; k < rt.pts.length - 6; k += 10) {
    const a = rt.pts[k], b = rt.pts[k + 1], out = k % 20 === 5 ? 1 : -1;
    const [x, z] = a[1] === b[1] ? [Math.min(a[0], b[0]), out > 0 ? a[1] + 1 : a[1] - 2] : [out > 0 ? a[0] + 1 : a[0] - 2, Math.min(a[1], b[1])];
    if (road.has(`${cx + x},${cz + z}`) || hm.wet(x, z) || Math.max(Math.abs(x), Math.abs(z)) <= CAMP + 1) continue;
    const g = hm.get(x, z); put(cx + x, g + 1, cz + z, 'oak_fence'); put(cx + x, g + 2, cz + z, light);
  }
}

// ---------- the site in play: placement on the land, the bot's spots ----------
type Spot = { x: number; y: number; z: number; kind: 'ground' | 'cliff' };
const live: { site?: SiteDef; road: Set<string>; zones: [number, number, number][]; spots?: Spot[] } = { road: new Set(), zones: [] };
function register(s: SiteDef) {
  maps[s.name] = { stud: 0.5, y: s.camp[1], path: s.pts, width: 2, grid: [], pathStuds: s.stats.pathStuds, src: 'expedition', offset: 0, site: s };
  live.site = s; live.spots = undefined;
  live.road = new Set(s.cells.split(';').filter(Boolean).map((c) => c.split(',').slice(0, 2).join(',')));
  live.zones = [[s.camp[0] - 1, s.camp[2] - 1, CAMP], [s.gateIn[0], s.gateIn[2], 3], [s.gateOut[0], s.gateOut[2], 3]];
}
function surface(x: number, y: number, z: number, P = G.path): G.Place {
  if (!live.site || !P) return null;
  if (live.road.has(`${x},${z}`)) return null;
  for (const [zx, zz, r] of live.zones) if (Math.abs(x - zx) <= r && Math.abs(z - zz) <= r) return null;
  let below, at; try { below = dim().getBlock({ x, y: y - 1, z }); at = dim().getBlock({ x, y, z }); } catch { return null; }
  if (!below || !at || !(at.isAir || SOFT.test(at.typeId))) return null;
  if (SOFT.test(below.typeId) || /stairs|water|lava/.test(below.typeId) || !NATURAL.test(below.typeId)) return null;
  const rel = y - P.nearestY(x + 0.5, z + 0.5);
  return rel >= 2 ? 'cliff' : rel >= -2 && rel <= 1 ? 'ground' : null;
}
function spots(P = G.path): Spot[] {
  if (live.spots) return live.spots;
  const s = live.site; if (!s || !P) return [];
  const out: Spot[] = [];
  for (let x = s.cx - 32; x <= s.cx + 32; x++) for (let z = s.cz - 32; z <= s.cz + 32; z++) {
    if (P.dist(x + 0.5, z + 0.5) > 9) continue;
    const c = column(x, z); if (!c || c.w) continue;
    const k = surface(x, c.g + 1, z, P); if (k) out.push({ x, y: c.g + 1, z, kind: k });
  }
  return (live.spots = out);
}
/** rocks beside the road where the land has too few cliffs (four towers are cliff only): 3×3, two above the road's top */
function rocks(cx: number, cz: number, rt: Route, hm: HMap, want: number, r: () => number): number {
  let made = 0;
  for (const k of [12, 32, 52, 70].sort(() => r() - 0.5)) {
    if (made >= want) break;
    const a = rt.pts[k], b = rt.pts[k + 1], horiz = a[1] === b[1];
    const side = (horiz ? Math.sign(a[1]) : Math.sign(a[0])) || 1;   // away from the camp
    const mx = horiz ? Math.min(a[0], b[0]) : a[0] + side * 5, mz = horiz ? a[1] + side * 5 : Math.min(a[1], b[1]);
    const top = Math.max(rt.J[k] + 1, hm.get(mx, mz) + 2);
    let ok = true;
    for (let x = mx - 1; x <= mx + 1 && ok; x++) for (let z = mz - 1; z <= mz + 1; z++) if (live.road.has(`${cx + x},${cz + z}`) || hm.wet(x, z) || Math.max(Math.abs(x), Math.abs(z)) <= CAMP + 1) ok = false;
    if (!ok) continue;
    for (let x = mx - 1; x <= mx + 1; x++) for (let z = mz - 1; z <= mz + 1; z++) { fill(cx + x, hm.get(x, z) + 1, cz + z, cx + x, top - 1, cz + z, 'stone'); put(cx + x, top, cz + z, 'moss_block'); fill(cx + x, top + 1, cz + z, cx + x, top + 4, cz + z, 'air'); }
    made++;
  }
  return made;
}

// ---------- areas: load the place, free it after ----------
async function load(cx: number, cz: number): Promise<boolean> {
  const from = { x: cx - AREA - 8, y: -64, z: cz - AREA - 8 }, to = { x: cx + AREA + 8, y: 319, z: cz + AREA + 8 };
  freeArea();
  try { await world.tickingAreaManager.createTickingArea(AREA_ID, { dimension: dim(), from, to }); }
  catch { try { dim().runCommand(`tickingarea add ${from.x} 0 ${from.z} ${to.x} 0 ${to.z} ${AREA_ID}`); } catch { /* full */ } }
  for (let i = 0; i < 300; i++) {
    const ok = [[0, 0], [-AREA, -AREA], [AREA, AREA], [-AREA, AREA], [AREA, -AREA]].every(([a, b]) => { try { return dim().isChunkLoaded({ x: cx + a, y: 0, z: cz + b }) && !!dim().getTopmostBlock({ x: cx + a, z: cz + b }); } catch { return false; } });
    if (ok) return true; await sleep(5);
  }
  return false;
}
function freeArea() {
  try { if (world.tickingAreaManager.hasTickingArea(AREA_ID)) world.tickingAreaManager.removeTickingArea(AREA_ID); } catch { /* older engine */ }
  try { dim().runCommand(`tickingarea remove ${AREA_ID}`); } catch { /* none */ }
}
const USED = 'tds:sites';
const usedSites = (): [number, number][] => { try { return JSON.parse((world.getDynamicProperty(USED) as string) ?? '[]'); } catch { return []; } };
function where(seed: number): [number, number] {
  const used = usedSites(), r = rng(seed ^ 0x5bd1e995);
  for (let i = 0; i < 24; i++) {
    const a = r() * Math.PI * 2, d = 1500 + r() * 4500, x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
    if (used.every(([ux, uz]) => Math.hypot(ux - x, uz - z) >= 512)) return [x, z];
  }
  return [Math.round((r() - 0.5) * 30000), Math.round((r() - 0.5) * 30000)];
}
/** the seed an elevator goes to: one per mode and minute (the Elevators page: maps change every minute) */
export function wildSeed(mode: string, period: number) { let h = 2166136261; for (const ch of `${mode}:${period}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) % 1000000; }
export const wildName = (seed: number) => `Wild #${seed % 10000}`;

// ---------- setting out ----------
let busy = 0, token = 0, starting = false, cinematic = true;
export const preparing = () => busy > 0;
export async function expedition(mode: string, players: Player[], o: { seed?: number; at?: Vector3 } = {}): Promise<string> {
  if (!modes[mode]) return `Modes: ${MODE_NAMES.join(' ')}`;
  if (busy) return 'An expedition is being prepared';
  if (G.M && !G.M.over) G.stop(true);
  const my = ++token; busy++;
  try {
    const home = Object.fromEntries(players.map((p) => [p.name, [p.location.x, p.location.y, p.location.z] as [number, number, number]]));
    for (const p of players) { try { p.onScreenDisplay.setActionBar({ translate: 'tds.site.preparing' }); } catch { /* left */ } }
    let seed = o.seed ?? (Math.floor(Math.random() * 1e6) ^ (Date.now() % 1e6)) % 1000000;
    for (let attempt = 0; attempt < 6; attempt++, seed = (seed * 7 + 13) % 1000000) {
      const [cx, cz] = o.at ? [Math.floor(o.at.x), Math.floor(o.at.z)] : where(seed);
      G.log('site_search', { mode, seed, x: cx, z: cz });
      if (!(await load(cx, cz))) { G.log('site_reject', { seed, why: 'not loaded' }); continue; }
      if (my !== token) return 'Cancelled';
      const hm = new HMap(), st: Scan = { made: 0, lava: 0, water: 0, min: Infinity, max: -Infinity, grass: 0, cols: 0 };
      await job(scan(cx, cz, hm, st));
      if (my !== token) return 'Cancelled';
      const flat = st.max - st.min <= 1 && st.grass > st.cols * 0.9;
      if (flat) await job(synth(cx, cz, st.min, hm, seed));
      else if (!o.at) {
        const why = st.lava > 10 ? 'lava' : st.made > 25 ? 'buildings' : st.water > st.cols * 0.25 ? 'water' : hm.wet(0, 0) ? 'water in the middle' : '';
        if (why) { G.log('site_reject', { seed, why }); continue; }
      }
      if (my !== token) return 'Cancelled';
      const rt = plan({ r: AREA, ground: (x, z) => hm.get(x, z), water: (x, z) => hm.wet(x, z), blocked: (x, z) => hm.blocked(x, z) }, seed);
      if (!rt) { G.log('site_reject', { seed, why: 'no road fits' }); continue; }
      // the camp stands at the middle's usual height
      const around: number[] = []; for (let x = -CAMP; x <= CAMP; x++) for (let z = -CAMP; z <= CAMP; z++) around.push(hm.get(x, z));
      const cy = around.sort((a, b) => a - b)[Math.floor(around.length / 2)], th = themeOf(mode), r = rng(seed + 11);
      await job(buildCamp(cx, cy, cz, hm));
      await job(buildRoad(cx, cz, rt, hm, th));
      if (my !== token) return 'Cancelled';
      const gateIn = gate(cx, cz, rt, hm, true, th.inP, th.inL, th.light), gateOut = gate(cx, cz, rt, hm, false, th.outP, th.outL, th.light);
      const cells = rt.cells.map((c) => `${cx + c.x},${cz + c.z},${c.y},${c.dir},${c.slope ? 's' : ''}${c.water ? 'w' : ''}${c.corner ? c.corner[0] : ''}`).join(';');
      let biome = ''; try { biome = dim().getBiome({ x: cx, y: cy + 1, z: cz }).id; } catch { /* older engine */ }
      const name = wildName(seed), noun = flat ? 'plains' : NOUNS.find(([re]) => re.test(biome))?.[1] ?? 'wilds';
      const site: SiteDef = { name, seed, mode, theme: mode in THEMES ? mode : 'Intermediate', title: [Math.floor(r() * 8), noun], cx, cz, flat,
        pts: rt.pts.map(([x, z], i) => [cx + x, cz + z, rt.J[i]] as [number, number, number]), cells, gateIn, gateOut, camp: [cx + 1, cy + 1, cz + 1], home,
        stats: { pathStuds: rt.len * 2, steps: rt.steps, bridges: rt.bridges, maxFill: rt.maxFill, corners: rt.corners, ring: rt.ring } };
      register(site);
      posts(cx, cz, rt, hm, live.road, th.light);
      const P = new G.Path(name);
      let sp = spots(P), cliff = sp.filter((q) => q.kind === 'cliff').length;
      if (cliff < 8) { site.stats.rocks = rocks(cx, cz, rt, hm, 4, r); live.spots = undefined; sp = spots(P); cliff = sp.filter((q) => q.kind === 'cliff').length; }
      const ground = sp.filter((q) => q.kind === 'ground' && P.dist(q.x + 0.5, q.z + 0.5) <= 4.5).length;
      Object.assign(site.stats, { ground, cliff });
      G.log('site_built', { name, mode, seed, x: cx, z: cz, flat, biome, theme: site.theme, pathStuds: rt.len * 2, onlyStairs: true, maxStep: Math.max(0, ...rt.h.slice(1).map((h, k) => Math.abs(h - rt.h[k]))),
        steps: rt.steps, bridges: rt.bridges, maxFill: rt.maxFill, corners: rt.corners, cells: rt.cells.length, ground, cliff, rocks: site.stats.rocks ?? 0 });
      try { const u = usedSites(); u.push([cx, cz]); world.setDynamicProperty(USED, JSON.stringify(u.slice(-64))); } catch { /* full */ }
      starting = true; try { G.start(mode, players, name); } finally { starting = false; }
      return `${mode}: ${name} (${rt.len * 2} studs, ${rt.steps} climbs, ${rt.bridges} bridges)`;
    }
    return 'No place for an expedition was found';
  } finally { busy--; }
}

// ---------- arriving: a title, the wand, a fly-over of the road (skipped by sneaking, never at test speed) ----------
const flying = new Set<string>(); let heldByFly = false;
function landed(p: Player) {
  if (!flying.delete(p.name)) return;
  try { p.camera.clear(); } catch { /* left */ }
  if (!flying.size && heldByFly) { heldByFly = false; G.setHold(false); }
}
function arrive(m: G.Match, players: Player[]) {
  const s = m.site!;
  for (const p of players) {
    try { p.onScreenDisplay.setTitle({ rawtext: [{ translate: `tds.site.adj.${s.title[0]}` }, { text: ' ' }, { translate: `tds.site.noun.${s.title[1]}` }] }, { subtitle: s.name, fadeInDuration: 10, stayDuration: 70, fadeOutDuration: 20 }); } catch { /* left */ }
    give(p, 'tds:wand', 1);
  }
  if (!cinematic || G.headless || G.simSpeed() > 1 || !G.path) return;
  const P = G.path, cp: Vector3[] = [{ x: s.camp[0] + 0.5, y: s.camp[1] + 16, z: s.camp[2] + 0.5 }];
  for (let d = 0; d <= P.len; d += 16) { const q = P.at(d); cp.push({ x: q.x, y: q.y + 8, z: q.z }); }
  const e = P.at(P.len); cp.push({ x: e.x, y: e.y + 8, z: e.z }, { x: s.camp[0] + 0.5, y: s.camp[1] + 14, z: s.camp[2] + 0.5 });
  const T = 10, rots = cp.map((c, i) => { const n = cp[Math.min(cp.length - 1, i + 1)], t = i === cp.length - 1 ? cp[i - 1] : n, dx = i === cp.length - 1 ? c.x - t.x : n.x - c.x, dz = i === cp.length - 1 ? c.z - t.z : n.z - c.z;
    return { rotation: { x: 35, y: (Math.atan2(-dx, dz) * 180) / Math.PI, z: 0 }, timeSeconds: (T * i) / (cp.length - 1) }; });
  if (!m.hold) { heldByFly = true; G.setHold(true); }
  for (const p of players) {
    try {
      const sp = new CatmullRomSpline(); sp.controlPoints = cp;
      p.camera.playAnimation(sp, { animation: { progressKeyFrames: [{ alpha: 0, timeSeconds: 0 }, { alpha: 1, timeSeconds: T }], rotationKeyFrames: rots }, totalTimeSeconds: T });
      flying.add(p.name); system.runTimeout(() => landed(p), T * 20 + 4);
    } catch { /* an engine without camera animations */ }
  }
  if (!flying.size && heldByFly) { heldByFly = false; G.setHold(false); }
  G.log('flyover', { players: [...flying], points: cp.length, seconds: T });
}
world.afterEvents.playerButtonInput.subscribe(({ player, button, newButtonState }) => { if (button === InputButton.Sneak && newButtonState === ButtonState.Pressed) landed(player); });

// back where they came from, a while after the end (not at test speed)
G.onEnd.push((m) => {
  const s = m.site; if (!s?.home || G.headless || G.simSpeed() > 1) return;
  system.runTimeout(() => {
    if (G.M && G.M !== m && !G.M.over) return;
    for (const p of world.getAllPlayers()) { const h = s.home![p.name]; if (h && m.players.includes(p.name)) { try { p.teleport({ x: h[0], y: h[1], z: h[2] }); } catch { /* left */ } } }
    freeArea();
  }, 240);
});

// the training grounds (round the world's origin) stay loaded, so a match there can be built while the players are far away
system.run(() => {
  const from = { x: -40, y: -64, z: -40 }, to = { x: 40, y: 319, z: 40 };
  try { if (!world.tickingAreaManager.hasTickingArea('tds_ground')) void world.tickingAreaManager.createTickingArea('tds_ground', { dimension: dim(), from, to }).catch(() => undefined); }
  catch { try { dim().runCommand('tickingarea add -40 0 -40 40 0 40 tds_ground'); } catch { /* there already */ } }
});

G.siteHooks.surface = (x, y, z) => surface(x, y, z);
G.siteHooks.register = (s) => { register(s); void load(s.cx, s.cz); };
G.siteHooks.stop = () => { if (starting) return; token++; freeArea(); };
G.siteHooks.spots = () => spots();
G.siteHooks.started = arrive;

// ---------- commands ----------
cmd('tds:expedition', 'Set out on an expedition now: a new place in the world (seed: the same place again; here: around you)', { mode: MODE_NAMES as unknown as string[], 'all?': 'bool', 'seed?': 'int', 'here?': 'bool' }, (p, a) => {
  const ps = a.all ? [p, ...world.getAllPlayers().filter((x) => x.name !== p.name)] : [p];   // the one who asked first
  void expedition(a.mode, ps, { seed: a.seed, at: a.here ? p.location : undefined }).then((r) => { try { p.sendMessage(r); } catch { /* left */ } });
  return `${a.mode}: setting out on an expedition`;
}, true);
cmdAny('tds:site', 'The expedition site of this match', {}, () => { const s = G.M?.site; return s ? `${s.name} at ${s.cx} ${s.cz}: ${Object.entries(s.stats).map(([k, v]) => `${k} ${v}`).join(', ')}` : 'No expedition'; });
cmdAny('tds:cinematic', 'The fly-over of the road on arrival (on or off)', { state: ['on', 'off'] }, (_, a) => { cinematic = a.state === 'on'; return `Fly-over ${a.state}`; });
/** test: every road cell is a stair block in the world, and the land offers ground and cliff spots */
cmdAny('tds:sitecheck', 'Check the expedition road and its spots (test)', {}, () => {
  const s = G.M?.site; if (!s) return 'No expedition';
  let stairs = 0; const bad: string[] = [];
  for (const c of s.cells.split(';').filter(Boolean)) { const [x, z, y] = c.split(',').map(Number); const id = dim().getBlock({ x, y, z })?.typeId ?? '?'; if (/stairs$/.test(id)) stairs++; else bad.push(`${x},${y},${z} ${id}`); }
  const sp = spots(), g = sp.filter((q) => q.kind === 'ground').length, cl = sp.filter((q) => q.kind === 'cliff').length;
  return bad.length ? `road bad: ${bad.slice(0, 3).join(' | ')}` : `road ok ${stairs} stairs, ground ${g}, cliff ${cl}`;
}, true);
/** test: place a tower on the best ground spot (and a cliff tower on a cliff spot) */
cmd('tds:sitetry', 'Place a tower on a ground or cliff spot of the expedition (test)', { kind: ['ground', 'cliff'], tower: 'string' }, (p, a) => {
  const P = G.path; if (!G.M?.site || !P) return 'No expedition';
  const sp = spots().filter((q) => q.kind === a.kind).sort((u, v) => P.dist(u.x + 0.5, u.z + 0.5) - P.dist(v.x + 0.5, v.z + 0.5));
  for (const q of sp.slice(0, 30)) { const r = G.place(p, String(a.tower).replace(/_/g, ' '), q.x, q.y, q.z, true); if (r.ok) return `Placed ${a.kind} #${r.tower.id} ${r.tower.name}`; }
  return `No ${a.kind} spot took it`;
}, true);

/** a look at the site (the real-app scenario's pictures, and anyone who wants to see it): the player is put where the thing is seen */
cmd('tds:siteview', 'See a part of the expedition site: top, camp, gate_in, gate_out, corner, climb, bridge', { at: ['top', 'camp', 'gate_in', 'gate_out', 'corner', 'climb', 'bridge'] }, (p, a) => {
  const s = G.M?.site; if (!s) return 'No expedition';
  const cells = s.cells.split(';').filter(Boolean).map((c) => { const [x, z, y, d, f] = c.split(','); return { x: +x, z: +z, y: +y, d: +d, f: f ?? '' }; });
  const [cx, cy, cz] = [s.camp[0] - 0.5, s.camp[1], s.camp[2] - 0.5];
  const near = (t: { x: number; y: number; z: number }, dist: number, up: number) => {   // from the camp's side of the thing, a little above
    const dx = t.x - cx, dz = t.z - cz, l = Math.hypot(dx, dz) || 1;
    return { x: t.x - (dx / l) * dist, y: t.y + up, z: t.z - (dz / l) * dist };
  };
  let at: Vector3, look: Vector3;
  if (a.at === 'top') { at = { x: cx, y: cy + 30, z: cz + 0.3 }; look = { x: cx, y: cy, z: cz }; }
  else if (a.at === 'camp') { at = { x: cx + 6, y: cy + 4, z: cz + 6 }; look = { x: cx, y: cy, z: cz }; }
  else if (a.at === 'gate_in' || a.at === 'gate_out') { const g = a.at === 'gate_in' ? s.gateIn : s.gateOut, t = { x: g[0], y: g[1] + 2, z: g[2] }; at = near(t, 8, 3); look = t; }
  else {
    const c = cells.find((q) => (a.at === 'corner' ? q.f.includes('i') : a.at === 'climb' ? q.f.includes('s') : q.f.includes('w')));
    if (!c) return `No ${a.at} on this road`;
    const t = { x: c.x + 0.5, y: c.y + 1, z: c.z + 0.5 }; at = near(t, 5, 3); look = t;
  }
  p.teleport(at, { facingLocation: look });
  G.log('siteview', { player: p.name, at: a.at });
  return `Looking at the ${a.at.replace('_', ' ')}`;
}, true);
