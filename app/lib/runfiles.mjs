// runfiles: a finished run's deliverables to the person's Discord (notify.yml → app notify). Which files of the run's artifacts
// go along with its message: LAB_NOTIFY_FILES (a repository variable) — auto (the default: Minecraft's own files, an addon's
// .mcaddon / .mcpack, a world, a template) · off · patterns (`*.mcaddon,*.zip`). Within Discord's upload limit (10 MB a
// message: LAB_NOTIFY_MAX_MB), the largest left out and named, with the run's page to take them from. The choosing is pure;
// runFiles reads the artifacts through GitHub's API with the run's own token (actions: read). A file is never opened or run.
import { unzipAll } from '../../common/scan.mjs';

export const PACKS = ['*.mcaddon', '*.mcpack', '*.mcworld', '*.mctemplate'];
const glob = (p) => new RegExp(`^${String(p).trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`, 'i');
/** LAB_NOTIFY_FILES → the patterns of the files that go (pure): null = none */
export function patterns(v) {
  const t = String(v ?? '').trim();
  if (/^(off|none|no|false|0)$/i.test(t)) return null;
  const list = !t || /^auto$/i.test(t) ? PACKS : t.split(/[\s,]+/).filter(Boolean);
  return list.map(glob);
}
/** [{ name, size }] → { attach, tooBig } (pure): the files whose own name (not the folder) matches, the smallest first while the
 *  message stays within maxBytes and maxFiles (Discord: 10 files); the rest that matched → tooBig */
export function pickFiles(files, { pats = patterns('auto'), maxBytes = 10_000_000, maxFiles = 10 } = {}) {
  if (!pats) return { attach: [], tooBig: [] };
  const want = files.filter((f) => pats.some((re) => re.test(String(f.name).split('/').pop())));
  const attach = [], tooBig = [], seen = new Set();
  let total = 0;
  for (const f of [...want].sort((a, b) => a.size - b.size || String(a.name).localeCompare(String(b.name)))) {
    const base = String(f.name).split('/').pop();
    if (seen.has(base)) continue;
    seen.add(base);
    if (attach.length < maxFiles && total + f.size <= maxBytes) { attach.push(f); total += f.size; } else tooBig.push(f);
  }
  return { attach, tooBig };
}
export const mb = (n) => `${(n / 1e6).toFixed(n < 1e6 ? 2 : 1)} MB`;

// ---- a run's published recordings (an artifact's public/ folders: lib/audiorec.mjs publish, kept in the clear by
// lib/publicout.mjs): every sound file there goes to the person's Discord after the run's message, in as many messages as
// Discord's limits take (10 files, LAB_NOTIFY_MAX_MB a message), each with the numbers the run's index.json gives it.
// LAB_NOTIFY_AUDIO (a repository variable): auto (the default) · off
export const AUDIO_RE = /\.(opus|ogg|oga|mp3|wav|flac|m4a|webm)$/i;
export const isPublic = (n) => /(^|\/)public\//.test(String(n));
/** LAB_NOTIFY_AUDIO → whether a run's published recordings go (pure) */
export const audioOn = (v) => !/^(off|none|no|false|0)$/i.test(String(v ?? '').trim());
/** the recordings → the messages' groups (pure): in the index's order (else by name), at most maxFiles and maxBytes a group;
 *  one larger than maxBytes by itself → tooBig */
