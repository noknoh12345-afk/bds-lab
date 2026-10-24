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
//                                       [--open-world] [--no-launch]
//     --open-world: 注入後に自分のシングルプレイ「own world」を開き(BDS なし=切断されない)、ワールドの中で
//                   injectInput の実効に要るオフセット(moveVectorX/Z・cameraYaw/Pitch)を mod の読み取り専用 dbg で探す。
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
import * as world from './scripteval/world.mjs';
import * as studio from './scripteval/studio.mjs';
import { ocrWords, playScreen, playTab, joinScreen } from '../lib/client.mjs';

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

/** PLAY→Worlds→(先頭のワールド)→開く、の 1 手を画面の状態から決める(純粋。偽の OCR で試験できる)。
 *  state: client.mjs joinScreen の戻り(title / play-empty / play-lan / prompt-* / generating / loading / connecting / other / blank)
 *  tab: client.mjs playTab の戻り(worlds / realms / null)。戻り: 'A' 押す / 'LB' タブを左へ / 'wait' 待つ */
export function nextWorldAction(state, tab) {
  if (/^generating|^loading|^connecting|^downloading/.test(state)) return 'wait';
  if (state === 'title') return 'A';                               // タイトル → 入る
  if (state === 'play-empty' || state === 'play-lan') return tab === 'realms' ? 'LB' : 'A'; // Worlds タブで先頭のカードを開く
  if (state.startsWith('prompt-')) return 'A';                     // 「続ける/パック」等は A
  return 'A';                                                      // other/blank: 軽く A で促す(回数で頭打ち)
}

/** 端末の自分のシングルプレイ「own world」を開く(BDS なし=切断されない)。ready() が真になるまで画面を見て 1 手ずつ。
 *  OCR とコントローラ頼みなので、各手でスクショを残す(外した所が後で分かる)。offline では nextWorldAction を試験する。 */
