// explore.mjs — ワールドの中で、移動・視点・ボタンの入力が「メモリのどこに入るか」を実測で突き止める(読むだけ・書かない)。
//
// world.mjs(0.3.1 の探索)はローカルプレイヤーの構造体(先頭 0x1800)しか見ない。1.2x の Bedrock は入力・向き・速度を
// ECS のコンポーネント(MoveInputComponent / ActorRotationComponent …)に持つので、そこを見ないと移動ベクタは出てこない。
// ここは mod 自身の読み取り API(__native.mc.comps でプレイヤーのコンポーネント一覧と番地、__native.dbg.read で読む)だけで:
//
//   1. 何もしない間に変わる所(時計・揺れ)を「雑音」として控える(2 区間の和)
//   2. 本物のコントローラ(lab-pad)で 1 つずつ入力し、押す前(A)・押している間(B)・離した後(C)を撮る
//      - follow : A≠B かつ C=A … 入力に「付いて来て戻る」値 = 入力の状態(移動ベクタ・ジャンプ・攻撃の押下 …)
//      - persist: A≠B かつ C=B … 入力で「変わって残る」値 = 結果(向き・選択スロット・位置 …)
//   3. 前進の 1.0 を全メモリから拾って(チートエンジン流)押す/離すで絞り、残った番地がどの構造体かを whereIs で
//   4. 次の段(関数の結線)のために RTTI の名前と型情報を控える
//
// 入力(scripteval.mjs が渡す): repl(probe.mjs openRepl)・pad(async words)・sleep・log。REPL 越しに読むだけ。
//   node explore.mjs --selftest     端末不要: 偽のコンポーネント入りのメモリと偽コントローラで follow/persist/scan を実走
import { fileURLToPath } from 'node:url';
import { fakeRepl, openRepl } from './probe.mjs';

