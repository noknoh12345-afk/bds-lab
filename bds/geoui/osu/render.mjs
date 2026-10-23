#!/usr/bin/env node
// A GeoUI design and its timeline drawn without the game: every bone's cubes, posed by the timeline's values at a time (the
// editor's preview: model.evaluate — the export's Molang is proven equal to it frame by frame, tests/tl-anim-offline.mjs), each
// face's pixels from the atlas (nearest, as the game's Point filter), cut out / blended / added as its element's material, seen
// from the front without perspective (the HUD's paper doll), on a flat Minecraft-ish world. For looking at a sample before the
// real app (bds-lab's app.yml) does, and for a preview video with its music and hitsounds (ffmpeg). Not the game: the real app
// is what says how the game draws it (要実測).
//   import { renderFrame, renderVideo } from './render.mjs'
//   node bds/geoui/osu/render.mjs <pixel|skin> [--at 30.5 ...] [--video out.mp4 [--from s] [--to s]] [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../png.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const M = require('../timeline/model.js');
require('../timeline/contract.js');

// (the screen in model units, by bds-lab's measure of GeoUI on a phone: 170.68 high, its middle at y 135.04)
export const SCREEN = { cy: 135.04, h: 170.68 };

const mat = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c]; return o; },
  t: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1],
  s: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  rx(d) { const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; },
  ry(d) { const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; },
  rz(d) { const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  ap: (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]],
};

/** the world behind (a sky, the flat world's grass far below): RGBA bytes w × h */
function backdrop(w, h) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = y / h, g = f > 0.78;
    const c = g ? [86 + ((y * 7) % 9), 146 + ((y * 5) % 11), 60] : [120 + 60 * f, 166 + 50 * f, 255];
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
  }
  return d;
}

