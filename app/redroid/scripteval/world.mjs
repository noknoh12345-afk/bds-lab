// world.mjs — ワールドに入ったクライアントで、scripteval 0.3.1 の injectInput が「実際に効く」ために要る
// 版依存のオフセット(config.json の offsets.moveVectorX/Z・cameraYaw/Pitch)を、mod 自身の読み取り専用デバッグ API だけで探す。
//
// 方法(チートエンジンの scan→perturb→refine を、mod の dbg.snapshot/diff で):
//   1. ローカルプレイヤーの構造体を dbg.snapshot で控える(before)。
//   2. 本物のコントローラ(lab-pad)で実際に動かす/視点を回す(host 側。mod は書かない=読み取りのまま)。
//   3. もう一度 snapshot して dbg.diff し、「狙った値に変わった f32」の構造体内オフセットを拾う(after)。
//   4. 逆向きにも動かして、同じオフセットが戻ることを確かめる(偶然の揺れを落とす)。
//   見つかったオフセットは config.json の offsets に入れれば、injectInput の戦略A(直接書き込み)がその版で効く。
//   ここは一切書き込まない(探すだけ)。書き込みの実効は、offsets を入れた次の実機 run で確かめる。
//
// 入力(どれも scripteval.mjs が渡す): repl(probe.mjs openRepl の戻り)・pad(async (words)=>…: 本物のコントローラへ)・
//   sleep。REPL 越しに読むだけ。player が居ない(ワールド外)ときは {inWorld:false} を返す。
//
//   node world.mjs --selftest     端末不要: 偽プレイヤーメモリと偽コントローラで scan→perturb→refine を実走
import { fileURLToPath } from 'node:url';
import { fakeRepl, openRepl } from './probe.mjs';

const LEN = 0x1800; // プレイヤー構造体の先頭から見る長さ(入力/視点は前方に固まっている)
const near0 = (x, eps = 1e-3) => Math.abs(x) <= eps;

// in-client: localPlayer の base と、構造体スナップショットの控え(globalThis.__sw.a)+ いまの読み値
const JS_BASE = `
const lp = mc.localPlayer();
if (!lp || !lp[0]) return { inWorld: false };
globalThis.__sw = { base: lp[0] };
const p = world.getLocalPlayer();
return { inWorld: true, base: String(lp[0]), rot: p.getRotation(), loc: p.location, name: p.name };
`;
const JS_SNAP = `
const s = globalThis.__sw; if (!s || !s.base) return { ok: false, error: "no base (call base first)" };
s.a = dbg.snapshot(s.base, ${LEN});
return { ok: true };
`;
// after perturb: diff と、いまの読み値(確かめ用)
const JS_DIFF = `
const s = globalThis.__sw; if (!s || !s.a) return { ok: false, error: "no before-snapshot" };
const b = dbg.snapshot(s.base, ${LEN});
const rows = dbg.diff(s.a, b, { raw: true }).filter(r => r.f32);
const p = world.getLocalPlayer();
return { ok: true, rot: p.getRotation(), loc: p.location, rows: rows.map(r => ({ off: r.offset, f: r.f32 })) };
`;

/** repl 越しに「控える→(host が動かす)→差分」を 1 回。perturb は async()。戻り: {before, after, rows} */
async function trial(repl, perturb, { settleMs = 700, sleep }) {
  await repl.js(JS_SNAP);
  await perturb();
  await sleep(settleMs);
  const d = await repl.js(JS_DIFF);
  if (!d.ok || !d.value?.ok) throw new Error('diff 失敗: ' + (d.error || d.value?.error));
  return d.value;
}

// 一つの軸を探す: perturb で狙いの値に、reset で 0 近くに戻す。want(fRow.f[1]) が真の行が候補。
// 2 回の試行で共通する off だけ残す(偶然の揺れを落とす)。
async function findAxis(repl, { name, perturb, reset, want, sleep, log }) {
  const hits = [];
  for (let i = 0; i < 2; i++) {
    await reset(); await sleep(500);
    const t = await trial(repl, perturb, { sleep });
    const cand = t.rows.filter((r) => want(r.f[1], r.f[0], t)).map((r) => r.off);
    log(`  ${name}: 試行 ${i + 1} 候補 ${cand.length} 個 ${cand.slice(0, 8).map((o) => '0x' + o.toString(16)).join(' ')}`);
    hits.push(new Set(cand));
    await reset(); await sleep(400);
  }
  const common = [...hits[0]].filter((o) => hits.every((h) => h.has(o)));
  return { name, offsets: common, hex: common.map((o) => '0x' + o.toString(16)) };
}

