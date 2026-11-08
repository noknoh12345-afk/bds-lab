// Survey birds and the war table (SURVEY.md: the user's "something that seeks better land — not easy, not random").
// A bird flies the way the player faces (or a given bearing) for a given distance from the training grounds; the place it reaches
// is that point on a 64-block grid, so the same aim always finds the same land: the world's own (a flat world: a land made from
// the place itself). It is judged as its expedition would build it (src/site.ts survey: the same road, the same rocks) and
// scored for defending it (src/road.ts rate: strong ground, strong high ground, room by the road → ★1-5). Each bird costs a
// survey feather, won in matches; land turned down (water, lava, buildings, no road) keeps the feather. What comes back:
// - a model of the land on the war table east of the training grounds, at 1:4, with the road, both gates and the camp on it
// - which way the land rises and where its water lies: the land goes on beyond what was seen, so these say where to look next
// - a place in the atlas with the finder's name; a known place answers again for free
// The elevators offer the war table's places first, and a place chosen there is fought on exactly as its model shows.
import { world, system, Player, Vector3, RawMessage } from '@minecraft/server';
import * as G from './game';
import { maps, DEFAULT_MAP } from './defs';
import { survey, usedSites, wildName, HMap, Survey } from './site';
import { cmd, cmdAny } from './kit';

