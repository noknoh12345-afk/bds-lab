// LeviKit 観察ビュー: スナップショットのブロックをバニラのテクスチャで描き、参加者の現在地をリアルタイムに重ねる
import * as THREE from 'three';
import { OrbitControls } from '/vendor/three/OrbitControls.js';
// (text from the server — player names, world and backup names — always as text, never as HTML)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const $ = (s) => document.querySelector(s);
const status = (t) => ($('#status').textContent = t);
const qs = new URLSearchParams(location.search);

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'x-levikit': '1', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status === 401) {
    location.href = '/';
    throw new Error('ログインしてください');
  }
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

// ---------- three ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x78a7ff);
scene.fog = new THREE.Fog(0x9cc2ff, 90, 240);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
camera.position.set(-30, 110, -30);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(8, 64, 8);
controls.enableDamping = true;
// 光は頂点色に焼き込む（面の向きの明るさ・環境光遮蔽・空の見え方）。three の光は均一な環境光だけ
scene.add(new THREE.AmbientLight(0xffffff, Math.PI));

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// WASD で飛ぶ
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const clock = { last: performance.now(), getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; return d; } };
function tick() {
  const dt = Math.min(0.1, clock.getDelta());
  const speed = (keys.has('shift') ? 60 : 20) * dt;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const move = new THREE.Vector3();
  if (keys.has('w')) move.add(fwd);
  if (keys.has('s')) move.sub(fwd);
  if (keys.has('d')) move.add(right);
  if (keys.has('a')) move.sub(right);
  if (keys.has('e') || keys.has(' ')) move.y += 1;
  if (keys.has('q')) move.y -= 1;
  if (move.lengthSq()) {
    move.normalize().multiplyScalar(speed);
    camera.position.add(move);
    controls.target.add(move);
  }
  followTick();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------- テクスチャの寄せ集め（アトラス） ----------
const TILE = 16;
async function buildAtlas(paths) {
  const list = ['__white', ...paths];
  const cols = Math.ceil(Math.sqrt(list.length));
  const rows = Math.ceil(list.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * TILE;
  cv.height = rows * TILE;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, TILE, TILE);
  const uv = new Map();
  list.forEach((p, i) => uv.set(p, { u0: (i % cols) / cols, v0: Math.floor(i / cols) / rows, du: 1 / cols, dv: 1 / rows }));
  await Promise.all(
    paths.map(
      (p, k) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const i = k + 1;
            g.drawImage(img, 0, 0, img.width, Math.min(img.height, img.width), (i % cols) * TILE, Math.floor(i / cols) * TILE, TILE, TILE);
            resolve();
          };
          img.onerror = () => {
            uv.set(p, uv.get('__white'));
            resolve();
          };
          img.src = `/api/tex/${p}.png`;
        })
    )
  );
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, uv };
}

// ---------- メッシュ（本家に近い描画） ----------
//   参考: cinnabar-mc/cinnabar の描画方式（状態に応じた形・頂点ごとの環境光遮蔽・バイオームの色・液体の高さ）
//   コードは独自実装（cinnabar は PolyForm Noncommercial のため流用していない）