async function enterOwnWorld(adb, { log, shotDir, ready, sleep, maxMs = 90_000 }) {
  const shot = (name) => { try { const p = path.join(shotDir, `world-${name}.png`); fs.writeFileSync(p, adb.screencap()); return path.basename(p); } catch { return null; } };
  const read = () => { try { return ocrWords(adb.screencap()); } catch { return []; } };
  const trail = [];
  const end = now() + maxMs;
  shot('00-start');
  let i = 0, aOnWorlds = 0;
  while (now() < end) {
    if (await ready()) { shot(`${String(i).padStart(2, '0')}-inworld`); return { entered: true, trail, s: secs(now() - (end - maxMs)) }; }
    const w = read();
    const state = joinScreen(w), tab = playScreen(w) ? playTab(w) : null;
    let act = nextWorldAction(state, tab);
    // Worlds タブで A を 3 回押しても入れないなら、カードに焦点が無い可能性 → DOWN で寄せてから A
    if (act === 'A' && (state === 'play-empty' || state === 'play-lan')) { if (aOnWorlds >= 3 && aOnWorlds % 2 === 1) act = 'DOWN'; aOnWorlds++; }
    trail.push(`${state}${tab ? '/' + tab : ''}:${act}`);
    log(`world| ${i}: ${state}${tab ? '(' + tab + ')' : ''} → ${act}`);
    if (act === 'wait') { await sleep(2500); }
    else { adb.pad(act); await sleep(act === 'A' ? 3500 : 1500); }
    if (i % 4 === 0) shot(`${String(i).padStart(2, '0')}-${state}`);
    i++;
  }
  shot('99-timeout');
  return { entered: await ready(), trail, s: secs(maxMs / 1000) };
}

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
    if (probe.authed && token) {
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

    // 7.6) ワールドの中: injectInput の実効に要るオフセットを mod の読み取り専用 dbg で探す(ワールドに入っていれば)。
    //      タイトルのまま(未参加)なら「未参加」を記録して次段へ。探索は一切書き込まない(読むだけ)。
    if (probe.conclusions?.input_injection_available && token) {
      try {
        const repl = await openRepl({ host: '127.0.0.1', port: localPort, token, timeoutMs: 20_000 });
        try {
          const inWorld = async () => { const q = await repl.js('const lp = mc.localPlayer(); return !!(lp && lp[0]);'); return q.ok && q.value === true; };
          // --open-world: BDS なしの自分のシングルプレイ「own world」を開く(切断されない。injectInput が実際にプレイヤーを動かす)。
          //  コントローラが要るので先に用意。入れたら mod はワールドを見つけ LocalPlayer を検証する。
          if (!(await inWorld()) && o.openWorld) {
            const pd = startPad(dev.adb, { labDir: path.join(SE_DIR, '.lab'), abi });
            note('world_pad', pd.note);
            const ent = await enterOwnWorld(dev.adb, { log, shotDir: outDir, ready: inWorld, sleep });
            report.enterWorld = { entered: ent.entered, trail: ent.trail, s: ent.s };
            note('enter_world', ent.entered ? `入れました(${ent.s} 秒、手順 ${ent.trail.length})` : `入れず(${ent.s} 秒、手順 ${ent.trail.join(' ')})`);
          }
          if (await inWorld()) {
            if (!dev.adb.padReady) { const pd = startPad(dev.adb, { labDir: path.join(SE_DIR, '.lab'), abi }); note('world_pad', pd.note); }
            report.world = await world.findOffsets({ repl, pad: async (w) => { dev.adb.pad(w); }, sleep, log: (m) => log('world| ' + scrub(m, secrets)) });
          } else {
            report.world = { inWorld: false, why: o.openWorld ? 'ワールドに入れませんでした(enterWorld の手順/スクショを見て調整)' : 'タイトル画面(未参加)。--open-world でシングルプレイを開く' };
          }
        } finally { repl.close(); }
        ev.world = { inWorld: report.world.inWorld, found: report.world.found ?? null };
        console.log('\n' + scrub(world.summarize(report.world), secrets));
      } catch (e) { note('world_error', String(e.message || e)); }
    }

    // 8) scripteval 自身のログ(どこまで初期化が進んだか: preinit / launcher apis / REPL / Studio / RTTI / tick hook)
    const lc = dev.adb.run(['logcat', '-d', '-v', 'brief'], { timeout: 30_000 }).stdout || '';
    report.scripteval_log = lc.split('\n').filter((l) => /ScriptEval|scripteval|REPL|launcher apis|RTTI|Studio|tick hook|libscripteval/i.test(l)).map((l) => scrub(l.trim(), secrets).slice(0, 300)).slice(-60);
    for (const l of report.scripteval_log.slice(-40)) log('  se| ' + l);
    ev.log_lines = report.scripteval_log.length;

    const result = !probe.reachable ? 'repl_unreachable'
      : !probe.conclusions?.js_runtime_runs_in_apk ? 'repl_reachable'
      : report.world?.inWorld && Object.keys(report.world.found ?? {}).length ? 'offsets_found'
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

const BOOL_FLAGS = ['--selftest', '--keep', '--no-launch', '--open-world'];
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
  // world opener の 1 手の判断(純粋): タイトル→A、Worlds で A、Realms なら LB、読み込み中は wait
  t('nextWorldAction: title → A', nextWorldAction('title', null) === 'A');
  t('nextWorldAction: play-empty + worlds → A', nextWorldAction('play-empty', 'worlds') === 'A');
  t('nextWorldAction: play-lan + realms → LB', nextWorldAction('play-lan', 'realms') === 'LB');
  t('nextWorldAction: generating → wait', nextWorldAction('generating', null) === 'wait');
  t('nextWorldAction: prompt-packs → A', nextWorldAction('prompt-packs', null) === 'A');
  // 専用鍵: SCRIPTEVAL_SO_KEY が APP_CACHE_KEY より優先(両方あっても SO_KEY を使う)
  t('soVaultKey: SCRIPTEVAL_SO_KEY を使う', soVaultKey({ SCRIPTEVAL_SO_KEY: 'K1', APP_CACHE_KEY: 'K2' })?.id === V.vaultKey({ APP_CACHE_KEY: 'K1' }).id);
  t('soVaultKey: 無ければ従来どおり', soVaultKey({ APP_CACHE_KEY: 'K2' })?.id === V.vaultKey({ APP_CACHE_KEY: 'K2' }).id);
  // 各モジュール自身の selftest(偽 REPL で実プロトコル・機能・オフセット探索)
  for (const m of ['probe.mjs', 'features.mjs', 'world.mjs', 'studio.mjs']) {
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
