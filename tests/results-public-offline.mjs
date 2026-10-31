#!/usr/bin/env node
// app checks for a public repository, no network (a fake GitHub API on 127.0.0.1, a fake gh on PATH):
//  1. --seal <runs>: not private → each run folder becomes results.sealed (the vault's key) + summary.json in the clear,
//     with no screen text, log line, step text, e-mail or device id; private → nothing changes; no key → nothing but summary.json
//  2. checks (the report job): a sealed run → one check from summary.json alone; an unsealed one → as before (screens too)
//  3. this machine's way back: app ci fetch <run> takes the artifact, opens it with the key, the run is as it was;
//     another key / no key → says what to do, the summary stays
// node tests/results-public-offline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, m, d = '') => { console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : '\n  ' + String(d).split('\n').slice(-14).join('\n  ')}`); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'results-public-'));
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const KEY = 'test-only-results-key-1', EMAIL = 'someone.private@example.com', SCREEN = 'SCREEN-TEXT-ON-THE-TITLE', LOG = 'LOGCAT-LINE-ANDROID-ID-0123456789abcdef', STEP = 'chat my-secret-words';
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), crypto.randomBytes(3000)]);
// a run folder as app run leaves it (two steps passed, the second of three failed)
const makeRun = (root, name = '20261007-120000-demo') => {
  const d = path.join(root, name);
  w(path.join(d, 'report.md'), `# app: FAIL — demo\n\n| | |\n|---|---|\n| 結果 | FAIL |\n| アプリ | 1.21.120.4 (912012004) |\n| BDS | 1.21.120.4 |\n| 時間 | 95s |\n\n## 手順\n\n- ✔ 1: \`join\`\n- ✘ 2: \`${STEP}\` — ${SCREEN} ${EMAIL}\n`);
  w(path.join(d, 'result.json'), JSON.stringify({ ok: false, addon: 'demo', app: { versionName: '1.21.120.4', versionCode: 912012004 }, bds: { version: '1.21.120.4', exact: true }, started: 1000, ended: 96_000, timing: { join: 12_345 }, results: [{ ok: true, line: 3, raw: 'join' }, { ok: false, line: 7, raw: STEP, note: SCREEN }, { ok: true, line: 9, raw: 'wait 1' }], notes: [EMAIL], media: { sent: 12, failed: 1, late: false, why: SCREEN },
    // measure steps (lib/measure.mjs): a kind's own numbers go out; words, other fields, other kinds and why it failed do not
    measures: [{ line: 11, section: 'hud', kind: 'geoui', shot: 'calib-device', ok: true, why: SCREEN, values: { unitsPerScreenH: 176.25, centreFixX: -0.0017, centreFixY: -0.05256, width: 1560, height: 720, rmsPx: SCREEN, secret: 5 } },
      { line: 12, kind: 'geoui', shot: EMAIL, ok: false, values: {}, why: SCREEN }, { line: 13, kind: 'ocr', shot: 'x', ok: true, values: { text: 1 } }] }));
  w(path.join(d, 'steps.txt'), `OK   3 join\nFAIL 7 ${STEP}  ${SCREEN}\nOK   9 wait 1\n`);
  w(path.join(d, 'run.txt'), `E something failed ${LOG}\n${EMAIL}\n`);
  w(path.join(d, 'logcat.txt'), `${LOG}\n`);
  w(path.join(d, 'shots', '01-title.png'), PNG);
  return d;
};
const tree = (d) => fs.readdirSync(d, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(d, f)).isFile()).sort()
  .map((f) => `${f.split(path.sep).join('/')} ${crypto.createHash('sha256').update(fs.readFileSync(path.join(d, f))).digest('hex').slice(0, 16)}`);
// the lab, as the workflow runs it (async: the fake API answers in this process)
const lab = (args, env = {}) => new Promise((res) => {
  const e = { ...process.env, LAB_DOTENV: 'off', GITHUB_ACTIONS: 'true', ...env };
  for (const k of ['GOOGLE_EMAIL', 'GOOGLE_AAS_TOKEN', 'GOOGLE_PASSWORD', 'APP_CACHE_KEY']) if (!(k in env)) delete e[k];
  for (const [k, v] of Object.entries(e)) if (v === undefined) delete e[k];
  const c = spawn(process.execPath, [path.join(TOP, 'lab.mjs'), 'app', ...args], { cwd: TOP, env: e });
  let text = ''; c.stdout.on('data', (b) => { text += b; }); c.stderr.on('data', (b) => { text += b; });
  const timer = setTimeout(() => c.kill('SIGKILL'), 120_000);
  c.on('close', (status) => { clearTimeout(timer); res({ status, text }); });
});
const PUB = { APP_REPO_VISIBILITY: 'public', APP_CACHE_KEY: KEY };

// ---- 1. --seal ----
const runs = path.join(tmp, 'runs'), run = makeRun(runs), before = tree(run);
const keep = path.join(tmp, 'original'); fs.cpSync(run, keep, { recursive: true });
let r = await lab(['checks', '--seal', runs], PUB);
ok(r.status === 0 && /OK .*results\.sealed/.test(r.text), 'public with a key: sealed', r.text);
ok(JSON.stringify(fs.readdirSync(run).sort()) === JSON.stringify(['results.sealed', 'summary.json']), 'only results.sealed and summary.json are left', fs.readdirSync(run).join(' '));
const sumText = fs.readFileSync(path.join(run, 'summary.json'), 'utf8'), sum = JSON.parse(sumText);
ok(sum.ok === false && sum.steps === 3 && JSON.stringify(sum.failed) === '[2]' && JSON.stringify(sum.failed_lines) === '[7]' && JSON.stringify(sum.failed_codes) === '["other"]' && sum.seconds === 95 && sum.join_seconds === 12.3 && sum.bds === '1.21.120.4' && sum.app === '1.21.120.4' && sum.addon === 'demo' && sum.sealed === true && JSON.stringify(sum.media) === '{"sent":12,"failed":1,"late":false}', 'summary.json: the verdict, the steps and which failed, seconds, the versions, how many pictures went to Discord (numbers only)', sumText);
ok(![EMAIL, SCREEN, LOG, STEP, 'my-secret-words', '0123456789abcdef', '01-title', KEY].some((x) => sumText.includes(x)), 'summary.json: no e-mail, screen text, log line, step text, device id, screenshot or key', sumText);
ok(JSON.stringify(sum.measures) === JSON.stringify([{ kind: 'geoui', shot: 'calib-device', line: 11, ok: true, values: { width: 1560, height: 720, unitsPerScreenH: 176.25, centreFixX: -0.0017, centreFixY: -0.05256 } }, { kind: 'geoui', shot: null, line: 12, ok: false, values: {}, code: 'other' }]),
  "summary.json: the measures, a kind's own numbers only (no word, other field, other kind or why: a failure only as its code)", JSON.stringify(sum.measures));
