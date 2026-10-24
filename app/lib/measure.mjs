// measure: numbers read off a screenshot by the lab's own measuring code — a scenario's `measure <kind> <shot>`.
// They are the only things of a run's screen that may leave it unsealed (summary.json, the check of a public repository):
// each kind returns a fixed set of named numbers, nothing else (no picture, word or log line; why a measure failed stays
// in the sealed results). Read back the same way (cleanMeasures) wherever a summary is read.
//   geoui — the GeoUI calibration grid of bds/addons/geoui_calib (bds/geoui/calib.mjs): the screen's height in model units,
//           its centre and centre fix, px per unit, skew and depth — what GeoUI Studio's hand-set numbers are checked against
//   diff  — where the picture differs from the newest `shot world` (the baseline `changed` uses): the share that changed and
//           the boxes (px) of the changed parts, biggest first — where a UI was drawn, in numbers. Optionally only inside a box
//           of the game's screen (px): what else moves on the screen — a first-person hand, the chat — left out
//   color — the mean colour (0…255) inside a box of the game's screen, and the newest `shot world`'s in the same box when
//           there is one, with how even it is (the spread of the brightness): how see-through something drawn there is, in
//           numbers ((mean − world) / (opaque − world))
import { measureCode, cleanCode } from './failcodes.mjs';