// バイオーム ID → 草・葉・水の色（統合版の数値 ID）
const BIOME = (() => {
  const t = {};
  const set = (ids, grass, foliage, water = 0x44aff5) => ids.forEach((i) => (t[i] = { grass, foliage, water }));
  set([1, 129, 177], 0x91bd59, 0x77ab2f); // plains, sunflower_plains
  set([2, 17, 130], 0xbfb755, 0xaea42a, 0x32a598); // desert
  set([3, 20, 34, 131, 162], 0x8ab689, 0x6da36b, 0x007bf7); // windswept / extreme hills
  set([4, 18, 132], 0x79c05a, 0x59ae30, 0x1e97f2); // forest, flower_forest
  set([5, 19, 133], 0x86b783, 0x68a464, 0x287082); // taiga
  set([32, 33, 160, 161], 0x86b87f, 0x68a55f, 0x2d6d77); // old growth taiga
  set([6, 134], 0x6a7039, 0x6a7039, 0x4c6559); // swamp
  set([191], 0x8db127, 0x8db127, 0x3a7a6a); // mangrove swamp
  set([7], 0x8eb971, 0x71a74d, 0x0084ff); // river
  set([11], 0x80b497, 0x60a17b, 0x185390); // frozen river
  set([12, 13, 140, 30, 31, 158, 26, 184, 183], 0x80b497, 0x60a17b, 0x14559b); // snowy
  set([14, 15], 0x55c93f, 0x2bbb0f, 0x8a8997); // mushroom
  set([16], 0x91bd59, 0x77ab2f, 0x157cab); // beach
  set([25, 189], 0x8ab689, 0x6da36b, 0x0d67bb); // stony shore / peaks
  set([21, 22, 149, 48, 49], 0x59c93c, 0x30bb0b, 0x14a2c5); // jungle
  set([23, 151], 0x64c73f, 0x3eb80f, 0x0d8ae3); // sparse jungle
  set([27, 28, 155, 156], 0x88bb67, 0x6ba941, 0x0677ce); // birch
  set([29, 157], 0x507a32, 0x59ae30, 0x3b6cd1); // dark forest
  set([35, 36, 163, 164], 0xbfb755, 0xaea42a, 0x2c8b9c); // savanna
  set([37, 38, 39, 165, 166, 167], 0x90814d, 0x9e814d, 0x4e7f81); // badlands
  set([0, 24], 0x8eb971, 0x71a74d, 0x1787d4); // ocean
  set([40, 41], 0x8eb971, 0x71a74d, 0x02b0e5); // warm ocean
  set([42, 43], 0x8eb971, 0x71a74d, 0x0d96db); // lukewarm
  set([44, 45], 0x8eb971, 0x71a74d, 0x2080c9); // cold
  set([10, 46, 47], 0x80b497, 0x60a17b, 0x2570b5); // frozen ocean
  set([185], 0x80b497, 0x60a17b, 0x0e63ab); // grove
  set([186], 0x83bb6d, 0x63a948, 0x0e4ecf); // meadow
  set([182], 0x80b497, 0x60a17b, 0x0e63ab); // jagged peaks
  set([187], 0x8eb971, 0x71a74d); // lush caves
  set([188, 190], 0x91bd59, 0x77ab2f); // dripstone / deep dark
  set([192], 0xb6db61, 0xb6db61, 0x5db7ef); // cherry grove
  set([193], 0x778272, 0x878d76, 0x76889d); // pale garden
  set([8, 178, 179, 180, 181], 0xbfb755, 0xaea42a, 0x905957); // nether
  set([9], 0x8eb971, 0x71a74d, 0x62529e); // the end
  return t;
})();
const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// 面: 法線・接線（UV の向き）
const DIRS = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], shade: 0.6, t: 'side' },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.6, t: 'side' },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], shade: 1.0, t: 'up' },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.5, t: 'down' },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.8, t: 'side' },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], shade: 0.8, t: 'side' },
];
const AO_LEVEL = [0.42, 0.6, 0.8, 1.0];