const sealedBuf = fs.readFileSync(path.join(run, 'results.sealed'));
ok(sealedBuf.subarray(0, 8).toString() === 'BDSLABV1' && ![EMAIL, SCREEN, LOG].some((x) => sealedBuf.includes(Buffer.from(x))), "the vault's form, nothing readable in it");
ok(!r.text.includes(KEY) && !r.text.includes(EMAIL) && !r.text.includes(SCREEN), 'nothing of the key or the run in what it says', r.text);
r = await lab(['checks', '--seal', runs], PUB);
ok(r.status === 0 && JSON.stringify(fs.readdirSync(run).sort()) === '["results.sealed","summary.json"]', 'again: nothing more to seal', r.text);

// private: nothing changes
const privRuns = path.join(tmp, 'priv'), priv = makeRun(privRuns), privBefore = tree(priv);
r = await lab(['checks', '--seal', privRuns], { APP_REPO_VISIBILITY: 'private', APP_CACHE_KEY: KEY });
ok(r.status === 0 && JSON.stringify(tree(priv)) === JSON.stringify(privBefore) && /private/.test(r.text), 'private: nothing changes', r.text);
// public without a key: not uploaded at all (summary.json only)
const noKeyRuns = path.join(tmp, 'nokey'), noKey = makeRun(noKeyRuns);
r = await lab(['checks', '--seal', noKeyRuns], { APP_REPO_VISIBILITY: 'public' });
const nk = JSON.parse(fs.readFileSync(path.join(noKey, 'summary.json'), 'utf8'));
ok(r.status === 0 && /^W .*鍵がありません/m.test(r.text) && JSON.stringify(fs.readdirSync(noKey)) === '["summary.json"]' && nk.sealed === false && nk.steps === 3, 'public without a key: said, the contents gone, summary.json only', r.text);
// internal and a missing visibility are not private either
for (const v of ['internal', undefined]) {
  const d0 = path.join(tmp, `vis-${v}`), d = makeRun(d0);
  r = await lab(['checks', '--seal', d], { APP_REPO_VISIBILITY: v, APP_CACHE_KEY: KEY });
  ok(r.status === 0 && fs.existsSync(path.join(d, 'results.sealed')) && !fs.existsSync(path.join(d, 'report.md')), `${v ?? '(no visibility)'}: sealed (a run folder given itself works too)`, r.text);
}

// ---- 2. checks (report job) through a fake GitHub API ----
const posts = [];
const server = http.createServer((q, s) => {
  let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => {
    if (q.method === 'POST' && q.url.endsWith('/check-runs')) { posts.push(JSON.parse(b)); s.writeHead(201, { 'content-type': 'application/json' }); s.end('{}'); return; }
    s.writeHead(404); s.end('{}');
  });
});
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const API = { GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, GITHUB_TOKEN: 'fake-token', GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: 'abc123', GITHUB_RUN_ID: '424242' };
r = await lab(['checks', runs], { ...API, APP_REPO_VISIBILITY: 'public' });
const all = JSON.stringify(posts);
ok(r.status === 0 && posts.length === 1 && /^FAIL .*中身は暗号化/.test(posts[0].output.title), 'a sealed run: one check (no logcat, no screens)', r.text + all);
ok(/手順 3 個、落ちた: 2 番目（7 行目 other）/.test(posts[0].output.summary) && /1\.21\.120\.4/.test(posts[0].output.summary) && /95s/.test(posts[0].output.summary) && !posts[0].output.text, 'its summary: the verdict, which step, versions, seconds; no text', posts[0]?.output?.summary);
ok(/中身は暗号化されています: 手元で node lab\.mjs app ci watch 424242/.test(posts[0].output.summary), 'one line: where to read it', posts[0]?.output?.summary);
ok(/^\| Discord \| 写真・動画 12 個（送れなかった 1 回） \|$/m.test(posts[0].output.summary), 'how many pictures and videos went to Discord (numbers only)', posts[0]?.output?.summary);
ok(/^- 測った値 calib-device（geoui、11 行目）: 画面の高さ 176\.250 単位.*中心のずれ x -0\.00170 \/ y -0\.05256/m.test(posts[0].output.summary) && /^- 測った値 \?（geoui、12 行目）: ✘ 測れません（other）$/m.test(posts[0].output.summary) && posts[0].output.summary.includes('"unitsPerScreenH":176.25'),
  'the measures in the check: a line each (a failed one with its code) and the numbers as JSON', posts[0]?.output?.summary);
ok(![EMAIL, SCREEN, LOG, STEP, 'my-secret-words', 'base64'].some((x) => all.includes(x)), 'no e-mail, screen text, log line or step text in the check', all);
const sealedChecks = posts.splice(0);
posts.length = 0;
r = await lab(['checks', noKeyRuns], { ...API, APP_REPO_VISIBILITY: 'public' });
ok(r.status === 0 && posts.length === 1 && /中身は出していません/.test(posts[0].output.title) && /鍵が無かった/.test(posts[0].output.summary), 'no key: the check says the contents were not uploaded', JSON.stringify(posts));
posts.length = 0;
r = await lab(['checks', privRuns], { ...API, APP_REPO_VISIBILITY: 'private' });
ok(r.status === 0 && posts.some((p) => /^app: 画面 01-title\.png/.test(p.name)) && posts.some((p) => p.name === 'app: 結果' && /^FAIL 20261007/.test(p.output.title)) && !JSON.stringify(posts).includes('中身は暗号化'), 'not sealed: as before (the report, the screens)', JSON.stringify(posts.map((p) => p.name)));
server.close();

