// app redroid scripteval — 準備済みの redroid 端末を自分で起こし(game.mjs debug と同じ: 準備済み /data を overlay で
// 戻す → 起動 → root → ゲームをタイトルまで)、scripteval を注入して「読み取り専用 JS ランタイムが素の APK 内で動くか」を
// 確かめる。HANDOFF §6 の検証。注入そのものは scripteval/inject_mod.py(Frida Module.load + mod_preinit/mod_init)。
// scripteval 0.3.0 は読み取り専用で injectInput は無い(操作は不可)。ここは「動くか」を確かめるだけ。
//
// なぜ自分で起こすか: `game.mjs prep` は最後に R.down() で端末を止めて終わる。通常の「app run」ステップは端末を戻して
// 起動し直すが、redroid.yml で scripteval を on にするとそのステップは飛ぶ。run #2〜#4 の mc_not_running は全てこれ
// (run 40078038764 のログ: `am start -> adb: device '127.0.0.1:5600' not found`)。起こすのはこのスクリプトの仕事。
//
// ログだけで診断できるように: 注入の各段階・端末の事実・scripteval 自身のログ行を標準出力にも出す(封緘レポートを
// 開く鍵が無くても run_log で読める)。token と 32 桁以上の16進列は伏せる。終わりに `SE_EVIDENCE {json}` を1行。
//
//   node app/redroid/scripteval.mjs run [--data <準備済みフォルダ>] [--keep] [--abi auto] [--repl-port 25599]
//                                       [--local-port 25599] [--out <dir>] [--frida-version X]
//   node app/redroid/scripteval.mjs --selftest        端末不要(プローブ配線 + 伏字の確認)
//
// --data の既定: $REDROID_DATA → /mnt/redroid/data(redroid.yml の prep/open が作る所)→ app/redroid/.lab/data
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as R from './redroid.mjs';
import * as V from '../lib/vault.mjs';
import { Adb } from '../lib/android.mjs';
import { runProbe, summarize } from './scripteval/probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.join(HERE, '.lab');
const SE_DIR = path.join(HERE, 'scripteval');
const PKG = 'com.mojang.minecraftpe';
const DEVICE_SO = '/data/local/tmp/libscripteval.so';
const DEVICE_DATADIR = `/data/data/${PKG}/scripteval`;
const FRIDA_PORT = 27042;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
const secs = (ms) => Math.round(ms / 100) / 10;

const FRIDA_ARCH = { 'arm64-v8a': 'arm64', 'x86_64': 'x86_64' };

/** 公開ログに出す前に伏せる: 渡された秘密(token 等)と、32 桁以上の16進列(session/MCP token の形) */
export function scrub(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets.filter((x) => x && String(x).length >= 6)) out = out.split(String(s)).join('***');
  return out.replace(/\b[0-9a-fA-F]{32,}\b/g, (m) => `<hex${m.length}>`);
}

export function resolveData(given, env = process.env) {
  if (typeof given === 'string' && given) return path.resolve(given);
  if (env.REDROID_DATA) return path.resolve(env.REDROID_DATA);
  if (fs.existsSync('/mnt/redroid/data')) return '/mnt/redroid/data';
  return path.join(LAB, 'data');
}

const adbOf = (port = R.PORT) => new Adb({ bin: process.env.ADB || [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean).map((d) => path.join(d, 'platform-tools', 'adb')).find((p) => fs.existsSync(p)) || 'adb', serial: `127.0.0.1:${port}` });

/** adbd を root に(redroid は service.adb.root=1 で既に root のはず。違えば `adb root` を1回) → root なら true */
async function ensureRoot(adb) {
  const isRoot = () => adb.run(['shell', 'id -u'], { timeout: 10_000 }).stdout.trim() === '0';
  if (isRoot()) return true;
  adb.run(['root'], { timeout: 20_000 }); await sleep(1500);
  R.sh(adb.bin, ['connect', adb.serial], { quiet: true, timeout: 10_000 });
  for (let i = 0; i < 30 && !isRoot(); i++) await sleep(1000);
  return isRoot();
}

