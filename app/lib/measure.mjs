// measure: numbers read off a screenshot by the lab's own measuring code — a scenario's `measure <kind> <shot>`.
// They are the only things of a run's screen that may leave it unsealed (summary.json, the check of a public repository):
// each kind returns a fixed set of named numbers, nothing else (no picture, word or log line; why a measure failed stays
// in the sealed results). Read back the same way (cleanMeasures) wherever a summary is read.
//   geoui — the GeoUI calibration grid of bds/addons/geoui_calib (bds/geoui/calib.mjs): the screen's height in model units,
//           its centre and centre fix, px per unit, skew and depth — what GeoUI Studio's hand-set numbers are checked against
//   diff  — where the picture differs from the newest `shot world` (the baseline `changed` uses): the share that changed and
//           the boxes (px) of the changed parts, biggest first — where a UI was drawn, in numbers. Optionally only inside a box
//           of the game's screen (px): what else moves on the screen — a first-person hand, the chat — left out
import { measureCode, cleanCode } from './failcodes.mjs';

const DIFF_PARTS = 8, DIFF_LEVEL = 48;
export const KINDS = {
  diff: {
    fields: ['width', 'height', 'areaX', 'areaY', 'share', 'parts', 'x0', 'y0', 'x1', 'y1', 'rx0', 'ry0', 'rx1', 'ry1',
      ...Array.from({ length: DIFF_PARTS }, (_, k) => ['x0', 'y0', 'x1', 'y1', 'n'].map((f) => `b${k + 1}${f}`)).flat()],
    async run(img, { baseline, region } = {}) {
      if (!baseline) return { ok: false, why: '比べる `shot world` がありません（先に shot world か shot world--<名前>）' };
      const W = img.width, H = img.height, N = W * H, a = img.data, b = baseline.data;
      if (baseline.width !== W || baseline.height !== H) return { ok: false, why: `大きさが違います（基準 ${baseline.width}x${baseline.height}、この画面 ${W}x${H}）` };
      // (a box of the screen: only the pixels in it count — the share is of the box)
      const R = region ? { x0: Math.max(0, region.x0), y0: Math.max(0, region.y0), x1: Math.min(W, region.x1), y1: Math.min(H, region.y1) } : { x0: 0, y0: 0, x1: W, y1: H };
      if (R.x1 <= R.x0 || R.y1 <= R.y0) return { ok: false, why: `測る枠が画面の外です（${W}x${H}）` };
      const on = new Uint8Array(N);
      let changed = 0;
      for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) { const i = y * W + x, o = i * 4; if (Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]) > DIFF_LEVEL) { on[i] = 1; changed++; } }
      // the changed parts (4-neighbour); specks smaller than a 1/200000 of the picture (at least 4 px) are noise
      const min = Math.max(4, Math.round(N / 200_000)), parts = [], stack = [];
      for (let i = 0; i < N; i++) {
        if (on[i] !== 1) continue;
        let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
        stack.push(i); on[i] = 2;
        while (stack.length) {
          const j = stack.pop(), x = j % W, y = (j - x) / W;
          n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x > 0 && on[j - 1] === 1) { on[j - 1] = 2; stack.push(j - 1); }
          if (x < W - 1 && on[j + 1] === 1) { on[j + 1] = 2; stack.push(j + 1); }
          if (y > 0 && on[j - W] === 1) { on[j - W] = 2; stack.push(j - W); }
          if (y < H - 1 && on[j + W] === 1) { on[j + W] = 2; stack.push(j + W); }
        }
        if (n >= min) parts.push({ n, x0, y0, x1: x1 + 1, y1: y1 + 1 });
      }
      parts.sort((p, q) => q.n - p.n);
      const v = { width: W, height: H, share: changed / ((R.x1 - R.x0) * (R.y1 - R.y0)), parts: parts.length, ...(region ? { rx0: R.x0, ry0: R.y0, rx1: R.x1, ry1: R.y1 } : {}) };
      if (parts.length) Object.assign(v, { x0: Math.min(...parts.map((p) => p.x0)), y0: Math.min(...parts.map((p) => p.y0)), x1: Math.max(...parts.map((p) => p.x1)), y1: Math.max(...parts.map((p) => p.y1)) });
      parts.slice(0, DIFF_PARTS).forEach((p, k) => { for (const f of ['x0', 'y0', 'x1', 'y1', 'n']) v[`b${k + 1}${f}`] = p[f]; });
      return { ok: true, values: v };
    },
    line(v) {
      const box = (p) => (Number.isFinite(v[`${p}x0`]) ? `(${v[`${p}x0`]}, ${v[`${p}y0`]})–(${v[`${p}x1`]}, ${v[`${p}y1`]})` : '—');
      const parts = Array.from({ length: DIFF_PARTS }, (_, k) => `b${k + 1}`).filter((p) => Number.isFinite(v[`${p}n`])).map((p) => `${box(p)} ${v[`${p}n`]} px`);
      return `違い ${Number.isFinite(v.share) ? (v.share * 100).toFixed(3) : '?'}%・${v.parts ?? 0} か所・全体 ${box('')}${parts.length ? `・大きい順 ${parts.join(' / ')}` : ''}・${v.width ?? '?'}x${v.height ?? '?'}`;
    },
  },
  geoui: {
    fields: ['width', 'height', 'areaX', 'areaY', 'matched', 'dropped', 'anchors', 'colourAgreement', 'rmsPx', 'unitsPerScreenH', 'unitsPerScreenHFromX',
      'centreX', 'centreY', 'centreFixX', 'centreFixY', 'pxPerUnitX', 'pxPerUnitY', 'skewXFromY', 'skewYFromX', 'depthNear', 'depthNearN', 'depthFar', 'depthFarN'],
    async run(img) {
      const { measure } = await import('../../bds/geoui/calib.mjs');
      const r = measure(img);
      if (!r.ok) return { ok: false, why: r.why };
      return { ok: true, values: { width: r.width, height: r.height, matched: r.matched, dropped: r.dropped, anchors: r.anchors, colourAgreement: r.colourAgreement,
        rmsPx: r.rmsPx, unitsPerScreenH: r.unitsPerScreenH, unitsPerScreenHFromX: r.unitsPerScreenHFromX, centreX: r.centre.x, centreY: r.centre.y,
        centreFixX: r.centreFix.x, centreFixY: r.centreFix.y, pxPerUnitX: r.pxPerUnit.x, pxPerUnitY: r.pxPerUnit.y, skewXFromY: r.skew.xFromY, skewYFromX: r.skew.yFromX,
        depthNear: r.depth.near?.ratio, depthNearN: r.depth.near?.n, depthFar: r.depth.far?.ratio, depthFarN: r.depth.far?.n } };
    },
    /** one line for a person (values as cleanMeasures left them) */
    line(v) {
      const f = (x, n) => (Number.isFinite(x) ? x.toFixed(n) : '—'), dep = (r, n) => (Number.isFinite(r) ? `${r.toFixed(4)}（${n ?? '?'}）` : '—');
      return `画面の高さ ${f(v.unitsPerScreenH, 3)} 単位（横から ${f(v.unitsPerScreenHFromX, 3)}）・中心 (${f(v.centreX, 3)}, ${f(v.centreY, 3)})・中心のずれ x ${f(v.centreFixX, 5)} / y ${f(v.centreFixY, 5)}`
        + `・1 単位 ${f(v.pxPerUnitX, 4)} x ${f(v.pxPerUnitY, 4)} px・目盛り ${v.matched ?? '?'} 個・ずれ ${f(v.rmsPx, 2)} px・奥行き 手前 ${dep(v.depthNear, v.depthNearN)} / 奥 ${dep(v.depthFar, v.depthFarN)}・${v.width ?? '?'}x${v.height ?? '?'}`;
    },
  },
};
export const KIND_NAMES = Object.keys(KINDS);
const MAX = 40;
const name = (s) => (typeof s === 'string' && /^[\w.-]{1,40}$/.test(s) ? s : null);
// (6 decimals: a centre fix is a few thousandths; a px count stays whole)
const round = (v) => Math.round(v * 1e6) / 1e6;

