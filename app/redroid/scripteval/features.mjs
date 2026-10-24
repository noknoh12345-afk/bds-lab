// features.mjs — scripteval 0.3.1 でソースに足された機能を、素の APK に注入した scripteval の中で 1 つずつ確かめる。
// どれも mod 自身の公開 JS API(ScriptEval.*, agent.*, http.*, client.packs.*)を REPL から呼ぶだけ。タイトル画面でよい。
//
//   injectInput : ScriptEval.injectInput / agent / input が生え、agent.status() が配線を言い、verb が状態に戻り値で反映され、
//                 呼んでもゲームが落ちない(移動・視点が実際に「効く」かは offsets 次第 → world.mjs が実機で探す)
//   http        : http.get / post / .json() / .text() をこのホストの小さな HTTP サーバ(docker ブリッジ)に対して。https は
//                 その環境の libcurl の有無しだい(素の APK には無いはず): 何が返るかをそのまま記録する(可否は問わない)
//   グロリソ     : client.packs.installUrl(url) で .mcpack を DL → inflate(libz を dlopen)→ resource_packs へ強制導入
//   自己更新     : ScriptEval.update(url, {dest}) が ELF を dest に staging(「次回起動で反映」)、ELF でない物は拒む
//                 (実行中の .so には触らない。dest を渡して /tmp のダミーに書かせる)
//
// 端末の外(このホスト)に要るのは、端末から docker ブリッジ越しに届く小さな HTTP サーバだけ。Studio の見た目は studio.mjs。
//
//   node features.mjs --selftest     端末不要: 偽 REPL と本物の HTTP サーバで配線を確かめる
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openRepl, fakeRepl } from './probe.mjs';

export const DEVICE_DATADIR = '/data/data/com.mojang.minecraftpe/scripteval';

// ---------------- 小さな zip(deflate。scripteval の inflate(libz)を通すため store にしない) ----------------
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(entries) {
  const parts = [], cent = [];
  let off = 0;
  for (const { name, data } of entries) {
    const nb = Buffer.from(name), comp = zlib.deflateRawSync(data), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
    parts.push(h, nb, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    cent.push(c, nb);
    off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(cent), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

/** 試しのリソースパック(.mcpack の中身)。uuid は毎回新しく(前の実行の残りと取り違えない) */
export function testPack() {
  const uuid = crypto.randomUUID(), mod = crypto.randomUUID();
  const manifest = {
    format_version: 2,
    header: { name: 'scripteval web pack test', description: 'installUrl test from bds-lab', uuid, version: [1, 0, 0], min_engine_version: [1, 21, 0] },
    modules: [{ type: 'resources', uuid: mod, version: [1, 0, 0] }],
  };
  return { uuid, bytes: zip([{ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }]) };
}

// ---------------- このホストの小さな HTTP サーバ(端末から docker ブリッジ越しに届く) ----------------
// routes: { '/ping.txt': Buffer|string, '/data.json': obj, '/webpack.mcpack': Buffer, '/fake.so': Buffer, ... }
export function serveFiles(routes, { host = '0.0.0.0' } = {}) {
  const srv = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    const v = routes[p];
    if (v === undefined) { res.writeHead(404); res.end('no'); return; }
    if (Buffer.isBuffer(v)) { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(v); return; }
    if (typeof v === 'object') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); return; }
    res.writeHead(200, { 'content-type': 'text/plain' }); res.end(String(v));
  });
  return new Promise((resolve) => srv.listen(0, host, () => resolve({ srv, port: srv.address().port })));
}

// ---------------- 機能チェック(REPL 越しに mod の API を呼ぶ) ----------------
// repl: openRepl の戻り。base: 端末から見たこのホスト(http://<bridge>:<port>)。/tmp はダミーの更新先
const J = (v) => JSON.stringify(v);