// ---- 3. this machine: app ci fetch <run> (a fake gh) opens the sealed artifact ----
const id = String(900_000_000 + Math.floor(Math.random() * 99_999_999)), gotDir = path.join(TOP, 'app', 'runs', `gh-${id}`);
const art = path.join(tmp, 'artifact'), artName = `app-demo-${id}`;
fs.cpSync(runs, path.join(art, artName), { recursive: true });
w(path.join(tmp, 'checks.jsonl'), sealedChecks.map((p) => JSON.stringify({ name: p.name, external_id: id, output: p.output })).join('\n') + '\n');
const bin = path.join(tmp, 'bin');
w(path.join(bin, 'gh'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), a = process.argv.slice(2), T = ${JSON.stringify(tmp)}, ID = ${JSON.stringify(id)};
if (a[0] === '--version') { console.log('gh version 2.0.0 (fake)'); process.exit(0); }
if (a[0] === 'run' && a[1] === 'download') { const d = a[a.indexOf('-D') + 1]; fs.cpSync(path.join(T, 'artifact'), d, { recursive: true }); process.exit(0); }
if (a[0] === 'api') {
  const u = a[1];
  if (u === 'repos/o/r/actions/runs/' + ID) { console.log(JSON.stringify({ id: Number(ID), head_sha: 'abc123', status: 'completed', conclusion: 'failure' })); process.exit(0); }
  if (u.startsWith('repos/o/r/commits/abc123/check-runs')) { process.stdout.write(fs.readFileSync(path.join(T, 'checks.jsonl'), 'utf8')); process.exit(0); }
  if (u === 'repos/o/r/actions/runs/' + ID + '/jobs') { console.log('{"jobs":[]}'); process.exit(0); }
}
console.error('fake gh: ' + a.join(' ')); process.exit(1);
`);
fs.chmodSync(path.join(bin, 'gh'), 0o755);
const PATHX = { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
try {
  r = await lab(['ci', 'fetch', id, '--repo', 'o/r'], { ...PATHX, APP_CACHE_KEY: KEY });
  const back = fs.existsSync(gotDir) ? tree(gotDir) : [];
  ok(r.status === 0 && /暗号化された結果を開きました/.test(r.text), 'the key of .env.local: opened', r.text);
  ok(before.every((l) => back.includes(l)), 'every file as it was (the same bytes): report, logs, the screenshot', `${before.join('\n')}\n----\n${back.join('\n')}`);
  ok(new RegExp(`FAIL app/runs/gh-${id}`).test(r.text) && /✘ 2:/.test(r.text) && !fs.existsSync(path.join(gotDir, '.artifacts')), 'the report read as before, the download folder gone', r.text);
  // another key: says so, the summary stays, nothing of the run
  r = await lab(['ci', 'fetch', id, '--repo', 'o/r'], { ...PATHX, APP_CACHE_KEY: 'another-key' });
  ok(r.status === 0 && /開けません/.test(r.text) && /APP_CACHE_KEY/.test(r.text) && fs.existsSync(path.join(gotDir, 'report.md')) && !fs.existsSync(path.join(gotDir, 'run.txt')) && !fs.existsSync(path.join(gotDir, 'shots', '01-title.png')), 'another key: what to do, only the summary', r.text);
  r = await lab(['ci', 'fetch', id, '--repo', 'o/r'], { ...PATHX });
  ok(r.status === 0 && /開く鍵がありません/.test(r.text) && /\.env\.local/.test(r.text) && !fs.existsSync(path.join(gotDir, 'run.txt')), 'no key: what to do, only the summary', r.text);
  // checks --open by itself (the way redroid's artifacts are opened): in place, the sealed file gone
  const copy = path.join(tmp, 'open-copy'); fs.cpSync(runs, copy, { recursive: true });
  r = await lab(['checks', '--open', copy], { APP_CACHE_KEY: KEY, GITHUB_ACTIONS: undefined });
  const opened = tree(path.join(copy, path.basename(run)));
  ok(r.status === 0 && before.every((l) => opened.includes(l)) && !fs.existsSync(path.join(copy, path.basename(run), 'results.sealed')), 'checks --open: in place, the same files', r.text);
  r = await lab(['checks', '--open', copy], { APP_CACHE_KEY: KEY, GITHUB_ACTIONS: undefined });
  ok(r.status === 0 && /ありません/.test(r.text), 'nothing sealed: said', r.text);
  // redroid's artifact (out/: files right in it) sealed as itself, opened by app ci fetch --device redroid
  const out = path.join(tmp, 'out'); w(path.join(out, 'report.md'), `# app: PASS — demo\n${SCREEN}\n`); w(path.join(out, 'run-01.png'), PNG);
  const outBefore = tree(out);
  r = await lab(['checks', '--seal', out], PUB);
  ok(r.status === 0 && JSON.stringify(fs.readdirSync(out).sort()) === '["results.sealed","summary.json"]' && JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')).ok === true, "redroid's out/: sealed as one folder", r.text);
  fs.rmSync(art, { recursive: true, force: true }); fs.cpSync(out, path.join(art, 'redroid-game'), { recursive: true });
  r = await lab(['ci', 'fetch', id, '--repo', 'o/r', '--device', 'redroid'], { ...PATHX, APP_CACHE_KEY: KEY });
  const rd = path.join(gotDir, 'redroid-game');
  ok(fs.existsSync(rd) && outBefore.every((l) => tree(rd).includes(l)) && /暗号化された結果を開きました/.test(r.text) && r.text.includes(SCREEN), 'redroid: opened in place, its report read', r.text);
} finally { fs.rmSync(gotDir, { recursive: true, force: true }); }
ok(JSON.stringify(tree(keep)) === JSON.stringify(before), '(the copy of the original is untouched)');

fs.rmSync(tmp, { recursive: true, force: true });
// ---- 4. why a step failed, as a code (lib/failcodes.mjs): the words of the fixed list, never the message ----
{
  const F = await import(new URL('../app/lib/failcodes.mjs', import.meta.url).href);
  const join = `PLAY の LAN のワールドへ進めませんでした（LAN のワールドが出ない: 端末の中継（UDP 7551）と BDS の LAN の公開を確かめる）（画面の文字: ${SCREEN} ${EMAIL}）`;
  const codes = [join, '180000 ミリ秒待ちました: サーバーに接続が来ていません（参加の画面・サインイン・版の違い？ 画面を見てください）', `測れません（geoui calib-plain）: only 4 square marks on the picture`, `画面に /Play/ の文字が見つかりません（読めた文字: ${SCREEN}）`, SCREEN, undefined].map(F.stepCode);
  ok(JSON.stringify(codes) === '["join-lan-missing","joined-no-connection","measure-failed","text-missing","other","other"]', 'step codes from their messages', JSON.stringify(codes));
  const mv = F.stepCode(`60000 ミリ秒待ちました: 画面が落ち着きません（動き続けた所: 0,24–1560,720 px・3.41%・格子 1111.1111.0110）（画面の文字: ${SCREEN}）`);
  ok(mv === 'stable-moving 0/24/1560/720/3.41/1111.1111.0110' && F.cleanCode(mv) === mv, 'a screen that never held still: where it moved, in numbers', mv);
  const mc = ['only 4 square marks on the picture', 'no grid of equally spaced squares on the picture', 'only 7 grid markers in 2 columns and 3 rows on the picture (9 in 3 of each are needed: hold the screen across)', 'the squares found are 12.5 units wide, not 3: not the grid (text or HUD pieces)', `${SCREEN} ${EMAIL}`].map(F.measureCode);
  ok(JSON.stringify(mc) === '["few-marks 4","no-grid","few-rows 7/2/3","wrong-size 12.5","other"]', 'measure codes with their counts, nothing else', JSON.stringify(mc));
  ok(F.cleanCode('join-lan-missing') === 'join-lan-missing' && F.cleanCode('few-rows 7/2/3') === 'few-rows 7/2/3' && F.cleanCode(`other ${SCREEN}`) === null && F.cleanCode(EMAIL) === null && F.cleanCode(42) === null, 'only codes of that form are kept');
  // a run whose failed steps say why: their codes in summary.json and the check, the messages nowhere
  const d0 = path.join(tmp, 'coded'), d = makeRun(d0, '20261021-070000-coded');
  const res = JSON.parse(fs.readFileSync(path.join(d, 'result.json'), 'utf8'));
  res.results[1].note = join; res.measures[1].why = 'only 4 square marks on the picture';
  fs.writeFileSync(path.join(d, 'result.json'), JSON.stringify(res));
  const rr = await lab(['checks', '--seal', d0], PUB), cs = fs.readFileSync(path.join(d, 'summary.json'), 'utf8'), c = JSON.parse(cs);
  ok(rr.status === 0 && JSON.stringify(c.failed_codes) === '["join-lan-missing"]' && c.measures[1].code === 'few-marks 4' && ![SCREEN, EMAIL, 'UDP 7551', 'square marks'].some((x) => cs.includes(x)), 'summary.json: the codes, none of the words', cs);
  // ---- 5. a step's trail (the screens a join went through): the lab's states and the game's own UI words only ----
  const W = (s) => s.split(' ').map((text) => ({ text }));
  const tr = F.makeTrail(6);
  tr.add('title-new', W(`Get started More options ${EMAIL} Alexandra`)); tr.add('title-new', W('Hore options Select Exit'));
  tr.add('wait'); for (const k of ['unknown-a', 'unknown-b', 'restart', 'unknown-a', 'play-empty']) tr.add(k, W(`Worlds Realms Servers ${EMAIL} Kz9Player`));
  const tt = tr.text();
  ok(/^title-new\*2\[get\+started\+more\+options\+select\+exit\] wait unknown-a\[worlds\+realms\+servers\] unknown-b\[worlds\+realms\+servers\] cut\*1 /.test(tt) && tt.endsWith('play-empty[worlds+realms+servers]') && F.cleanTrail(tt) === tt && !tt.includes('alexandra') && !tt.includes('example'), 'a trail: runs counted, UI words only, the start and the end kept', tt);
  ok(F.cleanTrail('title-new[get+started]') !== null && F.cleanTrail('title-new[get+someone]') === null && F.cleanTrail(`wait ${EMAIL}`) === null && F.cleanTrail('Wait') === null && F.cleanTrail(42) === null && F.cleanTrail('a'.repeat(901)) === null, 'only a trail of that form and vocabulary is kept');
  ok(F.stepCode(`PLAY の LAN のワールドへ進めませんでした（PLAY の画面に着きません（アプリを起動し直した: 2 回）: 道筋の画面を見る）（画面の文字: ${SCREEN}）（道筋: ${tt}）`) === 'join-play-unreached 2', 'PLAY never reached: its own code');
  const d2 = makeRun(path.join(tmp, 'trail'), '20261021-080000-trail'), r2 = JSON.parse(fs.readFileSync(path.join(d2, 'result.json'), 'utf8'));
  r2.results[1].note = join; r2.results[1].trail = tt; r2.results[0].trail = `play-lan[${EMAIL}]`;
  fs.writeFileSync(path.join(d2, 'result.json'), JSON.stringify(r2));
  const r3 = await lab(['checks', '--seal', path.join(tmp, 'trail')], PUB), s2 = fs.readFileSync(path.join(d2, 'summary.json'), 'utf8'), c2 = JSON.parse(s2);
  ok(r3.status === 0 && c2.failed_trails?.[String(r2.results[1].line)] === tt && Object.keys(c2.failed_trails).length === 1 && ![SCREEN, EMAIL].some((x) => s2.includes(x)), 'summary.json: the failed step\'s trail (its line), nothing else', s2);
  const got = [], srv2 = http.createServer((q, s) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => { if (q.method === 'POST' && q.url.endsWith('/check-runs')) got.push(JSON.parse(b)); s.writeHead(201, { 'content-type': 'application/json' }); s.end('{}'); }); });
  await new Promise((res) => srv2.listen(0, '127.0.0.1', res));
  const ck = await lab(['checks', path.join(tmp, 'trail')], { ...API, GITHUB_API_URL: `http://127.0.0.1:${srv2.address().port}`, APP_REPO_VISIBILITY: 'public' });
  srv2.close();
  ok(ck.status === 0 && got[0]?.output?.summary?.includes(`| 道筋（${r2.results[1].line} 行目） | \`${tt}\` |`), 'the check shows it', ck.text.slice(-800) + JSON.stringify(got).slice(0, 1500));
  // ---- 6. a join's wait (until joined): no "Player connected" told apart by the app's last screen; a join that went in
  // keeps its trail and when the server said the player connected — numbers and the lab's words only ----
  const wait = (t) => `300000 ミリ秒待ちました: ${t}（画面の文字: ${SCREEN}）（道筋: prompt-packs downloading*40[downloading+resource+packs]）`;
  const jc = ['サーバーに接続の行（Player connected）が無いまま、アプリはサーバーのパックを取り込んでいました（最後の画面: パックのダウンロード）: パックが大きいと時間がかかる。until joined の時間を延ばす',
    'サーバーに接続の行（Player connected）が無いまま、アプリは読み込みの画面のままでした', 'サーバーに接続の行（Player connected）が無いまま、アプリはサーバーにつなぐ画面のままでした',
    'サーバーに接続の行（Player connected）が無いまま、アプリは参加をやめて PLAY かタイトルに戻っていました（LAN のワールドを押した A が効かなかった？）',
    'サーバーに接続が来ていません（参加の画面・サインイン・版の違い？ 画面を見てください）', 'サーバーには接続したが、ワールドに出ていません（確認画面やリソースパックのダウンロードで止まっている？ 画面を見てください）'].map((t) => F.stepCode(wait(t)));
  ok(JSON.stringify(jc) === '["joined-packs-slow","joined-loading","joined-connecting","joined-back-out","joined-no-connection","joined-not-in-world"]', 'a join that never connected: what the app showed last, as a code', JSON.stringify(jc));
  const jt = 'title-play prompt-rated[online+play+rated] prompt-packs[download+resource+packs] downloading*12[downloading+resource+packs] srv-connected srv-spawned world';
  ok(F.cleanTrail(jt) === jt, 'the join\'s states and words are the lab\'s own (a public trail)', jt);
  const d3 = makeRun(path.join(tmp, 'joined'), '20261022-090000-joined'), r4 = JSON.parse(fs.readFileSync(path.join(d3, 'result.json'), 'utf8'));
  r4.results.splice(1, 0, { ok: true, line: 4, verb: 'until', raw: 'until joined 300000', note: SCREEN, trail: jt, connectedAt: 1000 + 60_000 });
  r4.timing.connect = 8_765;
  fs.writeFileSync(path.join(d3, 'result.json'), JSON.stringify(r4));
  const d4 = makeRun(path.join(tmp, 'joined2'), '20261022-091000-joined'), r5 = JSON.parse(fs.readFileSync(path.join(d4, 'result.json'), 'utf8'));
  r5.results.splice(1, 0, { ok: true, line: 4, verb: 'until', raw: 'until joined 300000', trail: `srv-spawned world[${EMAIL}]` });
  fs.writeFileSync(path.join(d4, 'result.json'), JSON.stringify(r5));
  const r6 = await lab(['checks', '--seal', path.join(tmp, 'joined')], PUB), r7 = await lab(['checks', '--seal', path.join(tmp, 'joined2')], PUB);
  const s3 = fs.readFileSync(path.join(d3, 'summary.json'), 'utf8'), c3 = JSON.parse(s3), s4 = fs.readFileSync(path.join(d4, 'summary.json'), 'utf8'), c4 = JSON.parse(s4);
  ok(r6.status === 0 && r7.status === 0 && c3.join_trail === jt && c3.join_connect_seconds === 8.8 && c3.join_seconds === 12.3 && !('join_trail' in c4) && !('join_connect_seconds' in c4) && ![SCREEN, EMAIL].some((x) => s3.includes(x) || s4.includes(x)),
    'summary.json: a join\'s trail and the seconds to the server\'s Player connected (a trail with another word: dropped)', `${s3}\n${s4}`);
  const got2 = [], srv3 = http.createServer((q, s) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => { if (q.method === 'POST' && q.url.endsWith('/check-runs')) got2.push(JSON.parse(b)); s.writeHead(201, { 'content-type': 'application/json' }); s.end('{}'); }); });
  await new Promise((res) => srv3.listen(0, '127.0.0.1', res));
  const ck2 = await lab(['checks', path.join(tmp, 'joined')], { ...API, GITHUB_API_URL: `http://127.0.0.1:${srv3.address().port}`, APP_REPO_VISIBILITY: 'public' });
  srv3.close();
  const sum2 = got2[0]?.output?.summary ?? '';
  ok(ck2.status === 0 && sum2.includes('| 参加 | 12.3 秒 |') && sum2.includes('| 参加: サーバーの Player connected | 8.8 秒 |') && sum2.includes(`| 参加の道筋 | \`${jt}\` |`), 'the check shows them', sum2.slice(0, 1500));
}
// ---- 7. the LAN way's join step (scenario.mjs joinLan): when PLAY showed, when the LAN world was listed on it, when A went
// on it — seconds, numbers only — and, gone in, its screens: where a slow join spent its time, nothing of the screen ----
{
  const F = await import(new URL('../app/lib/failcodes.mjs', import.meta.url).href);
  ok(JSON.stringify(F.lanSeconds({ play: 21_340, listed: 312_400, pressed: 318_250 }, 1000)) === '{"play":21.3,"listed":312.4,"pressed":318.3}'
    && JSON.stringify(F.lanSeconds({ play: '5', listed: -1, pressed: 2e9, at: 7, [EMAIL]: 1 }, 1000)) === 'null' && F.lanSeconds([1, 2]) === null && F.lanSeconds(SCREEN) === null
    && JSON.stringify(F.lanSeconds({ listed: 4.25, note: SCREEN })) === '{"listed":4.3}', 'a join\'s three moments: numbers in range, those keys only', JSON.stringify(F.lanSeconds({ play: 21_340, listed: 312_400, pressed: 318_250 }, 1000)));
  const lt = 'title-blind[mojang] wait play-empty*14[worlds+realms+servers] relist title-blind play-lan[worlds+lan+world] play-lan-focus[worlds+lan]';
  ok(F.cleanTrail(lt) === lt, 'the join step\'s states and words are the lab\'s own', lt);
  // gone in: its seconds and screens (the first join that went in); the run's other fields as before
  const d5 = makeRun(path.join(tmp, 'lanjoin'), '20261023-030000-lanjoin'), r8 = JSON.parse(fs.readFileSync(path.join(d5, 'result.json'), 'utf8'));
  r8.results.splice(0, 1, { ok: true, line: 3, verb: 'join', raw: 'join', note: `LAN のワールド（${SCREEN}）`, trail: lt, lan: { play: 21_340, listed: 312_400, pressed: 318_250, who: EMAIL } },
    { ok: true, line: 4, verb: 'until', raw: 'until joined 900000', trail: 'play-lan srv-connected srv-spawned world', connectedAt: 1000 + 322_000 });
  r8.timing = { join: 334_100, connect: 321_900, lan: { play: 21_340, listed: 312_400, pressed: 318_250 } };
  fs.writeFileSync(path.join(d5, 'result.json'), JSON.stringify(r8));
  // a join that never went in (the LAN world never listed): its seconds still say how far it got; its trail is a failed
  // step's (failed_trails), not this; a record of other words and values: dropped
  const d6 = makeRun(path.join(tmp, 'lanjoin2'), '20261023-031000-lanjoin'), r9 = JSON.parse(fs.readFileSync(path.join(d6, 'result.json'), 'utf8'));
  r9.results.splice(0, 1, { ok: false, line: 3, verb: 'join', raw: 'join', note: `PLAY の LAN のワールドへ進めませんでした（LAN のワールドが出ない（PLAY を開き直した: 3 回）: 端末の中継（UDP 7551）と BDS の LAN の公開を確かめる）（画面の文字: ${SCREEN}）`,
    trail: 'title-blind play-empty*40[worlds] relist play-empty*30[worlds]', lan: { play: 19_000, listed: `${EMAIL}`, pressed: -5 } });
  fs.writeFileSync(path.join(d6, 'result.json'), JSON.stringify(r9));
  const r10 = await lab(['checks', '--seal', path.join(tmp, 'lanjoin')], PUB), r11 = await lab(['checks', '--seal', path.join(tmp, 'lanjoin2')], PUB);
  const s5 = fs.readFileSync(path.join(d5, 'summary.json'), 'utf8'), c5 = JSON.parse(s5), s6 = fs.readFileSync(path.join(d6, 'summary.json'), 'utf8'), c6 = JSON.parse(s6);
  ok(r10.status === 0 && r11.status === 0 && JSON.stringify(c5.join_lan_seconds) === '{"play":21.3,"listed":312.4,"pressed":318.3}' && c5.join_lan_trail === lt && c5.join_connect_seconds === 321.9 && c5.join_seconds === 334.1
    && JSON.stringify(c6.join_lan_seconds) === '{"play":19}' && !('join_lan_trail' in c6) && c6.failed_trails?.['3'] === 'title-blind play-empty*40[worlds] relist play-empty*30[worlds]' && JSON.stringify(c6.failed_codes.slice(0, 1)) === '["join-lan-missing 3"]'
    && ![SCREEN, EMAIL, 'who'].some((x) => s5.includes(x) || s6.includes(x)), 'summary.json: the join step\'s seconds (gone in or not) and, gone in, its trail — nothing else', `${s5}\n${s6}`);
  const got3 = [], srv4 = http.createServer((q, s) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => { if (q.method === 'POST' && q.url.endsWith('/check-runs')) got3.push(JSON.parse(b)); s.writeHead(201, { 'content-type': 'application/json' }); s.end('{}'); }); });
  await new Promise((res) => srv4.listen(0, '127.0.0.1', res));
  const ck3 = await lab(['checks', path.join(tmp, 'lanjoin')], { ...API, GITHUB_API_URL: `http://127.0.0.1:${srv4.address().port}`, APP_REPO_VISIBILITY: 'public' });
  const ck4 = await lab(['checks', path.join(tmp, 'lanjoin2')], { ...API, GITHUB_API_URL: `http://127.0.0.1:${srv4.address().port}`, APP_REPO_VISIBILITY: 'public' });
  srv4.close();
  const sum3 = got3[0]?.output?.summary ?? '', sum4 = got3[1]?.output?.summary ?? '';
  ok(ck3.status === 0 && ck4.status === 0 && sum3.includes('| 参加の手順（PLAY・LAN のワールドが出た・押した） | 21.3 / 312.4 / 318.3 秒 |') && sum3.includes(`| 参加の手順の道筋 | \`${lt}\` |`)
    && sum4.includes('| 参加の手順（PLAY・LAN のワールドが出た・押した） | 19 / — / — 秒 |') && !sum4.includes('参加の手順の道筋') && ![SCREEN, EMAIL].some((x) => sum3.includes(x) || sum4.includes(x)),
    'the check shows them', `${sum3.slice(0, 1200)}\n${sum4.slice(0, 1200)}`);
}
// ---- 7b. a batch (several addons in one run, app ci --batch): every LAN join's seconds and moments, each addon's server
//      started again (its plain name and seconds), when each measured shot was taken — numbers only, in the summary and the check ----
{
  const d7 = makeRun(path.join(tmp, 'batch'), '20261023-140628-geoui_osu_pixel'), r12 = JSON.parse(fs.readFileSync(path.join(d7, 'result.json'), 'utf8'));
  r12.results = [{ ok: true, line: 9, verb: 'join', raw: 'join', ms: 102_480, note: SCREEN, trail: 'title-a play-lan', lan: { play: 45_400, listed: 45_400, pressed: 77_500, who: EMAIL } },
    { ok: true, line: 80, verb: 'join', raw: 'join', ms: 64_210, note: SCREEN, lan: { play: 12_100, listed: 20_000, pressed: 31_960 } }, { ok: false, line: 82, raw: STEP, note: SCREEN }];
  r12.batch = [{ addon: 'geoui_osu_pixel', up_ms: 0 }, { addon: 'geoui_osu_skin', up_ms: 14_260, why: SCREEN }, { addon: EMAIL, up_ms: -3 }];
  r12.measures = [{ line: 37, section: 'tour', kind: 'diff', shot: 'tour-01-circles', at: 141.26, ok: true, values: { width: 1560, height: 720, share: 0.4, parts: 3 } }, { line: 38, kind: 'diff', shot: 'tour-02-slider', at: SCREEN, ok: true, values: { share: 0.5 } }];
  fs.writeFileSync(path.join(d7, 'result.json'), JSON.stringify(r12));
  const r13 = await lab(['checks', '--seal', path.join(tmp, 'batch')], PUB), s7 = fs.readFileSync(path.join(d7, 'summary.json'), 'utf8'), c7 = JSON.parse(s7);
  ok(r13.status === 0 && JSON.stringify(c7.joins) === '[{"line":9,"ok":true,"seconds":102.5,"play":45.4,"listed":45.4,"pressed":77.5},{"line":80,"ok":true,"seconds":64.2,"play":12.1,"listed":20,"pressed":32}]'
    && JSON.stringify(c7.batch) === '[{"addon":"geoui_osu_pixel","up_seconds":0},{"addon":"geoui_osu_skin","up_seconds":14.3},{"addon":null,"up_seconds":null}]'
    && c7.measures[0].at === 141.3 && !('at' in c7.measures[1]) && ![SCREEN, EMAIL, 'who', 'why'].some((x) => s7.includes(x)),
  'summary.json of a batch: each join\'s seconds and moments, each server started again (a plain name or none), when each shot was taken — nothing else', s7);
  const got4 = [], srv5 = http.createServer((q, s) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => { if (q.method === 'POST' && q.url.endsWith('/check-runs')) got4.push(JSON.parse(b)); s.writeHead(201, { 'content-type': 'application/json' }); s.end('{}'); }); });
  await new Promise((res) => srv5.listen(0, '127.0.0.1', res));
  const ck5 = await lab(['checks', path.join(tmp, 'batch')], { ...API, GITHUB_API_URL: `http://127.0.0.1:${srv5.address().port}`, APP_REPO_VISIBILITY: 'public' });
  srv5.close();
  const sum5 = got4[0]?.output?.summary ?? '';
  ok(ck5.status === 0 && sum5.includes('| 参加 1（9 行目） | 入った・102.5 秒（PLAY・出た・押した 45.4 / 45.4 / 77.5 秒） |') && sum5.includes('| 参加 2（80 行目） | 入った・64.2 秒（PLAY・出た・押した 12.1 / 20 / 32 秒） |')
    && sum5.includes('| BDS を起動し直す: geoui_osu_skin | 14.3 秒 |') && /^- 測った値 tour-01-circles（diff、37 行目）: 違い 40\.000%.*・141\.3 秒に撮った$/m.test(sum5) && ![SCREEN, EMAIL].some((x) => sum5.includes(x)),
  'the check shows each join, each server started again and when each shot was taken', sum5.slice(0, 1600));
}
// ---- 8. whether the steps could read the screen (OCR): a join pressed blind is told apart — a boolean, its own code ----
{
  const F = await import(new URL('../app/lib/failcodes.mjs', import.meta.url).href);
  const blind = `300000 ミリ秒待ちました: サーバーに接続が来ていません: OCR（tesseract）が使えず、LAN のワールドを画面を見ずに押しました（ゲームパッド A・DOWN・A）。tesseract を入れてください（道筋: ）`;
  ok(F.stepCode(blind) === 'joined-no-ocr' && F.stepCode('300000 ミリ秒待ちました: サーバーに接続が来ていません（参加の画面・サインイン・版の違い？ 画面を見てください）') === 'joined-no-connection', 'a join pressed blind: its own code, the other no-connection as before');
  // (each run in a folder of its own: `checks` takes the newest run of the folder it is given)
  const runs = [['20261023-040000-noocr', false], ['20261023-041000-ocr', true], ['20261023-042000-ocrword', 'yes']].map(([name, v]) => {
    const top = path.join(tmp, 'ocr', name), d = makeRun(top, name), r = JSON.parse(fs.readFileSync(path.join(d, 'result.json'), 'utf8'));
    r.ocr = v; if (v === false) r.results[1].note = blind;
    fs.writeFileSync(path.join(d, 'result.json'), JSON.stringify(r)); return { top, d };
  });
  const sealed = [];
  for (const x of runs) sealed.push((await lab(['checks', '--seal', x.top], PUB)).status);
  const cs = runs.map((x) => JSON.parse(fs.readFileSync(path.join(x.d, 'summary.json'), 'utf8')));
  ok(sealed.every((s) => s === 0) && cs[0].ocr === false && cs[0].failed_codes[0] === 'joined-no-ocr' && cs[1].ocr === true && !('ocr' in cs[2]), 'summary.json: ocr only as true or false', JSON.stringify(cs));
  const got4 = [], srv5 = http.createServer((q, s) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => { if (q.method === 'POST' && q.url.endsWith('/check-runs')) got4.push(JSON.parse(b)); s.writeHead(201, { 'content-type': 'application/json' }); s.end('{}'); }); });
  await new Promise((res) => srv5.listen(0, '127.0.0.1', res));
  for (const x of runs.slice(0, 2)) await lab(['checks', x.top], { ...API, GITHUB_API_URL: `http://127.0.0.1:${srv5.address().port}`, APP_REPO_VISIBILITY: 'public' });
  srv5.close();
  const sum5 = got4[0]?.output?.summary ?? '', sum6 = got4[1]?.output?.summary ?? '';
  ok(sum5.includes('| OCR | 使えなかった（画面の文字を読めず、LAN の参加は見ずに押した） |') && /joined-no-ocr/.test(sum5) && !sum6.includes('| OCR |'), 'the check says a run without OCR', `${sum5.slice(0, 900)}\n${sum6.slice(0, 600)}`);
}