/** a frame: design (bones, elements, textures.atlas.image), doc, t (s), ctx { events, state, w, h, aspect } → { width, height, data } */
export function renderFrame(design, doc, t, ctx = {}) {
  const W = ctx.w || 1280, H = ctx.h || 720, aspect = W / H, ppu = H / SCREEN.h, halfW = (SCREEN.h * aspect) / 2;
  const tex = design.textures.atlas.image, TW = tex.width, TH = tex.height;
  const seq = doc.sequences[0], st = M.evaluate(doc, seq.id, t, { events: ctx.events || [], state: ctx.state || {} });
  const bones = design.bones, byName = new Map(bones.map((b) => [b.name, b])), kids = new Map();
  for (const b of bones) if (b.parent) { if (!kids.has(b.parent)) kids.set(b.parent, []); kids.get(b.parent).push(b); }
  const els = design.elements || {};
  // (elements a template moves: shown only as their instances; those a track moves: only while a clip has them)
  const protos = new Set(), tracked = new Set();
  for (const tp of seq.templates || []) for (const tr of tp.tracks) if (tr.target) protos.add(tr.target);
  for (const tr of seq.tracks) if (tr.kind === 'layer' && tr.target && tr.clips.length) tracked.add(tr.target);
  const ref = (() => { const s = ((design.settings || {}).refAspect) || 16 / 9; return (SCREEN.h * s) / 2; })();
  const quads = [];
  const ST = ctx.state || {};
  /** a bone and its children drawn with a matrix; the state (the timeline's, or an instance's) of the elements on the way */
  function walk(b, parentM, own, inherit, inst = false) {
    const el = els[b.name] || {};
    let s = own && own[b.name];
    if (el.visible && /_seq > 0/.test(el.visible) && !(ctx.playing !== false)) return;
    if (!s && protos.has(b.name) && !inst) return;
    if (!s && tracked.has(b.name)) s = st[b.name] || { visible: false };
    if (s && s.visible === false) return;
    const pv = b.pivot || [0, 0, 0];
    let m = parentM;
    // (an anchored element follows the screen's edge: GeoUI's transform)
    const anchorX = /right/.test(el.anchor || '') ? halfW - ref : /left/.test(el.anchor || '') ? -(halfW - ref) : 0;
    let sx = 1, sy = 1;
    if (el.type === 'gauge') { const g = el.gauge || {}; let f = s && s.fill !== undefined ? s.fill : /:v3/.test(g.source || '') ? (ST.hp ?? 100) / (g.max || 100) : /:v0/.test(g.source || '') ? (ST.score || 0) / (g.max || 100) : 0; f = Math.max(0, Math.min(1, f)); if (/top|bottom/.test(g.fill || '')) sy = f; else sx = f; }
    if (s || anchorX || sx !== 1 || sy !== 1) {
      const x = (s ? s.x || 0 : 0) + anchorX, y = s ? s.y || 0 : 0, rz = s ? s.rotation || 0 : 0, rxx = s ? s.rotationX || 0 : 0, ryy = s ? s.rotationY || 0 : 0;
      const scx = (s ? s.scaleX ?? 1 : 1) * sx, scy = (s ? s.scaleY ?? 1 : 1) * sy;
      // (T(pivot + position) R S T(−pivot): GeoUI Builder's pose; a positive turn is clockwise on the screen — bds-lab's probe)
      m = mat.mul(m, mat.mul(mat.t(pv[0] + x, pv[1] + y, pv[2]), mat.mul(mat.rx(-rxx), mat.mul(mat.ry(-ryy), mat.mul(mat.rz(-rz), mat.mul(mat.s(scx, scy, 1), mat.t(-pv[0], -pv[1], -pv[2])))))));
    }
    // numbers: the numerals of the value (GeoUI's digits: the leading zeros blank unless kept)
    let showNum = null;
    if (el.type === 'number' && el.number && s && s.value !== undefined) {
      const D = el.number.digits, v = Math.abs(Math.floor(s.value)), hide = el.number.hideLeadingZero !== false;
      showNum = new Set();
      D.forEach((numerals, k) => { const place = 10 ** (D.length - 1 - k), d = Math.floor(v / place) % 10; if (!(hide && place > 1 && v < place)) showNum.add(numerals[d]); });
    }
    const opacity = s && s.opacity !== undefined ? s.opacity : 1, frame = s && s.frame !== undefined ? Math.floor(s.frame) : 0, fb = el.frames;
    const du = fb ? (frame % fb.cols) * (fb.step ? fb.step[0] : 0) : 0, dv = fb ? Math.floor(frame / fb.cols) * (fb.step ? fb.step[1] : 0) : 0;
    const blend = el.blend || inherit?.blend || 'cutout', alpha = opacity * (inherit?.alpha ?? 1);
    for (const c of b.cubes || []) {
      const [x0, y0, z0] = c.origin, [w, h, d] = c.size, x1 = x0 + w, y1 = y0 + h, z1 = z0 + d;
      const P = (x, y, z) => mat.ap(m, [x, y, z]);
      const face = (name, a, bb, cc, dd) => { const f = c.faces && c.faces[name]; if (!f) return; quads.push({ p: [P(...a), P(...bb), P(...cc), P(...dd)], uv: [f.uv[0] + du, f.uv[1] + dv, f.uv_size[0], f.uv_size[1]], blend, alpha, z: (z0 + z1) / 2 }); };
      face('north', [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]);
      if (d > 0) {
        face('east', [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]);
        face('west', [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [x0, y0, z1]);
        face('up', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
        face('down', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      }
    }
    for (const k of kids.get(b.name) || []) {
      if (showNum && el.type === 'number' && !showNum.has(k.name) && !(kids.get(k.name) || []).some((g) => showNum.has(g.name))) continue;
      walk(k, m, own, { blend, alpha }, inst);
    }
  }
  const root = bones.find((b) => !b.parent);
  walk(root, mat.id(), st, null);
  // the instances: each template element's state for an instance, drawn as a copy of the element
  for (const [key, s] of Object.entries(st)) {
    const i = key.indexOf('#');
    if (i < 0 || s.visible === false) continue;
    const b = byName.get(key.slice(0, i));
    if (!b) continue;
    // (its parents' pose: the playfield's shake, lean and pulse)
    const chain = []; for (let p = byName.get(b.parent); p; p = byName.get(p.parent)) chain.unshift(p);
    let m = mat.id();
    for (const p of chain) {
      const ps = st[p.name], pv = p.pivot || [0, 0, 0];
      if (ps && ps.visible !== false) m = mat.mul(m, mat.mul(mat.t(pv[0] + (ps.x || 0), pv[1] + (ps.y || 0), pv[2]), mat.mul(mat.rx(-(ps.rotationX || 0)), mat.mul(mat.ry(-(ps.rotationY || 0)), mat.mul(mat.rz(-(ps.rotation || 0)), mat.mul(mat.s(ps.scaleX ?? 1, ps.scaleY ?? 1, 1), mat.t(-pv[0], -pv[1], -pv[2])))))));
    }
    walk(b, m, { [b.name]: s }, { blend: (els[b.name] || {}).blend, alpha: 1 }, true);
  }
  // ---- raster: cut-out first (depth buffer), then blended back to front
  const out = backdrop(W, H), zb = new Float32Array(W * H).fill(Infinity);
  const toS = (p) => [(p[0] + halfW) * ppu, (SCREEN.cy + SCREEN.h / 2 - p[1]) * ppu, p[2]];
  const texel = (u, v) => { const x = Math.min(TW - 1, Math.max(0, Math.floor(u))), y = Math.min(TH - 1, Math.max(0, Math.floor(v))), o = (y * TW + x) * 4; return [tex.data[o], tex.data[o + 1], tex.data[o + 2], tex.data[o + 3]]; };
  function tri(a, b, c, ua, ub, uc, q) {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      let w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area, w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2], i = y * W + x;
      if (z >= zb[i]) continue;
      const col = texel(w0 * ua[0] + w1 * ub[0] + w2 * uc[0], w0 * ua[1] + w1 * ub[1] + w2 * uc[1]);
      const al = (col[3] / 255) * q.alpha;
      if (q.blend === 'cutout') { if (al < 0.5) continue; zb[i] = z; out[i * 4] = col[0]; out[i * 4 + 1] = col[1]; out[i * 4 + 2] = col[2]; continue; }
      if (al <= 0.004) continue;
      const o = i * 4;
      if (q.blend === 'add') for (let k = 0; k < 3; k++) out[o + k] = Math.min(255, out[o + k] + col[k] * al);
      else for (let k = 0; k < 3; k++) out[o + k] = Math.round(out[o + k] * (1 - al) + col[k] * al);
    }
  }
  const draw = (q) => {
    const s = q.p.map(toS), [u, v, uw, vh] = q.uv, U = [[u, v], [u + uw, v], [u + uw, v + vh], [u, v + vh]];
    tri(s[0], s[1], s[2], U[0], U[1], U[2], q); tri(s[0], s[2], s[3], U[0], U[2], U[3], q);
  };
  const cut = quads.filter((q) => q.blend === 'cutout'), soft = quads.filter((q) => q.blend !== 'cutout');
  for (const q of cut) draw(q);
  soft.sort((a, b) => Math.max(...b.p.map((p) => p[2])) - Math.max(...a.p.map((p) => p[2])));
  for (const q of soft) draw(q);
  return { width: W, height: H, data: out };
}

/** a whole play as a video (mp4: H.264 + AAC) with its music and the autoplay's hitsounds — ffmpeg reads the frames as they are
 *  drawn. o: { design, doc, play (osugame.autoplay's), from, to, fps, w, h, music (a file), sounds: { id: file }, hits: [[id, s]] } */
export async function renderVideo(file, o) {
  const fps = o.fps || 30, from = o.from || 0, to = o.to ?? o.doc.sequences[0].duration, W = o.w || 1280, H = o.h || 720;
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'osu-video-')), mix = path.join(tmp, 'mix.wav');
  // the sound: the music from `from`, each hitsound mixed in at its time (ffmpeg decodes; the mix is summed here)
  const decode = (f) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-ar', '44100', '-'], { maxBuffer: 1 << 30 }); if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`); return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4); };
  const n = Math.ceil((to - from) * 44100) * 2, buf = new Float32Array(n);
  if (o.music) { const m = decode(o.music), off = Math.round(from * 44100) * 2; for (let i = 0; i < n && off + i < m.length; i++) buf[i] += m[off + i] * 0.8; }
  const cache = {};
  for (const [id, at] of o.hits || []) {
    const f = (o.sounds || {})[id];
    if (!f || at < from || at >= to) continue;
    const s = (cache[id] ||= decode(f)), i0 = Math.round((at - from) * 44100) * 2;
    for (let i = 0; i < s.length && i0 + i < n; i++) buf[i0 + i] += s[i] * 0.55;
  }
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(44100, 24); pcm.writeUInt32LE(44100 * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(Math.tanh(buf[i]) * 32767))), 44 + i * 2);
  fs.writeFileSync(mix, pcm);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-', '-i', mix, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  const total = Math.ceil((to - from) * fps);
  for (let k = 0; k < total; k++) {
    const t = from + k / fps, ap = o.play, frame = renderFrame(o.design, o.doc, t, { w: W, h: H, events: ap ? ap.events : [], state: ap ? ap.at(t) : {} });
    if (!ff.stdin.write(Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.length))) await new Promise((r) => ff.stdin.once('drain', r));
    if (o.onFrame) o.onFrame(k, total);
  }
  ff.stdin.end();
  await done;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { frames: total, seconds: to - from };
}

export { encodePng };
