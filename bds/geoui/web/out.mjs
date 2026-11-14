// GeoUI Web — writing a made add-on (probe.mjs, make.mjs): every file it makes, a file it no longer makes removed, or --check: the
// folder compared with what it would make (CI: tests/geoui-web-offline.mjs). The lab's own files beside a unit (lab.mjs,
// tsconfig.json: git ignores them) are not the add-on's.
import fs from 'node:fs';
import path from 'node:path';

const LAB_OWN = new Set(['lab.mjs', 'tsconfig.json']);

// The lab's maintenance (common/maintain.mjs: `upkeep` after a Minecraft update) edits a made unit in place: a newer stable
// @minecraft/server it proved on the new server, a line under TASK.md's ## Maintenance, the manifest written in its own
// layout. Making the unit again keeps what it did — the newer stable version, the notes — and a check compares a JSON file
// by what it says, not by its spaces: a unit kept up to date is still the unit this file makes.
const ver = (v) => String(v ?? '').split('-')[0].split('.').map(Number);
const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false; };
/** files as made → the same with what the maintenance put in dir carried over (pure but for reading dir) */
export function carryMaintenance(dir, files) {
  const out = { ...files };
  const mf = 'bp/manifest.json', had = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, mf), 'utf8')); } catch { return null; } })();
  if (had && typeof out[mf] === 'string') {
    const made = JSON.parse(out[mf]), old = (had.dependencies ?? []).find((d) => d.module_name === '@minecraft/server')?.version;
    const dep = (made.dependencies ?? []).find((d) => d.module_name === '@minecraft/server');
    // (only a stable version, only a newer one: a unit made for beta stays beta; an older one is never brought back)
    if (dep && old && !/-/.test(old) && !/-/.test(dep.version) && newer(old, dep.version)) { dep.version = old; out[mf] = JSON.stringify(made, null, 2) + '\n'; }
  }
  const tf = 'TASK.md', task = (() => { try { return fs.readFileSync(path.join(dir, tf), 'utf8'); } catch { return ''; } })();
  const notes = /^## Maintenance\n[\s\S]*$/m.exec(task)?.[0];
  if (notes && typeof out[tf] === 'string' && !/^## Maintenance$/m.test(out[tf])) out[tf] = `${out[tf].trimEnd()}\n\n${notes.trimEnd()}\n`;
  return out;
}
const sameJson = (a, b) => { try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch { return false; } };

/** files: { 'rel/path': string | Buffer } → { ok, bad: [rel…] } (check: nothing written) */
export function writeUnit(dir, files0, { check = false } = {}) {
  const files = carryMaintenance(dir, files0);
  const bad = [], want = new Set(Object.keys(files));
  for (const [rel, c] of Object.entries(files)) {
    const f = path.join(dir, rel), buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    if (check) { const has = fs.existsSync(f) ? fs.readFileSync(f) : null; if (!has || !(has.equals(buf) || (rel.endsWith('.json') && sameJson(has.toString('utf8'), buf.toString('utf8'))))) bad.push(rel); continue; }
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