class Buf {
  constructor() {
    this.p = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  /** corners: 4 頂点（反時計回り）, uvs: 4 組, cols: 4 色, flip: 対角線の向き */
  quad(corners, uvs, cols, flip = false) {
    const b = this.p.length / 3;
    for (let i = 0; i < 4; i++) {
      this.p.push(corners[i][0], corners[i][1], corners[i][2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      // 色は見た目（sRGB）で計算しているので、three の線形色に直す
      this.col.push(cols[i][0] ** 2.2, cols[i][1] ** 2.2, cols[i][2] ** 2.2);
    }
    if (flip) this.idx.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
    else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  mesh(material) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

const hashColor = (s) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return [0.45 + ((h & 255) / 255) * 0.4, 0.45 + (((h >> 8) & 255) / 255) * 0.4, 0.45 + (((h >> 16) & 255) / 255) * 0.4];
};

/** パレットのキー "名前|{状態}#種類" を分解 */
function parseKey(key) {
  let k = key;
  let variant = 0;
  const m = /#(\d+)$/.exec(k);
  if (m) {
    variant = Number(m[1]);
    k = k.slice(0, m.index);
  }
  const bar = k.indexOf('|');
  const name = (bar < 0 ? k : k.slice(0, bar)).replace(/^minecraft:/, '');
  let st = {};
  if (bar >= 0) {
    try {
      st = JSON.parse(k.slice(bar + 1));
    } catch {
      st = {};
    }
  }
  return { name, st, variant };
}

const CARD = { north: 2, south: 0, west: 1, east: 3 }; // 南=0 西=1 北=2 東=3
/** 箱 [x0,y0,z0,x1,y1,z1]（0〜16）を Y 軸まわりに回す（rot: 南向き基準で 90° 単位） */
function rotY(b, rot) {
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) [x0, z0, x1, z1] = [16 - z1, x0, 16 - z0, x1];
  return [Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1)];
}

/**
 * ブロックの形（箱の一覧）。full: 1 マスを埋める普通のブロック
 *   nb(dx,dy,dz) は隣のブロックの情報（柵・壁・板ガラスのつながり用）
 */
function shapeOf(name, st, nb) {
  const half = st['minecraft:vertical_half'] ?? (st.top_slot_bit ? 'top' : 'bottom');
  if (/slab$/.test(name) && !/double/.test(name)) return { boxes: [half === 'top' ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16]] };
  if (/stairs$/.test(name)) {
    const up = !!st.upside_down_bit;
    const d = st.weirdo_direction ?? 0; // 0:東 1:西 2:南 3:北（上る向き）
    const step = [[8, 0, 0, 16, 8, 16], [0, 0, 0, 8, 8, 16], [0, 0, 8, 16, 8, 16], [0, 0, 0, 16, 8, 8]][d] || [8, 0, 0, 16, 8, 16];
    const s = [step[0], up ? 0 : 8, step[2], step[3], up ? 8 : 16, step[5]];
    return { boxes: [up ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16], s] };
  }
  if (name === 'snow_layer') return { boxes: [[0, 0, 0, 16, Math.min(16, ((st.height ?? 0) + 1) * 2), 16]] };
  if (/carpet$/.test(name)) return { boxes: [[0, 0, 0, 16, 1, 16]] };
  if (/pressure_plate$/.test(name)) return { boxes: [[1, 0, 1, 15, 1, 15]] };
  if (name === 'farmland' || name === 'grass_path' || name === 'dirt_path') return { boxes: [[0, 0, 0, 16, 15, 16]] };
  if (/(^|_)chest$/.test(name) || name === 'ender_chest') return { boxes: [[1, 0, 1, 15, 14, 15]] };
  if (name === 'cactus') return { boxes: [[1, 0, 1, 15, 16, 15]] };
  if (/(^|_)torch$/.test(name)) return { boxes: [[7, 0, 7, 9, 10, 9]] };
  if (/lantern$/.test(name)) return { boxes: [[5, st.hanging ? 2 : 0, 5, 11, st.hanging ? 9 : 7, 11]] };
  if (name === 'end_rod' || name === 'lightning_rod') return { boxes: [[7, 0, 7, 9, 16, 9]] };
  if (/(^|_)bed$/.test(name)) return { boxes: [[0, 3, 0, 16, 9, 16]] };
  if (/(^|_)cake$/.test(name)) return { boxes: [[1, 0, 1, 15, 8, 15]] };
  if (name === 'enchanting_table') return { boxes: [[0, 0, 0, 16, 12, 16]] };
  if (/daylight_detector/.test(name)) return { boxes: [[0, 0, 0, 16, 6, 16]] };
  if (/trapdoor$/.test(name)) {
    if (st.open_bit) {
      const d = st.direction ?? 0;
      return { boxes: [rotY([0, 0, 13, 16, 16, 16], [3, 1, 0, 2][d] ?? 0)] };
    }
    return { boxes: [st.upside_down_bit ? [0, 13, 0, 16, 16, 16] : [0, 0, 0, 16, 3, 16]] };
  }
  if (/door$/.test(name)) {
    const d = st.direction ?? (CARD[st['minecraft:cardinal_direction']] ?? 0);
    const rot = ([3, 0, 1, 2][d] ?? 0) + (st.open_bit ? (st.door_hinge_bit ? 3 : 1) : 0);
    return { boxes: [rotY([0, 0, 0, 16, 16, 3], rot)] };
  }
  const isFence = /fence$/.test(name) && !/gate/.test(name);
  const isWall = /(^|_)wall$/.test(name) && !/sign|banner|torch|fan|head/.test(name);
  const isPane = /pane$/.test(name) || name === 'iron_bars';
  if (isFence || isWall || isPane) {
    const fam = isFence ? /fence/ : isWall ? /(^|_)wall$/ : /(pane$|iron_bars)/;
    const conn = (dx, dz) => {
      const o = nb(dx, 0, dz);
      return o && (o.full || fam.test(o.name) || (isFence && /fence_gate/.test(o.name)));
    };
    const boxes = [isFence ? [6, 0, 6, 10, 16, 10] : isWall ? [4, 0, 4, 12, 16, 12] : [7, 0, 7, 9, 16, 9]];
    const arm = isFence ? [[7, 12, 0, 9, 15, 6], [7, 6, 0, 9, 9, 6]] : isWall ? [[5, 0, 0, 11, 14, 8]] : [[7, 0, 0, 9, 16, 8]];
    [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]].forEach(([dx, dz, r]) => {
      if (conn(dx, dz)) for (const a of arm) boxes.push(rotY(a, [0, 3, 2, 1][r]));
    });
    return { boxes };
  }
  if (/fence_gate$/.test(name)) {
    const d = st.direction ?? 0;
    return { boxes: [d % 2 === 0 ? [0, 5, 7, 16, 16, 9] : [7, 5, 0, 9, 16, 16]] };
  }
  return null; // 普通の立方体
}