/** root の sh で1行(adbd が root なら直接、違えば su 0 で)。`su` が無い端末でも root adbd なら動く */
function rootSh(adb, isRoot, line, opts = {}) {
  const q = `'${line.replace(/'/g, `'\\''`)}'`;
  return adb.run(['shell', isRoot ? line : `su 0 sh -c ${q}`], { timeout: 30_000, ...opts });
}

/** 準備済みの端末を起こしてゲームをタイトルまで(game.mjs debug と同じ手順)。常駐の端末(--keep の残り)はそのまま使う。
 *  state.started: このスクリプトが端末を起こし始めたか(途中で失敗しても片付けるため) */
async function bringUp({ data, port, img = R.GAPPS_TAG, log, state }) {
  const t0 = now();
  const { launch, whyNot } = await import('./game.mjs');
  const adb = adbOf(port);
  const resident = R.running({ from: data, image: img });
  let boot = null;
  if (resident) log('常駐の端末を使います(戻さない・起動しない)');
  else {
    if (!fs.existsSync(data)) throw new Error(`準備済みの端末がありません: ${data}(先に game.mjs prep / open)`);
    state.started = true;
    const r = R.restore(data, 'overlay', data + '.run');
    log(`準備済み /data を overlay で戻しました(${secs(r.ms)} 秒): ${data}`);
    boot = await R.up({ data: r.data, from: data, image: img, untilBoot: true });
  }
  const isRoot = await ensureRoot(adb);
  log(`adb root: ${isRoot ? 'はい' : 'いいえ(su 0 を使います)'}`);
  const g = await launch(adb, { boost: true });
  const { why, ...game } = g;
  log(`ゲームの起動: ${JSON.stringify({ pidS: game.pidS, windowS: game.windowS, titleS: game.titleS, license: game.license, am: game.am })}`);
  return { adb, isRoot, resident, boot, game, why: why ?? null, whyNot, readyS: secs(now() - t0) };
}

/** 封緘 .bin があれば開封、無ければ素の .so(開発時のみ)を探して返す。見つからねば null。 */
async function resolveSo(abi, log) {
  const sealed = path.join(SE_DIR, `libscripteval-${abi}.so.bin`);
  const plain = path.join(SE_DIR, `libscripteval-${abi}.so`); // 開発時のみ(.gitignore 済み・コミットしない)
  if (fs.existsSync(sealed)) {
    const key = V.vaultKey();
    if (!key) { log('W 封緘 .so はありますが鍵がありません(APP_CACHE_KEY / GOOGLE_AAS_TOKEN)'); return null; }
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

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** frida-server を端末へ(無ければ)入れて起動し、動いたことを確かめる → {version, pid} */
async function ensureFridaServer(adb, isRoot, { fridaVersion, farch, log }) {
  const ver = fridaVersion || R.sh('python3', ['-c', 'import frida,sys; sys.stdout.write(frida.__version__)'], { quiet: true }).stdout.trim();
  if (!ver) throw new Error('frida の版が分かりません(--frida-version か pip install frida)');
  const have = adb.run(['shell', 'ls /data/local/tmp/frida-server 2>/dev/null'], { timeout: 10_000 }).stdout;
  if (!/frida-server/.test(have)) {
    const url = `https://github.com/frida/frida/releases/download/${ver}/frida-server-${ver}-android-${farch}.xz`;
    const xz = path.join(os.tmpdir(), `frida-server-${ver}-${farch}.xz`);
    log(`frida-server ${ver} (${farch}) を取得`);
    if (R.sh('curl', ['-fsSL', '-o', xz, url], { timeout: 180_000 }).status !== 0) throw new Error(`frida-server を取得できません: ${url}`);
    R.sh('unxz', ['-f', xz], { timeout: 60_000 });
    const bin = xz.replace(/\.xz$/, '');
    if (adb.run(['push', bin, '/data/local/tmp/frida-server'], { timeout: 120_000 }).status !== 0) throw new Error('frida-server を push できません');
    adb.run(['shell', 'chmod 755 /data/local/tmp/frida-server'], { timeout: 10_000 });
  }
  // (背景で起動: adb shell が閉じても残るよう nohup + 出力を捨てる。既に動いていれば起動しない)
  rootSh(adb, isRoot, `pidof frida-server >/dev/null || (nohup /data/local/tmp/frida-server -l 0.0.0.0:${FRIDA_PORT} >/dev/null 2>&1 </dev/null &)`, { timeout: 15_000 });
  let pid = '';
  for (let i = 0; i < 20 && !pid; i++) { await sleep(500); pid = adb.run(['shell', 'pidof frida-server'], { timeout: 10_000 }).stdout.trim(); }
  if (!pid) throw new Error('frida-server が起動しません(pidof に出ない)');
  R.sh(process.env.ADB || 'adb', ['-s', adb.serial, 'forward', `tcp:${FRIDA_PORT}`, `tcp:${FRIDA_PORT}`], { quiet: true, timeout: 10_000 });
  return { version: ver, pid };
}

