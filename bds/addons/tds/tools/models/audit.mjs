// What our gear does to the vanilla body it is worn on, measured on the merged, posed model the game draws (sheet.py
// writes it: the vanilla cubes, and ours tagged "layer": "gear" with their names):
//   buried   - a gear cube whose visible surface is mostly inside another solid cube (vanilla or ours): drawn, never seen
//   clipped  - a gear cube partly inside one (it pokes into a body part or another piece instead of sitting on it)
//   zfight   - a gear face on a vanilla face's plane (the two layers flicker against each other: the lab's lint sees one
//              geometry at a time, so it never sees these)
//   face     - how much of the eyes' band of the vanilla head's front is seen straight ahead (1: nothing of ours before it)
// Solid = a closed box whose faces are opaque; a shell with holes hides nothing. Samples: a grid on every textured face,
// its alpha read from the texture (cut-out texels are not surface).
//
//   node tools/models/audit.mjs jobs.json > results.json   jobs: [{ "tag", "geo", "tex", "pose"?: {bone: {rotation, position}},
//                                                                   "anim"?: "<animation id in rp/animations>", "at"?: <s> }]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const { rotate, facePoint, faceUvs, poseAt } = await import(path.join(LAB, 'common/model.mjs'));
const { pngDecode } = await import(path.join(LAB, 'common/extra.mjs'));

const N = 6;                       // samples per face side
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a), scl = (a, k) => a.map((x) => x * k), add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const NORMAL = { north: [0, 0, -1], south: [0, 0, 1], east: [-1, 0, 0], west: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };

function lineage(bones, name) { const out = []; for (let b = bones.get(name); b; b = bones.get(b.parent)) out.push(b); return out; }
function place(p, cube, chain, pose) {
  if (cube.rotation && cube.rotation.some(Boolean)) p = rotate(p, cube.pivot ?? cube.origin.map((o, i) => o + cube.size[i] / 2), cube.rotation);
  for (const b of chain) {
    const bind = b.rotation ?? [0, 0, 0], ad = pose[b.name]?.rotation ?? [0, 0, 0], r = [0, 1, 2].map((i) => bind[i] + ad[i]);
    if (r.some(Boolean)) p = rotate(p, b.pivot ?? [0, 0, 0], r);
    const sh = pose[b.name]?.position;
    if (sh) p = [p[0] + sh[0], p[1] + sh[1], p[2] + sh[2]];
  }
  return p;
}

let ANIMS = null;
function animation(id) {
  if (!ANIMS) {
    ANIMS = {};
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../rp/animations');
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) Object.assign(ANIMS, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).animations ?? {});
  }
  return ANIMS[id];
}