let regionGroup = null;
let loaded = null;

async function loadRegion() {
  const at = $('#at').value;
  if (!at) return status('時点がありません。「📷 今の状態を撮る」を押してください');
  const world = $('#world').value;
  const bx = Number($('#x').value) || 0;
  const bz = Number($('#z').value) || 0;
  const cx = Math.floor(bx / 16);
  const cz = Math.floor(bz / 16);
  const r = Number($('#r').value) || 4;
  status('ブロックを読み込み中…');
  const t0 = performance.now();
  const d = await api('GET', `/api/view3d/region?b=${encodeURIComponent(at)}&w=${encodeURIComponent(world)}&cx=${cx}&cz=${cz}&r=${r}`);
  const paths = new Set();
  for (const f of Object.values(d.faces)) if (f) for (const k of ['up', 'down', 'side']) if (f[k]) paths.add(f[k]);
  status(`テクスチャ ${paths.size} 枚を読み込み中…`);
  const atlas = await buildAtlas([...paths]);
  status('形を組み立て中…');
  await new Promise((r2) => setTimeout(r2, 0));

  const subs = new Map();
  const dec = (b64, T = Uint16Array) => {
    if (!b64) return null;
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return T === Uint8Array ? u8 : new T(u8.buffer);
  };
  for (const s of d.subchunks) subs.set(`${s.x},${s.z},${s.y}`, { main: dec(s.data), water: dec(s.water) });
  const biomeCols = new Map();
  for (const b of d.biomes || []) biomeCols.set(`${b.x},${b.z}`, dec(b.data, Uint8Array));
  const biomeAt = (x, z) => {
    const ccx = Math.floor(x / 16);
    const ccz = Math.floor(z / 16);
    const a = biomeCols.get(`${ccx},${ccz}`);
    return BIOME[a ? a[(x - ccx * 16) * 16 + (z - ccz * 16)] : 1] || BIOME[1];
  };
  // 色合い（周り 3×3 の平均で、境目をなめらかに）
  const tintCache = new Map();
  const biomeTint = (x, z, kind) => {
    const key = `${x},${z},${kind}`;
    let c = tintCache.get(key);
    if (c) return c;
    c = [0, 0, 0];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const v = rgb(biomeAt(x + dx, z + dz)[kind]);
      c[0] += v[0] / 9;
      c[1] += v[1] / 9;
      c[2] += v[2] / 9;
    }
    tintCache.set(key, c);
    return c;
  };

  const info = d.palette.map((key) => {
    if (key === 'minecraft:air') return null;
    const { name, st } = parseKey(key);
    const f = d.faces[key] || { missing: true, kind: 'solid', solid: true, color: hashColor(name) };
    const liquid = /(^|_)water$|^flowing_water$|bubble_column/.test(name) ? 'water' : /lava$/.test(name) ? 'lava' : null;
    const tintKind = /water|bubble_column/.test(name) ? 'water' : /leaves|vine/.test(name) && !/(cherry|azalea|pale|birch|spruce)/.test(name) ? 'foliage' : f.tint ? 'grass' : null;
    const fixedTint = /birch_leaves/.test(name) || (name === 'leaves' && false) ? [0x80 / 255, 0xa7 / 255, 0x55 / 255] : /spruce_leaves/.test(name) ? [0x61 / 255, 0x99 / 255, 0x61 / 255] : null;
    return { name, st, f, liquid, tintKind, fixedTint, full: !liquid && f.kind === 'solid' && f.solid !== false, depth: st.liquid_depth ?? 0 };
  });
  // 形は隣を見るものがあるので、ID ごとに「普通の立方体か」だけ先に決める
  const plainCube = info.map((b) => b && !b.liquid && b.f.kind !== 'cross' && !shapeOf(b.name, b.st, () => null) && !/fence|wall$|pane$|iron_bars/.test(b.name));
  for (let i = 0; i < info.length; i++) if (info[i]) info[i].full = info[i].full && plainCube[i];

  const blockAt = (x, y, z, layer = 'main') => {
    const cx2 = Math.floor(x / 16);
    const cz2 = Math.floor(z / 16);
    const s = subs.get(`${cx2},${cz2},${Math.floor(y / 16)}`);
    const a = s && s[layer];
    if (!a) return 0;
    return a[((x - cx2 * 16) << 8) | ((z - cz2 * 16) << 4) | (((y % 16) + 16) % 16)];
  };
  const opaque = (x, y, z) => {
    const id = blockAt(x, y, z);
    return !!(id && info[id]?.full);
  };
  const liquidAt = (x, y, z, kind) => {
    const a = info[blockAt(x, y, z)];
    if (a?.liquid === kind) return a;
    const w = info[blockAt(x, y, z, 'water')];
    return w?.liquid === kind ? w : null;
  };

  // 空が見えるか（列ごとの一番上の不透明ブロック）→ 洞窟や屋根の下は暗く
  const colTop = new Map();
  const topOf = (x, z) => {
    const k = `${x},${z}`;
    let t = colTop.get(k);
    if (t !== undefined) return t;
    t = -9999;
    for (let y = d.minY + d.height - 1; y >= d.minY; y--) {
      if (opaque(x, y, z)) {
        t = y;
        break;
      }
    }
    colTop.set(k, t);
    return t;
  };
  const skyAt = (x, y, z) => (y > topOf(x, z) ? 1 : 0.55);

  const solidBuf = new Buf();
  const cutBuf = new Buf();
  const glassBuf = new Buf();
  const glowBuf = new Buf();
  const white = atlas.uv.get('__white');
  let faces = 0;

  const tintFor = (b, face, x, z) => {
    if (b.f.missing) return b.f.color;
    if (b.fixedTint) return b.fixedTint;
    if (!b.tintKind) return [1, 1, 1];
    if (b.tintKind === 'grass' && b.f.tint && !b.f.tint.all && !b.f.tint[face]) return [1, 1, 1]; // 草ブロックは上面だけ
    return biomeTint(x, z, b.tintKind);
  };

  /** 箱の 1 面を出す（AO 付き） */
  const emitFace = (buf, b, x, y, z, box, dir, light = true) => {
    const [x0, y0, z0, x1, y1, z1] = box.map((v) => v / 16);
    const n = dir.n;
    // 面の 4 隅（反時計回り）
    let c;
    if (n[0] === 1) c = [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]];
    else if (n[0] === -1) c = [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
    else if (n[1] === 1) c = [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
    else if (n[1] === -1) c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
    else if (n[2] === 1) c = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    else c = [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]];
    // UV（テクスチャの対応する部分）
    const path = b.f.missing ? null : b.f[dir.t];
    const t = (path && atlas.uv.get(path)) || white;
    const uvOf = ([px, py, pz]) => {
      let u, v;
      if (n[1] !== 0) {
        u = px;
        v = n[1] > 0 ? 1 - pz : pz;
      } else if (n[0] !== 0) {
        u = n[0] > 0 ? 1 - pz : pz;
        v = 1 - py;
      } else {
        u = n[2] > 0 ? px : 1 - px;
        v = 1 - py;
      }
      return [t.u0 + Math.min(1, Math.max(0, u)) * t.du, t.v0 + Math.min(1, Math.max(0, v)) * t.dv];
    };
    const tint = tintFor(b, dir.t, x, z);
    // 外側のセル（面がブロックの境界にあるときだけ AO）
    const onEdge = (n[0] === 1 && x1 === 1) || (n[0] === -1 && x0 === 0) || (n[1] === 1 && y1 === 1) || (n[1] === -1 && y0 === 0) || (n[2] === 1 && z1 === 1) || (n[2] === -1 && z0 === 0);
    const ox = x + n[0];
    const oy = y + n[1];
    const oz = z + n[2];
    const sky = light ? skyAt(ox, oy, oz) : 1;
    const aos = [];
    const cols = c.map((p) => {
      let ao = 3;
      if (light && onEdge) {
        // 隅の方向（面内の 2 軸）
        const s = [0, 0, 0];
        for (let k = 0; k < 3; k++) if (n[k] === 0) s[k] = p[k] - [x, y, z][k] > 0.5 ? 1 : -1;
        const axes = [0, 1, 2].filter((k) => n[k] === 0);
        const a1 = [0, 0, 0];
        const a2 = [0, 0, 0];
        a1[axes[0]] = s[axes[0]];
        a2[axes[1]] = s[axes[1]];
        const side1 = opaque(ox + a1[0], oy + a1[1], oz + a1[2]);
        const side2 = opaque(ox + a2[0], oy + a2[1], oz + a2[2]);
        const corner = opaque(ox + a1[0] + a2[0], oy + a1[1] + a2[1], oz + a1[2] + a2[2]);
        ao = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
      }
      aos.push(ao);
      const l = (light ? AO_LEVEL[ao] * dir.shade * sky : 1);
      return [tint[0] * l, tint[1] * l, tint[2] * l];
    });
    buf.quad(c.map(([a, bb, cc]) => [x + a, y + bb, z + cc]), c.map(uvOf), cols, aos[0] + aos[2] < aos[1] + aos[3]);
    faces++;
  };

  const emitBlock = (x, y, z, id) => {
    const b = info[id];
    if (!b) return;
    const f = b.f;
    if (b.liquid) {
      const kind = b.liquid;
      const above = liquidAt(x, y + 1, z, kind);
      const h = above ? 16 : b.depth >= 8 ? 16 : Math.max(2, ((8 - (b.depth % 8)) / 8) * 14);
      const buf = kind === 'lava' ? glowBuf : glassBuf;
      for (const dir of DIRS) {
        const nx = x + dir.n[0];
        const ny = y + dir.n[1];
        const nz = z + dir.n[2];
        if (liquidAt(nx, ny, nz, kind)) continue;
        if (opaque(nx, ny, nz) && !(dir.n[1] === 1 && h < 16)) continue;
        emitFace(buf, b, x, y, z, [0, 0, 0, 16, h, 16], dir, kind !== 'lava');
      }
      return;
    }
    if (f.kind === 'cross') {
      const t = atlas.uv.get(f.down) || atlas.uv.get(f.side) || white;
      const tint = tintFor(b, 'side', x, z);
      const l = skyAt(x, y, z) * 0.92;
      const col = [tint[0] * l, tint[1] * l, tint[2] * l];
      const uv = [[t.u0, t.v0 + t.dv], [t.u0 + t.du, t.v0 + t.dv], [t.u0 + t.du, t.v0], [t.u0, t.v0]];
      const q = 0.15;
      cutBuf.quad([[x + q, y, z + q], [x + 1 - q, y, z + 1 - q], [x + 1 - q, y + 1, z + 1 - q], [x + q, y + 1, z + q]], uv, [col, col, col, col]);
      cutBuf.quad([[x + 1 - q, y, z + q], [x + q, y, z + 1 - q], [x + q, y + 1, z + 1 - q], [x + 1 - q, y + 1, z + q]], uv, [col, col, col, col]);
      faces += 2;
      return;
    }
    const buf = f.kind === 'translucent' ? glassBuf : f.kind === 'cutout' ? cutBuf : solidBuf;
    const nb = (dx, dy, dz) => info[blockAt(x + dx, y + dy, z + dz)];
    const shape = shapeOf(b.name, b.st, nb);
    if (!shape) {
      // 普通の立方体: 隣が不透明なら面を省く。同じ種類のガラス・葉どうしも省く
      for (const dir of DIRS) {
        const nx = x + dir.n[0];
        const ny = y + dir.n[1];
        const nz = z + dir.n[2];
        if (opaque(nx, ny, nz)) continue;
        if (f.kind !== 'solid' && blockAt(nx, ny, nz) === id && !/leaves/.test(b.name)) continue;
        emitFace(buf, b, x, y, z, [0, 0, 0, 16, 16, 16], dir);
      }
      // 原木などの向き（横倒し）: pillar_axis x/z は上面の模様を横に
      return;
    }
    for (const box of shape.boxes) {
      for (const dir of DIRS) {
        const n = dir.n;
        const edge = (n[0] === 1 && box[3] === 16) || (n[0] === -1 && box[0] === 0) || (n[1] === 1 && box[4] === 16) || (n[1] === -1 && box[1] === 0) || (n[2] === 1 && box[5] === 16) || (n[2] === -1 && box[2] === 0);
        if (edge && opaque(x + n[0], y + n[1], z + n[2])) continue;
        emitFace(buf, b, x, y, z, box, dir);
      }
    }
  };

  // 原木の向き: pillar_axis が x / z のときは上下と横のテクスチャを入れ替える
  for (const b of info) {
    if (!b || !b.st.pillar_axis || b.st.pillar_axis === 'y') continue;
    b.axis = b.st.pillar_axis;
  }
  const origEmit = emitFace;

  for (const s of d.subchunks) {
    const S = subs.get(`${s.x},${s.z},${s.y}`);
    for (let i = 0; i < 4096; i++) {
      const x = s.x * 16 + (i >> 8);
      const y = s.y * 16 + (i & 15);
      const z = s.z * 16 + ((i >> 4) & 15);
      const id = S.main ? S.main[i] : 0;
      if (id) {
        const b = info[id];
        if (b?.axis) {
          // 横倒しの原木: 面の役割を入れ替えて描く
          const f0 = b.f;
          const axisN = b.axis === 'x' ? 0 : 2;
          for (const dir of DIRS) {
            const nx = x + dir.n[0];
            const ny = y + dir.n[1];
            const nz = z + dir.n[2];
            if (opaque(nx, ny, nz)) continue;
            const role = dir.n[axisN] !== 0 ? 'up' : 'side';
            origEmit(solidBuf, { ...b, f: { ...f0, up: f0[role], down: f0[role], side: f0[role] } }, x, y, z, [0, 0, 0, 16, 16, 16], dir);
          }
        } else emitBlock(x, y, z, id);
      }
      const w = S.water ? S.water[i] : 0;
      if (w && info[w]?.liquid) emitBlock(x, y, z, w);
    }
  }

  if (regionGroup) {
    scene.remove(regionGroup);
    regionGroup.traverse((o) => o.geometry?.dispose());
  }
  regionGroup = new THREE.Group();
  const matSolid = new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true });
  const matCut = new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5 });
  const matGlass = new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false });
  const matGlow = new THREE.MeshBasicMaterial({ map: atlas.tex, vertexColors: true });
  for (const m of [solidBuf.mesh(matSolid), cutBuf.mesh(matCut), glowBuf.mesh(matGlow), glassBuf.mesh(matGlass)]) {
    if (!m) continue;
    if (m.material === matGlass) m.renderOrder = 2;
    regionGroup.add(m);
  }
  // 頂点色に光を焼き込んでいるので、環境光は均一に
  scene.add(regionGroup);
  loaded = { cx, cz, r, world };
  if (!keepCamera) {
    let top = d.minY + 64;
    for (let y = d.minY + d.height - 1; y > d.minY; y--) {
      if (blockAt(bx, y, bz) || blockAt(bx, y, bz, 'water')) {
        top = y;
        break;
      }
    }
    controls.target.set(bx + 0.5, top, bz + 0.5);
    camera.position.set(bx - 40, top + 45, bz - 40);
  }
  keepCamera = false;
  status(`${d.subchunks.length} サブチャンク / ${faces.toLocaleString()} 面 / ${d.palette.length - 1} 種類（${Math.round(performance.now() - t0)} ms）— 時点: ${$('#at').selectedOptions[0]?.textContent || ''}`);
  history.replaceState(null, '', `?w=${encodeURIComponent(world)}&x=${bx}&z=${bz}&b=${encodeURIComponent(at)}`);
}

