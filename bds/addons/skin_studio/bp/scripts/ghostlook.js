import { BLOCKS, SHAPES, KINDS } from './blocks.js';

const AHEAD = [
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: 1, z: 0 },
];
const YAWS = [0, 90, 180, -90];
const WORLD = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];
const CARDINAL = { north: 0, east: 1, south: 2, west: 3 };
const WEIRDO = [1, 3, 2, 0];
const LEGACY = [2, 3, 0, 1];
const FACING6 = [-1, -1, 0, 2, 3, 1];
const AXES = { y: 0, x: 1, z: 2 };
const N = 0;
const E = 1;
const S = 2;
const W = 3;

const kind = (entry) => KINDS[entry.k];
const turn = (dir, quarters) => (((dir + quarters) % 4) + 4) % 4;

function state(block, name) {
  try {
    return block?.permutation.getState(name);
  } catch {
    return undefined;
  }
}

function toModel(v, facing) {
  const a = AHEAD[facing];
  const d = v.x * a.x + v.z * a.z;
  const rx = v.x - 2 * d * a.x;
  const rz = v.z - 2 * d * a.z;
  const t = (YAWS[facing] * Math.PI) / 180;
  const c = Math.round(Math.cos(t));
  const s = Math.round(Math.sin(t));
  return { x: c * rx + s * rz, z: s * rx - c * rz };
}

export function modelDir(world, facing) {
  const m = toModel(WORLD[world], facing);
  return m.z < 0 ? 0 : m.x > 0 ? 1 : m.z > 0 ? 2 : 3;
}

function modelAxis(axis, facing) {
  if (axis === 0) return 0;
  return facing % 2 === 1 ? 3 - axis : axis;
}

function quadrantBit(qx, qz, facing) {
  const m = toModel({ x: qx, z: qz }, facing);
  if (m.x < 0 && m.z < 0) return 1;
  if (m.x > 0 && m.z < 0) return 2;
  if (m.x > 0 && m.z > 0) return 4;
  return 8;
}

function stairMask(high, corner, facing) {
  const f = WORLD[high];
  const r = WORLD[turn(high, 1)];
  const quadrants = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      const along = a;
      const right = b;
      const inside =
        corner === 'outer_right' ? along > 0 && right > 0 : corner === 'outer_left' ? along > 0 && right < 0 : corner === 'inner_right' ? along > 0 || right > 0 : corner === 'inner_left' ? along > 0 || right < 0 : along > 0;
      if (inside) quadrants.push({ x: f.x * along + r.x * right, z: f.z * along + r.z * right });
    }
  }
  return quadrants.reduce((mask, q) => mask | quadrantBit(q.x, q.z, facing), 0);
}

function horizontalFacing(block) {
  const cardinal = state(block, 'minecraft:cardinal_direction');
  if (cardinal !== undefined && cardinal in CARDINAL) return CARDINAL[cardinal];
  const direction = state(block, 'direction');
  if (typeof direction === 'number' && direction >= 0 && direction <= 3) return LEGACY[direction];
  return undefined;
}

function worldFaces(entry, block) {
  const [n, e, s, w, u, d] = entry.f;
  const ring = [n, e, s, w];
  const front = horizontalFacing(block);
  const quarters = front === undefined ? 0 : turn(front, -S);
  const faces = [0, 1, 2, 3].map((i) => ring[turn(i, -quarters)]);
  return { ring: faces, u, d };
}

function modelTextures(faces, facing) {
  const at = [0, 1, 2, 3].map((dir) => faces.ring[[0, 1, 2, 3].find((world) => modelDir(world, facing) === dir)]);
  const count = (t) => faces.ring.filter((x) => x === t).length;
  const ew = at[1] === at[3] || count(at[1]) >= count(at[3]) ? at[1] : at[3];
  return { tex: at[0], ew, up: faces.u, dn: faces.d };
}

const shape = (name) => SHAPES[name] ?? SHAPES.cube;
const all = (t) => ({ tex: t, ew: t, up: t, dn: t });

