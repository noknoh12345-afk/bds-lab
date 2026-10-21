#!/usr/bin/env node
// GeoUI calibration report: what the real app's screens measured (app runs' `measure geoui` / `measure diff`, read from each
// run's summary.json — readable even when the run's results are sealed) in one table, and the mapping from the HUD frame
// to the screen fitted from them: what GeoUI Builder needs to place a layer for any frame, on any screen.
//   node bds/geoui/report.mjs <run id | run folder | summary.json>... [--md <out.md>] [--json <out.json>] [--repo <owner/name>]
// (a run id: its artifacts are fetched with gh into a temporary folder; only summary.json is read)
//
// The question: where does the HUD's live_player_renderer put the model, for any frame on any screen? (the frame: its panel,
// w x h in % of the screen's width and height, its top t % down from the screen's top, centred across — Studio's 10 x 10 at
// 110). Models compared, each against every shot at once:
//   scale  k (px per model unit) = c · g(frame in px), g = its height | width | √(width · height) | diagonal
//   pin    the model's origin (0, 0) on the screen: centred across, at the frame's top | middle | bottom + d (units, or px)
// The one that fits all shots best (the smallest spread) is the answer; then the screen's height in model units H = screen px
// / k and its centre cy = (the origin's px − the screen's middle px) / k follow for any frame and screen — what GeoUI Builder
// needs, and what Studio's hand-set numbers (H = 176, centre y = 140 for 10 x 10 at 110, whatever the screen) are checked by.
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
const rms = (xs) => (xs.length ? Math.sqrt(mean(xs.map((x) => x * x))) : null);

/** the frame on a W x Hs screen, in px (pure): centred across (top_middle), its top t % of the screen's height down */
export function frameOn(f, W, Hs) { const w = (W * f.w) / 100, h = (Hs * f.h) / 100, top = (Hs * f.top) / 100; return { w, h, top, middle: top + h / 2, bottom: top + h }; }
/** what the model's scale (px per unit) may follow, times a constant */
export const SCALES = { height: (fr) => fr.h, width: (fr) => fr.w, area: (fr) => Math.sqrt(fr.w * fr.h), diagonal: (fr) => Math.hypot(fr.w, fr.h) };
/** where the model's origin may be pinned (then + d model units, or + d px) */
export const PINS = { top: (fr) => fr.top, middle: (fr) => fr.middle, bottom: (fr) => fr.bottom };
/** a model (scale, pin) → the screen's height in units, its centre and px per unit for a frame on a screen (pure) */
export function predict(model, frame, W, Hs) {
  const fr = frameOn(frame, W, Hs), k = model.c * SCALES[model.scale](fr), y0 = PINS[model.pin](fr) + (model.px ? model.d : model.d * k);
  return { k, H: Hs / k, cy: (y0 - Hs / 2) / k, cx: model.C ?? 0 };
}
/** the screens the answer is said for: this lab's device, and the usual ones */
export const SCREENS = [[1560, 720, 'CI の端末（19.5:9）'], [1920, 1080, '16:9（PC・ゲーム機）'], [2340, 1080, '19.5:9（スマホ）'], [2400, 1080, '20:9（スマホ）'], [2048, 1536, '4:3（iPad）'], [2560, 1600, '16:10']];

/** rows: [{ run, addon, shot, kind, ok, values, plan }] → the shots with their model numbers, the models compared and the best
 *  one, its residuals, its answer for Studio's frame, the diffs (pure) */
