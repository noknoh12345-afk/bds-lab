// publicout: what a run publishes in the clear beside its sealed results (`app checks --seal`). A run folder's public/ (or one
// at the top of the results folder) keeps only sound files — known by their name and their first bytes — and each folder's
// index.json, rebuilt from its own fields; every other file there is sealed with the rest of the run (or, outside a run folder,
// left out), and so is any file that holds one of the job's secrets. Written by lib/audiorec.mjs publish (the measurement rig's
// recordings: game sound only), played in the management panel's viewer, sent to Discord by lib/runfiles.mjs publicAudio.
import fs from 'node:fs';
import path from 'node:path';

// a sound file's name → its first bytes (at offset `at`) and type
const SOUNDS = {
  opus: { magic: ['OggS'], mime: 'audio/ogg' }, ogg: { magic: ['OggS'], mime: 'audio/ogg' }, oga: { magic: ['OggS'], mime: 'audio/ogg' },
  mp3: { magic: ['ID3', '\xff\xfb', '\xff\xf3', '\xff\xf2'], mime: 'audio/mpeg' }, wav: { magic: ['RIFF'], mime: 'audio/wav' },
  flac: { magic: ['fLaC'], mime: 'audio/flac' }, m4a: { magic: ['ftyp'], at: 4, mime: 'audio/mp4' },
  webm: { magic: ['\x1a\x45\xdf\xa3'], mime: 'audio/webm' },
};
export const SOUND_EXT = Object.keys(SOUNDS);
export const MAX_SOUND = 50e6;         // one file (a 20 s recording at 160 kbps is ~0.4 MB)
export const SAFE = /^[\w.:+-]{1,80}$/; // a name, a file, a measurement's key in the index
/** a sound file by its name and first bytes (pure) → its type, or null */
export function soundType(name, head) {
  const ext = String(name).toLowerCase().split('.').pop(), s = SOUNDS[ext];
  if (!s || !SAFE.test(String(name).split('/').pop())) return null;
  const b = Buffer.from(head ?? []);
  return s.magic.some((m) => b.subarray(s.at ?? 0, (s.at ?? 0) + m.length).equals(Buffer.from(m, 'latin1'))) ? s.mime : null;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** an index.json rebuilt from its own fields (pure): { format, addon, recordings: [{ name, file, kbps, kb, seconds, sha256,
 *  measured: { <what>: { <number>… } } }] } — any other field, a name that is not a plain word, or text of any other kind is
 *  dropped; `files` (the sound files that stay beside it): a recording whose file is not one of them goes too */
export function cleanIndex(o, files = null) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.recordings)) return null;
  const recs = [];
  for (const r of o.recordings.slice(0, 500)) {
    if (!r || !SAFE.test(String(r.name ?? '')) || !SAFE.test(String(r.file ?? '')) || (files && !files.has(r.file))) continue;
    const measured = {};
    for (const [w, v] of Object.entries(r.measured && typeof r.measured === 'object' ? r.measured : {}).slice(0, 20)) {
      if (!SAFE.test(w) || !v || typeof v !== 'object') continue;
      const m = Object.fromEntries(Object.entries(v).filter(([k, x]) => SAFE.test(k) && num(x) !== undefined).slice(0, 20));
      if (Object.keys(m).length) measured[w] = m;
    }
    recs.push({ name: r.name, file: r.file, ...(num(r.kbps) !== undefined ? { kbps: r.kbps } : {}), ...(num(r.kb) !== undefined ? { kb: r.kb } : {}),
      ...(num(r.seconds) !== undefined ? { seconds: r.seconds } : {}), ...(/^[0-9a-f]{64}$/.test(String(r.sha256 ?? '')) ? { sha256: r.sha256 } : {}), measured });
  }
  return { format: 'bds-lab-recordings/1', ...(SAFE.test(String(o.addon ?? '')) ? { addon: o.addon } : {}), recordings: recs };
}
/** the job's secrets as they could appear in a file (pure): each value of 8 characters or more, and the vault's key as hex
 *  and base64 */
export function secretsOf(env = process.env, key = null) {
  const names = ['GOOGLE_AAS_TOKEN', 'GOOGLE_EMAIL', 'GOOGLE_PASSWORD', 'APP_CACHE_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'DISCORD_BOT_TOKEN', 'LAB_NOTIFY_WEBHOOK', 'ACTIONS_RUNTIME_TOKEN'];
  const out = names.map((n) => String(env[n] ?? '')).filter((v) => v.length >= 8).map((v) => Buffer.from(v));
  // (lib/vault.mjs vaultKey: { key, id })
  const raw = key?.key ?? key;
  if (raw && (Buffer.isBuffer(raw) || raw instanceof Uint8Array)) { const k = Buffer.from(raw); out.push(Buffer.from(k.toString('hex')), Buffer.from(k.toString('base64')), k); }
  return out;
}
const walk = (d, base = d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const f = path.join(d, e.name);
  return e.isDirectory() ? walk(f, base) : e.isFile() ? [path.relative(base, f).split(path.sep).join('/')] : [];
}) : []);
/** a public/ folder → { keep: [{ file, kb }], out: [file] } (out: what must not stay in the clear), index.json files rewritten
 *  clean in place. Nothing is moved here: the caller seals or leaves out the `out` list */
export function planPublic(dir, secrets = []) {
  const keep = [], out = [], files = walk(dir);
  const has = (b) => secrets.some((s) => s.length && b.includes(s));
  const sounds = new Map();
  for (const f of files) {
    const p = path.join(dir, f), st = fs.statSync(p);
    if (path.basename(f) === 'index.json') continue;
    const ok = st.size <= MAX_SOUND && f.split('/').every((x) => SAFE.test(x));
    const b = ok ? fs.readFileSync(p) : null;
    if (b && soundType(f, b.subarray(0, 16)) && !has(b)) { keep.push({ file: f, kb: Math.round(st.size / 1024) }); sounds.set(f, true); }
    else out.push(f);
  }
  for (const f of files.filter((x) => path.basename(x) === 'index.json')) {
    const p = path.join(dir, f), folder = path.posix.dirname(f);
    let o = null; try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* not JSON */ }
    const here = new Set(keep.filter((k) => path.posix.dirname(k.file) === folder).map((k) => path.posix.basename(k.file)));
    const c = o && f.split('/').every((x) => SAFE.test(x)) ? cleanIndex(o, here) : null;
    const text = c ? JSON.stringify(c, null, 1) + '\n' : null;
    if (text && !has(Buffer.from(text))) { fs.writeFileSync(p, text); keep.push({ file: f, kb: Math.round(text.length / 1024) }); }
    else out.push(f);
  }
  return { keep: keep.sort((a, b) => a.file.localeCompare(b.file)), out: out.sort() };
}