// ---------------- 端末の中(scripteval の JS)に一度入れる道具: globalThis.__sx ----------------
// 読むのは __native(prelude の外の素の口)だけ。REPL のグローバルに mc は無い(prelude の中の局所変数)ので __native.mc を使う。
export const JS_INSTALL = String.raw`
globalThis.__sx = (() => {
  const N = __native, mc = N.mc, nd = N.dbg;
  const toAddr = (v) => typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : (typeof v === "string" && /^(0x)?[0-9a-f]+$/i.test(v)) ? parseInt(v, 16) : 0;
  const ADDR_KEYS = ["address", "componentAddress", "addr", "ptr", "component", "data"];
  const SIZE_KEYS = ["size", "bytes", "sizeof", "componentSize", "stride"];
  const pickAddr = (c) => { if (!c || typeof c !== "object") return 0; for (const k of ADDR_KEYS) { const a = toAddr(c[k]); if (a > 0x10000) return a; } return 0; };
  const pickSize = (c) => { if (!c || typeof c !== "object") return 0; for (const k of SIZE_KEYS) { const v = Number(c[k]); if (v > 0 && v < 0x10000) return v; } return 0; };
  const S = { regions: [], snaps: {}, cand: [] };
  const lp = () => { const r = mc.localPlayer(); return { a: toAddr(r[0]), e: r[1] }; };
  const keysOf = (o) => { try { return o ? Object.keys(o) : []; } catch { return []; } };
  function apis() { const o = {}; for (const k of keysOf(N)) o[k] = keysOf(N[k]).sort(); return o; }
  function setup(maxLen, lpLen) {
    const { a, e } = lp();
    let list = [];
    try { list = mc.comps(a, e) || []; } catch (err) { S.compsError = String(err && err.message || err); }
    S.regions = [{ name: "#LocalPlayer", addr: a, len: lpLen, size: 0 }];
    let first = null;
    for (const c of list) {
      let ad = pickAddr(c), sz = pickSize(c);
      // (一覧に番地が無い形なら、名前で 1 つずつ聞き直す)
      if (!ad && c && c.name) { try { const d = mc.comp(a, e, c.name); if (!first) first = d; ad = pickAddr(d); sz = sz || pickSize(d); } catch {} }
      if (!ad) continue;
      S.regions.push({ name: String(c && (c.name ?? c.type) || "?"), addr: ad, len: Math.max(8, Math.min(sz || maxLen, maxLen)), size: sz });
    }
    return { a: "0x" + a.toString(16), e: String(e), n: list.length, keys: keysOf(list[0]), sample: list.slice(0, 2), compSample: first, compsError: S.compsError ?? null,
      regions: S.regions.map(r => [r.name, r.len, r.size, "0x" + r.addr.toString(16)]) };
  }
  function take(tag) {
    const snaps = S.regions.map(r => { try { const b = nd.read(r.addr, r.len); return b ? new Uint8Array(b) : null; } catch { return null; } });
    let rot = null, loc = null;
    try { const p = world.getLocalPlayer(); rot = p.getRotation(); loc = p.location; } catch {}
    snaps.rot = rot; snaps.loc = loc;
    S.snaps[tag] = snaps;
    return { rot, loc, unread: snaps.filter(x => !x).length };
  }
  const dv = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const okF = (x) => Number.isFinite(x) && (x === 0 || (Math.abs(x) > 1e-6 && Math.abs(x) < 1e7));
  const val = (u8, o) => { const d = dv(u8), f = d.getFloat32(o, true); return okF(f) ? Math.round(f * 1e4) / 1e4 : "i" + (d.getUint32(o, true) | 0); };
  function changed(t1, t2) {
    const A = S.snaps[t1], B = S.snaps[t2], out = new Map();
    for (let i = 0; i < S.regions.length; i++) {
      const a = A && A[i], b = B && B[i]; if (!a || !b) continue;
      const da = dv(a), db = dv(b), n = Math.min(a.length, b.length) & ~3, s = new Set();
      for (let o = 0; o < n; o += 4) if (da.getUint32(o, true) !== db.getUint32(o, true)) s.add(o);
      if (s.size) out.set(i, s);
    }
    return out;
  }
  function noise(pairs) {
    const m = S.noise instanceof Map ? S.noise : new Map();
    for (const [x, y] of pairs) for (const [i, s] of changed(x, y)) { if (!m.has(i)) m.set(i, new Set()); for (const o of s) m.get(i).add(o); }
    S.noise = m; let n = 0; for (const s of m.values()) n += s.size; return n;
  }
  function classify(tA, tB, tC, lim) {
    const A = S.snaps[tA], B = S.snaps[tB], C = S.snaps[tC], out = [], nz = S.noise || new Map();
    for (let i = 0; i < S.regions.length; i++) {
      const a = A[i], b = B[i], c = C[i]; if (!a || !b || !c) continue;
      const da = dv(a), db = dv(b), dc = dv(c), n = Math.min(a.length, b.length, c.length) & ~3, ns = nz.get(i);
      const follow = [], persist = [];
      for (let o = 0; o < n; o += 4) {
        if (ns && ns.has(o)) continue;
        const va = da.getUint32(o, true), vb = db.getUint32(o, true), vc = dc.getUint32(o, true);
        if (va === vb) continue;
        const row = [o, val(a, o), val(b, o), val(c, o)];
        if (vc === va) follow.push(row); else if (vc === vb) persist.push(row);
      }
      if (follow.length || persist.length) out.push({ r: S.regions[i].name, f: follow.slice(0, lim), p: persist.slice(0, lim), nf: follow.length, np: persist.length });
    }
    return { rows: out, rot: [A.rot, B.rot, C.rot], loc: [A.loc, B.loc, C.loc] };
  }
  function names(words, n) { const o = {}; for (const w of words) { try { o[w] = nd.rttiSearch(w, n).map(t => t && t.name || String(t)); } catch (e) { o[w] = "ERR " + (e && e.message || e); } } return o; }
  function rtti(list) { const o = {}; for (const w of list) { try { o[w] = nd.rttiInfo(w); } catch (e) { o[w] = "ERR " + (e && e.message || e); } } return o; }
  function scan(v, max) { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v, true); const t0 = Date.now(); S.cand = nd.findU32(d.getUint32(0, true), max) || []; return { n: S.cand.length, ms: Date.now() - t0, capped: S.cand.length >= max }; }
  function refine(want, eps) { const t0 = Date.now(); S.cand = S.cand.filter(a => { let x = null; try { x = nd.f32(a); } catch {} return x !== null && x !== undefined && Math.abs(x - want) <= eps; }); return { n: S.cand.length, ms: Date.now() - t0 }; }
  function where(n) {
    const mod = (() => { try { return nd.module(); } catch { return null; } })();
    return S.cand.slice(0, n).map(a => { let w = null; try { w = nd.whereIs(a); } catch (e) { w = "ERR " + (e && e.message || e); } return { a: "0x" + a.toString(16), w }; });
  }
  function misc() {
    const o = {};
    const tryv = (k, f) => { try { o[k] = f(); } catch (e) { o[k] = "ERR " + (e && e.message || e); } };
    tryv("status", () => mc.status()); tryv("tick", () => mc.tickInfo()); tryv("offsets", () => mc.offsets());
    tryv("input", () => JSON.parse(N.input.status())); tryv("module", () => nd.module());
    tryv("ecs", () => { const l = nd.ecs(); return { n: l.length, sample: l.slice(0, 3), keys: keysOf(l[0]) }; });
    return o;
  }
  return { apis, setup, take, noise, classify, names, rtti, scan, refine, where, misc, S };
})();
return Object.keys(globalThis.__sx);
`;