const DIFF_PARTS = 8, DIFF_LEVEL = 48;
// marks: the colours a probe draws its marks in (bds/geoui/screen/device.mjs HUES: 11 hues 30° apart without 300°, then white,
// grey and black) — each changed pixel is put in the class of its colour, each class's box is where that mark is
export const MARK_HUES = [['red', 0], ['orange', 30], ['yellow', 60], ['chartreuse', 90], ['green', 120], ['spring', 150], ['cyan', 180], ['azure', 210], ['blue', 240], ['violet', 270], ['rose', 330]];
export const MARK_CLASSES = [...MARK_HUES.map(([n]) => n), 'white', 'gray', 'black'];
const MARK_FIELDS = ['x0', 'y0', 'x1', 'y1', 'n', 'r', 'g', 'b'];
/** a pixel's mark class (pure): a hue within 14° of one (saturated, not dark), else white / grey / black by its brightness, else null */
export function markClass(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max / 255, s = max ? (max - min) / max : 0;
  if (s >= 0.45 && v >= 0.25) {
    let h;
    if (max === r) h = (60 * ((g - b) / (max - min)) + 360) % 360; else if (max === g) h = 60 * ((b - r) / (max - min)) + 120; else h = 60 * ((r - g) / (max - min)) + 240;
    let best = null, bd = 99;
    for (const [n, c] of MARK_HUES) { const d = Math.min(Math.abs(h - c), 360 - Math.abs(h - c)); if (d < bd) { bd = d; best = n; } }
    return bd <= 14 ? best : null;
  }
  // (white drawn by a lit renderer can come out a little darker: down to 0.68 is still white)
  if (s < 0.25) return v >= 0.68 ? 'white' : v >= 0.3 && v < 0.62 ? 'gray' : v < 0.12 ? 'black' : null;
  return null;
}
export const KINDS = {
  marks: {
    fields: ['width', 'height', 'areaX', 'areaY', 'share', 'classes', ...MARK_CLASSES.flatMap((c) => MARK_FIELDS.map((f) => `${c}${f}`))],
    async run(img, { baseline, region } = {}) {
      if (!baseline) return { ok: false, why: '比べる `shot world` がありません（先に shot world: GeoUI の印を出す前の画面）' };
      const W = img.width, H = img.height, N = W * H, a = img.data, base = baseline.data;
      if (baseline.width !== W || baseline.height !== H) return { ok: false, why: `大きさが違います（基準 ${baseline.width}x${baseline.height}、この画面 ${W}x${H}）` };
      const R = region ? { x0: Math.max(0, region.x0), y0: Math.max(0, region.y0), x1: Math.min(W, region.x1), y1: Math.min(H, region.y1) } : { x0: 0, y0: 0, x1: W, y1: H };
      // each changed pixel's class (1 + its index), then 4-neighbour parts of one class; parts under 6 px are edges and noise
      const cls = new Int8Array(N);
      let changed = 0;
      for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
        const i = y * W + x, o = i * 4;
        if (Math.abs(a[o] - base[o]) + Math.abs(a[o + 1] - base[o + 1]) + Math.abs(a[o + 2] - base[o + 2]) <= DIFF_LEVEL) continue;
        changed++;
        const c = markClass(a[o], a[o + 1], a[o + 2]);
        if (c) cls[i] = MARK_CLASSES.indexOf(c) + 1;
      }
      const v = { width: W, height: H, share: changed / ((R.x1 - R.x0) * (R.y1 - R.y0)) }, boxes = {}, stack = [];
      for (let i = 0; i < N; i++) {
        const k = cls[i];
        if (k <= 0) continue;
        let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1, sr = 0, sg = 0, sb = 0;
        stack.push(i); cls[i] = -k;
        while (stack.length) {
          const j = stack.pop(), x = j % W, y = (j - x) / W, o = j * 4;
          n++; sr += a[o]; sg += a[o + 1]; sb += a[o + 2];
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (const q of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (q >= 0 && cls[q] === k) { cls[q] = -k; stack.push(q); }
        }
        if (n < 6) continue;
        const c = MARK_CLASSES[k - 1], bx = boxes[c] || (boxes[c] = { x0: W, y0: H, x1: -1, y1: -1, n: 0, r: 0, g: 0, b: 0 });
        bx.x0 = Math.min(bx.x0, x0); bx.y0 = Math.min(bx.y0, y0); bx.x1 = Math.max(bx.x1, x1 + 1); bx.y1 = Math.max(bx.y1, y1 + 1);
        bx.n += n; bx.r += sr; bx.g += sg; bx.b += sb;
      }
      v.classes = Object.keys(boxes).length;
      for (const [c, bx] of Object.entries(boxes)) Object.assign(v, { [`${c}x0`]: bx.x0, [`${c}y0`]: bx.y0, [`${c}x1`]: bx.x1, [`${c}y1`]: bx.y1, [`${c}n`]: bx.n, [`${c}r`]: bx.r / bx.n, [`${c}g`]: bx.g / bx.n, [`${c}b`]: bx.b / bx.n });
      return { ok: true, values: v };
    },
    line(v) {
      const parts = MARK_CLASSES.filter((c) => Number.isFinite(v[`${c}n`])).map((c) => `${c} (${v[`${c}x0`]}, ${v[`${c}y0`]})–(${v[`${c}x1`]}, ${v[`${c}y1`]}) ${v[`${c}n`]} px rgb(${[v[`${c}r`], v[`${c}g`], v[`${c}b`]].map((x) => Math.round(x)).join(', ')})`);
      return `印 ${v.classes ?? 0} 色・違い ${Number.isFinite(v.share) ? (v.share * 100).toFixed(3) : '?'}%${parts.length ? `・${parts.join(' / ')}` : ''}・${v.width ?? '?'}x${v.height ?? '?'}`;
    },
  },
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
  color: {
    fields: ['width', 'height', 'areaX', 'areaY', 'rx0', 'ry0', 'rx1', 'ry1', 'n', 'r', 'g', 'b', 'spread', 'br', 'bg', 'bb', 'bspread'],
    async run(img, { baseline, region } = {}) {
      if (!region) return { ok: false, why: '測る枠が要ります（measure color <shot の名前> <x0> <y0> <x1> <y1>）' };
      const W = img.width, H = img.height;
      if (baseline && (baseline.width !== W || baseline.height !== H)) return { ok: false, why: `大きさが違います（基準 ${baseline.width}x${baseline.height}、この画面 ${W}x${H}）` };
      const R = { x0: Math.max(0, region.x0), y0: Math.max(0, region.y0), x1: Math.min(W, region.x1), y1: Math.min(H, region.y1) };
      if (R.x1 <= R.x0 || R.y1 <= R.y0) return { ok: false, why: `測る枠が画面の外です（${W}x${H}）` };
      const mean = (d) => {
        let r = 0, g = 0, b = 0, l = 0, l2 = 0, n = 0;
        for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
          const o = (y * W + x) * 4, lum = 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
          r += d[o]; g += d[o + 1]; b += d[o + 2]; l += lum; l2 += lum * lum; n++;
        }
        return { n, r: r / n, g: g / n, b: b / n, spread: Math.sqrt(Math.max(0, l2 / n - (l / n) * (l / n))) };
      };
      const m = mean(img.data), v = { width: W, height: H, rx0: R.x0, ry0: R.y0, rx1: R.x1, ry1: R.y1, n: m.n, r: m.r, g: m.g, b: m.b, spread: m.spread };
      if (baseline) { const w = mean(baseline.data); Object.assign(v, { br: w.r, bg: w.g, bb: w.b, bspread: w.spread }); }
      return { ok: true, values: v };
    },
    line(v) {
      const c = (r, g, b) => (Number.isFinite(r) ? `(${r.toFixed(1)}, ${g.toFixed(1)}, ${b.toFixed(1)})` : '—');
      return `平均の色 ${c(v.r, v.g, v.b)}・むら ${Number.isFinite(v.spread) ? v.spread.toFixed(1) : '—'}・ワールド ${c(v.br, v.bg, v.bb)}・枠 (${v.rx0 ?? '?'}, ${v.ry0 ?? '?'})–(${v.rx1 ?? '?'}, ${v.ry1 ?? '?'}) ${v.n ?? '?'} px・${v.width ?? '?'}x${v.height ?? '?'}`;
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
// (how many measures a run's public summary keeps: a probe that reads 80 numbers lost the last half at 40 — run 40055307539)
const MAX = 160;
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
    // (when its shot was taken, seconds into the steps: a number in range, else none)
    const at = Number.isFinite(m.at) && m.at >= 0 && m.at < 86400 ? { at: Math.round(m.at * 10) / 10 } : {};
    return [{ kind: m.kind, shot: name(m.shot), line: Number.isFinite(m.line) ? m.line : null, ...at, ok: m.ok === true, values, ...(m.ok === true ? {} : { code: cleanCode(m.code) ?? measureCode(m.why) }) }];
  });
}

/** the measures as lines for a report or a check (`- 測った値 <shot>（<kind>、<n> 行目）: …`) */
export function measureLines(list, { why = false } = {}) {
  return (Array.isArray(list) ? list : []).map((m) => {
    const head = `- 測った値 ${m.shot ?? '?'}（${m.kind}${m.line ? `、${m.line} 行目` : ''}）`;
    if (!m.ok) return `${head}: ✘ 測れません${why && m.why ? `（${m.why}）` : m.code ? `（${m.code}）` : ''}`;
    // (when its shot was taken, at the end: seconds into the steps)
    return `${head}: ${KINDS[m.kind]?.line(m.values ?? {}) ?? JSON.stringify(m.values)}${Number.isFinite(m.at) ? `・${m.at} 秒に撮った` : ''}`;
  });
}