function readToken(adb, isRoot) {
  const t = (rootSh(adb, isRoot, `cat ${DEVICE_DATADIR}/session.token 2>/dev/null`, { timeout: 10_000 }).stdout || '').trim();
  return t && !/No such file|not found|cannot|denied/i.test(t) ? t.split(/\s+/)[0] : null;
}

/** 端末内で TCP port が LISTEN か(/proc/net/tcp と tcp6 の st=0A)。REPL が立ったか、繋がらない理由の切り分け */
export function listening(procNetTcp, port) {
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  return procNetTcp.split('\n').some((l) => { const f = l.trim().split(/\s+/); return f[1] && f[1].toUpperCase().endsWith(':' + hex) && f[3] === '0A'; });
}

/** 端末とゲームの事実(個人を特定しない): Android/ビルド、ABI、SELinux、ゲームの版 */
function deviceFacts(adb) {
  const p = (k) => adb.run(['shell', `getprop ${k}`], { timeout: 10_000 }).stdout.trim();
  const pkg = adb.run(['shell', `dumpsys package ${PKG}`], { timeout: 30_000 }).stdout;
  return {
    android: p('ro.build.version.release'), sdk: p('ro.build.version.sdk'), abi: p('ro.product.cpu.abi'),
    build: p('ro.build.display.id'), selinux: adb.run(['shell', 'getenforce'], { timeout: 10_000 }).stdout.trim(),
    game: { versionName: pkg.match(/versionName=(\S+)/)?.[1] ?? null, versionCode: pkg.match(/versionCode=(\d+)/)?.[1] ?? null },
  };
}