// 入力(lab-pad の言葉: app/lib/play.mjs と同じ既定の割り当て)。on で押し、hold 待って B、off で離し、settle 待って C。
export const PERTURB = [
  { name: 'forward', on: 'LY=-100', off: 'LY=0' },
  { name: 'back', on: 'LY=100', off: 'LY=0' },
  { name: 'left', on: 'LX=-100', off: 'LX=0' },
  { name: 'right', on: 'LX=100', off: 'LX=0' },
  { name: 'diag', on: 'LX=100 LY=-100', off: 'LX=0 LY=0' },
  { name: 'jump', on: '+A', off: '-A', hold: 900 },
  { name: 'sneak', on: 'R3', off: 'R3' },                       // (R3 は切り替え: 押して on、もう一度で off)
  { name: 'sprint', on: 'LY=-100 wait200 +L3 wait300 -L3', off: 'LY=0' },
  { name: 'attack', on: 'RT=100', off: 'RT=0' },
  { name: 'use', on: 'LT=100', off: 'LT=0' },
  { name: 'lookRight', on: 'RX=100', off: 'RX=0', rot: 'y' },
  { name: 'lookUp', on: 'RY=-100', off: 'RY=0', rot: 'x' },
  { name: 'lookDown', on: 'RY=100', off: 'RY=0', rot: 'x' },
  { name: 'hotbar', on: 'RB', off: 'LB' },                      // (次のスロット→前のスロット: 戻るので follow に出る)
];

// RTTI で名前を控える語(次の段: 関数・vtable の結線に使う)。多すぎる語は件数を絞る
export const NAME_WORDS = ['MoveInput', 'Input', 'Camera', 'Rotation', 'GameMode', 'Hotbar', 'Inventory', 'Chat', 'Command', 'Screen', 'Controller', 'Gamepad', 'Keyboard', 'Touch', 'Button', 'Mouse', 'Look', 'Jump', 'Sneak', 'Sprint', 'Packet'];
export const RTTI_CLASSES = ['LocalPlayer', 'Player', 'Mob', 'Actor', 'MoveInputComponent', 'MoveInputHandler', 'ClientInputHandler', 'ClientInputMappingFactory', 'InputHandler', 'ClientInstance',
  'MinecraftGame', 'GameMode', 'SurvivalMode', 'CreativeMode', 'PlayerInventory', 'Inventory', 'GuiData', 'ActorRotationComponent', 'ActorHeadRotationComponent', 'CameraComponent',
  'LoopbackPacketSender', 'ClientNetworkHandler', 'PlayerAuthInputPacket', 'TextPacket', 'CommandRequestPacket', 'ScreenView', 'SceneStack', 'HudScreenController', 'ChatScreenController'];

const short = (v, n = 900) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > n ? s.slice(0, n) + `…(+${s.length - n})` : s; };