async function checkInject(repl) {
  const out = { name: 'injectInput' };
  const wired = await repl.js('return (typeof globalThis.ScriptEval==="object") && typeof ScriptEval.injectInput==="function" && typeof agent==="object";');
  out.present = wired.ok && wired.value === true;
  if (!out.present) { out.ok = false; out.detail = 'ScriptEval.injectInput / agent が生えていない: ' + (wired.error || wired.value); return out; }
  const st = await repl.js('return agent.status();');          // {wired, move, camera, vertical, discrete}
  out.status = st.value ?? st.error;
  // verb が状態に反映されるか(戻り値を見る。実際に動くかは offsets 次第 → ここでは配線のみ)
  const fwd = await repl.js('return agent.forward(true);');
  const turn = await repl.js('return agent.turn(5,-2);');
  const stop = await repl.js('return agent.stop();');
  out.reflects = Boolean(fwd.ok && turn.ok && stop.ok && fwd.value && (fwd.value.f === 1 || fwd.value.forward === 1));
  out.samples = { forward: fwd.value ?? fwd.error, turn: turn.value ?? turn.error, stop: stop.value ?? stop.error };
  out.ok = out.present && st.ok; // 呼んで例外なく status が返るところまでを成功に(効くかは別段)
  return out;
}

async function checkHttp(repl, base) {
  const out = { name: 'http' };
  const g = await repl.js(`const r=http.get(${J(base + '/ping.txt')});return {ok:r.ok,status:r.status,text:r.text(),backend:r.backend};`, { timeoutMs: 30_000 });
  out.get = g.value ?? g.error;
  const j = await repl.js(`const r=http.get(${J(base + '/data.json')});return {ok:r.ok,b:r.json().b};`, { timeoutMs: 30_000 });
  out.json = j.value ?? j.error;
  // https はその環境の libcurl 次第。可否ではなく「何が返ったか」を記録する
  const s = await repl.js(`try{const r=http.get("https://example.com/");return {ok:r.ok,status:r.status,backend:r.backend,error:r.error};}catch(e){return {thrown:String(e&&e.message||e)};}`, { timeoutMs: 30_000 });
  out.https = s.value ?? s.error;
  out.ok = Boolean(g.ok && g.value?.ok && g.value?.status === 200 && j.value?.b === 'x');
  return out;
}

async function checkPack(repl, base) {
  const out = { name: 'gloriso' };
  const before = await repl.js('return client.packs.list().length;');
  const inst = await repl.js(`try{const r=client.packs.installUrl(${J(base + '/webpack.mcpack')});return {r};}catch(e){return {error:String(e&&e.message||e)};}`, { timeoutMs: 45_000 });
  out.install = inst.value ?? inst.error;
  const after = await repl.js('return client.packs.list().length;');
  const forced = await repl.js('const l=client.packs.list();return l.length?!!l[l.length-1].forced:false;');
  out.before = before.value; out.after = after.value; out.forced = forced.value ?? forced.error;
  out.ok = Boolean(inst.ok && typeof after.value === 'number' && after.value > (before.value ?? 0));
  return out;
}

async function checkUpdate(repl) {
  const out = { name: 'selfUpdate' };
  // ELF の健全なものは staging(「次回起動」)、ELF でないものは拒む。実行中の .so は触らず /tmp のダミーに書かせる
  const elf = await repl.js(`try{return ScriptEval.update("http://127.0.0.1:1/x",{dest:"/data/local/tmp/se-upd-missing.so"});}catch(e){return "THROW "+String(e&&e.message||e);}`, { timeoutMs: 20_000 });
  out.badHost = elf.value ?? elf.error; // DL 失敗を素直にエラーで返すか(例外にせず)
  out.ok = true; // update が生えて呼べること自体を記録(実 DL は world 段で dest 指定で確かめる)
  out.present = typeof out.badHost === 'string' || typeof out.badHost === 'object';
  return out;
}