// ---------- プレイヤー（ライブ） ----------
const markers = new Map();
function nameSprite(text) {
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  g.font = 'bold 28px sans-serif';
  cv.width = Math.ceil(g.measureText(text).width) + 16;
  cv.height = 40;
  g.font = 'bold 28px sans-serif';
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#fff';
  g.fillText(text, 8, 29);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(cv.width / 40, 1, 1);
  sp.renderOrder = 10;
  return sp;
}
let lastPos = { players: [] };
function updatePlayers(pos) {
  lastPos = pos || lastPos;
  const world = $('#world').value;
  const seen = new Set();
  for (const p of lastPos.players || []) {
    if (p.w !== world) continue;
    seen.add(p.n);
    let m = markers.get(p.n);
    if (!m) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshLambertMaterial({ color: 0x3ddc84, emissive: 0x114422 }));
      body.position.y = 0.9;
      g.add(body);
      const label = nameSprite(p.n);
      label.position.y = 2.4;
      g.add(label);
      g.userData.label = label;
      scene.add(g);
      m = g;
      markers.set(p.n, m);
    }
    m.userData.target = new THREE.Vector3(p.x + 0.5, p.y, p.z + 0.5);
    if (!m.userData.placed) {
      m.position.copy(m.userData.target);
      m.userData.placed = true;
    }
    m.userData.label.visible = $('#names').checked;
  }
  for (const [n, m] of markers) {
    if (!seen.has(n)) {
      scene.remove(m);
      markers.delete(n);
    }
  }
  const sel = $('#follow');
  const cur = sel.value;
  const names = [...seen].sort();
  const opts = ['', ...names];
  if (sel.options.length !== opts.length || [...sel.options].some((o, i) => o.value !== opts[i])) {
    sel.innerHTML = opts.map((n) => `<option value="${esc(n)}">${n ? esc(n) : '（なし）'}</option>`).join('');
    sel.value = names.includes(cur) ? cur : '';
  }
}
let keepCamera = false;
let reloading = false;
function followTick() {
  for (const m of markers.values()) if (m.userData.target) m.position.lerp(m.userData.target, 0.15);
  const who = $('#follow').value;
  const m = who && markers.get(who);
  if (!m) return;
  const delta = m.position.clone().sub(controls.target);
  controls.target.add(delta);
  camera.position.add(delta);
  // 読み込んだ範囲から出たら、その場所を読み直す（ブロックは時点のまま・位置はリアルタイム）
  if (loaded && !reloading) {
    const pcx = Math.floor(m.position.x / 16);
    const pcz = Math.floor(m.position.z / 16);
    if (Math.abs(pcx - loaded.cx) > loaded.r - 1 || Math.abs(pcz - loaded.cz) > loaded.r - 1) {
      reloading = true;
      keepCamera = true;
      $('#x').value = Math.floor(m.position.x);
      $('#z').value = Math.floor(m.position.z);
      loadRegion()
        .catch((e) => status(e.message))
        .finally(() => (reloading = false));
    }
  }
}

