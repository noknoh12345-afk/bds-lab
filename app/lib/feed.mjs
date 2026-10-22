// feed: a run's pictures and videos in the person's Discord while it runs (app run / app ui) — what each section showed, as
// it ends (a few quick sections' pictures together; a failure's screen at once), and the recordings at the end, made to fit
// Discord's upload limit with ffmpeg when there is one (else said). Where: the person's own bot's DM (DISCORD_BOT_TOKEN +
// DISCORD_USER_ID), else a Discord webhook (LAB_NOTIFY_WEBHOOK). When — LAB_NOTIFY_MEDIA: auto (the default: as it goes) ·
// end (one message at the end: the failed sections' screens, the last picture, the videos) · off.
// Out of the run's way: posts are queued and sent in order in the background; one that fails is a W line in the run's log,
// never a failed run; the end waits for the queue (ffmpeg included) a few minutes at most. Also `node lab.mjs notify --file`
// (common/notify.mjs): any command's pictures and videos the same way.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pngDecode, pngEncode } from '../../common/extra.mjs';
import * as Dc from './discord.mjs';

export const MAX_BYTES = 9_000_000;   // a message's files (Discord: 10 MB a message without a boost; the rest is the request's)
export const MAX_FILES = 10;          // Discord: 10 attachments a message
export const BIG_PNG = 1_500_000;     // a picture larger than this goes at half its size (a phone shows it smaller anyway)
const LIMIT = 2000;

/** LAB_NOTIFY_MEDIA → live · end · off (pure) */
export function mediaPolicy(env = process.env) {
  const v = String(env.LAB_NOTIFY_MEDIA ?? '').trim().toLowerCase();
  if (/^(off|none|no|false|0)$/.test(v)) return 'off';
  return v === 'end' ? 'end' : 'live';
}
/** where the pictures go (pure): the person's bot's DM, else a Discord webhook, else null (Slack and ntfy take no files) */
export function destination(env = process.env) {
  const dc = Dc.config(env);
  if (!dc.missing) return { kind: 'bot', token: dc.token, userId: dc.userId };
  const url = String(env.LAB_NOTIFY_WEBHOOK ?? '').trim();
  return /^https:\/\/(?:[\w-]+\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+/.test(url) ? { kind: 'webhook', url } : null;
}

// ---- the files ----
const kindOf = (name) => (/\.png$/i.test(name) ? 'image/png' : /\.(jpe?g)$/i.test(name) ? 'image/jpeg' : /\.mp4$/i.test(name) ? 'video/mp4' : /\.webm$/i.test(name) ? 'video/webm' : /\.gif$/i.test(name) ? 'image/gif' : 'application/octet-stream');
/** a PNG at half its size (each 2 x 2 pixels averaged), as a PNG (pure) */
export function halvePng(buf) {
  const img = pngDecode(buf), w = Math.max(1, img.w >> 1), h = Math.max(1, img.h >> 1), data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    const at = (dx, dy) => img.data[((Math.min(img.h - 1, y * 2 + dy)) * img.w + Math.min(img.w - 1, x * 2 + dx)) * 4 + c];
    data[(y * w + x) * 4 + c] = (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1) + 2) >> 2;
  }
  return pngEncode({ w, h, data });
}
/** a picture file → { name, data, type, size } to send: a large PNG halved (twice at most) until it is under BIG_PNG */
export function pictureOf(file, { big = BIG_PNG } = {}) {
  let data = fs.readFileSync(file), halved = 0;
  if (/\.png$/i.test(file)) while (data.length > big && halved < 2) { try { data = halvePng(data); halved++; } catch { break; } }
  return { name: path.basename(file), data, type: kindOf(file), size: data.length, halved };
}
/** files → messages' worth (pure): in order, each group at most maxFiles and maxBytes (a single file over maxBytes alone in
 *  `tooBig`) */