export function audioGroups(files, { order = [], maxBytes = 9_000_000, maxFiles = 10 } = {}) {
  const rank = new Map(order.map((n, i) => [n, i])), base = (f) => String(f.name).split('/').pop();
  const sorted = [...files].sort((a, b) => (rank.get(base(a)) ?? 1e9) - (rank.get(base(b)) ?? 1e9) || base(a).localeCompare(base(b)));
  const groups = [], tooBig = [];
  let cur = [], size = 0;
  for (const f of sorted) {
    if (f.size > maxBytes) { tooBig.push(f); continue; }
    if (cur.length >= maxFiles || size + f.size > maxBytes) { groups.push(cur); cur = []; size = 0; }
    cur.push(f); size += f.size;
  }
  if (cur.length) groups.push(cur);
  return { groups, tooBig };
}
/** a recording's line for the message (pure): its name and the numbers measured on it (ViSQOL first) */
export function audioLine(name, rec) {
  const m = Object.entries(rec?.measured ?? {}).map(([w, v]) => [w, v]).find(([, v]) => typeof v?.visqol === 'number');
  const parts = m ? [`ViSQOL ${m[1].visqol.toFixed(3)}`, ...(typeof m[1].third_oct_db === 'number' ? [`1/3 oct ${m[1].third_oct_db.toFixed(1)} dB`] : []), ...(typeof m[1].onset_recall === 'number' ? [`onsets ${Math.round(m[1].onset_recall * 100)}%`] : [])] : [];
  return `- ${String(name).replace(/\.[^.]+$/, '')}${parts.length ? `: ${parts.join(' · ')}` : ''}`;
}

/** the run's artifacts → { artifacts: [{ name, size, expired }], attach: [{ name, data, size }], tooBig: [{ name, size }], why }.
 *  Best-effort: a question GitHub does not answer leaves the message without files (why says so), never a failed notify */
export async function runFiles({ base = 'https://api.github.com', repo, run, token, policy, maxBytes = 10_000_000, fetchImpl = fetch, audio = false }) {
  const pats = patterns(policy), out = { artifacts: [], attach: [], tooBig: [], audio: [], audioIndex: {}, why: '' };
  const get = (url) => fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(120_000) });
  try {
    const r = await get(`${base}/repos/${repo}/actions/runs/${run}/artifacts?per_page=100`);
    if (!r.ok) { out.why = `成果物の一覧を読めません（HTTP ${r.status}）`; return out; }
    out.artifacts = ((await r.json()).artifacts ?? []).map((a) => ({ id: a.id, name: a.name, size: a.size_in_bytes ?? 0, expired: Boolean(a.expired), url: a.archive_download_url }));
  } catch (e) { out.why = `成果物の一覧を読めません（${e.cause?.code ?? e.message}）`; return out; }
  if (!pats && !audio) return out;
  // (each artifact's zip: GitHub answers with a short-lived address of its storage — fetch follows it, without the token)
  const files = [];
  // (an artifact over 100 MB is a run's screens and logs, not an addon: not fetched)
  for (const a of out.artifacts.filter((x) => !x.expired && x.url && x.size <= 100e6)) {
    try {
      const r = await get(a.url);
      if (!r.ok) { out.why = `${a.name} を取れません（HTTP ${r.status}）`; continue; }
      const isPack = (n) => Boolean(pats) && pats.some((re) => re.test(n.split('/').pop()));
      const isSound = (n) => audio && isPublic(n) && (AUDIO_RE.test(n) || n.split('/').pop() === 'index.json');
      for (const f of unzipAll(Buffer.from(await r.arrayBuffer()), '', { nested: false, want: (n) => isPack(n) || isSound(n), max: 100e6 })) {
        if (isSound(f.name)) {
          if (f.name.split('/').pop() === 'index.json') { try { for (const x of JSON.parse(f.data.toString('utf8')).recordings ?? []) if (x?.file) out.audioIndex[x.file] = x; } catch { /* not an index */ } }
          else out.audio.push({ name: f.name.split('/').pop(), path: f.name, data: f.data, size: f.data.length });
        }
        if (isPack(f.name)) files.push({ name: f.name.split('/').pop(), data: f.data, size: f.data.length });
      }
    } catch (e) { out.why = `${a.name} を開けません（${e.cause?.code ?? e.message}）`; }
  }
  if (!pats) return out;
  const p = pickFiles(files, { pats, maxBytes });
  out.attach = p.attach; out.tooBig = p.tooBig.map(({ name, size }) => ({ name, size }));
  return out;
}