/** img (and opts.baseline, for diff): { width, height, data (RGBA) } → { ok, values } | { ok: false, why }.
 *  opts.area: where img was cut from a bigger picture (the game's screen after `size`): its corner as areaX / areaY */
export async function measureShot(kind, img, opts = {}) {
  const k = KINDS[kind];
  if (!k) return { ok: false, why: `知らない測り方 ${kind}（${KIND_NAMES.join(' ')}）` };
  try {
    const r = await k.run(img, opts);
    if (!r.ok) return { ok: false, why: String(r.why ?? '測れません') };
    const raw = { ...r.values, ...(opts.area ? { areaX: opts.area.x, areaY: opts.area.y } : {}) }, values = {};
    for (const f of k.fields) if (Number.isFinite(raw[f])) values[f] = round(raw[f]);
    return { ok: true, values };
  } catch (e) { return { ok: false, why: `測る途中で止まりました: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}` }; }
}

/** what may go into a public summary: known kinds, their own fields, numbers only (a shot's name as a plain word) */
export function cleanMeasures(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX).flatMap((m) => {
    const k = KINDS[m?.kind];
    if (!k) return [];
    const values = {};
    if (m.ok === true && m.values && typeof m.values === 'object') for (const f of k.fields) if (Number.isFinite(m.values[f])) values[f] = round(m.values[f]);
    // (why it could not measure stays sealed: its code — failcodes.mjs, a word and counts — goes out)
    return [{ kind: m.kind, shot: name(m.shot), line: Number.isFinite(m.line) ? m.line : null, ok: m.ok === true, values, ...(m.ok === true ? {} : { code: cleanCode(m.code) ?? measureCode(m.why) }) }];
  });
}

/** the measures as lines for a report or a check (`- 測った値 <shot>（<kind>、<n> 行目）: …`) */
export function measureLines(list, { why = false } = {}) {
  return (Array.isArray(list) ? list : []).map((m) => {
    const head = `- 測った値 ${m.shot ?? '?'}（${m.kind}${m.line ? `、${m.line} 行目` : ''}）`;
    if (!m.ok) return `${head}: ✘ 測れません${why && m.why ? `（${m.why}）` : m.code ? `（${m.code}）` : ''}`;
    return `${head}: ${KINDS[m.kind]?.line(m.values ?? {}) ?? JSON.stringify(m.values)}`;
  });
}