export function groups(files, { maxBytes = MAX_BYTES, maxFiles = MAX_FILES } = {}) {
  const out = [], tooBig = [];
  let cur = [], bytes = 0;
  for (const f of files) {
    if (f.size > maxBytes) { tooBig.push(f); continue; }
    if (cur.length >= maxFiles || bytes + f.size > maxBytes) { out.push(cur); cur = []; bytes = 0; }
    cur.push(f); bytes += f.size;
  }
  if (cur.length) out.push(cur);
  return { groups: out, tooBig };
}
const mb = (n) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
const secs = (ms) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} 秒` : `${Math.floor(ms / 60_000)} 分${Math.round((ms % 60_000) / 1000) ? ` ${Math.round((ms % 60_000) / 1000)} 秒` : ''}`);
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
/** a section's line (pure): ✔ / ✘, its name, how long, its pictures; a failure's step and why */
export function sectionLine(sec) {
  const n = (sec.shots ?? []).length, head = `${sec.ok ? '✔' : '✘'} **${clip(sec.name, 60)}**（${secs(sec.ms ?? 0)}${n ? `・写真 ${n} 枚` : ''}）`;
  const why = (sec.fails ?? []).slice(0, 2).map((f) => `  ${f.line} 行目 \`${clip(f.raw, 60)}\`: ${clip(f.note, 160)}`);
  return [head, ...why].join('\n');
}

// ---- a video within the limit ----
const has = (bin) => { try { return spawnSync(bin, ['-version'], { stdio: 'ignore', timeout: 20_000 }).status === 0; } catch { return false; } };
/** how long a video is (ffprobe; null when it cannot say) */
function duration(file, ffprobe) {
  try { const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 60_000 }); const s = Number(String(r.stdout).trim()); return r.status === 0 && s > 0 ? s : null; } catch { return null; }
}
/** a video file → { name, data, type, size, note? } within maxBytes: as it is when it fits, else made smaller with ffmpeg (480
 *  lines, the bit rate the length allows), else { skip: why } */
export function fitVideo(file, { maxBytes = MAX_BYTES, ffmpeg = process.env.APP_FFMPEG || 'ffmpeg', tmp = os.tmpdir() } = {}) {
  const size = fs.statSync(file).size, name = path.basename(file);
  if (size <= maxBytes) return { name, data: fs.readFileSync(file), type: kindOf(file), size };
  if (!has(ffmpeg)) return { skip: `${name}（${mb(size)}）は Discord の上限（${mb(maxBytes)}）より大きく、ffmpeg が無いので縮められません` };
  const sec = duration(file, ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace('ffmpeg', 'ffprobe'))) ?? 120;
  const out = path.join(tmp, `lab-feed-${process.pid}-${Date.now()}.mp4`);
  try {
    for (const share of [0.88, 0.6]) {
      const kbps = Math.max(120, Math.floor((maxBytes * 8 * share) / sec / 1000)), lines = kbps < 900 ? 480 : 720;
      const r = spawnSync(ffmpeg, ['-y', '-v', 'error', '-i', file, '-vf', `scale=-2:'min(${lines},ih)'`, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.2)}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out], { stdio: 'ignore', timeout: 15 * 60_000 });
      if (r.status !== 0 || !fs.existsSync(out)) return { skip: `${name}（${mb(size)}）を縮められませんでした（ffmpeg ${r.status ?? r.signal}）` };
      const got = fs.statSync(out).size;
      if (got <= maxBytes) return { name: name.replace(/\.\w+$/, '.mp4'), data: fs.readFileSync(out), type: 'video/mp4', size: got, note: `${mb(size)} → ${mb(got)}（${lines} 行）` };
    }
    return { skip: `${name}（${mb(size)}）は縮めても ${mb(maxBytes)} に入りません` };
  } finally { fs.rmSync(out, { force: true }); }
}

