#!/usr/bin/env node
// GeoUI calibration report: what the real app's screens measured (app runs' `measure geoui` / `measure diff`, read from each
// run's summary.json — readable even when the run's results are sealed) in one table, and the mapping from the HUD frame
// to the screen fitted from them: what GeoUI Builder needs to place a layer for any frame, on any screen.
//   node bds/geoui/report.mjs <run id | run folder | summary.json>... [--md <out.md>] [--json <out.json>] [--repo <owner/name>]
// (a run id: its artifacts are fetched with gh into a temporary folder; only summary.json is read)
//
// The model, in model units (x to the right, y up) and the frame's numbers in % of the screen (the HUD's live_player_renderer
// frame: its height h, its top t from the screen's top — Studio's 10 % and 110 %):
//   screen height   H  = K · 100 / h                 K: model units per frame height (Studio's 176 at 10 %: K = 17.6)
//   screen centre   cy = H · (t / 100 − 1/2) + B     B: where the model is pinned in its frame, in model units
//                   cx = C                           (Studio: cy = 140 at 10 % / 110 %, so B = 140 − 176 · 0.6 = 34.4)
// Each shot's own changes are undone first — its scale about the pivot (0, 140 + lift) and its oy, as the addon's app.txt
// set them before that shot, and the markers' lift (imported.json) — so every shot speaks of the same model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), TOP = path.resolve(HERE, '..', '..');
export const STUDIO = { K: 17.6, B: 34.4, frame: { w: 10, h: 10, top: 110 }, fix: { desktop: [-0.00057, -0.02784], mobile: [-0.0017, -0.05256] } };

