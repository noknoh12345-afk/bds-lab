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
//                                       [--world [--addon agent]] [--no-launch]
//     --world:      ワールドの中まで。ラボで毎日動いている app run の BDS 参加をそのまま使う(app/scenarios/scripteval-world.txt
//                   の app run を横で走らせる)。注入はタイトルで済ませてから「端末の準備ができた」と app run に伝え、app run が
//                   ラボの BDS に入れる。入ったら explore.mjs が入力の行き先を実測(読むだけ)、injectInput で歩けるかも試し、
//                   logcat の合図(SE_MARK_A / SE_MARK_B / SE_WORLD_DONE)ごとに app run がサーバーから見た位置を控える。
//                   (--open-world は同じ意味の古い名前。run #10/#11 の自前のワールド開きは画面を判別できず入れなかった)
//     --no-launch:  画面に触らず、いま起動中のゲームをそのまま使う(常駐の端末を自分でワールドに入れてあるとき)。
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
import { Adb, startPad } from '../lib/android.mjs';
import { runProbe, summarize, openRepl } from './scripteval/probe.mjs';
import * as features from './scripteval/features.mjs';
import * as explore from './scripteval/explore.mjs';
import * as studio from './scripteval/studio.mjs';
import * as RD from './ready.mjs';
import { spawn } from 'node:child_process';

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

/** host:hostPort → device:devPort を張る。端末通信と同じ adb.bin を使う(bare 'adb' は CI の PATH に無く SDK 配下の
 *  ことがある。run #5/#6 の「forward が効かない/張れない」真因はこれ)。落ちていれば connect し直して数回試す → {ok, err} */
async function forwardPort(adb, hostPort, devPort) {
  let err = '';
  for (let i = 0; i < 5; i++) {
    R.sh(adb.bin, ['connect', adb.serial], { quiet: true, timeout: 10_000 });
    const r = R.sh(adb.bin, ['-s', adb.serial, 'forward', `tcp:${hostPort}`, `tcp:${devPort}`], { quiet: true, timeout: 10_000 });
    if (r.status === 0) return { ok: true, err: '' };
    err = (r.stderr || r.stdout || '').trim();
    await sleep(800);
  }
  return { ok: false, err };
}

/** 準備済みの端末を起こしてゲームをタイトルまで(game.mjs debug と同じ手順)。常駐の端末(--keep の残り)はそのまま使う。
 *  state.started: このスクリプトが端末を起こし始めたか(途中で失敗しても片付けるため) */
async function bringUp({ data, port, img = R.GAPPS_TAG, log, state, noLaunch = false }) {
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
  // --no-launch: 画面に触らず、いま走っているゲームをそのまま使う(常駐の端末を自分でワールドに入れてあるとき用)。
  //  MC が動いていなければ結局起動する。
  if (noLaunch && resident && adb.pid(PKG)) {
    log('no-launch: 起動中のゲームをそのまま使います(タイトルへ戻さない)');
    return { adb, isRoot, resident, boot, game: { noLaunch: true }, why: null, whyNot, readyS: secs(now() - t0) };
  }
  const g = await launch(adb, { boost: true });
  const { why, ...game } = g;
  log(`ゲームの起動: ${JSON.stringify({ pidS: game.pidS, windowS: game.windowS, titleS: game.titleS, license: game.license, am: game.am })}`);
  return { adb, isRoot, resident, boot, game, why: why ?? null, whyNot, readyS: secs(now() - t0) };
}