// ---- sending ----
/** a Discord webhook → post({ content, files }): multipart with payload_json; a rate limit (429) waited out and tried again */
export function webhookPoster({ url, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return async function post({ content = '', files = [] }) {
    for (let attempt = 0; ; attempt++) {
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify({ username: 'bds-lab', content: String(content).slice(0, LIMIT), allowed_mentions: { parse: [] }, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
      files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.data], { type: f.type ?? kindOf(f.name) }), f.name));
      const r = await fetchImpl(`${url}${url.includes('?') ? '&' : '?'}wait=true`, { method: 'POST', body: fd, signal: AbortSignal.timeout(180_000) });
      if (r.status === 429 && attempt < 4) { let wait = 2; try { wait = Number((await r.json()).retry_after) || 2; } catch { /* a plain 429 */ } await sleep(Math.min(wait, 60) * 1000 + 250); continue; }
      // (Discord's answer, never the address: the webhook's token is in it)
      if (!r.ok) { let t = ''; try { t = (await r.text()).slice(0, 160); } catch { /* none */ } throw new Error(`Webhook ${r.status}${r.status === 413 ? '（大きすぎる）' : ''} ${t}`.trim()); }
      return;
    }
  };
}
/** the person's bot → post({ content, files }) in its DM */
export function botPoster({ token, userId, fetchImpl, sleep }) {
  const b = Dc.bot({ token, userId, fetchImpl, sleep });
  return ({ content = '', files = [] }) => b.send({ content, files });
}
/** where → post (null: nowhere) */
export function posterFor(dest, opts = {}) {
  if (!dest) return null;
  return dest.kind === 'bot' ? botPoster({ ...dest, ...opts }) : webhookPoster({ url: dest.url, ...opts });
}

/** files (paths) with a text → the messages it takes (pictures halved when large, videos fitted), sent in order. → { sent,
 *  skipped: [why] }. For `node lab.mjs notify --file` */
export async function sendFiles(post, text, filesIn, { maxBytes = MAX_BYTES, ffmpeg, tmp } = {}) {
  const files = [], skipped = [];
  for (const f of filesIn) {
    try {
      if (/\.(mp4|webm|mov|mkv)$/i.test(f)) { const v = fitVideo(f, { maxBytes, ffmpeg, tmp }); if (v.skip) skipped.push(v.skip); else files.push(v); }
      else files.push(/\.png$/i.test(f) ? pictureOf(f) : { name: path.basename(f), data: fs.readFileSync(f), type: kindOf(f), size: fs.statSync(f).size });
    } catch (e) { skipped.push(`${path.basename(f)}: ${e.code ?? e.message}`); }
  }
  const g = groups(files, { maxBytes });
  for (const f of g.tooBig) skipped.push(`${f.name}（${mb(f.size)}）は Discord の上限より大きい`);
  const tail = skipped.length ? `\n${skipped.map((s) => `⚠️ ${s}`).join('\n')}` : '';
  if (!g.groups.length) { await post({ content: `${text}${tail}`.slice(0, LIMIT) }); return { sent: 0, skipped }; }
  let sent = 0;
  for (const [i, fs2] of g.groups.entries()) { await post({ content: i ? '' : `${text}${tail}`.slice(0, LIMIT), files: fs2 }); sent += fs2.length; }
  return { sent, skipped };
}

/** the run's feed. opts: { env, title (the run: the addon, its lane), link (the run's page), log (a line for the run's own
 *  log), post (tests: instead of the destination), policy, now, quiet (ms: sections closer together than this go as one
 *  message), batch (pictures that go at once), ffmpeg, tmp }. → { on, start(info), section(sec), end(result) } — end resolves
 *  once everything queued is sent (wait ms at most) */