// ダブルクリックで注目
renderer.domElement.addEventListener('dblclick', (e) => {
  if (!regionGroup) return;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(regionGroup.children)[0];
  if (hit) {
    const delta = hit.point.clone().sub(controls.target);
    controls.target.add(delta);
    camera.position.add(delta.multiplyScalar(0.5));
    status(`X ${Math.floor(hit.point.x)} / Y ${Math.floor(hit.point.y)} / Z ${Math.floor(hit.point.z)}`);
  }
});

// ---------- 画面 ----------
async function refreshList(select) {
  const l = await api('GET', '/api/view3d/list');
  $('#at').innerHTML = l.list.map((x) => `<option value="${esc(x.backupId)}">${new Date(x.createdAt).toLocaleString('ja-JP')}</option>`).join('') || '<option value="">（まだありません）</option>';
  if (select) $('#at').value = select;
  if (!l.textures) status('バニラのテクスチャがありません（install.sh で取得）。白いブロックで表示します');
  updatePlayers(l.pos);
  return l;
}

async function waitJob(id) {
  for (;;) {
    const st = await api('GET', '/api/state');
    const j = st.job;
    if (j && j.id === id && j.status !== 'running') {
      if (j.status !== 'done') throw new Error(j.error || '失敗しました');
      return j;
    }
    status(j?.log?.at(-1)?.replace(/^\[[^\]]*\]\s*/, '') || '準備中…');
    await new Promise((r) => setTimeout(r, 700));
  }
}