/** an addon's calibration frame, lift and the transform each of its shots was taken with (pure: the files' texts) */
export function addonPlan({ imported = '', app = '' } = {}) {
  let from = ''; try { from = JSON.parse(imported).from ?? ''; } catch { /* none: the plain pack */ }
  const pm = /--panel (\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)@(-?\d+(?:\.\d+)?)/.exec(from), lm = /--lift (-?\d+(?:\.\d+)?)/.exec(from);
  const frame = pm ? { w: +pm[1], h: +pm[2], top: +pm[3] } : { ...STUDIO.frame };
  // (the state as the steps go: gcal:set scale (%), ox / oy (tenths of a unit); a shot keeps the state it was taken in)
  const st = { scale: 100, ox: 0, oy: 0 }, shots = {};
  for (const raw of String(app).split('\n')) {
    const l = raw.replace(/#.*$/, '').trim();
    const set = /^do scriptevent \w+:set (scale|ox|oy) (-?\d+(?:\.\d+)?)$/.exec(l);
    if (set) st[set[1]] = +set[2];
    const shot = /^shot (\S+)/.exec(l);
    if (shot) shots[shot[1]] = { ...st };
  }
  return { frame, lift: lm ? +lm[1] : 0, shots };
}

/** a measure's numbers, the shot's changes undone (pure) → { H, Hx, cx, cy, ... } in the model's own units */
export function trueOf(v, { scale = 100, ox = 0, oy = 0 } = {}, lift = 0) {
  const s = scale / 100, num = (x) => (Number.isFinite(x) ? x : null);
  if (!(s > 0) || num(v.unitsPerScreenH) === null) return null;
  return {
    H: v.unitsPerScreenH * s, Hx: num(v.unitsPerScreenHFromX) === null ? null : v.unitsPerScreenHFromX * s,
    cx: num(v.centreX) === null ? null : s * v.centreX + ox / 10,
    cy: num(v.centreY) === null ? null : 140 + lift + s * (v.centreY - 140) + oy / 10,
    aspect: v.width && v.height ? v.width / v.height : null, pxPerUnit: num(v.pxPerUnitY) === null ? null : Math.abs(v.pxPerUnitY),
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

/** rows: [{ run, addon, shot, kind, ok, values, plan }] → the shots with their model numbers, the fit, the diffs (pure) */
export function analyse(rows) {
  const geo = [], diffs = [], failed = [];
  for (const r of rows) {
    if (r.kind === 'diff') { (r.ok ? diffs : failed).push(r); continue; }
    if (r.kind !== 'geoui') continue;
    if (!r.ok) { failed.push(r); continue; }
    const t = trueOf(r.values, r.plan?.shots?.[r.shot], r.plan?.lift ?? 0);
    if (!t) { failed.push(r); continue; }
    const f = r.plan?.frame ?? STUDIO.frame;
    geo.push({ ...r, ...t, frame: f, K: (t.H * f.h) / 100, B: t.cy === null ? null : t.cy - t.H * (f.top / 100 - 0.5) });
  }
  const use = geo.filter((g) => g.B !== null);
  const K = mean(use.map((g) => g.K)), B = mean(use.map((g) => g.B)), C = mean(use.filter((g) => g.cx !== null).map((g) => g.cx));
  for (const g of geo) {
    const H = (K * 100) / g.frame.h, cy = H * (g.frame.top / 100 - 0.5) + B;
    g.residual = { H: g.H - H, cy: g.cy === null ? null : g.cy - cy, cx: g.cx === null || C === null ? null : g.cx - C };
    // (in pixels on that screen: what a misplaced layer would look like)
    g.residualPx = { cy: g.residual.cy === null || !g.pxPerUnit ? null : g.residual.cy * g.pxPerUnit, H: g.pxPerUnit && g.values.height ? (g.values.height * g.residual.H) / g.H : null };
  }
  const depth = (k) => geo.map((g) => g.values[k]).filter(Number.isFinite);
  const fit = use.length ? {
    n: use.length, K, Ksd: sd(use.map((g) => g.K)), B, Bsd: sd(use.map((g) => g.B)), C, Csd: sd(geo.filter((g) => g.cx !== null).map((g) => g.cx)),
    // (the screen's x scale against its y scale: 1 = square model units on the screen, so its half width is H/2 · aspect)
    xy: mean(geo.filter((g) => g.Hx).map((g) => g.Hx / g.H)),
    near: mean(depth('depthNear')), far: mean(depth('depthFar')),
    // Studio's frame (10 % at 110 %) on this device: what the plugin's numbers become
    studioFrame: { H: K * 10, cy: K * 10 * 0.6 + B, fixY: (K * 10 * 0.6 + B - 140) / (K * 10), fixX: C === null ? null : C / (K * 10) },
  } : null;
  return { geo, diffs, failed, fit };
}

/** what a `measure diff` of a known shot answers (its app.txt compares it with a picture where only that one thing differs):
 *  the question, asked of "something changed" (parts > 0: the measure already drops specks of < 1/200000 of the picture) */
export const DIFF_QUESTIONS = {
  'hud-on': 'HUD に GeoUI が描かれる', 'bar0': 'プロパティを変えると描画が変わる（バー）', 'inventory-off': 'インベントリに GeoUI が映り込む',
  'inventory-shown': 'インベントリに GeoUI が映り込む', 'invisible-on': '透明化の間も GeoUI が描かれる', 'hud-alpha0': 'alpha 0 でも GeoUI が描かれる',
  'third-person': '視点（三人称）で GeoUI の見え方が変わる',
};
/** the diffs of known shots as yes / no (pure) → [{ addon, shot, question, yes, parts, share }] */
export const verdicts = (diffs) => diffs.filter((d) => DIFF_QUESTIONS[d.shot]).map((d) => ({ addon: d.addon, shot: d.shot, question: DIFF_QUESTIONS[d.shot], yes: (d.values.parts ?? 0) > 0, parts: d.values.parts ?? 0, share: d.values.share ?? 0 }));
const f = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : '—');
const sgn = (x, n = 2) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(n)}` : '—');
/** the report as Markdown (pure) */
export function markdown(a, { title = 'GeoUI の較正: 本物のアプリで測った値', runs = [], app = null } = {}) {
  const L = [`# ${title}`, ''];
  if (runs.length) L.push(`実行: ${runs.join('・')}${app ? `・アプリ ${app}` : ''}`, '');
  if (!a.geo.length) L.push('`measure geoui` の数がありません（実行が測るところまで行っていないか、測れなかった）。', '');
  else {
    L.push('## 画面ごと（各画面の大きさ・ずらしは元に戻した、モデルそのものの単位）', '',
      '| 実行 | アドオン（枠） | 写した画面 | 画面 | 画面の高さ H | K = H·枠の高さ | 中心 x | 中心 y | B | 当てはめとの差 H / 中心 y | 1 単位 | 横÷縦 | 奥行き 手前 / 奥 |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const g of a.geo) {
      L.push(`| ${g.run ?? '—'} | ${g.addon}（${g.frame.w}x${g.frame.h}@${g.frame.top}） | ${g.shot} | ${g.values.width ?? '?'}x${g.values.height ?? '?'} | ${f(g.H, 2)} | ${f(g.K, 3)} | ${f(g.cx, 2)} | ${f(g.cy, 2)} | ${f(g.B, 2)} | ${sgn(g.residual.H, 2)} / ${sgn(g.residual.cy, 2)}（${sgn(g.residualPx.cy, 1)} px） | ${f(g.pxPerUnit, 3)} px | ${f(g.Hx / g.H, 4)} | ${f(g.values.depthNear, 4)} / ${f(g.values.depthFar, 4)} |`);
    }
    L.push('');
  }
  const F = a.fit;
  if (F) {
    const near = Number.isFinite(F.near) && Math.abs(F.near - 1) < 0.01, far = Number.isFinite(F.far) && Math.abs(F.far - 1) < 0.01;
    L.push('## 当てはめ（枠の設定 → 画面）', '',
      `- **画面の高さ** H = K · 100 / 枠の高さ(%)、**K = ${f(F.K, 3)}**（±${f(F.Ksd, 3)}、${F.n} 枚）。Studio の値は 17.6（10 % の枠で 176）: ${sgn(((F.K - STUDIO.K) / STUDIO.K) * 100, 2)} %`,
      `- **画面の中心** y = H · (枠の上端(%) / 100 − 1/2) + B、**B = ${f(F.B, 2)}**（±${f(F.Bsd, 2)}）。Studio の値は 34.4（10 % / 110 % で y = 140）`,
      `- 中心 x = **${f(F.C, 3)}**（±${f(F.Csd, 3)}）・横と縦の尺度の比 ${f(F.xy, 4)}（1 なら画面の半分の幅 = H/2 × 画面比）`,
      `- 遠近: 60 単位手前の点の拡大率 ${f(F.near, 4)}・60 単位奥 ${f(F.far, 4)}${near && far ? '（どちらも 1: 遠近なし。重ね順は z だけで決まり、大きさは変わらない）' : ''}`,
      `- Studio の枠（10 % x 10%・110 %）では: 画面の高さ **${f(F.studioFrame.H, 2)}**（Studio 176）・中心 y **${f(F.studioFrame.cy, 2)}**（Studio 140）・中心のずれ（画面の高さの割合）x ${f(F.studioFrame.fixX, 5)} / y ${f(F.studioFrame.fixY, 5)}（Studio のスマホ ${STUDIO.fix.mobile.join(' / ')}、PC ${STUDIO.fix.desktop.join(' / ')}）`, '');
  }
  const V = verdicts(a.diffs);
  if (V.length) {
    L.push('## 仕様書の主張への答え（measure diff）', '', '| 問い | 答え | 根拠 |', '|---|---|---|');
    for (const v of V) L.push(`| ${v.question} | **${v.yes ? 'はい' : 'いいえ'}** | ${v.addon} の ${v.shot}: ${v.parts} か所・${f(v.share * 100, 3)} % |`);
    L.push('');
  }
  if (a.diffs.length) {
    L.push('## 違う所（measure diff: 基準の画面と比べて）', '', '| 実行 | アドオン | 写した画面 | 違う割合 | か所 | 全体の枠 (px) |', '|---|---|---|---|---|---|');
    for (const d of a.diffs) { const v = d.values; L.push(`| ${d.run ?? '—'} | ${d.addon} | ${d.shot} | ${f((v.share ?? 0) * 100, 3)} % | ${v.parts ?? 0} | ${Number.isFinite(v.x0) ? `(${v.x0}, ${v.y0})–(${v.x1}, ${v.y1})` : '—'} |`); }
    L.push('');
  }
  if (a.failed.length) L.push(`測れなかった画面: ${a.failed.map((r) => `${r.addon}/${r.shot}`).join('、')}（理由は封じた結果に）`, '');
  return L.join('\n');
}