// ---- ワールドの中へ: app run(ラボの BDS 参加。毎日動いている道)を横で走らせる ----
const TOP = path.resolve(HERE, '..', '..');
export const WORLD_SCENARIO = path.join(TOP, 'app', 'scenarios', 'scripteval-world.txt');
/** app run の 1 行から、サーバーが答えたプレイヤーの位置(where の答え: "名前: (x, y, z)、向き …°")→ {x,y,z,yaw} | null(純粋) */
export function whereOf(line) {
  const m = /\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)、向き (-?\d+(?:\.\d+)?)°/.exec(String(line ?? ''));
  return m ? { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]), yaw: Number(m[4]) } : null;
}
/** 公開ログ用に app run の行を整える: 名前(プレイヤー名・ゲーマータグ)は伏せる(純粋) */
export function scrubAppLine(line) {
  return String(line ?? '').replace(/([^\s:：]{1,32}): \((-?\d)/g, '<player>: ($2');
}
/** lab.mjs app run を子として起こす(標準出力は 1 行ずつ [app] で流し、覚えておく)。env は game.mjs debug と同じ考え方:
 *  動いている端末をそのまま使い(APP_LIVE_DEVICE)、準備の合図はファイル(APP_DEVICE_READY_FILE)で */
function startAppRun({ adb, addon, scenario, readyFile, apkDir, early, log, scrubber }) {
  const env = { ...process.env, APP_SERIAL: adb.serial, APP_LIVE_DEVICE: '1', APP_APK_DIR: apkDir, APP_HOST: '', APP_SHOT: 'adb', APP_SNAPSHOT: '0', APP_DEVICE_READY_FILE: readyFile };
  for (const k of Object.keys(env)) if (/^GOOGLE_|^MS_|^SCRIPTEVAL_SO_KEY$/.test(k) || k === 'APP_DEVICE') delete env[k];
  if (!early) env.APP_DEVICE_APKS_LATER = '1';
  return import('./game.mjs').then(({ bridgeIp }) => {
    env.APP_HOST = bridgeIp();
    const lines = [];
    const child = spawn(process.execPath, [path.join(TOP, 'lab.mjs'), 'app', 'run', '-a', addon, '--scenario', scenario], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let exit = null;
    const done = new Promise((res) => child.on('exit', (status, signal) => { exit = { status, signal }; res(exit); }));
    const feed = (buf) => { for (const l of String(buf).split('\n')) { if (!l.trim()) continue; const t = scrubber(scrubAppLine(l)); lines.push(t); if (lines.length > 4000) lines.splice(0, 1000); console.log('[app] ' + t); } };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    log(`app run を横で始めました(-a ${addon}、手順 ${path.relative(TOP, scenario)}、BDS は ${env.APP_HOST}): 端末の準備の合図を待っています`);
    /** 行を待つ: from 番目より後で re に合う行 → その行 | null(時間切れ・app run が終わった) */
    const waitLine = async (re, { from = 0, ms = 120_000 } = {}) => {
      const end = Date.now() + ms;
      for (;;) {
        const hit = lines.slice(from).find((l) => re.test(l));
        if (hit) return hit;
        if (exit || Date.now() > end) return null;
        await sleep(500);
      }
    };
    return { child, done, lines, waitLine, get exit() { return exit; }, stop: () => { try { child.kill('SIGTERM'); } catch { /* gone */ } } };
  });
}
/** logcat に合図を 1 行(app run の `until log <合図>` が拾う) */
const signal = (adb, word) => adb.run(['shell', `log -t ScriptEval ${word}`], { timeout: 10_000 });

/** .so の封緘鍵。専用の SCRIPTEVAL_SO_KEY があればそれで(端末の金庫 APP_CACHE_KEY には触らない)。無ければ従来どおり
 *  vaultKey()(APP_CACHE_KEY → GOOGLE_AAS_TOKEN)。seal-so.mjs と同じ決め方にする。 */
export function soVaultKey(env = process.env) {
  if (env.SCRIPTEVAL_SO_KEY?.trim()) return V.vaultKey({ ...env, APP_CACHE_KEY: env.SCRIPTEVAL_SO_KEY, GOOGLE_AAS_TOKEN: '' });
  return V.vaultKey(env);
}

/** 封緘 .bin があれば開封、無ければ素の .so(開発時のみ)を探して返す。見つからねば null。 */
async function resolveSo(abi, log) {
  const sealed = path.join(SE_DIR, `libscripteval-${abi}.so.bin`);
  const plain = path.join(SE_DIR, `libscripteval-${abi}.so`); // 開発時のみ(.gitignore 済み・コミットしない)
  if (fs.existsSync(sealed)) {
    const key = soVaultKey();
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
  // frida-server を daemonize(-D)で起動する。nohup+サブシェル背景化は adb shell 終了時に殺されることがあり、
  // pidof は socket が立つ前でも真・直後に死んでも分からない(run #5 の「unable to connect to remote frida-server」が
  // これ: pid は出たが実際には listen していなかった)。-D なら自分で fork して daemon になり生き残る。
  // 「pid がある」ではなく「FRIDA_PORT が端末内で LISTEN」を確かめてから進む。
  const fridaListening = () => listening(adb.run(['shell', `cat /proc/net/tcp /proc/net/tcp6 2>/dev/null`], { timeout: 10_000 }).stdout, FRIDA_PORT);
  let pid = '';
  for (let attempt = 0; attempt < 2 && !pid; attempt++) {
    if (!fridaListening()) {
      // 立っていなければ(古い/固まった frida-server は始末してから)daemonize で起動
      rootSh(adb, isRoot, `(pidof frida-server >/dev/null && kill -9 \`pidof frida-server\`) 2>/dev/null; /data/local/tmp/frida-server -D -l 127.0.0.1:${FRIDA_PORT}`, { timeout: 15_000 });
    }
    for (let i = 0; i < 30 && !fridaListening(); i++) await sleep(500); // 最大 ~15s、socket が立つまで
    if (fridaListening()) pid = adb.run(['shell', 'pidof frida-server'], { timeout: 10_000 }).stdout.trim().split(/\s+/)[0] || '?';
  }
  if (!pid) throw new Error(`frida-server が 127.0.0.1:${FRIDA_PORT} で listen しません`);
  const fw = await forwardPort(adb, FRIDA_PORT, FRIDA_PORT);
  if (!fw.ok) throw new Error(`adb forward tcp:${FRIDA_PORT} を張れません: ${fw.err.slice(0, 160)}`);
  return { version: ver, pid, listening: true };
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

/** scripteval 自身の logcat の行(タグで拾う。/REPL/i は Play の "replicator" も拾っていた)→ 伏せた行 */
function seLog(adb, secrets) {
  const lc = adb.run(['logcat', '-d', '-v', 'brief'], { timeout: 30_000 }).stdout || '';
  return lc.split('\n').filter((l) => /\b(ScriptEval|scripteval)\b|libscripteval/.test(l)).map((l) => scrub(l.trim(), secrets).slice(0, 300)).slice(-80);
}

const distXZ = (p, q) => (p && q && Number.isFinite(p.x) && Number.isFinite(q.x) ? Math.round(Math.hypot(q.x - p.x, q.z - p.z) * 100) / 100 : null);
// (REPL のグローバルに mc は無い: prelude の局所変数。__native.mc を直に。ensure(true) の全走査は 15 秒に 1 回まで)
const JS_IN_WORLD = `
const g = globalThis, t = Date.now();
if (!g.__seScanAt || t - g.__seScanAt > 15000) { g.__seScanAt = t; try { __native.mc.ensure(true); } catch {} }
let ok = false; try { const r = __native.mc.localPlayer(); ok = !!(r && r[0]); } catch {}
return ok;`;
const JS_POS = 'const p = world.getLocalPlayer(); const l = p.location, r = p.getRotation(); return { x: l.x, y: l.y, z: l.z, yaw: r.y, pitch: r.x };';

/** 次の段(ゲームの入力の流れに入る所)のための下調べ: 取り出した APK の libminecraftpe.so が外から借りる関数の名前
 *  (NDK の入力・ループ・ウィンドウ・EGL/GL・JNI)と、必要とするライブラリ。中身は出さない(関数名だけ・ここで読むだけ) */
export function soImports(apkDir, abi, { sh = R.sh } = {}) {
  const out = { lib: null, needed: [], imports: {}, exports: {} };
  const apks = fs.existsSync(apkDir) ? fs.readdirSync(apkDir).filter((f) => f.endsWith('.apk')) : [];
  const entry = `lib/${abi}/libminecraftpe.so`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'se-imp-'));
  try {
    for (const a of apks) {
      const list = sh('unzip', ['-Z1', path.join(apkDir, a)], { quiet: true, timeout: 60_000 }).stdout || '';
      if (!list.split('\n').includes(entry)) continue;
      const so = path.join(tmp, 'libminecraftpe.so');
      if (sh('sh', ['-c', `unzip -p '${path.join(apkDir, a)}' '${entry}' > '${so}'`], { quiet: true, timeout: 300_000 }).status !== 0) continue;
      out.lib = { apk: a, bytes: fs.statSync(so).size };
      const dyn = sh('readelf', ['-d', '-W', so], { quiet: true, timeout: 120_000 }).stdout || '';
      out.needed = [...dyn.matchAll(/\(NEEDED\)\s+Shared library: \[([^\]]+)\]/g)].map((m) => m[1]);
      const syms = sh('readelf', ['--dyn-syms', '-W', so], { quiet: true, timeout: 300_000 }).stdout || '';
      const und = [], def = [];
      for (const l of syms.split('\n')) {
        const f = l.trim().split(/\s+/);
        if (f.length < 8 || !/^\d+:$/.test(f[0])) continue;
        const name = f[7].replace(/@.*$/, '');
        (f[6] === 'UND' ? und : def).push(name);
      }
      const pick = (names, re) => names.filter((n) => re.test(n)).sort();
      out.imports = {
        input: pick(und, /^A(InputQueue|InputEvent|KeyEvent|MotionEvent)_/), looper: pick(und, /^ALooper_/), activity: pick(und, /^ANativeActivity_|^ANativeWindow_|^AConfiguration_/),
        egl: pick(und, /^egl/), gl: pick(und, /^gl[A-Z]/).length, jni: pick(und, /^JNI_|^_ZN7_JNIEnv/), dl: pick(und, /^(dlopen|dlsym|dladdr|dl_iterate_phdr|android_dlopen_ext)$/),
        total: und.length,
      };
      out.exports = { total: def.length, nativeActivity: def.filter((n) => /^ANativeActivity_onCreate$|^android_main$|^JNI_OnLoad$/.test(n)), java: def.filter((n) => /^Java_/.test(n)).length };
      break;
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return out;
}

/** --world の本体: APK を渡して app run を起こし → ワールドに入るのを待ち → 入力の行き先を実測(explore)→ 歩けるかを試す
 *  (コントローラ = 対照、injectInput = 本題)。合図ごとに app run がサーバーから見た位置を言う → 戻り: report.world */
async function inWorldStage({ adb, abi, data, localPort, token, outDir, log, secrets, state, addon }) {
  const W = { inWorld: false, addon };
  const { pullApks } = await import('./game.mjs');
  const apkDir = path.join(path.dirname(data), 'apk');
  const t0 = now();
  const apks = pullApks(adb, apkDir);
  log(`APK ${apks.length} 個(${secs(now() - t0)} 秒): app run がゲームの版を読み、合う BDS を用意します`);
  try {
    W.imports = soImports(apkDir, abi);
    const I = W.imports.imports ?? {};
    log(`imports| ${W.imports.lib ? `${W.imports.lib.apk} ${Math.round(W.imports.lib.bytes / 1e6)} MB` : 'libminecraftpe.so が見つかりません'}・NEEDED ${W.imports.needed.join(' ')}`);
    for (const k of ['input', 'looper', 'activity', 'egl', 'jni', 'dl']) if (I[k]?.length) log(`imports| ${k}: ${I[k].join(' ')}`);
    log(`imports| gl ${I.gl ?? 0} 個・借りる関数 ${I.total ?? 0}・出す関数 ${W.imports.exports?.total ?? 0}(${(W.imports.exports?.nativeActivity ?? []).join(' ')}・Java_ ${W.imports.exports?.java ?? 0})`);
  } catch (e) { log('imports| 調べられず: ' + String(e.message || e).slice(0, 160)); }
  state.readyFile = path.join(path.dirname(data), 'device-ready.json');
  fs.rmSync(state.readyFile, { force: true });
  RD.writeReady(state.readyFile, { serial: adb.serial, ok: true });
  const app = state.app = await startAppRun({ adb, addon, scenario: WORLD_SCENARIO, readyFile: state.readyFile, apkDir, early: RD.lastApks(apkDir), log, scrubber: (t) => scrub(t, secrets) });
  const ask = async (body, ms = 30_000) => { const r = await openRepl({ host: '127.0.0.1', port: localPort, token, timeoutMs: ms }); try { return await r.js(body, { timeoutMs: ms }); } finally { r.close(); } };

  // 1) ワールドに入るまで(BDS の用意 + LAN の参加。app run が終わってしまったらやめる)
  const tw = now(), until = tw + (Number(process.env.SCRIPTEVAL_WORLD_WAIT_MS) || 20 * 60_000);
  while (now() < until && !app.exit) {
    let q = null; try { q = await ask(JS_IN_WORLD, 40_000); } catch { /* 繋ぎ直す */ }
    if (q?.ok && q.value === true) { W.inWorld = true; break; }
    await sleep(5000);
  }
  W.waitS = secs(now() - tw);
  if (!W.inWorld) { W.why = app.exit ? `app run が先に終わりました(${JSON.stringify(app.exit)})` : `${W.waitS} 秒でワールドに入りませんでした`; log('world: ' + W.why); return W; }
  log(`ワールドに入りました(${W.waitS} 秒)`);
  // (app run が参加を終えて最初の where を言い、合図を待つ所まで来てから動かす: 参加中の OCR とコントローラの取り合いを避ける)
  const first = await app.waitLine(/\)、向き -?\d/, { from: 0, ms: 300_000 });
  W.firstWhere = whereOf(first);
  log(`app run は合図待ち(最初の where: ${first ? JSON.stringify(W.firstWhere) : 'なし(時間切れ)'})。入力の行き先を実測します(読むだけ)`);
  const pd = startPad(adb, { labDir: path.join(SE_DIR, '.lab'), abi });
  log('world_pad: ' + pd.note);
  const pad = async (w) => { if (w) adb.pad(w); };

  // 2) 実測(explore.mjs): 雑音 → 入力ごとの follow / persist → 1.0 の全探索 → RTTI の名前
  const repl = await openRepl({ host: '127.0.0.1', port: localPort, token, timeoutMs: 120_000 });
  try { W.explore = await explore.explore({ repl, pad, sleep, log: (m) => log('world| ' + scrub(m, secrets)) }); }
  catch (e) { W.explore = { ok: false, error: String(e.message || e) }; }
  finally { repl.close(); }
  try { fs.writeFileSync(path.join(outDir, 'scripteval-explore.json'), JSON.stringify(W.explore, null, 1)); } catch { /* best effort */ }
  console.log('\n' + scrub(explore.summarize(W.explore), secrets));

  // 3) 歩けるか: 合図 A → コントローラで 2 秒前へ(対照) → 合図 B → injectInput で 2.5 秒前へ(本題) → 合図 DONE。
  //    合図ごとに app run が where(サーバーから見た位置)。クライアントの位置も REPL で。
  const pos = async () => { try { return (await ask(JS_POS)).value; } catch { return null; } };
  const serverAt = async (word) => {
    const from = app.lines.length;
    signal(adb, word);
    const line = await app.waitLine(/\)、向き -?\d/, { from, ms: 120_000 });
    return whereOf(line);
  };
  try {
    await pad('center'); await sleep(800);
    const A = { c: await pos(), s: await serverAt('SE_MARK_A') };
    await pad('LY=-100 wait2000 LY=0'); await sleep(3500);
    const B = { c: await pos(), s: await serverAt('SE_MARK_B') };
    const before = (await ask('return { status: agent.status(), go: agent.forward(true) };')).value;
    await sleep(2500);
    const after = (await ask('return { stop: agent.stop(), status: agent.status(), tick: client.tick() };')).value;
    await sleep(1500);
    const C = { c: await pos(), s: await serverAt('SE_WORLD_DONE') };
    W.walk = {
      pad: { clientMoved: distXZ(A.c, B.c), serverMoved: distXZ(A.s, B.s) },
      inject: { clientMoved: distXZ(B.c, C.c), serverMoved: distXZ(B.s, C.s), before, after },
      at: { A, B, C },
    };
    log(`歩く(対照: コントローラ 2 秒): クライアント ${W.walk.pad.clientMoved} m・サーバー ${W.walk.pad.serverMoved} m`);
    log(`歩く(injectInput 2.5 秒): クライアント ${W.walk.inject.clientMoved} m・サーバー ${W.walk.inject.serverMoved} m  status=${JSON.stringify(after?.status ?? null)}`);
  } catch (e) { W.walkError = String(e.message || e); log('walk 失敗: ' + W.walkError.slice(0, 200)); signal(adb, 'SE_WORLD_DONE'); }

  // 4) app run の終わり(BDS を止める)を待つ
  const ex = await Promise.race([app.done, sleep(240_000).then(() => null)]);
  if (!ex) { app.stop(); log('app run が終わらないので止めました'); }
  W.app = { exit: app.exit, tail: app.lines.filter((l) => /✔|✘|PASS|FAIL|E /.test(l)).slice(-30) };
  return W;
}

/** SE_EVIDENCE 用に小さく: 入ったか・待った秒・入力ごとの「入力らしい値」の先頭・歩いた距離 */
function compactWorld(w) {
  if (!w) return null;
  const o = { inWorld: w.inWorld, waitS: w.waitS ?? null, why: w.why ?? w.error ?? null };
  if (w.explore) {
    o.explore = { ok: w.explore.ok, comps: w.explore.setup?.n ?? null, noise: w.explore.noise ?? null, error: w.explore.error ?? null };
    o.explore.follow = Object.fromEntries((w.explore.steps ?? []).map((s) => [s.name, (s.rows ?? []).flatMap((row) => row.f.filter(([, a, b, c]) => a === c && b !== 0).slice(0, 2).map(([off, , b]) => `${row.r}+0x${off.toString(16)}=${b}`)).slice(0, 4)]));
    if (w.explore.scan) o.explore.scan = w.explore.scan.steps.map(([, v]) => v.n);
  }
  if (w.walk) o.walk = { pad: w.walk.pad, inject: { clientMoved: w.walk.inject.clientMoved, serverMoved: w.walk.inject.serverMoved } };
  if (w.app) o.app = w.app.exit;
  return o;
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
  const state = { started: false, app: null, readyFile: null };
  o.world = Boolean(o.world || o.openWorld);
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    // (app run が残っていれば: 準備の合図がまだなら「できない」と伝え、止める。BDS は app run 自身が片付ける)
    if (state.readyFile && !RD.readReady(state.readyFile)) RD.writeReady(state.readyFile, { ok: false, why: 'scripteval の検証が途中で終わりました' });
    if (state.app && !state.app.exit) state.app.stop();
    // (起こしたのがこのスクリプトなら止める。--keep は端末を残す(次の run がそのまま使う)。常駐の端末には触らない)
    if (state.started && !o.keep) { R.down({ quiet: true }); R.sh('umount', [path.join(data + '.run', 'merged')], { sudo: true, quiet: true }); }
    release();
  };
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { log(`止めます(${sig})`); cleanup(); process.exit(130); });

  try {
    // 1) 端末を起こし、ゲームをタイトルまで
    try { dev = await bringUp({ data, port, log, state, noLaunch: Boolean(o.noLaunch) }); }
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
    try { const fr = await ensureFridaServer(dev.adb, dev.isRoot, { fridaVersion: o.fridaVersion, farch, log }); note('frida', `server ${fr.version} pid ${fr.pid} listen:${fr.listening}`); ev.frida = { version: fr.version, listening: fr.listening }; }
    catch (e) { note('frida_error', String(e.message || e)); return finish('frida_failed'); }

    // 5) push + 注入(既存 inject_mod.py をそのまま使う: Module.load → mod_preinit → mod_init)。各段階を標準出力にも。
    //    既存スクリプトは `[inject] <段階>` を1行ずつ出し、成否を exit code で返す。新しい注入機構は作らない。
    dev.adb.run(['push', so, DEVICE_SO], { timeout: 60_000 });
    dev.adb.run(['shell', `chmod 644 ${DEVICE_SO}`], { timeout: 10_000 });
    note('pushed_so', DEVICE_SO);
    dev.adb.run(['logcat', '-c'], { timeout: 15_000 });
    const t1 = now();
    const inj = R.sh('python3', [path.join(SE_DIR, 'inject_mod.py'), '--so', DEVICE_SO, '--pid', String(pid), '--pkg', PKG, '--host', `127.0.0.1:${FRIDA_PORT}`], { timeout: 90_000, quiet: true });
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

    const rfw = await forwardPort(dev.adb, localPort, replPort);
    note('repl_forward', rfw.ok ? `tcp:${localPort}→${replPort}` : `失敗: ${rfw.err.slice(0, 120)}`);
    const probe = await runProbe({ host: '127.0.0.1', port: localPort, token });
    report.probe = probe;
    ev.version = probe.version ?? null;
    ev.probe = { reachable: probe.reachable, authed: probe.authed, banner: probe.banner ? probe.banner.split('\n')[0] : null, checks: probe.checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail.slice(0, 160) })), conclusions: probe.conclusions, error: probe.error ?? null };

    // 7.5) 0.3.1 の機能チェック(タイトル画面でよい): injectInput の配線 / http(+https の結果) / グロリソ / 自己更新。
    //      端末はこのホストの小さな HTTP サーバに docker ブリッジ越しで届く(app run の BDS と同じ APP_HOST の道)。
    if (probe.authed && token) {
      try {
        const { bridgeIp } = await import('./game.mjs');
        const pack = features.testPack();
        const routes = { '/ping.txt': 'hello-scripteval', '/data.json': { b: 'x' }, '/webpack.mcpack': pack.bytes };
        const srv = await features.serveFiles(routes, { host: '0.0.0.0' });
        const base = `http://${bridgeIp()}:${srv.port}`;
        note('features_base', base);
        try { report.features = await features.runFeatures({ host: '127.0.0.1', port: localPort, token, base }); }
        finally { srv.srv.close(); }
        ev.features = { version: report.features.version, ok: report.features.ok, checks: report.features.checks.map((c) => ({ name: c.name, ok: c.ok })) };
        console.log('\n' + scrub(features.summarize(report.features), secrets));
      } catch (e) { note('features_error', String(e.message || e)); }
    }

    // 7.55) Studio の見た目(0.3.1「操作」タブ)。端末の :25600 を host へ forward し、この環境の Chrome で開いて撮る。
    //       ベストエフォート(Chrome 無し等は理由を記録して先へ)。撮れた png は out/ に入り成果物になる。
    if (probe.authed && token && (!o.world || o.studio)) {
      try {
        const sfw = await forwardPort(dev.adb, 25600, 25600);
        if (!sfw.ok) note('studio_forward', `失敗: ${sfw.err.slice(0, 100)}`);
        else {
          const repl = await openRepl({ host: '127.0.0.1', port: localPort, token, timeoutMs: 20_000 });
          try { report.studio = await studio.captureStudio({ repl, outDir, localPort: 25600, labDir: path.join(SE_DIR, '.lab'), log: (m) => log('studio| ' + scrub(m, secrets)) }); }
          finally { repl.close(); }
          ev.studio = { ok: report.studio.ok, agentTab: report.studio.agentTab ?? null, shots: report.studio.shots, error: report.studio.error ?? null };
          note('studio', report.studio.ok ? `撮影 ${report.studio.shots.join(', ')}${report.studio.agentTab ? '(操作タブ)' : ''}` : `撮れず: ${report.studio.error || ''}`);
        }
      } catch (e) { note('studio_error', String(e.message || e)); }
    }

    // 7.6) ワールドの中(--world): app run(ラボの BDS 参加)に入れてもらい、入力の行き先を実測し、歩けるかを試す。
    //      注入は済んでいる(タイトル)。app run は logcat を消してから手順を始めるので、scripteval の初期化の行は今のうちに。
    if (o.world && probe.conclusions?.js_runtime_runs_in_apk && token) {
      report.scripteval_log_init = seLog(dev.adb, secrets);
      for (const l of report.scripteval_log_init.slice(-24)) log('  se| ' + l);
      try { report.world = await inWorldStage({ adb: dev.adb, abi, data, localPort, token, outDir, log, secrets, state, addon: o.addon || 'agent' }); }
      catch (e) { report.world = { inWorld: false, error: String(e.message || e) }; note('world_error', report.world.error); }
      ev.world = compactWorld(report.world);
    }

    // 8) scripteval 自身のログ(どこまで初期化が進んだか: preinit / launcher apis / REPL / Studio / RTTI / tick hook)
    report.scripteval_log = seLog(dev.adb, secrets);
    for (const l of report.scripteval_log.slice(-40)) log('  se| ' + l);
    ev.log_lines = report.scripteval_log.length;

    const result = !probe.reachable ? 'repl_unreachable'
      : !probe.conclusions?.js_runtime_runs_in_apk ? 'repl_reachable'
      : report.world?.walk?.inject?.serverMoved > 0.5 ? 'inject_walks'
      : report.world?.explore?.ok ? 'world_measured'
      : report.world?.inWorld ? 'in_world'
      : probe.conclusions?.input_injection_available ? 'injectinput_present'
      : 'js_runtime_up';
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