export function createFeed({ env = process.env, title = 'app', link = null, log = () => {}, post = null, policy = mediaPolicy(env), now = Date.now, quiet = 20_000, batch = 6, ffmpeg, tmp, wait = 5 * 60_000 } = {}) {
  const dest = post ? { kind: 'given' } : destination(env);
  const send = post ?? posterFor(dest);
  const off = { on: false, start() {}, section() {}, async end() { return { sent: 0, failed: 0 }; } };
  if (!send || policy === 'off') return off;
  let chain = Promise.resolve(), pending = [], last = now(), sentN = 0, failed = 0, warned = false;
  const queue = (job) => {
    chain = chain.then(job).then((n) => { sentN += Number(n) || 0; }, (e) => { failed++; if (!warned || failed <= 3) log(`W Discord（写真・動画）: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`); warned = true; });
    return chain;
  };
  const postFiles = async (content, files) => {
    const g = groups(files);
    const big = g.tooBig.map((f) => `⚠️ ${f.name}（${mb(f.size)}）は大きすぎて送れません`);
    const text = [content, ...big].filter(Boolean).join('\n').slice(0, LIMIT);
    if (!g.groups.length) { await send({ content: text }); return 0; }
    for (const [i, fs2] of g.groups.entries()) await send({ content: i ? '' : text, files: fs2 });
    return files.length;
  };
  const flush = () => {
    if (!pending.length) return;
    const secs2 = pending; pending = []; last = now();
    queue(async () => {
      const files = [];
      for (const s of secs2) for (const f of s.shots ?? []) { try { files.push(pictureOf(f)); } catch { /* gone */ } }
      return postFiles(secs2.map(sectionLine).join('\n'), files);
    });
  };
  const head = link ? `${title} · <${link}>` : title;
  return {
    on: true,
    start(info = {}) {
      if (policy !== 'live') return;
      queue(async () => { await send({ content: `▶️ **${clip(title, 80)}** を始めました${info.what ? `（${clip(info.what, 120)}）` : ''}${link ? `\n<${link}>` : ''}` }); return 0; });
    },
    /** a section ended: { name, ok, ms, shots: [files], fails: [{ line, raw, note }] } */
    section(sec) {
      if (!sec || (!(sec.shots ?? []).length && sec.ok)) { if (sec && policy === 'live') pending.push(sec); return; }
      pending.push(sec);
      if (policy !== 'live') return;
      const pics = pending.reduce((a, s) => a + (s.shots ?? []).length, 0);
      if (!sec.ok || pics >= batch || now() - last >= quiet) flush();
    },
    /** the run ended: { ok, ms, shots (count), fatal, notes, recordings: [files], final (a picture), sections } */
    async end(r = {}) {
      if (policy === 'live') flush();
      const summary = [`${r.ok ? '✅' : '❌'} **${clip(title, 80)}** ${r.ok ? '通りました' : '落ちました'}（${secs(r.ms ?? 0)}${r.shots !== undefined ? `・写真 ${r.shots} 枚` : ''}${(r.recordings ?? []).length ? `・動画 ${(r.recordings ?? []).length} 本` : ''}）`];
      if (r.fatal) summary.push(`途中で止まりました: ${clip(r.fatal, 300)}`);
      for (const n of (r.notes ?? []).slice(0, 3)) summary.push(`・${clip(n, 220)}`);
      if (link) summary.push(`<${link}>`);
      if (policy === 'end') {
        // (one message: the failed sections and their screens, the last picture)
        const bad = pending.filter((s) => !s.ok);
        const pics = [...bad.flatMap((s) => s.shots ?? []), ...(r.final ? [r.final] : [])].slice(-MAX_FILES);
        queue(async () => { const files = []; for (const f of pics) { try { files.push(pictureOf(f)); } catch { /* gone */ } } return postFiles([...summary, ...bad.map(sectionLine)].join('\n'), files); });
        pending = [];
      } else queue(async () => postFiles(summary.join('\n'), r.final ? [pictureOf(r.final)] : []));
      // (the videos last: each fitted to the limit, one a message)
      for (const v of r.recordings ?? []) queue(async () => { const f = fitVideo(v, { ffmpeg, tmp }); if (f.skip) { await send({ content: `⚠️ 動画: ${f.skip}` }); return 0; } await send({ content: `🎬 ${clip(title, 60)} · ${f.name}${f.note ? `（${f.note}）` : ''}`, files: [f] }); return 1; });
      // (a timer that holds the process until then: a post that never answers must not end the run's wait early)
      let tid = null;
      const timer = new Promise((res) => { tid = setTimeout(() => res('late'), wait); });
      const how = await Promise.race([chain.then(() => 'done'), timer]);
      clearTimeout(tid);
      if (how === 'late') log(`W Discord（写真・動画）: ${Math.round(wait / 60_000)} 分で送りきれませんでした（残りは送りません）`);
      return { sent: sentN, failed, late: how === 'late', head };
    },
  };
}