/** 本番: ワールドに入ったクライアントで実測する。戻り: 全部の生データ(report に入る)+ log に要約を流す */
export async function explore({ repl, pad, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, opts = {} }) {
  const hold = opts.hold ?? 1500, settle = opts.settle ?? 1400, maxLen = opts.maxLen ?? 0x300, lpLen = opts.lpLen ?? 0x1800, lim = opts.lim ?? 40;
  const call = async (body, ms = 60_000) => { const r = await repl.js(body, { timeoutMs: ms }); if (!r.ok) throw new Error(r.error || 'REPL error'); return r.value; };
  const out = { ok: false, steps: [] };
  const inst = await repl.js(JS_INSTALL, { timeoutMs: 30_000 });
  if (!inst.ok) { out.error = '道具を入れられません: ' + inst.error; return out; }

  // 0) 素の口(__native.*)の一覧と、いまの状態
  try { out.apis = await call('return __sx.apis();'); log('apis ' + short(out.apis, 2400)); } catch (e) { out.apisError = String(e.message || e); }
  try { out.misc = await call('return __sx.misc();'); log('misc ' + short(out.misc, 2400)); } catch (e) { out.miscError = String(e.message || e); }

  // 1) ローカルプレイヤーと、そのコンポーネント(番地)
  try { out.setup = await call(`return __sx.setup(${maxLen}, ${lpLen});`); }
  catch (e) { out.error = 'setup: ' + String(e.message || e); return out; }
  log(`localPlayer ${out.setup.a} e=${out.setup.e} comps=${out.setup.n} 読む所=${out.setup.regions.length} keys=${JSON.stringify(out.setup.keys)}${out.setup.compsError ? ' compsError=' + out.setup.compsError : ''}`);
  log('comp sample ' + short({ sample: out.setup.sample, compSample: out.setup.compSample }, 1200));
  log('regions ' + out.setup.regions.map((r) => `${r[0]}:${r[2] || '?'}`).join(' '));

  // 2) 雑音(何もしない間に変わる所)
  await call("return __sx.take('n0');"); await sleep(hold);
  await call("return __sx.take('n1');"); await sleep(hold);
  await call("return __sx.take('n2');");
  out.noise = await call("return __sx.noise([['n0','n1'],['n1','n2']]);");
  log(`雑音 ${out.noise} セル(除外)`);

  // 3) 入力ごとに A → B(押している間)→ C(離した後)
  for (const p of PERTURB) {
    try {
      await pad('center'); await sleep(400);
      const a = await call("return __sx.take('A');");
      await pad(p.on); await sleep(p.hold ?? hold);
      const b = await call("return __sx.take('B');");
      if (p.off) await pad(p.off);
      await sleep(p.settle ?? settle);
      await call("return __sx.take('C');");
      const r = await call(`return __sx.classify('A','B','C', ${lim});`);
      const step = { name: p.name, rows: r.rows, rot: r.rot, loc: r.loc, unread: [a.unread, b.unread] };
      out.steps.push(step);
      const moved = r.loc[0] && r.loc[1] ? Math.hypot(r.loc[1].x - r.loc[0].x, r.loc[1].z - r.loc[0].z).toFixed(2) : '?';
      const turned = r.rot[0] && r.rot[1] ? `${(r.rot[1].y - r.rot[0].y).toFixed(1)}/${(r.rot[1].x - r.rot[0].x).toFixed(1)}` : '?';
      log(`[${p.name}] 動いた ${moved} m・向き Δyaw/Δpitch ${turned}・follow ${r.rows.reduce((n, x) => n + x.nf, 0)}・persist ${r.rows.reduce((n, x) => n + x.np, 0)}`);
      for (const row of r.rows) {
        if (row.nf) log(`  F ${row.r}(${row.nf}) ${row.f.slice(0, 16).map(([o, x, y, z]) => `+${o.toString(16)}:${x}→${y}→${z}`).join(' ')}`);
        if (row.np && (p.rot || /Rot|Look|Camera|Inventory|Hotbar|Select|Input/i.test(row.r))) log(`  P ${row.r}(${row.np}) ${row.p.slice(0, 10).map(([o, x, y]) => `+${o.toString(16)}:${x}→${y}`).join(' ')}`);
      }
    } catch (e) { out.steps.push({ name: p.name, error: String(e.message || e) }); log(`[${p.name}] 失敗: ${String(e.message || e).slice(0, 200)}`); }
  }
  await pad('center');

  // 4) 前進の 1.0 を全メモリから(チートエンジン流): 押す=1・離す=0 を 2 往復で絞る
  if (opts.scan !== false) {
    try {
      const sc = { steps: [] };
      await pad('LY=-100'); await sleep(hold);
      sc.steps.push(['scan 1.0', await call(`return __sx.scan(1, ${opts.scanMax ?? 1_500_000});`, 240_000)]);
      await pad('LY=0'); await sleep(settle);
      sc.steps.push(['=0', await call('return __sx.refine(0, 1e-4);', 240_000)]);
      await pad('LY=-100'); await sleep(hold);
      sc.steps.push(['=1', await call('return __sx.refine(1, 1e-4);', 240_000)]);
      await pad('LY=0'); await sleep(settle);
      sc.steps.push(['=0', await call('return __sx.refine(0, 1e-4);', 120_000)]);
      await pad('LY=-100'); await sleep(hold);
      sc.steps.push(['=1', await call('return __sx.refine(1, 1e-4);', 120_000)]);
      await pad('LY=0'); await sleep(settle);
      sc.steps.push(['=0', await call('return __sx.refine(0, 1e-4);', 120_000)]);
      sc.where = await call('return __sx.where(24);', 120_000);
      out.scan = sc;
      log('scan ' + sc.steps.map(([k, v]) => `${k}:${v.n}${v.capped ? '(上限)' : ''}(${v.ms}ms)`).join(' → '));
      for (const w of sc.where) log(`  @ ${w.a} ${short(w.w, 300)}`);
    } catch (e) { out.scanError = String(e.message || e); log('scan 失敗: ' + out.scanError.slice(0, 200)); }
  }

  // 5) 次の段のための名前(RTTI)
  try {
    out.names = await call(`return __sx.names(${JSON.stringify(NAME_WORDS)}, 80);`, 120_000);
    for (const [k, v] of Object.entries(out.names)) log(`names ${k}: ${Array.isArray(v) ? v.join(' ') : v}`.slice(0, 3000));
  } catch (e) { out.namesError = String(e.message || e); }
  try {
    out.rtti = await call(`return __sx.rtti(${JSON.stringify(RTTI_CLASSES)});`, 120_000);
    for (const [k, v] of Object.entries(out.rtti)) log(`rtti ${k}: ${short(v, 600)}`);
  } catch (e) { out.rttiError = String(e.message || e); }
  out.ok = true;
  return out;
}