/** 本番: ワールドに入ったクライアントで offsets を探す。pad(words) は本物のコントローラ、sleep は待ち。 */
export async function findOffsets({ repl, pad, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  const base = await repl.js(JS_BASE);
  if (!base.ok || !base.value?.inWorld) return { inWorld: false, why: base.error || base.value?.error || 'ワールド外' };
  log(`localPlayer @ ${base.value.base}  rot=${JSON.stringify(base.value.rot)} loc=${JSON.stringify(base.value.loc)}`);

  const out = { inWorld: true, base: base.value.base, found: {} };

  // 前後(moveVectorZ): 前進を保持すると前後軸が ~1、放すと 0 に戻る
  const move = await findAxis(repl, {
    name: 'moveVectorZ(前後)', sleep, log,
    perturb: () => pad('LY=-100 wait600'), reset: () => pad('LY=0 center'),
    want: (now, before) => now >= 0.6 && near0(before, 0.2),
  });
  if (move.offsets.length) out.found.moveVectorZ = move.hex;

  // 左右(moveVectorX): 右ストラフ保持で左右軸が ~±1
  const strafe = await findAxis(repl, {
    name: 'moveVectorX(左右)', sleep, log,
    perturb: () => pad('LX=100 wait600'), reset: () => pad('LX=0 center'),
    want: (now, before) => Math.abs(now) >= 0.6 && near0(before, 0.2),
  });
  if (strafe.offsets.length) out.found.moveVectorX = strafe.hex;

  // 視点ヨー(cameraYaw): 右ストラフではなく右スティックで視点を回す。読んだ rot.y の変化に近い f32 を探す
  const yaw = await findCamera(repl, { name: 'cameraYaw', axis: 'y', pad: () => pad('RX=100 wait600'), reset: () => pad('RX=0 center'), sleep, log });
  if (yaw.offsets.length) out.found.cameraYaw = yaw.hex;
  const pitch = await findCamera(repl, { name: 'cameraPitch', axis: 'x', pad: () => pad('RY=-100 wait500'), reset: () => pad('RY=0 center'), sleep, log });
  if (pitch.offsets.length) out.found.cameraPitch = pitch.hex;

  out.rot = (await repl.js(JS_BASE)).value?.rot ?? null;
  return out;
}

// 視点: before/after の読み rot[axis] の差に一致して変わった f32 を探す(角度は wrap があるので差で見る)
async function findCamera(repl, { name, axis, pad, reset, sleep, log }) {
  const hits = [];
  for (let i = 0; i < 2; i++) {
    await reset(); await sleep(500);
    await repl.js(JS_SNAP);
    const r0 = (await repl.js(JS_BASE)).value?.rot?.[axis] ?? 0;
    await pad();
    await sleep(700);
    const d = (await repl.js(JS_DIFF)).value;
    const r1 = d?.rot?.[axis] ?? 0;
    const delta = r1 - r0;
    const cand = (d?.rows ?? []).filter((row) => Math.abs((row.f[1] - row.f[0]) - delta) < 2 && Math.abs(delta) > 2).map((r) => r.off);
    log(`  ${name}: 試行 ${i + 1} Δ=${delta.toFixed(1)} 候補 ${cand.length} 個 ${cand.slice(0, 8).map((o) => '0x' + o.toString(16)).join(' ')}`);
    hits.push(new Set(cand));
    await reset(); await sleep(400);
  }
  const common = hits.length ? [...hits[0]].filter((o) => hits.every((h) => h.has(o))) : [];
  return { name, offsets: common, hex: common.map((o) => '0x' + o.toString(16)) };
}

export function summarize(r) {
  if (!r.inWorld) return `ワールドの中の確認: まだワールド外(${r.why})。参加してから。`;
  const L = [`ワールドの中の確認(localPlayer @ ${r.base}):`];
  const keys = ['moveVectorZ', 'moveVectorX', 'cameraYaw', 'cameraPitch'];
  for (const k of keys) L.push(`  ${r.found[k] ? '✔' : '✘'} ${k}  ${r.found[k] ? r.found[k].join(' ') : '(特定できず)'}`);
  const got = keys.filter((k) => r.found[k]);
  L.push(got.length ? `  → config.json offsets に: ${got.map((k) => `"${k}": ${parseInt(r.found[k][0], 16)}`).join(', ')}` : '  → どのオフセットも一意に特定できず(スキャン幅/待ち時間/操作の強さを調整)');
  return L.join('\n');
}

// ---------------- selftest(端末不要: 偽プレイヤーメモリ + 偽コントローラ) ----------------
// 偽プレイヤー構造体: 既知のオフセットに move/camera の f32 を置き、偽 pad がそれを書き換える。
// REPL(偽)は __sw の base/snapshot/diff を JS でなくハンドラで演じる(本物の dbg.snapshot/diff と同じ戻り)。
function fakePlayerWorld() {
  const BASE = 0x7f0000000000n;
  const buf = new Float32Array(LEN / 4); // f32 グリッド(オフセット = index*4)
  const OFF = { moveVectorX: 0x40, moveVectorZ: 0x44, cameraYaw: 0x80, cameraPitch: 0x84 };
  const idx = (off) => off / 4;
  const rot = { x: 10, y: 30 }; // pitch, yaw(度)
  const state = { buf, rot, snap: null };
  // 偽コントローラ: words に応じて該当 f32 と rot を動かす(本物の挙動の最小再現)
  const pad = async (words) => {
    if (/LY=-100/.test(words)) buf[idx(OFF.moveVectorZ)] = 1;
    if (/LY=0/.test(words)) buf[idx(OFF.moveVectorZ)] = 0;
    if (/LX=100/.test(words)) buf[idx(OFF.moveVectorX)] = 1;
    if (/LX=0/.test(words)) buf[idx(OFF.moveVectorX)] = 0;
    if (/RX=100/.test(words)) { rot.y += 20; buf[idx(OFF.cameraYaw)] = rot.y; }
    if (/RY=-100/.test(words)) { rot.x -= 15; buf[idx(OFF.cameraPitch)] = rot.x; }
    if (/center/.test(words)) { /* スティックを戻すだけ。保持値は LY=0/LX=0 側で 0 に */ }
  };
  buf[idx(OFF.cameraYaw)] = rot.y; buf[idx(OFF.cameraPitch)] = rot.x; // 読み=書きが同じ所(視点)
  const handle = (code) => {
    const ok = (v) => 'SE_OK ' + JSON.stringify(v);
    if (/globalThis\.__sw = \{ base/.test(code)) return ok({ inWorld: true, base: String(BASE), rot: { ...rot }, loc: { x: 0, y: -60, z: 0 }, name: 'Steve' });
    if (/s\.a = dbg\.snapshot/.test(code)) { state.snap = Float32Array.from(buf); return ok({ ok: true }); }
    if (/dbg\.diff\(s\.a, b/.test(code)) {
      const rows = [];
      for (let i = 0; i < buf.length; i++) if (buf[i] !== state.snap[i]) rows.push({ off: i * 4, f: [state.snap[i], buf[i]] });
      return ok({ ok: true, rot: { ...rot }, loc: { x: 0, y: -60, z: 0 }, rows });
    }
    return ok(null);
  };
  return { BASE, OFF, pad, handle };
}

async function selftest() {
  let bad = 0;
  const t = (name, ok) => { console.log(`${ok ? '✔' : '✘'} ${name}`); if (!ok) bad++; };
  const fw = fakePlayerWorld();
  const f = await fakeRepl({ version: '0.3.1', handle: fw.handle });
  const repl = await openRepl({ port: f.port, token: f.token });
  const r = await findOffsets({ repl, pad: fw.pad, sleep: () => Promise.resolve(), log: (m) => console.log(m) });
  console.log(summarize(r));
  const hexEq = (k, off) => r.found[k]?.length === 1 && parseInt(r.found[k][0], 16) === off;
  t('inWorld', r.inWorld);
  t('moveVectorZ を 0x44 に特定', hexEq('moveVectorZ', fw.OFF.moveVectorZ));
  t('moveVectorX を 0x40 に特定', hexEq('moveVectorX', fw.OFF.moveVectorX));
  t('cameraYaw を 0x80 に特定', hexEq('cameraYaw', fw.OFF.cameraYaw));
  t('cameraPitch を 0x84 に特定', hexEq('cameraPitch', fw.OFF.cameraPitch));
  repl.close(); f.srv.close();
  console.log(bad ? `\nSELFTEST FAIL (${bad})` : '\nSELFTEST OK');
  return bad ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) selftest().then((c) => process.exit(c || 0));
  else { console.log('使い方: node world.mjs --selftest(端末ありは scripteval.mjs の --world から)'); process.exit(0); }
}