const BOOL_FLAGS = ['--selftest', '--keep', '--no-launch', '--open-world', '--world', '--studio'];
function parseArgs(a) { const o = {}; const rest = []; for (let i = 0; i < a.length; i++) { const k = a[i]; if (BOOL_FLAGS.includes(k)) o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true; else if (k.startsWith('--')) o[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[++i]; else rest.push(k); } o._ = rest; return o; }

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
  // --world: app run の where の答え(サーバーから見た位置)を読む・名前を伏せる(純粋)
  const w = whereOf('    ✔ 14 where → <player>: (3.5, -60, -12.2)、向き -91.3°（東）・上下 0°、体力 20/20、手に なし、overworld');
  t('whereOf: 位置と向きを読む', w && w.x === 3.5 && w.y === -60 && w.z === -12.2 && w.yaw === -91.3);
  t('whereOf: 位置の無い行は null', whereOf('    ✔ 13 until log SE_MARK_A') === null);
  t('scrubAppLine: プレイヤー名を伏せる', scrubAppLine('where → Steve123: (1.5, -60, 2)、向き 0°') === 'where → <player>: (1.5, -60, 2)、向き 0°');
  // soImports: 小さな .so(入力の関数を借りる)を APK(zip)に入れて、名前が読めるか(readelf・cc・zip がある所だけ)
  const have = (b) => R.sh('sh', ['-c', `command -v ${b}`], { quiet: true }).status === 0;
  if (['readelf', 'cc', 'zip', 'unzip'].every(have)) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'se-imp-t-')), lib = path.join(d, 'lib', 'x86_64');
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(path.join(d, 'g.c'), 'int AInputQueue_getEvent(void*, void**); int ALooper_pollAll(int, int*, int*, void**); void ANativeActivity_onCreate(void* a, void* s, int n) { void* e; AInputQueue_getEvent(a, &e); ALooper_pollAll(0, 0, 0, 0); }\n');
    const cc = R.sh('cc', ['-shared', '-fPIC', '-o', path.join(lib, 'libminecraftpe.so'), path.join(d, 'g.c')], { quiet: true });
    const zp = R.sh('sh', ['-c', `cd '${d}' && zip -q -r split.apk lib`], { quiet: true });
    const r = cc.status === 0 && zp.status === 0 ? soImports(d, 'x86_64') : null;
    t('soImports: 借りる入力・ループの関数と出す関数を読む', r && r.imports.input.includes('AInputQueue_getEvent') && r.imports.looper.includes('ALooper_pollAll') && r.exports.nativeActivity.includes('ANativeActivity_onCreate'));
    fs.rmSync(d, { recursive: true, force: true });
  } else console.log('- soImports: readelf/cc/zip が無いので飛ばします');
  t('WORLD_SCENARIO: 合図を待つ手順がある', /until log SE_MARK_A[\s\S]*until log SE_MARK_B[\s\S]*until log SE_WORLD_DONE/.test(fs.readFileSync(WORLD_SCENARIO, 'utf8')));
  // 専用鍵: SCRIPTEVAL_SO_KEY が APP_CACHE_KEY より優先(両方あっても SO_KEY を使う)
  t('soVaultKey: SCRIPTEVAL_SO_KEY を使う', soVaultKey({ SCRIPTEVAL_SO_KEY: 'K1', APP_CACHE_KEY: 'K2' })?.id === V.vaultKey({ APP_CACHE_KEY: 'K1' }).id);
  t('soVaultKey: 無ければ従来どおり', soVaultKey({ APP_CACHE_KEY: 'K2' })?.id === V.vaultKey({ APP_CACHE_KEY: 'K2' }).id);
  // 各モジュール自身の selftest(偽 REPL で実プロトコル・機能・オフセット探索)
  for (const m of ['probe.mjs', 'features.mjs', 'world.mjs', 'explore.mjs', 'studio.mjs']) {
    const r = spawnSync(process.execPath, [path.join(SE_DIR, m), '--selftest'], { encoding: 'utf8' });
    t(`${m} --selftest`, r.status === 0 && /SELFTEST OK/.test(r.stdout));
  }
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