$('#shoot').addEventListener('click', async () => {
  try {
    status('スナップショットを撮っています（参加したまま）…');
    const job = await api('POST', '/api/view3d/prepare', {});
    const done = await waitJob(job.id);
    await refreshList(done.result.backupId);
    keepCamera = !!loaded;
    await loadRegion();
  } catch (e) {
    status(e.message);
  }
});
$('#load').addEventListener('click', () => loadRegion().catch((e) => status(e.message)));
$('#at').addEventListener('change', () => {
  keepCamera = true;
  loadRegion().catch((e) => status(e.message));
});
$('#world').addEventListener('change', () => {
  updatePlayers();
  loadRegion().catch((e) => status(e.message));
});
$('#names').addEventListener('change', () => updatePlayers());

(async () => {
  try {
    const dims = await api('GET', '/api/dimensions');
    const worlds = [['overworld', 'オーバーワールド'], ['nether', 'ネザー'], ['the_end', 'ジ・エンド'], ...dims.kit.dimensions.map((d) => [d.name, d.displayName || d.name])];
    $('#world').innerHTML = worlds.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    if (qs.get('w')) $('#world').value = qs.get('w');
    if (qs.get('x')) $('#x').value = qs.get('x');
    if (qs.get('z')) $('#z').value = qs.get('z');
    const l = await refreshList(qs.get('b'));
    const es = new EventSource('/api/events');
    es.addEventListener('pos', (e) => updatePlayers(JSON.parse(e.data)));
    if (l.list.length) await loadRegion();
    else status('「📷 今の状態を撮る」を押すと、参加したまま今のワールドを撮って表示します');
  } catch (e) {
    status(e.message);
  }
  tick();
})();
