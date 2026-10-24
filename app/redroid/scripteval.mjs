// app redroid scripteval — 準備済み(ゲーム起動中)の redroid 端末で、scripteval の注入と
// 「読み取り専用 JS ランタイムが素の APK 内で動くか」の検証を行う。
//
// HANDOFF §6 の検証。注入そのものは scripteval/inject_mod.py(Frida Module.load + mod_init)が担当。
// scripteval 0.3.0 は読み取り専用で injectInput は無い(操作は不可)。ここは「動くか」を確かめるだけ。
//
// 前提: 端末は up(app redroid prep/open + launch で既にゲーム起動中)。このスクリプトは redroid.mjs の
//       adb(127.0.0.1:PORT 固定)を使う。.so は封緘 .bin を vault 鍵(APP_CACHE_KEY)で開封して push する。
//
//   node app/redroid/scripteval.mjs run [--abi auto] [--port 25599] [--out <dir>] [--frida-version X]
//   node app/redroid/scripteval.mjs --selftest        端末不要(プローブ配線のみ)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './redroid.mjs';
import * as V from '../lib/vault.mjs';
import { runProbe, summarize } from './scripteval/probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SE_DIR = path.join(HERE, 'scripteval');
const PKG = 'com.mojang.minecraftpe';
const DEVICE_SO = '/data/local/tmp/libscripteval.so';
const DEVICE_DATADIR = `/data/data/${PKG}/scripteval`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRIDA_ARCH = { 'arm64-v8a': 'arm64', 'x86_64': 'x86_64' };

function deviceAbi(port) {
  return R.adb(port, ['shell', 'getprop', 'ro.product.cpu.abi'], { timeout: 10_000 }).stdout.trim() || 'x86_64';
}

/** 封緘 .bin があれば開封、無ければ素の .so(開発時のみ)を探して返す。見つからねば null。 */
async function resolveSo(abi, log) {
  const sealed = path.join(SE_DIR, `libscripteval-${abi}.so.bin`);
  const plain = path.join(SE_DIR, `libscripteval-${abi}.so`); // 開発時のみ(.gitignore 済み・コミットしない)
  if (fs.existsSync(sealed)) {
    const key = V.vaultKey();
    if (!key) { log(`W 封緘 .so はありますが鍵がありません(APP_CACHE_KEY / GOOGLE_AAS_TOKEN)`); return null; }
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'se-so-'));
    const ok = await V.open({ inFile: sealed, dest, key, log });
    if (!ok) { log(`W 封緘 .so を開けませんでした(鍵違い/破損): ${path.basename(sealed)}`); return null; }
    const got = fs.readdirSync(dest).map((f) => path.join(dest, f)).find((f) => f.endsWith('.so'));
    if (got) { log(`封緘 .so を開封: ${path.basename(sealed)} → ${path.basename(got)}`); return got; }
    return null;
  }
  if (fs.existsSync(plain)) { log(`素の .so を使用(開発時): ${path.basename(plain)}`); return plain; }
  return null;
}

/** frida-server を端末へ(無ければ)。版はランナーの pip frida に合わせる。 */
function ensureFridaServer(port, fridaVersion, farch, log) {
  const have = R.adb(port, ['shell', 'ls', '/data/local/tmp/frida-server'], { timeout: 10_000 }).stdout;
  if (!/frida-server/.test(have)) {
    const ver = fridaVersion || R.sh('python3', ['-c', 'import frida,sys; sys.stdout.write(frida.__version__)'], { quiet: true }).stdout.trim();
    if (!ver) throw new Error('frida の版が分かりません(--frida-version か pip install frida)');
    const url = `https://github.com/frida/frida/releases/download/${ver}/frida-server-${ver}-android-${farch}.xz`;
    const xz = path.join(os.tmpdir(), `frida-server-${ver}-${farch}.xz`);
    log(`frida-server ${ver} (${farch}) を取得`);
    if (R.sh('curl', ['-fsSL', '-o', xz, url], { timeout: 120_000 }).status !== 0) throw new Error('frida-server を取得できません');
    R.sh('unxz', ['-f', xz], { timeout: 60_000 });
    const bin = xz.replace(/\.xz$/, '');
    R.adb(port, ['push', bin, '/data/local/tmp/frida-server'], { timeout: 60_000 });
    R.adb(port, ['shell', 'chmod', '755', '/data/local/tmp/frida-server'], { timeout: 10_000 });
  }
  // 起動(既に動いていれば二重起動は無害に失敗)
  R.adb(port, ['shell', 'su', '0', 'sh', '-c', 'nohup /data/local/tmp/frida-server -l 0.0.0.0:27042 >/dev/null 2>&1 &'], { timeout: 10_000 });
  R.sh(process.env.ADB || 'adb', ['-s', `127.0.0.1:${port}`, 'forward', 'tcp:27042', 'tcp:27042'], { quiet: true, timeout: 10_000 });
}

function readToken(port) {
  for (const cmd of [['su', '0', 'cat', `${DEVICE_DATADIR}/session.token`], ['shell', `su 0 cat ${DEVICE_DATADIR}/session.token`]]) {
    const r = R.adb(port, cmd[0] === 'su' ? ['shell', ...cmd] : cmd, { timeout: 10_000 });
    const t = (r.stdout || '').trim();
    if (t && !/No such file|not found|cannot/i.test(t)) return t.split(/\s+/)[0];
  }
  return null;
}

// MC が落ちた時などの診断ログ
function grabCrash(port) {
  const crash = (R.adb(port, ['logcat', '-d', '-b', 'crash'], { timeout: 15_000 }).stdout || '').split('\n').slice(-20).join('\n');
  const main = (R.adb(port, ['logcat', '-d'], { timeout: 20_000 }).stdout || '').split('\n')
    .filter((l) => /minecraftpe|Minecraft|FATAL|AndroidRuntime|libminecraft|PairIP|licens|ANR/i.test(l)).slice(-25).join('\n');
  return (crash + '\n--main(filtered)--\n' + main).slice(0, 2800);
}