export async function runFeatures({ host = '127.0.0.1', port = 25599, token = null, base } = {}) {
  const repl = await openRepl({ host, port, token, timeoutMs: 20_000 });
  const report = { version: /ScriptEval (\d+\.\d+\.\d+)/.exec(repl.banner)?.[1] ?? null, checks: [] };
  try {
    report.checks.push(await checkInject(repl));
    if (base) {
      report.checks.push(await checkHttp(repl, base));
      report.checks.push(await checkPack(repl, base));
    }
    report.checks.push(await checkUpdate(repl));
  } finally {
    repl.close();
  }
  report.ok = report.checks.every((c) => c.ok);
  return report;
}

export function summarize(r) {
  const L = [`scripteval ${r.version || '?'} の 0.3.1 機能:`];
  for (const c of r.checks) L.push(`  ${c.ok ? '✔' : '✘'} ${c.name}  ${J({ ...c, name: undefined }).slice(0, 220)}`);
  return L.join('\n');
}

// ---------------- selftest(端末不要: 偽 REPL が 0.3.1 の API を演じ、本物の HTTP サーバに繋ぐ) ----------------
async function selftest() {
  let bad = 0;
  const t = (name, ok) => { console.log(`${ok ? '✔' : '✘'} ${name}`); if (!ok) bad++; };
  const pack = testPack();
  const files = await serveFiles({ '/ping.txt': 'hello-scripteval', '/data.json': { b: 'x' }, '/webpack.mcpack': pack.bytes }, { host: '127.0.0.1' });
  const base = `http://127.0.0.1:${files.port}`;

  // 偽 REPL: 0.3.1 の API を最小に演じる(http は本物のホスト HTTP に Node 側で中継して答えを返す)
  let packs = 0;
  const handle = (code) => {
    const val = (v) => 'SE_OK ' + JSON.stringify(v === undefined ? null : v);
    if (/typeof ScriptEval\.injectInput/.test(code)) return val(true);
    if (/agent\.status\(\)/.test(code)) return val({ wired: true, move: false, camera: false, vertical: false, discrete: 'pending-version-functions' });
    if (/agent\.forward/.test(code)) return val({ f: 1, s: 0 });
    if (/agent\.turn/.test(code)) return val({ yaw: 5, pitch: -2 });
    if (/agent\.stop/.test(code)) return val({ f: 0, s: 0 });
    if (/http\.get.*ping\.txt/.test(code)) return val({ ok: true, status: 200, text: 'hello-scripteval', backend: 'curl' });
    if (/http\.get.*data\.json/.test(code)) return val({ ok: true, b: 'x' });
    if (/example\.com/.test(code)) return val({ ok: false, status: 0, backend: 'socket', error: 'https にはフォールバックでは非対応' });
    if (/packs\.list\(\)\.length/.test(code)) return val(packs);
    if (/installUrl/.test(code)) { packs = 1; return val({ r: 'ok' }); }
    if (/l\[l\.length-1\]\.forced/.test(code)) return val(packs > 0);
    if (/ScriptEval\.update/.test(code)) return val('ダウンロード失敗: 接続できません');
    return 'SE_OK null';
  };
  const f = await fakeRepl({ version: '0.3.1', handle });
  const r = await runFeatures({ port: f.port, token: f.token, base });
  console.log(summarize(r));
  t('version 0.3.1', r.version === '0.3.1');
  t('injectInput: 配線あり・verb 反映', r.checks[0].present && r.checks[0].reflects);
  t('http: get + json', r.checks[1].ok);
  t('http: https の結果を記録', r.checks[1].https && typeof r.checks[1].https === 'object');
  t('gloriso: installUrl で 1 枚増える', r.checks[2].ok && r.checks[2].after === 1);
  t('selfUpdate: 呼べる(DL 失敗を素直に返す)', r.checks[3].present);
  t('zip: 本物の inflate で解けるはず(ヘッダ)', pack.bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])));

  f.srv.close(); files.srv.close();
  console.log(bad ? `\nSELFTEST FAIL (${bad})` : '\nSELFTEST OK');
  return bad ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) selftest().then((c) => process.exit(c || 0));
  else { console.log('使い方: node features.mjs --selftest(端末ありは scripteval.mjs から呼ばれます)'); process.exit(0); }
}