/** 要約(人と次の AI 向け): 入力ごとに、付いて来て戻った所(follow)のうち「入力らしい」もの */
export function summarize(r) {
  if (!r || !r.ok) return `入力の実測: できず(${r?.error || '?'})`;
  const L = [`入力の実測(コンポーネント ${r.setup?.n ?? '?'} 個・読む所 ${r.setup?.regions?.length ?? '?'}・雑音 ${r.noise ?? '?'} セル):`];
  for (const s of r.steps) {
    if (s.error) { L.push(`  ✘ ${s.name}: ${s.error}`); continue; }
    // 入力らしい: 押している間だけ ±1 以内の小数(アナログ)か、小さな整数(押下フラグ・状態)に変わって戻る
    const analog = [], flags = [];
    for (const row of s.rows) for (const [o, a, b, c] of row.f) {
      if (a !== c) continue;
      if (typeof b === 'number' && b !== 0 && Math.abs(b) <= 1.0001) analog.push(`${row.r}+0x${o.toString(16)}=${b}`);
      else if (typeof b === 'string' && /^i-?\d{1,3}$/.test(b) && b !== 'i0') flags.push(`${row.r}+0x${o.toString(16)}=${b.slice(1)}(${typeof a === 'string' ? a.slice(1) : a}→)`);
    }
    const like = [...analog, ...flags];
    L.push(`  ${like.length ? '✔' : '·'} ${s.name}: ${like.slice(0, 8).join(' ') || '(入力らしい値なし)'}`);
  }
  if (r.scan) L.push(`  1.0 の全探索: ${r.scan.steps.map(([k, v]) => `${k}:${v.n}`).join(' → ')}${r.scan.where?.length ? '・例 ' + r.scan.where.slice(0, 3).map((w) => w.a).join(' ') : ''}`);
  return L.join('\n');
}

