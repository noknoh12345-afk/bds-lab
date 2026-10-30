// GeoUI Web — writing a made add-on (probe.mjs, make.mjs): every file it makes, a file it no longer makes removed, or --check: the
// folder compared with what it would make (CI: tests/geoui-web-offline.mjs). The lab's own files beside a unit (lab.mjs,
// tsconfig.json: git ignores them) are not the add-on's.
import fs from 'node:fs';
import path from 'node:path';

const LAB_OWN = new Set(['lab.mjs', 'tsconfig.json']);

/** files: { 'rel/path': string | Buffer } → { ok, bad: [rel…] } (check: nothing written) */
export function writeUnit(dir, files, { check = false } = {}) {
  const bad = [], want = new Set(Object.keys(files));
  for (const [rel, c] of Object.entries(files)) {
    const f = path.join(dir, rel), buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    if (check) { if (!fs.existsSync(f) || !fs.readFileSync(f).equals(buf)) bad.push(rel); continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
  }
  const walk = (d, pre = '') => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`])) : []);
  for (const rel of walk(dir)) if (!want.has(rel) && !LAB_OWN.has(rel)) { if (check) bad.push(`${rel}（余分）`); else fs.rmSync(path.join(dir, rel)); }
  return { ok: !bad.length, bad };
}

/** a built pack's files ({ base64 } → bytes) */
export function packFiles(built) {
  const out = {};
  for (const [p, c] of Object.entries(built.files)) out[p] = c && c.base64 !== undefined ? Buffer.from(c.base64, 'base64') : c;
  return out;
}