async function run(o) {
  const port = Number(o.adbPort) || R.PORT;
  const replPort = Number(o.replPort) || 25599;
  const localPort = Number(o.localPort) || 25599;
  const data = resolveData(o.data);
  const outDir = o.out ? path.resolve(o.out) : path.join(SE_DIR, '.lab');
  fs.mkdirSync(outDir, { recursive: true });
  const secrets = [];
  const log = (m) => console.log('[scripteval] ' + scrub(m, secrets));
  const report = { when: new Date().toISOString(), data, steps: [] };
  const note = (k, v) => { report.steps.push({ [k]: v }); log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); };
  const ev = { schema: 'scripteval-redroid/1' };   // SE_EVIDENCE: 何を・どこで・何が観測されたか(REA の Evidence 流)
  const finish = (result, extra = {}) => {
    report.result = result; Object.assign(report, extra);
    ev.result = result;
    writeReport(outDir, report, log);
    console.log('SE_EVIDENCE ' + scrub(JSON.stringify(ev), secrets));
    return 0; // 「まだ動かない」も有効な結果。CI を赤くしない(結論は result と SE_EVIDENCE)。
  };

  // 端末は1台・1コマンドずつ(game.mjs の prep/bench/debug と同じ錠)。止められても端末は片付ける
  const release = R.lock('scripteval');
  let dev = null, cleaned = false;
  const state = { started: false };
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    // (起こしたのがこのスクリプトなら止める。--keep は端末を残す(次の run がそのまま使う)。常駐の端末には触らない)
    if (state.started && !o.keep) { R.down({ quiet: true }); R.sh('umount', [path.join(data + '.run', 'merged')], { sudo: true, quiet: true }); }
    release();
  };
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { log(`止めます(${sig})`); cleanup(); process.exit(130); });

  try {
    // 1) 端末を起こし、ゲームをタイトルまで
    try { dev = await bringUp({ data, port, log, state }); }
    catch (e) { note('device_error', String(e.message || e)); return finish('device_failed'); }
    report.device = { resident: dev.resident, boot: dev.boot, readyS: dev.readyS, game: dev.game };
    const facts = deviceFacts(dev.adb);
    note('device', facts);
    ev.device = facts; ev.game_start = { pidS: dev.game.pidS ?? null, windowS: dev.game.windowS ?? null, titleS: dev.game.titleS ?? null, license: dev.game.license ?? null };

    const abi = o.abi && o.abi !== 'auto' ? o.abi : facts.abi;
    const farch = FRIDA_ARCH[abi];
    report.abi = abi;
    if (!farch) { note('abi', `未対応/不明: ${abi || '(空)'}`); return finish('bad_abi'); }

    // 2) MC が動いているか(タイトルまで来たか)。来ていなければ端末の記録から理由
    const pid = dev.adb.pid(PKG);
    note('mc_pid', pid || '(未起動)');
    if (!pid) {
      const why = dev.why ?? dev.whyNot(dev.adb);
      for (const l of [...(why.crash ?? []), ...(why.lines ?? [])].slice(-30)) log('  why| ' + l);
      return finish('mc_not_running', { mc_why: why });
    }

    // 3) .so(封緘を開封)
    const so = await resolveSo(abi, log);
    if (!so) { note('so', 'なし(封緘 .bin 未配置 or 鍵なし)'); return finish('no_so'); }
    ev.subject = { name: 'libscripteval.so', abi, sha256: sha256(so), bytes: fs.statSync(so).size };
    note('so_sha256', ev.subject.sha256);

    // 4) frida-server
    try { const fr = await ensureFridaServer(dev.adb, dev.isRoot, { fridaVersion: o.fridaVersion, farch, log }); note('frida', `server ${fr.version} pid ${fr.pid}`); ev.frida = fr.version; }
    catch (e) { note('frida_error', String(e.message || e)); return finish('frida_failed'); }

    // 5) push + 注入(既存 inject_mod.py をそのまま使う: Module.load → mod_preinit → mod_init)。各段階を標準出力にも。
    //    既存スクリプトは `[inject] <段階>` を1行ずつ出し、成否を exit code で返す。新しい注入機構は作らない。
    dev.adb.run(['push', so, DEVICE_SO], { timeout: 60_000 });
    dev.adb.run(['shell', `chmod 644 ${DEVICE_SO}`], { timeout: 10_000 });
    note('pushed_so', DEVICE_SO);
    dev.adb.run(['logcat', '-c'], { timeout: 15_000 });
    const t1 = now();
    const inj = R.sh('python3', [path.join(SE_DIR, 'inject_mod.py'), '--so', DEVICE_SO, '--pkg', PKG, '--host', `127.0.0.1:${FRIDA_PORT}`], { timeout: 90_000, quiet: true });
    const injLines = `${inj.stdout || ''}\n${inj.stderr || ''}`.split('\n').map((l) => l.replace(/^\[inject\]\s?/, '').trimEnd()).filter(Boolean);
    for (const l of injLines.slice(-40)) log('  inject| ' + l);
    report.inject = { status: inj.status, s: secs(now() - t1), steps: injLines.slice(-20) };
    ev.inject = { ok: inj.status === 0, steps: injLines.slice(-20) };
    note('inject', inj.status === 0 ? `OK(${report.inject.s} 秒)` : `失敗(code ${inj.status})`);

    // 6) 注入後も MC は生きているか(落ちたら Trace a crash の材料: crash バッファと logcat)
    await sleep(3000);
    const alive = dev.adb.pid(PKG);
    note('mc_after_inject', alive ? `生存(pid ${alive})` : '落ちた');
    if (!alive) {
      const why = dev.whyNot(dev.adb);
      for (const l of [...(why.crash ?? []), ...(why.lines ?? [])].slice(-40)) log('  crash| ' + l);
      ev.crash = { crash: why.crash, lines: (why.lines ?? []).slice(-15) };
      return finish('mc_died_after_inject', { mc_why: why });
    }

    // 7) REPL: token(起動毎に変わる)と LISTEN を端末内で確かめてから繋ぐ
    let token = null;
    for (let i = 0; i < 20 && !token; i++) { token = readToken(dev.adb, dev.isRoot); if (!token) await sleep(500); }
    if (token) secrets.push(token);
    note('session_token', token ? '取得' : '未取得(mod_init が走っていない/権限)');
    let up = false;
    for (let i = 0; i < 20 && !up; i++) {
      up = listening(dev.adb.run(['shell', 'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null'], { timeout: 10_000 }).stdout, replPort);
      if (!up) await sleep(500);
    }
    note('repl_listen', up ? `はい(:${replPort})` : `いいえ(:${replPort} が LISTEN に無い)`);
    ev.repl = { token: Boolean(token), listening: up };

    R.sh(process.env.ADB || 'adb', ['-s', dev.adb.serial, 'forward', `tcp:${localPort}`, `tcp:${replPort}`], { quiet: true, timeout: 10_000 });
    const probe = await runProbe({ host: '127.0.0.1', port: localPort, token });
    report.probe = probe;
    ev.probe = { reachable: probe.reachable, authed: probe.authed, banner: probe.banner ? probe.banner.split('\n')[0] : null, checks: probe.checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail.slice(0, 160) })), conclusions: probe.conclusions, error: probe.error ?? null };

    // 8) scripteval 自身のログ(どこまで初期化が進んだか: preinit / launcher apis / REPL / Studio / RTTI / tick hook)
    const lc = dev.adb.run(['logcat', '-d', '-v', 'brief'], { timeout: 30_000 }).stdout || '';
    report.scripteval_log = lc.split('\n').filter((l) => /ScriptEval|scripteval|REPL|launcher apis|RTTI|Studio|tick hook|libscripteval/i.test(l)).map((l) => scrub(l.trim(), secrets).slice(0, 300)).slice(-60);
    for (const l of report.scripteval_log.slice(-40)) log('  se| ' + l);
    ev.log_lines = report.scripteval_log.length;

    const result = probe.conclusions?.js_runtime_runs_in_apk ? 'js_runtime_up' : (probe.reachable ? 'repl_reachable' : 'repl_unreachable');
    console.log('\n' + scrub(summarize(probe), secrets));
    return finish(result);
  } finally {
    cleanup();
  }
}