const FEATHERS = 'tds:feathers', ATLAS = 'tds:atlas', TABLE = 'tds:table', START = 3, MIN = 1500, MAX = 6000, GRID = 64, KEEP = 32;
const dim = () => world.getDimension('overworld');
const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
/** a translated message's arguments: a direction's name is itself translated (tds.dir.*), numbers as they are */
type Arg = number | string | { dir: string };
const args = (w: Arg[]): RawMessage => ({ rawtext: w.map((a) => (typeof a === 'object' ? { translate: `tds.dir.${a.dir}` } : { text: String(a) })) });
/** the 8-way name of a direction on the ground (x east, z south) */
const dirOf = (dx: number, dz: number) => DIRS[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8];
export function seedAt(x: number, z: number) { let h = 2166136261; for (const ch of `scout:${x},${z}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) % 1000000; }

// ---------- feathers ----------
export const feathers = (p: Player) => (p.getDynamicProperty(FEATHERS) as number | undefined) ?? START;
function setFeathers(p: Player, n: number, why: string) { const v = Math.max(0, Math.min(99, Math.floor(n))); p.setDynamicProperty(FEATHERS, v); G.log('feathers', { player: p.name, n: v, why }); return v; }

// ---------- the atlas: every place a bird found ----------
export type Find = { id: number; x: number; z: number; seed: number; stars: number; keys: number; heights: number; footing: number; cliffs: number; rocks: number;
  steps: number; bridges: number; corners: number; adj: number; noun: string; flat: boolean; by: string; lean: string; wet: string; dir: string; dist: number };
export function atlas(): Find[] { try { return JSON.parse((world.getDynamicProperty(ATLAS) as string) ?? '[]'); } catch { return []; } }
function saveAtlas(a: Find[]) {
  const keep = a.slice(-KEEP), gone = a.slice(0, Math.max(0, a.length - KEEP));
  for (const f of gone) world.setDynamicProperty(`tds:model:${f.id}`, undefined);
  world.setDynamicProperty(ATLAS, JSON.stringify(keep));
}
export const findBySeed = (seed: number) => atlas().find((f) => f.seed === seed);

// ---------- the war table: three models, east of the training grounds ----------
const FLOOR = (maps[DEFAULT_MAP]?.y ?? -60) - 1, X0 = 52, STEP = 26, HALF = 10, N = 2 * HALF + 1;
const table = (): (number | null)[] => { try { const t = JSON.parse((world.getDynamicProperty(TABLE) as string) ?? '[]'); return [0, 1, 2].map((i) => t[i] ?? null); } catch { return [null, null, null]; } };
export const tablePlaces = () => { const a = atlas(); return table().map((id) => a.find((f) => f.id === id)).filter((f): f is Find => !!f); };
/** the model of a surveyed land: a height (0-9) and a kind per cell; the kinds are a grass, b sand, c stone, d snow, e earth,
 *  f water, R road, I entrance gate, O exit gate, C camp, K rock */
function model(s: Extract<Survey, { ok: true }>): string {
  const hm = s.hm, rt = s.rt, cells = new Set(rt.cells.map((c) => `${c.x},${c.z}`)), rocks = s.rocks;
  let base = Infinity; for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) base = Math.min(base, hm.get(x, z));
  const gi = rt.pts[0], go = rt.pts[rt.pts.length - 1];
  let out = '';
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    let top = -Infinity, road = false, rock = false, wet = 0, kinds = [0, 0, 0, 0, 0, 0], gate = '', ry = -Infinity;
    for (let x = -42 + 4 * i; x < -38 + 4 * i; x++) for (let z = -42 + 4 * j; z < -38 + 4 * j; z++) {
      if (Math.abs(x) > 40 || Math.abs(z) > 40) continue;
      let g = hm.get(x, z);
      const rk = rocks.find(([mx, mz]) => Math.abs(x - mx) <= 1 && Math.abs(z - mz) <= 1); if (rk) { g = rk[2]; rock = true; }
      top = Math.max(top, g); kinds[hm.top[hm.i(x, z)]]++; if (hm.wet(x, z)) wet++;
      if (cells.has(`${x},${z}`)) { road = true; ry = Math.max(ry, rt.cells.find((c) => c.x === x && c.z === z)!.y + 1); }
      if (Math.abs(x + 0.5 - gi[0]) <= 2 && Math.abs(z + 0.5 - gi[1]) <= 2) gate = 'I';
      if (Math.abs(x + 0.5 - go[0]) <= 2 && Math.abs(z + 0.5 - go[1]) <= 2) gate = 'O';
    }
    if (road) top = Math.max(top, ry);
    const h = Math.max(0, Math.min(9, Math.round((top - base) / 2)));
    const kind = i === HALF && j === HALF ? 'C' : gate && road ? gate : road ? 'R' : rock ? 'K' : wet >= 8 ? 'f' : 'abcde'[kinds.slice(0, 5).indexOf(Math.max(...kinds.slice(0, 5)))];
    out += String(h) + kind;
  }
  return out;
}
const BLOCK: Record<string, string> = { a: 'grass_block', b: 'sand', c: 'stone', d: 'snow', e: 'coarse_dirt', f: 'light_blue_stained_glass', R: 'red_concrete', I: 'red_concrete', O: 'red_concrete', C: 'grass_block', K: 'mossy_cobblestone' };
const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
function fillAir(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id = 'air') { try { dim().runCommand(`fill ${x0} ${y0} ${z0} ${x1} ${y1} ${z1} ${id}`); } catch { /* unloaded */ } }
function setBlock(x: number, y: number, z: number, id: string) { try { dim().runCommand(`setblock ${x} ${y} ${z} ${id}`); } catch { /* unloaded */ } }
/** the table's ground and an empty slot (the first time: the whole table's ground, levelled) */
function* clearSlot(slot: number): Generator<void, void, void> {
  if (!world.getDynamicProperty('tds:tableFloor')) {
    fillAir(X0 - HALF - 3, FLOOR, -HALF - 3, X0 + 2 * STEP + HALF + 3, FLOOR, HALF + 3, 'polished_andesite');
    for (let y = FLOOR + 1; y <= FLOOR + 16; y += 4) { fillAir(X0 - HALF - 3, y, -HALF - 3, X0 + 2 * STEP + HALF + 3, Math.min(FLOOR + 16, y + 3), HALF + 3); yield; }
    world.setDynamicProperty('tds:tableFloor', true);
  }
  const cx = X0 + slot * STEP;
  fillAir(cx - HALF - 1, FLOOR + 1, -HALF - 1, cx + HALF + 1, FLOOR + 12, HALF + 2); yield;
  fillAir(cx - HALF - 1, FLOOR, -HALF - 1, cx + HALF + 1, FLOOR, HALF + 1, 'dark_oak_planks');
}
function* buildModel(slot: number, f: Find, m: string): Generator<void, void, void> {
  yield* clearSlot(slot);
  const cx = X0 + slot * STEP;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const k = 2 * (i * N + j), h = Number(m[k]), kind = m[k + 1], X = cx - HALF + i, Z = -HALF + j;
      if (h > 1) fillAir(X, FLOOR + 1, Z, X, FLOOR + h - 1, Z, kind === 'K' || kind === 'c' ? 'stone' : 'dirt');
      setBlock(X, FLOOR + Math.max(1, h), Z, BLOCK[kind] ?? 'grass_block');
      if (kind === 'C') setBlock(X, FLOOR + Math.max(1, h) + 1, Z, 'campfire');
      if (kind === 'I') setBlock(X, FLOOR + Math.max(1, h) + 1, Z, 'lantern');
      if (kind === 'O') setBlock(X, FLOOR + Math.max(1, h) + 1, Z, 'soul_lantern');
    }
    yield;
  }
  // its sign: the stars, the name, which way and how far, who found it
  setBlock(cx, FLOOR + 1, HALF + 2, 'standing_sign ["ground_sign_direction"=0]');
  try {
    dim().getBlock({ x: cx, y: FLOOR + 1, z: HALF + 2 })?.getComponent('minecraft:sign')?.setText({ rawtext: [
      { text: `${STARS(f.stars)}\n${wildName(f.seed)}\n` }, { translate: `tds.dir.${f.dir}` }, { text: ` ${f.dist}m\n${f.by}` }] });
  } catch { /* older engine */ }
  G.log('table_built', { slot: slot + 1, id: f.id, name: wildName(f.seed), cells: N * N });
}
const job = (g: Generator<void, void, void>) => new Promise<void>((res) => system.runJob((function* () { try { yield* g; } finally { res(); } })()));
async function putOnTable(f: Find, m: string): Promise<number> {
  const t = table(); let slot = t.indexOf(f.id);
  if (slot < 0) { slot = t.indexOf(null); if (slot < 0) { const a = atlas(); slot = [0, 1, 2].sort((p, q) => (a.find((x) => x.id === t[p])?.stars ?? 0) - (a.find((x) => x.id === t[q])?.stars ?? 0))[0]; } }
  t[slot] = f.id; world.setDynamicProperty(TABLE, JSON.stringify(t));
  await job(buildModel(slot, f, m));
  return slot + 1;
}

// ---------- the bird: a parrot rising away the way it was sent (only at the game's own speed, never headless) ----------
function fly(p: Player, dx: number, dz: number) {
  if (G.headless || G.simSpeed() > 1) return;
  let e: ReturnType<ReturnType<typeof dim>['spawnEntity']> | undefined;
  try { e = dim().spawnEntity('minecraft:parrot' as never, { x: p.location.x, y: p.location.y + 1.8, z: p.location.z }); } catch { return; }
  const from = { ...p.location }; let t = 0;
  const h = system.runInterval(() => {
    t++;
    try { if (!e?.isValid || t > 50) { system.clearRun(h); try { e?.remove(); } catch { /* gone */ } return; } e.teleport({ x: from.x + dx * t * 0.9, y: from.y + 1.8 + t * 0.35, z: from.z + dz * t * 0.9 }, { facingLocation: { x: from.x + dx * 999, y: from.y + 40, z: from.z + dz * 999 } }); } catch { system.clearRun(h); }
  }, 1);
  try { p.playSound('mob.parrot.fly', { volume: 0.8 }); } catch { /* left */ }
}

// ---------- the hints a bird brings: which way the land rises, where its water is ----------
function hints(hm: HMap) {
  let gx = 0, gz = 0, xx = 0, mean = 0, n = 0, wx = 0, wz = 0, wn = 0;
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { mean += hm.get(x, z); n++; if (hm.wet(x, z)) { wx += x; wz += z; wn++; } }
  mean /= n;
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const g = hm.get(x, z) - mean; gx += g * x; gz += g * z; xx += x * x; }
  const sx = (gx / xx) * 40, sz = (gz / xx) * 40;   // how much higher the edge of the land is than its middle, each way
  const lean = Math.hypot(sx, sz) >= 1.5 ? dirOf(sx, sz) : 'level';
  const wet = wn < 12 ? '' : Math.hypot(wx / wn, wz / wn) < 8 ? 'mid' : dirOf(wx / wn, wz / wn);
  return { lean, wet };
}

// ---------- sending a bird ----------
let out = false;
export async function scout(p: Player, dist: number, deg?: number): Promise<string> {
  const yaw = deg ?? p.getRotation().y, d = Math.max(MIN, Math.min(MAX, Math.round(dist)));
  const ux = -Math.sin((yaw * Math.PI) / 180), uz = Math.cos((yaw * Math.PI) / 180);
  const x = Math.round((ux * d) / GRID) * GRID, z = Math.round((uz * d) / GRID) * GRID, dir = dirOf(x, z), far = Math.round(Math.hypot(x, z));
  const seed = seedAt(x, z), known = atlas().find((f) => f.x === x && f.z === z);
  const say = (key: string, w: Arg[] = []) => { try { p.sendMessage({ rawtext: [{ translate: key, with: args(w) }] }); } catch { /* left */ } };
  if (known) {   // a place in the atlas: told again at once, no feather
    const m = world.getDynamicProperty(`tds:model:${known.id}`) as string | undefined;
    const slot = m ? await putOnTable(known, m) : 0;
    G.log('scout_report', { player: p.name, again: true, ok: true, ...known, name: wildName(known.seed), slot });
    report(p, known, slot, true);
    return `Known place: ${wildName(known.seed)} ${STARS(known.stars)}`;
  }
  if (usedSites().some(([ux2, uz2]) => Math.hypot(ux2 - x, uz2 - z) < 512)) { G.log('scout_report', { player: p.name, ok: false, why: 'used', x, z }); say('tds.scout.why.used'); return 'Fought there already'; }
  if (out) return 'A bird is already out';
  if (feathers(p) < 1) { say('tds.scout.nofeather'); return 'No survey feathers'; }
  out = true;
  try {
    setFeathers(p, feathers(p) - 1, 'scout');
    G.log('scout_out', { player: p.name, x, z, dist: far, dir, seed });
    say('tds.scout.out', [{ dir }, far]);
    fly(p, ux, uz);
    const s = await survey(x, z, seed);
    if (!s.ok) {
      const keep = s.why !== 'busy' && s.why !== 'not loaded';   // land turned down still costs the feather; a bird that could not go does not
      if (!keep) setFeathers(p, feathers(p) + 1, 'back');
      G.log('scout_report', { player: p.name, ok: false, why: s.why, x, z, seed });
      say(`tds.scout.why.${s.why.replace(/\s+/g, '_')}`);
      return `The bird found no place: ${s.why}`;
    }
    const a = atlas(), id = (a.at(-1)?.id ?? 0) + 1, h = hints(s.hm);
    const f: Find = { id, x, z, seed, stars: s.rate.stars, keys: s.rate.keys, heights: s.rate.heights, footing: s.rate.footing, cliffs: s.rate.cliffs, rocks: s.rocks.length,
      steps: s.rt.steps, bridges: s.rt.bridges, corners: s.rt.corners, adj: s.adj, noun: s.noun, flat: s.flat, by: p.name, lean: h.lean, wet: h.wet, dir, dist: far };
    const m = model(s);
    world.setDynamicProperty(`tds:model:${id}`, m); a.push(f); saveAtlas(a);
    const slot = await putOnTable(f, m);
    G.log('scout_report', { player: p.name, again: false, ok: true, ...f, name: wildName(seed), slot });
    report(p, f, slot, false);
    return `Found ${wildName(seed)} ${STARS(f.stars)}`;
  } finally { out = false; }
}
function report(p: Player, f: Find, slot: number, again: boolean) {
  const t: RawMessage[] = [
    { translate: 'tds.scout.back', with: args([{ dir: f.dir }, f.dist]) }, { text: '\n' },
    { text: `§e${STARS(f.stars)} §f` }, { translate: `tds.site.adj.${f.adj}` }, { text: ' ' }, { translate: `tds.site.noun.${f.noun}` }, { text: ` §7(${wildName(f.seed)})\n§f` },
    { translate: 'tds.scout.parts', with: args([f.keys, f.heights, f.footing, f.steps, f.bridges, f.rocks]) }, { text: '\n' },
    f.lean === 'level' ? { translate: 'tds.scout.level' } : { translate: 'tds.scout.lean', with: args([{ dir: f.lean }]) },
    ...(f.wet ? [{ text: ' · ' }, f.wet === 'mid' ? { translate: 'tds.scout.wetmid' } : { translate: 'tds.scout.wet', with: args([{ dir: f.wet }]) }] : []),
    ...(slot ? [{ text: '\n' }, { translate: 'tds.scout.table', with: args([slot]) }] : []),
    ...(again ? [{ text: '\n' }, { translate: 'tds.scout.again' }] : []),
  ];
  try { p.sendMessage({ rawtext: t }); } catch (e) { G.log('scout_error', { what: 'report', e: String(e) }); }
}

// ---------- feathers from matches: a win two, a loss after ten waves one ----------
G.onEnd.push((m, r) => {
  if (m.sandbox) return;
  const n = r === 'win' ? 2 : m.wave >= 10 ? 1 : 0; if (!n) return;
  for (const p of world.getAllPlayers()) if (m.players.includes(p.name)) {
    const v = setFeathers(p, feathers(p) + n, r);
    try { p.sendMessage({ rawtext: [{ translate: 'tds.scout.gain', with: args([n, v]) }] }); } catch { /* left */ }
  }
});
// the war table stays loaded, so a bird's model can be built while everyone is away
system.run(() => {
  const from = { x: X0 - HALF - 4, y: -64, z: -HALF - 4 }, to = { x: X0 + 2 * STEP + HALF + 4, y: 319, z: HALF + 4 };
  try { if (!world.tickingAreaManager.hasTickingArea('tds_table')) void world.tickingAreaManager.createTickingArea('tds_table', { dimension: dim(), from, to }).catch(() => undefined); }
  catch { try { dim().runCommand(`tickingarea add ${from.x} 0 ${from.z} ${to.x} 0 ${to.z} tds_table`); } catch { /* there already */ } }
});

cmd('tds:scout', 'Send a survey bird the way you face (or deg) for dist blocks, 1500-6000: one survey feather', { dist: 'int', 'deg?': 'float' }, (p, a) => scout(p, a.dist, a.deg));
cmd('tds:feathers', 'Your survey feathers (a win gives two)', {}, (p) => `Feathers ${feathers(p)}`);
cmd('tds:setfeathers', 'Set your survey feathers (test)', { n: 'int' }, (p, a) => `Feathers ${setFeathers(p, a.n, 'set')}`, true);
cmdAny('tds:atlas', 'The places the survey birds found, best first', {}, () => {
  const a = [...atlas()].sort((p, q) => q.stars - p.stars || p.id - q.id);
  return a.length ? a.slice(0, 12).map((f) => `${STARS(f.stars)} ${wildName(f.seed)} ${f.dir} ${f.dist}m by ${f.by}`).join('\n') : 'No places yet: /tds:scout <distance>';
});
cmd('tds:table', 'Go to the war table (east of the training grounds)', {}, (p) => { p.teleport({ x: X0 - HALF - 2 + 0.5, y: FLOOR + 1, z: HALF + 4 + 0.5 }, { facingLocation: { x: X0, y: FLOOR, z: 0 } }); return 'The war table'; });
cmdAny('tds:tableclear', 'Clear the war table (test)', {}, () => { world.setDynamicProperty(TABLE, '[]'); for (const s of [0, 1, 2]) void job(clearSlot(s)); return 'Table cleared'; }, true);
export const placeAt = (seed: number): Vector3 | undefined => { const f = findBySeed(seed); return f ? { x: f.x, y: 0, z: f.z } : undefined; };
