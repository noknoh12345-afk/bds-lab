// node lab.mjs import <your BDS folder> ["<what you want>"] [--world <name>] [--dry]: everything a server of your own runs, taken in
// as the lab's units — the reverse of deploy. The world's addons (worlds/<level>/world_behavior_packs.json and
// world_resource_packs.json: each behavior pack with the resource pack it depends on, or that depends on it, as one addon) through
// the bds lab's import; the Endstone plugins (plugins/*.whl) through the end lab's. Each keeps its names and UUIDs (your world
// updates in place). A pack already here as a unit (the same UUID) is not taken twice. Then `go all --only <them>` says what
// still works on this BDS, all at once. Nothing in the server folder is changed. --dry: what it would take, nothing written.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unitsIn, unitDirIn } from './checkpoint.mjs';

const TOP = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/^\s*\/\/.*$/gm, '')); } catch { return null; } };
const dirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name)); } catch { return []; } };
const ids = (m) => [m?.header?.uuid, ...(m?.modules ?? []).map((x) => x.uuid)].filter(Boolean);

/** is this a BDS folder (pure on the file system: server.properties beside a worlds/ or the server program) */
export const isServerFolder = (d) => fs.existsSync(path.join(d, 'server.properties')) && ['worlds', 'bedrock_server', 'bedrock_server.exe'].some((n) => fs.existsSync(path.join(d, n)));

/** a unit's name from a pack's folder or header name: "My Addon BP" / "MyAddon_RP" / "§aShop [BP] v2" → my_addon / shop_v2 */
export function unitName(s) {
  const n = String(s ?? '').replace(/§./g, '').replace(/[\s_-]*[[(]?(BP|RP|behaviou?r[\s_-]*pack|resource[\s_-]*pack)[\])]?(?=[\s_-]|$)/gi, ' ')
    .replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '');
  return /^[a-z]/.test(n) && n.length >= 2 ? n : `addon_${n || 'pack'}`.slice(0, 40);
}

/** what a server folder holds (pure but for reading it) → { level, addons: [{ name, bp, rp, uuid }], wheels, mods, unlisted } */
export function scanServer(bds, { world = null } = {}) {
  const level = world ?? (/^level-name=(.*)$/m.exec(fs.readFileSync(path.join(bds, 'server.properties'), 'utf8'))?.[1]?.trim() || 'Bedrock level');
  const wd = path.join(bds, 'worlds', level);
  // every pack folder a world can name: the world's own, then the server's development and top-level ones
  const index = new Map();
  for (const [kind, sub] of [['bp', 'behavior_packs'], ['rp', 'resource_packs']]) {
    for (const d of [...dirs(path.join(wd, sub)), ...dirs(path.join(bds, `development_${sub}`)), ...dirs(path.join(bds, sub))]) {
      const m = readJson(path.join(d, 'manifest.json'));
      if (m?.header?.uuid && !index.has(m.header.uuid)) index.set(m.header.uuid, { kind, dir: d, m });
    }
  }
  const listed = (f) => (readJson(path.join(wd, f)) ?? []).map((x) => x.pack_id).filter(Boolean);
  let bpIds = listed('world_behavior_packs.json'), rpIds = listed('world_resource_packs.json');
  // (no lists: every pack in the world's own folders — a world copied in by hand)
  const unlisted = !bpIds.length && !rpIds.length;
  if (unlisted) { bpIds = dirs(path.join(wd, 'behavior_packs')).map((d) => readJson(path.join(d, 'manifest.json'))?.header?.uuid).filter(Boolean); rpIds = dirs(path.join(wd, 'resource_packs')).map((d) => readJson(path.join(d, 'manifest.json'))?.header?.uuid).filter(Boolean); }
  const bps = bpIds.map((u) => index.get(u)).filter((p) => p?.kind === 'bp'), rps = rpIds.map((u) => index.get(u)).filter((p) => p?.kind === 'rp');
  const deps = (p) => (p.m.dependencies ?? []).map((x) => x.uuid).filter(Boolean);
  const used = new Set(), addons = [];
  for (const bp of bps) {
    // its resource pack: the one it depends on, else one that depends on it
    const rp = rps.find((r) => !used.has(r) && deps(bp).includes(r.m.header.uuid)) ?? rps.find((r) => !used.has(r) && deps(r).includes(bp.m.header.uuid)) ?? null;
    if (rp) used.add(rp);
    addons.push({ name: unitName(path.basename(bp.dir)), bp: bp.dir, rp: rp?.dir ?? null, uuid: bp.m.header.uuid, ids: [...ids(bp.m), ...ids(rp?.m)], title: String(bp.m.header.name ?? '') });
  }
  for (const rp of rps.filter((r) => !used.has(r))) addons.push({ name: unitName(path.basename(rp.dir)), bp: null, rp: rp.dir, uuid: rp.m.header.uuid, ids: ids(rp.m), title: String(rp.m.header.name ?? '') });
  // two folders that make one name: the second gets _2 ...
  const seen = new Map();
  for (const a of addons) { const k = seen.get(a.name) ?? 0; seen.set(a.name, k + 1); if (k) a.name = `${a.name}_${k + 1}`.slice(0, 40); }
  let wheels = [], mods = [];
  try { wheels = fs.readdirSync(path.join(bds, 'plugins')).filter((n) => /\.whl$/i.test(n)).map((n) => path.join(bds, 'plugins', n)); } catch { /* not Endstone */ }
  // (a LeviLamina mod: plugins/<name>/manifest.json — the lab says so; ll mods are made with `ll new`)
  mods = dirs(path.join(bds, 'plugins')).filter((d) => readJson(path.join(d, 'manifest.json'))?.type).map((d) => path.basename(d));
  return { level, addons, wheels, mods, unlisted };
}