function writeReport(outDir, report, log) {
  const f = path.join(outDir, 'scripteval-report.json');
  fs.writeFileSync(f, JSON.stringify(report, null, 2));
  log('report: ' + f + ' (result=' + (report.result || '?') + ')');
}

function parseArgs(a) { const o = {}; const rest = []; for (let i = 0; i < a.length; i++) { const k = a[i]; if (k === '--selftest' || k === '--keep') o[k.slice(2)] = true; else if (k.startsWith('--')) o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[++i]; else rest.push(k); } o._ = rest; return o; }

async function selftest() {
  const { spawnSync } = await import('node:child_process');
  let bad = 0;
  const t = (name, ok) => { console.log(`${ok ? '✔' : '✘'} ${name}`); if (!ok) bad++; };
  // 伏字: 秘密そのもの・32 桁以上の16進は消え、短い16進(アドレス等)は残る
  const tok = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  t('scrub: session token の形を伏せる', !scrub(`token ${tok} ok`).includes(tok));
  t('scrub: 渡した秘密を伏せる', scrub('x SECRETVALUE y', ['SECRETVALUE']) === 'x *** y');
  t('scrub: 短い16進(0x7f12ab)は残す', scrub('pc 0x7f12ab').includes('0x7f12ab'));
  // LISTEN 判定: :63FF(25599) st=0A のみ真
  const tcp = '  sl  local_address rem_address   st\n   0: 0100007F:63FF 00000000:0000 0A 00000000\n   1: 0100007F:63FF 0100007F:9C40 01 00000000';
  t('listening: 25599 の LISTEN を見つける', listening(tcp, 25599) === true);
  t('listening: 無い port は偽', listening(tcp, 25600) === false);
  t('listening: ESTABLISHED だけなら偽', listening('   1: 0100007F:63FF 0100007F:9C40 01 0', 25599) === false);
  t('resolveData: 明示 > REDROID_DATA', resolveData('/x/y', { REDROID_DATA: '/z' }) === '/x/y' && resolveData(undefined, { REDROID_DATA: '/z' }) === '/z');
  // プローブの配線(probe.mjs 自身の selftest: 偽 REPL で実プロトコル)
  const p = spawnSync(process.execPath, [path.join(SE_DIR, 'probe.mjs'), '--selftest'], { encoding: 'utf8' });
  t('probe.mjs --selftest', p.status === 0 && /SELFTEST OK/.test(p.stdout));
  console.log(bad ? `\nSELFTEST FAIL (${bad})` : '\nSELFTEST OK');
  return bad ? 1 : 0;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.selftest) return selftest();
  if (o._[0] !== 'run') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); return 0; }
  return run(o);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c || 0)).catch((e) => { console.error('E ' + scrub(e && e.message || e)); process.exit(1); });
}