// ---------------- selftest(端末不要): 偽のローカルプレイヤー + コンポーネントのメモリ、偽コントローラ ----------------
// 偽 REPL は __sx の各関数を「JS ではなくハンドラで演じる」のではなく、本物の JS_INSTALL を node の vm で動かす。
// そのために __native(mc / dbg / input)と world を偽物で用意する(番地 → ArrayBuffer の小さなメモリ)。
async function selftest() {
  const vm = await import('node:vm');
  let bad = 0;
  const t = (name, ok, more = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${ok || !more ? '' : '  ' + more}`); if (!ok) bad++; };
  // メモリ: プレイヤー本体と 3 つのコンポーネント
  const mem = new Map(); // base → DataView
  const alloc = (base, len) => { const d = new DataView(new ArrayBuffer(len)); mem.set(base, d); return d; };
  const LP = 0x7f0000100000, MOVE = 0x7f0000200000, ROT = 0x7f0000300000, CLOCK = 0x7f0000400000, INV = 0x7f0000500000;
  alloc(LP, 0x1800);
  const mv = alloc(MOVE, 0x80), rot = alloc(ROT, 0x40), clk = alloc(CLOCK, 0x400), inv = alloc(INV, 0x400); // (大きさの分からない物は 0x300 読む: 本物の続きのメモリの代わり)
  const state = { yaw: 30, pitch: 10, x: 0, z: 0, slot: 0, tick: 0 };
  const sync = () => { rot.setFloat32(0, state.pitch, true); rot.setFloat32(4, state.yaw, true); inv.setUint32(0x10, state.slot, true); clk.setUint32(0, state.tick++, true); };
  sync();
  const read = (a, n) => { for (const [b, d] of mem) if (a >= b && a + n <= b + d.byteLength) return d.buffer.slice(a - b, a - b + n); return null; };
  const f32at = (a) => { for (const [b, d] of mem) if (a >= b && a + 4 <= b + d.byteLength) return d.getFloat32(a - b, true); return null; };
  const native = {
    mc: { localPlayer: () => [LP, 7], comps: () => [{ name: 'MoveInputComponent', address: MOVE, size: 0x80 }, { name: 'ActorRotationComponent', address: ROT, size: 0x40 }, { name: 'TickClock', address: CLOCK }, { name: 'Inventory', address: INV }],
      comp: () => null, status: () => ({ inWorld: true }), tickInfo: () => ({ installed: true }), offsets: () => ({}) },
    dbg: { read, f32: f32at, findU32: (u, max) => { const out = []; for (const [b, d] of mem) for (let o = 0; o + 4 <= d.byteLength; o += 4) if (d.getUint32(o, true) === u && out.length < max) out.push(b + o); return out; },
      whereIs: (a) => ({ region: a >= MOVE && a < MOVE + 0x80 ? 'MoveInputComponent' : '?' }), module: () => ({ base: 0x7e0000000000 }), ecs: () => [], rttiSearch: (w) => [{ name: w + 'Thing' }], rttiInfo: (n) => ({ name: n, vtable: '0x1234' }) },
    input: { status: () => '{"wired":true}' },
  };
  const ctx = { __native: native, world: { getLocalPlayer: () => ({ getRotation: () => ({ x: state.pitch, y: state.yaw }), location: { x: state.x, y: -60, z: state.z } }) }, Date, Math, JSON, DataView, ArrayBuffer, Uint8Array, Map, Set, Number, String, Object, Array };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  // 偽 REPL: 本物の wrapJs の形で来る本体を、その vm で評価して SE_OK で返す
  const f = await fakeRepl({ handle: (code) => { try { const v = vm.runInContext(code, ctx); return typeof v === 'string' ? v : 'SE_OK ' + JSON.stringify(v); } catch (e) { return 'SE_ERR ' + e.message; } } });
  const repl = await openRepl({ port: f.port, token: f.token });
  // 偽コントローラ: 移動ベクタ(MOVE+0x10/0x14)・ジャンプ(MOVE+0x20)は押している間だけ、向きとスロットは残る
  const held = { LX: 0, LY: 0, A: 0, RT: 0 };
  const apply = () => { mv.setFloat32(0x10, held.LX / 100, true); mv.setFloat32(0x14, -held.LY / 100, true); mv.setUint32(0x20, held.A, true); mv.setUint32(0x24, held.RT ? 1 : 0, true); };
  const pad = async (words) => {
    for (const w of String(words).split(/\s+/)) {
      let m;
      if (w === 'center') { held.LX = held.LY = held.RT = 0; held.A = 0; }
      else if ((m = /^(LX|LY)=(-?\d+)$/.exec(w))) held[m[1]] = Number(m[2]);
      else if ((m = /^RT=(\d+)$/.exec(w))) held.RT = Number(m[1]);
      else if (w === '+A') held.A = 1; else if (w === '-A') held.A = 0;
      else if (/^RX=100$/.test(w)) state.yaw += 25; else if (/^RY=-100$/.test(w)) state.pitch -= 12; else if (/^RY=100$/.test(w)) state.pitch += 12;
      else if (w === 'RB') state.slot = (state.slot + 1) % 9; else if (w === 'LB') state.slot = (state.slot + 8) % 9;
    }
    apply(); sync();
  };
  const r = await explore({ repl, pad, sleep: async () => { sync(); }, log: (m) => console.log('  ' + m), opts: { hold: 0, settle: 0, scanMax: 1000 } });
  console.log(summarize(r));
  const step = (n) => r.steps.find((s) => s.name === n);
  const follows = (n, reg, off) => step(n)?.rows?.some((row) => row.r === reg && row.f.some(([o]) => o === off));
  const persists = (n, reg, off) => step(n)?.rows?.some((row) => row.r === reg && row.p.some(([o]) => o === off));
  t('道具が入り、プレイヤーとコンポーネント 4 つを読む', r.ok && r.setup.n === 4 && r.setup.regions.length === 5, JSON.stringify(r.setup));
  t('雑音(時計)を除く', r.noise >= 1 && !r.steps.some((s) => s.rows?.some((row) => row.r === 'TickClock')));
  t('前進: MoveInputComponent+0x14 が付いて来て戻る(follow)', follows('forward', 'MoveInputComponent', 0x14));
  t('右: MoveInputComponent+0x10 が follow', follows('right', 'MoveInputComponent', 0x10));
  t('ジャンプ: +0x20 が follow', follows('jump', 'MoveInputComponent', 0x20));
  t('攻撃: +0x24 が follow', follows('attack', 'MoveInputComponent', 0x24));
  t('右を見る: ActorRotationComponent+4(yaw)が残る(persist)', persists('lookRight', 'ActorRotationComponent', 4));
  t('上を見る: +0(pitch)が persist', persists('lookUp', 'ActorRotationComponent', 0));
  t('ホットバー: 次→前で戻る(follow)', follows('hotbar', 'Inventory', 0x10));
  t('1.0 の全探索: 前進の値だけが残る', r.scan && r.scan.where.length === 1 && r.scan.where[0].a === '0x' + (MOVE + 0x14).toString(16), JSON.stringify(r.scan));
  t('名前と型情報を控える', r.names?.Input?.[0] === 'InputThing' && r.rtti?.LocalPlayer?.vtable === '0x1234');
  t('要約に前進の値が出る', /forward: MoveInputComponent\+0x14=1/.test(summarize(r)));
  repl.close(); f.srv.close();
  console.log(bad ? `\nSELFTEST FAIL (${bad})` : '\nSELFTEST OK');
  return bad ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) selftest().then((c) => process.exit(c || 0));
  else { console.log('使い方: node explore.mjs --selftest(端末ありは scripteval.mjs run --world から)'); process.exit(0); }
}