// MC を確実に起動して pid を返す(アカウント直後は端末が高負荷なので粘る)。
async function ensureMcRunning(port, log) {
  const pidof = () => (R.adb(port, ['shell', 'pidof', PKG], { timeout: 10_000 }).stdout || '').trim().split(/\s+/)[0] || '';
  const launch = () => R.adb(port, ['shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1'], { timeout: 30_000 });
  let pid = pidof();
  if (!pid) { log('MC を起動 (monkey LAUNCHER)'); launch(); }
  for (let i = 0; i < 50 && !pid; i++) { await sleep(3000); pid = pidof(); }   // 最大 ~150s
  if (!pid) return { pid: '', crash: grabCrash(port) };
  log(`MC pid=${pid}、ロード安定待ち`);
  await sleep(20000);
  if (!pidof()) { log('MC が落ちた → 再起動'); launch(); for (let i = 0; i < 40 && !pidof(); i++) await sleep(3000); }
  pid = pidof();
  return pid ? { pid } : { pid: '', crash: grabCrash(port) };
}

async function run(o) {
  const port = Number(o.port) || R.PORT;
  const localPort = Number(o.localPort) || 25599;
  const outDir = o.out ? path.resolve(o.out) : path.join(SE_DIR, '.lab');
  fs.mkdirSync(outDir, { recursive: true });
  const log = (m) => console.log('[scripteval] ' + m);
  const report = { when: new Date().toISOString(), steps: [] };
  const note = (k, v) => { report.steps.push({ [k]: v }); log(`${k}: ${v}`); };

  const abi = o.abi && o.abi !== 'auto' ? o.abi : deviceAbi(port);
  const farch = FRIDA_ARCH[abi];
  report.abi = abi;
  if (!farch) throw new Error(`未対応の abi: ${abi}`);
  note('abi', abi);

  const so = await resolveSo(abi, log);
  if (!so) {
    note('so', 'なし(封緘 .bin 未配置 or 鍵なし)');
    report.result = 'no_so';
    writeReport(outDir, report, log);
    return 0; // ファイル未配置は想定内。CI を赤くしない。
  }

  // MC を起動して pid を得る(未起動なら注入できない)
  const mc = await ensureMcRunning(port, log);
  note('mc_pid', mc.pid || '(未起動)');
  if (!mc.pid) { report.result = 'mc_not_running'; report.mc_crash = mc.crash; writeReport(outDir, report, log); return 0; }

  try {
    ensureFridaServer(port, o.fridaVersion, farch, log);
    note('frida', 'ready');
  } catch (e) { note('frida_error', String(e.message || e)); report.result = 'frida_failed'; writeReport(outDir, report, log); return 0; }

  R.adb(port, ['push', so, DEVICE_SO], { timeout: 60_000 });
  R.adb(port, ['shell', 'chmod', '644', DEVICE_SO], { timeout: 10_000 });
  note('pushed_so', DEVICE_SO);

  // 注入 + mod_init(scripteval/inject_mod.py)
  const inj = R.sh('python3', [path.join(SE_DIR, 'inject_mod.py'), '--so', DEVICE_SO, '--pkg', PKG, '--host', '127.0.0.1:27042'], { timeout: 60_000 });
  report.inject = { status: inj.status, out: (inj.stdout || '').slice(-1500), err: (inj.stderr || '').slice(-1500) };
  note('inject', inj.status === 0 ? 'OK' : `失敗(code ${inj.status})`);

  await sleep(2000);
  const token = readToken(port);
  note('session_token', token ? '取得' : '未取得(mod_init が走っていない/権限)');

  R.sh(process.env.ADB || 'adb', ['-s', `127.0.0.1:${port}`, 'forward', `tcp:${localPort}`, 'tcp:25599'], { quiet: true, timeout: 10_000 });
  const probe = await runProbe({ host: '127.0.0.1', port: localPort, token });
  report.probe = probe;

  // 診断ログ(scripteval 自身の SE_LOG 行)
  const lc = R.adb(port, ['logcat', '-d'], { timeout: 20_000 }).stdout || '';
  report.scripteval_log = lc.split('\n').filter((l) => /ScriptEval|scripteval|REPL listening|launcher apis|RTTI/i.test(l)).slice(-40);

  report.result = probe.conclusions?.js_runtime_runs_in_apk ? 'js_runtime_up' : (probe.reachable ? 'repl_reachable' : 'repl_unreachable');
  writeReport(outDir, report, log);
  console.log('\n' + summarize(probe));
  return 0;
}

function writeReport(outDir, report, log) {
  const f = path.join(outDir, 'scripteval-report.json');
  fs.writeFileSync(f, JSON.stringify(report, null, 2));
  log('report: ' + f + ' (result=' + (report.result || '?') + ')');
}

function parseArgs(a) { const o = {}; const rest = []; for (let i = 0; i < a.length; i++) { const k = a[i]; if (k === '--selftest') o.selftest = true; else if (k.startsWith('--')) o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[++i]; else rest.push(k); } o._ = rest; return o; }

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.selftest) {
    // プローブの配線のみ(端末不要)。probe.mjs 自身の selftest を呼ぶ。
    const { spawnSync } = await import('node:child_process');
    return spawnSync(process.execPath, [path.join(SE_DIR, 'probe.mjs'), '--selftest'], { stdio: 'inherit' }).status || 0;
  }
  return run(o);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c || 0)).catch((e) => { console.error('E ' + (e && e.message || e)); process.exit(1); });
}