function audit(job) {
  const geo = JSON.parse(fs.readFileSync(job.geo, 'utf8'))['minecraft:geometry'][0];
  const tex = pngDecode(fs.readFileSync(job.tex));
  const kx = tex.w / (geo.description.texture_width || tex.w), ky = tex.h / (geo.description.texture_height || tex.h);
  const an = job.anim ? animation(job.anim) : null;
  const pose = job.pose ?? (an ? poseAt(an, job.at ?? 0.3) : {});
  for (const b of Object.keys(pose)) if (!geo.bones.some((x) => x.name === b)) {                // bones match without case, as in the game
    const hit = geo.bones.find((x) => x.name.toLowerCase() === b.toLowerCase());
    if (hit) pose[hit.name] = pose[b];
  }
  const bones = new Map(geo.bones.map((b) => [b.name, b]));
  const cubes = [];
  for (const bone of geo.bones) {
    const chain = lineage(bones, bone.name);
    for (const c of bone.cubes ?? []) {
      const inf = c.inflate ?? 0, o = c.origin.map((x) => x - inf), s = c.size.map((x) => x + 2 * inf);
      const P = (q) => place(q, c, chain, pose);
      const p0 = P(o), ax = [P([o[0] + s[0], o[1], o[2]]), P([o[0], o[1] + s[1], o[2]]), P([o[0], o[1], o[2] + s[2]])].map((q) => sub(q, p0));
      const uvs = faceUvs(c), faces = [];
      let opaque = 0, all = 0;
      for (const [f, m] of Object.entries(uvs)) {
        if (!m || !m.uv_size || m.uv_size.includes(0)) continue;
        const nrm = sub(P(add(facePoint(o, s, f, 0.5, 0.5), NORMAL[f])), P(facePoint(o, s, f, 0.5, 0.5)));
        const pts = [];
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const u = (i + 0.5) / N, v = (j + 0.5) / N;
          const tu = (m.uv[0] + u * m.uv_size[0]) * kx, tv = (m.uv[1] + v * m.uv_size[1]) * ky;
          const tx = Math.min(tex.w - 1, Math.max(0, Math.floor(tu))), ty = Math.min(tex.h - 1, Math.max(0, Math.floor(tv)));
          const a = tex.data[(ty * tex.w + tx) * 4 + 3];
          all++;
          if (a < 128) continue;
          opaque++;
          pts.push(P(facePoint(o, s, f, u, v)));
        }
        faces.push({ f, nrm, pts, m, area: f === 'north' || f === 'south' ? s[0] * s[1] : f === 'east' || f === 'west' ? s[2] * s[1] : s[0] * s[2], p0: P(facePoint(o, s, f, 0, 0)),
                     eu: sub(P(facePoint(o, s, f, 1, 0)), P(facePoint(o, s, f, 0, 0))), ev: sub(P(facePoint(o, s, f, 0, 1)), P(facePoint(o, s, f, 0, 0))) });
      }
      const closed = faces.length === 6 && s.every((x) => x > 0.05);
      cubes.push({ bone: bone.name, name: c.name ?? `${bone.name}#${(bone.cubes ?? []).indexOf(c)}`, layer: c.layer ?? 'body', p0, ax, faces,
                   solid: closed && opaque === all, part: c.part });          // a box with any hole in it hides nothing
    }
  }
  const inside = (q, k, eps = 0.03) => {
    const d = sub(q, k.p0);
    for (const a of k.ax) { const L = len(a); if (L < 1e-6) return false; const t = dot(d, a) / L; if (t <= eps || t >= L - eps) return false; }
    return true;
  };
  const out = { tag: job.tag, buried: [], clipped: [], zfight: [], face: null };
  // a part is a group of cubes made as one shape (an octagonal prism's slabs, a ring's segments: the same name but its
  // number, on one bone); what hides a part is what is not the part itself
  const stem = (c) => `${c.bone}/${c.name.replace(/\d+$/, '')}`;
  const parts = new Map();
  for (const c of cubes) {
    if (c.layer !== 'gear') continue;
    const P = parts.get(stem(c)) ?? { n: 0, hid: 0, by: new Map(), vanilla: 0, area: 0, seen: 0 };
    parts.set(stem(c), P);
    for (const f of c.faces) for (const q of f.pts) {
      P.n++;
      P.area += f.area / (N * N);
      const q2 = add(q, scl(f.nrm, 0.02));
      const k = cubes.find((k) => k !== c && k.solid && stem(k) !== stem(c) && inside(q2, k));
      if (k) { P.hid++; P.by.set(k.name, (P.by.get(k.name) ?? 0) + 1); if (k.layer !== 'gear') P.vanilla++; }
      else P.seen += f.area / (N * N);
    }
  }
  for (const [name, P] of parts) {
    if (!P.n) continue;
    const frac = P.hid / P.n, who = [...P.by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
    if (/grip|_mag$|_guard$/.test(name)) continue;                           // in the fists that hold it, as it should be
    if ((P.seen < 1.5 && frac >= 0.5) || frac >= 0.97) out.buried.push([name, +frac.toFixed(2), who]);   // hardly a pixel of it is seen
    else if (frac >= 0.4 && P.vanilla >= 0.5 * P.hid) out.clipped.push([name, +frac.toFixed(2), who]);   // sunk into the body
  }
  for (const c of cubes) {
    if (c.layer !== 'gear') continue;
    // a gear face on the plane of a vanilla face it overlaps, facing the same way
    let zf = 0;
    const hits = new Set();
    for (const f of c.faces) {
      const nf = scl(f.nrm, 1 / (len(f.nrm) || 1));
      for (const k of cubes) {
        if (k.layer === 'gear') continue;
        for (const g of k.faces) {
          const ng = scl(g.nrm, 1 / (len(g.nrm) || 1));
          if (dot(nf, ng) < 0.999) continue;
          for (const q of f.pts) {
            const d = sub(q, g.p0);
            if (Math.abs(dot(d, ng)) > 0.05) continue;
            const lu = len(g.eu), lv = len(g.ev), tu = dot(d, g.eu) / (lu * lu), tv = dot(d, g.ev) / (lv * lv);
            if (!(tu > 0 && tu < 1 && tv > 0 && tv < 1)) continue;
            const ix = Math.min(tex.w - 1, Math.max(0, Math.floor((g.m.uv[0] + tu * g.m.uv_size[0]) * kx)));   // a cut-out texel of
            const iy = Math.min(tex.h - 1, Math.max(0, Math.floor((g.m.uv[1] + tv * g.m.uv_size[1]) * ky)));   // the body is no face
            if (tex.data[(iy * tex.w + ix) * 4 + 3] < 128) continue;
            zf++; hits.add(k.name);
          }
        }
      }
    }
    if (zf >= 2) out.zfight.push([c.name, zf, [...hits].slice(0, 2)]);
  }
  // the eyes: the band of the head's front where the eyes are, as seen straight ahead: what of ours is in front of it
  // (any opaque texel of a face of ours that the ray from the eye meets)
  const gearFaces = cubes.filter((k) => k.layer === 'gear').flatMap((k) => k.faces);
  const blocked = (q, d) => gearFaces.some((g) => {
    const n = [g.eu[1] * g.ev[2] - g.eu[2] * g.ev[1], g.eu[2] * g.ev[0] - g.eu[0] * g.ev[2], g.eu[0] * g.ev[1] - g.eu[1] * g.ev[0]];
    const den = dot(d, n);
    if (Math.abs(den) < 1e-9) return false;
    const t = dot(sub(g.p0, q), n) / den;
    if (t <= 0.02 || t > 24) return false;
    const h = add(q, scl(d, t)), r = sub(h, g.p0), lu = len(g.eu), lv = len(g.ev);
    const tu = dot(r, g.eu) / (lu * lu), tv = dot(r, g.ev) / (lv * lv);
    if (tu < 0 || tu > 1 || tv < 0 || tv > 1) return false;
    const ix = Math.min(tex.w - 1, Math.max(0, Math.floor((g.m.uv[0] + tu * g.m.uv_size[0]) * kx)));
    const iy = Math.min(tex.h - 1, Math.max(0, Math.floor((g.m.uv[1] + tv * g.m.uv_size[1]) * ky)));
    return tex.data[(iy * tex.w + ix) * 4 + 3] >= 128;
  });
  let fn = 0, fv = 0;
  for (const h of cubes.filter((k) => k.layer !== 'gear' && /^head$/i.test(k.bone))) {
    const f = h.faces.find((x) => x.f === 'north');
    if (!f) continue;
    const d = scl(f.nrm, 1 / (len(f.nrm) || 1));
    for (let i = 0; i < 8; i++) for (const v of [0.53, 0.6]) {      // row 4 of 8 (the eyes of Steve, Alex, a zombie)
      const q = add(add(f.p0, scl(f.eu, (i + 0.5) / 8)), scl(f.ev, v));
      fn++;
      if (!blocked(add(q, scl(d, 0.01)), d)) fv++;
    }
    break;
  }
  out.face = fn ? +(fv / fn).toFixed(2) : null;
  return out;
}

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const res = jobs.map((j) => { try { return audit(j); } catch (e) { return { tag: j.tag, error: String(e.stack ?? e) }; } });
process.stdout.write(JSON.stringify(res, null, 1));