export function lookOf(block, facing) {
  const entry = block && BLOCKS[block.typeId];
  if (!entry) return undefined;
  const type = kind(entry);
  const faces = worldFaces(entry, block);
  let look = { ...modelTextures(faces, facing), sh: SHAPES.cube, ax: 0 };
  const side = (world) => modelDir(world, facing);
  if (type === 'cube') {
    const axis = AXES[String(state(block, 'pillar_axis'))];
    if (axis) look = { ...look, ...all(faces.ring[0]), up: faces.u, dn: faces.d, ew: faces.ring[1], ax: modelAxis(axis, facing) };
    else if (axis === 0) look = { ...look, tex: faces.ring[0], ew: faces.ring[1] };
  } else if (type === 'slab') {
    look.sh = shape(state(block, 'minecraft:vertical_half') === 'top' ? 'slab_hi' : 'slab_lo');
  } else if (type === 'stairs') {
    const high = WEIRDO[Number(state(block, 'weirdo_direction')) & 3];
    const mask = stairMask(high, String(state(block, 'minecraft:corner') ?? 'straight'), facing);
    look.sh = shape(`stair_${mask}${state(block, 'upside_down_bit') ? '_ud' : ''}`);
  } else if (type === 'fence' || type === 'pane' || type === 'wall') {
    let mask = 0;
    ['north', 'east', 'south', 'west'].forEach((name, world) => {
      const joined = type === 'wall' ? String(state(block, `wall_connection_type_${name}`) ?? 'none') !== 'none' : !!state(block, `minecraft:connection_${name}`);
      if (joined) mask |= 1 << side(world);
    });
    look.sh = shape(`${type}_${mask}`);
  } else if (type === 'gate') {
    const front = horizontalFacing(block) ?? N;
    look.sh = shape(state(block, 'open_bit') ? 'fence_0' : `fence_${(1 << side(turn(front, 1))) | (1 << side(turn(front, -1)))}`);
  } else if (type === 'door') {
    const front = horizontalFacing(block) ?? E;
    let panel = turn(front, 2);
    if (state(block, 'open_bit')) panel = turn(panel, state(block, 'door_hinge_bit') ? -1 : 1);
    const t = state(block, 'upper_block_bit') ? faces.ring[0] : faces.d;
    look = { ...look, ...all(t), sh: shape(`panel_${side(panel)}`) };
  } else if (type === 'trapdoor') {
    const direction = Number(state(block, 'direction')) & 3;
    const front = WEIRDO[direction];
    if (state(block, 'open_bit')) look.sh = shape(`panel_${side(turn(front, 2))}`);
    else look.sh = shape(state(block, 'upside_down_bit') ? 'box_16_3_13' : 'box_16_3_0');
  } else if (type === 'torch') {
    const toward = String(state(block, 'torch_facing_direction') ?? 'top');
    look.sh = toward in CARDINAL ? shape(`wall_torch_${side(turn(CARDINAL[toward], 2))}`) : SHAPES.torch;
  } else if (type === 'lantern') {
    look.sh = shape(state(block, 'hanging') ? 'lantern_hanging' : 'lantern');
  } else if (type === 'candle') {
    look.sh = shape('box_2_6_0');
  } else if (type === 'rod') {
    const six = state(block, 'facing_direction');
    const axis = typeof six === 'number' ? (six < 2 ? 0 : six < 4 ? 2 : 1) : AXES[String(state(block, 'pillar_axis'))] ?? 0;
    look = { ...look, sh: entry.b ?? SHAPES.cube, ax: modelAxis(axis, facing) };
  } else if (type === 'liquid') {
    const depth = Number(state(block, 'liquid_depth') ?? 0);
    look.sh = depth >= 8 ? SHAPES.cube : shape(`box_16_${Math.max(2, Math.round(14 - depth * 1.75))}_0`);
  } else if (type === 'carpet') {
    look.sh = shape('box_16_1_0');
  } else if (type === 'plate') {
    look.sh = shape('box_14_1_0');
  } else if (type === 'snow') {
    const height = 2 * ((Number(state(block, 'height')) & 7) + 1);
    look.sh = height >= 16 ? SHAPES.cube : shape(`box_16_${height}_0`);
  } else if (type === 'rail') {
    look = { ...look, ...all(faces.d), sh: shape('box_16_1_0') };
  } else if (type === 'ladder') {
    const front = FACING6[Number(state(block, 'facing_direction'))] ?? N;
    look = { ...look, ...all(faces.ring[0]), sh: shape(`thin_${side(turn(front < 0 ? N : front, 2))}`) };
  } else if (type === 'cross') {
    let t = faces.ring[0];
    if (entry.g) t = entry.g[Math.min(entry.g.length - 1, Math.floor((Number(state(block, 'growth') ?? 0) * entry.g.length) / 8))];
    else if (state(block, 'upper_block_bit') !== undefined) t = state(block, 'upper_block_bit') ? faces.u : faces.d;
    look = { ...look, ...all(t), sh: SHAPES.cross };
  } else if (type === 'box') {
    look.sh = entry.b ?? SHAPES.cube;
  }
  return look;
}

export const MIRRORED_TYPES = Object.keys(BLOCKS);
export { N, E, S, W };