/** the import: each addon through `bds import <its packs> --name`, each wheel through `end import`; the units already here (the
 *  same pack UUID) left as they are */
export async function importServer(L, src, request, args = []) {
  const out = L?.out ?? console.log, flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  process.env.LAB_NEW_SKILL = 'off';   // (a whole server: no one skill fits it — each unit's import said its own brief)
  const dry = args.includes('--dry'), s = scanServer(src, { world: flag('--world') });
  if (!fs.existsSync(path.join(src, 'worlds', s.level)) && !s.wheels.length) { out(`ERR ${src}: no world "${s.level}" in worlds/ and no plugins/*.whl (--world <name> picks another world)`); return false; }
  // the units here, by their packs' UUIDs (a pack taken in before is not taken twice: node lab.mjs go -a <it> tests it again)
  const mine = new Map();
  for (const u of unitsIn(TOP, 'bds')) for (const k of ['bp', 'rp']) { for (const id of ids(readJson(path.join(unitDirIn(TOP, 'bds', u), k, 'manifest.json')))) mine.set(id, u); }
  const endLab = fs.existsSync(path.join(TOP, 'end', 'flavor.mjs'));
  out(`server ${src} · world "${s.level}"${s.unlisted ? ' (no pack lists: the packs in its folders)' : ''} · ${s.addons.length} addon(s), ${s.wheels.length} Endstone plugin(s)${s.mods.length ? `, ${s.mods.length} LeviLamina mod(s)` : ''}`);
  const made = [], kept = [], failed = [];
  const run = (lab, what, name) => spawnSync(process.execPath, [path.join(TOP, 'lab.mjs'), lab, 'import', what, ...(request ? [request] : []), ...(name ? ['--name', name] : [])], { cwd: TOP, encoding: 'utf8', maxBuffer: 64e6, env: { ...process.env, LAB_NEW_SKILL: 'off' }, timeout: 900000 });
  for (const a of s.addons) {
    // (a resource pack alone — textures, sounds, a UI: the lab tests behavior; it stays on the server as it is)
    if (!a.bp) { out(`  · ${a.title || a.name}: a resource pack alone (looks only): not a unit — the lab tests addons with a behavior pack`); continue; }
    const here = a.ids.map((x) => mine.get(x)).find(Boolean);
    if (here) { kept.push(here); out(`  = ${a.title || a.name}: already the unit ${here} (the same pack)`); continue; }
    let name = a.name; for (let k = 2; fs.existsSync(path.join(TOP, 'bds', 'addons', name)); k++) name = `${a.name}_${k}`.slice(0, 40);
    if (dry) { out(`  + ${a.title || a.name} → bds/addons/${name} (${a.bp ? 'bp' : ''}${a.bp && a.rp ? ' + ' : ''}${a.rp ? 'rp' : ''})`); made.push(name); continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-server-'));
    if (a.bp) fs.cpSync(a.bp, path.join(tmp, 'bp'), { recursive: true });
    if (a.rp) fs.cpSync(a.rp, path.join(tmp, 'rp'), { recursive: true });
    const r = run('bds', tmp, name);
    fs.rmSync(tmp, { recursive: true, force: true });
    const ok = r.status === 0 && new RegExp(`^OK bds/addons/${name}/`, 'm').test(r.stdout ?? '');
    if (ok) { made.push(name); out(`  + ${a.title || a.name} → bds/addons/${name}`); }
    else { failed.push(a.title || a.name); out(`  ✘ ${a.title || a.name}: ${String(r.stdout || r.stderr).trim().split('\n').filter((l) => /^(ERR|E )/.test(l)).slice(-1)[0] ?? 'import failed'}`); }
  }
  for (const w of s.wheels) {
    if (!endLab) { out(`  · ${path.basename(w)}: an Endstone plugin (the Endstone lab is on the dev branch)`); continue; }
    if (dry) { out(`  + ${path.basename(w)} → end/plugins/ (Endstone)`); made.push(`end-${path.basename(w).split('-')[0].replace(/^endstone_/, '')}`); continue; }
    const r = run('end', w, null), m = /^OK end\/plugins\/([a-z0-9_]+)\//m.exec(r.stdout ?? '');
    if (m) { made.push(`end-${m[1]}`); out(`  + ${path.basename(w)} → end/plugins/${m[1]}`); }
    else if (/plugins\/([a-z0-9_]+) exists/.test(r.stdout ?? '')) { kept.push(/plugins\/([a-z0-9_]+) exists/.exec(r.stdout)[1]); out(`  = ${path.basename(w)}: already a plugin unit here`); }
    else { failed.push(path.basename(w)); out(`  ✘ ${path.basename(w)}: ${String(r.stdout || r.stderr).trim().split('\n').filter((l) => /^(ERR|E )/.test(l)).slice(-1)[0] ?? 'import failed'}`); }
  }
  for (const m of s.mods) out(`  · ${m}: a LeviLamina mod (plugins/${m}): not taken in — its source makes a unit with node lab.mjs ll new`);
  const names = [...made, ...kept];
  out(`${dry ? 'DRY' : failed.length ? 'W' : 'OK'} ${dry ? 'would take' : 'took'} ${made.length} in${kept.length ? `, ${kept.length} already here` : ''}${failed.length ? `, ${failed.length} failed (${failed.join(', ')})` : ''} from ${src}; nothing there was changed`);
  const labs = [...new Set(names.map((n) => (n.startsWith('end-') ? 'end' : 'bds')))].join(',');
  if (names.length && !dry) out(`next: node lab.mjs go all --lab ${labs} --only ${names.join(',')}   (each on a fresh real server, side by side: what still works on this BDS; then deploy "${src}" <unit> puts a fixed one back)`);
  return !failed.length;
}