/** the summaries under a folder (a run's artifacts, app/runs/gh-<run>) */
function summariesIn(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...summariesIn(p));
    else if (e.name === 'summary.json') out.push(p);
  }
  return out;
}
/** the rows of the given inputs: run ids (fetched with gh), run folders, summary.json files */
export function load(inputs, { repo = null, top = TOP } = {}) {
  const rows = [], runs = [], apps = new Set(), plans = new Map();
  const planOf = (addon) => {
    if (!plans.has(addon)) {
      const d = path.join(top, 'bds', 'addons', String(addon));
      const read = (n) => { try { return fs.readFileSync(path.join(d, n), 'utf8'); } catch { return ''; } };
      plans.set(addon, addonPlan({ imported: read('imported.json'), app: read('app.txt') }));
    }
    return plans.get(addon);
  };
  for (const x of inputs) {
    let files = [], run = null;
    if (/^\d{6,}$/.test(x)) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `geoui-report-${x}-`));
      const r = spawnSync('gh', ['run', 'download', x, ...(repo ? ['--repo', repo] : []), '-D', tmp], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`実行 ${x} の成果物を取れません: ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
      files = summariesIn(tmp); run = x;
    } else if (fs.existsSync(x) && fs.statSync(x).isDirectory()) { files = summariesIn(x); run = path.basename(x).replace(/^gh-/, ''); }
    else files = [x];
    if (run) runs.push(run);
    for (const file of files) {
      let s; try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
      if (!s?.addon || !Array.isArray(s.measures)) continue;
      if (s.app) apps.add(s.app);
      for (const m of s.measures) rows.push({ run, addon: s.addon, shot: m.shot, kind: m.kind, ok: m.ok === true, values: m.values ?? {}, plan: planOf(s.addon) });
    }
  }
  return { rows, runs, app: [...apps].join('・') || null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const md = opt('md'), json = opt('json'), repo = opt('repo');
  if (!args.length) { console.log('usage: node bds/geoui/report.mjs <run id | run folder | summary.json>... [--md out.md] [--json out.json] [--repo owner/name]'); process.exit(1); }
  const { rows, runs, app } = load(args, { repo });
  const a = analyse(rows), text = markdown(a, { runs, app });
  console.log(text);
  if (md) fs.writeFileSync(md, `${text}\n`);
  if (json) fs.writeFileSync(json, `${JSON.stringify({ runs, app, fit: a.fit, shots: a.geo.map(({ plan: _p, ...g }) => g), diffs: a.diffs.map(({ plan: _p, ...d }) => d) }, null, 1)}\n`);
  process.exit(a.geo.length || a.diffs.length ? 0 : 1);
}