// ---- 9. what a run publishes (public/: lib/audiorec.mjs publish → lib/publicout.mjs): sound files and their index in the clear,
// anything else there sealed with the run, a file with a secret in it sealed too, the index rebuilt from its own fields ----
{
  const OGG = Buffer.concat([Buffer.from('OggS'), crypto.randomBytes(4000)]), TOKEN = 'ya29.fake-google-token-0123456789';
  const top = path.join(tmp, 'pub-out'), rec = path.join(top, 'public', 'spectral', 'rec');
  w(path.join(top, 'report.md'), `# app: PASS — spectral\n${SCREEN}\n`);
  w(path.join(rec, 't_rock_big.opus'), OGG);
  w(path.join(rec, 'leak.opus'), Buffer.concat([Buffer.from('OggS'), Buffer.from(TOKEN), crypto.randomBytes(100)]));
  w(path.join(rec, 'fake.opus'), Buffer.from(`${EMAIL} not a sound`));
  w(path.join(rec, 'notes.txt'), `${SCREEN} ${EMAIL}\n`);
  w(path.join(rec, 'index.json'), JSON.stringify({ format: 'bds-lab-recordings/1', addon: 'spectral', note: EMAIL, recordings: [
    { name: 't_rock_big', file: 't_rock_big.opus', kbps: 160, kb: 4, seconds: 24.5, sha256: 'a'.repeat(64), measured: { song_rock_big: { visqol: 2.7652, why: SCREEN, onset_recall: 0.77 } }, extra: EMAIL },
    { name: 'leak', file: 'leak.opus', kb: 1, measured: {} }, { name: `x ${EMAIL}`, file: 'x.opus' }] }));
  const r9 = await lab(['checks', '--seal', top], { ...PUB, GOOGLE_AAS_TOKEN: TOKEN });
  const left = tree(top).map((l) => l.split(' ')[0]);
  ok(r9.status === 0 && JSON.stringify(left) === JSON.stringify(['public/spectral/rec/index.json', 'public/spectral/rec/t_rock_big.opus', 'results.sealed', 'summary.json']), 'public/: the sound file and its index stay in the clear, the rest of the run is sealed', `${r9.text}\n${left.join('\n')}`);
  ok(fs.readFileSync(path.join(rec, 't_rock_big.opus')).equals(OGG), 'the sound file: the same bytes');
  const idx = fs.readFileSync(path.join(rec, 'index.json'), 'utf8'), ix = JSON.parse(idx);
  ok(JSON.stringify(ix.recordings) === JSON.stringify([{ name: 't_rock_big', file: 't_rock_big.opus', kbps: 160, kb: 4, seconds: 24.5, sha256: 'a'.repeat(64), measured: { song_rock_big: { visqol: 2.7652, onset_recall: 0.77 } } }]) && ![EMAIL, SCREEN, TOKEN].some((x) => idx.includes(x)),
    'the index: its own fields only (a word, the e-mail, a recording whose file did not stay: gone)', idx);
  const sum9 = JSON.parse(fs.readFileSync(path.join(top, 'summary.json'), 'utf8'));
  ok(JSON.stringify(sum9.public) === JSON.stringify([{ file: 'spectral/rec/index.json', kb: 0 }, { file: 'spectral/rec/t_rock_big.opus', kb: 4 }]) && /公開できないファイル 3 個は封じる方へ/.test(r9.text), 'summary.json names what is public; the three that could not be are said', `${JSON.stringify(sum9.public)}\n${r9.text}`);
  const back9 = path.join(tmp, 'pub-open'); fs.cpSync(top, back9, { recursive: true });
  const r9b = await lab(['checks', '--open', back9], { APP_CACHE_KEY: KEY, GITHUB_ACTIONS: undefined });
  ok(r9b.status === 0 && fs.readFileSync(path.join(back9, 'public-sealed', 'spectral', 'rec', 'leak.opus')).includes(Buffer.from(TOKEN)) && fs.existsSync(path.join(back9, 'public-sealed', 'spectral', 'rec', 'notes.txt')) && fs.existsSync(path.join(back9, 'report.md')),
    'what could not be public was sealed with the run, not lost (opened with the key: public-sealed/)', r9b.text);
  // a public/ beside run folders (not in one): checked the same, what may not be public left out
  const top2 = path.join(tmp, 'pub-top'); makeRun(top2, '20261031-170000-spectral');
  w(path.join(top2, 'public', 'spectral', 'rec', 'a.opus'), OGG); w(path.join(top2, 'public', 'spectral', 'rec', 'b.txt'), `${EMAIL}\n`);
  const r10 = await lab(['checks', '--seal', top2], PUB), left2 = tree(top2).map((l) => l.split(' ')[0]);
  ok(r10.status === 0 && JSON.stringify(left2) === JSON.stringify(['20261031-170000-spectral/results.sealed', '20261031-170000-spectral/summary.json', 'public/spectral/rec/a.opus']) && /出しません/.test(r10.text), 'a public/ beside the run folders: never taken for a run, its text left out', `${r10.text}\n${left2.join('\n')}`);
  // private: nothing changes (public/ too)
  const top3 = path.join(tmp, 'pub-priv'); w(path.join(top3, 'report.md'), 'x\n'); w(path.join(top3, 'public', 'spectral', 'rec', 'n.txt'), 'x\n');
  const r11 = await lab(['checks', '--seal', top3], { APP_REPO_VISIBILITY: 'private', APP_CACHE_KEY: KEY });
  ok(r11.status === 0 && fs.existsSync(path.join(top3, 'public', 'spectral', 'rec', 'n.txt')) && fs.existsSync(path.join(top3, 'report.md')), 'private: as before', r11.text);
}