export function analyse(rows) {
  const geo = [], diffs = [], failed = [];
  for (const r of rows) {
    if (r.kind === 'diff') { (r.ok ? diffs : failed).push(r); continue; }
    if (r.kind !== 'geoui') continue;
    if (!r.ok) { failed.push(r); continue; }
    const t = trueOf(r.values, r.plan?.shots?.[r.shot], r.plan?.lift ?? 0), W = r.values.width, Hs = r.values.height;
    if (!t || t.cy === null || !(W > 0) || !(Hs > 0)) { failed.push(r); continue; }
    const frame = r.plan?.frame ?? STUDIO.frame, fr = frameOn(frame, W, Hs), k = Hs / t.H;
    geo.push({ ...r, ...t, frame, fr, W, Hs, k, y0: Hs / 2 + t.cy * k });
  }
  if (!geo.length) return { geo, diffs, failed, fit: null };
  // the scale: c = the geometric mean of k / g; its spread in % (sd of the logs x 100)
  const scales = Object.entries(SCALES).map(([name, g]) => { const r = geo.map((x) => Math.log(x.k / g(x.fr))); return { name, c: Math.exp(mean(r)), spread: sd(r) * 100 }; }).sort((a, b) => a.spread - b.spread);
  // the pin: d by least squares (units: y0 − a = d·k; px: y0 − a = d), how far the origin then is from where it was (px, rms)
  const pins = Object.entries(PINS).flatMap(([name, a]) => [false, true].map((px) => {
    const e = geo.map((x) => ({ r: x.y0 - a(x.fr), k: x.k }));
    const d = px ? mean(e.map((q) => q.r)) : e.reduce((s, q) => s + q.r * q.k, 0) / e.reduce((s, q) => s + q.k * q.k, 0);
    return { name, px, d, spread: rms(e.map((q) => q.r - (px ? d : d * q.k))) };
  })).sort((a, b) => a.spread - b.spread);
  const cxs = geo.filter((x) => x.cx !== null).map((x) => x.cx), C = mean(cxs);
  const model = { scale: scales[0].name, c: scales[0].c, pin: pins[0].name, px: pins[0].px, d: pins[0].d, C };
  for (const x of geo) {
    const p = predict(model, x.frame, x.W, x.Hs);
    x.residual = { H: x.H - p.H, cy: x.cy - p.cy, cyPx: (x.cy - p.cy) * x.k, kPct: ((x.k - p.k) / p.k) * 100 };
  }
  // (with every shot of one frame shape the scale models cannot be told apart: said, not guessed)
  const shapes = new Set(geo.map((x) => (x.fr.w / x.fr.h).toFixed(2))).size, sizes = new Set(geo.map((x) => Math.round(x.fr.h))).size;
  const depth = (k) => geo.map((x) => x.values[k]).filter(Number.isFinite);
  return { geo, diffs, failed, fit: {
    n: geo.length, scales, pins, model, shapes, sizes, C, Csd: sd(cxs),
    // (the screen's x scale against its y scale: 1 = square model units on the screen, so its half width is H/2 · aspect)
    xy: mean(geo.filter((x) => x.Hx).map((x) => x.Hx / x.H)), near: mean(depth('depthNear')), far: mean(depth('depthFar')),
    residualPx: rms(geo.map((x) => x.residual.cyPx)), residualKPct: rms(geo.map((x) => x.residual.kPct)),
    // Studio's frame (10 x 10 at 110) on the usual screens: what Studio assumes everywhere is H 176 and centre 140
    studio: SCREENS.map(([W, Hs, label]) => ({ label, W, Hs, ...predict(model, STUDIO.frame, W, Hs) })),
  } };
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
      '| 実行 | アドオン（枠 %） | 写した画面 | 画面 px | 枠 px | 画面の高さ H | 1 単位 px | 中心 x | 中心 y | 原点 px | 当てはめとの差 尺度 / 中心 | 横÷縦 | 奥行き 手前 / 奥 |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const g of a.geo) {
      L.push(`| ${g.run ?? '—'} | ${g.addon}（${g.frame.w}x${g.frame.h}@${g.frame.top}） | ${g.shot} | ${g.W}x${g.Hs} | ${f(g.fr.w, 1)}x${f(g.fr.h, 1)} | ${f(g.H, 2)} | ${f(g.k, 4)} | ${f(g.cx, 2)} | ${f(g.cy, 2)} | ${f(g.y0, 1)} | ${sgn(g.residual.kPct, 2)} % / ${sgn(g.residual.cyPx, 1)} px | ${f(g.Hx / g.H, 4)} | ${f(g.values.depthNear, 4)} / ${f(g.values.depthFar, 4)} |`);
    }
    L.push('');
  }
  const F = a.fit;
  if (F) {
    const near = Number.isFinite(F.near) && Math.abs(F.near - 1) < 0.01, far = Number.isFinite(F.far) && Math.abs(F.far - 1) < 0.01, M = F.model;
    const SN = { height: '枠の高さ', width: '枠の幅', area: '√(枠の幅 × 高さ)', diagonal: '枠の対角線' }, PN = { top: '上端', middle: '真ん中', bottom: '下端' };
    L.push('## 当てはめ（枠の設定 → 画面）', '',
      `- **尺度**: 1 モデル単位 = **${f(M.c, 6)} × ${SN[M.scale]}（px）**。比べた形（ばらつき、小さいほど合う）: ${F.scales.map((x) => `${SN[x.name]} ${f(x.spread, 2)} %`).join('・')}`
        + `${F.shapes < 2 ? '（**どの画面も枠の形が同じなので、形の違う枠（幅 2 % など）が無いと見分けられません**）' : ''}`,
      `- **原点**: 枠の${PN[M.pin]}（横は真ん中）から下へ **${f(M.d, 2)}${M.px ? ' px' : ' 単位'}**。比べた形（原点のずれ px の二乗平均）: ${F.pins.slice(0, 4).map((x) => `${PN[x.name]}+${x.px ? 'px' : '単位'} ${f(x.spread, 1)}`).join('・')}`,
      `- 当てはめとの差: 尺度 ${f(F.residualKPct, 2)} %・中心 ${f(F.residualPx, 1)} px（二乗平均、${F.n} 枚）・中心 x ${f(F.C, 3)}（±${f(F.Csd, 3)}）・横と縦の尺度の比 ${f(F.xy, 4)}（1 なら画面の半分の幅 = H/2 × 画面比）`,
      `- 遠近: 60 単位手前の点の拡大率 ${f(F.near, 4)}・60 単位奥 ${f(F.far, 4)}${near && far ? '（どちらも 1: 遠近なし。重ね順は z だけで決まり、大きさは変わらない）' : ''}`, '',
      '### Studio の枠（10 % x 10 %・110 %）なら', '', '| 画面 | 画面の高さ H（Studio 176） | 中心 y（Studio 140） | 中心のずれ y（画面の高さの割合） | 1 単位 px |', '|---|---|---|---|---|',
      ...F.studio.map((x) => `| ${x.label} ${x.W}x${x.Hs} | **${f(x.H, 2)}**（${sgn(((x.H - 176) / 176) * 100, 1)} %） | **${f(x.cy, 2)}** | ${f((x.cy - 140) / x.H, 5)} | ${f(x.k, 4)} |`), '',
      `Studio が手で決めた中心のずれ: スマホ ${STUDIO.fix.mobile.join(' / ')}・PC ${STUDIO.fix.desktop.join(' / ')}（x / y、画面の高さの割合）。`, '');
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
