#!/usr/bin/env node
// app/lib/feed.mjs, no network: a run's pictures and videos to the person's Discord — where they go (their bot's DM, else a
// Discord webhook), what a message holds (multipart: payload_json and the files), a rate limit waited out, large pictures
// halved, a message's limits, sections batched as they end (a failure at once), the end with the last screen and the videos
// (one that does not fit and cannot be made smaller said), LAB_NOTIFY_MEDIA (live / end / off), a Discord that fails never the
// run's failure; runScenario telling each section as it ends; `node lab.mjs notify --file`. node tests/feed-offline.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(TOP, p)).href);
const F = await imp('app/lib/feed.mjs'), S = await imp('app/lib/scenario.mjs'), X = await imp('common/extra.mjs');
let n = 0, fails = 0;
const ok = (c, m, d = '') => { n++; if (!c) fails++; console.log(`${c ? '✔' : '✘'} ${m}${c || !d ? '' : `\n  ${d}`}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-'));
const HOOK = 'https://discord.com/api/webhooks/123456789012345678/abcDEF_-ghi';

// a picture of w x h: each pixel its own noise (does not compress), or one colour
const noisePng = (w, h) => { const d = crypto.randomBytes(w * h * 4); for (let i = 3; i < d.length; i += 4) d[i] = 255; return X.pngEncode({ w, h, data: d }); };
const plainPng = (w, h, rgb) => { const d = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) d.set([...rgb, 255], i * 4); return X.pngEncode({ w, h, data: d }); };
const file = (name, data) => { const f = path.join(tmp, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };

// ---- where, and when ----
ok(F.mediaPolicy({}) === 'live' && F.mediaPolicy({ LAB_NOTIFY_MEDIA: 'auto' }) === 'live' && F.mediaPolicy({ LAB_NOTIFY_MEDIA: 'end' }) === 'end' && F.mediaPolicy({ LAB_NOTIFY_MEDIA: 'OFF' }) === 'off' && F.mediaPolicy({ LAB_NOTIFY_MEDIA: '0' }) === 'off',
  'LAB_NOTIFY_MEDIA: live by default (auto), end, off');
const bot = F.destination({ DISCORD_BOT_TOKEN: 't', DISCORD_USER_ID: '123456789012345678', LAB_NOTIFY_WEBHOOK: HOOK }), hook = F.destination({ LAB_NOTIFY_WEBHOOK: HOOK });
ok(bot.kind === 'bot' && hook.kind === 'webhook' && hook.url === HOOK && F.destination({ LAB_NOTIFY_WEBHOOK: 'https://hooks.slack.com/services/x' }) === null && F.destination({ LAB_NOTIFY_WEBHOOK: 'https://ntfy.sh/x' }) === null
  && F.destination({}) === null && F.destination({ DISCORD_BOT_TOKEN: 't', DISCORD_USER_ID: 'me', LAB_NOTIFY_WEBHOOK: HOOK }).kind === 'webhook',
  'where: the person\'s bot\'s DM first, else a Discord webhook; Slack, ntfy and nothing take no files (null); a bot without a user id falls to the webhook');
ok(F.createFeed({ env: {} }).on === false && F.createFeed({ env: { LAB_NOTIFY_WEBHOOK: HOOK, LAB_NOTIFY_MEDIA: 'off' } }).on === false && F.createFeed({ env: { LAB_NOTIFY_WEBHOOK: HOOK } }).on === true,
  'no Discord, or off: a feed that does nothing');

// ---- the files ----
{
  const half = X.pngDecode(F.halvePng(plainPng(9, 6, [200, 100, 50])));
  ok(half.w === 4 && half.h === 3 && half.data[0] === 200 && half.data[1] === 100 && half.data[2] === 50 && half.data[3] === 255, 'halvePng: half the size (rounded down), the colours kept', JSON.stringify([half.w, half.h, [...half.data.subarray(0, 4)]]));
  const big = file('shots/01-big.png', noisePng(200, 120)), p = F.pictureOf(big, { big: 30_000 });
  ok(p.halved >= 1 && p.size <= 30_000 && X.pngDecode(p.data).w <= 100 && p.type === 'image/png' && p.name === '01-big.png', `a large picture halved until it fits (${fs.statSync(big).size} → ${p.size} bytes, ${p.halved} times)`);
  const small = F.pictureOf(file('shots/02-small.png', plainPng(40, 20, [1, 2, 3])));
  ok(small.halved === 0 && small.data.equals(fs.readFileSync(path.join(tmp, 'shots/02-small.png'))), 'a small picture goes as it is');
  const g = F.groups([...Array.from({ length: 12 }, (_, i) => ({ name: `a${i}`, size: 10 })), { name: 'huge', size: 50 }, { name: 'b', size: 30 }, { name: 'c', size: 30 }], { maxBytes: 45, maxFiles: 10 });
  ok(JSON.stringify(g.groups.map((x) => x.map((f) => f.name))) === JSON.stringify([['a0', 'a1', 'a2', 'a3'], ['a4', 'a5', 'a6', 'a7'], ['a8', 'a9', 'a10', 'a11'], ['b'], ['c']]) && g.tooBig.length === 1 && g.tooBig[0].name === 'huge',
    'groups: in order, each message within its bytes and files; a file over the limit alone said', JSON.stringify(g.groups.map((x) => x.map((f) => f.name))));
  const line = F.sectionLine({ name: 't07-b400', ok: false, ms: 64_000, shots: ['a', 'b'], fails: [{ line: 70, raw: 'measure diff t07', note: '板が見つからない' }] });
  ok(/^✘ \*\*t07-b400\*\*（1 分 4 秒・写真 2 枚）\n {2}70 行目 `measure diff t07`: 板が見つからない$/.test(line), 'a section\'s line: ✘, its name, how long, its pictures, the failed step and why', line);
}

// ---- a webhook: multipart, a rate limit waited out, the address never in an error ----
{
  const calls = [];
  let n429 = 1;
  const fetchImpl = async (url, init) => {
    const form = init.body, payload = JSON.parse(form.get('payload_json')), files = [];
    for (const [k, v] of form.entries()) if (k.startsWith('files[')) files.push({ k, name: v.name, size: v.size, type: v.type });
    calls.push({ url, payload, files });
    if (n429-- > 0) return new Response(JSON.stringify({ retry_after: 0.01 }), { status: 429 });
    return new Response('{}', { status: 200 });
  };
  const waits = [], post = F.webhookPoster({ url: HOOK, fetchImpl, sleep: async (ms) => { waits.push(ms); } });
  await post({ content: 'hello', files: [{ name: 'a.png', data: Buffer.from('png'), type: 'image/png' }, { name: 'v.mp4', data: Buffer.from('mp4') }] });
  const c = calls.at(-1);
  ok(calls.length === 2 && waits.length === 1 && c.url === `${HOOK}?wait=true` && c.payload.content === 'hello' && c.payload.username === 'bds-lab' && JSON.stringify(c.payload.allowed_mentions) === '{"parse":[]}'
    && JSON.stringify(c.payload.attachments) === '[{"id":0,"filename":"a.png"},{"id":1,"filename":"v.mp4"}]' && c.files.map((f) => `${f.k}:${f.name}:${f.type}`).join(' ') === 'files[0]:a.png:image/png files[1]:v.mp4:video/mp4',
  'a webhook: payload_json with the text and each attachment, the files as files[i] (their types), ?wait=true; a 429 waited out (retry_after) and sent again', JSON.stringify(c));
  const bad = F.webhookPoster({ url: HOOK, fetchImpl: async () => new Response('{"message":"Request entity too large"}', { status: 413 }) });
  let msg = ''; try { await bad({ content: 'x' }); } catch (e) { msg = e.message; }
  ok(/Webhook 413（大きすぎる）/.test(msg) && !msg.includes('abcDEF'), 'a refusal said (413: too large) without the webhook\'s address (its token)', msg);
}

// ---- the feed: as the run goes ----
async function feedRun(policy, { failPost = false, wait } = {}) {
  const sent = [], logs = [];
  let t = 0;
  const post = async (m) => { if (failPost) throw new Error('Discord が落ちています'); sent.push({ content: m.content, files: (m.files ?? []).map((f) => f.name) }); };
  const feed = F.createFeed({ env: {}, post, policy, title: '📱 geoui_rhythm [rhythm-3]', link: 'https://github.com/o/r/actions/runs/1', log: (s) => logs.push(s), now: () => t, quiet: 20_000, batch: 3, ffmpeg: '/nonexistent/ffmpeg', tmp, wait });
  const pic = (k) => file(`shots/${String(k).padStart(2, '0')}-p.png`, plainPng(16, 9, [k, k, k]));
  feed.start({ what: 'app.txt・40 手順' });
  t = 1000; feed.section({ name: 'title', ok: true, ms: 1000, shots: [pic(1)] });
  t = 2000; feed.section({ name: 'join', ok: true, ms: 90_000, shots: [] });
  t = 3000; feed.section({ name: 'play', ok: true, ms: 1000, shots: [pic(2), pic(3)] });           // 3 pictures waiting: sent
  t = 4000; feed.section({ name: 'seek', ok: true, ms: 1000, shots: [pic(4)] });
  t = 5000; feed.section({ name: 'pause', ok: false, ms: 1000, shots: [pic(5)], fails: [{ line: 12, raw: 'measure diff paused', note: '動いた' }] });   // a failure: at once
  t = 9000; feed.section({ name: 'log', ok: true, ms: 1000, shots: [] });
  const small = file('recordings/rec-1.mp4', Buffer.alloc(2000, 1)), big = file('recordings/rec-2.mp4', Buffer.alloc(9_100_000, 2));
  const r = await feed.end({ ok: false, ms: 125_000, shots: 6, notes: ['何かの注意'], recordings: [small, big], final: pic(99) });
  return { sent, logs, r };
}
{
  const { sent, r } = await feedRun('live');
  const texts = sent.map((m) => m.content);
  ok(/^▶️ \*\*📱 geoui_rhythm \[rhythm-3\]\*\* を始めました（app\.txt・40 手順）\n<https:\/\/github\.com\/o\/r\/actions\/runs\/1>$/.test(texts[0]), 'the start: the run, what it runs, its page', texts[0]);
  ok(sent[1].files.join() === '01-p.png,02-p.png,03-p.png' && /✔ \*\*title\*\*/.test(texts[1]) && /✔ \*\*join\*\*（1 分 30 秒）/.test(texts[1]) && /✔ \*\*play\*\*/.test(texts[1]),
    'sections as they end: pictures held until 3 (batch) — title, join (no pictures: its line only) and play in one message', JSON.stringify(sent[1]));
  ok(sent[2].files.join() === '04-p.png,05-p.png' && /✔ \*\*seek\*\*/.test(texts[2]) && /✘ \*\*pause\*\*.*\n {2}12 行目 `measure diff paused`: 動いた/.test(texts[2]), 'a failed section at once, with the one before it and its screen', JSON.stringify(sent[2]));
  ok(/✔ \*\*log\*\*/.test(texts[3]) && /❌ \*\*📱 geoui_rhythm \[rhythm-3\]\*\* 落ちました（2 分 5 秒・写真 6 枚・動画 2 本）/.test(texts[4]) && /・何かの注意/.test(texts[4]) && sent[4].files.join() === '99-p.png',
    'the end: the last sections, then the verdict with its notes and the last screen', JSON.stringify(sent.slice(3, 5)));
  ok(sent[5].files.join() === 'rec-1.mp4' && /^🎬 .*rec-1\.mp4$/.test(texts[5]) && /^⚠️ 動画: rec-2\.mp4（9\.1 MB）は Discord の上限（9\.0 MB）より大きく、ffmpeg が無いので縮められません$/.test(texts[6]) && sent.length === 7 && r.sent === 7 && r.failed === 0,
    'the videos last: one that fits as it is; one too large with no ffmpeg said, not sent', JSON.stringify(sent.slice(5)) + JSON.stringify(r));
}
{
  const { sent } = await feedRun('end');
  ok(sent.length === 3 && /❌/.test(sent[0].content) && /✘ \*\*pause\*\*/.test(sent[0].content) && !/✔ \*\*title\*\*/.test(sent[0].content) && sent[0].files.join() === '05-p.png,99-p.png' && /rec-1/.test(sent[1].content),
    'LAB_NOTIFY_MEDIA=end: one message at the end — the verdict, the failed sections and their screens, the last picture — then the videos', JSON.stringify(sent));
}
{
  const { sent, logs, r } = await feedRun('live', { failPost: true });
  ok(sent.length === 0 && r.failed >= 5 && logs.length >= 1 && logs.length <= 4 && /^W Discord（写真・動画）: Discord が落ちています/.test(logs[0]), 'a Discord that fails: W lines in the run\'s log (a few, not one a post), the end still comes', JSON.stringify({ logs, r }));
}
{
  // (a post that never answers: the end gives up after its wait, said)
  const logs = [], feed = F.createFeed({ env: {}, post: () => new Promise(() => {}), policy: 'live', log: (s) => logs.push(s), wait: 50 });
  feed.section({ name: 'a', ok: false, ms: 1, shots: [], fails: [] });
  const r = await feed.end({ ok: true, ms: 1 });
  ok(r.late === true && logs.some((l) => /送りきれませんでした/.test(l)), 'a Discord that never answers: the end waits its time and goes on', JSON.stringify({ r, logs }));
}

// ---- a video made to fit (with ffmpeg, when this machine has it) ----
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) {
  const src = path.join(tmp, 'long.mp4');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '8', '-c:v', 'libx264', '-b:v', '6000k', '-pix_fmt', 'yuv420p', src], { stdio: 'ignore', timeout: 120_000 });
  const v = F.fitVideo(src, { maxBytes: 1_000_000, tmp });
  ok(!v.skip && v.size <= 1_000_000 && v.type === 'video/mp4' && / → /.test(v.note), `fitVideo: a video over the limit made smaller with ffmpeg (${v.note ?? v.skip})`);
} else console.log('- (ffmpeg is not on this machine: fitVideo\'s making smaller not tried here)');

// ---- runScenario: each section told as it ends (its pictures, its failures) ----
{
  const dir = path.join(tmp, 'sec'); fs.mkdirSync(dir, { recursive: true });
  const srv = path.join(dir, 'server.log'); fs.writeFileSync(srv, ''); fs.writeFileSync(path.join(dir, 'logcat.txt'), '');
  const shot = X.pngEncode({ w: 8, h: 8, data: Buffer.alloc(8 * 8 * 4, 120) });
  const adb = { screencap: () => shot, shell: () => ({ status: 0, stdout: '', stderr: '' }), run: () => ({ status: 0, stdout: '', stderr: '' }) };
  const told = [];
  const { steps } = S.parseScenario('shot first\nsection one\nwait 1\nshot a\nshot b\nsection broken\nexpect server never-there\nshot never\nsection two\nshot c\n');
  const r = await S.runScenario(steps, { adb, runDir: dir, decode: X.pngDecode, pkg: 'x', logcatFile: path.join(dir, 'logcat.txt'), server: { logFile: srv, joinUri: 'u', do: async () => ({ ok: true, lines: [] }) }, recover: async () => {}, sectionDone: (s) => { told.push(s); if (s.name === 'one') throw new Error('the feed broke'); } });
  const names = (s) => s.shots.map((f) => path.basename(f).replace(/^\d+-/, '')).join(',');
  ok(told.map((s) => `${s.name}:${s.ok}:${names(s)}`).join(' | ') === '(はじめ):true:first.png | one:true:a.png,b.png | broken:false:fail-line7.png | two:true:c.png' && told[2].fails.length === 1 && told[2].fails[0].line === 7 && /never-there/.test(told[2].fails[0].raw) && told.every((s) => s.ms >= 0)
    && r.sections.every((s) => !('s0' in s) && !('r0' in s)) && r.results.filter((x) => x.verb === 'shot').length === 4,
  'runScenario: each section told as it ends — its own pictures (the failure\'s screen too), its failed step; a feed that throws changes nothing of the run', told.map((s) => `${s.name}:${s.ok}:${names(s)}`).join(' | '));
}

// ---- node lab.mjs notify --file: any command's pictures and videos ----
{
  const N = await imp('common/notify.mjs'), seen = [], keep = { fetch: globalThis.fetch, env: { ...process.env } };
  globalThis.fetch = async (url, init) => { const f = init.body; seen.push({ url: String(url).replace(/\/[\w-]+\?/, '/…?'), text: JSON.parse(f.get('payload_json')).content, files: [...f.entries()].filter(([k]) => k.startsWith('files[')).map(([, v]) => v.name) }); return new Response('{}', { status: 200 }); };
  delete process.env.DISCORD_BOT_TOKEN; delete process.env.DISCORD_USER_ID;
  process.env.LAB_NOTIFY_WEBHOOK = HOOK;
  const pics = [file('notify/a.png', plainPng(8, 8, [9, 9, 9])), file('notify/b.png', plainPng(8, 8, [8, 8, 8]))], lines = [];
  const done = await N.notifyCmd(['Blockbench', 'の画', '--file', pics[0], `--file=${pics[1]}`], (l) => lines.push(l));
  const missing = await N.notifyCmd(['x', '--file', path.join(tmp, 'nope.png')], (l) => lines.push(l));
  delete process.env.LAB_NOTIFY_WEBHOOK;
  const none = await N.notifyCmd(['x', '--file', pics[0]], (l) => lines.push(l));
  globalThis.fetch = keep.fetch; Object.assign(process.env, keep.env);
  ok(done && seen.length === 1 && seen[0].text === 'Blockbench の画' && seen[0].files.join() === 'a.png,b.png' && /Webhook に 2 個送りました/.test(lines[0]) && missing === false && /ファイルがありません/.test(lines[1]) && none === false && /Discord がありません/.test(lines[2]),
    'notify --file: the pictures in one message with the text (a webhook here); a file that is not there, or no Discord: said, nothing sent', JSON.stringify({ seen, lines }));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${fails ? 'FAIL' : 'PASS'} feed-offline (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