// ---- 10. one recording, many songs (audio mark → audio stop: lib/audiorec.mjs cut): three tones with silence between, the
// capture begun 700 ms after the recorder, the marks just before each tone — each part has its own tone and none of the others;
// and the scenario takes `audio mark` / `audio analyze-all` (and refuses them wrong) ----
{
  const AR = await import(path.join(TOP, 'app', 'lib', 'audiorec.mjs')), S = await import(path.join(TOP, 'app', 'lib', 'scenario.mjs'));
  const rate = 48000, sec = (x) => Math.round(x * rate), tones = [[1.0, 3.0, 440], [5.0, 7.5, 880], [9.0, 11.0, 1760]], total = 12.0;
  const data = Buffer.alloc(sec(total) * 4);
  for (const [a, b, f] of tones) for (let i = sec(a); i < sec(b); i++) { const v = Math.round(12000 * Math.sin((2 * Math.PI * f * i) / rate)); data.writeInt16LE(v, i * 4); data.writeInt16LE(v, i * 4 + 2); }
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(2, 2); fmt.writeUInt32LE(rate, 4); fmt.writeUInt32LE(rate * 4, 8); fmt.writeUInt16LE(4, 12); fmt.writeUInt16LE(16, 14);
  const dir = path.join(tmp, 'cut'); fs.mkdirSync(dir, { recursive: true });
  const big = path.join(dir, 'batch.wav'); AR.writeWav(big, { fmt }, data);
  const lag = 700, marks = tones.map(([a], i) => ({ name: `s${i}`, at: Math.round(a * 1000) - 200 + lag }));
  const c = AR.cut({ file: big, marks, wallMs: total * 1000 + lag, dir });
  const hz = (file) => {   // (the tone a part holds: zero crossings of the left channel over its sounding samples)
    const w2 = AR.readWav(file), n = w2.data.length / 4; let cross = 0, loud = 0, prev = 0;
    for (let i = 0; i < n; i++) { const v = w2.data.readInt16LE(i * 4); if (Math.abs(v) > 100) loud++; if ((prev < 0 && v >= 0) || (prev >= 0 && v < 0)) cross++; prev = v; }
    return { hz: loud ? Math.round((cross / 2) / (loud / rate)) : 0, loud: +(loud / rate).toFixed(2) };
  };
  const got = c.list.map((x) => ({ ...x, ...hz(path.join(dir, `${x.name}.wav`)) }));
  ok(c.lagMs === lag && got.length === 3 && got.every((g, i) => Math.abs(g.hz - tones[i][2]) <= tones[i][2] * 0.02 && Math.abs(g.loud - (tones[i][1] - tones[i][0])) < 0.02),
    'a recording cut at its marks: each part its own song whole, nothing of the next (the capture\'s lag from the wall time)', JSON.stringify({ lag: c.lagMs, got }));
  const p = S.parseScenario('audio start batch\naudio mark d_rock_big\naudio stop\naudio analyze-all d_rock_big=song:rock_big t_rock_big=song:rock_big\naudio mark\naudio mark a b\naudio analyze-all x\naudio analyze-all a=b;c');
  ok(p.steps.length === 4 && p.errors.length === 4 && p.errors.every((e) => /書き方: audio (mark|analyze-all)/.test(e)), 'the scenario: audio mark <name>, audio analyze-all <name>=<what> …; wrong ones refused', JSON.stringify(p.errors));
}

console.log(fails ? `✘ ${fails} failed` : '✔ all passed');
process.exit(fails ? 1 : 0);
